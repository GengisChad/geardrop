import { redirect } from "next/navigation";

/**
 * La radice è dove arriva chi ha appena fatto l'accesso: login e schermate MFA mandano qui.
 * Rimanda all'area protetta, il cui layout decide lato server: senza sessione va al login,
 * con un fattore da iscrivere o da verificare va all'MFA, altrimenti entra. Rimandare al login
 * riporterebbe chi è già dentro sul modulo da cui è partito.
 *
 * Nel Task 6 questa pagina lascia il posto all'overview in (protected)/page.tsx.
 */
export default function Page() {
  redirect("/account");
}
