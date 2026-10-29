-- ============================================================================
-- 20261029004000 — La cuenta con CLAURE: de quién es cada cuenta de dinero y cuánto de lo que entró a cuentas de CAYLA es de CLAURE
-- (ADR-0560; actividad 1 de 9; solo lectura)
--
-- EL PROBLEMA PRIMERO. En Tienda LIM el POS y el Yape cobran en cuentas de CAYLA, pero parte de lo que se vende es de CLAURE (de Claudia).
-- Esa plata pasa por las cuentas de CAYLA y hay que dársela. Hasta hoy nada en el sistema separaba esa plata de la de CAYLA: la deuda
-- se llevaba a mano. Felipe (2026-10-28): se le debe a Claudia lo que una venta de CLAURE cobró en una CUENTA de CAYLA (el POS, un Yape
-- a BCP Empresa…); el efectivo no, porque Claudia administra esa caja y ya lo tiene. Y la comisión del POS la asume ella.
--
-- CONTRATO (Liskov)
--   PROMETE: (1) `cuentas_dinero.empresa_id`: de quién es la plata de cada cuenta (CAYLA de fábrica; hoy no existe ninguna de CLAURE).
--            (2) `empresas.cuenta_corriente_desde`: desde qué día se lleva la cuenta corriente con una empresa (CLAURE: 2026-10-23, el día
--            desde el que las ventas se rehicieron con la regla del botón, ADR-0542). Es un dato, no una constante en el código.
--            (3) `fn_claure_cuenta()`: lo cobrado por CLAURE en cuentas de CAYLA, por día, medio y cuenta, desde ese día. SOLO LEE; el saldo
--            nunca se guarda (se suma de lo que devuelve, principio 4). Reparte cada pago de una venta en proporción al valor de las líneas
--            de cada empresa (`fn_dueno_de_la_linea`, ADR-0542), igual que el libro de dinero (`fn_dinero_libro`) ubica el pago en su cuenta
--            (la sellada, o la que rige ese día). Resta lo devuelto por devoluciones aprobadas pagadas desde una cuenta de CAYLA. Estima la
--            comisión del POS con la tarifa que regía ese día (`pos_tarifas`, ADR-0429), nula si no hay tarifa. Calcula el IGV incluido.
--            (3b) `fn_claure_filas(sedes)`: ese mismo cálculo, interno y sin candado, para que lo lea también el cierre de caja (actividad 3).
--            (4) `fn_claure_cuenta_desde()`: esa fecha de arranque, para que la pantalla la diga (`empresas` no se lee directo).
--   ASUME:   las ventas son de precio con IGV incluido (boleta) y la tasa del día es `fn_tasa_igv`; el efectivo cae al cajón y no entra;
--            un pago sin cuenta asignada se cuenta (cae en una cuenta de CAYLA que todavía no se nombró); lo ve el líder (todas las sedes)
--            o quien tiene el módulo Cuentas y dinero (su sede), igual que las demás lecturas de esa pantalla.
--   NO HACE: no registra pagos a Claudia (actividad 2); no cuenta apartados ni pedidos web (actividad 7: el abono espera a que la prenda
--            salga; las ventas con anticipo no entran todavía); no repone la comisión de una devolución con tarjeta; un CAMBIO con prendas de
--            CLAURE no entra al saldo: se lista aparte (`contado = false`) para que se revise a mano, porque el cambio mueve plata sin mover
--            cuentas y no hay una regla que Felipe haya aprobado todavía. En producción (2026-10-28) no había ni devoluciones ni cambios
--            de CLAURE.
--
-- CÓMO SE PEGA EN PRODUCCIÓN — UNA SOLA EJECUCIÓN. Dos `alter table` (agregar una columna con valor de fábrica a `cuentas_dinero` y otra
-- a `empresas`: un instante de candado, con lock_timeout) y una función nueva. Sin políticas ni triggers. Idempotente.
-- SE ROMPE SI: (1) `fn_dueno_de_la_linea` no existe (hay que pegar antes 20261028153000, ADR-0542); (2) se mueve una cuenta al otro dueño
-- cuando ya hay cobros: el saldo cambia hacia atrás (a propósito: la cuenta es de quien es, no de cuando se supo); (3) una venta de CLAURE
-- se paga con un medio nuevo que no sea efectivo, yape, plin, tarjeta, transferencia ni qr: no entra (como en el libro de dinero).
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. De quién es cada cuenta ----------
alter table retail.cuentas_dinero
  add column if not exists empresa_id uuid not null default retail.fn_empresa_casa_id() references retail.empresas (id);
comment on column retail.cuentas_dinero.empresa_id is
  'ADR-0560: de qué empresa es la plata de esta cuenta (CAYLA de fábrica). Lo que una venta de CLAURE cobra en una cuenta de CAYLA se le debe a CLAURE; lo que cae en una cuenta de CLAURE no genera deuda. Hoy no existe ninguna cuenta de CLAURE.';

-- ---------- 2. Desde cuándo se lleva la cuenta corriente con una empresa ----------
alter table retail.empresas add column if not exists cuenta_corriente_desde date;
comment on column retail.empresas.cuenta_corriente_desde is
  'ADR-0560: desde qué día se lleva la cuenta corriente entre CAYLA y esta empresa (nulo = no se lleva). Solo cuentan las ventas desde ese día; antes de él el reparto era por marca y no es confiable.';
update retail.empresas set cuenta_corriente_desde = date '2026-10-23' where clave = 'claure' and cuenta_corriente_desde is null;

-- ---------- 3. Lo cobrado por CLAURE en cuentas de CAYLA ----------
-- El cálculo, para las sedes que le pasen. INTERNA: sin candado (quien la llama decide qué sedes ve la persona). La leen `fn_claure_cuenta`
-- (Finanzas, con el módulo Cuentas y dinero) y `fn_claure_cierre` (el cierre de caja, con el permiso de cerrar esa caja).
create or replace function retail.fn_claure_filas(p_ubics uuid[])
returns table (fecha date, origen text, medio text, cuenta_id uuid, cuenta_nombre text, ubicacion_id uuid,
               n_pagos integer, monto numeric, igv numeric, comision numeric, contado boolean)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
#variable_conflict use_column
declare
  v_ubics uuid[] := p_ubics;
  v_casa uuid := retail.fn_empresa_casa_id();
  v_claure uuid;
  v_desde date;
begin
  select e.id, e.cuenta_corriente_desde into v_claure, v_desde from retail.empresas e where e.clave = 'claure' and e.activo;
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
  select k.fecha, 'cambio'::text, k.medio, k.cuenta_id, cd.nombre, k.ubicacion_id, 1, k.monto, null::numeric, null::numeric, false
    from cambiados k left join retail.cuentas_dinero cd on cd.id = k.cuenta_id
  order by 1 desc, 2, 3;
end $$;

comment on function retail.fn_claure_filas(uuid[]) is
  'ADR-0560 (interna, sin candado): lo cobrado por CLAURE en cuentas de CAYLA desde empresas.cuenta_corriente_desde, por día, medio y cuenta, en las sedes que le pasen (ventas +, devoluciones −), con el IGV incluido y la comisión estimada del POS. Los cambios con prendas de CLAURE salen con contado = false (no entran al saldo). Solo lee.';
revoke all on function retail.fn_claure_filas(uuid[]) from public, anon, authenticated;

-- La lectura de Finanzas: lo que ve la cuenta con el módulo Cuentas y dinero (el líder, todo; si no, su sede).
create or replace function retail.fn_claure_cuenta()
returns table (fecha date, origen text, medio text, cuenta_id uuid, cuenta_nombre text, ubicacion_id uuid,
               n_pagos integer, monto numeric, igv numeric, comision numeric, contado boolean)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
declare
  v_ubics uuid[] := retail.fn_cuentas_dinero_ubicaciones();
begin
  if not retail.fn_es_lider() and coalesce(cardinality(v_ubics), 0) = 0 then
    raise exception 'Ver la cuenta con CLAURE necesita el módulo Cuentas y dinero en tu rol.' using errcode = '42501';
  end if;
  return query select * from retail.fn_claure_filas(v_ubics);
end $$;

comment on function retail.fn_claure_cuenta() is
  'ADR-0560: lo cobrado por CLAURE en cuentas de CAYLA (fn_claure_filas) en las sedes que ve la cuenta con el módulo Cuentas y dinero. Solo lee.';

revoke all on function retail.fn_claure_cuenta() from public, anon;
grant execute on function retail.fn_claure_cuenta() to authenticated;

-- ---------- 4. Desde cuándo se cuenta (para decirlo en la pantalla) ----------
-- `empresas` no se lee directo (sin políticas): la fecha sale por aquí. Nula si no se lleva cuenta con CLAURE.
create or replace function retail.fn_claure_cuenta_desde()
returns date
language plpgsql stable security definer set search_path = retail, public, extensions as $$
begin
  if not retail.fn_es_lider() and coalesce(cardinality(retail.fn_cuentas_dinero_ubicaciones()), 0) = 0 then
    raise exception 'Ver la cuenta con CLAURE necesita el módulo Cuentas y dinero en tu rol.' using errcode = '42501';
  end if;
  return (select e.cuenta_corriente_desde from retail.empresas e where e.clave = 'claure' and e.activo);
end $$;

comment on function retail.fn_claure_cuenta_desde() is
  'ADR-0560: el día desde el que se lleva la cuenta corriente con CLAURE (nulo si no se lleva).';

revoke all on function retail.fn_claure_cuenta_desde() from public, anon;
grant execute on function retail.fn_claure_cuenta_desde() to authenticated;
