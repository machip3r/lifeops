/**
 * «Conducto de cobro» («Método de Pago» in the Mina de Oro), stored as the insurer writes it so
 * the import and manual registration compare equal.
 */
export const PAYMENT_CHANNEL_OPTIONS = [
  "AGENTE",
  "CARGO AUTOMATICO A TARJ CRED",
  "TDD",
  "MODO DIRECTO",
  "SEGUNOMINA",
  "POLIZA GRATUITA",
] as const;

export const PAYMENT_CHANNEL_LABELS: Record<string, string> = {
  AGENTE: "Agente",
  "CARGO AUTOMATICO A TARJ CRED": "Cargo automático a tarjeta de crédito",
  TDD: "Tarjeta de débito (TDD)",
  "MODO DIRECTO": "Modo directo",
  SEGUNOMINA: "Descuento por nómina",
  "POLIZA GRATUITA": "Póliza gratuita",
};

export function paymentChannelLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return PAYMENT_CHANNEL_LABELS[value.trim().toUpperCase()] ?? value;
}
