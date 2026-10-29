'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, FileText } from 'lucide-react';
import { AppDialog } from '@/components/ui/app-dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useQueryEffect } from '@/hooks/use-query-effect';
import { getDocumentSignedUrl } from '@/lib/documents/upload';

export type ViewedDocument = { id: string; name: string; mimeType?: string | null };

type Loaded = { id: string; objectUrl: string; type: string } | { id: string; error: string };

/**
 * Shows a stored document (payment evidence, póliza files) inside the app: images and PDFs
 * render here, anything else offers the download. The file is fetched through its short-lived
 * signed link into a local object URL, so it never opens a new tab.
 */
export function DocumentViewerDialog({ document, onClose }: { document: ViewedDocument | null; onClose: () => void }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const id = document?.id ?? null;

  const release = () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
  };

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const signed = await getDocumentSignedUrl(id);
      const response = await fetch(signed);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      release();
      objectUrlRef.current = URL.createObjectURL(blob);
      setLoaded({ id, objectUrl: objectUrlRef.current, type: blob.type });
    } catch (error) {
      console.error('Error loading document:', error);
      setLoaded({ id, error: 'No se pudo cargar el documento. Intenta de nuevo.' });
    }
  }, [id]);

  useQueryEffect(Boolean(id), load);
  // Free the file from memory when the viewer goes away
  useEffect(() => release, []);

  const current = loaded && loaded.id === id ? loaded : null;
  const type = (current && 'type' in current && current.type) || document?.mimeType || '';
  const isImage = type.startsWith('image/');
  const isPdf = type === 'application/pdf';

  const close = () => {
    release();
    setLoaded(null);
    onClose();
  };

  return (
    <AppDialog
      open={document != null}
      title={document?.name || 'Documento'}
      description={isPdf ? 'PDF' : isImage ? 'Imagen' : undefined}
      onClose={close}
      size="xl"
      elevated
      footer={
        <>
          {current && 'objectUrl' in current ? (
            <Button asChild variant="outline" size="lg" className="gap-2">
              <a href={current.objectUrl} download={document?.name || 'documento'}>
                <Download className="h-4 w-4" aria-hidden />
                Descargar
              </a>
            </Button>
          ) : null}
          <Button type="button" variant="brand" size="lg" onClick={close}>
            Cerrar
          </Button>
        </>
      }
    >
      {!current ? (
        <div role="status" aria-label="Cargando documento">
          <Skeleton className="h-[60vh] w-full" />
        </div>
      ) : 'error' in current ? (
        <p role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-(--lifeops-fg)">
          {current.error}
        </p>
      ) : isImage ? (
        // Local object URL of a private file: next/image cannot optimize it
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={current.objectUrl}
          alt={document?.name || 'Documento'}
          className="mx-auto max-h-[68vh] w-auto rounded-lg object-contain"
        />
      ) : isPdf ? (
        <iframe
          src={current.objectUrl}
          title={document?.name || 'Documento PDF'}
          className="h-[68vh] w-full rounded-lg border border-(--lifeops-border) bg-white"
        />
      ) : (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-(--lifeops-hover) text-(--lifeops-accent)">
            <FileText className="h-7 w-7" aria-hidden />
          </span>
          <p className="text-sm text-(--lifeops-muted)">
            Este tipo de archivo no se puede ver aquí. Descárgalo para abrirlo.
          </p>
        </div>
      )}
    </AppDialog>
  );
}
