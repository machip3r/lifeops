# LifeOps

A Next.js application for managing insurance operations, consultants, clients, contracts, and policy data. The system includes an HTML table extractor that imports data from HTML files into a structured database.

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript 5
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **Styling**: Tailwind CSS 4 + shadcn
- **Validation**: Zod (`src/lib/validation`)
- **State Management**: React Hooks (useState, useContext)

## Agent / contributor standards

AI and human contributors must follow **[`AGENTS.md`](AGENTS.md)** (also pointed to by `CLAUDE.md` and `.cursor/rules/lifeops.mdc`). Product flows: [`docs/product-flows.md`](docs/product-flows.md). Schema reference: [`docs/database.md`](docs/database.md).

## Project Structure

```
lifeops/
├── AGENTS.md                         # Coding standards (source of truth for agents)
├── CLAUDE.md                         # Points at AGENTS.md
├── .cursor/rules/lifeops.mdc         # Cursor always-on project rules
├── docs/
│   ├── database.md                   # Schema / RPC / RLS reference
│   └── product-flows.md              # UX flows by role
├── src/
│   ├── app/                          # Next.js App Router pages
│   │   ├── dashboard/                # Protected dashboard routes
│   │   │   ├── extractor/           # HTML table extractor & import
│   │   │   ├── contracts/           # Contract management
│   │   │   ├── consultants/         # Consultant management
│   │   │   ├── clients/              # Client management
│   │   │   ├── collections/         # Cobranza
│   │   │   ├── projection/          # Proyección
│   │   │   ├── change-requests/     # Contract change requests
│   │   │   └── profile/             # User profile
│   │   ├── login/                   # Authentication page
│   │   ├── invite/[token]/         # Consultant invitation acceptance
│   │   └── api/                    # API routes
│   ├── components/                  # Reusable React components
│   │   └── ui/                      # Design-system primitives + FormField
│   ├── contexts/                    # React contexts (auth)
│   └── lib/                        # Utility functions
│       ├── db.ts                   # Database interaction functions
│       ├── supabase.ts             # Browser client & types (legacy admin export)
│       ├── supabase/               # env + server-only admin client
│       └── validation/             # Zod schemas + field errors
├── supabase/
│   └── migrations/                 # SQL migration files (append-only)
└── public/                         # Static assets

```

## Database Schema

### Core Tables

#### 1. `office`
- **Purpose**: Represents insurance offices/companies
- **Key Fields**:
  - `id` (UUID, PK, references `auth.users.id`)
  - `name` (TEXT)
  - `email` (TEXT, UNIQUE)
- **Relationships**: One office has many consultants

#### 2. `consultant`
- **Purpose**: Insurance consultants/agents
- **Key Fields**:
  - `id` (UUID, PK, auto-generated)
  - `office_id` (UUID, FK → `office.id`)
  - `name` (TEXT)
  - `email` (TEXT, nullable)
  - `consultant_code` (TEXT, nullable, unique when not null) - **This is the "asesor" from HTML imports**
  - `auth_user_id` (UUID, nullable, FK → `auth.users.id`)
  - `status` (TEXT: 'ACTIVE', 'INACTIVE', 'PENDING')
- **Relationships**:
  - Belongs to one office
  - Has many contracts
  - Can optionally link to an auth user account

#### 3. `client`
- **Purpose**: Insurance clients/customers
- **Key Fields**:
  - `id` (UUID, PK)
  - `name` (TEXT)
  - `birth_date` (DATE, nullable)
- **Relationships**: One client can have many contracts

#### 4. `contract`
- **Purpose**: Insurance contracts/policies (polizas)
- **Key Fields**:
  - `id` (UUID, PK)
  - `consultant_id` (UUID, FK → `consultant.id`)
  - `client_id` (UUID, nullable, FK → `client.id`)
  - `contract_number` (TEXT, nullable) - **This stores the "poliza" number from HTML**
  - `folio_number` (TEXT, nullable)
  - `currency` (TEXT, nullable) - **Stores "moneda" from HTML**
  - `status` (TEXT, default 'PENDING')
  - Additional fields: `capture_date`, `project_name`, `insured_amount`, `annual_premium`, etc.
- **Relationships**:
  - Belongs to one consultant
  - Belongs to one client
  - Has many contract_details

#### 5. `contract_detail`
- **Purpose**: Detailed rows associated with a single contract (from HTML table data)
- **Key Fields**:
  - `id` (UUID, PK)
  - `contract_id` (UUID, FK → `contract.id`)
  - `ticket_number` (TEXT, nullable) - RECIBO
  - `plan` (TEXT, nullable) - PLAN
  - `issue_date` (DATE, nullable) - FECHA EMISION
  - `product` (TEXT, nullable) - PRODUCTO
  - `expiration_date` (DATE, nullable) - FECHA VENCIMIENTO
  - `payment_date` (DATE, nullable) - FECHA PAGO
  - `premium_payment` (TEXT, nullable) - PRIMA PAGO
  - `payment_method` (TEXT, nullable) - FORMA DE PAGO
  - `unit_value` (TEXT, nullable) - U.V.
  - `participation_percentage` (TEXT, nullable) - PORCENTAJE PARTICIPACION
  - `commission_premium` (TEXT, nullable) - PRIMA COMISION
  - `commission_honoraries` (TEXT, nullable) - COMISION/HONORARIOS
  - `condition` (TEXT, nullable) - CONDICION
  - `commission_percentage` (TEXT, nullable) - % COMISION
  - `movement` (TEXT, nullable) - MOVIMIENTO
  - `collection_premium` (TEXT, nullable) - PRIMA COBRO
  - `promotional_collection_premium` (TEXT, nullable) - PRIMA COBRO PROM
  - `incremental_premium` (TEXT, nullable) - PRIMA INCREMENTAL
  - `seniority` (TEXT, nullable) - ANTIGÜEDAD
  - `generation_date` (DATE, nullable) - FECHA GENERACION
  - `group_name` (TEXT, nullable) - GRUPO
  - `index_premium` (TEXT, nullable) - PRIMA INDICE
  - `target_premium` (TEXT, nullable) - PRIMA META
  - `row_data` (JSONB, nullable) - Stores any additional/unmapped columns
- **Relationships**: Belongs to one contract

#### 6. `contract_change_request`
- **Purpose**: Requests to change or correct contract information
- **Key Fields**:
  - `id` (UUID, PK)
  - `contract_id` (UUID, FK → `contract.id`)
  - `request_type` (TEXT: 'CHANGE' | 'CORRECT')
  - `status` (TEXT, default 'PENDING')
  - Additional fields: `folio_number`, `details`, `notes`, `folder_key`

#### 7. `token`
- **Purpose**: Manages invitation tokens and other temporary tokens
- **Key Fields**:
  - `id` (UUID, PK)
  - `token` (TEXT, UNIQUE)
  - `type` (TEXT: 'CONSULTANT_INVITATION', 'EMAIL_VERIFICATION', 'PASSWORD_RESET')
  - `status` (TEXT: 'ACTIVE', 'USED', 'EXPIRED')
  - `expires_at` (TIMESTAMP)

### Database Relationships Summary

```
office (1) ──< (many) consultant
consultant (1) ──< (many) contract
client (1) ──< (many) contract
contract (1) ──< (many) contract_detail
contract (1) ──< (many) contract_change_request
```

**Key Rules**:
- One client can have many contracts
- One consultant can have many contracts (and clients)
- One contract has exactly one client and one consultant
- One contract can have many contract_detail rows (from HTML import)

## Key Features

### 1. HTML Table Extractor (`/dashboard/extractor`)

**Purpose**: Import insurance data from HTML files into the database.

**How it works**:
1. User uploads an HTML file containing table data
2. System parses all HTML tables and combines them into a single table
3. First 4 columns are prepended: `Cliente`, `Poliza`, `Moneda`, `Asesor`
4. Data is displayed in a preview table
5. User clicks "Import to Database" button

**Import Process**:
1. **Pre-import Check**: Validates that all consultants (by `consultant_code` = "asesor") exist
2. **Automatic missing-consultant creation**: If codes are missing for the office, import auto-creates them via `POST /api/extractor/create-consultants` (`mode: auto`):
   - Email: `<asesorCode>@lifeops.com` (lowercase code, e.g. `72094@lifeops.com`)
   - Default password: `Hola123!!` (change for production / after invite)
   - Creates Auth user (email confirmed) + `consultant` row (`id` / `auth_user_id` linked)
3. **Data Grouping**: Groups rows by contract (unique combination of `Cliente` + `Poliza` + `Asesor`)
4. **Contract Creation**: For each unique contract:
   - Finds or creates client by name
   - Finds consultant by `consultant_code` (asesor)
   - Checks if contract with same `contract_number` (poliza) exists
   - Creates new contract if it doesn't exist
5. **Contract Details Creation**: For each row in a contract group:
   - Creates a `contract_detail` record
   - Maps all 24 columns from HTML to database fields
   - Stores dates in YYYY-MM-DD format (converted from DD/MM/YYYY)
   - Stores any unmapped data in `row_data` JSONB field

**Important Mappings**:
- `Asesor` (HTML column 3) → `consultant.consultant_code`
- `Poliza` (HTML column 1) → `contract.contract_number`
- `Cliente` (HTML column 0) → `client.name`
- `Moneda` (HTML column 2) → `contract.currency`
- Remaining columns (4+) → `contract_detail` fields

### 2. Authentication & Authorization

**User Roles**:
- `promotory`: Office administrators (can manage consultants, contracts, import data)
- `consultant`: Individual consultants (can view their own contracts and clients)

**Authentication Flow**:
- Uses Supabase Auth
- Profile stored in `office` or `consultant` tables
- `ProtectedRoute` component enforces role-based access
- Consultant invitations create tokens that can be used to sign up

**Key Files**:
- `src/contexts/auth-context.tsx`: Provides `useAuth()` hook
- `src/components/protected-route.tsx`: Route protection component

### 3. Database Functions (`src/lib/db.ts`)

Organized by table, provides CRUD operations:

- `db.office.*`: Office management
- `db.consultant.*`: Consultant management
  - `findConsultantByCode(code, officeId?)`: Find by consultant_code
  - `getConsultantById(id)`: Get by ID or auth_user_id
- `db.client.*`: Client management
  - `findOrCreateClientByName(name)`: Auto-creates if doesn't exist
- `db.contract.*`: Contract management
- `db.contractDetail.*`: Contract detail management
  - `createContractDetail(data)`: Create single detail
  - `createDetails(details[])`: Bulk create
- `db.contractChangeRequest.*`: Change request management
- `db.token.*`: Token management

**Import Function**:
- `db.contract.importContractsFromTable(rows, officeId, consultantAuthUserId?)`:
  - Main import logic
  - Groups rows by contract
  - Creates contracts and contract_details
  - Returns `{ success: number, errors: Array<{row, error}> }`

### 4. TypeScript Types (`src/lib/supabase.ts`)

Defines interfaces for all database tables:
- `Office`, `Consultant`, `Client`, `Contract`, `ContractDetail`, `ContractChangeRequest`, `File`, `Token`

## Database Migrations

### Running Migrations

1. **Initial Setup**: Run `supabase/migrations/schema.sql` in Supabase SQL Editor (baseline).
2. **Later changes**: run each new numbered file (`002_…sql`, `003_…sql`, …) once. Never edit an already-applied migration.

### Migration Files

- `schema.sql`: Complete baseline schema (tables, indexes, RLS policies, triggers, RPCs)
- Further changes: append-only under `supabase/migrations/`; keep [`docs/database.md`](docs/database.md) in sync

## Important Implementation Details

### Consultant Creation During Import

When importing HTML data:
1. Client checks missing codes via `POST /api/extractor/missing-consultants` (Bearer auth)
2. Auto-creates missing consultants via `POST /api/extractor/create-consultants` (`mode: auto`, service role) with email `<asesorCode>@lifeops.com`
3. Auth user ID is used for both `id` and `auth_user_id` on the consultant row
4. Status starts as `PENDING` until the adviser completes setup

## Environment Variables

Required in `.env` / `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
RESEND_API_KEY=your_resend_key
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

- `/dashboard/extractor`: HTML import and data extraction
- `/dashboard/contracts`: Contract listing and management
- `/dashboard/consultants`: Consultant management (promotory only)
- `/dashboard/clients`: Client listing
- `/dashboard/projection`: Financial projection
- `/dashboard/collections`: Collections (cobranza) payment-control grid
- `/dashboard/collections/v0`: Legacy collections “vencimientos” view
- `/dashboard/change-requests`: Contract change requests

### Key Components

- `ProtectedRoute`: Enforces authentication and role-based access
- `RequestFormDialog`: Dialog for creating change requests

### Database Layer

- `src/lib/supabase.ts`: Supabase client configuration and TypeScript types
- `src/lib/db.ts`: All database interaction functions organized by table

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
   - New `contract_detail` records are always created (no deduplication)

5. **Import auto-created asesores**:
   - Email pattern: `<asesorCode>@lifeops.com` (e.g. `72094@lifeops.com`)
   - Default password: `Hola123!!` — change for production / invite real emails later

6. **Dashboard & Cobranza Features (current state)**:
   - Overview dashboard (`/dashboard`) with:
     - Date basis selector (fecha de pago vs fecha de emisión).
     - Date range picker (Shadcn Calendar, pending state + Aplicar).
     - Filters: antigüedad (min/max years), ramo (VI / GM / todos), forma de pago, and asesores multi‑select.
     - Summary section showing total prima pago, total prima meta, and prima meta split by VI/GM with inner borders only (no card chrome).
   - Cobranza (`/dashboard/collections`):
     - Year-scoped grid of **active** contracts for payment control and reminder analysis.
     - Columns: clave, asesor, póliza, cliente, proyecto, moneda, forma de pago, medio de cobro, prima al cobro, día de cobro, estatus, ENE–DIC.
     - Editable `collection_status` (AMPARADO, CORRIENTE, FLEXIBLE, FLEXIBLE/REVISAR, MES, PERIODO GRACIA, ATRASADO) — separate from contract lifecycle `status`.
     - Month cells show scheduled day and highlight when paid (`contract_collection_payment.paid_at`); click to register/clear payments (real payment date required).
     - Seeds month marks from HTML import / `contract_detail` without overwriting manual paid marks; append-only `collection_audit_log` for manual and import changes.
     - Legacy vencimientos view remains at `/dashboard/collections/v0`.
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
