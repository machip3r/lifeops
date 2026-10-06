# LifeOps — Product flows by role

Reference for design and implementation: **who enters**, **what they see**, **what they do**, and **edge cases**. Complements [`README.md`](../README.md) (business rules) and [`database.md`](database.md) (schema).

UI language: **Spanish** (product). Code/SQL: English.

---

## Surface map

| Surface | Who | Typical route | Notes |
| ------- | --- | ------------- | ----- |
| Marketing | Public | `/` | Landing |
| Auth | Public | `/login` | Sign in / sign up / email OTP verification |
| Invite | Consultant prospect | `/invite/[token]` | Accept consultant invitation |
| App (ops) | Promotory + consultant | `/dashboard/…` | Role-gated chrome |

---

## Roles the UI must respect

```
office (promotory) ── owns ──► consultants (asesores)
                                      │
                                      └── contracts / clients / details / requests
```

| Role | Source of truth | Scope |
| ---- | --------------- | ----- |
| `promotory` | Row in `office` (`id` = auth user) | Entire office |
| `consultant` | Row in `consultant` (often `auth_user_id`) | Own contracts / clients / requests |

- Auth session from Supabase Auth; profile resolution in `src/contexts/auth-context.tsx`.
- Route gates via `ProtectedRoute` + dashboard layout nav by role.
- Prefer server session checks for new privileged mutations (Server Actions / API).
- Promotory **Zona de peligro** (Perfil): full office wipe also clears cobranza payments and audit log.
- List tables (asesores, clientes, pólizas, solicitudes, cobranza, detail sub-tables) paginate from Supabase (`.range` + `count`, default 25 rows / page).
- Promotory **Desactivar** asesores sets `status = INACTIVE` (soft); hard-delete only when zero contracts (`forceDelete`).
- Activity is written to `audit_log` (invite, deactivate, cobranza, reassign, manual contract create).
- Consultants land on `/dashboard` (**Mi resumen**): pólizas en peligro (>30 días) + pagos por registrar + shortcuts to cobranza / alta.
- Promotory `/dashboard` is office-wide **prioridad de cobranza** only; prima filters/counters parked in `src/parked/dashboard/promotory-premium-overview.tsx`.
- Promotory can **reasignar** a contract to another advisor in the same office (`POST /api/contracts/reassign` → `audit_log`).
- Product decisions: [`docs/product-decisions.md`](product-decisions.md). Client-facing flows: [`docs/historias-de-usuario.md`](historias-de-usuario.md).

---

## Core flows

### Login / signup (`/login`)

1. User signs in or registers.
2. Optional email verification OTP when required.
3. Redirect into `/dashboard` (or role-appropriate default).

### Invite consultant (promotory)

1. Promotory requests invite (API + Resend).
2. Token stored in `token`.
3. Consultant opens `/invite/[token]`, completes account.
4. Consultant linked (`auth_user_id` / status → `ACTIVE`).
5. Promotory can **Desactivar** an asesor from `/dashboard/consultants` (sets `INACTIVE`; pólizas se conservan). Hard-delete only if the asesor has no contracts.

### Upload commissions (`/dashboard/extractor`) — promotory and consultant

1. Upload HTML/MHTML commission files (portal sync and Excel import are out of the live product).
2. Preview combined rows; validate consultants by `consultant_code` (asesor).
3. **Asesor:** only rows matching their own `consultant_code` are kept; other codes are skipped (and rejected again in `importContractsFromTable`). They never auto-create other asesores.
4. Before import, user must enter **fecha de emisión del archivo**. If the file includes **pólizas nuevas** (first time in LifeOps), also enter **fecha del último pago conocido** — may be after the file date when the commission file is old; future dates are rejected. Used to seed cobranza, predict next dues, and set initial collection status.
5. **Promotoría only:** missing consultants on import — default auto-create (`<asesorCode>.<officeTag>@lifeops.com`) via privileged Auth API; if `NEXT_PUBLIC_IMPORT_MANUAL_CONSULTANT_CREDENTIALS=true`, UI requires email/password per new code. Same asesor code may exist in another office.
6. Import creates `commission_import` batch; upserts contracts + `contract_detail` rows; seeds prior payment for new policies; seeds cobranza marks from payment dates in the file.

### Pólizas (`/dashboard/contracts`)

- Same list chrome as Asesores / Clientes: card + `ListSearchFilters` (Buscar) + **Registrar póliza**.
- **Registrar póliza** (dialog): asesor (auto for consultant; select + invite for promotory), número de póliza, cliente (existente o nuevo), fecha de emisión, día de cobro, check de póliza ya existente + fecha último pago, proyecto, forma de pago.
- The full multi-step **registrar emisión** wizard remains parked (`src/parked/dashboard/contracts/new`).
- Files under contract folder routes.

### Cobranza (`/dashboard/collections`)

- How due dates are calculated (last payment wins over old commission files): see [`collection-due-dates.md`](collection-due-dates.md).
- Live list: one row per póliza; next due from latest `paid_at` / prior payment + forma de pago; filter current/upcoming months.
- Year-scoped payment-control grid (parked/legacy path): clave, asesor, póliza, cliente, proyecto, moneda, forma/medio de pago, prima al cobro, día de cobro, estatus, and ENE–DIC cells.
- Estatus is editable (`AMPARADO`, `CORRIENTE`, `FLEXIBLE`, `FLEXIBLE/REVISAR`, `MES`, `PERIODO GRACIA`, `ATRASADO`) — stored as `contract.collection_status`, separate from lifecycle `contract.status`.
- Month cells show scheduled day; highlighted when paid (`paid_at`). Click opens dialog requiring real payment date (optional amount/notes); **manual** marks require payment evidence (image/PDF) linked via `file.collection_payment_id`; import marks do not. Cells with evidence show a paperclip; dialog has **Ver evidencia** (signed URL). Can clear a paid mark.
- Month marks seed from import/`contract_detail` (`source=import`) without overwriting manual paid marks; edits write `audit_log` (no dedicated Historial UI yet — see [`audit-log-plan.md`](audit-log-plan.md)).
- CSV export is parked (`src/parked/lib/collections/export-csv.ts`).
- Legacy vencimientos view parked: `/dashboard/collections/v0`.

### Asesores / Clientes

- Shared `ListSearchFilters`: draft search + **Buscar** (submit only) and primary action in the same bar (**Invitar asesor** / **Nuevo cliente**).
- Same table chrome (card, sticky actions column).
### Vista general (`/dashboard`)

- **Promotory:** at-risk (>30 days) + pending payments office-wide; link to cobranza. Prima filter/totals UI is parked (not shown).
- **Consultant:** home with at-risk list + pending payments; links to cobranza and pólizas.

### Solicitudes de cambio (`/dashboard/change-requests`)

- Promotory reviews office requests; consultants create CHANGE / CORRECT against own contracts.
- **Nueva Solicitud** (Asesores dialog + contract CHANGE/CORRECT pages): attach documents in-form (name + file); on submit, create the contract or change request, then upload to private Storage `documents` under `{officeId}/{consultantId}/{contractId}/{contractCode}/`. Client/contract selectors autofill related fields. No Google Drive links.

### Proyección (`/dashboard/projection`)

- Projection views for office/consultant scoped data.

---

## UX conventions

- Dark chrome, golden accent, `dashboard-page-title` for page titles.
- Filters: draft search + **Buscar** (no query storm on every keystroke); create actions live in the same bar when applicable.
- Feedback: `ToastProvider` / `useToast` — never `alert()`.
- Forms: `FormField` + Zod validation with per-field Spanish errors; disable submit until required fields are filled.
- Prefer existing shadcn controls in `src/components/ui/`.
- Primary product CTAs use `Button` `variant="brand"` (golden `#FBDBAC`); secondary actions use `outline` / `ghost` — do not invent per-page blue `bg-blue-600` buttons.

---

## Legacy redirects (do not recreate)

These Spanish/legacy paths permanently redirect — prefer the English destinations only:

| Old | New |
| --- | --- |
| `/dashboard/cotizacion` | `/dashboard/projection` |
| `/dashboard/proyeccion` | `/dashboard/projection` |
| `/dashboard/policies` | `/dashboard/contracts` |
| `/dashboard/policies/new` | `/dashboard/contracts/new` |
