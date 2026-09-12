-- ============================================================================
-- 0002_esquema.sql — CAYLA V2, schema `retail`
--
-- Base: el modelo validado en lab/retail-db (23 tablas, 21 pruebas en
-- verde) — NO copiado ciego, adaptado a vivir dentro de Supabase real:
--   - `usuarios` (simulacro admin/operador del laboratorio, sin Auth) se
--     reemplaza por `personas`, que sí liga a auth.users — el modelo de
--     permisos que V1 ya tenía y probó (rol lider/integrante + ubicación),
--     no el simplificado del laboratorio (pedido explícito de Felipe).
--   - Todo lo demás (ubicaciones/sububicaciones opcionales, venta_items,
--     devoluciones/devolucion_items, conteos con cantidad_sistema
--     congelada, ajuste con signo, proveedor FK-only) es EXACTAMENTE lo
--     que ya se probó en el laboratorio — ver docs ahí para el porqué de
--     cada una, no se repite acá.
-- ============================================================================

-- ============================================================================
-- IDENTIDAD — liga con Supabase Auth (esto es lo que el laboratorio no tenía)
-- ============================================================================

-- Se crea DESPUÉS de ubicaciones más abajo por el FK — ver el bloque real
-- de personas tras la sección de ubicaciones.

-- ============================================================================
-- CATÁLOGO
-- ============================================================================

create table retail.categorias (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  activo boolean not null default true
);

create table retail.productos (
  id uuid primary key default gen_random_uuid(),
  categoria_id uuid references retail.categorias (id),
  referencia text not null,
  descripcion text,
  estado text not null default 'activo' check (estado in ('activo', 'descontinuado')),
  created_at timestamptz not null default now()
);
create index productos_categoria_idx on retail.productos (categoria_id);

create table retail.colores (
  codigo text primary key,
  nombre text not null,
  hex text,
  activo boolean not null default true
);

create table retail.variantes (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references retail.productos (id),
  color_codigo text references retail.colores (codigo),
  talla text,
  sku text not null unique,
  precio numeric(12, 2) not null check (precio >= 0),
  costo numeric(12, 2) not null default 0 check (costo >= 0),
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (producto_id, talla, color_codigo)
);
create index variantes_producto_idx on retail.variantes (producto_id);

create table retail.codigos_barras (
  id uuid primary key default gen_random_uuid(),
  variante_id uuid not null references retail.variantes (id),
  codigo text not null unique,
  origen text not null default 'propio' check (origen in ('propio', 'fabrica')),
  created_at timestamptz not null default now()
);
create index codigos_barras_variante_idx on retail.codigos_barras (variante_id);

-- ============================================================================
-- UBICACIONES
-- ============================================================================

create table retail.ubicaciones (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  tipo text not null check (tipo in ('tienda', 'almacen')),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table retail.sububicaciones (
  id uuid primary key default gen_random_uuid(),
  ubicacion_id uuid not null references retail.ubicaciones (id),
  nombre text not null,
  tipo text,
  created_at timestamptz not null default now(),
  unique (ubicacion_id, nombre)
);
create index sububicaciones_ubicacion_idx on retail.sububicaciones (ubicacion_id);

-- ============================================================================
-- PERSONAS — el reemplazo real de usuarios/p_usuario_id del laboratorio
-- ============================================================================

create table retail.personas (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users (id),
  nombre text not null,
  rol text not null default 'integrante' check (rol in ('lider', 'integrante')),
  ubicacion_id uuid references retail.ubicaciones (id),
  created_at timestamptz not null default now()
);
create index personas_auth_user_idx on retail.personas (auth_user_id);

-- ============================================================================
-- INVENTARIO
-- ============================================================================

create table retail.stock (
  variante_id uuid not null references retail.variantes (id),
  ubicacion_id uuid not null references retail.ubicaciones (id),
  cantidad integer not null default 0 check (cantidad >= 0),
  updated_at timestamptz not null default now(),
  primary key (variante_id, ubicacion_id)
);

create table retail.movimientos (
  id uuid primary key default gen_random_uuid(),
  variante_id uuid not null references retail.variantes (id),
  ubicacion_id uuid not null references retail.ubicaciones (id),
  ubicacion_destino_id uuid references retail.ubicaciones (id),
  sububicacion_id uuid references retail.sububicaciones (id),
  sububicacion_destino_id uuid references retail.sububicaciones (id),
  tipo text not null check (tipo in ('entrada', 'salida', 'ajuste', 'traslado')),
  cantidad integer not null,
  motivo text,
  venta_item_id uuid,
  lote_id uuid,
  devolucion_item_id uuid,
  conteo_item_id uuid,
  transferencia_item_id uuid,
  usuario_id uuid references retail.personas (id),
  nota text,
  created_at timestamptz not null default now(),
  constraint movimientos_cantidad_valida check (
    (tipo <> 'ajuste' and cantidad > 0) or (tipo = 'ajuste' and cantidad <> 0)
  ),
  constraint movimientos_traslado_tiene_destino check (
    (tipo = 'traslado' and ubicacion_destino_id is not null and ubicacion_destino_id <> ubicacion_id)
    or (tipo <> 'traslado' and ubicacion_destino_id is null)
  )
);
create index movimientos_variante_ubicacion_idx on retail.movimientos (variante_id, ubicacion_id);
create index movimientos_venta_item_idx on retail.movimientos (venta_item_id) where venta_item_id is not null;
create index movimientos_lote_idx on retail.movimientos (lote_id) where lote_id is not null;

-- ============================================================================
-- PROVEEDORES Y COMPRAS
-- ============================================================================

create table retail.proveedores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  ruc text,
  contacto text,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table retail.ordenes_compra (
  id uuid primary key default gen_random_uuid(),
  proveedor_id uuid not null references retail.proveedores (id),
  ubicacion_destino_id uuid not null references retail.ubicaciones (id),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'recibida_parcial', 'recibida', 'cancelada')),
  fecha date not null default current_date,
  fecha_estimada date,
  monto_estimado numeric(12, 2),
  created_at timestamptz not null default now()
);

create table retail.ordenes_compra_items (
  id uuid primary key default gen_random_uuid(),
  orden_id uuid not null references retail.ordenes_compra (id),
  variante_id uuid not null references retail.variantes (id),
  cantidad integer not null check (cantidad > 0),
  costo_unitario numeric(12, 2) not null check (costo_unitario >= 0),
  unique (orden_id, variante_id)
);

create table retail.lotes (
  id uuid primary key default gen_random_uuid(),
  ubicacion_id uuid not null references retail.ubicaciones (id),
  proveedor_id uuid not null references retail.proveedores (id),
  orden_compra_id uuid references retail.ordenes_compra (id),
  numero_guia text,
  fecha_recepcion timestamptz not null default now(),
  recibido_por uuid references retail.personas (id),
  nota text
);
create index lotes_ubicacion_idx on retail.lotes (ubicacion_id);

-- ============================================================================
-- CLIENTES
-- ============================================================================

create table retail.clientes (
  id uuid primary key default gen_random_uuid(),
  tipo_doc text check (tipo_doc in ('dni', 'ruc', 'sin_documento')),
  num_doc text,
  nombre text not null,
  telefono text,
  email text,
  created_at timestamptz not null default now()
);
create unique index clientes_doc_unico on retail.clientes (tipo_doc, num_doc) where num_doc is not null;

-- ============================================================================
-- VENTAS — ver lab/retail-db/sql/02_esquema.sql para el razonamiento completo
-- de por qué venta_items y no movimientos-como-detalle. Resumen: movimientos
-- es genérico para los 4 tipos; venta_items es la verdad comercial (precio,
-- descuento, costo histórico), y las dos no pueden desincronizarse porque
-- las escribe la misma función en la misma transacción.
-- ============================================================================

create table retail.ventas (
  id uuid primary key default gen_random_uuid(),
  ubicacion_id uuid not null references retail.ubicaciones (id),
  cliente_id uuid references retail.clientes (id),
  metodo_pago text not null check (metodo_pago in ('efectivo', 'pos', 'yape', 'transferencia')),
  usuario_id uuid references retail.personas (id),
  token_cliente uuid unique,
  created_at timestamptz not null default now()
);

create table retail.venta_items (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid not null references retail.ventas (id),
  variante_id uuid not null references retail.variantes (id),
  cantidad integer not null check (cantidad > 0),
  precio_unitario numeric(12, 2) not null check (precio_unitario >= 0),
  descuento_unitario numeric(12, 2) not null default 0 check (descuento_unitario >= 0),
  costo_unitario numeric(12, 2) not null check (costo_unitario >= 0),
  subtotal numeric(12, 2) generated always as ((precio_unitario - descuento_unitario) * cantidad) stored,
  constraint venta_items_descuento_no_supera_precio check (descuento_unitario <= precio_unitario)
);
create index venta_items_venta_idx on retail.venta_items (venta_id);

-- ============================================================================
-- DEVOLUCIONES
-- ============================================================================

create table retail.devoluciones (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid not null references retail.ventas (id),
  ubicacion_id uuid not null references retail.ubicaciones (id),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aprobada', 'rechazada')),
  motivo text not null,
  reembolso_monto numeric(12, 2),
  reembolso_metodo text,
  solicitado_por uuid references retail.personas (id),
  aprobado_por uuid references retail.personas (id),
  created_at timestamptz not null default now(),
  aprobado_en timestamptz,
  constraint devoluciones_aprobacion_coherente check (
    (estado = 'pendiente' and aprobado_en is null) or (estado <> 'pendiente' and aprobado_en is not null)
  )
);

create table retail.devolucion_items (
  id uuid primary key default gen_random_uuid(),
  devolucion_id uuid not null references retail.devoluciones (id),
  venta_item_id uuid not null references retail.venta_items (id),
  cantidad integer not null check (cantidad > 0),
  condicion text not null check (condicion in ('vendible', 'danada_reparacion', 'danada_donar', 'devolver_proveedor')),
  movimiento_id uuid,
  unique (devolucion_id, venta_item_id)
);
create index devolucion_items_devolucion_idx on retail.devolucion_items (devolucion_id);

-- ============================================================================
-- CONTEOS
-- ============================================================================

create table retail.conteos (
  id uuid primary key default gen_random_uuid(),
  ubicacion_id uuid not null references retail.ubicaciones (id),
  sububicacion_id uuid references retail.sububicaciones (id),
  estado text not null default 'abierto' check (estado in ('abierto', 'cerrado', 'anulado')),
  abierto_por uuid references retail.personas (id),
  cerrado_por uuid references retail.personas (id),
  created_at timestamptz not null default now(),
  cerrado_en timestamptz
);
create unique index conteos_un_abierto_por_ubicacion on retail.conteos (ubicacion_id) where estado = 'abierto';

create table retail.conteo_items (
  id uuid primary key default gen_random_uuid(),
  conteo_id uuid not null references retail.conteos (id),
  variante_id uuid not null references retail.variantes (id),
  cantidad_sistema integer not null,
  cantidad_contada integer not null check (cantidad_contada >= 0),
  diferencia integer,
  movimiento_id uuid,
  unique (conteo_id, variante_id)
);

-- ============================================================================
-- TRANSFERENCIAS
-- ============================================================================

create table retail.transferencias (
  id uuid primary key default gen_random_uuid(),
  ubicacion_origen_id uuid not null references retail.ubicaciones (id),
  ubicacion_destino_id uuid not null references retail.ubicaciones (id),
  estado text not null default 'completada' check (estado in ('completada')),
  creado_por uuid references retail.personas (id),
  nota text,
  created_at timestamptz not null default now(),
  constraint transferencias_origen_destino_distintos check (ubicacion_origen_id <> ubicacion_destino_id)
);

create table retail.transferencia_items (
  id uuid primary key default gen_random_uuid(),
  transferencia_id uuid not null references retail.transferencias (id),
  variante_id uuid not null references retail.variantes (id),
  cantidad integer not null check (cantidad > 0),
  movimiento_id uuid,
  unique (transferencia_id, variante_id)
);

-- ============================================================================
-- CIERRE DE REFERENCIAS CIRCULARES
-- ============================================================================

alter table retail.movimientos
  add constraint movimientos_venta_item_fkey foreign key (venta_item_id) references retail.venta_items (id),
  add constraint movimientos_lote_fkey foreign key (lote_id) references retail.lotes (id),
  add constraint movimientos_devolucion_item_fkey foreign key (devolucion_item_id) references retail.devolucion_items (id),
  add constraint movimientos_conteo_item_fkey foreign key (conteo_item_id) references retail.conteo_items (id),
  add constraint movimientos_transferencia_item_fkey foreign key (transferencia_item_id) references retail.transferencia_items (id);

alter table retail.devolucion_items
  add constraint devolucion_items_movimiento_fkey foreign key (movimiento_id) references retail.movimientos (id);
alter table retail.conteo_items
  add constraint conteo_items_movimiento_fkey foreign key (movimiento_id) references retail.movimientos (id);
alter table retail.transferencia_items
  add constraint transferencia_items_movimiento_fkey foreign key (movimiento_id) references retail.movimientos (id);
