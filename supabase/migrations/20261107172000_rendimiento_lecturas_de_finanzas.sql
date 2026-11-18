-- 20261107172000 — Rendimiento (ADR-0622, parte 3): las lecturas de Finanzas, con la misma respuesta
--
-- QUÉ ARREGLA. Las pantallas de Finanzas tardaban segundos (Resumen ~6,8 s, alertas de máquinas ~3,3 s, Cuadrar depósitos ~3,2 s)
-- medido sobre una copia de main con un año sintético (6 tiendas, 131.000 ventas, 99.000 pagos digitales, 131.000 comprobantes).
-- Cuatro funciones, sin cambiar ninguna regla: mismas firmas, mismas columnas, mismo dueño y mismos permisos (`create or replace`
-- conserva el `security definer`, el `search_path` y los `grant` de cada una).
--
-- POR QUÉ TARDABA.
--   1. `fn_dinero_libro` (el libro de toda la plata: lo usan Saldos, Conciliación, Sin cuenta, Pagos sin cuenta, Fondos, el Flujo y
--      las máquinas) preguntaba `fn_cuenta_de_cobro` UNA VEZ POR PAGO (~99.000 llamadas a una función con `set search_path`, que no
--      se puede «aplanar» dentro de la consulta) para después sumarlos por tienda, día y medio. Ahora suma primero y pregunta una vez
--      por grupo (~6.600). Medido el cuerpo solo: ~750–980 ms → ~210–290 ms.
--   2. `fn_pos_pendientes` contaba los pagos de cada lote con `(created_at at time zone 'America/Lima')::date = fecha`, que no usa el
--      índice: leía las ~22.000 ventas de la tienda POR LOTE, y lo hacía DOS veces por lote (la columna y la comisión estimada).
--      Ahora es un rango sobre `created_at` (el mismo día exacto: de la medianoche de Lima a la siguiente) y se calcula una vez.
--   3. `fn_impuestos_igv_meses` leía la historia entera de comprobantes dos veces por llamada (el primer mes con datos y la suma mes a
--      mes) y lo mismo con las compras; el Resumen la llama tres veces. Ahora una lectura por lado da las dos cosas.
--   4. `fn_impuestos_panel` leía la historia de comprobantes otras dos veces (los 24 meses y el primer día con ventas): ahora una.
--
-- MEDIDO (copia de main con el año sintético, como líder, mejor de varias corridas intercaladas; la máquina estaba cargada por
-- otras mediciones, así que lo que vale es la proporción):
--   fn_resumen_finanzas(null,false)   6.798 → 2.816 ms   (bloques 614.700 → 208.800)
--   fn_pos_alertas()                  3.085 →   485 ms   (bloques 338.600 →  44.900)
--   fn_cuadrar_depositos_vista()      3.410 →   527 ms
--   fn_flujo_caja_proyeccion(6)       2.934 → 1.329 ms
--   fn_dinero_sin_cuenta(null,null)     953 →   230 ms
--   fn_pagos_sin_cuenta()               866 →   217 ms
--   fn_conciliacion_cuentas()           846 →   221 ms
--   fn_cuentas_dinero_saldos(null,null) 757 →   259 ms
--   fn_impuestos_panel(null)            774 →   589 ms
--   fn_finanzas_confianza(null,null)    421 →   307 ms
--   el cuerpo de fn_dinero_libro(hoy)   853 →   216 ms   (bloques 107.000 →  10.500)
--
-- IDÉNTICO. Se comparó la huella md5 de la salida de 30 lecturas (Resumen ×3, Flujo, alertas y pendientes de las dos máquinas,
-- Cuadrar, Sin cuenta ×3, Pagos sin cuenta, Conciliación, Saldos ×3, Panel de impuestos ×4, IGV por meses ×5 —incluido un rango
-- desde 1999 y uno futuro—, Confianza ×2 y el libro a tres fechas) con las funciones viejas y con estas, en dos escenarios: los
-- datos tal cual y con dinero de Finanzas agregado dentro de una transacción (cobros con su cuenta ya sellada, movimientos de
-- dinero, lotes ya depositados, gastos fuera del cajón y un saldo a favor de IGV declarado). Las 60 huellas coinciden.
--
-- ANTES DE PEGAR. Estas funciones se copiaron de la copia de main. Si producción tiene otra versión, esto la pisaría: por eso el
-- CANDADO de abajo compara el md5 del cuerpo vivo de cada una contra el de main (y el de este archivo) y, si no coincide, aborta
-- todo diciendo cuál. Ojo con `fn_dinero_libro`: alimenta «Dónde está» de Cuentas y dinero, que la sesión de ADR-0567 tiene abierto.
--
-- QUÉ NO HACE. No toca tablas, datos, políticas ni disparadores, ni crea índices (los que hacen falta ya existen:
-- `ventas_ubicacion_fecha_idx`). Solo `create or replace function`: se puede pegar entera, de una vez, y dos veces.
-- Para volver atrás: pegar las definiciones anteriores (las últimas migraciones que crean cada una).

-- ============================== CANDADO (corre primero) ==============================
-- Cada función de abajo se reescribe ENTERA desde su cuerpo de main (medido en la copia `cayla_carga`). Si en la base el cuerpo
-- vivo es otro (alguien la parchó en vivo o una migración de otra rama la tocó después), pegar esto pisaría ese cambio: el
-- candado aborta todo (el SQL Editor corre todo en una transacción) y dice cuál. Acepta el cuerpo de main y el de este archivo,
-- así que se puede pegar dos veces. Si salta: reescribir esa función desde su `pg_get_functiondef` real antes de pegar.
do $candado$
declare r record; v_md5 text;
begin
  for r in select * from (values
    ('retail.fn_dinero_libro(date)', '8b46e5a4cdfc1d39d91d4f7c67d8d7b4', 'a6b12a81d9a8203e2949aed903a93f69'),
    ('retail.fn_impuestos_igv_meses(date,date)', '81c16e2dabc7978ec9fda148a28b82c3', '4366a0f72332f9e073cb0cf4a34ed85c'),
    ('retail.fn_impuestos_panel(date)', '3fe9842ac9ccf9a92fa5d3b6847cde2c', '09f0a08d06f72b9055464e3fdee62cc0'),
    ('retail.fn_pos_pendientes(uuid)', '7aa9522379fb0f1c83137b6165b5e569', 'da35d705ce5d1427f7a0af485334c055')
  ) as t(firma, md5_main, md5_nuevo) loop
    select md5(p.prosrc) into v_md5 from pg_proc p where p.oid = to_regprocedure(r.firma);
    if v_md5 is null then
      raise exception 'Falta %: esta migración no la crea, solo la reescribe.', r.firma;
    end if;
    if v_md5 not in (r.md5_main, r.md5_nuevo) then
      raise exception '% tiene otro cuerpo en esta base (md5 %): no es el de main ni el de este archivo. Reescríbela desde su definición real antes de pegar.', r.firma, v_md5;
    end if;
  end loop;
end
$candado$;

set lock_timeout = '3s';

-- ───────────────────────────── 1. El libro de la plata ─────────────────────────────
CREATE OR REPLACE FUNCTION retail.fn_dinero_libro(p_hasta date)
 RETURNS TABLE(cuenta_id uuid, fecha date, monto numeric, clave text, detalle text, ubicacion_id uuid, origen text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'retail', 'public', 'extensions'
AS $function$
  with tarjeta as (
    -- Deducción para lo viejo pagado «con tarjeta»: la primera tarjeta de crédito activa.
    select c.id from retail.cuentas_dinero c where c.tipo = 'tarjeta_credito' and c.archivada_en is null order by c.orden, c.created_at limit 1
  ),
  asignadas as (
    select a.origen, a.origen_id, a.cuenta_id from retail.cuentas_asignadas a
  ),
  movs as (
    select d.cuenta_destino_id as cuenta_id, d.fecha, d.monto::numeric as monto, 'mov:' || d.id::text as clave,
           retail.fn_texto_movimiento_dinero(d.tipo) || coalesce(' · ' || d.referencia, '') as detalle, d.ubicacion_id, 'movimiento'::text as origen
      from retail.movimientos_dinero d
     where d.estado = 'vigente' and d.cuenta_destino_id is not null and d.caja_ingreso_id is null and d.fecha <= p_hasta
    union all
    select d.cuenta_origen_id, d.fecha, -(d.monto + d.comision), 'mov:' || d.id::text,
           retail.fn_texto_movimiento_dinero(d.tipo) || coalesce(' · ' || d.referencia, '') ||
             case when d.comision > 0 then ' (incluye comisión S/ ' || to_char(d.comision, 'FM999999990.00') || ')' else '' end,
           d.ubicacion_id, 'movimiento'
      from retail.movimientos_dinero d join retail.cuentas_dinero o on o.id = d.cuenta_origen_id
     where d.estado = 'vigente' and o.tipo <> 'cajon' and d.fecha <= p_hasta
  ),
  traslados as (
    select coalesce(t.cuenta_dinero_id,
             case t.destino
               when 'caja_fuerte' then (select f.id from retail.cuentas_dinero f where f.tipo = 'caja_fuerte' and f.ubicacion_id = k.ubicacion_id)
               when 'lider' then (select r.id from retail.cuentas_dinero r where r.tipo = 'por_rendir')
               when 'claudia' then null::uuid
               else coalesce((select x.cuenta_id from asignadas x where x.origen = 'traslado' and x.origen_id = t.id),
                             retail.fn_cuenta_de_cobro(k.ubicacion_id, 'transferencia', (t.creado_en at time zone 'America/Lima')::date))
             end) as cuenta_id,
           (t.creado_en at time zone 'America/Lima')::date as fecha, t.monto::numeric as monto, 'traslado:' || t.id::text as clave,
           'Cierre de caja · ' || u.nombre || case t.destino when 'caja_fuerte' then ' → caja fuerte' when 'lider' then ' → entregado al líder' when 'claudia' then ' → se queda con Claudia' else ' → depósito' end
             || coalesce(' · ' || t.referencia, '') as detalle,
           k.ubicacion_id, 'traslado'::text as origen
      from retail.caja_traslados t join retail.cajas k on k.id = t.caja_id join retail.ubicaciones u on u.id = k.ubicacion_id
     where not k.es_prueba and (t.creado_en at time zone 'America/Lima')::date <= p_hasta
  ),
  cobros_base as (
    select v.ubicacion_id, (v.created_at at time zone 'America/Lima')::date as fecha, vp.metodo as medio, vp.monto::numeric as monto,
           vp.cuenta_dinero_id as sellada
      from retail.venta_pagos vp join retail.ventas v on v.id = vp.venta_id
     where v.estado = 'completada' and not v.es_prueba and vp.metodo in ('yape', 'plin', 'tarjeta', 'transferencia', 'qr')
    union all
    select s.ubicacion_id, (sp.created_at at time zone 'America/Lima')::date, sp.metodo, sp.monto, sp.cuenta_dinero_id
      from retail.separacion_pagos sp join retail.separaciones s on s.id = sp.separacion_id
     where sp.metodo in ('yape', 'plin', 'tarjeta', 'transferencia')
    union all
    -- La diferencia de un cambio ya trae el signo (la clienta paga + / se le devuelve −).
    select cb.ubicacion_id, (cb.created_at at time zone 'America/Lima')::date, cb.metodo_pago_diferencia, cb.diferencia, cb.cuenta_dinero_id
      from retail.cambios cb
     where cb.metodo_pago_diferencia in ('yape', 'plin', 'tarjeta', 'transferencia', 'qr') and cb.diferencia <> 0
    union all
    select dv.ubicacion_id, (dv.aprobado_en at time zone 'America/Lima')::date, dv.reembolso_metodo, -dv.reembolso_monto, dv.reembolso_cuenta_id
      from retail.devoluciones dv
     where dv.estado = 'aprobada' and dv.reembolso_metodo in ('yape', 'plin', 'tarjeta', 'transferencia') and coalesce(dv.reembolso_monto, 0) > 0
    union all
    -- ADR-0408 act. 10: lo que el cliente pagó por Yape, Plin o transferencia dentro de su pedido web, como el adelanto digital de un
    -- apartado: entra el día que se anota, a la cuenta que selló. Uno anotado por error nunca entró; uno que se le devolvió, sale el día
    -- que se devuelve, por la misma cuenta.
    select pw_w.ubicacion_id, (pw.registrado_en at time zone 'America/Lima')::date, pw.medio, pw.monto, pw.cuenta_dinero_id
      from retail.pedido_web_pagos pw join retail.pedidos_web pw_w on pw_w.id = pw.pedido_id
     where pw.origen = 'tienda' and pw.medio in ('yape', 'plin', 'transferencia')
       and (pw.estado = 'aprobado' or (pw.estado = 'anulado' and pw.anulado_motivo = 'devuelto_al_cliente'))
    union all
    select pw_w.ubicacion_id, (pw.anulado_en at time zone 'America/Lima')::date, pw.medio, -pw.monto, pw.cuenta_dinero_id
      from retail.pedido_web_pagos pw join retail.pedidos_web pw_w on pw_w.id = pw.pedido_id
     where pw.origen = 'tienda' and pw.medio in ('yape', 'plin', 'transferencia')
       and pw.estado = 'anulado' and pw.anulado_motivo = 'devuelto_al_cliente'
    union all
    -- F3b: el adelanto devuelto de un apartado (situación 10).
    select s.ubicacion_id, (s.devuelta_en at time zone 'America/Lima')::date, s.devolucion_medio_real, -s.adelanto, s.devolucion_cuenta_id
      from retail.separaciones s
     where s.estado = 'devuelta' and s.devuelta_en is not null and s.devolucion_medio_real in ('yape', 'plin', 'tarjeta', 'transferencia')
       and coalesce(s.adelanto, 0) > 0
  ),
  cobros as (
    -- Los cobros de un día con un medio en una tienda van en UNA línea por cuenta: así llegan al banco (el lote del Yape).
    select c.cuenta_id, c.fecha, sum(c.monto) as monto,
           'cobros:' || c.fecha::text || ':' || c.ubicacion_id::text || ':' || c.medio as clave,
           'Cobros con ' || case c.medio when 'yape' then 'Yape' when 'plin' then 'Plin' when 'qr' then 'QR' else c.medio end || ' · ' || u.nombre as detalle,
           c.ubicacion_id, 'cobros'::text as origen
      -- Rendimiento (2026-11-07): primero se suma por tienda, día, medio y cuenta sellada, y recién después se pregunta
      -- `fn_cuenta_de_cobro` UNA vez por grupo (~6.500 con un año de 6 tiendas) en vez de una vez por pago (~99.000). Sumar las
      -- sumas parciales da exactamente lo mismo (numeric es exacto y su escala es la mayor de las sumadas), y el `having` de abajo
      -- sigue mirando el total del lote, no la suma parcial.
      from (select g.ubicacion_id, g.fecha, g.medio, g.monto,
                   coalesce(g.sellada, retail.fn_cuenta_de_cobro(g.ubicacion_id, g.medio, g.fecha)) as cuenta_id
              from (select b.ubicacion_id, b.fecha, b.medio, b.sellada, sum(b.monto) as monto
                      from cobros_base b where b.fecha <= p_hasta
                     group by b.ubicacion_id, b.fecha, b.medio, b.sellada) g) c
      join retail.ubicaciones u on u.id = c.ubicacion_id
     group by c.ubicacion_id, c.fecha, c.medio, u.nombre, c.cuenta_id
    having sum(c.monto) <> 0
  ),
  pagos as (
    -- Pagos de comprobantes de proveedor (mercadería, gasto o activo).
    select coalesce(cp.cuenta_dinero_id,
                    (select x.cuenta_id from asignadas x where x.origen = 'pago' and x.origen_id = cp.id),
                    case
                      when cp.metodo = 'tarjeta' then (select id from tarjeta)
                      when cp.metodo in ('yape', 'plin') then retail.fn_cuenta_de_cobro(cp.ubicacion_id, cp.metodo, cp.fecha)
                      when cp.metodo in ('transferencia', 'deposito', 'otro') then retail.fn_cuenta_de_cobro(cp.ubicacion_id, 'transferencia', cp.fecha)
                    end) as cuenta_id,
           cp.fecha, -cp.monto::numeric as monto, 'pago:' || cp.id::text as clave,
           'Pago a ' || pr.nombre || ' · ' || c.serie || '-' || c.numero as detalle, cp.ubicacion_id, 'pago'::text as origen
      from retail.compra_pagos cp
      join retail.compras c on c.id = cp.compra_id
      join retail.proveedores pr on pr.id = c.proveedor_id
     where cp.metodo <> 'saldo_a_favor' and cp.fecha <= p_hasta
       -- Lo viejo pagado del cajón con un gasto o activo (antes de F3b el pago no guardaba su cuenta): ya está en la caja.
       and not (cp.cuenta_dinero_id is null and cp.metodo = 'efectivo' and (
             exists (select 1 from retail.gastos g where g.compra_id = c.id and g.caja_movimiento_id is not null and g.estado = 'vigente')
          or exists (select 1 from retail.activos_fijos a where a.compra_id = c.id and a.caja_movimiento_id is not null and a.estado <> 'anulado')))
    union all
    -- F3b: pagos a proveedores del Taller (situación 12).
    select coalesce(pp.cuenta_dinero_id, (select x.cuenta_id from asignadas x where x.origen = 'pagoprod' and x.origen_id = pp.id)),
           pp.fecha, -pp.monto::numeric, 'pagoprod:' || pp.id::text,
           'Pago del Taller a ' || prp.nombre || ' · ' || co.serie || '-' || co.numero, null::uuid, 'pago'
      from retail.comprobantes_produccion_pagos pp
      join retail.comprobantes_produccion co on co.id = pp.comprobante_id
      join retail.proveedores_produccion prp on prp.id = co.proveedor_id
     where pp.fecha <= p_hasta
    union all
    -- F3b: un proveedor devuelve plata (situación 6).
    select coalesce(pc.cuenta_dinero_id, (select x.cuenta_id from asignadas x where x.origen = 'reembolso' and x.origen_id = pc.id)),
           pc.fecha, pc.monto::numeric, 'reembolso:' || pc.id::text,
           'Reembolso de ' || pv.nombre || coalesce(' · ' || pc.referencia, ''), null::uuid, 'reembolso'
      from retail.proveedor_creditos pc join retail.proveedores pv on pv.id = pc.proveedor_id
     where pc.tipo = 'reembolso' and pc.fecha <= p_hasta
    union all
    -- Gastos sin comprobante pagados sin cajón. La comisión del POS no: esa plata ya la descontó el abono.
    select coalesce(g.cuenta_dinero_id,
                    (select x.cuenta_id from asignadas x where x.origen = 'gasto' and x.origen_id = g.id),
                    case
                      when g.medio_pago = 'efectivo' then null
                      when g.medio_pago = 'tarjeta' then (select id from tarjeta)
                      when g.medio_pago in ('yape', 'plin') then retail.fn_cuenta_de_cobro(g.ubicacion_id, g.medio_pago, g.fecha)
                      else retail.fn_cuenta_de_cobro(g.ubicacion_id, 'transferencia', g.fecha)
                    end),
           g.fecha, -g.monto_total, 'gasto:' || g.id::text, 'Gasto · ' || g.descripcion, g.ubicacion_id, 'gasto'
      from retail.gastos g
     where g.compra_id is null and g.estado = 'vigente' and g.caja_movimiento_id is null and g.fecha <= p_hasta
       and not exists (select 1 from retail.movimientos_dinero d where d.gasto_comision_id = g.id)
    union all
    select coalesce(a.cuenta_dinero_id,
                    (select x.cuenta_id from asignadas x where x.origen = 'activo' and x.origen_id = a.id),
                    case
                      when a.medio_pago = 'efectivo' then null
                      when a.medio_pago = 'tarjeta' then (select id from tarjeta)
                      when a.medio_pago in ('yape', 'plin') then retail.fn_cuenta_de_cobro(a.ubicacion_id, a.medio_pago, a.fecha_adquisicion)
                      else retail.fn_cuenta_de_cobro(a.ubicacion_id, 'transferencia', a.fecha_adquisicion)
                    end),
           a.fecha_adquisicion, -a.costo, 'activo:' || a.id::text, 'Activo · ' || a.nombre, a.ubicacion_id, 'activo'
      from retail.activos_fijos a
     where a.compra_id is null and a.estado <> 'anulado' and a.medio_pago is not null and a.caja_movimiento_id is null
       and a.fecha_adquisicion <= p_hasta
  ),
  todo as (
    select * from movs
    union all select * from traslados
    union all select * from cobros
    union all select * from pagos
  )
  select t.* from todo t
   where t.cuenta_id is null
      or not exists (select 1 from retail.cuentas_dinero c where c.id = t.cuenta_id and c.tipo = 'cajon');
$function$

;

-- ───────────────────────────── 2. Lo que una máquina no depositó ─────────────────────────────
CREATE OR REPLACE FUNCTION retail.fn_pos_pendientes(p_cuenta_id uuid)
 RETURNS TABLE(clave text, fecha date, ubicacion_id uuid, ubicacion_nombre text, medio text, bruto numeric, dias integer, n_pagos integer, esperado numeric, dias_habiles integer, atrasado boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'retail', 'public', 'extensions'
AS $function$
#variable_conflict use_column
declare v_hoy date := retail.fn_hoy_lima(); v_maquina uuid;
begin
  perform retail.fn_exigir_lider_dinero('Ver lo que una máquina no depositó');
  if not exists (select 1 from retail.cuentas_dinero c where c.id = p_cuenta_id and c.tipo = 'por_abonar') then
    raise exception 'Esa cuenta no es la de una máquina de cobro («por depositar»).' using errcode = 'P0001';
  end if;
  select m.id into v_maquina from retail.pos_maquinas m where m.cuenta_id = p_cuenta_id;
  return query
  with pend as (
    select l.clave, l.fecha, l.ubicacion_id, u.nombre as ubicacion_nombre, split_part(l.clave, ':', 4) as medio, l.monto as bruto
      from retail.fn_dinero_libro(v_hoy) l
      left join retail.ubicaciones u on u.id = l.ubicacion_id
     where l.cuenta_id = p_cuenta_id and l.origen = 'cobros' and l.monto <> 0
       and not exists (select 1 from retail.pos_abonos_lotes a join retail.movimientos_dinero d on d.id = a.movimiento_dinero_id
                        where a.cuenta_id = p_cuenta_id and a.clave = l.clave and d.estado = 'vigente')
  ),
  conteo as materialized (
    -- Cuántos pagos fueron ese día, en esa tienda, con ese medio (para el cargo fijo por pago). Solo ventas completadas.
    -- Rendimiento (2026-11-07): el día se pide como rango sobre `created_at` (de la medianoche de Lima a la siguiente), que es
    -- exactamente el mismo día que `(created_at at time zone 'America/Lima')::date = fecha` pero usa `ventas_ubicacion_fecha_idx`
    -- (antes leía las ~22.000 ventas de la tienda por cada lote: 15 ms × lote). `materialized`: el conteo se usa dos veces abajo
    -- (la columna y la comisión estimada) y sin él Postgres lo calculaba dos veces por lote.
    select p.clave, (select count(*)::integer from retail.venta_pagos vp join retail.ventas v on v.id = vp.venta_id
                       where v.estado = 'completada' and not coalesce(v.es_prueba, false) and vp.metodo = p.medio
                         and v.ubicacion_id = p.ubicacion_id
                         and v.created_at >= (p.fecha::timestamp at time zone 'America/Lima')
                         and v.created_at < ((p.fecha + 1)::timestamp at time zone 'America/Lima')
                         and coalesce(vp.cuenta_dinero_id, p_cuenta_id) = p_cuenta_id) as n
      from pend p
  )
  select p.clave, p.fecha, p.ubicacion_id, p.ubicacion_nombre, p.medio, p.bruto, (v_hoy - p.fecha)::integer,
         c.n,
         case when v_maquina is null then null else retail.fn_pos_comision_estimada(v_maquina, p.medio, p.bruto, c.n, p.fecha) end,
         retail.fn_dias_habiles(p.fecha, v_hoy),
         retail.fn_dias_habiles(p.fecha, v_hoy) > coalesce((retail.fn_pos_tarifa(v_maquina, p.medio, p.fecha)).dias_abono, 3)
    from pend p join conteo c on c.clave = p.clave
   order by p.fecha, p.ubicacion_nombre, p.medio;
end $function$

;

-- ───────────────────────────── 3. El IGV mes a mes ─────────────────────────────
CREATE OR REPLACE FUNCTION retail.fn_impuestos_igv_meses(p_desde date, p_hasta date)
 RETURNS TABLE(mes date, comprobantes integer, base_ventas numeric, igv_ventas numeric, igv_notas_credito numeric, debito numeric, credito_mercaderia numeric, credito_gastos numeric, credito_activos numeric, credito_taller numeric, credito_notas numeric, credito numeric, saldo_anterior numeric, a_pagar numeric, saldo_a_favor numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'retail', 'public', 'extensions'
AS $function$
#variable_conflict use_column
declare
  v_pedido date := date_trunc('month', p_desde)::date;
  v_fin date := date_trunc('month', p_hasta)::date;
  v_ini date;
  v_desde_lectura date;
  v_saldo numeric := 0;
  v_apertura numeric;
  v_resultado numeric;
  r record;
begin
  if not (retail.fn_puede_ver_impuestos() or retail.fn_ve_estados_financieros_de_todo()) then
    raise exception 'Ver los impuestos necesita el módulo «Impuestos» en tu rol.' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or v_pedido > v_fin then
    raise exception 'El rango de meses no es válido.' using errcode = 'P0001';
  end if;
  -- Rendimiento (2026-11-07): antes se leía TODA la historia de comprobantes dos veces por llamada (una para saber el primer mes
  -- con datos y otra para sumar mes a mes) y lo mismo con las compras; el Resumen de Finanzas llama a esta función tres veces.
  -- Ahora una sola lectura por lado, sumada por mes, da las dos cosas. Es el mismo resultado porque:
  --   · el primer día con datos se toma solo de lo que va del 2000-01-01 a `v_fin + 31` y que cuenta (`cuenta` / `da_credito`), como antes;
  --   · todo lo que suma está filtrado por `cuenta` / `da_credito`, y lo que cuenta empieza en `v_ini` o después: leer desde antes
  --     (`v_desde_lectura`) solo agrega meses sin nada que sumar, que además quedan fuera del cruce con `meses`;
  --   · cada mes de `meses` (de `v_ini` a `v_fin`) se suma entero en los dos casos, y lo que pasa de fin de mes de `v_fin` queda en
  --     meses posteriores, que tampoco cruzan.
  v_desde_lectura := least(date '2000-01-01', v_pedido,
                           coalesce((select date_trunc('month', min(p.vigente_desde))::date from retail.parametros_tributarios p
                                      where p.nombre = 'saldo_favor_igv'), date '2000-01-01'));

  for r in
    with ve as materialized (
      select date_trunc('month', x.fecha)::date as m,
             min(x.fecha) filter (where x.cuenta and x.fecha >= date '2000-01-01') as primera,
             count(*) filter (where x.cuenta)::integer as n,
             coalesce(sum(x.signo * x.base) filter (where x.cuenta), 0) as base,
             coalesce(sum(x.igv) filter (where x.cuenta and x.signo > 0), 0) as igv_mas,
             coalesce(sum(x.igv) filter (where x.cuenta and x.signo < 0), 0) as igv_nc
        from retail.fn_impuestos_ventas(v_desde_lectura, v_fin + 31) x
       group by 1
    ),
    co as materialized (
      select date_trunc('month', x.fecha)::date as m,
             min(x.fecha) filter (where x.da_credito and x.fecha >= date '2000-01-01') as primera,
             coalesce(sum(x.igv) filter (where x.da_credito and x.origen = 'compra' and x.naturaleza = 'mercaderia'), 0) as cm,
             coalesce(sum(x.igv) filter (where x.da_credito and x.origen in ('compra', 'gasto_viaje') and x.naturaleza = 'gasto'), 0) as cg,
             coalesce(sum(x.igv) filter (where x.da_credito and x.origen = 'compra' and x.naturaleza = 'activo'), 0) as ca,
             coalesce(sum(x.igv) filter (where x.da_credito and x.origen = 'taller'), 0) as ct,
             coalesce(-sum(x.igv) filter (where x.da_credito and x.origen = 'nota_credito'), 0) as cn
        from retail.fn_impuestos_compras(v_desde_lectura, v_fin + 31) x
       group by 1
    ),
    primero as (
      select date_trunc('month', least(v_pedido, (select min(ve.primera) from ve), (select min(co.primera) from co)))::date as d
    ),
    -- ADR-0433, actividad 4b: si el contador declaró un saldo a favor de arranque ANTERIOR a los primeros datos, la cadena empieza en ese mes.
    inicio as (
      select least(pr.d, coalesce((select date_trunc('month', min(p.vigente_desde))::date from retail.parametros_tributarios p
                                    where p.nombre = 'saldo_favor_igv'), pr.d)) as d
        from primero pr
    ),
    meses as (
      select g::date as m from inicio i cross join generate_series(i.d, v_fin, interval '1 month') g
    )
    select meses.m, coalesce(ve.n, 0) as n, coalesce(ve.base, 0) as base, coalesce(ve.igv_mas, 0) as igv_mas,
           coalesce(ve.igv_nc, 0) as igv_nc, coalesce(co.cm, 0) as cm, coalesce(co.cg, 0) as cg, coalesce(co.ca, 0) as ca,
           coalesce(co.ct, 0) as ct, coalesce(co.cn, 0) as cn
      from meses left join ve on ve.m = meses.m left join co on co.m = meses.m
     order by meses.m
  loop
    mes := r.m;
    comprobantes := r.n;
    base_ventas := r.base;
    igv_ventas := r.igv_mas;
    igv_notas_credito := r.igv_nc;
    debito := r.igv_mas - r.igv_nc;
    credito_mercaderia := r.cm;
    credito_gastos := r.cg;
    credito_activos := r.ca;
    credito_taller := r.ct;
    credito_notas := r.cn;
    credito := r.cm + r.cg + r.ca + r.ct - r.cn;
    -- ADR-0433, actividad 4b: lo que el contador declaró como saldo a favor al empezar este mes REEMPLAZA lo que venía arrastrando (lo oficial manda sobre lo
    -- calculado con datos incompletos); la corrección más reciente de ese mes es la que vale.
    v_apertura := (select round(p.valor, 2) from retail.parametros_tributarios p
                    where p.nombre = 'saldo_favor_igv' and date_trunc('month', p.vigente_desde)::date = r.m
                    order by p.vigente_desde desc, p.created_at desc, p.id desc limit 1);
    if v_apertura is not null then
      v_saldo := v_apertura;
    end if;
    saldo_anterior := v_saldo;
    v_resultado := debito - credito - v_saldo;
    if v_resultado >= 0 then
      a_pagar := v_resultado;
      saldo_a_favor := 0;
    else
      a_pagar := 0;
      saldo_a_favor := -v_resultado;
    end if;
    v_saldo := saldo_a_favor;
    if r.m >= v_pedido then
      return next;
    end if;
  end loop;
end $function$

;

-- ───────────────────────────── 4. El panel de impuestos ─────────────────────────────
CREATE OR REPLACE FUNCTION retail.fn_impuestos_panel(p_mes date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'retail', 'public', 'extensions'
AS $function$
declare
  v_hoy date := retail.fn_hoy_lima();
  v_actual date := date_trunc('month', v_hoy)::date;
  v_mes date;
  v_fin_mes date;
  v_hist date := (date_trunc('month', v_hoy) - interval '5 months')::date;
  v_meses jsonb;
  v_uit record;
  v_umbral record;
  v_regimen record;
  v_renta record;
  v_igv record;
  v_ventas jsonb;
  v_12m numeric; -- ventas registradas en el sistema de enero a hoy (el nombre es el de cuando eran 12 meses móviles)
  -- El año calendario y el aviso anticipado.
  v_anio date;
  v_previas_valor numeric;
  v_aviso_uit numeric;
  v_aviso_prov boolean;
  v_aviso_soles numeric;
  v_total_anio numeric;
  v_primer date;
  v_umbral_soles numeric;
  v_foco jsonb;
  v_revisar jsonb;
begin
  if not retail.fn_puede_ver_impuestos() then
    raise exception 'Ver los impuestos necesita el módulo «Impuestos» en tu rol.' using errcode = '42501';
  end if;
  v_mes := least(date_trunc('month', coalesce(p_mes, (v_hoy - interval '1 month')::date))::date, v_actual);
  v_fin_mes := (v_mes + interval '1 month - 1 day')::date;

  select coalesce(jsonb_agg(to_jsonb(m) order by m.mes), '[]'::jsonb) into v_meses
    from retail.fn_impuestos_igv_meses(least(v_mes, v_hist), v_hoy) m;
  select e into v_foco from jsonb_array_elements(v_meses) e where (e ->> 'mes')::date = v_mes;

  select * into v_igv from retail.fn_parametro_tributario('igv', v_fin_mes);
  select * into v_uit from retail.fn_parametro_tributario('uit', v_hoy);
  select * into v_umbral from retail.fn_parametro_tributario('umbral_uit', v_hoy);
  select * into v_regimen from retail.fn_parametro_tributario('regimen', v_hoy);
  select * into v_renta from retail.fn_parametro_tributario('renta_pago_cuenta', v_fin_mes);

  -- Ventas sin IGV (base imponible, menos notas de crédito) de los últimos 24 meses, mes a mes: la misma fuente que el
  -- débito. El límite mira el AÑO calendario (de enero a hoy, el mes en curso incluido); la pantalla proyecta con el resto.
  -- Rendimiento (2026-11-07): los 24 meses y el primer día con ventas salen de UNA lectura de la historia (antes eran dos: cada
  -- una recorría todos los comprobantes). Mismo resultado: los meses de la serie son meses enteros desde `v_actual - 23 meses`
  -- hasta hoy, y el primer día se toma de todo lo que va del 2000-01-01 a hoy y cuenta, como antes.
  with vx as materialized (
    select date_trunc('month', x.fecha)::date as m, sum(x.signo * x.base) filter (where x.cuenta) as base,
           min(x.fecha) filter (where x.cuenta) as primera
      from retail.fn_impuestos_ventas(date '2000-01-01', v_hoy) x group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object('mes', g.m, 'base', coalesce(v.base, 0)) order by g.m), '[]'::jsonb),
         (select min(vx.primera) from vx)
    into v_ventas, v_primer
    from (select gs::date as m from generate_series((v_actual - interval '23 months')::date, v_actual, interval '1 month') gs) g
    left join vx v on v.m = g.m;
  select coalesce(sum((e ->> 'base')::numeric), 0) into v_12m
    from jsonb_array_elements(v_ventas) e where (e ->> 'mes')::date >= date_trunc('year', v_hoy)::date;
  v_umbral_soles := case when v_uit.valor is not null and v_umbral.valor is not null then round(v_uit.valor * v_umbral.valor, 2) end;

  -- Ventas del AÑO: lo registrado en el sistema (v_12m, de enero a hoy según los comprobantes) más el ajuste opcional de este año. El ajuste rige por AÑO EXACTO (la fila del 1 de enero de
  -- este año): el de 2026 no se hereda a 2027. Sin soles (sin UIT) o sin aviso configurado, el aviso calla.
  v_anio := date_trunc('year', v_hoy)::date;
  v_previas_valor := (select p.valor from retail.parametros_tributarios p where p.nombre = 'ventas_previas_erp' and p.vigente_desde = v_anio order by p.created_at desc, p.id desc limit 1);
  v_aviso_uit := (select a.valor from retail.fn_parametro_tributario('aviso_umbral_uit', v_hoy) a);
  v_aviso_prov := (select a.provisional from retail.fn_parametro_tributario('aviso_umbral_uit', v_hoy) a);
  v_aviso_soles := case when v_uit.valor is not null and v_aviso_uit is not null then round(v_uit.valor * v_aviso_uit, 2) end;
  v_total_anio := v_12m + coalesce(v_previas_valor, 0);

  -- Lo que puede hacer que se pague de más (o de menos), del mes que se mira.
  select jsonb_build_object(
    'boletas', (
      select jsonb_build_object('n', count(*), 'total', coalesce(sum(b.total), 0), 'gastos', count(*) filter (where b.naturaleza = 'gasto'),
                                'proveedores', coalesce((select jsonb_agg(distinct b2.proveedor) from (
                                   select pr.nombre as proveedor from retail.compras k join retail.proveedores pr on pr.id = k.proveedor_id
                                    where k.estado = 'vigente' and k.tipo = 'boleta' and k.fecha_emision between v_mes and v_fin_mes
                                   union all
                                   select pp.nombre from retail.comprobantes_produccion p join retail.proveedores_produccion pp on pp.id = p.proveedor_id
                                    where p.estado = 'vigente' and p.tipo = 'boleta' and p.fecha_emision between v_mes and v_fin_mes) b2), '[]'::jsonb))
        from retail.fn_impuestos_compras(v_mes, v_fin_mes) b
       where b.tipo = 'boleta'),
    'sin_aceptar', (
      select jsonb_build_object('n', count(*), 'total', coalesce(sum(x.total), 0))
        from retail.fn_impuestos_ventas(v_mes, v_fin_mes) x where x.cuenta and x.estado <> 'aceptado'),
    'rechazados', (
      select jsonb_build_object('n', count(*), 'total', coalesce(sum(c.total), 0))
        from retail.comprobantes c
       where c.estado = 'rechazado' and c.tipo in ('boleta', 'factura', 'nota_credito', 'nota_debito')
         and c.entorno_transmision is distinct from 'sandbox'
         and c.created_at >= (v_mes::timestamp at time zone 'America/Lima')
         and c.created_at < ((v_fin_mes + 1)::timestamp at time zone 'America/Lima')),
    -- Ventas del mes sin boleta ni factura que valga (nota de venta, sin comprobante, o la emitió Alegra): su IGV no está
    -- en el débito. Una separación pagada entera no lleva comprobante final: el del anticipo ya la cubrió.
    'sin_comprobante', (
      with validos as (
        select c.venta_id
          from retail.fn_impuestos_ventas(v_mes - 31, v_fin_mes + 31) x
          join retail.comprobantes c on c.id = x.comprobante_id
         where x.cuenta and c.tipo in ('boleta', 'factura') and c.venta_id is not null
      )
      select jsonb_build_object('n', count(*), 'total', coalesce(sum(t.total), 0), 'alegra', count(*) filter (where t.emisor = 'alegra'))
        from (select v.id, v.emisor,
                     (select coalesce(sum(i.subtotal), 0) from retail.venta_items i where i.venta_id = v.id) as total
                from retail.ventas v
               where v.estado <> 'anulada' and not v.es_prueba
                 and v.created_at >= (v_mes::timestamp at time zone 'America/Lima')
                 and v.created_at < ((v_fin_mes + 1)::timestamp at time zone 'America/Lima')
                 and v.id not in (select validos.venta_id from validos)
                 and not exists (select 1 from retail.separaciones s where s.venta_id = v.id and s.comprobante_anticipo_id is not null)) t),
    'honorarios', (
      select jsonb_build_object('n', count(*), 'total', coalesce(sum(k.total), 0), 'mayores', count(*) filter (where k.total > 1500))
        from (select c.total, c.estado, c.tipo, c.fecha_emision from retail.compras c
              union all
              select p.total, p.estado, p.tipo, p.fecha_emision from retail.comprobantes_produccion p) k
       where k.estado = 'vigente' and k.tipo = 'recibo_por_honorarios' and k.fecha_emision between v_mes and v_fin_mes),
    -- ADR-0362 fase 6 · actividad 8: el IGV perdido por pagos en efectivo o desde un fondo (ya restado del crédito).
    'igv_perdido', (
      select jsonb_build_object('n', count(*), 'igv', coalesce(sum(x.igv), 0))
        from retail.fn_igv_perdido(v_mes, v_fin_mes) x)
  ) into v_revisar;

  return jsonb_build_object(
    'hoy', v_hoy,
    'mes', v_mes,
    'mes_actual', v_actual,
    'foco', v_foco,
    'historial', coalesce((select jsonb_agg(e order by (e ->> 'mes')::date) from jsonb_array_elements(v_meses) e where (e ->> 'mes')::date >= v_hist), '[]'::jsonb),
    'parametros', jsonb_build_object(
      'igv', case when v_igv.valor is null then null else jsonb_build_object('valor', v_igv.valor, 'provisional', v_igv.provisional) end,
      'uit', case when v_uit.valor is null then null else jsonb_build_object('valor', v_uit.valor, 'anio', extract(year from v_uit.vigente_desde)::integer, 'provisional', v_uit.provisional) end,
      'umbral_uit', case when v_umbral.valor is null then null else jsonb_build_object('valor', v_umbral.valor, 'provisional', v_umbral.provisional) end,
      'regimen', case when v_regimen.texto is null then null else jsonb_build_object('texto', v_regimen.texto, 'provisional', v_regimen.provisional) end,
      'renta', case when v_renta.valor is null then null else jsonb_build_object('valor', v_renta.valor, 'provisional', v_renta.provisional) end,
      'aviso_umbral_uit', case when v_aviso_uit is null then null else jsonb_build_object('valor', v_aviso_uit, 'provisional', v_aviso_prov) end),
    'umbral', jsonb_build_object(
      'anio', extract(year from v_anio)::integer,
      'ventas_anio_erp', v_12m,
      'ajuste', coalesce(v_previas_valor, 0),
      'ventas_anio', v_total_anio,
      'umbral_soles', v_umbral_soles,
      'aviso_soles', v_aviso_soles,
      'avance', case when v_umbral_soles > 0 then round(v_total_anio / v_umbral_soles, 4) end,
      'cruzado', coalesce(v_total_anio >= v_umbral_soles, false),
      'aviso_alcanzado', coalesce(v_aviso_soles is not null and v_total_anio >= v_aviso_soles and v_total_anio < v_umbral_soles, false),
      'primer_mes', date_trunc('month', v_primer)::date,
      'ventas_meses', v_ventas),
    'renta', jsonb_build_object(
      'base', coalesce((v_foco ->> 'base_ventas')::numeric, 0),
      'tasa', v_renta.valor,
      'monto', case when v_renta.valor is null then null else round(coalesce((v_foco ->> 'base_ventas')::numeric, 0) * v_renta.valor, 2) end),
    'revisar', v_revisar
  );
end $function$

;

reset lock_timeout;
