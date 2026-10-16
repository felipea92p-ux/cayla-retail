-- Gastos del viaje, fase 6 · actividad 3 (ADR-0362, decisiones 20, 26, 55 y 57; respuestas de Felipe del 2026-10-13): las funciones.
--
-- EL PROBLEMA PRIMERO. Con el esquema (20261013221000) ya hay dónde guardar un gasto del viaje, pero nadie puede escribirlo ni leerlo, y
-- un gasto pagado desde un fondo no pasa: el sello de los gastos (`fn_gastos_sellar`) solo conoce las cuentas de siempre, y el Diario
-- asienta la salida de un gasto por su medio (101 en efectivo), no por la cuenta del fondo (1413).
--
-- QUÉ CREA
--   1. La clave `gasto_viaje_registrar` en `acciones_sin_responsable` (decisión 39): con la cuenta de una persona firma ella, sin combo;
--      desde una terminal, el combo «Responsable».
--   2. `registrar_gasto_viaje(...)`: lo hace quien tiene el módulo Órdenes de compra (Felipe 2026-10-13: «desde Órdenes de compra»). Para
--      traer la mercadería (flete, agencia, cargador, embalaje → «Traer la mercadería», 609) o del viaje (pasaje, hotel, comida, taxi →
--      «Viaje de compra», 631). El papel: boleta, factura o ticket; sin comprobante solo taxi o cargador, con planilla de movilidad
--      (decisión 55; sin tope hasta que el contador lo fije). La plata sale de «Mi fondo» o de una cuenta de siempre (la misma pieza que
--      Finanzas ▸ Gastos: `fn_comprobante_y_pago`; del cajón, con su egreso de caja). A una o varias órdenes (Felipe 2026-10-13): con
--      varias, el monto se reparte según el total de cada una, a céntimos, y lo que sobra del redondeo va a la de mayor total. La sede del
--      gasto es la de quien compra (decisión 46); si no tiene, la de la primera orden.
--   3. `fn_gastos_viaje_de_orden(orden)`: lo que costó traer una orden, gasto por gasto (lo vigente), para «Traerla costó S/ X».
--   4. `fn_gastos_viaje_ordenes()`: las órdenes que se pueden elegir en la hoja (las 80 más recientes que no están anuladas).
--   5. Reemplazos anclados en la definición viva (abortan sin cambiar nada si la función cambió):
--      · `fn_gastos_sellar`: un gasto con la cuenta de un fondo pasa por `fn_fondo_para_pagar` (su dueña, con su cuenta; 20261013212000),
--        como los pagos a proveedores, y no por `fn_cuenta_sellada`.
--      · `fn_asientos`: la salida de un gasto pagado desde un fondo va a la cuenta del fondo (1413), no a la de su medio.
--
-- DESCARTÉ
--   · Pedir al menos una orden en lo que trae la mercadería: el cargador se paga a veces antes de saber a qué orden va. La hoja la
--     propone cuando se abre desde una orden.
--   · Que quien no tiene el módulo de Gastos anule un gasto del viaje: se anula en Finanzas ▸ Gastos, como cualquier gasto (una anulada no
--     cuenta en «Traerla costó»). Anular desde la orden queda para cuando Felipe lo pida.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). Una sola parte, DESPUÉS de 20261013221000 y de 20261013212000 (usa
-- `fn_fondo_para_pagar`): funciones nuevas y reemplazos anclados; sin tablas, sin políticas, sin `drop trigger` (ADR-0195) y sin
-- `select … into` dentro de textos entre comillas (ADR-0288). Anclas comprobadas contra producción en solo lectura el 2026-10-13
-- (`fn_gastos_sellar` d30c8acb…, una aparición; `fn_asientos`, una aparición de cada una). Idempotente.

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

-- ---------- 1. Con la cuenta de una persona, sin combo (decisión 39) ----------
insert into retail.acciones_sin_responsable (clave, descripcion) values
  ('gasto_viaje_registrar', 'Registrar un gasto del viaje de compra (con la cuenta de una persona firma ella, desde una terminal se elige quién)')
on conflict (clave) do update set descripcion = excluded.descripcion;

-- ---------- 2. Registrar un gasto del viaje ----------
create or replace function retail.registrar_gasto_viaje(
  p_tipo text,
  p_concepto text,
  p_monto numeric,
  p_fecha date,
  p_papel text,
  p_medio_pago text,
  p_cuenta_id uuid,
  p_ordenes uuid[] default null,
  p_serie_numero text default null,
  p_ruc text default null,
  p_nota text default null,
  p_token uuid default null
) returns uuid
language plpgsql security definer set search_path = retail, public, extensions as $$
declare
  v_id uuid;
  v_actor uuid;
  v_monto numeric := round(p_monto, 2);
  v_ordenes uuid[];
  v_ubic uuid;
  v_desc text;
  v_pago record;
  v_total numeric;
  v_resto numeric;
  v_parte numeric;
  v_n integer;
  v_i integer := 0;
  r record;
begin
  -- Doble clic o reintento: el segundo intento espera al primero y devuelve SU gasto (el mismo candado que registrar_gasto).
  if p_token is not null then
    perform pg_advisory_xact_lock(hashtextextended('gastos:' || p_token::text, 0));
    v_id := (select g.id from retail.gastos g where g.token_cliente = p_token);
    if v_id is not null then
      return v_id;
    end if;
  end if;

  if not retail.fn_ve_modulo('ordenes_compra') then
    raise exception 'Registrar un gasto del viaje necesita el módulo Órdenes de compra en tu rol.' using errcode = '42501';
  end if;
  if p_tipo is null or p_tipo not in ('mercaderia', 'viaje') then
    raise exception 'Di si es para traer la mercadería o del viaje.' using errcode = 'P0001';
  end if;
  if p_concepto is null
     or not ((p_tipo = 'mercaderia' and p_concepto in ('flete', 'agencia', 'cargador', 'embalaje', 'otro'))
             or (p_tipo = 'viaje' and p_concepto in ('pasaje', 'hotel', 'comida', 'taxi', 'otro'))) then
    raise exception 'Elige qué se pagó.' using errcode = 'P0001';
  end if;
  if p_concepto = 'otro' and nullif(btrim(coalesce(p_nota, '')), '') is null then
    raise exception 'Con «Otro», escribe qué se pagó.' using errcode = 'P0001';
  end if;
  if length(btrim(coalesce(p_nota, ''))) > 200 then
    raise exception 'La nota es muy larga (máximo 200 letras).' using errcode = 'P0001';
  end if;
  if v_monto is null or v_monto <= 0 then
    raise exception 'El monto tiene que ser mayor que cero.' using errcode = 'P0001';
  end if;
  if p_monto <> v_monto then
    raise exception 'El monto admite como máximo 2 decimales.' using errcode = 'P0001';
  end if;
  if p_fecha is null or p_fecha > retail.fn_hoy_lima() then
    raise exception 'La fecha del gasto no puede ser futura.' using errcode = 'P0001';
  end if;
  if p_papel is null or p_papel not in ('boleta', 'factura', 'ticket', 'planilla_movilidad') then
    raise exception 'Di qué papel te dieron: boleta, factura, ticket o planilla de movilidad.' using errcode = 'P0001';
  end if;
  -- Decisión 55: sin comprobante, solo taxi y cargador, con planilla de movilidad.
  if p_papel = 'planilla_movilidad' and p_concepto not in ('taxi', 'cargador') then
    raise exception 'Sin comprobante solo se acepta taxi o cargador, con planilla de movilidad: lo demás necesita su boleta, factura o ticket.'
      using errcode = 'P0001', hint = 'gasto_viaje_sin_papel';
  end if;
  if p_papel = 'planilla_movilidad'
     and (nullif(btrim(coalesce(p_serie_numero, '')), '') is not null or nullif(btrim(coalesce(p_ruc, '')), '') is not null) then
    raise exception 'Una planilla de movilidad no lleva serie ni RUC: es lo que no tiene comprobante.' using errcode = 'P0001';
  end if;
  if length(btrim(coalesce(p_serie_numero, ''))) > 40 then
    raise exception 'La serie y el número son muy largos (máximo 40 letras).' using errcode = 'P0001';
  end if;
  if nullif(btrim(coalesce(p_ruc, '')), '') is not null and btrim(p_ruc) !~ '^[0-9]{11}$' then
    raise exception 'El RUC tiene 11 números.' using errcode = 'P0001';
  end if;

  -- Las órdenes: distintas, que existen y que no están anuladas.
  v_ordenes := (select coalesce(array_agg(distinct x), '{}') from unnest(coalesce(p_ordenes, '{}'::uuid[])) x where x is not null);
  if cardinality(v_ordenes) > 30 then
    raise exception 'Un gasto va a 30 órdenes como máximo.' using errcode = 'P0001';
  end if;
  if exists (select 1 from unnest(v_ordenes) x where not exists (select 1 from retail.ordenes_compra o where o.id = x)) then
    raise exception 'Una de las órdenes ya no existe: recarga la pantalla.' using errcode = 'P0001';
  end if;
  if exists (select 1 from retail.ordenes_compra o where o.id = any (v_ordenes) and o.estado = 'anulada') then
    raise exception 'Una de las órdenes está anulada: quítala del gasto.' using errcode = 'P0001';
  end if;

  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién registra el gasto.' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  -- La sede del gasto: la de quien compra (decisión 46: «si la encargada compra, ella paga»); si no tiene, la de la primera orden.
  v_ubic := coalesce(
    (select u.id from retail.colaboradores co join retail.ubicaciones u on u.id = co.ubicacion_asignada_id
      where co.persona_id = v_actor and u.activo limit 1),
    case when cardinality(v_ordenes) > 0 then retail.fn_orden_compra_gestora(v_ordenes[1]) end);
  v_desc := left(
    case p_concepto when 'flete' then 'Flete' when 'agencia' then 'Agencia' when 'cargador' then 'Cargador' when 'embalaje' then 'Embalaje'
                    when 'pasaje' then 'Pasaje' when 'hotel' then 'Hotel' when 'comida' then 'Comida' when 'taxi' then 'Taxi' else 'Otro' end
    || coalesce(' · ' || nullif(btrim(coalesce(p_nota, '')), ''), ''), 200);

  -- El pago: la misma pieza que Finanzas ▸ Gastos (sin comprobante de compra). Del cajón crea el egreso de su caja abierta; de un fondo,
  -- la cuenta la valida el sello de los gastos (`fn_fondo_para_pagar`).
  select * into v_pago from retail.fn_comprobante_y_pago('gasto', v_ubic, p_fecha, v_monto, v_desc, null, p_medio_pago, null, null, null,
    'Gasto del viaje · ' || v_desc, v_actor, p_cuenta_id);

  insert into retail.gastos (ubicacion_id, categoria, descripcion, fecha, monto_total, igv, compra_id, medio_pago, caja_movimiento_id,
                             registrado_por, token_cliente, cuenta_dinero_id)
  values (v_ubic, case p_tipo when 'mercaderia' then 'traer_mercaderia' else 'viaje_compra' end, v_desc, p_fecha, v_monto, 0, null,
          p_medio_pago, v_pago.o_caja_movimiento_id, v_actor, p_token,
          case when v_pago.o_caja_movimiento_id is null then p_cuenta_id end)
  returning id into v_id;

  insert into retail.gastos_viaje (gasto_id, tipo, concepto, papel, serie_numero, ruc_emisor)
  values (v_id, p_tipo, p_concepto, p_papel, nullif(upper(btrim(coalesce(p_serie_numero, ''))), ''), nullif(btrim(coalesce(p_ruc, '')), ''));

  -- El reparto entre las órdenes: según el total de cada una, a céntimos (hacia abajo); lo que sobra del redondeo, a la de mayor total.
  -- Sin total en ninguna, en partes iguales. Una parte que se queda en cero no se anota.
  v_n := cardinality(v_ordenes);
  if v_n > 0 then
    v_total := (select coalesce(sum(i.subtotal), 0) from retail.orden_compra_items i where i.orden_compra_id = any (v_ordenes));
    v_resto := v_monto;
    for r in
      select o.id, coalesce((select sum(i.subtotal) from retail.orden_compra_items i where i.orden_compra_id = o.id), 0) as total
        from retail.ordenes_compra o
       where o.id = any (v_ordenes)
       order by 2, o.numero
    loop
      v_i := v_i + 1;
      v_parte := case when v_i = v_n then v_resto
                      when v_total > 0 then trunc(v_monto * r.total / v_total, 2)
                      else trunc(v_monto / v_n, 2) end;
      if v_parte > 0 then
        insert into retail.gastos_viaje_ordenes (gasto_id, orden_compra_id, monto) values (v_id, r.id, v_parte);
        v_resto := v_resto - v_parte;
      end if;
    end loop;
  end if;

  return v_id;
exception when unique_violation then
  if p_token is not null and exists (select 1 from retail.gastos g where g.token_cliente = p_token) then
    return (select g.id from retail.gastos g where g.token_cliente = p_token);
  end if;
  raise;
end $$;

-- ---------- 3. Lo que costó traer una orden ----------
create or replace function retail.fn_gastos_viaje_de_orden(p_orden_id uuid)
returns table (
  gasto_id uuid, fecha date, tipo text, concepto text, papel text, descripcion text, monto numeric, monto_total numeric,
  ordenes integer, cuenta_nombre text, de_fondo boolean, registrado_por_nombre text
)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
#variable_conflict use_column
begin
  if not retail.fn_ve_modulo('ordenes_compra') then
    raise exception 'Ver los gastos de una orden necesita el módulo Órdenes de compra en tu rol.' using errcode = '42501';
  end if;
  return query
  select g.id, g.fecha, v.tipo, v.concepto, v.papel, g.descripcion, o.monto, g.monto_total,
         (select count(*) from retail.gastos_viaje_ordenes x where x.gasto_id = g.id)::integer,
         c.nombre, coalesce(c.tipo = 'fondo', false), nullif(trim(concat_ws(' ', p.nombres, p.apellidos)), '')
    from retail.gastos_viaje_ordenes o
    join retail.gastos_viaje v on v.gasto_id = o.gasto_id
    join retail.gastos g on g.id = o.gasto_id
    left join retail.cuentas_dinero c on c.id = g.cuenta_dinero_id
    left join public.personas p on p.id = g.registrado_por
   where o.orden_compra_id = p_orden_id and g.estado = 'vigente'
   order by g.fecha desc, g.created_at desc;
end $$;

-- ---------- 4. Las órdenes que se pueden elegir en la hoja ----------
create or replace function retail.fn_gastos_viaje_ordenes()
returns table (id uuid, numero text, proveedor text, destino text, total numeric, fecha_emision date)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
#variable_conflict use_column
begin
  if not retail.fn_ve_modulo('ordenes_compra') then
    raise exception 'Ver las órdenes necesita el módulo Órdenes de compra en tu rol.' using errcode = '42501';
  end if;
  return query
  select o.id, retail.fn_orden_compra_numero_texto(o.numero), pr.nombre, u.nombre,
         coalesce((select sum(i.subtotal) from retail.orden_compra_items i where i.orden_compra_id = o.id), 0),
         o.fecha_emision
    from retail.ordenes_compra o
    join retail.proveedores pr on pr.id = o.proveedor_id
    left join retail.ubicaciones u on u.id = o.ubicacion_destino_id
   where o.estado <> 'anulada'
   order by o.creada_en desc, o.numero desc
   limit 80;
end $$;

-- ---------- 5. Un gasto puede salir de un fondo, y el Diario lo saca de la 1413 ----------
select pg_temp.reemplazar('retail.fn_gastos_sellar()',
$v$  new.cuenta_dinero_id := retail.fn_cuenta_sellada('pago', new.medio_pago, new.ubicacion_id, new.fecha, new.cuenta_dinero_id);$v$,
$n$  -- ADR-0362 fase 6: el fondo por rendir de quien paga no pasa por `fn_cuenta_sellada` (no lo acepta en ningún otro lado): lo
  -- valida `fn_fondo_para_pagar` (su dueña, con su cuenta). Puede quedar en negativo: «CAYLA te debe».
  if new.cuenta_dinero_id is not null and exists (select 1 from retail.cuentas_dinero f where f.id = new.cuenta_dinero_id and f.tipo = 'fondo') then
    perform retail.fn_fondo_para_pagar(new.cuenta_dinero_id, new.medio_pago);
    return new;
  end if;
  new.cuenta_dinero_id := retail.fn_cuenta_sellada('pago', new.medio_pago, new.ubicacion_id, new.fecha, new.cuenta_dinero_id);$n$,
1);

select pg_temp.reemplazar('retail.fn_asientos(date, date, uuid)',
$v$    select g.id, g.ubicacion_id, g.fecha as f, g.monto_total, g.igv, g.compra_id, g.medio_pago, g.descripcion, k.cuenta_pcge,$v$,
$n$    select g.id, g.ubicacion_id, g.fecha as f, g.monto_total, g.igv, g.compra_id, g.medio_pago, g.descripcion, k.cuenta_pcge,
           -- ADR-0362 fase 6: pagado desde un fondo por rendir, sale de la cuenta del fondo (1413).
           (select f.cuenta_contable from retail.cuentas_dinero f where f.id = g.cuenta_dinero_id and f.tipo = 'fondo') as cta_fondo_gasto,$n$,
1);

select pg_temp.reemplazar('retail.fn_asientos(date, date, uuid)',
$v$           case when gg.compra_id is not null then '421'
                when gg.cta_comision is not null then gg.cta_comision
                else retail.fn_asiento_cuenta_de_medio(gg.medio_pago, 'sale') end,
           0, gg.monto_total, 'gastos', gg.id,
           case when gg.compra_id is not null then 'Se le debe al proveedor'
                when gg.cta_comision is not null then 'Lo descontó el abono de tarjeta'
                else 'Pagado (' || gg.medio_pago || ')' end$v$,
$n$           case when gg.compra_id is not null then '421'
                when gg.cta_comision is not null then gg.cta_comision
                when gg.cta_fondo_gasto is not null then gg.cta_fondo_gasto
                else retail.fn_asiento_cuenta_de_medio(gg.medio_pago, 'sale') end,
           0, gg.monto_total, 'gastos', gg.id,
           case when gg.compra_id is not null then 'Se le debe al proveedor'
                when gg.cta_comision is not null then 'Lo descontó el abono de tarjeta'
                when gg.cta_fondo_gasto is not null then 'Del fondo por rendir (' || gg.medio_pago || ')'
                else 'Pagado (' || gg.medio_pago || ')' end$n$,
1);

-- ---------- 6. Permisos ----------
revoke all on function retail.registrar_gasto_viaje(text, text, numeric, date, text, text, uuid, uuid[], text, text, text, uuid) from public, anon;
revoke all on function retail.fn_gastos_viaje_de_orden(uuid) from public, anon;
revoke all on function retail.fn_gastos_viaje_ordenes() from public, anon;
grant execute on function retail.registrar_gasto_viaje(text, text, numeric, date, text, text, uuid, uuid[], text, text, text, uuid) to authenticated, service_role;
grant execute on function retail.fn_gastos_viaje_de_orden(uuid) to authenticated, service_role;
grant execute on function retail.fn_gastos_viaje_ordenes() to authenticated, service_role;

reset lock_timeout;
notify pgrst, 'reload schema';
