-- ============================================================================
-- 20261105221000_servicios_del_taller_por_pagar.sql — CAYLA V2 (Felipe, 2026-11-05; ADR-0614, actividad 3)
-- Lo que se le debe a un servicio de afuera llega a Por pagar
--
-- EL PROBLEMA PRIMERO. Cuando un servicio devuelve prendas, la orden calcula lo que se le debe (`devengado`: buenas × tarifa + fijo). Pero ese
-- monto vivía solo en la orden: Por pagar lee facturas, y un servicio que todavía no da papel no era deuda para nadie. El Taller podía deberle
-- a quien le cortó y cosió sin que ninguna pantalla de dinero lo dijera.
--
-- LA DECISIÓN. La deuda se DERIVA, no se copia (principio 4): `fn_servicios_por_pagar` responde devengado − lo que ya tiene papel. La línea de un
-- comprobante apunta a su fase con `comprobantes_produccion_items.fase_id`, y desde ese momento esa parte es una factura como cualquier otra.
-- Si un servicio devuelve más prendas o una vuelta se anula, la cifra cambia sola.
--
-- Lo documentado se cuenta sin IGV, porque la tarifa de un servicio es sin IGV: una factura de S/ 100 + S/ 18 de IGV salda S/ 100 de tarifa.
--
-- Además, el nombre del servicio se puede registrar con la orden ya cerrada: sin eso, una orden que cerró con «Pendiente de registrar» dejaba
-- una deuda sin dueño para siempre. Con la orden cerrada solo se escribe el nombre: la tarifa y el fijo ya entraron al costo de la prenda.
--
-- CONTRATO (Liskov)
--   PROMETE: `fn_servicios_por_pagar()` → una fila por fase de servicio con saldo, de órdenes no anuladas; `fn_deuda_consolidada` los suma a la deuda
--            de Producción. Ninguna escribe. `registrar_proveedor_de_fase` también vale con la orden terminada.
--   ASUME:   la lectura es del líder, como el resto del dinero del Taller (D-G); a otra cuenta le devuelve cero filas.
--   FALLA:   `registrar_proveedor_de_fase` rechaza una orden anulada (`orden_cerrada`) y cambiar el monto con la orden terminada (`orden_cerrada_costo`).
--   NO HACE: no crea facturas ni pagos (actividad 4), no toca el costo de la prenda, y `fn_por_pagar_consolidado` (Finanzas) no los lista todavía.
--
-- PRODUCCIÓN. Una sola parte, re-ejecutable. `comprobantes_produccion_items` tiene 0 filas y se le agrega una columna nula. Sin políticas ni `drop trigger`:
-- ADR-0195 no aplica. Pegar ANTES de publicar la web; sin la función, la pantalla sigue como estaba.
--
-- VERIFICACIÓN (solo lectura):
--   select to_regprocedure('retail.fn_servicios_por_pagar()') is not null,
--          position('anulada' in pg_get_functiondef(to_regprocedure('retail.registrar_proveedor_de_fase(uuid,uuid,numeric,numeric,integer,date)'))) > 0;  → t | t
-- CÓMO SE DESHACE: los reemplazos al revés, `drop function retail.fn_servicios_por_pagar()`, y la versión anterior de `fn_deuda_consolidada`. La columna se deja si ya tiene datos.
-- ============================================================================

set lock_timeout = '3s';

alter table retail.comprobantes_produccion_items
  add column if not exists fase_id uuid references retail.produccion_fases (id);

create index if not exists comprobantes_produccion_items_fase on retail.comprobantes_produccion_items (fase_id) where fase_id is not null;

comment on column retail.comprobantes_produccion_items.fase_id is 'ADR-0614: el paso de la orden que esta línea documenta. La deuda de un servicio es su devengado menos estas líneas.';

create or replace function retail.fn_servicios_por_pagar()
returns table (
  fase_id uuid, produccion_id uuid, numero integer, numero_texto text, producto text, clave text, fase text,
  proveedor_id uuid, proveedor text, devengado numeric, documentado numeric, falta numeric, orden_estado text
)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select pf.id, p.id, p.numero, retail.fn_produccion_numero_texto(p.numero), pr.referencia, pf.clave, retail.fn_fase_nombre(pf.clave),
         pf.proveedor_id, pv.nombre, d.devengado, doc.documentado, d.devengado - doc.documentado, p.estado
    from retail.producciones p
    join retail.productos pr on pr.id = p.producto_id
    cross join lateral jsonb_array_elements(coalesce(retail.fn_fases_de_orden(p.id), '[]'::jsonb)) f
    join retail.produccion_fases pf on pf.id = (f ->> 'id')::uuid and pf.quien = 'servicio'
    left join retail.proveedores_produccion pv on pv.id = pf.proveedor_id
    cross join lateral (select coalesce((f ->> 'devengado')::numeric, 0) as devengado) d
    cross join lateral (
      select coalesce(round(sum(i.subtotal), 2), 0) as documentado
        from retail.comprobantes_produccion_items i
        join retail.comprobantes_produccion c on c.id = i.comprobante_id
       where i.fase_id = pf.id and c.estado = 'vigente'
    ) doc
   where retail.fn_es_lider()
     and p.estado <> 'anulada'
     and d.devengado - doc.documentado > 0
   order by p.numero, pf.secuencia;
$$;

revoke all on function retail.fn_servicios_por_pagar() from public, anon;
grant execute on function retail.fn_servicios_por_pagar() to authenticated;

create or replace function retail.fn_deuda_consolidada()
returns table (origen text, proveedor_id uuid, proveedor text, comprobantes bigint, saldo numeric, vencido numeric, proximo_vencimiento date)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select 'compras'::text, p.id, p.nombre, count(*), sum(c.saldo),
         coalesce(sum(c.saldo) filter (where c.condicion = 'credito' and c.fecha_vencimiento < retail.fn_hoy_lima()), 0),
         min(c.fecha_vencimiento) filter (where c.condicion = 'credito')
  from retail.compras c join retail.proveedores p on p.id = c.proveedor_id
  where retail.fn_es_lider() and c.estado = 'vigente' and c.saldo > 0
  group by p.id, p.nombre
  union all
  select 'produccion'::text, y.pid, coalesce(y.nombre, 'Servicios sin nombre'), sum(y.n)::bigint, sum(y.saldo), sum(y.vencido), min(y.vence)
  from (
    select x.proveedor_id as pid, p.nombre, count(*) as n, sum(x.total - x.pagado) as saldo,
           coalesce(sum(x.total - x.pagado) filter (where x.condicion = 'credito' and x.fecha_vencimiento < retail.fn_hoy_lima()), 0) as vencido,
           min(x.fecha_vencimiento) filter (where x.condicion = 'credito') as vence
    from (
      select c.*, coalesce((select sum(g.monto) from retail.comprobantes_produccion_pagos g where g.comprobante_id = c.id), 0) as pagado
      from retail.comprobantes_produccion c where c.estado = 'vigente'
    ) x join retail.proveedores_produccion p on p.id = x.proveedor_id
    where retail.fn_es_lider() and x.total - x.pagado > 0
    group by x.proveedor_id, p.nombre
    union all
    -- Los servicios de las órdenes que todavía no tienen papel (ADR-0614). Un servicio sin nombre cae en su propia fila.
    select s.proveedor_id, s.proveedor, count(*), sum(s.falta), 0, null::date
    from retail.fn_servicios_por_pagar() s
    group by s.proveedor_id, s.proveedor
  ) y
  group by y.pid, y.nombre
  order by 5 desc;
$$;

create or replace function pg_temp.reemplazar_anclado(p_firma text, p_viejo text, p_nuevo text)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_nuevo in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta migración: el ancla aparece % veces (se esperaba 1). Regenera el reemplazo desde su definición real.',
      p_firma, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

select pg_temp.reemplazar_anclado(
  'retail.registrar_proveedor_de_fase(uuid,uuid,numeric,numeric,integer,date)',
  $v$if v_f.estado_orden <> 'en_proceso' then
    raise exception 'La orden ya no está en proceso' using hint = 'orden_cerrada';
  end if;$v$,
  $n$if v_f.estado_orden = 'anulada' then
    raise exception 'La orden está anulada' using hint = 'orden_cerrada';
  end if;
  -- ADR-0614: con la orden terminada solo se escribe el nombre. El monto ya entró al costo de la prenda.
  if v_f.estado_orden = 'terminada'
     and (coalesce(p_tarifa_prenda, v_f.tarifa_prenda) is distinct from v_f.tarifa_prenda
          or coalesce(p_fijo_orden, v_f.fijo_orden) is distinct from v_f.fijo_orden) then
    raise exception 'La orden ya pasó al stock: el monto de «%» ya entró al costo de la prenda y no cambia. Registra solo quién lo hizo.', retail.fn_fase_nombre(v_f.clave)
      using hint = 'orden_cerrada_costo';
  end if;$n$
);

reset lock_timeout;
