'use client';

import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Drop zone of Importar (commission HTML, Mina de Oro, plantilla): drag & drop, click or keyboard.
 * The caller checks the file types.
 */
export function ImportDropzone({
  label,
  hint,
  accept,
  multiple,
  disabled,
  onFiles,
}: {
  /** Accent part of "<label> o arrástralo aquí" */
  label: string;
  hint: string;
  accept: string;
  multiple?: boolean;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const take = (files: FileList | null | undefined) => {
    const list = Array.from(files ?? []);
    if (list.length > 0) onFiles(multiple ? list : list.slice(0, 1));
  };

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(e) => {
        if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (!disabled) take(e.dataTransfer.files);
      }}
      className={cn(
        'flex min-h-44 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-10 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FBDBAC]',
        dragging
          ? 'border-(--lifeops-accent) bg-(--lifeops-hover)/60'
          : 'border-(--lifeops-field-border-hover) bg-(--lifeops-field) hover:border-(--lifeops-accent)/70',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          take(e.target.files);
          e.target.value = '';
        }}
      />
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-(--lifeops-hover) text-(--lifeops-accent)">
        <Upload className="h-5 w-5" aria-hidden />
      </span>
      <span className="text-sm text-(--lifeops-fg)">
        <span className="font-medium text-(--lifeops-accent)">{label}</span> o arrástralo aquí
      </span>
      <span className="text-xs text-(--lifeops-muted)">{hint}</span>
    </div>
  );
}
