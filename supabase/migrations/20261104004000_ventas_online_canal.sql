-- ============================================================================
-- 20261104004000_ventas_online_canal.sql — CAYLA V2 · Ventas online (TikTok): el canal en la base y qué canales opera cada rol (ADR-0607)
--
-- EL PROBLEMA PRIMERO. CAYLA empieza a vender por TikTok. Cada venta es un apartado (la prenda se aparta con adelanto y se entrega),
-- pero NO es una venta de tienda física: no debe mezclarse en la lista de Apartados de la tienda, ni con las metas, ni con lo que mira
-- el piso. Un ROL no basta para separarlas (un rol dice qué ve una cuenta, no qué es el dato). Lo que separa es el CANAL, una marca
-- del apartado y de la venta que nace de él; y el rol dice QUÉ CANALES OPERA. Es lo que hacen SAP (objeto de autorización por canal
-- de distribución), NetSuite (restricción del rol por una dimensión del dato) y Odoo (equipo de ventas): ninguno crea una pantalla ni
-- un módulo por canal. La prenda sale SIEMPRE de la sede donde está quien vende (no hay sede «Online»: rompería stock y movimientos).
--
-- QUÉ HACE
--   PARTE 1 · tabla y columnas
--     · `retail.canales_venta` (clave, nombre, es_fisico, activo): `tienda` y `tiktok`. Un canal nuevo (Instagram, WhatsApp…) es una fila.
--     · `separaciones`: `canal` (default `tienda`: todo lo que existe queda igual), `modo_entrega` (`recojo` | `envio`),
--       `direccion_envio`, `enviado_en/por`. Candado `separaciones_entrega_coherente`.
--     · `ventas.canal`: la venta que nace de entregar un apartado hereda su canal (disparador sobre `separaciones.venta_id`, que
--       no toca `entregar_separacion`: otra función ya parchada diez veces).
--   PARTE 2 · funciones
--     · `fn_canales_venta()`: los canales activos. `separar_prendas_online(...)`: la puerta de «apartar» con canal online; pide operar
--       el canal, valida entrega y llama a `separar_prendas` TAL CUAL, todo en UNA transacción.
--   PARTE 3 · qué canales opera cada rol
--     · `rol_canales` (el Líder opera todos sin filas; todo rol que existe hoy sigue operando `tienda`; un rol nuevo nace con `tienda`),
--       `fn_canales_de_la_cuenta()`, `fn_puede_canal()`, `fn_canales_de_roles()` y `guardar_canales_rol()` (versión esperada,
--       historial, «solo das lo que tienes»).
--   PARTE 4 · las lecturas de Apartados
--     · `buscar_separaciones` y `resumen_separaciones` muestran solo los canales de la cuenta; la lista trae canal y entrega.
--
-- SE PEGA en el SQL Editor de producción EN CUATRO PARTES, en orden (regla de «Políticas y deadlocks»: ningún `create policy` aquí,
-- pero sí `alter` de tablas en uso, que va solo). Cada una se puede pegar dos veces. NO cambia lo que hoy ve nadie: todos los roles
-- siguen operando `tienda`.
-- ============================================================================


-- ============================================================================
-- PARTE 1 · TABLA Y COLUMNAS
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

create table if not exists retail.canales_venta (
  clave      text primary key check (clave ~ '^[a-z][a-z0-9_]{1,29}$'),
  nombre     text not null check (btrim(nombre) <> '' and char_length(nombre) <= 40),
  es_fisico  boolean not null,
  activo     boolean not null default true,
  orden      smallint not null default 0,
  created_at timestamptz not null default now()
);
comment on table retail.canales_venta is
  'ADR-0607: por dónde se vendió (la tienda física o un canal online). `tienda` es el único físico y no se desactiva. Se lee por fn_canales_venta().';

-- Sin políticas a propósito: solo se lee por la función `security definer` de abajo (regla de deadlocks, ADR-0195).
alter table retail.canales_venta enable row level security;

insert into retail.canales_venta (clave, nombre, es_fisico, orden) values
  ('tienda', 'Tienda', true, 0),
  ('tiktok', 'TikTok', false, 10)
on conflict (clave) do nothing;

alter table retail.separaciones
  add column if not exists canal           text not null default 'tienda' references retail.canales_venta (clave),
  add column if not exists modo_entrega    text not null default 'recojo',
  add column if not exists direccion_envio text,
  add column if not exists enviado_en      timestamptz,
  add column if not exists enviado_por     uuid references public.personas (id);

alter table retail.separaciones drop constraint if exists separaciones_modo_entrega_check;
alter table retail.separaciones
  add constraint separaciones_modo_entrega_check check (modo_entrega in ('recojo', 'envio'));

alter table retail.separaciones drop constraint if exists separaciones_entrega_coherente;
alter table retail.separaciones
  add constraint separaciones_entrega_coherente check (
    -- el envío exige a dónde, y solo el envío lo lleva
    ((modo_entrega = 'envio') = (direccion_envio is not null and btrim(direccion_envio) <> '' and char_length(direccion_envio) <= 300))
    -- «enviado» solo existe en un envío, y con quien lo marcó
    and (enviado_en is null or modo_entrega = 'envio')
    and ((enviado_en is null) = (enviado_por is null))
    -- un apartado de la tienda física siempre se recoge
    and (canal <> 'tienda' or modo_entrega = 'recojo')
  );

alter table retail.ventas
  add column if not exists canal text not null default 'tienda' references retail.canales_venta (clave);

-- La lista de «Ventas online» lee solo lo que no es de tienda: un índice parcial chico, que no pesa en Apartados de tienda.
create index if not exists separaciones_online_idx on retail.separaciones (ubicacion_id, estado) where canal <> 'tienda';

-- La venta hereda el canal del apartado que la originó. `entregar_separacion` termina con
-- `update separaciones set estado = 'entregada', venta_id = …`: ese cambio es la señal.
create or replace function retail.fn_separacion_pasa_su_canal_a_la_venta()
returns trigger
language plpgsql
security definer
set search_path = retail, public
as $fn$
begin
  if new.venta_id is not null and old.venta_id is distinct from new.venta_id and new.canal <> 'tienda' then
    update retail.ventas set canal = new.canal where id = new.venta_id and canal <> new.canal;
  end if;
  return new;
end;
$fn$;

create or replace trigger trg_separacion_canal_a_la_venta
  after update of venta_id on retail.separaciones
  for each row execute function retail.fn_separacion_pasa_su_canal_a_la_venta();


-- ============================================================================
-- PARTE 2 · FUNCIONES
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function retail.fn_canales_venta()
returns table (clave text, nombre text, es_fisico boolean)
language sql
stable
security definer
set search_path = retail, public
as $fn$
  select c.clave, c.nombre, c.es_fisico from retail.canales_venta c where c.activo order by c.orden, c.nombre;
$fn$;
revoke all on function retail.fn_canales_venta() from public, anon;
grant execute on function retail.fn_canales_venta() to authenticated;

create or replace function retail.separar_prendas_online(
  p_canal text,
  p_modo_entrega text,
  p_direccion_envio text,
  p_ubicacion_id uuid,
  p_items jsonb,
  p_pagos jsonb,
  p_clienta_nombres text,
  p_clienta_apellidos text,
  p_clienta_celular text,
  p_devolucion_medio text,
  p_clienta_dni text default null,
  p_devolucion_numero text default null,
  p_devolucion_cci text default null,
  p_comprobante_tipo text default 'boleta',
  p_cliente_ruc text default null,
  p_cliente_razon_social text default null,
  p_asesora_id uuid default null,
  p_clienta_id uuid default null,
  p_nota text default null,
  p_token uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_id uuid;
  v_direccion text := nullif(btrim(coalesce(p_direccion_envio, '')), '');
begin
  if not exists (select 1 from canales_venta where clave = p_canal and activo and not es_fisico) then
    raise exception 'Ese canal de venta no existe o no es online.' using hint = 'canal_invalido';
  end if;
  if not fn_puede_canal(p_canal) then
    raise exception 'No puedes registrar ventas de este canal: tu rol no lo opera. Pídele al líder que lo active en Roles y accesos.'
      using hint = 'canal_sin_permiso';
  end if;
  if p_modo_entrega is null or p_modo_entrega not in ('recojo', 'envio') then
    raise exception 'Elige cómo se entrega: recojo en tienda o envío.' using hint = 'modo_entrega_invalido';
  end if;
  if p_modo_entrega = 'envio' and (v_direccion is null or char_length(v_direccion) < 5) then
    raise exception 'Para un envío escribe a dónde va (dirección y agencia).' using hint = 'direccion_envio_falta';
  end if;
  if p_modo_entrega = 'envio' and char_length(v_direccion) > 300 then
    raise exception 'La dirección de envío es muy larga (máximo 300 letras).' using hint = 'direccion_envio_larga';
  end if;

  -- Todas las reglas del apartado de siempre (sede que se opera, stock, adelanto mínimo, descuentos, caja, comprobante del anticipo).
  v_id := separar_prendas(
    p_ubicacion_id => p_ubicacion_id, p_items => p_items, p_pagos => p_pagos,
    p_clienta_nombres => p_clienta_nombres, p_clienta_apellidos => p_clienta_apellidos, p_clienta_celular => p_clienta_celular,
    p_devolucion_medio => p_devolucion_medio, p_clienta_dni => p_clienta_dni, p_devolucion_numero => p_devolucion_numero,
    p_devolucion_cci => p_devolucion_cci, p_comprobante_tipo => p_comprobante_tipo, p_cliente_ruc => p_cliente_ruc,
    p_cliente_razon_social => p_cliente_razon_social, p_asesora_id => p_asesora_id, p_clienta_id => p_clienta_id,
    p_nota => p_nota, p_token => p_token);

  update separaciones
     set canal = p_canal,
         modo_entrega = p_modo_entrega,
         direccion_envio = case when p_modo_entrega = 'envio' then v_direccion end
   where id = v_id;
  return v_id;
end;
$fn$;

comment on function retail.separar_prendas_online(text, text, text, uuid, jsonb, jsonb, text, text, text, text, text, text, text, text, text, text, uuid, uuid, text, uuid) is
  'ADR-0607: la puerta de «Nueva venta online». Pide operar el canal, valida canal y entrega, llama a separar_prendas tal cual y marca la separación, en una sola transacción.';
revoke all on function retail.separar_prendas_online(text, text, text, uuid, jsonb, jsonb, text, text, text, text, text, text, text, text, text, text, uuid, uuid, text, uuid) from public, anon;
grant execute on function retail.separar_prendas_online(text, text, text, uuid, jsonb, jsonb, text, text, text, text, text, text, text, text, text, text, uuid, uuid, text, uuid) to authenticated;

-- ============================================================================
-- PARTE 3 · QUÉ CANALES OPERA CADA ROL (actividad 2)
-- ============================================================================
-- Como SAP (objeto de autorización por canal de distribución), NetSuite (restricción del rol por una dimensión del dato) y Odoo
-- (equipo de ventas): el documento lleva su canal y el ROL dice qué canales opera. No hay módulo ni pantalla por canal. Esta parte NO
-- crea políticas (la tabla se lee por funciones `security definer`), así que se pega entera.
set search_path = retail, public, extensions;
set lock_timeout = '3s';

create table if not exists retail.rol_canales (
  rol_id uuid not null references retail.roles (id) on delete cascade,
  canal  text not null references retail.canales_venta (clave),
  primary key (rol_id, canal)
);
comment on table retail.rol_canales is
  'ADR-0607: los canales de venta que opera cada rol (tienda, tiktok…). El Líder opera todos sin filas. Se lee por fn_canales_de_roles(); se escribe por guardar_canales_rol().';
alter table retail.rol_canales enable row level security;

-- El historial de roles aprende la acción «canales» (quién cambió qué canales opera un rol, antes y después; no se borra nunca).
alter table retail.roles_historial drop constraint if exists roles_historial_accion_check;
alter table retail.roles_historial
  add constraint roles_historial_accion_check
  check (accion = any (array['creacion', 'modulos', 'renombre', 'archivo', 'restauracion', 'asignacion', 'canales']));

-- Todo rol que existe hoy sigue operando la tienda, como siempre: nada cambia para nadie hasta que el líder lo cambie.
insert into retail.rol_canales (rol_id, canal)
  select r.id, 'tienda' from retail.roles r where not r.fijo
on conflict do nothing;

-- Un rol nuevo nace operando la tienda (como nacía antes: Apartados no distinguía canal). Quien arme «ventas online» le quita la tienda.
create or replace function retail.fn_rol_nuevo_opera_la_tienda()
returns trigger
language plpgsql
security definer
set search_path = retail, public
as $fn$
begin
  if not new.fijo then
    insert into retail.rol_canales (rol_id, canal) values (new.id, 'tienda') on conflict do nothing;
  end if;
  return null;
end;
$fn$;
create or replace trigger roles_opera_la_tienda_ai after insert on retail.roles
  for each row execute function retail.fn_rol_nuevo_opera_la_tienda();

-- Cambiar los canales de un rol sube su versión, igual que cambiar sus módulos (ADR-0193: dos personas no se pisan).
create or replace function retail.fn_subir_version_rol_por_canales()
returns trigger
language plpgsql
security definer
set search_path = retail, public
as $fn$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    update retail.roles set version = version + 1 where id = new.rol_id;
  end if;
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and new.rol_id is distinct from old.rol_id) then
    update retail.roles set version = version + 1 where id = old.rol_id;
  end if;
  return null;
end;
$fn$;
create or replace trigger rol_canales_version_aiud after insert or delete or update on retail.rol_canales
  for each row execute function retail.fn_subir_version_rol_por_canales();

-- Los canales que opera ESTA cuenta (persona o terminal): el Líder, todos los activos; los demás, los de su rol.
create or replace function retail.fn_canales_de_la_cuenta()
returns setof text
language sql
stable
security definer
set search_path = retail, public, extensions
as $fn$
  select c.clave from retail.canales_venta c
   where c.activo and (
     retail.fn_es_lider()
     or exists (
       select 1 from retail.rol_canales rc
       join retail.roles r on r.id = rc.rol_id and r.archivado_at is null
       where rc.rol_id = retail.fn_mi_rol_id() and rc.canal = c.clave)
   );
$fn$;
revoke all on function retail.fn_canales_de_la_cuenta() from public, anon;
grant execute on function retail.fn_canales_de_la_cuenta() to authenticated;

create or replace function retail.fn_puede_canal(p_canal text)
returns boolean
language sql
stable
security definer
set search_path = retail, public, extensions
as $fn$
  select exists (select 1 from retail.fn_canales_de_la_cuenta() c where c = p_canal);
$fn$;
revoke all on function retail.fn_puede_canal(text) from public, anon;
grant execute on function retail.fn_puede_canal(text) to authenticated;

-- Lo que lee la pantalla de Roles y accesos: una fila por rol y canal. Pide poder administrar roles.
create or replace function retail.fn_canales_de_roles()
returns table (rol_id uuid, canal text)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $fn$
begin
  perform retail.fn_exigir_lider_de_roles();
  return query select rc.rol_id, rc.canal from retail.rol_canales rc order by rc.rol_id, rc.canal;
end;
$fn$;
revoke all on function retail.fn_canales_de_roles() from public, anon;
grant execute on function retail.fn_canales_de_roles() to authenticated;

-- Guardar los canales de un rol. Misma disciplina que los módulos: versión esperada (ADR-0193), historial, «solo das lo que tienes»
-- (ADR-0178: quien no es líder da solo los canales que él opera) y el Líder no se edita (opera todos).
create or replace function retail.guardar_canales_rol(p_rol_id uuid, p_canales text[], p_version_esperada integer default null)
returns integer
language plpgsql
security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_rol retail.roles;
  v_antes jsonb;
  v_despues jsonb;
  v_malo text;
  v_faltan text[];
begin
  perform retail.fn_exigir_lider_de_roles();
  select * into v_rol from retail.roles where id = p_rol_id for update;
  if v_rol.id is null then
    raise exception 'Ese rol no existe — actualiza la pantalla';
  end if;
  if p_version_esperada is not null and v_rol.version <> p_version_esperada then
    raise exception 'Otra persona cambió este rol mientras lo editabas. Recarga para ver sus cambios.'
      using errcode = 'PT409', hint = 'version_cambiada';
  end if;
  if v_rol.archivado_at is not null then
    raise exception 'El rol % está archivado: restáuralo antes de editarlo', v_rol.nombre;
  end if;
  if v_rol.fijo then
    raise exception 'El Líder de equipo opera todos los canales: no se le quitan.' using errcode = '23514', hint = 'lider_todos_los_canales';
  end if;
  select x into v_malo from unnest(coalesce(p_canales, '{}')) x
   where not exists (select 1 from retail.canales_venta c where c.clave = x and c.activo) limit 1;
  if v_malo is not null then
    raise exception 'No existe el canal «%»', v_malo;
  end if;
  if not retail.fn_es_lider() and p_rol_id = retail.fn_mi_rol_id() then
    raise exception 'No puedes editar los canales de tu propio rol: pídeselo a un líder'
      using errcode = '42501', hint = 'solo_das_lo_que_tienes';
  end if;
  -- «Solo das lo que tienes»: quien no es líder no enciende un canal que él no opera.
  if not retail.fn_es_lider() then
    select array_agg(x) into v_faltan from unnest(coalesce(p_canales, '{}')) x
     where not retail.fn_puede_canal(x)
       and not exists (select 1 from retail.rol_canales rc where rc.rol_id = p_rol_id and rc.canal = x);
    if v_faltan is not null then
      raise exception 'No puedes encender canales que tú no operas (%): solo puedes dar lo que tú tienes. Pídeselo a un líder.',
        array_to_string(v_faltan, ', ') using errcode = '42501', hint = 'solo_das_lo_que_tienes';
    end if;
  end if;

  select coalesce(jsonb_agg(canal order by canal), '[]'::jsonb) into v_antes from retail.rol_canales where rol_id = p_rol_id;
  delete from retail.rol_canales where rol_id = p_rol_id and not (canal = any (coalesce(p_canales, '{}')));
  insert into retail.rol_canales (rol_id, canal)
    select distinct p_rol_id, x from unnest(coalesce(p_canales, '{}')) x
    on conflict do nothing;
  select coalesce(jsonb_agg(canal order by canal), '[]'::jsonb) into v_despues from retail.rol_canales where rol_id = p_rol_id;
  if v_antes <> v_despues then
    insert into retail.roles_historial (rol_id, accion, detalle, hecho_por)
      values (p_rol_id, 'canales', jsonb_build_object('antes', v_antes, 'despues', v_despues), retail.fn_actor_persona_id(true));
  end if;
  return (select version from retail.roles where id = p_rol_id);
end;
$fn$;
revoke all on function retail.guardar_canales_rol(uuid, text[], integer) from public, anon;
grant execute on function retail.guardar_canales_rol(uuid, text[], integer) to authenticated;

-- ============================================================================
-- PARTE 4 · LAS LECTURAS Y LA PUERTA APRENDEN LOS CANALES DE LA CUENTA (actividad 2)
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- Las dos lecturas de Apartados: solo los canales de la cuenta, y la lista trae canal y entrega. `buscar_separaciones` cambia de
-- columnas, así que se borra la anterior (`drop function` no toma las tablas de auth ni de storage).
drop function if exists retail.buscar_separaciones(uuid, text, text[], date, date);

create or replace function retail.buscar_separaciones(p_ubicacion_id uuid, p_texto text DEFAULT NULL::text, p_estados text[] DEFAULT NULL::text[], p_desde date DEFAULT NULL::date, p_hasta date DEFAULT NULL::date)
 RETURNS TABLE(id uuid, codigo text, estado text, clienta_nombres text, clienta_apellidos text, clienta_celular text, clienta_dni text, asesora text, total numeric, adelanto numeric, saldo numeric, vence_el date, extensiones smallint, creada_en timestamp with time zone, devolucion_medio text, devolucion_numero text, devolucion_cci_final text, liberada_sola boolean, comprobante_anticipo text, comprobante_final text, nota_credito text, items jsonb, pagos jsonb, estante text, canal text, modo_entrega text, direccion_envio text, enviado_en timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'retail', 'public', 'extensions'
AS $function$
  select s.id, s.codigo, s.estado, s.clienta_nombres, s.clienta_apellidos, s.clienta_celular, s.clienta_dni,
         nullif(btrim(coalesce(pa.nombres, '') || ' ' || coalesce(pa.apellidos, '')), ''),
         s.total, s.adelanto, case when s.estado = 'abierta' then s.total - s.adelanto else 0 end,
         s.vence_el, s.extensiones, s.created_at,
         s.devolucion_medio, s.devolucion_numero, right(s.devolucion_cci, 4),
         (s.liberada_en is not null and s.liberada_por is null),
         ca.serie || '-' || lpad(ca.numero::text, 6, '0'),
         (select cf.serie || '-' || lpad(cf.numero::text, 6, '0') from comprobantes cf where cf.venta_id = s.venta_id and s.venta_id is not null order by cf.created_at limit 1),
         cn.serie || '-' || lpad(cn.numero::text, 6, '0'),
         (select jsonb_agg(jsonb_build_object('id', si.id, 'variante_id', si.variante_id, 'sku', v.sku, 'referencia', p.referencia,
                                              'cantidad', si.cantidad, 'precio_unitario', si.precio_unitario,
                                              'descuento_unitario', si.descuento_unitario,
                                              -- ADR-0584: el motivo de un descuento a mano (NULL = campaña o sin descuento).
                                              'motivo_descuento', si.motivo_descuento,
                                              'motivo_descuento_detalle', si.motivo_descuento_detalle,
                                              'argumento_descuento', si.argumento_descuento) order by v.sku)
            from separacion_items si join variantes v on v.id = si.variante_id join productos p on p.id = v.producto_id
           where si.separacion_id = s.id),
         (select jsonb_agg(jsonb_build_object('metodo', sp.metodo, 'monto', sp.monto, 'fecha', sp.created_at, 'abono', sp.abono_id is not null) order by sp.created_at)
            from separacion_pagos sp where sp.separacion_id = s.id),
         s.estante, s.canal, s.modo_entrega, s.direccion_envio, s.enviado_en
    from separaciones s
    left join public.personas pa on pa.id = s.asesora_id
    left join comprobantes ca on ca.id = s.comprobante_anticipo_id
    left join comprobantes cn on cn.id = s.nota_credito_id
   where s.ubicacion_id = p_ubicacion_id
     and fn_puede_operar_ubicacion(p_ubicacion_id)
     and (p_estados is null or s.estado = any (p_estados))
     -- ADR-0607: solo los canales que opera la cuenta (el líder, todos).
     and s.canal in (select c from retail.fn_canales_de_la_cuenta() c)
     -- El rango acota solo lo cerrado; lo que espera algo (abierto o por devolver) sale siempre.
     and (
       s.estado in ('abierta', 'liberada')
       or ((p_desde is null or (s.created_at at time zone 'America/Lima')::date >= p_desde)
           and (p_hasta is null or (s.created_at at time zone 'America/Lima')::date <= p_hasta))
     )
     and (
       nullif(btrim(coalesce(p_texto, '')), '') is null
       or s.id::text = btrim(p_texto)
       or s.codigo ilike '%' || btrim(p_texto) || '%'
       or (s.clienta_nombres || ' ' || s.clienta_apellidos) ilike '%' || btrim(p_texto) || '%'
       or s.clienta_dni = regexp_replace(p_texto, '\D', '', 'g')
       or s.clienta_celular = regexp_replace(p_texto, '\D', '', 'g')
       or (ca.serie || '-' || lpad(ca.numero::text, 6, '0')) ilike '%' || btrim(p_texto) || '%'
     )
   order by case s.estado when 'liberada' then 0 when 'abierta' then 1 else 2 end, s.vence_el, s.created_at
   limit 200;
$function$;

revoke all on function retail.buscar_separaciones(uuid, text, text[], date, date) from public, anon;
grant execute on function retail.buscar_separaciones(uuid, text, text[], date, date) to authenticated;

create or replace function retail.resumen_separaciones(p_ubicacion_id uuid)
 RETURNS TABLE(por_recoger integer, prendas_guardadas integer, en_custodia numeric, en_custodia_efectivo numeric, por_devolver integer, monto_por_devolver numeric, vencen_pronto integer, vencidas integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'retail', 'public', 'extensions'
AS $function$
  select
    count(*) filter (where s.estado = 'abierta')::integer,
    coalesce((select sum(si.cantidad) from separacion_items si join separaciones x on x.id = si.separacion_id
               where x.ubicacion_id = p_ubicacion_id and x.estado = 'abierta'
                 and x.canal in (select c from retail.fn_canales_de_la_cuenta() c)), 0)::integer,
    coalesce(sum(s.adelanto) filter (where s.estado = 'abierta'), 0),
    coalesce((select sum(sp.monto) from separacion_pagos sp join separaciones x on x.id = sp.separacion_id
               where x.ubicacion_id = p_ubicacion_id and x.estado = 'abierta' and sp.metodo = 'efectivo'
                 and x.canal in (select c from retail.fn_canales_de_la_cuenta() c)), 0),
    count(*) filter (where s.estado = 'liberada')::integer,
    coalesce(sum(s.adelanto) filter (where s.estado = 'liberada'), 0),
    count(*) filter (where s.estado = 'abierta' and s.vence_el between fn_hoy_lima() and fn_hoy_lima() + 2)::integer,
    count(*) filter (where s.estado = 'abierta' and s.vence_el < fn_hoy_lima())::integer
  from separaciones s
  where s.ubicacion_id = p_ubicacion_id and fn_puede_operar_ubicacion(p_ubicacion_id)
    and s.canal in (select c from retail.fn_canales_de_la_cuenta() c);
$function$;

notify pgrst, 'reload schema';
