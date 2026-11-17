import type { SupabaseClient } from "@supabase/supabase-js";

type Mfa = Pick<SupabaseClient["auth"]["mfa"], "listFactors" | "unenroll" | "enroll">;

/** What the screens receive: the QR and the secret stay in the component that asked for them. */
export type TotpEnrollmentStart =
  | { readonly ok: true; readonly factorId: string; readonly qrImage: string; readonly secret: string }
  | { readonly ok: false };

export const TOTP_NAME = "GEAR//DROP";

/**
 * Supabase hands the QR as "data:image/svg+xml;utf-8,<svg ...>", raw markup after the comma.
 * The screens show it in an <img>, where the SVG cannot run anything; injected as HTML it ran
 * with the page's privileges and printed its own prefix as text. A raw "#" (fill="#000") would
 * end the data URI early, so raw markup is percent-encoded. Base64 or already encoded sources
 * are left alone.
 */
export function qrImageSource(qrCode: string): string {
  const comma = qrCode.indexOf(",");
  if (!qrCode.startsWith("data:") || comma < 0) {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrCode)}`;
  }
  const body = qrCode.slice(comma + 1);
  if (qrCode.slice(0, comma).includes(";base64") || !body.trimStart().startsWith("<")) return qrCode;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(body)}`;
}

/** The plain name for the first factor, then numbered, so a second one never collides. */
export function nextTotpName(taken: readonly string[]): string {
  if (!taken.includes(TOTP_NAME)) return TOTP_NAME;
  for (let n = 2; ; n += 1) {
    const name = `${TOTP_NAME} ${n}`;
    if (!taken.includes(name)) return name;
  }
}

/**
 * Starts a TOTP enrollment for the signed-in person.
 *
 * Opening the enrollment screen creates an unverified factor. If the person reloads or leaves
 * before typing a code, that factor stays, and Supabase refuses another with the same name: the
 * screen they need in order to get in would fail for good. So abandoned attempts — unverified
 * TOTP factors — are cleared first. Verified factors are never touched here, and the server would
 * refuse to remove one below aal2 anyway. Every failure closes: no partial state reaches a screen.
 */
export async function startTotpEnrollment(mfa: Mfa): Promise<TotpEnrollmentStart> {
  const listed = await mfa.listFactors();
  if (listed.error || !listed.data) return { ok: false };

  const factors = listed.data.all;
  for (const factor of factors) {
    if (factor.factor_type !== "totp" || factor.status !== "unverified") continue;
    const removed = await mfa.unenroll({ factorId: factor.id });
    if (removed.error) return { ok: false };
  }

  const taken = factors
    .filter((factor) => factor.status === "verified")
    .map((factor) => factor.friendly_name ?? "");
  const enrolled = await mfa.enroll({ factorType: "totp", friendlyName: nextTotpName(taken) });
  if (enrolled.error || !enrolled.data) return { ok: false };

  return { ok: true, factorId: enrolled.data.id, qrImage: qrImageSource(enrolled.data.totp.qr_code), secret: enrolled.data.totp.secret };
}
