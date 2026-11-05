-- ============================================================================
-- 20261028064000_produccion_fecha_prometida_pasada_vale.sql — CAYLA V2 (ADR-0537 llevado a main, junto con ADR-0551 · 2026-10-28)
--
-- EL PROBLEMA PRIMERO. Producción tiene un arreglo que vive solo allá: `fn_produccion_fases_normalizar` ya NO rechaza una fecha prometida pasada (ADR-0537, Felipe: «se registra
-- una orden que ya se hizo»; el PR #1422 se cerró sin fusionar y de él quedó en producción este pedazo). `main` sigue rechazándola (`fase_fecha_pasada`), así que una base nueva y
-- producción se comportan distinto con la misma llamada, y el check «SQL pegado» ve la función de producción como «con otra versión» (lo mostró el PR de los cinco pasos, ADR-0551).
-- Felipe confirmó el 2026-10-28 que la regla SIGUE vigente: se trae a `main`.
--
-- QUÉ HACE (una sola función; un reemplazo ANCLADO de tres líneas por un comentario; sin tablas, sin políticas, sin `alter`)
--   · Quita de `fn_produccion_fases_normalizar` la comprobación «la fecha prometida de un servicio ya pasó». Lo demás de esa fecha se queda: una fecha que NO EXISTE (30 de febrero, texto)
--     se sigue rechazando con `fase_fecha_invalida`, y la fecha de ENTREGA de la orden sigue sin poder ser pasada (`entrega_pasada`: otra función, `abrir_produccion`).
--   · Deja en su lugar el mismo comentario que tiene producción, letra por letra: la huella de la función en `main` tiene que ser la de producción.
--
-- EN PRODUCCIÓN NO HACE NADA: el texto nuevo ya está en la función viva, y el reemplazo anclado se detiene en silencio si lo que quiere poner ya está (re-ejecutable).
--
-- DECIDÍ: reemplazo ANCLADO (`pg_temp.reemplazar_anclado`, ADR-0288), como 20261028052000, y no reescribir la función entera: tiene varias capas y producción tiene la suya.
-- DESCARTÉ: (1) anotar la diferencia como «deriva conocida» del check: taparía una alerta que hoy funciona; (2) dejar `main` como está y esperar a que alguien lo arregle en producción:
--   Felipe dijo que la regla sigue. (3) Quitar también el aviso de la pantalla (`fase_fecha_pasada` en `orden-fases-reglas.ts`): no se pidió; la hoja de Nueva orden sigue pidiendo una fecha de
--   hoy en adelante y la base acepta además una pasada (la orden que ya se hizo). Queda anotado en el backlog.
-- SE ROMPE SI: alguien vuelve a pegar `20261019192000` (guarda un candado de md5 sobre esta función: se detiene, nunca se repega); o la función de producción cambia otra vez antes de pegar esto: el ancla
--   cuenta cuántas veces aparece el texto y se detiene sin tocar nada si no es exactamente una.
--
-- PRODUCCIÓN. Ya tiene este cambio (verificado por Felipe y por Claude, solo lectura, 2026-10-28): pegarlo no cambia nada. Una sola parte, `lock_timeout = 3s`, sin políticas.
--   Dentro de los textos no hay ningún `select … into` (ADR-0288). Prueba: `pnpm pruebas:produccion-fases` (caso A5) y `pnpm pruebas:produccion-cinco-pasos`.
-- ============================================================================

set lock_timeout = '3s';

-- Reemplaza `p_viejo` por `p_nuevo` en la función viva; `p_viejo` tiene que aparecer exactamente una vez. Si `p_nuevo` ya está, no hace nada.
create or replace function pg_temp.reemplazar_anclado(p_firma text, p_viejo text, p_nuevo text)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_nuevo in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta migración: el ancla aparece % veces (se esperaba 1). Regenera el reemplazo desde su definición real.',
      p_firma, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

select pg_temp.reemplazar_anclado(
  'retail.fn_produccion_fases_normalizar(jsonb)',
  $v$      if v_fecha is not null and v_fecha < retail.fn_hoy_lima() then
        raise exception 'La fecha prometida de «%» ya pasó', retail.fn_fase_nombre(v_clave) using hint = 'fase_fecha_pasada';
      end if;
$v$,
  $v$      -- ADR-0537: una fecha prometida pasada vale (se registra una orden que ya se hizo); solo una fecha que no existe se rechaza.
$v$
);

reset lock_timeout;
