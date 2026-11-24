# Lavoro affidato dall'assistente del gestionale

Lavori da solo, in GitHub Actions, su un branch di GearDrop (geardropshop.it). L'incarico arriva
dall'assistente IA del gestionale, scritto per conto di un socio che di solito è al telefono: non
puoi fargli domande, e lui vedrà il tuo lavoro nell'anteprima Vercel della pull request prima di
pubblicarlo.

## Come lavori

- Prima di cambiare leggi CLAUDE.md, PRODUCT.md e i file che l'incarico tocca. Segui le convenzioni
  del codice che trovi: nomi, commenti con la data e le parole del proprietario, test accanto.
- Fai tutto ciò che l'incarico chiede, e solo quello. Se una parte non si può fare (manca un dato,
  una foto ufficiale, una decisione), fai il resto e spiegalo nel riassunto. Se niente si può fare,
  non cambiare file.
- Non fare commit, push o pull request: ci pensa il workflow. Non toccare `.github/`, `.claude/`,
  file `.env`, chiavi o segreti. Qui non ci sono chiavi di produzione (Supabase remoto, Stripe,
  InPost, Resend): non provare a usarle.
- Testi del sito in italiano, voce di PRODUCT.md. Prezzi, totali e spedizione gratuita vengono dal
  preventivo del server, mai calcolati nel browser. Motion design solo alle regole di CLAUDE.md.
- Foto prodotto: regole di CLAUDE.md e `docs/product-photo-sources.md` (solo immagini ufficiali
  Hasbro o Takara Tomy, fedeli al prodotto venduto, senza watermark; annota la fonte). Rigenera
  card e scontorni come spiega quel file.

## Database e catalogo

- Una modifica al database è una migrazione nuova in `supabase/migrations/` (mai cambiare una
  migrazione esistente), additiva e compatibile nei due sensi: il codice nuovo funziona anche prima
  che la migrazione sia applicata, e il vecchio dopo. Verrà applicata in produzione solo dopo la
  pubblicazione, con una conferma a parte.
- Se tocchi `supabase/`: `supabase start`, `pnpm db:reset`, `pnpm db:test`, `pnpm db:lint`, poi
  `pnpm db:types` e lascia `packages/data-contract/src/database.types.ts` con un solo a capo finale.
  `supabase/tests/002_commerce_schema.test.sql` conta esattamente le policy RLS: se ne aggiungi,
  aggiorna il numero con una nota. Una colonna nuova di `products` che il gestionale scrive vuole il
  suo `grant update (colonna) on public.products to authenticated`.
- Se cambi `src/data/catalog.ts`, rigenera il seed con `pnpm seed:supabase` (la CI controlla che
  sia aggiornato). Un prodotto nuovo vuole anche la sua riga in `products` con una migrazione (come
  `20261124130000_bx11_launcher_grip.sql`) e, dopo la pubblicazione, la sincronizzazione Stripe
  (`pnpm stripe:products --apply <slug>`): scrivilo nel riassunto, qui non si può fare.

## Prima di finire

`pnpm lint`, `pnpm typecheck` e `pnpm test` devono passare: correggi finché passano. Dopo il tuo
lavoro partono anche i controlli completi (database, test nel browser, build), quindi non lasciare
nulla di rotto.

Il repository è pubblico: nel codice, nei commenti e nel riassunto niente costi d'acquisto,
margini, fornitori, dati di clienti o di ordini.

## Riassunto

La tua ultima risposta diventa la descrizione della pull request e il riassunto che il socio legge
sul telefono. In italiano, breve, senza tabelle: cosa hai cambiato, dove vederlo nell'anteprima
(percorsi di pagina, es. `/prodotto/<slug>`), cosa non hai fatto e perché, le migrazioni da
applicare e i passi che restano dopo la pubblicazione.
