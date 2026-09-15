"""Cut the owner-supplied product tiles out of their white background for the dark storefront.

The packshots in public/products are square WebP tiles on flat white (scripts/normalize_images.py).
On the Holo Drop theme they sit inside dark holographic cards, so each tile gets a transparent
sibling in public/products/cutout/. The background is removed with an edge-connected flood fill:
only near-white pixels reachable from the tile border become transparent, so white plastic inside
the product (launchers, the Glory Valkyrie blade) stays opaque.

The three Infinity Starter tiles also get their loose spinning top cropped into public/products/tops/,
used by the homepage Arena. Centres and radii are measured on the 1000 px tile.

Usage: python scripts/cutout_products.py [--force]
"""

from __future__ import annotations

import sys
from collections import deque
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
PRODUCTS = ROOT / "public" / "products"
CUTOUT = PRODUCTS / "cutout"
TOPS = PRODUCTS / "tops"

SLUGS = (
    "cobalt-dragoon-2-60c",
    "soar-phoenix-9-60gf",
    "saber-samurai-2-70l",
    "blast-pegasus-a-tr",
    "drop-attack-battle-set",
    "sneak-attack-battle-set",
    "glory-valkyrie-lf",
    "hurricane-enlil-is-7-55t",
    "shatter-horus-9-65gb",
)

# slug -> (centre x, centre y, radius, use the white flood mask). Glory Valkyrie's blade is white,
# so its top is cut with the circle alone.
TOP_CROPS = {
    "glory-valkyrie-lf": (620, 448, 128, False),
    "hurricane-enlil-is-7-55t": (596, 478, 128, True),
    "shatter-horus-9-65gb": (643, 454, 146, True),
}

CUTOUT_SIZE = 800
TOP_SIZE = 360
WHITE_MIN = 232
WHITE_SPREAD = 18


def flood_mask(image: Image.Image, white_min: int = WHITE_MIN) -> Image.Image:
    """Opaque everywhere except near-white pixels connected to the image border."""
    width, height = image.size
    pixels = image.load()
    background = bytearray(width * height)
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
        if background[index]:
            continue
        r, g, b = pixels[x, y][:3]
        if min(r, g, b) < white_min or max(r, g, b) - min(r, g, b) > WHITE_SPREAD:
            continue
        background[index] = 1
        if x > 0:
            queue.append((x - 1, y))
        if x < width - 1:
            queue.append((x + 1, y))
        if y > 0:
            queue.append((x, y - 1))
        if y < height - 1:
            queue.append((x, y + 1))
    return Image.frombytes("L", (width, height), bytes(0 if value else 255 for value in background))


def soften(mask: Image.Image) -> Image.Image:
    return mask.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))


def tile(slug: str) -> Image.Image:
    image = Image.open(PRODUCTS / f"{slug}.webp").convert("RGB")
    return image if image.size == (1000, 1000) else image.resize((1000, 1000), Image.LANCZOS)


def write_cutout(slug: str, force: bool) -> None:
    target = CUTOUT / f"{slug}.webp"
    if target.exists() and not force:
        return
    image = tile(slug).resize((CUTOUT_SIZE, CUTOUT_SIZE), Image.LANCZOS)
    rgba = image.convert("RGBA")
    rgba.putalpha(soften(flood_mask(image)))
    rgba.save(target, "WEBP", quality=82, method=6)
    print(f"cutout {target.relative_to(ROOT)} {target.stat().st_size // 1024} KB")


def write_top(slug: str, force: bool) -> None:
    target = TOPS / f"{slug}.webp"
    if target.exists() and not force:
        return
    cx, cy, radius, use_flood = TOP_CROPS[slug]
    pad = radius + 20
    crop = tile(slug).crop((cx - pad, cy - pad, cx + pad, cy + pad))
    circle = Image.new("L", crop.size, 0)
    ImageDraw.Draw(circle).ellipse((20, 20, 20 + 2 * radius, 20 + 2 * radius), fill=255)
    circle = circle.filter(ImageFilter.GaussianBlur(2.5))
    mask = Image.composite(flood_mask(crop, 228), Image.new("L", crop.size, 0), circle) if use_flood else circle
    rgba = crop.convert("RGBA")
    rgba.putalpha(soften(mask) if use_flood else mask)
    rgba.resize((TOP_SIZE, TOP_SIZE), Image.LANCZOS).save(target, "WEBP", quality=84, method=6)
    print(f"top {target.relative_to(ROOT)} {target.stat().st_size // 1024} KB")


def main() -> None:
    force = "--force" in sys.argv
    CUTOUT.mkdir(parents=True, exist_ok=True)
    TOPS.mkdir(parents=True, exist_ok=True)
    for slug in SLUGS:
        write_cutout(slug, force)
    for slug in TOP_CROPS:
        write_top(slug, force)


if __name__ == "__main__":
    main()
