-- ============================================================================
-- ⚠️ SOLO PARA PEGAR EN EL SQL EDITOR DE PRODUCCIÓN. NO es la migración local.
-- No es parte de la cadena numerada a propósito (mismo motivo que
-- `colaboradores-iniciales-produccion.sql`): el nombre no sigue
-- `<timestamp>_nombre.sql`, así `supabase db reset` local la ignora.
--
-- QUÉ HACE (D-54, `docs/datos/DECISIONES-2026-09-21-menu-comercial.md`). Marca como
-- `es_prueba = true` los datos ficticios de prueba verificados en producción el 2026-09-21
-- por Felipe (dueño): ~14 boletas/ventas pendientes sin transmitir, 3 cajas abiertas, 3
-- conteos anulados, y los productos de prueba con código BLU/PAN/VES — SIN BORRAR NADA.
--
-- REQUISITO: la migración `20260922130000_archivar_datos_de_prueba.sql` (con el prefijo
-- `retail.` agregado, como toda migración al pegarse en producción) tiene que estar YA
-- aplicada — este script llama sus columnas y usa sus mismos criterios. Si se pega antes,
-- `column "es_prueba" does not exist`.
--
-- POR QUÉ NO LLAMA A `retail.archivar_*_prueba(uuid)` (las funciones nuevas de esa
-- migración, pensadas para líder). El SQL Editor de producción corre como `postgres` sin
-- JWT: `auth.uid()` da NULL ahí, así que `fn_es_lider()` SIEMPRE da falso y esas funciones
-- rechazarían la llamada con 42501, la tengas Felipe pegando o no — no es un candado que este
-- script pueda saltarse ni deba: por diseño, sin sesión de app no hay «quién» que auditar.
-- Este script hace el UPDATE directo (mismo patrón que `colaboradores-iniciales-produccion.sql`
-- y `datos-reales-produccion.sql`) — la auditoría acá es el archivo mismo: revisado, con
-- fecha, en el repo, y pegado por una persona con acceso directo a la base (un nivel de
-- confianza mayor al de una llamada RPC, no menor).
--
-- ⚠️ CÓMO USAR ESTE ARCHIVO — EN DOS PASOS, NUNCA A CIEGAS.
--   PASO 1 (secciones «PREVIEW»): correr cada SELECT y MIRAR las filas. Estas listas usan
--   criterios amplios (comprobante pendiente, caja abierta, conteo anulado, prefijo de SKU) que
--   alcanzan para encontrar candidatas, pero NO alcanzan por sí solos para confirmar que una
--   fila es de prueba — ni la fecha ni el prefijo distinguen solos una venta o caja REAL de una
--   ficticia con certeza total, y esto es DINERO. En particular:
--     · Si Tienda TRU (o cualquier sede) ya recibió una venta real antes de correr esto, su
--       comprobante pendiente REAL aparecería en la lista de PASO 1 igual que uno de prueba —
--       por eso el PASO 2 exige IDs uno por uno, nunca "todos los pendientes".
--     · Una caja «abierta» real de un turno en curso en Lima o Arequipa aparecería en la misma
--       lista que las 3 de prueba — cerrarla de golpe le borraría el turno a quien la abrió.
--     · BLU/PAN/VES son también el prefijo de Blusa/Pantalón/Vestido REALES (ver
--       `variantes.sku`, ej. 'BLU-EMMA-NEG-M') — el prefijo NO alcanza para decidir solo.
--   PASO 2 (secciones «APLICAR»): reemplazar cada `<REEMPLAZA-CON-UUID-...>` por el id exacto
--   que Felipe ya verificó el 2026-09-21 (o que confirmó mirando el PASO 1), UNO POR UNO — y
--   solo entonces correr esa sección. Un `<REEMPLAZA-CON-UUID-...>` sin reemplazar hace que
--   Postgres rechace la sentencia (uuid inválido): no hay forma de correr el PASO 2 a medias
--   sin querer.
--
-- VERIFICACIÓN AL FINAL: la última consulta cuenta cuántas filas quedaron `es_prueba = true`
-- en cada tabla — debe dar 14 (o el número real de boletas pendientes de prueba que
-- confirmaste), 3 y 3. Si da menos, algún `<REEMPLAZA-CON-UUID-...>` quedó sin reemplazar (esa
-- sección no corrió); si da más, se marcó algo que no tocaba — revisar antes de seguir.
-- ============================================================================

set search_path = retail, public, extensions;

-- ============================================================================
-- 1. VENTAS/BOLETAS PENDIENTES — PREVIEW
-- ============================================================================
-- Toda venta con un comprobante boleta/factura todavía `pendiente` (nunca transmitido) y no
-- anulada. Trae lo necesario para reconocer a ojo las de prueba: fecha, sede, total, cliente.
select
  v.id as venta_id,
  v.created_at,
  u.nombre as sede,
  v.estado as estado_venta,
  c.serie || '-' || c.numero as comprobante,
  c.total,
  v.token_cliente
from ventas v
join ubicaciones u on u.id = v.ubicacion_id
join comprobantes c on c.venta_id = v.id
where c.estado = 'pendiente'
  and c.tipo in ('boleta', 'factura')
  and v.estado <> 'anulada'
order by v.created_at;

-- ---------------- APLICAR (repetir esta línea una vez por venta, con su id real) ----------------
-- select archivar_venta_prueba('<REEMPLAZA-CON-UUID-VENTA-1>');
-- select archivar_venta_prueba('<REEMPLAZA-CON-UUID-VENTA-2>');
-- -- … las que hagan falta hasta cubrir las ~14 que confirmaste en el PASO 1.
--
-- Nota: archivar la VENTA no cambia el comprobante (`comprobantes.estado` sigue `pendiente`) —
-- a propósito, fuera de alcance de D-54 (ver ADR-0152, «fuera de alcance»). Si Facturación
-- necesita dejar de ofrecer estas boletas para transmitir, es una decisión aparte.

-- ============================================================================
-- 2. CAJAS ABIERTAS — PREVIEW
-- ============================================================================
select
  id as caja_id,
  (select nombre from ubicaciones where id = cajas.ubicacion_id) as sede,
  estado,
  monto_apertura,
  abierta_en,
  abierta_por
from cajas
where estado = 'abierta'
order by abierta_en;

-- ---------------- APLICAR (una vez por caja, con su id real) ----------------
-- `archivar_caja_prueba` la CIERRA primero si sigue abierta (contado = lo esperado, diferencia
-- CERO forzada — un cierre administrativo, no un arqueo) y recién después la marca `es_prueba` —
-- necesario: el índice único
-- `cajas_ubicacion_abierta_unica` no deja abrir la caja REAL de esa sede mientras esta siga
-- abierta. Sin sesión de app, esta llamada SÍ funciona (a diferencia de las de arriba) porque
-- `archivar_caja_prueba` exige líder — y sin JWT eso falla — así que en vez de la función se
-- reproduce su mismo efecto a mano, con la MISMA fórmula que `cerrar_caja`
-- (20260921120000_candado_de_lider_caja_y_ajuste.sql): apertura + ventas en efectivo (no
-- anuladas) + ingresos − egresos − reembolsos en efectivo + diferencia de cambios en efectivo.
--
-- do $$
-- declare
--   v_caja_id uuid := '<REEMPLAZA-CON-UUID-CAJA-1>';
--   v_caja cajas%rowtype;
--   v_sistema numeric;
-- begin
--   select * into v_caja from cajas where id = v_caja_id;
--   select v_caja.monto_apertura
--     + coalesce((select sum(vp.monto) from venta_pagos vp join ventas v on v.id = vp.venta_id
--                 where v.caja_id = v_caja_id and vp.metodo = 'efectivo' and v.estado <> 'anulada'), 0)
--     + coalesce((select sum(monto) from caja_movimientos where caja_id = v_caja_id and tipo = 'ingreso'), 0)
--     - coalesce((select sum(monto) from caja_movimientos where caja_id = v_caja_id and tipo = 'egreso'), 0)
--     - coalesce((select sum(reembolso_monto) from devoluciones
--                 where caja_id = v_caja_id and estado = 'aprobada' and reembolso_metodo = 'efectivo'), 0)
--     + coalesce((select sum(diferencia) from cambios
--                 where caja_id = v_caja_id and metodo_pago_diferencia = 'efectivo'), 0)
--   into v_sistema;
--   update cajas set
--     estado = 'cerrada', monto_cierre_sistema = v_sistema, monto_cierre_real = v_sistema, diferencia = 0,
--     cerrada_en = now(),
--     es_prueba = true,
--     nota = coalesce(nota || ' — ', '') || 'Archivada como dato de prueba (D-54, 2026-09-22).'
--   where id = v_caja_id;
-- end $$;
-- -- Repetir el bloque `do $$ … $$` completo, con el id de cada una de las 3 cajas.

-- ============================================================================
-- 3. CONTEOS ANULADOS — PREVIEW
-- ============================================================================
select
  id as conteo_id,
  (select nombre from ubicaciones where id = conteos.ubicacion_id) as sede,
  estado,
  created_at,
  cerrado_en,
  abierto_por
from conteos
where estado = 'anulado'
order by created_at;

-- ---------------- APLICAR (una vez por conteo, con su id real) ----------------
-- Estos SÍ están `anulado` (no `abierto`), así que no hay índice que liberar — solo se marcan.
-- update conteos set es_prueba = true where id = '<REEMPLAZA-CON-UUID-CONTEO-1>';
-- update conteos set es_prueba = true where id = '<REEMPLAZA-CON-UUID-CONTEO-2>';
-- update conteos set es_prueba = true where id = '<REEMPLAZA-CON-UUID-CONTEO-3>';

-- ============================================================================
-- 4. PRODUCTOS DE PRUEBA (BLU/PAN/VES) — PREVIEW
-- ============================================================================
-- El prefijo NO alcanza solo: BLU/PAN/VES son también Blusa/Pantalón/Vestido REALES.
-- Mira `referencia` y `created_at` para separar a ojo los de prueba de los reales.
select p.id as producto_id, p.referencia, p.estado, p.created_at,
  (select string_agg(sku, ', ' order by sku) from variantes where producto_id = p.id) as skus
from productos p
where p.referencia ilike 'BLU%' or p.referencia ilike 'PAN%' or p.referencia ilike 'VES%'
order by p.created_at;

-- ---------------- APLICAR (una vez por producto, con su id real) ----------------
-- update productos set es_prueba = true where id = '<REEMPLAZA-CON-UUID-PRODUCTO-1>';
-- -- … los que confirmaste como de prueba. NO uses `where referencia ilike 'BLU%' …` acá:
-- -- eso archivaría también las blusas, pantalones y vestidos reales que compartan prefijo.

-- ============================================================================
-- 5. VERIFICACIÓN — correr al final, después de cada sección APLICAR que hayas usado
-- ============================================================================
select
  (select count(*) from ventas where es_prueba) as ventas_archivadas,
  (select count(*) from cajas where es_prueba) as cajas_archivadas,
  (select count(*) from conteos where es_prueba) as conteos_archivados,
  (select count(*) from productos where es_prueba) as productos_archivados;
