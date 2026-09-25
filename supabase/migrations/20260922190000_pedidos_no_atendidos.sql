-- ============================================================================
-- 20260922190000_pedidos_no_atendidos.sql — CAYLA V2
--
-- «PEDIDO NO ATENDIDO EN 1 TOQUE» — la asesora anota, en un solo gesto, que una clienta pidió un
-- modelo o talla que la tienda no tenía. SOLO la captura del dato: esta migración NO manda el
-- aviso «llegó tu talla» ni la señal de qué cortar en el Taller — esas dos nacen DESPUÉS, leyendo
-- esta misma tabla (D-79 lo dice explícito: «alimenta el aviso... y le dice al Taller qué
-- cortar», no lo construye). Tampoco engancha ninguna pantalla del mostrador: Vender/PuntoDeVenta
-- las tocan varias ramas de esta misma ronda a la vez y se integran juntas, en otro PR, para no
-- chocar (ver docs/adr/0152-pedido-no-atendido-en-un-toque.md).
--
-- QUÉ DECIDE. D-79 (`docs/datos/DECISIONES-2026-09-21-menu-comercial.md`): de las «dos ideas de
-- calidad que sí entran en la construcción de esta ronda», esta es la primera — «pedido no
-- atendido en 1 toque: la asesora anota "pidió modelo/talla y no había"; alimenta el aviso
-- "llegó tu talla" (D-77) y le dice al Taller qué cortar».
--
-- QUIÉN Y CUÁNDO. Felipe, en la ronda de decisiones del 2026-09-21 (D-79). Esta migración: parte
-- de la tanda de construcción del 2026-09-22.
--
-- QUÉ CAMBIA.
--   1. Tabla `pedidos_no_atendidos`: una fila por «pidió esto y no había». Guarda el producto DEL
--      CATÁLOGO si el modelo existe (`producto_id`) o una descripción libre si no (`descripcion_libre`)
--      — un CHECK exige al menos uno de los dos, la misma regla que la RPC vuelve a exigir (defensa
--      en profundidad: un INSERT directo que se saltara la RPC —hoy imposible, ver grants— tampoco
--      podría dejar la fila sin ninguno de los dos).
--   2. RPC `registrar_pedido_no_atendido`: la ÚNICA puerta de escritura. Candado de ubicación
--      PRIMERO (recibe `p_ubicacion_id` como parámetro, así que no hace falta leer nada antes de
--      decidir el permiso — mismo criterio que exige la ronda de candados del 20260921, sección
--      «QUÉ CAMBIA» de `20260921120000_candado_de_lider_caja_y_ajuste.sql`).
--   3. RPC `marcar_pedido_no_atendido_resuelto`: para que la pantalla de verificación (y, más
--      adelante, el aviso «llegó tu talla») pueda cerrar un pedido. Acá el candado SÍ va después de
--      leer la fila, porque `fn_puede_operar_ubicacion` necesita la `ubicacion_id` DE esa fila —
--      mismo orden que ya usa `liberar_apartado` en `20260920160000_apartar_stock.sql` por la misma
--      razón (no hay forma de validar el permiso sin mirar primero A QUÉ ubicación pertenece el
--      pedido).
--
-- QUÉ SE CONSERVA. Nada se toca de lo existente: tabla, RPC y RLS son 100% nuevos, no hay
-- `alter table` sobre ninguna tabla vieja ni redefinición de ninguna función que ya existiera.
--
-- QUIÉN PUEDE HACER QUÉ (capacidad nueva, nadie pierde nada). Cualquier colaborador —líder o
-- integrante— puede anotar un pedido no atendido y marcarlo resuelto, pero SOLO en la ubicación que
-- `fn_puede_operar_ubicacion` le permite operar (la suya; una líder, cualquiera) — mismo candado que
-- ya usan `apartar_stock`/`registrar_venta`/etc. No hace falta ser líder: registrar que faltó una
-- talla es exactamente el tipo de dato operativo que un integrante ya carga sin supervisión (a
-- diferencia de cerrar caja o ajustar stock, que si son solo de líder por D-13).
--
-- `clienta_id` — SIN FK A PROPÓSITO, POR AHORA. `retail.clientas` la crea otra tarea de esta misma
-- ronda; verificado el 2026-09-22 contra `origin/main` (`git fetch` en este mismo momento) que esa
-- tabla TODAVÍA no existe acá. No se puede declarar `references retail.clientas(id)` ni siquiera
-- `not valid` contra una tabla que no existe — Postgres exige que la tabla referenciada ya esté.
-- La columna queda uuid suelta, sin escribirse por ninguna RPC de este archivo (el parámetro
-- `p_clienta_id` existe porque la firma de la RPC lo pide, pero nada la usa todavía salvo
-- guardarla tal cual). Cuando `clientas` aterrice en `origin/main`, agregar en una migración nueva:
--   alter table retail.pedidos_no_atendidos
--     add constraint pedidos_no_atendidos_clienta_id_fkey
--     foreign key (clienta_id) references retail.clientas (id) not valid;
--   alter table retail.pedidos_no_atendidos validate constraint pedidos_no_atendidos_clienta_id_fkey;
--
-- ESCALA (números antes que opiniones). 3 tiendas, tráfico de mostrador: incluso en un día muy
-- activo (varias decenas de pedidos no atendidos por tienda) esto es una fracción de las ~474 filas
-- que ya tenía `movimientos` cuando se escribió ADR-0141 — un índice parcial por ubicación alcanza
-- de sobra para los próximos años, no hace falta partición ni nada más.
--
-- CÓMO SE APLICA EN PRODUCCIÓN. Este archivo, tal cual, con el prefijo `retail.` agregado a mano
-- SOLO al pegarlo en el SQL Editor del proyecto `cayla-dynamic` (nunca en este archivo del repo,
-- ver CLAUDE.md) — o con `set search_path to retail, public;` al principio. Es re-ejecutable
-- (`create table if not exists`, `create or replace function`, `drop policy if exists`).
-- ============================================================================

set search_path = retail, public, extensions;

-- ---------- 1. la tabla: un pedido no atendido, por sede ----------
create table if not exists retail.pedidos_no_atendidos (
  id uuid primary key default gen_random_uuid(),
  ubicacion_id uuid not null references retail.ubicaciones (id),
  -- El modelo del catálogo, si existe ahí. NULL cuando la clienta pidió algo que CAYLA no tiene
  -- registrado (una prenda de otra marca, algo que todavía no se diseña) — para eso está
  -- `descripcion_libre`. Ninguna FK a `variantes`: a la asesora no le van a preguntar «¿talla M o L,
  -- exacto?» en el mostrador — la talla que pidió la clienta se guarda aparte, en texto libre,
  -- porque puede no coincidir con el vocabulario cerrado de tallas si el modelo ni siquiera está
  -- en catálogo.
  producto_id uuid references retail.productos (id),
  descripcion_libre text,
  talla text,
  -- SIN FK todavía — ver la nota larga arriba del archivo («clienta_id — SIN FK A PROPÓSITO»).
  clienta_id uuid,
  -- Quién anotó (`public.personas.id`, no `retail.personas`: esa tabla ya no existe desde
  -- 0009_integracion_dynamic.sql — ver esa migración, sección «retail.personas ya no existe»).
  atendido_por uuid references public.personas (id),
  created_at timestamptz not null default now(),
  resuelto boolean not null default false,
  resuelto_en timestamptz,
  -- Estado imposible que el esquema, no el código, deja de permitir (principio del núcleo:
  -- Lamport — «si no puedes describir el estado inválido, no entiendes el sistema»): un pedido
  -- resuelto sin cuándo, o uno abierto que ya trae una fecha de cierre.
  constraint pedidos_no_atendidos_resuelto_coherente check (
    (resuelto = false and resuelto_en is null) or (resuelto = true and resuelto_en is not null)
  ),
  -- El otro estado imposible: un pedido que no dice NI el modelo NI qué pidió la clienta no es un
  -- dato, es ruido — nadie podría avisar «llegó tu talla» de algo que no se sabe qué es.
  constraint pedidos_no_atendidos_producto_o_descripcion check (
    producto_id is not null or nullif(btrim(coalesce(descripcion_libre, '')), '') is not null
  )
);

-- Lo que la pantalla (y, después, el aviso/Taller) van a leer siempre: los pendientes de una sede,
-- lo más viejo primero (es lo que más tiempo lleva esperando una respuesta).
create index if not exists pedidos_no_atendidos_pendientes_idx
  on retail.pedidos_no_atendidos (ubicacion_id, created_at)
  where resuelto = false;

alter table retail.pedidos_no_atendidos enable row level security;
drop policy if exists pedidos_no_atendidos_select on retail.pedidos_no_atendidos;
create policy pedidos_no_atendidos_select on retail.pedidos_no_atendidos for select
  using (retail.fn_puede_operar_ubicacion(ubicacion_id));
-- Escritura: solo las dos RPC de abajo (`security definer`) — mismo patrón que `apartados`.
revoke insert, update, delete, truncate on retail.pedidos_no_atendidos from authenticated, anon;
grant select on retail.pedidos_no_atendidos to authenticated;

-- ---------- 2. registrar_pedido_no_atendido: la única puerta para anotar uno nuevo ----------
create or replace function retail.registrar_pedido_no_atendido(
  p_ubicacion_id uuid,
  p_producto_id uuid default null,
  p_descripcion_libre text default null,
  p_talla text default null,
  p_clienta_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_descripcion text := nullif(btrim(coalesce(p_descripcion_libre, '')), '');
  v_talla text := nullif(btrim(coalesce(p_talla, '')), '');
  v_persona uuid;
  v_id uuid;
begin
  -- CANDADO DE UBICACIÓN PRIMERO (mismo criterio que la ronda de candados del 20260921): el
  -- parámetro ya trae la ubicación, así que no hace falta mirar nada más para decidir el permiso.
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para anotar pedidos en esa ubicación';
  end if;
  if p_producto_id is null and v_descripcion is null then
    raise exception 'Anota el modelo del catálogo o describe lo que pidió la clienta';
  end if;
  if p_producto_id is not null and not exists (select 1 from productos where id = p_producto_id) then
    raise exception 'Ese producto no existe en el catálogo';
  end if;
  select id into v_persona from personas where auth_user_id = auth.uid();
  if v_persona is null then
    raise exception 'No se encontró tu ficha de colaborador';
  end if;

  insert into pedidos_no_atendidos (ubicacion_id, producto_id, descripcion_libre, talla, clienta_id, atendido_por)
    values (p_ubicacion_id, p_producto_id, v_descripcion, v_talla, p_clienta_id, v_persona)
    returning id into v_id;
  return v_id;
end;
$$;

-- ---------- 3. marcar_pedido_no_atendido_resuelto: cierra uno ya anotado ----------
create or replace function retail.marcar_pedido_no_atendido_resuelto(p_pedido_id uuid)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare p pedidos_no_atendidos%rowtype;
begin
  -- `for update`: dos toques casi simultáneos sobre el mismo pedido — el segundo espera y luego lo
  -- ve ya resuelto, en vez de reventar el CHECK de coherencia por una carrera.
  select * into p from pedidos_no_atendidos where id = p_pedido_id for update;
  if not found then
    raise exception 'Ese pedido no existe';
  end if;
  -- El candado va DESPUÉS de leer la fila a propósito: `fn_puede_operar_ubicacion` necesita saber
  -- de qué ubicación es ESTE pedido, y eso solo se sabe leyéndolo — mismo orden que
  -- `liberar_apartado` en 20260920160000_apartar_stock.sql, por la misma razón.
  if not fn_puede_operar_ubicacion(p.ubicacion_id) then
    raise exception 'No tienes permiso para resolver pedidos de esa ubicación';
  end if;
  if p.resuelto then
    raise exception 'Ese pedido ya estaba marcado como resuelto';
  end if;

  update pedidos_no_atendidos set resuelto = true, resuelto_en = now() where id = p.id;
end;
$$;

revoke all on function retail.registrar_pedido_no_atendido(uuid, uuid, text, text, uuid) from public, anon;
grant execute on function retail.registrar_pedido_no_atendido(uuid, uuid, text, text, uuid) to authenticated;
revoke all on function retail.marcar_pedido_no_atendido_resuelto(uuid) from public, anon;
grant execute on function retail.marcar_pedido_no_atendido_resuelto(uuid) to authenticated;
