# Fechas de cobro — cómo se calculan

Regla de producto: el próximo cobro sale del **calendario de recibos** de la póliza, no de "último pago + periodo".

## Calendario de recibos

- Los recibos caen el **día de la FECHA EMISION**, cada periodo de la forma de pago (Mensual 1, Trimestral 3, Semestral 6, Anual 12 meses; sin forma de pago se asume mensual).
- Si el mes es más corto, el día se ajusta al último día del mes (emisión 31 → 28/29 en febrero).

Ejemplo: emisión **20/dic**, **Trimestral** → recibos **20 de dic, mar, jun y sep**.

## Próximo cobro

```
último pago conocido (marca de cobranza paid_at, o FECHA PAGO más reciente del archivo)
        │
        ├─ cubre el recibo más reciente con vencimiento ≤ fecha de pago + 15 días
        │
        ▼
próximo cobro = el recibo siguiente del calendario
```

- **Pago tardío:** pagó el 21/jul → cubre el recibo de jun (20/jun) → próximo cobro **20/sep** (no 21/oct).
- **Pago adelantado (hasta 15 días):** pagó el 10/sep → cuenta para el recibo del 20/sep → próximo **20/dic**.
- **Sin pagos:** el próximo cobro es el primer recibo (la fecha de emisión).
- **Sin FECHA EMISION:** regla anterior, último pago + periodo (día = `collection_day` o el del pago).

Código: `nextCollectionDue` en `src/lib/collections/next-due.ts` y `next_collection_due` en SQL (migración `029`). Deben dar lo mismo.

## Importación

- Solo se pide la **fecha de emisión** de las pólizas nuevas que no la traen en el archivo.
- Ya no se pide "último pago": los pagos salen de las FECHA PAGO del archivo y de los pagos registrados en cobranza.
- Estatus inicial de una póliza nueva: `ATRASADO` si su próximo cobro tiene más de 30 días de atraso, si no `CORRIENTE`.

## Dónde se usa

| Pantalla | Fuente |
| --- | --- |
| Cobranza (tablero) | `list_collection_board` (SQL `next_collection_due` via `contract_cartera_rows`) |
| Vista general / Mi resumen | `get_collection_overview` |
| En peligro / Pagos por registrar | `list_contracts_at_risk`, `list_contracts_pending_payment` |

**En peligro:** próximo cobro con más de 30 días de atraso. **Por registrar:** vence en los próximos 15 días o lleva hasta 30 días de atraso.
