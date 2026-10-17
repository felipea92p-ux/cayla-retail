-- Tienda web ▸ Campañas (ADR-0436, actividad 5): la tienda online pinta el diseño publicado de la campaña que anuncia.
--
-- EL PROBLEMA. Desde la actividad 4 cada campaña tiene su diseño en el ERP (`retail.campana_disenos`, 20261017160000), pero la portada
-- de la tienda sigue pintando toda campaña con el rojo de siempre: `tienda_portada()` solo dice su nombre, su descuento y hasta cuándo.
--
-- LO QUE HACE. `tienda_portada()` suma, dentro de la campaña, su `diseno` publicado (la misma forma que lee el ERP, `fn_diseno_json`; null
-- si no tiene uno publicado). Cuál campaña sale sigue siendo LA regla `fn_campana_en_portada` (no cambia aquí). La tienda lo revisa antes de
-- pintarlo (`disenoParaPintar` de packages/portada: que esa versión lo sepa leer y que la letra se lea en claro y en oscuro); si no pasa,
-- sale el rojo de siempre, igual que hoy.
--
-- QUÉ NO CAMBIA. La campaña que se anuncia, con su % y su fin: lo comprueba el final.
--
-- ORDEN. Va después de 20261017144000 (la regla de la portada) y 20261017160000 (la tabla del diseño). Si alguien vuelve a pegar
-- 20261017144000 después de esta, `tienda_portada()` pierde el diseño (la tienda vuelve al rojo de siempre, sin romperse) hasta pegar esta
-- otra vez. Cada una se pega dos veces en su suite (`campanas_portada` la de la regla, `campanas_diseno` esta).
--
-- Una sola función, sin tablas ni políticas: se pega de una vez (idempotente).

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- Lo que la tienda ve HOY, para comprobar al final que solo se sumó el diseño (en la sesión: corre igual pegada de una vez).
select set_config('campanas.portada_antes', retail.tienda_portada()::text, false);

-- La tienda pregunta por hoy: {campana: {nombre, pct, hasta, diseno} | null}.
create or replace function retail.tienda_portada()
returns jsonb
language sql
stable
security definer
set search_path = retail, public
as $$
  select jsonb_build_object(
    'campana', (
      select jsonb_build_object(
        'nombre', e.nombre,
        'pct', e.descuento_pct,
        'hasta', e.vigente_hasta,
        'diseno', (select retail.fn_diseno_json(d) from retail.campana_disenos d where d.etiqueta_id = e.id and d.estado = 'publicado')
      )
      from retail.etiquetas e
      where e.id = retail.fn_campana_en_portada(retail.fn_hoy_lima())
    )
  );
$$;

comment on function retail.tienda_portada() is
  'Tienda online (ADR-0408): la portada sin cuenta. {campana: {nombre, pct, hasta, diseno (el publicado | null)} | null}. Cuál, lo decide fn_campana_en_portada (ADR-0436); el diseño lo revisa la tienda antes de pintarlo. Solo la llama tienda_web.';

revoke all on function retail.tienda_portada() from public, anon, authenticated;
grant execute on function retail.tienda_portada() to tienda_web;

-- Comprobación: la tienda anuncia la misma campaña que antes (nombre, % y fin; 20261017204000 le suma otros campos, que esta no trae).
do $$
declare
  v_antes jsonb := nullif(current_setting('campanas.portada_antes', true), '')::jsonb;
  v_ahora jsonb := retail.tienda_portada();
begin
  if v_antes is null then
    raise exception 'campanas_diseno_en_la_tienda: no se pudo leer la portada de antes';
  end if;
  if jsonb_build_object('nombre', v_antes -> 'campana' -> 'nombre', 'pct', v_antes -> 'campana' -> 'pct', 'hasta', v_antes -> 'campana' -> 'hasta')
     is distinct from jsonb_build_object('nombre', v_ahora -> 'campana' -> 'nombre', 'pct', v_ahora -> 'campana' -> 'pct', 'hasta', v_ahora -> 'campana' -> 'hasta') then
    raise exception 'campanas_diseno_en_la_tienda: la portada cambió de campaña (antes %, ahora %)', v_antes, v_ahora;
  end if;
  if v_ahora -> 'campana' <> 'null'::jsonb and not (v_ahora -> 'campana' ? 'diseno') then
    raise exception 'campanas_diseno_en_la_tienda: la campaña de la portada no trae su diseño';
  end if;
end $$;

reset lock_timeout;
