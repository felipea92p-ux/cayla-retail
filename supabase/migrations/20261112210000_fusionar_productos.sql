-- ============================================================================
-- 20261112210000_fusionar_productos.sql — Fusionar productos duplicados, parte 3: la fusión (ADR-0650)
-- ============================================================================
--
-- QUÉ HACE `fusionar_productos(p_queda, p_duplicados, p_elecciones, p_versiones)`, en UNA transacción (si un paso falla,
-- no queda nada a medias):
--   1. Permiso de quien edita el catálogo (decisión 4) y firma del responsable del combo (`fn_actor_persona_id(true)`).
--   2. Toma las filas de todos los productos en orden de id (`for update`: dos personas fusionando lo mismo esperan y la
--      segunda encuentra el duplicado ya fusionado) y compara la versión que vio la pantalla (PT409 `version_cambiada`).
--   3. Recalcula el plan (`fn_fusion_productos_plan`, lo mismo que se previsualizó). Con un bloqueo, se detiene con su frase.
--   4. Guarda la ficha completa de cada producto ANTES de tocarlo (`producto_fusiones`).
--   5. Marca a los duplicados como fusionados (descontinuados, nunca borrados): así sueltan su nombre.
--   6. Variantes: la que se MUDA cambia de producto y se lleva todo (stock, ventas, apartados, traslados, códigos). La que
--      se JUNTA pasa sus unidades a la que queda con un par de movimientos por sede y lugar (salida y entrada, motivo
--      `fusion_producto`), cada dueño con lo suyo en una sede de dos empresas (decisión 12); sus códigos de barras pasan a
--      la que queda (las etiquetas impresas siguen sonando, decisión 10), y ella se apaga apuntando a la que la absorbió.
--   7. Fotos: las que eligió la persona (decisión 9) quedan en el que queda; las que no, se guardan en el duplicado.
--   8. Lo elegido campo por campo (decisión 8): nombre, descripción, categoría (decisión 11), marca y proveedor, tejido,
--      patrón, temporada; el precio (decisión 6) y el costo (decisión 7: solo quien ve el dinero de compras, y solo en las
--      prendas cuyo costo aún no sale de sus compras: el promedio ponderado no se cambia a mano en ningún lado).
--   9. Lo que está en curso o es del producto se repunta (decisión 13); lo que se escribe una sola vez se queda en el
--      duplicado, que apunta al que quedó (`productos.fusionado_en_id`).
--  10. Una línea en Actividad.
--
-- LA PÉRDIDA QUE NO FUE. Una salida con un motivo que la base no conoce cuenta como pérdida a mano en Pérdidas y en el
-- diario (`fn_perdida_razon`). La salida de una fusión no es pérdida: la prenda sigue en la tienda, con otra ficha. Por
-- eso `fusion_producto` se suma a los motivos que no lo son (reemplazo anclado, re-ejecutable).
--
-- PARA PEGAR EN PRODUCCIÓN: una parte, funciones y un reemplazo anclado; sin políticas ni `alter table`. Re-ejecutable.
-- Necesita 20261112204000 y 20261112205000. Ensayo primero con `begin; … rollback;`.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- ---------- 1. La salida de una fusión no es pérdida ----------

do $$
declare
  v_def text := pg_get_functiondef('retail.fn_perdida_razon(text, text, integer)'::regprocedure);
  v_viejo constant text := '''cuarentena_devuelta_proveedor'', ''correccion_recepcion'') then null';
  v_nuevo constant text := '''cuarentena_devuelta_proveedor'', ''correccion_recepcion'', ''fusion_producto'') then null';
begin
  if position(v_nuevo in v_def) > 0 then
    return;
  end if;
  if (length(v_def) - length(replace(v_def, v_viejo, ''))) / length(v_viejo) <> 1 then
    raise exception '20261112210000: fn_perdida_razon cambió y el ancla no aparece una sola vez. Revisar antes de pegar.';
  end if;
  execute replace(v_def, v_viejo, v_nuevo);
end;
$$;

-- ---------- 2. Pasar unidades de la variante que se junta a la que queda ----------

create or replace function retail.fn_fusion_pasar_unidades(
  p_de uuid, p_a uuid, p_ubicacion uuid, p_sububicacion uuid, p_cantidad integer, p_empresa uuid, p_persona uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare
  v_nota text := 'Fusión de productos: pasa de ' || coalesce((select codigo from retail.variantes where id = p_de), '?')
                 || ' a ' || coalesce((select codigo from retail.variantes where id = p_a), '?');
  v_m uuid;
begin
  if p_cantidad <= 0 then
    return;
  end if;
  -- Salida de la que se junta y entrada en la que queda, en el mismo lugar y con el mismo dueño: el libro sigue
  -- cuadrando con el stock (principio 4) y no nace una pérdida ni una aparición (`fn_perdida_razon` conoce el motivo).
  insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, usuario_id, nota, empresa_id)
    values (p_de, p_ubicacion, p_sububicacion, 'salida', p_cantidad, 'fusion_producto', p_persona, v_nota, p_empresa)
    returning id into v_m;
  perform retail.fn_aplicar_movimiento(v_m);
  insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, usuario_id, nota, empresa_id)
    values (p_a, p_ubicacion, p_sububicacion, 'entrada', p_cantidad, 'fusion_producto', p_persona, v_nota, p_empresa)
    returning id into v_m;
  perform retail.fn_aplicar_movimiento(v_m);
end;
$$;

comment on function retail.fn_fusion_pasar_unidades(uuid, uuid, uuid, uuid, integer, uuid, uuid) is
  'ADR-0650: pasa unidades de una variante que se junta a la que queda (salida + entrada, motivo fusion_producto). Solo la llama fusionar_productos.';
revoke all on function retail.fn_fusion_pasar_unidades(uuid, uuid, uuid, uuid, integer, uuid, uuid) from public, anon, authenticated;

-- ---------- 3. La fusión ----------

create or replace function retail.fusionar_productos(
  p_queda uuid,
  p_duplicados uuid[],
  p_elecciones jsonb default '{}'::jsonb,
  p_versiones jsonb default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare
  v_persona uuid;
  v_el jsonb := coalesce(p_elecciones, '{}'::jsonb);
  v_plan jsonb;
  v_dups uuid[];
  v_ids uuid[];
  v_fusion uuid := gen_random_uuid();
  v_queda_antes jsonb;
  v_casa uuid := retail.fn_empresa_casa_id();
  v_ve_costo boolean := retail.fn_puede_ver_dinero_de_compras();
  v_fuente uuid;
  v_precio numeric;
  v_costo numeric;
  v_fotos uuid[];
  v_principal uuid;
  v_orden integer;
  v_resto integer;
  v_mudadas integer := 0;
  v_juntadas integer := 0;
  v_unidades integer := 0;
  v_codigos integer := 0;
  v_n integer;
  v_repuntes jsonb := '{}'::jsonb;
  v_fila retail.productos;
  r record;
  s record;
  d record;
begin
  if not retail.fn_puede_editar_catalogo() then
    raise exception 'No puedes fusionar productos: tu rol no edita el catálogo (módulo «Productos»). Pídele al líder que lo active.'
      using errcode = '42501';
  end if;
  v_persona := retail.fn_actor_persona_id(true);

  v_dups := array(
    select d0 from (select d0, min(o) as o from unnest(coalesce(p_duplicados, '{}'::uuid[])) with ordinality as x(d0, o)
                     where d0 is not null group by d0) y order by o);
  v_ids := array_prepend(p_queda, v_dups);

  -- Candado: todas las filas en el mismo orden (sin ciclos de espera entre dos fusiones cruzadas).
  perform 1 from retail.productos where id = any (v_ids) order by id for update;

  if p_versiones is not null then
    for r in select p.id, p.referencia, p.version from retail.productos p where p.id = any (v_ids) loop
      if p_versiones ? r.id::text and (p_versiones ->> r.id::text)::integer is distinct from r.version then
        raise exception '«%» cambió mientras lo mirabas. Vuelve a abrir la fusión para ver lo último.', r.referencia
          using errcode = 'PT409', hint = 'version_cambiada';
      end if;
    end loop;
  end if;

  v_plan := retail.fn_fusion_productos_plan(p_queda, v_dups, v_el);
  if not (v_plan ->> 'ok')::boolean then
    raise exception '%', v_plan #>> '{bloqueos,0,mensaje}'
      using errcode = 'P0001', hint = 'fusion_' || (v_plan #>> '{bloqueos,0,codigo}');
  end if;

  -- ---------- 4. La ficha de cada uno, antes de tocar nada ----------
  select jsonb_object_agg(p.id::text, jsonb_build_object(
           'producto', to_jsonb(p),
           'variantes', coalesce((select jsonb_agg(to_jsonb(v) order by v.created_at) from retail.variantes v where v.producto_id = p.id), '[]'::jsonb),
           'codigos_barras', coalesce((select jsonb_agg(to_jsonb(cb)) from retail.codigos_barras cb join retail.variantes v on v.id = cb.variante_id
                                        where v.producto_id = p.id), '[]'::jsonb),
           'fotos', coalesce((select jsonb_agg(to_jsonb(fo) order by fo.orden) from retail.producto_fotos fo where fo.producto_id = p.id), '[]'::jsonb),
           'stock', coalesce((select jsonb_agg(to_jsonb(st)) from retail.stock st join retail.variantes v on v.id = st.variante_id
                               where v.producto_id = p.id and (st.cantidad <> 0 or st.cantidad_apartada <> 0)), '[]'::jsonb),
           'stock_dueno', coalesce((select jsonb_agg(to_jsonb(sd)) from retail.stock_dueno sd join retail.variantes v on v.id = sd.variante_id
                                     where v.producto_id = p.id and (sd.cantidad <> 0 or sd.cantidad_apartada <> 0)), '[]'::jsonb)))
    into v_queda_antes
    from retail.productos p where p.id = any (v_ids);

  -- ---------- 5. Los duplicados quedan fusionados (sueltan su nombre) ----------
  update retail.productos
     set estado = 'descontinuado', fusionado_en_id = p_queda, fusionado_en = now()
   where id = any (v_dups);

  -- ---------- 6. Variantes ----------
  -- Primero las que se mudan: una del primer duplicado puede ser la que absorba a una del segundo.
  for r in select (e ->> 'variante_id')::uuid as id from jsonb_array_elements(v_plan -> 'variantes') e where e ->> 'trato' = 'muda' loop
    update retail.variantes set producto_id = p_queda where id = r.id;
    v_mudadas := v_mudadas + 1;
  end loop;

  for r in
    select (e ->> 'variante_id')::uuid as id, (e ->> 'con_variante_id')::uuid as con
      from jsonb_array_elements(v_plan -> 'variantes') e where e ->> 'trato' = 'junta'
  loop
    -- Las unidades, por sede y lugar; en una sede de dos empresas, cada dueño con lo suyo.
    for s in
      select st.ubicacion_id, st.sububicacion_id, st.cantidad from retail.stock st
       where st.variante_id = r.id and st.cantidad > 0
       order by st.ubicacion_id, st.sububicacion_id
       for update
    loop
      v_resto := s.cantidad;
      if retail.fn_sede_con_dos_empresas(s.ubicacion_id) then
        for d in
          select sd.empresa_id, sd.cantidad from retail.stock_dueno sd
           where sd.variante_id = r.id and sd.ubicacion_id = s.ubicacion_id
             and sd.sububicacion_id is not distinct from s.sububicacion_id and sd.cantidad > 0
           order by sd.empresa_id
        loop
          perform retail.fn_fusion_pasar_unidades(r.id, r.con, s.ubicacion_id, s.sububicacion_id, d.cantidad, d.empresa_id, v_persona);
          v_resto := v_resto - d.cantidad;
        end loop;
        if v_resto > 0 then
          perform retail.fn_fusion_pasar_unidades(r.id, r.con, s.ubicacion_id, s.sububicacion_id, v_resto, v_casa, v_persona);
        end if;
      else
        perform retail.fn_fusion_pasar_unidades(r.id, r.con, s.ubicacion_id, s.sububicacion_id, v_resto, null, v_persona);
      end if;
      v_unidades := v_unidades + s.cantidad;
    end loop;

    -- Las etiquetas impresas siguen sonando: el código de barras pasa a la variante que queda.
    update retail.codigos_barras set variante_id = r.con where variante_id = r.id;
    get diagnostics v_n = row_count;
    v_codigos := v_codigos + v_n;

    -- Insignias y campañas: la que queda suma las de la juntada (agregar, nunca quitar).
    insert into retail.variante_etiquetas (variante_id, etiqueta_id, created_at)
      select r.con, ve.etiqueta_id, ve.created_at from retail.variante_etiquetas ve where ve.variante_id = r.id
      on conflict do nothing;

    -- Quien esperaba esa talla en la web la sigue esperando, ahora en la variante que queda.
    update retail.esperas_web e set variante_id = r.con
     where e.variante_id = r.id and e.quitada_en is null
       and not exists (select 1 from retail.esperas_web o where o.cuenta_web_id = e.cuenta_web_id and o.variante_id = r.con
                         and o.ubicacion_id is not distinct from e.ubicacion_id and o.quitada_en is null);

    -- Si la juntada estaba a la venta y la que la absorbe no, la que queda vuelve a estarlo.
    update retail.variantes w set activo = true
     where w.id = r.con and not w.activo and exists (select 1 from retail.variantes j where j.id = r.id and j.activo);

    update retail.variantes set activo = false, fusionada_en_id = r.con, producto_id = p_queda where id = r.id;
    v_juntadas := v_juntadas + 1;
  end loop;

  -- ---------- 7. Fotos ----------
  if v_el ? 'fotos' then
    v_fotos := array(select (x)::uuid from jsonb_array_elements_text(v_el -> 'fotos') x);
  else
    v_fotos := array(select fo.id from retail.producto_fotos fo
                       join unnest(v_ids) with ordinality as o(id, n) on o.id = fo.producto_id
                      order by o.n, fo.es_principal desc, fo.orden, fo.created_at);
  end if;
  v_fotos := array(select f from unnest(v_fotos) with ordinality as x(f, o)
                    where f in (select fo.id from retail.producto_fotos fo where fo.producto_id = any (v_ids))
                    group by f order by min(o));
  -- La principal: la del que queda si sigue elegida; si no, la primera elegida.
  v_principal := coalesce(
    (select fo.id from retail.producto_fotos fo where fo.producto_id = p_queda and fo.es_principal and fo.id = any (v_fotos)),
    v_fotos[1]);
  -- Lo que no se eligió del que queda se guarda en el primer duplicado: nunca se borra una foto.
  update retail.producto_fotos set es_principal = false where producto_id = any (v_ids) and es_principal;
  update retail.producto_fotos set producto_id = v_dups[1]
   where producto_id = p_queda and not (id = any (v_fotos));
  v_orden := 0;
  for r in select f from unnest(v_fotos) with ordinality as x(f, o) order by o loop
    update retail.producto_fotos set producto_id = p_queda, orden = v_orden where id = r.f;
    v_orden := v_orden + 1;
  end loop;
  if v_principal is not null then
    update retail.producto_fotos set es_principal = true where id = v_principal;
  end if;

  -- ---------- 8. Lo elegido, campo por campo ----------
  select * into v_fila from retail.productos where id = p_queda;
  v_fuente := coalesce(nullif(v_el #>> '{campos,referencia}', '')::uuid, p_queda);
  if v_fuente <> p_queda and v_fuente = any (v_dups) then
    -- El nombre del duplicado ya está libre (paso 5); el disparador lo deja en su forma única.
    update retail.productos set referencia = (select referencia from retail.productos where id = v_fuente) where id = p_queda;
  end if;
  v_fuente := coalesce(nullif(v_el #>> '{campos,descripcion}', '')::uuid, p_queda);
  if v_fuente <> p_queda and v_fuente = any (v_dups) then
    update retail.productos set descripcion = (select descripcion from retail.productos where id = v_fuente) where id = p_queda;
  end if;
  v_fuente := coalesce(nullif(v_el #>> '{campos,temporada}', '')::uuid, p_queda);
  if v_fuente <> p_queda and v_fuente = any (v_dups) then
    update retail.productos set temporada = (select temporada from retail.productos where id = v_fuente) where id = p_queda;
  end if;
  update retail.productos p
     set categoria_id = (v_plan #>> '{final,categoria_id}')::uuid,
         marca_id = (v_plan #>> '{final,marca_id}')::uuid,
         proveedor_id = (v_plan #>> '{final,proveedor_id}')::uuid,
         tejido_id = (v_plan #>> '{final,tejido_id}')::uuid,
         patron_id = (v_plan #>> '{final,patron_id}')::uuid
   where p.id = p_queda
     and (p.categoria_id, p.marca_id, p.proveedor_id, p.tejido_id, p.patron_id) is distinct from
         ((v_plan #>> '{final,categoria_id}')::uuid, (v_plan #>> '{final,marca_id}')::uuid, (v_plan #>> '{final,proveedor_id}')::uuid,
          (v_plan #>> '{final,tejido_id}')::uuid, (v_plan #>> '{final,patron_id}')::uuid);

  -- El precio: uno para todas las tallas y colores a la venta del producto final.
  v_precio := nullif(v_el ->> 'precio', '')::numeric;
  if v_precio is not null then
    if v_precio <= 0 and not retail.fn_categoria_admite_precio_cero((select categoria_id from retail.productos where id = p_queda)) then
      raise exception 'El precio tiene que ser mayor que cero.' using errcode = 'P0001', hint = 'sin_precio';
    end if;
    update retail.variantes set precio = v_precio
     where producto_id = p_queda and activo and fusionada_en_id is null and precio is distinct from v_precio;
  end if;

  -- El costo: el de un producto de la fusión, en las prendas cuyo costo todavía no sale de sus compras.
  v_fuente := nullif(v_el ->> 'costo_de', '')::uuid;
  if v_ve_costo and v_fuente is not null and v_fuente = any (v_ids) then
    v_costo := (select (e ->> 'costo')::numeric from jsonb_array_elements(v_plan -> 'productos') e where (e ->> 'id')::uuid = v_fuente);
    if v_costo is not null then
      update retail.variantes v set costo = v_costo
       where v.producto_id = p_queda and v.activo and v.fusionada_en_id is null and v.costo is distinct from v_costo
         and not (v.id = any (retail.fn_variantes_con_costo_oficial(array[v.id])));
    end if;
  end if;

  -- ---------- 9. Lo que es del producto ----------
  -- En curso u operación viva: se repunta.
  update retail.compra_items set producto_id = p_queda where producto_id = any (v_dups);
  get diagnostics v_n = row_count; v_repuntes := v_repuntes || jsonb_build_object('compra_items', v_n);
  update retail.producciones set producto_id = p_queda where producto_id = any (v_dups);
  get diagnostics v_n = row_count; v_repuntes := v_repuntes || jsonb_build_object('producciones', v_n);
  update retail.pedidos_no_atendidos set producto_id = p_queda where producto_id = any (v_dups);
  get diagnostics v_n = row_count; v_repuntes := v_repuntes || jsonb_build_object('pedidos_no_atendidos', v_n);
  update retail.despacho_salidas set producto_id = p_queda where producto_id = any (v_dups);
  get diagnostics v_n = row_count; v_repuntes := v_repuntes || jsonb_build_object('despacho_salidas', v_n);
  update retail.producto_consumo_medido set producto_id = p_queda where producto_id = any (v_dups);
  get diagnostics v_n = row_count; v_repuntes := v_repuntes || jsonb_build_object('producto_consumo_medido', v_n);
  update retail.precio_propuestas set producto_id = p_queda where producto_id = any (v_dups);
  get diagnostics v_n = row_count; v_repuntes := v_repuntes || jsonb_build_object('precio_propuestas', v_n);
  -- Una orden de compra que ya llegó y se unió a su recepción no se cambia (`compra_unida_items`): se queda como llegó.
  update retail.orden_compra_items i set producto_id = p_queda
   where i.producto_id = any (v_dups)
     and not exists (select 1 from retail.ordenes_compra o join retail.compra_papel_llegadas l on l.papel_id = o.papel_id
                      where o.id = i.orden_compra_id);
  get diagnostics v_n = row_count; v_repuntes := v_repuntes || jsonb_build_object('orden_compra_items', v_n);

  -- Uno por cliente o por look: se repunta si el que queda no lo tiene ya.
  update retail.favoritos_web f set producto_id = p_queda
   where f.producto_id = any (v_dups)
     and not exists (select 1 from retail.favoritos_web o where o.cuenta_web_id = f.cuenta_web_id and o.producto_id = p_queda);
  update retail.vitrina_look_piezas f set producto_id = p_queda
   where f.producto_id = any (v_dups)
     and not exists (select 1 from retail.vitrina_look_piezas o where o.look_id = f.look_id and o.producto_id = p_queda);
  update retail.look_web_piezas f set producto_id = p_queda
   where f.producto_id = any (v_dups)
     and not exists (select 1 from retail.look_web_piezas o where o.look_id = f.look_id and o.producto_id = p_queda);

  -- Uno por producto (la ficha del Taller, la vitrina, el origen…): el del que queda manda; el del duplicado pasa solo si
  -- el que queda no tiene. Lo que no pasa se queda en el duplicado.
  for r in select x.id from unnest(v_dups) with ordinality as x(id, n) order by n loop
    update retail.producto_origen set producto_id = p_queda
     where producto_id = r.id and not exists (select 1 from retail.producto_origen where producto_id = p_queda);
    update retail.vitrina_productos set producto_id = p_queda
     where producto_id = r.id and not exists (select 1 from retail.vitrina_productos where producto_id = p_queda);
    update retail.producto_consumos set producto_id = p_queda
     where producto_id = r.id and not exists (select 1 from retail.producto_consumos where producto_id = p_queda);
    update retail.producto_taller set producto_id = p_queda
     where producto_id = r.id and not exists (select 1 from retail.producto_taller where producto_id = p_queda);
    update retail.producto_color_temporadas t set producto_id = p_queda
     where t.producto_id = r.id
       and not exists (select 1 from retail.producto_color_temporadas o where o.producto_id = p_queda and o.color_codigo = t.color_codigo);
    update retail.producto_procesos t set producto_id = p_queda
     where t.producto_id = r.id
       and not exists (select 1 from retail.producto_procesos o where o.producto_id = p_queda and o.proceso_clave = t.proceso_clave);
    update retail.producto_avios t set producto_id = p_queda
     where t.producto_id = r.id and t.archivado_at is null
       and not exists (select 1 from retail.producto_avios o where o.producto_id = p_queda and o.insumo_id = t.insumo_id
                         and coalesce(o.color_codigo, '') = coalesce(t.color_codigo, '') and o.archivado_at is null);
  end loop;
  -- Lo que se escribe una sola vez (decisiones de Frescura, tráfico web, correcciones de costo, el plan de compra, los
  -- precios por sede de la prenda, los pendientes ya resueltos de un envío) se queda en el duplicado, que apunta al que quedó.

  -- ---------- 10. El rastro y la Actividad ----------
  insert into retail.producto_fusiones (fusion_id, producto_queda_id, producto_fusionado_id, ficha_fusionada, ficha_queda_antes,
                                        elecciones, conteos, fusionada_por)
  select v_fusion, p_queda, x.id, v_queda_antes -> x.id::text, v_queda_antes -> p_queda::text, v_el,
         jsonb_build_object(
           'variantes_mudadas', (select count(*) from jsonb_array_elements(v_plan -> 'variantes') e
                                  where e ->> 'trato' = 'muda' and (e ->> 'producto_id')::uuid = x.id),
           'variantes_juntadas', (select count(*) from jsonb_array_elements(v_plan -> 'variantes') e
                                   where e ->> 'trato' = 'junta' and (e ->> 'producto_id')::uuid = x.id),
           'unidades_juntadas', (select coalesce(sum((e ->> 'stock')::integer), 0) from jsonb_array_elements(v_plan -> 'variantes') e
                                  where e ->> 'trato' = 'junta' and (e ->> 'producto_id')::uuid = x.id),
           'unidades_vendidas', (select (e ->> 'unidades_vendidas')::integer from jsonb_array_elements(v_plan -> 'productos') e
                                  where (e ->> 'id')::uuid = x.id)),
         v_persona
    from unnest(v_dups) as x(id);

  perform retail.fn_actividad_anotar(
    'productos', 'fusionar',
    'fusionó ' || cardinality(v_dups) || ' producto(s) duplicado(s) en «' || (select referencia from retail.productos where id = p_queda) || '»: '
      || v_mudadas || ' talla(s) y color(es) pasaron y ' || v_juntadas || ' se juntaron (' || v_unidades || ' prenda(s))',
    v_persona, null, null, null, 'productos', p_queda::text, now(),
    jsonb_build_object('fusion_id', v_fusion, 'duplicados', to_jsonb(v_dups), 'mudadas', v_mudadas, 'juntadas', v_juntadas,
                       'unidades_juntadas', v_unidades, 'codigos', v_codigos, 'fotos', coalesce(cardinality(v_fotos), 0),
                       'repuntes', v_repuntes),
    'vivo');

  return jsonb_build_object(
    'fusion_id', v_fusion, 'producto_id', p_queda,
    'version', (select version from retail.productos where id = p_queda),
    'mudadas', v_mudadas, 'juntadas', v_juntadas, 'unidades_juntadas', v_unidades, 'codigos', v_codigos,
    'fotos', coalesce(cardinality(v_fotos), 0), 'repuntes', v_repuntes);
end;
$$;

comment on function retail.fusionar_productos(uuid, uuid[], jsonb, jsonb) is
  'ADR-0650: fusiona uno o más productos duplicados en el que queda, sin perder ventas, fotos ni stock. Lo mismo que previsualizar_fusion_productos; frena con su frase (hint fusion_<codigo>) y con PT409 version_cambiada. No se deshace: el rastro queda en producto_fusiones. Quien edita el catálogo.';

revoke all on function retail.fusionar_productos(uuid, uuid[], jsonb, jsonb) from public, anon;
grant execute on function retail.fusionar_productos(uuid, uuid[], jsonb, jsonb) to authenticated;
