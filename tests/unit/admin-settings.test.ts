import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { orderAcceptanceSchema, seoSettingsSchema, shippingMethodSchema, socialSettingsSchema, storeSettingsSchema } from "@/lib/admin/settings";

describe("admin settings", () => {
  it("validates shipping costs, thresholds, unique areas, estimates, and order", () => {
    expect(shippingMethodSchema.safeParse({ name:"Standard",code:"standard",description:null,priceCents:500,freeFromCents:5000,countryCodes:["IT","FR"],estimateMinDays:2,estimateMaxDays:5,active:true,sortOrder:1 }).success).toBe(true);
    expect(shippingMethodSchema.safeParse({ name:"Bad",code:"bad",description:null,priceCents:-1,freeFromCents:null,countryCodes:["IT","IT"],estimateMinDays:8,estimateMaxDays:2,active:true,sortOrder:0 }).success).toBe(false);
  });

  it("validates typed store, SEO, and social values", () => {
    expect(storeSettingsSchema.safeParse({ storeName:"GEAR//DROP",legalName:"GearDrop Srl",vatNumber:null,taxCode:null,currency:"EUR",maxQuantityPerLine:10,legalNotice:null,maintenanceMode:false,maintenanceMessage:null,uploadMaxBytes:10_485_760 }).success).toBe(true);
    expect(seoSettingsSchema.safeParse({ title:"x".repeat(71),description:null,ogImageUrl:null }).success).toBe(false);
    expect(socialSettingsSchema.safeParse({ instagramUrl:"javascript:bad",facebookUrl:null,tiktokUrl:null,youtubeUrl:null }).success).toBe(false);
  });

  it("requires exact activation and deactivation confirmations", () => {
    expect(orderAcceptanceSchema.safeParse({ enabled:true,confirmation:"ATTIVA ORDINI" }).success).toBe(true);
    expect(orderAcceptanceSchema.safeParse({ enabled:false,confirmation:"DISATTIVA ORDINI" }).success).toBe(true);
    expect(orderAcceptanceSchema.safeParse({ enabled:true,confirmation:"attiva ordini" }).success).toBe(false);
  });

  it("routes every mutation through authenticated validated server actions", () => {
    const source=readFileSync(join(process.cwd(),"src/app/admin/actions/settings.ts"),"utf8");
    for(const schema of ["shippingMethodSchema","storeSettingsSchema","seoSettingsSchema","contactSettingsSchema","socialSettingsSchema","orderAcceptanceSchema"])expect(source).toContain(`${schema}.safeParse`);
    expect(source).toContain("requireStaffRole"); expect(source).toContain('rpc("set_order_acceptance"');
  });

  it("provides every settings route and a live checklist without raw JSON", () => {
    for(const file of ["spedizioni/page.tsx","impostazioni/page.tsx","impostazioni/negozio/page.tsx","impostazioni/seo/page.tsx","impostazioni/contatti/page.tsx","impostazioni/social/page.tsx"]){
      const source=readFileSync(join(process.cwd(),"src/app/admin/(protected)",file),"utf8"); expect(source).not.toContain("JSON.stringify");
    }
    const index=readFileSync(join(process.cwd(),"src/app/admin/(protected)/impostazioni/page.tsx"),"utf8"); expect(index).toContain("loadOrderEnablementChecks");
  });
});
