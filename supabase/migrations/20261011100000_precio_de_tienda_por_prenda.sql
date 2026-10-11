-- ============================================================================
-- 20261011100000_precio_de_tienda_por_prenda.sql — CAYLA V2 (Felipe, 2026-10-10; corrige 20261010100000, ADR-0370)
--
-- EL PROBLEMA (FAL-0008, producción, 10-oct 22:35). Felipe puso AQP a S/ 79.90, subió la grilla de 69.90 a 79.90 y puso TRU a
-- S/ 69.90. Quedó: AQP con un «precio propio» IGUAL a la grilla, «3 precios» donde había 2, y en TRU todo decía 79.90. La causa
-- de fondo no era la pantalla sino cómo se guardaba: el precio de una tienda se copiaba en una fila POR VARIANTE
-- (`precios_sede.variante_id`), y nada lo mantenía al día cuando la prenda cambiaba:
--   · una talla o un color nuevo, una talla reactivada o un alta al vuelo del Conteo nacían SIN fila → en esa tienda se vendían
--     al precio de la grilla y la misma falda tenía DOS precios en la misma caja (justo lo que ADR-0370 quería impedir);
--   · una talla desactivada conservaba su precio viejo y lo volvía a cobrar al reactivarse;
--   · cambiar la grilla dejaba vigente un «precio propio» igual a ella (la promesa de `poner_precio_sede`, «igual al general nunca
--     queda guardado como excepción», solo la cumplía una de las dos puertas).
-- Principio 2: si el inventario (aquí, el precio) puede quedar en un estado imposible, el diseño está mal.
--
-- LO QUE HACE. El precio de una tienda pasa a ser de la PRENDA, no de cada variante (la decisión del ADR: «la prenda entera»):
--   1. `precios_sede_prenda`: una fila por prenda y tienda; una sola vigente por par. Se archiva, nunca se borra ni se edita.
--      Toda variante de la prenda —también la que nazca mañana o se reactive— vale ese precio en esa tienda: dos precios de la
--      misma prenda en la misma caja dejan de ser posibles por construcción.
--   2. `precios_sede` (la de 20261010100000) queda como HISTORIA: sus filas vigentes pasan a la tabla nueva y se archivan, y un
--      disparador impide escribirle de nuevo. No se borra nada.
--   3. `fn_precio_en_sede(variante, sede)` (misma firma: Vender, el candado de la venta, Apartados, Cambios, Proformas y Ventas sin
--      registrar no cambian) lee el precio de la PRENDA en esa tienda; si no hay, el de la grilla (`variantes.precio`).
--   4. Un precio de tienda IGUAL al de la grilla en todas las tallas activas se quita solo, al final de cada transacción que cambia
--      `variantes` (disparador diferido: un guardado que cambia 9 tallas de a una no lo quita a medio camino). Queda anotado.
--   5. `poner_precio_sede` / `quitar_precio_sede` / `fn_precios_sede_producto` / `fn_precios_en_sede`: mismas firmas, sobre la tabla
--      nueva. El historial se sigue anotando por variante (Actividad y el Historial de la prenda no cambian).
--   6. Actividad lo dice mejor: «puso precio propio en TRU: S/ 69.90 (antes S/ 79.90, el de la prenda)», no «S/ 79.90 → S/ 69.90».
--
-- DATOS EN PRODUCCIÓN (hoy: FAL-0008 con AQP 79.90 y TRU 69.90; POL-0023 con AQP 39.90). Las vigentes pasan una a una. Después se
-- depura: el de AQP en FAL-0008 es igual a la grilla en sus 9 tallas y se archiva («Quedó igual al precio de la prenda»). En la
-- caja NO cambia nada: AQP ya cobraba 79.90 y lo sigue cobrando.
--
-- PRODUCCIÓN. Una sola parte, re-ejecutable, `lock_timeout = 3s`, sin políticas ni `drop trigger` (`create or replace trigger`).
-- Toma candados breves de `productos`, `ubicaciones` (llaves foráneas) y `variantes` (el disparador nuevo). Prueba:
-- `pnpm pruebas:precio-sede`.
-- SE ROMPE SI: alguien escribe en `precios_sede_prenda` sin pasar por estas funciones (no puede: sin políticas ni grants).
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- ---------- 1. La tabla ----------

create table if not exists retail.precios_sede_prenda (
  id               uuid primary key default gen_random_uuid(),
  producto_id      uuid not null references retail.productos (id),
  ubicacion_id     uuid not null references retail.ubicaciones (id),
  precio           numeric(12,2) not null,
  motivo           text not null,
  -- Desde cuándo vale ESTE precio en esa tienda. Corregir solo el motivo crea otra fila (no se edita) pero no reinicia la fecha.
  vigente_desde    timestamptz not null default now(),
  creado_por       uuid references public.personas (id),
  created_at       timestamptz not null default now(),
  archivado_en     timestamptz,
  archivado_por    uuid references public.personas (id),
  archivado_motivo text,
  constraint precios_sede_prenda_precio_positivo check (precio > 0),
  constraint precios_sede_prenda_motivo_no_vacio check (length(btrim(motivo)) >= 3)
);

comment on table retail.precios_sede_prenda is
  'Precio de una prenda en una tienda (ADR-0370, corregido 2026-10-10): reemplaza a variantes.precio en TODAS las variantes de la prenda, solo en esa tienda. Se lee con fn_precio_en_sede; se escribe solo con poner_precio_sede / quitar_precio_sede; se archiva solo si queda igual a la grilla.';
comment on column retail.precios_sede_prenda.archivado_en is 'Cuándo dejó de valer (se quitó, se cambió o quedó igual a la grilla). Vacío = vigente. Nunca se borra la fila.';
comment on column retail.precios_sede_prenda.archivado_motivo is 'Por qué dejó de valer, si no fue reemplazada por otra (lo escribe quien lo quita, o «Quedó igual al precio de la prenda»).';

create unique index if not exists precios_sede_prenda_vigente_unico
  on retail.precios_sede_prenda (producto_id, ubicacion_id) where archivado_en is null;
create index if not exists precios_sede_prenda_ubicacion_vigente_idx
  on retail.precios_sede_prenda (ubicacion_id) where archivado_en is null;

alter table retail.precios_sede_prenda enable row level security;
revoke all on table retail.precios_sede_prenda from public, anon, authenticated;

-- Una fila no se borra ni se reescribe: solo se archiva, una vez.
create or replace function retail.fn_precios_sede_prenda_inmutable() returns trigger
language plpgsql set search_path = retail, public, extensions as $fn$
begin
  if tg_op = 'DELETE' then
    raise exception 'Un precio de tienda no se borra: se quita (queda archivado).';
  end if;
  if old.archivado_en is not null
     or new.producto_id <> old.producto_id or new.ubicacion_id <> old.ubicacion_id
     or new.precio <> old.precio or new.motivo <> old.motivo or new.vigente_desde <> old.vigente_desde
     or new.creado_por is distinct from old.creado_por or new.created_at <> old.created_at then
    raise exception 'Un precio de tienda no se edita: se quita y se pone otro.';
  end if;
  return new;
end;
$fn$;

create or replace trigger precios_sede_prenda_inmutable
  before update or delete on retail.precios_sede_prenda
  for each row execute function retail.fn_precios_sede_prenda_inmutable();

-- Poner o quitar un precio de tienda sube la versión del catálogo: toda pantalla abierta se pone al día sola (como 20261010100500).
create or replace trigger catalogo_version_cambio
  after insert or update or delete or truncate on retail.precios_sede_prenda
  for each statement execute function retail.fn_catalogo_cambio();

-- ---------- 2. EL precio de una prenda en una tienda ----------

create or replace function retail.fn_precio_en_sede(p_variante_id uuid, p_ubicacion_id uuid) returns numeric
language sql stable security definer set search_path = retail, public, extensions as $$
  select coalesce(
    (select ps.precio from retail.precios_sede_prenda ps
      where ps.producto_id = v.producto_id and ps.ubicacion_id = p_ubicacion_id and ps.archivado_en is null),
    v.precio)
    from retail.variantes v where v.id = p_variante_id;
$$;
revoke all on function retail.fn_precio_en_sede(uuid, uuid) from public, anon;
grant execute on function retail.fn_precio_en_sede(uuid, uuid) to authenticated;

-- Quién firma una acción que no siempre tiene un responsable (un disparador, un guardado sin combo): nunca hace fallar la acción.
create or replace function retail.fn_precio_sede_actor() returns uuid
language plpgsql stable security definer set search_path = retail, public, extensions as $fn$
begin
  return retail.fn_actor_persona_id(true);
exception when others then
  return null;
end;
$fn$;
revoke all on function retail.fn_precio_sede_actor() from public, anon, authenticated;

-- ---------- 3. Escribir ----------

-- Pone el precio de la prenda en esa tienda (todas sus variantes, también las que nazcan después). Devuelve cuántas variantes
-- activas cubre (0 si no cambió nada). Si el precio es igual al de la grilla en TODAS las tallas activas, no se guarda como
-- excepción: si había uno, se quita.
create or replace function retail.poner_precio_sede(
  p_producto_id uuid, p_ubicacion_id uuid, p_precio numeric, p_motivo text
) returns integer
language plpgsql security definer set search_path = retail, public, extensions as $fn$
declare
  v_actor uuid;
  v_precio numeric(12,2) := round(p_precio, 2);
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_vig retail.precios_sede_prenda%rowtype;
  v_activas integer;
  v_igual_grilla boolean;
  v_var record;
begin
  if p_precio is null or v_precio <= 0 then
    raise exception 'Escribe un precio mayor que cero.';
  end if;
  if length(v_motivo) < 3 then
    raise exception 'Escribe por qué esta tienda tiene otro precio.';
  end if;
  perform retail.fn_precio_sede_exigir(p_producto_id, p_ubicacion_id);
  v_actor := retail.fn_actor_persona_id(true);

  select count(*), coalesce(bool_and(v.precio = v_precio), false)
    into v_activas, v_igual_grilla
    from retail.variantes v where v.producto_id = p_producto_id and v.activo;
  if v_activas = 0 then
    raise exception 'Esta prenda no tiene tallas activas: actívala antes de ponerle precio.';
  end if;

  for v_vig in
    select * from retail.precios_sede_prenda ps
     where ps.producto_id = p_producto_id and ps.ubicacion_id = p_ubicacion_id and ps.archivado_en is null
  loop
    exit;
  end loop;

  if v_igual_grilla then
    if v_vig.id is null then
      raise exception 'Ese ya es el precio de la prenda en todas sus tallas: no hace falta un precio propio para esta tienda.';
    end if;
    -- Igualarla a la grilla es quitarla.
    return retail.quitar_precio_sede(p_producto_id, p_ubicacion_id, v_motivo);
  end if;

  -- Mismo precio y mismo motivo: nada que hacer. Un motivo distinto SÍ es un cambio (20261010100600): nace otra fila, con la misma
  -- fecha de inicio.
  if v_vig.id is not null and v_vig.precio = v_precio and v_vig.motivo = v_motivo then
    return 0;
  end if;

  if v_vig.id is not null then
    update retail.precios_sede_prenda set archivado_en = now(), archivado_por = v_actor where id = v_vig.id;
  end if;
  insert into retail.precios_sede_prenda (producto_id, ubicacion_id, precio, motivo, vigente_desde, creado_por)
  values (p_producto_id, p_ubicacion_id, v_precio, v_motivo,
          case when v_vig.id is not null and v_vig.precio = v_precio then v_vig.vigente_desde else now() end, v_actor);

  for v_var in
    select v.id, v.precio from retail.variantes v where v.producto_id = p_producto_id and v.activo order by v.id
  loop
    perform retail.fn_precio_sede_anotar(v_var.id, p_ubicacion_id,
      coalesce(v_vig.precio, v_var.precio), v_vig.id is not null, v_precio, true, v_motivo, v_actor);
  end loop;
  return v_activas;
end;
$fn$;
revoke all on function retail.poner_precio_sede(uuid, uuid, numeric, text) from public, anon;
grant execute on function retail.poner_precio_sede(uuid, uuid, numeric, text) to authenticated;

-- La prenda vuelve a la grilla en esa tienda. Devuelve cuántas variantes activas cubría (0 si no tenía precio de tienda).
create or replace function retail.quitar_precio_sede(
  p_producto_id uuid, p_ubicacion_id uuid, p_motivo text default null
) returns integer
language plpgsql security definer set search_path = retail, public, extensions as $fn$
declare
  v_actor uuid;
  v_vig retail.precios_sede_prenda%rowtype;
  v_var record;
  v_n integer := 0;
begin
  perform retail.fn_precio_sede_exigir(p_producto_id, p_ubicacion_id);
  v_actor := retail.fn_actor_persona_id(true);

  for v_vig in
    select * from retail.precios_sede_prenda ps
     where ps.producto_id = p_producto_id and ps.ubicacion_id = p_ubicacion_id and ps.archivado_en is null
  loop
    exit;
  end loop;
  if v_vig.id is null then
    return 0;
  end if;

  update retail.precios_sede_prenda
     set archivado_en = now(), archivado_por = v_actor, archivado_motivo = nullif(btrim(coalesce(p_motivo, '')), '')
   where id = v_vig.id;
  for v_var in
    select v.id, v.precio from retail.variantes v where v.producto_id = p_producto_id and v.activo order by v.id
  loop
    perform retail.fn_precio_sede_anotar(v_var.id, p_ubicacion_id, v_vig.precio, true, v_var.precio, false, p_motivo, v_actor);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$fn$;
revoke all on function retail.quitar_precio_sede(uuid, uuid, text) from public, anon;
grant execute on function retail.quitar_precio_sede(uuid, uuid, text) to authenticated;

-- Un precio de tienda que quedó IGUAL a la grilla en todas las tallas activas deja de ser excepción: se archiva y se anota. No
-- pide permisos (lo llama el disparador de `variantes`, después de que quien cambió la grilla ya pasó los suyos).
create or replace function retail.fn_precio_sede_depurar(p_producto_id uuid) returns integer
language plpgsql security definer set search_path = retail, public, extensions as $fn$
declare
  v_vig record;
  v_var record;
  v_actor uuid;
  v_n integer := 0;
  c_motivo constant text := 'Quedó igual al precio de la prenda';
begin
  for v_vig in
    select ps.id, ps.ubicacion_id, ps.precio
      from retail.precios_sede_prenda ps
     where ps.producto_id = p_producto_id and ps.archivado_en is null
       and exists (select 1 from retail.variantes v where v.producto_id = p_producto_id and v.activo)
       and not exists (select 1 from retail.variantes v where v.producto_id = p_producto_id and v.activo and v.precio <> ps.precio)
  loop
    if v_actor is null then
      v_actor := retail.fn_precio_sede_actor();
    end if;
    update retail.precios_sede_prenda
       set archivado_en = now(), archivado_por = v_actor, archivado_motivo = c_motivo
     where id = v_vig.id;
    for v_var in
      select v.id, v.precio from retail.variantes v where v.producto_id = p_producto_id and v.activo order by v.id
    loop
      perform retail.fn_precio_sede_anotar(v_var.id, v_vig.ubicacion_id, v_vig.precio, true, v_var.precio, false, c_motivo, v_actor);
    end loop;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$fn$;
revoke all on function retail.fn_precio_sede_depurar(uuid) from public, anon, authenticated;

-- El disparador: al final de la transacción (diferido), así un guardado que cambia la grilla talla por talla no quita el precio
-- de tienda en un estado intermedio. Solo mira prendas que tienen alguno vigente (barato en todo lo demás).
create or replace function retail.fn_variantes_depurar_precio_de_tienda() returns trigger
language plpgsql security definer set search_path = retail, public, extensions as $fn$
begin
  if exists (select 1 from retail.precios_sede_prenda ps where ps.producto_id = new.producto_id and ps.archivado_en is null) then
    perform retail.fn_precio_sede_depurar(new.producto_id);
  end if;
  return null;
end;
$fn$;
revoke all on function retail.fn_variantes_depurar_precio_de_tienda() from public, anon, authenticated;

-- Postgres no acepta `create or replace` en un disparador de restricción, y `drop trigger` toma las tablas de `auth` y `storage`
-- (CLAUDE.md, «Políticas y deadlocks»): se crea solo si falta. Su función sí se reemplaza arriba.
do $do$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'retail.variantes'::regclass and tgname = 'variantes_depurar_precio_de_tienda') then
    create constraint trigger variantes_depurar_precio_de_tienda
      after insert or update of precio, activo on retail.variantes
      deferrable initially deferred
      for each row execute function retail.fn_variantes_depurar_precio_de_tienda();
  end if;
end;
$do$;

-- ---------- 4. Leer ----------

-- La ficha: una fila por tienda con precio propio vigente. `variantes` = cuántas tallas activas cubre (todas: es la prenda).
create or replace function retail.fn_precios_sede_producto(p_producto_id uuid)
returns table (
  ubicacion_id uuid, sede text, precio numeric, variantes integer,
  desde timestamptz, motivo text, creado_por_nombre text
)
language sql stable security definer set search_path = retail, public, extensions as $$
  select ps.ubicacion_id, u.nombre, ps.precio,
         (select count(*)::integer from retail.variantes v where v.producto_id = ps.producto_id and v.activo),
         ps.vigente_desde, ps.motivo,
         nullif(btrim(concat_ws(' ', pe.nombres, pe.apellidos)), '')
    from retail.precios_sede_prenda ps
    join retail.ubicaciones u on u.id = ps.ubicacion_id
    left join public.personas pe on pe.id = ps.creado_por
   where ps.producto_id = p_producto_id and ps.archivado_en is null and auth.uid() is not null
   order by u.nombre;
$$;
revoke all on function retail.fn_precios_sede_producto(uuid) from public, anon;
grant execute on function retail.fn_precios_sede_producto(uuid) to authenticated;

-- Las pantallas de una tienda: qué variantes tienen otro precio ahí (todas las de cada prenda con precio de tienda, también las
-- inactivas: la pantalla decide qué muestra).
create or replace function retail.fn_precios_en_sede(p_ubicacion_id uuid)
returns table (variante_id uuid, precio numeric)
language sql stable security definer set search_path = retail, public, extensions as $$
  select v.id, ps.precio
    from retail.precios_sede_prenda ps
    join retail.variantes v on v.producto_id = ps.producto_id
   where ps.ubicacion_id = p_ubicacion_id and ps.archivado_en is null and auth.uid() is not null;
$$;
revoke all on function retail.fn_precios_en_sede(uuid) from public, anon;
grant execute on function retail.fn_precios_en_sede(uuid) to authenticated;

-- ---------- 5. La tabla vieja queda como historia ----------

-- Las vigentes pasan a la tabla nueva: una por prenda y tienda, con el precio que más filas tenía (si las variantes diferían —el
-- error que esto corrige—, el que cubría más tallas; empate: el más reciente), el motivo más reciente y desde la más antigua.
insert into retail.precios_sede_prenda (producto_id, ubicacion_id, precio, motivo, vigente_desde, creado_por, created_at)
select g.producto_id, g.ubicacion_id, g.precio, g.motivo, g.desde, g.creado_por, g.desde
  from (
    select v.producto_id, ps.ubicacion_id, ps.precio,
           (array_agg(ps.motivo order by ps.created_at desc))[1] as motivo,
           (array_agg(ps.creado_por order by ps.created_at desc))[1] as creado_por,
           min(ps.created_at) as desde,
           row_number() over (partition by v.producto_id, ps.ubicacion_id
                              order by count(*) desc, max(ps.created_at) desc) as n
      from retail.precios_sede ps
      join retail.variantes v on v.id = ps.variante_id
     where ps.archivado_en is null
     group by v.producto_id, ps.ubicacion_id, ps.precio
  ) g
 where g.n = 1
   and not exists (select 1 from retail.precios_sede_prenda x
                    where x.producto_id = g.producto_id and x.ubicacion_id = g.ubicacion_id and x.archivado_en is null);

update retail.precios_sede set archivado_en = now() where archivado_en is null;

comment on table retail.precios_sede is
  'HISTORIA (2026-10-10): precio de tienda por variante, del 2026-10-09 al 2026-10-10. Lo reemplazó precios_sede_prenda (uno por prenda y tienda). No se escribe más; no se borra.';

create or replace function retail.fn_precios_sede_solo_historia() returns trigger
language plpgsql set search_path = retail, public, extensions as $fn$
begin
  raise exception 'precios_sede es historia: el precio de una tienda se guarda en precios_sede_prenda (poner_precio_sede).';
end;
$fn$;

create or replace trigger precios_sede_solo_historia
  before insert on retail.precios_sede
  for each row execute function retail.fn_precios_sede_solo_historia();

-- Lo que pasó quedando igual a la grilla (el de AQP en FAL-0008) deja de ser excepción ya.
select retail.fn_precio_sede_depurar(x.producto_id)
  from (select distinct producto_id from retail.precios_sede_prenda where archivado_en is null) x;

-- ---------- 6. «Eliminar producto» también mira la tabla nueva ----------

create or replace function pg_temp.anclar(p_firma text, p_viejo text, p_nuevo text)
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
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta migración: el texto ancla aparece % veces (se esperaba 1). Regenera el reemplazo desde su definición viva.',
      p_firma, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

select pg_temp.anclar(
  'retail.fn_producto_historia(uuid)',
  $v$      union all select 22, 'precios propios de una tienda', count(*), false
        from retail.precios_sede x where x.variante_id in (select id from vs)$v$,
  $n$      union all select 22, 'precios propios de una tienda', count(*), false
        from retail.precios_sede x where x.variante_id in (select id from vs)
      union all select 23, 'precios de una tienda', count(*), false
        from retail.precios_sede_prenda x where x.producto_id = p_producto_id$n$
);

-- ---------- 7. Actividad lo dice como pasó ----------

-- «puso precio propio en Tienda TRU: S/ 69.90 (antes S/ 79.90, el de la prenda)» · «precio propio en Tienda TRU S/ 69.90 → S/ 64.90» ·
-- «quitó el precio propio de Tienda AQP (vuelve a S/ 79.90)» · «el precio de Tienda AQP quedó igual al de la prenda (S/ 79.90)».
-- «Precio de la prenda» es el de la tabla de Editar producto (`variantes.precio`), como ya lo llama la ficha.
create or replace function retail.fn_actividad_precio_sede(p_antes text, p_despues text) returns text
language plpgsql stable security definer set search_path = retail, public, extensions as $fn$
declare
  v_antes jsonb := p_antes::jsonb;
  v_despues jsonb := p_despues::jsonb;
  v_tienda text;
begin
  v_tienda := coalesce(v_despues ->> 'tienda', v_antes ->> 'tienda',
                       (select u.nombre from retail.ubicaciones u where u.id::text = v_despues ->> 'sede'), 'una tienda');
  if (v_despues ->> 'propio')::boolean then
    if coalesce((v_antes ->> 'propio')::boolean, false) then
      return 'precio propio en ' || v_tienda || ' ' || retail.fn_actividad_soles((v_antes ->> 'precio')::numeric)
        || ' → ' || retail.fn_actividad_soles((v_despues ->> 'precio')::numeric);
    end if;
    return 'puso precio propio en ' || v_tienda || ': ' || retail.fn_actividad_soles((v_despues ->> 'precio')::numeric)
      || ' (antes ' || retail.fn_actividad_soles((v_antes ->> 'precio')::numeric) || ', el de la prenda)';
  end if;
  if v_despues ->> 'motivo' = 'Quedó igual al precio de la prenda' then
    return 'el precio de ' || v_tienda || ' quedó igual al de la prenda (' || retail.fn_actividad_soles((v_despues ->> 'precio')::numeric) || ')';
  end if;
  return 'quitó el precio propio de ' || v_tienda || ' (vuelve a ' || retail.fn_actividad_soles((v_despues ->> 'precio')::numeric) || ')';
exception when others then
  return 'precio de tienda';
end;
$fn$;
revoke all on function retail.fn_actividad_precio_sede(text, text) from public, anon, authenticated;
