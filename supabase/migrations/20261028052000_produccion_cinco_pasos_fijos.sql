-- ============================================================================
-- 20261028052000_produccion_cinco_pasos_fijos.sql — CAYLA V2 (ADR-0551, actividad 1 · 2026-10-28)
--
-- EL PROBLEMA PRIMERO. La ruta nueva de una orden exige SIETE pasos (Ploteo, Corte, Habilitado, Costura, Limpiar hilos y revisar, Planchado y Etiquetar y embolsar:
-- `fn_produccion_fases_normalizar`, hint `fases_espina`). Felipe (2026-10-27) decidió que los fijos son CINCO —Ploteo, Corte, Habilitado, Costura y Planchado— y que
-- «Limpiar hilos y revisar» y «Etiquetar y embolsar» son opcionales (los hace la tienda). Con la regla de hoy una orden de cinco pasos NO SE PUEDE ABRIR.
--
-- QUÉ HACE (una sola función, un reemplazo ANCLADO de dos líneas; sin tablas, sin políticas, sin `alter`)
--   · La ruta nueva exige Ploteo, Corte, Habilitado, Costura y Planchado. Limpiar hilos y revisar, Etiquetar y embolsar, Ojales y botones, Bordado, Estampado y Lavandería
--     siguen siendo claves válidas y se aceptan en cualquier combinación, en el orden de `fn_fase_secuencia`.
--   · Lo demás no cambia: `acabado` sigue rechazado en la ruta nueva (`fases_mezcla`), la ruta anterior (Corte · Costura · Acabado) sigue igual, y una orden ya abierta con siete
--     pasos sigue válida (nada reescribe filas de `produccion_fases`).
--
-- POR QUÉ NO HACE FALTA TOCAR MÁS (verificado en el código, no supuesto)
--   · «La última fase» de una orden es la de mayor `secuencia` ENTRE LAS QUE TIENE (`cerrar_produccion`, 20261014160000:114-115): con cinco pasos es Planchado y el candado de las
--     buenas mira ahí. `fn_produccion_fase_anterior` y `fn_produccion_fase_siguiente` recorren por `secuencia` y saltan los hitos, así que tampoco suponen que existan siete.
--   · `cambiar_quien_fase` valida contra las fases reales de la orden (20261019191000), no contra una lista fija.
--
-- DECIDÍ: reemplazo ANCLADO (`pg_temp.reemplazar_anclado`, ADR-0288) sobre la función viva y no `create or replace` de la función entera. Esa función ya tiene cuatro capas
--   (154000, 191000, 192000 y la que llamó 20261026152000); reescribirla entera copia el cuerpo de una capa vieja y pisa en silencio lo que otra rama le sume. El ancla cuenta
--   cuántas veces aparece el texto y se detiene sin tocar nada si no es exactamente una.
-- DESCARTÉ: una tercera ruta («de cinco») al lado de la anterior y la nueva: cada función que mira la ruta tendría una rama más, y una orden de cinco pasos es la ruta nueva con
--   dos opcionales apagados, no otra ruta. Y quitar `limpieza_revision`/`etiquetado_embolsado` de las claves válidas: rompería lo que ya se abrió con ellos.
-- SE ROMPE SI: la web sale ANTES que esta migración y manda cinco pasos: la base responde `fases_espina` y nadie puede abrir una orden, así que la migración va PRIMERO (pegarla
--   antes que la web no rompe nada: siete pasos sigue siendo válido). Y si otra rama parcha las mismas dos líneas, el ancla se detiene sin tocar nada.
-- AVISO PARA 20261019192000: esa migración guarda un candado de md5 sobre `fn_produccion_fases_normalizar`. Esta migración cambia ese cuerpo a propósito, así que volver a pegar
--   20261019192000 DESPUÉS de esta se detiene (nunca se repega: ya está en producción). `produccion_ploteo.mjs` la recarga en cada caso y deshace este parche antes.
--
-- PRODUCCIÓN. NO está aplicada. Una sola parte, re-ejecutable, `lock_timeout = 3s`: solo reemplaza una función, no toma las tablas de `auth` ni de `storage`.
--   Dentro de los textos no hay ningún `select … into` (ADR-0288). Prueba: `pnpm pruebas:produccion-cinco-pasos`.
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
  $v$    if not (v_claves @> array['ploteo', 'corte', 'habilitado', 'costura', 'limpieza_revision', 'planchado', 'etiquetado_embolsado']) then
      raise exception 'La orden necesita sus fases: Ploteo, Corte, Habilitado, Costura, Limpiar hilos y revisar, Planchado y Etiquetar y embolsar'$v$,
  $v$    if not (v_claves @> array['ploteo', 'corte', 'habilitado', 'costura', 'planchado']) then
      raise exception 'La orden necesita sus fases: Ploteo, Corte, Habilitado, Costura y Planchado'$v$
);

reset lock_timeout;
