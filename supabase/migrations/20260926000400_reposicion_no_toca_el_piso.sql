-- ============================================================================
-- 20260926000400_reposicion_no_toca_el_piso.sql — CAYLA V2 · ADR-0208 «Frescura del piso», paso 1 · PARTE 5 de 5
-- El ajuste «Reposición» ya no toca el piso (decidido por Felipe el 2026-09-25).
--
-- EL PROBLEMA. Frescura mide cuántos días lleva una prenda colgada, desde su bajada del almacén. Pero en
-- Existencias ▸ Ajustar stock ▸ Piso ▸ «Reposición» se podía sumar prendas al piso SIN sacarlas del almacén: aparecían de
-- la nada, sin bajada y sin hora de colgado (según los lectores del 2026-09-25, 92 de las 146 unidades del piso de
-- producción entraron así). Con esa puerta abierta, la pantalla «Bajar prendas al piso» compite con un atajo y el reloj
-- de piso queda con huecos. Y al revés, una «Reposición» negativa en el piso hace desaparecer prendas que nunca llegan
-- al almacén.
--
-- QUÉ HACE. Inserta en la definición VIVA de `retail.registrar_movimiento` un candado: un ajuste con motivo
-- «reposicion» sobre la sububicación de tipo `piso_venta` se rechaza (suba o baje). Siguen abiertos los caminos que sí
-- dejan rastro: «Bajar al piso» (`bajar_al_piso`, botón de Existencias) y «Reponer» (`mover_interno`), que sacan del almacén; y
-- «Conteo físico» para lo que se encuentra de más al contar. Las tiendas que no separan piso y almacén (el Taller) no
-- cambian: su ajuste va sin sububicación. El almacén tampoco cambia (pendiente anotado en el BACKLOG).
--
-- POR QUÉ SE INSERTA Y NO SE REESCRIBE. La definición viva no está en ningún archivo: es 20260921120000 más los
-- reemplazos en vivo de 20260922200000 (candado por capacidad) y 20260923100000 (firma del responsable). Reescribirla
-- desde un archivo borraría esos parches en silencio. `pg_temp.insertar_antes` (el mismo de 20260922200000) pone el
-- bloque antes de una línea ancla que debe aparecer UNA sola vez y aborta si no; la marca `reposicion_piso_cerrada`
-- la vuelve re-pegable. El candado va DESPUÉS de los de permiso y de ubicación: a quien no puede ajustar, el mensaje
-- sigue siendo el de permiso.
--
-- ESTADO QUE DEJA DE SER POSIBLE: stock del piso que sube o baja por un ajuste «Reposición». Lo histórico no se toca
-- (movimientos es de solo agregar): esas filas siguen rotuladas «Ajuste · reposición» en Movimientos.
--
-- ORDEN AL PEGAR (cinco partes, cada una sola en el SQL Editor; archivos 20260926000000 a 20260926000400):
--   0000 módulo → 0100 tablas → 0200 funciones de escritura → 0300 lectura de Frescura → publicar la web → 0400
--   («Reposición» ya no toca el piso). La 0400 va DESPUÉS de la web porque su mensaje manda al botón «Bajar al piso» de
--   Existencias, que recién existe con la web publicada.
-- ESTA es la 0400: si se pega antes de publicar la web, cierra la puerta y manda a un botón que todavía no está.
--
-- CÓMO SE PEGA: tal cual en el SQL Editor de producción (ya trae `retail.`). Solo reemplaza una función: no toma
-- candados de tablas en uso ni lleva políticas (ADR-0195 no aplica). Se puede pegar dos veces.
--
-- SE ROMPE SI: alguien vuelve a pegar 20260921120000 (recrea la función desde el archivo y borra este candado junto con
-- los otros parches en vivo), o alguien usa «Otro» / «Conteo físico» para subir prendas al piso: ninguna base impide
-- mentir sobre el motivo; eso lo muestra `fn_bajadas_del_piso` como piso que sube sin bajada.
-- ============================================================================

set search_path = retail, public, extensions;

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
  'retail.registrar_movimiento(uuid, uuid, text, integer, text, text, uuid)',
  'v_sub := coalesce(p_sububicacion_id,',
  $bloque$-- ADR-0208: «Reposición» no sube ni baja prendas del piso; lo que viene del almacén se baja (reposicion_piso_cerrada).
  if p_tipo = 'ajuste' and lower(btrim(coalesce(p_motivo, ''))) in ('reposicion', 'reposición') and exists (
    select 1 from sububicaciones where id = p_sububicacion_id and tipo = 'piso_venta'
  ) then
    raise exception '«Reposición» no se usa en el piso: las prendas que suben del almacén se registran con «Bajar al piso» o con «Reponer», en Existencias, para que salgan del almacén (si ninguno te aparece, pídele al líder que active «Bajada al piso» en tu rol). Si al contar encontraste prendas de más, elige «Conteo físico».'
      using hint = 'reposicion_piso_cerrada';
  end if;
  $bloque$,
  'reposicion_piso_cerrada'
);

notify pgrst, 'reload schema';
