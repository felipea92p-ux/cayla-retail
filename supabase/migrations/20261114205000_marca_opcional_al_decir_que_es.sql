-- ============================================================================
-- 20261114205000_marca_opcional_al_decir_que_es.sql — CAYLA V2 · ADR-0660 / ADR-0393 (Felipe, 2026-11-14)
-- Recibir: la marca es opcional también al decir qué es una prenda y al corregir una línea de la compra
--
-- EL PROBLEMA PRIMERO. El 2026-11-11 la marca pasó a ser opcional en «Algo nuevo» de Mis compras: «que la marca sea opcional, igual en
-- recepción que la puedan colocar» (20261111192000). La promesa era «quien recibe le pone la marca o la deja sin marca». Pero las dos
-- funciones que corrigen una línea de la compra en Recibir seguían exigiéndola:
--   · `corregir_linea_al_contar` (envío abierto; es la hoja «¿Qué es …?» de una prenda que llegó «por definir», ADR-0660):
--     «Elige la marca de la prenda». La tienda no podía contar «Urys bordado» sin inventarle una marca (Felipe, 2026-11-14: «la marca no
--     debe ser obligatoria, estoy intentando registrar una prenda por envío de mercadería»).
--   · `cambiar_linea_de_pendiente`, en una línea del aviso (envío cerrado, «¿Ya existe?» de «Para después»): «Una línea del aviso siempre
--     lleva marca». Esa frase era cierta cuando `despacho_items.marca_id` no aceptaba vacío; desde 20261111192000 sí lo acepta.
--
-- QUÉ CAMBIA (en las dos):
--   1. `p_marca_id` nulo = «Sin marca», como ya lo es fuera de la guía (ADR-0393, 2026-10-14). Si viene una marca, sigue teniendo que estar activa.
--   2. Sin marca no se anota pareja en `marca_proveedores` (no hay marca que vincular; antes el `insert` habría chocado con su `not null`).
--   3. En la Actividad, «Sin marca» en vez de un texto vacío (`corregir_linea_al_contar`).
--   4. `cambiar_linea_de_pendiente`, línea del aviso: «sin cambio» compara la marca con `is not distinct from` (sin marca = sin marca), como
--      ya lo hacía fuera de la guía; con `=` dos vacíos no eran iguales y anotaba un cambio que no hubo.
--
-- LO QUE NO CAMBIA: los candados de siempre (la línea no tiene prenda del catálogo, nada entró al stock, lo contado es solo ese modelo…), la
-- categoría sigue siendo obligatoria, y la orden, la factura, el stock y los costos no se tocan.
--
-- DESCARTÉ
--   · Dejar la marca obligatoria y que la tienda cree una marca «Genérica»: sería una marca falsa en el catálogo, y la decisión del 2026-11-11
--     ya dice que «sin marca» es un valor legítimo (una prenda sin marca existe en el catálogo desde ADR-0393).
--   · Soltarla solo al contar: la misma línea, ya cerrada, volvería a toparse con «siempre lleva marca» en «Para después».
--
-- CONTRATO
--   PROMETE: con `p_marca_id` nulo, la línea queda sin marca y se cuenta, se cierra y se crea su prenda como cualquier otra sin marca.
--            Con una marca, todo da lo mismo que antes.
--   FALLA:   una marca que sí se manda y está inactiva (`recepcion_marca`); todo lo demás, como antes.
--   ASUME:   las dos funciones tienen el texto vivo de 20261112162000 + 20261113211000 y de 20261107185000 + 20261111192000 (cada
--            reemplazo lo comprueba y frena si no).
--
-- PRODUCCIÓN (con el OK de Felipe). UNA parte, re-ejecutable (cada reemplazo se salta si ya está hecho), sin políticas ni `drop trigger`
-- (ADR-0195). Pegar ANTES de publicar la web: con la web nueva y la base vieja, guardar «Sin marca» da el error de siempre («Elige la marca de
-- la prenda») y no deja nada a medias.
-- VERIFICACIÓN (→ t | t):
--   select position('p_marca_id is not null and not exists' in pg_get_functiondef('retail.corregir_linea_al_contar(uuid,uuid[],uuid,uuid)'::regprocedure)) > 0,
--          position('siempre lleva marca' in pg_get_functiondef('retail.cambiar_linea_de_pendiente(uuid,uuid,uuid,uuid)'::regprocedure)) = 0;
-- CÓMO SE DESHACE: los reemplazos al revés (cambiar `$n$` por `$v$`). No deja datos que haya que borrar: una línea que quedó sin marca es
-- una línea sin marca, como las de 20261111192000.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- Reemplaza `p_viejo` por `p_nuevo` en la función, exigiendo que el ancla aparezca exactamente `p_veces` veces. Si `p_nuevo` ya está, no hace
-- nada (re-ejecutable).
create or replace function pg_temp.reemplazar_marca_opcional(p_firma text, p_viejo text, p_nuevo text, p_veces integer default 1)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
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

-- ---------- 1. Al contar: «¿Qué es …?» y «Corregir …» (envío abierto) ----------
select pg_temp.reemplazar_marca_opcional(
  'retail.corregir_linea_al_contar(uuid,uuid[],uuid,uuid)',
  $v$  -- Una línea de la compra siempre lleva marca al corregirla, como al cerrar (20261107185000).
  if p_marca_id is null then
    raise exception 'Elige la marca de la prenda' using hint = 'recepcion_marca';
  end if;
  if not exists (select 1 from retail.marcas m where m.id = p_marca_id and m.activo) then
    raise exception 'Esa marca ya no está activa: elige otra' using hint = 'recepcion_marca';
  end if;$v$,
  $n$  -- `p_marca_id` nulo = sin marca (20261114205000): quien recibe le pone la marca o la deja sin marca, como en la compra (20261111192000).
  if p_marca_id is not null and not exists (select 1 from retail.marcas m where m.id = p_marca_id and m.activo) then
    raise exception 'Esa marca ya no está activa: elige otra o «Sin marca»' using hint = 'recepcion_marca';
  end if;$n$);

select pg_temp.reemplazar_marca_opcional(
  'retail.corregir_linea_al_contar(uuid,uuid[],uuid,uuid)',
  $v$  v_marca := (select m.nombre from retail.marcas m where m.id = p_marca_id);$v$,
  $n$  v_marca := coalesce((select m.nombre from retail.marcas m where m.id = p_marca_id), 'Sin marca' /* 20261114205000 */);$n$);

select pg_temp.reemplazar_marca_opcional(
  'retail.corregir_linea_al_contar(uuid,uuid[],uuid,uuid)',
  $v$     where oc.id = v_item.orden_compra_item_id and o.proveedor_id is not null
    on conflict do nothing;$v$,
  $n$     where oc.id = v_item.orden_compra_item_id and o.proveedor_id is not null
       and p_marca_id is not null -- 20261114205000: sin marca no hay pareja que anotar
    on conflict do nothing;$n$);

-- ---------- 2. Con el envío cerrado: una línea del aviso en «¿Ya existe?» ----------
select pg_temp.reemplazar_marca_opcional(
  'retail.cambiar_linea_de_pendiente(uuid,uuid,uuid,uuid)',
  $v$    if p_marca_id is null then
      raise exception 'Una línea del aviso siempre lleva marca: elige la marca de la prenda' using hint = 'recepcion_marca';
    end if;
    if not exists (select 1 from retail.marcas m where m.id = p_marca_id and m.activo) then
      raise exception 'Esa marca ya no está activa: elige otra' using hint = 'recepcion_marca';
    end if;
    if p_categoria_id = v_item.categoria_id and p_marca_id = v_item.marca_id then$v$,
  $n$    -- `p_marca_id` nulo = sin marca también en una línea del aviso (20261114205000): la línea acepta vacío desde 20261111192000.
    if p_marca_id is not null and not exists (select 1 from retail.marcas m where m.id = p_marca_id and m.activo) then
      raise exception 'Esa marca ya no está activa: elige otra o «Sin marca»' using hint = 'recepcion_marca';
    end if;
    if p_categoria_id = v_item.categoria_id and p_marca_id is not distinct from v_item.marca_id then$n$);

select pg_temp.reemplazar_marca_opcional(
  'retail.cambiar_linea_de_pendiente(uuid,uuid,uuid,uuid)',
  $v$     where oc.id = v_item.orden_compra_item_id and o.proveedor_id is not null
    on conflict do nothing;$v$,
  $n$     where oc.id = v_item.orden_compra_item_id and o.proveedor_id is not null
       and p_marca_id is not null -- 20261114205000: sin marca no hay pareja que anotar
    on conflict do nothing;$n$);

reset lock_timeout;
reset search_path;
