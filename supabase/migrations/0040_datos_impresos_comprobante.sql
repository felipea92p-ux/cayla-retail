-- Datos que necesita el comprobante IMPRESO (PDF A4 y ticket térmico).
--
-- Viene de la rama `claude/electronic-receipt-structure-29400a`
-- (`0034_estructura_comprobante_electronico.sql`), reconciliada contra main.
-- De aquella migración se conserva SOLO lo que main no tiene y no choca:
-- la dirección fiscal por sede y la configuración de la empresa.
--
-- Lo que se DESCARTÓ a propósito, y por qué: aquella migración también creaba
-- una tabla `comprobante_items` y redefinía `emitir_comprobante` para
-- recalcular los montos desde esas líneas. Main ya resolvió ese mismo problema
-- antes y distinto: `comprobantes.items` como jsonb (`0037`, ADR-0009), que es
-- de lo que depende el conector de Lucode para transmitir a SUNAT. Dos modelos
-- para lo mismo no pueden convivir — gana el que ya está en producción y del
-- que cuelga la transmisión. El código de impresión se adaptó a leer ese jsonb.

-- ==================== SEDES: dirección del punto de emisión ====================
alter table sedes
  add column if not exists direccion text,
  add column if not exists ubigeo text,
  add column if not exists departamento text,
  add column if not exists provincia text,
  add column if not exists distrito text,
  add column if not exists telefono text;

comment on column sedes.ubigeo is 'Código de ubigeo INEI (6 dígitos), el que exige el formato de comprobante electrónico SUNAT.';

-- Dato real de la sede de Trujillo, tomado de un comprobante ya emitido. Las
-- demás sedes quedan vacías a propósito: el PDF muestra el campo en blanco
-- antes que un dato inventado.
update sedes set
  direccion = 'LT. 26 MZ. Q URB. SAN ANDRES V ETAPA',
  ubigeo = '130111',
  departamento = 'La Libertad',
  provincia = 'Trujillo',
  distrito = 'Victor Larco Herrera',
  telefono = '+51953585537'
where codigo = 'TRU';

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
