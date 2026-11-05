-- ============================================================================
-- 20261019190000_terminales_de_lima_sin_responsable.sql — CAYLA V2 (ADR-0454; pedido de Felipe, 2026-10-19)
--
-- ACTIVA la firma de respaldo (20261019185000) en las dos terminales de la Tienda LIM —«Caja Lima» y «Almacén Lima»—
-- a nombre de Felipe Alvarez (admin y líder de retail): desde que esto corre, esas dos cuentas NO piden «Responsable» en
-- ningún módulo y lo que guardan queda firmado por él (el aparato queda en `terminal_id`). Solo Lima: las terminales de
-- Trujillo y Arequipa siguen pidiendo responsable.
--
-- ES MOMENTÁNEO: hasta que la asistencia de Lima llegue desde Dynamic (con ella el combo vuelve a tener a quién ofrecer).
--
-- PARA VOLVER (una línea, sin tocar la web ni redeployar):
--   update retail.terminales set firma_respaldo_id = null where firma_respaldo_id is not null;
--
-- Por qué es un archivo aparte: 20261019185000 es el mecanismo y no cambia nada hasta que una terminal tenga persona;
-- este es el interruptor, con el OK de Felipe, y se pega cuando el mecanismo ya está. Los datos son de producción: en una
-- base sin esa persona o sin esas terminales (local, CI) no hace nada y avisa.
--
-- Re-ejecutable. Una sola parte: un `update` de datos sobre `terminales`, sin políticas (ADR-0195).
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

do $$
declare
  c_felipe constant uuid := '13ef8ea3-7bd4-4522-bae0-264c087ece5f'; -- public.personas: Felipe Alvarez (admin, líder en retail)
  v_filas integer;
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'retail' and table_name = 'terminales' and column_name = 'firma_respaldo_id') then
    raise exception 'Falta retail.terminales.firma_respaldo_id: pega antes 20261019185000_terminal_firma_de_respaldo.sql';
  end if;

  if not exists (select 1 from public.personas p join retail.colaboradores c on c.persona_id = p.id
                 where p.id = c_felipe and p.estado = 'activo') then
    raise notice 'ADR-0454: esta base no tiene a la persona de respaldo (no es producción); no se activa ninguna terminal.';
    return;
  end if;

  update retail.terminales t
     set firma_respaldo_id = c_felipe
    from retail.ubicaciones u
   where u.id = t.ubicacion_id
     and u.nombre = 'Tienda LIM'
     and t.activo
     and t.firma_respaldo_id is distinct from c_felipe;
  get diagnostics v_filas = row_count;
  raise notice 'ADR-0454: % terminal(es) de Tienda LIM firman ahora a nombre de Felipe Alvarez.', v_filas;
end $$;
