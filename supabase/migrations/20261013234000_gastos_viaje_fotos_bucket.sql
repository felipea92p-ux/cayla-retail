-- El bucket de las fotos de los gastos del viaje y sus políticas, fase 6 · actividad 5 (ADR-0362, decisión 69). Va SOLO, después de
-- 20261013233000 (que crea `fn_puede_ver_foto_gasto_viaje`, la que usa la lectura).
--
-- POR QUÉ VA APARTE (ADR-0195, «Políticas y deadlocks»): en Supabase cada `create policy` —y hasta un `drop policy if exists` vacío— toma
-- en exclusiva las tablas de `auth` y `storage` hasta el final de la transacción. Sola, con `lock_timeout`, no choca con nada; mezclada
-- con un `alter` de una tabla en uso, termina en `40P01 deadlock detected` y no se aplica nada.
--
-- QUÉ CREA
--   · El bucket privado `retail-gastos-viaje`: hasta 10 MB, fotos (JPG, PNG, WebP, HEIC) o PDF, como los adjuntos de una factura.
--   · Subir: cualquier persona con sesión, solo en este bucket (como `retail-compras-adjuntos`): un objeto sin su fila es basura que nadie
--     ve; el candado de negocio es `registrar_foto_gasto_viaje`. Ni update ni delete: una foto no se pisa ni se borra.
--   · Leer: quien anota los gastos del viaje, quien aprueba las rendiciones o la dueña del fondo (`fn_puede_ver_foto_gasto_viaje`).
--
-- Solo donde existe Storage (producción y un stack completo); en un Postgres sin Storage (el del CI) avisa y no hace nada. Idempotente.

set lock_timeout = '3s';

do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'gastos_viaje_fotos: sin schema storage en este Postgres; el bucket retail-gastos-viaje se crea donde Storage existe.';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('retail-gastos-viaje', 'retail-gastos-viaje', false, 10 * 1024 * 1024,
          array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
  on conflict (id) do update
    set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

  drop policy if exists retail_gastos_viaje_fotos_insert on storage.objects;
  create policy retail_gastos_viaje_fotos_insert on storage.objects for insert to authenticated
    with check (bucket_id = 'retail-gastos-viaje');

  drop policy if exists retail_gastos_viaje_fotos_select on storage.objects;
  create policy retail_gastos_viaje_fotos_select on storage.objects for select to authenticated
    using (bucket_id = 'retail-gastos-viaje' and retail.fn_puede_ver_foto_gasto_viaje(name));
end;
$$;

reset lock_timeout;
