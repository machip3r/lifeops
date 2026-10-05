# Plan de implementación — P0 y P1

Migraciones `010`–`012` ya aplicadas. Objetivo: cerrar el MVP de **registro + cobranza + recordatorios** (sin proyección ni solicitudes).

Estimación orientativa (1 dev): **~2–3 semanas P0**, luego **~2–3 semanas P1**.

---

## Orden de entrega

```text
Week 1–2  P0-1 reassign → P0-2 promotory home → P0-3 payment evidence
Week 3–4  P1-1 CURP/RFC → P1-2 collection_day → P1-4 badges
Week 4–5  P1-3 import history → P1-5 UX asesor → buffer
```

---

## P0-1 · Reasignar póliza a otro asesor

**Historia:** Como promotora, quiero mover una póliza a otro asesor de mi oficina.

### Scope
- Solo `promotory`
- Destino: asesor `ACTIVE`/`PENDING` de la **misma** `office_id`
- Conservar: `contract_number`, `client_id`, details, cobranza, files
- Actualizar: `consultant_id` (trigger ya sincroniza `office_id`)
- Auditoría: quién, cuándo, from→to (puede ser fila en `collection_audit_log` con action nueva **o** tabla `contract_reassignment_log` — preferir **nueva migración** `013` con action en audit o log dedicado)

### UI
- En `/dashboard/contracts/[id]` (y opcional en lista): acción **Reasignar asesor**
- Dialog: select de asesores de la office + confirmación
- Toast éxito/error; Zod + `FormField`

### API
- `POST /api/contracts/reassign` con Bearer + `requireOfficeContext` + `assertPromotory`
- Body: `{ contractId, toConsultantId }`
- Validar tenancy server-side

### Acceptance
- [x] Asesor no puede reasignar
- [x] No se puede mover a office distinta
- [x] Cobranza sigue visible en el nuevo asesor
- [x] Número de póliza no cambia

---

## P0-2 · Home promotoría: peligro + recordatorios

**Historia:** Como promotora, quiero ver pólizas en peligro y a quién contactar.

### Scope
- Extender `/dashboard` (hoy stats de primas) con sección **prioridad**:
  - En peligro (>30 días) — `db.dashboard.listContractsAtRisk({ officeId })`
  - Por registrar / por vencer — `listContractsPendingPayment({ officeId })`
- Links a contrato y cobranza
- Filtros/contadores de primas: **parked** (`src/parked/dashboard/promotory-premium-overview.tsx`)

### Acceptance
- [x] Promotoría ve listas office-wide
- [x] Asesor sigue viendo solo las suyas en Mi resumen
- [x] Copy en español, vacío amable si no hay riesgos

---

## P0-3 · Evidencia de pago en cobranza

**Historia:** Como asesor, quiero adjuntar evidencia al marcar un pago.

### Scope
- Al marcar pago en grid cobranza: opcional/requerido archivo (imagen/PDF)
- Reutilizar bucket `documents` + patrón upload existente
- Guardar `file` con `collection_payment_id` + tenancy columns
- Mostrar miniatura / link “Ver evidencia” en celda o dialog

### API
- Extender flujo de upsert payment (client o route) para upload post-mark
- Signed URL al leer

### Acceptance
- [x] Solo owner office o dueño de la póliza sube
- [x] Import no exige evidencia (solo marca manual)
- [x] Toasts; validación tamaño/mime (igual que solicitudes parked)

---

## P1-1 · CURP / RFC en clientes

### Scope
- Campos en create/edit cliente (`/dashboard/clients`, alta desde póliza nueva)
- Schemas `optionalCurpSchema` / `optionalRfcSchema`
- Usar `findOrCreateClient` con dedupe CURP→RFC→nombre+office

### Acceptance
- [ ] Error de campo si formato inválido
- [ ] Duplicado CURP muestra mensaje claro

---

## P1-2 · Día de cobro en alta manual

### Scope
- En `/dashboard/contracts/new`: input día 1–31 (`collection_day`)
- Opcional `issue_date`
- `source: manual`

### Acceptance
- [ ] Póliza nueva entra a RPCs de riesgo/pending con ese día

---

## P1-3 · Historial commission_import

### Scope
- Lista últimos N batches (fecha archivo, prior payment, counts, status)
- Desde extractor o `/dashboard/extractor` panel inferior
- `db.commissionImport.listByOffice`

### Acceptance
- [ ] Promotoría ve qué se importó y cuándo

---

## P1-4 · Badges “En peligro”

### Scope
- En listados contracts y/o collections: badge si está en set de at-risk
- Evitar N+1: batch RPC o map de IDs una vez por página

### Acceptance
- [ ] Visible sin abrir detalle

---

## P1-5 · UX asesor

### Scope
- Cobranza usable en móvil (dialog + evidencia)
- Home ya existe: pulir empty states y CTAs
- Reducir pasos para “marcar pagado”

### Acceptance
- [ ] Flujo principal en ≤3 taps en phone width

---

## Fuera de este plan

- Restaurar `src/parked/**` (proyección, solicitudes)
- Operations role, client login, WhatsApp, sync Monterrey
- P2 ideas del [`backlog.md`](backlog.md)

---

## Definition of done (cada ítem)

1. UI español + validación server Zod  
2. RLS / `requireOfficeContext` donde aplique  
3. Docs cortas actualizadas (`product-flows` / `backlog` estado)  
4. Sin reintroducir proyección ni solicitudes en el nav  
