'use client';

import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { PendingDocument } from '@/lib/documents/upload';
import { LIMITS } from '@/lib/validation/schemas';

const fieldControlClass =
  'h-9 w-full rounded-md border border-[#3a4049] bg-[#1a1d23] text-white px-2.5 text-sm placeholder:text-[#6b7280] focus-visible:border-[#FBDBAC] focus-visible:ring-2 focus-visible:ring-[#FBDBAC]/40 disabled:opacity-50';

type Props = {
  documents: PendingDocument[];
  onChange: (documents: PendingDocument[]) => void;
  errors?: Record<string, string>;
  disabled?: boolean;
};

function newLocalId() {
  return `doc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function DocumentAttachmentsField({
  documents,
  onChange,
  errors,
  disabled,
}: Props) {
  const addDocument = () => {
    onChange([
      ...documents,
      { localId: newLocalId(), file: null, displayName: '' },
    ]);
  };

  const updateDoc = (localId: string, patch: Partial<PendingDocument>) => {
    onChange(
      documents.map((doc) => (doc.localId === localId ? { ...doc, ...patch } : doc)),
    );
  };

  const removeDoc = (localId: string) => {
    onChange(documents.filter((doc) => doc.localId !== localId));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-[#9ca3af]">Documentos</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addDocument}
          disabled={disabled}
          className="border-[#3a4049] bg-transparent text-[#FBDBAC] hover:bg-[#FBDBAC]/10 hover:text-[#FBDBAC]"
        >
          Agregar documento
        </Button>
      </div>

      {documents.length === 0 ? (
        <p className="text-xs text-[#6b7280]">
          Opcional. Agrega documentos y asígnales un nombre; se subirán al enviar la solicitud.
        </p>
      ) : (
        <ul className="space-y-3">
          {documents.map((doc, index) => (
            <li
              key={doc.localId}
              className="space-y-2 rounded-lg border border-[#3a4049] bg-[#1a1d23] p-3"
            >
              <FormField
                label="Archivo"
                htmlFor={`doc-file-${doc.localId}`}
                error={errors?.[`documents.${index}.file`] || errors?.[`${doc.localId}.file`]}
              >
                <Input
                  id={`doc-file-${doc.localId}`}
                  type="file"
                  disabled={disabled}
                  className={fieldControlClass}
                  accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx,application/pdf,image/jpeg,image/png"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const suggested =
                      doc.displayName.trim() ||
                      file.name.replace(/\.[^.]+$/, '').slice(0, LIMITS.documentDisplayName);
                    updateDoc(doc.localId, {
                      file,
                      displayName: suggested,
                    });
                  }}
                />
              </FormField>
              <FormField
                label="Nombre del documento"
                htmlFor={`doc-name-${doc.localId}`}
                error={
                  errors?.[`documents.${index}.displayName`] ||
                  errors?.[`${doc.localId}.displayName`]
                }
              >
                <Input
                  id={`doc-name-${doc.localId}`}
                  value={doc.displayName}
                  maxLength={LIMITS.documentDisplayName}
                  disabled={disabled}
                  className={fieldControlClass}
                  placeholder="Ej. Identificación, Solicitud firmada"
                  onChange={(e) =>
                    updateDoc(doc.localId, { displayName: e.target.value })
                  }
                />
              </FormField>
              {doc.file && (
                <p className="truncate text-xs text-[#6b7280]">
                  {doc.file.name} ({Math.round(doc.file.size / 1024)} KB)
                </p>
              )}
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  className="text-[#9ca3af] hover:bg-transparent hover:text-red-400"
                  onClick={() => removeDoc(doc.localId)}
                >
                  Quitar
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
