"""Cut the owner's deck-case photo into one packshot per colour, plus a line-up of every colour.

The owner photographed all the deck cases together on a grey table (prodotti/portadeck.jpg): ten
cases in two columns, each one's latches resting on the next. Per colour this picks one case and
writes, like every other product, a 1000 px white tile (public/products/<slug>.webp) and a
transparent cut-out for the dark cards (public/products/cutout/<slug>.webp). The line-up of all
the colours (porta-deck-colori) is assembled from the same cut-outs.

  1. rembg's isnet-general-use model separates the cases from the table (the model must already
     be in ~/.u2net: this script never downloads anything);
  2. a watershed on colour edges splits the touching cases, seeded on each lid and on each case's
     own latches, so a latch resting on the next case stays with the case it belongs to;
  3. per chosen case, pixels in the colour of the cases it touches are dropped, thin slivers are
     opened away, holes (the printed logo) are filled and the largest piece is kept.

Usage: python scripts/cut_deck_cases.py
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from rembg import new_session, remove
from scipy import ndimage as ndi
from skimage import color, filters, morphology, segmentation

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "prodotti" / "portadeck.jpg"
TILES = ROOT / "public" / "products"
CUTOUT = TILES / "cutout"
CANVAS = 1000
# Share of the canvas width a case fills: the cases are wide, so the width is what binds.
FILL = 0.88

# A point on the plain lid of every case in the photo (left column L1-L5, right column R1-R5).
LIDS = {
    "L1": (175, 500), "L2": (155, 740), "L3": (130, 960), "L4": (130, 1240), "L5": (150, 1720),
    "R1": (760, 470), "R2": (775, 700), "R3": (775, 940), "R4": (790, 1200), "R5": (880, 1715),
}
# Cases whose latches are printed white; the others have latches in the lid's colour.
WHITE_LATCHES = {"L3", "L4", "R1", "R5"}

# Slug -> the case that shows it best, the cases it touches, and the leftmost column it may use
# (the white case's frame would otherwise pick up a strap of its neighbour).
COLOURS = {
    "porta-deck-giallo": ("L1", ["L2"], 0),
    "porta-deck-verde-lime": ("L5", ["L4"], 0),
    "porta-deck-azzurro": ("L4", ["L3", "L5"], 0),
    "porta-deck-blu": ("R3", ["R2", "R4"], 0),
    "porta-deck-rosa": ("L3", ["L2", "L4"], 0),
    "porta-deck-fucsia": ("R1", ["R2"], 0),
    "porta-deck-bianco": ("R5", ["R4", "L5"], 772),
}
LINE_UP = "porta-deck-colori"
# Chosen cases that touch a yellow one and are not yellow themselves.
BESIDE_YELLOW = {"R1", "R3", "R5"}


def patch_lab(lab: np.ndarray, point: tuple[int, int]) -> np.ndarray:
    x, y = point
    return lab[y - 3 : y + 4, x - 3 : x + 4].reshape(-1, 3).mean(axis=0)


def largest(mask: np.ndarray) -> np.ndarray:
    labelled, count = ndi.label(mask)
    if count == 0:
        return mask
    sizes = ndi.sum(mask, labelled, range(1, count + 1))
    return labelled == int(np.argmax(sizes)) + 1


def split_cases(rgb: np.ndarray, lab: np.ndarray, alpha: np.ndarray) -> np.ndarray:
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


def case_alpha(case: str, touching: list[str], min_x: int, lab: np.ndarray, alpha: np.ndarray, labels: np.ndarray) -> np.ndarray:
    mask = (labels == list(LIDS).index(case) + 2) & (alpha > 60)
    mask[:, :min_x] = False
    for other in touching:
        mask &= np.linalg.norm(lab - patch_lab(lab, LIDS[other]), axis=2) > 16
    if case in BESIDE_YELLOW:
        # A yellow lid in shadow drifts too far from its sampled colour; its b* still gives it away.
        mask &= lab[:, :, 2] < 38
    mask = morphology.binary_opening(mask, morphology.disk(4))
    mask = ndi.binary_fill_holes(largest(mask))
    edge = np.asarray(Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.0))) / 255.0
    # Inside the case the matte's partial alpha is noise (the white lid read as see-through);
    # only the outline keeps its soft edge.
    soft = np.clip((alpha - 25) / (170 - 25), 0, 1)
    inner = ndi.binary_erosion(mask, iterations=4)
    return (np.where(inner, 1.0, np.minimum(edge, soft)) * 255).astype(np.uint8)


def on_canvas(art: Image.Image, background: tuple[int, int, int, int]) -> Image.Image:
    canvas = Image.new("RGBA", (CANVAS, CANVAS), background)
    scale = min(CANVAS * FILL / art.width, CANVAS * FILL / art.height)
    sized = art.resize((round(art.width * scale), round(art.height * scale)), Image.LANCZOS)
    canvas.alpha_composite(sized, ((CANVAS - sized.width) // 2, (CANVAS - sized.height) // 2))
    return canvas


def line_up(cuts: list[Image.Image]) -> Image.Image:
    """Every colour in two staggered columns, each case resting slightly on the one below."""
    width = 470
    columns = [cuts[0::2], cuts[1::2]]
    art = Image.new("RGBA", (2 * width + 40, 4 * 190 + 120), (0, 0, 0, 0))
    for column, items in enumerate(columns):
        x = column * (width + 40)
        y = 0 if column == 0 else 95
        for cut in items:
            sized = cut.resize((width, round(cut.height * width / cut.width)), Image.LANCZOS)
            art.alpha_composite(sized, (x, y))
            y += 190
    return art.crop(art.getbbox())


def main() -> None:
    source = Image.open(SOURCE).convert("RGB")
    rgb = np.asarray(source)
    lab = color.rgb2lab(rgb)
    matte = remove(source, session=new_session("isnet-general-use"))
    alpha = np.asarray(matte)[:, :, 3].astype(float)
    labels = split_cases(rgb, lab, alpha)

    CUTOUT.mkdir(parents=True, exist_ok=True)
    cuts = []
    for slug, (case, touching, min_x) in COLOURS.items():
        mask = case_alpha(case, touching, min_x, lab, alpha, labels)
        box = Image.fromarray(mask).getbbox()
        cut = source.crop(box).convert("RGBA")
        cut.putalpha(Image.fromarray(mask).crop(box))
        cuts.append(cut)
        on_canvas(cut, (0, 0, 0, 0)).save(CUTOUT / f"{slug}.webp", quality=90, method=6)
        on_canvas(cut, (255, 255, 255, 255)).convert("RGB").save(TILES / f"{slug}.webp", quality=90, method=6)
        print(slug, "from", case, "box", box)

    group = line_up(cuts)
    on_canvas(group, (0, 0, 0, 0)).save(CUTOUT / f"{LINE_UP}.webp", quality=90, method=6)
    on_canvas(group, (255, 255, 255, 255)).convert("RGB").save(TILES / f"{LINE_UP}.webp", quality=90, method=6)
    print(LINE_UP, "size", group.size)


if __name__ == "__main__":
    main()
