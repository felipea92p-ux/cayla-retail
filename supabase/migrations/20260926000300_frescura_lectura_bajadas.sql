-- ============================================================================
-- 20260926000300_frescura_lectura_bajadas.sql — CAYLA V2 · ADR-0208 «Frescura del piso», paso 1 · PARTE 4 de 5
--
-- EL PROBLEMA PRIMERO. Frescura mide cuánto lleva una prenda en el piso desde que se colgó. Ese reloj solo vale si la
-- bajada se registra AL COLGAR; si la colaboradora la registra recién AL COBRAR (la clienta ya la tiene en la mano y la
-- caja dice «agotada» porque el sistema la cree en el almacén), la prenda aparece «recién bajada» cuando en realidad
-- llevaba semanas colgada. Esa bajada tardía no se puede marcar al guardarla —la venta que la delata todavía no
-- existe y `movimientos` es inmutable—, así que se DERIVA al leer.
--
-- QUÉ HACE. `fn_bajadas_del_piso(tienda, desde, hasta, minutos)`: una fila por movimiento de bajada con cuántas de
-- sus unidades fueron tardías. Solo lectura, solo líder, sin pantalla en este paso (su consumidor es el indicador de
-- confianza del paso 3).
--   · Bajada = por ESTRUCTURA, no por motivo: traslado interno de la tienda (`fn_es_traslado_interno`, la misma regla
--     de Movimientos y del libro) del almacén (almacen_tienda) al piso (piso_venta). Cuentan las de `bajar_al_piso`
--     (con su `bajada_id`) y las del botón «Reponer» (`mover_interno`, `bajada_id` nulo). No son bajada:
--     cuarentena→piso, entrada directa al piso, piso→almacén, lo que llega de otra tienda.
--   · EL LIBRO NO SE RECONSTRUYE AQUÍ (ADR-0202): el nivel del piso, qué es un delta, qué es una venta
--     (`fn_es_venta_de_stock`, expuesta como `es_venta`) y el saldo de partida salen de `retail.fn_ledger_puntos`, con
--     UNA sola llamada para todas las prendas de las bajadas (nunca una por prenda: es el N+1 que ese ADR prohíbe).
--   · piso_antes = nivel − delta en el punto de piso cuyo `oid` es el movimiento de la bajada: el piso justo antes.
--   · vendidas_en_ventana: puntos de piso con `es_venta` y delta negativo (la venta salió DEL piso) en
--     [bajada, bajada + minutos], con los dos extremos incluidos. Lo único que esta lectura agrega encima del libro:
--     sin las `prendas_por_regularizar` (regularizar_prenda las fecha en otro momento) y a la hora de la venta,
--     coalesce(ventas.created_at, movimientos.created_at). Una anulada no cuenta, pero su salida y su entrada de
--     anulación sí mueven el piso.
--   · unidades_tardias = mínimo(cantidad bajada, máximo(0, vendidas − piso_antes)): lo vendido en la ventana que el
--     piso de antes no alcanzaba a cubrir se atribuye a esta bajada (ver LÍMITES: no siempre es cierto).
--   · estado: 'dudosa' si piso_antes < 0 (el stock y el libro no cuadran: fuera de cualquier indicador, y
--     unidades_tardias nulo); 'tardia' si hubo unidades tardías; 'en_curso' si la ventana sigue abierta; 'normal'.
--
-- LO QUE CAMBIÓ AL APOYARSE EN fn_ledger_puntos (antes esta función reconstruía el piso por su cuenta; se adoptó el
-- criterio del libro, no el propio):
--   · una transferencia que llega de OTRA tienda directo a este piso (ubicacion_destino_id = la tienda) ahora entra al
--     libro; antes solo se veía a través del stock de hoy, y si llegaba DESPUÉS de la bajada, piso_antes salía inflado
--     (prueba T19);
--   · una tienda inactiva devuelve 0 filas: el libro no reconstruye sedes inactivas (lo mismo hace fn_ledger_timeline).
--   · Lo que NO se subió al libro: la exclusión de `prendas_por_regularizar` vale solo aquí. Si también debe valer para
--     Análisis (fn_es_venta_de_stock), es otra decisión, con su ADR.
--
-- LÍMITES (escritos en ADR-0208): una venta sin conexión se sella con la hora de sincronización (falso negativo);
-- «la clienta pidió otra talla y la trajeron del almacén» no se distingue de registrar al cobrar; una apertura de
-- alta rotación con el piso vacío suma tardías; created_at es la hora de INICIO de la transacción, no la del COMMIT;
-- una ENTRADA al piso dentro de la ventana que no es bajada (una devolución, la anulación de una venta, la prenda que
-- vuelve en un cambio) puede marcar tardía una bajada correcta, porque la fórmula mira el piso de antes y no lo que
-- llegó después (la prueba T18 fija ese comportamiento; cambiar la fórmula es decisión del contrato del paso 3).
--
-- CUÁNTO CUESTA (medido el 2026-09-25 con carga sintética: una tienda, 2.000 prendas, 20.001 bajadas y 10.001 ventas):
-- 120 días ≈ 560 ms y 30 días (el default) ≈ 157 ms; la versión que reconstruía el piso por su cuenta daba ≈ 126 y
-- ≈ 34 ms. Casi todo es el libro: fn_ledger_puntos recorre las dos cubetas (piso y total) y, con un arreglo de 2.000
-- prendas, compara cada fila contra el arreglo entero (`= any` en un plan genérico). Con un semi-join por hash en la
-- función común baja a ≈ 330 ms sin cambiar un resultado; es un cambio del libro, no de esta función.
--
-- EL PASO 4 (FIFO) cambia las ENTRAÑAS de esta función, no su contrato: la firma y las columnas se mantienen.
--
-- SIN ÍNDICE NUEVO: usa `movimientos_ubicacion_fecha_idx` y `movimientos_destino_fecha_idx` (los de fn_ledger_puntos).
-- Si a 120 días pasa de 1 s por tienda, lo primero es el arreglo del libro (arriba), no un índice.
--
-- ORDEN AL PEGAR (cinco partes, cada una sola en el SQL Editor; archivos 20260926000000 a 20260926000400):
--   0000 módulo → 0100 tablas → 0200 funciones de escritura → 0300 lectura de Frescura → publicar la web → 0400
--   («Reposición» ya no toca el piso). La 0400 va DESPUÉS de la web porque su mensaje manda al botón «Bajar al piso» de
--   Existencias, que recién existe con la web publicada.
-- ESTA es la 0300. Depende de la 0100 por `bajada_piso_items` y de 20260924030000 (fn_ledger_puntos, ADR-0202; ya en
-- producción desde el 2026-09-25): si falta, el bloque de abajo lo dice antes de crear nada.
-- Solo `create or replace function`: no toma candados de tablas en uso; se retira con un `drop function`.
-- Producción: pegar tal cual (ya trae `retail.`). Re-ejecutable.
--
-- SE ROMPE SI una venta pasa a descontar de otra sububicación que no sea el piso (dejaría de verse como venta); si
-- fn_ledger_puntos deja de dar un punto de piso por movimiento con su `oid` (piso_antes se queda sin fila); si alguien
-- le pasa a fn_ledger_puntos un arreglo nulo (nulo = TODAS las prendas de la tienda); o si `fn_es_lider` deja de ser
-- el candado cuando exista el módulo Frescura (pasa a fn_ve_modulo('frescura')).
-- ============================================================================

set search_path = retail, public, extensions;

do $$
begin
  if to_regclass('retail.bajada_piso_items') is null then
    raise exception 'Falta bajada_piso_items: pega antes 20260926000100_bajada_piso_tablas.sql';
  end if;
  if to_regclass('retail.prendas_por_regularizar') is null then
    raise exception 'Falta prendas_por_regularizar: pega antes 20260923161700_prendas_por_regularizar.sql';
  end if;
  if to_regprocedure('retail.fn_ledger_puntos(uuid, timestamptz, uuid[])') is null
     or to_regprocedure('retail.fn_es_traslado_interno(text, uuid, uuid)') is null then
    raise exception 'Falta fn_ledger_puntos o fn_es_traslado_interno: pega antes 20260924030000_ledger_fuente_unica.sql (ADR-0202)';
  end if;
  if to_regprocedure('retail.fn_es_lider()') is null then
    raise exception 'Falta fn_es_lider';
  end if;
end $$;

create or replace function retail.fn_bajadas_del_piso(
  p_ubicacion_id uuid,
  p_desde timestamptz default null,
  p_hasta timestamptz default null,
  p_minutos integer default 10
)
returns table (
  movimiento_id uuid,
  bajada_id uuid,
  variante_id uuid,
  persona_id uuid,
  bajada_en timestamptz,
  cantidad integer,
  piso_antes integer,
  vendidas_en_ventana integer,
  unidades_tardias integer,
  cerrada boolean,
  estado text
)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
set plan_cache_mode = force_custom_plan
as $fn$
#variable_conflict use_column
declare
  c_centinela constant uuid := '22222222-2222-4222-8222-222222222222';
  v_piso uuid;
  v_alm uuid;
  v_ventana interval;
  v_desde timestamptz := coalesce(p_desde, now() - interval '30 days');
  v_hasta timestamptz := least(coalesce(p_hasta, now()), now());
begin
  if not fn_es_lider() then
    raise exception 'Solo el líder puede ver cómo se registran las bajadas al piso.' using hint = 'bajadas_solo_lider';
  end if;
  if p_minutos is null or p_minutos not between 1 and 240 then
    raise exception 'La ventana va de 1 a 240 minutos.';
  end if;
  -- El libro se lee desde p_desde hasta AHORA (no hasta p_hasta): el costo lo fija la distancia a hoy.
  if v_desde < now() - interval '120 days' then
    raise exception 'El rango máximo es de 120 días.';
  end if;
  v_ventana := make_interval(mins => p_minutos);

  select s.id into v_piso from sububicaciones s where s.ubicacion_id = p_ubicacion_id and s.tipo = 'piso_venta';
  select s.id into v_alm from sububicaciones s where s.ubicacion_id = p_ubicacion_id and s.tipo = 'almacen_tienda';
  -- Taller, tienda que aún no separa piso y almacén, o tienda inactiva (el libro no la reconstruye): no hay bajadas
  -- que leer, y no es un error.
  if v_piso is null or v_alm is null or v_hasta <= v_desde
     or not exists (select 1 from ubicaciones u where u.id = p_ubicacion_id and u.activo) then
    return;
  end if;

  return query
  with bajadas as (
    select m.id, m.variante_id, m.usuario_id, m.created_at as t, m.cantidad
      from movimientos m
     where m.ubicacion_id = p_ubicacion_id
       and fn_es_traslado_interno(m.tipo, m.ubicacion_id, m.ubicacion_destino_id)
       and m.sububicacion_id = v_alm
       and m.sububicacion_destino_id = v_piso
       and m.created_at >= v_desde and m.created_at < v_hasta
       and m.variante_id <> c_centinela
  ),
  piso as (
    -- UNA llamada con todas las prendas de las bajadas. Sin bajadas va un arreglo vacío, nunca nulo: nulo le pide al
    -- libro TODAS las prendas de la tienda.
    select pt.oid, pt.variante_id, pt.delta, pt.nivel, pt.es_venta
      from fn_ledger_puntos(p_ubicacion_id, v_desde,
                            (select coalesce(array_agg(distinct b.variante_id), '{}'::uuid[]) from bajadas b)) pt
     where pt.bucket = 'piso' and pt.ord = 1
  ),
  ventas_piso as materialized (
    -- En el cubo del piso, delta negativo = la salida fue DEL piso (una venta desde el almacén no deja punto aquí).
    select p.variante_id, coalesce(ve.created_at, m.created_at) as t_venta, (-p.delta)::integer as cantidad
      from piso p
      join movimientos m on m.id = p.oid
      left join venta_items vi on vi.id = m.venta_item_id
      left join ventas ve on ve.id = vi.venta_id
     where p.es_venta and p.delta < 0
       and not exists (select 1 from prendas_por_regularizar pr where pr.venta_item_id = m.venta_item_id)
  ),
  vendidas as (
    select b.id, coalesce(sum(vp.cantidad), 0)::integer as n
      from bajadas b
      left join ventas_piso vp on vp.variante_id = b.variante_id and vp.t_venta >= b.t and vp.t_venta <= b.t + v_ventana
     group by b.id
  ),
  antes as (
    -- Toda bajada tiene su punto: suma cantidad (> 0 por constraint) al piso de una tienda activa.
    select b.id, (p.nivel - p.delta)::integer as piso_antes
      from bajadas b
      join piso p on p.oid = b.id
  )
  select b.id, i.bajada_id, b.variante_id, b.usuario_id, b.t, b.cantidad, a.piso_antes, v.n,
         case when a.piso_antes < 0 then null else least(b.cantidad, greatest(0, v.n - a.piso_antes))::integer end,
         (b.t + v_ventana <= now()),
         case when a.piso_antes < 0 then 'dudosa'
              when least(b.cantidad, greatest(0, v.n - a.piso_antes)) > 0 then 'tardia'
              when b.t + v_ventana > now() then 'en_curso'
              else 'normal' end
    from bajadas b
    join antes a on a.id = b.id
    join vendidas v on v.id = b.id
    left join bajada_piso_items i on i.movimiento_id = b.id
   order by b.t desc, b.id;
end
$fn$;

comment on function retail.fn_bajadas_del_piso(uuid, timestamptz, timestamptz, integer) is
  'ADR-0208: una fila por bajada almacén→piso de la tienda, con piso_antes, lo vendido desde el piso en la ventana y las unidades tardías (registradas al cobrar, no al colgar). Derivado al leer; solo líder. Estado dudosa = stock y libro no cuadran. Las entrañas descansan en retail.fn_ledger_puntos (ADR-0202): piso_antes, deltas y es_venta salen del libro único con una sola llamada; aquí solo se agrega que la venta salga del piso, sin prendas por regularizar, a la hora de la venta.';

revoke all on function retail.fn_bajadas_del_piso(uuid, timestamptz, timestamptz, integer) from public, anon;
grant execute on function retail.fn_bajadas_del_piso(uuid, timestamptz, timestamptz, integer) to authenticated;

notify pgrst, 'reload schema';
