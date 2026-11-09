-- ============================================================================
-- 20261109143000 — El IGV de un mes cerrado deja una foto, y cambiarlo se avisa (tarea 19 de «Las 36 de Finanzas»)
--
-- EL PROBLEMA PRIMERO. `fn_impuestos_igv_meses` se calcula en vivo, y cada mes arrastra el saldo del anterior. Dos cosas podían mover el IGV de un mes ya cerrado sin que nadie se entere:
-- anular en noviembre una boleta aceptada de octubre (baja el débito de octubre y sube el saldo de noviembre, sin tocar el diario), y los comprobantes del Taller, que no tenían candado de
-- mes. El saldo a favor de arranque también lo esquivaba: `fn_exigir_vigencia_sin_meses_cerrados` no lo miraba.
--
-- LA DECISIÓN.
--   1. Los candados que faltaban: un comprobante del Taller se rige por el mes del Taller, y el saldo a favor por los meses cerrados.
--   2. `periodo_igv`: al cerrar CAYLA entera se guarda la foto del IGV del mes, atada a ese cierre. Una reapertura con otro cierre deja su propia foto.
--   3. `fn_igv_cambios_desde_cierre()`: los meses cerrados cuyo IGV de hoy ya no es el de su foto. Solo avisa.
--
-- SUPUESTO PARA EL CONTADOR: si cambia un comprobante de un mes declarado, ¿rectificatoria o ajuste en el mes corriente? Eso sigue sin decidirse, y por eso lo declarado sigue saliendo del
-- cálculo en vivo y no de la foto: la foto solo sirve para avisar que algo cambió.
--
-- NO HACE: no impide anular una boleta (SUNAT manda sobre eso), no cambia ninguna cifra y no reescribe el pasado. No hay fotos de meses cerrados antes de esta migración: no se puede saber qué
-- decían, y la función no los compara.
--
-- CÓMO SE PEGA EN PRODUCCIÓN: una ejecución, DESPUÉS de 20261107172000 (rendimiento de Finanzas: reescribe `fn_impuestos_igv_meses` y comprueba su huella; si esta va antes, aquella aborta). Crea una tabla (con RLS y sin políticas: se lee solo por funciones) y un disparador con `create or replace trigger`. Las funciones se reescriben
-- desde la definición viva; si un ancla no aparece exactamente una vez, aborta entero. Pegarla dos veces no hace nada. Verificado: `pnpm pruebas:igv-congelado`.
--
-- SE ROMPE SI: una migración futura recrea `cerrar_periodo` copiando un texto viejo del repo (la prueba lo vigila).
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

-- ── 1. Los candados que faltaban ─────────────────────────────────────────────
select pg_temp.reemplazar('retail.fn_exigir_vigencia_sin_meses_cerrados(text,date)',
$a$if p_nombre is null or p_nombre not in ('igv', 'tope_planilla_movilidad') or p_desde is null then$a$,
$n$if p_nombre is null or p_nombre not in ('igv', 'tope_planilla_movilidad', 'saldo_favor_igv') or p_desde is null then$n$, 1);
select pg_temp.reemplazar('retail.fn_exigir_vigencia_sin_meses_cerrados(text,date)',
$a$case p_nombre when 'igv' then 'el IGV' else 'el tope de la planilla de movilidad' end$a$,
$n$case p_nombre when 'igv' then 'el IGV' when 'saldo_favor_igv' then 'el saldo a favor del IGV' else 'el tope de la planilla de movilidad' end$n$, 1);

create or replace function retail.fn_candado_comprobantes_produccion()
returns trigger
language plpgsql
security definer
set search_path to 'retail', 'public', 'extensions'
as $f$
declare
  v_taller uuid := (select u.id from retail.ubicaciones u where u.tipo = 'taller' order by u.created_at, u.id limit 1);
begin
  if tg_op = 'INSERT' then
    perform retail.fn_exigir_mes_abierto(v_taller, new.fecha_emision);
    return new;
  end if;
  if (new.estado, new.tipo, new.fecha_emision, new.subtotal, new.igv, new.total)
     is distinct from (old.estado, old.tipo, old.fecha_emision, old.subtotal, old.igv, old.total) then
    perform retail.fn_exigir_mes_abierto(v_taller, old.fecha_emision, null,
      case when new.estado = 'anulado' and old.estado <> 'anulado' then 'anular este comprobante' else 'cambiar este comprobante' end);
    perform retail.fn_exigir_mes_abierto(v_taller, new.fecha_emision, null, 'cambiar este comprobante');
  end if;
  return new;
end $f$;
revoke all on function retail.fn_candado_comprobantes_produccion() from public, anon, authenticated;
create or replace trigger comprobantes_produccion_mes_abierto
  before insert or update on retail.comprobantes_produccion
  for each row execute function retail.fn_candado_comprobantes_produccion();

-- ── 2. La foto, al cerrar CAYLA entera ───────────────────────────────────────
create table if not exists retail.periodo_igv (
  cierre_id uuid primary key references retail.periodo_cierres (id),
  mes date not null check (mes = date_trunc('month', mes)::date),
  comprobantes integer not null,
  debito numeric not null,
  credito numeric not null,
  saldo_anterior numeric not null,
  a_pagar numeric not null,
  saldo_a_favor numeric not null,
  creado_en timestamptz not null default now()
);
alter table retail.periodo_igv enable row level security;
comment on table retail.periodo_igv is
  'Tarea 19: el IGV del mes como estaba al cerrar CAYLA entera. Una fila por cierre; la vigente es la del cierre que apunta el período. Sirve para avisar que cambió, no para declarar.';

-- Quien cierra el mes tiene que poder leer su IGV: la foto la saca él, aunque su rol no vea Impuestos.
select pg_temp.reemplazar('retail.fn_impuestos_igv_meses(date,date)',
$a$if not (retail.fn_puede_ver_impuestos() or retail.fn_ve_estados_financieros_de_todo()) then$a$,
$n$if not (retail.fn_puede_ver_impuestos() or retail.fn_ve_estados_financieros_de_todo() or retail.fn_puede_cerrar_mes()) then$n$, 1);

select pg_temp.reemplazar('retail.cerrar_periodo(date,text,uuid)',
$a$          v_debe, v_haber, v_unidades, v_avisos);

  return jsonb_build_object('cierre_id', v_cierre, 'huella', v_huella, 'lineas', v_lineas, 'version', v_version);$a$,
$n$          v_debe, v_haber, v_unidades, v_avisos);

  -- Tarea 19: al cerrar CAYLA entera queda la foto del IGV del mes.
  if p_alcance = 'consolidado' then
    insert into retail.periodo_igv (cierre_id, mes, comprobantes, debito, credito, saldo_anterior, a_pagar, saldo_a_favor)
    select v_cierre, v_mes, g.comprobantes, g.debito, g.credito, g.saldo_anterior, g.a_pagar, g.saldo_a_favor
      from retail.fn_impuestos_igv_meses(v_mes, v_fin) g
     where g.mes = v_mes;
  end if;

  return jsonb_build_object('cierre_id', v_cierre, 'huella', v_huella, 'lineas', v_lineas, 'version', v_version);$n$, 1);

-- ── 3. El aviso ──────────────────────────────────────────────────────────────
-- Los meses con CAYLA entera cerrada cuyo IGV de hoy ya no es el de su foto. Se compara a pagar y saldo a favor: si solo cambió lo que arrastra de un mes anterior, también cambia lo que se debe.
create or replace function retail.fn_igv_cambios_desde_cierre()
returns table (mes date, debito_foto numeric, debito_hoy numeric, credito_foto numeric, credito_hoy numeric, a_pagar_foto numeric, a_pagar_hoy numeric, a_favor_foto numeric, a_favor_hoy numeric)
language plpgsql
stable
security definer
set search_path to 'retail', 'public', 'extensions'
as $f$
#variable_conflict use_column
declare
  v_ini date;
  v_fin date;
begin
  if not (retail.fn_puede_ver_impuestos() or retail.fn_ve_estados_financieros_de_todo() or retail.fn_puede_cerrar_mes()) then
    raise exception 'Ver los impuestos necesita el módulo «Impuestos» en tu rol.' using errcode = '42501';
  end if;
  select min(f.mes), max(f.mes) into v_ini, v_fin
    from retail.periodo_igv f
    join retail.periodos p on p.cierre_id = f.cierre_id and p.estado = 'cerrado' and p.alcance = 'consolidado';
  if v_ini is null then
    return;
  end if;
  return query
    select f.mes, f.debito, g.debito, f.credito, g.credito, f.a_pagar, g.a_pagar, f.saldo_a_favor, g.saldo_a_favor
      from retail.periodo_igv f
      join retail.periodos p on p.cierre_id = f.cierre_id and p.estado = 'cerrado' and p.alcance = 'consolidado'
      join retail.fn_impuestos_igv_meses(v_ini, v_fin) g on g.mes = f.mes
     where round(f.debito, 2) <> round(g.debito, 2) or round(f.credito, 2) <> round(g.credito, 2)
        or round(f.a_pagar, 2) <> round(g.a_pagar, 2) or round(f.saldo_a_favor, 2) <> round(g.saldo_a_favor, 2)
     order by f.mes desc;
end $f$;
revoke all on function retail.fn_igv_cambios_desde_cierre() from public, anon;
grant execute on function retail.fn_igv_cambios_desde_cierre() to authenticated;

reset lock_timeout;
