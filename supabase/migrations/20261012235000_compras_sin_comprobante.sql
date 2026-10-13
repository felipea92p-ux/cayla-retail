-- ADR-0362 · decisión 50 (Felipe 2026-10-12, mientras se construía la fase 3): «Debe existir 4 tipos de comprobantes: boleta, nota de
-- venta, factura y sin comprobante».
--
-- EL PROBLEMA PRIMERO. En Gamarra muchas compras se hacen sin ningún papel: el proveedor no da boleta, ni nota de venta, ni factura. La
-- compradora igual tiene que dejar registrada la compra de una orden —lo que costó, lo que se le debe al proveedor o lo que se le pagó—,
-- pero `registrar_comprobante_orden` (20261012211000, con la gestora de 20261012230000) solo aceptaba boleta, nota de venta o factura,
-- y exigía la serie y el número que trae el papel. Sin papel, la compra no se podía registrar.
--
-- QUÉ HACE.
--   1. `compras.tipo` acepta `sin_comprobante` (el candado `compras_tipo_check` suma el valor; los demás no cambian).
--   2. `registrar_comprobante_orden` (REEMPLAZOS ANCLADOS sobre su definición viva; su firma y su respuesta no cambian) acepta
--      `p_tipo = 'sin_comprobante'`: no pide serie ni número —los que lleguen se ignoran—, y al guardar la base le pone un número interno
--      de la empresa, `SC-000001`, de la secuencia `compras_sin_comprobante_seq` (se toma justo antes de escribir: un intento que falla
--      no gasta número). Sin IGV, como la boleta y la nota de venta: el total es la suma de las líneas. Al crédito o al contado, igual que
--      los otros tres. Actividad dice «registró la compra sin comprobante SC-000001 de la OC-…».
--   Lo demás ya lo trata bien sin tocarlo: el Registro de Compras y el IGV de Finanzas ▸ Impuestos solo cuentan factura, boleta y recibo
--   por honorarios (`fn_impuestos_registro_compras`, `fn_impuestos_compras`): una compra sin comprobante no entra al PLE ni da crédito
--   fiscal. Por pagar, Facturas de proveedor y el pago la ven como cualquier otra compra.
--
-- POR DEFECTO (provisional, revisar con Felipe): el número interno es único para toda la empresa; si después llega el papel, se anula
-- la compra sin comprobante y se registra el papel (mientras no tenga pagos, como corregir cualquier comprobante); la factura suelta de
-- Facturas de proveedor (`registrar_compra`) no cambia.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). UNA parte, después de 20261012230000 (sus anclas son las que esa deja). Cambia el
-- candado de una tabla en uso (`compras`), sin políticas ni `drop trigger` (ADR-0195), sin `select … into` dentro de textos entre
-- comillas (ADR-0288). Los reemplazos abortan SIN TOCAR NADA si la función viva cambió y no hacen nada si ya están aplicados: se puede
-- pegar dos veces. El bloque final comprueba que quedó todo.

set lock_timeout = '3s';

-- Reemplazo anclado (el mismo de 20261012211000): falla si la función viva cambió, y es re-ejecutable.
create or replace function pg_temp.reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_nuevo in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- ---------- 1. El tipo nuevo en la tabla ----------
alter table retail.compras drop constraint if exists compras_tipo_check;
alter table retail.compras add constraint compras_tipo_check
  check (tipo = any (array['factura', 'boleta', 'nota_venta', 'recibo_por_honorarios', 'sin_comprobante']));

-- El número interno de una compra sin comprobante: SC-000001, SC-000002… para toda la empresa.
create sequence if not exists retail.compras_sin_comprobante_seq;
revoke all on sequence retail.compras_sin_comprobante_seq from public, anon, authenticated;

-- ---------- 2. Registrar el comprobante de una orden: el cuarto tipo ----------
-- 2a. El tipo y el papel: sin comprobante no hay serie ni número que escribir (la base pone el número al guardar).
select pg_temp.reemplazar(
  'retail.registrar_comprobante_orden(uuid,text,text,text,jsonb,date,text,date,boolean,numeric,jsonb,text,uuid)',
  $v$  if v_tipo not in ('boleta', 'nota_venta', 'factura') then
    raise exception 'Elige si el comprobante es boleta, nota de venta o factura' using hint = 'comprobante_orden_tipo';
  end if;
  if v_serie = '' then
    raise exception 'Escribe la serie del comprobante' using hint = 'comprobante_orden_serie';
  end if;
  if v_numero = '' then
    raise exception 'Escribe el número del comprobante' using hint = 'comprobante_orden_numero';
  end if;$v$,
  $v$  if v_tipo not in ('boleta', 'nota_venta', 'factura', 'sin_comprobante') then
    raise exception 'Elige el tipo: boleta, nota de venta, factura o sin comprobante' using hint = 'comprobante_orden_tipo';
  end if;
  -- Sin comprobante (decisión 50): el proveedor no dio papel. No se pide serie ni número: los que lleguen se ignoran y la base le pone
  -- su número interno (SC-000001) justo antes de guardar.
  if v_tipo = 'sin_comprobante' then
    v_serie := 'SC';
    v_numero := '';
  else
    if v_serie = '' then
      raise exception 'Escribe la serie del comprobante' using hint = 'comprobante_orden_serie';
    end if;
    if v_numero = '' then
      raise exception 'Escribe el número del comprobante' using hint = 'comprobante_orden_numero';
    end if;
  end if;$v$,
  1);

-- 2b. El mismo papel vigente no se registra dos veces; una compra sin comprobante no tiene papel que repetir.
select pg_temp.reemplazar(
  'retail.registrar_comprobante_orden(uuid,text,text,text,jsonb,date,text,date,boolean,numeric,jsonb,text,uuid)',
  $v$  if exists (
    select 1 from retail.compras c
     where c.proveedor_id = v_orden.proveedor_id and c.serie = v_serie and c.numero = v_numero and c.estado = 'vigente'
  ) then$v$,
  $v$  if v_tipo <> 'sin_comprobante' and exists (
    select 1 from retail.compras c
     where c.proveedor_id = v_orden.proveedor_id and c.serie = v_serie and c.numero = v_numero and c.estado = 'vigente'
  ) then$v$,
  1);

-- 2c. La fecha de un pago al contado se valida contra la emisión; el mensaje nombra el papel, y sin comprobante no hay número todavía.
select pg_temp.reemplazar(
  'retail.registrar_comprobante_orden(uuid,text,text,text,jsonb,date,text,date,boolean,numeric,jsonb,text,uuid)',
  $v$perform retail.fn_validar_fecha_pago_compra(nullif(btrim(v_pago ->> 'fecha'), '')::date, v_emision, v_serie || '-' || v_numero);$v$,
  $v$perform retail.fn_validar_fecha_pago_compra(nullif(btrim(v_pago ->> 'fecha'), '')::date, v_emision,
        case when v_tipo = 'sin_comprobante' then 'sin papel' else v_serie || '-' || v_numero end);$v$,
  1);

-- 2d. Justo antes de escribir, el número interno: un intento que no pasó las validaciones no gasta número.
select pg_temp.reemplazar(
  'retail.registrar_comprobante_orden(uuid,text,text,text,jsonb,date,text,date,boolean,numeric,jsonb,text,uuid)',
  $v$  begin
    insert into retail.compras (
      proveedor_id, tipo, serie, numero, fecha_emision, condicion, fecha_vencimiento,$v$,
  $v$  if v_tipo = 'sin_comprobante' then
    v_numero := lpad(nextval('retail.compras_sin_comprobante_seq')::text, 6, '0');
  end if;
  begin
    insert into retail.compras (
      proveedor_id, tipo, serie, numero, fecha_emision, condicion, fecha_vencimiento,$v$,
  1);

-- 2e. Lo que anota Actividad.
select pg_temp.reemplazar(
  'retail.registrar_comprobante_orden(uuid,text,text,text,jsonb,date,text,date,boolean,numeric,jsonb,text,uuid)',
  $v$case v_tipo when 'factura' then 'la factura ' when 'boleta' then 'la boleta ' else 'la nota de venta ' end$v$,
  $v$case v_tipo when 'factura' then 'la factura ' when 'boleta' then 'la boleta '
                         when 'nota_venta' then 'la nota de venta ' else 'la compra sin comprobante ' end$v$,
  1);

comment on function retail.registrar_comprobante_orden(uuid, text, text, text, jsonb, date, text, date, boolean, numeric, jsonb, text, uuid) is
  'ADR-0362 (fases 2 y 3, decisión 50): registra la boleta, nota de venta, factura o la compra SIN COMPROBANTE (número interno '
  'SC-000001, sin IGV) de una orden generada, también «Por repartir» (gestora = fn_orden_compra_gestora: la sede de quien hizo la '
  'orden, decisión 46; líneas sin prenda; al contado, pago de la empresa sin tienda). Solo el módulo Órdenes de compra. Devuelve '
  '{compra_id, documento, total, saldo, avisos}: «de más» y «fuera de la orden» se avisan sin bloquear. p_token + huella: un '
  'reintento devuelve lo mismo.';

-- ---------- 3. Comprobación: si algo no quedó, la migración no se da por aplicada ----------
do $$
declare
  v_def text := pg_get_functiondef(
    'retail.registrar_comprobante_orden(uuid,text,text,text,jsonb,date,text,date,boolean,numeric,jsonb,text,uuid)'::regprocedure);
begin
  if position($t$'factura', 'sin_comprobante')$t$ in v_def) = 0
     or position($t$nextval('retail.compras_sin_comprobante_seq')$t$ in v_def) = 0
     or position($t$v_tipo <> 'sin_comprobante' and exists ($t$ in v_def) = 0
     or position($t$'sin papel'$t$ in v_def) = 0
     or position($t$'la compra sin comprobante '$t$ in v_def) = 0 then
    raise exception 'registrar_comprobante_orden no quedó con el tipo «sin comprobante» completo';
  end if;
  if position('retail.fn_orden_compra_gestora(v_orden.id)' in v_def) = 0 then
    raise exception 'registrar_comprobante_orden no tiene la gestora de 20261012230000: pega esa migración antes que esta';
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'compras_tipo_check' and conrelid = 'retail.compras'::regclass
       and pg_get_constraintdef(oid) like '%sin_comprobante%'
  ) then
    raise exception 'compras_tipo_check no acepta sin_comprobante';
  end if;
  if has_sequence_privilege('authenticated', 'retail.compras_sin_comprobante_seq', 'usage') then
    raise exception 'la secuencia del número interno es de la función: authenticated no la usa';
  end if;
end;
$$;

reset lock_timeout;
