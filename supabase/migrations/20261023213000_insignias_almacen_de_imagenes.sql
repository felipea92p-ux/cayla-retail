-- ============================================================================
-- 20261023213000_insignias_almacen_de_imagenes.sql — Catálogo ▸ Insignias: el almacén de las imágenes propias de las insignias (ADR-0490)
--
-- EL PROBLEMA PRIMERO. Felipe (2026-10-23): además de elegir un dibujo de la lista, quien crea una insignia o una campaña tiene que poder SUBIR una
--   imagen propia para su ícono. La imagen necesita un lugar donde viva el archivo; la base solo guarda su ruta (`etiquetas.icono_imagen`, en
--   20261023203000), como las campañas guardan la suya.
--
-- ANALOGÍA CAYLA. Es el cajón donde se guardan los sellos de goma que traen de afuera: el cajón es de las encargadas de las insignias, y cualquier
--   cliente que pasa por la tienda puede MIRAR lo que hay en él, pero solo ellas lo llenan.
--
-- LO QUE HACE (mismo patrón que `retail-campanas`, 20261021181000)
--   PARTE 1 · el bucket público `retail-insignias`: 100 KB como tope y solo WebP (el ERP reduce la imagen a 256 × 256 en el navegador antes de subirla).
--            Se ve sin ninguna llave, como las fotos de las prendas y las imágenes de las campañas; la base solo guarda la RUTA, que su CHECK exige.
--   PARTE 2 · la política que deja SUBIR a quien configura una insignia o una campaña (`fn_puede_campanas`: el líder, o un rol con Insignias,
--            Campañas o Campañas de la tienda web) y a nadie más. Leer no pide política: el bucket es público.
--
-- DECIDÍ: solo se SUBE (nunca se pisa ni se borra desde el ERP): cada imagen nueva lleva un nombre nuevo y la insignia guarda el que eligió. Un
--   archivo huérfano pesa a lo más 100 KB. Sin política de borrar ni de actualizar.
-- DESCARTÉ: reusar `retail-campanas` o `retail-productos-fotos` (mezcla cosas y abre su política de subida a otro módulo), una política que pida solo
--   «estar autenticado» (cualquier cuenta del ERP podría llenar el almacén) y aceptar SVG o PNG (un SVG puede traer código; el WebP es lo que el
--   ERP prepara y lo que mantiene el peso a raya).
-- SE ROMPE SI: la política se pega antes de 20261022203000 (llama a `fn_puede_campanas`, que viene de ahí; sin ella, la parte 2 falla y no queda
--   nadie que pueda subir), o si el almacén de ESTE proyecto no existe (la subida dice «el almacén de imágenes de las insignias no está
--   configurado en este entorno»). Va junto con 20261023203000: la web nueva necesita las dos.
--
-- PRODUCCIÓN. Se pega en DOS partes, por separado y en orden (ADR-0195): en Supabase, crear una política toma en exclusiva las tablas de `auth` y
--   `storage` hasta el final de la transacción, así que va sola y al final, con `lock_timeout`. Ambas se pueden volver a correr. En un Postgres
--   sin Storage (el del CI) las dos avisan y siguen.
-- CAÍDA EXTERNA. Si el almacén no responde, subir la imagen falla con su mensaje y la insignia se crea igual, con el dibujo de su nombre.
-- ============================================================================

-- ============================== PARTE 1 · el bucket ==============================

set lock_timeout = '3s';

do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'insignias: sin schema storage en este Postgres (Storage apagado); el bucket retail-insignias se crea solo en producción.';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('retail-insignias', 'retail-insignias', true, 100 * 1024, array['image/webp'])
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
    raise notice 'insignias: sin schema storage en este Postgres; la política de subida se crea solo en producción.';
    return;
  end if;

  if not exists (
    select 1 from pg_policies p where p.schemaname = 'storage' and p.tablename = 'objects' and p.policyname = 'retail_insignias_insert'
  ) then
    create policy retail_insignias_insert on storage.objects
      for insert to authenticated
      with check (bucket_id = 'retail-insignias' and (select retail.fn_puede_campanas()));
  end if;
end
$$;

reset lock_timeout;
