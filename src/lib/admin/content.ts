import { z } from "zod";

export const homepageSectionIdSchema = z.coerce.number().int().positive();
const targetIds = z.array(homepageSectionIdSchema).max(100).superRefine((ids, context) => {
  if (new Set(ids).size !== ids.length) context.addIssue({ code: "custom", message: "Target duplicati" });
});
const nullableText = (max: number) => z.string().trim().max(max).transform((value) => value || null).nullable();

export function isSafeContentHref(value: string): boolean {
  const href = value.trim();
  if (!href || /[\s<>\\]/.test(href) || href.startsWith("//")) return false;
  return href.startsWith("/") || href.startsWith("#") || /^https:\/\//i.test(href)
    || /^mailto:/i.test(href) || /^tel:/i.test(href);
}

export const safeContentHrefSchema = z.string().trim().min(1).max(2048).refine(isSafeContentHref, "Link non sicuro");
const commonSectionFields = {
  id: homepageSectionIdSchema.optional(),
  sectionKey: z.string().trim().min(2).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  eyebrow: nullableText(120),
  title: nullableText(200),
  subtitle: nullableText(300),
  description: nullableText(12_000),
  desktopMediaAssetId: homepageSectionIdSchema.nullable(),
  mobileMediaAssetId: homepageSectionIdSchema.nullable(),
  ctaLabel: nullableText(120),
  ctaHref: safeContentHrefSchema.nullable(),
  publicationStatus: z.enum(["draft", "published", "archived"]),
  startsAt: z.iso.datetime({ offset: true }).nullable(),
  endsAt: z.iso.datetime({ offset: true }).nullable(),
  active: z.boolean(),
  sortOrder: z.coerce.number().int().min(-1_000_000).max(1_000_000),
};
const noTargets = targetIds.length(0);
const manyTargets = targetIds.min(1);
const oneTarget = targetIds.length(1);
const section = <T extends string>(sectionType: T, targets: typeof targetIds) => z.object({
  ...commonSectionFields,
  sectionType: z.literal(sectionType),
  targetIds: targets,
});

export const homepageSectionSchema = z.discriminatedUnion("sectionType", [
  section("hero", noTargets),
  section("announcement", noTargets),
  section("featured_products", manyTargets),
  section("latest_drops", manyTargets),
  section("categories", manyTargets),
  section("competitive_products", manyTargets),
  section("bestsellers", manyTargets),
  section("new_arrivals", manyTargets),
  section("offers", manyTargets),
  section("bundle", oneTarget),
  section("club", noTargets),
  section("status_legend", noTargets),
  section("trust", noTargets),
  section("newsletter", noTargets),
  section("promo_banner", noTargets),
  section("rich_text", noTargets),
  section("cta", noTargets),
]).superRefine((value, context) => {
  if ((value.ctaLabel === null) !== (value.ctaHref === null)) {
    context.addIssue({ code: "custom", path: ["ctaHref"], message: "Etichetta e link CTA devono essere completi" });
  }
  if (value.startsAt && value.endsAt && new Date(value.endsAt) <= new Date(value.startsAt)) {
    context.addIssue({ code: "custom", path: ["endsAt"], message: "La fine deve seguire l'inizio" });
  }
});

export const contentPageSchema = z.object({
  id: homepageSectionIdSchema.optional(),
  slug: z.string().trim().min(2).max(160).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().trim().min(1).max(160),
  excerpt: nullableText(500),
  markdownSource: z.string().trim().min(1).max(100_000).refine((value) => !/<[^>]*>/.test(value), "HTML non consentito"),
  seoTitle: nullableText(70),
  seoDescription: nullableText(180),
  publicationStatus: z.enum(["draft", "published", "archived"]),
  startsAt: z.iso.datetime({ offset: true }).nullable(),
  endsAt: z.iso.datetime({ offset: true }).nullable(),
  active: z.boolean(),
  sortOrder: z.coerce.number().int().min(-1_000_000).max(1_000_000),
}).superRefine((value, context) => {
  if (value.startsAt && value.endsAt && new Date(value.endsAt) <= new Date(value.startsAt)) {
    context.addIssue({ code: "custom", path: ["endsAt"], message: "La fine deve seguire l'inizio" });
  }
});

export type NavigationItemInput = {
  readonly label: string;
  readonly href: string;
  readonly active: boolean;
  readonly children: readonly NavigationItemInput[];
};
export const navigationItemSchema: z.ZodType<NavigationItemInput> = z.lazy(() => z.object({
  label: z.string().trim().min(1).max(120),
  href: safeContentHrefSchema,
  active: z.boolean(),
  children: z.array(navigationItemSchema).max(100),
}));
export const navigationTreeSchema = z.object({
  menu: z.object({
    key: z.string().trim().min(2).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    label: z.string().trim().min(1).max(120),
    publicationStatus: z.enum(["draft", "published", "archived"]),
    active: z.boolean(),
  }),
  items: z.array(navigationItemSchema).max(100),
});

export type HomepageSectionInput = z.infer<typeof homepageSectionSchema>;
export type ContentPageInput = z.infer<typeof contentPageSchema>;
export type NavigationTreeInput = z.infer<typeof navigationTreeSchema>;
