-- ============================================================================
-- 20261111192000_marca_opcional_en_algo_nuevo.sql — CAYLA V2 (Felipe, 2026-11-11)
-- «Algo nuevo» de Mis compras: la marca es opcional, y quien recibe se la pone
--
-- EL PROBLEMA PRIMERO. Al anotar una prenda que todavía no le compras al proveedor, la compradora muchas veces no sabe la marca (no la
-- ve, no la recuerda). La base la exigía en cada línea de la compra (`orden_compra_items.marca_id not null`) y del envío
-- (`despacho_items.marca_id not null`), y la regla común de las órdenes (`fn_orden_compra_validar`) la rechazaba vacía. Felipe: «que la
-- marca sea opcional, igual en recepción que la puedan colocar».
--
-- LA DECISIÓN.
--   1. Las dos columnas aceptan vacío. Una prenda sin marca ya existe en el catálogo (ADR-0393) y en lo que llega sin aviso.
--   2. `fn_orden_compra_validar` y `corregir_compra_rapida` aceptan la marca vacía; si viene, sigue siendo una marca activa. La pantalla
--      de Órdenes de compra del escritorio sigue pidiéndola por su cuenta: esto solo deja de imponerla en la base.
--   3. Lo que lee una línea sin marca deja de saltársela: los `join retail.marcas` de Compras y Recibir pasan a `left join` (el nombre
--      ya se arma con `concat_ws`, que ignora el vacío, o con `case when m.id is not null`). Las comparaciones por marca de lo que el
--      proveedor nos debe pasan a `is not distinct from`: «sin marca» es una marca más al reponer un faltante.
--   4. `fn_habituales_proveedor` agrupa las prendas sin marca por su nombre y categoría (antes su clave quedaba vacía y se juntaban).
--   5. Recibir: una línea del envío sin marca se cuenta como «Sin marca», y la prenda «por crear» de esa línea ya deja elegir su marca
--      en «¿Ya existe?» (`cambiar_linea_de_pendiente`, que la anota en la línea del envío y exige una marca activa).
--   6. Al ponerle la marca a una línea del envío, la marca queda vinculada al proveedor de su compra (`marca_proveedores`), también si
--      después se elige una prenda que ya existía (antes solo se vinculaba al crear la prenda nueva).
--      La línea de la compra no se toca: una compra que ya llegó no se cambia (`fn_compra_unida_no_se_cambia`).
--
-- CONTRATO (Liskov)
--   PROMETE: una compra de «Algo nuevo» se guarda sin marca, se manda a la tienda y se recibe; quien recibe le pone la marca o la deja
--            «sin marca». Nada que antes funcionaba con marca cambia de resultado.
--   ASUME:   las 15 funciones tienen hoy el texto con que se escribió esta migración (cada reemplazo lo comprueba y frena si no).
--   FALLA:   nada nuevo: una marca que sí se manda sigue teniendo que estar activa (`orden_compra_marca`).
--   NO HACE: no cambia la pantalla de Órdenes de compra; no pone marca a compras viejas; no crea marcas.
--
-- PRODUCCIÓN. Una sola parte, re-ejecutable (cada reemplazo se salta si ya está hecho). Los `alter` solo quitan un `not null` y no hay
-- políticas: ADR-0195 no aplica. Pegar ANTES de publicar la web: con la web nueva y la base vieja, guardar «Algo nuevo» sin marca
-- da el error de siempre («La línea 1 necesita una marca activa»), sin dejar nada a medias.
--
-- VERIFICACIÓN (→ t | t | t | t):
--   select (select is_nullable = 'YES' from information_schema.columns where table_schema = 'retail' and table_name = 'orden_compra_items' and column_name = 'marca_id'),
--          (select is_nullable = 'YES' from information_schema.columns where table_schema = 'retail' and table_name = 'despacho_items' and column_name = 'marca_id'),
--          position('v_marca is not null and not exists' in pg_get_functiondef('retail.fn_orden_compra_validar(uuid,uuid,date,text,jsonb,jsonb)'::regprocedure)) > 0,
--          position('left join retail.marcas m on m.id = di.marca_id' in pg_get_functiondef('retail.fn_envio_detalle(uuid)'::regprocedure)) > 0;
-- CÓMO SE DESHACE: los reemplazos al revés. Las columnas vuelven a `not null` solo si ninguna línea quedó sin marca.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

alter table retail.orden_compra_items alter column marca_id drop not null;
alter table retail.despacho_items alter column marca_id drop not null;

-- Reemplaza `p_viejo` por `p_nuevo` en la función, exigiendo que el ancla aparezca exactamente `p_veces` veces. Si `p_nuevo` ya está,
-- no hace nada (re-ejecutable).
create or replace function pg_temp.reemplazar_anclado_veces(p_firma text, p_viejo text, p_nuevo text, p_veces integer default 1)
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

-- ---- 2. La regla común de las órdenes y la corrección de una compra: la marca puede ir vacía; si va, activa. ----
select pg_temp.reemplazar_anclado_veces(
  'retail.fn_orden_compra_validar(uuid,uuid,date,text,jsonb,jsonb)',
  $v$    if v_marca is null or not exists ($v$,
  $n$    if v_marca is not null and not exists ($n$);

select pg_temp.reemplazar_anclado_veces(
  'retail.corregir_compra_rapida(uuid,uuid,jsonb,jsonb)',
  $v$      if v_marca is distinct from v_item.marca_id
         and not exists$v$,
  $n$      if v_marca is not null and v_marca is distinct from v_item.marca_id
         and not exists$n$);

-- ---- 3. Lo que lee una línea sin marca no se la salta. ----
select pg_temp.reemplazar_anclado_veces(
  'retail.fn_compra_para_corregir(uuid)',
  $v$        join retail.marcas m on m.id = i.marca_id$v$,
  $n$        left join retail.marcas m on m.id = i.marca_id$n$);

select pg_temp.reemplazar_anclado_veces(
  'retail.fn_orden_compra_detalle(uuid)',
  $v$               join retail.marcas m on m.id = i.marca_id$v$,
  $n$               left join retail.marcas m on m.id = i.marca_id$n$);

select pg_temp.reemplazar_anclado_veces(
  'retail.fn_comprobante_orden_resultado(uuid,boolean)',
  $v$                   join retail.marcas mar on mar.id = oi.marca_id$v$,
  $n$                   left join retail.marcas mar on mar.id = oi.marca_id$n$);

select pg_temp.reemplazar_anclado_veces(
  'retail.fn_comprobante_orden_resultado(uuid,boolean)',
  $v$                   join retail.marcas mar on mar.id = ci.marca_id$v$,
  $n$                   left join retail.marcas mar on mar.id = ci.marca_id$n$);

select pg_temp.reemplazar_anclado_veces(
  'retail.fn_envio_resultado(uuid)',
  $v$               join retail.marcas mar on mar.id = i.marca_id$v$,
  $n$               left join retail.marcas mar on mar.id = i.marca_id$n$);

select pg_temp.reemplazar_anclado_veces(
  'retail.fn_envio_detalle(uuid)',
  $v$               join retail.marcas m on m.id = di.marca_id$v$,
  $n$               left join retail.marcas m on m.id = di.marca_id$n$);

select pg_temp.reemplazar_anclado_veces(
  'retail.guardar_conteo_envio(uuid,uuid,integer,jsonb,integer,integer,uuid,uuid,uuid)',
  $v$      join retail.marcas m on m.id = di.marca_id$v$,
  $n$      left join retail.marcas m on m.id = di.marca_id$n$);

select pg_temp.reemplazar_anclado_veces(
  'retail.cerrar_conteo_envio(uuid,integer,jsonb,text,uuid)',
  $v$      join retail.categorias c on c.id = di.categoria_id
      join retail.marcas m on m.id = di.marca_id$v$,
  $n$      join retail.categorias c on c.id = di.categoria_id
      left join retail.marcas m on m.id = di.marca_id$n$);

-- Dos veces en la misma función (la línea que se recibe y la que faltó contar).
select pg_temp.reemplazar_anclado_veces(
  'retail.recibir_despacho(uuid,integer,jsonb,jsonb,text,uuid)',
  $v$      join retail.categorias c on c.id = di.categoria_id
      join retail.marcas m on m.id = di.marca_id$v$,
  $n$      join retail.categorias c on c.id = di.categoria_id
      left join retail.marcas m on m.id = di.marca_id$n$,
  2);

select pg_temp.reemplazar_anclado_veces(
  'retail.fn_nos_debe_del_envio(uuid)',
  $v$    join retail.marcas m on m.id = q.marca_id;$v$,
  $n$    left join retail.marcas m on m.id = q.marca_id;$n$);

-- Lo que el proveedor nos debe, por categoría y marca: «sin marca» también cuenta como una.
select pg_temp.reemplazar_anclado_veces(
  'retail.fn_nos_debe_pendiente(uuid,uuid,uuid,uuid)',
  $v$and x.marca_id = p_marca_id$v$,
  $n$and x.marca_id is not distinct from p_marca_id$n$);

select pg_temp.reemplazar_anclado_veces(
  'retail.fn_recepcion_cerrar(uuid,uuid,jsonb,jsonb,text,uuid,text)',
  $v$        and (x.proveedor_id, x.categoria_id, x.marca_id) in (
              select (u ->> 'proveedor_id')::uuid, (u ->> 'categoria_id')::uuid, (u ->> 'marca_id')::uuid$v$,
  $n$        and (x.proveedor_id, x.categoria_id, coalesce(x.marca_id, '00000000-0000-0000-0000-000000000000'::uuid)) in (
              select (u ->> 'proveedor_id')::uuid, (u ->> 'categoria_id')::uuid,
                     coalesce(nullif(u ->> 'marca_id', '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid)$n$);

select pg_temp.reemplazar_anclado_veces(
  'retail.fn_recepcion_cerrar(uuid,uuid,jsonb,jsonb,text,uuid,text)',
  $v$        join retail.marcas m on m.id = g.marca_id$v$,
  $n$        left join retail.marcas m on m.id = g.marca_id$n$);

select pg_temp.reemplazar_anclado_veces(
  'retail.fn_recepcion_cerrar(uuid,uuid,jsonb,jsonb,text,uuid,text)',
  $v$and x.marca_id = v_sob.marca_id$v$,
  $n$and x.marca_id is not distinct from v_sob.marca_id$n$);

select pg_temp.reemplazar_anclado_veces(
  'retail.fn_proveedor_deuda_resoluciones_candado()',
  $v$or v_sobrante.marca_id <> v_deuda.marca_id then$v$,
  $n$or v_sobrante.marca_id is distinct from v_deuda.marca_id then$n$);

-- ---- 4. Las prendas de siempre de un proveedor: las sin marca no se juntan en una. ----
select pg_temp.reemplazar_anclado_veces(
  'retail.fn_habituales_proveedor(uuid)',
  $v$|| '|' || i.marca_id::text) as clave$v$,
  $n$|| '|' || coalesce(i.marca_id::text, '')) as clave$n$);

-- ---- 6. Recibir: poner la marca a una línea del envío la vincula con el proveedor de su compra (Felipe 2026-11-11: «se vincula
-- automáticamente con el proveedor»). Antes solo pasaba al crear la prenda nueva (`preparar_prenda_al_recibir`); si se elegía una prenda
-- que ya existía, la pareja marca–proveedor no quedaba anotada. Si ya estaba, no hace nada. ----
select pg_temp.reemplazar_anclado_veces(
  'retail.cambiar_linea_de_pendiente(uuid,uuid,uuid,uuid)',
  $v$    update retail.despacho_items i set categoria_id = p_categoria_id, marca_id = p_marca_id where i.id = v_item.id;$v$,
  $n$    update retail.despacho_items i set categoria_id = p_categoria_id, marca_id = p_marca_id where i.id = v_item.id;
    -- La compra prueba que ese proveedor trae esa marca: la pareja se registra si faltaba.
    insert into retail.marca_proveedores (marca_id, proveedor_id)
    select p_marca_id, o.proveedor_id
      from retail.orden_compra_items oc join retail.ordenes_compra o on o.id = oc.orden_compra_id
     where oc.id = v_item.orden_compra_item_id and o.proveedor_id is not null
    on conflict do nothing;$n$);
