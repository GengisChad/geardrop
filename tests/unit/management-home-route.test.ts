import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const app = join(process.cwd(), "apps/management/src/app");
const read = (path: string) => readFileSync(join(app, path), "utf8");

// Login and both MFA screens send a person to "/" once they are through. If "/" itself sent
// everyone back to the login form, a correct sign-in would end where it started. The root has
// to hand people to the protected area and let its layout decide: no session goes to /login,
// a missing factor goes to MFA, everyone else is in.
describe("the management home", () => {
  it("is where a finished sign-in lands", () => {
    expect(read("login/actions.ts")).toMatch(/redirect\(destination \?\? "\/"\)/);
    expect(read("../components/mfa-enrollment.tsx")).toContain('router.push("/")');
    expect(read("../components/mfa-challenge.tsx")).toContain('router.push("/")');
  });

  it("never sends a signed-in person back to the login form", () => {
    expect(read("page.tsx")).not.toMatch(/redirect\(\s*["']\/login["']\s*\)/);
  });

  it("hands people to the protected area, whose layout runs the access check", () => {
    expect(read("page.tsx")).toMatch(/redirect\(\s*["']\/account["']\s*\)/);
    expect(read("(protected)/layout.tsx")).toContain("requireManagementPrincipal");
    expect(read("(protected)/layout.tsx")).toContain("managementMfaDestination");
  });
});
