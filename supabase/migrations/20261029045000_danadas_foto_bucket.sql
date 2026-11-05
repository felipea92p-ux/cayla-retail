-- El bucket de las fotos del daño de las prendas dañadas y sus políticas, ADR-0564 · actividad 7. Va SOLO, después de 20261029034000 (que
-- crea `fn_puede_ver_foto_danada`, la que usa la lectura).
--
-- POR QUÉ VA APARTE (ADR-0195, «Políticas y deadlocks»): en Supabase cada `create policy` —y hasta un `drop policy if exists` vacío— toma
-- en exclusiva las tablas de `auth` y `storage` hasta el final de la transacción. Sola, con `lock_timeout`, no choca con nada; mezclada
-- con un `alter` de una tabla en uso, termina en `40P01 deadlock detected` y no se aplica nada.
--
-- QUÉ CREA
--   · El bucket privado `retail-danadas`: hasta 10 MB, solo fotos (JPG, PNG, WebP, HEIC).
--   · Subir: cualquier persona con sesión, solo en este bucket (como `retail-gastos-viaje`): un objeto sin su fila es basura que nadie
--     ve; el candado de negocio es `registrar_foto_danada`. Ni update ni delete: una foto no se pisa ni se borra.
--   · Leer: quien ve Existencias y puede ver esa dañada (`fn_puede_ver_foto_danada`).
--
-- Solo donde existe Storage (producción y un stack completo); en un Postgres sin Storage (el del CI) avisa y no hace nada. Idempotente.

set lock_timeout = '3s';

do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'danadas_foto_bucket: sin schema storage en este Postgres; el bucket retail-danadas se crea donde Storage existe.';
    return;
  end if;
  if to_regprocedure('retail.fn_puede_ver_foto_danada(text)') is null then
    raise exception 'Falta fn_puede_ver_foto_danada: pega antes 20261029034000_danadas_foto_del_dano.sql.';
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('retail-danadas', 'retail-danadas', false, 10 * 1024 * 1024,
          array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
  on conflict (id) do update
    set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

  drop policy if exists retail_danadas_fotos_insert on storage.objects;
  create policy retail_danadas_fotos_insert on storage.objects for insert to authenticated
    with check (bucket_id = 'retail-danadas');

  drop policy if exists retail_danadas_fotos_select on storage.objects;
  create policy retail_danadas_fotos_select on storage.objects for select to authenticated
    using (bucket_id = 'retail-danadas' and retail.fn_puede_ver_foto_danada(name));
end;
$$;

reset lock_timeout;
