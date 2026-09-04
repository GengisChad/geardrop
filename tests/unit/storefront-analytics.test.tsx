import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  pathname: "/negozio",
  renderAnalytics: vi.fn(() => null),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
}));

vi.mock("@vercel/analytics/next", () => ({
  Analytics: mocks.renderAnalytics,
}));

import { StorefrontAnalytics } from "@/components/analytics/storefront-analytics";

function renderAnalytics(enabled = true) {
  renderToStaticMarkup(<StorefrontAnalytics enabled={enabled} />);
}

describe("StorefrontAnalytics", () => {
  beforeEach(() => {
    mocks.pathname = "/negozio";
    mocks.renderAnalytics.mockClear();
  });

  it.each([
    "/account",
    "/account/orders",
    "/admin",
    "/admin/orders/123",
    "/auth",
    "/auth/callback",
    "/carrello",
    "/carrello/riepilogo",
    "/checkout",
    "/checkout/conferma",
    "/login",
    "/login/callback",
    "/registrati",
    "/registrati/conferma",
    "/password-dimenticata",
    "/password-dimenticata/conferma",
    "/nuova-password",
    "/nuova-password/conferma",
    "/conferma-email",
    "/conferma-email/esito",
    "/conferma-recupero",
    "/conferma-recupero/esito",
    "/preferiti",
    "/preferiti/condivisi",
  ])("does not mount an Analytics instance on sensitive path %s", (pathname) => {
    mocks.pathname = pathname;

    renderAnalytics();

    expect(mocks.renderAnalytics).not.toHaveBeenCalled();
  });

  it.each([
    "/accounting",
    "/administrator",
    "/authentication",
    "/carrellone",
    "/checkout-guide",
    "/logins",
    "/registrati-al-torneo",
    "/preferiti-dalla-community",
  ])("mounts on similarly prefixed public path %s", (pathname) => {
    mocks.pathname = pathname;

    renderAnalytics();

    expect(mocks.renderAnalytics).toHaveBeenCalledOnce();
  });

  it("unmounts after public-to-auth navigation and remounts after returning public", () => {
    renderAnalytics();
    expect(mocks.renderAnalytics).toHaveBeenCalledOnce();

    mocks.renderAnalytics.mockClear();
    mocks.pathname = "/login";
    renderAnalytics();
    expect(mocks.renderAnalytics).not.toHaveBeenCalled();

    mocks.pathname = "/negozio/beyblade-x";
    renderAnalytics();
    expect(mocks.renderAnalytics).toHaveBeenCalledOnce();
  });

  it("preserves the server-provided production gate on public routes", () => {
    renderAnalytics(false);

    expect(mocks.renderAnalytics).not.toHaveBeenCalled();
  });
});
