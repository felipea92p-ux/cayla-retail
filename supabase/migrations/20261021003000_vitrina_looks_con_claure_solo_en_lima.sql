-- ============================================================================
-- 20261021003000_vitrina_looks_con_claure_solo_en_lima.sql — CAYLA V2 · Vitrina web ▸ Looks (ADR-0463, ADR-0465)
-- Un look puede llevar prendas de CLAURE; ese look solo se ve en la tienda online cuando la tienda elegida es una donde CLAURE opera
-- (hoy, Lima).
--
-- EL PROBLEMA PRIMERO. 20261021000000 escondió CLAURE del catálogo «sin tienda», y el editor de looks de la Vitrina del ERP lo usa para
-- dos cosas: ofrecer las prendas que se pueden poner en un look y comprobar, al publicar, que cada prenda «se ve en la web en ese
-- color». Resultado: una prenda de CLAURE ni aparecía para elegirla, y un look con una prenda suya se rechazaba
-- (`vitrina_look_prenda_no_se_ve`). Felipe (2026-10-21): «validar si un look contiene algún producto CLAURE: si es así, ese look solo
-- debe estar disponible en la tienda cuando la sede sea Lima».
--
-- ANALOGÍA CAYLA. El look es una lámina de percheros con 2 a 4 prendas. La lámina cuelga en la vidriera de una tienda solo si TODAS sus
-- prendas están en esa tienda: una lámina con una prenda de CLAURE cuelga solo en Lima, sin que nadie lo tenga que marcar.
--
-- LO QUE YA HACÍA BIEN. La tienda (`tienda_looks`, `tienda_look`) muestra un look solo si todas sus prendas están en el catálogo DE ESA
-- TIENDA (`fn_tienda_looks_json`). Como el catálogo de Trujillo ya no trae CLAURE, un look con una prenda suya no sale en Trujillo ni
-- por su enlace, y sí en Lima: «solo en Lima» sale solo de la regla de ADR-0465, sin tocar la tienda. Lo que faltaba era el editor.
--
-- QUÉ HACE
--   1. `fn_vitrina_catalogo_de_looks()`: el catálogo del editor de looks = las prendas que se ven en la web en ALGUNA tienda (el catálogo
--      sin tienda, más el de cada tienda de la web: así entran las de CLAURE, que solo salen en las tiendas donde opera). Una prenda que
--      está en varios se toma del catálogo sin tienda.
--   2. `fn_vitrina_looks` (el editor: sus looks y las prendas a elegir), `vitrina_guardar_look` y `vitrina_mostrar_look` (guardar o
--      mostrar un look, y la respuesta con la que se redibuja) usan ese catálogo en lugar del catálogo sin tienda.
--
-- DECIDÍ: validar contra «alguna tienda» y no «todas»: lo que importa al publicar es que cada prenda SE VE en algún lado y que el look
--   completo tiene un lugar donde mostrarse; en qué tiendas sale el look lo decide cada catálogo de tienda, no el editor.
-- DECIDÍ: no avisar en el editor «solo en Lima»: el editor ya muestra qué prendas lleva; escribir ese aviso es una pantalla nueva del
--   ERP y se pide aparte (ADR-0465, «Lo que queda»).
-- DESCARTÉ: marcar el look con una tienda (`vitrina_looks.ubicacion_id`): dos datos que se contradicen (el look dice una tienda, las
--   prendas dicen otra) en lugar de dejar que la regla de las prendas lo decida.
-- DESCARTÉ: dejar el catálogo del editor como estaba y rechazar los looks con CLAURE (lo que había entre 20261021000000 y este archivo).
--
-- SE ROMPE SI: se suma otra tienda a la web donde una prenda se ve con otro precio: el editor la toma del catálogo sin tienda cuando
--   está (los precios del editor se calculan aparte, con `fn_tienda_precios`), así que no cambia nada visible.
--
-- PRODUCCIÓN. Una sola parte, idempotente (se puede pegar dos veces): una función nueva y tres reemplazos anclados; no toma tablas en
-- exclusiva ni toca políticas (sin riesgo de 40P01). Cada reemplazo cuenta que su ancla aparezca las veces esperadas: si alguien cambió
-- la función, se detiene sin tocar nada. Sin `select … into` dentro de un texto entre comillas. El orden con la publicación de la web no
-- importa (la web no cambia). Requiere 20261021000000.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. El catálogo del editor de looks ----------
create or replace function retail.fn_vitrina_catalogo_de_looks()
returns jsonb
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select jsonb_build_object(
           'sede', null,
           'prendas', coalesce(jsonb_agg(u.p order by u.p ->> 'nombre', u.p ->> 'id'), '[]'::jsonb))
    from (
      select distinct on (x.p ->> 'id') x.p
        from (
          -- Lo que se ve «sin tienda» (todo lo de CAYLA), primero: si una prenda está en los dos, gana este.
          select p, 0 as orden
            from jsonb_array_elements(coalesce(retail.tienda_catalogo(null::uuid) -> 'prendas', '[]'::jsonb)) p
          union all
          -- Y lo que se ve en cada tienda de la web: así entran las de CLAURE, que solo salen donde CLAURE opera.
          select p, 1
            from unnest(retail.fn_tienda_sedes_web()) s (id)
            cross join lateral jsonb_array_elements(coalesce(retail.tienda_catalogo(s.id) -> 'prendas', '[]'::jsonb)) p
        ) x
       order by x.p ->> 'id', x.orden
    ) u
$$;

revoke all on function retail.fn_vitrina_catalogo_de_looks() from public, anon, authenticated;

comment on function retail.fn_vitrina_catalogo_de_looks() is
  'ADR-0465: el catálogo del editor de looks de la Vitrina: las prendas que se ven en la web en alguna tienda (sin tienda + cada tienda de la web). Solo la llaman las vitrina_* y fn_vitrina_looks.';

-- ---------- 2. El reemplazo anclado, con el número de veces que el ancla debe aparecer ----------
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

-- ---------- 3. El editor, guardar y mostrar un look usan el catálogo del editor ----------
select pg_temp.reemplazar_anclado('retail.fn_vitrina_looks()',
  $v$retail.tienda_catalogo(null::uuid)$v$, $v$retail.fn_vitrina_catalogo_de_looks()$v$, 1);
select pg_temp.reemplazar_anclado('retail.vitrina_guardar_look(uuid, text, text, boolean, jsonb, integer, integer)',
  $v$retail.tienda_catalogo(null::uuid)$v$, $v$retail.fn_vitrina_catalogo_de_looks()$v$, 2);
select pg_temp.reemplazar_anclado('retail.vitrina_mostrar_look(uuid, boolean, integer)',
  $v$retail.tienda_catalogo(null::uuid)$v$, $v$retail.fn_vitrina_catalogo_de_looks()$v$, 3);

select 'ADR-0465 · Vitrina: looks con CLAURE, solo en Lima' as parte,
       case when pg_get_functiondef('retail.fn_vitrina_looks()'::regprocedure) like '%fn_vitrina_catalogo_de_looks%'
             and pg_get_functiondef('retail.vitrina_guardar_look(uuid, text, text, boolean, jsonb, integer, integer)'::regprocedure) like '%fn_vitrina_catalogo_de_looks%'
             and pg_get_functiondef('retail.vitrina_mostrar_look(uuid, boolean, integer)'::regprocedure) like '%fn_vitrina_catalogo_de_looks%'
            then 'QUEDÓ BIEN' else 'REVISAR' end as resultado;
