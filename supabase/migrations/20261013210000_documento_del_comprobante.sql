-- ============================================================================
-- 20261013210000_documento_del_comprobante.sql — CAYLA V2 (/chaos 2026-10-13, decisión de Felipe 2026-10-13)
--
-- EL PROBLEMA PRIMERO. Una factura salía con un RUC de 10 dígitos y una boleta con un DNI de 7: la pantalla avisaba, pero dejaba
-- emitir, y la base no miraba el largo. SUNAT rechaza ese comprobante después de que la venta ya se cobró (o, peor, lo acepta con
-- el documento equivocado de la clienta). Felipe (2026-10-13): bloquear, en la pantalla y en la base.
--
-- LA DECISIÓN.
--   · `emitir_comprobante` (por donde pasan la venta, el apartado, el abono y la entrega): una boleta o una factura con DNI lleva
--     8 dígitos, y con RUC, 11. Se mira antes de reservar el correlativo (la venta entera se deshace igual).
--   · Un disparador de respaldo en `comprobantes` (antes de insertar o de cambiar el documento), solo para boleta y factura: el
--     último guardián, sea cual sea el camino. No es un CHECK: uno `not valid` igual se mira en cada UPDATE de una fila vieja, y
--     trabaría la cola de reintento de una boleta vieja. Las notas de crédito y de débito no se miran (copian el documento de su
--     comprobante original, que ya se emitió). En producción no hay ningún comprobante con un DNI o un RUC mal escrito (2026-10-13).
--
-- CONTRATO (Liskov)
--   PROMETE: ninguna boleta ni factura nueva lleva un DNI que no sea de 8 dígitos ni un RUC que no sea de 11 (`documento_invalido`,
--            22023, el mismo código y la misma pista que ya usa el carné y el pasaporte). «Sin documento», el carné y el pasaporte
--            siguen como estaban. Lo que ya está emitido no se toca.
--   ASUME:   `emitir_comprobante` con el bloque del carné y el pasaporte (ADR-0288 D-3).
--   NO HACE: no toca el formato de la clienta (`clientas`), ni las notas, ni políticas.
--
-- CÓMO SE PEGA. Una sola parte: una función, un reemplazo anclado y un disparador nuevo (sin `drop trigger`: se crea solo si no
-- existe). El ancla es UNA línea: en producción `emitir_comprobante` tiene finales de línea CRLF (pegada desde Windows) y un ancla
-- de varias líneas no la encontraría (verificado el 2026-10-13: aparece una vez). Idempotente. Fuera de horario: crear el disparador
-- toma un candado breve de `comprobantes`.
-- ============================================================================
set lock_timeout = '3s';

-- La regla, en un solo lugar: qué está mal del documento de una boleta o una factura (NULL = nada).
create or replace function retail.fn_problema_documento_comprobante(p_tipo text, p_tipo_doc text, p_num_doc text)
returns text
language sql
immutable
set search_path = retail, public
as $$
  select case
    when p_tipo not in ('boleta', 'factura') then null
    when p_tipo_doc = 'dni' and coalesce(p_num_doc, '') !~ '^[0-9]{8}$' then 'El DNI tiene 8 dígitos. Corrígelo, o elige «Sin documento».'
    when p_tipo_doc = 'ruc' and coalesce(p_num_doc, '') !~ '^[0-9]{11}$' then 'El RUC tiene 11 dígitos. Corrígelo antes de emitir.'
  end;
$$;

comment on function retail.fn_problema_documento_comprobante(text, text, text) is
  'Qué está mal del documento de una boleta o una factura: DNI de 8 dígitos, RUC de 11. NULL si está bien o si no aplica.';
revoke all on function retail.fn_problema_documento_comprobante(text, text, text) from public, anon;
grant execute on function retail.fn_problema_documento_comprobante(text, text, text) to authenticated;

create or replace function pg_temp.reemplazar_documento(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
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

select pg_temp.reemplazar_documento(
  'retail.emitir_comprobante(uuid, text, numeric, numeric, numeric, uuid, text, text, text, jsonb, uuid)',
  $v$  if p_tipo = 'nota_venta' and p_igv <> 0 then$v$,
  $v$  -- Una boleta o una factura: un DNI de 8 dígitos y un RUC de 11, antes de reservar el correlativo.
  if retail.fn_problema_documento_comprobante(p_tipo, p_cliente_tipo_doc, p_cliente_num_doc) is not null then
    raise exception '%', retail.fn_problema_documento_comprobante(p_tipo, p_cliente_tipo_doc, p_cliente_num_doc)
      using errcode = '22023', hint = 'documento_invalido';
  end if;
  if p_tipo = 'nota_venta' and p_igv <> 0 then$v$,
  1);

-- El respaldo en la tabla: sea cual sea el camino, una boleta o una factura no se guarda con el documento mal escrito.
create or replace function retail.trg_documento_del_comprobante()
returns trigger
language plpgsql
set search_path = retail, public
as $$
begin
  if retail.fn_problema_documento_comprobante(new.tipo, new.cliente_tipo_doc, new.cliente_num_doc) is not null then
    raise exception '%', retail.fn_problema_documento_comprobante(new.tipo, new.cliente_tipo_doc, new.cliente_num_doc)
      using errcode = '22023', hint = 'documento_invalido';
  end if;
  return new;
end;
$$;

revoke all on function retail.trg_documento_del_comprobante() from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'comprobantes_documento_valido' and tgrelid = 'retail.comprobantes'::regclass) then
    create trigger comprobantes_documento_valido
      before insert or update of cliente_tipo_doc, cliente_num_doc on retail.comprobantes
      for each row when (new.tipo in ('boleta', 'factura'))
      execute function retail.trg_documento_del_comprobante();
  end if;
end;
$$;
