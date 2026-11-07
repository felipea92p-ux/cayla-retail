-- ============================================================================
-- 20261104002000_parecidas_al_recibir_en_todas_las_marcas.sql — CAYLA V2 · ADR-0393 (act. 2026-11-03)
-- Recibir: al agregar un modelo se ve lo que se parece en TODAS las marcas de la categoría.
--
-- EL PROBLEMA PRIMERO. `fn_prendas_para_recibir` busca solo en la marca elegida, y con la marca vacía solo entre las prendas sin marca. Desde que la marca es
-- opcional, escribir «Vestido Sofía» sin marca no veía el Vestido Sofía de CAYLA, y la prenda nacía repetida (prueba de punta a punta, 2026-11-03).
--
-- QUÉ CAMBIA
--   `fn_parecidas_para_recibir(p_categoria_id, p_busqueda)`: las prendas activas de la categoría, de cualquier marca, con su marca y si coinciden con lo
--   escrito. Lee lo mismo que `fn_prendas_para_recibir` y pide el mismo permiso. Es solo lectura.
--
-- DESCARTÉ
--   · Cambiar `fn_prendas_para_recibir`: la usan otras pantallas que sí quieren una sola marca, y su `null` significa «sin marca».
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). UNA parte, sin políticas ni `drop trigger` (ADR-0195), idempotente.
-- ============================================================================

set lock_timeout = '3s';

create or replace function retail.fn_parecidas_para_recibir(p_categoria_id uuid, p_busqueda text)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_q text := retail.fn_clave_texto(p_busqueda);
begin
  if retail.fn_ve_modulo('recibir') is not true and retail.fn_ve_modulo('ordenes_compra') is not true then
    raise exception 'Ver las prendas para recibir necesita el módulo «Recibir mercadería» u «Órdenes de compra» en tu rol'
      using errcode = '42501', hint = 'recibir_sin_modulo';
  end if;
  if p_categoria_id is null or v_q is null then
    return '[]'::jsonb;
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', q.id,
             'nombre', q.referencia,
             'codigo', q.codigo,
             'estado_alta', q.estado_alta,
             'coincide', q.coincide,
             'marca', (select jsonb_build_object('id', m.id, 'nombre', m.nombre) from retail.marcas m where m.id = q.marca_id),
             'foto', (select f.url from retail.producto_fotos f where f.producto_id = q.id
                       order by f.es_principal desc, f.orden, f.created_at limit 1),
             'variantes', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'id', v.id,
                        'talla_id', v.talla_id,
                        'talla', t.valor,
                        'color_codigo', v.color_codigo,
                        'color', co.nombre,
                        'color_hex', co.hex,
                        'codigo', v.codigo,
                        'costo', v.costo,
                        'precio', v.precio
                      ) order by t.valor nulls first, co.nombre nulls first, v.id)
                 from retail.variantes v
                 left join retail.tallas t on t.id = v.talla_id
                 left join retail.colores co on co.codigo = v.color_codigo
                where v.producto_id = q.id and v.activo
             ), '[]'::jsonb)
           ) order by q.coincide desc, q.referencia, q.id)
      from (
        select pr.id, pr.referencia, pr.codigo, pr.estado_alta, pr.marca_id,
               (retail.fn_clave_texto(pr.referencia) like '%' || v_q || '%' or lower(coalesce(pr.codigo, '')) like '%' || v_q || '%') as coincide
          from retail.productos pr
         where pr.categoria_id = p_categoria_id
           and pr.estado = 'activo'
           and pr.estado_alta <> 'rechazado'
         order by coincide desc, pr.referencia, pr.id
         limit 200
      ) q
  ), '[]'::jsonb);
end;
$$;
comment on function retail.fn_parecidas_para_recibir(uuid, text) is
  'ADR-0393 (act. 2026-11-03): las prendas de una categoría, de cualquier marca, para avisar qué se parece antes de crear una repetida al recibir.';
revoke all on function retail.fn_parecidas_para_recibir(uuid, text) from public, anon;
grant execute on function retail.fn_parecidas_para_recibir(uuid, text) to authenticated, service_role;

reset lock_timeout;
