# L'assistente lavora sul codice del sito

Dal 24/11/2026 (proprietario: "voglio che l'assistente IA dentro al sito sia praticamente come un
agente qui, deve poter far tutto e avere accesso al git, repo"), l'assistente del gestionale
(`/admin/assistente`) affida a **Claude Code** tutto ciò che le sue azioni sul database non fanno:
un prodotto nuovo sul sito, foto nuove, testi e pagine fuori dalla scheda prodotto, grafica, un
errore, una funzione nuova del sito o del gestionale.

## Come funziona

1. Il socio chiede la modifica in chat. L'assistente scrive l'incarico completo e prepara la scheda
   **Lavoro sul codice**; con «Conferma» parte il workflow
   [`assistant-code.yml`](../../.github/workflows/assistant-code.yml).
2. In GitHub Actions Claude Code lavora con il brief
   [`.github/assistant/brief.md`](../../.github/assistant/brief.md) e le regole di `CLAUDE.md`, in
   un job senza alcun permesso di scrittura e senza token GitHub; lì girano anche lint, typecheck e
   test sul suo lavoro, che passa avanti come patch. Un secondo job, su una macchina pulita che non
   esegue mai il codice del repository, applica la patch, fa il commit con gli hook spenti, pubblica
   il branch `assistente/<id>`, apre la PR con l'etichetta `assistente` (in bozza se la verifica non
   passa) e fa partire i controlli completi (`supabase-database-ci.yml`, circa 20 minuti). Vercel
   costruisce l'anteprima del branch.
3. «A che punto è?» → lo strumento `lavori_codice` legge da GitHub lavori, PR, verifica, controlli,
   link dell'anteprima, migrazioni e il riassunto di Claude Code.
4. Per correggere: «sulla PR #N cambia …» → un nuovo lavoro sullo stesso branch.
5. **Pubblica** (scelta del proprietario: PR + anteprima + tasto): solo con verifica e controlli
   completi verdi, senza conflitti e senza migrazioni esistenti modificate. Il merge è squash e
   fissato allo SHA mostrato nella scheda; Vercel mette online main in circa 3 minuti.
6. **Applica al database** (scelta del proprietario: conferma a parte): dopo la pubblicazione, se la
   PR ha migrazioni nuove, una seconda scheda le mostra con il loro commento iniziale e, confermata,
   avvia [`assistant-migrations.yml`](../../.github/workflows/assistant-migrations.yml), che
   ricontrolla PR e file e usa `scripts/apply-migration.mjs`.
7. **Scarta**: chiude la PR e cancella il branch.

Ogni scheda parte solo con «Conferma» di un **owner o admin** (scelta del proprietario: tutti i soci
admin), con la sessione di chi conferma. Il ruolo editor non usa l'assistente.

## Limiti voluti

- Su main non arriva niente senza «Pubblica». Le PR che l'assistente può pubblicare o scartare sono
  solo le sue: branch `assistente/*` di questo repository, base main, etichetta `assistente`.
- Claude Code gira su una macchina usa e getta senza chiavi di produzione e senza token GitHub (il
  checkout non tiene credenziali), e niente di ciò che scrive gira accanto a un token: il job che fa
  il push riparte da zero e applica solo la patch. Una patch che tocca `.git/`, `.github/`,
  `.claude/` o file `.env` non viene committata. Con il `GITHUB_TOKEN` di Actions un push non può
  comunque cambiare i workflow.
- Claude Code lavora senza conferme e con la rete: se un incarico o una pagina letta lo
  ingannassero, l'unica chiave che ha in mano è quella Anthropic del runner. Per questo è una
  chiave **dedicata** con un limite di spesa, non quella di Vercel.
- Le anteprime Vercel eseguono il codice del branch con le variabili d'ambiente **Preview**: lì non
  devono esserci chiavi di produzione (Stripe live, Supabase secret, Resend, InPost). Con il `GITHUB_TOKEN` di
  Actions un push non può comunque cambiare i workflow.
- Rimborsi, annullamenti e coupon restano a mano: muovono soldi.
- La sincronizzazione Stripe di un prodotto nuovo (`pnpm stripe:products --apply <slug>`) resta da
  fare da qui: Claude Code lo scrive nel riassunto.
- Il repository è **pubblico**: incarico, PR e riassunto sono visibili a tutti. L'assistente non ci
  scrive costi, margini, fornitori, clienti o ordini; la scheda lo ricorda.
- Ogni lavoro costa API Anthropic: tetto `ASSISTANT_CODE_BUDGET_USD` (predefinito 8 $), modello
  `ASSISTANT_CODE_MODEL` (predefinito `claude-opus-5-5`), variabili del repository. La versione di
  Claude Code è fissata nel workflow (`CLAUDE_CODE_VERSION`). Premere due volte la stessa scheda
  non fa partire due lavori.
- L'incarico non può contenere email, numeri d'ordine o di telefono: la scheda lo rifiuta.

## Da fare una volta (titolare)

1. **Secret del repository** (GitHub → Settings → Secrets and variables → Actions):
   - `ASSISTANT_ANTHROPIC_API_KEY`: una chiave Anthropic **nuova e dedicata**, creata in un
     workspace della Console con un limite di spesa mensile (es. 50 $). Non la chiave di Vercel.
   - `SUPABASE_ACCESS_TOKEN`: il token di `.env.local`, per le migrazioni.
2. **Permesso alle Actions di aprire PR**: Settings → Actions → General → Workflow permissions →
   spunta «Allow GitHub Actions to create and approve pull requests».
3. **Token per il gestionale**: GitHub → Settings → Developer settings → Fine-grained tokens →
   nuovo token, solo il repository `GengisChad/geardrop`, permessi del repository:
   Actions (lettura e scrittura), Contents (lettura e scrittura), Pull requests (lettura e
   scrittura), Commit statuses (lettura), Deployments (lettura), Metadata (lettura). Scadenza a
   scelta (alla scadenza l'assistente dice che il token non è valido).
4. **Vercel**: variabile `GITHUB_ASSISTANT_TOKEN` (Production) con quel token, poi redeploy.
5. **Vercel → Settings → Environment Variables**: controlla la colonna Preview e togli da lì ogni
   chiave di produzione. Se la protezione delle anteprime è attiva, per aprirle serve essere
   entrati in Vercel con un account del team.
