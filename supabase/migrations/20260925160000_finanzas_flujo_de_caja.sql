-- ============================================================================
-- 20260925160000 — Flujo de caja y escenarios (ADR-0195 F6; docs/PLAN-FINANZAS.md §3 pieza 8 y §6 bis)
--
-- EL PROBLEMA PRIMERO
--   Felipe vende bien y a fin de mes no hay plata. Nadie puede responder «¿por qué?», ni «¿me alcanza para pagar el viernes?»,
--   ni «¿cuántos días aguanto si mañana no vendo nada?». Las piezas ya existen sueltas: los saldos de cada cuenta (F3), lo que
--   se debe y cuándo vence (F4), los gastos fijos del mes (F2b), la meta de cada día con sus campañas (F1), la planilla que
--   lee Dynamic y el mínimo de caja de Configuración. Falta juntarlas en una sola cuenta, semana a semana.
--
-- LAS REGLAS
--   1. TODO ES CÁLCULO: esta migración no crea tablas ni guarda nada. Solo funciones de lectura (STABLE).
--   2. «La plata disponible» es la suma de los saldos de F3 (`fn_cuentas_dinero_saldos`) de todas las cuentas MENOS la
--      tarjeta de crédito (esa es una deuda, no plata). Un saldo nunca se guarda: se suma.
--   3. LO QUE YA PASÓ (`fn_flujo_caja_real`): cada cosa que cambió la plata disponible, con su categoría (`fn_flujo_lineas`).
--      Se cumple SIEMPRE: saldo inicial + entró − salió ± ajustes = saldo final, y la función devuelve el `descuadre` para
--      decirlo en voz alta si algún día no fuera cero (la prueba lo exige en cero).
--        · Bancos, POS, caja fuerte y efectivo por rendir: los renglones del libro de F3 (`fn_dinero_libro`), tal cual; lo
--          que F3 deduce porque todavía no está sellado (F3b) se respeta igual, y lo que F3 deja «sin cuenta» (pagos en
--          efectivo a proveedores, cobros de un medio sin configurar, pagos de Producción) NO suma aquí: se lista aparte,
--          con el mismo aviso de F3.
--        · El cajón: su saldo lo dice la caja (F3), así que su movimiento se cuenta caja por caja, el día que cierra: lo
--          cobrado en efectivo (menos lo devuelto), cada egreso según lo que respalda (gasto, activo, depósito, retiro del
--          dueño o «por clasificar»), el traslado del cierre, el faltante o sobrante al cerrar y la diferencia al abrir.
--        · Lo que solo cambia de lugar (un depósito, un traslado, un abono del POS) va en «entre cuentas»: suma cero dentro
--          del período; si no, es plata en camino y se ve.
--        · Corre igual antes y después de F3b (20260925150000, la cuenta sellada): lee su libro tal cual y los vínculos de
--          F3b (un pago en efectivo del cajón) por `to_jsonb`, así no depende de columnas que quizá todavía no existan.
--   4. LO QUE VIENE (`fn_flujo_caja_proyeccion`): desde mañana, en bloques de 7 días, saldo de hoy + cobros esperados −
--      vencimientos − gastos fijos − planilla.
--        · Cobros esperados: la meta de cada día de cada tienda con sus campañas (`fn_parametros_caja`, la misma regla de
--          Caja e Inicio). Una tienda SIN meta usa lo que cobró en promedio ese mismo día de la semana en las últimas 8
--          semanas (también con el efecto de la campaña), y se dice.
--        · Vencimientos: `fn_por_pagar_consolidado` (F4), lo vencido cae en el primer bloque.
--        · Gastos fijos: `fn_gastos_fijos_mes` (F2b), los que vienen y los que faltan registrar (estos, en el primer bloque).
--        · Planilla: lo pagado en el último período de Dynamic (`planilla_por_sede`), el mismo día de cada mes en que terminó
--          ese período. Solo si la cuenta la ve en Dynamic; si no, se dice.
--        · El mínimo de caja sale de Configuración ▸ Caja y avisos (`fn_parametros_finanzas`): la semana que baja de ahí se
--          marca.
--        · Días de caja = plata de hoy ÷ lo que sale en un día normal (lo que salió los últimos 30 días, con lo «sin cuenta» y
--          la planilla, ÷ 30).
--   5. ESCENARIOS: la web toma estas mismas piezas y les aplica las palancas («¿y si vendo 10 % más?») en el navegador. Nada
--      se guarda.
--   6. PERMISOS: el flujo es de CAYLA entera (los bancos son de todos) y los saldos de los bancos, en F3, solo los ve el líder:
--      por eso las dos lecturas piden `fn_es_lider()`. Las piezas internas no se pueden llamar desde afuera.
--
-- CÓMO SE PEGA EN PRODUCCIÓN — UNA SOLA EJECUCIÓN (solo crea funciones: no toma ninguna tabla en exclusiva ni toca
-- políticas, así que no choca con la tienda ni con el Asesor de seguridad). Con el prefijo `retail.` que ya trae. Antes deben
-- estar F1 (20260924210000), F2 (20260924235000, 20260924235100, 20260925000000), Caja y avisos (20260925103000), F3
-- (20260925110000) y F4 (20260925120000); F3b (20260925150000) puede estar o no. `planilla_por_sede` es opcional: si no
-- existe, la planilla sale como «no se ve».
-- SE ROMPE SI: la web se publica antes (Reportes ▸ Flujo de caja y Escenarios dirían «No se pudo leer el flujo»; nada más se
-- rompe). Si esto se pega primero, nada cambia: nadie llama estas funciones todavía.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 0. Piezas internas ----------

create or replace function retail.fn_flujo_exigir_lider() returns void
language plpgsql stable security definer set search_path = retail, public, extensions as $$
begin
  if not coalesce(retail.fn_es_lider(), false) then
    raise exception 'El flujo de caja es de CAYLA entera: por ahora lo ve el líder.' using errcode = '42501';
  end if;
end $$;

-- De qué lado va cada categoría. «ajuste» = lo que no es entrar ni salir: plata que cambia de lugar y diferencias de caja.
create or replace function retail.fn_flujo_lado(p_categoria text) returns text
language sql immutable set search_path = retail, public, extensions as $$
  select case
    when p_categoria in ('efectivo', 'yape', 'plin', 'tarjeta', 'transferencia', 'dueno_pone', 'reembolsos', 'otros_ingresos') then 'entra'
    when p_categoria in ('entre_cuentas', 'faltantes_caja', 'aperturas_caja') then 'ajuste'
    else 'sale'
  end;
$$;

-- La plata disponible al cierre de un día: los saldos de F3, sin la tarjeta de crédito (es lo que se debe, no plata).
create or replace function retail.fn_flujo_disponible(p_corte date) returns numeric
language sql stable set search_path = retail, public, extensions as $$
  select coalesce(sum(s.saldo), 0) from retail.fn_cuentas_dinero_saldos(p_corte, null) s where s.tipo <> 'tarjeta_credito';
$$;

-- Cada cosa que cambió la plata disponible entre dos días (inclusive), con su categoría y su signo (+ entra, − sale).
-- `con_cuenta = false`: movió plata pero F3 todavía no sabe de qué cuenta (no suma en ningún saldo): se lista aparte.
create or replace function retail.fn_flujo_lineas(p_desde date, p_hasta date)
returns table (fecha date, categoria text, monto numeric, con_cuenta boolean)
language sql stable set search_path = retail, public, extensions as $$
  with
  libro as materialized (
    select l.cuenta_id, l.fecha, l.monto, l.clave, l.origen,
           coalesce(l.cuenta_id is not null and c.tipo not in ('cajon', 'tarjeta_credito')
                    and (c.saldo_desde is null or l.fecha >= c.saldo_desde), false) as suma
      from retail.fn_dinero_libro(p_hasta) l
      left join retail.cuentas_dinero c on c.id = l.cuenta_id
     where l.fecha >= p_desde
  ),
  -- 1. Bancos, POS, caja fuerte y efectivo por rendir: el libro de F3, renglón por renglón.
  cuentas as (
    select l.fecha,
           case
             when l.origen = 'cobros' then split_part(l.clave, ':', 4)          -- yape, plin, tarjeta, transferencia
             when l.origen = 'traslado' then 'entre_cuentas'                    -- viene de un cajón: el cajón lo resta abajo
             when l.origen = 'pago' and l.clave like 'pagoprod:%' then 'insumos'  -- F3b: los pagos del Taller
             when l.origen = 'pago' and l.clave like 'pago:%' then coalesce((
               select case c.naturaleza when 'mercaderia' then 'mercaderia' when 'gasto' then 'gastos' when 'activo' then 'activos' end
                 from retail.compra_pagos cp join retail.compras c on c.id = cp.compra_id
                where cp.id = substr(l.clave, 6)::uuid), 'otras_salidas')
             when l.origen = 'reembolso' then 'reembolsos'                      -- F3b: el proveedor devuelve plata
             when l.origen = 'gasto' then 'gastos'
             when l.origen = 'activo' then 'activos'
             when l.monto >= 0 then 'otros_ingresos'                             -- lo que F3b sume al libro, hasta clasificarlo
             else 'otras_salidas'
           end as categoria,
           l.monto
      from libro l
     where l.suma and l.origen <> 'movimiento'
  ),
  movimientos as (
    select l.fecha, x.categoria, x.monto
      from libro l
      -- El `case` evita convertir a uuid la clave de un renglón que no es un movimiento (el orden del join no se garantiza).
      join retail.movimientos_dinero d on d.id = (case when l.clave like 'mov:%' then substr(l.clave, 5)::uuid end)
     cross join lateral (
       select case
                when d.tipo in ('aporte', 'prestamo') then 'dueno_pone'
                when d.tipo in ('retiro', 'devolucion_prestamo') then 'dueno_saca'
                when d.tipo = 'pago_tarjeta' then 'pago_tarjeta'
                else 'entre_cuentas'
              end as categoria,
              -- El abono del POS sale de «por abonar» con la comisión: lo que llega al banco es entre cuentas; la comisión sale.
              case when d.tipo = 'abono_tarjeta' and l.monto < 0 then l.monto + d.comision else l.monto end as monto
       union all
       select 'comision_pos', -d.comision where d.tipo = 'abono_tarjeta' and l.monto < 0 and d.comision > 0
     ) x
     where l.suma and l.origen = 'movimiento'
  ),
  -- 2. El cajón: caja por caja, el día que cierra (la abierta, hoy). Es lo que hace que su saldo en F3 se mueva: el fondo
  --    que dejó cada cierre (o lo esperado de la caja abierta), contra el fondo que había dejado la anterior.
  cajas as materialized (
    select k.id, k.estado, k.monto_apertura, k.monto_cierre_sistema, k.monto_cierre_real,
           coalesce(k.monto_fondo, k.monto_cierre_real, 0) as fondo,
           case when k.estado = 'cerrada' then (k.cerrada_en at time zone 'America/Lima')::date else retail.fn_hoy_lima() end as dia,
           coalesce(lag(coalesce(k.monto_fondo, k.monto_cierre_real, 0))
                      over (partition by k.ubicacion_id order by (k.estado = 'abierta'), k.cerrada_en, k.id), 0) as fondo_prev
      from retail.cajas k
     where not k.es_prueba
       and exists (select 1 from retail.cuentas_dinero cj where cj.tipo = 'cajon' and cj.ubicacion_id = k.ubicacion_id)
  ),
  en_rango as materialized (select * from cajas k where k.dia between p_desde and p_hasta),
  -- F3b (20260925150000): un pago a un proveedor, del Taller o un reembolso en efectivo del cajón es un egreso (o ingreso)
  -- de caja. Se lee por `to_jsonb` para que esta función también corra antes de F3b (sin esas columnas, no hay vínculos).
  vinculos as materialized (
    select (to_jsonb(cp) ->> 'caja_movimiento_id')::uuid as caja_movimiento_id, 'pago:' || cp.id::text as clave,
           case c.naturaleza when 'mercaderia' then 'mercaderia' when 'gasto' then 'gastos' when 'activo' then 'activos' else 'otras_salidas' end as categoria
      from retail.compra_pagos cp join retail.compras c on c.id = cp.compra_id
     where to_jsonb(cp) ->> 'caja_movimiento_id' is not null
    union all
    select (to_jsonb(pp) ->> 'caja_movimiento_id')::uuid, 'pagoprod:' || pp.id::text, 'insumos'
      from retail.comprobantes_produccion_pagos pp
     where to_jsonb(pp) ->> 'caja_movimiento_id' is not null
    union all
    select (to_jsonb(pc) ->> 'caja_movimiento_id')::uuid, 'reembolso:' || pc.id::text, 'reembolsos'
      from retail.proveedor_creditos pc
     where to_jsonb(pc) ->> 'caja_movimiento_id' is not null
  ),
  -- Lo mismo que cuenta `fn_calcular_esperado_caja`, renglón por renglón y con su categoría.
  componentes as (
    select k.id as caja_id, k.dia, 'efectivo'::text as categoria, vp.monto::numeric as monto
      from en_rango k join retail.ventas v on v.caja_id = k.id join retail.venta_pagos vp on vp.venta_id = v.id
     where vp.metodo = 'efectivo' and v.estado <> 'anulada'
    union all
    select k.id, k.dia,
           case
             when m.tipo = 'ingreso' then
               case when m.separacion_id is not null or exists (select 1 from retail.separacion_pagos sp where sp.caja_movimiento_id = m.id)
                    then 'efectivo' else coalesce(vi.categoria, 'otros_ingresos') end
             when vi.categoria is not null then vi.categoria
             when d.tipo in ('retiro', 'devolucion_prestamo') then 'dueno_saca'
             when d.id is not null then 'entre_cuentas'
             when exists (select 1 from retail.gastos g where g.caja_movimiento_id = m.id and g.estado = 'vigente') then 'gastos'
             when exists (select 1 from retail.activos_fijos a where a.caja_movimiento_id = m.id and a.estado <> 'anulado') then 'activos'
             when exists (select 1 from retail.separaciones s where s.devolucion_caja_movimiento_id = m.id) then 'efectivo'
             when n.tipo = 'deposito' then 'deposito_sin_cuenta'
             when n.tipo = 'retiro' then 'dueno_saca'
             when n.id is not null then 'otras_salidas'
             else 'por_clasificar'
           end,
           case m.tipo when 'ingreso' then m.monto else -m.monto end
      from en_rango k
      join retail.caja_movimientos m on m.caja_id = k.id
      left join retail.movimientos_dinero d on d.caja_movimiento_id = m.id and d.estado = 'vigente'
      left join retail.egresos_no_gasto n on n.caja_movimiento_id = m.id and n.revertido_en is null
      left join lateral (select v.categoria from vinculos v where v.caja_movimiento_id = m.id limit 1) vi on true
    union all
    select k.id, k.dia, 'efectivo', -dv.reembolso_monto
      from en_rango k join retail.devoluciones dv on dv.caja_id = k.id
     where dv.estado = 'aprobada' and dv.reembolso_metodo = 'efectivo' and dv.reembolso_monto is not null
    union all
    select k.id, k.dia, 'efectivo', cb.diferencia
      from en_rango k join retail.cambios cb on cb.caja_id = k.id
     where cb.metodo_pago_diferencia = 'efectivo' and cb.diferencia is not null
  ),
  -- El traslado del cierre: entre cuentas si llegó a una cuenta que suma; si no («banco» de una tienda sin cuenta de
  -- transferencias), la plata salió del cajón sin decir a dónde.
  traslados as (
    select k.id as caja_id, k.dia,
           case when coalesce(lt.suma, false) then 'entre_cuentas' else 'deposito_sin_cuenta' end as categoria,
           -t.monto::numeric as monto
      from en_rango k
      join retail.caja_traslados t on t.caja_id = k.id
      left join libro lt on lt.clave = 'traslado:' || t.id::text
     where k.estado = 'cerrada'
  ),
  por_caja as (
    select k.*,
           coalesce((select sum(c.monto) from componentes c where c.caja_id = k.id), 0) as mov,
           coalesce((select sum(t.monto) from traslados t where t.caja_id = k.id), 0) as trasl,
           case when k.estado = 'cerrada'
                then coalesce(k.monto_cierre_real, 0) - coalesce(k.monto_cierre_sistema, k.monto_apertura
                       + coalesce((select sum(c.monto) from componentes c where c.caja_id = k.id), 0))
                else 0 end as faltante
      from en_rango k
  ),
  ajustes as (
    -- Faltante (−) o sobrante (+) al cerrar: lo contado contra lo que el sistema esperaba.
    select p.dia, 'faltantes_caja'::text as categoria, p.faltante as monto from por_caja p
    union all
    -- Lo que queda: la apertura que no calzó con lo que dejó la caja anterior, y lo que cambió en una caja después de
    -- cerrarla (una venta anulada al día siguiente). Cada término es un hecho de la caja, no «lo que falta para cuadrar».
    select p.dia, 'aperturas_caja',
           (case when p.estado = 'cerrada' then p.fondo else p.monto_apertura + p.mov end) - p.fondo_prev - p.mov - p.trasl - p.faltante
      from por_caja p
  ),
  -- 3. Lo que movió plata y F3 todavía no sabe de qué cuenta (no suma en ningún saldo). El traslado sin cuenta ya está
  --    arriba, del lado del cajón. Los pagos de Producción todavía no entran al libro de F3 (F3b): se dicen aquí.
  sin_cuenta as (
    select l.fecha, l.origen as categoria, l.monto
      from libro l
     where l.cuenta_id is null and l.origen <> 'traslado'
       and not exists (select 1 from vinculos v where v.clave = l.clave)   -- salió del cajón: ya lo cuenta la caja
    union all
    select p.fecha, 'produccion', -p.monto
      from retail.comprobantes_produccion_pagos p
      join retail.comprobantes_produccion c on c.id = p.comprobante_id
     where c.estado = 'vigente' and p.fecha between p_desde and p_hasta
       and not exists (select 1 from libro x where x.clave = 'pagoprod:' || p.id::text)   -- con F3b ya están en el libro
  )
  select c.fecha, c.categoria, c.monto, true from cuentas c
  union all select m.fecha, m.categoria, m.monto, true from movimientos m
  union all select c.dia, c.categoria, c.monto, true from componentes c
  union all select t.dia, t.categoria, t.monto, true from traslados t
  union all select a.dia, a.categoria, a.monto, true from ajustes a where a.monto <> 0
  union all select s.fecha, s.categoria, s.monto, false from sin_cuenta s;
$$;
comment on function retail.fn_flujo_lineas(date, date) is
  'USO INTERNO (ADR-0195 F6). Cada cosa que cambió la plata disponible entre dos días, con su categoría y signo. Suma exactamente lo que cambian los saldos de F3 sin la tarjeta de crédito; lo «sin cuenta» va con con_cuenta = false.';

-- La planilla YA PAGADA de Dynamic (D-33), por sede y período. Solo si `planilla_por_sede` existe y la cuenta es admin o
-- líder en Dynamic (la vista es security_invoker: dentro de una función security definer no filtraría sola). Si no, vacío.
create or replace function retail.fn_flujo_planilla_visible() returns boolean
language plpgsql stable security definer set search_path = retail, public, extensions as $$
declare v boolean;
begin
  if to_regclass('retail.planilla_por_sede') is null or to_regprocedure('public.fn_es_admin_o_lider()') is null then
    return false;
  end if;
  execute 'select coalesce(public.fn_es_admin_o_lider(), false)' into v;
  return coalesce(v, false);
end $$;

create or replace function retail.fn_flujo_planilla_pagada()
returns table (sede_codigo text, ubicacion_id uuid, nombre text, fecha_fin date, pagado numeric)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
begin
  if not retail.fn_flujo_planilla_visible() then
    return;
  end if;
  return query execute $q$
    select p.sede_codigo::text, u.id,
           coalesce(u.nombre, case p.sede_tipo::text when 'taller' then 'Taller' when 'central' then 'Oficina' else p.sede_codigo::text end)::text,
           p.fecha_fin::date, p.pagado::numeric
      from retail.planilla_por_sede p
      left join public.sedes s on s.codigo = p.sede_codigo
      left join retail.ubicaciones u on u.sede_dynamic_id = s.id
  $q$;
end $$;

-- ---------- 1. Lo que ya pasó ----------
-- Entre dos días (hasta hoy como máximo): saldo inicial, lo que entró y salió por categoría, los ajustes, el saldo final y
-- las semanas (bloques de 7 días contados hacia atrás desde `p_hasta`). Solo el líder.
create or replace function retail.fn_flujo_caja_real(p_desde date, p_hasta date default null)
returns jsonb
language plpgsql stable security definer set search_path = retail, public, extensions as $$
declare
  v_hoy date := retail.fn_hoy_lima();
  v_hasta date := least(coalesce(p_hasta, retail.fn_hoy_lima()), retail.fn_hoy_lima());
  v_inicial numeric;
  v_final numeric;
  v_out jsonb;
begin
  perform retail.fn_flujo_exigir_lider();
  if p_desde is null or p_desde > v_hasta then
    raise exception 'El rango de fechas no es válido.' using errcode = 'P0001';
  end if;
  if v_hasta - p_desde > 366 then
    raise exception 'El flujo se mira de a un año como máximo.' using errcode = 'P0001';
  end if;
  v_inicial := retail.fn_flujo_disponible(p_desde - 1);
  v_final := retail.fn_flujo_disponible(v_hasta);

  with
  lineas as materialized (
    select l.fecha, l.categoria, l.monto, l.con_cuenta, retail.fn_flujo_lado(l.categoria) as lado
      from retail.fn_flujo_lineas(p_desde, v_hasta) l
  ),
  tot as (
    select coalesce(sum(l.monto) filter (where l.con_cuenta and l.lado = 'entra'), 0) as entro,
           coalesce(-sum(l.monto) filter (where l.con_cuenta and l.lado = 'sale'), 0) as salio,
           coalesce(sum(l.monto) filter (where l.con_cuenta and l.lado = 'ajuste'), 0) as ajustes
      from lineas l
  ),
  cat as (
    select l.categoria, l.lado, sum(l.monto) as neto from lineas l where l.con_cuenta group by l.categoria, l.lado
  ),
  bloques as (
    select b.i, greatest(v_hasta - 7 * b.i - 6, p_desde) as desde, v_hasta - 7 * b.i as hasta
      from generate_series(0, (v_hasta - p_desde) / 7) b(i)
  ),
  semanas as (
    select b.desde, b.hasta,
           coalesce(sum(l.monto) filter (where l.lado = 'entra'), 0) as entro,
           coalesce(-sum(l.monto) filter (where l.lado = 'sale'), 0) as salio,
           coalesce(sum(l.monto) filter (where l.lado = 'ajuste'), 0) as ajustes
      from bloques b
      left join lineas l on l.con_cuenta and l.fecha between b.desde and b.hasta
     group by b.desde, b.hasta
  ),
  semanas_saldo as (
    select s.*, v_inicial + sum(s.entro - s.salio + s.ajustes) over (order by s.desde) as saldo from semanas s
  ),
  sin as (
    select l.categoria, count(*)::integer as n, sum(l.monto) as monto from lineas l where not l.con_cuenta group by l.categoria
  )
  select jsonb_build_object(
    'desde', p_desde, 'hasta', v_hasta, 'hoy', v_hoy,
    'saldo_inicial', v_inicial, 'saldo_final', v_final,
    'entro', t.entro, 'salio', t.salio, 'ajustes', t.ajustes,
    'descuadre', round(v_final - (v_inicial + t.entro - t.salio + t.ajustes), 2),
    'categorias', coalesce((select jsonb_agg(jsonb_build_object('clave', c.categoria, 'lado', c.lado,
                                                               'monto', case c.lado when 'sale' then -c.neto else c.neto end)
                                             order by c.lado, abs(c.neto) desc, c.categoria)
                              from cat c where c.neto <> 0), '[]'::jsonb),
    'semanas', coalesce((select jsonb_agg(jsonb_build_object('desde', s.desde, 'hasta', s.hasta, 'entro', s.entro, 'salio', s.salio,
                                                            'ajustes', s.ajustes, 'saldo', s.saldo)
                                          order by s.desde)
                           from semanas_saldo s), '[]'::jsonb),
    'sin_cuenta', coalesce((select jsonb_agg(jsonb_build_object('origen', x.categoria, 'n', x.n, 'monto', x.monto) order by x.categoria)
                              from sin x), '[]'::jsonb),
    'planilla_visible', retail.fn_flujo_planilla_visible(),
    'planilla', coalesce((select jsonb_agg(jsonb_build_object('nombre', p.nombre, 'fecha_fin', p.fecha_fin, 'pagado', p.pagado)
                                           order by p.fecha_fin, p.nombre)
                            from retail.fn_flujo_planilla_pagada() p where p.fecha_fin between p_desde and v_hasta), '[]'::jsonb)
  ) into v_out
  from tot t;
  return v_out;
end $$;
comment on function retail.fn_flujo_caja_real(date, date) is
  'ADR-0195 F6: lo que entró y salió de la plata disponible de CAYLA (cuentas de F3 sin la tarjeta de crédito) entre dos días, por categoría y por semana, con saldo inicial y final. saldo_inicial + entro − salio + ajustes = saldo_final (descuadre = 0). Solo el líder. Solo lectura.';

-- ---------- 2. Lo que viene ----------
-- Desde mañana, `p_semanas` bloques de 7 días (4 a 8 en la pantalla; hasta 12). Devuelve también las piezas (cobros por día
-- y tienda, y cada salida con su fecha) para que Escenarios haga la misma cuenta con sus palancas. Solo el líder.
create or replace function retail.fn_flujo_caja_proyeccion(p_semanas integer default 6)
returns jsonb
language plpgsql stable security definer set search_path = retail, public, extensions as $$
declare
  v_hoy date := retail.fn_hoy_lima();
  v_ini date := retail.fn_hoy_lima() + 1;
  v_n integer := least(greatest(coalesce(p_semanas, 6), 1), 12);
  v_fin date;
  v_saldo numeric;
  v_minimo numeric;
  v_sal_cuenta numeric;
  v_sal_sin numeric;
  v_planilla_mes numeric;
  v_diarias numeric;
  v_out jsonb;
begin
  perform retail.fn_flujo_exigir_lider();
  v_fin := v_ini + 7 * v_n - 1;
  v_saldo := retail.fn_flujo_disponible(v_hoy);
  v_minimo := coalesce((retail.fn_parametros_finanzas() ->> 'minimo_caja')::numeric, 0);

  -- Lo que sale en un día normal: lo que salió los últimos 30 días (con lo que no dice de qué cuenta, que igual salió) más
  -- la planilla del último período, que Dynamic paga sin que baje de ningún banco aquí.
  select coalesce(-sum(l.monto) filter (where l.con_cuenta and retail.fn_flujo_lado(l.categoria) = 'sale'), 0),
         coalesce(-sum(l.monto) filter (where not l.con_cuenta and l.categoria <> 'cobros'), 0)
    into v_sal_cuenta, v_sal_sin
    from retail.fn_flujo_lineas(v_hoy - 29, v_hoy) l;
  select coalesce(sum(p.pagado), 0) into v_planilla_mes
    from retail.fn_flujo_planilla_pagada() p
   where p.fecha_fin = (select max(q.fecha_fin) from retail.fn_flujo_planilla_pagada() q);
  v_diarias := round((v_sal_cuenta + v_sal_sin + v_planilla_mes) / 30, 2);

  with
  dias as (select d::date as fecha from generate_series(v_ini, v_fin, interval '1 day') d),
  tiendas as (select u.id, u.nombre from retail.ubicaciones u where u.activo and u.tipo = 'tienda'),
  -- Lo cobrado en las últimas 8 semanas (56 días, 8 de cada día de la semana), para la tienda que no tiene meta.
  hist as (
    select v.ubicacion_id, (v.created_at at time zone 'America/Lima')::date as dia, vp.monto::numeric as monto
      from retail.venta_pagos vp join retail.ventas v on v.id = vp.venta_id
     where v.estado = 'completada' and not v.es_prueba and vp.metodo in ('efectivo', 'yape', 'plin', 'tarjeta', 'transferencia')
       and v.created_at >= ((v_hoy - 56)::timestamp at time zone 'America/Lima') and v.created_at < (v_hoy::timestamp at time zone 'America/Lima')
    union all
    select s.ubicacion_id, (sp.created_at at time zone 'America/Lima')::date, sp.monto
      from retail.separacion_pagos sp join retail.separaciones s on s.id = sp.separacion_id
     where sp.created_at >= ((v_hoy - 56)::timestamp at time zone 'America/Lima') and sp.created_at < (v_hoy::timestamp at time zone 'America/Lima')
  ),
  promedio as (
    select h.ubicacion_id, extract(isodow from h.dia)::integer as dow, sum(h.monto) / 8 as monto from hist h group by 1, 2
  ),
  cobros as (
    select d.fecha, t.id as ubicacion_id, t.nombre as tienda,
           case when p.meta > 0 then p.meta else round(coalesce(pr.monto, 0) * (1 + coalesce(p.meta_pct, 0) / 100), 2) end as monto,
           case when p.meta > 0 then 'meta' else 'promedio' end as origen,
           coalesce(p.meta_pct, 0) as meta_pct,
           coalesce(p.campanas, '[]'::jsonb) as campanas
      from dias d
     cross join tiendas t
     cross join lateral retail.fn_parametros_caja(t.id, d.fecha) p
      left join promedio pr on pr.ubicacion_id = t.id and pr.dow = extract(isodow from d.fecha)::integer
  ),
  vencimientos as (
    select 'vencimiento'::text as tipo, v.origen || ':' || v.id::text as id,
           greatest(coalesce(v.vence, v_ini), v_ini) as fecha, v.vence,
           v.proveedor as titulo, v.documento || coalesce(' · ' || nullif(v.concepto, ''), '') as detalle,
           v.naturaleza as clase, v.ubicacion_id, v.unidades as unidad, v.saldo as monto,
           coalesce(v.vence < v_hoy, false) as atrasada
      from retail.fn_por_pagar_consolidado(null, v_fin, false) v
     where v.saldo > 0
  ),
  fijos as (
    select 'fijo'::text, f.id::text || ':' || to_char(m, 'YYYY-MM'),
           greatest(f.fecha_esperada, v_ini), f.fecha_esperada,
           f.descripcion, f.ubicacion_nombre || coalesce(' · ' || f.proveedor_nombre, ''),
           f.categoria, f.ubicacion_id, f.ubicacion_nombre, f.monto,
           (f.estado = 'falta')
      from generate_series(date_trunc('month', v_hoy), date_trunc('month', v_fin), interval '1 month') m
     cross join lateral retail.fn_gastos_fijos_mes(m::date) f
     where f.estado in ('por_llegar', 'falta') and greatest(f.fecha_esperada, v_ini) <= v_fin
  ),
  ultima as (select max(p.fecha_fin) as fin from retail.fn_flujo_planilla_pagada() p),
  planilla as (
    select 'planilla'::text, p.sede_codigo || ':' || to_char((u.fin + make_interval(months => k))::date, 'YYYY-MM'),
           greatest((u.fin + make_interval(months => k))::date, v_ini), (u.fin + make_interval(months => k))::date,
           'Planilla · ' || p.nombre, 'Como la del período que terminó el ' || to_char(u.fin, 'DD/MM'),
           'planilla', p.ubicacion_id, p.nombre, p.pagado,
           ((u.fin + make_interval(months => k))::date < v_hoy)
      from ultima u
      join retail.fn_flujo_planilla_pagada() p on p.fecha_fin = u.fin
     cross join generate_series(1, 15) k
     where (u.fin + make_interval(months => k))::date between v_hoy - 31 and v_fin
       and p.pagado > 0
  ),
  salidas as (
    select * from vencimientos union all select * from fijos union all select * from planilla
  ),
  bloques as (select b.i, v_ini + 7 * b.i as desde, v_ini + 7 * b.i + 6 as hasta from generate_series(0, v_n - 1) b(i)),
  semanas as (
    select b.i, b.desde, b.hasta,
           coalesce((select sum(c.monto) from cobros c where c.fecha between b.desde and b.hasta), 0) as entra,
           coalesce((select sum(s.monto) from salidas s where s.fecha between b.desde and b.hasta), 0) as sale
      from bloques b
  ),
  con_saldo as (
    select s.*, v_saldo + sum(s.entra - s.sale) over (order by s.i) as saldo from semanas s
  )
  select jsonb_build_object(
    'hoy', v_hoy, 'desde', v_ini, 'hasta', v_fin, 'semanas_pedidas', v_n,
    'saldo_hoy', v_saldo, 'minimo_caja', v_minimo,
    'salidas_diarias', v_diarias,
    'dias_de_caja', case when v_diarias > 0 then greatest(floor(v_saldo / v_diarias), 0) end,
    'salidas_30', jsonb_build_object('con_cuenta', v_sal_cuenta, 'sin_cuenta', v_sal_sin, 'planilla', v_planilla_mes),
    'planilla_visible', retail.fn_flujo_planilla_visible(),
    'semanas', (select jsonb_agg(jsonb_build_object('desde', c.desde, 'hasta', c.hasta, 'entra', c.entra, 'sale', c.sale,
                                                     'saldo', c.saldo, 'bajo_minimo', c.saldo < v_minimo) order by c.i)
                  from con_saldo c),
    'cobros', coalesce((select jsonb_agg(jsonb_build_object('fecha', c.fecha, 'ubicacion_id', c.ubicacion_id, 'tienda', c.tienda,
                                                            'monto', c.monto, 'origen', c.origen, 'meta_pct', c.meta_pct,
                                                            'campanas', c.campanas) order by c.fecha, c.tienda)
                          from cobros c), '[]'::jsonb),
    'salidas', coalesce((select jsonb_agg(jsonb_build_object('tipo', s.tipo, 'id', s.id, 'fecha', s.fecha, 'vence', s.vence,
                                                             'titulo', s.titulo, 'detalle', s.detalle, 'clase', s.clase,
                                                             'ubicacion_id', s.ubicacion_id, 'unidad', s.unidad, 'monto', s.monto,
                                                             'atrasada', s.atrasada) order by s.fecha, s.monto desc, s.id)
                           from salidas s), '[]'::jsonb)
  ) into v_out;
  return v_out;
end $$;
comment on function retail.fn_flujo_caja_proyeccion(integer) is
  'ADR-0195 F6: la plata de hoy más lo que se espera cobrar (metas del día con campañas; sin meta, el promedio de 8 semanas) menos lo que vence (F4), los gastos fijos (F2b) y la planilla (Dynamic), en bloques de 7 días desde mañana; marca la semana bajo el mínimo de caja y calcula los días de caja. Devuelve las piezas para Escenarios. Solo el líder. Solo lectura: nada se guarda.';

-- ---------- 3. Permisos ----------
-- Las dos lecturas: `authenticated` (piden `fn_es_lider()` adentro). Las piezas internas: nadie de afuera.
revoke all on function retail.fn_flujo_caja_real(date, date) from public, anon;
grant execute on function retail.fn_flujo_caja_real(date, date) to authenticated;
revoke all on function retail.fn_flujo_caja_proyeccion(integer) from public, anon;
grant execute on function retail.fn_flujo_caja_proyeccion(integer) to authenticated;

revoke all on function retail.fn_flujo_exigir_lider() from public, anon, authenticated;
revoke all on function retail.fn_flujo_lado(text) from public, anon, authenticated;
revoke all on function retail.fn_flujo_disponible(date) from public, anon, authenticated;
revoke all on function retail.fn_flujo_lineas(date, date) from public, anon, authenticated;
revoke all on function retail.fn_flujo_planilla_visible() from public, anon, authenticated;
revoke all on function retail.fn_flujo_planilla_pagada() from public, anon, authenticated;

reset lock_timeout;
