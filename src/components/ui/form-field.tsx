"use client";

import type { ReactElement, ReactNode } from "react";
import { Children, cloneElement, isValidElement, useId } from "react";

type Props = {
  label: string;
  htmlFor?: string;
  children: ReactNode;
  /** auth = stacked label above control; app = muted span inside wrapping label */
  variant?: "auth" | "app";
  className?: string;
  error?: string;
  /** Short clarification under the label */
  hint?: string;
};

function withA11y(
  children: ReactNode,
  opts: { errorId: string; invalid: boolean; hintId?: string },
): ReactNode {
  return Children.map(children, (child) => {
    if (!isValidElement(child)) return child;
    const el = child as ReactElement<{
      "aria-invalid"?: boolean;
      "aria-describedby"?: string;
      className?: string;
    }>;
    const describedBy = [
      el.props["aria-describedby"],
      opts.invalid ? opts.errorId : null,
      !opts.invalid ? opts.hintId : null,
    ]
      .filter(Boolean)
      .join(" ");
    return cloneElement(el, {
      "aria-invalid": opts.invalid || undefined,
      "aria-describedby": describedBy || undefined,
    });
  });
}

export function FormField({
  label,
  htmlFor,
  children,
  variant = "app",
  className = "",
  error,
  hint,
}: Props) {
  const reactId = useId();
  const errorId = `${reactId}-error`;
  const hintId = `${reactId}-hint`;
  const invalid = Boolean(error);
  const control = withA11y(children, {
    errorId,
    invalid,
    hintId: hint && !error ? hintId : undefined,
  });

  const hintNode =
    hint && !error ? (
      <p id={hintId} className="text-xs leading-snug text-muted-foreground">
        {hint}
      </p>
    ) : null;

  const errorNode = error ? (
    <p id={errorId} className="text-sm font-medium text-destructive" role="alert">
      {error}
    </p>
  ) : null;

  if (variant === "auth") {
    return (
      <div className={`flex flex-col gap-1.5 ${className}`.trim()}>
        <label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
          {label}
        </label>
        {hintNode}
        {control}
        {errorNode}
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-1 text-sm ${className}`.trim()}>
      <label htmlFor={htmlFor} className="flex flex-col gap-1">
        <span className="text-muted-foreground">{label}</span>
        {hintNode}
        {control}
      </label>
      {errorNode}
    </div>
  );
}
