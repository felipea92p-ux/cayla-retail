-- ============================================================================
-- 20261121162000 — La cuenta con cada dueña (ADR-0683, actividad 3)
--
-- EL PROBLEMA PRIMERO. Lo que CAYLA le debe a una aliada (lo cobrado de sus prendas en cuentas de CAYLA, menos lo devuelto, la comisión, lo ya pagado, el
-- efectivo que se quedó ella y su parte de los gastos) se calculaba solo para CLAURE, y los pagos (`movimientos_dinero` 'pago_claure') y el efectivo que se
-- queda la dueña al cerrar la caja (`caja_traslados` 'claudia') no decían a QUIÉN: con una segunda aliada, pagarle a una bajaba la deuda de la otra.
--
-- QUÉ PROMETE.
--   · `movimientos_dinero.empresa_id` y `caja_traslados.empresa_id`: a qué aliada es un pago o el efectivo que se quedó la dueña. Los de antes son de CLAURE.
--     Los llena un disparador al guardar: la aliada que manda la pantalla (encabezado `x-aliada`) o, si no manda ninguna, la única con cuenta (en la tienda
--     de la caja, para el efectivo). Con dos y sin elegir, no se guarda. `cerrar_caja` y `registrar_movimiento_dinero` no cambian de firma.
--   · `fn_aliada_filas / _cuenta / _cuenta_desde / _pagos / _gastos / _gastos_base / _saldo_a / _cierre (p_empresa, …)`: la lógica vigente de las de CLAURE,
--     copiada, con los pagos y el efectivo filtrados por su aliada. Las de CLAURE no se tocan: su pantalla de hoy y sus pruebas siguen igual.
--   · `fn_aliadas_saldo_a` (la proyección de caja descuenta lo que se le debe a todas), `fn_aliadas_cierre` (el cierre de una caja con cada aliada de esa
--     tienda) y `fn_aliadas_con_cuenta` (las pestañas de Cuentas y dinero).
--   · Una aliada no se da de baja con su cuenta fuera de cero (ni al pedirla ni al aplicarla).
--
-- QUÉ NO PROMETE. El reparto de gastos de otra aliada (sigue siendo solo de CLAURE: actividad 5) ni los textos que dicen «CLAURE» o «Claudia» (actividad 7).
--
-- DECIDÍ un encabezado y un disparador para decir de qué aliada es un pago. DESCARTÉ un parámetro más en `cerrar_caja` y `registrar_movimiento_dinero`: dos
-- firmas a la vez son ambiguas para PostgREST y son de las funciones más usadas del ERP. SE ROMPE SI hay dos aliadas con cuenta y una pantalla vieja paga sin
-- elegir: el pago se rechaza con «Elige a qué empresa aliada» (nunca cae en la equivocada).
--
-- CÓMO VERIFICAR. pnpm pruebas:aliadas-cuenta (y las 18 pruebas:claure-* siguen en verde).
-- CÓMO SE PEGA. Después de 20261121160000. Una sola parte, sin políticas. Se puede pegar dos veces.
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 0. Que producción tenga la lógica que se copia ----------
do $comprueba$
declare
  v_sel text := 'select e.id, e.cuenta_corriente_desde into v_claure, v_desde from retail.empresas e where e.clave = ''claure'' and e.activo;';
  v_f text;
begin
  if to_regprocedure('retail.fn_aliada_filas(uuid, uuid[])') is not null then
    return;  -- ya pegada
  end if;
  foreach v_f in array array['retail.fn_claure_filas(uuid[])', 'retail.fn_claure_gastos_base(date, date, boolean, uuid[])', 'retail.fn_claure_saldo_a(date)', 'retail.fn_claure_cierre(uuid)'] loop
    if position(v_sel in pg_get_functiondef(v_f::regprocedure)) = 0 then
      raise exception '% no es la que se copió: regenera esta migración desde su definición real. No se aplicó nada.', v_f;
    end if;
  end loop;
  if position('retail.fn_claure_saldo_a(v_hoy)' in pg_get_functiondef('retail.fn_flujo_caja_proyeccion(integer)'::regprocedure)) = 0 then
    raise exception 'fn_flujo_caja_proyeccion no lee fn_claure_saldo_a(v_hoy): regenera esta migración. No se aplicó nada.';
  end if;
  if position('where e.clave = ''claure'' and e.activo and es.ubicacion_id = v_caja.ubicacion_id' in pg_get_functiondef('retail.cerrar_caja(uuid, numeric, numeric, text, text, uuid)'::regprocedure)) = 0 then
    raise exception 'cerrar_caja no tiene el candado de CLAURE esperado: regenera esta migración. No se aplicó nada.';
  end if;
end
$comprueba$;

-- ---------- 1. A qué aliada es cada pago y cada efectivo que se quedó la dueña ----------
alter table retail.movimientos_dinero add column if not exists empresa_id uuid references retail.empresas (id);
alter table retail.caja_traslados add column if not exists empresa_id uuid references retail.empresas (id);
update retail.movimientos_dinero set empresa_id = (select id from retail.empresas where clave = 'claure') where tipo = 'pago_claure' and empresa_id is null;
update retail.caja_traslados set empresa_id = (select id from retail.empresas where clave = 'claure') where destino = 'claudia' and empresa_id is null;
do $chequeos$
begin
  if not exists (select 1 from pg_constraint where conname = 'movimientos_dinero_pago_con_aliada') then
    alter table retail.movimientos_dinero add constraint movimientos_dinero_pago_con_aliada check (tipo <> 'pago_claure' or empresa_id is not null);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'caja_traslados_duena_con_aliada') then
    alter table retail.caja_traslados add constraint caja_traslados_duena_con_aliada check (destino <> 'claudia' or empresa_id is not null);
  end if;
end
$chequeos$;
comment on column retail.movimientos_dinero.empresa_id is 'ADR-0683: en un pago a una empresa aliada (tipo pago_claure), a cuál. Nulo en lo demás.';
comment on column retail.caja_traslados.empresa_id is 'ADR-0683: en el efectivo que se queda la dueña al cerrar (destino claudia), de qué aliada es. Nulo en lo demás.';

-- La aliada de un pago o de un efectivo: la que manda la pantalla (`x-aliada`) o, si no manda, la única con cuenta (en esa tienda, si se dice).
create or replace function retail.fn_aliada_de_la_llamada(p_ubicacion_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_h text;
  v_id uuid;
  v_n int;
begin
  begin
    v_h := nullif(btrim(coalesce(current_setting('request.headers', true), '')), '')::json ->> 'x-aliada';
  exception when others then
    v_h := null;
  end;
  if v_h is not null then
    v_id := (select e.id from retail.empresas e
              where e.id::text = v_h and e.id <> retail.fn_empresa_casa_id() and e.cuenta_corriente_desde is not null
                and (p_ubicacion_id is null or exists (select 1 from retail.empresa_sedes es where es.empresa_id = e.id and es.ubicacion_id = p_ubicacion_id)));
    if v_id is null then
      raise exception 'Esa empresa aliada no existe o no vende en esta tienda.' using errcode = 'P0001', hint = 'aliada';
    end if;
    return v_id;
  end if;
  select count(*), min(e.id::text)::uuid into v_n, v_id from retail.empresas e
   where e.id <> retail.fn_empresa_casa_id() and e.cuenta_corriente_desde is not null
     and (p_ubicacion_id is null or exists (select 1 from retail.empresa_sedes es where es.empresa_id = e.id and es.ubicacion_id = p_ubicacion_id));
  if v_n = 1 then
    return v_id;
  end if;
  if v_n = 0 then
    raise exception 'No hay una empresa aliada a la cual anotarlo.' using errcode = 'P0001', hint = 'aliada';
  end if;
  raise exception 'Elige a qué empresa aliada.' using errcode = 'P0001', hint = 'aliada';
end
$$;
revoke all on function retail.fn_aliada_de_la_llamada(uuid) from public, anon, authenticated;

create or replace function retail.trg_pago_de_aliada()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
begin
  if new.tipo = 'pago_claure' and new.empresa_id is null then
    new.empresa_id := retail.fn_aliada_de_la_llamada(null);
  end if;
  return new;
end
$$;
create or replace trigger movimientos_dinero_aliada before insert on retail.movimientos_dinero for each row execute function retail.trg_pago_de_aliada();
-- «Siempre»: también con los disparadores apagados (session_replication_role = replica, como en una carga o una prueba), un pago nunca queda sin su aliada.
alter table retail.movimientos_dinero enable always trigger movimientos_dinero_aliada;

create or replace function retail.trg_efectivo_de_aliada()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
begin
  if new.destino = 'claudia' and new.empresa_id is null then
    new.empresa_id := retail.fn_aliada_de_la_llamada((select k.ubicacion_id from retail.cajas k where k.id = new.caja_id));
  end if;
  return new;
end
$$;
create or replace trigger caja_traslados_aliada before insert on retail.caja_traslados for each row execute function retail.trg_efectivo_de_aliada();
alter table retail.caja_traslados enable always trigger caja_traslados_aliada;

-- ---------- 2. La cuenta de una aliada (la lógica de CLAURE, para la que se pida) ----------
CREATE OR REPLACE FUNCTION retail.fn_aliada_filas(p_empresa uuid, p_ubics uuid[])
 RETURNS TABLE(fecha date, origen text, medio text, cuenta_id uuid, cuenta_nombre text, ubicacion_id uuid, n_pagos integer, monto numeric, igv numeric, comision numeric, contado boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'retail', 'public', 'extensions'
AS $function$
#variable_conflict use_column
declare
  v_ubics uuid[] := p_ubics;
  v_casa uuid := retail.fn_empresa_casa_id();
  v_claure uuid;
  v_desde date;
begin
  select e.id, e.cuenta_corriente_desde into v_claure, v_desde from retail.empresas e where e.id = p_empresa and e.id <> retail.fn_empresa_casa_id();
  if v_claure is null or v_desde is null then
    return;
  end if;

  return query
  with sedes as (
    -- Donde opera CLAURE (hoy Lima) y que esta cuenta ve.
    select es.ubicacion_id from retail.empresa_sedes es where es.empresa_id = v_claure and es.ubicacion_id = any (v_ubics)
  ),
  lineas as (
    -- Cada venta completada con cuánto de su valor es de CLAURE (por línea, según el dueño real de cada unidad).
    select v.id as venta_id, v.ubicacion_id, (v.created_at at time zone 'America/Lima')::date as fecha,
           sum(i.subtotal) as total,
           coalesce(sum(i.subtotal) filter (where retail.fn_dueno_de_la_linea(i.id) = v_claure), 0) as de_claure
      from retail.ventas v
      join sedes s on s.ubicacion_id = v.ubicacion_id
      join retail.venta_items i on i.venta_id = v.id
     where v.estado = 'completada' and not coalesce(v.es_prueba, false)
       and (v.created_at at time zone 'America/Lima')::date >= v_desde
     group by v.id, v.ubicacion_id, v.created_at
  ),
  cobros as (
    -- Cada pago que no es efectivo, en la parte que corresponde a CLAURE, con la cuenta a la que entró (la misma regla del libro de dinero).
    select l.ubicacion_id, l.fecha, p.metodo as medio, p.id as pago_id, p.monto * l.de_claure / l.total as monto,
           coalesce(p.cuenta_dinero_id, retail.fn_cuenta_de_cobro(l.ubicacion_id, p.metodo, l.fecha)) as cuenta_id
      from lineas l join retail.venta_pagos p on p.venta_id = l.venta_id
     where l.de_claure > 0 and l.total > 0 and p.metodo in ('yape', 'plin', 'tarjeta', 'transferencia', 'qr')
    union all
    -- Un APARTADO (ADR-0141): su adelanto se cobró en abonos antes de la entrega; al entregar la prenda queda en la venta como medio `anticipo`, que no dice a qué cuenta
    -- entró. La plata cayó en la cuenta de cada abono (`separacion_pagos`), y se le debe a Claudia desde que la prenda SALE: el día de la venta (la entrega), no el del abono.
    select l.ubicacion_id, l.fecha, sp.metodo as medio, sp.id as pago_id, sp.monto * l.de_claure / l.total as monto,
           coalesce(sp.cuenta_dinero_id, retail.fn_cuenta_de_cobro(l.ubicacion_id, sp.metodo, l.fecha)) as cuenta_id
      from lineas l
      join retail.separaciones sx on sx.venta_id = l.venta_id
      join retail.separacion_pagos sp on sp.separacion_id = sx.id
     where l.de_claure > 0 and l.total > 0 and sp.metodo in ('yape', 'plin', 'tarjeta', 'transferencia')
    union all
    -- Un PEDIDO WEB: lo pagado antes del despacho queda en la venta como `anticipo`; igual, se le debe a Claudia cuando la prenda sale (el día de la venta). Solo los pagos
    -- aprobados y no anulados, en la cuenta donde cayeron.
    select l.ubicacion_id, l.fecha, pw.medio as medio, pw.id as pago_id, pw.monto * l.de_claure / l.total as monto,
           coalesce(pw.cuenta_dinero_id, retail.fn_cuenta_de_cobro(l.ubicacion_id, pw.medio, l.fecha)) as cuenta_id
      from lineas l
      join retail.pedidos_web pe on pe.venta_id = l.venta_id
      join retail.pedido_web_pagos pw on pw.pedido_id = pe.id and pw.estado = 'aprobado' and pw.anulado_en is null
     where l.de_claure > 0 and l.total > 0 and pw.medio in ('yape', 'plin', 'tarjeta', 'transferencia')
  ),
  devueltos as (
    -- Lo que CAYLA devolvió de una prenda de CLAURE, pagado desde una cuenta suya: baja lo que se le debe. Si la devolución se pagó en
    -- efectivo (de la caja de Claudia) no baja nada: la plata de la venta sigue en la cuenta de CAYLA y Claudia puso el reembolso.
    select dv.id as dev_id, dv.ubicacion_id, (dv.aprobado_en at time zone 'America/Lima')::date as fecha, dv.reembolso_metodo as medio,
           -(dv.reembolso_monto * x.de_claure / x.total) as monto,
           coalesce(dv.reembolso_cuenta_id,
                    retail.fn_cuenta_de_cobro(dv.ubicacion_id, dv.reembolso_metodo, (dv.aprobado_en at time zone 'America/Lima')::date)) as cuenta_id
      from retail.devoluciones dv
      join sedes s on s.ubicacion_id = dv.ubicacion_id
      cross join lateral (
        select sum(vi.subtotal / vi.cantidad * di.cantidad) as total,
               coalesce(sum(vi.subtotal / vi.cantidad * di.cantidad) filter (where retail.fn_dueno_de_la_linea(vi.id) = v_claure), 0) as de_claure
          from retail.devolucion_items di join retail.venta_items vi on vi.id = di.venta_item_id
         where di.devolucion_id = dv.id and vi.cantidad > 0
      ) x
     where dv.estado = 'aprobada' and dv.aprobado_en is not null
       and dv.reembolso_metodo in ('yape', 'plin', 'tarjeta', 'transferencia') and coalesce(dv.reembolso_monto, 0) > 0
       and (dv.aprobado_en at time zone 'America/Lima')::date >= v_desde
       and x.de_claure > 0 and x.total > 0
  ),
  agrupado as (
    select 'venta'::text as origen, c.fecha, c.medio, c.cuenta_id, c.ubicacion_id,
           count(distinct c.pago_id)::integer as n_pagos, round(sum(c.monto), 2) as monto
      from cobros c left join retail.cuentas_dinero cd on cd.id = c.cuenta_id
     where cd.id is null or cd.empresa_id = v_casa
     group by c.fecha, c.medio, c.cuenta_id, c.ubicacion_id
    union all
    select 'devolucion'::text, d.fecha, d.medio, d.cuenta_id, d.ubicacion_id,
           count(distinct d.dev_id)::integer, round(sum(d.monto), 2)
      from devueltos d left join retail.cuentas_dinero cd on cd.id = d.cuenta_id
     where cd.id is null or cd.empresa_id = v_casa
     group by d.fecha, d.medio, d.cuenta_id, d.ubicacion_id
  ),
  cambiados as (
    -- Un cambio con prendas de CLAURE (la devuelta o la nueva): no entra al saldo, se lista para revisarlo a mano.
    select cb.ubicacion_id, (cb.created_at at time zone 'America/Lima')::date as fecha, cb.metodo_pago_diferencia as medio,
           cb.diferencia as monto, cb.cuenta_dinero_id as cuenta_id
      from retail.cambios cb
      join sedes s on s.ubicacion_id = cb.ubicacion_id
     where (cb.created_at at time zone 'America/Lima')::date >= v_desde
       and (retail.fn_dueno_de_la_linea(cb.venta_item_id) = v_claure
            or exists (select 1 from retail.cambio_salidas cs
                         join retail.variantes va on va.id = cs.variante_id
                         join retail.productos pr on pr.id = va.producto_id
                        where cs.cambio_id = cb.id and pr.empresa_id = v_claure)
            or exists (select 1 from retail.variantes va
                         join retail.productos pr on pr.id = va.producto_id
                        where va.id = cb.variante_nueva_id and pr.empresa_id = v_claure))
  )
  select g.fecha, g.origen, g.medio, g.cuenta_id, cd.nombre, g.ubicacion_id, g.n_pagos, g.monto,
         round(g.monto - g.monto / (1 + retail.fn_tasa_igv(g.fecha)), 2),
         -- La comisión del POS la asume Claudia: solo tarjeta y QR llevan, con la tarifa de la máquina de esa cuenta; nula si no la hay.
         case when g.origen = 'devolucion' or g.medio not in ('tarjeta', 'qr') then 0::numeric
              else (select retail.fn_pos_comision_estimada(m.id, g.medio, g.monto, g.n_pagos, g.fecha)
                      from retail.pos_maquinas m where m.cuenta_id = g.cuenta_id) end,
         true
    from agrupado g left join retail.cuentas_dinero cd on cd.id = g.cuenta_id
  union all
  select k.fecha, 'cambio'::text, coalesce(k.medio, 'cambio'), k.cuenta_id, cd.nombre, k.ubicacion_id, count(*)::integer, sum(k.delta), sum(k.igv), 0::numeric, true
    from retail.fn_aliada_cambios(v_claure, v_desde, date '2100-01-01', v_ubics) k left join retail.cuentas_dinero cd on cd.id = k.cuenta_id
   group by k.fecha, coalesce(k.medio, 'cambio'), k.cuenta_id, cd.nombre, k.ubicacion_id
  order by 1 desc, 2, 3;
end $function$;

CREATE OR REPLACE FUNCTION retail.fn_aliada_gastos_base(p_empresa uuid, p_desde date, p_hasta date, p_todo boolean, p_ubics uuid[])
 RETURNS TABLE(fecha date, ubicacion_id uuid, gasto_id uuid, categoria text, descripcion text, cuenta_pcge text, monto_total numeric, igv numeric, pct numeric, parte numeric, parte_base numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'retail', 'public', 'extensions'
AS $function$
#variable_conflict use_column
declare
  v_claure uuid;
  v_desde date;
begin
  select e.id, e.cuenta_corriente_desde into v_claure, v_desde from retail.empresas e where e.id = p_empresa and e.id <> retail.fn_empresa_casa_id();
  if (select e.clave from retail.empresas e where e.id = p_empresa) is distinct from 'claure' then
    return;
  end if;
  if v_claure is null or v_desde is null then
    return;
  end if;
  return query
  select g.fecha, g.ubicacion_id, g.id, g.categoria, g.descripcion, k.cuenta_pcge, g.monto_total, g.igv, r.pct_claure,
         round(g.monto_total * r.pct_claure / 100, 2),
         round((g.monto_total - g.igv) * r.pct_claure / 100, 2)
    from retail.gastos g
    join retail.empresa_sedes es on es.empresa_id = v_claure and es.ubicacion_id = g.ubicacion_id and (p_todo or es.ubicacion_id = any (p_ubics))
    join retail.gasto_reparto_claure r on r.categoria = g.categoria and r.pct_claure > 0
    join retail.categorias_gasto k on k.codigo = g.categoria
   where g.estado = 'vigente' and g.fecha >= greatest(p_desde, v_desde) and g.fecha <= p_hasta;
end $function$;

CREATE OR REPLACE FUNCTION retail.fn_aliada_saldo_a(p_empresa uuid, p_corte date)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'retail', 'public', 'extensions'
AS $function$
declare
  v_claure uuid;
  v_desde date;
  v_sedes uuid[];
  v_saldo numeric := 0;
begin
  select e.id, e.cuenta_corriente_desde into v_claure, v_desde from retail.empresas e where e.id = p_empresa and e.id <> retail.fn_empresa_casa_id();
  if v_claure is null or v_desde is null or p_corte is null or p_corte < v_desde then
    return 0;
  end if;
  v_sedes := array(select es.ubicacion_id from retail.empresa_sedes es where es.empresa_id = v_claure);
  -- Lo cobrado en cuentas de CAYLA menos lo devuelto y la comisión del POS (la asume CLAURE): las mismas filas de la pantalla CLAURE. El IGV lo pone CAYLA (ADR-0638, regla 5).
  v_saldo := coalesce((select sum(f.monto - coalesce(f.comision, 0))
                         from retail.fn_aliada_filas(v_claure, v_sedes) f where f.contado and f.fecha <= p_corte), 0);
  -- Lo ya pagado: desde un banco y el efectivo del cajón que se quedó con ella.
  v_saldo := v_saldo - coalesce((select sum(d.monto) from retail.movimientos_dinero d where d.tipo = 'pago_claure' and d.empresa_id = v_claure and d.estado = 'vigente' and d.fecha <= p_corte), 0);
  v_saldo := v_saldo - coalesce((select sum(t.monto) from retail.caja_traslados t join retail.cajas k on k.id = t.caja_id
                                  where t.destino = 'claudia' and t.empresa_id = v_claure and not k.es_prueba and (t.creado_en at time zone 'America/Lima')::date <= p_corte), 0);
  -- Y la parte de CLAURE de los gastos que pagó CAYLA.
  v_saldo := v_saldo - coalesce((select sum(g.parte) from retail.fn_aliada_gastos_base(v_claure, v_desde, p_corte, true, null) g), 0);
  return round(v_saldo, 2);
end $function$;

CREATE OR REPLACE FUNCTION retail.fn_aliada_cierre(p_empresa uuid, p_caja_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'retail', 'public', 'extensions'
AS $function$
#variable_conflict use_column
declare
  v_caja retail.cajas%rowtype;
  v_claure uuid;
  v_desde date;
  v_fecha date;
  v_sede text;
  v_lider boolean := retail.fn_es_lider();
  v_ef_total numeric := 0;
  v_ef_claure numeric := 0;
  v_cobrado numeric := 0; v_devuelto numeric := 0; v_comision numeric := 0; v_pagado numeric := 0;
  v_cobrado_hoy numeric := 0; v_devuelto_hoy numeric := 0; v_comision_hoy numeric := 0; v_pagado_hoy numeric := 0;
  v_cobrado_ant numeric := 0; v_devuelto_ant numeric := 0; v_comision_ant numeric := 0; v_pagado_ant numeric := 0;
  v_por_medio jsonb;
  v_cambios integer := 0;
  v_gastos numeric := 0; v_gastos_hoy numeric := 0;
  v_igv numeric := 0; v_igv_hoy numeric := 0;
  v_ef_claudia numeric := 0; v_ef_claudia_hoy numeric := 0;
begin
  if not retail.fn_puede_gestionar_caja() then
    raise exception 'Solo quien puede cerrar la caja ve las cuentas con las empresas aliadas' using errcode = '42501';
  end if;
  select * into v_caja from retail.cajas where id = p_caja_id;
  if not found then
    raise exception 'La caja % no existe', p_caja_id using errcode = 'P0001';
  end if;
  if not retail.fn_puede_operar_ubicacion(v_caja.ubicacion_id) then
    raise exception 'No tienes permiso sobre esa caja' using errcode = '42501';
  end if;

  select e.id, e.cuenta_corriente_desde into v_claure, v_desde from retail.empresas e where e.id = p_empresa and e.id <> retail.fn_empresa_casa_id();
  if v_claure is null or v_desde is null
     or not exists (select 1 from retail.empresa_sedes es where es.empresa_id = v_claure and es.ubicacion_id = v_caja.ubicacion_id) then
    return jsonb_build_object('hay_claure', false);
  end if;

  v_fecha := (coalesce(v_caja.cerrada_en, now()) at time zone 'America/Lima')::date;
  select u.nombre into v_sede from retail.ubicaciones u where u.id = v_caja.ubicacion_id;

  -- El efectivo de las ventas de esta caja (el mismo filtro de `fn_calcular_esperado_caja`), partido por el valor de las líneas de cada empresa.
  with v as (
    select vt.id, sum(i.subtotal) as total,
           coalesce(sum(i.subtotal) filter (where retail.fn_dueno_de_la_linea(i.id) = v_claure), 0) as de_claure
      from retail.ventas vt join retail.venta_items i on i.venta_id = vt.id
     where vt.caja_id = p_caja_id and vt.estado <> 'anulada'
     group by vt.id
  )
  select coalesce(sum(vp.monto), 0), coalesce(sum(vp.monto * v.de_claure / nullif(v.total, 0)), 0)
    into v_ef_total, v_ef_claure
    from retail.venta_pagos vp join v on v.id = vp.venta_id
   where vp.metodo = 'efectivo';
  v_ef_claure := round(v_ef_claure, 2);

  -- Lo cobrado en cuentas de CAYLA, de esta sede, hasta el día del cierre.
  select coalesce(sum(f.monto) filter (where (f.origen = 'venta' or (f.origen = 'cambio' and f.monto > 0)) and f.contado), 0),
         coalesce(-sum(f.monto) filter (where (f.origen = 'devolucion' or (f.origen = 'cambio' and f.monto < 0)) and f.contado), 0),
         coalesce(sum(coalesce(f.comision, 0)) filter (where f.contado), 0),
         coalesce(sum(f.monto) filter (where (f.origen = 'venta' or (f.origen = 'cambio' and f.monto > 0)) and f.contado and f.fecha = v_fecha), 0),
         coalesce(-sum(f.monto) filter (where (f.origen = 'devolucion' or (f.origen = 'cambio' and f.monto < 0)) and f.contado and f.fecha = v_fecha), 0),
         coalesce(sum(coalesce(f.comision, 0)) filter (where f.contado and f.fecha = v_fecha), 0),
         count(*) filter (where not f.contado)
    into v_cobrado, v_devuelto, v_comision, v_cobrado_hoy, v_devuelto_hoy, v_comision_hoy, v_cambios
    from retail.fn_aliada_filas(v_claure, array[v_caja.ubicacion_id]) f
   where f.fecha <= v_fecha;

  select coalesce(jsonb_agg(jsonb_build_object('medio', m.medio, 'monto', m.monto, 'comision', m.comision) order by m.medio), '[]'::jsonb)
    into v_por_medio
    from (select f.medio, round(sum(f.monto), 2) as monto, round(sum(coalesce(f.comision, 0)), 2) as comision
            from retail.fn_aliada_filas(v_claure, array[v_caja.ubicacion_id]) f
           where f.fecha = v_fecha and f.origen = 'venta' and f.contado
           group by f.medio) m;

  -- Lo ya pagado a CLAURE (movimientos vigentes): el total hasta ese día y lo de ese día.
  select coalesce(sum(d.monto) filter (where d.fecha <= v_fecha), 0), coalesce(sum(d.monto) filter (where d.fecha = v_fecha), 0)
    into v_pagado, v_pagado_hoy
    from retail.movimientos_dinero d where d.tipo = 'pago_claure' and d.empresa_id = v_claure and d.estado = 'vigente';

  -- Los gastos de CLAURE que pagó CAYLA (su parte según el reparto por categoría) también bajan lo que se le debe.
  v_gastos := (select coalesce(sum(g.parte), 0) from retail.fn_aliada_gastos_base(v_claure, v_desde, v_fecha, false, array[v_caja.ubicacion_id]) g);
  v_gastos_hoy := (select coalesce(sum(g.parte), 0) from retail.fn_aliada_gastos_base(v_claure, v_fecha, v_fecha, false, array[v_caja.ubicacion_id]) g);

  v_igv := (select coalesce(sum(coalesce(f.igv, 0)), 0) from retail.fn_aliada_filas(v_claure, array[v_caja.ubicacion_id]) f where f.contado and f.fecha <= v_fecha);
  v_igv_hoy := (select coalesce(sum(coalesce(f.igv, 0)), 0) from retail.fn_aliada_filas(v_claure, array[v_caja.ubicacion_id]) f where f.contado and f.fecha = v_fecha);

  -- El efectivo de CAYLA que Claudia se quedó al cerrar las cajas de esta sede (hasta ese día y de ese día): también baja lo que se le debe.
  v_ef_claudia := (select coalesce(sum(t.monto), 0) from retail.caja_traslados t join retail.cajas k on k.id = t.caja_id
                    where t.destino = 'claudia' and t.empresa_id = v_claure and not k.es_prueba and k.ubicacion_id = v_caja.ubicacion_id and (t.creado_en at time zone 'America/Lima')::date <= v_fecha);
  v_ef_claudia_hoy := (select coalesce(sum(t.monto), 0) from retail.caja_traslados t join retail.cajas k on k.id = t.caja_id
                        where t.destino = 'claudia' and t.empresa_id = v_claure and not k.es_prueba and k.ubicacion_id = v_caja.ubicacion_id and (t.creado_en at time zone 'America/Lima')::date = v_fecha);

  v_cobrado_ant := v_cobrado - v_cobrado_hoy;
  v_devuelto_ant := v_devuelto - v_devuelto_hoy;
  v_comision_ant := v_comision - v_comision_hoy;
  v_pagado_ant := v_pagado - v_pagado_hoy;

  return jsonb_build_object(
    'hay_claure', true,
    'sede', v_sede,
    'fecha', v_fecha,
    'puede_pagar', v_lider,
    'saldo', round(v_cobrado - v_devuelto - v_comision - v_pagado - v_ef_claudia - v_gastos, 2),
    'saldo_anterior', round(v_cobrado_ant - v_devuelto_ant - v_comision_ant - v_pagado_ant - (v_ef_claudia - v_ef_claudia_hoy) - (v_gastos - v_gastos_hoy), 2),
    'hoy', jsonb_build_object('cobrado', round(v_cobrado_hoy, 2), 'devuelto', round(v_devuelto_hoy, 2), 'igv', round(v_igv_hoy, 2), 'comision', round(v_comision_hoy, 2), 'pagado', round(v_pagado_hoy, 2), 'efectivo_claudia', round(v_ef_claudia_hoy, 2), 'gastos', round(v_gastos_hoy, 2)),
    'por_medio', v_por_medio,
    'efectivo', jsonb_build_object('total', round(v_ef_total, 2), 'claure', v_ef_claure, 'cayla', round(v_ef_total - v_ef_claure, 2)),
    'cambios_por_revisar', v_cambios
  );
end $function$;

CREATE OR REPLACE FUNCTION retail.fn_aliada_cuenta(p_empresa uuid)
 RETURNS TABLE(fecha date, origen text, medio text, cuenta_id uuid, cuenta_nombre text, ubicacion_id uuid, n_pagos integer, monto numeric, igv numeric, comision numeric, contado boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'retail', 'public', 'extensions'
AS $function$
declare
  v_ubics uuid[] := retail.fn_cuentas_dinero_ubicaciones();
begin
  if not retail.fn_es_lider() and coalesce(cardinality(v_ubics), 0) = 0 then
    raise exception 'Ver la cuenta con una empresa aliada necesita el módulo Cuentas y dinero en tu rol.' using errcode = '42501';
  end if;
  return query select * from retail.fn_aliada_filas(p_empresa, v_ubics);
end $function$;

CREATE OR REPLACE FUNCTION retail.fn_aliada_cuenta_desde(p_empresa uuid)
 RETURNS date
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'retail', 'public', 'extensions'
AS $function$
begin
  if not retail.fn_es_lider() and coalesce(cardinality(retail.fn_cuentas_dinero_ubicaciones()), 0) = 0 then
    raise exception 'Ver la cuenta con una empresa aliada necesita el módulo Cuentas y dinero en tu rol.' using errcode = '42501';
  end if;
  return (select e.cuenta_corriente_desde from retail.empresas e where e.id = p_empresa and e.id <> retail.fn_empresa_casa_id());
end $function$;

CREATE OR REPLACE FUNCTION retail.fn_aliada_pagos(p_empresa uuid)
 RETURNS TABLE(id uuid, fecha date, cuenta_id uuid, cuenta_nombre text, monto numeric, referencia text, registrado_por text, creado_en timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'retail', 'public', 'extensions'
AS $function$
#variable_conflict use_column
begin
  if not retail.fn_es_lider() and coalesce(cardinality(retail.fn_cuentas_dinero_ubicaciones()), 0) = 0 then
    raise exception 'Ver la cuenta con una empresa aliada necesita el módulo Cuentas y dinero en tu rol.' using errcode = '42501';
  end if;
  return query
  select x.id, x.fecha, x.cuenta_id, x.cuenta_nombre, x.monto, x.referencia, x.registrado_por, x.creado_en
    from (
      select d.id, d.fecha, d.cuenta_origen_id as cuenta_id, o.nombre as cuenta_nombre, d.monto, d.referencia,
             nullif(trim(concat_ws(' ', pr.nombres, pr.apellidos)), '') as registrado_por, d.created_at as creado_en
        from retail.movimientos_dinero d
        left join retail.cuentas_dinero o on o.id = d.cuenta_origen_id
        left join public.personas pr on pr.id = d.registrado_por
       where d.tipo = 'pago_claure' and d.empresa_id = p_empresa and d.estado = 'vigente'
      union all
      -- El efectivo del cajón que se quedó con Claudia al cerrar la caja: no sale de un banco, sale del cajón de esa tienda.
      select t.id, (t.creado_en at time zone 'America/Lima')::date, null::uuid, 'Efectivo del cajón · ' || u.nombre, t.monto::numeric, nullif(btrim(t.referencia), ''),
             nullif(trim(concat_ws(' ', pr.nombres, pr.apellidos)), ''), t.creado_en
        from retail.caja_traslados t
        join retail.cajas k on k.id = t.caja_id
        join retail.ubicaciones u on u.id = k.ubicacion_id
        left join public.personas pr on pr.id = t.registrado_por
       where t.destino = 'claudia' and t.empresa_id = p_empresa and not k.es_prueba
    ) x
   order by x.fecha desc, x.creado_en desc;
end $function$;

CREATE OR REPLACE FUNCTION retail.fn_aliada_gastos(p_empresa uuid)
 RETURNS TABLE(fecha date, ubicacion_id uuid, gasto_id uuid, categoria text, categoria_nombre text, descripcion text, monto_total numeric, pct numeric, parte numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'retail', 'public', 'extensions'
AS $function$
declare
  v_ubics uuid[] := retail.fn_cuentas_dinero_ubicaciones();
begin
  if not retail.fn_es_lider() and coalesce(cardinality(v_ubics), 0) = 0 then
    raise exception 'Ver la cuenta con una empresa aliada necesita el módulo Cuentas y dinero en tu rol.' using errcode = '42501';
  end if;
  return query
  select g.fecha, g.ubicacion_id, g.gasto_id, g.categoria, k.nombre, g.descripcion, g.monto_total, g.pct, g.parte
    from retail.fn_aliada_gastos_base(p_empresa, date '2000-01-01', (now() at time zone 'America/Lima')::date, false, v_ubics) g
    join retail.categorias_gasto k on k.codigo = g.categoria
   order by g.fecha desc, g.gasto_id;
end $function$;

revoke all on function retail.fn_aliada_filas(uuid, uuid[]) from public, anon;
revoke all on function retail.fn_aliada_filas(uuid, uuid[]) from authenticated;
revoke all on function retail.fn_aliada_gastos_base(uuid, date, date, boolean, uuid[]) from public, anon;
revoke all on function retail.fn_aliada_gastos_base(uuid, date, date, boolean, uuid[]) from authenticated;
revoke all on function retail.fn_aliada_saldo_a(uuid, date) from public, anon;
revoke all on function retail.fn_aliada_saldo_a(uuid, date) from authenticated;
revoke all on function retail.fn_aliada_cierre(uuid, uuid) from public, anon;
grant execute on function retail.fn_aliada_cierre(uuid, uuid) to authenticated;
revoke all on function retail.fn_aliada_cuenta(uuid) from public, anon;
grant execute on function retail.fn_aliada_cuenta(uuid) to authenticated;
revoke all on function retail.fn_aliada_cuenta_desde(uuid) from public, anon;
grant execute on function retail.fn_aliada_cuenta_desde(uuid) to authenticated;
revoke all on function retail.fn_aliada_pagos(uuid) from public, anon;
grant execute on function retail.fn_aliada_pagos(uuid) to authenticated;
revoke all on function retail.fn_aliada_gastos(uuid) from public, anon;
grant execute on function retail.fn_aliada_gastos(uuid) to authenticated;

-- ---------- 3. Las de CLAURE no se tocan ----------
-- Siguen tal cual para la pantalla de hoy y sus pruebas. La web nueva lee las de cada aliada; cuando esté publicada, las de CLAURE quedan sin uso y se
-- borran aparte (backlog de ADR-0683).

-- ---------- 4. Lo de todas las aliadas ----------
create or replace function retail.fn_aliadas_saldo_a(p_corte date)
returns numeric
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  -- Lo que CAYLA les debe a todas: cada una cuenta solo si se le debe (una que le debe a CAYLA no compensa a otra).
  select coalesce(sum(greatest(retail.fn_aliada_saldo_a(e.id, p_corte), 0)), 0)
    from retail.empresas e where e.id <> retail.fn_empresa_casa_id() and e.cuenta_corriente_desde is not null
$$;
revoke all on function retail.fn_aliadas_saldo_a(date) from public, anon, authenticated;

create or replace function retail.fn_aliadas_cierre(p_caja_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  -- Una fila por cada aliada con cuenta que vende en la tienda de esa caja (lo que el cierre muestra y lo que se queda cada dueña).
  select coalesce(jsonb_agg(retail.fn_aliada_cierre(e.id, p_caja_id) || jsonb_build_object('empresa_id', e.id, 'clave', e.clave, 'nombre', e.nombre) order by e.orden, e.nombre), '[]'::jsonb)
    from retail.empresas e
   where e.id <> retail.fn_empresa_casa_id() and e.cuenta_corriente_desde is not null
     and exists (select 1 from retail.empresa_sedes es join retail.cajas k on k.ubicacion_id = es.ubicacion_id where k.id = p_caja_id and es.empresa_id = e.id)
$$;
revoke all on function retail.fn_aliadas_cierre(uuid) from public, anon;
grant execute on function retail.fn_aliadas_cierre(uuid) to authenticated;

create or replace function retail.fn_aliadas_con_cuenta()
returns table(id uuid, clave text, nombre text, desde date, activo boolean)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
begin
  if not retail.fn_es_lider() and coalesce(cardinality(retail.fn_cuentas_dinero_ubicaciones()), 0) = 0 then
    raise exception 'Ver la cuenta con una empresa aliada necesita el módulo Cuentas y dinero en tu rol.' using errcode = '42501';
  end if;
  return query select e.id, e.clave, e.nombre, e.cuenta_corriente_desde, e.activo from retail.empresas e
                where e.id <> retail.fn_empresa_casa_id() and e.cuenta_corriente_desde is not null order by e.orden, e.nombre;
end
$$;
revoke all on function retail.fn_aliadas_con_cuenta() from public, anon;
grant execute on function retail.fn_aliadas_con_cuenta() to authenticated;

-- ---------- 5. Lo que se ancla en funciones vivas ----------
do $anclas$
declare
  v text;
begin
  -- La proyección de caja descuenta lo que se le debe a TODAS las aliadas.
  v := pg_get_functiondef('retail.fn_flujo_caja_proyeccion(integer)'::regprocedure);
  if position('retail.fn_claure_saldo_a(v_hoy)' in v) > 0 then
    execute replace(v, 'retail.fn_claure_saldo_a(v_hoy)', 'retail.fn_aliadas_saldo_a(v_hoy)');
  end if;
  -- El efectivo se queda con la dueña en cualquier tienda donde opere una aliada con cuenta (el disparador dice cuál).
  v := pg_get_functiondef('retail.cerrar_caja(uuid, numeric, numeric, text, text, uuid)'::regprocedure);
  if position('where e.clave = ''claure'' and e.activo and es.ubicacion_id = v_caja.ubicacion_id' in v) > 0 then
    v := replace(v, 'where e.clave = ''claure'' and e.activo and es.ubicacion_id = v_caja.ubicacion_id',
                    'where e.id <> retail.fn_empresa_casa_id() and e.cuenta_corriente_desde is not null and es.ubicacion_id = v_caja.ubicacion_id');
    v := replace(v, 'El efectivo solo se queda con Claudia en una tienda donde opera CLAURE', 'El efectivo solo se queda con la dueña en una tienda donde opera una empresa aliada');
    execute v;
  end if;
  -- Una aliada no se da de baja con su cuenta fuera de cero: ni al pedirla, ni al aplicarla.
  v := pg_get_functiondef('retail.programar_baja_empresa_aliada(uuid, text)'::regprocedure);
  if position('fn_aliada_saldo_a' in v) = 0 then
    if position('  if retail.fn_aliada_tiene_prendas(p_id) then' in v) = 0 then
      raise exception 'programar_baja_empresa_aliada no es la esperada. No se aplicó nada.';
    end if;
    execute replace(v, '  if retail.fn_aliada_tiene_prendas(p_id) then',
      '  if abs(retail.fn_aliada_saldo_a(p_id, retail.fn_hoy_lima())) >= 0.01 then' || chr(10) ||
      '    raise exception ''Su cuenta no está en cero (S/ %): salda lo que se le debe antes de darla de baja.'', to_char(retail.fn_aliada_saldo_a(p_id, retail.fn_hoy_lima()), ''FM999G999G990D00'') using errcode = ''P0001'', hint = ''saldo'';' || chr(10) ||
      '  end if;' || chr(10) || '  if retail.fn_aliada_tiene_prendas(p_id) then');
  end if;
  v := pg_get_functiondef('retail.fn_aplicar_bajas_de_aliadas()'::regprocedure);
  if position('fn_aliada_saldo_a' in v) = 0 then
    if position('    if retail.fn_aliada_tiene_prendas(v_e.id) then' in v) = 0 then
      raise exception 'fn_aplicar_bajas_de_aliadas no es la esperada. No se aplicó nada.';
    end if;
    execute replace(v, '    if retail.fn_aliada_tiene_prendas(v_e.id) then',
      '    if abs(retail.fn_aliada_saldo_a(v_e.id, retail.fn_hoy_lima())) >= 0.01 then' || chr(10) ||
      '      update retail.empresas set baja_detenida = ''Su cuenta no está en cero.'' where id = v_e.id;' || chr(10) ||
      '      v_detenidas := v_detenidas + 1;' || chr(10) || '      continue;' || chr(10) || '    end if;' || chr(10) ||
      '    if retail.fn_aliada_tiene_prendas(v_e.id) then');
  end if;
end
$anclas$;

select 'QUEDÓ BIEN' as resultado;
