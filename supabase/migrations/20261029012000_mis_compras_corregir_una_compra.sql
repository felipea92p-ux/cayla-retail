-- ============================================================================
-- 20261029012000_mis_compras_corregir_una_compra.sql — CAYLA V2 · ADR-0561 (Mis compras: corregir una compra ya anotada)
-- La compradora corrige una compra que anotó mal, mientras Compras no la complete y su ronda siga abierta (Felipe, 2026-10-28, maqueta
-- docs/maquetas/mis-compras-corregir-2026-10/).
--
-- EL PROBLEMA PRIMERO. Una compra anotada desde el celular no se podía tocar: `fn_compra_papeles_inmutable` congela lo que anotó la
-- compradora (monto, lo pagado, su método) y las líneas de la orden no tenían una puerta de corrección. Si se equivocaba (un costo de 300 que era
-- 220, 5 unidades que eran 8), la única salida era pedírselo a Compras, que lo corrige al completar el papel. Y la plata que le muestra
-- «Tienes para comprar» salía de lo anotado, con el error adentro.
--
-- POR QUÉ LA PLATA VUELVE SOLA. Mientras el papel está «por completar», la plata de la compradora NO está en el libro de dinero: sale de restar
-- lo PAGADO de ese papel (`fn_mi_plata_tiene`, 20261023181000). Corregir el papel recalcula la plata sin escribir ningún movimiento. Al completar
-- Compras, el pago pasa al libro (que no se edita): por eso la corrección termina ahí.
--
-- QUÉ HACE
--   1. `compra_correcciones`: el rastro. Una fila por dato cambiado (cuál, antes y ahora), con quién y cuándo, agrupadas por `lote` (un
--      guardado). No se cambia ni se borra: es append-only.
--   2. `fn_compra_papeles_inmutable` deja cambiar el monto, lo pagado y su método SOLO dentro de `corregir_compra_rapida` (una marca local de la
--      transacción: `retail.compra_corrigiendo`). Proveedor, tipo de papel, fecha y quién lo anotó siguen sin cambiar nunca; la foto, solo se agrega.
--   3. `fn_compra_corregible(papel)`: por qué una compra ya no se puede corregir (completada, anulada, de una ronda cerrada, ya facturada, con una orden
--      anulada), o NULL si se puede. Una sola regla para la lectura y para el guardado.
--   4. `fn_compra_para_corregir(papel)`: lo que la hoja necesita para dibujarse: el papel, cada prenda con lo que ya salió en un envío, si cuadra
--      con el papel y si se puede corregir.
--   5. `corregir_compra_rapida(papel, lote, cambios)`: corrige unidades, costo y precio de venta de las prendas y, en una prenda de «Algo nuevo» (la que no se
--      eligió del catálogo), su nombre, categoría y marca. Las del catálogo no cambian ni nombre, ni categoría ni marca desde aquí: eso es de Catálogo.
--      Una prenda de la que todavía no salió nada puede cambiar de TIENDA: pasa a la orden de la otra tienda (se crea si no existía) y la orden que
--      se queda sin prendas se anula con su motivo. Todo o nada.
--      Además, `p_papel` deja corregir a mano «cuánto dice el papel», lo que pagó y cómo (cualquiera de los tres): lo que viene ahí manda sobre la cuenta
--      automática. Lo pagado nunca pasa del monto; con 0 pagado no hay método; con algo pagado, uno de Yape, efectivo o transferencia. Después recalcula el papel:
--      si ya cuadraba con las prendas, sigue cuadrando; lo pagado acompaña (pagó todo → paga el nuevo monto; pagó una parte → no pasa del nuevo
--      monto). Una prenda no baja de lo que ya salió en un envío. Dos toques con el mismo `lote` no corrigen dos veces.
--
-- DECISIONES DE FELIPE (2026-10-28, al aprobar la lista): el papel acompaña a las prendas solo si ya cuadraba; no se baja de lo que ya salió.
--
-- CANDADOS (el orden importa para que nunca se crucen): la ronda de la compradora (la MISMA clave `compra_ronda:` de abrir y cerrar la ronda, auditoría
-- 2026-10-27), después el de mandar (`compra_mandar:`), después el del papel (`compra_papel:`), y las filas del papel y de sus líneas `for update`.
-- Así una corrección y un envío o un cierre a la vez se ponen en fila, y Compras al completar espera la fila del papel.
--
-- LO QUE NO TOCA. Ninguna compra anotada antes, ningún movimiento de dinero, ninguna otra función. No depende de 20261027231000: toma el candado de la ronda
-- con su misma clave, sin llamar a su función.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). Una sola parte: una tabla nueva (vacía) con su RLS, funciones y permisos; ni políticas ni `drop trigger`
-- (ADR-0195). `create or replace` en todo: idempotente. Sin `select … into` dentro de textos entre comillas (ADR-0288).
-- ============================================================================
set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- ---------- 1. El rastro de lo que se corrigió ----------
create table if not exists retail.compra_correcciones (
  id uuid primary key default gen_random_uuid(),
  -- Un guardado de la hoja = un lote: todas sus filas comparten este identificador (y es lo que evita corregir dos veces con dos toques).
  lote uuid not null,
  papel_id uuid not null references retail.compra_papeles (id),
  -- La línea que cambió; vacío cuando el cambio es del papel (monto, pagado, método).
  orden_compra_item_id uuid references retail.orden_compra_items (id),
  campo text not null check (campo in ('cantidad', 'costo', 'precio_venta', 'nombre', 'categoria', 'marca', 'tienda', 'monto', 'pagado', 'medio_pago')),
  antes text,
  despues text,
  corregida_por uuid not null references public.personas (id),
  corregida_en timestamptz not null default now(),
  constraint compra_correcciones_cambia check (antes is distinct from despues)
);
comment on table retail.compra_correcciones is
  'ADR-0561: el rastro de las correcciones de una compra anotada desde el celular: qué dato cambió, cuánto valía antes y ahora, quién y cuándo. No se cambia ni se borra.';
create index if not exists compra_correcciones_papel on retail.compra_correcciones (papel_id, corregida_en);
create unique index if not exists compra_correcciones_lote_dato
  on retail.compra_correcciones (lote, papel_id, coalesce(orden_compra_item_id, '00000000-0000-0000-0000-000000000000'::uuid), campo);

alter table retail.compra_correcciones enable row level security;
revoke all on retail.compra_correcciones from anon, authenticated;

create or replace function retail.fn_compra_correcciones_inmutable()
returns trigger
language plpgsql
set search_path = retail, public, extensions
as $$
begin
  raise exception 'El rastro de una corrección no se cambia ni se borra.' using errcode = 'P0001';
end $$;
revoke all on function retail.fn_compra_correcciones_inmutable() from public, anon, authenticated;
create or replace trigger compra_correcciones_inmutable
  before update or delete on retail.compra_correcciones
  for each row execute function retail.fn_compra_correcciones_inmutable();

-- ---------- 2. Lo que anotó la compradora no cambia, salvo al corregir ----------
-- Se reescribe entera (no por reemplazos anclados) para que quede igual en una base que ya tiene la foto agregable (20261027210000) y en una que no.
create or replace function retail.fn_compra_papeles_inmutable()
returns trigger
language plpgsql
set search_path = retail, public, extensions
as $$
declare
  v_corrige boolean := coalesce(current_setting('retail.compra_corrigiendo', true), '') = 'si';
begin
  if tg_op = 'DELETE' then
    raise exception 'El papel de una compra no se borra.' using errcode = 'P0001';
  end if;
  if (new.id, new.persona_id, new.proveedor_id, new.tipo, new.fecha, new.huella, new.registrado_por, new.created_at)
     is distinct from (old.id, old.persona_id, old.proveedor_id, old.tipo, old.fecha, old.huella, old.registrado_por, old.created_at) then
    raise exception 'Lo que anotó la compradora no cambia: Compras lo corrige al completar el papel.' using errcode = 'P0001';
  end if;
  -- El monto, lo pagado y su método solo cambian cuando la compradora corrige su compra (`corregir_compra_rapida`).
  if not v_corrige and (new.monto, new.pagado, new.medio_pago) is distinct from (old.monto, old.pagado, old.medio_pago) then
    raise exception 'Lo que anotó la compradora no cambia: Compras lo corrige al completar el papel.' using errcode = 'P0001';
  end if;
  -- ADR-0538: la foto se puede AGREGAR (de «sin foto» a una ruta), nunca cambiar ni quitar.
  if old.foto_ruta is not null and new.foto_ruta is distinct from old.foto_ruta then
    raise exception 'La foto del papel ya está puesta: no se cambia.' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function retail.fn_compra_papeles_inmutable() from public, anon, authenticated;

-- ---------- 3. Por qué una compra ya no se puede corregir ----------
create or replace function retail.fn_compra_corregible(p_papel_id uuid)
returns text
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select case
    when p.id is null then 'no_existe'
    when p.estado = 'completado' then 'completada'
    when p.estado <> 'por_completar' then 'anulada'
    when p.ronda_id is null then 'sin_ronda'
    when exists (select 1 from retail.compra_rondas r where r.id = p.ronda_id and r.cerrada_en is not null) then 'ronda_cerrada'
    -- Una orden que se quedó sin prendas porque se movieron a otra tienda al corregir (su motivo lo dice) no bloquea: es parte de corregir.
    when exists (select 1 from retail.ordenes_compra o where o.papel_id = p.id and o.estado <> 'generada'
                    and coalesce(o.motivo_anulacion, '') not like 'Corrección de la compra:%') then 'orden_anulada'
    when exists (select 1 from retail.ordenes_compra o
                   join retail.orden_compra_items i on i.orden_compra_id = o.id
                   join retail.compra_items ci on ci.orden_compra_item_id = i.id
                   join retail.compras c on c.id = ci.compra_id
                  where o.papel_id = p.id and c.estado = 'vigente') then 'facturada'
    else null
  end
  from (select 1) uno left join retail.compra_papeles p on p.id = p_papel_id
$$;
revoke all on function retail.fn_compra_corregible(uuid) from public, anon, authenticated;

-- ---------- 4. Lo que la hoja de corregir necesita ----------
create or replace function retail.fn_compra_para_corregir(p_papel_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_actor uuid;
  v_papel retail.compra_papeles;
  v_motivo text;
  v_total numeric;
begin
  if retail.fn_ve_modulo('ordenes_compra') is not true then
    raise exception 'Corregir una compra necesita el módulo «Mi plata para compras» en tu rol' using errcode = '42501', hint = 'ordenes_compra_sin_modulo';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién corrige la compra' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  for v_papel in select * from retail.compra_papeles p where p.id = p_papel_id and p.persona_id = v_actor loop
    exit;
  end loop;
  if v_papel.id is null then
    raise exception 'No encontramos esa compra entre las tuyas' using errcode = 'P0001', hint = 'compra_corregir_ajena';
  end if;
  v_motivo := retail.fn_compra_corregible(v_papel.id);
  v_total := coalesce((select sum(i.subtotal) from retail.ordenes_compra o join retail.orden_compra_items i on i.orden_compra_id = o.id
                        where o.papel_id = v_papel.id), 0);
  return jsonb_build_object(
    'papel', jsonb_build_object(
      'id', v_papel.id, 'proveedor_id', v_papel.proveedor_id,
      'proveedor', (select pr.nombre from retail.proveedores pr where pr.id = v_papel.proveedor_id),
      'tipo', v_papel.tipo, 'monto', v_papel.monto, 'pagado', v_papel.pagado, 'medio_pago', v_papel.medio_pago, 'fecha', v_papel.fecha),
    'se_puede', v_motivo is null,
    'motivo', v_motivo,
    -- Para elegir categoría y marca de una prenda de «Algo nuevo»: las activas.
    'categorias', case when v_motivo is not null then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'nombre', c.nombre) order by c.nombre)
                                                                                    from retail.categorias c where c.activo), '[]'::jsonb) end,
    'tiendas', case when v_motivo is not null then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'nombre', u.nombre) order by u.nombre)
                                                                                 from retail.ubicaciones u where u.tipo in ('tienda', 'almacen') and u.activo), '[]'::jsonb) end,
    'marcas', case when v_motivo is not null then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'nombre', m.nombre) order by m.nombre)
                                                                                from retail.marcas m where m.activo), '[]'::jsonb) end,
    'cuadra', abs(v_papel.monto - v_total) < 0.005,
    'total_prendas', v_total,
    'lineas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', i.id, 'orden_id', o.id, 'posicion', i.posicion,
               'destino_id', o.ubicacion_destino_id, 'destino', u.nombre,
               'producto_id', i.producto_id, 'es_catalogo', i.producto_id is not null,
               'categoria_id', i.categoria_id, 'categoria', c.nombre, 'marca_id', i.marca_id, 'marca', m.nombre,
               'descripcion', coalesce(nullif(btrim(i.descripcion), ''), (select pp.referencia from retail.productos pp where pp.id = i.producto_id), c.nombre),
               'cantidad', i.cantidad, 'costo', i.precio_unitario, 'precio_venta', i.precio_venta_sugerido,
               'admite_precio_cero', coalesce(retail.fn_categoria_admite_precio_cero(i.categoria_id), false),
               'enviadas', (select coalesce(sum(di.cantidad), 0)::integer from retail.despacho_items di join retail.despachos d on d.id = di.despacho_id
                             where di.orden_compra_item_id = i.id and d.estado in ('en_camino', 'abierto', 'cerrado')))
             order by o.numero, i.posicion)
        from retail.ordenes_compra o
        join retail.orden_compra_items i on i.orden_compra_id = o.id
        join retail.categorias c on c.id = i.categoria_id
        join retail.marcas m on m.id = i.marca_id
        left join retail.ubicaciones u on u.id = o.ubicacion_destino_id
       where o.papel_id = v_papel.id), '[]'::jsonb));
end $$;
revoke all on function retail.fn_compra_para_corregir(uuid) from public, anon;
grant execute on function retail.fn_compra_para_corregir(uuid) to authenticated;

-- ---------- 4b. El rastro de una compra, para leerlo ----------
-- Lo ve quien la anotó (con «Mi plata para compras») y quien revisa compras (módulo `fondos`): cada corrección (un lote = un guardado) con quién,
-- cuándo y qué cambió, de la más nueva a la más vieja. No escribe nada.
create or replace function retail.fn_compra_correcciones(p_papel_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_yo uuid := retail.fn_persona_de_la_cuenta();
  v_duena uuid;
begin
  v_duena := (select p.persona_id from retail.compra_papeles p where p.id = p_papel_id);
  if v_duena is null then
    return '[]'::jsonb;
  end if;
  if not (retail.fn_ve_modulo('fondos') is true or (retail.fn_ve_modulo('ordenes_compra') is true and v_yo is not null and v_yo = v_duena)) then
    raise exception 'Ver las correcciones de una compra necesita ser quien la anotó o tener el módulo Revisar compras' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(l.fila order by l.cuando desc)
      from (
        select max(c.corregida_en) as cuando,
               jsonb_build_object(
                 'lote', c.lote,
                 'cuando', max(c.corregida_en),
                 'quien', (select nullif(btrim(concat_ws(' ', pe.nombres, pe.apellidos)), '') from public.personas pe where pe.id = min(c.corregida_por::text)::uuid),
                 'cambios', jsonb_agg(jsonb_build_object(
                              'campo', c.campo, 'antes', c.antes, 'despues', c.despues,
                              'prenda', (select coalesce(nullif(btrim(i.descripcion), ''), pp.referencia, ca.nombre)
                                           from retail.orden_compra_items i
                                           left join retail.productos pp on pp.id = i.producto_id
                                           left join retail.categorias ca on ca.id = i.categoria_id
                                          where i.id = c.orden_compra_item_id))
                            order by c.corregida_en, c.id)) as fila
          from retail.compra_correcciones c
         where c.papel_id = p_papel_id
         group by c.lote
      ) l), '[]'::jsonb);
end $$;
revoke all on function retail.fn_compra_correcciones(uuid) from public, anon;
grant execute on function retail.fn_compra_correcciones(uuid) to authenticated;

-- ---------- 5. Corregir la compra ----------
-- `p_cambios`: una lista de objetos `{ "item_id": uuid, "cantidad": 8, "costo": 22.00, "precio_venta": 39.90 }`. Solo cambia lo que viene en el objeto
-- (`precio_venta: null` lo quita). `p_papel`: `{ "monto": 264, "pagado": 264, "medio_pago": "yape" }`, cualquiera de los tres; manda sobre la cuenta
-- automática del papel. `p_lote`: lo genera la hoja al abrirse; el mismo lote dos veces devuelve lo que ya quedó.
create or replace function retail.corregir_compra_rapida(p_papel_id uuid, p_lote uuid, p_cambios jsonb, p_papel jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_actor uuid;
  v_papel retail.compra_papeles;
  v_motivo text;
  v_cambio jsonb;
  v_item retail.orden_compra_items;
  v_item_id uuid;
  v_enviadas integer;
  v_cantidad integer;
  v_costo numeric;
  v_venta numeric;
  v_nombre text;
  v_descripcion text;
  v_categoria uuid;
  v_marca uuid;
  v_nombre_cat text;
  v_nombre_marca text;
  v_destino_actual uuid;
  v_destino_nuevo uuid;
  v_orden_destino uuid;
  v_pos integer;
  v_cuantas integer;
  v_suma_antes numeric;
  v_suma_despues numeric;
  v_monto numeric;
  v_pagado numeric;
  v_medio text;
  v_pagado_old_todo boolean;
  v_n integer := 0;
  v_vistos uuid[] := '{}';
  v_ordenes uuid[] := '{}';
  v_o uuid;
  v_lineas jsonb;
  v_destino uuid;
  v_tiene numeric;
begin
  if retail.fn_ve_modulo('ordenes_compra') is not true then
    raise exception 'Corregir una compra necesita el módulo «Mi plata para compras» en tu rol' using errcode = '42501', hint = 'ordenes_compra_sin_modulo';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién corrige la compra' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  if p_papel_id is null or p_lote is null then
    raise exception 'Falta el identificador de la corrección: vuelve a abrir la compra' using errcode = 'P0001', hint = 'compra_corregir_sin_id';
  end if;
  if p_cambios is null or jsonb_typeof(p_cambios) <> 'array' then
    raise exception 'No hay nada que corregir' using errcode = 'P0001', hint = 'compra_corregir_sin_cambios';
  end if;
  if p_papel is not null and jsonb_typeof(p_papel) <> 'object' then
    raise exception 'El papel y el pago no se entienden' using errcode = 'P0001', hint = 'compra_corregir_papel';
  end if;
  if jsonb_array_length(p_cambios) = 0 and (p_papel is null or p_papel = '{}'::jsonb) then
    raise exception 'No hay nada que corregir' using errcode = 'P0001', hint = 'compra_corregir_sin_cambios';
  end if;
  if jsonb_array_length(p_cambios) > 100 then
    raise exception 'Una compra lleva hasta 100 prendas' using errcode = 'P0001', hint = 'orden_compra_muchas_lineas';
  end if;

  -- Candados, siempre en este orden: la ronda (la clave de abrir y cerrarla), mandar a la tienda, el papel.
  perform pg_advisory_xact_lock(hashtextextended('compra_ronda:' || v_actor::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('compra_mandar:' || v_actor::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('compra_papel:' || p_papel_id::text, 0));

  for v_papel in select * from retail.compra_papeles p where p.id = p_papel_id and p.persona_id = v_actor for update loop
    exit;
  end loop;
  if v_papel.id is null then
    raise exception 'No encontramos esa compra entre las tuyas' using errcode = 'P0001', hint = 'compra_corregir_ajena';
  end if;

  -- El mismo guardado otra vez (doble clic, o un reintento tras un corte): devuelve lo que ya quedó, sin corregir de nuevo.
  if exists (select 1 from retail.compra_correcciones c where c.lote = p_lote and c.papel_id = p_papel_id) then
    return jsonb_build_object('papel_id', p_papel_id, 'lote', p_lote, 'ya_estaba', true, 'monto', v_papel.monto, 'pagado', v_papel.pagado,
                              'tiene', retail.fn_mi_plata_tiene(v_actor));
  end if;
  if exists (select 1 from retail.compra_correcciones c where c.lote = p_lote) then
    raise exception 'Esa corrección ya se guardó en otra compra: vuelve a abrir la compra' using errcode = 'P0001', hint = 'compra_corregir_otro_lote';
  end if;

  v_motivo := retail.fn_compra_corregible(p_papel_id);
  if v_motivo is not null then
    raise exception '%', case v_motivo
      when 'completada' then 'Compras ya completó esta compra: ya no se corrige desde aquí. Avísale a Compras.'
      when 'ronda_cerrada' then 'Esta compra es de una ronda que ya cerraste: ya no se corrige.'
      when 'facturada' then 'Compras ya registró la factura de esta compra: ya no se corrige desde aquí. Avísale a Compras.'
      when 'orden_anulada' then 'Una de las órdenes de esta compra está anulada: avísale a Compras.'
      else 'Esta compra ya no se puede corregir.' end
      using errcode = 'P0001', hint = 'compra_corregir_' || v_motivo;
  end if;

  v_suma_antes := coalesce((select sum(i.subtotal) from retail.ordenes_compra o join retail.orden_compra_items i on i.orden_compra_id = o.id
                             where o.papel_id = p_papel_id), 0);

  -- Las prendas, una por una: todo se valida y se escribe dentro de esta transacción; si algo falla, no queda nada.
  for v_cambio in select value from jsonb_array_elements(p_cambios) loop
    if jsonb_typeof(v_cambio) <> 'object' then
      raise exception 'Una de las prendas no se entiende' using errcode = 'P0001', hint = 'compra_corregir_cambio';
    end if;
    begin
      v_item_id := (v_cambio ->> 'item_id')::uuid;
    exception when others then
      raise exception 'Una de las prendas no se entiende' using errcode = 'P0001', hint = 'compra_corregir_cambio';
    end;
    if v_item_id = any (v_vistos) then
      raise exception 'Una prenda viene dos veces en la corrección' using errcode = 'P0001', hint = 'compra_corregir_repetida';
    end if;
    v_vistos := v_vistos || v_item_id;
    v_item := null;
    for v_item in select i.* from retail.orden_compra_items i join retail.ordenes_compra o on o.id = i.orden_compra_id
                   where i.id = v_item_id and o.papel_id = p_papel_id for update of i loop
      exit;
    end loop;
    if v_item.id is null then
      raise exception 'Esa prenda no es de esta compra' using errcode = 'P0001', hint = 'compra_corregir_prenda_ajena';
    end if;
    v_nombre := coalesce(nullif(btrim(v_item.descripcion), ''), 'la prenda');

    -- El nombre, la categoría y la marca: solo de una prenda de «Algo nuevo». Las del catálogo son de Catálogo ▸ Productos.
    begin
      v_descripcion := case when v_cambio ? 'descripcion' then nullif(btrim(coalesce(v_cambio ->> 'descripcion', '')), '') else v_item.descripcion end;
      v_categoria := case when v_cambio ? 'categoria_id' then nullif(v_cambio ->> 'categoria_id', '')::uuid else v_item.categoria_id end;
      v_marca := case when v_cambio ? 'marca_id' then nullif(v_cambio ->> 'marca_id', '')::uuid else v_item.marca_id end;
    exception when others then
      raise exception 'El nombre, la categoría o la marca de «%» no se entiende', v_nombre using errcode = 'P0001', hint = 'compra_corregir_cambio';
    end;
    if (v_descripcion, v_categoria, v_marca) is distinct from (v_item.descripcion, v_item.categoria_id, v_item.marca_id) then
      if v_item.producto_id is not null then
        raise exception 'El nombre, la categoría y la marca de «%» son del catálogo: se cambian en Catálogo ▸ Productos', v_nombre
          using errcode = 'P0001', hint = 'compra_corregir_del_catalogo';
      end if;
      if v_descripcion is null then
        raise exception 'Escribe el nombre de la prenda' using errcode = 'P0001', hint = 'compra_corregir_nombre';
      end if;
      if length(v_descripcion) > 200 then
        raise exception 'El nombre de «%» es muy largo: hasta 200 letras', v_nombre using errcode = 'P0001', hint = 'orden_compra_descripcion';
      end if;
      if v_categoria is distinct from v_item.categoria_id
         and not exists (select 1 from retail.categorias c where c.id = v_categoria and c.activo) then
        raise exception 'Elige una categoría activa para «%»', v_nombre using errcode = 'P0001', hint = 'orden_compra_categoria';
      end if;
      if v_marca is distinct from v_item.marca_id
         and not exists (select 1 from retail.marcas m where m.id = v_marca and m.activo) then
        raise exception 'Elige una marca activa para «%»', v_nombre using errcode = 'P0001', hint = 'orden_compra_marca';
      end if;
    end if;

    -- La tienda: solo si de esta prenda todavía no salió nada (lo que ya salió va a la tienda a la que salió).
    v_destino_actual := (select o.ubicacion_destino_id from retail.ordenes_compra o where o.id = v_item.orden_compra_id);
    begin
      v_destino_nuevo := case when v_cambio ? 'destino_id' then nullif(v_cambio ->> 'destino_id', '')::uuid else v_destino_actual end;
    exception when others then
      raise exception 'La tienda de «%» no se entiende', v_nombre using errcode = 'P0001', hint = 'compra_corregir_cambio';
    end;
    if v_destino_nuevo is distinct from v_destino_actual then
      if v_destino_nuevo is null or not exists (select 1 from retail.ubicaciones u where u.id = v_destino_nuevo and u.tipo in ('tienda', 'almacen') and u.activo) then
        raise exception 'Elige a qué tienda va «%»', v_nombre using errcode = 'P0001', hint = 'compra_rapida_destino';
      end if;
    end if;

    begin
      v_cantidad := case when v_cambio ? 'cantidad' then (v_cambio ->> 'cantidad')::numeric::integer else v_item.cantidad end;
      if v_cambio ? 'cantidad' and (v_cambio ->> 'cantidad')::numeric <> trunc((v_cambio ->> 'cantidad')::numeric) then
        raise exception 'cantidad con decimales';
      end if;
      v_costo := case when v_cambio ? 'costo' then (v_cambio ->> 'costo')::numeric else v_item.precio_unitario end;
      v_venta := case when v_cambio ? 'precio_venta' then nullif(btrim(coalesce(v_cambio ->> 'precio_venta', '')), '')::numeric else v_item.precio_venta_sugerido end;
    exception when others then
      raise exception 'La cantidad o un precio de «%» no se entiende: escribe solo números, la cantidad sin decimales', v_nombre
        using errcode = 'P0001', hint = 'compra_corregir_numero';
    end;
    if v_cantidad is null or v_costo is null then
      raise exception 'La cantidad o un precio de «%» no se entiende: escribe solo números, la cantidad sin decimales', v_nombre
        using errcode = 'P0001', hint = 'compra_corregir_numero';
    end if;

    -- La misma regla de cantidad y precio de las órdenes (antes de escribir: la tabla las rechazaría sin decir cuál prenda).
    if v_cantidad < 1 or v_cantidad > 99999 then
      raise exception 'La cantidad de «%» va de 1 a 99 999 unidades, sin decimales', v_nombre using errcode = 'P0001', hint = 'orden_compra_cantidad';
    end if;
    if v_costo < 0 or v_costo > 99999.99 or v_costo <> round(v_costo, 2) then
      raise exception 'El precio de «%» va de S/ 0 a S/ 99 999.99, con hasta dos decimales', v_nombre using errcode = 'P0001', hint = 'orden_compra_precio';
    end if;
    v_costo := round(v_costo, 2);

    -- Una prenda no baja de lo que ya salió en un envío (en camino, abierto o cerrado).
    v_enviadas := (select coalesce(sum(di.cantidad), 0)::integer from retail.despacho_items di join retail.despachos d on d.id = di.despacho_id
                    where di.orden_compra_item_id = v_item.id and d.estado in ('en_camino', 'abierto', 'cerrado'));
    if v_cantidad < v_enviadas then
      raise exception '«%» ya salió en un envío con % unidades: no puede quedar en menos', v_nombre, v_enviadas
        using errcode = 'P0001', hint = 'compra_corregir_menos_de_lo_enviado';
    end if;
    if v_destino_nuevo is distinct from v_destino_actual and v_enviadas > 0 then
      raise exception 'De «%» ya salió algo en un envío: no se cambia de tienda', v_nombre using errcode = 'P0001', hint = 'compra_corregir_tienda_con_envio';
    end if;
    -- El precio de venta, con la misma regla de las órdenes (de 0 a 5 000, y el 0 solo donde el catálogo lo admite).
    perform retail.fn_orden_compra_validar_sugerido(v_n + 1, jsonb_build_object('precio_venta_sugerido', v_venta), v_categoria);
    v_venta := round(v_venta, 2);

    if (v_cantidad, v_costo, v_venta, v_descripcion, v_categoria, v_marca, v_destino_nuevo)
       is not distinct from (v_item.cantidad, v_item.precio_unitario, v_item.precio_venta_sugerido, v_item.descripcion, v_item.categoria_id, v_item.marca_id, v_destino_actual) then
      continue;
    end if;
    v_n := v_n + 1;

    if v_cantidad <> v_item.cantidad then
      insert into retail.compra_correcciones (lote, papel_id, orden_compra_item_id, campo, antes, despues, corregida_por)
      values (p_lote, p_papel_id, v_item.id, 'cantidad', v_item.cantidad::text, v_cantidad::text, v_actor);
    end if;
    if v_costo <> v_item.precio_unitario then
      insert into retail.compra_correcciones (lote, papel_id, orden_compra_item_id, campo, antes, despues, corregida_por)
      values (p_lote, p_papel_id, v_item.id, 'costo', v_item.precio_unitario::text, v_costo::text, v_actor);
    end if;
    if v_venta is distinct from v_item.precio_venta_sugerido then
      insert into retail.compra_correcciones (lote, papel_id, orden_compra_item_id, campo, antes, despues, corregida_por)
      values (p_lote, p_papel_id, v_item.id, 'precio_venta', v_item.precio_venta_sugerido::text, v_venta::text, v_actor);
    end if;

    if v_descripcion is distinct from v_item.descripcion then
      insert into retail.compra_correcciones (lote, papel_id, orden_compra_item_id, campo, antes, despues, corregida_por)
      values (p_lote, p_papel_id, v_item.id, 'nombre', v_item.descripcion, v_descripcion, v_actor);
    end if;
    if v_categoria is distinct from v_item.categoria_id then
      v_nombre_cat := (select c.nombre from retail.categorias c where c.id = v_item.categoria_id);
      insert into retail.compra_correcciones (lote, papel_id, orden_compra_item_id, campo, antes, despues, corregida_por)
      values (p_lote, p_papel_id, v_item.id, 'categoria', v_nombre_cat, (select c.nombre from retail.categorias c where c.id = v_categoria), v_actor);
    end if;
    if v_marca is distinct from v_item.marca_id then
      v_nombre_marca := (select m.nombre from retail.marcas m where m.id = v_item.marca_id);
      insert into retail.compra_correcciones (lote, papel_id, orden_compra_item_id, campo, antes, despues, corregida_por)
      values (p_lote, p_papel_id, v_item.id, 'marca', v_nombre_marca, (select m.nombre from retail.marcas m where m.id = v_marca), v_actor);
    end if;

    update retail.orden_compra_items
       set cantidad = v_cantidad, precio_unitario = v_costo, precio_venta_sugerido = v_venta,
           descripcion = v_descripcion, categoria_id = v_categoria, marca_id = v_marca
     where id = v_item.id;
    if not (v_item.orden_compra_id = any (v_ordenes)) then
      v_ordenes := v_ordenes || v_item.orden_compra_id;
    end if;

    -- Cambiar de tienda: la prenda pasa a la orden de la otra tienda de ESTA compra (la misma que habría creado al anotarla; se crea, o se
    -- reabre si una corrección la había anulado por quedar sin prendas).
    if v_destino_nuevo is distinct from v_destino_actual then
      v_orden_destino := md5(p_papel_id::text || ':' || v_destino_nuevo::text)::uuid;
      if not exists (select 1 from retail.ordenes_compra o where o.id = v_orden_destino) then
        insert into retail.ordenes_compra (id, proveedor_id, ubicacion_destino_id, creada_por, papel_id)
        values (v_orden_destino, v_papel.proveedor_id, v_destino_nuevo, v_actor, p_papel_id);
      else
        update retail.ordenes_compra
           set estado = 'generada', anulada_por = null, anulada_en = null, motivo_anulacion = null
         where id = v_orden_destino and estado = 'anulada' and papel_id = p_papel_id;
      end if;
      v_pos := coalesce((select max(i.posicion) from retail.orden_compra_items i where i.orden_compra_id = v_orden_destino), 0) + 1;
      insert into retail.compra_correcciones (lote, papel_id, orden_compra_item_id, campo, antes, despues, corregida_por)
      values (p_lote, p_papel_id, v_item.id, 'tienda', (select u.nombre from retail.ubicaciones u where u.id = v_destino_actual),
              (select u.nombre from retail.ubicaciones u where u.id = v_destino_nuevo), v_actor);
      update retail.orden_compra_items set orden_compra_id = v_orden_destino, posicion = v_pos where id = v_item.id;
      if not (v_orden_destino = any (v_ordenes)) then
        v_ordenes := v_ordenes || v_orden_destino;
      end if;
    end if;
  end loop;

  -- Cada orden tocada vuelve a pasar por la regla de líneas de las órdenes (con sus categorías y marcas de antes, que no cambian aquí).
  foreach v_o in array v_ordenes loop
    v_destino := (select o.ubicacion_destino_id from retail.ordenes_compra o where o.id = v_o);
    v_cuantas := (select count(*) from retail.orden_compra_items i where i.orden_compra_id = v_o);
    if v_cuantas = 0 then
      -- Sin prendas, la orden no sirve: se anula con su motivo (nada se borra). Su motivo es lo que la deja fuera del bloqueo de «orden anulada».
      update retail.ordenes_compra
         set estado = 'anulada', anulada_por = v_actor, anulada_en = now(),
             motivo_anulacion = 'Corrección de la compra: se movieron todas sus prendas a otra tienda',
             version = version + 1, actualizada_por = v_actor, actualizada_en = now()
       where id = v_o;
      continue;
    end if;
    v_lineas := (select jsonb_agg(jsonb_build_object('categoria_id', i.categoria_id, 'marca_id', i.marca_id, 'descripcion', i.descripcion,
                                                     'cantidad', i.cantidad, 'precio_unitario', i.precio_unitario, 'descuento', i.descuento)
                                  order by i.posicion)
                   from retail.orden_compra_items i where i.orden_compra_id = v_o);
    perform retail.fn_orden_compra_validar(v_papel.proveedor_id, v_destino, null, null, v_lineas,
      jsonb_build_object('proveedor', jsonb_build_object('id', v_papel.proveedor_id), 'destino', jsonb_build_object('id', v_destino), 'lineas', v_lineas));
    update retail.ordenes_compra set version = version + 1, actualizada_por = v_actor, actualizada_en = now() where id = v_o;
  end loop;

  -- El papel: si ya cuadraba con las prendas, sigue cuadrando; lo pagado acompaña (todo pagado → todo el monto nuevo; una parte → no pasa del monto).
  v_suma_despues := coalesce((select sum(i.subtotal) from retail.ordenes_compra o join retail.orden_compra_items i on i.orden_compra_id = o.id
                               where o.papel_id = p_papel_id), 0);
  v_monto := case when abs(v_papel.monto - v_suma_antes) < 0.005 then v_suma_despues else v_papel.monto end;
  v_pagado_old_todo := abs(v_papel.pagado - v_papel.monto) < 0.005;
  -- Lo escrito a mano manda sobre la cuenta automática.
  begin
    if p_papel ? 'monto' then
      v_monto := (p_papel ->> 'monto')::numeric;
    end if;
  exception when others then
    raise exception 'Lo que dice el papel no se entiende: escribe solo el monto' using errcode = 'P0001', hint = 'monto_invalido';
  end;
  if v_monto is null or v_monto = 'NaN'::numeric or v_monto <= 0 or v_monto > 1000000 or v_monto <> round(v_monto, 2) then
    raise exception 'El papel tiene que decir más de cero y hasta S/ 1 000 000, con hasta dos decimales' using errcode = 'P0001', hint = 'monto_invalido';
  end if;
  v_monto := round(v_monto, 2);
  v_pagado := case when v_pagado_old_todo then v_monto else least(v_papel.pagado, v_monto) end;
  begin
    if p_papel ? 'pagado' then
      v_pagado := (p_papel ->> 'pagado')::numeric;
    end if;
  exception when others then
    raise exception 'Lo que pagaste no se entiende: escribe solo el monto' using errcode = 'P0001', hint = 'compra_rapida_pagado';
  end;
  if v_pagado is null or v_pagado = 'NaN'::numeric or v_pagado < 0 or v_pagado > v_monto or v_pagado <> round(v_pagado, 2) then
    raise exception 'Lo que pagaste va de S/ 0 a lo que dice el papel, con hasta dos decimales' using errcode = 'P0001', hint = 'compra_rapida_pagado';
  end if;
  v_pagado := round(v_pagado, 2);
  v_medio := case when v_pagado = 0 then null else v_papel.medio_pago end;
  if p_papel ? 'medio_pago' then
    v_medio := case when v_pagado = 0 then null else nullif(lower(btrim(coalesce(p_papel ->> 'medio_pago', ''))), '') end;
  end if;
  if v_pagado > 0 and (v_medio is null or v_medio not in ('yape', 'efectivo', 'transferencia')) then
    raise exception 'Elige cómo pagaste: Yape, efectivo o transferencia' using errcode = 'P0001', hint = 'compra_rapida_medio';
  end if;
  if (v_monto, v_pagado, v_medio) is distinct from (v_papel.monto, v_papel.pagado, v_papel.medio_pago) then
    perform set_config('retail.compra_corrigiendo', 'si', true);
    update retail.compra_papeles set monto = v_monto, pagado = v_pagado, medio_pago = v_medio where id = p_papel_id;
    perform set_config('retail.compra_corrigiendo', '', true);
    if v_monto <> v_papel.monto then
      insert into retail.compra_correcciones (lote, papel_id, campo, antes, despues, corregida_por)
      values (p_lote, p_papel_id, 'monto', v_papel.monto::text, v_monto::text, v_actor);
    end if;
    if v_pagado <> v_papel.pagado then
      insert into retail.compra_correcciones (lote, papel_id, campo, antes, despues, corregida_por)
      values (p_lote, p_papel_id, 'pagado', v_papel.pagado::text, v_pagado::text, v_actor);
    end if;
    if v_medio is distinct from v_papel.medio_pago then
      insert into retail.compra_correcciones (lote, papel_id, campo, antes, despues, corregida_por)
      values (p_lote, p_papel_id, 'medio_pago', v_papel.medio_pago, v_medio, v_actor);
    end if;
  end if;

  if v_n = 0 and (v_monto, v_pagado, v_medio) is not distinct from (v_papel.monto, v_papel.pagado, v_papel.medio_pago) then
    raise exception 'No cambiaste nada' using errcode = 'P0001', hint = 'compra_corregir_sin_cambios';
  end if;

  -- Actividad (ADR-0207), sin montos. Si falla, la corrección igual queda.
  begin
    perform retail.fn_actividad_anotar('ordenes_compra', 'compra_corregida',
      'corrigió una compra a ' || (select pr.nombre from retail.proveedores pr where pr.id = v_papel.proveedor_id) || ': '
        || case when v_n = 0 then 'el papel y el pago' else retail.fn_actividad_cuantas(v_n, 'prenda', 'prendas') end,
      v_actor, retail.fn_actividad_terminal_ahora(), null, null, 'compra_papeles', p_papel_id::text, now(),
      jsonb_build_object('papel_id', p_papel_id, 'lote', p_lote, 'prendas', v_n), 'vivo');
  exception when others then
    raise warning 'actividad: no se anotó la corrección de la compra %: %', p_papel_id, sqlerrm;
  end;

  v_tiene := retail.fn_mi_plata_tiene(v_actor);
  return jsonb_build_object('papel_id', p_papel_id, 'lote', p_lote, 'ya_estaba', false, 'prendas', v_n, 'monto', v_monto, 'pagado', v_pagado, 'tiene', v_tiene);
end $$;
comment on function retail.corregir_compra_rapida(uuid, uuid, jsonb, jsonb) is
  'ADR-0561: corrige unidades, costo y precio de venta de las prendas de una compra anotada, mientras Compras no la complete y su ronda siga abierta. Recalcula el papel y lo pagado; deja el rastro.';
revoke all on function retail.corregir_compra_rapida(uuid, uuid, jsonb, jsonb) from public, anon;
grant execute on function retail.corregir_compra_rapida(uuid, uuid, jsonb, jsonb) to authenticated;

-- Firma sin combo con la cuenta de una persona (desde una terminal, el combo), como anotar la compra.
insert into retail.acciones_sin_responsable (clave, descripcion) values
  ('compra_corregir', 'Corregir una compra que anotaste desde el celular (con la cuenta de una persona firma ella, desde una terminal se elige quién)')
on conflict (clave) do update set descripcion = excluded.descripcion;
