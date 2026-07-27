'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Client, Consultant, Contract } from '@/lib/supabase';
import { db } from '@/lib/db';
import { useToast } from '@/components/toast';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { DocumentAttachmentsField } from '@/components/document-attachments-field';
import {
  ClientSelectField,
  ContractSelectField,
} from '@/components/client-contract-select';
import { ProjectNameSelectField } from '@/components/project-name-select';
import {
  type PendingDocument,
  uploadSolicitudDocuments,
} from '@/lib/documents/upload';
import {
  CHANGE_TYPE_OPTIONS,
  LIMITS,
  changeSolicitudSchema,
  correctSolicitudSchema,
  documentDisplayNameSchema,
  emitSolicitudSchema,
} from '@/lib/validation/schemas';
import { VALIDATION_MESSAGES, zodFieldErrors } from '@/lib/validation/field-errors';
import { cn } from '@/lib/utils';

interface RequestFormDialogProps {
  consultant: Consultant;
  onClose: () => void;
}

type RequestType = 'EMIT' | 'CHANGE' | 'CORRECT';

const REQUEST_TYPE_OPTIONS: Array<{
  value: RequestType;
  label: string;
  description: string;
}> = [
  {
    value: 'EMIT',
    label: 'Emitir',
    description: 'Registrar emisión de póliza',
  },
  {
    value: 'CHANGE',
    label: 'Cambio',
    description: 'Cambio sobre póliza existente',
  },
  {
    value: 'CORRECT',
    label: 'Corregir folio',
    description: 'Corrección de folio',
  },
];

const fieldControlClass =
  'h-9 w-full rounded-md border border-[#3a4049] bg-[#1a1d23] text-white px-2.5 text-sm placeholder:text-[#6b7280] focus-visible:border-[#FBDBAC] focus-visible:ring-2 focus-visible:ring-[#FBDBAC]/40 disabled:opacity-50';

const textareaControlClass =
  'min-h-20 w-full rounded-md border border-[#3a4049] bg-[#1a1d23] text-white px-2.5 py-2 text-sm placeholder:text-[#6b7280] focus-visible:border-[#FBDBAC] focus-visible:ring-2 focus-visible:ring-[#FBDBAC]/40 disabled:opacity-50 resize-y';

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

export default function RequestFormDialog({ consultant, onClose }: RequestFormDialogProps) {
  const { toast } = useToast();
  const [requestType, setRequestType] = useState<RequestType | ''>('');
  const [clients, setClients] = useState<Client[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loadingLists, setLoadingLists] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [documents, setDocuments] = useState<PendingDocument[]>([]);

  // EMIT
  const [clientSelect, setClientSelect] = useState('');
  const [newClientName, setNewClientName] = useState('');
  const [projectName, setProjectName] = useState('');
  const [contractNumber, setContractNumber] = useState('');
  const [notes, setNotes] = useState('');

  // CHANGE / CORRECT
  const [contractId, setContractId] = useState('');
  const [changeType, setChangeType] = useState('');
  const [otherChangeType, setOtherChangeType] = useState('');
  const [folioNumber, setFolioNumber] = useState('');
  const [details, setDetails] = useState('');

  const officeId = consultant.office_id;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingLists(true);
      try {
        const [clientsData, contractsData] = await Promise.all([
          officeId
            ? db.client.getAllClients(officeId)
            : db.client.getClientsByConsultant(consultant.id),
          db.contract.getContractsByConsultant(consultant.id),
        ]);
        if (!cancelled) {
          setClients(clientsData);
          setContracts(contractsData);
        }
      } catch (error) {
        console.error('Error loading solicitud lists:', error);
        if (!cancelled) {
          setFormError('Error al cargar clientes y pólizas.');
        }
      } finally {
        if (!cancelled) setLoadingLists(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [consultant.id, officeId]);

  const selectedContract = useMemo(
    () => contracts.find((c) => c.id === contractId) || null,
    [contracts, contractId],
  );

  const requiredReady = useMemo(() => {
    if (!requestType) return false;
    if (requestType === 'EMIT') {
      const hasClient =
        (clientSelect && clientSelect !== '__new__') ||
        (clientSelect === '__new__' && newClientName.trim().length > 0);
      return hasClient;
    }
    if (requestType === 'CHANGE') {
      return Boolean(contractId && changeType && details.trim());
    }
    return Boolean(contractId && folioNumber.trim() && details.trim());
  }, [
    requestType,
    clientSelect,
    newClientName,
    contractId,
    changeType,
    details,
    folioNumber,
  ]);

  const canSubmit = requiredReady && !isSubmitting && !loadingLists;

  const selectRequestType = (next: RequestType) => {
    setRequestType(next);
    setFieldErrors({});
    setFormError('');
    setDocuments([]);
    setNotes('');
    setClientSelect('');
    setNewClientName('');
    setProjectName('');
    setContractNumber('');
    setContractId('');
    setChangeType('');
    setOtherChangeType('');
    setFolioNumber('');
    setDetails('');
  };

  const handleContractChange = (id: string) => {
    setContractId(id);
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next.contractId;
      return next;
    });
  };

  const reportUploadFailures = (
    failures: Array<{ displayName: string; error: string }>,
  ) => {
    if (failures.length === 0) return;
    toast.error(
      `Solicitud creada, pero ${failures.length} documento(s) no se subieron: ${failures
        .map((f) => f.displayName)
        .join(', ')}`,
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFieldErrors({});

    if (!requestType) {
      setFieldErrors({ requestType: VALIDATION_MESSAGES.required });
      return;
    }

    const docErrors = validatePendingDocuments(documents);
    if (Object.keys(docErrors).length > 0) {
      setFieldErrors(docErrors);
      return;
    }

    setIsSubmitting(true);
    try {
      if (requestType === 'EMIT') {
        const parsed = emitSolicitudSchema.safeParse({
          clientId: clientSelect && clientSelect !== '__new__' ? clientSelect : null,
          clientName:
            clientSelect === '__new__'
              ? newClientName
              : clients.find((c) => c.id === clientSelect)?.name,
          projectName: projectName || null,
          contractNumber: contractNumber || null,
          notes: notes || null,
        });
        if (!parsed.success) {
          setFieldErrors(zodFieldErrors(parsed.error, VALIDATION_MESSAGES));
          return;
        }

        let clientId = parsed.data.clientId || null;
        if (!clientId) {
          const created = await db.client.findOrCreateClientByName(
            parsed.data.clientName!,
            officeId,
          );
          clientId = created.id;
        }

        const contract = await db.contract.createContract({
          consultant_id: consultant.id,
          client_id: clientId,
          contract_number: parsed.data.contractNumber || null,
          project_name: parsed.data.projectName || null,
          status: 'PENDING',
          metadata: {
            source: 'solicitud_emit',
            notes: parsed.data.notes || null,
          },
        });

        if (documents.length > 0) {
          const uploadResult = await uploadSolicitudDocuments({
            contractId: contract.id,
            documents,
          });
          reportUploadFailures(uploadResult.failures);
          if (uploadResult.failures.length === 0) {
            toast.success('Solicitud de emisión enviada.');
          }
        } else {
          toast.success('Solicitud de emisión enviada.');
        }
        onClose();
        return;
      }

      if (requestType === 'CHANGE') {
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

        const changeRequest = await db.contractChangeRequest.createChangeRequest({
          contract_id: parsed.data.contractId,
          request_type: 'CHANGE',
          folio_number: parsed.data.folioNumber || null,
          details: detailsText,
          notes: parsed.data.notes || null,
          folder_key: null,
          status: 'PENDING',
          metadata: {},
        });

        if (documents.length > 0) {
          const uploadResult = await uploadSolicitudDocuments({
            contractId: parsed.data.contractId,
            changeRequestId: changeRequest.id,
            documents,
          });
          reportUploadFailures(uploadResult.failures);
          if (uploadResult.failures.length === 0) {
            toast.success('Solicitud de cambio enviada.');
          }
        } else {
          toast.success('Solicitud de cambio enviada.');
        }
        onClose();
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

      const changeRequest = await db.contractChangeRequest.createChangeRequest({
        contract_id: parsed.data.contractId,
        request_type: 'CORRECT',
        folio_number: parsed.data.folioNumber,
        details: parsed.data.details,
        notes: parsed.data.notes || null,
        folder_key: null,
        status: 'PENDING',
        metadata: {},
      });

      if (documents.length > 0) {
        const uploadResult = await uploadSolicitudDocuments({
          contractId: parsed.data.contractId,
          changeRequestId: changeRequest.id,
          documents,
        });
        reportUploadFailures(uploadResult.failures);
        if (uploadResult.failures.length === 0) {
          toast.success('Solicitud de corrección enviada.');
        }
      } else {
        toast.success('Solicitud de corrección enviada.');
      }
      onClose();
    } catch (error: unknown) {
      console.error('Error submitting solicitud:', error);
      setFormError(
        error instanceof Error
          ? error.message
          : 'Ocurrió un error al enviar la solicitud. Inténtalo de nuevo.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="rounded-lg border border-[#3a4049] bg-[#1a1d23]/60 px-3 py-2.5">
        <p className="text-xs text-[#9ca3af]">Asesor</p>
        <p className="text-sm font-medium text-white">
          {consultant.name}
          {consultant.consultant_code ? (
            <span className="text-[#FBDBAC]"> · {consultant.consultant_code}</span>
          ) : null}
        </p>
      </div>

      <div>
        <p className="text-sm text-[#9ca3af] mb-2" id="request-type-label">
          Tipo de solicitud
        </p>
        <div
          role="group"
          aria-labelledby="request-type-label"
          className="grid grid-cols-1 sm:grid-cols-3 gap-2"
        >
          {REQUEST_TYPE_OPTIONS.map((opt) => {
            const active = requestType === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                disabled={isSubmitting || loadingLists}
                aria-pressed={active}
                onClick={() => selectRequestType(opt.value)}
                className={cn(
                  'rounded-lg border px-3 py-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FBDBAC] disabled:opacity-50',
                  active
                    ? 'bg-[#FBDBAC]/15 text-[#FBDBAC] border-[#FBDBAC]/50'
                    : 'bg-[#1a1d23] text-[#9ca3af] border-[#3a4049] hover:border-[#FBDBAC]/40 hover:text-white',
                )}
              >
                <span className="block text-sm font-semibold text-inherit">{opt.label}</span>
                <span
                  className={cn(
                    'mt-0.5 block text-xs leading-snug',
                    active ? 'text-[#FBDBAC]/80' : 'text-[#6b7280]',
                  )}
                >
                  {opt.description}
                </span>
              </button>
            );
          })}
        </div>
        {fieldErrors.requestType && (
          <p className="mt-1.5 text-sm font-medium text-destructive" role="alert">
            {fieldErrors.requestType}
          </p>
        )}
      </div>

      {!requestType && (
        <p className="text-sm text-[#6b7280]">
          Elige un tipo de solicitud para continuar.
        </p>
      )}

      {requestType === 'EMIT' && (
        <section className="space-y-4 rounded-lg border border-[#3a4049] bg-[#242830]/50 p-4">
          <h3 className="text-sm font-semibold text-[#FBDBAC]">Datos de emisión</h3>
          <ClientSelectField
            clients={clients}
            value={clientSelect}
            allowNew
            disabled={isSubmitting || loadingLists}
            error={fieldErrors.clientName || fieldErrors.clientId}
            onChange={(id) => {
              setClientSelect(id);
              if (id !== '__new__') setNewClientName('');
            }}
          />
          {clientSelect === '__new__' && (
            <FormField
              label="Nombre del nuevo cliente"
              htmlFor="new_client_name"
              error={fieldErrors.clientName}
            >
              <Input
                id="new_client_name"
                value={newClientName}
                maxLength={LIMITS.personName}
                disabled={isSubmitting}
                className={fieldControlClass}
                onChange={(e) => setNewClientName(e.target.value)}
              />
            </FormField>
          )}
          <ProjectNameSelectField
            value={projectName}
            disabled={isSubmitting}
            error={fieldErrors.projectName}
            onChange={setProjectName}
          />
          <FormField
            label="Número de contrato"
            htmlFor="contract_number"
            error={fieldErrors.contractNumber}
          >
            <Input
              id="contract_number"
              value={contractNumber}
              maxLength={LIMITS.contractNumber}
              disabled={isSubmitting}
              className={fieldControlClass}
              placeholder="Opcional"
              onChange={(e) => setContractNumber(e.target.value)}
            />
          </FormField>
        </section>
      )}

      {(requestType === 'CHANGE' || requestType === 'CORRECT') && (
        <section className="space-y-4 rounded-lg border border-[#3a4049] bg-[#242830]/50 p-4">
          <h3 className="text-sm font-semibold text-[#FBDBAC]">
            {requestType === 'CHANGE' ? 'Datos del cambio' : 'Datos de la corrección'}
          </h3>
          <ContractSelectField
            contracts={contracts}
            clients={clients}
            value={contractId}
            disabled={isSubmitting || loadingLists}
            error={fieldErrors.contractId}
            onChange={handleContractChange}
          />
          {selectedContract && (
            <div className="rounded-md border border-[#3a4049] bg-[#1a1d23] px-3 py-2.5 text-sm space-y-1">
              <p className="text-white">
                <span className="text-[#9ca3af]">Proyecto: </span>
                {selectedContract.project_name || 'N/A'}
              </p>
              <p className="text-white">
                <span className="text-[#9ca3af]">Cliente: </span>
                {clients.find((c) => c.id === selectedContract.client_id)?.name || 'N/A'}
              </p>
            </div>
          )}

          {requestType === 'CHANGE' && (
            <>
              <FormField
                label="Tipo de cambio"
                htmlFor="change_type"
                error={fieldErrors.changeType}
              >
                <select
                  id="change_type"
                  value={changeType}
                  disabled={isSubmitting}
                  onChange={(e) => setChangeType(e.target.value)}
                  className="h-9 w-full rounded-md border border-[#3a4049] bg-[#1a1d23] text-white px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#FBDBAC] disabled:opacity-50"
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
                    className={fieldControlClass}
                    onChange={(e) => setOtherChangeType(e.target.value)}
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
                  className={fieldControlClass}
                  onChange={(e) => setFolioNumber(e.target.value)}
                />
              </FormField>
              <FormField
                label="Descripción del cambio"
                htmlFor="details"
                error={fieldErrors.details}
              >
                <Textarea
                  id="details"
                  value={details}
                  maxLength={LIMITS.changeDetails}
                  disabled={isSubmitting}
                  rows={4}
                  className={textareaControlClass}
                  placeholder="Describe el cambio y el motivo…"
                  onChange={(e) => setDetails(e.target.value)}
                />
              </FormField>
            </>
          )}

          {requestType === 'CORRECT' && (
            <>
              <FormField
                label="Folio a corregir"
                htmlFor="folio_to_correct"
                error={fieldErrors.folioNumber}
              >
                <Input
                  id="folio_to_correct"
                  value={folioNumber}
                  maxLength={LIMITS.folioNumber}
                  disabled={isSubmitting}
                  className={fieldControlClass}
                  onChange={(e) => setFolioNumber(e.target.value)}
                />
              </FormField>
              <FormField
                label="Descripción de la corrección"
                htmlFor="correction_details"
                error={fieldErrors.details}
              >
                <Textarea
                  id="correction_details"
                  value={details}
                  maxLength={LIMITS.changeDetails}
                  disabled={isSubmitting}
                  rows={4}
                  className={textareaControlClass}
                  placeholder="Describe la corrección…"
                  onChange={(e) => setDetails(e.target.value)}
                />
              </FormField>
            </>
          )}
        </section>
      )}

      {requestType && (
        <section className="space-y-4 rounded-lg border border-[#3a4049] bg-[#242830]/50 p-4">
          <h3 className="text-sm font-semibold text-[#FBDBAC]">Documentos y notas</h3>
          <DocumentAttachmentsField
            documents={documents}
            onChange={setDocuments}
            errors={fieldErrors}
            disabled={isSubmitting}
          />
          <FormField label="Notas adicionales" htmlFor="notes" error={fieldErrors.notes}>
            <Textarea
              id="notes"
              value={notes}
              maxLength={LIMITS.notes}
              disabled={isSubmitting}
              rows={3}
              className={textareaControlClass}
              placeholder="Opcional"
              onChange={(e) => setNotes(e.target.value)}
            />
          </FormField>
        </section>
      )}

      {formError && (
        <p className="text-sm text-destructive" role="alert">
          {formError}
        </p>
      )}

      <div className="flex justify-end gap-3 border-t border-[#3a4049] pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={isSubmitting}
          className="border-[#3a4049] bg-transparent text-white hover:bg-[#1a1d23] hover:text-[#FBDBAC]"
        >
          Cancelar
        </Button>
        <Button
          type="submit"
          disabled={!canSubmit}
          className="bg-[#FBDBAC] text-[#1a1d23] hover:bg-[#E8C89B] disabled:opacity-50"
        >
          {isSubmitting ? 'Enviando…' : 'Enviar solicitud'}
        </Button>
      </div>
    </form>
  );
}
