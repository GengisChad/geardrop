"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useForm, useWatch } from "react-hook-form";
import { ArrowRight, CheckCircle2, Lock } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, TextInput, inputClass } from "@/components/ui/field";
import { CartTotalsPanel } from "@/components/cart/cart-summary";
import { useCartDetails, type DetailedLine } from "@/lib/use-cart-details";
import { useCart } from "@/lib/store/cart";
import { formatPrice } from "@/lib/format";
import { PAYMENT_METHODS, SHIPPING_METHODS, checkoutSchema, type CheckoutValues } from "@/lib/checkout-schema";
import { track } from "@vercel/analytics";
import { PAYPAL_ME, paypalMeLink, whatsappLink } from "@/lib/payments";
import type { AppHref } from "@/lib/routes";
import { placeOrderAction, type CheckoutResult } from "./actions";
import { cn } from "@/lib/cn";

const STEPS = ["Carrello", "Spedizione", "Pagamento"] as const;

type PlacedOrder = Extract<CheckoutResult, { ok: true }>;

/**
 * Orders persist to Supabase only when the project keys are present. Without them GEAR//DROP
 * runs as a manual PayPal.Me shop: the order is built in the browser and handed to the
 * merchant by email (the only channel available without a backend), and the customer pays
 * via PayPal.Me. Flip automatically once a Supabase project is configured.
 */
const BACKEND_ORDERS = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);

/** Records a pre-order for traffic/demand analytics (Vercel, cookieless). */
function trackPreOrder(orderNumber: string, lines: readonly DetailedLine[], totalCents: number) {
  track("pre_order", { order: orderNumber, items: lines.length, total_eur: totalCents / 100 });
  for (const { product, quantity } of lines) {
    track("pre_order_item", { product: product.slug, name: product.name, quantity });
  }
}

/** Human, roughly-unique order reference for the manual flow (no DB sequence available). */
function makeOrderNumber(): string {
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  return `GD-${ymd}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

/**
 * Plain-text order summary the customer sends to the merchant on WhatsApp so the order can
 * be shipped — the only delivery channel while there is no backend.
 */
function buildOrderMessage(
  orderNumber: string,
  form: CheckoutValues,
  lines: readonly DetailedLine[],
  totals: PlacedOrder["totals"],
): string {
  const eur = (cents: number) => `${(cents / 100).toFixed(2)} €`;
  const shippingLabel = SHIPPING_METHODS.find((m) => m.value === form.shippingMethod)?.label ?? form.shippingMethod;
  return [
    `Ordine GEAR//DROP: ${orderNumber}`,
    "",
    "Prodotti:",
    ...lines.map(({ product, quantity, lineTotal }) => `- ${quantity}x ${product.name} — ${eur(lineTotal)}`),
    "",
    `Subtotale: ${eur(totals.subtotalCents)}`,
    `Spedizione (${shippingLabel}): ${eur(totals.shippingCents)}`,
    `Totale: ${eur(totals.totalCents)}`,
    "",
    "Spedizione a:",
    `${form.firstName} ${form.lastName}`,
    form.address,
    `${form.postalCode} ${form.city} (${form.province}) — Italia`,
    "",
    `Email: ${form.email}`,
    `Telefono: ${form.phone}`,
    ...(form.notes ? [`Note: ${form.notes}`] : []),
    "",
    `Pagamento: PayPal.Me (paypal.me/${PAYPAL_ME.handle}) — causale ${orderNumber}`,
  ].join("\n");
}

export function CheckoutClient() {
  const { lines, totals, hydrated } = useCartDetails();
  const clear = useCart((s) => s.clear);
  const [order, setOrder] = useState<PlacedOrder | null>(null);
  /** Set in the manual (no-backend) flow: the plain-text order summary for the merchant. */
  const [orderMessage, setOrderMessage] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  /**
   * One key per checkout session, not per submit: retrying after a network blip or a
   * double click sends the same key, and the RPC returns the order it already created
   * instead of taking the stock twice. State (not a ref) because the value is read inside
   * the submit handler, which the React Compiler treats as render-adjacent.
   */
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<CheckoutValues>({
    mode: "onBlur",
    defaultValues: { shippingMethod: "standard", paymentMethod: "paypalme" },
  });

  // useWatch rather than watch(): it subscribes at this component only, and unlike
  // watch() it can be memoized, so the React Compiler doesn't bail out on this file.
  const shippingMethod = useWatch({ control, name: "shippingMethod" });
  const surcharge = SHIPPING_METHODS.find((m) => m.value === shippingMethod)?.surcharge ?? 0;
  const grandTotal = totals.total.amount + surcharge;

  if (order) {
    const orderTotal = formatPrice({ amount: order.totals.totalCents, currency: "EUR" });
    // External URLs below are cast past Button's internal AppHref typing.
    const payLink = paypalMeLink(order.totals.totalCents) as AppHref | null;
    // Manual flow (no backend): link that hands the full order to the merchant on WhatsApp.
    const orderWhatsapp = orderMessage ? (whatsappLink(orderMessage) as AppHref) : null;
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        data-testid="order-confirmation"
        className="mx-auto mt-10 flex max-w-lg flex-col items-center rounded-[--radius-card] border border-available/30 bg-available-bg px-6 py-14 text-center"
      >
        <CheckCircle2 className="size-14 text-available" strokeWidth={1.5} aria-hidden="true" />
        <h2 className="mt-5 text-h2 font-bold text-graphite">Ordine registrato</h2>
        {/* No email provider exists yet, so this must not promise a confirmation email. */}
        <p className="mt-2 text-small text-grey-600">
          Grazie. Il tuo ordine <span className="gd-display font-bold text-graphite">{order.orderNumber}</span> è stato
          registrato per un totale di{" "}
          <span className="gd-display font-bold text-graphite">{orderTotal}</span>. Completa il pagamento su PayPal.Me
          indicando il numero d&apos;ordine{" "}
          <span className="gd-display font-bold text-graphite">{order.orderNumber}</span> nella causale.
        </p>
        {orderMessage ? (
          <p className="mt-2 text-[0.6875rem] text-grey-600">
            Per la spedizione inviaci il riepilogo con il tuo indirizzo su WhatsApp: il pulsante qui sotto apre il
            messaggio già compilato.
          </p>
        ) : null}
        <p className="mt-2 text-[0.6875rem] text-grey-600">
          Pre-ordine con pagamento anticipato: arrivo a destinazione massimo 14 giorni dalla conferma. Conserva il
          numero d&apos;ordine.
        </p>
        {payLink ? (
          <Button
            as="a"
            href={payLink}
            target="_blank"
            rel="noopener noreferrer"
            variant="primary"
            size="lg"
            className="mt-7"
          >
            Paga {orderTotal} con PayPal.Me
          </Button>
        ) : (
          <p className="mt-6 rounded-xl bg-white/70 px-4 py-3 text-[0.6875rem] text-grey-600">
            Ti inviamo a breve il link PayPal.Me per completare il pagamento.
          </p>
        )}
        {orderWhatsapp ? (
          <Button
            as="a"
            href={orderWhatsapp}
            target="_blank"
            rel="noopener noreferrer"
            variant="secondary"
            size="md"
            className="mt-3"
          >
            Invia l&apos;ordine su WhatsApp
          </Button>
        ) : null}
        <Button as={Link} href="/negozio" variant="text" size="md" className="mt-3">
          Continua ad acquistare
        </Button>
      </motion.div>
    );
  }

  if (!hydrated) return <div className="mt-8 h-96 animate-pulse rounded-[--radius-card] bg-grey-200" />;

  if (lines.length === 0) {
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

  return (
    <form
      noValidate
      data-testid="checkout-form"
      onSubmit={handleSubmit(async (values) => {
        setSubmitError(null);

        if (BACKEND_ORDERS) {
          // Only identifiers and quantities leave the browser: the server recomputes every
          // amount from the database. Nothing is charged and no card data is collected.
          const result = await placeOrderAction({
            items: lines.map(({ product, quantity }) => ({ slug: product.slug, quantity })),
            idempotencyKey,
            form: values,
          });

          if (!result.ok) {
            setSubmitError(result.error);
            return;
          }

          trackPreOrder(result.orderNumber, lines, result.totals.totalCents);
          setOrder(result);
          clear();
          return;
        }

        // Manual PayPal.Me flow (no backend): build the order in the browser so the customer
        // gets a confirmation and a pay link, and prepare the email that carries the full
        // order and shipping address to the merchant. Nothing is charged here.
        const manualOrder: PlacedOrder = {
          ok: true,
          orderNumber: makeOrderNumber(),
          totals: {
            subtotalCents: totals.subtotal.amount,
            discountCents: 0,
            shippingCents: totals.shipping.amount + surcharge,
            totalCents: grandTotal,
          },
        };

        trackPreOrder(manualOrder.orderNumber, lines, manualOrder.totals.totalCents);
        setOrderMessage(buildOrderMessage(manualOrder.orderNumber, values, lines, manualOrder.totals));
        setOrder(manualOrder);
        clear();
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

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {SHIPPING_METHODS.map((method) => (
              <label
                key={method.value}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-xl border p-3.5 transition-colors",
                  shippingMethod === method.value ? "border-violet bg-violet-tint" : "border-grey-300 hover:border-grey-400",
                )}
              >
                <input type="radio" value={method.value} className="size-4 accent-violet" {...register("shippingMethod")} />
                <span className="flex-1">
                  <span className="gd-display block text-small font-bold tracking-wider text-graphite">{method.label}</span>
                  <span className="block text-[0.6875rem] text-grey-600">{method.hint}</span>
                </span>
                <span className="tabular text-small font-semibold text-graphite">
                  {method.surcharge === 0 ? "Incluso" : `+${formatPrice({ amount: method.surcharge, currency: "EUR" })}`}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="gd-glass-panel rounded-[--radius-glass] p-5">
          <legend className="gd-display px-1 text-small font-bold tracking-wider text-graphite">Pagamento</legend>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {PAYMENT_METHODS.map((method) => (
              <label
                key={method.value}
                className="flex cursor-pointer items-center gap-3 rounded-xl border border-grey-300 p-3.5 transition-colors has-[:checked]:border-violet has-[:checked]:bg-violet-tint"
              >
                <input type="radio" value={method.value} className="size-4 accent-violet" {...register("paymentMethod")} />
                <span className="gd-display text-small font-bold tracking-wider text-graphite">{method.label}</span>
              </label>
            ))}
          </div>
          <p className="mt-4 flex items-center gap-2 text-[0.6875rem] text-grey-600">
            <Lock className="size-3.5 text-violet" aria-hidden="true" />
            Al momento accettiamo solo PayPal.Me. Dopo la conferma ti mostriamo il link per pagare l&apos;importo:
            indica il numero d&apos;ordine nella causale.
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

      <aside className="gd-glass-panel sticky top-28 flex flex-col gap-4 rounded-[--radius-glass] p-5">
        <h2 className="gd-display text-small font-bold tracking-wider text-graphite">Il tuo ordine</h2>

        <ul className="flex flex-col gap-3">
          {lines.map(({ product, quantity, lineTotal }) => {
            const image = product.images[0];
            return (
              <li key={product.slug} className="flex items-center gap-3">
                {image ? (
                  <span className="relative shrink-0">
                    <Image src={image.src} alt="" aria-hidden="true" width={image.width} height={image.height} sizes="48px" className="size-12 object-contain" />
                    <span className="tabular absolute -right-1 -top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-graphite px-1 text-[0.5625rem] font-bold leading-4 text-white">
                      {quantity}
                    </span>
                  </span>
                ) : null}
                <span className="min-w-0 flex-1 truncate text-small text-grey-600">{product.name}</span>
                <span className="tabular shrink-0 text-small font-semibold text-graphite">
                  {formatPrice({ amount: lineTotal, currency: "EUR" })}
                </span>
              </li>
            );
          })}
        </ul>

        <div className="border-t border-grey-200 pt-4">
          <CartTotalsPanel totals={{ ...totals, total: { amount: grandTotal, currency: "EUR" } }} />
        </div>

        {submitError ? (
          <p role="alert" className="rounded-xl bg-soldout/10 px-3.5 py-2.5 text-small text-soldout">
            {submitError}
          </p>
        ) : null}

        <Button type="submit" variant="primary" size="lg" fullWidth disabled={isSubmitting} data-testid="place-order">
          {isSubmitting ? "Elaborazione..." : "Conferma ordine"}
          {!isSubmitting ? <ArrowRight className="size-4" aria-hidden="true" /> : null}
        </Button>
      </aside>
    </form>
  );
}
