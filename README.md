# LifeOps

A Next.js application for managing insurance operations, consultants, clients, contracts, and policy data. The system includes an HTML commission extractor that imports payment data into a structured database.

## Access

LifeOps is invitation-only in the product UI. `/login` is for existing accounts; the public landing page lets promotorías request a demo through the configured support email or WhatsApp. Asesores accept invitations at `/invite/[token]`. A single configured promotoría operator can create one-time, seven-day registration links from Perfil; invitees register at `/register?token=…` and continue through promotoría onboarding. Registration uses the server-side Auth Admin API, so keep **Allow new users to sign up** disabled in Supabase (`disable_signup = true`). Configure `PROMOTORY_INVITE_GENERATOR_EMAIL` with that operator's account email. Links use `APP_BASE_URL` when set, otherwise the existing `NEXT_PUBLIC_APP_URL` app origin.

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript 5
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **Styling**: Tailwind CSS 4 + shadcn
- **Validation**: Zod (`src/lib/validation`)
- **State Management**: React Hooks (useState, useContext)

## Agent / contributor standards

AI and human contributors must follow **[`AGENTS.md`](AGENTS.md)** (also pointed to by `CLAUDE.md` and `.cursor/rules/lifeops.mdc`). Product flows: [`docs/product-flows.md`](docs/product-flows.md). Collection due-date math: [`docs/collection-due-dates.md`](docs/collection-due-dates.md). Schema reference: [`docs/database.md`](docs/database.md). Fase 1 backlog / plan: [`docs/backlog.md`](docs/backlog.md), [`docs/plan-p0-p1.md`](docs/plan-p0-p1.md). Parked UI: [`src/parked/`](src/parked/).

## Project Structure

```
lifeops/
├── AGENTS.md                         # Coding standards (source of truth for agents)
├── CLAUDE.md                         # Points at AGENTS.md
├── .cursor/rules/lifeops.mdc         # Cursor always-on project rules
├── docs/
│   ├── database.md                   # Schema / RPC / RLS reference
│   ├── product-flows.md              # UX flows by role
│   └── …                             # decisions, backlog, due-date math, user stories
├── src/
│   ├── app/                          # Next.js App Router pages
│   │   ├── dashboard/                # Protected dashboard routes
│   │   │   ├── extractor/            # HTML commission import
│   │   │   ├── contracts/            # Pólizas (list, detail, files, manual registration)
│   │   │   ├── collections/          # Cobranza
│   │   │   ├── clients/              # Clientes
│   │   │   ├── consultants/          # Asesores (promotory only)
│   │   │   └── profile/              # Perfil (+ office wipe)
│   │   ├── login/                    # Authentication page
│   │   ├── invite/[token]/           # Consultant invitation acceptance
│   │   └── api/                      # Route handlers (Bearer auth, service role)
│   ├── components/                   # Shared UI by domain (+ ui/ primitives, FormField)
│   ├── contexts/                     # auth, navigation guard, theme
│   ├── hooks/                        # useQueryEffect, useDebouncedValue
│   ├── lib/
│   │   ├── db/                       # RLS table/RPC access per domain (all browser queries)
│   │   ├── db-admin/                 # service-role table access per domain (server only)
│   │   ├── extractor/                # commission import, receipt rules
│   │   └── …                         # auth/, storage/, validation/, domain helpers
│   └── parked/                       # Parked UI (projection, change requests, Excel import, …)
├── supabase/
│   └── migrations/                   # SQL migration files (append-only)
└── public/                           # Static assets
```

## Database Schema

Column-level reference: [`docs/database.md`](docs/database.md). Summary:

| Table | Purpose |
| ----- | ------- |
| `office` | Promotoría; `id` = `auth.users.id`. Onboarding answers (`name`, `state_code`, `agency_code`, ranges, `onboarding_completed_at`) + `office_contact`, `office_insurer`, `office_line_of_business` (catalogs `insurer`, `line_of_business`, `mx_state`) |
| `consultant` | Asesor of one office. `consultant_code` = "Asesor" from imports, unique per office. `status`: `NOT_INVITED`, `PENDING`, `ACTIVE`, `INACTIVE` |
| `client` | Asegurado. Optional `curp` / `rfc` (globally unique); without them the client is local to its office |
| `contract` | Póliza. `contract_number` = canonical póliza number (no spaces / commas, uppercase), unique per office — every source (manual, commission HTML, Mina de Oro, plantilla) links to the same póliza by it. `source` = `import` / `manual` / `mixed`; `status` = insurer status — **en vigor** (`IN_FORCE`), **en vigor prorrogado** (`EXTENDED`), **en vigor sin pago de primas** (`NO_PREMIUMS`), **anulada** (`ANNULLED`); only en vigor is in cobranza, and an anulada póliza can be **rehabilitated** (back to en vigor, enters cobranza); `in_force_as_of` = date the insurer reported it en vigor (Mina de Oro cut-off / rehabilitation) — receipts due up to it count as paid everywhere (cobranza, charts, lists), since en vigor means its payments are up to date; cobranza fields `collection_status`, `collection_day` |
| `contract_detail` | One paid receipt from a commission file. `receipt_number` (RECIBO) unique per póliza |
| `commission_import` | One commission-file upload (required file `issue_date`) |
| `contract_collection_payment` | Cobranza mark per póliza / year / month (`paid_at`, `source` manual or import) |
| `file` | Documents in the private `documents` bucket (solicitudes, payment evidence) |
| `audit_log` | Append-only activity (cobranza, reassign, invite, import, …) |
| `contract_change_request` | CHANGE / CORRECT requests (UI parked) |
| `token` | Invitation tokens |

```
office (1) ──< (many) consultant
consultant (1) ──< (many) contract
client (1) ──< (many) contract
contract (1) ──< (many) contract_detail
contract (1) ──< (many) contract_collection_payment
contract (1) ──< (many) file
contract (1) ──< (many) contract_change_request
```

**Key Rules**:
- One contract has exactly one client, one consultant and one office (`contract.office_id` denormalized)
- `contract_number` is unique per office when set
- Client identity: CURP/RFC when available (global unique); otherwise local to office — see [`docs/product-decisions.md`](docs/product-decisions.md)
- **Policy details have no duplicates.** Each commission file says which receipts were paid on its dates. Importing a receipt that already exists (same póliza + RECIBO) **updates** it with the file values, so amounts stay current and totals stay exact
- **Next due = receipt calendar:** receipts fall on the FECHA EMISION day every forma-de-pago period (emisión 20/dic, Trimestral → dic, mar, jun, sep). The last payment covers the latest receipt due on or before payment date + 15 days; next due is the following receipt (paid 21/jul → jun receipt late → next 20/sep). Without FECHA EMISION: last payment + period. Details: [`docs/collection-due-dates.md`](docs/collection-due-dates.md)
- A policy is **at risk** when its **next due** is more than **30 days** overdue — same rule in Cobranza and Vista general (not every empty month in a lookback window)
- Promotory may **reassign** a policy to another consultant in the same office (same policy number + client)
- Solicitud documents attach to a contract; CHANGE/CORRECT also link `change_request_id`; payment evidence links `file.collection_payment_id`
- User stories (non-technical): [`docs/historias-de-usuario.md`](docs/historias-de-usuario.md)

## Key Features

### 1. HTML Extractor (`/dashboard/extractor`)

**Purpose**: Import insurance data from HTML commission files into the database.

**How it works**:
1. User uploads one or more HTML/MHTML commission files (portal browser sync and Excel import are not in the live product; Excel parser is parked under `src/parked/`).
2. System parses into a shared preview table
3. Data is displayed for review / edit
4. User clicks "Importar a Base de Datos"

**Import Process**:
1. **Import dates dialog** (on "Importar a Base de Datos"):
   - File `issue_date` is suggested from the most common `FECHA PAGO` (fecha de cobro) and stays editable
   - File `issue_date` cannot be in the future (today is allowed).
   - Only **new pólizas without `FECHA EMISION`** in the file are listed: that date is required (it anchors the receipt calendar), written back into the preview table, must be **before** the commission file date and not in the future. No "último pago" is asked anymore
2. **Pre-import Check**: Validates that all consultants (by `consultant_code` = "asesor") exist. Asesores only keep rows matching their own `consultant_code`; other codes are skipped (and rejected again on the server, scoped by the asesor's session).
3. **Missing-consultant creation** (promotoría only): If codes are missing for the office:
   - Default: auto-create via `POST /api/extractor/create-consultants` (`mode: auto`)
   - If `NEXT_PUBLIC_IMPORT_MANUAL_CONSULTANT_CREDENTIALS=true`: show dialog and require name/email/password for each new asesor (`mode: manual`) before import continues
   - Auto path details:
   - Email: `<asesorCode>.<officeTag>@lifeops.com` (office-scoped so the same code can exist in another promotoría)
   - Name: from Excel/HTML column `Nombre Asesor` when present (otherwise the code)
   - Default password: `Hola123!!` (change for production / after invite)
   - Creates Auth user (email confirmed) + `consultant` row (`id` / `auth_user_id` linked)
   - On re-import, updates `consultant.name` when the file includes a real nombre
   - Same `consultant_code` may belong to different offices (unique per `office_id` only)
4. **Data Grouping**: Groups rows by contract (unique combination of `Cliente` + `Poliza` + `Asesor`)
5. **Contract Creation**: For each unique contract:
   - Finds or creates client by name. Names are normalized (trim, uppercase, no accents, Ñ → N). If the name is at least 0.86 similar to an existing office client, that client is reused. The extractor lets you click the name and change it before import.
   - Finds consultant by `consultant_code` (asesor)
   - Checks if contract with same `contract_number` (poliza) exists
   - Creates new contract if it doesn't exist, and stores the earliest `FECHA EMISION` on `contract.issue_date` (also fills it when a later import finds the póliza without that date)
6. **Contract Details Creation**: For each row in a contract group:
   - Maps columns by header name to database fields; dates stored as YYYY-MM-DD (converted from DD/MM/YYYY)
   - **One detail per receipt (RECIBO).** If the póliza already has that receipt, its values are updated with the file; otherwise it is created. If a receipt shows up twice in the same upload, the last row wins
   - Details saved before RECIBO was stored are matched by identical values and take the receipt number instead of creating a copy
   - If the file has no RECIBO column, rows identical in every value to a saved detail are skipped (the import warns about it)
   - The duplicate check before import lists receipts that already exist; continuing updates them
   - Seeds cobranza month marks from payment dates of new and updated details (`source=import`)
   - For **first-time** policies: initial `collection_status` from the receipt calendar (`ATRASADO` if its next due is more than 30 days late, else `CORRIENTE`); payments come from the file's FECHA PAGO
   - Clients are find-or-created by name for the office (names with spaces are supported)

While an import is in progress (files loaded, dates, summary, or the save itself), changing section, signing out, or closing the tab asks for confirmation so that work is not abandoned without noticing.

**Important Mappings**:
- `Asesor` → `consultant.consultant_code`
- `Poliza` → `contract.contract_number`
- `Cliente` → `client.name`
- `Moneda` / `Tipo Cambio` → `contract.currency` / `exchange_rate`
- `FECHA EMISION` → `contract.issue_date` (earliest date in the póliza) and each `contract_detail.issue_date`
- `RECIBO` → `contract_detail.receipt_number` (identifies the receipt; re-imports update it only when picked in the review)
- Other detail headers (FECHA PAGO, PRIMA PAGO, FORMA DE PAGO, …) → `contract_detail`

**Registry import (Mina de Oro de Seguros Monterrey / plantilla de LifeOps)** — promotoría only, from Importar (step 1) or the optional last onboarding step for Monterrey promotorías. One row per póliza, no payments: creates / updates pólizas, clients and asesores (missing ones as `NOT_INVITED`). Mina de Oro columns → `contract` (`contract_number`, `issue_date`, `payment_method`, `payment_channel` ← «Método de pago», `project_name` ← plan, `line_code` ← tipo de seguro, `plan_classification`, `insured_name`, `status` — only «En Vigor» is active —, `annual_premium` / `insured_amount` and their `_mxn` «convertido» values, `deductible_mxn`, `end_date`) and `client` (`name` ← contratante, `email`, `phone`, `birth_date`, `marital_status`). Same review rule as commissions: empty fields fill, differences keep LifeOps unless picked. A Mina de Oro from another promotoría number (vs the clave in Perfil) needs confirmation; after importing a Mina de Oro older than today, LifeOps recommends uploading the commission files from its cut-off to today. The promotoría can correct any imported receipt from the póliza expediente (**Editar recibo**, audited). See [`docs/product-flows.md`](docs/product-flows.md).

### 2. Authentication & Authorization

**User Roles**:
- `promotory`: Office administrators (can manage consultants, contracts, import data; Asesores page)
- `consultant`: Individual consultants (own contracts, clients, cobranza, and commission import scoped to their `consultant_code`; **no** Asesores page). Profile shows their promotoría name and `consultant_code`. Session profile `id` is always `consultant.id` (not `auth.users.id` / `auth_user_id`).
- Cobranza list shows **one row per póliza**; next due uses the **latest known payment** (prior/manual mark beats old commission `FECHA PAGO`). See [`docs/collection-due-dates.md`](docs/collection-due-dates.md).

**Authentication Flow**:
- Uses Supabase Auth. Sign in and sign up are **correo + contraseña** (sign up is promotoría-only; asesores are invited)
- **Registro → onboarding → dashboard:** a promotoría without `office.onboarding_completed_at` (new or existing) is redirected to `/onboarding` (3 steps: promotoría, quién se registra, operación). Each step is saved; finishing opens the dashboard. Answers are editable later in Perfil except the **clave de promotoría** once captured and the account correo
- **Aseguradoras:** LifeOps supports only **Seguros Monterrey New York Life** for now. If a promotoría selects aseguradoras without Monterrey, onboarding and Perfil show a warning with a support contact (`NEXT_PUBLIC_SUPPORT_EMAIL` / `NEXT_PUBLIC_SUPPORT_WHATSAPP`), and finishing onboarding asks them to acknowledge it before entering. They can still use LifeOps; with Monterrey selected the flow continues normally. Their choices stay in `office_insurer` for follow-up
- Profile stored in `office` or `consultant` tables; if both resolve for the same auth user, **consultant wins** (avoids phantom office rows granting promotory UI)
- `ProtectedRoute` component enforces role-based access
- Consultant invitations create tokens that can be used to sign up
- The configured operator (`PROMOTORY_INVITE_GENERATOR_EMAIL`) can generate one-time promotoría registration links in Perfil. Links expire after seven days; registration creates a promotoría Auth account, and the next login opens onboarding. `APP_BASE_URL` or `NEXT_PUBLIC_APP_URL` supplies the public site origin.
- Promotory full wipe (`POST /api/office/cleanup` from Perfil; database part all-or-nothing in the `cleanup_office_data` RPC, then Storage / Auth) deletes contracts, details, change requests, clients, consultants (and their auth users), plus cobranza rows (`contract_collection_payment`), `audit_log`, `file` rows, and Storage objects under the office `documents/` prefix

**Key Files**:
- `src/contexts/auth-context.tsx`: Provides `useAuth()` hook
- `src/components/protected-route.tsx`: Route protection component

### 3. Database Functions (`src/lib/db/`)

All database requests live in `src/lib/db/` (RLS: `db` for the browser, `createDb(client)` for a server client bound to the user JWT) and `src/lib/db-admin/` (service role, server only). Nothing else calls Supabase directly. `db` is organized by table:

- `db.office.*`: Office management
- `db.consultant.*`: Consultant management
  - `findConsultantByCode(code, officeId?)`: Find by consultant_code
  - `getConsultantById(id)`: Get by ID or auth_user_id
- `db.client.*`: Client management
  - `findOrCreateClientByName(name)`: Auto-creates if doesn't exist
- `db.contract.*`: Contract management
- `db.contractDetail.*`: Contract detail management
  - `writeImportedDetails(contractId, details)`: Insert or update by receipt (no duplicates)
- `db.contractChangeRequest.*`: Change request management
- `db.token.*`: Token management
- `db.collections.*`, `db.dashboard.*`, `db.commissionImport.*`: Cobranza (+ import sync), overview RPCs, import batches
- Shared with Server Actions (take a `SupabaseClient`): `db/collections-service.ts`, `db/manual-contract.ts`, `db/audit-log.ts`

**Import Function** — batched, no total time limit (works on Vercel for promotorías with many pólizas):
- The browser coordinates (`runCommissionImport` in `src/lib/extractor/import/client.ts`): `planImportBatches` splits the preview table into batches of ~50 pólizas / ≤800 rows, keeping every row of one póliza number in the same batch.
- Each step is a Server Action in `src/app/dashboard/extractor/actions.ts` (`maxDuration = 60` per call via the segment `layout.tsx`): **start** (validate dates, open `commission_import` as `pending`) → **batch** × n → **finish** (status `imported` / `failed`, totals, one audit entry). Inputs are validated with Zod (`commissionImport*Schema`).
- Server logic lives in `src/lib/extractor/import/import-contracts.ts` (server only) and runs with `createDb(createUserClient(jwt))`, so RLS scopes every query; asesores are scoped by their session, not by the request.
- Per batch, writes are grouped: new pólizas in one insert (with initial `collection_status`) and all receipts loaded and written together.
- A failed batch is retried up to 3 times. Retrying is safe: receipts are keyed by póliza + RECIBO, pólizas by number, If a batch still fails, its rows are reported and re-importing the file completes them without duplicates.
- An interrupted import leaves its `commission_import` row in `pending`.

### 4. TypeScript Types (`src/lib/supabase.ts`)

Defines interfaces for all database tables:
- `Office`, `Consultant`, `Client`, `Contract`, `ContractDetail`, `CommissionImport`, `ContractCollectionPayment`, `AuditLog`, `ContractChangeRequest`, `File`

## Database Migrations

### Running Migrations

1. **Initial Setup**: Apply migrations with `supabase db push` (starts with `001_baseline_schema.sql`).
2. **Later changes**: run each new numbered file (`002_…sql`, `003_…sql`, …) once. Never edit an already-applied migration.

### Migration Files

- `001_baseline_schema.sql`: Complete baseline schema (tables, indexes, RLS policies, triggers, RPCs)
- Further changes: append-only under `supabase/migrations/`; keep [`docs/database.md`](docs/database.md) in sync

## Important Implementation Details

### Consultant Creation During Import

When importing HTML data:
1. Client checks missing codes via `POST /api/extractor/missing-consultants` (Bearer auth)
2. Auto-creates missing consultants via `POST /api/extractor/create-consultants` (`mode: auto`, service role) with office-scoped email `<asesorCode>.<officeTag>@lifeops.com` (same code allowed in other offices). If `NEXT_PUBLIC_IMPORT_MANUAL_CONSULTANT_CREDENTIALS=true`, the import pauses on **Asesores por registrar**: each code starts with a generated correo, one button invites the checked rows (**Invitar e importar**) or registers everyone without inviting (**Importar**). Invite and import reject a correo that is repeated, already registered, or the same as the promotoría.
3. Auth user ID is used for both `id` and `auth_user_id` on the consultant row
4. Status starts as `NOT_INVITED` when the row is only registered. Sending the invite sets `PENDING` until the adviser accepts and becomes `ACTIVE`.

## Environment Variables

Required in `.env` / `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
RESEND_API_KEY=your_resend_key
```

Optional:
```
# When true, import opens a dialog for new asesores (generated correo, optional invite) instead of auto-create.
NEXT_PUBLIC_IMPORT_MANUAL_CONSULTANT_CREDENTIALS=true
# Contact channels used for insurer support and the public landing page's demo request. Set at least one to show a scheduling link.
NEXT_PUBLIC_SUPPORT_EMAIL=soporte@example.com
NEXT_PUBLIC_SUPPORT_WHATSAPP=523312345678
```

`SUPABASE_SERVICE_ROLE_KEY` is server-only — never use a `NEXT_PUBLIC_` prefix and never put it in `next.config.ts` `env`.

### Date Parsing

HTML dates are in DD/MM/YYYY format. The import function converts them to YYYY-MM-DD for PostgreSQL DATE fields.

### Error Handling

- Import errors are displayed in a warning div on the extractor page (no `alert()` calls)
- Errors include row numbers and descriptive messages
- Import continues even if some rows fail

### Row-Level Security (RLS)

All tables have RLS policies:
- Consultants can only see their own data
- Offices can see all data in their office
- Policies enforce data isolation between offices

## Development

### Getting Started

```bash
pnpm install
pnpm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Key Commands

- `pnpm run dev`: Start development server
- `pnpm run build`: Build for production
- `pnpm run start`: Start production server
- `pnpm run lint`: Run ESLint
- `pnpm run knip`: Unused deps/exports check

## File Structure Details

### Main Pages

- `/dashboard/extractor`: HTML commission import and data extraction
- `/dashboard/contracts`: Póliza list with counters, **póliza status filter** (En vigor by default, Anuladas, Prorrogadas, Sin pago de primas, Todas), cartera status per póliza en vigor (same buckets as Cobranza / Vista general), next due from the receipt calendar, cobranza chips, search, and **manual póliza registration** (dialog: cliente, número, asesor, proyecto, clasificación, emisión, forma de pago, **moneda** (required — payments are registered in it), conducto de cobro)
- `/dashboard/contracts/[id]`: Póliza expediente — status counters, **Rehabilitar** for an anulada póliza (back to en vigor and into cobranza), receipt calendar with each payment on the receipt it covers, register payment, póliza data, history (`audit_log`) and commission lines
- `/dashboard/consultants`: Asesores (promotory only) — counters, cartera per asesor (% al día, con atraso, pagos 30 días), access chips; expediente with cartera status and the asesor's pólizas
- `/dashboard/clients`: Clientes — contact (teléfono / correo owned by the promotoría), pólizas en vigor, most critical cartera status, birthdays; expediente with contact, cartera status and the client's pólizas
- `/dashboard/collections`: Cobranza board — counters, period chips, asesor list (promotory), receipts with days late, side panel to register payment or send a WhatsApp reminder, cartera by days late

### Key Components

- `ProtectedRoute`: Enforces authentication and role-based access
- `RequestFormDialog`: Nueva Solicitud (EMIT / CHANGE / CORRECT) with client/contract autofill and deferred document uploads to `documents`
- `DocumentAttachmentsField`: Pending file + display-name rows for solicitud forms

### Database Layer

- `src/lib/supabase.ts`: Supabase client configuration and TypeScript types
- `src/lib/db/`: RLS-scoped database access, one module per table/domain
- `src/lib/db-admin/`: Service-role database access per domain (server only)

## Notes for Future Development

1. **Consultant Code vs Name**:
   - `consultant_code` = "asesor" from HTML (unique identifier)
   - `name` = Consultant's actual name (can be edited separately)

2. **Contract vs Contract Number**:
   - `contract` table = The contract record
   - `contract_number` field = The "poliza" number from HTML

3. **Contract Details**:
   - One contract can have many `contract_detail` rows
   - Each row represents one line item from the HTML table
   - All original data is preserved in `row_data` JSONB field

4. **Import Idempotency**:
   - If a contract with the same `contract_number` exists, it reuses it
   - Details are keyed by póliza + RECIBO: re-importing never duplicates receipts (unique index `contract_detail_contract_receipt_key`). A saved receipt with different values is **kept** unless the user picks «usar el archivo» in the step 2 review (same for asesor, contratante, forma de pago, moneda); empty LifeOps values are filled automatically.

5. **Import auto-created asesores**:
   - Email pattern: `<asesorCode>.<officeTag>@lifeops.com` (unique per office; same code OK across promotorías)
   - Default password: `Hola123!!` — change for production / invite real emails later
   - `consultant_code` unique per `office_id` only

6. **Dashboard & Cobranza Features (current state)**:
   - List screens (asesores, clientes, pólizas, solicitudes, cobranza, and detail sub-tables) use **Supabase-backed pagination** (`.select(..., { count: 'exact' })` + `.range()`, default 25 rows; shared `TablePagination` UI).
   - Overview dashboard (`/dashboard`):
     - **Promotory** and **consultant** see the same Vista general (office-wide vs own cartera): KPIs, estado de la cartera, avisos, pagos registrados por mes (año actual vs anterior), antigüedad del atraso and cartera por asesor, plus the priority lists (at-risk >30 days + pending payments). Data comes from one RPC, `get_collection_overview`; **counts only** (amounts are not reliable across currencies). See [`docs/product-flows.md`](docs/product-flows.md).
     - Prima filters/counters UI for promotory is parked (`src/parked/dashboard/promotory-premium-overview.tsx`); RPCs remain available for a later restore.
   - Cobranza (`/dashboard/collections`):
     - **Board** (current view): one row per active póliza with its next receipt (receipt calendar), period chips (por cobrar, vencen hoy, en peligro, vencida, por vencer…), asesor list for the promotoría, side panel to **register the payment** (evidence) or **send a WhatsApp reminder** to the client (needs `client.phone`). Data: `list_collection_board`. Counts only in counters (mixed currencies). See [`docs/product-flows.md`](docs/product-flows.md).
     - Year-scoped grid of **active** contracts for payment control and reminder analysis (legacy path).
     - Columns: clave, asesor, póliza, cliente, proyecto, moneda, forma de pago, medio de cobro, prima al cobro, día de cobro, estatus, ENE–DIC.
     - Editable `collection_status` (AMPARADO, CORRIENTE, FLEXIBLE, FLEXIBLE/REVISAR, MES, PERIODO GRACIA, ATRASADO) — separate from contract lifecycle `status`.
     - Month cells show scheduled day and highlight when paid (`contract_collection_payment.paid_at`); click to register/clear payments (real payment date required).
     - **Manual** payment marks require evidence (image/PDF) stored on `file.collection_payment_id`; import marks do not. Signed URL via `/api/documents/[id]/url`.
     - Seeds month marks from HTML import / `contract_detail` without overwriting manual paid marks; append-only `audit_log` for manual and import changes (and other app actions).
     - Legacy vencimientos view remains at `/dashboard/collections/v0`.
   - Promotory can reassign a contract to another advisor in the same office (`/api/contracts/reassign`).
   - **Delete** pólizas, clientes and asesores (always confirmed): a póliza alone; a cliente together with its pólizas in the office; an asesor together with all its pólizas and its LifeOps access (its clients stay). Documents are removed from Storage and each delete is kept in `audit_log`.
   - **Full edit** of pólizas, clientes and asesores (row pencil or expediente **Editar**), validated on the server; every change is logged in `audit_log` (only changed fields) and shown in the expediente **Historial**.
   - Overview dashboard RPCs accept common filter parameters:
     `start_date`, `end_date`, `date_basis`, `seniority_min`, `seniority_max`, `consultant_ids`, `contract_type_filter`, `payment_method_filter`.

7. **Constraints for new development**:
   - **Schema / RPC changes**:
     - Append a **new** file under `supabase/migrations/` (e.g. `002_…sql`). Never edit an already-applied migration.
     - Update [`docs/database.md`](docs/database.md) in the same change.
     - SQL files must include only the statements needed for that change (typically `CREATE OR REPLACE FUNCTION`, `ALTER TABLE`, or `CREATE POLICY` blocks).
   - **Filters contract**:
     - Any new dashboard metric or aggregation should reuse the existing filter parameters and pattern (date basis + date range + seniority + ramo + forma de pago + consultants).
     - Prefer adding/extending RPCs over doing heavy aggregations on the client.
   - **RLS & roles**:
     - Promotory users see/manage all data for their office and its consultants.
     - Consultants only see their own contracts, clients, and related data.
     - New tables must copy this pattern when RLS is enabled.
   - **UI/UX & language**:
     - Dashboard UI is dark with golden accent (`#FBDBAC`) and gradient titles via `dashboard-page-title`.
     - **English** for routes, files, variables, types, SQL, and comments; **Spanish** allowed for user-visible UI copy.
     - Forms use `FormField` + Zod (`src/lib/validation`); filters use Shadcn and “pending + Aplicar” behaviour.
   - **Feedback & errors**:
     - Use `ToastProvider` + `useToast` for user‑facing notifications; avoid `alert()` in new code.
   - **Security**:
     - Prefer `SUPABASE_SERVICE_ROLE_KEY` + `src/lib/supabase/admin.ts` on the server; do not expand client service-role usage.

## Troubleshooting

### Common Issues

1. **"Consultant not found" during import**:
   - Check that `consultant_code` matches the "asesor" value in HTML
   - Ensure consultant exists in the database or create via dialog

2. **Date parsing errors**:
   - Ensure dates in HTML are in DD/MM/YYYY format
   - Empty dates are handled gracefully (stored as NULL)

3. **RLS policy errors**:
   - Ensure user has correct role (promotory vs consultant)
   - Check that `office_id` matches for consultant access

## Reusable Assistant Prompt for This Project

Prefer relying on **`AGENTS.md`** (and Cursor rules) instead of pasting a long prompt. Short bootstrap if needed:

```text
Follow LifeOps AGENTS.md. pnpm only. English routes/code/variables; Spanish UI copy OK. Zod + FormField for forms. Append-only supabase/migrations + docs/database.md. No alert(); use toasts. Service role server-only via src/lib/supabase/admin.ts. Prefer Server Actions / API for privileged work.
```
