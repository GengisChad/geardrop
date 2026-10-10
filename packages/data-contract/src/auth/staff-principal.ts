/**
 * Contratto neutrale per lo staff autenticato nel gestionale.
 * Nessuna dipendenza da Next.js, @/ alias o route di app.
 * Utilizzato sia dall'app management sia dall'adapter legacy via re-export.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";

// ---------------------------------------------------------------------------
// Tipi di dominio (derivati dallo schema, non ridefiniti a mano)
// ---------------------------------------------------------------------------

export type StaffRole = Database["public"]["Enums"]["staff_role"];

export const STAFF_ROLES: readonly StaffRole[] = ["owner", "admin", "editor"];

/** Una singola azienda in cui il membro lavora, con il suo ruolo in quella azienda. */
export type OrganizationMembership = {
  readonly id: number;
  readonly slug: string;
  readonly name: string;
  readonly storefrontPublic: boolean;
  readonly role: StaffRole;
};

/**
 * Il membro dello staff autenticato che sta operando in questa richiesta.
 * `role` è il suo ruolo nell'organizzazione corrente, non un titolo globale:
 * la stessa persona può essere owner in Gear Drop ed editor in Oryvenne.
 */
export type StaffPrincipal = {
  readonly userId: string;
  readonly role: StaffRole;
  readonly active: boolean;
  /** L'azienda in cui opera questa richiesta. */
  readonly organization: OrganizationMembership;
  /** Tutte le aziende verso cui può fare switch. */
  readonly organizations: readonly OrganizationMembership[];
};

/**
 * Livello di assurance MFA della sessione corrente.
 * null = livello sconosciuto o non disponibile (accesso negato).
 */
export type AssuranceLevel = "aal1" | "aal2" | null;

// ---------------------------------------------------------------------------
// Errori
// ---------------------------------------------------------------------------

export class StaffAuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StaffAuthorizationError";
  }
}

// ---------------------------------------------------------------------------
// Costante cookie (esportata così app e test la condividono senza importare next/headers)
// ---------------------------------------------------------------------------

/**
 * Nome del cookie HTTP-only che l'app imposta per ricordare la preferenza
 * organizzazione dell'utente. Viene validato sempre contro le membership attive
 * del principal: è una preferenza, non un'autorizzazione.
 */
export const MANAGEMENT_ORGANIZATION_COOKIE = "gd_management_org" as const;

// ---------------------------------------------------------------------------
// Logica di selezione organizzazione (deterministica: id minore, o slug preferito)
// ---------------------------------------------------------------------------

function defaultOrganization(
  memberships: readonly OrganizationMembership[],
): OrganizationMembership | null {
  if (memberships.length === 0) return null;
  // Ordine per id ascendente: Gear Drop (id=1) precede Oryvenne.
  return [...memberships].sort((a, b) => a.id - b.id)[0] ?? null;
}

/**
 * Seleziona l'organizzazione corrente a partire da uno slug preferito.
 * Se lo slug corrisponde a una membership attiva del principal, quella
 * diventa l'organizzazione; altrimenti si cade sul default deterministico.
 * Uno slug sconosciuto, di un'azienda dove la persona non è membro o con
 * membership inattiva NON amplia nulla e NON dà errore.
 */
function selectOrganization(
  memberships: readonly OrganizationMembership[],
  preferredSlug?: string,
): OrganizationMembership | null {
  if (preferredSlug) {
    const preferred = memberships.find((m) => m.slug === preferredSlug);
    if (preferred) return preferred;
  }
  return defaultOrganization(memberships);
}

// ---------------------------------------------------------------------------
// Guard principale
// ---------------------------------------------------------------------------

/**
 * Carica il membro dello staff autenticato e le sue membership dal database.
 * Non si fida mai di ruolo, membership o fattore MFA provenienti da form,
 * cookie, metadata utente o componenti client: tutto è risolto lato server
 * interrogando il database con getUser() (mai getSession()).
 *
 * Credenziali errate, staff disattivato e membership assente producono lo stesso
 * messaggio generico: non viene rivelata la causa specifica del diniego.
 *
 * @param preferredSlug - Slug dell'organizzazione preferita (letto dal cookie dal chiamante).
 *   Se corrisponde a una membership ATTIVA, quella diventa `principal.organization`;
 *   altrimenti si torna al default deterministico (id minore).
 *   Uno slug sconosciuto o privo di membership attiva NON amplia nulla e NON dà errore.
 *   La firma senza argomento resta valida e identica al comportamento precedente.
 */
export async function requireManagementPrincipal(
  client: SupabaseClient<Database>,
  preferredSlug?: string,
): Promise<StaffPrincipal> {
  // Messaggio generico identico per tutti i casi di diniego.
  const DENIED = "Accesso negato";

  // 1. Identità verificata lato server (non getSession che usa la cache locale).
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) {
    throw new StaffAuthorizationError(DENIED);
  }
  const userId = userData.user.id;

  // 2. Profilo staff attivo (globale, non per organizzazione).
  const { data: profile, error: profileError } = await client
    .from("staff_profiles")
    .select("user_id, active")
    .eq("user_id", userId)
    .maybeSingle();

  if (profileError || !profile || !profile.active) {
    throw new StaffAuthorizationError(DENIED);
  }

  // 3. Membership attive in organizzazioni attive (via RLS: solo le proprie).
  const { data: memberRows, error: memberError } = await client
    .from("organization_members")
    .select(
      "role, organization:organizations!inner(id, slug, name, storefront_public, active)",
    )
    .eq("user_id", userId)
    .eq("active", true)
    .eq("organization.active", true);

  if (memberError || !memberRows) {
    throw new StaffAuthorizationError(DENIED);
  }

  const organizations: OrganizationMembership[] = (memberRows ?? []).map(
    (row) => {
      const org = row.organization as {
        id: number;
        slug: string;
        name: string;
        storefront_public: boolean;
        active: boolean;
      };
      return {
        id: org.id,
        slug: org.slug,
        name: org.name,
        storefrontPublic: org.storefront_public,
        role: row.role as StaffRole,
      };
    },
  );

  // 4. Almeno un'organizzazione attiva; rispetta lo slug preferito se valido.
  const organization = selectOrganization(organizations, preferredSlug);
  if (!organization) {
    throw new StaffAuthorizationError(DENIED);
  }

  return Object.freeze({
    userId: profile.user_id as string,
    role: organization.role,
    active: profile.active as boolean,
    organization,
    organizations,
  });
}
