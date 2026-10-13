-- Órdenes de insumos del Taller, fase 7 · actividad 1 (ADR-0362): el módulo, el correlativo y las tres tablas.
--
-- EL PROBLEMA PRIMERO. El Taller compra tela, hilo y avíos sin un documento propio: lo que se le pidió a cada proveedor vive en un chat
-- o en un cuaderno, y nadie puede comparar después lo pedido con lo que llegó (`recibir_comprobante_produccion` recibe contra la factura,
-- no contra lo pedido). Las tiendas ya tienen su orden de compra (fase 1, `ordenes_compra`), pero Felipe decidió que la compra del Taller
-- NO se mezcle con la de tienda: otros proveedores (`proveedores_produccion`), otra línea (el insumo con su unidad, no categoría + marca),
-- otro destino (el Taller) y otro correlativo, OI-000001 (decisiones 25 y 28). Y un módulo propio, «Órdenes de insumos», que da esas
-- órdenes con sus precios sin abrir el resto de la plata del Taller, que ADR-0126 deja solo al líder (decisión 47, Felipe 2026-10-12).
--
-- QUÉ CREA (las funciones que las leen y las escriben llegan en 20261013040000; esta parte no tiene ninguna RPC).
--   1. `retail.ordenes_insumo`: la cabecera, con el esqueleto probado de `ordenes_compra` (20261010214500): su propio contador
--      `ordenes_insumo_numero_seq` (identifica, no cuenta; anular no libera el número; el prefijo «OI-» vive en la pantalla), estados
--      `generada` y `anulada`, versión, y la anulación con quién, cuándo y por qué. `ubicacion_destino_id` es NOT NULL: los insumos van
--      al Taller, no hay «por repartir» [provisional, revisar con Felipe: destino obligatorio; que sea una sede de tipo «taller» lo valida
--      la función, porque un CHECK no puede mirar `ubicaciones`].
--   2. `retail.orden_insumo_items`: las líneas. El insumo del catálogo (`insumos`), una descripción opcional, la cantidad con hasta tres
--      decimales EN LA UNIDAD DEL INSUMO (`numeric(12,3)`, como `comprobantes_produccion_items` e `insumo_lotes`), y `unidad_medida`
--      COPIADA del insumo al guardar: así el documento no cambia de sentido si después alguien cambia la unidad del insumo (50 metros no
--      pasan a ser 50 kilos en una orden ya mandada) [provisional, revisar con Felipe]. Precio y descuento con la misma precisión y los
--      mismos candados que `orden_compra_items` [provisional, revisar con Felipe: los comprobantes del Taller aceptan un costo unitario
--      con 4 decimales; aquí el precio va con 2, como en la orden de tienda]. Como la cantidad trae decimales, el IMPORTE de la línea es
--      `round(cantidad × precio, 2)` —lo que diría el papel—, el descuento en % se calcula sobre ese importe, y el subtotal (columna
--      calculada) es importe − descuento: el total de una orden no puede dejar de ser la suma de sus líneas, y ninguna línea queda negativa.
--   3. `retail.orden_insumo_versiones`: el ARCHIVO de lo que la orden decía antes de cada edición (con precios). Solo se agrega: un
--      disparador impide editarlo o borrarlo. Al editar se reemplazan las líneas, pero lo de antes no se pierde («nunca borres datos»).
--   4. La versión que sube SOLA en cada escritura de la cabecera (disparador, como `ordenes_compra` y `productos`, ADR-0193): lo que
--      mande quien escribe se ignora, y una pantalla con la versión vieja recibe el aviso de choque.
--   5. El módulo `ordenes_insumos` (grupo Producción, orden 205: después de «Órdenes de producción», 200, y antes de Análisis, 210; ningún
--      otro módulo usa el 205 en las migraciones del repo al 2026-10-12), SIN rol: nace solo para el líder (ADR-0161, decisión 47).
--      Delegable, porque sus funciones preguntan por el módulo y nunca por el líder: quien lo tiene ve y hace todo en esas órdenes, con
--      sus precios (decisiones 34 y 47), sin el candado de dinero del Taller [provisional, revisar con Felipe: el grupo «Producción» es la
--      opción (a) de la pregunta 1 del contrato, «¿dónde vive en el menú?»].
--   RLS encendido SIN políticas en las tres tablas, y sin permisos para `anon` ni `authenticated`: solo se leen y se escriben por
--   funciones security definer que exigen el módulo.
--
-- DESCARTÉ
--   · Reusar `ordenes_compra` con un tipo «insumo» en la línea (lo que recomendaba el anexo `insumos-por-orden-de-compra.md`): Felipe
--     decidió lo contrario (25, 28, 47) —proveedores, correlativo y módulo distintos— y mezclarlas obligaba a cada lectura de la orden de
--     tienda a esquivar las líneas del Taller.
--   · No copiar la unidad y congelar en cambio `insumos.unidad_medida` cuando el insumo ya tiene órdenes (la otra propuesta del anexo):
--     tocaba una tabla que ya usa el Taller (`insumos`) y le quitaba al líder corregir una unidad mal puesta. Copiarla deja el documento
--     quieto sin tocar el catálogo.
--   · Repetir en un CHECK la lista de unidades (`metro`, `unidad`, `kilo`, `cono`, `par`, `docena`): ya la exige `insumos`, la línea la
--     copia de ahí, y una unidad nueva del catálogo obligaría a cambiar dos candados. Aquí basta que no venga vacía.
--   · Un CHECK que rechace una cantidad con 4 decimales: con `numeric(12,3)` la columna la redondea; la que se rechaza con su mensaje es
--     la función (nadie más escribe aquí: la API no tiene permisos sobre estas tablas).
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). Una sola parte, ANTES de 20261013040000: tablas NUEVAS que nadie usa todavía y una
-- fila en `modulos`; sin políticas, con `create or replace trigger` (nunca `drop trigger`, ADR-0195) y sin `select … into` dentro de
-- textos entre comillas (ADR-0288). Idempotente: se puede pegar dos veces.

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. La orden ----------
create sequence if not exists retail.ordenes_insumo_numero_seq;

create table if not exists retail.ordenes_insumo (
  id uuid primary key default gen_random_uuid(),
  numero integer not null default nextval('retail.ordenes_insumo_numero_seq'),
  -- Un proveedor del Taller (tela, avíos…), no uno de tienda: la compra del Taller no se mezcla con la de tienda (decisión 25).
  proveedor_id uuid not null references retail.proveedores_produccion (id),
  -- El Taller que la recibe. Obligatorio: los insumos no se reparten desde Lima (decisión 25).
  ubicacion_destino_id uuid not null references retail.ubicaciones (id),
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
  constraint ordenes_insumo_numero_unico unique (numero),
  constraint ordenes_insumo_estado check (estado in ('generada', 'anulada')),
  constraint ordenes_insumo_entrega check (fecha_entrega_estimada is null or fecha_entrega_estimada >= fecha_emision),
  -- Anulada si y solo si dice quién, cuándo y por qué; en cualquier otro estado esos tres van vacíos.
  constraint ordenes_insumo_anulacion check (
    case
      when estado = 'anulada' then anulada_por is not null and anulada_en is not null and coalesce(btrim(motivo_anulacion), '') <> ''
      else anulada_por is null and anulada_en is null and motivo_anulacion is null
    end
  )
);
alter sequence retail.ordenes_insumo_numero_seq owned by retail.ordenes_insumo.numero;
create index if not exists ordenes_insumo_proveedor_idx on retail.ordenes_insumo (proveedor_id);
comment on table retail.ordenes_insumo is
  'ADR-0362 fase 7: la orden de compra de insumos del Taller (OI-000001), separada de la de tienda (decisiones 25, 28 y 47). '
  'Solo se lee y escribe por funciones security definer que exigen el módulo ordenes_insumos (RLS sin políticas).';

-- ---------- 2. Las líneas ----------
create table if not exists retail.orden_insumo_items (
  id uuid primary key default gen_random_uuid(),
  orden_insumo_id uuid not null references retail.ordenes_insumo (id),
  -- El lugar de la línea en el documento (1, 2, 3…): así la muestran la ventana y el PDF.
  posicion integer not null check (posicion > 0),
  insumo_id uuid not null references retail.insumos (id),
  descripcion text check (descripcion is null or btrim(descripcion) <> ''),
  -- En la unidad del insumo (metros, conos, kilos…), con hasta tres decimales: 12.5 metros de lino, 3 conos de hilo.
  cantidad numeric(12, 3) not null check (cantidad > 0),
  -- La unidad del insumo el día que se guardó la línea (la copia la función al guardar).
  unidad_medida text not null check (btrim(unidad_medida) <> ''),
  -- Mismo tipo que `orden_compra_items.precio_unitario`.
  precio_unitario numeric(12, 2) not null check (precio_unitario >= 0),
  -- Lo que se descuenta, en soles. Si se escribió como porcentaje, `descuento_pct` lo recuerda para volver a mostrarlo así.
  descuento numeric(12, 2) not null default 0 check (descuento >= 0),
  descuento_pct numeric(7, 4) check (descuento_pct is null or (descuento_pct >= 0 and descuento_pct <= 100)),
  -- Importe redondeado a céntimos menos el descuento: nunca negativo (el descuento no pasa del importe).
  subtotal numeric(12, 2) generated always as (round(cantidad * precio_unitario, 2) - descuento) stored,
  constraint orden_insumo_items_posicion_unica unique (orden_insumo_id, posicion),
  constraint orden_insumo_items_descuento_tope check (descuento <= round(cantidad * precio_unitario, 2)),
  constraint orden_insumo_items_descuento_cuadra check (
    descuento_pct is null or descuento = round(round(cantidad * precio_unitario, 2) * descuento_pct / 100, 2)
  )
);
comment on table retail.orden_insumo_items is
  'ADR-0362 fase 7: una línea de la orden de insumos (el insumo, la cantidad en su unidad —copiada al guardar—, precio y descuento en '
  'soles). Solo se lee y escribe por funciones security definer que exigen el módulo ordenes_insumos (RLS sin políticas).';

-- ---------- 3. El archivo de lo que la orden decía antes de cada edición ----------
create table if not exists retail.orden_insumo_versiones (
  id bigint generated always as identity primary key,
  orden_insumo_id uuid not null references retail.ordenes_insumo (id),
  -- La versión que se reemplazó (la que la pantalla editó).
  version integer not null,
  -- La orden entera como estaba: cabecera, líneas con su unidad, precios y descuentos, y el total (`fn_orden_insumo_foto`).
  datos jsonb not null,
  reemplazada_por uuid references public.personas (id),
  reemplazada_en timestamptz not null default now(),
  constraint orden_insumo_versiones_unica unique (orden_insumo_id, version)
);
comment on table retail.orden_insumo_versiones is
  'ADR-0362 fase 7: lo que una orden de insumos decía antes de cada edición (con precios). Solo se agrega. Se lee por funciones.';

-- RLS sin políticas y sin permisos de la API: ni `anon` ni `authenticated` leen ni escriben estas tablas directo.
alter table retail.ordenes_insumo enable row level security;
alter table retail.orden_insumo_items enable row level security;
alter table retail.orden_insumo_versiones enable row level security;
revoke all on retail.ordenes_insumo, retail.orden_insumo_items, retail.orden_insumo_versiones from anon, authenticated;

-- ---------- 4. La versión sube sola; el archivo no se toca ----------
create or replace function retail.fn_orden_insumo_version() returns trigger
language plpgsql
set search_path = retail, public, extensions
as $$
begin
  -- Lo que mande quien escribe se ignora: la versión no se fija a mano.
  new.version := old.version + 1;
  return new;
end;
$$;
create or replace trigger ordenes_insumo_version
  before update on retail.ordenes_insumo
  for each row execute function retail.fn_orden_insumo_version();

create or replace function retail.fn_orden_insumo_versiones_inmutable() returns trigger
language plpgsql
set search_path = retail, public, extensions
as $$
begin
  raise exception 'El archivo de una orden de insumos no se edita ni se borra: es lo que la orden decía antes' using errcode = '42501';
end;
$$;
create or replace trigger orden_insumo_versiones_inmutable
  before update or delete on retail.orden_insumo_versiones
  for each row execute function retail.fn_orden_insumo_versiones_inmutable();

revoke all on function retail.fn_orden_insumo_version() from public, anon, authenticated;
revoke all on function retail.fn_orden_insumo_versiones_inmutable() from public, anon, authenticated;

-- ---------- 5. El módulo (sin rol: solo el líder hasta que lo dé) ----------
insert into retail.modulos (clave, grupo, nombre, incluye, orden, solo_lider, delegable) values
  ('ordenes_insumos', 'Producción', 'Órdenes de insumos',
   'Crear, ver, editar y anular las órdenes de compra de insumos del Taller, con sus precios, y descargar su PDF',
   205, false, true)
on conflict (clave) do nothing;

reset lock_timeout;
