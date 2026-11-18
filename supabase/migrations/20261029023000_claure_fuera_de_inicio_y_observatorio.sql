-- ============================================================================
-- 20261029023000 — Lo vendido de CLAURE no suma en el Inicio ni en el Observatorio (ADR-0560; actividad 6a)
--
-- EL PROBLEMA PRIMERO. En Tienda LIM se vende lo de CAYLA y lo de CLAURE (de Claudia) en la misma caja. La actividad 5 ya sacó lo de CLAURE
-- de las cifras de Finanzas; pero el Inicio de la líder («Hoy»: ventas, valor medio, meta, comparación con la semana pasada) y el Observatorio
-- del Admin (ventas por día y por hora, ticket, equipo, categorías, prendas que no se mueven) siguen sumando TODO lo cobrado en la sede, y el
-- Admin cree que Lima vende más de lo que vende CAYLA. Felipe (2026-10-28): «CLAURE no suma en Análisis, Rendimiento, metas, Inicio, Observatorio…».
-- Caja, Historial, Movimientos e Impuestos SÍ lo muestran todo, y por eso `fn_ventas_del_dia` (que también lee Caja) NO se toca.
--
-- CONTRATO (Liskov)
--   PROMETE: (1) `fn_item_es_de_claure(línea, sede, fecha)` (interna) dice si una línea de venta es de CLAURE con LA MISMA regla de la actividad 5
--            (`fn_claure_ventas`): la sede es de las que CLAURE opera, la venta es del día en que arranca su cuenta (`empresas.cuenta_corriente_desde`)
--            o después, y el dueño real de la línea (`fn_dueno_de_la_linea`, ADR-0542) es CLAURE. Es la pieza que 6b, 6c y 6d vuelven a usar.
--            (2) `fn_claure_de_hoy(sede)` dice, de las ventas de HOY de esa sede, cuánto de cada una es de CLAURE y cuántas líneas de CAYLA le quedan
--            (solo las ventas que tienen algo de CLAURE), y cuánto de CLAURE vendió la sede hace una semana a esta misma hora: lo que el Inicio resta
--            de lo que ya lee de Caja. Sin CLAURE en esa sede, responde `hay_claure = false` y no recorre ninguna línea.
--            (3) `fn_observatorio` y `fn_observatorio_tienda` suman solo lo de CAYLA: una venta solo de CLAURE no cuenta como venta ni como ticket, una
--            mixta cuenta por sus líneas de CAYLA, y las prendas «quietas» miden solo las unidades de CAYLA (sin lo de CLAURE que se vendió ni lo que
--            sigue en el estante). Con una sede sin CLAURE, o antes del arranque, los resultados son EXACTAMENTE los de antes.
--   ASUME:   `fn_dueno_de_la_linea` sabe de quién es cada línea (movimiento de salida, o la ficha de la prenda); la fecha de arranque es la de Finanzas, para
--            que ninguna pantalla cuente distinto que otra. La primera semana, la comparación contra «el mismo día de la semana pasada» mezcla un hoy sin
--            CLAURE con un ayer que todavía no lo separaba: se corrige sola desde el 30-oct.
--   FALLA:   `42501` si quien pregunta no es líder y la sede no es la suya (como `fn_ventas_del_dia`).
--   NO HACE: no cambia `fn_ventas_del_dia`, `fn_mis_ventas_del_dia` (Rendimiento, 6b), Caja, Historial ni el cierre; no toca ninguna tabla.
--
-- CÓMO SE PEGA EN PRODUCCIÓN — UNA SOLA EJECUCIÓN, después de 20261029004000 (que crea `cuenta_corriente_desde`). Funciones nuevas y dos reemplazos
-- anclados sobre `fn_observatorio` y `fn_observatorio_tienda`; sin tablas, políticas ni `drop trigger`. Idempotente: si el reemplazo ya está, no hace nada. Si
-- una de las dos funciones de producción no tiene el texto esperado, ABORTA sin cambiar nada (la de la tienda se leyó el 2026-10-22: huella en
-- `pruebas:arreglos-en-vivo-roles-observatorio`, que esta migración actualiza). Con la web vieja no pasa nada.
-- SE ROMPE SI: alguien cambia esas dos funciones en producción sin dejar archivo (ya pasó el 2026-10-22).
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

-- ---------- 1. ¿Esta línea de venta es de CLAURE? (interna; la regla de la actividad 5) ----------
create or replace function retail.fn_item_es_de_claure(p_venta_item_id uuid, p_ubicacion_id uuid, p_creada timestamptz)
returns boolean
language sql stable security definer set search_path = retail, public, extensions as $$
  select exists (
    select 1
      from retail.empresas e
      join retail.empresa_sedes es on es.empresa_id = e.id and es.ubicacion_id = p_ubicacion_id
     where e.clave = 'claure' and e.activo and e.cuenta_corriente_desde is not null
       and (p_creada at time zone 'America/Lima')::date >= e.cuenta_corriente_desde
       and retail.fn_dueno_de_la_linea(p_venta_item_id) = e.id)
$$;

comment on function retail.fn_item_es_de_claure(uuid, uuid, timestamptz) is
  'ADR-0560 (interna): ¿esta línea de venta es de CLAURE? La sede es de las que CLAURE opera, la venta es de desde el arranque de su cuenta (empresas.cuenta_corriente_desde) y el dueño real de la línea (fn_dueno_de_la_linea) es CLAURE. La misma regla que fn_claure_ventas.';
revoke all on function retail.fn_item_es_de_claure(uuid, uuid, timestamptz) from public, anon, authenticated;

-- ---------- 2. Lo de CLAURE en las ventas de hoy de una sede, para el Inicio ----------
create or replace function retail.fn_claure_de_hoy(p_ubicacion_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = retail, public, extensions as $$
#variable_conflict use_column
declare
  v_claure uuid;
  v_desde date;
  v_ini timestamptz := ((now() at time zone 'America/Lima')::date::timestamp at time zone 'America/Lima');
  v_hoy jsonb;
  v_semana numeric;
begin
  -- El mismo candado de `fn_ventas_del_dia`: la líder ve cualquier sede; las demás, la suya.
  if not coalesce(retail.fn_es_lider() or p_ubicacion_id = retail.fn_ubicacion_actual_persona(), false) then
    raise exception 'No puedes ver las ventas de esa sede.' using errcode = '42501';
  end if;
  select e.id, e.cuenta_corriente_desde into v_claure, v_desde from retail.empresas e where e.clave = 'claure' and e.activo;
  if v_claure is null or v_desde is null
     or not exists (select 1 from retail.empresa_sedes es where es.empresa_id = v_claure and es.ubicacion_id = p_ubicacion_id) then
    return jsonb_build_object('hay_claure', false, 'hoy', '[]'::jsonb, 'semana_pasada', 0);
  end if;

  -- Las ventas de hoy (el mismo rango y estado de `fn_ventas_del_dia`) que tienen alguna línea de CLAURE.
  select coalesce(jsonb_agg(jsonb_build_object('venta_id', x.id, 'de_claure', x.de_claure, 'lineas_de_casa', x.de_casa) order by x.id), '[]'::jsonb)
    into v_hoy
    from (select v.id,
                 round(sum(vi.subtotal) filter (where o.es), 2) as de_claure,
                 count(*) filter (where not o.es) as de_casa
            from retail.ventas v
            join retail.venta_items vi on vi.venta_id = v.id
            cross join lateral (select retail.fn_dueno_de_la_linea(vi.id) = v_claure as es) o
           where v.ubicacion_id = p_ubicacion_id
             and v.created_at >= v_ini and v.created_at < v_ini + interval '1 day'
             and v.estado = 'completada'
             and (v.created_at at time zone 'America/Lima')::date >= v_desde
           group by v.id
          having bool_or(o.es)) x;

  -- Lo que CLAURE vendió el mismo día de la semana pasada hasta esta misma hora (la ventana que el Inicio compara).
  select coalesce(round(sum(vi.subtotal), 2), 0)
    into v_semana
    from retail.ventas v
    join retail.venta_items vi on vi.venta_id = v.id
   where v.ubicacion_id = p_ubicacion_id
     and v.created_at >= v_ini - interval '7 days' and v.created_at < now() - interval '7 days'
     and v.estado = 'completada'
     and (v.created_at at time zone 'America/Lima')::date >= v_desde
     and retail.fn_dueno_de_la_linea(vi.id) = v_claure;

  return jsonb_build_object('hay_claure', true, 'hoy', v_hoy, 'semana_pasada', v_semana);
end $$;

comment on function retail.fn_claure_de_hoy(uuid) is
  'ADR-0560 (6a): de las ventas de HOY de una sede, cuánto de cada una es de CLAURE (y cuántas líneas de CAYLA le quedan), y lo de CLAURE de hace una semana a esta hora. El Inicio lo resta de lo que lee de Caja. Candado de fn_ventas_del_dia. Solo lee.';
revoke all on function retail.fn_claure_de_hoy(uuid) from public, anon;
grant execute on function retail.fn_claure_de_hoy(uuid) to authenticated;

-- ---------- 3. El Observatorio de todas las tiendas: solo lo de CAYLA ----------
-- Una venta solo de CLAURE ni cuenta (ni como venta ni como ticket); una mixta suma sus líneas de CAYLA.
select pg_temp.reemplazar('retail.fn_observatorio(integer)',
$v$           coalesce(sum(vi.subtotal), 0) as s,
           coalesce(sum(vi.cantidad), 0) as p
    from retail.ventas ve
    join tiendas t on t.id = ve.ubicacion_id
    left join retail.venta_items vi on vi.venta_id = ve.id
    where ve.created_at >= v_ini
      and ve.estado = 'completada'
      and not coalesce(ve.es_prueba, false)
    group by ve.id
  ),
  dias as ($v$,
$n$           coalesce(sum(vi.subtotal) filter (where not o.es), 0) as s,
           coalesce(sum(vi.cantidad) filter (where not o.es), 0) as p
    from retail.ventas ve
    join tiendas t on t.id = ve.ubicacion_id
    left join retail.venta_items vi on vi.venta_id = ve.id
    -- ADR-0560 (6a): lo vendido de CLAURE no es de CAYLA.
    cross join lateral (select retail.fn_item_es_de_claure(vi.id, ve.ubicacion_id, ve.created_at) as es) o
    where ve.created_at >= v_ini
      and ve.estado = 'completada'
      and not coalesce(ve.es_prueba, false)
    group by ve.id
    having bool_or(not o.es)
  ),
  dias as ($n$,
1);

-- ---------- 4. El Observatorio de una tienda: ventas y prendas quietas solo de CAYLA ----------
select pg_temp.reemplazar('retail.fn_observatorio_tienda(uuid)',
$v$      and not coalesce(ve.es_prueba, false)
  ),
  ventanas (clave, desde) as ($v$,
$n$      and not coalesce(ve.es_prueba, false)
      and not retail.fn_item_es_de_claure(vi.id, ve.ubicacion_id, ve.created_at)
  ),
  ventanas (clave, desde) as ($n$,
1);

-- Las prendas quietas miden las unidades de CAYLA: lo de CLAURE que sigue en el estante no es suyo (`stock_dueno` guarda lo de los demás dueños).
select pg_temp.reemplazar('retail.fn_observatorio_tienda(uuid)',
$v$    select st.variante_id, sum(st.cantidad) as unidades
    from retail.stock st
    join retail.variantes va on va.id = st.variante_id
    where st.ubicacion_id = p_ubicacion_id
      and va.created_at < now() - interval '30 days'
    group by st.variante_id
    having sum(st.cantidad) > 0
  )$v$,
$n$    select x.variante_id, x.unidades
    from (select st.variante_id,
                 sum(st.cantidad) - coalesce((select sum(d.cantidad) from retail.stock_dueno d where d.variante_id = st.variante_id and d.ubicacion_id = p_ubicacion_id), 0) as unidades
            from retail.stock st
            join retail.variantes va on va.id = st.variante_id
           where st.ubicacion_id = p_ubicacion_id
             and va.created_at < now() - interval '30 days'
           group by st.variante_id) x
    where x.unidades > 0
  )$n$,
1);

-- ---------- 5. Que quedó como se prometió ----------
do $$
begin
  if position('fn_item_es_de_claure' in pg_get_functiondef('retail.fn_observatorio(integer)'::regprocedure)) = 0 then
    raise exception 'ADR-0560: fn_observatorio no quedó sumando solo lo de CAYLA';
  end if;
  if position('fn_item_es_de_claure' in pg_get_functiondef('retail.fn_observatorio_tienda(uuid)'::regprocedure)) = 0
     or position('stock_dueno' in pg_get_functiondef('retail.fn_observatorio_tienda(uuid)'::regprocedure)) = 0 then
    raise exception 'ADR-0560: fn_observatorio_tienda no quedó sumando solo lo de CAYLA';
  end if;
end $$;
