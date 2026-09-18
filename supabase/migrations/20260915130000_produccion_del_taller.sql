-- ============================================================================
-- 20260915130000_produccion_del_taller.sql — CAYLA V2
--
-- Producción del Taller vuelve a existir. V1 la tenía (0018 … 0031, borradas
-- en 0af2f1b con el corte a V2) y V2 la dejó afuera a propósito: no tenía
-- pantalla propia y su data era de prueba. Pedido de Felipe (2026-09-15):
-- restaurarla — sobre el modelo V2 (`ubicaciones`, `sububicaciones`,
-- `fn_aplicar_movimiento`), no resucitando el de V1 (`sedes`/`unidad_id`).
--
-- ORIGEN DE ESTE ARCHIVO. La migración se aplicó en una base local el
-- 2026-09-15 (`supabase_migrations.schema_migrations` la registraba con la
-- versión `20260915120000`) pero el archivo .sql no llegó a ningún branch:
-- se reconstruyó leyendo la base (pg_dump de las tablas + pg_get_functiondef
-- de las RPC + pg_policies + grants). Es la misma definición, carácter por
-- carácter en lo que a Postgres le importa; los comentarios de cabecera son
-- nuevos.
--
-- RENUMERADA el 2026-09-15 al fusionar con la rama de Movimientos: las dos
-- sesiones eligieron `20260915120000` en paralelo, sin verse — esa versión
-- ya estaba tomada en producción por `reparar_fk_transferencia_items.sql`
-- (aplicada esa misma tarde, con el ok de Felipe). `schema_migrations` clava
-- por el timestamp solo; dos archivos con el mismo valor rompen `db reset`
-- con `duplicate key`. Se corrió esta, no la otra: la otra ya estaba escrita
-- en producción y en un `INSERT` que ya existía; esta seguía sin aplicar en
-- ningún lado con el mecanismo del CLI. El nombre del archivo cambió; el
-- contenido de la migración, no.
--
-- Qué hace:
--   · `ubicaciones.tipo` gana el valor 'taller' (el check era tienda|almacen) y
--     la fila «Taller» pasa de almacen a taller. Antes el Taller era "un
--     almacén más"; ahora es la única ubicación donde `abrir_produccion`
--     acepta abrir una corrida — el stock NACE ahí, no llega por traslado.
--   · `producciones` — la cabecera de una corrida: qué modelo, en qué Taller,
--     cuánto se planeó (`cantidad_plan`), cuántas salieron buenas
--     (`cantidad_buenas`, null hasta cerrar), los tres costos directos y el
--     `costo_unitario` GENERADO sobre las buenas (o el plan mientras no cierre):
--     la merma se absorbe sola, nadie teclea el costo por prenda.
--   · `produccion_lineas` — el desglose por variante (talla+color): plan y buenas.
--   · `movimientos.produccion_id` — cada entrada por producción apunta a su orden.
--   · 5 RPC security definer, la ÚNICA puerta de escritura (sin policy de
--     insert/update/delete): abrir, set_etapa, cerrar, anular, revertir.
--
-- Ciclo: en_proceso ─cerrar─▶ terminada (entrada en `movimientos`, motivo
-- 'produccion', salvo muestra) ─revertir─▶ en_proceso (salida
-- 'reversion_produccion'). en_proceso ─anular─▶ anulada (sin tocar stock).
-- El candado del doble conteo es `inventariado_at`: `cerrar_produccion` se
-- niega si ya tiene fecha. El check `producciones_terminada_coherente` hace
-- imposible una fila "terminada sin buenas" o "en proceso con inventariado_at".
--
-- D-31 / D-45: al cerrar, el costo REAL de la corrida se pega a
-- `variantes.costo` de cada talla producida — es el costo que viaja con la
-- prenda a las tiendas (`transferir` no lo recalcula).
--
-- ESTADO: aplicada en la base local el 2026-09-15. NO en producción — la pega
-- Felipe (D-11); ya lleva el prefijo `retail.`. No toca RPC existentes; el
-- único cambio sobre lo que ya hay es el check de `ubicaciones.tipo`, que se
-- AMPLÍA (nada que hoy sea válido deja de serlo) y el `update` de la fila
-- Taller. Regla de oro: entra al diccionario cuando se aplique allá.
-- SE ROMPE SI: alguien vuelve a poner el Taller como 'almacen' (abrir_produccion
-- responde «Solo el Taller abre órdenes» aunque la fila se llame Taller);
-- si `fn_sububicacion_por_defecto(uuid, text)` (20260914230000)
-- o `fn_aplicar_movimiento(uuid)` (0003) cambian de firma — cerrar/revertir
-- los llaman; o si el Taller deja de tener `ubicaciones.tipo = 'taller'`.
-- ============================================================================

set search_path = retail, public, extensions;

-- ---------- el Taller deja de ser "un almacén más" ----------
alter table retail.ubicaciones drop constraint ubicaciones_tipo_check;
alter table retail.ubicaciones
  add constraint ubicaciones_tipo_check check (tipo in ('tienda', 'almacen', 'taller'));

-- En producción y en el seed local hay exactamente una fila «Taller», de tipo
-- almacen (verificado contra producción el 2026-09-15). Un almacén real que
-- alguien cree después con otro nombre no se toca.
update retail.ubicaciones set tipo = 'taller' where nombre = 'Taller' and tipo = 'almacen';

-- ---------- producciones ----------
create table retail.producciones (
  id              uuid primary key default gen_random_uuid(),
  ubicacion_id    uuid not null references retail.ubicaciones (id),
  producto_id     uuid not null references retail.productos (id),
  estado          text not null default 'en_proceso'
                  check (estado in ('en_proceso', 'terminada', 'anulada')),
  es_muestra      boolean not null default false,
  -- {etapa: estado} — ej. {"corte":"hecho","confeccion":"tercerizado"}.
  etapas          jsonb not null default '{}',
  costo_tela      numeric(12,2) not null default 0 check (costo_tela >= 0),
  costo_avios     numeric(12,2) not null default 0 check (costo_avios >= 0),
  costo_maquila   numeric(12,2) not null default 0 check (costo_maquila >= 0),
  cantidad_plan   integer not null check (cantidad_plan > 0),
  cantidad_buenas integer check (cantidad_buenas is null or cantidad_buenas > 0),
  costo_unitario  numeric(12,2) generated always as (
                    round((costo_tela + costo_avios + costo_maquila) / coalesce(cantidad_buenas, cantidad_plan), 2)
                  ) stored,
  fecha_entrega   date,
  nota            text,
  inventariado_at timestamptz,
  token_cliente   uuid unique,
  creado_por      uuid references public.personas (id),
  created_at      timestamptz not null default now(),
  constraint producciones_terminada_coherente check (
    (estado = 'terminada' and cantidad_buenas is not null)
    or (estado <> 'terminada' and cantidad_buenas is null and inventariado_at is null)
  )
);

comment on table retail.producciones is
  'Una corrida del Taller: qué modelo, cuántas por talla-color (produccion_lineas), cuánto costó y si ya entró al stock. Se escribe SOLO por RPC.';

create index producciones_ubicacion_estado_idx on retail.producciones (ubicacion_id, estado, created_at desc);
create index producciones_producto_idx on retail.producciones (producto_id);

-- ---------- produccion_lineas ----------
create table retail.produccion_lineas (
  id              uuid primary key default gen_random_uuid(),
  produccion_id   uuid not null references retail.producciones (id),
  variante_id     uuid not null references retail.variantes (id),
  cantidad_plan   integer not null check (cantidad_plan > 0),
  cantidad_buenas integer check (cantidad_buenas is null or cantidad_buenas >= 0),
  created_at      timestamptz not null default now(),
  -- La misma talla-color no aparece dos veces en una orden: abrir_produccion
  -- agrupa antes de insertar, y este unique lo garantiza aunque alguien no.
  unique (produccion_id, variante_id)
);

create index produccion_lineas_variante_idx on retail.produccion_lineas (variante_id);

-- ---------- movimientos: de qué orden salió esta entrada ----------
alter table retail.movimientos
  add column produccion_id uuid references retail.producciones (id);

create index movimientos_produccion_idx on retail.movimientos (produccion_id) where produccion_id is not null;

-- ---------- RLS: se lee según fn_puede_operar_ubicacion; se escribe solo por RPC ----------
alter table retail.producciones enable row level security;
alter table retail.produccion_lineas enable row level security;

create policy producciones_select on retail.producciones
  for select using (retail.fn_puede_operar_ubicacion(ubicacion_id));

create policy produccion_lineas_select on retail.produccion_lineas
  for select using (
    exists (
      select 1 from retail.producciones p
      where p.id = produccion_lineas.produccion_id
        and retail.fn_puede_operar_ubicacion(p.ubicacion_id)
    )
  );

-- Mismo esquema de grants que el resto de retail (0005): el rol tiene los
-- privilegios de tabla, pero sin policy de insert/update/delete RLS no deja
-- pasar nada que no venga por una RPC security definer.
grant select, insert, update, delete on retail.producciones to authenticated;
grant select, insert, update, delete on retail.produccion_lineas to authenticated;
grant all on retail.producciones to service_role;
grant all on retail.produccion_lineas to service_role;

-- ---------- abrir_produccion ----------
-- p_lineas: [{variante_id, cantidad}, …]. Devuelve el id de la orden.
-- p_token: idempotencia — un reintento del formulario devuelve la misma orden.
create or replace function retail.abrir_produccion(
  p_ubicacion_id uuid,
  p_producto_id uuid,
  p_lineas jsonb,
  p_costo_tela numeric default 0,
  p_costo_avios numeric default 0,
  p_costo_maquila numeric default 0,
  p_es_muestra boolean default false,
  p_fecha_entrega date default null,
  p_nota text default null,
  p_token uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_id uuid; v_persona uuid; v_linea jsonb; v_total integer := 0; v_tipo text;
begin
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para abrir órdenes en esa ubicación';
  end if;
  select tipo into v_tipo from ubicaciones where id = p_ubicacion_id and activo;
  if v_tipo is distinct from 'taller' then
    raise exception 'Solo el Taller abre órdenes de producción';
  end if;
  if p_lineas is null or jsonb_array_length(p_lineas) = 0 then
    raise exception 'Una orden necesita al menos una talla o color con su cantidad';
  end if;

  -- Idempotencia: el mismo token devuelve la orden que ya se abrió.
  if p_token is not null then
    select id into v_id from producciones where token_cliente = p_token;
    if found then return v_id; end if;
  end if;

  -- Cada línea tiene que ser una variante DEL modelo elegido; sin esto una
  -- orden de "Blusa Lino" podría sumar stock a una talla de "Pantalón".
  for v_linea in select * from jsonb_array_elements(p_lineas) loop
    if (v_linea ->> 'cantidad')::integer is null or (v_linea ->> 'cantidad')::integer <= 0 then
      raise exception 'Cada línea necesita una cantidad mayor que cero';
    end if;
    if not exists (
      select 1 from variantes where id = (v_linea ->> 'variante_id')::uuid and producto_id = p_producto_id
    ) then
      raise exception 'Una de las tallas no pertenece al modelo elegido';
    end if;
    v_total := v_total + (v_linea ->> 'cantidad')::integer;
  end loop;

  select id into v_persona from personas where auth_user_id = auth.uid();

  insert into producciones (
    ubicacion_id, producto_id, cantidad_plan, costo_tela, costo_avios, costo_maquila,
    es_muestra, fecha_entrega, nota, token_cliente, creado_por
  ) values (
    p_ubicacion_id, p_producto_id, v_total, coalesce(p_costo_tela, 0), coalesce(p_costo_avios, 0),
    coalesce(p_costo_maquila, 0), coalesce(p_es_muestra, false), p_fecha_entrega,
    nullif(btrim(p_nota), ''), p_token, v_persona
  ) returning id into v_id;

  -- Misma variante dos veces en el formulario: se suma, no se duplica.
  insert into produccion_lineas (produccion_id, variante_id, cantidad_plan)
  select v_id, (l ->> 'variante_id')::uuid, sum((l ->> 'cantidad')::integer)
  from jsonb_array_elements(p_lineas) l
  group by (l ->> 'variante_id')::uuid;

  return v_id;
end;
$$;

-- ---------- set_etapa_produccion ----------
-- Etapas de muestra: patronaje, muestra, escalado. De producción: corte,
-- confeccion, acabado. Estado: pendiente | hecho | tercerizado.
create or replace function retail.set_etapa_produccion(p_produccion_id uuid, p_etapa text, p_estado text)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_orden producciones%rowtype;
begin
  if p_etapa not in ('patronaje', 'muestra', 'escalado', 'corte', 'confeccion', 'acabado') then
    raise exception 'Etapa inválida';
  end if;
  if p_estado not in ('pendiente', 'hecho', 'tercerizado') then
    raise exception 'Estado de etapa inválido';
  end if;
  select * into v_orden from producciones where id = p_produccion_id for update;
  if not found then raise exception 'La orden no existe'; end if;
  if not fn_puede_operar_ubicacion(v_orden.ubicacion_id) then
    raise exception 'No tienes permiso sobre las órdenes de ese Taller';
  end if;
  if v_orden.estado <> 'en_proceso' then
    raise exception 'Solo una orden en proceso cambia de etapa';
  end if;
  update producciones
    set etapas = etapas || jsonb_build_object(p_etapa, p_estado)
    where id = p_produccion_id;
end;
$$;

-- ---------- cerrar_produccion ----------
-- p_buenas: [{variante_id, cantidad}, …] — cuántas salieron buenas por talla.
-- Los costos que lleguen null conservan el estimado de la apertura.
create or replace function retail.cerrar_produccion(
  p_produccion_id uuid,
  p_buenas jsonb,
  p_costo_tela numeric,
  p_costo_avios numeric,
  p_costo_maquila numeric
)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_orden producciones%rowtype; v_persona uuid; v_b jsonb; v_total integer := 0;
  v_linea produccion_lineas%rowtype; v_mov uuid; v_sub uuid; v_costo numeric;
begin
  select * into v_orden from producciones where id = p_produccion_id for update;
  if not found then raise exception 'La orden no existe'; end if;
  if not fn_puede_operar_ubicacion(v_orden.ubicacion_id) then
    raise exception 'No tienes permiso sobre las órdenes de ese Taller';
  end if;
  -- El candado del doble conteo: un segundo clic no vuelve a sumar las mismas prendas.
  if v_orden.estado <> 'en_proceso' or v_orden.inventariado_at is not null then
    raise exception 'Esta orden ya está cerrada';
  end if;
  if p_buenas is null or jsonb_array_length(p_buenas) = 0 then
    raise exception 'Indica cuántas salieron buenas de cada talla';
  end if;

  -- Las buenas se anotan línea por línea; una variante que no era de la orden se rechaza.
  for v_b in select * from jsonb_array_elements(p_buenas) loop
    if (v_b ->> 'cantidad')::integer is null or (v_b ->> 'cantidad')::integer < 0 then
      raise exception 'Las buenas de cada talla son cero o más';
    end if;
    update produccion_lineas set cantidad_buenas = (v_b ->> 'cantidad')::integer
      where produccion_id = p_produccion_id and variante_id = (v_b ->> 'variante_id')::uuid;
    if not found then
      raise exception 'Una de las tallas no pertenece a esta orden';
    end if;
  end loop;
  -- Línea que el formulario no mandó = ninguna buena. Así toda línea queda contestada.
  update produccion_lineas set cantidad_buenas = 0
    where produccion_id = p_produccion_id and cantidad_buenas is null;

  select coalesce(sum(cantidad_buenas), 0) into v_total from produccion_lineas where produccion_id = p_produccion_id;
  if v_total = 0 then
    raise exception 'No salió ninguna prenda buena — si la corrida se perdió, anula la orden en vez de cerrarla';
  end if;

  update producciones
    set cantidad_buenas = v_total,
        costo_tela = coalesce(p_costo_tela, costo_tela),
        costo_avios = coalesce(p_costo_avios, costo_avios),
        costo_maquila = coalesce(p_costo_maquila, costo_maquila),
        estado = 'terminada',
        inventariado_at = case when es_muestra then null else now() end
    where id = p_produccion_id;

  -- Una muestra se da por terminada y no toca el stock ni el costo de la prenda.
  if v_orden.es_muestra then return; end if;

  select costo_unitario into v_costo from producciones where id = p_produccion_id;
  select id into v_persona from personas where auth_user_id = auth.uid();
  v_sub := fn_sububicacion_por_defecto(v_orden.ubicacion_id, 'entrada');

  for v_linea in
    select * from produccion_lineas where produccion_id = p_produccion_id and cantidad_buenas > 0
  loop
    insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, produccion_id, usuario_id)
      values (v_linea.variante_id, v_orden.ubicacion_id, v_sub, 'entrada', v_linea.cantidad_buenas, 'produccion', p_produccion_id, v_persona)
      returning id into v_mov;
    perform fn_aplicar_movimiento(v_mov);

    -- D-31 / D-45: el costo REAL de la corrida se pega a la prenda y viaja con ella.
    update variantes set costo = v_costo where id = v_linea.variante_id;
  end loop;
end;
$$;

-- ---------- anular_produccion ----------
-- Solo en proceso: nunca tocó stock, así que anular no mueve nada. El motivo
-- se concatena a la nota para que quede en la fila (no se borra: principio 4).
create or replace function retail.anular_produccion(p_produccion_id uuid, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_orden producciones%rowtype;
begin
  select * into v_orden from producciones where id = p_produccion_id for update;
  if not found then raise exception 'La orden no existe'; end if;
  if not fn_puede_operar_ubicacion(v_orden.ubicacion_id) then
    raise exception 'No tienes permiso sobre las órdenes de ese Taller';
  end if;
  if v_orden.estado <> 'en_proceso' then
    raise exception 'Solo se anula una orden en proceso — una cerrada se revierte';
  end if;
  update producciones
    set estado = 'anulada',
        nota = concat_ws(' · ', nota, nullif(btrim(p_motivo), ''))
    where id = p_produccion_id;
end;
$$;

-- ---------- revertir_produccion ----------
-- Deshace un cierre: saca del stock lo que había entrado (movimientos de
-- salida, motivo 'reversion_produccion' — nunca se borra la entrada original)
-- y devuelve la orden a en_proceso para corregir buenas o costos y cerrar otra vez.
create or replace function retail.revertir_produccion(p_produccion_id uuid)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_orden producciones%rowtype; v_persona uuid; v_linea produccion_lineas%rowtype; v_mov uuid; v_sub uuid;
begin
  select * into v_orden from producciones where id = p_produccion_id for update;
  if not found then raise exception 'La orden no existe'; end if;
  if not fn_puede_operar_ubicacion(v_orden.ubicacion_id) then
    raise exception 'No tienes permiso sobre las órdenes de ese Taller';
  end if;
  if v_orden.estado <> 'terminada' then
    raise exception 'Solo se revierte una orden cerrada';
  end if;

  select id into v_persona from personas where auth_user_id = auth.uid();

  if v_orden.inventariado_at is not null then
    v_sub := fn_sububicacion_por_defecto(v_orden.ubicacion_id, 'venta');
    for v_linea in
      select * from produccion_lineas where produccion_id = p_produccion_id and cantidad_buenas > 0
    loop
      insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, produccion_id, usuario_id)
        values (v_linea.variante_id, v_orden.ubicacion_id, v_sub, 'salida', v_linea.cantidad_buenas, 'reversion_produccion', p_produccion_id, v_persona)
        returning id into v_mov;
      perform fn_aplicar_movimiento(v_mov);
    end loop;
  end if;

  update produccion_lineas set cantidad_buenas = null where produccion_id = p_produccion_id;
  update producciones
    set estado = 'en_proceso', cantidad_buenas = null, inventariado_at = null
    where id = p_produccion_id;
end;
$$;

grant execute on function retail.abrir_produccion(uuid, uuid, jsonb, numeric, numeric, numeric, boolean, date, text, uuid) to authenticated;
grant execute on function retail.set_etapa_produccion(uuid, text, text) to authenticated;
grant execute on function retail.cerrar_produccion(uuid, jsonb, numeric, numeric, numeric) to authenticated;
grant execute on function retail.anular_produccion(uuid, text) to authenticated;
grant execute on function retail.revertir_produccion(uuid) to authenticated;
