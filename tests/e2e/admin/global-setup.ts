import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../../src/lib/supabase/database.types";
import { localPsql } from "../support/local-psql";

type Role = "owner" | "admin" | "editor";
type Company = "geardrop" | "oryvenne";

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
  // The owner works for both companies, as the two partners do; admin and editor for Gear Drop
  // only; one more owner works for Oryvenne alone, to prove Gear Drop stays out of reach.
  const identities: readonly { key: "OWNER" | "ADMIN" | "EDITOR" | "ORYVENNE_OWNER"; role: Role; companies: readonly Company[] }[] = [
    { key: "OWNER", role: "owner", companies: ["geardrop", "oryvenne"] },
    { key: "ADMIN", role: "admin", companies: ["geardrop"] },
    { key: "EDITOR", role: "editor", companies: ["geardrop"] },
    { key: "ORYVENNE_OWNER", role: "owner", companies: ["oryvenne"] },
  ];
  const staffRows: { readonly userId: string; readonly role: Role; readonly displayName: string; readonly companies: readonly Company[] }[] = [];

  for (const identity of identities) {
    const email = `${identity.key.toLowerCase().replaceAll("_", "-")}-${run}@local.geardrop.test`;
    const created = await client.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error || !created.data.user) throw new Error("Unable to create local staff fixture");
    staffRows.push({ userId: created.data.user.id, role: identity.role, displayName: `Test ${identity.key.toLowerCase()}`, companies: identity.companies });
    process.env[`ADMIN_E2E_${identity.key}_EMAIL`] = email;
  }

  const customerEmail = `customer-${run}@local.geardrop.test`;
  const customer = await client.auth.admin.createUser({ email: customerEmail, password, email_confirm: true });
  if (customer.error) throw new Error("Unable to create local customer fixture");
  process.env.ADMIN_E2E_CUSTOMER_EMAIL = customerEmail;
  process.env.ADMIN_E2E_PASSWORD = password;
  process.env.ADMIN_E2E_RUN = run;
  process.env.ADMIN_E2E_GEARDROP_PRODUCT = `gear-drop-isolation-${run}`;

  const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
  const profileValues = staffRows.map((staff) =>
    `(${literal(staff.userId)}::uuid, ${literal(staff.role)}::public.staff_role, ${literal(staff.displayName)}, true)`,
  ).join(",");
  const membershipValues = staffRows.flatMap((staff) => staff.companies.map((company) =>
    `((select id from public.organizations where slug = ${literal(company)}), ${literal(staff.userId)}::uuid, ${literal(staff.role)}::public.staff_role, true)`,
  )).join(",");
  const sql = `
    insert into public.staff_profiles (user_id, role, display_name, active) values ${profileValues};
    insert into public.organization_members (organization_id, user_id, role, active) values ${membershipValues};
    insert into public.categories (organization_id, name, slug, tagline, description, active, sort_order) values (
      (select id from public.organizations where slug = 'geardrop'),
      'Categoria browser test', ${literal(`browser-test-${run}`)},
      'Categoria tecnica per test browser locali', 'Fixture minima richiesta dal form prodotto.', true, 0
    );
    -- A Gear Drop product that exists whatever the other specs create: the isolation spec
    -- proves Oryvenne cannot reach it.
    insert into public.products (organization_id, category_id, slug, sku, name, tagline, description, price_cents) values (
      (select id from public.organizations where slug = 'geardrop'),
      (select id from public.categories where slug = ${literal(`browser-test-${run}`)}),
      ${literal(`gear-drop-isolation-${run}`)}, ${literal(`gear-drop-isolation-${run}`)},
      'Prodotto Gear Drop isolato', 'Fixture', 'Prodotto che solo Gear Drop deve vedere.', 1500
    );
  `;
  localPsql(["--set", "ON_ERROR_STOP=1", "--command", sql], { stdio: "ignore" });
}
