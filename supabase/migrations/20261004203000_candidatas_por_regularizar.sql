-- ============================================================================
-- 20261004203000_candidatas_por_regularizar.sql — CAYLA V2 · ADR-0328 (actividad 5, parte b; decisión técnica 8)
-- Para cada venta «sin registrar» pendiente, las prendas del stock que pueden ser ella, con lo que hace falta para decir
-- si ya estaba registrada o llegó nueva.
--
-- EL PROBLEMA PRIMERO. Hay ~236 ventas «sin registrar» pendientes y 0 regularizadas (producción, 2026-10-03). Para cada una,
-- quien regulariza tiene que (1) encontrar la prenda real en un combo con todo el catálogo y (2) contestar «¿ya estaba registrada
-- o llegó nueva?». La primera es lenta: la caja ya anotó categoría, talla y color, y en TRU 35 de 67 tenían una prenda que calza
-- en stock (ADR-0328). La segunda es peligrosa: contestar mal DESCUENTA DOS VECES (la prenda se vendió antes de la carga inicial,
-- la carga ya no la contó, y «ya estaba registrada» le resta otra) o deja una prenda fantasma (se vendió después de contarla y
-- «llegó nueva» no la resta). Nadie sabe la respuesta de memoria; el libro de movimientos sí: cuándo entró esa prenda a esa sede.
--
-- QUÉ HACE. Una lectura, `retail.fn_candidatas_por_regularizar(p_ubicacion_id)`: por cada fila PENDIENTE de
-- `prendas_por_regularizar` que la cuenta puede operar, las variantes activas con:
--   · la misma categoría (la del producto) y la misma talla que anotó la caja,
--   · el mismo color, o uno de la misma familia (`colores.familia_color`: «Azul» anotado puede ser «Azul denim»). La familia es
--     ancha («neutro» junta Negro y Blanco): trae el hex de los dos colores y la web descarta los que no se confunden a la vista
--     (ΔE2000 > 20, `lib/por-regularizar-candidatas.ts`, la misma medida de la paleta, `lib/color-parecido.ts`),
--   · stock DISPONIBLE en la sede de la venta (`fn_existencias_base`: sin Cuarentena, sin apartadas, sin tallas retiradas),
-- y por cada una: si el color es exacto, cuánto hay libre en el piso y en el almacén, y la PRIMERA ENTRADA de esa prenda a esa
-- sede (fecha y motivo: carga inicial, recepción, traslado, ajuste…). Hasta 20 por venta, las más probables primero.
-- Y `retail.fn_prenda_cargada_en_sede(variante, sede)`: si esa prenda ya entró al sistema en esa sede (revisión R6, al final).
--
-- CONTRATO
--   PROMETE: solo filas de sedes que la cuenta puede operar (`fn_puede_operar_ubicacion`, la misma puerta que la RLS de
--            `prendas_por_regularizar`; una terminal ve su sede, el líder todas); solo variantes con disponible > 0; ningún
--            dinero salvo lo que ya es público (no devuelve costo); `primera_entrada` = el primer movimiento que sumó esa prenda
--            a esa sede, sin contar el «ingreso_regularizado» (es la mitad de un par entrada+venta del mismo instante: no dice
--            que la sede la tuviera).
--   ASUME:   que la hora de la venta es `prendas_por_regularizar.vendido_en` (la de `registrar_venta`).
--   NO HACE: no ordena por probabilidad fina ni deduce la respuesta: eso es `lib/por-regularizar-candidatas.ts`, pura y con su
--            prueba (necesita la descripción y el precio, y explica el porqué en palabras de tienda). No escribe nada.
--
-- POR QUÉ LA DEDUCCIÓN NO ES UN CANDADO EN `regularizar_prenda`. «Se vendió antes de que la prenda entrara a la sede ⇒ llegó
-- nueva» es casi siempre cierto, pero no siempre: la carga inicial se cuenta a veces en papel y se registra días después, y una
-- venta sin conexión se fecha al sincronizar. Por eso la web la muestra como sugerencia con su porqué y la persona confirma.
--
-- ESTADO QUE DEJA DE SER POSIBLE: ninguno en la base (es una lectura). En la pantalla deja de ser la norma contestar a ciegas.
--
-- COSTO (números antes que opiniones). Producción, 2026-10-03: 236 pendientes, 740 variantes, 705 filas de stock, 832
-- movimientos. Por venta, las candidatas son las de una categoría × una talla × una familia de color: pocas (TRU: 35 de 67 con
-- alguna). Las dos búsquedas de la primera entrada van por el índice `movimientos_variante_ubicacion_idx` (y la de traslados
-- viejos por `movimientos_destino_fecha_idx`). En 3 años, a este ritmo, decenas de miles de movimientos: sigue siendo un índice.
--
-- CÓMO SE PEGA EN PRODUCCIÓN: tal cual en el SQL Editor (trae `retail.` y `set search_path`), en UNA sola parte: solo crea
-- funciones de lectura y sus comentarios; no toca tablas ni políticas (ADR-0195 no aplica). Idempotente (`create or replace`).
-- Pégala ANTES de 20261004204000 (que usa `fn_prenda_cargada_en_sede` y aborta si falta) y antes de publicar la web que las
-- llama; si la web llega primero, Por regularizar sigue funcionando sin sugerencias (`getCandidatasPorRegularizar` devuelve
-- vacío ante el error y lo anota) y sin el aviso de «todavía no está cargada» (la base lo dice al guardar).
--
-- SE ROMPE SI: alguien cambia `fn_existencias_base` y deja de excluir Cuarentena o apartadas (se sugeriría una prenda que no se
-- puede vender); o si la venta se registra con otra hora que la real (offline): la sugerencia puede decir «ya estaba registrada»
-- de una que se vendió antes de contarla. Por eso nunca se aplica sola.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

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
  primera_entrada_motivo text
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
    select p.id, p.ubicacion_id, p.categoria_id, p.talla_id, p.color_codigo, p.precio_cobrado, c.familia_color, c.hex
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
  )
  select ca.prenda_id, ca.variante_id, ca.color_exacto, ca.color_hex, ca.color_hex_anotado, ca.piso_libre, ca.almacen_libre, ca.disponible,
         ent.cuando, ent.motivo
  from candidatas ca
  left join lateral (
    -- La primera vez que esa prenda SUMÓ a esa sede: una entrada, un ajuste a favor o un traslado que llegó de otra sede.
    select x.cuando, x.motivo
    from (
      (select m.created_at as cuando, m.motivo, m.id
         from movimientos m
        where m.variante_id = ca.variante_id and m.ubicacion_id = ca.ubicacion_id
          and ((m.tipo = 'entrada' and m.motivo is distinct from 'ingreso_regularizado') or (m.tipo = 'ajuste' and m.cantidad > 0))
        order by m.created_at, m.id
        limit 1)
      union all
      (select m.created_at, m.motivo, m.id
         from movimientos m
        where m.ubicacion_destino_id = ca.ubicacion_id and m.variante_id = ca.variante_id
          and m.tipo = 'traslado' and m.ubicacion_id <> ca.ubicacion_id
        order by m.created_at, m.id
        limit 1)
    ) x
    order by x.cuando, x.id
    limit 1
  ) ent on true
  where ca.orden <= 20
  order by ca.prenda_id, ca.orden;
$$;

comment on function retail.fn_candidatas_por_regularizar(uuid) is
  'ADR-0328 (actividad 5): por cada venta «sin registrar» pendiente de las sedes que la cuenta opera, las variantes activas de la misma categoría y talla, del mismo color o de su familia, con stock disponible en esa sede (fn_existencias_base), hasta 20 por venta. Trae el piso y el almacén libres y la primera entrada de esa prenda a esa sede (sin el ingreso_regularizado), para que la web sugiera la prenda y deduzca «llegó nueva» (venta antes de la primera entrada) o «ya estaba registrada» (después). Solo lectura; sin costo.';

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
