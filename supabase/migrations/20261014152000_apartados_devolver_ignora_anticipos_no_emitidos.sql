-- ============================================================================
-- 20261014152000_apartados_devolver_ignora_anticipos_no_emitidos.sql — CAYLA V2 (Felipe, 2026-10-14; ADR-0399, parte 3 de 3)
--
-- EL PROBLEMA. Devolver el adelanto de un apartado intentaba una nota de crédito por CADA comprobante de anticipo ligado al
-- apartado. Con ADR-0399 los apartados nuevos no tienen ninguno (no hay nada que anular: el dinero vuelve y no se gasta un
-- correlativo). Queda un caso: el apartado VIEJO que sí tuvo su boleta de anticipo y cuya boleta se marcó «no emitida»
-- (`marcar_comprobante_no_emitido`: nunca salió a SUNAT, no hay nada que avisarle). Una nota de crédito sobre un comprobante que
-- nunca existió para SUNAT falla y deja un aviso «queda pendiente» que nadie puede resolver.
--
-- QUÉ HACE. `registrar_devolucion_separacion` salta los comprobantes de anticipo en estado `no_emitido` o `anulado`. Todo lo demás
-- queda igual: el egreso de caja de la devolución en efectivo, el estado `devuelta`, y la nota de crédito de un anticipo vivo.
--
-- PRODUCCIÓN. Una sola parte, re-ejecutable, sin tablas ni políticas. Reemplazo ANCLADO (la línea del filtro es de código, no de
-- comentario: producción no trae los mismos comentarios que el repo). Falla sin tocar nada si la función viva no es la revisada.
-- Pruebas: `pnpm pruebas:separaciones`.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

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

create or replace function pg_temp.firma(p_nombre text) returns text
language sql as $f$
  select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'retail' and p.proname = p_nombre;
$f$;

select pg_temp.reemplazar(pg_temp.firma('registrar_devolucion_separacion'),
  $v$where (id = s.comprobante_anticipo_id or (separacion_id = s.id and es_anticipo))$v$,
  $v$where (id = s.comprobante_anticipo_id or (separacion_id = s.id and es_anticipo)) and estado not in ('no_emitido', 'anulado') /* ADR-0399 */$v$,
  1);
