import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  loginSchema,
  newPasswordSchema,
  recoverSchema,
  registerSchema,
} from "../../src/lib/auth/customer-schemas";
import { authRedirectUrl, PRODUCTION_ORIGIN, safeRedirectPath } from "../../src/lib/site-url";

function source(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("customer auth validation", () => {
  it("accepts a well formed registration and normalises the email", () => {
    const parsed = registerSchema.safeParse({
      email: "  Nuovo.Cliente@Esempio.IT ",
      password: "passwordforte",
      displayName: "Cliente",
    });

    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.email).toBe("nuovo.cliente@esempio.it");
  });

  it("rejects a short password and a malformed email", () => {
    expect(registerSchema.safeParse({ email: "cliente@esempio.it", password: "corta" }).success).toBe(false);
    expect(registerSchema.safeParse({ email: "non-una-email", password: "passwordforte" }).success).toBe(false);
  });

  it("requires the two new passwords to match", () => {
    expect(
      newPasswordSchema.safeParse({ password: "passwordforte", passwordConfirm: "passwordforte" }).success,
    ).toBe(true);
    expect(
      newPasswordSchema.safeParse({ password: "passwordforte", passwordConfirm: "altradiversa" }).success,
    ).toBe(false);
  });

  it("keeps login permissive on length so it cannot become a password oracle", () => {
    // A short password must reach Supabase and fail there with the same generic message
    // as a wrong one; rejecting it client-side would reveal the stored password's shape.
    expect(loginSchema.safeParse({ email: "cliente@esempio.it", password: "x" }).success).toBe(true);
    expect(recoverSchema.safeParse({ email: "cliente@esempio.it" }).success).toBe(true);
  });
});

describe("redirect safety", () => {
  it("keeps same-site paths and drops anything that leaves the site", () => {
    expect(safeRedirectPath("/account")).toBe("/account");
    expect(safeRedirectPath("/preferiti")).toBe("/preferiti");
    expect(safeRedirectPath("//evil.example")).toBe("/account");
    expect(safeRedirectPath("https://evil.example")).toBe("/account");
    expect(safeRedirectPath(null)).toBe("/account");
    expect(safeRedirectPath("")).toBe("/account");
  });

  it("returns email links to the origin that requested them", () => {
    expect(authRedirectUrl("https://preview.vercel.app", "/auth/callback?next=/account")).toBe(
      "https://preview.vercel.app/auth/callback?next=/account",
    );
    expect(authRedirectUrl(null, "/auth/callback")).toBe(`${PRODUCTION_ORIGIN}/auth/callback`);
    expect(authRedirectUrl("javascript:alert(1)", "/auth/callback")).toBe(`${PRODUCTION_ORIGIN}/auth/callback`);
  });
});

describe("customer and staff stay separated", () => {
  it("never writes staff_profiles from a customer action", () => {
    const actions = source("src/app/(storefront)/account/auth-actions.ts");

    expect(actions).not.toMatch(/from\(["']staff_profiles["']\)/);
    expect(actions).not.toContain("record_staff_invite");
    expect(actions).not.toContain("change_staff_role");
  });

  it("reads staff status only to offer the admin link", () => {
    const session = source("src/lib/auth/customer.ts");

    // Selecting just user_id keeps the read incapable of leaking a role, and getClaims
    // verifies the token rather than trusting the cookie.
    expect(session).toContain("getClaims()");
    expect(session).toContain('select("user_id")');
    expect(session).not.toContain('select("role")');
  });

  it("leaves the staff login untouched", () => {
    const adminLogin = source("src/app/admin/login/actions.ts");

    expect(adminLogin).toContain("requireStaffRole");
    expect(adminLogin).toContain("record_staff_login");
  });

  it("uses one generic message for every sign-in failure", () => {
    const actions = source("src/app/(storefront)/account/auth-actions.ts");

    expect(actions).toContain("Email o password non corretti.");
    expect(actions).not.toMatch(/utente non (trovato|esiste)/i);
    expect(actions).not.toMatch(/email non registrata/i);
  });
});

describe("canonical domain", () => {
  it("points metadata at the production domain", () => {
    expect(PRODUCTION_ORIGIN).toBe("https://geardropshop.it");

    const layout = source("src/app/layout.tsx");
    expect(layout).toContain("metadataBase: new URL(PRODUCTION_ORIGIN)");
    expect(layout).not.toContain("https://geardrop.it");
  });
});
