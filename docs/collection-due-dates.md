# Fechas de cobro — cómo se calculan y dónde se muestran

Guía corta: **de dónde sale la fecha** en Cobranza y en Vista general / Mi resumen.

Regla de producto: la pantalla debe mostrar cobros **actuales y próximos**. Un archivo de comisiones viejo **no** debe “ganar” sobre la fecha de último pago que el usuario registró.

---

## Ideas base

| Concepto | Qué es |
| --- | --- |
| **Último pago conocido** | La fecha más reciente entre: marca en `contract_collection_payment.paid_at` (incluye fecha previa del alta/import) y, si no hay marcas, la `FECHA PAGO` más reciente en `contract_detail`. |
| **Fecha previa / último pago** | La que pides al dar de alta una póliza nueva (import o registro manual). Puede ser **más reciente** que el archivo de comisiones (archivo viejo). Solo se rechazan fechas futuras (hoy sí). |
| **FECHA EMISION (póliza)** | Si falta en el archivo, se pide en el dialog. Debe ser **anterior** a la fecha del archivo de comisiones; no futuras (hoy sí, si el archivo es más reciente). |
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
último pago conocido + forma de pago (+ collection_day)
        │
        ▼
RPC (misma fórmula que Cobranza → next_due_from_last_payment)
  • list_contracts_pending_payment  → próximo cobro en ≤ 15 días (o vencido ≤ 30)
  • list_contracts_at_risk          → próximo cobro con > 30 días de atraso
        │
        ▼
CollectionPriorityLists → "Cobro: DD/Mmm/AAAA"
```

Un archivo de comisiones viejo **no** mete en peligro meses intermedios vacíos: solo cuenta el **próximo cobro** desde el último pago conocido.

---

## Comparación

| | Vista general | Cobranza |
| --- | --- | --- |
| Motor | `último paid_at` / FECHA PAGO + forma de pago (+ `collection_day`) | Igual |
| ¿Fecha previa? | Sí (es el `paid_at` más reciente) | Sí |
| Archivo viejo | No inventa atrasos mes a mes; manda el último pago | Igual |
| Monto | No muestra monto en las listas de prioridad | Prima del último grupo de líneas del archivo |

---

## Registrar pago desde Cobranza

En `/dashboard/collections`, cada fila tiene **Registrar pago**:

1. Fecha real de pago (por defecto = próximo cobro sugerido)  
2. Día de cobro + monto/notas opcionales  
3. **Evidencia obligatoria** (imagen/PDF) → `contract_collection_payment` + `file.collection_payment_id`  
4. Al guardar, el próximo cobro se recalcula desde ese `paid_at`

---

Siguiente foco (backlog): CURP/RFC en clientes (P1-1), badges “en peligro” + UX (P1-4 / P1-5).
