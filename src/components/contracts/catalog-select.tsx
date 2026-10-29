'use client';

import type { ComponentProps } from 'react';
import { Select } from '@/components/ui/select';

/**
 * Select over an insurer catalog (clasificación, conducto de cobro, moneda). A stored value that is
 * not in the catalog (old import) stays selectable so editing never drops it silently.
 */
export function CatalogSelect({
  options,
  labels,
  value,
  onChange,
  emptyLabel,
  ...props
}: Omit<ComponentProps<typeof Select>, 'value' | 'onChange' | 'children'> & {
  options: readonly string[];
  labels: Record<string, string>;
  value: string;
  onChange: (value: string) => void;
  /** First option (empty value) */
  emptyLabel: string;
}) {
  const legacy = value && !options.includes(value) ? value : null;
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} {...props}>
      <option value="">{emptyLabel}</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {labels[option] ?? option}
        </option>
      ))}
      {legacy ? <option value={legacy}>{legacy}</option> : null}
    </Select>
  );
}
