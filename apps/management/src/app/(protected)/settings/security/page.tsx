/**
 * Pagina impostazioni di sicurezza (control-plane).
 *
 * Mostra tutti i feature flag dell'organizzazione corrente.
 * Solo un owner con AAL2 verificato lato server può modificare read_access.
 * Tutti gli altri flag (write ed external) sono visibili ma bloccati: i piani
 * futuri aggiungeranno setter dedicati.
 *
 * SICUREZZA:
 * – Principal, ruolo e AAL vengono sempre riletti dal server in questa pagina.
 * – L'ID organizzazione viene sempre da principal.organization.id (mai da URL o form).
 * – read_access dell'organizzazione viene verificato PRIMA di ogni query di business
 *   (qui non ci sono query di business, ma il controllo è già nel protected layout).
 * – Se la lista dei flag non è disponibile → stato "non disponibile"; non viene
 *   mai confuso con "zero flag" o "tutto disabilitato".
 *
 * Non importa nulla da src/ root né dagli helper Supabase root.
 */
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createManagementServerClient } from "@/lib/supabase/server";
import {
  requireManagementPrincipal,
  StaffAuthorizationError,
  toAssuranceLevel,
} from "@/lib/management/access";
import { MANAGEMENT_ORGANIZATION_COOKIE } from "@geardrop/data-contract";
import { FeatureControls } from "@/components/feature-controls";
import type { FeatureFlagRow } from "@/components/feature-controls";

// Pagina con dati: opt-out obbligatorio dalla cache di Next.js.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function SecuritySettingsPage() {
  // 1. Client Supabase posseduto dall'app management.
  const client = await createManagementServerClient();

  // 2. Preferenza organizzazione dal cookie (validata, non autorizzativa).
  const cookieStore = await cookies();
  const slug = cookieStore.get(MANAGEMENT_ORGANIZATION_COOKIE)?.value;

  // 3. Principal riletto dal DB: ruolo e azienda vengono dal database, mai dal form.
  let principal;
  try {
    principal = await requireManagementPrincipal(client, slug);
  } catch (error) {
    if (error instanceof StaffAuthorizationError) {
      redirect("/login");
    }
    throw error;
  }

  // 4. AAL verificato lato server per determinare se l'utente può modificare.
  const { data: aalData, error: aalError } =
    await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aalError || !aalData) {
    redirect("/login");
  }

  // Solo owner con AAL2 corrente può cambiare read_access.
  const isOwnerAal2 =
    principal.role === "owner" &&
    toAssuranceLevel(aalData.currentLevel) === "aal2";

  // 5. Carica i flag con updated_at per la concorrenza ottimistica.
  //    Usa il RPC direttamente per ottenere i timestamp (loadManagementFeatures
  //    restituisce solo i booleani, non i timestamp).
  //    ID organizzazione da principal: mai forgiabile.
  const { data: featureRows, error: featureError } = await client
    .schema("management_api")
    .rpc("list_management_features", {
      p_organization_id: principal.organization.id,
    });

  if (featureError || !Array.isArray(featureRows)) {
    // Flag non disponibili: stato "non disponibile", MAI zero.
    return (
      <main>
        <h1>Sicurezza</h1>
        <p style={{ color: "#94a3b8" }}>
          Configurazione non disponibile al momento. Riprova più tardi.
        </p>
      </main>
    );
  }

  // Mapping verso il tipo atteso dal componente client.
  const flags: FeatureFlagRow[] = featureRows.map((row) => ({
    feature: String(row.feature),
    enabled: Boolean(row.enabled),
    updated_at: String(row.updated_at),
  }));

  return (
    <main>
      <h1>Sicurezza</h1>
      <p style={{ color: "#94a3b8", marginBottom: "1.5rem" }}>
        {principal.organization.name} — ruolo:{" "}
        <strong style={{ color: "#e2e8f0" }}>{principal.role}</strong>
      </p>

      <FeatureControls
        organizationId={principal.organization.id}
        organizationName={principal.organization.name}
        features={flags}
        canSetReadAccess={isOwnerAal2}
      />
    </main>
  );
}
