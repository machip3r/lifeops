'use client';

import { cn } from '@/lib/utils';

/** Two or three mutually exclusive options as one pill (e.g. cliente existente / nuevo). */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  disabled,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  /** Accessible name of the group */
  label: string;
  disabled?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex rounded-full border border-(--lifeops-field-border) bg-(--lifeops-field) p-0.5"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              'cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FBDBAC] disabled:cursor-not-allowed disabled:opacity-50',
              active ? 'bg-[#FBDBAC] text-[#1a1d24]' : 'text-(--lifeops-muted) hover:text-(--lifeops-fg)',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
