-- ============================================================================
-- scripts/purga/purgar-producto-de-prueba.sql — ADR-0224 (ampliado el 2026-09-28: ventas con boleta de prueba,
-- separaciones, compras con su recepción, conteos, bajadas, traslados dentro de la tienda; y el 2026-09-29: traslados
-- ENTRE sedes —envío y, si ya se recibió, recepción— y proformas/cotizaciones)
-- Deshace POR COMPLETO un producto de prueba y los documentos de prueba que lo tocaron (ventas, separaciones, compras,
-- traslados entre sedes, proformas).
-- Se corre a mano, una vez por producto, nunca desde la web: borra historia que el sistema declara inmutable
-- (`movimientos`, costos, bajadas…), y esa promesa solo se rompe con una persona presente, un ensayo a la vista y un respaldo.
-- Lo que tiene solo historia de stock lo borra un Admin desde Productos (ADR-0252); esto es para lo que tiene DOCUMENTOS.
--
-- LA LÍNEA ROJA: un comprobante que llegó a SUNAT en producción (`entorno_transmision = 'produccion'`) no se borra JAMÁS,
-- ni aunque Felipe lo pida: el script aborta. Sí se borran las notas de venta internas, lo transmitido al entorno de
-- pruebas de SUNAT (`sandbox`) y lo que nunca salió de la base (pendiente, sin ningún intento de envío).
--
-- QUÉ HACE, en una sola transacción (todo o nada):
--   1. Bloquea el producto, sus variantes y los documentos nombrados, y arma UNA lista de todo lo que va a borrar
--      (`zz_borrar`: tabla + id). De esa lista salen el candado, el respaldo, el borrado y la demostración.
--   2. Candado: comprueba que lo que va a borrar es EXACTAMENTE lo que Felipe dijo que era de prueba y que nadie más lo
--      cita — por llave foránea (cualquier tabla, también las que nazcan mañana) o por mención suelta (el id escrito en
--      otra fila). Si algo no cuadra aborta, dice qué y no borra nada.
--   3. Respalda cada fila, tal cual, en `respaldo_purgas.filas` (jsonb): es lo que permite volver atrás.
--   4. Devuelve a stock las prendas de OTROS productos que esas ventas sacaron (la venta «nunca ocurrió»).
--   5. Borra de hijos a padres. Los candados de historial (movimientos, bajadas, marcas de reintento, costos,
--      reasignaciones y cierres de compra) se apagan SOLO dentro de esta transacción y vuelven al modo en que estaban
--      (movimientos en ALWAYS, D-22): si algo falla, vuelven solos.
--   6. Devuelve la serie de NOTAS DE VENTA solo si lo borrado era el final de la serie. Una serie de SUNAT (boleta,
--      factura) no retrocede nunca: SUNAT o el PSE pudieron ver ese número, y reutilizarlo sería emitir un duplicado.
--      Tampoco vuelven los contadores de códigos (TOP-0011, APT-TRU-0004): un código que existió no se reutiliza.
--   7. Deja rastro: una línea en Actividad por documento y otra por el producto, y una fila en el historial del producto
--      (las dos tablas son inmutables: lo que ya decían se queda, y esto cuenta qué le pasó).
--   8. Demuestra el resultado antes de cerrar: dispara las revisiones diferidas (el reparto de compras), nada de lo borrado
--      sigue vivo, el stock devuelto es exacto, el libro de movimientos cuadra con el stock en TODA la base (0 filas
--      descuadradas antes y 0 después), los candados volvieron a su modo y los comprobantes de producción siguen intactos.
--
-- CÓMO SE USA (van ANTES del script, en la misma sesión; `producto` y `ventas` son obligatorios):
--     select set_config('cayla_purga.producto',     'POL-0005', false);    -- código del producto
--     select set_config('cayla_purga.ventas',       '<id>,<id>', false);   -- ids de venta, con coma; '-' si no hay
--     select set_config('cayla_purga.separaciones', '<id>', false);        -- opcional; '-' o sin poner si no hay
--     select set_config('cayla_purga.compras',      '<id>', false);        -- opcional; '-' o sin poner si no hay
--     select set_config('cayla_purga.traslados',    '<id>', false);        -- opcional; '-' o sin poner si no hay (transferencias)
--     select set_config('cayla_purga.proformas',    '<id>', false);        -- opcional; '-' o sin poner si no hay (cotizaciones)
--   Si el producto está en un documento que no nombraste, el ensayo lo rechaza y te da su id: nada se borra por omisión.
--   ENSAYO (lo que corre si no se dice otra cosa): termina con una EXCEPCIÓN que trae el resumen. Nada queda escrito.
--   CORRIDA REAL: además   select set_config('cayla_purga.modo', 'definitivo', false);   y solo con el «dale» de Felipe.
--   Toma por unos segundos los candados de las tablas de historial (apagar un disparador los necesita): con
--   `lock_timeout` de 5 s, si la tienda está registrando algo en ese instante aborta sin dañar nada — se reintenta.
--
-- CÓMO SE VUELVE ATRÁS (si Felipe se arrepiente): `scripts/purga/restaurar-purga.sql`, con el nombre de la purga que trae
-- el resumen. Devuelve cada fila respaldada, el stock de las otras prendas y la serie, y comprueba que el libro cuadre.
-- `pruebas/purgar_producto_de_prueba.mjs` lo hace y compara fila por fila.
--
-- LO QUE NO TOCA: la caja (su cierre guardado es lo que se contó ese día; la caja pierde la venta, no su arqueo), la
-- cabecera de un conteo o de una bajada al piso que se quede sin líneas (igual que ADR-0252), las clientas, los archivos
-- de fotos en Storage, `actividad` e `historial_producto_cambios` (inmutables) ni ningún otro documento.
-- Las líneas «begin»/«commit» llevan la marca [[transaccion]]: la prueba las quita para envolver el script en su propia
-- transacción; el resto es idéntico.
-- ============================================================================

begin; -- [[transaccion]]
set local lock_timeout = '5s';
set local statement_timeout = '120s';
set local search_path to retail, public, extensions;

-- ---- 0. Parámetros y candados de fila ----
-- Una lista de ids de un parámetro: '-' (o sin poner) es «ninguno».
create function pg_temp.lista(p_nombre text) returns uuid[] language sql stable as $f$
  select case when coalesce(nullif(btrim(current_setting('cayla_purga.' || p_nombre, true)), ''), '-') = '-' then '{}'::uuid[]
              else string_to_array(replace(current_setting('cayla_purga.' || p_nombre), ' ', ''), ',')::uuid[] end
$f$;

do $$
begin
  if coalesce(current_setting('cayla_purga.producto', true), '') = '' or coalesce(current_setting('cayla_purga.ventas', true), '') = '' then
    raise exception '[purga] Faltan parámetros: cayla_purga.producto (código del producto, ej. TOP-0011) y cayla_purga.ventas (ids de venta separados por coma; ''-'' si no hay ventas). Ver el encabezado.';
  end if;
  if to_regclass('respaldo_purgas.filas') is null then
    raise exception '[purga] Falta respaldo_purgas.filas (lo crea la migración 20260928230000, ADR-0252): sin respaldo no se borra nada.';
  end if;
  -- Primero los candados de fila, después se mira: lo que llegue durante la purga espera o falla, nunca queda a medias.
  -- (Una venta nueva de estas prendas cita su variante y espera aquí; al terminar, la variante ya no existe y esa venta falla.)
  perform 1 from productos where codigo = current_setting('cayla_purga.producto') for update;
  perform 1 from variantes where producto_id in (select id from productos where codigo = current_setting('cayla_purga.producto')) order by id for update;
  perform 1 from ventas where id = any (pg_temp.lista('ventas')) order by id for update;
  perform 1 from separaciones where id = any (pg_temp.lista('separaciones')) order by id for update;
  perform 1 from compras where id = any (pg_temp.lista('compras')) order by id for update;
  perform 1 from comprobantes where venta_id = any (pg_temp.lista('ventas')) or separacion_id = any (pg_temp.lista('separaciones')) order by id for update;
  perform 1 from transferencias where id = any (pg_temp.lista('traslados')) order by id for update;
  perform 1 from proformas where id = any (pg_temp.lista('proformas')) order by id for update;
end $$;

-- ---- 1. Alcance: todo lo que se va a borrar, calculado UNA vez ----
create temp table zz_prod on commit drop as
  select id, codigo, referencia from productos where codigo = current_setting('cayla_purga.producto');
create temp table zz_var on commit drop as
  select id, codigo from variantes where producto_id in (select id from zz_prod);
create temp table zz_venta on commit drop as
  select id, ubicacion_id from ventas where id = any (pg_temp.lista('ventas'));
create temp table zz_sep on commit drop as
  select id, codigo, ubicacion_id from separaciones where id = any (pg_temp.lista('separaciones'));
create temp table zz_compra on commit drop as
  select id, serie, numero from compras where id = any (pg_temp.lista('compras'));
create temp table zz_item on commit drop as
  select id, venta_id, variante_id, cantidad from venta_items where venta_id in (select id from zz_venta);
create temp table zz_compra_item on commit drop as
  select id, compra_id, producto_id, variante_id from compra_items where compra_id in (select id from zz_compra);
create temp table zz_comp on commit drop as
  select id, tipo, serie, numero, ubicacion_id, entorno_transmision from comprobantes
   where venta_id in (select id from zz_venta) or separacion_id in (select id from zz_sep);
-- El traslado se borra ENTERO (como una separación o una compra): sus líneas de envío y, si ya se recibió, sus líneas
-- de recepción — puede traer una prenda «sustituida» que nunca se envió (sin fila en transferencia_items).
create temp table zz_traslado on commit drop as
  select id, ubicacion_origen_id, ubicacion_destino_id from transferencias where id = any (pg_temp.lista('traslados'));
create temp table zz_traslado_item on commit drop as
  select id, transferencia_id, variante_id from transferencia_items where transferencia_id in (select id from zz_traslado);
create temp table zz_traslado_recep on commit drop as
  select id, transferencia_id, variante_id from transferencia_recepciones where transferencia_id in (select id from zz_traslado);
-- La proforma se borra ENTERA: sin llave foránea a variantes (guarda sus prendas en un jsonb), así que el candado de
-- «quién más cita esto» por llave (f) no la vería sola — solo el candado por texto suelto (g). Por eso se nombra a
-- mano, como una separación o una compra.
create temp table zz_proforma on commit drop as
  select id, numero from proformas where id = any (pg_temp.lista('proformas'));
-- Los movimientos: los del producto, los de otras prendas que salieron por esas ventas, los que recibieron esas compras
-- y los que nacieron de los traslados nombrados (envío y, si ya se recibió, recepción).
create temp table zz_mov on commit drop as
  select * from movimientos
   where variante_id in (select id from zz_var) or venta_item_id in (select id from zz_item) or compra_item_id in (select id from zz_compra_item)
      or transferencia_item_id in (select id from zz_traslado_item) or transferencia_recepcion_id in (select id from zz_traslado_recep);

-- LA lista: cada fila que se borra, por tabla e id. Las tablas sin un `id` propio (stock, el reparto de una compra, las
-- líneas de una bajada, las marcas de reintento…) son «hojas»: se borran con su padre y se describen en `zz_hoja`.
create temp table zz_borrar (tabla text not null, id uuid not null, primary key (tabla, id)) on commit drop;
insert into zz_borrar
  select 'productos', id from zz_prod
  union select 'variantes', id from zz_var
  union select 'codigos_barras', id from codigos_barras where variante_id in (select id from zz_var)
  union select 'producto_fotos', id from producto_fotos where producto_id in (select id from zz_prod)
  union select 'pedidos_no_atendidos', id from pedidos_no_atendidos where producto_id in (select id from zz_prod)
  union select 'movimientos', id from zz_mov
  union select 'conteo_items', id from conteo_items where variante_id in (select id from zz_var)
  union select 'costo_historial', id from costo_historial where variante_id in (select id from zz_var) or movimiento_id in (select id from zz_mov)
  union select 'apartados', id from apartados where variante_id in (select id from zz_var) or separacion_id in (select id from zz_sep)
  union select 'ventas', id from zz_venta
  union select 'venta_items', id from zz_item
  union select 'venta_pagos', id from venta_pagos where venta_id in (select id from zz_venta)
  union select 'comprobantes', id from zz_comp
  union select 'separaciones', id from zz_sep
  union select 'separacion_items', id from separacion_items where separacion_id in (select id from zz_sep)
  union select 'separacion_pagos', id from separacion_pagos where separacion_id in (select id from zz_sep)
  union select 'compras', id from zz_compra
  union select 'compra_items', id from zz_compra_item
  union select 'compra_reasignaciones', id from compra_reasignaciones where compra_item_id in (select id from zz_compra_item)
  union select 'compra_item_cierres', id from compra_item_cierres where compra_item_id in (select id from zz_compra_item)
  union select 'lotes', lote_id from zz_mov where lote_id is not null
  union select 'transferencias', id from zz_traslado
  union select 'transferencia_items', id from zz_traslado_item
  union select 'transferencia_recepciones', id from zz_traslado_recep
  union select 'proformas', id from zz_proforma;
-- El envío (la guía con la que llegó) se va solo si se queda vacío: todos sus lotes se borran y no trae nada más.
insert into zz_borrar
  select 'envios', e.id from envios e
   where e.id in (select l.envio_id from lotes l where l.id in (select id from zz_borrar where tabla = 'lotes'))
     and not exists (select 1 from lotes l where l.envio_id = e.id and l.id not in (select id from zz_borrar where tabla = 'lotes'))
     and not exists (select 1 from envio_extras x where x.envio_id = e.id)
     and not exists (select 1 from envio_traslados x where x.envio_id = e.id);

create temp table zz_hoja (tabla text primary key, columna text not null, padre text not null) on commit drop;
insert into zz_hoja values
  ('stock', 'variante_id', 'variantes'),
  ('variante_etiquetas', 'variante_id', 'variantes'),
  ('producto_color_temporadas', 'producto_id', 'productos'),
  -- En qué sede se registró el producto (ADR-0292): nace con la ficha y se va con ella.
  ('producto_origen', 'producto_id', 'productos'),
  -- La libreta de «Ya decidí» de Frescura del piso (ADR-0208, paso 4b): lo que la tienda anotó sobre su propio piso.
  ('frescura_decisiones', 'producto_id', 'productos'),
  ('bajada_piso_items', 'movimiento_id', 'movimientos'),
  ('movimientos_internos_intentos', 'movimiento_id', 'movimientos'),
  ('compra_item_destinos', 'compra_item_id', 'compra_items'),
  ('comprobante_anticipos', 'comprobante_id', 'comprobantes'),
  -- Lo que deja `anular_venta` (2026-09-29): por qué se anuló cada línea, y con qué movimiento se devolvió el stock.
  ('venta_anulacion_items', 'venta_id', 'ventas');

-- Las tablas que se borran por id, aunque en esta corrida no tengan filas.
create temp table zz_tablas on commit drop as
  select unnest(array['productos', 'variantes', 'codigos_barras', 'producto_fotos', 'pedidos_no_atendidos', 'movimientos',
                      'conteo_items', 'costo_historial', 'apartados', 'ventas', 'venta_items', 'venta_pagos', 'comprobantes',
                      'separaciones', 'separacion_items', 'separacion_pagos', 'compras', 'compra_items', 'compra_reasignaciones',
                      'compra_item_cierres', 'lotes', 'envios', 'transferencias', 'transferencia_items', 'transferencia_recepciones',
                      'proformas']) as tabla;

-- El filtro «esta fila NO se va con la purga», para buscar quién más cita o menciona lo que se borra.
create function pg_temp.fuera_de_la_lista(p_tabla text, p_alias text) returns text language sql stable as $f$
  select case
    when exists (select 1 from zz_tablas where tabla = p_tabla)
      then format(' and %s.id not in (select id from zz_borrar where tabla = %L)', p_alias, p_tabla)
    when exists (select 1 from zz_hoja where tabla = p_tabla)
      then (select format(' and %s.%I not in (select id from zz_borrar where tabla = %L)', p_alias, h.columna, h.padre)
              from zz_hoja h where h.tabla = p_tabla)
    else '' end
$f$;

-- Los comprobantes que llegaron a SUNAT en producción, en toda la base: al final tienen que seguir siendo los mismos.
create temp table zz_sunat_produccion on commit drop as
  select id, md5(to_jsonb(c)::text) as huella from comprobantes c where c.entorno_transmision = 'produccion';

-- El libro de movimientos contra el stock, en toda la base: cuántas filas de stock no coinciden con lo que dicen los
-- movimientos (entrada +, salida −, ajuste ±, traslado −origen +destino; apartar y liberar no mueven `cantidad`). Es la
-- prueba de que la purga no dejó nada a medias. Verificado en producción el 2026-09-26: 79 filas, 0 descuadres.
create function pg_temp.libro_descuadra() returns bigint language sql as $f$
  with efecto as (
    select variante_id, ubicacion_id, sububicacion_id,
           case tipo when 'entrada' then cantidad when 'ajuste' then cantidad when 'salida' then -cantidad
                     when 'traslado' then -cantidad else 0 end as d
      from retail.movimientos
    union all
    select variante_id, ubicacion_destino_id, sububicacion_destino_id, cantidad from retail.movimientos where tipo = 'traslado'
  ), libro as (
    select variante_id, ubicacion_id, sububicacion_id, sum(d) as esperado from efecto group by 1, 2, 3
  )
  select count(*) filter (where coalesce(l.esperado, 0) <> coalesce(s.cantidad, 0))
    from libro l full join retail.stock s
      on s.variante_id = l.variante_id and s.ubicacion_id = l.ubicacion_id and s.sububicacion_id is not distinct from l.sububicacion_id
$f$;

-- ---- 2. Candado: solo se borra lo que es de prueba y solo lo que este script entiende ----
do $$
declare
  r record; v_n bigint; v_txt text; v_malas text := ''; v_patron text; v_pedidas int;
begin
  if (select count(*) from zz_prod) <> 1 then
    raise exception '[purga] No encuentro exactamente un producto con código «%».', current_setting('cayla_purga.producto');
  end if;
  if retail.fn_producto_es_pieza_del_sistema((select id from zz_prod)) then
    raise exception '[purga] «%» es la pieza «Monto manual» del punto de venta: no se purga nunca.', current_setting('cayla_purga.producto');
  end if;
  foreach v_txt in array array['ventas', 'separaciones', 'compras', 'traslados', 'proformas'] loop
    v_pedidas := cardinality(pg_temp.lista(v_txt));
    execute format('select count(*) from %I', case v_txt
      when 'ventas' then 'zz_venta' when 'separaciones' then 'zz_sep' when 'compras' then 'zz_compra'
      when 'traslados' then 'zz_traslado' else 'zz_proforma' end) into v_n;
    if v_n <> v_pedidas then
      raise exception '[purga] Pedí % % y encontré %. Revisa los ids.', v_pedidas,
        case v_txt when 'ventas' then 'venta(s)' when 'separaciones' then 'separación(es)' when 'compras' then 'compra(s)'
          when 'traslados' then 'traslado(s)' else 'proforma(s)' end, v_n;
    end if;
  end loop;

  -- El libro tiene que cuadrar ANTES: si ya no cuadraba, esta purga ni lo empeora ni lo arregla.
  if pg_temp.libro_descuadra() > 0 then
    v_malas := v_malas || format(E'\n  · el stock ya NO cuadraba con los movimientos antes de empezar (%s filas): eso se arregla primero', pg_temp.libro_descuadra());
  end if;

  -- (a) LA LÍNEA ROJA. Un comprobante que llegó a SUNAT en producción no se borra jamás: se aborta aquí mismo.
  select count(*), string_agg(serie || '-' || numero, ', ' order by serie, numero) into v_n, v_txt
    from zz_comp where entorno_transmision = 'produccion';
  if v_n > 0 then
    raise exception '[purga] NO SE BORRA NADA: % comprobante(s) de esos documentos llegaron a SUNAT en producción (%). Eso no se borra nunca, ni con un script.', v_n, v_txt;
  end if;
  -- Lo demás, solo si es una nota interna, si fue al entorno de pruebas de SUNAT o si nunca salió de la base. El
  -- `coalesce` no es adorno: sin entorno, `entorno = 'sandbox'` da NULL, y `not (… or NULL or …)` también: la boleta que
  -- ya intentó salir se colaba sin contarse (lo cazó la prueba).
  -- `no_emitido` es su propia rama, sin exigir cero intentos: es el estado al que `anular_venta` manda un comprobante
  -- que ya venía reintentando (ADR-0224, 2026-09-29) — y `fn_tomar_comprobantes_para_reintento` nunca vuelve a tomar
  -- ni un `no_emitido` ni el de una venta `anulada`: no es que «nunca salió», es que ya se decidió que no va a salir.
  select count(*), string_agg(c.serie || '-' || c.numero || ' (' || c.estado || ')', ', ' order by c.serie, c.numero) into v_n, v_txt
    from comprobantes c join zz_comp z on z.id = c.id
   where not coalesce(
         (c.tipo = 'nota_venta' and c.estado = 'interna' and c.enviado_at is null and c.respuesta_sunat is null)
      or c.entorno_transmision is not distinct from 'sandbox'
      or (c.entorno_transmision is null and c.estado = 'no_emitido' and c.enviado_at is null and c.respuesta_sunat is null
          and c.anulacion_solicitada_at is null)
      or (c.entorno_transmision is null and c.estado = 'pendiente' and c.enviado_at is null and c.respuesta_sunat is null
          and coalesce(c.intentos_transmision, 0) = 0 and c.ultimo_intento_transmision_at is null and c.anulacion_solicitada_at is null),
       false);
  if v_n > 0 then v_malas := v_malas || format(E'\n  · %s comprobante(s) ya intentaron salir a SUNAT sin decir a qué entorno (%s): se revisa con el PSE antes de borrar', v_n, v_txt); end if;
  -- Uno pendiente que el envío automático acaba de tomar (su reserva vence en el futuro): se espera a que la suelte.
  -- Solo si SIGUE en un estado que ese envío vuelve a mirar (`pendiente`/`pendiente_reintento`): un `no_emitido` (p. ej.
  -- por `anular_venta`) puede arrastrar una reserva vieja en `proximo_reintento_at` que ya no significa nada —
  -- `fn_tomar_comprobantes_para_reintento` nunca lo vuelve a tomar.
  select count(*), string_agg(c.serie || '-' || c.numero, ', ') into v_n, v_txt
    from comprobantes c join zz_comp z on z.id = c.id
   where c.entorno_transmision is null and c.estado in ('pendiente', 'pendiente_reintento') and c.proximo_reintento_at > now();
  if v_n > 0 then v_malas := v_malas || format(E'\n  · %s comprobante(s) se están enviando a SUNAT justo ahora (%s): espera 5 minutos y vuelve a ensayar', v_n, v_txt); end if;

  -- (b) El producto solo puede estar en los documentos que nombraste. Si está en otro, se dice cuál (con su id).
  select count(*), string_agg(distinct vi.venta_id::text, ',') into v_n, v_txt
    from venta_items vi where vi.variante_id in (select id from zz_var) and vi.venta_id not in (select id from zz_venta);
  if v_n > 0 then v_malas := v_malas || format(E'\n  · el producto aparece en %s línea(s) de OTRAS ventas que no pediste borrar: %s', v_n, v_txt); end if;
  select count(*), string_agg(s.codigo || ' ' || s.id, ', ') into v_n, v_txt
    from separaciones s
   where s.id not in (select id from zz_sep)
     and (exists (select 1 from separacion_items x where x.separacion_id = s.id and x.variante_id in (select id from zz_var))
       or exists (select 1 from apartados x where x.separacion_id = s.id and x.variante_id in (select id from zz_var)));
  if v_n > 0 then v_malas := v_malas || format(E'\n  · el producto está en %s separación(es) que no pediste borrar (cayla_purga.separaciones): %s', v_n, v_txt); end if;
  select count(*), string_agg(coalesce(c.serie, '') || '-' || coalesce(c.numero, '') || ' ' || c.id, ', ') into v_n, v_txt
    from compras c
   where c.id not in (select id from zz_compra)
     and exists (select 1 from compra_items x where x.compra_id = c.id
                  and (x.variante_id in (select id from zz_var) or x.producto_id in (select id from zz_prod)));
  if v_n > 0 then v_malas := v_malas || format(E'\n  · el producto está en %s compra(s) que no pediste borrar (cayla_purga.compras): %s', v_n, v_txt); end if;
  select count(*), string_agg(tr.id::text, ', ') into v_n, v_txt
    from transferencias tr
   where tr.id not in (select id from zz_traslado)
     and exists (select 1 from transferencia_items x where x.transferencia_id = tr.id and x.variante_id in (select id from zz_var));
  if v_n > 0 then v_malas := v_malas || format(E'\n  · el producto está en %s traslado(s) que no pediste borrar (cayla_purga.traslados): %s', v_n, v_txt); end if;
  -- Las proformas no tienen llave foránea a variantes (van en un jsonb): el candado (g), por texto, las encuentra
  -- igual, pero acá se avisa con su número en vez de un id suelto.
  select count(*), string_agg('#' || p.numero, ', ' order by p.numero) into v_n, v_txt
    from proformas p
   where p.id not in (select id from zz_proforma)
     and exists (select 1 from jsonb_array_elements(p.items) i where nullif(i ->> 'variante_id', '')::uuid in (select id from zz_var));
  if v_n > 0 then v_malas := v_malas || format(E'\n  · el producto está en %s proforma(s) que no pediste borrar (cayla_purga.proformas): %s', v_n, v_txt); end if;

  -- (c) Cada documento nombrado tiene que tocar el producto: un id equivocado no se lleva una venta real.
  select count(*), string_agg(v.id::text, ', ') into v_n, v_txt from zz_venta v
   where not exists (select 1 from zz_item i where i.venta_id = v.id and i.variante_id in (select id from zz_var));
  if v_n > 0 then v_malas := v_malas || format(E'\n  · %s venta(s) nombrada(s) no tienen este producto (¿id equivocado?): %s', v_n, v_txt); end if;
  select count(*), string_agg(s.codigo, ', ') into v_n, v_txt from zz_sep s
   where not exists (select 1 from separacion_items i where i.separacion_id = s.id and i.variante_id in (select id from zz_var));
  if v_n > 0 then v_malas := v_malas || format(E'\n  · %s separación(es) nombrada(s) no tienen este producto (¿id equivocado?): %s', v_n, v_txt); end if;
  select count(*), string_agg(coalesce(c.serie, '') || '-' || coalesce(c.numero, ''), ', ') into v_n, v_txt from zz_compra c
   where not exists (select 1 from zz_compra_item i where i.compra_id = c.id
                      and (i.variante_id in (select id from zz_var) or i.producto_id in (select id from zz_prod)));
  if v_n > 0 then v_malas := v_malas || format(E'\n  · %s compra(s) nombrada(s) no tienen este producto (¿id equivocado?): %s', v_n, v_txt); end if;
  select count(*), string_agg(t.id::text, ', ') into v_n, v_txt from zz_traslado t
   where not exists (select 1 from zz_traslado_item i where i.transferencia_id = t.id and i.variante_id in (select id from zz_var));
  if v_n > 0 then v_malas := v_malas || format(E'\n  · %s traslado(s) nombrado(s) no tienen este producto (¿id equivocado?): %s', v_n, v_txt); end if;
  select count(*), string_agg('#' || p.numero, ', ') into v_n, v_txt from zz_proforma z join proformas p on p.id = z.id
   where not exists (select 1 from jsonb_array_elements(p.items) i where nullif(i ->> 'variante_id', '')::uuid in (select id from zz_var));
  if v_n > 0 then v_malas := v_malas || format(E'\n  · %s proforma(s) nombrada(s) no tienen este producto (¿id equivocado?): %s', v_n, v_txt); end if;
  -- Una proforma que ya se convirtió en venta se resuelve nombrando la venta (zz_venta), no la proforma: la venta es
  -- lo real; la proforma que la originó es solo su borrador.
  select count(*), string_agg('#' || p.numero, ', ') into v_n, v_txt from zz_proforma z join proformas p on p.id = z.id
   where p.venta_id is not null or p.comprobante_id is not null;
  if v_n > 0 then v_malas := v_malas || format(E'\n  · %s proforma(s) nombrada(s) ya tienen una venta o un comprobante encima: nómbralo a él, no a la proforma: %s', v_n, v_txt); end if;

  -- (d) Una separación, una compra, un traslado o una proforma se borran ENTEROS: no pueden traer prendas de otros
  -- productos (habría que reescribirlos). Una venta sí puede: lo que sacó de otras prendas vuelve a su stock (e).
  select (select count(*) from separacion_items x where x.separacion_id in (select id from zz_sep) and x.variante_id not in (select id from zz_var))
       + (select count(*) from apartados x where x.separacion_id in (select id from zz_sep) and x.variante_id not in (select id from zz_var))
    into v_n;
  if v_n > 0 then v_malas := v_malas || format(E'\n  · esas separaciones también apartan %s prenda(s) de otros productos: se resuelve a mano', v_n); end if;
  select count(*) into v_n from zz_compra_item x
   where not (x.variante_id in (select id from zz_var) or (x.variante_id is null and x.producto_id in (select id from zz_prod)));
  if v_n > 0 then v_malas := v_malas || format(E'\n  · esas compras también traen %s línea(s) de otros productos: se resuelve a mano', v_n); end if;
  select count(*) into v_n from movimientos m
   where m.lote_id in (select id from zz_borrar where tabla = 'lotes') and m.id not in (select id from zz_mov);
  if v_n > 0 then v_malas := v_malas || format(E'\n  · el ingreso del proveedor también trajo %s movimiento(s) de otras prendas: se resuelve a mano', v_n); end if;
  -- El efectivo de una separación entró a una caja con su propio movimiento de caja: esa caja no se reescribe.
  select count(*) into v_n from separacion_pagos x where x.separacion_id in (select id from zz_sep) and x.caja_movimiento_id is not null;
  if v_n > 0 then v_malas := v_malas || format(E'\n  · %s pago(s) de esas separaciones entraron en efectivo a una caja: se resuelve a mano', v_n); end if;
  select count(*) into v_n from zz_traslado_item x where x.variante_id not in (select id from zz_var);
  if v_n > 0 then v_malas := v_malas || format(E'\n  · esos traslados también llevan %s prenda(s) de otros productos: se resuelve a mano', v_n); end if;
  -- Lo que se recibió puede traer una «sustitución» (una prenda que nunca se envió, sin fila en transferencia_items):
  -- si esa prenda sustituida sigue siendo un producto real que existe, no se borra sin nombrarlo; si ya no existe
  -- (huérfana de otra purga anterior), no hay nada real que proteger y no frena.
  select count(*) into v_n from zz_traslado_recep x
   where x.variante_id not in (select id from zz_var) and exists (select 1 from variantes v where v.id = x.variante_id);
  if v_n > 0 then v_malas := v_malas || format(E'\n  · esos traslados recibieron %s prenda(s) sustituidas de otro producto real: se resuelve a mano', v_n); end if;
  -- Una línea de proforma que apunta a una variante de OTRO producto que sigue existiendo sí frena (es un producto
  -- real, no se lleva sin nombrarlo); una que apunta a una variante que ya no existe (huérfana de otra purga) no —
  -- ahí no queda nada real que proteger, y esa proforma nunca podría nombrar algo que ya no se puede nombrar.
  select count(*), string_agg(distinct '#' || z.numero || ' → ' || (i ->> 'codigo'), ', ') into v_n, v_txt
    from zz_proforma z join proformas p on p.id = z.id, jsonb_array_elements(p.items) i
    join variantes v on v.id = nullif(i ->> 'variante_id', '')::uuid
   where v.id not in (select id from zz_var);
  if v_n > 0 then v_malas := v_malas || format(E'\n  · esas proformas también citan %s línea(s) de otro producto real: %s', v_n, v_txt); end if;

  -- (e) Los movimientos: solo los que nacen de lo que se borra. Una devolución, un cambio o una
  -- producción son historia con otros dueños.
  select count(*) into v_n from zz_mov m
   where m.devolucion_item_id is not null or m.cambio_id is not null or m.produccion_id is not null
      or (m.transferencia_item_id is not null and m.transferencia_item_id not in (select id from zz_traslado_item))
      or (m.transferencia_recepcion_id is not null and m.transferencia_recepcion_id not in (select id from zz_traslado_recep))
      or (m.venta_item_id is not null and m.venta_item_id not in (select id from zz_item))
      or (m.compra_item_id is not null and m.compra_item_id not in (select id from zz_compra_item));
  if v_n > 0 then v_malas := v_malas || format(E'\n  · %s movimiento(s) del producto vienen de un traslado entre sedes, una devolución, un cambio, una producción o un documento que no nombraste', v_n); end if;
  -- Las prendas de otros productos que esas ventas sacaron: cada línea tiene que ser una salida por venta de la misma
  -- cantidad (para poder devolverla sin adivinar), o esa misma salida ya anulada por línea (`anular_venta`: su entrada
  -- de reversa ya devolvió el stock — zz_restaura la neteará más abajo, así la purga no la devuelve dos veces).
  select count(*) into v_n from zz_mov m join zz_item i on i.id = m.venta_item_id
   where m.variante_id not in (select id from zz_var)
     and not (m.tipo = 'salida' and m.variante_id = i.variante_id and m.cantidad = i.cantidad and m.ubicacion_destino_id is null)
     and not (m.tipo = 'entrada' and m.motivo = 'anulacion_venta' and m.variante_id = i.variante_id and m.cantidad = i.cantidad);
  if v_n > 0 then v_malas := v_malas || format(E'\n  · %s movimiento(s) de otras prendas de esas ventas no son una salida simple de la cantidad vendida', v_n); end if;
  select count(*) into v_n from (
    select m.variante_id, m.ubicacion_id, m.sububicacion_id from zz_mov m
     where m.venta_item_id is not null and m.variante_id not in (select id from zz_var) group by 1, 2, 3) g
   where not exists (select 1 from stock s where s.variante_id = g.variante_id and s.ubicacion_id = g.ubicacion_id
                       and s.sububicacion_id is not distinct from g.sububicacion_id);
  if v_n > 0 then v_malas := v_malas || format(E'\n  · %s fila(s) de stock donde hay que devolver prendas ya no existen', v_n); end if;

  -- (f) Quién más cita lo que se borra, por llave foránea, en CUALQUIER tabla de retail (también las que nazcan mañana):
  -- devoluciones, anulaciones, cambios, traslados, pagos de compra, notas de crédito, movimientos de caja, proformas…
  -- Las filas que también se borran no cuentan.
  for r in
    select cl.relname as tabla, a.attname as col, rf.relname as destino
      from pg_constraint c
      join pg_class cl on cl.oid = c.conrelid join pg_namespace n on n.oid = cl.relnamespace
      join pg_class rf on rf.oid = c.confrelid
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype = 'f' and n.nspname = 'retail' and array_length(c.conkey, 1) = 1
       and rf.relnamespace = 'retail'::regnamespace and rf.relname in (select distinct tabla from zz_borrar)
  loop
    execute format('select count(*) from retail.%I o where o.%I in (select id from zz_borrar where tabla = %L)%s',
                   r.tabla, r.col, r.destino, pg_temp.fuera_de_la_lista(r.tabla, 'o')) into v_n;
    if v_n > 0 then v_malas := v_malas || format(E'\n  · %s fila(s) de %s citan a %s que se borrarían', v_n, r.tabla, r.destino); end if;
  end loop;

  -- (g) Menciones SIN llave foránea (un id escrito en un jsonb, una cola, un registro suelto): la base no las frenaría,
  -- así que se buscan por id en TODAS las tablas de retail. `actividad` e `historial_producto_cambios` son inmutables e
  -- inertes: no frenan (el historial se avisa).
  select string_agg(id::text, '|') into v_patron from zz_borrar;
  for r in
    select cl.relname as tabla from pg_class cl join pg_namespace n on n.oid = cl.relnamespace
     where n.nspname = 'retail' and cl.relkind = 'r' and cl.relname <> all (array['actividad', 'historial_producto_cambios'])
  loop
    execute format('select count(*) from retail.%I t where to_jsonb(t)::text ~ %L%s', r.tabla, v_patron, pg_temp.fuera_de_la_lista(r.tabla, 't')) into v_n;
    if v_n > 0 then v_malas := v_malas || format(E'\n  · %s fila(s) de %s mencionan lo que se borraría (sin llave foránea): decide a mano qué hacer con ellas', v_n, r.tabla); end if;
  end loop;
  select count(*) into v_n from historial_producto_cambios where entidad_id in (select id from zz_prod union all select id from zz_var);
  if v_n > 0 then raise notice '[purga] AVISO: % fila(s) de historial_producto_cambios quedarán apuntando a un producto que ya no existe (es inmutable e inerte).', v_n; end if;

  if v_malas <> '' then
    raise exception E'[purga] NO SE BORRA NADA. Lo que impide la purga (resuélvelo primero):%', v_malas;
  end if;
end $$;

-- ---- 3. Respaldo: cada fila, tal cual, antes de tocarla ----
create temp table zz_purga on commit drop as
  select 'purga ' || (select codigo from zz_prod) || ' ' || to_char(now() at time zone 'America/Lima', 'YYYY-MM-DD HH24:MI') as nombre;

-- El stock de las OTRAS prendas que hay que devolver, con su cantidad de antes (para comprobar y para volver atrás).
-- Neto de salida menos su entrada de reversa si esa línea ya se anuló (`anular_venta`): esa entrada ya devolvió el
-- stock ANTES de que corriera la purga (zz_restaura.antes ya la incluye), así que sumarla de nuevo lo devolvería dos veces.
create temp table zz_restaura on commit drop as
  select m.variante_id, m.ubicacion_id, m.sububicacion_id,
         sum(case when m.tipo = 'entrada' then -m.cantidad else m.cantidad end)::int as q,
         (select s.cantidad from stock s where s.variante_id = m.variante_id and s.ubicacion_id = m.ubicacion_id
             and s.sububicacion_id is not distinct from m.sububicacion_id) as antes,
         (select s.cantidad_apartada from stock s where s.variante_id = m.variante_id and s.ubicacion_id = m.ubicacion_id
             and s.sububicacion_id is not distinct from m.sububicacion_id) as apartada_antes
    from zz_mov m where m.venta_item_id is not null and m.variante_id not in (select id from zz_var)
   group by m.variante_id, m.ubicacion_id, m.sububicacion_id
  having sum(case when m.tipo = 'entrada' then -m.cantidad else m.cantidad end) <> 0;

do $$
declare r record; v_nombre text := (select nombre from zz_purga);
begin
  for r in select distinct tabla from zz_borrar loop
    execute format('insert into respaldo_purgas.filas (purga, tabla, fila) select %L, %L, to_jsonb(t) from retail.%I t where t.id in (select id from zz_borrar where tabla = %L)',
                   v_nombre, r.tabla, r.tabla, r.tabla);
  end loop;
  for r in select * from zz_hoja loop
    execute format('insert into respaldo_purgas.filas (purga, tabla, fila) select %L, %L, to_jsonb(t) from retail.%I t where t.%I in (select id from zz_borrar where tabla = %L)',
                   v_nombre, r.tabla, r.tabla, r.columna, r.padre);
  end loop;
  insert into respaldo_purgas.filas (purga, tabla, fila)
    select v_nombre, 'stock_antes', to_jsonb(t) from zz_restaura t
    union all
    select v_nombre, 'series_comprobantes', to_jsonb(s) from series_comprobantes s
     where (s.tipo, s.serie, s.ubicacion_id) in (select tipo, serie, ubicacion_id from zz_comp);
end $$;

-- ---- 4. Borrado, de hijos a padres ----
-- Los candados de historial de lo que se borra: se anota su modo, se apagan SOLO dentro de esta transacción (DDL
-- transaccional: si algo falla, vuelven solos) y al final vuelven a ese mismo modo. `movimientos` primero, como en ADR-0252.
create temp table zz_candado (orden int primary key, tabla text not null, disparador text not null, modo "char") on commit drop;
insert into zz_candado (orden, tabla, disparador) values
  (1, 'movimientos', 'movimientos_inmutables'),
  (2, 'bajada_piso_items', 'bajada_piso_items_inmutables'),
  (3, 'movimientos_internos_intentos', 'movimientos_internos_intentos_inmutables'),
  (4, 'costo_historial', 'costo_historial_sin_update'),
  (5, 'compra_reasignaciones', 'compra_reasignaciones_inmutables'),
  (6, 'compra_item_cierres', 'compra_item_cierres_inmutables'),
  (7, 'frescura_decisiones', 'frescura_decisiones_inmutable');
do $$
declare r record; v_modo "char";
begin
  for r in select * from zz_candado order by orden loop
    select t.tgenabled into v_modo from pg_trigger t where t.tgrelid = ('retail.' || r.tabla)::regclass and t.tgname = r.disparador;
    if v_modo is null then
      raise exception '[purga] Falta el candado de historial % en retail.%: no se borra nada hasta revisar la base.', r.disparador, r.tabla;
    end if;
    update zz_candado set modo = v_modo where orden = r.orden;
    execute format('alter table retail.%I disable trigger %I', r.tabla, r.disparador);
  end loop;
end $$;

-- 4a. Las ventas nunca ocurrieron: lo que sacaron de otras prendas vuelve a su fila de stock (la misma sububicación).
update stock s set cantidad = s.cantidad + r.q, updated_at = now()
  from zz_restaura r
 where s.variante_id = r.variante_id and s.ubicacion_id = r.ubicacion_id and s.sububicacion_id is not distinct from r.sububicacion_id;

-- 4b. De hijos a padres.
delete from bajada_piso_items where movimiento_id in (select id from zz_borrar where tabla = 'movimientos');
delete from movimientos_internos_intentos where movimiento_id in (select id from zz_borrar where tabla = 'movimientos');
delete from separacion_items where id in (select id from zz_borrar where tabla = 'separacion_items');
delete from apartados where id in (select id from zz_borrar where tabla = 'apartados');
delete from separacion_pagos where id in (select id from zz_borrar where tabla = 'separacion_pagos');
delete from costo_historial where id in (select id from zz_borrar where tabla = 'costo_historial');
delete from compra_item_destinos where compra_item_id in (select id from zz_borrar where tabla = 'compra_items');
delete from compra_reasignaciones where id in (select id from zz_borrar where tabla = 'compra_reasignaciones');
delete from compra_item_cierres where id in (select id from zz_borrar where tabla = 'compra_item_cierres');
delete from proformas where id in (select id from zz_borrar where tabla = 'proformas');
-- Una línea de conteo y su ajuste se citan entre sí, y lo mismo un traslado con su movimiento de envío/recepción
-- (`transferencia_items.movimiento_id` ↔ `movimientos.transferencia_item_id`, y su espejo con las recepciones):
-- todo va en UNA sentencia (las llaves se revisan al final de ella).
with lineas as (delete from conteo_items where id in (select id from zz_borrar where tabla = 'conteo_items') returning 1),
     recep as (delete from transferencia_recepciones where id in (select id from zz_borrar where tabla = 'transferencia_recepciones') returning 1),
     titems as (delete from transferencia_items where id in (select id from zz_borrar where tabla = 'transferencia_items') returning 1)
delete from movimientos where id in (select id from zz_borrar where tabla = 'movimientos');
delete from transferencias where id in (select id from zz_borrar where tabla = 'transferencias');
delete from lotes where id in (select id from zz_borrar where tabla = 'lotes');
delete from envios where id in (select id from zz_borrar where tabla = 'envios');
delete from compra_items where id in (select id from zz_borrar where tabla = 'compra_items');
delete from compras where id in (select id from zz_borrar where tabla = 'compras');
delete from comprobante_anticipos where comprobante_id in (select id from zz_borrar where tabla = 'comprobantes');
-- Una separación y su boleta de anticipo se citan entre sí (separaciones.comprobante_anticipo_id ↔ comprobantes.separacion_id).
with boletas as (delete from comprobantes where id in (select id from zz_borrar where tabla = 'comprobantes') returning 1)
delete from separaciones where id in (select id from zz_borrar where tabla = 'separaciones');
delete from venta_anulacion_items where venta_id in (select id from zz_borrar where tabla = 'ventas');
delete from venta_pagos where id in (select id from zz_borrar where tabla = 'venta_pagos');
delete from venta_items where id in (select id from zz_borrar where tabla = 'venta_items');
delete from ventas where id in (select id from zz_borrar where tabla = 'ventas');
delete from pedidos_no_atendidos where id in (select id from zz_borrar where tabla = 'pedidos_no_atendidos');
delete from frescura_decisiones where producto_id in (select id from zz_prod);
delete from stock where variante_id in (select id from zz_var);
delete from codigos_barras where id in (select id from zz_borrar where tabla = 'codigos_barras');
delete from variante_etiquetas where variante_id in (select id from zz_var);
delete from producto_fotos where id in (select id from zz_borrar where tabla = 'producto_fotos');
delete from producto_color_temporadas where producto_id in (select id from zz_prod);
delete from producto_origen where producto_id in (select id from zz_prod);
delete from variantes where id in (select id from zz_var);
delete from productos where id in (select id from zz_prod);

-- 4c. Cada candado vuelve al modo en que estaba. ALWAYS, no `enable trigger` a secas: ese lo deja en modo normal y el
-- candado de movimientos dejaría de valer en modo réplica (D-22).
do $$
declare r record;
begin
  for r in select * from zz_candado order by orden loop
    execute format('alter table retail.%I enable %s trigger %I', r.tabla,
                   case r.modo when 'A' then 'always' when 'R' then 'replica' else '' end, r.disparador);
    if r.modo = 'D' then execute format('alter table retail.%I disable trigger %I', r.tabla, r.disparador); end if;
  end loop;
end $$;

-- 4d. La serie de NOTAS DE VENTA vuelve a su número SOLO si lo borrado era el final de la serie (nada quedó con número ≥).
-- Las series de SUNAT no se tocan: ese número pudo llegar a SUNAT o al PSE y no se vuelve a emitir. La serie es la de la
-- sede del comprobante (dos sedes pueden llamar igual a su serie).
update series_comprobantes s set siguiente_numero = z.minimo
  from (select tipo, serie, ubicacion_id, min(numero) as minimo from zz_comp where tipo = 'nota_venta' group by 1, 2, 3) z
 where s.tipo = z.tipo and s.serie = z.serie and s.ubicacion_id = z.ubicacion_id and s.siguiente_numero > z.minimo
   and not exists (select 1 from comprobantes c where c.tipo = z.tipo and c.serie = z.serie and c.numero >= z.minimo);

-- 4e. El rastro. Actividad es inmutable: lo que ya decía se queda, y estas líneas cuentan qué le pasó (una por documento
-- y una por el producto). En el historial del producto, la misma fila que deja «Eliminar con su historia» (ADR-0252).
insert into actividad (ocurrio_at, modulo, accion, descripcion, ubicacion_id, tabla, registro_id, detalle, origen)
  select now(), x.modulo, 'prueba_deshecha', x.descripcion, x.ubicacion_id, x.tabla, x.registro_id,
         jsonb_build_object('purga', (select nombre from zz_purga), 'producto', (select codigo from zz_prod)), 'vivo'
    from (select 'vender' as modulo, v.ubicacion_id, 'ventas' as tabla, v.id::text as registro_id,
                 'se deshizo la venta de prueba ' || coalesce(
                   (select string_agg(r.fila ->> 'serie' || '-' || lpad(r.fila ->> 'numero', 6, '0'), ', ' order by r.fila ->> 'serie', (r.fila ->> 'numero')::int)
                      from respaldo_purgas.filas r
                     where r.purga = (select nombre from zz_purga) and r.tabla = 'comprobantes' and (r.fila ->> 'venta_id')::uuid = v.id),
                   'sin comprobante') || ' (purga del producto ' || (select codigo from zz_prod) || ')' as descripcion
            from zz_venta v
          union all
          select 'apartados', s.ubicacion_id, 'separaciones', s.id::text,
                 'se deshizo la separación de prueba ' || s.codigo || ' (purga del producto ' || (select codigo from zz_prod) || ')'
            from zz_sep s
          union all
          select 'facturas_compra', null::uuid, 'compras', c.id::text,
                 'se deshizo la compra de prueba ' || coalesce(c.serie, '') || '-' || coalesce(c.numero, '') || ' (purga del producto ' || (select codigo from zz_prod) || ')'
            from zz_compra c
          union all
          select 'traslados', tr.ubicacion_origen_id, 'transferencias', tr.id::text,
                 'se deshizo el traslado de prueba (purga del producto ' || (select codigo from zz_prod) || ')'
            from zz_traslado tr
          union all
          select 'vender', null::uuid, 'proformas', p.id::text,
                 'se deshizo la proforma de prueba #' || p.numero || ' (purga del producto ' || (select codigo from zz_prod) || ')'
            from zz_proforma z join proformas p on p.id = z.id
          union all
          select 'productos', null::uuid, 'productos', p.id::text,
                 'se eliminó el producto de prueba ' || p.codigo || ' (' || p.referencia || ') con toda su historia: '
                   || (select count(*) from zz_borrar where tabla = 'movimientos') || ' movimientos, '
                   || (select count(*) from zz_venta) || ' venta(s), ' || (select count(*) from zz_sep) || ' separación(es), '
                   || (select count(*) from zz_compra) || ' compra(s), ' || (select count(*) from zz_traslado) || ' traslado(s) y '
                   || (select count(*) from zz_proforma) || ' proforma(s)'
            from zz_prod p) x;

insert into historial_producto_cambios (entidad, entidad_id, campo, valor_anterior, valor_nuevo, usuario_id)
  select 'producto', p.id, 'eliminado', p.referencia || ' · ' || p.codigo,
         'purga por script (ADR-0224) · respaldo «' || (select nombre from zz_purga) || '»', null
    from zz_prod p;

-- ---- 5. Demostración: si algo de esto falla, la transacción entera se deshace ----
-- Las revisiones diferidas (el reparto de una compra entre tiendas) corren AHORA y no al confirmar: así el ensayo, que
-- nunca confirma, también las ve.
set constraints all immediate;

create temp table zz_resumen on commit drop as
  select 1 as orden, 'productos' as concepto, 1::bigint as n
  union all select 2, 'variantes', (select count(*) from zz_var)
  union all select 3, 'movimientos', (select count(*) from zz_borrar where tabla = 'movimientos')
  union all select 4, 'ventas', (select count(*) from zz_venta)
  union all select 5, 'líneas de venta', (select count(*) from zz_item)
  union all select 6, 'pagos', (select count(*) from zz_borrar where tabla = 'venta_pagos')
  union all select 7, 'comprobantes', (select count(*) from zz_comp)
  union all select 8, 'prendas devueltas a stock (en ' || (select count(*) from zz_restaura) || ' filas)', (select coalesce(sum(q), 0) from zz_restaura)
  -- Desde aquí, solo lo que haya.
  union all select 9, 'notas de venta internas', (select count(*) from zz_comp where tipo = 'nota_venta')
  union all select 10, 'comprobantes del entorno de pruebas de SUNAT', (select count(*) from zz_comp where entorno_transmision = 'sandbox')
  union all select 11, 'comprobantes que nunca se enviaron', (select count(*) from zz_comp where tipo <> 'nota_venta' and entorno_transmision is null)
  union all select 12, 'separaciones', (select count(*) from zz_sep)
  union all select 13, 'pagos de separación', (select count(*) from zz_borrar where tabla = 'separacion_pagos')
  union all select 14, 'apartados', (select count(*) from zz_borrar where tabla = 'apartados')
  union all select 15, 'compras', (select count(*) from zz_compra)
  union all select 16, 'ingresos de proveedor (lotes)', (select count(*) from zz_borrar where tabla = 'lotes')
  union all select 17, 'envíos', (select count(*) from zz_borrar where tabla = 'envios')
  union all select 18, 'costos registrados', (select count(*) from zz_borrar where tabla = 'costo_historial')
  union all select 19, 'líneas de conteo', (select count(*) from zz_borrar where tabla = 'conteo_items')
  union all select 20, 'líneas de bajada al piso', (select count(*) from respaldo_purgas.filas where purga = (select nombre from zz_purga) and tabla = 'bajada_piso_items')
  union all select 21, 'pedidos no atendidos', (select count(*) from zz_borrar where tabla = 'pedidos_no_atendidos')
  union all select 22, 'traslados', (select count(*) from zz_traslado)
  union all select 23, 'proformas', (select count(*) from zz_proforma)
  union all select 24, 'decisiones de Frescura', (select count(*) from respaldo_purgas.filas where purga = (select nombre from zz_purga) and tabla = 'frescura_decisiones');

do $$
declare r record; v_n bigint; v_resumen text; v_libro bigint;
begin
  -- 5a. Nada de lo borrado sigue vivo (ni por id ni como hoja de su padre).
  for r in select distinct tabla from zz_borrar loop
    execute format('select count(*) from retail.%I where id in (select id from zz_borrar where tabla = %L)', r.tabla, r.tabla) into v_n;
    if v_n > 0 then raise exception '[purga] Quedaron % fila(s) de % que debían haberse borrado', v_n, r.tabla; end if;
  end loop;
  for r in select * from zz_hoja loop
    execute format('select count(*) from retail.%I where %I in (select id from zz_borrar where tabla = %L)', r.tabla, r.columna, r.padre) into v_n;
    if v_n > 0 then raise exception '[purga] Quedaron % fila(s) de % que debían haberse borrado', v_n, r.tabla; end if;
  end loop;

  -- 5b. El stock devuelto es exacto (antes + lo vendido) y lo apartado no se movió.
  select count(*) into v_n from zz_restaura z join stock s
    on s.variante_id = z.variante_id and s.ubicacion_id = z.ubicacion_id and s.sububicacion_id is not distinct from z.sububicacion_id
   where s.cantidad <> z.antes + z.q or s.cantidad_apartada is distinct from z.apartada_antes;
  if v_n > 0 then raise exception '[purga] El stock devuelto no coincide en % fila(s)', v_n; end if;

  -- 5c. El libro vuelve a cuadrar con el stock en TODA la base.
  v_libro := pg_temp.libro_descuadra();
  if v_libro <> 0 then raise exception '[purga] Después de purgar, % fila(s) de stock no cuadran con los movimientos', v_libro; end if;

  -- 5d. Cada candado volvió a su modo, y los dos de movimientos están en ALWAYS.
  select count(*) into v_n from zz_candado c join pg_trigger t on t.tgrelid = ('retail.' || c.tabla)::regclass and t.tgname = c.disparador
   where t.tgenabled is distinct from c.modo;
  if v_n > 0 then raise exception '[purga] % candado(s) de historial no volvieron a su modo', v_n; end if;
  select count(*) into v_n from pg_trigger
   where tgrelid = 'retail.movimientos'::regclass and tgname in ('movimientos_inmutables', 'movimientos_sin_truncate') and tgenabled <> 'A';
  if v_n > 0 then raise exception '[purga] % candado(s) de movimientos no quedaron en ALWAYS', v_n; end if;

  -- 5e. LA LÍNEA ROJA, comprobada: los comprobantes que llegaron a SUNAT en producción siguen ahí, idénticos.
  select count(*) into v_n from zz_sunat_produccion z
   where not exists (select 1 from comprobantes c where c.id = z.id and md5(to_jsonb(c)::text) = z.huella);
  if v_n > 0 or (select count(*) from comprobantes where entorno_transmision = 'produccion') <> (select count(*) from zz_sunat_produccion) then
    raise exception '[purga] Un comprobante de SUNAT en producción cambió o desapareció: no se guarda nada.';
  end if;

  select string_agg(concepto || ' ' || n, ' · ' order by orden) into v_resumen from zz_resumen where orden <= 8 or n > 0;
  v_resumen := v_resumen || E'\nlibro de movimientos vs stock: 0 filas descuadradas antes y 0 después'
    || E'\ncomprobantes de SUNAT en producción: ' || (select count(*) from zz_sunat_produccion) || ' antes y los mismos después (ninguno se tocó)'
    || E'\nrespaldo: respaldo_purgas.filas, purga «' || (select nombre from zz_purga) || '» (' ||
       (select count(*) from respaldo_purgas.filas where purga = (select nombre from zz_purga)) || ' filas)';

  -- Sin «definitivo», esto es un ENSAYO: la excepción deshace todo, incluido el respaldo, y trae el resumen.
  if coalesce(current_setting('cayla_purga.modo', true), 'ensayo') <> 'definitivo' then
    raise exception E'[purga] ENSAYO OK — no quedó nada escrito. Para la corrida real: cayla_purga.modo = definitivo.\n%', v_resumen;
  end if;
  raise notice E'[purga] HECHO.\n%', v_resumen;
end $$;

commit; -- [[transaccion]]

-- [[resumen-final]]
-- Solo llega aquí en la corrida real: lo que quedó respaldado, por tabla.
select tabla, count(*) as filas_respaldadas
  from respaldo_purgas.filas
 where purga like 'purga ' || current_setting('cayla_purga.producto') || ' %'
 group by tabla order by tabla;
