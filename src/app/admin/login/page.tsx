import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaffRole, requireUser } from "@/lib/auth/guards";
import { STAFF_ROLES } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isGestionaleOnly } from "@/lib/app-mode";
import { LoginForm } from "./login-form";
import styles from "@/components/admin/admin.module.css";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export const metadata: Metadata = {
  title: "Accesso amministrazione",
  robots: { index: false, follow: false },
};

export default async function AdminLoginPage() {
  const client = await createSupabaseServerClient();
  let authenticatedStaff = false;

  try {
    await requireUser(client);
    await requireStaffRole(client, STAFF_ROLES);
    authenticatedStaff = true;
  } catch {
    // Anonymous and non-staff users see the same non-enumerating login screen.
  }

  if (authenticatedStaff) {
    redirect("/admin");
  }
  const gestionale = isGestionaleOnly();

  return (
    <main className={styles.loginCanvas} id="contenuto">
      <section className={styles.loginPanel} aria-labelledby="admin-login-title">
        {gestionale
          ? <div className={styles.loginBrand}>GESTIONALE <span>GEAR DROP · ORYVENNE</span></div>
          : <div className={styles.loginBrand}>GEAR//DROP <span>ADMIN</span></div>}
        <p className={styles.eyebrow}>Console operativa protetta</p>
        <h1 id="admin-login-title">Accesso staff</h1>
        <p>{gestionale
          ? "Magazzino, ordini, costi, previsioni e prezzi di Gear Drop e Oryvenne, condivisi tra i soci."
          : "Gestisci catalogo, inventario e media con il tuo account autorizzato."}</p>
        <LoginForm />
        {gestionale ? null : <Link className={styles.backLink} href="/">← Torna al negozio</Link>}
      </section>
    </main>
  );
}
