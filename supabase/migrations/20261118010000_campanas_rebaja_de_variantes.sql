-- ============================================================================
-- 20261118010000 — Dónde está cada talla antes de agregarla a un descuento (ADR-0677, Felipe 2026-11-17)
--
-- EL PROBLEMA. En la pantalla nueva de Campañas y ofertas se agregan prendas a un descuento desde su panel (maqueta
--   `docs/maquetas/campanas-simple-2026-11/`: «todo se deshace»). Agregar una prenda la saca del lugar movible donde estaba (una prenda, un
--   lugar: `poner_rebaja`, ADR-0669), y «todo el modelo» puede traer tallas de lugares distintos. Para que «Deshacer» devuelva cada talla a
--   donde estaba (y no le invente un % a la que no tenía), la pantalla necesita saberlo ANTES de agregar. `poner_rebaja` solo dice los
--   nombres de donde sacó algo, sin decir qué talla venía de cuál, y `campanas_rebaja_de_prenda` lo dice talla por talla.
--
-- LO QUE HACE. `campanas_rebaja_de_variantes(p_variantes, p_ubicacion_id, p_todas)`: de cada talla pedida, el lugar movible de la tienda (o
--   de todas) donde está marcada a mano. Las que no están en ninguno no salen. Solo lee, con la misma puerta y los mismos lugares que
--   `poner_rebaja` (`fn_exigir_rebaja_rapida` y `fn_rebajas_de_sede`): lo que dice es exactamente de donde `poner_rebaja` la sacaría.
--   DESCARTÉ que `poner_rebaja` devuelva de dónde vino cada talla: es la función que fija el precio que cobra la caja, y una lectura aparte
--   no la toca.
--
-- CÓMO SE PEGA. Una sola parte, idempotente, `lock_timeout` 3 s: una función nueva de solo lectura. No toca tablas ni políticas.
-- CAÍDA EXTERNA. Nada llama a la red. Sin ella en la base, el panel agrega igual y su aviso sale sin «Deshacer».
-- PRUEBA. `pnpm pruebas:rebaja-rapida` (scripts/pruebas/rebaja_rapida.mjs, casos de «campanas_rebaja_de_variantes»).
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function retail.campanas_rebaja_de_variantes(p_variantes uuid[], p_ubicacion_id uuid, p_todas boolean default false)
returns table (variante_id uuid, etiqueta_id uuid)
language plpgsql
stable
security definer
set search_path to 'retail', 'public'
as $function$
declare
  v_todas boolean := coalesce(p_todas, false);
  v_sede uuid := retail.fn_exigir_rebaja_rapida(p_ubicacion_id, v_todas);
begin
  return query
    select distinct on (ve.variante_id) ve.variante_id, ve.etiqueta_id
    from retail.variante_etiquetas ve
    join retail.fn_rebajas_de_sede(v_sede, v_todas) l on l.etiqueta_id = ve.etiqueta_id and l.movible
    where ve.variante_id = any(coalesce(p_variantes, '{}'::uuid[]))
    order by ve.variante_id, l.es_cajon desc, ve.etiqueta_id;
end;
$function$;

comment on function retail.campanas_rebaja_de_variantes(uuid[], uuid, boolean) is
  'ADR-0677. De cada talla pedida, el lugar movible de la tienda (o de todas) donde está marcada a mano: de donde poner_rebaja la sacaría. Para que «Deshacer» devuelva cada una a su lugar.';

revoke all on function retail.campanas_rebaja_de_variantes(uuid[], uuid, boolean) from public, anon;
grant execute on function retail.campanas_rebaja_de_variantes(uuid[], uuid, boolean) to authenticated;
