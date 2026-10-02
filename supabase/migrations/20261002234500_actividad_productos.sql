-- ============================================================================
-- 20261002234500_actividad_productos.sql — CAYLA V2 (ADR-0207, «Actualización 2026-10-02», etapa Productos)
--
-- EL PROBLEMA. Productos es lo que más se toca en el ERP (92 prendas y ~126 ediciones en producción al 2026-10-02:
-- temporada, costo, precio, marca, proveedor, categoría), y Actividad solo contaba cuando un Admin ELIMINABA una prenda.
-- Una líder no podía preguntar «¿quién le cambió el precio a la Blusa Alba?» ni «¿quién creó esta prenda?».
--
-- LA DECISIÓN (Felipe, 2026-10-02): Productos anota su actividad, y como el catálogo no tiene sede, **cada línea va en la
-- sede de quien la hizo** (no «solo Líder», no «todas las sedes»): la líder de tienda ve lo que su gente cambió.
--
-- QUÉ SE ANOTA (una línea por guardado, no por campo ni por variante):
--   · Crear: «creó «Top con Escote y Amarre» (TOP-0019) con 6 variantes (tallas S, M y L · colores Vino y Negro) a
--     S/ 89.00 · 12 prendas de stock inicial». La persona y la sede salen de `producto_origen` (ADR-0283), que el alta ya
--     anota. Con esto el stock que nace con un producto nuevo —que Existencias deja fuera a propósito (20261002233000)—
--     queda contado aquí.
--   · Editar: de `historial_producto_cambios`, que ya guarda cada campo con su antes y su después (lo llenan los
--     disparadores de `productos` y `variantes`). Un guardado de UNA prenda: «editó «Blusa Alba»: precio S/ 89.00 →
--     S/ 79.00 en 6 variantes y categoría Blusas → Tops». Un cambio en bloque: «asignó la temporada Primavera-Verano a
--     8 productos». Se agrupa por TRANSACCIÓN igual que Existencias: las filas de un mismo guardado comparten `created_at`
--     y solo la primera (menor id) anota.
--   · Aprobar / rechazar una prenda propuesta (cuando es otra operación que el alta).
--   · Eliminar: `eliminar_producto_con_historia` ya anota su línea (ADR-0252); la de `eliminar_producto` (sin historia) no,
--     y se anota aquí desde su fila «eliminado» del historial, sin repetir la otra.
--   · Nombre y descripción: el historial no los guardaba. Un disparador nuevo los suma a `historial_producto_cambios`.
--
-- EL COSTO NO SE ESCRIBE. El costo de una prenda solo lo ve el líder o quien tiene permiso de dinero de compras
-- (20260923193700); una línea de Actividad la lee la líder de tienda. Se anota «corrigió el costo de 3 variantes», sin
-- montos ni en el texto ni en `detalle`. Y el costo que cambia al RECIBIR una compra o cerrar una producción no es una
-- edición de Productos: se deja fuera (lo cuenta su módulo cuando anote).
--
-- PRODUCCIÓN. Sin políticas: UNA sola parte. Toma candados breves de `productos` y `historial_producto_cambios` al
-- crear los disparadores; `lock_timeout = 3s`. Re-ejecutable. Prueba: `pnpm pruebas:actividad-productos`.
-- ============================================================================

set lock_timeout = '3s';

update retail.modulos
   set incluye = 'Ver quién hizo qué en cada módulo de su tienda: ventas, caja, cambios, apartados, existencias, conteos, traslados y productos, con fecha, hora y persona'
 where clave = 'actividad';

-- ---------- 1. Piezas ----------

-- La sede de quien hizo algo (el catálogo no tiene sede; Felipe, 2026-10-02: la de quien lo hizo). En vivo, la de la
-- operación (la terminal o la sede elegida); al cargar lo pasado, la sede asignada a la persona.
create or replace function retail.fn_actividad_sede_de(p_persona_id uuid, p_origen text) returns uuid
language plpgsql stable security definer set search_path = retail, public, extensions as $fn$
declare
  v uuid;
begin
  if p_origen = 'vivo' then
    begin
      v := retail.fn_ubicacion_de_la_operacion();
    exception when others then
      v := null;
    end;
  end if;
  return coalesce(v, (select c.ubicacion_asignada_id from retail.colaboradores c where c.persona_id = p_persona_id limit 1));
end;
$fn$;

-- «Top con Escote y Amarre» — el nombre (referencia) de un producto.
create or replace function retail.fn_actividad_producto(p_producto_id uuid) returns text
language sql stable security definer set search_path = retail, public, extensions as $$
  select coalesce(nullif(btrim(p.referencia), ''), nullif(btrim(p.descripcion), ''), p.codigo, 'una prenda')
    from retail.productos p where p.id = p_producto_id;
$$;

-- Un valor del historial como se lee: el nombre de la categoría, de la marca, de la temporada, el precio en soles…
create or replace function retail.fn_actividad_valor_producto(p_campo text, p_valor text) returns text
language plpgsql stable security definer set search_path = retail, public, extensions as $fn$
begin
  if p_valor is null or btrim(p_valor) = '' then
    return case p_campo when 'marca_id' then 'sin marca' when 'proveedor_id' then 'sin proveedor'
                        when 'categoria_id' then 'sin categoría' when 'temporada' then 'sin temporada' else '—' end;
  end if;
  return case p_campo
    when 'categoria_id' then coalesce((select k.nombre from retail.categorias k where k.id::text = p_valor), p_valor)
    when 'marca_id' then coalesce((select m.nombre from retail.marcas m where m.id::text = p_valor), p_valor)
    when 'proveedor_id' then coalesce((select v.nombre from retail.proveedores v where v.id::text = p_valor), p_valor)
    when 'temporada' then coalesce((select t.nombre from retail.temporadas t where t.clave = p_valor), p_valor)
    when 'color' then coalesce((select c.nombre from retail.colores c where c.codigo = p_valor), p_valor)
    when 'precio' then retail.fn_actividad_soles(p_valor::numeric)
    when 'estado' then case p_valor when 'descontinuado' then 'descontinuado' else p_valor end
    else p_valor
  end;
exception when others then
  return p_valor;
end;
$fn$;

-- El orden en que se leen las tallas en la tienda (el mismo de `ordenTalla`, apps/web/lib/catalogo-grupos.ts): letras
-- por tamaño (XS antes que S), luego números por valor, luego lo demás.
create or replace function retail.fn_actividad_peso_talla(p text) returns numeric
language sql immutable as $$
  select coalesce(
    array_position(array['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'], upper(btrim(p)))::numeric - 1,
    case when btrim(p) ~ '^[0-9]+(\.[0-9]+)?$' then 8 + btrim(p)::numeric end,
    1e12);
$$;

-- Cómo se llama un campo del historial en la tienda.
create or replace function retail.fn_actividad_etiqueta_campo(p_campo text) returns text
language sql immutable as $$
  select case p_campo
    when 'referencia' then 'nombre' when 'precio' then 'precio' when 'categoria_id' then 'categoría' when 'temporada' then 'temporada'
    when 'marca_id' then 'marca' when 'proveedor_id' then 'proveedor' when 'estado' then 'estado' when 'color' then 'color'
    when 'talla' then 'talla' when 'activo' then 'variantes activas' when 'codigo' then 'código'
    when 'costo' then 'costo' when 'costo_declarado' then 'costo' when 'descripcion' then 'descripción' when 'foto' then 'fotos'
    else replace(p_campo, '_', ' ') end;
$$;

-- ---------- 2. Nombre y descripción también dejan rastro en el historial del producto ----------
create or replace function retail.fn_historial_nombre_producto() returns trigger
language plpgsql security definer set search_path = retail, public, extensions as $fn$
declare
  v_actor uuid;
begin
  begin
    v_actor := retail.fn_actor_persona_id(true);
  exception when others then
    v_actor := null;
  end;
  if new.referencia is distinct from old.referencia then
    insert into retail.historial_producto_cambios (entidad, entidad_id, campo, valor_anterior, valor_nuevo, usuario_id)
    values ('producto', new.id, 'referencia', old.referencia, new.referencia, v_actor);
  end if;
  if new.descripcion is distinct from old.descripcion then
    insert into retail.historial_producto_cambios (entidad, entidad_id, campo, valor_anterior, valor_nuevo, usuario_id)
    values ('producto', new.id, 'descripcion', old.descripcion, new.descripcion, v_actor);
  end if;
  return new;
end;
$fn$;

create or replace trigger productos_nombre_historial
  after update of referencia, descripcion on retail.productos
  for each row
  when (old.referencia is distinct from new.referencia or old.descripcion is distinct from new.descripcion)
  execute function retail.fn_historial_nombre_producto();

-- ---------- 3. Crear un producto ----------
create or replace function retail.fn_actividad_producto_creado(p_producto_id uuid, p_origen text default 'vivo') returns void
language plpgsql security definer set search_path = retail, public, extensions as $fn$
declare
  p retail.productos;
  o retail.producto_origen;
  v_variantes integer;
  v_tallas text[];
  v_colores text[];
  v_precio_min numeric;
  v_precio_max numeric;
  v_prendas integer;
  v_sede_stock uuid;
  v_persona uuid;
  v_sede uuid;
begin
  select * into p from retail.productos where id = p_producto_id;
  if p.id is null then return; end if;
  select * into o from retail.producto_origen where producto_id = p.id;

  select count(*)::integer, min(v.precio), max(v.precio) into v_variantes, v_precio_min, v_precio_max
    from retail.variantes v where v.producto_id = p.id;
  select array_agg(x.valor order by retail.fn_actividad_peso_talla(x.valor), x.valor) into v_tallas
    from (select distinct t.valor from retail.variantes v join retail.tallas t on t.id = v.talla_id where v.producto_id = p.id) x;
  select array_agg(x.nombre order by x.nombre) into v_colores
    from (select distinct c.nombre from retail.variantes v join retail.colores c on c.codigo = v.color_codigo where v.producto_id = p.id) x;
  -- El stock que nació con el producto (misma transacción): Existencias lo deja fuera para que se cuente aquí.
  select coalesce(sum(m.cantidad), 0)::integer, min(m.ubicacion_id::text)::uuid into v_prendas, v_sede_stock
    from retail.movimientos m join retail.variantes v on v.id = m.variante_id
   where v.producto_id = p.id and m.tipo = 'entrada' and m.motivo = 'carga_inicial' and m.created_at = p.created_at;

  v_persona := coalesce(o.persona_id, p.propuesto_por);
  v_sede := coalesce(o.ubicacion_id, v_sede_stock, retail.fn_actividad_sede_de(v_persona, 'carga_inicial'));

  perform retail.fn_actividad_anotar(
    'productos', 'producto_creado',
    case when p.estado_alta = 'pendiente' then 'propuso «' else 'creó «' end || retail.fn_actividad_producto(p.id) || '»'
      || coalesce(' (' || p.codigo || ')', '')
      || case when v_variantes > 0 then ' con ' || retail.fn_actividad_cuantas(v_variantes, 'variante', 'variantes')
              || case when cardinality(v_tallas) > 0 or cardinality(v_colores) > 0 then ' ('
                   || concat_ws(' · ',
                        case when cardinality(v_tallas) = 1 then 'talla ' || v_tallas[1]
                             when cardinality(v_tallas) > 1 then 'tallas ' || retail.fn_actividad_enumerar(v_tallas) end,
                        case when cardinality(v_colores) = 1 then 'color ' || v_colores[1]
                             when cardinality(v_colores) > 1 then 'colores ' || retail.fn_actividad_enumerar(v_colores) end)
                   || ')' else '' end
              else '' end
      || case when v_precio_min is null then ''
              when v_precio_min = v_precio_max then ' a ' || retail.fn_actividad_soles(v_precio_min)
              else ' de ' || retail.fn_actividad_soles(v_precio_min) || ' a ' || retail.fn_actividad_soles(v_precio_max) end
      || case when v_prendas > 0 then ' · ' || retail.fn_actividad_cuantas(v_prendas, 'prenda', 'prendas') || ' de stock inicial' else '' end
      || case when p.estado_alta = 'pendiente' then ' · por aprobar' else '' end,
    v_persona, o.terminal_id, v_sede, null, 'productos', p.id::text, p.created_at,
    jsonb_build_object('producto_id', p.id, 'codigo', p.codigo, 'variantes', v_variantes, 'prendas', nullif(v_prendas, 0),
                       'es_prueba', nullif(p.es_prueba, false)),
    p_origen);
end;
$fn$;

-- Aprobar o rechazar una prenda propuesta (solo cuando es otra operación que el alta: una prenda que nace aprobada no
-- dice dos veces lo mismo).
create or replace function retail.fn_actividad_producto_aprobado(p_producto_id uuid, p_origen text default 'vivo') returns void
language plpgsql security definer set search_path = retail, public, extensions as $fn$
declare
  p retail.productos;
  v_persona uuid;
begin
  select * into p from retail.productos where id = p_producto_id;
  if p.id is null or p.estado_alta not in ('aprobado', 'rechazado') or p.aprobado_en is null or p.aprobado_en = p.created_at then
    return;
  end if;
  v_persona := p.aprobado_por;
  perform retail.fn_actividad_anotar(
    'productos', case p.estado_alta when 'aprobado' then 'producto_aprobado' else 'producto_rechazado' end,
    case p.estado_alta when 'aprobado' then 'aprobó «' else 'rechazó «' end || retail.fn_actividad_producto(p.id) || '»'
      || coalesce(' (' || p.codigo || ')', ''),
    v_persona, null, retail.fn_actividad_sede_de(v_persona, p_origen), null, 'productos', p.id::text, p.aprobado_en,
    jsonb_build_object('producto_id', p.id, 'codigo', p.codigo, 'es_prueba', nullif(p.es_prueba, false)),
    p_origen);
end;
$fn$;

-- ---------- 4. Editar (desde el historial del producto) ----------

-- Las filas del historial que cuentan como edición en un guardado: las de quien firmó en esa transacción, menos lo que
-- ya cuenta otra línea (el alta, el eliminar) y menos el costo que movió una compra o una producción.
create or replace function retail.fn_actividad_historial_del_guardado(p_created_at timestamptz, p_usuario_id uuid)
returns table (id uuid, entidad text, campo text, valor_anterior text, valor_nuevo text, producto_id uuid)
language sql stable security definer set search_path = retail, public, extensions as $$
  select h.id, h.entidad, h.campo, h.valor_anterior, h.valor_nuevo,
         case when h.entidad = 'producto' then h.entidad_id else v.producto_id end
    from retail.historial_producto_cambios h
    left join retail.variantes v on h.entidad = 'variante' and v.id = h.entidad_id
   where h.created_at = p_created_at and h.usuario_id is not distinct from p_usuario_id
     and h.campo <> 'eliminado'
     and not exists (select 1 from retail.productos p
                      where p.id = case when h.entidad = 'producto' then h.entidad_id else v.producto_id end
                        and p.created_at = h.created_at)
     and not (h.campo in ('costo', 'costo_declarado') and exists (
       select 1 from retail.movimientos m
        where m.created_at = h.created_at and (m.compra_item_id is not null or m.lote_id is not null or m.produccion_id is not null)));
$$;

create or replace function retail.fn_actividad_producto_cambios(p_historial_id uuid, p_origen text default 'vivo') returns void
language plpgsql security definer set search_path = retail, public, extensions as $fn$
declare
  h retail.historial_producto_cambios;
  v_lider text;
  v_productos uuid[];
  v_n integer;
  v_partes text[] := '{}';
  v_etiquetas text[] := '{}';
  v_texto text;
  v_accion text := 'producto_editado';
  v_unico record;
  r record;
  c_orden constant text[] := array['referencia', 'precio', 'categoria_id', 'temporada', 'marca_id', 'proveedor_id', 'estado',
                                   'color', 'talla', 'activo', 'codigo', 'costo', 'costo_declarado', 'foto', 'descripcion'];
begin
  select * into h from retail.historial_producto_cambios where id = p_historial_id;
  if h.id is null then return; end if;

  -- Eliminar sin historia (`eliminar_producto`): su línea, si `eliminar_producto_con_historia` no puso ya la suya.
  if h.campo = 'eliminado' then
    if h.entidad = 'producto' and not exists (
      select 1 from retail.actividad a where a.tabla = 'productos' and a.registro_id = h.entidad_id::text and a.accion = 'producto_eliminado'
    ) then
      perform retail.fn_actividad_anotar(
        'productos', 'producto_eliminado',
        'eliminó «' || coalesce(nullif(btrim(h.valor_anterior), ''), 'una prenda') || '»',
        h.usuario_id, null, retail.fn_actividad_sede_de(h.usuario_id, p_origen), null, 'productos', h.entidad_id::text, h.created_at,
        jsonb_build_object('producto_id', h.entidad_id),
        p_origen);
    end if;
    return;
  end if;

  -- Solo la primera fila del guardado anota; si esta no cuenta (alta, costo de una compra…), tampoco.
  select min(g.id::text) into v_lider from retail.fn_actividad_historial_del_guardado(h.created_at, h.usuario_id) g;
  if v_lider is null or v_lider <> h.id::text then return; end if;

  select array_agg(distinct g.producto_id) into v_productos
    from retail.fn_actividad_historial_del_guardado(h.created_at, h.usuario_id) g where g.producto_id is not null;
  v_n := coalesce(cardinality(v_productos), 0);

  -- Cada campo del guardado, con su antes y su después (o cuántas variantes, si no es el mismo cambio en todas).
  for r in
    select g.campo, count(*)::integer as n,
           count(distinct coalesce(g.valor_anterior, '∅') || '→' || coalesce(g.valor_nuevo, '∅'))::integer as distintos,
           count(distinct coalesce(g.valor_nuevo, '∅'))::integer as nuevos,
           min(g.valor_anterior) as antes, min(g.valor_nuevo) as despues,
           count(*) filter (where g.valor_nuevo = 'false')::integer as apagadas,
           count(*) filter (where g.valor_nuevo = 'true')::integer as encendidas,
           count(*) filter (where g.valor_nuevo is null or g.valor_nuevo ilike 'quitad%' or g.valor_nuevo ilike 'eliminad%')::integer as quitadas,
           bool_or(g.entidad = 'variante') as de_variantes
      from retail.fn_actividad_historial_del_guardado(h.created_at, h.usuario_id) g
     group by g.campo
     order by coalesce(array_position(c_orden, g.campo), 99), g.campo
  loop
    v_etiquetas := v_etiquetas || retail.fn_actividad_etiqueta_campo(r.campo);
    v_partes := v_partes || case
      -- El costo, sin montos (20260923193700: solo lo ve quien ve el dinero).
      when r.campo in ('costo', 'costo_declarado') then 'el costo de ' || retail.fn_actividad_cuantas(r.n, 'variante', 'variantes')
      when r.campo = 'activo' then concat_ws(' y ',
             case when r.apagadas > 0 then 'desactivó ' || retail.fn_actividad_cuantas(r.apagadas, 'variante', 'variantes') end,
             case when r.encendidas > 0 then 'activó ' || retail.fn_actividad_cuantas(r.encendidas, 'variante', 'variantes') end)
      when r.campo = 'codigo' then 'el código de ' || retail.fn_actividad_cuantas(r.n, 'variante', 'variantes')
      when r.campo = 'foto' then concat_ws(' y ',
             case when r.n - r.quitadas > 0 then 'agregó ' || retail.fn_actividad_cuantas(r.n - r.quitadas, 'foto', 'fotos') end,
             case when r.quitadas > 0 then 'quitó ' || retail.fn_actividad_cuantas(r.quitadas, 'foto', 'fotos') end)
      when r.campo = 'descripcion' then 'la descripción'
      when r.campo = 'referencia' and r.distintos = 1 then 'nombre «' || coalesce(r.antes, '—') || '» → «' || coalesce(r.despues, '—') || '»'
      when r.distintos = 1 then
        retail.fn_actividad_etiqueta_campo(r.campo) || ' ' || retail.fn_actividad_valor_producto(r.campo, r.antes) || ' → ' || retail.fn_actividad_valor_producto(r.campo, r.despues)
        || case when r.de_variantes and r.n > 1 then ' en ' || r.n || ' variantes' else '' end
      else
        retail.fn_actividad_etiqueta_campo(r.campo)
        || case when r.de_variantes then ' de ' || retail.fn_actividad_cuantas(r.n, 'variante', 'variantes') else ' de ' || r.n end
    end;
  end loop;
  if cardinality(v_partes) = 0 then return; end if;

  -- Un solo campo con un mismo valor nuevo: la frase del negocio («asignó la temporada…», «descontinuó…»).
  select min(g.campo) as campo, min(g.valor_nuevo) as despues, count(distinct g.campo)::integer as campos,
         count(distinct coalesce(g.valor_nuevo, '∅'))::integer as nuevos
    into v_unico
    from retail.fn_actividad_historial_del_guardado(h.created_at, h.usuario_id) g;

  if v_unico.campos = 1 and v_unico.nuevos = 1 and v_unico.campo = 'estado' then
    v_accion := case when v_unico.despues = 'descontinuado' then 'producto_descontinuado' else 'producto_reactivado' end;
    v_texto := case when v_unico.despues = 'descontinuado' then 'descontinuó ' else 'reactivó ' end
      || case when v_n = 1 then '«' || retail.fn_actividad_producto(v_productos[1]) || '»' else v_n || ' productos' end;
  elsif v_n = 1 then
    v_texto := 'editó «' || retail.fn_actividad_producto(v_productos[1]) || '»: ' || retail.fn_actividad_enumerar(v_partes);
  elsif v_unico.campos = 1 and v_unico.nuevos = 1 and v_unico.campo = 'temporada' then
    v_texto := 'asignó la temporada ' || retail.fn_actividad_valor_producto('temporada', v_unico.despues) || ' a ' || v_n || ' productos';
  elsif v_unico.campos = 1 and v_unico.nuevos = 1 and v_unico.campo in ('categoria_id', 'marca_id', 'proveedor_id') then
    v_texto := 'pasó ' || v_n || ' productos a la ' || case v_unico.campo when 'categoria_id' then 'categoría ' when 'marca_id' then 'marca '
                                                                          else 'proveedor ' end
      || retail.fn_actividad_valor_producto(v_unico.campo, v_unico.despues);
    v_texto := replace(v_texto, 'a la proveedor', 'al proveedor');
  elsif v_unico.campos = 1 and v_unico.nuevos = 1 and v_unico.campo = 'precio' then
    v_texto := 'cambió el precio a ' || retail.fn_actividad_valor_producto('precio', v_unico.despues) || ' en ' || v_n || ' productos';
  else
    v_texto := 'editó ' || v_n || ' productos'
      || case when v_n <= 3 then ' (' || retail.fn_actividad_enumerar(
                 (select array_agg('«' || retail.fn_actividad_producto(x) || '»' order by retail.fn_actividad_producto(x)) from unnest(v_productos) x)) || ')'
              else '' end
      || ': ' || retail.fn_actividad_enumerar(array(select distinct e from unnest(v_etiquetas) e order by e));
  end if;

  perform retail.fn_actividad_anotar(
    'productos', v_accion, v_texto,
    h.usuario_id, case when p_origen = 'vivo' then retail.fn_actividad_terminal_ahora() end,
    retail.fn_actividad_sede_de(h.usuario_id, p_origen), null, 'historial_producto_cambios', h.id::text, h.created_at,
    jsonb_build_object('productos', v_n, 'producto_id', case when v_n = 1 then v_productos[1] end,
                       'campos', to_jsonb(array(select distinct e from unnest(v_etiquetas) e order by e))),
    p_origen);
end;
$fn$;

-- ---------- 5. Disparadores (envueltos: un error del historial nunca detiene el guardado) ----------
create or replace function retail.trg_actividad_productos() returns trigger
language plpgsql security definer set search_path = retail, public, extensions as $fn$
begin
  begin
    if tg_op = 'INSERT' then
      perform retail.fn_actividad_producto_creado(new.id);
    elsif old.estado_alta is distinct from new.estado_alta then
      perform retail.fn_actividad_producto_aprobado(new.id);
    end if;
  exception when others then
    raise warning 'actividad: no se anotó el producto % (%)', new.id, sqlerrm;
  end;
  return null;
end;
$fn$;

create or replace function retail.trg_actividad_historial_producto() returns trigger
language plpgsql security definer set search_path = retail, public, extensions as $fn$
begin
  begin
    perform retail.fn_actividad_producto_cambios(new.id);
  exception when others then
    raise warning 'actividad: no se anotó el cambio de producto % (%)', new.id, sqlerrm;
  end;
  return null;
end;
$fn$;

-- Al CONFIRMAR (diferidos): un alta guarda sus variantes, su stock y su origen después de la ficha; un guardado escribe
-- varias filas de historial. Se crean solo si faltan (nunca `drop trigger`).
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_actividad_producto_nuevo' and tgrelid = 'retail.productos'::regclass) then
    create constraint trigger trg_actividad_producto_nuevo
      after insert on retail.productos
      deferrable initially deferred
      for each row execute function retail.trg_actividad_productos();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_actividad_historial_producto' and tgrelid = 'retail.historial_producto_cambios'::regclass) then
    create constraint trigger trg_actividad_historial_producto
      after insert on retail.historial_producto_cambios
      deferrable initially deferred
      for each row execute function retail.trg_actividad_historial_producto();
  end if;
end $$;

create or replace trigger trg_actividad_producto_alta
  after update of estado_alta on retail.productos
  for each row when (old.estado_alta is distinct from new.estado_alta)
  execute function retail.trg_actividad_productos();

-- ---------- 6. Permisos: anotar es solo de los disparadores ----------
revoke all on function retail.fn_actividad_sede_de(uuid, text) from public, anon, authenticated;
revoke all on function retail.fn_actividad_producto(uuid) from public, anon, authenticated;
revoke all on function retail.fn_actividad_valor_producto(text, text) from public, anon, authenticated;
revoke all on function retail.fn_actividad_etiqueta_campo(text) from public, anon, authenticated;
revoke all on function retail.fn_historial_nombre_producto() from public, anon, authenticated;
revoke all on function retail.fn_actividad_producto_creado(uuid, text) from public, anon, authenticated;
revoke all on function retail.fn_actividad_producto_aprobado(uuid, text) from public, anon, authenticated;
revoke all on function retail.fn_actividad_historial_del_guardado(timestamptz, uuid) from public, anon, authenticated;
revoke all on function retail.fn_actividad_producto_cambios(uuid, text) from public, anon, authenticated;
revoke all on function retail.trg_actividad_productos() from public, anon, authenticated;
revoke all on function retail.trg_actividad_historial_producto() from public, anon, authenticated;

-- ---------- 7. Lo que ya pasó ----------
do $$
declare
  r record;
begin
  for r in select id from retail.productos order by created_at, id loop
    perform retail.fn_actividad_producto_creado(r.id, 'carga_inicial');
    perform retail.fn_actividad_producto_aprobado(r.id, 'carga_inicial');
  end loop;
  for r in select id from retail.historial_producto_cambios order by created_at, id loop
    perform retail.fn_actividad_producto_cambios(r.id, 'carga_inicial');
  end loop;
end $$;
