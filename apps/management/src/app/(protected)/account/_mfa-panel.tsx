"use client";

/**
 * Pannello MFA client-side per la pagina account.
 *
 * Vincoli di sicurezza rispettati:
 * - QR e secret TOTP restano SOLO in memoria React (variabili di stato).
 *   Non vengono mai scritti in console, localStorage, sessionStorage, cookie
 *   né passati a un server component.
 * - Il codice a sei cifre non rivela l'esistenza di un account in caso di errore.
 * - Un owner non può rimuovere il proprio ultimo fattore verificato.
 * - Usa createManagementBrowserClient(); non istanzia client Supabase paralleli.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createManagementBrowserClient } from "@/lib/supabase/client";

export type FactorSummary = {
  id: string;
  friendlyName: string;
  status: "verified" | "unverified";
};

type Props = {
  factors: FactorSummary[];
  /**
   * true se l'utente è owner e ha un solo fattore verificato.
   * In questo caso il bottone di rimozione è disabilitato.
   */
  removeLastBlocked: boolean;
};

// Stato discriminato per l'enrollment. Le fasi "setup" tengono qrSvg e secret
// in memoria React: non vengono mai serializzati o loggati.
type EnrollPhase =
  | { kind: "idle" }
  | { kind: "setup"; factorId: string; qrSvg: string; secret: string; code: string }
  | { kind: "error"; message: string };

export default function AccountMfaPanel({ factors, removeLastBlocked }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [enroll, setEnroll] = useState<EnrollPhase>({ kind: "idle" });
  const [removeError, setRemoveError] = useState<string | null>(null);

  // Singleton browser client — non duplica il client Supabase.
  const supabase = createManagementBrowserClient();

  // Avvia l'enrollment TOTP: il QR e il secret vengono tenuti solo nello stato.
  async function startEnroll() {
    setEnroll({ kind: "idle" });
    setRemoveError(null);
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Autenticatore",
    });
    if (error || !data) {
      setEnroll({ kind: "error", message: "Impossibile avviare la registrazione." });
      return;
    }
    // qrSvg e secret restano solo nello stato React — mai loggati o persistiti.
    setEnroll({
      kind: "setup",
      factorId: data.id,
      qrSvg: data.totp.qr_code,
      secret: data.totp.secret,
      code: "",
    });
  }

  // Verifica il codice TOTP e completa l'enrollment.
  async function verifyCode() {
    if (enroll.kind !== "setup" || enroll.code.length !== 6) return;
    const { factorId, code } = enroll;
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
    if (error) {
      // Messaggio generico: non rivela se l'account esiste o meno.
      setEnroll({ kind: "error", message: "Codice non valido. Riprova." });
      return;
    }
    setEnroll({ kind: "idle" });
    startTransition(() => {
      router.refresh();
    });
  }

  async function removeFactorById(factorId: string) {
    setRemoveError(null);
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    if (error) {
      setRemoveError("Impossibile rimuovere il fattore. Riprova.");
      return;
    }
    startTransition(() => {
      router.refresh();
    });
  }

  // Un owner non può rimuovere il proprio ultimo fattore verificato.
  function canRemove(factor: FactorSummary): boolean {
    if (!removeLastBlocked) return true;
    const verifiedCount = factors.filter((f) => f.status === "verified").length;
    return !(factor.status === "verified" && verifiedCount <= 1);
  }

  return (
    <div>
      {/* Lista fattori esistenti */}
      {factors.length === 0 ? (
        <p>Nessun fattore TOTP registrato.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 1.5rem" }}>
          {factors.map((f) => (
            <li
              key={f.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "1rem",
                padding: ".5rem 0",
                borderBottom: "1px solid #2a2a2a",
              }}
            >
              <span style={{ flex: 1, fontSize: ".9rem" }}>
                {f.friendlyName}
                <span
                  style={{
                    marginLeft: ".5rem",
                    fontSize: ".75rem",
                    color: f.status === "verified" ? "#6ee7b7" : "#fbbf24",
                  }}
                >
                  {f.status === "verified" ? "verificato" : "non verificato"}
                </span>
              </span>
              <button
                type="button"
                disabled={!canRemove(f) || isPending}
                onClick={() => void removeFactorById(f.id)}
                title={
                  !canRemove(f)
                    ? "Non puoi rimuovere l'ultimo fattore come owner."
                    : "Rimuovi questo fattore"
                }
                style={{
                  background: "transparent",
                  border: "1px solid #444",
                  color: canRemove(f) ? "#f87171" : "#555",
                  cursor: canRemove(f) ? "pointer" : "not-allowed",
                  padding: ".3rem .65rem",
                  fontSize: ".8rem",
                  borderRadius: "4px",
                }}
              >
                Rimuovi
              </button>
            </li>
          ))}
        </ul>
      )}

      {removeError && (
        <p style={{ color: "#f87171", marginBottom: "1rem" }}>{removeError}</p>
      )}

      {/* Avvio enrollment */}
      {enroll.kind === "idle" && (
        <button
          type="button"
          onClick={() => void startEnroll()}
          disabled={isPending}
        >
          Aggiungi fattore TOTP
        </button>
      )}

      {/* Flusso di enrollment */}
      {enroll.kind === "setup" && (
        <div
          style={{
            marginTop: "1rem",
            padding: "1.25rem",
            border: "1px solid #2a2a2a",
            borderRadius: "6px",
            background: "#1a1a1a",
          }}
        >
          <p style={{ marginTop: 0 }}>
            Scansiona il codice QR con la tua app autenticatore
            (es. Authy, Google Authenticator, 1Password).
          </p>

          {/* QR SVG: solo in memoria, mai in localStorage/cookie/log */}
          <div
            style={{
              display: "inline-block",
              background: "#fff",
              padding: "8px",
              marginBottom: "1rem",
              lineHeight: 0,
            }}
            dangerouslySetInnerHTML={{ __html: enroll.qrSvg }}
          />

          <details style={{ marginBottom: "1rem" }}>
            <summary
              style={{ cursor: "pointer", fontSize: ".85rem", userSelect: "none" }}
            >
              Inserimento manuale (se non puoi scansionare)
            </summary>
            {/* secret: solo in memoria React, non loggato */}
            <code
              style={{
                display: "block",
                margin: ".5rem 0 0",
                padding: ".5rem",
                background: "#222",
                borderRadius: "4px",
                fontSize: ".8rem",
                wordBreak: "break-all",
              }}
            >
              {enroll.secret}
            </code>
          </details>

          <label style={{ display: "block", marginBottom: "1rem" }}>
            <span style={{ display: "block", marginBottom: ".25rem", fontSize: ".9rem" }}>
              Codice a 6 cifre
            </span>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              autoComplete="one-time-code"
              value={enroll.code}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, "").slice(0, 6);
                setEnroll({ ...enroll, code: val });
              }}
              style={{
                padding: ".5rem .75rem",
                fontSize: "1.4rem",
                letterSpacing: ".25em",
                width: "9rem",
                background: "#222",
                color: "#f5f5f5",
                border: "1px solid #444",
                borderRadius: "4px",
              }}
            />
          </label>

          <div style={{ display: "flex", gap: ".75rem" }}>
            <button
              type="button"
              onClick={() => void verifyCode()}
              disabled={enroll.code.length !== 6 || isPending}
            >
              Verifica e salva
            </button>
            <button
              type="button"
              onClick={() => setEnroll({ kind: "idle" })}
              style={{
                background: "transparent",
                border: "1px solid #444",
                color: "#f5f5f5",
              }}
            >
              Annulla
            </button>
          </div>
        </div>
      )}

      {/* Errore enrollment */}
      {enroll.kind === "error" && (
        <div style={{ marginTop: "1rem" }}>
          <p style={{ color: "#f87171" }}>{enroll.message}</p>
          <button
            type="button"
            onClick={() => setEnroll({ kind: "idle" })}
            style={{
              background: "transparent",
              border: "1px solid #444",
              color: "#f5f5f5",
              fontSize: ".9rem",
            }}
          >
            Riprova
          </button>
        </div>
      )}
    </div>
  );
}
