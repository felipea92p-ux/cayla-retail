-- ============================================================================
-- 20261023114000_compras_simple_gasto_envio_y_cierre.sql — CAYLA V2 · ADR-0480 (Compras simple), actividad 5
-- «Gasté en otra cosa», «Mandar a la tienda» y «Terminé de comprar hoy», desde el celular de la compradora.
--
-- EL PROBLEMA PRIMERO. Con la actividad 3 la compradora ya anota lo que compra, pero el día de compras tiene tres cosas más: el taxi, el
-- cargador o la comida que pagó con la misma plata; el fardo que entrega al transporte para cada tienda; y el cierre, cuando dice qué hace
-- con lo que le sobró. Antes eso pedía un gasto del viaje atado a una orden, un envío armado línea por línea en el escritorio y una
-- rendición del fondo con los números de los libros, que ya no ven lo comprado hasta que Compras completa el papel (actividad 3).
--
-- QUÉ CREA
--   1. `compra_gastos`: un gasto que no es ropa (taxi, cargador, comida, envío, bolsas u otro), con su monto y, si le dieron un papel, su
--      foto (carpeta `gastos/` del depósito de los gastos del viaje). Igual que una compra (Felipe 2026-10-22): en su celular baja al
--      instante; los libros lo mueven recién cuando Compras lo revisa (actividad 7, como gasto del viaje). Nace «por completar».
--   2. `despachos.bultos`: cuántos fardos (paquetes) salen en un envío. La tienda abre todos los fardos al recibir (actividad 6).
--   3. `mandar_compras_a_tienda`: manda a UNA tienda todo lo que la compradora compró para ella y todavía no salió. Arma las líneas en la
--      base (el celular no elige línea por línea) y llama a `crear_envio`, el mismo envío que Recibir ya entiende.
--   4. `compra_cierres`: «Terminé de comprar hoy». Uno por persona y día, con lo que tenía al cerrar y qué hace con eso: se lo queda para la
--      próxima compra, lo devuelve en caja (Compras lo recibe en la actividad 7) o, si pagó de su bolsillo, CAYLA le debe. Mientras Compras
--      no lo resuelve, se puede volver a cerrar el mismo día (si siguió comprando).
--   5. `fn_mi_plata_tiene`: lo que tiene para comprar, en un solo lugar (fondo + plata por confirmar − compras y gastos por completar).
--      `fn_mi_plata_compras` lo usa y suma los gastos, lo que falta mandar a cada tienda y lo de hoy (para «Terminé»).
--
-- PERMISOS. Todo pide el módulo «Mi plata para compras» (`ordenes_compra`). Es la plata de quien firma (`fn_actor_persona_id(true)`: con
-- su cuenta, ella; desde una terminal, el responsable del combo). Mandar a la tienda pide además lo que ya pide `crear_envio`.
--
-- DESCARTÉ
--   · Registrar el gasto con `registrar_gasto_viaje` al toque: mueve la plata en los libros y exige una orden; Felipe eligió que los libros
--     vean solo lo que Compras revisó. Los conceptos se eligieron para caber en los de un gasto del viaje (taxi y comida → viaje; cargador,
--     envío y bolsas → traer la mercadería), así la actividad 7 lo pasa sin preguntar.
--   · Cerrar el día con `rendir_fondo`: rinde con los números de los libros, que todavía no ven las compras por completar.
--   · Escribir «2 fardos» en la nota del envío: la tienda lo necesita como número para saber cuántos paquetes abrir.
--   · Elegir línea por línea qué mandar: la compradora manda el fardo entero de una tienda; lo que no llegó lo ve la tienda al contar.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe, después de 20261023005000). Una sola parte, sin políticas ni `drop trigger`: dos tablas
-- nuevas, una columna nueva y nula en `despachos` (con `lock_timeout`) y funciones. Idempotente. Sin `select … into` dentro de textos
-- entre comillas (ADR-0288).
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- ---------- 1. Los gastos que no son ropa ----------
create table if not exists retail.compra_gastos (
  id uuid primary key,
  persona_id uuid not null references public.personas (id),
  concepto text not null check (concepto in ('taxi', 'cargador', 'comida', 'envio', 'bolsas', 'otro')),
  -- Qué fue, con sus palabras. Obligatorio con «Otro».
  nota text check (nota is null or char_length(nota) <= 120),
  monto numeric(12, 2) not null check (monto > 0 and monto <= 100000),
  -- La foto del papel, si le dieron uno: una ruta del depósito `retail-gastos-viaje`, carpeta `gastos/`.
  foto_ruta text check (foto_ruta is null or (foto_ruta like 'gastos/%' and char_length(foto_ruta) <= 300)),
  fecha date not null,
  estado text not null default 'por_completar' check (estado in ('por_completar', 'completado', 'anulado')),
  huella text not null,
  registrado_por uuid not null references public.personas (id),
  created_at timestamptz not null default now(),
  constraint compra_gastos_otro_dice_que check (concepto <> 'otro' or nullif(btrim(coalesce(nota, '')), '') is not null)
);
comment on table retail.compra_gastos is
  'ADR-0480: un gasto que no es ropa (taxi, cargador, comida…) anotado desde el celular. Por completar hasta que Compras lo revisa.';

create index if not exists compra_gastos_persona on retail.compra_gastos (persona_id, created_at desc);

alter table retail.compra_gastos enable row level security;
revoke all on retail.compra_gastos from anon, authenticated;

-- Un gasto no se borra, y lo que anotó la compradora no cambia: solo su estado (lo cambia la actividad 7).
create or replace function retail.fn_compra_gastos_inmutable()
returns trigger
language plpgsql
set search_path = retail, public, extensions
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Un gasto anotado no se borra.' using errcode = 'P0001';
  end if;
  if (new.id, new.persona_id, new.concepto, new.nota, new.monto, new.foto_ruta, new.fecha, new.huella, new.registrado_por, new.created_at)
     is distinct from (old.id, old.persona_id, old.concepto, old.nota, old.monto, old.foto_ruta, old.fecha, old.huella, old.registrado_por, old.created_at) then
    raise exception 'Lo que anotó la compradora no cambia: Compras lo corrige al revisarlo.' using errcode = 'P0001';
  end if;
  return new;
end $$;

create or replace trigger compra_gastos_inmutable
  before update or delete on retail.compra_gastos
  for each row execute function retail.fn_compra_gastos_inmutable();

create or replace function retail.registrar_gasto_rapido(
  p_id uuid,
  p_concepto text,
  p_nota text,
  p_monto numeric,
  p_foto_ruta text
) returns uuid
language plpgsql security definer set search_path = retail, public, extensions as $$
declare
  v_actor uuid;
  v_monto numeric := round(p_monto, 2);
  v_concepto text := lower(btrim(coalesce(p_concepto, '')));
  v_nota text := nullif(btrim(retail.fn_sin_invisibles(coalesce(p_nota, ''))), '');
  v_foto text := nullif(btrim(coalesce(p_foto_ruta, '')), '');
  v_huella text;
  v_existente record;
begin
  if retail.fn_ve_modulo('ordenes_compra') is not true then
    raise exception 'Anotar un gasto necesita el módulo «Mi plata para compras» en tu rol' using errcode = '42501', hint = 'ordenes_compra_sin_modulo';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hizo el gasto' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  if p_id is null then
    raise exception 'Falta el identificador del gasto: vuelve a abrirlo' using errcode = 'P0001', hint = 'gasto_rapido_sin_id';
  end if;
  v_huella := md5(jsonb_build_array(v_concepto, v_nota, p_monto::text, v_foto)::text);

  -- Doble clic o reintento tras un corte: lo mismo devuelve lo que ya quedó; otra cosa con el mismo identificador, lo dice.
  perform pg_advisory_xact_lock(hashtextextended('compra_gasto:' || p_id::text, 0));
  for v_existente in select g.id, g.huella, g.registrado_por from retail.compra_gastos g where g.id = p_id loop
    if v_existente.huella <> v_huella or v_existente.registrado_por <> v_actor then
      raise exception 'Ese gasto ya se guardó con otros datos: recarga la pantalla' using errcode = 'P0001', hint = 'gasto_rapido_otros_datos';
    end if;
    return p_id;
  end loop;

  if v_concepto not in ('taxi', 'cargador', 'comida', 'envio', 'bolsas', 'otro') then
    raise exception 'Elige en qué gastaste' using errcode = 'P0001', hint = 'gasto_rapido_concepto';
  end if;
  if v_concepto = 'otro' and v_nota is null then
    raise exception 'Con «Otro», escribe en qué gastaste' using errcode = 'P0001', hint = 'gasto_rapido_sin_nota';
  end if;
  if v_nota is not null and char_length(v_nota) > 120 then
    raise exception 'Lo que escribiste es muy largo: hasta 120 letras' using errcode = 'P0001', hint = 'gasto_rapido_nota_larga';
  end if;
  if not retail.fn_monto_valido(p_monto) or v_monto <= 0 or v_monto > 100000 then
    raise exception 'Escribe cuánto gastaste: un monto mayor que cero' using errcode = 'P0001', hint = 'monto_invalido';
  end if;
  if p_monto <> v_monto then
    raise exception 'El monto admite como máximo 2 decimales' using errcode = 'P0001', hint = 'monto_invalido';
  end if;
  if v_foto is not null and (v_foto not like 'gastos/%' or char_length(v_foto) > 300) then
    raise exception 'La foto del papel no se subió bien: vuelve a tomarla' using errcode = 'P0001', hint = 'gasto_rapido_foto';
  end if;

  insert into retail.compra_gastos (id, persona_id, concepto, nota, monto, foto_ruta, fecha, huella, registrado_por)
  values (p_id, v_actor, v_concepto, v_nota, v_monto, v_foto, retail.fn_hoy_lima(), v_huella, v_actor);

  -- Actividad (ADR-0207), sin montos. Si falla, el gasto igual queda.
  begin
    perform retail.fn_actividad_anotar('ordenes_compra', 'gasto_rapido_anotado',
      'anotó un gasto de ' || case v_concepto when 'taxi' then 'taxi' when 'cargador' then 'cargador' when 'comida' then 'comida'
                                                when 'envio' then 'envío' when 'bolsas' then 'bolsas' else coalesce(v_nota, 'otra cosa') end,
      v_actor, retail.fn_actividad_terminal_ahora(), null, null, 'compra_gastos', p_id::text, now(),
      jsonb_build_object('gasto_id', p_id, 'concepto', v_concepto), 'vivo');
  exception when others then
    raise warning 'actividad: no se anotó el gasto %: %', p_id, sqlerrm;
  end;
  return p_id;
end $$;

-- ---------- 2. Cuántos fardos salen en un envío ----------
alter table retail.despachos add column if not exists bultos smallint check (bultos is null or bultos between 1 and 99);
comment on column retail.despachos.bultos is
  'ADR-0480: cuántos fardos (paquetes) entregó la compradora al transporte. Nulo en los envíos de antes (no se sabía).';

-- ---------- 3. Mandar a una tienda lo que se compró para ella ----------
-- Lo que falta mandar de una línea de una compra anotada: lo pedido (o lo facturado, si es más) menos lo que ya salió. La misma cuenta
-- que hace `crear_envio` para no mandar de más.
create or replace function retail.fn_compra_item_por_mandar(p_item_id uuid)
returns integer
language sql stable security definer set search_path = retail, public, extensions as $$
  select greatest(
           greatest(i.cantidad,
                    (select coalesce(sum(ci.cantidad), 0)::integer from retail.compra_items ci join retail.compras c on c.id = ci.compra_id
                      where ci.orden_compra_item_id = i.id and c.estado = 'vigente'))
           - (select coalesce(sum(di.cantidad), 0)::integer from retail.despacho_items di join retail.despachos d on d.id = di.despacho_id
               where di.orden_compra_item_id = i.id and d.estado in ('en_camino', 'abierto', 'cerrado')),
           0)
    from retail.orden_compra_items i where i.id = p_item_id
$$;

create or replace function retail.mandar_compras_a_tienda(p_destino_id uuid, p_bultos integer, p_token uuid)
returns jsonb
language plpgsql security definer set search_path = retail, public, extensions as $$
declare
  v_actor uuid;
  v_lineas jsonb;
  v_resultado jsonb;
  v_existente uuid;
begin
  if retail.fn_ve_modulo('ordenes_compra') is not true then
    raise exception 'Mandar a la tienda necesita el módulo «Mi plata para compras» en tu rol' using errcode = '42501', hint = 'ordenes_compra_sin_modulo';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién manda el fardo' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  if p_token is null then
    raise exception 'Falta la marca del envío: vuelve a abrir la pantalla' using errcode = 'P0001', hint = 'compra_mandar_sin_token';
  end if;
  if p_bultos is null or p_bultos < 1 or p_bultos > 99 then
    raise exception 'Di cuántos fardos mandas: de 1 a 99' using errcode = 'P0001', hint = 'compra_mandar_bultos';
  end if;

  -- Un envío a la vez por compradora (dos toques en dos tiendas se ponen en fila), y el mismo envío repetido devuelve lo que ya salió:
  -- las líneas de hoy ya no serían las mismas (ya salieron), así que se reconoce por su marca antes de volver a armarlas.
  perform pg_advisory_xact_lock(hashtextextended('compra_mandar:' || v_actor::text, 0));
  v_existente := (select d.id from retail.despachos d where d.token_cliente = p_token);
  if v_existente is not null then
    if (select d.despachado_por from retail.despachos d where d.id = v_existente) <> v_actor then
      raise exception 'Ese envío ya se guardó con otros datos: recarga la pantalla' using errcode = 'P0001', hint = 'envio_otro_envio';
    end if;
    return retail.fn_envio_resultado(v_existente) || jsonb_build_object('bultos', (select d.bultos from retail.despachos d where d.id = v_existente));
  end if;

  -- Todo lo que compró para esa tienda y todavía no salió.
  v_lineas := (
    select jsonb_agg(jsonb_build_object('orden_compra_item_id', x.id, 'cantidad', x.queda) order by x.numero, x.posicion)
      from (select i.id, o.numero, i.posicion, retail.fn_compra_item_por_mandar(i.id) as queda
              from retail.compra_papeles p
              join retail.ordenes_compra o on o.papel_id = p.id
              join retail.orden_compra_items i on i.orden_compra_id = o.id
             where p.persona_id = v_actor and p.estado <> 'anulado' and o.estado = 'generada' and o.ubicacion_destino_id = p_destino_id) x
     where x.queda > 0);
  if v_lineas is null then
    raise exception 'Ya mandaste todo lo que compraste para esa tienda' using errcode = 'P0001', hint = 'compra_mandar_nada';
  end if;

  v_resultado := retail.crear_envio(p_destino_id, v_lineas, null, null, p_token);
  update retail.despachos set bultos = p_bultos where id = (v_resultado ->> 'despacho_id')::uuid;
  return v_resultado || jsonb_build_object('bultos', p_bultos);
end $$;

-- ---------- 4. «Terminé de comprar hoy» ----------
create table if not exists retail.compra_cierres (
  id uuid primary key default gen_random_uuid(),
  persona_id uuid not null references public.personas (id),
  fecha date not null,
  -- Qué hace con lo que tenía al cerrar: se lo queda para la próxima compra, lo devuelve en caja, o CAYLA le debe (pagó de su bolsillo).
  decision text not null check (decision in ('se_queda', 'devuelve', 'le_deben')),
  -- Lo que tenía al cerrar (siempre positivo: con «le_deben», lo que CAYLA le debe).
  monto numeric(12, 2) not null check (monto >= 0),
  -- Cuándo Compras lo recibió o lo pagó (actividad 7). Mientras sea nulo, cerrar otra vez el mismo día lo reemplaza.
  resuelto_en timestamptz,
  resuelto_por uuid references public.personas (id),
  cerrado_por uuid not null references public.personas (id),
  cerrado_en timestamptz not null default now(),
  constraint compra_cierres_uno_por_dia unique (persona_id, fecha),
  constraint compra_cierres_queda_sin_resolver check (decision <> 'se_queda' or resuelto_en is null)
);
comment on table retail.compra_cierres is
  'ADR-0480: «Terminé de comprar hoy» de una compradora: lo que tenía y qué hace con eso. Compras recibe la devolución o paga lo que se le debe.';

alter table retail.compra_cierres enable row level security;
revoke all on retail.compra_cierres from anon, authenticated;

create or replace function retail.fn_compra_cierres_resuelto_fijo()
returns trigger
language plpgsql
set search_path = retail, public, extensions
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Un cierre del día no se borra.' using errcode = 'P0001';
  end if;
  if old.resuelto_en is not null then
    raise exception 'Compras ya recibió este cierre: no cambia.' using errcode = 'P0001', hint = 'compra_cierre_resuelto';
  end if;
  if (new.id, new.persona_id, new.fecha) is distinct from (old.id, old.persona_id, old.fecha) then
    raise exception 'De quién y de qué día es un cierre no cambia.' using errcode = 'P0001';
  end if;
  return new;
end $$;

create or replace trigger compra_cierres_resuelto_fijo
  before update or delete on retail.compra_cierres
  for each row execute function retail.fn_compra_cierres_resuelto_fijo();

-- ---------- 5. Lo que tiene para comprar, en un solo lugar ----------
create or replace function retail.fn_mi_plata_tiene(p_persona uuid)
returns numeric
language plpgsql stable security definer set search_path = retail, public, extensions as $$
declare
  v_fondo uuid := retail.fn_fondo_de(p_persona, false);
begin
  return case when v_fondo is null then 0 else retail.fn_fondo_saldo(v_fondo) end
       + coalesce((select sum(a.monto) from retail.fondo_plata_anotada a where a.persona_id = p_persona and a.estado = 'por_confirmar'), 0)
       - coalesce((select sum(c.monto) from retail.compra_papeles c where c.persona_id = p_persona and c.estado = 'por_completar'), 0)
       - coalesce((select sum(g.monto) from retail.compra_gastos g where g.persona_id = p_persona and g.estado = 'por_completar'), 0);
end $$;

create or replace function retail.terminar_dia_compras(p_decision text)
returns jsonb
language plpgsql security definer set search_path = retail, public, extensions as $$
declare
  v_actor uuid;
  v_tiene numeric;
  v_decision text := lower(btrim(coalesce(p_decision, '')));
  v_hoy date := retail.fn_hoy_lima();
  v_resuelto timestamptz;
begin
  if retail.fn_ve_modulo('ordenes_compra') is not true then
    raise exception 'Terminar el día necesita el módulo «Mi plata para compras» en tu rol' using errcode = '42501', hint = 'ordenes_compra_sin_modulo';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién termina su día' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  -- Dos toques a la vez se ponen en fila: el segundo ve el cierre del primero.
  perform pg_advisory_xact_lock(hashtextextended('compra_cierre:' || v_actor::text || ':' || v_hoy::text, 0));

  -- Lo que tiene lo calcula la base, no la pantalla: el cierre dice lo que había de verdad al tocar el botón.
  v_tiene := retail.fn_mi_plata_tiene(v_actor);
  if v_tiene < 0 then
    v_decision := 'le_deben';
  elsif v_tiene = 0 then
    v_decision := 'se_queda';
  elsif v_decision not in ('se_queda', 'devuelve') then
    raise exception 'Elige qué haces con lo que te queda' using errcode = 'P0001', hint = 'compra_cierre_decision';
  end if;

  for v_resuelto in select c.resuelto_en from retail.compra_cierres c where c.persona_id = v_actor and c.fecha = v_hoy loop
    if v_resuelto is not null then
      raise exception 'Compras ya recibió tu cierre de hoy: si sigues comprando, ciérralo mañana' using errcode = 'P0001', hint = 'compra_cierre_resuelto';
    end if;
  end loop;

  insert into retail.compra_cierres (persona_id, fecha, decision, monto, cerrado_por)
  values (v_actor, v_hoy, v_decision, abs(v_tiene), v_actor)
  on conflict (persona_id, fecha) do update
     set decision = excluded.decision, monto = excluded.monto, cerrado_por = excluded.cerrado_por, cerrado_en = now();

  begin
    perform retail.fn_actividad_anotar('ordenes_compra', 'dia_compras_terminado',
      'terminó su día de compras' || case v_decision when 'devuelve' then ' y devuelve lo que le sobró'
                                                     when 'le_deben' then ': puso de su bolsillo' else '' end,
      v_actor, retail.fn_actividad_terminal_ahora(), null, null, 'compra_cierres', v_actor::text || ':' || v_hoy::text, now(),
      jsonb_build_object('decision', v_decision), 'vivo');
  exception when others then
    raise warning 'actividad: no se anotó el cierre del día: %', sqlerrm;
  end;
  return jsonb_build_object('decision', v_decision, 'monto', abs(v_tiene), 'fecha', v_hoy);
end $$;

-- «Tu plata para compras»: suma los gastos, lo que falta mandar a cada tienda y lo de hoy (para «Terminé»).
create or replace function retail.fn_mi_plata_compras()
returns jsonb
language plpgsql stable security definer set search_path = retail, public, extensions as $$
declare
  v_persona uuid;
  v_fondo uuid;
  v_hoy date := retail.fn_hoy_lima();
begin
  if not retail.fn_ve_modulo('ordenes_compra') then
    raise exception 'Ver tu plata para compras necesita el módulo Mi plata para compras en tu rol.' using errcode = '42501';
  end if;
  v_persona := retail.fn_persona_de_la_cuenta();
  if v_persona is null then
    return jsonb_build_object('persona', false);
  end if;
  v_fondo := retail.fn_fondo_de(v_persona, false);
  return jsonb_build_object(
    'persona', true,
    'saldo', case when v_fondo is null then 0 else retail.fn_fondo_saldo(v_fondo) end,
    'por_confirmar', coalesce((select sum(a.monto) from retail.fondo_plata_anotada a where a.persona_id = v_persona and a.estado = 'por_confirmar'), 0),
    'compras_por_completar', coalesce((select sum(c.monto) from retail.compra_papeles c where c.persona_id = v_persona and c.estado = 'por_completar'), 0),
    'gastos_por_completar', coalesce((select sum(g.monto) from retail.compra_gastos g where g.persona_id = v_persona and g.estado = 'por_completar'), 0),
    'puede_ya_tenia', not exists (select 1 from retail.cuentas_dinero c where c.tipo = 'fondo' and c.persona_id = v_persona)
                      and not exists (select 1 from retail.fondo_plata_anotada a where a.persona_id = v_persona),
    'anotada', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'medio', a.medio, 'monto', a.monto, 'monto_confirmado', a.monto_confirmado,
                                          'estado', a.estado, 'fecha', a.fecha, 'creado_en', a.created_at, 'con_foto', a.foto_ruta is not null)
                       order by a.created_at desc)
        from (select * from retail.fondo_plata_anotada x where x.persona_id = v_persona order by x.created_at desc limit 30) a), '[]'::jsonb),
    'compras', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id, 'proveedor', pr.nombre, 'tipo', c.tipo, 'monto', c.monto, 'estado', c.estado, 'fecha', c.fecha, 'creado_en', c.created_at,
               'prendas', (select coalesce(sum(i.cantidad), 0) from retail.ordenes_compra o join retail.orden_compra_items i on i.orden_compra_id = o.id
                            where o.papel_id = c.id),
               'tiendas', (select coalesce(jsonb_agg(distinct u.nombre), '[]'::jsonb) from retail.ordenes_compra o join retail.ubicaciones u on u.id = o.ubicacion_destino_id
                            where o.papel_id = c.id),
               -- Las tiendas a las que todavía no sale algo de esta compra.
               'por_mandar', (select coalesce(jsonb_agg(distinct u.nombre), '[]'::jsonb)
                                from retail.ordenes_compra o join retail.ubicaciones u on u.id = o.ubicacion_destino_id
                                join retail.orden_compra_items i on i.orden_compra_id = o.id
                               where o.papel_id = c.id and o.estado = 'generada' and retail.fn_compra_item_por_mandar(i.id) > 0))
             order by c.created_at desc)
        from (select * from retail.compra_papeles x where x.persona_id = v_persona order by x.created_at desc limit 30) c
        join retail.proveedores pr on pr.id = c.proveedor_id), '[]'::jsonb),
    'gastos', coalesce((
      select jsonb_agg(jsonb_build_object('id', g.id, 'concepto', g.concepto, 'nota', g.nota, 'monto', g.monto, 'estado', g.estado,
                                          'fecha', g.fecha, 'creado_en', g.created_at, 'con_foto', g.foto_ruta is not null)
                       order by g.created_at desc)
        from (select * from retail.compra_gastos x where x.persona_id = v_persona order by x.created_at desc limit 30) g), '[]'::jsonb),
    -- Lo que falta mandar, por tienda: cada compra con las prendas que van a esa tienda y todavía no salen.
    'por_mandar', coalesce((
      select jsonb_agg(jsonb_build_object('tienda_id', t.tienda_id, 'tienda', t.tienda, 'unidades', t.unidades, 'compras', t.compras) order by t.tienda)
        from (
          select o.ubicacion_destino_id as tienda_id, u.nombre as tienda, sum(x.queda)::integer as unidades,
                 jsonb_agg(jsonb_build_object('papel_id', p.id, 'proveedor', pr.nombre, 'nombre', coalesce(nullif(btrim(i.descripcion), ''), cat.nombre),
                                              'cantidad', x.queda) order by p.created_at, i.posicion) as compras
            from retail.compra_papeles p
            join retail.proveedores pr on pr.id = p.proveedor_id
            join retail.ordenes_compra o on o.papel_id = p.id
            join retail.ubicaciones u on u.id = o.ubicacion_destino_id
            join retail.orden_compra_items i on i.orden_compra_id = o.id
            join retail.categorias cat on cat.id = i.categoria_id
            cross join lateral (select retail.fn_compra_item_por_mandar(i.id) as queda) x
           where p.persona_id = v_persona and p.estado <> 'anulado' and o.estado = 'generada' and x.queda > 0
           group by o.ubicacion_destino_id, u.nombre) t), '[]'::jsonb),
    -- Lo de hoy, para «Terminé de comprar hoy».
    'hoy', jsonb_build_object(
      'fecha', v_hoy,
      'dieron', coalesce((select sum(a.monto) from retail.fondo_plata_anotada a where a.persona_id = v_persona and a.fecha = v_hoy and a.estado <> 'anulada'), 0),
      'compraste', coalesce((select sum(c.monto) from retail.compra_papeles c where c.persona_id = v_persona and c.fecha = v_hoy and c.estado <> 'anulado'), 0),
      'compras', (select count(*) from retail.compra_papeles c where c.persona_id = v_persona and c.fecha = v_hoy and c.estado <> 'anulado'),
      'gastaste', coalesce((select sum(g.monto) from retail.compra_gastos g where g.persona_id = v_persona and g.fecha = v_hoy and g.estado <> 'anulado'), 0),
      'cierre', (select jsonb_build_object('decision', k.decision, 'monto', k.monto, 'resuelto', k.resuelto_en is not null, 'cerrado_en', k.cerrado_en)
                   from retail.compra_cierres k where k.persona_id = v_persona and k.fecha = v_hoy)));
end $$;

revoke all on function retail.registrar_gasto_rapido(uuid, text, text, numeric, text) from public, anon;
revoke all on function retail.mandar_compras_a_tienda(uuid, integer, uuid) from public, anon;
revoke all on function retail.terminar_dia_compras(text) from public, anon;
revoke all on function retail.fn_mi_plata_tiene(uuid) from public, anon, authenticated;
revoke all on function retail.fn_compra_item_por_mandar(uuid) from public, anon, authenticated;
revoke all on function retail.fn_compra_gastos_inmutable() from public, anon, authenticated;
revoke all on function retail.fn_compra_cierres_resuelto_fijo() from public, anon, authenticated;
grant execute on function retail.registrar_gasto_rapido(uuid, text, text, numeric, text) to authenticated;
grant execute on function retail.mandar_compras_a_tienda(uuid, integer, uuid) to authenticated;
grant execute on function retail.terminar_dia_compras(text) to authenticated;

-- Firma sin combo con la cuenta de una persona (desde una terminal, el combo), como registrar una compra.
insert into retail.acciones_sin_responsable (clave, descripcion) values
  ('gasto_rapido', 'Anotar un gasto que no es ropa desde el celular (con la cuenta de una persona firma ella, desde una terminal se elige quién)'),
  ('compra_mandar', 'Mandar a una tienda lo que compraste para ella (con la cuenta de una persona firma ella, desde una terminal se elige quién)'),
  ('compra_terminar_dia', 'Terminar el día de compras (con la cuenta de una persona firma ella, desde una terminal se elige quién)')
on conflict (clave) do update set descripcion = excluded.descripcion;
