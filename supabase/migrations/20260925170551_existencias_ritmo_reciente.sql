-- ============================================================================
-- Ritmo reciente de Existencias (2026-09-25, pedido de Felipe) — sobre el ledger único
--
-- QUÉ RESUELVE. Existencias medía su ritmo/cobertura con `retail.fn_resumen_variantes`
-- (20260919141804), que reconstruye el saldo de piso por su cuenta, en un tercer código
-- independiente de `retail.fn_ledger_puntos` (ADR-0202, 20260924030000) — el mismo hecho
-- (nivel de piso en el tiempo) reconstruido tres veces en el repo, no dos como se pensaba
-- al auditar el dominio. Felipe pidió que el nuevo "Ritmo reciente"/"Cobertura piso" de
-- Existencias nazca del ledger único, sin sumar una CUARTA reconstrucción.
--
-- POR QUÉ NO SE REUTILIZA `fn_resumen_comparacion` DIRECTAMENTE. Esa función (Análisis)
-- exige `fn_es_lider()` y devuelve `costo` — Existencias la usa TODO el personal de
-- tienda, no solo líderes, y filtrar el costo en TypeScript dejaría el dato viajando
-- igual hasta el navegador (justo la fuga que ADR-0183 cerró a propósito). Esta función
-- es nueva, delgada, y deliberadamente MENOS que `fn_resumen_comparacion`: ningún costo,
-- ninguna cifra de ventas en soles, ningún análisis histórico — solo los eventos de piso
-- crudos, con el mismo permiso que ya tiene `fn_resumen_variantes` (`fn_puede_operar_ubicacion`,
-- sin filtrar por rol).
--
-- QUÉ DEVUELVE. Por cada variante pedida (`p_variante_ids`, siempre la misma sede que ya
-- tiene Existencias en memoria — no vuelve a preguntar "qué hay en esta sede"), la lista
-- ORDENADA de eventos que afectan el piso desde `p_desde` — MISMA FORMA exacta que
-- `piso_eventos` de `fn_resumen_comparacion` ({ts, delta, esVenta, esMovimientoInterno}),
-- así que la capa TypeScript reutiliza tal cual `leerEventosPiso`
-- (`apps/web/lib/inventario-exposicion.ts`) para leerla — cero parser nuevo. Con un
-- arreglo explícito de variantes, `fn_ledger_puntos` garantiza que TODAS aparecen (aunque
-- sea con `[]`), igual que ya hace `fn_ledger_timeline` para una sola variante.
--
-- NO DEVUELVE: piso/almacén de HOY (Existencias ya lo tiene de `retail.stock`, vía
-- `getStockPorUbicacion` — no se construye una segunda fuente para eso, pedido explícito
-- de Felipe), ni nada de "en camino"/"en la red" (fuentes ya existentes, sin tocar).
-- ============================================================================
create or replace function retail.fn_ritmo_reciente_json(
  p_ubicacion_id uuid,
  p_desde timestamptz,
  p_variante_ids uuid[]
)
returns jsonb
language sql
stable
security definer
set search_path to 'retail', 'public', 'extensions'
as $$
with permiso as (
  select fn_puede_operar_ubicacion(p_ubicacion_id) as ok
),
pt as (
  select * from retail.fn_ledger_puntos(p_ubicacion_id, p_desde, p_variante_ids)
  where bucket = 'piso'
),
-- Mismo filtro que `piso_eventos_par` en fn_resumen_comparacion: todo movimiento real
-- (ord = 1) más el saldo de partida SOLO si no era cero (ord = 0 con delta = 0 no aporta
-- nada — la variante simplemente no tenía nada en piso al empezar la ventana).
eventos as (
  select pt.variante_id,
    jsonb_agg(jsonb_build_object('ts', pt.ts, 'delta', pt.delta, 'esVenta', pt.es_venta, 'esMovimientoInterno', pt.es_interno) order by pt.ts) as piso_eventos
  from pt
  where pt.ord = 1 or pt.delta <> 0
  group by pt.variante_id
)
select case when (select ok from permiso)
  then coalesce(
    jsonb_object_agg(v.variante_id::text, coalesce(e.piso_eventos, '[]'::jsonb)),
    '{}'::jsonb
  )
  else '{}'::jsonb
end
from unnest(p_variante_ids) as v(variante_id)
left join eventos e on e.variante_id = v.variante_id;
$$;

comment on function retail.fn_ritmo_reciente_json(uuid, timestamptz, uuid[]) is
  'Ritmo reciente de Existencias (2026-09-25): los eventos de piso de cada variante pedida, desde un punto de partida, en la MISMA forma que piso_eventos de fn_resumen_comparacion — reutiliza retail.fn_ledger_puntos (ADR-0202), sin sumar una cuarta reconstrucción del ledger. A diferencia de fn_resumen_comparacion: sin costo, sin fn_es_lider() (mismo permiso que fn_resumen_variantes — la usa todo el personal de tienda, no solo líderes). No decide nada: la interpretación (días de exposición comercial, ritmo, cobertura piso) vive en apps/web/lib/existencias-ritmo.ts.';

revoke all on function retail.fn_ritmo_reciente_json(uuid, timestamptz, uuid[]) from public, anon;
grant execute on function retail.fn_ritmo_reciente_json(uuid, timestamptz, uuid[]) to authenticated;
