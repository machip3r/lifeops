'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/contexts/theme-context';
import { cn } from '@/lib/utils';

type ThemeToggleProps = {
  className?: string;
  showLabel?: boolean;
  labelClassName?: string;
};

export function ThemeToggle({
  className,
  showLabel = false,
  labelClassName,
}: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={cn(
        'inline-flex cursor-pointer items-center justify-center p-2 transition-colors',
        'text-(--lifeops-muted) hover:bg-[var(--lifeops-hover)] hover:text-[var(--lifeops-fg)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FBDBAC]',
        className
      )}
      aria-label={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      title={isDark ? 'Modo claro' : 'Modo oscuro'}
    >
      {isDark ? (
        <Sun className="h-5 w-5 shrink-0" strokeWidth={1.75} aria-hidden />
      ) : (
        <Moon className="h-5 w-5 shrink-0" strokeWidth={1.75} aria-hidden />
      )}
      {showLabel ? (
        <span className={cn('truncate', labelClassName)}>
          {isDark ? 'Claro' : 'Oscuro'}
        </span>
      ) : null}
    </button>
  );
}
