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
    supabase/             # clients, admin, env helpers (low-level only)
    auth/                 # Auth adapters: client.ts, admin.ts, token.ts, api.ts (Bearer)
    storage/              # Storage adapters: admin.ts (documents bucket, server only)
    validation/           # Zod schemas, field-error mapping
    db.ts                 # RLS-scoped table access (output adapter)
    db-admin.ts           # privileged table access (output adapter; wraps Auth/Storage when needed)
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
- Baseline: `supabase/migrations/001_baseline_schema.sql` (initial full schema; must be numbered so `supabase db push` / reset apply it). New work appends `002_…`, `003_…`, etc.
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

### Spanish product copy — human, few anglicisms

When writing **user-visible Spanish** (UI, toasts, empty states, validation, emails, product docs aimed at the office):

- Prefer **natural Mexican Spanish** people would say in a promotoría — short, direct, warm when it helps, never stiff “translated from English”.
- Prefer clear Spanish words over unnecessary anglicisms when the Spanish term is common in the product: `correo` (not “email” in UI), `iniciar sesión` / `cerrar sesión` (not “login/logout”), `enlace` (not “link”), `archivo` / `documento` (not “file” in copy), `contraseña` (not “password”), `cargar` / `subir` according to context. Keep industry-standard terms: **póliza**, **asesor**, **cobranza**, **promotoría**, PDF, Excel.
- Avoid Spanglish and calques (`loguearse`, “has sido tagged”, “upload falló”, “session expirada” as UI copy). Code, routes, and identifiers stay English; only the words the user reads need this care.
- Prefer verbs and outcomes over jargon: “No se pudo subir el documento” over “Error de upload”; “Revisa el correo e intenta de nuevo” over “Retry auth flow”.

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

### File uploads (especially images)

User-uploaded files (payment evidence, document attachments, etc.) must be treated as untrusted:

- **Validate** MIME type + size limits on the server (`documentMimeTypeSchema`, `LIMITS.documentFileBytes`); never trust the client `Content-Type` alone — check magic bytes / decode result.
- **Images must be processed and normalized** before Storage: decode with a real image decoder, strip EXIF/metadata, resize to a sane max dimension, and re-encode (e.g. JPEG/WebP/PNG) so polyglot or oversized originals are not stored as-is.
- Reject files that fail decode, exceed post-process size caps, or are not in the allowed formats after re-encode.
- Prefer a shared helper under `src/lib/documents/` (called from the upload route / storage adapter) over ad-hoc processing in each route.
- PDFs and other non-image docs: keep strict size + MIME allowlists; do not execute or render unsandboxed content server-side.

---

## Backend: Server Actions, APIs, errors

- **Direction of travel:** new mutations and privileged reads via **Next.js Server Actions** or Route Handlers using a **server-only** Supabase client. Do not expand client-side service-role usage.
- **Today:** most reads/writes still go through `src/lib/db.ts` (anon + RLS) from client components. Privileged Auth/admin work is on `/api/**` with Bearer auth — do not reintroduce service-role usage on the client.
- **Route Handlers** (`src/app/api/**/route.ts`): use for invites (Resend), OCR, cleanup, webhooks, or public HTTP — follow **REST** (correct methods, status codes, JSON error body). Do not add GraphQL unless explicitly requested.
- **Service role** (`src/lib/supabase/admin.ts`): **server only** via env `SUPABASE_SERVICE_ROLE_KEY`. Never put it in `NEXT_PUBLIC_*` or in `next.config.ts` `env` (that inlines into the client). Never import `supabaseAdmin` in client components.
- Privileged Route Handlers must call `requireOfficeContext` (`Authorization: Bearer <access_token>`; client helper `authFetch`) then authorize tenancy before using `db-admin` / Auth Admin / Storage Admin.
- Client data access uses RLS-scoped `supabase` from `src/lib/supabase.ts` + `src/lib/db.ts`. Admin Auth / cross-tenant work goes through `/api/**` (extractor create/missing consultants, consultant email update, office cleanup, invites).
- **Errors**: handle consistently — map failures to safe user-facing messages (Spanish UI copy is fine); return `{ error: string }` (or a shared result type); do not leak raw DB/Auth stack traces. Log server-side detail when useful; show safe copy to users.
- After successful mutations: `revalidatePath` / `redirect` as appropriate when using Server Actions; keep success and failure paths explicit (no silent `catch`).

### Auth / Storage / DB adapters (concentrate I/O)

Hexagonal light: pages and route handlers are **input**; persistence lives in adapters.

- **Browser Auth** — only via `src/lib/auth/client.ts` (`getSession`, `signInWithPassword`, `signUp`, `verifyOtp`, `resendOtp`, `signOut`, `onAuthStateChange`). Do **not** call `supabase.auth.*` from pages, contexts, or components.
- **JWT on the server** — validate Bearer tokens via `src/lib/auth/token.ts` (`getUserFromAccessToken`); `requireOfficeContext` in `src/lib/auth/api.ts` stays the HTTP boundary.
- **Auth Admin** (create/update/delete/list users) — only via `src/lib/auth/admin.ts`. Do **not** call `supabaseAdmin.auth.admin.*` from route handlers; `db-admin` may wrap these helpers for multi-step flows.
- **Storage** (documents bucket upload / signed URL / remove) — only via `src/lib/storage/admin.ts`. Do **not** call `supabaseAdmin.storage.*` from routes.
- **Tables** — prefer `src/lib/db.ts` (RLS) and `src/lib/db-admin.ts` (service role). New privileged queries/mutations belong in `db-admin`, not inline `.from()` in routes when the same concern already has (or should have) an adapter.

---

## UI: design system, responsive, a11y

- Use shared design tokens / CSS variables in `src/app/globals.css` and existing Tailwind / shadcn patterns — no one-off color systems per page.
- Write CSS-variable utilities with the Tailwind v4 shorthand: `text-(--lifeops-muted)`, `bg-(--lifeops-page)`, `border-(--lifeops-border)`, `divide-(--lifeops-border)`. Keep opacity on that form (`bg-(--lifeops-hover)/50`, `bg-(--lifeops-chrome)/95`). Leave real CSS `var(--token)` calls in stylesheets as-is.
- Primary CTAs use shared `Button` with `variant="brand"` (golden accent `#FBDBAC`); avoid ad-hoc `bg-blue-600` / one-off button styles on dashboard pages.
- **Responsive** by default (mobile → desktop); auth and dashboard layouts must work on small screens.
- **Accessibility basics**: label every input (`htmlFor` / `FormField`), meaningful button text, `aria-label` for icon-only controls, visible focus, sufficient contrast, do not rely on color alone for errors.
- Prefer semantic HTML (`button`, `label`, `nav`, headings in order).
- **Disable submit buttons** until required form fields are filled (client-side). Do not leave primary submit actions enabled on empty required forms (auth, invites, and app forms).

### React effects

`react-hooks/set-state-in-effect` is an error. Do not call `setState` (or a function that calls it) directly in a `useEffect` / `useLayoutEffect` body.

- **Reset when a key changes during render.** Store the previous key and update state in that same render (`useResetPage` for table pages). Do not `setPage(1)`, close a drawer, or copy props into state from an effect.
- **Fetch with `useQueryEffect`.** The effect only starts the request. Update state after `await`. Do not call `setLoading(true)` before that await — when a refetch should show a spinner, `useQueryLoading` turns loading on during render as the query key changes.
- **External stores** (`localStorage`, theme) use `useSyncExternalStore`. An effect may write the DOM or subscribe. `setState` belongs in the subscription, timer, or promise callback — not in the effect body itself.

---

## Auth, tenancy, security

- Respect RLS and office scoping; never query “all offices” from user-scoped clients.
- Check session / role via `useAuth` / `ProtectedRoute` (and server session checks for actions) before privileged UI or mutations.
- Secrets only in server env (`SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, etc.); public keys only via `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Do not put default production passwords or personal test emails in new user-facing flows; treat extractor test defaults as non-production.
