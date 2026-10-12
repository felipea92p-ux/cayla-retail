-- ============================================================================
-- 20261010100000_precio_propio_por_sede.sql — CAYLA V2 (Felipe, 2026-10-09)
--
-- EL PROBLEMA. En Arequipa a veces se vende una prenda a otro precio que en Trujillo, y el ERP tiene UN solo precio por
-- variante (`variantes.precio`) para todas las sedes. Hoy la única salida es cambiar el precio de todos o dar un
-- descuento en la caja, y las dos mienten: la primera cambia Trujillo, la segunda dice «descuento» donde no lo hay.
--
-- LAS DECISIONES (Felipe, 2026-10-09):
--   · Un precio de sede REEMPLAZA al general en esa tienda; no es un descuento ni un recargo. El cliente ve un solo precio.
--   · Lo pone quien ve el módulo «Productos» (ADR-0306: es una acción dentro de Editar producto), SOLO para su propia sede;
--     el líder, para cualquiera (`fn_puede_operar_ubicacion`). Motivo obligatorio y firma del Responsable (ADR-0162).
--   · Es para la PRENDA ENTERA (todas sus variantes al mismo precio); se guarda por variante para que el candado de la
--     venta compare variante contra variante, igual que hoy.
--   · Vale hasta que alguien lo quite. Quitar ARCHIVA la fila (nunca se borra): la tabla misma es su historia.
--
-- LO QUE HACE:
--   1. `precios_sede`: una fila por variante y sede con precio propio. Solo una vigente por par (índice parcial). Una fila
--      no se edita: cambiar el precio archiva la vigente y crea otra. No se borra (disparador).
--   2. `fn_precio_en_sede(variante, sede)`: EL precio de una prenda en una tienda — el de la sede si existe, si no el
--      general. Es la única regla; Vender, el candado de la venta, Apartados, Cambios, etiquetas y Existencias la usan.
--   3. `poner_precio_sede(producto, sede, precio, motivo)` y `quitar_precio_sede(producto, sede, motivo)`: las dos únicas
--      formas de escribir. Anotan cada variante en el historial de la prenda (`historial_producto_cambios`, campo
--      `precio_sede`), que a su vez alimenta Actividad (`trg_actividad_historial_producto`).
--   4. Lecturas: `fn_precios_sede_producto(producto)` (la ficha: qué sedes tienen precio propio, desde cuándo, por qué y
--      quién) y `fn_precios_en_sede(sede)` (las pantallas de una tienda: qué variantes cambian de precio ahí).
--
-- POR QUÉ SIN POLÍTICAS. Nadie lee ni escribe la tabla directo: todo pasa por las funciones `security definer` de abajo.
-- RLS queda encendido sin políticas (ADR-0195): así no hace falta una segunda parte para producción.
--
-- PRODUCCIÓN. Una sola parte, re-ejecutable, `lock_timeout = 3s`. Toma candados breves de `variantes` y `ubicaciones`
-- (las llaves foráneas de la tabla nueva); ninguna política, ningún `drop trigger`. Prueba: `pnpm pruebas:precio-sede`.
-- SE ROMPE SI: alguien escribe en `precios_sede` sin pasar por estas funciones (no puede: sin políticas ni grants).
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- ---------- 1. La tabla ----------

create table if not exists retail.precios_sede (
  id            uuid primary key default gen_random_uuid(),
  variante_id   uuid not null references retail.variantes (id),
  ubicacion_id  uuid not null references retail.ubicaciones (id),
  precio        numeric(12,2) not null,
  motivo        text not null,
  creado_por    uuid references public.personas (id),
  created_at    timestamptz not null default now(),
  archivado_en  timestamptz,
  archivado_por uuid references public.personas (id),
  constraint precios_sede_precio_positivo check (precio > 0),
  constraint precios_sede_motivo_no_vacio check (length(btrim(motivo)) >= 3)
);

comment on table retail.precios_sede is
  'Precio propio de una prenda en una tienda (Felipe 2026-10-09). Reemplaza a variantes.precio SOLO en esa sede. Se lee con fn_precio_en_sede; se escribe solo con poner_precio_sede / quitar_precio_sede.';
comment on column retail.precios_sede.archivado_en is
  'Cuándo dejó de valer (se quitó o se reemplazó por otro precio). Vacío = vigente. Nunca se borra la fila.';

-- Una sola vigente por variante y sede.
create unique index if not exists precios_sede_vigente_unico
  on retail.precios_sede (variante_id, ubicacion_id) where archivado_en is null;
create index if not exists precios_sede_ubicacion_vigente_idx
  on retail.precios_sede (ubicacion_id) where archivado_en is null;

alter table retail.precios_sede enable row level security;
revoke all on table retail.precios_sede from public, anon, authenticated;

-- Una fila no se borra ni se reescribe: solo se archiva una vez.
create or replace function retail.fn_precios_sede_inmutable() returns trigger
language plpgsql set search_path = retail, public, extensions as $fn$
begin
  if tg_op = 'DELETE' then
    raise exception 'Un precio de sede no se borra: se quita (queda archivado).';
  end if;
  if old.archivado_en is not null
     or new.variante_id <> old.variante_id or new.ubicacion_id <> old.ubicacion_id
     or new.precio <> old.precio or new.motivo <> old.motivo
     or new.creado_por is distinct from old.creado_por or new.created_at <> old.created_at then
    raise exception 'Un precio de sede no se edita: se quita y se pone otro.';
  end if;
  return new;
end;
$fn$;

create or replace trigger precios_sede_inmutable
  before update or delete on retail.precios_sede
  for each row execute function retail.fn_precios_sede_inmutable();

-- ---------- 2. EL precio de una prenda en una tienda ----------

create or replace function retail.fn_precio_en_sede(p_variante_id uuid, p_ubicacion_id uuid) returns numeric
language sql stable security definer set search_path = retail, public, extensions as $$
  select coalesce(
    (select ps.precio from retail.precios_sede ps
      where ps.variante_id = p_variante_id and ps.ubicacion_id = p_ubicacion_id and ps.archivado_en is null),
    (select v.precio from retail.variantes v where v.id = p_variante_id)
  );
$$;
revoke all on function retail.fn_precio_en_sede(uuid, uuid) from public, anon;
grant execute on function retail.fn_precio_en_sede(uuid, uuid) to authenticated;

-- ---------- 3. Escribir ----------

-- Lo que comparten poner y quitar: módulo, sede propia, tienda activa y la prenda bloqueada (dos pestañas a la vez se
-- ponen en fila en vez de chocar en el índice único).
create or replace function retail.fn_precio_sede_exigir(p_producto_id uuid, p_ubicacion_id uuid) returns void
language plpgsql security definer set search_path = retail, public, extensions as $fn$
declare
  v_tipo text;
  v_activa boolean;
begin
  perform retail.fn_exigir_modulo('productos');
  for v_tipo, v_activa in select u.tipo, u.activo from retail.ubicaciones u where u.id = p_ubicacion_id loop
    exit;
  end loop;
  if v_tipo is null then
    raise exception 'Esa sede no existe.';
  end if;
  if v_tipo <> 'tienda' or not v_activa then
    raise exception 'Solo una tienda abierta puede tener precio propio.';
  end if;
  if retail.fn_puede_operar_ubicacion(p_ubicacion_id) is not true then
    raise exception 'Solo puedes cambiar el precio de tu propia tienda. Pídele al líder el de otra sede.'
      using errcode = '42501';
  end if;
  perform 1 from retail.productos p where p.id = p_producto_id for update;
  if not found then
    raise exception 'Esa prenda no existe.';
  end if;
end;
$fn$;
revoke all on function retail.fn_precio_sede_exigir(uuid, uuid) from public, anon, authenticated;

-- Anota en el historial de la prenda (y por él, en Actividad). Valor = {"sede","tienda","precio","propio"[,"motivo"]}: el
-- nombre de la tienda va adentro para que el historial y Actividad la nombren sin otra consulta (y como se llamaba ese día).
create or replace function retail.fn_precio_sede_anotar(
  p_variante_id uuid, p_ubicacion_id uuid, p_antes numeric, p_antes_propio boolean,
  p_despues numeric, p_despues_propio boolean, p_motivo text, p_actor uuid
) returns void
language plpgsql security definer set search_path = retail, public, extensions as $fn$
declare
  v_tienda text := (select u.nombre from retail.ubicaciones u where u.id = p_ubicacion_id);
begin
  insert into retail.historial_producto_cambios (entidad, entidad_id, campo, valor_anterior, valor_nuevo, usuario_id)
  values ('variante', p_variante_id, 'precio_sede',
          jsonb_build_object('sede', p_ubicacion_id, 'tienda', v_tienda, 'precio', p_antes, 'propio', p_antes_propio)::text,
          jsonb_strip_nulls(jsonb_build_object('sede', p_ubicacion_id, 'tienda', v_tienda, 'precio', p_despues,
                                               'propio', p_despues_propio, 'motivo', nullif(btrim(p_motivo), '')))::text,
          p_actor);
end;
$fn$;
revoke all on function retail.fn_precio_sede_anotar(uuid, uuid, numeric, boolean, numeric, boolean, text, uuid)
  from public, anon, authenticated;

-- Pone el MISMO precio a todas las variantes activas de la prenda en esa sede. Devuelve cuántas cambiaron.
-- Una variante cuyo precio general ya es ese no lleva precio propio (si tenía uno, se quita): así «igual al general»
-- nunca queda guardado como excepción.
create or replace function retail.poner_precio_sede(
  p_producto_id uuid, p_ubicacion_id uuid, p_precio numeric, p_motivo text
) returns integer
language plpgsql security definer set search_path = retail, public, extensions as $fn$
declare
  v_actor uuid;
  v_precio numeric(12,2) := round(p_precio, 2);
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_var record;
  v_vig_id uuid;
  v_vig_precio numeric;
  v_cambiadas integer := 0;
  v_alguna_distinta boolean := false;
begin
  if p_precio is null or v_precio <= 0 then
    raise exception 'Escribe un precio mayor que cero.';
  end if;
  if length(v_motivo) < 3 then
    raise exception 'Escribe por qué esta tienda tiene otro precio.';
  end if;
  perform retail.fn_precio_sede_exigir(p_producto_id, p_ubicacion_id);
  v_actor := retail.fn_actor_persona_id(true);

  for v_var in
    select v.id, v.precio from retail.variantes v where v.producto_id = p_producto_id and v.activo order by v.id
  loop
    v_vig_id := null;
    v_vig_precio := null;
    for v_vig_id, v_vig_precio in
      select ps.id, ps.precio from retail.precios_sede ps
       where ps.variante_id = v_var.id and ps.ubicacion_id = p_ubicacion_id and ps.archivado_en is null
    loop
      exit;
    end loop;

    if v_var.precio <> v_precio then
      v_alguna_distinta := true;
    end if;

    -- Ya está a ese precio en esta sede: nada que hacer.
    if coalesce(v_vig_precio, v_var.precio) = v_precio then
      continue;
    end if;

    if v_vig_id is not null then
      update retail.precios_sede set archivado_en = now(), archivado_por = v_actor where id = v_vig_id;
    end if;
    if v_var.precio <> v_precio then
      insert into retail.precios_sede (variante_id, ubicacion_id, precio, motivo, creado_por)
      values (v_var.id, p_ubicacion_id, v_precio, v_motivo, v_actor);
    end if;
    perform retail.fn_precio_sede_anotar(v_var.id, p_ubicacion_id,
      coalesce(v_vig_precio, v_var.precio), v_vig_id is not null,
      v_precio, v_var.precio <> v_precio, v_motivo, v_actor);
    v_cambiadas := v_cambiadas + 1;
  end loop;

  if v_cambiadas = 0 and not v_alguna_distinta then
    raise exception 'Ese ya es el precio general de la prenda: no hace falta un precio propio para esta tienda.';
  end if;
  return v_cambiadas;
end;
$fn$;
revoke all on function retail.poner_precio_sede(uuid, uuid, numeric, text) from public, anon;
grant execute on function retail.poner_precio_sede(uuid, uuid, numeric, text) to authenticated;

-- La prenda vuelve al precio general en esa sede. Devuelve cuántas variantes volvieron (0 si no tenía precio propio).
create or replace function retail.quitar_precio_sede(
  p_producto_id uuid, p_ubicacion_id uuid, p_motivo text default null
) returns integer
language plpgsql security definer set search_path = retail, public, extensions as $fn$
declare
  v_actor uuid;
  v_fila record;
  v_n integer := 0;
begin
  perform retail.fn_precio_sede_exigir(p_producto_id, p_ubicacion_id);
  v_actor := retail.fn_actor_persona_id(true);

  for v_fila in
    select ps.id, ps.variante_id, ps.precio, v.precio as general
      from retail.precios_sede ps
      join retail.variantes v on v.id = ps.variante_id
     where v.producto_id = p_producto_id and ps.ubicacion_id = p_ubicacion_id and ps.archivado_en is null
  loop
    update retail.precios_sede set archivado_en = now(), archivado_por = v_actor where id = v_fila.id;
    perform retail.fn_precio_sede_anotar(v_fila.variante_id, p_ubicacion_id, v_fila.precio, true,
      v_fila.general, false, p_motivo, v_actor);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$fn$;
revoke all on function retail.quitar_precio_sede(uuid, uuid, text) from public, anon;
grant execute on function retail.quitar_precio_sede(uuid, uuid, text) to authenticated;

-- ---------- 4. Leer ----------

-- La ficha: una fila por sede con precio propio vigente (la prenda entera, así que normalmente un solo precio por sede;
-- si las variantes difieren —no debería—, sale una fila por precio). Lo lee cualquiera que ve la ficha.
create or replace function retail.fn_precios_sede_producto(p_producto_id uuid)
returns table (
  ubicacion_id uuid, sede text, precio numeric, variantes integer,
  desde timestamptz, motivo text, creado_por_nombre text
)
language sql stable security definer set search_path = retail, public, extensions as $$
  select ps.ubicacion_id, u.nombre, ps.precio, count(*)::integer,
         min(ps.created_at),
         (array_agg(ps.motivo order by ps.created_at desc))[1],
         (array_agg(nullif(btrim(concat_ws(' ', pe.nombres, pe.apellidos)), '') order by ps.created_at desc))[1]
    from retail.precios_sede ps
    join retail.variantes v on v.id = ps.variante_id
    join retail.ubicaciones u on u.id = ps.ubicacion_id
    left join public.personas pe on pe.id = ps.creado_por
   where v.producto_id = p_producto_id and ps.archivado_en is null and auth.uid() is not null
   group by ps.ubicacion_id, u.nombre, ps.precio
   order by u.nombre, ps.precio;
$$;
revoke all on function retail.fn_precios_sede_producto(uuid) from public, anon;
grant execute on function retail.fn_precios_sede_producto(uuid) to authenticated;

-- Las pantallas de una tienda: qué variantes tienen otro precio ahí. Lista corta (solo las excepciones).
create or replace function retail.fn_precios_en_sede(p_ubicacion_id uuid)
returns table (variante_id uuid, precio numeric)
language sql stable security definer set search_path = retail, public, extensions as $$
  select ps.variante_id, ps.precio
    from retail.precios_sede ps
   where ps.ubicacion_id = p_ubicacion_id and ps.archivado_en is null and auth.uid() is not null;
$$;
revoke all on function retail.fn_precios_en_sede(uuid) from public, anon;
grant execute on function retail.fn_precios_en_sede(uuid) to authenticated;
