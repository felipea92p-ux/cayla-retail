-- ============================================================================
-- 20261106165000 — La factura que llega con el mes cerrado (tarea 20 de «Las 36 de Finanzas»)
--
-- EL PROBLEMA PRIMERO. Una factura del 30 de octubre llega el 6 de noviembre, con octubre cerrado, y el sistema dice «reábrelo o registra con fecha de noviembre». Cambiar la fecha falsea el
-- registro de compras y el cruce con SUNAT; reabrir solo se puede en el último mes cerrado, y mueve lo ya declarado.
--
-- LA DECISIÓN (Felipe, 2026-11-06). El comprobante guarda su fecha real y entra en el mes abierto. `compras.fecha_contable` y `comprobantes_produccion.fecha_contable` dicen en qué mes cuenta, y
-- solo se llenan cuando no es el de la emisión: vacías, manda `fecha_emision`. Es la única excepción al candado de cierre, y la hace un disparador: ningún camino de registro cambia, ni puede
-- elegir otro mes a mano. El mes cerrado no se toca: su huella y la foto de su IGV siguen iguales.
--
-- QUÉ LEE LA FECHA CONTABLE: lo que dice en qué mes cuenta algo (el diario, el Balance, el IGV, el registro, el sustento y el cierre). Las pantallas de compras, proveedores y Por pagar siguen con
-- la fecha real: es lo que dice el papel.
--
-- SUPUESTO PARA EL CONTADOR: gasto y crédito fiscal entran en el mes abierto, no en el mes de la factura. El registro de compras la lista en ese mes con su fecha real. Lo revisa el contador.
--
-- NO HACE: un gasto SIN comprobante, un activo o un pago con fecha de un mes cerrado se siguen rechazando; no hay papel que justifique la excepción. El papel de un gasto de un mes cerrado va en
-- la migración 20261106170000.
--
-- CÓMO SE PEGA EN PRODUCCIÓN: una ejecución. Dos columnas sin valor por defecto (no reescriben las tablas), dos disparadores con `create or replace trigger`, sin políticas. Las funciones se
-- reescriben desde la definición viva; si un ancla no aparece las veces esperadas, aborta entero. Pegarla dos veces no hace nada. Verificado: `pnpm pruebas:factura-mes-cerrado`.
--
-- SE ROMPE SI: una migración futura recrea una de estas funciones copiando un texto viejo del repo (la prueba lo vigila).
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

-- ── 1. Las columnas y la regla ───────────────────────────────────────────────
alter table retail.compras add column if not exists fecha_contable date;
alter table retail.comprobantes_produccion add column if not exists fecha_contable date;
comment on column retail.compras.fecha_contable is
  'Tarea 20: en qué fecha cuenta, si no es la de emisión (llegó con su mes cerrado). Vacía, cuenta en fecha_emision. La pone un disparador.';
comment on column retail.comprobantes_produccion.fecha_contable is
  'Tarea 20: en qué fecha cuenta, si no es la de emisión (llegó con su mes cerrado). Vacía, cuenta en fecha_emision. La pone un disparador.';

-- La fecha en que cuenta algo con esa fecha real: la misma, o hoy si su mes está cerrado para esa unidad. Solo dice si un mes está cerrado.
create or replace function retail.fn_fecha_contable(p_ubicacion_id uuid, p_fecha date)
returns date
language sql
stable
security definer
set search_path to 'retail', 'public', 'extensions'
as $f$
  select case when retail.fn_primer_mes_cerrado(p_ubicacion_id, p_fecha) is not null then retail.fn_hoy_lima() else p_fecha end
$f$;
revoke all on function retail.fn_fecha_contable(uuid, date) from public, anon;
grant execute on function retail.fn_fecha_contable(uuid, date) to authenticated;

create or replace function retail.fn_compras_fecha_contable()
returns trigger
language plpgsql
security definer
set search_path to 'retail', 'public', 'extensions'
as $f$
begin
  if tg_op = 'UPDATE' and new.fecha_emision is not distinct from old.fecha_emision then
    new.fecha_contable := old.fecha_contable;
    return new;
  end if;
  new.fecha_contable := nullif(retail.fn_fecha_contable(new.ubicacion_gestion_id, new.fecha_emision), new.fecha_emision);
  return new;
end $f$;
revoke all on function retail.fn_compras_fecha_contable() from public, anon, authenticated;
-- Corre antes que `compras_mes_abierto`: los disparadores van en orden alfabético, y el candado ya mira la fecha contable.
create or replace trigger compras_fecha_contable
  before insert or update on retail.compras
  for each row execute function retail.fn_compras_fecha_contable();

create or replace function retail.fn_comprobantes_produccion_fecha_contable()
returns trigger
language plpgsql
security definer
set search_path to 'retail', 'public', 'extensions'
as $f$
begin
  if tg_op = 'UPDATE' and new.fecha_emision is not distinct from old.fecha_emision then
    new.fecha_contable := old.fecha_contable;
    return new;
  end if;
  new.fecha_contable := nullif(retail.fn_fecha_contable((select u.id from retail.ubicaciones u where u.tipo = 'taller' order by u.created_at, u.id limit 1), new.fecha_emision), new.fecha_emision);
  return new;
end $f$;
revoke all on function retail.fn_comprobantes_produccion_fecha_contable() from public, anon, authenticated;
create or replace trigger comprobantes_produccion_fecha_contable
  before insert or update on retail.comprobantes_produccion
  for each row execute function retail.fn_comprobantes_produccion_fecha_contable();

-- ── 2. Los candados miran en qué mes cuenta ──────────────────────────────────
select pg_temp.reemplazar('retail.fn_candado_compras()',
$a$perform retail.fn_exigir_mes_abierto(new.ubicacion_gestion_id, new.fecha_emision);$a$,
$n$perform retail.fn_exigir_mes_abierto(new.ubicacion_gestion_id, coalesce(new.fecha_contable, new.fecha_emision));$n$, 1);
select pg_temp.reemplazar('retail.fn_candado_compras()',
$a$perform retail.fn_exigir_mes_abierto(old.ubicacion_gestion_id, old.fecha_emision, null,$a$,
$n$perform retail.fn_exigir_mes_abierto(old.ubicacion_gestion_id, coalesce(old.fecha_contable, old.fecha_emision), null,$n$, 1);
select pg_temp.reemplazar('retail.fn_candado_compras()',
$a$perform retail.fn_exigir_mes_abierto(new.ubicacion_gestion_id, new.fecha_emision, null, 'cambiar esta factura');$a$,
$n$perform retail.fn_exigir_mes_abierto(new.ubicacion_gestion_id, coalesce(new.fecha_contable, new.fecha_emision), null, 'cambiar esta factura');$n$, 1);

select pg_temp.reemplazar('retail.fn_candado_comprobantes_produccion()',
$a$perform retail.fn_exigir_mes_abierto(v_taller, new.fecha_emision);$a$,
$n$perform retail.fn_exigir_mes_abierto(v_taller, coalesce(new.fecha_contable, new.fecha_emision));$n$, 1);
select pg_temp.reemplazar('retail.fn_candado_comprobantes_produccion()',
$a$perform retail.fn_exigir_mes_abierto(v_taller, old.fecha_emision, null,$a$,
$n$perform retail.fn_exigir_mes_abierto(v_taller, coalesce(old.fecha_contable, old.fecha_emision), null,$n$, 1);
select pg_temp.reemplazar('retail.fn_candado_comprobantes_produccion()',
$a$perform retail.fn_exigir_mes_abierto(v_taller, new.fecha_emision, null, 'cambiar este comprobante');$a$,
$n$perform retail.fn_exigir_mes_abierto(v_taller, coalesce(new.fecha_contable, new.fecha_emision), null, 'cambiar este comprobante');$n$, 1);

-- ── 3. El gasto y su pago también entran en el mes abierto ───────────────────
select pg_temp.reemplazar('retail.registrar_gasto(uuid,text,text,date,numeric,jsonb,text,uuid,uuid,text,uuid,uuid,uuid)',
$a$values (p_ubicacion_id, p_categoria, trim(p_descripcion), p_fecha, v_monto, v_pago.o_igv, v_pago.o_compra_id,$a$,
$n$values (p_ubicacion_id, p_categoria, trim(p_descripcion), case when v_pago.o_compra_id is not null then retail.fn_fecha_contable(p_ubicacion_id, p_fecha) else p_fecha end, v_monto, v_pago.o_igv, v_pago.o_compra_id,$n$, 1);
-- El pago sin fecha propia toma la del mes abierto. Va después de crear la compra: así no toca el texto que dejó 20261106013000.
select pg_temp.reemplazar('retail.fn_comprobante_y_pago(text,uuid,date,numeric,text,jsonb,text,uuid,uuid,text,text,uuid,uuid)',
$a$    returning id into o_compra_id;
    if v_cond = 'contado' then$a$,
$n$    returning id into o_compra_id;
    v_fecha_pago := coalesce(v_fecha_pago, retail.fn_fecha_contable(p_ubicacion_id, p_fecha));
    if v_cond = 'contado' then$n$, 1);

-- ── 4. Lo que dice en qué mes cuenta algo ────────────────────────────────────
-- El diario: la mercadería entra en su fecha contable. Lo demás entra por el gasto o el activo, que ya tienen la suya.
select pg_temp.reemplazar('retail.fn_asientos(date,date,uuid)',
$a$select c.id, c.ubicacion_gestion_id as ubicacion_id, c.fecha_emision as f, c.subtotal, c.igv, c.total,$a$,
$n$select c.id, c.ubicacion_gestion_id as ubicacion_id, coalesce(c.fecha_contable, c.fecha_emision) as f, c.subtotal, c.igv, c.total,$n$, 1);
select pg_temp.reemplazar('retail.fn_asientos(date,date,uuid)',
$a$where c.naturaleza = 'mercaderia' and c.estado = 'vigente' and c.fecha_emision between p_desde and p_hasta$a$,
$n$where c.naturaleza = 'mercaderia' and c.estado = 'vigente' and coalesce(c.fecha_contable, c.fecha_emision) between p_desde and p_hasta$n$, 1);

-- El Balance: lo que se le debe al proveedor y lo que falta recibir, en el mismo mes que el diario.
select pg_temp.reemplazar('retail.fn_bal_facturas(date)',
$a$where c.estado = 'vigente' and c.fecha_emision <= p_corte$a$,
$n$where c.estado = 'vigente' and coalesce(c.fecha_contable, c.fecha_emision) <= p_corte$n$, 1);
select pg_temp.reemplazar('retail.fn_bal_por_recibir(date)',
$a$where c.naturaleza = 'mercaderia' and c.estado = 'vigente' and c.fecha_emision <= p_corte$a$,
$n$where c.naturaleza = 'mercaderia' and c.estado = 'vigente' and coalesce(c.fecha_contable, c.fecha_emision) <= p_corte$n$, 1);
select pg_temp.reemplazar('retail.fn_bal_causas_mercaderia(date,date)',
$a$where mv.tipo = 'entrada' and (k.estado <> 'vigente' or k.fecha_emision > p_hasta)$a$,
$n$where mv.tipo = 'entrada' and (k.estado <> 'vigente' or coalesce(k.fecha_contable, k.fecha_emision) > p_hasta)$n$, 1);
select pg_temp.reemplazar('retail.fn_bal_causas_mercaderia(date,date)',
$a$where k.naturaleza = 'mercaderia' and k.estado = 'vigente' and k.fecha_emision between p_desde and p_hasta$a$,
$n$where k.naturaleza = 'mercaderia' and k.estado = 'vigente' and coalesce(k.fecha_contable, k.fecha_emision) between p_desde and p_hasta$n$, 1);
select pg_temp.reemplazar('retail.fn_bal_causas_mercaderia(date,date)',
$a$where k.estado = 'vigente' and k.fecha_emision <= p_hasta and x.created_at >= lim.ini and x.created_at < lim.fin$a$,
$n$where k.estado = 'vigente' and coalesce(k.fecha_contable, k.fecha_emision) <= p_hasta and x.created_at >= lim.ini and x.created_at < lim.fin$n$, 1);

-- El cierre: una factura que cuenta en noviembre no le falta a octubre.
select pg_temp.reemplazar('retail.fn_cierre_mes_estado(date)',
$a$       and c.fecha_emision <= v_fin
     group by c.ubicacion_gestion_id$a$,
$n$       and coalesce(c.fecha_contable, c.fecha_emision) <= v_fin
     group by c.ubicacion_gestion_id$n$, 1);

-- El IGV: el crédito, en su mes contable.
select pg_temp.reemplazar('retail.fn_impuestos_compras(date,date)',
$a$select 'compra', k.id, k.naturaleza, k.fecha_emision, k.tipo, k.subtotal, k.igv, k.total, k.tipo = 'factura'$a$,
$n$select 'compra', k.id, k.naturaleza, coalesce(k.fecha_contable, k.fecha_emision), k.tipo, k.subtotal, k.igv, k.total, k.tipo = 'factura'$n$, 1);
select pg_temp.reemplazar('retail.fn_impuestos_compras(date,date)',
$a$and k.fecha_emision between p_desde and p_hasta$a$,
$n$and coalesce(k.fecha_contable, k.fecha_emision) between p_desde and p_hasta$n$, 1);
select pg_temp.reemplazar('retail.fn_impuestos_compras(date,date)',
$a$select 'taller', p.id, 'taller', p.fecha_emision, p.tipo, p.subtotal, p.igv, p.total, p.tipo = 'factura'$a$,
$n$select 'taller', p.id, 'taller', coalesce(p.fecha_contable, p.fecha_emision), p.tipo, p.subtotal, p.igv, p.total, p.tipo = 'factura'$n$, 1);
select pg_temp.reemplazar('retail.fn_impuestos_compras(date,date)',
$a$and p.fecha_emision between p_desde and p_hasta$a$,
$n$and coalesce(p.fecha_contable, p.fecha_emision) between p_desde and p_hasta$n$, 1);
select pg_temp.reemplazar('retail.fn_igv_credito_fiscal(date)',
$a$where estado = 'vigente' and fecha_emision >= m.ini and fecha_emision < m.ini + interval '1 month'$a$,
$n$where estado = 'vigente' and coalesce(fecha_contable, fecha_emision) >= m.ini and coalesce(fecha_contable, fecha_emision) < m.ini + interval '1 month'$n$, 2);
select pg_temp.reemplazar('retail.fn_impuestos_panel(date)',
$a$where k.estado = 'vigente' and k.tipo = 'boleta' and k.fecha_emision between v_mes and v_fin_mes$a$,
$n$where k.estado = 'vigente' and k.tipo = 'boleta' and coalesce(k.fecha_contable, k.fecha_emision) between v_mes and v_fin_mes$n$, 1);
select pg_temp.reemplazar('retail.fn_impuestos_panel(date)',
$a$where p.estado = 'vigente' and p.tipo = 'boleta' and p.fecha_emision between v_mes and v_fin_mes$a$,
$n$where p.estado = 'vigente' and p.tipo = 'boleta' and coalesce(p.fecha_contable, p.fecha_emision) between v_mes and v_fin_mes$n$, 1);
-- Los recibos por honorarios del aviso del panel siguen con su fecha real: ese texto lo dejó 20261105222000 y cambiarlo rompería volver a pegarla. Es un
-- aviso, no una cifra que se declare.

-- El registro de compras: la lista el mes en que cuenta, con su fecha real.
select pg_temp.reemplazar('retail.fn_impuestos_registro_compras(date)',
$a$and k.fecha_emision between v_ini and v_fin$a$,
$n$and coalesce(k.fecha_contable, k.fecha_emision) between v_ini and v_fin$n$, 1);
select pg_temp.reemplazar('retail.fn_impuestos_registro_compras(date)',
$a$and p.fecha_emision between v_ini and v_fin$a$,
$n$and coalesce(p.fecha_contable, p.fecha_emision) between v_ini and v_fin$n$, 1);

-- El sustento de la renta: en el mismo mes que el gasto.
select pg_temp.reemplazar('retail.fn_sustento_costos(date,date)',
$a$and k.fecha_emision between p_desde and p_hasta$a$,
$n$and coalesce(k.fecha_contable, k.fecha_emision) between p_desde and p_hasta$n$, 2);
select pg_temp.reemplazar('retail.fn_sustento_costos(date,date)',
$a$where p.estado = 'vigente' and p.fecha_emision between p_desde and p_hasta$a$,
$n$where p.estado = 'vigente' and coalesce(p.fecha_contable, p.fecha_emision) between p_desde and p_hasta$n$, 1);

reset lock_timeout;
