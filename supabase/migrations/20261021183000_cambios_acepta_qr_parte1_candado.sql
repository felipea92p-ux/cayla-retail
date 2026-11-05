-- ============================================================================================================
-- 20261021183000_cambios_acepta_qr_parte1_candado.sql — CAYLA V2 · Cambios · QR como medio de la diferencia (PARTE 1 de 2)
--
-- EL PROBLEMA PRIMERO. El 2026-10-21, en la tienda de Trujillo, una clienta cambió un body (S/ 45.90) por dos Top Rib (S/ 35.90 c/u)
-- y pagó la diferencia por el QR de Izipay. El cambio no ofrece el QR (`cambios.metodo_pago_diferencia` solo acepta efectivo,
-- tarjeta, yape, plin y transferencia), así que la colaboradora registró un cambio uno por uno con diferencia −S/ 10 por
-- «transferencia» —una devolución que nunca ocurrió— y vendió el segundo top aparte. Resultado: «Por depositar Izipay» con S/ 10 de
-- más, Interbank con S/ 10 de menos y dos boletas que suman S/ 10 de más. El QR ya es el medio más usado de la tienda para cobrar.
--
-- ANALOGÍA CAYLA. Es la caja registradora que no tiene tecla para el medio con el que la clienta de verdad pagó: la cajera aprieta
-- la más parecida, y la contabilidad queda con una plata que nunca se movió.
--
-- QUÉ HACE (parte 1): el candado de `cambios.metodo_pago_diferencia` acepta también 'qr'. Nada más: la cuenta donde cae el cobro la
-- resuelve `fn_cuenta_sellada` (ADR-0429: la máquina de esa tienda) y el Diario ya conoce el QR (`fn_asiento_cuenta_de_medio`); lo
-- que falta —el libro de las cuentas y la pregunta que hace la web— está en la parte 2.
--
-- DECIDÍ: reutilizar `venta_pagos` como modelo (20261002130000): el candado primero, las funciones después.
-- DESCARTÉ: aceptar 'qr' sin tocar el candado y guardarlo como 'transferencia': es el mismo número falso que hoy se corrige.
--
-- SE ROMPE SI: la web ofrece el QR en un cambio antes de pegar esta parte (la base lo rechazaría con el mensaje del candado, sin
-- guardar nada; por eso la web pregunta antes con `fn_acepta_qr_en_cambios`, de la parte 2).
--
-- PRODUCCIÓN. Dos partes, cada una pegada por separado y en orden (regla «Políticas y deadlocks», ADR-0195). Esta es la 1: un `alter
-- table` de `cambios` SOLO (toma esa tabla en exclusiva unos milisegundos; son pocas filas); no crea políticas ni toca otra tabla.
-- Idempotente: se puede pegar dos veces. El orden con la publicación de la web no importa (la web pregunta antes de ofrecerlo).
-- ============================================================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

alter table retail.cambios drop constraint if exists cambios_metodo_pago_diferencia_check;
alter table retail.cambios
  add constraint cambios_metodo_pago_diferencia_check
  check (metodo_pago_diferencia in ('efectivo', 'tarjeta', 'yape', 'plin', 'transferencia', 'qr'));

select 'Cambios · QR · parte 1 (candado)' as parte,
       case when pg_get_constraintdef((select c.oid from pg_constraint c where c.conname = 'cambios_metodo_pago_diferencia_check' and c.conrelid = 'retail.cambios'::regclass)) like '%qr%'
            then 'QUEDÓ BIEN' else 'REVISAR' end as resultado;
