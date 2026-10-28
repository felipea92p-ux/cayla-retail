-- ============================================================================
-- 20261021194000_campanas_web_programar_y_vista_previa.sql — Tienda web ▸ Campañas, actividad 8: programar el diseño y verlo antes con un enlace privado
--
-- EL PROBLEMA PRIMERO. Hasta aquí el líder guarda un BORRADOR: la tienda no lo ve. Falta lo que lo vuelve real —«programarlo»— y, antes de
-- eso, mirarlo en la tienda de verdad sin que lo vea nadie más (un correo a la dueña, una prueba en el celular). Dos cosas distintas:
--   · PROGRAMAR = el diseño pasa de 'borrador' a 'programado'. Desde ese instante, y mientras la campaña esté vigente (fechas de Etiquetas),
--     `tienda_diseno_campana()` lo manda a la tienda. «Programar» no fija fechas: las fechas son de la campaña, una sola fuente de verdad.
--   · VISTA PREVIA PRIVADA = un enlace con una llave larga que muestra el diseño (borrador o programado) en la tienda, a quien lo tenga,
--     hasta 7 días; sin él, nadie lo ve. No da acceso a nada más que a esa pantalla.
--
-- LO QUE HACE
--   1. `fn_campana_web_diseno_tienda(uuid)`: el diseño tal como lo pinta la tienda (una sola definición); `tienda_diseno_campana()` pasa a usarla.
--   2. `programar_campana_diseno(etiqueta, version)` y `desprogramar_campana_diseno(etiqueta, version)` («volver a borrador»): piden el módulo,
--      firman con el responsable, usan la versión para no pisar a otra persona y dejan su línea en la Actividad. Programar exige lo que la base sabe
--      exigir: la campaña vigente o por empezar (no una terminada) y al menos una pieza de la tienda encendida en «Dónde se ve».
--   3. `campana_web_previas` + `crear_campana_vista_previa(etiqueta)`: la llave se guarda SOLO como huella (sha-256): quien lea la tabla no puede
--      armar un enlace. Dura 7 días y cada campaña tiene a lo más 20 enlaces vivos.
--   4. `tienda_diseno_campana_previa(llave)`: lo que lee la tienda con esa llave (solo `tienda_web`); una llave que no existe o venció es «nada».
--
-- DECIDÍ
--   · Editar un diseño PROGRAMADO lo deja programado (`guardar_campana_diseno` no toca el estado): lo guardado se ve en la tienda en menos de un
--     minuto. La pantalla lo avisa antes. Pasarlo a borrador al editar sacaría la campaña del aire sin que nadie lo pidiera.
--   · Cada programar/volver a borrador sube la versión: quien tenía la campaña abierta recibe «cambió mientras la tenías abierta».
--   · Programar de nuevo un diseño ya programado, o volver a borrador uno que ya lo es, no escribe nada ni anota (idempotente).
--
-- DESCARTÉ
--   · Validar el candado de lectura (contraste de los colores) en SQL: el catálogo de ambientes y sus paletas vive en `packages/shared`, que
--     usan el ERP y la tienda; copiarlo a Postgres crearía dos fuentes que se desfasan. El ERP no deja programar un diseño que no se lee y la
--     tienda NUNCA pinta uno así (cae a «como siempre»): el peor caso de saltarse el ERP es que no se vea, nunca letras ilegibles.
--   · Una fecha de programación propia del diseño: dos relojes (el de la campaña y el del diseño) que se contradicen.
--   · Una llave de vista previa en claro en la tabla, o sin vencimiento.
--
-- PRODUCCIÓN. NO está aplicada. Pide antes 20261021161000. Una sola parte: crea una tabla y funciones; no hay `create policy` (la tabla nueva solo
-- se lee por funciones `security definer`, así que queda con RLS encendido y sin políticas: ADR-0195) ni `alter` de tablas en uso.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. El diseño como lo pinta la tienda (una sola definición) ----------
create or replace function retail.fn_campana_web_diseno_tienda(p_etiqueta_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = retail, public
as $$
  select jsonb_build_object(
    'modo', d.modo, 'plantilla', d.plantilla, 'paleta', d.paleta, 'acento', d.acento,
    'franja', d.franja, 'entrada', d.entrada, 'efecto', d.efecto, 'intensidad', d.intensidad, 'duracion', d.duracion, 'cuenta', d.cuenta,
    'titular', d.titular, 'bajada', d.bajada, 'boton', d.boton,
    'imagen_ruta', d.imagen_ruta, 'imagen_vertical_ruta', d.imagen_vertical_ruta,
    'donde', jsonb_build_object('franja', d.donde_franja, 'portada', d.donde_portada, 'catalogo', d.donde_catalogo,
                                'sello', d.donde_sello, 'bolsa', d.donde_bolsa))
  from retail.campana_web_disenos d where d.etiqueta_id = p_etiqueta_id
$$;
revoke all on function retail.fn_campana_web_diseno_tienda(uuid) from public, anon, authenticated;

-- `tienda_diseno_campana()` = lo mismo que en 20261021161000, pero armando el diseño con la definición única de arriba.
create or replace function retail.tienda_diseno_campana()
returns jsonb
language sql
stable
security definer
set search_path = retail, public
as $$
  select jsonb_build_object(
    'campana', (
      select jsonb_build_object(
        'nombre', e.nombre,
        'diseno', (
          select retail.fn_campana_web_diseno_tienda(d.etiqueta_id)
            from retail.campana_web_disenos d where d.etiqueta_id = e.id and d.estado = 'programado')
      )
      from retail.etiquetas e
      where e.estilo = 'campana'
        and e.estado = 'aprobado'
        and e.activo
        and e.descuento_pct > 0
        and (e.vigente_desde is null or e.vigente_desde <= retail.fn_hoy_lima())
        and (e.vigente_hasta is null or e.vigente_hasta >= retail.fn_hoy_lima())
        and (
          exists (select 1 from retail.variante_etiquetas ve where ve.etiqueta_id = e.id)
          or exists (select 1 from retail.etiqueta_categorias ec where ec.etiqueta_id = e.id)
        )
      order by e.vigente_hasta nulls last, e.descuento_pct desc, e.nombre
      limit 1
    )
  );
$$;

-- ---------- 2. Programar y volver a borrador ----------
-- Una sola función para los dos sentidos: lo que cambia es el estado de llegada. `p_programar`: true = programar, false = volver a borrador.
create or replace function retail.fn_campana_web_cambiar_estado(p_etiqueta_id uuid, p_version integer, p_programar boolean)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_actor uuid;
  v_hoy date := retail.fn_hoy_lima();
  v_nombre text;
  v_hasta date;
  v_fila retail.campana_web_disenos%rowtype;
  v_llega text := case when p_programar then 'programado' else 'borrador' end;
begin
  perform retail.fn_exigir_modulo('campanas_web');
  v_actor := retail.fn_actor_persona_id(true);

  if p_etiqueta_id is null or not retail.fn_campana_web_valida(p_etiqueta_id) then
    raise exception 'campana_no_existe' using hint = 'Esa campaña ya no existe o dejó de ser una campaña. Vuelve a la lista.';
  end if;
  select e.nombre, e.vigente_hasta into v_nombre, v_hasta from retail.etiquetas e where e.id = p_etiqueta_id;
  if v_hasta is not null and v_hasta < v_hoy then
    raise exception 'campana_terminada' using hint = format('«%s» ya terminó: su diseño no se cambia.', v_nombre);
  end if;

  select * into v_fila from retail.campana_web_disenos where etiqueta_id = p_etiqueta_id for update;
  if not found then
    raise exception 'campana_sin_diseno' using hint = 'Esta campaña todavía no tiene diseño: guárdalo primero como borrador.';
  end if;
  if p_version is null or p_version <> v_fila.version then
    raise exception 'campana_cambio_otro' using hint = 'Esta campaña cambió mientras la tenías abierta. Vuelve a abrirla.';
  end if;

  if v_fila.estado = v_llega then
    return retail.fn_campana_diseno_json(p_etiqueta_id);  -- ya está así: ni se escribe ni se anota
  end if;

  if p_programar and not (v_fila.donde_franja or v_fila.donde_portada or v_fila.donde_catalogo or v_fila.donde_sello or v_fila.donde_bolsa) then
    raise exception 'campana_diseno_incompleto' using hint = 'Enciende al menos una pieza de la tienda en «Dónde se ve»: si no, programarlo no cambiaría nada.';
  end if;

  update retail.campana_web_disenos
     set estado = v_llega, version = version + 1, actualizado_en = now(), actualizado_por = v_actor
   where etiqueta_id = p_etiqueta_id;

  perform retail.fn_campana_web_anotar(
    case when p_programar then 'campana_diseno_programado' else 'campana_diseno_a_borrador' end,
    '«' || v_nombre || '»: ' || case when p_programar then 'programó su diseño (la tienda lo muestra mientras dure la campaña)' else 'volvió su diseño a borrador (la tienda lo deja de mostrar)' end,
    v_actor, p_etiqueta_id::text,
    jsonb_build_object('etiqueta_id', p_etiqueta_id, 'estado', v_llega));

  return retail.fn_campana_diseno_json(p_etiqueta_id);
end;
$fn$;
revoke all on function retail.fn_campana_web_cambiar_estado(uuid, integer, boolean) from public, anon, authenticated;

create or replace function retail.programar_campana_diseno(p_etiqueta_id uuid, p_version integer)
returns jsonb
language sql
security definer
set search_path = retail, public, extensions
as $$ select retail.fn_campana_web_cambiar_estado(p_etiqueta_id, p_version, true) $$;

create or replace function retail.desprogramar_campana_diseno(p_etiqueta_id uuid, p_version integer)
returns jsonb
language sql
security definer
set search_path = retail, public, extensions
as $$ select retail.fn_campana_web_cambiar_estado(p_etiqueta_id, p_version, false) $$;

comment on function retail.programar_campana_diseno(uuid, integer) is
  'Tienda web ▸ Campañas: pasa el diseño de borrador a programado (la tienda lo muestra mientras dure la campaña). Pide el módulo campanas_web y firma con el responsable; la versión frena a la segunda persona; exige al menos una pieza encendida; una campaña terminada no se programa. Idempotente.';
comment on function retail.desprogramar_campana_diseno(uuid, integer) is
  'Tienda web ▸ Campañas: vuelve el diseño de programado a borrador (la tienda deja de mostrarlo). Mismos candados que programar_campana_diseno. Idempotente.';

revoke all on function retail.programar_campana_diseno(uuid, integer) from public, anon;
revoke all on function retail.desprogramar_campana_diseno(uuid, integer) from public, anon;
grant execute on function retail.programar_campana_diseno(uuid, integer) to authenticated;
grant execute on function retail.desprogramar_campana_diseno(uuid, integer) to authenticated;

-- ---------- 3. La vista previa privada ----------
-- La llave se guarda SOLO como huella: quien lea esta tabla no puede armar un enlace. La tabla se escribe y se lee solo por funciones.
create table if not exists retail.campana_web_previas (
  id          uuid primary key default gen_random_uuid(),
  etiqueta_id uuid not null references retail.etiquetas (id) on delete cascade,
  huella      text not null unique check (huella ~ '^[0-9a-f]{64}$'),
  expira_en   timestamptz not null,
  creado_por  uuid,
  creado_en   timestamptz not null default now()
);
create index if not exists campana_web_previas_etiqueta_idx on retail.campana_web_previas (etiqueta_id, expira_en);
alter table retail.campana_web_previas enable row level security;
revoke all on table retail.campana_web_previas from public, anon, authenticated;
comment on table retail.campana_web_previas is
  'Tienda web ▸ Campañas: enlaces de vista previa privada de un diseño. Solo guarda la huella (sha-256) de la llave y su vencimiento; la llave en claro viaja una vez, al crearla. Se escribe solo con crear_campana_vista_previa.';

create or replace function retail.crear_campana_vista_previa(p_etiqueta_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_actor uuid;
  v_hoy date := retail.fn_hoy_lima();
  v_nombre text;
  v_hasta date;
  v_llave text;
  v_expira timestamptz := now() + interval '7 days';
begin
  perform retail.fn_exigir_modulo('campanas_web');
  v_actor := retail.fn_actor_persona_id(true);

  if p_etiqueta_id is null or not retail.fn_campana_web_valida(p_etiqueta_id) then
    raise exception 'campana_no_existe' using hint = 'Esa campaña ya no existe o dejó de ser una campaña. Vuelve a la lista.';
  end if;
  select e.nombre, e.vigente_hasta into v_nombre, v_hasta from retail.etiquetas e where e.id = p_etiqueta_id;
  if v_hasta is not null and v_hasta < v_hoy then
    raise exception 'campana_terminada' using hint = format('«%s» ya terminó: su diseño no se cambia.', v_nombre);
  end if;
  if not exists (select 1 from retail.campana_web_disenos where etiqueta_id = p_etiqueta_id) then
    raise exception 'campana_sin_diseno' using hint = 'Esta campaña todavía no tiene diseño: guárdalo primero como borrador.';
  end if;

  delete from retail.campana_web_previas where etiqueta_id = p_etiqueta_id and expira_en < now();
  if (select count(*) from retail.campana_web_previas where etiqueta_id = p_etiqueta_id) >= 20 then
    raise exception 'campana_previa_demasiadas' using hint = 'Esta campaña ya tiene 20 enlaces de vista previa vivos. Espera a que venzan los anteriores.';
  end if;

  v_llave := encode(gen_random_bytes(24), 'hex');
  insert into retail.campana_web_previas (etiqueta_id, huella, expira_en, creado_por)
  values (p_etiqueta_id, encode(digest(v_llave, 'sha256'), 'hex'), v_expira, v_actor);

  perform retail.fn_campana_web_anotar(
    'campana_vista_previa_creada',
    '«' || v_nombre || '»: creó un enlace de vista previa privada (dura 7 días)',
    v_actor, p_etiqueta_id::text, jsonb_build_object('etiqueta_id', p_etiqueta_id));

  return jsonb_build_object('llave', v_llave, 'expira_en', v_expira);
end;
$fn$;

comment on function retail.crear_campana_vista_previa(uuid) is
  'Tienda web ▸ Campañas: crea un enlace de vista previa privada del diseño (borrador o programado) que dura 7 días y devuelve su llave UNA vez (la base solo guarda la huella). Pide el módulo campanas_web y firma con el responsable; a lo más 20 vivos por campaña.';

revoke all on function retail.crear_campana_vista_previa(uuid) from public, anon;
grant execute on function retail.crear_campana_vista_previa(uuid) to authenticated;

-- Lo que lee la tienda con una llave: la campaña con su diseño, sin importar su estado ni si ya empezó. Una llave que no existe o venció, o una
-- campaña que ya terminó o dejó de serlo, es «nada»: la tienda dice que el enlace no sirve.
create or replace function retail.tienda_diseno_campana_previa(p_llave text)
returns jsonb
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select coalesce((
    select jsonb_build_object(
      'campana', jsonb_build_object(
        'nombre', e.nombre, 'pct', e.descuento_pct, 'desde', e.vigente_desde, 'hasta', e.vigente_hasta,
        'diseno', retail.fn_campana_web_diseno_tienda(e.id)),
      'expira_en', p.expira_en)
    from retail.campana_web_previas p
    join retail.etiquetas e on e.id = p.etiqueta_id
    where p.huella = encode(digest(coalesce(p_llave, ''), 'sha256'), 'hex')
      and p.expira_en > now()
      and retail.fn_campana_web_valida(e.id)
      and (e.vigente_hasta is null or e.vigente_hasta >= retail.fn_hoy_lima())
  ), jsonb_build_object('campana', null))
$$;

comment on function retail.tienda_diseno_campana_previa(text) is
  'Tienda online: el diseño de una campaña (cualquier estado) con la llave de su vista previa privada. {campana: {nombre, pct, desde, hasta, diseno}, expira_en} o {campana: null}. Solo la llama tienda_web.';

do $$
begin
  revoke all on function retail.tienda_diseno_campana_previa(text) from public, anon, authenticated;
  revoke all on function retail.tienda_diseno_campana() from public, anon, authenticated;
  if exists (select 1 from pg_roles where rolname = 'tienda_web') then
    grant execute on function retail.tienda_diseno_campana_previa(text) to tienda_web;
    grant execute on function retail.tienda_diseno_campana() to tienda_web;
  end if;
end
$$;

reset lock_timeout;
