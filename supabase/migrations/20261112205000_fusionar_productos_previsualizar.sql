-- ============================================================================
-- 20261112205000_fusionar_productos_previsualizar.sql — Fusionar productos duplicados, parte 2: qué va a pasar (ADR-0650)
-- ============================================================================
--
-- EL PROBLEMA. Fusionar no se deshace (decisión 14 de Felipe): antes de confirmar, la persona tiene que ver de cada
-- producto sus ventas y la fecha en que se creó (decisión 1), qué tallas y colores se juntan, qué datos difieren, las
-- fotos, y lo que no deja fusionar todavía, con la frase de qué hacer.
--
-- QUÉ AGREGA
--   · `fn_fusion_productos_plan(p_queda, p_duplicados, p_elecciones)`: el cálculo ÚNICO. Lo leen la pantalla (por
--     `previsualizar_fusion_productos`) y la función que fusiona (20261112210000), así lo que se ve es lo que pasa.
--     Sin permiso para la API: solo la llaman las dos funciones.
--   · `previsualizar_fusion_productos(...)`: la lectura de la pantalla, con el permiso de quien edita el catálogo
--     (`fn_puede_editar_catalogo`, decisión 4: quien ve Productos). Su prefijo `previsualizar_` ya es de lectura para el
--     loader (`lib/espera-reglas.ts`).
--
-- CÓMO SE DECIDE CADA VARIANTE. Se ordenan los productos: primero el que queda, después los duplicados en el orden dado.
-- Cada (talla, color) viva lo «absorbe» la variante del primer producto que la tiene. Si la variante es la absorbente,
-- se MUDA (cambia de producto y conserva todo: stock, ventas, códigos). Si no, se JUNTA: sus unidades pasan a la
-- absorbente con movimientos y ella se apaga (decisión 5). Una variante ya fusionada antes solo se muda: es historia.
--
-- LO QUE FRENA (bloqueos, con la frase que ve la persona). Solo se frena lo que dejaría el stock o una operación en un
-- estado imposible (principio 2). Lo que está en curso sobre una variante que se MUDA sigue igual (decisión 13); sobre
-- una que se JUNTA, la base no tiene cómo pasarla sin romperla, y se pide cerrarla antes.
--
-- PARA PEGAR EN PRODUCCIÓN: una parte, solo funciones. Re-ejecutable. Necesita 20261112204000.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

create or replace function retail.fn_fusion_productos_plan(
  p_queda uuid,
  p_duplicados uuid[],
  p_elecciones jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare
  v_centinela constant uuid := '11111111-1111-4111-8111-111111111111';
  v_dups uuid[];
  v_ids uuid[];
  v_bloqueos jsonb := '[]'::jsonb;
  v_avisos jsonb := '[]'::jsonb;
  v_productos jsonb;
  v_variantes jsonb;
  v_resumen jsonb;
  v_diferencias jsonb;
  v_el jsonb := coalesce(p_elecciones, '{}'::jsonb);
  v_fuente uuid;
  v_cat uuid;
  v_marca uuid;
  v_prov uuid;
  v_tejido uuid;
  v_patron uuid;
  v_queda retail.productos;
  v_ve_costo boolean := retail.fn_puede_ver_dinero_de_compras();
  r record;
begin
  -- Los duplicados sin repetir, sin vacíos y en el orden en que llegaron (el orden decide quién absorbe a quién).
  v_dups := array(
    select d from (select d, min(o) as o from unnest(coalesce(p_duplicados, '{}'::uuid[])) with ordinality as x(d, o)
                    where d is not null group by d) y order by o);
  v_ids := array_prepend(p_queda, v_dups);

  if p_queda is null or cardinality(v_dups) = 0 then
    return jsonb_build_object('ok', false, 'bloqueos', jsonb_build_array(jsonb_build_object(
      'codigo', 'sin_duplicados', 'mensaje', 'Elige el producto que queda y al menos un duplicado para fusionar.')));
  end if;
  if p_queda = any (v_dups) then
    return jsonb_build_object('ok', false, 'bloqueos', jsonb_build_array(jsonb_build_object(
      'codigo', 'mismo', 'mensaje', 'El producto que queda no puede ser también uno de los duplicados.')));
  end if;
  if cardinality(v_dups) > 10 then
    return jsonb_build_object('ok', false, 'bloqueos', jsonb_build_array(jsonb_build_object(
      'codigo', 'demasiados', 'mensaje', 'Se fusionan hasta 10 duplicados a la vez. Hazlo en dos tandas.')));
  end if;
  if (select count(*) from retail.productos where id = any (v_ids)) <> cardinality(v_ids) then
    return jsonb_build_object('ok', false, 'bloqueos', jsonb_build_array(jsonb_build_object(
      'codigo', 'no_existe', 'mensaje', 'Uno de los productos ya no existe. Vuelve a abrir la lista.')));
  end if;

  select * into v_queda from retail.productos where id = p_queda;

  -- ---------- Lo que la persona eligió, o lo del que queda ----------
  -- Cada campo se toma de UN producto de la fusión (campo por campo, decisión 8). Marca y proveedor van juntos: la base
  -- exige que el proveedor venda esa marca, y mezclarlos podría dejar una pareja que no existe.
  v_fuente := coalesce(nullif(v_el #>> '{campos,categoria}', '')::uuid, p_queda);
  v_cat := (select categoria_id from retail.productos where id = v_fuente and id = any (v_ids));
  v_fuente := coalesce(nullif(v_el #>> '{campos,marca_proveedor}', '')::uuid, p_queda);
  select marca_id, proveedor_id into v_marca, v_prov from retail.productos where id = v_fuente and id = any (v_ids);
  v_fuente := coalesce(nullif(v_el #>> '{campos,tejido}', '')::uuid, p_queda);
  v_tejido := (select tejido_id from retail.productos where id = v_fuente and id = any (v_ids));
  v_fuente := coalesce(nullif(v_el #>> '{campos,patron}', '')::uuid, p_queda);
  v_patron := (select patron_id from retail.productos where id = v_fuente and id = any (v_ids));
  if v_cat is null then
    v_cat := v_queda.categoria_id;
  end if;

  -- ---------- Bloqueos de producto ----------
  for r in
    select p.*, o.n
      from retail.productos p join unnest(v_ids) with ordinality as o(id, n) on o.id = p.id
     order by o.n
  loop
    if r.id = v_centinela then
      v_bloqueos := v_bloqueos || jsonb_build_object('codigo', 'centinela', 'producto_id', r.id,
        'mensaje', '«' || r.referencia || '» es una pieza del sistema (el monto manual de la caja): no se fusiona.');
    end if;
    if r.fusionado_en_id is not null then
      v_bloqueos := v_bloqueos || jsonb_build_object('codigo', 'ya_fusionado', 'producto_id', r.id,
        'mensaje', '«' || r.referencia || '» ya se fusionó en otro producto.');
    end if;
    if r.estado_alta = 'rechazado' then
      v_bloqueos := v_bloqueos || jsonb_build_object('codigo', 'rechazado', 'producto_id', r.id,
        'mensaje', '«' || r.referencia || '» fue rechazado al darse de alta: no se fusiona.');
    end if;
    if r.es_prueba is distinct from v_queda.es_prueba then
      v_bloqueos := v_bloqueos || jsonb_build_object('codigo', 'prueba_mezclada', 'producto_id', r.id,
        'mensaje', 'Un producto de prueba no se fusiona con uno real.');
    end if;
    if r.id <> p_queda and exists (select 1 from retail.despacho_pendientes dp where dp.producto_id = r.id and dp.estado = 'pendiente') then
      v_bloqueos := v_bloqueos || jsonb_build_object('codigo', 'pendiente_de_recibir', 'producto_id', r.id,
        'mensaje', '«' || r.referencia || '» tiene una prenda pendiente en un envío por recibir. Resuélvela primero en Recibir.');
    end if;
  end loop;

  if v_queda.estado = 'descontinuado'
     and exists (select 1 from retail.productos p where p.id = any (v_dups) and p.estado = 'activo') then
    v_bloqueos := v_bloqueos || jsonb_build_object('codigo', 'queda_desactivado', 'producto_id', p_queda,
      'mensaje', 'El producto que queda está desactivado y un duplicado está activo. Reactívalo primero, o elige como el que queda al que está activo.');
  end if;

  -- La empresa del que queda (si es de una sola) tiene que operar donde están las prendas que llegan.
  if v_queda.empresa_id is not null then
    for r in
      select distinct u.nombre
        from retail.stock s
        join retail.variantes v on v.id = s.variante_id
        join retail.ubicaciones u on u.id = s.ubicacion_id
       where v.producto_id = any (v_dups) and (s.cantidad <> 0 or s.cantidad_apartada <> 0)
         and not exists (select 1 from retail.fn_empresas_de_sede(s.ubicacion_id) e where e.id = v_queda.empresa_id)
    loop
      v_bloqueos := v_bloqueos || jsonb_build_object('codigo', 'empresa_fuera_de_sede', 'producto_id', p_queda,
        'mensaje', 'El producto que queda es solo de ' || (select nombre from retail.empresas where id = v_queda.empresa_id)
          || ' y un duplicado tiene prendas en ' || r.nombre || ', donde no opera. Elige como el que queda al otro.');
    end loop;
  end if;

  -- ---------- Cada variante: queda, se muda o se junta ----------
  create temporary table if not exists pg_temp.fusion_variantes (
    variante_id uuid primary key, producto_id uuid, orden integer, codigo text, talla_id uuid, color_codigo text,
    activo boolean, fusionada boolean, trato text, con_variante_id uuid, stock integer, apartada integer
  ) on commit drop;
  truncate pg_temp.fusion_variantes;

  insert into pg_temp.fusion_variantes
  select v.id, v.producto_id, o.n, v.codigo, v.talla_id, v.color_codigo, v.activo, v.fusionada_en_id is not null,
         null, null,
         coalesce((select sum(s.cantidad) from retail.stock s where s.variante_id = v.id), 0)::integer,
         coalesce((select sum(s.cantidad_apartada) from retail.stock s where s.variante_id = v.id), 0)::integer
    from retail.variantes v
    join unnest(v_ids) with ordinality as o(id, n) on o.id = v.producto_id;

  -- La absorbente de cada (talla, color): la del primer producto que la tiene. Una ya fusionada no absorbe a nadie.
  update pg_temp.fusion_variantes f
     set con_variante_id = a.absorbente
    from (
      select x.variante_id,
             first_value(x.variante_id) over (partition by x.talla_id, x.color_codigo order by x.orden) as absorbente
        from pg_temp.fusion_variantes x where not x.fusionada
    ) a
   where a.variante_id = f.variante_id;

  update pg_temp.fusion_variantes f
     set trato = case
                   when f.producto_id = p_queda then 'queda'
                   when f.fusionada or f.con_variante_id is null or f.con_variante_id = f.variante_id then 'muda'
                   else 'junta'
                 end,
         con_variante_id = case when f.producto_id <> p_queda and not f.fusionada and f.con_variante_id <> f.variante_id
                                then f.con_variante_id end;

  -- Lo que está en curso sobre una variante que se JUNTA no tiene a dónde ir: se cierra antes.
  for r in
    select f.*, coalesce(c.nombre, 'Sin color') || coalesce(' ' || t.valor, '') as nombre, p.referencia
      from pg_temp.fusion_variantes f
      join retail.productos p on p.id = f.producto_id
      left join retail.colores c on c.codigo = f.color_codigo
      left join retail.tallas t on t.id = f.talla_id
     where f.trato = 'junta'
  loop
    if r.apartada > 0 then
      v_bloqueos := v_bloqueos || jsonb_build_object('codigo', 'junta_apartada', 'variante_id', r.variante_id, 'producto_id', r.producto_id,
        'mensaje', '«' || r.referencia || ' ' || r.nombre || '» tiene ' || r.apartada || ' apartada(s) para un cliente. Entrégalas o libéralas en Apartados antes de fusionar.');
    end if;
    if exists (select 1 from retail.transferencia_items ti join retail.transferencias tr on tr.id = ti.transferencia_id
                where ti.variante_id = r.variante_id and tr.estado = 'en_transito') then
      v_bloqueos := v_bloqueos || jsonb_build_object('codigo', 'junta_en_camino', 'variante_id', r.variante_id, 'producto_id', r.producto_id,
        'mensaje', '«' || r.referencia || ' ' || r.nombre || '» va en un traslado en camino. Recíbelo en Traslados antes de fusionar.');
    end if;
    if exists (select 1 from retail.pedido_web_lineas l join retail.pedidos_web pw on pw.id = l.pedido_id
                where l.variante_id = r.variante_id and pw.estado in ('por_confirmar', 'confirmado', 'pagado')) then
      v_bloqueos := v_bloqueos || jsonb_build_object('codigo', 'junta_pedido_web', 'variante_id', r.variante_id, 'producto_id', r.producto_id,
        'mensaje', '«' || r.referencia || ' ' || r.nombre || '» está en un pedido de la tienda web sin entregar. Entrégalo o ciérralo antes de fusionar.');
    end if;
    if exists (select 1 from retail.produccion_lineas pl join retail.producciones pr on pr.id = pl.produccion_id
                where pl.variante_id = r.variante_id and pr.estado = 'en_proceso') then
      v_bloqueos := v_bloqueos || jsonb_build_object('codigo', 'junta_produccion', 'variante_id', r.variante_id, 'producto_id', r.producto_id,
        'mensaje', '«' || r.referencia || ' ' || r.nombre || '» está en una orden de producción abierta. Ciérrala antes de fusionar.');
    end if;
    if exists (select 1 from retail.conteo_items ci join retail.conteos co on co.id = ci.conteo_id
                where ci.variante_id = r.variante_id and co.estado = 'abierto') then
      v_bloqueos := v_bloqueos || jsonb_build_object('codigo', 'junta_conteo', 'variante_id', r.variante_id, 'producto_id', r.producto_id,
        'mensaje', '«' || r.referencia || ' ' || r.nombre || '» está en un conteo abierto. Ciérralo antes de fusionar.');
    end if;
    if exists (select 1 from retail.stock s join retail.sububicaciones sb on sb.id = s.sububicacion_id
                where s.variante_id = r.variante_id and sb.tipo = 'cuarentena' and s.cantidad > 0) then
      v_bloqueos := v_bloqueos || jsonb_build_object('codigo', 'junta_cuarentena', 'variante_id', r.variante_id, 'producto_id', r.producto_id,
        'mensaje', '«' || r.referencia || ' ' || r.nombre || '» tiene prendas en Cuarentena. Resuélvelas en Dañadas antes de fusionar.');
    end if;
  end loop;

  -- «Sin color» junto a otras con color en el producto final (la regla de `variantes_sin_mezcla_de_color`).
  if exists (select 1 from pg_temp.fusion_variantes f where f.activo and f.trato in ('queda', 'muda') and f.color_codigo is null)
     and exists (select 1 from pg_temp.fusion_variantes f where f.activo and f.trato in ('queda', 'muda') and f.color_codigo is not null) then
    v_bloqueos := v_bloqueos || jsonb_build_object('codigo', 'mezcla_sin_color',
      'mensaje', 'Un producto tiene prendas «Sin color» y otro tiene colores: quedarían mezcladas. Ponle color a las «Sin color» en su ficha antes de fusionar.');
  end if;

  -- Las tallas, el tejido y el patrón tienen que estar habilitados en la categoría final.
  for r in
    select distinct t.valor
      from pg_temp.fusion_variantes f join retail.tallas t on t.id = f.talla_id
     where f.activo and f.trato in ('queda', 'muda')
       and (f.trato = 'muda' or v_cat is distinct from v_queda.categoria_id)
       and not exists (select 1 from retail.categoria_tallas ct where ct.categoria_id = v_cat and ct.talla_id = f.talla_id)
  loop
    v_bloqueos := v_bloqueos || jsonb_build_object('codigo', 'talla_fuera_de_categoria',
      'mensaje', 'La talla ' || r.valor || ' no está habilitada en «' || (select nombre from retail.categorias where id = v_cat)
        || '». Habilítala en Catálogo ▸ Categorías o elige la otra categoría.');
  end loop;
  if v_tejido is not null and not exists (select 1 from retail.categoria_tejidos where categoria_id = v_cat and tejido_id = v_tejido) then
    v_bloqueos := v_bloqueos || jsonb_build_object('codigo', 'tejido_fuera_de_categoria',
      'mensaje', 'El tejido elegido no está habilitado en «' || (select nombre from retail.categorias where id = v_cat) || '». Elige el del otro producto o habilítalo en la categoría.');
  end if;
  if v_patron is not null and not exists (select 1 from retail.categoria_patrones where categoria_id = v_cat and patron_id = v_patron) then
    v_bloqueos := v_bloqueos || jsonb_build_object('codigo', 'patron_fuera_de_categoria',
      'mensaje', 'El patrón elegido no está habilitado en «' || (select nombre from retail.categorias where id = v_cat) || '». Elige el del otro producto o habilítalo en la categoría.');
  end if;

  -- ---------- Lo que se muestra: cada producto, con sus ventas y su fecha (decisión 1) ----------
  select jsonb_agg(x.fila order by x.n) into v_productos
    from (
      select o.n, jsonb_build_object(
        'id', p.id, 'queda', p.id = p_queda, 'orden', o.n,
        'referencia', p.referencia, 'codigo', p.codigo, 'version', p.version, 'estado', p.estado,
        'creado_en', p.created_at, 'descripcion', p.descripcion, 'temporada', p.temporada, 'empresa_id', p.empresa_id,
        'categoria', jsonb_build_object('id', c.id, 'nombre', c.nombre, 'prefijo', c.prefijo, 'familia', c.familia),
        'marca', jsonb_build_object('id', m.id, 'nombre', m.nombre),
        'proveedor', jsonb_build_object('id', pv.id, 'nombre', pv.nombre),
        'tejido', jsonb_build_object('id', tj.id, 'nombre', tj.nombre),
        'patron', jsonb_build_object('id', pt.id, 'nombre', pt.nombre),
        'unidades_vendidas', coalesce(vt.unidades, 0), 'ventas', coalesce(vt.tickets, 0), 'ultima_venta', vt.ultima,
        'stock', coalesce((select sum(f.stock) from pg_temp.fusion_variantes f where f.producto_id = p.id), 0),
        'variantes', (select count(*) from pg_temp.fusion_variantes f where f.producto_id = p.id and f.activo),
        'precio', (select mode() within group (order by v.precio) from retail.variantes v where v.producto_id = p.id and v.activo),
        'precios', coalesce((select jsonb_agg(distinct v.precio) from retail.variantes v where v.producto_id = p.id and v.activo), '[]'::jsonb),
        -- El costo solo lo ve quien ve el dinero de compras (20260923193700); a los demás les llega vacío.
        'costo', case when v_ve_costo then (select mode() within group (order by v.costo) from retail.variantes v where v.producto_id = p.id and v.activo) end,
        'costo_de_compras', exists (select 1 from retail.costo_historial h join retail.variantes v on v.id = h.variante_id where v.producto_id = p.id),
        'fotos', coalesce((select jsonb_agg(jsonb_build_object('id', fo.id, 'url', fo.url, 'color_codigo', fo.color_codigo,
                                                              'es_principal', fo.es_principal, 'orden', fo.orden)
                                            order by fo.es_principal desc, fo.orden, fo.created_at)
                             from retail.producto_fotos fo where fo.producto_id = p.id), '[]'::jsonb)
      ) as fila
        from retail.productos p
        join unnest(v_ids) with ordinality as o(id, n) on o.id = p.id
        left join retail.categorias c on c.id = p.categoria_id
        left join retail.marcas m on m.id = p.marca_id
        left join retail.proveedores pv on pv.id = p.proveedor_id
        left join retail.tejidos tj on tj.id = p.tejido_id
        left join retail.patrones pt on pt.id = p.patron_id
        left join lateral (
          select sum(vi.cantidad)::integer as unidades, count(distinct vi.venta_id)::integer as tickets, max(ve.created_at) as ultima
            from retail.venta_items vi
            join retail.ventas ve on ve.id = vi.venta_id and ve.estado = 'completada'
            join retail.variantes v on v.id = vi.variante_id
           where v.producto_id = p.id
        ) vt on true
    ) x;

  select coalesce(jsonb_agg(jsonb_build_object(
           'variante_id', f.variante_id, 'producto_id', f.producto_id, 'codigo', f.codigo,
           'talla', t.valor, 'color_codigo', f.color_codigo, 'color', coalesce(c.nombre, 'Sin color'), 'color_hex', c.hex,
           'activo', f.activo, 'stock', f.stock, 'trato', f.trato, 'con_variante_id', f.con_variante_id)
         order by f.orden, c.nombre nulls first, t.valor), '[]'::jsonb)
    into v_variantes
    from pg_temp.fusion_variantes f
    left join retail.colores c on c.codigo = f.color_codigo
    left join retail.tallas t on t.id = f.talla_id
   where f.trato <> 'queda';

  select jsonb_build_object(
           'mudan', count(*) filter (where trato = 'muda' and not fusionada),
           'juntan', count(*) filter (where trato = 'junta'),
           'unidades_juntadas', coalesce(sum(stock) filter (where trato = 'junta'), 0),
           'unidades_que_llegan', coalesce(sum(stock) filter (where trato <> 'queda'), 0),
           'fotos_duplicados', (select count(*) from retail.producto_fotos fo where fo.producto_id = any (v_dups)))
    into v_resumen
    from pg_temp.fusion_variantes;

  -- Los campos que difieren entre los productos: solo esos se eligen (decisión 8).
  select coalesce(jsonb_agg(k), '[]'::jsonb) into v_diferencias
    from (
      select 'referencia' as k from retail.productos where id = any (v_ids) having count(distinct retail.fn_clave_referencia(referencia)) > 1
      union all select 'descripcion' from retail.productos where id = any (v_ids) having count(distinct coalesce(nullif(btrim(descripcion), ''), '∅')) > 1
      union all select 'categoria' from retail.productos where id = any (v_ids) having count(distinct categoria_id) > 1
      union all select 'marca_proveedor' from retail.productos where id = any (v_ids)
        having count(distinct (coalesce(marca_id::text, '∅') || '/' || coalesce(proveedor_id::text, '∅'))) > 1
      union all select 'tejido' from retail.productos where id = any (v_ids) having count(distinct coalesce(tejido_id::text, '∅')) > 1
      union all select 'patron' from retail.productos where id = any (v_ids) having count(distinct coalesce(patron_id::text, '∅')) > 1
      union all select 'temporada' from retail.productos where id = any (v_ids) having count(distinct coalesce(temporada, '∅')) > 1
      union all select 'precio' from retail.variantes where producto_id = any (v_ids) and activo having count(distinct precio) > 1
      union all select 'costo' from retail.variantes where v_ve_costo and producto_id = any (v_ids) and activo having count(distinct costo) > 1
    ) d;

  if exists (select 1 from pg_temp.fusion_variantes where trato = 'junta' and stock > 0) then
    v_avisos := v_avisos || jsonb_build_object('codigo', 'se_suman',
      'mensaje', 'Las tallas y colores repetidos se juntan: su stock se suma en cada sede.');
  end if;

  return jsonb_build_object(
    'ok', jsonb_array_length(v_bloqueos) = 0,
    'productos', coalesce(v_productos, '[]'::jsonb),
    'variantes', v_variantes,
    'resumen', v_resumen,
    'diferencias', v_diferencias,
    'final', jsonb_build_object('categoria_id', v_cat, 'marca_id', v_marca, 'proveedor_id', v_prov,
                                'tejido_id', v_tejido, 'patron_id', v_patron),
    'bloqueos', v_bloqueos,
    'avisos', v_avisos);
end;
$$;

comment on function retail.fn_fusion_productos_plan(uuid, uuid[], jsonb) is
  'ADR-0650: el cálculo único de una fusión de productos (qué variante se muda o se junta, qué frena, qué difiere). Lo leen previsualizar_fusion_productos y fusionar_productos; sin permiso para la API.';

revoke all on function retail.fn_fusion_productos_plan(uuid, uuid[], jsonb) from public, anon, authenticated;

create or replace function retail.previsualizar_fusion_productos(
  p_queda uuid,
  p_duplicados uuid[],
  p_elecciones jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
begin
  if not retail.fn_puede_editar_catalogo() then
    raise exception 'No puedes fusionar productos: tu rol no edita el catálogo (módulo «Productos»). Pídele al líder que lo active.'
      using errcode = '42501';
  end if;
  return retail.fn_fusion_productos_plan(p_queda, p_duplicados, p_elecciones);
end;
$$;

comment on function retail.previsualizar_fusion_productos(uuid, uuid[], jsonb) is
  'ADR-0650: lo que pasará al fusionar los duplicados en el producto que queda, antes de confirmar. Solo lee. Quien edita el catálogo.';

revoke all on function retail.previsualizar_fusion_productos(uuid, uuid[], jsonb) from public, anon;
grant execute on function retail.previsualizar_fusion_productos(uuid, uuid[], jsonb) to authenticated;
