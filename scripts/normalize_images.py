"""
Normalise the owner-supplied product packshots in /prodotti into uniform product tiles.

Each source image is trimmed to its content (bounding box of everything that differs from a
white background), scaled to fit, and centred on a 1000x1000 white square with consistent
padding, then written as WebP to /public/products/<slug>.webp. This gives every product the
same framing and a uniform white background across cards and galleries.

Existing tiles are kept unless --force is passed: adding a product must not re-encode the
tiles that are already published and referenced by Stripe.

Run from the repo root:  python scripts/normalize_images.py [--force]
Keep the sizes in src/data/assets.ts (1000x1000) in sync with CANVAS below.
"""

import os
import sys

from PIL import Image, ImageChops

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "prodotti")
DST = os.path.join(ROOT, "public", "products")
CANVAS = 1000
PAD = 90
# Source border band ignored when trimming: some supplied packshots carry frame lines left
# over from cropping, which would otherwise count as content and end up on the tile.
EDGE = 12

# Source filename -> product slug (must match the keys in src/data/assets.ts).
MAPPING = {
    "cobaltdragoon.jpg": "cobalt-dragoon-2-60c",
    "phoenixred.jpg": "soar-phoenix-9-60gf",
    "sabersamurai.jpg": "saber-samurai-2-70l",
    "pegasusblastpack.webp": "blast-pegasus-a-tr",
    "dropattack.jpg": "drop-attack-battle-set",
    "sneakattack.jpg": "sneak-attack-battle-set",
    # glory-valkerion-lf is photographed on a real background: scripts/cutout_products.py cuts it
    # along its outline and writes its tile too.
    "hurricaneenlil.jpg": "hurricane-enlil-is-7-55t",
    "shatterhorus.jpg": "shatter-horus-9-65gb",
}


def trim_to_content(im):
    """Crop to the bounding box of everything that differs from a white background."""
    bg = Image.new("RGB", im.size, (255, 255, 255))
    diff = ImageChops.difference(im, bg).convert("L").point(lambda p: 255 if p > 18 else 0)
    inner = Image.new("L", im.size, 0)
    inner.paste(255, (EDGE, EDGE, im.width - EDGE, im.height - EDGE))
    bbox = ImageChops.multiply(diff, inner).getbbox()
    return im.crop(bbox) if bbox else im


def main():
    force = "--force" in sys.argv[1:]
    for src_name, slug in MAPPING.items():
        dst = os.path.join(DST, slug + ".webp")
        if os.path.exists(dst) and not force:
            print(f"kept  {slug}.webp")
            continue
        im = Image.open(os.path.join(SRC, src_name)).convert("RGB")
        im = trim_to_content(im)
        fit = CANVAS - 2 * PAD
        r = min(fit / im.width, fit / im.height)
        nw, nh = max(1, int(im.width * r)), max(1, int(im.height * r))
        im = im.resize((nw, nh), Image.LANCZOS)
        canvas = Image.new("RGB", (CANVAS, CANVAS), (255, 255, 255))
        canvas.paste(im, ((CANVAS - nw) // 2, (CANVAS - nh) // 2))
        canvas.save(dst, "WEBP", quality=90)
        print(f"wrote {slug}.webp")


if __name__ == "__main__":
    main()
