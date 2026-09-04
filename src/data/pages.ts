/**
 * Copy for the informational routes the mockups' footer links to.
 *
 * Operational facts use the reviewed preorder dispatch window. Legal pages carry an
 * explicit notice: placeholder wording is not a substitute for reviewed terms.
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
          "Per qualsiasi domanda su un ordine, scrivi a supporto@geardrop.it indicando il numero d'ordine.",
          "Rispondiamo entro un giorno lavorativo.",
        ],
      },
      {
        heading: "Community",
        body: ["Per consigli su combo e assetti, la community è il posto giusto: ci trovi sui canali social."],
      },
      {
        heading: "Collaborazioni",
        body: ["Organizzi tornei o gestisci un negozio? Scrivi a partner@geardrop.it."],
      },
    ],
  },
} as const satisfies Record<string, ContentPage>;

const LEGAL_NOTICE =
  "Testo segnaposto. Questa pagina non è stata redatta né revisionata da un legale e non ha valore contrattuale: va sostituita prima della messa online.";

export const LEGAL_PAGES = {
  termini: {
    title: "Termini e condizioni",
    lead: "Le regole di utilizzo del sito e di acquisto.",
    notice: LEGAL_NOTICE,
    sections: [
      {
        heading: "Oggetto",
        body: ["Questa sezione descriverà l'ambito del contratto di vendita tra GEAR//DROP e il cliente."],
      },
      {
        heading: "Ordini e prezzi",
        body: ["Questa sezione descriverà conclusione dell'ordine, disponibilità, prezzi e IVA."],
      },
      { heading: "Diritto di recesso", body: ["Questa sezione riporterà il recesso previsto dal Codice del Consumo."] },
      { heading: "Garanzia legale di conformità", body: ["Questa sezione riporterà la garanzia legale applicabile."] },
    ],
  },
  privacy: {
    title: "Privacy e cookie",
    lead: "Come trattiamo i dati personali.",
    notice: LEGAL_NOTICE,
    sections: [
      { heading: "Titolare del trattamento", body: ["Questa sezione indicherà il titolare e i contatti."] },
      { heading: "Dati raccolti e finalità", body: ["Questa sezione elencherà dati, finalità e basi giuridiche."] },
      { heading: "Cookie", body: ["Questa sezione elencherà i cookie usati e le modalità di consenso."] },
      { heading: "Diritti dell'interessato", body: ["Questa sezione descriverà i diritti previsti dal GDPR."] },
    ],
  },
} as const satisfies Record<string, ContentPage>;

export type SupportSlug = keyof typeof SUPPORT_PAGES;
export type LegalSlug = keyof typeof LEGAL_PAGES;
