# Gestionale online — documento superato

> **Non seguire la procedura che stava qui.** Descriveva il gestionale come lo storefront in
> modalità `GESTIONALE_ONLY`, su un progetto Supabase separato e dalla branch
> `feat/gestionale-unico`. Nessuna delle tre cose è più vera: il flag non esiste più nel codice,
> la spec del 30 settembre ha scelto il database condiviso con il negozio, e il gestionale è
> diventato un'applicazione separata in `apps/management`.

## Dove guardare invece

- architettura e decisioni: [spec del gestionale cloud](../superpowers/specs/2026-09-30-gestionale-cloud-operativo-design.md)
- piano e stato dei task: [piano della fondazione cloud](../superpowers/plans/2026-09-30-cloud-foundation-geardrop-connection.md)
- variabili della nuova app: [`apps/management/.env.example`](../../apps/management/.env.example)

Il runbook di deploy, smoke test e rollback della nuova app arriva con il Task 9 del piano
(`management-cloud-environment.md`, `management-cloud-rollout.md`,
`management-cloud-smoke-test.md`). Fino ad allora il gestionale in uso è il pannello `/admin`
dello storefront.

## Un passo del vecchio testo che oggi sarebbe dannoso

Il vecchio testo chiedeva di disattivare **"Allow new users to sign up"** nel progetto Supabase.
Con un progetto dedicato aveva senso; con il database condiviso **romperebbe la registrazione dei
clienti del negozio**, che si iscrivono proprio da lì. Non va fatto.

L'accesso dello staff non dipende dal blocco delle iscrizioni: una persona entra nel gestionale
solo se ha un `staff_profiles` attivo e una membership attiva nell'azienda, e quelle righe le crea
soltanto un owner, su invito. Un cliente che si registra resta un cliente.

## Cosa del vecchio testo resta vero

- Il progetto Vercel del gestionale è **separato** da quello del negozio, con Root Directory
  `apps/management` e l'opzione *Include source files outside of the Root Directory* attiva,
  perché i package condivisi stanno fuori dalla cartella dell'app.
- Sul progetto Supabase condiviso si aggiunge soltanto il callback del gestionale alla redirect
  allowlist; Site URL e iscrizioni restano quelli del negozio.
- Il TOTP va abilitato sul progetto condiviso senza toccare il login dei clienti: è un passo
  separato, da approvare.
