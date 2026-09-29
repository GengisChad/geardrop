/**
 * The real Beyblade X products supplied by the owner: six on 2026-09-04, three Infinity Starter
 * Packs on 2026-09-15, five pre-order pieces on 2026-09-21 and, the same day, the deck case in
 * seven colours. Prices and allocations are reviewed inputs; no product or review data is invented.
 *
 * The order here is the order the shop shows: the newest drop leads, the Infinity Starters
 * follow, then the rest of the catalogue.
 */

import { productImages } from "@/data/assets";
import { VARIANT_FAMILIES, type VariantColour } from "@/data/variant-families";
import type { Bundle, Category, Product } from "@/lib/commerce/types";

const eur = (amount: number) => ({ amount, currency: "EUR" }) as const;

/**
 * One colour of the deck case: printed in 3D, not a Hasbro product, €24,50 in every colour (the
 * owner raised it from €20 the day it launched), with no stock limit (no count on a product in stock). Owner's words: it also takes the Expanded
 * and Infinity tops. The colours live in variant-families.ts.
 */
const DECK_CASE = VARIANT_FAMILIES["porta-deck"]!;

function deckCase({ slug, label, swatch }: VariantColour): Product {
  return {
    slug, name: `${DECK_CASE.name} ${label}`, tagline: "Tre trottole al sicuro. Anche Expanded e Infinity.",
    description: "Il porta deck tiene un deck completo di Beyblade X: tre scomparti, uno per trottola, ognuno con la sua chiusura a clip. Entrano anche i bey Expanded e Infinity. Stampato in 3D. Accessorio non ufficiale: non è prodotto né certificato da Hasbro.",
    price: eur(2450), category: "accessori", stock: "disponibile", tags: [], rating: 0, reviewCount: 0,
    images: productImages[slug],
    specs: [{ label: "Tipo", value: "Porta deck" }, { label: "Produttore", value: "Non ufficiale, non prodotto da Hasbro" }, { label: "Compatibilità", value: "Beyblade X, compresi Expanded e Infinity" }, { label: "Scomparti", value: "3, uno per trottola" }, { label: "Colore", value: label }, { label: "Materiale", value: "Plastica stampata in 3D" }, { label: "Nota", value: "Trottole non incluse" }],
    features: [{ title: "Un deck completo", description: "Tre scomparti, uno per ogni trottola" }, { title: "Anche Expanded e Infinity", description: "Compatibile con i bey Expanded e Infinity" }, { title: "Chiusura a clip", description: "Ogni scomparto si chiude con la sua clip" }, { title: "Sette colori", description: "Giallo, verde lime, azzurro, blu, rosa, fucsia e bianco" }],
    boxContents: [`1 × Porta Deck ${label} (trottole non incluse)`],
    relatedSlugs: ["hurricane-enlil-is-7-55t", "tread-croc-tq-5-50gn", "cobalt-drake-4-60f"],
    variant: { family: "porta-deck", familyName: DECK_CASE.name, label, swatch },
    unofficial: true,
  };
}

export const CATEGORIES: readonly Category[] = [
  { slug: "beyblade-x", name: "Beyblade X", tagline: "Scatena la tua energia. Domina lo stadio.", description: "Tutta la collezione di trottole Beyblade X: attacco, difesa, stamina e bilanciate, pronte per ogni scontro." },
  { slug: "lanciatori", name: "Lanciatori", tagline: "Potenza e controllo nelle tue mani.", description: "Lanciatori a corda e accessori di lancio per colpi precisi e ripetibili." },
  { slug: "stadi", name: "Stadi", tagline: "Arene per battaglie epiche.", description: "Stadi e set arena ufficiali Beyblade X, studiati per urti estremi e KO spettacolari." },
  { slug: "accessori", name: "Accessori", tagline: "Personalizza. Migliora. Vinci.", description: "Attrezzi, custodie e ricambi per tenere il tuo arsenale sempre pronto." },
];

export const PRODUCTS: readonly Product[] = [
  {
    slug: "sword-dran-3-60f", name: "Sword Dran 3-60F", tagline: "Tre lame che colpiscono dal basso.",
    description: "Sword Dran 3-60F è la trottola che ha aperto la linea BX: la blade a tre lati porta tre lame inclinate verso l'alto attorno al chip del drago, il Ratchet 3-60 la tiene bassa a 6,0 mm e il Bit F (Flat), a punta piatta, la lancia lungo il bordo fino ad agganciare l'Xtreme Line e scatenare l'Xtreme Dash. Velocissima, ma la punta piatta consuma stamina in fretta. Lo starter include il lanciatore. Richiede un Beystadium Beyblade X (venduto separatamente).",
    price: eur(1290), category: "beyblade-x", stock: "disponibile", availableQuantity: 26, tags: [], rating: 0, reviewCount: 0,
    images: productImages["sword-dran-3-60f"],
    specs: [{ label: "Produttore", value: "Hasbro (prodotto originale)" }, { label: "Sistema", value: "Beyblade X" }, { label: "Linea", value: "BX (Basic Line)" }, { label: "Codice", value: "3-60F" }, { label: "Componenti", value: "1 trottola, 1 lanciatore con ripcord" }, { label: "Nota", value: "Richiede un Beystadium (venduto a parte)" }],
    features: [{ title: "Bit Flat", description: "Punta piatta: corre sul bordo e aggancia l'Xtreme Line" }, { title: "Ratchet 3-60", description: "Assetto basso a 6,0 mm" }, { title: "Tre lame in salita", description: "Colpiscono l'avversario dal basso verso l'alto" }, { title: "Starter completo", description: "Trottola e lanciatore con ripcord inclusi" }],
    boxContents: ["1 × Trottola Sword Dran 3-60F", "1 × Lanciatore con ripcord", "Manuale"],
    relatedSlugs: ["helm-knight-3-80n", "courage-dran-s-6-60v", "scythe-incendio-4-60t"],
  },
  {
    slug: "helm-knight-3-80n", name: "Helm Knight 3-80N", tagline: "Sei punti che incassano l'urto.",
    description: "Helm Knight 3-80N è una trottola della linea BX: la blade rotonda distribuisce l'urto su sei punti di contatto attorno al chip del cavaliere, invece di concentrarlo su una lama sola. Il Ratchet 3-80 la porta a 8,0 mm e il Bit N (Needle), a punta conica aguzza, la inchioda al centro dello stadio, dove l'attacco avversario perde efficacia. Lo starter include il lanciatore. Richiede un Beystadium Beyblade X (venduto separatamente).",
    price: eur(1290), category: "beyblade-x", stock: "disponibile", availableQuantity: 26, tags: [], rating: 0, reviewCount: 0,
    images: productImages["helm-knight-3-80n"],
    specs: [{ label: "Produttore", value: "Hasbro (prodotto originale)" }, { label: "Sistema", value: "Beyblade X" }, { label: "Linea", value: "BX (Basic Line)" }, { label: "Codice", value: "3-80N" }, { label: "Componenti", value: "1 trottola, 1 lanciatore con ripcord" }, { label: "Nota", value: "Richiede un Beystadium (venduto a parte)" }],
    features: [{ title: "Bit Needle", description: "Punta aguzza: resta ferma al centro dello stadio" }, { title: "Sei punti di contatto", description: "L'urto si distribuisce invece di concentrarsi" }, { title: "Ratchet 3-80", description: "Assetto alto a 8,0 mm" }, { title: "Starter completo", description: "Trottola e lanciatore con ripcord inclusi" }],
    boxContents: ["1 × Trottola Helm Knight 3-80N", "1 × Lanciatore con ripcord", "Manuale"],
    relatedSlugs: ["arrow-wizard-4-80b", "dark-perseus-b-6-80w", "sword-dran-3-60f"],
  },
  {
    slug: "arrow-wizard-4-80b", name: "Arrow Wizard 4-80B", tagline: "Punta a sfera. Gira e non si ferma.",
    description: "Arrow Wizard 4-80B è una trottola della linea BX: la blade rotonda attorno al chip del mago spinge il peso verso l'esterno, così la rotazione si mantiene a lungo. Il Ratchet 4-80 la tiene alta a 8,0 mm e il Bit B (Ball), una punta a sfera liscia, riduce l'attrito e le fa descrivere cerchi larghi e controllati invece di sbandare. Lo starter include il lanciatore. Richiede un Beystadium Beyblade X (venduto separatamente).",
    price: eur(1290), category: "beyblade-x", stock: "disponibile", availableQuantity: 26, tags: [], rating: 0, reviewCount: 0,
    images: productImages["arrow-wizard-4-80b"],
    specs: [{ label: "Produttore", value: "Hasbro (prodotto originale)" }, { label: "Sistema", value: "Beyblade X" }, { label: "Linea", value: "BX (Basic Line)" }, { label: "Codice", value: "4-80B" }, { label: "Componenti", value: "1 trottola, 1 lanciatore con ripcord" }, { label: "Nota", value: "Richiede un Beystadium (venduto a parte)" }],
    features: [{ title: "Bit Ball", description: "Punta a sfera: poco attrito, rotazione che dura" }, { title: "Peso sul bordo", description: "La forza centrifuga mantiene la rotazione" }, { title: "Ratchet 4-80", description: "Assetto alto a 8,0 mm" }, { title: "Starter completo", description: "Trottola e lanciatore con ripcord inclusi" }],
    boxContents: ["1 × Trottola Arrow Wizard 4-80B", "1 × Lanciatore con ripcord", "Manuale"],
    relatedSlugs: ["arc-wizard-r-4-55lo", "helm-knight-3-80n", "scythe-incendio-4-60t"],
  },
  {
    slug: "scythe-incendio-4-60t", name: "Scythe Incendio 4-60T", tagline: "Quattro lame che respingono.",
    description: "Scythe Incendio 4-60T è una trottola della linea BX: la blade rotonda monta quattro lame attorno al chip del teschio infuocato e restituisce molto rinculo a chi la colpisce. Il Ratchet 4-60 la tiene bassa a 6,0 mm e il Bit T (Taper), una punta piatta e stretta con lo spigolo rialzato, le dà un secondo punto d'appoggio: si muove come una Flat ma conserva più stamina. Lo starter include il lanciatore. Richiede un Beystadium Beyblade X (venduto separatamente).",
    price: eur(1290), category: "beyblade-x", stock: "disponibile", availableQuantity: 26, tags: [], rating: 0, reviewCount: 0,
    images: productImages["scythe-incendio-4-60t"],
    specs: [{ label: "Produttore", value: "Hasbro (prodotto originale)" }, { label: "Sistema", value: "Beyblade X" }, { label: "Linea", value: "BX (Basic Line)" }, { label: "Codice", value: "4-60T" }, { label: "Componenti", value: "1 trottola, 1 lanciatore con ripcord" }, { label: "Nota", value: "Richiede un Beystadium (venduto a parte)" }],
    features: [{ title: "Bit Taper", description: "Punta stretta con spigolo rialzato: mobile ma più resistente di una Flat" }, { title: "Quattro lame", description: "Molto rinculo su chi la colpisce" }, { title: "Ratchet 4-60", description: "Assetto basso a 6,0 mm" }, { title: "Starter completo", description: "Trottola e lanciatore con ripcord inclusi" }],
    boxContents: ["1 × Trottola Scythe Incendio 4-60T", "1 × Lanciatore con ripcord", "Manuale"],
    relatedSlugs: ["reaper-incendio-t-4-70k", "sword-dran-3-60f", "arrow-wizard-4-80b"],
  },
  {
    slug: "courage-dran-s-6-60v", name: "Courage Dran S 6-60V", tagline: "Tre lame lisce per l'Upper Attack.",
    description: "Courage Dran S 6-60V è una trottola della linea CX, dove la blade si scompone in lock chip, main blade e assist blade. La main blade Brave porta tre lame lisce inclinate che sollevano l'avversario con un Upper Attack, sostenute dall'assist blade Slash. Il Ratchet 6-60 la tiene bassa a 6,0 mm e il Bit V (Vortex), una punta piatta con spirali rivolte a destra, la rende rapida e aggressiva. Lo starter include il lanciatore. Richiede un Beystadium Beyblade X (venduto separatamente).",
    price: eur(1290), category: "beyblade-x", stock: "disponibile", availableQuantity: 26, tags: [], rating: 0, reviewCount: 0,
    images: productImages["courage-dran-s-6-60v"],
    specs: [{ label: "Produttore", value: "Hasbro (prodotto originale)" }, { label: "Sistema", value: "Beyblade X" }, { label: "Linea", value: "CX (Custom Line)" }, { label: "Codice", value: "6-60V" }, { label: "Componenti", value: "1 trottola, 1 lanciatore con ripcord" }, { label: "Nota", value: "Richiede un Beystadium (venduto a parte)" }],
    features: [{ title: "Bit Vortex", description: "Punta piatta a spirale: rapida e aggressiva" }, { title: "Blade in tre pezzi", description: "Lock chip, main blade Brave e assist blade Slash" }, { title: "Upper Attack", description: "Le tre lame inclinate sollevano l'avversario" }, { title: "Starter completo", description: "Trottola e lanciatore con ripcord inclusi" }],
    boxContents: ["1 × Trottola Courage Dran S 6-60V", "1 × Lanciatore con ripcord", "Manuale"],
    relatedSlugs: ["reaper-incendio-t-4-70k", "sword-dran-3-60f", "arc-wizard-r-4-55lo"],
  },
  {
    slug: "reaper-incendio-t-4-70k", name: "Reaper Incendio T 4-70K", tagline: "Due assetti in una trottola.",
    description: "Reaper Incendio T 4-70K è una trottola della linea CX e cambia carattere a seconda di come la monti: l'assist blade Turn è in due pezzi e il suo anello esterno si ribalta, con le punte in alto per un assetto d'attacco a colpi rapidi, oppure in basso per deviare gli urti e durare. Sopra, quattro lame sottili attorno al chip del teschio; sotto, il Ratchet 4-70 a 7,0 mm e il Bit K (Kick), una punta piatta a superficie esagonale che attacca sul lancio e poi si stabilizza. Il Kick è tra i bit più visti ai tavoli dei tornei. Lo starter include il lanciatore. Richiede un Beystadium Beyblade X (venduto separatamente).",
    price: eur(1690), category: "beyblade-x", stock: "disponibile", availableQuantity: 26, tags: [], rating: 0, reviewCount: 0,
    images: productImages["reaper-incendio-t-4-70k"],
    specs: [{ label: "Produttore", value: "Hasbro (prodotto originale)" }, { label: "Sistema", value: "Beyblade X" }, { label: "Linea", value: "CX (Custom Line)" }, { label: "Codice", value: "4-70K" }, { label: "Componenti", value: "1 trottola, 1 lanciatore con ripcord" }, { label: "Nota", value: "Richiede un Beystadium (venduto a parte)" }],
    features: [{ title: "Bit Kick", description: "Attacca sul lancio, poi si stabilizza: molto usato nei tornei" }, { title: "Assist blade Turn", description: "Si ribalta: assetto d'attacco o di resistenza" }, { title: "Ratchet 4-70", description: "Assetto medio a 7,0 mm" }, { title: "Starter completo", description: "Trottola e lanciatore con ripcord inclusi" }],
    boxContents: ["1 × Trottola Reaper Incendio T 4-70K", "1 × Lanciatore con ripcord", "Manuale"],
    relatedSlugs: ["courage-dran-s-6-60v", "scythe-incendio-4-60t", "dark-perseus-b-6-80w"],
  },
  {
    slug: "arc-wizard-r-4-55lo", name: "Arc Wizard R 4-55LO", tagline: "L'assetto più basso della serie.",
    description: "Arc Wizard R 4-55LO è una trottola della linea CX: la main blade Arc sfrutta la forza centrifuga e l'assist blade Round le fa da supporto aerodinamico. Il Ratchet 4-55 è il più basso del gruppo, 5,5 mm, e il Bit LO (Low Orb) monta una sfera piccola, circa un millimetro sotto una Ball normale: si sposta poco e resta piantata al centro, dove consuma meno rotazione. Lo starter include il lanciatore. Richiede un Beystadium Beyblade X (venduto separatamente).",
    price: eur(1290), category: "beyblade-x", stock: "disponibile", availableQuantity: 26, tags: [], rating: 0, reviewCount: 0,
    images: productImages["arc-wizard-r-4-55lo"],
    specs: [{ label: "Produttore", value: "Hasbro (prodotto originale)" }, { label: "Sistema", value: "Beyblade X" }, { label: "Linea", value: "CX (Custom Line)" }, { label: "Codice", value: "4-55LO" }, { label: "Componenti", value: "1 trottola, 1 lanciatore con ripcord" }, { label: "Nota", value: "Richiede un Beystadium (venduto a parte)" }],
    features: [{ title: "Bit Low Orb", description: "Sfera bassa: si muove poco e tiene il centro" }, { title: "Blade in tre pezzi", description: "Lock chip, main blade Arc e assist blade Round" }, { title: "Ratchet 4-55", description: "L'assetto più basso della serie, 5,5 mm" }, { title: "Starter completo", description: "Trottola e lanciatore con ripcord inclusi" }],
    boxContents: ["1 × Trottola Arc Wizard R 4-55LO", "1 × Lanciatore con ripcord", "Manuale"],
    relatedSlugs: ["arrow-wizard-4-80b", "dark-perseus-b-6-80w", "courage-dran-s-6-60v"],
  },
  {
    slug: "dark-perseus-b-6-80w", name: "Dark Perseus B 6-80W", tagline: "Assorbe l'urto e resta in piedi.",
    description: "Dark Perseus B 6-80W è una trottola della linea CX: la blade a onde smorza i colpi e l'assist blade Bumper ne assorbe l'urto invece di rimbalzare. Il Ratchet 6-80 la porta a 8,0 mm e il Bit W (Wedge) è una punta conica bassa e sottile con dieci denti anziché dodici: l'Xtreme Dash è meno esplosivo, ma consuma meno rotazione. Lo starter include il lanciatore. Richiede un Beystadium Beyblade X (venduto separatamente).",
    price: eur(1290), category: "beyblade-x", stock: "disponibile", availableQuantity: 26, tags: [], rating: 0, reviewCount: 0,
    images: productImages["dark-perseus-b-6-80w"],
    specs: [{ label: "Produttore", value: "Hasbro (prodotto originale)" }, { label: "Sistema", value: "Beyblade X" }, { label: "Linea", value: "CX (Custom Line)" }, { label: "Codice", value: "6-80W" }, { label: "Componenti", value: "1 trottola, 1 lanciatore con ripcord" }, { label: "Nota", value: "Richiede un Beystadium (venduto a parte)" }],
    features: [{ title: "Bit Wedge", description: "Punta conica bassa: dash meno esplosivo, meno stamina persa" }, { title: "Blade a onde", description: "Smorza i colpi invece di rimbalzare" }, { title: "Assist blade Bumper", description: "Assorbe l'urto dell'impatto" }, { title: "Starter completo", description: "Trottola e lanciatore con ripcord inclusi" }],
    boxContents: ["1 × Trottola Dark Perseus B 6-80W", "1 × Lanciatore con ripcord", "Manuale"],
    relatedSlugs: ["helm-knight-3-80n", "arc-wizard-r-4-55lo", "reaper-incendio-t-4-70k"],
  },
  {
    slug: "cobalt-drake-4-60f", name: "Cobalt Drake 4-60F", tagline: "Attacco BX. Lame di cristallo.",
    description: "Cobalt Drake 4-60F è una trottola d'attacco della linea BX: la blade trasparente dal profilo affilato concentra il peso sulle punte, il Ratchet 4-60 tiene l'assetto basso e il Bit F (Flat) la lancia in traiettorie rapide e aggressive lungo il bordo dello stadio. Richiede lanciatore e Beystadium Beyblade X (venduti separatamente).",
    price: eur(2000), category: "beyblade-x", bladeType: "attacco", stock: "pre-ordine", releasePreorder: true, availableQuantity: 9, tags: ["novita"], rating: 0, reviewCount: 0,
    images: productImages["cobalt-drake-4-60f"],
    specs: [{ label: "Tipo", value: "Attacco" }, { label: "Produttore", value: "Hasbro (prodotto originale)" }, { label: "Sistema", value: "Beyblade X" }, { label: "Linea", value: "BX (Basic Line)" }, { label: "Codice", value: "4-60F" }, { label: "Componenti", value: "1 trottola" }, { label: "Nota", value: "Richiede lanciatore e Beystadium (venduti a parte)" }],
    features: [{ title: "Bit Flat", description: "Punta piatta per movimenti rapidi e aggressivi" }, { title: "Ratchet 4-60", description: "Assetto basso, pensato per l'attacco" }, { title: "Blade trasparente", description: "Profilo affilato con il peso sulle punte" }, { title: "Compatibile Beyblade X", description: "Blade, Ratchet e Bit intercambiabili con la serie" }],
    boxContents: ["1 × Trottola Cobalt Drake 4-60F", "Manuale"],
    relatedSlugs: ["strike-dran-4-50ff", "tread-croc-tq-5-50gn", "mirage-clock-9-65b"],
  },
  {
    slug: "mirage-clock-9-65b", name: "Mirage Clock 9-65B", tagline: "Stamina UX. Gira finché l'altro si ferma.",
    description: "Mirage Clock 9-65B è una trottola stamina della linea UX: la blade rotonda con corona dentata distribuisce il peso sul bordo per restare in piedi a lungo, il Ratchet 9-65 alza l'assetto e il Bit B (Ball) riduce l'attrito sulla punta. Richiede lanciatore e Beystadium Beyblade X (venduti separatamente).",
    price: eur(1950), category: "beyblade-x", bladeType: "stamina", stock: "pre-ordine", releasePreorder: true, availableQuantity: 9, tags: ["novita"], rating: 0, reviewCount: 0,
    images: productImages["mirage-clock-9-65b"],
    specs: [{ label: "Tipo", value: "Stamina" }, { label: "Produttore", value: "Hasbro (prodotto originale)" }, { label: "Sistema", value: "Beyblade X" }, { label: "Linea", value: "UX (Unique Line)" }, { label: "Codice", value: "9-65B" }, { label: "Componenti", value: "1 trottola" }, { label: "Nota", value: "Richiede lanciatore e Beystadium (venduti a parte)" }],
    features: [{ title: "Bit Ball", description: "Punta sferica: poco attrito, tanta resistenza" }, { title: "Peso sul bordo", description: "La corona dentata tiene la rotazione stabile" }, { title: "Linea UX", description: "Blade dal profilo esclusivo della Unique Line" }, { title: "Compatibile Beyblade X", description: "Blade, Ratchet e Bit intercambiabili con la serie" }],
    boxContents: ["1 × Trottola Mirage Clock 9-65B", "Manuale"],
    relatedSlugs: ["suppress-superion-0-70lp", "cobalt-drake-4-60f", "shatter-horus-9-65gb"],
  },
  {
    slug: "suppress-superion-0-70lp", name: "Suppress Superion 0-70LP", tagline: "Bilanciata BX. Tiene il centro.",
    description: "Suppress Superion 0-70LP è una trottola bilanciata della linea BX: la blade con il leone dorato unisce massa e superfici di contatto larghe per assorbire gli urti, mentre il Ratchet 0-70 e il Bit LP (Low Point) la tengono alta sul centro dello stadio, dove l'attacco avversario perde efficacia. Lo starter include il lanciatore. Richiede un Beystadium Beyblade X (venduto separatamente).",
    price: eur(2500), category: "beyblade-x", bladeType: "bilanciato", stock: "pre-ordine", releasePreorder: true, availableQuantity: 5, tags: ["novita"], rating: 0, reviewCount: 0,
    images: productImages["suppress-superion-0-70lp"],
    specs: [{ label: "Tipo", value: "Bilanciata" }, { label: "Produttore", value: "Hasbro (prodotto originale)" }, { label: "Sistema", value: "Beyblade X" }, { label: "Linea", value: "BX (Basic Line)" }, { label: "Codice", value: "0-70LP" }, { label: "Componenti", value: "1 trottola, 1 lanciatore" }, { label: "Nota", value: "Richiede un Beystadium (venduto a parte)" }],
    features: [{ title: "Bit Low Point", description: "Punta bassa che difende il centro dello stadio" }, { title: "Ratchet 0-70", description: "Profilo alto per incassare gli urti" }, { title: "Starter completo", description: "Include il lanciatore" }, { title: "Compatibile Beyblade X", description: "Blade, Ratchet e Bit intercambiabili con la serie" }],
    boxContents: ["1 × Trottola Suppress Superion 0-70LP", "1 × Lanciatore con ripcord", "Manuale"],
    relatedSlugs: ["strike-dran-4-50ff", "mirage-clock-9-65b", "tread-croc-tq-5-50gn"],
  },
  {
    slug: "strike-dran-4-50ff", name: "Strike Dran 4-50FF", tagline: "Attacco BX. Blade interna in metallo.",
    description: "Strike Dran 4-50FF è una trottola d'attacco della linea BX: la blade monta una lama interna in metallo che porta la massa verso il centro, il Ratchet 4-50 la tiene bassa e il Bit FF (Flat Force) la spinge in corse veloci sul bordo, pronte a colpire di taglio. Lo starter include il lanciatore. Richiede un Beystadium Beyblade X (venduto separatamente).",
    price: eur(2300), category: "beyblade-x", bladeType: "attacco", stock: "pre-ordine", releasePreorder: true, availableQuantity: 9, tags: ["novita"], rating: 0, reviewCount: 0,
    images: productImages["strike-dran-4-50ff"],
    specs: [{ label: "Tipo", value: "Attacco" }, { label: "Produttore", value: "Hasbro (prodotto originale)" }, { label: "Sistema", value: "Beyblade X" }, { label: "Linea", value: "BX (Basic Line)" }, { label: "Codice", value: "4-50FF" }, { label: "Componenti", value: "1 trottola, 1 lanciatore" }, { label: "Nota", value: "Richiede un Beystadium (venduto a parte)" }],
    features: [{ title: "Lama interna in metallo", description: "Massa concentrata al centro della blade" }, { title: "Bit Flat Force", description: "Corse rapide sul bordo per colpire di taglio" }, { title: "Starter completo", description: "Include il lanciatore" }, { title: "Compatibile Beyblade X", description: "Blade, Ratchet e Bit intercambiabili con la serie" }],
    boxContents: ["1 × Trottola Strike Dran 4-50FF", "1 × Lanciatore con ripcord", "Manuale"],
    relatedSlugs: ["cobalt-drake-4-60f", "suppress-superion-0-70lp", "tread-croc-tq-5-50gn"],
  },
  {
    slug: "tread-croc-tq-5-50gn", name: "Tread Croc TQ 5-50GN", tagline: "Attacco CX. Quattro pezzi da combinare.",
    description: "Tread Croc TQ 5-50GN è una trottola d'attacco della linea CX: la blade si scompone in quattro pezzi — lock chip, main blade, assist blade e il resto dell'assetto — per costruire combinazioni su misura, con Ratchet 5-50 e Bit GN. Lo starter include il lanciatore. Richiede un Beystadium Beyblade X (venduto separatamente).",
    price: eur(2500), category: "beyblade-x", bladeType: "attacco", stock: "pre-ordine", releasePreorder: true, availableQuantity: 9, tags: ["novita"], rating: 0, reviewCount: 0,
    images: productImages["tread-croc-tq-5-50gn"],
    specs: [{ label: "Tipo", value: "Attacco" }, { label: "Produttore", value: "Hasbro (prodotto originale)" }, { label: "Sistema", value: "Beyblade X" }, { label: "Linea", value: "CX (Custom Line)" }, { label: "Codice", value: "TQ 5-50GN" }, { label: "Componenti", value: "1 trottola, 1 lanciatore" }, { label: "Nota", value: "Richiede un Beystadium (venduto a parte)" }],
    features: [{ title: "Blade in quattro pezzi", description: "Lock chip e blade scomponibili per assetti su misura" }, { title: "Linea CX", description: "Combina i pezzi con le altre trottole Custom Line" }, { title: "Starter completo", description: "Include il lanciatore" }, { title: "Compatibile Beyblade X", description: "Blade, Ratchet e Bit intercambiabili con la serie" }],
    boxContents: ["1 × Trottola Tread Croc TQ 5-50GN", "1 × Lanciatore con ripcord", "Manuale"],
    relatedSlugs: ["hurricane-enlil-is-7-55t", "strike-dran-4-50ff", "cobalt-drake-4-60f"],
  },
  {
    slug: "glory-valkerion-lf", name: "Glory Valkerion LF", tagline: "Attacco UX. Blade e ratchet in un pezzo.",
    description: "Glory Valkerion LF è una trottola d'attacco a rotazione destra della linea UX: la blade integra il ratchet in un unico pezzo e il Bit Low Flat (LF), a punta piatta e bassa, la spinge in movimenti rapidi e aggressivi per agganciare l'Xtreme Line e scatenare l'Xtreme Dash. Lo starter include il lanciatore. Richiede un Beystadium Beyblade X (venduto separatamente).",
    price: eur(3000), category: "beyblade-x", bladeType: "attacco", stock: "pre-ordine", tags: [], rating: 0, reviewCount: 0,
    images: productImages["glory-valkerion-lf"],
    specs: [{ label: "Tipo", value: "Attacco" }, { label: "Produttore", value: "Hasbro (prodotto originale)" }, { label: "Sistema", value: "Beyblade X" }, { label: "Linea", value: "UX (Infinity Starter Pack)" }, { label: "Codice", value: "LF" }, { label: "Componenti", value: "1 trottola, 1 lanciatore" }],
    features: [{ title: "Ratchet integrato", description: "Blade e ratchet stampati in un unico pezzo" }, { title: "Bit Low Flat", description: "Punta piatta e bassa per un attacco rapido" }, { title: "Xtreme Dash", description: "Aggancia l'Xtreme Line dello stadio e accelera" }, { title: "Starter completo", description: "Include il lanciatore" }],
    boxContents: ["1 × Trottola Glory Valkerion LF", "1 × Lanciatore con ripcord", "Manuale"],
    relatedSlugs: ["cobalt-dragoon-2-60c", "soar-phoenix-9-60gf", "blast-pegasus-a-tr"],
  },
  {
    slug: "hurricane-enlil-is-7-55t", name: "Hurricane Enlil IS 7-55T", tagline: "Bilanciata CX. Blade Infinity scomponibile.",
    description: "Hurricane Enlil IS 7-55T è una trottola bilanciata a rotazione destra della linea CX: la blade Infinity si scompone in lock chip, over blade, blade metallica e assist blade per costruire l'assetto su misura, con Ratchet 7-55 e Bit T. Lo starter include il lanciatore. Richiede un Beystadium Beyblade X (venduto separatamente).",
    price: eur(1800), category: "beyblade-x", bladeType: "bilanciato", stock: "disponibile", availableQuantity: 10, tags: [], rating: 0, reviewCount: 0,
    images: productImages["hurricane-enlil-is-7-55t"],
    specs: [{ label: "Tipo", value: "Bilanciata" }, { label: "Produttore", value: "Hasbro (prodotto originale)" }, { label: "Sistema", value: "Beyblade X" }, { label: "Linea", value: "CX (Infinity Starter Pack)" }, { label: "Codice", value: "IS 7-55T" }, { label: "Componenti", value: "1 trottola, 1 lanciatore" }],
    features: [{ title: "Blade Infinity scomponibile", description: "Lock chip, over blade, blade metallica e assist blade" }, { title: "Assetto bilanciato", description: "Equilibrio tra attacco, difesa e resistenza" }, { title: "Starter completo", description: "Include il lanciatore" }, { title: "Compatibile Beyblade X", description: "Blade, Ratchet e Bit intercambiabili con la serie" }],
    boxContents: ["1 × Trottola Hurricane Enlil IS 7-55T", "1 × Lanciatore con ripcord", "Manuale"],
    relatedSlugs: ["shatter-horus-9-65gb", "glory-valkerion-lf", "blast-pegasus-a-tr"],
  },
  {
    slug: "shatter-horus-9-65gb", name: "Shatter Horus 9-65GB", tagline: "Stamina BX. Metallo oltre i ganci.",
    description: "Shatter Horus 9-65GB è una trottola stamina della linea BX: la blade dalla forma rotonda estende il metallo oltre i ganci del lanciatore e riveste di metallo anche il bordo del gear chip, che raffigura il dio egizio Horus. Monta il Ratchet 9-65 e il Bit GB. Lo starter include il lanciatore. Richiede un Beystadium Beyblade X (venduto separatamente).",
    price: eur(1800), category: "beyblade-x", bladeType: "stamina", stock: "disponibile", availableQuantity: 8, tags: [], rating: 0, reviewCount: 0,
    images: productImages["shatter-horus-9-65gb"],
    specs: [{ label: "Tipo", value: "Stamina" }, { label: "Produttore", value: "Hasbro (prodotto originale)" }, { label: "Sistema", value: "Beyblade X" }, { label: "Linea", value: "BX (Infinity Starter Pack)" }, { label: "Codice", value: "9-65GB" }, { label: "Componenti", value: "1 trottola, 1 lanciatore" }],
    features: [{ title: "Metallo esteso", description: "Il metallo supera i ganci del lanciatore" }, { title: "Forma rotonda", description: "Profilo tondo pensato per la resistenza" }, { title: "Starter completo", description: "Include il lanciatore" }, { title: "Compatibile Beyblade X", description: "Blade, Ratchet e Bit intercambiabili con la serie" }],
    boxContents: ["1 × Trottola Shatter Horus 9-65GB", "1 × Lanciatore con ripcord", "Manuale"],
    relatedSlugs: ["hurricane-enlil-is-7-55t", "glory-valkerion-lf", "saber-samurai-2-70l"],
  },
  {
    slug: "cobalt-dragoon-2-60c", name: "Cobalt Dragoon 2-60C", tagline: "Attacco left-spin. Smash devastante.",
    description: "Cobalt Dragoon 2-60C è una trottola d'attacco a rotazione sinistra (left-spin): quattro lame inclinate verso l'alto concentrano uno Smash Attack estremo, mentre il Ratchet 2-60 e il Bit Cyclone bilanciano velocità e stabilità. Lo starter include il lanciatore a corda left-spin dedicato.",
    price: eur(2550), category: "beyblade-x", bladeType: "attacco", stock: "pre-ordine", tags: [], rating: 0, reviewCount: 0,
    images: productImages["cobalt-dragoon-2-60c"],
    specs: [{ label: "Tipo", value: "Attacco (left-spin)" }, { label: "Produttore", value: "Hasbro (prodotto originale)" }, { label: "Sistema", value: "Beyblade X" }, { label: "Codice", value: "2-60C" }, { label: "Componenti", value: "1 trottola, 1 lanciatore a corda" }, { label: "Materiale", value: "Plastica e metallo" }],
    features: [{ title: "Rotazione sinistra", description: "Left-spin che spiazza gli assetti a rotazione destra" }, { title: "Smash estremo", description: "Quattro lame inclinate per KO potenti" }, { title: "Starter completo", description: "Include il lanciatore a corda dedicato" }, { title: "Compatibile Beyblade X", description: "Blade, Ratchet e Bit intercambiabili con la serie" }],
    boxContents: ["1 × Trottola Cobalt Dragoon 2-60C", "1 × Lanciatore a corda left-spin", "Manuale"],
    relatedSlugs: ["blast-pegasus-a-tr", "soar-phoenix-9-60gf", "saber-samurai-2-70l"],
  },
  {
    slug: "soar-phoenix-9-60gf", name: "Soar Phoenix 9-60GF", tagline: "Upper attack. Colpisci verso l'alto.",
    description: "Soar Phoenix 9-60GF è una trottola d'attacco a tre lame che salgono verso l'alto per un Upper Attack capace di sollevare l'avversario, unito allo Smash che lo spinge fuori arena. Tra le blade più pesanti della serie. Lo starter include il lanciatore a corda.",
    price: eur(3200), category: "beyblade-x", bladeType: "attacco", stock: "pre-ordine", tags: [], rating: 0, reviewCount: 0,
    images: productImages["soar-phoenix-9-60gf"],
    specs: [{ label: "Tipo", value: "Attacco" }, { label: "Produttore", value: "Hasbro (prodotto originale)" }, { label: "Sistema", value: "Beyblade X" }, { label: "Codice", value: "9-60GF" }, { label: "Componenti", value: "1 trottola, 1 lanciatore a corda" }, { label: "Materiale", value: "Plastica e metallo" }],
    features: [{ title: "Upper Attack", description: "Le tre lame sollevano l'avversario da terra" }, { title: "Peso elevato", description: "Massa che domina i confronti d'attacco" }, { title: "Starter completo", description: "Include il lanciatore a corda" }, { title: "Compatibile Beyblade X", description: "Blade, Ratchet e Bit intercambiabili con la serie" }],
    boxContents: ["1 × Trottola Soar Phoenix 9-60GF", "1 × Lanciatore a corda", "Manuale"],
    relatedSlugs: ["cobalt-dragoon-2-60c", "blast-pegasus-a-tr", "saber-samurai-2-70l"],
  },
  {
    slug: "saber-samurai-2-70l", name: "Saber Samurai 2-70L", tagline: "Doppia lama. Colpi da katana.",
    description: "Saber Samurai 2-70L (linea UX) è una trottola d'attacco: le due protuberanze si ritraggono a metà battaglia, passando da colpi ripetuti in stile katana a un singolo impatto \"tachi\" per KO improvvisi. Lo starter include il lanciatore con impugnatura (grip).",
    price: eur(2590), category: "beyblade-x", bladeType: "attacco", stock: "disponibile", availableQuantity: 16, tags: [], rating: 0, reviewCount: 0,
    images: productImages["saber-samurai-2-70l"],
    specs: [{ label: "Tipo", value: "Attacco" }, { label: "Produttore", value: "Hasbro (prodotto originale)" }, { label: "Sistema", value: "Beyblade X" }, { label: "Linea", value: "UX (UX-09)" }, { label: "Codice", value: "2-70L" }, { label: "Componenti", value: "1 trottola, 1 lanciatore con impugnatura" }],
    features: [{ title: "Gimmick a doppia modalità", description: "Da colpi ripetuti a singolo impatto tachi" }, { title: "Linea UX", description: "Meccanica esclusiva della Unique Line" }, { title: "Lanciatore grip incluso", description: "Impugnatura per lanci potenti e stabili" }, { title: "Compatibile Beyblade X", description: "Blade, Ratchet e Bit intercambiabili con la serie" }],
    boxContents: ["1 × Trottola Saber Samurai 2-70L", "1 × Lanciatore con impugnatura", "1 × Winder", "Manuale"],
    relatedSlugs: ["cobalt-dragoon-2-60c", "soar-phoenix-9-60gf", "blast-pegasus-a-tr"],
  },
  {
    slug: "blast-pegasus-a-tr", name: "Blast Pegasus A Tr", tagline: "Attacco portatile. Clip & Rip Launcher.",
    description: "Blast Pegasus A Tr è una trottola d'attacco a rotazione destra della linea CX, venduta con il Clip & Rip Launcher: un lanciatore portatile che si aggancia a cintura e zaino e ripone il ripcord all'interno. Richiede un Beystadium Beyblade X (venduto separatamente).",
    price: eur(2690), category: "beyblade-x", bladeType: "attacco", stock: "disponibile", availableQuantity: 56, tags: [], rating: 0, reviewCount: 0,
    images: productImages["blast-pegasus-a-tr"],
    specs: [{ label: "Tipo", value: "Attacco" }, { label: "Produttore", value: "Hasbro (prodotto originale)" }, { label: "Sistema", value: "Beyblade X" }, { label: "Linea", value: "CX" }, { label: "Componenti", value: "1 trottola, 1 Clip & Rip Launcher" }, { label: "Nota", value: "Richiede un Beystadium (venduto a parte)" }],
    features: [{ title: "Clip & Rip Launcher", description: "Lanciatore portatile: si aggancia e riponi il ripcord" }, { title: "Linea CX", description: "Trottola d'attacco a rotazione destra" }, { title: "X-Celerator", description: "Accelera sull'X-Celerator Rail dello stadio" }, { title: "Compatibile Beyblade X", description: "Blade, Ratchet e Bit intercambiabili con la serie" }],
    boxContents: ["1 × Trottola Blast Pegasus A Tr", "1 × Clip & Rip Launcher", "1 × Ripcord", "Manuale"],
    relatedSlugs: ["cobalt-dragoon-2-60c", "soar-phoenix-9-60gf", "saber-samurai-2-70l"],
  },
  {
    slug: "drop-attack-battle-set", name: "Drop Attack Battle Set", tagline: "Stadio + 2 trottole + 2 lanciatori.",
    description: "Il Drop Attack Battle Set include tutto per giocare: il Beystadium con X-Celerator Rail rialzato che porta le trottole in alto per farle piombare sull'avversario, due trottole (Impact Drake 9-60LR d'attacco e Hover Wyvern 3-85N di difesa) e due lanciatori a corda.",
    price: eur(3990), category: "stadi", stock: "disponibile", availableQuantity: 102, tags: [], rating: 0, reviewCount: 0,
    images: productImages["drop-attack-battle-set"],
    specs: [{ label: "Tipo", value: "Kit arena" }, { label: "Produttore", value: "Hasbro (prodotto originale)" }, { label: "Sistema", value: "Beyblade X" }, { label: "Componenti", value: "1 stadio, 2 trottole, 2 lanciatori" }, { label: "Trottole incluse", value: "Impact Drake 9-60LR, Hover Wyvern 3-85N" }, { label: "Materiale", value: "Plastica e metallo" }],
    features: [{ title: "X-Celerator Rail rialzato", description: "Porta le trottole in alto per il Drop Attack" }, { title: "Set completo", description: "Stadio, due trottole e due lanciatori pronti al gioco" }, { title: "Impact Drake + Hover Wyvern", description: "Un assetto d'attacco e uno di difesa" }, { title: "Compatibile Beyblade X", description: "Usa tutte le trottole e parti della serie" }],
    boxContents: ["1 × Beystadium Drop Attack", "1 × Impact Drake 9-60LR", "1 × Hover Wyvern 3-85N", "2 × Lanciatori a corda", "Manuale di gioco"],
    relatedSlugs: ["sneak-attack-battle-set", "cobalt-dragoon-2-60c", "soar-phoenix-9-60gf"],
  },
  {
    slug: "sneak-attack-battle-set", name: "Sneak Attack Battle Set", tagline: "Stadio verde + 2 trottole + 2 lanciatori.",
    description: "Il Sneak Attack Battle Set mette in scatola tutto per il primo scontro: il Beystadium con rail a scomparsa che devia le trottole in una nuova direzione, due trottole (Rampart Aegis GB di stamina e Cutter Shinobi LF d'attacco) e due lanciatori a corda.",
    price: eur(4490), category: "stadi", stock: "disponibile", availableQuantity: 51, tags: [], rating: 0, reviewCount: 0,
    images: productImages["sneak-attack-battle-set"],
    specs: [{ label: "Tipo", value: "Kit arena" }, { label: "Produttore", value: "Hasbro (prodotto originale)" }, { label: "Sistema", value: "Beyblade X" }, { label: "Componenti", value: "1 stadio, 2 trottole, 2 lanciatori" }, { label: "Trottole incluse", value: "Rampart Aegis GB, Cutter Shinobi LF" }, { label: "Materiale", value: "Plastica e metallo" }],
    features: [{ title: "Rail a scomparsa", description: "Devia le trottole in una nuova direzione a sorpresa" }, { title: "Set completo", description: "Stadio, due trottole e due lanciatori pronti al gioco" }, { title: "Rampart Aegis + Cutter Shinobi", description: "Un assetto di stamina e uno d'attacco" }, { title: "Compatibile Beyblade X", description: "Usa tutte le trottole e parti della serie" }],
    boxContents: ["1 × Beystadium Sneak Attack", "1 × Rampart Aegis GB", "1 × Cutter Shinobi LF", "2 × Lanciatori a corda", "Manuale di gioco"],
    relatedSlugs: ["drop-attack-battle-set", "cobalt-dragoon-2-60c", "saber-samurai-2-70l"],
  },
  // One card in the shop, seven colours on the product page; the first colour leads the family.
  ...DECK_CASE.colours.map(deckCase),
];

/**
 * Bundles sold as a single item, with their own price and Stripe product. They are not rows of
 * the product database: a bundle has no stock of its own, and every sale takes its components'
 * pieces (see lib/commerce/bundles.ts and the Stripe order webhook). `availableQuantity` here is
 * only the fallback when live stock cannot be read.
 */
export const BUNDLES: readonly Product[] = [
  {
    slug: "kit-doppio-starter-deck", name: "Kit Doppio Starter", tagline: "Due starter e il porta deck. Pronti a sfidarsi.",
    description: "Due starter Beyblade X completi di lanciatore, Sword Dran 3-60F e Helm Knight 3-80N, con il porta deck giallo per portarli in giro. Sword Dran monta il Bit F a punta piatta e corre sul bordo dello stadio; Helm Knight distribuisce l'urto su sei punti di contatto e il Bit N la tiene piantata al centro: due modi opposti di stare in arena. Il porta deck tiene tre trottole, una per scomparto. Richiede un Beystadium Beyblade X (venduto separatamente).",
    price: eur(3990), compareAtPrice: eur(5030), category: "beyblade-x", stock: "disponibile", tags: ["offerta"], rating: 0, reviewCount: 0,
    images: productImages["kit-doppio-starter-deck"],
    specs: [{ label: "Contenuto", value: "2 starter, 2 lanciatori, 1 porta deck" }, { label: "Produttore", value: "Hasbro (prodotto originale)" }, { label: "Sistema", value: "Beyblade X" }, { label: "Trottole incluse", value: "Sword Dran 3-60F, Helm Knight 3-80N" }, { label: "Porta deck", value: "Giallo, 3 scomparti, non ufficiale" }, { label: "Nota", value: "Richiede un Beystadium (venduto a parte)" }],
    features: [{ title: "Due starter completi", description: "Ogni trottola ha il suo lanciatore con ripcord" }, { title: "Due assetti opposti", description: "Una corre sul bordo, l'altra tiene il centro" }, { title: "Porta deck incluso", description: "Tre scomparti, uno per trottola" }, { title: "Risparmi €10,40", description: "€39,90 invece di €50,30 comprandoli separati" }],
    boxContents: ["1 × Starter Sword Dran 3-60F (trottola e lanciatore)", "1 × Starter Helm Knight 3-80N (trottola e lanciatore)", "1 × Porta Deck giallo", "Manuali"],
    relatedSlugs: ["kit-arena-drop-completo", "sword-dran-3-60f", "helm-knight-3-80n"],
    bundleOf: [{ slug: "sword-dran-3-60f", quantity: 1 }, { slug: "helm-knight-3-80n", quantity: 1 }, { slug: "porta-deck-giallo", quantity: 1 }],
  },
  {
    slug: "kit-arena-drop-completo", name: "Kit Arena Drop Attack", tagline: "Arena, quattro trottole e porta deck. Tutto in una volta.",
    description: "Tutto per cominciare e non comprare altro: il Drop Attack Battle Set — il Beystadium con l'X-Celerator Rail rialzato che porta le trottole in alto per farle piombare sull'avversario, due trottole e due lanciatori — più due starter completi, Sword Dran 3-60F e Helm Knight 3-80N, e il porta deck giallo. In tutto quattro trottole e quattro lanciatori, con lo stadio per farle scontrare e la custodia per portarle in giro.",
    price: eur(7490), compareAtPrice: eur(9020), category: "beyblade-x", stock: "disponibile", tags: ["offerta"], rating: 0, reviewCount: 0,
    images: productImages["kit-arena-drop-completo"],
    specs: [{ label: "Contenuto", value: "1 stadio, 4 trottole, 4 lanciatori, 1 porta deck" }, { label: "Produttore", value: "Hasbro (prodotto originale)" }, { label: "Sistema", value: "Beyblade X" }, { label: "Stadio", value: "Drop Attack Battle Set" }, { label: "Starter inclusi", value: "Sword Dran 3-60F, Helm Knight 3-80N" }, { label: "Porta deck", value: "Giallo, 3 scomparti, non ufficiale" }],
    features: [{ title: "Si gioca subito", description: "Stadio, trottole e lanciatori in una sola scatola" }, { title: "Quattro trottole", description: "Le due del set più i due starter" }, { title: "Porta deck incluso", description: "Tre scomparti, uno per trottola" }, { title: "Risparmi €15,30", description: "Invece di €90,20 comprandoli separati" }],
    boxContents: ["1 × Drop Attack Battle Set (stadio, 2 trottole, 2 lanciatori)", "1 × Starter Sword Dran 3-60F", "1 × Starter Helm Knight 3-80N", "1 × Porta Deck giallo", "Manuali"],
    relatedSlugs: ["kit-doppio-starter-deck", "drop-attack-battle-set", "sword-dran-3-60f"],
    bundleOf: [{ slug: "drop-attack-battle-set", quantity: 1 }, { slug: "sword-dran-3-60f", quantity: 1 }, { slug: "helm-knight-3-80n", quantity: 1 }, { slug: "porta-deck-giallo", quantity: 1 }],
  },
  {
    slug: "kit-arena-sneak-completo", name: "Kit Arena Sneak Attack", tagline: "Arena, quattro trottole e porta deck. Tutto in una volta.",
    description: "Tutto per cominciare e non comprare altro: il Sneak Attack Battle Set — il Beystadium verde con il rail a scomparsa che devia le trottole in una nuova direzione, due trottole e due lanciatori — più due starter completi, Sword Dran 3-60F e Helm Knight 3-80N, e il porta deck giallo. In tutto quattro trottole e quattro lanciatori, con lo stadio per farle scontrare e la custodia per portarle in giro.",
    price: eur(7990), compareAtPrice: eur(9520), category: "beyblade-x", stock: "disponibile", tags: ["offerta"], rating: 0, reviewCount: 0,
    images: productImages["kit-arena-sneak-completo"],
    specs: [{ label: "Contenuto", value: "1 stadio, 4 trottole, 4 lanciatori, 1 porta deck" }, { label: "Produttore", value: "Hasbro (prodotto originale)" }, { label: "Sistema", value: "Beyblade X" }, { label: "Stadio", value: "Sneak Attack Battle Set" }, { label: "Starter inclusi", value: "Sword Dran 3-60F, Helm Knight 3-80N" }, { label: "Porta deck", value: "Giallo, 3 scomparti, non ufficiale" }],
    features: [{ title: "Si gioca subito", description: "Stadio, trottole e lanciatori in una sola scatola" }, { title: "Quattro trottole", description: "Le due del set più i due starter" }, { title: "Porta deck incluso", description: "Tre scomparti, uno per trottola" }, { title: "Risparmi €15,30", description: "Invece di €95,20 comprandoli separati" }],
    boxContents: ["1 × Sneak Attack Battle Set (stadio, 2 trottole, 2 lanciatori)", "1 × Starter Sword Dran 3-60F", "1 × Starter Helm Knight 3-80N", "1 × Porta Deck giallo", "Manuali"],
    relatedSlugs: ["kit-doppio-starter-deck", "sneak-attack-battle-set", "sword-dran-3-60f"],
    bundleOf: [{ slug: "sneak-attack-battle-set", quantity: 1 }, { slug: "sword-dran-3-60f", quantity: 1 }, { slug: "helm-knight-3-80n", quantity: 1 }, { slug: "porta-deck-giallo", quantity: 1 }],
  },
  {
    slug: "duo-pegasus-samurai", name: "Duo Lanciatori Speciali", tagline: "I due lanciatori che non trovi negli altri starter.",
    description: "I due starter Beyblade X che portano un lanciatore diverso dal solito: Blast Pegasus A Tr con il Clip & Rip Launcher, che si aggancia a cintura o zaino e ripone il ripcord all'interno, e Saber Samurai 2-70L con il lanciatore a impugnatura per lanci più stabili. Due trottole d'attacco della linea CX e UX, ognuna col suo lanciatore. Richiede un Beystadium Beyblade X (venduto separatamente).",
    price: eur(4790), compareAtPrice: eur(5280), category: "beyblade-x", stock: "disponibile", tags: ["offerta"], rating: 0, reviewCount: 0,
    images: productImages["duo-pegasus-samurai"],
    specs: [{ label: "Contenuto", value: "2 trottole, 2 lanciatori" }, { label: "Produttore", value: "Hasbro (prodotto originale)" }, { label: "Sistema", value: "Beyblade X" }, { label: "Trottole incluse", value: "Blast Pegasus A Tr, Saber Samurai 2-70L" }, { label: "Lanciatori", value: "Clip & Rip Launcher, lanciatore con impugnatura" }, { label: "Nota", value: "Richiede un Beystadium (venduto a parte)" }],
    features: [{ title: "Clip & Rip Launcher", description: "Si aggancia a cintura o zaino, ripcord all'interno" }, { title: "Lanciatore con impugnatura", description: "Presa piena per lanci potenti e stabili" }, { title: "Due linee diverse", description: "Una CX e una UX, entrambe d'attacco" }, { title: "Risparmi €4,90", description: "€47,90 invece di €52,80 comprandoli separati" }],
    boxContents: ["1 × Starter Blast Pegasus A Tr (trottola e Clip & Rip Launcher)", "1 × Starter Saber Samurai 2-70L (trottola e lanciatore con impugnatura)", "Manuali"],
    relatedSlugs: ["blast-pegasus-a-tr", "saber-samurai-2-70l", "kit-doppio-starter-deck"],
    bundleOf: [{ slug: "blast-pegasus-a-tr", quantity: 1 }, { slug: "saber-samurai-2-70l", quantity: 1 }],
  },
  {
    slug: "duo-horus-enlil", name: "Duo Shatter Horus + Hurricane Enlil", tagline: "Stamina contro bilanciata. Due starter, €3 in meno.",
    description: "Il duo mette insieme due Infinity Starter Beyblade X: Shatter Horus 9-65GB, trottola stamina della linea BX con il metallo esteso oltre i ganci, e Hurricane Enlil IS 7-55T, bilanciata CX con la blade Infinity scomponibile. Ogni starter include il proprio lanciatore: due assetti opposti, pronti a sfidarsi. Richiede un Beystadium Beyblade X (venduto separatamente).",
    price: eur(3300), compareAtPrice: eur(3600), category: "beyblade-x", stock: "disponibile", availableQuantity: 8, tags: ["offerta"], rating: 0, reviewCount: 0,
    images: productImages["duo-horus-enlil"],
    specs: [{ label: "Tipo", value: "Stamina + Bilanciata" }, { label: "Produttore", value: "Hasbro (prodotto originale)" }, { label: "Sistema", value: "Beyblade X" }, { label: "Linea", value: "BX + CX (Infinity Starter Pack)" }, { label: "Codice", value: "9-65GB · IS 7-55T" }, { label: "Componenti", value: "2 trottole, 2 lanciatori" }],
    features: [{ title: "Due starter completi", description: "Due trottole e due lanciatori, pronti a sfidarsi" }, { title: "Stili opposti", description: "Stamina BX contro bilanciata CX" }, { title: "Risparmi €3", description: "€33 invece di €36 comprandoli separati" }, { title: "Compatibile Beyblade X", description: "Blade, Ratchet e Bit intercambiabili con la serie" }],
    boxContents: ["1 × Starter Shatter Horus 9-65GB (trottola e lanciatore)", "1 × Starter Hurricane Enlil IS 7-55T (trottola e lanciatore)", "2 × Manuale"],
    relatedSlugs: ["shatter-horus-9-65gb", "hurricane-enlil-is-7-55t", "glory-valkerion-lf"],
    bundleOf: [{ slug: "shatter-horus-9-65gb", quantity: 1 }, { slug: "hurricane-enlil-is-7-55t", quantity: 1 }],
  },
];

/** The duo, as the managed homepage bundle banner presents it; its hero must be a product row in the database. */
export const BUNDLE: Bundle = {
  slug: "duo-horus-enlil", eyebrow: "Offerta duo", title: ["Horus ×", "Enlil."],
  description: "Due Infinity Starter Beyblade X, stamina contro bilanciata, a €33 invece di €36.", price: eur(3300), compareAtPrice: eur(3600),
  heroSlug: "shatter-horus-9-65gb", includes: ["shatter-horus-9-65gb", "hurricane-enlil-is-7-55t"],
};

/**
 * Shipping stops being charged only once the order can carry it. The stadium box is 45×45×15, so
 * every carrier bills it at its 6 kg volumetric weight and Poste adds a €5 out-of-format fee: a
 * parcel that costs far more than the €4,90 collected. At €59 a single arena plus one small piece
 * cleared the threshold and shipped a bulky box for free, so the owner raised it to €100 on
 * 2026-09-29.
 */
export const FREE_SHIPPING_THRESHOLD = 10000;
export const SHIPPING_FLAT_RATE = 490;
