-- Dónde se registró cada producto (Felipe, 2026-09-30, ADR-0292): «necesito ver dónde fue registrado, si en AQP o en TRU, ya que
-- comparten el mismo catálogo global y solo se diferencian en inventario».
--
-- EL PROBLEMA. `productos` es el catálogo de TODAS las sedes: no tiene sede, y no debe tenerla (principio 1: el núcleo
-- producto/variante/stock no se toca). Pero el almacén de una sede necesita saber si lo que aparece nuevo lo registró su propia
-- sede o la otra: para no crear dos veces la misma prenda, y para saber a quién preguntarle. Hoy ese dato no existe en ninguna parte:
-- las funciones de alta (`crear_producto_con_variantes`, `crear_producto_con_stock_inicial`, `censo_crear_variante`) no lo anotan.
--
-- LA DECISIÓN. Una tabla aparte, `producto_origen`, con UNA fila por producto: en qué sede se registró, desde qué terminal y quién lo
-- propuso. La llena un disparador sobre `productos`, así que cubre TODA forma de dar de alta un producto (las tres funciones de hoy, el
-- censo por lotes y cualquier INSERT futuro) sin reescribir ninguna de ellas; sus versiones vivas en producción no son las de ningún archivo
-- (ADR-0283) y tocarlas era el riesgo grande de la otra opción. NO va en `actividad` (ADR-0207): esa bitácora alimenta la pantalla
-- Actividad por módulo y meter ahí «producto_creado» obligaría a cambiar esa pantalla; esto es un dato del catálogo, no una línea de
-- actividad.
--
-- DE DÓNDE SALE LA SEDE (`fn_ubicacion_de_la_operacion`):
--   1. una TERMINAL: la tienda de la terminal (es un aparato fijo);
--   2. una PERSONA: la sede en la que está operando, que la web manda en `x-ubicacion` (el mismo encabezado que ya exige
--      `fn_actor_persona_id`), si puede operar en ella;
--   3. si no, la sede de partida de la persona (`fn_ubicacion_actual_persona`).
-- Si nada de eso la dice, la fila queda con sede vacía: se sabe QUE se registró pero no DÓNDE. Jamás se inventa.
--
-- NUNCA FRENA UN ALTA (principio 9): anotar el origen va dentro de su propio bloque con `exception`; si falla, el producto se crea igual
-- y queda un aviso en el log de la base.
--
-- SIN HISTORIA. Los productos que ya existen no tienen origen y no se les inventa uno: la pantalla no muestra sede en esos.
--
-- CÓMO LEERLA. La tabla tiene RLS encendido y SIN políticas (solo la tocan funciones `security definer`): una política nueva
-- toma en exclusiva las 21 tablas de `auth` y `storage` y puede chocar con el Asesor de seguridad del panel (ADR-0195). Se lee con
-- `fn_producto_origen(uuid[])`, que devuelve solo el producto, la sede y su nombre: el catálogo es de todos.
--
-- PARA PEGAR EN PRODUCCIÓN (una sola parte; no hay políticas): esta migración crea en el schema `retail` y no toca ninguna función
-- existente; es idempotente. Antes, ensayo con `begin; …; rollback;` (CLAUDE.md, «Cómo aplicar SQL a producción»).

set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- ---------- 1. La tabla ----------

create table if not exists retail.producto_origen (
  producto_id   uuid primary key references retail.productos(id) on delete cascade,
  ubicacion_id  uuid references retail.ubicaciones(id),
  terminal_id   uuid references retail.terminales(id),
  persona_id    uuid references public.personas(id),
  registrado_at timestamptz not null default now()
);

comment on table retail.producto_origen is
  'En qué sede se registró cada producto (una fila por producto). La llena el disparador trg_producto_anota_origen; sin historia: los productos anteriores a 20260930170000 no tienen fila. ubicacion_id vacío = se sabe que se registró pero no dónde. RLS sin políticas: solo se lee con fn_producto_origen(). ADR-0292.';
comment on column retail.producto_origen.ubicacion_id is 'La sede desde la que se operó al registrarlo (ver fn_ubicacion_de_la_operacion). NO es una sede «dueña» del producto: el catálogo es global.';
comment on column retail.producto_origen.persona_id is 'Quien propuso el producto (productos.propuesto_por en ese momento).';

create index if not exists producto_origen_ubicacion_idx on retail.producto_origen (ubicacion_id, registrado_at desc);

alter table retail.producto_origen enable row level security;
revoke all on retail.producto_origen from public, anon, authenticated;

-- ---------- 2. La sede desde la que se está operando ----------

create or replace function retail.fn_ubicacion_de_la_operacion() returns uuid
language plpgsql stable security definer set search_path = retail, public, extensions as $fn$
declare
  v_terminal_ubicacion uuid;
  v_headers jsonb;
  v_ubicacion uuid;
begin
  -- Una terminal es un aparato fijo a una tienda.
  select t.ubicacion_id into v_terminal_ubicacion from retail.fn_terminal_actual() t limit 1;
  if v_terminal_ubicacion is not null then
    return v_terminal_ubicacion;
  end if;
  -- Una persona opera en la sede que la web le manda en `x-ubicacion` (la misma que valida fn_actor_persona_id).
  begin
    v_headers := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
    v_ubicacion := nullif(trim(v_headers ->> 'x-ubicacion'), '')::uuid;
  exception when others then
    v_ubicacion := null;
  end;
  if v_ubicacion is not null and retail.fn_puede_operar_ubicacion(v_ubicacion) then
    return v_ubicacion;
  end if;
  -- Sin encabezado: donde parte la persona.
  return retail.fn_ubicacion_actual_persona();
end;
$fn$;

comment on function retail.fn_ubicacion_de_la_operacion() is
  'La sede desde la que se está operando: la tienda de la terminal, o la sede de x-ubicacion si la persona puede operar en ella, o su sede de partida; NULL si ninguna. Para anotar dónde se hizo algo (producto_origen). ADR-0292.';

-- ---------- 3. El disparador: cada producto nuevo anota su origen ----------

create or replace function retail.fn_producto_anota_origen() returns trigger
language plpgsql security definer set search_path = retail, public, extensions as $fn$
declare
  v_terminal uuid;
begin
  begin
    select t.id into v_terminal from retail.fn_terminal_actual() t limit 1;
    insert into retail.producto_origen (producto_id, ubicacion_id, terminal_id, persona_id, registrado_at)
    values (new.id, retail.fn_ubicacion_de_la_operacion(), v_terminal, new.propuesto_por, coalesce(new.created_at, now()))
    on conflict (producto_id) do nothing;
  exception when others then
    -- Anotar el origen no puede frenar un alta (principio 9): el producto se crea igual.
    raise warning 'producto_origen: no se pudo anotar el origen del producto %: %', new.id, sqlerrm;
  end;
  return new;
end;
$fn$;

comment on function retail.fn_producto_anota_origen() is
  'Disparador de productos: anota en producto_origen la sede, la terminal y la persona del alta. Nunca falla: si no puede anotar, el producto se crea igual. ADR-0292.';

create or replace trigger trg_producto_anota_origen
  after insert on retail.productos
  for each row execute function retail.fn_producto_anota_origen();

-- ---------- 4. La lectura ----------

create or replace function retail.fn_producto_origen(p_producto_ids uuid[])
returns table (producto_id uuid, ubicacion_id uuid, ubicacion_nombre text)
language sql stable security definer set search_path = retail, public, extensions as $fn$
  select o.producto_id, o.ubicacion_id, u.nombre
  from retail.producto_origen o
  left join retail.ubicaciones u on u.id = o.ubicacion_id
  where o.producto_id = any(p_producto_ids);
$fn$;

comment on function retail.fn_producto_origen(uuid[]) is
  'En qué sede se registró cada producto pedido (solo los que tienen origen anotado). El catálogo es de todos: cualquier cuenta con sesión lo lee. ADR-0292.';

revoke execute on function retail.fn_ubicacion_de_la_operacion() from public, anon;
revoke execute on function retail.fn_producto_anota_origen() from public, anon, authenticated;
revoke execute on function retail.fn_producto_origen(uuid[]) from public, anon;
grant execute on function retail.fn_ubicacion_de_la_operacion() to authenticated;
grant execute on function retail.fn_producto_origen(uuid[]) to authenticated;
