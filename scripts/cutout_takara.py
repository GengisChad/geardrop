"""Tiles and cut-outs for the Takara Tomy consignment pieces (owner's photos in assets-source/).

The partner's photos are packshots on white, like the Hasbro ones, but they arrive as single files
already cropped, so they skip scripts/cutout_products.py's trimming. Per product:
  1. fit the photo in 900 px on a 1000 px white square: the storefront tile;
  2. cut it out along the convex outline of everything that is not white. A flood fill from the
     edges eats into white packaging (the Glory Valkyrie blister is white), the outline does not.

Usage: python scripts/cutout_takara.py
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SOURCES = ROOT / "assets-source"
TILES = ROOT / "public" / "products"
CUTOUT = TILES / "cutout"

TAKARA = {
    "cx-00-evangelion-deck-set": "evangelion.webp",
    "ux-00-glory-valkyrie-lf": "gloryvalkyrieUX00.webp",
    "cx-00-tigarage-ft3-60t": "tigarage.png",
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


def main() -> None:
    for slug, name in TAKARA.items():
        square = tile(SOURCES / name)
        square.save(TILES / f"{slug}.webp", "WEBP", quality=88, method=6)
        cutout(square).save(CUTOUT / f"{slug}.webp", "WEBP", quality=90, method=6)
        print(slug)


if __name__ == "__main__":
    main()
