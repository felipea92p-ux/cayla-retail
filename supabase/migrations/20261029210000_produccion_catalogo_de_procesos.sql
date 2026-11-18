-- ============================================================================
-- 20261029210000_produccion_catalogo_de_procesos.sql — CAYLA V2 (ADR-0570, actividad 5 · 2026-10-29)
--
-- EL PROBLEMA PRIMERO.
--   Los pasos de una orden (Ploteo, Corte, Costura, Ojales y botones…) estaban escritos a mano en dos CHECK (`produccion_fases.clave`,
--   `proveedor_tarifas.fase_clave`) y en siete funciones (su nombre, su lugar en la ruta, la validación de la ruta, las tarifas, «lleva ojales» del
--   modelo). Para que el Taller pegue un cierre o mande a lavar una prenda había que programar: una migración y un deploy por cada proceso nuevo.
--   Y lo que el modelo lleva solo se podía decir de los ojales (`producto_taller.lleva_ojales_botones`).
--
-- QUÉ HACE (Felipe, 2026-10-29, ronda 3: «Pegar cierre», «Lavado o teñido» y «Otro…»; «los da de alta el líder, en un catálogo»; «el modelo sugiere y la
-- orden manda»).
--   · `procesos_produccion`: el catálogo, con su nombre, su lugar en la ruta (`secuencia`; bordado y estampado tienen además `secuencia_pieza`), de qué ruta
--     es, si es de la espina, si se marca de un toque (hito), quién lo hace de costumbre y si está activo. Los doce de siempre se siembran con sus mismos
--     números; se suma «Pegar cierre» (después de Costura) y Lavandería pasa a llamarse «Lavado o teñido» y vuelve a ofrecerse en la hoja.
--   · Las dos tablas apuntan al catálogo con llave foránea (se van los dos CHECK). `fn_fase_secuencia` y `fn_fase_nombre` leen el catálogo.
--   · `fn_produccion_fases_normalizar`, `guardar_tarifa_servicio`, `fn_tarifas_de_servicios` y `agregar_paso_orden`: reemplazos ANCLADOS que cambian
--     la lista escrita a mano por una consulta al catálogo.
--   · `guardar_proceso_produccion`: el líder da de alta, renombra, explica o apaga un proceso. `fn_procesos_produccion`: la lista para la web.
--   · `producto_procesos`: qué procesos lleva cada modelo (reemplaza a `producto_taller.lleva_ojales_botones`, que se copia acá y ya no se lee).
--     `guardar_proceso_modelo` y `fn_procesos_de_modelos`; las dos de ojales siguen con su firma y pasan por la tabla nueva.
--
-- CONTRATO (Liskov)
--   PROMETE: toda fase de una orden y toda tarifa nombra un proceso del catálogo (llave foránea). Un proceso nunca se borra ni cambia de lugar en la
--            ruta: se apaga (`activo = false`) y lo ya abierto sigue igual. Lo de la espina (los que van en toda orden de su ruta) no se apaga. El lugar
--            de un proceso nuevo cae entre dos que ya existen y nunca choca con otro.
--   ASUME:   las funciones vivas con el texto de las migraciones de esta rama hasta 20261029190000 (los anclas se verificaron contra esa base).
--   NO HACE: no deja que un proceso nuevo sea de la espina, se marque de un toque o vaya sobre pieza o prenda: eso cambia la forma de la ruta y sigue
--            siendo código (ADR-0400). No cobra nada: una tarifa sigue siendo de la lista de precios de cada proveedor.
--
-- DECIDÍ: el lugar de un proceso nuevo se pide como «va después de …» y se guarda como un número entre sus vecinos (en esta base los doce dejan 5 de
--   hueco). Así la CHECK `secuencia = fn_fase_secuencia(...)` de `produccion_fases` sigue valiendo, y la ruta de una orden ya abierta no se mueve.
-- DESCARTÉ: sembrar «Lavado o teñido» como un proceso nuevo. Lavandería ya era eso (su ayuda decía «Lavado o teñido de la prenda armada»): dos
--   procesos para lo mismo partirían las tarifas y las órdenes en dos.
-- DESCARTÉ: una clave numérica. La clave en texto es la que ya guardan las órdenes y las tarifas; la de un proceso nuevo sale de su nombre.
-- SE ROMPE SI: un proceso nuevo cae en una ruta con pasos que ya empezaron después de él: `agregar_paso_orden` lo rechaza como siempre
--   (`paso_despues_empezado`).
--
-- PRODUCCIÓN. NO está aplicada. Una sola parte, re-ejecutable, `lock_timeout = 3s`: una tabla nueva sin políticas (RLS encendido; solo la leen funciones
-- `security definer`), dos llaves foráneas, funciones y CUATRO reemplazos anclados (ADR-0288). Sin `drop trigger` ni políticas. Ningún `select … into`
-- dentro de un texto de reemplazo. Va DESPUÉS de 20261029190000. Prueba: `pnpm pruebas:produccion-catalogo-de-procesos`.
-- ============================================================================
set lock_timeout = '3s';

create or replace function pg_temp.reemplazar_anclado(p_firma text, p_viejo text, p_nuevo text)
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

-- 1. El catálogo.
create table if not exists retail.procesos_produccion (
  clave text primary key check (clave ~ '^[a-z][a-z0-9_]{1,39}$'),
  nombre text not null check (btrim(nombre) <> '' and length(nombre) <= 40),
  ayuda text check (ayuda is null or length(ayuda) <= 160),
  -- El lugar en la ruta. Bordado y estampado tienen dos: sobre la pieza cortada (`secuencia_pieza`) o sobre la prenda armada (`secuencia`).
  secuencia smallint not null unique,
  secuencia_pieza smallint unique,
  ruta text not null default 'ambas' check (ruta in ('anterior', 'nueva', 'ambas')),
  -- Va en toda orden de su ruta: no se apaga.
  espina boolean not null default false,
  -- Se marca «hecho» de un toque (hoy solo Ploteo).
  hito boolean not null default false,
  -- Uno de los doce de siempre: su clave la usa el código.
  del_sistema boolean not null default false,
  -- La hoja «Nueva orden» lo ofrece.
  en_la_hoja boolean not null default true,
  -- Quién lo hace de costumbre: con eso nace el paso al agregarlo.
  quien_sugerido text not null default 'taller' check (quien_sugerido in ('taller', 'servicio')),
  activo boolean not null default true,
  creado_por uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint procesos_produccion_espina_activa check (not espina or activo),
  constraint procesos_produccion_pieza_antes check (secuencia_pieza is null or secuencia_pieza < secuencia)
);
create unique index if not exists procesos_produccion_nombre_unico on retail.procesos_produccion (lower(btrim(nombre)));
alter table retail.procesos_produccion enable row level security;
revoke all on retail.procesos_produccion from anon, authenticated;
comment on table retail.procesos_produccion is
  'Los procesos que puede llevar una orden de producción (ADR-0570, actividad 5). Los da de alta el líder; nunca se borran: se apagan.';

insert into retail.procesos_produccion (clave, nombre, ayuda, secuencia, secuencia_pieza, ruta, espina, hito, del_sistema, en_la_hoja, quien_sugerido) values
  ('ploteo', 'Ploteo', 'La marcada a escala real: define cuánta tela comprar', 5, null, 'nueva', true, true, true, true, 'servicio'),
  ('corte', 'Corte', 'Trazo, tendido y corte', 10, null, 'ambas', true, false, true, true, 'taller'),
  ('habilitado', 'Habilitado', 'Preparar lo cortado para coser: numerar, armar paquetes, sumar avíos y el corte menor de Tricotex', 15, null, 'nueva', true, false, true, true, 'taller'),
  ('costura', 'Costura', 'Armar la prenda: costura, ojal y botón', 30, null, 'ambas', true, false, true, true, 'taller'),
  ('pegar_cierre', 'Pegar cierre', 'Pegar la cremallera a la prenda armada', 32, null, 'ambas', false, false, false, true, 'taller'),
  ('ojales_botones', 'Ojales y botones', 'Solo si el modelo los lleva', 35, null, 'nueva', false, false, true, true, 'taller'),
  ('bordado', 'Bordado', 'Sobre la pieza cortada o sobre la prenda armada', 40, 20, 'ambas', false, false, true, false, 'servicio'),
  ('estampado', 'Estampado', 'Sobre la pieza cortada o sobre la prenda armada', 45, 25, 'ambas', false, false, true, false, 'servicio'),
  ('lavanderia', 'Lavado o teñido', 'Lavar o teñir la prenda armada, antes de planchar', 50, null, 'ambas', false, false, true, true, 'servicio'),
  ('limpieza_revision', 'Limpiar hilos y revisar', 'Quitar hilos sobrantes y revisar cada prenda', 55, null, 'nueva', false, false, true, false, 'taller'),
  ('acabado', 'Acabado', 'Revisión, planchado, etiqueta y embolsado', 60, null, 'anterior', true, false, true, false, 'taller'),
  ('planchado', 'Planchado', 'Planchar la prenda terminada', 65, null, 'nueva', true, false, true, true, 'taller'),
  ('etiquetado_embolsado', 'Etiquetar y embolsar', 'Etiqueta, bolsa y lista para despachar', 70, null, 'nueva', false, false, true, false, 'taller')
on conflict (clave) do nothing;

-- 2. Las dos tablas apuntan al catálogo.
alter table retail.produccion_fases drop constraint if exists produccion_fases_clave_check;
alter table retail.produccion_fases drop constraint if exists produccion_fases_clave_fkey;
alter table retail.produccion_fases add constraint produccion_fases_clave_fkey foreign key (clave) references retail.procesos_produccion (clave);
alter table retail.proveedor_tarifas drop constraint if exists proveedor_tarifas_fase_clave_check;
alter table retail.proveedor_tarifas drop constraint if exists proveedor_tarifas_fase_clave_fkey;
alter table retail.proveedor_tarifas add constraint proveedor_tarifas_fase_clave_fkey foreign key (fase_clave) references retail.procesos_produccion (clave);

-- 3. El nombre y el lugar en la ruta salen del catálogo. Mismos números que antes para los doce de siempre: la CHECK de `produccion_fases` sigue valiendo.
create or replace function retail.fn_fase_secuencia(p_clave text, p_posicion text)
returns smallint
language sql
stable
set search_path = retail, public, extensions
as $$
  select case
    when p.secuencia_pieza is null then p.secuencia
    when p_posicion = 'pieza' then p.secuencia_pieza
    when p_posicion = 'prenda' then p.secuencia
  end
  from retail.procesos_produccion p
  where p.clave = p_clave
$$;

create or replace function retail.fn_fase_nombre(p_clave text)
returns text
language sql
stable
set search_path = retail, public, extensions
as $$
  select coalesce((select p.nombre from retail.procesos_produccion p where p.clave = p_clave), p_clave)
$$;

-- 4. La validación de la ruta pregunta al catálogo, no a una lista escrita a mano.
select pg_temp.reemplazar_anclado('retail.fn_produccion_fases_normalizar(jsonb)',
  $v$    if v_clave not in ('ploteo', 'corte', 'habilitado', 'costura', 'ojales_botones', 'limpieza_revision', 'planchado', 'etiquetado_embolsado',
                       'acabado', 'bordado', 'estampado', 'lavanderia') then$v$,
  $v$    if not exists (select 1 from retail.procesos_produccion pp where pp.clave = v_clave) then$v$);
select pg_temp.reemplazar_anclado('retail.fn_produccion_fases_normalizar(jsonb)',
  $v$    if v_clave in ('bordado', 'estampado') then$v$,
  $v$    if exists (select 1 from retail.procesos_produccion pp where pp.clave = v_clave and pp.secuencia_pieza is not null) then$v$);
select pg_temp.reemplazar_anclado('retail.fn_produccion_fases_normalizar(jsonb)',
  $v$  v_solo_nuevas constant text[] := array['ploteo', 'habilitado', 'ojales_botones', 'limpieza_revision', 'planchado', 'etiquetado_embolsado'];$v$,
  $v$  v_solo_nuevas constant text[] := array(select pp.clave from retail.procesos_produccion pp where pp.ruta = 'nueva');$v$);

-- 5. Una tarifa se le pone a un proceso activo del catálogo; la lista sale en el orden de la ruta.
select pg_temp.reemplazar_anclado('retail.guardar_tarifa_servicio(uuid,text,numeric,integer,numeric,text)',
  $v$  if p_fase_clave is null or p_fase_clave not in ('ploteo', 'corte', 'habilitado', 'costura', 'ojales_botones', 'limpieza_revision', 'planchado',
                                                  'etiquetado_embolsado', 'acabado', 'bordado', 'estampado', 'lavanderia') then$v$,
  $v$  if p_fase_clave is null or not exists (select 1 from retail.procesos_produccion pp where pp.clave = p_fase_clave and pp.activo) then$v$);
select pg_temp.reemplazar_anclado('retail.fn_tarifas_de_servicios()',
  $v$array_position(array['ploteo','corte','habilitado','bordado','estampado','costura','ojales_botones','lavanderia',
                                                    'limpieza_revision','acabado','planchado','etiquetado_embolsado'], v.fase_clave)$v$,
  $v$(select coalesce(pp.secuencia_pieza, pp.secuencia) from retail.procesos_produccion pp where pp.clave = v.fase_clave)$v$);

-- 6. Un paso nuevo en una orden abierta: solo un proceso activo (lo que ya viajaba en la ruta sigue aunque se haya apagado).
select pg_temp.reemplazar_anclado('retail.agregar_paso_orden(uuid,text,text,uuid,numeric,numeric,integer,date,boolean,text)',
  $v$  v_clave := lower(btrim(coalesce(p_clave, '')));
$v$,
  $v$  v_clave := lower(btrim(coalesce(p_clave, '')));
  if not exists (select 1 from retail.procesos_produccion pp where pp.clave = v_clave and pp.activo) then
    raise exception 'Ese proceso no está en el catálogo o está apagado: pídele a un líder que lo active en Servicios y tarifas' using hint = 'proceso_apagado';
  end if;
$v$);

-- 7. La lista para la web: lo ve quien ve Producción.
create or replace function retail.fn_procesos_produccion()
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
begin
  if retail.fn_ve_modulo('produccion') is not true and not retail.fn_es_lider() then
    raise exception 'Esta lectura necesita el módulo «Producción» en tu rol' using errcode = '42501', hint = 'produccion_sin_modulo';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'clave', p.clave, 'nombre', p.nombre, 'ayuda', p.ayuda, 'secuencia', p.secuencia, 'secuencia_pieza', p.secuencia_pieza, 'ruta', p.ruta,
             'espina', p.espina, 'hito', p.hito, 'del_sistema', p.del_sistema, 'en_la_hoja', p.en_la_hoja, 'quien_sugerido', p.quien_sugerido,
             'activo', p.activo, 'usos', (select count(*) from retail.produccion_fases f where f.clave = p.clave))
           order by coalesce(p.secuencia_pieza, p.secuencia))
      from retail.procesos_produccion p), '[]'::jsonb);
end;
$$;

-- 8. El líder da de alta, renombra, explica o apaga un proceso. Sin `p_clave`, crea uno nuevo después de `p_despues_de`; con `p_clave`, lo edita
--    (el lugar en la ruta no cambia nunca: lo ya abierto lo lleva guardado).
create or replace function retail.guardar_proceso_produccion(
  p_nombre text, p_clave text default null, p_despues_de text default null, p_ayuda text default null,
  p_quien_sugerido text default null, p_activo boolean default null)
returns text
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_actor uuid; v_nombre text; v_ayuda text; v_quien text; v_p record; v_desde smallint; v_hasta smallint; v_seq smallint; v_clave text; v_base text; v_n integer;
  v_texto text;
begin
  if not retail.fn_es_lider() then
    raise exception 'Solo un líder da de alta o cambia los procesos del Taller' using errcode = '42501', hint = 'proceso_solo_lider';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  v_nombre := nullif(regexp_replace(btrim(coalesce(p_nombre, '')), '\s+', ' ', 'g'), '');
  v_ayuda := nullif(btrim(coalesce(p_ayuda, '')), '');
  v_quien := nullif(lower(btrim(coalesce(p_quien_sugerido, ''))), '');
  if v_nombre is null or length(v_nombre) > 40 then
    raise exception 'Escribe el nombre del proceso, de hasta 40 letras' using hint = 'proceso_nombre_invalido';
  end if;
  if v_ayuda is not null and length(v_ayuda) > 160 then
    raise exception 'La explicación va en una línea, de hasta 160 letras' using hint = 'proceso_ayuda_invalida';
  end if;
  if v_quien is not null and v_quien not in ('taller', 'servicio') then
    raise exception 'Un proceso lo hace el Taller o un servicio de afuera' using hint = 'proceso_quien_invalido';
  end if;
  -- Un candado para todo el catálogo: dos altas a la vez no se llevan el mismo lugar ni el mismo nombre.
  perform pg_advisory_xact_lock(hashtextextended('procesos_produccion', 0));
  -- Repetido es el mismo nombre sin tildes, mayúsculas ni signos: «CONTROL FINAL!» es «Control final».
  if exists (select 1 from retail.procesos_produccion p
              where regexp_replace(translate(lower(p.nombre), 'áéíóúüñ', 'aeiouun'), '[^a-z0-9]+', '', 'g')
                  = regexp_replace(translate(lower(v_nombre), 'áéíóúüñ', 'aeiouun'), '[^a-z0-9]+', '', 'g')
                and p.clave is distinct from p_clave) then
    raise exception 'Ya hay un proceso que se llama «%»', v_nombre using hint = 'proceso_repetido';
  end if;

  if p_clave is not null then
    for v_p in select * from retail.procesos_produccion p where p.clave = p_clave for update loop
      exit;
    end loop;
    if v_p.clave is null then
      raise exception 'Ese proceso no existe' using hint = 'proceso_inexistente';
    end if;
    if p_activo is false and v_p.espina then
      raise exception '«%» va en toda orden: no se puede apagar', v_p.nombre using hint = 'proceso_espina';
    end if;
    update retail.procesos_produccion p
       set nombre = v_nombre, ayuda = coalesce(v_ayuda, p.ayuda), quien_sugerido = coalesce(v_quien, p.quien_sugerido),
           activo = coalesce(p_activo, p.activo), en_la_hoja = case when p_activo is true then true else p.en_la_hoja end, updated_at = now()
     where p.clave = p_clave;
    v_clave := p_clave;
    v_texto := case when p_activo is false and v_p.activo then 'apagó el proceso ' || v_nombre
                    when p_activo is true and not v_p.activo then 'volvió a activar el proceso ' || v_nombre
                    when v_nombre <> v_p.nombre then 'renombró el proceso ' || v_p.nombre || ' a ' || v_nombre
                    else 'cambió el proceso ' || v_nombre end;
  else
    -- El lugar: entre el proceso de antes y el que le sigue en la ruta (contando también los lugares sobre pieza).
    v_desde := (select p.secuencia from retail.procesos_produccion p where p.clave = coalesce(p_despues_de, 'costura'));
    if v_desde is null then
      raise exception 'Elige después de qué proceso va' using hint = 'proceso_sin_lugar';
    end if;
    v_hasta := (select min(s) from (select p.secuencia as s from retail.procesos_produccion p
                                     union all select p.secuencia_pieza from retail.procesos_produccion p where p.secuencia_pieza is not null) x
                 where s > v_desde);
    v_seq := case when v_hasta is null then v_desde + 5 else (v_desde + v_hasta) / 2 end;
    if v_seq <= v_desde or v_seq >= coalesce(v_hasta, 32767) then
      raise exception 'Ya no queda lugar justo después de ese proceso: elige otro de al lado' using hint = 'proceso_sin_lugar';
    end if;
    -- La clave sale del nombre: minúsculas, sin tildes, guiones bajos. Si ya existe, se le agrega un número.
    v_base := left(btrim(regexp_replace(translate(lower(v_nombre), 'áéíóúüñ', 'aeiouun'), '[^a-z0-9]+', '_', 'g'), '_'), 34);
    if v_base !~ '^[a-z]' then
      v_base := 'p_' || v_base;
    end if;
    if length(v_base) < 2 then
      v_base := 'proceso';
    end if;
    v_clave := v_base;
    v_n := 1;
    while exists (select 1 from retail.procesos_produccion p where p.clave = v_clave) loop
      v_n := v_n + 1;
      v_clave := v_base || '_' || v_n;
    end loop;
    insert into retail.procesos_produccion (clave, nombre, ayuda, secuencia, ruta, quien_sugerido, activo, creado_por)
      values (v_clave, v_nombre, v_ayuda, v_seq, 'ambas', coalesce(v_quien, 'taller'), coalesce(p_activo, true), v_actor);
    v_texto := 'dio de alta el proceso ' || v_nombre;
  end if;

  begin
    perform retail.fn_actividad_anotar(
      'produccion', 'proceso_guardado', v_texto,
      v_actor, retail.fn_actividad_terminal_ahora(), retail.fn_ubicacion_actual_persona(), retail.fn_ubicacion_actual_persona(),
      'procesos_produccion', v_clave, now(), jsonb_build_object('clave', v_clave, 'nombre', v_nombre), 'vivo');
  exception when others then
    raise warning 'actividad: no se anotó el proceso % (%)', v_clave, sqlerrm;
  end;
  return v_clave;
end;
$$;

-- 9. Qué procesos lleva cada modelo. Reemplaza a `producto_taller.lleva_ojales_botones` (se copia; la columna ya no se lee).
create table if not exists retail.producto_procesos (
  -- La fila se va con el modelo, como la de `producto_taller`.
  producto_id uuid not null references retail.productos (id) on delete cascade,
  proceso_clave text not null references retail.procesos_produccion (clave),
  lleva boolean not null,
  declarado_por uuid,
  updated_at timestamptz not null default now(),
  primary key (producto_id, proceso_clave)
);
alter table retail.producto_procesos enable row level security;
revoke all on retail.producto_procesos from anon, authenticated;
comment on table retail.producto_procesos is
  'Qué procesos lleva (o no) cada modelo: la hoja «Nueva orden» los sugiere y la orden manda (ADR-0570, actividad 5). Reemplaza a producto_taller.lleva_ojales_botones.';
comment on column retail.producto_taller.lleva_ojales_botones is
  'Reemplazada por retail.producto_procesos (proceso_clave = ''ojales_botones'') en ADR-0570, actividad 5. Ya no se lee ni se escribe.';
insert into retail.producto_procesos (producto_id, proceso_clave, lleva, declarado_por, updated_at)
  select t.producto_id, 'ojales_botones', t.lleva_ojales_botones, t.declarado_por, t.updated_at from retail.producto_taller t
on conflict (producto_id, proceso_clave) do nothing;

create or replace function retail.guardar_proceso_modelo(p_ubicacion_id uuid, p_producto_id uuid, p_clave text, p_lleva boolean)
returns boolean
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_actor uuid; v_ref text; v_nombre text;
begin
  perform retail.fn_produccion_exigir_operar(p_ubicacion_id);
  if not exists (select 1 from retail.ubicaciones u where u.id = p_ubicacion_id and u.tipo = 'taller') then
    raise exception 'Lo que lleva el modelo se anota desde el Taller' using hint = 'proceso_modelo_no_es_taller';
  end if;
  if p_lleva is null then
    raise exception 'Di si el modelo lleva ese proceso' using hint = 'proceso_modelo_sin_respuesta';
  end if;
  v_nombre := (select p.nombre from retail.procesos_produccion p where p.clave = p_clave);
  if v_nombre is null then
    raise exception 'Ese proceso no existe' using hint = 'proceso_inexistente';
  end if;
  v_ref := (select p.referencia from retail.productos p where p.id = p_producto_id and p.estado_alta <> 'rechazado');
  if v_ref is null then
    raise exception 'Ese modelo no existe' using hint = 'proceso_modelo_inexistente';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  -- Un candado por modelo (ADR-0190), el mismo que usaban los ojales.
  perform pg_advisory_xact_lock(hashtextextended('producto_taller:' || p_producto_id::text, 0));
  if exists (select 1 from retail.producto_procesos x where x.producto_id = p_producto_id and x.proceso_clave = p_clave and x.lleva = p_lleva) then
    return false;
  end if;
  insert into retail.producto_procesos (producto_id, proceso_clave, lleva, declarado_por, updated_at)
    values (p_producto_id, p_clave, p_lleva, v_actor, now())
  on conflict (producto_id, proceso_clave) do update set lleva = excluded.lleva, declarado_por = excluded.declarado_por, updated_at = excluded.updated_at;
  begin
    perform retail.fn_actividad_anotar(
      'produccion', 'producto_proceso',
      case when p_lleva then 'anotó que ' || v_ref || ' lleva ' || v_nombre else 'anotó que ' || v_ref || ' no lleva ' || v_nombre end,
      v_actor, retail.fn_actividad_terminal_ahora(), p_ubicacion_id, p_ubicacion_id,
      'productos', p_producto_id::text, now(), jsonb_build_object('producto_id', p_producto_id, 'proceso', p_clave, 'lleva', p_lleva), 'vivo');
  exception when others then
    raise warning 'actividad: no se anotó el proceso % del modelo % (%)', p_clave, p_producto_id, sqlerrm;
  end;
  return true;
end;
$$;

create or replace function retail.fn_procesos_de_modelos()
returns table (producto_id uuid, proceso_clave text, lleva boolean)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
begin
  if retail.fn_ve_modulo('produccion') is not true then
    raise exception 'Esta lectura necesita el módulo «Producción» en tu rol' using errcode = '42501', hint = 'produccion_sin_modulo';
  end if;
  return query select x.producto_id, x.proceso_clave, x.lleva from retail.producto_procesos x order by x.producto_id, x.proceso_clave;
end;
$$;

-- Las dos de ojales siguen con su firma (la web de antes las llama hasta que se publique la nueva) y pasan por la tabla nueva.
create or replace function retail.guardar_ojales_botones_modelo(p_ubicacion_id uuid, p_producto_id uuid, p_lleva boolean)
returns boolean
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
begin
  -- Los mismos avisos de antes (la web de antes los traduce por su `hint`), y después la tabla nueva.
  perform retail.fn_produccion_exigir_operar(p_ubicacion_id);
  if not exists (select 1 from retail.ubicaciones u where u.id = p_ubicacion_id and u.tipo = 'taller') then
    raise exception 'Los ojales y botones del modelo se anotan desde el Taller' using hint = 'ojales_botones_no_es_taller';
  end if;
  if p_lleva is null then
    raise exception 'Di si el modelo lleva ojales y botones' using hint = 'ojales_botones_sin_respuesta';
  end if;
  if not exists (select 1 from retail.productos p where p.id = p_producto_id and p.estado_alta <> 'rechazado') then
    raise exception 'Ese modelo no existe' using hint = 'ojales_botones_modelo_inexistente';
  end if;
  return retail.guardar_proceso_modelo(p_ubicacion_id, p_producto_id, 'ojales_botones', p_lleva);
end;
$$;

create or replace function retail.fn_ojales_botones_de_modelos()
returns table (producto_id uuid, lleva_ojales_botones boolean)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
begin
  if retail.fn_ve_modulo('produccion') is not true then
    raise exception 'Esta lectura necesita el módulo «Producción» en tu rol' using errcode = '42501', hint = 'produccion_sin_modulo';
  end if;
  return query select x.producto_id, x.lleva from retail.producto_procesos x where x.proceso_clave = 'ojales_botones' order by x.producto_id;
end;
$$;

revoke all on function retail.fn_procesos_produccion() from public, anon;
revoke all on function retail.guardar_proceso_produccion(text, text, text, text, text, boolean) from public, anon;
revoke all on function retail.guardar_proceso_modelo(uuid, uuid, text, boolean) from public, anon;
revoke all on function retail.fn_procesos_de_modelos() from public, anon;
grant execute on function retail.fn_procesos_produccion() to authenticated;
grant execute on function retail.guardar_proceso_produccion(text, text, text, text, text, boolean) to authenticated;
grant execute on function retail.guardar_proceso_modelo(uuid, uuid, text, boolean) to authenticated;
grant execute on function retail.fn_procesos_de_modelos() to authenticated;
