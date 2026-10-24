"""Tiles and cut-outs for the two-colour deck cases (owner's photos, 2026-10-24).

Each photo shows one case on the workshop table (assets-source/porta-deck-bicolore/). Per colour:
  1. rembg's isnet-general-use model separates the case from the table (the model must already
     be in ~/.u2net: this script never downloads anything);
  2. the largest piece of the mask is kept, so a scrap of paper or the table's edge never joins it,
     and its holes are filled (the printed logo and the gaps between the latches);
  3. the case is cropped to that outline and fitted in 900 px on a 1000 px square: a white tile
     (public/products/<slug>.webp) and a transparent cut-out (public/products/cutout/<slug>.webp).

Usage: python scripts/cutout_deck_bicolore.py
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from rembg import new_session, remove
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parent.parent
SOURCES = ROOT / "assets-source" / "porta-deck-bicolore"
TILES = ROOT / "public" / "products"
CUTOUT = TILES / "cutout"

SLUGS = [
    "porta-deck-nero-blu",
    "porta-deck-giallo-nero",
    "porta-deck-rosso-oro",
    "porta-deck-nero-rosso",
    "porta-deck-nero-oro",
    "porta-deck-viola-verde",
    "porta-deck-viola-argento",
]


#: Photos with a scrap of white paper touching the case (the black and gold one): white is not a
#: colour of these cases, so near-white pixels are dropped before the case is picked out.
PAPER_TOUCHING = {"porta-deck-nero-oro"}


def case_mask(photo: Image.Image, session, drop_white: bool = False) -> np.ndarray:
    alpha = np.array(remove(photo, session=session, only_mask=True)) > 128
    if drop_white:
        hsv = np.array(photo.convert("HSV")).astype(int)
        white = (hsv[..., 2] > 170) & (hsv[..., 1] < 45)
        alpha &= ~ndi.binary_dilation(white, iterations=3)
    labels, count = ndi.label(alpha)
    if count == 0:
        raise SystemExit("no case found in the photo")
    sizes = ndi.sum(alpha, labels, range(1, count + 1))
    largest = labels == (int(np.argmax(sizes)) + 1)
    return ndi.binary_fill_holes(largest)


def square(image: Image.Image, background: tuple[int, ...]) -> Image.Image:
    scale = min(900 / image.width, 900 / image.height)
    image = image.resize((round(image.width * scale), round(image.height * scale)), Image.LANCZOS)
    canvas = Image.new(image.mode, (1000, 1000), background)
    canvas.paste(image, ((1000 - image.width) // 2, (1000 - image.height) // 2), image if image.mode == "RGBA" else None)
    return canvas


def main() -> None:
    session = new_session("isnet-general-use")
    CUTOUT.mkdir(parents=True, exist_ok=True)
    for slug in SLUGS:
        photo = Image.open(SOURCES / f"{slug}.jpg").convert("RGB")
        mask = case_mask(photo, session, drop_white=slug in PAPER_TOUCHING)
        # A soft edge, one pixel wide, so the case does not look stamped out.
        edge = Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1))
        rgba = photo.convert("RGBA")
        rgba.putalpha(edge)
        rgba = rgba.crop(rgba.getbbox())

        square(rgba, (0, 0, 0, 0)).save(CUTOUT / f"{slug}.webp", "WEBP", quality=88, method=6)
        white = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
        white.alpha_composite(rgba)
        square(white.convert("RGB"), (255, 255, 255)).save(TILES / f"{slug}.webp", "WEBP", quality=88, method=6)
        print(slug, rgba.size)


if __name__ == "__main__":
    main()
