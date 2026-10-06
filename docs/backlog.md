# LifeOps — Backlog (fase 1)

Control de tareas e ideas. Actualizar estados: `todo` → `doing` → `done` / `parked`.

Migraciones `010`–`018`: **done** en proyecto `lifeops` (`puprnthwzuotvrimflkl`) — tags dropeados, `audit_log` unificado + RLS asesores.

Companion: [`scope-fase1.md`](scope-fase1.md) · [`plan-p0-p1.md`](plan-p0-p1.md) · [`historias-de-usuario.md`](historias-de-usuario.md)

---

## P0 — Debe existir para el MVP usable

| ID | Tarea | Estado | Notas |
| --- | --- | --- | --- |
| P0-1 | Reasignar póliza a otro asesor (misma office) | done | `POST /api/contracts/reassign` + dialog + `013` log |
| P0-2 | Home promotoría: peligro + recordatorios | done | `/dashboard` prioridad office-wide; asesor en Mi resumen |
| P0-3 | Evidencia de pago en cobranza | done | Upload `file.collection_payment_id` al marcar mes manual |
| P0-4 | Confirmar umbral peligro = 30 días en UI/docs | done | Const `POLICY_AT_RISK_DAYS` + migración `012` |

---

## P1 — Completa el flujo de registro + cobranza

| ID | Tarea | Estado | Notas |
| --- | --- | --- | --- |
| P1-1 | CURP/RFC en formularios de cliente | done | Dialog clientes + alta manual de póliza; dedupe por CURP/RFC |
| P1-2 | Día de cobro (`collection_day`) en alta manual de póliza | done | Ya en `ManualContractDialog` |
| P1-3 | Historial de lotes `commission_import` | todo | Lista en extractor o página simple |
| P1-4 | Badge “En peligro” en listados pólizas / cobranza | done | `AtRiskBadge` en pólizas + cobranza |
| P1-5 | UX pass asesor (móvil cobranza, fewer clicks) | done | CTA Pago compacto, columnas responsive en cobranza |
| P1-6 | Al reasignar: bloquear cross-office + conservar historial | done | Cubierto en P0-1 |
| P1-7 | Cobranza lista: registrar pago con evidencia desde la fila | done | `RegisterPaymentDialog` + `collections/actions.ts`; evidencia obligatoria |

---

## P2 — Después del corte usable

| ID | Tarea | Estado |
| --- | --- | --- |
| P2-1 | Filtros recordatorios 7 / 15 / 30 días (office-wide) | todo |
| P2-2 | Días de peligro configurables por office | idea |
| P2-3 | Export CSV lista para contactar | idea |
| P2-4 | Digest semanal email a promotoría | idea |
| P2-5 | Reasignación masiva al desactivar asesor | idea |
| P2-6 | Notas en póliza | idea |
| P2-7 | Link read-only de estado de póliza | idea |

---

## Parked (código en `src/parked/`)

| ID | Feature | Estado |
| --- | --- | --- |
| PK-1 | Proyección | parked |
| PK-2 | Solicitudes de cambio (+ change / correct-folio) | parked |
| PK-3 | Cobranza v0 | parked |
| PK-4 | RequestFormDialog / Nueva Solicitud desde asesores | parked |
| PK-9 | Contadores / filtros de primas en vista general | parked |
| PK-10 | Importar Excel de pagos | parked |
| PK-11 | Registrar emisión (`/contracts/new`) | parked (vuelve con solicitudes/folios) |
| PK-12 | Historial UI solo-cobranza | parked UI; ver [`audit-log-plan.md`](audit-log-plan.md) |
| — | Sincronizar desde el portal | **removed** (Playwright) |
| PK-5 | Rol operations | parked (no code yet) |
| PK-6 | Login cliente | parked |
| PK-7 | WhatsApp/SMS automático | parked |
| PK-8 | Sync automática Monterrey | parked |

---

## Ideas (no comprometidas)

1. Weekly digest email  
2. Bulk reassign on agent leave  
3. Call-list CSV  
4. Policy notes  
5. CURP cross-office duplicate warning  
6. Agent on-time payment scorecard  
7. Configurable at-risk days  
8. Read-only share link for one policy  

---

## Cómo usar este backlog

- Al empezar una tarea: `doing` + fecha  
- Al terminar: `done` + link a PR/commit si aplica  
- No meter PK-* en el sprint de P0/P1 sin decisión explícita  
