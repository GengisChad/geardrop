import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

/**
 * The confirmation flow exists because a mailbox link scanner consumed the one-time
 * token 24 seconds after signup, before any human click. These contracts pin the shape
 * that makes that impossible: the pages' GET is inert, only an explicit POST verifies.
 */
describe("prefetch-resistant email confirmation", () => {
  const signupPage = read("src/app/(storefront)/conferma-email/page.tsx");
  const recoveryPage = read("src/app/(storefront)/conferma-recupero/page.tsx");
  const actions = read("src/app/(storefront)/account/confirm-actions.ts");
  const forms = read("src/components/auth/confirm-forms.tsx");

  it("keeps the GET pages inert: no verifyOtp, no supabase client, no redirect on load", () => {
    for (const page of [signupPage, recoveryPage]) {
      // Call sites, not words: the comments explaining the design may name the APIs,
      // the code must not reach them.
      expect(page).not.toMatch(/\.verifyOtp\(/);
      expect(page).not.toMatch(/createSupabaseServerClient\(/);
      expect(page).not.toMatch(/\.exchangeCodeForSession\(/);
      expect(page).not.toMatch(/import .*supabase/i);
      // The page only inspects the parameters' shape.
      expect(page).toContain("token_hash");
      expect(page).toContain("wellFormed");
    }
  });

  it("verifies only through the explicit server action, once per submit", () => {
    expect(actions).toContain('"use server"');
    // Exactly one verifyOtp call site, shared by both confirm actions.
    expect(actions.match(/client\.auth\.verifyOtp\(/g)).toHaveLength(1);
    expect(actions).toContain('token_hash: tokenHash, type');
    // Success routes: signup to the account, recovery to the new-password form.
    expect(actions).toContain('"/nuova-password"');
    expect(actions).toContain('"/account"');
  });

  it("never logs or echoes the token", () => {
    expect(actions).not.toMatch(/console\.\w+\([^)]*token/i);
    // The warn logs carry status and code only.
    expect(actions).toContain("error.status");
    expect(actions).toContain("error.code");
  });

  it("resends through auth.resend, never through another signUp", () => {
    expect(actions).toContain("client.auth.resend({");
    expect(actions).toContain('type: "signup"');
    expect(actions).not.toContain("auth.signUp");
    // Neutral response: same notice whether or not the address exists.
    expect(actions).toContain("Se l'indirizzo è registrato");
    expect(actions).not.toMatch(/non (risulta|esiste) registrat/i);
    // 429 is the one named failure.
    expect(actions).toContain("error.status === 429");
  });

  it("gives the resend button a visible cooldown", () => {
    expect(forms).toContain("RESEND_COOLDOWN_SECONDS = 60");
    expect(forms).toContain("RIPROVA TRA");
    expect(forms).toContain("disabled={blocked}");
  });

  it("points the auth emails at the interstitial pages, origin-derived", () => {
    const authActions = read("src/app/(storefront)/account/auth-actions.ts");
    expect(authActions).toContain('authRedirectUrl(origin, "/conferma-email")');
    expect(authActions).toContain('authRedirectUrl(origin, "/conferma-recupero")');
    // No hardcoded hosts in the actions: the origin utility decides.
    expect(authActions).not.toContain("vercel.app");
    expect(authActions).not.toContain("localhost");
    expect(authActions).not.toMatch(/emailRedirectTo:\s*["']https?:/);
  });

  it("keeps the legacy callback for PKCE links without touching the new flow", () => {
    const callback = read("src/app/auth/callback/route.ts");
    expect(callback).toContain("exchangeCodeForSession");
    // The new emails never point here; the route stays for PKCE/OAuth and old links.
    expect(signupPage).not.toContain("auth/callback");
    expect(recoveryPage).not.toContain("auth/callback");
  });
});
