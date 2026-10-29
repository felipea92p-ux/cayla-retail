-- ============================================================================
-- Mis compras · «Revisar compras» dice por qué una compra o un gasto NO pasó solo (ADR-0574, actividad 6 de 7).
--
-- EL PROBLEMA PRIMERO. Desde las actividades 3 a 5 lo que anota la compradora pasa solo a los libros; a la bandeja de Compras solo llega lo que NO
-- pudo pasar (un comprobante repetido, un gasto sin una compra a la que ir…) y lo de antes de este cambio (sin serie ni papel). Si Compras abre uno y no
-- sabe por qué está ahí, vuelve a ser trabajo a ciegas. La base ya guarda el motivo (`pasa_sola_error`, 20261029194000 y 20261029195000): falta contarlo.
--
-- QUÉ HACE. `fn_revisar_compras` suma, en cada compra y cada gasto por revisar, el motivo (`pasa_sola_error`) y lo que la compradora escribió al
-- anotar (la serie y el número del papel, y el papel y el RUC del gasto), para que Compras solo corrija en vez de copiar de la foto.
-- Solo una función (reemplazo anclado, ADR-0195); sin tablas ni políticas. Idempotente.
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

select pg_temp.reemplazar('retail.fn_revisar_compras()',
$v$'foto_ruta', cp.foto_ruta, 'fecha', cp.fecha, 'creado_en', cp.created_at,$v$,
$v$'foto_ruta', cp.foto_ruta, 'fecha', cp.fecha, 'creado_en', cp.created_at,
               'serie', cp.serie, 'numero', cp.numero, 'pasa_sola_error', cp.pasa_sola_error,$v$, 1);

select pg_temp.reemplazar('retail.fn_revisar_compras()',
$v$'foto_ruta', g.foto_ruta, 'fecha', g.fecha,$v$,
$v$'foto_ruta', g.foto_ruta, 'fecha', g.fecha, 'papel', g.papel, 'ruc', g.ruc, 'pasa_sola_error', g.pasa_sola_error,$v$, 1);
