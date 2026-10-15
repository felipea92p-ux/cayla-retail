-- ============================================================================
-- 20261015145000_nos_debe_saldo_a_favor_esquema.sql — CAYLA V2 · ADR-0362, fase 5b, actividades 1 a 3 (parte 1 de 2: el esquema). Las funciones
-- van en 20261015150000_nos_debe_saldo_a_favor.sql. Contrato: docs/compras/ordenes-de-compra-2026-10/contrato-nos-debe.md.
--
-- EL PROBLEMA PRIMERO. Una deuda del proveedor («2 polos que no vinieron en la ENV-000061») solo se podía saldar con la prenda («Llegó la
-- reposición»). Si el proveedor no la va a mandar, la plata que CAYLA pagó por esas prendas no tenía por dónde volver: la decisión 58 de
-- Felipe dice que se pasa a saldo a favor con un DOCUMENTO INTERNO, al toque, que baja lo que se le debe al proveedor en el próximo pago.
--
-- QUÉ HACE (solo el esquema):
--   1. `compra_notas_credito.interna`: el documento interno es una fila más de las notas de crédito del comprobante, marcada interna. Así
--      lo que ya cuenta las notas (lo que se le debe a cada comprobante, el saldo a favor, el Balance, el 201 por recibir) lo cuenta sin
--      cambios, y lo que habla con SUNAT (Impuestos) lo deja fuera: no es un documento del proveedor. Su serie es SIEMPRE «DI-…» y la de una
--      nota del proveedor nunca (candado `compra_notas_credito_interna_serie`): las pantallas lo reconocen por su serie.
--   2. `compra_notas_internas_seq`: el número del documento interno (DI-000001), uno para toda la empresa.
--   3. La nota por faltante DEL PROVEEDOR sigue siendo una por comprobante (`compra_notas_credito_faltante_unica`), pero los documentos
--      internos no cuentan: un comprobante repartido en varios envíos puede tener varios.
--   4. `proveedor_deuda_resoluciones.nota_credito_id`: qué documento saldó con plata cada resolución. Lo que se salda con plata (a saldo a
--      favor; «Depositó», actividad 5) siempre lo tiene; la reposición nunca (`proveedor_deuda_resoluciones_con_plata`).
--   5. La cuenta puente del IGV, 4019 (actividad 2; Felipe, 2026-10-15: «cuenta puente hasta la nota 07»). El documento interno de una
--      FACTURA baja de la deuda lo que costó más su IGV, pero ese IGV no baja el crédito fiscal sin la nota de crédito del proveedor (la 07):
--      mientras no llega, queda «por regularizar» en esta cuenta. Sin la fila, el Balance no la vería (une el Diario con `cuentas`) y dejaría
--      de cuadrar. El código y el nombre son provisionales hasta que hable el contador [provisional del contrato].
--   6. La nota de crédito DEL PROVEEDOR (la 07) que respalda documentos internos de una factura (actividad 3, «Llegó su nota de crédito»):
--      `compra_notas_proveedor`, y su enlace con los documentos que respalda, `compra_notas_proveedor_documentos`. No mueve plata (eso ya lo
--      hizo el documento interno): dice qué documento de SUNAT respalda ese IGV y en qué mes baja el crédito fiscal. Una nota puede respaldar
--      varios documentos internos del mismo comprobante (el proveedor puede mandar una sola por todo lo que no llegó); cada documento, una
--      sola nota. Va en una tabla aparte porque `compra_notas_credito` no se edita (`compra_notas_credito_inmutables`) y porque una nota del
--      proveedor que no mueve plata no puede sumarse a las que sí lo hacen (el saldo del comprobante las cuenta). Se escriben y se leen solo
--      por funciones `security definer` (RLS encendido sin políticas) y no se editan ni se borran; el mes cerrado no las recibe.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). UNA parte, ANTES de 20261015150000. Sin políticas ni `drop trigger` (ADR-0195) y sin
-- `select … into` dentro de textos entre comillas (ADR-0288). Re-ejecutable. Al 2026-10-15 producción no tiene notas de crédito, deudas ni
-- cierres: los candados nuevos no tienen filas que revisar.
-- ============================================================================

set lock_timeout = '3s';

-- 1. El documento interno.
alter table retail.compra_notas_credito add column if not exists interna boolean not null default false;
comment on column retail.compra_notas_credito.interna is
  'ADR-0362 fase 5b (decisión 58): documento interno de CAYLA (DI-…), no una nota del proveedor. Baja la deuda del comprobante y deja el resto a favor como una nota; Impuestos no lo cuenta.';
alter table retail.compra_notas_credito drop constraint if exists compra_notas_credito_interna_serie;
alter table retail.compra_notas_credito add constraint compra_notas_credito_interna_serie
  check (interna = (serie_numero like 'DI-%'));

-- 2. Su número.
create sequence if not exists retail.compra_notas_internas_seq;
comment on sequence retail.compra_notas_internas_seq is 'ADR-0362 fase 5b: el número de los documentos internos (DI-000001), uno para toda la empresa.';

-- 3. Una nota por faltante del proveedor por comprobante; los documentos internos no cuentan.
drop index if exists retail.compra_notas_credito_faltante_unica;
create unique index if not exists compra_notas_credito_faltante_unica
  on retail.compra_notas_credito (compra_id) where motivo = 'faltante' and not interna;

-- 4. Qué documento saldó cada resolución con plata.
alter table retail.proveedor_deuda_resoluciones
  add column if not exists nota_credito_id uuid references retail.compra_notas_credito (id);
alter table retail.proveedor_deuda_resoluciones drop constraint if exists proveedor_deuda_resoluciones_con_plata;
alter table retail.proveedor_deuda_resoluciones add constraint proveedor_deuda_resoluciones_con_plata
  check ((forma in ('saldo_a_favor', 'deposito')) = (nota_credito_id is not null));
create index if not exists proveedor_deuda_resoluciones_nota_idx
  on retail.proveedor_deuda_resoluciones (nota_credito_id) where nota_credito_id is not null;
comment on column retail.proveedor_deuda_resoluciones.nota_credito_id is
  'ADR-0362 fase 5b: el documento interno (o la nota) con que se saldó con plata esta parte de la deuda. Nulo en la reposición.';

-- 5. La cuenta puente del IGV de los documentos internos de una factura (provisional hasta el contador).
insert into retail.cuentas (codigo, nombre, tipo, seccion_resultados, orden) values
  ('4019', 'IGV por regularizar (falta la nota de crédito del proveedor)', 'pasivo', null, 8)
on conflict (codigo) do nothing;

-- 6. La nota de crédito del proveedor que respalda documentos internos, y su enlace con ellos.
create table if not exists retail.compra_notas_proveedor (
  id uuid primary key default gen_random_uuid(),
  compra_id uuid not null references retail.compras (id),
  serie_numero text not null,
  fecha date not null,
  subtotal numeric(12, 2) not null,
  igv numeric(12, 2) not null,
  monto numeric(12, 2) not null,
  usuario_id uuid references public.personas (id),
  token_cliente uuid,
  huella text,
  created_at timestamptz not null default now(),
  -- La serie como la escribe el proveedor, en mayúsculas; nunca la de un documento interno.
  constraint compra_notas_proveedor_serie check (serie_numero = upper(btrim(serie_numero)) and serie_numero <> ''
                                                 and serie_numero not like 'DI-%' and length(serie_numero) <= 30),
  -- Respalda IGV: sin IGV no hay nada que regularizar (con boleta, el documento interno basta).
  constraint compra_notas_proveedor_cifras check (igv > 0 and subtotal >= 0 and monto = subtotal + igv),
  constraint compra_notas_proveedor_serie_unica unique (compra_id, serie_numero)
);
create unique index if not exists compra_notas_proveedor_token on retail.compra_notas_proveedor (token_cliente) where token_cliente is not null;
create index if not exists compra_notas_proveedor_compra_idx on retail.compra_notas_proveedor (compra_id);
comment on table retail.compra_notas_proveedor is
  'ADR-0362 fase 5b (actividad 3): la nota de crédito del proveedor (07) que respalda documentos internos de una factura. No mueve plata: su IGV baja el crédito fiscal en el mes de su fecha (sale de la cuenta puente 4019). No se edita ni se borra.';

create table if not exists retail.compra_notas_proveedor_documentos (
  nota_proveedor_id uuid not null references retail.compra_notas_proveedor (id),
  nota_credito_id uuid not null references retail.compra_notas_credito (id),
  primary key (nota_proveedor_id, nota_credito_id),
  -- Cada documento interno, una sola nota del proveedor.
  constraint compra_notas_proveedor_documentos_una unique (nota_credito_id)
);
comment on table retail.compra_notas_proveedor_documentos is
  'ADR-0362 fase 5b (actividad 3): qué documentos internos (compra_notas_credito, interna) respalda cada nota de crédito del proveedor. Uno por documento.';

alter table retail.compra_notas_proveedor enable row level security;
alter table retail.compra_notas_proveedor_documentos enable row level security;
revoke all on table retail.compra_notas_proveedor from anon, authenticated;
revoke all on table retail.compra_notas_proveedor_documentos from anon, authenticated;

-- No se editan ni se borran (como el libro de compras), y el mes cerrado no recibe notas (como `compra_notas_credito`). Disparadores con
-- `create or replace` (ADR-0195: un `drop trigger` toma en exclusiva auth y storage).
create or replace trigger compra_notas_proveedor_inmutables before update or delete on retail.compra_notas_proveedor
  for each row execute function retail.fn_libro_compras_es_inmutable();
create or replace trigger compra_notas_proveedor_documentos_inmutables before update or delete on retail.compra_notas_proveedor_documentos
  for each row execute function retail.fn_libro_compras_es_inmutable();
create or replace trigger compra_notas_proveedor_mes_abierto before insert on retail.compra_notas_proveedor
  for each row execute function retail.fn_candado_compra_notas_credito();

reset lock_timeout;

-- Comprobación: si algo no quedó, el pegado falla y no se aplica nada.
do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'retail' and table_name = 'compra_notas_credito' and column_name = 'interna') then
    raise exception 'falta compra_notas_credito.interna';
  end if;
  if to_regclass('retail.compra_notas_internas_seq') is null then
    raise exception 'falta la secuencia de los documentos internos';
  end if;
  if position('interna' in pg_get_indexdef('retail.compra_notas_credito_faltante_unica'::regclass)) = 0 then
    raise exception 'la nota por faltante del proveedor todavía cuenta los documentos internos';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'retail' and table_name = 'proveedor_deuda_resoluciones' and column_name = 'nota_credito_id') then
    raise exception 'falta proveedor_deuda_resoluciones.nota_credito_id';
  end if;
  if not exists (select 1 from retail.cuentas where codigo = '4019' and tipo = 'pasivo') then
    raise exception 'falta la cuenta puente del IGV (4019) en el plan de cuentas';
  end if;
  if to_regclass('retail.compra_notas_proveedor') is null or to_regclass('retail.compra_notas_proveedor_documentos') is null then
    raise exception 'faltan las tablas de la nota de crédito del proveedor';
  end if;
  if (select count(*) from pg_trigger where not tgisinternal
        and tgrelid in ('retail.compra_notas_proveedor'::regclass, 'retail.compra_notas_proveedor_documentos'::regclass)) <> 3 then
    raise exception 'faltan los candados de la nota de crédito del proveedor (no se edita, mes cerrado)';
  end if;
end;
$$;
