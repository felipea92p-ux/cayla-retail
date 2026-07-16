-- CAYLA Retail — esquema inicial: inventario multi-sede + stubs de producción/compras.
-- Sedes reales confirmadas 2026-07-15: TRU, AQP, LIM (tiendas), Taller (fábrica, Lima).
-- "Online" es canal de venta, no sede — no tiene stock propio.

create extension if not exists pgcrypto;

-- ==================== SEDES ====================
create table sedes (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique check (codigo in ('TRU', 'AQP', 'LIM', 'TALLER')),
  nombre text not null,
  tipo text not null check (tipo in ('tienda', 'fabrica')),
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into sedes (codigo, nombre, tipo) values
  ('TRU', 'Trujillo', 'tienda'),
  ('AQP', 'Arequipa', 'tienda'),
  ('LIM', 'Lima', 'tienda'),
  ('TALLER', 'Taller (Lima)', 'fabrica');

-- ==================== PERSONAS ====================
create table personas (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users (id) on delete set null,
  nombre text not null,
  sede_id uuid not null references sedes (id),
  rol text not null check (rol in ('lider', 'integrante')),
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ==================== CATÁLOGO ====================
create table productos (
  id uuid primary key default gen_random_uuid(),
  sku_padre text not null unique,
  referencia text not null,
  descripcion text,
  categoria text,
  genero text,
  marca text,
  temporada text,
  estado text not null default 'activa' check (estado in ('activa', 'descontinuada', 'agotada')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table variantes (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references productos (id) on delete cascade,
  sku text not null unique,
  talla text,
  color text,
  costo numeric(12, 2) not null default 0,
  precio numeric(12, 2) not null default 0,
  precio_oferta numeric(12, 2),
  foto_url text,
  stock_minimo integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index variantes_producto_id_idx on variantes (producto_id);

-- ==================== STOCK (snapshot — nunca se edita a mano) ====================
create table stock (
  variante_id uuid not null references variantes (id) on delete cascade,
  sede_id uuid not null references sedes (id),
  cantidad integer not null default 0,
  ultima_entrada timestamptz,
  ultima_salida timestamptz,
  updated_at timestamptz not null default now(),
  primary key (variante_id, sede_id)
);

-- ==================== MOVIMIENTOS (fuente de verdad, append-only) ====================
create table movimientos (
  id uuid primary key default gen_random_uuid(),
  variante_id uuid not null references variantes (id),
  sede_id uuid not null references sedes (id),
  tipo text not null check (tipo in ('entrada', 'salida', 'ajuste', 'traslado')),
  cantidad integer not null,
  motivo text,
  canal text check (canal in ('tienda', 'online')),
  sede_destino_id uuid references sedes (id),
  monto numeric(12, 2),
  venta_id uuid,
  usuario_id uuid references personas (id),
  nota text,
  created_at timestamptz not null default now()
);
create index movimientos_variante_sede_idx on movimientos (variante_id, sede_id);
create index movimientos_venta_id_idx on movimientos (venta_id);
create index movimientos_created_at_idx on movimientos (created_at);

-- ==================== PRODUCCIÓN (tabla lista, sin UI en Fase 1) ====================
create table ordenes_produccion (
  id uuid primary key default gen_random_uuid(),
  variante_id uuid not null references variantes (id),
  sede_id uuid not null references sedes (id),
  cantidad_planeada integer not null,
  cantidad_producida integer not null default 0,
  estado text not null default 'planeada'
    check (estado in ('planeada', 'en_proceso', 'completada', 'cancelada')),
  fecha_inicio date,
  fecha_fin date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table bom_items (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references productos (id) on delete cascade,
  insumo text not null,
  cantidad_requerida numeric(12, 4) not null,
  unidad text not null,
  created_at timestamptz not null default now()
);

-- ==================== COMPRAS (tabla lista, sin UI en Fase 1) ====================
create table ordenes_compra (
  id uuid primary key default gen_random_uuid(),
  proveedor text not null,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'confirmada', 'recibida', 'cancelada')),
  sede_destino_id uuid not null references sedes (id),
  fecha date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table ordenes_compra_items (
  id uuid primary key default gen_random_uuid(),
  orden_id uuid not null references ordenes_compra (id) on delete cascade,
  variante_id uuid not null references variantes (id),
  cantidad integer not null,
  costo_unitario numeric(12, 2) not null
);
