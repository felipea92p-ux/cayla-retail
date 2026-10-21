-- ============================================================================
-- 20261021005000_tienda_looks_trae_la_empresa_de_cada_prenda.sql — CAYLA V2 · Tienda online (ADR-0465)
-- Cada prenda de un look dice a qué empresa pertenece, para que la página del look la escriba encima de su nombre.
--
-- EL PROBLEMA PRIMERO. Un look puede mezclar prendas de CAYLA y de CLAURE (20261021003000) y solo sale en Lima. Sin la empresa en cada
-- prenda del look, quien lo mira no sabe cuál es de quién. Felipe (2026-10-21): «que cada prenda del look indique la empresa a la que
-- pertenece, encima de su nombre» (y no una frase del look: la frase es de quien arma el look, no del sistema).
--
-- ANALOGÍA CAYLA. La etiqueta del perchero ya estaba en cada prenda del catálogo (20261021001000); esto la copia a cada prenda de la lámina.
--
-- QUÉ HACE. `fn_tienda_looks_json` (la que arman `tienda_looks` y `tienda_look`) suma a cada prenda del look `'empresa'`, tomada de la
-- prenda del catálogo de ESA tienda: con la misma regla de 20261021001000, solo viaja en una tienda donde operan dos o más empresas
-- (Lima); en Trujillo va `null` y la página no escribe nada. Un dato más del mismo objeto: la web de antes lo ignora y, si no llega,
-- la web nueva no escribe la empresa (principio 9: se degrada, no se cae).
--
-- DECIDÍ: reutilizar el `empresa` del catálogo (una sola regla de cuándo se dice) y no volver a preguntarle a `fn_empresas_de_sede`.
-- DESCARTÉ: usar la frase del look para decir la empresa: es un texto libre que escribe la persona que arma el look.
--
-- SE ROMPE SI: se arma una lista de prendas de look por otro camino que no pase por `fn_tienda_looks_json` (no traería `empresa`).
--
-- PRODUCCIÓN. Una sola parte, idempotente (se puede pegar dos veces): un reemplazo anclado; no toma tablas en exclusiva ni toca
-- políticas (sin riesgo de 40P01). Cuenta que su ancla aparezca UNA vez: si alguien cambió la función, se detiene sin tocar nada. Sin
-- `select … into` dentro de un texto entre comillas. El orden con la publicación de la web no importa. Requiere 20261021001000.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function pg_temp.reemplazar_anclado(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  -- Ya aplicado: el texto nuevo está. Se mira primero porque, una vez aplicado, el ancla vieja ya no aparece y el conteo abortaría.
  if position(p_nuevo in v_def) > 0 and position(p_viejo in v_def) = 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: el ancla aparece % veces (se esperaban %). Regenera el reemplazo desde su definición real.',
      p_firma, v_n, p_veces;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

select pg_temp.reemplazar_anclado(
  'retail.fn_tienda_looks_json(jsonb, uuid[], uuid, boolean)',
  $v$'nombre', x.prenda -> 'nombre',$v$,
  $v$'nombre', x.prenda -> 'nombre',
                     -- ADR-0465: de qué empresa es la prenda (solo en una tienda con dos o más empresas: la misma regla del catálogo).
                     'empresa', x.prenda -> 'empresa',$v$,
  1
);

select 'ADR-0465 · tienda: cada prenda de un look trae su empresa' as parte,
       case when pg_get_functiondef('retail.fn_tienda_looks_json(jsonb, uuid[], uuid, boolean)'::regprocedure) like '%''empresa'', x.prenda -> ''empresa''%'
            then 'QUEDÓ BIEN' else 'REVISAR' end as resultado;
