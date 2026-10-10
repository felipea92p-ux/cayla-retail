-- ============================================================================
-- 20261006110000_plan_del_piso_foto_del_espacio.sql — CAYLA V2 · ADR-0329 (mix del piso) · ADR-0328, actividad 12
-- Plan del piso, primera entrega (solo lectura), actividad 3: la FOTO del espacio del piso, por sede y categoría.
--
-- EL PROBLEMA PRIMERO. Todo el plan del piso descansa en una cifra que nadie midió en ropa: cuánto más vende una categoría por tener
-- más lugar (la elasticidad de espacio). La que circula (0,17) es de supermercado, y la investigación del 2026-10-05 no encontró
-- ninguna medida en moda: con ella, reasignar el piso vale entre 0,5 % y 3 % de ventas, y con otra elasticidad valdría 8 % o 19 %.
-- La única forma de medirla es tener, semana a semana, dos columnas: lo vendido (que la base ya guarda en `ventas`) y el espacio que
-- tuvo cada categoría (que NO se guarda: `stock` es una foto del instante y se sobrescribe con cada movimiento). Lo que no se
-- fotografió hoy no se puede reconstruir mañana con ninguna cuenta, y cada semana sin foto es una semana de historia perdida.
--
-- QUÉ HACE.
--   1. `retail.espacio_piso`: una fila por (sede, fecha, categoría) con las prendas libres en el piso, cuántos modelos distintos
--      cuelgan, y si la sede ya había cuadrado su piso ese día (sin cuadre, la cifra del sistema no es confiable: TRU decía 138
--      colgadas con 600 a 750 reales, y una foto así contamina cualquier cuenta).
--   2. `fn_registrar_espacio_piso()`: toma la foto de HOY de todas las tiendas con piso de venta. Es del SERVIDOR (la llama el
--      cron de Vercel con la llave de servicio): ni `anon` ni `authenticated` pueden ejecutarla. Idempotente: llamarla dos veces el
--      mismo día no duplica ni cambia nada (queda la primera foto del día).
--   3. `fn_espacio_piso(p_ubicacion_id, p_desde)`: la lectura de las fotos de UNA sede, para la pestaña «Historia» de Plan del piso.
--
-- CONTRATOS (lo que promete cada pieza y lo que asume).
--   · fn_registrar_espacio_piso: PROMETE, por cada tienda activa con piso de venta y cada categoría activa, UNA fila del día de hoy en
--     Lima, o ninguna cambia (todo o nada, una sola instrucción). Lo libre en el piso es EXACTAMENTE `fn_existencias_base` (ADR-0270, la
--     fórmula de stock que usa todo el ERP): la foto y la pantalla de Existencias nunca discrepan. Una categoría sin nada colgado
--     queda con 0 (no se omite: «se acabó» y «no se fotografió» son cosas distintas). Devuelve {fecha, sedes, filas, ya_registradas}.
--     ASUME que la llama el servidor (sin sesión de persona) y que el reloj de Lima la fecha (`fn_hoy_lima`).
--   · fn_espacio_piso: PROMETE las fotos de una sede desde `p_desde` (por defecto 26 semanas), ordenadas. ASUME una sesión de retail que
--     opera esa sede (la del líder: todas; la de una integrante o una terminal: la suya); sin ella, 42501, nunca cero filas.
--
-- ESTADOS QUE DEJAN DE SER POSIBLES (los niega el esquema, no el cron).
--   · Dos fotos del mismo día para la misma sede y categoría: llave primaria (sede, fecha, categoría).
--   · Prendas negativas, o más modelos que prendas (un modelo que cuelga tiene al menos una prenda): `check`.
--   · Una foto de antes del ERP (2026): `check`. Un día que todavía no llegó no se puede negar con un `check` (`fn_hoy_lima` no es inmutable):
--     lo niega la función, que solo fotografía HOY.
--   · Una foto de una sede o de una categoría que no existen: llaves hacia `ubicaciones` y `categorias`. Que sea de una TIENDA con piso lo garantiza
--     la función (es el único camino de escritura), no el esquema.
--   · Que cualquiera edite o borre la historia: RLS encendido SIN políticas y `revoke`; el único camino es la función.
--
-- POR QUÉ UNA FILA POR DÍA Y NO POR SEMANA.
--   DECIDÍ: la llave es la FECHA de la foto, no «la semana». Hoy el cron la toma una vez por semana (lunes, 3:00 de Lima), como pidió Felipe.
--   DESCARTÉ: una columna `semana` (el lunes), porque fijaría la cadencia en el esquema: pasar a una foto diaria —que mide mejor el espacio
--     promedio de la semana, cuando el piso se repone a diario— obligaría a migrar la tabla. Con la fecha como llave, cambiar de semanal a
--     diario es una línea en `vercel.json`; en volumen, diario son 3 sedes × 42 categorías × 365 = unas 46 mil filas al año.
--   SE ROMPE SI: se toman fotos de otro día distinto al de hoy (la función no lo permite) o la hora del cron cae después de la medianoche de
--     Lima (08:00 UTC es 03:00 de Lima, el mismo día).
--
-- POR QUÉ UNA FUNCIÓN DEL SERVIDOR Y NO UN TRABAJO DE LA BASE (`pg_cron`) NI «AL ABRIR LA PANTALLA».
--   DECIDÍ: cron de Vercel → ruta `/api/inventario/espacio-piso` → esta función, con la llave de servicio (el mismo camino que la conservación
--     del club, `fn_club_anonimizar_inactivas`; `CRON_SECRET` ya existe en producción).
--   DESCARTÉ: (a) `pg_cron`: este repo no lo usa en ningún lado y habría que habilitar la extensión en Supabase; (b) llamarla al abrir Plan
--     del piso: depende de que alguien abra la pantalla y escribe desde una lectura (un GET no debería escribir).
--   SE ROMPE SI: el cron de Vercel falla (la ruta lo registra con `capturarError`): esa semana queda sin foto, y la pestaña Historia lo
--     muestra como un hueco, no como un cero.
--
-- CAÍDA EXTERNA. No toca nada de afuera. Si esta migración no está pegada, la ruta del cron responde 500 y se anota en el log; si la lectura
-- falla, Plan del piso dice «no se pudo leer la historia» y las demás pestañas siguen en pie.
--
-- CÓMO SE PEGA EN PRODUCCIÓN. Sola, en el SQL Editor, tal cual (ya trae `retail.` y su `set search_path`), a cualquier hora, ANTES de publicar
-- la web (la ruta del cron llama a una función que tiene que existir). Crea una tabla, dos funciones, `revoke` y `grant`: sin políticas, sin
-- `alter` de tablas en uso y sin `drop trigger` (CLAUDE.md, «Políticas y deadlocks»). Con `lock_timeout` de 3 s. Re-ejecutable.
-- VERIFICACIÓN después de pegar (solo lectura):
--   select proname, has_function_privilege('authenticated', oid, 'execute') as authenticated, has_function_privilege('service_role', oid, 'execute') as servicio
--     from pg_proc where pronamespace = 'retail'::regnamespace and proname in ('fn_registrar_espacio_piso', 'fn_espacio_piso') order by proname;
--   → fn_espacio_piso: true · false; fn_registrar_espacio_piso: false · true.
--   select count(*) from retail.espacio_piso;   → 0 (la primera foto la toma el cron del lunes; no hay nada que sembrar).
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- Lo que esta migración usa y tiene que existir antes (todas ya en producción).
do $$
begin
  if to_regprocedure('retail.fn_existencias_base(uuid, uuid[])') is null then
    raise exception 'Falta retail.fn_existencias_base(uuid, uuid[]): la base está atrasada respecto de main.';
  end if;
  if to_regprocedure('retail.fn_hoy_lima()') is null
     or to_regprocedure('retail.fn_tiene_acceso_retail()') is null
     or to_regprocedure('retail.fn_puede_operar_ubicacion(uuid)') is null then
    raise exception 'Faltan fn_hoy_lima(), fn_tiene_acceso_retail() o fn_puede_operar_ubicacion(uuid): la base está atrasada respecto de main.';
  end if;
end $$;

-- ---------- 1. La foto ----------
create table if not exists retail.espacio_piso (
  ubicacion_id  uuid not null references retail.ubicaciones (id),
  fecha         date not null,
  categoria_id  uuid not null references retail.categorias (id),
  -- Prendas libres en el piso de venta (neto de apartadas y sin Cuarentena): `fn_existencias_base.piso_libre`, la cifra de ADR-0270.
  prendas       integer not null,
  -- Cuántos modelos (productos) distintos tienen al menos una prenda libre en el piso: el surtido, que cuenta aparte del volumen.
  modelos       integer not null,
  -- ¿La sede ya había cuadrado su piso (`retail.cuadres_piso`) cuando se tomó la foto? Sin cuadre, «lo que cuelga» es lo que dice el
  -- sistema y no lo que hay: una foto así no sirve para medir nada, y se guarda igual para poder decirlo.
  piso_cuadrado boolean not null,
  tomada_en     timestamptz not null default now(),
  primary key (ubicacion_id, fecha, categoria_id),
  constraint espacio_piso_prendas_no_negativas check (prendas >= 0),
  constraint espacio_piso_modelos_caben check (modelos >= 0 and modelos <= prendas),
  -- El ERP empezó en 2026: una foto de antes es un error de tipeo.
  constraint espacio_piso_desde_2026 check (fecha >= date '2026-01-01')
);

comment on table retail.espacio_piso is
  'ADR-0329: la foto del espacio del piso, una fila por (tienda, día, categoría): prendas libres en el piso, modelos distintos y si la sede ya había cuadrado su piso. La historia que permitirá medir cuánto rinde el espacio en ropa (nadie lo ha medido: la elasticidad que circula es de supermercado). Solo la escribe fn_registrar_espacio_piso (cron de Vercel, llave de servicio) y se lee con fn_espacio_piso; nadie la toca directo.';
comment on column retail.espacio_piso.prendas is
  'Prendas libres en el piso de venta, la misma cifra que fn_existencias_base.piso_libre (ADR-0270). 0 = no cuelga nada de esa categoría ese día (distinto de no haber fotografiado).';
comment on column retail.espacio_piso.piso_cuadrado is
  'La sede ya había cuadrado su piso (retail.cuadres_piso) cuando se tomó la foto. false = la cifra es lo que dice el sistema, no lo que hay; no sirve para medir.';

-- RLS encendido y SIN políticas: solo las funciones `security definer` la leen y la escriben (ADR-0195: cada `create policy` toma en
-- exclusiva las tablas de `auth` y `storage`).
alter table retail.espacio_piso enable row level security;
revoke all on retail.espacio_piso from public, anon, authenticated;

-- ---------- 2. Tomar la foto de hoy (solo el servidor) ----------
create or replace function retail.fn_registrar_espacio_piso()
returns jsonb
language plpgsql security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_hoy date := retail.fn_hoy_lima();
  v_sedes integer;
  v_antes bigint;
  v_filas bigint;
  v_cuadradas uuid[] := '{}';
begin
  -- Las sedes que ya cuadraron su piso al menos una vez (`retail.cuadres_piso`). Mientras esa tabla no exista en la base, ninguna se cuadró
  -- (como en fn_piso_plan_lectura: no saber cuenta como no cuadrado). Va dentro de un `if`: PL/pgSQL planifica cada instrucción recién al
  -- ejecutarla, así que esta función se crea y corre igual con o sin la tabla; una referencia suelta dentro del `insert` fallaría al
  -- planificarlo aunque la rama no se tomara.
  if to_regclass('retail.cuadres_piso') is not null then
    v_cuadradas := array(select distinct q.ubicacion_id from retail.cuadres_piso q);
  end if;

  -- Las tiendas activas con piso de venta (las que separan piso y almacén, como lo decide Existencias): el Taller y una tienda sin piso
  -- no tienen nada que fotografiar.
  select count(*) into v_sedes
    from retail.ubicaciones u
   where u.tipo = 'tienda' and u.activo
     and exists (select 1 from retail.sububicaciones sb where sb.ubicacion_id = u.id and sb.tipo = 'piso_venta');

  select count(*) into v_antes from retail.espacio_piso where fecha = v_hoy;

  -- UNA sola instrucción: todas las sedes y categorías de hoy, o ninguna. `on conflict do nothing`: si el cron se reintenta o corre dos
  -- veces el mismo día, queda la primera foto y nada se duplica ni se pisa (no hay dos fotos «buenas» para un mismo día).
  with piso as materialized (
    -- Lo libre en el piso por sede y categoría: `fn_existencias_base`, LA fórmula de stock (ADR-0270). Una vez, para todas las sedes.
    select e.ubicacion_id, p.categoria_id,
           sum(greatest(e.piso_libre, 0)) as prendas,
           count(distinct e.producto_id) filter (where e.piso_libre > 0) as modelos
      from retail.fn_existencias_base(null, null) e
      join retail.productos p on p.id = e.producto_id
     group by e.ubicacion_id, p.categoria_id
  )
  insert into retail.espacio_piso (ubicacion_id, fecha, categoria_id, prendas, modelos, piso_cuadrado)
  select s.id, v_hoy, c.id, coalesce(pi.prendas, 0)::integer, coalesce(pi.modelos, 0)::integer, s.id = any (v_cuadradas)
    from retail.ubicaciones s
    cross join retail.categorias c
    left join piso pi on pi.ubicacion_id = s.id and pi.categoria_id = c.id
   where s.tipo = 'tienda' and s.activo and c.activo
     and exists (select 1 from retail.sububicaciones sb where sb.ubicacion_id = s.id and sb.tipo = 'piso_venta')
  on conflict (ubicacion_id, fecha, categoria_id) do nothing;

  select count(*) into v_filas from retail.espacio_piso where fecha = v_hoy;
  return jsonb_build_object('fecha', v_hoy, 'sedes', v_sedes, 'filas', v_filas, 'ya_registradas', v_antes);
end $fn$;

comment on function retail.fn_registrar_espacio_piso() is
  'ADR-0329: toma la foto de HOY (día de Lima) del espacio del piso de cada tienda con piso de venta: por categoría activa, prendas libres (fn_existencias_base.piso_libre, ADR-0270), modelos distintos y si la sede ya cuadró su piso. Todo o nada, idempotente por día (queda la primera foto). Solo el servidor (cron de Vercel, llave de servicio): ni anon ni authenticated. Devuelve {fecha, sedes, filas, ya_registradas}.';

-- ---------- 3. La lectura de las fotos de una sede ----------
create or replace function retail.fn_espacio_piso(p_ubicacion_id uuid, p_desde date default null)
returns table (fecha date, categoria_id uuid, prendas integer, modelos integer, piso_cuadrado boolean)
language plpgsql stable security definer
set search_path = retail, public, extensions
as $fn$
begin
  -- Dos puertas (como fn_piso_plan_lectura): la de todas las lecturas de retail y la de la SEDE. Sin cualquiera de ellas, un error y no cero
  -- filas: «no tienes acceso» no puede parecer «todavía no hay fotos».
  if not retail.fn_tiene_acceso_retail() or p_ubicacion_id is null or not retail.fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes acceso al espacio de esa sede.' using errcode = '42501';
  end if;
  return query
    select e.fecha, e.categoria_id, e.prendas, e.modelos, e.piso_cuadrado
      from retail.espacio_piso e
     where e.ubicacion_id = p_ubicacion_id
       and e.fecha >= coalesce(p_desde, retail.fn_hoy_lima() - 182)
     order by e.fecha desc, e.categoria_id;
end $fn$;

comment on function retail.fn_espacio_piso(uuid, date) is
  'ADR-0329: las fotos del espacio del piso de UNA sede desde p_desde (por defecto 26 semanas), de la más reciente a la más antigua: fecha, categoría, prendas libres, modelos distintos y si la sede ya había cuadrado su piso. Para quien opera esa sede (el líder, todas); si no, 42501.';

-- ---------- 4. Permisos ----------
revoke all on function retail.fn_registrar_espacio_piso() from public, anon, authenticated;
grant execute on function retail.fn_registrar_espacio_piso() to service_role;
revoke all on function retail.fn_espacio_piso(uuid, date) from public, anon;
grant execute on function retail.fn_espacio_piso(uuid, date) to authenticated;

reset lock_timeout;
