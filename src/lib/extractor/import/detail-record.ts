/** One commission-file row → the receipt values stored in `contract_detail` (import + review). */
import { normalizeReceiptNumber } from "@/lib/extractor/receipt";
import { cellAt, type ImportColumns } from "./columns";
import { normalizePaymentMethod, parseDate, parseNumeric } from "./parse";

export function detailValuesFromRow(row: string[], columns: ImportColumns) {
  return {
    receipt_number: normalizeReceiptNumber(cellAt(row, columns.receiptNumber)), // RECIBO
    issue_date: parseDate(cellAt(row, columns.issueDate)), // FECHA EMISION
    payment_date: parseDate(cellAt(row, columns.paymentDate)), // FECHA PAGO
    premium_payment: parseNumeric(cellAt(row, columns.premiumPayment)), // PRIMA PAGO
    payment_method: normalizePaymentMethod(cellAt(row, columns.paymentMethod)), // FORMA DE PAGO
    commission_honoraries: parseNumeric(cellAt(row, columns.commissionHonoraries)), // COMISION/HONORARIOS
    commission_percentage: parseNumeric(cellAt(row, columns.commissionPercentage)), // % COMISION
    collection_premium: parseNumeric(cellAt(row, columns.collectionPremium)), // PRIMA COBRO
    seniority: cellAt(row, columns.seniority), // ANTIGÜEDAD
    target_premium: parseNumeric(cellAt(row, columns.targetPremium)), // PRIMA META
    movement: cellAt(row, columns.movement), // MOVIMIENTO
    commission_premium: parseNumeric(cellAt(row, columns.commissionPremium)), // PRIMA COMISION
  };
}
