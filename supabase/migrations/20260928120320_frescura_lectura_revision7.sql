-- ============================================================================
-- 20260928120320_frescura_lectura_revision7.sql — CAYLA V2 · ADR-0208 «Frescura del piso» · paso 3 de Frescura 3c,
-- las dos decisiones de Felipe de la revisión 7 (2026-09-27, noche) sobre la lectura de una tienda. Solo
-- `create or replace function retail.fn_frescura_sede`: no crea tablas, módulos ni funciones nuevas.
--
-- POR QUÉ UN ARCHIVO NUEVO. `20260928120310` ya está en main (PR #544, fusionado el 2026-09-28): la regla de la revisión 4
-- dice que una migración que está en main no se edita en su lugar (una base que ya la corrió no vuelve a leerla, y quien
-- pegue la versión de main quedaría con una guarda que no reconoce la corregida). Esto se pega DESPUÉS de 20260928120310.
--
-- QUÉ CAMBIA (el detalle, con DECIDÍ / DESCARTÉ / SE ROMPE SI, en ADR-0208, «Revisión 7 del paso 3»):
--   1. La llegada a CAYLA que cuenta para la temporada (pregunta 7 de la revisión 6, DECIDIDA por Felipe el 2026-09-27):
--      la carga inicial solo cuenta si el modelo+color NO tiene lote ni producción; entre varias cargas iniciales manda la
--      PRIMERA. La carga inicial no es mercadería que llega: es stock que ya estaba y el sistema recién conoce (ADR-0248).
--      Antes, la ÚLTIMA llegada a CAYLA de cualquier clase: el bikini que llegó por lote en enero dejaba de avisar
--      «Temporada pasada» en TODAS las sedes apenas AQP o LIM (0 movimientos hoy) cargaban una talla al incorporarse. El
--      campo sigue llamándose `ultima_llegada_cayla` (es la llegada a CAYLA que manda: la última por lote o producción;
--      sin ninguna, la primera carga).
--   2. Lo apartado para una clienta no está colgado (R7-1, DECIDIDA por Felipe el 2026-09-27). `apartar` sube
--      `stock.cantidad_apartada` y no baja `cantidad` (ADR-0141), así que el piso contaba lo que ya tiene dueña: una
--      separación de 50 días salía Crítica, quieta y con «cambiar de lugar», igual que su gemela libre.
--        · `piso_hoy` y `almacen_hoy` son lo LIBRE (sin lo apartado); `apartadas_hoy` es lo apartado de la prenda en la
--          tienda (piso y almacén, sin cuarentena), para que la pantalla lo diga.
--        · `apartados` (nuevo, al lado de `eventos`): por prenda, [ts, delta] de lo apartado EN EL PISO, con el signo de lo
--          que cambia lo libre (apartar resta, liberar suma), y el saldo con que arranca la ventana primero, a la hora de
--          `desde` (lo apartado hoy menos lo que la ventana apartó y liberó: la misma ancla en `stock` que usa el libro).
--          La web lo resta de lo libre para el reloj de novedad (una prenda con todo lo colgado apartado no envejece), y
--          para la vara, la rapidez y las ventas recientes lo lee como una VENTA desde que se apartó (lo que sigue apartado
--          o se entregó) o como una PAUSA (lo que se liberó sin venderse): `eventosConApartados` de
--          `apps/web/lib/frescura-reglas.ts` (revisión 8). La base solo entrega los puntos; esa lectura es de la web.
--      Es la misma regla que ya usa la herramienta de retiro de este ADR (el tope es el piso neto de lo apartado).
--
-- CUÁNTO CUESTA (la carga sintética de siempre: una tienda, 2.000 prendas en 200 modelos con temporada, 20.000 bajadas,
-- 10.000 ventas; medido el 2026-09-27 contra 20260928120310 en la misma base): ver ADR-0208, «Revisión 7 del paso 3». La
-- lectura de lo apartado es una búsqueda por el índice de tienda y fecha (`movimientos_ubicacion_fecha_idx`), como la
-- del libro, y lo de hoy sale de las mismas filas de `stock` que ya se leían.
--
-- LA GUARDA. Pide 20260928120310 ya pegada: las funciones que esto usa y no reescribe (`fn_es_llegada`,
-- `fn_es_llegada_a_cayla`, `fn_temporada_efectiva_nucleo`) con su cuerpo, y `fn_frescura_sede` con el de 20260928120310
-- (`51babffc…`) o el de este archivo. Con el de 20260928120300 (`644e1012…`) aborta pidiendo pegar antes la 120310; con
-- otro, aborta sin tocar nada (alguien la parchó en vivo y pegar esto borraría el parche: lo que rompió Análisis con el
-- PR 397). Se puede pegar dos veces. Al revés también es seguro: con esta ya pegada, volver a pegar 20260928120310 (o
-- 20260928120300) aborta, porque su guarda no conoce este cuerpo, y no deshace nada.
--
-- CÓMO SE PEGA EN PRODUCCIÓN. Sola, en el SQL Editor, tal cual (ya trae `retail.`), a cualquier hora, DESPUÉS de
-- 20260928120300 y 20260928120310. Solo `create or replace function`, un comentario, `revoke` y `grant`: sin políticas,
-- sin `drop trigger`, sin `alter` de tablas (ADR-0195). Ninguna pantalla la llama todavía.
-- Cómo se verifica después (solo lectura):
--   select proname, md5(prosrc) from pg_proc where pronamespace = 'retail'::regnamespace
--    and proname in ('fn_es_llegada', 'fn_es_llegada_a_cayla', 'fn_frescura_sede', 'fn_confianza_registro',
--                    'fn_temporada_efectiva_nucleo', 'fn_temporada_efectiva');
-- da el md5 NUEVO de fn_frescura_sede de la guarda de abajo y los otros cinco de 20260928120310, sin cambio.
--
-- SE ROMPE SI (lo nuevo; lo de antes sigue en 20260928120300 y 20260928120310):
--   · de la 1: una prenda que de verdad volvió a llegar de afuera se registra como carga inicial. Su estación no vuelve a
--     empezar y avisa «Temporada pasada» antes de tiempo. Es poco probable: la carga inicial es una vez por tienda y talla.
--   · de la 2: alguien aparta en una sububicación que no es la de la unidad (hoy imposible: `fn_aplicar_movimiento` valida
--     lo apartado contra la MISMA fila de stock), o `stock.cantidad_apartada` deja de cuadrar con los movimientos
--     (`fn_verificar_apartados` lo dice): el saldo con que arranca la ventana saldría corrido.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

do $$
declare
  v_md5 text;
begin
  if to_regprocedure('retail.fn_ledger_puntos(uuid, timestamptz, uuid[])') is null then
    raise exception 'Falta retail.fn_ledger_puntos: pega antes 20260924030000 y 20260928120010.';
  end if;
  if not coalesce((select 'es_carga_inicial' = any(p.proargnames) from pg_proc p
                    where p.oid = to_regprocedure('retail.fn_bajadas_del_piso_nucleo(uuid, timestamptz, timestamptz, integer)')), false) then
    raise exception 'Falta el núcleo de las bajadas con es_carga_inicial: pega antes 20260928120100 y 20260928120200.';
  end if;
  if to_regprocedure('retail.fn_ocurrencia_temporada(text, timestamptz)') is null
     or to_regprocedure('retail.fn_temporadas()') is null then
    raise exception 'Faltan las temporadas (ADR-0246): pega antes 20260928100000_temporadas_como_atributo.sql.';
  end if;
  -- Lo que esto usa y no reescribe, con el cuerpo de 20260928120300 (fn_es_llegada) y de 20260928120310 (las otras dos).
  select md5(p.prosrc) into v_md5 from pg_proc p
   where p.oid = to_regprocedure('retail.fn_es_llegada(text, text, uuid, uuid, uuid)');
  if v_md5 is null then
    raise exception 'Falta retail.fn_es_llegada: pega antes 20260928120300_frescura_lectura.sql y 20260928120310_frescura_lectura_revision3.sql.';
  end if;
  if v_md5 <> '5089ba50874f611d96d5df751b63ed57' then
    raise exception 'fn_es_llegada tiene otro cuerpo (md5 %): alguien la cambió en vivo. Reescribe desde su definición real antes de pegar.', v_md5;
  end if;
  select md5(p.prosrc) into v_md5 from pg_proc p
   where p.oid = to_regprocedure('retail.fn_es_llegada_a_cayla(text, text, uuid, uuid, uuid)');
  if v_md5 is null then
    raise exception 'Falta retail.fn_es_llegada_a_cayla: pega antes 20260928120310_frescura_lectura_revision3.sql.';
  end if;
  if v_md5 <> '7e1ffb6d9853027ec685fef46ec72a4c' then
    raise exception 'fn_es_llegada_a_cayla tiene otro cuerpo (md5 %): alguien la cambió en vivo. Reescribe desde su definición real antes de pegar.', v_md5;
  end if;
  select md5(p.prosrc) into v_md5 from pg_proc p
   where p.oid = to_regprocedure('retail.fn_temporada_efectiva_nucleo(uuid, boolean)');
  if v_md5 is null then
    raise exception 'Falta retail.fn_temporada_efectiva_nucleo: pega antes 20260928120310_frescura_lectura_revision3.sql.';
  end if;
  if v_md5 <> '2bf80eb239248cce88cf8062238f4dfc' then
    raise exception 'fn_temporada_efectiva_nucleo tiene otro cuerpo (md5 %): alguien la cambió en vivo. Reescribe desde su definición real antes de pegar.', v_md5;
  end if;
  -- La que se reescribe: el cuerpo de 20260928120310 o el de este archivo. Nunca otro.
  select md5(p.prosrc) into v_md5 from pg_proc p
   where p.oid = to_regprocedure('retail.fn_frescura_sede(uuid, integer)');
  if v_md5 is null then
    raise exception 'Falta retail.fn_frescura_sede: pega antes 20260928120300_frescura_lectura.sql y 20260928120310_frescura_lectura_revision3.sql.';
  end if;
  if v_md5 = '644e10126796adc1111702290c14f2bb' then
    raise exception 'fn_frescura_sede es la de 20260928120300: pega antes 20260928120310_frescura_lectura_revision3.sql.';
  end if;
  if v_md5 not in ('51babffc09da4073691ee251882967c8', '7da85d7b7010659ba5a36a2478c89ad4') then
    raise exception 'fn_frescura_sede tiene otro cuerpo (md5 %): no es la de 20260928120310 ni la de este archivo; alguien la cambió en vivo. Reescribe desde su definición real antes de pegar.', v_md5;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- La lectura de una tienda (la de 20260928120310 con la llegada a CAYLA de la pregunta 7 y lo apartado de R7-1)
-- ----------------------------------------------------------------------------

create or replace function retail.fn_frescura_sede(p_ubicacion_id uuid, p_dias integer default 120)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
set plan_cache_mode = force_custom_plan
as $fn$
declare
  c_centinela constant uuid := '22222222-2222-4222-8222-222222222222';          -- «Prenda sin registrar» (variante)
  c_producto_centinela constant uuid := '11111111-1111-4111-8111-111111111111'; -- y su producto
  v_ahora timestamptz := now();
  v_desde timestamptz;
  v_piso uuid;
  v_alm uuid;
  v_ids uuid[];
  v_carga jsonb;
  v_tardias jsonb;
  v_dudosas jsonb;
  v_eventos jsonb;
  v_apartados jsonb;
  v_prendas jsonb;
begin
  if not (fn_es_lider() and fn_puede_operar_ubicacion(p_ubicacion_id)) then
    raise exception 'Solo el líder puede ver la frescura del piso de esta sede.' using hint = 'frescura_sin_permiso';
  end if;
  if p_dias is null or p_dias not between 1 and 120 then
    raise exception 'La ventana va de 1 a 120 días.';
  end if;
  v_desde := v_ahora - make_interval(days => p_dias);

  select s.id into v_piso from sububicaciones s where s.ubicacion_id = p_ubicacion_id and s.tipo = 'piso_venta';
  select s.id into v_alm from sububicaciones s where s.ubicacion_id = p_ubicacion_id and s.tipo = 'almacen_tienda';
  -- El Taller, una tienda que aún no separa piso y almacén, una inactiva (el libro no la reconstruye) o una que no existe:
  -- no hay piso que mirar, y no es un error.
  if v_piso is null or v_alm is null
     or not exists (select 1 from ubicaciones u where u.id = p_ubicacion_id and u.activo) then
    return jsonb_build_object('separa_piso', false);
  end if;

  -- QUÉ PRENDAS: stock distinto de 0 hoy fuera de la cuarentena, o algún movimiento de la tienda en la ventana. Sin la
  -- «Prenda sin registrar» ni productos de prueba. Nunca nulo: el libro con nulo lee otra cosa (solo lo que se movió).
  -- Una prenda con todo apartado sigue en la lista (su stock no es 0): la pantalla la muestra como apartada.
  select coalesce(array_agg(i.variante_id), '{}'::uuid[]) into v_ids
    from (
      select s.variante_id
        from stock s
        left join sububicaciones su on su.id = s.sububicacion_id
       where s.ubicacion_id = p_ubicacion_id and s.cantidad <> 0 and su.tipo is distinct from 'cuarentena'
      union
      select m.variante_id
        from movimientos m
       where m.ubicacion_id = p_ubicacion_id and m.created_at >= v_desde
         and m.tipo in ('entrada', 'salida', 'ajuste', 'traslado')
      union
      select m.variante_id
        from movimientos m
       where m.ubicacion_destino_id = p_ubicacion_id and m.created_at >= v_desde and m.tipo = 'traslado'
    ) i
    join variantes v on v.id = i.variante_id
    join productos p on p.id = v.producto_id
   where i.variante_id <> c_centinela and p.id <> c_producto_centinela and not p.es_prueba;

  -- UNA llamada al núcleo de las bajadas (paso 2): las de carga inicial (para la marca 4), las tardías cerradas y las
  -- prendas «dudosas». Las bajadas se leen por id (mapa jsonb), no cruzando dos conjuntos calculados.
  select coalesce(jsonb_object_agg(n.movimiento_id, true) filter (where n.es_carga_inicial), '{}'::jsonb),
         coalesce(jsonb_agg(jsonb_build_object('oid', n.movimiento_id, 'variante_id', n.variante_id,
                                               'bajada_en', n.bajada_en, 'unidades_tardias', n.unidades_tardias)
                            order by n.bajada_en, n.movimiento_id)
                    filter (where n.cerrada and n.estado not in ('dudosa', 'corregida') and n.unidades_tardias > 0),
                  '[]'::jsonb),
         coalesce(jsonb_agg(distinct n.variante_id) filter (where n.estado = 'dudosa'), '[]'::jsonb)
    into v_carga, v_tardias, v_dudosas
    from fn_bajadas_del_piso_nucleo(p_ubicacion_id, v_desde, null) n
   where n.variante_id in (select unnest(v_ids));

  -- UNA llamada al libro (ADR-0202) con la lista de prendas: sus puntos de PISO, con las marcas. La 4 de lo que no es
  -- interno se decide con una búsqueda por id en `movimientos`, solo para esos puntos (pocos: ajustes, devoluciones,
  -- llegadas directo al piso).
  select coalesce(jsonb_object_agg(e.variante_id, e.eventos), '{}'::jsonb) into v_eventos
    from (
      select p.variante_id,
             jsonb_agg(jsonb_build_array(p.ts, p.delta, p.marcas, p.oid) order by p.ts, p.ord, p.oid) as eventos
        from (
          select pt.variante_id, pt.ts, pt.ord, pt.oid, pt.delta,
                 (case when pt.es_venta then 1 else 0 end)
               + (case when pt.es_interno then 2 else 0 end)
               + (case when pt.delta <= 0 then 0
                       when pt.ord = 0 then 4                                        -- el saldo con que arranca la ventana
                       when pt.es_interno then case when v_carga ? pt.oid::text then 4 else 0 end  -- bajada de carga inicial
                       when coalesce((select not fn_es_llegada(m.tipo, m.motivo, m.lote_id, m.produccion_id, m.transferencia_recepcion_id)
                                             or coalesce(m.motivo = 'carga_inicial', false)
                                        from movimientos m where m.id = pt.oid), true) then 4
                       else 0 end) as marcas
            from fn_ledger_puntos(p_ubicacion_id, v_desde, v_ids) pt
           where pt.bucket = 'piso' and (pt.ord = 1 or pt.delta <> 0)
        ) p
       group by p.variante_id
    ) e;

  -- LO APARTADO EN EL PISO (R7-1, Felipe 2026-09-27): lo apartado para una clienta ya tiene dueña y no está colgado. Por
  -- prenda, [ts, delta] con el signo de lo que cambia lo LIBRE del piso: apartar resta, liberar suma (también al
  -- entregar: la liberación y la venta van juntas). El saldo con que arranca la ventana va primero, a la hora de `desde`:
  -- lo apartado hoy en el piso menos lo que se apartó (y más lo que se liberó) dentro de la ventana, la misma ancla en
  -- `stock` que usa el libro. La web lo resta de lo libre para el reloj, y para la vara y la rapidez lo lee como venta
  -- desde que se apartó o como pausa (`eventosConApartados`, revisión 8).
  -- La lista de prendas se mira con `= any(v_ids)` y no con `in (select unnest(v_ids))` (el cambio de 20260928120010 para
  -- el libro): aquí las filas que llegan al filtro son pocas (solo apartados del piso, solo stock con algo apartado) y la
  -- semiunión se rearmaba por fila: 44 ms contra 6 con 2.016 prendas y 250 movimientos de apartado (2026-09-27).
  with ventana as (
    select m.variante_id, m.created_at as ts, m.id as oid,
           case m.tipo when 'apartado' then -m.cantidad else m.cantidad end as delta
      from movimientos m
     where m.ubicacion_id = p_ubicacion_id and m.created_at >= v_desde
       and m.sububicacion_id = v_piso and m.tipo in ('apartado', 'liberacion_apartado')
       and m.variante_id = any(v_ids)
  ),
  saldo as (
    select coalesce(h.variante_id, w.variante_id) as variante_id,
           -(coalesce(h.apartadas, 0) + coalesce(w.neto, 0)) as delta
      from (select s.variante_id, s.cantidad_apartada as apartadas
              from stock s
             where s.ubicacion_id = p_ubicacion_id and s.sububicacion_id = v_piso and s.cantidad_apartada <> 0
               and s.variante_id = any(v_ids)) h
      full join (select x.variante_id, sum(x.delta) as neto from ventana x group by x.variante_id) w
             on w.variante_id = h.variante_id
  ),
  puntos as (
    select s.variante_id, v_desde as ts, 0 as ord, null::uuid as oid, s.delta from saldo s where s.delta <> 0
    union all
    select x.variante_id, x.ts, 1, x.oid, x.delta from ventana x where x.delta <> 0
  )
  select coalesce(jsonb_object_agg(a.variante_id, a.puntos), '{}'::jsonb) into v_apartados
    from (select pu.variante_id, jsonb_agg(jsonb_build_array(pu.ts, pu.delta) order by pu.ts, pu.ord, pu.oid) as puntos
            from puntos pu
           group by pu.variante_id) a;

  -- Las prendas: catálogo, stock de hoy e historia de la tienda por búsquedas por índice (una por prenda); la historia de
  -- cada modelo+color por búsquedas por índice (una por modelo+color); la temporada, si es clásica, el fin de su
  -- aparición y si hoy es su estación, de mapas de una fila.
  with u as (
    select v.id as variante_id, v.producto_id, p.referencia, v.codigo, v.color_codigo, co.nombre as color_nombre,
           ta.valor as talla, p.categoria_id, c.nombre as categoria_nombre
      from variantes v
      join productos p on p.id = v.producto_id
      left join categorias c on c.id = p.categoria_id
      left join tallas ta on ta.id = v.talla_id
      left join colores co on co.codigo = v.color_codigo
     where v.id in (select unnest(v_ids))
  ),
  temporada_de as (
    -- La temporada de cada modelo+color (ADR-0246: color → producto → categoría), por clave.
    select coalesce(jsonb_object_agg(t.producto_id::text || '|' || coalesce(t.color_codigo, ''),
                                     jsonb_build_array(t.temporada, t.origen)), '{}'::jsonb) as m
      from fn_temporada_efectiva_nucleo(null, true) t
     where t.temporada is not null
  ),
  catalogo as (
    select coalesce(jsonb_object_agg(t.clave, t.es_clasico), '{}'::jsonb) as clasico from fn_temporadas() t
  ),
  hoy_es_su_estacion as (
    -- Por temporada con estación (9 como mucho): ¿hoy cae dentro de alguna de sus apariciones?
    select coalesce(jsonb_object_agg(t.clave, oc.desde <= v_ahora and (oc.hasta is null or v_ahora < oc.hasta)), '{}'::jsonb) as m
      from fn_temporadas() t
      cross join lateral fn_ocurrencia_temporada(t.clave, v_ahora) oc
  ),
  modelos as (
    -- Cada modelo+color de la lista, una vez, con su clave.
    select distinct u.producto_id, u.color_codigo, u.producto_id::text || '|' || coalesce(u.color_codigo, '') as clave
      from u
  ),
  primera_de as (
    -- La primera exhibición es del MODELO+COLOR (ADR-0208, decisiones 4 y 9: la novedad es del modelo+color y es una
    -- sola vez por tienda): la primera vez que CUALQUIERA de sus tallas entró al piso de esta tienda, esté o no en la
    -- lista (una talla agotada antes de la ventana no está, y su exhibición sí cuenta). Una búsqueda por modelo+color
    -- distinto (variantes por producto, movimientos por variante), que después se lee por clave.
    select coalesce(jsonb_object_agg(x.clave, pe.primera), '{}'::jsonb) as m
      from modelos x
      cross join lateral (
        select min(m.created_at) as primera
          from variantes v2
          join movimientos m on m.variante_id = v2.id
         where v2.producto_id = x.producto_id
           and v2.color_codigo is not distinct from x.color_codigo
           and ((m.ubicacion_id = p_ubicacion_id and m.sububicacion_id = v_piso
                 and (m.tipo = 'entrada' or (m.tipo = 'ajuste' and m.cantidad > 0)))
                or (m.tipo = 'traslado' and m.ubicacion_destino_id = p_ubicacion_id and m.sububicacion_destino_id = v_piso))
      ) pe
     where pe.primera is not null
  ),
  llegada_cayla_de as (
    -- La llegada A CAYLA del modelo+color que cuenta para su temporada, de cualquiera de sus tallas (esté o no en la
    -- lista, activa o no) en CUALQUIER sede (`fn_es_llegada_a_cayla`; la recepción de un traslado no cuenta: D1, Felipe
    -- 2026-09-27). La ÚLTIMA por lote (o recepción de compra) o producción del Taller; si el modelo+color no tiene
    -- ninguna, la PRIMERA carga inicial (pregunta 7 de la revisión 6, Felipe 2026-09-27): la carga es stock que ya estaba,
    -- y la de AQP o LIM al incorporarse no le reinicia la estación a lo que llegó de verdad. La novedad («Nueva») sigue
    -- siendo de esta tienda (`primera_de`): son dos preguntas distintas.
    select coalesce(jsonb_object_agg(x.clave, lc.llegada), '{}'::jsonb) as m
      from modelos x
      cross join lateral (
        select coalesce(max(m.created_at) filter (where m.lote_id is not null or m.produccion_id is not null),
                        min(m.created_at) filter (where m.lote_id is null and m.produccion_id is null)) as llegada
          from variantes v2
          join movimientos m on m.variante_id = v2.id
         where v2.producto_id = x.producto_id
           and v2.color_codigo is not distinct from x.color_codigo
           and fn_es_llegada_a_cayla(m.tipo, m.motivo, m.lote_id, m.produccion_id, m.transferencia_recepcion_id)
      ) lc
     where lc.llegada is not null
  ),
  base as materialized (
    select u.*,
           st.piso - st.apartadas_piso as piso_libre,
           (st.total - st.piso) - (st.apartadas - st.apartadas_piso) as almacen_libre,
           st.apartadas,
           ((select pd.m from primera_de pd) ->> (u.producto_id::text || '|' || coalesce(u.color_codigo, '')))::timestamptz
             as primera_exhibicion,
           h.ultima_llegada,
           ((select lc.m from llegada_cayla_de lc) ->> (u.producto_id::text || '|' || coalesce(u.color_codigo, '')))::timestamptz
             as ultima_llegada_cayla,
           tp.par ->> 0 as temporada, tp.par ->> 1 as temporada_origen
      from u
      left join lateral (
        -- Lo de hoy en esta tienda: el piso y el total sin la cuarentena, y lo apartado de cada uno (R7-1).
        select coalesce(sum(s.cantidad) filter (where su.tipo = 'piso_venta'), 0)::integer as piso,
               coalesce(sum(s.cantidad_apartada) filter (where su.tipo = 'piso_venta'), 0)::integer as apartadas_piso,
               coalesce(sum(s.cantidad) filter (where su.tipo is distinct from 'cuarentena'), 0)::integer as total,
               coalesce(sum(s.cantidad_apartada) filter (where su.tipo is distinct from 'cuarentena'), 0)::integer as apartadas
          from stock s
          left join sububicaciones su on su.id = s.sububicacion_id
         where s.variante_id = u.variante_id and s.ubicacion_id = p_ubicacion_id
      ) st on true
      left join lateral (
        -- Toda la historia de esta talla en ESTA tienda: su última llegada.
        select max(m.created_at) as ultima_llegada
          from movimientos m
         where m.variante_id = u.variante_id
           and m.ubicacion_id = p_ubicacion_id
           and fn_es_llegada(m.tipo, m.motivo, m.lote_id, m.produccion_id, m.transferencia_recepcion_id)
      ) h on true
      cross join lateral (
        select (select td.m from temporada_de td) -> (u.producto_id::text || '|' || coalesce(u.color_codigo, '')) as par
      ) tp
  ),
  fin_de as (
    -- El fin de la aparición de su temporada que corresponde a su llegada A CAYLA: una llamada por pareja distinta.
    select coalesce(jsonb_object_agg(x.clave, oc.hasta), '{}'::jsonb) as m
      from (select distinct b.temporada || '|' || b.ultima_llegada_cayla::text as clave, b.temporada, b.ultima_llegada_cayla
              from base b
             where b.temporada is not null and b.ultima_llegada_cayla is not null) x
      cross join lateral fn_ocurrencia_temporada(x.temporada, x.ultima_llegada_cayla) oc
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'variante_id', b.variante_id,
           'producto_id', b.producto_id,
           'producto_nombre', b.referencia,
           'codigo', b.codigo,
           'color_codigo', b.color_codigo,
           'color_nombre', b.color_nombre,
           'talla', b.talla,
           'categoria_id', b.categoria_id,
           'categoria_nombre', b.categoria_nombre,
           'temporada', b.temporada,
           'temporada_origen', b.temporada_origen,
           'es_clasico', coalesce(((select ca.clasico from catalogo ca) -> b.temporada)::boolean, false),
           'fin_estacion', (select f.m from fin_de f) -> (b.temporada || '|' || b.ultima_llegada_cayla::text),
           'en_estacion_ahora', (select e.m from hoy_es_su_estacion e) -> b.temporada,
           'primera_exhibicion', b.primera_exhibicion,
           'ultima_llegada', b.ultima_llegada,
           'ultima_llegada_cayla', b.ultima_llegada_cayla,
           'piso_hoy', coalesce(b.piso_libre, 0),
           'almacen_hoy', coalesce(b.almacen_libre, 0),
           'apartadas_hoy', coalesce(b.apartadas, 0))
         order by b.categoria_nombre nulls last, b.referencia, b.color_nombre nulls first, b.talla nulls first, b.variante_id),
         '[]'::jsonb)
    into v_prendas
    from base b;

  return jsonb_build_object(
    'separa_piso', true,
    'desde', v_desde,
    'ahora', v_ahora,
    'prendas', v_prendas,
    'eventos', v_eventos,
    'apartados', v_apartados,
    'tardias', v_tardias,
    'dudosas', v_dudosas);
end
$fn$;

comment on function retail.fn_frescura_sede(uuid, integer) is
  'ADR-0208 (paso 3 de Frescura 3c): la lectura de una tienda para Frescura del piso, en un solo jsonb. prendas (stock distinto de 0 hoy fuera de la cuarentena o algún movimiento en la ventana; sin la Prenda sin registrar ni productos es_prueba), con su temporada (fn_temporada_efectiva_nucleo, también de lo descontinuado), si es clásica, el fin de la estación de la llegada de su modelo+color A CAYLA que cuenta (ultima_llegada_cayla: la última por lote o producción en cualquier sede, fn_es_llegada_a_cayla; sin ninguna, la primera carga inicial; la recepción de un traslado no), si hoy es su estación, la primera exhibición de su modelo+color (cualquier talla) y su última llegada en esa tienda (fn_es_llegada), y su piso y almacén LIBRES de hoy (sin lo apartado) y lo apartado (apartadas_hoy); eventos del piso por prenda [ts, delta, marcas, oid] (1 venta, 2 interno, 4 edad desconocida) para el FIFO de historiaDeCohortes; apartados del piso por prenda [ts, delta] (apartar resta, liberar suma; el saldo al empezar la ventana primero) para el reloj; tardias y dudosas del núcleo de bajadas. Taller o tienda sin piso y almacén: {"separa_piso": false}. Solo lectura; una llamada al libro y una al núcleo. Candado: líder y opera la tienda (el módulo frescura nace con la pantalla).';

revoke all on function retail.fn_frescura_sede(uuid, integer) from public, anon;
grant execute on function retail.fn_frescura_sede(uuid, integer) to authenticated;

reset lock_timeout;

notify pgrst, 'reload schema';
