"""Builds a packshot for every bundle out of its own components' cut-outs.

A bundle has no photograph of its own: nobody ever laid the pieces on a table together. Rather
than shoot one, the tile is assembled from the cut-outs the components already ship, so the image
is made only of the owner's own photography — the same rule scripts/cutout_products.py follows for
the Horus x Enlil duo.

Two pieces stand in a row; three or four break into two rows, which keeps each one big enough to
recognise on a card. Every piece keeps its aspect ratio and is scaled by a weight, so an arena
reads as the big object it is and a top beside it as the small one.

The deck case is a special case: its own tile is the rendered "scegli il tuo colore" card, whose
type and swatches have no business inside a bundle, so the case itself is cropped out of that card
once and cached as cutout/porta-deck-case.webp.

Writes, for every bundle:
  public/products/<slug>.webp          white tile: Stripe Checkout, Google, share cards
  public/products/cutout/<slug>.webp   transparent, for the dark cards and the gallery

Usage: python scripts/compose_bundle_images.py [--force]
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
CUTOUT = ROOT / "public" / "products" / "cutout"
TILES = ROOT / "public" / "products"
CANVAS = 1000
PAD = 60
GAP = 26
# The band of the deck card that holds the case itself, above its heading and swatches.
DECK_CASE_BAND = (60, 150, 940, 600)

# bundle slug -> its component cut-outs, in the order they are staged, each with a relative weight.
BUNDLES: dict[str, tuple[tuple[str, float], ...]] = {
    "kit-doppio-starter-deck": (
        ("shadow-shinobi-1-80mn", 1.0),
        ("hammer-incendio-3-70h", 1.0),
        ("porta-deck-case", 0.8),
    ),
    "kit-arena-drop-completo": (
        ("drop-attack-battle-set", 1.25),
        ("shadow-shinobi-1-80mn", 1.0),
        ("hammer-incendio-3-70h", 1.0),
        ("porta-deck-case", 0.8),
    ),
    "kit-arena-sneak-completo": (
        ("sneak-attack-battle-set", 1.25),
        ("shadow-shinobi-1-80mn", 1.0),
        ("hammer-incendio-3-70h", 1.0),
        ("porta-deck-case", 0.8),
    ),
    "duo-pegasus-samurai": (
        ("blast-pegasus-a-tr", 1.0),
        ("saber-samurai-2-70l", 1.0),
    ),
}


def deck_case() -> Path:
    """The bare case, cropped out of the rendered deck card the first time it is asked for."""
    path = CUTOUT / "porta-deck-case.webp"
    if not path.exists():
        card = Image.open(CUTOUT / "porta-deck.webp").convert("RGBA").crop(DECK_CASE_BAND)
        box = card.getchannel("A").getbbox()
        if box is None:
            raise SystemExit("il ritaglio del porta deck è vuoto: rilancia cut_deck_cases.py")
        card.crop(box).save(path, "WEBP", quality=90, alpha_quality=100)
        print(f"wrote {path.name}")
    return path


def trimmed(slug: str) -> Image.Image:
    """A component's cut-out, cropped to the pixels that are actually opaque."""
    path = deck_case() if slug == "porta-deck-case" else CUTOUT / f"{slug}.webp"
    if not path.exists():
        raise SystemExit(f"manca il ritaglio {path.relative_to(ROOT)}: lancia prima cutout_products.py")
    image = Image.open(path).convert("RGBA")
    box = image.getchannel("A").getbbox()
    return image.crop(box) if box else image


def rows_for(count: int) -> list[int]:
    """How many pieces go on each row. Three or more break into two rows: a single row of three
    in a square canvas leaves each piece a third of the width, which is too small to read."""
    return {1: [1], 2: [2], 3: [2, 1], 4: [2, 2]}.get(count, [count])


def place(pieces: list[Image.Image], slots: list[int]) -> Image.Image:
    """Lays the pieces out row by row, each row centred, all of them filling the canvas."""
    inner = CANVAS - 2 * PAD
    rows: list[list[Image.Image]] = []
    index = 0
    for size in slots:
        rows.append(pieces[index : index + size])
        index += size

    # Scale so the widest row and the stacked heights both fit, whichever binds first.
    row_width = [sum(image.width for image in row) + GAP * (len(row) - 1) for row in rows]
    row_height = [max(image.height for image in row) for row in rows]
    fit = min(inner / max(row_width), inner / (sum(row_height) + GAP * (len(rows) - 1)))

    scaled = [
        [image.resize((max(1, round(image.width * fit)), max(1, round(image.height * fit))), Image.LANCZOS) for image in row]
        for row in rows
    ]
    heights = [max(image.height for image in row) for row in scaled]
    block = sum(heights) + GAP * (len(scaled) - 1)

    canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    y = (CANVAS - block) // 2
    for row, height in zip(scaled, heights):
        width = sum(image.width for image in row) + GAP * (len(row) - 1)
        x = (CANVAS - width) // 2
        for image in row:
            # Pieces of a row share a baseline, the way they would stand on a table.
            canvas.alpha_composite(image, (x, y + height - image.height))
            x += image.width + GAP
        y += height + GAP
    return canvas


def compose(parts: tuple[tuple[str, float], ...]) -> Image.Image:
    pieces = [(trimmed(slug), weight) for slug, weight in parts]
    base = max(image.height for image, _ in pieces)
    scaled = []
    for image, weight in pieces:
        factor = (base / image.height) * weight
        scaled.append(image.resize((max(1, round(image.width * factor)), max(1, round(image.height * factor))), Image.LANCZOS))
    return place(scaled, rows_for(len(scaled)))


def main(argv: list[str]) -> None:
    force = "--force" in argv
    for slug, parts in BUNDLES.items():
        tile_path = TILES / f"{slug}.webp"
        if tile_path.exists() and not force:
            print(f"kept  {slug}")
            continue
        canvas = compose(parts)
        canvas.save(CUTOUT / f"{slug}.webp", "WEBP", quality=90, alpha_quality=100)
        flat = Image.new("RGB", (CANVAS, CANVAS), "white")
        flat.paste(canvas, mask=canvas.getchannel("A"))
        flat.save(tile_path, "WEBP", quality=90)
        print(f"wrote {slug}")


if __name__ == "__main__":
    main(sys.argv[1:])
