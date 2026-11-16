-- ============================================================================
-- 20261116182000 — «Poner un %»: la rebaja de una prenda en un toque, en cajones de % por tienda (ADR-0669, Felipe 2026-11-16)
--
-- EL PROBLEMA. Las colaboradoras quieren entrar a Campañas y ofertas, escanear una prenda y ponerle un % «para siempre o hasta que deje de
--   estar con esa oferta», viendo qué % ya existen. Hoy eso es: saber qué campaña tiene qué % (no se ve en ninguna parte), entrar a ella,
--   «Más ▸ Marcar prendas sueltas», buscar, marcar y guardar (unos 7 toques), y además hace falta el módulo Insignias. En producción ya
--   lo hacen a mano con campañas que son un % con prendas marcadas: «Prendas de 10%», «Para liquidar» (−15 %, 1.199 tallas), «Top ventas».
--
-- LO QUE DECIDIÓ FELIPE (2026-11-16).
--   · Quién: todo el que ve Campañas y ofertas, hasta 70 % (el tope de toda oferta).
--   · A qué: al escanear se elige «solo esta prenda» (esa talla de ese color) o «todo el modelo».
--   · Dónde: en su tienda; un líder puede elegir «todas las tiendas».
--   · Cómo: en CAJONES DE %: uno por % y tienda (o todas), sin fecha de fin, que se muestran junto a las campañas que ya tienen ese % en la
--     tienda. Una prenda está en un solo cajón: elegir otro la mueve.
--
-- LO QUE HACE.
--   · Un cajón ES una campaña con descuento de siempre (`etiquetas`, estilo «campana», sin fechas, `anunciar_en_portada` apagado) con sus
--     prendas marcadas a mano (`variante_etiquetas`): la caja, Apartar, la tienda web, SUNAT y Finanzas ya lo cobran y lo cuentan sin cambiar
--     nada. `rebaja_cajones` dice cuáles lo son, su % y su tienda (una sola fila por % y tienda; «todas» es la tienda nula).
--   · `fn_rebajas_de_sede(sede, todas)`: los «lugares de un %» de una tienda: los cajones y las campañas vigentes con descuento de siempre que
--     rigen ahí. «Movible» = rige exactamente en esas tiendas (la misma tienda, o todas): de ahí se saca una prenda al ponerla en otro.
--   · `campanas_rebaja_de_prenda(variante, sede)`: lo que la hoja muestra al escanear: la prenda, su precio en la tienda, qué % tiene hoy y de dónde
--     (marcada a mano, por su categoría, por una oferta), y los lugares de % de la tienda con cuántas prendas tienen.
--   · `poner_rebaja(variante, alcance, %, lugar, sede, todas)` y `quitar_rebaja(variante, alcance, sede, todas)`: marcan o desmarcan la
--     prenda (o todo su modelo) y la sacan de los otros lugares movibles. Firman con el responsable (`fn_actor_persona_id(true)`, ADR-0162).
--   · `campanas_rebaja_prendas(lugar)`: las prendas marcadas de un lugar, para verlas y quitarlas.
--   DECIDÍ reusar la campaña con descuento de siempre en vez de una tabla de precios por prenda: es lo que la caja ya cobra, y lo que las
--     colaboradoras ya hacían a mano. DESCARTÉ una oferta por prenda (`campana_reglas`): exige fecha de fin y se cruza con el candado de
--     choques. DESCARTÉ sacar la prenda de una campaña que rige en otras tiendas: Arequipa no pierde su −20 % porque Trujillo lo cambió.
--   SE ROMPE SI una campaña con prendas por CATEGORÍA le da a la prenda un % mayor: no se puede sacar por prenda; la hoja lo dice («la caja
--     cobra el mayor») y se cambia en la campaña.
--
-- CÓMO SE PEGA. Una sola parte, idempotente, `lock_timeout` 3 s: una tabla NUEVA con RLS encendido y sin políticas (solo la leen y escriben
--   estas funciones `security definer`, ADR-0195) y funciones nuevas. No toca ninguna tabla en uso.
-- CAÍDA EXTERNA. Nada llama a la red.
-- PRUEBA. `pnpm pruebas:rebaja-rapida` (scripts/pruebas/rebaja_rapida.mjs).
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

create table if not exists retail.rebaja_cajones (
  etiqueta_id uuid primary key references retail.etiquetas (id),
  pct numeric(5, 2) not null constraint rebaja_cajones_pct check (pct > 0 and pct <= 70),
  ubicacion_id uuid references retail.ubicaciones (id),
  creado_por uuid,
  creado_en timestamptz not null default now(),
  constraint rebaja_cajones_uno_por_pct_y_tienda unique nulls not distinct (pct, ubicacion_id)
);

comment on table retail.rebaja_cajones is
  'ADR-0669 (Felipe 2026-11-16). Los cajones de % de «Poner un %»: cada uno es una campaña con descuento de siempre y sin fechas (etiquetas) cuyas prendas se marcan a mano. Uno por % y tienda; la tienda nula es «todas». Solo lo leen y escriben sus funciones.';

alter table retail.rebaja_cajones enable row level security;

-- El % en palabras: 20.00 → «20», 12.50 → «12.5».
create or replace function retail.fn_pct_corto(p_pct numeric)
returns text
language sql
immutable
as $function$
  select case when p_pct = trunc(p_pct) then trunc(p_pct)::text else rtrim(rtrim(p_pct::text, '0'), '.') end
$function$;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- Los lugares de un % en una tienda
-- ---------------------------------------------------------------------------------------------------------------------------------------

create or replace function retail.fn_rebajas_de_sede(p_ubicacion_id uuid, p_todas boolean)
returns table (etiqueta_id uuid, nombre text, pct numeric, es_cajon boolean, movible boolean, hasta date, por_categoria boolean)
language sql
stable
security definer
set search_path to 'retail', 'public'
as $function$
  select e.id, e.nombre, e.descuento_pct, (c.etiqueta_id is not null),
         -- Rige exactamente en esas tiendas: la misma tienda, o todas.
         case when p_todas
              then not exists (select 1 from retail.campana_sedes cs where cs.etiqueta_id = e.id)
              else coalesce((select array_agg(cs.ubicacion_id) from retail.campana_sedes cs where cs.etiqueta_id = e.id) = array[p_ubicacion_id], false)
         end,
         e.vigente_hasta,
         exists (select 1 from retail.etiqueta_categorias ec where ec.etiqueta_id = e.id)
  from retail.etiquetas e
  left join retail.rebaja_cajones c on c.etiqueta_id = e.id
  where e.estilo = 'campana' and e.estado = 'aprobado' and e.activo and e.descuento_pct is not null
    and e.descuento_pct <= 70
    and (e.vigente_desde is null or e.vigente_desde <= retail.fn_hoy_lima())
    and (e.vigente_hasta is null or e.vigente_hasta >= retail.fn_hoy_lima())
    and (case when p_todas
              then not exists (select 1 from retail.campana_sedes cs where cs.etiqueta_id = e.id)
              else retail.fn_campana_rige_en_sede(e.id, p_ubicacion_id) end)
$function$;

comment on function retail.fn_rebajas_de_sede(uuid, boolean) is
  'ADR-0669. Los lugares de un % de una tienda (o de todas): los cajones y las campañas vigentes con descuento de siempre (hasta 70 %) que rigen ahí. «movible»: rige exactamente en esas tiendas, así que «Poner un %» puede sacar una prenda de ahí.';

revoke all on function retail.fn_rebajas_de_sede(uuid, boolean) from public, anon, authenticated;

-- Valida quién y dónde; devuelve la sede efectiva (nula = todas).
create or replace function retail.fn_exigir_rebaja_rapida(p_ubicacion_id uuid, p_todas boolean)
returns uuid
language plpgsql
stable
security definer
set search_path to 'retail', 'public'
as $function$
begin
  if not retail.fn_puede_campanas() then
    raise exception 'Poner un %% a una prenda necesita ver «Campañas y ofertas» en tu rol.' using errcode = '42501', hint = 'rebaja_sin_modulo';
  end if;
  if coalesce(p_todas, false) then
    if not retail.fn_es_lider() then
      raise exception 'Solo un líder pone un %% en todas las tiendas. Elige tu tienda.' using errcode = '42501', hint = 'rebaja_todas_solo_lider';
    end if;
    return null;
  end if;
  if p_ubicacion_id is null or not exists (select 1 from retail.ubicaciones u where u.id = p_ubicacion_id and u.tipo = 'tienda') then
    raise exception 'Elige la tienda donde rige el %%.' using hint = 'rebaja_sin_tienda';
  end if;
  if not retail.fn_es_lider() and not retail.fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'Solo pones un %% en la tienda donde trabajas.' using errcode = '42501', hint = 'rebaja_otra_tienda';
  end if;
  return p_ubicacion_id;
end;
$function$;

revoke all on function retail.fn_exigir_rebaja_rapida(uuid, boolean) from public, anon, authenticated;

-- Las prendas del alcance: esa talla de ese color, o todo el modelo (lo que está a la venta).
create or replace function retail.fn_variantes_del_alcance(p_variante_id uuid, p_alcance text)
returns uuid[]
language sql
stable
set search_path to 'retail', 'public'
as $function$
  select case
    when p_alcance = 'modelo' then (
      select array_agg(v2.id order by v2.id) from retail.variantes v
      join retail.variantes v2 on v2.producto_id = v.producto_id and (v2.activo or v2.id = v.id)
      where v.id = p_variante_id)
    else array[p_variante_id]
  end
$function$;

revoke all on function retail.fn_variantes_del_alcance(uuid, text) from public, anon, authenticated;

-- Cuántas prendas (el modelo en su color, como cuentan las tiendas) le llegan a un lugar: las marcadas a mano y las de sus categorías.
create or replace function retail.fn_prendas_de_lugar(p_etiqueta_id uuid)
returns integer
language sql
stable
set search_path to 'retail', 'public'
as $function$
  select count(distinct (v.producto_id, v.color_codigo))::integer
  from retail.variantes v
  join retail.productos p on p.id = v.producto_id
  where v.activo
    and (exists (select 1 from retail.variante_etiquetas ve where ve.variante_id = v.id and ve.etiqueta_id = p_etiqueta_id)
         or exists (select 1 from retail.etiqueta_categorias ec where ec.etiqueta_id = p_etiqueta_id and ec.categoria_id = p.categoria_id))
$function$;

revoke all on function retail.fn_prendas_de_lugar(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- Lo que la hoja muestra al escanear
-- ---------------------------------------------------------------------------------------------------------------------------------------

create or replace function retail.campanas_rebaja_de_prenda(p_variante_id uuid, p_ubicacion_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'retail', 'public'
as $function$
declare
  v_sede uuid;
  v_prenda jsonb;
  v_tiene jsonb;
  v_lugares jsonb;
  v_precio numeric;
  v_producto uuid;
  v_categoria uuid;
begin
  v_sede := retail.fn_exigir_rebaja_rapida(p_ubicacion_id, false);
  select v.producto_id, p.categoria_id, retail.fn_precio_en_sede(v.id, v_sede)
    into v_producto, v_categoria, v_precio
    from retail.variantes v join retail.productos p on p.id = v.producto_id where v.id = p_variante_id;
  if v_producto is null then
    raise exception 'Esa prenda no existe. Vuelve a escanearla.' using hint = 'rebaja_sin_prenda';
  end if;

  v_prenda := (
    select jsonb_build_object(
      'variante_id', v.id, 'producto_id', p.id, 'referencia', p.referencia, 'codigo', coalesce(v.codigo, v.sku),
      'color', co.nombre, 'color_hex', co.hex, 'talla', t.valor, 'precio', v_precio,
      'categoria', jsonb_build_object('nombre', ca.nombre, 'prefijo', ca.prefijo, 'familia', ca.familia),
      'foto', (select f.url from retail.producto_fotos f where f.producto_id = p.id and (f.color_codigo is null or f.color_codigo = v.color_codigo)
               order by (f.color_codigo = v.color_codigo) desc nulls last, f.es_principal desc, f.orden limit 1),
      'modelo_prendas', (select count(*) from retail.variantes x where x.producto_id = p.id and x.activo),
      'modelo_colores', (select count(distinct x.color_codigo) from retail.variantes x where x.producto_id = p.id and x.activo),
      -- Sin decir el costo: solo si con cada % quedaría por debajo (se calcula en la pantalla con este piso).
      'piso_sin_perder', case when coalesce(v.costo, 0) > 0 and v_precio > 0 then round(v.costo, 2) end)
    from retail.variantes v
    join retail.productos p on p.id = v.producto_id
    left join retail.colores co on co.codigo = v.color_codigo
    left join retail.tallas t on t.id = v.talla_id
    left join retail.categorias ca on ca.id = p.categoria_id
    where v.id = p_variante_id
  );

  -- Lo que tiene hoy en esta tienda (las campañas y rebajas de la caja) y de dónde le llega.
  v_tiene := coalesce((
    select jsonb_agg(jsonb_build_object(
             'etiqueta_id', c.etiqueta_id, 'nombre', c.etiqueta_nombre, 'pct', c.descuento_pct,
             'como', case
               when exists (select 1 from retail.variante_etiquetas ve where ve.variante_id = p_variante_id and ve.etiqueta_id = c.etiqueta_id) then 'a_mano'
               when exists (select 1 from retail.etiqueta_categorias ec where ec.etiqueta_id = c.etiqueta_id and ec.categoria_id = v_categoria) then 'categoria'
               else 'oferta' end,
             'es_cajon', exists (select 1 from retail.rebaja_cajones rc where rc.etiqueta_id = c.etiqueta_id),
             'movible', coalesce((select l.movible from retail.fn_rebajas_de_sede(v_sede, false) l where l.etiqueta_id = c.etiqueta_id), false))
           order by c.descuento_pct desc)
    from retail.fn_campanas_en_sede(retail.fn_hoy_lima(), 0, array[p_variante_id], v_sede) c
    where coalesce(c.descuento_pct, 0) > 0
  ), '[]'::jsonb);

  -- Los lugares de un % de la tienda, con cuántas prendas tienen (el modelo en su color: como cuentan las tiendas).
  v_lugares := coalesce((
    select jsonb_agg(jsonb_build_object(
             'etiqueta_id', l.etiqueta_id, 'nombre', l.nombre, 'pct', l.pct, 'es_cajon', l.es_cajon, 'movible', l.movible, 'hasta', l.hasta,
             'por_categoria', l.por_categoria, 'prendas', retail.fn_prendas_de_lugar(l.etiqueta_id))
           order by l.pct, l.es_cajon desc, l.nombre)
    from retail.fn_rebajas_de_sede(v_sede, false) l
  ), '[]'::jsonb);

  return jsonb_build_object('prenda', v_prenda, 'tiene', v_tiene, 'lugares', v_lugares, 'es_lider', retail.fn_es_lider());
end;
$function$;

comment on function retail.campanas_rebaja_de_prenda(uuid, uuid) is
  'ADR-0669. Lo que muestra «Poner un %» al escanear: la prenda y su precio en la tienda, qué % tiene hoy y de dónde le llega, y los lugares de % de la tienda con cuántas prendas tienen. Pide ver Campañas y ofertas.';

revoke all on function retail.campanas_rebaja_de_prenda(uuid, uuid) from public, anon;
grant execute on function retail.campanas_rebaja_de_prenda(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- Poner y quitar
-- ---------------------------------------------------------------------------------------------------------------------------------------

create or replace function retail.poner_rebaja(
  p_variante_id uuid, p_alcance text, p_pct numeric, p_etiqueta_id uuid, p_ubicacion_id uuid, p_todas boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'retail', 'public'
as $function$
declare
  v_actor uuid;
  v_sede uuid;
  v_todas boolean := coalesce(p_todas, false);
  v_variantes uuid[];
  v_destino uuid;
  v_pct numeric;
  v_nombre text;
  v_sacadas text[];
begin
  v_sede := retail.fn_exigir_rebaja_rapida(p_ubicacion_id, v_todas);
  v_actor := retail.fn_actor_persona_id(true);
  if p_alcance is null or p_alcance not in ('prenda', 'modelo') then
    raise exception 'Elige si va solo a esta prenda o a todo el modelo.' using hint = 'rebaja_sin_alcance';
  end if;
  v_variantes := retail.fn_variantes_del_alcance(p_variante_id, p_alcance);
  if v_variantes is null or cardinality(v_variantes) = 0 or not exists (select 1 from retail.variantes v where v.id = p_variante_id) then
    raise exception 'Esa prenda no existe. Vuelve a escanearla.' using hint = 'rebaja_sin_prenda';
  end if;

  if p_etiqueta_id is not null then
    -- Un lugar que ya existe en esta tienda (un cajón o una campaña con ese %).
    select l.etiqueta_id, l.pct, l.nombre into v_destino, v_pct, v_nombre
      from retail.fn_rebajas_de_sede(v_sede, v_todas) l where l.etiqueta_id = p_etiqueta_id;
    if v_destino is null then
      raise exception 'Ese %% ya no rige en esta tienda. Vuelve a abrir la prenda.' using hint = 'rebaja_lugar_no_rige';
    end if;
  else
    -- Un % nuevo: su cajón (uno por % y tienda), creado si no existe.
    v_pct := round(p_pct, 2);
    if v_pct is null or v_pct <= 0 or v_pct > 70 then
      raise exception 'El %% va de 1 a 70.' using hint = 'rebaja_pct';
    end if;
    perform pg_advisory_xact_lock(hashtext('retail.rebaja_cajones'));
    select c.etiqueta_id into v_destino from retail.rebaja_cajones c where c.pct = v_pct and c.ubicacion_id is not distinct from v_sede;
    if v_destino is null then
      v_nombre := format('Rebaja −%s %% · %s', retail.fn_pct_corto(v_pct),
                         coalesce((select u.nombre from retail.ubicaciones u where u.id = v_sede), 'Todas las tiendas'));
      insert into retail.etiquetas (nombre, estilo, estado, descuento_pct, anunciar_en_portada, aprobado_por, aprobado_en)
        values (v_nombre, 'campana', 'aprobado', v_pct, false, v_actor, now())
        returning id into v_destino;
      if v_sede is not null then
        insert into retail.campana_sedes (etiqueta_id, ubicacion_id) values (v_destino, v_sede);
      end if;
      insert into retail.rebaja_cajones (etiqueta_id, pct, ubicacion_id, creado_por) values (v_destino, v_pct, v_sede, v_actor);
    else
      -- Un cajón apagado vuelve a encenderse (sin fechas: rige desde hoy).
      update retail.etiquetas e set activo = true, vigente_desde = null, vigente_hasta = null, descuento_pct = v_pct
        where e.id = v_destino and (not e.activo or e.vigente_desde is not null or e.vigente_hasta is not null);
      v_nombre := (select e.nombre from retail.etiquetas e where e.id = v_destino);
    end if;
  end if;

  -- Una prenda, un lugar: sale de los otros lugares movibles de esta tienda (o de todas).
  with sacadas as (
    delete from retail.variante_etiquetas ve
    using retail.fn_rebajas_de_sede(v_sede, v_todas) l
    where ve.etiqueta_id = l.etiqueta_id and l.movible and l.etiqueta_id <> v_destino and ve.variante_id = any (v_variantes)
    returning l.nombre
  )
  select array_agg(distinct s.nombre) into v_sacadas from sacadas s;

  insert into retail.variante_etiquetas (variante_id, etiqueta_id)
    select x, v_destino from unnest(v_variantes) x
    on conflict (variante_id, etiqueta_id) do nothing;

  return jsonb_build_object('etiqueta_id', v_destino, 'nombre', v_nombre, 'pct', v_pct, 'prendas', cardinality(v_variantes),
                            'sacadas_de', to_jsonb(coalesce(v_sacadas, '{}'::text[])));
end;
$function$;

comment on function retail.poner_rebaja(uuid, text, numeric, uuid, uuid, boolean) is
  'ADR-0669. «Poner un %»: marca la prenda (o todo su modelo) en un lugar de % de la tienda (un cajón o una campaña con ese %), o en el cajón de un % nuevo, y la saca de los otros lugares movibles. Hasta 70 %; «todas las tiendas» solo un líder. Firma con el responsable.';

revoke all on function retail.poner_rebaja(uuid, text, numeric, uuid, uuid, boolean) from public, anon;
grant execute on function retail.poner_rebaja(uuid, text, numeric, uuid, uuid, boolean) to authenticated;

create or replace function retail.quitar_rebaja(p_variante_id uuid, p_alcance text, p_ubicacion_id uuid, p_todas boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'retail', 'public'
as $function$
declare
  v_sede uuid;
  v_todas boolean := coalesce(p_todas, false);
  v_variantes uuid[];
  v_sacadas text[];
  v_n integer;
begin
  v_sede := retail.fn_exigir_rebaja_rapida(p_ubicacion_id, v_todas);
  perform retail.fn_actor_persona_id(true);
  if p_alcance is null or p_alcance not in ('prenda', 'modelo') then
    raise exception 'Elige si va solo a esta prenda o a todo el modelo.' using hint = 'rebaja_sin_alcance';
  end if;
  v_variantes := retail.fn_variantes_del_alcance(p_variante_id, p_alcance);
  with sacadas as (
    delete from retail.variante_etiquetas ve
    using retail.fn_rebajas_de_sede(v_sede, v_todas) l
    where ve.etiqueta_id = l.etiqueta_id and l.movible and ve.variante_id = any (coalesce(v_variantes, '{}'::uuid[]))
    returning l.nombre
  )
  select array_agg(distinct s.nombre), count(*) into v_sacadas, v_n from sacadas s;
  return jsonb_build_object('quitadas', v_n, 'sacadas_de', to_jsonb(coalesce(v_sacadas, '{}'::text[])));
end;
$function$;

comment on function retail.quitar_rebaja(uuid, text, uuid, boolean) is
  'ADR-0669. Quita el % de «Poner un %»: saca la prenda (o todo su modelo) de los lugares movibles de la tienda. Lo que le llega por categoría o por una oferta no se toca. Firma con el responsable.';

revoke all on function retail.quitar_rebaja(uuid, text, uuid, boolean) from public, anon;
grant execute on function retail.quitar_rebaja(uuid, text, uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- Los lugares de % de una tienda y sus prendas
-- ---------------------------------------------------------------------------------------------------------------------------------------

create or replace function retail.campanas_rebajas_de_tienda(p_ubicacion_id uuid)
returns table (etiqueta_id uuid, nombre text, pct numeric, es_cajon boolean, movible boolean, hasta date, por_categoria boolean, prendas integer)
language plpgsql
stable
security definer
set search_path to 'retail', 'public'
as $function$
declare
  v_sede uuid := retail.fn_exigir_rebaja_rapida(p_ubicacion_id, false);
begin
  return query
    select l.etiqueta_id, l.nombre, l.pct, l.es_cajon, l.movible, l.hasta, l.por_categoria, retail.fn_prendas_de_lugar(l.etiqueta_id)
    from retail.fn_rebajas_de_sede(v_sede, false) l
    order by l.pct, l.es_cajon desc, l.nombre;
end;
$function$;

comment on function retail.campanas_rebajas_de_tienda(uuid) is
  'ADR-0669. Los lugares de % de una tienda (cajones y campañas vigentes con descuento de siempre) con cuántas prendas (modelo en su color, marcadas o por sus categorías) le llegan a cada uno.';

revoke all on function retail.campanas_rebajas_de_tienda(uuid) from public, anon;
grant execute on function retail.campanas_rebajas_de_tienda(uuid) to authenticated;

create or replace function retail.campanas_rebaja_prendas(p_etiqueta_id uuid, p_ubicacion_id uuid)
returns table (variante_id uuid, producto_id uuid, referencia text, codigo text, color text, color_hex text, talla text, precio numeric)
language plpgsql
stable
security definer
set search_path to 'retail', 'public'
as $function$
declare
  v_sede uuid := retail.fn_exigir_rebaja_rapida(p_ubicacion_id, false);
begin
  if not exists (select 1 from retail.fn_rebajas_de_sede(v_sede, false) l where l.etiqueta_id = p_etiqueta_id) then
    raise exception 'Ese %% ya no rige en esta tienda.' using hint = 'rebaja_lugar_no_rige';
  end if;
  return query
    select v.id, p.id, p.referencia, coalesce(v.codigo, v.sku), co.nombre, co.hex, t.valor, retail.fn_precio_en_sede(v.id, v_sede)
    from retail.variante_etiquetas ve
    join retail.variantes v on v.id = ve.variante_id and v.activo
    join retail.productos p on p.id = v.producto_id
    left join retail.colores co on co.codigo = v.color_codigo
    left join retail.tallas t on t.id = v.talla_id
    where ve.etiqueta_id = p_etiqueta_id
    order by p.referencia, co.nombre, t.valor;
end;
$function$;

comment on function retail.campanas_rebaja_prendas(uuid, uuid) is
  'ADR-0669. Las prendas marcadas de un lugar de % de la tienda, con su precio en la tienda, para verlas y quitarlas.';

revoke all on function retail.campanas_rebaja_prendas(uuid, uuid) from public, anon;
grant execute on function retail.campanas_rebaja_prendas(uuid, uuid) to authenticated;
