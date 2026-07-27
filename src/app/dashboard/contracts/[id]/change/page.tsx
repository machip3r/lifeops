'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Contract, ContractChangeRequest, Client } from '@/lib/supabase';
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
  CHANGE_TYPE_OPTIONS,
  LIMITS,
  changeSolicitudSchema,
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

function ContractChangeRequestPageContent() {
  const router = useRouter();
  const params = useParams();
  const contractId = params.id as string;
  const { profile } = useAuth();
  const { toast } = useToast();
  const [contract, setContract] = useState<Contract | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [documents, setDocuments] = useState<PendingDocument[]>([]);

  const [folioNumber, setFolioNumber] = useState('');
  const [details, setDetails] = useState('');
  const [notes, setNotes] = useState('');
  const [changeType, setChangeType] = useState('');
  const [otherChangeType, setOtherChangeType] = useState('');

  useEffect(() => {
    if (contractId) {
      loadContract();
      loadClients();
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

  const loadClients = async () => {
    try {
      let clientsData: Client[];
      if (profile?.role === 'consultant' && profile.id) {
        clientsData = await db.client.getClientsByConsultant(profile.id);
      } else {
        clientsData = await db.client.getAllClients(
          profile?.role === 'promotory' ? profile?.id : undefined,
        );
      }
      setClients(clientsData);
    } catch (error) {
      console.error('Error loading clients:', error);
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

      const parsed = changeSolicitudSchema.safeParse({
        contractId,
        changeType,
        otherChangeType: otherChangeType || null,
        folioNumber: folioNumber || null,
        details,
        notes: notes || null,
      });
      if (!parsed.success) {
        setFieldErrors(zodFieldErrors(parsed.error, VALIDATION_MESSAGES));
        return;
      }

      const changeTypeText =
        parsed.data.changeType === 'Otro'
          ? parsed.data.otherChangeType || 'Otro'
          : parsed.data.changeType;
      const detailsText = `Tipo de cambio: ${changeTypeText}\n\n${parsed.data.details}`;

      const changeRequestData: Omit<
        ContractChangeRequest,
        'id' | 'created_at' | 'updated_at'
      > = {
        contract_id: contractId,
        request_type: 'CHANGE',
        folio_number: parsed.data.folioNumber || null,
        details: detailsText,
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
          toast.success('Solicitud de cambio enviada.');
        }
      } else {
        toast.success('Solicitud de cambio enviada.');
      }

      router.push('/dashboard/contracts');
    } catch (error: unknown) {
      console.error('Error creating change request:', error);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Error al crear la solicitud de cambio. Por favor, inténtalo de nuevo.',
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

  const selectedClient = clients.find((c) => c.id === contract.client_id);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="dashboard-page-title text-3xl font-bold mb-2">
          Solicitar Cambio de Contrato
        </h1>
        <p className="text-muted-foreground">
          Completa la información para solicitar un cambio en la póliza
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
          <FormField label="Fecha de captura" htmlFor="capture-date">
            <Input
              id="capture-date"
              value={contract.capture_date || 'N/A'}
              disabled
            />
          </FormField>
          <FormField label="Número de póliza" htmlFor="contract-number">
            <Input
              id="contract-number"
              value={contract.contract_number || 'N/A'}
              disabled
            />
          </FormField>
          <FormField label="Nombre completo del cliente" htmlFor="client-name">
            <Input id="client-name" value={selectedClient?.name || 'N/A'} disabled />
          </FormField>
          <FormField label="Nombre del proyecto" htmlFor="project-name">
            <Input
              id="project-name"
              value={contract.project_name || 'N/A'}
              disabled
            />
          </FormField>
          <FormField label="Suma asegurada" htmlFor="insured-amount">
            <Input
              id="insured-amount"
              value={contract.insured_amount || 'N/A'}
              disabled
            />
          </FormField>
          <FormField label="Moneda" htmlFor="change-currency">
            <Input id="change-currency" value={contract.currency || 'N/A'} disabled />
          </FormField>
        </div>

        <FormField
          label="Cambio o trámite que deseas hacer"
          htmlFor="change_type"
          error={fieldErrors.changeType}
        >
          <select
            id="change_type"
            value={changeType}
            onChange={(e) => setChangeType(e.target.value)}
            required
            disabled={isSubmitting}
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
          >
            <option value="">Selecciona un tipo de cambio</option>
            {CHANGE_TYPE_OPTIONS.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </FormField>

        {changeType === 'Otro' && (
          <FormField
            label="Especifica el tipo de cambio"
            htmlFor="other_change_type"
            error={fieldErrors.otherChangeType}
          >
            <Input
              id="other_change_type"
              value={otherChangeType}
              maxLength={LIMITS.entityName}
              disabled={isSubmitting}
              onChange={(e) => setOtherChangeType(e.target.value)}
              required
            />
          </FormField>
        )}

        <FormField
          label="Folio (opcional)"
          htmlFor="folio_number"
          error={fieldErrors.folioNumber}
        >
          <Input
            id="folio_number"
            value={folioNumber}
            maxLength={LIMITS.folioNumber}
            disabled={isSubmitting}
            onChange={(e) => setFolioNumber(e.target.value)}
          />
        </FormField>

        <FormField
          label="Descripción del CAMBIO/CAMBIOS y motivo"
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
            placeholder="Describe detalladamente los cambios que deseas realizar y el motivo..."
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
          <Button type="submit" disabled={isSubmitting || !changeType || !details.trim()}>
            {isSubmitting ? 'Enviando...' : 'Enviar Solicitud'}
          </Button>
        </div>
      </form>
    </div>
  );
}

export default function ContractChangeRequestPage() {
  return (
    <ProtectedRoute allowedRoles={['consultant']}>
      <ContractChangeRequestPageContent />
    </ProtectedRoute>
  );
}
