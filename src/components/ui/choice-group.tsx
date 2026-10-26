"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

type Option<T extends string> = { value: T; label: string };

type BaseProps<T extends string> = {
  legend: string;
  options: Array<Option<T>>;
  error?: string;
  hint?: string;
  disabled?: boolean;
  /** Columns from `sm` up (always one column on phones). */
  columns?: 1 | 2 | 3;
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
  const { legend, options, error, hint, disabled, columns = 2, className } = props;
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
      <div className={cn("grid gap-2", COLUMNS[columns])}>
        {options.map((option) => {
          const checked = isChecked(option.value);
          return (
            <label
              key={option.value}
              className={cn(
                "flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border-2 px-3 py-2.5 text-sm text-(--lifeops-fg) transition-colors focus-within:ring-3 focus-within:ring-[#FBDBAC]/30",
                checked
                  ? "border-(--lifeops-accent) bg-(--lifeops-hover)"
                  : "border-(--lifeops-border) bg-(--lifeops-chrome) hover:bg-(--lifeops-hover)/60",
                disabled && "cursor-not-allowed opacity-60",
              )}
            >
              <input
                type={props.multiple ? "checkbox" : "radio"}
                name={id}
                value={option.value}
                checked={checked}
                onChange={() => toggle(option.value)}
                className="h-4 w-4 shrink-0 accent-[#FBDBAC]"
              />
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
