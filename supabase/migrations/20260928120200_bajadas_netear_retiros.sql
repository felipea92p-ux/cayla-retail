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
--     estructura, como la bajada y como Movimientos). Los dos se reconocen por su PAR exacto de origen y destino: piso →
--     cuarentena y cuarentena → almacén no son retiro, y almacén → cuarentena no es bajada.
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
--     Así la misma bajada da la misma fila con cualquier rango que la incluya (prueba T27, por los dos bordes: p_desde y
--     p_hasta).
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
-- que la bajada, el retiro a 11 minutos, la «dudosa» con retiro y la que un retiro dejaría en >= 0, dos bajadas en el
-- mismo instante, dos retiros que se suman, el retiro previo que evita una tardía), T26 (carga inicial, también con dos
-- entradas en el mismo instante), T27 (bordes del rango por p_desde y por p_hasta, con la disputa de una bajada de
-- fuera), T28 (la misma hora exacta, también con un retiro), T30 (el límite de abajo que queda por decidir), T31
-- (piso→cuarentena no es retiro, la ventana y el margen siguen a p_minutos, el orden de los estados, el desempate por
-- hora antes que por id, la carga inicial de otro instante o de otra tienda; desde la revisión 2: cuarentena → almacén
-- no es retiro, almacén → cuarentena no es bajada ni se lleva un retiro, dos ventas iguales del mismo instante se suman,
-- el borde exacto de p_desde − 2W, la carga de 1 segundo antes o 30 después, el retiro con la bajada de después a medio
-- segundo, el orden de salida y el rango por defecto), T29 (dos retiros IGUALES que se suman y evitan una tardía), T32
-- (lo que esconde la regla del piso de antes, decidida el 2026-09-27: ver LÍMITES) y T32 (gemelos) (lo que esa regla
-- evita: culpar a quien corrige), T22-T23 (las dos guardas; la de esta migración mira el núcleo Y la puerta, con cada
-- una parchada en vivo; desde la revisión 3, la de la 120100 también mira el núcleo). Desde la revisión 3
-- (2026-09-27): T27 (único retiro) (el ÚNICO retiro de la tienda cae fuera de [p_desde, p_hasta) pero dentro de la
-- ventana ampliada, y aun así decide la rama con retiros), T17 (con retiros) (los bordes de p_desde y p_hasta también en
-- esa rama) y T33 («cerrada» no es final).
-- En PRODUCCIÓN (ensayo de solo lectura del 2026-09-27: este cuerpo como un `select` sobre Tienda TRU, sin crear nada):
-- 40 bajadas (199 unidades) y ningún retiro en el rango; 0 filas cambian de piso_antes, de estado o de tardías
-- respecto de la 0300; 15 salen con es_carga_inicial (95 unidades, todas del 26-sep) y ninguna otra. Repetido con el
-- cuerpo de la revisión 2 (el mismo `select`): las mismas 40 filas, 0 distintas del cálculo anterior y de la 0300.
--
-- CÓMO SE CALCULA, y por qué así. Ningún paso cruza dos conjuntos CALCULADOS entre sí: todo se junta ordenando por
-- prenda y hora (funciones de ventana: la bajada más cercana antes y después de cada retiro, lo retirado en la ventana,
-- lo vendido en [t, t + W], la carga del mismo instante) o agrupando por id (cada bajada con su punto del libro). Los
-- únicos cruces que quedan son búsquedas por índice en tablas (movimientos, venta_items, ventas, bajada_piso_items).
-- Si la tienda no tiene ningún retiro entre p_desde − 2W y p_hasta + 2W (lo normal hoy), los pasos de los retiros ni
-- se recorren. Se mira esa ventana ampliada y no el rango pedido: un retiro de fuera del rango puede tocarle a una
-- bajada del rango (T27 (único retiro)).
--   DESCARTÉ (1) la versión anterior de este mismo archivo (nunca pegada; núcleo 94d587570d8db50cf69c9b6bd982a01e):
--   cruzaba los retiros con sus bajadas y las bajadas con el libro y con las ventas. Con la tabla de movimientos de una
--   sola tienda iba bien, pero con historia de OTRA tienda Postgres estima esos pasos en 1 a 30 filas cuando son miles,
--   y los cruza fila por fila: con 60.000 entradas de Tienda Lima, 30 días pasaban de 39 ms a 417 ms y 60 días de
--   129 ms a 2,97 s (revisión del 2026-09-27). La 120100 (el cálculo de producción) tiene el mismo defecto con más
--   historia (60 días: 15,7 s con 300.000 movimientos de otra tienda); este núcleo la reemplaza.
--   DESCARTÉ (2) apagar los bucles anidados (`set enable_nestloop = off`) en el núcleo: da las mismas filas y quita el
--   colapso, pero también apaga las búsquedas por índice (la del libro en venta_items y ventas, la de las ventas en
--   movimientos): cada llamada recorre esas tablas enteras, aunque pida un día. Medido: 1 día, de 11 a 41 ms con
--   336.000 movimientos, y crece con la tabla, no con lo pedido.
-- CUÁNTO CUESTA (Postgres 17 desechable, con el libro de 20260928120010; una tienda, 2.000 prendas, 20.001 bajadas y
-- 10.001 ventas a 120 días; mediana de 5 a 7 corridas intercaladas):
--   · sin retiros: 313 ms la 120100, 333 ms este núcleo (+6 %); a 30 días, 37 y 41 ms.
--   · con 4.001 retiros (dos por prenda: mucho más de lo que pasa en una tienda): 338 y 409 ms (+21 %); a 30 días, 37 y
--     45 ms. La versión anterior de este archivo: 328 y 368 ms, pero sin historia de otra tienda (abajo).
--   · con 60.000 entradas de Tienda Lima en un año (y los retiros): 30 días 37 / 45 ms, 60 días 136 / 166 ms, 120 días
--     350 / 443 ms (la versión anterior de este archivo: 438 ms, 2,93 s y 379 ms).
--   · con 300.000 movimientos de otra tienda en dos años: 1 día 11 ms, 30 días 45 ms, 60 días 164 ms, 120 días 450 ms
--     (la 120100 a 30 días: 673 ms; la versión anterior de este archivo: 430 ms).
--
-- LÍMITES (escritos en ADR-0208):
--   · Un retiro legítimo de la misma prenda dentro de la ventana también se descuenta (no hay forma de distinguirlo
--     hasta el motivo del retiro de 3b).
--   · Con varios retiros y re-bajadas de la misma talla en 10 minutos, la corrección puede ir a la bajada equivocada (la
--     más cercana no siempre es la que se corrigió), aunque el total de cantidades efectivas cuadra.
--   · El piso de antes suma TODO lo retirado en [t − W, t), también un retiro que la regla le descontó a OTRA bajada
--     (DECIDIDO el 2026-09-27; pruebas T30, T32 y T32 (gemelos)). El libro solo ve «bajada, retiro, bajada, ventas»: no
--     sabe si las prendas retiradas nunca llegaron a colgarse («colgaron de más», A) o se retiraron por error y la
--     bajada siguiente las volvió a colgar (B). Con la misma forma en el libro, toda regla acierta en una y falla en la
--     otra.
--       DECIDÍ: se queda la regla vigente. En B nunca culpa a quien corrige: en los gemelos de T32 la re-bajada que
--         corrige sale con 0 tardías y «normal», y también cuando la corrección se hace en dos re-bajadas de 1. ADR-0208
--         pone primero no castigar al equipo por corregir o por atender bien.
--       DESCARTÉ: la «variante C» (sumar al piso de antes solo lo retirado ANTES de la bajada que la regla le asignó a
--         ESA misma bajada). Atrapa las tardías de T30 y T32 (A), pero en los gemelos de T32 (B) culpa a quien corrige:
--         la re-bajada sale «tardia» con 2 tardías (y con 1 en la corrección hecha en dos re-bajadas). También descarté
--         «sumar solo lo retirado que no se volvió a colgar»: arregla T30 y no T32.
--       SE ROMPE SI una colaboradora cuelga menos de lo escaneado, retira el sobrante y en los 10 minutos siguientes otra
--         baja la misma talla y se vende: esa tardía no se ve (T32: piso_antes 3 cuando el libro dice 1; con la carga
--         inicial, 10 cuando dice 6). Igual con un retiro por error ya repuesto y una bajada real 2 minutos después: el
--         retiro cuenta dos veces (T30: piso_antes 4, el libro nunca pasó de 3). Lo que distingue A de B es el motivo del
--         retiro del 3b. Hoy TRU no tiene retiros: en producción no cambia nada; sí pesa en el indicador del paso 3.
--   · «cerrada» no es final (T33). Una bajada se cierra a los W minutos, pero su fila puede cambiar hasta 2W después: si
--     un retiro de su ventana queda más cerca de una bajada de la misma talla que llega DESPUÉS, el retiro pasa a esa, y
--     la primera solo puede perder retiros (su efectiva y sus tardías suben, nunca bajan). Piso 0; se baja 1 y a los 2
--     minutos se vende; una clienta devuelve 1 al piso; a los 9 se retira 1 → «corregida», y cerrada al minuto 10. Al
--     minuto 10 otra baja 1: el retiro queda a 1 minuto de esa y a 9 de la primera, que pasa a «tardia» con 1 tardía.
--   · La carga inicial se reconoce por el instante exacto: si alguien la registra en dos transacciones (carga y, aparte,
--     su bajada), no se marca.
--
-- LA GUARDA. Solo sigue si las DOS funciones vivas son las de 20260928120100 (núcleo 8d38d6dd6c657ab06b2e8a7c0b66a53b,
-- puerta 34a7e0cc5f421333761e8bda92a582eb) o las de esta misma migración ya pegada (núcleo
-- fcfd2c4b2c4f24dd2184eb2cd7a12678, la misma puerta: se puede volver a pegar). Con cualquier otro cuerpo, en el
-- núcleo o en la puerta, aborta sin tocar nada (T23 lo prueba con cada una parchada en vivo). Sin el núcleo, pide pegar
-- antes la 120100. (El núcleo de la revisión 2, 08bfa7b8d2c90eaed85a5c4366a21db4, nunca se pegó: la revisión 3 solo
-- corrigió dos comentarios de su cuerpo, y el md5 mide también los comentarios.)
--
-- CÓMO SE PEGA EN PRODUCCIÓN. Sola, en el SQL Editor, tal cual (ya trae `retail.`), DESPUÉS de la 20260928120100. Cambia
-- las columnas que devuelven las dos funciones, así que usa `drop function` + `create` (no toma las tablas de auth y
-- storage: ADR-0195) y vuelve a dar los permisos. Sin políticas, sin `drop trigger`, sin `alter` de tablas. Todo en una
-- transacción: nadie ve las funciones a medias. Re-ejecutable.
-- Cómo se verifica después: `select proname, md5(prosrc) from pg_proc where pronamespace = 'retail'::regnamespace and
-- proname like 'fn_bajadas_del_piso%';` da núcleo fcfd2c4b2c4f24dd2184eb2cd7a12678 y puerta
-- 34a7e0cc5f421333761e8bda92a582eb (el cuerpo de la puerta no cambia, solo sus columnas: mide lo mismo que tras la
-- 120100).
--
-- SE ROMPE SI la carga inicial deja de bajar en la misma transacción que su entrada (es_carga_inicial se apaga sin
-- aviso), si «Retirar del piso» empieza a devolver a otra sububicación que no sea el almacén de la tienda (el retiro
-- dejaría de descontarse), o si alguien vuelve a escribir un cruce entre dos pasos calculados (con historia de otra
-- tienda, la pantalla pasaría de milisegundos a segundos sin que ninguna prueba de conducta lo vea: se mide con carga).
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
       or (v_nucleo = 'fcfd2c4b2c4f24dd2184eb2cd7a12678' and v_puerta = '34a7e0cc5f421333761e8bda92a582eb')) then
    raise exception 'fn_bajadas_del_piso o su núcleo cambiaron desde que se escribió esta migración (md5 núcleo %, puerta %; se esperaba 8d38d6dd6c657ab06b2e8a7c0b66a53b y 34a7e0cc5f421333761e8bda92a582eb). Alguien las parchó en vivo: reescribe desde su definición real antes de pegar.', v_nucleo, v_puerta;
  end if;
end $$;

-- Cambian las columnas: primero la puerta (depende del núcleo por nombre), después el núcleo.
drop function if exists retail.fn_bajadas_del_piso(uuid, timestamptz, timestamptz, integer);
drop function if exists retail.fn_bajadas_del_piso_nucleo(uuid, timestamptz, timestamptz, integer);

-- ----------------------------------------------------------------------------
-- 1. El núcleo: cada retiro a una sola bajada, el piso de antes con lo retirado, la carga inicial marcada. Sin cruces
--    entre pasos calculados (ver «CÓMO SE CALCULA» arriba).
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
  -- La hora de Postgres tiene microsegundos: «un instante después» es + 1 µs, y [t − W, t) es [t − W, t − 1 µs].
  c_instante constant interval := interval '1 microsecond';
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

  -- CÓMO SE ARMA: ningún paso cruza dos conjuntos calculados entre sí. Postgres no sabe cuántas filas traen el libro ni
  -- estos pasos (con historia de otra tienda los estima en 1 a 30 filas cuando son miles) y un cruce entre dos de ellos
  -- se va fila por fila: 60 días pasaban de 0,13 s a 3 s (revisión del 2026-09-27). Aquí todo se junta ordenando por
  -- prenda y hora (funciones de ventana) o agrupando por id; los únicos cruces son búsquedas por índice en tablas
  -- (movimientos, venta_items, ventas, bajada_piso_items), que crecen con lo leído y no con su cuadrado.
  return query
  with internos as materialized (
    -- Los traslados entre el almacén y el piso de la MISMA tienda, por estructura (como Movimientos): la bajada
    -- (almacén → piso) y su par inverso, el retiro («Retirar del piso», piso → almacén), cada uno por su PAR exacto:
    -- piso ↔ cuarentena y almacén ↔ cuarentena no son ni lo uno ni lo otro. Desde dos ventanas antes del rango hasta
    -- dos después: un retiro que toca a una bajada del rango está a una ventana de ella, y la bajada que puede
    -- disputárselo, a una ventana más del retiro.
    select m.id, m.variante_id, m.usuario_id, m.created_at as t, m.cantidad, (m.sububicacion_id = v_alm) as es_bajada
      from movimientos m
     where m.ubicacion_id = p_ubicacion_id
       and fn_es_traslado_interno(m.tipo, m.ubicacion_id, m.ubicacion_destino_id)
       and ((m.sububicacion_id = v_alm and m.sububicacion_destino_id = v_piso)
         or (m.sububicacion_id = v_piso and m.sububicacion_destino_id = v_alm))
       and m.created_at >= v_desde - 2 * v_ventana and m.created_at <= v_hasta + 2 * v_ventana
       and m.variante_id <> c_centinela
  ),
  cercanas as (
    -- Solo si la tienda tiene algún retiro entre p_desde − 2W y p_hasta + 2W (en `internos`, no solo en el rango
    -- pedido: un retiro de fuera del rango puede tocarle a una bajada del rango). Lo normal es que no haya: entonces
    -- este paso ni se recorre. En la línea de tiempo de cada prenda, a una ventana o menos: la hora de la bajada más
    -- cercana ANTES del retiro o en su mismo instante, la de la más cercana DESPUÉS, y lo retirado en [t − W, t] (el
    -- mismo instante se descuenta abajo).
    select i.id, i.variante_id, i.usuario_id, i.t, i.cantidad, i.es_bajada,
           max(i.t) filter (where i.es_bajada) over hasta_ahora as t_antes,
           coalesce(sum(i.cantidad) filter (where not i.es_bajada) over hasta_ahora, 0) as retirado_hasta,
           min(i.t) filter (where i.es_bajada) over despues as t_despues
      from internos i
     where exists (select 1 from internos r where not r.es_bajada)
    window hasta_ahora as (partition by i.variante_id order by i.t
                           range between v_ventana preceding and current row),
           despues as (partition by i.variante_id order by i.t
                       range between c_instante following and v_ventana following)
  ),
  destinos as (
    -- LA REGLA: cada retiro va al instante de la bajada más cercana; si las dos quedan a la misma distancia, a la de
    -- ANTES del retiro. Sin bajada a una ventana o menos, a ninguno (nulo). Cada bajada, a su propio instante.
    select c.*,
           case when c.es_bajada then c.t
                when c.t_antes is not null
                     and (c.t_despues is null or c.t - c.t_antes <= c.t_despues - c.t) then c.t_antes
                else c.t_despues end as t_destino
      from cercanas c
  ),
  repartidas as (
    -- Por prenda e instante de destino, las bajadas primero y por id: lo retirado que va a ese instante se lo lleva UNA
    -- sola bajada, la de menor id (dos bajadas de la prenda en el mismo instante solo se arman a mano). Aquí también se
    -- cuenta lo retirado en el MISMO instante de cada bajada: todos esos retiros eligen ese instante (distancia 0).
    select d.id, d.variante_id, d.usuario_id, d.t, d.cantidad, d.es_bajada, d.retirado_hasta,
           row_number() over resto as puesto,
           coalesce(sum(d.cantidad) filter (where not d.es_bajada) over resto, 0) as al_instante,
           coalesce(sum(d.cantidad) filter (where not d.es_bajada and d.t = d.t_destino) over resto, 0)
             as mismo_instante
      from destinos d
    window resto as (partition by d.variante_id, d.t_destino order by d.es_bajada desc, d.id
                     rows between current row and unbounded following)
  ),
  bajadas as materialized (
    -- Las bajadas del rango con lo retirado en [t − W, t) y lo que les tocó de los retiros. Si la tienda no tiene
    -- ningún retiro entre p_desde − 2W y p_hasta + 2W, 0 y 0 (la primera mitad); si tiene alguno, salen de `repartidas`.
    select i.id, i.variante_id, i.usuario_id, i.t, i.cantidad, 0 as retirado_antes, 0 as retiradas
      from internos i
     where i.es_bajada and i.t >= v_desde and i.t < v_hasta
       and not exists (select 1 from internos r where not r.es_bajada)
    union all
    select r.id, r.variante_id, r.usuario_id, r.t, r.cantidad, (r.retirado_hasta - r.mismo_instante)::integer,
           (case when r.puesto = 1 then r.al_instante else 0 end)::integer
      from repartidas r
     where r.es_bajada and r.t >= v_desde and r.t < v_hasta
  ),
  piso as materialized (
    -- UNA llamada al libro con todas las prendas de las bajadas. Sin bajadas va un arreglo vacío, nunca nulo: nulo le
    -- pide al libro TODAS las prendas de la tienda.
    select pt.oid, pt.variante_id, pt.ts, pt.delta, pt.nivel, pt.es_venta
      from fn_ledger_puntos(p_ubicacion_id, v_desde,
                            (select coalesce(array_agg(distinct b.variante_id), '{}'::uuid[]) from bajadas b)) pt
     where pt.bucket = 'piso' and pt.ord = 1
  ),
  linea as (
    -- UNA línea de tiempo por prenda con tres clases de fila:
    --   · cada punto del libro que SUBE el piso (entre ellos, el de cada bajada: mismo id, mismo instante), con el
    --     nivel justo antes (nivel − delta);
    --   · cada venta desde el piso, a la hora de la VENTA (en el cubo del piso, delta negativo = la salida fue DEL
    --     piso; una venta desde el almacén no deja punto aquí; la «Prenda sin registrar» que se regulariza no cuenta);
    --   · cada entrada de carga inicial (ADR-0212, ADR-0235: se escribe con su bajada en la MISMA transacción, así que
    --     comparten el instante exacto).
    select p.oid as id, p.variante_id, p.ts as t, (p.nivel - p.delta)::integer as nivel_antes, 0 as vendida,
           null::timestamptz as t_carga
      from piso p
     where p.delta > 0
    union all
    select null, p.variante_id, coalesce(ve.created_at, m.created_at), null, (-p.delta)::integer, null
      from piso p
      join movimientos m on m.id = p.oid
      left join venta_items vi on vi.id = m.venta_item_id
      left join ventas ve on ve.id = vi.venta_id
     where p.es_venta and p.delta < 0
       and not exists (select 1 from prendas_por_regularizar pr where pr.venta_item_id = m.venta_item_id)
    union all
    select null, m.variante_id, m.created_at, null, 0, m.created_at
      from movimientos m
     where m.ubicacion_id = p_ubicacion_id
       and m.tipo = 'entrada' and m.motivo = 'carga_inicial'
       and m.created_at >= v_desde and m.created_at < v_hasta
  ),
  medidas as (
    -- Para cada punto, en UN recorrido: lo vendido en [t, t + W] (los dos extremos incluidos) y si hay una carga
    -- inicial en su mismo instante (la más temprana de [t, t + W] es la de t).
    select l.id, l.variante_id, l.t, l.nivel_antes,
           sum(l.vendida) over w as vendidas,
           coalesce(min(l.t_carga) over w = l.t, false) as es_carga
      from linea l
    window w as (partition by l.variante_id order by l.t range between current row and v_ventana following)
  ),
  juntas as (
    -- Cada bajada con SU punto del libro: se agrupan por id (el punto y la bajada son el mismo movimiento), sin cruzar.
    -- Una bajada sin punto no sale (toda bajada suma cantidad > 0 al piso de una tienda activa: no pasa).
    select j.id, j.variante_id, j.t,
           max(j.usuario::text)::uuid as usuario_id, max(j.cantidad) as cantidad,
           max(j.nivel_antes) as nivel_antes, max(j.vendidas)::integer as vendidas, bool_or(j.es_carga) as es_carga,
           max(j.retirado_antes) as retirado_antes, max(j.retiradas) as retiradas
      from (select b.id, b.variante_id, b.t, b.usuario_id as usuario, b.cantidad, null::integer as nivel_antes,
                   null::bigint as vendidas, null::boolean as es_carga, b.retirado_antes, b.retiradas, true as es_bajada
              from bajadas b
            union all
            select x.id, x.variante_id, x.t, null, null, x.nivel_antes, x.vendidas, x.es_carga, null, null, false
              from medidas x
             where x.id is not null) j
     group by j.id, j.variante_id, j.t
    having bool_or(j.es_bajada) and max(j.nivel_antes) is not null
  ),
  calc as (
    --   el nivel justo antes negativo = el stock y el libro no cuadran → «dudosa», con ese nivel y sin sumar retiros;
    --   si no, piso_antes = ese nivel + lo retirado en [t − W, t).
    select j.id, j.variante_id, j.usuario_id, j.t, j.cantidad,
           j.nivel_antes < 0 as dudosa,
           (case when j.nivel_antes < 0 then j.nivel_antes
                 else j.nivel_antes + j.retirado_antes end)::integer as piso_antes,
           j.vendidas,
           j.retiradas,
           greatest(0, j.cantidad - j.retiradas)::integer as efectiva,
           j.es_carga
      from juntas j
  )
  select c.id, i.bajada_id, c.variante_id, c.usuario_id, c.t, c.cantidad, c.piso_antes, c.vendidas,
         case when c.dudosa then null else least(c.efectiva, greatest(0, c.vendidas - c.piso_antes))::integer end,
         (c.t + v_ventana <= now()),
         case when c.dudosa then 'dudosa'
              when c.efectiva = 0 then 'corregida'
              when least(c.efectiva, greatest(0, c.vendidas - c.piso_antes)) > 0 then 'tardia'
              when c.t + v_ventana > now() then 'en_curso'
              else 'normal' end,
         c.retiradas,
         c.efectiva,
         c.es_carga
    from calc c
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
