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

### Upload commissions (`/dashboard/extractor`) — promotory

1. Upload HTML tables; preview combined rows.
2. Validate consultants by `consultant_code` (asesor).
3. Optionally create missing consultants (privileged Auth — **must be server-side**).
4. Import contracts + `contract_detail` rows; map Cliente / Poliza / Moneda / Asesor.

### Pólizas (`/dashboard/contracts`)

- List / filter / open detail; register emission (`/dashboard/contracts/new`).
- Consultants may request change / folio correct on own contracts.
- Files under contract folder routes.

### Cobranza (`/dashboard/collections`)

- Next payment from latest detail `payment_date` + `payment_method` (Mensual / Trimestral / Semestral / Anual).
- Filters for end of current vs next month (and shared dashboard filters where applicable).

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
