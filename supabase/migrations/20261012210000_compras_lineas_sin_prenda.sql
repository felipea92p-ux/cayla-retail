-- ADR-0362 · fase 2, actividad 3 (Felipe 2026-10-12): las líneas «categoría + marca» de un comprobante de orden se ven bien en todo
-- el ERP, sin estados imposibles.
--
-- EL PROBLEMA PRIMERO. Con `20261012205000` una línea de comprobante (`compra_items`) puede NO tener prenda: `producto_id` y
-- `variante_id` vacíos, con `categoria_id`, `marca_id` y `descripcion`. Es la línea de un comprobante que sale de una orden de compra:
-- la prenda todavía no existe, se crea cuando llega la mercadería, y llega por guía (fase 4), no por Recibir mercadería. Pero todo lo
-- que ya existía supone una prenda en cada línea, y sin este arreglo quedan tres estados que una colaboradora no debería ver:
--   · Recibir ofrecería esa línea para contarla (y un comprobante hecho solo de líneas sin prenda saldría «por recibir» sin nada que
--     recibir). `recibir_compras` la dejaría pasar hasta el último paso y fallaría con «la variante no pertenece al producto de la
--     línea»; `cerrar_linea_compra` la cerraría como faltante de una prenda que ni existe.
--   · La evolución del costo de un proveedor elige «la prenda que más se le compra» agrupando por `producto_id`: las líneas sin prenda
--     forman un grupo de prenda vacía que puede ganar, y el gráfico sale vacío aunque el proveedor tenga prendas.
--   · El detalle de un comprobante y «mi parte» nombran la línea por su prenda: sin ella quedaban en blanco.
--
-- QUÉ HACE.
--   1. `recibir_compras`, `recibir_envio` y `cerrar_linea_compra` rechazan una línea sin prenda, ANTES de escribir nada, con
--      «Esa línea todavía no tiene prenda: llega por guía, no por Recibir mercadería». `recibir_y_cerrar_compras` las llama, así que
--      queda cubierta. `recibir_lote` («Llegó mercadería») no toca líneas de comprobante —recibe prendas por su variante—: no cambia.
--   2. Lo que alimenta Recibir no ofrece líneas sin prenda: `lineas_compra_operativo` no las devuelve; `listar_compras_operativo` cuenta
--      el reparto de una tienda (lo que le toca, lo que recibió, lo que le falta) solo con las líneas con prenda, de modo que un
--      comprobante hecho solo de líneas sin prenda no sale en la lista de una tienda ni como «por recibir» (sin tienda, exige al menos una
--      línea con prenda pendiente); `resumen_recepciones` no cuenta como «faltante» lo que Recibir no puede recibir.
--   3. Las lecturas que nombran la prenda no se rompen con la prenda vacía: `fn_proveedor_costo_evolucion` elige «la prenda más
--      comprada» solo entre líneas con prenda; la vista `compra_items_resumen` suma `categoria_id` y `marca_id` al final (la pantalla
--      escribe «categoría · marca · descripción»); `fn_mi_parte_de_compra` trae `categoria` y `marca` de cada línea.
--
-- REVISADAS Y SIN CAMBIO (no se rompen con la prenda vacía): `fn_producto_historia` y `fn_origen_producto` buscan por
-- `producto_id = p_producto_id` (una línea sin prenda nunca coincide); `fn_analisis_por_llegar` y `fn_analisis_sede` ya piden
-- `variante_id is not null`; `fn_costo_historial`, `fn_movimientos`, `fn_movimientos_busqueda`, `fn_productos*` y `fn_bal_causas_mercaderia`
-- parten de `movimientos` (lo recibido), que una línea sin prenda no tiene; `fn_bal_por_recibir`, `resumen_compras`, `resumen_compras_extra` y
-- `listar_compras` (Compras, con dinero) siguen diciendo que el comprobante tiene mercadería por recibir: es verdad y es plata.
--
-- QUÉ NO HACE. No registra el comprobante de una orden (`20261012211000`) ni hace que la mercadería entre por guía (fase 4).
--
-- CÓMO. Reemplazos ANCLADOS sobre la definición viva (el ayudante de 20261012204000), con anclas que son líneas de CÓDIGO, nunca
-- comentarios (los comentarios de producción citan otros ADR que los del repo): cada pedazo se busca tal cual está, la migración aborta
-- SIN TOCAR NADA si una función cambió y no hace nada si ya está aplicada. Ninguna función cambia de parámetros. La vista se arma
-- desde su definición viva (agrega dos columnas al final) y conserva `security_invoker`.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe), DESPUÉS de `20261012205000`: una sola parte, sin políticas (ADR-0195), con su
-- `lock_timeout`, re-pegable. ORDEN con la web: la base ANTES que la web (la pantalla nueva lee `categoria_id` y `marca_id` de la vista);
-- la web de antes funciona con la base nueva.

set lock_timeout = '3s';

-- Reemplazo anclado (el mismo de 20261012120000, 20261012202000 y 20261012204000): falla si la función viva cambió, y es re-ejecutable.
create or replace function pg_temp.reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
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
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- 1. Una línea sin prenda no se recibe ni se cierra por Recibir mercadería.

-- `recibir_compras`: al revisar cada línea pedida (antes de abrir el lote y de mover nada), tras confirmar que existe y que el comprobante
-- está vigente.
select pg_temp.reemplazar(
  'retail.recibir_compras(uuid,jsonb,text,text)',
  $v$    if v_proveedor is null then
$v$,
  $v$    -- Una línea sin prenda (la de un comprobante que sale de una orden de compra) llega por guía, no por aquí.
    if v_linea.producto_id is null then
      raise exception 'Esa línea todavía no tiene prenda: llega por guía, no por Recibir mercadería';
    end if;
    if v_proveedor is null then
$v$,
  1);

-- `recibir_envio`: al revisar los ítems de comprobante, antes de consumir el token y de abrir el envío.
select pg_temp.reemplazar(
  'retail.recibir_envio(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,text,text,uuid)',
  $v$      raise exception 'La línea de comprobante % no existe', v_item ->> 'compra_item_id';
    end if;
$v$,
  $v$      raise exception 'La línea de comprobante % no existe', v_item ->> 'compra_item_id';
    end if;
    -- Una línea sin prenda (la de un comprobante que sale de una orden de compra) llega por guía, no por aquí.
    if exists (select 1 from compra_items where id = (v_item ->> 'compra_item_id')::uuid and producto_id is null) then
      raise exception 'Esa línea todavía no tiene prenda: llega por guía, no por Recibir mercadería';
    end if;
$v$,
  1);

-- `cerrar_linea_compra`: tras leer la línea, antes de mirar su reparto, de pedir permiso o de bloquear nada.
select pg_temp.reemplazar(
  'retail.cerrar_linea_compra(uuid,integer,text,text,uuid)',
  $v$    raise exception 'La línea de comprobante % no existe', p_compra_item_id;
  end if;
$v$,
  $v$    raise exception 'La línea de comprobante % no existe', p_compra_item_id;
  end if;
  -- Una línea sin prenda (la de un comprobante que sale de una orden de compra) llega por guía: no hay faltante que cerrar aquí.
  if v_linea.producto_id is null then
    raise exception 'Esa línea todavía no tiene prenda: llega por guía, no por Recibir mercadería';
  end if;
$v$,
  1);

-- 2. Lo que alimenta Recibir no ofrece líneas sin prenda.

-- `lineas_compra_operativo`: las líneas que Recibir muestra y cuenta.
select pg_temp.reemplazar(
  'retail.lineas_compra_operativo(uuid[],uuid)',
  $v$    and r.compra_id = any(p_compra_ids)
$v$,
  $v$    and r.compra_id = any(p_compra_ids)
    -- una línea sin prenda (la de una orden de compra) no se recibe aquí: llega por guía
    and r.producto_id is not null
$v$,
  1);

-- `listar_compras_operativo`, mirando una tienda: lo que le toca, recibió y le falta se cuenta solo con las líneas con prenda. Un
-- comprobante sin ninguna queda sin reparto para ella (`t.asignado` vacío) y no sale. Sin tienda, además de «sin recibir o parcial»
-- exige alguna línea con prenda que aún tenga unidades pendientes.
select pg_temp.reemplazar(
  'retail.listar_compras_operativo(integer,date,timestamp with time zone,uuid,text,uuid,text,boolean,date,date,text,uuid)',
  $v$      where rs.compra_id = r.id and rs.ubicacion_id = v_ub
$v$,
  $v$      where rs.compra_id = r.id and rs.ubicacion_id = v_ub
        -- una línea sin prenda (la de una orden de compra) no se recibe aquí: llega por guía
        and exists (select 1 from compra_items x where x.id = rs.compra_item_id and x.producto_id is not null)
$v$,
  1);
select pg_temp.reemplazar(
  'retail.listar_compras_operativo(integer,date,timestamp with time zone,uuid,text,uuid,text,boolean,date,date,text,uuid)',
  $v$            case when v_ub is null then r.estado_recepcion in ('sin_recibir', 'parcial')
$v$,
  $v$            case when v_ub is null then r.estado_recepcion in ('sin_recibir', 'parcial')
                                        and exists (select 1 from compra_items_resumen x where x.compra_id = r.id and x.producto_id is not null and x.pendiente > 0)
$v$,
  1);

-- `resumen_recepciones`: «lo que aún falta» es lo que Recibir puede recibir o cerrar.
select pg_temp.reemplazar(
  'retail.resumen_recepciones(date)',
  $v$      and fn_puede_operar_ubicacion(rs.ubicacion_id)
$v$,
  $v$      and fn_puede_operar_ubicacion(rs.ubicacion_id)
      -- una línea sin prenda (la de una orden de compra) llega por guía: no es un faltante de Recibir
      and exists (select 1 from compra_items x where x.id = rs.compra_item_id and x.producto_id is not null)
$v$,
  1);

-- 3. Las lecturas que nombran la prenda no se rompen con la prenda vacía.

-- Evolución del costo de un proveedor: «la prenda más comprada» se elige solo entre líneas con prenda.
select pg_temp.reemplazar(
  'retail.fn_proveedor_costo_evolucion(uuid,integer)',
  $v$      group by ci.producto_id
      order by count(distinct ci.compra_id) desc, max(c.fecha_emision) desc
$v$,
  $v$        and ci.producto_id is not null -- una línea sin prenda (la de una orden de compra) no es «la prenda más comprada»
      group by ci.producto_id
      order by count(distinct ci.compra_id) desc, max(c.fecha_emision) desc
$v$,
  1);

-- «Mi parte» de un comprobante: cada línea trae la categoría y la marca (con prenda van vacías; sin prenda, son lo que la nombra).
select pg_temp.reemplazar(
  'retail.fn_mi_parte_de_compra(uuid)',
  $v$        'ubicacion_id', d.ubicacion_id, 'producto_id', i.producto_id, 'referencia', p.referencia,
$v$,
  $v$        'ubicacion_id', d.ubicacion_id, 'producto_id', i.producto_id, 'referencia', p.referencia,
        'categoria', ca.nombre, 'marca', ma.nombre,
$v$,
  1);
select pg_temp.reemplazar(
  'retail.fn_mi_parte_de_compra(uuid)',
  $v$      left join retail.productos p on p.id = i.producto_id
$v$,
  $v$      left join retail.productos p on p.id = i.producto_id
      left join retail.categorias ca on ca.id = i.categoria_id
      left join retail.marcas ma on ma.id = i.marca_id
$v$,
  1);

-- La vista de líneas con lo recibido: suma al final la categoría y la marca de la línea (sin prenda son lo que la nombra). Se arma desde
-- su definición viva y conserva `security_invoker` (sin él, un `create or replace` la dejaría leyendo con los permisos de su dueño).
do $vista$
declare
  v_def text := pg_get_viewdef('retail.compra_items_resumen'::regclass, true);
  v_ancla constant text := 'FROM retail.compra_items ci';
  v_n integer;
begin
  if position('categoria_id' in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla);
  if v_n <> 1 then
    raise exception 'retail.compra_items_resumen cambió desde que se escribió esta migración: se esperaba 1 aparición de «%» y hay %. Regenera el reemplazo desde su definición real.', v_ancla, v_n;
  end if;
  execute 'create or replace view retail.compra_items_resumen with (security_invoker = true) as '
    || replace(rtrim(v_def, E';\n '), v_ancla, ', ci.categoria_id, ci.marca_id ' || v_ancla);
end;
$vista$;

comment on view retail.compra_items_resumen is
  'Líneas de comprobante con lo recibido, lo cerrado y lo pendiente. ADR-0362 (fase 2): categoria_id y marca_id nombran la línea que no tiene prenda (la de una orden de compra); con prenda van vacías.';

-- Validación: cada pieza quedó con su regla (si no, aborta todo).
do $g$
declare
  v_firma text;
  v_def text;
begin
  foreach v_firma in array array['retail.recibir_compras(uuid,jsonb,text,text)', 'retail.recibir_envio(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,text,text,uuid)',
                                 'retail.cerrar_linea_compra(uuid,integer,text,text,uuid)'] loop
    if position('Esa línea todavía no tiene prenda: llega por guía, no por Recibir mercadería' in pg_get_functiondef(v_firma::regprocedure)) = 0 then
      raise exception 'ADR-0362: % no rechaza una línea sin prenda', v_firma;
    end if;
  end loop;
  if position('r.producto_id is not null' in pg_get_functiondef('retail.lineas_compra_operativo(uuid[],uuid)'::regprocedure)) = 0 then
    raise exception 'ADR-0362: lineas_compra_operativo sigue ofreciendo líneas sin prenda';
  end if;
  v_def := pg_get_functiondef('retail.listar_compras_operativo(integer,date,timestamp with time zone,uuid,text,uuid,text,boolean,date,date,text,uuid)'::regprocedure);
  if position('x.producto_id is not null' in v_def) = 0 or position('x.pendiente > 0' in v_def) = 0 then
    raise exception 'ADR-0362: listar_compras_operativo sigue contando líneas sin prenda como por recibir';
  end if;
  if position('x.producto_id is not null' in pg_get_functiondef('retail.resumen_recepciones(date)'::regprocedure)) = 0 then
    raise exception 'ADR-0362: resumen_recepciones sigue contando líneas sin prenda como faltante';
  end if;
  if position('ci.producto_id is not null' in pg_get_functiondef('retail.fn_proveedor_costo_evolucion(uuid,integer)'::regprocedure)) = 0 then
    raise exception 'ADR-0362: fn_proveedor_costo_evolucion puede elegir una línea sin prenda como la más comprada';
  end if;
  v_def := pg_get_functiondef('retail.fn_mi_parte_de_compra(uuid)'::regprocedure);
  if position('''categoria'', ca.nombre' in v_def) = 0 or position('retail.marcas ma' in v_def) = 0 then
    raise exception 'ADR-0362: fn_mi_parte_de_compra no trae la categoría y la marca de la línea';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'retail' and table_name = 'compra_items_resumen' and column_name = 'categoria_id')
     or not exists (select 1 from information_schema.columns where table_schema = 'retail' and table_name = 'compra_items_resumen' and column_name = 'marca_id') then
    raise exception 'ADR-0362: compra_items_resumen no trae categoria_id y marca_id';
  end if;
  if not coalesce((select 'security_invoker=true' = any (c.reloptions) from pg_class c where c.oid = 'retail.compra_items_resumen'::regclass), false) then
    raise exception 'ADR-0362: compra_items_resumen perdió security_invoker';
  end if;
end;
$g$;

reset lock_timeout;
