"use client";

import { useEffect, useId } from "react";
import { AppDialog } from "@/components/ui/app-dialog";
import { Button } from "@/components/ui/button";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  loadingLabel?: string;
  confirmVariant?: "destructive" | "default" | "brand";
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

  return (
    <AppDialog
      open={open}
      title={title}
      onClose={onCancel}
      busy={loading}
      size="md"
    >
      <p id={descriptionId} className="text-sm text-[#9ca3af] whitespace-pre-line">
        {description}
      </p>
      <div className="flex justify-end gap-3 pt-1">
        <Button
          type="button"
          variant="outline"
          size="lg"
          disabled={loading}
          onClick={onCancel}
        >
          {cancelLabel}
        </Button>
        <Button
          type="button"
          variant={confirmVariant}
          size="lg"
          disabled={loading}
          onClick={onConfirm}
        >
          {loading ? loadingLabel : confirmLabel}
        </Button>
      </div>
    </AppDialog>
  );
}
