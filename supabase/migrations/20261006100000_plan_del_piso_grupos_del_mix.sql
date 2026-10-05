-- ============================================================================
-- 20261006100000_plan_del_piso_grupos_del_mix.sql — CAYLA V2 · ADR-0329 (mix del piso) · ADR-0328, actividad 12
-- Plan del piso, primera entrega (solo lectura), actividad 1: los GRUPOS del mix y a cuál pertenece cada categoría.
--
-- EL PROBLEMA PRIMERO. El mix del piso se reparte entre grupos de prendas con un rol («Polos, tops y blusas» destino,
-- «Abrigo y capas» de temporada…), no entre las 42 categorías sueltas: con 600 ganchos y 4 días de venta, repartir a nivel de
-- categoría da cifras de 2 prendas que no significan nada. Hoy la base solo sabe de `categorias.familia`, y «indumentaria» es
-- UNA familia con 18 categorías (ADR-0329, «Lo que queda abierto»): no sirve para asignar roles. Y el rol no puede vivir en el
-- NOMBRE de la categoría, que se renombra (Carteras/Bolsos pasó a «Bolsos y Carteras» sin cambiar de familia).
--
-- QUÉ HACE.
--   1. `retail.grupos_mix`: los 8 grupos (6 en el riel + 2 fuera de él: accesorios de impulso, y bolsos y calzado), cada uno
--      con su rol (destino, rutina, ocasional, estacional, conveniencia). Salen de la propuesta del 2026-10-04
--      (`docs/investigacion/2026-10-04-mix-inicial-del-piso.md`) y las decisiones de Felipe del ADR-0329.
--   2. `retail.categoria_grupo_mix`: a qué grupo va cada categoría (una categoría, un grupo). Se SIEMBRA con la propuesta
--      mía por prefijo, SIN confirmar (`confirmada_por` vacío = «Por revisar»): Felipe la revisa en pantalla, y cada categoría
--      que confirma o cambia queda con su firma. Una categoría que no tiene fila es «Sin grupo»: la base no inventa un grupo.
--   3. `fn_grupos_mix()` y `fn_categorias_grupo_mix()`: las dos lecturas (la puerta de todas las lecturas de retail).
--   4. `fijar_grupos_de_categorias(p_cambios)`: la escritura, solo del líder, TODO O NADA. Un solo guardado puede confirmar 40
--      categorías juntas (confirmar la propuesta de una vez) o cambiar una; si una falla, no se guarda ninguna.
--   5. El módulo «Plan del piso» (`plan_piso`) en `retail.modulos`: nace SIN rol (solo lo ve el líder, ADR-0161) y delegable
--      (ADR-0253). Sin `rol_modulos`: nunca se asigna un módulo a un rol desde una migración.
--
-- CONTRATOS (lo que promete cada pieza y lo que asume).
--   · fn_grupos_mix: PROMETE los grupos en el orden de la pantalla. No escribe. ASUME una sesión de retail (si no, 42501).
--   · fn_categorias_grupo_mix: PROMETE UNA fila por categoría ACTIVA, con su grupo (nulo = «Sin grupo»), si está confirmada y la
--     `version` que la escritura pide. No escribe. ASUME una sesión de retail.
--   · fijar_grupos_de_categorias: PROMETE dejar TODAS las categorías pedidas en su grupo y confirmadas, o no tocar nada. Si otra
--     persona cambió una de ellas después de que la leíste, rechaza todo con PT409 y dice cuál. Reenviar lo ya guardado es
--     inofensivo (cuenta como `sin_cambios`, sin escribir ni anotar). ASUME que la pantalla manda la `version` que leyó (0 si la
--     categoría todavía no tenía grupo).
--
-- ESTADOS QUE DEJAN DE SER POSIBLES (los niega el esquema, no la pantalla).
--   · Una categoría en dos grupos: `categoria_id` es la llave primaria.
--   · Un grupo con un rol inventado: `rol` solo admite los cinco del ADR-0329.
--   · Una prenda de ropa asignada a un grupo de FUERA del riel (un vestido en «accesorios»), o un cinturón en el riel
--     colgando entre los jeans: un disparador compara la familia de la categoría con `grupos_mix.en_riel` (la misma lista que
--     `FAMILIAS_FUERA_DEL_RIEL` de `lib/capacidad-piso.ts`).
--   · «Confirmada» sin firma o con firma sin fecha: `confirmada_por` y `confirmada_en` van juntas o ninguna.
--   · Un cambio sin firma ni historial: RLS encendido SIN políticas y `revoke`; el único camino es la función.
--   · Dos líderes que se pisan: el segundo recibe PT409 en vez de sobrescribir en silencio (ADR-0193).
--
-- POR QUÉ TABLAS PROPIAS Y NO UNA COLUMNA EN `categorias` (NI EL ROL EN `familias`).
--   DECIDÍ: `grupos_mix` (el grupo y su rol) y `categoria_grupo_mix` (la pertenencia), con llave hacia `categorias`.
--   DESCARTÉ: (a) `alter table categorias add column grupo_mix` — `categorias` la lee cada pantalla y el `alter` pide un candado
--     exclusivo que espera a todas las lecturas (el deadlock del 24-sep, ADR-0195); además cualquier persona con el módulo
--     Categorías podría cambiar el grupo sin firma ni historial. (b) Partir `familias` en subfamilias: la familia decide de qué
--     lado del riel va una prenda y se usa en otros lados (`capacidad-piso.ts`); meterle además el rol mezclaría dos cosas
--     que cambian por razones distintas. (c) El rol en el nombre de la categoría o seis grupos fijos en el código: una
--     categoría que un líder cree sin deploy quedaría fuera, y cada cambio de grupo pediría un deploy.
--   SE ROMPE SI: una categoría cambia de familia (de «indumentaria» a otra) con grupo ya asignado: el disparador solo mira al
--     escribir en esta tabla, así que la fila vieja queda incoherente hasta que alguien la vuelva a fijar (la pantalla la
--     marca «por revisar» solo si no está confirmada; no hay hoy un caso, y cambiar la familia de una categoría con historial no
--     se hace); o producción tiene un prefijo distinto al de la siembra (la categoría queda «Sin grupo», visible, nunca mal puesta).
--
-- POR QUÉ LA ESCRITURA ES UN LOTE Y NO UNA CATEGORÍA A LA VEZ.
--   DECIDÍ: una sola función que recibe una lista `[{categoria_id, grupo_clave, version}]` y la aplica en una transacción.
--   DESCARTÉ: una función por categoría, porque confirmar la propuesta de 42 categorías serían 42 llamadas: si la 30.ª falla
--     (un candado de versión, la red), quedaría la mitad confirmada y la persona sin saber cuál. Es la unidad todo-o-nada.
--   SE ROMPE SI: se mandan más de 200 elementos (la función lo rechaza: no hay 200 categorías en CAYLA) o el mismo
--     `categoria_id` dos veces en el lote (también rechazado).
--
-- QUIÉN PUEDE. Leer: cualquier cuenta de retail (es un catálogo de pertenencias, sin cifras de ventas ni de costo). Escribir:
-- SOLO EL LÍDER (`fn_es_lider()`), y va a la lista «siempre solo del líder» de `lib/modulos.ts`: qué categoría va a qué grupo es
-- una decisión de Felipe sobre cómo opera CAYLA (ADR-0329, decisión 4). Quien reciba el módulo ve la pantalla y la propuesta.
--
-- CAÍDA EXTERNA. No toca nada de afuera. Si esta migración no está pegada, la web de Plan del piso no existe todavía y nada
-- más cambia.
--
-- CÓMO SE PEGA EN PRODUCCIÓN. Sola, en el SQL Editor, tal cual (ya trae `retail.` y su `set search_path`), a cualquier hora y
-- ANTES de publicar la web (con la web nueva y sin esto el menú no muestra «Plan del piso» ni al líder). Crea tablas, un
-- `insert` en el catálogo de módulos, dos disparadores (`create or replace trigger`, nunca `drop trigger`), funciones, `revoke`
-- y `grant`: sin políticas y sin `alter` de tablas en uso (CLAUDE.md, «Políticas y deadlocks»). Con `lock_timeout` de 3 s. Re-ejecutable:
-- la siembra no pisa una categoría que Felipe ya confirmó ni una que ya cambió de grupo.
-- VERIFICACIÓN después de pegar (solo lectura; tiene que dar esto):
--   select g.nombre, g.rol, count(a.*) filter (where a.confirmada_por is null) as por_revisar, count(a.*) as categorias
--     from retail.grupos_mix g left join retail.categoria_grupo_mix a on a.grupo_clave = g.clave group by g.orden, g.nombre, g.rol order by g.orden;
--   → Polos, tops y blusas 3 · Jeans 1 · Pantalones, faldas y shorts 3 · Vestidos, conjuntos y enterizos 3 · Bodys, corsets y
--     lencería 2 · Abrigo y capas 6 · Accesorios de impulso y caja 14 · Bolsos y calzado 10 (42 en total, todas «por revisar»).
--   select count(*) from retail.categorias c where c.activo and not exists (select 1 from retail.categoria_grupo_mix a where a.categoria_id = c.id);
--   → 0 (si da más de 0, esa categoría tiene otro prefijo en producción: se asigna a mano desde la pantalla).
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
  if to_regprocedure('retail.fn_tiene_acceso_retail()') is null
     or to_regprocedure('retail.fn_actor_persona_id(boolean)') is null
     or to_regprocedure('retail.fn_es_lider()') is null then
    raise exception 'Faltan fn_tiene_acceso_retail(), fn_actor_persona_id(boolean) o fn_es_lider(): la base está atrasada respecto de main.';
  end if;
  if to_regclass('retail.modulos') is null then
    raise exception 'Falta retail.modulos: pega antes 20260923030000_roles_por_modulo.sql.';
  end if;
end $$;

-- ---------- 1. Los grupos y su rol ----------
create table if not exists retail.grupos_mix (
  clave   text primary key,
  nombre  text not null,
  -- Los cinco roles de ADR-0329 (decisión 4). El rol vive en el GRUPO: «Jeans» es destino, «Pantalones, faldas y shorts» es rutina.
  rol     text not null,
  -- true = cuelga en el riel (cuenta contra las 600 / 1800 / 180 de `capacidad_piso`); false = junto a la caja, en repisa o en
  -- ganchos: se mide como % de la venta, no del piso (ADR-0329, act. 2026-10-04, punto 6).
  en_riel boolean not null,
  orden   integer not null,
  constraint grupos_mix_clave_formato check (clave ~ '^[a-z_]+$'),
  constraint grupos_mix_nombre_no_vacio check (length(btrim(nombre)) > 0),
  constraint grupos_mix_rol_valido check (rol in ('destino', 'rutina', 'ocasional', 'estacional', 'conveniencia')),
  constraint grupos_mix_orden_unico unique (orden)
);

comment on table retail.grupos_mix is
  'ADR-0329: los grupos entre los que se reparte el mix del piso (8: 6 en el riel y 2 fuera de él), cada uno con su rol (destino, rutina, ocasional, estacional, conveniencia). Catálogo: sin pantalla para editarlo; un grupo nuevo entra por migración. Se lee con fn_grupos_mix.';
comment on column retail.grupos_mix.rol is
  'destino | rutina | ocasional | estacional | conveniencia (ADR-0329, decisión 4). Es una hipótesis que se valida con datos propios, sede por sede (decisión 9), no un hecho.';
comment on column retail.grupos_mix.en_riel is
  'true = cuelga en el riel y cuenta contra capacidad_piso; false = va aparte (junto a la caja, repisa o ganchos) y se mide como % de la venta.';

alter table retail.grupos_mix enable row level security;
revoke all on retail.grupos_mix from public, anon, authenticated;

-- Los 8 grupos (la propuesta del 2026-10-04). Re-pegar no pisa un grupo que ya existe.
insert into retail.grupos_mix (clave, nombre, rol, en_riel, orden) values
  ('polos_tops_blusas',        'Polos, tops y blusas',             'destino',      true,  10),
  ('jeans',                    'Jeans',                            'destino',      true,  20),
  ('pantalones_faldas_shorts', 'Pantalones, faldas y shorts',      'rutina',       true,  30),
  ('vestidos_conjuntos',       'Vestidos, conjuntos y enterizos',  'ocasional',    true,  40),
  ('bodys_corsets_lenceria',   'Bodys, corsets y lencería',        'ocasional',    true,  50),
  ('abrigo_y_capas',           'Abrigo y capas',                   'estacional',   true,  60),
  ('accesorios_de_impulso',    'Accesorios de impulso y caja',     'conveniencia', false, 70),
  ('bolsos_y_calzado',         'Bolsos y calzado',                 'ocasional',    false, 80)
on conflict (clave) do nothing;

-- ---------- 2. A qué grupo pertenece cada categoría ----------
create table if not exists retail.categoria_grupo_mix (
  categoria_id    uuid primary key references retail.categorias (id),
  grupo_clave     text not null references retail.grupos_mix (clave),
  -- Quién revisó y confirmó que esta categoría va en este grupo. Vacío = «Por revisar»: la siembra es una PROPUESTA, no una
  -- decisión de Felipe (ADR-0329, decisión 4: el mix lo decide él).
  confirmada_por  uuid,
  confirmada_en   timestamptz,
  version         integer not null default 1,
  actualizado_por uuid,
  actualizado_en  timestamptz not null default now(),
  constraint categoria_grupo_mix_firma_completa check ((confirmada_por is null) = (confirmada_en is null))
);

comment on table retail.categoria_grupo_mix is
  'ADR-0329: a qué grupo del mix pertenece cada categoría (una categoría, un grupo). Se siembra con la propuesta por prefijo, sin confirmar; el líder la revisa en Plan del piso. Una categoría sin fila es «Sin grupo». Se lee con fn_categorias_grupo_mix y se cambia con fijar_grupos_de_categorias (solo el líder, con firma e historial); nadie la lee ni la escribe directo.';
comment on column retail.categoria_grupo_mix.confirmada_por is
  'La persona que confirmó el grupo. Vacío = la siembra de la propuesta, todavía «por revisar».';
comment on column retail.categoria_grupo_mix.version is
  'ADR-0193: sube en cada escritura (disparador categoria_grupo_mix_version_bu, fn_subir_version). fijar_grupos_de_categorias la recibe por categoría y rechaza todo el lote con PT409 si otra persona la cambió.';

-- Un vestido no cuelga entre los accesorios de la caja, ni un cinturón entre los jeans. En la base, no en la pantalla.
-- La lista es la de FAMILIAS_FUERA_DEL_RIEL (apps/web/lib/capacidad-piso.ts); `plan-piso-grupos.test.ts` comprueba que coincidan.
create or replace function retail.fn_categoria_grupo_mix_coherente() returns trigger
language plpgsql security definer set search_path = retail, public, extensions as $fn$
declare
  v_familia text;
  v_en_riel boolean;
  v_fuera_del_riel boolean;
begin
  select c.familia into v_familia from retail.categorias c where c.id = new.categoria_id;
  select g.en_riel into v_en_riel from retail.grupos_mix g where g.clave = new.grupo_clave;
  -- Una familia que no es de las de afuera (o una categoría sin familia) cuenta en el riel, como en la web: la ropa nunca se
  -- esconde como si fuera un accesorio.
  v_fuera_del_riel := coalesce(v_familia in ('calzado', 'accesorios', 'bisuteria', 'belleza', 'papeleria'), false);
  if v_fuera_del_riel = v_en_riel then
    raise exception 'Esta categoría % en el riel y el grupo elegido % en el riel: no pueden ir juntos.',
      case when v_fuera_del_riel then 'no cuelga' else 'cuelga' end, case when v_en_riel then 'va' else 'no va' end
      using errcode = '23514', hint = 'grupo_incoherente_con_familia';
  end if;
  return new;
end $fn$;

create or replace trigger categoria_grupo_mix_coherente before insert or update of categoria_id, grupo_clave on retail.categoria_grupo_mix
  for each row execute function retail.fn_categoria_grupo_mix_coherente();
create or replace trigger categoria_grupo_mix_version_bu before update on retail.categoria_grupo_mix
  for each row execute function retail.fn_subir_version();

-- RLS encendido y SIN políticas: solo las funciones `security definer` la leen y la escriben (ADR-0195: cada `create policy` toma
-- en exclusiva las tablas de `auth` y `storage`).
alter table retail.categoria_grupo_mix enable row level security;
revoke all on retail.categoria_grupo_mix from public, anon, authenticated;

-- La siembra: la propuesta por PREFIJO (la llave estable de una categoría; el nombre se renombra). Sin confirmar. No pisa una
-- categoría que ya tenga fila (re-pegar no deshace lo que Felipe confirmó).
insert into retail.categoria_grupo_mix (categoria_id, grupo_clave)
select c.id, m.grupo_clave
  from retail.categorias c
  join (values
    ('CMS', 'polos_tops_blusas'), ('POL', 'polos_tops_blusas'), ('TOP', 'polos_tops_blusas'),
    ('JEA', 'jeans'),
    ('PAN', 'pantalones_faldas_shorts'), ('FAL', 'pantalones_faldas_shorts'), ('SHO', 'pantalones_faldas_shorts'),
    ('VES', 'vestidos_conjuntos'), ('CON', 'vestidos_conjuntos'), ('ENT', 'vestidos_conjuntos'),
    ('BOD', 'bodys_corsets_lenceria'), ('LEN', 'bodys_corsets_lenceria'),
    ('CAS', 'abrigo_y_capas'), ('CHA', 'abrigo_y_capas'), ('ABR', 'abrigo_y_capas'), ('BLZ', 'abrigo_y_capas'),
    ('CMP', 'abrigo_y_capas'), ('SUD', 'abrigo_y_capas'),
    ('CIN', 'accesorios_de_impulso'), ('GOR', 'accesorios_de_impulso'), ('LSO', 'accesorios_de_impulso'),
    ('BUF', 'accesorios_de_impulso'), ('REL', 'accesorios_de_impulso'), ('ANL', 'accesorios_de_impulso'),
    ('ARE', 'accesorios_de_impulso'), ('COL', 'accesorios_de_impulso'), ('PUL', 'accesorios_de_impulso'),
    ('MAQ', 'accesorios_de_impulso'), ('LAP', 'accesorios_de_impulso'), ('UTC', 'accesorios_de_impulso'),
    ('LIB', 'accesorios_de_impulso'), ('UOF', 'accesorios_de_impulso'),
    ('CAR', 'bolsos_y_calzado'), ('MOC', 'bolsos_y_calzado'), ('RIN', 'bolsos_y_calzado'),
    ('BAI', 'bolsos_y_calzado'), ('BOT', 'bolsos_y_calzado'), ('BOI', 'bolsos_y_calzado'), ('MSN', 'bolsos_y_calzado'),
    ('SAN', 'bolsos_y_calzado'), ('ZAP', 'bolsos_y_calzado'), ('ZFO', 'bolsos_y_calzado')
  ) as m(prefijo, grupo_clave) on m.prefijo = c.prefijo
 where c.activo
on conflict (categoria_id) do nothing;

-- ---------- 3. Las lecturas ----------
create or replace function retail.fn_grupos_mix()
returns table (clave text, nombre text, rol text, en_riel boolean, orden integer)
language plpgsql stable security definer
set search_path = retail, public, extensions
as $fn$
begin
  -- La puerta de todas las lecturas de retail (ADR-0289). Sin ella, un error y no cero filas: «no tienes acceso» no puede
  -- parecer «no hay grupos».
  if not retail.fn_tiene_acceso_retail() then
    raise exception 'No tienes acceso a retail.' using errcode = '42501';
  end if;
  return query
    select g.clave, g.nombre, g.rol, g.en_riel, g.orden
      from retail.grupos_mix g
     order by g.orden;
end $fn$;

comment on function retail.fn_grupos_mix() is
  'ADR-0329: los grupos del mix del piso con su rol y si cuelgan en el riel, en el orden de la pantalla. Para cualquier cuenta de retail (fn_tiene_acceso_retail); si no, 42501.';

create or replace function retail.fn_categorias_grupo_mix()
returns table (categoria_id uuid, categoria text, prefijo text, familia text, grupo_clave text, confirmada boolean,
               confirmada_en timestamptz, version integer)
language plpgsql stable security definer
set search_path = retail, public, extensions
as $fn$
begin
  if not retail.fn_tiene_acceso_retail() then
    raise exception 'No tienes acceso a retail.' using errcode = '42501';
  end if;
  -- UNA fila por categoría ACTIVA: la que no tiene grupo sale con `grupo_clave` nulo («Sin grupo»), nunca se esconde.
  return query
    select c.id, c.nombre, c.prefijo, c.familia, a.grupo_clave, a.confirmada_por is not null, a.confirmada_en, coalesce(a.version, 0)
      from retail.categorias c
      left join retail.categoria_grupo_mix a on a.categoria_id = c.id
     where c.activo
     order by c.familia nulls last, c.nombre;
end $fn$;

comment on function retail.fn_categorias_grupo_mix() is
  'ADR-0329: una fila por categoría activa con su grupo del mix (grupo_clave nulo = «Sin grupo»), si el líder ya la confirmó y la version que fijar_grupos_de_categorias pide (0 si no tiene grupo). Para cualquier cuenta de retail (fn_tiene_acceso_retail); si no, 42501.';

-- ---------- 4. La escritura (solo el líder, todo o nada, con firma e historial) ----------
create or replace function retail.fijar_grupos_de_categorias(p_cambios jsonb)
returns jsonb
language plpgsql security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_item jsonb;
  v_cat_id uuid;
  v_grupo text;
  v_version integer;
  v_cat retail.categorias;
  v_antes retail.categoria_grupo_mix;
  v_actor uuid;
  v_cambiadas integer := 0;
  v_confirmadas integer := 0;
  v_sin_cambios integer := 0;
  v_detalle jsonb := '[]'::jsonb;
  v_vistas uuid[] := '{}';
begin
  -- El permiso es de la CUENTA (ADR-0161), antes que nada.
  if not retail.fn_es_lider() then
    raise exception 'Solo el líder decide a qué grupo del plan del piso va cada categoría.' using errcode = '42501', hint = 'grupos_mix_solo_lider';
  end if;
  if p_cambios is null or jsonb_typeof(p_cambios) <> 'array' or jsonb_array_length(p_cambios) = 0 then
    raise exception 'No hay categorías que guardar.' using errcode = '22023', hint = 'grupos_mix_lote_vacio';
  end if;
  if jsonb_array_length(p_cambios) > 200 then
    raise exception 'Son demasiadas categorías en un solo guardado (máximo 200).' using errcode = '22023', hint = 'grupos_mix_lote_grande';
  end if;

  -- Uno a la vez: la tabla es chica y los guardados rarísimos, así que un solo candado para todo el lote basta.
  perform pg_advisory_xact_lock(hashtextextended('categoria_grupo_mix', 0));

  for v_item in select e from jsonb_array_elements(p_cambios) as t(e) loop
    begin
      v_cat_id := (v_item ->> 'categoria_id')::uuid;
      v_version := (v_item ->> 'version')::integer;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'Una de las categorías llegó mal escrita. Vuelve a abrir la pantalla.' using errcode = '22023', hint = 'grupos_mix_elemento_invalido';
    end;
    v_grupo := v_item ->> 'grupo_clave';
    if v_cat_id is null or v_grupo is null or v_version is null or v_version < 0 then
      raise exception 'Cada categoría necesita su grupo y la versión que leíste (0 si todavía no tenía grupo).'
        using errcode = '22023', hint = 'grupos_mix_elemento_invalido';
    end if;
    if v_cat_id = any (v_vistas) then
      raise exception 'La misma categoría llegó dos veces en el guardado.' using errcode = '22023', hint = 'grupos_mix_categoria_repetida';
    end if;
    v_vistas := v_vistas || v_cat_id;

    select c.* into v_cat from retail.categorias c where c.id = v_cat_id and c.activo;
    if v_cat.id is null then
      raise exception 'Una de las categorías ya no existe o está desactivada. Vuelve a abrir la pantalla.'
        using errcode = '22023', hint = 'grupos_mix_categoria_inexistente';
    end if;
    if not exists (select 1 from retail.grupos_mix g where g.clave = v_grupo) then
      raise exception 'El grupo "%" no existe.', v_grupo using errcode = '22023', hint = 'grupos_mix_grupo_inexistente';
    end if;

    select a.* into v_antes from retail.categoria_grupo_mix a where a.categoria_id = v_cat_id;

    -- Ya está así y confirmada (el mismo guardado reenviado tras un corte, o dos personas que pidieron lo mismo): no se escribe
    -- ni se anota. Va antes del control de versión a propósito: un reintento llega con la versión vieja, y eso no es un choque.
    if v_antes.categoria_id is not null and v_antes.grupo_clave = v_grupo and v_antes.confirmada_por is not null then
      v_sin_cambios := v_sin_cambios + 1;
      continue;
    end if;

    -- ¿Otra persona la cambió después de que la leíste? (ADR-0193: PT409, que la web ya traduce.) Se rechaza TODO el lote.
    if coalesce(v_antes.version, 0) <> v_version then
      raise exception 'Otra persona cambió el grupo de "%" mientras tenías la pantalla abierta: ahora está en "%". Revisa y vuelve a guardar.',
        v_cat.nombre, coalesce((select g.nombre from retail.grupos_mix g where g.clave = v_antes.grupo_clave), 'ningún grupo')
        using errcode = 'PT409', hint = 'version_cambiada';
    end if;

    -- La firma se pide recién al primer cambio real: comprobar algo ya guardado no necesita a nadie de turno.
    if v_actor is null then
      v_actor := retail.fn_actor_persona_id(true);
      if v_actor is null then
        raise exception 'Elige quién hace esta operación.' using errcode = '42501', hint = 'responsable_requerido';
      end if;
    end if;

    if v_antes.categoria_id is null then
      insert into retail.categoria_grupo_mix (categoria_id, grupo_clave, confirmada_por, confirmada_en, actualizado_por, actualizado_en)
      values (v_cat_id, v_grupo, v_actor, now(), v_actor, now());
      v_cambiadas := v_cambiadas + 1;
    else
      update retail.categoria_grupo_mix a
         set grupo_clave = v_grupo, confirmada_por = v_actor, confirmada_en = now(), actualizado_por = v_actor, actualizado_en = now()
       where a.categoria_id = v_cat_id;
      if v_antes.grupo_clave = v_grupo then v_confirmadas := v_confirmadas + 1; else v_cambiadas := v_cambiadas + 1; end if;
    end if;

    v_detalle := v_detalle || jsonb_build_object(
      'categoria_id', v_cat_id, 'categoria', v_cat.nombre,
      'antes', v_antes.grupo_clave, 'antes_confirmada', v_antes.confirmada_por is not null, 'despues', v_grupo);
  end loop;

  if jsonb_array_length(v_detalle) > 0 then
    insert into retail.configuracion_historial (que, detalle, hecho_por)
    values ('grupo_mix', jsonb_build_object('cambios', v_detalle), v_actor);
  end if;

  return jsonb_build_object('cambiadas', v_cambiadas, 'confirmadas', v_confirmadas, 'sin_cambios', v_sin_cambios);
end $fn$;

comment on function retail.fijar_grupos_de_categorias(jsonb) is
  'ADR-0329: asigna categorías a grupos del mix y las deja confirmadas, todo o nada. p_cambios = [{categoria_id, grupo_clave, version}] (version = la de fn_categorias_grupo_mix; 0 si no tenía grupo). Solo el líder; firma el responsable (fn_actor_persona_id(true)); antes y después en configuracion_historial (que = grupo_mix). Si otra persona cambió una de ellas, PT409 y no se guarda ninguna. Lo ya guardado y confirmado cuenta como sin_cambios. Devuelve {cambiadas, confirmadas, sin_cambios}.';

-- ---------- 5. El módulo (nace sin rol: solo lo ve el líder hasta que él lo da) ----------
insert into retail.modulos (clave, grupo, nombre, incluye, orden, solo_lider, delegable) values
  ('plan_piso', 'Inventario', 'Plan del piso', 'Ver la propuesta de cuánto lugar tiene cada grupo de prendas en el piso de su tienda y contra qué se compara', 118, false, true)
on conflict (clave) do nothing;

-- ---------- 6. Permisos ----------
revoke all on function retail.fn_categoria_grupo_mix_coherente() from public, anon, authenticated;
revoke all on function retail.fn_grupos_mix() from public, anon;
revoke all on function retail.fn_categorias_grupo_mix() from public, anon;
revoke all on function retail.fijar_grupos_de_categorias(jsonb) from public, anon;
grant execute on function retail.fn_grupos_mix() to authenticated;
grant execute on function retail.fn_categorias_grupo_mix() to authenticated;
grant execute on function retail.fijar_grupos_de_categorias(jsonb) to authenticated;

reset lock_timeout;
