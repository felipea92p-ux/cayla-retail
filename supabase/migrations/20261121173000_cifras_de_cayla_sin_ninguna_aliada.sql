-- ============================================================================
-- 20261121173000 — Las cifras de CAYLA dejan fuera lo de CUALQUIER empresa aliada, no solo lo de CLAURE (ADR-0683, actividad 6)
--
-- EL PROBLEMA PRIMERO. La regla «¿esta línea vendida es de una aliada?» (`fn_item_es_de_claure`, y su versión en lote `fn_lineas_de_claure`) y las
-- cifras que la usan para sacar lo ajeno de lo de CAYLA (la calidad de lo vendido, las compras del Club, el Observatorio, «lo que falta del mes»)
-- preguntaban por la empresa de clave 'claure' y ACTIVA. Con dos problemas:
--   · Una aliada nueva vendería en sus tiendas y todo eso se contaría como venta de CAYLA: el Inicio, el Club y el Observatorio inflados.
--   · Al dar de baja a una aliada (`activo = false`), TODO su pasado volvería a ser de CAYLA: las cifras de meses cerrados cambiarían solas.
-- Igual «lo vendido de CLAURE en un período» (`fn_claure_ventas_en`: «de eso, CLAURE» en Impuestos y el Estado de resultados) y «lo de CLAURE
-- de hoy» (`fn_claure_de_hoy`: lo que el Inicio deja fuera de «Hoy»).
--
-- QUÉ PROMETE. Una línea es «de una aliada» si su venta es de una tienda donde opera una empresa que no es CAYLA, con cuenta desde una fecha, desde
-- ese día, y su dueña es esa empresa: cualquier aliada, activa o dada de baja (su pasado sigue siendo suyo). Las cinco cifras, «lo vendido en un
-- período» y «lo de hoy» suman lo de todas. Con CLAURE sola, cada número sale igual que antes. Los nombres de las funciones no cambian (las llaman
-- muchas pantallas y pruebas): su comentario lo dice.
--
-- DECIDÍ reemplazar el mismo trozo (`e.clave = 'claure' and e.activo and e.cuenta_corriente_desde is not null`) en las seis funciones, con la cuenta
-- de apariciones comprobada, y rehacer `fn_claure_de_hoy` sobre la regla de línea. DESCARTÉ renombrar las funciones a `*_de_aliada`: cambia veinte
-- llamadas y sus pruebas sin cambiar ningún número; se puede hacer al borrar las `fn_claure_*` (backlog).
-- SE ROMPE SI se crea una «aliada» que en realidad es otra sede de CAYLA (otra empresa en `empresas` con cuenta): sus ventas saldrían de las cifras
-- de CAYLA. Hoy toda empresa distinta de la casa es una aliada (ADR-0683).
--
-- CÓMO VERIFICAR. pnpm pruebas:aliadas-cifras
-- CÓMO SE PEGA. Después de 20261121171000. Una sola parte, sin políticas. Se puede pegar dos veces.
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
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición real. No se aplicó nada.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- ---------- 1. «De una aliada» = de cualquier empresa que no es CAYLA, con cuenta, activa o no ----------
do $cifras$
declare
  v_viejo constant text := 'e.clave = ''claure'' and e.activo and e.cuenta_corriente_desde is not null';
  v_nuevo constant text := 'e.id <> retail.fn_empresa_casa_id() and e.cuenta_corriente_desde is not null';
begin
  perform pg_temp.reemplazar('retail.fn_item_es_de_claure(uuid, uuid, timestamptz)', v_viejo, v_nuevo, 2);
  perform pg_temp.reemplazar('retail.fn_lineas_de_claure(timestamptz, timestamptz, uuid)', v_viejo, v_nuevo, 1);
  perform pg_temp.reemplazar('retail.fn_calidad(date, integer, integer)', v_viejo, v_nuevo, 1);
  perform pg_temp.reemplazar('retail.fn_club_compras_netas(uuid)', v_viejo, v_nuevo, 1);
  perform pg_temp.reemplazar('retail.fn_observatorio(integer)', v_viejo, v_nuevo, 1);
  perform pg_temp.reemplazar('retail.fn_lo_que_falta_del_mes(date)', v_viejo, v_nuevo, 1);
end
$cifras$;
comment on function retail.fn_item_es_de_claure(uuid, uuid, timestamptz) is
  'ADR-0560/0583, y ADR-0683: ¿esta línea vendida es de una empresa aliada (cualquiera, no solo CLAURE; activa o dada de baja)? Su nombre quedó del tiempo de CLAURE.';

-- ---------- 2. Lo vendido de las aliadas en un período (Impuestos, Estado de resultados) ----------
select pg_temp.reemplazar('retail.fn_claure_ventas_en(date, date, uuid)',
  'retail.fn_claure_ventas(p_desde, p_hasta, v_todo, v_ubics) f;',
  'retail.fn_aliadas_ventas(p_desde, p_hasta, v_todo, v_ubics) f;', 1);

-- ---------- 3. Lo de las aliadas en las ventas de hoy (lo que el Inicio deja fuera de «Hoy») ----------
-- Mismas llaves que antes (`hay_claure`, `hoy[].de_claure`, `semana_pasada`): la pantalla no cambia. La regla de cada línea es la de arriba.
create or replace function retail.fn_claure_de_hoy(p_ubicacion_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $function$
#variable_conflict use_column
declare
  v_ini timestamptz := ((now() at time zone 'America/Lima')::date::timestamp at time zone 'America/Lima');
  v_hoy jsonb;
  v_semana numeric;
begin
  -- El mismo candado de `fn_ventas_del_dia`: la líder ve cualquier sede; las demás, la suya.
  if not coalesce(retail.fn_es_lider() or p_ubicacion_id = retail.fn_ubicacion_actual_persona(), false) then
    raise exception 'No puedes ver las ventas de esa sede.' using errcode = '42501';
  end if;
  if not exists (select 1 from retail.empresas e join retail.empresa_sedes es on es.empresa_id = e.id and es.ubicacion_id = p_ubicacion_id
                  where e.id <> retail.fn_empresa_casa_id() and e.cuenta_corriente_desde is not null) then
    return jsonb_build_object('hay_claure', false, 'hoy', '[]'::jsonb, 'semana_pasada', 0);
  end if;

  -- Las ventas de hoy (el mismo rango y estado de `fn_ventas_del_dia`) que tienen alguna línea de una aliada.
  select coalesce(jsonb_agg(jsonb_build_object('venta_id', x.id, 'de_claure', x.de_claure, 'lineas_de_casa', x.de_casa) order by x.id), '[]'::jsonb)
    into v_hoy
    from (select v.id,
                 round(sum(vi.subtotal) filter (where o.es), 2) as de_claure,
                 count(*) filter (where not o.es) as de_casa
            from retail.ventas v
            join retail.venta_items vi on vi.venta_id = v.id
            cross join lateral (select retail.fn_item_es_de_claure(vi.id, v.ubicacion_id, v.created_at) as es) o
           where v.ubicacion_id = p_ubicacion_id
             and v.created_at >= v_ini and v.created_at < v_ini + interval '1 day'
             and v.estado = 'completada'
           group by v.id
          having bool_or(o.es)) x;

  -- Lo que vendieron las aliadas el mismo día de la semana pasada hasta esta misma hora (la ventana que el Inicio compara).
  select coalesce(round(sum(vi.subtotal), 2), 0)
    into v_semana
    from retail.ventas v
    join retail.venta_items vi on vi.venta_id = v.id
   where v.ubicacion_id = p_ubicacion_id
     and v.created_at >= v_ini - interval '7 days' and v.created_at < now() - interval '7 days'
     and v.estado = 'completada'
     and retail.fn_item_es_de_claure(vi.id, v.ubicacion_id, v.created_at);

  return jsonb_build_object('hay_claure', true, 'hoy', v_hoy, 'semana_pasada', v_semana);
end $function$;

do $comprueba$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'retail' and p.proname not like 'fn\_claure\_%' escape '\'
                and p.prosrc like '%e.clave = ''claure'' and e.activo and e.cuenta_corriente_desde is not null%') then
    raise exception 'Quedó una cifra de CAYLA que solo conoce a CLAURE.';
  end if;
end
$comprueba$;

select 'QUEDÓ BIEN' as resultado;
