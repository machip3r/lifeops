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

### Login (`/login`)

1. Existing users sign in with correo + contraseña. Promotorías register only through a one-time link created by the configured operator in Perfil; asesores accept invitations at `/invite/[token]`.
2. Optional email verification OTP when required.
3. Promotorías without onboarding go to `/onboarding`; everyone else to `/dashboard`.

### Public landing (`/`)

- Explains LifeOps to prospective promotorías and shows clearly labeled illustrative cobranza data.
- **Agendar demo** opens the configured WhatsApp and/or email contact channel with a prefilled request. These destinations use `NEXT_PUBLIC_SUPPORT_WHATSAPP` and `NEXT_PUBLIC_SUPPORT_EMAIL`.
- **Iniciar sesión** opens `/login`. Account access is by invitation; the public page does not create accounts.

### Promotoría registration (`/register?token=…`)

- Only the account configured in `PROMOTORY_INVITE_GENERATOR_EMAIL` sees the link generator in Perfil. Each generated link is valid for seven days and can be used once.
- The registration page checks token type, status, and expiry. The server rechecks the token when creating the Auth account and atomically marks it used; if a concurrent request already used it, the losing account creation is rolled back. The new user then signs in and continues at `/onboarding`.
- Keep Supabase Auth public signup disabled. The generator uses `APP_BASE_URL` or the existing `NEXT_PUBLIC_APP_URL` setting to construct absolute links.

### Onboarding (`/onboarding`) — promotoría

Registro → onboarding → dashboard. Applies to new promotorías **and** existing ones that never completed it (`office.onboarding_completed_at` is null); the dashboard layout redirects them here. Completed promotorías and asesores are redirected away.

1. **Tu promotoría:** nombre (required), estado (required), clave de promotoría (optional).
2. **¿Quién eres?:** nombre completo, rol (Dueño(a) / Director(a) / Gerente de operaciones / Asistente o administrativo / Otro), teléfono o WhatsApp (10 dígitos). If the rol is not Dueño(a): nombre y teléfono del dueño(a).
3. **Tu operación:** aseguradoras (multiple; "Otra" asks the name), ramos (multiple), número de asesores (range), pólizas activas (range), ¿qué quieres resolver primero? (optional).

- Each step is saved on **Siguiente**, so closing the browser resumes at the next step. **Atrás** keeps answers.
- **Terminar registro** marks the onboarding complete and opens the dashboard. With **Seguros Monterrey** among the aseguradoras, an optional 4th step **Carga tu cartera** shows the Mina de Oro and plantilla options (same review / import as Importar); **Omitir por ahora** or **Ir a LifeOps** after importing enters the dashboard.
- **Aseguradora no soportada:** only Seguros Monterrey New York Life is supported today. If the selection does not include it, step 3 (and Perfil) shows a warning: "Por ahora LifeOps solo funciona con Seguros Monterrey" with WhatsApp / correo links to support (prefilled message with the aseguradoras chosen). After **Terminar registro** a dialog repeats it; **Entendido, ir a LifeOps** opens the dashboard. With Monterrey selected (alone or with others) nothing is shown.
- Submit stays disabled until the step's required fields are filled; server validation shows per-field errors.

### Perfil (`/dashboard/profile`)

- Read-only first: data is shown as label / value rows and tags; each card has **Editar**, which opens that section in a dialog (Cancelar / Guardar cambios). Nothing is a disabled input.
- **Promotoría:** identity card (avatar, name, estado, registro completo / pendiente, clave, account correo, fecha de alta) with **Zona de peligro** under it; on the right **Tu promotoría** (nombre, estado, clave), **Contacto** (who uses LifeOps + dueño(a)) and **Tu operación** (aseguradoras and ramos as tags, rangos, objetivo). The **clave de promotoría** is locked once captured and onboarding is complete (support changes it). The account correo is read-only.
- The configured invite generator account also sees **Invitar promotoría**, which creates and copies a single-use registration link that expires after seven days.
- **Asesor:** identity card (avatar, name, promotoría, clave) and **Tus datos**; only the name is editable (Server Action `updateOwnNameAction`, `audit_log` `consultant.update`). Correo and clave are managed by the promotoría.

### Invite consultant (promotory)

1. Promotory requests invite (API + Resend). The correo cannot be the promotoría's, nor one already registered. A clave already used in the office is rejected; if that asesor is deactivated, the message says to activate them from Asesores or pick another clave.
2. Token stored in `token`.
3. Consultant opens `/invite/[token]`, completes account.
4. Consultant linked (`auth_user_id` / status → `ACTIVE`).
5. Until an invite is sent, the asesor stays `NOT_INVITED`. After the correo goes out, status is `PENDING`, then `ACTIVE` once they accept.

### Upload commissions (`/dashboard/extractor`) — promotory and consultant

1. Step 1 offers three sources (promotoría sees all; asesores only the first): **archivo de comisiones en formato HTML** (HTML/MHTML) — o — **Mina de Oro** (Seguros Monterrey cartera report, `.xlsx` / `.csv`) — o — **plantilla de LifeOps** (download Excel or CSV, fill one póliza per row, upload it). Mina de Oro and plantilla follow the *registry import* below; HTML follows these steps.
2. Preview combined rows; validate consultants by `consultant_code` (asesor). Client names are trimmed and uppercased (accents dropped, Ñ → N). A name close to an existing office client (similarity at least 0.86) is treated as that client. On the date and summary steps, click the name to edit it before import.
3. **Asesor:** only rows matching their own `consultant_code` are kept; other codes are skipped (and rejected again on the server). They never auto-create other asesores.
4. Before import, user must enter **fecha de emisión del archivo**. Only **new pólizas whose file rows have no FECHA EMISION** are listed to capture it (it anchors the receipt calendar). No "último pago" is asked: next dues are computed from FECHA EMISION + forma de pago.
5. **Promotoría only:** missing consultants on import — default auto-create (`<asesorCode>.<officeTag>@lifeops.com`) via privileged Auth API; if `NEXT_PUBLIC_IMPORT_MANUAL_CONSULTANT_CREDENTIALS=true`, a dialog lists the new codes with a generated correo. One action invites the checked rows (**Invitar e importar**) or, with none checked, only registers them (**Importar**). Clearing a correo and leaving it empty assigns another generated one. Submit rejects a correo that is repeated, already registered, or the same as the promotoría. Same asesor code may exist in another office.
6. **Step 2 review (re-imports):** next to the dates, the file is compared with LifeOps (`previewCommissionChangesAction`, same batches as the import). Empty LifeOps data (forma de pago, moneda, emisión) is filled automatically; **differences** — asesor, contratante, forma de pago, moneda and receipts already saved (same RECIBO) with other values — are listed in «Datos distintos a LifeOps». **Default: keep LifeOps**; the user checks what to update (per field / per póliza / «Usar el archivo en todo»). New receipts are always added. A póliza that belongs to another asesor of the office is no longer rejected: its receipts go to it and the asesor only changes if picked.
7. The import runs on the server in batches of ~50 pólizas coordinated by the page (progress bar per batch; no total time limit; failed batches are retried and re-importing never duplicates). It creates a `commission_import` batch; writes `contract_detail` **one per receipt (póliza + RECIBO)** — a saved receipt with different values is kept unless picked in the review. Picked contract changes are audited (`contract.update`, source import). Seeds cobranza marks from payment dates in the file.
8. Once files are loaded, or while dates, the summary, or the save are in progress, leaving for another section, signing out, or closing/refreshing the tab asks for confirmation. While the files are read, compared or saved, a full-screen progress card (spinner, bar, counts, time left) covers the app: nothing can be clicked, back / links are cancelled and closing the tab warns, until it finishes. A half-typed date (`12/21`) stays in the field if the user switches browser tab or window.

### Registry import — Mina de Oro / plantilla (`/dashboard/extractor`, promotoría)

**Linking by póliza number (every import):** the número de póliza is normalized the same way everywhere (`normalizeContractNumber`: no spaces or commas, uppercase), so a póliza registered by hand, from a commission file, the Mina de Oro or the plantilla is the same póliza whatever the format in the file («vi-0001 234» = «VI-0001234»). An import finds it and updates it (empty data filled, differences only when picked, receipts added); it never creates it again. Covered by `pnpm test` (`src/lib/extractor/link-by-contract-number.test.ts`).

Same 3-step tiles as commissions (**Archivo → Revisión → Resultado**), also in the onboarding step **Carga tu cartera**.

1. **Read** (browser): `.xlsx` or `.csv` (`,` or `;`). Mina de Oro is detected by its «Número de la Póliza» header (title + report date above it); the plantilla by its own headers (accents / case ignored, the example row is skipped). Rows are normalized (dates DD-MM-YYYY / Excel dates, forma de pago, ramo from «Tipo de seguro» or the VI/GM prefix, currency inferred from the «convertido» factor: 1 → pesos, ~5–13 or plan with UDI → UDI, ~13–30 → dólares) and validated with the server schema; bad rows are listed and skipped. While it runs, a progress card lists the stages (leer el archivo → revisar cada fila → comparar con LifeOps, with «x de y pólizas»); **Cancelar** goes back to choosing a file (nothing is saved yet).
2. **Review** (`previewRegistryImportAction`, batches of 200): counters (nuevas · datos por completar · con diferencias · sin cambios / con error), asesores that will be created **sin invitar**, and «Datos distintos a LifeOps» (same review list as commissions; **default keep LifeOps**). Empty LifeOps fields are filled automatically. Mina de Oro only: when its «No. Promotoría» differs from the clave de promotoría in Perfil (ignoring prefixes / leading zeros), a warning shows and **Importar** asks to confirm («Son números de promotoría distintos»); without a clave in Perfil it only shows the file's number. Empty fields that fill on their own are listed in a collapsible «Se completarán datos vacíos». A sticky bar keeps **Atrás** / **Importar** and the totals (nuevas · por completar · datos cambiados) in view.
3. **Import** (`applyRegistryImportAction`, batches of 100, 3 attempts): creates missing asesores (`NOT_INVITED`), clients by contratante name, new pólizas (estatus from the file, see below; only en vigor enters cobranza), fills and picked changes (`contract.update` / `client.update`, source import) and one `import.registry` audit entry. While it saves, the full-screen progress card blocks the app (no clicks, back / links cancelled, closing the tab warns) and shows pólizas done, nuevas / actualizadas so far and time left. The **Estatus** column maps to the póliza status: «En Vigor» / «Vigente» → en vigor, «… Prorrogado» → en vigor prorrogado, «… Sin Pago de Primas» → en vigor sin pago de primas, «Anulada» (or anything else written) → anulada; only en vigor enters cobranza. A different estatus than LifeOps is a difference to pick in the review. Every póliza **en vigor** in the file gets the file date (Mina de Oro cut-off; plantilla: import day) as its insurer «en vigor» date when newer than LifeOps' — the review and the result say how many «quedan al día según la aseguradora», and that alone enables **Importar** (re-uploading a newer Mina de Oro refreshes it). Result screen (all steps checked): headline (cargada / con pendientes / ninguna importada), tiles nuevas / actualizadas / sin cambios / no importadas, asesores created «Sin invitar» (**Ver asesores**), rows not imported and warnings. When the Mina de Oro cut-off (report date above the header) is before today, the result recommends (optional) uploading the commission files from the day after the cut-off to today, with **Subir archivos de comisiones** (Importar step 1 with only the commission source and a notice «sube los archivos de comisiones del <día siguiente al corte> a hoy» — **Ver otras opciones** brings back Mina de Oro / plantilla; from onboarding it enters LifeOps on that same step via `?commissionsFrom=YYYY-MM-DD`).
- Stored from the Mina de Oro: póliza, contratante, asesor (clave + nombre), emisión, forma de pago, conducto de cobro (método de pago), plan, ramo, clasificación del plan, asegurado principal, estatus, prima anual / suma asegurada (original and **en pesos**), deducible en pesos, fin de vigencia, and client correo, teléfono, nacimiento, estado civil. Not stored: promotoría number / name, próximo cumpleaños and días para vencimiento (derived).

### Pólizas (`/dashboard/contracts`)

- Counters on top: pólizas activas (clientes / asesores), cobros en 30 días, en peligro, sin fecha de cobro.
- List card: `ListSearchFilters` (póliza, cliente or asesor) + **Registrar póliza**, then two chip rows with counts:
  - **Estatus de la póliza** (insurer status): **En vigor** (default — every póliza in cobranza, late or not), Anuladas, Prorrogadas, Sin pago de primas, Todas. Same filter in the client and asesor expedientes.
  - **Cobranza** (only with En vigor / Todas): Todas, En peligro, Vencida, Por vencer, Al corriente, Sin fecha de cobro (+ «Fuera de cobranza» with Todas) — same states and colors as Cobranza and Vista general. With another estatus the row is replaced by what it means (no cobranza).
  - The Estado column shows the cartera status for pólizas en vigor and the insurer status (Anulada, En vigor prorrogado, En vigor sin pago de primas) for the rest. Counters cover pólizas en vigor.
- Columns: Póliza, Cliente, Asesor (promotory), Forma de pago, Moneda, Emisión, Próximo cobro (receipt calendar), Estado (`CarteraStatusBadge`, with days late). Default order: próximo cobro, most urgent first. Row click opens the expediente.
- One RPC, `list_contract_portfolio`, returns the page, chip counts and counters (search, status, sort and pagination run in SQL). The table is the shared `ContractPortfolioPanel` (also used in the client and asesor expedientes).
- **Registrar póliza** (dialog, three sections): **Cliente** first (Existente / Nuevo toggle; new = nombre, nacimiento, CURP, RFC), **Póliza** (número, asesor — auto for consultant, searchable list + «Créalo» link for promotory —, proyecto), **Cobranza** (fecha de emisión + forma de pago, which build the receipt calendar; día de cobro optional on its own row). No «último pago»: like the import, payments come from cobranza / commission files, so an older póliza shows its receipts pending until payments are registered. Long lists (cliente existente, asesor, proyecto, Reasignar) use the searchable `Combobox`. Same section layout and sticky Cancelar / Guardar footer in the edit dialogs (póliza, cliente, asesor).
  - **Póliza** also asks **Clasificación** (optional: Tradicional / Flexible for vida, GMM, AP — stored as the Mina de Oro writes it) and **Cobranza** asks **Moneda** (required: UDI / pesos / dólares — the currency of its payments) and **Conducto de cobro** (optional select: Agente, Cargo automático a tarjeta de crédito, Tarjeta de débito (TDD), Modo directo, Descuento por nómina, Póliza gratuita — Mina de Oro values). **Editar** changes the same fields; a stored value outside the catalog stays selectable.
- **Editar** (pencil in each row of Pólizas, Clientes and Asesores, and in every expediente) opens the full edit dialog:
  - Póliza: número, estado (activa / en trámite / inactiva), fecha de emisión, forma de pago, día de cobro, moneda, prima anual, suma asegurada, proyecto. Asesor changes stay in **Reasignar**. Server Action `updateContractAction`.
  - Cliente: nombre, nacimiento, CURP, RFC, teléfono, correo. Server Action `updateClientAction`.
  - Asesor (promotory): nombre, correo (also updates its LifeOps access and pending invitations), clave (empty keeps the current one). `/api/consultants/update`. When the correo changes and the asesor has no access yet (sin invitar / pendiente), the button becomes **Guardar e invitar** and the invitation is sent after saving.
  - Every save is validated with Zod on the server and writes `audit_log` with only the changed fields; the expedientes show it in **Historial** («Cambió: forma de pago, día de cobro»).
- **Invitar / Reenviar invitación** (asesor expediente) asks first: the asesor gets an email with a link to create their password and sign in (sees only their own pólizas, clientes and cobranza; link valid 7 days; resending invalidates the previous link). Imported asesores with the internal placeholder correo must get a real correo first.
- **Crear asesor** (Asesores, and «¿No está en la lista? Créalo» in Registrar póliza): clave + nombre in one row, then correo and **Enviar invitación por correo** (checked by default). Checked → account + invitation (`PENDING`); unchecked → created as `NOT_INVITED` (with correo: real account; without: same placeholder account as the import) and can be invited later from its expediente.
- **Reasignar** (promotoría, póliza expediente): toggle **Asesor / Cliente**. Cliente moves the póliza to another client of the office (duplicate clients), audited as `contract.reassign_client`; when the old client is left without pólizas the toast suggests deleting it from its expediente.
- **Busy dialogs:** while a dialog saves or deletes (Guardar, Eliminar, Borrar todos los datos, invitar…), its X turns into a spinner, the backdrop, Escape and Tab do nothing, its fields are locked, and back / links are cancelled and closing the tab warns, until the request finishes.
- **Eliminar** (only in each expediente header, not in list rows) always asks first in a confirm dialog that says what goes with it:
  - Póliza: only the póliza, with its recibos, cobranza payments and documents (`deleteContractAction`). Cliente and asesor stay.
  - Cliente: also its pólizas in the office (count shown) (`deleteClientAction`). An asesor can only delete a client whose pólizas are all its own.
  - Asesor (promotory): also all its pólizas and its LifeOps access; its clients stay (`/api/consultants/delete` with `forceDelete` + `withContracts`).
  - Documents are removed from Storage; `audit_log` keeps `contract.delete` / `client.delete` / `consultant.delete` with a snapshot and the number of pólizas deleted.
- The full multi-step **registrar emisión** wizard remains parked (`src/parked/dashboard/contracts/new`).
- Files under contract folder routes.

### Expediente de póliza (`/dashboard/contracts/[id]`)

- Full page (no drawer). Header: póliza number, cliente · asesor, actions **Editar**, **Reasignar** (promotory), **Documentos**.
- **Rehabilitar** (header, only for an **anulada** póliza): confirm dialog; the póliza goes back to **en vigor** with today as its insurer «en vigor» date, so receipts due up to today count as paid and cobranza starts with the next one. Audited as `contract.update`.
- **Estatus** row in «Datos de la póliza»; **Editar** can set any of the four estatus (en vigor, en vigor prorrogado, en vigor sin pago de primas, anulada) with a hint of what it means.
- Counters: Estado (same buckets as the list; the insurer status when not en vigor — no receipts to collect), Próximo cobro (relative + receipt n/N), Último pago (source), Recibos pagados (of receipts due to date).
- **Calendario de recibos** (unpaid receipts up to the insurer «en vigor» date show **Al día según aseguradora**; «Datos de la póliza» shows that date): receipts from FECHA EMISION + forma de pago (`receiptCalendar`, same rule as `nextCollectionDue`). Each payment (cobranza marks + FECHA PAGO lines) sits on the receipt it covers; states Pagado, Sin registro (covered by a later payment), cartera status for the next / late ones, Programado for future ones. Shows the recent ones; "Ver desde la emisión" expands. **Registrar pago** opens the cobranza payment dialog. Without issue date it lists the payments and asks to add the date.
- **Evidencias de pago**: comprobantes uploaded when registering cobranza payments (recibo month, payment date, upload date, size) plus other documents of the póliza; **Ver** opens the in-app document viewer (`DocumentViewerDialog`: images and PDFs shown in the dialog, other files offer **Descargar**; the file is fetched through its short-lived signed link, no new tab). Paid receipts in the calendar show **Ver evidencia** when they have one.
- **Datos de la póliza** (label / value rows) and **Historial** from `audit_log` (alta, reasignación, pagos registrados / quitados, estatus de cobranza).
- **Recibos del archivo de comisiones**: paged commission lines (RECIBO, fecha pago, primas, comisión) in the póliza currency. Promotoría: the pencil on each line opens **Editar recibo** (recibo, fecha de pago / emisión, forma de pago, primas, comisión — may be negative —, % comisión, antigüedad, movimiento; `updateContractDetailAction`, `contract_detail.update` in the póliza history). A new fecha de pago / prima cobro moves the cobranza import mark (manual marks stay); a later re-import of the same RECIBO still goes through the review.

### Cobranza (`/dashboard/collections`)

- **En vigor = al día hasta la fecha de la aseguradora.** When the insurer reports a póliza **en vigor** (Mina de Oro cut-off, plantilla import day, or **Rehabilitar**), its receipts due up to that date count as paid even without payments in LifeOps; the next due is the following receipt. Same rule in Cobranza, Vista general charts, priority lists, Pólizas / Clientes / Asesores and the expediente. Payments registered later still move it forward.

- How due dates are calculated (last payment wins over old commission files): see [`collection-due-dates.md`](collection-due-dates.md).
- Registrar pago uses a drop zone for the evidence (drag & drop or click, image thumbnail, size check).
- Registrar pago shows the currency of the payment = the póliza currency («El pago se registra en UDI (UDI), la moneda de la póliza»; amount labelled «Monto en MXN / USD / UDI»). Without a currency on the póliza it says so and points to **Editar**.
- Board (one RPC, `list_collection_board`; filtering happens in the browser): one row per active póliza with its next receipt from the receipt calendar (FECHA EMISION + forma de pago) after the latest payment. Overdue pólizas from earlier months are always listed.
  - Counters (counts only, mixed currencies): vencen hoy (+ próximos 7 días), por cobrar al cierre (next due up to month end, incl. overdue), vencidos (+ en peligro), pagos registrados este mes (same count as Vista general).
  - Period chips with counts: **Por cobrar** (default: en peligro + vencidas + por vencer), Vencen hoy, En peligro, Vencida, Por vencer, Al corriente, Todas (incl. sin fecha de cobro) — same buckets and colors as Vista general.
  - Promotoría: **Asesores** list (select on small screens) with receipts in the current period and en peligro per asesor; picking one filters the table and the side cards.
  - Table: recibo (póliza · n/N + cliente), vence, días (hoy / en N / hace N), monto (latest primas from the commission file, in the póliza currency), estado, **Registrar pago**. Clicking a row selects it.
  - Side panel: selected receipt (vence, antigüedad, estado, forma de pago, último pago, teléfono, asesor) with **Registrar pago**, **Enviar recordatorio por WhatsApp** (opens `wa.me` with a prefilled message when the client has a phone; otherwise **Registra su número de teléfono** opens the client edit dialog right there and refreshes the board) and the póliza expediente; below, cartera of the asesor (or everyone) by days late (por vencer, 1–10, 11–20, 21–30, en peligro, sin fecha).
  - Pólizas **sin forma de pago** show a warning flag (table, Pólizas list, expediente) and a notice in the side panel / receipt calendar: receipts are calculated as monthly until it is completed (expediente → **Editar**, or «Completar forma de pago» in the calendar).
  - Not adopted from the reference: amount totals (mixed currencies), insurer portal confirmation, reminder counters (no messaging backend yet).
- Year-scoped payment-control grid (parked/legacy path): clave, asesor, póliza, cliente, proyecto, moneda, forma/medio de pago, prima al cobro, día de cobro, estatus, and ENE–DIC cells.
- Estatus is editable (`AMPARADO`, `CORRIENTE`, `FLEXIBLE`, `FLEXIBLE/REVISAR`, `MES`, `PERIODO GRACIA`, `ATRASADO`) — stored as `contract.collection_status`, separate from lifecycle `contract.status`.
- Month cells show scheduled day; highlighted when paid (`paid_at`). Click opens dialog requiring real payment date (optional amount/notes); **manual** marks require payment evidence (image/PDF) linked via `file.collection_payment_id`; import marks do not. Cells with evidence show a paperclip; dialog has **Ver evidencia** (signed URL). Can clear a paid mark.
- Month marks seed from import/`contract_detail` (`source=import`) without overwriting manual paid marks; edits write `audit_log` (no dedicated Historial UI yet — see [`audit-log-plan.md`](audit-log-plan.md)).
- CSV export is parked (`src/parked/lib/collections/export-csv.ts`).
- Legacy vencimientos view parked: `/dashboard/collections/v0`.

### Clientes (`/dashboard/clients`, `/dashboard/clients/[id]`)

- Counters: clientes (con póliza activa), con pagos atrasados (en peligro), cumpleaños este mes, sin datos de contacto.
- List: search (nombre, CURP/RFC, teléfono, correo, asesor) + **Nuevo cliente**; chips Todos / Con póliza activa / Con atraso / En peligro / Sin póliza activa. Columns: cliente (+ RFC/CURP), teléfono, correo, asesor (promotory), nacimiento (edad), pólizas activas, próximo cobro, estado = most critical cartera status of its pólizas. One RPC: `list_client_portfolio`. Row click opens the expediente (no row actions).
- Expediente (full page, no drawer): **Editar** / **Eliminar** (confirm dialog; deletes its pólizas too); counters (pólizas activas, estado, cobros y pagos en 30 días); **Datos del cliente** (teléfono → WhatsApp, correo → mailto, nacimiento, CURP, RFC); **Estado de la cartera** card; **Pólizas del cliente** (shared `ContractPortfolioPanel` filtered by client).
- Contact data (teléfono 10 dígitos, correo) belongs to the promotoría and is edited in the client dialog.

### Asesores (`/dashboard/consultants`, `/dashboard/consultants/[id]`, promotory only)

- Counters: asesores (con acceso / por invitar o aceptar), pólizas en cartera, cartera al día %, asesores con pólizas en peligro (names).
- List: search (nombre, clave, correo) + **Invitar asesor**; chips by access (Activo, Invitación pendiente, Sin invitar, Inactivo). Columns: asesor (+ correo), clave, alta, pólizas (· clientes), al día % + mini status bar, con atraso (· en peligro), pagos 30 días, acceso. One RPC: `list_consultant_portfolio`.
- Expediente: **Editar** / **Invitar** or **Reenviar invitación** (feedback via toast); counters (pólizas activas, cartera al día, con atraso, pagos 30 días); **Datos del asesor** (clave, correo, alta, acceso + what it means); **Estado de la cartera**; **Cartera del asesor** (`ContractPortfolioPanel` scoped to the asesor).
### Vista general (`/dashboard`)

Same view for both roles, scoped by session: **promotoría** = office-wide, **asesor** = own cartera. One SQL call (`get_collection_overview`); **counts only** — amounts are not shown because pólizas mix currencies (UDI / pesos / dólares) and manual payments may have no amount.

1. **Indicadores:** pólizas activas · cobros de hoy (+ próximos 7 días) · pagos registrados este mes (vs the same elapsed days of last month) · vencidas (1–30 días) · en peligro (+30 días).
2. **Estado de la cartera:** % al día + 100% stacked bar (Al corriente / Por vencer / Vencida / En peligro) by next due — same rule as Cobranza, so the numbers match the lists below. Pólizas without any known payment are counted apart (no next due can be computed).
3. **Avisos:** only what needs action — en peligro, vencidas, pólizas sin pagos registrados, sin forma de pago (calculated as mensual), cobros de hoy, asesores sin invitar / invitaciones sin aceptar (promotoría). Each links to the screen that fixes it.
4. **Pagos registrados por mes:** this year vs last year, January → current month, by payment date (counts of cobranza marks: imported FECHA PAGO and manual payments).
5. **Antigüedad del atraso:** overdue pólizas by days late (1–10, 11–20, 21–30 = vencida; 31–60, 61–90, +90 = en peligro).
6. **Cartera por asesor** (promotoría, 2+ asesores): stacked bars per asesor, sorted by vencidas + en peligro; top 8, all in the table.
7. **Prioridad de cobranza** card below: one list ordered en peligro → vencida → por vencer (same colors and `CarteraStatusBadge` as the charts), filter chips with counts, first 8 rows (clicking a row opens that póliza's expediente) and a link to the rest in Cobranza.

Every chart has a legend, hover/focus tooltips and a **Ver datos** table. Colors (validated for both themes): `--viz-*` tokens in `globals.css`. Prima filter/totals UI stays parked.

### Solicitudes de cambio (`/dashboard/change-requests`)

- Promotory reviews office requests; consultants create CHANGE / CORRECT against own contracts.
- **Nueva Solicitud** (Asesores dialog + contract CHANGE/CORRECT pages): attach documents in-form (name + file); on submit, create the contract or change request, then upload to private Storage `documents` under `{officeId}/{consultantId}/{contractId}/{contractCode}/`. Client/contract selectors autofill related fields. No Google Drive links.

### Proyección (`/dashboard/projection`)

- Projection views for office/consultant scoped data.

---

## UX conventions

- **Empty cartera:** while the office (or asesor) has no pólizas at all, Vista general, Cobranza and Pólizas show `GettingStarted` instead of zero counters and empty charts — big icon, what the page will show, and two cards: **Importa tus datos** (→ Importar: Mina de Oro, plantilla, comisiones; asesor: comisiones) and **Registra una póliza** (opens the manual dialog right there), plus «Invita a tus asesores» for the promotoría. Cobranza with pólizas but none en vigor explains why there is nothing to collect. Clientes / Asesores empty lists use the compact `EmptyState`. Shared pieces: `components/ui/empty-state.tsx`, `components/dashboard/getting-started.tsx`.
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
