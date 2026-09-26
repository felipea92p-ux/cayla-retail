-- ============================================================================
-- 20260927210000_pedir_a_otra_sede.sql — CAYLA V2 · ADR-0242, tanda 4 (D-7; Felipe, 2026-09-26)
-- «Pedir a otra sede»: una tienda le pide prendas a otra para reponer, sin clienta de por medio.
--
-- EL PROBLEMA PRIMERO. Hoy, cuando a TRU se le acaba la talla M de una blusa que AQP tiene de sobra, la vendedora escribe
-- por WhatsApp y espera que alguien en AQP se acuerde de mandarla. Nadie ve el pedido en el sistema: no hay lista de
-- «me piden», no se sabe si salió, y cuando llega no queda rastro de que venía por un pedido. ADR-0233 ya resolvió esto
-- para UNA prenda con clienta (pedir para apartar); faltaba la reposición: varias prendas, sin clienta, que al llegar
-- solo entran al stock.
--
-- LA DECISIÓN (D-7): una sola tabla de pedidos entre sedes, `retail.separacion_pedidos`, con la clienta OPCIONAL.
--   · Con clienta = pedido para apartar (ADR-0233, igual que hoy): al llegar se aparta sola.
--   · Sin clienta = reposición: al llegar pasa a «recibido» y la prenda queda en el stock, sin apartar.
--   Descartada una tabla propia de Traslados: serían dos listas de pedidos y dos formas de enviarlos.
--
-- QUÉ HACE:
--   1. `separacion_pedidos`: la clienta pasa a opcional (las tres columnas juntas o ninguna), `grupo_id` junta las
--      prendas que se pidieron de una vez (un pedido de reposición = un grupo) y el estado nuevo `recibido` (fin de una
--      reposición que llegó). CHECKs que hacen imposible el estado a medias: una reposición nunca queda «llegó» ni
--      «apartado» (eso es de la clienta), un pedido con clienta nunca queda «recibido», y una reposición siempre tiene
--      grupo.
--   2. `pedir_a_otra_sede`: crea el grupo, una fila por prenda. Devuelve el `grupo_id`.
--   3. `enviar_pedido_a_otra_sede`: TODO el grupo sale en UN solo `iniciar_traslado` (el traslado de siempre).
--   4. `cancelar_pedido_a_otra_sede`: «No la tengo» (quien envía) o «Ya no la necesito» (quien pidió), mientras nada salió.
--   5. Al llegar: `fn_apartar_pedidos_que_llegaron` (desde 20260927160000 es AHÍ donde se decide, línea por línea, al
--      entrar cada prenda al stock; el disparador `trg_pedidos_al_llegar` solo cancela al cerrar lo que no llegó). Una
--      fila sin clienta pasa a `recibido` + `llego_en`; con clienta, exactamente lo de antes.
--      El disparador NO se toca: su cuerpo vivo («lo que sigue en camino al cerrar, no llegó → cancelado») ya sirve
--      igual para la reposición. Por eso esta migración no lleva ni `create trigger` ni `drop trigger`.
--   6. `fn_pedidos_para_apartar` (Apartados) sigue mostrando SOLO pedidos con clienta; `enviar_pedido_para_apartar` y
--      `cancelar_pedido_para_apartar` rechazan una fila de reposición (se envía y se cancela por grupo, desde Traslados).
--   7. `fn_pedidos_entre_sedes`: la lectura de Traslados (prefijo `fn_`: el loader la trata como lectura).
--
-- DECISIONES TÉCNICAS:
--   · Idempotencia de `pedir_a_otra_sede`: el `p_token` se guarda en `token_cliente` de la PRIMERA fila del grupo (las
--     demás, null: el UNIQUE admite muchos null). El reintento busca esa fila y devuelve su `grupo_id`. Un candado
--     consultivo por token (como `iniciar_traslado`, ADR-0190) hace que el doble clic espere al primero en vez de
--     chocar con el UNIQUE.
--   · Permisos: pedir y cancelar, quien ve Traslados o Análisis (desde Análisis se pide lo que falta); enviar, solo
--     Traslados (es un traslado). Siempre además operar la sede: pedir, la que pide; enviar, la que envía (lo vuelve a
--     comprobar `iniciar_traslado`); cancelar, cualquiera de las dos.
--   · El disponible se mira al pedir (cantidad − apartada, todas las sububicaciones del origen), como ADR-0233: pedir no
--     reserva nada en el origen. Si al enviar ya no alcanza, `iniciar_traslado` lo rechaza con el mensaje del stock y
--     quien envía puede responder «No la tengo».
--   · Llega parcial: si de 3 pedidas entran 2, la fila queda `recibido` (la cantidad pedida no se reescribe; lo que
--     entró de verdad está en `transferencia_recepciones`). Si no entra ninguna, el disparador la cancela al cerrar.
--   · Anular el traslado (ADR-0239) ya devuelve a «pedido» las filas en camino de ese envío: el grupo se puede enviar de
--     nuevo, en otro traslado.
--
-- CÓMO SE PEGA EN PRODUCCIÓN: una sola parte, tal cual (trae `retail.` y su `search_path`). Lleva `alter table` sobre
-- `separacion_pedidos` (vacía en producción al 2026-09-26, la leen Apartados y Productos) y `create or replace function`;
-- NINGUNA política ni `drop trigger` (ADR-0195: no se mezclan), así que no hay riesgo de 40P01 con el Asesor. RLS sigue
-- encendida sin políticas: la tabla solo se lee y escribe por funciones `security definer`. Idempotente: se puede pegar
-- dos veces. Va ANTES de la web que llama a estas funciones; la web de hoy (Apartados) no cambia su contrato.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- ---------------------------------------------------------------------------
-- 1. La tabla: clienta opcional, grupo y el estado «recibido»
-- ---------------------------------------------------------------------------
-- Los CHECK de cada columna de la clienta (no vacía, celular de 9 dígitos) ya aceptan null: solo cae el NOT NULL.
alter table retail.separacion_pedidos alter column clienta_nombres drop not null;
alter table retail.separacion_pedidos alter column clienta_apellidos drop not null;
alter table retail.separacion_pedidos alter column clienta_celular drop not null;
alter table retail.separacion_pedidos add column if not exists grupo_id uuid;

create index if not exists separacion_pedidos_grupo_idx on retail.separacion_pedidos (grupo_id) where grupo_id is not null;

-- La clienta va entera o no va: un pedido con nombre y sin celular no se podría avisar, y uno con celular y sin nombre no
-- se podría apartar.
alter table retail.separacion_pedidos drop constraint if exists separacion_pedidos_clienta_completa;
alter table retail.separacion_pedidos add constraint separacion_pedidos_clienta_completa
  check ((clienta_nombres is null) = (clienta_apellidos is null) and (clienta_nombres is null) = (clienta_celular is null));

alter table retail.separacion_pedidos drop constraint if exists separacion_pedidos_estado_check;
alter table retail.separacion_pedidos add constraint separacion_pedidos_estado_check
  check (estado in ('pedido', 'en_camino', 'llego', 'apartado', 'cancelado', 'recibido'));

-- Cada tipo de pedido solo recorre SUS estados: la reposición no se aparta («llegó» y «apartado» son de la clienta) y el
-- pedido con clienta no termina «recibido» (termina apartado o cancelado).
alter table retail.separacion_pedidos drop constraint if exists separacion_pedidos_estado_segun_clienta;
alter table retail.separacion_pedidos add constraint separacion_pedidos_estado_segun_clienta
  check (
    case when clienta_nombres is null
      then estado in ('pedido', 'en_camino', 'recibido', 'cancelado')
      else estado <> 'recibido'
    end
  );

-- Una reposición siempre pertenece a un grupo: se envía y se cancela por grupo.
alter table retail.separacion_pedidos drop constraint if exists separacion_pedidos_reposicion_con_grupo;
alter table retail.separacion_pedidos add constraint separacion_pedidos_reposicion_con_grupo
  check (clienta_nombres is not null or grupo_id is not null);

comment on column retail.separacion_pedidos.grupo_id is
  'ADR-0242 (D-7): las prendas que se pidieron juntas. Una reposición (sin clienta) siempre tiene grupo y se envía en UN traslado; un pedido para apartar (ADR-0233) no lo usa.';
comment on column retail.separacion_pedidos.clienta_nombres is
  'Con clienta = pedido para apartar (ADR-0233); null = reposición (ADR-0242, D-7). Nombres, apellidos y celular van los tres o ninguno (CHECK).';

-- ---------------------------------------------------------------------------
-- 2. Pedir (la sede a la que le falta)
-- ---------------------------------------------------------------------------
-- p_lineas: [{"variante_id": "...", "cantidad": 1}, ...] — hasta 100 líneas, cantidades > 0; una prenda repetida se suma.
create or replace function retail.pedir_a_otra_sede(
  p_ubicacion_id uuid,
  p_origen_id uuid,
  p_lineas jsonb,
  p_nota text default null,
  p_token uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_grupo uuid;
  v_persona uuid;
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  v_origen text;
  v_primera boolean := true;
  r record;
begin
  -- ADR-0190: doble clic. El segundo intento con el mismo token espera al primero y devuelve SU grupo.
  if p_token is not null then
    perform pg_advisory_xact_lock(hashtextextended('separacion_pedidos:' || p_token::text, 0));
    select grupo_id into v_grupo from separacion_pedidos where token_cliente = p_token;
    if found then
      if v_grupo is null then
        raise exception 'Ese intento ya se usó para otro pedido: vuelve a intentarlo';
      end if;
      return v_grupo;
    end if;
  end if;

  if not (fn_ve_modulo('traslados') or fn_ve_modulo('analisis')) then
    raise exception 'Tu rol no tiene Traslados ni Análisis' using errcode = '42501';
  end if;
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para pedir para esa sede' using errcode = '42501';
  end if;
  if p_origen_id is null or p_ubicacion_id = p_origen_id then
    raise exception 'Las prendas se piden a OTRA sede';
  end if;
  if (select count(*) from ubicaciones where id in (p_ubicacion_id, p_origen_id) and tipo = 'tienda') <> 2 then
    raise exception 'Solo se pide entre tiendas';
  end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'Pide al menos una prenda';
  end if;
  if jsonb_array_length(p_lineas) > 100 then
    raise exception 'Un pedido lleva hasta 100 prendas distintas: pártelo en dos';
  end if;
  -- Cada línea: una prenda (uuid) y una cantidad entera mayor a cero. `case` para no convertir antes de validar.
  if exists (
    select 1 from jsonb_array_elements(p_lineas) e
     where jsonb_typeof(e) <> 'object'
        or coalesce(e ->> 'variante_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        or case when coalesce(e ->> 'cantidad', '') ~ '^[0-9]{1,6}$' then (e ->> 'cantidad')::integer < 1 else true end
  ) then
    raise exception 'Cada prenda del pedido lleva una cantidad mayor a cero';
  end if;
  if v_nota is not null and char_length(v_nota) > 200 then
    raise exception 'La nota tiene hasta 200 letras';
  end if;
  select nombre into v_origen from ubicaciones where id = p_origen_id;

  -- Una prenda repetida se suma: el pedido es «cuántas de cada una».
  for r in
    select (e ->> 'variante_id')::uuid as variante_id, sum((e ->> 'cantidad')::integer)::integer as cantidad,
           min(o) as orden
      from jsonb_array_elements(p_lineas) with ordinality as x(e, o)
     group by 1
     order by 3
  loop
    if not exists (select 1 from variantes where id = r.variante_id and activo) then
      raise exception 'Una de las prendas no existe o está descontinuada';
    end if;
    perform 1 from (
      select coalesce(sum(st.cantidad - st.cantidad_apartada), 0) as disponible
        from stock st where st.variante_id = r.variante_id and st.ubicacion_id = p_origen_id
    ) d where d.disponible >= r.cantidad;
    if not found then
      raise exception '% ya no tiene % de «%» (quedan %)',
        coalesce(v_origen, 'La otra sede'), r.cantidad,
        (select p.referencia || coalesce(' · ' || co.nombre, '') || coalesce(' · ' || ta.valor, '')
           from variantes va join productos p on p.id = va.producto_id
           left join colores co on co.codigo = va.color_codigo left join tallas ta on ta.id = va.talla_id
          where va.id = r.variante_id),
        greatest((select coalesce(sum(st.cantidad - st.cantidad_apartada), 0) from stock st
                   where st.variante_id = r.variante_id and st.ubicacion_id = p_origen_id), 0);
    end if;

    if v_grupo is null then
      v_grupo := gen_random_uuid();
      v_persona := fn_actor_persona_id(true);
    end if;
    insert into separacion_pedidos (ubicacion_id, ubicacion_origen_id, variante_id, cantidad, nota, creado_por,
                                    grupo_id, token_cliente)
      values (p_ubicacion_id, p_origen_id, r.variante_id, r.cantidad, v_nota, v_persona,
              v_grupo, case when v_primera then p_token end);
    v_primera := false;
  end loop;
  return v_grupo;
end;
$$;

comment on function retail.pedir_a_otra_sede(uuid, uuid, jsonb, text, uuid) is
  'ADR-0242 (D-7): la sede p_ubicacion_id le pide a p_origen_id prendas para reponer (sin clienta). Una fila por prenda con un grupo_id común, que devuelve. Traslados o Análisis + operar la sede que pide; entre tiendas; comprueba el disponible del origen. Con token, el reintento devuelve el mismo grupo.';

-- ---------------------------------------------------------------------------
-- 3. Enviar (la sede a la que le piden): TODO el grupo en un solo traslado
-- ---------------------------------------------------------------------------
create or replace function retail.enviar_pedido_a_otra_sede(
  p_grupo_id uuid,
  p_fecha_estimada_llegada timestamptz,
  p_token uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_destino uuid;
  v_origen uuid;
  v_nota text;
  v_items jsonb;
  v_tr uuid;
  v_persona uuid;
  v_sede text;
  v_con_clienta boolean;
begin
  -- Candado de las filas del grupo en orden fijo: dos «Enviar» a la vez se ponen en fila y el segundo ve «en camino».
  perform 1 from separacion_pedidos where grupo_id = p_grupo_id order by id for update;
  if not found then
    raise exception 'Ese pedido no existe';
  end if;
  select ubicacion_id, ubicacion_origen_id, nota, bool_or(clienta_nombres is not null)
    into v_destino, v_origen, v_nota, v_con_clienta
    from separacion_pedidos where grupo_id = p_grupo_id
   group by ubicacion_id, ubicacion_origen_id, nota
   limit 1;
  if v_con_clienta then
    raise exception 'Ese pedido es para apartar: se envía desde Apartados';
  end if;
  if not fn_ve_modulo('traslados') then
    raise exception 'Tu rol no tiene el módulo Traslados' using errcode = '42501';
  end if;
  if not fn_puede_operar_ubicacion(v_origen) then
    raise exception 'Solo la sede a la que le pidieron envía el pedido' using errcode = '42501';
  end if;

  if not exists (select 1 from separacion_pedidos where grupo_id = p_grupo_id and estado = 'pedido') then
    -- Reintento: ya salió (o ya llegó) — devuelve su traslado.
    select transferencia_id into v_tr from separacion_pedidos
     where grupo_id = p_grupo_id and transferencia_id is not null and estado in ('en_camino', 'recibido')
     order by id limit 1;
    if v_tr is not null then
      return v_tr;
    end if;
    raise exception 'Ese pedido ya no está por enviar (se canceló)';
  end if;

  select jsonb_agg(jsonb_build_object('variante_id', variante_id, 'cantidad', cantidad) order by id)
    into v_items
    from separacion_pedidos where grupo_id = p_grupo_id and estado = 'pedido';
  select nombre into v_sede from ubicaciones where id = v_destino;
  -- `iniciar_traslado` comprueba que se opera el origen, el stock y firma con el responsable (y su token, ADR-0190).
  v_tr := iniciar_traslado(
    v_origen, v_destino, v_items, p_fecha_estimada_llegada,
    left('Reposición pedida por ' || coalesce(v_sede, 'otra tienda') || coalesce(' · ' || v_nota, ''), 200),
    p_token
  );
  v_persona := fn_actor_persona_id(true);
  update separacion_pedidos set estado = 'en_camino', transferencia_id = v_tr, enviado_por = v_persona
   where grupo_id = p_grupo_id and estado = 'pedido';
  return v_tr;
end;
$$;

comment on function retail.enviar_pedido_a_otra_sede(uuid, timestamptz, uuid) is
  'ADR-0242 (D-7): la sede a la que le pidieron envía TODO el grupo (lo que sigue «pedido») en un solo iniciar_traslado. Módulo Traslados + operar el origen. Reintento: si ya salió, devuelve el mismo traslado.';

-- ---------------------------------------------------------------------------
-- 4. Cancelar: «No la tengo» (quien envía) o «Ya no la necesito» (quien pidió), mientras nada salió
-- ---------------------------------------------------------------------------
create or replace function retail.cancelar_pedido_a_otra_sede(p_grupo_id uuid, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_destino uuid;
  v_origen uuid;
  v_con_clienta boolean;
  v_persona uuid;
begin
  perform 1 from separacion_pedidos where grupo_id = p_grupo_id order by id for update;
  if not found then
    raise exception 'Ese pedido no existe';
  end if;
  select ubicacion_id, ubicacion_origen_id, bool_or(clienta_nombres is not null)
    into v_destino, v_origen, v_con_clienta
    from separacion_pedidos where grupo_id = p_grupo_id
   group by ubicacion_id, ubicacion_origen_id
   limit 1;
  if v_con_clienta then
    raise exception 'Ese pedido es para apartar: se cancela desde Apartados';
  end if;
  if not (fn_ve_modulo('traslados') or fn_ve_modulo('analisis')) then
    raise exception 'Tu rol no tiene Traslados ni Análisis' using errcode = '42501';
  end if;
  if not (fn_puede_operar_ubicacion(v_destino) or fn_puede_operar_ubicacion(v_origen)) then
    raise exception 'No tienes permiso sobre ese pedido' using errcode = '42501';
  end if;
  if not exists (select 1 from separacion_pedidos where grupo_id = p_grupo_id and estado = 'pedido') then
    if not exists (select 1 from separacion_pedidos where grupo_id = p_grupo_id and estado <> 'cancelado') then
      return;   -- reintento: ya estaba cancelado
    end if;
    raise exception 'Ese pedido ya salió: para deshacerlo, anula el traslado';
  end if;
  v_persona := fn_actor_persona_id(true);
  update separacion_pedidos
     set estado = 'cancelado', cancelado_por = v_persona, cancelado_motivo = left(nullif(btrim(coalesce(p_motivo, '')), ''), 200)
   where grupo_id = p_grupo_id and estado = 'pedido';
end;
$$;

comment on function retail.cancelar_pedido_a_otra_sede(uuid, text) is
  'ADR-0242 (D-7): cancela lo que sigue «pedido» de un grupo de reposición. Cualquiera de las dos sedes (Traslados o Análisis). Lo que ya salió se deshace anulando el traslado (ADR-0239), no aquí.';

-- ---------------------------------------------------------------------------
-- 5. Al llegar: con clienta se aparta (ADR-0233, sin cambios); sin clienta queda «recibido»
-- ---------------------------------------------------------------------------
-- Parte de la definición de producción (idéntica a 20260927160000, verificada el 2026-09-26). Solo se agrega la rama
-- de la reposición. La llaman `confirmar_traslado` y `cerrar_traslado_con_diferencia` al hacer entrar cada línea.
create or replace function retail.fn_apartar_pedidos_que_llegaron(
  p_transferencia_id uuid,
  p_variante_id uuid,
  p_sububicacion_id uuid,
  p_cantidad integer
)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  pe separacion_pedidos%rowtype;
  v_resto integer := coalesce(p_cantidad, 0);
  v_apartar integer;
  v_apartado uuid;
begin
  for pe in
    select * from separacion_pedidos
     where transferencia_id = p_transferencia_id and variante_id = p_variante_id and estado = 'en_camino'
     order by created_at, id
     for update
  loop
    -- Lo que entró se reparte entre los pedidos en el orden en que se pidieron; el que se queda sin prenda sigue
    -- «en camino» y el disparador lo cancela al cerrarse el traslado.
    exit when v_resto <= 0;
    v_apartar := least(pe.cantidad, v_resto);
    v_resto := v_resto - v_apartar;
    -- ADR-0242 (D-7): una reposición no se aparta: la prenda ya entró al stock, el pedido solo se da por recibido.
    if pe.clienta_nombres is null then
      update separacion_pedidos set estado = 'recibido', llego_en = now() where id = pe.id;
      continue;
    end if;
    v_apartado := null;
    begin
      v_apartado := apartar_stock(pe.variante_id, pe.ubicacion_id, v_apartar,
                                  pe.clienta_nombres || ' ' || pe.clienta_apellidos, pe.clienta_celular, fn_hoy_lima() + 3,
                                  'Pedido para apartar: llegó de otra tienda',
                                  p_sububicacion_id);
    exception when others then
      raise warning 'pedido para apartar %: llegó pero no se pudo guardar solo (%)', pe.id, sqlerrm;
    end;
    update separacion_pedidos set estado = 'llego', apartado_id = v_apartado, llego_en = now() where id = pe.id;
  end loop;
end;
$$;
revoke all on function retail.fn_apartar_pedidos_que_llegaron(uuid, uuid, uuid, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Apartados sigue viendo y tocando SOLO los pedidos con clienta
-- ---------------------------------------------------------------------------
-- Las tres, desde su definición de producción (iguales a 20260927140000, verificadas el 2026-09-26), misma firma.
create or replace function retail.fn_pedidos_para_apartar(p_ubicacion_id uuid)
returns table (
  id uuid, direccion text, otra_sede text, variante_id uuid, cantidad integer,
  clienta_nombres text, clienta_apellidos text, clienta_celular text, nota text, estado text,
  created_at timestamptz, llego_en timestamptz, guardada_hasta date, traslado_numero integer, cancelado_motivo text
)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select pe.id,
         case when pe.ubicacion_id = p_ubicacion_id then 'pedi' else 'me_piden' end,
         u.nombre, pe.variante_id, pe.cantidad, pe.clienta_nombres, pe.clienta_apellidos, pe.clienta_celular, pe.nota, pe.estado,
         pe.created_at, pe.llego_en, a.vence_el, t.numero, pe.cancelado_motivo
    from separacion_pedidos pe
    join ubicaciones u on u.id = case when pe.ubicacion_id = p_ubicacion_id then pe.ubicacion_origen_id else pe.ubicacion_id end
    left join apartados a on a.id = pe.apartado_id and a.estado = 'abierto'
    left join transferencias t on t.id = pe.transferencia_id
   where (pe.ubicacion_id = p_ubicacion_id or pe.ubicacion_origen_id = p_ubicacion_id)
     and pe.clienta_nombres is not null   -- ADR-0242 (D-7): la reposición vive en Traslados, no en Apartados
     and fn_puede_operar_ubicacion(p_ubicacion_id)
     and (pe.estado in ('pedido', 'en_camino', 'llego') or pe.created_at > now() - interval '7 days')
   order by case pe.estado when 'llego' then 0 when 'pedido' then 1 when 'en_camino' then 2 else 3 end, pe.created_at desc
   limit 100;
$$;

create or replace function retail.enviar_pedido_para_apartar(p_pedido_id uuid, p_fecha_estimada_llegada timestamptz, p_token uuid default null)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  pe separacion_pedidos%rowtype;
  v_tr uuid;
  v_persona uuid;
  v_sede text;
begin
  select * into pe from separacion_pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'Ese pedido no existe';
  end if;
  -- ADR-0242 (D-7): una reposición se envía entera (su grupo) desde Traslados, no prenda por prenda.
  if pe.clienta_nombres is null then
    raise exception 'Ese pedido es una reposición: se envía desde Traslados';
  end if;
  if pe.estado = 'en_camino' and pe.transferencia_id is not null then
    return pe.transferencia_id;
  end if;
  if pe.estado <> 'pedido' then
    raise exception 'Ese pedido ya no está por enviar (está %)', pe.estado;
  end if;
  if not (fn_ve_modulo('apartados') or fn_ve_modulo('traslados')) then
    raise exception 'Tu rol no tiene Apartados ni Traslados' using errcode = '42501';
  end if;
  select nombre into v_sede from ubicaciones where id = pe.ubicacion_id;
  v_tr := iniciar_traslado(
    pe.ubicacion_origen_id, pe.ubicacion_id,
    jsonb_build_array(jsonb_build_object('variante_id', pe.variante_id, 'cantidad', pe.cantidad)),
    p_fecha_estimada_llegada,
    left('Para apartar a ' || pe.clienta_nombres || ' ' || pe.clienta_apellidos || ' (pedido de ' || coalesce(v_sede, 'otra tienda') || ')', 200),
    p_token
  );
  v_persona := fn_actor_persona_id(true);
  update separacion_pedidos set estado = 'en_camino', transferencia_id = v_tr, enviado_por = v_persona where id = pe.id;
  return v_tr;
end;
$$;

create or replace function retail.cancelar_pedido_para_apartar(p_pedido_id uuid, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  pe separacion_pedidos%rowtype;
  v_persona uuid;
begin
  select * into pe from separacion_pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'Ese pedido no existe';
  end if;
  -- ADR-0242 (D-7): una reposición se cancela entera (su grupo) desde Traslados.
  if pe.clienta_nombres is null then
    raise exception 'Ese pedido es una reposición: se cancela desde Traslados';
  end if;
  if not (fn_puede_operar_ubicacion(pe.ubicacion_id) or fn_puede_operar_ubicacion(pe.ubicacion_origen_id)) then
    raise exception 'No tienes permiso sobre ese pedido' using errcode = '42501';
  end if;
  if pe.estado not in ('pedido', 'llego') then
    raise exception 'Ese pedido ya no se puede cancelar (está %)', pe.estado;
  end if;
  v_persona := fn_actor_persona_id(true);
  if pe.apartado_id is not null and exists (select 1 from apartados where id = pe.apartado_id and estado = 'abierto') then
    perform fn_cerrar_apartado_de_separacion(pe.apartado_id, 'clienta_no_vino', v_persona);
  end if;
  update separacion_pedidos
     set estado = 'cancelado', cancelado_por = v_persona, cancelado_motivo = nullif(btrim(coalesce(p_motivo, '')), '')
   where id = pe.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Lectura de Traslados: lo que pedí y lo que me piden (reposición), abierto + lo cerrado de los últimos 7 días
-- ---------------------------------------------------------------------------
-- Un renglón por grupo. `estado` del grupo: «pedido» si algo espera salir, si no «en_camino» si algo viaja, si no
-- «recibido» si algo llegó, si no «cancelado». `lineas` trae cada prenda con su disponible HOY en la sede que envía.
create or replace function retail.fn_pedidos_entre_sedes(p_ubicacion_id uuid)
returns table (
  grupo_id uuid, direccion text, otra_sede text, otra_sede_id uuid, estado text, created_at timestamptz,
  creado_por_nombre text, nota text, traslado_id uuid, traslado_numero integer, cancelado_motivo text, lineas jsonb
)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  with g as (
    select pe.grupo_id,
           pe.ubicacion_id,
           pe.ubicacion_origen_id,
           pe.creado_por,
           pe.nota,
           min(pe.created_at) as created_at,
           max(coalesce(pe.llego_en, pe.created_at)) as ultimo,
           case
             when bool_or(pe.estado = 'pedido') then 'pedido'
             when bool_or(pe.estado = 'en_camino') then 'en_camino'
             when bool_or(pe.estado = 'recibido') then 'recibido'
             else 'cancelado'
           end as estado,
           (array_agg(pe.transferencia_id order by pe.id) filter (where pe.transferencia_id is not null))[1] as traslado_id,
           (array_agg(pe.cancelado_motivo order by pe.id) filter (where pe.cancelado_motivo is not null))[1] as cancelado_motivo,
           jsonb_agg(jsonb_build_object(
             'pedido_id', pe.id,
             'variante_id', pe.variante_id,
             'producto', p.referencia,
             'color', co.nombre,
             'talla', ta.valor,
             'sku', coalesce(va.codigo, va.sku),
             'cantidad', pe.cantidad,
             'estado', pe.estado,
             'disponible_en_origen', greatest((
               select coalesce(sum(st.cantidad - st.cantidad_apartada), 0)
                 from stock st where st.variante_id = pe.variante_id and st.ubicacion_id = pe.ubicacion_origen_id), 0)
           ) order by p.referencia, co.nombre nulls first, ta.valor nulls first) as lineas
      from separacion_pedidos pe
      join variantes va on va.id = pe.variante_id
      join productos p on p.id = va.producto_id
      left join colores co on co.codigo = va.color_codigo
      left join tallas ta on ta.id = va.talla_id
     where pe.grupo_id is not null
       and pe.clienta_nombres is null
       and (pe.ubicacion_id = p_ubicacion_id or pe.ubicacion_origen_id = p_ubicacion_id)
       and fn_puede_operar_ubicacion(p_ubicacion_id)
     group by pe.grupo_id, pe.ubicacion_id, pe.ubicacion_origen_id, pe.creado_por, pe.nota
  )
  select g.grupo_id,
         case when g.ubicacion_id = p_ubicacion_id then 'pedi' else 'me_piden' end,
         u.nombre,
         u.id,
         g.estado,
         g.created_at,
         nullif(btrim(coalesce(per.nombres, '') || ' ' || coalesce(per.apellidos, '')), ''),
         g.nota,
         g.traslado_id,
         t.numero,
         g.cancelado_motivo,
         g.lineas
    from g
    join ubicaciones u on u.id = case when g.ubicacion_id = p_ubicacion_id then g.ubicacion_origen_id else g.ubicacion_id end
    left join public.personas per on per.id = g.creado_por
    left join transferencias t on t.id = g.traslado_id
   where g.estado in ('pedido', 'en_camino') or g.ultimo > now() - interval '7 days'
   order by case g.estado when 'pedido' then 0 when 'en_camino' then 1 else 2 end, g.created_at desc
   limit 100;
$$;

comment on function retail.fn_pedidos_entre_sedes(uuid) is
  'ADR-0242 (D-7): los pedidos de reposición (sin clienta) que la sede hizo (pedi) o le hicieron (me_piden), uno por grupo: abiertos y lo cerrado de los últimos 7 días, con sus líneas y el disponible de hoy en la sede que envía. Exige operar la sede.';

-- ---------------------------------------------------------------------------
-- 8. Permisos (como 20260927140000): nada para anon; authenticated ejecuta las de la pantalla
-- ---------------------------------------------------------------------------
revoke all on function retail.pedir_a_otra_sede(uuid, uuid, jsonb, text, uuid) from public, anon;
revoke all on function retail.enviar_pedido_a_otra_sede(uuid, timestamptz, uuid) from public, anon;
revoke all on function retail.cancelar_pedido_a_otra_sede(uuid, text) from public, anon;
revoke all on function retail.fn_pedidos_entre_sedes(uuid) from public, anon;
revoke all on function retail.enviar_pedido_para_apartar(uuid, timestamptz, uuid) from public, anon;
revoke all on function retail.cancelar_pedido_para_apartar(uuid, text) from public, anon;
revoke all on function retail.fn_pedidos_para_apartar(uuid) from public, anon;
grant execute on function retail.pedir_a_otra_sede(uuid, uuid, jsonb, text, uuid) to authenticated;
grant execute on function retail.enviar_pedido_a_otra_sede(uuid, timestamptz, uuid) to authenticated;
grant execute on function retail.cancelar_pedido_a_otra_sede(uuid, text) to authenticated;
grant execute on function retail.fn_pedidos_entre_sedes(uuid) to authenticated;
grant execute on function retail.enviar_pedido_para_apartar(uuid, timestamptz, uuid) to authenticated;
grant execute on function retail.cancelar_pedido_para_apartar(uuid, text) to authenticated;
grant execute on function retail.fn_pedidos_para_apartar(uuid) to authenticated;
