-- ============================================================================
-- 20261115153000_fusionar_productos_precios_por_sede.sql — Fusionar productos: cada sede conserva su precio (ADR-0650, act. 2026-11-15)
-- ============================================================================
--
-- EL PROBLEMA PRIMERO. Al fusionar dos fichas, el precio general (`variantes.precio`) se elige y se aplica a todas las tallas. Pero el
-- precio PROPIO de una sede —el de la prenda en esa tienda (`precios_sede_prenda`) y el de una talla en esa tienda
-- (`precios_sede_variante`)— no viajaba: el de la ficha repetida se quedaba atrás (decisión 8) y la tienda pasaba a cobrar otra cosa sin
-- que nadie lo dijera. Ejemplo: la repetida cobraba S/ 169 en Trujillo; tras fusionar, Trujillo cobraba el precio de la ficha que queda.
--
-- LA REGLA (Felipe 2026-11-15: «que por defecto cada sede quede con su precio, y se pueda elegir juntarlos»)
--   · `p_elecciones.precio_modo = 'por_sede'` (DE FÁBRICA, también si no viene): cada sede conserva el precio propio que tenía.
--       - Una talla y color que se MUDA o se JUNTA conserva, en cada sede, el precio propio que tenía (el de la que queda, si lo tenía;
--         si no, el de la repetida).
--       - Si dos fichas tenían precios propios DISTINTOS en la misma sede, gana la que queda, salvo que la persona haya elegido otra
--         para esa sede: `p_elecciones.precios_sede = {"<sede>": "<producto>"}`.
--       - Se escribe como excepción de la talla en esa sede (`precios_sede_variante`), solo donde el precio de hoy ya no sería el de antes.
--   · `p_elecciones.precio_modo = 'uno'`: un solo precio para todas las sedes. Los precios propios de sede de la ficha que queda se
--     ARCHIVAN (nunca se borran) y todas cobran el precio general del producto final.
--
-- QUÉ NO CAMBIA. Con una sola sede de precio propio o sin ninguna, nada nuevo se escribe. La elección del precio general (decisión 6) y
-- el costo (decisión 7) siguen igual. Ninguna función que cobra se toca: todas leen `fn_precio_en_sede`.
--
-- DESCARTÉ
--   · Escribir el precio de la prenda en la sede (`precios_sede_prenda`) de la ficha que queda: su disparador
--     (`precios_sede_prenda_limpia_excepciones`) archivaría las excepciones por talla que la persona ya tenía. Por talla no tiene ese efecto.
--   · Copiar el precio de TODA sede a TODA talla: congela la grilla y las tiendas dejan de seguirla (el error que ADR-0370 corrigió). Solo
--     se escribe lo que se sale de lo que el producto final ya cobraría.
--   · Frenar la fusión por un conflicto de precio: el conflicto se resuelve mirando, con la ficha que queda por defecto.
--
-- CÓMO SE PEGA EN PRODUCCIÓN: UNA parte (funciones nuevas, `previsualizar_fusion_productos` reescrita y dos reemplazos anclados en
-- `fusionar_productos`); sin `alter table`, sin políticas, sin `drop trigger` (ADR-0195). Idempotente. Los reemplazos anclados fallan si la
-- función viva ya no es la esperada. Sin `select … into` dentro de textos entre comillas (ADR-0288). Necesita 20261112210000.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- ---------- 1. Los precios PROPIOS de cada talla en cada sede ----------
-- «Propio» = lo que se cobra en esa sede es distinto del precio general de la talla (capa de la prenda o de la talla en la sede).
-- Solo tiendas activas; el obsequio (precio 0) no cuenta.

create or replace function retail.fn_fusion_precios_propios(p_productos uuid[])
returns table (producto_id uuid, variante_id uuid, ubicacion_id uuid, precio numeric)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select v.producto_id, v.id, x.ubicacion_id, x.precio
    from retail.fn_precios_en_sedes(
           array(select w.id from retail.variantes w where w.producto_id = any (p_productos) and w.activo and w.fusionada_en_id is null),
           array(select u.id from retail.ubicaciones u where u.activo and u.tipo = 'tienda')
         ) x
    join retail.variantes v on v.id = x.variante_id
   where x.precio > 0 and x.precio is distinct from v.precio
$$;

comment on function retail.fn_fusion_precios_propios(uuid[]) is
  'ADR-0650 (act. 2026-11-15): las tallas activas cuyo precio en una tienda es distinto del general. Solo la usan la fusión y su previsualización.';
revoke all on function retail.fn_fusion_precios_propios(uuid[]) from public, anon, authenticated;

-- ---------- 2. Lo que ve la persona: en qué sedes hay que decidir ----------
-- Una sede sale en la lista cuando una ficha repetida cobra, con precio propio, algo distinto de lo que cobraría la que queda.
-- `conflicto` = hay dos precios propios distintos y la persona puede elegir; si no, el precio propio simplemente viaja.

create or replace function retail.fn_fusion_precios_sede_resumen(p_queda uuid, p_duplicados uuid[])
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_dups uuid[] := array(
    select d0 from (select d0, min(o) as o from unnest(coalesce(p_duplicados, '{}'::uuid[])) with ordinality as x(d0, o)
                     where d0 is not null and d0 <> p_queda group by d0) y order by o);
  v_ids uuid[] := array_prepend(p_queda, v_dups);
  v_salida jsonb := '[]'::jsonb;
  v_prods jsonb;
  v_q_precio numeric;
  v_q_propio boolean;
  v_dif boolean;
  v_distintos integer;
  v_def uuid;
  r record;
  e jsonb;
begin
  for r in
    select u.id, u.nombre
      from retail.ubicaciones u
     where u.id in (select p.ubicacion_id from retail.fn_fusion_precios_propios(v_ids) p)
     order by u.nombre
  loop
    select jsonb_agg(jsonb_build_object('id', o.id, 'queda', o.id = p_queda,
                                        'precio', coalesce(pp.precio, g.precio), 'propio', pp.precio is not null) order by o.n)
      into v_prods
      from unnest(v_ids) with ordinality as o(id, n)
      left join (select p.producto_id, mode() within group (order by p.precio) as precio
                   from retail.fn_fusion_precios_propios(v_ids) p where p.ubicacion_id = r.id group by p.producto_id) pp on pp.producto_id = o.id
      left join (select w.producto_id, mode() within group (order by w.precio) as precio
                   from retail.variantes w where w.producto_id = any (v_ids) and w.activo and w.fusionada_en_id is null
                  group by w.producto_id) g on g.producto_id = o.id;

    v_q_precio := (v_prods -> 0 ->> 'precio')::numeric;
    v_q_propio := (v_prods -> 0 ->> 'propio')::boolean;
    v_dif := false;
    v_def := null;
    for e in select x from jsonb_array_elements(v_prods) x loop
      if (e ->> 'propio')::boolean then
        if v_def is null then
          v_def := (e ->> 'id')::uuid;
        end if;
        if not (e ->> 'queda')::boolean and (e ->> 'precio')::numeric is distinct from v_q_precio then
          v_dif := true;
        end if;
      end if;
    end loop;
    if not v_dif then
      continue;
    end if;
    v_distintos := (select count(distinct (x ->> 'precio')::numeric) from jsonb_array_elements(v_prods) x where (x ->> 'propio')::boolean);
    v_salida := v_salida || jsonb_build_object(
      'ubicacion_id', r.id, 'nombre', r.nombre,
      'conflicto', v_distintos > 1,
      'por_defecto', case when v_q_propio then p_queda else v_def end,
      'productos', v_prods);
  end loop;
  return v_salida;
end;
$$;

comment on function retail.fn_fusion_precios_sede_resumen(uuid, uuid[]) is
  'ADR-0650 (act. 2026-11-15): las sedes donde una ficha repetida cobra un precio propio distinto del de la que queda, con su elección por defecto. Solo la lee previsualizar_fusion_productos.';
revoke all on function retail.fn_fusion_precios_sede_resumen(uuid, uuid[]) from public, anon, authenticated;

-- ---------- 3. La previsualización suma esa lista y el campo «precio_sede» ----------

create or replace function retail.previsualizar_fusion_productos(p_queda uuid, p_duplicados uuid[], p_elecciones jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_plan jsonb;
  v_sedes jsonb;
begin
  if not retail.fn_puede_editar_catalogo() then
    raise exception 'No puedes fusionar productos: tu rol no edita el catálogo (módulo «Productos»). Pídele al líder que lo active.'
      using errcode = '42501';
  end if;
  v_plan := retail.fn_fusion_productos_plan(p_queda, p_duplicados, p_elecciones);
  if not coalesce((v_plan ->> 'ok')::boolean, false) then
    return v_plan;
  end if;
  -- Una terminal no cambia el precio de la prenda (20261026224000): puede fusionar, pero cada talla conserva el suyo. La pantalla lo dice.
  if retail.fn_es_terminal() then
    v_plan := v_plan || jsonb_build_object('terminal_sin_unificar_precio', true);
  end if;
  v_sedes := retail.fn_fusion_precios_sede_resumen(p_queda, p_duplicados);
  if jsonb_array_length(v_sedes) = 0 then
    return v_plan;
  end if;
  return v_plan || jsonb_build_object(
    'precios_sede', v_sedes,
    'diferencias', coalesce(v_plan -> 'diferencias', '[]'::jsonb) || '["precio_sede"]'::jsonb);
end;
$$;

-- ---------- 4. Antes de mover nada: lo que cada talla cobraba en cada sede ----------

create or replace function retail.fn_fusion_precios_sede_capturar(p_queda uuid, p_duplicados uuid[], p_plan jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
begin
  create temp table if not exists fusion_precios_sede_antes (
    producto_id uuid, variante_id uuid, destino_id uuid, ubicacion_id uuid, precio numeric, orden integer
  ) on commit drop;
  truncate pg_temp.fusion_precios_sede_antes;
  -- `destino_id`: la talla en la que termina (la misma si se muda; la que la absorbe si se junta). `orden`: la que queda, primero.
  insert into pg_temp.fusion_precios_sede_antes
    select p.producto_id, p.variante_id,
           coalesce((select (e ->> 'con_variante_id')::uuid from jsonb_array_elements(p_plan -> 'variantes') e
                      where e ->> 'trato' = 'junta' and (e ->> 'variante_id')::uuid = p.variante_id), p.variante_id),
           p.ubicacion_id, p.precio,
           array_position(array_prepend(p_queda, p_duplicados), p.producto_id)
      from retail.fn_fusion_precios_propios(array_prepend(p_queda, p_duplicados)) p;
end;
$$;

comment on function retail.fn_fusion_precios_sede_capturar(uuid, uuid[], jsonb) is
  'ADR-0650 (act. 2026-11-15): guarda, antes de mover nada, el precio propio de cada talla en cada sede. Solo la llama fusionar_productos.';
revoke all on function retail.fn_fusion_precios_sede_capturar(uuid, uuid[], jsonb) from public, anon, authenticated;

-- ---------- 5. Después de mover todo: cada sede cobra lo que cobraba ----------

create or replace function retail.fn_fusion_precios_sede_aplicar(
  p_queda uuid, p_modo text, p_elecciones jsonb, p_persona uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare
  v_n integer;
  v_archivados integer := 0;
  v_fijados integer := 0;
  v_hoy numeric;
  v_sede text;
  r record;
begin
  if p_modo = 'uno' then
    -- Un solo precio: los de sede del producto final se archivan (nunca se borran) y todas cobran el general.
    update retail.precios_sede_variante pv
       set archivado_en = now(), archivado_por = p_persona,
           archivado_motivo = 'Fusión de productos: un solo precio para todas las sedes'
     where pv.archivado_en is null and pv.variante_id in (select w.id from retail.variantes w where w.producto_id = p_queda);
    get diagnostics v_n = row_count;
    v_archivados := v_n;
    update retail.precios_sede_prenda pp
       set archivado_en = now(), archivado_por = p_persona,
           archivado_motivo = 'Fusión de productos: un solo precio para todas las sedes'
     where pp.archivado_en is null and pp.producto_id = p_queda;
    get diagnostics v_n = row_count;
    v_archivados := v_archivados + v_n;
    return jsonb_build_object('modo', 'uno', 'archivados', v_archivados, 'fijados', 0);
  end if;

  -- Cada sede conserva su precio: por talla y sede, el de la sede elegida; si no, el de la que queda; si no, el de la primera repetida.
  for r in
    select distinct on (a.destino_id, a.ubicacion_id) a.destino_id, a.ubicacion_id, a.precio
      from pg_temp.fusion_precios_sede_antes a
     order by a.destino_id, a.ubicacion_id,
              (a.producto_id::text = nullif(p_elecciones #>> array['precios_sede', a.ubicacion_id::text], '')) desc,
              a.orden
  loop
    v_hoy := retail.fn_precio_en_sede(r.destino_id, r.ubicacion_id);
    if v_hoy is distinct from r.precio then
      v_sede := (select u.nombre from retail.ubicaciones u where u.id = r.ubicacion_id);
      if r.precio > 5000 then
        raise exception 'El precio de S/ % en % pasa del tope de S/ 5 000 por talla y sede. Corrígelo antes de fusionar.', r.precio, v_sede
          using errcode = 'P0001', hint = 'precio_sede_tope';
      end if;
      update retail.precios_sede_variante
         set archivado_en = now(), archivado_por = p_persona,
             archivado_motivo = 'Fusión de productos: otro precio propio para esta sede'
       where variante_id = r.destino_id and ubicacion_id = r.ubicacion_id and archivado_en is null;
      insert into retail.precios_sede_variante (variante_id, ubicacion_id, precio, motivo, creado_por)
        values (r.destino_id, r.ubicacion_id, r.precio, 'Fusión de productos: conserva el precio de ' || v_sede, p_persona);
      v_fijados := v_fijados + 1;
    end if;
  end loop;
  return jsonb_build_object('modo', 'por_sede', 'archivados', 0, 'fijados', v_fijados);
end;
$$;

comment on function retail.fn_fusion_precios_sede_aplicar(uuid, text, jsonb, uuid) is
  'ADR-0650 (act. 2026-11-15): deja a cada sede con su precio propio (por_sede) o con uno solo (uno). Solo la llama fusionar_productos, después de mover las tallas.';
revoke all on function retail.fn_fusion_precios_sede_aplicar(uuid, text, jsonb, uuid) from public, anon, authenticated;

-- ---------- 6. fusionar_productos: dos reemplazos anclados (re-ejecutables) ----------

create or replace function pg_temp.reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_nuevo in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- (a) Antes de tocar nada: validar el modo y guardar lo que cada talla cobraba en cada sede.
select pg_temp.reemplazar(
  'retail.fusionar_productos(uuid, uuid[], jsonb, jsonb)',
  $a$  -- ---------- 5. Los duplicados quedan fusionados (sueltan su nombre) ----------$a$,
  $a$  -- ---------- 4b. Los precios propios de cada sede, antes de mover nada (20261115153000) ----------
  if coalesce(nullif(v_el ->> 'precio_modo', ''), 'por_sede') not in ('por_sede', 'uno') then
    raise exception 'El modo de precio de la fusión no es válido.' using errcode = 'P0001', hint = 'precio_modo';
  end if;
  -- «Un solo precio» cambia el precio de otras tiendas: no es de una terminal (20261026224000).
  if retail.fn_es_terminal() and v_el ->> 'precio_modo' = 'uno' then
    raise exception 'Desde una terminal no se puede juntar el precio de todas las sedes en uno: cada sede conserva el suyo.'
      using errcode = '42501', hint = 'terminal_precio_de_la_prenda';
  end if;
  perform retail.fn_fusion_precios_sede_capturar(p_queda, v_dups, v_plan);

  -- ---------- 5. Los duplicados quedan fusionados (sueltan su nombre) ----------$a$,
  1);

-- (b) Con el precio general ya puesto y las tallas ya movidas: cada sede cobra lo que cobraba (o un solo precio).
select pg_temp.reemplazar(
  'retail.fusionar_productos(uuid, uuid[], jsonb, jsonb)',
  $a$  -- El costo: el de un producto de la fusión, en las prendas cuyo costo todavía no sale de sus compras.$a$,
  $a$  -- Los precios propios de cada sede (20261115153000): por defecto cada sede conserva el suyo; «uno» los junta en el general.
  v_repuntes := v_repuntes || jsonb_build_object('precios_sede', retail.fn_fusion_precios_sede_aplicar(
    p_queda, coalesce(nullif(v_el ->> 'precio_modo', ''), 'por_sede'), v_el, v_persona));

  -- El costo: el de un producto de la fusión, en las prendas cuyo costo todavía no sale de sus compras.$a$,
  1);

-- (c) Una terminal no cambia `variantes.precio`: el paso del precio general no se hace; cada talla conserva el suyo (el disparador
-- `variantes_terminal_no_cambia_precio` frenaba toda la fusión).
select pg_temp.reemplazar(
  'retail.fusionar_productos(uuid, uuid[], jsonb, jsonb)',
  $a$  v_precio := nullif(v_el ->> 'precio', '')::numeric;$a$,
  $a$  v_precio := nullif(v_el ->> 'precio', '')::numeric;
  -- Una terminal no cambia variantes.precio (20261026224000, 20261115153000): cada talla conserva el suyo.
  if retail.fn_es_terminal() then
    v_precio := null;
  end if;$a$,
  1);

-- ---------- 7. Verificación: si algo no quedó, la migración falla ----------
do $$
begin
  if position('fn_fusion_precios_sede_aplicar' in pg_get_functiondef('retail.fusionar_productos(uuid, uuid[], jsonb, jsonb)'::regprocedure)) = 0
     or position('fn_fusion_precios_sede_capturar' in pg_get_functiondef('retail.fusionar_productos(uuid, uuid[], jsonb, jsonb)'::regprocedure)) = 0
     or position('fn_fusion_precios_sede_resumen' in pg_get_functiondef('retail.previsualizar_fusion_productos(uuid, uuid[], jsonb)'::regprocedure)) = 0 then
    raise exception '20261115153000: fusionar_productos o previsualizar_fusion_productos no quedaron con los precios por sede.';
  end if;
end;
$$;
