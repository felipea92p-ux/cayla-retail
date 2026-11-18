-- Ventas ▸ Reportes: el filtro «Empresa» (CAYLA / CLAURE) donde conviven dos, hoy solo Tienda Lima (Felipe, 2026-11-14:
-- «en el reporte de ventas, cuando sea Lima, debe existir un filtro adicional de CAYLA y Claure»; ADR-0665).
--
-- QUÉ HACE. Las cuatro lecturas de Reportes (`fn_reporte_ventas_mes`, `_series`, `_cortes` y `_ranking`, 20261103230000 a 235000) ganan un último
-- parámetro, `p_empresa uuid default null`. Sin él todo sale igual que ayer. Con él, solo cuentan las líneas de venta de esa empresa.
--
-- DE QUIÉN ES UNA LÍNEA: la regla de Caja, Historial y Movimientos (ADR-0542, `fn_dueno_de_la_linea`): el dueño de la salida de esa línea en el libro
-- (`movimientos.empresa_id`) y, si la venta es anterior al libro, el de la ficha de la prenda. Esa función es `security definer` y la web no la
-- ejecuta; estas lecturas son INVOKER (las filtra la RLS) y una función `security definer` por línea las haría ~100 veces más lentas (ADR-0622). Por eso
-- `fn_empresa_de_la_linea` es la MISMA regla escrita como SQL llano de una sola consulta, que Postgres pliega dentro de la lectura. La prueba
-- `pnpm pruebas:reportes-por-empresa` exige que las dos digan lo mismo, línea por línea.
--
-- QUÉ CUENTA CADA CIFRA CON LA EMPRESA ELEGIDA (las decisiones de ADR-0532, aplicadas igual):
--   · Vendido y prendas: lo cobrado (`venta_items.subtotal`) de las líneas de esa empresa. CAYLA + CLAURE = el vendido sin filtro.
--   · Ventas (tickets): las ventas que tienen AL MENOS UNA línea de esa empresa. Una venta mixta cuenta en las dos: por eso las ventas de CAYLA y las
--     de CLAURE pueden sumar más que las ventas sin filtro. El ticket promedio es lo que se cobró de esa empresa por cada una de esas ventas.
--   · Devuelto: el reembolso de cada devolución aprobada se reparte entre las empresas de lo devuelto, en proporción a su valor
--     (`fn_reembolso_de_la_empresa`). Una devolución de una sola empresa va entera; una mixta, partida por valor; así CAYLA + CLAURE = el devuelto sin filtro.
--   · «Cómo se pagó»: NO se parte. Un cajón y una boleta son uno solo (Felipe descartó partir los pagos por empresa en ADR-0532: sería una estimación
--     en una venta mixta). Con la empresa elegida, `pagos` sale vacío y la pantalla lo dice.
--   · Lo que queda en tiendas (Ranking): las unidades de esa empresa (`fn_stock_por_dueno`); las de CAYLA son el stock total menos las de CLAURE.
--
-- LA EMPRESA SOLO SE ELIGE DENTRO DE UNA TIENDA DONDE OPERAN DOS (`fn_exigir_empresa_del_reporte`, 22023): con «todas las tiendas» CLAURE sería «lo vendido
-- en Lima que no es de CAYLA» y el resto, otra suma; esa pregunta no se hace aquí. La pantalla no ofrece el filtro fuera de Lima y la base lo rechaza si llega.
--
-- POR QUÉ SE BORRAN LAS FIRMAS VIEJAS. Una función nueva con un parámetro más y otra con el viejo conviven como dos firmas, y PostgREST no sabe a cuál
-- llamar cuando la web manda los parámetros por nombre (PGRST203). Se borra la vieja en la misma transacción (ADR-0532). `drop function` no toma los
-- candados de `auth` y `storage` (CLAUDE.md «Políticas y deadlocks»); no hay políticas ni `drop trigger`.
--
-- CÓMO PEGARLA EN PRODUCCIÓN (CLAUDE.md «Cómo aplicar SQL a producción»): una sola parte, todo con el prefijo `retail.`. Se puede pegar dos veces. El
-- candado de abajo se asegura de que las cuatro lecturas vivas sean las de main (o ya las de este archivo) antes de reemplazarlas.

-- ============================== CANDADO (corre primero) ==============================
do $candado$
declare r record; v_md5 text; v_oid regprocedure;
begin
  for r in select * from (values
    ('retail.fn_reporte_ventas_mes(date,uuid)',                                          'retail.fn_reporte_ventas_mes(date,uuid,uuid)',                                          'e3ddaea0e5e34a173ff9b17086d6d077', '66a6108de54a496bf363a0a30bf40165'),
    ('retail.fn_reporte_ventas_series(date,uuid)',                                       'retail.fn_reporte_ventas_series(date,uuid,uuid)',                                       'f6d255bebc8a126483300dac8d8a7083', 'a15fe47a959342c51360ee52c625fbd8'),
    ('retail.fn_reporte_ventas_cortes(date,uuid)',                                       'retail.fn_reporte_ventas_cortes(date,uuid,uuid)',                                       '8d8f62cbccf744fc127a011567c07a60', '12b4d240bdc95c215abb1bf74933883a'),
    ('retail.fn_reporte_ventas_ranking(date,date,uuid,uuid,uuid,uuid,text,text,text,text,integer,integer)', 'retail.fn_reporte_ventas_ranking(date,date,uuid,uuid,uuid,uuid,text,text,text,text,integer,integer,uuid)', '4b67ff77361d983effa592ad474110c1', '33df583c731d156dc0740efa4d869e65')
  ) as t(firma_vieja, firma_nueva, md5_main, md5_nuevo) loop
    -- Si la firma nueva ya existe (esta migración ya se pegó), su cuerpo tiene que ser el de este archivo; si no, la vieja tiene que ser la de main.
    v_oid := to_regprocedure(r.firma_nueva);
    if v_oid is not null then
      select md5(p.prosrc) into v_md5 from pg_proc p where p.oid = v_oid;
      if v_md5 <> r.md5_nuevo then
        raise exception '% ya existe con otro cuerpo en esta base (md5 %): no es el de este archivo. Reescríbela desde su definición real antes de pegar.', r.firma_nueva, v_md5;
      end if;
    else
      v_oid := to_regprocedure(r.firma_vieja);
      if v_oid is null then
        raise exception 'Falta %: esta migración no la crea desde cero, la reemplaza (¿se pegaron las de 20261103230000 a 235000?).', r.firma_vieja;
      end if;
      select md5(p.prosrc) into v_md5 from pg_proc p where p.oid = v_oid;
      if v_md5 <> r.md5_main then
        raise exception '% tiene otro cuerpo en esta base (md5 %): no es el de main. Alguien la parchó; reescribe este archivo desde su definición real antes de pegar.', r.firma_vieja, v_md5;
      end if;
    end if;
  end loop;
end
$candado$;

set lock_timeout = '3s';

-- ============================== Los tres ayudantes ==============================

-- De qué empresa es una línea de venta. La misma regla que `fn_dueno_de_la_linea`, en SQL llano e INVOKER para que se pliegue en la consulta.
create or replace function retail.fn_empresa_de_la_linea(p_venta_item_id uuid)
returns uuid
language sql
stable
as $$
  select coalesce(
    (select m.empresa_id from retail.movimientos m
      where m.venta_item_id = p_venta_item_id and m.tipo = 'salida' and m.empresa_id is not null
      order by m.created_at limit 1),
    (select p.empresa_id from retail.venta_items i
       join retail.variantes va on va.id = i.variante_id
       join retail.productos p on p.id = va.producto_id
      where i.id = p_venta_item_id))
$$;

-- Cuánto del reembolso de una devolución es de una empresa: el reembolso, en proporción al valor de lo devuelto de esa empresa (precio con su descuento por
-- las unidades devueltas). Una devolución de una sola empresa va entera a ella. Si lo devuelto no tiene valor (una bolsa de obsequio) o no tiene líneas,
-- todo el reembolso va a la casa: así la suma de las empresas es SIEMPRE el reembolso.
create or replace function retail.fn_reembolso_de_la_empresa(p_devolucion_id uuid, p_empresa uuid)
returns numeric
language sql
stable
as $$
  select case
           when coalesce(x.total, 0) > 0 then coalesce(d.reembolso_monto, 0) * coalesce(x.de_la_empresa, 0) / x.total
           when p_empresa = retail.fn_empresa_casa_id() then coalesce(d.reembolso_monto, 0)
           else 0
         end
  from retail.devoluciones d
  left join lateral (
    select sum(di.cantidad * (vi.precio_unitario - vi.descuento_unitario)) as total,
           sum(di.cantidad * (vi.precio_unitario - vi.descuento_unitario)) filter (where retail.fn_empresa_de_la_linea(vi.id) = p_empresa) as de_la_empresa
    from retail.devolucion_items di
    join retail.venta_items vi on vi.id = di.venta_item_id
    where di.devolucion_id = d.id) x on true
  where d.id = p_devolucion_id
$$;

-- La empresa solo se elige dentro de una tienda donde operan dos, y tiene que ser una de ellas. Sin empresa, no pide nada.
create or replace function retail.fn_exigir_empresa_del_reporte(p_empresa uuid, p_ubicacion uuid)
returns void
language plpgsql
stable
as $$
begin
  if p_empresa is null then
    return;
  end if;
  if p_ubicacion is null then
    raise exception 'La empresa se elige dentro de una tienda donde operan las dos.' using errcode = '22023';
  end if;
  if (select count(*) from retail.fn_empresas_de_sede(p_ubicacion)) < 2
     or not exists (select 1 from retail.fn_empresas_de_sede(p_ubicacion) e where e.id = p_empresa) then
    raise exception 'Esa empresa no se separa en esta tienda: el filtro solo existe donde operan dos.' using errcode = '22023';
  end if;
end
$$;

revoke all on function retail.fn_empresa_de_la_linea(uuid) from public, anon;
revoke all on function retail.fn_reembolso_de_la_empresa(uuid, uuid) from public, anon;
revoke all on function retail.fn_exigir_empresa_del_reporte(uuid, uuid) from public, anon;
grant execute on function retail.fn_empresa_de_la_linea(uuid) to authenticated;
grant execute on function retail.fn_reembolso_de_la_empresa(uuid, uuid) to authenticated;
grant execute on function retail.fn_exigir_empresa_del_reporte(uuid, uuid) to authenticated;

comment on function retail.fn_empresa_de_la_linea(uuid) is
  'ADR-0665: de qué empresa es una línea de venta (la regla de fn_dueno_de_la_linea, INVOKER y plegable). Para las lecturas de Reportes; si una cambia, cambia la otra.';
comment on function retail.fn_reembolso_de_la_empresa(uuid, uuid) is
  'ADR-0665: la parte de una devolución que es de una empresa, por el valor de lo devuelto. La suma de las empresas es el reembolso.';
comment on function retail.fn_exigir_empresa_del_reporte(uuid, uuid) is
  'ADR-0665: la empresa de un reporte solo se elige dentro de una tienda donde operan dos (22023).';

-- ============================== Ventas del mes: las cifras ==============================

drop function if exists retail.fn_reporte_ventas_mes(date, uuid);

create or replace function retail.fn_reporte_ventas_mes(p_mes date, p_ubicacion uuid default null, p_empresa uuid default null)
returns jsonb
language plpgsql
stable
as $fn$
declare
  v_ini date;
  v_hoy date := (now() at time zone 'America/Lima')::date;
  v_sig date;            -- primer día del mes siguiente
  v_fin date;            -- fin (exclusivo) del tramo del mes pedido
  v_prev_ini date;
  v_prev_fin date;       -- fin (exclusivo) del tramo equivalente del mes anterior
  v_primera date;
  v_res jsonb;
begin
  if p_mes is null then
    raise exception 'Falta el mes del reporte.' using errcode = '22023';
  end if;
  if not coalesce(retail.fn_ve_modulo('reportes_ventas'), false) then
    raise exception 'Tu rol no ve los Reportes de ventas.' using errcode = '42501';
  end if;
  perform retail.fn_exigir_empresa_del_reporte(p_empresa, p_ubicacion);

  v_ini := date_trunc('month', p_mes)::date;
  v_sig := (v_ini + interval '1 month')::date;
  v_fin := least(v_sig, v_hoy + 1);
  if v_fin < v_ini then v_fin := v_ini; end if;   -- mes futuro: tramo vacío
  v_prev_ini := (v_ini - interval '1 month')::date;
  v_prev_fin := least(v_prev_ini + (v_fin - v_ini), v_ini);

  with ventanas(k, d, h) as (
    values ('actual', v_ini, v_fin), ('anterior', v_prev_ini, v_prev_fin)
  ),
  v as (
    select w.k, vt.id
    from ventanas w
    join retail.ventas vt
      on vt.created_at >= (w.d::timestamp at time zone 'America/Lima')
     and vt.created_at <  (w.h::timestamp at time zone 'America/Lima')
    where vt.estado = 'completada'
      and not vt.es_prueba
      and (p_ubicacion is null or vt.ubicacion_id = p_ubicacion)
      -- Con una empresa: las ventas que tienen al menos una línea suya.
      and (p_empresa is null or exists (select 1 from retail.venta_items i where i.venta_id = vt.id and retail.fn_empresa_de_la_linea(i.id) = p_empresa))
  ),
  tick as (select k, count(*) as tickets from v group by k),
  it as (
    select v.k,
           sum(i.subtotal) as vendido,
           sum(i.cantidad) as unidades
    from v join retail.venta_items i on i.venta_id = v.id
    where (p_empresa is null or retail.fn_empresa_de_la_linea(i.id) = p_empresa)
    group by v.k
  ),
  dev as (
    select w.k,
           sum(case when p_empresa is null then d.reembolso_monto else retail.fn_reembolso_de_la_empresa(d.id, p_empresa) end) as devuelto
    from ventanas w
    join retail.devoluciones d
      on coalesce(d.aprobado_en, d.created_at) >= (w.d::timestamp at time zone 'America/Lima')
     and coalesce(d.aprobado_en, d.created_at) <  (w.h::timestamp at time zone 'America/Lima')
    join retail.ventas vv on vv.id = d.venta_id
    where d.estado = 'aprobada'
      and not vv.es_prueba
      and (p_ubicacion is null or d.ubicacion_id = p_ubicacion)
    group by w.k
  )
  select jsonb_object_agg(w.k, jsonb_build_object(
           'desde', w.d, 'hasta', w.h,
           'vendido', round(coalesce(it.vendido, 0), 2),
           'tickets', coalesce(tick.tickets, 0),
           'unidades', coalesce(it.unidades, 0),
           'devuelto', round(coalesce(dev.devuelto, 0), 2)))
  into v_res
  from ventanas w
  left join tick on tick.k = w.k
  left join it on it.k = w.k
  left join dev on dev.k = w.k;

  select min((vt.created_at at time zone 'America/Lima')::date)
  into v_primera
  from retail.ventas vt
  where vt.estado = 'completada' and not vt.es_prueba
    and (p_ubicacion is null or vt.ubicacion_id = p_ubicacion)
    and (p_empresa is null or exists (select 1 from retail.venta_items i where i.venta_id = vt.id and retail.fn_empresa_de_la_linea(i.id) = p_empresa));

  return jsonb_build_object(
    'mes', v_ini,
    'hoy', v_hoy,
    'en_curso', (v_hoy >= v_ini and v_hoy < v_sig),
    'primera_venta', v_primera,
    'actual', v_res -> 'actual',
    'anterior', v_res -> 'anterior'
  );
end
$fn$;

revoke all on function retail.fn_reporte_ventas_mes(date, uuid, uuid) from public, anon;
grant execute on function retail.fn_reporte_ventas_mes(date, uuid, uuid) to authenticated;

comment on function retail.fn_reporte_ventas_mes(date, uuid, uuid) is
  'Ventas ▸ Reportes ▸ Ventas del mes: cifras del mes (a la fecha si está en curso) y del tramo equivalente del mes anterior; con p_empresa, solo las líneas de esa empresa (ADR-0665). Invoker; exige el módulo reportes_ventas.';

-- ============================== Ventas del mes: los gráficos ==============================

drop function if exists retail.fn_reporte_ventas_series(date, uuid);

create or replace function retail.fn_reporte_ventas_series(p_mes date, p_ubicacion uuid default null, p_empresa uuid default null)
returns jsonb
language plpgsql
stable
as $fn$
declare
  v_ini date;
  v_hoy date := (now() at time zone 'America/Lima')::date;
  v_mes_hoy date;
  v_sig date;
  v_fin date;            -- fin (exclusivo) del tramo del mes pedido
  v_ult_mes date;        -- primer día del ÚLTIMO mes de la ventana de meses
  v_pri_mes date;        -- primer día del PRIMER mes de la ventana de meses
  v_dias jsonb;
  v_pagos jsonb;
  v_meses jsonb;
begin
  if p_mes is null then
    raise exception 'Falta el mes del reporte.' using errcode = '22023';
  end if;
  if not coalesce(retail.fn_ve_modulo('reportes_ventas'), false) then
    raise exception 'Tu rol no ve los Reportes de ventas.' using errcode = '42501';
  end if;
  perform retail.fn_exigir_empresa_del_reporte(p_empresa, p_ubicacion);

  v_ini := date_trunc('month', p_mes)::date;
  v_mes_hoy := date_trunc('month', v_hoy)::date;
  v_sig := (v_ini + interval '1 month')::date;
  v_fin := least(v_sig, v_hoy + 1);
  if v_fin < v_ini then v_fin := v_ini; end if;   -- mes futuro: tramo vacío

  -- Los días del tramo, con ceros donde no hubo ventas
  select coalesce(jsonb_agg(jsonb_build_object('fecha', d.dia, 'vendido', coalesce(x.vendido, 0), 'tickets', coalesce(x.tickets, 0)) order by d.dia), '[]'::jsonb)
  into v_dias
  from (select g::date as dia from generate_series(v_ini, v_fin - 1, interval '1 day') g) d
  left join (
    select (vt.created_at at time zone 'America/Lima')::date as dia,
           round(sum(i.subtotal), 2) as vendido,
           count(distinct vt.id) as tickets
    from retail.ventas vt
    join retail.venta_items i on i.venta_id = vt.id
    where vt.estado = 'completada' and not vt.es_prueba
      and vt.created_at >= (v_ini::timestamp at time zone 'America/Lima')
      and vt.created_at <  (v_fin::timestamp at time zone 'America/Lima')
      and (p_ubicacion is null or vt.ubicacion_id = p_ubicacion)
      and (p_empresa is null or retail.fn_empresa_de_la_linea(i.id) = p_empresa)
    group by 1
  ) x on x.dia = d.dia;

  -- Cómo se pagó. Con una empresa elegida NO se parte (una caja y una boleta son una sola): sale vacío y la pantalla lo dice.
  if p_empresa is not null then
    v_pagos := '[]'::jsonb;
  else
    select coalesce(jsonb_agg(jsonb_build_object('metodo', t.metodo, 'monto', t.monto) order by t.monto desc, t.metodo), '[]'::jsonb)
    into v_pagos
    from (
      select p.metodo, round(sum(p.monto), 2) as monto
      from retail.ventas vt
      join retail.venta_pagos p on p.venta_id = vt.id
      where vt.estado = 'completada' and not vt.es_prueba
        and vt.created_at >= (v_ini::timestamp at time zone 'America/Lima')
        and vt.created_at <  (v_fin::timestamp at time zone 'America/Lima')
        and (p_ubicacion is null or vt.ubicacion_id = p_ubicacion)
      group by p.metodo
    ) t;
  end if;

  -- Mes a mes: la ventana de 12 meses que contiene al mes pedido
  v_ult_mes := case when v_ini > (v_mes_hoy - interval '12 months')::date then v_mes_hoy
                    else least((v_ini + interval '11 months')::date, v_mes_hoy) end;
  v_pri_mes := (v_ult_mes - interval '11 months')::date;
  select coalesce(jsonb_agg(jsonb_build_object('mes', m.mes, 'vendido', m.vendido, 'tickets', m.tickets, 'en_curso', m.mes = v_mes_hoy) order by m.mes), '[]'::jsonb)
  into v_meses
  from (
    select date_trunc('month', vt.created_at at time zone 'America/Lima')::date as mes,
           round(sum(i.subtotal), 2) as vendido,
           count(distinct vt.id) as tickets
    from retail.ventas vt
    join retail.venta_items i on i.venta_id = vt.id
    where vt.estado = 'completada' and not vt.es_prueba
      and vt.created_at >= (v_pri_mes::timestamp at time zone 'America/Lima')
      and vt.created_at <  ((v_ult_mes + interval '1 month')::date::timestamp at time zone 'America/Lima')
      and (p_ubicacion is null or vt.ubicacion_id = p_ubicacion)
      and (p_empresa is null or retail.fn_empresa_de_la_linea(i.id) = p_empresa)
    group by 1
  ) m;

  return jsonb_build_object('mes', v_ini, 'hoy', v_hoy, 'dias', v_dias, 'pagos', v_pagos, 'meses', v_meses);
end
$fn$;

revoke all on function retail.fn_reporte_ventas_series(date, uuid, uuid) from public, anon;
grant execute on function retail.fn_reporte_ventas_series(date, uuid, uuid) to authenticated;

comment on function retail.fn_reporte_ventas_series(date, uuid, uuid) is
  'Ventas ▸ Reportes ▸ Ventas del mes: ventas por día, cobrado por medio de pago y mes a mes (ventana de 12 meses); con p_empresa, solo las líneas de esa empresa y sin partir los pagos (ADR-0665). Invoker; exige el módulo reportes_ventas.';

-- ============================== Ventas del mes: por tienda y por categoría ==============================

drop function if exists retail.fn_reporte_ventas_cortes(date, uuid);

create or replace function retail.fn_reporte_ventas_cortes(p_mes date, p_ubicacion uuid default null, p_empresa uuid default null)
returns jsonb
language plpgsql
stable
as $fn$
declare
  v_ini date;
  v_hoy date := (now() at time zone 'America/Lima')::date;
  v_sig date;
  v_fin date;            -- fin (exclusivo) del tramo del mes pedido
  v_prev_ini date;
  v_prev_fin date;       -- fin (exclusivo) del tramo equivalente del mes anterior
  v_tiendas jsonb;
  v_categorias jsonb;
begin
  if p_mes is null then
    raise exception 'Falta el mes del reporte.' using errcode = '22023';
  end if;
  if not coalesce(retail.fn_ve_modulo('reportes_ventas'), false) then
    raise exception 'Tu rol no ve los Reportes de ventas.' using errcode = '42501';
  end if;
  perform retail.fn_exigir_empresa_del_reporte(p_empresa, p_ubicacion);

  v_ini := date_trunc('month', p_mes)::date;
  v_sig := (v_ini + interval '1 month')::date;
  v_fin := least(v_sig, v_hoy + 1);
  if v_fin < v_ini then v_fin := v_ini; end if;   -- mes futuro: tramo vacío
  v_prev_ini := (v_ini - interval '1 month')::date;
  v_prev_fin := least(v_prev_ini + (v_fin - v_ini), v_ini);

  -- UNA consulta: las líneas de venta de los dos tramos se arman una vez (`lin`) y de ellas salen los dos cortes.
  with ventanas(k, d, h) as (
    values ('actual', v_ini, v_fin), ('anterior', v_prev_ini, v_prev_fin)
  ),
  lin as (
    select w.k, vt.ubicacion_id, vt.id as venta_id, i.id as item_id, i.variante_id, i.cantidad, i.subtotal
    from ventanas w
    join retail.ventas vt
      on vt.created_at >= (w.d::timestamp at time zone 'America/Lima')
     and vt.created_at <  (w.h::timestamp at time zone 'America/Lima')
    join retail.venta_items i on i.venta_id = vt.id
    where vt.estado = 'completada' and not vt.es_prueba
      and (p_ubicacion is null or vt.ubicacion_id = p_ubicacion)
      and (p_empresa is null or retail.fn_empresa_de_la_linea(i.id) = p_empresa)
  ),
  -- Por tienda
  t_lin as (
    select k, ubicacion_id, sum(subtotal) as vendido, sum(cantidad) as unidades, count(distinct venta_id) as tickets
    from lin group by k, ubicacion_id
  ),
  t_dev as (
    select w.k, d.ubicacion_id,
           sum(case when p_empresa is null then d.reembolso_monto else retail.fn_reembolso_de_la_empresa(d.id, p_empresa) end) as devuelto
    from ventanas w
    join retail.devoluciones d
      on coalesce(d.aprobado_en, d.created_at) >= (w.d::timestamp at time zone 'America/Lima')
     and coalesce(d.aprobado_en, d.created_at) <  (w.h::timestamp at time zone 'America/Lima')
    join retail.ventas vv on vv.id = d.venta_id
    where d.estado = 'aprobada' and not vv.es_prueba
      and (p_ubicacion is null or d.ubicacion_id = p_ubicacion)
    group by w.k, d.ubicacion_id
  ),
  tk as (select k, ubicacion_id from t_lin union select k, ubicacion_id from t_dev),
  tt as (
    select tk.k, tk.ubicacion_id,
           round(coalesce(l.vendido, 0), 2) as vendido,
           coalesce(l.tickets, 0) as tickets,
           coalesce(l.unidades, 0) as unidades,
           round(coalesce(d.devuelto, 0), 2) as devuelto
    from tk
    left join t_lin l on l.k = tk.k and l.ubicacion_id = tk.ubicacion_id
    left join t_dev d on d.k = tk.k and d.ubicacion_id = tk.ubicacion_id
  ),
  tiendas as (
    select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'nombre', x.nombre, 'actual', x.actual, 'anterior', x.anterior)
                              order by (x.actual ->> 'vendido')::numeric desc, x.nombre), '[]'::jsonb) as j
    from (
      select u.id, u.nombre,
             coalesce((select to_jsonb(r) - 'k' - 'ubicacion_id' from tt r where r.k = 'actual' and r.ubicacion_id = u.id),
                      '{"vendido":0,"tickets":0,"unidades":0,"devuelto":0}'::jsonb) as actual,
             coalesce((select to_jsonb(r) - 'k' - 'ubicacion_id' from tt r where r.k = 'anterior' and r.ubicacion_id = u.id),
                      '{"vendido":0,"tickets":0,"unidades":0,"devuelto":0}'::jsonb) as anterior
      from retail.ubicaciones u
      where u.id in (select ubicacion_id from tk)
    ) x
  ),
  -- Por categoría
  cat as (
    select l.k,
           coalesce(pr.categoria_id, pp.categoria_id) as categoria_id,
           sum(l.subtotal) as vendido,
           sum(l.cantidad) as unidades
    from lin l
    join retail.variantes va on va.id = l.variante_id
    join retail.productos pr on pr.id = va.producto_id
    left join retail.prendas_por_regularizar pp on pp.venta_item_id = l.item_id
    group by l.k, coalesce(pr.categoria_id, pp.categoria_id)
  ),
  ids as (select distinct categoria_id from cat),
  categorias as (
    select coalesce(jsonb_agg(jsonb_build_object('id', x.categoria_id, 'nombre', x.nombre, 'actual', x.actual, 'anterior', x.anterior)
                              order by (x.nombre = 'Sin categoría'), (x.actual ->> 'vendido')::numeric desc, x.nombre), '[]'::jsonb) as j
    from (
      select i.categoria_id, coalesce(c.nombre, 'Sin categoría') as nombre,
             coalesce((select jsonb_build_object('vendido', round(a.vendido, 2), 'unidades', a.unidades) from cat a where a.k = 'actual' and a.categoria_id is not distinct from i.categoria_id),
                      '{"vendido":0,"unidades":0}'::jsonb) as actual,
             coalesce((select jsonb_build_object('vendido', round(a.vendido, 2), 'unidades', a.unidades) from cat a where a.k = 'anterior' and a.categoria_id is not distinct from i.categoria_id),
                      '{"vendido":0,"unidades":0}'::jsonb) as anterior
      from ids i
      left join retail.categorias c on c.id = i.categoria_id
    ) x
  )
  select (select j from tiendas), (select j from categorias) into v_tiendas, v_categorias;

  return jsonb_build_object('mes', v_ini, 'hoy', v_hoy, 'tiendas', v_tiendas, 'categorias', v_categorias);
end
$fn$;

revoke all on function retail.fn_reporte_ventas_cortes(date, uuid, uuid) from public, anon;
grant execute on function retail.fn_reporte_ventas_cortes(date, uuid, uuid) to authenticated;

comment on function retail.fn_reporte_ventas_cortes(date, uuid, uuid) is
  'Ventas ▸ Reportes ▸ Ventas del mes: el mes cortado por tienda y por categoría, con el tramo equivalente del anterior; con p_empresa, solo las líneas de esa empresa (ADR-0665). Invoker; exige el módulo reportes_ventas.';

-- ============================== Ranking de prendas ==============================

drop function if exists retail.fn_reporte_ventas_ranking(date, date, uuid, uuid, uuid, uuid, text, text, text, text, int, int);

create or replace function retail.fn_reporte_ventas_ranking(
  p_desde date,
  p_hasta date,
  p_ubicacion uuid default null,
  p_categoria uuid default null,
  p_marca uuid default null,
  p_talla uuid default null,
  p_color text default null,
  p_busqueda text default null,
  p_nivel text default 'modelo',
  p_orden text default 'unidades',
  p_pagina int default 0,
  p_por_pagina int default 10,
  p_empresa uuid default null
)
returns jsonb
language plpgsql
stable
as $fn$
declare
  v_dias int;
  v_ant_desde date;
  v_ant_hasta date;     -- fin (exclusivo) del período anterior = el inicio de este
  v_q text;
  v_res jsonb;
begin
  if p_desde is null or p_hasta is null or p_hasta <= p_desde then
    raise exception 'El rango de fechas no es válido.' using errcode = '22023';
  end if;
  if p_hasta - p_desde > 400 then
    raise exception 'El rango no puede pasar de 400 días.' using errcode = '22023';
  end if;
  if p_nivel not in ('modelo', 'variante') or p_orden not in ('unidades', 'soles') then
    raise exception 'El nivel o el orden del ranking no es válido.' using errcode = '22023';
  end if;
  if p_pagina is null or p_pagina < 0 or p_por_pagina is null or p_por_pagina < 1 or p_por_pagina > 50 then
    raise exception 'La página o su tamaño no son válidos.' using errcode = '22023';
  end if;
  if not coalesce(retail.fn_ve_modulo('reportes_ventas'), false) then
    raise exception 'Tu rol no ve los Reportes de ventas.' using errcode = '42501';
  end if;
  perform retail.fn_exigir_empresa_del_reporte(p_empresa, p_ubicacion);

  v_dias := p_hasta - p_desde;
  v_ant_hasta := p_desde;
  v_ant_desde := p_desde - v_dias;
  v_q := nullif(lower(btrim(coalesce(p_busqueda, ''))), '');

  with ventanas(k, d, h) as (
    values ('actual', p_desde, p_hasta), ('anterior', v_ant_desde, v_ant_hasta)
  ),
  det as (
    select w.k, i.cantidad, i.subtotal, va.producto_id, va.color_codigo, va.talla_id,
           pr.categoria_id, pr.marca_id, pr.referencia, pr.codigo
    from ventanas w
    join retail.ventas vt
      on vt.created_at >= (w.d::timestamp at time zone 'America/Lima')
     and vt.created_at <  (w.h::timestamp at time zone 'America/Lima')
    join retail.venta_items i on i.venta_id = vt.id
    join retail.variantes va on va.id = i.variante_id
    join retail.productos pr on pr.id = va.producto_id
    where vt.estado = 'completada' and not vt.es_prueba
      and (p_ubicacion is null or vt.ubicacion_id = p_ubicacion)
      and (p_empresa is null or retail.fn_empresa_de_la_linea(i.id) = p_empresa)
  ),
  sinreg as (
    select coalesce(sum(cantidad), 0) as unidades, coalesce(round(sum(subtotal), 2), 0) as vendido
    from det where k = 'actual' and categoria_id is null
  ),
  cats as (select c.id from retail.categorias c where retail.fn_categoria_entra_a_motores(c.id)),
  base as (select d.* from det d join cats on cats.id = d.categoria_id),
  total_per as (
    select coalesce(sum(cantidad), 0) as unidades, coalesce(round(sum(subtotal), 2), 0) as vendido
    from base where k = 'actual'
  ),
  f as (
    select * from base
    where (p_categoria is null or categoria_id = p_categoria)
      and (p_marca is null or marca_id = p_marca)
      and (p_talla is null or talla_id = p_talla)
      and (p_color is null or color_codigo = p_color)
      and (v_q is null or position(v_q in lower(referencia)) > 0 or position(v_q in lower(coalesce(codigo, ''))) > 0)
  ),
  g as (
    select k, producto_id,
           case when p_nivel = 'variante' then color_codigo end as color_codigo,
           case when p_nivel = 'variante' then talla_id end as talla_id,
           sum(cantidad) as u, sum(subtotal) as v
    from f
    group by k, producto_id, case when p_nivel = 'variante' then color_codigo end, case when p_nivel = 'variante' then talla_id end
  ),
  act as (
    select a.producto_id, a.color_codigo, a.talla_id, a.u, a.v, coalesce(b.u, 0) as u_ant, coalesce(b.v, 0) as v_ant
    from g a
    left join g b
      on b.k = 'anterior' and b.producto_id = a.producto_id
     and b.color_codigo is not distinct from a.color_codigo and b.talla_id is not distinct from a.talla_id
    where a.k = 'actual'
  ),
  clasif as (
    select a.*,
           row_number() over (
             order by (case when p_orden = 'soles' then a.v else a.u end)::numeric desc, a.v desc, a.u desc, pr.referencia, a.color_codigo, a.talla_id
           ) as pos
    from act a join retail.productos pr on pr.id = a.producto_id
  ),
  top10 as (
    select coalesce(sum(u), 0) as u, coalesce(round(sum(v), 2), 0) as v from clasif where pos <= 10
  ),
  pagina as (
    select * from clasif where pos > p_pagina * p_por_pagina and pos <= (p_pagina + 1) * p_por_pagina
  ),
  -- Lo que hay en las tiendas. Con una empresa: sus unidades. Las de CLAURE salen de `fn_stock_por_dueno` (una sola llamada: ADR-0542, la única puerta a
  -- `stock_dueno`, que las tablas no leen); las de CAYLA son el stock total menos las de CLAURE, así que las dos empresas suman el «queda» sin filtro.
  tot as (
    select s.variante_id, sum(s.cantidad) as q
    from retail.stock s join retail.ubicaciones u on u.id = s.ubicacion_id
    where u.tipo = 'tienda' and (p_ubicacion is null or s.ubicacion_id = p_ubicacion)
    group by s.variante_id
  ),
  -- Sin empresa se le pasa `null` y la función no lee nada: el ranking de siempre no paga esta llamada.
  duenos as materialized (
    select d.variante_id, d.empresa_id, d.cantidad
    from retail.fn_stock_por_dueno(case when p_empresa is not null then p_ubicacion end) d
  ),
  casa as materialized (select retail.fn_empresa_casa_id() as id),
  st as (
    select t.variante_id,
           case
             when p_empresa is null then t.q
             when p_empresa = (select id from casa) then t.q - coalesce((select sum(d.cantidad) from duenos d where d.variante_id = t.variante_id and d.empresa_id <> (select id from casa)), 0)
             else coalesce((select sum(d.cantidad) from duenos d where d.variante_id = t.variante_id and d.empresa_id = p_empresa), 0)
           end as q
    from tot t
  ),
  filas as (
    select pg.pos, pg.producto_id, pg.color_codigo, pg.talla_id, pg.u, pg.v, pg.u_ant, pg.v_ant,
           pr.referencia, pr.codigo, ca.nombre as categoria, ca.prefijo as categoria_prefijo, ca.familia as categoria_familia,
           ma.nombre as marca, co.nombre as color_nombre, co.hex as color_hex, ta.valor as talla,
           (select dom.hex from (
              select co2.hex, sum(f2.cantidad) as uu
              from f f2 join retail.colores co2 on co2.codigo = f2.color_codigo
              where f2.k = 'actual' and f2.producto_id = pg.producto_id
              group by co2.hex order by uu desc, co2.hex limit 1) dom) as color_principal_hex,
           (select coalesce(sum(st.q), 0)
            from retail.variantes va join st on st.variante_id = va.id
            where va.producto_id = pg.producto_id
              and (p_nivel = 'modelo' or (va.color_codigo = pg.color_codigo and va.talla_id = pg.talla_id))
              and (p_talla is null or va.talla_id = p_talla)
              and (p_color is null or va.color_codigo = p_color)) as stock
    from pagina pg
    join retail.productos pr on pr.id = pg.producto_id
    left join retail.categorias ca on ca.id = pr.categoria_id
    left join retail.marcas ma on ma.id = pr.marca_id
    left join retail.colores co on co.codigo = pg.color_codigo
    left join retail.tallas ta on ta.id = pg.talla_id
  ),
  tallas_s as (
    select ta.valor, sum(f.cantidad) as u
    from f join retail.tallas ta on ta.id = f.talla_id
    where f.k = 'actual'
    group by ta.valor
  ),
  colores_s as (
    select co.codigo, co.nombre, co.hex, sum(f.cantidad) as u
    from f join retail.colores co on co.codigo = f.color_codigo
    where f.k = 'actual'
    group by co.codigo, co.nombre, co.hex
    order by u desc, co.codigo
    limit 8
  )
  select jsonb_build_object(
    'desde', p_desde,
    'hasta', p_hasta,
    'anterior', jsonb_build_object('desde', v_ant_desde, 'hasta', v_ant_hasta),
    'total', (select jsonb_build_object('unidades', coalesce(sum(u), 0), 'vendido', coalesce(round(sum(v), 2), 0)) from act),
    'total_periodo', (select jsonb_build_object('unidades', unidades, 'vendido', vendido) from total_per),
    'sin_registrar', (select jsonb_build_object('unidades', unidades, 'vendido', vendido) from sinreg),
    'primera_venta', (select min((vt.created_at at time zone 'America/Lima')::date) from retail.ventas vt
                      where vt.estado = 'completada' and not vt.es_prueba and (p_ubicacion is null or vt.ubicacion_id = p_ubicacion)
                        and (p_empresa is null or exists (select 1 from retail.venta_items i where i.venta_id = vt.id and retail.fn_empresa_de_la_linea(i.id) = p_empresa))),
    'cuantos', (select count(*) from act),
    'primeros_diez', (select jsonb_build_object('unidades', u, 'vendido', v) from top10),
    'mayor', (select jsonb_build_object('unidades', u, 'vendido', round(v, 2)) from clasif where pos = 1),
    'filas', (select coalesce(jsonb_agg(jsonb_build_object(
        'pos', pos, 'producto_id', producto_id, 'nombre', referencia, 'codigo', codigo,
        'categoria', categoria, 'categoria_prefijo', categoria_prefijo, 'categoria_familia', categoria_familia, 'marca', marca,
        'color_codigo', color_codigo, 'color_nombre', color_nombre, 'color_hex', coalesce(color_hex, color_principal_hex), 'talla', talla,
        'unidades', u, 'vendido', round(v, 2), 'unidades_ant', u_ant, 'vendido_ant', round(v_ant, 2), 'stock', stock) order by pos), '[]'::jsonb) from filas),
    'tallas', (select coalesce(jsonb_agg(jsonb_build_object('talla', valor, 'unidades', u) order by u desc, valor), '[]'::jsonb) from tallas_s),
    'colores', (select coalesce(jsonb_agg(jsonb_build_object('codigo', codigo, 'nombre', nombre, 'hex', hex, 'unidades', u) order by u desc, codigo), '[]'::jsonb) from colores_s)
  ) into v_res;

  return v_res;
end
$fn$;

revoke all on function retail.fn_reporte_ventas_ranking(date, date, uuid, uuid, uuid, uuid, text, text, text, text, int, int, uuid) from public, anon;
grant execute on function retail.fn_reporte_ventas_ranking(date, date, uuid, uuid, uuid, uuid, text, text, text, text, int, int, uuid) to authenticated;

comment on function retail.fn_reporte_ventas_ranking(date, date, uuid, uuid, uuid, uuid, text, text, text, text, int, int, uuid) is
  'Ventas ▸ Reportes ▸ Ranking de prendas: lo que más se vende en un rango, con filtros, por modelo o por color y talla, contra el período anterior del mismo largo; con p_empresa, solo las líneas de esa empresa y lo que queda de ella (ADR-0665). Invoker; exige el módulo reportes_ventas.';
