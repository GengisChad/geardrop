"""GEAR//DROP - asset derivation pipeline.

The brief supplied 7 page mockups + 3 logo files and referenced /public/reference and
/public/products, which did not exist. No standalone product photography was provided,
so the product shots are cut out of the mockups themselves - the only supplied source.

This script is the provenance record for every binary in /public. Run:

    python scripts/build-assets.py

Pipeline per product: crop a zone -> adaptive flood-fill the backdrop to alpha
(backdrops differ per mockup and are gradients, so the fill follows smooth luminance
change and halts at hard product edges) -> label connected components -> drop UI chrome
(badge pills, heart icons, captions) by exclusion zone + size -> mask by real component
pixels -> trim.

Product pixels are only ever cropped. Never recoloured, reshaped, or retouched.
"""

from __future__ import annotations

import shutil
from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "assets-source"
PUB = ROOT / "public"

SAT = lambda r, g, b: max(r, g, b) - min(r, g, b)  # noqa: E731

# Supplied mockups -> stable reference names.
MOCKUPS = {
    "2": "home-lower",
    "3": "catalog-desktop",
    "4": "pdp-stadium-desktop",
    "5": "design-system",
    "6": "home-upper",
    "7": "catalog-mobile",
    "8": "pdp-cobalt-mobile",
}
LOGOS = {
    "1": "lockup",  # emblem + wordmark
    "2": "emblem",  # emblem only
    "3": "wordmark",  # wordmark only
}


def src_mockup(key: str) -> Path:
    return RAW / f"mockup-{MOCKUPS[key]}.png"


def flood_bg(im: Image.Image, tol: int = 7, floor: int = 196) -> Image.Image:
    """Adaptive background fill from the border.

    `ref` is carried per-pixel, so a smooth backdrop gradient is followed while a hard
    product edge exceeds `tol` in a single step and stops the walk. This also consumes
    the soft drop shadows, which is what lets the cut-outs sit on dark surfaces.
    """
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    seen = bytearray(w * h)
    q: deque = deque()

    def seed(x: int, y: int) -> None:
        r, g, b, _ = px[x, y]
        if r > 215 and g > 215 and b > 215 and SAT(r, g, b) < 18 and not seen[y * w + x]:
            seen[y * w + x] = 1
            q.append((x, y, (r, g, b)))

    for x in range(w):
        seed(x, 0)
        seed(x, h - 1)
    for y in range(h):
        seed(0, y)
        seed(w - 1, y)

    while q:
        x, y, ref = q.popleft()
        px[x, y] = (255, 255, 255, 0)
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if not (0 <= nx < w and 0 <= ny < h):
                continue
            i = ny * w + nx
            if seen[i]:
                continue
            r, g, b, _ = px[nx, ny]
            if (
                abs(r - ref[0]) < tol
                and abs(g - ref[1]) < tol
                and abs(b - ref[2]) < tol
                and r > floor
                and g > floor
                and b > floor
                and SAT(r, g, b) < 26
            ):
                seen[i] = 1
                q.append((nx, ny, (r, g, b)))
    return im


def components(im: Image.Image) -> list[dict]:
    w, h = im.size
    px = im.load()
    lab = bytearray(w * h)
    out: list[dict] = []
    for sy in range(h):
        for sx in range(w):
            if lab[sy * w + sx] or px[sx, sy][3] < 24:
                continue
            q = deque([(sx, sy)])
            lab[sy * w + sx] = 1
            pix: list[tuple[int, int]] = []
            x0 = x1 = sx
            y0 = y1 = sy
            while q:
                x, y = q.popleft()
                pix.append((x, y))
                x0, x1 = min(x0, x), max(x1, x)
                y0, y1 = min(y0, y), max(y1, y)
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and not lab[ny * w + nx] and px[nx, ny][3] >= 24:
                        lab[ny * w + nx] = 1
                        q.append((nx, ny))
            out.append({"bbox": (x0, y0, x1 + 1, y1 + 1), "pix": pix, "n": len(pix)})
    return out


def centre_inside(c: dict, rects) -> bool:
    x0, y0, x1, y1 = c["bbox"]
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    return any(rx0 <= cx <= rx1 and ry0 <= cy <= ry1 for rx0, ry0, rx1, ry1 in rects)


def scrub(im: Image.Image, rects) -> Image.Image:
    """Paint UI chrome out with the local backdrop colour before the fill runs.

    Used where a badge overlaps the product's own bounding box and so cannot be removed
    by component filtering alone. Only ever applied to chrome, never over product.
    """
    if not rects:
        return im
    im = im.copy()
    w = im.width
    border = [im.getpixel((x, 2)) for x in range(0, w, 7)]
    border.sort(key=lambda p: -(p[0] + p[1] + p[2]))
    fill = border[len(border) // 4]  # a bright, representative backdrop sample
    for r in rects:
        im.paste(fill, r)
    return im


def extract(mk: str, box, excl=(), min_area: int = 500, pad: int = 8, scrub_rects=()) -> Image.Image:
    im = Image.open(src_mockup(mk)).convert("RGB").crop(box)
    im = flood_bg(scrub(im, scrub_rects))
    comps = [c for c in components(im) if c["n"] >= min_area and not centre_inside(c, excl)]
    if not comps:
        raise SystemExit(f"no product component found in mockup {mk} {box}")
    big = max(c["n"] for c in comps)
    keep = [c for c in comps if c["n"] >= big * 0.02]
    mask = Image.new("L", im.size, 0)
    mp = mask.load()
    for c in keep:
        for x, y in c["pix"]:
            mp[x, y] = 255
    cleaned = Image.new("RGBA", im.size, (255, 255, 255, 0))
    cleaned.paste(im, (0, 0), mask)
    x0 = min(c["bbox"][0] for c in keep)
    y0 = min(c["bbox"][1] for c in keep)
    x1 = max(c["bbox"][2] for c in keep)
    y1 = max(c["bbox"][3] for c in keep)
    return cleaned.crop(
        (max(0, x0 - pad), max(0, y0 - pad), min(im.width, x1 + pad), min(im.height, y1 + pad))
    )


def m7_chrome(zone) -> list[tuple[int, int, int, int]]:
    """Mockup 7 cards: type badge top-left, wishlist heart top-right."""
    w = zone[2] - zone[0]
    return [(0, 0, 200, 42), (w - 70, 0, w, 60)]


# slug -> (mockup, zone, exclusion rects, min component area, scrub rects)
PRODUCTS: dict[str, tuple] = {
    "stadio-beystadium-x-attack-set-1": ("4", (95, 190, 625, 662), [], 900, ()),
    "cobalt-dragoon-2-60c-1": ("8", (46, 192, 492, 672), [], 900, [(0, 0, 120, 44)]),
    "cobalt-dragoon-2-60c-2": ("7", (32, 862, 458, 1040), m7_chrome((32, 862, 458, 1040)), 500, ()),
    "wizard-arrow-4-80b-1": ("7", (478, 500, 905, 698), m7_chrome((478, 500, 905, 698)), 500, ()),
    "phoenix-wing-9-60gf-1": ("7", (478, 862, 905, 1040), m7_chrome((478, 862, 905, 1040)), 500, ()),
    "shark-edge-3-60lf-1": ("7", (32, 1200, 458, 1356), m7_chrome((32, 1200, 458, 1356)), 500, ()),
    "dran-sword-4-80db-1": ("7", (478, 1200, 905, 1356), m7_chrome((478, 1200, 905, 1356)), 500, ()),
    "dran-buster-1-60a-1": ("3", (692, 848, 872, 1016), [(112, 0, 180, 62)], 400, ()),
    "sneak-attack-battle-set-1": ("3", (888, 848, 1068, 1016), [(112, 0, 180, 62)], 400, ()),
}

# Category tile art, lifted from the mockup 6 tiles. The Beyblade and Stadi tiles reuse
# the product cut-outs above, which are higher resolution than the tile art.
TILES: dict[str, tuple] = {
    "lanciatori": ("6", (345, 736, 472, 880), [], 400, ()),
    "accessori": ("6", (788, 736, 915, 880), [], 400, ()),
}


def trim(im: Image.Image, pad: int = 8) -> Image.Image:
    """Crop to the opaque bounds."""
    bb = im.getchannel("A").getbbox()
    if not bb:
        return im
    x0, y0, x1, y1 = bb
    return im.crop(
        (max(0, x0 - pad), max(0, y0 - pad), min(im.width, x1 + pad), min(im.height, y1 + pad))
    )


def cut_glow(im: Image.Image, floor: float = 0.05) -> Image.Image:
    """Cut an additive glow / VFX off its painted near-white checkerboard.

    The supplied hero VFX is emissive light (energy trails, sparks, debris) on the same
    fake-transparency checkerboard as the logos. Alpha is derived per pixel as
    1 - min(r,g,b)/255: flat near-white keys to ~0, the saturated beams and dark debris key
    to opaque, and the hot white core keys to transparent — which reads correctly as the
    brightest point once the effect sits on a light surface. A floor zeroes the checkerboard
    completely so no grey veil is left, and the feathered ramp means no hard edge or halo.
    """
    im = im.convert("RGB")
    w, h = im.size
    px = im.load()
    out = Image.new("RGBA", (w, h), (255, 255, 255, 0))
    op = out.load()
    denom = 1.0 - floor
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            a = (1.0 - min(r, g, b) / 255.0 - floor) / denom
            if a <= 0:
                continue
            op[x, y] = (r, g, b, 255 if a >= 1 else int(a * 255))

    # Crop to the region holding ~99% of the alpha *mass*, not the alpha bbox: stray
    # single sparks reach the canvas edges and would keep the huge empty margins, which
    # makes the effect render tiny when shown whole. Trimming by mass keeps every legible
    # trail and drops only outlier pixels; a generous pad keeps the composition airy.
    alpha = out.getchannel("A")
    ap = alpha.load()
    col_mass = [0] * w
    row_mass = [0] * h
    for y in range(h):
        for x in range(w):
            v = ap[x, y]
            if v:
                col_mass[x] += v
                row_mass[y] += v

    # 0.5% of the alpha mass per side. Load-bearing constant: it is the value the
    # committed public/hero/impact.png was cut with, and hero-impact.tsx declares the
    # resulting 1353x830 as the image's intrinsic size. Raising it re-crops the hero and
    # makes those width/height attributes lie. tests/unit/hero-asset.test.ts pins the
    # three together.
    def mass_bounds(mass: list[int], cut: float = 0.005) -> tuple[int, int]:
        total = sum(mass)
        lo_target, hi_target = total * cut, total * (1 - cut)
        acc = 0
        lo = 0
        hi = len(mass) - 1
        for i, v in enumerate(mass):
            acc += v
            if acc <= lo_target:
                lo = i
            if acc <= hi_target:
                hi = i
        return lo, hi

    x0, x1 = mass_bounds(col_mass)
    y0, y1 = mass_bounds(row_mass)
    pad_x = round((x1 - x0) * 0.06)
    pad_y = round((y1 - y0) * 0.06)
    return out.crop(
        (max(0, x0 - pad_x), max(0, y0 - pad_y), min(w, x1 + pad_x), min(h, y1 + pad_y))
    )


def save(im: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path)
    im.save(path.with_suffix(".webp"), quality=92, method=6)


def main() -> None:
    if not RAW.exists():
        raise SystemExit(f"missing {RAW} - the supplied mockups/logos must live there")

    # 1. reference mockups are kept verbatim for design reference only; never shipped as UI.
    (PUB / "reference").mkdir(parents=True, exist_ok=True)
    for key, name in MOCKUPS.items():
        shutil.copy(src_mockup(key), PUB / "reference" / f"{name}.png")

    # 2. brand assets.
    #
    # The supplied logo files have NO alpha channel: they are RGB with a fake
    # "transparency" checkerboard (#FEFEFE / #F7F7F7 squares) painted into the pixels.
    # Left as-is they render as a light box on any non-white surface. The checkerboard
    # is removed to give real transparency; the logo artwork itself is untouched — no
    # recolouring, no redrawing, no outline. (brief rules 2-5)
    for name in LOGOS.values():
        raw = Image.open(RAW / f"logo-{name}.png").convert("RGB")
        cut = trim(flood_bg(raw, tol=14, floor=234), pad=0)
        save(cut, PUB / "brand" / f"{name}.png")
        print(f"brand/{name:14s} {raw.size} -> {cut.size} (checkerboard removed)")

    # Favicon / app icon: the emblem on a light tile, which is exactly how the design
    # system draws it (sheet §01 "FAVICON / APP ICON"). A tile is also what makes this
    # safe: the supplied art has no alpha, so the enclosed counters keep the source's
    # near-white and would show as pale patches on a dark surface.
    emblem = Image.open(PUB / "brand" / "emblem.png").convert("RGBA")
    for px in (16, 32, 48, 180, 192, 512):
        tile = Image.new("RGBA", (px, px), (255, 255, 255, 255))
        art = emblem.copy()
        art.thumbnail((round(px * 0.84), round(px * 0.84)), Image.LANCZOS)
        tile.paste(art, ((px - art.width) // 2, (px - art.height) // 2), art)
        tile.save(PUB / "brand" / f"emblem-{px}.png")

    ico_src = Image.new("RGBA", (64, 64), (255, 255, 255, 255))
    art = emblem.copy()
    art.thumbnail((54, 54), Image.LANCZOS)
    ico_src.paste(art, ((64 - art.width) // 2, (64 - art.height) // 2), art)
    ico_src.save(PUB / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    print("favicon.ico + emblem-{16,32,48,180,192,512}.png (light tile)")

    # 3. product cut-outs.
    for slug, (mk, box, excl, ma, sc) in {**PRODUCTS}.items():
        im = extract(mk, box, excl, ma, scrub_rects=sc)
        save(im, PUB / "products" / f"{slug}.png")
        print(f"products/{slug:34s} mockup-{MOCKUPS[mk]:20s} {im.size}")

    for slug, (mk, box, excl, ma, sc) in TILES.items():
        im = extract(mk, box, excl, ma, scrub_rects=sc)
        save(im, PUB / "categories" / f"{slug}.png")
        print(f"categories/{slug:32s} mockup-{MOCKUPS[mk]:20s} {im.size}")

    # 4. hero VFX — the energy-impact visual, checkerboard removed (see cut_glow).
    hero_src = RAW / "hero.png"
    if hero_src.exists():
        vfx = cut_glow(Image.open(hero_src))
        save(vfx, PUB / "hero" / "impact.png")
        print(f"hero/impact.png {'':20s} {vfx.size}")


if __name__ == "__main__":
    main()
