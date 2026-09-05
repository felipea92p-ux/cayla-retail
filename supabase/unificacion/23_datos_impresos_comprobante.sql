-- ============================================================================
-- 23 — Datos del comprobante IMPRESO (producción)
-- Equivale a supabase/migrations/0040_datos_impresos_comprobante.sql, con el
-- prefijo `retail.` que exige el SQL Editor del proyecto unificado (CLAUDE.md).
-- Pegar COMPLETO en el SQL Editor de producción.
--
-- Sin esto, `/api/comprobantes/<id>/pdf` y la vista de ticket responden 404:
-- `getComprobanteCompleto` no encuentra `configuracion_empresa` y devuelve null.
-- ============================================================================

-- ==================== SEDES: dirección del punto de emisión ====================
alter table retail.sedes
  add column if not exists direccion text,
  add column if not exists ubigeo text,
  add column if not exists departamento text,
  add column if not exists provincia text,
  add column if not exists distrito text,
  add column if not exists telefono text;

comment on column retail.sedes.ubigeo is 'Código de ubigeo INEI (6 dígitos), el que exige el formato de comprobante electrónico SUNAT.';

-- Dato real de Trujillo, tomado de un comprobante ya emitido. Las demás sedes
-- quedan vacías a propósito: el impreso muestra el campo en blanco antes que un
-- dato inventado. Complétalas cuando tengas la dirección exacta de cada una.
update retail.sedes set
  direccion = 'LT. 26 MZ. Q URB. SAN ANDRES V ETAPA',
  ubigeo = '130111',
  departamento = 'La Libertad',
  provincia = 'Trujillo',
  distrito = 'Victor Larco Herrera',
  telefono = '+51953585537'
where codigo = 'TRU';

-- ==================== CONFIGURACIÓN DE EMPRESA (singleton) ====================
create table if not exists retail.configuracion_empresa (
  id boolean primary key default true check (id),
  ruc text not null,
  razon_social text not null,
  nombre_comercial text,
  email text,
  web text,
  telefono text,
  resolucion_autorizacion text,
  updated_at timestamptz not null default now()
);

insert into retail.configuracion_empresa (ruc, razon_social, nombre_comercial, email, web, telefono, resolucion_autorizacion)
values ('20605964550', 'CAYLA S.A.C.', 'CAYLA', 'caylaperu@gmail.com', 'www.cayla.pe', '+51953585537', '034-005-0004781')
on conflict (id) do nothing;

alter table retail.configuracion_empresa enable row level security;

-- Visible para cualquier colaborador logueado, sin política de escritura: es un
-- dato legal, cambia por migración, no desde la app.
drop policy if exists configuracion_empresa_select_autenticado on retail.configuracion_empresa;
create policy configuracion_empresa_select_autenticado on retail.configuracion_empresa
  for select using (auth.role() = 'authenticated');

-- ============================================================================
-- Verificación después de pegar:
-- 1. select ruc, razon_social from retail.configuracion_empresa;  -- 1 fila
-- 2. select codigo, direccion, ubigeo from retail.sedes order by codigo;
-- ============================================================================
