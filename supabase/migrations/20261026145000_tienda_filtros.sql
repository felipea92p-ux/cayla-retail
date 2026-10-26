-- ============================================================================
-- Tienda online: qué hay por COLOR y TALLA (ADR-0512, actividad 1) — `retail.tienda_filtros(p_sede)`.
--
-- EL PROBLEMA. La lista de la tienda filtra por grupo, categoría y orden; Felipe eligió (2026-10-26, maqueta
-- `docs/maquetas/tienda-filtros-2026-10/`, opción 1) filtrar también por COLOR y por TALLA. Con los datos reales de Trujillo
-- (232 prendas con unidades): 80 colores distintos, el 71 % de las prendas en 2 o más colores. Y la unidad de un filtro NO es la
-- prenda sino la VARIANTE: «Negro y M» exige UNA variante negra en M con unidades. Si color y talla se filtraran por separado, la
-- lista mostraría 177 prendas de más (negro en S y beige en M no es «negro en M»; la clienta abre la prenda y el negro no está en M).
-- `tienda_catalogo` no dice qué talla de qué color tiene unidades: solo el nivel del modelo en cada tienda.
--
-- LO QUE HACE. Una función de SOLO LECTURA y APARTE, que dice qué variantes (prenda, color, talla) se pueden separar hoy en la tienda
-- elegida o, con «Todas», en alguna de las de la web:
--     { "sede": <tienda elegida o null>,
--       "variantes": [ [<prenda>, <color o null>, <talla>], ... ],
--       "colores": { "<color>": <familia_color del ERP o null>, ... } }
-- «Se puede separar» es LA regla de «hay» de toda la tienda, sin copiarla: lo que la tienda OFRECE (`fn_tienda_precios`: una talla a
-- S/ 0 no se ofrece, ADR-0384) con unidades libres (`fn_tienda_disponible`, ADR-0270: sin Cuarentena, sin lo apartado ni las reservas
-- de los pedidos web, sin el Taller, sin las tiendas escondidas ni las tallas retiradas). Misma publicación, misma tienda elegida
-- (`fn_tienda_sede_elegida`: una escondida o cualquiera es «Todas») que el catálogo.
--
-- QUÉ NO HACE (y por qué). (1) NO dice cuántas unidades: la cifra exacta nunca sale a la web (ADR-0408), aquí ni siquiera el nivel;
-- solo que hay. (2) NO parcha `tienda_catalogo`: 17 migraciones del repo la mencionan y varias la reemplazan por anclas (parches
-- vivos que se pierden al recrearla); una función nueva y aparte no arriesga ninguna. (3) NO agrupa colores en familias para quien
-- compra: eso vive en código compartido (`packages/shared`, como las categorías de la tienda); aquí solo va la `familia_color` del
-- ERP como respaldo de un color que el código todavía no conozca. (4) NO toca ninguna tabla: sin `alter`, sin políticas, sin
-- disparadores (ADR-0195: se pega en UNA sola parte).
--
-- SI NO RESPONDE. La tienda la pide cuando la dirección trae `?color=` o `?talla=` y, desde el navegador (`GET /api/filtros`), poco
-- después de abrir una lista, para que los números del panel de COLOR y TALLA estén listos; 30 s por tienda, compartidos entre visitas.
-- La base la corta a los 2 s (la tienda lo pide con `statement_timeout` de la transacción) y la lista no espera más: si falla, se
-- ve SIN filtros y lo dice, y la persona no pierde nada (principio 9). Nada depende de ella para vender.
--
-- PRODUCCIÓN. No se pega hasta que Felipe lo diga (2026-10-26: «sin tocar producción»). Una sola parte, idempotente
-- (`create or replace`; los permisos se repiten sin daño); no lleva políticas, `drop trigger` ni `alter` de tablas en uso.
-- Ningún texto entre comillas lleva la palabra con que se guarda una consulta en una variable (ADR-0288).
-- ============================================================================
set lock_timeout = '3s';

create or replace function retail.tienda_filtros(p_sede uuid default null::uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'retail', 'public'
as $function$
declare
  v_sedes uuid[] := retail.fn_tienda_sedes_web();
  v_sede uuid;
  v_ids uuid[];
begin
  v_sede := retail.fn_tienda_sede_elegida(p_sede, v_sedes);
  v_ids := array(select vp.producto_id from retail.vitrina_productos vp
                  where vp.publicado and retail.fn_vitrina_publicable(vp.producto_id));

  return (
    with ofrecidas as materialized (
      -- Lo que la tienda ofrece de lo publicado (una talla a S/ 0 no): la misma pieza que arma el precio del catálogo.
      select pv.variante_id, pv.producto_id, pv.color_codigo, pv.talla_id
        from retail.fn_tienda_precios(v_ids, v_sede) pv
    ),
    libres as materialized (
      -- Las que tienen unidades libres: en la tienda elegida o, con «Todas», en alguna de la web (LA regla de «hay»).
      select distinct d.variante_id
        from retail.fn_tienda_disponible(v_ids, case when v_sede is null then v_sedes else array[v_sede] end) d
    ),
    variantes as (
      -- Una por prenda, color y talla (si dos variantes repitieran color y talla, saldrían una sola vez).
      select distinct o.producto_id, o.color_codigo, ta.valor as talla
        from ofrecidas o
        join libres l on l.variante_id = o.variante_id
        join retail.tallas ta on ta.id = o.talla_id
    )
    select jsonb_build_object(
      'sede', v_sede,
      'variantes', coalesce((select jsonb_agg(jsonb_build_array(x.producto_id, x.color_codigo, x.talla)
                                              order by x.producto_id, x.color_codigo nulls first, x.talla)
                               from variantes x), '[]'::jsonb),
      'colores', coalesce((select jsonb_object_agg(c.codigo, c.familia_color)
                             from retail.colores c
                            where c.codigo in (select x.color_codigo from variantes x)), '{}'::jsonb)
    )
  );
end;
$function$;

comment on function retail.tienda_filtros(uuid) is
  'Tienda online (ADR-0512): qué variantes (prenda, color, talla) se pueden separar hoy en la tienda elegida o, con «Todas», en alguna de la web: lo que la tienda ofrece (fn_tienda_precios) con unidades libres (fn_tienda_disponible, LA regla de «hay»), de lo publicado en la Vitrina. {sede, variantes: [[prenda, color, talla]], colores: {color: familia_color del ERP}}. Solo lectura, sin cifras ni niveles: solo que hay. La unidad del filtro es la variante: «Negro y M» exige una negra en M. La pide la tienda con ?color= o ?talla=; si falla, la lista se ve sin filtros. Solo de tienda_web.';

revoke all on function retail.tienda_filtros(uuid) from public, anon, authenticated;
grant execute on function retail.tienda_filtros(uuid) to tienda_web;

-- Validación final: si los permisos no quedaron como deben, se deshace todo.
do $$
begin
  if to_regprocedure('retail.tienda_filtros(uuid)') is null then
    raise exception 'tienda_filtros: no quedó creada';
  end if;
  if has_function_privilege('public', 'retail.tienda_filtros(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'retail.tienda_filtros(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'retail.tienda_filtros(uuid)', 'EXECUTE')
     or not has_function_privilege('tienda_web', 'retail.tienda_filtros(uuid)', 'EXECUTE') then
    raise exception 'tienda_filtros: tiene que ser solo de tienda_web';
  end if;
end
$$;

reset lock_timeout;
