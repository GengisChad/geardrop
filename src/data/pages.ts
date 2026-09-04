/**
 * Copy for the informational routes the mockups' footer links to.
 *
 * Operational facts (free-shipping threshold, delivery window, returns window) are taken
 * from the mockups so the site never contradicts its own announcement bar. Legal pages
 * carry an explicit notice: placeholder wording is not a substitute for reviewed terms.
 */

import { COMPANY_LEGAL } from "@/lib/company";

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
        heading: "I prodotti sono originali?",
        body: [
          "Sì. Vendiamo esclusivamente prodotti ufficiali Beyblade X. Nessuna replica, nessun articolo non autorizzato.",
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
          "Il prodotto è già ordinato e sta per entrare in magazzino. Puoi acquistarlo subito: lo spediamo appena disponibile.",
        ],
      },
      {
        heading: "Cosa significa “pre-ordine”?",
        body: [
          "Ordini ora con pagamento anticipato e ti assicuri il prodotto. Arriva a destinazione entro un massimo di 14 giorni dalla conferma del pagamento.",
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
          "Gli ordini confermati entro le 14:00 nei giorni lavorativi partono in giornata.",
          "La consegna standard avviene in 24/48h in tutta Italia. Nelle isole e nelle zone disagiate può servire un giorno in più.",
        ],
      },
      {
        heading: "Costi",
        body: [
          "Spedizione gratuita per ordini superiori a 59€.",
          "Sotto la soglia, la spedizione standard costa 4,90€. L'opzione Express è disponibile in checkout con un supplemento di 6,90€.",
        ],
      },
      {
        heading: "Tracciamento",
        body: ["Ricevi il codice di tracciamento via email appena il pacco lascia il magazzino."],
      },
      {
        heading: "Prodotti in pre-ordine",
        body: [
          "I pre-ordini si pagano in anticipo tramite PayPal.Me. Il prodotto arriva a destinazione entro un massimo di 14 giorni dalla conferma del pagamento.",
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
      {
        heading: "Dati societari",
        body: [
          `${COMPANY_LEGAL.legalName} — ${COMPANY_LEGAL.registeredOffice}.`,
          `P.IVA ${COMPANY_LEGAL.euVatNumber} · REA ${COMPANY_LEGAL.reaNumber} · PEC ${COMPANY_LEGAL.certifiedEmail}.`,
          "Store ufficiale affiliato a Gear Sports Italia.",
        ],
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
        body: [
          "Questo contratto regola la vendita a distanza dei prodotti offerti su GEAR//DROP, store ufficiale affiliato a Gear Sports Italia.",
          `Venditore: ${COMPANY_LEGAL.legalName} (${COMPANY_LEGAL.legalForm}), ${COMPANY_LEGAL.registeredOffice} — P.IVA ${COMPANY_LEGAL.euVatNumber}, REA ${COMPANY_LEGAL.reaNumber}, PEC ${COMPANY_LEGAL.certifiedEmail}.`,
        ],
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
      {
        heading: "Titolare del trattamento",
        body: [
          `Il titolare del trattamento è ${COMPANY_LEGAL.legalName}, ${COMPANY_LEGAL.registeredOffice}, P.IVA ${COMPANY_LEGAL.euVatNumber}.`,
          `Per esercitare i tuoi diritti scrivi a ${COMPANY_LEGAL.supportEmail} (PEC ${COMPANY_LEGAL.certifiedEmail}).`,
        ],
      },
      { heading: "Dati raccolti e finalità", body: ["Questa sezione elencherà dati, finalità e basi giuridiche."] },
      { heading: "Cookie", body: ["Questa sezione elencherà i cookie usati e le modalità di consenso."] },
      { heading: "Diritti dell'interessato", body: ["Questa sezione descriverà i diritti previsti dal GDPR."] },
    ],
  },
} as const satisfies Record<string, ContentPage>;

export type SupportSlug = keyof typeof SUPPORT_PAGES;
export type LegalSlug = keyof typeof LEGAL_PAGES;
