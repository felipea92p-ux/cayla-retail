-- ============================================================================
-- 20261015013000_tienda_inicio_lo_nuevo_y_mas_vendidos.sql — CAYLA V2 · Tienda online (ADR-0408), actividad 5: el Inicio con
-- «Lo nuevo» y «Más vendidos», y los plazos de las páginas de ayuda
--
-- EL PROBLEMA PRIMERO. El Inicio de la maqueta (`vInicio`) abre con lo que llegó hace poco y con lo que más se lleva la gente. Hoy la
-- tienda no lo sabe: `tienda_catalogo` da el precio y cuánto hay, pero no desde cuándo está la prenda ni cómo se vende. Y no puede
-- inventarlo: «Lo nuevo» es una afirmación sobre la mercadería (llegó a una tienda hace poco) y «Más vendidos», sobre las ventas.
--
-- LO QUE HACE. `retail.tienda_catalogo(p_sede)` suma a cada prenda dos datos, en la MISMA lectura (el Inicio lee una sola vez):
--   · `nuevo`: {dias} si está en «Lo nuevo»; null si no. Entra si su PRIMER ingreso a una tienda fue hace 30 días o menos (fecha de
--     Lima), con el predicado de llegada de Análisis y Frescura (`fn_es_llegada`: lo recibido de un proveedor, del Taller o de otra
--     tienda, y la carga inicial con que hoy se da de alta lo nuevo; ADR-0408 DECIDÍ 7), o si en la Vitrina está FIJADO en Lo nuevo
--     (`vitrina_productos.en_lo_nuevo = 'fijo'`). Si está QUITADO a mano, no entra aunque haya llegado ayer. `dias`: hace cuántos días
--     llegó (0 = hoy), solo si son 30 o menos (un fijado que llegó hace tiempo dice «Nuevo», sin días). Que vuelva a entrar una prenda
--     que ya estuvo no la hace nueva: cuenta la primera vez. El Taller no es una tienda.
--   · `vendidos`: su puesto (1 a 20) en «Más vendidos» o null. Por modelo, las unidades que salieron por venta en los últimos 30 días
--     en toda la red, con la MISMA definición del orden «Más vendidos» de Catálogo ▸ Productos y de la demanda de «Pedir a proveedor»
--     (`movimientos` tipo `salida`, motivo `venta`; 20260929180000). Empate: por nombre. Solo el puesto sale de la base, NUNCA cuántas
--     se vendieron (maqueta, propuesta g).
--   Las familias que no son mercadería de piso (bolsas, cajas: `familias.entra_a_motores = false`, ADR-0377) no entran a ninguno de los
--   dos: se pregunta `fn_categoria_entra_a_motores`, la única regla.
--   Dos piezas internas nuevas, que nadie de afuera llama: `fn_tienda_lo_nuevo(productos)` y `fn_tienda_mas_vendidos(productos)`.
-- Y `retail.tienda_ayuda()`: los plazos que prometen «Cómo separar» y «Cambios y devoluciones», leídos de donde ya viven y nunca
--   escritos a mano en la página: las horas para que la tienda confirme y los días para recoger, de Configuración ▸ Tienda web
--   (`configuracion_tienda_web`), y los días para cambiar una prenda, los de la caja (`fn_dias_plazo_cambio`, R-38: el mismo número que
--   imprime la boleta). Si Felipe los cambia en el ERP, la ayuda cambia sola.
--
-- DECIDÍ: los dos datos dentro de `tienda_catalogo` y no en una función aparte: el Inicio, las listas y la cabecera ya leen el catálogo;
--   una segunda lectura repetiría la vitrina y el precio. «Más vendidos» con 20 puestos: lo que cabe en una lista que se recorre;
--   el Inicio muestra 8.
-- DESCARTÉ: la ÚLTIMA llegada para «Lo nuevo» (cada reposición volvería «nueva» una prenda de hace meses); contar como venta los cambios
--   y lo devuelto (sería otra definición de «vendida» que la del ERP: Felipe compararía dos rankings distintos); devolver las unidades y
--   que la tienda las esconda (la cifra viajaría igual).
--
-- PRODUCCIÓN. NO está aplicada (actividad 13, con el OK de Felipe, después de 20261015012000; necesita `fn_categoria_entra_a_motores`
-- (20261010231000), `fn_dias_plazo_cambio` (20261012222000) y `configuracion_tienda_web` (20261014231000)). Una sola parte, re-ejecutable: solo `create or replace function`, `comment`, `revoke` y
-- `grant`; sin tablas, políticas ni disparadores (ADR-0195). Ningún `select … into` dentro de un texto entre comillas (ADR-0288).
-- Prueba: `pnpm pruebas:tienda-inicio`.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 0. Lo que esta migración da por hecho ----------
do $$
begin
  if to_regprocedure('retail.fn_tienda_precios(uuid[], uuid[])') is null or to_regprocedure('retail.tienda_ficha(uuid, uuid)') is null then
    raise exception 'Falta la ficha de la tienda: pega antes 20261015012000_tienda_ficha_y_niveles_por_tienda.sql.';
  end if;
  if to_regprocedure('retail.fn_categoria_entra_a_motores(uuid)') is null then
    raise exception 'Falta retail.fn_categoria_entra_a_motores: pega antes 20261010231000_familias_entran_a_motores.sql.';
  end if;
  if to_regprocedure('retail.fn_es_llegada(text, text, uuid, uuid, uuid)') is null then
    raise exception 'Falta retail.fn_es_llegada: pega antes 20260928120300_frescura_lectura.sql.';
  end if;
  if to_regprocedure('retail.fn_dias_plazo_cambio()') is null then
    raise exception 'Falta retail.fn_dias_plazo_cambio: pega antes 20261012222000_cambio_plazo_en_la_base.sql.';
  end if;
  if to_regclass('retail.configuracion_tienda_web') is null then
    raise exception 'Falta retail.configuracion_tienda_web: pega antes 20261014231000_tienda_web_sedes_y_plazos.sql.';
  end if;
end
$$;

-- ---------- 1. Lo nuevo ----------
-- Los modelos pedidos que están en «Lo nuevo», con hace cuántos días llegaron a una tienda por primera vez (solo si son 30 o menos).
create or replace function retail.fn_tienda_lo_nuevo(p_producto_ids uuid[])
returns table (producto_id uuid, dias integer)
language sql
stable
set search_path = retail, public
as $$
  with llegada as (
    select v.producto_id, min(m.created_at) as primera
      from retail.movimientos m
      join retail.variantes v on v.id = m.variante_id
      join retail.ubicaciones u on u.id = m.ubicacion_id
     where v.producto_id = any (coalesce(p_producto_ids, '{}'::uuid[]))
       and u.tipo = 'tienda'
       and retail.fn_es_llegada(m.tipo, m.motivo, m.lote_id, m.produccion_id, m.transferencia_recepcion_id)
     group by v.producto_id
  ),
  modelos as (
    select p.id, vp.en_lo_nuevo,
           retail.fn_hoy_lima() - (ll.primera at time zone 'America/Lima')::date as dias
      from retail.productos p
      join retail.vitrina_productos vp on vp.producto_id = p.id
      left join llegada ll on ll.producto_id = p.id
     where p.id = any (coalesce(p_producto_ids, '{}'::uuid[]))
       and retail.fn_categoria_entra_a_motores(p.categoria_id)
  )
  select m.id, case when m.dias between 0 and 30 then m.dias end
    from modelos m
   where m.en_lo_nuevo = 'fijo'
      or (m.en_lo_nuevo = 'automatico' and m.dias between 0 and 30)
$$;

comment on function retail.fn_tienda_lo_nuevo(uuid[]) is
  'Tienda online (ADR-0408, DECIDÍ 7): los modelos en «Lo nuevo» — primer ingreso a una tienda (fn_es_llegada) hace 30 días o menos, o fijados en la Vitrina; nunca los quitados ni las familias fuera de los motores — con hace cuántos días llegaron (solo hasta 30). Interna: la usa tienda_catalogo.';

-- ---------- 2. Más vendidos ----------
-- El puesto de cada modelo pedido en «Más vendidos» (1 a 20): unidades vendidas en 30 días en toda la red (la definición de
-- Catálogo ▸ Productos), empate por nombre. Sin las familias fuera de los motores.
create or replace function retail.fn_tienda_mas_vendidos(p_producto_ids uuid[])
returns table (producto_id uuid, puesto integer)
language sql
stable
set search_path = retail, public
as $$
  with vendidas as (
    select v.producto_id, sum(m.cantidad) as unidades
      from retail.movimientos m
      join retail.variantes v on v.id = m.variante_id
     where m.tipo = 'salida' and m.motivo = 'venta'
       and m.created_at >= now() - interval '30 days'
       and v.producto_id = any (coalesce(p_producto_ids, '{}'::uuid[]))
     group by v.producto_id
  ),
  ranking as (
    select vd.producto_id, row_number() over (order by vd.unidades desc, p.referencia, p.id) as puesto
      from vendidas vd
      join retail.productos p on p.id = vd.producto_id
     where vd.unidades > 0
       and retail.fn_categoria_entra_a_motores(p.categoria_id)
  )
  select r.producto_id, r.puesto::integer from ranking r where r.puesto <= 20
$$;

comment on function retail.fn_tienda_mas_vendidos(uuid[]) is
  'Tienda online (ADR-0408): el puesto (1 a 20) de cada modelo en «Más vendidos» — unidades vendidas en 30 días en toda la red, la definición del orden de Catálogo ▸ Productos —, sin las familias fuera de los motores. Solo el puesto sale de la base, nunca las unidades. Interna: la usa tienda_catalogo.';

revoke all on function retail.fn_tienda_lo_nuevo(uuid[]) from public, anon, authenticated;
revoke all on function retail.fn_tienda_mas_vendidos(uuid[]) from public, anon, authenticated;

-- ---------- 3. El catálogo, con «Lo nuevo» y «Más vendidos» ----------
-- Lo mismo de 20261015012000 (precio, campaña, colores, fotos y nivel por tienda) más `nuevo` ({dias} o null) y `vendidos` (el puesto o
-- null). {sede, prendas: [{id, codigo, nombre, categoria, precio, precio_final, desde, campana, colores, fotos, stock, nuevo, vendidos}]}.
create or replace function retail.tienda_catalogo(p_sede uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public
as $fn$
declare
  v_sedes uuid[] := retail.fn_tienda_sedes_web();
  v_umbral integer := retail.fn_tienda_umbral();
  v_sede uuid;
  v_ids uuid[];
begin
  if p_sede = any (v_sedes) then
    v_sede := p_sede;
  end if;
  v_ids := array(select vp.producto_id from retail.vitrina_productos vp
                  where vp.publicado and retail.fn_vitrina_publicable(vp.producto_id));

  return (
    with pv as materialized (
      select * from retail.fn_tienda_precios(v_ids, case when v_sede is not null then array[v_sede] else v_sedes end)
    ),
    modelos as (
      select distinct on (pv.producto_id)
             pv.producto_id as id, pv.modelo_precio as precio, pv.modelo_final as final, pv.modelo_desde as desde,
             pv.modelo_campana as campana
        from pv
       order by pv.producto_id
    ),
    disponible as (
      select d.producto_id, d.ubicacion_id, sum(d.disponible)::integer as n
        from retail.fn_tienda_disponible(v_ids, v_sedes) d
       where d.variante_id in (select pv.variante_id from pv)
       group by d.producto_id, d.ubicacion_id
    ),
    nuevo as (select * from retail.fn_tienda_lo_nuevo(v_ids)),
    vendidos as (select * from retail.fn_tienda_mas_vendidos(v_ids)),
    foto_ok as (
      select pf.producto_id, pf.color_codigo, pf.url, pf.es_principal, pf.orden, pf.created_at, pf.id
        from retail.producto_fotos pf
       where pf.producto_id = any (v_ids)
         and pf.url ~ '^https?://[^/?#]+/storage/v1/object/public/retail-productos-fotos/'
    )
    select jsonb_build_object('sede', v_sede, 'prendas', coalesce(jsonb_agg(jsonb_build_object(
        'id', m.id,
        'codigo', p.codigo,
        'nombre', p.referencia,
        'categoria', case when c.id is null then null else jsonb_build_object('nombre', c.nombre, 'prefijo', c.prefijo) end,
        'precio', m.precio,
        'precio_final', m.final,
        'desde', m.desde,
        'campana', m.campana,
        'colores', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'codigo', co.codigo, 'nombre', co.nombre, 'hex', co.hex,
                   'foto', (select fo.url from foto_ok fo where fo.producto_id = m.id and fo.color_codigo = co.codigo
                             order by fo.es_principal desc, fo.orden, fo.created_at, fo.id limit 1))
                 order by co.orden, co.nombre)
            from retail.colores co
           where co.codigo in (select pv.color_codigo from pv where pv.producto_id = m.id)), '[]'::jsonb),
        'fotos', coalesce((
          select jsonb_agg(fo.url order by fo.n)
            from (select fo.url, row_number() over (order by fo.es_principal desc, fo.orden, fo.created_at, fo.id) as n
                    from foto_ok fo where fo.producto_id = m.id) fo
           where fo.n <= 2), '[]'::jsonb),
        'stock', jsonb_build_object(
          'total', retail.fn_tienda_nivel(coalesce((select sum(d.n) from disponible d where d.producto_id = m.id), 0)::integer, v_umbral),
          'sedes', coalesce((
            select jsonb_object_agg(s.id::text, retail.fn_tienda_nivel(coalesce(d.n, 0), v_umbral))
              from unnest(v_sedes) as s (id)
              left join disponible d on d.producto_id = m.id and d.ubicacion_id = s.id), '{}'::jsonb)),
        'nuevo', (select jsonb_build_object('dias', ln.dias) from nuevo ln where ln.producto_id = m.id),
        'vendidos', (select mv.puesto from vendidos mv where mv.producto_id = m.id)
      ) order by vp.publicado_en desc, p.referencia, m.id), '[]'::jsonb))
    from modelos m
    join retail.productos p on p.id = m.id
    join retail.vitrina_productos vp on vp.producto_id = m.id
    left join retail.categorias c on c.id = p.categoria_id
  );
end;
$fn$;

comment on function retail.tienda_catalogo(uuid) is
  'Tienda online (ADR-0408, actividades 3 a 5): lo publicado en la Vitrina web al precio de la tienda elegida (o, con «Todas», al mayor entre las tiendas de la web; fn_precio_en_sede) y el de la campaña vigente (misma regla de la caja, ADR-0403), sus colores, hasta dos fotos, su nivel en cada tienda de la web (fn_tienda_nivel: nunca la cifra de 4 o más), si está en «Lo nuevo» (fn_tienda_lo_nuevo) y su puesto en «Más vendidos» (fn_tienda_mas_vendidos, sin las unidades). {sede, prendas: [...]}. Solo la llama tienda_web.';

revoke all on function retail.tienda_catalogo(uuid) from public, anon, authenticated;
grant execute on function retail.tienda_catalogo(uuid) to tienda_web;

-- ---------- 4. Los plazos de las páginas de ayuda ----------
-- {horas_para_confirmar, dias_para_recoger, dias_para_cambiar}. Sin la fila de Configuración ▸ Tienda web (no debería faltar: la crea
-- 20261014231000), esos dos van en null y la página los dice sin número; el de cambio sale siempre.
create or replace function retail.tienda_ayuda()
returns jsonb
language sql
stable
security definer
set search_path = retail, public
as $$
  select jsonb_build_object(
    'horas_para_confirmar', (select c.horas_para_confirmar from retail.configuracion_tienda_web c where c.id),
    'dias_para_recoger', (select c.dias_aviso_sin_recoger from retail.configuracion_tienda_web c where c.id),
    'dias_para_cambiar', retail.fn_dias_plazo_cambio())
$$;

comment on function retail.tienda_ayuda() is
  'Tienda online (ADR-0408, act. 5): los plazos de las páginas de ayuda — horas para que la tienda confirme una separación y días para recogerla después de pagar (Configuración ▸ Tienda web), y días para cambiar una prenda (fn_dias_plazo_cambio, el que imprime la boleta). {horas_para_confirmar, dias_para_recoger, dias_para_cambiar}. Solo la llama tienda_web.';

revoke all on function retail.tienda_ayuda() from public, anon, authenticated;
grant execute on function retail.tienda_ayuda() to tienda_web;

-- ---------- 5. Validación final: si algo no quedó, se deshace todo ----------
do $$
declare
  f text;
begin
  foreach f in array array['retail.tienda_catalogo(uuid)', 'retail.tienda_ayuda()'] loop
    if has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE')
       or not has_function_privilege('tienda_web', f, 'EXECUTE') then
      raise exception 'tienda inicio: % tiene que ser solo de tienda_web', f;
    end if;
  end loop;
  foreach f in array array['retail.fn_tienda_lo_nuevo(uuid[])', 'retail.fn_tienda_mas_vendidos(uuid[])'] loop
    if has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE')
       or has_function_privilege('tienda_web', f, 'EXECUTE') then
      raise exception 'tienda inicio: % es interna y nadie de afuera la llama', f;
    end if;
  end loop;
end;
$$;

reset lock_timeout;
notify pgrst, 'reload schema';
