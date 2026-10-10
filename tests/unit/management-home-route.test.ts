import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const app = join(process.cwd(), "apps/management/src/app");
const read = (path: string) => readFileSync(join(app, path), "utf8");

// Login and both MFA screens send a person to "/" once they are through.
// If "/" itself sent everyone back to the login form, a correct sign-in would end where it
// started: the login loop has already happened once and must be blocked structurally.
//
// With the root served by (protected)/page.tsx (not a standalone page.tsx), the invariant
// is: the root is inside the protected layout that runs the full access check server-side.
// A person who is already authenticated and MFA-complete never gets redirected to /login by
// the root alone — the layout either lets them through or sends them to MFA, not to login.

describe("the management home", () => {
  it("is where a finished sign-in lands", () => {
    expect(read("login/actions.ts")).toMatch(/redirect\(destination \?\? "\/"\)/);
    expect(read("../components/mfa-enrollment.tsx")).toContain('router.push("/")');
    expect(read("../components/mfa-challenge.tsx")).toContain('router.push("/")');
  });

  it("root page.tsx does not exist — root is served by (protected)/page.tsx", () => {
    // The standalone page.tsx used to redirect to /account. Now that the overview lives in
    // (protected)/page.tsx, the standalone file must be gone to avoid a redirect chain.
    expect(existsSync(join(app, "page.tsx"))).toBe(false);
  });

  it("root is protected by the layout access check, not a loop", () => {
    // requireManagementPrincipal reads identity from the database (never from form/cookie/client).
    // managementMfaDestination decides the MFA path. Both must be present in the protected layout.
    expect(read("(protected)/layout.tsx")).toContain("requireManagementPrincipal");
    expect(read("(protected)/layout.tsx")).toContain("managementMfaDestination");
  });

  it("the overview page never sends a signed-in person back to the login form", () => {
    // If the overview page itself redirected to /login, an authenticated person would end up
    // in a login → overview → login loop identical to the one we fixed. The layout handles
    // unauthenticated redirects; the page must not duplicate that.
    const overview = read("(protected)/page.tsx");
    expect(overview).not.toMatch(/redirect\(\s*["']\/login["']\s*\)/);
  });
});
