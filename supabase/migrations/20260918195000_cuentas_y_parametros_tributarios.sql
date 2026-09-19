-- 20260918195000_cuentas_y_parametros_tributarios.sql — ADR-0109 (modelo) y ADR-0120 (reglas), tarea 4
--
-- DOS COSAS PEQUEÑAS QUE TODO LO CONTABLE VA A LEER
--
-- 1. `cuentas`: el plan de cuentas del manual contable (PCGE recortado). Es la ÚNICA casa de
--    "qué cuentas existen". Cada línea del diario (`fn_asientos`) apunta aquí, y la cuenta de cada
--    categoría de gasto también (FK más abajo): una cuenta inexistente es un estado imposible.
--    El manual dice "25 cuentas" y enumera 26; se siembran las 26 enumeradas.
--    NO se multiplican por sede: la sede es una etiqueta del asiento, no de la cuenta.
--
-- 2. `parametros_tributarios`: la tasa de IGV con vigencia. Hoy "1.18" está escrito a mano en más de
--    doce sitios (SQL y pantallas). Aquí nace su casa. Solo se AGREGAN filas (una tasa nueva desde
--    una fecha): el pasado no se reescribe, así un mes cerrado calculado al 18 % sigue diciendo 18 %
--    aunque mañana la tasa cambie. No hay `vigente_hasta`: la tasa de una fecha es la fila más
--    reciente cuya `vigente_desde` no la supera, y por construcción no puede haber dos a la vez.
--
-- Solo lee el líder; solo escribe una migración (no hay política de escritura y se revoca).

set search_path = retail, public, extensions;

-- ---------- 1. Plan de cuentas ----------
create table retail.cuentas (
  codigo text primary key check (codigo ~ '^[0-9]{2,4}$'),
  nombre text not null check (trim(nombre) <> ''),
  tipo text not null check (tipo in ('activo', 'pasivo', 'patrimonio', 'ingreso', 'gasto')),
  -- Dónde cae en el Estado de Resultados. NULL = no aparece (cuentas de balance).
  seccion_resultados text check (seccion_resultados in ('ventas', 'costo_ventas', 'fletes', 'mermas', 'gastos_operacion')),
  activo boolean not null default true,
  orden integer not null,
  -- Una cuenta de balance (activo, pasivo, patrimonio) no puede figurar en el Estado de Resultados.
  -- Una de resultados sí puede no figurar todavía (la 711 espera la regla 12 del Taller).
  constraint cuentas_seccion_coherente check (
    seccion_resultados is null or tipo in ('ingreso', 'gasto')
  )
);

insert into retail.cuentas (codigo, nombre, tipo, seccion_resultados, orden) values
  ('101',  'Caja',                                    'activo',     null, 1),
  ('104',  'Cuentas corrientes (banco)',              'activo',     null, 2),
  ('105',  'Medios de pago en tránsito',              'activo',     null, 3),
  ('201',  'Mercaderías',                             'activo',     null, 4),
  ('211',  'Productos terminados',                    'activo',     null, 5),
  ('335',  'Muebles y enseres',                       'activo',     null, 6),
  ('336',  'Equipos diversos',                        'activo',     null, 7),
  ('4011', 'IGV — cuenta corriente',                  'pasivo',     null, 8),
  ('4017', 'Impuesto a la renta',                     'pasivo',     null, 9),
  ('41',   'Remuneraciones por pagar',                'pasivo',     null, 10),
  ('421',  'Facturas por pagar',                      'pasivo',     null, 11),
  ('50',   'Capital',                                 'patrimonio', null, 12),
  ('591',  'Utilidades no distribuidas',              'patrimonio', null, 13),
  ('7011', 'Ventas de mercadería',                    'ingreso',    'ventas', 14),
  ('7012', 'Ventas de producción propia (Taller)',    'ingreso',    'ventas', 15),
  ('711',  'Variación de productos terminados',       'ingreso',    null, 16),
  ('691',  'Costo de ventas',                         'gasto',      'costo_ventas', 17),
  ('609',  'Costos vinculados con las compras (flete)', 'gasto',    'fletes', 18),
  ('659',  'Desmedros y otros (mermas)',              'gasto',      'mermas', 19),
  ('62',   'Gastos de personal',                      'gasto',      'gastos_operacion', 20),
  ('631',  'Transporte',                              'gasto',      'gastos_operacion', 21),
  ('634',  'Mantenimiento',                           'gasto',      'gastos_operacion', 22),
  ('635',  'Alquileres',                              'gasto',      'gastos_operacion', 23),
  ('636',  'Servicios básicos',                       'gasto',      'gastos_operacion', 24),
  ('637',  'Publicidad',                              'gasto',      'gastos_operacion', 25),
  ('656',  'Suministros',                             'gasto',      'gastos_operacion', 26);

-- ---------- 2. Tasa de IGV con vigencia ----------
create table retail.parametros_tributarios (
  nombre text not null check (nombre in ('igv')),
  vigente_desde date not null,
  valor numeric(6, 4) not null check (valor > 0 and valor < 1),
  nota text,
  created_at timestamptz not null default now(),
  primary key (nombre, vigente_desde)
);

-- 18 % (16 % de IGV + 2 % de IPM) rige desde marzo de 2011: cubre cualquier fecha con datos.
insert into retail.parametros_tributarios (nombre, vigente_desde, valor, nota)
  values ('igv', '2011-03-01', 0.1800, 'IGV 16 % + IPM 2 %');

-- Solo se agregan tasas: una fila no se edita ni se borra (un mes cerrado no debe cambiar de tasa).
create function retail.fn_parametros_tributarios_inmutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Un parámetro tributario no se edita ni se borra: se agrega una tasa nueva con su fecha de vigencia';
end;
$$;
create trigger parametros_tributarios_solo_agregar
  before update or delete on retail.parametros_tributarios
  for each row execute function retail.fn_parametros_tributarios_inmutable();

-- La tasa de IGV que rige en una fecha (aaaa-mm-dd, la de Lima). Si no hay ninguna, es un error: un
-- cálculo con una tasa inventada es peor que ninguno.
create function retail.fn_tasa_igv(p_fecha date)
returns numeric
language plpgsql
stable
set search_path = retail, public, extensions
as $$
declare v numeric;
begin
  select valor into v from retail.parametros_tributarios
   where nombre = 'igv' and vigente_desde <= p_fecha
   order by vigente_desde desc limit 1;
  if v is null then
    raise exception 'No hay tasa de IGV vigente para la fecha %', p_fecha;
  end if;
  return v;
end;
$$;

-- ---------- 3. La cuenta de cada categoría de gasto debe existir ----------
alter table retail.categorias_gasto
  add constraint categorias_gasto_cuenta_fkey foreign key (cuenta_pcge) references retail.cuentas (codigo);

-- ---------- 4. Permisos: lee el líder; nadie escribe desde la app ----------
alter table retail.cuentas enable row level security;
alter table retail.parametros_tributarios enable row level security;
create policy cuentas_select on retail.cuentas for select using (retail.fn_es_lider());
create policy parametros_tributarios_select on retail.parametros_tributarios for select using (retail.fn_es_lider());

-- 0005_grants.sql da escritura por defecto a toda tabla nueva (ADR-0119): se revoca explícito.
revoke all on retail.cuentas, retail.parametros_tributarios from authenticated, anon;
grant select on retail.cuentas, retail.parametros_tributarios to authenticated;

revoke all on function retail.fn_tasa_igv(date) from public, anon;
grant execute on function retail.fn_tasa_igv(date) to authenticated;
revoke all on function retail.fn_parametros_tributarios_inmutable() from public, anon, authenticated;

comment on table retail.cuentas is 'Plan de cuentas (PCGE recortado, manual contable). Única casa de qué cuentas existen; la sede es etiqueta del asiento, no de la cuenta.';
comment on table retail.parametros_tributarios is 'Tasas tributarias con vigencia, solo se agregan. Reemplaza el 1.18 escrito a mano en SQL y pantallas.';
