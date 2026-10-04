-- ============================================================================
-- 20261005103000_capacidad_del_piso_por_sede.sql — CAYLA V2 · ADR-0329 (capacidad del piso) · ADR-0328, actividad 6
-- Cuántas prendas caben colgadas en el piso de cada sede: m² de sala × prendas por m². Una tabla propia, una lectura y
-- una escritura solo del líder.
--
-- EL PROBLEMA PRIMERO. Existencias dice «138 colgadas en el piso» y nadie sabe si eso es mucho o poco: en TRU, Felipe contó
-- 600 a 750 prendas colgadas en 20 m², así que 138 es un piso medio vacío, y 583 es un piso casi lleno. Sin un tope, el
-- número grande de la cabecera (ADR-0331) no dice nada, y el plan del piso que viene (el mix por categoría, actividad 12)
-- no tiene contra qué repartir: ADR-0329 lo dejó escrito como estado imposible, «un plan sin total de sede: la tabla de
-- totales va primero, y nada se planea sin ella». La base no sabía ni los m² de cada sala.
--
-- QUÉ HACE.
--   1. `retail.capacidad_piso`: una fila por sede con `m2_sala`, `densidad` (prendas por m²) y la `capacidad` que sale de
--      multiplicarlas (columna calculada por la base: nadie la escribe). `contada_el` dice cuándo se contaron las prendas
--      del piso de esa sede; vacía = el 30 por m² es prestado de TRU y la cifra es PROVISIONAL.
--   2. Siembra (ADR-0329, decisión 3 y su actualización 11): TRU 20 m² × 30 = 600, contada el 2026-09-30 (el conteo de
--      Felipe); AQP 60 m² × 30 = 1800, provisional hasta contarla; LIM (stand) 6 m² × 30 = 180, provisional (ADR-0328 y
--      ADR-0329 la listan en «Contar AQP y LIM»).
--   3. `fn_capacidad_piso(p_ubicacion_id)` → {m2_sala, densidad, capacidad, provisional, contada_el, version}: cero filas si
--      la sede no tiene capacidad (Taller, almacén, una tienda sin medir). Puerta: la de todas las lecturas de retail
--      (`fn_tiene_acceso_retail`, persona activa o terminal); sin ella, 42501.
--   4. `fijar_capacidad_piso(sede, m², densidad, contada_el, version_esperada)`: solo el líder; firma el responsable
--      (`fn_actor_persona_id(true)`) y deja el antes y el después en `configuracion_historial` (como la hora de cierre y las
--      metas). Sin pantalla todavía: el lugar para editarla es el Plan del piso (actividad 12).
--
-- CONTRATOS (lo que promete cada pieza y lo que asume).
--   · fn_capacidad_piso: PROMETE la capacidad vigente de UNA sede, o ninguna fila si no tiene. No escribe. ASUME una sesión
--     de retail (si no, 42501, nunca una fila vacía que parezca «sin capacidad»).
--   · fijar_capacidad_piso: PROMETE dejar la sede con esos números, o no tocar nada. Si otra persona la cambió después de
--     que la leíste, rechaza con PT409 (ADR-0193) y dice cómo quedó. Reintentar lo mismo es inofensivo: si ya está así,
--     devuelve `sin_cambios` sin escribir ni anotar. ASUME que la pantalla manda la `version` que leyó (0 si la sede no
--     tenía capacidad).
--
-- ESTADO QUE DEJA DE SER POSIBLE (lo niega el esquema, no la pantalla).
--   · Una capacidad que no es m² × densidad: la calcula la base (`generated always`).
--   · m² o densidad en 0, negativos o absurdos (una tecla de más: 300 por m², 2.000 m²), o una capacidad menor que 1 prenda.
--   · Dos capacidades para la misma sede (llave primaria).
--   · Una capacidad para el Taller o el almacén: no tienen piso de venta (disparador).
--   · Un cambio sin firma ni historial: RLS encendido SIN políticas y `revoke`; el único camino es la función.
--   · Dos líderes que se pisan: el segundo recibe PT409 en vez de sobrescribir en silencio.
--
-- POR QUÉ UNA TABLA PROPIA Y NO COLUMNAS EN `ubicaciones` (la hora de cierre sí fue columna).
--   DECIDÍ: tabla `capacidad_piso` con llave = la sede.
--   DESCARTÉ: `alter table ubicaciones add column …`, porque (1) `ubicaciones` la lee cada pantalla: el `alter` pide un
--     candado exclusivo que espera a todas las lecturas y frena a las nuevas mientras espera (el deadlock del 24-sep de
--     ADR-0195 fue justo con un `alter table ubicaciones`); crear una tabla con llave hacia `ubicaciones` solo toma un
--     candado que convive con las lecturas y con las ventas; (2) `ubicaciones` tiene la política `ubicaciones_write_lider`:
--     un líder podría cambiar la capacidad directo por la API, sin firma ni historial; (3) el mix de la actividad 12 tendrá
--     una llave hacia esta tabla, y así «un plan sin total de sede» queda imposible por esquema; (4) la identidad de la sede
--     y el plan del piso son dos cosas que cambian por razones distintas.
--   SE ROMPE SI: alguien necesita la capacidad en una consulta de `ubicaciones` sin pasar por la función (es un `join`
--     más), o se crea una tienda nueva: nace sin capacidad y sin nota hasta que el líder la fije.
--
-- POR QUÉ `version` Y NO UNA MARCA DE REINTENTO (p_token).
--   DECIDÍ: control optimista con `version` (ADR-0193: el mismo `fn_subir_version()` de productos, roles y clientas, y el
--     PT409 que la web ya traduce en `lib/error-escritura.ts`), más «si ya está así, no hago nada».
--   DESCARTÉ: `p_token` con su tabla de intentos (como en los movimientos de stock), porque fijar un valor ya es idempotente
--     por sí mismo, y lo único que una marca agrega —que un reintento viejo no pise un cambio más nuevo— también lo cubre
--     la versión: el reintento llega con la versión vieja y valores distintos de los que hay, y se rechaza.
--   SE ROMPE SI: una pantalla manda siempre `version` 0 o la relee justo antes de guardar: el candado no protege nada.
--
-- CONCURRENCIA. Un candado consultivo por sede (`pg_advisory_xact_lock`) pone en fila dos guardados de la misma sede,
-- también la primera vez, cuando todavía no hay fila que bloquear. El segundo despierta, ve otra versión y recibe PT409.
--
-- CAÍDA EXTERNA. No toca nada de afuera. Si esta migración no está pegada o la lectura falla, la web no pone la nota
-- «de 600» y Existencias sigue igual (`lib/capacidad-piso-servidor.ts` nunca lanza).
--
-- CÓMO SE PEGA EN PRODUCCIÓN. UNA sola parte, tal cual, en el SQL Editor (trae `set search_path`, prefijo `retail.` y
-- `lock_timeout`). No altera tablas en uso, no crea políticas ni `drop trigger`: no toma las tablas de `auth`/`storage`
-- (ADR-0195). Crear la llave hacia `ubicaciones` toma un candado breve que solo espera a quien ESTÉ CAMBIANDO una sede
-- (casi nunca); si dice «lock timeout», se vuelve a pegar. Re-ejecutable: la siembra no pisa una capacidad ya fijada.
-- PEGAR ANTES DE FUSIONAR la web (aunque la web sin esto no se rompe: solo no muestra la nota).
-- La siembra busca las tiendas por su nombre, como `20260922224300_nota_de_venta.sql` (producción escribe «Tienda TRU» y la
-- base local «Tienda Trujillo»): el nombre es único (`ubicaciones_nombre_key`). Cómo se verifica después:
--   select u.nombre, c.m2_sala, c.densidad, c.capacidad, c.contada_el is null as provisional
--     from retail.capacidad_piso c join retail.ubicaciones u on u.id = c.ubicacion_id order by u.nombre;
--   → Tienda AQP 60 × 30 = 1800 provisional · Tienda LIM 6 × 30 = 180 provisional · Tienda TRU 20 × 30 = 600 contada.
--   Si falta una fila, esa tienda tiene otro nombre: se agrega con un `insert` igual al de la siembra, con su `id`.
--
-- SE ROMPE SI: AQP (60 m², más pasillo) tiene bastante menos densidad que TRU y se le deja el 30 por m² como si fuera
-- medido (por eso sale «provisional» hasta que el líder la cuente); si una tienda pasa a tener más de 150 prendas por m²
-- (repisas de doblado muy densas: hay que subir el tope); o si se crea una tienda nueva y nadie fija su capacidad (no se
-- rompe nada: no hay nota).
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- Lo que esta migración usa y tiene que existir antes (todas ya en producción).
do $$
begin
  if to_regprocedure('retail.fn_subir_version()') is null then
    raise exception 'Falta retail.fn_subir_version(): pega antes 20260924160000_edicion_simultanea_con_version.sql.';
  end if;
  if to_regclass('retail.configuracion_historial') is null then
    raise exception 'Falta retail.configuracion_historial: pega antes 20260924210000_configuracion_meta_y_fondo_por_campana.sql.';
  end if;
  if to_regprocedure('retail.fn_tiene_acceso_retail()') is null or to_regprocedure('retail.fn_actor_persona_id(boolean)') is null then
    raise exception 'Faltan fn_tiene_acceso_retail() o fn_actor_persona_id(boolean): la base está atrasada respecto de main.';
  end if;
end $$;

-- ---------- 1. La tabla de totales del piso ----------
create table if not exists retail.capacidad_piso (
  ubicacion_id    uuid primary key references retail.ubicaciones (id),
  -- m² de la SALA (lo que ve el cliente), sin almacén ni probadores.
  m2_sala         numeric(7,2) not null,
  -- Prendas colgadas por m² de sala (ADR-0329: 30 de arranque, el extremo bajo del conteo de TRU).
  densidad        numeric(6,2) not null,
  -- Lo que caben, en prendas: nunca media prenda.
  capacidad       integer generated always as (floor(m2_sala * densidad)::integer) stored,
  -- Cuándo se contaron las prendas del piso de ESTA sede. Vacía = densidad prestada: la capacidad es provisional.
  contada_el      date,
  version         integer not null default 1,
  actualizado_por uuid,
  actualizado_en  timestamptz not null default now(),
  -- Topes contra una tecla de más, no contra la realidad: la tienda más grande de CAYLA tiene 60 m² y TRU cuelga 30 a 37,5
  -- prendas por m².
  constraint capacidad_piso_m2_sala_rango check (m2_sala > 0 and m2_sala <= 2000),
  constraint capacidad_piso_densidad_rango check (densidad > 0 and densidad <= 150),
  constraint capacidad_piso_cabe_al_menos_una check (m2_sala * densidad >= 1),
  -- El ERP empezó en 2026: un conteo de antes es un error de tipeo.
  constraint capacidad_piso_contada_desde_2026 check (contada_el is null or contada_el >= date '2026-01-01')
);

comment on table retail.capacidad_piso is
  'ADR-0329: cuántas prendas caben colgadas en el piso de cada tienda = m² de sala × prendas por m². La tabla de totales del plan del piso: el mix por categoría (actividad 12 de ADR-0328) se reparte contra ella. Solo tiendas. Se lee con fn_capacidad_piso y se cambia con fijar_capacidad_piso (solo el líder, con firma e historial); nadie la lee ni la escribe directo.';
comment on column retail.capacidad_piso.capacidad is
  'floor(m2_sala × densidad): la calcula la base, nadie la escribe. Solo prendas colgadas: los accesorios (bisutería, cinturones, gorros, lentes, bolsos, calzado) van fuera del riel y no cuentan (ADR-0329, act. 2026-10-04 punto 6).';
comment on column retail.capacidad_piso.contada_el is
  'Cuándo se contaron las prendas del piso de esta sede. Null = la densidad es prestada (30 por m², de TRU) y la capacidad se muestra como provisional.';
comment on column retail.capacidad_piso.version is
  'ADR-0193: sube en cada escritura (disparador capacidad_piso_version_bu, fn_subir_version). fijar_capacidad_piso la recibe como p_version_esperada y rechaza con PT409 si otra persona la cambió.';

-- Solo tiendas: el Taller y el almacén no tienen piso de venta. En la base, no en la pantalla.
create or replace function retail.fn_capacidad_piso_solo_tiendas() returns trigger
language plpgsql security definer set search_path = retail, public, extensions as $fn$
begin
  if (select u.tipo from retail.ubicaciones u where u.id = new.ubicacion_id) is distinct from 'tienda' then
    raise exception 'La capacidad del piso es solo de tiendas: el Taller y el almacén no tienen piso de venta.'
      using errcode = '23514', hint = 'capacidad_solo_tiendas';
  end if;
  return new;
end $fn$;

create or replace trigger capacidad_piso_solo_tiendas before insert or update of ubicacion_id on retail.capacidad_piso
  for each row execute function retail.fn_capacidad_piso_solo_tiendas();
create or replace trigger capacidad_piso_version_bu before update on retail.capacidad_piso
  for each row execute function retail.fn_subir_version();

-- RLS encendido y SIN políticas: solo las funciones `security definer` la leen y la escriben (ni el líder la toca directo).
-- Sin políticas a propósito: en Supabase cada `create policy` toma en exclusiva las tablas de `auth` y `storage` (ADR-0195).
alter table retail.capacidad_piso enable row level security;
revoke all on retail.capacidad_piso from public, anon, authenticated;

-- ---------- 2. La siembra de ADR-0329 ----------
-- Por nombre: producción escribe «Tienda TRU», la base local «Tienda Trujillo». Lo que ya tenga capacidad no se toca
-- (re-pegar no deshace lo que el líder fijó después).
insert into retail.capacidad_piso (ubicacion_id, m2_sala, densidad, contada_el)
select u.id, s.m2_sala, 30, s.contada_el
  from retail.ubicaciones u
  join (values (array['tienda tru', 'tienda trujillo'], 20::numeric, date '2026-09-30'),
               (array['tienda aqp', 'tienda arequipa'], 60::numeric, null::date),
               (array['tienda lim', 'tienda lima'], 6::numeric, null::date)) as s(nombres, m2_sala, contada_el)
    on lower(u.nombre) = any (s.nombres)
 where u.tipo = 'tienda'
on conflict (ubicacion_id) do nothing;

-- ---------- 3. La lectura ----------
create or replace function retail.fn_capacidad_piso(p_ubicacion_id uuid)
returns table (m2_sala numeric, densidad numeric, capacidad integer, provisional boolean, contada_el date, version integer)
language plpgsql stable security definer
set search_path = retail, public, extensions
as $fn$
begin
  -- La puerta de todas las lecturas de retail (ADR-0289): persona activa con colaborador activo, o terminal activa. Sin ella,
  -- un error y no cero filas: «no tienes acceso» no puede parecer «esta sede no tiene capacidad».
  if not retail.fn_tiene_acceso_retail() then
    raise exception 'No tienes acceso a retail.' using errcode = '42501';
  end if;
  return query
    select c.m2_sala, c.densidad, c.capacidad, c.contada_el is null, c.contada_el, c.version
      from retail.capacidad_piso c
     where c.ubicacion_id = p_ubicacion_id;
end $fn$;

comment on function retail.fn_capacidad_piso(uuid) is
  'ADR-0329: la capacidad del piso de una sede (m² de sala × prendas por m²), si la tiene; cero filas si no (Taller, almacén, tienda sin medir). provisional = la sede no contó sus prendas (contada_el vacía). version: la que fijar_capacidad_piso pide como p_version_esperada. Para cualquier cuenta de retail (fn_tiene_acceso_retail); si no, 42501.';

-- ---------- 4. La escritura (solo el líder, con firma e historial) ----------
create or replace function retail.fijar_capacidad_piso(
  p_ubicacion_id uuid,
  p_m2_sala numeric,
  p_densidad numeric,
  p_contada_el date,
  p_version_esperada integer
)
returns jsonb
language plpgsql security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_m2 numeric := round(p_m2_sala, 2);
  v_densidad numeric := round(p_densidad, 2);
  v_tipo text;
  v_nombre text;
  v_antes retail.capacidad_piso;
  v_despues retail.capacidad_piso;
  v_actor uuid;
begin
  -- El permiso es de la CUENTA (ADR-0161), antes que nada.
  if not retail.fn_es_lider() then
    raise exception 'Solo el líder cambia la capacidad del piso de una sede.' using errcode = '42501', hint = 'capacidad_solo_lider';
  end if;
  if p_version_esperada is null or p_version_esperada < 0 then
    raise exception 'Falta la versión que leíste de la capacidad (0 si la sede todavía no tenía). Vuelve a abrir la pantalla.'
      using errcode = '22023', hint = 'capacidad_sin_version';
  end if;
  if v_m2 is null or v_m2 <= 0 or v_m2 > 2000 then
    raise exception 'Los m² de la sala tienen que ser más de 0 y hasta 2000.' using errcode = '22023', hint = 'capacidad_m2_fuera_de_rango';
  end if;
  if v_densidad is null or v_densidad <= 0 or v_densidad > 150 then
    raise exception 'Las prendas por m² tienen que ser más de 0 y hasta 150.' using errcode = '22023', hint = 'capacidad_densidad_fuera_de_rango';
  end if;
  if v_m2 * v_densidad < 1 then
    raise exception 'Con esos números no cabe ni una prenda: revisa los m² y las prendas por m².' using errcode = '22023', hint = 'capacidad_cero';
  end if;
  if p_contada_el is not null and (p_contada_el > retail.fn_hoy_lima() or p_contada_el < date '2026-01-01') then
    raise exception 'La fecha del conteo tiene que ser de 2026 en adelante y no puede ser futura.' using errcode = '22023', hint = 'capacidad_fecha_conteo';
  end if;

  select u.tipo, u.nombre into v_tipo, v_nombre from retail.ubicaciones u where u.id = p_ubicacion_id and u.activo;
  if v_tipo is null then
    raise exception 'Esa sede no existe o está desactivada.' using errcode = '22023', hint = 'capacidad_sede_inexistente';
  end if;
  if v_tipo <> 'tienda' then
    raise exception 'La capacidad del piso es solo de tiendas: el Taller y el almacén no tienen piso de venta.'
      using errcode = '22023', hint = 'capacidad_solo_tiendas';
  end if;

  -- Uno a la vez por sede, también la primera vez (cuando todavía no hay fila que bloquear).
  perform pg_advisory_xact_lock(hashtextextended('capacidad_piso:' || p_ubicacion_id::text, 0));
  select c.* into v_antes from retail.capacidad_piso c where c.ubicacion_id = p_ubicacion_id;

  -- Ya está así (el mismo guardado reenviado tras un corte, o dos personas que pidieron lo mismo): no se escribe ni se
  -- anota nada. Va antes del responsable a propósito: comprobar algo ya guardado no necesita a nadie de turno.
  if v_antes.ubicacion_id is not null
     and v_antes.m2_sala = v_m2 and v_antes.densidad = v_densidad and v_antes.contada_el is not distinct from p_contada_el then
    return jsonb_build_object('version', v_antes.version, 'capacidad', v_antes.capacidad,
                              'provisional', v_antes.contada_el is null, 'sin_cambios', true);
  end if;

  -- ¿Otra persona la cambió después de que la leíste? (ADR-0193: PT409, que la web ya traduce.)
  if coalesce(v_antes.version, 0) <> p_version_esperada then
    if v_antes.ubicacion_id is null then
      raise exception 'La capacidad de % cambió mientras la tenías abierta. Vuelve a abrir la pantalla.', v_nombre
        using errcode = 'PT409', hint = 'version_cambiada';
    end if;
    raise exception 'Otra persona cambió la capacidad de % mientras la tenías abierta: ahora caben % prendas (% m² × % por m²). Revisa y vuelve a guardar.',
      v_nombre, v_antes.capacidad, trim_scale(v_antes.m2_sala), trim_scale(v_antes.densidad)
      using errcode = 'PT409', hint = 'version_cambiada';
  end if;

  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación.' using errcode = '42501', hint = 'responsable_requerido';
  end if;

  if v_antes.ubicacion_id is null then
    insert into retail.capacidad_piso as c (ubicacion_id, m2_sala, densidad, contada_el, actualizado_por, actualizado_en)
    values (p_ubicacion_id, v_m2, v_densidad, p_contada_el, v_actor, now())
    returning c.* into v_despues;
  else
    update retail.capacidad_piso c
       set m2_sala = v_m2, densidad = v_densidad, contada_el = p_contada_el, actualizado_por = v_actor, actualizado_en = now()
     where c.ubicacion_id = p_ubicacion_id
    returning c.* into v_despues;
  end if;

  insert into retail.configuracion_historial (que, detalle, hecho_por)
  values ('capacidad_piso', jsonb_build_object(
            'ubicacion_id', p_ubicacion_id,
            'antes', case when v_antes.ubicacion_id is null then null else
                       jsonb_build_object('m2_sala', v_antes.m2_sala, 'densidad', v_antes.densidad,
                                          'capacidad', v_antes.capacidad, 'contada_el', v_antes.contada_el) end,
            'despues', jsonb_build_object('m2_sala', v_despues.m2_sala, 'densidad', v_despues.densidad,
                                          'capacidad', v_despues.capacidad, 'contada_el', v_despues.contada_el)),
          v_actor);

  return jsonb_build_object('version', v_despues.version, 'capacidad', v_despues.capacidad,
                            'provisional', v_despues.contada_el is null, 'sin_cambios', false);
end $fn$;

comment on function retail.fijar_capacidad_piso(uuid, numeric, numeric, date, integer) is
  'ADR-0329: fija los m² de sala, las prendas por m² y la fecha del conteo (null = provisional) del piso de una tienda. Solo el líder; firma el responsable (fn_actor_persona_id(true)); antes y después en configuracion_historial (que = capacidad_piso). p_version_esperada = la version que dio fn_capacidad_piso (0 si no tenía): si otra persona la cambió, PT409. Si ya está así, devuelve sin_cambios sin escribir. Devuelve {version, capacidad, provisional, sin_cambios}.';

-- ---------- 5. Permisos ----------
revoke all on function retail.fn_capacidad_piso_solo_tiendas() from public, anon, authenticated;
revoke all on function retail.fn_capacidad_piso(uuid) from public, anon;
revoke all on function retail.fijar_capacidad_piso(uuid, numeric, numeric, date, integer) from public, anon;
grant execute on function retail.fn_capacidad_piso(uuid) to authenticated;
grant execute on function retail.fijar_capacidad_piso(uuid, numeric, numeric, date, integer) to authenticated;

reset lock_timeout;
