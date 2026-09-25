-- ============================================================================
-- 20260925130000 — El diario derivado, el Estado de resultados y el reporte de campañas (ADR-0195 F5; retoma ADR-0198 y
-- ADR-0120 del PR #170, adaptados a lo que hoy existe en producción)
--
-- EL PROBLEMA PRIMERO
--   Felipe quiere saber «¿ganamos este mes?» por tienda, Taller y CAYLA entera. Los datos ya están, repartidos en doce
--   tablas: ventas, anulaciones, devoluciones, cambios, mermas, separaciones, gastos (con o sin factura), facturas de
--   mercadería, notas de crédito, pagos a proveedores, activos fijos y la planilla de Dynamic. Si cada pantalla sumara
--   por su cuenta, el Estado de resultados, el Flujo y el Balance darían tres «ventas del mes» distintas.
--
-- LAS REGLAS (ADR-0198 opción C, ADR-0120)
--   1. NADIE ESCRIBE ASIENTOS. `fn_asientos(desde, hasta)` LEE las operaciones y GENERA las líneas debe/haber, cada una
--      con la fila de la que salió (`origen_tabla`, `origen_id`). No guarda nada ni toca ninguna operación de dinero.
--      Es la ÚNICA casa de las reglas de posteo: el contador corrige una regla aquí y todas las pantallas cambian juntas.
--   2. CADA ASIENTO CUADRA (debe = haber). No se fuerza con una línea de «ajuste»: si una fuente trae datos que no
--      cuadran (un cobro que no suma lo vendido), el asiento queda descuadrado A LA VISTA (`fn_asientos_descuadrados`) y
--      el Estado de resultados lo avisa en rojo. Un número falso es peor que ninguno.
--   3. El lado de caja o banco sale de UNA sola función (`fn_asiento_cuenta_de_medio`): efectivo → 101; Yape, Plin,
--      transferencia y depósito → 104 (llegan al banco al instante, ADR-0198); tarjeta de la clienta → 105 hasta el
--      abono; tarjeta de crédito de CAYLA (pagos) → 451 (la de F3). F3b sellará la cuenta exacta de cada movimiento; ese
--      día se cambia ESTA función y nada más.
--   4. `fn_estado_resultados(desde, hasta, ubicación)` lee SOLO del diario: una fila por tienda, el Taller y «de la
--      empresa» (lo que no es de ninguna tienda, D-32), y el consolidado, que es su suma exacta.
--   5. La planilla se LEE de Dynamic (D-33, vista `planilla_por_sede`) y entra solo si quien mira puede verla allá
--      (`public.fn_es_admin_o_lider()`): retail no abre ninguna puerta nueva a la planilla (ADR-0133 F7).
--   6. Quién ve qué (ADR-0195 B): el líder, todo y el consolidado; con el módulo «Reportes financieros», SU tienda y
--      nada más (ni «de la empresa» ni el consolidado); sin él, nada.
--   7. `fn_campanas_reporte`: cada campaña pasada contra los días normales de su tienda, y para las que vienen cuánto
--      tiene que subir la venta para compensar su descuento, contra cuánto sube su meta (`fn_parametros_caja`, F1).
--
-- LAS REGLAS DE POSTEO (una fila por regla; el detalle, en `fn_asientos` y en docs/finanzas/fases/F5.md)
--   venta              día de la venta     cobro (101/104/105; «anticipo» → 122 + su IGV) | 7011 + 4011 ; 691 | 201
--   anulacion          día que se anula    reversa de la venta; el costo vuelve a 201, o a 659 si la prenda no es vendible
--   devolucion         día que se aprueba  7011 + 4011 | reembolso ; 201 | 691   (por el valor de las líneas devueltas)
--   cambio             día del cambio      la diferencia cobrada o devuelta, y el ajuste de costo entre prendas
--   merma_*            día del movimiento  659 | 201, al costo de ESA fecha (merma, cuarentena botada/donada, faltante)
--   anticipo           día de la separación   cobro | 122 + 4011 (la boleta de anticipo ya declara su IGV)
--   anticipo_devuelto  día que se devuelve    122 + 4011 | medio con que se devolvió
--   gasto              fecha del gasto     cuenta de su categoría (+ 4011) | 421 si tiene comprobante, o el medio
--   compra             emisión de la factura de MERCADERÍA   201 + 4011 | 421
--   activo             fecha de adquisición   33x (+ 4011) | 421 o el medio
--   depreciacion       fin de cada mes     681 | 391   (la misma cuenta de F2b: acumulado a fin de mes − el anterior)
--   baja_activo        fecha de la baja    391 + 655 (lo que faltaba depreciar) | 33x
--   planilla           fin del período de Dynamic (29 al 28)   62 | 41
--   nota_credito_prov  fecha de la nota    421 | 201, la cuenta del gasto o la del activo, + 4011
--   pago_proveedor     fecha del pago      421 | medio   («saldo a favor» no mueve plata: no asienta)
--   reembolso_prov     fecha del reembolso medio | 421
--
-- FUERA DE F5 (se dice, no se esconde): depósitos y traslados de caja, abonos de tarjeta, plata del dueño, pagos a
-- SUNAT (F3/F6/F7); diferencias de cierre de caja; insumos del Taller (`comprobantes_produccion`, ADR-0133); la venta de
-- un activo (sin pantalla); fletes de compra (no hay dónde registrarlos). Por eso este diario alcanza para el Estado de
-- resultados y todavía NO para un Balance.
--
-- CÓMO SE PEGA EN PRODUCCIÓN — UNA SOLA EJECUCIÓN (con el prefijo `retail.` ya puesto)
--   No toca ninguna tabla que use la tienda: tres filas nuevas en `cuentas` (plan de cuentas, solo lo leen funciones) y
--   funciones nuevas. Sin `alter table`, sin índices, sin políticas: no toma en exclusiva nada que la tienda use ni
--   `auth`/`storage`. Idempotente (`on conflict do nothing`, `create or replace`). Antes: 20260924235000,
--   20260924235100 y 20260925000000 (F2a y F2b), 20260925110000 (F3: la regla del gasto mira `movimientos_dinero` para
--   la comisión del POS) y la vista `planilla_por_sede` (20260921160000).
-- SE ROMPE SI
--   · Se agrega una operación de dinero nueva sin su regla aquí: ese dinero no aparece en ningún estado y nada falla.
--     Por eso cada regla nueva lleva su caso en `scripts/pruebas/estado_resultados.mjs`.
--   · `venta_pagos` deja de sumar lo mismo que las líneas de su venta: el asiento se descuadra y la pantalla lo avisa.
--   · Se anula un gasto de un mes ya cerrado: un gasto anulado «nunca existió» y el mes cambia. F9 (cierre) debe
--     bloquear la anulación con fecha de un mes cerrado.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. Cuentas que el diario necesita y el plan todavía no tenía (provisionales hasta el contador) ----------
-- La 451 (tarjeta de crédito de CAYLA) es la misma que crea F3 (20260925110000), con el mismo texto: se repite aquí para
-- que esta migración no dependa del orden en que se peguen.
insert into retail.cuentas (codigo, nombre, tipo, seccion_resultados, orden) values
  ('451', 'Préstamos de instituciones financieras (tarjeta de crédito)', 'pasivo', null,         40),
  ('122', 'Anticipos de clientes (adelantos de separaciones)', 'pasivo', null,               43),
  ('655', 'Bajas de activos fijos (lo que faltaba depreciar)',  'gasto',  'gastos_operacion', 44)
on conflict (codigo) do nothing;

-- ---------- 2. Ayudantes: una sola definición de cada cosa ----------

-- El lado de caja o banco de un asiento. `p_sentido`: 'entra' (cobros, reembolsos que recibe CAYLA) o 'sale' (pagos,
-- reembolsos a la clienta). Regla de ADR-0198: Yape, Plin y transferencia llegan al banco al instante; solo la tarjeta de
-- la clienta espera en 105 hasta que el banco la abona. La tarjeta de crédito de CAYLA es deuda (451, la de F3).
-- F3 sella la cuenta exacta en cada movimiento: ese día esta función lee la cuenta sellada y el resto no cambia.
create or replace function retail.fn_asiento_cuenta_de_medio(p_medio text, p_sentido text default 'entra')
returns text language sql immutable as $$
  select case
    when p_medio is null or p_medio = 'efectivo' then '101'
    when p_medio = 'anticipo' then '122'
    when p_medio = 'saldo_a_favor' then '421'
    when p_medio = 'tarjeta' and p_sentido = 'sale' then '451'
    when p_medio = 'tarjeta' then '105'
    else '104'   -- yape, plin, transferencia, depósito, otro
  end;
$$;
comment on function retail.fn_asiento_cuenta_de_medio(text, text) is
  'Regla de ADR-0198, en un solo lugar: efectivo 101; Yape, Plin, transferencia y depósito 104; tarjeta de la clienta 105 (hasta el abono); tarjeta de crédito de CAYLA 451; adelanto de separación 122. F3b la reemplaza por la cuenta sellada.';

-- Qué movimiento de inventario es una MERMA. La misma definición que el resumen de inventario (ajuste negativo por
-- merma; salida de cuarentena botada o donada) MÁS los faltantes de conteo (formal o desde el modal de ajuste). No es
-- merma devolver al proveedor (es un reclamo) ni un sobrante de conteo (no se reconoce hasta saber de dónde salió).
create or replace function retail.fn_es_merma(p_tipo text, p_motivo text, p_cantidad integer)
returns boolean language sql immutable as $$
  select (p_tipo = 'ajuste' and p_cantidad < 0 and p_motivo in ('merma', 'conteo', 'conteo_fisico'))
      or (p_tipo = 'salida' and p_motivo in ('cuarentena_se_boto', 'cuarentena_donada'));
$$;

-- El costo de una prenda EN un instante (`movimientos` no guarda valor): el costo resultante del último cambio hasta ese
-- momento; si todavía no había cambiado, el que tenía ANTES del primer cambio posterior; si nunca cambió, el de hoy; si no
-- hay ninguno, 0 (= «sin costo cargado», se avisa aparte).
create or replace function retail.fn_costo_variante_al(p_variante_id uuid, p_instante timestamptz)
returns numeric language sql stable set search_path = retail, public, extensions as $$
  select coalesce(
    (select h.costo_resultante from retail.costo_historial h
      where h.variante_id = p_variante_id and h.created_at <= p_instante order by h.created_at desc limit 1),
    (select h.costo_anterior from retail.costo_historial h
      where h.variante_id = p_variante_id and h.created_at > p_instante order by h.created_at asc limit 1),
    (select v.costo from retail.variantes v where v.id = p_variante_id),
    0);
$$;

-- Las ubicaciones cuyo diario ve la cuenta (decisión B): el líder, todas (también las inactivas: su historia cuenta); con
-- el módulo «Reportes financieros», la suya; sin él, ninguna.
create or replace function retail.fn_diario_ubicaciones() returns uuid[]
language sql stable security definer set search_path = retail, public, extensions as $$
  select case
    when retail.fn_es_lider() then (select coalesce(array_agg(u.id order by u.id), '{}') from retail.ubicaciones u)
    when retail.fn_capacidad_por_modulos(array['reportes_financieros']) and retail.fn_ubicacion_actual_persona() is not null then
      array[retail.fn_ubicacion_actual_persona()]
    else '{}'::uuid[]
  end;
$$;
comment on function retail.fn_diario_ubicaciones() is
  'Las ubicaciones cuyos números financieros ve la cuenta: todas para el líder, la suya con el módulo Reportes financieros, ninguna sin él. Lo «de la empresa» y el consolidado, solo el líder.';

-- ¿Puede quien mira ver la planilla? Lo decide Dynamic, no retail: solo quien allá es admin o líder de desarrollo
-- organizacional (la misma puerta de la vista `planilla_por_sede`, que es security_invoker). Sin Dynamic en la base
-- (local), nadie.
create or replace function retail.fn_planilla_visible() returns boolean
language plpgsql stable security definer set search_path = retail, public, extensions as $$
declare v boolean;
begin
  if to_regclass('retail.planilla_por_sede') is null or to_regprocedure('public.fn_es_admin_o_lider()') is null then
    return false;
  end if;
  execute 'select coalesce(public.fn_es_admin_o_lider(), false)' into v;
  return coalesce(v, false);
end $$;

-- La planilla pagada que TERMINA en el rango, por ubicación de retail. Dynamic la cierra del 29 al 28: el período
-- «29-jul al 28-ago» es la planilla de agosto (D-35: no se reparte entre meses). La sede se une por
-- `ubicaciones.sede_dynamic_id`; la sede de tipo taller de Dynamic es el Taller de retail (su código `LIM` NO es la
-- tienda de Lima); la central y la oficina son «de la empresa» (ubicación nula).
create or replace function retail.fn_planilla_periodos(p_desde date, p_hasta date)
returns table (ubicacion_id uuid, sede_codigo text, periodo_id uuid, fecha_ini date, fecha_fin date, personas bigint, costo numeric)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
begin
  if not retail.fn_planilla_visible() then
    return;
  end if;
  return query execute $q$
    select coalesce(u.id, case when p.sede_tipo = 'taller' then
             (select t.id from retail.ubicaciones t where t.tipo = 'taller' order by t.activo desc, t.created_at limit 1) end),
           p.sede_codigo::text, p.periodo_id::uuid, p.fecha_ini::date, p.fecha_fin::date, p.personas::bigint, p.costo_total::numeric
      from retail.planilla_por_sede p
      left join public.sedes s on s.codigo = p.sede_codigo
      left join retail.ubicaciones u on u.sede_dynamic_id = s.id
     where p.fecha_fin between $1 and $2
  $q$ using p_desde, p_hasta;
end $$;

-- ---------- 3. El diario ----------
-- CONTRATO. Promete: líneas debe/haber con su origen; cada asiento cuadra salvo que una fuente tenga datos que no cuadran
-- (se ven con `fn_asientos_descuadrados`); `p_hasta` es INCLUSIVO; fechas de Lima. `p_ubicacion_id` nulo = todo lo que la
-- cuenta ve (el líder, también lo «de la empresa», con ubicación nula). Asume: fechas y costos correctos en las fuentes;
-- jamás las modifica.
create or replace function retail.fn_asientos(p_desde date, p_hasta date, p_ubicacion_id uuid default null)
returns table (
  fecha date, ubicacion_id uuid, asiento text, regla text, cuenta text,
  debe numeric, haber numeric, origen_tabla text, origen_id uuid, glosa text
)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
#variable_conflict use_column
declare
  v_lider boolean := retail.fn_es_lider();
  v_ubics uuid[] := retail.fn_diario_ubicaciones();
  v_todo boolean;
  v_ini timestamptz;
  v_fin timestamptz;
begin
  if p_desde is null or p_hasta is null or p_hasta < p_desde then
    raise exception 'El rango de fechas no es válido.' using errcode = 'P0001';
  end if;
  if not v_lider and coalesce(cardinality(v_ubics), 0) = 0 then
    raise exception 'Ver los números financieros necesita el módulo «Reportes financieros» en tu rol.' using errcode = '42501';
  end if;
  if p_ubicacion_id is not null then
    if not (p_ubicacion_id = any (v_ubics)) then
      raise exception 'No puedes ver los números de esa ubicación.' using errcode = '42501';
    end if;
    v_ubics := array[p_ubicacion_id];
  end if;
  v_todo := v_lider and p_ubicacion_id is null;
  -- Límites en instantes reales (no fechas): el índice por fecha sirve, y la frontera es la medianoche DE LIMA.
  v_ini := (p_desde::timestamp at time zone 'America/Lima');
  v_fin := ((p_hasta + 1)::timestamp at time zone 'America/Lima');

  return query
  with
  -- ===== Ventas del rango (también las luego anuladas: la venta ocurrió; la anulación la revierte en su día)
  vt as (
    select v.id, v.ubicacion_id, (v.created_at at time zone 'America/Lima')::date as f,
           sum(vi.subtotal) as tot, sum(vi.costo_unitario * vi.cantidad) as costo
      from retail.ventas v
      join retail.venta_items vi on vi.venta_id = v.id
     where v.created_at >= v_ini and v.created_at < v_fin and not coalesce(v.es_prueba, false)
       and (v_todo or v.ubicacion_id = any (v_ubics))
     group by v.id, v.ubicacion_id, v.created_at
  ),
  vv as (select vt.*, round(vt.tot - vt.tot / (1 + retail.fn_tasa_igv(vt.f)), 2) as igv from vt),
  -- ===== Anulaciones del rango (por la fecha en que se anuló; la venta pudo ser de otro mes)
  an as (
    select v.id, v.ubicacion_id, (v.anulado_en at time zone 'America/Lima')::date as f,
           (v.created_at at time zone 'America/Lima')::date as f_venta,
           sum(vi.subtotal) as tot,
           coalesce(sum(vi.costo_unitario * vi.cantidad) filter (where coalesce(ai.condicion, 'vendible') = 'vendible'), 0) as costo_ok,
           coalesce(sum(vi.costo_unitario * vi.cantidad) filter (where coalesce(ai.condicion, 'vendible') <> 'vendible'), 0) as costo_mal
      from retail.ventas v
      join retail.venta_items vi on vi.venta_id = v.id
      left join retail.venta_anulacion_items ai on ai.venta_item_id = vi.id
     where v.estado = 'anulada' and v.anulado_en >= v_ini and v.anulado_en < v_fin and not coalesce(v.es_prueba, false)
       and (v_todo or v.ubicacion_id = any (v_ubics))
     group by v.id, v.ubicacion_id, v.anulado_en, v.created_at
  ),
  aa as (select an.*, round(an.tot - an.tot / (1 + retail.fn_tasa_igv(an.f_venta)), 2) as igv from an),
  -- Cómo se cobró cada venta. Un pago «anticipo» es el adelanto de una separación: la plata entró el día que se separó
  -- (122) y su IGV ya se declaró con la boleta de anticipo, así que aquí se aplica sin IGV y su IGV se descuenta.
  cobro as (
    select vp.venta_id, vp.metodo, vp.monto,
           case when vp.metodo = 'anticipo' then coalesce(
             (select round(vp.monto - vp.monto / (1 + retail.fn_tasa_igv((s.created_at at time zone 'America/Lima')::date)), 2)
                from retail.separaciones s where s.venta_id = vp.venta_id limit 1), 0)
           else 0 end as igv_ant
      from retail.venta_pagos vp
     where vp.venta_id in (select vv.id from vv union select aa.id from aa)
  ),
  l_venta as (
    select vv.f, vv.ubicacion_id, 'venta:' || vv.id as asiento, 'venta'::text as regla,
           retail.fn_asiento_cuenta_de_medio(c.metodo, 'entra') as cuenta, c.monto - c.igv_ant as debe, 0::numeric as haber,
           'ventas'::text as ot, vv.id as oid,
           case when c.metodo = 'anticipo' then 'Se aplica el adelanto de la separación' else 'Cobro (' || c.metodo || ')' end as glosa
      from vv join cobro c on c.venta_id = vv.id
    union all
    select vv.f, vv.ubicacion_id, 'venta:' || vv.id, 'venta', '4011', c.igv_ant, 0, 'ventas', vv.id, 'IGV del adelanto (ya declarado al cobrarlo)'
      from vv join cobro c on c.venta_id = vv.id where c.igv_ant > 0
    union all
    select vv.f, vv.ubicacion_id, 'venta:' || vv.id, 'venta', '7011', 0, vv.tot - vv.igv, 'ventas', vv.id, 'Venta sin IGV'
      from vv where vv.tot - vv.igv > 0
    union all
    select vv.f, vv.ubicacion_id, 'venta:' || vv.id, 'venta', '4011', 0, vv.igv, 'ventas', vv.id, 'IGV de la venta'
      from vv where vv.igv > 0
    union all
    select vv.f, vv.ubicacion_id, 'venta:' || vv.id, 'venta', '691', vv.costo, 0, 'ventas', vv.id, 'Costo de lo vendido (sellado en la venta)'
      from vv where vv.costo > 0
    union all
    select vv.f, vv.ubicacion_id, 'venta:' || vv.id, 'venta', '201', 0, vv.costo, 'ventas', vv.id, 'Sale la mercadería'
      from vv where vv.costo > 0
  ),
  l_anul as (
    select aa.f, aa.ubicacion_id, 'anulacion:' || aa.id as asiento, 'anulacion'::text as regla,
           '7011'::text as cuenta, aa.tot - aa.igv as debe, 0::numeric as haber, 'ventas'::text as ot, aa.id as oid,
           'Se revierte la venta sin IGV' as glosa
      from aa where aa.tot - aa.igv > 0
    union all
    select aa.f, aa.ubicacion_id, 'anulacion:' || aa.id, 'anulacion', '4011', aa.igv, 0, 'ventas', aa.id, 'Se revierte el IGV'
      from aa where aa.igv > 0
    union all
    select aa.f, aa.ubicacion_id, 'anulacion:' || aa.id, 'anulacion', retail.fn_asiento_cuenta_de_medio(c.metodo, 'sale'),
           0, c.monto - c.igv_ant, 'ventas', aa.id, 'Se devuelve el cobro (' || c.metodo || ')'
      from aa join cobro c on c.venta_id = aa.id
    union all
    select aa.f, aa.ubicacion_id, 'anulacion:' || aa.id, 'anulacion', '4011', 0, c.igv_ant, 'ventas', aa.id, 'IGV del adelanto'
      from aa join cobro c on c.venta_id = aa.id where c.igv_ant > 0
    union all
    select aa.f, aa.ubicacion_id, 'anulacion:' || aa.id, 'anulacion', '201', aa.costo_ok, 0, 'ventas', aa.id, 'La prenda vuelve a la mercadería'
      from aa where aa.costo_ok > 0
    union all
    select aa.f, aa.ubicacion_id, 'anulacion:' || aa.id, 'anulacion', '659', aa.costo_mal, 0, 'ventas', aa.id, 'Prenda que no se puede vender: pasa a merma'
      from aa where aa.costo_mal > 0
    union all
    select aa.f, aa.ubicacion_id, 'anulacion:' || aa.id, 'anulacion', '691', 0, aa.costo_ok + aa.costo_mal, 'ventas', aa.id, 'Se revierte el costo de lo vendido'
      from aa where aa.costo_ok + aa.costo_mal > 0
  ),

  -- ===== Devoluciones aprobadas del rango (valoradas por las LÍNEAS devueltas, no por `reembolso_monto`, que es libre)
  dv as (
    select d.id, v.ubicacion_id, (d.aprobado_en at time zone 'America/Lima')::date as f,
           (v.created_at at time zone 'America/Lima')::date as f_venta, d.reembolso_metodo as metodo,
           sum((vi.precio_unitario - vi.descuento_unitario) * di.cantidad) as tot,
           sum(vi.costo_unitario * di.cantidad) as costo
      from retail.devoluciones d
      join retail.ventas v on v.id = d.venta_id
      join retail.devolucion_items di on di.devolucion_id = d.id
      join retail.venta_items vi on vi.id = di.venta_item_id
     where d.estado = 'aprobada' and d.aprobado_en >= v_ini and d.aprobado_en < v_fin and not coalesce(v.es_prueba, false)
       and (v_todo or v.ubicacion_id = any (v_ubics))
     group by d.id, v.ubicacion_id, d.aprobado_en, v.created_at, d.reembolso_metodo
  ),
  dd as (select dv.*, round(dv.tot - dv.tot / (1 + retail.fn_tasa_igv(dv.f_venta)), 2) as igv from dv),
  l_devol as (
    select dd.f, dd.ubicacion_id, 'devolucion:' || dd.id as asiento, 'devolucion'::text as regla,
           '7011'::text as cuenta, dd.tot - dd.igv as debe, 0::numeric as haber, 'devoluciones'::text as ot, dd.id as oid,
           'Se revierte la venta sin IGV' as glosa
      from dd where dd.tot - dd.igv > 0
    union all
    select dd.f, dd.ubicacion_id, 'devolucion:' || dd.id, 'devolucion', '4011', dd.igv, 0, 'devoluciones', dd.id, 'Se revierte el IGV'
      from dd where dd.igv > 0
    union all
    select dd.f, dd.ubicacion_id, 'devolucion:' || dd.id, 'devolucion', retail.fn_asiento_cuenta_de_medio(dd.metodo, 'sale'),
           0, dd.tot, 'devoluciones', dd.id, 'Reembolso (' || coalesce(dd.metodo, 'efectivo') || ')'
      from dd where dd.tot > 0
    union all
    select dd.f, dd.ubicacion_id, 'devolucion:' || dd.id, 'devolucion', '201', dd.costo, 0, 'devoluciones', dd.id, 'La prenda vuelve al inventario'
      from dd where dd.costo > 0
    union all
    select dd.f, dd.ubicacion_id, 'devolucion:' || dd.id, 'devolucion', '691', 0, dd.costo, 'devoluciones', dd.id, 'Se revierte el costo de lo vendido'
      from dd where dd.costo > 0
  ),

  -- ===== Cambios del rango: la diferencia de precio y el ajuste de costo entre la prenda vieja y la nueva
  cb as (
    select c.id, v.ubicacion_id, (c.created_at at time zone 'America/Lima')::date as f, c.diferencia, c.metodo_pago_diferencia as metodo,
           round(abs(c.diferencia) - abs(c.diferencia) / (1 + retail.fn_tasa_igv((c.created_at at time zone 'America/Lima')::date)), 2) as igv,
           -- Solo si AMBAS prendas tienen costo: con una en 0 el «ajuste» sería el costo entero de la otra.
           case when vi.costo_unitario > 0 and retail.fn_costo_variante_al(c.variante_nueva_id, c.created_at) > 0
                then (retail.fn_costo_variante_al(c.variante_nueva_id, c.created_at) - vi.costo_unitario) * c.cantidad
                else 0 end as dcosto
      from retail.cambios c
      join retail.venta_items vi on vi.id = c.venta_item_id
      join retail.ventas v on v.id = vi.venta_id
     where c.created_at >= v_ini and c.created_at < v_fin and not coalesce(v.es_prueba, false)
       and (v_todo or v.ubicacion_id = any (v_ubics))
  ),
  l_cambio as (
    select cb.f, cb.ubicacion_id, 'cambio:' || cb.id as asiento, 'cambio'::text as regla,
           retail.fn_asiento_cuenta_de_medio(cb.metodo, 'entra') as cuenta, cb.diferencia as debe, 0::numeric as haber,
           'cambios'::text as ot, cb.id as oid, 'La clienta pagó la diferencia' as glosa
      from cb where cb.diferencia > 0
    union all
    select cb.f, cb.ubicacion_id, 'cambio:' || cb.id, 'cambio', '7011', 0, cb.diferencia - cb.igv, 'cambios', cb.id, 'Diferencia sin IGV'
      from cb where cb.diferencia > 0 and cb.diferencia - cb.igv > 0
    union all
    select cb.f, cb.ubicacion_id, 'cambio:' || cb.id, 'cambio', '4011', 0, cb.igv, 'cambios', cb.id, 'IGV de la diferencia'
      from cb where cb.diferencia > 0 and cb.igv > 0
    union all
    select cb.f, cb.ubicacion_id, 'cambio:' || cb.id, 'cambio', '7011', -cb.diferencia - cb.igv, 0, 'cambios', cb.id, 'Se revierte la diferencia sin IGV'
      from cb where cb.diferencia < 0 and -cb.diferencia - cb.igv > 0
    union all
    select cb.f, cb.ubicacion_id, 'cambio:' || cb.id, 'cambio', '4011', cb.igv, 0, 'cambios', cb.id, 'Se revierte el IGV de la diferencia'
      from cb where cb.diferencia < 0 and cb.igv > 0
    union all
    select cb.f, cb.ubicacion_id, 'cambio:' || cb.id, 'cambio', retail.fn_asiento_cuenta_de_medio(cb.metodo, 'sale'), 0, -cb.diferencia,
           'cambios', cb.id, 'Se le devolvió la diferencia'
      from cb where cb.diferencia < 0
    union all
    select cb.f, cb.ubicacion_id, 'cambio:' || cb.id, 'cambio', '691', cb.dcosto, 0, 'cambios', cb.id, 'La prenda nueva cuesta más'
      from cb where cb.dcosto > 0
    union all
    select cb.f, cb.ubicacion_id, 'cambio:' || cb.id, 'cambio', '201', 0, cb.dcosto, 'cambios', cb.id, 'Ajuste de mercadería'
      from cb where cb.dcosto > 0
    union all
    select cb.f, cb.ubicacion_id, 'cambio:' || cb.id, 'cambio', '201', -cb.dcosto, 0, 'cambios', cb.id, 'Ajuste de mercadería'
      from cb where cb.dcosto < 0
    union all
    select cb.f, cb.ubicacion_id, 'cambio:' || cb.id, 'cambio', '691', 0, -cb.dcosto, 'cambios', cb.id, 'La prenda nueva cuesta menos'
      from cb where cb.dcosto < 0
  ),

  -- ===== Mermas del rango, al costo de ESA fecha (`fn_es_merma`: una sola definición)
  mm as (
    select m.id, m.ubicacion_id, (m.created_at at time zone 'America/Lima')::date as f,
           case when m.tipo = 'ajuste' and m.motivo = 'merma' then 'merma'
                when m.tipo = 'salida' then 'cuarentena'
                else 'conteo' end as origen,
           abs(m.cantidad) * retail.fn_costo_variante_al(m.variante_id, m.created_at) as valor
      from retail.movimientos m
     where m.created_at >= v_ini and m.created_at < v_fin
       and m.variante_id <> '22222222-2222-4222-8222-222222222222'
       and retail.fn_es_merma(m.tipo, m.motivo, m.cantidad)
       and (v_todo or m.ubicacion_id = any (v_ubics))
  ),
  l_merma as (
    select mm.f, mm.ubicacion_id, 'merma:' || mm.id as asiento, ('merma_' || mm.origen)::text as regla,
           '659'::text as cuenta, mm.valor as debe, 0::numeric as haber, 'movimientos'::text as ot, mm.id as oid,
           'Merma al costo de ese día' as glosa
      from mm where mm.valor > 0
    union all
    select mm.f, mm.ubicacion_id, 'merma:' || mm.id, 'merma_' || mm.origen, '201', 0, mm.valor, 'movimientos', mm.id, 'Sale la mercadería'
      from mm where mm.valor > 0
  ),

  -- ===== Separaciones: el adelanto entra el día que se separa (122 + su IGV, como la boleta de anticipo) y, si se
  -- devuelve, sale el día que se devuelve. Si la separación se entrega, la venta lo aplica (ver `cobro`).
  sp as (
    select s.id, s.ubicacion_id, (s.created_at at time zone 'America/Lima')::date as f, s.adelanto,
           round(s.adelanto - s.adelanto / (1 + retail.fn_tasa_igv((s.created_at at time zone 'America/Lima')::date)), 2) as igv
      from retail.separaciones s
     where s.created_at >= v_ini and s.created_at < v_fin and (v_todo or s.ubicacion_id = any (v_ubics))
  ),
  sd as (
    select s.id, s.ubicacion_id, (s.devuelta_en at time zone 'America/Lima')::date as f, s.adelanto, s.devolucion_medio_real as medio,
           round(s.adelanto - s.adelanto / (1 + retail.fn_tasa_igv((s.created_at at time zone 'America/Lima')::date)), 2) as igv
      from retail.separaciones s
     where s.estado = 'devuelta' and s.devuelta_en >= v_ini and s.devuelta_en < v_fin and (v_todo or s.ubicacion_id = any (v_ubics))
  ),
  l_anticipo as (
    select sp.f, sp.ubicacion_id, 'anticipo:' || sp.id as asiento, 'anticipo'::text as regla,
           retail.fn_asiento_cuenta_de_medio(p.metodo, 'entra') as cuenta, p.monto as debe, 0::numeric as haber,
           'separaciones'::text as ot, sp.id as oid, 'Adelanto de la separación (' || p.metodo || ')' as glosa
      from sp join retail.separacion_pagos p on p.separacion_id = sp.id
    union all
    select sp.f, sp.ubicacion_id, 'anticipo:' || sp.id, 'anticipo', '122', 0, sp.adelanto - sp.igv, 'separaciones', sp.id, 'Se le debe a la clienta hasta entregar'
      from sp
    union all
    select sp.f, sp.ubicacion_id, 'anticipo:' || sp.id, 'anticipo', '4011', 0, sp.igv, 'separaciones', sp.id, 'IGV de la boleta de anticipo'
      from sp where sp.igv > 0
    union all
    select sd.f, sd.ubicacion_id, 'anticipo_devuelto:' || sd.id, 'anticipo_devuelto', '122', sd.adelanto - sd.igv, 0, 'separaciones', sd.id, 'Se devuelve el adelanto'
      from sd
    union all
    select sd.f, sd.ubicacion_id, 'anticipo_devuelto:' || sd.id, 'anticipo_devuelto', '4011', sd.igv, 0, 'separaciones', sd.id, 'Se revierte el IGV del anticipo'
      from sd where sd.igv > 0
    union all
    select sd.f, sd.ubicacion_id, 'anticipo_devuelto:' || sd.id, 'anticipo_devuelto', retail.fn_asiento_cuenta_de_medio(sd.medio, 'sale'),
           0, sd.adelanto, 'separaciones', sd.id, 'Devolución del adelanto (' || sd.medio || ')'
      from sd
  ),

  -- ===== Gastos vigentes del rango (un gasto anulado se registró por error: nunca existió). La cuenta sale de su
  -- categoría. Con comprobante, la deuda con el proveedor (421) y el pago aparte; sin él, el medio con que se pagó.
  -- La comisión del POS (F3) es un gasto que ya descontó el abono de tarjeta: sale de la cuenta por abonar (105), no del
  -- medio con que se anotó.
  gg as (
    select g.id, g.ubicacion_id, g.fecha as f, g.monto_total, g.igv, g.compra_id, g.medio_pago, g.descripcion, k.cuenta_pcge,
           (select cd.cuenta_contable from retail.movimientos_dinero md join retail.cuentas_dinero cd on cd.id = md.cuenta_origen_id
             where md.gasto_comision_id = g.id limit 1) as cta_comision
      from retail.gastos g join retail.categorias_gasto k on k.codigo = g.categoria
     where g.estado = 'vigente' and g.fecha between p_desde and p_hasta and (v_todo or g.ubicacion_id = any (v_ubics))
  ),
  l_gasto as (
    select gg.f, gg.ubicacion_id, 'gasto:' || gg.id as asiento, 'gasto'::text as regla, gg.cuenta_pcge::text as cuenta,
           gg.monto_total - gg.igv as debe, 0::numeric as haber, 'gastos'::text as ot, gg.id as oid, gg.descripcion as glosa
      from gg where gg.monto_total - gg.igv > 0
    union all
    select gg.f, gg.ubicacion_id, 'gasto:' || gg.id, 'gasto', '4011', gg.igv, 0, 'gastos', gg.id, 'IGV que se descuenta'
      from gg where gg.igv > 0
    union all
    select gg.f, gg.ubicacion_id, 'gasto:' || gg.id, 'gasto',
           case when gg.compra_id is not null then '421'
                when gg.cta_comision is not null then gg.cta_comision
                else retail.fn_asiento_cuenta_de_medio(gg.medio_pago, 'sale') end,
           0, gg.monto_total, 'gastos', gg.id,
           case when gg.compra_id is not null then 'Se le debe al proveedor'
                when gg.cta_comision is not null then 'Lo descontó el abono de tarjeta'
                else 'Pagado (' || gg.medio_pago || ')' end
      from gg
  ),

  -- ===== Facturas de MERCADERÍA vigentes (entra la mercadería, se le debe al proveedor). La de gasto o activo va por su
  -- propia regla, que ya dice qué fue.
  cm as (
    select c.id, c.ubicacion_gestion_id as ubicacion_id, c.fecha_emision as f, c.subtotal, c.igv, c.total,
           coalesce(c.documento, concat_ws('-', c.serie, c.numero)) as doc
      from retail.compras c
     where c.naturaleza = 'mercaderia' and c.estado = 'vigente' and c.fecha_emision between p_desde and p_hasta
       and (v_todo or c.ubicacion_gestion_id = any (v_ubics))
  ),
  l_compra as (
    select cm.f, cm.ubicacion_id, 'compra:' || cm.id as asiento, 'compra'::text as regla, '201'::text as cuenta,
           cm.subtotal as debe, 0::numeric as haber, 'compras'::text as ot, cm.id as oid, 'Mercadería · ' || cm.doc as glosa
      from cm where cm.subtotal > 0
    union all
    select cm.f, cm.ubicacion_id, 'compra:' || cm.id, 'compra', '4011', cm.igv, 0, 'compras', cm.id, 'IGV que se descuenta'
      from cm where cm.igv > 0
    union all
    select cm.f, cm.ubicacion_id, 'compra:' || cm.id, 'compra', '421', 0, cm.total, 'compras', cm.id, 'Se le debe al proveedor'
      from cm where cm.total > 0
  ),

  -- ===== Activos fijos: el alta (costo SIN el IGV de su factura), la depreciación de cada mes y la baja.
  af as (
    select a.id, a.ubicacion_id, a.fecha_adquisicion as f, a.costo, a.valor_residual, a.vida_util_meses, a.depreciacion_apertura,
           a.fecha_adquisicion, a.fecha_baja, a.estado, a.medio_pago, a.compra_id, a.nombre,
           coalesce(a.cuenta_codigo, t.cuenta_pcge, '336') as cta, c.igv as c_igv, c.total as c_total
      from retail.activos_fijos a
      left join retail.tipos_activo t on t.codigo = a.tipo
      left join retail.compras c on c.id = a.compra_id
     where a.estado <> 'anulado' and (v_todo or a.ubicacion_id = any (v_ubics))
  ),
  l_activo as (
    select af.f, af.ubicacion_id, 'activo:' || af.id as asiento, 'activo'::text as regla, af.cta as cuenta,
           af.costo as debe, 0::numeric as haber, 'activos_fijos'::text as ot, af.id as oid, af.nombre as glosa
      from af where af.f between p_desde and p_hasta
    union all
    select af.f, af.ubicacion_id, 'activo:' || af.id, 'activo', '4011', af.c_igv, 0, 'activos_fijos', af.id, 'IGV que se descuenta'
      from af where af.f between p_desde and p_hasta and af.compra_id is not null and af.c_igv > 0
    union all
    select af.f, af.ubicacion_id, 'activo:' || af.id, 'activo',
           case when af.compra_id is not null then '421' else retail.fn_asiento_cuenta_de_medio(af.medio_pago, 'sale') end,
           0, case when af.compra_id is not null then af.c_total else af.costo end, 'activos_fijos', af.id,
           case when af.compra_id is not null then 'Se le debe al proveedor' else 'Pagado (' || af.medio_pago || ')' end
      from af where af.f between p_desde and p_hasta
  ),
  -- Depreciación de cada mes que TERMINA en el rango: lo acumulado a fin de mes menos lo acumulado a fin del mes anterior
  -- (la misma cuenta que `fn_depreciacion_mes`, F2b): los meses de un activo suman exactamente su costo.
  meses as (
    select (m + interval '1 month - 1 day')::date as fin, (m - interval '1 day')::date as fin_ant
      from generate_series(date_trunc('month', p_desde::timestamp), date_trunc('month', p_hasta::timestamp), interval '1 month') m
  ),
  dep as (
    select af.id, af.ubicacion_id, ms.fin as f,
           least(af.costo - af.valor_residual, round((af.costo - af.valor_residual) / af.vida_util_meses
                 * retail.fn_meses_depreciados(af.fecha_adquisicion, af.vida_util_meses, ms.fin, af.fecha_baja), 2))
         - least(af.costo - af.valor_residual, round((af.costo - af.valor_residual) / af.vida_util_meses
                 * retail.fn_meses_depreciados(af.fecha_adquisicion, af.vida_util_meses, ms.fin_ant, af.fecha_baja), 2)) as monto,
           af.nombre
      from af cross join meses ms
     where af.estado in ('activo', 'baja') and ms.fin between p_desde and p_hasta and af.fecha_adquisicion <= ms.fin
  ),
  -- La baja: lo que faltaba depreciar se pierde ese día (655) y el activo sale de la cuenta.
  bj as (
    select af.id, af.ubicacion_id, af.fecha_baja as f, af.costo, af.cta, af.nombre,
           least(af.costo, least(af.costo - af.valor_residual, round((af.costo - af.valor_residual) / af.vida_util_meses
                 * retail.fn_meses_depreciados(af.fecha_adquisicion, af.vida_util_meses, af.fecha_baja, af.fecha_baja), 2))
                 + af.depreciacion_apertura) as acumulada
      from af where af.estado = 'baja' and af.fecha_baja between p_desde and p_hasta
  ),
  l_dep as (
    select dep.f, dep.ubicacion_id, 'depreciacion:' || dep.id || ':' || to_char(dep.f, 'YYYY-MM') as asiento, 'depreciacion'::text as regla,
           '681'::text as cuenta, dep.monto as debe, 0::numeric as haber, 'activos_fijos'::text as ot, dep.id as oid,
           'Depreciación de ' || dep.nombre as glosa
      from dep where dep.monto > 0
    union all
    select dep.f, dep.ubicacion_id, 'depreciacion:' || dep.id || ':' || to_char(dep.f, 'YYYY-MM'), 'depreciacion', '391', 0, dep.monto,
           'activos_fijos', dep.id, 'Depreciación acumulada'
      from dep where dep.monto > 0
    union all
    select bj.f, bj.ubicacion_id, 'baja_activo:' || bj.id, 'baja_activo', '391', bj.acumulada, 0, 'activos_fijos', bj.id, 'Sale lo ya depreciado'
      from bj where bj.acumulada > 0
    union all
    select bj.f, bj.ubicacion_id, 'baja_activo:' || bj.id, 'baja_activo', '655', bj.costo - bj.acumulada, 0, 'activos_fijos', bj.id,
           'Lo que faltaba depreciar de ' || bj.nombre
      from bj where bj.costo - bj.acumulada > 0
    union all
    select bj.f, bj.ubicacion_id, 'baja_activo:' || bj.id, 'baja_activo', bj.cta, 0, bj.costo, 'activos_fijos', bj.id, 'Sale el activo'
      from bj
  ),

  -- ===== Planilla de Dynamic (D-33): solo si quien mira puede verla allá.
  pl as (
    select * from retail.fn_planilla_periodos(p_desde, p_hasta) p where (v_todo or p.ubicacion_id = any (v_ubics))
  ),
  l_planilla as (
    select pl.fecha_fin as f, pl.ubicacion_id, 'planilla:' || pl.periodo_id || ':' || pl.sede_codigo as asiento, 'planilla'::text as regla,
           '62'::text as cuenta, pl.costo as debe, 0::numeric as haber, 'planilla_por_sede'::text as ot, pl.periodo_id as oid,
           'Planilla del ' || to_char(pl.fecha_ini, 'DD/MM') || ' al ' || to_char(pl.fecha_fin, 'DD/MM') || ' · ' || pl.personas || ' personas (Dynamic)' as glosa
      from pl where pl.costo > 0
    union all
    select pl.fecha_fin, pl.ubicacion_id, 'planilla:' || pl.periodo_id || ':' || pl.sede_codigo, 'planilla', '41', 0, pl.costo,
           'planilla_por_sede', pl.periodo_id, 'Remuneraciones por pagar'
      from pl where pl.costo > 0
  ),

  -- ===== Notas de crédito de proveedor: bajan la deuda y lo que se registró (la mercadería, el gasto o el activo).
  nc as (
    select n.id, c.ubicacion_gestion_id as ubicacion_id, n.fecha as f, n.subtotal, n.igv, n.monto, n.serie_numero,
           case c.naturaleza
             when 'gasto' then (select k.cuenta_pcge from retail.gastos g join retail.categorias_gasto k on k.codigo = g.categoria
                                 where g.compra_id = c.id order by (g.estado = 'vigente') desc limit 1)
             when 'activo' then (select coalesce(a.cuenta_codigo, '336') from retail.activos_fijos a
                                  where a.compra_id = c.id order by (a.estado <> 'anulado') desc limit 1)
             else '201' end as cta
      from retail.compra_notas_credito n join retail.compras c on c.id = n.compra_id
     where c.estado = 'vigente' and n.fecha between p_desde and p_hasta and (v_todo or c.ubicacion_gestion_id = any (v_ubics))
  ),
  l_nc as (
    select nc.f, nc.ubicacion_id, 'nota_credito_prov:' || nc.id as asiento, 'nota_credito_prov'::text as regla, '421'::text as cuenta,
           nc.monto as debe, 0::numeric as haber, 'compra_notas_credito'::text as ot, nc.id as oid, 'Nota de crédito ' || nc.serie_numero as glosa
      from nc
    union all
    select nc.f, nc.ubicacion_id, 'nota_credito_prov:' || nc.id, 'nota_credito_prov', coalesce(nc.cta, '201'), 0, nc.subtotal,
           'compra_notas_credito', nc.id, 'Baja lo que costó'
      from nc where nc.subtotal > 0
    union all
    select nc.f, nc.ubicacion_id, 'nota_credito_prov:' || nc.id, 'nota_credito_prov', '4011', 0, nc.igv, 'compra_notas_credito', nc.id, 'Baja el IGV descontable'
      from nc where nc.igv > 0
  ),

  -- ===== Pagos a proveedores (mercadería, gasto o activo) y reembolsos. Un pago con «saldo a favor» no mueve plata: pasa
  -- un crédito del mismo proveedor de una factura a otra (421 contra 421), así que no asienta.
  pg as (
    select p.id, coalesce(p.ubicacion_id, c.ubicacion_gestion_id) as ubicacion_id, p.fecha as f, p.monto, p.metodo,
           coalesce(c.documento, concat_ws('-', c.serie, c.numero)) as doc
      from retail.compra_pagos p join retail.compras c on c.id = p.compra_id
     where c.estado = 'vigente' and p.metodo <> 'saldo_a_favor' and p.fecha between p_desde and p_hasta
       and (v_todo or coalesce(p.ubicacion_id, c.ubicacion_gestion_id) = any (v_ubics))
  ),
  rb as (
    select r.id, (select c.ubicacion_gestion_id from retail.compras c where c.id = r.compra_id) as ubicacion_id, r.fecha as f, r.monto, r.metodo
      from retail.proveedor_creditos r
     where r.tipo = 'reembolso' and r.fecha between p_desde and p_hasta
  ),
  l_pago as (
    select pg.f, pg.ubicacion_id, 'pago_proveedor:' || pg.id as asiento, 'pago_proveedor'::text as regla, '421'::text as cuenta,
           pg.monto as debe, 0::numeric as haber, 'compra_pagos'::text as ot, pg.id as oid, 'Pago de ' || pg.doc as glosa
      from pg
    union all
    select pg.f, pg.ubicacion_id, 'pago_proveedor:' || pg.id, 'pago_proveedor', retail.fn_asiento_cuenta_de_medio(pg.metodo, 'sale'), 0, pg.monto,
           'compra_pagos', pg.id, 'Sale por ' || pg.metodo
      from pg
    union all
    select rb.f, rb.ubicacion_id, 'reembolso_prov:' || rb.id, 'reembolso_prov', retail.fn_asiento_cuenta_de_medio(rb.metodo, 'entra'), rb.monto, 0,
           'proveedor_creditos', rb.id, 'El proveedor devolvió plata (' || rb.metodo || ')'
      from rb where (v_todo or rb.ubicacion_id = any (v_ubics))
    union all
    select rb.f, rb.ubicacion_id, 'reembolso_prov:' || rb.id, 'reembolso_prov', '421', 0, rb.monto, 'proveedor_creditos', rb.id, 'Baja el saldo a favor'
      from rb where (v_todo or rb.ubicacion_id = any (v_ubics))
  ),

  todo as (
    select * from l_venta union all select * from l_anul union all select * from l_devol union all select * from l_cambio
    union all select * from l_merma union all select * from l_anticipo union all select * from l_gasto
    union all select * from l_compra union all select * from l_activo union all select * from l_dep
    union all select * from l_planilla union all select * from l_nc union all select * from l_pago
  )
  select t.f, t.ubicacion_id, t.asiento, t.regla, t.cuenta, t.debe, t.haber, t.ot, t.oid, t.glosa
    from todo t
   where t.debe <> 0 or t.haber <> 0
   order by t.f, t.asiento, t.debe desc, t.cuenta;
end $$;
comment on function retail.fn_asientos(date, date, uuid) is
  'Diario derivado (ADR-0198 C, ADR-0120, ADR-0195 F5): genera las líneas debe/haber desde las operaciones (ventas, anulaciones, devoluciones, cambios, mermas, separaciones, gastos, facturas, activos, planilla, notas de crédito y pagos a proveedores). Única casa de las reglas de posteo. No guarda nada.';

-- Los asientos cuyo debe no es igual al haber. Debe estar SIEMPRE vacío; si no, una fuente tiene datos que no cuadran y
-- lo que se calcule encima miente. El Estado de resultados lo avisa en rojo.
create or replace function retail.fn_asientos_descuadrados(p_desde date, p_hasta date, p_ubicacion_id uuid default null)
returns table (asiento text, regla text, ubicacion_id uuid, fecha date, debe numeric, haber numeric, diferencia numeric)
language sql stable security definer set search_path = retail, public, extensions as $$
  select a.asiento, min(a.regla), (array_agg(a.ubicacion_id))[1], min(a.fecha), sum(a.debe), sum(a.haber), sum(a.debe) - sum(a.haber)
    from retail.fn_asientos(p_desde, p_hasta, p_ubicacion_id) a
   group by a.asiento
  having round(sum(a.debe), 2) <> round(sum(a.haber), 2)
   order by 1;
$$;

-- ---------- 4. El Estado de resultados ----------
-- Lee SOLO del diario. Estructura (manual contable §3, spike «¿Ganamos?»):
--     Ventas (7011 + 7012, sin IGV) − Costo de lo vendido (691) − Fletes (609) − Mermas (659) = MARGEN BRUTO
--   − Gastos de operación (planilla 62, alquileres 635, servicios 636, …, depreciación 681, bajas 655) = RESULTADO
-- Una fila por ubicación que la cuenta ve; para el líder sin filtro, además «De la empresa» (gastos sin tienda, D-32) y el
-- CONSOLIDADO, que es la suma exacta de todas las filas.
create or replace function retail.fn_estado_resultados(p_desde date, p_hasta date, p_ubicacion_id uuid default null)
returns table (
  ubicacion_id uuid, unidad text, nombre text, orden integer,
  ventas_netas numeric, costo_ventas numeric, fletes numeric, mermas numeric, margen_bruto numeric,
  planilla numeric, depreciacion numeric, gastos_operacion numeric, resultado numeric, igv_ventas numeric,
  detalle_gastos jsonb, detalle_mermas jsonb,
  unidades_sin_costo bigint, mermas_sin_costo bigint, asientos_descuadrados bigint,
  planilla_visible boolean, planilla_nota text
)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
#variable_conflict use_column
declare
  v_lider boolean := retail.fn_es_lider();
  v_ubics uuid[] := retail.fn_diario_ubicaciones();
  v_todo boolean;
  v_ini timestamptz;
  v_fin timestamptz;
  v_planilla boolean := retail.fn_planilla_visible();
begin
  if p_desde is null or p_hasta is null or p_hasta < p_desde then
    raise exception 'El rango de fechas no es válido.' using errcode = 'P0001';
  end if;
  if not v_lider and coalesce(cardinality(v_ubics), 0) = 0 then
    raise exception 'Ver el estado de resultados necesita el módulo «Reportes financieros» en tu rol.' using errcode = '42501';
  end if;
  if p_ubicacion_id is not null then
    if not (p_ubicacion_id = any (v_ubics)) then
      raise exception 'No puedes ver los números de esa ubicación.' using errcode = '42501';
    end if;
    v_ubics := array[p_ubicacion_id];
  end if;
  v_todo := v_lider and p_ubicacion_id is null;
  v_ini := (p_desde::timestamp at time zone 'America/Lima');
  v_fin := ((p_hasta + 1)::timestamp at time zone 'America/Lima');

  return query
  with
  a as materialized (select * from retail.fn_asientos(p_desde, p_hasta, p_ubicacion_id)),
  -- Cada cuenta de resultados con su signo natural (ingreso: haber − debe; gasto: debe − haber).
  r as (
    select a.ubicacion_id as u, k.seccion_resultados as sec, k.codigo as cta, k.nombre as cnombre,
           sum(case when k.tipo = 'ingreso' then a.haber - a.debe else a.debe - a.haber end) as monto
      from a join retail.cuentas k on k.codigo = a.cuenta
     where k.seccion_resultados is not null
     group by a.ubicacion_id, k.seccion_resultados, k.codigo, k.nombre
  ),
  -- IGV de lo vendido en el rango (débito): ventas, reversas y adelantos.
  iv as (
    select a.ubicacion_id as u, sum(a.haber - a.debe) as igv
      from a where a.cuenta = '4011' and a.regla in ('venta', 'anulacion', 'devolucion', 'cambio', 'anticipo', 'anticipo_devuelto')
     group by a.ubicacion_id
  ),
  merm as (select a.ubicacion_id as u, a.regla, sum(a.debe - a.haber) as monto from a where a.cuenta = '659' group by a.ubicacion_id, a.regla),
  pln as (select a.ubicacion_id as u, string_agg(distinct a.glosa, ' · ') as nota from a where a.regla = 'planilla' and a.cuenta = '62' group by a.ubicacion_id),
  -- Prendas vendidas sin costo cargado (el margen sale inflado) y mermas que no se pudieron valorizar.
  sc as (
    select v.ubicacion_id as u, sum(vi.cantidad)::bigint as n
      from retail.ventas v join retail.venta_items vi on vi.venta_id = v.id
     where v.estado = 'completada' and not coalesce(v.es_prueba, false) and v.created_at >= v_ini and v.created_at < v_fin
       and vi.costo_unitario = 0 and vi.variante_id <> '22222222-2222-4222-8222-222222222222'
       and (v_todo or v.ubicacion_id = any (v_ubics))
     group by v.ubicacion_id
  ),
  msc as (
    select m.ubicacion_id as u, sum(abs(m.cantidad))::bigint as n
      from retail.movimientos m
     where m.created_at >= v_ini and m.created_at < v_fin and retail.fn_es_merma(m.tipo, m.motivo, m.cantidad)
       and m.variante_id <> '22222222-2222-4222-8222-222222222222'
       and retail.fn_costo_variante_al(m.variante_id, m.created_at) = 0
       and (v_todo or m.ubicacion_id = any (v_ubics))
     group by m.ubicacion_id
  ),
  dz as (
    select x.u, count(*)::bigint as n
      from (select (array_agg(a.ubicacion_id))[1] as u, a.asiento from a group by a.asiento
             having round(sum(a.debe), 2) <> round(sum(a.haber), 2)) x
     group by x.u
  ),
  base as (
    select ub.id, case ub.tipo when 'taller' then 'taller' else 'tienda' end as unidad, ub.nombre,
           case ub.tipo when 'taller' then 2 else 1 end as ord
      from retail.ubicaciones ub
     where (v_todo and (ub.activo or exists (select 1 from a where a.ubicacion_id = ub.id)))
        or (not v_todo and ub.id = any (v_ubics))
    union all
    select null::uuid, 'empresa', 'De la empresa', 3 where v_todo
  ),
  por as (
    select b.id, b.unidad, b.nombre, b.ord,
           coalesce(sum(r.monto) filter (where r.sec = 'ventas'), 0) as ventas,
           coalesce(sum(r.monto) filter (where r.sec = 'costo_ventas'), 0) as costo,
           coalesce(sum(r.monto) filter (where r.sec = 'fletes'), 0) as fletes,
           coalesce(sum(r.monto) filter (where r.sec = 'mermas'), 0) as mermas,
           coalesce(sum(r.monto) filter (where r.cta = '62'), 0) as planilla,
           coalesce(sum(r.monto) filter (where r.cta = '681'), 0) as dep,
           coalesce(sum(r.monto) filter (where r.sec = 'gastos_operacion'), 0) as gastos
      from base b left join r on r.u is not distinct from b.id
     group by b.id, b.unidad, b.nombre, b.ord
  ),
  filas as (
    select p.id, p.unidad, p.nombre, p.ord, p.ventas, p.costo, p.fletes, p.mermas, p.planilla, p.dep, p.gastos,
           coalesce((select i.igv from iv i where i.u is not distinct from p.id), 0) as igv,
           coalesce((select jsonb_agg(jsonb_build_object('cuenta', x.cta, 'nombre', x.cnombre, 'monto', x.monto) order by x.cta)
                       from r x where x.u is not distinct from p.id and x.sec = 'gastos_operacion' and x.monto <> 0), '[]'::jsonb) as det_gastos,
           coalesce((select jsonb_agg(jsonb_build_object('regla', m.regla, 'monto', m.monto) order by m.monto desc)
                       from merm m where m.u is not distinct from p.id), '[]'::jsonb) as det_mermas,
           coalesce((select s.n from sc s where s.u is not distinct from p.id), 0) as sin_costo,
           coalesce((select s.n from msc s where s.u is not distinct from p.id), 0) as merma_sin_costo,
           coalesce((select s.n from dz s where s.u is not distinct from p.id), 0) as descuadres,
           (select n.nota from pln n where n.u is not distinct from p.id) as nota_planilla
      from por p
  ),
  consolidado as (
    select null::uuid as id, 'consolidado'::text as unidad, 'CAYLA'::text as nombre, 4 as ord,
           coalesce(sum(f.ventas), 0) as ventas, coalesce(sum(f.costo), 0) as costo, coalesce(sum(f.fletes), 0) as fletes,
           coalesce(sum(f.mermas), 0) as mermas, coalesce(sum(f.planilla), 0) as planilla, coalesce(sum(f.dep), 0) as dep,
           coalesce(sum(f.gastos), 0) as gastos, coalesce(sum(f.igv), 0) as igv,
           coalesce((select jsonb_agg(jsonb_build_object('cuenta', q.cta, 'nombre', q.cnombre, 'monto', q.monto) order by q.cta)
                       from (select x.cta, x.cnombre, sum(x.monto) as monto from r x where x.sec = 'gastos_operacion'
                              group by x.cta, x.cnombre having sum(x.monto) <> 0) q), '[]'::jsonb) as det_gastos,
           coalesce((select jsonb_agg(jsonb_build_object('regla', q.regla, 'monto', q.monto) order by q.monto desc)
                       from (select m.regla, sum(m.monto) as monto from merm m group by m.regla) q), '[]'::jsonb) as det_mermas,
           coalesce(sum(f.sin_costo), 0)::bigint as sin_costo, coalesce(sum(f.merma_sin_costo), 0)::bigint as merma_sin_costo,
           coalesce(sum(f.descuadres), 0)::bigint as descuadres,
           null::text as nota_planilla
      from filas f
     where v_todo
    having v_todo
  )
  select z.id, z.unidad, z.nombre, z.ord,
         z.ventas, z.costo, z.fletes, z.mermas, z.ventas - z.costo - z.fletes - z.mermas,
         z.planilla, z.dep, z.gastos, z.ventas - z.costo - z.fletes - z.mermas - z.gastos, z.igv,
         z.det_gastos, z.det_mermas, z.sin_costo, z.merma_sin_costo, z.descuadres,
         v_planilla, z.nota_planilla
    from (
      select f.id, f.unidad, f.nombre, f.ord, f.ventas, f.costo, f.fletes, f.mermas, f.planilla, f.dep, f.gastos, f.igv,
             f.det_gastos, f.det_mermas, f.sin_costo, f.merma_sin_costo, f.descuadres, f.nota_planilla from filas f
      union all
      select c.id, c.unidad, c.nombre, c.ord, c.ventas, c.costo, c.fletes, c.mermas, c.planilla, c.dep, c.gastos, c.igv,
             c.det_gastos, c.det_mermas, c.sin_costo, c.merma_sin_costo, c.descuadres, c.nota_planilla from consolidado c
    ) z
   order by z.ord, z.nombre;
end $$;
comment on function retail.fn_estado_resultados(date, date, uuid) is
  'Estado de resultados (ADR-0195 F5) por ubicación, «De la empresa» y consolidado (suma exacta). Lee solo de fn_asientos. El líder ve todo; con el módulo Reportes financieros, su tienda.';

-- ---------- 5. Reportes ▸ Campañas (PLAN-FINANZAS §7 ter, ADR-0195 K2) ----------
-- LAS QUE PASARON (hasta 400 días atrás): lo que vendió cada tienda en los días de la campaña contra su «normal»: el
-- promedio de venta del MISMO día de la semana en las 8 semanas anteriores, sin contar días en que rigió cualquier campaña
-- en esa tienda ni días sin venta (tienda cerrada). El margen se mide sobre las prendas con costo cargado. Margen extra =
-- lo vendido × su margen − lo normal × el margen normal. Descuento = lo que se dejó de cobrar por ESA campaña
-- (`venta_items.descuento_etiqueta_id`). Todo sin IGV; no descuenta devoluciones posteriores.
-- LAS QUE VIENEN (y la que está en curso): el margen normal de las últimas 8 semanas sin campaña (la web calcula con él
-- cuánto más hay que vender para compensar el descuento), cuánto sube la meta (el mayor % de sus tiendas) y la meta de
-- esos días con y sin la campaña (`fn_parametros_caja`, F1: si otra campaña rige el mismo día, gana la mayor).
create or replace function retail.fn_campanas_reporte(p_ubicacion_id uuid default null)
returns table (
  etiqueta_id uuid, nombre text, desde date, hasta date, descuento_pct numeric, momento text, dias integer, tiendas integer,
  ventas numeric, normal numeric, descuento numeric, prendas bigint, margen_pct numeric, margen_normal_pct numeric, margen_extra numeric,
  meta_pct numeric, meta_campana numeric, meta_normal numeric, con_efecto boolean
)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
#variable_conflict use_column
declare
  v_lider boolean := retail.fn_es_lider();
  v_ubics uuid[] := retail.fn_diario_ubicaciones();
  v_hoy date := retail.fn_hoy_lima();
  v_desde date;
  v_ini timestamptz;
  v_fin timestamptz;
begin
  if not v_lider and coalesce(cardinality(v_ubics), 0) = 0 then
    raise exception 'Ver las campañas necesita el módulo «Reportes financieros» en tu rol.' using errcode = '42501';
  end if;
  if p_ubicacion_id is not null then
    if not (p_ubicacion_id = any (v_ubics)) then
      raise exception 'No puedes ver los números de esa ubicación.' using errcode = '42501';
    end if;
    v_ubics := array[p_ubicacion_id];
  end if;
  -- La ventana de ventas que hace falta: 8 semanas antes de la campaña pasada más vieja, hasta hoy.
  select least(v_hoy - 56, coalesce(min(e.vigente_desde) - 56, v_hoy - 56)) into v_desde
    from retail.etiquetas e
   where e.estilo = 'campana' and e.activo and e.estado = 'aprobado' and e.vigente_desde is not null and e.vigente_hasta >= v_hoy - 400;
  v_ini := (v_desde::timestamp at time zone 'America/Lima');
  v_fin := ((v_hoy + 1)::timestamp at time zone 'America/Lima');

  return query
  with
  tiendas as (select u.id, u.activo from retail.ubicaciones u where u.tipo = 'tienda' and u.id = any (v_ubics)),
  camp as (
    select e.id, e.nombre, e.vigente_desde as d0, e.vigente_hasta as d1, e.descuento_pct as dcto, e.sedes_permitidas
      from retail.etiquetas e
     where e.estilo = 'campana' and e.activo and e.estado = 'aprobado'
       and (e.vigente_hasta is null or e.vigente_hasta >= v_hoy - 400)
  ),
  -- Cada campaña con fechas, en cada tienda (vista) donde rige.
  ct as (
    select c.id as cid, t.id as u, t.activo, c.d0, c.d1
      from camp c join tiendas t
        on c.sedes_permitidas is null or cardinality(c.sedes_permitidas) = 0 or t.id = any (c.sedes_permitidas)
     where c.d0 is not null and c.d1 is not null
  ),
  -- Días en que rigió CUALQUIER campaña en cada tienda: no cuentan como normales.
  dias_camp as (
    select distinct t.id as u, g::date as d
      from retail.etiquetas e
      join tiendas t on e.sedes_permitidas is null or cardinality(e.sedes_permitidas) = 0 or t.id = any (e.sedes_permitidas)
      cross join lateral generate_series(e.vigente_desde, e.vigente_hasta, interval '1 day') g
     where e.estilo = 'campana' and e.activo and e.estado = 'aprobado' and e.vigente_desde is not null and e.vigente_hasta is not null
       and e.vigente_hasta >= v_desde and e.vigente_desde <= v_hoy
  ),
  -- Venta de cada tienda por día, sin IGV (completadas, sin pruebas).
  dia as (
    select v.ubicacion_id as u, (v.created_at at time zone 'America/Lima')::date as d,
           sum(vi.subtotal) as bruto,
           coalesce(sum(vi.subtotal) filter (where vi.costo_unitario > 0), 0) as bruto_cc,
           coalesce(sum(vi.costo_unitario * vi.cantidad) filter (where vi.costo_unitario > 0), 0) as costo,
           sum(vi.cantidad)::bigint as prendas
      from retail.ventas v join retail.venta_items vi on vi.venta_id = v.id
     where v.estado = 'completada' and not coalesce(v.es_prueba, false) and v.created_at >= v_ini and v.created_at < v_fin
       and v.ubicacion_id in (select t.id from tiendas t)
     group by 1, 2
  ),
  dn as (
    select dia.u, dia.d, dia.prendas, dia.costo, dia.bruto / (1 + x.tasa) as neto, dia.bruto_cc / (1 + x.tasa) as neto_cc,
           exists (select 1 from dias_camp dc where dc.u = dia.u and dc.d = dia.d) as con_campana
      from dia cross join lateral (select retail.fn_tasa_igv(dia.d) as tasa) x
  ),
  -- «Normal» de cada campaña en cada tienda: promedio por día de la semana en las 8 semanas previas, sin campañas.
  base_dow as (
    select ct.cid, ct.u, extract(isodow from dn.d)::int as dow, avg(dn.neto) as prom
      from ct join dn on dn.u = ct.u and dn.d between ct.d0 - 56 and ct.d0 - 1 and not dn.con_campana
     group by 1, 2, 3
  ),
  base_all as (
    select ct.cid, ct.u, avg(dn.neto) as prom, sum(dn.neto_cc) as ncc, sum(dn.costo) as cst
      from ct join dn on dn.u = ct.u and dn.d between ct.d0 - 56 and ct.d0 - 1 and not dn.con_campana
     group by 1, 2
  ),
  normal as (
    select ct.cid, sum(coalesce(bd.prom, ba.prom)) as normal
      from ct
      cross join lateral generate_series(ct.d0, least(ct.d1, v_hoy), interval '1 day') g
      left join base_dow bd on bd.cid = ct.cid and bd.u = ct.u and bd.dow = extract(isodow from g)::int
      left join base_all ba on ba.cid = ct.cid and ba.u = ct.u
     group by ct.cid
  ),
  margen_normal as (
    select ba.cid, case when sum(ba.ncc) > 0 then (sum(ba.ncc) - sum(ba.cst)) / sum(ba.ncc) end as pct
      from base_all ba group by ba.cid
  ),
  vendido as (
    select ct.cid, sum(dn.neto) as ventas, sum(dn.prendas)::bigint as prendas,
           case when sum(dn.neto_cc) > 0 then (sum(dn.neto_cc) - sum(dn.costo)) / sum(dn.neto_cc) end as pct
      from ct join dn on dn.u = ct.u and dn.d between ct.d0 and ct.d1
     group by ct.cid
  ),
  dsc as (
    select vi.descuento_etiqueta_id as cid, sum(vi.descuento_unitario * vi.cantidad / (1 + retail.fn_tasa_igv((v.created_at at time zone 'America/Lima')::date))) as monto
      from retail.ventas v join retail.venta_items vi on vi.venta_id = v.id
     where v.estado = 'completada' and not coalesce(v.es_prueba, false) and v.created_at >= v_ini and v.created_at < v_fin
       and vi.descuento_etiqueta_id is not null and v.ubicacion_id in (select t.id from tiendas t)
     group by 1
  ),
  -- Para las que vienen: el margen normal de las últimas 8 semanas, sin campañas, en sus tiendas.
  reciente as (
    select ct.cid, case when sum(dn.neto_cc) > 0 then (sum(dn.neto_cc) - sum(dn.costo)) / sum(dn.neto_cc) end as pct
      from ct join dn on dn.u = ct.u and dn.d between v_hoy - 56 and v_hoy - 1 and not dn.con_campana
     group by ct.cid
  ),
  efecto as (
    select ct.cid, max(ef.meta_pct) as meta_pct, count(ef.etiqueta_id) > 0 as con_efecto
      from ct left join retail.campana_efecto_caja ef on ef.etiqueta_id = ct.cid and ef.ubicacion_id = ct.u
     group by ct.cid
  ),
  metas as (
    select ct.cid, sum(pc.meta / (1 + retail.fn_tasa_igv(g::date))) as meta, sum(pc.meta_base / (1 + retail.fn_tasa_igv(g::date))) as meta_base
      from ct
      cross join lateral generate_series(ct.d0, ct.d1, interval '1 day') g
      cross join lateral retail.fn_parametros_caja(ct.u, g::date) pc
     where ct.d1 >= v_hoy and ct.activo
     group by ct.cid
  )
  select c.id, c.nombre, c.d0, c.d1, c.dcto,
         case when c.d0 is null or c.d1 is null then 'sin_fechas'
              when c.d1 < v_hoy then 'pasada'
              when c.d0 > v_hoy then 'viene'
              else 'en_curso' end,
         case when c.d0 is not null and c.d1 is not null then (c.d1 - c.d0 + 1) end,
         (select count(*)::int from ct where ct.cid = c.id),
         round(rl.ventas, 2), round(nm.normal, 2), round(coalesce(ds.monto, 0), 2), rl.prendas,
         round(rl.pct, 4),
         round(case when c.d1 < v_hoy then mn.pct else rc.pct end, 4),
         case when c.d1 < v_hoy and rl.ventas is not null and nm.normal is not null and rl.pct is not null and mn.pct is not null
              then round(rl.ventas * rl.pct - nm.normal * mn.pct, 2) end,
         ef.meta_pct, round(mt.meta, 2), round(mt.meta_base, 2), coalesce(ef.con_efecto, false)
    from camp c
    left join vendido rl on rl.cid = c.id
    left join normal nm on nm.cid = c.id
    left join margen_normal mn on mn.cid = c.id
    left join dsc ds on ds.cid = c.id
    left join reciente rc on rc.cid = c.id
    left join efecto ef on ef.cid = c.id
    left join metas mt on mt.cid = c.id
   -- Una campaña que no rige en ninguna tienda que la cuenta ve no es suya (salvo las que no tienen fechas: se avisan).
   where c.d0 is null or c.d1 is null or exists (select 1 from ct where ct.cid = c.id)
   order by c.d0 nulls last, c.nombre;
end $$;
comment on function retail.fn_campanas_reporte(uuid) is
  'Reportes ▸ Campañas (ADR-0195 K2): las pasadas contra los días normales de sus tiendas (venta, descuento, margen extra) y las que vienen con su margen normal, cuánto sube la meta y la meta con y sin la campaña. El líder ve todas las tiendas; con Reportes financieros, la suya.';

-- ---------- 6. Permisos ----------
revoke all on function retail.fn_asiento_cuenta_de_medio(text, text) from public, anon, authenticated;
revoke all on function retail.fn_es_merma(text, text, integer) from public, anon, authenticated;
revoke all on function retail.fn_costo_variante_al(uuid, timestamptz) from public, anon, authenticated;
revoke all on function retail.fn_planilla_visible() from public, anon, authenticated;
revoke all on function retail.fn_planilla_periodos(date, date) from public, anon, authenticated;
revoke all on function retail.fn_diario_ubicaciones() from public, anon;
revoke all on function retail.fn_asientos(date, date, uuid) from public, anon;
revoke all on function retail.fn_asientos_descuadrados(date, date, uuid) from public, anon;
revoke all on function retail.fn_estado_resultados(date, date, uuid) from public, anon;
revoke all on function retail.fn_campanas_reporte(uuid) from public, anon;
grant execute on function retail.fn_diario_ubicaciones() to authenticated;
grant execute on function retail.fn_asientos(date, date, uuid) to authenticated;
grant execute on function retail.fn_asientos_descuadrados(date, date, uuid) to authenticated;
grant execute on function retail.fn_estado_resultados(date, date, uuid) to authenticated;
grant execute on function retail.fn_campanas_reporte(uuid) to authenticated;

reset lock_timeout;
