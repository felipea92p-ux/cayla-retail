-- ============================================================================
-- Registro de activos fijos (Fase 4 — control + depreciación).
-- Cada bien es una ficha: serie, valor, categoría contable, fecha, tasa. Sirve
-- para control físico (robos/seguros) y para la depreciación automática mensual.
-- Metodología NIIF + tasas SUNAT: vida útil (máq/muebles 10 años, cómputo 4),
-- valor residual (máq/muebles 10%, cómputo 5%), línea recta desde la compra.
-- ============================================================================

create table activos_fijos (
  id uuid primary key default gen_random_uuid(),
  unidad_id uuid not null references sedes (id),
  nombre text not null,
  serie text,
  descripcion text,
  cuenta_codigo text not null references cuentas_contables (codigo), -- 333 / 336 / 335
  costo numeric(14, 2) not null,
  valor_residual numeric(14, 2) not null default 0,
  vida_util_meses integer not null,
  tasa_anual numeric(5, 4) not null,                 -- 0.1000 = 10%
  fecha_adquisicion date not null,
  depreciacion_apertura numeric(14, 2) not null default 0, -- acumulada al cargar al sistema
  estado text not null default 'activo' check (estado in ('activo', 'baja', 'vendido')),
  nota text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index activos_fijos_unidad_idx on activos_fijos (unidad_id);
create trigger activos_fijos_set_updated_at before update on activos_fijos
  for each row execute function fn_set_updated_at();

-- Valor neto de un activo a hoy (para reportes): costo − apertura − lo corrido desde
-- que se cargó. En la apertura, valor_neto = costo − depreciacion_apertura.
-- (La depreciación mensual continua se posteará en la Fase 4.)

alter table activos_fijos enable row level security;
create policy activos_all_lider on activos_fijos for all
  using (fn_es_lider()) with check (fn_es_lider());
create policy activos_select_propia on activos_fijos for select
  using (unidad_id = fn_sede_actual_persona());
