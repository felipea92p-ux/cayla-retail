-- ============================================================================
-- 20261106013000 — Un gasto dice cuándo salió la plata del banco (tarea 15 de «Las 36 de Finanzas»)
--
-- EL PROBLEMA PRIMERO. Una factura del 28 de octubre transferida el 2 de noviembre, registrada con «Sí, ya salió», bajaba el banco el 28. Y si esa fecha era anterior al `saldo_desde` de la cuenta, nunca lo bajaba.
--
-- LA DECISIÓN. `fn_comprobante_y_pago` lee `fecha_pago` dentro de `p_comprobante`: el pago lleva esa fecha y el comprobante, la suya. Solo si sale por banco: el efectivo sale del cajón el día que se registra.
-- Se valida con `fn_validar_fecha_pago_compra`, la misma de pagar una factura: ni futura ni anterior a la emisión. Sin `fecha_pago`, todo sigue como hoy. El IGV del papel no necesita migración: la base ya lo acepta.
--
-- SUPUESTO PARA EL CONTADOR: el IGV del papel admite cualquier monto entre cero y el total, no solo 0 y 18 %, porque una factura mixta trae otra cifra. Si prefiere solo esos dos, se angosta en la pantalla.
--
-- CÓMO SE PEGA EN PRODUCCIÓN: una ejecución, sin políticas. Reescribe una función desde su definición viva; si un ancla no aparece, aborta entero. Pegarla dos veces no hace nada.
-- Verificado: `pnpm pruebas:gasto-fecha-pago`.
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

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

select pg_temp.reemplazar('retail.fn_comprobante_y_pago(text,uuid,date,numeric,text,jsonb,text,uuid,uuid,text,text,uuid,uuid)',
$a$  v_cta_ubic uuid;
begin$a$,
$n$  v_cta_ubic uuid;
  v_fecha_pago date;
begin$n$, 1);

select pg_temp.reemplazar('retail.fn_comprobante_y_pago(text,uuid,date,numeric,text,jsonb,text,uuid,uuid,text,text,uuid,uuid)',
$a$  if p_comprobante is not null then
    insert into retail.compras (proveedor_id, tipo, serie, numero, fecha_emision, condicion, fecha_vencimiento,$a$,
$n$  if p_comprobante is not null then
    -- Tarea 15: cuándo salió del banco, si no fue el día del comprobante.
    v_fecha_pago := nullif(p_comprobante->>'fecha_pago', '')::date;
    if v_fecha_pago is not null and (p_medio_pago is null or p_medio_pago = 'efectivo') then
      raise exception 'La fecha de salida es solo para lo que sale por banco.' using errcode = 'P0001';
    end if;
    perform retail.fn_validar_fecha_pago_compra(v_fecha_pago, p_fecha, v_serie || '-' || v_numero);
    insert into retail.compras (proveedor_id, tipo, serie, numero, fecha_emision, condicion, fecha_vencimiento,$n$, 1);

select pg_temp.reemplazar('retail.fn_comprobante_y_pago(text,uuid,date,numeric,text,jsonb,text,uuid,uuid,text,text,uuid,uuid)',
$a$      values (o_compra_id, p_fecha, p_monto, p_medio_pago, nullif(trim(coalesce(p_referencia, '')), ''),$a$,
$n$      values (o_compra_id, coalesce(v_fecha_pago, p_fecha), p_monto, p_medio_pago, nullif(trim(coalesce(p_referencia, '')), ''),$n$, 1);

reset lock_timeout;
