'use client';

import type { FormEvent, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Props = {
  /** Draft search text (not applied until Buscar). */
  value: string;
  onChange: (value: string) => void;
  /** Apply search (Enter or Buscar). */
  onSubmit: () => void;
  placeholder?: string;
  id?: string;
  className?: string;
  /** Primary create action (Nuevo cliente / Invitar asesor), rendered after Buscar. */
  actions?: ReactNode;
  searchLabel?: string;
  /** Extra controls in the filter bar (e.g. range select). */
  extras?: ReactNode;
};

/**
 * Shared list filter bar for Asesores / Clientes / Pólizas / Cobranza.
 * Search runs only on submit — not on every keystroke.
 */
export function ListSearchFilters({
  value,
  onChange,
  onSubmit,
  placeholder = 'Buscar…',
  id = 'list-search',
  className,
  actions,
  searchLabel = 'Buscar',
  extras,
}: Props) {
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit();
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={
        className ??
        'flex flex-wrap items-end gap-3 border-b border-(--lifeops-border) p-4'
      }
    >
      <div className="min-w-[200px] flex-1">
        <Input
          id={id}
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder || 'Buscar'}
          className="bg-(--lifeops-page)"
        />
      </div>
      {extras}
      <Button type="submit" variant="outline" size="lg">
        {searchLabel}
      </Button>
      {actions}
    </form>
  );
}
