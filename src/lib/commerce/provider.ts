import "server-only";import { createMockProvider } from "./mock-provider";import { createSupabaseCommerceProvider } from "./supabase-provider";import type { CommerceProvider } from "./types";import { createSupabaseServerClient } from "@/lib/supabase/server";
export type ProviderName="mock"|"supabase";
export function resolveCommerceProviderName(value:string|undefined=process.env["COMMERCE_PROVIDER"] ?? "mock"):ProviderName{if(value==="mock"||value==="supabase")return value;throw new Error(`Provider commerce non supportato: ${value}`);}
export async function getCommerceProvider():Promise<CommerceProvider>{const requested=resolveCommerceProviderName();if(requested==="mock")return createMockProvider();const client=await createSupabaseServerClient();return createSupabaseCommerceProvider(client);}
export const commerce:CommerceProvider=createMockProvider();
export type{CommerceProvider};
