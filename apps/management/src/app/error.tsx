"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main><h1>Pagina non disponibile</h1><button onClick={reset}>Riprova</button></main>;
}
