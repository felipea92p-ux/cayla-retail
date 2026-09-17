-- ============================================================================
-- 31 — Una sola firma por función
-- Correr en cayla-DYNAMIC (SQL Editor). Todo en el cajón `retail`.
-- Gemelo de `supabase/migrations/0049_una_sola_firma_por_funcion.sql`.
--
-- ⚠ NO HIZO FALTA. Verificado en producción el 2026-09-09: cero funciones con más
--   de una firma en `retail`. Producción nunca acumuló duplicados porque no
--   replicó el historial de migraciones — `unificacion/07_funciones_operacion.sql`
--   define `registrar_movimiento` una sola vez, ya con sus 12 argumentos. El
--   problema era exclusivo de la base LOCAL, que sí replica todo (ADR-0026).
--
--   Este archivo queda como REMEDIO EN RESERVA, no como pendiente. Si algún día la
--   comprobación de abajo devuelve filas, esto lo arregla — pero primero se ajustan
--   las firmas de la lista a las que existan de verdad allá.
--
-- ANTES DE CORRERLO, la comprobación de 10 segundos. Pega SOLO esto y mira qué
-- responde (`explain` no ejecuta nada, solo resuelve la llamada):
--
--   explain select retail.registrar_movimiento(
--     p_variante_id => null::uuid, p_sede_id => null::uuid,
--     p_tipo => null::text, p_cantidad => null::int
--   );
--
--   · Si responde con un plan (`Result …`) → producción está sana, este archivo
--     no hace falta. Igual se puede correr: no borraría nada.
--   · Si responde `ERROR: function ... is not unique` → está rota igual que
--     local, y esto la arregla.
--
-- QUÉ ARREGLA
--   `create or replace function` con un argumento NUEVO no reemplaza nada:
--   Postgres identifica una función por nombre MÁS firma, así que crea una
--   segunda y deja viva la vieja. Nadie borró las viejas. Con dos firmas cuya
--   lista de parámetros es una prefijo de la otra, una llamada que solo nombra
--   los parámetros COMUNES no resuelve, y la pantalla falla con un error que no
--   dice nada.
--
--   En local, medido el 2026-09-09: una devolución al almacén funcionaba y un
--   ajuste, una merma o un traslado normal NO — `MovimientoModal` solo manda
--   `p_contenedor_id` cuando es devolución, y `supabase-js` borra del JSON las
--   claves `undefined`. Ver ADR-0026.
--
-- QUÉ SE QUEDA (siempre la más nueva, que es la que la app llama hoy)
--   · retail.registrar_movimiento          12 args — manda `p_contenedor_id`
--   · retail.recibir_lote                   8 args — manda `p_orden_produccion_id`
--   · retail.registrar_produccion          15 args — manda `p_costo_maquila`, `p_fecha_entrega`
--   · retail.crear_producto_con_variantes   8 args — manda `p_proveedor_id`
--
-- EL CANDADO. Antes de borrar una firma vieja se comprueba que la NUEVA existe.
-- Producción no recibió las migraciones con `db reset` sino pegadas a mano, así
-- que puede tener otra combinación; si la que debe quedarse no está, no se borra
-- nada y el resumen final lo muestra. Borrar la única implementación viva para
-- "limpiar duplicados" sería el estado imposible que el principio 2 prohíbe.
--
-- Sin `cascade`, a propósito: si algo depende de una firma vieja, que falle y se
-- vea, no que se lleve el dependiente por delante.
--
-- 100% idempotente: correrlo dos veces no cambia nada la segunda.
-- ============================================================================

do $$
declare
  v record;
begin
  for v in
    select * from (values
      ('registrar_movimiento', 12,
       'retail.registrar_movimiento(uuid, uuid, text, integer, text, text, uuid, numeric, uuid, text)'),
      ('recibir_lote', 8,
       'retail.recibir_lote(uuid, text, jsonb, text, text, text)'),
      ('recibir_lote', 8,
       'retail.recibir_lote(uuid, text, jsonb, text, text, text, uuid)'),
      ('registrar_produccion', 15,
       'retail.registrar_produccion(uuid, integer, numeric, numeric, numeric, uuid, text, uuid, text, boolean, text)'),
      ('registrar_produccion', 15,
       'retail.registrar_produccion(uuid, integer, numeric, numeric, numeric, jsonb, uuid, text, uuid, text, boolean, boolean, text)'),
      ('crear_producto_con_variantes', 8,
       'retail.crear_producto_con_variantes(text, text, jsonb, uuid, text, text, text)')
    ) as t(nombre, args_que_se_queda, firma_que_se_va)
  loop
    if exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'retail' and p.proname = v.nombre and p.pronargs = v.args_que_se_queda
    ) then
      execute format('drop function if exists %s', v.firma_que_se_va);
    else
      raise warning 'NO se tocó % — la firma de % argumentos que debía quedarse no existe en retail.',
        v.firma_que_se_va, v.args_que_se_queda;
    end if;
  end loop;
end $$;

-- El resumen que SÍ se ve. El SQL Editor de Supabase no siempre muestra los
-- `raise notice`, pero una tabla de resultados no se puede perder. Después de
-- correr esto, `firmas_vivas` debe decir 1 en las cuatro filas.
select
  p.proname                                  as funcion,
  count(*)                                   as firmas_vivas,
  string_agg(p.pronargs::text, ' y ' order by p.pronargs) as argumentos,
  case when count(*) = 1 then 'ok' else 'REVISAR' end as estado
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'retail'
  and p.proname in ('registrar_movimiento', 'recibir_lote', 'registrar_produccion', 'crear_producto_con_variantes')
group by p.proname
order by p.proname;
