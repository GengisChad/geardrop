import { redirect } from "next/navigation";
import { CopilotChat } from "@/components/admin/pricing/pricing-forms";
import styles from "@/components/admin/warehouse/warehouse.module.css";
import { requireAdminAccess } from "@/lib/admin/access";
import { claudeApiKey } from "@/lib/ai/claude-api";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
// The assistant reads, thinks and prepares cards in several model calls: it stops starting new ones at 240 s.
export const maxDuration = 300;

export default async function AssistantPage() {
  const client = await createSupabaseServerClient();
  const principal = await requireAdminAccess(client);
  if (principal.role === "editor") redirect("/admin");

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <div>
          <p>Agente IA / {principal.organization.name}</p>
          <h1>Assistente</h1>
          <span>Magazzino, vendite, previsioni, profitto e mercato in tempo reale · modifica solo con la tua conferma</span>
        </div>
      </header>
      <CopilotChat configured={claudeApiKey() !== null} />
    </div>
  );
}
