-- ============================================================================
-- 0015 — Activos fijos: la única tabla con datos reales que V2 no rescató
--
-- QUÉ ARREGLA
--   El corte V1→V2 (commit 0af2f1b) dejó fuera Producción, Finanzas,
--   Comercial y Taxonomía universal porque su data en retail era de prueba —
--   confirmado contra el volcado real de producción del 2026-09-12
--   (`docs/datos/generado/retail_filas.json`, rama trix/catalogo-vocabulario):
--   `gastos`, `patrimonio_items`, `asientos`, `cuentas_contables` están en
--   CERO filas. Pero `activos_fijos` tiene **39 filas reales** — el registro
--   físico de equipos/mobiliario/máquinas del Taller, cargado una sola vez.
--   Sin esta migración, esa tabla se queda sin pantalla que la lea o la
--   edite el día que se pegue este núcleo en producción.
--
-- QUÉ SE SIMPLIFICA A PROPÓSITO
--   La versión V1 (`0022_activos_fijos.sql`) liga cada activo a
--   `cuentas_contables.codigo` — pero Contabilidad (`asientos`,
--   `cuentas_contables`) es justo una de las piezas con cero data real, y no
--   se está reconstruyendo hoy. Exigir esa FK aquí bloquearía traer los 39
--   activos reales hasta que Contabilidad exista en V2. Se deja
--   `cuenta_codigo` como texto libre (el código NIIF/SUNAT, ej. "336"),
--   documentado pero sin candado — cuando Contabilidad se reconstruya sobre
--   V2, esa migración agrega la FK real y valida lo que ya haya.
-- ============================================================================

create table retail.activos_fijos (
  id uuid primary key default gen_random_uuid(),
  ubicacion_id uuid not null references retail.ubicaciones (id),
  nombre text not null,
  serie text,
  descripcion text,
  cuenta_codigo text, -- código NIIF/SUNAT (333/335/336); sin FK hasta que Contabilidad exista en V2
  costo numeric(14, 2) not null,
  valor_residual numeric(14, 2) not null default 0,
  vida_util_meses integer not null,
  tasa_anual numeric(5, 4) not null, -- 0.1000 = 10%
  fecha_adquisicion date not null,
  depreciacion_apertura numeric(14, 2) not null default 0,
  estado text not null default 'activo' check (estado in ('activo', 'baja', 'vendido')),
  nota text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index activos_fijos_ubicacion_idx on retail.activos_fijos (ubicacion_id);

create or replace function retail.fn_activos_fijos_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger activos_fijos_set_updated_at before update on retail.activos_fijos
  for each row execute function retail.fn_activos_fijos_set_updated_at();

alter table retail.activos_fijos enable row level security;
create policy activos_fijos_select on retail.activos_fijos
  for select using (auth.role() = 'authenticated');
create policy activos_fijos_write_lider on retail.activos_fijos
  for all using (retail.fn_es_lider()) with check (retail.fn_es_lider());
