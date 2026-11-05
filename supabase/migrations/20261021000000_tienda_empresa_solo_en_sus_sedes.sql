-- ============================================================================
-- 20261021000000_tienda_empresa_solo_en_sus_sedes.sql — CAYLA V2 · Tienda online (ADR-0463, ADR-0465)
-- Una prenda de CLAURE solo se ve en la tienda online cuando la tienda que se mira es una donde CLAURE opera (hoy, Lima).
--
-- EL PROBLEMA PRIMERO. ADR-0463 puso `productos.empresa_id` y `empresa_sedes` (qué empresa opera en qué sede), pero la tienda online no
-- los lee: una prenda de CLAURE publicada en la Vitrina salía igual en el catálogo de Trujillo, y su ficha abría con el enlace directo.
-- CLAURE no tiene stock ni caja en Trujillo; mostrársela a quien eligió esa tienda es prometerle algo que no existe. Felipe (2026-10-20):
-- «los productos de CLAURE solo se muestran cuando la sede que se está mostrando es Lima». La tienda ya no tiene «Todas» (Felipe
-- 2026-10-19: «siempre se debe elegir una tienda»), pero la base sigue aceptando `p_sede` nulo; sin tienda válida, CLAURE no se ve.
--
-- ANALOGÍA CAYLA. La empresa es la etiqueta del perchero; `empresa_sedes` dice en qué locales cuelga cada perchero. La tienda online
-- es una vidriera por local: cada vidriera pone solo lo de los percheros que ese local tiene.
--
-- QUÉ HACE
--   1. `fn_tienda_empresa_se_ve(producto, sede)`: ¿la empresa de esta prenda opera en esa tienda? La respuesta sale de
--      `fn_empresas_de_sede` (la MISMA regla que decide qué empresas se ofrecen al crear un producto en una sede): una sola fuente.
--      Una sede sin filas en `empresa_sedes` es solo-CAYLA, y CAYLA se ve siempre (también con `p_sede` nulo).
--   2. `tienda_catalogo(sede)`: las prendas de la lista cuentan solo las que se ven en esa tienda. De ahí salen también «Lo nuevo»,
--      «Más vendidos», las ofertas y los looks (todos parten del catálogo).
--   3. `tienda_ficha(prenda, sede)`: la ficha de una prenda que no se ve en esa tienda responde `null`, igual que una prenda sin publicar
--      (la web muestra su «Esta página no existe»).
--   4. `tienda_probador(sede)`: el probador solo ofrece prendas que se ven en esa tienda.
--   «Separar» y la bolsa son la actividad siguiente (ADR-0465): este archivo no las toca.
--
-- DECIDÍ: ocultar con la misma respuesta que una prenda sin publicar (`null`), sin un «solo en Lima». Quien abre un enlace de CLAURE
--   con otra tienda elegida ve «no existe»; decir «solo en Lima» obliga a filtrar la ficha por tienda y a escribir un caso más en la web.
-- DECIDÍ: reutilizar `fn_empresas_de_sede` y no leer `empresa_sedes` aparte: si mañana CLAURE abre otra sede, se suma UNA fila y el alta
--   y la tienda lo saben a la vez.
-- DESCARTÉ: filtrar en la web (`apps/tienda`). La tienda habla con la base solo por `retail.tienda_*`; un filtro de pantalla deja el
--   enlace directo y «Separar» abiertos.
-- DESCARTÉ: reescribir `fn_vitrina_publicable` con una sede: es de la Vitrina del ERP (que tiene que ver TODO lo publicado, de cualquier
--   empresa) y la leen `vitrina_mostrar` y las pantallas de Catálogo ▸ Vitrina web.
--
-- SE ROMPE SI: una función nueva de la tienda arma su lista de prendas con `fn_vitrina_publicable` sin preguntar por la empresa (lo
--   vigila `pnpm pruebas:tienda-empresas`, que recorre las funciones de lectura con una tienda donde CLAURE no opera).
--
-- PRODUCCIÓN. Una sola parte, idempotente (se puede pegar dos veces): una función nueva y tres reemplazos anclados; no toma tablas en
-- exclusiva ni toca políticas (sin riesgo de 40P01). Cada reemplazo cuenta que su ancla aparezca UNA vez: si alguien cambió la función,
-- se detiene sin tocar nada. Sin `select … into` dentro de un texto entre comillas. El orden con la publicación de la web no importa
-- (la web no cambia en esta parte). Requiere la migración 20261020225000 (empresas).
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. ¿La empresa de esta prenda opera en esa tienda? ----------
create or replace function retail.fn_tienda_empresa_se_ve(p_producto_id uuid, p_sede uuid)
returns boolean
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select exists (
    select 1
      from retail.productos p
      join retail.fn_empresas_de_sede(p_sede) e on e.id = p.empresa_id
     where p.id = p_producto_id);
$$;

revoke all on function retail.fn_tienda_empresa_se_ve(uuid, uuid) from public, anon, authenticated;

comment on function retail.fn_tienda_empresa_se_ve(uuid, uuid) is
  'ADR-0465: ¿la empresa de la prenda opera en esa tienda (empresa_sedes vía fn_empresas_de_sede)? CAYLA se ve siempre; CLAURE solo donde opera. Solo la llaman las funciones tienda_*.';

-- ---------- 2. El reemplazo anclado (el mismo de las migraciones de la tienda) ----------
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

-- ---------- 3. El catálogo: solo las prendas que se ven en la tienda elegida ----------
select pg_temp.reemplazar_anclado(
  'retail.tienda_catalogo(uuid)',
  $v$where vp.publicado and retail.fn_vitrina_publicable(vp.producto_id));$v$,
  $v$where vp.publicado and retail.fn_vitrina_publicable(vp.producto_id)
                  and retail.fn_tienda_empresa_se_ve(vp.producto_id, v_sede));$v$
);

-- ---------- 4. La ficha: una prenda que no se ve en esa tienda «no existe» ----------
select pg_temp.reemplazar_anclado(
  'retail.tienda_ficha(uuid, uuid)',
  $v$v_ids := array[p_producto];$v$,
  $v$-- ADR-0465: una prenda de una empresa que no opera en esa tienda no se muestra (como una sin publicar).
  if not retail.fn_tienda_empresa_se_ve(p_producto, v_sede) then
    return null;
  end if;
  v_ids := array[p_producto];$v$
);

-- ---------- 5. El probador: solo prendas que se ven en esa tienda ----------
select pg_temp.reemplazar_anclado(
  'retail.tienda_probador(uuid)',
  $v$and retail.fn_vitrina_publicable(vp.producto_id));$v$,
  $v$and retail.fn_vitrina_publicable(vp.producto_id)
       and retail.fn_tienda_empresa_se_ve(vp.producto_id, v_sede));$v$
);

select 'ADR-0465 · tienda: CLAURE solo en sus sedes (catálogo, ficha, probador)' as parte,
       case when pg_get_functiondef('retail.tienda_catalogo(uuid)'::regprocedure) like '%fn_tienda_empresa_se_ve%'
             and pg_get_functiondef('retail.tienda_ficha(uuid, uuid)'::regprocedure) like '%fn_tienda_empresa_se_ve%'
             and pg_get_functiondef('retail.tienda_probador(uuid)'::regprocedure) like '%fn_tienda_empresa_se_ve%'
            then 'QUEDÓ BIEN' else 'REVISAR' end as resultado;
