-- 20261126153000_recortes_medida_ia.sql — CAYLA V2 · «Arma el tuyo» (ADR-0434): la medida de cada recorte que dice la IA (ADR-0705)
--
-- PROBLEMA: el probador agranda o achica cada blusa según el ancho de su BORDE DE ABAJO (ADR-0449 act. c, `factorDelTorso`). Una blusa con
--   nudo, fruncida o cruzada abajo tiene ese borde angosto aunque el cuerpo no lo sea: «Camisa Dalia» (CMS-0092) mide 25 cm abajo y el
--   probador la agranda 35 %, el tope, y sale enorme junto al jean (Felipe, 2026-11-25).
-- DECIDÍ (ADR-0705): el tamaño de una prenda de arriba sale del ancho de su torso a la altura de las AXILAS, que no cambia con el nudo, el
--   volado ni el corte del bajo. A qué altura están las axilas (y qué prenda es, si va holgada o metida) lo dice una IA que mira el recorte
--   UNA vez, sola, en el servidor (`GET /api/fotos/medir-recortes`, cada 10 min); el ancho exacto en esa fila lo miden los píxeles en la
--   tienda. Nadie del equipo hace nada nuevo.
--
-- QUÉ HACE:
--   1. `retail.foto_recortes.medida_ia` (jsonb, null): lo que dijo la IA de ESE recorte: {recorte, tipo, zona, holgura, metida, axila,
--      modelo, medido_en} o, si no se pudo, {recorte, fallo, medido_en}. Lleva el archivo del recorte que miró: si el recorte se rehace
--      (`registrar_recorte`), la medida vieja deja de valer sola (no hace falta tocar `registrar_recorte`).
--   2. `retail.recortes_sin_medida_ia(p_limite)`: los recortes listos o por revisar cuya medida falta o es de otro recorte. Solo servidor.
--   3. `retail.anotar_medida_ia(p_foto, p_recorte, p_medida)`: guarda la medida si el recorte sigue siendo ese. Valida la forma. Solo servidor.
--   4. `retail.tienda_probador`: cada recorte trae su `ia` (la medida vigente, sin el nombre del archivo), o null. Es la función de producción
--      tal cual (pg_get_functiondef, md5 3870a021bf24a91a5bbf4d82a23d5dcf, 2026-11-26) con UNA línea más en `recortes_prenda`.
--
-- SE ROMPE SI: alguien cambia `tienda_probador` en otra rama partiendo de su versión vieja del repo (20261017025000): perdería el `ia` y las
--   mejoras de rendimiento. Partir siempre de pg_get_functiondef de producción.
-- SE DEGRADA ASÍ: sin medida (la IA no respondió, falta OPENAI_API_KEY o el recorte es nuevo), la prenda se dibuja como hoy (por su borde de abajo).
--
-- PRODUCCIÓN: dos partes, pegar en orden, cada una sola. La 1 agrega una columna que puede ser null (no reescribe la tabla). Re-ejecutables.

-- ===== PARTE 1 · la columna =====
set lock_timeout = '3s';
set search_path = retail, public, extensions;

alter table retail.foto_recortes add column if not exists medida_ia jsonb;

comment on column retail.foto_recortes.medida_ia is
  'ADR-0705: lo que dijo la IA de este recorte (tipo, zona, holgura, metida, axila como fracción del alto) o {fallo}. Lleva el archivo del recorte que miró: si no coincide con `recorte`, no vale. La escribe solo el servidor (anotar_medida_ia).';

-- ===== PARTE 2 · las funciones =====
set lock_timeout = '3s';
set search_path = retail, public, extensions;

create or replace function retail.recortes_sin_medida_ia(p_limite integer default 20)
returns table (foto text, recorte text)
language sql
stable
security definer
set search_path = retail, public
as $$
  select r.foto, r.recorte
    from retail.foto_recortes r
   where r.estado in ('listo', 'por_revisar')
     and (r.medida_ia is null or r.medida_ia ->> 'recorte' is distinct from r.recorte)
   order by (r.estado = 'listo') desc, r.actualizado_en desc nulls last, r.foto
   limit greatest(1, least(coalesce(p_limite, 20), 100));
$$;

comment on function retail.recortes_sin_medida_ia(integer) is
  'ADR-0705: los recortes (listos primero) cuya medida de la IA falta o es de otro recorte. Solo el servidor (cron /api/fotos/medir-recortes).';
revoke all on function retail.recortes_sin_medida_ia(integer) from public, anon, authenticated;
grant execute on function retail.recortes_sin_medida_ia(integer) to service_role;

create or replace function retail.anotar_medida_ia(p_foto text, p_recorte text, p_medida jsonb)
returns boolean
language plpgsql
security definer
set search_path = retail, public
as $$
declare
  v_n integer;
begin
  if p_medida is null or jsonb_typeof(p_medida) <> 'object' then
    raise exception 'medida_ia_invalida' using hint = 'La medida es un objeto.';
  end if;
  -- O es un fallo (la IA no respondió o respondió algo raro: no se vuelve a intentar con ese recorte), o es una medida completa.
  if not coalesce((p_medida ->> 'fallo')::boolean, false) then
    if not (p_medida ->> 'tipo' = any (array['con_mangas','tirantes','halter','strapless','body','vestido','vestido_strapless','chaleco','casaca','pantalon','falda','short','cartera','otro'])
        and p_medida ->> 'zona' = any (array['arriba','abajo','vestido','encima','bolso'])
        and p_medida ->> 'holgura' = any (array['ajustada','normal','holgada'])
        and jsonb_typeof(p_medida -> 'metida') = 'boolean'
        and (p_medida -> 'axila' is null or jsonb_typeof(p_medida -> 'axila') = 'null'
             or (jsonb_typeof(p_medida -> 'axila') = 'number' and (p_medida ->> 'axila')::numeric between 0 and 0.8))) then
      raise exception 'medida_ia_invalida' using hint = 'Falta el tipo, la zona, la holgura o «metida», o la axila no está entre 0 y 0,8.';
    end if;
  end if;
  update retail.foto_recortes r
     set medida_ia = p_medida || jsonb_build_object('recorte', p_recorte, 'medido_en', now())
   where r.foto = p_foto
     and r.recorte = p_recorte;
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$$;

comment on function retail.anotar_medida_ia(text, text, jsonb) is
  'ADR-0705: guarda lo que dijo la IA de un recorte, solo si ese recorte sigue siendo el de la foto (false si se rehízo mientras tanto). Valida la forma. Solo el servidor.';
revoke all on function retail.anotar_medida_ia(text, text, jsonb) from public, anon, authenticated;
grant execute on function retail.anotar_medida_ia(text, text, jsonb) to service_role;

-- La función de producción tal cual (md5 3870a021bf24a91a5bbf4d82a23d5dcf), con `ia` en cada recorte (marcado «ADR-0705»).
CREATE OR REPLACE FUNCTION retail.tienda_probador(p_sede uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'retail', 'public'
AS $function$
declare
  v_sedes uuid[] := retail.fn_tienda_sedes_web();
  v_umbral integer := retail.fn_tienda_umbral();
  v_sede uuid;
  v_ids uuid[];
  v_empresas uuid[];
begin
  v_sede := retail.fn_tienda_sede_elegida(p_sede, v_sedes);

  -- Las empresas que se ven en esa tienda, leídas una vez por carga (antes, `fn_tienda_empresa_se_ve` una vez por prenda: ~0,4 ms cada
  -- una; es lo mismo que ya hace `tienda_catalogo` desde 20261031161000).
  v_empresas := array(select e.id from retail.fn_empresas_de_sede(v_sede) as e);

  -- Las prendas del probador: publicadas y vendibles (lo mismo que mira el catálogo), con largo y con al menos un recorte listo de una
  -- foto del almacén público (la misma condición de foto que el catálogo). Lo barato primero (incluida la empresa); la regla cara
  -- (fn_vitrina_publicable, plpgsql) solo sobre lo que sobrevive: `as materialized` fija ese orden.
  v_ids := array(
    with candidatas as materialized (
      select vp.producto_id
        from retail.vitrina_productos vp
        join retail.productos p on p.id = vp.producto_id
        left join retail.vitrina_largos_tipicos lt on lt.categoria_id = p.categoria_id
       where vp.publicado
         and coalesce(vp.largo_cm, lt.largo_cm) is not null
         and exists (
           select 1
             from retail.producto_fotos pf
             join retail.foto_recortes r
               on r.foto = substring(split_part(pf.url, '?', 1) from '/storage/v1/object/public/retail-productos-fotos/(.+)$')
            where pf.producto_id = vp.producto_id
              and pf.url ~ '^https?://[^/?#]+/storage/v1/object/public/retail-productos-fotos/'
              and r.estado = 'listo')
    )
    select c.producto_id
      from candidatas c
     where exists (select 1 from retail.productos pe where pe.id = c.producto_id and pe.empresa_id = any (v_empresas))  -- fn_tienda_empresa_se_ve, con la lista ya leída
       and retail.fn_vitrina_publicable(c.producto_id));

  return (
    with pv as materialized (
      -- Lo que se ofrece de esas prendas en la tienda elegida, con el resumen por COLOR (el que cobra la bolsa).
      select * from retail.fn_tienda_precios(v_ids, v_sede, true)
       where color_codigo is not null
    ),
    del_color as (
      select distinct on (pv.producto_id, pv.color_codigo)
             pv.producto_id, pv.color_codigo, pv.resumen_precio, pv.resumen_final, pv.resumen_desde, pv.resumen_campana
        from pv
       order by pv.producto_id, pv.color_codigo
    ),
    -- Lo libre de cada color en cada tienda de la web, solo de sus tallas que se ofrecen (la regla única de «hay»).
    disponible as materialized (
      select x.producto_id, x.color_codigo, d.ubicacion_id, sum(d.disponible)::integer as n
        from retail.fn_tienda_disponible(v_ids, v_sedes) d
        join pv x on x.variante_id = d.variante_id
       group by x.producto_id, x.color_codigo, d.ubicacion_id
    ),
    -- Lo libre de cada color en total: una sola suma por color, en vez de releer `disponible` por cada color de cada prenda.
    total_color as (
      select d.producto_id, d.color_codigo, sum(d.n) as n
        from disponible d
       group by d.producto_id, d.color_codigo
    ),
    -- El nivel de cada color en cada tienda de la web (también donde no hay fila: nivel de 0), en una pasada.
    sedes_color as (
      select dc.producto_id, dc.color_codigo,
             jsonb_object_agg(s.id::text, retail.fn_tienda_nivel(coalesce(d.n, 0), v_umbral)) as sedes
        from del_color dc
        cross join unnest(v_sedes) as s (id)
        left join disponible d on d.producto_id = dc.producto_id and d.color_codigo = dc.color_codigo and d.ubicacion_id = s.id
       group by dc.producto_id, dc.color_codigo
    ),
    -- Los colores de cada prenda, armados una vez y unidos por prenda.
    colores_prenda as (
      select dc.producto_id,
             jsonb_agg(jsonb_build_object(
                         'codigo', dc.color_codigo,
                         'precio', dc.resumen_precio,
                         'precio_final', dc.resumen_final,
                         'desde', dc.resumen_desde,
                         'campana', dc.resumen_campana,
                         'stock', jsonb_build_object(
                           'total', retail.fn_tienda_nivel(coalesce(tc.n, 0)::integer, v_umbral),
                           'sedes', coalesce(sc.sedes, '{}'::jsonb)))
                       order by dc.color_codigo) as colores
        from del_color dc
        left join total_color tc on tc.producto_id = dc.producto_id and tc.color_codigo = dc.color_codigo
        left join sedes_color sc on sc.producto_id = dc.producto_id and sc.color_codigo = dc.color_codigo
       group by dc.producto_id
    ),
    -- Los recortes listos de cada prenda, en el orden de sus fotos, armados una vez y unidos por prenda.
    recortes_prenda as (
      select pf.producto_id,
             jsonb_agg(jsonb_build_object('color', pf.color_codigo, 'color_nombre', co.nombre, 'url', f.base || r.recorte, 'proporcion', r.proporcion,
                                          -- ADR-0705: lo que dijo la IA de ESTE recorte (sin fallos ni medidas de un recorte anterior).
                                          'ia', case when r.medida_ia ->> 'recorte' = r.recorte and not coalesce((r.medida_ia ->> 'fallo')::boolean, false)
                                                     then r.medida_ia - 'recorte' - 'medido_en' - 'modelo' end)
                       order by pf.es_principal desc, pf.orden, pf.created_at, pf.id) as recortes
        from retail.producto_fotos pf
        cross join lateral (
          select substring(pf.url from '^(https?://[^/?#]+/storage/v1/object/public/retail-productos-fotos/)') as base,
                 substring(split_part(pf.url, '?', 1) from '/storage/v1/object/public/retail-productos-fotos/(.+)$') as archivo
        ) f
        join retail.foto_recortes r on r.foto = f.archivo and r.estado = 'listo'
        left join retail.colores co on co.codigo = pf.color_codigo
       where pf.producto_id = any (v_ids)
         and f.base is not null
       group by pf.producto_id
    )
    select jsonb_build_object(
      'sede', v_sede,
      'prendas', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', p.id,
                 'largo', coalesce(vp.largo_cm, lt.largo_cm)::integer,
                 'recortes', rp.recortes,
                 'colores', cp.colores
               ) order by vp.publicado_en desc, p.referencia, p.id)
          from retail.productos p
          join retail.vitrina_productos vp on vp.producto_id = p.id
          left join retail.vitrina_largos_tipicos lt on lt.categoria_id = p.categoria_id
          -- Sin un color que se ofrezca en esa tienda, no hay nada que ponerse.
          join colores_prenda cp on cp.producto_id = p.id
          left join recortes_prenda rp on rp.producto_id = p.id
         where p.id = any (v_ids)), '[]'::jsonb),
      'combina', coalesce((
        select jsonb_object_agg(co.codigo, to_jsonb(co.combina_con))
          from retail.colores co
         where co.codigo in (select dc.color_codigo from del_color dc)
           and cardinality(co.combina_con) > 0), '{}'::jsonb)
    )
  );
end;
$function$;
