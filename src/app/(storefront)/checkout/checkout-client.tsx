"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useForm, useWatch } from "react-hook-form";
import { AlertTriangle, ArrowRight, CheckCircle2, Info } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, TextInput, inputClass } from "@/components/ui/field";
import { CartTotalsPanel } from "@/components/cart/cart-summary";
import { useCartQuote } from "@/lib/use-cart-quote";
import { useCart } from "@/lib/store/cart";
import { formatPrice } from "@/lib/format";
import { checkoutSchema, type CheckoutValues } from "@/lib/checkout-schema";
import { submitOrder } from "./actions";
import type { Money } from "@/lib/commerce/types";
import { cn } from "@/lib/cn";

const STEPS = ["Carrello", "Spedizione", "Conferma"] as const;

type Placed = { readonly orderNumber: string; readonly total: Money | null };

export function CheckoutClient() {
  const lines = useCart((s) => s.lines);
  const clear = useCart((s) => s.clear);

  const [placed, setPlaced] = useState<Placed | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // One key for the whole checkout attempt: a retry after a lost response must return
  // the order the database already created rather than creating a second one.
  const [idempotencyKey] = useState(() => globalThis.crypto.randomUUID());

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<CheckoutValues>({ mode: "onBlur" });

  // useWatch rather than watch(): it subscribes at this component only, and unlike
  // watch() it can be memoized, so the React Compiler doesn't bail out on this file.
  const selectedShipping = useWatch({ control, name: "shippingMethod" });
  const { quote, hydrated } = useCartQuote({ shippingCode: selectedShipping });

  // Before the customer touches a radio the backend's own default is what the totals
  // were computed with, so that is what the form shows as selected.
  const activeShipping = selectedShipping || quote?.shippingCode || "";

  if (placed) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        data-testid="order-confirmation"
        className="mx-auto mt-10 flex max-w-lg flex-col items-center rounded-[--radius-card] border border-available/30 bg-available-bg px-6 py-14 text-center"
      >
        <CheckCircle2 className="size-14 text-available" strokeWidth={1.5} aria-hidden="true" />
        <h2 className="mt-5 text-h2 font-bold text-graphite">Ordine registrato</h2>
        <p className="mt-2 text-small text-grey-600">
          Il tuo ordine{" "}
          <span className="gd-display font-bold text-graphite" data-testid="order-number">
            {placed.orderNumber}
          </span>{" "}
          è stato registrato.
          {placed.total ? <> Totale: {formatPrice(placed.total)}.</> : null}
        </p>
        <p className="mt-3 max-w-sm text-[0.6875rem] text-grey-600">
          Nessun pagamento è stato addebitato e nessuna email automatica è stata inviata: ti
          ricontattiamo noi per completare l&apos;ordine. Annota il numero qui sopra.
        </p>
        <Button as={Link} href="/negozio" variant="primary" size="lg" className="mt-7">
          Continua ad acquistare
        </Button>
      </motion.div>
    );
  }

  if (!hydrated || !quote) {
    return <div className="gd-glass-panel mt-8 h-96 animate-pulse rounded-[--radius-glass]" data-testid="checkout-loading" />;
  }

  if (quote.lines.length === 0) {
    return (
      <EmptyState
        className="mt-8"
        icon="cart"
        title="Niente da pagare"
        message="Il carrello è vuoto: aggiungi qualcosa prima di passare al checkout."
        href="/negozio"
      />
    );
  }

  const blocked = !quote.orderable;

  return (
    <form
      noValidate
      data-testid="checkout-form"
      onSubmit={handleSubmit(async (values) => {
        setFailure(null);
        setPending(true);
        try {
          const result = await submitOrder({
            // The shipping code the quote was priced with wins if the customer never
            // touched the radios; the database rejects it anyway if it is not active.
            contact: { ...values, shippingMethod: values.shippingMethod || activeShipping },
            lines: lines.map((line) => ({ slug: line.slug, quantity: line.quantity })),
            idempotencyKey,
          });
          if (!result.ok) {
            // The cart is deliberately left untouched: nothing was ordered.
            setFailure(result.message);
            return;
          }
          setPlaced({ orderNumber: result.orderNumber, total: result.total });
          clear();
        } finally {
          setPending(false);
        }
      })}
      className="mt-8 grid items-start gap-8 lg:grid-cols-[1fr_22rem]"
    >
      <div className="flex flex-col gap-6">
        <ol className="flex items-center gap-3" aria-label="Avanzamento">
          {STEPS.map((step, index) => (
            <li key={step} className="flex items-center gap-3">
              <span className="flex items-center gap-2">
                <span
                  className={cn(
                    "tabular gd-display inline-flex size-6 items-center justify-center rounded-full text-[0.6875rem] font-bold",
                    index <= 1 ? "bg-lime text-graphite" : "bg-grey-200 text-grey-600",
                  )}
                >
                  {index + 1}
                </span>
                <span className={cn("gd-display text-[0.6875rem] font-bold tracking-wider", index <= 1 ? "text-graphite" : "text-grey-600")}>
                  {step}
                </span>
              </span>
              {index < STEPS.length - 1 ? <span className="h-px w-6 bg-grey-300" aria-hidden="true" /> : null}
            </li>
          ))}
        </ol>

        {quote.notice ? (
          <p
            data-testid="checkout-notice"
            className="flex items-start gap-2 rounded-xl border border-soldout/30 bg-soldout-bg p-4 text-small text-graphite"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-soldout" aria-hidden="true" />
            {quote.notice}
          </p>
        ) : null}

        <fieldset className="gd-glass-panel rounded-[--radius-glass] p-5">
          <legend className="gd-display px-1 text-small font-bold tracking-wider text-graphite">Contatti</legend>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Email" htmlFor="email" error={errors.email?.message} className="sm:col-span-2">
              <TextInput
                id="email"
                type="email"
                autoComplete="email"
                placeholder="mario.rossi@email.it"
                hasError={Boolean(errors.email)}
                {...register("email", {
                  validate: (v) => checkoutSchema.shape.email.safeParse(v).success || "Inserisci un indirizzo email valido.",
                })}
              />
            </Field>
            <Field label="Telefono" htmlFor="phone" error={errors.phone?.message} className="sm:col-span-2">
              <TextInput
                id="phone"
                type="tel"
                autoComplete="tel"
                placeholder="+39 333 1234567"
                hasError={Boolean(errors.phone)}
                {...register("phone", {
                  validate: (v) => checkoutSchema.shape.phone.safeParse(v).success || "Inserisci un numero di telefono valido.",
                })}
              />
            </Field>
          </div>
        </fieldset>

        <fieldset className="gd-glass-panel rounded-[--radius-glass] p-5">
          <legend className="gd-display px-1 text-small font-bold tracking-wider text-graphite">Spedizione</legend>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Nome" htmlFor="firstName" error={errors.firstName?.message}>
              <TextInput
                id="firstName"
                autoComplete="given-name"
                hasError={Boolean(errors.firstName)}
                {...register("firstName", { validate: (v) => checkoutSchema.shape.firstName.safeParse(v).success || "Inserisci il nome." })}
              />
            </Field>
            <Field label="Cognome" htmlFor="lastName" error={errors.lastName?.message}>
              <TextInput
                id="lastName"
                autoComplete="family-name"
                hasError={Boolean(errors.lastName)}
                {...register("lastName", { validate: (v) => checkoutSchema.shape.lastName.safeParse(v).success || "Inserisci il cognome." })}
              />
            </Field>
            <Field label="Indirizzo" htmlFor="address" error={errors.address?.message} className="sm:col-span-2">
              <TextInput
                id="address"
                autoComplete="street-address"
                placeholder="Via Roma 1"
                hasError={Boolean(errors.address)}
                {...register("address", { validate: (v) => checkoutSchema.shape.address.safeParse(v).success || "Inserisci l'indirizzo." })}
              />
            </Field>
            <Field label="Città" htmlFor="city" error={errors.city?.message}>
              <TextInput
                id="city"
                autoComplete="address-level2"
                hasError={Boolean(errors.city)}
                {...register("city", { validate: (v) => checkoutSchema.shape.city.safeParse(v).success || "Inserisci la città." })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="CAP" htmlFor="postalCode" error={errors.postalCode?.message}>
                <TextInput
                  id="postalCode"
                  inputMode="numeric"
                  autoComplete="postal-code"
                  placeholder="20121"
                  hasError={Boolean(errors.postalCode)}
                  {...register("postalCode", {
                    validate: (v) => checkoutSchema.shape.postalCode.safeParse(v).success || "Il CAP deve essere di 5 cifre.",
                  })}
                />
              </Field>
              <Field label="Provincia" htmlFor="province" error={errors.province?.message}>
                <TextInput
                  id="province"
                  maxLength={2}
                  placeholder="MI"
                  hasError={Boolean(errors.province)}
                  className="uppercase"
                  {...register("province", {
                    validate: (v) => checkoutSchema.shape.province.safeParse(v).success || "Usa la sigla di 2 lettere (es. MI).",
                  })}
                />
              </Field>
            </div>
          </div>

          {/* Only the options the backend currently sells. */}
          <div className="mt-5 grid gap-3 sm:grid-cols-2" data-testid="shipping-options">
            {quote.shippingOptions.length === 0 ? (
              <p className="text-small text-grey-600 sm:col-span-2">
                Nessun metodo di spedizione è attivo in questo momento.
              </p>
            ) : (
              quote.shippingOptions.map((option) => (
                <label
                  key={option.code}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-xl border p-3.5 transition-colors",
                    activeShipping === option.code ? "border-violet bg-violet-tint" : "border-grey-300 hover:border-grey-400",
                  )}
                >
                  <input
                    type="radio"
                    value={option.code}
                    defaultChecked={option.code === quote.shippingCode}
                    className="size-4 accent-violet"
                    {...register("shippingMethod")}
                  />
                  <span className="flex-1">
                    <span className="gd-display block text-small font-bold tracking-wider text-graphite">{option.label}</span>
                    {option.hint ? <span className="block text-[0.6875rem] text-grey-600">{option.hint}</span> : null}
                  </span>
                  <span className="tabular text-small font-semibold text-graphite">
                    {option.price.amount === 0 ? "Gratis" : formatPrice(option.price)}
                  </span>
                </label>
              ))
            )}
          </div>
        </fieldset>

        <fieldset className="gd-glass-panel rounded-[--radius-glass] p-5">
          <legend className="gd-display px-1 text-small font-bold tracking-wider text-graphite">Pagamento</legend>
          {/* No gateway is integrated. Offering card, PayPal or Klarna here would be a
              promise the backend cannot keep. */}
          <p className="mt-4 flex items-start gap-2 text-small text-grey-600" data-testid="payment-notice">
            <Info className="mt-0.5 size-4 shrink-0 text-violet" aria-hidden="true" />
            Nessun pagamento online è attivo. Confermando registri l&apos;ordine: non viene
            richiesto né addebitato alcun importo e non raccogliamo dati di pagamento.
          </p>

          <Field label="Note per il corriere (facoltativo)" htmlFor="notes" error={errors.notes?.message} className="mt-4">
            <textarea
              id="notes"
              rows={3}
              className={cn(inputClass(Boolean(errors.notes)), "h-auto py-2.5")}
              {...register("notes")}
            />
          </Field>
        </fieldset>
      </div>

      <aside data-testid="checkout-summary" className="gd-glass-panel sticky top-28 flex flex-col gap-4 rounded-[--radius-glass] p-5">
        <h2 className="gd-display text-small font-bold tracking-wider text-graphite">Il tuo ordine</h2>

        <ul className="flex flex-col gap-3">
          {quote.lines.map((line) => (
            <li key={line.slug} className="flex items-center gap-3">
              {line.image ? (
                <span className="relative shrink-0">
                  <Image src={line.image.src} alt="" aria-hidden="true" width={line.image.width} height={line.image.height} sizes="48px" className="size-12 object-contain" />
                  <span className="tabular absolute -right-1 -top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-graphite px-1 text-[0.5625rem] font-bold leading-4 text-white">
                    {line.quantity}
                  </span>
                </span>
              ) : null}
              <span className="min-w-0 flex-1 truncate text-small text-grey-600">{line.name}</span>
              <span className="tabular shrink-0 text-small font-semibold text-graphite">
                {formatPrice(line.lineTotal)}
              </span>
            </li>
          ))}
        </ul>

        <div className="border-t border-grey-200 pt-4">
          <CartTotalsPanel totals={quote.totals} />
        </div>

        {failure ? (
          <p role="alert" data-testid="checkout-error" className="rounded-xl border border-soldout/30 bg-soldout-bg p-3 text-small text-graphite">
            {failure}
          </p>
        ) : null}

        <Button type="submit" variant="primary" size="lg" fullWidth disabled={pending || blocked} data-testid="place-order">
          {pending ? "Registrazione..." : "Conferma ordine"}
          {!pending ? <ArrowRight className="size-4" aria-hidden="true" /> : null}
        </Button>
      </aside>
    </form>
  );
}
