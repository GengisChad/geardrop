"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { confirmNewsletterAction, type NewsletterState, unsubscribeNewsletterAction } from "@/app/actions/newsletter";
import { Button } from "@/components/ui/button";

const EMPTY: NewsletterState = { ok: false, message: "" };

const KINDS = {
  confirm: { action: confirmNewsletterAction, label: "Conferma l'iscrizione", pending: "Conferma in corso…" },
  unsubscribe: { action: unsubscribeNewsletterAction, label: "Cancellami", pending: "Cancellazione in corso…" },
} as const;

function SubmitButton({ label, pending: pendingLabel }: { readonly label: string; readonly pending: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="md" fullWidth disabled={pending} aria-busy={pending} data-testid="newsletter-token-button">
      {pending ? pendingLabel : label}
    </Button>
  );
}

/**
 * The page behind the confirm and unsubscribe links. Opening the link changes nothing; only this
 * button does, so a mailbox scanner that follows links cannot sign anyone up or out.
 */
export function NewsletterTokenForm({ kind, token }: { readonly kind: keyof typeof KINDS; readonly token: string }) {
  const { action: serverAction, label, pending } = KINDS[kind];
  const [state, action] = useActionState(serverAction, EMPTY);

  if (state.message) {
    return (
      <div className="flex flex-col gap-4">
        <p
          role="status"
          aria-live="polite"
          data-testid="newsletter-token-result"
          className={`flex items-start gap-2 px-4 py-3 text-small ${state.ok ? "bg-lime-tint text-lime" : "bg-soldout-bg text-soldout"}`}
        >
          {state.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
          <span>{state.message}</span>
        </p>
        <Button as={Link} href="/" variant="glass" size="md" fullWidth>
          Torna al negozio
        </Button>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4" data-testid={`newsletter-${kind}-form`}>
      <input type="hidden" name="token" value={token} />
      <SubmitButton label={label} pending={pending} />
    </form>
  );
}
