-- ============================================================================
-- 20260929010000 — fn_existencias: UNA sola cifra de stock (ADR-0256, tarea #2)
--
-- EL PROBLEMA
--   El 2026-09-28 Felipe vio la misma prenda con números distintos en el Catálogo («Stock total 58») y en
--   Existencias. El stock NO estaba desincronizado (0 descuadres entre `movimientos` y `stock`): había SEIS
--   sumas distintas de `stock`, cada pantalla con la suya (toda la red o la sede; con o sin cuarentena, con o
--   sin apartadas, con o sin tallas retiradas, con o sin pruebas). Tabla completa en ADR-0256.
--
-- QUÉ PROMETE (el contrato; ninguna pantalla vuelve a calcular estos números)
--   Por cada talla (variante) y sede:
--     fisico        lo que hay, en todas sus sububicaciones
--     danado        lo que está en Cuarentena (no se vende: 20260924093700)
--     apartado      lo reservado a una clienta (`stock.cantidad_apartada`)
--     disponible    fisico − danado − apartado (lo que se le puede ofrecer a una clienta; nunca negativo)
--     piso_libre, almacen_libre   el disponible separado por lugar; `sin_lugar` = filas sin sububicación
--                   conocida (p. ej. `anular_venta` repone al hueco sin sububicación, BACKLOG)
--                   → siempre: disponible = piso_libre + almacen_libre + sin_lugar
--     en_camino     lo enviado HACIA esa sede en un traslado `en_transito`. No cuenta un traslado ya recibido
--                   con diferencia: lo que coincidió ya está en `stock` (Existencias lo contaba dos veces)
--     talla_retirada  la talla está desactivada (`variantes.activo = false`)
--
-- QUÉ ASUME
--   `stock` es el reflejo exacto de `movimientos` (lo mantiene `fn_aplicar_movimiento`; `recalcular_stock` lo
--   comprueba). La Cuarentena es la sububicación de tipo `cuarentena`.
--
-- QUÉ DEJA AFUERA
--   · Los productos de prueba (`productos.es_prueba`): Felipe (2026-09-28) los va a eliminar y, mientras
--     existan, no suman en ninguna cifra. Siguen pudiendo operarse: se excluyen de las CIFRAS, no de las
--     operaciones.
--   · La pieza «Monto manual» / «Prenda sin registrar» (producto 1111…, variante 2222…): no es mercadería.
--   · Una talla retirada SIN unidades ni nada en camino. Si una retirada TIENE unidades, sale con
--     `talla_retirada = true`: Existencias la escondía y las unidades «desaparecían» aunque seguían en la
--     tienda (visto en producción el 2026-09-28: 6 u. de «Prueba Pantalon»). Después de ADR-0256 decisión 13
--     ese caso será imposible; mientras tanto, se muestra en vez de esconderse.
--   · Productos que nunca tuvieron stock (no hay fila): el universo de productos es del Catálogo; esta función
--     solo responde «cuánto hay».
--
-- DOS FUNCIONES: LA FÓRMULA Y LA PUERTA
--   `fn_existencias_base` es la fórmula, sin candado, y NO la puede llamar nadie desde fuera (sin `grant`): la usan las
--   funciones `security definer` que ya deciden quién entra (`fn_productos`, `fn_productos_resumen`,
--   `fn_stock_por_sede`…), que así no dependen de que haya una sesión (las pruebas y el SQL Editor no la tienen).
--   `fn_existencias` es la puerta para la web: la misma fórmula para cualquier colaborador activo
--   (`fn_tiene_acceso_retail`, el candado de todas las lecturas de retail): la cifra de la red la ven todas las sedes («Dónde más hay», «Pedir a otra
--   sede»). Sin cuenta activa devuelve 0 filas, no un error.
--
-- NÚMEROS (antes que opiniones)
--   Hoy: 160 filas de `stock`. En 3 años, como techo, ~400 productos × ~20 tallas × 4 sedes ≈ 32 000 filas.
--   Una suma agrupada sobre eso son milisegundos: sin caché ni vista materializada, que serían una copia más
--   que se puede desincronizar.
--
-- LO QUE NO HACE, A PROPÓSITO
--   No cambia ninguna pantalla ni ninguna otra función: es la tarea #2. Las lecturas que hoy suman `stock` por
--   su cuenta (`fn_productos`, `fn_productos_resumen`, `fn_stock_por_sede`, `fn_resumen_variantes`,
--   `lib/inventario-v2.ts`, Buscar, Etiquetas) pasan a leer ésta en las tareas #3 y #4.
--
-- PRODUCCIÓN
--   Solo `create or replace function` + `grant`: sin políticas ni `alter table`, así que no toma las tablas de
--   `auth`/`storage` ni choca con el Asesor (ADR-0195). Se pega entera, en una sola parte.
--   Verificación hecha ANTES de escribirla (2026-09-28, solo lectura, el mismo cuerpo como consulta): Tienda
--   TRU → físico 382, apartado 1, disponible 381, 106 tallas, piso 202 + almacén 179 = 381. Es exactamente la
--   captura de Existencias de Felipe de ese día.
-- ============================================================================

set lock_timeout = '3s';

create or replace function retail.fn_existencias_base(p_ubicacion_id uuid default null, p_producto_ids uuid[] default null)
returns table (
  variante_id    uuid,
  producto_id    uuid,
  ubicacion_id   uuid,
  fisico         integer,
  danado         integer,
  apartado       integer,
  disponible     integer,
  piso_libre     integer,
  almacen_libre  integer,
  sin_lugar      integer,
  en_camino      integer,
  talla_retirada boolean
)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  with en_stock as (
    select s.variante_id,
           s.ubicacion_id,
           sum(s.cantidad)                                                              as fisico,
           coalesce(sum(s.cantidad) filter (where sb.tipo = 'cuarentena'), 0)           as danado,
           sum(s.cantidad_apartada)                                                     as apartado,
           coalesce(sum(s.cantidad - s.cantidad_apartada)
                      filter (where sb.tipo = 'piso_venta'), 0)                         as piso_libre,
           coalesce(sum(s.cantidad - s.cantidad_apartada)
                      filter (where sb.tipo = 'almacen_tienda'), 0)                     as almacen_libre,
           coalesce(sum(s.cantidad - s.cantidad_apartada)
                      filter (where sb.id is null
                                 or sb.tipo not in ('piso_venta', 'almacen_tienda', 'cuarentena')), 0)
                                                                                         as sin_lugar
    from retail.stock s
    left join retail.sububicaciones sb on sb.id = s.sububicacion_id
    where (p_ubicacion_id is null or s.ubicacion_id = p_ubicacion_id)
      and (p_producto_ids is null
           or s.variante_id in (select vf.id from retail.variantes vf join unnest(p_producto_ids) as pid(id) on pid.id = vf.producto_id))
    group by s.variante_id, s.ubicacion_id
  ),
  -- Solo `en_transito`: la mercadería ya salió del origen (fase 1, 20260916150000) y todavía no entra al
  -- destino. `recibido_con_diferencia`, `cerrada`, `completada` y `anulada` ya no tienen nada viajando.
  viajando as (
    select ti.variante_id,
           t.ubicacion_destino_id as ubicacion_id,
           sum(ti.cantidad)       as en_camino
    from retail.transferencias t
    join retail.transferencia_items ti on ti.transferencia_id = t.id
    where t.estado = 'en_transito'
      and (p_ubicacion_id is null or t.ubicacion_destino_id = p_ubicacion_id)
      and (p_producto_ids is null
           or ti.variante_id in (select vf.id from retail.variantes vf join unnest(p_producto_ids) as pid(id) on pid.id = vf.producto_id))
    group by ti.variante_id, t.ubicacion_destino_id
  ),
  juntos as (
    select coalesce(e.variante_id, v.variante_id)   as variante_id,
           coalesce(e.ubicacion_id, v.ubicacion_id) as ubicacion_id,
           coalesce(e.fisico, 0)        as fisico,
           coalesce(e.danado, 0)        as danado,
           coalesce(e.apartado, 0)      as apartado,
           coalesce(e.piso_libre, 0)    as piso_libre,
           coalesce(e.almacen_libre, 0) as almacen_libre,
           coalesce(e.sin_lugar, 0)     as sin_lugar,
           coalesce(v.en_camino, 0)     as en_camino
    from en_stock e
    full join viajando v on v.variante_id = e.variante_id and v.ubicacion_id = e.ubicacion_id
  )
  select j.variante_id,
         va.producto_id,
         j.ubicacion_id,
         j.fisico::integer,
         j.danado::integer,
         j.apartado::integer,
         greatest(j.fisico - j.danado - j.apartado, 0)::integer,
         j.piso_libre::integer,
         j.almacen_libre::integer,
         j.sin_lugar::integer,
         j.en_camino::integer,
         not va.activo
  from juntos j
  join retail.variantes va on va.id = j.variante_id
  join retail.productos pr on pr.id = va.producto_id
  where not pr.es_prueba
    and pr.id <> '11111111-1111-4111-8111-111111111111'
    and (va.activo or j.fisico <> 0 or j.en_camino <> 0);
$$;

comment on function retail.fn_existencias_base(uuid, uuid[]) is
  'ADR-0256: LA fórmula de stock por talla y sede (físico, dañado, apartado, disponible = físico − dañado − apartado, '
  'piso/almacén libres, en camino). Sin productos de prueba ni la pieza «Monto manual». Sin candado y sin grant: solo '
  'la llaman funciones security definer que ya decidieron quién entra. La web lee fn_existencias.';

revoke all on function retail.fn_existencias_base(uuid, uuid[]) from public, anon, authenticated;

create or replace function retail.fn_existencias(p_ubicacion_id uuid default null, p_producto_ids uuid[] default null)
returns table (
  variante_id    uuid,
  producto_id    uuid,
  ubicacion_id   uuid,
  fisico         integer,
  danado         integer,
  apartado       integer,
  disponible     integer,
  piso_libre     integer,
  almacen_libre  integer,
  sin_lugar      integer,
  en_camino      integer,
  talla_retirada boolean
)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select e.*
  from retail.fn_existencias_base(p_ubicacion_id, p_producto_ids) e
  -- El mismo candado que el resto de las lecturas de retail (`fn_tiene_acceso_retail`): colaborador activo.
  where retail.fn_tiene_acceso_retail();
$$;

comment on function retail.fn_existencias(uuid, uuid[]) is
  'ADR-0256: LA cifra de stock por talla y sede para la web (la fórmula de fn_existencias_base), para cualquier '
  'colaborador activo. Toda pantalla que muestre cuánto hay lee esta función; ninguna vuelve a sumar `stock` por su '
  'cuenta. Sin argumentos: toda la red; `p_producto_ids` limita a esos productos (una página del Catálogo).';

revoke all on function retail.fn_existencias(uuid, uuid[]) from public, anon;
grant execute on function retail.fn_existencias(uuid, uuid[]) to authenticated, service_role;
