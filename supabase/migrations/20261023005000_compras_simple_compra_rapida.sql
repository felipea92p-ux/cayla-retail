-- ============================================================================
-- 20261023005000_compras_simple_compra_rapida.sql — CAYLA V2 · ADR-0480 (Compras simple), actividad 3
-- «Compré ropa»: la compradora registra desde el celular a quién le compró, qué prendas (de sus habituales), cuántas, a qué costo, a qué
-- precio de venta y a qué tienda va cada una, y al final el papel (qué le dieron, la foto y el monto).
--
-- EL PROBLEMA PRIMERO. Hasta hoy, comprar pedía una orden de compra en el escritorio, después la factura con su serie y número, y la
-- tienda tenía que adivinar las prendas al recibir. En la calle eso no pasa: la compradora tiene el celular, el proveedor y la boleta.
-- Felipe aprobó (maqueta 2026-10-22) que ella anote proveedor y prendas eligiendo de lo que ya se le compró a ese proveedor, y que
-- el papel se complete después en «Revisar compras» (serie y número los copia Compras).
--
-- QUÉ CREA
--   1. `compra_papeles`: el «papel rápido» de una compra (de quién, qué tipo de papel, la foto, el monto que pagó). Nace «por completar»;
--      la actividad 7 lo vuelve comprobante. No toca la plata en los libros: Felipe (2026-10-22) decidió que en su celular la plata baja al
--      instante (`fn_mi_plata_compras` resta lo por completar) y que los libros la mueven recién al completar el papel, cuando alguien de
--      Compras lo revisó. RLS sin políticas: solo lo tocan sus funciones.
--   2. Las prendas de la compra son ÓRDENES DE COMPRA, una por tienda de destino (la tienda de cada prenda es el destino de su orden): así
--      el envío a cada tienda (actividad 5), Recibir (actividad 6) y todo lo que ya entiende una orden siguen igual. `ordenes_compra.papel_id`
--      dice de qué papel salió cada una. `orden_compra_items.producto_id` (opcional) dice qué prenda del catálogo es, cuando se eligió de
--      los habituales: al recibir, la tienda la cuenta sin buscarla.
--   3. `registrar_compra_rapida`: todo en una transacción (el papel y sus órdenes). Se valida cada línea con `fn_orden_compra_validar`, la
--      misma regla de las órdenes del escritorio. Repetir el mismo envío (doble clic, corte) devuelve lo que ya quedó; con otros datos, lo
--      dice (`compra_rapida_otros_datos`).
--   4. Lecturas para el celular: `fn_proveedores_para_comprar` (cada proveedor activo con qué categorías vende y cuántas compras tiene) y
--      `fn_habituales_proveedor` (lo que se le compra a uno: primero lo comprado aquí, contado y con lo de la vez pasada; después las prendas
--      del catálogo que tienen ese proveedor —en producción, 323 de 438 el 2026-10-22—, para que sirva desde el primer día).
--   5. `fn_mi_plata_compras` resta del «tienes para comprar» lo que compró con papeles por completar, y lista sus compras.
--   6. Una prenda que ya está en una orden de compra es historia: «Eliminar producto» la frena (`fn_producto_historia`, renglón 26,
--      reemplazo anclado: el texto es el mismo en producción, md5 ff63b8ab… el 2026-10-22).
--
-- PERMISOS. Todo pide el módulo «Mi plata para compras» (`ordenes_compra`, el mismo que crear una orden). La compra es de quien firma
-- (`fn_actor_persona_id(true)`: con su cuenta, ella; desde una terminal, el responsable del combo).
--
-- DESCARTÉ
--   · Mover la plata del fondo al guardar (como adelanto al proveedor o a una cuenta «compras por completar»): Felipe eligió que los libros
--     solo vean lo que Compras revisó.
--   · Una columna de tienda en cada línea de orden: partir en una orden por tienda deja intacto todo lo que ya trabaja por orden.
--   · Usar `registrar_comprobante_orden` desde el celular: pide serie y número, que la compradora no copia (decisión de Felipe).
--   · Una tabla de «productos por proveedor»: los habituales salen de las órdenes y del catálogo, sin otra fuente que se desincronice.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe, después de 20261022235000). Una sola parte, sin políticas ni `drop trigger`: una tabla
-- nueva y dos columnas nuevas, nulas, en `ordenes_compra` y `orden_compra_items` (0 filas en producción el 2026-10-22), con
-- `lock_timeout`; funciones, y un reemplazo ANCLADO en `fn_producto_historia` (si su texto en producción no es el esperado, aborta sin
-- cambiar nada). Idempotente. Sin `select … into` dentro de textos entre comillas (ADR-0288).
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- ---------- 1. El papel rápido ----------
create table if not exists retail.compra_papeles (
  id uuid primary key,
  -- La compradora: con su plata se pagó.
  persona_id uuid not null references public.personas (id),
  proveedor_id uuid not null references retail.proveedores (id),
  tipo text not null check (tipo in ('factura', 'boleta', 'nota_venta', 'sin_comprobante')),
  monto numeric(12, 2) not null check (monto > 0 and monto <= 1000000),
  -- La foto del papel: una ruta del depósito `retail-gastos-viaje`, carpeta `papeles/`. Sin papel, puede no haber foto.
  foto_ruta text check (foto_ruta is null or (foto_ruta like 'papeles/%' and char_length(foto_ruta) <= 300)),
  fecha date not null,
  estado text not null default 'por_completar' check (estado in ('por_completar', 'completado', 'anulado')),
  -- Lo que se mandó (para reconocer un reintento del mismo envío).
  huella text not null,
  registrado_por uuid not null references public.personas (id),
  created_at timestamptz not null default now(),
  constraint compra_papeles_foto_si_hay_papel check (tipo = 'sin_comprobante' or foto_ruta is not null)
);
comment on table retail.compra_papeles is
  'ADR-0480: el papel de una compra anotada desde el celular (tipo, foto, monto). Por completar hasta que Compras copia su serie y número.';

create index if not exists compra_papeles_persona on retail.compra_papeles (persona_id, created_at desc);
create index if not exists compra_papeles_por_completar on retail.compra_papeles (created_at) where estado = 'por_completar';

alter table retail.compra_papeles enable row level security;
revoke all on retail.compra_papeles from anon, authenticated;

-- Un papel no se borra, y lo que anotó la compradora no cambia: solo su estado (lo cambian las actividades 5 y 7).
create or replace function retail.fn_compra_papeles_inmutable()
returns trigger
language plpgsql
set search_path = retail, public, extensions
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'El papel de una compra no se borra.' using errcode = 'P0001';
  end if;
  if (new.id, new.persona_id, new.proveedor_id, new.tipo, new.monto, new.foto_ruta, new.fecha, new.huella, new.registrado_por, new.created_at)
     is distinct from (old.id, old.persona_id, old.proveedor_id, old.tipo, old.monto, old.foto_ruta, old.fecha, old.huella, old.registrado_por, old.created_at) then
    raise exception 'Lo que anotó la compradora no cambia: Compras lo corrige al completar el papel.' using errcode = 'P0001';
  end if;
  return new;
end $$;

create or replace trigger compra_papeles_inmutable
  before update or delete on retail.compra_papeles
  for each row execute function retail.fn_compra_papeles_inmutable();

-- ---------- 2. Las órdenes saben de qué papel salieron, y sus líneas qué prenda del catálogo son ----------
alter table retail.ordenes_compra add column if not exists papel_id uuid references retail.compra_papeles (id);
comment on column retail.ordenes_compra.papel_id is
  'ADR-0480: el papel de la compra anotada desde el celular de la que salió esta orden (una orden por tienda de destino).';
create index if not exists ordenes_compra_papel on retail.ordenes_compra (papel_id) where papel_id is not null;

alter table retail.orden_compra_items add column if not exists producto_id uuid references retail.productos (id);
comment on column retail.orden_compra_items.producto_id is
  'ADR-0480: la prenda del catálogo, cuando se eligió de los habituales del proveedor (al recibir se cuenta sin buscarla).';

-- ---------- 3. Registrar la compra ----------
create or replace function retail.registrar_compra_rapida(
  p_id uuid,
  p_proveedor_id uuid,
  p_tipo text,
  p_monto numeric,
  p_foto_ruta text,
  p_lineas jsonb
) returns jsonb
language plpgsql security definer set search_path = retail, public, extensions as $$
declare
  v_actor uuid;
  v_monto numeric := round(p_monto, 2);
  v_foto text := nullif(btrim(coalesce(p_foto_ruta, '')), '');
  v_tipo text := lower(btrim(coalesce(p_tipo, '')));
  v_huella text;
  v_existente record;
  v_linea jsonb;
  v_pos integer := 0;
  v_producto record;
  v_destino uuid;
  v_lineas_dest jsonb;
  v_orden uuid;
  v_numero integer;
  v_ordenes jsonb := '[]'::jsonb;
  v_unidades bigint;
  -- Las prendas ya validadas, cada una con su posición y su tienda.
  v_validas jsonb := '[]'::jsonb;
begin
  if retail.fn_ve_modulo('ordenes_compra') is not true then
    raise exception 'Registrar una compra necesita el módulo «Mi plata para compras» en tu rol' using errcode = '42501', hint = 'ordenes_compra_sin_modulo';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta compra' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  if p_id is null then
    raise exception 'Falta el identificador de la compra: vuelve a abrirla' using errcode = 'P0001', hint = 'compra_rapida_sin_id';
  end if;
  v_huella := md5(jsonb_build_array(p_proveedor_id, v_tipo, p_monto::text, v_foto, p_lineas)::text);

  -- Doble clic o reintento tras un corte: lo mismo devuelve lo que ya quedó; otra cosa con el mismo identificador, lo dice.
  perform pg_advisory_xact_lock(hashtextextended('compra_papel:' || p_id::text, 0));
  for v_existente in select c.id, c.huella, c.registrado_por from retail.compra_papeles c where c.id = p_id loop
    if v_existente.huella <> v_huella or v_existente.registrado_por <> v_actor then
      raise exception 'Esa compra ya se guardó con otros datos: recarga la pantalla' using errcode = 'P0001', hint = 'compra_rapida_otros_datos';
    end if;
    return jsonb_build_object('papel_id', p_id, 'ordenes', coalesce((
      select jsonb_agg(jsonb_build_object('id', o.id, 'numero', o.numero, 'destino_id', o.ubicacion_destino_id) order by o.numero)
        from retail.ordenes_compra o where o.papel_id = p_id), '[]'::jsonb));
  end loop;

  -- El papel.
  if p_proveedor_id is null or not exists (select 1 from retail.proveedores pr where pr.id = p_proveedor_id and pr.activo) then
    raise exception 'Elige a quién le compraste' using errcode = 'P0001', hint = 'orden_compra_proveedor';
  end if;
  if v_tipo not in ('factura', 'boleta', 'nota_venta', 'sin_comprobante') then
    raise exception 'Elige qué papel te dieron: factura, boleta, nota de venta o ninguno' using errcode = 'P0001', hint = 'compra_rapida_tipo';
  end if;
  if v_monto is null or v_monto = 'NaN'::numeric or v_monto <= 0 or v_monto > 1000000 then
    raise exception 'Escribe cuánto pagaste: un monto mayor que cero' using errcode = 'P0001', hint = 'monto_invalido';
  end if;
  if v_foto is not null and (v_foto not like 'papeles/%' or char_length(v_foto) > 300) then
    raise exception 'La foto del papel no se subió bien: vuelve a tomarla' using errcode = 'P0001', hint = 'compra_rapida_foto';
  end if;
  if v_tipo <> 'sin_comprobante' and v_foto is null then
    raise exception 'Tómale una foto al papel que te dieron' using errcode = 'P0001', hint = 'compra_rapida_sin_foto';
  end if;

  -- Las prendas: cada una con su tienda. La que se eligió del catálogo trae su categoría y su marca de ahí (no las que mande la pantalla).
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'Agrega al menos una prenda' using errcode = 'P0001', hint = 'orden_compra_sin_lineas';
  end if;
  if jsonb_array_length(p_lineas) > 100 then
    raise exception 'Una compra lleva hasta 100 prendas: anótala en dos' using errcode = 'P0001', hint = 'orden_compra_muchas_lineas';
  end if;
  for v_linea in select value from jsonb_array_elements(p_lineas) loop
    v_pos := v_pos + 1;
    if jsonb_typeof(v_linea) <> 'object' then
      raise exception 'La prenda % no se entiende', v_pos using errcode = 'P0001', hint = 'orden_compra_linea';
    end if;
    begin
      v_destino := nullif(v_linea ->> 'destino_id', '')::uuid;
    exception when others then
      raise exception 'La tienda de la prenda % no se entiende', v_pos using errcode = 'P0001', hint = 'compra_rapida_destino';
    end;
    if v_destino is null or not exists (select 1 from retail.ubicaciones u where u.id = v_destino and u.tipo in ('tienda', 'almacen') and u.activo) then
      raise exception 'Elige a qué tienda va la prenda %', v_pos using errcode = 'P0001', hint = 'compra_rapida_destino';
    end if;
    if nullif(v_linea ->> 'producto_id', '') is not null then
      begin
        for v_producto in select p.id, p.categoria_id, p.marca_id, p.referencia from retail.productos p
                           where p.id = (v_linea ->> 'producto_id')::uuid and p.estado_alta <> 'rechazado' loop
          exit;
        end loop;
      exception when others then
        raise exception 'La prenda % no se entiende', v_pos using errcode = 'P0001', hint = 'orden_compra_linea';
      end;
      if v_producto.id is null then
        raise exception 'La prenda % ya no está en el catálogo: elígela de nuevo', v_pos using errcode = 'P0001', hint = 'compra_rapida_producto';
      end if;
      v_linea := v_linea || jsonb_build_object('categoria_id', v_producto.categoria_id, 'marca_id', v_producto.marca_id,
                                                'descripcion', coalesce(nullif(btrim(v_linea ->> 'descripcion'), ''), v_producto.referencia));
      v_producto := null;
    end if;
    v_validas := v_validas || jsonb_build_object('posicion', v_pos, 'destino_id', v_destino, 'linea', v_linea);
  end loop;

  -- Todo bien: el papel y una orden por tienda, con la misma regla de líneas de las órdenes del escritorio.
  insert into retail.compra_papeles (id, persona_id, proveedor_id, tipo, monto, foto_ruta, fecha, huella, registrado_por)
  values (p_id, v_actor, p_proveedor_id, v_tipo, v_monto, v_foto, retail.fn_hoy_lima(), v_huella, v_actor);

  for v_destino in select distinct (v ->> 'destino_id')::uuid from jsonb_array_elements(v_validas) v order by 1 loop
    v_lineas_dest := (select jsonb_agg(jsonb_build_object(
                         'categoria_id', v -> 'linea' ->> 'categoria_id', 'marca_id', v -> 'linea' ->> 'marca_id',
                         'descripcion', v -> 'linea' ->> 'descripcion', 'cantidad', v -> 'linea' ->> 'cantidad',
                         'precio_unitario', v -> 'linea' ->> 'costo', 'precio_venta_sugerido', v -> 'linea' ->> 'precio_venta')
                         order by (v ->> 'posicion')::integer)
                        from jsonb_array_elements(v_validas) v where (v ->> 'destino_id')::uuid = v_destino);
    perform retail.fn_orden_compra_validar(p_proveedor_id, v_destino, null, null, v_lineas_dest, null);
    -- El id de cada orden sale del de la compra y su tienda: el mismo envío arma siempre las mismas órdenes.
    v_orden := md5(p_id::text || ':' || v_destino::text)::uuid;
    insert into retail.ordenes_compra (id, proveedor_id, ubicacion_destino_id, creada_por, papel_id)
    values (v_orden, p_proveedor_id, v_destino, v_actor, p_id)
    returning numero into v_numero;
    insert into retail.orden_compra_items (orden_compra_id, posicion, categoria_id, marca_id, descripcion, cantidad, precio_unitario, descuento,
                                           precio_venta_sugerido, producto_id)
    select v_orden, row_number() over (order by (v ->> 'posicion')::integer), (v -> 'linea' ->> 'categoria_id')::uuid,
           (v -> 'linea' ->> 'marca_id')::uuid, nullif(btrim(coalesce(v -> 'linea' ->> 'descripcion', '')), ''),
           (v -> 'linea' ->> 'cantidad')::numeric::integer, (v -> 'linea' ->> 'costo')::numeric, 0,
           nullif(btrim(coalesce(v -> 'linea' ->> 'precio_venta', '')), '')::numeric, nullif(v -> 'linea' ->> 'producto_id', '')::uuid
      from jsonb_array_elements(v_validas) v where (v ->> 'destino_id')::uuid = v_destino;
    v_ordenes := v_ordenes || jsonb_build_object('id', v_orden, 'numero', v_numero, 'destino_id', v_destino);
  end loop;

  -- Actividad (ADR-0207), sin montos. Si falla, la compra igual queda.
  begin
    v_unidades := (select coalesce(sum((v -> 'linea' ->> 'cantidad')::numeric), 0) from jsonb_array_elements(v_validas) v);
    perform retail.fn_actividad_anotar('ordenes_compra', 'compra_registrada',
      'anotó una compra a ' || (select pr.nombre from retail.proveedores pr where pr.id = p_proveedor_id) || ': '
        || retail.fn_actividad_cuantas(v_unidades, 'prenda', 'prendas'),
      v_actor, retail.fn_actividad_terminal_ahora(), null, null, 'compra_papeles', p_id::text, now(),
      jsonb_build_object('papel_id', p_id, 'tipo', v_tipo, 'ordenes', jsonb_array_length(v_ordenes)), 'vivo');
  exception when others then
    raise warning 'actividad: no se anotó la compra %: %', p_id, sqlerrm;
  end;
  return jsonb_build_object('papel_id', p_id, 'ordenes', v_ordenes);
end $$;

-- ---------- 4. Lecturas del celular ----------
-- Cada proveedor activo con qué categorías vende (las del catálogo y las que ya se le compraron aquí) y cuántas compras tiene.
create or replace function retail.fn_proveedores_para_comprar()
returns jsonb
language plpgsql stable security definer set search_path = retail, public, extensions as $$
begin
  if retail.fn_ve_modulo('ordenes_compra') is not true then
    raise exception 'Comprar necesita el módulo «Mi plata para compras» en tu rol' using errcode = '42501', hint = 'ordenes_compra_sin_modulo';
  end if;
  return coalesce((
    with cats as (
      select c.proveedor_id, unnest(c.categorias) as categoria_id from retail.fn_proveedor_categorias() c
      union
      select o.proveedor_id, i.categoria_id
        from retail.ordenes_compra o join retail.orden_compra_items i on i.orden_compra_id = o.id
       where o.estado <> 'anulada'
    ),
    compras as (
      select o.proveedor_id, count(distinct coalesce(o.papel_id, o.id)) as veces, max(o.fecha_emision) as ultima
        from retail.ordenes_compra o where o.estado <> 'anulada' group by o.proveedor_id
    )
    select jsonb_agg(jsonb_build_object(
             'id', pr.id, 'nombre', pr.nombre, 'ruc', pr.ruc,
             'categorias', coalesce((select jsonb_agg(distinct x.categoria_id) from cats x where x.proveedor_id = pr.id), '[]'::jsonb),
             'compras', coalesce(k.veces, 0), 'ultima', k.ultima)
           order by coalesce(k.veces, 0) desc, k.ultima desc nulls last, pr.nombre)
      from retail.proveedores pr left join compras k on k.proveedor_id = pr.id
     where pr.activo), '[]'::jsonb);
end $$;

-- Lo que se le compra a un proveedor. Primero lo comprado aquí (agrupado por prenda del catálogo o, si no la tiene, por descripción +
-- categoría + marca), con cuántas veces y lo de la vez pasada; después las prendas del catálogo que tienen ese proveedor y nunca se le
-- compraron aquí, con su costo y su precio. Lo más comprado primero; a igual veces, lo más reciente.
create or replace function retail.fn_habituales_proveedor(p_proveedor_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = retail, public, extensions as $$
begin
  if retail.fn_ve_modulo('ordenes_compra') is not true then
    raise exception 'Comprar necesita el módulo «Mi plata para compras» en tu rol' using errcode = '42501', hint = 'ordenes_compra_sin_modulo';
  end if;
  return coalesce((
    with lineas as (
      select i.producto_id, i.categoria_id, i.marca_id, i.descripcion, i.cantidad, i.precio_unitario, i.precio_venta_sugerido,
             o.fecha_emision, o.creada_en,
             coalesce(i.producto_id::text,
                      lower(btrim(coalesce(i.descripcion, ''))) || '|' || i.categoria_id::text || '|' || i.marca_id::text) as clave
        from retail.ordenes_compra o join retail.orden_compra_items i on i.orden_compra_id = o.id
       where o.proveedor_id = p_proveedor_id and o.estado <> 'anulada'
    ),
    comprado as (
      select distinct on (l.clave) l.clave, l.producto_id, l.categoria_id, l.marca_id, l.descripcion, l.cantidad, l.precio_unitario,
             l.precio_venta_sugerido, l.fecha_emision,
             (select count(*) from lineas x where x.clave = l.clave) as veces
        from lineas l order by l.clave, l.creada_en desc
    ),
    catalogo as (
      select p.id::text as clave, p.id as producto_id, p.categoria_id, p.marca_id, p.referencia as descripcion, null::integer as cantidad,
             (select min(v.costo) from retail.variantes v where v.producto_id = p.id and v.activo) as precio_unitario,
             (select min(v.precio) from retail.variantes v where v.producto_id = p.id and v.activo) as precio_venta_sugerido,
             null::date as fecha_emision, 0::bigint as veces
        from retail.productos p
       where p.proveedor_id = p_proveedor_id and p.estado = 'activo' and p.estado_alta <> 'rechazado' and not p.es_prueba
         and not exists (select 1 from comprado c where c.producto_id = p.id)
    ),
    todo as (select * from comprado union all select * from catalogo)
    select jsonb_agg(jsonb_build_object(
             'clave', t.clave, 'producto_id', t.producto_id,
             'nombre', coalesce(nullif(btrim(t.descripcion), ''), (select pp.referencia from retail.productos pp where pp.id = t.producto_id), c.nombre),
             'categoria_id', t.categoria_id, 'categoria', c.nombre, 'marca_id', t.marca_id, 'marca', m.nombre,
             'veces', t.veces, 'ultima_fecha', t.fecha_emision, 'ultima_cantidad', t.cantidad,
             'costo', t.precio_unitario, 'venta', t.precio_venta_sugerido)
           order by t.veces desc, t.fecha_emision desc nulls last, coalesce(nullif(btrim(t.descripcion), ''), c.nombre))
      from todo t join retail.categorias c on c.id = t.categoria_id left join retail.marcas m on m.id = t.marca_id), '[]'::jsonb);
end $$;

-- «Tu plata para compras»: lo que compró con un papel por completar ya bajó de su plata (en su celular; los libros, al completarlo).
create or replace function retail.fn_mi_plata_compras()
returns jsonb
language plpgsql stable security definer set search_path = retail, public, extensions as $$
declare
  v_persona uuid;
  v_fondo uuid;
begin
  if not retail.fn_ve_modulo('ordenes_compra') then
    raise exception 'Ver tu plata para compras necesita el módulo Mi plata para compras en tu rol.' using errcode = '42501';
  end if;
  v_persona := retail.fn_persona_de_la_cuenta();
  if v_persona is null then
    return jsonb_build_object('persona', false);
  end if;
  v_fondo := retail.fn_fondo_de(v_persona, false);
  return jsonb_build_object(
    'persona', true,
    'saldo', case when v_fondo is null then 0 else retail.fn_fondo_saldo(v_fondo) end,
    'por_confirmar', coalesce((select sum(a.monto) from retail.fondo_plata_anotada a where a.persona_id = v_persona and a.estado = 'por_confirmar'), 0),
    'compras_por_completar', coalesce((select sum(c.monto) from retail.compra_papeles c where c.persona_id = v_persona and c.estado = 'por_completar'), 0),
    'puede_ya_tenia', not exists (select 1 from retail.cuentas_dinero c where c.tipo = 'fondo' and c.persona_id = v_persona)
                      and not exists (select 1 from retail.fondo_plata_anotada a where a.persona_id = v_persona),
    'anotada', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'medio', a.medio, 'monto', a.monto, 'monto_confirmado', a.monto_confirmado,
                                          'estado', a.estado, 'fecha', a.fecha, 'creado_en', a.created_at, 'con_foto', a.foto_ruta is not null)
                       order by a.created_at desc)
        from (select * from retail.fondo_plata_anotada x where x.persona_id = v_persona order by x.created_at desc limit 30) a), '[]'::jsonb),
    'compras', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id, 'proveedor', pr.nombre, 'tipo', c.tipo, 'monto', c.monto, 'estado', c.estado, 'fecha', c.fecha, 'creado_en', c.created_at,
               'prendas', (select coalesce(sum(i.cantidad), 0) from retail.ordenes_compra o join retail.orden_compra_items i on i.orden_compra_id = o.id
                            where o.papel_id = c.id),
               'tiendas', (select coalesce(jsonb_agg(distinct u.nombre), '[]'::jsonb) from retail.ordenes_compra o join retail.ubicaciones u on u.id = o.ubicacion_destino_id
                            where o.papel_id = c.id))
             order by c.created_at desc)
        from (select * from retail.compra_papeles x where x.persona_id = v_persona order by x.created_at desc limit 30) c
        join retail.proveedores pr on pr.id = c.proveedor_id), '[]'::jsonb));
end $$;

revoke all on function retail.registrar_compra_rapida(uuid, uuid, text, numeric, text, jsonb) from public, anon;
revoke all on function retail.fn_proveedores_para_comprar() from public, anon;
revoke all on function retail.fn_habituales_proveedor(uuid) from public, anon;
revoke all on function retail.fn_compra_papeles_inmutable() from public, anon, authenticated;
grant execute on function retail.registrar_compra_rapida(uuid, uuid, text, numeric, text, jsonb) to authenticated;
grant execute on function retail.fn_proveedores_para_comprar() to authenticated;
grant execute on function retail.fn_habituales_proveedor(uuid) to authenticated;

-- Firma sin combo con la cuenta de una persona (desde una terminal, el combo), como crear una orden.
insert into retail.acciones_sin_responsable (clave, descripcion) values
  ('compra_rapida', 'Registrar una compra desde el celular (con la cuenta de una persona firma ella, desde una terminal se elige quién)')
on conflict (clave) do update set descripcion = excluded.descripcion;

-- ---------- 5. Una prenda en una orden de compra es historia: no se elimina ----------
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

select pg_temp.reemplazar('retail.fn_producto_historia(uuid)',
$v$        from retail.pedido_web_lineas x where x.variante_id in (select id from vs)
    ) h$v$,
$n$        from retail.pedido_web_lineas x where x.variante_id in (select id from vs)
      -- ADR-0480 (actividad 3): una prenda que ya está en una orden de compra (anotada desde el celular) tiene un proveedor del otro lado.
      union all select 26, 'líneas de órdenes de compra', count(*), false
        from retail.orden_compra_items x where x.producto_id = p_producto_id
    ) h$n$,
1);
