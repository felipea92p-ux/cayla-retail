-- ============================================================================
-- 20260918020000 — "Para liquidar" pasa de 4 filas por sede a 1 global
--
-- QUÉ PASÓ
--   `20260917230100_etiquetas_seed_comerciales_y_festividades.sql` sembró
--   "Para liquidar — <sede>" una vez por cada `retail.ubicaciones` activa,
--   con `sedes_permitidas` fija a esa sede. Felipe lo vio en pantalla y
--   preguntó por qué existían 4 en vez de una — la pregunta destapó un
--   error de diseño, no solo de UX.
--
-- POR QUÉ ERA UN ERROR REAL, NO SOLO VISUAL
--   `sedes_permitidas` no es cosmético: `retail.fn_variante_permitida_en_sede`
--   (`20260917100700_movimientos_respetan_restriccion_sede.sql`), usada por
--   `registrar_venta` y `transferir`, BLOQUEA vender/trasladar esa variante
--   en cualquier sede que no esté en la lista. "Para liquidar — Tienda TRU"
--   habría bloqueado la venta de esa misma prenda en Tienda AQP, aunque AQP
--   tuviera su propio stock fresco de la misma variante — el candado sirve
--   para "esta prenda SOLO se vende en esta sede" (una decisión real de
--   exclusividad), no para "avisar que se está liquidando en algún lado".
--   Se mezclaron dos preguntas distintas en el mismo mecanismo.
--
-- POR QUÉ ES SEGURO CORREGIRLO AHORA
--   Verificado antes de escribir esta migración (0 filas):
--     select count(*) from retail.variante_etiquetas ve
--       join retail.etiquetas e on e.id = ve.etiqueta_id
--       where e.nombre like 'Para liquidar%';
--   Ninguna variante tenía alguna de las 4 aplicada todavía — no hay nada
--   que migrar ni ningún candado de venta ya activo que retirar.
--
-- EL COSTO ACEPTADO
--   Con una sola etiqueta global, una prenda puede mostrarse "para
--   liquidar" en una sede donde en realidad no lo está — puramente
--   cosmético. Se afina más adelante con vigencia/estilo visual si hace
--   falta, nunca reintroduciendo un candado de venta para esto.
-- ============================================================================

set search_path = retail, public, extensions;

update retail.etiquetas set activo = false
where nombre like 'Para liquidar — %';

-- Sin desactivar el trigger, `estado='aprobado'` de abajo se ignora: el
-- INSERT del trigger siempre recalcula estado desde auth.uid()/fn_es_lider(),
-- y en una migración no hay sesión — quedaría 'pendiente' sin querer.
alter table retail.etiquetas disable trigger etiquetas_estado_biut;

insert into retail.etiquetas (nombre, estado, activo, notas)
values (
  'Para liquidar', 'aprobado', true,
  'Global a propósito — sedes_permitidas es un candado real que bloquea venta/traslado (ver registrar_venta/transferir), no algo cosmético. No restringir por sede acá: mezclaría "avisar que se liquida" con "prohibir vender en otra sede".'
)
on conflict (retail.fn_clave_texto(nombre)) do nothing;

alter table retail.etiquetas enable trigger etiquetas_estado_biut;
