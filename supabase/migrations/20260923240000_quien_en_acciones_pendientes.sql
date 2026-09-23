-- =====================================================================================================================
-- «Quién» en las acciones que guardaban sin firmar a nadie (ADR-0161, actualización d). Felipe, 2026-09-23.
--
-- EL PROBLEMA. Con `20260923230000` toda función que firmaba a una persona pasó a firmar con el responsable del combo.
-- Quedaron fuera las que guardan SIN anotar quién: anular una compra, anular un comprobante de producción, cambiar la
-- etapa de una orden, crear/editar/archivar un proveedor de producción, dar de alta un insumo, reactivar una terminal y
-- crearla o cambiarle la clave. Ponerles el combo en la pantalla no dejaba rastro: la base no tenía dónde guardarlo.
--
-- LA SOLUCIÓN, una columna (o una tabla) por acción, siempre llenada por `fn_actor_persona_id(true)`:
--   · compras                   → anulada_por, anulada_at          (anular_compra)
--   · comprobantes_produccion   → anulada_por, anulada_at          (anular_comprobante_produccion)
--   · produccion_etapas_historial (NUEVA, append-only)            (set_etapa_produccion: una fila por cada cambio)
--   · proveedores_produccion    → creado_por, modificado_por, modificado_at (guardar_ y cambiar_estado_proveedor_produccion)
--   · insumos                   → creado_por (disparador BEFORE INSERT: el alta va directo por la API, sin RPC)
--   · terminales                → reactivada_por/_at (reactivar_terminal), clave_cambiada_por/_at
--                                 (registrar_cambio_clave_terminal, NUEVA). creada_por ya existía: lo llena la web con
--                                 el responsable (antes con la cuenta).
--
-- ¿Por qué una tabla para las etapas y no una columna? Una orden cambia de etapa muchas veces; una columna «quién» solo
-- guardaría el último. Append-only, como `movimientos` (principio 4).
--
-- Las filas anteriores quedan con el «quién» vacío: no se inventa quién fue.
-- Los reemplazos parten del texto real de producción (verificado 2026-09-23, idéntico al local) y fallan cerrado si
-- cambió. Re-ejecutable. PRODUCCIÓN: se pega con `set search_path to retail, public;` al principio.
-- =====================================================================================================================

create or replace function pg_temp.reemplazar_una(p_firma text, p_viejo text, p_nuevo text)
returns void language plpgsql as $f$
declare
  v_def text;
  v_n integer;
begin
  if to_regprocedure(p_firma) is null then
    raise exception '% no existe en esta base: esta migración la necesita.', p_firma;
  end if;
  v_def := pg_get_functiondef(p_firma::regprocedure);
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n = 0 and position(p_nuevo in v_def) > 0 then
    return; -- ya aplicada
  end if;
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta migración: se esperaba 1 vez «%» y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- ==================== 1. Columnas ====================
alter table retail.compras
  add column if not exists anulada_por uuid references public.personas(id),
  add column if not exists anulada_at timestamptz;
alter table retail.comprobantes_produccion
  add column if not exists anulada_por uuid references public.personas(id),
  add column if not exists anulada_at timestamptz;
alter table retail.proveedores_produccion
  add column if not exists creado_por uuid references public.personas(id),
  add column if not exists modificado_por uuid references public.personas(id),
  add column if not exists modificado_at timestamptz;
alter table retail.insumos
  add column if not exists creado_por uuid references public.personas(id);
alter table retail.terminales
  add column if not exists reactivada_por uuid references public.personas(id),
  add column if not exists reactivada_at timestamptz,
  add column if not exists clave_cambiada_por uuid references public.personas(id),
  add column if not exists clave_cambiada_at timestamptz;

comment on column retail.compras.anulada_por is 'Quién anuló (responsable del combo, ADR-0161 act. d). Vacío en las anuladas antes del 2026-09-23.';
comment on column retail.comprobantes_produccion.anulada_por is 'Quién anuló (responsable del combo, ADR-0161 act. d). Vacío en las anuladas antes del 2026-09-23.';
comment on column retail.proveedores_produccion.modificado_por is 'Quién hizo el último cambio (edición o archivo/restauración). ADR-0161 act. d.';
comment on column retail.insumos.creado_por is 'Quién dio de alta el insumo (lo pone el disparador con el responsable del combo). ADR-0161 act. d.';

-- ==================== 2. Historial de etapas de una orden (append-only) ====================
create table if not exists retail.produccion_etapas_historial (
  id uuid primary key default gen_random_uuid(),
  produccion_id uuid not null references retail.producciones(id),
  etapa text not null,
  estado text not null,
  hecho_por uuid references public.personas(id),
  created_at timestamptz not null default now()
);
create index if not exists produccion_etapas_historial_produccion_idx on retail.produccion_etapas_historial (produccion_id, created_at);
comment on table retail.produccion_etapas_historial is
  'Cada cambio de etapa de una orden de producción y quién lo hizo (ADR-0161 act. d). Solo la escribe set_etapa_produccion; nunca se edita ni se borra.';

alter table retail.produccion_etapas_historial enable row level security;
revoke all on table retail.produccion_etapas_historial from public, anon, authenticated;
grant select on table retail.produccion_etapas_historial to authenticated;
drop policy if exists produccion_etapas_historial_select on retail.produccion_etapas_historial;
-- Se ve lo mismo que la orden: el candado vive en la política de `producciones`.
create policy produccion_etapas_historial_select on retail.produccion_etapas_historial for select to authenticated using (
  exists (select 1 from retail.producciones p where p.id = produccion_id)
);

-- ==================== 3. Las funciones anotan quién ====================
select pg_temp.reemplazar_una(
  'retail.anular_compra(uuid, text)',
  $v$update compras set estado = 'anulada', motivo_anulacion = trim(p_motivo) where id = p_compra_id;$v$,
  $n$update compras set estado = 'anulada', motivo_anulacion = trim(p_motivo),
         anulada_por = retail.fn_actor_persona_id(true), anulada_at = now() -- ADR-0161 act. d
   where id = p_compra_id;$n$);

select pg_temp.reemplazar_una(
  'retail.anular_comprobante_produccion(uuid, text)',
  $v$update retail.comprobantes_produccion set estado = 'anulada', motivo_anulacion = btrim(p_motivo) where id = p_comprobante_id;$v$,
  $n$update retail.comprobantes_produccion set estado = 'anulada', motivo_anulacion = btrim(p_motivo),
         anulada_por = retail.fn_actor_persona_id(true), anulada_at = now() -- ADR-0161 act. d
   where id = p_comprobante_id;$n$);

select pg_temp.reemplazar_una(
  'retail.set_etapa_produccion(uuid, text, text)',
  $v$    where id = p_produccion_id;
end;$v$,
  $n$    where id = p_produccion_id;
  -- ADR-0161 act. d: cada cambio de etapa queda con quién lo hizo.
  insert into retail.produccion_etapas_historial (produccion_id, etapa, estado, hecho_por)
    values (p_produccion_id, p_etapa, p_estado, retail.fn_actor_persona_id(true));
end;$n$);

select pg_temp.reemplazar_una(
  'retail.cambiar_estado_proveedor_produccion(uuid, boolean)',
  $v$update retail.proveedores_produccion set activo = p_activo where id = p_proveedor_id;$v$,
  $n$update retail.proveedores_produccion set activo = p_activo,
         modificado_por = retail.fn_actor_persona_id(true), modificado_at = now() -- ADR-0161 act. d
   where id = p_proveedor_id;$n$);

-- guardar_proveedor_produccion: dos reemplazos (alta y edición) sobre la misma función.
select pg_temp.reemplazar_una(
  'retail.guardar_proveedor_produccion(uuid, text, text, text, text, text, integer, text, text, text, text, text, text[], text)',
  $v$cci, celular_billetera, billeteras, titular_cuenta
    ) values ($v$,
  $n$cci, celular_billetera, billeteras, titular_cuenta, creado_por
    ) values ($n$);
select pg_temp.reemplazar_una(
  'retail.guardar_proveedor_produccion(uuid, text, text, text, text, text, integer, text, text, text, text, text, text[], text)',
  $v$v_cci, v_cel, v_bil, v_titular
    ) returning id into v_id;$v$,
  $n$v_cci, v_cel, v_bil, v_titular, retail.fn_actor_persona_id(true)
    ) returning id into v_id;$n$);
select pg_temp.reemplazar_una(
  'retail.guardar_proveedor_produccion(uuid, text, text, text, text, text, integer, text, text, text, text, text, text[], text)',
  $v$titular_cuenta = v_titular
    where id = p_proveedor_id;$v$,
  $n$titular_cuenta = v_titular,
      modificado_por = retail.fn_actor_persona_id(true), modificado_at = now() -- ADR-0161 act. d
    where id = p_proveedor_id;$n$);

select pg_temp.reemplazar_una(
  'retail.reactivar_terminal(uuid)',
  $v$update retail.terminales set activo = true, desactivada_at = null, desactivada_por = null where id = p_terminal_id;$v$,
  $n$update retail.terminales set activo = true, desactivada_at = null, desactivada_por = null,
         reactivada_por = retail.fn_actor_persona_id(true), reactivada_at = now() -- ADR-0161 act. d
   where id = p_terminal_id;$n$);

-- ==================== 4. Alta de insumos: el disparador anota quién ====================
create or replace function retail.fn_insumos_creado_por()
returns trigger language plpgsql security definer
set search_path = retail, public, extensions
as $f$
begin
  -- Sin sesión (SQL Editor, scripts) fn_actor_persona_id devuelve NULL: se permite, como en el resto.
  new.creado_por := retail.fn_actor_persona_id(true);
  return new;
end;
$f$;
revoke all on function retail.fn_insumos_creado_por() from public, anon, authenticated;
drop trigger if exists insumos_creado_por on retail.insumos;
create trigger insumos_creado_por before insert on retail.insumos
  for each row execute function retail.fn_insumos_creado_por();

-- ==================== 5. Cambio de clave de una terminal ====================
-- La clave la cambia la web con la llave de servicio (Supabase Auth), que no ve a quien lo pide. Esta función la llama
-- la web con la sesión de quien lo pidió, firmada, justo después: deja quién y cuándo.
create or replace function retail.registrar_cambio_clave_terminal(p_terminal_id uuid)
returns void
language plpgsql security definer
set search_path = retail, public, extensions
as $f$
begin
  if not retail.fn_puede_gestionar_colaboradores() then
    raise exception 'Cambiar la clave de una terminal necesita el módulo Colaboradores en tu rol' using errcode = '42501';
  end if;
  update retail.terminales
     set clave_cambiada_por = retail.fn_actor_persona_id(true), clave_cambiada_at = now()
   where id = p_terminal_id;
  if not found then
    raise exception 'Esa terminal ya no existe. Actualiza la pantalla.';
  end if;
end;
$f$;
revoke all on function retail.registrar_cambio_clave_terminal(uuid) from public, anon;
grant execute on function retail.registrar_cambio_clave_terminal(uuid) to authenticated;
comment on function retail.registrar_cambio_clave_terminal(uuid) is
  'Anota quién cambió la clave de una terminal (el responsable del combo). La clave la cambia la web con la llave de servicio. ADR-0161 act. d.';
