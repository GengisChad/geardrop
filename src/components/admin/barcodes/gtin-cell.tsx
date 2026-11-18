"use client";

import { useActionState, useState } from "react";
import { setProductGtinAction, type BarcodeActionState } from "@/app/admin/actions/barcodes";
import { BarcodeScanner } from "./barcode-scanner";
import styles from "./barcodes.module.css";

const initial: BarcodeActionState = { ok: false, message: "" };

/** The box barcode of one product: typed, read by a scanner gun, or read with the phone camera. */
export function GtinCell({ productId, productName, gtin }: { readonly productId: number; readonly productName: string; readonly gtin: string | null }) {
  const [state, action, pending] = useActionState(setProductGtinAction, initial);
  const [value, setValue] = useState(gtin ?? "");

  return (
    <div className={styles.gtin}>
      <form action={action}>
        <input name="productId" type="hidden" value={productId} />
        <input
          aria-label={`Codice a barre di ${productName}`}
          inputMode="numeric"
          maxLength={20}
          name="gtin"
          onChange={(event) => setValue(event.target.value)}
          placeholder="EAN della scatola"
          value={value}
        />
        <button className={styles.secondary} disabled={pending} type="submit">
          {pending ? "Salvo…" : "Salva"}
        </button>
      </form>
      <BarcodeScanner label="Leggi dalla scatola" onCode={(code) => setValue(code.replace(/\D/g, ""))} />
      {state.message ? (
        <p className={styles.feedback} data-error={state.ok ? undefined : ""} role="status">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
