import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
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
  const staffRows: { readonly userId: string; readonly role: Role; readonly displayName: string }[] = [];

  for (const identity of identities) {
    const email = `${identity.role}-${run}@local.geardrop.test`;
    const created = await client.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error || !created.data.user) throw new Error("Unable to create local staff fixture");
    staffRows.push({ userId: created.data.user.id, role: identity.role, displayName: `Test ${identity.role}` });
    process.env[`ADMIN_E2E_${identity.key}_EMAIL`] = email;
  }

  const customerEmail = `customer-${run}@local.geardrop.test`;
  const customer = await client.auth.admin.createUser({ email: customerEmail, password, email_confirm: true });
  if (customer.error) throw new Error("Unable to create local customer fixture");
  process.env.ADMIN_E2E_CUSTOMER_EMAIL = customerEmail;
  process.env.ADMIN_E2E_PASSWORD = password;
  process.env.ADMIN_E2E_RUN = run;

  const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
  const profileValues = staffRows.map((staff) =>
    `(${literal(staff.userId)}::uuid, ${literal(staff.role)}::public.staff_role, ${literal(staff.displayName)}, true)`,
  ).join(",");
  const sql = `
    insert into public.staff_profiles (user_id, role, display_name, active) values ${profileValues};
    insert into public.categories (name, slug, tagline, description, active, sort_order) values (
      'Categoria browser test', ${literal(`browser-test-${run}`)},
      'Categoria tecnica per test browser locali', 'Fixture minima richiesta dal form prodotto.', true, 0
    );
  `;
  execFileSync("psql", [
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    "--set", "ON_ERROR_STOP=1", "--command", sql,
  ], { stdio: "ignore" });
}
