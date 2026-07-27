'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Tag } from '@/lib/supabase';
import { db } from '@/lib/db';
import { LIMITS } from '@/lib/validation/schemas';
import { FormField } from '@/components/ui/form-field';
import { useToast } from '@/components/toast';

export function TagChips({
  tags,
  emptyLabel = 'Sin etiquetas',
  className = '',
}: {
  tags: Tag[];
  emptyLabel?: string;
  className?: string;
}) {
  if (!tags.length) {
    return (
      <span className={`text-xs text-gray-400 italic ${className}`}>{emptyLabel}</span>
    );
  }
  return (
    <div className={`flex flex-wrap gap-1 ${className}`}>
      {tags.map((tag) => (
        <span
          key={tag.id}
          className="inline-flex max-w-[140px] truncate px-2 py-0.5 text-xs font-medium rounded-full bg-[#FBDBAC]/20 text-[#FBDBAC] border border-[#FBDBAC]/30"
          title={tag.name}
        >
          {tag.name}
        </span>
      ))}
    </div>
  );
}

type EditorProps = {
  officeId: string;
  consultantId: string;
  initialTagIds: string[];
  onSaved: (tags: Tag[]) => void;
  onCancel: () => void;
};

export function ConsultantTagsEditor({
  officeId,
  consultantId,
  initialTagIds,
  onSaved,
  onCancel,
}: EditorProps) {
  const { toast } = useToast();
  const [officeTags, setOfficeTags] = useState<Tag[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>(initialTagIds);
  const [newName, setNewName] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);

  const loadTags = useCallback(async () => {
    try {
      const tags = await db.tag.listByOffice(officeId, 'consultant');
      setOfficeTags(tags);
    } catch (error) {
      console.error('Error loading tags:', error);
      toast.error('No se pudieron cargar las etiquetas.');
    } finally {
      setLoading(false);
    }
  }, [officeId, toast]);

  useEffect(() => {
    void loadTags();
  }, [loadTags]);

  useEffect(() => {
    setSelectedIds(initialTagIds);
  }, [initialTagIds]);

  const toggle = (tagId: string) => {
    setSelectedIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId],
    );
  };

  const handleCreate = async () => {
    setFieldError('');
    const trimmed = newName.trim();
    if (!trimmed) {
      setFieldError('Escribe un nombre para la etiqueta.');
      return;
    }
    setCreating(true);
    try {
      const created = await db.tag.create(officeId, trimmed, 'consultant');
      setOfficeTags((prev) =>
        [...prev, created].sort((a, b) => a.name.localeCompare(b.name, 'es')),
      );
      setSelectedIds((prev) => (prev.includes(created.id) ? prev : [...prev, created.id]));
      setNewName('');
      toast.success('Etiqueta creada.');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'No se pudo crear la etiqueta.';
      setFieldError(message);
    } finally {
      setCreating(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const tags = await db.consultant.setConsultantTags(consultantId, selectedIds);
      toast.success('Etiquetas actualizadas.');
      onSaved(tags);
    } catch (error) {
      console.error('Error saving consultant tags:', error);
      toast.error('No se pudieron guardar las etiquetas.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">Cargando etiquetas…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="max-h-48 overflow-y-auto space-y-2 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
        {officeTags.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Aún no hay etiquetas. Crea una abajo.
          </p>
        ) : (
          officeTags.map((tag) => (
            <label
              key={tag.id}
              className="flex items-center gap-2 text-sm text-gray-900 dark:text-white cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selectedIds.includes(tag.id)}
                onChange={() => toggle(tag.id)}
                className="rounded border-gray-300 dark:border-gray-600"
              />
              <span className="truncate">{tag.name}</span>
            </label>
          ))
        )}
      </div>

      <FormField label="Nueva etiqueta" error={fieldError || undefined}>
        <div className="flex gap-2">
          <input
            type="text"
            value={newName}
            maxLength={LIMITS.tagName}
            onChange={(e) => {
              setNewName(e.target.value);
              setFieldError('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void handleCreate();
              }
            }}
            placeholder="Ej. Senior, Zona Norte…"
            className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={creating || !newName.trim()}
            className="px-3 py-2 text-sm bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50"
          >
            {creating ? 'Creando…' : 'Crear'}
          </button>
        </div>
      </FormField>

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Guardando…' : 'Guardar etiquetas'}
        </button>
      </div>
    </div>
  );
}

type FilterProps = {
  tags: Tag[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
};

export function TagMultiFilter({ tags, selectedIds, onChange }: FilterProps) {
  const toggle = (tagId: string) => {
    onChange(
      selectedIds.includes(tagId)
        ? selectedIds.filter((id) => id !== tagId)
        : [...selectedIds, tagId],
    );
  };

  return (
    <div className="min-w-[200px] flex-1">
      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
        Etiquetas
      </label>
      {tags.length === 0 ? (
        <p className="text-xs text-gray-400 py-2">Sin etiquetas creadas</p>
      ) : (
        <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto">
          {tags.map((tag) => {
            const active = selectedIds.includes(tag.id);
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => toggle(tag.id)}
                aria-pressed={active}
                className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                  active
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-blue-400'
                }`}
              >
                {tag.name}
              </button>
            );
          })}
        </div>
      )}
      {selectedIds.length > 0 && (
        <button
          type="button"
          onClick={() => onChange([])}
          className="mt-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
        >
          Limpiar etiquetas
        </button>
      )}
    </div>
  );
}
