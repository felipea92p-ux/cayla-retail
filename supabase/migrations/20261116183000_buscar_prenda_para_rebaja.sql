-- ============================================================================
-- 20261116183000 — «Poner un %»: encontrar la prenda por su código o su nombre (ADR-0669, Felipe 2026-11-16)
--
-- EL PROBLEMA. «Poner un %» vive en Campañas y ofertas, que no carga el catálogo con sus códigos: la pistola leería un código que la
--   pantalla no conoce. Cargarlo entero (como la hoja de «Marcar prendas sueltas», ~1.000 productos por páginas) frenaría una pantalla que
--   se abre para otra cosa.
--
-- LO QUE HACE. `buscar_prenda_para_rebaja(texto, tienda)`: primero el código exacto (el sku, el código de la etiqueta o uno de fábrica,
--   sin mayúsculas); si no hay, el nombre del modelo (sin tildes ni mayúsculas: `fn_clave_texto`). Hasta 20 prendas a la venta, con su
--   color, talla, precio en la tienda, foto y categoría (para la miniatura sin foto, ADR-0333). `exacta` dice si fue por código: la pantalla
--   abre la hoja sin preguntar. Pide ver Campañas y ofertas (`fn_exigir_rebaja_rapida`).
--
-- CÓMO SE PEGA. Una sola parte, idempotente: una función nueva. Va DESPUÉS de 20261116182000.
-- CAÍDA EXTERNA. Nada llama a la red.
-- PRUEBA. `pnpm pruebas:rebaja-rapida` («Buscar la prenda»).
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function retail.buscar_prenda_para_rebaja(p_texto text, p_ubicacion_id uuid)
returns table (variante_id uuid, producto_id uuid, referencia text, codigo text, color text, color_hex text, talla text, precio numeric,
               foto text, categoria text, categoria_prefijo text, categoria_familia text, exacta boolean)
language plpgsql
stable
security definer
set search_path to 'retail', 'public'
as $function$
declare
  v_sede uuid := retail.fn_exigir_rebaja_rapida(p_ubicacion_id, false);
  v_texto text := btrim(coalesce(p_texto, ''));
  v_ids uuid[];
  v_exacta boolean := false;
begin
  if length(v_texto) < 2 then
    return;
  end if;
  -- 1. El código exacto (lo que lee la pistola).
  v_ids := (
    select array_agg(distinct v.id) from retail.variantes v
    where v.activo and (upper(v.sku) = upper(v_texto) or upper(v.codigo) = upper(v_texto)
                        or exists (select 1 from retail.codigos_barras cb where cb.variante_id = v.id and upper(cb.codigo) = upper(v_texto)))
  );
  v_exacta := v_ids is not null;
  -- 2. Si no, el nombre del modelo.
  if v_ids is null then
    v_ids := (
      select array_agg(x.id) from (
        select v.id from retail.variantes v join retail.productos p on p.id = v.producto_id
        where v.activo and p.estado = 'activo' and retail.fn_clave_texto(p.referencia) like '%' || retail.fn_clave_texto(v_texto) || '%'
        -- Primero los modelos cuyo nombre EMPIEZA con lo escrito («pantalón» → Pantalón Carla antes que Conjunto Chaleco y Pantalón).
        order by (retail.fn_clave_texto(p.referencia) like retail.fn_clave_texto(v_texto) || '%') desc, p.referencia, v.color_codigo, v.id
        limit 20
      ) x
    );
  end if;
  return query
    select v.id, p.id, p.referencia, coalesce(v.codigo, v.sku), co.nombre, co.hex, t.valor, retail.fn_precio_en_sede(v.id, v_sede),
           (select f.url from retail.producto_fotos f where f.producto_id = p.id and (f.color_codigo is null or f.color_codigo = v.color_codigo)
              order by (f.color_codigo = v.color_codigo) desc nulls last, f.es_principal desc, f.orden limit 1),
           ca.nombre, ca.prefijo, ca.familia, v_exacta
    from retail.variantes v
    join retail.productos p on p.id = v.producto_id
    left join retail.colores co on co.codigo = v.color_codigo
    left join retail.tallas t on t.id = v.talla_id
    left join retail.categorias ca on ca.id = p.categoria_id
    where v.id = any (coalesce(v_ids, '{}'::uuid[]))
    order by (retail.fn_clave_texto(p.referencia) like retail.fn_clave_texto(v_texto) || '%') desc, p.referencia, co.nombre, t.valor;
end;
$function$;

comment on function retail.buscar_prenda_para_rebaja(text, uuid) is
  'ADR-0669. Encuentra la prenda de «Poner un %»: por su código exacto (sku, etiqueta o de fábrica) o por el nombre de su modelo, hasta 20, con su precio en la tienda. exacta = fue por código.';

revoke all on function retail.buscar_prenda_para_rebaja(text, uuid) from public, anon;
grant execute on function retail.buscar_prenda_para_rebaja(text, uuid) to authenticated;
