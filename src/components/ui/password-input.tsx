"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Props = Omit<React.ComponentProps<"input">, "type"> & {
  /** Controlled visibility (share across password + confirm). */
  visible?: boolean;
  onVisibleChange?: (visible: boolean) => void;
};

/**
 * Password field with show/hide control (ojo).
 * Supports controlled visibility so invite confirm can stay in sync.
 */
export function PasswordInput({
  className,
  visible: visibleProp,
  onVisibleChange,
  ...props
}: Props) {
  const [uncontrolledVisible, setUncontrolledVisible] = React.useState(false);
  const visible = visibleProp ?? uncontrolledVisible;
  const id = props.id ?? "password";

  const setVisible = (next: boolean) => {
    if (visibleProp === undefined) {
      setUncontrolledVisible(next);
    }
    onVisibleChange?.(next);
  };

  return (
    <div className="relative w-full">
      <Input
        {...props}
        id={id}
        type={visible ? "text" : "password"}
        className={cn("pr-11", className)}
      />
      <button
        type="button"
        onMouseDown={(e) => {
          // Keep focus on the field; avoid click being swallowed by focus change.
          e.preventDefault();
        }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setVisible(!visible);
        }}
        className="absolute inset-y-0 right-0 z-10 flex items-center px-3 text-[#9ca3af] hover:text-[#FBDBAC] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FBDBAC] rounded-r-lg"
        aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
        aria-pressed={visible}
        tabIndex={0}
      >
        {visible ? (
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
            />
          </svg>
        ) : (
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
            />
          </svg>
        )}
      </button>
    </div>
  );
}
