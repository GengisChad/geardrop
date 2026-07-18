import { z } from "zod";

const nullable = (max:number)=>z.string().trim().max(max).transform(value=>value||null).nullable();
const httpsUrl=z.union([z.url({protocol:/^https$/}),z.literal(""),z.null()]).transform(value=>value||null);
const id=z.coerce.number().int().positive();

export const shippingMethodSchema=z.object({
  id:id.optional(),name:z.string().trim().min(1).max(160),code:z.string().trim().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),description:nullable(1000),
  priceCents:z.coerce.number().int().nonnegative(),freeFromCents:z.coerce.number().int().positive().nullable(),
  countryCodes:z.array(z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/)).min(1).max(50).refine(value=>new Set(value).size===value.length,"Aree duplicate"),
  estimateMinDays:z.coerce.number().int().min(0).max(365),estimateMaxDays:z.coerce.number().int().min(0).max(365),active:z.boolean(),sortOrder:z.coerce.number().int().min(-100000).max(100000),
}).refine(value=>value.estimateMinDays<=value.estimateMaxDays,{path:["estimateMaxDays"],message:"Stima massima non valida"});

export const storeSettingsSchema=z.object({
  storeName:z.string().trim().min(1).max(160),legalName:z.string().trim().min(1).max(200),vatNumber:nullable(32),taxCode:nullable(32),currency:z.literal("EUR"),
  maxQuantityPerLine:z.coerce.number().int().min(1).max(1000),legalNotice:nullable(10000),maintenanceMode:z.boolean(),maintenanceMessage:nullable(1000),uploadMaxBytes:z.coerce.number().int().min(1_048_576).max(52_428_800),
}).refine(value=>!value.maintenanceMode||Boolean(value.maintenanceMessage),{path:["maintenanceMessage"],message:"Messaggio manutenzione richiesto"});

export const seoSettingsSchema=z.object({title:z.string().trim().max(70),description:nullable(180),ogImageUrl:httpsUrl});
export const contactSettingsSchema=z.object({supportEmail:z.email().nullable(),supportPhone:nullable(40),streetAddress:nullable(240),city:nullable(120),postalCode:nullable(20),countryCode:z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/)});
export const socialSettingsSchema=z.object({instagramUrl:httpsUrl,facebookUrl:httpsUrl,tiktokUrl:httpsUrl,youtubeUrl:httpsUrl});
export const orderAcceptanceSchema=z.object({enabled:z.boolean(),confirmation:z.string().trim()}).superRefine((value,context)=>{const exact=value.enabled?"ATTIVA ORDINI":"DISATTIVA ORDINI";if(value.confirmation!==exact)context.addIssue({code:"custom",path:["confirmation"],message:`Digita ${exact}`});});
export const manualOrderCheckSchema=z.object({key:z.literal("payments"),status:z.enum(["passed","failed"]),evidence:z.string().trim().min(3).max(1000)});
export const shippingMethodIdSchema=id;
