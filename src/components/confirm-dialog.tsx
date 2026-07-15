"use client";

import { useEffect, useId } from "react";
import { Button } from "@/components/ui/button";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  loadingLabel?: string;
  confirmVariant?: "destructive" | "default";
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Accessible confirmation modal (replaces window.confirm for product flows).
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  loadingLabel = "Procesando…",
  confirmVariant = "destructive",
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, loading, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onClick={() => {
        if (!loading) onCancel();
      }}
    >
      <div
        className="w-full max-w-md rounded-lg border border-[#2a2f38] bg-[#242830] p-5 shadow-xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 id={titleId} className="text-lg font-semibold text-white">
            {title}
          </h2>
          <p id={descriptionId} className="text-sm text-[#9ca3af] mt-2 whitespace-pre-line">
            {description}
          </p>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={onCancel}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={confirmVariant}
            disabled={loading}
            onClick={onConfirm}
          >
            {loading ? loadingLabel : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
