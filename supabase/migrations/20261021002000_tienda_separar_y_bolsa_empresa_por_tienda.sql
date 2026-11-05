-- ============================================================================
-- 20261021002000_tienda_separar_y_bolsa_empresa_por_tienda.sql — CAYLA V2 · Tienda online (ADR-0463, ADR-0465)
-- «Separar» y la bolsa también respetan que CLAURE solo opera en Lima.
--
-- EL PROBLEMA PRIMERO. 20261021000000 escondió las prendas de CLAURE del catálogo, la ficha y el probador de una tienda donde CLAURE no
-- opera. Pero la bolsa se arma con ids de prendas que la persona ya tenía guardados (la cookie de la bolsa, un favorito, un enlace
-- viejo) y «Separar» recibe la tienda de recojo desde la web: quien llega a Trujillo con una prenda de CLAURE en la bolsa la podría
-- separar para recogerla en una tienda donde no existe. Cerrar solo la vitrina deja la puerta de atrás abierta.
--
-- ANALOGÍA CAYLA. Quitar el perchero de la vidriera no impide que alguien pida la prenda por el nombre en el mostrador: el mostrador
-- también tiene que decir «eso no lo tenemos aquí».
--
-- QUÉ HACE (todo con `fn_tienda_empresa_se_ve`, de 20261021000000)
--   1. `tienda_separar`: en la revisión de «se vende en esa tienda» (la que ya mira las etiquetas que limitan una prenda a ciertas
--      tiendas), suma la de la empresa. La respuesta es la misma de siempre, `tienda_separar_no_se_vende` («Una prenda de tu bolsa no
--      se vende en esa tienda»): la web ya sabe decirla. Rechaza todo o nada, como antes.
--   2. `tienda_bolsa`: el `se_vende` de cada tienda de la web suma la empresa. Una prenda de CLAURE sigue en la bolsa (no se pierde),
--      pero en Trujillo dice «no se vende en esa tienda» y el botón de separar no se ofrece: lo mismo que con una etiqueta que la limita.
--   3. `tienda_separadas_por_otros`: la ficha pregunta cuántas separadas hay de una prenda en una tienda; para una prenda que esa tienda
--      no muestra, responde `null` (como una prenda sin publicar).
--
-- DECIDÍ: reutilizar el rechazo `tienda_separar_no_se_vende` y no inventar un código de error nuevo: la web de producción ya lo traduce
--   y el orden de publicación no importa.
-- DECIDÍ: NO tocar `fn_variante_permitida_en_sede`: la usan también la caja y los traslados del ERP (donde decidir qué empresa va a qué
--   sede es otra conversación: ADR-0463, «Lo que falta»).
-- DESCARTÉ: sacar la prenda de CLAURE de la bolsa al elegir otra tienda: la persona pierde lo que guardó por mirar otra tienda; con
--   «no se vende en esa tienda» vuelve a Lima y sigue ahí.
--
-- SE ROMPE SI: se agrega otra función que cree pedidos de la web por fuera de `tienda_separar` sin revisar la empresa (lo vigila
--   `pnpm pruebas:tienda-empresas`).
--
-- PRODUCCIÓN. Una sola parte, idempotente (se puede pegar dos veces): tres reemplazos anclados; no toma tablas en exclusiva ni toca
-- políticas (sin riesgo de 40P01). Cada uno cuenta que su ancla aparezca UNA vez: si alguien cambió la función, se detiene sin tocar
-- nada. Sin `select … into` dentro de un texto entre comillas. El orden con la publicación de la web no importa. Requiere
-- 20261021000000.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function pg_temp.reemplazar_anclado(p_firma text, p_viejo text, p_nuevo text)
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
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta migración: el ancla aparece % veces (se esperaba 1). Regenera el reemplazo desde su definición real.',
      p_firma, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- ---------- 1. «Separar»: la empresa de la prenda opera en la tienda de recojo ----------
select pg_temp.reemplazar_anclado(
  'retail.tienda_separar(uuid, uuid, jsonb, uuid)',
  $v$if not retail.fn_variante_permitida_en_sede(r.variante_id, p_ubicacion_id) then$v$,
  $v$if not retail.fn_variante_permitida_en_sede(r.variante_id, p_ubicacion_id)
       -- ADR-0465: la empresa de la prenda tiene que operar en la tienda de recojo (CLAURE, solo en Lima).
       or not retail.fn_tienda_empresa_se_ve((select vv.producto_id from retail.variantes vv where vv.id = r.variante_id), p_ubicacion_id) then$v$
);

-- ---------- 2. La bolsa: «se vende en esa tienda» suma la empresa ----------
select pg_temp.reemplazar_anclado(
  'retail.tienda_bolsa(jsonb, uuid)',
  $v$and coalesce(pt.se_ofrece, false)))$v$,
  $v$and coalesce(pt.se_ofrece, false)
                                                       -- ADR-0465: y la empresa de la prenda opera en esa tienda.
                                                       and retail.fn_tienda_empresa_se_ve((select vv.producto_id from retail.variantes vv where vv.id = l.variante_id), s.id)))$v$
);

-- ---------- 3. «Separadas por otros» de la ficha: una prenda que esa tienda no muestra no existe ----------
select pg_temp.reemplazar_anclado(
  'retail.tienda_separadas_por_otros(uuid, uuid, uuid)',
  $v$or not retail.fn_vitrina_publicable(p_producto) then$v$,
  $v$or not retail.fn_vitrina_publicable(p_producto)
     or not retail.fn_tienda_empresa_se_ve(p_producto, p_sede) then$v$
);

select 'ADR-0465 · tienda: «Separar» y la bolsa respetan la empresa por tienda' as parte,
       case when pg_get_functiondef('retail.tienda_separar(uuid, uuid, jsonb, uuid)'::regprocedure) like '%fn_tienda_empresa_se_ve%'
             and pg_get_functiondef('retail.tienda_bolsa(jsonb, uuid)'::regprocedure) like '%fn_tienda_empresa_se_ve%'
             and pg_get_functiondef('retail.tienda_separadas_por_otros(uuid, uuid, uuid)'::regprocedure) like '%fn_tienda_empresa_se_ve%'
            then 'QUEDÓ BIEN' else 'REVISAR' end as resultado;
