# LifeOps — Product flows by role

Reference for design and implementation: **who enters**, **what they see**, **what they do**, and **edge cases**. Complements [`README.md`](../README.md) (business rules) and [`database.md`](database.md) (schema).

UI language: **Spanish** (product). Code/SQL: English.

---

## Surface map

| Surface | Who | Typical route | Notes |
| ------- | --- | ------------- | ----- |
| Marketing | Public | `/` | Landing |
| Auth | Public | `/login` | Sign in / sign up (correo + contraseña) / email OTP verification |
| Onboarding | New promotoría | `/onboarding` | 3-step stepper before the dashboard |
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
- Asesor `status`: `NOT_INVITED` (row only), `PENDING` (invite sent), `ACTIVE`, `INACTIVE`.
- Activity is written to `audit_log` (invite, deactivate, cobranza, reassign, manual contract create).
- Consultants land on `/dashboard` (**Mi resumen**): pólizas en peligro (>30 días) + pagos por registrar + shortcuts to cobranza / alta.
- Promotory `/dashboard` is office-wide **prioridad de cobranza** only; prima filters/counters parked in `src/parked/dashboard/promotory-premium-overview.tsx`.
- Promotory can **reasignar** a contract to another advisor in the same office (`POST /api/contracts/reassign` → `audit_log`).
- Product decisions: [`docs/product-decisions.md`](product-decisions.md). Client-facing flows: [`docs/historias-de-usuario.md`](historias-de-usuario.md).

---

## Core flows

### Login / signup (`/login`)

1. User signs in (correo + contraseña) or registers. Sign-up asks **only correo + contraseña** (promotorías only; asesores are invited).
2. Optional email verification OTP when required.
3. Promotorías without onboarding go to `/onboarding`; everyone else to `/dashboard`.

### Onboarding (`/onboarding`) — promotoría

Registro → onboarding → dashboard. Applies to new promotorías **and** existing ones that never completed it (`office.onboarding_completed_at` is null); the dashboard layout redirects them here. Completed promotorías and asesores are redirected away.

1. **Tu promotoría:** nombre (required), estado (required), clave de promotoría (optional).
2. **¿Quién eres?:** nombre completo, rol (Dueño(a) / Director(a) / Gerente de operaciones / Asistente o administrativo / Otro), teléfono o WhatsApp (10 dígitos). If the rol is not Dueño(a): nombre y teléfono del dueño(a).
3. **Tu operación:** aseguradoras (multiple; "Otra" asks the name), ramos (multiple), número de asesores (range), pólizas activas (range), ¿qué quieres resolver primero? (optional).

- Each step is saved on **Siguiente**, so closing the browser resumes at the next step. **Atrás** keeps answers.
- **Terminar registro** marks the onboarding complete and opens the dashboard.
- **Aseguradora no soportada:** only Seguros Monterrey New York Life is supported today. If the selection does not include it, step 3 (and Perfil) shows a warning: "Por ahora LifeOps solo funciona con Seguros Monterrey" with WhatsApp / correo links to support (prefilled message with the aseguradoras chosen). After **Terminar registro** a dialog repeats it; **Entendido, ir a LifeOps** opens the dashboard. With Monterrey selected (alone or with others) nothing is shown.
- Submit stays disabled until the step's required fields are filled; server validation shows per-field errors.

### Perfil (`/dashboard/profile`)

- **Promotoría:** edit the onboarding answers in three cards (Tu promotoría / Contacto / Tu operación), each with its own **Guardar cambios**. The **clave de promotoría** is locked once captured and onboarding is complete (support changes it). The account correo is read-only. Zona de peligro stays at the bottom.
- **Asesor:** edit their name; correo, promotoría and código de asesor are read-only.

### Invite consultant (promotory)

1. Promotory requests invite (API + Resend). The correo cannot be the promotoría's, nor one already registered. A clave already used in the office is rejected; if that asesor is deactivated, the message says to activate them from Asesores or pick another clave.
2. Token stored in `token`.
3. Consultant opens `/invite/[token]`, completes account.
4. Consultant linked (`auth_user_id` / status → `ACTIVE`).
5. Until an invite is sent, the asesor stays `NOT_INVITED`. After the correo goes out, status is `PENDING`, then `ACTIVE` once they accept.

### Upload commissions (`/dashboard/extractor`) — promotory and consultant

1. Upload HTML/MHTML commission files (portal sync and Excel import are out of the live product).
2. Preview combined rows; validate consultants by `consultant_code` (asesor). Client names are trimmed and uppercased (accents dropped, Ñ → N). A name close to an existing office client (similarity at least 0.86) is treated as that client. On the date and summary steps, click the name to edit it before import.
3. **Asesor:** only rows matching their own `consultant_code` are kept; other codes are skipped (and rejected again on the server). They never auto-create other asesores.
4. Before import, user must enter **fecha de emisión del archivo**. If the file includes **pólizas nuevas** (first time in LifeOps), also enter **fecha del último pago conocido** — may be after the file date when the commission file is old; future dates are rejected. Used to seed cobranza, predict next dues, and set initial collection status.
5. **Promotoría only:** missing consultants on import — default auto-create (`<asesorCode>.<officeTag>@lifeops.com`) via privileged Auth API; if `NEXT_PUBLIC_IMPORT_MANUAL_CONSULTANT_CREDENTIALS=true`, a dialog lists the new codes with a generated correo. One action invites the checked rows (**Invitar e importar**) or, with none checked, only registers them (**Importar**). Clearing a correo and leaving it empty assigns another generated one. Submit rejects a correo that is repeated, already registered, or the same as the promotoría. Same asesor code may exist in another office.
6. The import runs on the server in batches of ~50 pólizas coordinated by the page (progress bar per batch; no total time limit; failed batches are retried and re-importing never duplicates). It creates a `commission_import` batch; upserts contracts; writes `contract_detail` **one per receipt (póliza + RECIBO)** — a receipt already saved is updated with the file values, never duplicated. Before importing, a dialog lists the receipts that will be updated. Seeds prior payment for new policies; seeds cobranza marks from payment dates in the file.
7. Once files are loaded, or while dates, the summary, or the save are in progress, leaving for another section, signing out, or closing/refreshing the tab asks for confirmation. A half-typed date (`12/21`) stays in the field if the user switches browser tab or window.

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

Same view for both roles, scoped by session: **promotoría** = office-wide, **asesor** = own cartera. One SQL call (`get_collection_overview`); **counts only** — amounts are not shown because pólizas mix currencies (UDI / pesos / dólares) and manual payments may have no amount.

1. **Indicadores:** pólizas activas · cobros de hoy (+ próximos 7 días) · pagos registrados este mes (vs the same elapsed days of last month) · vencidas (1–30 días) · en peligro (+30 días).
2. **Estado de la cartera:** % al día + 100% stacked bar (Al corriente / Por vencer / Vencida / En peligro) by next due — same rule as Cobranza, so the numbers match the lists below. Pólizas without any known payment are counted apart (no next due can be computed).
3. **Avisos:** only what needs action — en peligro, vencidas, pólizas sin pagos registrados, sin forma de pago (calculated as mensual), cobros de hoy, asesores sin invitar / invitaciones sin aceptar (promotoría). Each links to the screen that fixes it.
4. **Pagos registrados por mes:** this year vs last year, January → current month, by payment date (counts of cobranza marks: imported FECHA PAGO, prior payments and manual payments).
5. **Antigüedad del atraso:** overdue pólizas by days late (1–10, 11–20, 21–30 = vencida; 31–60, 61–90, +90 = en peligro).
6. **Cartera por asesor** (promotoría, 2+ asesores): stacked bars per asesor, sorted by vencidas + en peligro; top 8, all in the table.
7. **Prioridad de cobranza** lists (en peligro, pagos por registrar) stay below.

Every chart has a legend, hover/focus tooltips and a **Ver datos** table. Colors (validated for both themes): `--viz-*` tokens in `globals.css`. Prima filter/totals UI stays parked.

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
