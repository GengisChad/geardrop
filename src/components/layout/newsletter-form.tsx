"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

const schema = z.object({
  email: z.email({ message: "Inserisci un indirizzo email valido." }),
});

type NewsletterValues = z.infer<typeof schema>;

export function NewsletterForm({ className }: { className?: string }) {
  const [done, setDone] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<NewsletterValues>({ mode: "onSubmit" });

  if (done) {
    return (
      <p className={cn("flex items-center gap-2 text-small text-lime", className)} data-testid="newsletter-success">
        <Check className="size-4" aria-hidden="true" />
        Iscrizione registrata. Benvenuto nel drop.
      </p>
    );
  }

  return (
    <form
      noValidate
      className={cn("flex flex-col gap-2", className)}
      onSubmit={handleSubmit(async (values) => {
        const parsed = schema.safeParse(values);
        if (!parsed.success) return;
        // No newsletter backend exists yet; the provider swap is where this would post.
        await new Promise((resolve) => setTimeout(resolve, 350));
        setDone(true);
      })}
    >
      <div className="flex gap-2">
        <label className="sr-only" htmlFor="newsletter-email">
          La tua email
        </label>
        <input
          id="newsletter-email"
          type="email"
          placeholder="La tua email"
          data-testid="newsletter-email"
          aria-invalid={errors.email ? "true" : "false"}
          aria-describedby={errors.email ? "newsletter-error" : undefined}
          {...register("email", {
            validate: (value) => schema.shape.email.safeParse(value).success || "Inserisci un indirizzo email valido.",
          })}
          className={cn(
            "h-11 min-w-0 flex-1 rounded-full border bg-white/5 px-4 text-small text-white placeholder:text-grey-400",
            "focus:outline-none focus:ring-2 focus:ring-lime",
            errors.email ? "border-soldout-solid" : "border-white/20",
          )}
        />
        <Button type="submit" variant="primary" size="md" disabled={isSubmitting}>
          {isSubmitting ? "Invio..." : "Iscriviti"}
        </Button>
      </div>
      {errors.email ? (
        <p id="newsletter-error" role="alert" className="text-small text-soldout-solid">
          {errors.email.message}
        </p>
      ) : null}
    </form>
  );
}
