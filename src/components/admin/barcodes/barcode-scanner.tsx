"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./barcodes.module.css";

/** The part of the Barcode Detection API used here (Chrome on Android and desktop; not Safari). */
type DetectedBarcode = { readonly rawValue: string };
type BarcodeDetectorInstance = { detect(source: HTMLVideoElement): Promise<readonly DetectedBarcode[]> };
type BarcodeDetectorConstructor = new (options: { formats: readonly string[] }) => BarcodeDetectorInstance;

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "qr_code"] as const;
/** The same code seen again within this time is the same piece still in front of the camera. */
const REPEAT_MS = 1500;

function detectorClass(): BarcodeDetectorConstructor | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector ?? null;
}

/**
 * Reads barcodes and QR codes with the phone's back camera. Each new code goes to `onCode`; the
 * camera stays on until closed (`continuous`) or stops after the first code. Where the browser has
 * no barcode reader (Safari), it says so: a USB or Bluetooth reader, or typing, still works.
 */
export function BarcodeScanner({
  onCode,
  continuous = false,
  label = "Scansiona con la fotocamera",
}: {
  readonly onCode: (code: string) => void;
  readonly continuous?: boolean;
  readonly label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const handler = useRef(onCode);
  useEffect(() => {
    handler.current = onCode;
  });

  useEffect(() => {
    if (!open) return;
    const Detector = detectorClass();
    if (!Detector) return;
    let stream: MediaStream | null = null;
    let timer: number | undefined;
    let stopped = false;
    let last = { code: "", at: 0 };
    const detector = new Detector({ formats: FORMATS });

    const tick = async () => {
      if (stopped || !video.current) return;
      try {
        const found = video.current.readyState >= 2 ? await detector.detect(video.current) : [];
        const code = found[0]?.rawValue?.trim();
        const now = Date.now();
        if (code && (code !== last.code || now - last.at > REPEAT_MS)) {
          last = { code, at: now };
          handler.current(code);
          if (!continuous) {
            setOpen(false);
            return;
          }
        }
      } catch {
        // A frame the detector could not read: try the next one.
      }
      timer = window.setTimeout(tick, 200);
    };

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((media) => {
        if (stopped) {
          media.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = media;
        if (video.current) {
          video.current.srcObject = media;
          void video.current.play();
        }
        tick();
      })
      .catch(() => {
        setProblem("Fotocamera non disponibile: consenti l'accesso nel browser, oppure usa un lettore o scrivi il codice.");
        setOpen(false);
      });

    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [open, continuous]);

  return (
    <div className={styles.scanner}>
      <button
        className={styles.secondary}
        onClick={() => {
          if (!open && !detectorClass()) {
            setProblem("Questo browser non legge i codici dalla fotocamera: usa Chrome su Android, un lettore USB/Bluetooth, o scrivi il codice.");
            return;
          }
          setProblem(null);
          setOpen((value) => !value);
        }}
        type="button"
      >
        {open ? "Chiudi fotocamera" : label}
      </button>
      {open ? <video aria-label="Inquadratura della fotocamera" className={styles.video} muted playsInline ref={video} /> : null}
      {problem ? <p className={styles.feedback} data-error="">{problem}</p> : null}
    </div>
  );
}
