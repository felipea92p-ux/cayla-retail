-- Actividad de Apartados y editar un apartado abierto (Apartados v2, paso 4 — ADR-0236).
--
-- 1. ACTIVIDAD (receta de ADR-0207). EL PROBLEMA: el líder no tenía cómo saber quién apartó, abonó, avisó, extendió,
--    liberó o devolvió, ni cuándo. LA DECISIÓN: el mismo diario `retail.actividad` que ya usan Vender, Caja y Cambios,
--    alimentado por disparadores AFTER sobre las tablas de Apartados. Cada disparador anota con `fn_actividad_anotar`
--    y, si algo falla al describir, avisa con un WARNING y NO tumba la operación (la actividad es un reflejo, no un
--    candado). La web lo lee con `fn_actividad('apartados', …)`, que ya existe.
--
-- 2. EDITAR. EL PROBLEMA: si la clienta cambiaba de talla o sumaba una prenda, había que liberar y volver a apartar:
--    otro código, otro anticipo, y a veces la prenda se la llevaba otra caja en el medio. LA DECISIÓN: `editar_separacion`
--    quita y suma prendas en UNA transacción (todo o nada): libera el apartado de lo que se quita (movimiento
--    `liberacion_apartado`, como siempre), aparta lo nuevo con la misma puerta de ADR-0141 (`apartar_stock`), con el
--    precio y la campaña de HOY (mismo candado que `separar_prendas`), y recalcula el total. Lo que se quita no se borra:
--    su fila pasa a `separacion_items_retirados` con la edición que la sacó, y cada edición queda en
--    `separacion_ediciones` (antes y después). El anticipo ya emitido no cambia. Si el nuevo total quedara POR DEBAJO de
--    lo que la clienta ya pagó, se rechaza: qué hacer con esa diferencia (devolver o saldo a favor) lo decide Felipe
--    (pregunta abierta del README del spike); hoy no existe el saldo de clienta.
--
-- PRODUCCIÓN. Tablas y funciones nuevas, disparadores con `create or replace trigger` (nunca drop trigger). Sin
-- políticas. Una sola parte. Idempotente. Va DESPUÉS de 20260927100000 (lee `separacion_abonos`).

set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- ---------------------------------------------------------------------------
-- Editar: tablas
-- ---------------------------------------------------------------------------
create table if not exists retail.separacion_ediciones (
  id uuid primary key default gen_random_uuid(),
  separacion_id uuid not null references retail.separaciones (id),
  items_antes jsonb not null,
  items_despues jsonb not null,
  total_antes numeric(12, 2) not null,
  total_despues numeric(12, 2) not null,
  creado_por uuid references public.personas (id),
  token_cliente uuid unique,
  created_at timestamptz not null default now()
);
create index if not exists separacion_ediciones_separacion_idx on retail.separacion_ediciones (separacion_id, created_at);
alter table retail.separacion_ediciones enable row level security;
revoke all on retail.separacion_ediciones from anon, authenticated;

-- La fila de una prenda que se sacó del apartado, tal cual estaba (mismo id), con la edición que la sacó.
create table if not exists retail.separacion_items_retirados (
  id uuid primary key,
  separacion_id uuid not null references retail.separaciones (id),
  variante_id uuid not null references retail.variantes (id),
  cantidad integer not null,
  precio_unitario numeric(12, 2) not null,
  descuento_unitario numeric(12, 2) not null,
  descuento_etiqueta_id uuid,
  apartado_id uuid references retail.apartados (id),
  edicion_id uuid not null references retail.separacion_ediciones (id),
  retirado_por uuid references public.personas (id),
  retirado_en timestamptz not null default now()
);
alter table retail.separacion_items_retirados enable row level security;
revoke all on retail.separacion_items_retirados from anon, authenticated;

-- ---------------------------------------------------------------------------
-- editar_separacion
--   p_quitar:  ids de `separacion_items` que salen del apartado.
--   p_agregar: [{variante_id, cantidad, precio_unitario, descuento_unitario}] — como `separar_prendas`.
-- ---------------------------------------------------------------------------
create or replace function retail.editar_separacion(
  p_separacion_id uuid,
  p_quitar uuid[] default '{}',
  p_agregar jsonb default '[]'::jsonb,
  p_token uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  c_cargo_especial constant uuid := '22222222-2222-4222-8222-222222222222';
  c_tope_boleta_sin_dni constant numeric := 700;
  s separaciones%rowtype;
  v_hoy date := fn_hoy_lima();
  v_persona uuid;
  v_existente separacion_ediciones%rowtype;
  v_antes jsonb;
  v_despues jsonb;
  v_quitados jsonb := '[]'::jsonb;
  v_it separacion_items%rowtype;
  v_item record;
  v_precio numeric; v_ref text; v_sku text;
  v_c_etq uuid; v_c_pct numeric; v_c_unit numeric;
  v_apartado uuid;
  v_total numeric;
  v_edicion uuid;
  v_q uuid;
begin
  if p_token is not null then
    select * into v_existente from separacion_ediciones where token_cliente = p_token;
    if found then
      return jsonb_build_object('edicion_id', v_existente.id, 'total', v_existente.total_despues);
    end if;
  end if;
  if not fn_ve_modulo('apartados') then
    raise exception 'Tu rol no tiene el módulo Apartados' using errcode = '42501';
  end if;
  select * into s from separaciones where id = p_separacion_id for update;
  if not found then
    raise exception 'Ese apartado no existe';
  end if;
  if not fn_puede_operar_ubicacion(s.ubicacion_id) then
    raise exception 'No tienes permiso sobre los apartados de esa tienda' using errcode = '42501';
  end if;
  if s.estado <> 'abierta' then
    raise exception 'Solo se edita un apartado abierto (el % está %)', s.codigo, s.estado;
  end if;
  if coalesce(array_length(p_quitar, 1), 0) = 0 and (p_agregar is null or jsonb_array_length(p_agregar) = 0) then
    raise exception 'No hay nada que cambiar en el apartado';
  end if;
  if p_agregar is not null and jsonb_typeof(p_agregar) <> 'array' then
    raise exception 'Las prendas a sumar vienen mal formadas';
  end if;
  v_persona := fn_actor_persona_id(true);

  -- ADR-0190: los candados en orden fijo (lo que ya tiene y lo que suma) antes de mover nada.
  perform fn_bloquear_en_orden(
    s.ubicacion_id,
    array(select si.variante_id from separacion_items si where si.separacion_id = s.id
          union select v from unnest(fn_ids_de_items(coalesce(p_agregar, '[]'::jsonb))) v)
  );

  select coalesce(jsonb_agg(to_jsonb(si) order by si.id), '[]'::jsonb) into v_antes
    from separacion_items si where si.separacion_id = s.id;

  -- Lo que sale: se libera su apartado (la prenda vuelve a estar disponible) y la fila pasa al archivo.
  foreach v_q in array coalesce(p_quitar, '{}') loop
    select * into v_it from separacion_items where id = v_q and separacion_id = s.id;
    if not found then
      raise exception 'Esa prenda no es de este apartado (o ya se quitó)';
    end if;
    perform fn_cerrar_apartado_de_separacion(v_it.apartado_id, 'otro', v_persona);
    v_quitados := v_quitados || jsonb_build_array(to_jsonb(v_it));
    delete from separacion_items where id = v_it.id;
  end loop;

  -- Lo que entra: mismo candado de precio y campaña que `separar_prendas`, y la misma puerta para apartar.
  for v_item in
    select (e ->> 'variante_id')::uuid as variante_id,
           sum((e ->> 'cantidad')::integer)::integer as cantidad,
           max((e ->> 'precio_unitario')::numeric) as precio_unitario,
           max(coalesce((e ->> 'descuento_unitario')::numeric, 0)) as descuento_unitario
      from jsonb_array_elements(coalesce(p_agregar, '[]'::jsonb)) e
     group by 1
  loop
    if v_item.variante_id = c_cargo_especial then
      raise exception 'El monto manual no se puede apartar: aparta la prenda escaneando su etiqueta';
    end if;
    if v_item.cantidad is null or v_item.cantidad < 1 then
      raise exception 'La cantidad a sumar debe ser al menos 1';
    end if;
    select v.precio, p.referencia, v.sku into v_precio, v_ref, v_sku
      from variantes v join productos p on p.id = v.producto_id
     where v.id = v_item.variante_id and v.activo;
    if v_precio is null then
      raise exception 'Esa prenda no existe o está descontinuada';
    end if;
    if not fn_variante_permitida_en_sede(v_item.variante_id, s.ubicacion_id) then
      raise exception 'venta_variante_restringida_a_otra_sede' using detail = v_ref || ' (' || coalesce(v_sku, '') || ')';
    end if;
    if round(v_item.precio_unitario, 2) <> round(v_precio, 2) then
      raise exception 'venta_precio_cambiado'
        using detail = v_ref || ' (' || coalesce(v_sku, '') || ')',
              hint = format('En catálogo vale S/%s y la caja mandó S/%s', v_precio, v_item.precio_unitario);
    end if;
    v_c_etq := null; v_c_pct := null;
    select c.etiqueta_id, c.descuento_pct into v_c_etq, v_c_pct
      from fn_campanas_por_variante(v_hoy, 0, array[v_item.variante_id]) c
     order by c.descuento_pct desc, c.etiqueta_nombre, c.etiqueta_id
     limit 1;
    v_c_unit := case when v_c_pct is null then 0 else retail.fn_descuento_campana(v_precio, v_c_pct) end;
    if abs(v_item.descuento_unitario - v_c_unit) > 0.011 then
      raise exception 'separacion_descuento_no_coincide'
        using detail = v_ref || ' (' || coalesce(v_sku, '') || ')',
              hint = format('Hoy corresponde S/%s de descuento (campaña) y la caja mandó S/%s', v_c_unit, v_item.descuento_unitario);
    end if;
    v_apartado := apartar_stock(v_item.variante_id, s.ubicacion_id, v_item.cantidad,
                                s.clienta_nombres || ' ' || s.clienta_apellidos, s.clienta_celular, s.vence_el,
                                'Apartado ' || s.codigo, null::uuid);
    update apartados set separacion_id = s.id where id = v_apartado;
    insert into separacion_items (separacion_id, variante_id, cantidad, precio_unitario, descuento_unitario, descuento_etiqueta_id, apartado_id)
      values (s.id, v_item.variante_id, v_item.cantidad, v_precio, v_c_unit, case when v_c_unit > 0 then v_c_etq end, v_apartado);
  end loop;

  select coalesce(sum((precio_unitario - descuento_unitario) * cantidad), 0), coalesce(jsonb_agg(to_jsonb(si) order by si.id), '[]'::jsonb)
    into v_total, v_despues
    from separacion_items si where si.separacion_id = s.id;
  v_total := round(v_total, 2);
  if jsonb_array_length(v_despues) = 0 then
    raise exception 'El apartado se queda sin prendas: si la clienta ya no quiere nada, libéralo';
  end if;
  if v_total < s.adelanto then
    raise exception 'El nuevo total (S/%) queda por debajo de lo que la clienta ya pagó (S/%): suma otra prenda o libera el apartado', v_total, s.adelanto;
  end if;
  if s.comprobante_tipo = 'boleta' and v_total > c_tope_boleta_sin_dni and s.clienta_dni is null then
    raise exception 'El apartado pasa de S/%: la boleta lleva el DNI de la clienta', c_tope_boleta_sin_dni;
  end if;

  update separaciones set total = v_total where id = s.id;

  insert into separacion_ediciones (separacion_id, items_antes, items_despues, total_antes, total_despues, creado_por, token_cliente)
    values (s.id, v_antes, v_despues, s.total, v_total, v_persona, p_token)
    returning id into v_edicion;
  insert into separacion_items_retirados (id, separacion_id, variante_id, cantidad, precio_unitario, descuento_unitario,
                                          descuento_etiqueta_id, apartado_id, edicion_id, retirado_por)
    select (q ->> 'id')::uuid, s.id, (q ->> 'variante_id')::uuid, (q ->> 'cantidad')::integer, (q ->> 'precio_unitario')::numeric,
           (q ->> 'descuento_unitario')::numeric, nullif(q ->> 'descuento_etiqueta_id', '')::uuid, (q ->> 'apartado_id')::uuid,
           v_edicion, v_persona
      from jsonb_array_elements(v_quitados) q;

  return jsonb_build_object('edicion_id', v_edicion, 'total', v_total, 'saldo', round(v_total - s.adelanto, 2));
end;
$$;

revoke all on function retail.editar_separacion(uuid, uuid[], jsonb, uuid) from public, anon;
grant execute on function retail.editar_separacion(uuid, uuid[], jsonb, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Actividad de Apartados
-- ---------------------------------------------------------------------------
create or replace function retail.fn_actividad_terminal()
returns uuid
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare v uuid;
begin
  select t.id into v from retail.fn_terminal_actual() t limit 1;
  return v;
exception when others then
  return null;
end;
$$;
revoke all on function retail.fn_actividad_terminal() from public, anon, authenticated;

create or replace function retail.fn_actividad_separacion(p_id uuid, p_accion text, p_origen text default 'vivo')
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  s retail.separaciones;
  v_prendas text;
  v_mas integer;
  v_clienta text;
  v_desc text;
  v_persona uuid;
  v_cuando timestamptz;
begin
  select * into s from retail.separaciones where id = p_id;
  if s.id is null then return; end if;
  v_clienta := btrim(s.clienta_nombres || ' ' || s.clienta_apellidos);
  select retail.fn_actividad_prenda(si.variante_id), (select count(*) - 1 from retail.separacion_items x where x.separacion_id = s.id)
    into v_prendas, v_mas
    from retail.separacion_items si where si.separacion_id = s.id order by si.id limit 1;
  v_prendas := coalesce('«' || v_prendas || '»', 'prendas') || case when coalesce(v_mas, 0) > 0 then ' y ' || v_mas || ' más' else '' end;

  if p_accion = 'apartado_registrado' then
    v_desc := 'apartó ' || v_prendas || ' para ' || v_clienta || ' · adelanto ' || retail.fn_actividad_soles(s.adelanto)
              || ' de ' || retail.fn_actividad_soles(s.total) || ' · ' || s.codigo;
    v_persona := s.creado_por; v_cuando := s.created_at;
  elsif p_accion = 'apartado_entregado' then
    v_desc := 'entregó el apartado ' || s.codigo || ' a ' || v_clienta || ' · venta de ' || retail.fn_actividad_soles(s.total);
    v_persona := s.entregada_por; v_cuando := s.entregada_en;
  elsif p_accion = 'apartado_liberado' then
    v_desc := case when s.liberada_por is null
                   then 'se liberó solo el apartado ' || s.codigo || ' de ' || v_clienta || ': venció hace más de 2 días'
                   else 'liberó el apartado ' || s.codigo || ' de ' || v_clienta
                        || case s.liberada_motivo when 'clienta_desistio' then ' · la clienta desistió'
                                                  when 'error_de_carga' then ' · fue un error al apartar'
                                                  else ' · venció y no vino' end end
              || ' · falta devolver ' || retail.fn_actividad_soles(s.adelanto);
    v_persona := s.liberada_por; v_cuando := s.liberada_en;
  elsif p_accion = 'adelanto_devuelto' then
    v_desc := 'devolvió ' || retail.fn_actividad_soles(s.adelanto) || ' a ' || v_clienta || ' por ' || coalesce(s.devolucion_medio_real, '—')
              || ' · ' || s.codigo;
    v_persona := s.devuelta_por; v_cuando := s.devuelta_en;
  elsif p_accion = 'apartado_extendido' then
    v_desc := 'extendió el apartado ' || s.codigo || ' de ' || v_clienta || ' hasta el ' || to_char(s.vence_el, 'DD/MM');
    begin v_persona := retail.fn_actor_persona_id(true); exception when others then v_persona := null; end;
    v_cuando := now();
  else
    return;
  end if;

  perform retail.fn_actividad_anotar(
    'apartados', p_accion, v_desc, v_persona, retail.fn_actividad_terminal(), s.ubicacion_id, null, 'separaciones',
    s.id::text || ':' || p_accion || case when p_accion = 'apartado_extendido' then ':' || s.extensiones else '' end,
    v_cuando, jsonb_build_object('codigo', s.codigo, 'clienta', v_clienta, 'total', s.total, 'adelanto', s.adelanto, 'vence_el', s.vence_el),
    p_origen);
end;
$$;
revoke all on function retail.fn_actividad_separacion(uuid, text, text) from public, anon, authenticated;

create or replace function retail.trg_actividad_separaciones()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
begin
  begin
    if tg_op = 'INSERT' then
      -- La fila nace antes que sus prendas: se anota al final de la transacción que la creó (ver disparador diferido).
      null;
    elsif new.estado is distinct from old.estado then
      perform retail.fn_actividad_separacion(new.id, case new.estado when 'entregada' then 'apartado_entregado'
                                                                    when 'liberada' then 'apartado_liberado'
                                                                    when 'devuelta' then 'adelanto_devuelto' end);
    elsif new.extensiones is distinct from old.extensiones then
      perform retail.fn_actividad_separacion(new.id, 'apartado_extendido');
    end if;
  exception when others then
    raise warning 'actividad: no se anotó el apartado % (%)', new.id, sqlerrm;
  end;
  return null;
end;
$$;
revoke all on function retail.trg_actividad_separaciones() from public, anon, authenticated;

-- «Apartó»: cuando la transacción de `separar_prendas` termina, sus prendas y su adelanto ya están (disparador de
-- restricción diferido: corre al COMMIT, una vez por separación).
create or replace function retail.trg_actividad_separacion_creada()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
begin
  begin
    perform retail.fn_actividad_separacion(new.id, 'apartado_registrado');
  exception when others then
    raise warning 'actividad: no se anotó el apartado nuevo % (%)', new.id, sqlerrm;
  end;
  return null;
end;
$$;
revoke all on function retail.trg_actividad_separacion_creada() from public, anon, authenticated;

create or replace trigger actividad_separaciones
  after update on retail.separaciones
  for each row execute function retail.trg_actividad_separaciones();

-- `create or replace trigger` no acepta CONSTRAINT: si ya existe, no se vuelve a crear (idempotente sin drop trigger).
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'actividad_separacion_creada' and tgrelid = 'retail.separaciones'::regclass) then
    create constraint trigger actividad_separacion_creada
      after insert on retail.separaciones
      deferrable initially deferred
      for each row execute function retail.trg_actividad_separacion_creada();
  end if;
end $$;

create or replace function retail.trg_actividad_separacion_hijas()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  s retail.separaciones;
  v_clienta text;
begin
  begin
    select * into s from retail.separaciones where id = new.separacion_id;
    v_clienta := btrim(s.clienta_nombres || ' ' || s.clienta_apellidos);
    if tg_table_name = 'separacion_abonos' then
      perform retail.fn_actividad_anotar(
        'apartados', 'abono_registrado',
        'abonó ' || retail.fn_actividad_soles(new.monto) || ' al apartado ' || s.codigo || ' de ' || v_clienta
          || ' · falta ' || retail.fn_actividad_soles(greatest(s.total - s.adelanto - new.monto, 0))
          || case when new.dias_espera > 0 then ' · se la espera ' || new.dias_espera || ' días más, hasta el ' || to_char(new.vence_despues, 'DD/MM') else '' end,
        new.creado_por, retail.fn_actividad_terminal(), s.ubicacion_id, null, 'separacion_abonos', new.id::text, new.created_at,
        jsonb_build_object('codigo', s.codigo, 'monto', new.monto, 'dias_espera', nullif(new.dias_espera, 0)), 'vivo');
    elsif tg_table_name = 'separacion_avisos' then
      perform retail.fn_actividad_anotar(
        'apartados', 'aviso_whatsapp',
        'le escribió por WhatsApp a ' || v_clienta || ' · ' || s.codigo || ' vence el ' || to_char(s.vence_el, 'DD/MM'),
        new.avisado_por, retail.fn_actividad_terminal(), s.ubicacion_id, null, 'separacion_avisos', new.id::text, new.created_at,
        jsonb_build_object('codigo', s.codigo), 'vivo');
    elsif tg_table_name = 'separacion_ediciones' then
      perform retail.fn_actividad_anotar(
        'apartados', 'apartado_editado',
        'editó las prendas del apartado ' || s.codigo || ' de ' || v_clienta || ' · total '
          || retail.fn_actividad_soles(new.total_antes) || ' → ' || retail.fn_actividad_soles(new.total_despues),
        new.creado_por, retail.fn_actividad_terminal(), s.ubicacion_id, null, 'separacion_ediciones', new.id::text, new.created_at,
        jsonb_build_object('codigo', s.codigo, 'total_antes', new.total_antes, 'total_despues', new.total_despues), 'vivo');
    end if;
  exception when others then
    raise warning 'actividad: no se anotó % % (%)', tg_table_name, new.id, sqlerrm;
  end;
  return null;
end;
$$;
revoke all on function retail.trg_actividad_separacion_hijas() from public, anon, authenticated;

create or replace trigger actividad_separacion_abonos
  after insert on retail.separacion_abonos
  for each row execute function retail.trg_actividad_separacion_hijas();
create or replace trigger actividad_separacion_avisos
  after insert on retail.separacion_avisos
  for each row execute function retail.trg_actividad_separacion_hijas();
create or replace trigger actividad_separacion_ediciones
  after insert on retail.separacion_ediciones
  for each row execute function retail.trg_actividad_separacion_hijas();
