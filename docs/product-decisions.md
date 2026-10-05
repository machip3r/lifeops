# LifeOps — Product decisions (registro + cobranza)

Validated decisions for the registration + collections refactor. Complements [`historias-de-usuario.md`](historias-de-usuario.md) and [`product-flows.md`](product-flows.md).

## Closed decisions

| Topic | Decision |
| --- | --- |
| Recordatorios | **Lista accionable** en LifeOps (por vencer / en peligro). Sin WhatsApp/SMS automático en este MVP; automatización = fase 2. |
| Baja de asesores | **Soft-delete**: pasar a `INACTIVE`. No borrar en cascada si hay pólizas. Hard-delete solo cuando no hay pólizas (limpieza). |
| `office_id` en póliza | **Denormalizado** en `contract.office_id` (backfill desde `consultant`). Unique `(office_id, contract_number)` cuando el número existe. |
| Tabla de pólizas | **Una sola** `contract` con `source` = `import` \| `manual` \| `mixed`. |
| Identidad de cliente | **Híbrida**: CURP/RFC cuando existan (únicos globales); si no, cliente **local por office** (`office_id` requerido). |
| Código de asesor | Único **por office** (sin cambio). |
| Roles MVP | Dueño (`promotory`) + asesor (`consultant`). Rol operaciones = post-MVP. |
| Peligro | Más de **30 días** después de la fecha de cobro esperada sin pago registrado. |
| Reasignación | La promotoría puede mover una póliza a otro asesor de la **misma office** (mismo `contract_number` y cliente; se actualiza `consultant_id` / `office_id` vía trigger). |
| Alta inicial vía comisiones | Si la póliza entra **por primera vez**, el import exige **fecha del último pago previo** al archivo actual (+ fecha de emisión del archivo). Se usa para día de cobro, predicción y estatus inicial. |
| Portal Monterrey | Sin sync automática obligatoria; humanos actualizan. |

## Dedupe de cliente (B + C)

1. Si el alta/import trae **CURP** → buscar por CURP; reutilizar fila global.
2. Else si trae **RFC** → buscar por RFC; reutilizar.
3. Else → cliente **local** a la office; buscar por nombre + `office_id`; crear si no existe.
4. Si CURP/RFC existe pero el nombre difiere → reutilizar identidad y **no** crear duplicado; opcionalmente actualizar nombre solo si el actual está vacío (UI puede avisar).

## Recordatorios (MVP)

- Horizontes útiles en UI: por vencer (próximos 7/15 días) y **en peligro** (>30 días).
- Acciones: ver lista, copiar datos de contacto / abrir cobranza. Sin envío masivo externo.
