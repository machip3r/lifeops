'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { FileText, UploadCloud, X } from 'lucide-react';
import { cn } from '@/lib/utils';

function sizeLabel(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Drop zone for one file (drag & drop, click or keyboard). Shows the chosen file with a
 * thumbnail for images. Type / size are checked again by the caller and the server.
 */
export function FileDropzone({
  id,
  file,
  onChange,
  accept,
  maxBytes,
  disabled,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
}: {
  id?: string;
  file: globalThis.File | null;
  onChange: (file: globalThis.File | null) => void;
  /** MIME types for the picker */
  accept: readonly string[];
  maxBytes: number;
  disabled?: boolean;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}) {
  const fallbackId = useId();
  const inputId = id ?? fallbackId;
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  // Free the thumbnail URL when it changes or the zone unmounts
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const choose = (next: globalThis.File | null) => {
    setPreview(next && next.type.startsWith('image/') ? URL.createObjectURL(next) : null);
    onChange(next);
    if (inputRef.current) inputRef.current.value = '';
  };

  const input = (
    <input
      ref={inputRef}
      id={inputId}
      type="file"
      accept={accept.join(',')}
      disabled={disabled}
      aria-invalid={ariaInvalid}
      aria-describedby={ariaDescribedBy}
      className="sr-only"
      onChange={(e) => choose(e.target.files?.[0] ?? null)}
    />
  );

  if (file) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-(--lifeops-field-border) bg-(--lifeops-field) p-3">
        {input}
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
          <img src={preview} alt="" className="h-14 w-14 shrink-0 rounded-md object-cover" />
        ) : (
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-(--lifeops-hover) text-(--lifeops-muted)">
            <FileText className="h-6 w-6" aria-hidden />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-(--lifeops-fg)">{file.name}</p>
          <p className={cn('text-xs', file.size > maxBytes ? 'text-destructive' : 'text-(--lifeops-muted)')}>
            {sizeLabel(file.size)}
            {file.size > maxBytes ? ` · supera el máximo de ${sizeLabel(maxBytes)}` : ''}
          </p>
          <label htmlFor={inputId} className="mt-1 inline-block cursor-pointer text-xs font-medium text-(--lifeops-accent) hover:underline">
            Cambiar archivo
          </label>
        </div>
        <button
          type="button"
          aria-label="Quitar archivo"
          disabled={disabled}
          onClick={() => choose(null)}
          className="cursor-pointer rounded-md p-1.5 text-(--lifeops-muted) hover:bg-(--lifeops-hover) hover:text-(--lifeops-fg) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FBDBAC]"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <label
      htmlFor={inputId}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (!disabled) choose(e.dataTransfer.files?.[0] ?? null);
      }}
      className={cn(
        'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-6 text-center transition-colors focus-within:ring-3 focus-within:ring-[#FBDBAC]/30',
        dragging
          ? 'border-(--lifeops-accent) bg-(--lifeops-hover)/60'
          : 'border-(--lifeops-field-border-hover) bg-(--lifeops-field) hover:border-(--lifeops-accent)/70 hover:bg-(--lifeops-hover)/30',
        ariaInvalid && 'border-destructive',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      {input}
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-(--lifeops-hover) text-(--lifeops-accent)">
        <UploadCloud className="h-5 w-5" aria-hidden />
      </span>
      <span className="text-sm text-(--lifeops-fg)">
        <span className="font-medium text-(--lifeops-accent)">Elige un archivo</span> o arrástralo aquí
      </span>
      <span className="text-xs text-(--lifeops-muted)">Foto o PDF del comprobante · máximo {sizeLabel(maxBytes)}</span>
    </label>
  );
}
