-- ============================================================================
-- 20261031194000_produccion_estimado_de_tela_consumida.sql — CAYLA V2 (ADR-0400, actualización 2026-10-31)
--
-- EL PROBLEMA PRIMERO.
--   En el cuadro «Costo» de una orden, la tela decía Estimado 355.20 y Real 761.92 cuando la orden había usado 87.50 m de los 87.98 m del plan: casi todo. El estimado se calculaba
--   SIEMPRE con el lote más antiguo que todavía tiene saldo en el Taller (PEPS). Cuando una orden consume el último metro de un lote, ese lote ya no tiene saldo y su tela pasa a valer 0 en
--   el estimado: el Forro (un lote de 48 m) y el Arena se gastaron enteros y desaparecieron de la cuenta (315.12 + 94.72 = 409.84 que faltaban). El error crece con cada tela que se consume,
--   justo cuando más sirve comparar el plan contra lo gastado. En cadena: el Total estimado (2,466.66, debía ser 2,876.50), el costo por prenda (43.27, debía ser 50.46) y el encabezado
--   «Costo hasta hoy 2,846.02 de 2,466.66», que hacía parecer que la orden ya se pasó del presupuesto.
--
-- QUÉ HACE. El estimado de cada tela o avío = el plan × lo que cuesta cada unidad, y «lo que cuesta» sale en este orden:
--   1. lo que ya le costó a ESTA orden (su costo medio: consumo menos devolución, al costo del lote de cada movimiento), si ya consumió de ese insumo;
--   2. si todavía no consumió nada, el lote más antiguo con saldo en el Taller (PEPS, como hasta hoy);
--   3. sin ninguno de los dos, 0: la pantalla sigue diciendo «sin lote recibido», no inventa un precio.
--   Con una sola tela a un solo precio el resultado es el mismo de antes; solo cambia cuando el lote se acabó. Lo «Real» no se toca.
--
-- CONTRATO (Liskov)
--   PROMETE: `costos.tela_estimado` y `costos.avios_estimado` no bajan porque se consumió el stock: una orden que usó todo su plan tiene un estimado casi igual a su real (la diferencia
--            es lo que sobró del plan). Los demás campos de `fn_orden_produccion` no cambian.
--   ASUME:   `fn_orden_produccion` con el texto de hoy (producción y `main` tienen la misma huella: md5 0f27ca2f00bd0c4ad1448a1b4a3eeca1, 21546 caracteres, leído el 2026-10-31). Si el texto
--            cambió, el reemplazo se DETIENE sin tocar nada (el ancla tiene que aparecer exactamente una vez).
--   NO HACE: no toca el costo real, los servicios, las tablas ni los permisos (quien no ve costos sigue sin verlos).
--
-- DECIDÍ: usar el costo medio de lo que la orden ya consumió, en vez de guardar el estimado al abrir la orden. No agrega columnas ni obliga a rellenar las órdenes ya abiertas, y una
--   orden que cambia de tela sigue estimándose con la tela de ahora.
-- DESCARTÉ: guardar el estimado al abrir la orden (una columna nueva en `produccion_insumos`): sería lo más fiel, pero las órdenes ya abiertas no lo tienen y habría que inventarlo.
--   Y estimar lo ya consumido con el último precio de compra: si el precio subió, la orden se vería más cara de lo que le costó.
-- SE ROMPE SI: una orden consume la misma tela de dos lotes con precios distintos: el estimado de lo que queda por consumir usa el promedio de lo ya consumido, no el precio del
--   siguiente lote. Pasa solo en una tela a medias, y se corrige sola cuando se termina de consumir.
--
-- PRODUCCIÓN. NO está aplicada. Una sola parte, re-ejecutable, `lock_timeout = 3s`: dos reemplazos ANCLADOS en `fn_orden_produccion` (ADR-0288). Sin tablas, sin políticas, sin
-- `drop trigger`. Los textos de reemplazo no llevan ninguna lectura con asignación a una variable (el SQL Editor las reescribe: «aprendido 2026-09-30, ADR-0288»). Va DESPUÉS de 20261015160000; si
-- alguna vez se vuelve a pegar una migración que recrea `fn_orden_produccion` entera (20261014155000 o 20261015160000), se vuelve a pegar esta después. Prueba:
-- `pnpm pruebas:produccion-estimado-de-tela`.
--
-- CAMINO DE VUELTA (probado en una base local): es el mismo ayudante con los textos al revés. Está en `scripts/pruebas/produccion_estimado_de_tela.mjs` (caso V), que lo corre y comprueba
-- que la huella de la función vuelve a 0f27ca2f00bd0c4ad1448a1b4a3eeca1.
-- ============================================================================
set lock_timeout = '3s';

-- Reemplaza `p_viejo` por `p_nuevo` en la función viva; `p_viejo` tiene que aparecer exactamente una vez. Si `p_nuevo` ya está, no hace nada.
create or replace function pg_temp.reemplazar_anclado(p_firma text, p_viejo text, p_nuevo text)
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
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta migración: el ancla aparece % veces (se esperaba 1). Regenera el reemplazo desde su definición real.',
      p_firma, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- 1. La cuenta: lo que cuesta cada unidad es lo que ya le costó a la orden; si no ha consumido, el lote con saldo; si no hay, 0.
select pg_temp.reemplazar_anclado(
  'retail.fn_orden_produccion(uuid)',
  $v$    -- Estimado: el plan de cada tela o avío × el costo del lote más antiguo con saldo en ese Taller (PEPS, como `registrar_consumo_insumo`);
    -- sin lote con saldo, 0 (la pantalla dice «sin tela recibida», no inventa un precio).
    select coalesce(sum(case when i.tipo = 'tela' then pi.cantidad_plan * coalesce(peps.costo, 0) end), 0),
           coalesce(sum(case when i.tipo <> 'tela' then pi.cantidad_plan * coalesce(peps.costo, 0) end), 0)$v$,
  $v$    -- Estimado: el plan de cada tela o avío × lo que cuesta cada unidad. Si la orden ya consumió de ese insumo, cuesta lo que le costó (su costo medio: consumo menos devolución); si todavía
    -- no, el del lote más antiguo con saldo en ese Taller (PEPS, como `registrar_consumo_insumo`); sin ninguno de los dos, 0 (la pantalla dice «sin lote recibido», no inventa un precio).
    -- Antes se medía SIEMPRE contra el lote con saldo: al gastarse el último lote de una tela su estimado caía a 0 justo cuando ya se había consumido (ADR-0400, act. 2026-10-31).
    select coalesce(sum(case when i.tipo = 'tela' then pi.cantidad_plan * coalesce(case when cons.cantidad > 0 then cons.monto / cons.cantidad end, peps.costo, 0) end), 0),
           coalesce(sum(case when i.tipo <> 'tela' then pi.cantidad_plan * coalesce(case when cons.cantidad > 0 then cons.monto / cons.cantidad end, peps.costo, 0) end), 0)$v$
);

-- 2. Lo que la orden ya consumió de cada insumo (neto de devoluciones) y lo que le costó: la misma suma que el «Real», por insumo. Sin movimientos devuelve una fila de nulos, y ahí cuenta el lote.
select pg_temp.reemplazar_anclado(
  'retail.fn_orden_produccion(uuid)',
  $v$      ) peps on true
     where pi.produccion_id = p_produccion_id;$v$,
  $v$      ) peps on true
      left join lateral (
        select sum(case when mi.tipo = 'consumo' then mi.cantidad else -mi.cantidad end) as cantidad,
               sum(case when mi.tipo = 'consumo' then mi.cantidad * mi.costo_unitario else -mi.cantidad * mi.costo_unitario end) as monto
          from retail.movimientos_insumo mi
         where mi.produccion_id = p_produccion_id and mi.insumo_id = pi.insumo_id and mi.tipo in ('consumo', 'devolucion')
      ) cons on true
     where pi.produccion_id = p_produccion_id;$v$
);

reset lock_timeout;
