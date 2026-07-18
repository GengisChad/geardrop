import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../../src/lib/supabase/database.types";

type Role = "owner" | "admin" | "editor";

export default async function globalSetup(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey || !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) {
    throw new Error("Admin browser tests require the local ephemeral Supabase stack");
  }

  const client = createClient<Database>(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const run = randomUUID().slice(0, 8);
  const password = `Local-${run}-Admin!9`;
  const identities: readonly { key: "OWNER" | "ADMIN" | "EDITOR"; role: Role }[] = [
    { key: "OWNER", role: "owner" },
    { key: "ADMIN", role: "admin" },
    { key: "EDITOR", role: "editor" },
  ];

  for (const identity of identities) {
    const email = `${identity.role}-${run}@local.geardrop.test`;
    const created = await client.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error || !created.data.user) throw new Error("Unable to create local staff fixture");
    const profile = await client.from("staff_profiles").insert({
      user_id: created.data.user.id,
      display_name: `Test ${identity.role}`,
      role: identity.role,
      active: true,
    });
    if (profile.error) throw new Error("Unable to create local staff profile");
    process.env[`ADMIN_E2E_${identity.key}_EMAIL`] = email;
  }

  const customerEmail = `customer-${run}@local.geardrop.test`;
  const customer = await client.auth.admin.createUser({ email: customerEmail, password, email_confirm: true });
  if (customer.error) throw new Error("Unable to create local customer fixture");
  process.env.ADMIN_E2E_CUSTOMER_EMAIL = customerEmail;
  process.env.ADMIN_E2E_PASSWORD = password;
  process.env.ADMIN_E2E_RUN = run;

  const category = await client.from("categories").insert({
    name: "Categoria browser test",
    slug: `browser-test-${run}`,
    tagline: "Categoria tecnica per test browser locali",
    description: "Fixture minima richiesta dal form prodotto.",
    active: true,
    sort_order: 0,
  });
  if (category.error) throw new Error("Unable to create local category fixture");
}
