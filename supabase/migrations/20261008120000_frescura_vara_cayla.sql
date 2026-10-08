-- ============================================================================
-- 20261008120000_frescura_vara_cayla.sql — CAYLA V2 · ADR-0208 «Frescura del piso», actualización 2026-10-07 (Felipe)
-- La vara de CAYLA pasa de referencia (solo a la vista del líder) a RESPALDO: una tabla con la curva de cada categoría hecha
-- con las tres tiendas juntas, llenada cada madrugada por el servidor, para que una categoría con pocas ventas en una tienda
-- se juzgue contra lo que vende CAYLA y no contra sus 3 ventas.
--
-- EL PROBLEMA PRIMERO. Frescura ubica cada prenda contra los cortes P50/P75/P90 de su categoría EN SU TIENDA, y los calcula
-- igual con 3 ventas que con 30. Verificado el 2026-10-07 con las reglas reales: con 3 capas vendidas en los días 1, 1 y 2 y
-- una colgada hace 10, P50 = 1 día y P75 = 2, y una capa de 4 días colgada salía «Se está quedando», lenta y «Por decidir»
-- («pruébala 7 días en otro lugar»). La decisión 6 del bloque 3 (2026-09-26) decía «contra su propia sede, siempre; CAYLA a la
-- vista»: la referencia de CAYLA ya se calculaba en la web (`referenciaCayla`), pero solo la veía el líder, en el detalle, y no
-- juzgaba. Felipe la revirtió el 2026-10-07: con menos de 10 ventas en la tienda y 10 o más en CAYLA, se juzga contra CAYLA y
-- se dice. Quien no es líder no puede leer las otras tiendas (`fn_frescura_sede` exige operar la sede), así que la curva de
-- CAYLA tiene que llegarle ya hecha: eso es esta tabla.
--
-- QUÉ HACE.
--   1. `retail.frescura_vara_cayla`: una fila por categoría con las OBSERVACIONES anónimas de la ventana que eligió la vara
--      (cada unidad con edad conocida de las tres tiendas: segundos colgada, si se vendió, cuántas; `[[s, 1|0, peso], …]`), cuántas
--      ventas y unidades, el nivel («Pocos datos» 1-9 · «Aceptable» 10-19 · «Sólido» 20+) y cuándo se calculó. Sin prenda, sin
--      tienda, sin dinero: no se puede saber de qué prenda ni de qué tienda es una unidad.
--   2. `retail.guardar_frescura_vara_cayla(p_filas jsonb)`: SOLO la llave de servicio (el cron); reemplaza la foto entera de una
--      vez (todo o nada) y borra la categoría que esta corrida no trajo. Con cero filas no toca nada: una corrida vacía no puede
--      dejar sin respaldo a nadie.
--   3. `retail.fn_frescura_vara_cayla()`: la lectura, para quien ve Frescura (el líder o el módulo en su rol); sin eso, la pista
--      `frescura_sin_permiso` de la familia.
--   4. `fn_frescura_sede` deja pasar a la llave de servicio: el cron la llama una vez por tienda, sin persona. Es la regla de
--      `20260924113817` (SUNAT): `auth.role() is not distinct from 'service_role'`, más `grant … to service_role`. Se hace con un
--      REEMPLAZO ANCLADO con guarda de md5 (el patrón de 20261004200050), no reescribiendo sus 386 líneas.
--
-- CONTRATOS.
--   · guardar_frescura_vara_cayla: PROMETE dejar la tabla EXACTAMENTE con las filas recibidas (las demás salen), o no tocar nada;
--     devuelve {filas, calculada_en}. ASUME filas con categoría existente y observaciones como lista. Dos corridas a la vez se
--     ponen en fila (candado consultivo).
--   · fn_frescura_vara_cayla: PROMETE todas las filas, con su fecha, a quien ve Frescura; a nadie más (error, nunca cero filas
--     que parezcan «sin respaldo»). No escribe.
--   · fn_frescura_sede: lo mismo que antes para las personas; además, la llave de servicio lee cualquier tienda.
--
-- ESTADO QUE DEJA DE SER POSIBLE (lo niega el esquema, no la pantalla).
--   · Dos varas para la misma categoría (llave primaria); una categoría que no existe (llave foránea).
--   · Una ventana que no es de la vara (30, 60, 90 o 120); más vendidas que unidades; un nivel inventado; observaciones que no
--     son una lista.
--   · Una escritura desde una pantalla o una cuenta: RLS encendido SIN políticas, `revoke` de la tabla, y la función de guardar
--     solo para `service_role`.
--
-- DECIDÍ: una tabla calculada por el cron de la web, con la misma receta de `referenciaCayla`, y guardada por una función solo
--   del servidor. DESCARTÉ: (a) una RPC `security definer` que lea las tres tiendas en vivo para cualquier cuenta con Frescura,
--   porque abre por API lo que `0012` y ADR-0240 cerraron (nadie lee otra sede); (b) calcular la curva en SQL, porque nace del
--   FIFO de cohortes de `inventario-exposicion.ts` (`historiaDeCohortes`) y habría dos fuentes de verdad de «cuántos días llevaba»;
--   (c) guardarla cuando el líder abre Frescura, porque ata el respaldo de las tiendas a que Felipe abra una pantalla.
--   SE ROMPE SI: el cron no corre 3 días: la web deja de usar la fila (`VIGENCIA_VARA_CAYLA_DIAS`) y vuelve a juzgar contra la
--   tienda, diciéndolo; si una categoría se vende MUY distinto en AQP y TRU, la vara de CAYLA la juzga con el ritmo de la tienda
--   que más vende (la curva junta unidades: AQP, con 60 m², manda) — se acepta hasta tener datos (ADR-0208, act. 2026-10-07).
--
-- CÓMO SE HACE EL PARCHE DE fn_frescura_sede: REEMPLAZO ANCLADO, CON GUARDA DE md5 (20261004200050). El cuerpo vivo tiene que ser
-- uno de estos cuatro (md5 de `prosrc`), si no, aborta sin tocar nada:
--   · a22655be615d72555032a7df98258876 — el de 20260929100000 (producción si el parche del cuadre, 20261004200050, no está pegado);
--   · e64a3742e5f06a2e18b9d7749b720b3d — después de 20261004200050;
--   · 2b9fde71c6e4ff7a55ca4f45e8a19935 — este archivo ya pegado, partiendo del primero (re-pegable);
--   · 6ac58e3c841a724dc1ae4853d805ccf0 — este archivo ya pegado, partiendo del segundo (re-pegable).
-- Los cuatro se calcularon fuera de la base sobre el texto de las migraciones (scratch, 2026-10-08): los dos «antes» coinciden con
-- los medidos en producción por 20261004200050, lo que valida el cálculo; al final se exige uno de los dos «después».
-- Pegar este archivo ANTES o DESPUÉS de 20261004200050 da lo mismo; si el cuadre se pega después de este, su guarda verá el md5
-- `6ac58e3c…`/`2b9fde71…` y abortará: entonces hay que regenerar aquel reemplazo (su ancla sigue intacta: solo cambia el md5).
--
-- CÓMO SE PEGA EN PRODUCCIÓN. UNA sola parte, tal cual, en el SQL Editor (trae `set search_path`, prefijo `retail.` y
-- `lock_timeout`). Crea una tabla nueva (candado breve sobre `categorias`, solo espera a quien ESTÉ CAMBIANDO una categoría), sin
-- políticas ni `drop trigger`: no toma las tablas de `auth`/`storage` (ADR-0195). El parche va por dentro de `execute`. Re-ejecutable.
-- PEGAR ANTES DE PUBLICAR la web: sin esto, el cron responde 500 y lo anota (`capturarError`), y Frescura sigue como hoy.
-- Cómo se verifica después:
--   select proname, md5(prosrc) from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'fn_frescura_sede';
--     → 2b9fde71c6e4ff7a55ca4f45e8a19935 o 6ac58e3c841a724dc1ae4853d805ccf0
--   select count(*), max(calculada_en) from retail.frescura_vara_cayla;   → 0 filas hasta la primera corrida del cron (3:20 de Lima)
-- Y en Vercel tiene que existir `CRON_SECRET` (ya lo usan los otros dos crons) y `SUPABASE_SERVICE_ROLE_KEY`.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- Lo que esta migración usa y tiene que existir antes.
do $$
begin
  if to_regprocedure('retail.fn_frescura_sede(uuid, integer)') is null then
    raise exception 'Falta retail.fn_frescura_sede(uuid, integer): pega antes las migraciones de Frescura (hasta 20260929100000).';
  end if;
  if to_regprocedure('retail.fn_ve_modulo(text)') is null or to_regprocedure('retail.fn_es_lider()') is null then
    raise exception 'Faltan fn_ve_modulo(text) o fn_es_lider(): la base está atrasada respecto de main.';
  end if;
  if to_regclass('retail.categorias') is null then
    raise exception 'Falta retail.categorias.';
  end if;
end $$;

-- ---------- 1. La tabla ----------
create table if not exists retail.frescura_vara_cayla (
  categoria_id   uuid primary key references retail.categorias (id),
  -- Cuándo la calculó el cron. La web no la usa pasados 3 días (VIGENCIA_VARA_CAYLA_DIAS).
  calculada_en   timestamptz not null,
  -- Cuántas tiendas entraron (normalmente 3).
  tiendas        integer not null,
  -- La ventana que eligió la vara: la más corta de 30/60/90/120 días con 20 ventas y los tres cortes, o la más larga.
  ventana_dias   integer not null,
  -- Unidades vendidas con edad conocida en esa ventana, y el total (vendidas + colgadas).
  vendidas       numeric(10,2) not null,
  unidades       numeric(10,2) not null,
  -- 'pocos_datos' (1-9), 'aceptable' (10-19), 'solido' (20+); null sin ventas.
  nivel          text,
  -- [[segundos colgada, vendida 1|0, peso], …]: anónimas, sin prenda ni tienda.
  observaciones  jsonb not null,
  constraint frescura_vara_cayla_tiendas check (tiendas >= 1),
  constraint frescura_vara_cayla_ventana check (ventana_dias in (30, 60, 90, 120)),
  constraint frescura_vara_cayla_cifras check (vendidas >= 0 and unidades >= vendidas),
  constraint frescura_vara_cayla_nivel check (nivel is null or nivel in ('pocos_datos', 'aceptable', 'solido')),
  constraint frescura_vara_cayla_observaciones_lista check (jsonb_typeof(observaciones) = 'array')
);

comment on table retail.frescura_vara_cayla is
  'ADR-0208 (act. 2026-10-07): la vara de CAYLA de Frescura del piso, una curva por categoría con las unidades de las tres tiendas juntas, calculada cada madrugada por el cron de la web (GET /api/inventario/frescura-vara-cayla) con la receta de referenciaCayla. Es un snapshot derivado del libro (movimientos): se reemplaza entero en cada corrida, no es historia. La web la usa como respaldo cuando una categoría tiene menos de 10 ventas en la tienda. Se escribe solo con guardar_frescura_vara_cayla (service_role) y se lee solo con fn_frescura_vara_cayla.';
comment on column retail.frescura_vara_cayla.observaciones is
  'Lista de [segundos colgada, vendida (1|0), peso]: cada unidad con edad conocida de la ventana, de las tres tiendas, sin decir cuál ni de qué prenda. La web rearma la curva de Kaplan-Meier con kaplanMeier().';

-- RLS encendido y SIN políticas: solo las funciones de abajo la tocan. Sin políticas a propósito: cada `create policy` toma en
-- exclusiva las tablas de `auth` y `storage` (ADR-0195).
alter table retail.frescura_vara_cayla enable row level security;
revoke all on retail.frescura_vara_cayla from public, anon, authenticated;

-- ---------- 2. La escritura (solo el servidor) ----------
create or replace function retail.guardar_frescura_vara_cayla(p_filas jsonb)
returns jsonb
language plpgsql security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_ahora timestamptz := now();
  v_n integer := 0;
  v_fila jsonb;
  v_categoria uuid;
  v_ids uuid[] := '{}';
begin
  -- Solo la llave de servicio (el cron). `is distinct from`: sin claims (psql directo) auth.role() es null y tiene que cerrar.
  if auth.role() is distinct from 'service_role' then
    raise exception 'Solo el servidor guarda la vara de CAYLA.' using errcode = '42501', hint = 'vara_cayla_solo_servidor';
  end if;
  if p_filas is null or jsonb_typeof(p_filas) <> 'array' then
    raise exception 'Las filas de la vara de CAYLA tienen que ser una lista.' using errcode = '22023', hint = 'vara_cayla_filas';
  end if;
  -- Una corrida vacía no puede dejar sin respaldo a nadie: no toca nada.
  if jsonb_array_length(p_filas) = 0 then
    return jsonb_build_object('filas', 0, 'calculada_en', null);
  end if;
  -- Dos corridas a la vez (un reintento de Vercel encima de la primera) se ponen en fila.
  perform pg_advisory_xact_lock(hashtextextended('frescura_vara_cayla', 0));

  for v_fila in select * from jsonb_array_elements(p_filas) loop
    v_categoria := nullif(v_fila ->> 'categoria_id', '')::uuid;
    if v_categoria is null or jsonb_typeof(v_fila -> 'observaciones') is distinct from 'array' then
      raise exception 'Una fila de la vara de CAYLA viene sin categoría o sin observaciones.' using errcode = '22023', hint = 'vara_cayla_fila';
    end if;
    insert into retail.frescura_vara_cayla as f (categoria_id, calculada_en, tiendas, ventana_dias, vendidas, unidades, nivel, observaciones)
    values (v_categoria, v_ahora, (v_fila ->> 'tiendas')::integer, (v_fila ->> 'ventana_dias')::integer,
            (v_fila ->> 'vendidas')::numeric, (v_fila ->> 'unidades')::numeric, v_fila ->> 'nivel', v_fila -> 'observaciones')
    on conflict (categoria_id) do update
      set calculada_en = excluded.calculada_en, tiendas = excluded.tiendas, ventana_dias = excluded.ventana_dias,
          vendidas = excluded.vendidas, unidades = excluded.unidades, nivel = excluded.nivel, observaciones = excluded.observaciones;
    v_ids := v_ids || v_categoria;
    v_n := v_n + 1;
  end loop;

  -- La categoría que esta corrida no trajo (ya no tiene unidades con edad conocida) sale. Por lo que trajo la corrida, no por la
  -- hora: `now()` no avanza dentro de una transacción y dos corridas en la misma dejarían la vieja. No es historia que se borra:
  -- es un snapshot derivado del libro, que sigue entero en `movimientos` (principio 4).
  delete from retail.frescura_vara_cayla f where not (f.categoria_id = any (v_ids));

  return jsonb_build_object('filas', v_n, 'calculada_en', v_ahora);
end $fn$;

comment on function retail.guardar_frescura_vara_cayla(jsonb) is
  'ADR-0208 (act. 2026-10-07): el cron de la web guarda la vara de CAYLA, una fila por categoría ({categoria_id, tiendas, ventana_dias, vendidas, unidades, nivel, observaciones}). Reemplaza la foto entera de una vez: lo que no viene, sale. Con cero filas no toca nada. Solo service_role; a cualquier cuenta, 42501.';

revoke all on function retail.guardar_frescura_vara_cayla(jsonb) from public, anon, authenticated;
grant execute on function retail.guardar_frescura_vara_cayla(jsonb) to service_role;

-- ---------- 3. La lectura (quien ve Frescura) ----------
create or replace function retail.fn_frescura_vara_cayla()
returns table (
  categoria_id uuid,
  calculada_en timestamptz,
  tiendas integer,
  ventana_dias integer,
  vendidas numeric,
  unidades numeric,
  nivel text,
  observaciones jsonb
)
language plpgsql stable security definer
set search_path = retail, public, extensions
as $fn$
begin
  -- El mismo candado de la familia (20260929100000): el líder, o quien tiene el módulo «Frescura del piso» en su rol. Sin sede: la
  -- vara es de CAYLA entera y es anónima. Un error y no cero filas: «no tienes acceso» no puede parecer «sin respaldo».
  if not (fn_es_lider() or fn_ve_modulo('frescura')) then
    raise exception 'Para ver la vara de CAYLA hace falta el módulo «Frescura del piso» en tu rol.' using hint = 'frescura_sin_permiso';
  end if;
  return query
    select f.categoria_id, f.calculada_en, f.tiendas, f.ventana_dias, f.vendidas, f.unidades, f.nivel, f.observaciones
      from retail.frescura_vara_cayla f
     order by f.categoria_id;
end $fn$;

comment on function retail.fn_frescura_vara_cayla() is
  'ADR-0208 (act. 2026-10-07): la vara de CAYLA de cada categoría (observaciones anónimas de las tres tiendas, cifras, nivel y cuándo se calculó), para quien ve Frescura del piso (líder o módulo en su rol); si no, la pista frescura_sin_permiso. La web la usa como respaldo cuando una categoría tiene menos de 10 ventas en la tienda, y solo si tiene 3 días o menos.';

revoke all on function retail.fn_frescura_vara_cayla() from public, anon;
grant execute on function retail.fn_frescura_vara_cayla() to authenticated;

-- ---------- 4. fn_frescura_sede deja pasar a la llave de servicio (reemplazo anclado con guarda de md5) ----------
create or replace function pg_temp.reemplazar_anclado(p_firma text, p_viejo text, p_nuevo text)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  -- Ya aplicado: el texto nuevo está (se mira primero: el texto nuevo contiene al viejo).
  if position(p_nuevo in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta migración: el ancla aparece % veces (se esperaba 1). Regenera el reemplazo desde su definición real.',
      p_firma, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

do $$
declare
  v_sede text := (select md5(p.prosrc) from pg_proc p where p.oid = to_regprocedure('retail.fn_frescura_sede(uuid, integer)'));
begin
  if v_sede is null or v_sede not in ('a22655be615d72555032a7df98258876', 'e64a3742e5f06a2e18b9d7749b720b3d',
                                       '2b9fde71c6e4ff7a55ca4f45e8a19935', '6ac58e3c841a724dc1ae4853d805ccf0') then
    raise exception 'fn_frescura_sede tiene otro cuerpo (md5 %): no es el de 20260929100000, ni el de 20261004200050, ni el de este archivo. Alguien la cambió en vivo: reescribe el reemplazo desde su definición real antes de pegar.',
      coalesce(v_sede, 'ninguno');
  end if;
end $$;

select pg_temp.reemplazar_anclado(
  'retail.fn_frescura_sede(uuid, integer)',
  $v$  if not (fn_puede_operar_ubicacion(p_ubicacion_id) and (fn_es_lider() or fn_ve_modulo('frescura'))) then$v$,
  $n$  -- La llave de servicio (el cron de la vara de CAYLA, ADR-0208 act. 2026-10-07) entra sin persona: `auth.role()` dice
  -- 'service_role'. Comparado con `is not distinct from`, como en 20260924113817: sin claims es null, y un `not (null or …)`
  -- no lanzaría.
  if not (auth.role() is not distinct from 'service_role' or (fn_puede_operar_ubicacion(p_ubicacion_id) and (fn_es_lider() or fn_ve_modulo('frescura')))) then$n$
);

-- Lo que quedó tiene que ser EXACTAMENTE uno de los dos cuerpos calculados: si no, se deshace todo (el SQL Editor corre el archivo
-- en una transacción).
do $$
declare
  v_sede text := (select md5(p.prosrc) from pg_proc p where p.oid = to_regprocedure('retail.fn_frescura_sede(uuid, integer)'));
begin
  if v_sede not in ('2b9fde71c6e4ff7a55ca4f45e8a19935', '6ac58e3c841a724dc1ae4853d805ccf0') then
    raise exception 'El reemplazo no dejó el cuerpo esperado de fn_frescura_sede (md5 %). No se aplicó nada.', v_sede;
  end if;
end $$;

-- Hasta hoy solo `authenticated` la ejecutaba; el cron entra con la llave de servicio.
grant execute on function retail.fn_frescura_sede(uuid, integer) to service_role;

notify pgrst, 'reload schema';

reset lock_timeout;
