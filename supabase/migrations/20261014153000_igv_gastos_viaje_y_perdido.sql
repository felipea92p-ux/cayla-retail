-- El IGV de la fase 6 · actividad 8 (ADR-0362, decisiones 56, 70, 72 y 73).
--
-- EL PROBLEMA PRIMERO. Dos huecos en el IGV de las compras:
--   · La factura de un gasto del viaje (el hotel, el flete de la agencia) se guardó entera como gasto: su IGV nunca llegó al crédito
--     fiscal, aunque la factura lo permita. CAYLA pagaba de más.
--   · Desde la actividad 6, un pago en efectivo o desde un fondo de un comprobante de S/ 2 000 o más queda «no deducible» (bancarización):
--     su IGV ya no sirve como crédito. Pero Impuestos, el Diario y el Balance lo seguían contando: CAYLA declaraba un crédito que no tiene.
--
-- QUÉ CREA
--   1. El IGV de la factura de un gasto del viaje: `registrar_gasto_viaje` lo separa (con la tasa de la fecha) cuando el papel es una
--      FACTURA con el RUC de quien la dio; sin RUC, una boleta, un ticket o una planilla, no hay crédito. Para guardarlo, el candado
--      `gastos_igv_solo_con_comprobante` acepta también las dos categorías de los gastos del viaje (su papel vive en `gastos_viaje`, no en
--      un comprobante de compra). El Diario, el Estado de resultados y Finanzas ▸ Gastos ya leen `gastos.igv`: lo ven sin tocarlos.
--   2. `fn_igv_perdido(desde, hasta)`: el IGV que se pierde por la bancarización, EN EL MES DEL PAGO (decisión 72) y en la proporción
--      pagada así: el pago en efectivo o desde un fondo de una factura de S/ 2 000 o más (la regla única, `fn_pago_no_bancarizado`) pierde
--      `IGV de la factura × pago ÷ total`; el de un gasto del viaje, todo su IGV. Comprobantes de proveedor, del Taller y gastos del viaje.
--   3. Impuestos: `fn_impuestos_compras` suma las facturas y boletas de los gastos del viaje y, en negativo, el IGV perdido (dentro de la
--      categoría de su comprobante: así el crédito de cada mes, el saldo a favor que se arrastra y «¿Cuadra?» lo cuentan igual sin cambiar
--      sus columnas); `fn_impuestos_igv_meses` cuenta los gastos del viaje con los gastos; el panel suma el aviso `igv_perdido` del mes; el
--      registro de compras para el contador suma las facturas y boletas de los gastos del viaje.
--   4. El Diario: `fn_asientos_igv_perdido` asienta el IGV perdido (debe 64 «Gastos por tributos», haber 4011), provisional hasta el
--      contador. El del Taller no se asienta: el Diario tampoco tiene su IGV (la causa `igv_taller` de «¿Cuadra?» ya lo explica).
--
-- DESCARTÉ
--   · Restar el IGV perdido en el mes de la factura: un mes ya declarado cambiaría solo (Felipe eligió el mes del pago, 72).
--   · Perder TODO el IGV de una factura pagada en parte por el banco: la decisión 70 marca no deducible lo pagado en efectivo o desde un
--     fondo, no el resto.
--   · Crear un comprobante de compra para la factura del gasto del viaje: pediría dar de alta al proveedor desde Gamarra (actividad 3).
--   · Columnas nuevas en `fn_impuestos_igv_meses`: volver a pegar la migración que la creó fallaría. El perdido entra como fila negativa.
--   · El ticket de máquina registradora como crédito: depende de requisitos que confirma el contador. Por ahora no da crédito.
--
-- SE ROMPE SI
--   · Una pantalla calcula el IGV perdido por su cuenta: Impuestos y el Diario dirían cosas distintas. Se pregunta a `fn_igv_perdido`.
--   · Alguien cambia el umbral o la regla en un solo lado: todo sale de `fn_pago_no_bancarizado`.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (autorización de Felipe para la fase 6). Una sola parte, después de 20261014145000: cambia una restricción de
-- `retail.gastos` (sin políticas ni `drop trigger`: ADR-0195), crea funciones y, con reemplazos anclados que solo SUMAN o cambian lo que
-- definió la 20260925140000 / 20261013222000 completa, toca siete funciones vivas. Sin `select … into` dentro de textos entre comillas
-- (ADR-0288). Los reemplazos abortan sin cambiar nada si la función viva cambió. Idempotente.

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- Reemplaza un texto en la definición VIVA de una función, solo si aparece las veces esperadas; si ya está reemplazado, no hace nada.
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

-- ---------- 1. El IGV de la factura de un gasto del viaje ----------
-- El papel de un gasto del viaje vive en su ficha (`gastos_viaje`), no en un comprobante de compra: el candado lo acepta en sus dos
-- categorías. `registrar_gasto` no separa IGV sin comprobante, así que el candado sigue protegiendo los gastos de Finanzas.
alter table retail.gastos
  drop constraint if exists gastos_igv_solo_con_comprobante,
  add constraint gastos_igv_solo_con_comprobante
    check (igv = 0 or compra_id is not null or categoria in ('traer_mercaderia', 'viaje_compra'));

select pg_temp.reemplazar('retail.registrar_gasto_viaje(text, text, numeric, date, text, text, uuid, uuid[], text, text, text, uuid)',
$v$v_desc, p_fecha, v_monto, 0, null,$v$,
$n$v_desc, p_fecha, v_monto,
          -- ADR-0362 fase 6 · actividad 8: una FACTURA con el RUC de quien la dio separa su IGV (crédito fiscal); lo demás, no.
          case when p_papel = 'factura' and nullif(btrim(coalesce(p_ruc, '')), '') is not null
               then round(v_monto - v_monto / (1 + retail.fn_tasa_igv(p_fecha)), 2) else 0 end, null,$n$,
1);

-- ---------- 2. El IGV perdido por la bancarización ----------
-- Decisiones 56, 70 y 72: el pago en efectivo o desde un fondo de una factura de S/ 2 000 o más pierde su parte del IGV, en el mes del
-- pago. Un gasto del viaje es su propio pago: pierde todo su IGV el mismo día.
create or replace function retail.fn_igv_perdido(p_desde date, p_hasta date)
returns table (origen text, id uuid, comprobante_id uuid, naturaleza text, fecha date, igv numeric, ubicacion_id uuid, documento text)
language sql stable set search_path = retail, public, extensions as $$
  select 'compra'::text, cp.id, co.id, co.naturaleza, cp.fecha, round(co.igv * cp.monto / co.total, 2),
         coalesce(cp.ubicacion_id, co.ubicacion_gestion_id), coalesce(co.documento, concat_ws('-', co.serie, co.numero))
    from retail.compra_pagos cp
    join retail.compras co on co.id = cp.compra_id
    left join retail.cuentas_dinero cu on cu.id = cp.cuenta_dinero_id
   where cp.fecha between p_desde and p_hasta and co.estado = 'vigente' and co.tipo = 'factura' and co.igv > 0 and co.total > 0
     and retail.fn_pago_no_bancarizado(co.total, cp.metodo, cu.tipo)
  union all
  select 'taller', pp.id, co.id, 'taller', pp.fecha, round(co.igv * pp.monto / co.total, 2), null::uuid, concat_ws('-', co.serie, co.numero)
    from retail.comprobantes_produccion_pagos pp
    join retail.comprobantes_produccion co on co.id = pp.comprobante_id
    left join retail.cuentas_dinero cu on cu.id = pp.cuenta_dinero_id
   where pp.fecha between p_desde and p_hasta and co.estado = 'vigente' and co.tipo = 'factura' and co.igv > 0 and co.total > 0
     and retail.fn_pago_no_bancarizado(co.total, pp.metodo, cu.tipo)
  union all
  select 'gasto_viaje', g.id, g.id, 'gasto', g.fecha, g.igv, g.ubicacion_id, coalesce(gv.serie_numero, g.descripcion)
    from retail.gastos g
    join retail.gastos_viaje gv on gv.gasto_id = g.id
    left join retail.cuentas_dinero cu on cu.id = g.cuenta_dinero_id
   where g.fecha between p_desde and p_hasta and g.estado = 'vigente' and g.igv > 0
     and retail.fn_pago_no_bancarizado(g.monto_total, g.medio_pago, cu.tipo);
$$;
comment on function retail.fn_igv_perdido(date, date) is
  'ADR-0362 fase 6 · actividad 8 (decisiones 56, 70 y 72): el IGV que se pierde por pagar en efectivo o desde un fondo una factura de S/ 2 000 o más, en el mes del pago y en la proporción pagada así. Lo usan Impuestos (fn_impuestos_compras, en negativo), el panel y el Diario (fn_asientos_igv_perdido).';

-- ---------- 3. Impuestos ----------
-- Las facturas y boletas de los gastos del viaje, y el IGV perdido en negativo dentro de la categoría de su comprobante.
select pg_temp.reemplazar('retail.fn_impuestos_compras(date, date)',
$v$   where k.estado = 'vigente' and n.fecha between p_desde and p_hasta;$v$,
$n$   where k.estado = 'vigente' and n.fecha between p_desde and p_hasta
  union all
  -- ADR-0362 fase 6 · actividad 8: las facturas y boletas de los gastos del viaje (su papel vive en `gastos_viaje`).
  select 'gasto_viaje', g.id, 'gasto', g.fecha, gv.papel, g.monto_total - g.igv, g.igv, g.monto_total, gv.papel = 'factura' and g.igv > 0
    from retail.gastos g join retail.gastos_viaje gv on gv.gasto_id = g.id
   where g.estado = 'vigente' and gv.papel in ('factura', 'boleta') and g.fecha between p_desde and p_hasta
  union all
  -- ADR-0362 fase 6 · actividad 8 (decisión 72): el IGV perdido por la bancarización, en el mes del pago, en negativo.
  select x.origen, x.id, x.naturaleza, x.fecha, 'igv_perdido', 0, -x.igv, 0, true
    from retail.fn_igv_perdido(p_desde, p_hasta) x;$n$,
1);

select pg_temp.reemplazar('retail.fn_impuestos_igv_meses(date, date)',
$v$coalesce(sum(x.igv) filter (where x.da_credito and x.origen = 'compra' and x.naturaleza = 'gasto'), 0) as cg,$v$,
$n$coalesce(sum(x.igv) filter (where x.da_credito and x.origen in ('compra', 'gasto_viaje') and x.naturaleza = 'gasto'), 0) as cg,$n$,
1);

-- El aviso del mes en el panel: cuánto IGV se perdió por pagos en efectivo (ya restado del crédito).
select pg_temp.reemplazar('retail.fn_impuestos_panel(date)',
$v$       where k.estado = 'vigente' and k.tipo = 'recibo_por_honorarios' and k.fecha_emision between v_mes and v_fin_mes)
  ) into v_revisar;$v$,
$n$       where k.estado = 'vigente' and k.tipo = 'recibo_por_honorarios' and k.fecha_emision between v_mes and v_fin_mes),
    -- ADR-0362 fase 6 · actividad 8: el IGV perdido por pagos en efectivo o desde un fondo (ya restado del crédito).
    'igv_perdido', (
      select jsonb_build_object('n', count(*), 'igv', coalesce(sum(x.igv), 0))
        from retail.fn_igv_perdido(v_mes, v_fin_mes) x)
  ) into v_revisar;$n$,
1);

-- El registro de compras para el contador: las facturas y boletas de los gastos del viaje. El nombre de quien la dio: el de un proveedor
-- con ese RUC, si lo hay; si no, lo dice (la hoja del gasto guarda el RUC, no la razón social).
select pg_temp.reemplazar('retail.fn_impuestos_registro_compras(date)',
$v$  ) r (origen, naturaleza, fecha, vencimiento, tipo, serie, numero, proveedor_ruc, proveedor, base, igv, no_gravado, total, da_credito,$v$,
$n$    union all
    -- ADR-0362 fase 6 · actividad 8: las facturas y boletas de los gastos del viaje.
    select 'gasto_viaje', 'gasto', g.fecha, null, gv.papel,
           nullif(split_part(coalesce(gv.serie_numero, ''), '-', 1), ''),
           nullif(substr(coalesce(gv.serie_numero, ''), length(split_part(coalesce(gv.serie_numero, ''), '-', 1)) + 2), ''),
           gv.ruc_emisor,
           coalesce((select pr.nombre from retail.proveedores pr where pr.ruc = gv.ruc_emisor order by pr.created_at limit 1),
                    'Sin razón social (ver el RUC)'),
           case when gv.papel = 'factura' then g.monto_total - g.igv else 0 end,
           g.igv,
           g.monto_total - case when gv.papel = 'factura' then g.monto_total else 0 end,
           g.monto_total, gv.papel = 'factura' and g.igv > 0,
           null, null, null, null,
           coalesce(u.nombre, 'De la empresa')
      from retail.gastos g
      join retail.gastos_viaje gv on gv.gasto_id = g.id
      left join retail.ubicaciones u on u.id = g.ubicacion_id
     where g.estado = 'vigente' and gv.papel in ('factura', 'boleta') and g.fecha between v_ini and v_fin
  ) r (origen, naturaleza, fecha, vencimiento, tipo, serie, numero, proveedor_ruc, proveedor, base, igv, no_gravado, total, da_credito,$n$,
1);

-- ---------- 4. El Diario ----------
-- El IGV perdido deja de ser crédito (haber 4011) y pasa a gasto (debe 64, provisional hasta el contador). El del Taller no: el Diario
-- tampoco tiene su IGV.
create or replace function retail.fn_asientos_igv_perdido(p_desde date, p_hasta date, p_todo boolean, p_ubics uuid[])
returns table (f date, ubicacion_id uuid, asiento text, regla text, cuenta text, debe numeric, haber numeric, ot text, oid uuid, glosa text)
language sql stable set search_path = retail, public, extensions as $$
  with x as (
    select p.* from retail.fn_igv_perdido(p_desde, p_hasta) p
     where p.origen <> 'taller' and p.igv > 0 and (p_todo or p.ubicacion_id = any (p_ubics))
  )
  select x.fecha, x.ubicacion_id, 'igv_perdido:' || x.id, 'igv_perdido', '64', x.igv, 0::numeric,
         case x.origen when 'compra' then 'compra_pagos' else 'gastos' end, x.id,
         'IGV perdido: pagado en efectivo o desde un fondo · ' || coalesce(x.documento, '')
    from x
  union all
  select x.fecha, x.ubicacion_id, 'igv_perdido:' || x.id, 'igv_perdido', '4011', 0::numeric, x.igv,
         case x.origen when 'compra' then 'compra_pagos' else 'gastos' end, x.id, 'Deja de ser crédito fiscal'
    from x;
$$;

select pg_temp.reemplazar('retail.fn_asientos(date, date, uuid)',
$v$    union all select * from retail.fn_asientos_dinero_y_caja(p_desde, p_hasta, v_todo, v_ubics)$v$,
$n$    union all select * from retail.fn_asientos_dinero_y_caja(p_desde, p_hasta, v_todo, v_ubics)
    -- ADR-0362 fase 6 · actividad 8: el IGV perdido por pagos en efectivo o desde un fondo deja de ser crédito.
    union all select * from retail.fn_asientos_igv_perdido(p_desde, p_hasta, v_todo, v_ubics)$n$,
1);

-- ---------- 5. Permisos ----------
revoke all on function retail.fn_igv_perdido(date, date) from public, anon, authenticated;
revoke all on function retail.fn_asientos_igv_perdido(date, date, boolean, uuid[]) from public, anon, authenticated;

reset lock_timeout;
notify pgrst, 'reload schema';
