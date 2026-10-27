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
| `023_at_risk_from_last_payment.sql` | Risk / pending RPCs use next due from last known payment + forma de pago (same rule as Cobranza) |
| `024_consultant_not_invited_status.sql` | Adds `NOT_INVITED` to `consultant.status`; backfills `PENDING` rows that never got an invitation token |
| `025_backfill_contract_issue_date.sql` | Fills empty `contract.issue_date` with the earliest `contract_detail.issue_date` |
| `026_contract_detail_receipt_number.sql` | `contract_detail.receipt_number` (RECIBO) unique per contract; removes exact copies left by re-uploading the same file |
| `027_office_onboarding.sql` | Promotoría onboarding: catalogs (`mx_state`, `insurer`, `line_of_business`), onboarding columns on `office` (`name` now nullable), `office_contact`, `office_insurer`, `office_line_of_business`, save RPCs, clave lock trigger |
| `028_collection_overview.sql` | `get_collection_overview` — Vista general in one call (status buckets, aging, payments per month, per asesor) |
| `029_next_due_from_issue_date.sql` | `next_collection_due` + `collection_receipt_due`: next due from FECHA EMISION + forma de pago (receipt calendar); at-risk / pending lists and `get_collection_overview` use it |
| `030_contract_portfolio_list.sql` | `list_contract_portfolio` — Pólizas list page with cartera status, next due, chip counts and counters in one call |
| `033_policy_registry_fields.sql` | Mina de Oro / plantilla data: `contract.insured_name`, `line_code` (FK `line_of_business`), `plan_classification`, `end_date`, `annual_premium_mxn`, `insured_amount_mxn`, `deductible_mxn`; `client.marital_status` |
| `032_collection_board.sql` | `list_collection_board` — Cobranza board: active pólizas with next receipt, status, client phone, asesor and amount hint, plus payments this month |
| `034_office_update_contract_details.sql` | Missing office UPDATE policy on `contract_detail` (re-imports that change a receipt, **Editar recibo**) |
| `031_client_contact_and_portfolios.sql` | `client.phone` / `client.email`; internal `contract_cartera_rows`; `list_contract_portfolio` gains `client_id_param` and a fuller summary; `list_client_portfolio` and `list_consultant_portfolio` |

**Rule:** never edit an applied migration. Append `002_…`, `003_…`, etc.

Auth lives in Supabase **`auth.users`**. App tables are in **`public`**.

---

## Mental model

```
auth.users
 ├── office (id = auth.users.id)          → role: promotory
 └── consultant.auth_user_id → auth.users → role: consultant

office (1) ──< (many) office_contact (REGISTRANT, OWNER)
office (n) ──< office_insurer >── (n) insurer
office (n) ──< office_line_of_business >── (n) line_of_business
office (n) ──> (1) mx_state
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
| Line items | `contract_detail` | One paid receipt per row (RECIBO unique per contract); optional `commission_import_id` |
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
| `name` | Promotoría name. **Nullable** since `027`: signup asks only correo + contraseña; onboarding step 1 fills it |
| `email` | Unique |
| `agency_code` | Clave de promotoría (optional). App users can set it while empty or until onboarding is complete; then the `office_lock_agency_code` trigger blocks changes from `authenticated` (support changes it with the service role) |
| `state_code` | FK → `mx_state` |
| `consultant_count_range` | `1_5` \| `6_20` \| `21_50` \| `51_100` \| `100_PLUS` |
| `active_policy_range` | `LT_100` \| `100_500` \| `500_2000` \| `2000_10000` \| `GT_10000` |
| `primary_goal` | Optional: `COLLECTIONS` \| `COMMISSIONS` \| `CONSULTANTS` \| `ALL` |
| `onboarding_step` | Last step saved, 0–3 (resume point) |
| `onboarding_version` | Questions version answered (bump to ask new required questions) |
| `onboarding_completed_at` | `NULL` ⇒ the promotoría is sent to `/onboarding` before the dashboard. A CHECK requires name, state and both ranges once set |
| `created_at`, `updated_at` | |

### Onboarding tables (`027`)

Single-choice answers are CHECK-constrained codes on `office` (labels in `src/lib/onboarding/options.ts`). Multi-choice answers use catalogs + join tables.

| Table | Key | Notes |
| ----- | --- | ----- |
| `mx_state` | `code` (ISO 3166-2:MX, e.g. `JAL`) | 32 estados; read-only |
| `insurer` | `code` (e.g. `MONTERREY_NYL`, `GNP`, `OTHER`) | `name`, `sort_order`; read-only |
| `line_of_business` | `code` (`LIFE`, `HEALTH`, `SAVINGS`, `AUTO`, `PROPERTY`, `OTHER`) | Ramos; read-only |
| `office_contact` | (`office_id`, `kind`) | `kind` = `REGISTRANT` (who signed up; requires `job_role`) or `OWNER` (only when the registrant is not the owner). `full_name`, `phone` (10 digits) |
| `office_insurer` | (`office_id`, `insurer_code`) | `other_name` required only for `OTHER` |
| `office_line_of_business` | (`office_id`, `line_code`) | |

Indexes: PKs cover lookups by office; `idx_office_insurer_insurer_code`, `idx_office_line_of_business_line_code`, `idx_office_state_code` serve reverse lookups (e.g. promotorías per aseguradora).

**Save RPCs** (SECURITY INVOKER, so RLS applies; one transaction per step; reused by Perfil):
- `save_office_onboarding_profile(p_name, p_state_code, p_agency_code)` — step 1; keeps a locked clave silently.
- `save_office_onboarding_contacts(p_full_name, p_job_role, p_phone, p_owner_name, p_owner_phone)` — step 2; upserts `REGISTRANT`, upserts or deletes `OWNER`.
- `save_office_onboarding_operation(p_insurer_codes[], p_other_insurer, p_line_codes[], p_consultant_count_range, p_active_policy_range, p_primary_goal, p_version)` — step 3; replaces selections, sets `onboarding_completed_at` the first time and returns it.

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
| `phone` | Optional contact / WhatsApp, 10 digits (`client_phone_check`) — owned by the promotoría |
| `email` | Optional contact, lowercase, ≤254 (`client_email_check`) |
| `marital_status` | Estado civil from the insurer report; ≤40 |

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
| `issue_date` | Policy emission date. Import writes the earliest `FECHA EMISION` from the file here and on `contract_detail` |
| `currency`, `exchange_rate` | FX. App catalog for `currency` is `UDI`, `PESO`, `DOLAR`; null rate ≈ MXN |
| `status` | Default `PENDING` (ACTIVE / INACTIVE / PENDING) — lifecycle, not cobranza |
| `collection_status` | Cobranza estatus: `AMPARADO`, `CORRIENTE`, `FLEXIBLE`, `FLEXIBLE_REVISAR`, `MES`, `PERIODO_GRACIA`, `ATRASADO` (nullable) |
| `collection_day` | Day of month (1–31) for DIA DE COBRO (agreed cobro day); nullable |
| `metadata` | JSONB |
| Premium / project fields | `project_name` (plan), `insured_amount`, `annual_premium` (text, póliza currency), `payment_method`, `payment_channel` (conducto de cobro) |
| `insured_name` | Persona asegurada principal (may differ from the contratante); ≤120 |
| `line_code` | Ramo, FK → `line_of_business.code` (`LIFE` vida, `HEALTH` gastos médicos) |
| `plan_classification` | Insurer classification (TRADICIONAL, FLEXIBLE, GMM…); ≤40 |
| `end_date` | Fin de vigencia (fecha de terminación del contrato); partial index |
| `annual_premium_mxn`, `insured_amount_mxn`, `deductible_mxn` | Amounts converted to pesos by the insurer (Mina de Oro «Convertido»); ≥0 — allow totals across currencies |

### `commission_import`

Batch metadata for one commission file upload.

| Column | Notes |
| ------ | ----- |
| `office_id` | Tenancy |
| `uploaded_by` | Auth user |
| `issue_date` | Required emission date of the file |
| `prior_payment_date` | Legacy (no longer asked since `029`) |
| `status` | `pending` \| `preview` \| `imported` \| `failed` |
| `file_name` / `file_path` / counts | Traceability |

### `contract_detail`

One payment receipt from a commission file (the file lists which receipts were paid on its dates).

| Column | Notes |
| ------ | ----- |
| `contract_id` | FK → `contract` (cascade delete) |
| `commission_import_id` | Last `commission_import` batch that wrote the row |
| `receipt_number` | RECIBO; unique with `contract_id` when set (`contract_detail_contract_receipt_key`) |
| `issue_date`, `payment_date` | FECHA EMISION, FECHA PAGO |
| `premium_payment`, `payment_method` | PRIMA PAGO, FORMA DE PAGO |
| `commission_premium`, `commission_honoraries`, `commission_percentage` | PRIMA COMISION, COMISION/HONORARIOS, % COMISION |
| `collection_premium`, `target_premium` | PRIMA COBRO, PRIMA META |
| `movement`, `seniority` | MOVIMIENTO, ANTIGÜEDAD |

**Edit:** the promotoría can edit one receipt from the expediente (`contractDetail.updateWithAudit`, audit `contract_detail.update` on the póliza); the cobranza import mark is resynced (`syncEditedDetailPayment`).

**No duplicates:** importing a receipt that already exists updates its values instead of adding a row. Rows saved before `026` have no `receipt_number`; an incoming receipt with identical values adopts that row. Files without a RECIBO column fall back to skipping rows identical in every value. Logic: `src/lib/extractor/receipt.ts`.

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

Append-only office activity (migration `017`). Replaces `collection_audit_log` and `contract_reassignment_log`. Writer helper: `src/lib/db/audit-log.ts` (`writeAuditLogAdmin` in `db-admin` for route handlers). See [`audit-log-plan.md`](audit-log-plan.md).

| Column | Notes |
| ------ | ----- |
| `office_id` | Tenancy |
| `actor_user_id` | Who performed the action (`auth.users`) |
| `actor_role` | `office` \| `consultant` \| `system` (optional; UI copy: promotoría / asesor) |
| `action` | Namespaced string, e.g. `collection.payment_upsert`, `contract.reassign`, `consultant.invite`. UI edits: `contract.update`, `client.update`, `consultant.update` — `old_values` / `new_values` hold only the changed fields plus a label (`contract_number` or `name`). Receipts: `contract_detail.update` (entity = the póliza; label `receipt_number` + `contract_number`). Deletes: `contract.delete`, `client.delete`, `consultant.delete`. Moves: `contract.reassign` (asesor), `contract.reassign_client` (cliente). Imports: `collection.import_sync`, `import.registry` (Mina de Oro / plantilla totals; `contract.update` / `client.update` with source `import` per changed row) — `old_values` = snapshot, `new_values.deleted_contracts` = pólizas removed with it |
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

Known RPC family (see `001_baseline_schema.sql` and `src/lib/db/dashboard.ts`): `get_office_totals`, `get_top_consultants_by_sales`, `get_office_totals_by_type`, `get_office_consultants_sales`.

Collections helper (see `002_collections_control.sql`):

- `seed_collection_payments_from_details(year_param)` — SECURITY INVOKER; upserts import-sourced month marks from `contract_detail.payment_date` for the year; never overwrites paid **manual** rows; prefills `contract.collection_day` when null.

Risk / reminders (see `011_commission_import_risk_evidence.sql`, `012_at_risk_days_30.sql`, `023_at_risk_from_last_payment.sql`):

- `payment_method_step_months(text)` — Mensual=1, Trimestral=3, Semestral=6, Anual=12.
- `next_collection_due(issue_date, last_paid, payment_method, collection_day)` (`029`) — next receipt from the calendar FECHA EMISION + forma de pago; the last payment covers the latest receipt due ≤ payment date + 15 days. Without `issue_date` falls back to `next_due_from_last_payment(last_paid, payment_method, collection_day)`. Mirrors `nextCollectionDue` in `src/lib/collections/next-due.ts`.
- `collection_receipt_due(issue_date, step_months, k)` — due date of receipt k (day clamped to month length).
- `contract_last_known_payment(contract_id)` — latest `contract_collection_payment.paid_at`, else latest `contract_detail.payment_date`.
- `list_contracts_at_risk(office_id, consultant_id, risk_days=30, lookback_months=12)` — SECURITY DEFINER + `caller_can_access_*`; next due from last known payment more than `risk_days` overdue (`lookback_months` unused, kept for API compat).
- `list_contracts_pending_payment(office_id, consultant_id, within_days=15)` — next due within horizon (or overdue ≤ 30 days); excludes at-risk.
- `get_collection_overview(office_id, consultant_id, risk_days=30, due_soon_days=15)` — SECURITY DEFINER + `caller_can_access_*`; returns JSONB for Vista general: active pólizas by bucket (`current`, `due_soon`, `overdue`, `at_risk`, `no_payment`) using the same next-due rule (so `at_risk` = the at-risk list and `overdue + due_soon` = the pending list), cobros de hoy / próximos 7 días, pólizas sin forma de pago, aging buckets, payments month-to-date vs the same elapsed days of last month, payment counts per month (this + last year, by `paid_at`, inactive pólizas included), per-asesor breakdown, and invite counts (office scope). Counts only.
- `list_contract_portfolio(office_id, consultant_id, client_id, search_text, status_filter, sort_column='next_due', sort_ascending=true, page_limit=25, page_offset=0, risk_days=30, due_soon_days=15)` — SECURITY DEFINER + `caller_can_access_*` (office or asesor required; `client_id` only narrows). JSONB `{ total, counts, summary, rows }` for the Pólizas list and the client / asesor expedientes. Each row carries `next_due`, `days_past_due` and `cartera_status` (same buckets as `get_collection_overview`, plus `inactive` for `status = 'INACTIVE'`). Search (≤100 chars) matches póliza, cliente or asesor; `status_filter` must be a bucket or NULL; `sort_column` is whitelisted (`contract_number`, `client_name`, `consultant_name`, `issue_date`, `next_due`, `payment_method`); page size clamped to 1–100. `counts` follow the search but not the status filter; `summary` (active, clients, consultants, current, due_soon, overdue, at_risk, no_payment, missing_payment_method, due_next_30_days, payments_last_30_days) covers the whole scope. (Signature since `031`; `030` had no `client_id`.)
- `contract_cartera_rows(office_id, consultant_id, risk_days, due_soon_days)` — internal (no EXECUTE for `authenticated`): one row per póliza in scope with `next_due`, `days_past_due`, `cartera_status`. Used by the list RPCs after they authorize.
- `list_client_portfolio(office_id, consultant_id, search_text, status_filter, sort_column='name', sort_ascending=true, page_limit, page_offset, risk_days, due_soon_days)` — SECURITY DEFINER + `caller_can_access_*`. Scope: asesor → clients of its pólizas; promotoría → `client.office_id` = office or any client with a póliza in the office. Rows: contact, `active_contracts`, `total_contracts`, earliest `next_due`, `consultant_names`, `cartera_status` = most critical bucket of its active pólizas (`none` without active pólizas) and its `days_past_due`. `status_filter`: `with_active`, `late`, `at_risk`, `no_active`. Sort: `name`, `next_due`, `active_contracts`, `birth_date`, `created_at`, `status`. `summary`: clients, with_active, late, at_risk, birthdays_this_month, missing_contact.
- `list_consultant_portfolio(office_id, search_text, status_filter, sort_column='name', sort_ascending=true, page_limit, page_offset, risk_days, due_soon_days)` — SECURITY DEFINER; promotoría only (`auth.uid() = office_id`). Per asesor: `active_contracts`, `clients`, bucket counts, `healthy_share` ((al corriente + por vencer) / with next due), `payments_last_30_days`. `status_filter` = consultant status. Sort: `name`, `consultant_code`, `created_at`, `active_contracts`, `healthy_share`, `late`. `counts` by status; `summary`: consultants, active, pending_invites, active_contracts, healthy_share, with_at_risk, at_risk_names (top 4).
- `list_collection_board(office_id, consultant_id, risk_days=30, due_soon_days=15)` — SECURITY DEFINER + `caller_can_access_*`. JSONB `{ today, payments_month_to_date, rows }`: every active póliza (from `contract_cartera_rows`) with `next_due`, `days_past_due`, `cartera_status`, client name / phone, asesor name / code, forma de pago, moneda, `issue_date`, `collection_day`, `last_paid_at` and `amount` (sum of primas of the latest FECHA PAGO). `payments_month_to_date` counts paid marks this month for every póliza in scope (same as `get_collection_overview`).
- `month_due_date(y, m, day)` — clamps day-of-month to calendar month length.

Prefer **extending RPCs** over client-side heavy aggregation. Any signature change ships as a **new migration** and an update to this doc.

---

## RLS summary

- RLS enabled on core tables (`office`, `consultant`, `client`, `contract`, `contract_detail`, `contract_collection_payment`, `audit_log`, `contract_change_request`, `token`, `file`, `commission_import`, `office_contact`, `office_insurer`, `office_line_of_business`) and on the read-only catalogs (`mx_state`, `insurer`, `line_of_business`: SELECT for `authenticated`).
- Onboarding tables: only the office itself (`office_id = auth.uid()`) can read or write its rows.
- Offices manage their own profile and their consultants’ data.
- Consultants read/update their own profile and own contracts.
- `commission_import`: office ALL; consultants SELECT same office.
- `contract_detail`: office SELECT / INSERT / UPDATE (`034`) through `contract.office_id`; consultants SELECT / INSERT / UPDATE for their own pólizas (`020`; editing receipts in the UI is promotoría only).
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
| Recibo | `contract_detail.receipt_number` |
| Remaining detail columns | `contract_detail` |

Dates in HTML are typically `DD/MM/YYYY` → store as `YYYY-MM-DD`.
