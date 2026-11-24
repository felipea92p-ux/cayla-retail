-- Margen por rasgos (ADR-0700, Felipe 2026-11-24; maqueta https://claude.ai/artifact/H769t9La8QMYkJEv4QZQUx), actividad 1 de 6:
-- las reglas del precio sugerido de una prenda de proveedor, que solo cambia un Admin. Una sola parte.
--
-- EL PROBLEMA PRIMERO. El ERP sugiere el precio de venta con una sola vara para toda prenda (el piso que aguanta una rebaja de 35 %,
-- ADR-0668): un polo liso que el cliente compara con otras tiendas y una blusa que nadie más tiene salen igual. Felipe decidió una base de
-- margen (30–36 % en estudio; arranca en 37 %, el recomendado: Trujillo paga su tienda desde 36.9 % con los gastos de octubre) y cuatro
-- casillas que la suben, +3 % cada una (puntos de margen: 37 % pasa a 40 %; en pantalla se dicen «%»): «Nadie la tiene», «En tendencia»,
-- «Tela que se nota» y «Marca que el cliente conoce». Las dos últimas no se marcan prenda por prenda: salen de dos listas que el Admin
-- elige una vez (los tejidos que se notan, las marcas que el cliente conoce). El margen es sobre el precio SIN IGV, la cuenta de «Te quedan».
--
-- QUÉ CREA.
--   1. `retail.reglas_de_precio`: una fila cada vez que el Admin cambia la base o los puntos; solo se agregan filas y la vigente es la
--      última. Así, al calibrar los puntos con las ventas (en 3 a 6 meses), se sabe qué regla regía cuando se fijó cada precio. Candados:
--      base de 20 a 60 %, cada casilla de 0 a 10 puntos, y la base con todas las casillas no pasa de 75 % (un margen de 75 % ya pide un
--      precio de casi × 4.7 el costo: más arriba es un error de tecleo). Arranca con la fila de fábrica: 37 % y +3 cada una.
--      La web lleva los mismos números en `lib/margen-por-rasgos.ts` (`problemaDeReglas`), para avisar antes de guardar.
--   2. `tejidos.se_nota` y `marcas.conocida` (falso por defecto): las dos listas.
--   3. Lectura: `fn_reglas_de_precio()` (la vigente; la lee toda cuenta con acceso, porque quien fija un precio la necesita) y
--      `fn_listas_de_precio()` (tejidos y marcas con cuántos modelos activos tiene cada uno, para elegir; módulo Configuración).
--   4. Escritura, solo Admin (`fn_es_admin()`), firmada con el responsable (`fn_actor_persona_id(true)`) y anotada en
--      `configuracion_historial` (Actividad la cuenta sola): `guardar_reglas_de_precio`, `marcar_tejido_que_se_nota`, `marcar_marca_conocida`.
--
-- DECIDÍ: filas que se agregan, como `parametros_tributarios`, y no una fila que se pisa: la calibración necesita saber qué regía y cuándo.
-- DESCARTÉ: (a) los puntos en un jsonb: un candado por columna hace imposible un punto negativo o una casilla que falta; (b) las listas en
-- Catálogo ▸ Tejidos y Marcas: el Admin pasaría por tres pantallas, y esas las edita quien tiene Productos; (c) un módulo nuevo: es una
-- pestaña más de Configuración («lo que se ajusta una vez y todas las pantallas leen»), y guardar exige Admin en cada función.
-- SE ROMPE SI: alguien suma una casilla en la web sin su columna aquí (la lectura no la trae y la web le pone la de fábrica); o se borran
-- todas las filas (la lectura devuelve la de fábrica escrita en la función, nunca vacío).
--
-- CÓMO SE PEGA EN PRODUCCIÓN (solo con el OK de Felipe). Una parte: una tabla nueva sin políticas (RLS encendido; la leen y escriben
-- funciones `security definer`), dos columnas con un default constante en tablas de vocabulario (no se reescriben), funciones nuevas y
-- ningún `drop trigger`. Idempotente: se puede pegar dos veces.

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. Las reglas: una fila por cambio ----------

create table if not exists retail.reglas_de_precio (
  id bigint generated always as identity primary key,
  margen_base smallint not null,
  puntos_nadie_la_tiene smallint not null,
  puntos_en_tendencia smallint not null,
  puntos_tela_que_se_nota smallint not null,
  puntos_marca_conocida smallint not null,
  registrado_por uuid references public.personas (id),
  registrado_en timestamptz not null default clock_timestamp(),
  constraint reglas_de_precio_base check (margen_base between 20 and 60),
  constraint reglas_de_precio_puntos check (
    puntos_nadie_la_tiene between 0 and 10 and puntos_en_tendencia between 0 and 10
    and puntos_tela_que_se_nota between 0 and 10 and puntos_marca_conocida between 0 and 10),
  constraint reglas_de_precio_tope check (
    margen_base + puntos_nadie_la_tiene + puntos_en_tendencia + puntos_tela_que_se_nota + puntos_marca_conocida <= 75)
);
comment on table retail.reglas_de_precio is
  'Las reglas del precio sugerido de una prenda de proveedor (ADR-0700): margen base y puntos de cada casilla. Solo se agregan filas; la vigente es la última.';
comment on column retail.reglas_de_precio.margen_base is
  'Margen sobre el precio SIN IGV que se pide a toda prenda, en % (36 = 36 %). La cuenta es la de «Te quedan» (ADR-0668).';

alter table retail.reglas_de_precio enable row level security;
revoke all on retail.reglas_de_precio from public, anon, authenticated;

-- La fila de fábrica (las decisiones del 2026-11-24: la base recomendada, 37 %, y +3 % cada casilla), solo si no hay ninguna.
insert into retail.reglas_de_precio (margen_base, puntos_nadie_la_tiene, puntos_en_tendencia, puntos_tela_que_se_nota, puntos_marca_conocida)
select 37, 3, 3, 3, 3
where not exists (select 1 from retail.reglas_de_precio);

-- ---------- 2. Las dos listas ----------

alter table retail.tejidos add column if not exists se_nota boolean not null default false;
comment on column retail.tejidos.se_nota is
  'Está en la lista «Tejidos que se notan» (ADR-0700): la prenda de este tejido llega con «Tela que se nota» marcada. Lo cambia un Admin.';
alter table retail.marcas add column if not exists conocida boolean not null default false;
comment on column retail.marcas.conocida is
  'Está en la lista «Marcas que el cliente conoce» (ADR-0700): la prenda de esta marca suma esa casilla sola. Lo cambia un Admin.';

-- ---------- 3. Lectura ----------

-- La regla vigente, como la lee la web (`leerReglas`). Sin filas, la de fábrica: quien fija un precio nunca se queda sin regla.
create or replace function retail.fn_reglas_de_precio()
returns jsonb
language plpgsql stable security definer set search_path = retail, public, extensions as $$
declare
  r retail.reglas_de_precio;
begin
  if not coalesce(retail.fn_tiene_acceso_retail(), false) then
    raise exception 'Tu cuenta no tiene acceso al ERP.' using errcode = '42501';
  end if;
  select * into r from retail.reglas_de_precio order by id desc limit 1;
  if r.id is null then
    return jsonb_build_object('margen_base', 37,
      'puntos', jsonb_build_object('nadie_la_tiene', 3, 'en_tendencia', 3, 'tela_que_se_nota', 3, 'marca_conocida', 3),
      'registrado_en', null, 'registrado_por', null);
  end if;
  return jsonb_build_object('margen_base', r.margen_base,
    'puntos', jsonb_build_object('nadie_la_tiene', r.puntos_nadie_la_tiene, 'en_tendencia', r.puntos_en_tendencia,
                                 'tela_que_se_nota', r.puntos_tela_que_se_nota, 'marca_conocida', r.puntos_marca_conocida),
    'registrado_en', r.registrado_en,
    'registrado_por', (select nullif(trim(concat_ws(' ', p.nombres, p.apellidos)), '') from public.personas p where p.id = r.registrado_por));
end $$;

-- Los tejidos aprobados y activos, y las marcas activas con algún modelo (o ya en la lista), con cuántos modelos activos lleva cada uno:
-- el Admin elige mirando primero lo que más se vende. Los modelos de prueba no cuentan.
create or replace function retail.fn_listas_de_precio()
returns jsonb
language plpgsql stable security definer set search_path = retail, public, extensions as $$
begin
  if not coalesce(retail.fn_puede_configurar(), false) then
    raise exception 'Ver las listas del precio necesita el módulo «Configuración» en tu rol.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'tejidos', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'nombre', t.nombre, 'marcado', t.se_nota, 'modelos', t.modelos)
                       order by t.modelos desc, t.nombre)
        from (select te.id, te.nombre, te.se_nota,
                     (select count(*) from retail.productos p where p.tejido_id = te.id and p.estado = 'activo' and not p.es_prueba) as modelos
                from retail.tejidos te
               where te.activo and te.estado = 'aprobado') t), '[]'::jsonb),
    'marcas', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'nombre', m.nombre, 'marcado', m.conocida, 'modelos', m.modelos)
                       order by m.modelos desc, m.nombre)
        from (select ma.id, ma.nombre, ma.conocida,
                     (select count(*) from retail.productos p where p.marca_id = ma.id and p.estado = 'activo' and not p.es_prueba) as modelos
                from retail.marcas ma
               where ma.activo) m
       where m.modelos > 0 or m.conocida), '[]'::jsonb));
end $$;

-- ---------- 4. Escritura: solo Admin ----------

create or replace function retail.guardar_reglas_de_precio(p_margen_base integer, p_puntos jsonb)
returns jsonb
language plpgsql security definer set search_path = retail, public, extensions as $$
declare
  v_actor uuid;
  v_antes retail.reglas_de_precio;
  v_nadie integer;
  v_tendencia integer;
  v_tela integer;
  v_marca integer;
begin
  if not coalesce(retail.fn_es_admin(), false) then
    raise exception 'Solo un Admin cambia las reglas del precio.' using errcode = '42501';
  end if;
  -- Cada casilla tiene que venir, y entera: una que falta no vale 0 en silencio.
  if p_puntos is null or jsonb_typeof(p_puntos) <> 'object'
     or exists (select 1 from unnest(array['nadie_la_tiene', 'en_tendencia', 'tela_que_se_nota', 'marca_conocida']) k
                 where jsonb_typeof(p_puntos -> k) is distinct from 'number' or (p_puntos ->> k) !~ '^\d+$') then
    raise exception 'Falta el %% de alguna casilla.' using errcode = 'P0001';
  end if;
  v_nadie := (p_puntos ->> 'nadie_la_tiene')::integer;
  v_tendencia := (p_puntos ->> 'en_tendencia')::integer;
  v_tela := (p_puntos ->> 'tela_que_se_nota')::integer;
  v_marca := (p_puntos ->> 'marca_conocida')::integer;
  if p_margen_base is null or p_margen_base < 20 or p_margen_base > 60 then
    raise exception 'El margen base va de 20 a 60 %%.' using errcode = 'P0001';
  end if;
  if greatest(v_nadie, v_tendencia, v_tela, v_marca) > 10 then
    raise exception 'Cada casilla suma de 0 a 10 %%.' using errcode = 'P0001';
  end if;
  if p_margen_base + v_nadie + v_tendencia + v_tela + v_marca > 75 then
    raise exception 'La base con todas las casillas no puede pasar de 75 %%.' using errcode = 'P0001';
  end if;

  select * into v_antes from retail.reglas_de_precio order by id desc limit 1;
  -- Igual que la vigente: no hay nada que agregar.
  if v_antes.id is not null and v_antes.margen_base = p_margen_base and v_antes.puntos_nadie_la_tiene = v_nadie
     and v_antes.puntos_en_tendencia = v_tendencia and v_antes.puntos_tela_que_se_nota = v_tela and v_antes.puntos_marca_conocida = v_marca then
    return retail.fn_reglas_de_precio();
  end if;

  v_actor := retail.fn_actor_persona_id(true);
  insert into retail.reglas_de_precio (margen_base, puntos_nadie_la_tiene, puntos_en_tendencia, puntos_tela_que_se_nota, puntos_marca_conocida, registrado_por)
  values (p_margen_base, v_nadie, v_tendencia, v_tela, v_marca, v_actor);

  insert into retail.configuracion_historial (que, detalle, hecho_por)
  values ('reglas_de_precio',
          jsonb_build_object(
            'antes', case when v_antes.id is null then null else jsonb_build_object('margen_base', v_antes.margen_base,
              'nadie_la_tiene', v_antes.puntos_nadie_la_tiene, 'en_tendencia', v_antes.puntos_en_tendencia,
              'tela_que_se_nota', v_antes.puntos_tela_que_se_nota, 'marca_conocida', v_antes.puntos_marca_conocida) end,
            'despues', jsonb_build_object('margen_base', p_margen_base, 'nadie_la_tiene', v_nadie, 'en_tendencia', v_tendencia,
              'tela_que_se_nota', v_tela, 'marca_conocida', v_marca)),
          v_actor);
  return retail.fn_reglas_de_precio();
end $$;

create or replace function retail.marcar_tejido_que_se_nota(p_tejido_id uuid, p_se_nota boolean)
returns void
language plpgsql security definer set search_path = retail, public, extensions as $$
declare
  v_nombre text;
  v_antes boolean;
begin
  if not coalesce(retail.fn_es_admin(), false) then
    raise exception 'Solo un Admin cambia la lista de tejidos que se notan.' using errcode = '42501';
  end if;
  if p_se_nota is null then
    raise exception 'Falta decir si el tejido entra o sale de la lista.' using errcode = 'P0001';
  end if;
  -- Bloquea la fila: dos clics seguidos (o dos Admin a la vez) se aplican en orden y cada uno deja su línea en el historial.
  select t.nombre, t.se_nota into v_nombre, v_antes from retail.tejidos t where t.id = p_tejido_id for update;
  if v_nombre is null then
    raise exception 'Ese tejido ya no existe.' using errcode = 'P0001';
  end if;
  if v_antes = p_se_nota then
    return;
  end if;
  update retail.tejidos set se_nota = p_se_nota where id = p_tejido_id;
  insert into retail.configuracion_historial (que, detalle, hecho_por)
  values ('tejido_que_se_nota', jsonb_build_object('tejido_id', p_tejido_id, 'nombre', v_nombre, 'se_nota', p_se_nota),
          retail.fn_actor_persona_id(true));
end $$;

create or replace function retail.marcar_marca_conocida(p_marca_id uuid, p_conocida boolean)
returns void
language plpgsql security definer set search_path = retail, public, extensions as $$
declare
  v_nombre text;
  v_antes boolean;
begin
  if not coalesce(retail.fn_es_admin(), false) then
    raise exception 'Solo un Admin cambia la lista de marcas que el cliente conoce.' using errcode = '42501';
  end if;
  if p_conocida is null then
    raise exception 'Falta decir si la marca entra o sale de la lista.' using errcode = 'P0001';
  end if;
  select m.nombre, m.conocida into v_nombre, v_antes from retail.marcas m where m.id = p_marca_id for update;
  if v_nombre is null then
    raise exception 'Esa marca ya no existe.' using errcode = 'P0001';
  end if;
  if v_antes = p_conocida then
    return;
  end if;
  update retail.marcas set conocida = p_conocida where id = p_marca_id;
  insert into retail.configuracion_historial (que, detalle, hecho_por)
  values ('marca_conocida', jsonb_build_object('marca_id', p_marca_id, 'nombre', v_nombre, 'conocida', p_conocida),
          retail.fn_actor_persona_id(true));
end $$;

revoke all on function retail.fn_reglas_de_precio() from public, anon;
grant execute on function retail.fn_reglas_de_precio() to authenticated;
revoke all on function retail.fn_listas_de_precio() from public, anon;
grant execute on function retail.fn_listas_de_precio() to authenticated;
revoke all on function retail.guardar_reglas_de_precio(integer, jsonb) from public, anon;
grant execute on function retail.guardar_reglas_de_precio(integer, jsonb) to authenticated;
revoke all on function retail.marcar_tejido_que_se_nota(uuid, boolean) from public, anon;
grant execute on function retail.marcar_tejido_que_se_nota(uuid, boolean) to authenticated;
revoke all on function retail.marcar_marca_conocida(uuid, boolean) from public, anon;
grant execute on function retail.marcar_marca_conocida(uuid, boolean) to authenticated;
