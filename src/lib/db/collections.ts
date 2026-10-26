import type { SupabaseClient } from '@supabase/supabase-js';
import { maxIsoDate, nextDueFromLastPayment } from '@/lib/collections/next-due';
import { IMPORT_BATCH_SIZE, chunkArray } from '@/lib/extractor/batch';
import {
    listContractIdsWithPayments,
    seedPriorPayments,
    syncPaymentsFromImportedDetailsBatch,
    writeImportSyncAudit,
} from './collections-service';

/** Cobranza reads + import sync (RLS-scoped client: browser session or user JWT). */
export function createCollectionsDb(supabase: SupabaseClient) {
    const collectionsDb = {
        listScheduleRows: async (opts: {
            officeId?: string;
            consultantId?: string;
        }): Promise<
            Array<{
                contract_id: string;
                contract_number: string | null;
                client_name: string | null;
                payment_method: string | null;
                collection_day: number | null;
                last_paid_at: string | null;
                premium_payment: number;
                next_due: Date | null;
            }>
        > => {
            let contractQuery = supabase
                .from('contract')
                .select(
                    'id, contract_number, payment_method, collection_day, client:client_id(name)',
                )
                .neq('status', 'INACTIVE');

            if (opts.consultantId) {
                contractQuery = contractQuery.eq('consultant_id', opts.consultantId);
            } else if (opts.officeId) {
                contractQuery = contractQuery.eq('office_id', opts.officeId);
            } else {
                return [];
            }

            const { data: contracts, error: cErr } = await contractQuery;
            if (cErr) throw cErr;
            if (!contracts?.length) return [];

            const ids = contracts.map((c: { id: string }) => c.id);
            const lastPaidByContract = new Map<string, string>();
            const amountByContract = new Map<string, number>();
            const latestDetailDateByContract = new Map<string, string>();

            for (const idChunk of chunkArray(ids, IMPORT_BATCH_SIZE)) {
                const { data: payments, error: pErr } = await supabase
                    .from('contract_collection_payment')
                    .select('contract_id, paid_at')
                    .in('contract_id', idChunk)
                    .not('paid_at', 'is', null);
                if (pErr) throw pErr;
                for (const row of payments || []) {
                    const cid = row.contract_id as string;
                    const paid = (row.paid_at as string | null)?.slice(0, 10) ?? null;
                    if (!paid) continue;
                    const prev = lastPaidByContract.get(cid);
                    if (!prev || paid > prev) lastPaidByContract.set(cid, paid);
                }

                const { data: details, error: dErr } = await supabase
                    .from('contract_detail')
                    .select('contract_id, payment_date, premium_payment')
                    .in('contract_id', idChunk);
                if (dErr) throw dErr;

                // Amount = sum of primas on the most recent FECHA PAGO group (installment proxy).
                const byContractDetails = new Map<
                    string,
                    Array<{ payment_date: string | null; premium_payment: number | null }>
                >();
                for (const d of details || []) {
                    const cid = d.contract_id as string;
                    const list = byContractDetails.get(cid) || [];
                    list.push({
                        payment_date: (d.payment_date as string | null) ?? null,
                        premium_payment:
                            d.premium_payment != null ? Number(d.premium_payment) : null,
                    });
                    byContractDetails.set(cid, list);
                }
                for (const [cid, list] of byContractDetails) {
                    let latest: string | null = null;
                    for (const d of list) {
                        const iso = d.payment_date?.slice(0, 10) ?? null;
                        if (iso && (!latest || iso > latest)) latest = iso;
                    }
                    if (latest) latestDetailDateByContract.set(cid, latest);
                    let sum = 0;
                    for (const d of list) {
                        if ((d.payment_date?.slice(0, 10) ?? null) === latest) {
                            sum += d.premium_payment ?? 0;
                        }
                    }
                    amountByContract.set(cid, sum);
                }
            }

            return contracts.map((c: any) => {
                const lastPaid = maxIsoDate(
                    lastPaidByContract.get(c.id),
                    latestDetailDateByContract.get(c.id),
                );
                const collectionDay =
                    c.collection_day != null ? Number(c.collection_day) : null;
                return {
                    contract_id: c.id as string,
                    contract_number: (c.contract_number as string | null) ?? null,
                    client_name: (c.client?.name as string | null) ?? null,
                    payment_method: (c.payment_method as string | null) ?? null,
                    collection_day: Number.isFinite(collectionDay) ? collectionDay : null,
                    last_paid_at: lastPaid,
                    premium_payment: amountByContract.get(c.id) ?? 0,
                    next_due: nextDueFromLastPayment(
                        lastPaid,
                        c.payment_method,
                        collectionDay,
                    ),
                };
            });
        },

        seedPriorPayments: (input: Parameters<typeof seedPriorPayments>[1]) =>
            seedPriorPayments(supabase, input),

        listContractIdsWithPayments: (contractIds: string[]) =>
            listContractIdsWithPayments(supabase, contractIds),

        syncPaymentsFromImportedDetails: (
            input: Parameters<typeof syncPaymentsFromImportedDetailsBatch>[1],
        ) => syncPaymentsFromImportedDetailsBatch(supabase, input),

        writeImportSyncAudit: (input: Parameters<typeof writeImportSyncAudit>[1]) =>
            writeImportSyncAudit(supabase, input),
    };

    return collectionsDb;
}
