'use client';

import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Icon button for the sticky actions column of list tables (row click keeps opening the expediente). */
function RowEditButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="h-8 w-8 p-0"
    >
      <Pencil className="h-3.5 w-3.5" aria-hidden />
    </Button>
  );
}

/** Row actions for list tables: edit only (deleting lives in each expediente). */
export function RowActions({ editLabel, onEdit }: { editLabel: string; onEdit: () => void }) {
  return (
    <div className="flex items-center justify-end">
      <RowEditButton label={editLabel} onClick={onEdit} />
    </div>
  );
}
