-- ============================================================================
-- 20261029044000 — Los gastos por empresa: lo que CAYLA paga y es de CLAURE baja lo que se le debe a Claudia y sale del gasto de CAYLA (ADR-0560; actividad 8)
--
-- EL PROBLEMA PRIMERO. En Tienda LIM el alquiler, la luz, el mantenimiento, la limpieza y las bolsas los paga CAYLA (sus cuentas y su caja), pero una parte —o todo— es de CLAURE.
-- Hoy el sistema los cuenta enteros como gasto de CAYLA, y lo que Claudia le debe a CAYLA por ellos no baja lo que CAYLA le debe a ella. Felipe (2026-10-28): «mantenimiento, luz y
-- alquiler se dividen entre los dos (50/50); la planilla, la limpieza y las bolsas solo son de CLAURE», y «se compensa el efectivo… y los gastos de CLAURE pagados por CAYLA».
--
-- CONTRATO (Liskov)
--   PROMETE: (1) `gasto_reparto_claure(categoria, pct_claure)` dice qué parte de cada categoría de gasto es de CLAURE en una sede donde CLAURE opera; de fábrica, alquileres, luz, servicios
--            básicos y mantenimiento 50 %, y las categorías nuevas «limpieza» y «bolsas» 100 %. Una categoría que no está, o con 0, es toda de CAYLA. (2) `fn_claure_gastos()`
--            lista, por gasto, la parte de CLAURE (monto pagado × su %) desde el arranque de su cuenta, para quien ve la cuenta con CLAURE; esa suma BAJA el saldo con Claudia. (3) El Diario
--            (`fn_asientos_claure`) reclasifica esa parte, sin IGV, del gasto de CAYLA a lo que se le debe (479 al debe): el Estado de resultados deja de contarla. Un gasto anulado no cuenta.
--            (4) El aviso del cierre de caja (`fn_claure_cierre`) suma la parte al saldo y la dice aparte (`hoy.gastos`).
--   ASUME:   (a) el reparto es por CATEGORÍA, no por gasto: lo registra quien paga con su categoría de siempre; los porcentajes de fábrica son los que Felipe dijo y los cambia él (por SQL, hasta que
--            haya una pantalla: pendiente); (b) los gastos de Gasto rápido «Bolsas» y «Limpieza» pasan a sus categorías nuevas (cambio en la web); los de antes quedan donde estaban
--            (suministros: no se reparten); (c) el IGV de la factura del gasto sigue siendo de CAYLA; (d) la PLANILLA de las personas de CLAURE no se toca: viene de Dynamic y no hay a quién
--            atribuirla (pendiente de Felipe).
--   NO HACE: no cambia ningún gasto ya registrado, ni su monto, ni cómo se paga; solo cómo se cuenta.
--
-- CÓMO SE PEGA EN PRODUCCIÓN — DOS PARTES, en este orden y por separado (CLAUDE.md «Políticas y deadlocks»: esta migración no lleva políticas, pero crea una tabla):
--   PARTE 1 (hasta «FIN DE LA PARTE 1»): la tabla, su siembra y las funciones nuevas. PARTE 2: el Diario y el cierre (reemplazos anclados sobre funciones propias de esta rama).
--   Idempotente. Después de 20261029043000. SE ROMPE SI: `categorias_gasto.codigo` deja de ser único.
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

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

-- ---------- 1. Las dos categorías nuevas y el reparto de fábrica ----------
insert into retail.categorias_gasto (codigo, nombre, ejemplos, cuenta_pcge, activo, orden)
select 'limpieza', 'Limpieza', 'Lejía, detergente, trapeador, escoba, papel higiénico', '656', true, 19
 where not exists (select 1 from retail.categorias_gasto where codigo = 'limpieza');
insert into retail.categorias_gasto (codigo, nombre, ejemplos, cuenta_pcge, activo, orden)
select 'bolsas', 'Bolsas y empaque', 'Bolsas de regalo, cajas, papel de empaque', '656', true, 20
 where not exists (select 1 from retail.categorias_gasto where codigo = 'bolsas');

create table if not exists retail.gasto_reparto_claure (
  categoria text primary key references retail.categorias_gasto (codigo),
  pct_claure numeric(5, 2) not null check (pct_claure >= 0 and pct_claure <= 100),
  actualizado_en timestamptz not null default now()
);
alter table retail.gasto_reparto_claure enable row level security;
-- Sin políticas a propósito: la tienda la lee solo por funciones `security definer` (`fn_claure_gastos`), como las demás tablas de configuración de CLAURE.

comment on table retail.gasto_reparto_claure is
  'ADR-0560: qué parte de cada categoría de gasto de una sede donde opera CLAURE es de CLAURE. De fábrica (Felipe, 2026-10-28): alquileres, luz, servicios básicos y mantenimiento 50 %; limpieza y bolsas 100 %. Sin fila o con 0, todo es de CAYLA.';

insert into retail.gasto_reparto_claure (categoria, pct_claure) values
  ('alquileres', 50), ('luz', 50), ('servicios_basicos', 50), ('mantenimiento', 50), ('limpieza', 100), ('bolsas', 100)
on conflict (categoria) do nothing;

-- ---------- 2. La parte de CLAURE de cada gasto (interna) ----------
create or replace function retail.fn_claure_gastos_base(p_desde date, p_hasta date, p_todo boolean, p_ubics uuid[])
returns table (fecha date, ubicacion_id uuid, gasto_id uuid, categoria text, descripcion text, cuenta_pcge text,
               monto_total numeric, igv numeric, pct numeric, parte numeric, parte_base numeric)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
#variable_conflict use_column
declare
  v_claure uuid;
  v_desde date;
begin
  select e.id, e.cuenta_corriente_desde into v_claure, v_desde from retail.empresas e where e.clave = 'claure' and e.activo;
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
end $$;

comment on function retail.fn_claure_gastos_base(date, date, boolean, uuid[]) is
  'ADR-0560 (interna): la parte de CLAURE de cada gasto vigente de una sede donde opera, según el reparto por categoría (gasto_reparto_claure), desde el arranque de su cuenta. `parte` es sobre lo pagado; `parte_base`, sin IGV.';
revoke all on function retail.fn_claure_gastos_base(date, date, boolean, uuid[]) from public, anon, authenticated;

-- ---------- 3. Lo que ve quien mira la cuenta con CLAURE ----------
create or replace function retail.fn_claure_gastos()
returns table (fecha date, ubicacion_id uuid, gasto_id uuid, categoria text, categoria_nombre text, descripcion text, monto_total numeric, pct numeric, parte numeric)
language plpgsql stable security definer set search_path = retail, public, extensions as $$
declare
  v_ubics uuid[] := retail.fn_cuentas_dinero_ubicaciones();
begin
  if not retail.fn_es_lider() and coalesce(cardinality(v_ubics), 0) = 0 then
    raise exception 'Ver la cuenta con CLAURE necesita el módulo Cuentas y dinero en tu rol.' using errcode = '42501';
  end if;
  return query
  select g.fecha, g.ubicacion_id, g.gasto_id, g.categoria, k.nombre, g.descripcion, g.monto_total, g.pct, g.parte
    from retail.fn_claure_gastos_base(date '2000-01-01', (now() at time zone 'America/Lima')::date, false, v_ubics) g
    join retail.categorias_gasto k on k.codigo = g.categoria
   order by g.fecha desc, g.gasto_id;
end $$;

comment on function retail.fn_claure_gastos() is
  'ADR-0560: los gastos que CAYLA pagó y que en parte son de CLAURE (reparto por categoría), desde el arranque de su cuenta. Su suma baja lo que se le debe a Claudia. Candado de fn_claure_cuenta.';
revoke all on function retail.fn_claure_gastos() from public, anon;
grant execute on function retail.fn_claure_gastos() to authenticated;

-- ---------- FIN DE LA PARTE 1 ----------
-- ---------- 4. El Diario: la parte de CLAURE sale del gasto de CAYLA ----------
create or replace function retail.fn_asientos_claure(p_desde date, p_hasta date, p_todo boolean, p_ubics uuid[])
returns table (f date, ubicacion_id uuid, asiento text, regla text, cuenta text, debe numeric, haber numeric, ot text, oid uuid, glosa text)
language sql stable set search_path = retail, public, extensions as $$
  with x as (select * from retail.fn_claure_ventas(p_desde, p_hasta, p_todo, p_ubics))
  -- Una venta de CLAURE: sale de los ingresos (7011) y de la mercadería vendida (691) de CAYLA; lo que se le debe va a la 479 y la prenda no era de CAYLA (201).
  select x.fecha, x.ubicacion_id, 'claure:' || x.id, 'claure_venta', '7011', x.base, 0::numeric, 'ventas', x.id, 'Lo vendido de CLAURE no es ingreso de CAYLA'
    from x where x.origen = 'venta' and x.base > 0
  union all
  select x.fecha, x.ubicacion_id, 'claure:' || x.id, 'claure_venta', '479', 0, x.base, 'ventas', x.id, 'Se le debe a CLAURE (sin IGV)'
    from x where x.origen = 'venta' and x.base > 0
  union all
  select x.fecha, x.ubicacion_id, 'claure:' || x.id, 'claure_venta', '201', x.costo, 0, 'ventas', x.id, 'La prenda no era de CAYLA: no sale de su mercadería'
    from x where x.origen = 'venta' and x.costo > 0
  union all
  select x.fecha, x.ubicacion_id, 'claure:' || x.id, 'claure_venta', '691', 0, x.costo, 'ventas', x.id, 'Su costo no es costo de lo vendido de CAYLA'
    from x where x.origen = 'venta' and x.costo > 0
  -- Una anulación la deshace el día en que se anuló (el Diario revierte la venta, el costo y la mercadería de CAYLA: aquí se devuelve lo reclasificado).
  union all
  select x.fecha, x.ubicacion_id, 'claure_anul:' || x.id, 'claure_anulacion', '479', x.base, 0, 'ventas', x.id, 'Se revierte lo que se le debía a CLAURE'
    from x where x.origen = 'anulacion' and x.base > 0
  union all
  select x.fecha, x.ubicacion_id, 'claure_anul:' || x.id, 'claure_anulacion', '7011', 0, x.base, 'ventas', x.id, 'Se revierte la venta de CLAURE que no era de CAYLA'
    from x where x.origen = 'anulacion' and x.base > 0
  union all
  select x.fecha, x.ubicacion_id, 'claure_anul:' || x.id, 'claure_anulacion', '691', x.costo, 0, 'ventas', x.id, 'Vuelve el costo que no era de CAYLA'
    from x where x.origen = 'anulacion' and x.costo > 0
  union all
  select x.fecha, x.ubicacion_id, 'claure_anul:' || x.id, 'claure_anulacion', '201', 0, x.costo_ok, 'ventas', x.id, 'La prenda de CLAURE no entra a la mercadería de CAYLA'
    from x where x.origen = 'anulacion' and x.costo_ok > 0
  union all
  select x.fecha, x.ubicacion_id, 'claure_anul:' || x.id, 'claure_anulacion', '6951', 0, x.costo_mal, 'ventas', x.id, 'La merma de una prenda de CLAURE no es de CAYLA'
    from x where x.origen = 'anulacion' and x.costo_mal > 0
  -- Una devolución, igual: el Diario revierte la venta y devuelve la prenda a CAYLA; aquí se devuelve lo reclasificado.
  union all
  select x.fecha, x.ubicacion_id, 'claure_devol:' || x.id, 'claure_devolucion', '479', x.base, 0, 'devoluciones', x.id, 'Se revierte lo que se le debía a CLAURE'
    from x where x.origen = 'devolucion' and x.base > 0
  union all
  select x.fecha, x.ubicacion_id, 'claure_devol:' || x.id, 'claure_devolucion', '7011', 0, x.base, 'devoluciones', x.id, 'Se revierte la venta de CLAURE que no era de CAYLA'
    from x where x.origen = 'devolucion' and x.base > 0
  union all
  select x.fecha, x.ubicacion_id, 'claure_devol:' || x.id, 'claure_devolucion', '691', x.costo, 0, 'devoluciones', x.id, 'Vuelve el costo que no era de CAYLA'
    from x where x.origen = 'devolucion' and x.costo > 0
  union all
  select x.fecha, x.ubicacion_id, 'claure_devol:' || x.id, 'claure_devolucion', '201', 0, x.costo, 'devoluciones', x.id, 'La prenda de CLAURE no entra a la mercadería de CAYLA'
    from x where x.origen = 'devolucion' and x.costo > 0
  -- Un GASTO de la sede donde opera CLAURE cuya parte es de CLAURE (el reparto por categoría, `gasto_reparto_claure`): CAYLA lo pagó, pero esa parte no es gasto suyo: sale de su
  -- gasto y baja lo que se le debe a Claudia (479 al debe). Solo la parte sin IGV; el IGV de la factura sigue siendo de CAYLA. Un gasto anulado no cuenta.
  union all
  select g.fecha, g.ubicacion_id, 'claure_gasto:' || g.gasto_id, 'claure_gasto', '479', g.parte_base, 0::numeric, 'gastos', g.gasto_id, 'Gasto de CLAURE que pagó CAYLA: baja lo que se le debe'
    from retail.fn_claure_gastos_base(p_desde, p_hasta, p_todo, p_ubics) g where g.parte_base > 0
  union all
  select g.fecha, g.ubicacion_id, 'claure_gasto:' || g.gasto_id, 'claure_gasto', g.cuenta_pcge, 0::numeric, g.parte_base, 'gastos', g.gasto_id, 'La parte del gasto que es de CLAURE no es gasto de CAYLA'
    from retail.fn_claure_gastos_base(p_desde, p_hasta, p_todo, p_ubics) g where g.parte_base > 0;
$$;

comment on function retail.fn_asientos_claure(date, date, boolean, uuid[]) is
  'ADR-0560 (interna): reclasificación del Diario: lo vendido de CLAURE (sin IGV) sale de 7011 y va a 479, y su costo vuelve a 201 y sale de 691; anulaciones y devoluciones la deshacen en su día; y la parte de CLAURE de un gasto que pagó CAYLA sale de su gasto y baja la 479. Un asiento por documento, que cuadra solo.';
revoke all on function retail.fn_asientos_claure(date, date, boolean, uuid[]) from public, anon, authenticated;

-- ---------- 5. El aviso del cierre de caja: el saldo también baja con los gastos ----------
select pg_temp.reemplazar('retail.fn_claure_cierre(uuid)',
$v$  v_cambios integer := 0;
begin$v$,
$n$  v_cambios integer := 0;
  v_gastos numeric := 0; v_gastos_hoy numeric := 0;
begin$n$,
1);

select pg_temp.reemplazar('retail.fn_claure_cierre(uuid)',
$v$  v_cobrado_ant := v_cobrado - v_cobrado_hoy;$v$,
$n$  -- Los gastos de CLAURE que pagó CAYLA (su parte según el reparto por categoría) también bajan lo que se le debe.
  v_gastos := (select coalesce(sum(g.parte), 0) from retail.fn_claure_gastos_base(v_desde, v_fecha, false, array[v_caja.ubicacion_id]) g);
  v_gastos_hoy := (select coalesce(sum(g.parte), 0) from retail.fn_claure_gastos_base(v_fecha, v_fecha, false, array[v_caja.ubicacion_id]) g);

  v_cobrado_ant := v_cobrado - v_cobrado_hoy;$n$,
1);

select pg_temp.reemplazar('retail.fn_claure_cierre(uuid)',
$v$    'saldo', round(v_cobrado - v_devuelto - v_comision - v_pagado, 2),$v$,
$n$    'saldo', round(v_cobrado - v_devuelto - v_comision - v_pagado - v_gastos, 2),$n$,
1);

select pg_temp.reemplazar('retail.fn_claure_cierre(uuid)',
$v$    'saldo_anterior', round(v_cobrado_ant - v_devuelto_ant - v_comision_ant - v_pagado_ant, 2),$v$,
$n$    'saldo_anterior', round(v_cobrado_ant - v_devuelto_ant - v_comision_ant - v_pagado_ant - (v_gastos - v_gastos_hoy), 2),$n$,
1);

select pg_temp.reemplazar('retail.fn_claure_cierre(uuid)',
$v$'pagado', round(v_pagado_hoy, 2)),$v$,
$n$'pagado', round(v_pagado_hoy, 2), 'gastos', round(v_gastos_hoy, 2)),$n$,
1);

-- ---------- Que quedó como se prometió ----------
do $$
begin
  if position('fn_claure_gastos_base' in pg_get_functiondef('retail.fn_asientos_claure(date, date, boolean, uuid[])'::regprocedure)) = 0 then
    raise exception 'ADR-0560: fn_asientos_claure no quedó reclasificando los gastos de CLAURE';
  end if;
  if position('fn_claure_gastos_base' in pg_get_functiondef('retail.fn_claure_cierre(uuid)'::regprocedure)) = 0 then
    raise exception 'ADR-0560: fn_claure_cierre no quedó restando los gastos de CLAURE';
  end if;
  if (select count(*) from retail.gasto_reparto_claure) < 6 then
    raise exception 'ADR-0560: falta el reparto de fábrica de los gastos por empresa';
  end if;
end $$;
