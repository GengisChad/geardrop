"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/ui/field";
import { updateProfileAction } from "./actions";
import type { AuthFormState } from "@/lib/auth/schemas";

const EMPTY: AuthFormState = {};

export type ProfileDefaults = {
  readonly firstName: string;
  readonly lastName: string;
  readonly phone: string;
};

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="tertiary" disabled={pending}>
      {pending ? "Salvataggio…" : "Salva"}
    </Button>
  );
}

export function ProfileForm({ defaults }: { defaults: ProfileDefaults }) {
  const [state, action] = useActionState(updateProfileAction, EMPTY);

  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error ? (
        <p role="alert" className="text-small text-soldout">
          {state.error}
        </p>
      ) : null}
      {state.notice ? (
        <p role="status" className="text-small text-violet-ink">
          {state.notice}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome" htmlFor="firstName">
          <TextInput id="firstName" name="firstName" defaultValue={defaults.firstName} autoComplete="given-name" />
        </Field>
        <Field label="Cognome" htmlFor="lastName">
          <TextInput id="lastName" name="lastName" defaultValue={defaults.lastName} autoComplete="family-name" />
        </Field>
      </div>
      <Field label="Telefono" htmlFor="phone">
        <TextInput id="phone" name="phone" defaultValue={defaults.phone} autoComplete="tel" inputMode="tel" />
      </Field>

      <div>
        <Submit />
      </div>
    </form>
  );
}
