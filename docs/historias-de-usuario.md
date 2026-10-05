# Flujos e historias de usuario para LifeOps

By MacHip3r

**Objetivo del sistema (fase 1):** que la promotoría y los asesores sepan qué pólizas están por cobrar, cuáles van atrasadas o en peligro, y a qué clientes hay que recordar el pago, sin depender totalmente del portal de Seguros Monterrey.

---

## Usuarios de LifeOps


| Rol                     | Quién es                               | Qué puede hacer (visión ideal)                                                                                                               |
| ----------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Promotoría/Oficina**  | Quién administra la oficina            | Ve y administra asesores, clientes y pólizas; invita asesores; sube archivos de comisiones; ve cobranza y riesgos de toda la oficina         |
| **Operaciones**         | Personal de la oficina (próximamente)  | Sobre todo subir y revisar comisiones y cobranza; no administra todo como el dueño                                                           |
| **Asesor**              | Agente vinculado a una sola promotoría | Ve solo lo suyo; registra pólizas/clientes si hace falta; **debe** registrar pagos con evidencia; puede hacer solicitudes de cambios después |
| **Cliente (asegurado)** | Titular de la póliza                   | Por ahora no entra al sistema; más adelante podría                                                                                           |


**Reglas importantes (fáciles de recordar):**

- Un asesor (con su código) pertenece a **una** promotoría.
- Una póliza pertenece a **un** cliente, **un** asesor y **una** promotoría.
- Un mismo cliente puede tener varias pólizas (incluso con distintas promotorías/asesores).
- Lo que une todo es el **número de póliza** (GMM…, VI…, etc.).
- Una póliza está **en peligro** si pasan **más de 30 días** después de su fecha de cobro sin que se haya registrado el pago.
- La promotoría puede **reasignar una póliza a otro asesor** de la misma oficina.
- La información del portal de Monterrey **no se actualiza sola**: promotoría, operaciones y asesores la mantienen al día cuando hace falta.

---

## Flujo ideal de la Promotoría/Oficina

1. Entra a LifeOps.
2. **Sube los archivos de comisiones** del día (los que bajan o capturan del portal).
  - Indica la **fecha de emisión del archivo**.
  - Si hay **pólizas nuevas** (primera vez en LifeOps/base de datos), indica también la **fecha del último pago antes de ese archivo**, para predecir las próximas fechas de pago y definir el estado de la póliza.
  - Con eso el sistema puede crear o actualizar **asesores, clientes y pólizas**, y marcar **pagos** del día.
3. **Invita asesores** por correo (usuario + enlace de invitación) para que activen su cuenta.
4. Cuando haga falta, **registra pólizas a mano** (y con ello el cliente).
5. Entra a **cobranza / recordatorios** y ve:
  - pólizas por vencer,
  - clientes a contactar,
  - pólizas en peligro (más de 30 días sin pago).
6. Tiene vista completa de **asesores, clientes y pólizas** de su oficina.
7. Puede **mover / reasignar pólizas** de un asesor a otro dentro de la misma oficina (sin cambiar el número de póliza ni el cliente).

```text
Promotoría
   │
   ├─ Sube comisiones ──► se crean/actualizan pólizas, clientes, asesores y pagos
   ├─ Invita asesores ──► el asesor entra a LifeOps
   ├─ Alta manual ──────► póliza + cliente
   └─ Revisa cobranza ──► por vencer / en peligro / a recordatorio
```

---

## Flujo ideal del un usuario operativo (próximamente)

1. Entra a LifeOps con permisos más limitados que el dueño.
2. **Sube archivos de comisiones** y revisa que la información de pólizas y pagos quedó bien.
3. Consulta cobranza y listados de riesgo para apoyar a la oficina.
4. **No** administra la oficina completa (invitaciones, configuración avanzada, etc. — eso queda en el rol de la promotora).

> En la primera etapa el dueño cubre estas tareas. El rol de operaciones se agrega después.

---

## Flujo ideal de un Asesor

1. Entra a LifeOps (después de aceptar la invitación).
2. Ve **solo lo que le pertenece** (sus clientes, pólizas y pagos).
3. Si algo no vino en el archivo de comisiones, puede **registrar póliza o cliente a mano**.
4. **Registra los pagos** de sus pólizas, con evidencia:
  - con archivo de comisiones, o
  - con captura / recibo del portal.
5. Usa la vista de **por cobrar / en peligro** para saber a quién recordar el pago.
6. Más adelante: solicitudes de cambio de datos de póliza (flujo aparte).

```text
Asesor
   │
   ├─ Consulta su cartera
   ├─ Alta manual (si hace falta)
   ├─ Registra pagos + evidencia   ← obligación principal
   └─ Ve riesgos y recordatorios de lo suyo
```

---

## Historias de usuario (lenguaje simple)

### Promotoría

1. **Como** promotora de la promotoría, **quiero** ver todos los asesores, clientes y pólizas de mi oficina, **para** tener el control de la cartera en un solo lugar.
2. **Como** promotora, **quiero** invitar asesores por correo, **para** que entren a LifeOps y trabajen solo con su información.
3. **Como** promotora, **quiero** subir el archivo de comisiones del día, **para** que se registren o actualicen pólizas, clientes, asesores y pagos sin capturar todo a mano.
4. **Como** promotora, **quiero** indicar la fecha de emisión del archivo y, si hay pólizas nuevas, la fecha del último pago previo a ese archivo, **para** predecir próximos cobros y definir el estado de cada póliza.
5. **Como** promotora, **quiero** registrar una póliza manualmente cuando no venga en el archivo, **para** no perder información importante.
6. **Como** promotora, **quiero** ver qué pólizas están por vencer y cuáles llevan más de 30 días sin pago, **para** priorizar a quién contactar.
7. **Como** promotora, **quiero** una lista clara de clientes a los que hay que recordar el pago, **para** actuar sin depender del portal de Monterrey.
8. **Como** promotora, **quiero** reasignar una póliza a otro asesor de mi oficina, **para** corregir cartera cuando un asesor se va, se equivoca el código o se redistribuye trabajo.

### Operaciones (después)

1. **Como** personal de operaciones, **quiero** subir comisiones y consultar cobranza, **para** apoyar a la oficina sin tener todos los permisos del dueño.

### Asesor

1. **Como** asesor, **quiero** ver solo mis clientes, pólizas y pagos, **para** enfocarme en mi cartera.
2. **Como** asesor, **quiero** registrar pólizas o clientes a mano si hace falta, **para** completar lo que no llegó por el archivo de comisiones.
3. **Como** asesor, **quiero** registrar el pago de mis pólizas con una foto o archivo de evidencia, **para** dejar constancia de que el cobro sí ocurrió.
4. **Como** asesor, **quiero** ver mis pólizas en peligro o por cobrar, **para** contactar a tiempo a mis clientes.
5. **Como** asesor, **quiero** al entrar ver primero lo urgente (atrasos y pagos pendientes de registrar), **para** usar el sistema de forma simple y rápida.

### Reglas de negocio

1. **Como** usuario de LifeOps, **quiero** que el número de póliza sea la referencia principal, **para** encontrar y relacionar la misma póliza en comisiones, cobranza y recordatorios.
2. **Como** usuario de LifeOps, **quiero** que una póliza sin pago después de 30 días de su fecha de cobro se marque en peligro, **para** no dejar pasar casos críticos.
3. **Como** promotoría, **quiero** guardar CURP o RFC del cliente cuando exista (y si no, registrarlo solo en mi promotoría), **para** evitar confusiones y, más adelante, permitir que el cliente tenga su propio acceso.
4. **Como** promotoría, **quiero** que al reasignar una póliza solo cambie el asesor (misma oficina, mismo cliente y mismo número de póliza), **para** no romper historial de cobranza ni la llave de negocio.

---

## Decisiones ya cerradas

- Los **recordatorios** por ahora son una **lista** en LifeOps (a quién contactar). WhatsApp/SMS/Notificaciones automáticas vendrán después.
- Si un asesor deja de trabajar con la oficina, se **desactiva** (no se borran sus pólizas).
- El número de póliza identifica la póliza dentro de la promotoría.
- CURP o RFC del cliente cuando se conozcan; si no, el cliente queda registrado solo en esa oficina.
- Al subir comisiones, si una póliza entra **por primera vez**, se pide la fecha del **último pago previo** al archivo (además de la fecha del archivo).
- **Peligro** = más de **30 días** después de la fecha de cobro sin pago.
- La promotoría puede **reasignar pólizas entre asesores** de la misma oficina (pendiente de implementar en UI).

## Qué queda fuera (por ahora)

- Cálculos avanzados de primas, ventas y proyección.
- Que el cliente (asegurado) inicie sesión.
- Rol de operaciones.
- Cerrar por completo el flujo de solicitudes de cambio (se trabaja en otra entrega).

