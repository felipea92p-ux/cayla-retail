-- ============================================================================
-- 20261104004000_ventas_online_canal.sql — CAYLA V2 · Ventas online (TikTok), actividad 1: el canal vive en la base (ADR-0607)
--
-- EL PROBLEMA PRIMERO. CAYLA empieza a vender por TikTok. Cada venta es un apartado (la prenda se aparta con adelanto y se entrega),
-- pero NO es una venta de tienda física: no debe mezclarse en la lista de Apartados de la tienda, ni con las metas de la tienda, ni
-- con lo que mira el piso. Un ROL no basta para separarlas (un rol dice qué pantallas ve una cuenta, no qué es el dato: si una líder
-- registra un pedido de TikTok, o la persona de online cambia, el dato quedaría sin marca). Lo que separa es el CANAL, una marca del
-- propio apartado y de la venta que nace de él; el rol «ventas online» solo decide quién ve esa pantalla (ADR-0161).
--
-- QUÉ HACE (la prenda sale SIEMPRE de la sede donde está quien vende: no hay sede aparte «Online», que rompería stock y movimientos)
--   PARTE 1 · tabla y columnas
--     · `retail.canales_venta` (clave, nombre, es_fisico, activo): `tienda` y `tiktok`. Una fila nueva = un canal nuevo (Instagram,
--       WhatsApp…) sin migración ni lista fija en un CHECK. Solo se lee por `fn_canales_venta()` (RLS encendido, sin políticas).
--     · `separaciones` (el apartado de un cliente, con sus prendas): `canal` (default `tienda`: todo lo que existe queda igual),
--       `modo_entrega` (`recojo` | `envio`), `direccion_envio`, `enviado_en/por` (el «Marcar enviado» de la actividad 4).
--       Candado `separaciones_entrega_coherente`: el envío exige dirección; «enviado» solo existe en un envío; un apartado de
--       tienda siempre es recojo.
--     · `ventas.canal`: la venta que nace de entregar un apartado hereda su canal (disparador `trg_separacion_canal_a_la_venta`,
--       que no toca `entregar_separacion`: otra función ya parchada diez veces).
--   PARTE 2 · funciones
--     · `fn_canales_venta()`: los canales activos para la pantalla.
--     · `separar_prendas_online(...)`: la puerta de «Nueva venta online». Pide el módulo `ventas_online`, valida canal y entrega,
--       llama a `separar_prendas` TAL CUAL (todas sus reglas: stock, adelanto mínimo, descuentos, caja, comprobante del anticipo) y
--       marca la separación — todo en UNA transacción: nunca queda un apartado «de tienda» que debía ser online. Con la misma marca
--       de reintento (`p_token`) devuelve el mismo apartado.
--
-- SE PEGA en el SQL Editor de producción EN DOS PARTES, en orden (regla de «Políticas y deadlocks»: ningún `create policy` aquí, pero
-- sí `alter` de tablas en uso, que va solo): la PARTE 1 con su `set lock_timeout`, después la PARTE 2. Cada una se puede pegar dos
-- veces. Va DESPUÉS de todo lo que ya está en producción de Apartados (no cambia nada de lo que existe).
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
  if not fn_ve_modulo('ventas_online') then
    raise exception 'No puedes registrar ventas online: tu rol no tiene el módulo «Ventas online». Pídele al líder que lo active.'
      using hint = 'venta_online_sin_modulo';
  end if;
  if not exists (select 1 from canales_venta where clave = p_canal and activo and not es_fisico) then
    raise exception 'Ese canal de venta no existe o no es online.' using hint = 'canal_invalido';
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
  'ADR-0607: la puerta de «Nueva venta online». Pide el módulo ventas_online, valida canal y entrega, llama a separar_prendas tal cual y marca la separación, en una sola transacción.';
revoke all on function retail.separar_prendas_online(text, text, text, uuid, jsonb, jsonb, text, text, text, text, text, text, text, text, text, text, uuid, uuid, text, uuid) from public, anon;
grant execute on function retail.separar_prendas_online(text, text, text, uuid, jsonb, jsonb, text, text, text, text, text, text, text, text, text, text, uuid, uuid, text, uuid) to authenticated;

notify pgrst, 'reload schema';
