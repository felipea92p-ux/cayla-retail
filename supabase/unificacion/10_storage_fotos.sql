-- ============================================================================
-- 10_storage_fotos.sql — Buzón de fotos de producto en el proyecto dynamic
-- ----------------------------------------------------------------------------
-- CONTRATO
--   Promete: existe un buzón público 'fotos-productos' donde el Líder sube la
--            foto de cada modelo, y cualquiera la puede VER por su URL pública.
--   Asume:   dynamic ya tiene public.fn_rol_actual() (devuelve 'admin' para el
--            Líder) — el MISMO chequeo que usa toda la seguridad de retail.
--
-- POR QUÉ "público" NO alcanza:
--   "Público" solo abre la LECTURA (la vitrina: ver la foto sin login). SUBIR
--   una foto igual pasa por seguridad — sin una política de INSERT/UPDATE, hasta
--   el Líder recibiría un "row-level security" al intentar subir. Estas políticas
--   son ese permiso, y lo dan solo al Líder (igual que editar el catálogo).
-- ============================================================================

-- 1) El buzón. Idempotente: si ya existe, solo asegura que quede público.
insert into storage.buckets (id, name, public)
values ('fotos-productos', 'fotos-productos', true)
on conflict (id) do update set public = excluded.public;

-- 2) Subir foto nueva → solo el Líder.
drop policy if exists "fotos_insert_lider" on storage.objects;
create policy "fotos_insert_lider" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'fotos-productos' and public.fn_rol_actual() = 'admin');

-- 3) Reemplazar foto (el componente usa upsert=true al cambiarla) → solo el Líder.
drop policy if exists "fotos_update_lider" on storage.objects;
create policy "fotos_update_lider" on storage.objects
  for update to authenticated
  using      (bucket_id = 'fotos-productos' and public.fn_rol_actual() = 'admin')
  with check (bucket_id = 'fotos-productos' and public.fn_rol_actual() = 'admin');

-- No hace falta política de LECTURA: al ser buzón público, ver la foto por su URL
-- no pasa por RLS. Tampoco hay borrado (el componente nunca elimina archivos).
