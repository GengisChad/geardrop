"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { ReviewOptIn } from "@/lib/customer-reviews";

type SurveyWindow = Window & {
  renderOptIn?: () => void;
  gapi?: {
    load: (module: string, ready: () => void) => void;
    surveyoptin?: { render: (options: ReviewOptIn) => void };
  };
};

const SCRIPT_SRC = "https://apis.google.com/js/platform.js?onload=renderOptIn";

/**
 * Offers Google's post-delivery survey on the order page. Google's script is loaded only when the
 * buyer presses the button: before that, Google receives nothing. See src/lib/customer-reviews.ts.
 */
export function GoogleReviewOptIn({ optIn }: { optIn: ReviewOptIn }) {
  const [state, setState] = useState<"idle" | "loading" | "shown" | "failed">("idle");

  const start = () => {
    if (state !== "idle") return;
    setState("loading");
    const win = window as SurveyWindow;
    win.renderOptIn = () => {
      win.gapi?.load("surveyoptin", () => {
        win.gapi?.surveyoptin?.render(optIn);
        setState("shown");
      });
    };
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onerror = () => setState("failed");
    document.head.appendChild(script);
  };

  return (
    <div data-testid="google-review-opt-in" className="mt-8 w-full border-t border-white/10 pt-6 text-left">
      <p className="text-small font-bold text-graphite">Ci dici com&apos;è andata?</p>
      {state === "shown" ? (
        <p className="mt-2 text-[0.6875rem] text-grey-600">
          Grazie! Se hai confermato nella finestra di Google, ti arriverà un breve sondaggio dopo la consegna.
        </p>
      ) : (
        <>
          <p className="mt-2 text-[0.6875rem] text-grey-600">
            Dopo la consegna Google può mandarti un sondaggio di un minuto sul negozio. Se partecipi, Google riceve la
            tua email, il numero d&apos;ordine e la data di consegna prevista, e ti chiede conferma nella sua finestra.
            Puoi anche ignorarlo: non cambia nulla per il tuo ordine.
          </p>
          <Button variant="tertiary" size="sm" className="mt-3" onClick={start} disabled={state === "loading"}>
            {state === "loading" ? "Apro il sondaggio di Google…" : "Partecipa al sondaggio di Google"}
          </Button>
          {state === "failed" ? (
            <p className="mt-2 text-[0.6875rem] text-soldout">Il sondaggio di Google non si è aperto. Nessun problema: l&apos;ordine è confermato.</p>
          ) : null}
        </>
      )}
    </div>
  );
}
