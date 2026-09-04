/**
 * Legal identity and affiliation behind GEAR//DROP.
 *
 * GEAR//DROP is the official store affiliated to Gear Sports Italia (the amateur-sport
 * body / platform published at ibna.it); the operating legal entity — the *seller* of
 * record and the data controller — is the SSD below.
 *
 * These are the values the law requires to be shown to visitors: seller identification
 * (art. 7 D.Lgs. 70/2003, art. 2250 c.c., art. 49 Codice del Consumo) and data-controller
 * identity (GDPR art. 13). The footer and the legal pages read from here, so this file is
 * the single source of truth — update the company data in one place only.
 *
 * Source: Gear Sports Italia app repo (src/lib/company.ts), verified 2026-09-04.
 */
export const COMPANY_LEGAL = {
  legalName: "GEAR SPORTS ITALIA SSD S.R.L.",
  legalForm: "Società Sportiva Dilettantistica a responsabilità limitata",
  vatNumber: "18655971002",
  euVatNumber: "IT18655971002",
  taxCode: "18655971002",
  reaNumber: "RM-1798451",
  registeredOffice: "Via Gizzeria 120, 00132 Roma (RM)",
  certifiedEmail: "gearsports@pec.it",
  /** Operational shop contacts (already used across the support pages). */
  supportEmail: "supporto@geardrop.it",
  partnerEmail: "partner@geardrop.it",
} as const;

/**
 * How GEAR//DROP presents its relationship to Gear Sports Italia. Textual only: no GSI
 * logo asset is bundled here (the brief forbids reusing external/AI images), so add one
 * only when the vector lockup is supplied and cleared.
 */
export const AFFILIATION = {
  parentName: "Gear Sports Italia",
  parentShort: "GSI",
  parentSite: "ibna.it",
  // The shop is operated by GEAR SPORTS ITALIA SSD S.R.L. itself; the badge states the
  // public positioning using the brand/org name, so it does not read as "affiliated to its
  // own legal entity". The full legal seller sits in the footer's fine print and terms.
  statement: "Affiliato ufficiale Gear Sports Italia",
} as const;
