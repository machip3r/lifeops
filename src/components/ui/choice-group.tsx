"use client";

import { useId } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

type Option<T extends string> = { value: T; label: string };

type BaseProps<T extends string> = {
  legend: string;
  options: Array<Option<T>>;
  error?: string;
  hint?: string;
  disabled?: boolean;
  /** Columns from `sm` up (always one column on phones). Cards only. */
  columns?: 1 | 2 | 3;
  /** cards = full-width tiles; chips = compact wrapping pills (fast to scan and tap) */
  variant?: "cards" | "chips";
  className?: string;
};

type SingleProps<T extends string> = BaseProps<T> & {
  multiple?: false;
  value: T | null;
  onChange: (value: T) => void;
};

type MultipleProps<T extends string> = BaseProps<T> & {
  multiple: true;
  value: T[];
  onChange: (value: T[]) => void;
};

const COLUMNS = { 1: "", 2: "sm:grid-cols-2", 3: "sm:grid-cols-3" } as const;

/** Radio (single) or checkbox (multiple) options as tappable cards inside a fieldset. */
export function ChoiceGroup<T extends string>(props: SingleProps<T> | MultipleProps<T>) {
  const { legend, options, error, hint, disabled, columns = 2, variant = "cards", className } = props;
  const chips = variant === "chips";
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  const isChecked = (value: T) =>
    props.multiple ? props.value.includes(value) : props.value === value;

  const toggle = (value: T) => {
    if (props.multiple) {
      props.onChange(
        props.value.includes(value)
          ? props.value.filter((v) => v !== value)
          : [...props.value, value],
      );
    } else {
      props.onChange(value);
    }
  };

  return (
    <fieldset
      className={cn("flex flex-col gap-2", className)}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? errorId : hint ? hintId : undefined}
      disabled={disabled}
    >
      <legend className="mb-1 text-sm font-medium text-(--lifeops-fg)">{legend}</legend>
      {hint && !error ? (
        <p id={hintId} className="-mt-1 text-xs leading-snug text-muted-foreground">
          {hint}
        </p>
      ) : null}
      <div className={chips ? "flex flex-wrap gap-2" : cn("grid gap-2", COLUMNS[columns])}>
        {options.map((option) => {
          const checked = isChecked(option.value);
          return (
            <label
              key={option.value}
              className={cn(
                "flex cursor-pointer items-center text-sm text-(--lifeops-fg) transition-colors focus-within:ring-3 focus-within:ring-[#FBDBAC]/30",
                chips
                  ? "min-h-10 gap-2 rounded-full border px-4 py-1.5"
                  : "min-h-12 gap-3 rounded-lg border px-3 py-2.5",
                checked
                  ? "border-(--lifeops-accent) bg-(--lifeops-hover) font-medium shadow-[inset_0_0_0_1px_var(--lifeops-accent)]"
                  : "border-(--lifeops-field-border) bg-(--lifeops-field) hover:border-(--lifeops-field-border-hover) hover:bg-(--lifeops-hover)/40",
                disabled && "cursor-not-allowed opacity-60",
              )}
            >
              <input
                type={props.multiple ? "checkbox" : "radio"}
                name={id}
                value={option.value}
                checked={checked}
                onChange={() => toggle(option.value)}
                className={chips ? "sr-only" : "h-4 w-4 shrink-0 accent-[#FBDBAC]"}
              />
              {chips && checked ? <Check className="h-4 w-4 shrink-0 text-(--lifeops-accent)" aria-hidden /> : null}
              <span>{option.label}</span>
            </label>
          );
        })}
      </div>
      {error ? (
        <p id={errorId} className="text-sm font-medium text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
