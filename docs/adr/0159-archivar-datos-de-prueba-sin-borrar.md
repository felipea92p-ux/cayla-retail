# ADR-0159 — Archivar los datos de prueba de producción sin borrar nada (`es_prueba`)

**Fecha:** 2026-09-22
**Estado:** Propuesto — migración y funciones **escritas y verificadas contra un Postgres 17 desechable, NO aplicadas en producción**. El script que
marca las filas reales de producción (`pegar-en-produccion-archivar-datos-prueba-2026-09.sql`) queda listo para que Felipe lo revise y alguien lo
pegue — no se aplicó nada por esta vía.
**Decide:** Felipe (dueño), 2026-09-21, D-54 de `docs/datos/DECISIONES-2026-09-21-menu-comercial.md`: «se archivan con marca "prueba", nunca se borran».
**Afecta:** `productos`, `ventas`, `cajas`, `conteos` (columna nueva); cuatro funciones nuevas (`archivar_venta_prueba`, `archivar_caja_prueba`,
`archivar_conteo_prueba`, `archivar_producto_prueba`); un trigger nuevo en `conteos`; `apps/web/app/(app)/inventario`, `.../vender/historial`,
`.../caja/historial` (toggle «Con datos de prueba», apagado por defecto).

## Contexto

Verificado por Felipe el 2026-09-21, en producción (proyecto Supabase `cayla-dynamic`, schema `retail`): ~14 boletas/ventas pendientes sin transmitir,
3 cajas abiertas, 3 conteos anulados y algunos productos de prueba (códigos BLU/PAN/VES) — datos ficticios, sin riesgo tributario. Tienda TRU sale en
vivo esta semana con datos reales: esos datos de prueba tienen que dejar de mezclarse con la operación real, **sin borrarse** (`movimientos` ya está
protegido contra `DELETE` por trigger — `20260914165703_movimientos_inmutables.sql` — y el criterio es el mismo para el resto del historial).

ADR-0143 ya había anotado esto de pasada, el mismo día que se verificaron las 3 cajas abiertas: *"hoy hay 3 abiertas, probablemente de prueba"*. D-54
lo confirma y le pone nombre y mecanismo.

## Decisión

**DECIDÍ:** una columna `es_prueba boolean not null default false` en las cuatro tablas — nunca reutilizar `estado` (una venta «completada» de prueba
sigue completada; `estado` no aprende un valor que no le importa a nadie más) — y **cuatro funciones específicas, no una genérica con el nombre de
tabla como parámetro**. Cada una: `SECURITY DEFINER`, `search_path` fijo, `fn_es_lider()` PRIMERO (antes de mirar si la fila existe, mismo patrón que
`cerrar_caja` en ADR-0143). Las pantallas de lista (Existencias, Historial de ventas, Caja▸Historial) filtran `es_prueba = false` por defecto, con un
toggle simple para verlas.

**DESCARTÉ:**
- *`retail.fn_archivar_dato_de_prueba(p_tabla text, p_id uuid)` genérica.* Ganas: un solo lugar. Pagas: `cajas` necesita cerrar la caja antes de
  archivarla (ver abajo) y `conteos` necesita rechazar un conteo abierto — dos comportamientos que una función con `execute format(p_tabla)` habría
  tenido que ramificar por dentro igual, pero escondidos detrás de un `text` en vez de nombrados en cuatro firmas. El caso especial no desaparece,
  solo se vuelve menos auditable.
- *Reutilizar `estado` agregando el valor `'prueba'`.* Ganas: cero columnas nuevas. Pagas: toda función y pantalla que ya filtra por `estado` (docenas)
  tendría que aprender a ignorar un valor que no es un estado de negocio real — exactamente lo que la tarea pidió evitar.
- *Archivar productos con `variantes.activo = false` (el mecanismo que ya existe desde el 2026-09-16 para "6 productos de prueba", ver
  `inventario-v2.ts:98`).* Ganas: cero código nuevo, ya oculta de Existencias Y de Vender/Cambios/Traslados. Pagas: indistinguible de un producto
  REAL descontinuado — nadie podría después listar «qué archivé como prueba» aparte de «qué descontinué de verdad». Se prefirió la columna nueva por
  auditabilidad; el costo es que Vender/Cambios/Traslados (comparten `getStockPorUbicacion` con Existencias) **no** quedan protegidos por este cambio
  — ver «Fuera de alcance».

**SE ROMPE SI:**
- Se pega el script de producción (paso 3) ANTES que la migración: las funciones no existen y falla en la primera línea.
- Alguien corre `archivar_caja_prueba` sobre una caja `abierta` que en realidad es REAL: la cierra con «contado = esperado» (diferencia cero) igual —
  por diseño no hay forma de que la función lo sepa, por eso exige líder y por eso el script de producción nombra los 3 IDs uno por uno, nunca
  "todas las abiertas" (ver «Cómo se pega»).
- Tienda TRU (o cualquier sede) ya vendió de verdad antes de correr el script de producción: su comprobante pendiente REAL entraría en la misma
  consulta de PREVIEW que las boletas de prueba — por eso el PASO 2 exige IDs exactos, revisados a ojo, nunca un filtro amplio.

## El hallazgo que D-54 no pidió explícitamente (y por qué manda en esta decisión)

Marcar una caja de prueba como `es_prueba = true` sin cerrarla **no resuelve el problema real**: `cajas_ubicacion_abierta_unica`
(0008_caja_y_pagos.sql) — *"nunca dos cajas abiertas a la vez en la misma ubicación"* — seguiría bloqueando a Tienda TRU: nadie podría `abrir_caja` ahí
mientras la de prueba siga `abierta`. Peor: hasta que alguien lo notara, `getCajaAbierta()` (`apps/web/lib/caja.ts`) le mostraría a quien abra `/caja`
en TRU el tablero de la caja de PRUEBA, y una venta real terminaría atribuida a ella.

Por eso `archivar_caja_prueba` CIERRA la caja (si sigue abierta) como parte de archivarla — reutilizando `cerrar_caja` (ADR-0143), no una copia de su
fórmula — antes de marcarla. Verificado con una prueba dedicada: después de archivar, `abrir_caja` en la misma sede vuelve a funcionar (ver
«Verificación»). `archivar_conteo_prueba` aplica el mismo criterio al revés: como no hay un "cierre administrativo" razonable para un conteo (cerrarlo
de verdad AJUSTA STOCK según lo contado, y no hay nada contado de verdad en uno de prueba), **rechaza** archivar uno todavía `abierto` en vez de
decidir por su cuenta — quien lo encuentre usa `anular_conteo()` primero. (No aplica hoy: los 3 conteos de D-54 ya están `anulado`.)

## Qué cambia

- `supabase/migrations/20260922130000_archivar_datos_de_prueba.sql` — columna + 4 funciones + trigger, aditiva, sin prefijo `retail.` (se agrega solo
  al pegar en producción). Aplicada y verificada contra el Postgres desechable; **NO aplicada en producción**.
- `supabase/migrations/pegar-en-produccion-archivar-datos-prueba-2026-09.sql` — plantilla en dos pasos (PREVIEW con criterios amplios / APLICAR con IDs
  exactos) para las ~14 ventas, 3 cajas y 3 conteos reales. No llama a las funciones nuevas (el SQL Editor de producción no tiene `auth.uid()`, así que
  `fn_es_lider()` siempre daría falso ahí) — hace el `UPDATE` directo, mismo patrón que `colaboradores-iniciales-produccion.sql`. **Sin aplicar.**
- `conteos_es_prueba_solo_lider` (trigger): `conteos_write` (RLS) deja que una colaboradora edite su propio conteo — sin este trigger, esa misma
  policy habría dejado tocar `es_prueba` con un `PATCH` directo a la tabla, sin pasar por la función ni por un líder. `ventas`/`cajas` no lo necesitan
  (sin policy de escritura directa, solo funciones `SECURITY DEFINER`); `productos` tampoco (`productos_write_lider` ya exige líder para CUALQUIER
  columna).
- `apps/web/lib/ventas-historial.ts`, `.../inventario-v2.ts`, `.../caja.ts`: filtran `es_prueba = false` por defecto, con reintento sin la columna
  (`42703`) si la migración todavía no llegó a producción — mismo patrón que `cantidad_apartada` (`inventario-v2.ts`), necesario porque la web puede
  desplegarse antes que alguien pegue la migración.
- `apps/web/app/(app)/inventario/page.tsx`, `.../vender/historial/page.tsx` (+ `FiltrosHistorialVentas.tsx`), `.../caja/historial/page.tsx`: toggle
  «Con datos de prueba» (apagado por defecto). En Historial de ventas, una fila `es_prueba` (visible solo con el toggle) lleva el chip «Prueba»; en
  Caja▸Historial, la nota que la función deja («Archivada como dato de prueba (D-54)») ya lo dice, sin chip nuevo.
- `scripts/pruebas/archivar_datos_prueba.mjs` (16 escenarios, cada uno con ROLLBACK) — `pnpm pruebas:archivar-datos-prueba`.

## Fuera de alcance (a propósito)

- **`comprobantes.estado = 'pendiente'`** de las ventas archivadas NO se toca: archivar la `venta` no archiva su `comprobante`. Si Facturación (fuera
  del alcance de D-54: la tarea solo pidió Existencias/Historial de ventas/Caja▸Historial) necesita dejar de ofrecer estas boletas para transmitir, es
  una decisión aparte.
- **Vender (POS), Cambios y Traslados** comparten `getStockPorUbicacion` con Existencias y NO se filtran por `es_prueba` — un producto de prueba
  archivado sigue pudiendo venderse o transferirse por esas tres pantallas. Se decidió así porque la tarea nombró tres pantallas de lista, no estas
  tres (cuyo cambio tendría un radio de impacto mayor y no verificado); queda como seguimiento si Felipe quiere que un producto `es_prueba` también
  desaparezca del mostrador, no solo de la lista.

## Verificación

Contra un Postgres 17 desechable (Homebrew, sin Docker — el Docker compartido estaba caído toda la sesión; ver `pnpm local:donde`), con las 195
migraciones + seed aplicadas: **16/16 pruebas en verde** (`pruebas:archivar-datos-prueba`), incluidas — colaboradora rechazada en las 4 funciones y
en el `UPDATE` directo a `conteos`/`productos`; líder archiva las 4; **archivar una caja abierta la cierra con el mismo cálculo que `cerrar_caja`
(verificado con cifras: apertura 100 + ingreso 30 = sistema 130, contado 130, diferencia 0) y DESPUÉS se puede abrir una caja real nueva en la misma
sede**; archivar un conteo abierto se rechaza (22023); el trigger de `conteos` bloquea `es_prueba` por UPDATE directo aunque la colaboradora sí puede
tocar el resto de su conteo; la migración se puede pegar dos veces. `pnpm typecheck` y `pnpm lint` en verde (se actualizó a mano
`packages/database/src/types.ts` con las 4 columnas nuevas — `gen-types` necesita Docker, no disponible esta sesión).

**Sin verificar en un navegador real** (`npx supabase start` no disponible esta sesión, Docker caído — ver `pnpm local:donde`; no se reinició Docker
por cuenta propia, es compartido con ~20 sesiones). Antes de fusionar: abrir `/inventario`, `/vender/historial` y `/caja/historial` con una sesión real
y confirmar que el toggle «Con datos de prueba» trae y esconde filas de verdad.

## Cómo se pega en producción (pendiente del OK de Felipe)

1. Pegar `20260922130000_archivar_datos_de_prueba.sql` en el SQL Editor de producción (con el prefijo `retail.` en las 5 funciones/trigger, como
   siempre — el archivo del repo no lo trae).
2. Solo entonces, `pegar-en-produccion-archivar-datos-prueba-2026-09.sql`: correr cada PREVIEW, mirar las filas a ojo (el prefijo BLU/PAN/VES también
   matchea prendas reales; una caja abierta real de un turno en curso también aparecería en esa lista), y recién ahí reemplazar cada
   `<REEMPLAZA-CON-UUID-…>` con el id exacto antes de correr esa sección.
3. Verificar con el `SELECT` final del mismo archivo: 14 ventas, 3 cajas, 3 productos (el número real de conteos, productos y ventas de prueba puede
   no ser exactamente el de esta ADR — confirmar contra lo que el PREVIEW realmente trae).
