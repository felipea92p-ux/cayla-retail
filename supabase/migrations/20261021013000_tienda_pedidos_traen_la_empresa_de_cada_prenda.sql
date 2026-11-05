-- ============================================================================
-- 20261021013000_tienda_pedidos_traen_la_empresa_de_cada_prenda.sql — CAYLA V2 · Tienda online (ADR-0465)
-- Cada prenda de un pedido (el detalle de «Mis pedidos» y la página «Separado») dice a qué empresa pertenece.
--
-- EL PROBLEMA PRIMERO. Un pedido en Lima puede mezclar prendas de CAYLA y de CLAURE. La bolsa ya dice la empresa de cada prenda
-- (20261021011000), pero al separar el pedido la lista de prendas se arma por otro camino (`tienda_mis_pedidos`, de la que sale también
-- `tienda_pedido`) y la empresa se perdía. Felipe (2026-10-21): «en el detalle de un pedido, el nombre de la empresa de cada producto
-- también debe aparecer sobre su nombre».
--
-- ANALOGÍA CAYLA. La etiqueta del perchero sigue a la prenda de la vidriera a la bolsa y, ahora, al pedido separado.
--
-- QUÉ HACE. `tienda_mis_pedidos(usuario)` suma a cada línea de cada pedido `'empresa': {clave, nombre}`, solo si la tienda DEL PEDIDO
-- (donde se recoge) tiene dos o más empresas (`fn_empresas_de_sede`: Lima), con la misma regla del catálogo y de la bolsa; un pedido a
-- Trujillo no dice empresa. El pedido es de una tienda y la regla es de la tienda, no de quien mira. `tienda_pedido` la hereda porque
-- lee de `tienda_mis_pedidos`.
--
-- DECIDÍ: ponerlo en `tienda_mis_pedidos` y no en `fn_bolsa_web_prenda`: esa función no sabe de tiendas (la comparten la bolsa y el pedido).
-- DESCARTÉ: mostrar la empresa siempre en un pedido: contradice lo que Felipe pidió para todo lo demás (solo en Lima).
--
-- SE ROMPE SI: se arma otra lista de prendas de un pedido por un camino que no pase por `tienda_mis_pedidos`.
--
-- PRODUCCIÓN. Una sola parte, idempotente (se puede pegar dos veces): un reemplazo anclado; no toma tablas en exclusiva ni toca políticas
-- (sin riesgo de 40P01). Cuenta que su ancla aparezca UNA vez: si alguien cambió la función, se detiene sin tocar nada. Sin `select … into`
-- dentro de un texto entre comillas. El orden con la publicación de la web no importa. Requiere 20261021001000 (`fn_empresas_de_sede`, de 20261020225000).
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function pg_temp.reemplazar_anclado(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  -- Ya aplicado: el texto nuevo está. Se mira primero porque, una vez aplicado, el ancla vieja ya no aparece y el conteo abortaría.
  if position(p_nuevo in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: el ancla aparece % veces (se esperaba %). Regenera el reemplazo desde su definición real.',
      p_firma, v_n, p_veces;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

select pg_temp.reemplazar_anclado(
  'retail.tienda_mis_pedidos(uuid)',
  $v$|| coalesce(retail.fn_bolsa_web_prenda((l.y ->> 'variante_id')::uuid), '{}'::jsonb)$v$,
  $v$|| coalesce(retail.fn_bolsa_web_prenda((l.y ->> 'variante_id')::uuid), '{}'::jsonb)
                                       -- ADR-0465: de qué empresa es la prenda, solo si la tienda del pedido tiene dos o más empresas (Lima).
                                       || jsonb_build_object('empresa', case when (select count(*) from retail.fn_empresas_de_sede((p.x ->> 'ubicacion_id')::uuid)) > 1
                                                                             then (select jsonb_build_object('clave', em.clave, 'nombre', em.nombre)
                                                                                     from retail.variantes vv
                                                                                     join retail.productos pp on pp.id = vv.producto_id
                                                                                     join retail.empresas em on em.id = pp.empresa_id
                                                                                    where vv.id = (l.y ->> 'variante_id')::uuid) end)$v$,
  1
);

select 'ADR-0465 · tienda: los pedidos traen la empresa de cada prenda' as parte,
       case when pg_get_functiondef('retail.tienda_mis_pedidos(uuid)'::regprocedure) like '%jsonb_build_object(''empresa'', case when (select count(*) from retail.fn_empresas_de_sede((p.x ->> ''ubicacion_id'')::uuid)) > 1%'
            then 'QUEDÓ BIEN' else 'REVISAR' end as resultado;
