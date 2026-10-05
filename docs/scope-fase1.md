# LifeOps — Scope freeze (fase 1)

What is **in**, **done**, **todo**, **parked**, and **ideas**. Companion to [`historias-de-usuario.md`](historias-de-usuario.md) and [`product-decisions.md`](product-decisions.md).

**At-risk rule (current):** unpaid more than **30 days** after expected collection date.

---

## Done (shipped / scaffolded)

| Area | Status |
| --- | --- |
| Office tenancy + roles promotory / consultant | Working (RLS) |
| Invite consultants by email | Working |
| Soft-deactivate consultants (`INACTIVE`) | Working |
| Commission import HTML (file upload) | Working (Excel + portal sync removed/parked) |
| Import dates: file issue date + prior payment for **new** policies | Working |
| Single `contract` table with `source` import/manual/mixed | Schema + import wiring |
| `contract.office_id` denormalized + unique policy # per office | Migration `010` |
| Client CURP/RFC columns + hybrid dedupe helpers | Schema + `db.client.findOrCreateClient` (UI still thin) |
| `commission_import` batch table | Migration `011` + create on import |
| Cobranza grid + manual payment marks + evidence upload | Working (`file.collection_payment_id`) |
| At-risk RPC + consultant / promotory home (peligro / pagos pendientes) | Working (threshold **30**) |
| Reassign policy (same office) → `audit_log` | Working (apply migrations `016`–`017`) |
| Unified `audit_log` (replaces collection + reassignment logs) | Working |
| Office tags removed (fase 1) | Dropped in `016` |
| Product docs (historias, decisions, flows) | Updated |

---

## Todo (fase 1 — still needed)

| Priority | Item |
| --- | --- |
| P0 | Apply migrations `010`–`012` | **done** |
| P0 | Apply migrations `015`–`017` (audit unify + drop tags) | confirm on target project |
| P1 | CURP/RFC fields on client create/edit UI |
| P1 | Explicit `collection_day` on manual policy create |
| P1 | History of commission import batches (what file changed what) |
| P1 | Badges “en peligro” on contracts/collections lists |
| P1 | UX pass: simplify agent flows, mobile cobranza |
| P2 | Office-wide reminders filters (7 / 15 / 30 days) |

---

## Parked / archived (code under `src/parked/`)

Moved out of the App Router; old URLs redirect to `/dashboard` or collections. See [`src/parked/README.md`](../src/parked/README.md), [`backlog.md`](backlog.md), [`plan-p0-p1.md`](plan-p0-p1.md).

| Surface | Why park |
| --- | --- |
| Proyección | Primas / proyección out of scope |
| Solicitudes de cambio (+ change/correct folio) | Epic aparte |
| Cobranza v0 | Legacy |
| Nueva Solicitud desde asesores | Parte de solicitudes |
| Contadores / filtros de primas en vista general | No es foco fase 1; cobranza first |
| Excel de pagos + registrar emisión | Parked; emisión vuelve con solicitudes |
| Portal sync (Playwright) | Removed |
| Operations role / client login / WhatsApp / auto sync | Post-MVP |

---

## New product ideas (backlog, not commitments)

Tracked in [`backlog.md`](backlog.md) (P2 + Ideas). High level:

1. Weekly digest email to promotory
2. Bulk reassign when an agent leaves
3. Call-list CSV export
4. Shared notes on a policy
5. Configurable at-risk days per office (default 30)
6. Read-only share link for one policy

---

## Story not to lose: reassign policy

**Como** promotora, **quiero** mover una póliza a otro asesor de mi oficina, **para** corregir cartera cuando cambia el responsable.

- Same `contract_number` + `client_id`; only `consultant_id` changes (same `office_id`).
- Cobranza / details / files stay on the contract.
- Audit who reassigned and when.
- Consultant cannot reassign; only promotory.
- Implementation plan: [`plan-p0-p1.md`](plan-p0-p1.md) § P0-1.
