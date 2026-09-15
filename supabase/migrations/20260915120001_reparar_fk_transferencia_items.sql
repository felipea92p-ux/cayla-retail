-- ============================================================================
-- 20260915120000_reparar_fk_transferencia_items.sql — CAYLA V2
--
-- Repara una llave foránea torcida que SOLO existe en producción.
--
-- Hallazgo (2026-09-15, al refrescar el volcado del diccionario y comparar
-- producción contra la base local, tabla por tabla): las 361 columnas, las 74
-- funciones, los 63 índices únicos, los 7 disparadores y las 58 políticas son
-- idénticos. La ÚNICA diferencia es esta:
--
--   local      transferencia_items.movimiento_id → retail.movimientos(id)   (0002_esquema.sql)
--   producción transferencia_items.movimiento_id → retail.transferencia_items(id)
--
-- En producción la llave apunta a la propia tabla. `transferir()` hace
-- `update transferencia_items set movimiento_id = <id del movimiento>` para
-- enlazar cada línea con su traslado en el ledger — y ese id no existe en
-- `transferencia_items`, así que la base lo rechaza:
--
--   insert or update on table "transferencia_items" violates foreign key
--   constraint "transferencia_items_movimiento_fkey"
--
-- Comprobado en producción dentro de una transacción revertida el 2026-09-15.
-- Nadie lo había pisado todavía: hay 0 transferencias en producción. La primera
-- «Mover mercadería» entre sedes (Taller → tienda) habría fallado entera, sin
-- mover stock y sin dejar rastro — el peor tipo de error: uno que parece que
-- «el sistema no anda».
--
-- Qué hace: suelta la llave y la vuelve a crear apuntando a `movimientos`. En
-- local ya está bien, así que acá es un no-op honesto (suelta y recrea lo mismo).
-- No toca datos. No cambia ninguna función ni pantalla. El único efecto visible
-- es que las transferencias entre sedes pasan a funcionar en producción.
--
-- ESTADO: aplicada en la base local el 2026-09-15 (sin cambio efectivo).
-- NO en producción — la pega Felipe (D-11) o se aplica con su ok; ya lleva el
-- prefijo `retail.`.
-- SE ROMPE SI: alguien vuelve a crear la tabla a mano en producción copiando la
-- definición vieja. La defensa es este archivo y `pnpm datos:comparar` con el
-- volcado al día.
-- ============================================================================

set search_path = retail, public, extensions;

alter table retail.transferencia_items
  drop constraint if exists transferencia_items_movimiento_fkey;

alter table retail.transferencia_items
  add constraint transferencia_items_movimiento_fkey
  foreign key (movimiento_id) references retail.movimientos (id);
