-- ============================================================================
-- 20261023212000_caja_registra_gastos_sin_finanzas.sql — CAYLA V2 (ADR-0491, Felipe 2026-10-23)
--
-- EL PROBLEMA PRIMERO. «Registrar gasto» vive en Caja (la hoja rápida del mosaico, ADR-0368), pero solo aparecía a quien tenía el
--   módulo Gastos de Finanzas: `registrar_gasto` pregunta `fn_gastos_puede`, que sale de `fn_gastos_ubicaciones` (módulo Gastos). Para
--   que una colaboradora pagara la movilidad desde el cajón y la anotara bien, había que abrirle Finanzas ▸ Gastos entero: anular gastos,
--   los gastos fijos del mes, los activos y los egresos por clasificar. Sin él, la plata igual salía (cualquiera que opera la tienda
--   registra un egreso «Otro» del cajón, `registrar_movimiento_caja`), pero sin decir qué fue: quedaba «por clasificar» para Finanzas.
--
-- LA DECISIÓN (ADR-0491, sobre ADR-0306: lo que hace un botón es del módulo donde vive su botón). Registrar el gasto de HOY de la tienda
--   desde su caja abierta es una función del módulo Caja: quien maneja la caja (`fn_puede_gestionar_caja`) de la tienda que opera
--   (`fn_puede_operar_ubicacion`) lo registra sin el módulo Gastos. Solo lo que hace la hoja rápida: fecha de hoy, al contado, del cajón
--   abierto o con el Yape o el Plin de la tienda, con o sin factura o boleta de un proveedor que ya existe. Otra fecha, a crédito, un
--   gasto fijo, clasificar un egreso ya hecho o sacarlo de otra cuenta siguen siendo de Finanzas ▸ Gastos (`gasto_fuera_de_caja`).
--   Anular un gasto también: sigue con su módulo.
--
--   1. `fn_gastos_desde_caja_puede(ubicación)`: ¿quien registra maneja la caja abierta de esa tienda?
--   2. `fn_puede_registrar_gasto(…)`: la regla entera que pregunta `registrar_gasto` (módulo Gastos, o Caja dentro de su alcance).
--   3. `registrar_gasto` la pregunta en lugar de `fn_gastos_puede` (reemplazo ANCLADO: una sola línea; si el ancla no aparece una vez,
--      se detiene sin tocar nada).
--   4. `fn_gastos_de_caja(ubicación, desde)`: lo que Caja lee de los gastos de su tienda (la tarjeta «Gastos del turno» y la ★ del mosaico).
--      Con el módulo Gastos, todos los de la tienda (como `fn_gastos_lista`); desde Caja, solo los que pasaron por la caja o por el Yape o
--      el Plin de la tienda: el alquiler pagado por transferencia no se le muestra a quien no ve Finanzas. Nunca más de 90 días atrás.
--   5. El «incluye» del módulo Caja lo dice, para que Roles y accesos no prometa menos de lo que hace.
--
-- CONTRATO (Liskov)
--   PROMETE: quien tiene el módulo Gastos (o es líder) registra exactamente lo mismo que antes, con los mismos mensajes; quien maneja la
--            caja abierta de su tienda registra el gasto de hoy al contado (efectivo del cajón, Yape o Plin) sin el módulo Gastos, y
--            cualquier otro gasto se le rechaza con `gasto_fuera_de_caja` sin escribir nada; con la caja cerrada, `caja_cerrada`.
--            `fn_gastos_de_caja` devuelve a quien tiene Gastos lo mismo que `fn_gastos_lista` (vigentes de la tienda) y desde Caja solo lo
--            que pasó por la caja o por el Yape o el Plin; a nadie más.
--   ASUME:   `registrar_gasto` con la línea `if not retail.fn_gastos_puede(p_ubicacion_id) then` una sola vez (verificado en local y en
--            producción el 2026-10-23, antes de pegarla; si el ancla no aparece una vez, el reemplazo se detiene y no se aplica nada);
--            `fn_puede_gestionar_caja`, `fn_puede_operar_ubicacion`, `fn_gastos_puede` y `gastos_viaje.papel` (ADR-0362) vivos.
--   NO HACE: no toca filas de gastos, cajas ni roles (ningún rol gana ni pierde un módulo); no cambia `fn_gastos_lista` ni las demás
--            funciones de Finanzas ▸ Gastos; no toca políticas.
--
-- CÓMO SE PEGA. Una sola parte: funciones nuevas, un reemplazo anclado y un `update` del texto de un módulo. Sin políticas, sin
-- `alter table` ni `drop trigger` (ADR-0195). Idempotente.
-- ============================================================================
set lock_timeout = '3s';

-- ----------------------------------------------------------------------------
-- 1. ¿Quien registra maneja la caja abierta de esa tienda?
-- ----------------------------------------------------------------------------
create or replace function retail.fn_gastos_desde_caja_puede(p_ubicacion_id uuid)
returns boolean
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select coalesce(
    p_ubicacion_id is not null
    and retail.fn_puede_gestionar_caja()
    and retail.fn_puede_operar_ubicacion(p_ubicacion_id)
    and exists (select 1 from retail.cajas k where k.ubicacion_id = p_ubicacion_id and k.estado = 'abierta'),
    false);
$$;

-- ----------------------------------------------------------------------------
-- 2. La regla entera de `registrar_gasto`: con el módulo Gastos, los de su tienda; sin él, desde Caja, el gasto de hoy al contado.
-- ----------------------------------------------------------------------------
create or replace function retail.fn_puede_registrar_gasto(
  p_ubicacion_id uuid, p_fecha date, p_comprobante jsonb, p_medio_pago text,
  p_caja_movimiento_id uuid, p_gasto_fijo_id uuid, p_cuenta_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
begin
  if retail.fn_gastos_puede(p_ubicacion_id) then
    return true;
  end if;
  -- Sin el módulo Gastos, solo quien maneja la caja de la tienda que opera. Si no, el mensaje de siempre (`registrar_gasto`).
  if p_ubicacion_id is null or not retail.fn_puede_gestionar_caja() or not retail.fn_puede_operar_ubicacion(p_ubicacion_id) then
    return false;
  end if;
  if not retail.fn_gastos_desde_caja_puede(p_ubicacion_id) then
    raise exception 'La caja de esta tienda está cerrada: ábrela para registrar el gasto desde Caja.'
      using errcode = 'P0001', hint = 'caja_cerrada';
  end if;
  -- Lo que hace la hoja rápida de Caja (ADR-0368). Lo demás es de Finanzas ▸ Gastos.
  if p_fecha is distinct from retail.fn_hoy_lima()
     or p_gasto_fijo_id is not null
     or p_caja_movimiento_id is not null
     or p_cuenta_id is not null
     or coalesce(p_comprobante->>'condicion', 'contado') <> 'contado'
     or p_medio_pago is null or p_medio_pago not in ('efectivo', 'yape', 'plin') then
    raise exception 'Desde Caja se registra el gasto de hoy, pagado al contado: del cajón, con Yape o con Plin. Otra fecha, a crédito o un gasto fijo los registra quien tiene el módulo Gastos.'
      using errcode = '42501', hint = 'gasto_fuera_de_caja';
  end if;
  return true;
end;
$$;

revoke all on function retail.fn_gastos_desde_caja_puede(uuid) from public, anon, authenticated;
revoke all on function retail.fn_puede_registrar_gasto(uuid, date, jsonb, text, uuid, uuid, uuid) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. `registrar_gasto` pregunta la regla entera.
-- ----------------------------------------------------------------------------
-- Reemplaza `p_ancla`, que tiene que aparecer exactamente una vez, por `p_nuevo`. Si `p_marca` ya está en la función, no hace nada.
create or replace function pg_temp.reemplazar_una_vez(p_firma text, p_ancla text, p_nuevo text, p_marca text)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_marca in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_ancla, ''))) / length(p_ancla);
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta migración: se esperaba una aparición de «%» y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_ancla, v_n;
  end if;
  execute overlay(v_def placing p_nuevo from position(p_ancla in v_def) for length(p_ancla));
end;
$f$;

select pg_temp.reemplazar_una_vez(
  'retail.registrar_gasto(uuid, text, text, date, numeric, jsonb, text, uuid, uuid, text, uuid, uuid, uuid)',
  $v$  if not retail.fn_gastos_puede(p_ubicacion_id) then$v$,
  $v$  -- Con el módulo Gastos, los de su tienda; sin él, desde Caja, el gasto de hoy al contado (ADR-0491, `fn_puede_registrar_gasto`).
  if not retail.fn_puede_registrar_gasto(p_ubicacion_id, p_fecha, p_comprobante, p_medio_pago, p_caja_movimiento_id, p_gasto_fijo_id, p_cuenta_id) then$v$,
  $v$fn_puede_registrar_gasto$v$);

-- ----------------------------------------------------------------------------
-- 4. Lo que Caja lee de los gastos de su tienda.
-- ----------------------------------------------------------------------------
create or replace function retail.fn_gastos_de_caja(p_ubicacion_id uuid, p_desde date)
returns table (id uuid, descripcion text, categoria text, categoria_nombre text, fecha date, monto_total numeric,
               medio_pago text, caja_movimiento_id uuid, comprobante_tipo text, creado_en timestamptz)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
#variable_conflict use_column
declare
  v_todo boolean := p_ubicacion_id is not null and retail.fn_gastos_puede(p_ubicacion_id);
  v_hoy date := retail.fn_hoy_lima();
begin
  if not v_todo and not retail.fn_gastos_desde_caja_puede(p_ubicacion_id) then
    raise exception 'Ver los gastos de esta tienda necesita su caja abierta o el módulo Gastos.' using errcode = '42501';
  end if;
  return query
  select g.id, g.descripcion, g.categoria, k.nombre, g.fecha, g.monto_total, m.medio, g.caja_movimiento_id,
         -- Como `fn_gastos_lista`: un gasto del viaje trae su papel de su ficha (ADR-0362, fase 6).
         coalesce(c.tipo, gv.papel), g.created_at
    from retail.gastos g
    join retail.categorias_gasto k on k.codigo = g.categoria
    left join retail.compras c on c.id = g.compra_id
    left join retail.gastos_viaje gv on gv.gasto_id = g.id
    -- Un gasto con factura dice su medio por su pago (como `fn_gastos_lista`).
    cross join lateral (
      select coalesce(g.medio_pago, (select x.metodo from retail.compra_pagos x where x.compra_id = g.compra_id
                                      order by x.fecha, x.created_at limit 1)) as medio
    ) m
   where g.ubicacion_id = p_ubicacion_id
     and g.estado = 'vigente'
     and g.fecha between greatest(p_desde, v_hoy - 90) and v_hoy
     and (v_todo or g.caja_movimiento_id is not null or m.medio in ('yape', 'plin'))
   order by g.fecha desc, g.created_at desc, g.id;
end;
$$;

revoke all on function retail.fn_gastos_de_caja(uuid, date) from public, anon;
grant execute on function retail.fn_gastos_de_caja(uuid, date) to authenticated;

-- ----------------------------------------------------------------------------
-- 5. Roles y accesos dice lo que hace el módulo Caja.
-- ----------------------------------------------------------------------------
update retail.modulos
   set incluye = 'Abrir y cerrar caja, ingresos y egresos, ajustes de caja, y registrar los gastos de hoy que se pagan del cajón o con el Yape o el Plin de la tienda'
 where clave = 'caja';
