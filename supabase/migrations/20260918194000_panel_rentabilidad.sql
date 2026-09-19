-- ============================================================================
-- 20260918194000_panel_rentabilidad.sql — CAYLA V2 · Gestión comercial: rentabilidad (ADR-0118)
--
-- ESTADO: escrita y probada contra un Postgres desechable (scripts/pruebas/panel_rentabilidad_aislado.sql).
--   NO en producción — la pega Felipe en el SQL Editor. Ya va calificada con `retail.`: se pega tal cual.
--   Solo LECTURA: no crea tablas, no toca filas. Se deshace con dos `drop function`.
--
-- PARA QUÉ. `/comercial/rentabilidad` responde "¿qué vendo mucho pero deja poco, y qué deja mucho pero rota
-- lento?". Estas dos funciones son la ÚNICA casa de esas cuentas.
--   fn_origen_producto(producto, día)  → quién surtió ese producto más recientemente hasta ese día (proveedor o Taller).
--   fn_rentabilidad(p_dia, p_dias, p_igv) → unidades, venta neta, costo, margen, descuentos, devoluciones y stock,
--       por producto, categoría, temporada y origen, más un total. Una sola pasada (GROUPING SETS).
--
-- LA DECISIÓN QUE MÁS IMPORTA: EL MARGEN SE CALCULA SIN IGV.
-- El precio de venta lleva el IGV DENTRO (el punto de venta dice "Incluye IGV 18%"). El costo se guarda SIN IGV
-- (`compra_items.costo_unitario`, ADR-0035; con boleta el IGV va adentro del costo porque no se recupera). Restar el
-- costo de un precio con IGV infla el margen en un 18%: una blusa que se vende a S/118 y costó S/60 NO deja S/58, deja
-- S/100 − S/60 = S/40. Por eso la venta neta = lo pagado ÷ (1 + IGV). El IGV entra como parámetro (`p_igv`, 0,18 por
-- defecto) y no como número escrito aquí adentro.
--
-- SEGUNDA DECISIÓN: UN COSTO EN CERO NO ES UN COSTO.
-- `venta_items.costo_unitario` acepta 0 (es el valor por defecto de una prenda sin costo cargado). Una prenda vendida con
-- costo 0 saldría con "100% de margen" y encabezaría cualquier ranking con una ganancia inventada. Por eso el margen se
-- calcula SOLO sobre las líneas con costo > 0 (`venta_neta_con_costo`, `costo`), y `unidades_sin_costo` dice cuántas
-- unidades quedaron fuera. La pantalla muestra "—" cuando no hay costo, y una cobertura cuando hay poco.
--
-- QUÉ ES UNA "VENTA" AQUÍ: lo cobrado (precio − descuento) × cantidad, solo ventas `completada` de los últimos
-- `p_dias` días (hora de Lima, hoy incluido). Las devoluciones se muestran APARTE (`unidades_devueltas`, solo aprobadas):
-- el margen es ANTES de devoluciones. Una prenda que se devuelve mucho parecerá más rentable de lo que es; la pantalla de
-- Calidad cuenta esa otra mitad. El costo es el SELLADO en cada venta (`venta_items.costo_unitario`), no el vigente hoy.
--
-- STOCK Y ROTACIÓN. `stock` = unidades vendibles hoy: todas las del producto EXCEPTO las que están en cuarentena (una
-- prenda dañada no se puede vender, y contarla haría parecer que sobra inventario). OJO, difiere a propósito de
-- `fn_productos.stock_total`, que SÍ suma la cuarentena: aquella definición es una inconsistencia conocida, no se replica.
-- Un producto con stock y SIN ventas en la ventana aparece igual (unidades 0): es inventario parado, justo lo que se busca.
-- El stock no se atribuye a un origen (un producto pudo surtirse de dos): en el nivel `origen` viene NULL.
-- Días de inventario y sell-through los calcula `rentabilidad-reglas.ts` con estos números crudos.
--
-- A QUIÉN SE ATRIBUYE UNA VENTA (origen): igual que Calidad (ADR-0113, decisión de Felipe): a la compra más reciente del
-- producto ANTERIOR a la venta, o al Taller (producción terminada, no muestra, no anulada). Vive en `fn_origen_producto`
-- para que las dos pantallas no puedan discrepar. Calidad debe adoptarla (pendiente en BACKLOG: hoy tiene su propia copia).
--
-- HORA DE LIMA (misma razón que ADR-0110). NÚMEROS (Jeff Dean): 90 días ≈ 3.000 líneas de venta; por cada una una
-- subconsulta pequeña de origen; decenas de milisegundos hoy, decenas de miles de filas a 3 años. Sin índice nuevo hasta
-- que una llamada pase de ~200 ms, midiendo.
--
-- SEGURIDAD. security definer para leer todas las tiendas (RLS solo deja ver la propia) → candado propio `fn_es_lider()`.
-- `fn_origen_producto` NO se concede a nadie: solo la ejecutan las funciones definer (dueñas de la base) que la llaman.
-- Explícito `revoke ... from authenticated`, porque `0005_grants.sql` concede EXECUTE por defecto (ADR-0112).
--
-- SE ROMPE SI: se agrega un estado de venta nuevo sin decidir si cuenta; el IGV cambia y alguien pasa otra tasa; un
-- producto pasa a tener más de un proveedor cercano en fecha (se atribuye al último); o la rotación se lee de un producto
-- recién lanzado: la velocidad se calcula sobre TODA la ventana, así que un producto de 10 días parecerá lento.
-- ============================================================================

create or replace function retail.fn_origen_producto(p_producto_id uuid, p_dia date)
returns table (tipo text, origen_id uuid)
language sql
stable
security definer
set search_path to 'retail', 'public', 'extensions'
as $$
  select x.tipo, x.origen_id
  from (
    select 'proveedor'::text as tipo, c.proveedor_id as origen_id, c.fecha_emision as fecha
    from compra_items ci
    join compras c on c.id = ci.compra_id
    where ci.producto_id = p_producto_id
      and c.estado = 'vigente'
      and c.fecha_emision <= p_dia
    union all
    select 'taller'::text, null::uuid, (pr.inventariado_at at time zone 'America/Lima')::date
    from producciones pr
    where pr.producto_id = p_producto_id
      and pr.estado = 'terminada'
      and not pr.es_muestra
      and pr.inventariado_at is not null
      and (pr.inventariado_at at time zone 'America/Lima')::date <= p_dia
  ) x
  order by x.fecha desc, x.tipo, x.origen_id
  limit 1
$$;

create or replace function retail.fn_rentabilidad(
  p_dia date default null,
  p_dias integer default 90,
  p_igv numeric default 0.18
)
returns table (
  nivel text,
  clave text,
  etiqueta text,
  unidades integer,
  venta_neta numeric,
  venta_neta_con_costo numeric,
  costo numeric,
  unidades_sin_costo integer,
  descuento numeric,
  unidades_devueltas integer,
  stock integer,
  dias_ventana integer,
  desde date,
  hasta date
)
language plpgsql
stable
security definer
set search_path to 'retail', 'public', 'extensions'
as $$
#variable_conflict use_column
declare
  v_dia date;
  v_desde date;
  v_hasta date;
  v_ts_desde timestamptz;
  v_ts_hasta timestamptz;
begin
  if not fn_es_lider() then
    raise exception 'Solo un líder puede ver la rentabilidad';
  end if;
  if p_dias < 1 or p_igv < 0 or p_igv > 1 then
    raise exception 'Parámetros fuera de rango (p_dias >= 1, p_igv entre 0 y 1)';
  end if;

  v_dia := coalesce(p_dia, (now() at time zone 'America/Lima')::date);
  v_hasta := v_dia + 1;                 -- exclusivo: el día de hoy entra completo
  v_desde := v_hasta - p_dias;
  v_ts_desde := v_desde::timestamp at time zone 'America/Lima';
  v_ts_hasta := v_hasta::timestamp at time zone 'America/Lima';

  return query
  with lineas as (
    select vi.id as item_id, va.producto_id, p.categoria_id, p.temporada,
           o.tipo as origen_tipo, o.origen_id,
           vi.cantidad,
           (vi.precio_unitario - vi.descuento_unitario) * vi.cantidad as pagado,
           vi.descuento_unitario * vi.cantidad as descuento,
           vi.costo_unitario,
           vi.costo_unitario * vi.cantidad as costo_total
    from ventas ve
    join venta_items vi on vi.venta_id = ve.id
    join variantes va on va.id = vi.variante_id
    join productos p on p.id = va.producto_id
    left join lateral fn_origen_producto(p.id, (ve.created_at at time zone 'America/Lima')::date) o on true
    where ve.estado = 'completada'
      and ve.created_at >= v_ts_desde
      and ve.created_at <  v_ts_hasta
  ),
  devuelto as (
    select di.venta_item_id, sum(di.cantidad) as cantidad
    from devolucion_items di
    join devoluciones d on d.id = di.devolucion_id and d.estado = 'aprobada'
    group by di.venta_item_id
  ),
  base as (
    select l.*, coalesce(dv.cantidad, 0) as devueltas
    from lineas l
    left join devuelto dv on dv.venta_item_id = l.item_id
  ),
  ventas_n as (
    select
      case when grouping(b.producto_id) = 0 then 'producto'
           when grouping(b.categoria_id) = 0 then 'categoria'
           when grouping(b.temporada) = 0 then 'temporada'
           when grouping(b.origen_tipo) = 0 then 'origen'
           else 'total' end as nivel,
      case when grouping(b.producto_id) = 0 then b.producto_id::text
           when grouping(b.categoria_id) = 0 then coalesce(b.categoria_id::text, '')
           when grouping(b.temporada) = 0 then coalesce(b.temporada, '')
           when grouping(b.origen_tipo) = 0 then coalesce(b.origen_tipo, 'sin') || ':' || coalesce(b.origen_id::text, '')
           else '' end as clave,
      coalesce(sum(b.cantidad), 0)::integer as unidades,
      coalesce(sum(b.pagado), 0) / (1 + p_igv) as venta_neta,
      coalesce(sum(b.pagado) filter (where b.costo_unitario > 0), 0) / (1 + p_igv) as venta_neta_con_costo,
      coalesce(sum(b.costo_total) filter (where b.costo_unitario > 0), 0) as costo,
      coalesce(sum(b.cantidad) filter (where b.costo_unitario = 0), 0)::integer as unidades_sin_costo,
      coalesce(sum(b.descuento), 0) as descuento,
      coalesce(sum(b.devueltas), 0)::integer as devueltas
    from base b
    group by grouping sets ((b.producto_id), (b.categoria_id), (b.temporada), (b.origen_tipo, b.origen_id), ())
  ),
  stock_prod as (
    -- Una fila por producto: unidades vendibles hoy (sin cuarentena). Solo con stock > 0.
    select va.producto_id, sum(st.cantidad)::integer as stock
    from stock st
    join variantes va on va.id = st.variante_id
    left join sububicaciones sb on sb.id = st.sububicacion_id
    where coalesce(sb.tipo, '') <> 'cuarentena'
    group by va.producto_id
    having sum(st.cantidad) > 0
  ),
  stock_n as (
    select
      case when grouping(sp.producto_id) = 0 then 'producto'
           when grouping(pr.categoria_id) = 0 then 'categoria'
           when grouping(pr.temporada) = 0 then 'temporada'
           else 'total' end as nivel,
      case when grouping(sp.producto_id) = 0 then sp.producto_id::text
           when grouping(pr.categoria_id) = 0 then coalesce(pr.categoria_id::text, '')
           when grouping(pr.temporada) = 0 then coalesce(pr.temporada, '')
           else '' end as clave,
      sum(sp.stock)::integer as stock
    from stock_prod sp
    join productos pr on pr.id = sp.producto_id
    group by grouping sets ((sp.producto_id), (pr.categoria_id), (pr.temporada), ())
  ),
  unidos as (
    select coalesce(v.nivel, s.nivel) as nivel,
           coalesce(v.clave, s.clave) as clave,
           coalesce(v.unidades, 0) as unidades,
           coalesce(v.venta_neta, 0) as venta_neta,
           coalesce(v.venta_neta_con_costo, 0) as venta_neta_con_costo,
           coalesce(v.costo, 0) as costo,
           coalesce(v.unidades_sin_costo, 0) as unidades_sin_costo,
           coalesce(v.descuento, 0) as descuento,
           coalesce(v.devueltas, 0) as devueltas,
           s.stock
    from ventas_n v
    full join stock_n s on s.nivel = v.nivel and s.clave = v.clave
  )
  select
    u.nivel,
    u.clave,
    case u.nivel
      when 'producto'  then coalesce((select pr.referencia from productos pr where pr.id = u.clave::uuid), 'Producto sin nombre')
      when 'categoria' then case when u.clave = '' then 'Sin categoría'
                                 else coalesce((select ca.nombre from categorias ca where ca.id = u.clave::uuid), 'Categoría sin nombre') end
      when 'temporada' then case when u.clave = '' then 'Sin temporada' else u.clave end
      when 'origen'    then case split_part(u.clave, ':', 1)
                              when 'proveedor' then coalesce((select pv.nombre from proveedores pv where pv.id = nullif(split_part(u.clave, ':', 2), '')::uuid), 'Proveedor sin nombre')
                              when 'taller' then 'Taller'
                              else 'Sin origen registrado' end
      else 'Total' end as etiqueta,
    u.unidades,
    u.venta_neta,
    u.venta_neta_con_costo,
    u.costo,
    u.unidades_sin_costo,
    u.descuento,
    u.devueltas,
    -- en el nivel origen el stock no se atribuye: NULL, no 0
    case when u.nivel = 'origen' then null else coalesce(u.stock, 0) end,
    p_dias,
    v_desde,
    v_dia
  from unidos u
  order by 1, 5 desc, 3;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permisos. `0005_grants.sql` concede EXECUTE a `authenticated` por defecto: se revoca EXPLÍCITO lo que no debe.
-- ---------------------------------------------------------------------------
revoke all on function retail.fn_origen_producto(uuid, date) from public, anon, authenticated;
revoke all on function retail.fn_rentabilidad(date, integer, numeric) from public;
grant execute on function retail.fn_rentabilidad(date, integer, numeric) to authenticated;
