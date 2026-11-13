/**
 * The owner, 2026-11-13: a banner as the shop opens, "Questo è solo il primo drop, iscriviti per le
 * novità", in the violet docked look he picked. Double opt-in, an unsubscribe link, and a banner that
 * does not nag.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LEGAL_PAGES } from "@/data/pages";
import { newsletterConfirmEmail } from "@/lib/newsletter/confirm-email";
import {
  NEWSLETTER_CONSENT_TEXT,
  NEWSLETTER_HEADLINE,
  NEWSLETTER_PROMISE,
  NEWSLETTER_SNOOZE_DAYS,
  isNewsletterToken,
  newsletterBannerDue,
  newsletterUnsubscribeUrl,
} from "@/lib/newsletter/newsletter";

const DAY = 86_400_000;
const NOW = Date.parse("2026-11-13T12:00:00Z");
const TOKEN = "3f2c9a54-8e1b-4c6d-9a0f-7b5e2d1c4a98";

describe("the newsletter banner's timing", () => {
  it("opens for a visitor who never answered it", () => {
    expect(newsletterBannerDue(null, NOW)).toBe(true);
  });

  it("stays away for 30 days once closed, then asks again", () => {
    expect(newsletterBannerDue(`closed:${NOW - DAY}`, NOW)).toBe(false);
    expect(newsletterBannerDue(`closed:${NOW - (NEWSLETTER_SNOOZE_DAYS - 1) * DAY}`, NOW)).toBe(false);
    expect(newsletterBannerDue(`closed:${NOW - NEWSLETTER_SNOOZE_DAYS * DAY}`, NOW)).toBe(true);
  });

  it("never comes back after a signup", () => {
    expect(newsletterBannerDue("joined", NOW + 365 * DAY)).toBe(false);
  });

  it("treats anything it cannot read as no answer", () => {
    expect(newsletterBannerDue("closed:yesterday", NOW)).toBe(true);
    expect(newsletterBannerDue("{}", NOW)).toBe(true);
  });
});

describe("the consent it keeps", () => {
  it("is the owner's headline and the promise printed under the form", () => {
    expect(NEWSLETTER_HEADLINE).toBe("Questo è solo il primo drop, iscriviti per le novità");
    expect(NEWSLETTER_CONSENT_TEXT).toContain(NEWSLETTER_HEADLINE);
    expect(NEWSLETTER_CONSENT_TEXT).toContain(NEWSLETTER_PROMISE);
    // The database refuses a consent text outside 10-500 characters.
    expect(NEWSLETTER_CONSENT_TEXT.length).toBeGreaterThanOrEqual(10);
    expect(NEWSLETTER_CONSENT_TEXT.length).toBeLessThanOrEqual(500);
  });

  it("is in the privacy notice, with its legal basis and how long it lasts", () => {
    const privacy = JSON.stringify(LEGAL_PAGES.privacy);
    expect(privacy).toContain("Novità: se ti iscrivi dal banner della home");
    expect(privacy).toContain("art. 6.1.a GDPR): lo dai iscrivendoti e lo confermi dal link");
    expect(privacy).toContain("Un'iscrizione non confermata entro 30 giorni viene eliminata");
  });
});

describe("the confirmation email", () => {
  const email = newsletterConfirmEmail({ to: "fan@example.com", token: TOKEN });

  it("goes to the address that signed up, with a link to the confirm page", () => {
    expect(email.to).toBe("fan@example.com");
    expect(email.text).toContain(`https://geardropshop.it/newsletter/conferma?t=${TOKEN}`);
    expect(email.html).toContain(`https://geardropshop.it/newsletter/conferma?t=${TOKEN}`);
  });

  it("tells a stranger that ignoring it is enough", () => {
    expect(email.text).toContain("senza conferma non ti scriviamo");
  });

  it("goes out at most once a day per signup, even if the form is sent twice", () => {
    expect(email.idempotencyKey).toMatch(new RegExp(`^gd-newsletter-confirm-${TOKEN}-\\d{4}-\\d{2}-\\d{2}$`));
  });
});

describe("the links", () => {
  it("only accept a token shaped like the database's", () => {
    expect(isNewsletterToken(TOKEN)).toBe(true);
    expect(isNewsletterToken("not-a-token")).toBe(false);
    expect(isNewsletterToken(undefined)).toBe(false);
  });

  it("give each subscriber an unsubscribe link of their own", () => {
    expect(newsletterUnsubscribeUrl("https://geardropshop.it", TOKEN)).toBe(`https://geardropshop.it/newsletter/disiscriviti?t=${TOKEN}`);
  });
});

describe("the migration", () => {
  const migration = readFileSync("supabase/migrations/20261114090000_newsletter_subscribers.sql", "utf8");

  it("keeps the list and its functions away from the public", () => {
    expect(migration).toContain("revoke all on table public.newsletter_subscribers from anon, authenticated;");
    for (const fn of ["newsletter_signup(text, text, text)", "newsletter_confirm(uuid)", "newsletter_unsubscribe(uuid)"]) {
      expect(migration).toContain(`revoke all on function public.${fn} from public, anon, authenticated;`);
      expect(migration).toContain(`grant execute on function public.${fn} to service_role;`);
    }
  });
});
