-- ============================================================================
-- activacion-cuarentena-produccion.sql — NO es parte de la cadena de
-- migraciones. TODAVÍA NO SE APLICÓ en producción — queda listo en el repo
-- para cuando Felipe confirme el paso a producción de "Dañado"/Cuarentena
-- (ver docs/adr/0071-inventario-se-lee-como-cuatro-pantallas.md).
--
-- A propósito el nombre no sigue el patrón <timestamp>_nombre.sql: así
-- `supabase db reset` (local) lo ignora — en local no hace falta, `seed.sql`
-- ya crea la sububicación «Cuarentena» para cada tienda.
--
-- QUÉ HACE (producción, proyecto de Dynamic vovjyyiafkxteijimpuy, schema
-- `retail`): crea la sububicación «Cuarentena» (tipo `cuarentena`) en cada
-- ubicación de tipo `tienda` — mismo patrón exacto que
-- `activacion-piso-almacen-produccion.sql` hizo para Piso de venta/Almacén
-- de tienda. Sin esto, `aprobar_devolucion` en producción falla con "Esta
-- ubicación no tiene sububicación de cuarentena configurada" en cuanto
-- alguien apruebe una devolución con condición dañada.
--
-- ORDEN DE APLICACIÓN EN PRODUCCIÓN (no antes de confirmar con Felipe):
--   1) La migración de esquema `20260917100000_cuarentena_prendas_danadas.sql`
--      completa, pegada en el SQL Editor CON el prefijo `retail.` agregado a
--      cada tabla (regla del repo: el SQL Editor de producción, a diferencia
--      de `supabase db reset` local, busca en `public` por defecto).
--   2) Este script, una sola vez.
--
-- SE ROMPE SI: se corre antes que la migración de esquema (la tabla
-- `sububicaciones` con la columna `tipo` ya existe desde V1, así que esta
-- parte no fallaría — pero `aprobar_devolucion`/`resolver_prenda_danada`
-- seguirían siendo las versiones viejas hasta que la migración de esquema
-- se aplique). Es idempotente (`on conflict do nothing`): correrlo dos
-- veces no duplica nada.
-- ============================================================================

set search_path = retail, public, extensions;

insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
select u.id, 'Cuarentena', 'cuarentena'
from retail.ubicaciones u
where u.tipo = 'tienda'
on conflict (ubicacion_id, nombre) do nothing;
