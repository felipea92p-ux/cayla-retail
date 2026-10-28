# ADR-0548 — Reintentar un movimiento de dinero que se deshizo ya no responde «hecho» en falso

- **Fecha:** 2026-10-28 · **Estado:** propuesto; la migración `20261028012000_movimiento_dinero_token_deshecho.sql` **no está en producción** (la pega Felipe, una sola parte).
- **Relacionados:** ADR-0544 (lo mismo en `registrar_abono_pos`), ADR-0190 (idempotencia por token), ADR-0412 (el token sigue al contenido), ADR-0370 (reemplazos anclados), ADR-0288 (el SQL Editor y `select … into`).

## El problema

`registrar_movimiento_dinero` devuelve, por el mismo `p_token`, el movimiento que ya registró (doble clic, red que reintenta). Lo buscaba sin mirar `estado`. Si el movimiento se anuló y la hoja reintenta con el mismo token, la función devolvía el movimiento anulado como si fuera el nuevo: la pantalla decía «Registrado» y no había ningún movimiento vigente. El token no se puede reusar (`movimientos_dinero.token_cliente` es único sin filtro de estado).

## Lo que se decidió

Con un token cuyo movimiento está anulado, la función falla con «Ese depósito ya se deshizo: vuelve a registrarlo desde cero.» (depósito y abono de tarjeta; «Ese movimiento …» para los demás tipos) y no escribe nada. Vale en las dos ramas que devolvían el movimiento por token (la del inicio y la del `unique_violation`). Con un movimiento vigente, la idempotencia sigue igual.

## Descartado

- **Liberar el token al anular** (ponerlo en `null`): pierde la huella de qué intento fue ese y reabre la puerta a un doble registro si un reintento rezagado llega después de «Deshacer».
- **`create or replace` completo de la función**: pisaría los parches de 20261015003000, 20261016002000 y 20261017143000. Se hizo con dos reemplazos anclados.
- **Registrar uno nuevo en silencio con el mismo token**: imposible por la unicidad, y esconder el reintento tampoco es honesto.

## Se rompe si

Una pantalla guarda el token en un estado que sobrevive a «Deshacer» y reintenta con él: verá el mensaje en vez de un éxito falso. Las dos pantallas que la llaman (`CuentasDinero.tsx`, `GastosPanel.tsx`) renuevan el token al abrir la hoja.

## Verificación

`pnpm pruebas:cuentas-dinero -- --con-migracion supabase/migrations/20261028012000_movimiento_dinero_token_deshecho.sql`: sin la migración fallan 2 casos; con ella pasan los 94. Aplicada dos veces seguidas no cambia nada (idempotente).
