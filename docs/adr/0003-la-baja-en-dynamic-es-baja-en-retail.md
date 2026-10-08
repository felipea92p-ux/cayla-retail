# ADR-0003 — La baja en dynamic es la baja en retail (sin segundo paso)

**Fecha:** 2026-10-07
**Estado:** Escrito, **pendiente de aplicar** (`supabase/unificacion/12_baja_se_propaga.sql`
se corre a mano en el SQL Editor de cayla-DYNAMIC, como los pasos 1-11)

## Contexto

Tras la unificación, retail vive dentro de la base de dynamic y reusa su identidad
(`public.personas`). Felipe dio de baja a una persona en dynamic
(`fn_cesar_persona` → `personas.estado = 'inactivo'`) y en retail seguía apareciendo
en la lista de cuentas al asignar un rol. «Una vez que doy de baja en dynamic no te
debe mostrar en retail: se da de baja en ambos.»

La causa no era la lista: **retail nunca miraba `estado`**. Tres puntos lo ignoraban:

1. `retail.personas` (vista) listaba a todos.
2. Los 4 candados (`es_lider`, `es_supervisor`, `mi_sede`, `puede_operar_sede`) leen el
   rol con `fn_rol_actual()`, que no filtra por `estado`. Una persona de baja con su
   login vivo seguía siendo Líder / de su sede para ~40 políticas RLS y RPCs.
3. Cinco lecturas `using (auth.role() = 'authenticated')` (categorías, productos,
   variantes con costo, plan de cuentas, proveedores) no distinguían activos de
   ex-integrantes.

Hallazgo lateral: con candados que devuelven `null` (usuario sin fila en `personas`),
un guard `if not retail.puede_operar_sede(x) then raise ...` **no salta**, porque
`not null` es `null`. Los candados ahora devuelven siempre `true`/`false`.

## Decisión

**Una sola fuente de verdad: `public.personas.estado`.** Retail no guarda una copia ni
un «estado propio»; lee el mismo dato. Así no hay nada que sincronizar y nada que pueda
quedar desfasado (principio 4), y la reactivación en dynamic (`fn_reactivar_persona`)
devuelve el acceso en retail sola.

- Un helper `retail.es_activa()` y los 4 candados lo exigen. Se corrige en el candado,
  no en cada política (principio 2).
- `retail.personas` pasa a ser **el equipo de hoy** (solo activos); cualquier selector
  que la use deja de ofrecer a quien se fue. Nace `retail.personas_historial` (todos)
  únicamente para nombrar autores en la auditoría (ficha de producto → movimientos).
- Las 5 lecturas abiertas pasan a exigir `retail.es_activa()`.
- App: `requirePersonaActual()` no cambia de lógica — al no haber fila en `personas`
  para una persona de baja, ya redirige a `/login?error=sin_persona`; solo se ajustó el
  mensaje para que cubra «ya no formas parte del equipo».

## Alternativas descartadas

- **Filtrar `estado='activo'` solo en la pantalla / en cada query de la app.** Esconde
  a la persona de la lista pero deja el acceso abierto por API directa, y obliga a
  recordar el filtro en cada pantalla nueva. Es el parche que el principio 2 prohíbe.
- **Una columna `activo` propia de retail** (como el `personas.activo` del retail viejo).
  Dos verdades que alguien tiene que mantener a mano: dar de baja en dynamic y olvidarse
  de retail es exactamente el problema que se quiere eliminar.
- **Banear la cuenta de Supabase Auth al dar de baja.** Corta también el login a dynamic
  (que tiene sus propias reglas para cesados: liquidación, constancias) y requiere la
  clave de servicio, rotada a propósito. Fuera del alcance de retail.
- **Esconder también a los ex-integrantes del historial.** Borra la auditoría: «quién
  hizo este movimiento» pasaría a «—». Por eso la vista de historial separada.

## Consecuencias

- Dar de baja en dynamic cierra retail en el acto: sin lista, sin login útil, sin lecturas.
- Un ex-integrante con sesión viva ve el login con «tu cuenta no está activa…» en su
  próxima pantalla; el token en sí no se revoca (no hace falta: todo lo detrás está cerrado).
- **No cubre** las RPCs `abrir_caja`, `cerrar_caja`, `registrar_venta`, `recibir_lote`,
  `registrar_gasto`, `recalcular_stock` y `fn_aplicar_movimiento`: no validan quién las
  llama (la `0012` del retail viejo sí; el port de la unificación no la trajo). Es un
  hueco previo que afecta igual a un activo de otra sede — va como arreglo aparte.
- Reversa: bloque comentado al final del SQL deja todo como tras los pasos 3-6.
