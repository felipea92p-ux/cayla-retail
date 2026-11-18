-- ============================================================================
-- Mis compras · «¿A qué cuenta de CAYLA devolviste?» al cerrar la ronda — PARTE 1 de 2: la columna.
--
-- EL PROBLEMA PRIMERO. Al cerrar su ronda, la compradora elige «Lo devuelvo al cerrar» y la hoja solo dice «Lo entregas en caja y Compras lo
-- recibe»: no dice a qué cuenta de CAYLA va esa plata. Hoy la cuenta la elige Compras al recibir (`recibir_cierre_compras(p_cierre_id, p_cuenta_id)`),
-- así que la compradora no sabe ni puede indicar a dónde entregó lo que le sobró.
--
-- LO QUE SE DECIDIÓ (Felipe, 2026-10-29): la compradora indica la cuenta a la que devolvió, de una lista con las cuentas de la empresa. Es el mismo
-- patrón que «¿De qué banco salió?» al anotar plata (20261026165000): lo que ella dice es una INDICACIÓN, no un movimiento. Compras ve la cuenta ya
-- elegida al recibir y la puede cambiar; el dinero solo se mueve en `recibir_cierre_compras`, a la cuenta que Compras confirma.
--
-- Esta parte solo agrega la columna y su candado: sin funciones, sin políticas ni disparadores (ADR-0195: un `alter` de una tabla en uso va
-- aparte de lo que toma los candados de auth y storage). Se pega ANTES que la parte 2 (`20261029170000`).
-- Idempotente: se puede pegar dos veces. Sin datos que migrar: la columna nace vacía y los cierres ya hechos siguen como estaban.
-- ============================================================================
set lock_timeout = '3s';
set search_path = retail, public, extensions;

alter table retail.compra_cierres
  add column if not exists cuenta_indicada_id uuid references retail.cuentas_dinero (id);

comment on column retail.compra_cierres.cuenta_indicada_id is
  'La cuenta de CAYLA (banco o caja fuerte) a la que la compradora dijo que devolvió lo que le sobró (solo con decision = devuelve). Es una indicación: la cuenta a la que de verdad vuelve la plata la elige Compras al recibir el cierre.';

-- Solo quien devuelve indica a dónde: «me lo quedo» y «CAYLA me debe» no entregan nada a una cuenta.
alter table retail.compra_cierres drop constraint if exists compra_cierres_cuenta_indicada;
alter table retail.compra_cierres
  add constraint compra_cierres_cuenta_indicada check (cuenta_indicada_id is null or decision = 'devuelve');
