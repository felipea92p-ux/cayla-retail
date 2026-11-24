-- ============================================================================
-- 20261124172000_tickets_compartidos.sql — CAYLA V2 · ADR-0701 «Tickets compartidos» (ADR-0511, paso 2) · actividad 1
--
-- EL PROBLEMA PRIMERO. En TRU el cobro es el cuello de botella de los sábados: cada asesora lleva a su cliente a la única compu y ahí hace
-- siete pasos seguidos (armar el ticket, DNI, tarjeta, imprimir, gancho, doblar, embolsar). La solución acordada con Felipe (24-nov) es
-- partir el cobro en tres estaciones: ARMAR en el piso con el celular, COBRAR en la MacBook, ENTREGAR aparte. Para eso el ticket que la
-- asesora arma en su celular tiene que llegar a la MacBook. Hasta hoy no puede: un ticket en espera vive solo en el navegador que lo
-- creó (`lib/almacen-local.ts`).
--
-- LA REGLA. Un ticket compartido es una FOTO del ticket del piso que se manda a la caja de su sede. Nace «esperando» y termina una sola
-- vez, de una de dos formas:
--   · «tomado»     — alguien lo abrió (en la MacBook o en otro celular) y pasó a ser un ticket de ESE equipo. Desde ahí se cobra como
--                    cualquier ticket: `registrar_venta` vuelve a validar precios, stock y topes. El ticket compartido no reserva stock.
--   · «descartado» — nadie lo va a cobrar (el cliente se fue). Queda escrito, con quién y cuándo: nunca se borra.
-- Si dos equipos tocan «Abrir» sobre el mismo ticket en el mismo instante, solo uno se lo lleva (UPDATE condicionado a «esperando»: el
-- segundo encuentra la fila ya tomada y recibe ticket_ya_tomado con el nombre de quien lo tomó).
--
-- LOS ESTADOS QUE NUNCA DEBEN EXISTIR, y quién los impide:
--   · «esperando» con datos de tomado o descartado, o «tomado» sin quién/cuándo → CHECK tickets_compartidos_estado_coherente.
--   · volver de tomado/descartado a esperando, o cambiar el contenido después de mandarlo → disparador fn_ticket_compartido_transicion.
--   · borrar o vaciar la tabla → el mismo disparador (y `truncate`).
--   · un ticket vacío o gigante → CHECK sobre `prendas` y el tamaño del contenido.
--
-- QUÉ CREA.
--   · `retail.tickets_compartidos`: RLS encendido SIN políticas (solo la leen y escriben estas funciones `security definer`). El id lo
--     elige el aparato: mandar dos veces el mismo ticket (doble toque, red que reintenta) no crea dos.
--   · `enviar_ticket_a_caja(id, sede, nombre, contenido)`: manda la foto. Idempotente.
--   · `fn_tickets_compartidos(sede)`: los que esperan, SIN el contenido (la caja pregunta cada pocos segundos: liviano).
--   · `tomar_ticket_compartido(id, apertura)`: lo abre y devuelve el contenido. Todo o nada; la misma apertura puede pedirlo otra vez.
--   · `descartar_ticket_compartido(id)`: lo marca descartado.
--   · `marcar_ticket_compartido_cobrado(id, venta)` (actividad 5): anota con qué venta se cobró. Con eso el tiempo real de cada cobro
--     queda medido sin cronómetro: `enviado_en` (se armó en el piso) → `tomado_en` (la caja lo abrió) → `ventas.created_at` (se cobró).
-- Permisos: quien ve Vender en esa sede (`fn_ve_modulo('vender')` y `fn_puede_operar_ubicacion`). Firma con `fn_actor_persona_id(true)`.
--
-- CÓMO SE PEGA EN PRODUCCIÓN. Una sola parte, a cualquier hora: una tabla NUEVA (sin políticas: no toma las tablas de auth ni storage,
-- ADR-0195) y funciones nuevas. No altera ninguna tabla en uso. Idempotente. Para volver atrás: `drop function` de las cinco y
-- `drop table retail.tickets_compartidos` (la web vieja no las usa).
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

do $guarda$
begin
  if to_regprocedure('retail.fn_actor_persona_id(boolean)') is null
     or to_regprocedure('retail.fn_ve_modulo(text)') is null
     or to_regprocedure('retail.fn_puede_operar_ubicacion(uuid)') is null
     or to_regprocedure('retail.fn_actividad_nombre(uuid)') is null then
    raise exception 'Faltan fn_actor_persona_id, fn_ve_modulo, fn_puede_operar_ubicacion o fn_actividad_nombre.';
  end if;
end;
$guarda$;

-- ----------------------------------------------------------------------------
-- 1. La tabla.
-- ----------------------------------------------------------------------------
create table if not exists retail.tickets_compartidos (
  id uuid primary key,
  ubicacion_id uuid not null references retail.ubicaciones (id),
  nombre text not null check (char_length(btrim(nombre)) between 1 and 40),
  -- La foto del ticket tal como la arma la web (`TicketEnEspera`: carrito, nota, cliente y lo del cobro). La base no la interpreta más
  -- allá de contar prendas y total para la lista: al cobrar, `registrar_venta` vuelve a validar todo con los precios de ese momento.
  contenido jsonb not null check (jsonb_typeof(contenido) = 'object' and pg_column_size(contenido) <= 65536),
  prendas integer not null check (prendas between 1 and 500),
  total numeric(12, 2) not null check (total >= 0),
  estado text not null default 'esperando' check (estado in ('esperando', 'tomado', 'descartado')),
  enviado_por uuid not null references public.personas (id),
  enviado_en timestamptz not null default clock_timestamp(),
  tomado_por uuid references public.personas (id),
  tomado_en timestamptz,
  -- Qué apertura se lo llevó: un id que elige el equipo al tocar «Abrir». Si la respuesta se pierde en la red, ESE equipo vuelve a pedir
  -- con el mismo id y la base le devuelve el ticket otra vez; otro equipo, con otro id, recibe «ya lo abrió» (nunca queda en dos cajas).
  apertura_id uuid,
  descartado_por uuid references public.personas (id),
  descartado_en timestamptz,
  -- La venta con que se cobró (actividad 5). Solo un ticket tomado se cobra, y una sola vez.
  venta_id uuid references retail.ventas (id),
  constraint tickets_compartidos_cobrado_si_tomado check (venta_id is null or estado = 'tomado'),
  constraint tickets_compartidos_estado_coherente check (
    (estado = 'esperando' and tomado_por is null and tomado_en is null and apertura_id is null and descartado_por is null and descartado_en is null)
    or (estado = 'tomado' and tomado_por is not null and tomado_en is not null and apertura_id is not null and descartado_por is null and descartado_en is null)
    or (estado = 'descartado' and descartado_por is not null and descartado_en is not null and tomado_por is null and tomado_en is null and apertura_id is null))
);

-- La caja pregunta «¿qué espera en mi sede?» cada pocos segundos: el índice parcial solo guarda los que esperan (decenas, no miles).
create index if not exists tickets_compartidos_esperando on retail.tickets_compartidos (ubicacion_id, enviado_en) where estado = 'esperando';

comment on table retail.tickets_compartidos is
  'ADR-0701 (ADR-0511 paso 2): el ticket que una asesora arma en su celular y manda a la caja de su sede. Nace esperando y termina una vez: tomado (lo abrió un equipo) o descartado. Nunca se borra; solo lo escriben enviar_ticket_a_caja, tomar_ticket_compartido y descartar_ticket_compartido.';

alter table retail.tickets_compartidos enable row level security;
revoke all on table retail.tickets_compartidos from public, anon, authenticated;

-- Solo dos caminos de cambio, y en una sola dirección: esperando → tomado, esperando → descartado. Lo demás no se toca nunca.
create or replace function retail.fn_ticket_compartido_transicion()
returns trigger
language plpgsql
set search_path = retail, public, extensions
as $fn$
begin
  if tg_op in ('DELETE', 'TRUNCATE') then
    raise exception 'Un ticket compartido no se borra: se descarta.' using hint = 'ticket_inmutable';
  end if;
  -- La única escritura sobre un ticket ya tomado: anotar, una vez, con qué venta se cobró. Nada más cambia.
  if old.estado = 'tomado' and old.venta_id is null and new.venta_id is not null
     and (to_jsonb(new) - 'venta_id') = (to_jsonb(old) - 'venta_id') then
    return new;
  end if;
  if old.estado <> 'esperando' then
    raise exception 'Este ticket ya se cerró (%): no cambia más.', old.estado using hint = 'ticket_inmutable';
  end if;
  if new.estado = 'esperando'
     or new.id <> old.id or new.ubicacion_id <> old.ubicacion_id or new.nombre <> old.nombre or new.contenido <> old.contenido
     or new.prendas <> old.prendas or new.total <> old.total
     or new.enviado_por <> old.enviado_por or new.enviado_en <> old.enviado_en or new.venta_id is not null then
    raise exception 'De un ticket compartido solo cambia si se tomó o se descartó.' using hint = 'ticket_inmutable';
  end if;
  return new;
end;
$fn$;

comment on function retail.fn_ticket_compartido_transicion() is
  'ADR-0701: un ticket compartido solo pasa de esperando a tomado o descartado, una vez; no se edita, no se borra, no se vacía.';

create or replace trigger tickets_compartidos_transicion
  before update or delete on retail.tickets_compartidos
  for each row execute function retail.fn_ticket_compartido_transicion();

create or replace trigger tickets_compartidos_sin_vaciar
  before truncate on retail.tickets_compartidos
  for each statement execute function retail.fn_ticket_compartido_transicion();

-- ----------------------------------------------------------------------------
-- 2. Quién puede, en una sola pregunta.
-- ----------------------------------------------------------------------------
create or replace function retail.fn_exigir_tickets_de_sede(p_ubicacion_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $fn$
begin
  if p_ubicacion_id is null or not exists (select 1 from ubicaciones u where u.id = p_ubicacion_id and u.tipo = 'tienda') then
    raise exception 'Esa sede no es una tienda.' using errcode = '22023', hint = 'ticket_sin_tienda';
  end if;
  if not fn_ve_modulo('vender') then
    raise exception 'No tienes acceso al Punto de venta.' using errcode = '42501', hint = 'ticket_sin_modulo';
  end if;
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No puedes operar la caja de esa sede.' using errcode = '42501', hint = 'ticket_otra_sede';
  end if;
end;
$fn$;

-- ----------------------------------------------------------------------------
-- 3. La fila que ve la caja: sin el contenido.
-- ----------------------------------------------------------------------------
create or replace function retail.fn_ticket_compartido_fila(t retail.tickets_compartidos)
returns jsonb
language sql
stable
security definer
set search_path = retail, public, extensions
as $fn$
  select jsonb_build_object(
    'id', t.id,
    'nombre', t.nombre,
    'prendas', t.prendas,
    'total', t.total,
    'estado', t.estado,
    'enviado_por', fn_actividad_nombre(t.enviado_por),
    'enviado_en', t.enviado_en,
    'tomado_por', case when t.tomado_por is null then null else fn_actividad_nombre(t.tomado_por) end,
    'tomado_en', t.tomado_en);
$fn$;

-- ----------------------------------------------------------------------------
-- 4. Mandar el ticket a la caja.
-- ----------------------------------------------------------------------------
create or replace function retail.enviar_ticket_a_caja(p_id uuid, p_ubicacion_id uuid, p_nombre text, p_contenido jsonb)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_actor uuid;
  v_prendas integer;
  v_total numeric;
  v_fila retail.tickets_compartidos;
begin
  perform fn_exigir_tickets_de_sede(p_ubicacion_id);
  if p_id is null then
    raise exception 'Falta el id del ticket.' using errcode = '22023', hint = 'ticket_sin_id';
  end if;

  -- El mismo ticket reenviado (doble toque, la red que reintenta): devuelve lo que ya hay, sin crear otro ni pisarlo.
  for v_fila in select * from tickets_compartidos where id = p_id loop
    if v_fila.ubicacion_id <> p_ubicacion_id then
      raise exception 'Ese ticket ya se mandó a otra sede.' using errcode = '22023', hint = 'ticket_otra_sede';
    end if;
    return fn_ticket_compartido_fila(v_fila);
  end loop;

  if p_contenido is null or jsonb_typeof(p_contenido) <> 'object' or jsonb_typeof(p_contenido -> 'carrito') <> 'array' then
    raise exception 'El ticket no trae prendas.' using errcode = '22023', hint = 'ticket_vacio';
  end if;
  if jsonb_array_length(p_contenido -> 'carrito') > 60 then
    raise exception 'Un ticket tiene como mucho 60 líneas.' using errcode = '22023', hint = 'ticket_muy_grande';
  end if;
  if pg_column_size(p_contenido) > 65536 then
    raise exception 'El ticket es demasiado grande para mandarlo.' using errcode = '22023', hint = 'ticket_muy_grande';
  end if;

  -- Prendas y total, con la misma cuenta que la web (`totalDeLineas`: en céntimos, sin redondeos intermedios). Una línea rara (cantidad
  -- que no es entera positiva, precio que no es número) rechaza el ticket entero: la lista de la caja no muestra cifras inventadas.
  begin
    select coalesce(sum((l ->> 'cantidad')::integer), 0),
           coalesce(sum((l ->> 'cantidad')::integer
                        * (round((l ->> 'precioUnitario')::numeric * 100) - round(coalesce((l ->> 'descuentoUnitario')::numeric, 0) * 100))), 0) / 100
      into v_prendas, v_total
      from jsonb_array_elements(p_contenido -> 'carrito') l;
  exception when others then
    raise exception 'Una línea del ticket no se entiende.' using errcode = '22023', hint = 'ticket_linea_invalida';
  end;
  if v_prendas < 1 or exists (select 1 from jsonb_array_elements(p_contenido -> 'carrito') l where (l ->> 'cantidad')::integer < 1) then
    raise exception 'El ticket no trae prendas.' using errcode = '22023', hint = 'ticket_vacio';
  end if;
  if v_prendas > 500 or v_total < 0 or v_total > 9999999999 then
    raise exception 'Una línea del ticket no se entiende.' using errcode = '22023', hint = 'ticket_linea_invalida';
  end if;

  v_actor := fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién está atendiendo antes de mandar el ticket.' using errcode = '42501', hint = 'ticket_sin_responsable';
  end if;

  -- Más de 20 esperando en una caja no es atender, es un mostrador desbordado: se cobra o se descarta antes de mandar otro.
  if (select count(*) from tickets_compartidos where ubicacion_id = p_ubicacion_id and estado = 'esperando') >= 20 then
    raise exception 'Ya hay 20 tickets esperando en la caja. Cobra o descarta alguno antes de mandar otro.' using errcode = '22023', hint = 'ticket_tope';
  end if;

  insert into tickets_compartidos (id, ubicacion_id, nombre, contenido, prendas, total, enviado_por)
  values (p_id, p_ubicacion_id, left(btrim(coalesce(nullif(btrim(p_nombre), ''), 'Cliente')), 40), p_contenido, v_prendas, round(v_total, 2), v_actor)
  on conflict (id) do nothing;

  -- Si otro envío del MISMO id ganó la carrera, se devuelve el suyo (y si era de otra sede, se dice).
  for v_fila in select * from tickets_compartidos where id = p_id loop
    if v_fila.ubicacion_id <> p_ubicacion_id then
      raise exception 'Ese ticket ya se mandó a otra sede.' using errcode = '22023', hint = 'ticket_otra_sede';
    end if;
    return fn_ticket_compartido_fila(v_fila);
  end loop;
  raise exception 'No se pudo guardar el ticket.';
end;
$fn$;

comment on function retail.enviar_ticket_a_caja(uuid, uuid, text, jsonb) is
  'ADR-0701: manda a la caja de la sede el ticket armado en el piso. Idempotente por id. Quien ve Vender en esa sede; firma el actor.';

-- ----------------------------------------------------------------------------
-- 5. Lo que espera en la caja.
-- ----------------------------------------------------------------------------
create or replace function retail.fn_tickets_compartidos(p_ubicacion_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $fn$
begin
  perform fn_exigir_tickets_de_sede(p_ubicacion_id);
  return coalesce((
    select jsonb_agg(fn_ticket_compartido_fila(t) order by t.enviado_en, t.id)
      from tickets_compartidos t
     where t.ubicacion_id = p_ubicacion_id and t.estado = 'esperando'), '[]'::jsonb);
end;
$fn$;

comment on function retail.fn_tickets_compartidos(uuid) is
  'ADR-0701: los tickets que esperan en la caja de la sede, del más antiguo al más nuevo, sin su contenido.';

-- ----------------------------------------------------------------------------
-- 6. Abrir un ticket: pasa a este equipo.
-- ----------------------------------------------------------------------------
create or replace function retail.tomar_ticket_compartido(p_id uuid, p_apertura_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_actor uuid;
  v_fila retail.tickets_compartidos;
  v_sede uuid;
begin
  v_sede := (select ubicacion_id from tickets_compartidos where id = p_id);
  if v_sede is null then
    raise exception 'Ese ticket no existe.' using errcode = 'P0002', hint = 'ticket_no_existe';
  end if;
  perform fn_exigir_tickets_de_sede(v_sede);
  v_actor := fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién está atendiendo antes de abrir el ticket.' using errcode = '42501', hint = 'ticket_sin_responsable';
  end if;
  if p_apertura_id is null then
    raise exception 'Falta el id de esta apertura.' using errcode = '22023', hint = 'ticket_sin_apertura';
  end if;

  -- El candado está en el WHERE: de dos que lo abren a la vez, solo el primero encuentra la fila «esperando».
  update tickets_compartidos
     set estado = 'tomado', tomado_por = v_actor, tomado_en = clock_timestamp(), apertura_id = p_apertura_id
   where id = p_id and estado = 'esperando'
  returning * into v_fila;

  if v_fila.id is null then
    for v_fila in select * from tickets_compartidos where id = p_id loop
      -- La misma apertura que pide otra vez (su primera respuesta se perdió en la red): recibe lo mismo, mientras no se haya cobrado.
      if v_fila.estado = 'tomado' and v_fila.apertura_id = p_apertura_id and v_fila.venta_id is null then
        return fn_ticket_compartido_fila(v_fila) || jsonb_build_object('contenido', v_fila.contenido);
      end if;
      if v_fila.estado = 'tomado' then
        raise exception 'Este ticket ya lo abrió %.', fn_actividad_nombre(v_fila.tomado_por) using errcode = '22023', hint = 'ticket_ya_tomado';
      end if;
      raise exception 'Este ticket ya se descartó.' using errcode = '22023', hint = 'ticket_descartado';
    end loop;
  end if;

  return fn_ticket_compartido_fila(v_fila) || jsonb_build_object('contenido', v_fila.contenido);
end;
$fn$;

comment on function retail.tomar_ticket_compartido(uuid, uuid) is
  'ADR-0701: abre un ticket que espera en la caja y devuelve su contenido. De dos que lo abren a la vez, solo uno se lo lleva; la misma apertura (p_apertura_id) que pide otra vez recibe lo mismo.';

-- ----------------------------------------------------------------------------
-- 7. Descartar un ticket que nadie va a cobrar.
-- ----------------------------------------------------------------------------
create or replace function retail.descartar_ticket_compartido(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_actor uuid;
  v_fila retail.tickets_compartidos;
  v_sede uuid;
begin
  v_sede := (select ubicacion_id from tickets_compartidos where id = p_id);
  if v_sede is null then
    raise exception 'Ese ticket no existe.' using errcode = 'P0002', hint = 'ticket_no_existe';
  end if;
  perform fn_exigir_tickets_de_sede(v_sede);
  v_actor := fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién está atendiendo antes de descartar el ticket.' using errcode = '42501', hint = 'ticket_sin_responsable';
  end if;

  update tickets_compartidos
     set estado = 'descartado', descartado_por = v_actor, descartado_en = clock_timestamp()
   where id = p_id and estado = 'esperando'
  returning * into v_fila;

  if v_fila.id is null then
    for v_fila in select * from tickets_compartidos where id = p_id loop
      -- Descartar dos veces no es un error: ya está como se pedía.
      if v_fila.estado = 'descartado' then
        return fn_ticket_compartido_fila(v_fila);
      end if;
      raise exception 'Este ticket ya lo abrió %.', fn_actividad_nombre(v_fila.tomado_por) using errcode = '22023', hint = 'ticket_ya_tomado';
    end loop;
  end if;
  return fn_ticket_compartido_fila(v_fila);
end;
$fn$;

comment on function retail.descartar_ticket_compartido(uuid) is
  'ADR-0701: marca descartado un ticket que espera en la caja. Nunca lo borra; descartar dos veces no falla.';

-- ----------------------------------------------------------------------------
-- 8. Anotar con qué venta se cobró (actividad 5): la medida del cobro.
-- ----------------------------------------------------------------------------
create or replace function retail.marcar_ticket_compartido_cobrado(p_id uuid, p_venta_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_fila retail.tickets_compartidos;
begin
  for v_fila in select * from tickets_compartidos where id = p_id loop
    perform fn_exigir_tickets_de_sede(v_fila.ubicacion_id);
    if v_fila.estado <> 'tomado' then
      raise exception 'Solo se anota la venta de un ticket que se abrió en la caja.' using errcode = '22023', hint = 'ticket_no_tomado';
    end if;
    if v_fila.venta_id = p_venta_id then
      return fn_ticket_compartido_fila(v_fila);
    end if;
    if v_fila.venta_id is not null then
      raise exception 'Este ticket ya se cobró con otra venta.' using errcode = '22023', hint = 'ticket_ya_cobrado';
    end if;
    if not exists (select 1 from ventas v where v.id = p_venta_id and v.ubicacion_id = v_fila.ubicacion_id) then
      raise exception 'Esa venta no es de esta tienda.' using errcode = '22023', hint = 'ticket_venta_ajena';
    end if;
    update tickets_compartidos set venta_id = p_venta_id where id = p_id and venta_id is null returning * into v_fila;
    return fn_ticket_compartido_fila(v_fila);
  end loop;
  raise exception 'Ese ticket no existe.' using errcode = 'P0002', hint = 'ticket_no_existe';
end;
$fn$;

comment on function retail.marcar_ticket_compartido_cobrado(uuid, uuid) is
  'ADR-0701 (actividad 5): anota con qué venta de la misma tienda se cobró un ticket del piso que se abrió en la caja. Una vez; la misma venta otra vez no falla.';

-- ----------------------------------------------------------------------------
-- 9. Quién llama a qué.
-- ----------------------------------------------------------------------------
revoke all on function retail.fn_ticket_compartido_transicion() from public, anon, authenticated;
revoke all on function retail.fn_exigir_tickets_de_sede(uuid) from public, anon, authenticated;
revoke all on function retail.fn_ticket_compartido_fila(retail.tickets_compartidos) from public, anon, authenticated;
revoke all on function retail.enviar_ticket_a_caja(uuid, uuid, text, jsonb) from public, anon;
revoke all on function retail.fn_tickets_compartidos(uuid) from public, anon;
revoke all on function retail.tomar_ticket_compartido(uuid, uuid) from public, anon;
revoke all on function retail.descartar_ticket_compartido(uuid) from public, anon;
revoke all on function retail.marcar_ticket_compartido_cobrado(uuid, uuid) from public, anon;
grant execute on function retail.enviar_ticket_a_caja(uuid, uuid, text, jsonb) to authenticated;
grant execute on function retail.fn_tickets_compartidos(uuid) to authenticated;
grant execute on function retail.tomar_ticket_compartido(uuid, uuid) to authenticated;
grant execute on function retail.descartar_ticket_compartido(uuid) to authenticated;
grant execute on function retail.marcar_ticket_compartido_cobrado(uuid, uuid) to authenticated;
