-- Datos que necesita el comprobante IMPRESO (PDF A4 y ticket térmico).
--
-- Viene de la rama `claude/electronic-receipt-structure-29400a`
-- (`0034_estructura_comprobante_electronico.sql`), reconciliada contra main.
--
-- Lo que se DESCARTÓ de aquella migración, y por qué: creaba una tabla
-- `comprobante_items` y redefinía `emitir_comprobante` para recalcular los
-- montos desde esas líneas. Main ya resolvió ese mismo problema antes y
-- distinto: `comprobantes.items` como jsonb (`0037`, ADR-0009), que es de lo
-- que depende el conector de Lucode para transmitir a SUNAT. Dos modelos para
-- lo mismo no pueden convivir — gana el que ya está en producción. El código
-- de impresión se adaptó a leer ese jsonb.
--
-- Lo que se CAMBIÓ respecto de aquella migración: la dirección fiscal NO se
-- agrega como columnas de `sedes`. En producción `retail.sedes` es una VISTA
-- puente sobre las sedes de cayla-dynamic (por eso los tipos generados solo le
-- dan `Row`, sin `Insert`/`Update`): un `alter table` ahí falla, y la
-- alternativa —agregarle columnas a la tabla base de Dynamic— sería que retail
-- le mueva el modelo a otro producto para resolver un problema suyo. Por eso
-- los datos fiscales viven en su propia tabla, referenciada por sede.

-- ==================== DATOS FISCALES POR SEDE ====================
create table if not exists sede_datos_fiscales (
  sede_id uuid primary key references sedes (id),
  direccion text,
  ubigeo text,
  departamento text,
  provincia text,
  distrito text,
  telefono text,
  updated_at timestamptz not null default now()
);

comment on column sede_datos_fiscales.ubigeo is 'Código de ubigeo INEI (6 dígitos), el que exige el formato de comprobante electrónico SUNAT.';

-- Dato real de Trujillo, tomado de un comprobante ya emitido. Las demás sedes
-- quedan sin fila a propósito: el impreso muestra el campo en blanco antes que
-- un dato inventado en un documento legal.
insert into sede_datos_fiscales (sede_id, direccion, ubigeo, departamento, provincia, distrito, telefono)
select id, 'LT. 26 MZ. Q URB. SAN ANDRES V ETAPA', '130111', 'La Libertad', 'Trujillo', 'Victor Larco Herrera', '+51953585537'
from sedes where codigo = 'TRU'
on conflict (sede_id) do nothing;

alter table sede_datos_fiscales enable row level security;

drop policy if exists sede_datos_fiscales_select_autenticado on sede_datos_fiscales;
create policy sede_datos_fiscales_select_autenticado on sede_datos_fiscales
  for select using (auth.role() = 'authenticated');

-- ==================== CONFIGURACIÓN DE EMPRESA (singleton) ====================
-- Una sola fila siempre: `id boolean primary key default true check (id)` es el
-- patrón estándar de Postgres para forzar singleton sin candados extra.
create table if not exists configuracion_empresa (
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

insert into configuracion_empresa (ruc, razon_social, nombre_comercial, email, web, telefono, resolucion_autorizacion)
values ('20605964550', 'CAYLA S.A.C.', 'CAYLA', 'caylaperu@gmail.com', 'www.cayla.pe', '+51953585537', '034-005-0004781')
on conflict (id) do nothing;

alter table configuracion_empresa enable row level security;

-- Mismo patrón que el catálogo (0003_rls.sql): visible para cualquier
-- colaborador logueado, sin política de escritura — cambia solo por migración
-- porque es un dato legal, no operativo.
drop policy if exists configuracion_empresa_select_autenticado on configuracion_empresa;
create policy configuracion_empresa_select_autenticado on configuracion_empresa
  for select using (auth.role() = 'authenticated');
