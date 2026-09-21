"""Build the deck case's one product image from the owner's photo of every case.

The owner photographed all the deck cases together on a grey table (prodotti/portadeck.jpg): ten
cases in two columns, each one's latches resting on the next. Cutting every colour out of it gave
uneven pictures, so the shop shows a single case, the yellow one at the top left, which nothing
covers, above "Scegli il tuo colore" and a swatch per colour (owner's choice, 2026-09-21).

  1. rembg's isnet-general-use model separates the cases from the table (the model must already
     be in ~/.u2net: this script never downloads anything);
  2. a watershed on colour edges splits the touching cases, seeded on each lid and on each case's
     own latches, so the latches resting on the next case stay with the case they belong to;
  3. the yellow case keeps its largest piece with holes (the printed logo) filled, and is saved at
     the photo's own resolution;
  4. scripts/render-deck-image.mjs lays it out with the shop's type and writes the white tile and
     the transparent cut-out (public/products/porta-deck.webp and cutout/porta-deck.webp).

Usage: python scripts/cut_deck_cases.py
"""

from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from rembg import new_session, remove
from scipy import ndimage as ndi
from skimage import color, filters, morphology, segmentation

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "prodotti" / "portadeck.jpg"

# A point on the plain lid of every case in the photo (left column L1-L5, right column R1-R5).
LIDS = {
    "L1": (175, 500), "L2": (155, 740), "L3": (130, 960), "L4": (130, 1240), "L5": (150, 1720),
    "R1": (760, 470), "R2": (775, 700), "R3": (775, 940), "R4": (790, 1200), "R5": (880, 1715),
}
# Cases whose latches are printed white; the others have latches in the lid's colour.
WHITE_LATCHES = {"L3", "L4", "R1", "R5"}
# The case shown, and the one its latches rest on.
SHOWN, BELOW = "L1", "L2"


def patch_lab(lab: np.ndarray, point: tuple[int, int]) -> np.ndarray:
    x, y = point
    return lab[y - 3 : y + 4, x - 3 : x + 4].reshape(-1, 3).mean(axis=0)


def largest(mask: np.ndarray) -> np.ndarray:
    labelled, count = ndi.label(mask)
    if count == 0:
        return mask
    sizes = ndi.sum(mask, labelled, range(1, count + 1))
    return labelled == int(np.argmax(sizes)) + 1


def split_cases(lab: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    foreground = alpha > 100
    chroma = np.hypot(lab[:, :, 1], lab[:, :, 2])
    white = (lab[:, :, 0] > 78) & (chroma < 14) & foreground
    markers = np.zeros(alpha.shape, np.int32)
    markers[alpha < 40] = 1
    for index, (case, point) in enumerate(LIDS.items()):
        reference = patch_lab(lab, point)
        near = np.linalg.norm(lab - reference, axis=2)
        labelled, _ = ndi.label((near < 14) & foreground)
        lid = labelled == labelled[point[1], point[0]]
        markers[morphology.binary_erosion(lid, morphology.disk(3))] = index + 2
        ys, xs = np.nonzero(lid)
        left, right, bottom = np.percentile(xs, 1), np.percentile(xs, 99), np.percentile(ys, 99)
        band = np.zeros_like(foreground)
        band[int(bottom - 45) : int(bottom + 70), int(left) : int(right)] = True
        candidates = (white if case in WHITE_LATCHES else (near < 22) & foreground) & band
        labelled, count = ndi.label(candidates)
        sizes = ndi.sum(candidates, labelled, range(1, count + 1))
        latches = np.isin(labelled, [i + 1 for i, size in enumerate(sizes) if size > 250])
        markers[morphology.binary_erosion(latches, morphology.disk(2)) & (markers == 0)] = index + 2
    gradient = sum(filters.sobel(filters.gaussian(lab[:, :, channel], 1.2)) for channel in range(3))
    return segmentation.watershed(gradient, markers)


def shown_case(source: Image.Image) -> Image.Image:
    rgb = np.asarray(source)
    lab = color.rgb2lab(rgb)
    alpha = np.asarray(remove(source, session=new_session("isnet-general-use")))[:, :, 3].astype(float)
    labels = split_cases(lab, alpha)
    mask = (labels == list(LIDS).index(SHOWN) + 2) & (alpha > 60)
    mask &= np.linalg.norm(lab - patch_lab(lab, LIDS[BELOW]), axis=2) > 16
    mask = morphology.binary_opening(mask, morphology.disk(4))
    mask = ndi.binary_fill_holes(largest(mask))
    edge = np.asarray(Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.0))) / 255.0
    # Inside the case the matte's partial alpha is noise; only the outline keeps its soft edge.
    soft = np.clip((alpha - 25) / (170 - 25), 0, 1)
    inner = ndi.binary_erosion(mask, iterations=4)
    matte = Image.fromarray((np.where(inner, 1.0, np.minimum(edge, soft)) * 255).astype(np.uint8))
    box = matte.getbbox()
    cut = source.crop(box).convert("RGBA")
    cut.putalpha(matte.crop(box))
    return cut


def main() -> None:
    cut = shown_case(Image.open(SOURCE).convert("RGB"))
    with tempfile.TemporaryDirectory() as folder:
        png = Path(folder) / "deck-case.png"
        cut.save(png)
        print("case", cut.size)
        subprocess.run(["node", str(ROOT / "scripts" / "render-deck-image.mjs"), str(png)], check=True, cwd=ROOT)


if __name__ == "__main__":
    main()
