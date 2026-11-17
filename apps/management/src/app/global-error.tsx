"use client";

export default function GlobalError({ reset }: { reset: () => void }) {
  return <html lang="it"><body><main><h1>Gestionale non disponibile</h1><button onClick={reset}>Riprova</button></main></body></html>;
}
