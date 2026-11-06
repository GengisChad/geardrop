"""Tiles and cut-outs for the Takara Tomy pieces.

The partner's consignment photos (assets-source/) are packshots on white, like the Hasbro ones, but
they arrive as single files already cropped, so they skip scripts/cutout_products.py's trimming. Per
product:
  1. fit the photo in 900 px on a 1000 px white square: the storefront tile;
  2. cut it out along the convex outline of everything that is not white. A flood fill from the
     edges eats into white packaging (the Glory Valkyrie blister is white), the outline does not.

The pieces the shop bought itself (owner, 2026-11-06) are staged instead: Takara Tomy's own renders
(assets-source/takara-tomy/, sources in docs/product-photo-sources.md) are separated from their
background and shadow by rembg's isnet-general-use model (it must already be in ~/.u2net: this
script never downloads anything), and the two random boosters also show their box, straightened out
of the owner's photo. Every tile is a white square, every cut-out its transparent twin.

Usage: python scripts/cutout_takara.py [slug ...]
With slugs, only those products are rebuilt, so a change leaves the others' files untouched.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SOURCES = ROOT / "assets-source"
RENDERS = SOURCES / "takara-tomy"
TILES = ROOT / "public" / "products"
CUTOUT = TILES / "cutout"

TAKARA = {
    "cx-00-evangelion-deck-set": "evangelion.webp",
    "ux-00-glory-valkyrie-lf": "gloryvalkyrieUX00.webp",
    "cx-00-tigarage-ft3-60t": "tigarage.jpg",
}

#: The two boxes, out of the owner's photos. `quad` is the box's front in the photo, top left first:
#: it is warped to an upright rectangle. `outline` is what stays of that rectangle, in the photo's
#: own pixels, because the box has a slanted facet low on its left and is white on a white table,
#: where a model cannot find the edge.
BOXES = {
    "box-bx-48": {
        "quad": ((100, 100), (1303, 125), (1221, 2694), (145, 2649)),
        "outline": ((100, 100), (1303, 125), (1221, 2694), (724, 2686), (541, 2666), (424, 2624), (291, 2532), (142, 2464)),
    },
    "box-cx-18": {
        "quad": ((100, 100), (1269, 109), (1282, 2756), (119, 2724)),
        "outline": ((100, 100), (1269, 109), (1282, 2756), (533, 2746), (117, 2588)),
    },
}
BOX_SIZE = (1170, 2600)

#: What each tile shows: (piece, centre x, centre y, longest side in px on the 1000 px square). A
#: piece is a file of RENDERS or a key of BOXES. Later pieces stand in front of earlier ones.
STAGED: dict[str, tuple[tuple[str, int, int, int], ...]] = {
    # Three of the colours in the pile (owner: mixed, no count by colour).
    "winder-launcher-takara-tomy": (("CX04_04", 305, 500, 700), ("BX46_11", 500, 500, 700), ("CX14_09", 695, 500, 700)),
    # The two the owner photographed: UX-20's navy and BX-34's left-spin blue.
    "string-launcher-takara-tomy": (("BX34_05", 690, 300, 470), ("UX20_04", 330, 680, 520)),
    # The Evangelion print the owner photographed and a plain Long Winder, CX-07's green.
    "long-winder-launcher-takara-tomy": (("CX07_07", 330, 500, 760), ("BXG57_23", 670, 500, 760)),
    # The three editions in the owner's lot: one listing, the buyer asks for a colour.
    "custom-grip-takara-tomy": (("BX41", 292, 520, 620), ("BX42", 500, 500, 620), ("BX30", 708, 480, 620)),
    "cx-18-random-booster-brachio-whip": (("CX18", 722, 500, 500), ("box-cx-18", 245, 500, 900)),
    "bx-48-random-booster-vol-9": (("BX48", 722, 500, 740), ("box-bx-48", 245, 500, 900)),
}

#: Further photos of the gallery, one render each, written as <slug>-<render in lower case>.webp.
GALLERY: dict[str, tuple[str, ...]] = {
    "custom-grip-takara-tomy": ("BX30", "BX42", "BX41", "BX41_01"),
    "cx-18-random-booster-brachio-whip": ("CX18_01", "CX18_03", "CX18_04"),
    "bx-48-random-booster-vol-9": ("BX48_02", "BX48_03", "BX48_04", "BX48_05", "BX48_06"),
}


def hull(points: list[tuple[int, int]]) -> list[tuple[int, int]]:
    """Monotone-chain convex hull."""
    pts = sorted(set(points))
    if len(pts) < 3:
        return pts

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lower: list[tuple[int, int]] = []
    upper: list[tuple[int, int]] = []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    return lower[:-1] + upper[:-1]


def tile(source: Path) -> Image.Image:
    photo = Image.open(source).convert("RGB")
    scale = min(900 / photo.width, 900 / photo.height)
    photo = photo.resize((round(photo.width * scale), round(photo.height * scale)), Image.LANCZOS)
    canvas = Image.new("RGB", (1000, 1000), (255, 255, 255))
    canvas.paste(photo, ((1000 - photo.width) // 2, (1000 - photo.height) // 2))
    return canvas


def cutout(square: Image.Image) -> Image.Image:
    pixels = np.asarray(square).astype(int)
    ys, xs = np.nonzero(pixels.min(axis=2) < 235)
    outline: list[tuple[int, int]] = []
    for y in np.unique(ys):
        row = xs[ys == y]
        outline += [(int(row.min()), int(y)), (int(row.max()), int(y))]
    mask = Image.new("L", square.size, 0)
    ImageDraw.Draw(mask).polygon(hull(outline), fill=255)
    mask = mask.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    out = square.convert("RGBA")
    out.putalpha(mask)
    return out


def render_piece(name: str, session) -> Image.Image:
    """A Takara Tomy render without its background and its shadow, cropped to the piece."""
    from rembg import remove

    photo = Image.open(RENDERS / f"{name}.png").convert("RGB")
    piece = photo.convert("RGBA")
    # The model leaves faint noise across the background: it would stretch the crop to the corners.
    piece.putalpha(remove(photo, session=session, only_mask=True).point(lambda alpha: 0 if alpha < 16 else alpha))
    return piece.crop(piece.getbbox())


def perspective(target, source) -> tuple[float, ...]:
    """The eight coefficients PIL wants to map `target` pixels back onto `source` pixels."""
    rows = []
    for (x, y), (u, v) in zip(target, source):
        rows.append([x, y, 1, 0, 0, 0, -u * x, -u * y])
        rows.append([0, 0, 0, x, y, 1, -v * x, -v * y])
    values = np.linalg.solve(np.array(rows, dtype=float), np.array(source, dtype=float).reshape(8))
    return tuple(float(value) for value in values)


def box_piece(name: str) -> Image.Image:
    """The box's front, upright, cut along its outline with a soft edge."""
    spec = BOXES[name]
    photo = Image.open(RENDERS / f"{name}.jpg").convert("RGB")
    mask = Image.new("L", photo.size, 0)
    ImageDraw.Draw(mask).polygon(spec["outline"], fill=255)
    rgba = photo.convert("RGBA")
    rgba.putalpha(mask.filter(ImageFilter.GaussianBlur(1.5)))
    width, height = BOX_SIZE
    coefficients = perspective(((0, 0), (width, 0), (width, height), (0, height)), spec["quad"])
    upright = rgba.transform(BOX_SIZE, Image.PERSPECTIVE, coefficients, Image.BICUBIC)
    return upright.crop(upright.getbbox())


def fit(piece: Image.Image, side: int) -> Image.Image:
    scale = side / max(piece.size)
    return piece.resize((round(piece.width * scale), round(piece.height * scale)), Image.LANCZOS)


def save_pair(canvas: Image.Image, name: str) -> None:
    canvas.save(CUTOUT / f"{name}.webp", "WEBP", quality=90, method=6)
    white = Image.new("RGBA", canvas.size, (255, 255, 255, 255))
    white.alpha_composite(canvas)
    white.convert("RGB").save(TILES / f"{name}.webp", "WEBP", quality=88, method=6)


def staged(slug: str, session) -> None:
    canvas = Image.new("RGBA", (1000, 1000), (0, 0, 0, 0))
    for name, x, y, side in STAGED[slug]:
        piece = fit(box_piece(name) if name in BOXES else render_piece(name, session), side)
        canvas.alpha_composite(piece, (x - piece.width // 2, y - piece.height // 2))
    save_pair(canvas, slug)
    for name in GALLERY.get(slug, ()):
        canvas = Image.new("RGBA", (1000, 1000), (0, 0, 0, 0))
        piece = fit(render_piece(name, session), 900)
        canvas.alpha_composite(piece, ((1000 - piece.width) // 2, (1000 - piece.height) // 2))
        save_pair(canvas, f"{slug}-{name.lower()}")


def main() -> None:
    wanted = sys.argv[1:] or [*TAKARA, *STAGED]
    unknown = sorted(set(wanted) - {*TAKARA, *STAGED})
    if unknown:
        raise SystemExit(f"not a Takara Tomy piece: {', '.join(unknown)}")
    session = None
    for slug in wanted:
        if slug in TAKARA:
            square = tile(SOURCES / TAKARA[slug])
            square.save(TILES / f"{slug}.webp", "WEBP", quality=88, method=6)
            cutout(square).save(CUTOUT / f"{slug}.webp", "WEBP", quality=90, method=6)
        else:
            if session is None:
                # Imported here: the consignment photos need neither the model nor the library.
                from rembg import new_session

                session = new_session("isnet-general-use")
            staged(slug, session)
        print(slug)


if __name__ == "__main__":
    main()
