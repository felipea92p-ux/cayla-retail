-- ============================================================================
-- 20261109182000 — La foto del diario, parte 2: fn_diario la lee, con un interruptor apagado de fábrica (ADR-0633)
--
-- EL PROBLEMA PRIMERO. Con la parte 1 ya se puede tomar la foto de cada mes que terminó, pero nadie la lee: el diario se sigue armando de
-- cero en cada pantalla. Esta parte hace que `fn_diario` (lo que leen el Estado de resultados, el Balance y el Resumen) use la foto.
--
-- LO QUE HACE.
--   1. `parametros_finanzas.usar_foto_diario` (false): el interruptor. Apagado, `fn_diario` hace exactamente lo de antes. Se enciende recién
--      cuando las fotos estén tomadas y el vigía las vea limpias (ADR-0633, actividad 6). Apagarlo es la vuelta atrás, sin migración.
--   2. `fn_foto_diario_vale(mes)`: la foto existe y lo que Dynamic dice de la planilla de ese mes no cambió. (La parte 3 le suma «nada con
--      fecha de ese mes cambió desde que se tomó».)
--   3. `fn_diario`: después de lo cerrado (`v_vivo`, ADR-0583), avanza mes por mes mientras haya foto al día (`v_foto`) y lee esos meses de
--      la foto; desde `v_foto`, en vivo como siempre. SOLO para quien ve todo (el líder o «todas las sedes», que es lo que pesa): la foto es
--      de la empresa entera, y recortarla por sede no siempre daría lo mismo que `fn_asientos` (algunas reglas filtran por otra columna que
--      la sede que devuelven). Para una sede, nada cambia. Sin la planilla para quien no la ve, como lo congelado. Lo cerrado sigue ganando.
--
-- ANTES DE PEGAR. Una parte: un `alter table` que agrega una columna con valor fijo (instantáneo; `lock_timeout` de 3 s: si dice «lock
-- timeout», se repite), una función nueva y tres reemplazos anclados en `fn_diario`. Sin políticas. Idempotente. Termina con «QUEDÓ BIEN».
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

alter table retail.parametros_finanzas add column if not exists usar_foto_diario boolean not null default false;
comment on column retail.parametros_finanzas.usar_foto_diario is
  'ADR-0633: el interruptor de la foto del diario. Apagado (de fábrica), fn_diario arma todo en vivo como antes.';

create or replace function retail.fn_foto_diario_vale(p_mes date)
returns boolean
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select exists (select 1 from retail.diario_fotos d
                  where d.mes = date_trunc('month', p_mes)::date
                    and d.huella_planilla = retail.fn_huella_planilla_mes(p_mes));
$$;
comment on function retail.fn_foto_diario_vale(date) is 'ADR-0633: si la foto del diario de ese mes existe y sigue al día.';
revoke all on function retail.fn_foto_diario_vale(date) from public, anon, authenticated;

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

select pg_temp.reemplazar('retail.fn_diario(date,date,uuid)',
$a$  v_vivo date;$a$,
$n$  v_vivo date;
  v_foto date; -- ADR-0633: el primer mes desde v_vivo que no tiene una foto al día (o el mes en curso)$n$, 1);

select pg_temp.reemplazar('retail.fn_diario(date,date,uuid)',
$a$                                     where p.mes = m.mes and p.alcance = 'ubicacion' and p.ubicacion_id = u.id and p.estado = 'cerrado'));$a$,
$n$                                     where p.mes = m.mes and p.alcance = 'ubicacion' and p.ubicacion_id = u.id and p.estado = 'cerrado'));

  -- ADR-0633: desde v_vivo, los meses que ya terminaron se leen de su foto mientras esté al día. Solo para quien ve TODO (la foto es de la
  -- empresa entera: recortarla por sede no siempre daría lo mismo que fn_asientos) y con el interruptor de parametros_finanzas encendido.
  v_foto := v_vivo;
  if v_todo and coalesce((select pf.usar_foto_diario from retail.parametros_finanzas pf limit 1), false) then
    while v_foto <= p_hasta and v_foto < date_trunc('month', retail.fn_hoy_lima())::date and retail.fn_foto_diario_vale(v_foto) loop
      v_foto := (v_foto + interval '1 month')::date;
    end loop;
  end if;$n$, 1);

select pg_temp.reemplazar('retail.fn_diario(date,date,uuid)',
$a$  select a.fecha, a.ubicacion_id, a.asiento, a.regla, a.cuenta, a.debe, a.haber, a.origen_tabla, a.origen_id, a.glosa, false
    from retail.fn_asientos(greatest(p_desde, v_vivo), p_hasta, p_ubicacion_id) a
   where v_vivo <= p_hasta$a$,
$n$  -- ADR-0633: los meses [v_vivo, v_foto), de su foto (sin la planilla si quien mira no la ve; lo cerrado de una unidad sigue ganando).
  select f.fecha, f.ubicacion_id, f.asiento, f.regla, f.cuenta, f.debe, f.haber, f.origen_tabla, f.origen_id, f.glosa, false
    from retail.diario_foto_lineas f
   where f.mes >= v_vivo and f.mes < v_foto
     and f.fecha between p_desde and p_hasta
     and (v_planilla or f.regla <> 'planilla')
     and not exists (
     select 1 from cerr c
      where c.mes = f.mes
        and ((f.ubicacion_id is null and c.alcance = 'empresa') or (c.alcance = 'ubicacion' and c.ubicacion_id = f.ubicacion_id)))
  union all
  select a.fecha, a.ubicacion_id, a.asiento, a.regla, a.cuenta, a.debe, a.haber, a.origen_tabla, a.origen_id, a.glosa, false
    from retail.fn_asientos(greatest(p_desde, v_foto), p_hasta, p_ubicacion_id) a
   where v_foto <= p_hasta$n$, 1);

do $comprobar$
declare v_def text := pg_get_functiondef('retail.fn_diario(date,date,uuid)'::regprocedure);
begin
  if position('from retail.diario_foto_lineas f' in v_def) = 0 or position('fn_asientos(greatest(p_desde, v_foto)' in v_def) = 0
     or position('v_foto date;' in v_def) = 0 or position('retail.fn_foto_diario_vale(v_foto)' in v_def) = 0 then
    raise exception '20261109182000: fn_diario no quedó leyendo la foto.';
  end if;
end
$comprobar$;

select '20261109182000 · QUEDÓ BIEN: fn_diario lee la foto del diario (interruptor apagado)' as resultado;
