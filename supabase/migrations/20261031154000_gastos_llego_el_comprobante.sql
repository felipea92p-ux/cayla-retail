-- ============================================================================
-- 20261031154000_gastos_llego_el_comprobante.sql — CAYLA V2 · ADR-0588 (Gastos: «Llegó el comprobante»)
-- Un gasto que se pagó sin comprobante recibe su boleta, factura o recibo por honorarios cuando llega (Felipe, 2026-10-31, punto 2 de la comparación
-- con las apps de gastos de hoy, y su decisión: «como si se registró con él»).
--
-- EL PROBLEMA PRIMERO. El técnico de la remalladora cobra S/ 450 en efectivo y dice «mañana te traigo el recibo». Hoy, cuando lo trae, no hay dónde
-- ponerlo: el gasto queda marcado «Sin comprobante» para siempre, su IGV no cuenta y la única salida es anularlo y registrarlo otra vez (y si salió del
-- cajón, anular no devuelve la plata a la caja). Con una factura al contado ni eso: un comprobante con pagos no se anula.
--
-- QUÉ HACE, Y POR QUÉ ASÍ. `agregar_comprobante_a_gasto(gasto, comprobante)` deja el gasto EXACTAMENTE como si se hubiera registrado con su comprobante
-- al contado (`registrar_gasto` → `fn_comprobante_y_pago`), sin mover un sol:
--   1. crea el comprobante (`compras`, naturaleza gasto, contado) con la fecha que dice el papel: su IGV entra a Impuestos en el mes de esa fecha;
--   2. le pasa el pago que el gasto ya tenía (`compra_pagos`): la MISMA fecha del gasto, el mismo medio, la misma cuenta y el mismo egreso del cajón.
--      La plata ya salió: no se escribe ningún movimiento de dinero ni de caja; el saldo de cada cuenta queda igual;
--   3. el gasto apunta a su comprobante (`compra_id`, `igv`) y suelta su medio y su cuenta, que ahora viven en el pago (`gastos_pago_coherente`);
--   4. deja su rastro en `gasto_correcciones` («Comprobante: Sin comprobante → Factura F001-000288»).
-- Desde ahí todo lo demás sale solo: la marca «Sin comprobante» se va, el IGV de una factura cuenta (y, si se pagó en efectivo desde S/ 2 000, la
-- bancarización lo da por perdido, `fn_igv_perdido`, como a cualquier factura).
--
-- CUÁNDO NO SE PUEDE (la base lo exige): sin el módulo Gastos de esa tienda; anulado; ya tiene comprobante; gasto del viaje (su papel va en Compras);
-- la comisión de un abono de tarjeta; un gasto pagado desde un fondo por rendir (su papel va en la rendición: sus partidas se guardan por gasto y no se
-- mueven de lugar); y un mes cerrado, sea el del gasto, el del pago o el de la fecha del papel (los candados de `gastos`, `compra_pagos` y `compras`).
--
-- LAS MARCAS. `fn_gastos_solo_anular` y `fn_gastos_sellar` dejan cambiar, SOLO dentro de esta función (marca `retail.gastos_comprobante_tardio` = el id
-- de ESE gasto), lo que pasa del gasto a su comprobante: `compra_id` (de nada a uno), `igv`, `medio_pago` y `cuenta_dinero_id` (a nada). La categoría,
-- el «qué fue», el monto, la fecha, la sede y el egreso del cajón no cambian. Se reescriben enteras (la de 20261031151000, con su marca de corregir).
--
-- EL EGRESO DEL CAJÓN. Un gasto pagado del cajón ya tiene su egreso, y `fn_exigir_egreso_del_pago` no deja que un pago use un egreso que ya es
-- un gasto (`fn_egreso_ya_usado`). Aquí es el MISMO gasto pasándole su egreso a su propio comprobante (como `registrar_gasto`, que escribe el pago
-- antes que el gasto): con la marca de ESE gasto, y solo si quien lo usa es ese gasto, el egreso se acepta. El resto de la regla sigue igual.
--
-- DOS TOQUES. El candado del gasto (`for update`): el segundo ve que ya tiene comprobante; si es el mismo papel, devuelve `ya_estaba`.
--
-- DESCARTÉ
--   · «Solo anotar el número» sin crear el comprobante (Felipe eligió que el IGV cuente): habría dejado el papel en dos lugares.
--   · Llamar a `fn_comprobante_y_pago`: usa una sola fecha para el papel y el pago, y crea un egreso nuevo del cajón cuando no se le da uno. Aquí el
--     pago ya existe y su fecha es la del gasto. Sus validaciones del comprobante se repiten igual (mismos mensajes): tipo, proveedor, serie y número,
--     el IGV entre cero y el total, y el comprobante repetido.
--   · Permitirlo en un mes cerrado y llevar el IGV al mes del papel: el gasto y su pago son del mes cerrado; se reabre con motivo, como todo.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe, DESPUÉS de 20261031151000). UNA sola parte: el `alter` es de `gasto_correcciones`, la tabla nueva de
-- 20261031151000 (nadie más la usa); tres funciones reemplazadas (`fn_gastos_solo_anular`, `fn_gastos_sellar`, `fn_exigir_egreso_del_pago`) y una nueva; sin políticas ni `drop trigger` (ADR-0195). Idempotente. Sin `select … into`
-- dentro de textos entre comillas (ADR-0288).
-- ============================================================================
set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- ---------- 1. El rastro también dice cuándo llegó el comprobante ----------
alter table retail.gasto_correcciones drop constraint if exists gasto_correcciones_campo_check;
alter table retail.gasto_correcciones add constraint gasto_correcciones_campo_check check (campo in ('categoria', 'descripcion', 'comprobante'));

-- ---------- 2. Un gasto solo se anula, salvo al corregirlo o al recibir su comprobante ----------
create or replace function retail.fn_gastos_solo_anular()
returns trigger
language plpgsql
set search_path = retail, public, extensions
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Un gasto no se borra: se anula con un motivo.' using errcode = 'P0001';
  end if;
  if old.estado = 'anulado' then
    raise exception 'Un gasto anulado no se modifica.' using errcode = 'P0001';
  end if;
  -- ADR-0588: dentro de `corregir_gasto` (la marca es el id de ESTE gasto) cambian la categoría y el «qué fue», y nada más.
  if new.estado = 'vigente' and coalesce(current_setting('retail.gastos_corrigiendo', true), '') = old.id::text then
    if (new.id, new.ubicacion_id, new.fecha, new.monto_total, new.igv, new.compra_id, new.medio_pago, new.caja_movimiento_id,
        new.registrado_por, new.token_cliente, new.created_at, new.cuenta_dinero_id, new.gasto_fijo_id)
       is distinct from
       (old.id, old.ubicacion_id, old.fecha, old.monto_total, old.igv, old.compra_id, old.medio_pago, old.caja_movimiento_id,
        old.registrado_por, old.token_cliente, old.created_at, old.cuenta_dinero_id, old.gasto_fijo_id) then
      raise exception 'Al corregir un gasto solo cambian su categoría y qué fue.' using errcode = 'P0001';
    end if;
    return new;
  end if;
  -- ADR-0588: dentro de `agregar_comprobante_a_gasto` el gasto recibe su comprobante: el pago pasa a él (medio y cuenta a nada) y nada más cambia.
  if new.estado = 'vigente' and coalesce(current_setting('retail.gastos_comprobante_tardio', true), '') = old.id::text then
    if old.compra_id is not null or new.compra_id is null or new.medio_pago is not null or new.cuenta_dinero_id is not null
       or (new.id, new.ubicacion_id, new.categoria, new.descripcion, new.fecha, new.monto_total, new.caja_movimiento_id,
           new.registrado_por, new.token_cliente, new.created_at, new.gasto_fijo_id)
          is distinct from
          (old.id, old.ubicacion_id, old.categoria, old.descripcion, old.fecha, old.monto_total, old.caja_movimiento_id,
           old.registrado_por, old.token_cliente, old.created_at, old.gasto_fijo_id) then
      raise exception 'Al recibir su comprobante, el gasto solo pasa su pago al comprobante.' using errcode = 'P0001';
    end if;
    return new;
  end if;
  if new.estado <> 'anulado' then
    raise exception 'Un gasto solo cambia para anularse.' using errcode = 'P0001';
  end if;
  if (new.id, new.ubicacion_id, new.categoria, new.descripcion, new.fecha, new.monto_total, new.igv, new.compra_id,
      new.medio_pago, new.caja_movimiento_id, new.registrado_por, new.token_cliente, new.created_at)
     is distinct from
     (old.id, old.ubicacion_id, old.categoria, old.descripcion, old.fecha, old.monto_total, old.igv, old.compra_id,
      old.medio_pago, old.caja_movimiento_id, old.registrado_por, old.token_cliente, old.created_at) then
    raise exception 'Un gasto no se edita: se anula y se registra uno nuevo.' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- ---------- 3. La cuenta de un gasto se sella al registrarlo, salvo al pasar a su comprobante ----------
-- Se reescribe entera (la anterior es de 20260925150000): queda igual salvo la excepción de la marca.
create or replace function retail.fn_gastos_sellar()
returns trigger
language plpgsql
set search_path = retail, public, extensions
as $$
declare v_tipo text;
begin
  if tg_op = 'UPDATE' then
    -- ADR-0588: al recibir su comprobante, la cuenta pasa al pago (`agregar_comprobante_a_gasto`, con la marca de ESTE gasto): queda en nada.
    if new.cuenta_dinero_id is null and new.compra_id is not null
       and coalesce(current_setting('retail.gastos_comprobante_tardio', true), '') = old.id::text then
      return new;
    end if;
    if new.cuenta_dinero_id is distinct from old.cuenta_dinero_id then
      raise exception 'La cuenta de un gasto se sella al registrarlo: no cambia.' using errcode = 'P0001';
    end if;
    return new;
  end if;
  if new.compra_id is not null then
    if new.cuenta_dinero_id is not null then
      raise exception 'Con comprobante, la cuenta va en su pago.' using errcode = 'P0001';
    end if;
    return new;
  end if;
  if new.caja_movimiento_id is not null then
    select c.id into new.cuenta_dinero_id
      from retail.caja_movimientos m join retail.cajas k on k.id = m.caja_id
      join retail.cuentas_dinero c on c.tipo = 'cajon' and c.ubicacion_id = k.ubicacion_id
     where m.id = new.caja_movimiento_id;
    return new;
  end if;
  -- ADR-0362 fase 6: el fondo por rendir de quien paga no pasa por `fn_cuenta_sellada` (no lo acepta en ningún otro lado): lo
  -- valida `fn_fondo_para_pagar` (su dueña, con su cuenta). Puede quedar en negativo: «CAYLA te debe».
  if new.cuenta_dinero_id is not null and exists (select 1 from retail.cuentas_dinero f where f.id = new.cuenta_dinero_id and f.tipo = 'fondo') then
    perform retail.fn_fondo_para_pagar(new.cuenta_dinero_id, new.medio_pago);
    return new;
  end if;
  new.cuenta_dinero_id := retail.fn_cuenta_sellada('pago', new.medio_pago, new.ubicacion_id, new.fecha, new.cuenta_dinero_id);
  select c.tipo into v_tipo from retail.cuentas_dinero c where c.id = new.cuenta_dinero_id;
  if v_tipo = 'cajon' then
    raise exception 'Del cajón, el gasto sale de la caja abierta con su egreso.' using errcode = 'P0001';
  end if;
  if new.medio_pago = 'efectivo' and new.cuenta_dinero_id is null then
    raise exception 'En efectivo, di de dónde salió: el cajón, la caja fuerte o lo que tiene el líder.' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- ---------- 4. El egreso del cajón pasa del gasto a su comprobante ----------
-- Se reescribe entera (la anterior es de 20260925150000): queda igual salvo la excepción de la marca.
create or replace function retail.fn_exigir_egreso_del_pago(p_caja_movimiento_id uuid, p_cuenta_id uuid, p_monto numeric)
returns void
language plpgsql
set search_path = retail, public, extensions
as $$
declare v_mov retail.caja_movimientos%rowtype; v_ubic uuid; v_usado text;
begin
  perform pg_advisory_xact_lock(hashtextextended('egreso:' || p_caja_movimiento_id::text, 0));
  select * into v_mov from retail.caja_movimientos where id = p_caja_movimiento_id;
  if not found or v_mov.tipo <> 'egreso' then
    raise exception 'Un pago del cajón se respalda con un egreso de caja.' using errcode = 'P0001';
  end if;
  select k.ubicacion_id into v_ubic from retail.cajas k where k.id = v_mov.caja_id;
  if v_ubic is distinct from (select c.ubicacion_id from retail.cuentas_dinero c where c.id = p_cuenta_id and c.tipo = 'cajon') then
    raise exception 'Ese egreso es de la caja de otra tienda.' using errcode = 'P0001';
  end if;
  if v_mov.monto <> p_monto then
    raise exception 'El pago (S/ %) no coincide con el egreso de caja (S/ %).', p_monto, v_mov.monto using errcode = 'P0001';
  end if;
  if exists (select 1 from retail.compra_pagos cp where cp.caja_movimiento_id = p_caja_movimiento_id)
     or exists (select 1 from retail.comprobantes_produccion_pagos pp where pp.caja_movimiento_id = p_caja_movimiento_id) then
    raise exception 'Ese egreso de caja ya es el pago a un proveedor.' using errcode = 'P0001';
  end if;
  v_usado := retail.fn_egreso_ya_usado(p_caja_movimiento_id, 'pago');
  -- ADR-0588: el gasto que recibe su comprobante (`agregar_comprobante_a_gasto`, con su marca) le pasa SU egreso a su pago. Solo si el único gasto
  -- que lo usa es ese, y nada más lo usa (un activo, un «no es gasto», un movimiento).
  if v_usado = 'gasto'
     and exists (select 1 from retail.gastos g where g.caja_movimiento_id = p_caja_movimiento_id and g.estado = 'vigente'
                    and g.id::text = coalesce(current_setting('retail.gastos_comprobante_tardio', true), ''))
     and not exists (select 1 from retail.gastos g where g.caja_movimiento_id = p_caja_movimiento_id and g.estado = 'vigente'
                        and g.id::text <> coalesce(current_setting('retail.gastos_comprobante_tardio', true), '')) then
    -- Lo mismo, salvo ese gasto (el pago a un proveedor ya se descartó arriba).
    v_usado := retail.fn_egreso_ya_usado(p_caja_movimiento_id, 'gasto');
  end if;
  if v_usado is not null then
    raise exception 'Ese egreso de caja ya se usó (%).', case v_usado when 'gasto' then 'es un gasto' when 'activo' then 'es un activo fijo'
      when 'movimiento' then 'es un depósito o un retiro' else 'está marcado «no es gasto»' end using errcode = 'P0001';
  end if;
end $$;

-- ---------- 5. «Llegó el comprobante» ----------
-- `p_comprobante`: {tipo: factura|boleta|recibo_por_honorarios, proveedor_id, serie, numero, fecha_emision (por defecto, la del gasto), igv (solo
-- factura; por defecto, el de la tasa de su fecha)}. Devuelve {ya_estaba, compra_id, igv}.
create or replace function retail.agregar_comprobante_a_gasto(p_gasto_id uuid, p_comprobante jsonb)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_g retail.gastos%rowtype;
  v_tipo text := p_comprobante->>'tipo';
  v_prov uuid;
  v_serie text := upper(btrim(coalesce(p_comprobante->>'serie', '')));
  v_numero text := btrim(coalesce(p_comprobante->>'numero', ''));
  v_fecha date;
  v_igv numeric := 0;
  v_actor uuid;
  v_compra uuid;
  v_texto text;
begin
  begin
    v_prov := nullif(p_comprobante->>'proveedor_id', '')::uuid;
    v_fecha := nullif(p_comprobante->>'fecha_emision', '')::date;
  exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    raise exception 'El proveedor o la fecha del comprobante no se entienden.' using errcode = 'P0001';
  end;

  select * into v_g from retail.gastos where id = p_gasto_id for update;
  if not found then
    raise exception 'Ese gasto no existe.' using errcode = 'P0001';
  end if;
  if not retail.fn_gastos_puede(v_g.ubicacion_id) then
    raise exception 'No puedes cambiar gastos de esa tienda.' using errcode = '42501';
  end if;
  if v_g.estado = 'anulado' then
    raise exception 'Ese gasto está anulado: ya no recibe comprobante.' using errcode = 'P0001';
  end if;
  -- Dos toques: el segundo ve el comprobante del primero. Si es el mismo papel, devuelve lo que ya quedó.
  if v_g.compra_id is not null then
    if exists (select 1 from retail.compras c where c.id = v_g.compra_id and c.proveedor_id = v_prov and c.serie = v_serie and c.numero = v_numero) then
      return jsonb_build_object('ya_estaba', true, 'compra_id', v_g.compra_id, 'igv', v_g.igv);
    end if;
    raise exception 'Ese gasto ya tiene su comprobante.' using errcode = 'P0001';
  end if;
  if v_g.categoria in ('traer_mercaderia', 'viaje_compra') then
    raise exception 'Es un gasto del viaje de compra: su comprobante va en Compras.' using errcode = 'P0001';
  end if;
  if exists (select 1 from retail.movimientos_dinero d where d.gasto_comision_id = p_gasto_id and d.estado = 'vigente') then
    raise exception 'Es la comisión de un abono de tarjeta: no lleva comprobante aparte.' using errcode = 'P0001';
  end if;
  if exists (select 1 from retail.cuentas_dinero f where f.id = v_g.cuenta_dinero_id and f.tipo = 'fondo') then
    raise exception 'Se pagó desde un fondo por rendir: su comprobante va en la rendición del fondo.' using errcode = 'P0001';
  end if;
  if v_g.medio_pago is null then
    raise exception 'Ese gasto no dice cómo se pagó: regístralo de nuevo con su comprobante.' using errcode = 'P0001';
  end if;

  -- El comprobante: las mismas reglas y los mismos mensajes que `fn_comprobante_y_pago`.
  v_fecha := coalesce(v_fecha, v_g.fecha);
  if v_tipo is null or v_tipo not in ('factura', 'boleta', 'recibo_por_honorarios') then
    raise exception 'El comprobante tiene que ser factura, boleta o recibo por honorarios.' using errcode = 'P0001';
  end if;
  if v_prov is null or not exists (select 1 from retail.proveedores where id = v_prov) then
    raise exception 'Elige el proveedor del comprobante.' using errcode = 'P0001';
  end if;
  if v_serie = '' or v_numero = '' then
    raise exception 'Escribe la serie y el número del comprobante.' using errcode = 'P0001';
  end if;
  if v_fecha > retail.fn_hoy_lima() then
    raise exception 'La fecha del comprobante no puede ser futura.' using errcode = 'P0001';
  end if;
  if v_fecha < retail.fn_finanzas_desde() then
    raise exception 'Finanzas cuenta desde el %: un comprobante anterior no entraría a ningún reporte.', to_char(retail.fn_finanzas_desde(), 'DD/MM/YYYY')
      using errcode = 'P0001';
  end if;
  if v_tipo = 'factura' then
    begin
      v_igv := coalesce(round((p_comprobante->>'igv')::numeric, 2), round(v_g.monto_total - v_g.monto_total / (1 + retail.fn_tasa_igv(v_fecha)), 2));
    exception when invalid_text_representation then
      raise exception 'El IGV tiene que estar entre cero y el total.' using errcode = 'P0001';
    end;
    if v_igv < 0 or v_igv >= v_g.monto_total then
      raise exception 'El IGV tiene que estar entre cero y el total.' using errcode = 'P0001';
    end if;
  end if;
  if exists (select 1 from retail.compras where proveedor_id = v_prov and serie = v_serie and numero = v_numero) then
    raise exception 'Ese comprobante (% %-%) ya está registrado, como mercadería, gasto o activo.', v_tipo, v_serie, v_numero
      using errcode = '23505';
  end if;

  -- El mes del gasto (y de su pago) y el de la fecha del papel, abiertos; con un mensaje que dice para qué (los candados de las tablas dirían
  -- «registra con otra fecha», que aquí no aplica).
  perform retail.fn_exigir_mes_abierto(v_g.ubicacion_id, v_g.fecha, null, 'agregarle su comprobante');
  perform retail.fn_exigir_mes_abierto(v_g.ubicacion_id, v_fecha, null, 'agregarle su comprobante');

  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Sin sesión no se cambia un gasto.' using errcode = '42501';
  end if;

  -- La marca de ESTE gasto, desde antes del pago: la piden el egreso del cajón (`fn_exigir_egreso_del_pago`), la cuenta (`fn_gastos_sellar`) y el
  -- gasto (`fn_gastos_solo_anular`).
  perform set_config('retail.gastos_comprobante_tardio', p_gasto_id::text, true);
  -- 1. El comprobante, al contado, con la fecha del papel (como `fn_comprobante_y_pago`).
  insert into retail.compras (proveedor_id, tipo, serie, numero, fecha_emision, condicion, fecha_vencimiento,
                              subtotal, igv, total, estado, nota, usuario_id, naturaleza, ubicacion_gestion_id)
  values (v_prov, v_tipo, v_serie, v_numero, v_fecha, 'contado', null,
          v_g.monto_total - v_igv, v_igv, v_g.monto_total, 'vigente', v_g.descripcion, v_actor, 'gasto', v_g.ubicacion_id)
  returning id into v_compra;
  -- 2. El pago que el gasto ya tenía: su fecha, su medio, su cuenta y su egreso del cajón. Lo pagó quien registró el gasto.
  insert into retail.compra_pagos (compra_id, fecha, monto, metodo, referencia, usuario_id, ubicacion_id, cuenta_dinero_id, caja_movimiento_id)
  values (v_compra, v_g.fecha, v_g.monto_total, v_g.medio_pago, null, coalesce(v_g.registrado_por, v_actor), v_g.ubicacion_id,
          case when v_g.caja_movimiento_id is null then v_g.cuenta_dinero_id end, v_g.caja_movimiento_id);
  -- 3. El gasto apunta a su comprobante; su medio y su cuenta ya viven en el pago.
  update retail.gastos set compra_id = v_compra, igv = v_igv, medio_pago = null, cuenta_dinero_id = null where id = p_gasto_id;
  perform set_config('retail.gastos_comprobante_tardio', '', true);
  -- 4. El rastro.
  v_texto := case v_tipo when 'factura' then 'Factura' when 'boleta' then 'Boleta' else 'Recibo por honorarios' end || ' ' || v_serie || '-' || v_numero;
  insert into retail.gasto_correcciones (lote, gasto_id, campo, antes, despues, corregida_por)
  values (gen_random_uuid(), p_gasto_id, 'comprobante', 'Sin comprobante', v_texto, v_actor);
  return jsonb_build_object('ya_estaba', false, 'compra_id', v_compra, 'igv', v_igv);
end $$;
comment on function retail.agregar_comprobante_a_gasto(uuid, jsonb) is
  'ADR-0588: un gasto pagado sin comprobante recibe su boleta, factura o recibo por honorarios: queda como si se hubiera registrado con él al contado, sin mover plata.';
revoke all on function retail.agregar_comprobante_a_gasto(uuid, jsonb) from public, anon;
grant execute on function retail.agregar_comprobante_a_gasto(uuid, jsonb) to authenticated;
