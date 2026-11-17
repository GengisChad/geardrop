import Link from "next/link";
import { redirect } from "next/navigation";
import { ProposalCard, RunAgentForm } from "@/components/admin/pricing/pricing-forms";
import pricing from "@/components/admin/pricing/pricing.module.css";
import styles from "@/components/admin/warehouse/warehouse.module.css";
import { requireAdminAccess } from "@/lib/admin/access";
import { formatEuro } from "@/lib/admin/warehouse";
import { claudeApiKey } from "@/lib/ai/claude-api";
import { listAgentRuns, listMarketSources, listProposals } from "@/lib/ai/pricing-repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
// An analysis searches the web and reasons over the catalogue: it can take a few minutes.
export const maxDuration = 300;

const dateTime = new Intl.DateTimeFormat("it-IT", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Rome" });
const RUN_STATUS = { running: ["In corso", "draft"], succeeded: ["Completata", "confirmed"], failed: ["Fallita", "reversed"] } as const;

export default async function PricingPage() {
  const client = await createSupabaseServerClient();
  const principal = await requireAdminAccess(client);
  if (principal.role === "editor") redirect("/admin");
  const organizationId = principal.organization.id;
  const [pending, decided, runs, sources, company] = await Promise.all([
    listProposals(client, organizationId, "pending"),
    listProposals(client, organizationId, "decided", 20),
    listAgentRuns(client, organizationId, 10),
    listMarketSources(client, organizationId),
    client.from("organizations").select("default_vat_rate_bp").eq("id", organizationId).single(),
  ]);
  const vatRateBp = company.data?.default_vat_rate_bp ?? 2200;
  const activeSources = sources.filter((source) => source.active).length;

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <div>
          <p>Prezzi / Agente IA</p>
          <h1>Proposte di prezzo</h1>
          <span>L&apos;agente propone, un socio decide · {pending.length} in attesa</span>
        </div>
        <Link href="/admin/prezzi/osservazioni">Prezzi osservati</Link>
      </header>

      <RunAgentForm configured={claudeApiKey() !== null} sources={activeSources} />

      <section className={pricing.proposals} aria-labelledby="attesa-title">
        <h2 id="attesa-title">In attesa di decisione</h2>
        {pending.length === 0 ? (
          <p className={styles.hint}>Nessuna proposta in attesa. Avvia un&apos;analisi: le proposte arrivano qui.</p>
        ) : pending.map((proposal) => <ProposalCard key={proposal.id} proposal={proposal} vatRateBp={vatRateBp} />)}
      </section>

      <section className={styles.panel} aria-labelledby="storico-title">
        <header><div><h2 id="storico-title">Decisioni recenti</h2><span>Approvazioni e rifiuti: servono a valutare l&apos;agente nel tempo.</span></div></header>
        {decided.length === 0 ? <p className={styles.hint}>Ancora nessuna decisione.</p> : (
          <div className={styles.tableWrap}>
            <table>
              <thead><tr><th>Prodotto</th><th className={styles.numeric}>Da</th><th className={styles.numeric}>Proposto</th><th className={styles.numeric}>Applicato</th><th>Esito</th><th>Nota</th><th>Quando</th></tr></thead>
              <tbody>
                {decided.map((proposal) => (
                  <tr key={proposal.id}>
                    <td>{proposal.productName}<small className={styles.mono}>{proposal.productSku}</small></td>
                    <td className={styles.numeric}>{formatEuro(proposal.current_price_cents)}</td>
                    <td className={styles.numeric}>{formatEuro(proposal.proposed_price_cents)}</td>
                    <td className={styles.numeric}>{formatEuro(proposal.applied_price_cents)}</td>
                    <td><span className={styles.status} data-status={proposal.status === "approved" ? "confirmed" : "reversed"}>{proposal.status === "approved" ? "Approvata" : "Rifiutata"}</span></td>
                    <td>{proposal.decision_note ?? "—"}</td>
                    <td>{proposal.decided_at ? dateTime.format(new Date(proposal.decided_at)) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={styles.panel} aria-labelledby="esecuzioni-title">
        <header><div><h2 id="esecuzioni-title">Esecuzioni dell&apos;agente</h2><span>Costo stimato in dollari dai token e dalle ricerche web.</span></div></header>
        {runs.length === 0 ? <p className={styles.hint}>Nessuna esecuzione.</p> : (
          <div className={styles.tableWrap}>
            <table>
              <thead><tr><th>Avvio</th><th>Tipo</th><th>Stato</th><th className={styles.numeric}>Ricerche</th><th className={styles.numeric}>Costo</th><th>Riepilogo</th></tr></thead>
              <tbody>
                {runs.map((run) => {
                  const [label, status] = RUN_STATUS[run.status as keyof typeof RUN_STATUS] ?? ["—", ""];
                  return (
                    <tr key={run.id}>
                      <td>{dateTime.format(new Date(run.started_at))}</td>
                      <td>{run.agent === "pricing" ? "Analisi prezzi" : "Assistente"}</td>
                      <td><span className={styles.status} data-status={status}>{label}</span></td>
                      <td className={styles.numeric}>{run.web_searches}</td>
                      <td className={styles.numeric}>${(run.cost_estimate_cents / 100).toFixed(2)}</td>
                      <td>{run.error ?? run.summary ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
