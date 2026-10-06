import { redirect } from "next/navigation";
import { createManagementServerClient } from "@/lib/supabase/server";
import { requireManagementPrincipal, StaffAuthorizationError } from "@/lib/management/access";
import AccountMfaPanel from "./_mfa-panel";
import type { FactorSummary } from "./_mfa-panel";

// Nessuna cache: identità e fattori MFA devono sempre essere letti freschi dal server.
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const client = await createManagementServerClient();

  // Verifica staff e membership: non si fida mai di dati provenienti da cookie o client.
  let principal;
  try {
    principal = await requireManagementPrincipal(client);
  } catch (error) {
    if (error instanceof StaffAuthorizationError) {
      redirect("/login");
    }
    throw error;
  }

  // Email dell'utente autenticato, verificata lato server con getUser() (non getSession()).
  const { data: userData } = await client.auth.getUser();
  const email = userData?.user?.email ?? "—";

  // Lista dei fattori TOTP registrati. Restituisce solo metadati (id, status, nome):
  // secret e URI non compaiono mai in un server component.
  const { data: factorData } = await client.auth.mfa.listFactors();
  const totpFactors: FactorSummary[] = (factorData?.totp ?? []).map((f) => ({
    id: f.id,
    friendlyName: f.friendly_name ?? "Autenticatore TOTP",
    status: f.status as "verified" | "unverified",
  }));

  const isOwner = principal.role === "owner";
  const verifiedCount = totpFactors.filter((f) => f.status === "verified").length;
  // Un owner con un solo fattore verificato non può rimuoverlo.
  const removeLastBlocked = isOwner && verifiedCount <= 1;

  return (
    <main>
      <h1>Account</h1>

      <section style={{ marginBottom: "2.5rem" }}>
        <h2>Identità</h2>
        <dl
          style={{
            display: "grid",
            gridTemplateColumns: "max-content 1fr",
            columnGap: "2rem",
            rowGap: ".5rem",
            margin: 0,
          }}
        >
          <dt style={{ color: "#aaa", fontSize: ".9rem" }}>Email</dt>
          <dd style={{ margin: 0 }}>{email}</dd>
          <dt style={{ color: "#aaa", fontSize: ".9rem" }}>Ruolo</dt>
          <dd style={{ margin: 0 }}>{principal.role}</dd>
          <dt style={{ color: "#aaa", fontSize: ".9rem" }}>Organizzazione</dt>
          <dd style={{ margin: 0 }}>{principal.organization.name}</dd>
          {principal.organizations.length > 1 && (
            <>
              <dt style={{ color: "#aaa", fontSize: ".9rem" }}>Altre organizzazioni</dt>
              <dd style={{ margin: 0 }}>
                {principal.organizations
                  .filter((o) => o.id !== principal.organization.id)
                  .map((o) => o.name)
                  .join(", ")}
              </dd>
            </>
          )}
        </dl>
      </section>

      <section>
        <h2>Autenticazione a due fattori (TOTP)</h2>
        {isOwner && verifiedCount === 0 && (
          <p style={{ color: "#fbbf24", marginBottom: "1rem" }}>
            Come owner, devi registrare un fattore TOTP prima di poter accedere alle
            funzioni protette.
          </p>
        )}
        {isOwner && removeLastBlocked && (
          <p style={{ color: "#94a3b8", fontSize: ".85rem", marginBottom: "1rem" }}>
            Non è possibile rimuovere l&apos;ultimo fattore verificato come owner.
            Per assistenza, contatta un altro owner dell&apos;organizzazione.
          </p>
        )}
        {/* AccountMfaPanel è un client component: QR e secret restano solo in memoria React */}
        <AccountMfaPanel
          factors={totpFactors}
          removeLastBlocked={removeLastBlocked}
        />
      </section>
    </main>
  );
}
