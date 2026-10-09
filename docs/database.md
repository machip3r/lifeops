# LifeOps — Database overview

English reference for the Postgres schema (Supabase). Source of truth: migrations under `supabase/migrations/`.

| Migration | Purpose |
| --------- | ------- |
| `001_baseline_schema.sql` | Full baseline schema, indexes, triggers, RLS, dashboard RPCs (must run before `002+`) |
| `002_collections_control.sql` | Cobranza payment grid: `collection_status` / `collection_day` on `contract`, `contract_collection_payment`, `collection_audit_log`, seed RPC + RLS |
| `003_collection_payment_channel_audit.sql` | Extends `collection_audit_log.action_type` with `payment_channel_change` |
| `004_collection_project_name_audit.sql` | Extends `collection_audit_log.action_type` with `project_name_change` |
| `005_consultant_code_per_office.sql` | `consultant_code` unique per `office_id` (same code allowed across offices) |
| `006_drop_global_consultant_code_constraint.sql` | Drops leftover global UNIQUE `consultant_consultant_code_key` so 005’s per-office index actually applies |
| `007_security_advisor_hardening.sql` | Fix `handle_updated_at` search_path; tighten client/file/token RLS; revoke anon EXECUTE on SECURITY DEFINER RPCs; auth guards on privileged RPCs |
| `008_office_tags.sql` | (historical) Office tags — removed in `016` |
| `009_solicitud_documents.sql` | Private Storage bucket `documents`; tenancy columns on `file` (`office_id`, `consultant_id`, `contract_id`, `change_request_id`, `display_name`); office/consultant RLS |
| `010_client_identity_contract_office.sql` | Client `curp`/`rfc` (hybrid identity) + denormalized `contract.office_id` + unique `(office_id, contract_number)` |
| `011_commission_import_risk_evidence.sql` | `commission_import` batch; risk/pending RPCs; `file.collection_payment_id` for payment evidence |
| `012_at_risk_days_30.sql` | Default at-risk window: 30 days (was 45) |
| `013_contract_reassignment_log.sql` | (historical) Dedicated reassignment log — folded into `audit_log` in `017` |
| `014_create_office_require_session.sql` | `create_office` requires `auth.uid() = user_id` (no anon/null bypass) |
| `015_drop_reassignment_log_comment.sql` | Cleared table comment before consolidating audit |
| `016_drop_office_tags.sql` | Drops `consultant_tag` + `tag` (fase 1: no tags) |
| `017_audit_log.sql` | Creates `audit_log`, backfills from old logs, drops `collection_audit_log` + `contract_reassignment_log` |
| `018_audit_log_consultant_rls.sql` | Consultant RLS on `audit_log` matches `id` **or** `auth_user_id` |
| `019_fix_create_consultant_ambiguous_code.sql` | Renames `create_consultant` arg to `consultant_code_param` (fixes 42702 ambiguous column) |
| `020_consultant_auth_user_rls.sql` | RLS for invited asesores: match `consultant.id` **or** `auth_user_id`; office readable by its asesores |
| `021_drop_phantom_consultant_offices.sql` | Deletes phantom `office` rows where `id` = invited asesor `auth_user_id` but real `office_id` differs |
| `022_fix_office_rls_actor_role_office.sql` | Break office↔consultant RLS recursion (`my_consultant_office_ids`); `audit_log.actor_role` uses `office` not `promotory` |

**Rule:** never edit an applied migration. Append `002_…`, `003_…`, etc.

Auth lives in Supabase **`auth.users`**. App tables are in **`public`**.

---

## Mental model

```
auth.users
 ├── office (id = auth.users.id)          → role: promotory
 └── consultant.auth_user_id → auth.users → role: consultant

office (1) ──< (many) consultant
office (1) ──< (many) commission_import
office (1) ──< (many) audit_log
consultant (1) ──< (many) contract
client (1) ──< (many) contract
contract.office_id → office (denormalized)
contract (1) ──< (many) contract_detail
contract (1) ──< (many) contract_collection_payment
contract (1) ──< (many) contract_change_request
contract (1) ──< (many) file
contract_change_request (1) ──< (many) file (optional; NULL for EMIT docs)
contract_collection_payment (1) ──< (many) file (payment evidence via collection_payment_id)
```

| Boundary | Table | Meaning |
| -------- | ----- | ------- |
| Office | `office` | Promotoría / insurance office account |
| Agent | `consultant` | Asesor; belongs to one office |
| Customer | `client` | Insured / client person |
| Policy | `contract` | Póliza; `contract_number` = poliza id from HTML; `office_id` denormalized; `source` = import/manual/mixed |
| Import batch | `commission_import` | One upload of commissions HTML/Excel with required `issue_date` |
| Line items | `contract_detail` | Commission/table rows for a contract; optional `commission_import_id` |
| Collection marks | `contract_collection_payment` | Per year/month paid mark + scheduled day |
| Activity | `audit_log` | Append-only app activity (cobranza, reassign, invite, create, …) |
| Requests | `contract_change_request` | CHANGE / CORRECT workflows (UI parked) |
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
| `consultant_code` | Asesor code from HTML/Excel import; unique per office when set |
| `auth_user_id` | Nullable FK → `auth.users` when invited |
| `status` | `NOT_INVITED` (created, no invite yet) \| `PENDING` (invite sent) \| `ACTIVE` \| `INACTIVE` |

### `client`

| Column | Notes |
| ------ | ----- |
| `id` | PK |
| `office_id` | FK → `office`; required when no CURP/RFC (local-by-office) |
| `name` | Required |
| `birth_date` | Optional |
| `curp` | Optional; unique globally (case-insensitive) when set |
| `rfc` | Optional; unique globally (case-insensitive) when set |

**Identity rule:** `CHECK (office_id IS NOT NULL OR curp IS NOT NULL OR rfc IS NOT NULL)`. Dedupe order: CURP → RFC → name+office. See [`product-decisions.md`](product-decisions.md).

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
| `office_id` | Denormalized FK → `office` (synced from consultant via trigger); unique with `contract_number` when number set |
| `consultant_id` | FK → `consultant` |
| `client_id` | Optional FK → `client` |
| `contract_number` | Poliza number from HTML |
| `source` | `import` \| `manual` \| `mixed` |
| `issue_date` | Policy emission date when known |
| `currency`, `exchange_rate` | FX. App catalog for `currency` is `UDI`, `PESO`, `DOLAR`; null rate ≈ MXN |
| `status` | Default `PENDING` (ACTIVE / INACTIVE / PENDING) — lifecycle, not cobranza |
| `collection_status` | Cobranza estatus: `AMPARADO`, `CORRIENTE`, `FLEXIBLE`, `FLEXIBLE_REVISAR`, `MES`, `PERIODO_GRACIA`, `ATRASADO` (nullable) |
| `collection_day` | Day of month (1–31) for DIA DE COBRO (agreed cobro day); nullable |
| `metadata` | JSONB |
| Premium / project fields | `project_name`, `insured_amount`, `annual_premium`, `payment_method`, `payment_channel`, etc. |

### `commission_import`

Batch metadata for one commission file upload.

| Column | Notes |
| ------ | ----- |
| `office_id` | Tenancy |
| `uploaded_by` | Auth user |
| `issue_date` | Required emission date of the file |
| `prior_payment_date` | Prompted when creating first-time policies |
| `status` | `pending` \| `preview` \| `imported` \| `failed` |
| `file_name` / `file_path` / counts | Traceability |

### `contract_detail`

Detailed HTML import rows (RECIBO, PLAN, dates, premiums, commissions, …). Unmapped columns may live in `row_data` JSONB.

### `contract_collection_payment`

One row per `(contract_id, year, month)` for the Cobranza grid.

| Column | Notes |
| ------ | ----- |
| `scheduled_day` | Day shown in month cell (1–31) |
| `paid_at` | Real payment date; non-null ⇒ paid / highlighted |
| `amount`, `notes` | Optional |
| `source` | `manual` \| `import` — manual marks are not overwritten by import seed |
| `commission_import_id` | Optional FK → `commission_import` |
| `created_by`, `updated_by` | Optional FK → `auth.users` |

### `audit_log`

Append-only office activity (migration `017`). Replaces `collection_audit_log` and `contract_reassignment_log`. Writer helper: `src/lib/audit/write.ts`. See [`audit-log-plan.md`](audit-log-plan.md).

| Column | Notes |
| ------ | ----- |
| `office_id` | Tenancy |
| `actor_user_id` | Who performed the action (`auth.users`) |
| `actor_role` | `office` \| `consultant` \| `system` (optional; UI copy: promotoría / asesor) |
| `action` | Namespaced string, e.g. `collection.payment_upsert`, `contract.reassign`, `consultant.invite` |
| `entity_type` | `contract`, `consultant`, `client`, `office`, … |
| `entity_id` | UUID nullable (bulk / invite without row id) |
| `source` | `ui` \| `import` \| `api` \| `system` |
| `old_values`, `new_values` | JSONB snapshots (no secrets) |
| `created_at` | |

### `contract_change_request`

| Column | Notes |
| ------ | ----- |
| `request_type` | `CHANGE` \| `CORRECT` |
| `status` | Default `PENDING` |
| `folio_number`, `details`, `notes`, `folder_key` | |

### `file`

Uploaded solicitud / contract / cobranza evidence documents. Storage objects live in the private `documents` bucket under
`{officeId}/{consultantId}/{contractId}/{contractCode}/…`. Rows store metadata; downloads use short-lived signed URLs (API), not permanent public URLs.

| Column | Notes |
| ------ | ----- |
| `office_id`, `consultant_id`, `contract_id` | Required tenancy FKs |
| `change_request_id` | Optional; set for CHANGE/CORRECT attachments; NULL for EMIT |
| `collection_payment_id` | Optional; set when file is payment evidence for a cobranza month |
| `display_name` | User-facing document label |
| `file_name`, `file_path`, `file_type`, `file_size` | Storage object metadata |
| `file_url` | Legacy; prefer signed URLs at read time |
| `status` | Default `ACTIVE` |

---

## Dashboard RPCs

Overview and Cobranza prefer SQL RPCs with a shared filter contract, for example:

- `start_date`, `end_date`
- `date_basis` (`payment` vs `issue`)
- `seniority_min`, `seniority_max`
- `consultant_ids`
- `contract_type_filter` (ramo VI / GM / all)
- `payment_method_filter`

Known RPC family (see `001_baseline_schema.sql` and `db.dashboard.*`): `get_office_totals`, `get_top_consultants_by_sales`, `get_office_totals_by_type`, `get_office_consultants_sales`.

Collections helper (see `002_collections_control.sql`):

- `seed_collection_payments_from_details(year_param)` — SECURITY INVOKER; upserts import-sourced month marks from `contract_detail.payment_date` for the year; never overwrites paid **manual** rows; prefills `contract.collection_day` when null.

Risk / reminders (see `011_commission_import_risk_evidence.sql`, `012_at_risk_days_30.sql`, `023_at_risk_from_last_payment.sql`):

- `payment_method_step_months(text)` — Mensual=1, Trimestral=3, Semestral=6, Anual=12.
- `next_due_from_last_payment(last_paid, payment_method, collection_day)` — same next-due rule as Cobranza (`src/lib/collections/next-due.ts`).
- `contract_last_known_payment(contract_id)` — latest `contract_collection_payment.paid_at`, else latest `contract_detail.payment_date`.
- `list_contracts_at_risk(office_id, consultant_id, risk_days=30, lookback_months=12)` — SECURITY DEFINER + `caller_can_access_*`; next due from last known payment more than `risk_days` overdue (`lookback_months` unused, kept for API compat).
- `list_contracts_pending_payment(office_id, consultant_id, within_days=15)` — next due within horizon (or overdue ≤ 30 days); excludes at-risk.
- `month_due_date(y, m, day)` — clamps day-of-month to calendar month length.

Prefer **extending RPCs** over client-side heavy aggregation. Any signature change ships as a **new migration** and an update to this doc.

---

## RLS summary

- RLS enabled on core tables (`office`, `consultant`, `client`, `contract`, `contract_detail`, `contract_collection_payment`, `audit_log`, `contract_change_request`, `token`, `file`, `commission_import`).
- Offices manage their own profile and their consultants’ data.
- Consultants read/update their own profile and own contracts.
- `commission_import`: office ALL; consultants SELECT same office.
- `contract_collection_payment`: same office/consultant contract tenancy (SELECT/INSERT/UPDATE/DELETE).
- `audit_log`: append-only (SELECT/INSERT). Office sees all for `office_id`; consultants see rows they authored or for their contracts (membership via `consultant.id` **or** `consultant.auth_user_id`).
- `client` mutations are office-scoped (or via own contracts); no always-true INSERT/UPDATE/DELETE policies. Hybrid CURP/RFC uniqueness is global.
- `file`: office sees own `office_id`; consultants SELECT/INSERT/UPDATE/DELETE only for their `consultant_id`. Uploads go through authenticated APIs using the service role into private Storage bucket `documents`. Optional `collection_payment_id` for payment evidence.
- Token policies allow invite redemption flows (read by token value when unused); authenticated inserts require `metadata.office_id = auth.uid()`.
- Dashboard / invite **SECURITY DEFINER** RPCs: `EXECUTE` revoked from `PUBLIC` and `anon`; granted to `authenticated` + `service_role`. Bodies check office/consultant access when `auth.uid()` is present.

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
