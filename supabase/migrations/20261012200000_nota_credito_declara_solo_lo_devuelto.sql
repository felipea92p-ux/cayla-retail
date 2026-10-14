-- ============================================================================
-- 20261012200000_nota_credito_declara_solo_lo_devuelto.sql — CAYLA V2 (2026-10-12; ADR-0382, sigue a 20261012120100)
--
-- EL PROBLEMA. `aprobar_devolucion` le pide a `emitir_nota` la nota de crédito sin decirle QUÉ se devolvió (no le pasa
-- `p_items`), y `emitir_nota` hace `coalesce(p_items, v_original.items)`: la nota hereda TODAS las líneas de la boleta.
-- Desde 20261012120100 el TOTAL de la nota ya es lo pagado por lo devuelto, pero sus ÍTEMS no. Una clienta compra una
-- polera (S/ 80 pagado) y una blusa (S/ 60) y devuelve solo la polera: la nota sale por S/ 80 y declara a SUNAT las dos
-- prendas (S/ 140). Es lo que `itemsParaLucode` (apps/web/lib/transmision-reglas.ts) manda a Lucode: un documento legal
-- que dice que volvieron prendas que la clienta se llevó, con líneas que no suman su total. En una devolución TOTAL no
-- pasaba (las líneas de la boleta son lo devuelto). Latente: al 2026-10-12, producción tiene 0 notas de crédito.
--
-- LO QUE HACE (reemplazo ANCLADO: falla sin tocar nada si la función viva no es la revisada; re-ejecutable):
--   · `aprobar_devolucion` pasa `p_items` armados con lo devuelto (`devolucion_items` ⋈ `venta_items`), con la forma de
--     las líneas de una venta `{variante_id, cantidad, precio_unitario, descuento_unitario}` — la que ya lee
--     `itemsParaLucode` —, así que Σ (precio − descuento) × cantidad de la nota es exactamente su total. Siempre, total o
--     parcial: un solo camino.
--   · Una prenda sin registrar (ADR-0179) lleva además `descripcion_libre` desde `prendas_por_regularizar.descripcion`: al
--     regularizarla, su línea de venta pasa a la variante real (y otra línea puede tener la misma variante), pero la boleta
--     la declaró con el texto que anotó caja; la nota repite ese texto, no el nombre del catálogo.
--   · Corrige el comentario de la función que seguía diciendo «sigue sobre precio de lista» (falso desde 20261012120100).
--
-- POR QUÉ NO SE FILTRAN LAS LÍNEAS DE LA BOLETA. `comprobantes.items` es el pedido tal como llegó del mostrador y
-- `venta_items` no guarda su posición: no hay cómo saber con certeza qué línea de la boleta es qué línea de venta (dos
-- prendas sin registrar comparten la variante centinela; tras regularizar, dos líneas pueden compartir la real).
--
-- LO QUE NO TOCA. `emitir_nota` (sigue aceptando `p_items` nulo: `registrar_devolucion_separacion` acredita cada boleta de
-- anticipo completa con sus propios ítems y está bien). Las notas ya emitidas (no hay ninguna en producción). La web.
--
-- PRODUCCIÓN. Una sola parte, solo un `create or replace` de una función (sin tablas ni políticas). Se puede pegar antes o
-- después de publicar la web: la web no cambia. Es SUNAT: se pega con el OK de Felipe. Ningún texto de ancla lleva
-- `select … into` (CLAUDE.md, «El SQL Editor agrega líneas por su cuenta»). Prueba: `pnpm pruebas:aprobar-devolucion-caja`.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

create or replace function pg_temp.reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_nuevo in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- La firma completa de la única versión viva de la función (si hubiera dos, la subconsulta falla: mejor que adivinar).
create or replace function pg_temp.firma(p_nombre text) returns text
language sql as $f$
  select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'retail' and p.proname = p_nombre;
$f$;

-- ---------- 1. El comentario dice lo que la función hace hoy ----------

select pg_temp.reemplazar(pg_temp.firma('aprobar_devolucion'),
  $v$-- Sin cambios: sigue sobre precio de lista, no el pagado con descuento — ver el
    -- encabezado de esta migración (LO QUE NO TOCA). Pendiente aparte, con ok de Felipe.$v$,
  $v$-- El total de la nota es lo que la clienta pagó por lo devuelto (precio − descuento), igual que el tope de reembolso.$v$,
  1);

-- ---------- 2. La nota de crédito declara solo lo devuelto ----------

select pg_temp.reemplazar(pg_temp.firma('aprobar_devolucion'),
  $v$      v_nota_id := emitir_nota(
        v_comprobante.id, 'nota_credito',
        case when v_es_total then '06' else '07' end,
        v_subtotal, v_igv, v_total_devuelto
      );$v$,
  $v$      -- La nota declara SOLO lo devuelto, con la forma de las líneas de una venta (la que lee `itemsParaLucode`): sin esto
      -- heredaba todas las líneas de la boleta y, en una devolución parcial, le decía a SUNAT que volvieron prendas que la
      -- clienta se llevó. Una prenda sin registrar repite el texto que declaró la boleta (`prendas_por_regularizar`): al
      -- regularizarla, su línea pasa a la variante real y otra línea puede tener la misma.
      v_nota_id := emitir_nota(
        v_comprobante.id, 'nota_credito',
        case when v_es_total then '06' else '07' end,
        v_subtotal, v_igv, v_total_devuelto,
        (select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                  'variante_id', vi.variante_id, 'cantidad', di.cantidad,
                  'precio_unitario', vi.precio_unitario, 'descuento_unitario', vi.descuento_unitario,
                  'descripcion_libre', pr.descripcion)))
           from devolucion_items di
           join venta_items vi on vi.id = di.venta_item_id
           left join prendas_por_regularizar pr on pr.venta_item_id = vi.id
          where di.devolucion_id = p_devolucion_id)
      );$v$,
  1);
