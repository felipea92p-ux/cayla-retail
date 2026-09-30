-- ============================================================================
-- 20260930240000_club_paso1d_parte1_pedidos.sql — CAYLA V2 · Club de clientas · tanda 1d · PARTE 1 de 4
-- ADR-0288 (D-6, «Actualización 2026-09-30 (e)»). SOLO `pedidos_no_atendidos`: `motivo` y `razon`, con sus candados. Va
-- sola porque es la tabla en la que se anota («no había» en el modal de talla y en Cambios; «se la probó» al quitar una
-- prenda del ticket): con UNA sola tabla tomada, esta parte no puede trabarse en cruz con nadie. La cabecera completa (el
-- porqué, el orden de pegado de las cuatro partes y la verificación) está en la PARTE 2,
-- 20260930240100_club_paso1d_parte2_se_probo.sql. Se pega PRIMERO, sola en el SQL Editor; se puede pegar dos veces. Sin
-- políticas ni `drop trigger`. Mientras la PARTE 2 no esté, la función de hoy no conoce las columnas y todo lo que anota
-- queda `no_habia_talla`: exactamente como hasta hoy.
-- ============================================================================

-- ============================== PARTE 1 · pedidos_no_atendidos (sola) ==============================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- `add column ... default` con una constante no reescribe la tabla (Postgres 11+): toda fila de hoy queda `no_habia_talla`.
alter table retail.pedidos_no_atendidos add column if not exists motivo text not null default 'no_habia_talla';
alter table retail.pedidos_no_atendidos add column if not exists razon text;

alter table retail.pedidos_no_atendidos drop constraint if exists pedidos_no_atendidos_motivo_valido;
alter table retail.pedidos_no_atendidos add constraint pedidos_no_atendidos_motivo_valido
  check (motivo in ('no_habia_talla', 'se_probo_no_llevo'));

-- La razón solo existe cuando se la probó y no la llevó, y es una de cuatro (se cuentan en el informe CL-14).
alter table retail.pedidos_no_atendidos drop constraint if exists pedidos_no_atendidos_razon_solo_si_se_probo;
alter table retail.pedidos_no_atendidos add constraint pedidos_no_atendidos_razon_solo_si_se_probo
  check (razon is null or (motivo = 'se_probo_no_llevo' and razon in ('no_le_quedo', 'precio', 'color', 'lo_piensa')));

comment on column retail.pedidos_no_atendidos.motivo is
  'ADR-0288 D-6: no_habia_talla = pidió y esta sede no la tenía (todo lo anotado antes de la tanda 1d); se_probo_no_llevo = la prenda estaba, se la probó y no la llevó. «Llegó tu talla» (paso 3) avisa SOLO por no_habia_talla.';
comment on column retail.pedidos_no_atendidos.razon is
  'Solo con se_probo_no_llevo, opcional: no_le_quedo, precio, color o lo_piensa (CL-14: «Tallas y prendas que faltaron» las cuenta).';

reset lock_timeout;
notify pgrst, 'reload schema';
-- ============================== FIN DE LA PARTE 1 ==============================
