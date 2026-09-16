/**
 * Copy for the informational routes the mockups' footer links to.
 *
 * Operational facts use the reviewed preorder dispatch window. The legal pages identify the
 * seller by holder name, registered office, VAT number and contact email.
 */

export type ContentSection = { heading: string; body: readonly string[] };

export type ContentPage = {
  readonly title: string;
  readonly lead: string;
  readonly sections: readonly ContentSection[];
  /** Rendered as a warning banner above the content. */
  readonly notice?: string;
};

export const SUPPORT_PAGES = {
  faq: {
    title: "Domande frequenti",
    lead: "Le risposte alle domande che ci arrivano più spesso.",
    sections: [
      {
        heading: "Cosa include il catalogo?",
        body: [
          "Il catalogo raccoglie trottole, set e accessori Beyblade X con descrizioni e disponibilità indicate per ciascun prodotto.",
        ],
      },
      {
        heading: "Quanto costa la spedizione?",
        body: [
          "La spedizione standard è gratuita per ordini superiori a 59€. Sotto questa soglia si applica una tariffa fissa di 4,90€.",
        ],
      },
      {
        heading: "Cosa significa “in arrivo”?",
        body: [
          "La disponibilità è in aggiornamento. Contattaci prima dell'ordine per conoscere lo stato corrente.",
        ],
      },
      {
        heading: "Cosa significa “pre-ordine”?",
        body: [
          "Il prodotto è prenotabile entro l'allocazione indicata. GEAR//DROP affida il pacco al corriere entro 14 giorni dalla conferma dell'ordine.",
        ],
      },
      {
        heading: "Posso cambiare idea?",
        body: ["Hai 30 giorni dalla consegna per richiedere il reso. Vedi la pagina Resi e rimborsi."],
      },
    ],
  },
  spedizioni: {
    title: "Spedizioni",
    lead: "Come e quando arriva il tuo ordine.",
    sections: [
      {
        heading: "Tempi di consegna",
        body: [
          "Per i pre-ordini, GEAR//DROP affida il pacco al corriere entro 14 giorni dalla conferma dell'ordine.",
          "I tempi di transito del corriere iniziano dalla spedizione e dipendono dal servizio e dalla destinazione.",
        ],
      },
      {
        heading: "Costi",
        body: [
          "Spedizione gratuita per ordini superiori a 59€.",
          "Sotto la soglia, la spedizione standard costa 4,90€. Le opzioni disponibili sono mostrate prima della conferma.",
        ],
      },
      {
        heading: "Tracciamento",
        body: ["Le informazioni di tracciamento vengono comunicate quando il pacco viene affidato al corriere."],
      },
      {
        heading: "Prodotti in pre-ordine",
        body: [
          "Gli articoli dello stesso ordine vengono gestiti insieme. Per esigenze diverse, chiedi assistenza prima della conferma.",
        ],
      },
    ],
  },
  resi: {
    title: "Resi e rimborsi",
    lead: "Se qualcosa non va, si risolve.",
    sections: [
      {
        heading: "Hai 30 giorni",
        body: [
          "Puoi richiedere il reso entro 30 giorni dalla consegna, per qualsiasi motivo, purché il prodotto sia integro e nella confezione originale.",
        ],
      },
      {
        heading: "Come richiederlo",
        body: [
          "Scrivici dalla pagina Contatti indicando il numero d'ordine. Ti inviamo l'etichetta di reso e le istruzioni.",
        ],
      },
      {
        heading: "Rimborsi",
        body: [
          "Il rimborso viene emesso entro 5 giorni lavorativi dalla ricezione del reso, sullo stesso metodo di pagamento usato per l'ordine.",
        ],
      },
      {
        heading: "Prodotto difettoso",
        body: [
          "Se il prodotto arriva danneggiato o difettoso, la spedizione di reso è a nostro carico e la sostituzione è prioritaria.",
        ],
      },
    ],
  },
  contatti: {
    title: "Contattaci",
    lead: "Siamo blader anche noi: rispondiamo da persone, non da bot.",
    sections: [
      {
        heading: "Assistenza ordini",
        body: [
          "Per qualsiasi domanda su un ordine, scrivi a infogeardrop@gmail.com indicando il numero d'ordine.",
          "Rispondiamo entro un giorno lavorativo.",
        ],
      },
      {
        heading: "Community",
        body: ["Per consigli su combo e assetti, la community è il posto giusto: ci trovi sui canali social."],
      },
      {
        heading: "Collaborazioni",
        body: ["Organizzi tornei o gestisci un negozio? Scrivi a infogeardrop@gmail.com."],
      },
    ],
  },
} as const satisfies Record<string, ContentPage>;

/** Seller facts published on the site. Tax code, PEC and REA stay off it by the owner's choice. */
const SELLER = {
  holder: "Alessia Brunetti",
  vat: "18464231002",
  office: "Via Fratelli Cervi 2, 00065 Fiano Romano (RM)",
  email: "infogeardrop@gmail.com",
} as const;

export const LEGAL_PAGES = {
  termini: {
    title: "Termini e condizioni",
    lead: "Condizioni di vendita su geardropshop.it. Ultimo aggiornamento: 15 settembre 2026.",
    sections: [
      {
        heading: "Chi vende",
        body: [
          `Il sito geardropshop.it ("GEAR//DROP") è gestito da ${SELLER.holder}, impresa individuale con sede legale in ${SELLER.office}, Partita IVA ${SELLER.vat}.`,
          `Per assistenza, reclami e comunicazioni scrivi a ${SELLER.email}.`,
        ],
      },
      {
        heading: "Ambito",
        body: [
          "Queste condizioni regolano gli acquisti effettuati su geardropshop.it da consumatori, cioè persone fisiche che agiscono per scopi estranei alla propria attività professionale. Gli acquisti sono riservati ai maggiorenni.",
          "Confermando l'ordine dichiari di aver letto e accettato queste condizioni, sempre disponibili su questa pagina.",
        ],
      },
      {
        heading: "Prodotti e pre-ordini",
        body: [
          "Le caratteristiche essenziali di ogni prodotto sono indicate nella sua scheda; le immagini rappresentano la confezione.",
          "I prodotti in pre-ordine sono acquistabili entro la quantità indicata e vengono affidati al corriere entro 14 giorni dalla conferma del pagamento.",
          "Se dopo il pagamento un prodotto non può essere spedito nei tempi indicati ti avvisiamo via email e, a tua scelta, concordiamo una nuova data oppure ti rimborsiamo l'intero importo pagato, spedizione compresa, entro 14 giorni.",
        ],
      },
      {
        heading: "Prezzi e spedizione",
        body: [
          "I prezzi sono espressi in euro e comprendono l'IVA.",
          "La spedizione standard in Italia costa 4,90 € ed è gratuita per ordini da 59 €. Il totale, spedizione inclusa, è mostrato prima del pagamento.",
        ],
      },
      {
        heading: "Ordine e pagamento",
        body: [
          "Dopo aver inserito i dati di spedizione vieni indirizzato alla pagina di pagamento sicura di Stripe, dove puoi pagare con carta, Apple Pay, Google Pay o gli altri metodi mostrati. I dati della carta sono trattati solo da Stripe: GEAR//DROP non li riceve né li conserva.",
          "Il contratto si conclude quando il pagamento è completato. Ricevi la conferma con il riferimento dell'ordine (GD-XXXXXXXX) e la ricevuta via email.",
          "In caso di errore evidente di prezzo, di quantità non più disponibile o di sospetto di frode, GEAR//DROP può annullare l'ordine rimborsandolo integralmente.",
        ],
      },
      {
        heading: "Spedizione e consegna",
        body: [
          "Spediamo in Italia tramite corrieri nazionali. Il numero di tracciamento, quando disponibile, ti viene comunicato via email; i tempi di transito dipendono dal corriere.",
          "Il rischio di perdita o danneggiamento passa a te al momento della consegna. Segnalaci subito eventuali danni visibili al pacco, conservando imballo e prodotto.",
        ],
      },
      {
        heading: "Diritto di recesso",
        body: [
          "Puoi recedere dal contratto senza indicarne il motivo entro 14 giorni dalla consegna, come previsto dagli artt. 52 e seguenti del Codice del Consumo. GEAR//DROP estende questo termine a 30 giorni dalla consegna.",
          `Per esercitarlo scrivi a ${SELLER.email} prima della scadenza indicando il riferimento dell'ordine. Puoi usare il modulo tipo in fondo a questa pagina, ma non è obbligatorio.`,
          "Restituisci i prodotti integri, completi e nella confezione originale entro 14 giorni dalla comunicazione. Le spese di restituzione sono a carico di GEAR//DROP: ti inviamo noi l'etichetta di reso.",
          "Ti rimborsiamo tutti i pagamenti ricevuti, spedizione standard compresa, entro 14 giorni dalla comunicazione di recesso e con lo stesso metodo di pagamento. Il rimborso può essere sospeso fino al ricevimento dei prodotti o alla prova della loro spedizione. Resta a tuo carico solo la diminuzione di valore dovuta a un uso diverso da quello necessario per verificarli.",
        ],
      },
      {
        heading: "Garanzia legale di conformità",
        body: [
          "Tutti i prodotti godono della garanzia legale di conformità di 24 mesi dalla consegna prevista dagli artt. 128 e seguenti del Codice del Consumo.",
          `In caso di difetto scrivi a ${SELLER.email} con il riferimento dell'ordine e, se possibile, una foto. Per i prodotti danneggiati o difettosi la sostituzione è prioritaria e la spedizione è a carico di GEAR//DROP.`,
        ],
      },
      {
        heading: "Dati personali",
        body: [
          "I dati forniti con l'ordine sono trattati come descritto nella pagina Privacy e cookie.",
        ],
      },
      {
        heading: "Legge applicabile e foro competente",
        body: [
          "Il contratto è regolato dalla legge italiana. Per le controversie con il consumatore è competente il giudice del luogo di residenza o domicilio del consumatore. Restano salvi i diritti inderogabili previsti a tutela dei consumatori.",
        ],
      },
      {
        heading: "Modulo di recesso tipo",
        body: [
          `Destinatario: GEAR//DROP di ${SELLER.holder}, ${SELLER.office}, ${SELLER.email}.`,
          "Con la presente notifico il recesso dal mio contratto di vendita dei seguenti beni: … · Ordinati il / ricevuti il: … · Riferimento ordine: … · Nome e indirizzo del consumatore: … · Data e firma (solo se inviato su carta): …",
        ],
      },
    ],
  },
  privacy: {
    title: "Privacy e cookie",
    lead: "Come trattiamo i dati personali. Ultimo aggiornamento: 15 settembre 2026.",
    sections: [
      {
        heading: "Titolare del trattamento",
        body: [
          `Il titolare del trattamento è ${SELLER.holder}, impresa individuale che gestisce GEAR//DROP, con sede legale in ${SELLER.office}, Partita IVA ${SELLER.vat}.`,
          `Per qualsiasi richiesta sui tuoi dati personali scrivi a ${SELLER.email}.`,
        ],
      },
      {
        heading: "Quali dati trattiamo",
        body: [
          "Ordine: nome, cognome, email, telefono, indirizzo di spedizione, note per il corriere, prodotti e importi.",
          "Pagamento: esito, metodo usato e riferimento della transazione. I dati completi della carta sono trattati esclusivamente da Stripe.",
          "Assistenza: i messaggi e i dati che ci invii. Account: se ne crei uno, l'email e le credenziali di accesso.",
          "Navigazione: dati tecnici necessari al funzionamento del sito e statistiche aggregate e anonime sulle pagine visitate. Carrello e preferiti restano salvati nel tuo browser.",
        ],
      },
      {
        heading: "Perché li trattiamo",
        body: [
          "Per gestire ordine, pagamento, spedizione, resi e garanzia, sulla base del contratto (art. 6.1.b GDPR).",
          "Per adempiere agli obblighi fiscali e contabili, sulla base di un obbligo di legge (art. 6.1.c GDPR).",
          "Per rispondere alle richieste di assistenza, sulla base del contratto o di misure precontrattuali (art. 6.1.b GDPR).",
          "Per la sicurezza del sito, la prevenzione delle frodi e le statistiche anonime di visita, sulla base del legittimo interesse (art. 6.1.f GDPR).",
          "Non usiamo i dati per profilazione né per inviarti pubblicità. Fornire i dati dell'ordine è necessario per evaderlo.",
        ],
      },
      {
        heading: "Per quanto tempo",
        body: [
          "Dati dell'ordine e documenti contabili: 10 anni, come previsto dall'art. 2220 del Codice civile.",
          "Richieste di assistenza: fino a 24 mesi dall'ultima comunicazione. Dati dell'account: fino alla sua cancellazione.",
        ],
      },
      {
        heading: "A chi li comunichiamo",
        body: [
          "Stripe Payments Europe Ltd. (Irlanda), per l'elaborazione dei pagamenti.",
          "Vercel Inc. (Stati Uniti), per l'hosting del sito e le statistiche anonime di visita; Supabase, per gli account utente.",
          "Corrieri, per la consegna, e consulenti fiscali, per gli adempimenti contabili.",
          "I fornitori che trattano dati per nostro conto agiscono come responsabili del trattamento ai sensi dell'art. 28 GDPR.",
        ],
      },
      {
        heading: "Trasferimenti fuori dall'Unione europea",
        body: [
          "Alcuni fornitori, come Vercel, hanno sede negli Stati Uniti: i trasferimenti avvengono sulla base dell'EU-US Data Privacy Framework o delle clausole contrattuali standard approvate dalla Commissione europea.",
        ],
      },
      {
        heading: "Cookie",
        body: [
          "Il sito usa solo strumenti tecnici necessari al funzionamento, come il carrello e la sessione di accesso: per questi non serve il consenso.",
          "Le statistiche di visita (Vercel Web Analytics) non usano cookie e non identificano i visitatori.",
          "La pagina di pagamento è gestita da Stripe sul proprio dominio, con i propri strumenti tecnici e antifrode. Non usiamo cookie di profilazione o pubblicitari.",
        ],
      },
      {
        heading: "I tuoi diritti",
        body: [
          `Puoi chiedere accesso, rettifica, cancellazione, limitazione e portabilità dei dati e opporti ai trattamenti basati sul legittimo interesse (artt. 15-22 GDPR) scrivendo a ${SELLER.email}. Rispondiamo entro un mese.`,
          "Hai inoltre il diritto di proporre reclamo al Garante per la protezione dei dati personali (www.garanteprivacy.it).",
        ],
      },
    ],
  },
} as const satisfies Record<string, ContentPage>;

export type SupportSlug = keyof typeof SUPPORT_PAGES;
export type LegalSlug = keyof typeof LEGAL_PAGES;
