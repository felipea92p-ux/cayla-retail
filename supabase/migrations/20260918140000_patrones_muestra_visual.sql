-- ============================================================================
-- 20260918140000 — Foto de muestra real para Patrones (mismo mecanismo que
-- Colores, `20260915230000_colores_tipo_y_muestra.sql`)
--
-- Felipe: "sería ideal ponerle su imagen referencial así como en colores" —
-- las 7 tarjetas de Patrones (Liso, Rayas, Cuadros...) solo tenían nombre,
-- sin ninguna referencia visual de qué estampado es cada uno.
--
-- POR QUÉ EL MISMO MECANISMO Y NO UNO PROPIO
--   Colores ya resolvió exactamente este problema: `imagen_muestra_url` +
--   bucket público + subida directa navegador→bucket, con el candado de
--   negocio real en la política de la TABLA (`patrones_update_lider`, ya
--   existe), no en la subida. Repetirlo con otro nombre/forma sería el
--   mismo error de integridad conceptual que ya corregimos hoy (Patrones
--   vs `colores.tipo='estampado'`) — una tercera variante del mismo
--   problema, en vez de reusar la que ya funciona.
--
-- A diferencia de Colores, Patrones NO tiene `hex` — no hay color de
-- respaldo cuando falta la foto. La pantalla usa un cuadro neutro (mismo
-- fallback de `Muestra`, con `hex=null`) hasta que alguien sube la imagen.
-- ============================================================================

set search_path = retail, public, extensions;

alter table retail.patrones add column if not exists imagen_muestra_url text;

comment on column retail.patrones.imagen_muestra_url is
  'Foto real de la tela/estampado, bucket público retail-patrones-muestras. Null = sin referencia visual todavía.';

do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'patrones_muestra_visual: sin schema storage en este Postgres (Storage local apagado); el bucket retail-patrones-muestras se crea solo en producción.';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'retail-patrones-muestras',
    'retail-patrones-muestras',
    true,
    5 * 1024 * 1024,
    array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
  )
  on conflict (id) do update
    set public = excluded.public,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

  drop policy if exists retail_patrones_muestras_insert on storage.objects;
  create policy retail_patrones_muestras_insert on storage.objects
    for insert to authenticated
    with check (bucket_id = 'retail-patrones-muestras');

  drop policy if exists retail_patrones_muestras_select on storage.objects;
  create policy retail_patrones_muestras_select on storage.objects
    for select to authenticated
    using (bucket_id = 'retail-patrones-muestras');
end;
$$;
