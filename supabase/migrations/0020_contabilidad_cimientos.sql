-- ============================================================================
-- Fase 1 del motor contable de CAYLA — CIMIENTOS
-- Decisiones bloqueadas con Felipe (discovery jul-2026, ver memoria
-- politicas-contables-cayla): plan de cuentas simple mapeado al PCGE (NIIF),
-- unidades de negocio como centros de resultado, IGV día 1, partida doble
-- automática por detrás, Taller como unidad con margen, CAYLA Corporativo.
--
-- Esta migración crea SOLO la estructura: la unidad Corporativo, el plan de
-- cuentas (35 cuentas sembradas) y el libro diario de partida doble (inmutable,
-- cuadre forzado por la base). Los RPC de registro simple llegan en la Fase 2.
-- ============================================================================

-- ==================== 1. UNIDAD "CAYLA CORPORATIVO" ====================
-- Reutilizamos `sedes` como la dimensión de unidad de negocio (la etiqueta que ya
-- llevan todos los movimientos), en vez de inventar una tabla paralela. Corporativo
-- guarda lo compartido (banco corporativo, socios) sin ensuciar tiendas ni taller.
alter table sedes drop constraint sedes_tipo_check;
alter table sedes add constraint sedes_tipo_check
  check (tipo in ('tienda', 'fabrica', 'almacen', 'corporativo'));

alter table sedes drop constraint sedes_codigo_check;
alter table sedes add constraint sedes_codigo_check
  check (codigo in ('TRU', 'AQP', 'LIM', 'TALLER', 'TRU-ALM', 'AQP-ALM', 'LIM-ALM', 'CORP'));

insert into sedes (codigo, nombre, tipo) values
  ('CORP', 'CAYLA Corporativo', 'corporativo')
on conflict (codigo) do nothing;

-- ==================== 2. PLAN DE CUENTAS ====================
-- Una sola lista para TODAS las unidades (la unidad es una etiqueta en el asiento).
-- `codigo` = código PCGE (oficial SUNAT / NIIF). `naturaleza` = saldo normal.
-- `es_contra` = cuenta que resta de su grupo (depreciación acumulada).
create table cuentas_contables (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  elemento text not null check (elemento in ('activo', 'pasivo', 'patrimonio', 'ingreso', 'gasto')),
  naturaleza text not null check (naturaleza in ('deudora', 'acreedora')),
  es_contra boolean not null default false,
  explicacion text not null,
  orden integer not null default 0,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger cuentas_contables_set_updated_at before update on cuentas_contables
  for each row execute function fn_set_updated_at();

insert into cuentas_contables (codigo, nombre, elemento, naturaleza, es_contra, explicacion, orden) values
  -- ① ACTIVO — lo que la empresa tiene
  ('101',  'Caja',                       'activo', 'deudora',   false, 'Efectivo físico en tienda o taller.', 10),
  ('104',  'Bancos',                     'activo', 'deudora',   false, 'Tus cuentas BBVA, Interbank, BCP.', 20),
  ('121',  'Clientes por cobrar',        'activo', 'deudora',   false, 'Ventas al crédito o a mayoristas que aún no pagan.', 30),
  ('168',  'Depósitos en garantía',      'activo', 'deudora',   false, 'Garantía del almacén, alquileres pagados por adelantado.', 40),
  ('201',  'Mercadería (tienda)',        'activo', 'deudora',   false, 'Prendas compradas listas para vender en tienda.', 50),
  ('211',  'Productos terminados (Taller)','activo','deudora',  false, 'Prendas que el Taller ya fabricó.', 60),
  ('231',  'Productos en proceso',       'activo', 'deudora',   false, 'Producción a medio hacer (cortado, sin coser).', 70),
  ('241',  'Materias primas',            'activo', 'deudora',   false, 'Telas.', 80),
  ('252',  'Suministros',                'activo', 'deudora',   false, 'Hilos, botones, avíos.', 90),
  ('333',  'Maquinaria y equipo',        'activo', 'deudora',   false, 'Máquinas de coser, remalladoras, cortadora.', 100),
  ('336',  'Equipos de cómputo',         'activo', 'deudora',   false, 'Mac mini, monitor, cámara.', 110),
  ('335',  'Muebles y enseres',          'activo', 'deudora',   false, 'Mesas de corte, sillas, maniquíes.', 120),
  ('391',  'Depreciación acumulada',     'activo', 'acreedora', true,  'El desgaste acumulado de máquinas y equipos (resta del activo).', 130),
  -- ② PASIVO — lo que la empresa debe
  ('421',  'Proveedores por pagar',      'pasivo', 'acreedora', false, 'Telas o mercadería comprada al crédito.', 140),
  ('411',  'Sueldos por pagar',          'pasivo', 'acreedora', false, 'Remuneraciones pendientes de pago.', 150),
  ('4011', 'IGV por pagar',              'pasivo', 'acreedora', false, 'Impuesto general a las ventas a liquidar con SUNAT.', 160),
  ('4017', 'Renta por pagar',            'pasivo', 'acreedora', false, 'Impuesto a la renta pendiente.', 170),
  ('451',  'Préstamos bancarios',        'pasivo', 'acreedora', false, 'Interbank, Reactiva u otros préstamos.', 180),
  ('442',  'Cuentas por pagar a socios', 'pasivo', 'acreedora', false, 'Dividendos o aportes por devolver a los socios.', 190),
  -- ③ PATRIMONIO — lo que es de los dueños
  ('501',  'Capital',                    'patrimonio', 'acreedora', false, 'Aporte de los socios / capital de apertura de la unidad.', 200),
  ('591',  'Resultados acumulados',      'patrimonio', 'acreedora', false, 'Utilidades o pérdidas de años anteriores.', 210),
  ('891',  'Resultado del ejercicio',    'patrimonio', 'acreedora', false, 'Utilidad o pérdida del año en curso (se calcula al cierre).', 220),
  -- ④ INGRESOS — lo que entra por vender
  ('701',  'Ventas de mercadería',       'ingreso', 'acreedora', false, 'Lo que las tiendas venden a las clientas.', 230),
  ('702',  'Ventas del Taller',          'ingreso', 'acreedora', false, 'Lo que el Taller "vende" a las tiendas, a su precio.', 240),
  ('759',  'Otros ingresos',             'ingreso', 'acreedora', false, 'Ingresos fuera del giro (intereses, etc.).', 250),
  -- ⑤ COSTOS Y GASTOS — lo que cuesta operar
  ('691',  'Costo de ventas',            'gasto', 'deudora', false, 'Lo que costó la mercadería que se vendió.', 260),
  ('601',  'Compras',                    'gasto', 'deudora', false, 'Mercadería y materias primas compradas.', 270),
  ('609',  'Flete de compra',            'gasto', 'deudora', false, 'Transporte de la mercadería (va dentro del margen, no es gasto de operación).', 280),
  ('621',  'Sueldos y cargas',           'gasto', 'deudora', false, 'Personal de tienda y de producción.', 290),
  ('635',  'Alquileres',                 'gasto', 'deudora', false, 'Locales de tienda y taller.', 300),
  ('636',  'Servicios básicos',          'gasto', 'deudora', false, 'Luz, agua, internet.', 310),
  ('632',  'Confección tercerizada',     'gasto', 'deudora', false, 'Costureros externos.', 320),
  ('639',  'Comisiones POS / Yape',      'gasto', 'deudora', false, 'Lo que cobran por cada cobro electrónico.', 330),
  ('659',  'Otros gastos de gestión',    'gasto', 'deudora', false, 'Lo que no cae en las categorías de arriba.', 340),
  ('681',  'Depreciación del mes',       'gasto', 'deudora', false, 'El desgaste de las máquinas cargado al mes.', 350)
on conflict (codigo) do nothing;

-- ==================== 3. LIBRO DIARIO (partida doble, inmutable) ====================
-- Cada asiento pertenece a una unidad y tiene N líneas debe/haber. La base FUERZA
-- que cuadre (Σdebe = Σhaber) — un asiento descuadrado es un estado imposible.
create table asientos (
  id uuid primary key default gen_random_uuid(),
  fecha date not null default current_date,
  unidad_id uuid not null references sedes (id),
  glosa text not null,
  origen text not null default 'manual'
    check (origen in ('apertura', 'manual', 'venta', 'compra', 'gasto', 'deposito',
                      'despacho', 'depreciacion', 'cierre', 'ajuste')),
  referencia_tipo text,
  referencia_id uuid,
  creado_por uuid references personas (id),
  created_at timestamptz not null default now()
);
create index asientos_unidad_fecha_idx on asientos (unidad_id, fecha);
create index asientos_referencia_idx on asientos (referencia_tipo, referencia_id);

create table asiento_lineas (
  id uuid primary key default gen_random_uuid(),
  asiento_id uuid not null references asientos (id) on delete cascade,
  cuenta_id uuid not null references cuentas_contables (id),
  debe numeric(14, 2) not null default 0 check (debe >= 0),
  haber numeric(14, 2) not null default 0 check (haber >= 0),
  glosa text,
  -- estado imposible: una línea no puede tener debe Y haber, ni ambos en cero.
  constraint linea_debe_xor_haber check ((debe > 0 and haber = 0) or (haber > 0 and debe = 0))
);
create index asiento_lineas_asiento_idx on asiento_lineas (asiento_id);
create index asiento_lineas_cuenta_idx on asiento_lineas (cuenta_id);

-- El cuadre se valida al FINAL de la transacción (deferrable): el RPC inserta el
-- encabezado y todas las líneas juntos, y recién al confirmar se comprueba que cuadre.
create or replace function fn_asiento_cuadra()
returns trigger
language plpgsql
as $$
declare
  v_asiento uuid;
  v_debe numeric(14, 2);
  v_haber numeric(14, 2);
begin
  v_asiento := coalesce(new.asiento_id, old.asiento_id);
  select coalesce(sum(debe), 0), coalesce(sum(haber), 0)
    into v_debe, v_haber
    from asiento_lineas where asiento_id = v_asiento;
  if round(v_debe, 2) <> round(v_haber, 2) then
    raise exception 'Asiento % descuadrado: debe=% ≠ haber=%', v_asiento, v_debe, v_haber;
  end if;
  return null;
end;
$$;

create constraint trigger asiento_lineas_cuadra
  after insert or update or delete on asiento_lineas
  deferrable initially deferred
  for each row execute function fn_asiento_cuadra();

-- ==================== 4. RLS ====================
alter table cuentas_contables enable row level security;
alter table asientos enable row level security;
alter table asiento_lineas enable row level security;

-- Plan de cuentas: todos los autenticados lo leen (lo necesitan al registrar);
-- solo el Líder lo edita (agregar, renombrar cuentas).
create policy cuentas_select_autenticado on cuentas_contables for select
  using (auth.role() = 'authenticated');
create policy cuentas_insert_lider on cuentas_contables for insert with check (fn_es_lider());
create policy cuentas_update_lider on cuentas_contables for update using (fn_es_lider());

-- Libro diario: Líder ve todo; Encargada ve solo los asientos de SU sede.
-- No hay política de INSERT/UPDATE/DELETE a propósito: el libro es inmutable para
-- los clientes; las escrituras entran solo por los RPC (security definer, Fase 2),
-- que corren como dueño de la tabla y así garantizan asientos siempre cuadrados.
create policy asientos_select_lider on asientos for select using (fn_es_lider());
create policy asientos_select_propia_sede on asientos for select
  using (unidad_id = fn_sede_actual_persona());

create policy lineas_select_lider on asiento_lineas for select using (fn_es_lider());
create policy lineas_select_propia_sede on asiento_lineas for select
  using (exists (select 1 from asientos a
                 where a.id = asiento_lineas.asiento_id
                   and a.unidad_id = fn_sede_actual_persona()));
