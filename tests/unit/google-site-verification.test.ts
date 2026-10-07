import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Merchant Center's claim on the site", () => {
  it("keeps the google-site-verification token in the root metadata", () => {
    // Removing it un-verifies geardropshop.it in Merchant Center and pulls the free listings.
    const layout = readFileSync(join(process.cwd(), "src/app/layout.tsx"), "utf8");
    expect(layout).toContain('verification: { google: "JNUM4raMzlZSW65wFPpEOJ7S9IcM6RffInMwIanf-W4" }');
  });
});
