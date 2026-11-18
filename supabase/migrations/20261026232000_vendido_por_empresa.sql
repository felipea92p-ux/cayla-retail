-- ============================================================================
-- 20261026232000 — De quién es lo vendido en Lima: CAYLA o CLAURE, por la marca (ADR-0532)
--
-- EL PROBLEMA. En Tienda LIM conviven dos negocios (ADR-0463): CAYLA y CLAURE venden en la misma caja y con la misma boleta (el RUC
-- de CAYLA). Caja dice «Vendido hoy S/ 1.200» y el Historial «vendido S/ 18.000», pero nadie puede decir cuánto de eso es de cada
-- uno sin sumar boleta por boleta (Felipe, 2026-10-26).
--
-- LA REGLA DE QUIÉN ES CADA PRENDA (Felipe, 2026-10-26). «Todo lo que se registre en Tienda Lima y no sea de la marca CAYLA pasa a ser
-- CLAURE, sin importar si son los mismos productos de otras tiendas de CAYLA. Solo se diferencia por marca CAYLA las prendas CAYLA.»
--   · En una sede donde operan dos o más empresas (hoy solo Tienda LIM, `empresa_sedes`): la prenda es de la empresa dueña de su marca
--     (`empresas.marca_id`: la marca CAYLA es de CAYLA). Sin esa marca (otra marca, o sin marca) es de la otra empresa de la sede:
--     CLAURE. Una blusa Strend que también está en Trujillo, vendida en Lima, es de CLAURE.
--   · En las demás sedes manda el dato de la prenda (`productos.empresa_id`): todo es CAYLA, porque CLAURE no sale de Lima (ADR-0505).
--   · Si no se sabe cuál es la marca de la casa (`empresas.marca_id` vacío), la regla no se aplica y manda el dato de la prenda:
--     nunca se pasa a CLAURE lo de la marca CAYLA por un dato que falta.
--   Es UNA función (`fn_empresa_de_prenda_en_sede`) que leen todas las cuentas; su espejo en la web es `empresaPorMarca`
--   (`apps/web/lib/empresas-de-sede-reglas.ts`), que decide la empresa al dar de alta un producto en Lima sin preguntar.
--
-- LA REGLA DEL DINERO. Se reparte LO VENDIDO, prenda por prenda: cada línea suma a la empresa de su prenda EN LA SEDE DE LA VENTA por
-- lo que se cobró de ella (`venta_items.subtotal`, con sus descuentos ya restados). Es exacto: en producción, el 2026-10-26, las
-- líneas suman lo pagado en todas las ventas. El cajón NO se parte por medio de pago (es un solo cajón y una sola boleta). Una venta
-- anulada no suma y una devolución o un cambio no restan, igual que el «vendido» de siempre.
--
-- LO QUE AGREGA (ninguna función viva se reescribe; sin políticas)
--   0. `empresas.marca_id`: la marca de cada empresa (CAYLA → la marca «CAYLA»; CLAURE, ninguna). Se siembra por el nombre UNA vez;
--      después se lee por id, así que renombrar la marca no rompe la regla. `fn_marcas_de_empresas()` la entrega a la web.
--   1. `fn_empresa_de_prenda_en_sede(producto, sede)`: la regla de arriba.
--   2. `fn_vendido_por_empresa(...)`: los mismos filtros y la misma regla de lectura que `fn_totales_historial_ventas` (Historial),
--      para que la suma de las empresas sea EXACTAMENTE el «vendido» de la cabecera. Una fila por empresa.
--   3. `fn_vendido_por_empresa_de_cajas(uuid[])`: lo de cada turno de caja, con la regla de `fn_resumen_caja` (todas las ventas del
--      turno menos las anuladas, también las de prueba). Solo las cajas que la cuenta puede ver.
--   4. `fn_empresa_de_ventas(uuid[])`: cuánto de cada venta es de cada empresa, para marcar la venta en la lista del Historial.
--
-- LO QUE NO HACE
--   · No parte los pagos por empresa, ni el esperado del cajón, ni la liquidación (decisión de Felipe, 2026-10-26: solo lo vendido).
--   · No cambia `productos.empresa_id` de ninguna prenda que ya existe, ni el candado de ADR-0505, ni las etiquetas.
--   · El filtro de Movimientos va en `20261026234000` (parcha dos funciones vivas, con su candado de huella).
--
-- CÓMO SE PEGA EN PRODUCCIÓN
--   Una sola ejecución: un `alter table` de metadatos sobre `empresas` (dos filas, sin políticas, que la tienda solo lee por funciones),
--   un `update` de una fila y `create or replace function`. Sin políticas ni `drop trigger`: no hay riesgo de deadlock (CLAUDE.md
--   «Políticas y deadlocks»). Idempotente. Antes que la web (con la web vieja no pasa nada).
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- 0. La marca de cada empresa -------------------------------------------------------------------------------------------------
alter table retail.empresas add column if not exists marca_id uuid references retail.marcas (id);

comment on column retail.empresas.marca_id is
  'ADR-0532: la marca de la empresa (CAYLA → la marca «CAYLA»). En una sede con dos empresas (Lima), una prenda de esta marca es de esta empresa; las demás, de la otra (fn_empresa_de_prenda_en_sede).';

-- Se siembra por el nombre UNA sola vez, y solo si hay exactamente una marca «CAYLA» (sin importar mayúsculas ni espacios): con cero o
-- con dos, no se adivina y la regla queda apagada (manda el dato de la prenda) hasta que alguien la elija.
update retail.empresas e
   set marca_id = (select m.id from retail.marcas m where upper(btrim(m.nombre)) = 'CAYLA')
 where e.clave = 'cayla'
   and e.marca_id is null
   and (select count(*) from retail.marcas m where upper(btrim(m.nombre)) = 'CAYLA') = 1;

do $aviso$
begin
  if not exists (select 1 from retail.empresas where clave = 'cayla' and marca_id is not null) then
    raise notice 'ADR-0532: no hay UNA marca «CAYLA» en retail.marcas: la regla por marca queda apagada (manda productos.empresa_id).';
  end if;
end
$aviso$;

create or replace function retail.fn_marcas_de_empresas()
returns table (empresa_id uuid, marca_id uuid)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select e.id, e.marca_id from empresas e where e.activo order by e.orden
$$;

comment on function retail.fn_marcas_de_empresas() is
  'ADR-0532: la marca de cada empresa activa, para que la web decida en Lima de quién es una prenda nueva (empresaPorMarca). Solo lectura.';

-- 1. La regla: de quién es una prenda en una sede -----------------------------------------------------------------------------
create or replace function retail.fn_empresa_de_prenda_en_sede(p_producto_id uuid, p_ubicacion_id uuid)
returns uuid
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  with aqui as (
    select e.id, e.marca_id, e.orden
    from empresa_sedes es
    join empresas e on e.id = es.empresa_id and e.activo
    where es.ubicacion_id = p_ubicacion_id
  ),
  casa as (select e.id, e.marca_id from empresas e where e.id = fn_empresa_casa_id())
  select case
    -- Una sola empresa en la sede (Trujillo, Arequipa, el Taller), o sin saber la marca de la casa: el dato de la prenda.
    when (select count(*) from aqui) < 2 or (select marca_id from casa) is null then p.empresa_id
    -- La marca de la prenda es la de una empresa de la sede: esa (marca CAYLA → CAYLA).
    when p.marca_id is not null and exists (select 1 from aqui a where a.marca_id = p.marca_id)
      then (select a.id from aqui a where a.marca_id = p.marca_id order by a.orden limit 1)
    -- Cualquier otra marca, o sin marca: la otra empresa de la sede (CLAURE en Lima).
    else coalesce((select a.id from aqui a where a.id <> (select id from casa) order by a.orden limit 1), p.empresa_id)
  end
  from productos p
  where p.id = p_producto_id
$$;

comment on function retail.fn_empresa_de_prenda_en_sede(uuid, uuid) is
  'ADR-0532: de qué empresa es una prenda en una sede. Donde operan dos (Lima): la dueña de su marca (marca CAYLA → CAYLA) y, si no, la otra (CLAURE). En las demás, productos.empresa_id. Espejo en la web: empresaPorMarca.';

-- 2. Historial: lo vendido por empresa con los filtros de la pantalla --------------------------------------------------------
create or replace function retail.fn_vendido_por_empresa(
  p_desde timestamptz default null,
  p_hasta timestamptz default null,
  p_sede_id uuid default null,
  p_vendedor_id uuid default null,
  p_estado text default 'todas',
  p_pago text default null,
  p_comprobante text default 'todos',
  p_incluir_prueba boolean default false
)
returns table (empresa_id uuid, clave text, nombre text, orden integer, ventas integer, unidades integer, total numeric)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  -- La misma regla de lectura que `fn_totales_historial_ventas` y la política `ventas_select`: el líder todas, cada quien su sede.
  v_lider boolean := coalesce(fn_es_lider(), false);
  v_ubicacion uuid := fn_ubicacion_actual_persona();
begin
  if p_estado not in ('todas', 'completada', 'anulada') then
    raise exception 'Estado de venta desconocido: %', p_estado using errcode = '22023';
  end if;
  if p_comprobante not in ('todos', 'con', 'sin') then
    raise exception 'Filtro de comprobante desconocido: %', p_comprobante using errcode = '22023';
  end if;

  -- Los filtros son copia de los de `fn_totales_historial_ventas`: si una cambia, cambia la otra (la prueba
  -- `pruebas:vendido-por-empresa` compara las dos sumas con los mismos filtros).
  return query
  with filtradas as (
    select v.id, v.ubicacion_id
    from ventas v
    where (v_lider or v.ubicacion_id = v_ubicacion)
      and v.estado <> 'anulada'
      and (p_desde is null or v.created_at >= p_desde)
      and (p_hasta is null or v.created_at < p_hasta)
      and (p_sede_id is null or v.ubicacion_id = p_sede_id)
      and (p_vendedor_id is null or v.asesora_id = p_vendedor_id or (v.asesora_id is null and v.usuario_id = p_vendedor_id))
      and (p_estado = 'todas' or v.estado = p_estado)
      and (p_incluir_prueba or not v.es_prueba)
      and (p_pago is null or exists (select 1 from venta_pagos vp where vp.venta_id = v.id and vp.metodo = p_pago))
      and (
        p_comprobante = 'todos'
        or exists (
          select 1 from comprobantes c
          where c.venta_id = v.id
            and c.tipo in ('boleta', 'factura', 'nota_venta')
            and (v_lider or c.ubicacion_id = v_ubicacion)
        ) = (p_comprobante = 'con')
      )
  ),
  lineas as (
    select i.venta_id, i.cantidad,
           coalesce(i.subtotal, round((i.precio_unitario - i.descuento_unitario) * i.cantidad, 2)) as monto,
           fn_empresa_de_prenda_en_sede(va.producto_id, f.ubicacion_id) as empresa_id
    from venta_items i
    join filtradas f on f.id = i.venta_id
    join variantes va on va.id = i.variante_id
  )
  select e.id, e.clave, e.nombre, e.orden,
         count(distinct l.venta_id)::integer,
         sum(l.cantidad)::integer,
         round(sum(l.monto), 2)
  from lineas l
  join empresas e on e.id = l.empresa_id
  group by e.id, e.clave, e.nombre, e.orden
  order by e.orden, e.nombre;
end;
$$;

comment on function retail.fn_vendido_por_empresa(timestamptz, timestamptz, uuid, uuid, text, text, text, boolean) is
  'ADR-0532: cuánto de lo vendido es de cada empresa (CAYLA, CLAURE), prenda por prenda y según la sede de la venta (fn_empresa_de_prenda_en_sede), con los mismos filtros y la misma regla de lectura que fn_totales_historial_ventas: su suma es el «vendido» del Historial. Sin anuladas. Solo lectura.';

-- 3. Caja: lo vendido por empresa en cada turno -------------------------------------------------------------------------------
create or replace function retail.fn_vendido_por_empresa_de_cajas(p_cajas uuid[])
returns table (caja_id uuid, empresa_id uuid, clave text, nombre text, orden integer, ventas integer, unidades integer, total numeric)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  -- Lo vendido del turno es lo de `fn_resumen_caja`: todas las ventas de la caja menos las anuladas (las de prueba también, porque
  -- su dinero estuvo en el cajón). Solo las cajas que la cuenta puede ver (la regla de `cajas_select`); las demás no salen.
  with vistas as (
    select c.id
    from cajas c
    where c.id = any (p_cajas)
      and coalesce(fn_es_lider() or c.ubicacion_id = fn_ubicacion_actual_persona(), false)
  ),
  lineas as (
    select v.caja_id, i.venta_id, i.cantidad,
           coalesce(i.subtotal, round((i.precio_unitario - i.descuento_unitario) * i.cantidad, 2)) as monto,
           fn_empresa_de_prenda_en_sede(va.producto_id, v.ubicacion_id) as empresa_id
    from ventas v
    join vistas cv on cv.id = v.caja_id
    join venta_items i on i.venta_id = v.id
    join variantes va on va.id = i.variante_id
    where v.estado <> 'anulada'
  )
  select l.caja_id, e.id, e.clave, e.nombre, e.orden,
         count(distinct l.venta_id)::integer,
         sum(l.cantidad)::integer,
         round(sum(l.monto), 2)
  from lineas l
  join empresas e on e.id = l.empresa_id
  group by l.caja_id, e.id, e.clave, e.nombre, e.orden
  order by l.caja_id, e.orden, e.nombre
$$;

comment on function retail.fn_vendido_por_empresa_de_cajas(uuid[]) is
  'ADR-0532: cuánto de lo vendido en cada turno de caja es de cada empresa (CAYLA, CLAURE), prenda por prenda (fn_empresa_de_prenda_en_sede), con la regla de fn_resumen_caja (sin anuladas). Solo las cajas que la cuenta puede ver. Solo lectura.';

-- 4. Cada venta: cuánto es de cada empresa ------------------------------------------------------------------------------------
create or replace function retail.fn_empresa_de_ventas(p_ventas uuid[])
returns table (venta_id uuid, empresa_id uuid, monto numeric)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  -- Para la marca «CLAURE» de cada venta en la lista del Historial. La regla de lectura de `ventas_select`: el líder todas, cada quien
  -- las de su sede; las demás no salen. Se pide por página (a lo sumo unas decenas de ids).
  select i.venta_id,
         fn_empresa_de_prenda_en_sede(va.producto_id, v.ubicacion_id),
         round(sum(coalesce(i.subtotal, round((i.precio_unitario - i.descuento_unitario) * i.cantidad, 2))), 2)
  from ventas v
  join venta_items i on i.venta_id = v.id
  join variantes va on va.id = i.variante_id
  where v.id = any (p_ventas)
    and coalesce(fn_es_lider() or v.ubicacion_id = fn_ubicacion_actual_persona(), false)
  group by 1, 2
$$;

comment on function retail.fn_empresa_de_ventas(uuid[]) is
  'ADR-0532: cuánto de cada venta es de cada empresa (fn_empresa_de_prenda_en_sede), para marcarla en el Historial. Solo las ventas que la cuenta puede ver. Solo lectura.';

revoke all on function retail.fn_marcas_de_empresas() from public, anon;
revoke all on function retail.fn_empresa_de_prenda_en_sede(uuid, uuid) from public, anon;
revoke all on function retail.fn_vendido_por_empresa(timestamptz, timestamptz, uuid, uuid, text, text, text, boolean) from public, anon;
revoke all on function retail.fn_vendido_por_empresa_de_cajas(uuid[]) from public, anon;
revoke all on function retail.fn_empresa_de_ventas(uuid[]) from public, anon;
grant execute on function retail.fn_marcas_de_empresas() to authenticated, service_role;
grant execute on function retail.fn_empresa_de_prenda_en_sede(uuid, uuid) to authenticated, service_role;
grant execute on function retail.fn_vendido_por_empresa(timestamptz, timestamptz, uuid, uuid, text, text, text, boolean) to authenticated, service_role;
grant execute on function retail.fn_vendido_por_empresa_de_cajas(uuid[]) to authenticated, service_role;
grant execute on function retail.fn_empresa_de_ventas(uuid[]) to authenticated, service_role;
