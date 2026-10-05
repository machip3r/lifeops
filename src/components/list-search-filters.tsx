'use client';

import type { FormEvent, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';

type Props = {
  /** Draft search text (not applied until Buscar). */
  value: string;
  onChange: (value: string) => void;
  /** Apply search (Enter or Buscar). */
  onSubmit: () => void;
  placeholder?: string;
  label?: string;
  id?: string;
  className?: string;
  /** Primary create action (Nuevo cliente / Invitar asesor), rendered after Buscar. */
  actions?: ReactNode;
  searchLabel?: string;
};

/**
 * Shared list filter bar for Asesores / Clientes.
 * Search runs only on submit — not on every keystroke.
 */
export function ListSearchFilters({
  value,
  onChange,
  onSubmit,
  placeholder = 'Buscar…',
  label = 'Buscar',
  id = 'list-search',
  className,
  actions,
  searchLabel = 'Buscar',
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
        'p-4 border-b border-gray-200 dark:border-gray-700 flex flex-wrap gap-3 items-end'
      }
    >
      <FormField
        label={label}
        htmlFor={id}
        variant="auth"
        className="flex-1 min-w-[200px] space-y-1"
      >
        <Input
          id={id}
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="bg-white dark:bg-gray-900"
        />
      </FormField>
      <Button type="submit" variant="outline" size="lg">
        {searchLabel}
      </Button>
      {actions}
    </form>
  );
}
