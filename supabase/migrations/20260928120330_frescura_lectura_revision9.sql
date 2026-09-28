-- ============================================================================
-- 20260928120330_frescura_lectura_revision9.sql — CAYLA V2 · ADR-0208 «Frescura del piso» · paso 3 de Frescura 3c,
-- los hallazgos de la revisión 9 (2026-09-28) en la lectura de una tienda. Solo `create or replace function
-- retail.fn_frescura_sede`: no crea tablas, módulos ni funciones nuevas, y no toca el indicador de registro
-- (`fn_confianza_registro`) ni el núcleo de las bajadas.
--
-- POR QUÉ UN ARCHIVO NUEVO. `20260928120320` ya está en main (PR #545, fusionado el 2026-09-28 mientras corría esta
-- revisión): una migración que está en main no se edita (revisión 4). Esto se pega DESPUÉS de 20260928120300,
-- 20260928120310 y 20260928120320, en ese orden.
--
-- QUÉ CAMBIA (el detalle, con DECIDÍ / DESCARTÉ / SE ROMPE SI, en ADR-0208, «Revisión 9 del paso 3»):
--   1. LO APARTADO EN LOS 10 MINUTOS DE UNA BAJADA (N1, F1, F2). La web lee lo apartado como una venta desde que se
--      apartó (revisión 8, decisión de Felipe del 2026-09-28), pero las tardías de la lectura salían del núcleo, que solo
--      mira ventas: separar una prenda recién bajada (en Vender, o el pedido de otra sede, que la baja y la separa en el
--      MISMO instante) entraba a la vara y a la rapidez como una venta de 0 a 3 minutos, cuando su gemela vendida es
--      tardía y sale. Ahora, para `tardias`, lo que se apartó en [t, t + 10 min] cuenta como vendido y el piso de antes
--      es el LIBRE (R7-1). Juntas, las dos cosas son una resta sola, con las cifras del mismo núcleo:
--        unidades tardías = mínimo(efectiva, máximo(0, vendidas − piso de antes + apartado en el piso al cerrar la ventana))
--      Sin nada apartado en la talla es el número del núcleo, tal cual. El indicador de registro
--      (`fn_confianza_registro`) NO cambia: no castiga lo que se trajo a pedido para una clienta (ADR-0208, plan 3c,
--      riesgo 3). Por eso las tardías de la lectura y las del indicador ya no son las mismas cuando hay algo apartado.
--      La web aplica esto después de leer lo apartado como venta (`frescura-reglas.ts`, revisión 9).
--      La ventana W = 10 minutos queda escrita UNA vez aquí (`c_minutos`) y se le pasa al núcleo: la misma para las
--      ventas y para lo apartado.
--      Corrección de la misma revisión (su corrector, 2026-09-28): lo que se LIBERA en la ventana sin entregarse, de una
--      separación hecha ANTES de la bajada, no resta. La web lo lee como una pausa (R8, N2), igual que volver a colgar
--      desde el almacén, y el núcleo no mira esas entradas: liberada después de la venta de la ventana, la clienta de
--      antes no explica esa venta. A lo apartado al cerrar se le suma
--        máximo(0, mínimo(apartado antes de la bajada, liberado en la ventana) − entregado en la ventana)
--      con «entregado» = lo liberado que tiene una venta de su talla en el piso en los 10 minutos siguientes
--      (`v_entrega`, la regla de la web) DENTRO de la ventana de la bajada (solo esa venta está en lo vendido).
--   2. LA LLEGADA A CAYLA DE UNA ORDEN DEL TALLER REVERTIDA (R9-SQL-2). Una entrada de producción cuenta como llegada a
--      CAYLA solo si su orden sigue inventariada (`producciones.inventariado_at`, la misma convención de
--      `fn_origen_producto`). Cerrar → revertir → anular, o revertir sin volver a cerrar, ya no reinicia la temporada del
--      modelo+color en todas las sedes; cerrar → revertir → volver a cerrar sí (manda el segundo cierre).
--   3. LO QUE ENTRA AL PISO Y SE APARTA EN EL MISMO INSTANTE NO ES EXHIBICIÓN (N3). `separar_pedido_para_apartar` sube
--      la prenda pedida al piso y la separa en una transacción: 0 segundos a la vista. Esa entrada ya no es la primera
--      exhibición del modelo+color; si fue hace más de 120 días, el modelo podía no volver a ser «Nueva» nunca en esa sede
--      (decisión 9). Si es la única entrada al piso, `primera_exhibicion` es nula (la web: «Nueva» posible, revisión 9).
--      Corrección del corrector: si la clienta no lo recoge y se libera sin entregarse (sin una venta de su talla en el
--      piso en los 10 minutos siguientes), queda colgado: la liberación SÍ es exhibición. Sin esto, el pedido liberado
--      y vendido desde el piso hace más de 120 días devolvía «Nueva» al lote de hoy (contra la decisión 9).
--   4. DESEMPATE DE LOS EVENTOS DEL MISMO INSTANTE (F3): entradas antes que salidas (`delta desc`), no por el uuid (al
--      azar). `fn_aplicar_movimiento` rechaza una salida sin stock, así que con el piso en 0 el único orden posible es la
--      entrada primero (regularizar una «Prenda sin registrar» como «llegó nueva» escribe la entrada y la venta en la
--      misma transacción: la mitad de las veces el FIFO perdía la venta y cambiaba el veredicto).
--
-- CUÁNTO CUESTA (la carga sintética de siempre: una tienda, 2.000 prendas en 200 modelos con temporada, 20.000 bajadas,
-- 10.000 ventas, 200 apartados y 50 liberaciones; medido el 2026-09-28 contra el cuerpo de 20260928120320 en la misma
-- base, 11 corridas alternadas): 848 ms (810-867) contra 810 (789-883) a 120 días, y 321 (312-333) contra 299 (294-308) a
-- 30 días: +5 % y +7 %. Lo apartado se lee UNA vez (la misma consulta que arma `apartados`, ahora antes del núcleo) y cada
-- bajada lo busca en ese mapa por talla, como la marca de la carga inicial: solo las tallas con algo apartado lo recorren.
-- La primera exhibición busca, por cada entrada al piso, un apartado de su mismo instante por el índice de tienda y hora
-- (sin esa búsqueda, ~14 ms menos a 120 días). Con esa carga, la lectura sale igual que la de 20260928120320 (no hay nada
-- apartado junto a una bajada).
-- Con las dos correcciones de su corrector (la misma carga, 11 corridas alternadas de los tres cuerpos, 2026-09-28):
-- 849 ms (819-881) contra 807 (793-831) de 20260928120320 y 837 (820-844) del cuerpo anterior de este archivo a 120
-- días; 322 (316-397) contra 303 (298-345) y 318 (312-416) a 30 días: +5 % y +6 % contra la revisión 8. La venta de una
-- entrega solo se busca para lo liberado dentro de una ventana, y la de una liberación en la primera exhibición, por el
-- índice de tienda y hora. Los tres cuerpos dan la misma lectura con esa carga.
--
-- LA GUARDA. Pide 20260928120310 ya pegada (las tres funciones que esto usa y no reescribe, con su cuerpo) y
-- `fn_frescura_sede` con el cuerpo de 20260928120320 (`7da85d7b…`) o el de este archivo. Con el de 20260928120300 o el
-- de 20260928120310 aborta pidiendo la que falta; con otro, aborta sin tocar nada (alguien la parchó en vivo). Se puede
-- pegar dos veces. Al revés también es seguro: con esta ya pegada, volver a pegar 20260928120320 (o una anterior)
-- aborta, porque su guarda no conoce este cuerpo, y no deshace nada.
--
-- CÓMO SE PEGA EN PRODUCCIÓN. Sola, en el SQL Editor, tal cual (ya trae `retail.`), a cualquier hora, DESPUÉS de
-- 20260928120300, 20260928120310 y 20260928120320. Solo `create or replace function`, un comentario, `revoke` y
-- `grant`: sin políticas, sin `drop trigger`, sin `alter` de tablas (ADR-0195). Ninguna pantalla la llama todavía.
-- Cómo se verifica después (solo lectura):
--   select proname, md5(prosrc) from pg_proc where pronamespace = 'retail'::regnamespace
--    and proname in ('fn_es_llegada', 'fn_es_llegada_a_cayla', 'fn_frescura_sede', 'fn_confianza_registro',
--                    'fn_temporada_efectiva_nucleo', 'fn_temporada_efectiva');
-- da el md5 NUEVO de fn_frescura_sede de la guarda de abajo y los otros cinco de 20260928120310, sin cambio.
--
-- SE ROMPE SI (lo nuevo; lo de antes sigue en 20260928120300, 20260928120310 y 20260928120320):
--   · de la 1: una separación hecha en los 10 minutos de una bajada se abandona DESPUÉS de esos 10 minutos (la clienta
--     no vino) y en la ventana hubo otra venta que el piso libre de antes explicaba: la lectura saca de la vara esa venta
--     (la web solo saca lo que en la ventana cuenta como venta, pero el tope viene de aquí). Pide una separación que se
--     abandona y otra venta de la misma talla en los mismos 10 minutos.
--   · de la 1 (corrección): dos o más liberaciones de la misma talla en los 10 minutos de una bajada, que cierran una
--     separación de antes Y una de la ventana, con la entrega y el abandono en el orden contrario al que aquí se supone
--     (lo entregado va primero a lo más viejo): una unidad de más o de menos. Y una misma venta que la web solo le da a
--     una entrega se cuenta para dos liberaciones. Pide dos clientas con separaciones de la misma talla liberadas en los
--     mismos 10 minutos de una bajada.
--   · de la 2: una orden cerrada hace meses se revierte para corregir el costo y se vuelve a cerrar: la temporada cuenta
--     desde el segundo cierre (ya pasaba antes de esta migración).
--   · de la 3: alguien baja una prenda y la aparta en la misma transacción SIN que sea un pedido (hoy solo
--     `separar_pedido_para_apartar` lo hace): tampoco cuenta como exhibición. Una bajada que se aparta minutos después
--     sí cuenta. Y el pedido que se libera y, en los 10 minutos siguientes, otra clienta compra esa talla desde el piso:
--     se lee como la entrega (la misma confusión que la web) y la liberación no cuenta como exhibición.
--   · de la 4: un flujo nuevo escribe en una transacción una salida y DESPUÉS una entrada de la misma talla en el piso con
--     stock de sobra (hoy ninguno): se leería al revés siempre, en vez de la mitad de las veces.
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
    raise exception 'Falta retail.fn_es_llegada: pega antes 20260928120300, 20260928120310 y 20260928120320.';
  end if;
  if v_md5 <> '5089ba50874f611d96d5df751b63ed57' then
    raise exception 'fn_es_llegada tiene otro cuerpo (md5 %): alguien la cambió en vivo. Reescribe desde su definición real antes de pegar.', v_md5;
  end if;
  select md5(p.prosrc) into v_md5 from pg_proc p
   where p.oid = to_regprocedure('retail.fn_es_llegada_a_cayla(text, text, uuid, uuid, uuid)');
  if v_md5 is null then
    raise exception 'Falta retail.fn_es_llegada_a_cayla: pega antes 20260928120310_frescura_lectura_revision3.sql y 20260928120320_frescura_lectura_revision7.sql.';
  end if;
  if v_md5 <> '7e1ffb6d9853027ec685fef46ec72a4c' then
    raise exception 'fn_es_llegada_a_cayla tiene otro cuerpo (md5 %): alguien la cambió en vivo. Reescribe desde su definición real antes de pegar.', v_md5;
  end if;
  select md5(p.prosrc) into v_md5 from pg_proc p
   where p.oid = to_regprocedure('retail.fn_temporada_efectiva_nucleo(uuid, boolean)');
  if v_md5 is null then
    raise exception 'Falta retail.fn_temporada_efectiva_nucleo: pega antes 20260928120310_frescura_lectura_revision3.sql y 20260928120320_frescura_lectura_revision7.sql.';
  end if;
  if v_md5 <> '2bf80eb239248cce88cf8062238f4dfc' then
    raise exception 'fn_temporada_efectiva_nucleo tiene otro cuerpo (md5 %): alguien la cambió en vivo. Reescribe desde su definición real antes de pegar.', v_md5;
  end if;
  -- La que se reescribe: el cuerpo de 20260928120320 o el de este archivo. Nunca otro.
  select md5(p.prosrc) into v_md5 from pg_proc p
   where p.oid = to_regprocedure('retail.fn_frescura_sede(uuid, integer)');
  if v_md5 is null then
    raise exception 'Falta retail.fn_frescura_sede: pega antes 20260928120300, 20260928120310 y 20260928120320.';
  end if;
  if v_md5 = '644e10126796adc1111702290c14f2bb' then
    raise exception 'fn_frescura_sede es la de 20260928120300: pega antes 20260928120310_frescura_lectura_revision3.sql y 20260928120320_frescura_lectura_revision7.sql.';
  end if;
  if v_md5 = '51babffc09da4073691ee251882967c8' then
    raise exception 'fn_frescura_sede es la de 20260928120310: pega antes 20260928120320_frescura_lectura_revision7.sql.';
  end if;
  if v_md5 not in ('7da85d7b7010659ba5a36a2478c89ad4', '33970c94c7dddf9530ee6b8175862661') then
    raise exception 'fn_frescura_sede tiene otro cuerpo (md5 %): no es la de 20260928120320 ni la de este archivo; alguien la cambió en vivo. Reescribe desde su definición real antes de pegar.', v_md5;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- La lectura de una tienda (la de 20260928120320 con las cuatro correcciones de la revisión 9)
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
  'ADR-0208 (paso 3 de Frescura 3c): la lectura de una tienda para Frescura del piso, en un solo jsonb. prendas (stock distinto de 0 hoy fuera de la cuarentena o algún movimiento en la ventana; sin la Prenda sin registrar ni productos es_prueba), con su temporada (fn_temporada_efectiva_nucleo, también de lo descontinuado), si es clásica, el fin de la estación de la llegada de su modelo+color A CAYLA que cuenta (ultima_llegada_cayla: la última por lote o producción —de una orden que sigue inventariada— en cualquier sede, fn_es_llegada_a_cayla; sin ninguna, la primera carga inicial; la recepción de un traslado no), si hoy es su estación, la primera exhibición de su modelo+color (cualquier talla; lo que entra al piso y se aparta entero en el mismo instante no cuenta, pero sí su liberación sin entrega: desde ahí se cuelga) y su última llegada en esa tienda (fn_es_llegada), y su piso y almacén LIBRES de hoy (sin lo apartado) y lo apartado (apartadas_hoy); eventos del piso por prenda [ts, delta, marcas, oid] (1 venta, 2 interno, 4 edad desconocida; en un mismo instante, las entradas primero) para el FIFO de historiaDeCohortes; apartados del piso por prenda [ts, delta] (apartar resta, liberar suma; el saldo al empezar la ventana primero) para el reloj y la vara; tardias (las del núcleo de bajadas con lo que quedó apartado en sus 10 minutos contado como vendido, contra el piso libre de antes, y sin restar lo liberado sin entrega de lo apartado de antes: no son las del indicador de registro, que no lo cuenta) y dudosas. Taller o tienda sin piso y almacén: {"separa_piso": false}. Solo lectura; una llamada al libro y una al núcleo (con W = 10 minutos). Candado: líder y opera la tienda (el módulo frescura nace con la pantalla).';

revoke all on function retail.fn_frescura_sede(uuid, integer) from public, anon;
grant execute on function retail.fn_frescura_sede(uuid, integer) to authenticated;

reset lock_timeout;

notify pgrst, 'reload schema';
