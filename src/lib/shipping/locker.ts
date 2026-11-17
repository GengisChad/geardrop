/**
 * An InPost Locker as the buyer and the admin see it. Kept apart from the API client (inpost.ts),
 * which holds the credentials and Node-only code, so the browser's Locker picker can import it.
 */
export type Locker = {
  /** InPost's id, "IT_ITROM44128M". */
  readonly id: string;
  /** The code printed on the Locker, "ITROM44128M". */
  readonly code: string;
  readonly street: string;
  readonly postalCode: string;
  readonly city: string;
  readonly province: string | null;
  /** Where it stands: "ATAC - Metro A e B -Termini". */
  readonly place: string | null;
  /** Metres from the searched CAP or position, when the search had one. */
  readonly distance: number | null;
  readonly openAllDay: boolean;
};

/** The bare Locker code the Shipping API takes: "IT_ITROM44128M" → "ITROM44128M". */
export function lockerCode(id: string): string {
  return id.trim().replace(/^[A-Z]{2}_/, "");
}

/**
 * One line for the order, the emails and the admin:
 * "ITROM44128M · piazza dei Cinquecento 48, 00185 Roma (ATAC - Metro A e B -Termini)".
 * It fits the 160 characters the checkout keeps for the pickup point.
 */
export function lockerLabel(locker: Pick<Locker, "code" | "street" | "postalCode" | "city" | "place">): string {
  const where = [locker.street, `${locker.postalCode} ${locker.city}`.trim()].filter(Boolean).join(", ");
  const text = `${locker.code} · ${where}${locker.place ? ` (${locker.place})` : ""}`;
  return text.length > 160 ? `${text.slice(0, 159)}…` : text;
}
