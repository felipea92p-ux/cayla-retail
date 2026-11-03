-- ============================================================================
-- 20261103182000_modelos_en_cero_al_contar.sql — CAYLA V2 · ADR-0604 (act. 2026-11-03)
-- Recibir ▸ Contar: un modelo agregado nace en 0, puede llevar una descripción y puede tener un nombre por defecto («Blusa 1»).
--
-- EL PROBLEMA PRIMERO. Felipe quiere contar dos blusas sin marca como dos modelos, sin pasar por un «Total de Blusas» que confunde. Decidió que
-- el modelo nazca en 0 y se cuente después, que si nadie sabe su nombre quede como «Blusa 1» sin dejar cerrar el envío, y que se pueda
-- describir para no confundir dos parecidos. Hasta hoy, en lo separado de una línea (`despacho_conteos.separado`) un modelo solo existía con 1 o
-- más prendas: uno en 0 no se podía guardar, y al recargar o desde otro aparato se perdía.
--
-- QUÉ CAMBIA (todo con reemplazos ANCLADOS sobre la definición viva: si el texto no es el esperado, se detiene sin cambiar nada)
--   1. `fn_envio_sin_ceros` (nueva): lo separado sin los modelos en 0. Es lo que manda el cierre y lo que entra por un pendiente.
--   2. `fn_envio_leer_separado`: acepta cantidad 0 en una prenda del catálogo y en una nueva CON nombre (sin nombre sigue exigiendo 1 o más), y
--      conserva dos datos nuevos de la nueva: `nota` (la descripción, hasta 200 letras) y `por_defecto` (su nombre es provisional; pide nombre).
--      No se agrega columna: `separado` ya es un jsonb, y `despacho_conteos_separado_forma` no mira las cantidades.
--   3. `cerrar_conteo_envio`: no cierra mientras una línea tenga un modelo CONTADO con nombre por defecto (`recepcion_modelo_sin_nombre`), y
--      descarta los modelos en 0: no dejan pendiente, ni costo, ni nada. Uno en 0 con nombre por defecto no frena.
--   4. `resolver_pendiente_envio`: lo que entra por un pendiente tampoco deja filas en 0 (`despacho_pendientes.cantidad` va de 1 en adelante).
--
-- LO QUE NO CAMBIA
--   · Cuánto se contó y lo que entra al stock: un modelo en 0 no suma en `fn_envio_total_separado` y `despacho_conteos_separado_cabe` sigue igual.
--   · `guardar_conteo_envio`: sus permisos, su versión y la regla de que lo separado no pase de lo contado.
--   · Lo que la web de hoy manda sigue valiendo: esta migración solo acepta más. Por eso se pega ANTES de publicar la web nueva.
--
-- DESCARTÉ
--   · Guardar el modelo en 0 solo en el navegador: se perdía al recargar, y otra persona contando el mismo envío no lo veía (Felipe 2026-11-03).
--   · Una tabla de modelos del conteo: partir `separado` en filas tocaría el cierre, los pendientes y reabrir, para el mismo resultado.
--   · Detectar «Blusa 1» por su texto: una blusa puede llamarse así de verdad, y la marca `por_defecto` dice quién lo decidió.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). UNA parte, sin políticas ni `drop trigger` (ADR-0195), idempotente.
-- ============================================================================

set lock_timeout = '3s';

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
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición viva.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- ---------- 1. Lo separado sin los modelos en 0 ----------
create or replace function retail.fn_envio_sin_ceros(p_separado jsonb)
returns jsonb
language sql
immutable
set search_path = retail, public, extensions
as $$
  select jsonb_build_object(
    'prendas', coalesce((select jsonb_agg(e.x order by e.o) from jsonb_array_elements(coalesce(p_separado -> 'prendas', '[]'::jsonb)) with ordinality e(x, o)
                          where (e.x ->> 'cantidad')::integer > 0), '[]'::jsonb),
    'nuevas', coalesce((select jsonb_agg(e.x order by e.o) from jsonb_array_elements(coalesce(p_separado -> 'nuevas', '[]'::jsonb)) with ordinality e(x, o)
                         where (e.x ->> 'cantidad')::integer > 0), '[]'::jsonb));
$$;
comment on function retail.fn_envio_sin_ceros(jsonb) is
  'ADR-0604 (act. 2026-11-03): lo separado de una línea sin los modelos que quedaron en 0. Un modelo en 0 existe mientras se cuenta; al cerrar se descarta.';
revoke all on function retail.fn_envio_sin_ceros(jsonb) from public, anon;
grant execute on function retail.fn_envio_sin_ceros(jsonb) to authenticated, service_role;

-- ---------- 2. Lo que se acepta al guardar ----------
select pg_temp.reemplazar('retail.fn_envio_leer_separado(jsonb,text)',
$v$    if v_cantidad is null or v_cantidad <> trunc(v_cantidad) or v_cantidad < 1 or v_cantidad > 99999 then
      raise exception 'Cuántas llegaron de cada prenda de % va de 1 a 99 999, sin decimales', p_donde using hint = 'conteo_cantidad';$v$,
$n$    if v_cantidad is null or v_cantidad <> trunc(v_cantidad) or v_cantidad < 0 or v_cantidad > 99999 then
      raise exception 'Cuántas llegaron de cada prenda de % va de 0 a 99 999, sin decimales', p_donde using hint = 'conteo_cantidad';$n$,
1);

select pg_temp.reemplazar('retail.fn_envio_leer_separado(jsonb,text)',
$v$    if v_cantidad is null or v_cantidad <> trunc(v_cantidad) or v_cantidad < 1 or v_cantidad > 99999 then
      raise exception 'Cuántas nuevas llegaron de % va de 1 a 99 999, sin decimales', p_donde using hint = 'conteo_cantidad';$v$,
$n$    if v_cantidad is null or v_cantidad <> trunc(v_cantidad) or v_cantidad < 0 or v_cantidad > 99999 then
      raise exception 'Cuántas nuevas llegaron de % va de 0 a 99 999, sin decimales', p_donde using hint = 'conteo_cantidad';$n$,
1);

select pg_temp.reemplazar('retail.fn_envio_leer_separado(jsonb,text)',
$v$    v_nuevas := v_nuevas || jsonb_build_object('cantidad', v_cantidad::integer, 'descripcion', v_desc);$v$,
$n$    -- ADR-0604 (act. 2026-11-03): en 0 solo existe un modelo con nombre; sin nombre sigue siendo «llegaron N y aún no sé cuáles».
    if v_desc is null and (v_cantidad = 0 or v_n ->> 'por_defecto' = 'true') then
      raise exception 'Un modelo de % necesita su nombre para quedar en la lista', p_donde using hint = 'conteo_cantidad';
    end if;
    if length(btrim(coalesce(v_n ->> 'nota', ''))) > 200 then
      raise exception 'Lo que describe a un modelo de % es muy largo: hasta 200 letras', p_donde using hint = 'conteo_nueva_descripcion';
    end if;
    v_nuevas := v_nuevas || (jsonb_build_object('cantidad', v_cantidad::integer, 'descripcion', v_desc)
      || case when btrim(coalesce(v_n ->> 'nota', '')) <> '' then jsonb_build_object('nota', btrim(v_n ->> 'nota')) else '{}'::jsonb end
      || case when v_n ->> 'por_defecto' = 'true' then '{"por_defecto": true}'::jsonb else '{}'::jsonb end);$n$,
1);

-- ---------- 3. Al cerrar: el nombre por defecto frena y lo que quedó en 0 se descarta ----------
select pg_temp.reemplazar('retail.cerrar_conteo_envio(uuid,integer,jsonb,text,uuid)',
$v$    v_sep := retail.fn_envio_leer_separado(v_k.separado, v_k.donde);$v$,
$n$    v_sep := retail.fn_envio_leer_separado(v_k.separado, v_k.donde);
    -- ADR-0604 (act. 2026-11-03): un modelo contado no se cierra con su nombre provisional, y uno en 0 no deja rastro.
    if exists (select 1 from jsonb_array_elements(v_sep -> 'nuevas') x where x ->> 'por_defecto' = 'true' and (x ->> 'cantidad')::integer > 0) then
      raise exception 'Cambia el nombre de «%» antes de cerrar', (select x ->> 'descripcion' from jsonb_array_elements(v_sep -> 'nuevas') x
                                                                  where x ->> 'por_defecto' = 'true' and (x ->> 'cantidad')::integer > 0 limit 1)
        using hint = 'recepcion_modelo_sin_nombre';
    end if;
    v_sep := retail.fn_envio_sin_ceros(v_sep);$n$,
1);

-- ---------- 4. Por un pendiente tampoco entran filas en 0 ----------
select pg_temp.reemplazar('retail.resolver_pendiente_envio(uuid,uuid,integer,uuid,jsonb,boolean,uuid)',
$v$  v_sep := retail.fn_envio_leer_separado(p_separado, v_k.donde);$v$,
$n$  v_sep := retail.fn_envio_sin_ceros(retail.fn_envio_leer_separado(p_separado, v_k.donde));$n$,
1);

-- ---------- 5. Comprobación ----------
do $$
begin
  if position('por_defecto' in pg_get_functiondef('retail.fn_envio_leer_separado(jsonb,text)'::regprocedure)) = 0 then
    raise exception 'fn_envio_leer_separado no quedó con el nombre por defecto';
  end if;
  if position('recepcion_modelo_sin_nombre' in pg_get_functiondef('retail.cerrar_conteo_envio(uuid,integer,jsonb,text,uuid)'::regprocedure)) = 0 then
    raise exception 'cerrar_conteo_envio no quedó frenando el nombre por defecto';
  end if;
  if position('fn_envio_sin_ceros' in pg_get_functiondef('retail.resolver_pendiente_envio(uuid,uuid,integer,uuid,jsonb,boolean,uuid)'::regprocedure)) = 0 then
    raise exception 'resolver_pendiente_envio no quedó sin los modelos en 0';
  end if;
end;
$$;

reset lock_timeout;
