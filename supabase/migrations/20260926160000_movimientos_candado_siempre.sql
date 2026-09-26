-- ============================================================================
-- 20260926160000_movimientos_candado_siempre.sql — CAYLA V2 · D-22 (el historial de movimientos no se edita ni se borra)
--
-- EL PROBLEMA. `movimientos` es el libro de stock (principio 4: todo lo demás se deriva de él). Sus dos candados
-- —`movimientos_inmutables` (UPDATE/DELETE) y `movimientos_sin_truncate` (TRUNCATE)— se pusieron en modo ALWAYS en
-- producción el 2026-09-16 (PR #56, D-22), para que funcionen incluso en modo réplica (`session_replication_role =
-- replica`, el que usan algunas herramientas de restauración y scripts). Dos cosas lo deshicieron sin que nadie lo viera:
--   · ninguna migración de `main` lo escribió (el PR #56 nunca se fusionó), así que CI y el Postgres local los crean en
--     modo normal ('O');
--   · `scripts/demo/deshacer-90-dias.sql` (corrido con COMMIT el 2026-09-24) apaga `movimientos_inmutables` y lo
--     vuelve a encender con `enable trigger` a secas, que lo deja en 'O'. Su verificación solo buscaba candados APAGADOS
--     ('D'), no candados en el modo equivocado.
-- Auditoría del 2026-09-26: en producción `movimientos_sin_truncate` seguía en 'A' y `movimientos_inmutables` en 'O'.
--
-- QUÉ HACE. Deja los dos candados de `movimientos` en ALWAYS, aquí y en cualquier base que corra las migraciones. Es
-- idempotente: pegarlo dos veces no cambia nada. Los demás libros (compras, Finanzas, historiales) siguen en modo normal,
-- que es como nacieron: esta migración no cambia su diseño.
--
-- ESTADO QUE DEJA DE SER POSIBLE: editar o borrar una fila de `movimientos` (o vaciar la tabla) desde una sesión en
-- modo réplica. Para tocar el historial de verdad hay que apagar el candado explícitamente (`disable trigger`), a la
-- vista, como hace el script de la demo.
--
-- CÓMO SE PEGA: en el SQL Editor de producción, en una sola vez. No crea políticas ni hace `drop trigger` (ADR-0195),
-- pero el `alter table` toma `movimientos` un instante: pegarlo fuera de la hora de venta. Con `lock_timeout` de 3 s, si
-- la tabla está ocupada falla en vez de trabar la caja, y se vuelve a pegar.
--
-- SE ROMPE SI: alguien vuelve a correr un script que apague y encienda el candado con `enable trigger` a secas (el de la
-- demo ya se corrigió y su verificación exige 'A'), o si se recrea el disparador sin `enable always`.
-- ============================================================================

set lock_timeout = '3s';

alter table retail.movimientos enable always trigger movimientos_inmutables;
alter table retail.movimientos enable always trigger movimientos_sin_truncate;
