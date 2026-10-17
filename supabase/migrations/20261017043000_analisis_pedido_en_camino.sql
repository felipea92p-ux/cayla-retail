-- ============================================================================
-- 20261017043000_analisis_pedido_en_camino.sql — CAYLA V2 · ADR-0357 (Análisis, «Actualización 2026-10-16 — Análisis para decidir compras», A4)
-- Una lectura nueva, aditiva y de solo lectura: lo que ya se PIDIÓ y todavía no llegó, por tipo y marca.
--
-- EL PROBLEMA PRIMERO. «Se está acabando» y «Qué pedir» dicen «pídelo» mirando solo lo que ya tiene una prenda: el stock y lo que viene
-- por traslado o por una compra con su talla y color (`fn_analisis_por_llegar`, que exige `variante_id`). Pero una orden de compra se
-- pide por «categoría + marca» (la prenda todavía no existe: se crea al recibir), y el envío del proveedor y la producción del Taller
-- tampoco son una prenda. Resultado: el día que se haga el primer pedido real para Navidad, Análisis seguirá diciendo «pídelo» y el
-- comprador lo pedirá dos veces. Hoy (2026-10-16, solo lectura en producción) hay 0 órdenes, 0 líneas y 1 envío abierto sin líneas:
-- el riesgo empieza con el primer pedido.
--
-- QUÉ HACE. `retail.fn_analisis_pedido_en_camino(p_ubicacion_id)` devuelve un jsonb: un arreglo de partes
-- `{de, categoria, prefijo, marca, cantidad, fecha, numeros}`, UNA parte por origen, tipo, marca y fecha. Los cinco orígenes (`de`):
--   · 'orden'        lo pedido en una orden de compra abierta (`generada`) que llega DIRECTO a esta tienda y todavía no salió en un envío.
--   · 'envio'        lo que va en un envío (guía) hacia esta tienda que todavía no se recibe (en camino o abierto): ya salió, aún no es stock.
--   · 'reposicion'   lo que el proveedor debe reponer en un envío ya cerrado a esta tienda y todavía no repuso ni resolvió: lo que «No vino»
--                    y lo que se le devolvió por llegar dañado (`devuelta`), sin contar las diferencias que un envío reabierto dejó de
--                    historia (`vigente = false`): las mismas que cuenta el Plan de campaña.
--   · 'por_repartir' lo pedido en una orden SIN destino (llega a Lima y se reparte después), o con destino un almacén (que no es una
--                    tienda: de ahí se reparte), que todavía no salió en un envío: no es de ninguna tienda hasta que se reparte. Es de la RED.
--   · 'taller'       lo que el Taller tiene EN PROCESO (producciones `en_proceso`, sin muestras). Es de la RED: mientras se cose no dice a
--                    qué tienda irá, y adivinarlo sería prometer prendas que nadie mandó (decisión 6 de ADR-0357). Cuenta como traslado
--                    recién cuando sale del Taller (`fn_analisis_por_llegar`).
-- `fecha` es la entrega estimada de la ORDEN (`fecha_entrega_estimada`; NULL si nadie la anotó; NULL siempre en 'reposicion', que no tiene
-- fecha propia) o, en 'taller', la fecha de entrega de la producción. `numeros` son los números de las órdenes (o de las producciones) que
-- suman la parte: la pantalla los muestra como «OC-000012». La orden de otra tienda no sale: no es de esta. Una orden anulada tampoco.
--
-- SIN DOBLE CONTEO (la razón de la forma). La misma unidad puede aparecer como línea de la orden, como línea de un envío y, cuando
-- llega, como entrada al stock. Se cuenta UNA vez, en el lugar donde está ahora, con la misma cuenta que usa el Plan de campaña
-- (`fn_plan_compra_pedido`, 20261013213000) para «por llegar»:
--     pedido = por enviar + en camino + por reponer,   y   por enviar = pedido − lo que ya salió en un envío vigente (nunca < 0).
-- Un envío anulado no cuenta; uno cerrado ya está en el stock. Así, una orden de 100 que pasa por «sin enviar» → «40 en un envío en
-- camino» → «recibido» se lee 100 → 60 + 40 → 60: nunca más de 100 y nunca 160. Y NO se cruza con `fn_analisis_por_llegar`: el papel de
-- una orden (`compra_items.orden_compra_item_id`) se guarda SIN prenda (`variante_id` nulo) y esa lectura exige prenda, así que la
-- compra de una orden jamás aparece allí; las dos lecturas no se pisan. (Lo que sí puede duplicarse es que alguien registre a mano, por
-- el camino viejo de «Registrar factura», una compra con prendas de lo mismo que ya tiene su orden: dos documentos distintos del
-- mundo real que ningún dato une. Se avisa en el ADR; la base no puede deducirlo.)
--
-- SIN DINERO (ADR-0126). No devuelve precio, descuento, subtotal ni costo: solo tipo, marca, unidades, fecha y número de orden. Por eso
-- la pide Análisis y no el módulo «Órdenes de compra» (que ve los precios de todas las sedes).
--
-- QUIÉN LA LEE. Las mismas dos puertas que `fn_analisis_por_llegar`: `fn_tiene_acceso_retail()` y `fn_puede_analizar()`, sin pedir operar
-- la sede (decisión 8). Sin cualquiera de las dos devuelve NULL —no un arreglo vacío—: la web lo dice como «no se pudo leer», nunca
-- como «no hay nada pedido». Es `security definer` porque es OBLIGATORIO: `ordenes_compra`, `orden_compra_items`, `despachos`,
-- `despacho_items`, `despacho_diferencias` y `proveedor_deuda_resoluciones` tienen RLS encendido y CERO políticas (verificado en
-- producción el 2026-10-16: «paso 0» de A4), así que una cuenta con solo Análisis no puede leerlas por su cuenta. Las políticas viejas
-- (`ordenes_compra_select` de 0004_rls.sql) ya no existen.
--
-- FAMILIAS FUERA DE LOS MOTORES (ADR-0377). Una orden de bolsas o cajas (familia con `entra_a_motores = false`) no cuenta: la pregunta
-- es `fn_categoria_entra_a_motores(categoria_id)`, la misma de todo motor de decisión (caso en `motores_familias_apagadas.mjs`).
--
-- NÚMEROS. Unas decenas de órdenes abiertas con pocas líneas; todo se une por `orden_compra_item_id` (índice en `despacho_items`).
-- Milisegundos.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe, ANTES de fusionar la web que la llama: sin ella, Análisis dice «No se pudo leer lo que
-- ya está pedido» en cada visita). UN `create or replace function` con su `comment` y sus permisos: sin políticas, sin `alter` de tablas,
-- sin `drop trigger` (ADR-0195), en una sola parte, en el SQL Editor. Sin `select … into` dentro de textos entre comillas (ADR-0288).
-- Se puede pegar dos veces. Después de pegar, solo lectura:
--   select pg_get_function_result('retail.fn_analisis_pedido_en_camino(uuid)'::regprocedure);     → jsonb
--   select retail.fn_analisis_pedido_en_camino((select id from retail.ubicaciones where tipo = 'tienda' order by nombre limit 1)) is null;
--     → `true` en el SQL Editor: ahí no hay sesión, y eso también es la prueba de la puerta.
-- Y después `pnpm datos:generar:produccion` (el diccionario) y `pnpm datos:comparar` (la pantalla contra la base real).
--
-- SE ROMPE SI el envío (`despachos`) cambia de estados (hoy: en_camino → abierto → cerrado, o anulado) o si una orden suma un estado
-- distinto de `generada` que siga abierta; si la producción deja de marcar `en_proceso`; o si «No vino» o «devuelta» cambian de nombre en
-- `despacho_diferencias.causa`, o si las diferencias vigentes dejan de leerse por `despacho_diferencias_vigentes`.
-- Prueba: `scripts/pruebas/analisis_lecturas.mjs` (casos Y) y `motores_familias_apagadas.mjs` (H1). Necesita una base con TODAS las migraciones.
-- SE DESHACE con: drop function retail.fn_analisis_pedido_en_camino(uuid);
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- Guarda: lo que esta lectura asume tiene que estar en la base. Si falta, se detiene sin crear nada.
do $$
begin
  if to_regprocedure('retail.fn_tiene_acceso_retail()') is null or to_regprocedure('retail.fn_puede_analizar()') is null then
    raise exception 'Faltan las puertas retail.fn_tiene_acceso_retail() o retail.fn_puede_analizar(): pega antes 20260923130000_abrir_modulos_a_los_roles.sql.';
  end if;
  if to_regprocedure('retail.fn_categoria_entra_a_motores(uuid)') is null then
    raise exception 'Falta retail.fn_categoria_entra_a_motores(uuid): pega antes 20261010231000_familias_entran_a_motores.sql.';
  end if;
  if to_regclass('retail.ordenes_compra') is null or to_regclass('retail.orden_compra_items') is null then
    raise exception 'Faltan las órdenes de compra (retail.ordenes_compra, retail.orden_compra_items): pega antes 20261010214500_ordenes_compra_modulo_y_tablas.sql.';
  end if;
  if to_regclass('retail.despachos') is null or to_regclass('retail.despacho_items') is null then
    raise exception 'Faltan los envíos (retail.despachos, retail.despacho_items): pega antes 20261012225000_compras_envios.sql.';
  end if;
  if to_regclass('retail.despacho_diferencias') is null or to_regclass('retail.proveedor_deuda_resoluciones') is null then
    raise exception 'Faltan las diferencias de recepción o «Nos debe» (retail.despacho_diferencias, retail.proveedor_deuda_resoluciones): pega antes 20261013015000_nos_debe.sql.';
  end if;
  if to_regclass('retail.despacho_diferencias_vigentes') is null then
    raise exception 'Falta la vista retail.despacho_diferencias_vigentes (lo que valió en un envío reabierto): pega antes 20261013180000_reabrir_envio.sql.';
  end if;
  if to_regclass('retail.producciones') is null then
    raise exception 'Falta retail.producciones (la producción del Taller): pega antes 20260915130000_produccion_del_taller.sql.';
  end if;
end $$;

create or replace function retail.fn_analisis_pedido_en_camino(p_ubicacion_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  -- El producto de la prenda centinela de las ventas «sin registrar» (ADR-0179): no es una prenda que se produzca.
  c_producto_centinela constant uuid := '11111111-1111-4111-8111-111111111111';
begin
  if p_ubicacion_id is null then
    raise exception 'fn_analisis_pedido_en_camino: falta la tienda' using errcode = '22004';
  end if;
  -- Las mismas dos puertas que fn_analisis_por_llegar (decisión 8: sin pedir operar la sede). Sin cualquiera, NULL.
  if not retail.fn_tiene_acceso_retail() or not retail.fn_puede_analizar() then
    return null;
  end if;

  return (
    with lineas as (
      -- Cada línea de una orden abierta, con lo que ya salió de ella en envíos vigentes (en camino, abiertos o cerrados: lo anulado no).
      -- Una familia fuera de los motores (bolsas, cajas) no cuenta.
      select i.id as linea_id,
             o.numero,
             o.ubicacion_destino_id as destino,
             -- De la red: sin destino, o con un destino que no es una tienda (un almacén, que `crear_orden_compra` también admite).
             (o.ubicacion_destino_id is null or u.tipo is distinct from 'tienda') as de_la_red,
             o.fecha_entrega_estimada as fecha,
             i.categoria_id,
             i.marca_id,
             i.cantidad,
             (select coalesce(sum(di.cantidad), 0)::integer
                from retail.despacho_items di
                join retail.despachos d on d.id = di.despacho_id
               where di.orden_compra_item_id = i.id
                 and d.estado in ('en_camino', 'abierto', 'cerrado')) as enviado
        from retail.orden_compra_items i
        join retail.ordenes_compra o on o.id = i.orden_compra_id
        left join retail.ubicaciones u on u.id = o.ubicacion_destino_id
       where o.estado = 'generada'
         and retail.fn_categoria_entra_a_motores(i.categoria_id)
    ),
    partes as (
      -- 1. Lo pedido que todavía no salió en un envío: directo a esta tienda es de la tienda; sin destino (o a un almacén), de la red (se
      --    reparte después). Una orden que llega directo a OTRA tienda no es de esta.
      select case when l.de_la_red then 'por_repartir' else 'orden' end as de,
             l.categoria_id, l.marca_id, l.fecha, l.numero,
             greatest(l.cantidad - l.enviado, 0) as cantidad
        from lineas l
       where l.de_la_red or l.destino = p_ubicacion_id
      union all
      -- 2. Lo que va en un envío hacia esta tienda y todavía no se recibe: ya salió, pero aún no es stock. Cuenta aunque la orden sea
      --    «por repartir»: el envío tiene una sede.
      select 'envio', l.categoria_id, l.marca_id, l.fecha, l.numero, di.cantidad
        from lineas l
        join retail.despacho_items di on di.orden_compra_item_id = l.linea_id
        join retail.despachos d on d.id = di.despacho_id
       where d.ubicacion_destino_id = p_ubicacion_id
         and d.estado in ('en_camino', 'abierto')
      union all
      -- 3. Lo que el proveedor debe reponer en un envío ya cerrado a esta tienda («No vino» y lo devuelto por llegar dañado), menos lo que
      --    «Nos debe» ya saldó. Solo las diferencias vigentes (un envío reabierto deja las viejas de historia) y las mismas causas que cuenta
      --    el Plan de campaña (`fn_plan_compra_pedido`). No tiene fecha propia.
      select 'reposicion', l.categoria_id, l.marca_id, null::date, l.numero,
             greatest(x.cantidad - coalesce((select sum(r.cantidad) from retail.proveedor_deuda_resoluciones r where r.diferencia_id = x.id), 0), 0)
        from lineas l
        join retail.despacho_items di on di.orden_compra_item_id = l.linea_id
        join retail.despachos d on d.id = di.despacho_id
        join retail.despacho_diferencias_vigentes x on x.despacho_item_id = di.id
       where d.ubicacion_destino_id = p_ubicacion_id
         and d.estado = 'cerrado'
         and x.tipo = 'faltante'
         and x.causa in ('no_vino', 'devuelta')
      union all
      -- 4. Lo que el Taller tiene en proceso: de la red, no de una tienda. Sin muestras, sin productos de prueba ni la centinela.
      select 'taller', pr.categoria_id, null::uuid, p.fecha_entrega, p.numero, p.cantidad_plan
        from retail.producciones p
        join retail.productos pr on pr.id = p.producto_id
       where p.estado = 'en_proceso'
         and not p.es_muestra
         and not pr.es_prueba
         and pr.id <> c_producto_centinela
         and retail.fn_categoria_entra_a_motores(pr.categoria_id)
    ),
    agrupado as (
      select x.de, x.categoria_id, x.marca_id, x.fecha,
             sum(x.cantidad)::integer as cantidad,
             array_agg(distinct x.numero order by x.numero) as numeros
        from partes x
       where x.cantidad > 0
       group by x.de, x.categoria_id, x.marca_id, x.fecha
    )
    select coalesce(jsonb_agg(jsonb_build_object(
             'de', g.de,
             'categoria', c.nombre,
             'prefijo', c.prefijo,
             'marca', m.nombre,
             'cantidad', g.cantidad,
             'fecha', g.fecha,
             'numeros', to_jsonb(g.numeros))
           order by g.de, c.nombre, m.nombre nulls last, g.fecha nulls last), '[]'::jsonb)
      from agrupado g
      join retail.categorias c on c.id = g.categoria_id
      left join retail.marcas m on m.id = g.marca_id
  );
end;
$$;

comment on function retail.fn_analisis_pedido_en_camino(uuid) is
  'ADR-0357 (Análisis, act. 2026-10-16, A4): lo YA PEDIDO y que todavía no llegó, en un jsonb (arreglo de {de, categoria, prefijo, marca, '
  'cantidad, fecha, numeros}), por tipo y marca. de = orden (orden de compra abierta directa a la tienda, sin enviar), envio (en un envío '
  'a la tienda sin recibir), reposicion (lo que el proveedor debe reponer en un envío cerrado: no vino o se le devolvió, solo diferencias '
  'vigentes), por_repartir (orden sin destino o a un almacén, sin enviar: de la red) o taller (producción en proceso: de la red, nunca de '
  'una tienda). Cuenta cada unidad una vez (pedido = por enviar + en camino + por reponer, como el Plan de campaña). Sin dinero. Familias '
  'fuera de los motores no cuentan. Puertas: fn_tiene_acceso_retail() y fn_puede_analizar(), sin pedir operar la sede. Sin ellas, NULL. '
  'Solo lectura.';

revoke all on function retail.fn_analisis_pedido_en_camino(uuid) from public, anon;
grant execute on function retail.fn_analisis_pedido_en_camino(uuid) to authenticated, service_role;

reset lock_timeout;
