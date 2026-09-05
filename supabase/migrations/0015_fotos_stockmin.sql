-- Fase B parte 2: fotos de producto (una por modelo) y stock mínimo por sede.
-- Aplicada en Supabase el 2026-07-19.

-- ==================== FOTOS DE PRODUCTO (una por modelo) ====================
alter table productos add column foto_url text;

-- Almacén de archivos para las fotos (bucket público: la app las muestra directo).
-- Condicionado a que el schema `storage` exista (2026-09-05): en producción
-- siempre está, pero el stack local corre con el servicio de Storage apagado
-- —es el único contenedor que queda unhealthy y hacía abortar `supabase start`
-- entero, ver supabase/config.toml— y sin esta guarda la migración reventaba
-- con "relation storage.buckets does not exist", dejando el entorno local
-- imposible de levantar. Con storage encendido el comportamiento es idéntico
-- al original.
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'Storage apagado: se omite el bucket de fotos (solo afecta a local)';
    return;
  end if;

  insert into storage.buckets (id, name, public)
    values ('fotos-productos', 'fotos-productos', true)
    on conflict (id) do nothing;

  create policy "fotos_upload_autenticado" on storage.objects for insert to authenticated
    with check (bucket_id = 'fotos-productos');
  create policy "fotos_select_publico" on storage.objects for select
    using (bucket_id = 'fotos-productos');
end $$;

-- ==================== STOCK MÍNIMO POR SEDE ====================
-- TRU vende distinto que AQP: el mínimo de cada talla puede ser distinto por tienda.
-- Si no se define, se usa el mínimo general de la variante (como hasta hoy).
alter table stock add column stock_minimo integer;
