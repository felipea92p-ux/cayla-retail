-- ============================================================================
-- 20260924235000 — Plan de cuentas, tasa de IGV y categorías de gasto (ADR-0195 F2; rescata ADR-0117/0120 del PR #170)
--
-- EL PROBLEMA PRIMERO
--   Para registrar un gasto hay que decir QUÉ fue (luz, alquiler, contador) y eso tiene que caer siempre en la misma
--   cuenta contable, sin que nadie la elija: si la cuenta la tipea cada quien, el Estado de Resultados sale distinto
--   según quién registró. Esta migración pone las tres piezas fijas sobre las que se apoya todo Finanzas:
--
--   1. `cuentas`: el plan de cuentas de CAYLA (~30, una por CONCEPTO, no por sede: la sede es una etiqueta del asiento).
--   2. `parametros_tributarios` + `fn_tasa_igv(fecha)`: la tasa de IGV con su fecha de vigencia. Nunca se edita: si
--      SUNAT la cambia, se agrega una fila nueva y lo pasado sigue calculándose con la suya.
--   3. `categorias_gasto`: la LISTA CERRADA de lo que se puede registrar como gasto, cada una con su cuenta. Es la única
--      casa de «esta categoría va a esta cuenta».
--
-- DECISIONES (ADR-0117, ajustadas en ADR-0195)
--   · Sin categoría «Otros», a propósito: un cajón de sastre es como se pudren los vocabularios. Si un gasto no calza,
--     falta una categoría y se agrega con una migración.
--   · Sin «Personal y planilla» (estaba en el PR #170): la planilla se LEE de Dynamic (D-33). Registrarla aquí la
--     contaría dos veces en el Estado de Resultados.
--   · Se suman tres que el negocio sí paga y el PR #170 no tenía: asesoría y honorarios (el contador, con recibo por
--     honorarios), gastos bancarios (comisiones, y en F3 la del POS) y tributos y licencias (arbitrios, licencia).
--   · PROVISIONAL: las cuentas del PCGE esperan la confirmación del contador. Corregir una es un `update` aquí; los
--     gastos guardan la CATEGORÍA, no la cuenta, así que ningún gasto registrado se toca.
--
-- PERMISOS
--   RLS encendido y SIN políticas (lección del 2026-09-24, CLAUDE.md «Políticas y deadlocks»): nadie lee estas tablas
--   directo; la pantalla las pide por `fn_categorias_gasto()`. No toca ninguna tabla que ya use la tienda: se pega en
--   una sola ejecución, en cualquier momento.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. Plan de cuentas ----------
create table if not exists retail.cuentas (
  codigo text primary key check (codigo ~ '^[0-9]{2,4}$'),
  nombre text not null check (trim(nombre) <> ''),
  tipo text not null check (tipo in ('activo', 'pasivo', 'patrimonio', 'ingreso', 'gasto')),
  -- Dónde cae en el Estado de Resultados. Null = no aparece (cuentas de balance).
  seccion_resultados text check (seccion_resultados in ('ventas', 'costo_ventas', 'fletes', 'mermas', 'gastos_operacion')),
  activo boolean not null default true,
  orden integer not null,
  constraint cuentas_seccion_coherente check (seccion_resultados is null or tipo in ('ingreso', 'gasto'))
);
comment on table retail.cuentas is
  'Plan de cuentas de CAYLA (PCGE): una por concepto, no por sede. La cuenta de un gasto sale de su categoría (categorias_gasto). Provisional hasta que el contador lo confirme.';

insert into retail.cuentas (codigo, nombre, tipo, seccion_resultados, orden) values
  ('101',  'Caja',                                      'activo',     null,               1),
  ('104',  'Cuentas corrientes (banco)',                'activo',     null,               2),
  ('105',  'Medios de pago en tránsito',                'activo',     null,               3),
  ('201',  'Mercaderías',                               'activo',     null,               4),
  ('211',  'Productos terminados',                      'activo',     null,               5),
  ('335',  'Muebles y enseres',                         'activo',     null,               6),
  ('336',  'Equipos diversos',                          'activo',     null,               7),
  ('4011', 'IGV — cuenta corriente',                    'pasivo',     null,               8),
  ('4017', 'Impuesto a la renta',                       'pasivo',     null,               9),
  ('41',   'Remuneraciones por pagar',                  'pasivo',     null,              10),
  ('421',  'Facturas por pagar',                        'pasivo',     null,              11),
  ('50',   'Capital',                                   'patrimonio', null,              12),
  ('591',  'Utilidades no distribuidas',                'patrimonio', null,              13),
  ('7011', 'Ventas de mercadería',                      'ingreso',    'ventas',          14),
  ('7012', 'Ventas de producción propia (Taller)',      'ingreso',    'ventas',          15),
  ('711',  'Variación de productos terminados',         'ingreso',    null,              16),
  ('691',  'Costo de ventas',                           'gasto',      'costo_ventas',    17),
  ('609',  'Costos vinculados con las compras (flete)', 'gasto',      'fletes',          18),
  ('659',  'Desmedros y otros (mermas)',                'gasto',      'mermas',          19),
  ('62',   'Gastos de personal',                        'gasto',      'gastos_operacion', 20),
  ('631',  'Transporte',                                'gasto',      'gastos_operacion', 21),
  ('632',  'Asesoría y consultoría',                    'gasto',      'gastos_operacion', 22),
  ('634',  'Mantenimiento y reparaciones',              'gasto',      'gastos_operacion', 23),
  ('635',  'Alquileres',                                'gasto',      'gastos_operacion', 24),
  ('636',  'Servicios básicos',                         'gasto',      'gastos_operacion', 25),
  ('637',  'Publicidad',                                'gasto',      'gastos_operacion', 26),
  ('639',  'Otros servicios de terceros (bancarios)',   'gasto',      'gastos_operacion', 27),
  ('64',   'Gastos por tributos',                       'gasto',      'gastos_operacion', 28),
  ('651',  'Seguros',                                   'gasto',      'gastos_operacion', 29),
  ('656',  'Suministros',                               'gasto',      'gastos_operacion', 30)
on conflict (codigo) do nothing;

-- ---------- 2. Tasa de IGV con vigencia ----------
create table if not exists retail.parametros_tributarios (
  nombre text not null check (nombre in ('igv')),
  vigente_desde date not null,
  valor numeric(6, 4) not null check (valor > 0 and valor < 1),
  nota text,
  created_at timestamptz not null default now(),
  primary key (nombre, vigente_desde)
);
comment on table retail.parametros_tributarios is
  'Tasas con fecha de vigencia. No se editan ni se borran: un cambio de tasa es una fila nueva, y lo pasado se sigue calculando con la suya.';

insert into retail.parametros_tributarios (nombre, vigente_desde, valor, nota)
values ('igv', '2011-03-01', 0.1800, 'IGV 16 % + IPM 2 %')
on conflict (nombre, vigente_desde) do nothing;

create or replace function retail.fn_parametros_tributarios_inmutable() returns trigger
language plpgsql set search_path = retail, public, extensions as $$
begin
  raise exception 'Un parámetro tributario no se edita ni se borra: se agrega una tasa nueva con su fecha de vigencia.'
    using errcode = 'P0001';
end $$;
create or replace trigger parametros_tributarios_solo_agregar
  before update or delete on retail.parametros_tributarios
  for each row execute function retail.fn_parametros_tributarios_inmutable();

create or replace function retail.fn_tasa_igv(p_fecha date) returns numeric
language plpgsql stable security definer set search_path = retail, public, extensions as $$
declare v numeric;
begin
  select valor into v from retail.parametros_tributarios
   where nombre = 'igv' and vigente_desde <= p_fecha
   order by vigente_desde desc limit 1;
  if v is null then
    raise exception 'No hay tasa de IGV vigente para el %.', p_fecha using errcode = 'P0001';
  end if;
  return v;
end $$;
comment on function retail.fn_tasa_igv(date) is 'La tasa de IGV vigente en una fecha (0.18 hoy). La usan los gastos con factura para calcular el IGV del total.';

-- ---------- 3. Categorías de gasto: lista cerrada, cada una con su cuenta ----------
create table if not exists retail.categorias_gasto (
  codigo text primary key check (codigo ~ '^[a-z_]+$'),
  nombre text not null check (trim(nombre) <> ''),
  -- Ejemplos en palabras de la tienda, para elegir sin dudar («Luz, agua, internet»).
  ejemplos text not null default '',
  cuenta_pcge text not null references retail.cuentas (codigo),
  activo boolean not null default true,
  orden integer not null
);
comment on table retail.categorias_gasto is
  'Lista CERRADA de lo que se registra como gasto, con su cuenta contable. Sin «Otros» ni «Planilla» (la planilla se lee de Dynamic). Un gasto guarda la categoría, no la cuenta.';

insert into retail.categorias_gasto (codigo, nombre, ejemplos, cuenta_pcge, orden) values
  ('alquileres',        'Alquileres',                    'Alquiler del local, del almacén',                    '635', 1),
  ('servicios_basicos', 'Servicios básicos',             'Luz, agua, teléfono, internet',                      '636', 2),
  ('transporte',        'Transporte y movilidad',        'Mototaxi, taxi, envíos de encomiendas',              '631', 3),
  ('suministros',       'Suministros y útiles',          'Bolsas, papel, útiles de oficina, limpieza',         '656', 4),
  ('mantenimiento',     'Mantenimiento y reparaciones',  'Reparar un mueble, pintar, un técnico',              '634', 5),
  ('publicidad',        'Publicidad y marketing',        'Anuncios en redes, volantes, fotos de campaña',      '637', 6),
  ('asesoria',          'Asesoría y honorarios',         'Contador, abogado, un diseñador',                    '632', 7),
  ('gastos_bancarios',  'Comisiones y gastos bancarios', 'Mantenimiento de cuenta, comisiones, ITF',           '639', 8),
  ('tributos',          'Tributos y licencias',          'Arbitrios, licencia de funcionamiento, Defensa Civil', '64', 9),
  ('seguros',           'Seguros',                       'Seguro del local, de la mercadería',                 '651', 10)
on conflict (codigo) do nothing;

-- Para la pantalla: las categorías activas con su cuenta. La lee quien ve Gastos (o el líder).
create or replace function retail.fn_categorias_gasto()
returns table (codigo text, nombre text, ejemplos text, cuenta text, cuenta_nombre text)
language sql stable security definer set search_path = retail, public, extensions as $$
  select c.codigo, c.nombre, c.ejemplos, c.cuenta_pcge, k.nombre
    from retail.categorias_gasto c join retail.cuentas k on k.codigo = c.cuenta_pcge
   where c.activo
   order by c.orden;
$$;
comment on function retail.fn_categorias_gasto() is 'Las categorías de gasto activas, con su cuenta. Solo es una lista fija: no filtra por permiso.';

-- ---------- Permisos: nada se lee ni se escribe por fuera de las funciones ----------
alter table retail.cuentas enable row level security;
alter table retail.parametros_tributarios enable row level security;
alter table retail.categorias_gasto enable row level security;
revoke all on retail.cuentas, retail.parametros_tributarios, retail.categorias_gasto from public, anon, authenticated;

revoke all on function retail.fn_tasa_igv(date) from public, anon;
revoke all on function retail.fn_categorias_gasto() from public, anon;
revoke all on function retail.fn_parametros_tributarios_inmutable() from public, anon, authenticated;
grant execute on function retail.fn_tasa_igv(date) to authenticated;
grant execute on function retail.fn_categorias_gasto() to authenticated;

reset lock_timeout;
