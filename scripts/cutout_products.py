"""Cut the owner-supplied packshots out of their white background for the dark storefront.

The holographic cards and the product gallery float each product on a dark art window, so every
product gets a transparent cut-out in public/products/cutout/. It is built from the original photo in
/prodotti, not from the 1000 px tile: most supplied photos are only 447 px wide, and cutting from the
already-enlarged tile stacked two resamplings and produced soft, stair-stepped edges.

Per product:
  1. trim the photo exactly like scripts/normalize_images.py, so the cut-out frames like its tile;
  2. find the edge-connected white background at native resolution and erode the mask by one source
     pixel, which drops the white fringe around the product;
  3. enlarge the photo once with Lanczos and a light unsharp mask, and the mask smoothly with a
     steepened edge, onto a square transparent canvas.

Products photographed on a real background instead of white (OUTLINED) are cut along the box outline:
the four measured corners are mapped straight onto an upright rectangle in one resampling, the
measured outline becomes the alpha, and the same mapping writes their 1000 px tile, which
scripts/normalize_images.py does not know about.

The three Infinity Starters also get their loose spinning top cropped into public/products/tops/ for
the homepage Arena. Centres and radii are measured on the 1000 px tile and scaled to the canvas.

Usage: python scripts/cutout_products.py [--force]
"""

from __future__ import annotations

import importlib.util
import sys
from collections import deque
from math import dist
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SOURCES = ROOT / "prodotti"
TILES = ROOT / "public" / "products"
CUTOUT = TILES / "cutout"
TOPS = ROOT / "public" / "products" / "tops"

SLUGS = (
    "cobalt-dragoon-2-60c",
    "soar-phoenix-9-60gf",
    "saber-samurai-2-70l",
    "blast-pegasus-a-tr",
    "drop-attack-battle-set",
    "sneak-attack-battle-set",
    "glory-valkerion-lf",
    "hurricane-enlil-is-7-55t",
    "shatter-horus-9-65gb",
)

# Measured in source pixels, one pixel inside the photographed edge so no background survives.
OUTLINED = {
    "glory-valkerion-lf": {
        "source": "gloryValkerion.jpg",
        # Box corners top-left, top-right, bottom-right, bottom-left: straightened to a rectangle.
        "corners": ((122, 35), (467, 38), (463, 530), (125, 533)),
        # The visible outline: the right side panel turns away at the bottom, so that corner is cut.
        "outline": ((122, 35), (467, 38), (463, 506), (452, 512), (440, 522), (432, 530), (125, 533)),
        # The hanger slot shows the wall behind the box; its light pixels become transparent.
        "hole": (240, 55, 350, 95),
        # The listing watermark overlaps the black bottom band: each column is repainted from a
        # clean row above it.
        "retouch": (((420, 495, 431, 524), 491),),
    },
}

# slug -> (centre x, centre y, radius) on the 1000 px tile, and what else cuts the top out: "alpha"
# keeps only the product inside the circle; "dark" also drops the dark box artwork around a top
# taken from the pack illustration.
TOP_CROPS = {
    "glory-valkerion-lf": (487, 526, 168, "dark"),
    "hurricane-enlil-is-7-55t": (596, 478, 128, "alpha"),
    "shatter-horus-9-65gb": (643, 454, 146, "alpha"),
}

CANVAS = 1200
TILE = 1000
TOP_SIZE = 420
WHITE_MIN = 232
WHITE_SPREAD = 18
DARK_LUMA = 96


def load_normaliser():
    spec = importlib.util.spec_from_file_location("normalize_images", ROOT / "scripts" / "normalize_images.py")
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


NORMALISER = load_normaliser()
SOURCE_OF = {slug: name for name, slug in NORMALISER.MAPPING.items()}


def is_white(r: int, g: int, b: int) -> bool:
    return min(r, g, b) >= WHITE_MIN and max(r, g, b) - min(r, g, b) <= WHITE_SPREAD


def is_dark(r: int, g: int, b: int) -> bool:
    return 299 * r + 587 * g + 114 * b <= DARK_LUMA * 1000


def background_mask(image: Image.Image, is_background=is_white) -> Image.Image:
    """255 where a background pixel is connected to the photo border, 0 elsewhere."""
    width, height = image.size
    pixels = image.load()
    seen = bytearray(width * height)
    queue = deque()
    for x in range(width):
        queue.append((x, 0))
        queue.append((x, height - 1))
    for y in range(height):
        queue.append((0, y))
        queue.append((width - 1, y))
    while queue:
        x, y = queue.popleft()
        index = y * width + x
        if seen[index]:
            continue
        if not is_background(*pixels[x, y]):
            continue
        seen[index] = 1
        if x > 0:
            queue.append((x - 1, y))
        if x < width - 1:
            queue.append((x + 1, y))
        if y > 0:
            queue.append((x, y - 1))
        if y < height - 1:
            queue.append((x, y + 1))
    return Image.frombytes("L", (width, height), bytes(255 if value else 0 for value in seen))


def perspective_coefficients(size: tuple[int, int], corners) -> list[float]:
    """PIL PERSPECTIVE data mapping an upright rectangle of `size` onto the four source corners."""
    width, height = size
    targets = ((0, 0), (width, 0), (width, height), (0, height))
    rows, values = [], []
    for (x, y), (u, v) in zip(targets, corners):
        rows.append([x, y, 1, 0, 0, 0, -u * x, -u * y])
        values.append(u)
        rows.append([0, 0, 0, x, y, 1, -v * x, -v * y])
        values.append(v)
    return [float(value) for value in np.linalg.solve(np.array(rows, float), np.array(values, float))]


def outlined_source(slug: str) -> tuple[Image.Image, Image.Image]:
    """The retouched source photo and its anti-aliased outline mask, both at source resolution."""
    spec = OUTLINED[slug]
    photo = Image.open(SOURCES / spec["source"]).convert("RGB")
    pixels = photo.load()
    for (x0, y0, x1, y1), clean_row in spec["retouch"]:
        for x in range(x0, x1):
            for y in range(y0, y1):
                pixels[x, y] = pixels[x, clean_row]

    # Drawn at 4x and reduced, so the outline is anti-aliased before it is enlarged.
    big = Image.new("L", (photo.width * 4, photo.height * 4), 0)
    ImageDraw.Draw(big).polygon([(x * 4, y * 4) for x, y in spec["outline"]], fill=255)
    mask = big.resize(photo.size, Image.LANCZOS)

    x0, y0, x1, y1 = spec["hole"]
    slot = photo.crop((x0, y0, x1, y1)).convert("L").point(lambda value: max(0, min(255, (value - 70) * 255 // 80)))
    hole = Image.new("L", photo.size, 0)
    hole.paste(slot, (x0, y0))
    return photo, ImageChops.subtract(mask, hole)


def outlined(slug: str, box: float) -> Image.Image:
    """The photographed box straightened into an upright RGBA rectangle whose longer side is `box` px."""
    photo, mask = outlined_source(slug)
    tl, tr, br, bl = OUTLINED[slug]["corners"]
    width = (dist(tl, tr) + dist(bl, br)) / 2
    height = (dist(tl, bl) + dist(tr, br)) / 2
    scale = box / max(width, height)
    size = (round(width * scale), round(height * scale))
    data = perspective_coefficients(size, (tl, tr, br, bl))
    straight = photo.transform(size, Image.PERSPECTIVE, data, Image.BICUBIC)
    straight = straight.filter(ImageFilter.UnsharpMask(radius=2, percent=60, threshold=2)).convert("RGBA")
    straight.putalpha(mask.transform(size, Image.PERSPECTIVE, data, Image.BICUBIC).point(edge_curve))
    return straight


def outlined_cutout(slug: str) -> Image.Image:
    box = outlined(slug, (TILE - 2 * NORMALISER.PAD) * CANVAS / TILE)
    canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    canvas.alpha_composite(box, ((CANVAS - box.width) // 2, (CANVAS - box.height) // 2))
    return canvas


def outlined_tile(slug: str) -> Image.Image:
    box = outlined(slug, TILE - 2 * NORMALISER.PAD)
    tile = Image.new("RGBA", (TILE, TILE), (255, 255, 255, 255))
    tile.alpha_composite(box, ((TILE - box.width) // 2, (TILE - box.height) // 2))
    return tile.convert("RGB")


def edge_curve(value: int) -> int:
    """Steepen an enlarged mask so the edge stays crisp instead of a wide soft ramp."""
    return max(0, min(255, (value - 70) * 255 // 115))


def cutout(slug: str) -> Image.Image:
    if slug in OUTLINED:
        return outlined_cutout(slug)
    photo = Image.open(SOURCES / SOURCE_OF[slug]).convert("RGB")
    photo = NORMALISER.trim_to_content(photo)

    # The mask is found at native resolution and eroded by one source pixel, which drops the
    # white fringe the photo carries around the product.
    mask = ImageChops.invert(background_mask(photo)).filter(ImageFilter.MinFilter(3))

    # Same framing as the tile: fit inside the padded box, centred.
    fit = (TILE - 2 * NORMALISER.PAD) * CANVAS / TILE
    scale = min(fit / photo.width, fit / photo.height)
    size = (max(1, round(photo.width * scale)), max(1, round(photo.height * scale)))

    # One enlargement straight from the photo, then a light sharpen; the mask is enlarged smoothly
    # and re-steepened so diagonal edges are anti-aliased rather than stair-stepped.
    enlarged = photo.resize(size, Image.LANCZOS).filter(ImageFilter.UnsharpMask(radius=2, percent=55, threshold=2))
    alpha = mask.resize(size, Image.BICUBIC).point(edge_curve).filter(ImageFilter.GaussianBlur(0.7))
    product = enlarged.convert("RGBA")
    product.putalpha(alpha)

    canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    canvas.alpha_composite(product, ((CANVAS - size[0]) // 2, (CANVAS - size[1]) // 2))
    return canvas


def top(slug: str, cut: Image.Image) -> Image.Image:
    cx, cy, radius, mode = TOP_CROPS[slug]
    k = CANVAS / TILE
    cx, cy, radius = cx * k, cy * k, radius * k
    pad = radius * 1.12
    crop = cut.crop((round(cx - pad), round(cy - pad), round(cx + pad), round(cy + pad)))
    circle = Image.new("L", crop.size, 0)
    inset = (crop.width - 2 * radius) / 2
    ImageDraw.Draw(circle).ellipse((inset, inset, inset + 2 * radius, inset + 2 * radius), fill=255)
    circle = circle.filter(ImageFilter.GaussianBlur(3))
    alpha = ImageChops.multiply(circle, crop.getchannel("A"))
    if mode == "dark":
        artwork = background_mask(crop.convert("RGB"), is_dark)
        alpha = ImageChops.subtract(alpha, artwork.filter(ImageFilter.GaussianBlur(1)))
    crop.putalpha(alpha)
    return crop.convert("RGBa").resize((TOP_SIZE, TOP_SIZE), Image.LANCZOS).convert("RGBA")


def main() -> None:
    force = "--force" in sys.argv
    CUTOUT.mkdir(parents=True, exist_ok=True)
    TOPS.mkdir(parents=True, exist_ok=True)
    for slug in SLUGS:
        tile_target = TILES / f"{slug}.webp"
        if slug in OUTLINED and (force or not tile_target.exists()):
            outlined_tile(slug).save(tile_target, "WEBP", quality=90)
            print(f"tile {tile_target.relative_to(ROOT)} {tile_target.stat().st_size // 1024} KB")
        target = CUTOUT / f"{slug}.webp"
        top_target = TOPS / f"{slug}.webp"
        needs_top = slug in TOP_CROPS and (force or not top_target.exists())
        if target.exists() and not force and not needs_top:
            continue
        cut = cutout(slug)
        if force or not target.exists():
            cut.save(target, "WEBP", quality=92, alpha_quality=100, method=6)
            print(f"cutout {target.relative_to(ROOT)} {target.stat().st_size // 1024} KB")
        if needs_top:
            top(slug, cut).save(top_target, "WEBP", quality=90, alpha_quality=100, method=6)
            print(f"top {top_target.relative_to(ROOT)} {top_target.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
