-- ============================================================================
-- 23 — Datos del comprobante IMPRESO (producción)
-- Equivale a supabase/migrations/0040_datos_impresos_comprobante.sql, con el
-- prefijo `retail.` que exige el SQL Editor del proyecto unificado (CLAUDE.md).
-- Pegar COMPLETO en el SQL Editor de producción.
--
-- Sin esto, `/api/comprobantes/<id>/pdf` y la vista de ticket responden 404:
-- `getComprobanteCompleto` no encuentra `configuracion_empresa` y devuelve null.
--
-- OJO — por qué la dirección fiscal NO son columnas de `retail.sedes`:
-- `retail.sedes` es una VISTA puente sobre las sedes de cayla-dynamic, no una
-- tabla. Un `alter table retail.sedes add column` falla ahí. Y agregarle las
-- columnas a la tabla base de Dynamic sería que retail le mueva el modelo a
-- otro producto para resolver un problema propio. Por eso los datos fiscales
-- viven en su propia tabla dentro de `retail`, referenciando la sede por id.
-- ============================================================================

-- ==================== DATOS FISCALES POR SEDE ====================
-- Sin FK contra `retail.sedes`: no se puede referenciar una vista. La
-- integridad la da el flujo de la app (el id sale siempre de la propia vista).
create table if not exists retail.sede_datos_fiscales (
  sede_id uuid primary key,
  direccion text,
  ubigeo text,
  departamento text,
  provincia text,
  distrito text,
  telefono text,
  updated_at timestamptz not null default now()
);

comment on column retail.sede_datos_fiscales.ubigeo is 'Código de ubigeo INEI (6 dígitos), el que exige el formato de comprobante electrónico SUNAT.';

-- Dato real de Trujillo, tomado de un comprobante ya emitido. Las demás sedes
-- quedan sin fila a propósito: el impreso muestra el campo en blanco antes que
-- un dato inventado en un documento legal.
insert into retail.sede_datos_fiscales (sede_id, direccion, ubigeo, departamento, provincia, distrito, telefono)
select id, 'LT. 26 MZ. Q URB. SAN ANDRES V ETAPA', '130111', 'La Libertad', 'Trujillo', 'Victor Larco Herrera', '+51953585537'
from retail.sedes where codigo = 'TRU'
on conflict (sede_id) do nothing;

alter table retail.sede_datos_fiscales enable row level security;

drop policy if exists sede_datos_fiscales_select_autenticado on retail.sede_datos_fiscales;
create policy sede_datos_fiscales_select_autenticado on retail.sede_datos_fiscales
  for select using (auth.role() = 'authenticated');

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
-- 1. select ruc, razon_social from retail.configuracion_empresa;   -- 1 fila
-- 2. select s.codigo, f.direccion, f.ubigeo
--      from retail.sedes s left join retail.sede_datos_fiscales f on f.sede_id = s.id
--      order by s.codigo;                                          -- TRU con datos
-- ============================================================================
