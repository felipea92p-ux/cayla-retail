-- ============================================================================
-- 24 — registrar_gasto CON MÉTODO DE PAGO + SEMILLA DEL PLAN DE CUENTAS
--      + LOS 14 ÍNDICES QUE LA TRANSCRIPCIÓN DE JULIO PERDIÓ
-- Se pega en el SQL Editor de PRODUCCIÓN (proyecto de cayla-DYNAMIC,
-- vovjyyiafkxteijimpuy). Solo toca el schema `retail`.
--
-- ORDEN DE PEGADO DE ESTA TANDA:  22  →  23  →  **24**  →  25
-- Va después del 22 porque la función de abajo confía en que `retail.es_lider`
-- ya no devuelva NULL.
--
-- ---------------------------------------------------------------------------
-- QUÉ ARREGLA (3 cosas, verificadas hoy contra producción)
-- ---------------------------------------------------------------------------
--
-- (1) /finanzas/egresos NO PUEDE REGISTRAR NI UN GASTO.
--     El modal (`RegistrarGastoModal.tsx:56-64`) llama con 7 parámetros,
--     incluido `p_metodo_pago`. Producción tiene una sola firma, de 6:
--       retail.registrar_gasto(uuid, text, numeric, numeric, numeric, text)
--     y su cuerpo nunca escribe `metodo_pago`. Causa raíz: la migración local
--     `0014_gasto_metodo_pago.sql` agregó el 7º parámetro, pero
--     `07_funciones_operacion.sql` copió la versión PRE-0014 al schema `retail`,
--     y ningún archivo de unificación la corrigió después.
--     `select count(*) from retail.gastos` → 0. Egresos está desplegado y mudo.
--
--     Y el CHECK que le corresponde: `0013_finanzas_nucleo.sql:35-36` declara
--     `check (metodo_pago in ('efectivo','banco','yape','tarjeta'))`;
--     `05_operacion.sql:94` escribió solo `metodo_pago text`, sin el check.
--     Confirmado: el único CHECK sobre retail.gastos hoy es `gastos_total_check`.
--
-- (2) EL PLAN DE CUENTAS NUNCA LLEGÓ. `select count(*) from retail.cuentas_contables`
--     → 0, de las 35 que siembra `0020_contabilidad_cimientos.sql:49`. La tabla
--     existe (11 columnas, 2 políticas RLS), la semilla no: el archivo
--     `06_contabilidad_produccion.sql` creó la estructura y se olvidó del insert.
--     Es el mismo patrón del ADR-0006 (categorías), pero en la tabla contable —
--     y todavía no lo encontró nadie porque contabilidad aún no se usa. Ingresos
--     (la próxima fase del reemplazo de Alegra) se para justo encima de esto.
--
-- (3) 14 ÍNDICES PERDIDOS. Comparando `create index` de supabase/migrations/*.sql
--     contra `pg_indexes where schemaname='retail'`, faltan 14 en producción,
--     concentrados en `05` y `06` — los dos archivos transcritos a mano en julio.
--     Los del `17` (comprobantes, proformas), escrito en septiembre, sí están.
--     Verificado uno por uno hoy: los 14 faltan de verdad, y las 14 columnas
--     que indexan existen con ese nombre exacto en producción.
--
-- ---------------------------------------------------------------------------
-- POR QUÉ `drop function` Y NO `create or replace`
-- ---------------------------------------------------------------------------
-- La lección del ADR-0004, otra vez: Postgres identifica una función por nombre
-- + tipos de argumentos de ENTRADA. `create or replace` sobre una firma de 7
-- args NO reemplaza la de 6: crea una SEGUNDA función, y la llamada se vuelve
-- ambigua. Por eso el drop de la firma exacta va primero, y es obligatorio.
-- (La firma vieja se leyó de producción, no del repo:
--   select oid::regprocedure from pg_proc
--    where proname='registrar_gasto' and pronamespace='retail'::regnamespace;
--  → retail.registrar_gasto(uuid,text,numeric,numeric,numeric,text) )
--
-- ---------------------------------------------------------------------------
-- POR QUÉ LOS ÍNDICES VAN **SIN** `concurrently`
-- ---------------------------------------------------------------------------
-- `create index concurrently` no puede correr dentro de una transacción, y este
-- archivo entero es un begin/commit. Con 28 movimientos, 19 variantes, 0 gastos
-- y 0 asientos, el lock de un `create index` normal dura microsegundos: el
-- motivo para usar `concurrently` (no frenar una tabla viva y grande) no existe
-- todavía. Cuando existan millones de filas, esa decisión se revisa; hoy sería
-- cambiar una transacción atómica por un riesgo real de quedar a medias.
-- (Nota: `create index concurrently if not exists retail.<nombre>` — como
-- proponía el informe — además no compila: el nombre del índice NO se califica
-- con el schema, el schema sale de la tabla.)
--
-- REVERSIBLE: sí. La función vuelve recreando la firma de 6; el CHECK y los
-- índices se van con `drop`; la semilla es `on conflict do nothing` sobre una
-- tabla que hoy está vacía, y se borra por `codigo` si hiciera falta.
-- ============================================================================

begin;

-- ============================================================================
-- 1. EL CHECK DE metodo_pago QUE LA TRANSCRIPCIÓN PERDIÓ
--    Los 4 valores son los mismos que declara METODOS_PAGO_GASTO en
--    packages/shared/src/enums.ts:81 — un solo dominio, no dos listas paralelas.
--    NULL sigue siendo válido: los gastos anteriores a 0014 no lo tenían.
--    Idempotente a propósito (este archivo se pega a mano y debe poder repetirse).
-- ============================================================================
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'retail.gastos'::regclass
      and conname = 'gastos_metodo_pago_check'
  ) then
    alter table retail.gastos
      add constraint gastos_metodo_pago_check
      check (metodo_pago is null or metodo_pago in ('efectivo', 'banco', 'yape', 'tarjeta'));
  else
    raise notice 'gastos_metodo_pago_check ya existía — sin cambios';
  end if;
end;
$$;

-- ============================================================================
-- 2. registrar_gasto: fuera la de 6, entra la de 7
-- ============================================================================
drop function if exists retail.registrar_gasto(uuid, text, numeric, numeric, numeric, text);

-- Cuerpo tomado del que HOY corre en producción (pg_get_functiondef, 2026-09-05)
-- + el parámetro nuevo, su validación y su columna en el insert.
-- La guarda de Líder pasa a la forma que no se cae por NULL, igual que en el 22.
create or replace function retail.registrar_gasto(
  p_sede_id uuid,
  p_categoria text,
  p_subtotal numeric,
  p_igv numeric,
  p_total numeric,
  p_especificacion text default null,
  p_metodo_pago text default null
)
returns uuid
language plpgsql
security definer
set search_path = retail, public
as $$
declare
  v_persona_id uuid;
  v_gasto_id uuid;
begin
  if coalesce(retail.es_lider(), false) is not true then
    raise exception 'Solo un Líder puede registrar gastos';
  end if;
  -- El mismo dominio que el CHECK del bloque 1: acá el mensaje es legible para
  -- la persona, allá el constraint lo hace imposible aunque alguien entre por
  -- otro camino. No es duplicación: es un mensaje amable + un candado real.
  if p_metodo_pago is not null and p_metodo_pago not in ('efectivo', 'banco', 'yape', 'tarjeta') then
    raise exception 'Método de pago inválido: %', p_metodo_pago;
  end if;

  select id into v_persona_id from public.personas where auth_user_id = auth.uid();

  insert into retail.gastos (
    sede_id, categoria, subtotal, igv, total, especificacion, usuario_id, metodo_pago
  )
    values (
      p_sede_id, p_categoria, p_subtotal, p_igv, p_total, p_especificacion,
      v_persona_id, p_metodo_pago
    )
    returning id into v_gasto_id;

  return v_gasto_id;
end;
$$;

-- ============================================================================
-- 3. SEMILLA DEL PLAN DE CUENTAS — 35 cuentas
--    Copia literal de supabase/migrations/0020_contabilidad_cimientos.sql:49,
--    con prefijo `retail.`. `on conflict (codigo) do nothing` es seguro: el
--    índice único `cuentas_contables_codigo_key` ya existe en producción, así
--    que este bloque se puede repetir sin duplicar ni pisar nada.
--    `codigo` = código PCGE (oficial SUNAT / NIIF); `naturaleza` = saldo normal;
--    `es_contra` = cuenta que RESTA de su grupo (depreciación acumulada).
-- ============================================================================
insert into retail.cuentas_contables (codigo, nombre, elemento, naturaleza, es_contra, explicacion, orden) values
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

-- ============================================================================
-- 4. LOS 14 ÍNDICES PERDIDOS
--    Orden: primero los cuatro que están en el camino de las pantallas que se
--    miran a diario (caja diaria, catálogo, EERR); después el resto.
--    `if not exists` para que el archivo se pueda repetir.
-- ============================================================================

-- --- Los del camino caliente ---
-- El catálogo agrupa variantes por producto en cada carga de /catalogo.
create index if not exists variantes_producto_id_idx on retail.variantes (producto_id);
-- "Ventas de hoy" y el detalle de una venta buscan sus movimientos por venta_id.
create index if not exists movimientos_venta_id_idx on retail.movimientos (venta_id);
-- El EERR y los Balances recorren las líneas de cada asiento.
create index if not exists asiento_lineas_asiento_idx on retail.asiento_lineas (asiento_id);
create index if not exists asiento_lineas_cuenta_idx  on retail.asiento_lineas (cuenta_id);

-- --- Filtros por sede (toda pantalla de una sede empieza por acá) ---
create index if not exists gastos_sede_id_idx           on retail.gastos (sede_id);
create index if not exists cajas_sede_id_idx            on retail.cajas (sede_id);
create index if not exists lotes_sede_id_idx            on retail.lotes (sede_id);
create index if not exists depositos_bancarios_sede_idx on retail.depositos_bancarios (sede_id);

-- --- Contabilidad y patrimonio ---
create index if not exists activos_fijos_unidad_idx  on retail.activos_fijos (unidad_id);
create index if not exists asientos_unidad_fecha_idx on retail.asientos (unidad_id, fecha);
create index if not exists asientos_referencia_idx   on retail.asientos (referencia_tipo, referencia_id);

-- --- Producción (Taller) ---
create index if not exists producciones_unidad_idx   on retail.producciones (unidad_id);
create index if not exists producciones_producto_idx on retail.producciones (producto_id);
create index if not exists producciones_variante_idx on retail.producciones (variante_id);

commit;

-- ============================================================================
-- CÓMO SE VERIFICA
-- ============================================================================
-- Pegar esto DESPUÉS del commit. Las 5 columnas deben dar `true`.
--
-- select
--   -- una sola firma, y de 7 argumentos (si sale 2, quedó la sobrecarga fantasma)
--   (select count(*) = 1 and bool_and(pronargs = 7) from pg_proc
--      where pronamespace='retail'::regnamespace
--        and proname='registrar_gasto')                                as gasto_una_sola_firma_7,
--   -- el parámetro nuevo está de verdad en la firma
--   (select pg_get_function_identity_arguments(oid) ~ 'p_metodo_pago'
--      from pg_proc where pronamespace='retail'::regnamespace
--        and proname='registrar_gasto')                                as gasto_tiene_metodo_pago,
--   -- el CHECK
--   (select count(*) from pg_constraint
--      where conrelid='retail.gastos'::regclass
--        and conname='gastos_metodo_pago_check') = 1                   as check_metodo_pago,
--   -- el plan de cuentas
--   (select count(*) from retail.cuentas_contables) = 35               as plan_de_cuentas,
--   -- los 14 índices
--   (select count(*) from pg_indexes where schemaname='retail' and indexname in (
--      'variantes_producto_id_idx','movimientos_venta_id_idx','gastos_sede_id_idx',
--      'cajas_sede_id_idx','lotes_sede_id_idx','depositos_bancarios_sede_idx',
--      'activos_fijos_unidad_idx','asientos_unidad_fecha_idx','asientos_referencia_idx',
--      'asiento_lineas_asiento_idx','asiento_lineas_cuenta_idx','producciones_unidad_idx',
--      'producciones_producto_idx','producciones_variante_idx')) = 14  as indices_repuestos;
--
-- Desglose del plan de cuentas (debe sumar 35: activo 13, pasivo 6,
-- patrimonio 3, ingreso 3, gasto 10):
--   select elemento, count(*) from retail.cuentas_contables group by elemento order by 1;
--
-- PRUEBA DE NEGOCIO (la que de verdad cierra este archivo): en la app, entrar a
-- /finanzas/egresos como Líder y registrar un gasto real de S/1 en AQP con
-- método "Efectivo (sale del cajón)". Después:
--   select total, metodo_pago, especificacion from retail.gastos
--     order by created_at desc limit 1;
-- Debe traer la fila con metodo_pago='efectivo'. Hoy, antes de este archivo,
-- ese formulario devuelve error y no guarda nada.
-- ============================================================================
