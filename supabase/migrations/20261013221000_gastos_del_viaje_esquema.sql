-- Gastos del viaje, fase 6 · actividad 3 (ADR-0362, decisiones 20, 26, 55 y 57; respuestas de Felipe del 2026-10-13): el esquema.
--
-- EL PROBLEMA PRIMERO. Quien viaja a comprar paga cosas que no son la mercadería: el flete y la agencia que la traen, el cargador, el
-- embalaje; y su propio viaje: pasaje, hotel, comida, taxi. Hoy no hay dónde anotarlas junto a la compra (el Estado de resultados lo
-- dice en su línea de fletes: «Todavía no hay dónde registrar el flete de una compra»), y si se anotan como un gasto suelto nadie ve
-- cuánto costó traer cada orden. Y nunca deben entrar al costo de la prenda (decisión 20).
--
-- QUÉ CREA
--   1. Dos categorías de gasto: «Traer la mercadería» (609, la línea de fletes del Estado de resultados) y «Viaje de compra» (631,
--      gastos de operación). Un gasto del viaje ES un gasto (`retail.gastos`): sale en Finanzas ▸ Gastos, en el Diario y en el Estado
--      de resultados como cualquier otro, y no toca `variantes.costo`.
--   2. `gastos_viaje`: la ficha de viaje de un gasto (1 a 1): qué fue (para traer la mercadería o del viaje), el concepto y el papel que
--      lo sustenta. Sin comprobante solo se acepta taxi o cargador, con planilla de movilidad (decisión 55); el tope diario lo fija el
--      contador y todavía no existe (Felipe 2026-10-13: «sin tope hasta el contador»; cuando exista, lo que pase se deja y se marca «no
--      deducible», como el efectivo de S/ 2 000).
--   3. `gastos_viaje_ordenes`: a qué órdenes de compra va el gasto y cuánto le toca a cada una (Felipe 2026-10-13: una o varias; con
--      varias, se reparte según el total de cada orden). Con eso cada orden dice «Traerla costó S/ X».
--
-- DESCARTÉ
--   · Columnas nuevas en `retail.gastos`: es una tabla en uso de todo Finanzas, y lo del viaje es una ficha aparte (un gasto de Finanzas
--     no tiene concepto de viaje ni órdenes).
--   · Crear la factura de un gasto del viaje como comprobante de compra (con su proveedor y su IGV), como hace Finanzas ▸ Gastos: le
--     pediría a quien está en Gamarra dar de alta al proveedor. Se guarda el papel (tipo, serie y número, RUC) para el contador; el IGV de
--     una factura es de la actividad de contabilidad (fase 6 · 8), provisional hasta que el contador diga.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). Una parte, ANTES de 20261013222000: dos tablas nuevas (RLS encendido y sin políticas:
-- solo se leen y se escriben por funciones security definer) y dos filas de categorías. Sin `alter` de tablas en uso, sin políticas,
-- sin `drop trigger` (ADR-0195). Idempotente.

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. Las dos categorías ----------
insert into retail.categorias_gasto (codigo, nombre, ejemplos, cuenta_pcge, activo, orden) values
  ('traer_mercaderia', 'Traer la mercadería', 'Flete, agencia, cargador o embalaje de una compra', '609', true, 12),
  ('viaje_compra', 'Viaje de compra', 'Pasaje, hotel, comida y taxi de quien viaja a comprar', '631', true, 13)
on conflict (codigo) do nothing;

-- ---------- 2. La ficha de viaje de un gasto ----------
create table if not exists retail.gastos_viaje (
  gasto_id uuid primary key references retail.gastos (id),
  -- 'mercaderia': lo que trae la compra (609); 'viaje': el viaje de quien compra (631).
  tipo text not null check (tipo in ('mercaderia', 'viaje')),
  concepto text not null check (concepto in ('flete', 'agencia', 'cargador', 'embalaje', 'pasaje', 'hotel', 'comida', 'taxi', 'otro')),
  -- El papel que lo sustenta. La planilla de movilidad es el «sin comprobante» de la decisión 55.
  papel text not null check (papel in ('boleta', 'factura', 'ticket', 'planilla_movilidad')),
  serie_numero text check (serie_numero is null or length(btrim(serie_numero)) between 1 and 40),
  ruc_emisor text check (ruc_emisor is null or ruc_emisor ~ '^[0-9]{11}$'),
  created_at timestamptz not null default now(),
  constraint gastos_viaje_concepto_del_tipo check (
    (tipo = 'mercaderia' and concepto in ('flete', 'agencia', 'cargador', 'embalaje', 'otro'))
    or (tipo = 'viaje' and concepto in ('pasaje', 'hotel', 'comida', 'taxi', 'otro'))),
  constraint gastos_viaje_planilla_solo_movilidad check (papel <> 'planilla_movilidad' or concepto in ('taxi', 'cargador')),
  constraint gastos_viaje_planilla_sin_papel check (papel <> 'planilla_movilidad' or (serie_numero is null and ruc_emisor is null))
);
comment on table retail.gastos_viaje is
  'ADR-0362 fase 6: la ficha de viaje de un gasto (1 a 1 con retail.gastos): para traer la mercadería (609) o del viaje (631), el concepto y el papel. Sin comprobante solo taxi o cargador, con planilla de movilidad (decisión 55). Solo la escribe registrar_gasto_viaje.';
alter table retail.gastos_viaje enable row level security;

-- ---------- 3. A qué órdenes va ----------
create table if not exists retail.gastos_viaje_ordenes (
  gasto_id uuid not null references retail.gastos_viaje (gasto_id),
  orden_compra_id uuid not null references retail.ordenes_compra (id),
  -- Lo que le toca a esta orden: con varias, según el total de cada una; la suma es el monto del gasto.
  monto numeric(12, 2) not null check (monto > 0),
  primary key (gasto_id, orden_compra_id)
);
comment on table retail.gastos_viaje_ordenes is
  'ADR-0362 fase 6: lo que le toca a cada orden de compra de un gasto del viaje (con varias, según el total de cada orden). Con esto cada orden dice «Traerla costó S/ X». Solo la escribe registrar_gasto_viaje.';
create index if not exists gastos_viaje_ordenes_orden_idx on retail.gastos_viaje_ordenes (orden_compra_id);
alter table retail.gastos_viaje_ordenes enable row level security;

revoke all on table retail.gastos_viaje, retail.gastos_viaje_ordenes from anon, authenticated;

reset lock_timeout;
