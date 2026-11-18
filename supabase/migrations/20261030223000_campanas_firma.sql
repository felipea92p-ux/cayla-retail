-- ============================================================================
-- 20261030223000_campanas_firma.sql — CAYLA V2 · rendimiento de la base (2026-10-30)
-- `campanas_firma(tienda)`: un texto corto que cambia si y solo si cambia la lista de `campanas_vigentes(tienda)`.
--
-- EL PROBLEMA PRIMERO. `campanas_vigentes` es la función de retail que más veces se llama: 206 810 llamadas desde el 17-oct. La mayoría
-- las hace `<PreciosEnVivo />` (montado en el layout: corre en TODA pantalla del ERP), que cada 10 s baja la lista ENTERA de campañas de la
-- tienda solo para compararla con la anterior y saber si rehacer la pantalla. Hoy son de 1 a 46 filas, pero en el Aniversario
-- (2026-10-23) TRU tuvo 2 518 prendas en campaña: ~420 KB en 3 páginas cada 10 s por pantalla abierta, y cada página volvía a calcular
-- la función entera (ADR-0192). Medido el 2026-10-30 en producción: calcular la firma cuesta lo mismo que una página (7–15 ms), pero viaja
-- en UNA llamada y 32 caracteres, tenga la campaña 46 prendas o 2 500.
--
-- QUÉ HACE. `campanas_firma(p_ubicacion_id)`: el md5 de la lista de `campanas_vigentes(p_ubicacion_id)` —prenda, campaña y % de cada fila,
-- en orden de prenda—. Lo mismo que el ERP ya comparaba en el navegador (`firmaDePrecios`): el nombre de la campaña no entra (renombrarla no
-- cambia ningún precio). Se calcula SOBRE `campanas_vigentes`, no la copia: si mañana cambia la regla de qué campaña rige, la firma la
-- sigue sola. Sin filas, el md5 del texto vacío (una firma estable, no null).
--
-- LO QUE NO CAMBIA: `campanas_vigentes` y quien la usa para cobrar (Vender, Apartados): siguen leyendo la lista. Mismos permisos que ella:
-- corre con los de quien pregunta (`security invoker`), solo `authenticated`.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe): UNA parte, una función nueva y sus permisos (sin políticas, sin `drop trigger`,
-- ADR-0195). Idempotente. Sin `select … into` (ADR-0288). El ERP que la usa cae solo a la lista de antes si la función todavía no existe
-- (PGRST202), así que el orden entre el código y este pegado no rompe nada. Prueba: `pnpm pruebas:campanas-por-sede`, caso 12.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

create or replace function retail.campanas_firma(p_ubicacion_id uuid default null)
returns text
language sql
stable
set search_path = retail, public, extensions
as $$
  -- La misma lista que compara el ERP (prenda:campaña:%), en orden de prenda; trim_scale para que 20 y 20.00 firmen igual.
  select md5(coalesce(string_agg(c.variante_id::text || ':' || c.etiqueta_id::text || ':' || trim_scale(c.descuento_pct)::text, ','
                                 order by c.variante_id), ''))
    from retail.campanas_vigentes(p_ubicacion_id) c;
$$;

revoke all on function retail.campanas_firma(uuid) from public, anon;
grant execute on function retail.campanas_firma(uuid) to authenticated;

comment on function retail.campanas_firma(uuid) is
  'md5 de la lista de campanas_vigentes(tienda): cambia si y solo si cambia qué campaña y % rige por prenda. Para sondear sin bajar la lista (20261030223000).';
