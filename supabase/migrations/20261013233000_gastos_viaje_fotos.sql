-- Fotos del papel de un gasto del viaje, fase 6 · actividad 5 (ADR-0362, decisión 69: «fotos opcionales; la rendición avisa cuáles faltan»).
--
-- EL PROBLEMA PRIMERO. La rendición tiene que decir qué gastos no tienen la foto de su boleta, factura, ticket o planilla, y quien la
-- aprueba tiene que poder mirarla. Los pagos a proveedores ya tienen dónde: los adjuntos del comprobante (`compra_adjuntos`, bucket
-- `retail-compras-adjuntos`). Un gasto del viaje no tiene comprobante de compra (decisión de la actividad 3: no se le pide a quien está en
-- Gamarra dar de alta al proveedor), así que no tenía dónde guardar su foto.
--
-- QUÉ CREA (como los adjuntos de una factura, 20260914180000)
--   1. `gasto_viaje_fotos`: la fila es la que hace existir a la foto; el objeto vive en el bucket `retail-gastos-viaje`
--      (`<gasto_id>/<uuid>-<nombre>`, 20261013234000). Nunca se borra: se quita de la vista (`archivada_en`). RLS encendido y sin
--      políticas: se escribe y se lee por las funciones de abajo.
--   2. `registrar_foto_gasto_viaje(gasto, ruta, nombre, tipo, bytes)`: después de subir el objeto. La sube quien tiene Órdenes de compra
--      (quien anota los gastos del viaje) o la dueña del fondo con que se pagó. Una foto se puede sumar aunque el gasto ya se haya rendido:
--      completa la evidencia, no cambia ningún número.
--   3. `archivar_foto_gasto_viaje(foto)`: quitar una foto equivocada (el objeto se queda en el bucket).
--   4. `fn_fotos_gasto_viaje(gastos[])`: las fotos vigentes de unos gastos. La ven quien tiene Órdenes de compra, quien tiene Fondos por
--      rendir (quien aprueba la rendición) y la dueña del fondo. `fn_puede_ver_foto_gasto_viaje(ruta)` dice lo mismo para la política de
--      lectura del bucket.
--   5. La clave `gasto_viaje_foto` en `acciones_sin_responsable` (como `compra_adjunto_subir`): sumar una foto no pide el combo.
--
-- DESCARTÉ
--   · Reusar `compra_adjuntos` y su bucket: su lectura sigue a las facturas que cada quien ve (`fn_compras_visibles`) y su ruta empieza
--     por el id de una compra; un gasto del viaje no es una compra.
--   · Una sola foto por gasto en una columna de `gastos_viaje`: un depósito o un Yape tiene dos papeles (el voucher y el comprobante).
--
-- CÓMO SE PEGA EN PRODUCCIÓN (autorización de Felipe para la fase 6). Una parte: una tabla nueva y funciones; sin `alter` de tablas en
-- uso, sin políticas, sin `drop trigger` (ADR-0195), sin `select … into` dentro de textos entre comillas (ADR-0288). El bucket y sus
-- políticas van SOLOS en 20261013234000, después de esta. Idempotente.

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. La tabla ----------
create table if not exists retail.gasto_viaje_fotos (
  id uuid primary key default gen_random_uuid(),
  gasto_id uuid not null references retail.gastos_viaje (gasto_id),
  -- `<gasto_id>/<uuid>-<nombre>`: única, un objeto, una fila.
  ruta text not null unique,
  nombre text not null check (char_length(btrim(nombre)) between 1 and 200),
  tipo text not null,
  bytes integer not null check (bytes > 0 and bytes <= 10 * 1024 * 1024),
  subida_por uuid references public.personas (id),
  created_at timestamptz not null default now(),
  -- null = a la vista. Con fecha = quitada de la vista (nunca borrada).
  archivada_en timestamptz,
  archivada_por uuid references public.personas (id),
  constraint gasto_viaje_fotos_ruta_de_su_gasto check (ruta like gasto_id::text || '/%'),
  constraint gasto_viaje_fotos_tipo_permitido check (
    tipo in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'))
);
create index if not exists gasto_viaje_fotos_gasto_idx on retail.gasto_viaje_fotos (gasto_id) where archivada_en is null;
comment on table retail.gasto_viaje_fotos is
  'ADR-0362 fase 6: la foto del papel de un gasto del viaje (boleta, factura, ticket, planilla, voucher). El objeto vive en el bucket retail-gastos-viaje; esta fila es la que lo hace existir. Nunca se borra: se archiva.';
alter table retail.gasto_viaje_fotos enable row level security;
revoke all on table retail.gasto_viaje_fotos from anon, authenticated;

-- ---------- 2. Sin combo (como los adjuntos de una factura) ----------
insert into retail.acciones_sin_responsable (clave, descripcion) values
  ('gasto_viaje_foto', 'Sumar o quitar la foto del papel de un gasto del viaje (con la cuenta de una persona firma ella, desde una terminal se elige quién)')
on conflict (clave) do update set descripcion = excluded.descripcion;

-- ---------- 3. Quién puede tocar las fotos de un gasto ----------
-- La persona de la cuenta con que se entró (nada desde una terminal, que no es una persona). La usan las funciones del fondo que
-- preguntan «¿es lo tuyo?»: es identidad, no firma (firma `fn_actor_persona_id(true)`). Una sola pieza en vez de repetir la búsqueda.
create or replace function retail.fn_persona_de_la_cuenta() returns uuid
language sql stable security definer set search_path = retail, public, extensions as $$
  select p.id from public.personas p where p.auth_user_id = auth.uid();
$$;

-- Quien anota los gastos del viaje (Órdenes de compra) o la dueña del fondo con que se pagó ese gasto.
create or replace function retail.fn_puede_tocar_fotos_gasto_viaje(p_gasto_id uuid) returns boolean
language sql stable security definer set search_path = retail, public, extensions as $$
  select retail.fn_ve_modulo('ordenes_compra')
      or exists (
        select 1 from retail.gastos g join retail.cuentas_dinero c on c.id = g.cuenta_dinero_id
         where g.id = p_gasto_id and c.tipo = 'fondo' and c.persona_id = retail.fn_persona_de_la_cuenta());
$$;

-- Para la política de lectura del bucket (20261013234000): la ruta de un objeto (`<gasto_id>/…`) → si quien mira puede ver esa foto
-- (quien anota los gastos del viaje, quien aprueba las rendiciones o la dueña del fondo). Una ruta que no empieza con un id: no.
create or replace function retail.fn_puede_ver_foto_gasto_viaje(p_ruta text) returns boolean
language plpgsql stable security definer set search_path = retail, public, extensions as $$
declare
  v_carpeta text := split_part(coalesce(p_ruta, ''), '/', 1);
begin
  if retail.fn_ve_modulo('ordenes_compra') or retail.fn_ve_modulo('fondos') then
    return true;
  end if;
  if v_carpeta !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return retail.fn_puede_tocar_fotos_gasto_viaje(v_carpeta::uuid);
end $$;

-- ---------- 4. Registrar una foto (después de subir el objeto) ----------
create or replace function retail.registrar_foto_gasto_viaje(
  p_gasto_id uuid,
  p_ruta text,
  p_nombre text,
  p_tipo text,
  p_bytes integer
) returns uuid
language plpgsql security definer set search_path = retail, public, extensions as $$
declare
  v_id uuid;
  v_actor uuid;
begin
  if not exists (select 1 from retail.gastos_viaje v where v.gasto_id = p_gasto_id) then
    raise exception 'Ese gasto del viaje no existe: recarga la pantalla.' using errcode = 'P0001';
  end if;
  if not retail.fn_puede_tocar_fotos_gasto_viaje(p_gasto_id) then
    raise exception 'Sumar la foto de un gasto del viaje necesita el módulo Órdenes de compra en tu rol.' using errcode = '42501';
  end if;
  if exists (select 1 from retail.gastos g where g.id = p_gasto_id and g.estado <> 'vigente') then
    raise exception 'Ese gasto está anulado: ya no se le suman fotos.' using errcode = 'P0001';
  end if;
  if nullif(btrim(coalesce(p_nombre, '')), '') is null or char_length(btrim(p_nombre)) > 200 then
    raise exception 'La foto necesita un nombre de archivo (máximo 200 letras).' using errcode = 'P0001';
  end if;
  if p_ruta is null or p_ruta not like p_gasto_id::text || '/%' then
    raise exception 'El archivo tiene que estar en la carpeta de este gasto.' using errcode = 'P0001';
  end if;
  if p_tipo is null or p_tipo not in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif') then
    raise exception 'Solo se aceptan fotos (JPG, PNG, WebP, HEIC) o un PDF.' using errcode = 'P0001';
  end if;
  if p_bytes is null or p_bytes <= 0 or p_bytes > 10 * 1024 * 1024 then
    raise exception 'El archivo tiene que pesar hasta 10 MB.' using errcode = 'P0001';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién sube la foto.' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  -- La misma foto dos veces (doble clic, reintento): la ruta es única; se devuelve la fila que ya existe.
  v_id := (select f.id from retail.gasto_viaje_fotos f where f.ruta = p_ruta);
  if v_id is not null then
    return v_id;
  end if;
  insert into retail.gasto_viaje_fotos (gasto_id, ruta, nombre, tipo, bytes, subida_por)
  values (p_gasto_id, p_ruta, btrim(p_nombre), p_tipo, p_bytes, v_actor)
  returning id into v_id;
  return v_id;
exception when unique_violation then
  return (select f.id from retail.gasto_viaje_fotos f where f.ruta = p_ruta);
end $$;

-- ---------- 5. Quitar una foto de la vista ----------
create or replace function retail.archivar_foto_gasto_viaje(p_foto_id uuid) returns void
language plpgsql security definer set search_path = retail, public, extensions as $$
declare
  v_gasto uuid;
  v_archivada timestamptz;
  v_actor uuid;
begin
  for v_gasto, v_archivada in select f.gasto_id, f.archivada_en from retail.gasto_viaje_fotos f where f.id = p_foto_id loop
    exit;
  end loop;
  if v_gasto is null then
    raise exception 'Esa foto no existe: recarga la pantalla.' using errcode = 'P0001';
  end if;
  if not retail.fn_puede_tocar_fotos_gasto_viaje(v_gasto) then
    raise exception 'Quitar la foto de un gasto del viaje necesita el módulo Órdenes de compra en tu rol.' using errcode = '42501';
  end if;
  if v_archivada is not null then
    return;
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién quita la foto.' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  update retail.gasto_viaje_fotos set archivada_en = now(), archivada_por = v_actor where id = p_foto_id;
end $$;

-- ---------- 6. Las fotos de unos gastos ----------
-- La ven quien anota los gastos del viaje, quien aprueba las rendiciones (Fondos por rendir) y la dueña del fondo.
create or replace function retail.fn_fotos_gasto_viaje(p_gastos uuid[])
returns table (id uuid, gasto_id uuid, ruta text, nombre text, tipo text, bytes integer, subida_en timestamptz)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
#variable_conflict use_column
declare
  v_modulo boolean := retail.fn_ve_modulo('ordenes_compra') or retail.fn_ve_modulo('fondos');
begin
  return query
  select f.id, f.gasto_id, f.ruta, f.nombre, f.tipo, f.bytes, f.created_at
    from retail.gasto_viaje_fotos f
   where f.gasto_id = any (coalesce(p_gastos, '{}'::uuid[])) and f.archivada_en is null
     and (v_modulo or retail.fn_puede_tocar_fotos_gasto_viaje(f.gasto_id))
   order by f.created_at;
end $$;

-- ---------- 7. Permisos ----------
revoke all on function retail.fn_persona_de_la_cuenta() from public, anon, authenticated;
revoke all on function retail.fn_puede_tocar_fotos_gasto_viaje(uuid) from public, anon, authenticated;
-- La llama la política de lectura del bucket, que corre con el rol de quien mira.
revoke all on function retail.fn_puede_ver_foto_gasto_viaje(text) from public, anon;
grant execute on function retail.fn_puede_ver_foto_gasto_viaje(text) to authenticated, service_role;
revoke all on function retail.registrar_foto_gasto_viaje(uuid, text, text, text, integer) from public, anon;
revoke all on function retail.archivar_foto_gasto_viaje(uuid) from public, anon;
revoke all on function retail.fn_fotos_gasto_viaje(uuid[]) from public, anon;
grant execute on function retail.registrar_foto_gasto_viaje(uuid, text, text, text, integer) to authenticated, service_role;
grant execute on function retail.archivar_foto_gasto_viaje(uuid) to authenticated, service_role;
grant execute on function retail.fn_fotos_gasto_viaje(uuid[]) to authenticated, service_role;

reset lock_timeout;
notify pgrst, 'reload schema';
