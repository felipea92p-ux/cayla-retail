-- ============================================================================
-- 20260915204541_historial_producto_cambios.sql — CAYLA V2
--
-- Historial de Producto (Sesión A3, mitad 2 de 2): además de sus movimientos
-- de stock, Felipe pidió ver cuándo cambió el precio o la categoría de un
-- producto (decisión de Felipe, 2026-09-15). Hoy `productos`/`variantes` no
-- tienen `updated_at` ni ningún log — un UPDATE pisa el valor anterior sin
-- dejar rastro.
--
-- Qué hace:
--   1. `retail.historial_producto_cambios`: ledger append-only (mismo
--      espíritu que `movimientos`, ver 20260914165703_movimientos_inmutables),
--      una fila por campo que cambió: qué entidad (producto o variante),
--      cuál, qué campo, de qué valor a qué valor, quién y cuándo.
--   2. Un trigger AFTER UPDATE en `productos` (categoria_id) y `variantes`
--      (precio) que inserta ahí solo cuando el valor realmente cambió.
--      Trigger, no una llamada explícita desde cada pantalla: así ninguna
--      pantalla que edite productos/variantes puede "olvidarse" de loguear
--      — ni la ficha que la sesión A1 construye ahora mismo en paralelo sin
--      coordinar código con esta migración, ni una futura importación
--      masiva. Decisión de Felipe (2026-09-15): trigger sobre log explícito.
--   3. `fn_historial_producto_cambios(p_producto_id)`: la lectura, con el
--      nombre de la persona resuelto (`personas` vive en `public`, otro
--      schema — mismo motivo que `fn_movimientos` es security definer).
--
-- SE ROMPE SI: se agrega otra columna a auditar (ej. `descripcion`,
-- `activo`, `estado`) sin sumarla también al trigger — a propósito solo
-- mira `categoria_id` y `precio`, el alcance exacto que pidió Felipe, no un
-- genérico "cualquier columna cambió" que meta ruido de cambios que no son
-- precio/categoría.
--
-- El historial empieza a contar desde que este trigger existe: no hay forma
-- de reconstruir cambios pasados que nunca se guardaron.
-- ============================================================================

set search_path = retail, public, extensions;

-- ---------- 1. El ledger ----------

create table retail.historial_producto_cambios (
  id uuid primary key default gen_random_uuid(),
  entidad text not null check (entidad in ('producto', 'variante')),
  entidad_id uuid not null,
  campo text not null,
  valor_anterior text,
  valor_nuevo text,
  usuario_id uuid references public.personas (id),
  created_at timestamptz not null default now()
);

create index historial_producto_cambios_entidad_idx
  on retail.historial_producto_cambios (entidad, entidad_id, created_at desc);

-- Solo se llega a esta tabla por trigger (security definer) o por lectura vía
-- `fn_historial_producto_cambios`; ninguna de las dos necesita privilegios
-- directos de `authenticated`/`anon` sobre la tabla.
alter table retail.historial_producto_cambios enable row level security;
revoke all on retail.historial_producto_cambios from authenticated, anon;

-- Igual de inmutable que `movimientos`: es un ledger, no se edita ni se borra.
create function retail.fn_historial_producto_cambios_inmutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'historial_producto_cambios es de solo lectura después de insertarse';
end;
$$;

create trigger historial_producto_cambios_sin_update
  before update or delete on retail.historial_producto_cambios
  for each row execute function retail.fn_historial_producto_cambios_inmutable();

-- ---------- 2. Captura: trigger en productos/variantes ----------

create function retail.fn_registrar_cambio_producto()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_usuario_id uuid;
begin
  select id into v_usuario_id from public.personas where auth_user_id = auth.uid();

  if TG_TABLE_NAME = 'productos' then
    if new.categoria_id is distinct from old.categoria_id then
      insert into retail.historial_producto_cambios (entidad, entidad_id, campo, valor_anterior, valor_nuevo, usuario_id)
      values ('producto', new.id, 'categoria_id', old.categoria_id::text, new.categoria_id::text, v_usuario_id);
    end if;
  elsif TG_TABLE_NAME = 'variantes' then
    if new.precio is distinct from old.precio then
      insert into retail.historial_producto_cambios (entidad, entidad_id, campo, valor_anterior, valor_nuevo, usuario_id)
      values ('variante', new.id, 'precio', old.precio::text, new.precio::text, v_usuario_id);
    end if;
  end if;
  return new;
end;
$$;

revoke all on function retail.fn_registrar_cambio_producto() from public;

create trigger productos_registrar_cambio
  after update on retail.productos
  for each row execute function retail.fn_registrar_cambio_producto();

create trigger variantes_registrar_cambio
  after update on retail.variantes
  for each row execute function retail.fn_registrar_cambio_producto();

-- ---------- 3. Lectura ----------

create function retail.fn_historial_producto_cambios(p_producto_id uuid)
returns table (
  id uuid,
  created_at timestamptz,
  entidad text,
  campo text,
  valor_anterior text,
  valor_nuevo text,
  categoria_anterior_nombre text,
  categoria_nueva_nombre text,
  variante_id uuid,
  variante_sku text,
  variante_talla text,
  variante_color text,
  usuario_id uuid,
  usuario_nombre text
)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select
    h.id,
    h.created_at,
    h.entidad,
    h.campo,
    h.valor_anterior,
    h.valor_nuevo,
    cat_ant.nombre,
    cat_nue.nombre,
    case when h.entidad = 'variante' then h.entidad_id end,
    va.sku,
    va.talla,
    co.nombre,
    h.usuario_id,
    per.nombres || ' ' || per.apellidos
  from retail.historial_producto_cambios h
  left join retail.variantes va on h.entidad = 'variante' and va.id = h.entidad_id
  left join retail.colores co on co.codigo = va.color_codigo
  -- `case when` (no `and` en el join): en Postgres el orden de evaluación de un
  -- `and` no está garantizado, y castear "99.90" (un cambio de precio) a uuid
  -- reventaría la fila entera. El `case` sí evalúa una sola rama.
  left join retail.categorias cat_ant on cat_ant.id = case when h.campo = 'categoria_id' then h.valor_anterior::uuid end
  left join retail.categorias cat_nue on cat_nue.id = case when h.campo = 'categoria_id' then h.valor_nuevo::uuid end
  left join public.personas per on per.id = h.usuario_id
  where
    (h.entidad = 'producto' and h.entidad_id = p_producto_id)
    or (h.entidad = 'variante' and va.producto_id = p_producto_id)
  order by h.created_at desc;
$$;

revoke all on function retail.fn_historial_producto_cambios(uuid) from public;
grant execute on function retail.fn_historial_producto_cambios(uuid) to authenticated;

comment on table retail.historial_producto_cambios is
  'Ledger append-only de cambios a precio (variantes) y categoría (productos). Se llena solo por trigger (fn_registrar_cambio_producto); nunca se inserta ni edita a mano. Inmutable por trigger propio.';
comment on function retail.fn_historial_producto_cambios(uuid) is
  'Historial de cambios de precio/categoría de un producto y todas sus variantes, con el nombre de quién lo hizo y el nombre de la categoría anterior/nueva resueltos. No pagina: volumen esperado bajo por producto.';
