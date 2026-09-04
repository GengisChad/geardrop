import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getStaffSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { upsertStaffAction } from "@/app/admin/actions";
import { AdminField, AdminForm, adminControlClass } from "@/components/admin/admin-form";

export const metadata: Metadata = { title: "Permessi" };

type StaffRow = { user_id: string; email: string; role: string; active: boolean; created_at: string };

const ROLE_HINTS = [
  ["editor", "Catalogo: contenuti, pubblicazione. Nessun accesso a ordini o dati cliente."],
  ["admin", "Tutto l'editor, più ordini, magazzino, coupon, spedizioni e vendite."],
  ["owner", "Tutto l'admin, più la gestione dei permessi."],
] as const;

const dateFormatter = new Intl.DateTimeFormat("it-IT", { dateStyle: "medium" });

/**
 * Owner-only. The person must already have registered and confirmed their email: this
 * page grants a role to an existing account, it never creates one. Signup itself can only
 * ever produce customers.
 */
export default async function AdminStaffPage() {
  if (!(await getStaffSession("owner"))) notFound();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("owner_list_staff");
  if (error) throw new Error(`Lettura permessi fallita: ${error.message}`);

  const staff = (data ?? []) as unknown as StaffRow[];

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,24rem)_1fr]">
      <section className="gd-glass-card h-fit rounded-[--radius-glass] p-5">
        <h2 className="gd-display text-small font-bold tracking-wider text-graphite">Assegna un ruolo</h2>
        <p className="mt-1 mb-4 text-[0.6875rem] text-grey-600">
          L&apos;indirizzo deve appartenere a un account già registrato e confermato.
        </p>

        <AdminForm action={upsertStaffAction} submitLabel="Assegna" variant="primary">
          <AdminField label="Email">
            <input name="email" type="email" required className={adminControlClass} />
          </AdminField>
          <AdminField label="Ruolo">
            <select name="role" defaultValue="editor" className={adminControlClass}>
              <option value="editor">editor</option>
              <option value="admin">admin</option>
              <option value="owner">owner</option>
            </select>
          </AdminField>
          <label className="flex items-center gap-2 text-small text-graphite">
            <input type="checkbox" name="active" defaultChecked className="size-4" />
            Attivo
          </label>
        </AdminForm>

        <dl className="mt-5 flex flex-col gap-2 border-t border-grey-200 pt-4">
          {ROLE_HINTS.map(([role, hint]) => (
            <div key={role}>
              <dt className="gd-display text-[0.625rem] font-bold uppercase tracking-wider text-violet">{role}</dt>
              <dd className="text-[0.6875rem] text-grey-600">{hint}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section>
        <h2 className="gd-display text-small font-bold tracking-wider text-graphite">Staff</h2>
        <ul className="mt-3 flex flex-col gap-2">
          {staff.map((member) => (
            <li
              key={member.user_id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-[--radius-card] border border-grey-200 px-4 py-3"
            >
              <div>
                <p className="text-small text-graphite">{member.email}</p>
                <p className="text-[0.6875rem] text-grey-600">
                  {member.role}
                  {member.active ? "" : " · disattivato"} · dal {dateFormatter.format(new Date(member.created_at))}
                </p>
              </div>

              <AdminForm action={upsertStaffAction} submitLabel={member.active ? "Disattiva" : "Riattiva"}>
                <input type="hidden" name="email" value={member.email} />
                <input type="hidden" name="role" value={member.role} />
                <input type="hidden" name="active" value={member.active ? "false" : "true"} />
              </AdminForm>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
