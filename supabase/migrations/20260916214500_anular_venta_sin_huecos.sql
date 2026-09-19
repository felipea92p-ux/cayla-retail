-- ============================================================================
-- 20260916214500_anular_venta_sin_huecos.sql — CAYLA V2
--
-- ESTE ARCHIVO ES UNA RECONSTRUCCIÓN, NO EL ORIGINAL. La migración se aplicó a
-- producción el 2026-09-16 (quedó registrada como `anular_venta_sin_huecos`, versión
-- 20260916214500) pero nunca se subió al repo: no está en `main`, ni en ningún
-- worktree, ni en el historial de git de ninguna rama. Se descubrió el 2026-09-18 al
-- intentar cerrar un "hueco" (devolver una venta ya anulada) que en producción ya
-- estaba cerrado: el repo y el Postgres local iban atrás de producción, y las pruebas
-- locales ejercitaban un sistema más débil que el real.
--
-- Esto reproduce los objetos tal como están HOY en producción (`cayla-dynamic`, leídos
-- de `pg_proc`/`pg_constraint` el 2026-09-18). El cuerpo de cada función se verificó
-- por huella (md5 del texto sin espacios) contra el de producción. Lo que no puedo
-- saber es si el archivo original tocaba algo más que hoy no se vea desde afuera.
--
-- IDEMPOTENTE: pegarla en producción no cambia nada — `create or replace` con cuerpo
-- idéntico, `create or replace trigger`, y la restricción solo si falta. Su único
-- efecto real es sobre un Postgres local/`db reset`, que pasa a coincidir con
-- producción.
--
-- QUÉ TIENE (todo alrededor de anular una venta):
--   1. `venta_anulacion_items_una_vez_por_linea`: una línea de venta solo se anula
--      una vez. Sin esto, dos anulaciones a la vez devolverían dos veces la misma
--      prenda al stock.
--   2. `fn_linea_de_venta_no_anulada` + un trigger `before insert` en `cambios` y en
--      `devolucion_items`: una venta anulada no admite cambio ni devolución. Toma
--      `for share` sobre la venta, y `anular_venta` la toma `for update` primero: si
--      corren a la vez, una espera a la otra y la segunda ve el estado real. Es el
--      candado en la TABLA (principio 2), no en cada RPC: cubre cualquier camino que
--      inserte, no solo `crear_devolucion`/`registrar_cambio`.
--   3. `anular_venta` endurecida sobre la de 20260916172645: `for update` primero;
--      revierte el stock con la salida REAL de cada línea (misma ubicación y
--      sububicación de donde salió) y se niega si no hay exactamente una; exige cada
--      línea una sola vez (antes solo contaba cuántas llegaban, y una repetida
--      dejaba pasar a otra que faltaba).
--   4. `cerrar_caja`: no espera en el cajón el efectivo de una venta anulada. Ya
--      volvió a la clienta (anular exige esta misma caja abierta); contarlo dejaba
--      un faltante fantasma en el arqueo.
--
-- FIRMAS. Iguales a las de antes → `create or replace` alcanza y NO crea sobrecargas
-- (el hueco de ADR-0009/0004). Los permisos de EXECUTE de `anular_venta` y
-- `cerrar_caja` no se tocan.
--
-- LOCAL. El timestamp es anterior a migraciones que otras sesiones ya aplicaron al
-- Postgres local compartido: `npx supabase migration up --local --include-all`.
--
-- SE ROMPE SI: alguien intenta devolver o cambiar una prenda de una venta anulada
-- (sale un mensaje que dice por qué), o anular dos veces la misma línea.
-- ============================================================================

set search_path = retail, public, extensions;

-- ---------- 1. una línea de venta se anula una sola vez ----------
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'venta_anulacion_items_una_vez_por_linea'
      and conrelid = 'retail.venta_anulacion_items'::regclass
  ) then
    alter table retail.venta_anulacion_items
      add constraint venta_anulacion_items_una_vez_por_linea unique (venta_item_id);
  end if;
end $$;

-- ---------- 2. una venta anulada no admite cambio ni devolución ----------
create or replace function retail.fn_linea_de_venta_no_anulada()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_estado text;
begin
  if new.venta_item_id is null then
    return new;
  end if;
  select v.estado into v_estado
    from venta_items vi join ventas v on v.id = vi.venta_id
    where vi.id = new.venta_item_id
    for share of v;
  if v_estado = 'anulada' then
    raise exception 'Esta venta está anulada — ya no admite cambios ni devoluciones';
  end if;
  return new;
end;
$$;

revoke all on function retail.fn_linea_de_venta_no_anulada() from public;
grant execute on function retail.fn_linea_de_venta_no_anulada() to authenticated;

create or replace trigger cambios_venta_no_anulada
  before insert on retail.cambios
  for each row execute function retail.fn_linea_de_venta_no_anulada();

create or replace trigger devolucion_items_venta_no_anulada
  before insert on retail.devolucion_items
  for each row execute function retail.fn_linea_de_venta_no_anulada();

-- ---------- 3. anular_venta endurecida ----------
create or replace function retail.anular_venta(
  p_venta_id uuid, p_motivo text, p_items jsonb
)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_venta ventas%rowtype;
  v_caja_estado text;
  v_persona uuid;
  v_item jsonb;
  v_venta_item venta_items%rowtype;
  v_salida movimientos%rowtype;
  v_salidas integer;
  v_mov_id uuid;
  v_condicion text;
  v_items_venta integer;
  v_items_input integer;
  v_items_distintos integer;
begin
  if not fn_es_lider() then
    raise exception 'Solo un líder puede anular una venta';
  end if;
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'Anular una venta necesita un motivo';
  end if;

  -- `for update` primero: una devolución o un cambio de esta misma venta que llegue al
  -- mismo tiempo espera acá (su disparador pide `for share` sobre esta fila).
  select * into v_venta from ventas where id = p_venta_id for update;
  if not found then
    raise exception 'La venta % no existe', p_venta_id;
  end if;
  if v_venta.estado = 'anulada' then
    raise exception 'Esta venta ya está anulada';
  end if;

  if v_venta.caja_id is null then
    raise exception 'Esta venta no tiene caja registrada — no se puede confirmar que sigue abierta';
  end if;
  select estado into v_caja_estado from cajas where id = v_venta.caja_id;
  if v_caja_estado is distinct from 'abierta' then
    raise exception 'La caja de esta venta ya cerró — a partir de ahí, usa Cambio o Devolución';
  end if;

  if exists (
    select 1 from comprobantes where venta_id = p_venta_id and estado in ('enviado', 'aceptado')
  ) then
    raise exception 'Esta venta ya tiene un comprobante enviado o aceptado por SUNAT — usa Cambio o Devolución en su lugar';
  end if;

  -- Un ítem ya tocado por Cambios o Devoluciones no puede volver a contarse acá:
  -- anular movería stock de nuevo sobre una cantidad que ese otro camino ya movió.
  if exists (
    select 1 from venta_items vi
    where vi.venta_id = p_venta_id
      and (
        exists (select 1 from cambios ca where ca.venta_item_id = vi.id)
        or exists (
          select 1 from devolucion_items di join devoluciones d on d.id = di.devolucion_id
          where di.venta_item_id = vi.id and d.estado <> 'rechazada'
        )
      )
  ) then
    raise exception 'Esta venta ya tiene un cambio o una devolución registrada — resuelve sus ítems por separado en vez de anular la venta completa';
  end if;

  -- Cada línea de la venta, una vez cada una. Contar solo cuántas llegan dejaba pasar
  -- una línea repetida en lugar de otra.
  select count(*) into v_items_venta from venta_items where venta_id = p_venta_id;
  select count(*), count(distinct e ->> 'venta_item_id')
    into v_items_input, v_items_distintos
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e;
  if v_items_input <> v_items_venta or v_items_distintos <> v_items_venta then
    raise exception 'Anular una venta necesita la condición de cada una de sus % líneas, una vez cada una (llegaron %)',
      v_items_venta, v_items_input;
  end if;

  select id into v_persona from public.personas where auth_user_id = auth.uid();

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_venta_item from venta_items
      where id = (v_item ->> 'venta_item_id')::uuid and venta_id = p_venta_id;
    if not found then
      raise exception 'El ítem % no pertenece a la venta %', v_item ->> 'venta_item_id', p_venta_id;
    end if;
    v_condicion := v_item ->> 'condicion';
    v_mov_id := null;

    if v_condicion = 'vendible' then
      select count(*) into v_salidas from movimientos
        where venta_item_id = v_venta_item.id and tipo = 'salida' and motivo = 'venta';
      if v_salidas <> 1 then
        raise exception 'La línea % tiene % salidas de stock por venta registradas (se esperaba 1) — esta venta necesita revisarse a mano, no anularse',
          v_venta_item.id, v_salidas;
      end if;
      select * into v_salida from movimientos
        where venta_item_id = v_venta_item.id and tipo = 'salida' and motivo = 'venta';

      insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, venta_item_id, usuario_id)
        values (v_salida.variante_id, v_salida.ubicacion_id, v_salida.sububicacion_id, 'entrada', v_salida.cantidad,
                'anulacion_venta', v_venta_item.id, v_persona)
        returning id into v_mov_id;
      perform fn_aplicar_movimiento(v_mov_id);
    end if;

    insert into venta_anulacion_items (venta_id, venta_item_id, condicion, movimiento_id)
      values (p_venta_id, v_venta_item.id, v_condicion, v_mov_id);
  end loop;

  update ventas set estado = 'anulada', motivo_anulacion = p_motivo, anulado_por = v_persona, anulado_en = now()
    where id = p_venta_id;
end;
$$;

-- ---------- 4. cerrar_caja no espera el efectivo de una venta anulada ----------
create or replace function retail.cerrar_caja(p_caja_id uuid, p_monto_real numeric)
returns table (monto_sistema numeric, monto_real numeric, diferencia numeric)
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_caja cajas%rowtype;
  v_ventas_efectivo numeric;
  v_ingresos numeric;
  v_egresos numeric;
  v_reembolsos_efectivo numeric;
  v_cambios_efectivo numeric;
  v_sistema numeric;
  v_persona uuid;
begin
  select * into v_caja from cajas where id = p_caja_id;
  if not found then
    raise exception 'La caja % no existe', p_caja_id;
  end if;
  if not fn_puede_operar_ubicacion(v_caja.ubicacion_id) then
    raise exception 'No tienes permiso para cerrar esa caja';
  end if;
  if v_caja.estado <> 'abierta' then
    raise exception 'Esta caja ya está cerrada';
  end if;
  if p_monto_real < 0 then
    raise exception 'El monto contado no puede ser negativo';
  end if;

  -- Una venta anulada devolvió su dinero a la clienta (anular_venta exige esta misma
  -- caja abierta): su efectivo ya no está en el cajón y no se espera.
  select coalesce(sum(vp.monto), 0) into v_ventas_efectivo
    from venta_pagos vp join ventas v on v.id = vp.venta_id
    where v.caja_id = p_caja_id and vp.metodo = 'efectivo' and v.estado <> 'anulada';

  select coalesce(sum(monto) filter (where tipo = 'ingreso'), 0),
         coalesce(sum(monto) filter (where tipo = 'egreso'), 0)
    into v_ingresos, v_egresos
    from caja_movimientos where caja_id = p_caja_id;

  select coalesce(sum(reembolso_monto), 0) into v_reembolsos_efectivo
    from devoluciones
    where caja_id = p_caja_id and estado = 'aprobada' and reembolso_metodo = 'efectivo';

  -- `cambios.diferencia` ya trae el signo: positiva (la clienta pagó de más)
  -- suma, negativa (se le devolvió) resta — un solo sum cubre los dos
  -- sentidos. Calificado con `cambios.` porque esta función también RETORNA
  -- una columna `diferencia` (la del cuadre) — sin calificar, Postgres no
  -- sabe si es la columna de la tabla o el parámetro de salida.
  select coalesce(sum(cambios.diferencia), 0) into v_cambios_efectivo
    from cambios
    where caja_id = p_caja_id and metodo_pago_diferencia = 'efectivo';

  v_sistema := v_caja.monto_apertura + v_ventas_efectivo + v_ingresos - v_egresos
               - v_reembolsos_efectivo + v_cambios_efectivo;
  select id into v_persona from personas where auth_user_id = auth.uid();

  update cajas set
    estado = 'cerrada',
    monto_cierre_sistema = v_sistema,
    monto_cierre_real = p_monto_real,
    diferencia = p_monto_real - v_sistema,
    cerrada_por = v_persona,
    cerrada_en = now()
  where id = p_caja_id;

  return query select v_sistema, p_monto_real, p_monto_real - v_sistema;
end;
$$;
