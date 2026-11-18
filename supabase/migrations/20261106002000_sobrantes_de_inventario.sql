-- ============================================================================
-- 20261106002000 — Los sobrantes de inventario entran al diario, desde una fecha de corte (tarea 6 de «Las 36 de Finanzas»)
--
-- EL PROBLEMA PRIMERO. Desde el 1 de octubre los faltantes van a la 6951, unos S/ 10 mil, y +1,699 unidades que aparecieron, unos S/ 50 mil a costo de hoy, no
-- tienen asiento. ADR-0120 lo dejó sin reconocer «hasta saber su origen» y nadie decidió octubre. El resultado queda sesgado a la baja y la 201 no cuadra.
--
-- LA DECISIÓN, con la recomendación que Felipe pidió seguir (2026-11-05) y que su contador revisa:
--   · DESDE EL 1 DE NOVIEMBRE (`parametros_finanzas.sobrantes_asientan_desde`), lo que aparece en un conteo o a mano entra a la 201 contra la cuenta nueva 6959, en
--     «Gastos»: resta como lo que es, una merma al revés. Mermas sigue diciendo solo lo que se perdió.
--   · ANTES DEL CORTE, NO PEGA AL RESULTADO. Abonarlo subiría octubre unos S/ 50 mil, y parte es mercadería sin papel o el censo de arranque. Sale de `otras_entradas` a
--     su propia causa, `sobrantes_sin_asiento`, que da nota en la 201: se sabe qué es y cuánto. Se ubica cuando se decida el arranque.
--
-- SUPUESTOS PARA EL CONTADOR: el código 6959 (el PCGE podría pedir la 759 en «otros ingresos»; se repite esta migración con ese código, como dice la 6951), que octubre no
-- reconoce sus sobrantes, y que los faltantes de octubre siguen en la 6951, así que octubre sigue sesgado unos S/ 10 mil a la baja hasta decidirlo.
--
-- CÓMO SE PEGA EN PRODUCCIÓN: una ejecución. Sin políticas. Agrega una columna a una tabla de configuración, y reescribe dos funciones desde su definición viva; si un ancla
-- no aparece exactamente las veces esperadas, aborta entero. Va después de 20261106001000. Verificado: `pnpm pruebas:balance`, `pnpm pruebas:perdidas`.
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

alter table retail.parametros_finanzas add column if not exists sobrantes_asientan_desde date not null default '2026-11-01';
comment on column retail.parametros_finanzas.sobrantes_asientan_desde is
  'Tarea 6: desde este día, lo que aparece en un conteo o a mano entra al diario (201 contra 6959). Lo anterior da nota en la comprobación de la 201 y no pega al resultado.';

insert into retail.cuentas (codigo, nombre, tipo, seccion_resultados, orden)
values ('6959', 'Sobrantes de inventario (restan de los gastos)', 'gasto', 'gastos_operacion', 48)
on conflict (codigo) do nothing;

create or replace function retail.fn_sobrantes_asientan_desde()
returns timestamptz
language sql stable security definer
set search_path = retail, public, extensions
as $$ select (p.sobrantes_asientan_desde::timestamp at time zone 'America/Lima') from retail.parametros_finanzas p where p.id; $$;
comment on function retail.fn_sobrantes_asientan_desde() is 'Tarea 6: desde qué momento los sobrantes de inventario entran al diario. Interna: la usan fn_asientos y la comprobación de la 201.';
revoke all on function retail.fn_sobrantes_asientan_desde() from public, anon;
grant execute on function retail.fn_sobrantes_asientan_desde() to authenticated;

select pg_temp.reemplazar('retail.fn_asientos(date,date,uuid)',
$a$  l_merma as ($a$,
$n$  -- Tarea 6: lo que apareció, desde el corte y al costo de ese día. Antes del corte da nota en la comprobación de la 201.
  sb_inv as (
    select m.id, m.ubicacion_id, (m.created_at at time zone 'America/Lima')::date as f,
           abs(m.cantidad) * retail.fn_costo_variante_al(m.variante_id, m.created_at) as valor
      from retail.movimientos m
     where m.created_at >= greatest(v_ini, retail.fn_sobrantes_asientan_desde()) and m.created_at < v_fin
       and m.variante_id <> '22222222-2222-4222-8222-222222222222'
       and retail.fn_perdida_lado(m.tipo, m.motivo, m.cantidad) = 'aparecio'
       and not retail.fn_movimiento_es_de_claure(m.empresa_id, m.ubicacion_id, m.created_at)
       and (v_todo or m.ubicacion_id = any (v_ubics))
  ),
  l_sobrante as (
    select s.f, s.ubicacion_id, 'sobrante:' || s.id as asiento, 'sobrante'::text as regla,
           '201'::text as cuenta, s.valor as debe, 0::numeric as haber, 'movimientos'::text as ot, s.id as oid,
           'Entra la mercadería que apareció' as glosa
      from sb_inv s where s.valor > 0
    union all
    select s.f, s.ubicacion_id, 'sobrante:' || s.id, 'sobrante', '6959', 0, s.valor, 'movimientos', s.id, 'Sobrante de inventario al costo de ese día'
      from sb_inv s where s.valor > 0
  ),
  l_merma as ($n$, 1);

select pg_temp.reemplazar('retail.fn_asientos(date,date,uuid)',
$a$union all select * from l_merma union all$a$,
$n$union all select * from l_merma union all select * from l_sobrante union all$n$, 1);

select pg_temp.reemplazar('retail.fn_bal_causas_mercaderia(date,date)',
$a$        or (mv.tipo = 'ajuste' and mv.cantidad > 0)
    union all$a$,
$n$    union all
    -- Tarea 6: lo que apareció antes del corte no tiene asiento a propósito. Desde el corte lo asienta el diario.
    select 'sobrantes_sin_asiento', 'Sobrantes y reposiciones de antes del corte: no pegan al resultado hasta ubicarlos',
           -sum(mv.dq * mv.c_mov) from mv
     where retail.fn_perdida_lado(mv.tipo, mv.motivo, mv.cantidad) = 'aparecio' and mv.created_at < retail.fn_sobrantes_asientan_desde()
    union all$n$, 1);

select pg_temp.reemplazar('retail.fn_conciliacion_contable(date)',
$a$('venta_sin_prenda', 'redondeo', 'recepcion_sin_factura')$a$,
$n$('venta_sin_prenda', 'redondeo', 'recepcion_sin_factura', 'sobrantes_sin_asiento')$n$, 2);

reset lock_timeout;
