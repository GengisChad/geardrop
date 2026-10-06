# Magazzino a costo, fatture fornitore e profitto

Ogni pezzo in magazzino ha un costo netto IVA che entra con la merce; ogni ordine pagato mostra
il suo profitto, oppure dice cosa manca per calcolarlo. Vale per ogni azienda separatamente.
Costi, carichi, fornitori e profitto sono visibili solo a owner e admin (RLS, non solo interfaccia).

## Uso quotidiano

1. **Fornitori** (`/admin/fornitori`): nome, paese, partita IVA e regime IVA degli acquisti.
   - `intra_ue` (es. fornitore spagnolo): la fattura arriva senza IVA, il costo è l'imponibile.
   - `nazionale`: si registra l'imponibile, l'IVA è detraibile e non entra nel costo.
   - `extra_ue`: imponibile; dazi e sdoganamento vanno nel campo "Dazi e altri costi".
2. **Carichi merce** (`/admin/carichi/nuovo`): riportare la fattura o il DDT riga per riga, con
   quantità e costo unitario netto. Trasporto e dazi si ripartiscono sulle righe in proporzione
   al valore; l'editor mostra subito il costo a magazzino di ogni riga.
3. **Carica in magazzino**: scrivere `CARICA`. La giacenza sale, ogni riga diventa un movimento
   valorizzato e il costo medio ponderato del prodotto si aggiorna. Il documento non si modifica
   più: un errore si corregge con **Storna documento** (motivo obbligatorio), che toglie i pezzi al
   loro costo di carico. Lo storno è rifiutato se quei pezzi sono già stati venduti.
4. **Costi di apertura** (`/admin/carichi`, riquadro in fondo, solo owner): per la merce già a
   scaffale incollare `SKU;costo`, una riga per prodotto. La giacenza non cambia; le vendite passate
   di quel prodotto senza costo lo ricevono, così anche gli ordini già fatti mostrano il profitto.
   Un costo che non si conosce **non si inserisce**: il prodotto resta "costo mancante".
5. **Scheda prodotto**: costo medio, ultimo costo, margine sul prezzo netto IVA e ultimi carichi.
   Salvare un prezzo netto sotto il costo medio richiede la spunta di conferma.
6. **Ordini**: colonna Profitto (o "incompleto" con le voci mancanti); nel dettaglio il conto
   economico e i campi costo corriere, imballo e commissione per quell'ordine.

## Come si calcola il profitto

| Voce | Fonte |
| --- | --- |
| Ricavo netto | (totale − rimborsi) scorporata l'IVA con l'aliquota salvata sull'ordine |
| Costo merce | somma dei movimenti di magazzino dell'ordine, ognuno al costo medio del suo momento (bundle compresi, componente per componente) |
| Corriere | costo inserito sull'ordine, altrimenti "Costo corriere per noi" del metodo di spedizione (Spedizioni) |
| Commissione | letta da Stripe (`balance_transaction`) dal webhook; oppure inserita a mano, che prevale |
| Imballo | costo inserito sull'ordine, altrimenti il predefinito dell'azienda (Impostazioni) |

**Profitto = ricavo netto − merce − corriere − commissione − imballo.** Se manca una voce il
profitto resta vuoto e l'ordine è escluso dai totali della panoramica: nessuna stima silenziosa.
È un margine gestionale, non un utile fiscale.

## Impostazioni da fare una volta

- **Impostazioni → Costi predefiniti** (owner): aliquota IVA delle vendite (22%) e imballo per ordine.
- **Spedizioni**: per ogni metodo, "Costo corriere per noi" (es. 4,00). Per il ritiro a mano,
  inserire 0 sull'ordine o creare un metodo di ritiro con costo 0.
- **Stripe**: nessuna configurazione nuova; il webhook esistente legge la commissione. Se Stripe non
  l'ha ancora regolata l'ordine resta incompleto finché un retry o un socio la completa.

## Da confermare con il commercialista

Trattamento degli acquisti intracomunitari (inversione contabile), aliquota sulle vendite verso
consumatori di altri paesi UE (OSS), commissione Stripe come costo. Il gestionale applica ciò che
viene confermato, non lo decide.

## Riferimenti tecnici

- Migrazioni `20261006160000_add_inventory_costs.sql`, `20261006170000_add_goods_receipt_functions.sql`.
- Tabelle: `suppliers`, `supplier_receipts` (A), `supplier_receipt_lines` (B), `inventory_cost_state`
  (A), `inventory_movement_costs` (C, figlia dei movimenti, leggibile solo da owner/admin).
- Viste `order_profit`, `inventory_valuation` (`security_invoker`); RPC `save_supplier_receipt`,
  `confirm_supplier_receipt`, `reverse_supplier_receipt`, `set_product_cost`, `set_order_costs`,
  `record_order_payment_fee` (solo webhook), `set_organization_cost_defaults`, `get_warehouse_summary`.
- Test: pgTAP `045_inventory_costs`, unit `warehouse`, e2e `warehouse-costs.spec.ts`.
