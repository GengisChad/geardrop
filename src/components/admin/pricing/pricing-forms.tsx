"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  askCopilotAction,
  decideProposalAction,
  deleteMarketSourceAction,
  runPricingAgentAction,
  saveMarketSourceAction,
  savePricingPolicyAction,
  type CopilotState,
  type PricingActionState,
} from "@/app/admin/actions/pricing";
import styles from "./pricing.module.css";
import warehouse from "@/components/admin/warehouse/warehouse.module.css";
import { formatEuro, formatEuroInput } from "@/lib/admin/warehouse";
import type { MarketSource, PricingPolicy, ProposalListItem } from "@/lib/ai/pricing-repository";

const initial: PricingActionState = { ok: false, message: "" };

function Feedback({ state }: { readonly state: PricingActionState }) {
  if (!state.message) return null;
  return <p className={state.ok ? warehouse.success : warehouse.error} role="status">{state.message}</p>;
}

export function RunAgentForm({ configured, sources }: { readonly configured: boolean; readonly sources: number }) {
  const [state, action, pending] = useActionState(runPricingAgentAction, initial);
  return (
    <form action={action} className={`${warehouse.panel} ${warehouse.form}`} data-testid="run-agent">
      <header className={warehouse.wide}>
        <div>
          <p>Agente IA</p>
          <h2>Analisi di mercato e prezzi</h2>
          <span>
            L&apos;analista cerca i prezzi solo sulle {sources} fonti approvate, il consulente propone variazioni.
            Nessun prezzo cambia senza la vostra approvazione.
          </span>
        </div>
      </header>
      <div className={warehouse.actions}>
        <button className={warehouse.primary} disabled={pending || !configured} type="submit">
          {pending ? "Analisi in corso… (1–3 minuti)" : "Avvia analisi"}
        </button>
        <Link className={warehouse.secondary} href="/admin/prezzi/fonti">Fonti e politica</Link>
        {!configured ? <p className={warehouse.error}>Agente non configurato: serve la chiave ANTHROPIC_API_KEY sul server.</p> : null}
        <Feedback state={state} />
      </div>
    </form>
  );
}

function deltaPercent(current: number, proposed: number): number {
  return current > 0 ? Math.round(((proposed - current) / current) * 1000) / 10 : 0;
}

export function ProposalCard({ proposal, vatRateBp }: { readonly proposal: ProposalListItem; readonly vatRateBp: number }) {
  const [state, action, pending] = useActionState(decideProposalAction, initial);
  const delta = deltaPercent(proposal.current_price_cents, proposal.proposed_price_cents);
  const net = Math.round((proposal.proposed_price_cents * 10_000) / (10_000 + vatRateBp));
  const margin = proposal.average_cost_cents === null || net <= 0 ? null : Math.round(((net - proposal.average_cost_cents) / net) * 1000) / 10;
  const evidence = Array.isArray(proposal.evidence)
    ? proposal.evidence.flatMap((item) => (item && typeof item === "object" && "url" in item && typeof item.url === "string" ? [item.url] : []))
    : [];

  return (
    <article className={styles.proposal} data-out-of-policy={proposal.out_of_policy || undefined} data-testid="pricing-proposal">
      <div className={styles.proposalHead}>
        <span><Link href={`/admin/prodotti/${proposal.product_id}`}>{proposal.productName}</Link> <small>{proposal.productSku}</small></span>
        <span className={warehouse.status} data-status={proposal.out_of_policy ? "draft" : "confirmed"}>
          {proposal.out_of_policy ? "Fuori politica" : "Nella politica"}
        </span>
      </div>
      <div className={styles.prices}>
        <del>{formatEuro(proposal.current_price_cents)}</del>
        <strong>{formatEuro(proposal.proposed_price_cents)}</strong>
        <span className={styles.delta} data-direction={delta >= 0 ? "up" : "down"}>{delta >= 0 ? "+" : ""}{delta.toLocaleString("it-IT")}%</span>
      </div>
      <p className={styles.facts}>
        <span>Costo medio {formatEuro(proposal.average_cost_cents)}</span>
        <span>Margine al nuovo prezzo {margin === null ? "—" : `${margin.toLocaleString("it-IT")}%`}</span>
        <span>Confidenza {Math.round(Number(proposal.confidence) * 100)}%</span>
      </p>
      <p className={styles.rationale}>{proposal.rationale}</p>
      {proposal.policy_notes.length > 0 ? <p className={styles.policy}>Attenzione: {proposal.policy_notes.join(" · ")}</p> : null}
      {evidence.length > 0 ? (
        <ul className={styles.evidence}>
          {evidence.slice(0, 6).map((url, index) => (
            <li key={`${url}-${index}`}><a href={url} rel="noreferrer noopener" target="_blank">Evidenza {index + 1}</a></li>
          ))}
        </ul>
      ) : null}
      <form action={action} className={styles.decision}>
        <input name="proposalId" type="hidden" value={proposal.id} />
        <label>
          Prezzo da applicare (€)
          <input defaultValue={formatEuroInput(proposal.proposed_price_cents)} inputMode="decimal" name="price" />
        </label>
        <label className={styles.note}>
          Nota (facoltativa)
          <input maxLength={1000} name="note" placeholder="Perché approvi, correggi o rifiuti" />
        </label>
        <button className={styles.approve} disabled={pending} name="decision" type="submit" value="approve">Approva</button>
        <button className={styles.reject} disabled={pending} name="decision" type="submit" value="reject">Rifiuta</button>
        {state.message ? <p className={styles.feedback} data-error={state.ok ? undefined : true} role="status">{state.message}</p> : null}
      </form>
    </article>
  );
}

const KIND_LABELS = { competitor: "Negozio concorrente", marketplace: "Marketplace", release_calendar: "Calendario uscite", other: "Altro" } as const;

export function MarketSourceForm({ source }: { readonly source: MarketSource | null }) {
  const [state, action, pending] = useActionState(saveMarketSourceAction, initial);
  return (
    <form action={action} className={`${warehouse.panel} ${warehouse.form}`} data-testid={`market-source-${source?.id ?? "new"}`}>
      {source ? <input name="id" type="hidden" value={source.id} /> : null}
      <label>
        Nome
        <input defaultValue={source?.name ?? ""} maxLength={120} name="name" required />
      </label>
      <label>
        Dominio
        <input defaultValue={source?.domain ?? ""} name="domain" placeholder="negozio.it" required />
      </label>
      <label>
        Tipo
        <select defaultValue={source?.kind ?? "competitor"} name="kind">
          {Object.entries(KIND_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label className={warehouse.wide}>
        Note
        <input defaultValue={source?.notes ?? ""} maxLength={1000} name="notes" />
      </label>
      {source ? (
        <label className={warehouse.check}>
          <input defaultChecked={source.active} name="active" type="checkbox" />
          Attiva
        </label>
      ) : null}
      <div className={warehouse.actions}>
        <button className={warehouse.primary} disabled={pending} type="submit">{pending ? "Salvataggio…" : source ? "Salva fonte" : "Approva fonte"}</button>
        {source ? <button className={warehouse.danger} formAction={deleteMarketSourceAction} type="submit">Rimuovi</button> : null}
        <Feedback state={state} />
      </div>
    </form>
  );
}

export function PricingPolicyForm({ policy, editable }: { readonly policy: PricingPolicy; readonly editable: boolean }) {
  const [state, action, pending] = useActionState(savePricingPolicyAction, initial);
  return (
    <form action={action} className={`${warehouse.panel} ${warehouse.form}`} data-testid="pricing-policy">
      <header className={warehouse.wide}>
        <div>
          <p>Guardrail</p>
          <h2>Politica prezzi</h2>
          <span>Le proposte fuori politica restano visibili ma segnalate. Solo un owner la modifica.</span>
        </div>
      </header>
      <label>Margine minimo sul costo (%)<input defaultValue={policy.min_margin_bp / 100} disabled={!editable} inputMode="decimal" name="minMargin" /></label>
      <label>Variazione massima per proposta (%)<input defaultValue={policy.max_change_bp / 100} disabled={!editable} inputMode="decimal" name="maxChange" /></label>
      <label>Giorni tra due decisioni sullo stesso prodotto<input defaultValue={policy.cooldown_days} disabled={!editable} name="cooldownDays" type="number" /></label>
      <label>
        Arrotondamento
        <select defaultValue={policy.rounding} disabled={!editable} name="rounding">
          <option value="cents_90">Al ,90 più vicino</option>
          <option value="cents_99">Al ,99 più vicino</option>
          <option value="cents_50">Ai 50 centesimi</option>
          <option value="none">Nessuno</option>
        </select>
      </label>
      <label>Prodotti per analisi<input defaultValue={policy.products_per_run} disabled={!editable} name="productsPerRun" type="number" /></label>
      {editable ? (
        <div className={warehouse.actions}>
          <button className={warehouse.primary} disabled={pending} type="submit">{pending ? "Salvataggio…" : "Salva politica"}</button>
          <Feedback state={state} />
        </div>
      ) : null}
    </form>
  );
}

const SUGGESTIONS = [
  "Cosa devo riordinare questa settimana?",
  "Quali prodotti stanno vendendo più del solito?",
  "Com'è andato il profitto degli ultimi 30 giorni?",
  "I concorrenti vendono sotto il nostro prezzo?",
];

export function CopilotChat({ configured }: { readonly configured: boolean }) {
  const [state, action, pending] = useActionState(askCopilotAction, { turns: [], error: null } satisfies CopilotState);
  const [draft, setDraft] = useState("");
  return (
    <section className={styles.chat} data-testid="copilot">
      <div className={styles.messages} aria-live="polite">
        {state.turns.length === 0 ? <p className={warehouse.hint}>Chiedi di stock, vendite, previsioni, profitto o prezzi dei concorrenti: l&apos;assistente legge i dati dell&apos;azienda in cui stai lavorando e non modifica nulla.</p> : null}
        {state.turns.map((turn, index) => <div className={styles.message} data-role={turn.role} key={index}>{turn.text}</div>)}
        {pending ? <div className={styles.message} data-role="assistant">Sto leggendo i dati…</div> : null}
      </div>
      {state.error ? <p className={warehouse.error} role="status">{state.error}</p> : null}
      <div className={styles.suggestions}>
        {SUGGESTIONS.map((suggestion) => <button disabled={!configured} key={suggestion} onClick={() => setDraft(suggestion)} type="button">{suggestion}</button>)}
      </div>
      <form action={(formData) => { action(formData); setDraft(""); }} className={styles.ask}>
        <textarea
          aria-label="Domanda"
          disabled={!configured}
          maxLength={2000}
          name="question"
          onChange={(event) => setDraft(event.target.value)}
          placeholder={configured ? "Scrivi una domanda…" : "Assistente non configurato: serve ANTHROPIC_API_KEY sul server."}
          required
          value={draft}
        />
        <button className={warehouse.primary} disabled={pending || !configured || !draft.trim()} type="submit">{pending ? "Attendi…" : "Chiedi"}</button>
      </form>
    </section>
  );
}
