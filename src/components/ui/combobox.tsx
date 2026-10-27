'use client';

import { useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LIMITS } from '@/lib/validation/schemas';

export type ComboboxOption = {
  value: string;
  label: string;
  /** Second line (clave, RFC…) — also searchable */
  description?: string;
};

/** Results shown at once; typing narrows long lists (clientes, asesores). */
const MAX_RESULTS = 50;

const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/**
 * Searchable select (ARIA combobox + listbox): type to filter, arrows to move, Enter to pick,
 * Esc to close. Use instead of `Select` for long lists. Same chrome as `Input`.
 */
export function Combobox({
  id,
  options,
  value,
  onChange,
  placeholder = 'Escribe para buscar…',
  emptyText = 'Sin resultados.',
  disabled,
  className,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
}: {
  id?: string;
  options: ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const selected = options.find((o) => o.value === value) ?? null;

  const { results, hiddenCount } = useMemo(() => {
    const q = fold(query.trim());
    const matches = q ? options.filter((o) => fold(`${o.label} ${o.description ?? ''}`).includes(q)) : options;
    return { results: matches.slice(0, MAX_RESULTS), hiddenCount: Math.max(0, matches.length - MAX_RESULTS) };
  }, [options, query]);

  const openList = () => {
    if (disabled) return;
    setOpen(true);
    setActive(Math.max(0, results.findIndex((o) => o.value === value)));
  };

  const pick = (option: ComboboxOption) => {
    onChange(option.value);
    setQuery('');
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) openList();
      else setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      if (open && results[active]) {
        e.preventDefault();
        pick(results[active]);
      }
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        setOpen(false);
        setQuery('');
      }
    }
  };

  const activeId = open && results[active] ? `${listId}-${active}` : undefined;

  return (
    <div className={cn('relative', className)}>
      <div
        className={cn(
          'flex h-12 w-full items-center rounded-lg border border-(--lifeops-field-border) bg-(--lifeops-field) shadow-xs shadow-black/5 transition-colors hover:border-(--lifeops-field-border-hover) focus-within:border-(--lifeops-accent) focus-within:ring-3 focus-within:ring-[#FBDBAC]/30',
          ariaInvalid && 'border-destructive',
          disabled && 'opacity-50',
        )}
      >
        <Search className="ml-3 h-4 w-4 shrink-0 text-(--lifeops-muted)" aria-hidden />
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          aria-invalid={ariaInvalid}
          aria-describedby={ariaDescribedBy}
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          maxLength={LIMITS.search}
          value={open ? query : selected?.label ?? ''}
          placeholder={selected && open ? selected.label : placeholder}
          onFocus={openList}
          onClick={openList}
          onBlur={() => {
            setOpen(false);
            setQuery('');
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            if (!open) setOpen(true);
          }}
          onKeyDown={onKeyDown}
          className="h-full min-w-0 flex-1 bg-transparent px-2.5 text-base text-(--lifeops-fg) outline-none placeholder:text-(--lifeops-muted) disabled:cursor-not-allowed md:text-sm"
        />
        {selected && !disabled ? (
          <button
            type="button"
            aria-label="Quitar selección"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onChange('');
              inputRef.current?.focus();
            }}
            className="cursor-pointer rounded p-1 text-(--lifeops-muted) hover:text-(--lifeops-fg) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FBDBAC]"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
        <ChevronDown className="mr-3 ml-1 h-4 w-4 shrink-0 text-(--lifeops-muted)" aria-hidden />
      </div>

      {open ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-(--lifeops-field-border) bg-(--lifeops-chrome) py-1 shadow-xl"
        >
          {results.length === 0 ? (
            <li className="px-3 py-2.5 text-sm text-(--lifeops-muted)">{emptyText}</li>
          ) : (
            results.map((option, i) => {
              const isSelected = option.value === value;
              return (
                <li
                  key={option.value}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={isSelected}
                  // Keep focus in the input so blur does not close before the click
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(option)}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 px-3 py-2 text-sm',
                    i === active ? 'bg-(--lifeops-hover)' : '',
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-(--lifeops-fg)">{option.label}</span>
                    {option.description ? (
                      <span className="block truncate text-xs text-(--lifeops-muted)">{option.description}</span>
                    ) : null}
                  </span>
                  {isSelected ? <Check className="h-4 w-4 shrink-0 text-(--lifeops-accent)" aria-hidden /> : null}
                </li>
              );
            })
          )}
          {hiddenCount > 0 ? (
            <li className="border-t border-(--lifeops-border) px-3 py-2 text-xs text-(--lifeops-muted)">
              {hiddenCount} más; escribe para encontrar el tuyo.
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
