-- ============================================================================
-- 20261015030000_vitrina_esperan_una_talla.sql — CAYLA V2 · Tienda online (ADR-0408), actividad 12 · PARTE 3 de 3
--
-- EL PROBLEMA PRIMERO. Cuando una clienta toca «Avísame cuando llegue» en la web (PARTE 1, `esperas_web`), la tienda tiene que
-- poder verlo: cuántas personas esperan la M negra de la Blusa Emma en Trujillo es una señal de compra que hoy se pierde en un
-- chat. La maqueta aprobada lo pone en la Vitrina web: la cifra «Esperan una talla · Tocaron «Avísame»». Esta parte es su lectura.
--
-- QUÉ HACE. `retail.fn_vitrina_esperan()`, para Catálogo ▸ Vitrina web ▸ «Esperan una talla» (módulo `vitrina_web`: es una pantalla
-- de ese módulo, no un módulo nuevo, ADR-0306). Una fila por prenda (modelo, color y talla) y tienda (o «cualquier tienda»), con:
--   · cuántas PERSONAS la esperan (cuentas distintas) y desde cuándo (la espera más vieja y la más nueva);
--   · si ya llegó (hay libre en esa tienda; o, si da igual la tienda, en alguna de la web) y dónde hay libre ahora, para pedirla a
--     otra sede si conviene;
--   · si el modelo sigue viéndose en la web.
-- Más las tiendas de la web (para filtrar) y el total de personas distintas que esperan algo.
--
-- DECIDÍ: SIN datos personales. Ni nombre, ni correo, ni celular: para comprar o pedir una talla a otra sede basta saber cuántos
--   la esperan. A cada persona le llega el aviso en su cuenta («Te avisamos cuando llegue»), nunca por WhatsApp (ADR-0288 G-5).
--   Por eso esta función no toca `clientas` (y el vigilante de la ficha no tiene nada que contar aquí).
-- DECIDÍ: «libre» es la misma regla de la web (PARTE 1, `fn_tienda_libre`: stock − apartado, sin Cuarentena), y las tiendas, las
--   de la web (`fn_tienda_sedes_ids`). En el ERP cada tienda se llama por su nombre de siempre (`ubicaciones.nombre`).
-- DECIDÍ: el permiso es el del módulo (`fn_exigir_modulo('vitrina_web')`, el mismo de la Vitrina: lo que se ve en la web y lo que
--   la web pide van juntos). Es de toda CAYLA, no de una sede: la web es una sola.
--
-- PRODUCCIÓN. NO está aplicada (actividad 13, con el OK de Felipe). Va DESPUÉS de la PARTE 1 (20261015024000) y de la Vitrina
-- (20261014225000). Solo una función de lectura: re-ejecutable, sin tablas, sin políticas ni disparadores. Prueba:
-- `pnpm pruebas:tienda-club`.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function retail.fn_vitrina_esperan()
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_sedes uuid[];
begin
  perform retail.fn_exigir_modulo('vitrina_web');
  v_sedes := retail.fn_tienda_sedes_ids();
  return jsonb_build_object(
    'tiendas', coalesce((
      select jsonb_agg(jsonb_build_object('id', u.id, 'nombre', u.nombre) order by u.nombre)
        from retail.ubicaciones u where u.id = any (v_sedes)), '[]'::jsonb),
    'personas', (select count(distinct e.cuenta_web_id) from retail.esperas_web e where e.quitada_en is null),
    'filas', coalesce((
      with vivas as (
        select e.variante_id, e.ubicacion_id,
               count(distinct e.cuenta_web_id)::integer as personas,
               min(e.creada_en) as desde,
               max(e.creada_en) as ultima
          from retail.esperas_web e
         where e.quitada_en is null
         group by e.variante_id, e.ubicacion_id
      )
      select jsonb_agg(jsonb_build_object(
               'variante_id', x.variante_id,
               'producto', jsonb_build_object(
                 'id', p.id, 'nombre', p.referencia, 'codigo', p.codigo,
                 'categoria', c.nombre, 'prefijo', c.prefijo, 'familia', c.familia,
                 'foto', (select pf.url from retail.producto_fotos pf
                           where pf.producto_id = p.id
                           order by (pf.color_codigo is not distinct from v.color_codigo) desc, pf.es_principal desc,
                                    pf.orden, pf.created_at, pf.id
                           limit 1)),
               'color', case when co.codigo is null then null
                             else jsonb_build_object('codigo', co.codigo, 'nombre', co.nombre, 'hex', co.hex) end,
               'talla', t.valor,
               'sede', case when x.ubicacion_id is null then null
                            else jsonb_build_object('id', u.id, 'nombre', u.nombre) end,
               'personas', x.personas,
               'desde', x.desde,
               'ultima', x.ultima,
               'libre', retail.fn_tienda_libre(x.variante_id,
                                               case when x.ubicacion_id is null then v_sedes else array[x.ubicacion_id] end),
               'hay_en', coalesce((
                 select jsonb_agg(jsonb_build_object('id', u2.id, 'nombre', u2.nombre,
                                                     'libre', retail.fn_tienda_libre(x.variante_id, array[u2.id]))
                                  order by u2.nombre)
                   from retail.ubicaciones u2
                  where u2.id = any (v_sedes)
                    and retail.fn_tienda_libre(x.variante_id, array[u2.id]) > 0), '[]'::jsonb),
               'se_ve', retail.fn_tienda_modelo_se_ve(p.id)
             ) order by x.personas desc, x.desde, p.referencia, x.variante_id, u.nombre nulls first)
        from vivas x
        join retail.variantes v on v.id = x.variante_id
        join retail.productos p on p.id = v.producto_id
        left join retail.categorias c on c.id = p.categoria_id
        left join retail.colores co on co.codigo = v.color_codigo
        left join retail.tallas t on t.id = v.talla_id
        left join retail.ubicaciones u on u.id = x.ubicacion_id), '[]'::jsonb)
  );
end;
$fn$;

comment on function retail.fn_vitrina_esperan() is
  'Catálogo ▸ Vitrina web ▸ «Esperan una talla» (ADR-0408, act. 12): lo que los clientes de la web esperan (tocaron «Avísame»), por prenda y tienda: cuántas personas, desde cuándo, si ya llegó, dónde hay libre y si el modelo se ve en la web. Sin datos personales. {tiendas, personas, filas}. Módulo vitrina_web. Lectura (prefijo fn_).';

revoke all on function retail.fn_vitrina_esperan() from public, anon;
grant execute on function retail.fn_vitrina_esperan() to authenticated;

do $$
begin
  if has_function_privilege('anon', 'retail.fn_vitrina_esperan()', 'EXECUTE')
     or has_function_privilege('tienda_web', 'retail.fn_vitrina_esperan()', 'EXECUTE') then
    raise exception 'vitrina esperan: fn_vitrina_esperan es del ERP (authenticated, con el módulo), nunca de anon ni de la tienda';
  end if;
end;
$$;

reset lock_timeout;
