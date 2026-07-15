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
5. Promotory can **Eliminar** an asesor from `/dashboard/consultants` (cascades their contracts / details / cobranza; removes Auth user).

### Upload commissions (`/dashboard/extractor`) — promotory

1. Upload HTML tables **or** a pagos/comisiones `.xlsx` (button **Importar desde Excel**).
2. Preview combined rows; validate consultants by `consultant_code` (asesor).
3. Auto-create missing consultants on import (`<asesorCode>.<officeTag>@lifeops.com`) via privileged Auth API — **must be server-side**. Same asesor code may exist in another office.
4. Import contracts + `contract_detail` rows; map Cliente / Poliza / Moneda / Asesor; seed cobranza marks from payment dates.

### Pólizas (`/dashboard/contracts`)

- List / filter / open detail; register emission (`/dashboard/contracts/new`).
- Consultants may request change / folio correct on own contracts.
- Files under contract folder routes.

### Cobranza (`/dashboard/collections`)

- Year-scoped payment-control grid for **active** contracts: clave, asesor, póliza, cliente, proyecto, moneda, forma/medio de pago, prima al cobro, día de cobro, estatus, and ENE–DIC cells.
- Estatus is editable (`AMPARADO`, `CORRIENTE`, `FLEXIBLE`, `FLEXIBLE/REVISAR`, `MES`, `PERIODO GRACIA`, `ATRASADO`) — stored as `contract.collection_status`, separate from lifecycle `contract.status`.
- Month cells show scheduled day; highlighted when paid (`paid_at`). Click opens dialog requiring real payment date (optional amount/notes); can clear a paid mark.
- Month marks seed from import/`contract_detail` (`source=import`) without overwriting manual paid marks; edits write `collection_audit_log`.
- Historial panel lists recent audit entries (manual + import). Promotoría and asesores (own contracts) can edit.
- Legacy vencimientos view: `/dashboard/collections/v0`.

### Vista general (`/dashboard`) — promotory-focused filters

- Date basis (pago vs emisión), date range (pending + Aplicar), seniority, ramo, forma de pago, asesores multi-select.
- Stats from SQL RPCs via `db.dashboard.*` — do not reimplement aggregations ad hoc on the client.

### Solicitudes de cambio (`/dashboard/change-requests`)

- Promotory reviews office requests; consultants create CHANGE / CORRECT against own contracts.

### Proyección (`/dashboard/projection`)

- Projection views for office/consultant scoped data.

---

## UX conventions

- Dark chrome, golden accent, `dashboard-page-title` for page titles.
- Filters: pending local state + **Aplicar** (no query storm on every keystroke).
- Feedback: `ToastProvider` / `useToast` — never `alert()`.
- Forms: `FormField` + Zod validation with per-field Spanish errors; disable submit until required fields are filled.
- Prefer existing shadcn controls in `src/components/ui/`.

---

## Legacy redirects (do not recreate)

These Spanish/legacy paths permanently redirect — prefer the English destinations only:

| Old | New |
| --- | --- |
| `/dashboard/cotizacion` | `/dashboard/projection` |
| `/dashboard/proyeccion` | `/dashboard/projection` |
| `/dashboard/policies` | `/dashboard/contracts` |
| `/dashboard/policies/new` | `/dashboard/contracts/new` |
