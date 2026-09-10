# ADR-0018 — Trazabilidad y acceso: auditoría por trigger genérico y contador de solo lectura, sin tocar el enum de Dynamic

**Fecha:** 2026-09-05
**Estado:** Propuesto — sale de la auditoría del 2026-09-05. Felipe marcó el
audit log como MUY CRÍTICO. Hacerlo ahora cuesta lo mismo que hacerlo tarde y
salva el histórico que empieza esta semana.

## Contexto

**Nadie sabe quién tocó qué.** De las 32 tablas base de `retail`, solo **11**
tienen columna de autor (`ajustes_efectivo`, `asientos.creado_por`,
`cajas.abierta_por`/`cerrada_por`, `comprobantes`, `depositos_bancarios`,
`gastos`, `lotes.recibido_por`, `movimientos`, `producciones.creado_por`,
`proformas`, `ventas`). Las otras **21 no tienen ninguna** — incluidas
`variantes` y `productos`, que es donde viven **precio y costo**, más
`proveedores`, `ordenes_compra`, `cuentas_contables` y `series_comprobantes`. Y
en las 11 que registran autor, se guarda el autor de la fila nueva, **nunca el
valor anterior**: no hay una sola tabla de historial en el schema, y los 10
triggers no internos son todos de `updated_at` o de validación de cuadre/nota.

El escenario no es hipotético: alguien cambia el precio de una referencia de 189
a 89, se venden 40 unidades el fin de semana y el margen del mes se hunde. Hoy
no hay forma de saber quién, cuándo, ni cuál era el precio anterior —
`variantes` solo tiene `updated_at`, que dice cuándo y nada más. Y hay un camino
de escritura directa que ninguna RPC vería: `RecetaCosto.tsx:74` hace
`.from("variantes").update({ costo })` desde el navegador.

**El contador externo no tiene por dónde entrar.** El enum de roles es
`integrante | supervisor_sede | lider_do | admin` (`pg_enum` sobre
`rol_usuario`) — nada de solo lectura — y toda la RLS de `retail` se decide con
dos preguntas (`es_lider()` = admin, `puede_operar_sede()`). Hoy la única forma
de darle acceso a un contador es crearlo como `admin`: con permiso para
registrar gastos, emitir comprobantes, fijar mínimos y mover stock de las tres
tiendas y el Taller.

El atajo tentador está cerrado, y conviene que quede escrito por qué: **agregar
un valor `contador` al enum no alcanza**, porque `apps/web/lib/persona.ts:31-33`
es `return rol === "admin" || rol === "lider" ? "lider" : "integrante"` — manda
a `integrante` todo lo que no reconoce, así que el contador entraría **con
permiso de escritura sobre una sede**, en silencio. Y el enum es de Dynamic, no
nuestro (ADR-0012).

Momento: `retail.movimientos` tiene 28 filas y `retail.ventas` 2. El histórico
que se pierde por no haber tenido auditoría antes es **cero**. Con el catálogo
real cargándose esta semana, eso deja de ser cierto.

## Decisión

**DECIDÍ: las dos capas van por fuera del modelo de identidad de Dynamic — un
trigger genérico y una tabla de acceso propia — y ninguna toca `public.personas`
ni el enum `rol_usuario`.**

Son una sola decisión porque comparten la misma restricción: `retail` no
modifica la identidad de Dynamic, la extiende de costado, igual que ADR-0001
agregó una política nueva en vez de reescribir la existente, y como ADR-0012
dejó escrito para todo el sistema.

**Auditoría.** `retail.auditoria (id, tabla, fila_id, accion, persona_id,
auth_uid, antes jsonb, despues jsonb, ocurrido_en timestamptz default now())`,
una función `retail.fn_auditar()` genérica con `TG_TABLE_NAME`,
`to_jsonb(OLD)`/`to_jsonb(NEW)`, y `create trigger ... after insert or update or
delete ... for each row execute function retail.fn_auditar()` sobre las 32
tablas. El autor se guarda en dos columnas a propósito: `auth_uid` sale de
`auth.uid()` directo —existe siempre, nunca falla, y es el dato que no se puede
falsificar— y `persona_id` se resuelve contra `retail.personas` por
`auth_user_id`. Guardar solo el `persona_id` haría que la auditoría dependa de
la vista puente de Dynamic (ADR-0012) para poder escribir; guardando los dos, si
la vista cambia, la fila de auditoría se escribe igual y el nombre se
reconstruye después.

RLS sobre la tabla: SELECT para `es_lider()` (y para el contable), sin
INSERT/UPDATE/DELETE para nadie — el trigger escribe porque corre como el dueño.
Índices en `(tabla, fila_id)` y `(ocurrido_en)`.

El volumen está estimado, no supuesto: 50 ventas/día × 10 sedes ≈ 5.000
filas/día ≈ **5M filas en tres años**. Para Postgres con esos dos índices es
trivial; no hace falta particionar ni purgar, y decidir una política de
retención hoy sería sobre-construir.

**Contador.** `retail.accesos_contables (persona_id, activo)` + una función
`retail.es_contable()` que la lea + políticas **SELECT adicionales** (nuevas,
sin tocar las existentes) sobre lo que necesita ver: `asientos`,
`asiento_lineas`, `cuentas_contables`, `comprobantes`, `gastos`, `ventas`,
`depositos_bancarios` y `auditoria`. **Sin escritura en ninguna.** Y `mapearRol`
(`persona.ts:31-33`) gana un tercer valor, para que el contador no caiga en el
`else` de integrante.

**DESCARTÉ: agregar columna de autor a las 21 tablas que no la tienen.** Es lo
que uno hace por costumbre. Cuesta 21 `alter table`, 21 RPC que hay que
acordarse de llenar (y la número 22 que alguien va a olvidar), y **sigue sin
resolver el caso que motiva todo esto**: guarda quién escribió la fila nueva, no
cuál era el precio anterior. Un trigger genérico es una función y 32 líneas de
enganche, imposible de olvidar, y trae el "antes" gratis.

**DESCARTÉ también: auditar desde las RPC, dentro de la misma transacción.** Es
más barato en filas escritas y parece más limpio. Cubre solo lo que pasa por las
RPC: el `update variantes set costo` de `RecetaCosto.tsx:74` entra por PostgREST
y no lo vería — justamente el cambio de costo que reescribe el margen histórico
(ADR-0013).

**SE ROMPE SI: el acceso del contador se resuelve agregando un valor `contador`
al enum `rol_usuario` de Dynamic** en lugar de la tabla lateral. `mapearRol` lo
mandaría a `integrante`, y el contador externo que llegue en enero quedaría con
permiso de escritura sobre una sede: podría registrar movimientos de stock y
vender en TRU. El síntoma sería invisible —entra, ve lo que necesita, todo
parece bien— hasta que aparezca un movimiento de inventario firmado por el
contador. La regla es la de ADR-0012: `retail` nunca decide permisos leyendo un
valor nuevo del enum de Dynamic; los lee de tablas propias.

## Consecuencias

Un cambio de precio o de costo deja de ser un hecho anónimo, que es la condición
para que el margen histórico signifique algo (ADR-0013 sella el costo; esto
registra quién lo movió). Y el contador que llegue en enero entra sin ser admin.

Dos notas para quien lea la tabla después: una fila con `persona_id` nulo
significa **"esto se hizo desde el SQL Editor"** —no hay `auth.uid()` ahí— y eso
también es información, no un defecto. Y el trigger no se engancha a
`retail.auditoria` misma, por razones obvias, ni a `migraciones_aplicadas`
(ADR-0011), que ya es append-only por diseño.
