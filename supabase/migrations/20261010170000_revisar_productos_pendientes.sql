-- ============================================================================
-- Revisar los productos pendientes: la cola del líder y el rechazo que no deja nada colgado (ADR-0371, Felipe 2026-10-10)
--
-- EL HUECO. Un producto nace `estado_alta = 'pendiente'` cuando lo crea quien no edita el catálogo
-- (`productos_estado_alta_biut`): la alta al vuelo del conteo (`censo_crear_variante`) y, desde ADR-0361, el
-- «Modelo nuevo» de la orden de producción del Taller. `revisar_producto_censo` (20260918020000) sabe aprobarlo o
-- rechazarlo, pero ninguna pantalla la llamaba desde que el aviso de Editar producto se quitó el 2026-10-02 («no me
-- sirve»): nadie tenía dónde ver QUÉ estaba pendiente. Esta migración pone las dos piezas de la base de la cola nueva
-- (Catálogo ▸ Productos ▸ «Por revisar»); la pantalla es solo web.
--
-- 1. `fn_productos_por_revisar(p_limite, p_desde)` — la lectura. Una fila por producto pendiente (los de prueba no
--    entran, D-54), del más viejo al más nuevo, con lo que el líder necesita para decidir SIN abrir la ficha: quién lo
--    propuso, desde qué sede o terminal nació (`producto_origen`, ADR-0292), sus variantes (tallas, colores, precio
--    mínimo y máximo), el stock que ya tiene y cuántas órdenes de producción en proceso cuelgan de él. Sin costos: el
--    costo es de quien ve el dinero (20260923193700). Solo quien edita el catálogo; cualquier otra cuenta recibe 42501.
--
-- 2. `revisar_producto_censo(p_producto_id, p_aprobar)` — misma firma, mismo `returns void`, tres cambios:
--    a) el permiso se pregunta aquí, con su frase y su `hint = 'sin_permiso'`; antes lo decía solo el disparador, con
--       un mensaje que seguía diciendo «solo un líder»;
--    b) es idempotente: aprobar dos veces la misma prenda (doble clic, dos pestañas) no falla; y revisar una ya
--       revisada en el OTRO sentido dice quién ganó (`hint = 'ya_revisada'`) en vez del error del disparador;
--    c) RECHAZAR se niega si la prenda tiene una orden de producción en proceso (`con_ordenes_abiertas`) o stock
--       (`con_stock`). Rechazar es PERMANENTE: la prenda queda descontinuada y `cambiar_estado_productos` ya no deja
--       reactivarla (`rechazado_no_reactivable`), y `cerrar_produccion` no mira el estado del producto: una orden
--       abierta de un modelo rechazado igual metería stock a una prenda muerta (principio 2: cero estados
--       imposibles, y se corrige en la base, no en la pantalla). Decisión de Felipe del 2026-10-10: «bloquear hasta
--       anular la orden». Para las dos salidas la frase dice qué hacer (anular la orden en Producción; ajustar el
--       stock a 0 en Existencias) y recuerda que Aprobar o Descontinuar sí se puede.
--    Nunca se borra nada: rechazar sigue siendo `estado = 'descontinuado'` por el disparador.
--
-- LA CARRERA. Rechazar bloquea la fila del producto y sus variantes (`for update`, orden fijo por id). Una orden que
-- se esté abriendo en ese instante toma `for key share` sobre esas variantes (clave foránea de `produccion_lineas`):
-- espera a que esta transacción termine, o ya está confirmada y la cuenta la ve. Lo que NO cubre: una orden que se
-- abra DESPUÉS de rechazar, porque `abrir_produccion` no mira el estado del producto (la orden quedaría sobre una
-- prenda descontinuada). Se deja como está: tocarla chocaría con la rama del Taller (ADR-0361) y la ventana es la de
-- un líder rechazando justo cuando el Taller abre una orden sobre ese mismo modelo; ver «Se rompe si» del ADR-0371.
--
-- PARA PEGAR EN PRODUCCIÓN (una sola parte): solo funciones, sin políticas ni `alter` de tablas en uso, así que no
-- toca los candados de `auth`/`storage` (CLAUDE.md, «Políticas y deadlocks») y se puede volver a pegar. Antes, ensayo
-- con `begin; …; rollback;`. No toca ninguna tabla.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- ---------------------------------------------------------------------------
-- 1. La cola: qué hay por revisar
-- ---------------------------------------------------------------------------
create or replace function retail.fn_productos_por_revisar(p_limite integer default 50, p_desde integer default 0)
returns table (
  producto_id          uuid,
  referencia           text,
  codigo               text,
  categoria            text,
  marca                text,
  creado_en            timestamptz,
  propuesto_por_nombre text,
  sede                 text,
  sede_tipo            text,
  terminal             text,
  variantes            integer,
  tallas               text[],
  colores              text[],
  precio_min           numeric,
  precio_max           numeric,
  stock                integer,
  ordenes_abiertas     integer,
  total                bigint
)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
begin
  if not retail.fn_puede_editar_catalogo() then
    raise exception 'Solo quien edita el catálogo puede ver las prendas por revisar.' using errcode = '42501', hint = 'sin_permiso';
  end if;

  return query
  select p.id, p.referencia, p.codigo, c.nombre, m.nombre, p.created_at,
         nullif(btrim(concat_ws(' ', pe.nombres, pe.apellidos)), ''),
         u.nombre, u.tipo, t.nombre,
         coalesce(v.n, 0)::integer, coalesce(v.tallas, '{}'::text[]), coalesce(v.colores, '{}'::text[]), v.precio_min, v.precio_max,
         coalesce(s.cantidad, 0)::integer, coalesce(o.n, 0)::integer,
         count(*) over ()
    from retail.productos p
    left join retail.categorias c on c.id = p.categoria_id
    left join retail.marcas m on m.id = p.marca_id
    left join public.personas pe on pe.id = p.propuesto_por
    left join retail.producto_origen po on po.producto_id = p.id
    left join retail.ubicaciones u on u.id = po.ubicacion_id
    left join retail.terminales t on t.id = po.terminal_id
    left join lateral (
      select count(*) as n,
             array_agg(distinct ta.valor) filter (where ta.valor is not null) as tallas,
             array_agg(distinct co.nombre) filter (where co.nombre is not null) as colores,
             min(va.precio) as precio_min,
             max(va.precio) as precio_max
        from retail.variantes va
        left join retail.tallas ta on ta.id = va.talla_id
        left join retail.colores co on co.codigo = va.color_codigo
       where va.producto_id = p.id and va.activo
    ) v on true
    left join lateral (
      select sum(st.cantidad) as cantidad
        from retail.stock st
        join retail.variantes va on va.id = st.variante_id
       where va.producto_id = p.id
    ) s on true
    left join lateral (
      select count(*) as n from retail.producciones pr where pr.producto_id = p.id and pr.estado = 'en_proceso'
    ) o on true
   where p.estado_alta = 'pendiente' and not p.es_prueba
   order by p.created_at, p.id
   limit least(greatest(coalesce(p_limite, 50), 1), 200)
   offset greatest(coalesce(p_desde, 0), 0);
end;
$$;

comment on function retail.fn_productos_por_revisar(integer, integer) is
  'La cola de Catálogo ▸ Productos ▸ «Por revisar» (ADR-0371): una fila por prenda pendiente, la más vieja primero, con quién la propuso, desde qué sede nació, sus variantes y precios, su stock y sus órdenes en proceso. `total` es cuántas hay en todo (para paginar). Solo quien edita el catálogo; sin costos.';

-- ---------------------------------------------------------------------------
-- 2. Aprobar o rechazar
-- ---------------------------------------------------------------------------
create or replace function retail.revisar_producto_censo(p_producto_id uuid, p_aprobar boolean)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_ref text;
  v_alta text;
  v_objetivo text;
  v_ordenes integer;
  v_stock integer;
begin
  if p_producto_id is null or p_aprobar is null then
    raise exception 'Falta la prenda o la decisión.' using hint = 'datos_incompletos';
  end if;
  if not retail.fn_puede_editar_catalogo() then
    raise exception 'Solo quien edita el catálogo puede aprobar o rechazar una prenda propuesta.' using errcode = '42501', hint = 'sin_permiso';
  end if;

  -- La prenda se bloquea mientras se revisa: dos líderes que deciden a la vez no se pisan, y el segundo ve lo que el primero hizo.
  select referencia, estado_alta into v_ref, v_alta from retail.productos where id = p_producto_id for update;
  if not found then
    raise exception 'Esa prenda no existe.' using hint = 'no_existe';
  end if;

  -- Ya estaba así (doble clic, otra pestaña): nada que hacer y nada que reclamar. (Va en una variable: plpgsql corta un `if`
  -- en el primer `then`, y el de un `case` metido en la condición lo confunde.)
  v_objetivo := case when p_aprobar then 'aprobado' else 'rechazado' end;
  if v_alta = v_objetivo then
    return;
  end if;
  if v_alta <> 'pendiente' then
    raise exception '«%» ya se revisó: quedó %.', v_ref, case v_alta when 'aprobado' then 'aprobada' else 'rechazada' end
      using hint = 'ya_revisada';
  end if;

  if not p_aprobar then
    -- `for update` y no `for no key update`: tiene que chocar con el `for key share` que una orden nueva toma sobre la variante.
    perform 1 from retail.variantes where producto_id = p_producto_id order by id for update;

    select count(*)::integer into v_ordenes from retail.producciones where producto_id = p_producto_id and estado = 'en_proceso';
    if v_ordenes > 0 then
      raise exception 'No se puede rechazar «%»: tiene % en proceso en el Taller. Anula esa orden en Producción y vuelve a revisar la prenda; si la prenda está bien, apruébala.',
        v_ref, case when v_ordenes = 1 then 'una orden de producción' else v_ordenes || ' órdenes de producción' end
        using hint = 'con_ordenes_abiertas';
    end if;

    select coalesce(sum(s.cantidad), 0)::integer into v_stock
      from retail.stock s join retail.variantes v on v.id = s.variante_id
     where v.producto_id = p_producto_id;
    if v_stock > 0 then
      raise exception 'No se puede rechazar «%»: tiene % en stock. Ajusta su stock a 0 en Existencias y vuelve a revisarla; si la prenda está bien, apruébala (o descontínuala en su ficha, que se puede deshacer).',
        v_ref, case when v_stock = 1 then 'una prenda' else v_stock || ' prendas' end
        using hint = 'con_stock';
    end if;
  end if;

  -- El disparador `productos_estado_alta_biut` valida la transición, firma `aprobado_por` y, al rechazar, apaga `estado`.
  update retail.productos set estado_alta = v_objetivo where id = p_producto_id;
end;
$$;

comment on function retail.revisar_producto_censo(uuid, boolean) is
  'Aprueba o rechaza una prenda propuesta (alta al vuelo del conteo, «Modelo nuevo» del Taller). Idempotente. Rechazar es permanente y se niega con una orden de producción en proceso (con_ordenes_abiertas) o con stock (con_stock); nada se borra: la prenda queda descontinuada. Solo quien edita el catálogo. ADR-0371.';

-- ---------------------------------------------------------------------------
-- 3. Permisos
-- ---------------------------------------------------------------------------
revoke all on function retail.fn_productos_por_revisar(integer, integer) from public, anon;
grant execute on function retail.fn_productos_por_revisar(integer, integer) to authenticated;

revoke all on function retail.revisar_producto_censo(uuid, boolean) from public, anon;
grant execute on function retail.revisar_producto_censo(uuid, boolean) to authenticated;
