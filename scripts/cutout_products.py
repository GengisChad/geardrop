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

The three Infinity Starters also get their loose spinning top cropped into public/products/tops/ for
the homepage Arena. Centres and radii are measured on the 1000 px tile and scaled to the canvas.

Usage: python scripts/cutout_products.py [--force]
"""

from __future__ import annotations

import importlib.util
import sys
from collections import deque
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SOURCES = ROOT / "prodotti"
CUTOUT = ROOT / "public" / "products" / "cutout"
TOPS = ROOT / "public" / "products" / "tops"

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

# slug -> (centre x, centre y, radius) on the 1000 px tile, and whether to keep only the product
# alpha inside the circle. Glory Valkyrie's blade is white, so its top is cut with the circle alone.
TOP_CROPS = {
    "glory-valkyrie-lf": (620, 448, 128, False),
    "hurricane-enlil-is-7-55t": (596, 478, 128, True),
    "shatter-horus-9-65gb": (643, 454, 146, True),
}

CANVAS = 1200
TILE = 1000
TOP_SIZE = 420
WHITE_MIN = 232
WHITE_SPREAD = 18


def load_normaliser():
    spec = importlib.util.spec_from_file_location("normalize_images", ROOT / "scripts" / "normalize_images.py")
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


NORMALISER = load_normaliser()
SOURCE_OF = {slug: name for name, slug in NORMALISER.MAPPING.items()}


def background_mask(image: Image.Image) -> Image.Image:
    """255 where a near-white pixel is connected to the photo border, 0 elsewhere."""
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
        r, g, b = pixels[x, y]
        if min(r, g, b) < WHITE_MIN or max(r, g, b) - min(r, g, b) > WHITE_SPREAD:
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


def edge_curve(value: int) -> int:
    """Steepen an enlarged mask so the edge stays crisp instead of a wide soft ramp."""
    return max(0, min(255, (value - 70) * 255 // 115))


def cutout(slug: str) -> Image.Image:
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
    cx, cy, radius, keep_alpha = TOP_CROPS[slug]
    k = CANVAS / TILE
    cx, cy, radius = cx * k, cy * k, radius * k
    pad = radius * 1.12
    crop = cut.crop((round(cx - pad), round(cy - pad), round(cx + pad), round(cy + pad)))
    circle = Image.new("L", crop.size, 0)
    inset = (crop.width - 2 * radius) / 2
    ImageDraw.Draw(circle).ellipse((inset, inset, inset + 2 * radius, inset + 2 * radius), fill=255)
    circle = circle.filter(ImageFilter.GaussianBlur(3))
    alpha = ImageChops.multiply(circle, crop.getchannel("A")) if keep_alpha else circle
    if not keep_alpha:
        # The white blade was keyed out with the background; restore it from the flattened photo.
        flat = Image.new("RGBA", crop.size, (255, 255, 255, 255))
        flat.alpha_composite(crop)
        crop = flat
    crop.putalpha(alpha)
    return crop.convert("RGBa").resize((TOP_SIZE, TOP_SIZE), Image.LANCZOS).convert("RGBA")


def main() -> None:
    force = "--force" in sys.argv
    CUTOUT.mkdir(parents=True, exist_ok=True)
    TOPS.mkdir(parents=True, exist_ok=True)
    for slug in SLUGS:
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
