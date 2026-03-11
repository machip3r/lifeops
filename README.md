# LifeOps

A Next.js application for managing insurance operations, consultants, clients, contracts, and policy data. The system includes an HTML table extractor that imports data from HTML files into a structured database.

## Tech Stack

- **Framework**: Next.js 16.0.4 (App Router)
- **Language**: TypeScript 5
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **Styling**: Tailwind CSS 4
- **State Management**: React Hooks (useState, useContext)

## Project Structure

```
lifeops/
├── src/
│   ├── app/                          # Next.js App Router pages
│   │   ├── dashboard/                # Protected dashboard routes
│   │   │   ├── extractor/           # HTML table extractor & import
│   │   │   ├── contracts/           # Contract management
│   │   │   ├── consultants/         # Consultant management
│   │   │   ├── clients/              # Client management
│   │   │   ├── policies/            # Policy management
│   │   │   ├── change-requests/     # Contract change requests
│   │   │   └── profile/             # User profile
│   │   ├── login/                   # Authentication page
│   │   ├── invite/[token]/         # Consultant invitation acceptance
│   │   └── api/                    # API routes
│   ├── components/                  # Reusable React components
│   ├── contexts/                    # React contexts (auth)
│   └── lib/                        # Utility functions
│       ├── db.ts                   # Database interaction functions
│       └── supabase.ts             # Supabase client & TypeScript types
├── supabase/
│   └── migrations/                 # SQL migration files
│       ├── schema.sql              # Complete database schema
│       └── create_contract_details_table.sql  # Contract details table
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
2. **Missing Consultants Dialog**: If consultants don't exist:
   - Shows dialog with list of missing consultants
   - User can set email and password for each
   - Default test emails: `braulinusmac+a1@gmail.com`, `braulinusmac+a2@gmail.com`, etc.
   - Default password: `Hola123!!`
   - Creates auth user via `supabaseAdmin.auth.admin.createUser`
   - Creates consultant record with `auth_user_id` linked to the new user
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

## Environment Variables

Required in `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

## Database Migrations

### Running Migrations

1. **Initial Setup**: Run `supabase/migrations/schema.sql` in Supabase SQL Editor
2. **Contract Details Table**: Run `supabase/migrations/create_contract_details_table.sql`

### Migration Files

- `schema.sql`: Complete database schema (tables, indexes, RLS policies, triggers)
- `create_contract_details_table.sql`: Creates `contract_detail` table with all columns

## Important Implementation Details

### Consultant Creation During Import

When importing HTML data:
1. System checks if consultants exist by `consultant_code` (asesor)
2. If missing, shows dialog to create them
3. Creates auth user first via `supabaseAdmin.auth.admin.createUser`
4. Uses auth user ID for both `id` and `auth_user_id` in consultant table
5. Sets consultant status to 'ACTIVE' after user creation

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
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Key Commands

- `npm run dev`: Start development server
- `npm run build`: Build for production
- `npm run start`: Start production server
- `npm run lint`: Run ESLint

## File Structure Details

### Main Pages

- `/dashboard/extractor`: HTML import and data extraction
- `/dashboard/contracts`: Contract listing and management
- `/dashboard/consultants`: Consultant management (promotory only)
- `/dashboard/clients`: Client listing
- `/dashboard/policies`: Policy management
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

5. **Testing Defaults**:
   - Consultant creation uses test emails: `braulinusmac+a{N}@gmail.com`
   - Default password: `Hola123!!`
   - These should be changed for production

6. **Dashboard & Cobranza Features (current state)**:
   - Overview dashboard (`/dashboard`) with:
     - Date basis selector (fecha de pago vs fecha de emisión).
     - Date range picker (Shadcn Calendar, pending state + Aplicar).
     - Filters: antigüedad (min/max years), ramo (VI / GM / todos), forma de pago, and asesores multi‑select.
     - Summary section showing total prima pago, total prima meta, and prima meta split by VI/GM with inner borders only (no card chrome).
   - Cobranza (`/dashboard/collections`):
     - Computes next payment date per contract from `payment_date` + `payment_method` (Mensual/Trimestral/Semestral/Anual).
     - Shows upcoming amounts due (using `premium_payment` of the latest detail row).
     - Simple filter for “fin de mes actual” vs “fin del próximo mes”.
   - All of this is backed by SQL RPCs that accept common filter parameters:
     `start_date`, `end_date`, `date_basis`, `seniority_min`, `seniority_max`, `consultant_ids`, `contract_type_filter`, `payment_method_filter`.

7. **Constraints for new development**:
   - **Schema / RPC changes**:
     - Always update `supabase/migrations/schema.sql` **and** create a dedicated, self‑contained `.sql` file under `supabase/` (e.g. `dashboard_filters_*.sql`, `fix_*.sql`) for each change so it can be run directly in the Supabase SQL editor.
     - SQL files must include only the statements needed for that change (typically one or more `CREATE OR REPLACE FUNCTION`, `ALTER TABLE`, or `CREATE POLICY` blocks).
   - **Filters contract**:
     - Any new dashboard metric or aggregation should reuse the existing filter parameters and pattern (date basis + date range + seniority + ramo + forma de pago + consultants).
     - Prefer adding/extending RPCs over doing heavy aggregations on the client.
   - **RLS & roles**:
     - Promotory users see/manage all data for their office and its consultants.
     - Consultants only see their own contracts, clients, and related data.
     - New tables must copy this pattern when RLS is enabled.
   - **UI/UX & language**:
     - Dashboard UI is dark with golden accent (`#FBDBAC`) and gradient titles via `dashboard-page-title`.
     - All dashboard copy is in Spanish; code (file names, types, SQL) stays in English.
     - Filters use Shadcn components and “pending + Aplicar” behaviour (no auto‑query on every keystroke).
   - **Feedback & errors**:
     - Use `ToastProvider` + `useToast` for user‑facing notifications; avoid `alert()` in new code.

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

When starting a new AI chat for this repo, you can paste the following prompt so the assistant respects the project’s conventions:

```text
You are working in the LifeOps project (Next.js + Supabase) for an insurance office dashboard.

Critical rules:
- All user‑facing UI text in the dashboard is in Spanish; file names, types, and SQL identifiers stay in English.
- The overview dashboard (`/dashboard`) already has a rich filter system:
  - Date basis (`payment` vs `issue`)
  - Date range (Shadcn Calendar, pending state + Aplicar)
  - Seniority range (years), Ramo (VI / GM), Forma de pago, and Asesores multi‑select
- All overview stats must use the existing SQL RPCs (`get_office_totals`, `get_top_consultants_by_sales`, `get_office_totals_by_type`, `get_office_consultants_sales`) via `db.dashboard.*`, or new RPCs that follow the same parameter contract.
- There is a Cobranza page (`/dashboard/collections`) that computes next payment dates based on `payment_date` + `payment_method` (Mensual/Trimestral/Semestral/Anual) and shows upcoming amounts due.

Database & migrations:
- Database schema lives in `supabase/migrations/schema.sql`.
- For **every** schema change or RPC signature change you propose, you MUST:
  1) Show the exact SQL,
  2) And put it into a **separate, self‑contained `.sql` file** path under `supabase/` that I can run in the Supabase SQL editor (no manual editing of `schema.sql` only).

Other constraints:
- Respect existing RLS patterns: promotory users see office‑wide data; consultants see only their own data.
- Use the toast system (`ToastProvider` + `useToast`) for user‑facing errors/success; never use `alert()`.
- Keep the dark UI with the golden gradient titles (`dashboard-page-title`) and clean, inline filter layouts.
- Prefer pushing aggregations and filters into SQL RPCs instead of doing heavy work on the client.
```
