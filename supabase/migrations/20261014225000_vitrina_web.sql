-- ============================================================================
-- 20261014225000_vitrina_web.sql — CAYLA V2 · Tienda online (ADR-0408), actividad 3: la Vitrina web y el catálogo publicado
--
-- EL PROBLEMA PRIMERO. La tienda online necesita saber QUÉ modelos se ven en la web y A QUÉ PRECIO, y eso no puede vivir en
-- `productos` ni en `variantes` (principio 1: el núcleo del catálogo no se toca; ADR-0408, DECIDÍ 5). El precio de tienda sigue
-- en `variantes.precio` y en `precios_sede_prenda`; el de la web es otro, por MODELO, y nace al encenderlo (maqueta v4).
--
-- LO QUE HACE
--   1. El módulo `vitrina_web` (Catálogo ▸ Vitrina web). Nace SIN rol (ADR-0161): solo lo ve el líder hasta que él lo da.
--   2. `retail.vitrina_productos`: una fila por modelo que alguna vez se encendió. Es el estado de HOY (si se ve, su precio web,
--      cómo entra a «Lo nuevo», su descripción para la web); apagar NO borra: marca `publicado = false` y conserva el precio
--      para cuando se vuelva a mostrar. Quién y cuándo de cada cambio queda en `retail.actividad` (módulo `vitrina_web`), que
--      es de solo agregar. RLS encendido y SIN políticas: solo la tocan las funciones de abajo (security definer).
--   3. Las funciones del ERP, todas con `fn_exigir_modulo('vitrina_web')` y firmadas con `fn_actor_persona_id(true)` (el combo
--      «Responsable», ADR-0162):
--        · `vitrina_guardar_modelo` — la hoja de un modelo: mostrar u ocultar, precio web, «Lo nuevo» y descripción.
--        · `vitrina_mostrar` — el lote: mostrar u ocultar varios a la vez (el que nunca se mostró entra con su precio de tienda).
--        · `vitrina_cambiar_precios` — el lote: el precio web nuevo de varios modelos.
--        · `fn_vitrina_modelos` — la lectura de la pantalla.
--   4. `retail.tienda_catalogo()`, para la tienda (rol `tienda_web`): lo publicado, con su precio web y, si una campaña vigente
--      toca el modelo, el precio con la MISMA regla de la caja (`fn_campanas_por_variante` + `fn_descuento_campana`, ADR-0403:
--      el precio final baja al múltiplo de S/ 0.10 de abajo). Sin stock (los niveles por tienda son la actividad 4).
--
-- REGLAS (Lamport: lo que la base no deja que pase)
--   · Precio web: mayor que cero, hasta S/ 99 999.99, con dos decimales como mucho, y NUNCA por debajo del costo de sus tallas
--     activas: la misma regla que Felipe puso al precio de tienda el 2026-10-11 (20261011110000: «la caja ya prohíbe vender bajo
--     el costo a todos»). Para vender más barato está la campaña. El mensaje no dice cuánto cuesta (el costo es dato con permiso).
--   · Solo se muestra un modelo que se puede vender: activo, no de prueba, no la «Prenda sin registrar» y con alguna talla activa.
--     Un modelo descontinuado después de mostrarse sigue en la vitrina del ERP, pero la tienda deja de verlo.
--   · Dos personas con el mismo modelo abierto: gana la primera y la segunda recibe `vitrina_cambio_otro` (la fila lleva `version`).
--   · Un lote es todo o nada: si un modelo no se puede mostrar, no se muestra ninguno y el mensaje dice cuáles.
--
-- DECIDÍ: la historia de quién y cuándo en `retail.actividad` (ya inmutable y con su pantalla), no en una tabla nueva.
-- DESCARTÉ: borrar la fila al apagar (se perdería el precio web y el «desde cuándo») y un booleano `fijo_en_nuevo` (la maqueta
--   tiene TRES estados: automático, fijado a mano y quitado a mano).
-- `vitrina_productos` se va con su producto (`on delete cascade`): solo se elimina un producto que no tiene historia (nunca se
-- vendió ni se movió); su fila de la vitrina es configuración, como sus fotos (`eliminar_producto.mjs`, lista SUYAS).
--
-- PRODUCCIÓN. NO está aplicada (actividad 13, con el OK de Felipe). Una sola parte, re-ejecutable: tabla NUEVA sin políticas,
-- funciones y una fila en `modulos`; no hace `alter` de tablas en uso ni toca disparadores (ADR-0195). Dentro de los textos entre
-- comillas no hay ningún `select … into` (ADR-0288). Prueba: `pnpm pruebas:vitrina-web`.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. El módulo (nace sin rol: solo el líder) ----------
insert into retail.modulos (clave, grupo, nombre, incluye, orden, solo_lider, delegable) values
  ('vitrina_web', 'Catálogo', 'Vitrina web',
   'Elegir qué modelos se ven en la tienda online y a qué precio web, mostrar u ocultar varios a la vez y fijarlos o quitarlos de Lo nuevo',
   125, false, true)
on conflict (clave) do nothing;

-- ---------- 2. La tabla ----------
create table if not exists retail.vitrina_productos (
  producto_id      uuid primary key references retail.productos (id) on delete cascade,
  publicado        boolean not null,
  precio_web       numeric(12, 2) not null,
  -- 'automatico': sale en «Lo nuevo» si llegó a una tienda hace poco (la regla es de la actividad 5); 'fijo': sale aunque no;
  -- 'quitado': no sale aunque haya llegado ayer.
  en_lo_nuevo      text not null default 'automatico',
  -- Lo que ve el cliente en la ficha. Vacío: la descripción del catálogo (`productos.descripcion`).
  descripcion_web  text,
  -- La última vez que se encendió: «lo último que entró a la web» y el orden del catálogo.
  publicado_en     timestamptz,
  version          integer not null default 1,
  creado_en        timestamptz not null default now(),
  creado_por       uuid references public.personas (id),
  actualizado_en   timestamptz not null default now(),
  actualizado_por  uuid references public.personas (id),
  constraint vitrina_productos_precio_web check (precio_web > 0 and precio_web <= 99999.99),
  constraint vitrina_productos_en_lo_nuevo check (en_lo_nuevo in ('automatico', 'fijo', 'quitado')),
  constraint vitrina_productos_descripcion check (descripcion_web is null or char_length(descripcion_web) between 1 and 600),
  constraint vitrina_productos_publicado_en check (not publicado or publicado_en is not null),
  constraint vitrina_productos_version check (version >= 1)
);

comment on table retail.vitrina_productos is
  'La vitrina de la tienda online (ADR-0408): qué modelos se ven en la web, su precio web propio y cómo entran a Lo nuevo. Apagar marca publicado = false (nunca se borra al ocultar). Se escribe solo con vitrina_guardar_modelo / vitrina_mostrar / vitrina_cambiar_precios; quién y cuándo, en retail.actividad (módulo vitrina_web).';
comment on column retail.vitrina_productos.precio_web is 'El precio que ve el cliente en la web, para todas las tallas y colores. Nace al encenderlo. Nunca bajo el costo de sus tallas activas. Las campañas se aplican sobre él (ADR-0403).';
comment on column retail.vitrina_productos.en_lo_nuevo is 'automatico | fijo | quitado: fijar o quitar a mano de Lo nuevo (maqueta v4).';

create index if not exists vitrina_productos_publicados_idx on retail.vitrina_productos (publicado_en desc) where publicado;

alter table retail.vitrina_productos enable row level security;
revoke all on table retail.vitrina_productos from public, anon, authenticated;

-- ---------- 3. Piezas internas ----------

-- ¿Se puede mostrar en la web? Activo, no de prueba, no la «Prenda sin registrar» y con alguna talla activa. Una prenda
-- pendiente de revisar se trata como cualquier otra (ADR-0371); una rechazada ya está descontinuada.
create or replace function retail.fn_vitrina_publicable(p_producto_id uuid)
returns boolean
language sql
stable
security definer
set search_path = retail, public
as $$
  select exists (
    select 1
      from retail.productos p
     where p.id = p_producto_id
       and p.estado = 'activo'
       and p.estado_alta <> 'rechazado'
       and not p.es_prueba
       and p.id <> '11111111-1111-4111-8111-111111111111'
       and exists (select 1 from retail.variantes v where v.producto_id = p.id and v.activo)
  )
$$;
revoke all on function retail.fn_vitrina_publicable(uuid) from public, anon, authenticated;

-- ¿Ese precio web queda por debajo de lo que cuesta ALGUNA talla activa del modelo? La regla del precio de tienda (20261011110000):
-- el precio vale para todas las tallas; quedar justo en el costo sí se puede. Una sola definición para la hoja y los dos lotes.
create or replace function retail.fn_vitrina_bajo_costo(p_producto_id uuid, p_precio numeric)
returns boolean
language sql
stable
security definer
set search_path = retail, public
as $$
  select coalesce(p_precio < (select max(v.costo) from retail.variantes v where v.producto_id = p_producto_id and v.activo), false)
$$;
revoke all on function retail.fn_vitrina_bajo_costo(uuid, numeric) from public, anon, authenticated;

-- El precio web que se puede guardar: positivo, finito, con dos decimales y no bajo el costo. Devuelve el precio o lanza el código
-- que la pantalla traduce.
create or replace function retail.fn_vitrina_precio_valido(p_producto_id uuid, p_precio numeric)
returns numeric
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $fn$
begin
  -- NaN e Infinity no pasan por «<= 99999.99»; el redondeo pide dos decimales como mucho.
  if p_precio is null or p_precio <= 0 or not (p_precio <= 99999.99) or round(p_precio, 2) <> p_precio then
    raise exception 'vitrina_precio_invalido' using hint = 'Escribe un precio web mayor que cero, con hasta dos decimales.';
  end if;
  if retail.fn_vitrina_bajo_costo(p_producto_id, p_precio) then
    raise exception 'vitrina_precio_bajo_costo'
      using hint = 'Ese precio web queda por debajo de lo que cuesta la prenda. Para venderla más barata, usa una campaña (Catálogo ▸ Atributos ▸ Etiquetas).';
  end if;
  return p_precio;
end;
$fn$;
revoke all on function retail.fn_vitrina_precio_valido(uuid, numeric) from public, anon, authenticated;

-- «S/ 79.90», para lo que se anota en la actividad.
create or replace function retail.fn_vitrina_soles(p_monto numeric)
returns text
language sql
immutable
set search_path = retail, public
as $$
  select 'S/ ' || to_char(p_monto, 'FM99990.00')
$$;
revoke all on function retail.fn_vitrina_soles(numeric) from public, anon, authenticated;

-- «Blusa Emma, Falda Renata y Vestido Sofía»: en orden alfabético, hasta cinco nombres; después, «y N más».
create or replace function retail.fn_vitrina_lista_nombres(p_nombres text[])
returns text
language sql
immutable
set search_path = retail, public
as $$
  with n as (select array_agg(x order by x) as a from unnest(p_nombres) x)
  select case
    when coalesce(cardinality(n.a), 0) = 0 then ''
    when cardinality(n.a) = 1 then n.a[1]
    when cardinality(n.a) <= 5 then array_to_string(n.a[1:cardinality(n.a) - 1], ', ') || ' y ' || n.a[cardinality(n.a)]
    else array_to_string(n.a[1:5], ', ') || ' y ' || (cardinality(n.a) - 5)::text || ' más'
  end
  from n
$$;
revoke all on function retail.fn_vitrina_lista_nombres(text[]) from public, anon, authenticated;

-- Una línea en la Actividad (quién y cuándo). Si anotar falla, lo guardado sigue en pie (como en los demás módulos).
create or replace function retail.fn_vitrina_anotar(
  p_accion text, p_descripcion text, p_persona_id uuid, p_registro_id text, p_detalle jsonb
)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $fn$
begin
  begin
    perform retail.fn_actividad_anotar(
      'vitrina_web', p_accion, p_descripcion, p_persona_id, retail.fn_actividad_terminal_ahora(),
      retail.fn_actividad_sede_de(p_persona_id, 'vivo'), null, 'vitrina_productos', p_registro_id, now(), p_detalle, 'vivo');
  exception when others then
    raise warning 'actividad: no se anotó la vitrina (%)', sqlerrm;
  end;
end;
$fn$;
revoke all on function retail.fn_vitrina_anotar(text, text, uuid, text, jsonb) from public, anon, authenticated;

-- Un modelo tal como lo lee la pantalla de la Vitrina. `p_ve_costo`: solo el líder ve el costo (y con él, el margen).
create or replace function retail.fn_vitrina_modelo_json(p_producto_id uuid, p_ve_costo boolean)
returns jsonb
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select jsonb_build_object(
    'id', p.id,
    'codigo', p.codigo,
    'nombre', p.referencia,
    'descripcion', p.descripcion,
    'categoria', c.nombre,
    'prefijo', c.prefijo,
    'familia', c.familia,
    'publicable', retail.fn_vitrina_publicable(p.id),
    'precio_tienda', pr.maximo,
    'precio_tienda_min', pr.minimo,
    'costo', case when p_ve_costo then pr.costo end,
    'foto', (
      select pf.url from retail.producto_fotos pf
       where pf.producto_id = p.id
       order by pf.es_principal desc, pf.orden, pf.created_at, pf.id
       limit 1),
    'colores', coalesce((
      select jsonb_agg(jsonb_build_object(
               'codigo', co.codigo, 'nombre', co.nombre, 'hex', co.hex,
               'foto', (select pf.url from retail.producto_fotos pf
                         where pf.producto_id = p.id and pf.color_codigo = co.codigo
                         order by pf.es_principal desc, pf.orden, pf.created_at, pf.id
                         limit 1))
             order by co.orden, co.nombre)
        from retail.colores co
       where co.codigo in (select v.color_codigo from retail.variantes v where v.producto_id = p.id and v.activo)), '[]'::jsonb),
    'tallas', (select count(distinct v.talla_id) from retail.variantes v where v.producto_id = p.id and v.activo),
    -- Lo libre (sin lo apartado) de cada tienda abierta, todos los colores y tallas.
    'stock', coalesce((
      select jsonb_agg(jsonb_build_object('ubicacion_id', u.id, 'cantidad', coalesce(s.libre, 0)) order by u.nombre)
        from retail.ubicaciones u
        left join lateral (
          select sum(st.cantidad - st.cantidad_apartada)::integer as libre
            from retail.stock st
            join retail.variantes v on v.id = st.variante_id
           where v.producto_id = p.id and v.activo and st.ubicacion_id = u.id) s on true
       where u.tipo = 'tienda' and u.activo), '[]'::jsonb),
    -- La campaña de mayor descuento que toca alguna talla activa hoy (la misma regla de la caja); `todas`: si las toca todas.
    'campana', (
      select jsonb_build_object('nombre', x.etiqueta_nombre, 'pct', x.descuento_pct,
               'todas', (select count(distinct y.variante_id) from retail.fn_campanas_por_variante(retail.fn_hoy_lima(), 0, va.ids) y
                          where y.etiqueta_id = x.etiqueta_id) = cardinality(va.ids))
        from (select coalesce(array_agg(v.id), '{}'::uuid[]) as ids from retail.variantes v where v.producto_id = p.id and v.activo) va
        cross join lateral retail.fn_campanas_por_variante(retail.fn_hoy_lima(), 0, va.ids) x
       order by x.descuento_pct desc, x.etiqueta_nombre, x.etiqueta_id
       limit 1),
    'vitrina', case when vp.producto_id is null then null else jsonb_build_object(
      'publicado', vp.publicado,
      'precio_web', vp.precio_web,
      'en_lo_nuevo', vp.en_lo_nuevo,
      'descripcion_web', vp.descripcion_web,
      'version', vp.version,
      'publicado_en', vp.publicado_en,
      'actualizado_en', vp.actualizado_en,
      'actualizado_por', nullif(btrim(coalesce(pe.nombres, '') || ' ' || coalesce(pe.apellidos, '')), '')) end
  )
  from retail.productos p
  left join retail.categorias c on c.id = p.categoria_id
  left join retail.vitrina_productos vp on vp.producto_id = p.id
  left join public.personas pe on pe.id = vp.actualizado_por
  cross join lateral (
    select max(v.precio) as maximo, min(v.precio) as minimo, max(v.costo) as costo
      from retail.variantes v where v.producto_id = p.id and v.activo) pr
  where p.id = p_producto_id
$$;
revoke all on function retail.fn_vitrina_modelo_json(uuid, boolean) from public, anon, authenticated;

-- ---------- 4. La lectura de la pantalla ----------
create or replace function retail.fn_vitrina_modelos()
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_ve_costo boolean;
begin
  perform retail.fn_exigir_modulo('vitrina_web');
  v_ve_costo := coalesce(retail.fn_es_lider(), false);
  return jsonb_build_object(
    've_costos', v_ve_costo,
    'tiendas', coalesce((
      select jsonb_agg(jsonb_build_object('id', u.id, 'nombre', u.nombre) order by u.nombre)
        from retail.ubicaciones u where u.tipo = 'tienda' and u.activo), '[]'::jsonb),
    -- Lo que se puede mostrar, más lo que ya estuvo en la vitrina aunque hoy no se pueda (descontinuado: la pantalla lo dice).
    'modelos', coalesce((
      select jsonb_agg(retail.fn_vitrina_modelo_json(x.id, v_ve_costo) order by x.referencia, x.id)
        from (
          select p.id, p.referencia from retail.productos p
           where retail.fn_vitrina_publicable(p.id)
              or exists (select 1 from retail.vitrina_productos vp where vp.producto_id = p.id)
        ) x), '[]'::jsonb)
  );
end;
$fn$;
revoke all on function retail.fn_vitrina_modelos() from public, anon;
grant execute on function retail.fn_vitrina_modelos() to authenticated;

-- ---------- 5. Guardar un modelo (la hoja) ----------
-- Crea la fila la primera vez (el precio web nace al encenderlo) o la cambia. `p_version`: la que leyó la pantalla (`null` si
-- el modelo nunca estuvo en la vitrina); si otra persona lo cambió entretanto, `vitrina_cambio_otro`. Sin cambios, no anota nada.
create or replace function retail.vitrina_guardar_modelo(
  p_producto_id uuid,
  p_publicado boolean,
  p_precio_web numeric,
  p_en_lo_nuevo text,
  p_descripcion_web text,
  p_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_actor uuid;
  v_nombre text;
  v_precio numeric(12, 2);
  v_desc text := nullif(btrim(regexp_replace(coalesce(p_descripcion_web, ''), '\s+', ' ', 'g')), '');
  v_fila retail.vitrina_productos%rowtype;
  v_existe boolean;
  v_partes text[] := '{}';
  v_ve_costo boolean;
begin
  perform retail.fn_exigir_modulo('vitrina_web');
  v_actor := retail.fn_actor_persona_id(true);

  if p_producto_id is null or p_publicado is null then
    raise exception 'vitrina_datos_invalidos' using hint = 'Falta el modelo o si se ve en la web.';
  end if;
  v_nombre := (select p.referencia from retail.productos p where p.id = p_producto_id);
  if v_nombre is null then
    raise exception 'vitrina_no_existe' using hint = 'Ese modelo ya no existe. Recarga la pantalla.';
  end if;
  if p_en_lo_nuevo is null or p_en_lo_nuevo not in ('automatico', 'fijo', 'quitado') then
    raise exception 'vitrina_datos_invalidos' using hint = 'Elige cómo entra a Lo nuevo.';
  end if;
  if v_desc is not null and char_length(v_desc) > 600 then
    raise exception 'vitrina_datos_invalidos' using hint = 'La descripción para la web va en 600 letras como mucho.';
  end if;
  if p_publicado and not retail.fn_vitrina_publicable(p_producto_id) then
    raise exception 'vitrina_no_publicable'
      using hint = format('«%s» no se puede mostrar: está descontinuado, es de prueba o no tiene tallas activas.', v_nombre);
  end if;
  v_precio := retail.fn_vitrina_precio_valido(p_producto_id, p_precio_web);

  select * into v_fila from retail.vitrina_productos where producto_id = p_producto_id for update;
  v_existe := found;

  if not v_existe then
    if p_version is not null then
      raise exception 'vitrina_cambio_otro' using hint = 'Este modelo cambió mientras lo tenías abierto. Vuelve a abrirlo.';
    end if;
    insert into retail.vitrina_productos
      (producto_id, publicado, precio_web, en_lo_nuevo, descripcion_web, publicado_en, creado_por, actualizado_por)
    values
      (p_producto_id, p_publicado, v_precio, p_en_lo_nuevo, v_desc, case when p_publicado then now() end, v_actor, v_actor)
    on conflict (producto_id) do nothing;
    if not found then
      -- Otra persona lo encendió en el mismo instante: que esta vuelva a abrirlo y vea lo que quedó.
      raise exception 'vitrina_cambio_otro' using hint = 'Este modelo cambió mientras lo tenías abierto. Vuelve a abrirlo.';
    end if;
    v_partes := array[case when p_publicado then 'se ve en la web' else 'queda oculto' end, 'precio web ' || retail.fn_vitrina_soles(v_precio)];
    if p_en_lo_nuevo = 'fijo' then v_partes := v_partes || 'fijado en Lo nuevo'::text; end if;
    if p_en_lo_nuevo = 'quitado' then v_partes := v_partes || 'fuera de Lo nuevo'::text; end if;
    if v_desc is not null then v_partes := v_partes || 'con descripción para la web'::text; end if;
  else
    if p_version is null or p_version <> v_fila.version then
      raise exception 'vitrina_cambio_otro' using hint = 'Este modelo cambió mientras lo tenías abierto. Vuelve a abrirlo.';
    end if;
    if p_publicado is distinct from v_fila.publicado then
      v_partes := v_partes || (case when p_publicado then 'se ve en la web' else 'ya no se ve en la web' end);
    end if;
    if v_precio <> v_fila.precio_web then
      v_partes := v_partes || ('precio web ' || retail.fn_vitrina_soles(v_fila.precio_web) || ' → ' || retail.fn_vitrina_soles(v_precio));
    end if;
    if p_en_lo_nuevo <> v_fila.en_lo_nuevo then
      v_partes := v_partes || (case p_en_lo_nuevo when 'fijo' then 'fijado en Lo nuevo' when 'quitado' then 'fuera de Lo nuevo'
                                                  else 'Lo nuevo automático' end);
    end if;
    if v_desc is distinct from v_fila.descripcion_web then
      v_partes := v_partes || 'cambió su descripción para la web'::text;
    end if;
    if cardinality(v_partes) > 0 then
      update retail.vitrina_productos
         set publicado = p_publicado,
             precio_web = v_precio,
             en_lo_nuevo = p_en_lo_nuevo,
             descripcion_web = v_desc,
             publicado_en = case when p_publicado and not v_fila.publicado then now() else publicado_en end,
             version = version + 1,
             actualizado_en = now(),
             actualizado_por = v_actor
       where producto_id = p_producto_id;
    end if;
  end if;

  if cardinality(v_partes) > 0 then
    perform retail.fn_vitrina_anotar(
      'vitrina_guardada', '«' || v_nombre || '»: ' || array_to_string(v_partes, ' · '), v_actor, p_producto_id::text,
      jsonb_build_object('producto_id', p_producto_id, 'publicado', p_publicado, 'precio_web', v_precio, 'en_lo_nuevo', p_en_lo_nuevo));
  end if;

  v_ve_costo := coalesce(retail.fn_es_lider(), false);
  return retail.fn_vitrina_modelo_json(p_producto_id, v_ve_costo);
end;
$fn$;
revoke all on function retail.vitrina_guardar_modelo(uuid, boolean, numeric, text, text, integer) from public, anon;
grant execute on function retail.vitrina_guardar_modelo(uuid, boolean, numeric, text, text, integer) to authenticated;

-- ---------- 6. Mostrar u ocultar varios (el lote) ----------
-- Mostrar: el que ya tiene precio web vuelve con él; el que nunca estuvo entra con su precio de tienda (el mayor de sus tallas
-- activas). Ocultar: marca `publicado = false` y guarda el precio. Todo o nada; devuelve cuántos cambiaron.
create or replace function retail.vitrina_mostrar(p_producto_ids uuid[], p_publicado boolean)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_actor uuid;
  v_id uuid;
  v_nombre text;
  v_fila retail.vitrina_productos%rowtype;
  v_existe boolean;
  v_inicial numeric;
  v_no_publicables text[] := '{}';
  v_sin_precio text[] := '{}';
  v_bajo_costo text[] := '{}';
  v_nombres text[] := '{}';
  v_ids uuid[] := '{}';
begin
  perform retail.fn_exigir_modulo('vitrina_web');
  v_actor := retail.fn_actor_persona_id(true);

  if p_publicado is null or p_producto_ids is null or cardinality(p_producto_ids) = 0 or cardinality(p_producto_ids) > 500
     or array_position(p_producto_ids, null) is not null then
    raise exception 'vitrina_datos_invalidos' using hint = 'Elige de 1 a 500 modelos.';
  end if;

  -- En orden de id: dos lotes que se cruzan toman las filas en el mismo orden y se turnan, sin trabarse.
  for v_id in select distinct x from unnest(p_producto_ids) x order by 1 loop
    v_nombre := (select p.referencia from retail.productos p where p.id = v_id);
    if v_nombre is null then
      raise exception 'vitrina_no_existe' using hint = 'Uno de los modelos ya no existe. Recarga la pantalla.';
    end if;
    select * into v_fila from retail.vitrina_productos where producto_id = v_id for update;
    v_existe := found;

    if p_publicado then
      if v_existe and v_fila.publicado then
        continue;
      end if;
      if not retail.fn_vitrina_publicable(v_id) then
        v_no_publicables := v_no_publicables || v_nombre;
        continue;
      end if;
      if v_existe then
        if retail.fn_vitrina_bajo_costo(v_id, v_fila.precio_web) then
          v_bajo_costo := v_bajo_costo || v_nombre;
          continue;
        end if;
        update retail.vitrina_productos
           set publicado = true, publicado_en = now(), version = version + 1, actualizado_en = now(), actualizado_por = v_actor
         where producto_id = v_id;
      else
        v_inicial := (select max(v.precio) from retail.variantes v where v.producto_id = v_id and v.activo);
        if v_inicial is null or v_inicial <= 0 then
          v_sin_precio := v_sin_precio || v_nombre;
          continue;
        end if;
        if retail.fn_vitrina_bajo_costo(v_id, v_inicial) then
          v_bajo_costo := v_bajo_costo || v_nombre;
          continue;
        end if;
        insert into retail.vitrina_productos (producto_id, publicado, precio_web, publicado_en, creado_por, actualizado_por)
        values (v_id, true, v_inicial, now(), v_actor, v_actor);
      end if;
    else
      if not v_existe or not v_fila.publicado then
        continue;
      end if;
      update retail.vitrina_productos
         set publicado = false, version = version + 1, actualizado_en = now(), actualizado_por = v_actor
       where producto_id = v_id;
    end if;
    v_nombres := v_nombres || v_nombre;
    v_ids := v_ids || v_id;
  end loop;

  if cardinality(v_no_publicables) > 0 then
    raise exception 'vitrina_no_publicable'
      using hint = format('No se pueden mostrar: %s (descontinuados, de prueba o sin tallas activas). Quítalos de la selección.',
                          retail.fn_vitrina_lista_nombres(v_no_publicables));
  end if;
  if cardinality(v_sin_precio) > 0 then
    raise exception 'vitrina_sin_precio'
      using hint = format('No tienen precio de tienda: %s. Ábrelos uno por uno y ponles su precio web.', retail.fn_vitrina_lista_nombres(v_sin_precio));
  end if;
  if cardinality(v_bajo_costo) > 0 then
    raise exception 'vitrina_precio_bajo_costo'
      using hint = format('Su precio web queda por debajo de lo que cuestan: %s. Ábrelos y súbeles el precio.', retail.fn_vitrina_lista_nombres(v_bajo_costo));
  end if;

  if cardinality(v_ids) > 0 then
    perform retail.fn_vitrina_anotar(
      case when p_publicado then 'vitrina_mostrada' else 'vitrina_ocultada' end,
      case
        when cardinality(v_nombres) = 1 and p_publicado then 'mostró «' || v_nombres[1] || '» en la web'
        when cardinality(v_nombres) = 1 then 'ocultó «' || v_nombres[1] || '» de la web'
        when p_publicado then 'mostró en la web ' || cardinality(v_nombres) || ' modelos: ' || retail.fn_vitrina_lista_nombres(v_nombres)
        else 'ocultó de la web ' || cardinality(v_nombres) || ' modelos: ' || retail.fn_vitrina_lista_nombres(v_nombres)
      end,
      v_actor,
      case when cardinality(v_ids) = 1 then v_ids[1]::text else gen_random_uuid()::text end,
      jsonb_build_object('producto_ids', to_jsonb(v_ids), 'publicado', p_publicado));
  end if;

  return jsonb_build_object('cambiados', cardinality(v_ids));
end;
$fn$;
revoke all on function retail.vitrina_mostrar(uuid[], boolean) from public, anon;
grant execute on function retail.vitrina_mostrar(uuid[], boolean) to authenticated;

-- ---------- 7. Cambiar el precio web de varios (el lote) ----------
-- `p_cambios`: [{producto_id, precio_web, version}]. La pantalla calcula cada precio nuevo (subir o bajar en soles o en %) y
-- manda la `version` que leyó (`null` si el modelo nunca estuvo en la vitrina: entra oculto, con ese precio). Todo o nada.
create or replace function retail.vitrina_cambiar_precios(p_cambios jsonb)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_actor uuid;
  v_item jsonb;
  v_id uuid;
  v_precio numeric;
  v_version integer;
  v_nombre text;
  v_fila retail.vitrina_productos%rowtype;
  v_existe boolean;
  v_bajo_costo text[] := '{}';
  v_otros text[] := '{}';
  v_nombres text[] := '{}';
  v_ids uuid[] := '{}';
  v_detalle jsonb := '[]'::jsonb;
begin
  perform retail.fn_exigir_modulo('vitrina_web');
  v_actor := retail.fn_actor_persona_id(true);

  if p_cambios is null or jsonb_typeof(p_cambios) <> 'array' or jsonb_array_length(p_cambios) = 0 or jsonb_array_length(p_cambios) > 500 then
    raise exception 'vitrina_datos_invalidos' using hint = 'Elige de 1 a 500 modelos.';
  end if;
  -- La forma de cada cambio, antes de tocar nada: un id de verdad, un precio numérico y una versión entera o nula, sin repetidos.
  if exists (
    select 1 from jsonb_array_elements(p_cambios) e
     where jsonb_typeof(e) <> 'object'
        or coalesce(e ->> 'producto_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        or jsonb_typeof(e -> 'precio_web') is distinct from 'number'
        or (e ? 'version' and jsonb_typeof(e -> 'version') <> 'null'
            and (jsonb_typeof(e -> 'version') <> 'number' or (e ->> 'version') !~ '^[0-9]{1,9}$'))
  ) or (select count(distinct lower(e ->> 'producto_id')) from jsonb_array_elements(p_cambios) e) <> jsonb_array_length(p_cambios) then
    raise exception 'vitrina_datos_invalidos' using hint = 'Los precios nuevos no llegaron completos. Vuelve a intentarlo.';
  end if;

  for v_item in select e from jsonb_array_elements(p_cambios) e order by (e ->> 'producto_id')::uuid loop
    v_id := (v_item ->> 'producto_id')::uuid;
    v_version := case when jsonb_typeof(v_item -> 'version') = 'number' then (v_item ->> 'version')::integer end;
    v_nombre := (select p.referencia from retail.productos p where p.id = v_id);
    if v_nombre is null then
      raise exception 'vitrina_no_existe' using hint = 'Uno de los modelos ya no existe. Recarga la pantalla.';
    end if;
    -- Positivo, finito y con dos decimales: si no, es un error de la pantalla y se dice tal cual.
    v_precio := (v_item ->> 'precio_web')::numeric;
    if v_precio <= 0 or not (v_precio <= 99999.99) or round(v_precio, 2) <> v_precio then
      raise exception 'vitrina_precio_invalido'
        using hint = format('El precio web de «%s» tiene que ser mayor que cero, con hasta dos decimales.', v_nombre);
    end if;

    select * into v_fila from retail.vitrina_productos where producto_id = v_id for update;
    v_existe := found;
    if (v_existe and (v_version is null or v_version <> v_fila.version)) or (not v_existe and v_version is not null) then
      v_otros := v_otros || v_nombre;
      continue;
    end if;
    if retail.fn_vitrina_bajo_costo(v_id, v_precio) then
      v_bajo_costo := v_bajo_costo || v_nombre;
      continue;
    end if;
    if v_existe and v_fila.precio_web = v_precio then
      continue;
    end if;

    if v_existe then
      update retail.vitrina_productos
         set precio_web = v_precio, version = version + 1, actualizado_en = now(), actualizado_por = v_actor
       where producto_id = v_id;
    else
      insert into retail.vitrina_productos (producto_id, publicado, precio_web, creado_por, actualizado_por)
      values (v_id, false, v_precio, v_actor, v_actor);
    end if;
    v_nombres := v_nombres || v_nombre;
    v_ids := v_ids || v_id;
    v_detalle := v_detalle || jsonb_build_object('producto_id', v_id, 'antes', case when v_existe then v_fila.precio_web end, 'despues', v_precio);
  end loop;

  if cardinality(v_otros) > 0 then
    raise exception 'vitrina_cambio_otro'
      using hint = format('Cambiaron mientras los tenías elegidos: %s. Recarga la pantalla y vuelve a intentarlo.', retail.fn_vitrina_lista_nombres(v_otros));
  end if;
  if cardinality(v_bajo_costo) > 0 then
    raise exception 'vitrina_precio_bajo_costo'
      using hint = format('Ese precio web queda por debajo de lo que cuestan: %s. Para venderlos más baratos, usa una campaña.', retail.fn_vitrina_lista_nombres(v_bajo_costo));
  end if;

  if cardinality(v_ids) > 0 then
    perform retail.fn_vitrina_anotar(
      'vitrina_precios',
      case when cardinality(v_nombres) = 1
        then 'cambió el precio web de «' || v_nombres[1] || '» a ' || retail.fn_vitrina_soles((v_detalle -> 0 ->> 'despues')::numeric)
        else 'cambió el precio web de ' || cardinality(v_nombres) || ' modelos: ' || retail.fn_vitrina_lista_nombres(v_nombres) end,
      v_actor,
      case when cardinality(v_ids) = 1 then v_ids[1]::text else gen_random_uuid()::text end,
      jsonb_build_object('precios', v_detalle));
  end if;

  return jsonb_build_object('cambiados', cardinality(v_ids));
end;
$fn$;
revoke all on function retail.vitrina_cambiar_precios(jsonb) from public, anon;
grant execute on function retail.vitrina_cambiar_precios(jsonb) to authenticated;

-- ---------- 8. El catálogo de la tienda (puerta angosta, ADR-0408) ----------
-- Lo publicado y que se puede vender, con su precio web y, si una campaña vigente toca alguna talla, el precio que paga el cliente
-- con la MISMA regla de la caja (la de mayor descuento por talla; el precio baja al múltiplo de S/ 0.10 de abajo, ADR-0403).
-- `precio`: lo menos que paga el cliente por una talla del modelo; `precio_hasta`: lo más (son iguales si la campaña toca todas
-- las tallas o ninguna). Los colores de sus tallas activas con su foto propia, y hasta dos fotos del modelo. Solo URL del almacén
-- PÚBLICO de fotos de prendas: nunca el enlace de otro almacén. Sin stock, sin costo y sin nada del ERP.
create or replace function retail.tienda_catalogo()
returns jsonb
language sql
stable
security definer
set search_path = retail, public
as $$
  with modelos as (
    select vp.producto_id as id, vp.precio_web, vp.publicado_en, p.referencia as nombre, p.codigo,
           c.nombre as categoria, c.prefijo
      from retail.vitrina_productos vp
      join retail.productos p on p.id = vp.producto_id
      left join retail.categorias c on c.id = p.categoria_id
     where vp.publicado
       and retail.fn_vitrina_publicable(vp.producto_id)
  ),
  tallas as (
    select v.id, v.producto_id, v.color_codigo
      from retail.variantes v
      join modelos m on m.id = v.producto_id
     where v.activo
  ),
  -- `coalesce(…, '{}')`: con la lista vacía la función no devuelve nada (con null devolvería las campañas de TODO el catálogo).
  campana as (
    select distinct on (x.variante_id) x.variante_id, x.etiqueta_nombre as nombre, x.descuento_pct as pct
      from retail.fn_campanas_por_variante(retail.fn_hoy_lima(), 0, coalesce((select array_agg(t.id) from tallas t), '{}'::uuid[])) x
     order by x.variante_id, x.descuento_pct desc, x.etiqueta_nombre, x.etiqueta_id
  ),
  precio as (
    select t.producto_id, ca.nombre, ca.pct,
           m.precio_web - retail.fn_descuento_campana(m.precio_web, ca.pct) as final
      from tallas t
      join modelos m on m.id = t.producto_id
      left join campana ca on ca.variante_id = t.id
  ),
  foto_ok as (
    select pf.producto_id, pf.color_codigo, pf.url, pf.es_principal, pf.orden, pf.created_at, pf.id
      from retail.producto_fotos pf
      join modelos m on m.id = pf.producto_id
     where pf.url ~ '^https?://[^/?#]+/storage/v1/object/public/retail-productos-fotos/'
  )
  select jsonb_build_object('prendas', coalesce(jsonb_agg(jsonb_build_object(
      'id', m.id,
      'codigo', m.codigo,
      'nombre', m.nombre,
      'categoria', case when m.categoria is null then null else jsonb_build_object('nombre', m.categoria, 'prefijo', m.prefijo) end,
      'precio_web', m.precio_web,
      'precio', pm.minimo,
      'precio_hasta', pm.maximo,
      'campana', case when pm.minimo < m.precio_web then (
        select jsonb_build_object('nombre', pr.nombre, 'pct', pr.pct)
          from precio pr
         where pr.producto_id = m.id and pr.pct is not null
         order by pr.final, pr.pct desc, pr.nombre
         limit 1) end,
      'colores', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'codigo', co.codigo, 'nombre', co.nombre, 'hex', co.hex,
                 'foto', (select f.url from foto_ok f where f.producto_id = m.id and f.color_codigo = co.codigo
                           order by f.es_principal desc, f.orden, f.created_at, f.id limit 1))
               order by co.orden, co.nombre)
          from retail.colores co
         where co.codigo in (select t.color_codigo from tallas t where t.producto_id = m.id)), '[]'::jsonb),
      'fotos', coalesce((
        select jsonb_agg(f.url order by f.n)
          from (select f.url, row_number() over (order by f.es_principal desc, f.orden, f.created_at, f.id) as n
                  from foto_ok f where f.producto_id = m.id) f
         where f.n <= 2), '[]'::jsonb)
    ) order by m.publicado_en desc, m.nombre, m.id), '[]'::jsonb))
  from modelos m
  join lateral (
    select min(pr.final) as minimo, max(pr.final) as maximo from precio pr where pr.producto_id = m.id
  ) pm on pm.minimo is not null
$$;

comment on function retail.tienda_catalogo() is
  'Tienda online (ADR-0408, actividad 3): lo publicado en la Vitrina web con su precio web y el de la campaña vigente (misma regla de la caja, ADR-0403), sus colores y hasta dos fotos. {prendas: [...]}. Solo la llama tienda_web.';

revoke all on function retail.tienda_catalogo() from public, anon, authenticated;
grant execute on function retail.tienda_catalogo() to tienda_web;

-- ---------- 9. Validación final: si algo no quedó, se deshace todo ----------
do $$
begin
  -- Que nazca SIN rol lo vigila `lib/modulos.test.ts` (ninguna migración escribe en `rol_modulos`); aquí no se mira, para que
  -- volver a pegar esta migración después de que el líder lo dé a un rol no falle.
  if not exists (select 1 from retail.modulos where clave = 'vitrina_web' and grupo = 'Catálogo' and delegable and not solo_lider) then
    raise exception 'vitrina web: falta el módulo vitrina_web';
  end if;
  if has_function_privilege('anon', 'retail.tienda_catalogo()', 'EXECUTE')
     or has_function_privilege('authenticated', 'retail.tienda_catalogo()', 'EXECUTE')
     or not has_function_privilege('tienda_web', 'retail.tienda_catalogo()', 'EXECUTE') then
    raise exception 'vitrina web: tienda_catalogo tiene que ser solo de tienda_web';
  end if;
  if has_table_privilege('tienda_web', 'retail.vitrina_productos', 'SELECT')
     or has_table_privilege('authenticated', 'retail.vitrina_productos', 'SELECT') then
    raise exception 'vitrina web: vitrina_productos se lee solo por sus funciones';
  end if;
end;
$$;

reset lock_timeout;
