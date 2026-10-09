'use client';

import { useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { normalizeClientName } from '@/lib/clients/name-match';
import { LIMITS } from '@/lib/validation/schemas';

type Props = {
  value: string;
  disabled?: boolean;
  onCommit: (next: string) => void;
};

export function EditableClientName({ value, disabled = false, onCommit }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const cancelRef = useRef(false);

  if (!editing) {
    return (
      <button
        type="button"
        disabled={disabled || !value || value === '—'}
        className="max-w-full truncate text-left text-sm text-(--lifeops-fg) underline decoration-(--lifeops-border) underline-offset-2 hover:decoration-(--lifeops-accent) disabled:cursor-default disabled:no-underline disabled:text-(--lifeops-muted)"
        aria-label={value && value !== '—' ? `Editar cliente ${value}` : 'Sin cliente'}
        onClick={(event) => {
          event.stopPropagation();
          if (disabled || !value || value === '—') return;
          setDraft(value);
          setEditing(true);
        }}
      >
        {value}
      </button>
    );
  }

  return (
    <Input
      autoFocus
      value={draft}
      disabled={disabled}
      maxLength={LIMITS.entityName}
      aria-label={`Nombre del cliente ${value}`}
      className="h-10 min-w-[12rem]"
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => setDraft(event.target.value)}
      onFocus={(event) => event.currentTarget.select()}
      onBlur={() => {
        if (cancelRef.current) {
          cancelRef.current = false;
          return;
        }
        const next = normalizeClientName(draft);
        if (next && next !== value) onCommit(next);
        setEditing(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          event.currentTarget.blur();
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          cancelRef.current = true;
          setDraft(value);
          setEditing(false);
        }
      }}
    />
  );
}
