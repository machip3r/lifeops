# LifeOps — Database overview

English reference for the Postgres schema (Supabase). Source of truth: migrations under `supabase/migrations/`.

| Migration | Purpose |
| --------- | ------- |
| `schema.sql` | Full baseline schema, indexes, triggers, RLS, dashboard RPCs |

**Rule:** never edit an applied migration. Append `002_…`, `003_…`, etc.

Auth lives in Supabase **`auth.users`**. App tables are in **`public`**.

---

## Mental model

```
auth.users
 ├── office (id = auth.users.id)          → role: promotory
 └── consultant.auth_user_id → auth.users → role: consultant

office (1) ──< (many) consultant
consultant (1) ──< (many) contract
client (1) ──< (many) contract
contract (1) ──< (many) contract_detail
contract (1) ──< (many) contract_change_request
contract (1) ──< (many) file (via folder_key / ownership patterns)
```

| Boundary | Table | Meaning |
| -------- | ----- | ------- |
| Office | `office` | Promotoría / insurance office account |
| Agent | `consultant` | Asesor; belongs to one office |
| Customer | `client` | Insured / client person |
| Policy | `contract` | Póliza; `contract_number` = poliza id from HTML |
| Line items | `contract_detail` | Commission/table rows for a contract |
| Requests | `contract_change_request` | CHANGE / CORRECT workflows |
| Invites | `token` | Invitation / verification tokens |

**Promotory** sees all data for their office and consultants. **Consultants** see only their own contracts, clients, and related rows (via RLS).

---

## Tables

### `office`

| Column | Notes |
| ------ | ----- |
| `id` | PK, FK → `auth.users` |
| `name`, `email` | Email unique |
| `created_at`, `updated_at` | |

### `consultant`

| Column | Notes |
| ------ | ----- |
| `id` | PK (temp UUID or auth user id) |
| `office_id` | FK → `office` |
| `name` | Display name |
| `email` | Nullable; unique when set |
| `consultant_code` | Asesor code from HTML import; unique when set |
| `auth_user_id` | Nullable FK → `auth.users` when invited |
| `status` | `ACTIVE` \| `INACTIVE` \| `PENDING` |

### `client`

| Column | Notes |
| ------ | ----- |
| `id` | PK |
| `office_id` | Optional FK → `office` |
| `name` | Required |
| `birth_date` | Optional |

### `token`

Invitation and similar one-time tokens.

| Column | Notes |
| ------ | ----- |
| `token` | Unique |
| `type` | e.g. `CONSULTANT_INVITATION`, `EMAIL_VERIFICATION`, `PASSWORD_RESET` |
| `status` | `ACTIVE` \| `USED` \| `EXPIRED` |
| `expires_at` | Required |
| `metadata` | JSONB |

### `contract`

| Column | Notes |
| ------ | ----- |
| `consultant_id` | FK → `consultant` |
| `client_id` | Optional FK → `client` |
| `contract_number` | Poliza number from HTML |
| `currency`, `exchange_rate` | FX; null rate ≈ MXN |
| `status` | Default `PENDING` |
| `metadata` | JSONB |
| Premium / project fields | `insured_amount`, `annual_premium`, `payment_method`, etc. |

### `contract_detail`

Detailed HTML import rows (RECIBO, PLAN, dates, premiums, commissions, …). Unmapped columns may live in `row_data` JSONB.

### `contract_change_request`

| Column | Notes |
| ------ | ----- |
| `request_type` | `CHANGE` \| `CORRECT` |
| `status` | Default `PENDING` |
| `folio_number`, `details`, `notes`, `folder_key` | |

### `file`

Uploaded files tied to contracts / folders (see migration for columns and policies).

---

## Dashboard RPCs

Overview and Cobranza prefer SQL RPCs with a shared filter contract, for example:

- `start_date`, `end_date`
- `date_basis` (`payment` vs `issue`)
- `seniority_min`, `seniority_max`
- `consultant_ids`
- `contract_type_filter` (ramo VI / GM / all)
- `payment_method_filter`

Known RPC family (see `schema.sql` and `db.dashboard.*`): `get_office_totals`, `get_top_consultants_by_sales`, `get_office_totals_by_type`, `get_office_consultants_sales`, plus collections helpers.

Prefer **extending RPCs** over client-side heavy aggregation. Any signature change ships as a **new migration** and an update to this doc.

---

## RLS summary

- RLS enabled on core tables (`office`, `consultant`, `client`, `contract`, `contract_detail`, `contract_change_request`, `token`, `file`).
- Offices manage their own profile and their consultants’ data.
- Consultants read/update their own profile and own contracts.
- Token policies allow invite redemption flows (read by token value when unused).

When adding tables: copy the office/consultant isolation pattern.

---

## HTML import mappings

| HTML | Database |
| ---- | -------- |
| Asesor | `consultant.consultant_code` |
| Poliza | `contract.contract_number` |
| Cliente | `client.name` |
| Moneda | `contract.currency` |
| Remaining columns | `contract_detail` (+ `row_data`) |

Dates in HTML are typically `DD/MM/YYYY` → store as `YYYY-MM-DD`.
