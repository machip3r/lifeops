'use client';

import { useEffect, useId, useState } from 'react';
import { Calendar } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { isoToDdMmYyyy, parseFlexibleDateToIso } from '@/lib/format/date';

type DateInputProps = {
  id?: string;
  name?: string;
  /** ISO YYYY-MM-DD */
  value: string;
  onChange: (iso: string) => void;
  max?: string;
  min?: string;
  required?: boolean;
  'aria-label'?: string;
  'aria-invalid'?: boolean;
  className?: string;
  /** Enter / Tab → next date; Shift+Tab → previous. */
  onAdvance?: (direction: 'next' | 'prev') => void;
};

function clampIso(iso: string, min?: string, max?: string): string {
  let out = iso;
  if (min && out < min) out = min;
  if (max && out > max) out = max;
  return out;
}

/** Digits only → DD/MM/AAAA with automatic slashes. */
export function maskDateDigits(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function digitsFromMasked(masked: string): string {
  return masked.replace(/\D/g, '').slice(0, 8);
}

/**
 * Keyboard-first date field (DD/MM/AAAA): digits only, auto "/", calendar picker.
 * Tab/Enter advance via onAdvance when provided.
 */
export function DateInput({
  id,
  name,
  value,
  onChange,
  max,
  min,
  required,
  className,
  onAdvance,
  'aria-label': ariaLabel,
  'aria-invalid': ariaInvalid,
}: DateInputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const [text, setText] = useState(() => (value ? isoToDdMmYyyy(value) : ''));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (focused) return;
    setText(value ? isoToDdMmYyyy(value) : '');
  }, [value, focused]);

  const commitMasked = (masked: string) => {
    const digits = digitsFromMasked(masked);
    if (digits.length === 0) {
      onChange('');
      setText('');
      return;
    }
    if (digits.length < 8) {
      if (value) onChange('');
      setText(maskDateDigits(digits));
      return;
    }
    const iso = parseFlexibleDateToIso(maskDateDigits(digits));
    if (!iso) {
      setText(value ? isoToDdMmYyyy(value) : '');
      if (value) onChange(value);
      return;
    }
    const next = clampIso(iso, min, max);
    onChange(next);
    setText(isoToDdMmYyyy(next));
  };

  const applyDigits = (digits: string) => {
    const masked = maskDateDigits(digits);
    setText(masked);
    if (digits.length === 8) {
      const iso = parseFlexibleDateToIso(masked);
      if (iso) {
        const next = clampIso(iso, min, max);
        onChange(next);
        setText(isoToDdMmYyyy(next));
      }
    } else if (value) {
      onChange('');
    }
  };

  return (
    <div className={cn('relative flex min-w-[10rem] items-center', className)}>
      <Input
        id={inputId}
        name={name}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="DD/MM/AAAA"
        value={text}
        required={required}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid}
        maxLength={10}
        className="h-10 pr-10 font-mono text-sm tabular-nums"
        onFocus={() => setFocused(true)}
        onChange={(e) => {
          applyDigits(digitsFromMasked(e.target.value));
        }}
        onBlur={() => {
          setFocused(false);
          commitMasked(text);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commitMasked(text);
            onAdvance?.('next');
            return;
          }

          if (e.key === 'Tab' && onAdvance) {
            e.preventDefault();
            commitMasked(text);
            onAdvance(e.shiftKey ? 'prev' : 'next');
            return;
          }

          const allow =
            e.key === 'Backspace' ||
            e.key === 'Delete' ||
            e.key === 'Tab' ||
            e.key === 'Escape' ||
            e.key === 'ArrowLeft' ||
            e.key === 'ArrowRight' ||
            e.key === 'ArrowUp' ||
            e.key === 'ArrowDown' ||
            e.key === 'Home' ||
            e.key === 'End' ||
            e.metaKey ||
            e.ctrlKey ||
            e.altKey;

          if (allow) return;

          if (!/^\d$/.test(e.key)) {
            e.preventDefault();
          }
        }}
        onPaste={(e) => {
          e.preventDefault();
          const pasted = e.clipboardData.getData('text');
          applyDigits(digitsFromMasked(pasted));
        }}
      />
      <span
        className="pointer-events-none absolute right-2.5 text-[var(--lifeops-muted)]"
        aria-hidden
      >
        <Calendar className="h-4 w-4" strokeWidth={1.75} />
      </span>
      <input
        type="date"
        tabIndex={-1}
        aria-label={ariaLabel ? `${ariaLabel} (calendario)` : 'Abrir calendario'}
        className="absolute right-0 top-0 h-full w-10 cursor-pointer opacity-0"
        value={value || ''}
        max={max}
        min={min}
        onChange={(e) => {
          const iso = e.target.value;
          onChange(iso);
          setText(iso ? isoToDdMmYyyy(iso) : '');
        }}
      />
    </div>
  );
}
