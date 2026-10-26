-- ============================================================================
-- Mis compras · «¿De qué banco salió?» al anotar plata por transferencia — PARTE 1 de 2: la columna.
--
-- Felipe (2026-10-26, mirando la maqueta docs/maquetas/mis-compras-rediseno-2026-10/): cuando a la compradora le llegó la plata POR
-- TRANSFERENCIA, la hoja «Me dieron plata» pregunta de qué banco de la empresa salió (BCP, de fábrica, o Interbank): es la cuenta que después
-- baja en Finanzas. Hoy ese dato lo pone Compras al confirmar (`confirmar_plata_compras(p_cuenta_origen_id)`); la compradora ahora lo propone y
-- Compras lo ve ya elegido (y lo puede cambiar al verificar la transferencia). La CONFIRMACIÓN no cambia: el dinero solo se mueve ahí, desde la
-- cuenta que elige Compras. Lo que dice la compradora es una indicación, no un movimiento.
--
-- Esta parte solo agrega la columna y su candado: sin funciones, sin políticas ni disparadores (ADR-0195: un `alter` de una tabla en uso va
-- aparte de lo que toma los candados de auth y storage). Se pega ANTES que la parte 2 (`20261026170000`).
-- Idempotente: se puede pegar dos veces. Sin datos que migrar: la columna nace vacía y las plata ya anotadas siguen como estaban.
-- ============================================================================
set lock_timeout = '3s';
set search_path = retail, public, extensions;

alter table retail.fondo_plata_anotada
  add column if not exists cuenta_indicada_id uuid references retail.cuentas_dinero (id);

comment on column retail.fondo_plata_anotada.cuenta_indicada_id is
  'El banco de la empresa del que la compradora dijo que salió la plata (solo con medio = transferencia). Es una indicación: la cuenta de la que de verdad sale la elige Compras al confirmar (cuenta_origen_id).';

-- Solo una transferencia sale de un banco: con Yape, efectivo o «ya tenía» no hay banco que indicar.
alter table retail.fondo_plata_anotada drop constraint if exists fondo_plata_anotada_cuenta_indicada;
alter table retail.fondo_plata_anotada
  add constraint fondo_plata_anotada_cuenta_indicada check (cuenta_indicada_id is null or medio = 'transferencia');
