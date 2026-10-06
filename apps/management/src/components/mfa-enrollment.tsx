"use client";

/**
 * Componente client per l'enrollment TOTP.
 *
 * Vincoli di sicurezza:
 * - QR e secret restano SOLO in stato React (in memoria): mai in log, cookie, storage o server component.
 * - L'errore non rivela se l'account esiste o meno.
 * - Nessun codice di recupero.
 * - Usa solo createManagementBrowserClient().
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createManagementBrowserClient } from "@/lib/supabase/client";

type EnrollData = {
  factorId: string;
  qrSvg: string;
  secret: string;
};

export function MfaEnrollment() {
  const router = useRouter();
  const [enrollData, setEnrollData] = useState<EnrollData | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  // Ref per evitare doppio enroll in StrictMode
  const enrolledRef = useRef(false);

  useEffect(() => {
    if (enrolledRef.current) return;
    enrolledRef.current = true;

    const client = createManagementBrowserClient();

    client.auth.mfa
      .enroll({ factorType: "totp", friendlyName: "GEAR//DROP Gestionale" })
      .then(({ data, error }) => {
        if (error || !data) {
          // Messaggio generico: non rivela l'esistenza dell'account
          setInitError("Impossibile avviare la configurazione. Riprova.");
          return;
        }
        // QR e secret restano SOLO in memoria componente
        setEnrollData({
          factorId: data.id,
          qrSvg: data.totp.qr_code,
          secret: data.totp.secret,
        });
      })
      .catch(() => {
        setInitError("Impossibile avviare la configurazione. Riprova.");
      });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!enrollData || verifying || done) return;

    setVerifyError(null);
    const trimmed = code.replace(/\s/g, "");

    if (trimmed.length !== 6 || !/^\d{6}$/.test(trimmed)) {
      setVerifyError("Inserisci il codice a sei cifre.");
      return;
    }

    setVerifying(true);

    const client = createManagementBrowserClient();
    const { error } = await client.auth.mfa.challengeAndVerify({
      factorId: enrollData.factorId,
      code: trimmed,
    });

    setVerifying(false);

    if (error) {
      // Messaggio generico: non rivela nulla sull'account
      setCode("");
      setVerifyError("Verifica non riuscita. Controlla il codice e riprova.");
      return;
    }

    // Verifica riuscita: aggiorna sessione e ricontrolla AAL
    setDone(true);
    router.push("/");
    router.refresh();
  }

  if (done) {
    return <p>Configurazione completata. Reindirizzamento…</p>;
  }

  if (initError) {
    return <p role="alert" style={{ color: "#f87171" }}>{initError}</p>;
  }

  if (!enrollData) {
    return <p>Configurazione in corso…</p>;
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <p>
        Scansiona il QR con un&apos;app di autenticazione (es. Google Authenticator,
        Authy) oppure inserisci la chiave manualmente.
      </p>

      {/* QR code: SVG in memoria componente, mai inviato al server */}
      <div
        aria-label="QR code per l'autenticatore"
        style={{ margin: "1.5rem 0", maxWidth: "12rem" }}
        dangerouslySetInnerHTML={{ __html: enrollData.qrSvg }}
      />

      <details style={{ marginBottom: "1.5rem" }}>
        <summary style={{ cursor: "pointer", userSelect: "none" }}>
          Inserisci la chiave manualmente
        </summary>
        <pre
          aria-label="Chiave segreta TOTP"
          style={{
            marginTop: "0.5rem",
            padding: "0.75rem",
            background: "#1e1e1e",
            borderRadius: "4px",
            fontSize: "0.85rem",
            letterSpacing: "0.1em",
            overflowX: "auto",
            userSelect: "all",
          }}
        >
          {enrollData.secret}
        </pre>
      </details>

      <p style={{ fontSize: "0.875rem", color: "#a3a3a3" }}>
        Nessun codice di recupero disponibile. In caso di perdita dell&apos;accesso
        contatta un altro owner dell&apos;organizzazione.
      </p>

      {verifyError && (
        <p role="alert" style={{ color: "#f87171", margin: "0 0 1rem" }}>
          {verifyError}
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
        disabled={verifying}
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

      <button type="submit" disabled={verifying || code.length !== 6}>
        {verifying ? "Verifica in corso…" : "Attiva autenticazione a due fattori"}
      </button>
    </form>
  );
}
