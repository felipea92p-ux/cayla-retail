-- ============================================================================
-- 20260923120000_conteo_vacio_no_se_cierra.sql — CAYLA V2 · ADR-0174
--
-- Un conteo sin prendas no se cierra: se cancela (`anular_conteo`).
--
-- EL PROBLEMA. En Tienda Trujillo los cuatro conteos cerrados al 2026-09-22 tienen 0 prendas contadas, y el
-- historial los pintaba «Sin diferencias» en verde: una afirmación sobre el inventario que no se apoyaba en ninguna
-- prenda. La pantalla ya apagaba «Revisar y cerrar» con 0 prendas, pero `cerrar_conteo` los aceptaba igual (por la
-- API, desde una terminal o desde una versión anterior de la pantalla). Principio 2: si el estado imposible entra
-- por la base, se corrige en la base, no con un botón gris.
--
-- QUÉ CAMBIA. `cerrar_conteo` rechaza, con `hint = 'conteo_vacio'` y un mensaje que dice qué hacer, un conteo que no
-- tiene ninguna fila en `conteo_items`. Va DESPUÉS de los rechazos de siempre (no existe, ya no está abierto, sin
-- permiso) y ANTES de tocar stock: el conteo sigue abierto y se puede contar o cancelar.
--
-- QUÉ NO CAMBIA. Nada de lo ya cerrado (los 4 vacíos de TRU se quedan como están: la pantalla los muestra «Vacío» y
-- no cuentan para la exactitud). Nada del cierre con prendas. `anular_conteo` sigue siendo la salida.
--
-- CÓMO. Igual que `20260922200000_terminales_por_tienda.sql`: se inserta un bloque ANTES de una línea ancla de la
-- definición REAL (`pg_get_functiondef`), para no reescribir a mano un cuerpo que ya parcharon varias migraciones
-- (candado de terminal, firma del responsable). Aborta si el ancla no aparece exactamente una vez, y se puede pegar
-- dos veces (la marca dice si ya está).
--
-- PRODUCCIÓN: no aplicada todavía (ver BACKLOG). Se pega tal cual en el SQL Editor: ya usa `retail.` en todo.
-- ============================================================================

create or replace function pg_temp.insertar_antes(p_firma text, p_ancla text, p_bloque text, p_marca text)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_marca in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_ancla, ''))) / length(p_ancla);
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta migración: el ancla aparece % veces (se esperaba 1). Regenera el bloque desde su definición real.',
      p_firma, v_n;
  end if;
  execute replace(v_def, p_ancla, p_bloque || p_ancla);
end;
$f$;

select pg_temp.insertar_antes(
  'retail.cerrar_conteo(uuid)',
  'for r in select * from conteo_items where conteo_id = p_conteo_id and diferencia is null loop',
  $bloque$-- conteo_vacio_no_se_cierra (ADR-0174): sin prendas contadas no hay nada que aprobar; se cancela.
  if not exists (select 1 from conteo_items where conteo_id = p_conteo_id) then
    raise exception 'Este conteo no tiene ninguna prenda contada: no se cierra. Si no se va a contar, cancélalo.'
      using errcode = 'P0001', hint = 'conteo_vacio';
  end if;

  $bloque$,
  'conteo_vacio_no_se_cierra'
);

comment on function retail.cerrar_conteo(uuid) is
  'Cierra un conteo abierto: ajusta el stock a lo contado (un movimiento de ajuste por prenda con diferencia) y lo '
  'marca cerrado. Rechaza un conteo sin prendas contadas (hint conteo_vacio, ADR-0174): ese se cancela con anular_conteo.';
