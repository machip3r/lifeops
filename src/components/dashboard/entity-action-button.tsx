'use client';

import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Expediente header action: same height, icon + label (Editar, Reasignar, Invitar, Eliminar…). */
export function EntityActionButton({
  icon: Icon,
  label,
  onClick,
  variant = 'outline',
  disabled,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  variant?: 'outline' | 'brand' | 'danger';
  disabled?: boolean;
}) {
  return (
    <Button type="button" variant={variant} size="default" onClick={onClick} disabled={disabled} className="h-10 gap-2 px-3.5">
      <Icon className="h-4 w-4" aria-hidden />
      {label}
    </Button>
  );
}
