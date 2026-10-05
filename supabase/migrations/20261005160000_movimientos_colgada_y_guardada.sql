-- ============================================================================
-- 20261005160000_movimientos_colgada_y_guardada.sql — CAYLA V2 · ADR-0345 (Felipe, 2026-10-05)
-- Movimientos distingue una COLGADA EN PISO (almacén → piso) de una GUARDADA EN ALMACÉN (piso → almacén): como filtro de la
-- lista y como grupo de las cifras.
--
-- EL PROBLEMA PRIMERO. En Movimientos, lo que pasa entre el almacén y el piso es una sola cosa para la base: un movimiento
-- «interno» (`tipo = 'traslado'` con la misma ubicación de origen y destino). Una colgada y una guardada solo se distinguen
-- por el PAR de sububicaciones (almacén → piso o piso → almacén), y ese par no se podía filtrar ni contar: la pantalla
-- rediseñada tiene un botón «Colgadas en piso» y otro «Guardadas en almacén», cada uno con su cifra, y con el filtro «interno»
-- salían las dos mezcladas.
--
-- QUÉ HACE (solo funciones de lectura; no toca ninguna tabla ni política).
-- 1. `fn_movimientos`: `p_categoria` acepta dos valores más, `'colgada'` y `'guardada'`. Son un subconjunto de `'interno'`:
--    la misma fila interna, con el par exacto de sububicaciones (el mismo que lee `fn_bajadas_del_piso` y que la web llama
--    `INTERNO_POR_PAR`). Misma firma y mismas columnas. Un valor desconocido sigue lanzando el error de siempre.
-- 2. `fn_movimientos_resumen_procesos`: dos GRUPOS más, `colgada` y `guardada`, con sus operaciones y sus unidades «movidas».
--    Una fila interna sigue contando en `interno` y en `todos`; además cuenta en `colgada` o en `guardada` según su par. Una
--    fila interna de OTRO par (cuarentena, un rack del Taller) cuenta solo en `interno`: no es ni una ni otra cosa.
--
-- Como en 20260927153000, no se copia ninguna función: se reemplaza SOLO el trozo que cambia dentro de la definición VIVA
-- (`pg_temp.reemplazar_una_vez`), así ningún parche en vivo se pierde. Cada reemplazo lleva su marca y por eso se puede
-- pegar dos veces.
--
-- CONTRATO. PROMETE: con `p_categoria = 'colgada'` la lista trae solo las filas internas de almacén de tienda a piso de venta,
-- y con `'guardada'` solo las de piso de venta a almacén de tienda; `'interno'` trae las dos y las demás. Las cifras de
-- `colgada` + `guardada` nunca superan las de `interno`. ASUME: el par se lee de `sububicacion_id` (origen) y
-- `sububicacion_destino_id` (destino) de la propia fila, como lo escriben las funciones que bajan prendas al piso y las que las suben al almacén.
--
-- SE ROMPE SI: una función futura escribe un movimiento interno con el par al revés de lo que significa (origen = destino de
-- verdad): la fila se contaría en el grupo equivocado. Lo vigila `pnpm pruebas:movimientos-colgada-y-guardada`.
--
-- ORDEN DE PUBLICACIÓN. Esta migración va ANTES que la web que muestra los botones (o a la vez): la web nueva pide
-- `p_categoria = 'colgada'` y una base sin esta migración responde «Categoría de movimiento desconocida». La web lo cubre
-- (cae a `interno` y muestra las dos juntas), pero las cifras de los dos botones salen en cero hasta que se pega.
--
-- CÓMO SE PEGA: tal cual en el SQL Editor de producción (ya trae `retail.`). Solo reemplaza funciones de lectura: no toma
-- candados de tablas en uso ni lleva políticas (ADR-0195 no aplica). Se puede pegar dos veces.
-- ============================================================================

set search_path = retail, public, extensions;

-- Reemplaza UN trozo de una función viva y aborta si el trozo no aparece exactamente una vez (la función cambió desde que
-- se escribió esto). La marca, que va dentro del texto nuevo, la vuelve re-pegable.
create or replace function pg_temp.reemplazar_una_vez(p_firma text, p_viejo text, p_nuevo text, p_marca text)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_marca in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta migración: el texto a reemplazar aparece % veces (se esperaba 1). Regenera el reemplazo desde su definición real.',
      p_firma, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- ---------- 1. La lista: «colgada» y «guardada» como tipos ----------
select pg_temp.reemplazar_una_vez(
  'retail.fn_movimientos(uuid, date, date, text, text, text, uuid, uuid, timestamp with time zone, uuid, integer, uuid)',
  $viejo$p_categoria not in ('entrada', 'salida', 'interno', 'ajuste', 'transferencia')$viejo$,
  $nuevo$p_categoria not in ('entrada', 'salida', 'interno', 'ajuste', 'transferencia', 'colgada', 'guardada') /* ADR-0345: validacion_colgada_guardada */$nuevo$,
  'ADR-0345: validacion_colgada_guardada'
);

select pg_temp.reemplazar_una_vez(
  'retail.fn_movimientos(uuid, date, date, text, text, text, uuid, uuid, timestamp with time zone, uuid, integer, uuid)',
  $viejo$or (p_categoria = 'interno' and m.tipo = 'traslado' and m.ubicacion_id = m.ubicacion_destino_id)$viejo$,
  $nuevo$or (p_categoria = 'interno' and m.tipo = 'traslado' and m.ubicacion_id = m.ubicacion_destino_id)
      or (p_categoria = 'colgada' and m.tipo = 'traslado' and m.ubicacion_id = m.ubicacion_destino_id /* ADR-0345: filtro_colgada_guardada */
            and so.tipo = 'almacen_tienda' and sd.tipo = 'piso_venta')
      or (p_categoria = 'guardada' and m.tipo = 'traslado' and m.ubicacion_id = m.ubicacion_destino_id
            and so.tipo = 'piso_venta' and sd.tipo = 'almacen_tienda')$nuevo$,
  'ADR-0345: filtro_colgada_guardada'
);

-- ---------- 2. Las cifras: dos grupos más ----------
select pg_temp.reemplazar_una_vez(
  'retail.fn_movimientos_resumen_procesos(uuid, date, date, text, text, uuid, uuid)',
  $viejo$    left join venta_items vi on vi.id = m.venta_item_id$viejo$,
  $nuevo$    left join venta_items vi on vi.id = m.venta_item_id
    left join sububicaciones so on so.id = m.sububicacion_id /* ADR-0345: sububicaciones_para_colgada_guardada */
    left join sububicaciones sd on sd.id = m.sububicacion_destino_id$nuevo$,
  'ADR-0345: sububicaciones_para_colgada_guardada'
);

select pg_temp.reemplazar_una_vez(
  'retail.fn_movimientos_resumen_procesos(uuid, date, date, text, text, uuid, uuid)',
  $viejo$case when m.tipo = 'traslado' and m.ubicacion_id = m.ubicacion_destino_id then 'interno' end,$viejo$,
  $nuevo$case when m.tipo = 'traslado' and m.ubicacion_id = m.ubicacion_destino_id then 'interno' end,
        case when m.tipo = 'traslado' and m.ubicacion_id = m.ubicacion_destino_id /* ADR-0345: grupos_colgada_guardada */
               and so.tipo = 'almacen_tienda' and sd.tipo = 'piso_venta'
             then 'colgada' end,
        case when m.tipo = 'traslado' and m.ubicacion_id = m.ubicacion_destino_id
               and so.tipo = 'piso_venta' and sd.tipo = 'almacen_tienda'
             then 'guardada' end,$nuevo$,
  'ADR-0345: grupos_colgada_guardada'
);

comment on function retail.fn_movimientos_resumen_procesos(uuid, date, date, text, text, uuid, uuid) is
  'ADR-0234 y ADR-0345: las tarjetas y las cifras de Movimientos leídas desde la tienda. Por (grupo de la pantalla: todos, entrada, salida, transferencia, ajuste, interno, y los dos subconjuntos de interno: colgada = almacén → piso, guardada = piso → almacén; proceso): operaciones (lo guardado de una sola vez), filas, y las unidades que ENTRARON a la sede, SALIERON de ella o se MOVIERON entre piso y almacén. Mismo permiso que la lista.';
