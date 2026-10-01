-- ============================================================================
-- 20260930210000_club_paso1f_lista_y_ficha.sql — CAYLA V2 · Club de clientas · paso 1, tanda 1f
-- ADR-0288 («Actualización 2026-09-30 (f)»). UNA SOLA PARTE, sin políticas ni `drop trigger` (CLAUDE.md, «Políticas y
-- deadlocks»). Va DESPUÉS de la tanda 1b (20260930200000 y 20260930200100): lee sus columnas y su historia.
--
-- EL PROBLEMA. La lista de /clientas eran las últimas 50 fichas leídas de la tabla, y los filtros del club miraban solo
-- esas 50: «Socias 3» quería decir «3 de las 50 que estás viendo». No podía decir «su sede» (CL-6) ni «última compra», ni
-- contar las frecuentes (D-103, CL-16), porque eso sale de las ventas de cada clienta y la lista no las leía. La ficha
-- tampoco decía su sede, ni la historia del permiso (CL-26: qué, cuándo, dónde, quién y con qué texto), y no había dónde
-- anotar sus preferencias (CL-5: ocasión, estilo y lo que evita).
--
-- QUÉ HACE
--   1. `clientas.preferencias jsonb` ('{}' por defecto): { "ocasion": [...], "estilo": [...], "evita": [...] }, con los
--      valores del catálogo. Candados: es un objeto; solo una socia tiene preferencias (`clientas_preferencias_solo_socia`).
--      El disparador `clientas_preferencias_sin_club` las vacía en la misma escritura en que una ficha deja de ser socia
--      (anonimizar, o la ficha que se va al unir dos): así `archivar_clienta` y `unir_clientas` las borran sin tocarlas.
--   2. `club_etiquetas (grupo, valor, orden, activa)`: el catálogo de las tres listas, sembrado con los valores de trabajo
--      del spike del club (Felipe los puede cambiar: CL-5, pendiente 2 de la sección G). Un valor no se renombra ni se
--      borra (una ficha lo cita): se apaga (`activa = false`) y se agrega otro. RLS sin políticas, sin permisos para la API.
--   3. Ayudantes internos (sin EXECUTE para la API, sin security definer), UN lugar para cada regla:
--      · `fn_venta_devuelta_entera(venta)`: cada prenda de la venta volvió entera, sumando sus devoluciones APROBADAS;
--      · `fn_club_compras_netas(clienta)`: sus compras que cuentan (CL-25): completadas, que no son de prueba y que no se
--        devolvieron enteras. Un cambio no la saca (la venta sigue);
--      · `fn_club_resumen_compras(clienta)`: su sede (la de más compras netas en 12 meses; si empatan, la de su compra más
--        reciente), cuántas allí y en total, cuántas en 6 meses, si es frecuente (3 o más: el umbral de
--        `lib/clienta-actividad-reglas.ts`) y su última compra. Se calcula al leer, nunca se guarda (CL-6, D-103).
--   4. Lecturas (prefijo `fn_`: no abren el loader; todas exigen el módulo «Clientas»):
--      · `fn_clientas_lista(p_termino, p_filtro, p_limite, p_desde)`: la lista, paginada, con su sede, su última compra,
--        si es frecuente, `baja_en` (una socia sin publicidad cuyo último paso de la publicidad fue su BAJA: el spike la
--        muestra «Pidió BAJA», no «Sin publicidad») y `total` (cuántas pasan el filtro). Filtros: todas, socias,
--        frecuentes, con_publicidad, sin_publicidad, sin_celular, cumplen_este_mes y archivadas. El término busca como
--        `buscar_clienta`.
--      · `fn_cifras_clientas()`: las cifras de la cabecera y la cuenta de cada filtro, sobre TODAS las fichas.
--      · `fn_clienta_su_sede(p_clienta_id)`: lo mismo que la lista, para la ficha.
--      · `fn_clienta_permisos(p_clienta_id)`: la historia de `club_permisos` en orden (también la de las fichas que se le
--        unieron), con la tienda, quién la registró («ella misma» si la dio ella desde la página de su QR) y el texto.
--      · `fn_club_etiquetas()`: el catálogo activo.
--   5. `guardar_preferencias_clienta(p_id, p_preferencias, p_version_esperada)`: exige el módulo, firma con el responsable
--      del combo, candado optimista (PT409 version_cambiada, como `editar_clienta`), solo para socias
--      (`preferencias_solo_socia`) y solo con valores del catálogo activo (`preferencia_invalida`); un valor que la ficha
--      ya tenía y que después se apagó se conserva. Si no cambia nada, no sube la versión ni deja rastro.
--
-- DECIDÍ: las compras que cuentan viven en UNA función (`fn_club_compras_netas`) y el resumen en otra; la lista, las
--   cifras y la ficha las leen igual. La ficha toma de aquí «Frecuente» para decir lo mismo que la lista (compra neta).
-- DECIDÍ: preferencias solo de una socia (el spike las muestra solo a ella). Sirven a los avisos del club (paso 3); a una
--   clienta que solo se identificó no se le pidió nada más que ligar sus compras (Ley 29733, finalidad). El esquema lo
--   hace imposible, y el disparador las vacía cuando la ficha deja de ser socia.
-- DECIDÍ: el disparador en vez de reescribir `archivar_clienta` y `unir_clientas`: la tanda 1b las sigue cambiando (su md5
--   «después» cambió dos veces el 2026-09-30) y un reemplazo anclado ataría esta tanda a un md5 que se mueve. El disparador
--   vale para cualquier camino que quite el club, también uno futuro.
-- DECIDÍ: «su sede» cuenta solo compras NETAS (CL-25 lo pide para frecuente; una venta devuelta entera tampoco dice dónde
--   compra) y deja fuera las ventas de prueba (`es_prueba`). Sin compras en 12 meses, no tiene sede (null): la pantalla
--   dice «—».
-- DECIDÍ: la lista va de la compra más reciente a la más vieja (las que nunca compraron, por su fecha de registro):
--   quien la abre busca a la clienta que vino hace poco.
-- DESCARTÉ: guardar `su_sede` o `es_frecuente` en `clientas` (CL-6 y D-103: se calculan al leer; guardarlos pediría un
--   disparador en cada venta, devolución y anulación, y el día que cambie el umbral habría que migrar filas).
-- DESCARTÉ: guardar las preferencias por id de etiqueta. Un valor no se renombra (el disparador de `club_etiquetas` lo
--   impide), así que el texto es estable, y la ficha, el paso 3 y un volcado lo leen sin un cruce.
-- DESCARTÉ: tocar `fn_clienta_compras` para que excluya las devoluciones enteras (ADR-0288 D-8): la tanda 1d la reescribe
--   hoy (suma `es_regalo`) y su candado de versión espera el md5 de antes. Queda como pendiente para quien la cierre:
--   filtrar con `retail.fn_venta_devuelta_entera(v.id)`.
-- SE ROMPE SI: cambia el umbral de frecuente en `lib/clienta-actividad-reglas.ts` y no aquí (lo vigila
--   `lib/clientas-lista-reglas.test.ts`, que lee este archivo); o alguien quita el club de una ficha sin pasar por un
--   `update` de `clientas` (imposible: `club_desde` es una columna).
--
-- CÓMO SE PEGA EN PRODUCCIÓN: UN archivo, solo, en el SQL Editor. Espera como mucho 3 s un candado (`lock_timeout`): si la
-- tienda está usando `clientas`, falla limpio y se vuelve a pegar. Idempotente: pegarlo dos veces deja lo mismo. Toma
-- `clientas` primero (la columna, sus candados y el disparador) y después crea lo demás, que no toca tablas en uso (la tabla
-- nueva no tiene llaves foráneas; las funciones no toman candados al crearse). Sin políticas: no hay parte aparte.
-- Fusionar el PR de la web DESPUÉS de pegarlo: la web nueva llama estas funciones y lee `preferencias`.
--
-- VERIFICACIÓN (solo lectura, después de pegar):
--   select p.oid::regprocedure, md5(regexp_replace(regexp_replace(regexp_replace(p.prosrc, '/\*.*?\*/', '', 'g'),
--          '--[^' || chr(10) || ']*', '', 'g'), '\s+', '', 'g'))
--     from pg_proc p where p.pronamespace = 'retail'::regnamespace
--      and p.proname in ('fn_venta_devuelta_entera', 'fn_club_compras_netas', 'fn_club_resumen_compras', 'fn_clientas_lista',
--                        'fn_cifras_clientas', 'fn_clienta_su_sede', 'fn_clienta_permisos', 'fn_club_etiquetas',
--                        'guardar_preferencias_clienta', 'fn_clientas_preferencias_sin_club', 'fn_club_etiquetas_fijas')
--    order by 1;
--   → 11 filas, cada una con su md5 «después» de la sección 0; y
--   select count(*) from retail.club_etiquetas;   → 11 (o más, si Felipe ya agregó)
--
-- CONCURRENCIA. Dos personas marcan las preferencias de la misma socia a la vez: `guardar_preferencias_clienta` toma la
-- ficha con `for update` y compara la versión que cada una leyó; la segunda recibe PT409 y vuelve a cargar. Si una la
-- anonimiza mientras la otra marca: la que llega segunda espera la ficha y la encuentra anonimizada (rechazo), o la
-- anonimización encuentra las preferencias y el disparador las vacía. Las lecturas no toman candados.
-- CAÍDA EXTERNA. Nada de esto llama a SUNAT, Lucode, el padrón ni WhatsApp.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 0. la tanda 1b tiene que estar, y candado de versión de lo que crea este archivo ----------
do $guarda$
declare
  r record;
  v_md5 text;
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'retail' and table_name = 'clientas' and column_name = 'club_desde')
     or to_regclass('retail.club_permisos') is null then
    raise exception 'Falta la tanda 1b del club (20260930200000 y 20260930200100): pégala antes que esta.';
  end if;

  for r in
    select * from (values
      -- firma                                                               antes      despues (este archivo)
      ('retail.fn_venta_devuelta_entera(uuid)',                              null::text, '629cd67eb2757940bac9c9fe9c08bb40'),
      ('retail.fn_club_compras_netas(uuid)',                                 null::text, '918a235596e993414865d752e235a536'),
      ('retail.fn_club_resumen_compras(uuid)',                               null::text, '054d7a00ed6c621441a2b4b4981f261d'),
      ('retail.fn_clientas_lista(text,text,integer,integer)',                null::text, '57715a5f132ca216ff735c0f607ebe45'),
      ('retail.fn_cifras_clientas()',                                        null::text, 'a96831d6c6c3ab0113858f608c84b534'),
      ('retail.fn_clienta_su_sede(uuid)',                                    null::text, '352e641e48288e08d96ae8f190943ad1'),
      ('retail.fn_clienta_permisos(uuid)',                                   null::text, '5afa7a008c3cb537d556eb012bb6440f'),
      ('retail.fn_club_etiquetas()',                                         null::text, '675eb7bc1f8a030b0795ceb4ad46cc9f'),
      ('retail.guardar_preferencias_clienta(uuid,jsonb,integer)',            null::text, 'b92b55f2cdff76fa0f8684e766568250'),
      ('retail.fn_clientas_preferencias_sin_club()',                         null::text, 'e3cdb92ee18fd6574a77244069827108'),
      ('retail.fn_club_etiquetas_fijas()',                                   null::text, '5a6fa79b6c066d82540d103d8118cc1e')
    ) as t(firma, antes, despues)
  loop
    select md5(regexp_replace(regexp_replace(regexp_replace(p.prosrc, '/\*.*?\*/', '', 'g'), '--[^' || chr(10) || ']*', '', 'g'), '\s+', '', 'g'))
      into v_md5
      from pg_proc p
     where p.oid = to_regprocedure(r.firma);
    if v_md5 is not null and v_md5 is distinct from r.antes and v_md5 <> r.despues then
      raise exception '% cambió desde que se escribió esta migración (md5 normalizado %; se esperaba % —antes— o % —después—). No se reemplaza a ciegas: lee su definición viva y rehace este cambio sobre ESA versión.',
        r.firma, v_md5, coalesce(r.antes, 'que no exista'), r.despues;
    end if;
  end loop;
end
$guarda$;

-- ---------- 1. clientas.preferencias (CL-5), solo de una socia ----------
alter table retail.clientas add column if not exists preferencias jsonb not null default '{}'::jsonb;

comment on column retail.clientas.preferencias is
  'CL-5 (ADR-0288 tanda 1f): lo que marcó en su ficha, por grupo: {"ocasion": [...], "estilo": [...], "evita": [...]}, con valores de retail.club_etiquetas. Sin nota libre (no se filtra y ahí se cuelan datos de salud, que la Ley 29733 protege aparte). Solo de una socia: se vacía cuando deja de serlo (anonimizar, unir). Se escribe con guardar_preferencias_clienta.';

alter table retail.clientas drop constraint if exists clientas_preferencias_forma;
alter table retail.clientas add constraint clientas_preferencias_forma check (jsonb_typeof(preferencias) = 'object');
alter table retail.clientas drop constraint if exists clientas_preferencias_solo_socia;
alter table retail.clientas add constraint clientas_preferencias_solo_socia
  check (preferencias = '{}'::jsonb or club_desde is not null);

-- Deja de ser socia (anonimizar, o la ficha que se va al unir dos) → sus preferencias se van en la misma escritura. Así
-- `archivar_clienta` y `unir_clientas` no necesitan saber que existen, y el candado de arriba nunca los frena.
create or replace function retail.fn_clientas_preferencias_sin_club()
returns trigger
language plpgsql
set search_path = retail, public, extensions
as $$
begin
  new.preferencias := '{}'::jsonb;
  return new;
end;
$$;
revoke all on function retail.fn_clientas_preferencias_sin_club() from public, anon, authenticated;

create or replace trigger clientas_preferencias_sin_club before update on retail.clientas
  for each row
  when (old.club_desde is not null and new.club_desde is null and new.preferencias is distinct from '{}'::jsonb)
  execute function retail.fn_clientas_preferencias_sin_club();

-- ---------- 2. el catálogo de las tres listas (CL-5) ----------
create table if not exists retail.club_etiquetas (
  id         uuid primary key default gen_random_uuid(),
  grupo      text not null,
  valor      text not null,
  orden      integer not null default 0,
  activa     boolean not null default true,
  created_at timestamptz not null default now(),
  constraint club_etiquetas_grupo_valido check (grupo in ('ocasion', 'estilo', 'evita')),
  constraint club_etiquetas_valor_limpio check (valor = btrim(valor) and valor <> '' and char_length(valor) <= 40),
  constraint club_etiquetas_unico unique (grupo, valor)
);
comment on table retail.club_etiquetas is
  'CL-5 (ADR-0288 tanda 1f): los valores de las tres listas de preferencias de la ficha: ocasion, estilo y evita (un color o una tela). Sembrados con los valores de TRABAJO del spike del club: Felipe los puede cambiar (pendiente 2 de la sección G del acta). Un valor no se renombra ni se borra (hay fichas que lo citan): se apaga con activa = false y se agrega otro. orden = cómo se muestran.';

-- Un valor que una ficha cita no cambia de nombre ni de grupo, y no se borra: se apaga.
create or replace function retail.fn_club_etiquetas_fijas()
returns trigger
language plpgsql
set search_path = retail, public, extensions
as $$
begin
  if tg_op = 'DELETE' or new.grupo is distinct from old.grupo or new.valor is distinct from old.valor then
    raise exception 'Un valor de las preferencias no se renombra ni se borra: hay fichas que lo tienen marcado. Apágalo (activa = false) y agrega el nuevo.'
      using errcode = 'P0001', hint = 'club_etiqueta_fija';
  end if;
  return new;
end;
$$;
revoke all on function retail.fn_club_etiquetas_fijas() from public, anon, authenticated;

create or replace trigger club_etiquetas_fijas before update or delete on retail.club_etiquetas
  for each row execute function retail.fn_club_etiquetas_fijas();

-- RLS encendido y SIN políticas: solo la leen funciones security definer. Y sin permisos para la API.
alter table retail.club_etiquetas enable row level security;
revoke all on retail.club_etiquetas from public, anon, authenticated;

-- Los valores de trabajo del spike del club (docs/maquetas/club-clientas-spike-2026-09/fuente/src/20-datos.js, `ETQ`).
-- `on conflict do nothing`: pegar otra vez no revive un valor que Felipe apagó ni le cambia el orden.
insert into retail.club_etiquetas (grupo, valor, orden) values
  ('ocasion', 'Trabajo', 1), ('ocasion', 'Evento', 2), ('ocasion', 'Día a día', 3),
  ('estilo', 'Clásico', 1), ('estilo', 'Tendencia', 2), ('estilo', 'Relajado', 3),
  ('evita', 'Fucsia', 1), ('evita', 'Amarillo', 2), ('evita', 'Negro', 3), ('evita', 'Lana', 4), ('evita', 'Poliéster', 5)
on conflict (grupo, valor) do nothing;

-- ---------- 3. ayudantes: qué compras cuentan, y lo que dicen de ella ----------
-- Devuelta entera: cada prenda volvió completa, sumando todas sus devoluciones APROBADAS (una pendiente o rechazada no
-- devolvió nada). Un cambio no es una devolución: la venta sigue.
create or replace function retail.fn_venta_devuelta_entera(p_venta_id uuid)
returns boolean
language sql
stable
set search_path = retail, public, extensions
as $$
  select exists (select 1 from retail.venta_items vi where vi.venta_id = p_venta_id)
     and not exists (
       select 1
         from retail.venta_items vi
        where vi.venta_id = p_venta_id
          and vi.cantidad > coalesce((
                select sum(di.cantidad)
                  from retail.devolucion_items di
                  join retail.devoluciones d on d.id = di.devolucion_id
                 where di.venta_item_id = vi.id
                   and d.estado = 'aprobada'), 0)
     );
$$;

comment on function retail.fn_venta_devuelta_entera(uuid) is
  'CL-25 (ADR-0288 tanda 1f): true si cada prenda de la venta volvió entera, sumando sus devoluciones aprobadas. Una venta con un cambio sigue contando. Interno: sin EXECUTE para la API.';

-- Sus compras que cuentan (CL-25): completadas (no anuladas), que no son de prueba y que no se devolvieron enteras.
create or replace function retail.fn_club_compras_netas(p_clienta_id uuid default null)
returns table (clienta_id uuid, venta_id uuid, ubicacion_id uuid, fecha timestamptz)
language sql
stable
set search_path = retail, public, extensions
as $$
  select v.cliente_id, v.id, v.ubicacion_id, v.created_at
    from retail.ventas v
   where v.cliente_id is not null
     and (p_clienta_id is null or v.cliente_id = p_clienta_id)
     and v.estado = 'completada'
     and not v.es_prueba
     and not retail.fn_venta_devuelta_entera(v.id);
$$;

comment on function retail.fn_club_compras_netas(uuid) is
  'CL-25 (ADR-0288 tanda 1f): las compras de una clienta (o de todas, con null) que cuentan para su sede, frecuente y última compra: completadas, sin las de prueba y sin las devueltas enteras. Interno.';

-- Lo que sus compras dicen de ella, calculado al leer (CL-6, D-103). Solo trae a las que tienen alguna compra neta.
--   · su sede: la de más compras netas en los últimos 12 meses; si empatan, la de su compra más reciente (y el nombre,
--     para que el empate total sea estable). Sin compras en 12 meses, null.
--   · frecuente: 3 compras netas o más en 6 meses (el umbral de lib/clienta-actividad-reglas.ts: COMPRAS_PARA_FRECUENTE y
--     MESES_PARA_FRECUENTE; una prueba compara los dos).
create or replace function retail.fn_club_resumen_compras(p_clienta_id uuid default null)
returns table (
  clienta_id uuid, su_sede_id uuid, su_sede text, compras_sede integer, compras_12m integer,
  compras_6m integer, es_frecuente boolean, ultima_compra timestamptz
)
language sql
stable
set search_path = retail, public, extensions
as $$
  with netas as (
    select n.clienta_id, n.ubicacion_id, n.fecha
      from retail.fn_club_compras_netas(p_clienta_id) n
  ),
  por_sede as (
    select n.clienta_id, n.ubicacion_id, count(*)::integer as compras, max(n.fecha) as ultima
      from netas n
     where n.fecha >= now() - interval '12 months'
     group by n.clienta_id, n.ubicacion_id
  ),
  sede as (
    select distinct on (ps.clienta_id) ps.clienta_id, ps.ubicacion_id, u.nombre, ps.compras
      from por_sede ps
      join retail.ubicaciones u on u.id = ps.ubicacion_id
     order by ps.clienta_id, ps.compras desc, ps.ultima desc, u.nombre
  ),
  totales as (
    select n.clienta_id,
           (count(*) filter (where n.fecha >= now() - interval '12 months'))::integer as compras_12m,
           (count(*) filter (where n.fecha >= now() - interval '6 months'))::integer as compras_6m,
           max(n.fecha) as ultima_compra
      from netas n
     group by n.clienta_id
  )
  select t.clienta_id, s.ubicacion_id, s.nombre, coalesce(s.compras, 0), t.compras_12m,
         t.compras_6m, t.compras_6m >= 3, t.ultima_compra
    from totales t
    left join sede s on s.clienta_id = t.clienta_id;
$$;

comment on function retail.fn_club_resumen_compras(uuid) is
  'CL-6, D-103 y CL-25 (ADR-0288 tanda 1f): por clienta con compras netas, su sede (más compras netas en 12 meses; empate: la de su compra más reciente), cuántas allí y en total en 12 meses, cuántas en 6 meses, si es frecuente (3 o más en 6 meses) y su última compra. Se calcula al leer. Interno.';

revoke all on function
  retail.fn_venta_devuelta_entera(uuid),
  retail.fn_club_compras_netas(uuid),
  retail.fn_club_resumen_compras(uuid)
from public, anon, authenticated;

-- ---------- 4. la lista de /clientas ----------
-- PROMETE: las fichas del filtro (todas las activas por defecto; `archivadas` = solo las archivadas, anonimizadas o
--   unidas), con el término buscado como en `buscar_clienta` (documento exacto, celular como venga, código de socia o
--   parte del nombre), paginadas (`p_limite` entre 1 y 200, `p_desde` desde 0), de la compra más reciente a la más vieja
--   (sin compras, por su registro). `total` = cuántas pasan el filtro y el término, para paginar.
-- ASUME: el módulo «Clientas» (42501 clientas_sin_modulo). Un filtro desconocido es un error de la pantalla (22023).
create or replace function retail.fn_clientas_lista(
  p_termino text default null,
  p_filtro text default 'todas',
  p_limite integer default 50,
  p_desde integer default 0
)
returns table (
  id uuid, documento_tipo text, documento_numero text, nombre text, telefono_whatsapp text,
  club_desde timestamptz, publicidad_desde timestamptz, codigo_club text,
  cumple_dia smallint, cumple_mes smallint, cumple_anio smallint,
  created_at timestamptz, archivada_en timestamptz, anonimizada boolean, fusionada_en_id uuid,
  su_sede_id uuid, su_sede text, compras_sede integer, compras_12m integer, compras_6m integer,
  es_frecuente boolean, ultima_compra timestamptz, baja_en timestamptz, total bigint
)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
#variable_conflict use_column
declare
  v_termino text := nullif(btrim(coalesce(p_termino, '')), '');
  v_filtro text := coalesce(nullif(btrim(coalesce(p_filtro, '')), ''), 'todas');
  v_limite integer := least(greatest(coalesce(p_limite, 50), 1), 200);
  v_desde integer := greatest(coalesce(p_desde, 0), 0);
  -- «Cumplen este mes» en Lima, no en la hora del servidor.
  v_mes smallint := extract(month from (now() at time zone 'America/Lima'))::smallint;
begin
  perform retail.fn_exigir_modulo('clientas');
  if v_filtro not in ('todas', 'socias', 'frecuentes', 'con_publicidad', 'sin_publicidad', 'sin_celular', 'cumplen_este_mes', 'archivadas') then
    raise exception 'Filtro de clientas desconocido: %.', v_filtro using errcode = '22023', hint = 'filtro_invalido';
  end if;

  return query
  with base as (
    select c.*
      from retail.clientas c
     where (case when v_filtro = 'archivadas' then c.archivada_en is not null else c.archivada_en is null end)
       and (v_termino is null or (
             c.documento_numero = upper(regexp_replace(v_termino, '\s', '', 'g'))
          or c.telefono_whatsapp in (v_termino, retail.fn_celular_normalizado(v_termino))
          or c.codigo_club = retail.fn_codigo_club_normalizado(v_termino)
          or c.nombre ilike '%' || v_termino || '%'
       ))
  ),
  con_compras as (
    select b.*, r.su_sede_id, r.su_sede,
           coalesce(r.compras_sede, 0) as compras_sede, coalesce(r.compras_12m, 0) as compras_12m,
           coalesce(r.compras_6m, 0) as compras_6m, coalesce(r.es_frecuente, false) as es_frecuente,
           r.ultima_compra,
           -- «Pidió BAJA»: sin publicidad, y su último paso de la publicidad fue la BAJA (no un cambio de celular).
           case when b.club_desde is not null and b.publicidad_desde is null then (
             select case when u.medio = 'baja_whatsapp' then u.created_at end
               from retail.club_permisos u
              where u.clienta_id = b.id and u.finalidad = 'publicidad_whatsapp'
              order by u.created_at desc, u.id desc
              limit 1
           ) end as baja_en
      from base b
      left join retail.fn_club_resumen_compras() r on r.clienta_id = b.id
  )
  select x.id, x.documento_tipo, x.documento_numero, x.nombre, x.telefono_whatsapp,
         x.club_desde, x.publicidad_desde, x.codigo_club,
         x.cumple_dia, x.cumple_mes, x.cumple_anio,
         x.created_at, x.archivada_en, x.anonimizada, x.fusionada_en_id,
         x.su_sede_id, x.su_sede, x.compras_sede, x.compras_12m, x.compras_6m,
         x.es_frecuente, x.ultima_compra, x.baja_en, count(*) over ()
    from con_compras x
   where case v_filtro
           when 'socias' then x.club_desde is not null
           when 'frecuentes' then x.es_frecuente
           when 'con_publicidad' then x.publicidad_desde is not null
           when 'sin_publicidad' then x.club_desde is not null and x.publicidad_desde is null
           when 'sin_celular' then nullif(btrim(coalesce(x.telefono_whatsapp, '')), '') is null
           when 'cumplen_este_mes' then x.cumple_mes = v_mes
           else true
         end
   order by coalesce(x.ultima_compra, x.created_at) desc, x.id
   limit v_limite offset v_desde;
end;
$$;

comment on function retail.fn_clientas_lista(text, text, integer, integer) is
  'La lista de /clientas (ADR-0288 tanda 1f): fichas del filtro (todas, socias, frecuentes, con_publicidad, sin_publicidad, sin_celular, cumplen_este_mes, archivadas; otro → 22023 filtro_invalido), con el término de buscar_clienta, paginadas, con su sede, compras en 12 y 6 meses, si es frecuente y su última compra (compra neta, CL-25), baja_en (socia sin publicidad cuyo último paso fue su BAJA) y total. Lectura; módulo «Clientas».';

-- Las cifras de la cabecera y la cuenta de cada píldora, sobre TODAS las fichas (no sobre una página).
create or replace function retail.fn_cifras_clientas()
returns table (
  identificadas integer, socias integer, con_publicidad integer, sin_publicidad integer, frecuentes integer,
  sin_celular integer, cumplen_este_mes integer, archivadas integer
)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select retail.fn_exigir_modulo('clientas');

  select (count(*) filter (where c.archivada_en is null))::integer,
         (count(*) filter (where c.archivada_en is null and c.club_desde is not null))::integer,
         (count(*) filter (where c.archivada_en is null and c.publicidad_desde is not null))::integer,
         (count(*) filter (where c.archivada_en is null and c.club_desde is not null and c.publicidad_desde is null))::integer,
         (count(*) filter (where c.archivada_en is null and coalesce(r.es_frecuente, false)))::integer,
         (count(*) filter (where c.archivada_en is null and nullif(btrim(coalesce(c.telefono_whatsapp, '')), '') is null))::integer,
         (count(*) filter (where c.archivada_en is null
                             and c.cumple_mes = extract(month from (now() at time zone 'America/Lima'))::smallint))::integer,
         (count(*) filter (where c.archivada_en is not null))::integer
    from retail.clientas c
    left join retail.fn_club_resumen_compras() r on r.clienta_id = c.id;
$$;

comment on function retail.fn_cifras_clientas() is
  'Las cifras de /clientas (ADR-0288 tanda 1f): identificadas (fichas activas), socias, con publicidad, socias sin publicidad, frecuentes (compra neta), sin celular, cumplen este mes (Lima) y archivadas. Una fila. Lectura; módulo «Clientas».';

-- ---------- 5. la ficha: su sede, la historia del permiso y el catálogo ----------
create or replace function retail.fn_clienta_su_sede(p_clienta_id uuid)
returns table (
  su_sede_id uuid, su_sede text, compras_sede integer, compras_12m integer, compras_6m integer,
  es_frecuente boolean, ultima_compra timestamptz
)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select retail.fn_exigir_modulo('clientas');

  -- Una fila si la ficha existe (con ceros si nunca compró); ninguna si no.
  select r.su_sede_id, r.su_sede, coalesce(r.compras_sede, 0), coalesce(r.compras_12m, 0), coalesce(r.compras_6m, 0),
         coalesce(r.es_frecuente, false), r.ultima_compra
    from retail.clientas c
    left join retail.fn_club_resumen_compras(p_clienta_id) r on r.clienta_id = c.id
   where c.id = p_clienta_id;
$$;

comment on function retail.fn_clienta_su_sede(uuid) is
  'La ficha (ADR-0288 tanda 1f): su sede (CL-6), cuántas compras allí y en total en 12 meses, en 6 meses, si es frecuente y su última compra, con la misma regla que la lista (compra neta, CL-25). Lectura; módulo «Clientas».';

-- CL-26: la historia del permiso, en orden. También la de las fichas que se le unieron (sus eventos se quedan con ellas,
-- `de_otra_ficha`), porque su «Socia desde» puede venir de una de ellas. Quién lo registró: el nombre corto de la persona;
-- «ella misma» si no lo registró nadie de la tienda (la página de su QR, camino B); nada en el legado.
create or replace function retail.fn_clienta_permisos(p_clienta_id uuid)
returns table (
  id uuid, finalidad text, accion text, medio text, texto_tipo text, texto_version integer,
  sede text, registrado_por text, nota text, created_at timestamptz, de_otra_ficha boolean
)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select retail.fn_exigir_modulo('clientas');

  with recursive arbol (clienta_id) as (
    select p_clienta_id
    union
    select c.id from retail.clientas c join arbol a on c.fusionada_en_id = a.clienta_id
  )
  select e.id, e.finalidad, e.accion, e.medio, e.texto_tipo, e.texto_version,
         u.nombre,
         case
           when e.registrado_por is not null then
             coalesce(nullif(btrim(split_part(btrim(coalesce(pe.nombres, '')), ' ', 1)
                                   || coalesce(' ' || nullif(left(btrim(coalesce(pe.apellidos, '')), 1), '') || '.', '')), ''),
                      'Sin nombre')
           when e.medio = 'legado' then null
           else 'ella misma'
         end,
         e.nota, e.created_at, e.clienta_id <> p_clienta_id
    from retail.club_permisos e
    join arbol a on a.clienta_id = e.clienta_id
    left join retail.ubicaciones u on u.id = e.ubicacion_id
    left join public.personas pe on pe.id = e.registrado_por
   order by e.created_at, e.id;
$$;

comment on function retail.fn_clienta_permisos(uuid) is
  'CL-26 (ADR-0288 tanda 1f): la historia de los dos permisos del club de una ficha (y de las que se le unieron, de_otra_ficha), de la más vieja a la más nueva: qué (finalidad, accion), cómo (medio), con qué texto (texto_tipo, texto_version), en qué tienda, quién la registró («ella misma» si nadie de la tienda) y cuándo. Lectura; módulo «Clientas».';

create or replace function retail.fn_club_etiquetas()
returns table (grupo text, valor text, orden integer)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select retail.fn_exigir_modulo('clientas');

  select e.grupo, e.valor, e.orden
    from retail.club_etiquetas e
   where e.activa
   order by case e.grupo when 'ocasion' then 1 when 'estilo' then 2 else 3 end, e.orden, e.valor;
$$;

comment on function retail.fn_club_etiquetas() is
  'CL-5 (ADR-0288 tanda 1f): los valores activos de las tres listas de preferencias (ocasion, estilo, evita), en su orden. Lectura; módulo «Clientas».';

-- ---------- 6. guardar las preferencias ----------
-- PROMETE: deja en la ficha exactamente lo marcado, por grupo y en el orden del catálogo (sin repetidos; un grupo vacío no
--   se guarda) y devuelve su versión nueva. Si no cambió nada, devuelve la misma versión sin escribir.
-- ASUME: el módulo «Clientas»; el responsable del combo (ADR-0161); la versión que se leyó (PT409 si otra persona la
--   cambió); una socia activa (preferencias_solo_socia, clienta_archivada, clienta_anonimizada, clienta_unida,
--   clienta_no_existe); valores del catálogo activo, o que la ficha ya tenía (preferencia_invalida).
create or replace function retail.guardar_preferencias_clienta(p_id uuid, p_preferencias jsonb, p_version_esperada integer default null)
returns integer
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_persona uuid;
  v_actual retail.clientas;
  v_grupo text;
  v_valores jsonb;
  v_elemento jsonb;
  v_valor text;
  v_lista text[];
  v_nuevas jsonb := '{}'::jsonb;
  v_marcadas integer := 0;
begin
  perform retail.fn_exigir_modulo('clientas');
  v_persona := retail.fn_actor_persona_id(true);

  if p_preferencias is null or jsonb_typeof(p_preferencias) <> 'object' then
    raise exception 'Las preferencias llegan como una lista por grupo (ocasión, estilo y evita).'
      using errcode = 'P0001', hint = 'preferencia_invalida';
  end if;

  -- `for update`: dos personas marcando a la vez no se pisan; la segunda compara la versión al despertar.
  select * into v_actual from retail.clientas c where c.id = p_id for update;
  if v_actual.id is null then
    raise exception 'Esa clienta ya no existe — actualiza la pantalla.' using errcode = 'P0001', hint = 'clienta_no_existe';
  end if;
  if v_actual.fusionada_en_id is not null then
    raise exception 'Esta ficha se unió a otra: búscala otra vez y usa la que quedó.' using errcode = 'P0001', hint = 'clienta_unida';
  end if;
  if v_actual.anonimizada then
    raise exception 'Esta clienta pidió borrar sus datos: su ficha no guarda preferencias.' using errcode = 'P0001', hint = 'clienta_anonimizada';
  end if;
  if v_actual.archivada_en is not null then
    raise exception 'Esta ficha está archivada — reactívala antes de marcar sus preferencias.' using errcode = 'P0001', hint = 'clienta_archivada';
  end if;
  if p_version_esperada is not null and v_actual.version <> p_version_esperada then
    raise exception 'Alguien más cambió esta ficha mientras la mirabas. Recarga para ver sus cambios.'
      using errcode = 'PT409', hint = 'version_cambiada';
  end if;
  if v_actual.club_desde is null then
    raise exception 'Las preferencias son del club: únela al club antes de marcarlas.'
      using errcode = 'P0001', hint = 'preferencias_solo_socia';
  end if;

  for v_grupo, v_valores in select j.key, j.value from jsonb_each(p_preferencias) j order by j.key loop
    if v_grupo not in ('ocasion', 'estilo', 'evita') then
      raise exception 'Las preferencias tienen tres listas (ocasión, estilo y evita); «%» no es una de ellas.', v_grupo
        using errcode = 'P0001', hint = 'preferencia_invalida';
    end if;
    if jsonb_typeof(v_valores) <> 'array' then
      raise exception 'Cada lista de preferencias es una lista de valores.' using errcode = 'P0001', hint = 'preferencia_invalida';
    end if;

    v_lista := array[]::text[];
    for v_elemento in select a.value from jsonb_array_elements(v_valores) a loop
      if jsonb_typeof(v_elemento) <> 'string' then
        raise exception 'Cada preferencia es un valor de la lista.' using errcode = 'P0001', hint = 'preferencia_invalida';
      end if;
      v_valor := v_elemento #>> '{}';
      -- Del catálogo activo; o uno que la ficha ya tenía y después se apagó (se conserva: no se le borra lo que marcó).
      if not exists (select 1 from retail.club_etiquetas e where e.grupo = v_grupo and e.valor = v_valor and e.activa)
         and not coalesce((v_actual.preferencias -> v_grupo) ? v_valor, false) then
        raise exception '«%» no está en la lista de %: elige uno de la lista.', v_valor,
          case v_grupo when 'ocasion' then 'ocasión' when 'estilo' then 'estilo' else 'lo que evita' end
          using errcode = 'P0001', hint = 'preferencia_invalida';
      end if;
      if not (v_valor = any (v_lista)) then
        v_lista := v_lista || v_valor;
      end if;
    end loop;

    if cardinality(v_lista) > 0 then
      -- En el orden del catálogo; lo que ya no está en él, al final.
      v_nuevas := v_nuevas || jsonb_build_object(v_grupo, (
        select jsonb_agg(x.valor order by e.orden nulls last, x.valor)
          from unnest(v_lista) as x(valor)
          left join retail.club_etiquetas e on e.grupo = v_grupo and e.valor = x.valor
      ));
      v_marcadas := v_marcadas + cardinality(v_lista);
    end if;
  end loop;

  if v_nuevas = v_actual.preferencias then
    return v_actual.version;
  end if;

  update retail.clientas c set preferencias = v_nuevas where c.id = p_id;

  -- Sin los valores en el rastro: quién es la clienta queda en registro_id (ADR-0249, 2026-09-28).
  perform retail.fn_actividad_anotar(
    'clientas', 'preferencias', 'marcó las preferencias de una clienta',
    v_persona, null, null, null, 'clientas', p_id::text, now(),
    jsonb_build_object('marcadas', v_marcadas), 'vivo'
  );

  return (select c.version from retail.clientas c where c.id = p_id);
end;
$$;

comment on function retail.guardar_preferencias_clienta(uuid, jsonb, integer) is
  'CL-5 (ADR-0288 tanda 1f): guarda las preferencias de una socia ({"ocasion": [...], "estilo": [...], "evita": [...]}) con valores del catálogo activo (o que ya tenía: preferencia_invalida), candado optimista (PT409 version_cambiada) y solo para socias activas (preferencias_solo_socia, clienta_archivada, clienta_anonimizada, clienta_unida, clienta_no_existe). Devuelve la versión nueva; sin cambios, la misma. Módulo «Clientas»; firma con el responsable del combo.';

-- ---------- 7. permisos de las funciones ----------
revoke execute on function
  retail.fn_clientas_lista(text, text, integer, integer),
  retail.fn_cifras_clientas(),
  retail.fn_clienta_su_sede(uuid),
  retail.fn_clienta_permisos(uuid),
  retail.fn_club_etiquetas(),
  retail.guardar_preferencias_clienta(uuid, jsonb, integer)
from public, anon;

grant execute on function
  retail.fn_clientas_lista(text, text, integer, integer),
  retail.fn_cifras_clientas(),
  retail.fn_clienta_su_sede(uuid),
  retail.fn_clienta_permisos(uuid),
  retail.fn_club_etiquetas(),
  retail.guardar_preferencias_clienta(uuid, jsonb, integer)
to authenticated;

reset lock_timeout;
notify pgrst, 'reload schema';
