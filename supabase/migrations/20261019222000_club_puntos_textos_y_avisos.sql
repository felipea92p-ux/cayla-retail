-- ============================================================================
-- 20261019222000_club_puntos_textos_y_avisos.sql — CAYLA V2 · Club · puntos, actividad 10 de 12: lo que el club DICE pasa a los puntos
-- Sigue a `20261019221000_club_puntos_retira_cumple_vale_y_ligado.sql`.
--
-- EL PROBLEMA. Con el 10 % de cumpleaños y el vale de aniversario retirados, todo lo que el club le dice a la gente tiene que hablar de
-- puntos: el cartel del mostrador, la página que abre su QR y la tienda online. Esas piezas son públicas (el cartel y su página las ve
-- cualquiera, sin sesión), y hasta hoy solo podían leer los beneficios viejos (`fn_club_pagina`, `fn_club_textos_legales`).
--
-- QUÉ HACE
--   1. `fn_club_puntos_vigentes()`: la configuración vigente de los puntos (lo que se gana, lo que valen, el canje, el cupón y el regalo
--      de cumpleaños), sin datos de nadie, para anon y authenticated: la usan el cartel y la página del QR.
--
-- DECIDÍ: los Términos que guarda `club_textos` NO cambian aquí: el texto nuevo espera la revisión del abogado
--   (docs/club/texto-legal-puntos-v1-borrador.md). Lo que esta migración publica son cifras de la configuración, no texto legal.
-- CÓMO SE PEGA: este archivo SOLO en el SQL Editor de producción, después de `20261019221000`. Idempotente. `lock_timeout` 3 s.
-- CAÍDA EXTERNA. Nada llama a la red.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. La configuración vigente, para el cartel y la página del QR ----------
create or replace function retail.fn_club_puntos_vigentes()
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_cfg retail.club_puntos_config;
begin
  v_cfg := retail.fn_club_puntos_config((now() at time zone 'America/Lima')::date);
  return jsonb_build_object(
    'puntos_por_sol', v_cfg.puntos_por_sol, 'soles_por_100', v_cfg.soles_por_100, 'canje_minimo', v_cfg.canje_minimo_puntos,
    'compra_minima_x', v_cfg.compra_minima_x, 'vigencia_dias', v_cfg.vigencia_cupon_dias, 'regalo_cumple', v_cfg.regalo_cumple_puntos);
end;
$$;
comment on function retail.fn_club_puntos_vigentes() is
  'La configuración vigente de los puntos del Club (lo que se gana, lo que valen, el canje, el cupón y el regalo de cumpleaños), sin datos de nadie. Pública: la leen el cartel del mostrador y la página que abre su QR.';
revoke all on function retail.fn_club_puntos_vigentes() from public;
grant execute on function retail.fn_club_puntos_vigentes() to anon, authenticated;

reset lock_timeout;
notify pgrst, 'reload schema';
