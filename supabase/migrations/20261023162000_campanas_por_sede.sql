-- ============================================================================
-- 20261023162000 — Campañas por sede: un descuento que rige solo en las tiendas que se elijan (ADR-0486, Felipe 2026-10-23)
--
-- EL PROBLEMA. Una campaña (una fila de `retail.etiquetas` con descuento) rige en TODAS las tiendas: `fn_campanas_por_variante` no
--   sabe en qué sede se vende. El día del aniversario de CAYLA Felipe quería el descuento solo en Tienda Trujillo. La columna
--   `etiquetas.sedes_permitidas` no sirve: es un candado de verdad que PROHÍBE vender o trasladar la prenda en otra sede
--   (`fn_variante_permitida_en_sede`), no un descuento que solo cuenta en algunas (ADR-0095, 20260918030000).
--
-- LO QUE HACE.
--   1. `retail.campana_sedes (etiqueta_id, ubicacion_id)`: las tiendas donde rige una campaña. SIN filas = rige en todas (las
--      campañas que ya existen no cambian). RLS encendido y sin políticas: se lee y se escribe solo por funciones `security definer`
--      (nada de `create policy`: ADR-0195).
--   2. `fn_campana_rige_en_sede(etiqueta, sede)`: LA regla, escrita una vez. Sin sede (null) solo rigen las campañas de todas las
--      sedes: quien no sabe en qué tienda está nunca da un descuento que no le toca (falla hacia «precio normal», no hacia «regalo»).
--   3. `fn_campanas_en_sede(hoy, tolerancia, variantes, sede)`: la misma consulta de `fn_campanas_por_variante` más la regla.
--      `fn_campanas_por_variante` (3 argumentos) se queda con su firma y pasa a llamarla con sede null.
--   4. `campanas_vigentes(sede)`: lo que lee la caja de cada tienda. `campanas_vigentes()` (sin sede) delega con null.
--   5. Reemplazos ANCLADOS de una llamada en lo que cobra o muestra el descuento (el patrón de ADR-0370, `pnpm pruebas:precio-sede`):
--      `registrar_venta` (2), `separar_prendas` (2), `editar_separacion` (1), `fn_tienda_precio_talla` (1) y
--      `fn_club_avisos_pendientes` (1). Cada reemplazo aborta sin tocar nada si la función viva no es la revisada.
--   6. `campanas_sedes()` (qué tiendas tiene cada campaña, para la pantalla) y `actualizar_campana_etiqueta_con_sedes(...)`: lo de
--      siempre (`actualizar_campana_etiqueta`, con su permiso y sus validaciones) MÁS las sedes, en la misma transacción.
--
-- QUÉ NO HACE. No toca `sedes_permitidas`. No cambia ninguna campaña existente (sin filas = todas las sedes). No registra el cambio
--   de sedes en Actividad (queda en el backlog). Las pantallas que preguntan «qué campañas hay» sin una sede (etiquetas de precio,
--   Catálogo «lo que cobra la caja hoy») usan la regla con sede null: NO muestran una campaña limitada a tiendas.
--
-- DESCARTÉ: una columna `uuid[]` en `etiquetas` (sin FK a `ubicaciones`; un `alter table` sobre una tabla en uso). La tabla nueva
--   es la forma que ya usa `etiqueta_categorias` y se pega en producción sin tocar tablas vivas.
-- DESCARTÉ: reescribir `registrar_venta` entera: son 42 mil caracteres con 40 parches encima; un reemplazo anclado de una llamada se
--   revisa en una línea y aborta si la función cambió.
-- DESCARTÉ: que `fn_campanas_por_variante` sin sede ignore la regla (todas las campañas): es la forma de regalar un descuento por
--   olvidar pasar la sede. Sin sede = solo lo que rige en todas.
--
-- ORDEN AL DESPLEGAR. Pegar esto en producción PRIMERO y publicar la web DESPUÉS. Con la web vieja la caja pregunta
--   `campanas_vigentes()` sin sede: no ve una campaña limitada a tiendas, y `registrar_venta` sí la exige en esa tienda
--   (`venta_campana_omitida`) hasta que la caja se actualice (el aviso «Hay una versión nueva» la recarga). Con ninguna campaña
--   limitada, todo es idéntico a antes.
--
-- CÓMO SE PEGA. Este archivo tal cual en el SQL Editor de producción, de una vez. Idempotente, `lock_timeout` 3 s, sin políticas,
--   sin `drop trigger` y sin `alter` sobre tablas en uso. `pnpm pruebas:campanas-por-sede` es su prueba.
-- CAÍDA EXTERNA. Nada llama a la red.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- 0. La guarda: lo que se reescribe entero es lo del repo o esto mismo ---------------------------------------------------------

do $$
declare
  v_f record;
  v_cuerpo text;
begin
  for v_f in
    select * from (values
      ('retail.fn_campanas_por_variante(date,integer,uuid[])', array['2ecef945d46e5042116386c6b6764add']),
      ('retail.campanas_vigentes()', array['1aadd7b32e4ba984d8bb9c1c9dcd7f2d'])
    ) as t(firma, md5s)
  loop
    v_cuerpo := (select prosrc from pg_proc where oid = to_regprocedure(v_f.firma));
    if v_cuerpo is null then
      raise exception '% no existe: esta migración va después de 20260918170000. No se aplicó nada.', v_f.firma;
    end if;
    if position('ADR-0486' in v_cuerpo) = 0 and not (md5(v_cuerpo) = any (v_f.md5s)) then
      raise exception '% cambió desde que se escribió esta migración (md5 %): regenera esta migración desde su definición real. No se aplicó nada.',
        v_f.firma, md5(v_cuerpo);
    end if;
  end loop;
end;
$$;

-- 1. Las tiendas donde rige una campaña ----------------------------------------------------------------------------------------

create table if not exists retail.campana_sedes (
  etiqueta_id uuid not null references retail.etiquetas (id),
  ubicacion_id uuid not null references retail.ubicaciones (id),
  created_at timestamptz not null default now(),
  primary key (etiqueta_id, ubicacion_id)
);

alter table retail.campana_sedes enable row level security;
revoke all on table retail.campana_sedes from public, anon, authenticated;

comment on table retail.campana_sedes is
  'ADR-0486. Las tiendas donde rige el descuento de una campaña (etiqueta). SIN filas = rige en todas las sedes. NO es sedes_permitidas: esa prohíbe vender la prenda en otra sede; esta solo decide dónde cuenta el descuento. Se lee con campanas_sedes() y se escribe con actualizar_campana_etiqueta_con_sedes().';

-- 2. LA regla, una vez ---------------------------------------------------------------------------------------------------------

create or replace function retail.fn_campana_rige_en_sede(p_etiqueta_id uuid, p_ubicacion_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'retail', 'public'
as $function$
  select not exists (select 1 from retail.campana_sedes cs where cs.etiqueta_id = p_etiqueta_id)
      or (p_ubicacion_id is not null
          and exists (select 1 from retail.campana_sedes cs where cs.etiqueta_id = p_etiqueta_id and cs.ubicacion_id = p_ubicacion_id))
$function$;

comment on function retail.fn_campana_rige_en_sede(uuid, uuid) is
  'ADR-0486. ¿Esta campaña da su descuento en esta sede? Sin filas en campana_sedes: sí, en todas. Con filas: solo en esas. Sin sede (null): solo las de todas las sedes, nunca una limitada a tiendas.';

-- 3. Qué campañas alcanzan a cada prenda EN una sede ------------------------------------------------------------------------------

create or replace function retail.fn_campanas_en_sede(
  p_hoy date,
  p_tolerancia_dias integer default 0,
  p_variante_ids uuid[] default null,
  p_ubicacion_id uuid default null
) returns table (variante_id uuid, etiqueta_id uuid, etiqueta_nombre text, descuento_pct numeric)
language sql
stable
set search_path to 'retail', 'public'
as $function$
  select v.id, e.id, e.nombre, e.descuento_pct
  from retail.variantes v
  join retail.productos p on p.id = v.producto_id
  join retail.etiquetas e
    on e.estado = 'aprobado' and e.activo and e.descuento_pct is not null
   and (e.vigente_desde is null or e.vigente_desde <= p_hoy)
   and (e.vigente_hasta is null or e.vigente_hasta >= p_hoy - p_tolerancia_dias)
   and retail.fn_campana_rige_en_sede(e.id, p_ubicacion_id)
  where (p_variante_ids is null or v.id = any (p_variante_ids))
    and (
      exists (select 1 from retail.variante_etiquetas ve where ve.variante_id = v.id and ve.etiqueta_id = e.id)
      or exists (select 1 from retail.etiqueta_categorias ec where ec.etiqueta_id = e.id and ec.categoria_id = p.categoria_id)
    )
$function$;

comment on function retail.fn_campanas_en_sede(date, integer, uuid[], uuid) is
  'ADR-0486. Las campañas (aprobadas, activas, con %, vigentes) que alcanzan a cada variante EN esa sede: por etiqueta manual o por categoría, y solo si la campaña rige en la sede (fn_campana_rige_en_sede). Fuente única de la regla; la caja, registrar_venta, los apartados, la tienda web y el club la leen.';

-- La de tres argumentos conserva su firma (lo que la llama sin sede, también desde la web): sin sede = solo las de todas las sedes.
create or replace function retail.fn_campanas_por_variante(
  p_hoy date,
  p_tolerancia_dias integer default 0,
  p_variante_ids uuid[] default null
) returns table (variante_id uuid, etiqueta_id uuid, etiqueta_nombre text, descuento_pct numeric)
language sql
stable
set search_path to 'retail', 'public'
as $function$
  -- ADR-0486: sin sede, solo las campañas que rigen en todas las sedes.
  select c.variante_id, c.etiqueta_id, c.etiqueta_nombre, c.descuento_pct
  from retail.fn_campanas_en_sede(p_hoy, p_tolerancia_dias, p_variante_ids, null::uuid) c
$function$;

-- 4. Lo que lee la caja ----------------------------------------------------------------------------------------------------------

create or replace function retail.campanas_vigentes(p_ubicacion_id uuid)
returns table (variante_id uuid, etiqueta_id uuid, etiqueta_nombre text, descuento_pct numeric)
language sql
stable
set search_path to 'retail', 'public'
as $function$
  select distinct on (c.variante_id) c.variante_id, c.etiqueta_id, c.etiqueta_nombre, c.descuento_pct
  from retail.fn_campanas_en_sede(retail.fn_hoy_lima(), 0, null, p_ubicacion_id) c
  order by c.variante_id, c.descuento_pct desc, c.etiqueta_nombre, c.etiqueta_id
$function$;

comment on function retail.campanas_vigentes(uuid) is
  'ADR-0486. La campaña de mayor % que rige HOY (Lima) para cada variante EN esa sede. Un solo descuento por prenda: el mayor.';

create or replace function retail.campanas_vigentes()
returns table (variante_id uuid, etiqueta_id uuid, etiqueta_nombre text, descuento_pct numeric)
language sql
stable
set search_path to 'retail', 'public'
as $function$
  -- ADR-0486: sin sede, solo las campañas que rigen en todas las sedes.
  select c.variante_id, c.etiqueta_id, c.etiqueta_nombre, c.descuento_pct
  from retail.campanas_vigentes(null::uuid) c
$function$;

-- 5. Lo que cobra y muestra el descuento pregunta por la sede (reemplazos anclados) -------------------------------------------------

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

-- registrar_venta: lo que la caja DEBE dar (venta_campana_omitida) y lo que acepta (venta_campana_no_vigente), en la sede de la venta.
select pg_temp.reemplazar(
  (select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'retail' and p.proname = 'registrar_venta'),
  $v$fn_campanas_por_variante(v_hoy, 0, array[(v_item ->> 'variante_id')::uuid])$v$,
  $v$fn_campanas_en_sede(v_hoy, 0, array[(v_item ->> 'variante_id')::uuid], p_ubicacion_id)$v$,
  1);
select pg_temp.reemplazar(
  (select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'retail' and p.proname = 'registrar_venta'),
  $v$fn_campanas_por_variante(v_hoy, c_tolerancia_campana, array[(v_item ->> 'variante_id')::uuid])$v$,
  $v$fn_campanas_en_sede(v_hoy, c_tolerancia_campana, array[(v_item ->> 'variante_id')::uuid], p_ubicacion_id)$v$,
  1);

-- separar_prendas (Apartados): el descuento con que se separa es el de la sede donde se separa.
select pg_temp.reemplazar(
  (select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'retail' and p.proname = 'separar_prendas'),
  $v$fn_campanas_por_variante(v_hoy, 0, array[v_item.variante_id])$v$,
  $v$fn_campanas_en_sede(v_hoy, 0, array[v_item.variante_id], p_ubicacion_id)$v$,
  2);

-- editar_separacion: la sede es la del apartado.
select pg_temp.reemplazar(
  (select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'retail' and p.proname = 'editar_separacion'),
  $v$fn_campanas_por_variante(v_hoy, 0, array[v_item.variante_id])$v$,
  $v$fn_campanas_en_sede(v_hoy, 0, array[v_item.variante_id], s.ubicacion_id)$v$,
  1);

-- La tienda web: el precio de cada talla en la tienda desde la que se despacha (sin tienda, solo las campañas de todas).
select pg_temp.reemplazar(
  (select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'retail' and p.proname = 'fn_tienda_precio_talla'),
  $v$retail.fn_campanas_por_variante(retail.fn_hoy_lima(), 0, coalesce(p_variantes, '{}'::uuid[]))$v$,
  $v$retail.fn_campanas_en_sede(retail.fn_hoy_lima(), 0, coalesce(p_variantes, '{}'::uuid[]), p_sede)$v$,
  1);

-- El club: la rebaja que se avisa es la que rige en esa tienda.
select pg_temp.reemplazar(
  (select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'retail' and p.proname = 'fn_club_avisos_pendientes'),
  $v$retail.campanas_vigentes() cv$v$,
  $v$retail.campanas_vigentes(p_ubicacion_id) cv$v$,
  1);

-- 6. Para la pantalla: leer y guardar las sedes de una campaña ------------------------------------------------------------------

create or replace function retail.campanas_sedes()
returns table (etiqueta_id uuid, ubicacion_id uuid)
language sql
stable
security definer
set search_path to 'retail', 'public'
as $function$
  select cs.etiqueta_id, cs.ubicacion_id from retail.campana_sedes cs
$function$;

comment on function retail.campanas_sedes() is
  'ADR-0486. Las tiendas de cada campaña limitada a tiendas (las de todas las sedes no aparecen). Lo lee la pantalla de Insignias ▸ Campañas.';

create or replace function retail.actualizar_campana_etiqueta_con_sedes(
  p_etiqueta_id uuid,
  p_descuento_pct numeric,
  p_vigente_desde date,
  p_vigente_hasta date,
  p_categoria_ids uuid[],
  p_sede_ids uuid[]
) returns void
language plpgsql
security definer
set search_path to 'retail', 'public'
as $function$
declare
  v_sedes uuid[];
begin
  -- ADR-0486. Todo lo de siempre (permiso, descuento, fechas, categorías) lo valida y lo guarda la función de siempre; las sedes
  -- van en la misma transacción: o se guarda todo o no se guarda nada.
  perform retail.actualizar_campana_etiqueta(p_etiqueta_id, p_descuento_pct, p_vigente_desde, p_vigente_hasta, p_categoria_ids);

  -- Lista vacía = rige en todas las sedes (sin filas).
  v_sedes := coalesce((select array_agg(distinct s) from unnest(coalesce(p_sede_ids, '{}'::uuid[])) s), '{}'::uuid[]);
  if exists (
    select 1 from unnest(v_sedes) s
     where not exists (select 1 from retail.ubicaciones u where u.id = s and u.tipo = 'tienda' and u.activo)
  ) then
    raise exception 'Una de las sedes ya no es una tienda activa. Recarga la pantalla.';
  end if;

  delete from retail.campana_sedes where etiqueta_id = p_etiqueta_id and not (ubicacion_id = any (v_sedes));
  insert into retail.campana_sedes (etiqueta_id, ubicacion_id)
    select p_etiqueta_id, s from unnest(v_sedes) s
    on conflict (etiqueta_id, ubicacion_id) do nothing;
end;
$function$;

comment on function retail.actualizar_campana_etiqueta_con_sedes(uuid, numeric, date, date, uuid[], uuid[]) is
  'ADR-0486. actualizar_campana_etiqueta (descuento, fechas, categorías) MÁS las tiendas donde rige, todo o nada. p_sede_ids vacío = todas las sedes.';

-- 7. Permisos -------------------------------------------------------------------------------------------------------------------------

revoke all on function retail.fn_campana_rige_en_sede(uuid, uuid) from public, anon;
grant execute on function retail.fn_campana_rige_en_sede(uuid, uuid) to authenticated;
revoke all on function retail.fn_campanas_en_sede(date, integer, uuid[], uuid) from public, anon;
grant execute on function retail.fn_campanas_en_sede(date, integer, uuid[], uuid) to authenticated;
revoke all on function retail.campanas_vigentes(uuid) from public, anon;
grant execute on function retail.campanas_vigentes(uuid) to authenticated;
revoke all on function retail.campanas_sedes() from public, anon;
grant execute on function retail.campanas_sedes() to authenticated;
revoke all on function retail.actualizar_campana_etiqueta_con_sedes(uuid, numeric, date, date, uuid[], uuid[]) from public, anon;
grant execute on function retail.actualizar_campana_etiqueta_con_sedes(uuid, numeric, date, date, uuid[], uuid[]) to authenticated;

-- 8. Comprobación: cada función que cobra o muestra el descuento ya pregunta por la sede ------------------------------------------

do $$
declare
  v_f record;
  v_def text;
begin
  for v_f in
    select * from (values
      ('registrar_venta', 'fn_campanas_en_sede('),
      ('separar_prendas', 'fn_campanas_en_sede('),
      ('editar_separacion', 'fn_campanas_en_sede('),
      ('fn_tienda_precio_talla', 'fn_campanas_en_sede('),
      ('fn_club_avisos_pendientes', 'campanas_vigentes(p_ubicacion_id)')
    ) as t(nombre, debe)
  loop
    v_def := (select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'retail' and p.proname = v_f.nombre);
    if position(v_f.debe in v_def) = 0 or position('fn_campanas_por_variante(' in v_def) > 0 then
      raise exception '% no quedó preguntando por la sede (ADR-0486). No se aplicó nada.', v_f.nombre;
    end if;
  end loop;
end;
$$;
