-- ============================================================================
-- PEGAR EN PRODUCCIÓN — la sede de los productos que se registraron ANTES de `producto_origen` (2026-09-30, ADR-0292)
--
-- No es un archivo de migración numerado (mismo patrón que `pegar-en-produccion-archivar-datos-prueba-2026-09.sql`): es una
-- corrección de DATOS de una sola vez. No la recoge `supabase db reset`.
--
-- EL PROBLEMA. La migración `20260930170000_producto_anota_donde_se_registro.sql` llena `producto_origen` con un disparador, así que
-- solo cubre los productos que se registran DESDE que se aplicó (2026-09-30 16:35 UTC). Pero la pantalla de Inicio de almacén muestra lo
-- registrado «hoy y ayer»: justo los productos anteriores a la migración, que salían SIN sigla de sede (Felipe lo vio con datos reales).
--
-- LA EVIDENCIA. `crear_producto_con_stock_inicial` escribe el producto y su carga inicial en la MISMA transacción: la entrada
-- `carga_inicial` lleva la sede en la que se cargó el stock, y es la sede desde la que se registró. Se midió en producción el 2026-09-30: los 11
-- productos de los últimos 3 días tienen esa entrada en el instante exacto del alta (diferencia 00:00:00), en una sola sede (TRU), y quienes los
-- registraron están asignados a esa misma sede. NO se usa la sede de la persona: una líder puede operar en otra sede distinta de la suya.
--
-- LA REGLA (estricta; ante la duda, sin sede, nunca una sede inventada):
--   · el producto todavía no tiene fila en `producto_origen`;
--   · tiene entradas `carga_inicial` dentro de los 5 segundos del alta (mismo instante, con margen);
--   · y todas esas entradas son de UNA sola sede. Con dos sedes distintas es ambiguo y se salta.
--   Un producto sin carga inicial (o con la carga horas después, o con stock en dos sedes) queda sin sigla, como hasta hoy.
--
-- CÓMO SE RECONOCEN ESTAS FILAS. `registrado_at` es la hora del alta del producto, igual que en las filas del disparador; las que este script
-- crea son las de `registrado_at` anterior a 2026-09-30 16:35:39 UTC (la hora en que se aplicó la migración). `terminal_id` queda vacío (no se
-- sabe). No toca stock, movimientos ni ninguna otra tabla. Es idempotente: una segunda corrida no hace nada.
--
-- PARA PEGAR: una sola parte, sin políticas. Antes, un ensayo: este mismo texto seguido de un bloque que cuenta lo insertado y termina en un error a
-- propósito (mismo método que `pegar-en-produccion-producto-origen-2026-09-30.sql`), así no queda nada.

set lock_timeout = '3s';
set search_path = retail, public, extensions;

insert into retail.producto_origen (producto_id, ubicacion_id, terminal_id, persona_id, registrado_at)
select p.id, carga.ubicacion_id, null, p.propuesto_por, p.created_at
from retail.productos p
cross join lateral (
  select (array_agg(distinct m.ubicacion_id))[1] as ubicacion_id
  from retail.variantes v
  join retail.movimientos m on m.variante_id = v.id
  where v.producto_id = p.id
    and m.tipo = 'entrada' and m.motivo = 'carga_inicial'
    and m.created_at between p.created_at - interval '5 seconds' and p.created_at + interval '5 seconds'
  having count(distinct m.ubicacion_id) = 1
) carga
where not exists (select 1 from retail.producto_origen o where o.producto_id = p.id)
on conflict (producto_id) do nothing;

comment on table retail.producto_origen is
  'En qué sede se registró cada producto (una fila por producto). La llena el disparador trg_producto_anota_origen; ubicacion_id vacío = se sabe que se registró pero no dónde. Las filas con registrado_at anterior a 2026-09-30 16:35:39 UTC no las anotó el disparador: se reconstruyeron de la entrada carga_inicial del alta (misma transacción, una sola sede); los productos sin esa evidencia no tienen fila. RLS sin políticas: solo se lee con fn_producto_origen(). ADR-0292.';
