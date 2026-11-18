-- 20261113170000 — Cuadrar con el banco: el día de hoy se corta en el momento de anotar el saldo (ADR-0652, Felipe 2026-11-13)
--
-- QUÉ PASABA. El saldo del banco se guarda por DÍA (`conciliaciones.fecha`) y el del sistema se sumaba al leer con TODO lo de ese
-- día. Felipe anotó al mediodía que BCP Empresa decía S/ 1,480.39 (cuadraba), después registró un retiro de S/ 280.39 con fecha de
-- ese mismo día, y el cuadre pasó a «No cuadra: hay S/ 280.39 de diferencia», sin ninguna línea por revisar que lo explicara. Lo
-- mismo pasaría con cada Yape que entra por la tarde después de anotar.
--
-- QUÉ CAMBIA. Al anotar el saldo de HOY (el día todavía corre), la base guarda cuánto se había movido esa cuenta ese día hasta ese
-- momento (`movido_del_dia`). El saldo del sistema de ese cuadre es entonces:
--      saldo inicial + todo lo de los días ANTERIORES (en vivo) + lo del día hasta que se anotó (guardado).
-- Lo de días anteriores sigue en vivo a propósito: registrar algo olvidado de ayer sigue arreglando la diferencia («busca lo que falta
-- registrar»). Un saldo anotado para un día que ya pasó (`movido_del_dia` nulo) se compara como siempre: con el día entero, porque el
-- banco ya cerró ese día. Las conciliaciones de antes de esto también quedan nulas: siguen como estaban.
-- `fn_conciliacion` agrega `despues` a la conciliación: lo que se registró con fecha de ese día DESPUÉS de anotar (el retiro), para
-- que la pantalla lo diga en vez de dejarlo como un misterio.
--
-- LO QUE NO ARREGLA (decidido): algo de la mañana registrado después de anotar tampoco entra a ese cuadre; la pantalla lo dice
-- («después de anotar se registró…») y se corrige anulando el saldo y anotándolo de nuevo.
--
-- CÓMO SE PEGA. Una sola parte. No toca políticas (ADR-0195): un `alter table` de una tabla que solo leen funciones
-- `security definer`, y reemplazos anclados de cuatro funciones. Cada reemplazo aborta si la función viva no tiene el texto esperado
-- (alguien la parchó): nada se aplica a medias. Se puede pegar dos veces.
-- VOLVER ATRÁS. Pegar `supabase/migrations/pegar-en-produccion-vuelta-cuadre-se-corta-al-anotar-2026-11-13.sql`: deja las cuatro
-- funciones como antes; la columna se queda (nula no cambia nada).

set lock_timeout = '3s';
set search_path = retail, public, extensions;

alter table retail.conciliaciones add column if not exists movido_del_dia numeric(12,2);
comment on column retail.conciliaciones.movido_del_dia is
  'ADR-0652. Si se anotó el saldo del día de HOY: cuánto se había movido esa cuenta ese día hasta el momento de anotarlo. Lo registrado '
  'después con fecha de ese día no entra a este cuadre. Nulo si se anotó un día que ya había pasado: se compara con el día entero.';

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

-- ---------- 1. Una conciliación no se edita: tampoco lo que se había movido al anotarla ----------
select pg_temp.reemplazar('retail.fn_conciliaciones_solo_anular()',
$v$     or (new.id, new.cuenta_id, new.fecha, new.saldo_banco, new.nota, new.registrado_por, new.created_at)
        is distinct from (old.id, old.cuenta_id, old.fecha, old.saldo_banco, old.nota, old.registrado_por, old.created_at) then$v$,
$n$     or (new.id, new.cuenta_id, new.fecha, new.saldo_banco, new.nota, new.registrado_por, new.created_at, new.movido_del_dia)
        is distinct from (old.id, old.cuenta_id, old.fecha, old.saldo_banco, old.nota, old.registrado_por, old.created_at, old.movido_del_dia) then$n$,
1);

-- ---------- 2. Anotar el saldo de hoy guarda cuánto se había movido hasta ese momento ----------
select pg_temp.reemplazar('retail.registrar_conciliacion(uuid, date, numeric, text)',
$v$    insert into retail.conciliaciones (cuenta_id, fecha, saldo_banco, nota, registrado_por)
    values (p_cuenta_id, p_fecha, round(p_saldo_banco, 2), nullif(trim(coalesce(p_nota, '')), ''), retail.fn_actor_persona_id(true))$v$,
$n$    -- ADR-0652: el día de hoy todavía corre. Lo que se había movido hasta ahora queda en la conciliación; lo de después, para el próximo cuadre.
    insert into retail.conciliaciones (cuenta_id, fecha, saldo_banco, nota, registrado_por, movido_del_dia)
    values (p_cuenta_id, p_fecha, round(p_saldo_banco, 2), nullif(trim(coalesce(p_nota, '')), ''), retail.fn_actor_persona_id(true),
            case when p_fecha = retail.fn_hoy_lima() then
              coalesce((select sum(l.monto) from retail.fn_dinero_libro(p_fecha) l where l.cuenta_id = p_cuenta_id and l.fecha = p_fecha), 0)
            end)$n$,
1);

-- ---------- 3. Una cuenta a una fecha: el saldo del sistema de cada cuadre, y lo registrado después de anotarlo ----------
select pg_temp.reemplazar('retail.fn_conciliacion(uuid, date)',
$v$           v_c.saldo_inicial + coalesce((select sum(l.monto) from libro l where l.fecha <= cc.fecha), 0) as saldo_sistema,$v$,
$n$           -- ADR-0652: los días anteriores en vivo; el día mismo, lo que se había movido al anotar (si se anotó ese mismo día).
           v_c.saldo_inicial + coalesce((select sum(l.monto) from libro l where l.fecha < cc.fecha), 0)
             + coalesce(cc.movido_del_dia, (select sum(l.monto) from libro l where l.fecha = cc.fecha), 0) as saldo_sistema,
           case when cc.movido_del_dia is not null then
             coalesce((select sum(l.monto) from libro l where l.fecha = cc.fecha), 0) - cc.movido_del_dia
           end as despues,$n$,
1);
select pg_temp.reemplazar('retail.fn_conciliacion(uuid, date)',
$v$                                               'diferencia', h.saldo_banco - h.saldo_sistema, 'nota', h.nota, 'registrado_por', h.registrado_por)$v$,
$n$                                               'diferencia', h.saldo_banco - h.saldo_sistema, 'nota', h.nota, 'registrado_por', h.registrado_por,
                                               'despues', h.despues)$n$,
1);

-- ---------- 4. La lista de bancos: la última diferencia, con el mismo corte ----------
select pg_temp.reemplazar('retail.fn_conciliacion_cuentas()',
$v$    select distinct on (cc.cuenta_id) cc.cuenta_id, cc.fecha, cc.saldo_banco
$v$,
$n$    select distinct on (cc.cuenta_id) cc.cuenta_id, cc.fecha, cc.saldo_banco, cc.movido_del_dia
$n$,
1);
select pg_temp.reemplazar('retail.fn_conciliacion_cuentas()',
$v$                              where l.cuenta_id = c.id and (c.saldo_desde is null or l.fecha >= c.saldo_desde) and l.fecha <= ul.fecha), 0))$v$,
$n$                              where l.cuenta_id = c.id and (c.saldo_desde is null or l.fecha >= c.saldo_desde) and l.fecha < ul.fecha), 0)
                           -- ADR-0652: el día mismo, lo que se había movido al anotar (si se anotó ese mismo día).
                           + coalesce(ul.movido_del_dia, (select sum(l.monto) from libro l where l.cuenta_id = c.id and l.fecha = ul.fecha), 0))$n$,
1);

-- ---------- Comprobación ----------
do $comprobar$
declare
  v_faltan text;
begin
  v_faltan := (select string_agg(x.f, ', ')
                 from unnest(array['fn_conciliaciones_solo_anular', 'registrar_conciliacion', 'fn_conciliacion', 'fn_conciliacion_cuentas']) as x (f)
                where not exists (select 1 from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = x.f and p.prosrc like '%movido_del_dia%'));
  if v_faltan is not null then
    raise exception 'No quedó el corte en: %', v_faltan;
  end if;
  raise notice 'QUEDÓ BIEN: el saldo de hoy se corta al anotarlo.';
end
$comprobar$;
