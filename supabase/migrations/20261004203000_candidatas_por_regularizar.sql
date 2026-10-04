-- ============================================================================
-- 20261004203000_candidatas_por_regularizar.sql — CAYLA V2 · ADR-0328 (actividad 5, parte b; decisión técnica 8)
-- Para cada venta «sin registrar» pendiente, las prendas del stock que pueden ser ella, con lo que hace falta para decir
-- si ya estaba registrada o llegó nueva.
--
-- EL PROBLEMA PRIMERO. Hay ~236 ventas «sin registrar» pendientes y 0 regularizadas (producción, 2026-10-03). Para cada una,
-- quien regulariza tiene que (1) encontrar la prenda real en un combo con todo el catálogo y (2) contestar «¿ya estaba registrada
-- o llegó nueva?». La primera es lenta: la caja ya anotó categoría, talla y color, y en TRU 35 de 67 tenían una prenda que calza
-- en stock (ADR-0328). La segunda es peligrosa: contestar mal DESCUENTA DOS VECES (la prenda no estaba contada y «ya estaba
-- registrada» le resta otra) o deja una prenda fantasma (estaba contada y «llegó nueva» no la resta). Nadie sabe la respuesta de
-- memoria; el libro de movimientos sí: cuántas tenía el sistema de esa prenda en esa sede a la hora de la venta, y qué entró o se
-- ajustó después.
--
-- QUÉ HACE. Una lectura, `retail.fn_candidatas_por_regularizar(p_ubicacion_id)`: por cada fila PENDIENTE de
-- `prendas_por_regularizar` que la cuenta puede operar, las variantes activas con:
--   · la misma categoría (la del producto) y la misma talla que anotó la caja,
--   · el mismo color, o uno de la misma familia (`colores.familia_color`: «Azul» anotado puede ser «Azul denim»). La familia es
--     ancha («neutro» junta Negro y Blanco): trae el hex de los dos colores y la web descarta los que no se confunden a la vista
--     (ΔE2000 > 20, `lib/por-regularizar-candidatas.ts`, la misma medida de la paleta, `lib/color-parecido.ts`),
--   · stock DISPONIBLE en la sede de la venta (`fn_existencias_base`: sin Cuarentena, sin apartadas, sin tallas retiradas),
-- y por cada una: si el color es exacto, cuánto hay libre en el piso y en el almacén, la PRIMERA ENTRADA de esa prenda a esa
-- sede (fecha y motivo: carga inicial, recepción, traslado, ajuste…), el SALDO A LA VENTA (cuántas tenía el sistema ahí justo
-- antes de la venta, del libro único `fn_ledger_puntos`, ADR-0202) y el CAMBIO POSTERIOR (lo primero que llegó o se ajustó de esa
-- prenda en esa sede después de la venta). Hasta 20 por venta, las más probables primero.
-- Y `retail.fn_prenda_cargada_en_sede(variante, sede)`: si esa prenda ya entró al sistema en esa sede (revisión R6, al final).
--
-- POR QUÉ EL SALDO Y NO SOLO LA PRIMERA ENTRADA (revisión adversarial, R7). La primera versión deducía con la primera entrada sola:
-- venta después de ella ⇒ «ya estaba registrada». Falla cuando la prenda se agotó y volvió a llegar: carga de 1, venta escaneada (el
-- sistema queda en 0), venta «sin registrar» de una que llegó sin papeles, recepción de 2 (la vendida ya no estaba). La primera
-- entrada es anterior a la venta, así que sugería «ya estaba registrada» —la respuesta que descuenta dos veces: el sistema queda en
-- 1 y en la percha hay 2—, cuando a esa hora el sistema no tenía ninguna. Es el origen de ADR-0179 (en hora punta llega a piso un
-- modelo repuesto antes de registrarlo). La web deduce ahora con el saldo y el cambio posterior (`deducirForma`):
--   · saldo ≤ 0 → «llegó nueva» (no pudo estar contada);
--   · saldo > 0 y nada llegó ni se ajustó después → «ya estaba registrada»;
--   · saldo > 0 y después llegó o se ajustó algo → no deduce: pudo ser de lo que había o de lo que llegó (lo dice, con las fechas).
--
-- CONTRATO
--   PROMETE: solo filas de sedes que la cuenta puede operar (`fn_puede_operar_ubicacion`, la misma puerta que la RLS de
--            `prendas_por_regularizar`; una terminal ve su sede, el líder todas); solo variantes con disponible > 0; ningún
--            dinero salvo lo que ya es público (no devuelve costo); `primera_entrada` = el primer movimiento que sumó esa prenda
--            a esa sede, sin contar el «ingreso_regularizado» (es la mitad de un par entrada+venta del mismo instante: no dice
--            que la sede la tuviera); `saldo_a_la_venta` = el nivel del libro (sin Cuarentena; con las apartadas, que están en la
--            tienda) justo antes de `vendido_en` (un movimiento a la misma hora cuenta como después), `null` si la sede está
--            apagada; `cambio_posterior` = la primera llegada (entrada que no vuelve: ni devolución, cambio, venta anulada,
--            traslado anulado ni ingreso_regularizado; o un traslado de otra sede) o ajuste de cualquier signo desde la venta.
--   ASUME:   que la hora de la venta es `prendas_por_regularizar.vendido_en` (la de `registrar_venta`) y que el registro de una
--            llegada se hace al llegar (si se registra días después de colgarla, el saldo a la venta sale de menos).
--   NO HACE: no ordena por probabilidad fina ni deduce la respuesta: eso es `lib/por-regularizar-candidatas.ts`, pura y con su
--            prueba (necesita la descripción y el precio, y explica el porqué en palabras de tienda). No escribe nada.
--
-- POR QUÉ LA DEDUCCIÓN NO ES UN CANDADO EN `regularizar_prenda`. «El sistema no tenía ninguna ⇒ llegó nueva» es casi siempre
-- cierto, pero no siempre: la carga inicial se cuenta a veces en papel y se registra días después, y una venta sin conexión se
-- fecha al sincronizar. Por eso la web la muestra como sugerencia con su porqué y la persona confirma.
--
-- ESTADO QUE DEJA DE SER POSIBLE: ninguno en la base (es una lectura). En la pantalla deja de ser la norma contestar a ciegas, y
-- deja de sugerirse con seguridad la respuesta que descuenta dos veces cuando el sistema no tenía la prenda a la hora de la venta.
--
-- COSTO (números antes que opiniones). Producción, 2026-10-03: 236 pendientes, 740 variantes, 705 filas de stock, 832
-- movimientos. Por venta, las candidatas son las de una categoría × una talla × una familia de color: pocas (TRU: 35 de 67 con
-- alguna). La primera entrada y el cambio posterior van por el índice `movimientos_variante_ubicacion_idx` (y los traslados
-- viejos por `movimientos_destino_fecha_idx`). El saldo NO se calcula por candidata: el libro se lee UNA vez por sede (≤ 4) desde
-- su venta pendiente más antigua y solo con sus candidatas (`fn_ledger_puntos` busca la lista en una tabla hash, 20260928120010),
-- y cada candidata toma su punto con un `distinct on`. En 3 años, a este ritmo, decenas de miles de movimientos: sigue siendo un
-- índice por sede y una pasada.
--
-- CÓMO SE PEGA EN PRODUCCIÓN: tal cual en el SQL Editor (trae `retail.` y `set search_path`), en UNA sola parte: solo crea
-- funciones de lectura y sus comentarios; no toca tablas ni políticas (ADR-0195 no aplica). Idempotente: `drop function if
-- exists` de la firma con las columnas de antes (por si se pegó una versión anterior de esta rama) y `create or replace`.
-- Pégala ANTES de 20261004204000 (que usa `fn_prenda_cargada_en_sede` y aborta si falta) y antes de publicar la web que las
-- llama; si la web llega primero, Por regularizar sigue funcionando sin sugerencias (`getCandidatasPorRegularizar` devuelve
-- vacío ante el error y lo anota) y sin el aviso de «todavía no está cargada» (la base lo dice al guardar).
--
-- SE ROMPE SI: alguien cambia `fn_existencias_base` y deja de excluir Cuarentena o apartadas (se sugeriría una prenda que no se
-- puede vender); si alguien cambia `fn_ledger_puntos` y su cubeta 'total' deja de ser «todo menos Cuarentena» (el saldo a la
-- venta mentiría); o si la venta o una llegada se registran con otra hora que la real (offline, o una carga contada en papel y
-- registrada días después): la sugerencia puede invertirse. Por eso nunca se aplica sola.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- La firma de antes (sin `saldo_a_la_venta` ni `cambio_posterior`) cambia de columnas: `create or replace` no puede cambiar lo que
-- devuelve. `drop function` no toma las tablas de `auth`/`storage` (CLAUDE.md, «Políticas y deadlocks»). Si nunca se pegó, no hace nada.
drop function if exists retail.fn_candidatas_por_regularizar(uuid);

create or replace function retail.fn_candidatas_por_regularizar(p_ubicacion_id uuid default null)
returns table (
  prenda_id uuid,
  variante_id uuid,
  color_exacto boolean,
  color_hex text,
  color_hex_anotado text,
  piso_libre integer,
  almacen_libre integer,
  disponible integer,
  primera_entrada timestamptz,
  primera_entrada_motivo text,
  saldo_a_la_venta integer,
  cambio_posterior timestamptz,
  cambio_posterior_motivo text
)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  with sedes as (
    -- La puerta se evalúa una vez por sede (≤ 4), no una por fila.
    select u.id
    from ubicaciones u
    where (p_ubicacion_id is null or u.id = p_ubicacion_id)
      and fn_puede_operar_ubicacion(u.id)
  ),
  pendientes as (
    select p.id, p.ubicacion_id, p.vendido_en, p.categoria_id, p.talla_id, p.color_codigo, p.precio_cobrado, c.familia_color, c.hex
    from prendas_por_regularizar p
    join sedes s on s.id = p.ubicacion_id
    left join colores c on c.codigo = p.color_codigo
    where p.estado = 'pendiente'
  ),
  existencias as (
    select e.variante_id, e.ubicacion_id, e.piso_libre, e.almacen_libre, e.disponible
    from fn_existencias_base(p_ubicacion_id, null) e
    join sedes s on s.id = e.ubicacion_id
    where e.disponible > 0 and not e.talla_retirada
  ),
  candidatas as (
    select pe.id as prenda_id,
           v.id as variante_id,
           v.color_codigo = pe.color_codigo as color_exacto,
           cv.hex as color_hex,
           pe.hex as color_hex_anotado,
           ex.piso_libre,
           ex.almacen_libre,
           ex.disponible,
           pe.ubicacion_id,
           pe.vendido_en,
           row_number() over (
             partition by pe.id
             order by v.color_codigo = pe.color_codigo desc, ex.piso_libre > 0 desc, abs(v.precio - pe.precio_cobrado), ex.disponible desc, v.id
           ) as orden
    from pendientes pe
    join productos pr on pr.categoria_id = pe.categoria_id and not pr.es_prueba
    join variantes v on v.producto_id = pr.id and v.talla_id = pe.talla_id and v.activo
                    and v.id <> '22222222-2222-4222-8222-222222222222'
    left join colores cv on cv.codigo = v.color_codigo
    join existencias ex on ex.variante_id = v.id and ex.ubicacion_id = pe.ubicacion_id
    where v.color_codigo = pe.color_codigo
       or (pe.familia_color is not null and cv.familia_color = pe.familia_color)
  ),
  elegidas as materialized (
    select * from candidatas where orden <= 20
  ),
  por_sede as (
    -- El libro único (ADR-0202) se lee UNA vez por sede (≤ 4): desde la venta pendiente más antigua de esa sede y solo con sus
    -- candidatas. Una sede apagada no se lee (`fn_ledger_puntos` la da en 0): su saldo queda sin saber (null), no en 0.
    select el.ubicacion_id, min(el.vendido_en) as desde, array_agg(distinct el.variante_id) as variantes
    from elegidas el
    join ubicaciones u on u.id = el.ubicacion_id and u.activo
    group by el.ubicacion_id
  ),
  libro as (
    select ps.ubicacion_id, lp.variante_id, lp.ts, lp.ord, lp.oid, lp.nivel
    from por_sede ps
    cross join lateral fn_ledger_puntos(ps.ubicacion_id, ps.desde, ps.variantes) lp
    where lp.bucket = 'total'
  ),
  saldos as (
    -- Cuántas tenía el sistema de esa prenda en esa sede JUSTO ANTES de la venta (sin Cuarentena; las apartadas sí: están en la
    -- tienda): el último punto del libro antes de la venta, o su saldo inicial. Un movimiento a la misma hora cuenta como después.
    select distinct on (el.prenda_id, el.variante_id) el.prenda_id, el.variante_id, l.nivel as saldo
    from elegidas el
    join libro l on l.ubicacion_id = el.ubicacion_id and l.variante_id = el.variante_id and (l.ord = 0 or l.ts < el.vendido_en)
    order by el.prenda_id, el.variante_id, l.ts desc, l.ord desc, l.oid desc
  )
  select el.prenda_id, el.variante_id, el.color_exacto, el.color_hex, el.color_hex_anotado, el.piso_libre, el.almacen_libre, el.disponible,
         ent.cuando, ent.motivo, sa.saldo, pos.cuando, pos.motivo
  from elegidas el
  left join saldos sa on sa.prenda_id = el.prenda_id and sa.variante_id = el.variante_id
  left join lateral (
    -- La primera vez que esa prenda SUMÓ a esa sede: una entrada, un ajuste a favor o un traslado que llegó de otra sede.
    select x.cuando, x.motivo
    from (
      (select m.created_at as cuando, m.motivo, m.id
         from movimientos m
        where m.variante_id = el.variante_id and m.ubicacion_id = el.ubicacion_id
          and ((m.tipo = 'entrada' and m.motivo is distinct from 'ingreso_regularizado') or (m.tipo = 'ajuste' and m.cantidad > 0))
        order by m.created_at, m.id
        limit 1)
      union all
      (select m.created_at, m.motivo, m.id
         from movimientos m
        where m.ubicacion_destino_id = el.ubicacion_id and m.variante_id = el.variante_id
          and m.tipo = 'traslado' and m.ubicacion_id <> el.ubicacion_id
        order by m.created_at, m.id
        limit 1)
    ) x
    order by x.cuando, x.id
    limit 1
  ) ent on true
  left join lateral (
    -- Lo primero que cambió lo CONTADO de esa prenda en esa sede después de la venta: una llegada (recepción, carga, traslado de
    -- otra sede, Taller) o un ajuste de cualquier signo (un conteo pudo absorber la vendida). No cuentan las que VUELVEN
    -- (devolución, cambio, venta anulada, traslado anulado: ya estaban contadas) ni el ingreso_regularizado.
    select x.cuando, x.motivo
    from (
      (select m.created_at as cuando, m.motivo, m.id
         from movimientos m
        where m.variante_id = el.variante_id and m.ubicacion_id = el.ubicacion_id and m.created_at >= el.vendido_en
          and ((m.tipo = 'entrada'
                and coalesce(m.motivo, '') not in ('ingreso_regularizado', 'devolucion', 'cambio', 'anulacion_venta', 'traslado_anulado'))
               or m.tipo = 'ajuste')
        order by m.created_at, m.id
        limit 1)
      union all
      (select m.created_at, m.motivo, m.id
         from movimientos m
        where m.ubicacion_destino_id = el.ubicacion_id and m.variante_id = el.variante_id
          and m.tipo = 'traslado' and m.ubicacion_id <> el.ubicacion_id and m.created_at >= el.vendido_en
        order by m.created_at, m.id
        limit 1)
    ) x
    order by x.cuando, x.id
    limit 1
  ) pos on true
  order by el.prenda_id, el.orden;
$$;

comment on function retail.fn_candidatas_por_regularizar(uuid) is
  'ADR-0328 (actividad 5): por cada venta «sin registrar» pendiente de las sedes que la cuenta opera, las variantes activas de la misma categoría y talla, del mismo color o de su familia, con stock disponible en esa sede (fn_existencias_base), hasta 20 por venta. Trae el piso y el almacén libres, la primera entrada de esa prenda a esa sede (sin el ingreso_regularizado), cuántas tenía el sistema justo antes de la venta (saldo_a_la_venta, del libro único fn_ledger_puntos) y lo primero que cambió lo contado después (cambio_posterior: una llegada o un ajuste), para que la web sugiera la prenda y deduzca «llegó nueva» (el sistema no tenía ninguna) o «ya estaba registrada» (tenía y después no llegó ni se ajustó nada); si no, no deduce. Solo lectura; sin costo.';

revoke all on function retail.fn_candidatas_por_regularizar(uuid) from public, anon;
grant execute on function retail.fn_candidatas_por_regularizar(uuid) to authenticated;

-- ¿Esta prenda ya entró al sistema en esta sede? (revisión adversarial, R6). UNA definición para dos lectores: la pantalla, que
-- lo dice ANTES del botón cuando se elige una prenda que no es candidata, y `regularizar_prenda` (20261004204000), que rechaza
-- regularizar una prenda sin historia en la sede: «llegó nueva» le cerraría su carga inicial (`fn_cargar_stock_inicial` exige
-- que no tenga ningún movimiento ahí, `carga_con_historia`) y «ya estaba registrada» no tiene de dónde descontar.
-- PROMETE: `true` si la prenda tiene algún movimiento en la sede (como origen, o como destino de un traslado que la trajo),
-- `false` si ninguno, `null` si la cuenta no opera esa sede (no se dice nada de una sede ajena). NO HACE: no mira el stock de hoy
-- (una prenda agotada sí está cargada) ni escribe nada. Costo: un `exists` por el índice `movimientos_variante_ubicacion_idx`.
create or replace function retail.fn_prenda_cargada_en_sede(p_variante_id uuid, p_ubicacion_id uuid)
returns boolean
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select case
    when fn_puede_operar_ubicacion(p_ubicacion_id) then
      exists (select 1 from movimientos m
               where m.variante_id = p_variante_id
                 and (m.ubicacion_id = p_ubicacion_id or m.ubicacion_destino_id = p_ubicacion_id))
  end;
$$;

comment on function retail.fn_prenda_cargada_en_sede(uuid, uuid) is
  'ADR-0328 (actividad 5, revisión R6): true si la prenda tiene algún movimiento en la sede (origen o destino de un traslado), false si ninguno, null si la cuenta no opera la sede. La usan Por regularizar (antes del botón) y regularizar_prenda (una prenda sin cargar en la sede no se regulariza: primero su carga inicial). Solo lectura.';

revoke all on function retail.fn_prenda_cargada_en_sede(uuid, uuid) from public, anon;
grant execute on function retail.fn_prenda_cargada_en_sede(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
