-- ============================================================================
-- Compras: "hoy" en Lima para las cifras de cabecera + las cifras que faltaban
-- (ADR-0106, sección «Lectura»)
--
-- EL PROBLEMA. Dos cosas en las tarjetas que decide Felipe cada mañana:
--
--   1. `resumen_compras()` compara vencimientos contra `current_date`, que en
--      Postgres es UTC: entre las 7 pm y la medianoche de Lima ya es "mañana",
--      y una factura que vence HOY sale como vencida con la tienda abierta.
--      Se cambia por `fn_hoy_lima()` (20260918160000) — mismo `RETURNS`, mismo
--      candado de sede, solo el reloj.
--
--   2. Faltan las cifras que las pantallas piden y que la base ya sabe
--      calcular: cuánta mercadería está por llegar (unidades y valor), cuál es
--      la entrega más atrasada, cuánto se compró este mes frente al anterior,
--      el IGV del mes (el crédito fiscal que D-46 dejó abierto) y qué proveedor
--      concentra la deuda. Todo en UNA función de una fila: sumas y conteos en
--      Postgres, nunca en la página (misma regla que `resumen_compras`).
--
-- POR QUÉ NO SE ROMPE CUANDO ATERRICE D2 (cierres de línea + notas de crédito):
-- todo sale de columnas que D2 ya redefine por debajo — `saldo` (total − pagado
-- − notas de crédito), `estado_recepcion`, `compra_items_resumen.pendiente`
-- (cantidad − recibido − cerrado). Ninguna cifra de acá repite esa aritmética.
--
-- `igv_mes` = IGV de las facturas del mes − IGV de las notas de crédito del mes.
-- La tabla `compra_notas_credito` nace en la migración de escritura de D2
-- (20260918161000). Esta función NO depende de que exista al momento de crearse
-- ni de correr: si la tabla no está, resta cero (SQL dinámico detrás de
-- `to_regclass`). Así el orden de aplicación no importa — ni acá ni al pegar en
-- producción.
--
-- DEFINICIONES (las lee la interfaz):
--   · unidades_pendientes: unidades aún por llegar en comprobantes vigentes con
--     recepción `sin_recibir` o `parcial` (Σ pendiente de sus líneas).
--   · valor_por_recibir: esas unidades al costo facturado CON IGV (proporción del
--     total del comprobante: pendiente × costo × total/subtotal) — comparable con
--     el saldo, que también lleva IGV.
--   · «atrasado»: vigente, por recibir, y hoy > fecha_estimada_llegada (o
--     emisión + 7 días si no hay). dias_mas_atrasada = hoy − esa fecha; NULL si
--     ninguno está atrasado (documento y proveedor también).
--   · compras_mes / compras_mes_anterior: Σ total (con IGV) de comprobantes
--     vigentes por fecha de emisión en el mes calendario de Lima / en el mes
--     anterior COMPLETO. Brutas: las notas de crédito no las reducen.
--   · igv_mes: por fecha de emisión (facturas) y por fecha del documento (notas).
--   · top_proveedor_*: el proveedor con mayor saldo sobre la deuda total
--     (comprobantes vigentes con saldo > 0); NULL si no hay deuda.
-- ============================================================================

set search_path = retail, public, extensions;

-- ==================== 1. resumen_compras: solo el reloj ====================
-- Mismo cuerpo de 20260918130000 (10 columnas, candado de sede); `current_date`
-- pasa a `fn_hoy_lima()`. Sin cambio de RETURNS: `create or replace` basta.
create or replace function retail.resumen_compras()
returns table (
  registradas bigint, vigentes bigint, por_recibir bigint,
  deuda numeric, con_saldo bigint, vencido numeric, vencidas bigint,
  por_vencer bigint, por_vencer_monto numeric, por_recibir_atrasadas bigint
)
language sql stable security definer
set search_path = retail, public, extensions
as $$
  select
    (select count(*) from compras where fn_puede_operar_ubicacion(ubicacion_destino_id)),
    (select count(*) from compras where estado = 'vigente' and fn_puede_operar_ubicacion(ubicacion_destino_id)),
    (select count(*) from compras where estado = 'vigente' and estado_recepcion in ('sin_recibir', 'parcial') and fn_puede_operar_ubicacion(ubicacion_destino_id)),
    (select coalesce(sum(saldo), 0) from compras where estado = 'vigente' and saldo > 0 and fn_puede_operar_ubicacion(ubicacion_destino_id)),
    (select count(*) from compras where estado = 'vigente' and saldo > 0 and fn_puede_operar_ubicacion(ubicacion_destino_id)),
    (select coalesce(sum(saldo), 0) from compras where estado = 'vigente' and saldo > 0 and fecha_vencimiento < fn_hoy_lima() and fn_puede_operar_ubicacion(ubicacion_destino_id)),
    (select count(*) from compras where estado = 'vigente' and saldo > 0 and fecha_vencimiento < fn_hoy_lima() and fn_puede_operar_ubicacion(ubicacion_destino_id)),
    (select count(*) from compras where estado = 'vigente' and saldo > 0 and fecha_vencimiento between fn_hoy_lima() and fn_hoy_lima() + 7 and fn_puede_operar_ubicacion(ubicacion_destino_id)),
    (select coalesce(sum(saldo), 0) from compras where estado = 'vigente' and saldo > 0 and fecha_vencimiento between fn_hoy_lima() and fn_hoy_lima() + 7 and fn_puede_operar_ubicacion(ubicacion_destino_id)),
    (select count(*) from compras where estado = 'vigente' and estado_recepcion in ('sin_recibir', 'parcial')
       and fn_hoy_lima() > coalesce(fecha_estimada_llegada, fecha_emision + 7) and fn_puede_operar_ubicacion(ubicacion_destino_id))
  where auth.uid() is not null;
$$;

comment on function retail.resumen_compras() is
  'Cifras de cabecera de Compras (10 columnas). "Hoy" = fn_hoy_lima(), no current_date (ADR-0106). Acotada por sede (ADR-0075).';

revoke all on function retail.resumen_compras() from public, anon;
grant execute on function retail.resumen_compras() to authenticated;

-- ==================== 2. resumen_compras_extra: las cifras que faltaban ====================
-- plpgsql y no sql: el IGV de las notas de crédito se consulta con SQL dinámico
-- (ver cabecera). Todo va con alias de tabla: en un `RETURNS TABLE` de plpgsql
-- los nombres de salida son variables y chocan con columnas homónimas
-- ("column reference is ambiguous", ADR-0094) — acá ninguna columna se llama
-- igual, pero el hábito es el candado.
create or replace function retail.resumen_compras_extra()
returns table (
  unidades_pendientes bigint,
  valor_por_recibir numeric,
  dias_mas_atrasada integer,
  documento_mas_atrasada text,
  proveedor_mas_atrasado text,
  compras_mes numeric,
  compras_mes_anterior numeric,
  igv_mes numeric,
  top_proveedor_id uuid,
  top_proveedor_nombre text,
  top_proveedor_pct numeric
)
language plpgsql stable security definer
set search_path = retail, public, extensions
as $$
declare
  v_hoy date := fn_hoy_lima();
  v_mes date := date_trunc('month', fn_hoy_lima())::date;
  v_mes_sig date := (date_trunc('month', fn_hoy_lima()) + interval '1 month')::date;
  v_mes_ant date := (date_trunc('month', fn_hoy_lima()) - interval '1 month')::date;
  v_unidades bigint := 0;
  v_valor numeric := 0;
  v_dias integer;
  v_documento text;
  v_proveedor text;
  v_compras_mes numeric := 0;
  v_compras_ant numeric := 0;
  v_igv_facturas numeric := 0;
  v_igv_notas numeric := 0;
  v_top_id uuid;
  v_top_nombre text;
  v_top_pct numeric;
begin
  -- Sin sesión no hay filas: mismo comportamiento que `resumen_compras`.
  if auth.uid() is null then
    return;
  end if;

  -- Lo que falta llegar. `pendiente` viene de compra_items_resumen: cuando D2
  -- descuente las líneas cerradas, esta cifra las descuenta sola.
  select coalesce(sum(greatest(ci.pendiente, 0)), 0)::bigint,
         coalesce(round(sum(greatest(ci.pendiente, 0) * ci.costo_unitario * c.total / nullif(c.subtotal, 0)), 2), 0)
    into v_unidades, v_valor
  from compras c
  join compra_items_resumen ci on ci.compra_id = c.id
  where c.estado = 'vigente'
    and c.estado_recepcion in ('sin_recibir', 'parcial')
    and fn_puede_operar_ubicacion(c.ubicacion_destino_id);

  -- La entrega más atrasada: la que lleva más días de retraso; a igualdad, la
  -- de emisión más antigua (desempate estable).
  select (v_hoy - coalesce(c.fecha_estimada_llegada, c.fecha_emision + 7))::integer, c.documento, pr.nombre
    into v_dias, v_documento, v_proveedor
  from compras c
  join proveedores pr on pr.id = c.proveedor_id
  where c.estado = 'vigente'
    and c.estado_recepcion in ('sin_recibir', 'parcial')
    and v_hoy > coalesce(c.fecha_estimada_llegada, c.fecha_emision + 7)
    and fn_puede_operar_ubicacion(c.ubicacion_destino_id)
  order by coalesce(c.fecha_estimada_llegada, c.fecha_emision + 7) asc, c.fecha_emision asc, c.id asc
  limit 1;

  -- Compras del mes (Lima) contra el mes anterior completo, e IGV de las facturas.
  select coalesce(sum(c.total) filter (where c.fecha_emision >= v_mes and c.fecha_emision < v_mes_sig), 0),
         coalesce(sum(c.total) filter (where c.fecha_emision >= v_mes_ant and c.fecha_emision < v_mes), 0),
         coalesce(sum(c.igv) filter (where c.tipo = 'factura' and c.fecha_emision >= v_mes and c.fecha_emision < v_mes_sig), 0)
    into v_compras_mes, v_compras_ant, v_igv_facturas
  from compras c
  where c.estado = 'vigente'
    and c.fecha_emision >= v_mes_ant and c.fecha_emision < v_mes_sig
    and fn_puede_operar_ubicacion(c.ubicacion_destino_id);

  -- IGV de las notas de crédito del mes: solo si la tabla ya existe (D2).
  if to_regclass('retail.compra_notas_credito') is not null then
    execute $q$
      select coalesce(sum(nc.igv), 0)
      from retail.compra_notas_credito nc
      join retail.compras c on c.id = nc.compra_id
      where nc.fecha >= $1 and nc.fecha < $2
        and c.estado = 'vigente'
        and retail.fn_puede_operar_ubicacion(c.ubicacion_destino_id)
    $q$ into v_igv_notas using v_mes, v_mes_sig;
  end if;

  -- Quién concentra la deuda.
  with deuda as (
    select c.proveedor_id, sum(c.saldo) as saldo_prov
    from compras c
    where c.estado = 'vigente' and c.saldo > 0
      and fn_puede_operar_ubicacion(c.ubicacion_destino_id)
    group by c.proveedor_id
  )
  select d.proveedor_id, pr.nombre, round(100 * d.saldo_prov / nullif((select sum(x.saldo_prov) from deuda x), 0), 1)
    into v_top_id, v_top_nombre, v_top_pct
  from deuda d
  join proveedores pr on pr.id = d.proveedor_id
  order by d.saldo_prov desc, pr.nombre asc
  limit 1;

  return query select
    v_unidades, v_valor,
    v_dias, v_documento, v_proveedor,
    v_compras_mes, v_compras_ant, v_igv_facturas - v_igv_notas,
    v_top_id, v_top_nombre, v_top_pct;
end;
$$;

comment on function retail.resumen_compras_extra() is
  'Una fila: por recibir (unidades y valor con IGV), entrega más atrasada, compras del mes vs mes anterior, IGV del mes (facturas − notas de crédito) y proveedor que concentra la deuda. "Hoy" = fn_hoy_lima(). Acotada por sede (ADR-0075). ADR-0106.';

revoke all on function retail.resumen_compras_extra() from public, anon;
grant execute on function retail.resumen_compras_extra() to authenticated;
