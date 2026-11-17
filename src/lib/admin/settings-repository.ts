import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export async function loadStoreSettings(client:SupabaseClient<Database>,organizationId:number){const result=await client.from("site_settings").select("*").eq("organization_id",organizationId).single();if(result.error)throw new Error("Impossibile caricare le impostazioni");return result.data;}
export async function loadShippingMethods(client:SupabaseClient<Database>,organizationId:number){const result=await client.from("shipping_methods").select("*").eq("organization_id",organizationId).order("sort_order").order("id");if(result.error)throw new Error("Impossibile caricare le spedizioni");return result.data??[];}
export async function loadOrderEnablementChecks(client:SupabaseClient<Database>,organizationId:number){const result=await client.from("order_enablement_checks").select("*").eq("organization_id",organizationId).order("key");if(result.error)throw new Error("Impossibile caricare la checklist ordini");return result.data??[];}
