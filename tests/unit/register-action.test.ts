import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn<(path: string) => never>(),
  revalidatePath: vi.fn(),
  signUp: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ origin: "https://geardropshop.it" }) }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { signUp: mocks.signUp } }),
}));

import { registerAction } from "@/app/(storefront)/account/auth-actions";

function form() {
  const data = new FormData();
  data.set("email", "cliente@example.com");
  data.set("password", "una-password-lunga");
  data.set("displayName", "Mario");
  return data;
}

describe("account sign-up", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redirect.mockImplementation((path) => {
      throw new Error(`redirect:${path}`);
    });
  });

  it("signs the buyer straight in when the account needs no email confirmation", async () => {
    mocks.signUp.mockResolvedValue({ data: { session: { access_token: "x" }, user: { id: "u1" } }, error: null });
    await expect(registerAction({ error: null, notice: null }, form())).rejects.toThrow("redirect:/account");
  });

  it("says so when the account cannot be created, instead of promising an email", async () => {
    mocks.signUp.mockResolvedValue({ data: { session: null, user: null }, error: { status: 500, message: "gomail: could not send email" } });
    const state = await registerAction({ error: null, notice: null }, form());
    expect(state.error).toContain("Non riusciamo a creare l'account");
    expect(state.notice).toBeNull();
  });

  it("keeps the neutral notice when confirmation by email is on", async () => {
    mocks.signUp.mockResolvedValue({ data: { session: null, user: { id: "u1" } }, error: null });
    const state = await registerAction({ error: null, notice: null }, form());
    expect(state.notice).toContain("email di conferma");
  });
});
