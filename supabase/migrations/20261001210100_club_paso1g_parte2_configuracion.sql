-- ============================================================================
-- 20261001210100_club_paso1g_parte2_configuracion.sql — CAYLA V2 · Club de clientas · tanda 1g · PARTE 2 de 8
-- ADR-0288 (G-13 y «Contrato de la tanda 1g»). SOLO `configuracion_empresa`: el umbral del aniversario (6 compras o S/ 600
-- en compras netas en un año de club) y los días para usar el vale (60), editables sin deploy con
-- `guardar_beneficios_club` (PARTE 8). Va sola porque toda venta lee `configuracion_empresa` (`fn_exige_responsable`, desde
-- `fn_actor_persona_id`) antes de escribir: tomada en la misma transacción que otra tabla en uso, una venta a medio camino
-- las esperaría en el orden contrario (deadlock). Cabecera completa en la PARTE 8. Se pega SEGUNDA, sola en el SQL Editor;
-- se puede pegar dos veces. Sin políticas ni `drop trigger`.
--
-- DECIDÍ: los rangos (compras 1–100, monto S/ 1–100 000, días 1–180) no son reglas de negocio: son el borde de lo absurdo,
--   para que un error de tipeo no deje el club sin aniversario ni regale un vale que nunca vence. Hasta 180 días: con más de
--   365, dos vales de años seguidos estarían abiertos a la vez y la caja no sabría cuál canjea.
-- ============================================================================

-- ============================== PARTE 2 · configuracion_empresa (sola) ==============================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

alter table retail.configuracion_empresa add column if not exists club_aniversario_compras integer not null default 6;
alter table retail.configuracion_empresa add column if not exists club_aniversario_monto numeric(10,2) not null default 600;
alter table retail.configuracion_empresa add column if not exists club_aniversario_dias integer not null default 60;

alter table retail.configuracion_empresa drop constraint if exists configuracion_empresa_club_aniversario_valido;
alter table retail.configuracion_empresa add constraint configuracion_empresa_club_aniversario_valido
  check (club_aniversario_compras between 1 and 100
         and club_aniversario_monto > 0 and club_aniversario_monto <= 100000
         and club_aniversario_dias between 1 and 180);

comment on column retail.configuracion_empresa.club_aniversario_compras is
  'Aniversario del club (ADR-0288 G-13): un año de club CUENTA si en él hizo al menos estas compras netas (o sumó club_aniversario_monto). 6 por defecto. Se cambia con guardar_beneficios_club (publica una versión nueva de los términos).';
comment on column retail.configuracion_empresa.club_aniversario_monto is
  'Aniversario del club (ADR-0288 G-13): un año de club CUENTA si en él sumó al menos estos soles en compras netas (o hizo club_aniversario_compras compras). S/ 600 por defecto.';
comment on column retail.configuracion_empresa.club_aniversario_dias is
  'Aniversario del club (ADR-0288 G-13): días que tiene para usar el vale, contados desde su aniversario (vence = aniversario + estos días, inclusive). 60 por defecto.';

reset lock_timeout;
notify pgrst, 'reload schema';
-- ============================== FIN DE LA PARTE 2 ==============================
