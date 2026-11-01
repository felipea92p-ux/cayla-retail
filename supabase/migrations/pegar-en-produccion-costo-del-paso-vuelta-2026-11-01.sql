-- ============================================================================
-- VUELTA de 20261101033000_produccion_costo_de_un_paso_del_taller.sql (ADR-0597) — SOLO si hay que deshacerla.
-- Deja las funciones y el CHECK como estaban antes. Probada en una base local: tras la vuelta, volver a pegar la migración las deja idénticas (misma huella).
--
-- QUÉ PIERDE: el costo que algún paso del Taller ya tenga escrito (tarifa y fijo de un paso con `quien = 'taller'`) se borra, porque el CHECK anterior no lo admite. Antes de pegarla,
-- mira cuáles son:  select produccion_id, clave, tarifa_prenda, fijo_orden from retail.produccion_fases where quien = 'taller' and (tarifa_prenda is not null or fijo_orden > 0);
-- Una orden que ya pasó al stock con ese costo conserva su `costo_maquila` (es una columna de la orden, no se recalcula).
-- Una sola parte, lock_timeout = 3s, sin políticas ni drop trigger.
-- ============================================================================
set lock_timeout = '3s';

-- Cambia `p_nuevo` por `p_viejo` en la función viva; `p_nuevo` tiene que aparecer exactamente una vez. Si ya no está, no hace nada.
create or replace function pg_temp.deshacer_anclado(p_firma text, p_nuevo text, p_viejo text)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_nuevo in v_def) = 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_nuevo, ''))) / length(p_nuevo);
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta vuelta: el texto a deshacer aparece % veces (se esperaba 1).', p_firma, v_n;
  end if;
  execute replace(v_def, p_nuevo, p_viejo);
end;
$f$;

select pg_temp.deshacer_anclado(
  'retail.fn_fases_de_orden(uuid)',
  $v$when v_f.quien = 'servicio' then 0
                        when v_f.tarifa_prenda is not null or v_f.fijo_orden > 0
                          then (case when v_empezada then round(v_hechas * coalesce(v_f.tarifa_prenda, 0) + v_f.fijo_orden, 2) else 0 end)
                        else null end;$v$,
  $v$when v_f.quien = 'servicio' then 0 else null end;$v$
);

select pg_temp.deshacer_anclado(
  'retail.fn_orden_produccion(uuid)',
  $v$if v_f ->> 'quien' = 'servicio' or (v_f ->> 'tarifa_prenda') is not null or coalesce((v_f ->> 'fijo_orden')::numeric, 0) > 0 then$v$,
  $v$if v_f ->> 'quien' = 'servicio' then$v$
);

create or replace function retail.fn_costo_servicios_orden(p_produccion_id uuid) returns numeric
language sql stable
security definer
set search_path = retail, public, extensions
as $$
  select coalesce(sum((f ->> 'devengado')::numeric), 0)
    from jsonb_array_elements(coalesce(retail.fn_fases_de_orden(p_produccion_id), '[]'::jsonb)) f
   where f ->> 'quien' = 'servicio';
$$;

drop function if exists retail.poner_costo_a_fase(uuid, numeric, numeric);

update retail.produccion_fases set tarifa_prenda = null, fijo_orden = 0 where quien = 'taller' and (tarifa_prenda is not null or fijo_orden <> 0);

alter table retail.produccion_fases drop constraint if exists produccion_fases_quien;
alter table retail.produccion_fases add constraint produccion_fases_quien check (
  case when quien = 'servicio'
    then (proveedor_id is not null and (tarifa_prenda is not null or (clave = 'ploteo' and fijo_orden > 0)))
      or (proveedor_id is null and (clave <> 'ploteo' or tarifa_prenda is null))
    else proveedor_id is null and tarifa_prenda is null and fecha_prometida is null and cantidad_minima is null
  end
);

reset lock_timeout;
