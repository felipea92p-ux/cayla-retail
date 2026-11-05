-- ============================================================================
-- 20261021011000_tienda_bolsa_trae_la_empresa_de_cada_prenda.sql — CAYLA V2 · Tienda online (ADR-0465)
-- Cada prenda de la bolsa dice a qué empresa pertenece, para que su resumen la escriba encima del nombre.
--
-- EL PROBLEMA PRIMERO. La bolsa puede llevar prendas de CAYLA y de CLAURE (en Lima conviven). Sin la empresa en cada línea, quien revisa su
-- bolsa antes de «Separar» no sabe cuál es de quién. Felipe (2026-10-21): «la empresa también debe aparecer en el resumen del producto
-- cuando está en la bolsa», y solo cuando la tienda es Lima.
--
-- ANALOGÍA CAYLA. La etiqueta del perchero (20261021001000) viaja con la prenda desde la vidriera hasta la bolsa.
--
-- QUÉ HACE. `tienda_bolsa(lineas, sede)` suma a cada línea `'empresa': {clave, nombre}`, solo si la tienda de la bolsa tiene dos o más
-- empresas (`fn_empresas_de_sede`: Lima), con la misma regla del catálogo; en Trujillo, o sin tienda, va `null` y no se escribe nada. Un dato
-- más de la línea: la web de antes lo ignora y la nueva, si no llega, no dibuja la empresa (principio 9: se degrada, no se cae).
--
-- DECIDÍ: ponerlo en `tienda_bolsa` y no en `fn_bolsa_web_prenda`: esa función la comparten «Mis pedidos» y no sabe en qué tienda se mira
--   (la regla depende de la tienda).
-- DESCARTÉ: calcular la empresa en la web a partir del catálogo: la bolsa guarda variantes y la web no tiene el catálogo a mano en esa pantalla.
--
-- SE ROMPE SI: se agrega otra respuesta de la bolsa por otro camino que no pase por `tienda_bolsa`.
--
-- PRODUCCIÓN. Una sola parte, idempotente (se puede pegar dos veces): un reemplazo anclado; no toma tablas en exclusiva ni toca políticas
-- (sin riesgo de 40P01). Cuenta que su ancla aparezca UNA vez: si alguien cambió la función, se detiene sin tocar nada. Sin `select … into`
-- dentro de un texto entre comillas. El orden con la publicación de la web no importa. Requiere 20261021002000.
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
    raise exception '% cambió desde que se escribió esta migración: el ancla aparece % veces (se esperaban %). Regenera el reemplazo desde su definición real.',
      p_firma, v_n, p_veces;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

select pg_temp.reemplazar_anclado(
  'retail.tienda_bolsa(jsonb, uuid)',
  $v$|| retail.fn_bolsa_web_prenda(l.variante_id)$v$,
  $v$|| retail.fn_bolsa_web_prenda(l.variante_id)
                           -- ADR-0465: de qué empresa es la prenda, solo en una tienda con dos o más empresas (la misma regla del catálogo).
                           || jsonb_build_object('empresa', case when (select count(*) from retail.fn_empresas_de_sede(v_sede)) > 1
                                                                 then (select jsonb_build_object('clave', em.clave, 'nombre', em.nombre)
                                                                         from retail.variantes vv
                                                                         join retail.productos pp on pp.id = vv.producto_id
                                                                         join retail.empresas em on em.id = pp.empresa_id
                                                                        where vv.id = l.variante_id) end)$v$,
  1
);

select 'ADR-0465 · tienda: la bolsa trae la empresa de cada prenda' as parte,
       case when pg_get_functiondef('retail.tienda_bolsa(jsonb, uuid)'::regprocedure) like '%jsonb_build_object(''empresa'', case when (select count(*) from retail.fn_empresas_de_sede(v_sede)) > 1%'
            then 'QUEDÓ BIEN' else 'REVISAR' end as resultado;
