-- ============================================================================
-- 20260928120200_bajadas_netear_retiros.sql — CAYLA V2 · ADR-0208 «Frescura del piso» (c) · paso 2 de Frescura 3c ·
-- PARTE 2 de 2. CAMBIO DE CONDUCTA de `fn_bajadas_del_piso`: los retiros se descuentan y la carga inicial se marca.
--
-- EL PROBLEMA PRIMERO. La marca de bajada tardía (ADR-0208) mira el piso de antes y lo vendido en los 10 minutos
-- siguientes. Con «Retirar del piso» (bloque 2) aparecieron dos errores que la base no veía, y con la carga inicial
-- (ADR-0212, ADR-0235) un tercero:
--   1. RETIRO ANTES: se retiran 2 por error y al minuto se corrigen volviendo a bajarlas. La re-bajada ve el piso ya
--      vacío por el retiro: si en 10 minutos se vende una, sale «tardía» y culpa a quien corrigió. Además cuenta 2
--      unidades que nunca se colgaron de nuevo. Ejemplo de ADR-0208 (c): piso 2; 10:00 se retiran 2; 10:01 se
--      reponen 2; 10:05 se vende 1 → hoy dice «tardia».
--   2. RETIRO DESPUÉS: se escanearon 10 y solo cupieron 6; a los 5 minutos se retiran 4. La bajada sigue diciendo 10,
--      y el indicador de confianza (paso 3) dividiría por 4 prendas que nunca estuvieron colgadas.
--   3. CARGA INICIAL: el 26-sep en TRU, 15 de las 40 bajadas (95 de 199 unidades) fueron la carga de lo que ya estaba
--      colgado cuando la tienda pasó al sistema. No dicen nada del hábito del equipo al colgar, y el indicador las
--      contaría como si fueran bajadas del día.
--
-- QUÉ CAMBIA (solo en el núcleo; la puerta `fn_bajadas_del_piso` sigue con el candado de líder):
--   · piso_antes = el nivel MÁS ALTO del piso de esa prenda en [t − ventana, t] (antes: el nivel justo antes). Así un
--     retiro previo no deja el piso «vacío». Excepción: si el nivel justo antes es negativo (stock y libro no
--     cuadran), piso_antes es ese nivel negativo y la fila sigue siendo «dudosa», igual que antes.
--   · retiradas_en_ventana (nueva) = unidades de esa prenda que pasaron del piso al almacén de la misma tienda
--     («Retirar del piso»: el par inverso de la bajada, por estructura como la bajada) en [t − ventana, t + ventana],
--     los dos extremos incluidos.
--   · cantidad_efectiva (nueva) = máximo(0, cantidad − retiradas_en_ventana).
--   · unidades_tardias = mínimo(cantidad_efectiva, máximo(0, vendidas − piso_antes)). Antes se topaba por cantidad.
--   · estado 'corregida' (nuevo) cuando cantidad_efectiva = 0: la bajada se deshizo con un retiro. Orden: dudosa →
--     corregida → tardia → en_curso → normal.
--   · es_carga_inicial (nueva) = hay una ENTRADA con motivo `carga_inicial` de la misma prenda en la misma tienda en el
--     mismo instante. `fn_cargar_stock_inicial` y su bajada (`bajar_al_piso`) van en la misma transacción desde las
--     dos puertas (alta de producto, ADR-0212; Ajustar stock, ADR-0235), y `created_at` es la hora de INICIO de la
--     transacción: el mismo valor exacto. Medido en producción el 2026-09-27: 15 de 15 bajadas de carga del 26-sep.
--   · El libro se lee desde una ventana antes de `p_desde` (antes, desde `p_desde`): una bajada de los primeros
--     minutos del rango también ve su piso de antes y los retiros previos. No cambia ningún nivel: el libro se ancla
--     en el stock de hoy y camina hacia atrás.
-- Las columnas nuevas van AL FINAL: quien lea las de antes por nombre o por posición no cambia.
--
-- CASOS QUE CAMBIAN (pruebas de scripts/pruebas/frescura_bajadas.mjs; los demás casos dan lo mismo):
--   · T6  (baja 10, vende 1, baja 3): la segunda bajada pasa de piso_antes 9 a 10 (la venta de los 3 minutos antes
--     está dentro de la ventana y el nivel más alto era 10). Tardías igual: 0.
--   · T9  (piso→almacén 1 a los 10:00 exactos antes de bajar 1): era «normal» con piso_antes 1; ahora el retiro se
--     descuenta: retiradas 1, efectiva 0, «corregida», piso_antes 2.
--   · T14 (historia mezclada): piso_antes pasa de 4, 5, 7 a 4, 7, 8 (el nivel más alto de cada ventana); el retiro de
--     1 unidad 10 minutos después de la primera bajada y 10 minutos antes de la segunda se descuenta de LAS DOS
--     (efectivas 2, 1 y 1).
--   · El ejemplo de ADR-0208 (c) (retiro por error y re-bajada): de «tardia» a «corregida», 0 tardías (T24).
-- Casos nuevos: T24 (el ejemplo), T25 (10 escaneadas y 4 retiradas → efectiva 6; tope por la efectiva; doble
-- descuento), T26 (carga inicial), T27 (borde del rango), T28 (la misma hora exacta), T22-T23 (las dos guardas).
-- En PRODUCCIÓN (ensayo de solo lectura del 2026-09-27, la lógica de abajo como un `select`, Tienda TRU, 40 bajadas):
-- 0 filas cambian de piso_antes, de estado o de tardías (no hay ningún retiro todavía); 15 salen con
-- es_carga_inicial (95 unidades, todas del 26-sep) y ninguna otra.
--
-- CUÁNTO CUESTA (Postgres 17 desechable, con el libro de 20260928120010; una tienda, 2.000 prendas, 20.001 bajadas y
-- 10.001 ventas a 120 días; mediana de 11 corridas intercaladas): de 304 ms (la 120100) a 358 ms (+18 %); con 4.000
-- retiros más, de 328 a 392 ms (+19 %). El nivel más alto y los retiros salen de ventanas sobre los puntos del libro,
-- ordenados una sola vez, no de joins por rango de tiempo (ver `piso`): con joins, 48 s y 6 s.
--
-- LÍMITES (escritos en ADR-0208):
--   · Un retiro legítimo de la misma prenda dentro de la ventana también se descuenta (no hay forma de distinguirlo
--     hasta el motivo del retiro de 3b).
--   · Un retiro que cae en la ventana de DOS bajadas de la misma prenda se descuenta de las dos (prueba T25).
--   · piso_antes como el nivel más alto también absorbe una venta de los 10 minutos anteriores: si se vendió la última
--     unidad a las 9:58 y a las 10:00 se bajó otra, una venta a las 10:03 ya no marca tardía.
--   · La carga inicial se reconoce por el instante exacto: si alguien la registra en dos transacciones (carga y, aparte,
--     su bajada), no se marca.
--
-- LA GUARDA. Solo sigue si las dos funciones vivas son las de 20260928120100 (núcleo 8d38d6dd6c657ab06b2e8a7c0b66a53b,
-- puerta 34a7e0cc5f421333761e8bda92a582eb) o las de esta misma migración ya pegada (se puede volver a pegar). Con
-- cualquier otro cuerpo aborta sin tocar nada. Sin el núcleo, pide pegar antes la 120100.
--
-- CÓMO SE PEGA EN PRODUCCIÓN. Sola, en el SQL Editor, tal cual (ya trae `retail.`), DESPUÉS de la 20260928120100. Cambia
-- las columnas que devuelven las dos funciones, así que usa `drop function` + `create` (no toma las tablas de auth y
-- storage: ADR-0195) y vuelve a dar los permisos. Sin políticas, sin `drop trigger`, sin `alter` de tablas. Todo en una
-- transacción: nadie ve las funciones a medias. Re-ejecutable.
-- Cómo se verifica después: `select proname, md5(prosrc) from pg_proc where pronamespace = 'retail'::regnamespace and
-- proname like 'fn_bajadas_del_piso%';` da núcleo 20cc705b39b5015bff03e42d93d82b09 y puerta 34a7e0cc5f421333761e8bda92a582eb
-- (el cuerpo de la puerta no cambia, solo sus columnas: mide lo mismo que tras la 120100).
--
-- SE ROMPE SI la carga inicial deja de bajar en la misma transacción que su entrada (es_carga_inicial se apaga sin
-- aviso), o si «Retirar del piso» empieza a devolver a otra sububicación que no sea el almacén de la tienda (el retiro
-- dejaría de descontarse).
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

do $$
declare
  v_nucleo text;
  v_puerta text;
begin
  select md5(p.prosrc) into v_nucleo
    from pg_proc p where p.oid = to_regprocedure('retail.fn_bajadas_del_piso_nucleo(uuid, timestamptz, timestamptz, integer)');
  select md5(p.prosrc) into v_puerta
    from pg_proc p where p.oid = to_regprocedure('retail.fn_bajadas_del_piso(uuid, timestamptz, timestamptz, integer)');
  if v_nucleo is null or v_puerta is null then
    raise exception 'Falta el núcleo de las bajadas: pega antes 20260928120100_bajadas_nucleo.sql';
  end if;
  if not ((v_nucleo = '8d38d6dd6c657ab06b2e8a7c0b66a53b' and v_puerta = '34a7e0cc5f421333761e8bda92a582eb')
       or (v_nucleo = '20cc705b39b5015bff03e42d93d82b09' and v_puerta = '34a7e0cc5f421333761e8bda92a582eb')) then
    raise exception 'fn_bajadas_del_piso o su núcleo cambiaron desde que se escribió esta migración (md5 núcleo %, puerta %; se esperaba 8d38d6dd6c657ab06b2e8a7c0b66a53b y 34a7e0cc5f421333761e8bda92a582eb). Alguien las parchó en vivo: reescribe desde su definición real antes de pegar.', v_nucleo, v_puerta;
  end if;
end $$;

-- Cambian las columnas: primero la puerta (depende del núcleo por nombre), después el núcleo.
drop function if exists retail.fn_bajadas_del_piso(uuid, timestamptz, timestamptz, integer);
drop function if exists retail.fn_bajadas_del_piso_nucleo(uuid, timestamptz, timestamptz, integer);

-- ----------------------------------------------------------------------------
-- 1. El núcleo: netea retiros, piso de antes = el más alto de la ventana, marca la carga inicial
-- ----------------------------------------------------------------------------

create function retail.fn_bajadas_del_piso_nucleo(
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
  estado text,
  retiradas_en_ventana integer,
  cantidad_efectiva integer,
  es_carga_inicial boolean
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
  if p_minutos is null or p_minutos not between 1 and 240 then
    raise exception 'La ventana va de 1 a 240 minutos.';
  end if;
  -- El libro se lee desde p_desde (menos una ventana) hasta AHORA (no hasta p_hasta): el costo lo fija la distancia a hoy.
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
  retiros as materialized (
    -- «Retirar del piso»: el par inverso de la bajada (piso → almacén de la MISMA tienda), por estructura, igual que la
    -- bajada y que Movimientos («Retiro del piso»). Piso → cuarentena no es retiro. Solo los ids: la cantidad y la hora
    -- salen del libro, en `piso`.
    select m.id
      from movimientos m
     where m.ubicacion_id = p_ubicacion_id
       and fn_es_traslado_interno(m.tipo, m.ubicacion_id, m.ubicacion_destino_id)
       and m.sububicacion_id = v_piso
       and m.sububicacion_destino_id = v_alm
       and m.created_at >= v_desde - v_ventana and m.created_at <= v_hasta + v_ventana
  ),
  piso as materialized (
    -- UNA llamada con todas las prendas de las bajadas. Sin bajadas va un arreglo vacío, nunca nulo: nulo le pide al
    -- libro TODAS las prendas de la tienda. Desde una ventana antes de p_desde: la bajada de los primeros minutos del
    -- rango también ve su ventana de antes (los niveles no cambian: el libro se ancla en el stock de hoy).
    -- alto = el nivel más alto en [ts − ventana, ts] hasta este punto incluido, en el orden del libro (created_at, id):
    -- el nivel con que se ENTRÓ a cada punto de esa ventana (nivel − delta). Son dos ventanas porque el marco por
    -- tiempo solo ordena por la hora: la primera toma lo de antes de esta hora exacta, [ts − ventana, ts − 1 µs] (la
    -- hora se guarda en microsegundos), y la segunda, los puntos de la MISMA hora hasta este por id (una misma
    -- transacción).
    -- retiradas = lo que pasó del piso al almacén de esa prenda (`retiros`) en [ts − ventana, ts + ventana], extremos
    -- incluidos: el mismo orden, otra ventana.
    -- Las tres ventanas comparten el orden (prenda, hora), así que Postgres ordena una sola vez. Con joins por rango de
    -- tiempo, el planificador no sabe cuántas filas trae el libro y cruza todo con todo: 48 s (autojoin del piso) y 6 s
    -- (join con 4.000 retiros) contra ≈ 0,35 s así (medido con 20.000 bajadas).
    select pt.oid, pt.variante_id, pt.ts, pt.delta, pt.nivel, pt.es_venta,
           greatest(
             max(pt.nivel - pt.delta) over (partition by pt.variante_id order by pt.ts
                                            range between v_ventana preceding and interval '1 microsecond' preceding),
             max(pt.nivel - pt.delta) over (partition by pt.variante_id, pt.ts order by pt.oid
                                            rows between unbounded preceding and current row)
           )::integer as alto,
           sum(case when pt.oid in (select r.id from retiros r) then -pt.delta else 0 end)
             over (partition by pt.variante_id order by pt.ts
                   range between v_ventana preceding and v_ventana following)::integer as retiradas
      from fn_ledger_puntos(p_ubicacion_id, v_desde - v_ventana,
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
  cargas as materialized (
    -- La carga inicial (ADR-0212, ADR-0235) escribe su entrada «carga_inicial» y su bajada en la MISMA transacción: la
    -- misma prenda en el mismo instante.
    select m.variante_id, m.created_at as t
      from movimientos m
     where m.ubicacion_id = p_ubicacion_id
       and m.tipo = 'entrada' and m.motivo = 'carga_inicial'
       and m.created_at >= v_desde and m.created_at < v_hasta
  ),
  calc as (
    -- Toda bajada tiene su punto en el libro: suma cantidad (> 0 por constraint) al piso de una tienda activa.
    --   el nivel justo antes (nivel − delta) negativo = el stock y el libro no cuadran → «dudosa», con ese nivel;
    --   si no, piso_antes = el más alto de [t − ventana, t] (ver `piso`): un retiro de hace 3 minutos no deja el piso
    --   «vacío».
    select b.id, b.variante_id, b.usuario_id, b.t, b.cantidad,
           (p.nivel - p.delta) < 0 as dudosa,
           (case when (p.nivel - p.delta) < 0 then p.nivel - p.delta else p.alto end)::integer as piso_antes,
           p.retiradas,
           greatest(0, b.cantidad - p.retiradas)::integer as efectiva,
           (b.variante_id, b.t) in (select k.variante_id, k.t from cargas k) as es_carga
      from bajadas b
      join piso p on p.oid = b.id
  )
  select c.id, i.bajada_id, c.variante_id, c.usuario_id, c.t, c.cantidad, c.piso_antes, v.n,
         case when c.dudosa then null else least(c.efectiva, greatest(0, v.n - c.piso_antes))::integer end,
         (c.t + v_ventana <= now()),
         case when c.dudosa then 'dudosa'
              when c.efectiva = 0 then 'corregida'
              when least(c.efectiva, greatest(0, v.n - c.piso_antes)) > 0 then 'tardia'
              when c.t + v_ventana > now() then 'en_curso'
              else 'normal' end,
         c.retiradas,
         c.efectiva,
         c.es_carga
    from calc c
    join vendidas v on v.id = c.id
    left join bajada_piso_items i on i.movimiento_id = c.id
   order by c.t desc, c.id;
end
$fn$;

comment on function retail.fn_bajadas_del_piso_nucleo(uuid, timestamptz, timestamptz, integer) is
  'ADR-0208 (c), paso 2 de Frescura 3c: el cálculo de las bajadas almacén→piso de una tienda, SIN candado. Por bajada: piso_antes (el nivel más alto del piso en [t − ventana, t]; negativo = dudosa), lo vendido desde el piso en la ventana, lo retirado del piso al almacén en [t − ventana, t + ventana], cantidad_efectiva = cantidad − retiradas (mínimo 0), unidades tardías topadas por la efectiva, estado (dudosa, corregida, tardia, en_curso, normal) y es_carga_inicial (entrada carga_inicial de la misma prenda en el mismo instante). Interna: no se otorga a nadie; la llaman funciones security definer que ya decidieron quién mira.';

revoke all on function retail.fn_bajadas_del_piso_nucleo(uuid, timestamptz, timestamptz, integer) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. La puerta: el mismo candado de líder, las columnas nuevas del núcleo
-- ----------------------------------------------------------------------------

create function retail.fn_bajadas_del_piso(
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
  estado text,
  retiradas_en_ventana integer,
  cantidad_efectiva integer,
  es_carga_inicial boolean
)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
set plan_cache_mode = force_custom_plan
as $fn$
begin
  if not fn_es_lider() then
    raise exception 'Solo el líder puede ver cómo se registran las bajadas al piso.' using hint = 'bajadas_solo_lider';
  end if;
  return query select * from fn_bajadas_del_piso_nucleo(p_ubicacion_id, p_desde, p_hasta, p_minutos);
end
$fn$;

comment on function retail.fn_bajadas_del_piso(uuid, timestamptz, timestamptz, integer) is
  'ADR-0208: una fila por bajada almacén→piso de la tienda, con piso_antes, lo vendido desde el piso en la ventana, lo retirado del piso, la cantidad efectiva y las unidades tardías (registradas al cobrar, no al colgar). Derivado al leer; solo líder. Estados: dudosa (stock y libro no cuadran), corregida (un retiro la deshizo), tardia, en_curso, normal. es_carga_inicial marca la bajada de la carga inicial. Es la puerta con candado de retail.fn_bajadas_del_piso_nucleo (paso 2 de Frescura 3c).';

revoke all on function retail.fn_bajadas_del_piso(uuid, timestamptz, timestamptz, integer) from public, anon;
grant execute on function retail.fn_bajadas_del_piso(uuid, timestamptz, timestamptz, integer) to authenticated;

notify pgrst, 'reload schema';
