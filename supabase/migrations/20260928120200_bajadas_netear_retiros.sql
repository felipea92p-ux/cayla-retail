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
-- QUÉ CAMBIA (solo en el núcleo; la puerta `fn_bajadas_del_piso` sigue con el candado de líder). Para cada bajada
-- (tienda, prenda, hora t, cantidad c), con la ventana W = p_minutos (10 por defecto):
--   · RETIRO = lo que pasó del piso al almacén de la MISMA tienda («Retirar del piso»: el par inverso de la bajada, por
--     estructura, como la bajada y como Movimientos). Piso → cuarentena no es retiro.
--   · piso_antes = el nivel del piso justo antes de la bajada (como hoy) + TODO lo retirado del piso de esa prenda en
--     [t − W, t), aunque ese retiro se descuente de otra bajada: el piso de antes describe lo que estaba colgado antes de
--     que alguien lo retirara. Un retiro de la misma hora exacta no suma (en la tienda no pasa: retiro y bajada de la
--     misma prenda nunca van en una transacción). Una VENTA de los minutos previos tampoco: esa prenda ya no estaba. Si
--     el nivel justo antes es negativo (el stock y el libro no cuadran), piso_antes es ese nivel, sin sumar retiros, y
--     la fila sigue «dudosa», como hoy.
--   · Cada retiro se descuenta de UNA sola bajada de la misma prenda: la más cercana en el tiempo, antes o después, a W
--     o menos; si dos quedan a la misma distancia, la de ANTES del retiro; si aún empatan (dos bajadas de la prenda en el
--     mismo instante), la de menor id. Un retiro sin bajada a W o menos no se descuenta de ninguna.
--   · retiradas_en_ventana (nueva) = la suma de los retiros que le tocaron a esa bajada. cantidad_efectiva (nueva) =
--     máximo(0, c − retiradas). Lo que sobra de un retiro más grande que su bajada no pasa a otra.
--   · unidades_tardias = mínimo(cantidad_efectiva, máximo(0, vendidas − piso_antes)). Antes se topaba por cantidad.
--   · estado 'corregida' (nuevo) cuando cantidad_efectiva = 0: la bajada se deshizo con un retiro. Orden: dudosa →
--     corregida → tardia → en_curso → normal.
--   · es_carga_inicial (nueva) = hay una ENTRADA con motivo `carga_inicial` de la misma prenda en la misma tienda en el
--     mismo instante. `fn_cargar_stock_inicial` y su bajada (`bajar_al_piso`) van en la misma transacción desde las
--     dos puertas (alta de producto, ADR-0212; Ajustar stock, ADR-0235), y `created_at` es la hora de INICIO de la
--     transacción: el mismo valor exacto. Medido en producción el 2026-09-27: 15 de 15 bajadas de carga del 26-sep.
--   · Las bajadas y los retiros se leen desde DOS ventanas antes de `p_desde` hasta dos después de `p_hasta` (el libro
--     sigue leyéndose desde `p_desde`, como hoy): una ventana para que la bajada de los primeros minutos del rango vea
--     sus retiros de antes, y otra para que también esté la bajada de fuera del rango que puede disputarle un retiro.
--     Así la misma bajada da la misma fila con cualquier rango que la incluya (prueba T27).
-- Las columnas nuevas van AL FINAL: quien lea las de antes por nombre o por posición no cambia.
--
-- LA REGLA QUE SE DESCARTÓ. La primera versión de este archivo (nunca pegada) tomaba como piso de antes el nivel MÁS
-- ALTO de la ventana y descontaba cada retiro de TODA bajada a W o menos. Lo primero absorbía las ventas de los
-- minutos previos (T6: el piso de antes subía de 9 a 10 por una venta de 3 minutos antes); lo segundo descontaba el
-- mismo retiro dos veces (con bajadas de 2 y 3 y un retiro de 2 entre ellas, las efectivas sumaban 1 y no 3).
--
-- CASOS QUE CAMBIAN respecto de hoy (la 0300, la de producción; pruebas de scripts/pruebas/frescura_bajadas.mjs):
--   · T9  (piso→almacén 1 a los 10:00 exactos antes de bajar 1): era «normal» con piso_antes 1; ahora retiradas 1,
--     efectiva 0, «corregida», piso_antes 2.
--   · T14 (historia mezclada): piso_antes pasa de 4, 5, 7 a 4, 6, 7 (el retiro de −50 cae en [t − 10, t) de la
--     segunda); ese retiro queda a 10 minutos justos de la primera y de la segunda bajada: empate → la de antes del
--     retiro (efectivas 2, 2 y 1).
--   · T24 (el ejemplo de ADR-0208 (c), retiro por error y re-bajada): de «tardia» a «corregida», 0 tardías.
-- Casos nuevos: T24 ampliado (una bajada 5 minutos antes del retiro no se lo lleva: va a la re-bajada, a 1), T25
-- («colgaron menos» y el retiro entre dos bajadas, que va solo a la más cercana), T29 (el empate, el retiro más grande
-- que la bajada, el retiro a 11 minutos, la «dudosa» con retiro, dos bajadas en el mismo instante), T26 (carga inicial,
-- también con dos entradas en el mismo instante), T27 (bordes del rango, con la disputa de una bajada de fuera), T28
-- (la misma hora exacta, también con un retiro), T22-T23 (las dos guardas).
-- En PRODUCCIÓN (ensayo de solo lectura del 2026-09-27: este cuerpo como un `select` sobre Tienda TRU, sin crear nada):
-- 40 bajadas (199 unidades) y ningún retiro en el rango; 0 filas cambian de piso_antes, de estado o de tardías
-- respecto de la 0300; 15 salen con es_carga_inicial (95 unidades, todas del 26-sep) y ninguna otra.
--
-- CUÁNTO CUESTA (Postgres 17 desechable, con el libro de 20260928120010; una tienda, 2.000 prendas, 20.001 bajadas y
-- 10.001 ventas a 120 días; mediana de 9 corridas intercaladas): de 301 ms (la 120100) a 315 ms (+5 %); con 4.001
-- retiros más, de 327 a 355 ms (+9 %). La primera versión (el nivel más alto) costaba 365 y 393 ms.
-- CÓMO, y por qué así: los retiros se cruzan con las bajadas de su prenda a una ventana o menos (`pares`, un cruce por
-- igualdad de prenda con un filtro de hora: los retiros son pocos), y de ahí salen la bajada elegida de cada retiro y
-- lo retirado antes de cada bajada. Todo eso se junta con las bajadas ANTES de cruzarlas con el libro, porque el
-- planificador estima los puntos del libro en UNA fila: cualquier cruce posterior con un conjunto grande podría ir
-- fila por fila (una prueba así tardó 22 s). Con funciones de ventana sobre todos los traslados costaba 420-450 ms.
--
-- LÍMITES (escritos en ADR-0208):
--   · Un retiro legítimo de la misma prenda dentro de la ventana también se descuenta (no hay forma de distinguirlo
--     hasta el motivo del retiro de 3b).
--   · Con varios retiros y re-bajadas de la misma talla en 10 minutos, la corrección puede ir a la bajada equivocada (la
--     más cercana no siempre es la que se corrigió), aunque el total de cantidades efectivas cuadra.
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
-- proname like 'fn_bajadas_del_piso%';` da núcleo 94d587570d8db50cf69c9b6bd982a01e y puerta 34a7e0cc5f421333761e8bda92a582eb
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
       or (v_nucleo = '94d587570d8db50cf69c9b6bd982a01e' and v_puerta = '34a7e0cc5f421333761e8bda92a582eb')) then
    raise exception 'fn_bajadas_del_piso o su núcleo cambiaron desde que se escribió esta migración (md5 núcleo %, puerta %; se esperaba 8d38d6dd6c657ab06b2e8a7c0b66a53b y 34a7e0cc5f421333761e8bda92a582eb). Alguien las parchó en vivo: reescribe desde su definición real antes de pegar.', v_nucleo, v_puerta;
  end if;
end $$;

-- Cambian las columnas: primero la puerta (depende del núcleo por nombre), después el núcleo.
drop function if exists retail.fn_bajadas_del_piso(uuid, timestamptz, timestamptz, integer);
drop function if exists retail.fn_bajadas_del_piso_nucleo(uuid, timestamptz, timestamptz, integer);

-- ----------------------------------------------------------------------------
-- 1. El núcleo: cada retiro a una sola bajada, el piso de antes con lo retirado, la carga inicial marcada
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
  with internos as materialized (
    -- Los traslados entre el almacén y el piso de la MISMA tienda, por estructura (como Movimientos): la bajada
    -- (almacén → piso) y su par inverso, el retiro («Retirar del piso», piso → almacén). Piso ↔ cuarentena no es ni
    -- lo uno ni lo otro. Desde dos ventanas antes del rango hasta dos después: un retiro que toca a una bajada del
    -- rango está a una ventana de ella, y la bajada que puede disputárselo, a una ventana más del retiro.
    select m.id, m.variante_id, m.usuario_id, m.created_at as t, m.cantidad, (m.sububicacion_id = v_alm) as es_bajada
      from movimientos m
     where m.ubicacion_id = p_ubicacion_id
       and fn_es_traslado_interno(m.tipo, m.ubicacion_id, m.ubicacion_destino_id)
       and ((m.sububicacion_id = v_alm and m.sububicacion_destino_id = v_piso)
         or (m.sububicacion_id = v_piso and m.sububicacion_destino_id = v_alm))
       and m.created_at >= v_desde - 2 * v_ventana and m.created_at <= v_hasta + 2 * v_ventana
       and m.variante_id <> c_centinela
  ),
  pares as materialized (
    -- Cada retiro con cada bajada de su prenda a una ventana o menos, antes o después (los dos extremos incluidos).
    -- Casi siempre son pocos: los retiros son raros y una prenda tiene pocas bajadas en 20 minutos.
    select r.id as r_id, r.t as r_t, r.cantidad as q, b.id as b_id, b.t as b_t
      from internos r
      join internos b on b.variante_id = r.variante_id and b.es_bajada
                     and b.t >= r.t - v_ventana and b.t <= r.t + v_ventana
     where not r.es_bajada
  ),
  elegidos as (
    -- La regla: cada retiro se descuenta de UNA sola bajada, la más cercana en el tiempo; si dos quedan a la misma
    -- distancia, la de antes del retiro (su hora <= la del retiro); si aún empatan, la de menor id.
    select distinct on (x.r_id) x.b_id, x.q
      from pares x
     order by x.r_id, greatest(x.b_t - x.r_t, x.r_t - x.b_t), x.b_t > x.r_t, x.b_id
  ),
  asignadas as (
    select e.b_id as id, sum(e.q)::integer as n from elegidos e group by e.b_id
  ),
  antes as (
    -- TODO lo retirado en [t − ventana, t), aunque ese retiro se descuente de otra bajada: es lo que estaba colgado
    -- antes de retirarlo, y se suma al piso de antes.
    select x.b_id as id, sum(x.q)::integer as n from pares x where x.r_t < x.b_t group by x.b_id
  ),
  cargas as materialized (
    -- La carga inicial (ADR-0212, ADR-0235) escribe su entrada «carga_inicial» y su bajada en la MISMA transacción: la
    -- misma prenda en el mismo instante. Una fila por prenda e instante (dos entradas iguales no duplican la bajada).
    select m.variante_id, m.created_at as t
      from movimientos m
     where m.ubicacion_id = p_ubicacion_id
       and m.tipo = 'entrada' and m.motivo = 'carga_inicial'
       and m.created_at >= v_desde and m.created_at < v_hasta
     group by m.variante_id, m.created_at
  ),
  bajadas as materialized (
    -- Las bajadas del rango con lo que les toca de los retiros y la marca de carga, ANTES de cruzarlas con el libro:
    -- cruces por igualdad entre conjuntos que el planificador sabe medir. (Los puntos del libro los estima en una
    -- fila: todo lo que se cruce después de ellos con otro conjunto grande podría ir fila por fila.)
    select i.id, i.variante_id, i.usuario_id, i.t, i.cantidad,
           coalesce(a.n, 0) as retirado_antes, coalesce(s.n, 0) as retiradas, (k.variante_id is not null) as es_carga
      from internos i
      left join antes a on a.id = i.id
      left join asignadas s on s.id = i.id
      left join cargas k on k.variante_id = i.variante_id and k.t = i.t
     where i.es_bajada and i.t >= v_desde and i.t < v_hasta
  ),
  piso as materialized (
    -- UNA llamada al libro con todas las prendas de las bajadas. Sin bajadas va un arreglo vacío, nunca nulo: nulo le
    -- pide al libro TODAS las prendas de la tienda.
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
  calc as (
    -- Toda bajada tiene su punto en el libro: suma cantidad (> 0 por constraint) al piso de una tienda activa.
    --   el nivel justo antes (nivel − delta) negativo = el stock y el libro no cuadran → «dudosa», con ese nivel y sin
    --   sumar retiros; si no, piso_antes = ese nivel + lo retirado en [t − ventana, t).
    select b.id, b.variante_id, b.usuario_id, b.t, b.cantidad,
           (p.nivel - p.delta) < 0 as dudosa,
           (case when (p.nivel - p.delta) < 0 then p.nivel - p.delta
                 else p.nivel - p.delta + b.retirado_antes end)::integer as piso_antes,
           b.retiradas,
           greatest(0, b.cantidad - b.retiradas)::integer as efectiva,
           b.es_carga
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
  'ADR-0208 (c), paso 2 de Frescura 3c: el cálculo de las bajadas almacén→piso de una tienda, SIN candado. Por bajada: piso_antes (el nivel justo antes más lo retirado del piso en [t − ventana, t); negativo = dudosa, sin sumar retiros), lo vendido desde el piso en la ventana, retiradas_en_ventana (cada retiro piso→almacén se descuenta de UNA sola bajada de la prenda: la más cercana a una ventana o menos; empate, la de antes del retiro), cantidad_efectiva = cantidad − retiradas (mínimo 0), unidades tardías topadas por la efectiva, estado (dudosa, corregida, tardia, en_curso, normal) y es_carga_inicial (entrada carga_inicial de la misma prenda en el mismo instante). Interna: no se otorga a nadie; la llaman funciones security definer que ya decidieron quién mira.';

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
  'ADR-0208: una fila por bajada almacén→piso de la tienda, con piso_antes, lo vendido desde el piso en la ventana, lo retirado del piso que le tocó (cada retiro a una sola bajada), la cantidad efectiva y las unidades tardías (registradas al cobrar, no al colgar). Derivado al leer; solo líder. Estados: dudosa (stock y libro no cuadran), corregida (un retiro la deshizo), tardia, en_curso, normal. es_carga_inicial marca la bajada de la carga inicial. Es la puerta con candado de retail.fn_bajadas_del_piso_nucleo (paso 2 de Frescura 3c).';

revoke all on function retail.fn_bajadas_del_piso(uuid, timestamptz, timestamptz, integer) from public, anon;
grant execute on function retail.fn_bajadas_del_piso(uuid, timestamptz, timestamptz, integer) to authenticated;

notify pgrst, 'reload schema';
