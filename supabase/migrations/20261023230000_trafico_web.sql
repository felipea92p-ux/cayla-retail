-- ============================================================================
-- 20261023230000_trafico_web.sql — CAYLA V2 · Tienda web ▸ Tráfico (ADR-0495), actividad 1
--
-- EL PROBLEMA PRIMERO. La tienda online no cuenta visitas: solo mide su velocidad, en el registro de Vercel (ADR-0447). Felipe
-- quiere ver cuánta gente entra, qué prenda mira, por dónde llega, desde dónde, a qué hora y en qué paso se va (maqueta elegida:
-- `docs/maquetas/trafico-cero-2026-10/`, C «La vitrina»). Eso es un dato del negocio que se cruza con los pedidos, que ya viven aquí;
-- por eso esta vez sí va a la base (ADR-0447 lo había descartado para la velocidad, que no es del negocio).
--
-- QUÉ HACE
--   1. `retail.trafico_web`: una fila por PASO de una persona en la tienda online — 0 entró, 1 vio una prenda, 2 eligió talla,
--      3 la puso en la bolsa, 4 separó —. Solo se agrega: no se edita ni se borra (el mismo candado de `movimientos`). La persona
--      es un número al azar que vive en una cookie de su aparato (`visitante`): nunca su IP, su cuenta ni su correo. El camino
--      (Instagram, WhatsApp…) y el departamento aproximado (`region`, ISO 3166-2, de la ubicación que Vercel le da a la IP sin
--      guardarla) van solo en «entró». «Recogieron» no se escribe: se lee de `pedidos_web.entregado_en` por `pedido_web_id`.
--   2. `retail.tienda_anotar_pasos(visitante, pasos, region)`: la única forma de escribir, por la puerta angosta de la tienda
--      (rol `tienda_web`, ADR-0408). Lo que no calza se descarta sin error (es medición: nunca tumba una página ni un «Separar»).
--
-- QUÉ NO HACE. No lee nada para el ERP (eso es `resumen_trafico_web`, 20261023231000) ni decide qué es una visita (eso lo decide la
-- tienda: «entró» sale una vez cada 30 minutos sin actividad).
--
-- SE PEGA ENTERA en el SQL Editor de producción: crea una tabla nueva, sin políticas (RLS encendido, solo la tocan funciones security
-- definer) y sin `alter` de tablas en uso, así que no choca con el Asesor de seguridad (CLAUDE.md «Políticas y deadlocks»). Se puede
-- pegar dos veces.
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. Los pasos ----------
create table if not exists retail.trafico_web (
  id            bigint generated always as identity primary key,
  ocurrio_en    timestamptz not null default now(),
  visitante     uuid not null,
  paso          smallint not null,
  camino        text,
  region        text,
  producto_id   uuid references retail.productos (id),
  variante_id   uuid references retail.variantes (id),
  pedido_web_id uuid references retail.pedidos_web (id),
  constraint trafico_web_paso check (paso between 0 and 4),
  constraint trafico_web_camino check (camino is null or camino in ('instagram', 'directo', 'whatsapp', 'tiktok', 'google', 'qr', 'otros')),
  -- «PE-LAL» (un departamento del Perú) o «US» (solo el país, fuera del Perú). Nunca una ciudad ni un distrito.
  constraint trafico_web_region check (region is null or region ~ '^[A-Z]{2}(-[A-Z0-9]{1,3})?$'),
  -- El camino va siempre y solo en «entró»; el departamento, solo en «entró».
  constraint trafico_web_camino_al_entrar check ((paso = 0) = (camino is not null)),
  constraint trafico_web_region_al_entrar check (paso = 0 or region is null),
  -- Vio, eligió talla o la puso en la bolsa: siempre de una prenda; eligió talla o bolsa: siempre de una talla y color.
  constraint trafico_web_prenda check ((paso in (1, 2, 3)) = (producto_id is not null)),
  constraint trafico_web_talla check (paso in (2, 3) or variante_id is null),
  constraint trafico_web_talla_obligatoria check (paso not in (2, 3) or variante_id is not null),
  -- Separó: siempre de un pedido, y un pedido solo en «separó».
  constraint trafico_web_pedido check ((paso = 4) = (pedido_web_id is not null))
);

comment on table retail.trafico_web is
  'Tienda web ▸ Tráfico (ADR-0495): un paso de una persona anónima en la tienda online (0 entró, 1 vio prenda, 2 eligió talla, 3 a la bolsa, 4 separó). Solo se agrega. visitante = número al azar de una cookie del aparato (nunca IP, cuenta ni correo); camino y region (ISO 3166-2 aproximada) solo en «entró». Solo por tienda_anotar_pasos; RLS sin políticas.';

-- Solo se agrega, como el historial de stock: no se edita, no se borra, no se vacía. (El candado de `movimientos` habla de stock; este
-- tiene su propio mensaje.)
create or replace function retail.fn_trafico_web_inmutable()
returns trigger
language plpgsql
as $fn$
begin
  raise exception 'Los pasos del tráfico de la tienda web no se editan ni se borran: solo se agregan (ADR-0495).';
end;
$fn$;
revoke all on function retail.fn_trafico_web_inmutable() from public, anon, authenticated;

create or replace trigger trafico_web_inmutable
  before update or delete on retail.trafico_web
  for each row execute function retail.fn_trafico_web_inmutable();
create or replace trigger trafico_web_sin_truncate
  before truncate on retail.trafico_web
  for each statement execute function retail.fn_trafico_web_inmutable();

-- Se lee siempre por un rango de fechas y las filas llegan en orden de tiempo: un índice BRIN pesa unas pocas páginas y basta.
create index if not exists trafico_web_cuando on retail.trafico_web using brin (ocurrio_en);
-- Un pedido se cuenta como «separó» una sola vez (si «Separar» se reintenta, el segundo paso no se anota).
create unique index if not exists trafico_web_pedido_una_vez on retail.trafico_web (pedido_web_id) where pedido_web_id is not null;

alter table retail.trafico_web enable row level security;
revoke all on retail.trafico_web from public, anon, authenticated;

-- ---------- 2. Anotar pasos: la puerta de la tienda ----------
-- `p_pasos`: [{ "paso": 0..4, "hace_ms": 0..21600000, "camino": "...", "producto": uuid, "variante": uuid, "marca": uuid }, …]
--   · hace_ms: cuánto antes de este envío ocurrió (la tienda junta varios pasos y los manda al salir de la página); la hora la pone
--     la base (now() − hace_ms), nunca el aparato.
--   · eligió talla y a la bolsa: basta la talla (`variante`); la prenda sale de ella (si viene, tiene que ser la suya).
--   · separó: la `marca` del pedido (`pedidos_web.token_cliente`), la que solo conoce el servidor de la tienda de esa persona (vive en su
--     cookie `httpOnly`); el código del pedido no sirve, porque se ve en la dirección.
-- `p_region`: el departamento de quien envía; solo se guarda en «entró».
-- Devuelve cuántos pasos quedaron anotados. Lo que no calza (más de 20, un paso desconocido, un camino fuera de la lista, una prenda o
-- una talla que no existe, una talla de otra prenda, una marca sin pedido, un pedido de hace más de 15 minutos o ya contado) se
-- descarta sin error.
create or replace function retail.tienda_anotar_pasos(p_visitante uuid, p_pasos jsonb, p_region text default null)
returns integer
language plpgsql
volatile
security definer
set search_path = retail, public
as $fn$
declare
  v_ahora timestamptz := now();
  v_region text;
  v_item jsonb;
  v_paso smallint;
  v_hace bigint;
  v_camino text;
  v_producto uuid;
  v_variante uuid;
  v_pedido uuid;
  v_anotados integer := 0;
  v_filas integer;
begin
  if p_visitante is null or p_pasos is null or jsonb_typeof(p_pasos) <> 'array' then
    return 0;
  end if;
  v_region := case when p_region ~ '^[A-Z]{2}(-[A-Z0-9]{1,3})?$' then p_region end;

  for v_item in select e from jsonb_array_elements(p_pasos) with ordinality as t(e, n) where n <= 20 order by n loop
    continue when jsonb_typeof(v_item) <> 'object';
    v_paso := case when v_item ->> 'paso' ~ '^[0-4]$' then (v_item ->> 'paso')::smallint end;
    continue when v_paso is null;
    v_hace := case when v_item ->> 'hace_ms' ~ '^[0-9]{1,8}$' then (v_item ->> 'hace_ms')::bigint else 0 end;
    continue when v_hace > 21600000; -- más de 6 horas atrás: no es de esta visita
    v_camino := null;
    v_producto := null;
    v_variante := null;
    v_pedido := null;

    if v_paso = 0 then
      v_camino := v_item ->> 'camino';
      continue when v_camino is null or v_camino not in ('instagram', 'directo', 'whatsapp', 'tiktok', 'google', 'qr', 'otros');
    elsif v_paso = 1 then
      v_producto := case when v_item ->> 'producto' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (v_item ->> 'producto')::uuid end;
      continue when v_producto is null or not exists (select 1 from retail.productos p where p.id = v_producto);
    elsif v_paso in (2, 3) then
      -- La prenda sale de la talla; si el envío trae una prenda, tiene que ser la de esa talla.
      v_variante := case when v_item ->> 'variante' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (v_item ->> 'variante')::uuid end;
      continue when v_variante is null;
      v_producto := (select v.producto_id from retail.variantes v where v.id = v_variante);
      continue when v_producto is null or (v_item ? 'producto' and v_item ->> 'producto' is distinct from v_producto::text);
    else
      -- Separó: el pedido de esa marca, creado hace poco (nadie puede atribuirse un pedido viejo ni ajeno: la marca no se publica).
      if v_item ->> 'marca' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        v_pedido := (
          select w.id from retail.pedidos_web w
          where w.token_cliente = (v_item ->> 'marca')::uuid and w.creado_en > v_ahora - interval '15 minutes'
        );
      end if;
      continue when v_pedido is null;
    end if;

    insert into retail.trafico_web (ocurrio_en, visitante, paso, camino, region, producto_id, variante_id, pedido_web_id)
    values (
      v_ahora - make_interval(secs => v_hace / 1000.0),
      p_visitante,
      v_paso,
      v_camino,
      case when v_paso = 0 then v_region end,
      v_producto,
      v_variante,
      v_pedido
    )
    on conflict (pedido_web_id) where pedido_web_id is not null do nothing;
    get diagnostics v_filas = row_count;
    v_anotados := v_anotados + v_filas;
  end loop;

  return v_anotados;
end;
$fn$;

comment on function retail.tienda_anotar_pasos(uuid, jsonb, text) is
  'Tienda web ▸ Tráfico (ADR-0495): anota hasta 20 pasos anónimos de una persona en retail.trafico_web. Lo que no calza se descarta sin error. Solo para el rol tienda_web.';

revoke all on function retail.tienda_anotar_pasos(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function retail.tienda_anotar_pasos(uuid, jsonb, text) to tienda_web;

reset lock_timeout;
