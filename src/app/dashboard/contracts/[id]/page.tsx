'use client';

import { useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { CalendarClock, CircleDot, HandCoins, Pencil, ReceiptText, RotateCcw, Trash2 } from 'lucide-react';
import type {
    AuditLogEntry,
    Client,
    Consultant,
    Contract,
    ContractCollectionPayment,
    ContractDetail,
} from '@/lib/supabase';
import { db, type ContractFile } from '@/lib/db';
import ProtectedRoute from '@/components/protected-route';
import { DataTable, dataTablePanelClass } from '@/components/data-table';
import { TablePagination } from '@/components/table-pagination';
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';
import { useAuth } from '@/contexts/auth-context';
import { EditContractDialog } from '@/components/contracts/edit-contract-dialog';
import { EditContractDetailDialog } from '@/components/contracts/edit-contract-detail-dialog';
import { RowActions } from '@/components/ui/row-edit-button';
import { ReassignConsultantDialog } from '@/components/contracts/reassign-consultant-dialog';
import { ReceiptCalendar } from '@/components/contracts/receipt-calendar';
import { PaymentEvidenceCard } from '@/components/contracts/payment-evidence';
import { DocumentViewerDialog, type ViewedDocument } from '@/components/document-viewer-dialog';
import { ActivityCard } from '@/components/dashboard/activity-card';
import { EntityActionButton } from '@/components/dashboard/entity-action-button';
import { DeleteContractDialog } from '@/components/delete-dialogs';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { rehabilitateContractAction } from '@/app/dashboard/contracts/actions';
import { POLICY_STATUS, isInForce } from '@/lib/contracts/policy-status';
import { paymentChannelLabel } from '@/lib/contracts/payment-channels';
import { planClassificationLabel } from '@/lib/contracts/plan-classifications';
import { MissingPaymentMethodFlag } from '@/components/contracts/missing-payment-method';
import {
    RegisterPaymentDialog,
    type RegisterPaymentTarget,
} from '@/components/collections/register-payment-dialog';
import { useToast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { DotBadge } from '@/components/ui/dot-badge';
import { StatTile } from '@/components/dashboard/overview/stat-tile';
import { formatDateShortEsLocal } from '@/lib/format/date';
import { CURRENCY_LABELS, formatAmount, normalizeCurrency } from '@/lib/contracts/currencies';
import {
    maxIsoDate,
    nextCollectionDue,
    receiptCalendar,
    type ReceiptPayment,
} from '@/lib/collections/next-due';
import { PORTFOLIO_STATUS, carteraStatus, daysPastDue, type PortfolioStatus } from '@/lib/collections/status';
import { PageHeader } from '@/components/dashboard/page-header';
import { DetailCard, DetailRow, DetailRows } from '@/components/dashboard/detail-card';
import { useQueryEffect, useQueryLoading, useResetPage } from '@/hooks/use-query-effect';
import { DetailPageSkeleton } from '@/components/ui/skeleton';

/** Collection marks + commission-file payments, one entry per payment (newest first). */
const LINE_LABELS: Record<string, string> = { LIFE: 'Vida', HEALTH: 'Gastos médicos', SAVINGS: 'Ahorro / retiro' };

function mergePayments(
    marks: ContractCollectionPayment[],
    details: ContractDetail[],
    evidenceByPayment: Map<string, string>,
): ReceiptPayment[] {
    const detailByDate = new Map<string, ContractDetail>();
    for (const detail of details) {
        const paid = detail.payment_date?.slice(0, 10);
        if (paid && !detailByDate.has(paid)) detailByDate.set(paid, detail);
    }
    const payments: ReceiptPayment[] = [];
    const seen = new Set<string>();
    for (const mark of marks) {
        const paid = mark.paid_at?.slice(0, 10);
        if (!paid) continue;
        const detail = mark.source === 'import' ? detailByDate.get(paid) : undefined;
        payments.push({
            paidAt: paid,
            evidenceFileId: evidenceByPayment.get(mark.id) ?? null,
            source: mark.source,
            amount: mark.amount ?? detail?.premium_payment ?? null,
            reference: detail?.receipt_number
                ? `Recibo ${detail.receipt_number}`
                : mark.notes?.trim() || null,
        });
        seen.add(paid);
    }
    for (const [paid, detail] of detailByDate) {
        if (seen.has(paid)) continue;
        payments.push({
            paidAt: paid,
            source: 'import',
            amount: detail.premium_payment ?? null,
            reference: detail.receipt_number ? `Recibo ${detail.receipt_number}` : null,
        });
    }
    return payments.sort((a, b) => b.paidAt.localeCompare(a.paidAt));
}

/** Inicial / renovación from the ANTIGÜEDAD of the latest paid commission line. */
function contractType(details: ContractDetail[]): string | null {
    const latest = [...details]
        .filter((d) => d.payment_date)
        .sort((a, b) => (b.payment_date ?? '').localeCompare(a.payment_date ?? ''))[0];
    const seniority = Number.parseFloat(latest?.seniority?.replace(/[,\s]/g, '') ?? '');
    if (!Number.isFinite(seniority)) return null;
    return seniority === 1 ? 'Inicial' : 'Renovación';
}

function relativeDue(due: Date): string {
    const days = daysPastDue(due) ?? 0;
    if (days > 0) return days === 1 ? 'Hace 1 día' : `Hace ${days} días`;
    if (days === 0) return 'Hoy';
    return days === -1 ? 'Mañana' : `En ${-days} días`;
}

function ContractDetailsPageContent() {
    const router = useRouter();
    const params = useParams();
    const { profile, session } = useAuth();
    const { toast } = useToast();
    const contractId = params.id as string;
    const [editOpen, setEditOpen] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [rehabilitateOpen, setRehabilitateOpen] = useState(false);
    const [rehabilitating, setRehabilitating] = useState(false);
    const [viewing, setViewing] = useState<ViewedDocument | null>(null);
    const [editingDetail, setEditingDetail] = useState<ContractDetail | null>(null);
    const [paymentTarget, setPaymentTarget] = useState<RegisterPaymentTarget | null>(null);
    const [contract, setContract] = useState<Contract | null>(null);
    const [client, setClient] = useState<Client | null>(null);
    const [consultant, setConsultant] = useState<Consultant | null>(null);
    const [allDetails, setAllDetails] = useState<ContractDetail[]>([]);
    const [marks, setMarks] = useState<ContractCollectionPayment[]>([]);
    const [files, setFiles] = useState<ContractFile[]>([]);
    const [activity, setActivity] = useState<AuditLogEntry[]>([]);
    const [contractDetails, setContractDetails] = useState<ContractDetail[]>([]);
    const [detailsTotal, setDetailsTotal] = useState(0);
    const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
    const [page, setPage] = useResetPage(String(pageSize));
    const [loading, setLoading] = useQueryLoading(contractId);
    const [detailsLoading, setDetailsLoading] = useQueryLoading(`${contractId}\0${page}\0${pageSize}`);

    const loadContractMeta = useCallback(async () => {
        try {
            const [withRelations, details, payments, contractFiles, entries] = await Promise.all([
                db.contract.getContractWithRelations(contractId),
                db.contractDetail.getDetailsByContract(contractId),
                db.collections.listContractPayments(contractId),
                db.files.listByContract(contractId).catch((error) => {
                    console.error('Error loading contract files:', error);
                    return [] as ContractFile[];
                }),
                db.auditLog.listByEntity('contract', contractId).catch((error) => {
                    console.error('Error loading contract activity:', error);
                    return [] as AuditLogEntry[];
                }),
            ]);
            if (!withRelations) throw new Error('Contract not found');
            setContract(withRelations.contract);
            setClient(withRelations.client);
            setConsultant(withRelations.consultant);
            setAllDetails(details);
            setMarks(payments);
            setFiles(contractFiles);
            setActivity(entries);
        } catch (error) {
            console.error('Error loading contract data:', error);
        } finally {
            setLoading(false);
        }
    }, [contractId, setLoading]);

    const loadDetailsPage = useCallback(async () => {
        try {
            const result = await db.contractDetail.getDetailsByContractPage(contractId, { page, pageSize });
            setContractDetails(result.rows);
            setDetailsTotal(result.total);
        } catch (error) {
            console.error('Error loading contract details page:', error);
        } finally {
            setDetailsLoading(false);
        }
    }, [contractId, page, pageSize, setDetailsLoading]);

    useQueryEffect(Boolean(contractId), loadContractMeta);
    useQueryEffect(Boolean(contractId), loadDetailsPage);

    const evidenceByPayment = useMemo(() => {
        const map = new Map<string, string>();
        for (const file of files) if (file.collection_payment_id) map.set(file.collection_payment_id, file.id);
        return map;
    }, [files]);
    const payments = useMemo(
        () => mergePayments(marks, allDetails, evidenceByPayment),
        [marks, allDetails, evidenceByPayment],
    );

    // Documents open in the in-app viewer (no new tab)
    const openDocument = (fileId: string) => {
        const file = files.find((f) => f.id === fileId);
        setViewing({ id: fileId, name: file?.display_name || file?.file_name || 'Documento', mimeType: file?.file_type });
    };
    const calendar = useMemo(
        () =>
            contract
                ? receiptCalendar({
                      issueDate: contract.issue_date,
                      paymentMethod: contract.payment_method,
                      payments,
                      inForceAsOf: isInForce(contract.status) ? contract.in_force_as_of : null,
                  })
                : null,
        [contract, payments],
    );

    const rehabilitate = async () => {
        if (!contract) return;
        if (!session?.access_token) {
            toast.error('Tu sesión expiró. Vuelve a iniciar sesión.');
            return;
        }
        setRehabilitating(true);
        try {
            const result = await rehabilitateContractAction(session.access_token, { contractId: contract.id });
            if (!result.ok) {
                toast.error(result.error);
                return;
            }
            setContract(result.data);
            setRehabilitateOpen(false);
            toast.success('Póliza rehabilitada: ya está en vigor y en cobranza.');
            void loadContractMeta();
        } catch (error) {
            console.error('rehabilitate failed:', error);
            toast.error('No se pudo rehabilitar la póliza. Intenta de nuevo.');
        } finally {
            setRehabilitating(false);
        }
    };

    if (loading && !contract) {
        return (
            <DetailPageSkeleton />
        );
    }

    if (!contract) {
        return (
            <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center">
                <p className="text-lg text-(--lifeops-muted)">No encontramos esta póliza.</p>
                <Button type="button" variant="brand" onClick={() => router.push('/dashboard/contracts')}>
                    Volver a pólizas
                </Button>
            </div>
        );
    }

    const inactive = !isInForce(contract.status);
    const policyStatus = POLICY_STATUS[contract.status] ?? POLICY_STATUS.ANNULLED;
    const lastPaid = maxIsoDate(...payments.map((p) => p.paidAt));
    const lastPayment = payments.find((p) => p.paidAt === lastPaid) ?? null;
    const nextDue = inactive
        ? null
        : nextCollectionDue({
              issueDate: contract.issue_date,
              lastPaidAt: lastPaid,
              paymentMethod: contract.payment_method,
              collectionDay: contract.collection_day,
              inForceAsOf: contract.in_force_as_of,
          });
    const status: PortfolioStatus = inactive ? 'inactive' : carteraStatus(nextDue);
    const late = daysPastDue(nextDue);
    const dueReceipts = calendar?.receipts.filter((r) => daysPastDue(r.due)! >= 0) ?? [];
    const paidReceipts = calendar?.receipts.filter((r) => r.state === 'paid').length ?? 0;
    const nextReceipt = calendar?.receipts[calendar.nextIndex];
    const officeView = profile?.role === 'promotory';
    const currencyCode = normalizeCurrency(contract.currency);

    const statusDetail =
        status === 'inactive'
            ? 'No entra en cobranza'
            : status === 'no_payment'
              ? 'Falta fecha de emisión y no hay pagos'
              : late != null && late > 0
                ? `${late} días de atraso`
                : contract.in_force_as_of && (!lastPaid || contract.in_force_as_of > lastPaid)
                  ? `Al día según la aseguradora (${formatDateShortEsLocal(contract.in_force_as_of)})`
                  : 'Sin atraso';

    return (
        <div className="space-y-4">
            <PageHeader
                title={contract.contract_number || 'Sin número'}
                watermark="Póliza"
                eyebrow={
                    <Link href="/dashboard/contracts" className="inline-flex items-center text-[#FBDBAC] hover:underline">
                        ← Volver a pólizas
                    </Link>
                }
                description={[client?.name, consultant?.name].filter(Boolean).join(' · ') || 'Expediente de la póliza'}
                actions={
                    <div className="flex flex-wrap gap-2">
                        {contract.status === 'ANNULLED' ? (
                            <EntityActionButton icon={RotateCcw} label="Rehabilitar" onClick={() => setRehabilitateOpen(true)} />
                        ) : null}
                        <EntityActionButton icon={Pencil} label="Editar" onClick={() => setEditOpen(true)} />
                        {profile?.role === 'promotory' && contract.consultant_id ? (
                            <ReassignConsultantDialog
                                officeId={profile.id}
                                contractId={contract.id}
                                currentConsultantId={contract.consultant_id}
                                currentClientId={contract.client_id ?? null}
                                onReassigned={() => {
                                    setLoading(true);
                                    void loadContractMeta();
                                }}
                            />
                        ) : null}
                        <EntityActionButton icon={Trash2} label="Eliminar" variant="danger" onClick={() => setDeleteOpen(true)} />
                    </div>
                }
            />

            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                <StatTile
                    label="Estado"
                    icon={CircleDot}
                    value={
                        <span className="flex items-center gap-2 text-xl">
                            <span
                                className="h-3 w-3 shrink-0 rounded-full"
                                style={{ background: inactive ? policyStatus.color : PORTFOLIO_STATUS[status].color }}
                                aria-hidden
                            />
                            {inactive ? policyStatus.label : PORTFOLIO_STATUS[status].label}
                        </span>
                    }
                    detail={statusDetail}
                />
                <StatTile
                    label="Próximo cobro"
                    icon={CalendarClock}
                    value={<span className="text-xl">{nextDue ? formatDateShortEsLocal(nextDue) : '—'}</span>}
                    detail={
                        nextDue
                            ? [relativeDue(nextDue), nextReceipt ? `recibo ${nextReceipt.number}/${nextReceipt.perYear}` : null]
                                  .filter(Boolean)
                                  .join(' · ')
                            : undefined
                    }
                />
                <StatTile
                    label="Último pago"
                    icon={HandCoins}
                    value={<span className="text-xl">{lastPaid ? formatDateShortEsLocal(lastPaid) : '—'}</span>}
                    detail={
                        lastPayment
                            ? lastPayment.source === 'import'
                                ? 'Del archivo de comisiones'
                                : 'Registrado en cobranza'
                            : 'Sin pagos registrados'
                    }
                />
                <StatTile
                    label={calendar ? 'Recibos pagados' : 'Pagos registrados'}
                    icon={ReceiptText}
                    value={calendar ? paidReceipts : payments.length}
                    detail={calendar ? `De ${dueReceipts.length} recibos vencidos a la fecha` : 'Sin calendario de recibos'}
                />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div className="min-w-0 lg:col-span-2">
                    <ReceiptCalendar
                        calendar={calendar}
                        payments={payments}
                        issueDate={contract.issue_date}
                        paymentMethod={contract.payment_method}
                        currency={contract.currency}
                        onCompletePaymentMethod={() => setEditOpen(true)}
                        onOpenEvidence={openDocument}
                        actions={
                            inactive ? null : (
                                <Button
                                    type="button"
                                    variant="brand"
                                    size="sm"
                                    onClick={() =>
                                        setPaymentTarget({
                                            contractId: contract.id,
                                            contractNumber: contract.contract_number ?? null,
                                            clientName: client?.name ?? null,
                                            nextDue,
                                            suggestedAmount: payments.find((p) => p.amount != null)?.amount ?? null,
                                            collectionDay: contract.collection_day ?? null,
                                            currency: contract.currency ?? null,
                                        })
                                    }
                                >
                                    Registrar pago
                                </Button>
                            )
                        }
                    />
                    <div className="mt-4">
                        <PaymentEvidenceCard files={files} payments={marks} onOpen={openDocument} />
                    </div>
                </div>

                <div className="flex min-w-0 flex-col gap-4">
                    <DetailCard className="mb-0" title="Datos de la póliza">
                        <DetailRows>
                            <DetailRow label="Póliza">
                                <span className="font-mono">{contract.contract_number || '—'}</span>
                            </DetailRow>
                            <DetailRow label="Estatus">
                                <DotBadge color={policyStatus.color} label={policyStatus.label} />
                            </DetailRow>
                            {contract.in_force_as_of && !inactive ? (
                                <DetailRow label="En vigor según aseguradora">
                                    {formatDateShortEsLocal(contract.in_force_as_of)}
                                </DetailRow>
                            ) : null}
                            <DetailRow label="Cliente">
                                {client?.id ? (
                                    <Link href={`/dashboard/clients/${client.id}`} className="text-(--lifeops-accent) hover:underline">
                                        {client.name}
                                    </Link>
                                ) : (
                                    client?.name || '—'
                                )}
                            </DetailRow>
                            <DetailRow label="Asesor">
                                {consultant?.id && officeView ? (
                                    <Link
                                        href={`/dashboard/consultants/${consultant.id}`}
                                        className="text-(--lifeops-accent) hover:underline"
                                    >
                                        {consultant.name}
                                        {consultant.consultant_code ? ` · ${consultant.consultant_code}` : ''}
                                    </Link>
                                ) : (
                                    consultant?.name || '—'
                                )}
                            </DetailRow>
                            <DetailRow label="Forma de pago">
                                {contract.payment_method || <MissingPaymentMethodFlag />}
                            </DetailRow>
                            <DetailRow label="Emisión">{formatDateShortEsLocal(contract.issue_date)}</DetailRow>
                            {contract.collection_day ? (
                                <DetailRow label="Día de cobro">{contract.collection_day}</DetailRow>
                            ) : null}
                            <DetailRow label="Moneda">
                                {currencyCode ? CURRENCY_LABELS[currencyCode] : contract.currency || '—'}
                            </DetailRow>
                            {contract.annual_premium ? (
                                <DetailRow label="Prima anual">{contract.annual_premium}</DetailRow>
                            ) : null}
                            {contract.insured_amount ? (
                                <DetailRow label="Suma asegurada">{contract.insured_amount}</DetailRow>
                            ) : null}
                            {contract.project_name ? (
                                <DetailRow label="Plan">{contract.project_name}</DetailRow>
                            ) : null}
                            {contract.line_code ? (
                                <DetailRow label="Ramo">{LINE_LABELS[contract.line_code] ?? contract.line_code}</DetailRow>
                            ) : null}
                            {contract.plan_classification ? (
                                <DetailRow label="Clasificación">{planClassificationLabel(contract.plan_classification)}</DetailRow>
                            ) : null}
                            {contract.insured_name ? (
                                <DetailRow label="Asegurado principal">{contract.insured_name}</DetailRow>
                            ) : null}
                            {contract.end_date ? (
                                <DetailRow label="Fin de vigencia">{formatDateShortEsLocal(contract.end_date)}</DetailRow>
                            ) : null}
                            {contract.annual_premium_mxn != null ? (
                                <DetailRow label="Prima anual en pesos">{formatAmount(contract.annual_premium_mxn, 'PESO')}</DetailRow>
                            ) : null}
                            {contract.insured_amount_mxn != null ? (
                                <DetailRow label="Suma asegurada en pesos">{formatAmount(contract.insured_amount_mxn, 'PESO')}</DetailRow>
                            ) : null}
                            {contract.deductible_mxn != null ? (
                                <DetailRow label="Deducible">{formatAmount(contract.deductible_mxn, 'PESO')}</DetailRow>
                            ) : null}
                            {contract.payment_channel ? (
                                <DetailRow label="Conducto de cobro">{paymentChannelLabel(contract.payment_channel)}</DetailRow>
                            ) : null}
                            {contractType(allDetails) ? (
                                <DetailRow label="Tipo">{contractType(allDetails)}</DetailRow>
                            ) : null}
                            <DetailRow label="Origen">
                                {contract.source === 'manual'
                                    ? 'Alta manual'
                                    : contract.source === 'mixed'
                                      ? 'Manual y archivo de comisiones'
                                      : 'Archivo de comisiones'}
                            </DetailRow>
                            <DetailRow label="Estatus">
                                <DotBadge label={PORTFOLIO_STATUS[status].label} color={PORTFOLIO_STATUS[status].color} />
                            </DetailRow>
                        </DetailRows>
                    </DetailCard>

                    <ActivityCard entries={activity} />
                </div>
            </div>

            <EditContractDialog
                open={editOpen}
                contract={contract}
                onClose={() => setEditOpen(false)}
                onSaved={(next) => {
                    setContract(next);
                    toast.success('Póliza actualizada.');
                    // Refresh calendar inputs and the history
                    void loadContractMeta();
                }}
            />

            <EditContractDetailDialog
                open={editingDetail != null}
                detail={editingDetail}
                currency={contract.currency}
                onClose={() => setEditingDetail(null)}
                onSaved={() => {
                    toast.success('Recibo actualizado.');
                    // Table row, receipt calendar, cobranza marks and the history
                    void loadDetailsPage();
                    void loadContractMeta();
                }}
            />

            <DocumentViewerDialog document={viewing} onClose={() => setViewing(null)} />

            <ConfirmDialog
                open={rehabilitateOpen}
                title={`¿Rehabilitar la póliza ${contract.contract_number ?? ''}?`.replace(' ?', '?')}
                description={
                    'Vuelve a quedar en vigor y entra en cobranza. Los recibos vencidos hasta hoy se toman como pagados (la rehabilitación los cubre) y el próximo cobro es el siguiente recibo.\n\nSi quieres conservar el detalle de esos pagos, regístralos en cobranza.'
                }
                confirmVariant="brand"
                confirmLabel="Sí, rehabilitar"
                loadingLabel="Rehabilitando…"
                loading={rehabilitating}
                onCancel={() => (rehabilitating ? undefined : setRehabilitateOpen(false))}
                onConfirm={() => void rehabilitate()}
            />

            <DeleteContractDialog
                contract={deleteOpen ? { id: contract.id, contractNumber: contract.contract_number ?? null } : null}
                onClose={() => setDeleteOpen(false)}
                onDeleted={() => router.push('/dashboard/contracts')}
            />

            <RegisterPaymentDialog
                open={paymentTarget != null}
                target={paymentTarget}
                onClose={() => setPaymentTarget(null)}
                onSaved={async () => {
                    setLoading(true);
                    await loadContractMeta();
                }}
            />

            <div className={dataTablePanelClass}>
                <div className="px-4 pt-4 pb-3 sm:px-5">
                    <h2 className="text-[15px] font-semibold text-(--lifeops-fg)">Recibos del archivo de comisiones</h2>
                    <p className="mt-0.5 text-sm text-(--lifeops-muted)">
                        {detailsTotal > 0
                            ? `${detailsTotal} renglones importados. Al volver a subir un archivo se actualizan por número de recibo.`
                            : 'Aún no hay renglones importados para esta póliza.'}
                    </p>
                </div>
                {detailsTotal > 0 || contractDetails.length > 0 ? (
                    <>
                        <DataTable
                            rows={contractDetails}
                            getRowKey={(detail) => detail.id}
                            columns={[
                                {
                                    id: 'receipt_number',
                                    header: 'Recibo',
                                    className: 'font-mono',
                                    cell: (d) => d.receipt_number || '—',
                                },
                                { id: 'payment_date', header: 'Fecha pago', cell: (d) => formatDateShortEsLocal(d.payment_date) },
                                {
                                    id: 'issue_date',
                                    header: 'Emisión',
                                    tone: 'muted',
                                    cell: (d) => formatDateShortEsLocal(d.issue_date),
                                },
                                {
                                    id: 'premium_payment',
                                    header: 'Prima pago',
                                    align: 'right',
                                    className: 'tabular-nums',
                                    cell: (d) => formatAmount(d.premium_payment, contract.currency) ?? '—',
                                },
                                {
                                    id: 'collection_premium',
                                    header: 'Prima cobro',
                                    align: 'right',
                                    className: 'tabular-nums',
                                    cell: (d) => formatAmount(d.collection_premium, contract.currency) ?? '—',
                                },
                                {
                                    id: 'commission_honoraries',
                                    header: 'Comisión / honorarios',
                                    align: 'right',
                                    className: 'tabular-nums',
                                    cell: (d) => formatAmount(d.commission_honoraries, contract.currency) ?? '—',
                                },
                                {
                                    id: 'commission_percentage',
                                    header: '% comisión',
                                    align: 'right',
                                    className: 'tabular-nums',
                                    cell: (d) =>
                                        d.commission_percentage != null
                                            ? `${d.commission_percentage.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
                                            : '—',
                                },
                                {
                                    id: 'target_premium',
                                    header: 'Prima meta',
                                    align: 'right',
                                    className: 'tabular-nums',
                                    cell: (d) => formatAmount(d.target_premium, contract.currency) ?? '—',
                                },
                                {
                                    id: 'commission_premium',
                                    header: 'Prima comisión',
                                    align: 'right',
                                    className: 'tabular-nums',
                                    cell: (d) => formatAmount(d.commission_premium, contract.currency) ?? '—',
                                },
                                { id: 'seniority', header: 'Antigüedad', tone: 'muted', cell: (d) => d.seniority || '—' },
                                { id: 'movement', header: 'Movimiento', tone: 'muted', cell: (d) => d.movement || '—' },
                                { id: 'payment_method', header: 'Forma de pago', tone: 'muted', cell: (d) => d.payment_method || '—' },
                                ...(officeView
                                    ? [
                                          {
                                              id: 'actions',
                                              header: <span className="sr-only">Acciones</span>,
                                              align: 'right' as const,
                                              sticky: true,
                                              cell: (d: ContractDetail) => (
                                                  <RowActions
                                                      editLabel={d.receipt_number ? `Editar recibo ${d.receipt_number}` : 'Editar recibo'}
                                                      onEdit={() => setEditingDetail(d)}
                                                  />
                                              ),
                                          },
                                      ]
                                    : []),
                            ]}
                        />
                        <TablePagination
                            page={page}
                            pageSize={pageSize}
                            total={detailsTotal}
                            disabled={detailsLoading}
                            onPageChange={setPage}
                            onPageSizeChange={(size) => {
                                setPageSize(size);
                                setPage(1);
                            }}
                        />
                    </>
                ) : null}
            </div>
        </div>
    );
}

export default function ContractDetailsPage() {
    return (
        <ProtectedRoute allowedRoles={['promotory', 'consultant']}>
            <ContractDetailsPageContent />
        </ProtectedRoute>
    );
}
