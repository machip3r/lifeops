<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Package manager

Use **pnpm** only (`pnpm install`, `pnpm add`, `pnpm run dev`, etc.). Do not use `npm` or `yarn` for this repo.

## Verification

Do **not** run `pnpm run build` (or `next build`) on every change unless the user asks for a production build check, or the task is specifically about build/deploy/CI failures. Prefer `pnpm run lint` or `pnpm run knip` when you need a quick check, or rely on the dev server and TypeScript feedback.

## Project

Insurance operations admin for offices (**promotoría**) and agents (**asesores**) — Next.js App Router, Supabase, Tailwind, shadcn. Product UI under `/dashboard`; auth at `/login`; invitations at `/invite/[token]`.

- **Roles:** `promotory` (office, row in `office` where `id` = `auth.users.id`) and `consultant` (row in `consultant`, optionally linked via `auth_user_id`).
- **Tenancy:** office-scoped. Promotory sees office-wide data; consultants see only their own contracts/clients/related rows.
- **Product / business docs:** [`README.md`](README.md) is the source of truth for LifeOps product behavior, roles, extractor rules, and roadmap. If a change alters **business rules**, **product behavior**, **roles**, or **general how LifeOps works**, update `README.md` in the **same change**. UI flow details live in [`docs/product-flows.md`](docs/product-flows.md); schema details in [`docs/database.md`](docs/database.md).

---

## Folder structure (must follow)

```
src/
  app/                    # Next.js App Router
    dashboard/            # authenticated product
    login/                # auth
    invite/[token]/       # consultant invitation acceptance
    api/                  # route handlers (webhooks, privileged HTTP, OCR, invites)
  components/
    ui/                   # shadcn / design-system primitives
    …                     # shared app components (ProtectedRoute, toast, …)
  contexts/               # React contexts (auth)
  lib/
    supabase/             # preferred: clients, admin, env helpers
    validation/           # Zod schemas, field-error mapping
    db.ts                 # data access (legacy-heavy; prefer server boundary for privileged ops)
    utils.ts
  types/                  # shared domain types / DTOs (prefer over growing supabase.ts)
supabase/migrations/      # SQL only — schema / RPC / RLS changes go here
docs/
  database.md             # English schema reference (keep in sync)
  product-flows.md        # UX / role flows
```

- Route UI lives under `src/app/…`. Shared logic in `src/lib/`. Shared UI in `src/components/`.
- Do **not** invent parallel trees (`helpers/` at root, duplicate `ui/` outside `components/ui`) without an explicit request.
- Prefer colocating **Server Actions** next to the route that owns them (`…/actions.ts`) for new mutations.
- Canonical dashboard paths (English only): `/dashboard`, `/dashboard/extractor`, `/dashboard/contracts`, `/dashboard/collections`, `/dashboard/clients`, `/dashboard/consultants`, `/dashboard/change-requests`, `/dashboard/projection`, `/dashboard/profile`.
- Legacy Spanish/alias paths redirect permanently (`/dashboard/cotizacion`, `/dashboard/proyeccion` → `projection`; `/dashboard/policies` → `contracts`). Do not add new Spanish route segments.

---

## Database migrations

- Every schema / RPC / RLS change is a **new file** under `supabase/migrations/` (e.g. `002_…sql`, `003_…sql`).
- **Never** edit an already-created migration that may have been applied — append a new migration instead.
- Keep migrations SQL-only; name them descriptively after the change.
- Baseline: `supabase/migrations/schema.sql` (initial full schema). New work appends numbered files after that.
- **Keep [`docs/database.md`](docs/database.md) in sync** with every migration and any other database change (tables, columns, constraints, RPCs, triggers, RLS policies, enums). Update that English doc in the **same change** as the SQL — do not leave schema docs stale.
- Prefer pushing aggregations and filters into SQL RPCs (reuse the dashboard filter contract: date basis, range, seniority, ramo, payment method, consultants) instead of heavy client-side aggregation.
- **Always verify the target Supabase project before pushing or applying migrations** (`supabase db push`, `supabase migration up`, linked remote SQL, Dashboard SQL against a remote, etc.).
  - Run `supabase projects list` and/or `supabase status` / inspect `.supabase` link + `project_id` in `supabase/config.toml` (or the linked ref the CLI reports).
  - Confirm the project **ref / name / URL** matches the environment the user intends (dev vs staging vs prod) and matches `NEXT_PUBLIC_SUPABASE_URL` in the local `.env` when applying to the app’s current backend.
  - If the linked project is ambiguous or unexpected, **stop and ask the user** before pushing. Never assume the default linked project is correct.

---

## Reuse components (no one-off duplicates)

- **Never** recreate inputs, buttons, form shells, labels, error text, empty states, or similar if a shared component exists — **reuse or extend** it.
- Prefer **one smart shared control** per concern (e.g. one `Input`, one `Button`, one `FormField`) used across auth and app.
- If a pattern is copied a second time, **extract** to `src/components/` (or `src/components/ui/`) before shipping the duplicate.
- Use `ToastProvider` + `useToast` for user-facing success/error feedback — **never** `alert()` in new code.
- Product UI is dark with golden accent (`#FBDBAC`) and gradient titles via `dashboard-page-title` — follow existing dashboard chrome; do not invent a second visual system per page.

---

## Language: English code, Spanish UI content

- **Routes, files, folders, symbols, types, variables, comments, SQL identifiers, env keys, API paths, and AGENTS/rules text for engineering conventions are English.**
- **User-visible product copy may be Spanish** (labels, buttons, placeholders, toasts, empty states, `aria-label`s, validation messages shown in the UI).
- Do **not** invent Spanish route segments (`/cotizacion`, `/proyeccion`, …) or Spanish identifier names (`poliza`, `asesor`, `cliente` as variable names). Map Spanish **data** from external HTML headers into English domain names (`contractNumber`, `consultantCode`, `clientName`).
- Server-returned messages shown to users may be Spanish; never leak raw DB/Auth stack traces.
- Full i18n dictionaries (`es`/`en`) are not required today; if adding locales later, every key ships for **all** locales in the same change.

---

## Validation, schemas / DTOs, sanitization

- **Validate all inputs** at the server boundary (Server Actions / Route Handlers) before DB or Auth calls. Client checks are UX only — not security.
- Prefer **Zod schemas** in `src/lib/validation/` — do not trust raw `FormData` / JSON shapes.
- Treat domain shapes in `src/lib/supabase.ts` / `src/types/` as the contract; keep action payloads aligned with those DTOs.
- **Every user-editable field** must have a **Zod rule** with **length limits** and an **allowed-character pattern (regex)** — reject unexpected / control characters early so they never reach Auth, DB, cookies, or mailto/URLs.
  - Examples: email → lowercase + email regex + max 254; names → letters/spaces/safe punctuation + max length; passwords → min/max + no control characters; OTP → digits with fixed length; contract/poliza numbers → bounded alphanumeric + safe punctuation.
  - Prefer reusing helpers from `src/lib/validation/schemas.ts` (`emailSchema`, `personNameSchema`, `entityNameSchema`, etc.) instead of ad-hoc `z.string()`.
  - Mirror limits on the client with `maxLength` / `pattern` / `inputMode` / `autoCapitalize` where it improves UX — server schema remains authoritative.
- **Show validation errors to the user** — never fail silently or with only a generic banner when a specific field is wrong.
  - Map Zod issues to per-field messages via `src/lib/validation/field-errors.ts` (`zodFieldErrors`) and Spanish `VALIDATION_MESSAGES` in that module (or shared copy helpers).
  - Return `{ fieldErrors?: Record<string, string>; error?: string }` from actions/handlers; render each message under the matching control with `FormField`’s `error` prop (`aria-invalid` / `role="alert"`).
  - Form-level `error` is for auth/server failures (wrong password, network, forbidden) — not a substitute for field errors.
- **Sanitize / escape outputs**: rely on React text escaping; never inject unsanitized user HTML (`dangerouslySetInnerHTML`) with client/consultant-provided content. Encode when embedding user data in URLs or emails.
- Trim strings; reject empty required fields; constrain lengths and enums (`ACTIVE`/`INACTIVE`/`PENDING`, `CHANGE`/`CORRECT`, payment methods, etc.).

---

## Backend: Server Actions, APIs, errors

- **Direction of travel:** new mutations and privileged reads via **Next.js Server Actions** or Route Handlers using a **server-only** Supabase client. Do not expand client-side service-role usage.
- **Today:** most reads/writes still go through `src/lib/db.ts` (anon + RLS) from client components. Privileged Auth/admin work is on `/api/**` with Bearer auth — do not reintroduce service-role usage on the client.
- **Route Handlers** (`src/app/api/**/route.ts`): use for invites (Resend), OCR, cleanup, webhooks, or public HTTP — follow **REST** (correct methods, status codes, JSON error body). Do not add GraphQL unless explicitly requested.
- **Service role** (`src/lib/supabase/admin.ts`): **server only** via env `SUPABASE_SERVICE_ROLE_KEY`. Never put it in `NEXT_PUBLIC_*` or in `next.config.ts` `env` (that inlines into the client). Never import `supabaseAdmin` in client components.
- Privileged Route Handlers must call `requireOfficeContext` (`Authorization: Bearer <access_token>`; client helper `authFetch`) then authorize tenancy before using `supabaseAdmin` / `db-admin`.
- Client data access uses RLS-scoped `supabase` from `src/lib/supabase.ts` + `src/lib/db.ts`. Admin Auth / cross-tenant work goes through `/api/**` (extractor create/missing consultants, consultant email update, office cleanup, invites).
- **Errors**: handle consistently — map failures to safe user-facing messages (Spanish UI copy is fine); return `{ error: string }` (or a shared result type); do not leak raw DB/Auth stack traces. Log server-side detail when useful; show safe copy to users.
- After successful mutations: `revalidatePath` / `redirect` as appropriate when using Server Actions; keep success and failure paths explicit (no silent `catch`).

---

## UI: design system, responsive, a11y

- Use shared design tokens / CSS variables in `src/app/globals.css` and existing Tailwind / shadcn patterns — no one-off color systems per page.
- **Responsive** by default (mobile → desktop); auth and dashboard layouts must work on small screens.
- **Accessibility basics**: label every input (`htmlFor` / `FormField`), meaningful button text, `aria-label` for icon-only controls, visible focus, sufficient contrast, do not rely on color alone for errors.
- Prefer semantic HTML (`button`, `label`, `nav`, headings in order).
- **Disable submit buttons** until required form fields are filled (client-side). Do not leave primary submit actions enabled on empty required forms (auth, invites, and app forms).

---

## Auth, tenancy, security

- Respect RLS and office scoping; never query “all offices” from user-scoped clients.
- Check session / role via `useAuth` / `ProtectedRoute` (and server session checks for actions) before privileged UI or mutations.
- Secrets only in server env (`SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, etc.); public keys only via `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Do not put default production passwords or personal test emails in new user-facing flows; treat extractor test defaults as non-production.
