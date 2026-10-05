'use client';

import { PROJECT_NAME_OPTIONS } from '@/lib/contracts/project-names';
import { FormField } from '@/components/ui/form-field';
import { cn } from '@/lib/utils';

const selectClassName =
  'h-9 w-full rounded-md border border-[#3a4049] bg-[#1a1d23] text-white px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#FBDBAC] disabled:opacity-50';

type Props = {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
  id?: string;
  label?: string;
  className?: string;
};

/** Project name select matching cobranza / proyección canonical options. */
export function ProjectNameSelectField({
  value,
  onChange,
  error,
  disabled,
  id = 'project_name',
  label = 'Nombre del proyecto',
  className,
}: Props) {
  const known = new Set<string>(PROJECT_NAME_OPTIONS);
  const showLegacyOption = Boolean(value && !known.has(value));

  return (
    <FormField label={label} htmlFor={id} error={error}>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={cn(selectClassName, className)}
      >
        <option value="">Selecciona un proyecto</option>
        {showLegacyOption && <option value={value}>{value}</option>}
        {PROJECT_NAME_OPTIONS.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
    </FormField>
  );
}

export { selectClassName as dashboardSelectClassName };
