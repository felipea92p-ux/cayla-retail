-- ============================================================================
-- 20261005160000_movimientos_colgada_y_guardada.sql — CAYLA V2 · ADR-0345 (Felipe, 2026-10-05)
-- Movimientos se filtra y se cuenta por LOS TIPOS QUE SE VEN: venta, colgada en piso, guardada en almacén, llegada, traslado
-- enviado, cambio o devolución, y ajuste. Lo que hasta ahora eran dos cosas (`p_categoria` y `p_motivo`) pasa a poder pedirse
-- con una sola palabra.
--
-- EL PROBLEMA PRIMERO. La pantalla rediseñada tiene siete botones, cada uno con su cifra: «Ventas», «Colgadas en piso»,
-- «Guardadas en almacén», «Llegadas», «Traslados enviados», «Cambios y devoluciones» y «Ajustes». Con los filtros de la base
-- solo uno (las ventas, por `p_motivo = 'venta'`) se podía pedir exacto:
--   · lo de DENTRO de la tienda es una sola cosa para la base («interno»): una colgada (almacén → piso) y una guardada
--     (piso → almacén) solo se distinguen por el PAR de sububicaciones, y ese par no se podía filtrar ni contar;
--   · «Entradas» trae también las devoluciones y los cambios; «Salidas», las ventas y los traslados; «Traslados», las dos
--     piernas. Un botón «Llegadas» o «Traslados enviados» no puede ser ninguna de esas.
--
-- QUÉ HACE (solo funciones de lectura; no toca ninguna tabla ni política).
-- 1. `fn_movimientos`: `p_categoria` acepta seis valores más —`venta`, `colgada`, `guardada`, `llegada`, `traslado` y `cliente`—.
--    Cada uno es la MISMA lectura que hace la web para dibujar el tipo de una fila (`tipoVisual`, lib/movimientos-tipos.ts):
--      venta     el proceso `venta`;
--      colgada   una fila interna del almacén de tienda al piso de venta; guardada, al revés (el par exacto de
--                sububicaciones que lee `fn_bajadas_del_piso`);
--      llegada   lo que SUMA stock a la sede y no es devolución ni cambio: recepción, producción, stock inicial, y la pierna
--                que LLEGA de un traslado;
--      traslado  lo que se ENVÍA a otra sede (la pierna que sale);
--      cliente   devolución, venta anulada y cambio.
--    `ajuste`, `entrada`, `salida`, `interno` y `transferencia` siguen como estaban (los enlaces viejos siguen valiendo).
--    Misma firma y mismas columnas. Un valor desconocido sigue lanzando el error de siempre.
-- 2. `fn_movimientos_resumen_procesos`: los mismos seis GRUPOS más, con sus operaciones y sus unidades. Una fila cuenta en
--    todos los grupos donde la pantalla la muestra (un cambio, en `cliente`, `entrada` y `salida`), y dentro de un grupo nada se
--    cuenta dos veces.
--
-- Como en 20260927153000, no se copia ninguna función: se reemplaza SOLO el trozo que cambia dentro de la definición VIVA
-- (`pg_temp.reemplazar_una_vez`), así ningún parche en vivo se pierde. Cada reemplazo lleva su marca y por eso se puede
-- pegar dos veces.
--
-- CONTRATO. PROMETE: la lista con `p_categoria = X` trae exactamente las filas que la web dibuja con el tipo X, y la cifra
-- del grupo X cuenta esas mismas. ASUME: el par se lee de `sububicacion_id` (origen) y `sububicacion_destino_id` (destino) de
-- la propia fila, como lo escriben las funciones que bajan prendas al piso y las que las suben al almacén.
--
-- SE ROMPE SI: se agrega un proceso nuevo que suma stock a la sede y NO es una llegada (como las devoluciones): quedaría
-- dentro de «llegada» hasta que se nombre aquí y en `tipoVisual`. O si una función futura escribe un movimiento interno con
-- el par al revés de lo que significa. Lo vigila `pnpm pruebas:movimientos-colgada-y-guardada`, y la web (`tipoVisual`) y esta
-- migración se mantienen juntas: si se cambia una, se cambia la otra.
--
-- ORDEN DE PUBLICACIÓN. Esta migración va ANTES que la web que muestra los botones (o a la vez): la web nueva pide
-- `p_categoria = 'colgada'` y una base sin esta migración responde «Categoría de movimiento desconocida». La web lo cubre
-- (cae a la categoría de siempre y muestra la lista sin el filtro fino), pero las cifras de los botones salen en cero hasta
-- que se pega.
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

-- ---------- 1. La lista: los siete tipos que se ven ----------
select pg_temp.reemplazar_una_vez(
  'retail.fn_movimientos(uuid, date, date, text, text, text, uuid, uuid, timestamp with time zone, uuid, integer, uuid)',
  $viejo$p_categoria not in ('entrada', 'salida', 'interno', 'ajuste', 'transferencia')$viejo$,
  $nuevo$p_categoria not in ('entrada', 'salida', 'interno', 'ajuste', 'transferencia', 'venta', 'colgada', 'guardada', 'llegada', 'traslado', 'cliente') /* ADR-0345: validacion_tipos_visuales */$nuevo$,
  'ADR-0345: validacion_tipos_visuales'
);

select pg_temp.reemplazar_una_vez(
  'retail.fn_movimientos(uuid, date, date, text, text, text, uuid, uuid, timestamp with time zone, uuid, integer, uuid)',
  $viejo$or (p_categoria = 'interno' and m.tipo = 'traslado' and m.ubicacion_id = m.ubicacion_destino_id)$viejo$,
  $nuevo$or (p_categoria = 'interno' and m.tipo = 'traslado' and m.ubicacion_id = m.ubicacion_destino_id)
      or (p_categoria = 'venta' and m.motivo = 'venta') /* ADR-0345: filtro_tipos_visuales */
      or (p_categoria = 'colgada' and m.tipo = 'traslado' and m.ubicacion_id = m.ubicacion_destino_id
            and so.tipo = 'almacen_tienda' and sd.tipo = 'piso_venta')
      or (p_categoria = 'guardada' and m.tipo = 'traslado' and m.ubicacion_id = m.ubicacion_destino_id
            and so.tipo = 'piso_venta' and sd.tipo = 'almacen_tienda')
      or (p_categoria = 'llegada' and (
            (m.tipo = 'entrada' and coalesce(m.motivo, '') not in ('devolucion', 'anulacion_venta', 'cambio'))
            or (m.tipo = 'traslado' and m.ubicacion_id <> m.ubicacion_destino_id and m.ubicacion_destino_id = p_ubicacion_id)
          ))
      or (p_categoria = 'traslado' and (
            (m.tipo = 'salida' and m.motivo = 'traslado_salida')
            or (m.tipo = 'traslado' and m.ubicacion_id <> m.ubicacion_destino_id and m.ubicacion_id = p_ubicacion_id)
          ))
      or (p_categoria = 'cliente' and m.motivo in ('devolucion', 'anulacion_venta', 'cambio'))$nuevo$,
  'ADR-0345: filtro_tipos_visuales'
);

-- ---------- 2. Las cifras: los mismos grupos ----------
select pg_temp.reemplazar_una_vez(
  'retail.fn_movimientos_resumen_procesos(uuid, date, date, text, text, uuid, uuid)',
  $viejo$    left join venta_items vi on vi.id = m.venta_item_id$viejo$,
  $nuevo$    left join venta_items vi on vi.id = m.venta_item_id
    left join sububicaciones so on so.id = m.sububicacion_id /* ADR-0345: sububicaciones_tipos_visuales */
    left join sububicaciones sd on sd.id = m.sububicacion_destino_id$nuevo$,
  'ADR-0345: sububicaciones_tipos_visuales'
);

select pg_temp.reemplazar_una_vez(
  'retail.fn_movimientos_resumen_procesos(uuid, date, date, text, text, uuid, uuid)',
  $viejo$case when m.tipo = 'traslado' and m.ubicacion_id = m.ubicacion_destino_id then 'interno' end,$viejo$,
  $nuevo$case when m.tipo = 'traslado' and m.ubicacion_id = m.ubicacion_destino_id then 'interno' end,
        case when m.motivo = 'venta' then 'venta' end, /* ADR-0345: grupos_tipos_visuales */
        case when m.tipo = 'traslado' and m.ubicacion_id = m.ubicacion_destino_id
               and so.tipo = 'almacen_tienda' and sd.tipo = 'piso_venta'
             then 'colgada' end,
        case when m.tipo = 'traslado' and m.ubicacion_id = m.ubicacion_destino_id
               and so.tipo = 'piso_venta' and sd.tipo = 'almacen_tienda'
             then 'guardada' end,
        case when (m.tipo = 'entrada' and coalesce(m.motivo, '') not in ('devolucion', 'anulacion_venta', 'cambio'))
               or (m.tipo = 'traslado' and m.ubicacion_id <> m.ubicacion_destino_id and m.ubicacion_destino_id = p_ubicacion_id)
             then 'llegada' end,
        case when (m.tipo = 'salida' and m.motivo = 'traslado_salida')
               or (m.tipo = 'traslado' and m.ubicacion_id <> m.ubicacion_destino_id and m.ubicacion_id = p_ubicacion_id)
             then 'traslado' end,
        case when m.motivo in ('devolucion', 'anulacion_venta', 'cambio') then 'cliente' end,$nuevo$,
  'ADR-0345: grupos_tipos_visuales'
);

comment on function retail.fn_movimientos_resumen_procesos(uuid, date, date, text, text, uuid, uuid) is
  'ADR-0234 y ADR-0345: las tarjetas y las cifras de Movimientos leídas desde la tienda. Por (grupo de la pantalla: todos, entrada, salida, transferencia, ajuste, interno y los tipos que se ven: venta, colgada, guardada, llegada, traslado, cliente; proceso): operaciones (lo guardado de una sola vez), filas, y las unidades que ENTRARON a la sede, SALIERON de ella o se MOVIERON entre piso y almacén. Mismo permiso que la lista.';
