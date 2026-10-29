import { describe, expect, it } from "vitest";
import { CLIP_SPECS, clipData } from "../../scripts/clips/clip-data";
import { productClips } from "@/data/assets";

/** The clips' facts come from the catalogue, and only facts that a video can keep true. */
describe("clip data", () => {
  it("renders exactly the products the gallery offers a clip for", () => {
    expect(CLIP_SPECS.map((spec) => spec.slug).sort()).toEqual(Object.keys(productClips).sort());
  });

  it("reads name, code, ratchet number, type, two features, tagline and tint off the catalogue", () => {
    const spec = CLIP_SPECS.find((candidate) => candidate.slug === "soar-phoenix-9-60gf")!;
    expect(clipData(spec)).toEqual({
      slug: "soar-phoenix-9-60gf",
      name: "Soar Phoenix",
      code: "9-60GF",
      mark: "9-60",
      type: "Attacco",
      callouts: ["UPPER ATTACK", "STARTER COMPLETO"],
      tagline: "Upper attack. Colpisci verso l'alto.",
      tint: "#ff7a3d",
      cutout: "/products/cutout/soar-phoenix-9-60gf.webp",
    });
  });

  it("says a bare top comes without a launcher and leaves out a tagline that talks about price", () => {
    const data = clipData(CLIP_SPECS.find((candidate) => candidate.slug === "impact-drake-9-60lr")!);
    expect(data.callouts).toEqual(["BIT LOW RUSH", "SOLO LA TROTTOLA"]);
    expect(data.type).toBeNull();
    expect(data.tagline).toBeNull();
  });

  it("refuses a feature the catalogue does not list", () => {
    expect(() => clipData({ slug: "soar-phoenix-9-60gf", callouts: ["Upper Attack", "Lanciatore d'oro"], tagline: false })).toThrow(/Lanciatore d'oro/);
  });

  it("refuses a product without a part code, which every clip prints", () => {
    expect(() => clipData({ slug: "blast-pegasus-a-tr", callouts: ["Clip & Rip", "Starter completo"], tagline: false })).toThrow(/part code/);
  });

  it("carries no price, availability or promotion", () => {
    for (const spec of CLIP_SPECS) {
      expect(Object.keys(clipData(spec)).sort()).toEqual(["callouts", "code", "cutout", "mark", "name", "slug", "tagline", "tint", "type"]);
    }
  });
});
