-- ============================================================================
-- pegar-en-produccion-deshacer-mis-compras-por-definir-2026-11-13.sql — «Por definir» en Mis compras (ADR-0660): el camino de VUELTA, escrito y ensayado ANTES de
-- necesitarlo. SCRIPT DE UNA SOLA VEZ (no es una migración: no tiene versión, no entra al CI y no se pega «por si acaso»). Solo se pega si Felipe decide volver atrás.
--
-- QUÉ HACE. Todo o nada, en UNA transacción, sin `drop trigger` (ADR-0195) ni `select … into` dentro de textos (ADR-0288):
--   0. Se DETIENE si alguna línea de compra sigue «por definir» (sin categoría o con el precio a la espera): primero se definen, o la base de antes quedaría con
--      líneas que no sabe leer. Dice cuántas son.
--   1. Devuelve las 18 funciones que tocó 20261113211000 a su texto de antes (sus 23 reemplazos al revés; cada uno se salta si ya está deshecho y frena si el texto no
--      es el que dejó la migración).
--   2. Los dos disparadores quedan sin efecto (su función solo devuelve la fila: quitarlos pide `drop trigger`, que toma en exclusiva auth y storage) y se borran las tres
--      funciones nuevas (`definir_prenda_de_compra`, `fn_compras_por_definir`, `fn_compra_lineas_por_definir`) y la acción `compra_definir`.
--   3. Quita los dos `check` nuevos y devuelve `not null` a `orden_compra_items.categoria_id` y `despacho_items.categoria_id`. La columna `precio_por_definir` se QUEDA
--      (toda en `false` tras el paso 0): borrarla sería borrar un dato, y no estorba a la web de antes.
--   ⚠ Pegar esto y promover en Vercel la web anterior a ADR-0660 son UN SOLO PASO: la web nueva llama a funciones que aquí se borran.
--
-- ENSAYO PRIMERO. Por defecto NO aplica: hace todo y termina con «ENSAYO_OK …», que lo deshace todo. Si el resultado es el esperado, cambia `false` por `true` en la línea
--   marcada APLICAR y vuelve a pegar. Ensayado en local el 2026-11-13 sobre una base con todas las migraciones: después de aplicarlo, las 18 funciones tienen el mismo md5
--   que en una base sin 20261113211000.
-- VERIFICACIÓN (solo lectura, después): select to_regprocedure('retail.definir_prenda_de_compra(uuid[],uuid,numeric,uuid)') is null,
--   position('ADR-0660' in pg_get_functiondef('retail.fn_orden_compra_validar(uuid,uuid,date,text,jsonb,jsonb)'::regprocedure)) = 0;   → t | t
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- 0. Nada por definir: si queda algo, se define primero.
do $guarda$
declare
  v_n integer := (select count(*) from retail.orden_compra_items i where i.categoria_id is null or i.precio_por_definir);
begin
  if v_n > 0 then
    raise exception 'Quedan % líneas de compra por definir (sin categoría o con el precio a la espera): defínelas antes de deshacer ADR-0660.', v_n;
  end if;
end $guarda$;

-- Cambia el texto que dejó la migración (p_nuevo) por el de antes (p_viejo). Si p_nuevo ya no está, no hace nada; si está otro número de veces, frena.
create or replace function pg_temp.deshacer_por_definir(p_firma text, p_nuevo text, p_viejo text, p_veces integer default 1)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  v_n := (length(v_def) - length(replace(v_def, p_nuevo, ''))) / length(p_nuevo);
  if v_n = 0 then
    return;
  end if;
  if v_n <> p_veces then
    raise exception '% cambió desde 20261113211000: el texto nuevo aparece % veces (se esperaban %). Revisa antes de deshacer.', p_firma, v_n, p_veces;
  end if;
  execute replace(v_def, p_nuevo, p_viejo);
end;
$f$;

-- 1. Las funciones vuelven a su texto de antes.
select pg_temp.deshacer_por_definir('retail.fn_orden_compra_validar(uuid,uuid,date,text,jsonb,jsonb)',
  $n$    -- ADR-0660: en una compra de Mis compras, una prenda nueva puede ir «por definir» (sin categoría) si su función lo pide.
    if (v_categoria is null and coalesce(current_setting('retail.compra_por_definir', true), '') <> 'si') or v_categoria is not null and not exists ($n$,
  $v$    if v_categoria is null or not exists ($v$);

select pg_temp.deshacer_por_definir('retail.registrar_compra_rapida(uuid,uuid,text,numeric,text,jsonb,numeric,text,text,text)',
  $n$  -- ADR-0660: lo «por definir» de cada prenda (la categoría de una nueva, el precio de venta), dicho de forma explícita.
  if retail.fn_compra_lineas_por_definir(p_lineas) then
    perform set_config('retail.compra_por_definir', 'si', true);
  end if;

  -- La serie y el número del papel: los mismos que pide `completar_papel_compra`.$n$,
  $v$  -- La serie y el número del papel: los mismos que pide `completar_papel_compra`.$v$);

select pg_temp.deshacer_por_definir('retail.fn_registrar_compra_rapida_base(uuid,uuid,text,numeric,text,jsonb)',
  $n$                                           precio_venta_sugerido, producto_id, precio_por_definir)
    select v_orden, row_number() over (order by (v ->> 'posicion')::integer), nullif(v -> 'linea' ->> 'categoria_id', '')::uuid,
           (v -> 'linea' ->> 'marca_id')::uuid, nullif(btrim(coalesce(v -> 'linea' ->> 'descripcion', '')), ''),
           (v -> 'linea' ->> 'cantidad')::numeric::integer, (v -> 'linea' ->> 'costo')::numeric, 0,
           nullif(btrim(coalesce(v -> 'linea' ->> 'precio_venta', '')), '')::numeric, nullif(v -> 'linea' ->> 'producto_id', '')::uuid,
           coalesce((v -> 'linea' ->> 'precio_por_definir')::boolean, false) /* ADR-0660 */$n$,
  $v$                                           precio_venta_sugerido, producto_id)
    select v_orden, row_number() over (order by (v ->> 'posicion')::integer), (v -> 'linea' ->> 'categoria_id')::uuid,
           (v -> 'linea' ->> 'marca_id')::uuid, nullif(btrim(coalesce(v -> 'linea' ->> 'descripcion', '')), ''),
           (v -> 'linea' ->> 'cantidad')::numeric::integer, (v -> 'linea' ->> 'costo')::numeric, 0,
           nullif(btrim(coalesce(v -> 'linea' ->> 'precio_venta', '')), '')::numeric, nullif(v -> 'linea' ->> 'producto_id', '')::uuid$v$);

select pg_temp.deshacer_por_definir('retail.corregir_compra_rapida(uuid,uuid,jsonb,jsonb)',
  $n$    -- ADR-0660: una prenda de la compra puede seguir «por definir».
    perform set_config('retail.compra_por_definir', 'si', true);
    perform retail.fn_orden_compra_validar(v_papel.proveedor_id, v_destino, null, null, v_lineas,$n$,
  $v$    perform retail.fn_orden_compra_validar(v_papel.proveedor_id, v_destino, null, null, v_lineas,$v$);

select pg_temp.deshacer_por_definir('retail.corregir_compra_rapida(uuid,uuid,jsonb,jsonb)',
  $n$           descripcion = v_descripcion, categoria_id = v_categoria, marca_id = v_marca,
           precio_por_definir = (v_item.precio_por_definir and v_venta is null) /* ADR-0660 */$n$,
  $v$           descripcion = v_descripcion, categoria_id = v_categoria, marca_id = v_marca$v$);

select pg_temp.deshacer_por_definir('retail.corregir_compra_rapida(uuid,uuid,jsonb,jsonb)',
  $n$      v_nombre_cat := coalesce((select c.nombre from retail.categorias c where c.id = v_item.categoria_id), 'Por definir' /* ADR-0660 */);$n$,
  $v$      v_nombre_cat := (select c.nombre from retail.categorias c where c.id = v_item.categoria_id);$v$);

select pg_temp.deshacer_por_definir('retail.guardar_conteo_envio(uuid,uuid,integer,jsonb,integer,integer,uuid,uuid,uuid)',
  $n$      from retail.despacho_items di
      left join retail.categorias c on c.id = di.categoria_id
      left join retail.marcas m on m.id = di.marca_id
     where di.id = p_despacho_item_id and di.despacho_id = p_despacho_id;
    if not found then
      raise exception 'Esa línea no es de este envío: recarga la pantalla' using hint = 'conteo_linea_ajena';
    end if;
    if v_cat is null then
      -- ADR-0660: la prenda llegó «por definir»: primero se dice qué es (corregir_linea_al_contar) y después se cuenta.
      raise exception 'Primero di qué es «%»: elige su categoría y después cuéntala', coalesce(nullif(v_donde, ''), 'esta prenda')
        using hint = 'recepcion_por_definir';
    end if;$n$,
  $v$      from retail.despacho_items di
      join retail.categorias c on c.id = di.categoria_id
      left join retail.marcas m on m.id = di.marca_id
     where di.id = p_despacho_item_id and di.despacho_id = p_despacho_id;
    if not found then
      raise exception 'Esa línea no es de este envío: recarga la pantalla' using hint = 'conteo_linea_ajena';
    end if;$v$);

select pg_temp.deshacer_por_definir('retail.cerrar_conteo_envio(uuid,integer,jsonb,text,uuid)',
  $n$  -- ADR-0660: una prenda que llegó «por definir» no se cierra sin decir qué es (lo recibido y lo que faltó llevan su categoría).
  for v_k in
    select coalesce(nullif(btrim(di.descripcion), ''), 'una prenda sin nombre') as etiqueta, i.posicion, o.numero as orden_numero
      from retail.despacho_items di
      join retail.orden_compra_items i on i.id = di.orden_compra_item_id
      join retail.ordenes_compra o on o.id = i.orden_compra_id
     where di.despacho_id = p_despacho_id and di.categoria_id is null
     order by o.numero, i.posicion
     limit 1
  loop
    raise exception 'Falta decir qué es «%» (línea % de la %): elige su categoría y cuéntala', v_k.etiqueta, v_k.posicion,
      retail.fn_orden_compra_numero_texto(v_k.orden_numero) using hint = 'recepcion_por_definir';
  end loop;

  -- Toda línea del envío se contó, aunque sea en 0 («no llegó nada» también es un número).$n$,
  $v$  -- Toda línea del envío se contó, aunque sea en 0 («no llegó nada» también es un número).$v$);

select pg_temp.deshacer_por_definir('retail.recibir_despacho(uuid,integer,jsonb,jsonb,text,uuid)',
  $n$  -- ADR-0660: una prenda «por definir» se recibe contándola, después de decir qué es.
  if exists (select 1 from retail.despacho_items di where di.despacho_id = p_despacho_id and di.categoria_id is null) then
    raise exception 'Este envío trae prendas por definir: recíbelo contando, y di qué es cada una' using hint = 'recepcion_por_definir';
  end if;

  -- Las órdenes del envío (nadie las anula, edita ni les registra papel mientras se recibe) y sus líneas pedidas.$n$,
  $v$  -- Las órdenes del envío (nadie las anula, edita ni les registra papel mientras se recibe) y sus líneas pedidas.$v$);

select pg_temp.deshacer_por_definir('retail.corregir_linea_al_contar(uuid,uuid[],uuid,uuid)',
  $n$    update retail.despacho_items i set categoria_id = p_categoria_id, marca_id = p_marca_id where i.id = v_item.id;
    -- ADR-0660: la prenda venía «por definir» desde la compra: lo que dice la tienda es su categoría también en la compra.
    update retail.orden_compra_items oc set categoria_id = p_categoria_id
     where oc.id = v_item.orden_compra_item_id and oc.categoria_id is null;$n$,
  $v$    update retail.despacho_items i set categoria_id = p_categoria_id, marca_id = p_marca_id where i.id = v_item.id;$v$);

select pg_temp.deshacer_por_definir('retail.corregir_linea_al_contar(uuid,uuid[],uuid,uuid)',
  $n$    v_cat_antes := coalesce((select c.nombre from retail.categorias c where c.id = v_item.categoria_id), 'Por definir' /* ADR-0660 */);$n$,
  $v$    v_cat_antes := (select c.nombre from retail.categorias c where c.id = v_item.categoria_id);$v$);

select pg_temp.deshacer_por_definir('retail.completar_papel_compra(uuid,uuid,text,text,numeric)',
  $n$           'oci', i.id, 'cat', coalesce(i.categoria_id, (select di.categoria_id from retail.despacho_items di join retail.despachos d on d.id = di.despacho_id
                                                        where di.orden_compra_item_id = i.id and d.estado = 'cerrado' and di.categoria_id is not null
                                                        order by d.numero desc limit 1)) /* ADR-0660 */,$n$,
  $v$           'oci', i.id, 'cat', i.categoria_id,$v$);

select pg_temp.deshacer_por_definir('retail.fn_envio_detalle(uuid)',
  $n$                      'categoria_id', di.categoria_id,
                      -- ADR-0660: una prenda «por definir» llega sin categoría: la tienda la dice al contar.
                      'categoria', case when c.id is not null then jsonb_build_object('id', c.id, 'nombre', c.nombre, 'prefijo', c.prefijo, 'familia', c.familia) end,$n$,
  $v$                      'categoria_id', di.categoria_id,
                      'categoria', jsonb_build_object('id', c.id, 'nombre', c.nombre, 'prefijo', c.prefijo, 'familia', c.familia),$v$);

select pg_temp.deshacer_por_definir('retail.fn_envio_detalle(uuid)',
  $n$               left join retail.categorias c on c.id = di.categoria_id /* ADR-0660 */
               left join retail.marcas m on m.id = di.marca_id
              where di.despacho_id = d.id$n$,
  $v$               join retail.categorias c on c.id = di.categoria_id
               left join retail.marcas m on m.id = di.marca_id
              where di.despacho_id = d.id$v$);

select pg_temp.deshacer_por_definir('retail.fn_mis_envios()',
  $n$                     left join retail.categorias c on c.id = di.categoria_id /* ADR-0660 */$n$,
  $v$                     join retail.categorias c on c.id = di.categoria_id$v$);

select pg_temp.deshacer_por_definir('retail.fn_envio_resultado(uuid)',
  $n$               left join retail.categorias cat on cat.id = i.categoria_id /* ADR-0660 */$n$,
  $v$               join retail.categorias cat on cat.id = i.categoria_id$v$);

select pg_temp.deshacer_por_definir('retail.fn_mi_plata_compras()',
  $n$            left join retail.categorias cat on cat.id = i.categoria_id /* ADR-0660 */$n$,
  $v$            join retail.categorias cat on cat.id = i.categoria_id$v$);

select pg_temp.deshacer_por_definir('retail.fn_compra_para_corregir(uuid)',
  $n$        left join retail.categorias c on c.id = i.categoria_id /* ADR-0660 */$n$,
  $v$        join retail.categorias c on c.id = i.categoria_id$v$);

select pg_temp.deshacer_por_definir('retail.fn_compra_para_corregir(uuid)',
  $n$               'cantidad', i.cantidad, 'costo', i.precio_unitario, 'precio_venta', i.precio_venta_sugerido,
               'precio_por_definir', i.precio_por_definir /* ADR-0660 */,$n$,
  $v$               'cantidad', i.cantidad, 'costo', i.precio_unitario, 'precio_venta', i.precio_venta_sugerido,$v$);

select pg_temp.deshacer_por_definir('retail.fn_orden_compra_detalle(uuid)',
  $n$               left join retail.categorias c on c.id = i.categoria_id /* ADR-0660 */$n$,
  $v$               join retail.categorias c on c.id = i.categoria_id$v$);

select pg_temp.deshacer_por_definir('retail.fn_comprobante_orden_resultado(uuid,boolean)',
  $n$                   left join retail.categorias cat on cat.id = oi.categoria_id /* ADR-0660 */$n$,
  $v$                   join retail.categorias cat on cat.id = oi.categoria_id$v$);

select pg_temp.deshacer_por_definir('retail.fn_proveedores_para_comprar()',
  $n$       where o.estado <> 'anulada' and i.categoria_id is not null /* ADR-0660 */
    ),$n$,
  $v$       where o.estado <> 'anulada'
    ),$v$);

select pg_temp.deshacer_por_definir('retail.fn_plan_compra_pedido(uuid)',
  $n$from lineas l where l.categoria_id is not null /* ADR-0660 */ group by l.categoria_id) g)$n$,
  $v$from lineas l group by l.categoria_id) g)$v$);

-- 2. Los disparadores quedan sin efecto, y lo nuevo se va.
create or replace function retail.fn_orden_compra_items_por_definir()
returns trigger language plpgsql set search_path = retail, public, extensions as $$ begin return new; end $$;
create or replace function retail.fn_despacho_items_por_definir()
returns trigger language plpgsql set search_path = retail, public, extensions as $$ begin return new; end $$;
drop function if exists retail.definir_prenda_de_compra(uuid[], uuid, numeric, uuid);
drop function if exists retail.fn_compras_por_definir();
drop function if exists retail.fn_compra_lineas_por_definir(jsonb);
delete from retail.acciones_sin_responsable where clave = 'compra_definir';

-- 3. Los candados de la tabla, como antes.
alter table retail.orden_compra_items drop constraint if exists orden_compra_items_precio_por_definir;
alter table retail.orden_compra_items drop constraint if exists orden_compra_items_por_definir_sin_catalogo;
alter table retail.orden_compra_items alter column categoria_id set not null;
alter table retail.despacho_items alter column categoria_id set not null;

do $fin$
declare
  APLICAR constant boolean := false;  -- APLICAR: cambia a true para que quede.
  v text;
begin
  foreach v in array array[
    'retail.fn_orden_compra_validar(uuid,uuid,date,text,jsonb,jsonb)', 'retail.registrar_compra_rapida(uuid,uuid,text,numeric,text,jsonb,numeric,text,text,text)',
    'retail.fn_registrar_compra_rapida_base(uuid,uuid,text,numeric,text,jsonb)', 'retail.corregir_compra_rapida(uuid,uuid,jsonb,jsonb)',
    'retail.guardar_conteo_envio(uuid,uuid,integer,jsonb,integer,integer,uuid,uuid,uuid)', 'retail.cerrar_conteo_envio(uuid,integer,jsonb,text,uuid)',
    'retail.recibir_despacho(uuid,integer,jsonb,jsonb,text,uuid)', 'retail.corregir_linea_al_contar(uuid,uuid[],uuid,uuid)',
    'retail.completar_papel_compra(uuid,uuid,text,text,numeric)', 'retail.fn_envio_detalle(uuid)', 'retail.fn_mis_envios()', 'retail.fn_envio_resultado(uuid)',
    'retail.fn_mi_plata_compras()', 'retail.fn_compra_para_corregir(uuid)', 'retail.fn_orden_compra_detalle(uuid)', 'retail.fn_comprobante_orden_resultado(uuid,boolean)',
    'retail.fn_proveedores_para_comprar()', 'retail.fn_plan_compra_pedido(uuid)'] loop
    if position('ADR-0660' in pg_get_functiondef(v::regprocedure)) > 0 then
      raise exception 'Deshacer ADR-0660 no quedó completo en %: revisa antes de seguir.', v;
    end if;
  end loop;
  if not APLICAR then
    raise exception 'ENSAYO_OK: las 18 funciones vuelven a su texto de antes, sin funciones nuevas ni candados. Nada quedó aplicado: cambia APLICAR a true y vuelve a pegar.';
  end if;
end $fin$;

reset lock_timeout;
