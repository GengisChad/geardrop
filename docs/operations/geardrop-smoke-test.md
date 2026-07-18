# Smoke test funzionale — GearDrop Development

Percorso guidato da eseguire con un owner reale sulla Preview Vercel collegata a GearDrop
Development, dopo `geardrop-owner-bootstrap.md`. Verifica che il pannello funzioni con dati veri,
non sostituisce `full-admin-rollout-checklist.md` (la matrice di sicurezza) né i test automatici
(CI). È un cammino a mano, in ordine, su un ambiente che resta reversibile: ogni oggetto creato qui
è marcato come test e va archiviato o eliminato al punto 25.

Eseguire a tre larghezze: 390px (mobile), 768px (tablet), 1440px (desktop) — almeno il login e la
dashboard vanno verificati a tutte e tre; il resto del percorso può girare a 1440px con controlli
puntuali di overflow alle altre due.

## Percorso owner

1. **Login admin** con uno dei due owner bootstrap. Verificare redirect a `/admin` e nessun errore
   console.
2. **Dashboard**: aggregati mostrano zero/empty state coerenti con un database appena seedato
   (nessuna metrica inventata).
3. **Crea una categoria di test** (nome chiaramente marcato, es. "ZZZ Test Smoke").
4. **Crea un prodotto in bozza** collegato a quella categoria.
5. **Carica più immagini** sul prodotto tramite upload multiplo.
6. **Verifica lifecycle media**: le immagini passano da `pending` a `ready` (o `failed` se il file
   non è valido — provare anche un caso di errore atteso, es. file non immagine, per confermare che
   fallisca in modo pulito).
7. **Associa un'immagine ready** al prodotto.
8. **Imposta l'immagine primaria**.
9. **Pubblica il prodotto**.
10. **Verifica la preview pubblica** del prodotto pubblicato (storefront, non admin) — deve essere
    raggiungibile e mostrare i dati corretti.
11. **Modifica il prezzo** del prodotto e verifica che il pricing pubblico rifletta il nuovo valore
    (autorevole da server, non fidarsi solo dell'UI admin).
12. **Modifica lo stock** esclusivamente tramite l'azione `adjust_inventory` nell'UI (mai da una
    ipotetica scrittura diretta — verificare che l'unica via disponibile sia questa).
13. **Verifica il movimento di stock**: deve comparire uno storico append-only con motivo e
    quantità corretti.
14. **Crea un bundle disattivato** (non pubblicato) che referenzia il prodotto di test.
15. **Crea una promozione disattivata**.
16. **Crea un coupon disattivato**.
17. **Sposta una sezione della homepage** (drag o tastiera) e salva.
18. **Salva la navigazione** (menu desktop/mobile) con una voce di test.
19. **Salva il footer** con un link di test.
20. **Modifica una pagina informativa** esistente (Markdown) e salva come bozza, poi pubblica.
21. **Controlla l'audit**: ogni azione 3-20 deve comparire con attore, timestamp e oggetto
    corretti, ricercabile.
22. **Controlla le impostazioni** (negozio/SEO/contatti/social): leggibili e modificabili da owner.
23. **Verifica il team**: entrambi gli owner visibili, ruoli corretti, nessun altro staff.
24. **Verifica l'intro video**: **salta questo punto** — non ancora implementato in questo branch
    (nessun componente, nessun asset in `public/video/`). Non bloccante per lo smoke test; annotare
    come gap noto nel checkpoint finale.
25. **Pulizia**: elimina o archivia categoria, prodotto, bundle, promozione, coupon e voci di test
    creati ai punti 3-19. Verificare che l'hard delete (se usato) rispetti i gate di dipendenza
    esistenti — se il prodotto è referenziato da un bundle, l'eliminazione diretta deve essere
    impedita finché il bundle non è a sua volta rimosso o scollegato.

## Percorso editor — matrice permessi

Con un secondo utente promosso a `editor` (promuoverlo dalla UI team come owner, non via SQL):

| Azione | Atteso |
| --- | --- |
| Modificare contenuti (homepage, pagine, categorie/prodotti non di prezzo) | Consentito |
| Caricare immagini | Consentito |
| Modificare prezzi | Negato |
| Modificare stock | Negato |
| Vedere/modificare ordini sensibili | Negato |
| Modificare impostazioni sensibili (Stripe, SMTP, chiavi) | Negato |
| Gestire team (promuovere/rimuovere staff) | Negato |
| Hard delete di prodotti/categorie/bundle | Negato |

Ogni riga "Negato" deve fallire lato server (Server Action o RLS), non solo nascondere il controllo
lato client — verificare che un tentativo diretto (bottone reso visibile via devtools, o chiamata
diretta se applicabile) venga comunque rifiutato.

## Se qualcosa fallisce

Non proseguire oltre il passo che fallisce. Registrare: passo, comportamento atteso, comportamento
osservato, ruolo/sessione usata, larghezza viewport. Non improvvisare una correzione remota — la
correzione va fatta in locale con test RED→GREEN e un nuovo gate CI, poi ripetuto lo smoke test dal
passo fallito.
