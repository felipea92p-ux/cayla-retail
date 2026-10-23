-- ============================================================================
-- 20261023205000_tienda_catalogo_trae_las_insignias.sql — CAYLA V2 · Tienda online: las tarjetas del catálogo muestran las insignias (ADR-0489, act. c)
-- Las insignias asignadas en Catálogo ▸ Insignias (Halloween, Top ventas, Reedición…) que ya salen en la ficha de la prenda llegan también al catálogo,
-- para que su tarjeta las dibuje (hasta 3 en total y un «+N»; ese corte lo hace la tienda).
--
-- EL PROBLEMA PRIMERO. Felipe (2026-10-23), con la ficha ya publicada: «ahora también quiero implementarlo en las tarjetas del catálogo»: la insignia
--   en la tarjeta, no solo al abrir la prenda. `tienda_catalogo` no trae las insignias de cada prenda (la ficha las trae con `fn_tienda_insignias`,
--   20261023182000), y la tienda solo habla con la base por funciones `retail.tienda_*`.
--
-- ANALOGÍA CAYLA. En la ficha el cartelito se le cuelga a UNA percha; en el catálogo hay que colgárselo a todas las del perchero de una pasada. Si cada
--   percha se revisa por separado, se recorre el perchero entero cada vez.
--
-- QUÉ HACE.
--   1. `retail.fn_tienda_insignias_de(p_producto_ids, p_sede)`: LA regla de qué insignias ve el cliente, escrita UNA vez y por LOTE: una fila por modelo
--      con sus insignias (`[{id, nombre}]`, por grupo y nombre). Interna. El catálogo le pasa las tiendas de la web que ya conoce: la prueba de
--      `20261015215000` exige que se pregunte por ellas UNA vez por carga, y esta función no lo vuelve a preguntar.
--   2. `retail.fn_tienda_insignias(modelo, sede)` (la de la ficha, 20261023182000) ahora llama a la de lote con un solo modelo: la misma regla, no una copia.
--   3. Tres reemplazos ANCLADOS en `tienda_catalogo` (una CTE, una unión y una llave): cada prenda trae `insignias` (`[]` si no tiene). Si el texto de la
--      función no es el revisado, se detiene sin tocar nada.
--
-- LA REGLA no cambia (ADR-0489): aprobada y activa; vigente hoy (Lima, sin fechas = siempre, los dos extremos cuentan); alcanza al modelo por una variante
--   que se ofrece o por su categoría; de esa tienda (con «Todas», de alguna de la web); y SIN descuento (el descuento es el chip rojo y la tarjeta ya lo dice).
--
-- DECIDÍ: una función POR LOTE, y que la de un modelo la llame. Un solo recorrido para todo el catálogo.
-- DESCARTÉ: llamar `fn_tienda_insignias(m.id, v_sede)` por cada prenda dentro de `tienda_catalogo`. Es N consultas por carga (cada una recorre sus
--   variantes y las marcas de insignias); `20261017173000` reescribió el catálogo justamente para que nada se calcule por prenda.
-- DESCARTÉ: dejar la regla escrita dos veces (la de la ficha y la del catálogo). Si un día cambia una, el catálogo y la ficha dirían cosas distintas de la
--   misma prenda.
-- DESCARTÉ: que la base corte en «3 y +N». Ese corte depende de lo que la tarjeta YA dice (Nuevo, descuento, puesto), que solo conoce la tienda: la base
--   entrega todas, ordenadas, y la tienda decide cuántas caben.
--
-- NÚMEROS. Hoy ~100 modelos publicados y ~330 marcas de insignias; en 3 años, a lo más ~1 000 modelos × ~25 variantes: ~25 000 variantes del lote
--   contra la llave `(variante_id, etiqueta_id)` de `variante_etiquetas`: milisegundos, una vez por carga (el catálogo se comparte 30 s entre visitas).
--
-- SE ROMPE SI: alguien reescribe `tienda_catalogo` con el texto de antes de esta migración (el catálogo vuelve a no traer insignias, sin error: la tienda
--   tolera que falten; `pnpm pruebas:tienda-insignias` lo vigila), o si la regla de la ficha y la del catálogo dejan de ser la misma función.
--
-- PRODUCCIÓN. Una sola parte, idempotente (se puede pegar dos veces). Sin políticas, sin `drop trigger` y sin `alter` de tablas en uso (sin riesgo de 40P01,
--   ADR-0195); `lock_timeout` 3 s. Sin `select … into` dentro de un texto entre comillas (ADR-0288). Va DESPUÉS de 20261023182000. El orden con la publicación
--   de la tienda no importa: la tienda vieja ignora el campo nuevo y la nueva tolera que falte.
-- CAÍDA EXTERNA. Nada llama a la red.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- 0. La guarda: va después de la de la ficha ---------------------------------------------------------------------------------------------

do $$
begin
  if to_regprocedure('retail.fn_tienda_insignias(uuid, uuid)') is null
     or to_regprocedure('retail.tienda_catalogo(uuid)') is null
     or to_regprocedure('retail.fn_tienda_sedes_web()') is null
     or to_regprocedure('retail.fn_hoy_lima()') is null then
    raise exception 'Falta 20261023182000_tienda_ficha_trae_las_insignias.sql: pégala antes. No se aplicó nada.';
  end if;
end;
$$;

-- 1. LA regla, por lote ------------------------------------------------------------------------------------------------------------------

create or replace function retail.fn_tienda_insignias_de(p_producto_ids uuid[], p_sede uuid, p_sedes_web uuid[] default null)
returns table (producto_id uuid, insignias jsonb)
language sql
stable
set search_path to 'retail', 'public'
as $function$
  with hoy as materialized (select retail.fn_hoy_lima() as d),
  -- Las tiendas de la web: las que el llamador ya conoce (el catálogo y la ficha preguntan por ellas una sola vez por carga) o, si no las pasa, las pregunta aquí.
  sedes_web as materialized (select coalesce(p_sedes_web, retail.fn_tienda_sedes_web()) as s),
  -- Las que hoy se pueden ver en esa tienda: aprobadas, activas, sin descuento (ese es el chip de la campaña) y vigentes.
  vigentes as materialized (
    select e.id, e.nombre,
           case e.estilo when 'urgencia' then 0 when 'positivo' then 1 when 'campana' then 2 else 3 end as orden
      from retail.etiquetas e
     cross join hoy
     cross join sedes_web
     where e.estado = 'aprobado'
       and e.activo
       and e.descuento_pct is null
       and (e.vigente_desde is null or e.vigente_desde <= hoy.d)
       and (e.vigente_hasta is null or e.vigente_hasta >= hoy.d)
       -- Sin tiendas = en todas. Con tiendas: la elegida está o, con «Todas» (p_sede null), alguna de la web.
       and (coalesce(cardinality(e.sedes_permitidas), 0) = 0
            or (p_sede is not null and p_sede = any (e.sedes_permitidas))
            or (p_sede is null and e.sedes_permitidas && sedes_web.s))
  ),
  alcance as (
    -- A mano, en una variante que se ofrece.
    select v.producto_id, ve.etiqueta_id
      from retail.variantes v
      join retail.variante_etiquetas ve on ve.variante_id = v.id
     where v.producto_id = any (coalesce(p_producto_ids, '{}'::uuid[]))
       and v.activo
       and ve.etiqueta_id in (select vi.id from vigentes vi)
    union
    -- De TODA su categoría (con al menos una variante que se ofrece).
    select p.id, ec.etiqueta_id
      from retail.productos p
      join retail.etiqueta_categorias ec on ec.categoria_id = p.categoria_id
     where p.id = any (coalesce(p_producto_ids, '{}'::uuid[]))
       and ec.etiqueta_id in (select vi.id from vigentes vi)
       and exists (select 1 from retail.variantes v where v.producto_id = p.id and v.activo)
  )
  select a.producto_id,
         jsonb_agg(jsonb_build_object('id', vi.id, 'nombre', vi.nombre) order by vi.orden, vi.nombre, vi.id)
    from alcance a
    join vigentes vi on vi.id = a.etiqueta_id
   group by a.producto_id
$function$;

comment on function retail.fn_tienda_insignias_de(uuid[], uuid, uuid[]) is
  'ADR-0489 (act. c). LA regla de qué insignias de Catálogo ▸ Insignias ve el cliente, por lote: una fila por modelo con [{id, nombre}] por grupo y nombre. Aprobadas, activas, SIN descuento (ese es el chip de la campaña), vigentes hoy (Lima), que alcanzan al modelo por una variante que se ofrece o por su categoría, y que rigen en esa tienda (null = alguna de la web). Los modelos sin insignias no traen fila. p_sedes_web: las tiendas de la web si el llamador ya las conoce (así el catálogo no vuelve a preguntarlas). Interna: la llaman tienda_catalogo y fn_tienda_insignias.';

revoke all on function retail.fn_tienda_insignias_de(uuid[], uuid, uuid[]) from public, anon, authenticated;

-- 2. La de la ficha llama a la de lote: la misma regla, no una copia ----------------------------------------------------------------------

create or replace function retail.fn_tienda_insignias(p_producto_id uuid, p_sede uuid)
returns jsonb
language sql
stable
set search_path to 'retail', 'public'
as $function$
  select coalesce((select d.insignias from retail.fn_tienda_insignias_de(array[p_producto_id], p_sede) d), '[]'::jsonb)
$function$;

comment on function retail.fn_tienda_insignias(uuid, uuid) is
  'ADR-0489. Las insignias que ve el cliente en la ficha de un modelo: [{id, nombre}] por grupo y nombre. La regla vive en fn_tienda_insignias_de (por lote); esta la llama con un solo modelo. Interna: la llama tienda_ficha.';

revoke all on function retail.fn_tienda_insignias(uuid, uuid) from public, anon, authenticated;

-- 3. `tienda_catalogo` trae las insignias de cada prenda (tres reemplazos anclados, de una vez) ----------------------------------------------

create or replace function pg_temp.reemplazar_anclados(p_firma text, p_pares text[], p_ya_aplicado text)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
  i integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  -- Ya aplicado: se mira primero porque, una vez aplicado, las anclas siguen ahí y el conteo las vería repetidas.
  if position(p_ya_aplicado in v_def) > 0 then
    return;
  end if;
  -- Primero se comprueba CADA ancla contra la función viva (una vez cada una); recién entonces se reemplaza todo y se escribe una sola vez.
  for i in 1 .. cardinality(p_pares) / 2 loop
    v_n := (length(v_def) - length(replace(v_def, p_pares[2 * i - 1], ''))) / length(p_pares[2 * i - 1]);
    if v_n <> 1 then
      raise exception '% cambió desde que se escribió esta migración: el ancla % aparece % veces (se esperaba 1). Regenera el reemplazo desde su definición real.',
        p_firma, i, v_n;
    end if;
  end loop;
  for i in 1 .. cardinality(p_pares) / 2 loop
    v_def := replace(v_def, p_pares[2 * i - 1], p_pares[2 * i]);
  end loop;
  execute v_def;
end;
$f$;

select pg_temp.reemplazar_anclados(
  'retail.tienda_catalogo(uuid)',
  array[
    -- La CTE: las insignias de todo el lote, una vez.
    $v$vendidos as (select * from retail.fn_tienda_mas_vendidos(v_ids)),$v$,
    $v$vendidos as (select * from retail.fn_tienda_mas_vendidos(v_ids)),
    insignias_de as (select * from retail.fn_tienda_insignias_de(v_ids, v_sede, v_sedes)),$v$,
    -- La llave de cada prenda.
    $v$'vendidos', mv.puesto$v$,
    $v$'insignias', coalesce(ins.insignias, '[]'::jsonb),
        'vendidos', mv.puesto$v$,
    -- La unión por su id.
    $v$left join vendidos mv on mv.producto_id = m.id$v$,
    $v$left join vendidos mv on mv.producto_id = m.id
    left join insignias_de ins on ins.producto_id = m.id$v$
  ],
  $v$insignias_de as (select * from retail.fn_tienda_insignias_de(v_ids, v_sede, v_sedes))$v$
);

-- 4. Comprobación: lo interno sigue interno, el catálogo sigue siendo solo de la tienda y trae el campo -------------------------------------

do $$
declare
  f text;
begin
  foreach f in array array['retail.fn_tienda_insignias_de(uuid[], uuid, uuid[])', 'retail.fn_tienda_insignias(uuid, uuid)'] loop
    if has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE')
       or has_function_privilege('tienda_web', f, 'EXECUTE') then
      raise exception 'tienda insignias: % es interna y nadie de afuera la llama. No se aplicó nada.', f;
    end if;
  end loop;
  if has_function_privilege('anon', 'retail.tienda_catalogo(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'retail.tienda_catalogo(uuid)', 'EXECUTE')
     or not has_function_privilege('tienda_web', 'retail.tienda_catalogo(uuid)', 'EXECUTE') then
    raise exception 'tienda insignias: tienda_catalogo tiene que seguir siendo solo de tienda_web. No se aplicó nada.';
  end if;
  if position('retail.fn_tienda_insignias_de(v_ids, v_sede, v_sedes)' in pg_get_functiondef('retail.tienda_catalogo(uuid)'::regprocedure)) = 0 then
    raise exception 'tienda insignias: tienda_catalogo no quedó con las insignias. No se aplicó nada.';
  end if;
end;
$$;

reset lock_timeout;
