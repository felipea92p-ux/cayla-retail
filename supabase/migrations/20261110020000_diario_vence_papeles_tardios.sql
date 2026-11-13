-- ============================================================================
-- 20261110020000 — La foto del diario también vigila los papeles tardíos de un gasto (ADR-0633)
--
-- EL PROBLEMA PRIMERO. Dos arreglos entraron por separado y se cruzaron:
--   · 20261109145000 («papel de un gasto con el mes cerrado») hizo que el diario (`fn_asientos`) lea una tabla nueva,
--     `retail.gasto_papeles_tardios`: el IGV de una factura que llegó tarde y entra al mes abierto, aunque su fecha de emisión sea de un mes cerrado.
--   · 20261109183000 («la foto vence sola») exige que TODA tabla que el diario lee avise cuando cambia algo de un mes pasado, con el disparador
--     `diario_vence`; si no, la foto de ese mes sigue mostrando la cifra vieja.
-- Esta tabla nació sin ese disparador. Sin él, registrar o quitar el papel tardío de un gasto de octubre cambia el IGV del diario, pero la foto
-- de octubre no se entera y el Estado de resultados seguiría con la cifra de antes (estado inconsistente: principio 2). `pnpm pruebas:foto-diario`
-- lo vio («ninguna tabla del diario sin vigilar») y puso el CI en rojo: el candado hizo su trabajo.
--
-- LO QUE HACE. Una línea: el mismo `diario_vence` de las demás tablas. Sin argumentos: `fn_diario_vence` mira todas las fechas de la fila (la de
-- emisión, la contable) y SOLO si la más antigua es de un mes que ya terminó, anota que esa foto ya no vale. Un papel de hoy no escribe nada.
-- No va en `diario_fuentes_exentas`: esa lista es para las tablas que no cambian cifras (permisos, Dynamic); esta sí las cambia.
--
-- CÓMO SE PEGA EN PRODUCCIÓN. Una sola ejecución. Es un `create or replace trigger` (no `drop trigger`, que toma las tablas de `auth` y `storage`,
-- CLAUDE.md «Políticas y deadlocks») sobre una tabla nueva que solo tocan funciones `security definer`: no frena al mostrador. Idempotente.
-- Requiere que ya estén pegadas 20261109145000 (la tabla) y 20261109183000 (la función `fn_diario_vence`).
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace trigger diario_vence
  after insert or update or delete on retail.gasto_papeles_tardios
  for each row execute function retail.fn_diario_vence();
