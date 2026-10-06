import { redirect } from "next/navigation";
import styles from "@/components/admin/content/content.module.css";
import { PendingVintedSale } from "@/components/admin/vinted/vinted-sale-forms";
import { PRODUCTS } from "@/data/catalog";
import { STOCK_ONLY_PRODUCTS } from "@/data/stock-only";
import { requireAdminAccess } from "@/lib/admin/access";
import { loadVintedPanel, readAppliedLines, readSuggestion } from "@/lib/admin/vinted";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const date = new Intl.DateTimeFormat("it-IT", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Rome" });
const euro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
const SOURCE: Readonly<Record<string, string>> = {
  code: "codice nel titolo",
  name: "nome nel titolo",
  "arena-only": "arena venduta da sola",
  claude: "lettura IA",
  none: "nessuna proposta",
};

/**
 * The Vinted sync, seen from the shop: sales waiting for the owner to say which pieces left,
 * then what was recorded. A sale named by code arrives already recorded; everything else waits
 * here, with the reader's proposal prefilled.
 */
export default async function AdminVintedPage() {
  const client = await createSupabaseServerClient();
  const principal = await requireAdminAccess(client);
  // Sales, buyers and stock moves: the same people who see the orders.
  if (principal.role === "editor") redirect("/admin");
  const [panel, shelf] = await Promise.all([
    loadVintedPanel(client),
    client.from("products").select("slug,stock_quantity"),
  ]);
  const stock = new Map((shelf.data ?? []).map((row) => [row.slug, row.stock_quantity]));
  const options = [...PRODUCTS, ...STOCK_ONLY_PRODUCTS]
    .sort((a, b) => a.name.localeCompare(b.name, "it"))
    .map((product) => ({ slug: product.slug, name: product.name, stock: stock.get(product.slug) ?? null }));

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const thisMonth = panel.recent.filter((sale) => sale.status === "recorded" && new Date(sale.sold_at) >= monthStart);
  const monthTotal = thisMonth.reduce((sum, sale) => sum + sale.amount_cents, 0);

  const connected = Boolean(process.env["RESEND_WEBHOOK_SECRET"]?.trim());
  const aiReady = Boolean(process.env["ANTHROPIC_API_KEY"]?.trim());

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <div>
          <p>VENDITE / Vinted</p>
          <h1>Vinted</h1>
          <span>
            {panel.pending.length} da confermare · {thisMonth.length} registrate questo mese · {euro.format(monthTotal / 100)}
          </span>
        </div>
      </header>

      <section className={styles.panel}>
        <header>
          <div>
            <p>COLLEGAMENTO</p>
            <h2>{connected ? "Le email «Hai venduto» arrivano al sito" : "Collegamento da completare"}</h2>
          </div>
        </header>
        <p className={styles.hint}>
          Gmail inoltra le email di vendita di Vinted, il sito le legge e scala il magazzino da solo quando il titolo
          dell&rsquo;annuncio contiene il codice del pezzo (es. 1-80MN). Un ordine «Set di N articoli» o un titolo senza
          codice aspetta qui la tua conferma. Lettura IA dei titoli: {aiReady ? "attiva" : "non attiva (manca ANTHROPIC_API_KEY)"}.
        </p>
      </section>

      {panel.pending.map((sale) => {
        const suggestion = readSuggestion(sale.suggestion);
        return (
          <section className={styles.panel} key={sale.id}>
            <header>
              <div>
                <p>DA CONFERMARE · {date.format(new Date(sale.sold_at))}</p>
                <h2>{sale.listing_title} · {euro.format(sale.amount_cents / 100)}</h2>
              </div>
            </header>
            <p className={styles.hint}>
              Acquirente {sale.buyer_username || "non indicato"} ·{" "}
              {sale.item_count > 1 ? `${sale.item_count} annunci in un ordine` : "un annuncio"} · proposta:{" "}
              {SOURCE[suggestion.source] ?? suggestion.source}
              {suggestion.reason ? ` — ${suggestion.reason}` : ""}
            </p>
            <PendingVintedSale itemCount={sale.item_count} options={options} saleId={sale.id} suggested={suggestion.lines} />
          </section>
        );
      })}

      <section className={styles.panel}>
        <header>
          <div>
            <p>STORICO</p>
            <h2>Vendite registrate</h2>
          </div>
        </header>
        {panel.recent.length === 0 ? (
          <p className={styles.empty}>Nessuna vendita Vinted ancora.</p>
        ) : (
          <div className={styles.pageList}>
            {panel.recent.map((sale) => {
              const lines = readAppliedLines(sale.lines);
              return (
                <div className={styles.pageCard} key={sale.id}>
                  <div>
                    <b>{sale.status === "recorded" ? "registrata" : "scartata"}</b>
                    <strong>{sale.listing_title} · {euro.format(sale.amount_cents / 100)}</strong>
                    <span>
                      {lines.length
                        ? lines.map((line) => `${line.taken === line.quantity ? line.quantity : `${line.taken}/${line.quantity}`} × ${line.name}`).join(", ")
                        : sale.note ?? "—"}
                    </span>
                  </div>
                  <small>{date.format(new Date(sale.sold_at))}{sale.recorded_by ? "" : " · automatica"}</small>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {panel.other.length > 0 ? (
        <section className={styles.panel}>
          <header>
            <div>
              <p>ALTRE EMAIL RICEVUTE</p>
              <h2>Non sono vendite</h2>
            </div>
          </header>
          <div className={styles.pageList}>
            {panel.other.map((email) => (
              <div className={styles.pageCard} key={email.id}>
                <div>
                  <strong>{email.subject || "(senza oggetto)"}</strong>
                  <span>{email.from_address}</span>
                  <span>{email.body_text.slice(0, 280)}</span>
                </div>
                <small>{date.format(new Date(email.received_at))}</small>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
