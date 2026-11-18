-- ============================================================================
-- 20261118001000 — Los descuentos de la lista de Campañas y ofertas (ADR-0677, Felipe 2026-11-17)
--
-- EL PROBLEMA. La pantalla nueva de Campañas y ofertas (maqueta `docs/maquetas/campanas-simple-2026-11/`, cara A) pone los DESCUENTOS
--   primero: cada cajón de «Poner un %» (`rebaja_cajones`, ADR-0669) es una fila «Descuento −10 %» con sus prendas. Para dibujarla hacen
--   falta dos cosas que `campanas_rebajas_de_tienda` no da:
--   · si el cajón es de TODAS las tiendas (Felipe 2026-11-17: el −10 % de la tienda y el de todas son dos filas, y la de todas lo dice);
--   · TODOS los cajones, también los de otras tiendas, porque un cajón es una campaña sin fechas y, si no se sabe cuál es, la lista lo
--     dibuja además como campaña «Guardada» (el pendiente «los cajones también salen como campañas en la billetera»).
--
-- LO QUE HACE. `campanas_descuentos(p_ubicacion_id)`: cada cajón con su %, si es de todas las tiendas, si rige en la tienda que se mira
--   (la suya o todas), si sigue activo y cuántas prendas tiene (el modelo en su color, como cuenta `fn_prendas_de_lugar`; solo de los que
--   rigen ahí). Solo lee.
--   DECIDÍ una función nueva en vez de cambiarle la forma a `campanas_rebajas_de_tienda`: cambiar las columnas de lo que devuelve obliga a
--     borrarla y crearla, y la pantalla de hoy (PR #1898) la sigue llamando hasta que esta salga. DESCARTÉ leer `rebaja_cajones` desde la
--     web: tiene RLS sin políticas (solo la leen sus funciones, ADR-0195).
--   DECIDÍ la misma puerta de lectura que el resto de Campañas (`fn_puede_campanas`), sin exigir tienda: la lista se dibuja también para
--     un líder que mira sin sede, y saber qué campañas son cajones no dice nada que la pantalla no muestre ya.
--
-- CÓMO SE PEGA. Una sola parte, idempotente, `lock_timeout` 3 s: una función nueva de solo lectura. No toca tablas ni políticas.
-- CAÍDA EXTERNA. Nada llama a la red. Si la función no está (la web sale antes que el pegado), la pantalla dibuja la lista sin la sección
--   Descuentos, como antes.
-- PRUEBA. `pnpm pruebas:rebaja-rapida` (scripts/pruebas/rebaja_rapida.mjs, casos de «campanas_descuentos»).
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function retail.campanas_descuentos(p_ubicacion_id uuid)
returns table (etiqueta_id uuid, pct numeric, todas boolean, rige_aqui boolean, activo boolean, prendas integer)
language plpgsql
stable
security definer
set search_path to 'retail', 'public'
as $function$
begin
  if not retail.fn_puede_campanas() then
    raise exception 'Ver los descuentos necesita ver «Campañas y ofertas» en tu rol.' using errcode = '42501', hint = 'rebaja_sin_modulo';
  end if;
  return query
    select c.etiqueta_id,
           c.pct,
           c.ubicacion_id is null,
           (c.ubicacion_id is null or c.ubicacion_id = p_ubicacion_id),
           e.activo,
           case when e.activo and (c.ubicacion_id is null or c.ubicacion_id = p_ubicacion_id)
                then retail.fn_prendas_de_lugar(c.etiqueta_id) else 0 end
    from retail.rebaja_cajones c
    join retail.etiquetas e on e.id = c.etiqueta_id
    order by c.pct, (c.ubicacion_id is null), c.etiqueta_id;
end;
$function$;

comment on function retail.campanas_descuentos(uuid) is
  'ADR-0677. Los descuentos (cajones de «Poner un %», ADR-0669) para la lista de Campañas y ofertas: todos, con su %, si son de todas las tiendas, si rigen en la tienda que se mira, si siguen activos y cuántas prendas tienen los que rigen ahí.';

revoke all on function retail.campanas_descuentos(uuid) from public, anon;
grant execute on function retail.campanas_descuentos(uuid) to authenticated;
