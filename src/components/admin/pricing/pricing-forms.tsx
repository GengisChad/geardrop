"use client";

import Link from "next/link";
import { DEFAULT_LINK_POLICY, type LinkPolicy } from "@/lib/ai/markdown-lite";
import { AssistantText, LinkedText } from "./assistant-text";
import { useActionState, useEffect, useRef, useState } from "react";
import {
  askCopilotAction,
  decideProposalAction,
  deleteMarketSourceAction,
  runPricingAgentAction,
  runPricingBatchAction,
  saveMarketSourceAction,
  savePricingPolicyAction,
  type CopilotState,
  type PricingActionState,
} from "@/app/admin/actions/pricing";
import { ANALYSE_ALL_INITIAL } from "@/lib/ai/pricing-actions-types";
import styles from "./pricing.module.css";
import warehouse from "@/components/admin/warehouse/warehouse.module.css";
import { formatEuro, formatEuroInput } from "@/lib/admin/warehouse";
import type { MarketSource, PricingPolicy, ProposalListItem } from "@/lib/ai/pricing-repository";
import type { CopilotAction } from "@/lib/ai/copilot-actions";

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
          <h2>Analisi rapida</h2>
          <span>
            Analizza i prodotti non controllati di recente (fino a {sources > 0 ? `${sources} fonti` : "senza fonti esterne"}).
            Nessun prezzo cambia senza la vostra approvazione.
          </span>
        </div>
      </header>
      <div className={warehouse.actions}>
        <button className={warehouse.primary} disabled={pending || !configured} type="submit">
          {pending ? "Analisi in corso… (1–3 minuti)" : "Avvia analisi rapida"}
        </button>
        <Link className={warehouse.secondary} href="/admin/prezzi/fonti">Fonti e politica</Link>
        {!configured ? <p className={warehouse.error}>Agente non configurato: serve la chiave ANTHROPIC_API_KEY sul server.</p> : null}
        <Feedback state={state} />
      </div>
    </form>
  );
}

/**
 * "Analizza tutto il catalogo": client loop that calls runPricingBatchAction batch by batch,
 * showing live progress and allowing the user to stop at any point.
 * Respects reduced-motion: progress is text-only, no looping animations.
 */
export function AnalyseAllForm({ configured, totalProducts }: { readonly configured: boolean; readonly totalProducts: number }) {
  const [state, action, pending] = useActionState(runPricingBatchAction, ANALYSE_ALL_INITIAL);
  const formRef = useRef<HTMLFormElement>(null);
  const offsetRef = useRef<HTMLInputElement>(null);

  // Auto-advance: when a batch completes and more remain, submit the next one.
  useEffect(() => {
    if (!pending && state.status === "running" && state.nextOffset < state.totalProducts) {
      if (offsetRef.current) offsetRef.current.value = String(state.nextOffset);
      formRef.current?.requestSubmit();
    }
  }, [state, pending]);

  const batches = state.totalProducts > 0 ? Math.ceil(state.totalProducts / state.batchSize) : Math.ceil(totalProducts / state.batchSize);
  const currentBatch = state.batchSize > 0 ? Math.ceil(state.nextOffset / state.batchSize) : 0;
  const isActive = state.status === "running" || pending;

  return (
    <form ref={formRef} action={action} className={`${warehouse.panel} ${warehouse.form}`} data-testid="analyse-all">
      <input ref={offsetRef} name="offset" type="hidden" value={state.nextOffset} />
      <header className={warehouse.wide}>
        <div>
          <p>Agente IA</p>
          <h2>Analisi di tutto il catalogo</h2>
          <span>
            Analizza tutti i {totalProducts} prodotti pubblicati in lotti da {state.batchSize} · include Amazon, eBay, ZenMarket e altri.
            Nessun prezzo cambia senza la vostra approvazione.
          </span>
        </div>
      </header>

      {state.status !== "idle" && (
        <div className={styles.analyseProgress} role="status" aria-live="polite">
          {state.status === "running" || pending ? (
            <p>Lotto {currentBatch + 1} di {batches} · {state.processed}/{state.totalProducts || totalProducts} prodotti</p>
          ) : state.status === "done" ? (
            <p>Completato: {state.processed} prodotti · {state.observations} osservazioni · {state.proposals} proposte · ${state.dollars.toFixed(2)}</p>
          ) : (
            <p>Interrotto a {state.processed} di {state.totalProducts || totalProducts} prodotti · {state.observations} osservazioni · {state.proposals} proposte · ${state.dollars.toFixed(2)}</p>
          )}
          {state.lastSummary ? <p className={styles.analyseLastSummary}>{state.lastSummary}</p> : null}
          {state.errors.length > 0 ? (
            <ul className={warehouse.error}>
              {state.errors.map((error, i) => <li key={i}>{error}</li>)}
            </ul>
          ) : null}
        </div>
      )}

      <div className={warehouse.actions}>
        {!isActive && state.status !== "done" ? (
          <button
            className={warehouse.primary}
            disabled={!configured}
            name="offset"
            onClick={() => { if (offsetRef.current) offsetRef.current.value = "0"; }}
            type="submit"
            value="0"
          >
            Analizza tutto il catalogo
          </button>
        ) : null}
        {isActive ? (
          <button className={warehouse.secondary} name="stop" type="submit" value="1">
            Ferma
          </button>
        ) : null}
        {state.status === "done" || state.status === "stopped" ? (
          <button
            className={warehouse.secondary}
            name="offset"
            onClick={() => { if (offsetRef.current) offsetRef.current.value = "0"; }}
            type="submit"
            value="0"
          >
            Riavvia dall&apos;inizio
          </button>
        ) : null}
        {!configured ? <p className={warehouse.error}>Agente non configurato: serve la chiave ANTHROPIC_API_KEY sul server.</p> : null}
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
  "Quali ordini pagati non sono ancora spediti?",
  "Com'è andato il profitto degli ultimi 30 giorni?",
  "Ho venduto 2 Soar Phoenix a mano a 20 €: toglili dal magazzino",
];

const ACTION_STATUS: Record<CopilotAction["status"], string> = { pending: "Da confermare", done: "Eseguita", failed: "Non riuscita", cancelled: "Annullata" };

/** The cards of one answer: each runs only on "Conferma", with the permissions of whoever presses it. */
function ActionCards({ actions, turn, action, pending, links }: { readonly actions: readonly CopilotAction[]; readonly turn: number; readonly action: (formData: FormData) => void; readonly pending: boolean; readonly links: LinkPolicy }) {
  const open = actions.filter((item) => item.status === "pending").length;
  return (
    <div className={styles.actions} data-testid="copilot-actions">
      {actions.map((item) => (
        <div className={styles.actionCard} data-status={item.status} key={item.id}>
          <strong>{item.title}</strong>
          {item.details.length ? <ul>{item.details.map((line, index) => <li key={index}><LinkedText links={links} text={line} /></li>)}</ul> : null}
          {item.warning && item.status === "pending" ? <p className={styles.actionWarning}>{item.warning}</p> : null}
          {item.status === "pending" ? (
            <form action={action} className={styles.actionButtons}>
              <input name="actionId" type="hidden" value={item.id} />
              <button className={warehouse.primary} disabled={pending} name="intent" type="submit" value="confirm">Conferma</button>
              <button disabled={pending} name="intent" type="submit" value="cancel">Annulla</button>
            </form>
          ) : (
            <p className={styles.actionResult}>{ACTION_STATUS[item.status]}{item.result ? <> · <LinkedText links={links} text={item.result} /></> : null}</p>
          )}
        </div>
      ))}
      {open > 1 ? (
        <form action={action} className={styles.actionButtons}>
          <input name="turn" type="hidden" value={turn} />
          <button className={warehouse.primary} disabled={pending} name="intent" type="submit" value="confirm_all">Conferma tutte ({open})</button>
        </form>
      ) : null}
    </div>
  );
}

export function CopilotChat({ configured, links = DEFAULT_LINK_POLICY }: { readonly configured: boolean; readonly links?: LinkPolicy }) {
  const [state, action, pending] = useActionState(askCopilotAction, { turns: [], error: null } satisfies CopilotState);
  const [draft, setDraft] = useState("");
  return (
    <section className={styles.chat} data-testid="copilot">
      <div className={styles.messages} aria-live="polite">
        {state.turns.length === 0 ? <p className={warehouse.hint}>Chiedi di stock, vendite, previsioni, profitto o prezzi dei concorrenti, oppure di fare qualcosa: segnare ordini spediti, togliere pezzi venduti a mano, cambiare un prezzo, un costo o una scheda prodotto, o cambiare il sito stesso (prodotti nuovi, foto, pagine), che affido a Claude Code: arriva una PR con anteprima. Ogni modifica compare come scheda e parte solo quando premi «Conferma», con i tuoi permessi.</p> : null}
        {state.turns.map((turn, index) => (
          <div className={styles.turn} key={index}>
            <div className={styles.message} data-role={turn.role}>{turn.role === "assistant" ? <AssistantText links={links} text={turn.text} /> : turn.text}</div>
            {turn.actions?.length ? <ActionCards action={action} actions={turn.actions} links={links} pending={pending} turn={index} /> : null}
          </div>
        ))}
        {pending ? <div className={styles.message} data-role="assistant">Sto lavorando…</div> : null}
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
          onKeyDown={(event) => {
            // Invio manda la domanda, Maiusc+Invio va a capo.
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              if (!pending && draft.trim()) event.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder={configured ? "Scrivi una domanda e premi Invio…" : "Assistente non configurato: serve ANTHROPIC_API_KEY sul server."}
          required
          value={draft}
        />
        <button className={warehouse.primary} disabled={pending || !configured || !draft.trim()} type="submit">{pending ? "Attendi…" : "Chiedi"}</button>
      </form>
    </section>
  );
}
