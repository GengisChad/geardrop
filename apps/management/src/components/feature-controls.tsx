"use client";
/**
 * Pannello client dei feature flag gestionali.
 *
 * – Mostra tutti i flag dell'organizzazione corrente.
 * – Solo read_access può essere modificato (da owner + AAL2 verificato lato server).
 * – Tutti gli altri flag (write ed external) sono visibili ma bloccati sia in
 *   MANAGEMENT_MODE read_only sia active: i piani futuri aggiungeranno setter dedicati.
 * – Nessun quick link mutante: la sola azione esposta è setReadAccess.
 *
 * Nessuna dipendenza da src/ root.
 */

import { useActionState, useRef } from "react";
import type { SetReadAccessResult } from "../app/actions/features";
import { setReadAccess } from "../app/actions/features";

// ---------------------------------------------------------------------------
// Tipi delle props
// ---------------------------------------------------------------------------

export type FeatureFlagRow = {
  readonly feature: string;
  readonly enabled: boolean;
  readonly updated_at: string;
};

type FeatureControlsProps = {
  readonly organizationId: number;
  readonly organizationName: string;
  /** Tutte le righe flag caricate dal server (incluso updated_at). */
  readonly features: readonly FeatureFlagRow[];
  /**
   * true solo quando il principal lato server è owner con AAL2 verificato
   * nell'organizzazione corrente. La sicurezza reale è nel server action;
   * questa prop serve solo per mostrare/nascondere il controllo visivamente.
   */
  readonly canSetReadAccess: boolean;
};

// ---------------------------------------------------------------------------
// Etichette human-readable dei flag
// ---------------------------------------------------------------------------

const FEATURE_LABELS: Record<string, string> = {
  read_access: "Accesso in lettura",
  inventory_writes: "Scritture inventario",
  purchasing_writes: "Scritture acquisti",
  fulfillment_writes: "Scritture fulfillment",
  pricing_writes: "Scritture prezzi",
  marketing_writes: "Scritture marketing",
  external_effects: "Effetti esterni",
};

const FEATURE_DESCRIPTIONS: Record<string, string> = {
  read_access:
    "Abilita la visualizzazione dei dati operativi nel gestionale. Richiede owner con MFA.",
  inventory_writes:
    "Consente modifiche all'inventario dal gestionale (fase futura).",
  purchasing_writes:
    "Consente la gestione degli ordini fornitore (fase futura).",
  fulfillment_writes:
    "Consente la gestione del picking e delle spedizioni (fase futura).",
  pricing_writes: "Consente la modifica dei prezzi di listino (fase futura).",
  marketing_writes:
    "Consente la gestione di campagne e promozioni (fase futura).",
  external_effects:
    "Abilita effetti verso sistemi esterni come email e webhook (fase futura).",
};

// ---------------------------------------------------------------------------
// Stato iniziale del form
// ---------------------------------------------------------------------------

const INITIAL_STATE: SetReadAccessResult | null = null;

// ---------------------------------------------------------------------------
// Componente principale
// ---------------------------------------------------------------------------

export function FeatureControls({
  organizationId,
  organizationName,
  features,
  canSetReadAccess,
}: FeatureControlsProps) {
  const reasonRef = useRef<HTMLTextAreaElement>(null);

  // Wrappa l'action per iniettare i parametri fissi dal server (non dal form).
  async function boundSetReadAccess(
    _prevState: SetReadAccessResult | null,
    formData: FormData,
  ): Promise<SetReadAccessResult> {
    const enabled = formData.get("enabled") === "true";
    const expectedUpdatedAt = formData.get("expected_updated_at");
    const reason = formData.get("reason");

    if (
      typeof expectedUpdatedAt !== "string" ||
      typeof reason !== "string"
    ) {
      return { success: false, code: "INVALID_INPUT" };
    }

    return setReadAccess(organizationId, enabled, expectedUpdatedAt, reason);
  }

  const [actionState, formAction, isPending] = useActionState<
    SetReadAccessResult | null,
    FormData
  >(boundSetReadAccess, INITIAL_STATE);

  // Messaggio dopo l'azione
  function resultMessage(state: SetReadAccessResult | null): string | null {
    if (!state) return null;
    if (state.success) return "Impostazione aggiornata.";
    switch (state.code) {
      case "UNAUTHORIZED":
        return "Accesso non autorizzato. Verifica di essere owner con MFA attiva.";
      case "CONFLICT":
        return "Un altro utente ha già modificato questa impostazione. Ricarica la pagina per vedere il valore aggiornato.";
      case "INVALID_INPUT":
        return "Input non valido. Il motivo deve contenere tra 3 e 500 caratteri.";
      case "UNAVAILABLE":
        return "Impostazione non disponibile al momento. Riprova più tardi.";
      default:
        return "Si è verificato un errore imprevisto.";
    }
  }

  const message = resultMessage(actionState);
  const isError = actionState !== null && !actionState.success;

  return (
    <section aria-label={`Flag funzionalità — ${organizationName}`}>
      <p style={{ color: "#94a3b8", marginBottom: "1.5rem", fontSize: ".9rem" }}>
        I flag abilitano le funzionalità del gestionale per questa organizzazione.
        Solo <strong>read_access</strong> può essere modificato in questa fase.
        Gli altri flag vengono attivati insieme ai rispettivi moduli operativi.
      </p>

      {message && (
        <p
          role="status"
          style={{
            color: isError ? "#f87171" : "#4ade80",
            marginBottom: "1rem",
            padding: ".75rem 1rem",
            border: `1px solid ${isError ? "#f87171" : "#4ade80"}`,
            borderRadius: "6px",
            fontSize: ".9rem",
          }}
        >
          {message}
        </p>
      )}

      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
        }}
      >
        {features.map((row) => {
          const isReadAccess = row.feature === "read_access";
          const label =
            FEATURE_LABELS[row.feature] ?? row.feature.replace(/_/g, " ");
          const description = FEATURE_DESCRIPTIONS[row.feature] ?? "";

          return (
            <li
              key={row.feature}
              style={{
                padding: "1rem 1.25rem",
                border: "1px solid #334155",
                borderRadius: "8px",
                background: "#1e293b",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "1rem",
                }}
              >
                <div>
                  <strong style={{ fontSize: ".95rem", color: "#e2e8f0" }}>
                    {label}
                  </strong>
                  <p
                    style={{
                      margin: "0.25rem 0 0",
                      fontSize: ".85rem",
                      color: "#64748b",
                    }}
                  >
                    {description}
                  </p>
                </div>

                {/* Badge stato */}
                <span
                  aria-label={row.enabled ? "Attivo" : "Disattivato"}
                  style={{
                    flexShrink: 0,
                    padding: ".25rem .75rem",
                    borderRadius: "9999px",
                    fontSize: ".8rem",
                    fontWeight: 600,
                    background: row.enabled ? "#166534" : "#1e293b",
                    color: row.enabled ? "#4ade80" : "#94a3b8",
                    border: row.enabled
                      ? "1px solid #166534"
                      : "1px solid #334155",
                  }}
                >
                  {row.enabled ? "Attivo" : "Disattivato"}
                </span>
              </div>

              {/* Blocco bloccato per i flag non-read_access */}
              {!isReadAccess && (
                <p
                  style={{
                    marginTop: ".75rem",
                    fontSize: ".8rem",
                    color: "#475569",
                    fontStyle: "italic",
                  }}
                >
                  Questa funzionalità sarà attivabile con il modulo operativo
                  dedicato.
                </p>
              )}

              {/* Controllo per read_access (solo owner + AAL2) */}
              {isReadAccess && canSetReadAccess && (
                <form
                  action={formAction}
                  style={{ marginTop: "1rem" }}
                  aria-label="Modifica accesso in lettura"
                >
                  {/* Campi nascosti: i parametri non di form */}
                  <input
                    type="hidden"
                    name="enabled"
                    value={row.enabled ? "false" : "true"}
                  />
                  <input
                    type="hidden"
                    name="expected_updated_at"
                    value={row.updated_at}
                  />

                  <label
                    htmlFor={`reason-${row.feature}`}
                    style={{
                      display: "block",
                      fontSize: ".85rem",
                      color: "#94a3b8",
                      marginBottom: ".4rem",
                    }}
                  >
                    Motivo della modifica{" "}
                    <span style={{ color: "#64748b" }}>(3–500 caratteri)</span>
                  </label>
                  <textarea
                    id={`reason-${row.feature}`}
                    ref={reasonRef}
                    name="reason"
                    required
                    minLength={3}
                    maxLength={500}
                    rows={3}
                    placeholder="Es. Abilitazione per verifica operativa da parte del team"
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      padding: ".5rem .75rem",
                      borderRadius: "6px",
                      border: "1px solid #475569",
                      background: "#0f172a",
                      color: "#e2e8f0",
                      fontSize: ".9rem",
                      resize: "vertical",
                    }}
                  />

                  <button
                    type="submit"
                    disabled={isPending}
                    style={{
                      marginTop: ".75rem",
                      padding: ".5rem 1.25rem",
                      borderRadius: "6px",
                      border: "none",
                      cursor: isPending ? "not-allowed" : "pointer",
                      fontSize: ".9rem",
                      fontWeight: 600,
                      background: row.enabled ? "#7f1d1d" : "#14532d",
                      color: row.enabled ? "#fca5a5" : "#86efac",
                      opacity: isPending ? 0.7 : 1,
                    }}
                  >
                    {isPending
                      ? "Salvataggio…"
                      : row.enabled
                        ? "Disabilita accesso in lettura"
                        : "Abilita accesso in lettura"}
                  </button>
                </form>
              )}

              {/* Testo informativo per owner non-AAL2 o non-owner */}
              {isReadAccess && !canSetReadAccess && (
                <p
                  style={{
                    marginTop: ".75rem",
                    fontSize: ".8rem",
                    color: "#475569",
                    fontStyle: "italic",
                  }}
                >
                  Solo un owner con autenticazione a due fattori verificata può
                  modificare questo flag.
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
