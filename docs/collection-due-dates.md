# Fechas de cobro — cómo se calculan y dónde se muestran

Guía corta: **de dónde sale la fecha** en Cobranza y en Vista general / Mi resumen.

Regla de producto: la pantalla debe mostrar cobros **actuales y próximos**. Un archivo de comisiones viejo **no** debe “ganar” sobre la fecha de último pago que el usuario registró.

---

## Ideas base

| Concepto | Qué es |
| --- | --- |
| **Último pago conocido** | La fecha más reciente entre: marca en `contract_collection_payment.paid_at` (incluye fecha previa del alta/import) y, si no hay marcas, la `FECHA PAGO` más reciente en `contract_detail`. |
| **Fecha previa / último pago** | La que pides al dar de alta una póliza nueva (import o registro manual). |
| **Día de cobro** | `contract.collection_day` (1–31). Suele ser el día de la fecha previa. |
| **Forma de pago** | Mensual +1 mes, Trimestral +3, Semestral +6, Anual +12. |
| **FECHA PAGO del archivo** | Líneas de comisión → `contract_detail`. Sirven para monto / historial; **no mandan** si hay un último pago más reciente. |

Código compartido: `src/lib/collections/next-due.ts`.

---

## Alta e import (misma huella)

Import (póliza nueva) y registro manual escriben lo mismo:

```
Usuario ingresa "último pago" (ej. 5/Oct/2026)
        │
        ├─► contract.collection_day = 5
        │
        └─► contract_collection_payment
              paid_at = 2026-10-05  (ese mes queda marcado como pagado)
```

Así import y alta manual quedan **alineados** para prioridades y para Cobranza.

---

## Fórmula del próximo cobro (única regla de negocio)

```
último pago conocido  (la más reciente)
        +
N meses según forma de pago
        +
día = collection_day (si existe; si no, el día del último pago)
        │
        ▼
fecha de cobro mostrada
```

**Ejemplo (tu caso):**

1. Importas comisiones de **marzo 2026** (archivo viejo).  
2. Al registrar la póliza nueva pones **último pago = 5/Oct/2026**, forma **Mensual**.  
3. Próximo cobro = **5/Nov/2026** (no 10/Abr/2026 del archivo).

Si no hubiera fecha previa ni marcas, recién ahí se usa la `FECHA PAGO` del detalle como respaldo.

---

## Flujo hasta Cobranza (`/dashboard/collections`)

```
contract (+ collection_day, payment_method, cliente)
        +
última paid_at en contract_collection_payment
        +
(opcional) FECHA PAGO del detalle solo si no hay marcas
        │
        ▼
db.collections.listScheduleRows
  next_due = nextDueFromLastPayment(...)
  monto ≈ suma de primas del grupo FECHA PAGO más reciente del archivo
        │
        ▼
Tabla Cobranza
  filtro: "Desde este mes en adelante" (default) u "Solo este mes"
  → oculta vencimientos viejos (ej. Abr/2026 cuando ya estás en Oct)
```

---

## Flujo hasta Vista general / Mi resumen

```
collection_day + marcas paid_at por mes
        │
        ▼
RPC
  • list_contracts_pending_payment  → pagos del mes actual sin marca, ≤ 15 días
  • list_contracts_at_risk          → sin pago y > 30 días de atraso
        │
        ▼
CollectionPriorityLists → "Cobro: DD/Mmm/AAAA"
```

Aquí también manda el **día de cobro** y las **marcas** (incluida la fecha previa). Un archivo viejo no redefine el próximo cobro si ya marcaste un último pago más reciente.

---

## Comparación

| | Vista general | Cobranza |
| --- | --- | --- |
| Motor | `collection_day` + marcas del mes | `último paid_at` + forma de pago (+ `collection_day`) |
| ¿Fecha previa? | Sí (día + marca) | Sí (es el `paid_at` más reciente) |
| Archivo viejo | No desplaza el próximo cobro si hay pago reciente | Tampoco: manda el último pago conocido |
| Monto | No muestra monto en las listas de prioridad | Prima del último grupo de líneas del archivo |

---

## Pendiente (backlog)

Registrar un pago **desde la lista de Cobranza** con evidencia (foto/PDF) — ver `docs/backlog.md` (P1-7). La evidencia al marcar un mes en el grid de control ya existía en el flujo de marca mensual; falta el CTA en esta lista.
