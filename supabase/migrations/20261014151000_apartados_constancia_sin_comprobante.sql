-- ============================================================================
-- 20261014151000_apartados_constancia_sin_comprobante.sql — CAYLA V2 (Felipe, 2026-10-14; ADR-0399, parte 2 de 3)
--
-- EL PROBLEMA. Apartar (y cada abono) emitía una boleta o factura de ANTICIPO: gastaba un correlativo de SUNAT por un dinero
-- que puede volver entero a la clienta, y si volvía había que anular con otra nota (otro correlativo). Felipe, 2026-10-14: el
-- adelanto es un pacto interno. La clienta se lleva una CONSTANCIA (el código APT-…, que ya existe); la boleta o factura sale
-- al entregar, por el total (parte 1, 20261014150000).
--
-- QUÉ HACE ESTA PARTE.
--   1. `separar_prendas` deja de emitir la boleta de anticipo. El adelanto sigue en `separacion_pagos` y, si es efectivo, en
--      `caja_movimientos` (custodia): el arqueo cuadra igual. `comprobante_anticipo_id` queda en NULL en todo apartado nuevo.
--   2. `abonar_separacion` deja de emitir el comprobante del abono (`comprobante_id` del abono queda en NULL).
--   3. `fn_verificar_separaciones` deja de exigir un comprobante de anticipo (ahora lo normal es que no exista) y exige lo que
--      sí debe existir: un apartado nuevo entregado tiene su boleta o factura.
-- NO se borra ninguna columna ni fila: `comprobante_anticipo_id`, `es_anticipo`, `anticipo_deducido` y `comprobante_anticipos`
-- siguen para los apartados que ya tienen su boleta de anticipo (hoy, uno).
--
-- ORDEN DE PEGADO EN PRODUCCIÓN (importa): pegar ANTES 20261014150000 (entregar por el total). Esta parte sola dejaría a un
-- apartado nuevo sin camino para entregarse.
--
-- PRODUCCIÓN. Una sola parte, re-ejecutable, sin tablas ni políticas. Reemplazos ANCLADOS por tramo sobre la función viva
-- (`pg_get_functiondef`): conservan lo que producción tenga y el repo no (el 2026-10-14 `fn_intento_con_huella` en
-- `separar_prendas` y `abonar_separacion`) y no dependen de los comentarios, que producción no trae igual. Falla sin tocar
-- nada si la función viva no es la revisada. Ningún texto de ancla lleva la palabra con que se guarda una consulta en una
-- variable (CLAUDE.md, «El SQL Editor agrega líneas por su cuenta»).
-- Pruebas: `pnpm pruebas:separaciones`, `pnpm pruebas:redondeo-efectivo`, `pnpm pruebas:purgar-producto`.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- Reemplazo simple: el texto viejo aparece exactamente p_veces; si el nuevo ya está, no hace nada.
create or replace function pg_temp.reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
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
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- Reemplazo opcional: solo si el texto viejo está (un comentario que producción puede no traer).
create or replace function pg_temp.reemplazar_si_esta(p_firma text, p_viejo text, p_nuevo text)
returns void
language plpgsql
as $f$
declare
  v_def text;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_viejo in v_def) > 0 then
    execute replace(v_def, p_viejo, p_nuevo);
  end if;
end;
$f$;

-- Reemplazo por TRAMO: borra desde la línea que contiene p_ini hasta el final de p_fin (incluidos) y pone p_nuevo. Cada ancla
-- debe aparecer exactamente una vez. Quita también los comentarios que quedan pegados arriba del tramo (hablaban de él). Si
-- p_marca ya está en la función, no hace nada (re-ejecutable). Las anclas empiezan en la sangría de su línea.
create or replace function pg_temp.cortar_tramo(p_firma text, p_ini text, p_fin text, p_nuevo text, p_marca text)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_i integer;
  v_f integer;
  v_antes text;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_marca in v_def) > 0 then
    return;
  end if;
  if (length(v_def) - length(replace(v_def, p_ini, ''))) / length(p_ini) <> 1
     or (length(v_def) - length(replace(v_def, p_fin, ''))) / length(p_fin) <> 1 then
    raise exception '% cambió desde que se escribió esta migración: las anclas «%» y «%» deben aparecer una sola vez. Regenera el reemplazo desde su definición real.',
      p_firma, p_ini, p_fin;
  end if;
  v_i := position(p_ini in v_def);
  v_f := position(p_fin in v_def) + length(p_fin) - 1;
  if v_f < v_i then
    raise exception '% : el final del tramo («%») viene antes de su comienzo («%»).', p_firma, p_fin, p_ini;
  end if;
  v_antes := substr(v_def, 1, v_i - 1);
  while v_antes ~ E'\n[ \t]*--[^\n]*\n$' loop
    v_antes := regexp_replace(v_antes, E'[ \t]*--[^\n]*\n$', '');
  end loop;
  execute v_antes || p_nuevo || substr(v_def, v_f + 1);
end;
$f$;

create or replace function pg_temp.firma(p_nombre text) returns text
language sql as $f$
  select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'retail' and p.proname = p_nombre;
$f$;

-- ---------- 1. Apartar: sin boleta de anticipo ----------

-- El tramo va desde el cálculo del IGV del adelanto hasta ligar el comprobante a la separación (comprobado en producción el
-- 2026-10-14). Entre medio estaba la consulta del detalle y la llamada a `emitir_comprobante`.
select pg_temp.cortar_tramo(pg_temp.firma('separar_prendas'),
  $v$  v_igv := round((v_adelanto - v_adelanto / 1.18) * 100) / 100;$v$,
  $v$  update separaciones set comprobante_anticipo_id = v_comp where id = v_id;$v$,
  $v$  -- ADR-0399: el adelanto es un pacto interno; no hay comprobante de anticipo. La clienta se lleva la CONSTANCIA (el código APT-…) y la
  -- boleta o factura sale una sola vez, al entregar, por el total. `comprobante_anticipo_id` queda en NULL.$v$,
  $v$ADR-0399: el adelanto es un pacto interno$v$);

select pg_temp.reemplazar(pg_temp.firma('separar_prendas'),
  $v$Un apartado se documenta con boleta o factura de anticipo (se pidió %)$v$,
  $v$Un apartado se documenta, al entregarlo, con boleta o factura (se pidió %)$v$,
  1);

-- ---------- 2. Abonar: sin comprobante del abono ----------

select pg_temp.cortar_tramo(pg_temp.firma('abonar_separacion'),
  $v$  v_igv := round((v_monto - v_monto / 1.18) * 100) / 100;$v$,
  $v$  update separacion_abonos set comprobante_id = v_comp where id = v_abono;$v$,
  $v$  -- ADR-0399: el abono tampoco emite comprobante (es parte del adelanto, un pacto interno). `comprobante_id` del abono queda en NULL.$v$,
  $v$ADR-0399: el abono tampoco emite comprobante$v$);

-- Quedaba, sin dueño, el comentario del comprobante que ya no se emite (producción puede no traerlo: por eso es opcional).
select pg_temp.reemplazar_si_esta(pg_temp.firma('abonar_separacion'),
  $v$-- SU comprobante de anticipo, con la misma clienta y el mismo tipo que el anticipo del apartado.$v$,
  $v$-- (ADR-0399: ya no se emite comprobante del abono; esta lectura solo sirve a los apartados viejos.)$v$);

-- ---------- 3. Verificador: ya no exige comprobante de anticipo ----------

select pg_temp.cortar_tramo(pg_temp.firma('fn_verificar_separaciones'),
  $v$  select s.id, s.codigo, 'sin comprobante de anticipo'$v$,
  $v$    from separaciones s where s.comprobante_anticipo_id is null;$v$,
  $v$  select s.id, s.codigo, 'entregada sin su boleta o factura'
    from separaciones s
   where s.estado = 'entregada' and s.comprobante_anticipo_id is null
     and not exists (select 1 from comprobantes c where c.venta_id = s.venta_id and c.tipo in ('boleta', 'factura'));$v$,
  $v$entregada sin su boleta o factura$v$);
