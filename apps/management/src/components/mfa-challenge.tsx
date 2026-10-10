"use client";

/**
 * Componente client per la challenge TOTP.
 *
 * Vincoli di sicurezza:
 * - Accetta solo fattori TOTP verificati dell'utente corrente (via listFactors).
 * - Il codice a sei cifre non rivela l'esistenza dell'account.
 * - Usa solo createManagementBrowserClient().
 * - Nessun codice di recupero.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createManagementBrowserClient } from "@/lib/supabase/client";

type ChallengeState =
  | { status: "loading" }
  | { status: "ready"; factorId: string }
  | { status: "verifying"; factorId: string }
  | { status: "error"; message: string; factorId: string }
  | { status: "no-factor" }
  | { status: "done" };

export function MfaChallenge() {
  const router = useRouter();
  const [state, setState] = useState<ChallengeState>({ status: "loading" });
  const [code, setCode] = useState("");

  useEffect(() => {
    const client = createManagementBrowserClient();

    client.auth.mfa
      .listFactors()
      .then(({ data, error }) => {
        if (error || !data) {
          // Messaggio generico
          setState({ status: "no-factor" });
          return;
        }

        // Accetta solo fattori TOTP con stato "verified"
        const verified = data.totp.filter((f) => f.factor_type === "totp" && f.status === "verified");

        if (verified.length === 0) {
          setState({ status: "no-factor" });
          return;
        }

        // Usa il primo fattore verificato
        setState({ status: "ready", factorId: verified[0]!.id });
      })
      .catch(() => {
        setState({ status: "no-factor" });
      });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (state.status !== "ready" && state.status !== "error") return;

    const factorId = state.factorId;
    const trimmed = code.replace(/\s/g, "");

    if (trimmed.length !== 6 || !/^\d{6}$/.test(trimmed)) {
      setState({ status: "error", message: "Inserisci il codice a sei cifre.", factorId });
      return;
    }

    setState({ status: "verifying", factorId });

    const client = createManagementBrowserClient();
    const { error } = await client.auth.mfa.challengeAndVerify({
      factorId,
      code: trimmed,
    });

    if (error) {
      // Messaggio generico: non rivela nulla sull'account
      setCode("");
      setState({ status: "error", message: "Verifica non riuscita. Controlla il codice e riprova.", factorId });
      return;
    }

    // Verifica riuscita: aggiorna la sessione e ricontrolla l'AAL
    setState({ status: "done" });
    router.push("/");
    router.refresh();
  }

  if (state.status === "loading") {
    return <p>Caricamento in corso…</p>;
  }

  if (state.status === "done") {
    return <p>Autenticazione completata. Reindirizzamento…</p>;
  }

  if (state.status === "no-factor") {
    return (
      <p role="alert" style={{ color: "#f87171" }}>
        Nessun fattore di autenticazione disponibile. Accedi di nuovo.
      </p>
    );
  }

  const isVerifying = state.status === "verifying";
  const errorMessage = state.status === "error" ? state.message : null;

  return (
    <form onSubmit={handleSubmit} noValidate>
      <p>Inserisci il codice a sei cifre dalla tua app di autenticazione.</p>

      {errorMessage && (
        <p role="alert" style={{ color: "#f87171", margin: "0 0 1rem" }}>
          {errorMessage}
        </p>
      )}

      <label htmlFor="mfa-code" style={{ display: "block", marginBottom: "0.5rem" }}>
        Codice di verifica (6 cifre)
      </label>
      <input
        id="mfa-code"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d{6}"
        maxLength={6}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        placeholder="000000"
        disabled={isVerifying}
        required
        autoFocus
        style={{
          display: "block",
          marginBottom: "1rem",
          padding: "0.75rem",
          fontSize: "1.25rem",
          letterSpacing: "0.3em",
          width: "8rem",
          background: "#1e1e1e",
          color: "#f5f5f5",
          border: "1px solid #3f3f3f",
          borderRadius: "4px",
          fontFamily: "monospace",
        }}
      />

      <button type="submit" disabled={isVerifying || code.length !== 6}>
        {isVerifying ? "Verifica in corso…" : "Accedi"}
      </button>

      <p style={{ marginTop: "1.5rem", fontSize: "0.875rem", color: "#a3a3a3" }}>
        Hai perso l&apos;accesso all&apos;app di autenticazione? Contatta un owner
        dell&apos;organizzazione: non esiste un bypass self-service.
      </p>
    </form>
  );
}
