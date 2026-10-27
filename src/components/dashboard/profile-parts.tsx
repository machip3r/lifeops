import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Two-letter avatar from a name ("Promotoría Rivera" → "PR"). */
function initialsOf(name: string | null | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase() || 'LO';
}

export function ProfileAvatar({ name }: { name: string | null | undefined }) {
  return (
    <span
      aria-hidden
      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#FBDBAC] text-lg font-semibold text-[#1a1d24]"
    >
      {initialsOf(name)}
    </span>
  );
}

/** Small "Editar" action for a card header (opens that section's dialog). */
export function EditButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button type="button" variant="outline" size="sm" onClick={onClick} aria-label={label}>
      <Pencil className="h-3.5 w-3.5" aria-hidden />
      Editar
    </Button>
  );
}
