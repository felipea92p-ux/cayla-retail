-- ============================================================================
-- 20261017174000 — Las tarifas reales de Izipay: el QR cobra 2.38 % + IGV salvo los primeros ~10 días de cada mes (0 %), y la
-- tarjeta de Izipay ya tiene tarifa
-- (ADR-0429, «Actualización 2026-10-17 (c)»)
--
-- EL PROBLEMA PRIMERO. La migración 20261016191000 sembró «el QR de Izipay no cobra comisión y deposita al día siguiente» porque
-- así lo dijo Felipe el 2026-10-05. Los reportes de abono de Izipay de agosto, septiembre y octubre (tres códigos de comercio, varios
-- cientos de pagos) lo matizan: el QR sale SIN comisión los primeros ~10 días de cada mes y paga 2.38 % + IGV el resto, como la
-- tarjeta. Se vio tres meses seguidos (agosto: gratis hasta el 10, cobrado desde el 11; septiembre: gratis hasta el 10, cobrado desde el
-- 10-11; octubre: gratis hasta el 9, cobrado desde el 10), y el corte NO es un tope de monto ni de cantidad (cada mes dejó pasar un monto
-- distinto sin comisión). Por qué es así no está en los archivos: lo confirma Izipay. La tarjeta (chip y contactless) nunca fue gratis. El depósito es el mismo día.
-- Con la tarifa sembrada (0 % desde 1900), la estimación del QR dice 0 para todo lo pendiente, también para lo cobrado con comisión
-- (el 30 de septiembre y desde el 10 de octubre), y la tarjeta de Izipay no tiene tarifa (estima «nula»).
--
-- CONTRATO (Liskov)
--   PROMETE: la tarifa del QR de Izipay sigue la historia OBSERVADA: 0 % hasta el 2026-09-10 (la fila sembrada, desde 1900),
--            2.38 % + IGV desde el 2026-09-11, 0 % desde el 2026-10-01 y 2.38 % + IGV desde el 2026-10-10; sin cargo fijo y con
--            depósito el mismo día (0 días hábiles). La tarjeta de Izipay: 2.38 % + IGV, 0 días, desde «siempre» (1900-01-01), solo si
--            todavía no tiene ninguna. Solo agrega filas (la tabla no se edita ni se borra).
--   ASUME:   2.38 % sale de los reportes (2.36 a 2.42 por redondeo de centavos, sobre todos los pagos con comisión) y el IGV es el 18 % de la comisión
--            (`neto = importe − comisión − IGV` cuadra en todas las filas con comisión). El corte de septiembre se pone el día 11
--            porque en un código el primer cobro fue el 10 por la tarde y en el otro el 11: la estimación es de un día, no más.
--   NO HACE: no adivina noviembre: la ventana gratis de los primeros días de noviembre NO se siembra; mientras nadie cargue una
--            tarifa nueva, el QR se estimará con 2.38 % desde el 1 de noviembre (de más, nunca de menos). No toca ningún cobro,
--            depósito, gasto ni asiento: la comisión REAL sigue saliendo del depósito, nunca de la tarifa. No carga la tarifa de
--            Vendemás (Felipe la carga con sus reportes de 2026; hoy sin tarifa).
--
-- CÓMO SE PEGA EN PRODUCCIÓN — UNA SOLA EJECUCIÓN, sin partes: `insert … select`, ninguna política, ningún `alter`; no toma ninguna
-- tabla que use la tienda. Idempotente: la segunda corrida no inserta nada. Ensayo opcional: el archivo entero más
-- `do $$ begin raise exception 'ENSAYO_OK'; end $$;` al final deshace todo.
-- SE ROMPE SI: (1) Felipe ya cargó desde la pantalla «Tarifa de la máquina» una tarifa de Izipay QR con fecha de HOY: esa gana desde
-- hoy (la de mayor `vigente_desde`) y estas filas solo cubren lo anterior; no se pisan. (2) Izipay cambia las condiciones (por
-- ejemplo, deja de dar los primeros días gratis, o los da hasta otra fecha): se carga una tarifa nueva desde ese día, como siempre.
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. El QR de Izipay, con la historia observada ----------
-- La fila de 0 % desde 1900 (sembrada por 20261016191000) cubre hasta el 2026-09-10.
insert into retail.pos_tarifas (maquina_id, medio, tasa_pct, igv_sobre_tasa, cargo_fijo, dias_abono, vigente_desde, registrado_por)
select m.id, 'qr', v.tasa, v.igv, 0, 0, v.desde, null
  from retail.pos_maquinas m
 cross join (values (2.38, true,  date '2026-09-11'),   -- se acabaron los primeros días gratis de septiembre
                    (0.00, false, date '2026-10-01'),   -- primeros días gratis de octubre (último día gratis: el 9)
                    (2.38, true,  date '2026-10-10')) as v (tasa, igv, desde)
 where lower(m.nombre) = 'izipay' and m.archivada_en is null
   and not exists (select 1 from retail.pos_tarifas t
                    where t.maquina_id = m.id and t.medio = 'qr' and t.vigente_desde = v.desde);

-- ---------- 2. La tarjeta de Izipay: 2.38 % + IGV, desde siempre (nunca tuvo tarifa) ----------
insert into retail.pos_tarifas (maquina_id, medio, tasa_pct, igv_sobre_tasa, cargo_fijo, dias_abono, vigente_desde, registrado_por)
select m.id, 'tarjeta', 2.38, true, 0, 0, date '1900-01-01', null
  from retail.pos_maquinas m
 where lower(m.nombre) = 'izipay' and m.archivada_en is null
   and not exists (select 1 from retail.pos_tarifas t where t.maquina_id = m.id and t.medio = 'tarjeta');
