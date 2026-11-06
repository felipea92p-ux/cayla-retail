-- ============================================================================
-- 20261106021000 — La renta del año mira bien qué resta y la ve quien tiene Impuestos (tarea 17 de «Las 36 de Finanzas», ADR-0598)
--
-- EL PROBLEMA PRIMERO. Todo gasto sin compra salía «sin sustento» y se proyectaba, comisiones bancarias incluidas. Una factura pagada en efectivo de S/ 2 000 o más contaba como sustentada, aunque sin
-- bancarizar no resta. Y `fn_sustento_costos` solo la dejaba leer al líder, así que quien tiene Impuestos delegado veía un error en la tarjeta.
--
-- LA DECISIÓN.
--   1. `categorias_gasto.no_requiere_papel`: una categoría que no lleva comprobante de un proveedor. Devuelve el papel `no_requiere`, que resta. Arranca con gastos bancarios y tributos.
--   2. Lo pagado sin bancarizar devuelve el papel `no_bancarizado`, que no resta, por la parte que se pagó así. Sale de `fn_pago_no_bancarizado`, la misma regla que pierde el IGV.
--   3. Permiso: `fn_puede_ver_impuestos`, el del módulo. ADR-0598 lo dejó solo para el líder; quien tiene el módulo ya descarga el registro de compras.
--
-- SUPUESTOS PARA EL CONTADOR: qué categorías no requieren papel (basta cambiar esa columna), y que lo no bancarizado no resta aunque tenga factura (Ley 28194, art. 8).
--
-- CÓMO SE PEGA EN PRODUCCIÓN: una ejecución, sin políticas. Agrega una columna a una tabla de configuración y reescribe una función desde su definición viva; si un ancla no aparece, aborta entero.
-- Pegarla dos veces no hace nada. Verificado: `pnpm pruebas:sustento-costos`.
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function pg_temp.reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
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
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

alter table retail.categorias_gasto add column if not exists no_requiere_papel boolean not null default false;
comment on column retail.categorias_gasto.no_requiere_papel is
  'Tarea 17: un gasto de esta categoría no lleva comprobante de un proveedor (el banco, SUNAT) y resta en la renta sin él. Lo confirma el contador.';
update retail.categorias_gasto set no_requiere_papel = true where codigo in ('gastos_bancarios', 'tributos') and not no_requiere_papel;

select pg_temp.reemplazar('retail.fn_sustento_costos(date,date)',
$a$  if not coalesce(retail.fn_es_lider(), false) then
    raise exception 'Solo el líder ve el sustento de los costos (es el dinero de compras).' using errcode = '42501';
  end if;$a$,
$n$  if not retail.fn_puede_ver_impuestos() then
    raise exception 'Ver el sustento de los costos necesita el módulo Impuestos en tu rol.' using errcode = '42501';
  end if;$n$, 1);

select pg_temp.reemplazar('retail.fn_sustento_costos(date,date)',
$a$           k.proveedor_id, pr.nombre::text as proveedor, k.tipo as papel, k.id as doc, k.subtotal as monto
      from retail.compras k
      join retail.proveedores pr on pr.id = k.proveedor_id
     where k.estado = 'vigente' and k.naturaleza in ('mercaderia', 'gasto')
       and k.fecha_emision between p_desde and p_hasta
    union all$a$,
$n$           k.proveedor_id, pr.nombre::text as proveedor, k.tipo as papel, k.id as doc, k.subtotal - nb.monto as monto
      from retail.compras k
      join retail.proveedores pr on pr.id = k.proveedor_id
      cross join lateral (
        select coalesce(sum(cp.monto) filter (where retail.fn_pago_no_bancarizado(k.total, cp.metodo, cu.tipo)), 0) * k.subtotal / nullif(k.total, 0) as monto
          from retail.compra_pagos cp left join retail.cuentas_dinero cu on cu.id = cp.cuenta_dinero_id where cp.compra_id = k.id
      ) nb
     where k.estado = 'vigente' and k.naturaleza in ('mercaderia', 'gasto')
       and k.fecha_emision between p_desde and p_hasta
    union all
    -- Tarea 17: la parte de esa compra que se pagó sin bancarizar no resta, aunque tenga factura.
    select case k.naturaleza when 'mercaderia' then 'mercaderia' else 'gasto' end, k.proveedor_id, pr.nombre::text, 'no_bancarizado', k.id,
           sum(cp.monto) * k.subtotal / nullif(k.total, 0)
      from retail.compras k
      join retail.proveedores pr on pr.id = k.proveedor_id
      join retail.compra_pagos cp on cp.compra_id = k.id
      left join retail.cuentas_dinero cu on cu.id = cp.cuenta_dinero_id
     where k.estado = 'vigente' and k.naturaleza in ('mercaderia', 'gasto')
       and k.fecha_emision between p_desde and p_hasta
       and retail.fn_pago_no_bancarizado(k.total, cp.metodo, cu.tipo)
     group by k.id, k.naturaleza, k.proveedor_id, pr.nombre, k.subtotal, k.total
    union all$n$, 1);

select pg_temp.reemplazar('retail.fn_sustento_costos(date,date)',
$a$    select 'gasto', null::uuid, null::text, coalesce(gv.papel, 'sin_comprobante'), g.id, g.monto_total - g.igv
      from retail.gastos g
      left join retail.gastos_viaje gv on gv.gasto_id = g.id$a$,
$n$    select 'gasto', null::uuid, null::text,
           case when cg.no_requiere_papel then 'no_requiere'
                when gv.papel is not null and retail.fn_pago_no_bancarizado(g.monto_total, g.medio_pago, cu.tipo) then 'no_bancarizado'
                else coalesce(gv.papel, 'sin_comprobante') end,
           g.id, g.monto_total - g.igv
      from retail.gastos g
      join retail.categorias_gasto cg on cg.codigo = g.categoria
      left join retail.cuentas_dinero cu on cu.id = g.cuenta_dinero_id
      left join retail.gastos_viaje gv on gv.gasto_id = g.id$n$, 1);

reset lock_timeout;
