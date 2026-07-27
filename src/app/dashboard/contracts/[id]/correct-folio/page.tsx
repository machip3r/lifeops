'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Contract, ContractChangeRequest } from '@/lib/supabase';
import { db } from '@/lib/db';
import { useAuth } from '@/contexts/auth-context';
import ProtectedRoute from '@/components/protected-route';
import { DocumentAttachmentsField } from '@/components/document-attachments-field';
import {
  type PendingDocument,
  uploadSolicitudDocuments,
} from '@/lib/documents/upload';
import { useToast } from '@/components/toast';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  LIMITS,
  correctSolicitudSchema,
  documentDisplayNameSchema,
} from '@/lib/validation/schemas';
import { VALIDATION_MESSAGES, zodFieldErrors } from '@/lib/validation/field-errors';

function validatePendingDocuments(documents: PendingDocument[]): Record<string, string> {
  const errors: Record<string, string> = {};
  documents.forEach((doc, index) => {
    if (!doc.file) {
      errors[`documents.${index}.file`] = VALIDATION_MESSAGES.required;
    }
    const nameParsed = documentDisplayNameSchema.safeParse(doc.displayName);
    if (!nameParsed.success) {
      errors[`documents.${index}.displayName`] =
        zodFieldErrors(nameParsed.error, VALIDATION_MESSAGES).displayName ||
        VALIDATION_MESSAGES.entityName;
    }
  });
  return errors;
}

function CorrectFolioPageContent() {
  const router = useRouter();
  const params = useParams();
  const contractId = params.id as string;
  const { profile } = useAuth();
  const { toast } = useToast();
  const [contract, setContract] = useState<Contract | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [documents, setDocuments] = useState<PendingDocument[]>([]);
  const [folioNumber, setFolioNumber] = useState('');
  const [details, setDetails] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (contractId) {
      loadContract();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractId]);

  const loadContract = async () => {
    try {
      const contractData = await db.contract.getContractById(contractId);
      if (!contractData) {
        throw new Error('Contrato no encontrado');
      }
      setContract(contractData);
    } catch (error) {
      console.error('Error loading contract:', error);
      setErrorMessage('Error al cargar la póliza');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage('');
    setFieldErrors({});

    try {
      if (!contract) {
        throw new Error('Contrato no encontrado');
      }

      const docErrors = validatePendingDocuments(documents);
      if (Object.keys(docErrors).length > 0) {
        setFieldErrors(docErrors);
        return;
      }

      const parsed = correctSolicitudSchema.safeParse({
        contractId,
        folioNumber,
        details,
        notes: notes || null,
      });
      if (!parsed.success) {
        setFieldErrors(zodFieldErrors(parsed.error, VALIDATION_MESSAGES));
        return;
      }

      const changeRequestData: Omit<
        ContractChangeRequest,
        'id' | 'created_at' | 'updated_at'
      > = {
        contract_id: contractId,
        request_type: 'CORRECT',
        folio_number: parsed.data.folioNumber,
        details: parsed.data.details,
        notes: parsed.data.notes || null,
        folder_key: null,
        status: 'PENDING',
        metadata: {},
      };

      const created = await db.contractChangeRequest.createChangeRequest(changeRequestData);

      if (documents.length > 0) {
        const uploadResult = await uploadSolicitudDocuments({
          contractId,
          changeRequestId: created.id,
          documents,
        });
        if (uploadResult.failures.length > 0) {
          toast.error(
            `Solicitud creada, pero ${uploadResult.failures.length} documento(s) no se subieron.`,
          );
        } else {
          toast.success('Solicitud de corrección enviada.');
        }
      } else {
        toast.success('Solicitud de corrección enviada.');
      }

      router.push('/dashboard/contracts');
    } catch (error: unknown) {
      console.error('Error creating correction request:', error);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Error al crear la solicitud. Por favor, inténtalo de nuevo.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Cargando...</p>
      </div>
    );
  }

  if (!contract) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Contrato no encontrado</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="dashboard-page-title text-3xl font-bold mb-2">Corregir Folio</h1>
        <p className="text-muted-foreground">
          Completa la información para solicitar una corrección de folio
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="rounded-lg border border-border bg-card p-6 md:p-8 space-y-6"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Clave de asesor" htmlFor="consultant-code">
            <Input
              id="consultant-code"
              value={profile?.consultant_code || 'N/A'}
              disabled
            />
          </FormField>
          <FormField label="Nombre de asesor" htmlFor="consultant-name">
            <Input id="consultant-name" value={profile?.name || 'N/A'} disabled />
          </FormField>
          <FormField label="Número de póliza" htmlFor="contract-number">
            <Input
              id="contract-number"
              value={contract.contract_number || 'N/A'}
              disabled
            />
          </FormField>
        </div>

        <FormField
          label="Folio a corregir"
          htmlFor="folio_number"
          error={fieldErrors.folioNumber}
        >
          <Input
            id="folio_number"
            value={folioNumber}
            maxLength={LIMITS.folioNumber}
            disabled={isSubmitting}
            required
            onChange={(e) => setFolioNumber(e.target.value)}
          />
        </FormField>

        <FormField
          label="Descripción de las correcciones"
          htmlFor="details"
          error={fieldErrors.details}
        >
          <Textarea
            id="details"
            value={details}
            maxLength={LIMITS.changeDetails}
            disabled={isSubmitting}
            required
            rows={6}
            placeholder="Describe las correcciones que se deben realizar..."
            onChange={(e) => setDetails(e.target.value)}
          />
        </FormField>

        <FormField label="Notas adicionales" htmlFor="notes" error={fieldErrors.notes}>
          <Textarea
            id="notes"
            value={notes}
            maxLength={LIMITS.notes}
            disabled={isSubmitting}
            rows={3}
            onChange={(e) => setNotes(e.target.value)}
          />
        </FormField>

        <DocumentAttachmentsField
          documents={documents}
          onChange={setDocuments}
          errors={fieldErrors}
          disabled={isSubmitting}
        />

        {errorMessage && (
          <p className="text-sm text-destructive" role="alert">
            {errorMessage}
          </p>
        )}

        <div className="flex justify-end gap-4 pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push('/dashboard/contracts')}
            disabled={isSubmitting}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting || !folioNumber.trim() || !details.trim()}
          >
            {isSubmitting ? 'Enviando...' : 'Enviar Solicitud'}
          </Button>
        </div>
      </form>
    </div>
  );
}

export default function CorrectFolioPage() {
  return (
    <ProtectedRoute allowedRoles={['consultant']}>
      <CorrectFolioPageContent />
    </ProtectedRoute>
  );
}
