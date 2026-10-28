-- ============================================================================
-- 20261001210200_club_paso1g_parte3_canjes.sql — CAYLA V2 · Club de clientas · tanda 1g · PARTE 3 de 8
-- ADR-0288 (G-13 y «Contrato de la tanda 1g»). SOLO `club_canjes`: el tipo `aniversario`, con `anio_club` (el año de club
-- cuyo aniversario dio el vale) y el candado «un canje vivo por clienta y año de club». Va sola porque toda venta con canje
-- escribe en `club_canjes` (cabecera completa en la PARTE 8, 20261001210700_club_paso1g_parte8_funciones.sql). Se pega
-- TERCERA, sola en el SQL Editor; se puede pegar dos veces. Sin políticas ni `drop trigger`. Mientras la PARTE 8 no esté,
-- nada escribe un aniversario: el cumpleaños sigue exactamente igual.
--
-- DECIDÍ: el aniversario no tiene %: `pct` pasa a aceptar nulo, y el candado lo exige nulo en el aniversario y entre 1 y 50
--   en el cumpleaños (como antes). `monto` sigue siendo lo que regaló el club en esa venta (Σ parte del club × cantidad).
-- DECIDÍ: `anio` sigue siendo «el año de la ocasión»: el del cumpleaños (año de Lima del canje, como en la 1c) o el del
--   aniversario que dio el vale (el año de Lima de esa fecha). Así el único parcial de la 1c (clienta, tipo, año) sigue en
--   pie sin tocarlo, y en el aniversario dice lo mismo que el nuevo (clienta, año de club): dos aniversarios nunca caen en el
--   mismo año calendario. El nuevo (`club_canjes_aniversario_uno_vivo`) es el que nombra el contrato.
-- ============================================================================

-- ============================== PARTE 3 · club_canjes (sola) ==============================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

alter table retail.club_canjes add column if not exists anio_club smallint;
alter table retail.club_canjes alter column pct drop not null;

alter table retail.club_canjes drop constraint if exists club_canjes_tipo_valido;
alter table retail.club_canjes add constraint club_canjes_tipo_valido check (tipo in ('cumpleanos', 'aniversario'));

alter table retail.club_canjes drop constraint if exists club_canjes_pct_valido;
alter table retail.club_canjes add constraint club_canjes_pct_valido
  check ((tipo = 'cumpleanos' and pct is not null and pct >= 1 and pct <= 50)
      or (tipo = 'aniversario' and pct is null));

alter table retail.club_canjes drop constraint if exists club_canjes_anio_club_valido;
alter table retail.club_canjes add constraint club_canjes_anio_club_valido
  check ((tipo = 'aniversario') = (anio_club is not null) and (anio_club is null or anio_club between 1 and 200));

-- El candado del aniversario: un segundo canje vivo del mismo año de club es imposible en el esquema. Anular la venta lo
-- libera (anulado_en, el disparador de la 1c), como el cumpleaños.
create unique index if not exists club_canjes_aniversario_uno_vivo
  on retail.club_canjes (clienta_id, anio_club) where tipo = 'aniversario' and anulado_en is null;

comment on table retail.club_canjes is
  'Los canjes del club (ADR-0288): el cumpleaños (tipo cumpleanos, D-5: un canje vivo por socia y año de Lima) y el vale de aniversario (tipo aniversario, G-13: un canje vivo por socia y año de club, anio_club). Lo escribe registrar_venta (p_canjear_cumpleanos o p_canjear_aniversario, uno solo por venta); anular la venta lo libera (anulado_en, disparador trg_club_canje_libera_al_anular); una devolución no. anio = el año de la ocasión (el del cumpleaños, o el del aniversario que dio el vale). monto = lo que regaló el club en esa venta (Σ descuento_club_unitario × cantidad). pct = el % del cumpleaños; nulo en el aniversario. RLS sin políticas y sin permisos para la API.';
comment on column retail.club_canjes.anio_club is
  'Solo en el aniversario: el año de club que se cumplió y dio el vale (1 = el primer aniversario). Un canje vivo por clienta y año de club (club_canjes_aniversario_uno_vivo).';

reset lock_timeout;
notify pgrst, 'reload schema';
-- ============================== FIN DE LA PARTE 3 ==============================
