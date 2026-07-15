"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import type { Product } from "@/lib/commerce/types";
import { cn } from "@/lib/cn";

/**
 * Desktop shows tabs, mobile shows an accordion — the two PDP mockups differ here and
 * both are honoured, from one content source. (audit §6)
 */
export function ProductDetails({ product }: { product: Product }) {
  const panels = [
    { id: "descrizione", label: "Descrizione", content: <p className="leading-relaxed">{product.description}</p> },
    {
      id: "specifiche",
      label: "Specifiche",
      content: (
        <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {product.specs.map((spec) => (
            <div key={spec.label} className="flex justify-between gap-4 border-b border-grey-200 pb-2">
              <dt className="gd-display text-[0.6875rem] font-bold tracking-wider text-grey-600">{spec.label}</dt>
              <dd className="text-small font-medium text-graphite">{spec.value}</dd>
            </div>
          ))}
        </dl>
      ),
    },
    {
      id: "confezione",
      label: "Contenuto della confezione",
      content: (
        <ul className="flex flex-col gap-2">
          {product.boxContents.map((item) => (
            <li key={item} className="flex items-center gap-2.5 text-small">
              <span className="size-1.5 shrink-0 rounded-full bg-lime" aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
      ),
    },
    {
      id: "spedizione",
      label: "Spedizione e resi",
      content: (
        <div className="flex flex-col gap-2 leading-relaxed">
          <p>Spedizione veloce in 24/48h in tutta Italia. Spedizione gratuita per ordini superiori a 59€.</p>
          <p>Hai 30 giorni per cambiare idea: il reso è semplice e tracciato.</p>
        </div>
      ),
    },
  ];

  const [active, setActive] = useState(panels[0]?.id ?? "");

  return (
    <section className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6">
      {/* Desktop: tabs */}
      <div className="hidden rounded-[--radius-card] border border-grey-200 bg-white lg:block">
        <div role="tablist" aria-label="Dettagli prodotto" className="flex border-b border-grey-200">
          {panels.map((panel) => (
            <button
              key={panel.id}
              role="tab"
              id={`tab-${panel.id}`}
              aria-selected={active === panel.id}
              aria-controls={`panel-${panel.id}`}
              onClick={() => setActive(panel.id)}
              className={cn(
                "gd-display relative px-6 py-4 text-small font-bold tracking-wider transition-colors",
                active === panel.id ? "text-graphite" : "text-grey-600 hover:text-graphite",
              )}
            >
              {panel.label}
              {active === panel.id ? (
                <motion.span layoutId="tab-underline" className="absolute inset-x-0 -bottom-px h-0.5 bg-lime" />
              ) : null}
            </button>
          ))}
        </div>

        {panels.map((panel) =>
          active === panel.id ? (
            <div
              key={panel.id}
              role="tabpanel"
              id={`panel-${panel.id}`}
              aria-labelledby={`tab-${panel.id}`}
              className="px-6 py-6 text-small text-grey-600"
            >
              {panel.content}
            </div>
          ) : null,
        )}
      </div>

      {/* Mobile: accordion */}
      <div className="flex flex-col gap-3 lg:hidden">
        {panels.map((panel) => (
          <AccordionItem key={panel.id} label={panel.label} content={panel.content} />
        ))}
      </div>
    </section>
  );
}

function AccordionItem({ label, content }: { label: string; content: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-[--radius-card] border border-grey-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left"
      >
        <span className="gd-display text-small font-bold tracking-wider text-graphite">{label}</span>
        <ChevronDown
          className={cn("size-5 shrink-0 text-violet transition-transform duration-300", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 text-small text-grey-600">{content}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
