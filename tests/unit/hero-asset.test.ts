import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The hero artwork is produced by scripts/build-assets.py (`cut_glow`) and shown by
 * hero-impact.tsx with explicit width/height. Three things have to agree: the crop
 * parameters in the script, the pixels actually committed, and the intrinsic size the
 * component declares to the browser.
 *
 * They drifted once already: the script's mass cut was raised to 0.012 after the asset
 * had been committed at 0.005, so `pnpm assets` re-cropped the hero to 1182x733 while
 * the component kept claiming 1353x830 — a wrong aspect ratio and a rebuild that
 * silently changed the page. These assertions pin all three to the same numbers.
 */

const ROOT = process.cwd();
const HERO_WIDTH = 1353;
const HERO_HEIGHT = 830;

/** Reads the intrinsic size out of a PNG's IHDR chunk. */
function pngSize(path: string): { width: number; height: number } {
  const buffer = readFileSync(path);
  expect(buffer.subarray(1, 4).toString("ascii")).toBe("PNG");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

describe("hero artwork stays reproducible", () => {
  it("ships the size the generator produces", () => {
    expect(pngSize(join(ROOT, "public/hero/impact.png"))).toEqual({
      width: HERO_WIDTH,
      height: HERO_HEIGHT,
    });
  });

  it("declares that same size in the component", () => {
    const source = readFileSync(join(ROOT, "src/components/home/hero-impact.tsx"), "utf8");
    expect(source).toContain(`width={${HERO_WIDTH}}`);
    expect(source).toContain(`height={${HERO_HEIGHT}}`);
    expect(source).toContain('src="/hero/impact.png"');
  });

  it("keeps the crop constants that produce it", () => {
    const script = readFileSync(join(ROOT, "scripts/build-assets.py"), "utf8");
    // Raising either value re-crops the artwork; both were reverse-engineered from the
    // committed PNG, which `pnpm assets` reproduces byte for byte.
    expect(script).toContain("cut: float = 0.005");
    expect(script).toContain("pad_x = round((x1 - x0) * 0.06)");
    expect(script).toContain("pad_y = round((y1 - y0) * 0.06)");
  });

  it("commits the webp sibling the generator always writes", () => {
    // save() writes a .webp next to every PNG. Leaving it untracked means `pnpm assets`
    // dirties the tree on every run.
    expect(() => readFileSync(join(ROOT, "public/hero/impact.webp"))).not.toThrow();
  });
});
