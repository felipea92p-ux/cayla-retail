-- ============================================================================
-- Producción y costeo del Taller.
-- Costeo por MARGEN DE CONTRIBUCIÓN: el costo del PRODUCTO (para decidir) es
-- solo directo = tela + avíos. La mano de obra y los gastos del taller son
-- costos de producción FIJOS del mes → van al resultado mensual del Taller, NO
-- al costo por prenda. Ver memoria taller-dinamica-produccion-cayla.
-- ============================================================================

-- Precio al que el Taller le vende a las tiendas (paridad competitiva), por variante.
alter table variantes add column if not exists precio_taller numeric(12, 2) not null default 0;

create table if not exists producciones (
  id uuid primary key default gen_random_uuid(),
  unidad_id uuid not null references sedes (id),
  variante_id uuid not null references variantes (id),
  fecha date not null default current_date,
  cantidad integer not null check (cantidad > 0),
  costo_tela numeric(12, 2) not null default 0,
  costo_avios numeric(12, 2) not null default 0,
  costo_unitario numeric(12, 2) generated always as
    (round((costo_tela + costo_avios) / cantidad, 2)) stored,
  es_muestra boolean not null default false,
  estado text not null default 'terminado' check (estado in ('en_proceso', 'terminado')),
  nota text,
  creado_por uuid references personas (id),
  created_at timestamptz not null default now()
);
create index if not exists producciones_unidad_idx on producciones (unidad_id);
create index if not exists producciones_variante_idx on producciones (variante_id);

alter table producciones enable row level security;
drop policy if exists producciones_all_lider on producciones;
drop policy if exists producciones_select_propia on producciones;
create policy producciones_all_lider on producciones for all
  using (fn_es_lider()) with check (fn_es_lider());
create policy producciones_select_propia on producciones for select
  using (unidad_id = fn_sede_actual_persona());
