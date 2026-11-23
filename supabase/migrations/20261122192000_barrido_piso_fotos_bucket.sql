-- ============================================================================
-- 20261122192000_barrido_piso_fotos_bucket.sql — CAYLA V2 · ADR-0690 «El barrido del piso» · actividad 4 · PARTE 3 de 3
-- El bucket privado de las fotos de lo que no se pudo escanear (sin etiqueta o código desconocido) y SUS DOS POLÍTICAS, solas.
--
-- POR QUÉ APARTE. En el SQL Editor todo lo pegado corre en UNA transacción, y en Supabase cada `create policy` (y hasta un
-- `drop policy if exists` vacío) toma en exclusiva las tablas de auth y storage hasta el final: mezclado con otra cosa, choca con el
-- Asesor de seguridad del panel (40P01) y no se aplica nada (ADR-0195). Por eso esta parte lleva SOLO el bucket y sus políticas, se
-- pega al final y por separado, con `lock_timeout = 3s` (si no consigue el candado, falla sin daño y se vuelve a pegar).
--
-- QUÉ HACE. Mismo patrón que las fotos de las dañadas (20261029045000): un bucket PRIVADO `retail-barridos` (10 MB, solo imágenes) y
--   · subir: quien tiene sesión, solo dentro de la carpeta de un barrido de SU sede (`fn_puede_ver_foto_barrido`);
--   · ver: lo mismo (las fotos de un barrido las ve quien ve Existencias en esa sede, o el líder).
-- La foto se sube ANTES de registrar el hallazgo (registrar_hallazgo_barrido guarda su ruta). Una foto subida que nunca se registró
-- es un objeto suelto que nadie ve: no rompe nada.
--
-- SE ROMPE SI se pega antes que 20261122191000 (la política llama a fn_puede_ver_foto_barrido): lo comprueba y avisa.
-- Verificación (solo lectura): select id, public from storage.buckets where id = 'retail-barridos';  → retail-barridos | f
-- ============================================================================

set lock_timeout = '3s';
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'barrido_piso_fotos_bucket: sin schema storage en este Postgres; el bucket retail-barridos se crea donde Storage existe.';
    return;
  end if;
  if to_regprocedure('retail.fn_puede_ver_foto_barrido(text)') is null then
    raise exception 'Falta fn_puede_ver_foto_barrido: pega antes 20261122191000_barrido_piso_funciones.sql.';
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('retail-barridos', 'retail-barridos', false, 10 * 1024 * 1024, array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do update
    set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
  drop policy if exists retail_barridos_fotos_insert on storage.objects;
  create policy retail_barridos_fotos_insert on storage.objects for insert to authenticated
    with check (bucket_id = 'retail-barridos' and retail.fn_puede_ver_foto_barrido(name));
  drop policy if exists retail_barridos_fotos_select on storage.objects;
  create policy retail_barridos_fotos_select on storage.objects for select to authenticated
    using (bucket_id = 'retail-barridos' and retail.fn_puede_ver_foto_barrido(name));
end;
$$;
reset lock_timeout;
