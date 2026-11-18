-- ============================================================================
-- 20261118030000 — Nuevo descuento, cambiar su % y desactivarlo (ADR-0677, Felipe 2026-11-17)
--
-- EL PROBLEMA. La pantalla nueva de Campañas y ofertas trata cada cajón de «Poner un %» (ADR-0669) como un DESCUENTO con su menú: «Nuevo
--   descuento», «Cambiar el %» y «Desactivar −X %» (maqueta `docs/maquetas/campanas-simple-2026-11/`). Hoy un cajón solo nace con su primera
--   prenda, su % no se cambia, y desactivarlo falla mientras tenga prendas marcadas (el candado «en uso» de las campañas).
--
-- LO QUE DECIDIÓ FELIPE (2026-11-17).
--   · Cambiar el % a uno que ya existe en esa tienda JUNTA las prendas en ese descuento (el otro se apaga vacío). Si no existe, el mismo
--     descuento cambia su % y su nombre.
--   · Desactivar un descuento con prendas: sus prendas vuelven a su precio desde ese momento y el descuento se apaga.
--   · Todo con «Deshacer» en la pantalla.
--
-- LO QUE HACE (todas con la puerta de `fn_exigir_rebaja_rapida`, firman con el responsable y van de a una con el candado de «Poner un %»).
--   · `crear_descuento(pct, tienda, todas)`: el cajón de ese % en la tienda (o en todas), vacío. Si ya existe lo devuelve, y si estaba apagado
--     lo enciende (igual que `poner_rebaja` con un % nuevo).
--   · `cambiar_pct_de_descuento(descuento, pct, tienda, todas)`: cambia el % (y el nombre) o lo junta con el que ya tiene ese %. Devuelve a
--     cuál quedaron y qué tallas se movieron, para deshacer.
--   · `desactivar_descuento(descuento, tienda, todas)`: saca sus prendas (vuelven a su precio) y lo apaga. Devuelve las tallas, para deshacer.
--   · `poner_rebaja_varias(tallas, pct, descuento, tienda, todas)`: `poner_rebaja` de cada talla en una sola transacción. Lo usa «Deshacer»:
--     o vuelven todas o ninguna, y de una sola llamada.
--   DECIDÍ que el descuento juntado se apague en vez de borrarse (nunca se borra un catálogo con historia: las ventas que lo cobraron lo
--     nombran). DECIDÍ sacar las prendas al desactivar: un descuento apagado que conservara sus prendas las volvería a rebajar todas si
--     alguien crea otra vez ese % (`poner_rebaja` enciende el cajón apagado).
--   SE ROMPE SI una prenda le llega a un descuento también por categoría: un cajón no tiene categorías (solo prendas marcadas), así que no pasa.
--
-- CÓMO SE PEGA. Una sola parte, idempotente, `lock_timeout` 3 s: funciones nuevas, que escriben en `etiquetas`, `rebaja_cajones` y
--   `variante_etiquetas` como ya lo hace `poner_rebaja`. No toca tablas ni políticas.
-- CAÍDA EXTERNA. Nada llama a la red.
-- PRUEBA. `pnpm pruebas:rebaja-rapida` (scripts/pruebas/rebaja_rapida.mjs, «Nuevo, cambiar el % y desactivar»).
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- El % de un descuento, como lo valida `poner_rebaja`: de 1 a 70, a dos decimales.
create or replace function retail.fn_pct_de_descuento(p_pct numeric)
returns numeric
language plpgsql
immutable
as $function$
declare
  v_pct numeric := round(p_pct, 2);
begin
  if v_pct is null or v_pct <= 0 or v_pct > 70 then
    raise exception 'El %% va de 1 a 70.' using hint = 'rebaja_pct';
  end if;
  return v_pct;
end;
$function$;

revoke all on function retail.fn_pct_de_descuento(numeric) from public, anon, authenticated;

-- El nombre de un descuento: el mismo que le pone `poner_rebaja` al crear su cajón.
create or replace function retail.fn_nombre_de_descuento(p_pct numeric, p_sede uuid)
returns text
language sql
stable
set search_path to 'retail', 'public'
as $function$
  select format('Rebaja −%s %% · %s', retail.fn_pct_corto(p_pct), coalesce((select u.nombre from retail.ubicaciones u where u.id = p_sede), 'Todas las tiendas'))
$function$;

revoke all on function retail.fn_nombre_de_descuento(numeric, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- Nuevo descuento
-- ---------------------------------------------------------------------------------------------------------------------------------------

create or replace function retail.crear_descuento(p_pct numeric, p_ubicacion_id uuid, p_todas boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'retail', 'public'
as $function$
declare
  v_todas boolean := coalesce(p_todas, false);
  v_sede uuid;
  v_actor uuid;
  v_pct numeric;
  v_id uuid;
  v_activo boolean;
begin
  v_sede := retail.fn_exigir_rebaja_rapida(p_ubicacion_id, v_todas);
  v_actor := retail.fn_actor_persona_id(true);
  perform pg_advisory_xact_lock(hashtext('retail.rebaja_rapida'));
  v_pct := retail.fn_pct_de_descuento(p_pct);

  v_id := (select c.etiqueta_id from retail.rebaja_cajones c where c.pct = v_pct and c.ubicacion_id is not distinct from v_sede);
  if v_id is null then
    insert into retail.etiquetas (nombre, estilo, estado, descuento_pct, anunciar_en_portada, aprobado_por, aprobado_en)
      values (retail.fn_nombre_de_descuento(v_pct, v_sede), 'campana', 'aprobado', v_pct, false, v_actor, now())
      returning id into v_id;
    if v_sede is not null then
      insert into retail.campana_sedes (etiqueta_id, ubicacion_id) values (v_id, v_sede);
    end if;
    insert into retail.rebaja_cajones (etiqueta_id, pct, ubicacion_id, creado_por) values (v_id, v_pct, v_sede, v_actor);
    return jsonb_build_object('etiqueta_id', v_id, 'pct', v_pct, 'ya_existia', false);
  end if;

  v_activo := (select e.activo from retail.etiquetas e where e.id = v_id);
  -- Un cajón apagado vuelve a encenderse, como en `poner_rebaja` (sin fechas: rige desde hoy).
  update retail.etiquetas e set activo = true, vigente_desde = null, vigente_hasta = null, descuento_pct = v_pct
    where e.id = v_id and (not e.activo or e.vigente_desde is not null or e.vigente_hasta is not null);
  return jsonb_build_object('etiqueta_id', v_id, 'pct', v_pct, 'ya_existia', coalesce(v_activo, false));
end;
$function$;

comment on function retail.crear_descuento(numeric, uuid, boolean) is
  'ADR-0677. «Nuevo descuento»: el cajón de ese % en la tienda (o en todas), vacío; si ya existe lo devuelve (y si estaba apagado lo enciende). Hasta 70 %; «todas las tiendas» solo un líder. Firma con el responsable.';

revoke all on function retail.crear_descuento(numeric, uuid, boolean) from public, anon;
grant execute on function retail.crear_descuento(numeric, uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- El descuento que se cambia o se apaga: un cajón ENCENDIDO de esta tienda (o de todas)
-- ---------------------------------------------------------------------------------------------------------------------------------------

create or replace function retail.fn_descuento_de_la_tienda(p_etiqueta_id uuid, p_sede uuid)
returns numeric
language plpgsql
stable
set search_path to 'retail', 'public'
as $function$
declare
  v_pct numeric;
begin
  v_pct := (select c.pct from retail.rebaja_cajones c join retail.etiquetas e on e.id = c.etiqueta_id
            where c.etiqueta_id = p_etiqueta_id and c.ubicacion_id is not distinct from p_sede and e.activo);
  if v_pct is null then
    raise exception 'Ese descuento ya no está en esta tienda. Vuelve a abrir la lista.' using hint = 'rebaja_descuento_no_esta';
  end if;
  return v_pct;
end;
$function$;

revoke all on function retail.fn_descuento_de_la_tienda(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- Cambiar el %
-- ---------------------------------------------------------------------------------------------------------------------------------------

create or replace function retail.cambiar_pct_de_descuento(p_etiqueta_id uuid, p_pct numeric, p_ubicacion_id uuid, p_todas boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'retail', 'public'
as $function$
declare
  v_todas boolean := coalesce(p_todas, false);
  v_sede uuid;
  v_pct numeric;
  v_antes numeric;
  v_destino uuid;
  v_movidas uuid[];
begin
  v_sede := retail.fn_exigir_rebaja_rapida(p_ubicacion_id, v_todas);
  perform retail.fn_actor_persona_id(true);
  perform pg_advisory_xact_lock(hashtext('retail.rebaja_rapida'));
  v_pct := retail.fn_pct_de_descuento(p_pct);
  v_antes := retail.fn_descuento_de_la_tienda(p_etiqueta_id, v_sede);

  if v_antes = v_pct then
    return jsonb_build_object('etiqueta_id', p_etiqueta_id, 'pct', v_pct, 'antes', v_antes, 'juntado', false, 'movidas', '[]'::jsonb);
  end if;

  v_destino := (select c.etiqueta_id from retail.rebaja_cajones c where c.pct = v_pct and c.ubicacion_id is not distinct from v_sede);

  if v_destino is null then
    -- No hay otro con ese %: el mismo descuento cambia su % y su nombre.
    update retail.rebaja_cajones c set pct = v_pct where c.etiqueta_id = p_etiqueta_id;
    update retail.etiquetas e set descuento_pct = v_pct, nombre = retail.fn_nombre_de_descuento(v_pct, v_sede) where e.id = p_etiqueta_id;
    return jsonb_build_object('etiqueta_id', p_etiqueta_id, 'pct', v_pct, 'antes', v_antes, 'juntado', false, 'movidas', '[]'::jsonb);
  end if;

  -- Ya hay uno con ese %: las prendas se juntan ahí (Felipe 2026-11-17) y este se apaga vacío.
  update retail.etiquetas e set activo = true, vigente_desde = null, vigente_hasta = null, descuento_pct = v_pct
    where e.id = v_destino and (not e.activo or e.vigente_desde is not null or e.vigente_hasta is not null);
  with movidas as (
    delete from retail.variante_etiquetas ve where ve.etiqueta_id = p_etiqueta_id returning ve.variante_id
  ), puestas as (
    insert into retail.variante_etiquetas (variante_id, etiqueta_id)
      select m.variante_id, v_destino from movidas m
      on conflict (variante_id, etiqueta_id) do nothing
  )
  select coalesce(array_agg(m.variante_id order by m.variante_id), '{}'::uuid[]) into v_movidas from movidas m;
  update retail.etiquetas e set activo = false where e.id = p_etiqueta_id;
  return jsonb_build_object('etiqueta_id', v_destino, 'pct', v_pct, 'antes', v_antes, 'juntado', true, 'movidas', to_jsonb(v_movidas));
end;
$function$;

comment on function retail.cambiar_pct_de_descuento(uuid, numeric, uuid, boolean) is
  'ADR-0677. «Cambiar el %» de un descuento: cambia su % y su nombre o, si en esa tienda ya hay uno con ese %, junta sus prendas ahí y apaga el de antes (Felipe 2026-11-17). Devuelve a cuál quedaron y qué tallas se movieron. Firma con el responsable.';

revoke all on function retail.cambiar_pct_de_descuento(uuid, numeric, uuid, boolean) from public, anon;
grant execute on function retail.cambiar_pct_de_descuento(uuid, numeric, uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- Desactivar
-- ---------------------------------------------------------------------------------------------------------------------------------------

create or replace function retail.desactivar_descuento(p_etiqueta_id uuid, p_ubicacion_id uuid, p_todas boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'retail', 'public'
as $function$
declare
  v_todas boolean := coalesce(p_todas, false);
  v_sede uuid;
  v_pct numeric;
  v_quitadas uuid[];
begin
  v_sede := retail.fn_exigir_rebaja_rapida(p_ubicacion_id, v_todas);
  perform retail.fn_actor_persona_id(true);
  perform pg_advisory_xact_lock(hashtext('retail.rebaja_rapida'));
  v_pct := retail.fn_descuento_de_la_tienda(p_etiqueta_id, v_sede);
  -- Sus prendas vuelven a su precio (Felipe 2026-11-17): si conservara sus prendas, encender otra vez ese % las rebajaría a todas.
  with quitadas as (
    delete from retail.variante_etiquetas ve where ve.etiqueta_id = p_etiqueta_id returning ve.variante_id
  )
  select coalesce(array_agg(q.variante_id order by q.variante_id), '{}'::uuid[]) into v_quitadas from quitadas q;
  update retail.etiquetas e set activo = false where e.id = p_etiqueta_id;
  return jsonb_build_object('etiqueta_id', p_etiqueta_id, 'pct', v_pct, 'quitadas', to_jsonb(v_quitadas));
end;
$function$;

comment on function retail.desactivar_descuento(uuid, uuid, boolean) is
  'ADR-0677. «Desactivar −X %»: sus prendas vuelven a su precio y el descuento se apaga (Felipe 2026-11-17). Devuelve las tallas que tenía, para deshacer. Firma con el responsable.';

revoke all on function retail.desactivar_descuento(uuid, uuid, boolean) from public, anon;
grant execute on function retail.desactivar_descuento(uuid, uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- Poner varias tallas de una vez (lo que usa «Deshacer»)
-- ---------------------------------------------------------------------------------------------------------------------------------------

create or replace function retail.poner_rebaja_varias(p_variantes uuid[], p_pct numeric, p_etiqueta_id uuid, p_ubicacion_id uuid, p_todas boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'retail', 'public'
as $function$
declare
  v_variante uuid;
  v_r jsonb;
  v_sacadas text[] := '{}';
  v_destino uuid;
  v_n integer := 0;
begin
  if p_variantes is null or cardinality(p_variantes) = 0 then
    raise exception 'No hay prendas que poner.' using hint = 'rebaja_sin_prenda';
  end if;
  -- Cada talla por la misma puerta que una sola: la validación, la firma, el candado y «una prenda, un lugar» son los de `poner_rebaja`.
  -- Si una falla, falla toda la llamada: o vuelven todas o ninguna.
  for v_variante in select distinct x from unnest(p_variantes) x loop
    v_r := retail.poner_rebaja(v_variante, 'prenda', p_pct, p_etiqueta_id, p_ubicacion_id, p_todas);
    v_destino := (v_r ->> 'etiqueta_id')::uuid;
    v_sacadas := v_sacadas || array(select jsonb_array_elements_text(v_r -> 'sacadas_de'));
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('etiqueta_id', v_destino, 'prendas', v_n,
                            'sacadas_de', to_jsonb(array(select distinct s from unnest(v_sacadas) s order by s)));
end;
$function$;

comment on function retail.poner_rebaja_varias(uuid[], numeric, uuid, uuid, boolean) is
  'ADR-0677. `poner_rebaja` de cada talla en una sola transacción (o todas o ninguna): lo usa «Deshacer» al devolver las prendas de un descuento cambiado o desactivado.';

revoke all on function retail.poner_rebaja_varias(uuid[], numeric, uuid, uuid, boolean) from public, anon;
grant execute on function retail.poner_rebaja_varias(uuid[], numeric, uuid, uuid, boolean) to authenticated;
