import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NextRequest } from "next/server";
import type { CookieOptions } from "@supabase/ssr";
import { AuthApiError } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Cookie = { name: string; value: string; options?: CookieOptions };
const mocks = vi.hoisted(() => ({
  browser: vi.fn(), server: vi.fn(), getUser: vi.fn(), getAll: vi.fn(), set: vi.fn(),
}));
vi.mock("@supabase/ssr", () => ({ createBrowserClient: mocks.browser, createServerClient: mocks.server }));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: mocks.getAll, set: mocks.set }) }));
const env = {
  NEXT_PUBLIC_APP_SURFACE: "management", NEXT_PUBLIC_SUPABASE_URL: "https://ci-management.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "ci-publishable-key", NEXT_PUBLIC_EXPECTED_SUPABASE_PROJECT_REF: "ci-management",
  MANAGEMENT_ORIGIN: "https://management-ci.invalid", STOREFRONT_ORIGIN: "https://storefront-ci.invalid",
};
async function helpers() {
  expect(existsSync(resolve("apps/management/src/lib/supabase/server.ts"))).toBe(true);
  return {
    ...await import("../../apps/management/src/lib/supabase/client"),
    ...await import("../../apps/management/src/lib/supabase/server"),
    ...await import("../../apps/management/src/lib/supabase/proxy"),
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  mocks.server.mockReturnValue({ auth: { getUser: mocks.getUser } });
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
  mocks.getAll.mockReturnValue([{ name: "old", value: "session" }]);
});
afterEach(() => vi.unstubAllEnvs());
describe("management-owned Supabase SSR", () => {
  it("validates the target before constructing any client", async () => {
    const h = await helpers();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://wrong.supabase.co");
    expect(() => h.createManagementBrowserClient()).toThrow("GD_MANAGEMENT_PROJECT_MISMATCH");
    await expect(h.createManagementServerClient()).rejects.toThrow("GD_MANAGEMENT_PROJECT_MISMATCH");
    await expect(h.updateManagementSession(new NextRequest("https://management-ci.invalid/"))).rejects.toThrow("GD_MANAGEMENT_PROJECT_MISMATCH");
    expect(mocks.server).not.toHaveBeenCalled(); expect(mocks.browser).not.toHaveBeenCalled();
  });
  it("browser consumes only public inputs and rejects a secret placed in the public key", async () => {
    const h = await helpers();
    vi.stubEnv("MANAGEMENT_ORIGIN", ""); vi.stubEnv("SUPABASE_SECRET_KEY", "must-not-flow-to-browser");
    h.createManagementBrowserClient();
    expect(mocks.browser).toHaveBeenCalledWith("https://ci-management.supabase.co", "ci-publishable-key");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_secret_private");
    expect(() => h.createManagementBrowserClient()).toThrow("GD_MANAGEMENT_PUBLIC_KEY_INVALID");
    for (const file of ["client.ts", "env.ts"]) expect(readFileSync(resolve("apps/management/src/lib/supabase", file), "utf8")).not.toContain("process.env.SUPABASE_SECRET_KEY");
  });
  it("preserves every cookie attribute and only tolerates the Server Component write restriction", async () => {
    const h = await helpers(); await h.createManagementServerClient();
    const adapter = mocks.server.mock.calls[0]![2].cookies as { getAll: () => Cookie[]; setAll: (cookies: Cookie[]) => void };
    expect(adapter.getAll()).toEqual([{ name: "old", value: "session" }]);
    const options: CookieOptions = { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 123, domain: "management-ci.invalid", priority: "high" };
    adapter.setAll([{ name: "sb-token", value: "new", options }]);
    expect(mocks.set).toHaveBeenCalledWith("sb-token", "new", options);
    mocks.set.mockImplementation(() => { throw new Error("Cookies can only be modified in a Server Action or Route Handler."); });
    expect(() => adapter.setAll([{ name: "sb-token", value: "new" }])).not.toThrow();
    mocks.set.mockImplementation(() => { throw new Error("unexpected store error"); });
    expect(() => adapter.setAll([{ name: "sb-token", value: "new" }])).toThrow("unexpected store error");
  });
  it("refreshes request and response cookies across multiple batches and verifies with getUser", async () => {
    const h = await helpers();
    mocks.server.mockImplementation((_url, _key, { cookies }) => ({ auth: { getUser: async () => {
      expect(cookies.getAll()).toEqual([{ name: "old", value: "value" }]);
      cookies.setAll([{ name: "first", value: "one", options: { httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: 100 } }]);
      cookies.setAll([{ name: "second", value: "two", options: { path: "/" } }]);
      return mocks.getUser();
    } } }));
    const request = new NextRequest("https://management-ci.invalid/", { headers: { cookie: "old=value" } });
    const response = await h.updateManagementSession(request);
    expect(mocks.getUser).toHaveBeenCalledOnce();
    expect(request.cookies.get("first")?.value).toBe("one");
    expect(request.cookies.get("second")?.value).toBe("two");
    expect(response.cookies.get("first")).toMatchObject({ value: "one", httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: 100 });
    expect(response.cookies.get("second")?.value).toBe("two");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("fails closed on unexpected authentication failure", async () => {
    const h = await helpers(); mocks.getUser.mockRejectedValue(new Error("auth unavailable"));
    await expect(h.updateManagementSession(new NextRequest("https://management-ci.invalid/"))).rejects.toThrow("auth unavailable");
  });
  it.each(["refresh_token_not_found", "refresh_token_already_used", "session_not_found", "session_expired"] as const)
  ("keeps anonymous login and cleanup cookies for terminal session error %s", async code => {
    const h = await helpers();
    mocks.server.mockImplementation((_url, _key, { cookies }) => ({ auth: { getUser: async () => {
      expect(cookies.getAll()).toEqual([{ name: "sb-session", value: "expired" }]);
      cookies.setAll([{ name: "sb-session", value: "", options: { maxAge: 0, path: "/", secure: true, sameSite: "lax" } }]);
      return { data: { user: null }, error: new AuthApiError("Session is no longer valid", 400, code) };
    } } }));
    const request = new NextRequest("https://management-ci.invalid/login", { headers: { cookie: "sb-session=expired" } });
    const response = await h.updateManagementSession(request);
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.cookies.get("sb-session")).toMatchObject({ value: "", maxAge: 0, path: "/", secure: true, sameSite: "lax" });
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(request.cookies.get("sb-session")?.value).toBe("");
  });
  it.each([
    ["unexpected_failure", 500], ["request_timeout", 504], ["over_request_rate_limit", 429],
  ] as const)("fails closed for returned infrastructure or unexpected auth error %s", async (code, status) => {
    const h = await helpers();
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: new AuthApiError("Auth unavailable", status, code) });
    await expect(h.updateManagementSession(new NextRequest("https://management-ci.invalid/login"))).rejects.toThrow("GD_MANAGEMENT_SESSION_UNAVAILABLE");
  });
  it("classifies forbidden requests before session refresh and serves static assets without auth", async () => {
    await helpers();
    const { proxy } = await import("../../apps/management/src/proxy");
    for (const [path, method] of [["/api/stripe/webhook", "POST"], ["/unknown", "GET"], ["/login", "DELETE"]]) {
      expect((await proxy(new NextRequest(`https://management-ci.invalid${path}`, { method }))).status).toBe(404);
    }
    expect((await proxy(new NextRequest("https://management-ci.invalid/robots.txt"))).status).toBe(200);
    expect(mocks.server).not.toHaveBeenCalled();
    expect((await proxy(new NextRequest("https://management-ci.invalid/"))).status).toBe(200);
    expect(mocks.getUser).toHaveBeenCalledOnce();
  });
});
