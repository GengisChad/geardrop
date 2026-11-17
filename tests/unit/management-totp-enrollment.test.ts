import { describe, expect, it, vi } from "vitest";
import { nextTotpName, qrImageSource, startTotpEnrollment, TOTP_NAME } from "../../apps/management/src/lib/management/totp-enrollment";

type Factor = { id: string; factor_type: string; status: "verified" | "unverified"; friendly_name?: string };

function fakeMfa(factors: Factor[], failures: { list?: boolean; unenroll?: boolean; enroll?: boolean } = {}) {
  return {
    listFactors: vi.fn(async () =>
      failures.list ? { data: null, error: new Error("list") } : { data: { all: factors, totp: [], phone: [] }, error: null }),
    unenroll: vi.fn(async ({ factorId }: { factorId: string }) =>
      failures.unenroll ? { data: null, error: new Error("unenroll") } : { data: { id: factorId }, error: null }),
    enroll: vi.fn(async ({ friendlyName }: { factorType: "totp"; friendlyName?: string }) =>
      failures.enroll
        ? { data: null, error: new Error("enroll") }
        : { data: { id: "new-factor", type: "totp", friendly_name: friendlyName, totp: { qr_code: "<svg/>", secret: "SECRET", uri: "otpauth://" } }, error: null }),
  };
}

// An enrollment opened and never verified leaves an unverified factor behind, and Supabase
// refuses another with the same name: a page reload would have locked a partner out of the
// screen they need to get in. Abandoned attempts are cleared first; verified factors never.
describe("starting a TOTP enrollment", () => {
  it("clears an abandoned attempt before starting a new one", async () => {
    const mfa = fakeMfa([{ id: "stale", factor_type: "totp", status: "unverified", friendly_name: TOTP_NAME }]);
    const result = await startTotpEnrollment(mfa as never);
    expect(mfa.unenroll).toHaveBeenCalledWith({ factorId: "stale" });
    expect(mfa.enroll).toHaveBeenCalledWith({ factorType: "totp", friendlyName: TOTP_NAME });
    expect(result).toEqual({ ok: true, factorId: "new-factor", qrImage: "data:image/svg+xml;charset=utf-8,%3Csvg%2F%3E", secret: "SECRET" });
  });

  it("never removes a verified factor, and names the next one so it cannot collide", async () => {
    const mfa = fakeMfa([{ id: "kept", factor_type: "totp", status: "verified", friendly_name: TOTP_NAME }]);
    await startTotpEnrollment(mfa as never);
    expect(mfa.unenroll).not.toHaveBeenCalled();
    expect(mfa.enroll).toHaveBeenCalledWith({ factorType: "totp", friendlyName: `${TOTP_NAME} 2` });
  });

  it("leaves other kinds of factor alone", async () => {
    const mfa = fakeMfa([{ id: "phone", factor_type: "phone", status: "unverified" }]);
    await startTotpEnrollment(mfa as never);
    expect(mfa.unenroll).not.toHaveBeenCalled();
  });

  it("fails closed when the factors cannot be read", async () => {
    const mfa = fakeMfa([], { list: true });
    expect(await startTotpEnrollment(mfa as never)).toEqual({ ok: false });
    expect(mfa.enroll).not.toHaveBeenCalled();
  });

  it("fails closed when an abandoned attempt cannot be cleared", async () => {
    const mfa = fakeMfa([{ id: "stale", factor_type: "totp", status: "unverified" }], { unenroll: true });
    expect(await startTotpEnrollment(mfa as never)).toEqual({ ok: false });
    expect(mfa.enroll).not.toHaveBeenCalled();
  });

  it("fails closed when Supabase refuses the enrollment", async () => {
    expect(await startTotpEnrollment(fakeMfa([], { enroll: true }) as never)).toEqual({ ok: false });
  });
});

// Supabase hands the QR as "data:image/svg+xml;utf-8,<svg ...>", raw markup after the comma.
// Injected as HTML, the prefix showed up as text above the code and the SVG ran with the page's
// privileges; inside an <img> it cannot run anything. A raw "#" (as in fill="#000") would end
// the data URI early, so the markup is percent-encoded.
describe("showing the QR code", () => {
  it("turns Supabase's raw SVG data URI into a safely encoded image source", () => {
    const src = qrImageSource('data:image/svg+xml;utf-8,<svg fill="#000"><rect/></svg>');
    expect(src.startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true);
    expect(src).not.toContain("#");
    expect(src).not.toContain("<");
    expect(decodeURIComponent(src.slice(src.indexOf(",") + 1))).toBe('<svg fill="#000"><rect/></svg>');
  });

  it("leaves a base64 or already encoded source as it is", () => {
    expect(qrImageSource("data:image/svg+xml;base64,PHN2Zy8+")).toBe("data:image/svg+xml;base64,PHN2Zy8+");
    expect(qrImageSource("data:image/svg+xml;utf-8,%3Csvg%2F%3E")).toBe("data:image/svg+xml;utf-8,%3Csvg%2F%3E");
  });

  it("wraps bare SVG markup", () => {
    expect(qrImageSource("<svg/>")).toBe("data:image/svg+xml;charset=utf-8,%3Csvg%2F%3E");
  });

  it("is shown as an image on both screens, never injected as HTML", async () => {
    const { readFileSync: read } = await import("node:fs");
    const { join } = await import("node:path");
    const app = join(process.cwd(), "apps/management/src");
    for (const file of ["components/mfa-enrollment.tsx", "app/(protected)/account/_mfa-panel.tsx"]) {
      const source = read(join(app, file), "utf8");
      expect(source, file).not.toContain("dangerouslySetInnerHTML");
      expect(source, file).toMatch(/<img[^>]*src=\{[^}]*qrImage\}/);
    }
  });
});

describe("naming a factor", () => {
  it("uses the plain name first, then numbers the rest", () => {
    expect(nextTotpName([])).toBe(TOTP_NAME);
    expect(nextTotpName([TOTP_NAME])).toBe(`${TOTP_NAME} 2`);
    expect(nextTotpName([TOTP_NAME, `${TOTP_NAME} 2`])).toBe(`${TOTP_NAME} 3`);
    expect(nextTotpName([`${TOTP_NAME} 2`])).toBe(TOTP_NAME);
  });
});

// Both screens that enroll a factor go through the same function, so the fix cannot be
// applied to one and forgotten in the other.
describe("the screens that enroll a factor", () => {
  it("share one enrollment path", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const app = join(process.cwd(), "apps/management/src");
    for (const file of ["components/mfa-enrollment.tsx", "app/(protected)/account/_mfa-panel.tsx"]) {
      const source = readFileSync(join(app, file), "utf8");
      expect(source, file).toContain("startTotpEnrollment(");
      expect(source, file).not.toMatch(/\.mfa\s*\.enroll\(/);
    }
  });
});
