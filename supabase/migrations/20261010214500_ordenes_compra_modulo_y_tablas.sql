-- Órdenes de compra, fase 1 · actividad 1 (ADR-0362): el módulo, las dos tablas y la lista.
--
-- EL PROBLEMA PRIMERO. Desde el 2026-09-12 CAYLA anota lo que compra recién cuando llega la factura (ADR-0035): lo que se le pidió
-- a cada proveedor vive en un cuaderno o en un chat, y nadie puede comparar después lo pedido con lo que llegó, lo que se pagó o lo
-- que falta. Felipe decidió (ADR-0362, 2026-10-07 → 10) que vuelva la orden de compra: un documento de control de CAYLA, con un
-- número que no se repite ni se libera, que después pasa a comprobante (fase 2), se envía a la sede (fase 3) y se recibe allí
-- (fase 4). Esta migración crea solo lo que necesita la lista; crear, editar y anular llegan en las siguientes.
--
-- QUÉ CREA.
--   1. `retail.ordenes_compra`: la cabecera. `numero` lleva su propio contador, como traslados y conteos (20260916200000): identifica,
--      no cuenta; anular no lo libera (decisión 2) y el prefijo «OC-» vive en la pantalla. `ubicacion_destino_id` es la tienda a la
--      que la mercadería llega directo; NULL = «por repartir»: llega a Lima y se reparte después (decisiones 10, 19 y 22; Lima no es
--      una sede y no tiene fila). Estados de la fase 1: `generada` y `anulada`; cada fase siguiente suma los suyos.
--   2. `retail.orden_compra_items`: las líneas, con categoría y marca obligatorias (decisión 4). El descuento se guarda EN SOLES, que
--      es lo que se paga; si se escribió como porcentaje, `descuento_pct` lo recuerda y un candado exige que los dos cuadren. El
--      subtotal es una columna calculada: el total de una orden no puede dejar de ser la suma de sus líneas.
--   3. El módulo `ordenes_compra` (Compras, orden 145), SIN rol: nace solo para el líder (ADR-0161). Delegable, porque sus funciones
--      preguntan por el módulo y no por el líder. Quien lo tiene ve las órdenes de TODAS las sedes con sus precios (decisiones 34 y
--      37): no pasa por `fn_compras_ubicaciones` (Compras por tienda, ADR-0184).
--   4. `fn_ordenes_compra(...)`: la lista (lectura), con el total y las unidades de cada orden, filtrable por destino, estado,
--      proveedor y texto, de a 50.
--   RLS encendido SIN políticas en las dos tablas: solo se leen y se escriben por funciones security definer que exigen el módulo.
--
-- DESCARTÉ guardar la orden en `compras` con un estado «orden»: una orden no es un comprobante (no tiene serie, IGV ni pago) y
-- `compra_items.producto_id` es NOT NULL; mezclarlas obligaba a revisar las 13 funciones que leen `compra_items`. Las órdenes del
-- Taller (fase 7) tampoco van aquí: llevan otro correlativo, otros proveedores y otra línea (decisiones 25 y 28).
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). Una sola parte: tablas NUEVAS que nadie usa todavía, sin políticas ni
-- `drop trigger` (ADR-0195), sin `select … into` dentro de textos entre comillas (ADR-0288). Idempotente.

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. La orden ----------
create sequence if not exists retail.ordenes_compra_numero_seq;

create table if not exists retail.ordenes_compra (
  id uuid primary key default gen_random_uuid(),
  numero integer not null default nextval('retail.ordenes_compra_numero_seq'),
  proveedor_id uuid not null references retail.proveedores (id),
  -- La tienda a la que llega directo; NULL = «por repartir» (llega a Lima y se reparte después, fase 3).
  ubicacion_destino_id uuid references retail.ubicaciones (id),
  fecha_emision date not null default retail.fn_hoy_lima(),
  fecha_entrega_estimada date,
  estado text not null default 'generada',
  nota text check (nota is null or btrim(nota) <> ''),
  creada_por uuid not null references public.personas (id),
  creada_en timestamptz not null default now(),
  actualizada_por uuid references public.personas (id),
  actualizada_en timestamptz,
  -- Sube con cada cambio: quien guarda con una versión vieja no pisa a quien guardó antes (ADR-0188).
  version integer not null default 1 check (version > 0),
  anulada_por uuid references public.personas (id),
  anulada_en timestamptz,
  motivo_anulacion text,
  constraint ordenes_compra_numero_unico unique (numero),
  constraint ordenes_compra_estado check (estado in ('generada', 'anulada')),
  constraint ordenes_compra_entrega check (fecha_entrega_estimada is null or fecha_entrega_estimada >= fecha_emision),
  -- Anulada si y solo si dice quién, cuándo y por qué; en cualquier otro estado esos tres van vacíos.
  constraint ordenes_compra_anulacion check (
    case
      when estado = 'anulada' then anulada_por is not null and anulada_en is not null and coalesce(btrim(motivo_anulacion), '') <> ''
      else anulada_por is null and anulada_en is null and motivo_anulacion is null
    end
  )
);
alter sequence retail.ordenes_compra_numero_seq owned by retail.ordenes_compra.numero;
create index if not exists ordenes_compra_proveedor_idx on retail.ordenes_compra (proveedor_id);
create index if not exists ordenes_compra_destino_idx on retail.ordenes_compra (ubicacion_destino_id);
comment on table retail.ordenes_compra is
  'ADR-0362: la orden de compra de tienda (OC-000001). Destino NULL = por repartir desde Lima. Solo se lee y escribe por funciones '
  'security definer que exigen el módulo ordenes_compra (RLS sin políticas).';

-- ---------- 2. Las líneas ----------
create table if not exists retail.orden_compra_items (
  id uuid primary key default gen_random_uuid(),
  orden_compra_id uuid not null references retail.ordenes_compra (id),
  -- El lugar de la línea en el documento (1, 2, 3…): así la muestran la ventana y el PDF.
  posicion integer not null check (posicion > 0),
  categoria_id uuid not null references retail.categorias (id),
  marca_id uuid not null references retail.marcas (id),
  descripcion text check (descripcion is null or btrim(descripcion) <> ''),
  cantidad integer not null check (cantidad > 0),
  -- Mismo tipo que `compra_items.costo_unitario`: la fase 2 pasa la línea al comprobante sin redondear nada.
  precio_unitario numeric(12, 2) not null check (precio_unitario >= 0),
  -- Lo que se descuenta, en soles. Si se escribió como porcentaje, `descuento_pct` lo recuerda para volver a mostrarlo así.
  descuento numeric(12, 2) not null default 0 check (descuento >= 0),
  descuento_pct numeric(7, 4) check (descuento_pct is null or (descuento_pct >= 0 and descuento_pct <= 100)),
  subtotal numeric(12, 2) generated always as (cantidad * precio_unitario - descuento) stored,
  constraint orden_compra_items_posicion_unica unique (orden_compra_id, posicion),
  constraint orden_compra_items_descuento_tope check (descuento <= cantidad * precio_unitario),
  constraint orden_compra_items_descuento_cuadra check (
    descuento_pct is null or descuento = round(cantidad * precio_unitario * descuento_pct / 100, 2)
  )
);
comment on table retail.orden_compra_items is
  'ADR-0362: una línea de la orden de compra (categoría + marca, cantidad, precio y descuento en soles). Solo se lee y escribe por '
  'funciones security definer que exigen el módulo ordenes_compra (RLS sin políticas).';

alter table retail.ordenes_compra enable row level security;
alter table retail.orden_compra_items enable row level security;

-- ---------- 3. El módulo (sin rol: solo el líder hasta que lo dé) ----------
insert into retail.modulos (clave, grupo, nombre, incluye, orden, solo_lider, delegable) values
  ('ordenes_compra', 'Compras', 'Órdenes de compra',
   'Crear, ver, editar y anular las órdenes de compra a proveedores de todas las sedes, con sus precios, y descargar su PDF',
   145, false, true)
on conflict (clave) do nothing;

-- ---------- 4. La lista (lectura) ----------
-- `p_destino`: NULL = todas; 'por_repartir' = las que llegan a Lima; el id de una tienda = las que llegan directo a ella.
-- `p_busqueda`: el número («12», «OC-000012») o el nombre del proveedor, sin importar tildes ni mayúsculas.
-- De a `p_limite` (máximo 100), de la más nueva a la más vieja; `p_antes_de` pide las de número menor (la página siguiente).
create or replace function retail.fn_ordenes_compra(
  p_destino text default null,
  p_estado text default null,
  p_proveedor_id uuid default null,
  p_busqueda text default null,
  p_limite integer default 50,
  p_antes_de integer default null
)
returns table (
  id uuid,
  numero integer,
  estado text,
  proveedor_id uuid,
  proveedor_nombre text,
  ubicacion_destino_id uuid,
  destino_nombre text,
  fecha_emision date,
  fecha_entrega_estimada date,
  lineas integer,
  unidades integer,
  total numeric,
  creada_por_nombre text,
  creada_en timestamptz
)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_destino uuid;
  v_q text := nullif(btrim(coalesce(p_busqueda, '')), '');
  v_numero integer;
begin
  if retail.fn_ve_modulo('ordenes_compra') is not true then
    raise exception 'Ver las órdenes de compra necesita el módulo «Órdenes de compra» en tu rol'
      using errcode = '42501', hint = 'ordenes_compra_sin_modulo';
  end if;
  if p_destino is not null and p_destino <> 'por_repartir' then
    if p_destino !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Ese destino no se entiende' using hint = 'ordenes_compra_destino';
    end if;
    v_destino := p_destino::uuid;
  end if;
  -- «OC-000012», «oc12» o «12» buscan también por número.
  if v_q is not null and regexp_replace(v_q, '^(oc)?[\s-]*', '', 'i') ~ '^\d{1,9}$' then
    v_numero := regexp_replace(v_q, '^(oc)?[\s-]*', '', 'i')::integer;
  end if;

  return query
  select o.id, o.numero, o.estado, o.proveedor_id, pr.nombre, o.ubicacion_destino_id, u.nombre,
         o.fecha_emision, o.fecha_entrega_estimada,
         coalesce(t.lineas, 0)::integer, coalesce(t.unidades, 0)::integer, coalesce(t.total, 0)::numeric,
         nullif(btrim(concat_ws(' ', pe.nombres, pe.apellidos)), ''), o.creada_en
    from retail.ordenes_compra o
    join retail.proveedores pr on pr.id = o.proveedor_id
    left join retail.ubicaciones u on u.id = o.ubicacion_destino_id
    left join public.personas pe on pe.id = o.creada_por
    left join lateral (
      select count(*) as lineas, sum(i.cantidad) as unidades, sum(i.subtotal) as total
        from retail.orden_compra_items i
       where i.orden_compra_id = o.id
    ) t on true
   where (p_destino is null
          or (p_destino = 'por_repartir' and o.ubicacion_destino_id is null)
          or o.ubicacion_destino_id = v_destino)
     and (p_estado is null or o.estado = p_estado)
     and (p_proveedor_id is null or o.proveedor_id = p_proveedor_id)
     and (v_q is null
          or o.numero = v_numero
          or lower(translate(pr.nombre, 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunaeiouun'))
             like '%' || lower(translate(v_q, 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunaeiouun')) || '%')
     and (p_antes_de is null or o.numero < p_antes_de)
   order by o.numero desc
   limit least(greatest(coalesce(p_limite, 50), 1), 100);
end;
$$;
comment on function retail.fn_ordenes_compra(text, text, uuid, text, integer, integer) is
  'ADR-0362: la lista de órdenes de compra, con total y unidades. Exige el módulo ordenes_compra; quien lo tiene ve todas las sedes '
  '(decisiones 34 y 37). p_destino: NULL todas, ''por_repartir'' o el id de una tienda.';

revoke all on function retail.fn_ordenes_compra(text, text, uuid, text, integer, integer) from public, anon;
grant execute on function retail.fn_ordenes_compra(text, text, uuid, text, integer, integer) to authenticated, service_role;

reset lock_timeout;
