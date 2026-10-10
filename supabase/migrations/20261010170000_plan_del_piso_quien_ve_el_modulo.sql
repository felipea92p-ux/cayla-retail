-- ============================================================================
-- 20261010170000_plan_del_piso_quien_ve_el_modulo.sql — CAYLA V2 · ADR-0352 (actualización 2026-10-10) · ADR-0161 / ADR-0306
-- Las tres lecturas del Plan del piso piden el módulo «Plan del piso», no solo ser de retail.
--
-- EL PROBLEMA PRIMERO. «Plan del piso» (`plan_piso`) se creó delegable: el líder decide a qué rol se lo da. Pero las tres lecturas de la
-- base (`fn_grupos_mix`, `fn_categorias_grupo_mix`, `fn_espacio_piso`) solo pedían la puerta de retail (`fn_tiene_acceso_retail`) y, la
-- última, la sede. Apagarle el módulo a un rol solo le escondía la pantalla: por la API seguía leyendo los grupos del mix y las fotos del
-- espacio. Era un estado que la base no negaba y la prueba de roles (`pnpm pruebas:roles-cobertura`) lo marcó: «el módulo plan_piso es
-- delegable y ninguna función de retail lo exige».
--
-- DECISIÓN (Felipe, 2026-10-10, entre «la base también exige el módulo», «dejarlas abiertas y anotarlo en SOLO_PANTALLA» y «solo líder por
-- ahora»): la base también exige el módulo. Regla de ADR-0161: quien ve un módulo hace todo lo que hay en él; quien no, no lo lee ni
-- llamando a la base directo. Hoy solo lo ve el líder (el módulo nace sin rol), así que el comportamiento de HOY no cambia para nadie.
--
-- QUÉ HACE. `create or replace` de las tres lecturas, con la MISMA firma y el MISMO cuerpo que en `20261006100000` y `20261006110000`,
-- más una puerta: `if not fn_ve_modulo('plan_piso') then 42501 (hint plan_piso_sin_modulo)`. Los permisos (`grant`) no se tocan: reemplazar
-- una función conserva sus privilegios. La escritura (`fijar_grupos_de_categorias`) sigue siendo SOLO del líder (`fn_es_lider`), y la foto
-- (`fn_registrar_espacio_piso`) solo del servidor: ninguna de las dos cambia.
--
-- CONTRATOS.
--   · fn_grupos_mix / fn_categorias_grupo_mix: PROMETEN los grupos (o la categoría con su grupo), o un 42501: «No tienes acceso a retail.» si
--     la cuenta es de afuera, o «necesitas el módulo Plan del piso» (hint `plan_piso_sin_modulo`) si es de retail y no lo ve. Nunca cero
--     filas que parezcan «no hay grupos». ASUMEN una sesión; el líder lo ve siempre, salvo que se lo oculte (`lider_modulos_ocultos`).
--   · fn_espacio_piso: lo mismo, y además la sede: quien opera esa sede (el líder, todas). Sede nula o ajena → 42501.
--
-- ESTADO QUE DEJA DE SER POSIBLE. Que una cuenta sin el módulo «Plan del piso» lea el plan por la API (PostgREST) o desde otra pantalla.
--
-- POR QUÉ NO SE EDITÓ LA MIGRACIÓN ANTERIOR. `20261006100000` ya está en producción (pegada el 2026-10-06): una migración aplicada no se
-- reescribe. Y `20261006110000` aún no estaba pegada, pero así las tres puertas quedan en UN lugar, que es lo que se audita.
--   DECIDÍ: una migración nueva con las tres lecturas.
--   DESCARTÉ: (a) anotar `plan_piso` en `SOLO_PANTALLA` de `roles_cobertura_modulos.mjs`: es la lista que «solo puede encogerse»
--     (devoluciones salió el 2026-10-09) y apagar el módulo seguiría sin apagar nada en la base; (b) marcar el módulo «solo líder por
--     ahora» (delegable = false): el líder no podría dárselo a nadie, contra lo que Felipe pidió (ADR-0352).
--   SE ROMPE SI: otro módulo necesita leer estos grupos o fotos (la columna «ocupa · meta» de Frescura): quien lo ve y no tiene «Plan del piso»
--     recibirá 42501. Esa pantalla trae su PROPIA función de lectura con su propio candado; no se relaja esta.
--
-- CÓMO SE PEGA EN PRODUCCIÓN. UNA sola parte, tal cual, en el SQL Editor, DESPUÉS de `20261006110000_plan_del_piso_foto_del_espacio.sql`
-- (si la foto aún no existe, la primera comprobación lo dice y no se aplica nada). Trae `set search_path`, prefijo `retail.` y
-- `lock_timeout`. No altera tablas, no crea políticas ni `drop trigger`: no toma las tablas de `auth`/`storage` (ADR-0195). Se puede pegar
-- dos veces. Cómo se verifica después (la primera consulta debe dar `t` en las tres):
--   select p.proname, pg_get_functiondef(p.oid) like '%fn_ve_modulo(''plan_piso'')%' as con_el_modulo
--     from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname in ('fn_grupos_mix', 'fn_categorias_grupo_mix', 'fn_espacio_piso');
--
-- CÓMO SE DESHACE. Volver a pegar las definiciones de esas tres funciones de `20261006100000` (las dos primeras) y `20261006110000` (la
-- tercera): son las mismas sin la puerta del módulo.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- Lo que esta migración usa y tiene que existir antes.
do $$
begin
  if to_regprocedure('retail.fn_grupos_mix()') is null or to_regprocedure('retail.fn_categorias_grupo_mix()') is null then
    raise exception 'Faltan fn_grupos_mix() o fn_categorias_grupo_mix(): pega antes 20261006100000_plan_del_piso_grupos_del_mix.sql.';
  end if;
  if to_regprocedure('retail.fn_espacio_piso(uuid, date)') is null then
    raise exception 'Falta retail.fn_espacio_piso(uuid, date): pega antes 20261006110000_plan_del_piso_foto_del_espacio.sql.';
  end if;
  if to_regprocedure('retail.fn_ve_modulo(text)') is null or to_regprocedure('retail.fn_tiene_acceso_retail()') is null
     or to_regprocedure('retail.fn_puede_operar_ubicacion(uuid)') is null or to_regprocedure('retail.fn_hoy_lima()') is null then
    raise exception 'Faltan fn_ve_modulo(text), fn_tiene_acceso_retail(), fn_puede_operar_ubicacion(uuid) o fn_hoy_lima(): la base está atrasada respecto de main.';
  end if;
  if not exists (select 1 from retail.modulos where clave = 'plan_piso') then
    raise exception 'Falta el módulo plan_piso en retail.modulos: pega antes 20261006100000_plan_del_piso_grupos_del_mix.sql.';
  end if;
end $$;

-- ---------- 1. Los grupos del mix ----------
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
  -- La del módulo (ADR-0161): apagarlo a un rol lo apaga también aquí, no solo en la pantalla.
  if not retail.fn_ve_modulo('plan_piso') then
    raise exception 'Para ver el plan del piso necesitas el módulo Plan del piso.' using errcode = '42501', hint = 'plan_piso_sin_modulo';
  end if;
  return query
    select g.clave, g.nombre, g.rol, g.en_riel, g.orden
      from retail.grupos_mix g
     order by g.orden;
end $fn$;

comment on function retail.fn_grupos_mix() is
  'ADR-0329: los grupos del mix del piso con su rol y si cuelgan en el riel, en el orden de la pantalla. Para quien ve el módulo Plan del piso (fn_ve_modulo); una cuenta de afuera recibe 42501 «No tienes acceso a retail» y una de retail sin el módulo, 42501 con la pista plan_piso_sin_modulo.';

-- ---------- 2. Cada categoría con su grupo ----------
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
  if not retail.fn_ve_modulo('plan_piso') then
    raise exception 'Para ver el plan del piso necesitas el módulo Plan del piso.' using errcode = '42501', hint = 'plan_piso_sin_modulo';
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
  'ADR-0329: una fila por categoría activa con su grupo del mix (grupo_clave nulo = «Sin grupo»), si el líder ya la confirmó y la version que fijar_grupos_de_categorias pide (0 si no tiene grupo). Para quien ve el módulo Plan del piso (fn_ve_modulo); una cuenta de afuera recibe 42501 «No tienes acceso a retail» y una de retail sin el módulo, 42501 con la pista plan_piso_sin_modulo.';

-- ---------- 3. Las fotos del espacio de una sede ----------
create or replace function retail.fn_espacio_piso(p_ubicacion_id uuid, p_desde date default null)
returns table (fecha date, categoria_id uuid, prendas integer, modelos integer, piso_cuadrado boolean)
language plpgsql stable security definer
set search_path = retail, public, extensions
as $fn$
begin
  -- Tres puertas: la de todas las lecturas de retail, la del módulo (ADR-0161) y la de la SEDE (como fn_piso_plan_lectura). Sin cualquiera
  -- de ellas, un error y no cero filas: «no tienes acceso» no puede parecer «todavía no hay fotos».
  if not retail.fn_tiene_acceso_retail() then
    raise exception 'No tienes acceso al espacio de esa sede.' using errcode = '42501';
  end if;
  if not retail.fn_ve_modulo('plan_piso') then
    raise exception 'Para ver el plan del piso necesitas el módulo Plan del piso.' using errcode = '42501', hint = 'plan_piso_sin_modulo';
  end if;
  if p_ubicacion_id is null or not retail.fn_puede_operar_ubicacion(p_ubicacion_id) then
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
  'ADR-0329: las fotos del espacio del piso de UNA sede desde p_desde (por defecto 26 semanas), de la más reciente a la más antigua: fecha, categoría, prendas libres, modelos distintos y si la sede ya había cuadrado su piso. Para quien ve el módulo Plan del piso (fn_ve_modulo) y opera esa sede (el líder, todas); si no, 42501.';

-- ---------- 4. Validación ----------
-- Las tres quedaron con la puerta del módulo y conservan sus permisos de antes (reemplazar no los toca: solo se comprueba que siguen).
do $v$
declare
  v_f text;
begin
  foreach v_f in array array['retail.fn_grupos_mix()', 'retail.fn_categorias_grupo_mix()', 'retail.fn_espacio_piso(uuid, date)'] loop
    if position('fn_ve_modulo(''plan_piso'')' in pg_get_functiondef(v_f::regprocedure)) = 0 then
      raise exception 'plan del piso quien ve el módulo: % no quedó con la puerta fn_ve_modulo(''plan_piso'')', v_f;
    end if;
    if not has_function_privilege('authenticated', v_f::regprocedure, 'execute') then
      raise exception 'plan del piso quien ve el módulo: % perdió el permiso de authenticated (las lecturas del plan se llaman desde la pantalla)', v_f;
    end if;
  end loop;
end $v$;

reset lock_timeout;
