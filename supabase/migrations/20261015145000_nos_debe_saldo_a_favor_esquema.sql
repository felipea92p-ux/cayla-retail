-- ============================================================================
-- 20261015145000_nos_debe_saldo_a_favor_esquema.sql — CAYLA V2 · ADR-0362, fase 5b, actividad 1 (parte 1 de 2: el esquema). Las funciones
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
end;
$$;
