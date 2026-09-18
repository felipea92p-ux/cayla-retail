-- ============================================================================
-- Colores: tipo visual + muestra real + notas internas
--
-- EL PROBLEMA. `colores.familia_color` (0014_vocabulario_cerrado) agrupa por
-- matiz para filtros/reportes (azul, rojo, tierra…), pero no dice NADA sobre
-- la naturaleza del color: "Azul marino" puede ser un jean liso, una tela
-- jaspeada o un estampado de puntos, y hoy las tres son indistinguibles en
-- el vocabulario. Tampoco hay dónde poner la foto real de la tela — el
-- cuadradito de `hex` es una aproximación de pantalla, no la muestra física
-- que un colaborador de sede necesita ver para no confundir "Azul marino
-- textura" con "Azul marino liso" al recibir mercadería.
--
-- QUÉ TRAE
--   · `tipo` — sólido/textura/estampado. Ortogonal a `familia_color`: un
--     mismo tipo cruza todas las familias (hay estampados azules y rojos),
--     así que es una columna nueva, no un valor dentro de `familia_color`.
--   · `imagen_muestra_url` — la foto de la tela, si existe. `hex` sigue
--     siendo la aproximación de pantalla y el fallback cuando no hay foto
--     (ColoresLista.tsx no rompe ese camino).
--   · `notas` — texto libre interno (de dónde sale la tela, con qué
--     proveedor va, cualquier advertencia). Nunca se muestra a la clienta.
--
-- DECISIÓN: BUCKET PÚBLICO, a diferencia de `retail-compras-adjuntos`
-- (20260914180000), que es privado con URL firmada. Ahí la razón de privado
-- era el contenido (RUC, montos, condiciones de pago de una factura). Una
-- foto de muestra de tela no tiene ese problema — es exactamente lo que ya
-- se ve en el listado de colores para cualquier colaborador con acceso a
-- Productos — y servirla pública evita pedir una URL firmada por cada una
-- de las ~30+ muestras cada vez que se pinta la grilla de colores (una
-- URL firmada por color, todas expirando a la hora, es complejidad que acá
-- no compra nada). Mismo criterio que `fotos-perfil` (bucket de Dynamic,
-- también público) — ver `apps/web/components/PerfilModal.tsx`.
--
-- Mecánica igual a `compras_adjuntos`: guard de `to_regclass('storage.buckets')`
-- para que `db reset` local (sin Storage) no truene, subida directa
-- navegador→bucket, política de `storage.objects` abierta a cualquier
-- autenticado y acotada solo por `bucket_id` — el candado de negocio real
-- (solo Líder puede guardar la URL en `colores`) ya lo hace
-- `colores_write_lider` (0004_rls.sql) sobre la tabla, no la subida.
-- ============================================================================

alter table retail.colores add column if not exists tipo text not null default 'solido';
alter table retail.colores
  add constraint colores_tipo_check check (tipo in ('solido', 'textura', 'estampado'));

alter table retail.colores add column if not exists imagen_muestra_url text;
alter table retail.colores add column if not exists notas text;

comment on column retail.colores.tipo is
  'Naturaleza visual del color: solido/textura/estampado. Ortogonal a familia_color (matiz).';
comment on column retail.colores.imagen_muestra_url is
  'Foto real de la tela/muestra, bucket público retail-colores-muestras. Null = usar el cuadradito de hex.';
comment on column retail.colores.notas is
  'Notas internas del vocabulario (proveedor de la tela, advertencias). Nunca se muestra a la clienta.';

-- ---------------------------------------------------------------------------
-- Bucket y políticas — solo donde Storage existe (producción)
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'colores_tipo_y_muestra: sin schema storage en este Postgres (Storage local apagado); el bucket retail-colores-muestras se crea solo en producción.';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'retail-colores-muestras',
    'retail-colores-muestras',
    true,
    5 * 1024 * 1024,
    array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
  )
  on conflict (id) do update
    set public = excluded.public,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

  drop policy if exists retail_colores_muestras_insert on storage.objects;
  create policy retail_colores_muestras_insert on storage.objects
    for insert to authenticated
    with check (bucket_id = 'retail-colores-muestras');

  drop policy if exists retail_colores_muestras_select on storage.objects;
  create policy retail_colores_muestras_select on storage.objects
    for select to authenticated
    using (bucket_id = 'retail-colores-muestras');
end;
$$;
