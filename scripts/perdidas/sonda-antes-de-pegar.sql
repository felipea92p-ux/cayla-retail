-- ============================================================================================================================
-- scripts/perdidas/sonda-antes-de-pegar.sql — SOLO LECTURA. ADR-0328, actividad 14 (una sola definición de pérdida).
--
-- PARA QUÉ: correrla en el SQL Editor de producción ANTES de pegar 20261004220000_perdidas_una_sola_definicion.sql, y
-- mostrarle a Felipe el resultado. Dice, con filas (el SQL Editor no siempre muestra los NOTICE de la migración):
--   1. qué movimientos pasan a contar como merma en Finanzas (antes eran «otra salida» del Balance), por tipo y motivo;
--   2. qué meses CERRADOS cambiarían (la migración aborta si hay alguno, y nombra esos mismos meses);
--   3. qué traslados cerrados tuvieron faltante (pasan de causa del Balance a merma de la sede que envió);
--   4. quién llama a `registrar_movimiento` en producción (la migración le cierra los motivos que la definición deja fuera:
--      si una función viva le pasa «venta», «conteo_arranque»… dejaría de funcionar);
--   5. movimientos YA escritos con un motivo reservado y sin su documento (pérdidas que hoy se esconden).
-- No escribe nada: cada consulta es un `select`. Se puede correr las veces que haga falta.
--
-- La regla nueva va copiada aquí (1, 2) porque `fn_perdida_razon` todavía no existe en producción antes de pegar. Es una
-- copia SOLO para esta sonda: la definición vive en la migración y la prueba `perdidas.mjs` la vigila.
-- ============================================================================================================================

-- 1. Lo que pasa a merma en Finanzas (todos los meses): resta que la regla vieja no contaba y la nueva sí.
select m.tipo, coalesce(m.motivo, '(sin motivo)') as motivo, count(*) as movimientos, sum(abs(m.cantidad)) as prendas,
       min(m.created_at)::date as desde, max(m.created_at)::date as hasta
  from retail.movimientos m
 where m.variante_id <> '22222222-2222-4222-8222-222222222222'
   and ((m.tipo = 'ajuste' and m.cantidad < 0
         and coalesce(m.motivo, '') not in ('merma', 'conteo', 'conteo_fisico', 'carga_inicial', 'conteo_arranque'))
     or (m.tipo = 'salida'
         and coalesce(m.motivo, '') not in ('venta', 'cambio', 'cuarentena_liquidada', 'traslado_salida', 'transferencia', 'traslado',
                                            'reversion_produccion', 'cuarentena_devuelta_proveedor', 'cuarentena_se_boto',
                                            'cuarentena_donada')))
 group by 1, 2
 order by 1, 2;

-- 2. Meses CERRADOS que cambiarían (si sale alguna fila, la migración aborta: reabrir ESE mes con motivo, pegar y cerrarlo).
select to_char(p.mes, 'YYYY-MM') as mes, u.nombre as sede, count(*) as movimientos_que_cambian
  from retail.movimientos m
  join retail.periodos p on p.alcance = 'ubicacion' and p.ubicacion_id = m.ubicacion_id and p.estado = 'cerrado'
                        and p.mes = date_trunc('month', m.created_at at time zone 'America/Lima')::date
  join retail.ubicaciones u on u.id = m.ubicacion_id
 where m.variante_id <> '22222222-2222-4222-8222-222222222222'
   and ((m.tipo = 'ajuste' and m.cantidad < 0
         and coalesce(m.motivo, '') not in ('merma', 'conteo', 'conteo_fisico', 'carga_inicial', 'conteo_arranque'))
     or (m.tipo = 'salida'
         and coalesce(m.motivo, '') not in ('venta', 'cambio', 'cuarentena_liquidada', 'traslado_salida', 'transferencia', 'traslado',
                                            'reversion_produccion', 'cuarentena_devuelta_proveedor', 'cuarentena_se_boto',
                                            'cuarentena_donada')))
 group by 1, 2
 order by 1, 2;

-- 3. Traslados cerrados con faltante (enviado − recibido, la cuenta del Balance), por mes y sede que envió, y si ese mes de
--    esa sede está cerrado (si lo está, la migración aborta y lo nombra).
select to_char(t.cerrado_en at time zone 'America/Lima', 'YYYY-MM') as mes, u.nombre as sede_que_envio, t.numero as traslado,
       ti.variante_id, x.enviado, x.recibido, x.enviado - x.recibido as faltaron,
       exists (select 1 from retail.periodos p
                where p.alcance = 'ubicacion' and p.ubicacion_id = t.ubicacion_origen_id and p.estado = 'cerrado'
                  and p.mes = date_trunc('month', t.cerrado_en at time zone 'America/Lima')::date) as mes_cerrado
  from retail.transferencias t
  join retail.transferencia_items ti on ti.transferencia_id = t.id
  join retail.ubicaciones u on u.id = t.ubicacion_origen_id
  cross join lateral (
    select coalesce((select sum(m.cantidad) from retail.movimientos m
                      where m.transferencia_item_id = ti.id and m.tipo = 'salida'), 0) as enviado,
           coalesce((select sum(m.cantidad) from retail.movimientos m join retail.transferencia_recepciones tr on tr.id = m.transferencia_recepcion_id
                      where tr.transferencia_id = t.id and m.variante_id = ti.variante_id and m.tipo = 'entrada'), 0) as recibido
  ) x
 where t.estado = 'cerrada' and x.enviado > x.recibido
 order by 1, 2, 3;

-- 4. Quién llama a registrar_movimiento en producción, y con qué tipo y motivo (si alguna le pasa un motivo que la definición
--    deja fuera —venta, cambio, traslado_salida, cuarentena_liquidada, cuarentena_devuelta_proveedor, reversion_produccion,
--    carga_inicial, conteo_arranque—, esa función empezaría a fallar con «motivo_con_su_puerta»: avisar antes de pegar).
select p.proname as funcion, (regexp_matches(p.prosrc, 'registrar_movimiento\s*\(([^;]*)\)', 'g'))[1] as argumentos
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'retail' and p.proname <> 'registrar_movimiento' and p.prosrc ~ 'registrar_movimiento\s*\(';

-- 5. Movimientos ya escritos con un motivo que la definición deja fuera y SIN el documento que lo respalda (sin venta, cambio,
--    traslado, producción ni conteo detrás): pérdidas que hoy se esconden. Lo normal es que no salga ninguna fila.
select m.tipo, m.motivo, count(*) as movimientos, sum(abs(m.cantidad)) as prendas, min(m.created_at)::date as desde,
       max(m.created_at)::date as hasta
  from retail.movimientos m
 where m.variante_id <> '22222222-2222-4222-8222-222222222222'
   and ((m.tipo = 'salida' and m.motivo in ('venta', 'cambio', 'traslado_salida', 'transferencia', 'traslado', 'reversion_produccion'))
     or (m.tipo = 'ajuste' and m.motivo = 'conteo_arranque'))
   and m.venta_item_id is null and m.cambio_id is null and m.transferencia_item_id is null and m.produccion_id is null
   and m.conteo_item_id is null and m.devolucion_item_id is null
 group by 1, 2
 order by 1, 2;
