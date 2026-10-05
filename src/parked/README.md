# Parked / archived UI (fase 1)

Code moved out of the App Router so it is not part of the live product surface.
Restore by moving folders back under `src/app/dashboard/…` and re-enabling nav links.

| Feature | Parked path | Old route |
| --- | --- | --- |
| Proyección | `src/parked/dashboard/projection/` | `/dashboard/projection` |
| Solicitudes | `src/parked/dashboard/change-requests/` | `/dashboard/change-requests` |
| Change / correct folio | `src/parked/dashboard/contracts-change/` · `contracts-correct-folio/` | `/dashboard/contracts/[id]/change` · `…/correct-folio` |
| Cobranza grid (calendario) | `src/parked/dashboard/collections/grid/` | `/dashboard/collections` (antes); la lista por fecha de cobro (estilo v0) es la activa |
| Cobranza v0 (referencia) | `src/parked/dashboard/collections/v0/` | copia de referencia; la UI viva está en `src/app/dashboard/collections/` |
| Request form dialog | `src/parked/request-form-dialog.tsx` | used from asesores “Nueva Solicitud” |
| Contadores / filtros de primas (vista general) | `src/parked/dashboard/promotory-premium-overview.tsx` | part of `/dashboard` (promotory) |
| Importar Excel de pagos | `src/parked/lib/extractor/parse-pagos-xlsx.ts` | extractor Excel button (needs `xlsx`) |
| Registrar emisión / alta manual | `src/parked/dashboard/contracts/new/` | `/dashboard/contracts/new` → contracts list |
| Solicitud UI helpers | `src/parked/components/*`, `src/parked/lib/documents/solicitud-upload.ts` | request form / change / correct-folio |
| Premium-overview UI primitives | `src/parked/components/ui/*` | calendar/popover/command/… |
| Export CSV cobranza | `src/parked/lib/collections/export-csv.ts` | botón en `/dashboard/collections` |
| Búsqueda global (navbar) | `src/parked/components/global-search.tsx` | barra superior del dashboard |
| Etiquetas de asesores | `src/parked/components/consultant-tags.tsx` | lista/detalle de asesores (tablas `tag` / `consultant_tag` dropeadas en `016`) |

**Removed (not parked):** Sincronizar desde el portal (`portal-sync` API + Playwright). Do not restore without an explicit product decision. Restoring tags also needs a new migration recreating `tag` + junction tables.

**Restore deps (when un-parking):** `pnpm add xlsx cmdk date-fns react-day-picker` (and re-export `buttonVariants` from `src/components/ui/button.tsx` if using parked `calendar.tsx`).

`knip` and `tsconfig` ignore `src/parked/**`.

Old URLs redirect to the active dashboard (see `next.config.ts`).

See also [`docs/backlog.md`](../docs/backlog.md) and [`docs/plan-p0-p1.md`](../docs/plan-p0-p1.md).
