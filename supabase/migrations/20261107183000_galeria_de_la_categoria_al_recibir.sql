-- ============================================================================
-- 20261107183000_galeria_de_la_categoria_al_recibir.sql — CAYLA V2 · ADR-0393 (act. 2026-11-07)
-- Recibir: «Ya la tenemos» muestra todas las prendas de la categoría, de todas las marcas, sin escribir nada.
--
-- EL PROBLEMA PRIMERO. Una reposición casi nunca llega con su nombre: quien recibe la reconoce a la vista. «Otro modelo» solo ofrecía una prenda existente
-- si se escribían 2 letras de su nombre (Felipe, prueba del 2026-11-07). `fn_parecidas_para_recibir` devolvía nada sin texto, y `fn_prendas_para_recibir`
-- busca en una sola marca (con `null` = sin marca), así que no había cómo ver «todas las blusas» de un toque.
--
-- QUÉ CAMBIA
--   `fn_parecidas_para_recibir(p_categoria_id, p_busqueda)` con la búsqueda vacía devuelve las prendas activas de la categoría (hasta 200, de cualquier marca),
--   todas con `coincide = false`. Con texto hace lo mismo que antes. Sigue siendo solo lectura y pide el mismo permiso.
--   Las pantallas que ya la llamaban lo hacen solo con 2 letras o más, así que para ellas no cambia nada.
--
-- DESCARTÉ
--   · Una función nueva: haría lo mismo que esta con un `if` menos.
--   · Cambiar `fn_prendas_para_recibir`: su `null` significa «sin marca» y lo usan otras pantallas.
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
  -- Sin nada escrito (Felipe 2026-11-07, «Ya la tenemos»): todas las de la categoría, para reconocerla por su foto. Nada coincide.
  if p_categoria_id is null then
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
               coalesce(v_q is not null and (retail.fn_clave_texto(pr.referencia) like '%' || v_q || '%' or lower(coalesce(pr.codigo, '')) like '%' || v_q || '%'), false) as coincide
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
  'ADR-0393 (act. 2026-11-03 y 2026-11-07): las prendas de una categoría, de cualquier marca, para avisar qué se parece antes de crear una repetida al recibir y, sin nada escrito, para elegir una reposición por su foto («Ya la tenemos»).';
revoke all on function retail.fn_parecidas_para_recibir(uuid, text) from public, anon;
grant execute on function retail.fn_parecidas_para_recibir(uuid, text) to authenticated, service_role;

reset lock_timeout;
