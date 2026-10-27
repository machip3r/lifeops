"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { filterDigits, formatMxPhone } from "@/lib/validation/input-filters";

type Props = Omit<React.ComponentProps<"input">, "value" | "onChange" | "type"> & {
  /** 10 digits (no country code) */
  value: string;
  onChange: (digits: string) => void;
};

/**
 * Mexican phone: fixed +52 prefix, digits only, shown as `+52 333 123 4567`.
 * Pasting `+52 33 1234-5678` keeps the last 10 digits.
 */
export function PhoneInput({ value, onChange, className, disabled, ...props }: Props) {
  return (
    <div
      className={cn(
        "flex h-12 w-full items-center rounded-lg border border-(--lifeops-field-border) bg-(--lifeops-field) shadow-xs shadow-black/5 transition-colors hover:border-(--lifeops-field-border-hover) focus-within:border-(--lifeops-accent) focus-within:ring-3 focus-within:ring-[#FBDBAC]/30 has-aria-invalid:border-destructive",
        disabled && "opacity-50",
        className,
      )}
    >
      <span className="border-r border-(--lifeops-field-border) px-3 text-base text-(--lifeops-muted) md:text-sm" aria-hidden>
        +52
      </span>
      <input
        {...props}
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        disabled={disabled}
        value={formatMxPhone(value)}
        placeholder="333 123 4567"
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "");
          // Pasted numbers may include the country code
          onChange(digits.length > 10 && digits.startsWith("52") ? digits.slice(-10) : filterDigits(digits, 10));
        }}
        className="h-full min-w-0 flex-1 bg-transparent px-3 text-base text-(--lifeops-fg) outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed md:text-sm"
      />
    </div>
  );
}
