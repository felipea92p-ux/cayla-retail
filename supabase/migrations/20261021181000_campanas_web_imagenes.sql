-- ============================================================================
-- 20261021181000_campanas_web_imagenes.sql — Tienda web ▸ Campañas, actividad 7: el almacén de las imágenes de las campañas
--
-- EL PROBLEMA PRIMERO. Una campaña con imagen propia (modo «imagen» de `campana_web_disenos`) necesita un lugar donde vivan sus archivos: la
-- imagen horizontal del computador y, si el líder la sube, la vertical del celular. Las fotos de las prendas ya tienen el suyo
-- (`retail-productos-fotos`) y la tienda las muestra desde ahí; mezclar un banner de campaña con las fotos de las prendas confunde qué es
-- cada cosa y obliga a abrirle a la tienda más de lo que necesita.
--
-- LO QUE HACE
--   PARTE 1 · el bucket público `retail-campanas` (1 MB como tope, JPG y WebP; el ERP sube imágenes ya reducidas a 300 KB o menos). Se ven sin
--            ninguna llave, como las de las prendas; la base solo guarda la RUTA (`campanas/<campaña>/<archivo>`), que su CHECK ya exige.
--   PARTE 2 · la política que deja SUBIR a quien tiene el módulo `campanas_web` (y a nadie más). Leer no pide política: el bucket es público.
--
-- DECIDÍ: solo se SUBE (nunca se pisa ni se borra desde el ERP): cada imagen nueva lleva un nombre nuevo y la campaña guarda el que eligió, así
--   volver a una anterior no pierde nada y un archivo huérfano pesa a lo más 300 KB. Sin política de borrar ni de actualizar.
-- DESCARTÉ: guardar la imagen en la base (bytea) —la tienda la pediría en cada visita y la base no es un almacén de archivos—; reusar el bucket de
--   las prendas (mezcla cosas y abre su política de subida a otro módulo); una política que pida solo «estar autenticado» (cualquier cuenta
--   del ERP podría llenar el almacén).
--
-- PRODUCCIÓN. NO está aplicada. Se pega en DOS partes, por separado y en orden (ADR-0195): en Supabase, crear una política toma en exclusiva las
-- tablas de `auth` y `storage` hasta el final de la transacción, así que va sola y al final, con `lock_timeout`, fuera del horario de tienda
-- (toma `storage.objects` un instante). Ambas se pueden volver a correr. En un Postgres sin Storage (el local) las dos avisan y siguen.
-- ============================================================================

-- ============================== PARTE 1 · el bucket ==============================

set lock_timeout = '3s';

do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'campanas_web: sin schema storage en este Postgres (Storage local apagado); el bucket retail-campanas se crea solo en producción.';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('retail-campanas', 'retail-campanas', true, 1024 * 1024, array['image/jpeg', 'image/webp'])
  on conflict (id) do update
    set public = excluded.public,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;
end
$$;

reset lock_timeout;

-- ============================== PARTE 2 · la política de subida (sola, al final) ==============================

set lock_timeout = '3s';

do $$
begin
  if to_regclass('storage.objects') is null then
    raise notice 'campanas_web: sin schema storage en este Postgres; la política de subida se crea solo en producción.';
    return;
  end if;

  if not exists (
    select 1 from pg_policies p where p.schemaname = 'storage' and p.tablename = 'objects' and p.policyname = 'retail_campanas_insert'
  ) then
    create policy retail_campanas_insert on storage.objects
      for insert to authenticated
      with check (bucket_id = 'retail-campanas' and (select retail.fn_ve_modulo('campanas_web')));
  end if;
end
$$;

reset lock_timeout;
