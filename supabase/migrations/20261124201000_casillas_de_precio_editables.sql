-- Margen por rasgos (ADR-0700): las casillas de «¿Qué tiene esta prenda?» pasan a ser una lista que edita el Admin. Una sola parte.
--
-- EL PROBLEMA PRIMERO. Las cuatro casillas vivían fijas en la base: una columna de puntos por casilla en `reglas_de_precio`, una columna
-- sí/no por casilla en `producto_rasgos` y la lista de códigos escrita en un candado de `orden_compra_items` y en cada función. Felipe pidió
-- más (2026-11-24: «dame más variedad de opciones»), y con ese diseño cada casilla nueva era una migración que tocaba ocho funciones, con
-- su ensayo y su pegado en producción. Eligió «Lista que edita el Admin».
--
-- QUÉ HACE.
--   1. `retail.rasgos_de_precio`: una fila por casilla (código, nombre, ayuda, cuánto suma, de dónde sale, orden, activa). Nace con las
--      cuatro de siempre (con los puntos que hoy rigen) y las dos que eligió Felipe: «Detalle de diseño» y «Acabado y confección» (+3 %).
--      De dónde sale: `a_mano` (la marca la persona), `por_tejido` (llega marcada por la lista de tejidos; se puede quitar) y `por_marca`
--      (sale sola de la lista de marcas). Hay a lo más una de cada una de las dos últimas: las dos listas son una sola.
--   2. `reglas_de_precio` queda solo para la base (sus columnas de puntos quedan como historia y ya no se escriben).
--   3. `producto_rasgos` guarda listas: `marcados` (lo que alguien marcó) y `quitados` (lo que llegaba por el tejido y alguien quitó). Lo que
--      tenían sus columnas sí/no se pasa a esas listas antes de quitarlas: no se pierde nada.
--   4. El candado de `orden_compra_items.rasgos` deja de nombrar los códigos (los revisa `fn_rasgos_de_linea` contra la lista).
--   5. Las funciones de ADR-0700 leen la lista: `fn_rasgos_de_linea`, `fn_reglas_de_precio` (trae `casillas` y `apagadas`), `guardar_reglas_de_precio`
--      (los puntos por código), `fn_rasgos_de_productos`, `fn_producto_rasgos` y `guardar_rasgos_de_producto` (ahora con dos listas).
--      Nueva: `guardar_casilla_de_precio`, para que un Admin agregue, renombre o apague una casilla.
--   6. REEMPLAZO ANCLADO del bloque de ADR-0700 en `preparar_prenda_al_recibir` (20261124180000): escribe la lista en vez de las tres columnas.
--
-- DECIDÍ: una tabla con la lista y los códigos guardados como texto en la prenda y en la línea de compra (igual que ya se hacía en la línea).
-- DESCARTÉ: (a) seguir sumando columnas: cada casilla nueva costaba una migración; (b) una tabla puente prenda × casilla con llave foránea:
-- una fila por casilla marcada para un dato que se lee entero y se escribe entero; la lista se valida en la función que escribe.
-- SE ROMPE SI: un Admin apaga una casilla que muchas prendas tienen: deja de sumar en todas (es lo que pide «apagar»); su código queda
-- guardado en las prendas y vuelve a contar si la prende otra vez.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (solo con el OK de Felipe). Después de 20261124190000. Una parte: tablas sin políticas, columnas, funciones y un
-- reemplazo anclado que se detiene si el texto vivo cambió. Pensada para viajar por la herramienta de Supabase (ningún texto cierra en una
-- línea de comentario). Idempotente.

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. La lista ----------

create table if not exists retail.rasgos_de_precio (
  codigo text primary key,
  nombre text not null,
  ayuda text,
  puntos smallint not null,
  origen text not null default 'a_mano',
  orden smallint not null,
  activa boolean not null default true,
  registrado_por uuid references public.personas (id),
  registrado_en timestamptz not null default now(),
  constraint rasgos_de_precio_codigo check (codigo ~ '^[a-z][a-z0-9_]{1,39}$'),
  constraint rasgos_de_precio_nombre check (char_length(btrim(nombre)) between 2 and 40),
  constraint rasgos_de_precio_ayuda check (ayuda is null or char_length(ayuda) <= 120),
  constraint rasgos_de_precio_puntos check (puntos between 0 and 10),
  constraint rasgos_de_precio_origen check (origen in ('a_mano', 'por_tejido', 'por_marca'))
);
comment on table retail.rasgos_de_precio is
  'Las casillas de «¿Qué tiene esta prenda?» (ADR-0700): cuánto suma cada una al margen objetivo. La edita un Admin; nada se borra, se apaga.';
comment on column retail.rasgos_de_precio.origen is
  'a_mano: la marca la persona. por_tejido: llega marcada por la lista de tejidos (se puede quitar). por_marca: sale sola de la lista de marcas.';

create unique index if not exists rasgos_de_precio_una_por_lista on retail.rasgos_de_precio (origen) where origen <> 'a_mano';
create unique index if not exists rasgos_de_precio_nombre_unico on retail.rasgos_de_precio (lower(btrim(nombre)));

alter table retail.rasgos_de_precio enable row level security;
revoke all on retail.rasgos_de_precio from public, anon, authenticated;

insert into retail.rasgos_de_precio (codigo, nombre, ayuda, puntos, origen, orden)
select c.codigo, c.nombre, c.ayuda,
       coalesce(case c.codigo
                  when 'nadie_la_tiene' then r.puntos_nadie_la_tiene
                  when 'en_tendencia' then r.puntos_en_tendencia
                  when 'tela_que_se_nota' then r.puntos_tela_que_se_nota
                  when 'marca_conocida' then r.puntos_marca_conocida end, 3),
       c.origen, c.orden
  from (values ('nadie_la_tiene', 'Nadie la tiene', 'La tienda nunca la tuvo y no la venden al lado.', 'a_mano', 10),
               ('en_tendencia', 'En tendencia', 'La piden o se ve en redes esta temporada.', 'a_mano', 20),
               ('tela_que_se_nota', 'Tela que se nota', 'Se siente distinta: más peso, mejor caída o más suave.', 'por_tejido', 30),
               ('detalle_de_diseno', 'Detalle de diseño', 'Bordado, corte o estampado propio que se ve de lejos.', 'a_mano', 40),
               ('acabado_y_confeccion', 'Acabado y confección', 'Forro, costuras limpias o botones buenos que se ven.', 'a_mano', 50),
               ('marca_conocida', 'Marca que el cliente conoce', 'Sale sola de tu lista de marcas.', 'por_marca', 60))
       as c (codigo, nombre, ayuda, origen, orden)
  left join lateral (select * from retail.reglas_de_precio order by id desc limit 1) r on true
on conflict (codigo) do nothing;

-- ---------- 2. La base queda sola ----------

alter table retail.reglas_de_precio alter column puntos_nadie_la_tiene drop not null;
alter table retail.reglas_de_precio alter column puntos_en_tendencia drop not null;
alter table retail.reglas_de_precio alter column puntos_tela_que_se_nota drop not null;
alter table retail.reglas_de_precio alter column puntos_marca_conocida drop not null;
comment on table retail.reglas_de_precio is
  'La base del margen objetivo (ADR-0700). Solo se agregan filas; la vigente es la última. Lo que suma cada casilla vive en rasgos_de_precio (desde 20261124201000; las columnas de puntos quedan como historia).';

-- ---------- 3. Lo que tiene cada prenda, como listas ----------

alter table retail.producto_rasgos add column if not exists marcados text[] not null default '{}';
alter table retail.producto_rasgos add column if not exists quitados text[] not null default '{}';

do $mig$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'retail' and table_name = 'producto_rasgos' and column_name = 'nadie_la_tiene') then
    execute $q$
      update retail.producto_rasgos
         set marcados = array_remove(array[
               case when nadie_la_tiene then 'nadie_la_tiene' end,
               case when en_tendencia then 'en_tendencia' end,
               case when tela_que_se_nota is true then 'tela_que_se_nota' end], null),
             quitados = case when tela_que_se_nota is false then array['tela_que_se_nota'] else '{}'::text[] end
    $q$;
  end if;
end $mig$;

-- ---------- 4. El candado de la línea de compra ya no nombra los códigos ----------

alter table retail.orden_compra_items drop constraint if exists orden_compra_items_rasgos;
alter table retail.orden_compra_items add constraint orden_compra_items_rasgos check (rasgos is null or cardinality(rasgos) between 1 and 20);

-- Lo que un check no alcanza a mirar (otra tabla), lo cuidan dos disparadores, para que ni quien escribe directo deje un estado imposible:
-- una línea o una prenda solo guarda códigos que están en la lista, y una casilla de la lista no se borra ni cambia de código ni de origen
-- (las prendas guardan su código: se apaga y, si hace falta otra, se crea otra).
create or replace function retail.fn_casillas_existen()
returns trigger
language plpgsql security definer set search_path = retail, public, extensions as $$
declare
  v_falta text;
begin
  if tg_table_name = 'orden_compra_items' then
    v_falta := (select e from unnest(new.rasgos) e
                 where not exists (select 1 from retail.rasgos_de_precio r where r.codigo = e) limit 1);
  else
    v_falta := coalesce(
      (select e from unnest(new.marcados) e
        where not exists (select 1 from retail.rasgos_de_precio r where r.codigo = e and r.origen <> 'por_marca') limit 1),
      (select e from unnest(new.quitados) e
        where not exists (select 1 from retail.rasgos_de_precio r where r.codigo = e and r.origen = 'por_tejido') limit 1));
  end if;
  if v_falta is not null then
    raise exception 'La casilla «%» no está en la lista.', v_falta using errcode = '23514', hint = 'rasgo_desconocido';
  end if;
  return new;
end $$;
revoke all on function retail.fn_casillas_existen() from public, anon, authenticated;

create or replace trigger orden_compra_items_casillas_existen
  before insert or update of rasgos on retail.orden_compra_items
  for each row when (new.rasgos is not null) execute function retail.fn_casillas_existen();
create or replace trigger producto_rasgos_casillas_existen
  before insert or update of marcados, quitados on retail.producto_rasgos
  for each row execute function retail.fn_casillas_existen();

create or replace function retail.fn_casilla_no_cambia_de_identidad()
returns trigger
language plpgsql set search_path = retail, public, extensions as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Una casilla no se borra: se apaga.' using errcode = '23514', hint = 'casilla_no_se_borra';
  end if;
  raise exception 'El código y el origen de una casilla no cambian: apágala y crea otra.' using errcode = '23514', hint = 'casilla_fija';
end $$;
revoke all on function retail.fn_casilla_no_cambia_de_identidad() from public, anon, authenticated;

create or replace trigger rasgos_de_precio_no_se_borra
  before delete on retail.rasgos_de_precio
  for each row execute function retail.fn_casilla_no_cambia_de_identidad();
create or replace trigger rasgos_de_precio_identidad_fija
  before update of codigo, origen on retail.rasgos_de_precio
  for each row when (new.codigo is distinct from old.codigo or new.origen is distinct from old.origen)
  execute function retail.fn_casilla_no_cambia_de_identidad();

-- ---------- 5. Las funciones leen la lista ----------

create or replace function retail.fn_rasgos_de_linea(p jsonb)
returns text[]
language plpgsql stable set search_path = retail, public, extensions as $$
declare
  v text[];
begin
  if p is null or jsonb_typeof(p) = 'null' then
    return null;
  end if;
  if jsonb_typeof(p) <> 'array' or exists (
       select 1 from jsonb_array_elements(p) e
        where jsonb_typeof(e) <> 'string'
           or not exists (select 1 from retail.rasgos_de_precio r where r.codigo = e #>> '{}' and r.activa)) then
    raise exception 'Una casilla de la prenda no se entiende' using errcode = 'P0001', hint = 'compra_rapida_rasgos';
  end if;
  v := array(select r.codigo from retail.rasgos_de_precio r
              where r.activa and exists (select 1 from jsonb_array_elements_text(p) e where e = r.codigo)
              order by r.orden, r.codigo);
  return nullif(v, '{}'::text[]);
end $$;
revoke all on function retail.fn_rasgos_de_linea(jsonb) from public, anon, authenticated;

create or replace function retail.fn_reglas_de_precio()
returns jsonb
language plpgsql stable security definer set search_path = retail, public, extensions as $$
declare
  r retail.reglas_de_precio;
  v_casillas jsonb;
  v_listas jsonb;
begin
  if not coalesce(retail.fn_tiene_acceso_retail(), false) then
    raise exception 'Tu cuenta no tiene acceso al ERP.' using errcode = '42501';
  end if;
  v_casillas := coalesce((select jsonb_agg(jsonb_build_object('codigo', c.codigo, 'nombre', c.nombre, 'ayuda', c.ayuda, 'puntos', c.puntos,
                                                              'origen', c.origen, 'orden', c.orden) order by c.orden, c.codigo)
                            from retail.rasgos_de_precio c where c.activa), '[]'::jsonb);
  v_listas := jsonb_build_object(
    'casillas', v_casillas,
    'apagadas', coalesce((select jsonb_agg(jsonb_build_object('codigo', c.codigo, 'nombre', c.nombre, 'ayuda', c.ayuda, 'puntos', c.puntos,
                                                               'origen', c.origen, 'orden', c.orden) order by c.orden, c.codigo)
                            from retail.rasgos_de_precio c where not c.activa), '[]'::jsonb),
    'puntos', coalesce((select jsonb_object_agg(c.codigo, c.puntos) from retail.rasgos_de_precio c where c.activa), '{}'::jsonb),
    'marcas_conocidas', coalesce((select jsonb_agg(m.id order by m.id) from retail.marcas m where m.conocida and m.activo), '[]'::jsonb),
    'tejidos_que_se_notan', coalesce((select jsonb_agg(t.id order by t.id) from retail.tejidos t where t.se_nota and t.activo), '[]'::jsonb));
  select * into r from retail.reglas_de_precio order by id desc limit 1;
  return jsonb_build_object('margen_base', coalesce(r.margen_base, 37),
    'registrado_en', r.registrado_en,
    'registrado_por', (select nullif(trim(concat_ws(' ', p.nombres, p.apellidos)), '') from public.personas p where p.id = r.registrado_por))
    || v_listas;
end $$;
revoke all on function retail.fn_reglas_de_precio() from public, anon;
grant execute on function retail.fn_reglas_de_precio() to authenticated;

create or replace function retail.guardar_reglas_de_precio(p_margen_base integer, p_puntos jsonb)
returns jsonb
language plpgsql security definer set search_path = retail, public, extensions as $$
declare
  v_actor uuid;
  v_base_antes integer;
  v_antes jsonb;
  v_despues jsonb;
begin
  if not coalesce(retail.fn_es_admin(), false) then
    raise exception 'Solo un Admin cambia las reglas del precio.' using errcode = '42501';
  end if;
  if p_puntos is null or jsonb_typeof(p_puntos) <> 'object'
     or exists (select 1 from jsonb_each(p_puntos) k
                 where jsonb_typeof(k.value) <> 'number' or (k.value #>> '{}') !~ '^\d+$'
                    or not exists (select 1 from retail.rasgos_de_precio r where r.codigo = k.key and r.activa))
     or exists (select 1 from retail.rasgos_de_precio r where r.activa and not p_puntos ? r.codigo) then
    raise exception 'Falta el %% de alguna casilla.' using errcode = 'P0001';
  end if;
  if p_margen_base is null or p_margen_base < 20 or p_margen_base > 60 then
    raise exception 'El margen base va de 20 a 60 %%.' using errcode = 'P0001';
  end if;
  if exists (select 1 from jsonb_each_text(p_puntos) k where k.value::integer > 10) then
    raise exception 'Cada casilla suma de 0 a 10 %%.' using errcode = 'P0001';
  end if;
  if p_margen_base + (select coalesce(sum(k.value::integer), 0) from jsonb_each_text(p_puntos) k) > 75 then
    raise exception 'La base con todas las casillas no puede pasar de 75 %%.' using errcode = 'P0001';
  end if;

  -- Dos Admin guardando a la vez se ponen en fila: la lista se bloquea entera.
  perform 1 from retail.rasgos_de_precio for update;
  v_base_antes := (select r.margen_base from retail.reglas_de_precio r order by r.id desc limit 1);
  v_antes := (select jsonb_object_agg(r.codigo, r.puntos) from retail.rasgos_de_precio r where r.activa);
  if v_base_antes is not distinct from p_margen_base and v_antes = (select jsonb_object_agg(k.key, k.value::integer) from jsonb_each_text(p_puntos) k) then
    return retail.fn_reglas_de_precio();
  end if;

  v_actor := retail.fn_actor_persona_id(true);
  if v_base_antes is distinct from p_margen_base then
    insert into retail.reglas_de_precio (margen_base, registrado_por) values (p_margen_base, v_actor);
  end if;
  update retail.rasgos_de_precio r
     set puntos = (p_puntos ->> r.codigo)::integer, registrado_por = v_actor, registrado_en = now()
   where r.activa and r.puntos is distinct from (p_puntos ->> r.codigo)::integer;
  v_despues := (select jsonb_object_agg(r.codigo, r.puntos) from retail.rasgos_de_precio r where r.activa);

  insert into retail.configuracion_historial (que, detalle, hecho_por)
  values ('reglas_de_precio',
          jsonb_build_object('antes', jsonb_build_object('margen_base', v_base_antes, 'puntos', v_antes),
                             'despues', jsonb_build_object('margen_base', p_margen_base, 'puntos', v_despues)),
          v_actor);
  return retail.fn_reglas_de_precio();
end $$;
revoke all on function retail.guardar_reglas_de_precio(integer, jsonb) from public, anon;
grant execute on function retail.guardar_reglas_de_precio(integer, jsonb) to authenticated;

-- Agregar (sin código), renombrar o apagar una casilla. Las que salen de una lista (tejido, marca) no se crean aquí: solo se renombran o apagan.
create or replace function retail.guardar_casilla_de_precio(p_codigo text, p_nombre text, p_ayuda text, p_puntos integer, p_activa boolean)
returns jsonb
language plpgsql security definer set search_path = retail, public, extensions as $$
declare
  v_actor uuid;
  v_nombre text := nullif(btrim(regexp_replace(coalesce(p_nombre, ''), '\s+', ' ', 'g')), '');
  v_ayuda text := nullif(btrim(regexp_replace(coalesce(p_ayuda, ''), '\s+', ' ', 'g')), '');
  v_codigo text;
  v_antes retail.rasgos_de_precio;
  v_base integer;
begin
  if not coalesce(retail.fn_es_admin(), false) then
    raise exception 'Solo un Admin cambia las casillas del precio.' using errcode = '42501';
  end if;
  if v_nombre is null or char_length(v_nombre) < 2 or char_length(v_nombre) > 40 then
    raise exception 'El nombre de la casilla va de 2 a 40 letras.' using errcode = 'P0001', hint = 'casilla_nombre';
  end if;
  if v_ayuda is not null and char_length(v_ayuda) > 120 then
    raise exception 'La ayuda de la casilla va hasta 120 letras.' using errcode = 'P0001', hint = 'casilla_ayuda';
  end if;
  if p_puntos is null or p_puntos < 0 or p_puntos > 10 then
    raise exception 'Cada casilla suma de 0 a 10 %%.' using errcode = 'P0001', hint = 'casilla_puntos';
  end if;
  if p_activa is null then
    raise exception 'Falta decir si la casilla queda prendida.' using errcode = 'P0001';
  end if;

  perform 1 from retail.rasgos_de_precio for update;
  if p_codigo is not null then
    select * into v_antes from retail.rasgos_de_precio r where r.codigo = p_codigo;
    if v_antes.codigo is null then
      raise exception 'Esa casilla ya no existe. Recarga la pantalla.' using errcode = 'P0001', hint = 'casilla_no_existe';
    end if;
  end if;
  if exists (select 1 from retail.rasgos_de_precio r where lower(btrim(r.nombre)) = lower(v_nombre) and r.codigo is distinct from p_codigo) then
    raise exception 'Ya hay una casilla «%».', v_nombre using errcode = 'P0001', hint = 'casilla_repetida';
  end if;
  v_base := coalesce((select r.margen_base from retail.reglas_de_precio r order by r.id desc limit 1), 37);
  if p_activa and v_base + p_puntos + (select coalesce(sum(r.puntos), 0) from retail.rasgos_de_precio r where r.activa and r.codigo is distinct from p_codigo) > 75 then
    raise exception 'La base con todas las casillas no puede pasar de 75 %%.' using errcode = 'P0001', hint = 'casilla_tope';
  end if;

  v_actor := retail.fn_actor_persona_id(true);
  if p_codigo is null then
    v_codigo := left(regexp_replace(regexp_replace(lower(translate(v_nombre, 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunaeiouun')), '[^a-z0-9]+', '_', 'g'), '^_+|_+$', '', 'g'), 36);
    if v_codigo !~ '^[a-z]' then
      v_codigo := 'c_' || v_codigo;
    end if;
    while exists (select 1 from retail.rasgos_de_precio r where r.codigo = v_codigo) loop
      v_codigo := left(v_codigo, 36) || '_' || substr(md5(random()::text), 1, 3);
    end loop;
    insert into retail.rasgos_de_precio (codigo, nombre, ayuda, puntos, origen, orden, activa, registrado_por)
    values (v_codigo, v_nombre, v_ayuda, p_puntos, 'a_mano',
            (select coalesce(max(r.orden), 0) + 10 from retail.rasgos_de_precio r), p_activa, v_actor);
  else
    v_codigo := p_codigo;
    update retail.rasgos_de_precio r
       set nombre = v_nombre, ayuda = v_ayuda, puntos = p_puntos, activa = p_activa, registrado_por = v_actor, registrado_en = now()
     where r.codigo = p_codigo;
  end if;

  insert into retail.configuracion_historial (que, detalle, hecho_por)
  values ('casilla_de_precio',
          jsonb_build_object('codigo', v_codigo,
                             'antes', case when v_antes.codigo is null then null else jsonb_build_object('nombre', v_antes.nombre, 'ayuda', v_antes.ayuda, 'puntos', v_antes.puntos, 'activa', v_antes.activa) end,
                             'despues', jsonb_build_object('nombre', v_nombre, 'ayuda', v_ayuda, 'puntos', p_puntos, 'activa', p_activa)),
          v_actor);
  return retail.fn_reglas_de_precio();
end $$;
revoke all on function retail.guardar_casilla_de_precio(text, text, text, integer, boolean) from public, anon;
grant execute on function retail.guardar_casilla_de_precio(text, text, text, integer, boolean) to authenticated;

create or replace function retail.fn_rasgos_de_productos(p_ids uuid[])
returns jsonb
language plpgsql stable security definer set search_path = retail, public, extensions as $$
begin
  if not coalesce(retail.fn_tiene_acceso_retail(), false) then
    raise exception 'Tu cuenta no tiene acceso al ERP.' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_ids), 0) > 200 then
    raise exception 'Son muchas prendas a la vez: hasta 200.' using hint = 'rasgos_muchas_prendas';
  end if;
  return coalesce((
    select jsonb_object_agg(x.id, x.rasgos)
      from (
        select p.id,
               (select jsonb_agg(c.codigo order by c.orden, c.codigo)
                  from retail.rasgos_de_precio c
                 where c.activa
                   and case c.origen
                         when 'por_marca' then coalesce(m.conocida, false)
                         when 'por_tejido' then not (c.codigo = any (coalesce(r.quitados, '{}'))) and (c.codigo = any (coalesce(r.marcados, '{}')) or coalesce(t.se_nota, false))
                         else c.codigo = any (coalesce(r.marcados, '{}'))
                       end) as rasgos
          from retail.productos p
          left join retail.producto_rasgos r on r.producto_id = p.id
          left join retail.tejidos t on t.id = p.tejido_id
          left join retail.marcas m on m.id = p.marca_id
         where p.id = any (p_ids)
      ) x
     where x.rasgos is not null
  ), '{}'::jsonb);
end $$;
revoke all on function retail.fn_rasgos_de_productos(uuid[]) from public, anon;
grant execute on function retail.fn_rasgos_de_productos(uuid[]) to authenticated;

create or replace function retail.fn_producto_rasgos(p_producto_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = retail, public, extensions as $$
declare
  v jsonb;
begin
  if not coalesce(retail.fn_tiene_acceso_retail(), false) then
    raise exception 'Tu cuenta no tiene acceso al ERP.' using errcode = '42501';
  end if;
  select jsonb_build_object('marcados', to_jsonb(coalesce(r.marcados, '{}'::text[])), 'quitados', to_jsonb(coalesce(r.quitados, '{}'::text[])))
    into v
    from retail.productos p
    left join retail.producto_rasgos r on r.producto_id = p.id
   where p.id = p_producto_id;
  return v;
end $$;
revoke all on function retail.fn_producto_rasgos(uuid) from public, anon;
grant execute on function retail.fn_producto_rasgos(uuid) to authenticated;

drop function if exists retail.guardar_rasgos_de_producto(uuid, boolean, boolean, boolean);

create or replace function retail.guardar_rasgos_de_producto(p_producto_id uuid, p_marcados text[], p_quitados text[] default '{}')
returns text[]
language plpgsql security definer set search_path = retail, public, extensions as $$
declare
  v_actor uuid;
  v_marcados text[];
  v_quitados text[];
begin
  if retail.fn_ve_modulo('productos') is not true then
    raise exception 'No tienes acceso a Productos.' using errcode = '42501', hint = 'sin_permiso';
  end if;
  v_actor := retail.fn_actor_persona_id(true);

  if p_producto_id is null or not exists (select 1 from retail.productos p where p.id = p_producto_id) then
    raise exception 'Esa prenda ya no existe. Recarga la pantalla.' using hint = 'producto_no_existe';
  end if;
  -- Se marca a mano lo que es a mano o llega por el tejido; se quita solo lo que llega por el tejido. La marca nunca se guarda.
  if exists (select 1 from unnest(coalesce(p_marcados, '{}')) e
              where not exists (select 1 from retail.rasgos_de_precio c where c.codigo = e and c.activa and c.origen in ('a_mano', 'por_tejido')))
     or exists (select 1 from unnest(coalesce(p_quitados, '{}')) e
              where not exists (select 1 from retail.rasgos_de_precio c where c.codigo = e and c.activa and c.origen = 'por_tejido')) then
    raise exception 'Una casilla de la prenda no se entiende.' using errcode = 'P0001', hint = 'rasgo_desconocido';
  end if;
  -- Dos personas guardando la misma prenda a la vez: la fila se bloquea y gana la última, entera.
  perform 1 from retail.producto_rasgos r where r.producto_id = p_producto_id for update;
  -- Lo guardado de una casilla apagada no se ve en la pantalla, así que nadie lo quitó: se conserva y vuelve a contar si la prenden.
  v_marcados := array(select distinct x.e from (
                  select unnest(coalesce(p_marcados, '{}')) as e
                  union all
                  select g.e from retail.producto_rasgos r, unnest(r.marcados) as g(e)
                   where r.producto_id = p_producto_id
                     and not exists (select 1 from retail.rasgos_de_precio c where c.codigo = g.e and c.activa)) x
                order by x.e);
  v_quitados := array(select distinct x.e from (
                  select unnest(coalesce(p_quitados, '{}')) as e
                  union all
                  select g.e from retail.producto_rasgos r, unnest(r.quitados) as g(e)
                   where r.producto_id = p_producto_id
                     and not exists (select 1 from retail.rasgos_de_precio c where c.codigo = g.e and c.activa)) x
                 where not (x.e = any (v_marcados))
                order by x.e);

  insert into retail.producto_rasgos (producto_id, marcados, quitados, actualizado_por, actualizado_en)
  values (p_producto_id, v_marcados, v_quitados, v_actor, now())
  on conflict (producto_id) do update
     set marcados = excluded.marcados, quitados = excluded.quitados,
         actualizado_por = excluded.actualizado_por, actualizado_en = excluded.actualizado_en;

  return retail.fn_rasgos_de_producto(p_producto_id);
end $$;
comment on function retail.guardar_rasgos_de_producto(uuid, text[], text[]) is
  'ADR-0700: deja lo que una prenda tiene (marcados, y quitados de lo que llega por el tejido) y devuelve lo que tiene en efecto. Quien ve Productos.';
revoke all on function retail.guardar_rasgos_de_producto(uuid, text[], text[]) from public, anon;
grant execute on function retail.guardar_rasgos_de_producto(uuid, text[], text[]) to authenticated;

-- ---------- 6. Recibir escribe la lista ----------

create or replace function pg_temp.reemplazar_casillas(p_firma text, p_viejo text, p_nuevo text)
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
    raise exception '% cambió desde que se escribió esta migración: el ancla aparece % veces (se esperaba 1). Regenera el reemplazo desde su definición real.',
      p_firma, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

select pg_temp.reemplazar_casillas(
  'retail.preparar_prenda_al_recibir(uuid,uuid,uuid,uuid,uuid,text,jsonb,numeric,text,uuid,uuid,boolean,uuid,uuid)',
  $v$    insert into retail.producto_rasgos (producto_id, nadie_la_tiene, en_tendencia, tela_que_se_nota, actualizado_por)
    select v_producto_id, 'nadie_la_tiene' = any (i.rasgos), 'en_tendencia' = any (i.rasgos),
           case when 'tela_que_se_nota' = any (i.rasgos) then true end, v_actor$v$,
  $n$    insert into retail.producto_rasgos (producto_id, marcados, actualizado_por)
    select v_producto_id,
           array(select c.codigo from retail.rasgos_de_precio c where c.origen in ('a_mano', 'por_tejido') and c.codigo = any (i.rasgos) order by c.codigo),
           v_actor$n$);

-- Las columnas sí/no ya pasaron a las listas y nadie las lee.
alter table retail.producto_rasgos drop column if exists nadie_la_tiene;
alter table retail.producto_rasgos drop column if exists en_tendencia;
alter table retail.producto_rasgos drop column if exists tela_que_se_nota;
comment on table retail.producto_rasgos is
  'Lo que una prenda tiene y le sube el margen objetivo (ADR-0700): marcados y quitados, como códigos de rasgos_de_precio. La marca no va aquí: sale de marcas.conocida.';

-- Comprobación final.
do $$
begin
  if (select count(*) from retail.rasgos_de_precio) < 6 then
    raise exception 'faltan casillas en rasgos_de_precio';
  end if;
  if position('marcados' in pg_get_functiondef('retail.preparar_prenda_al_recibir(uuid,uuid,uuid,uuid,uuid,text,jsonb,numeric,text,uuid,uuid,boolean,uuid,uuid)'::regprocedure)) = 0 then
    raise exception 'preparar_prenda_al_recibir no escribe la lista';
  end if;
  if to_regprocedure('retail.guardar_rasgos_de_producto(uuid,boolean,boolean,boolean)') is not null then
    raise exception 'quedó la firma vieja de guardar_rasgos_de_producto';
  end if;
end;
$$;

reset lock_timeout;
