import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

type FieldProps = {
  label: string;
  error?: string | undefined;
  children: ReactNode;
  className?: string;
  htmlFor: string;
};

export function Field({ label, error, children, className, htmlFor }: FieldProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="gd-display text-[0.6875rem] font-bold tracking-wider text-grey-600">
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-[0.6875rem] text-soldout">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export const inputClass = (hasError: boolean) =>
  cn(
    "h-11 w-full rounded-xl border bg-white px-3.5 text-small text-graphite placeholder:text-grey-400",
    "transition-colors focus:outline-none",
    hasError ? "border-soldout focus:border-soldout" : "border-grey-300 focus:border-violet",
  );

export function TextInput({
  hasError = false,
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { hasError?: boolean }) {
  return <input className={cn(inputClass(hasError), className)} {...rest} />;
}
