# Fechas de cobro — cómo se calculan y dónde se muestran

Guía corta para entender **de dónde sale la fecha** que ves en Cobranza y en Vista general / Mi resumen.

Hay **dos caminos**. No usan exactamente la misma regla.

---

## Ideas base (vocabulario)

| Concepto | Qué es |
| --- | --- |
| **Fecha de pago del archivo** | `FECHA PAGO` de cada línea en el HTML de comisiones → se guarda en `contract_detail.payment_date`. |
| **Fecha previa / último pago** | La que pides al dar de alta una póliza nueva (import o registro manual). Es el último cobro **antes** de este archivo / alta. |
| **Día de cobro** | `contract.collection_day` — número del mes (1–31). Suele tomarse del día de la fecha previa. |
| **Marca de pago** | Fila en `contract_collection_payment` (año + mes + `paid_at`). Dice “este mes ya se cobró”. |
| **Forma de pago** | Mensual (+1 mes), Trimestral (+3), Semestral (+6), Anual (+12). |

---

## Camino A — Importación o alta manual (dónde entra la fecha previa)

```
Usuario ingresa "último pago previo"
        │
        ├─► contract.collection_day  = día de esa fecha (ej. 10)
        │
        └─► contract_collection_payment
              year / month de esa fecha
              paid_at = esa fecha completa
```

**Import (pólizas nuevas):** diálogo de fechas → `priorPaymentByContract` → al importar se llama `seedPriorPaymentsForNewContracts`.

**Alta manual:** campo “fecha último pago” + “día de cobro” → mismo efecto al crear la póliza.

Eso **no** escribe una columna “próximo cobro”. Solo deja:

1. el **día** del mes acordado, y  
2. que **ese mes ya está marcado como pagado**.

---

## Camino B — Vista general / Mi resumen (usa día de cobro + marcas)

Pantallas: `/dashboard` (promotoría) y home del asesor.

### Fórmula de la fecha mostrada

```
fecha de cobro = año/mes actual (o el mes evaluado)
                 + día = collection_day
```

Si el día no existe en ese mes (ej. 31 en febrero), se usa el último día del mes (`month_due_date` en SQL).

### Flujo hasta la pantalla

```
contract.collection_day
        +
contract_collection_payment (¿hay paid_at ese mes?)
        │
        ▼
RPC SQL
  • list_contracts_pending_payment  → "Pagos pendientes"
  • list_contracts_at_risk          → "En riesgo"
        │
        ▼
CollectionPriorityLists
  muestra: "Cobro: DD/Mmm/AAAA"
```

### Qué lista cuándo

| Lista | Regla (resumen) |
| --- | --- |
| **Pagos pendientes** | Mes actual, con `collection_day`, **sin** marca pagada ese mes, y la fecha cae en los **próximos 15 días** (o ya venció). |
| **En riesgo** | Hubo una fecha de cobro esperada **sin pago** y llevan más de **30 días** de atraso. |

Aquí **sí importa la fecha previa**: define el `collection_day` y deja pagado el mes del último cobro, para no pedir de nuevo ese mes.

---

## Camino C — Página Cobranza (usa líneas del archivo)

Pantalla: `/dashboard/collections`.

### Fórmula de la fecha mostrada (“Fecha de cobro”)

```
fecha de cobro = última payment_date de contract_detail
                 + N meses según forma de pago
```

Ejemplo: último `FECHA PAGO` = 10/Mar/2026 + Mensual → **10/Abr/2026**.

Varias líneas de la misma póliza se **suman en monto**; la fecha usa la `payment_date` **más reciente**.

### Flujo hasta la pantalla

```
Archivo HTML (FECHA PAGO, FORMA DE PAGO, PRIMA PAGO…)
        │
        ▼
contract_detail (varias filas por póliza)
        │
        ▼
Página Cobranza
  1) lee detalles
  2) agrupa por póliza (suma montos)
  3) nextDue = payment_date + meses
  4) muestra "Fecha de cobro"
```

La **fecha previa del diálogo de import** **no** entra en esta fórmula. Cobranza mira solo lo que vino en las líneas de comisión.

Filtro “Hasta fin de este mes”: hoy filtra por `payment_date` del detalle (no por la fecha calculada `nextDue`).

---

## Comparación rápida

| | Vista general | Cobranza |
| --- | --- | --- |
| Fuente principal | `collection_day` + marcas de pago | `contract_detail.payment_date` |
| ¿Usa fecha previa? | Sí (vía día + marca) | No |
| ¿Usa FECHA PAGO del archivo? | Indirecto (al sincronizar marcas / día) | Sí, directo |
| Qué responde | “¿Este mes ya cobré / voy a cobrar / estoy atrasado?” | “Según el archivo, ¿cuándo sería el siguiente cobro y de cuánto?” |

---

## Ejemplo de punta a punta (póliza nueva)

1. Importas comisiones; la póliza es nueva.  
2. Ingresas **último pago previo** = `10/Mar/2026`.  
3. El sistema guarda `collection_day = 10` y marca marzo 2026 como pagado.  
4. **Vista general:** próximo cobro esperado ≈ **10 del mes actual** (si ese mes no tiene marca).  
5. En el archivo hay `FECHA PAGO` = `10/Mar/2026` (Mensual).  
6. **Cobranza:** muestra **10/Abr/2026** (= pago del archivo + 1 mes) y el monto sumado de las líneas.

Si las dos pantallas no coinciden, casi siempre es porque una mira el **día acordado + marcas** y la otra mira el **archivo + forma de pago**.
