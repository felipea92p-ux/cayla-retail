-- ============================================================================
-- 20260928120300_frescura_lectura.sql — CAYLA V2 · ADR-0208 «Frescura del piso» · paso 3 de Frescura 3c
-- («Lectura y reglas», la parte SQL). Cuatro funciones nuevas de SOLO LECTURA (y `fn_temporada_efectiva` pasa a envolver
-- una de ellas, con las mismas filas); no crea tablas ni módulos.
--
-- EL PROBLEMA PRIMERO. Frescura tiene que decir, por cada prenda colgada en una tienda, cuántos días lleva a la vista y
-- si es más lenta que las de su categoría en esa tienda (la «vara», Kaplan-Meier en la web), y avisar cuando su
-- temporada ya pasó. Todo eso sale del libro de movimientos (ADR-0202), pero hoy ninguna lectura junta en un solo viaje
-- lo que hace falta: qué prendas mirar (también las que cuelgan sin moverse hace meses), la historia del piso de cada
-- una con la marca de «edad desconocida» (ADR-0248: la mitad del piso de TRU se colgó antes de que existiera el
-- sistema), las bajadas tardías que hay que sacar de la vara (paso 2), y su temporada con el fin de su estación
-- (ADR-0246). Y el indicador de «confianza del registro» (qué tan a tiempo se registran las bajadas) no existe.
--
-- QUÉ CREA
--   1. `retail.fn_es_llegada(tipo, motivo, lote, producción, recepción)`, immutable: el predicado de «llegada de
--      mercadería» que vive dentro de `fn_resumen_comparacion` (20260924030000, CTE `entradas`), con nombre propio y la
--      misma lógica exacta: una ENTRADA con lote, con producción, con recepción de traslado, o de carga inicial. En un
--      WHERE da lo mismo que el original; fuera de él nunca devuelve nulo (nulo = no es llegada). La prueba compara las dos
--      en todas las filas del libro del seed y en todas las combinaciones, y vigila que el original no cambie.
--      `fn_resumen_comparacion` NO se toca (recrearla borraría sus parches vivos).
--   2. `retail.fn_frescura_sede(p_ubicacion_id, p_dias default 120) → jsonb`. Candado: `fn_es_lider()` y
--      `fn_puede_operar_ubicacion(p_ubicacion_id)`; si no, P0001 con la pista `frescura_sin_permiso`. El módulo
--      `frescura` nace con la pantalla (paso 4), no aquí (ADR-0208, «Actualización 2026-09-27 — diseño 3c», decisión 4).
--      Taller, tienda que no separa piso y almacén, inactiva o inexistente → {"separa_piso": false}. Si separa:
--        {"separa_piso": true, "desde", "ahora",
--         "prendas": [{variante_id, producto_id, producto_nombre, codigo, color_codigo, color_nombre, talla, categoria_id,
--                      categoria_nombre, temporada, temporada_origen, es_clasico, fin_estacion, en_estacion_ahora,
--                      primera_exhibicion, ultima_llegada, piso_hoy, almacen_hoy}],
--         "eventos": {"<variante_id>": [[ts, delta, marcas, oid], ...]},
--         "tardias": [{oid, variante_id, bajada_en, unidades_tardias}],
--         "dudosas": ["<variante_id>", ...]}
--      · QUÉ PRENDAS: las que tienen stock distinto de 0 hoy en el piso o el almacén de la tienda (la cuarentena no es
--        piso ni se ofrece: una prenda que solo está ahí no entra) y las que tuvieron un movimiento de la tienda en la
--        ventana (también las que se vendieron enteras: sin ellas no hay vara). Nunca la «Prenda sin registrar» ni un
--        producto `es_prueba`.
--      · EVENTOS: los puntos de PISO del libro desde `desde`, en su orden (hora, saldo inicial primero, id), para el
--        FIFO de `historiaDeCohortes` (apps/web/lib/inventario-exposicion.ts: el ÚNICO FIFO; aquí no se arman cohortes).
--        El saldo inicial va solo si no es 0. marcas: 1 = venta; 2 = interno (piso↔almacén o cuarentena de la misma
--        tienda); 4 = EDAD DESCONOCIDA (solo en lo que entra al piso): el saldo con que arranca la ventana, lo que entra
--        al piso sin ser interno ni llegada (un ajuste, una devolución, una venta anulada, lo que llega de otra sede como
--        traslado directo), la bajada de la carga inicial (el núcleo del paso 2 la marca) y, por las dudas, una entrada
--        de carga inicial directa al piso (hoy ninguna puerta la escribe: la carga va al almacén).
--      · tardias: las bajadas del núcleo (`fn_bajadas_del_piso_nucleo`, paso 2) cerradas, ni «dudosa» ni «corregida», con
--        alguna unidad tardía; la web resta esas unidades antes de armar la vara. dudosas: prendas con alguna bajada
--        «dudosa» (el stock y el libro no cuadran).
--      · primera_exhibicion: la primera vez que el MODELO+COLOR (cualquiera de sus tallas, esté o no en la lista) entró al
--        piso de ESTA tienda, en toda su historia (no solo la ventana): la unidad de la novedad es el modelo+color
--        (ADR-0208, decisiones 4 y 9). Por talla habría dejado fuera la talla agotada antes de la ventana (no está en la
--        lista) y la prenda repuesta en OTRA talla habría vuelto a ser «Nueva» (revisión 3, caso X9). Todas las tallas
--        de un modelo+color traen el mismo valor. ultima_llegada: la última llegada (`fn_es_llegada`) de esa talla a la
--        tienda, en toda su historia. La web junta el modelo+color.
--      · temporada y temporada_origen: `fn_temporada_efectiva_nucleo(null, true)` (color → producto → categoría;
--        ADR-0246), que incluye las variantes INACTIVAS: una talla descontinuada que sigue colgada conserva su
--        temporada (con `fn_temporada_efectiva`, que solo mira activas, perdía la temporada y el aviso). es_clasico:
--        `fn_temporadas`. fin_estacion: el fin de la aparición de su temporada que corresponde a su ÚLTIMA llegada
--        (`fn_ocurrencia_temporada`; decidido el 2026-09-27: la última llegada, no la cohorte más vieja). Si fin_estacion
--        ya pasó y no es clásico, la web dice «Temporada pasada». en_estacion_ahora: si HOY cae dentro de su estación
--        (cualquier año; lo que la web usa para sugerir guardar un clásico de verano fuera del verano). Sin temporada, o
--        «Clásico · todo el año», o sin calendario que alcance: nulo.
--      · UNA llamada a `fn_ledger_puntos` (con la lista de prendas, nunca nula: nula le pide al libro solo las que se
--        movieron y deja fuera las colgadas quietas) y UNA a `fn_bajadas_del_piso_nucleo`.
--   3. `retail.fn_confianza_registro(p_ubicacion_id default null, p_meses default 2)`: por tienda y mes calendario de
--      Lima (el actual y los anteriores; de 1 a 3, porque el núcleo lee hasta 120 días), las bajadas del núcleo que
--      cuentan (filas), sus unidades (Σ cantidad_efectiva), sus unidades tardías, confianza = 1 − tardías ÷ unidades
--      (nula sin unidades) y el nivel por filas: 'pocos_datos' 1-9, 'aceptable' 10-19, 'solido' 20 o más (nulo con 0).
--      Una fila por tienda y mes aunque no haya bajadas. Fuera: las no cerradas, «dudosa», «corregida», las de productos
--      `es_prueba` (como en fn_frescura_sede: una bajada de práctica no es el hábito del equipo), las de la carga
--      inicial (no dicen nada del hábito del equipo; en TRU eran 95 de 199 unidades) y las de hace menos de 2W (20
--      minutos): una fila cerrada todavía puede cambiar hasta 2W después de la bajada (ADR-0208, T33), y la cifra no
--      debe moverse después de mostrarse. SIN persona_id: el indicador es del equipo, nunca de una persona. Candado:
--      `fn_es_lider()`; con una tienda, además `fn_puede_operar_ubicacion`. El Taller no sale (no tiene piso).
--   4. `retail.fn_temporada_efectiva_nucleo(p_producto_id, p_con_inactivas)`: la regla de la temporada efectiva de
--      ADR-0246 (color → producto → categoría), que vivía dentro de `fn_temporada_efectiva`, con la opción de incluir
--      las variantes inactivas. `fn_temporada_efectiva(p)` pasa a envolverla con `false`: misma firma, mismas filas
--      (la prueba lo compara en todo el catálogo), y la regla sigue en UNA función. Sin EXECUTE para nadie de afuera.
--      Si alguien vuelve a pegar 20260928100000, `fn_temporada_efectiva` vuelve a su cuerpo original (mismas filas) y
--      Frescura no se entera: llama al núcleo.
--
-- CÓMO SE ARMA (lo aprendido en el paso 2): ningún paso cruza dos conjuntos CALCULADOS entre sí. Postgres no sabe
-- cuántas filas devuelve una función y, con una estimación de 1 fila, cruza fila por fila. Aquí lo calculado se junta
-- con búsquedas por índice en tablas (por prenda: su stock y su historia), o con mapas jsonb de una sola fila (la
-- temporada de cada modelo+color, el fin de cada aparición, las bajadas de carga inicial) que se leen por clave.
-- `fn_ocurrencia_temporada` se llama una vez por pareja distinta (temporada, última llegada), no por prenda.
--
-- CUÁNTO CUESTA (medido el 2026-09-27 en un Postgres 17 desechable; una tienda, 2.000 prendas en 200 modelos con
-- temporada, 20.000 bajadas, 10.000 ventas; cada prenda llegada a una hora distinta, el peor caso para
-- fn_ocurrencia_temporada; mediana de 7 corridas):
--   · fn_frescura_sede a 120 días: 733 ms (722-757). De eso, el núcleo de bajadas ~330 ms y el libro ~180 ms; el jsonb
--     sale de 3,9 MB (2.016 prendas, 30.002 eventos) y viaja solo entre la base y el servidor. A 30 días: 205 ms.
--   · fn_confianza_registro de una tienda (2 meses): 126 ms; de todas: 127 ms.
--   · Tras la revisión 3 (primera exhibición por modelo+color, temporada con lo inactivo, sin productos de prueba en el
--     indicador), la misma carga: fn_frescura_sede 754 ms (751-799) a 120 días y 233 ms a 30; fn_confianza_registro
--     128 ms de una tienda y 140 ms de todas.
-- EN PRODUCCIÓN (ensayo de solo lectura del 2026-09-27: este cuerpo como un `select` sobre Tienda TRU, sin crear nada):
-- 89 prendas (45 en el piso, 50 con almacén; 44 modelo+color); 21 prendas con edad desconocida, todas en el piso: 107 de
-- las 211 unidades que entraron al piso (95 de las 15 bajadas de la carga inicial, marca 6, y 12 de los ajustes
-- «reposicion» al piso del 24-sep, marca 4); 89 de 89 sin temporada; 0 con temporada pasada; 34 sin ninguna llegada
-- (entraron por ajustes «reposicion» y «conteo_fisico» al almacén); 1 tardía y 0 dudosas. La confianza de TRU en
-- setiembre: 25 bajadas, 104 unidades, 1 tardía (0,9904, «solido»); con la carga inicial habrían sido 40 y 199.
--
-- LA GUARDA. Pide lo que usa (el libro, el núcleo del paso 2 con `es_carga_inicial`, las funciones de temporadas de
-- ADR-0246) y, si alguna de las cuatro funciones de este archivo ya existe con otro cuerpo, aborta sin tocar nada: alguien
-- la parchó en vivo y pegar esto borraría el parche (lo que rompió Análisis con el PR 397). Con el cuerpo de este mismo
-- archivo sigue: se puede pegar dos veces. `fn_temporada_efectiva`, que SÍ se reescribe (pasa a envolver al núcleo),
-- tiene que tener su cuerpo de 20260928100000 (md5 1cc652ba…, el mismo que producción el 2026-09-27) o el de este archivo.
--
-- CÓMO SE PEGA EN PRODUCCIÓN. Sola, en el SQL Editor, tal cual (ya trae `retail.`), a cualquier hora, DESPUÉS de
-- 20260928120200 (ya pegada el 2026-09-27). Solo `create or replace function`, comentarios, `revoke` y `grant`: sin
-- políticas, sin `drop trigger`, sin `alter` de tablas (ADR-0195). Ninguna pantalla la llama todavía: la web del paso 4
-- se publica después.
-- Cómo se verifica después (solo lectura):
--   select proname, md5(prosrc) from pg_proc where pronamespace = 'retail'::regnamespace
--    and proname in ('fn_es_llegada', 'fn_frescura_sede', 'fn_confianza_registro', 'fn_temporada_efectiva_nucleo',
--                    'fn_temporada_efectiva');
-- da los cinco md5 de la guarda de abajo (el de fn_temporada_efectiva, el de su versión NUEVA).
--
-- SE ROMPE SI la carga inicial vuelve a entrar sin su bajada en la misma transacción (su bajada pierde la marca 4 y la
-- prenda sale «Nueva»), si alguien agrega otra forma de «llegada» en `fn_resumen_comparacion` sin cambiar
-- `fn_es_llegada` (la prueba lo avisa: compara el texto del original), si un traslado entre tiendas vuelve a escribirse
-- como `traslado` directo al piso (llega con edad desconocida y no es «Nueva» en la tienda nueva), o si alguien escribe un
-- cruce entre dos pasos calculados (se ve solo con carga: medir antes de publicar).
-- PENDIENTE DE FELIPE (revisión 3): `fin_estacion` sale de la última llegada a la TIENDA, y la recepción de un traslado
-- cuenta como llegada (`fn_es_llegada`, el mismo predicado de Análisis). La chompa de invierno que llegó del proveedor en
-- julio de 2025 y se trasladó en abril de 2026 queda con el fin del invierno 2026: la tienda que la recibe no ve
-- «Temporada pasada» hasta setiembre. Si Felipe decide que para la temporada manda la última llegada a CAYLA (lote,
-- producción o carga inicial, en cualquier tienda), va como un segundo predicado con nombre propio; `fn_es_llegada` no
-- se toca.
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
     or to_regprocedure('retail.fn_temporada_efectiva(uuid)') is null
     or to_regprocedure('retail.fn_temporadas()') is null then
    raise exception 'Faltan las temporadas (ADR-0246): pega antes 20260928100000_temporadas_como_atributo.sql.';
  end if;
  select md5(p.prosrc) into v_md5 from pg_proc p
   where p.oid = to_regprocedure('retail.fn_es_llegada(text, text, uuid, uuid, uuid)');
  if v_md5 is not null and v_md5 <> '5089ba50874f611d96d5df751b63ed57' then
    raise exception 'fn_es_llegada ya existe con otro cuerpo (md5 %): alguien la cambió en vivo. Reescribe desde su definición real antes de pegar.', v_md5;
  end if;
  select md5(p.prosrc) into v_md5 from pg_proc p
   where p.oid = to_regprocedure('retail.fn_frescura_sede(uuid, integer)');
  if v_md5 is not null and v_md5 <> '618e465d586cf3193e7e8197059f4071' then
    raise exception 'fn_frescura_sede ya existe con otro cuerpo (md5 %): alguien la cambió en vivo. Reescribe desde su definición real antes de pegar.', v_md5;
  end if;
  select md5(p.prosrc) into v_md5 from pg_proc p
   where p.oid = to_regprocedure('retail.fn_confianza_registro(uuid, integer)');
  if v_md5 is not null and v_md5 <> '8c6f5e6c27916b99be10020b772bd6e0' then
    raise exception 'fn_confianza_registro ya existe con otro cuerpo (md5 %): alguien la cambió en vivo. Reescribe desde su definición real antes de pegar.', v_md5;
  end if;
  select md5(p.prosrc) into v_md5 from pg_proc p
   where p.oid = to_regprocedure('retail.fn_temporada_efectiva_nucleo(uuid, boolean)');
  if v_md5 is not null and v_md5 <> '2bf80eb239248cce88cf8062238f4dfc' then
    raise exception 'fn_temporada_efectiva_nucleo ya existe con otro cuerpo (md5 %): alguien la cambió en vivo. Reescribe desde su definición real antes de pegar.', v_md5;
  end if;
  -- fn_temporada_efectiva SÍ se reescribe: su cuerpo tiene que ser el de 20260928100000 (1cc652ba…) o el de este archivo.
  select md5(p.prosrc) into v_md5 from pg_proc p
   where p.oid = to_regprocedure('retail.fn_temporada_efectiva(uuid)');
  if v_md5 not in ('1cc652ba0bef3e9783a014b840cb870f', 'e96b3c6c51fd12ca712e76d63efd6448') then
    raise exception 'fn_temporada_efectiva cambió desde 20260928100000 (md5 %): alguien la parchó en vivo. Reescribe el núcleo desde su definición real antes de pegar.', v_md5;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 1. La llegada de mercadería, con nombre propio
-- ----------------------------------------------------------------------------

create or replace function retail.fn_es_llegada(
  p_tipo text,
  p_motivo text,
  p_lote_id uuid,
  p_produccion_id uuid,
  p_transferencia_recepcion_id uuid
)
returns boolean
language sql
immutable
as $$
  -- El mismo predicado que la CTE `entradas` de fn_resumen_comparacion (20260924030000): lo que llegó del proveedor
  -- (lote), del Taller (producción), de otra tienda (recepción de un traslado) o de la carga inicial. Nulo cuenta como no.
  select coalesce(p_tipo = 'entrada'
    and (p_lote_id is not null or p_produccion_id is not null or p_transferencia_recepcion_id is not null or p_motivo = 'carga_inicial'), false)
$$;

comment on function retail.fn_es_llegada(text, text, uuid, uuid, uuid) is
  'ADR-0208 (paso 3 de Frescura 3c): ¿este movimiento es una LLEGADA de mercadería a la tienda? Una entrada con lote, con producción, con recepción de un traslado, o de carga inicial. Es el predicado de la CTE entradas de fn_resumen_comparacion (20260924030000), con nombre propio y la misma lógica; nunca devuelve nulo. Interna: la usan funciones security definer.';

revoke all on function retail.fn_es_llegada(text, text, uuid, uuid, uuid) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 1b. La temporada efectiva, también de lo descontinuado
-- ----------------------------------------------------------------------------

-- La regla de ADR-0246 (color → producto → categoría), tal cual vivía en fn_temporada_efectiva (20260928100000), con
-- una sola diferencia: `p_con_inactivas`. La pantalla de Temporadas lista lo que se puede completar (solo activas);
-- Frescura mira lo que está colgado, y una talla descontinuada con stock sigue colgada: sin su temporada no avisaría
-- «Temporada pasada» y pediría completar una temporada que ya tiene (revisión 3).
create or replace function retail.fn_temporada_efectiva_nucleo(p_producto_id uuid, p_con_inactivas boolean)
returns table (producto_id uuid, color_codigo text, estado text, temporada text, origen text)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select pc.producto_id,
         pc.color_codigo,
         p.estado,
         coalesce(pct.temporada, p.temporada, c.temporada) as temporada,
         case when pct.temporada is not null then 'color'
              when p.temporada is not null then 'producto'
              when c.temporada is not null then 'categoria' end as origen
    from (select distinct v.producto_id, v.color_codigo
            from retail.variantes v
           where (v.activo or coalesce(p_con_inactivas, false))
             and (p_producto_id is null or v.producto_id = p_producto_id)) pc
    join retail.productos p on p.id = pc.producto_id
    left join retail.categorias c on c.id = p.categoria_id
    left join retail.producto_color_temporadas pct
           on pct.producto_id = pc.producto_id and pct.color_codigo = pc.color_codigo
   where p.id <> '11111111-1111-4111-8111-111111111111'::uuid;
$$;

comment on function retail.fn_temporada_efectiva_nucleo(uuid, boolean) is
  'ADR-0246 y ADR-0208 (paso 3 de Frescura 3c): la temporada efectiva de cada modelo+color (color → producto → categoría), la regla que antes vivía dentro de fn_temporada_efectiva; con p_con_inactivas también lo descontinuado (lo usa fn_frescura_sede). fn_temporada_efectiva(p) = este núcleo con false. Interna: la usan funciones security definer.';

revoke all on function retail.fn_temporada_efectiva_nucleo(uuid, boolean) from public, anon, authenticated;

-- Misma firma, mismas filas, mismos permisos (create or replace los conserva): solo pasa a envolver al núcleo.
create or replace function retail.fn_temporada_efectiva(p_producto_id uuid default null)
returns table (producto_id uuid, color_codigo text, estado text, temporada text, origen text)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select * from retail.fn_temporada_efectiva_nucleo(p_producto_id, false);
$$;

-- ----------------------------------------------------------------------------
-- 2. La lectura de una tienda
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

  -- Las prendas: catálogo, stock de hoy e historia de la tienda por búsquedas por índice (una por prenda); la temporada,
  -- si es clásica, el fin de su aparición y si hoy es su estación, de mapas de una fila.
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
  primera_de as (
    -- La primera exhibición es del MODELO+COLOR (ADR-0208, decisiones 4 y 9: la novedad es del modelo+color y es una
    -- sola vez por tienda): la primera vez que CUALQUIERA de sus tallas entró al piso de esta tienda, esté o no en la
    -- lista (una talla agotada antes de la ventana no está, y su exhibición sí cuenta). Una búsqueda por modelo+color
    -- distinto (variantes por producto, movimientos por variante), que después se lee por clave.
    select coalesce(jsonb_object_agg(x.clave, pe.primera), '{}'::jsonb) as m
      from (select distinct u.producto_id, u.color_codigo, u.producto_id::text || '|' || coalesce(u.color_codigo, '') as clave
              from u) x
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
  base as materialized (
    select u.*, st.piso, st.total - st.piso as almacen,
           ((select pd.m from primera_de pd) ->> (u.producto_id::text || '|' || coalesce(u.color_codigo, '')))::timestamptz
             as primera_exhibicion,
           h.ultima_llegada,
           tp.par ->> 0 as temporada, tp.par ->> 1 as temporada_origen
      from u
      left join lateral (
        select coalesce(sum(s.cantidad) filter (where su.tipo = 'piso_venta'), 0)::integer as piso,
               coalesce(sum(s.cantidad) filter (where su.tipo is distinct from 'cuarentena'), 0)::integer as total
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
    -- El fin de la aparición de su temporada que corresponde a su última llegada: una llamada por pareja distinta.
    select coalesce(jsonb_object_agg(x.clave, oc.hasta), '{}'::jsonb) as m
      from (select distinct b.temporada || '|' || b.ultima_llegada::text as clave, b.temporada, b.ultima_llegada
              from base b
             where b.temporada is not null and b.ultima_llegada is not null) x
      cross join lateral fn_ocurrencia_temporada(x.temporada, x.ultima_llegada) oc
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
           'fin_estacion', (select f.m from fin_de f) -> (b.temporada || '|' || b.ultima_llegada::text),
           'en_estacion_ahora', (select e.m from hoy_es_su_estacion e) -> b.temporada,
           'primera_exhibicion', b.primera_exhibicion,
           'ultima_llegada', b.ultima_llegada,
           'piso_hoy', coalesce(b.piso, 0),
           'almacen_hoy', coalesce(b.almacen, 0))
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
    'tardias', v_tardias,
    'dudosas', v_dudosas);
end
$fn$;

comment on function retail.fn_frescura_sede(uuid, integer) is
  'ADR-0208 (paso 3 de Frescura 3c): la lectura de una tienda para Frescura del piso, en un solo jsonb. prendas (stock distinto de 0 hoy fuera de la cuarentena o algún movimiento en la ventana; sin la Prenda sin registrar ni productos es_prueba), con su temporada (fn_temporada_efectiva_nucleo, también de lo descontinuado), si es clásica, el fin de la estación de su última llegada, si hoy es su estación, la primera exhibición de su modelo+color (cualquier talla) y su última llegada en esa tienda, y su piso y almacén de hoy; eventos del piso por prenda [ts, delta, marcas, oid] (1 venta, 2 interno, 4 edad desconocida) para el FIFO de historiaDeCohortes; tardias y dudosas del núcleo de bajadas. Taller o tienda sin piso y almacén: {"separa_piso": false}. Solo lectura; una llamada al libro y una al núcleo. Candado: líder y opera la tienda (el módulo frescura nace con la pantalla).';

revoke all on function retail.fn_frescura_sede(uuid, integer) from public, anon;
grant execute on function retail.fn_frescura_sede(uuid, integer) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. La confianza del registro, por tienda y mes de Lima
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
  if not fn_es_lider() then
    raise exception 'Solo el líder puede ver la confianza del registro.' using hint = 'frescura_sin_permiso';
  end if;
  if p_ubicacion_id is not null and not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'Solo el líder puede ver la confianza del registro de esta sede.' using hint = 'frescura_sin_permiso';
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
  'ADR-0208 (paso 3 de Frescura 3c): la confianza del registro de las bajadas al piso, por tienda y mes calendario de Lima (p_meses de 1 a 3, el actual y los anteriores). filas = bajadas que cuentan (cerradas, ni dudosa ni corregida, sin productos es_prueba ni la carga inicial, de hace 20 minutos o más para que la cifra no se mueva); unidades = suma de cantidad_efectiva; tardias = unidades registradas al cobrar; confianza = 1 - tardias / unidades (nula sin unidades); nivel por filas: pocos_datos 1-9, aceptable 10-19, solido 20 o más. Una fila por tienda y mes aunque no haya bajadas. Sin personas: el indicador es del equipo. Candado: líder (con una tienda, además que la opere).';

revoke all on function retail.fn_confianza_registro(uuid, integer) from public, anon;
grant execute on function retail.fn_confianza_registro(uuid, integer) to authenticated;

reset lock_timeout;

notify pgrst, 'reload schema';
