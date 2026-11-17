/**
 * Task 5 – Step 1 (RED): state machine e principal gestionale.
 * Questi test falliscono finché apps/management/src/lib/management/access.ts non esiste.
 */
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@geardrop/data-contract";

// Importiamo dal modulo management: se il file non esiste, tutto il test file fallisce.
import {
  managementMfaDestination,
  requireManagementPrincipal,
  StaffAuthorizationError,
  toAssuranceLevel,
} from "../../apps/management/src/lib/management/access";

// ---------------------------------------------------------------------------
// Helper: query builder mock thenable, permette sia await diretto sia .maybeSingle()
// ---------------------------------------------------------------------------
function makeBuilder(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> & PromiseLike<unknown> = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: () => Promise.resolve(result),
    then: (
      resolve: (v: unknown) => unknown,
      reject: (e: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject),
    catch: (reject: (e: unknown) => unknown) =>
      Promise.resolve(result).catch(reject),
    finally: (f: () => void) => Promise.resolve(result).finally(f),
  };
  return builder;
}

interface MockOptions {
  user: { id: string } | null;
  userError: Error | null;
  profile: { user_id: string; active: boolean } | null;
  profileError: Error | null;
  memberships: Array<{
    role: string;
    organization: {
      id: number;
      slug: string;
      name: string;
      storefront_public: boolean;
      active: boolean;
    };
  }> | null;
  memberError: Error | null;
}

const DEFAULT_ORG = {
  id: 1,
  slug: "geardrop",
  name: "Gear Drop",
  storefront_public: true,
  active: true,
};

function makeClient(opts: Partial<MockOptions> = {}): SupabaseClient<Database> {
  const {
    user = { id: "user-abc" },
    userError = null,
    profile = { user_id: "user-abc", active: true },
    profileError = null,
    memberships = [{ role: "owner", organization: DEFAULT_ORG }],
    memberError = null,
  } = opts;

  return {
    auth: {
      getUser: async () => ({
        data: { user: userError ? null : user },
        error: userError ?? null,
      }),
    },
    from: (table: string) => {
      if (table === "staff_profiles") {
        return makeBuilder({
          data: profile,
          error: profileError ?? null,
        });
      }
      if (table === "organization_members") {
        return makeBuilder({
          data: memberError ? null : memberships,
          error: memberError ?? null,
        });
      }
      return makeBuilder({ data: null, error: new Error("unexpected table: " + table) });
    },
  } as unknown as SupabaseClient<Database>;
}

// ===========================================================================
// managementMfaDestination – macchina a stati
// ===========================================================================

describe("managementMfaDestination – macchina a stati", () => {
  // owner aal1 → aal1: va a /mfa/enroll (nessun fattore registrato)
  it("owner aal1 → aal1 va a /mfa/enroll", () => {
    expect(managementMfaDestination("owner", "aal1", "aal1")).toBe("/mfa/enroll");
  });

  // owner aal1 → aal2: va a /mfa/challenge (fattore registrato ma non verificato)
  it("owner aal1 → aal2 va a /mfa/challenge", () => {
    expect(managementMfaDestination("owner", "aal1", "aal2")).toBe("/mfa/challenge");
  });

  // owner già aal2: prosegue (null)
  it("owner già aal2 prosegue", () => {
    expect(managementMfaDestination("owner", "aal2", "aal2")).toBeNull();
  });

  // admin senza fattore (aal1→aal1): può proseguire
  it("admin senza fattore può proseguire", () => {
    expect(managementMfaDestination("admin", "aal1", "aal1")).toBeNull();
  });

  // editor senza fattore (aal1→aal1): può proseguire
  it("editor senza fattore può proseguire", () => {
    expect(managementMfaDestination("editor", "aal1", "aal1")).toBeNull();
  });

  // admin con fattore verificato (aal1→aal2): deve fare challenge
  it("admin con fattore registrato ma non verificato deve fare challenge", () => {
    expect(managementMfaDestination("admin", "aal1", "aal2")).toBe("/mfa/challenge");
  });

  // editor con fattore verificato (aal1→aal2): deve fare challenge
  it("editor con fattore registrato ma non verificato deve fare challenge", () => {
    expect(managementMfaDestination("editor", "aal1", "aal2")).toBe("/mfa/challenge");
  });

  // admin/editor che hanno già completato la challenge (aal2): proseguono
  it("admin già aal2 prosegue", () => {
    expect(managementMfaDestination("admin", "aal2", "aal2")).toBeNull();
  });
  it("editor già aal2 prosegue", () => {
    expect(managementMfaDestination("editor", "aal2", "aal2")).toBeNull();
  });

  // AAL sconosciuto: accesso negato (throw)
  it("AAL currentLevel null lancia StaffAuthorizationError", () => {
    expect(() => managementMfaDestination("owner", null, "aal1")).toThrow(StaffAuthorizationError);
  });
  it("AAL nextLevel null lancia StaffAuthorizationError", () => {
    expect(() => managementMfaDestination("owner", "aal1", null)).toThrow(StaffAuthorizationError);
  });
  it("entrambi null lancia StaffAuthorizationError", () => {
    expect(() => managementMfaDestination("admin", null, null)).toThrow(StaffAuthorizationError);
  });

  // Supabase tipizza il livello come stringa aperta: tutto ciò che non è un livello noto è
  // sconosciuto, e uno sconosciuto nega l'accesso invece di passare come se fosse valido.
  it("un livello che non conosciamo vale come sconosciuto, non come valido", () => {
    for (const value of ["aal3", "", "AAL2", " aal2", undefined, 2, {}]) {
      expect(toAssuranceLevel(value), JSON.stringify(value) ?? "undefined").toBeNull();
    }
    expect(toAssuranceLevel("aal1")).toBe("aal1");
    expect(toAssuranceLevel("aal2")).toBe("aal2");
  });
  it("un livello sconosciuto arrivato da Supabase nega l'accesso, per ogni ruolo", () => {
    for (const role of ["owner", "admin", "editor"] as const) {
      expect(() => managementMfaDestination(role, toAssuranceLevel("aal3"), toAssuranceLevel("aal1")), role)
        .toThrow(StaffAuthorizationError);
      expect(() => managementMfaDestination(role, toAssuranceLevel("aal1"), toAssuranceLevel("aal9")), role)
        .toThrow(StaffAuthorizationError);
    }
  });
});

// ===========================================================================
// requireManagementPrincipal – verifica server-side
// ===========================================================================

describe("requireManagementPrincipal – controllo lato server", () => {
  it("restituisce il principal con il ruolo dal database", async () => {
    const principal = await requireManagementPrincipal(makeClient());
    expect(principal.userId).toBe("user-abc");
    expect(principal.role).toBe("owner");
    expect(principal.active).toBe(true);
    expect(principal.organization.slug).toBe("geardrop");
    expect(principal.organizations).toHaveLength(1);
  });

  // Claim mancanti (getUser fallisce)
  it("nega l'accesso se getUser restituisce errore", async () => {
    await expect(
      requireManagementPrincipal(makeClient({ user: null, userError: new Error("jwt invalid") })),
    ).rejects.toBeInstanceOf(StaffAuthorizationError);
  });

  it("nega l'accesso se getUser restituisce utente null senza errore", async () => {
    await expect(
      requireManagementPrincipal(makeClient({ user: null })),
    ).rejects.toBeInstanceOf(StaffAuthorizationError);
  });

  // Staff inattivo
  it("nega l'accesso se lo staff_profile è inattivo", async () => {
    await expect(
      requireManagementPrincipal(
        makeClient({ profile: { user_id: "user-abc", active: false } }),
      ),
    ).rejects.toBeInstanceOf(StaffAuthorizationError);
  });

  // Staff profile assente
  it("nega l'accesso se staff_profile è assente (null)", async () => {
    await expect(
      requireManagementPrincipal(makeClient({ profile: null })),
    ).rejects.toBeInstanceOf(StaffAuthorizationError);
  });

  // Errore nella query staff_profiles
  it("nega l'accesso se la query staff_profiles restituisce errore", async () => {
    await expect(
      requireManagementPrincipal(
        makeClient({ profileError: new Error("db error") }),
      ),
    ).rejects.toBeInstanceOf(StaffAuthorizationError);
  });

  // Membership inattiva / assente
  it("nega l'accesso se non esistono membership attive", async () => {
    await expect(
      requireManagementPrincipal(makeClient({ memberships: [] })),
    ).rejects.toBeInstanceOf(StaffAuthorizationError);
  });

  it("nega l'accesso se memberships è null (errore query)", async () => {
    await expect(
      requireManagementPrincipal(
        makeClient({ memberships: null, memberError: new Error("rls error") }),
      ),
    ).rejects.toBeInstanceOf(StaffAuthorizationError);
  });

  // Nessuna organizzazione
  it("nega l'accesso se non ci sono organizzazioni (membership vuota)", async () => {
    await expect(
      requireManagementPrincipal(makeClient({ memberships: [] })),
    ).rejects.toBeInstanceOf(StaffAuthorizationError);
  });

  // Cookie forgiato non amplia ruolo ne membership:
  // anche se un attaccante manomette il cookie, requireManagementPrincipal legge il ruolo
  // dal database (organization_members), non dal JWT o da qualsiasi header.
  it("il ruolo viene dal database, non da metadati o cookie", async () => {
    const clientWithEditorInDb = makeClient({
      memberships: [{ role: "editor", organization: DEFAULT_ORG }],
    });
    const principal = await requireManagementPrincipal(clientWithEditorInDb);
    // Nonostante qualsiasi claim esterna, il ruolo è "editor" (come dice il DB).
    expect(principal.role).toBe("editor");
  });

  it("con più organizzazioni sceglie quella con id minore (deterministica)", async () => {
    const clientMultiOrg = makeClient({
      memberships: [
        {
          role: "admin",
          organization: { id: 2, slug: "oryvenne", name: "Oryvenne", storefront_public: false, active: true },
        },
        {
          role: "owner",
          organization: { id: 1, slug: "geardrop", name: "Gear Drop", storefront_public: true, active: true },
        },
      ],
    });
    const principal = await requireManagementPrincipal(clientMultiOrg);
    expect(principal.organization.slug).toBe("geardrop");
    expect(principal.role).toBe("owner");
    expect(principal.organizations).toHaveLength(2);
  });

  // Il messaggio di errore è generico per tutti i casi di diniego (non rivela la causa)
  it("tutti i casi di diniego producono lo stesso messaggio generico", async () => {
    const cases = [
      makeClient({ user: null }),
      makeClient({ profile: null }),
      makeClient({ profile: { user_id: "user-abc", active: false } }),
      makeClient({ memberships: [] }),
    ];
    const messages: string[] = [];
    for (const c of cases) {
      try {
        await requireManagementPrincipal(c);
        messages.push("NO_ERROR");
      } catch (e) {
        expect(e).toBeInstanceOf(StaffAuthorizationError);
        messages.push((e as Error).message);
      }
    }
    // Tutti producono lo stesso messaggio
    const unique = new Set(messages);
    expect(unique.size).toBe(1);
    expect([...unique][0]).not.toBe("NO_ERROR");
  });
});

// ===========================================================================
// Task 6 Step 4 – requireManagementPrincipal con slug preferito + costante cookie
// ===========================================================================

import { MANAGEMENT_ORGANIZATION_COOKIE } from "@geardrop/data-contract";

const ORYVENNE_ORG = {
  id: 2,
  slug: "oryvenne",
  name: "Oryvenne",
  storefront_public: false,
  active: true,
};

/** Client con due membership: geardrop owner (id=1) e oryvenne admin (id=2). */
function makeTwoOrgClient(
  overrideRoles: { geardropRole?: string; oryvenneRole?: string } = {},
) {
  const { geardropRole = "owner", oryvenneRole = "admin" } = overrideRoles;
  return makeClient({
    memberships: [
      { role: oryvenneRole, organization: ORYVENNE_ORG },
      { role: geardropRole, organization: DEFAULT_ORG },
    ],
  });
}

describe("requireManagementPrincipal – slug preferito e costante cookie", () => {
  it("MANAGEMENT_ORGANIZATION_COOKIE è una stringa non vuota esportata dal package", () => {
    expect(typeof MANAGEMENT_ORGANIZATION_COOKIE).toBe("string");
    expect(MANAGEMENT_ORGANIZATION_COOKIE.length).toBeGreaterThan(0);
  });

  it("slug valido seleziona quell'organizzazione", async () => {
    const principal = await requireManagementPrincipal(makeTwoOrgClient(), "oryvenne");
    expect(principal.organization.slug).toBe("oryvenne");
    expect(principal.role).toBe("admin");
  });

  it("slug di azienda senza membership ricade sul default (id minore)", async () => {
    const principal = await requireManagementPrincipal(makeTwoOrgClient(), "unknown-org");
    expect(principal.organization.slug).toBe("geardrop");
    expect(principal.role).toBe("owner");
  });

  it("nessun argomento: comportamento identico (id minore, invariato)", async () => {
    const principal = await requireManagementPrincipal(makeTwoOrgClient());
    expect(principal.organization.slug).toBe("geardrop");
    expect(principal.role).toBe("owner");
  });

  it("membership inattiva ricade sul default (l'org non è nella lista attiva)", async () => {
    // Il DB filtra già le membership inattive: il client restituisce solo geardrop.
    const clientOnlyActive = makeClient({
      memberships: [{ role: "owner", organization: DEFAULT_ORG }],
    });
    const principal = await requireManagementPrincipal(clientOnlyActive, "oryvenne");
    expect(principal.organization.slug).toBe("geardrop");
  });

  it("il cookie non può far diventare owner chi è editor (il ruolo è quello della membership)", async () => {
    // utente editor in oryvenne, owner in geardrop.
    const clientEditorOryvenne = makeTwoOrgClient({ oryvenneRole: "editor" });
    const principal = await requireManagementPrincipal(clientEditorOryvenne, "oryvenne");
    expect(principal.organization.slug).toBe("oryvenne");
    expect(principal.role).toBe("editor"); // NON owner
  });

  it("slug stringa vuota ricade sul default", async () => {
    const principal = await requireManagementPrincipal(makeTwoOrgClient(), "");
    expect(principal.organization.slug).toBe("geardrop");
  });
});
