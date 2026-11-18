"use client";

/* eslint-disable @next/next/no-img-element -- order snapshots keep the image path they were sold with */
import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { markOrderPackedAction, type BarcodeActionState } from "@/app/admin/actions/barcodes";
import { applyScan, packComplete, type PackLine } from "@/lib/admin/barcodes";
import { BarcodeScanner } from "./barcode-scanner";
import styles from "./barcodes.module.css";

export type PackCheckLine = PackLine & { readonly imageSrc: string };

type Verdict = { readonly tone: "ok" | "error" | "info"; readonly text: string };

const initial: BarcodeActionState = { ok: false, message: "" };

/**
 * The parcel check: every piece goes past the reader (gun, camera or typed code) before the box
 * is closed. The right piece counts on its line, a wrong or extra one says so in red, and when
 * every line is full the check can be written on the order.
 */
export function PackCheck({ orderId, orderNumber, lines }: { readonly orderId: number; readonly orderNumber: string; readonly lines: readonly PackCheckLine[] }) {
  const [counted, setCounted] = useState<Readonly<Record<string, number>>>({});
  const [verdict, setVerdict] = useState<Verdict>({ tone: "info", text: "Scansiona il primo pezzo." });
  const [code, setCode] = useState("");
  const [state, action, pending] = useActionState(markOrderPackedAction, initial);
  const input = useRef<HTMLInputElement>(null);
  const total = lines.reduce((sum, line) => sum + line.expected, 0);
  const done = packComplete(lines, counted);

  function scan(raw: string) {
    if (!raw.trim()) return;
    const outcome = applyScan(lines, counted, raw);
    if (outcome.kind === "unknown") {
      setVerdict({ tone: "error", text: `Questo pezzo non è nell'ordine (${outcome.code}). Toglilo dal pacco.` });
    } else if (outcome.kind === "extra") {
      setVerdict({ tone: "error", text: `${outcome.name}: ne hai già messi abbastanza. Questo è in più.` });
    } else {
      const next = { ...counted, [outcome.key]: (counted[outcome.key] ?? 0) + 1 };
      setCounted(next);
      setVerdict(
        packComplete(lines, next)
          ? { tone: "ok", text: "Pacco completo: tutti i pezzi giusti." }
          : { tone: "ok", text: `Giusto: ${outcome.name}.` },
      );
    }
    setCode("");
    input.current?.focus();
  }

  return (
    <div className={styles.check}>
      <div className={styles.scanBox}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            scan(code);
          }}
        >
          <input
            aria-label="Codice del pezzo"
            autoComplete="off"
            autoFocus
            onChange={(event) => setCode(event.target.value)}
            placeholder="Spara il codice o scrivilo e premi Invio"
            ref={input}
            value={code}
          />
          <button className={styles.secondary} type="submit">
            Conta
          </button>
        </form>
        <BarcodeScanner continuous label="Scansiona con la fotocamera" onCode={scan} />
        <p aria-live="polite" className={styles.verdict} data-tone={verdict.tone} role="status">
          {verdict.text}
        </p>
      </div>

      <ul className={styles.lines}>
        {lines.map((line) => {
          const seen = counted[line.key] ?? 0;
          return (
            <li data-done={seen >= line.expected ? "" : undefined} data-testid="pack-line" key={line.key}>
              <img alt="" height={48} src={line.imageSrc} width={48} />
              <span>
                {line.name}
                <small>
                  {line.sku}
                  {line.gtin ? ` · EAN ${line.gtin}` : " · nessun EAN: usa l'etichetta SKU"}
                </small>
              </span>
              <strong>
                {seen}/{line.expected}
              </strong>
            </li>
          );
        })}
      </ul>

      <div className={styles.actions}>
        <form action={action}>
          <input name="orderId" type="hidden" value={orderId} />
          <input name="pieces" type="hidden" value={total} />
          <button className={styles.primary} disabled={!done || pending || state.ok} type="submit">
            {state.ok ? "Controllo registrato" : pending ? "Registro…" : `Registra il controllo su ${orderNumber}`}
          </button>
        </form>
        <button
          className={styles.secondary}
          onClick={() => {
            setCounted({});
            setVerdict({ tone: "info", text: "Ricominciato: scansiona il primo pezzo." });
            input.current?.focus();
          }}
          type="button"
        >
          Ricomincia
        </button>
        <Link className={styles.secondary} href={`/admin/ordini/${orderId}`}>
          Vai a spedire
        </Link>
      </div>
      {state.message ? (
        <p className={styles.feedback} data-error={state.ok ? undefined : ""} role="status">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
