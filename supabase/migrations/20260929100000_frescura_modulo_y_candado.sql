-- ============================================================================
-- 20260929100000_frescura_modulo_y_candado.sql — CAYLA V2 · ADR-0208 «Frescura del piso» · paso 4 de Frescura 3c
-- (la pantalla). El módulo «frescura» y el candado de las tres lecturas de Frescura.
--
-- EL PROBLEMA PRIMERO. Las lecturas de Frescura (paso 3, en producción desde el 2026-09-28) exigen ser LÍDER: nacieron
-- antes que la pantalla, y Roles y accesos no debía ofrecer un módulo que no mostraba nada (decisión 4 del plan). Ahora
-- nace la pantalla `/inventario/frescura`, y con ella dos reglas que ya están en producción:
--   · ADR-0161 («Módulos y roles»): todo módulo nuevo aparece en Roles y accesos y nace SIN ROL: solo lo ve el líder
--     hasta que él lo da. Nunca se asigna un módulo a un rol desde una migración.
--   · ADR-0253 (Felipe, 2026-09-28): ningún módulo es «solo del líder». Un módulo que el líder puede dar tiene que servir
--     al rol que lo recibe: si las funciones siguieran pidiendo líder, darle Frescura a una encargada abriría una
--     pantalla que falla al leer.
-- Por eso el candado de las tres pasa de «líder» a «el líder, o quien tiene el módulo Frescura del piso en su rol», y
-- los dos solo en una sede que operan (`fn_puede_operar_ubicacion`: el líder las opera todas; los demás, la suya).
--
-- QUÉ CAMBIA (el detalle, con DECIDÍ / DESCARTÉ / SE ROMPE SI, en ADR-0208, «Actualización 2026-09-28 — paso 4»):
--   1. `retail.modulos` suma «frescura» (grupo Inventario, orden 115: después de Movimientos, antes de Catálogo), con
--      solo_lider = false y delegable = true. SIN `rol_modulos`: el módulo nace sin rol (lo vigila `modulos.test.ts`).
--   2. `fn_frescura_sede` (el cuerpo de 20260928120330, `33970c94…`): cambia SOLO el candado y su mensaje.
--   3. `fn_confianza_registro` (el cuerpo de 20260928120310, `8c6f5e6c…`): cambia el candado y, sin tienda, cada cuenta
--      recibe solo las tiendas que opera (el líder, todas; los demás, la suya). Así quien no es líder no ve el registro de
--      las otras sedes. Con tienda, como antes: tiene que operarla.
--   4. `fn_bajadas_del_piso` (la puerta de 20260928120200, `34a7e0cc…`): cambia el candado, y la columna `persona_id`
--      (quién registró cada bajada) sale llena SOLO para el líder; para los demás, nula. Mismas columnas, mismo orden. El
--      núcleo (`fn_bajadas_del_piso_nucleo`) no se toca.
-- El cálculo no cambia en ninguna: lo que devuelven al líder es exactamente lo de antes (lo prueban frescura_lectura y
-- frescura_bajadas sobre las mismas historias).
--
-- LA GUARDA. Cada función se reescribe desde el TEXTO de su migración vigente (la última que la define en main), y la
-- guarda de abajo compara el md5 de su cuerpo vivo con el de antes (el de producción, consultado el 2026-09-28) y con el
-- de este archivo. Con otro, aborta sin tocar nada: alguien la parchó en vivo (le pasó a Análisis con el PR 397). Pide
-- además el núcleo de las bajadas del paso 2 (`fcfd2c4b…`): la puerta nueva lee sus columnas por nombre. Se puede pegar
-- dos veces sin daño; volver a pegar después una migración anterior de Frescura aborta con su propia guarda y no
-- deshace nada.
--
-- CÓMO SE PEGA EN PRODUCCIÓN. Sola, en el SQL Editor, tal cual (ya trae `retail.` y su `set search_path`), a cualquier
-- hora, ANTES de publicar la web del paso 4: con la web nueva y sin esto, el menú no muestra Frescura ni al líder (sus
-- módulos salen de `retail.modulos`) y la URL directa dice «Sin acceso». Al revés no pasa nada: la web de hoy ignora un
-- módulo que no conoce. Un `insert` en `retail.modulos` (tabla de catálogo, sin disparadores), tres `create or replace
-- function`, sus comentarios, `revoke` y `grant`: sin políticas, sin `drop trigger`, sin `alter` de tablas (CLAUDE.md,
-- «Políticas y deadlocks»). Con `lock_timeout` de 3 s.
--
-- VERIFICACIÓN después de pegar (solo lectura; tiene que dar exactamente esto):
--   select proname, md5(prosrc) from pg_proc where pronamespace = 'retail'::regnamespace
--    and proname in ('fn_frescura_sede', 'fn_confianza_registro', 'fn_bajadas_del_piso', 'fn_bajadas_del_piso_nucleo')
--    order by proname;
--     fn_bajadas_del_piso         9821874e6a32909680a9a5155bcdb68b
--     fn_bajadas_del_piso_nucleo  fcfd2c4b2c4f24dd2184eb2cd7a12678   (sin cambio)
--     fn_confianza_registro       dcedb83cff010817a17e023b9e8b2d92
--     fn_frescura_sede            473f5d985a7f515501d940a156aad0e5
--   select clave, grupo, orden, solo_lider, delegable from retail.modulos where clave = 'frescura';
--     frescura | Inventario | 115 | f | t
--   select count(*) from retail.rol_modulos where modulo = 'frescura';
--     0
--
-- SE ROMPE SI:
--   · el líder le da Frescura a un rol de TERMINAL de una tienda: la terminal lee la frescura de su tienda (es lo que
--     pide el módulo). No ve nombres de personas en ninguna de las tres (persona_id solo para el líder).
--   · una encargada opera DOS sedes algún día (`fn_puede_operar_ubicacion` hoy es «líder o su sede»): vería las dos, y
--     la referencia de CAYLA seguiría siendo solo del líder. Es el cambio de una sola función, no de estas tres.
--   · alguien vuelve a crear una de las tres copiando una migración anterior del repo: le devuelve el candado de líder
--     sin avisar. Lo vigilan frescura_lectura (T0: el md5 vivo es el que nombra ESTA guarda) y roles_cobertura_modulos
--     (el módulo frescura tiene que tener un guardián).
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

do $$
declare
  v_sede text;
  v_conf text;
  v_puerta text;
  v_nucleo text;
begin
  if to_regprocedure('retail.fn_ve_modulo(text)') is null or to_regclass('retail.modulos') is null then
    raise exception 'Faltan los roles por módulo: pega antes 20260923030000_roles_por_modulo.sql.';
  end if;
  select md5(p.prosrc) into v_sede from pg_proc p where p.oid = to_regprocedure('retail.fn_frescura_sede(uuid, integer)');
  select md5(p.prosrc) into v_conf from pg_proc p where p.oid = to_regprocedure('retail.fn_confianza_registro(uuid, integer)');
  select md5(p.prosrc) into v_puerta
    from pg_proc p where p.oid = to_regprocedure('retail.fn_bajadas_del_piso(uuid, timestamptz, timestamptz, integer)');
  select md5(p.prosrc) into v_nucleo
    from pg_proc p where p.oid = to_regprocedure('retail.fn_bajadas_del_piso_nucleo(uuid, timestamptz, timestamptz, integer)');
  if v_sede is null or v_conf is null then
    raise exception 'Faltan las lecturas de Frescura: pega antes 20260928120300, 20260928120310, 20260928120320 y 20260928120330.';
  end if;
  if v_sede not in ('33970c94c7dddf9530ee6b8175862661', '473f5d985a7f515501d940a156aad0e5') then
    raise exception 'fn_frescura_sede tiene otro cuerpo (md5 %): no es la de 20260928120330 ni la de este archivo (si es la de una migración anterior, pega antes las que faltan hasta 20260928120330; si no, alguien la cambió en vivo: reescribe desde su definición real antes de pegar).', v_sede;
  end if;
  if v_conf not in ('8c6f5e6c27916b99be10020b772bd6e0', 'dcedb83cff010817a17e023b9e8b2d92') then
    raise exception 'fn_confianza_registro tiene otro cuerpo (md5 %): no es la de 20260928120310 ni la de este archivo (si es la de 20260928120300, pega antes 20260928120310; si no, alguien la cambió en vivo: reescribe desde su definición real antes de pegar).', v_conf;
  end if;
  if v_nucleo is distinct from 'fcfd2c4b2c4f24dd2184eb2cd7a12678' then
    raise exception 'El núcleo de las bajadas no es el del paso 2 (md5 %): pega antes 20260928120100 y 20260928120200, o reescribe desde su definición real si alguien lo cambió en vivo.', coalesce(v_nucleo, 'ninguno');
  end if;
  if v_puerta is null or v_puerta not in ('34a7e0cc5f421333761e8bda92a582eb', '9821874e6a32909680a9a5155bcdb68b') then
    raise exception 'fn_bajadas_del_piso tiene otro cuerpo (md5 %): no es la de 20260928120200 ni la de este archivo; alguien la cambió en vivo. Reescribe desde su definición real antes de pegar.', coalesce(v_puerta, 'ninguno');
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 1. El módulo. Sin rol (ADR-0161): solo lo ve el líder hasta que él lo da en Colaboradores ▸ Roles y accesos.
-- ----------------------------------------------------------------------------

insert into retail.modulos (clave, grupo, nombre, incluye, orden, solo_lider, delegable) values
  ('frescura', 'Inventario', 'Frescura del piso', 'Ver cuánto lleva colgada cada prenda de su tienda contra las demás de su categoría, y qué conviene hacer con la que se queda', 115, false, true)
on conflict (clave) do nothing;

-- ----------------------------------------------------------------------------
-- 2. La lectura de una tienda (la de 20260928120330; cambia solo el candado)
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
  -- W, la ventana de la bajada tardía (ADR-0208: lo vendido en [t, t + 10 min]), escrita una sola vez: se le pasa al
  -- núcleo para las ventas y se usa aquí para lo apartado. La web usa los mismos 10 minutos (VENTANA_TARDIA_SEGUNDOS).
  c_minutos constant integer := 10;
  v_ventana constant interval := make_interval(mins => c_minutos);
  -- La ventana de la ENTREGA de lo apartado: una liberación con una venta de su talla en el piso en [liberación,
  -- liberación + 10 min] es una entrega, no una clienta que no vino. Es la misma regla y el mismo número de la web
  -- (VENTANA_ENTREGA_SEGUNDOS, `eventosConApartados`): «Se la entrego a la clienta ahora» libera en Apartados y se cobra
  -- enseguida en Vender. La usan las tardías (lo que se libera sin entregar de una separación de antes no explica
  -- ninguna venta) y la primera exhibición (el pedido que la clienta no recogió se cuelga desde que se libera).
  v_entrega constant interval := make_interval(mins => 10);
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
  -- Candado (paso 4 de Frescura, ADR-0208 y ADR-0253): el líder, o quien tiene el módulo «Frescura del piso» en su
  -- rol, y los dos solo en una sede que operan (el líder las opera todas; los demás, la suya). Quien no es líder no lee
  -- las otras sedes: la referencia de CAYLA y «Las 3 tiendas» las arma solo el líder.
  if not (fn_puede_operar_ubicacion(p_ubicacion_id) and (fn_es_lider() or fn_ve_modulo('frescura'))) then
    raise exception 'Para ver la frescura del piso de esta sede hace falta el módulo «Frescura del piso» en tu rol y que sea una sede que operas.' using hint = 'frescura_sin_permiso';
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

  -- LO APARTADO EN EL PISO (R7-1, Felipe 2026-09-27): lo apartado para una clienta ya tiene dueña y no está colgado. Por
  -- prenda, [ts, delta] con el signo de lo que cambia lo LIBRE del piso: apartar resta, liberar suma (también al
  -- entregar: la liberación y la venta van juntas). El saldo con que arranca la ventana va primero, a la hora de `desde`:
  -- lo apartado hoy en el piso menos lo que se apartó (y más lo que se liberó) dentro de la ventana, la misma ancla en
  -- `stock` que usa el libro. La web lo resta de lo libre para el reloj, y para la vara y la rapidez lo lee como venta
  -- desde que se apartó o como pausa (`eventosConApartados`, revisión 8).
  -- Se lee ANTES que el núcleo (revisión 9): las tardías de abajo buscan en este mapa lo apartado de cada talla.
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

  -- UNA llamada al núcleo de las bajadas (paso 2), con la W de arriba: las de carga inicial (para la marca 4), las
  -- tardías cerradas y las prendas «dudosas». Las bajadas se leen por id (mapa jsonb), no cruzando dos conjuntos
  -- calculados.
  -- LAS TARDÍAS DE LA LECTURA (revisión 9, N1/F1/F2). La web lee lo apartado como una venta desde que se apartó
  -- (revisión 8), así que aquí también: lo vendido en [t, t + W] MÁS lo que se apartó en esa ventana (menos lo liberado),
  -- contra el piso LIBRE de antes (R7-1: lo apartado no está colgado). Las dos cosas juntas son una resta sola:
  --   vendidas − piso de antes + lo apartado en el piso de esa talla al cerrar la ventana (t + W, inclusive)
  -- porque lo apartado al cerrar = lo apartado antes + lo apartado − lo liberado en la ventana. Así la separada (en
  -- Vender, o el pedido de otra sede, bajada y separada en el mismo instante), la entregada dentro de la ventana y la
  -- vendida dan lo mismo, también cuando la clienta anterior sigue con su separación colgada en esa talla (el piso de
  -- antes del núcleo la cuenta como colgada). La entrega de una separación de antes suma 1 a lo vendido y 1 a lo liberado:
  -- no pesa. Sin nada apartado en la talla, es el número del núcleo. El indicador de registro no cambia (no castiga lo
  -- traído a pedido para una clienta): sus tardías y las de la lectura ya no son las mismas cuando hay algo apartado.
  -- LO LIBERADO SIN ENTREGARSE de una separación de ANTES de la bajada no resta: es la pausa que termina (R8, N2), como
  -- volver a colgar desde el almacén, que el núcleo tampoco mira. Liberada después de la venta de la ventana, la clienta
  -- de antes no explica esa venta, y su gemela guardada en el almacén es tardía. Por eso a lo apartado al cerrar se le
  -- suma lo que la ventana liberó sin entregar de lo apartado de antes. La web cierra primero lo más viejo
  -- (`eventosConApartados`): de lo liberado en la ventana, lo primero es de antes, y dentro de cada liberación lo
  -- entregado va primero a lo más viejo. Aquí va sumado:
  --   de antes, liberado sin entregar = máximo(0, mínimo(apartado antes de la bajada, liberado en la ventana) − entregado)
  -- con «entregado» = lo liberado en la ventana que la web toma como entrega (una venta de su talla en el piso en los 10
  -- minutos siguientes a la liberación, `v_entrega`) y cuya venta cae DENTRO de la ventana de la bajada: solo esa venta
  -- está en lo vendido del núcleo, y la web se la quita (ya se contó al apartar). Una entrega cobrada después de la
  -- ventana no quita nada de ella: cuenta como liberada sin entregar. Con una sola liberación en la ventana, lo normal,
  -- es exacto.
  -- Lo apartado de cada talla se busca en `v_apartados` (el mismo mapa que va a la web, con su saldo): solo las tallas
  -- con algo apartado en la lectura lo recorren, y la venta de una entrega solo se busca para lo liberado en una ventana.
  select coalesce(jsonb_object_agg(n.movimiento_id, true) filter (where n.es_carga_inicial), '{}'::jsonb),
         coalesce(jsonb_agg(jsonb_build_object('oid', n.movimiento_id, 'variante_id', n.variante_id,
                                               'bajada_en', n.bajada_en, 'unidades_tardias', n.tardias)
                            order by n.bajada_en, n.movimiento_id)
                    filter (where n.cerrada and n.estado not in ('dudosa', 'corregida') and n.tardias > 0),
                  '[]'::jsonb),
         coalesce(jsonb_agg(distinct n.variante_id) filter (where n.estado = 'dudosa'), '[]'::jsonb)
    into v_carga, v_tardias, v_dudosas
    from (
      select b.movimiento_id, b.variante_id, b.bajada_en, b.cerrada, b.estado, b.es_carga_inicial,
             least(b.cantidad_efectiva,
                   greatest(0, b.vendidas_en_ventana - b.piso_antes
                               + case when v_apartados ? b.variante_id::text
                                      then (select greatest(0, y.al_cerrar) + greatest(0, least(y.antes, y.liberado) - y.entregado)
                                              from (select -coalesce(sum(x.d) filter (where x.ts <= b.bajada_en + v_ventana), 0) as al_cerrar,
                                                           -coalesce(sum(x.d) filter (where x.ts < b.bajada_en), 0) as antes,
                                                           coalesce(sum(x.d) filter (where x.en_ventana), 0) as liberado,
                                                           coalesce(sum(case when x.en_ventana then least(x.d, (
                                                                          select coalesce(sum(s.cantidad), 0)::integer
                                                                            from movimientos s
                                                                            left join venta_items vi on vi.id = s.venta_item_id
                                                                            left join ventas ve on ve.id = vi.venta_id
                                                                           where s.ubicacion_id = p_ubicacion_id
                                                                             and s.created_at >= x.ts
                                                                             and s.created_at <= least(x.ts + v_entrega, b.bajada_en + v_ventana)
                                                                             and s.variante_id = b.variante_id and s.sububicacion_id = v_piso
                                                                             and fn_es_venta_de_stock(s.tipo, s.motivo, s.cambio_id, s.venta_item_id, ve.estado)))
                                                                        end), 0) as entregado
                                                      from (select p.ts, p.d,
                                                                   p.d > 0 and p.ts >= b.bajada_en and p.ts <= b.bajada_en + v_ventana as en_ventana
                                                              from (select (a ->> 0)::timestamptz as ts, (a ->> 1)::integer as d
                                                                      from jsonb_array_elements(v_apartados -> b.variante_id::text) a) p) x) y)
                                      else 0 end)) as tardias
        from fn_bajadas_del_piso_nucleo(p_ubicacion_id, v_desde, null, c_minutos) b
       where b.variante_id in (select unnest(v_ids))
    ) n;

  -- UNA llamada al libro (ADR-0202) con la lista de prendas: sus puntos de PISO, con las marcas. La 4 de lo que no es
  -- interno se decide con una búsqueda por id en `movimientos`, solo para esos puntos (pocos: ajustes, devoluciones,
  -- llegadas directo al piso).
  -- EL ORDEN (revisión 9, F3): en un mismo instante, las entradas antes que las salidas (`delta desc`), no por el uuid,
  -- que es al azar. `fn_aplicar_movimiento` no deja sacar lo que no hay: con el piso en 0, entrada y venta de la misma
  -- transacción (regularizar una «Prenda sin registrar» como «llegó nueva») solo pudieron aplicarse en ese orden.
  select coalesce(jsonb_object_agg(e.variante_id, e.eventos), '{}'::jsonb) into v_eventos
    from (
      select p.variante_id,
             jsonb_agg(jsonb_build_array(p.ts, p.delta, p.marcas, p.oid) order by p.ts, p.ord, p.delta desc, p.oid) as eventos
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
    -- Lo que entra al piso y se aparta ENTERO en el mismo instante no es exhibición (revisión 9, N3): es la huella de
    -- `separar_pedido_para_apartar` (el pedido de otra sede sube al piso y se separa en una transacción: 0 segundos a la
    -- vista). La búsqueda del apartado es por el índice de tienda y hora exacta.
    -- Pero si la clienta no lo recoge y se libera sin entregarse, queda colgado: desde la LIBERACIÓN sí es exhibición.
    -- Una liberación en el piso de la tienda cuenta si libera más de lo que se vende de esa talla en el piso en los 10
    -- minutos siguientes (`v_entrega`, la entrega de la web). Solo pesa cuando todo lo de antes fue un pedido separado
    -- al instante: si el modelo+color ya se había colgado, esa entrada es anterior.
    select coalesce(jsonb_object_agg(x.clave, pe.primera), '{}'::jsonb) as m
      from modelos x
      cross join lateral (
        select min(m.created_at) as primera
          from variantes v2
          join movimientos m on m.variante_id = v2.id
         where v2.producto_id = x.producto_id
           and v2.color_codigo is not distinct from x.color_codigo
           and ((((m.ubicacion_id = p_ubicacion_id and m.sububicacion_id = v_piso
                   and (m.tipo = 'entrada' or (m.tipo = 'ajuste' and m.cantidad > 0)))
                  or (m.tipo = 'traslado' and m.ubicacion_destino_id = p_ubicacion_id and m.sububicacion_destino_id = v_piso))
                 and m.cantidad > coalesce((select sum(a.cantidad)
                                              from movimientos a
                                             where a.ubicacion_id = p_ubicacion_id and a.created_at = m.created_at
                                               and a.variante_id = m.variante_id and a.sububicacion_id = v_piso
                                               and a.tipo = 'apartado'), 0))
                or (m.ubicacion_id = p_ubicacion_id and m.sububicacion_id = v_piso and m.tipo = 'liberacion_apartado'
                    and m.cantidad > coalesce((select sum(s.cantidad)
                                                 from movimientos s
                                                 left join venta_items vi on vi.id = s.venta_item_id
                                                 left join ventas ve on ve.id = vi.venta_id
                                                where s.ubicacion_id = p_ubicacion_id
                                                  and s.created_at >= m.created_at and s.created_at <= m.created_at + v_entrega
                                                  and s.variante_id = m.variante_id and s.sububicacion_id = v_piso
                                                  and fn_es_venta_de_stock(s.tipo, s.motivo, s.cambio_id, s.venta_item_id, ve.estado)), 0)))
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
    -- Una entrada de producción cuenta solo si su orden SIGUE inventariada (revisión 9, R9-SQL-2; la convención de
    -- `fn_origen_producto`): la orden cerrada y revertida (o revertida y anulada) nunca llegó. Cerrada, revertida y vuelta
    -- a cerrar, sí: manda el segundo cierre.
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
           and (m.produccion_id is null
                or exists (select 1 from producciones pr where pr.id = m.produccion_id and pr.inventariado_at is not null))
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
  'ADR-0208 (pasos 3 y 4 de Frescura 3c): la lectura de una tienda para Frescura del piso, en un solo jsonb. prendas (stock distinto de 0 hoy fuera de la cuarentena o algún movimiento en la ventana; sin la Prenda sin registrar ni productos es_prueba), con su temporada (fn_temporada_efectiva_nucleo, también de lo descontinuado), si es clásica, el fin de la estación de la llegada de su modelo+color A CAYLA que cuenta (ultima_llegada_cayla: la última por lote o producción —de una orden que sigue inventariada— en cualquier sede, fn_es_llegada_a_cayla; sin ninguna, la primera carga inicial; la recepción de un traslado no), si hoy es su estación, la primera exhibición de su modelo+color (cualquier talla; lo que entra al piso y se aparta entero en el mismo instante no cuenta, pero sí su liberación sin entrega: desde ahí se cuelga) y su última llegada en esa tienda (fn_es_llegada), y su piso y almacén LIBRES de hoy (sin lo apartado) y lo apartado (apartadas_hoy); eventos del piso por prenda [ts, delta, marcas, oid] (1 venta, 2 interno, 4 edad desconocida; en un mismo instante, las entradas primero) para el FIFO de historiaDeCohortes; apartados del piso por prenda [ts, delta] (apartar resta, liberar suma; el saldo al empezar la ventana primero) para el reloj y la vara; tardias (las del núcleo de bajadas con lo que quedó apartado en sus 10 minutos contado como vendido, contra el piso libre de antes, y sin restar lo liberado sin entrega de lo apartado de antes: no son las del indicador de registro, que no lo cuenta) y dudosas. Taller o tienda sin piso y almacén: {"separa_piso": false}. Solo lectura; una llamada al libro y una al núcleo (con W = 10 minutos). Candado (paso 4): el líder, o el módulo frescura en su rol, y en los dos casos una tienda que opera.';

revoke all on function retail.fn_frescura_sede(uuid, integer) from public, anon;
grant execute on function retail.fn_frescura_sede(uuid, integer) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. El registro al colgar, por tienda y mes de Lima (la de 20260928120310; cambia el candado y, sin tienda, cada
--    cuenta recibe solo las que opera)
-- ----------------------------------------------------------------------------

create or replace function retail.fn_confianza_registro(p_ubicacion_id uuid default null, p_meses integer default 2)
returns table (
  ubicacion_id uuid,
  sede text,
  mes date,
  filas integer,
  unidades integer,
  tardias integer,
  confianza numeric,
  nivel text
)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
set plan_cache_mode = force_custom_plan
as $fn$
#variable_conflict use_column
declare
  -- W, la ventana de la bajada tardía del núcleo (10 minutos, su valor por defecto). Una fila cerrada todavía puede
  -- cambiar hasta 2W después de la bajada (ADR-0208, T33): solo cuentan las de hace 2W o más.
  c_ventana constant interval := interval '10 minutes';
  v_ahora timestamptz := now();
  v_mes_actual date := date_trunc('month', v_ahora at time zone 'America/Lima')::date;
  v_primer_mes date;
  v_desde timestamptz;
begin
  -- Candado (paso 4 de Frescura, ADR-0208 y ADR-0253): el líder, o quien tiene el módulo «Frescura del piso» en su
  -- rol. Con una tienda, además tiene que operarla; sin tienda, cada uno recibe solo las que opera (abajo, en `sedes`):
  -- quien no es líder ve la suya y ninguna de las otras.
  if not (fn_es_lider() or fn_ve_modulo('frescura')) then
    raise exception 'Para ver el registro al colgar hace falta el módulo «Frescura del piso» en tu rol.' using hint = 'frescura_sin_permiso';
  end if;
  if p_ubicacion_id is not null and not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'El registro al colgar de esta sede lo ve quien la opera.' using hint = 'frescura_sin_permiso';
  end if;
  -- El núcleo lee hasta 120 días: tres meses calendario caben siempre (el primer día del antepasado queda a 92 como mucho).
  if p_meses is null or p_meses not between 1 and 3 then
    raise exception 'Se leen de 1 a 3 meses.';
  end if;
  v_primer_mes := (v_mes_actual - make_interval(months => p_meses - 1))::date;
  v_desde := v_primer_mes::timestamp at time zone 'America/Lima';

  return query
  with sedes as (
    -- Las tiendas con piso y almacén (el Taller no tiene piso); con p_ubicacion_id, solo esa.
    select u.id, u.nombre
      from ubicaciones u
     where u.activo
       and (p_ubicacion_id is null or u.id = p_ubicacion_id)
       and fn_puede_operar_ubicacion(u.id)
       and exists (select 1 from sububicaciones s where s.ubicacion_id = u.id and s.tipo = 'piso_venta')
       and exists (select 1 from sububicaciones s where s.ubicacion_id = u.id and s.tipo = 'almacen_tienda')
  ),
  meses as (
    select g::date as mes from generate_series(v_primer_mes::timestamp, v_mes_actual::timestamp, interval '1 month') g
  ),
  cuentan as (
    select s.id as sede_id, date_trunc('month', n.bajada_en at time zone 'America/Lima')::date as mes_bajada,
           n.cantidad_efectiva, n.unidades_tardias
      from sedes s
      cross join lateral fn_bajadas_del_piso_nucleo(s.id, v_desde, null) n
      -- Sin productos de prueba, como fn_frescura_sede: una bajada de práctica no es el hábito del equipo (revisión 3).
      -- La prenda se busca por llave (variante → producto), sin cruzar dos conjuntos calculados.
      join variantes v on v.id = n.variante_id
      join productos p on p.id = v.producto_id
     where n.cerrada
       and not p.es_prueba
       and n.estado not in ('dudosa', 'corregida')
       and not n.es_carga_inicial
       and n.bajada_en + 2 * c_ventana <= v_ahora
  ),
  por_mes as (
    select c.sede_id, c.mes_bajada, count(*)::integer as n_filas, sum(c.cantidad_efectiva)::integer as n_unidades,
           sum(c.unidades_tardias)::integer as n_tardias
      from cuentan c
     group by c.sede_id, c.mes_bajada
  )
  select s.id, s.nombre, m.mes,
         coalesce(pm.n_filas, 0),
         coalesce(pm.n_unidades, 0),
         coalesce(pm.n_tardias, 0),
         case when coalesce(pm.n_unidades, 0) > 0 then round(1 - pm.n_tardias::numeric / pm.n_unidades, 4) end,
         case when coalesce(pm.n_filas, 0) >= 20 then 'solido'
              when coalesce(pm.n_filas, 0) >= 10 then 'aceptable'
              when coalesce(pm.n_filas, 0) >= 1 then 'pocos_datos' end
    from sedes s
    cross join meses m
    left join por_mes pm on pm.sede_id = s.id and pm.mes_bajada = m.mes
   order by s.nombre, m.mes;
end
$fn$;

comment on function retail.fn_confianza_registro(uuid, integer) is
  'ADR-0208 (pasos 3 y 4 de Frescura 3c): la confianza del registro de las bajadas al piso, por tienda y mes calendario de Lima (p_meses de 1 a 3, el actual y los anteriores). filas = bajadas que cuentan (cerradas, ni dudosa ni corregida, sin productos es_prueba ni la carga inicial, de hace 20 minutos o más para que la cifra no se mueva); unidades = suma de cantidad_efectiva; tardias = unidades registradas al cobrar; confianza = 1 - tardias / unidades (nula sin unidades); nivel por filas: pocos_datos 1-9, aceptable 10-19, solido 20 o más. Una fila por tienda y mes aunque no haya bajadas. Sin personas: el indicador es del equipo. Candado (paso 4): el líder, o el módulo frescura en su rol; con una tienda, además que la opere; sin tienda, solo las tiendas que opera (el líder, todas).';

revoke all on function retail.fn_confianza_registro(uuid, integer) from public, anon;
grant execute on function retail.fn_confianza_registro(uuid, integer) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. La puerta de las bajadas (la de 20260928120200; cambia el candado y persona_id sale solo para el líder)
-- ----------------------------------------------------------------------------

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
  -- Candado (paso 4 de Frescura, ADR-0208 y ADR-0253): el líder, o quien tiene el módulo «Frescura del piso» en su
  -- rol, y los dos solo en una sede que operan. Quién registró cada bajada (persona_id) lo ve SOLO el líder: el
  -- registro al colgar es del equipo, no de una persona (ADR-0208, bloque 1).
  if not (fn_puede_operar_ubicacion(p_ubicacion_id) and (fn_es_lider() or fn_ve_modulo('frescura'))) then
    raise exception 'Para ver cómo se registran las bajadas al piso de esta sede hace falta el módulo «Frescura del piso» en tu rol y que sea una sede que operas.' using hint = 'frescura_sin_permiso';
  end if;
  return query
    select n.movimiento_id, n.bajada_id, n.variante_id, case when fn_es_lider() then n.persona_id end, n.bajada_en,
           n.cantidad, n.piso_antes, n.vendidas_en_ventana, n.unidades_tardias, n.cerrada, n.estado,
           n.retiradas_en_ventana, n.cantidad_efectiva, n.es_carga_inicial
      from fn_bajadas_del_piso_nucleo(p_ubicacion_id, p_desde, p_hasta, p_minutos) n;
end
$fn$;

comment on function retail.fn_bajadas_del_piso(uuid, timestamptz, timestamptz, integer) is
  'ADR-0208: una fila por bajada almacén→piso de la tienda, con piso_antes, lo vendido desde el piso en la ventana, lo retirado del piso que le tocó (cada retiro a una sola bajada), la cantidad efectiva y las unidades tardías (registradas al cobrar, no al colgar). Derivado al leer. Estados: dudosa (stock y libro no cuadran), corregida (un retiro la deshizo), tardia, en_curso, normal. es_carga_inicial marca la bajada de la carga inicial. Es la puerta con candado de retail.fn_bajadas_del_piso_nucleo (paso 2 de Frescura 3c). Candado (paso 4): el líder, o el módulo frescura en su rol, y en los dos casos una tienda que opera; persona_id (quién la registró) sale solo para el líder.';

revoke all on function retail.fn_bajadas_del_piso(uuid, timestamptz, timestamptz, integer) from public, anon;
grant execute on function retail.fn_bajadas_del_piso(uuid, timestamptz, timestamptz, integer) to authenticated;

reset lock_timeout;

notify pgrst, 'reload schema';
