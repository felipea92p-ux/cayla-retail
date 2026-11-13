-- VUELTA de 20261113170000_cuadre_se_corta_al_anotar.sql (ADR-0652). Deja las cuatro funciones como estaban: el saldo del
-- sistema de un cuadre vuelve a sumar el día entero. La columna `conciliaciones.movido_del_dia` se queda (nula o no, ya nadie la
-- lee). Una sola parte; se puede pegar dos veces. La CLI no la corre (el nombre no empieza con un número).

set lock_timeout = '3s';
set search_path = retail, public, extensions;

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
    raise exception '% cambió desde que se escribió esta vuelta: se esperaban % apariciones de «%» y hay %.', p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

select pg_temp.reemplazar('retail.fn_conciliaciones_solo_anular()',
$n$     or (new.id, new.cuenta_id, new.fecha, new.saldo_banco, new.nota, new.registrado_por, new.created_at, new.movido_del_dia)
        is distinct from (old.id, old.cuenta_id, old.fecha, old.saldo_banco, old.nota, old.registrado_por, old.created_at, old.movido_del_dia) then$n$,
$v$     or (new.id, new.cuenta_id, new.fecha, new.saldo_banco, new.nota, new.registrado_por, new.created_at)
        is distinct from (old.id, old.cuenta_id, old.fecha, old.saldo_banco, old.nota, old.registrado_por, old.created_at) then$v$,
1);

select pg_temp.reemplazar('retail.registrar_conciliacion(uuid, date, numeric, text)',
$n$    -- ADR-0652: el día de hoy todavía corre. Lo que se había movido hasta ahora queda en la conciliación; lo de después, para el próximo cuadre.
    insert into retail.conciliaciones (cuenta_id, fecha, saldo_banco, nota, registrado_por, movido_del_dia)
    values (p_cuenta_id, p_fecha, round(p_saldo_banco, 2), nullif(trim(coalesce(p_nota, '')), ''), retail.fn_actor_persona_id(true),
            case when p_fecha = retail.fn_hoy_lima() then
              coalesce((select sum(l.monto) from retail.fn_dinero_libro(p_fecha) l where l.cuenta_id = p_cuenta_id and l.fecha = p_fecha), 0)
            end)$n$,
$v$    insert into retail.conciliaciones (cuenta_id, fecha, saldo_banco, nota, registrado_por)
    values (p_cuenta_id, p_fecha, round(p_saldo_banco, 2), nullif(trim(coalesce(p_nota, '')), ''), retail.fn_actor_persona_id(true))$v$,
1);

select pg_temp.reemplazar('retail.fn_conciliacion(uuid, date)',
$n$           -- ADR-0652: los días anteriores en vivo; el día mismo, lo que se había movido al anotar (si se anotó ese mismo día).
           v_c.saldo_inicial + coalesce((select sum(l.monto) from libro l where l.fecha < cc.fecha), 0)
             + coalesce(cc.movido_del_dia, (select sum(l.monto) from libro l where l.fecha = cc.fecha), 0) as saldo_sistema,
           case when cc.movido_del_dia is not null then
             coalesce((select sum(l.monto) from libro l where l.fecha = cc.fecha), 0) - cc.movido_del_dia
           end as despues,$n$,
$v$           v_c.saldo_inicial + coalesce((select sum(l.monto) from libro l where l.fecha <= cc.fecha), 0) as saldo_sistema,$v$,
1);
select pg_temp.reemplazar('retail.fn_conciliacion(uuid, date)',
$n$                                               'diferencia', h.saldo_banco - h.saldo_sistema, 'nota', h.nota, 'registrado_por', h.registrado_por,
                                               'despues', h.despues)$n$,
$v$                                               'diferencia', h.saldo_banco - h.saldo_sistema, 'nota', h.nota, 'registrado_por', h.registrado_por)$v$,
1);

select pg_temp.reemplazar('retail.fn_conciliacion_cuentas()',
$n$    select distinct on (cc.cuenta_id) cc.cuenta_id, cc.fecha, cc.saldo_banco, cc.movido_del_dia
$n$,
$v$    select distinct on (cc.cuenta_id) cc.cuenta_id, cc.fecha, cc.saldo_banco
$v$,
1);
select pg_temp.reemplazar('retail.fn_conciliacion_cuentas()',
$n$                              where l.cuenta_id = c.id and (c.saldo_desde is null or l.fecha >= c.saldo_desde) and l.fecha < ul.fecha), 0)
                           -- ADR-0652: el día mismo, lo que se había movido al anotar (si se anotó ese mismo día).
                           + coalesce(ul.movido_del_dia, (select sum(l.monto) from libro l where l.cuenta_id = c.id and l.fecha = ul.fecha), 0))$n$,
$v$                              where l.cuenta_id = c.id and (c.saldo_desde is null or l.fecha >= c.saldo_desde) and l.fecha <= ul.fecha), 0))$v$,
1);

do $comprobar$
begin
  if exists (select 1 from pg_proc p where p.pronamespace = 'retail'::regnamespace
              and p.proname in ('fn_conciliaciones_solo_anular', 'registrar_conciliacion', 'fn_conciliacion', 'fn_conciliacion_cuentas')
              and p.prosrc like '%movido_del_dia%') then
    raise exception 'Quedó el corte en alguna función: la vuelta no se aplicó entera.';
  end if;
  raise notice 'VUELTA HECHA: el cuadre vuelve a sumar el día entero.';
end
$comprobar$;
