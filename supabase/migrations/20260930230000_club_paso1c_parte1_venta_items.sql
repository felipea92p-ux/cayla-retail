-- ============================================================================
-- 20260930230000_club_paso1c_parte1_venta_items.sql — CAYLA V2 · Club de clientas · tanda 1c · PARTE 1 de 3
-- ADR-0288 (D-5 y «Contrato de la tanda 1c»). SOLO `venta_items`: la columna `descuento_club_unitario` (cuánto del
-- descuento de cada prenda es del cumpleaños) y sus dos candados. Va sola porque toda venta escribe en `venta_items`: la
-- cabecera completa (el porqué, el orden de pegado y la verificación) está en la PARTE 3,
-- 20260930230200_club_paso1c_parte3_cumpleanos.sql. Se pega PRIMERO, sola en el SQL Editor; se puede pegar dos veces.
-- Sin políticas ni `drop trigger`. Mientras la PARTE 3 no esté, `registrar_venta` (la de hoy) no conoce la columna y la
-- deja en 0: una venta sin cumpleaños queda exactamente igual.
-- ============================================================================

-- ============================== PARTE 1 · venta_items (sola) ==============================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- `add column … default 0` con un valor constante no reescribe la tabla (Postgres 11+): solo toma el candado un instante.
alter table retail.venta_items add column if not exists descuento_club_unitario numeric(12,2) not null default 0;
comment on column retail.venta_items.descuento_club_unitario is
  'Cuánto del descuento por unidad (descuento_unitario, que sigue siendo el TOTAL) es del cumpleaños de la socia (ADR-0288 D-5). Lo calcula y verifica registrar_venta: round((precio_unitario − (descuento_unitario − esto)) × club_cumple_pct / 100, 2). 0 = sin cumpleaños. Los candados de la venta (costo, tope, 35 %, argumento, código) miden el descuento SIN esta parte.';

-- La parte del club es una parte del total: nunca negativa ni mayor que el descuento de la línea.
alter table retail.venta_items drop constraint if exists venta_items_descuento_club_valido;
alter table retail.venta_items add constraint venta_items_descuento_club_valido
  check (descuento_club_unitario >= 0 and descuento_club_unitario <= descuento_unitario);

-- El motivo describe el descuento SIN el cumpleaños (la parte del club se describe sola, con su columna). Una prenda cuyo
-- único descuento es el cumpleaños no lleva motivo; una con campaña o con descuento a mano lleva el suyo, como siempre.
-- Sigue `not valid`, como nació (20260915140000): hay líneas viejas que no lo cumplen y no se tocan; vale para las nuevas.
-- Con `descuento_club_unitario = 0` (todas las líneas de antes de la tanda 1c) es exactamente el candado de antes.
alter table retail.venta_items drop constraint if exists venta_items_motivo_coherente_con_descuento;
alter table retail.venta_items add constraint venta_items_motivo_coherente_con_descuento
  check (
       (descuento_unitario - descuento_club_unitario = 0 and motivo_descuento is null)
    or (descuento_unitario - descuento_club_unitario > 0 and motivo_descuento is not null)
  ) not valid;

reset lock_timeout;
notify pgrst, 'reload schema';
-- ============================== FIN DE LA PARTE 1 ==============================
