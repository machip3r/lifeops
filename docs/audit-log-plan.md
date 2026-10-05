# Plan — `audit_log` (toda LifeOps)

## Estado

Migración `017_audit_log.sql` **crea** `audit_log`, hace backfill desde `collection_audit_log` + `contract_reassignment_log`, y **elimina** esas dos tablas.  
`018_audit_log_consultant_rls.sql` corrige RLS de asesores (`id` o `auth_user_id`).

Escritura en app: `src/lib/audit/write.ts` (`writeAuditLog`).

Instrumentado hoy:

| Acción | `action` |
| --- | --- |
| Cobranza (upsert/clear/status/day/channel/project) | `collection.<type>` |
| Import sync batch | `collection.import_sync` |
| Reasignar póliza | `contract.reassign` |
| Registrar póliza manual | `contract.create` |
| Invitar asesor | `consultant.invite` |
| Desactivar / eliminar asesor | `consultant.deactivate` / `consultant.delete` |

## Modelo

| Columna | Notas |
| --- | --- |
| `id` | UUID |
| `office_id` | Tenancy |
| `actor_user_id` | `auth.users` |
| `actor_role` | `office` \| `consultant` \| `system` (UI: promotoría / asesor) |
| `action` | Namespaced string |
| `entity_type` / `entity_id` | What was touched |
| `source` | `ui` \| `import` \| `api` \| `system` |
| `old_values` / `new_values` | JSONB (no secrets) |
| `created_at` | |

## Pendiente (producto)

1. UI `/dashboard/activity` (filtros por actor, entidad, rango)
2. Instrumentar más mutaciones (client CRUD, document upload, office cleanup summary)
3. Retención / export — fuera de fase 1

## Tags

`tag` / `consultant_tag` **eliminados** en migración `016` (opción A, fase 1). UI aparcada en `src/parked/components/consultant-tags.tsx`.
