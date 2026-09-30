-- ============================================================================
-- PEGAR EN PRODUCCIÓN — ENSAYO de «dónde se registró cada producto» (2026-09-30, ADR-0292)
--
-- No es un archivo de migración numerado (mismo patrón que los demás `pegar-en-produccion-*.sql` de esta carpeta): es el
-- ENSAYO. Corre la migración `20260930170000_producto_anota_donde_se_registro.sql` tal cual y, con sus objetos ya creados,
-- prueba contra los datos REALES de producción que el disparador anota la sede, y que la web solo lee con la función. Termina
-- SIEMPRE con un error a propósito («ENSAYO OK …» o «ENSAYO FALLÓ …»): todo corre en una sola transacción implícita, así que
-- ese error deshace la migración y los productos de prueba. No deja nada. El mensaje del error trae el resultado de cada paso.
--
-- Por qué esto y no `begin; …; rollback;`: el SQL Editor y el MCP devuelven el resultado del último statement, y tras un
-- `rollback` no queda ninguno; un error a propósito devuelve el informe Y garantiza el rollback aunque alguien borre la última línea.
--
-- PARA APLICAR DE VERDAD: pegar SOLO `supabase/migrations/20260930170000_producto_anota_donde_se_registro.sql` (una sola parte,
-- sin políticas ni `alter` de tablas en uso). El ensayo de esta fecha salió bien; su resultado está en la bitácora de la rama.
-- ============================================================================

-- Transacción explícita: si quien lo corra envía los statements por separado, tampoco se confirma nada.
begin;

-- Dónde se registró cada producto (Felipe, 2026-09-30, ADR-0292): «necesito ver dónde fue registrado, si en AQP o en TRU, ya que
-- comparten el mismo catálogo global y solo se diferencian en inventario».
--
-- EL PROBLEMA. `productos` es el catálogo de TODAS las sedes: no tiene sede, y no debe tenerla (principio 1: el núcleo
-- producto/variante/stock no se toca). Pero el almacén de una sede necesita saber si lo que aparece nuevo lo registró su propia
-- sede o la otra: para no crear dos veces la misma prenda, y para saber a quién preguntarle. Hoy ese dato no existe en ninguna parte:
-- las funciones de alta (`crear_producto_con_variantes`, `crear_producto_con_stock_inicial`, `censo_crear_variante`) no lo anotan.
--
-- LA DECISIÓN. Una tabla aparte, `producto_origen`, con UNA fila por producto: en qué sede se registró, desde qué terminal y quién lo
-- propuso. La llena un disparador sobre `productos`, así que cubre TODA forma de dar de alta un producto (las tres funciones de hoy, el
-- censo por lotes y cualquier INSERT futuro) sin reescribir ninguna de ellas; sus versiones vivas en producción no son las de ningún archivo
-- (ADR-0283) y tocarlas era el riesgo grande de la otra opción. NO va en `actividad` (ADR-0207): esa bitácora alimenta la pantalla
-- Actividad por módulo y meter ahí «producto_creado» obligaría a cambiar esa pantalla; esto es un dato del catálogo, no una línea de
-- actividad.
--
-- DE DÓNDE SALE LA SEDE (`fn_ubicacion_de_la_operacion`):
--   1. una TERMINAL: la tienda de la terminal (es un aparato fijo);
--   2. una PERSONA: la sede en la que está operando, que la web manda en `x-ubicacion` (el mismo encabezado que ya exige
--      `fn_actor_persona_id`), si puede operar en ella;
--   3. si no, la sede de partida de la persona (`fn_ubicacion_actual_persona`).
-- Si nada de eso la dice, la fila queda con sede vacía: se sabe QUE se registró pero no DÓNDE. Jamás se inventa.
--
-- NUNCA FRENA UN ALTA (principio 9): anotar el origen va dentro de su propio bloque con `exception`; si falla, el producto se crea igual
-- y queda un aviso en el log de la base.
--
-- SIN HISTORIA. Los productos que ya existen no tienen origen y no se les inventa uno: la pantalla no muestra sede en esos.
--
-- CÓMO LEERLA. La tabla tiene RLS encendido y SIN políticas (solo la tocan funciones `security definer`): una política nueva
-- toma en exclusiva las 21 tablas de `auth` y `storage` y puede chocar con el Asesor de seguridad del panel (ADR-0195). Se lee con
-- `fn_producto_origen(uuid[])`, que devuelve solo el producto, la sede y su nombre: el catálogo es de todos.
--
-- PARA PEGAR EN PRODUCCIÓN (una sola parte; no hay políticas): esta migración crea en el schema `retail` y no toca ninguna función
-- existente; es idempotente. Antes, ensayo con `begin; …; rollback;` (CLAUDE.md, «Cómo aplicar SQL a producción»).

set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- ---------- 1. La tabla ----------

create table if not exists retail.producto_origen (
  producto_id   uuid primary key references retail.productos(id) on delete cascade,
  ubicacion_id  uuid references retail.ubicaciones(id),
  terminal_id   uuid references retail.terminales(id),
  persona_id    uuid references public.personas(id),
  registrado_at timestamptz not null default now()
);

comment on table retail.producto_origen is
  'En qué sede se registró cada producto (una fila por producto). La llena el disparador trg_producto_anota_origen; sin historia: los productos anteriores a 20260930170000 no tienen fila. ubicacion_id vacío = se sabe que se registró pero no dónde. RLS sin políticas: solo se lee con fn_producto_origen(). ADR-0292.';
comment on column retail.producto_origen.ubicacion_id is 'La sede desde la que se operó al registrarlo (ver fn_ubicacion_de_la_operacion). NO es una sede «dueña» del producto: el catálogo es global.';
comment on column retail.producto_origen.persona_id is 'Quien propuso el producto (productos.propuesto_por en ese momento).';

create index if not exists producto_origen_ubicacion_idx on retail.producto_origen (ubicacion_id, registrado_at desc);

alter table retail.producto_origen enable row level security;
revoke all on retail.producto_origen from public, anon, authenticated;

-- ---------- 2. La sede desde la que se está operando ----------

create or replace function retail.fn_ubicacion_de_la_operacion() returns uuid
language plpgsql stable security definer set search_path = retail, public, extensions as $fn$
declare
  v_terminal_ubicacion uuid;
  v_headers jsonb;
  v_ubicacion uuid;
begin
  -- Una terminal es un aparato fijo a una tienda.
  select t.ubicacion_id into v_terminal_ubicacion from retail.fn_terminal_actual() t limit 1;
  if v_terminal_ubicacion is not null then
    return v_terminal_ubicacion;
  end if;
  -- Una persona opera en la sede que la web le manda en `x-ubicacion` (la misma que valida fn_actor_persona_id).
  begin
    v_headers := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
    v_ubicacion := nullif(trim(v_headers ->> 'x-ubicacion'), '')::uuid;
  exception when others then
    v_ubicacion := null;
  end;
  if v_ubicacion is not null and retail.fn_puede_operar_ubicacion(v_ubicacion) then
    return v_ubicacion;
  end if;
  -- Sin encabezado: donde parte la persona.
  return retail.fn_ubicacion_actual_persona();
end;
$fn$;

comment on function retail.fn_ubicacion_de_la_operacion() is
  'La sede desde la que se está operando: la tienda de la terminal, o la sede de x-ubicacion si la persona puede operar en ella, o su sede de partida; NULL si ninguna. Para anotar dónde se hizo algo (producto_origen). ADR-0292.';

-- ---------- 3. El disparador: cada producto nuevo anota su origen ----------

create or replace function retail.fn_producto_anota_origen() returns trigger
language plpgsql security definer set search_path = retail, public, extensions as $fn$
declare
  v_terminal uuid;
begin
  begin
    select t.id into v_terminal from retail.fn_terminal_actual() t limit 1;
    insert into retail.producto_origen (producto_id, ubicacion_id, terminal_id, persona_id, registrado_at)
    values (new.id, retail.fn_ubicacion_de_la_operacion(), v_terminal, new.propuesto_por, coalesce(new.created_at, now()))
    on conflict (producto_id) do nothing;
  exception when others then
    -- Anotar el origen no puede frenar un alta (principio 9): el producto se crea igual.
    raise warning 'producto_origen: no se pudo anotar el origen del producto %: %', new.id, sqlerrm;
  end;
  return new;
end;
$fn$;

comment on function retail.fn_producto_anota_origen() is
  'Disparador de productos: anota en producto_origen la sede, la terminal y la persona del alta. Nunca falla: si no puede anotar, el producto se crea igual. ADR-0292.';

create or replace trigger trg_producto_anota_origen
  after insert on retail.productos
  for each row execute function retail.fn_producto_anota_origen();

-- ---------- 4. La lectura ----------

create or replace function retail.fn_producto_origen(p_producto_ids uuid[])
returns table (producto_id uuid, ubicacion_id uuid, ubicacion_nombre text)
language sql stable security definer set search_path = retail, public, extensions as $fn$
  select o.producto_id, o.ubicacion_id, u.nombre
  from retail.producto_origen o
  left join retail.ubicaciones u on u.id = o.ubicacion_id
  where o.producto_id = any(p_producto_ids);
$fn$;

comment on function retail.fn_producto_origen(uuid[]) is
  'En qué sede se registró cada producto pedido (solo los que tienen origen anotado). El catálogo es de todos: cualquier cuenta con sesión lo lee. ADR-0292.';

revoke execute on function retail.fn_ubicacion_de_la_operacion() from public, anon;
revoke execute on function retail.fn_producto_anota_origen() from public, anon, authenticated;
revoke execute on function retail.fn_producto_origen(uuid[]) from public, anon;
grant execute on function retail.fn_ubicacion_de_la_operacion() to authenticated;
grant execute on function retail.fn_producto_origen(uuid[]) to authenticated;


-- ---------------------------------------------------------------------------
-- ENSAYO: desde aquí hasta el final no deja nada (termina en error a propósito).
-- ---------------------------------------------------------------------------
create temp table ensayo_resultado (paso text, ok boolean, detalle text);

do $ensayo$
declare
  v_auth uuid; v_persona uuid;
  v_aqp uuid; v_tru uuid;
  v_cat uuid; v_marca uuid; v_prov uuid;
  v_p1 uuid := gen_random_uuid(); v_p2 uuid := gen_random_uuid(); v_p3 uuid := gen_random_uuid();
  v_viejo uuid;
  v_ubic uuid; v_pers uuid; v_propuesto uuid; v_term uuid;
  v_esperado uuid;
  v_n int; v_nombre text; v_msg text;
  v_fallos int; v_informe text;
begin
  -- Quién opera: un líder real con cuenta, de preferencia ADMIN (los permisos del alta no se simulan: corren de verdad, y en producción
  -- una persona que no es admin necesita un responsable presente con asistencia marcada, que un ensayo no puede fingir).
  select p.auth_user_id, p.id into v_auth, v_persona
    from public.personas p join retail.colaboradores c on c.persona_id = p.id
    where c.rol = 'lider' and p.estado = 'activo' and p.auth_user_id is not null
    order by (p.rol = 'admin') desc nulls last limit 1;
  select id into v_aqp from retail.ubicaciones where nombre = 'Tienda AQP';
  select id into v_tru from retail.ubicaciones where nombre = 'Tienda TRU';
  select c.id into v_cat from retail.categorias c where c.activo limit 1;
  select mp.marca_id, mp.proveedor_id into v_marca, v_prov from retail.marca_proveedores mp limit 1;
  select p.id into v_viejo from retail.productos p order by p.created_at limit 1;
  insert into ensayo_resultado values ('datos del ensayo', v_auth is not null and v_aqp is not null and v_tru is not null and v_cat is not null and v_marca is not null and v_viejo is not null,
    format('líder=%s aqp=%s tru=%s cat=%s marca=%s', v_auth is not null, v_aqp is not null, v_tru is not null, v_cat is not null, v_marca is not null));

  -- 1. Forma: tabla con RLS y sin políticas, un disparador, tres funciones.
  insert into ensayo_resultado select 'RLS encendido y sin políticas',
    (select relrowsecurity from pg_class where oid = 'retail.producto_origen'::regclass)
      and (select count(*) from pg_policies where schemaname = 'retail' and tablename = 'producto_origen') = 0, null;
  insert into ensayo_resultado select 'un disparador y tres funciones',
    (select count(*) from pg_trigger where tgrelid = 'retail.productos'::regclass and tgname = 'trg_producto_anota_origen' and not tgisinternal) = 1
      and (select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname in ('fn_producto_origen', 'fn_ubicacion_de_la_operacion', 'fn_producto_anota_origen')) = 3, null;

  -- 2. Sesión del líder operando en AQP (x-ubicacion): el producto queda con origen AQP y con quien lo propuso.
  perform set_config('request.jwt.claim.sub', v_auth::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
  perform set_config('request.headers', json_build_object('x-ubicacion', v_aqp)::text, true);
  begin
    insert into retail.productos (id, categoria_id, referencia, marca_id, proveedor_id, es_prueba)
      values (v_p1, v_cat, 'ensayo origen uno', v_marca, v_prov, false);
    select o.ubicacion_id, o.persona_id, o.terminal_id into v_ubic, v_pers, v_term from retail.producto_origen o where o.producto_id = v_p1;
    select propuesto_por into v_propuesto from retail.productos where id = v_p1;
    insert into ensayo_resultado values ('con x-ubicacion = AQP, el origen es AQP, con quien lo propuso y sin terminal',
      v_ubic = v_aqp and v_pers is not distinct from v_propuesto and v_term is null,
      format('origen_aqp=%s persona_ok=%s terminal_nula=%s', v_ubic = v_aqp, v_pers is not distinct from v_propuesto, v_term is null));
  exception when others then
    get stacked diagnostics v_msg = message_text;
    insert into ensayo_resultado values ('con x-ubicacion = AQP, el origen es AQP, con quien lo propuso y sin terminal', false, v_msg);
  end;

  -- 3. Y con TRU en el encabezado, TRU (el mismo líder puede operar en las dos).
  perform set_config('request.headers', json_build_object('x-ubicacion', v_tru)::text, true);
  begin
    insert into retail.productos (id, categoria_id, referencia, marca_id, proveedor_id, es_prueba)
      values (v_p2, v_cat, 'ensayo origen dos', v_marca, v_prov, false);
    select o.ubicacion_id into v_ubic from retail.producto_origen o where o.producto_id = v_p2;
    insert into ensayo_resultado values ('con x-ubicacion = TRU, el origen es TRU', v_ubic = v_tru, null);
  exception when others then
    get stacked diagnostics v_msg = message_text;
    insert into ensayo_resultado values ('con x-ubicacion = TRU, el origen es TRU', false, v_msg);
  end;

  -- 4. Encabezado que no es un uuid: no rompe el alta; vale la sede de partida de la persona (la que dé la función en esta sesión).
  perform set_config('request.headers', json_build_object('x-ubicacion', 'no-es-un-uuid')::text, true);
  begin
    select retail.fn_ubicacion_actual_persona() into v_esperado;
    insert into retail.productos (id, categoria_id, referencia, marca_id, proveedor_id, es_prueba)
      values (v_p3, v_cat, 'ensayo origen tres', v_marca, v_prov, false);
    select o.ubicacion_id into v_ubic from retail.producto_origen o where o.producto_id = v_p3;
    insert into ensayo_resultado values ('un x-ubicacion mal escrito no rompe el alta y vale la sede de partida',
      v_ubic is not distinct from v_esperado and exists (select 1 from retail.producto_origen where producto_id = v_p3), format('esperada=%s', v_esperado));
  exception when others then
    get stacked diagnostics v_msg = message_text;
    insert into ensayo_resultado values ('un x-ubicacion mal escrito no rompe el alta y vale la sede de partida', false, v_msg);
  end;

  -- 5. La lectura: devuelve el nombre de la sede de los que tienen origen y nada de los anteriores a la tabla.
  begin
    select count(*), max(ubicacion_nombre) into v_n, v_nombre from retail.fn_producto_origen(array[v_p1, v_viejo]);
    insert into ensayo_resultado values ('fn_producto_origen devuelve solo los que tienen origen, con el nombre de la sede', v_n = 1 and v_nombre = 'Tienda AQP', format('filas=%s nombre=%s', v_n, v_nombre));
  exception when others then
    get stacked diagnostics v_msg = message_text;
    insert into ensayo_resultado values ('fn_producto_origen devuelve solo los que tienen origen, con el nombre de la sede', false, v_msg);
  end;

  -- 6. La web (authenticated): no lee ni escribe la tabla, sí lee con la función; anon no llama a la función.
  --    Bajo esos roles no se puede escribir en la tabla de resultados: se anota en variables y se vuelcan al volver al rol de siempre.
  declare
    v_lee text := 'leyó sin error'; v_escribe text := 'escribió sin error'; v_anon text := 'llamó sin error';
  begin
    execute 'set local role authenticated';
    begin
      perform count(*) from retail.producto_origen;
    exception when insufficient_privilege then
      v_lee := 'denegado';
    end;
    begin
      insert into retail.producto_origen (producto_id) values (gen_random_uuid());
    exception when insufficient_privilege then
      v_escribe := 'denegado';
    end;
    select count(*) into v_n from retail.fn_producto_origen(array[v_p1]);
    execute 'reset role';
    execute 'set local role anon';
    begin
      perform * from retail.fn_producto_origen(array[v_p1]);
    exception when insufficient_privilege then
      v_anon := 'denegado';
    end;
    execute 'reset role';
    insert into ensayo_resultado values ('authenticated NO lee la tabla', v_lee = 'denegado', v_lee);
    insert into ensayo_resultado values ('authenticated NO escribe la tabla', v_escribe = 'denegado', v_escribe);
    insert into ensayo_resultado values ('authenticated SÍ lee con fn_producto_origen', v_n = 1, format('filas=%s', v_n));
    insert into ensayo_resultado values ('anon NO llama a fn_producto_origen', v_anon = 'denegado', v_anon);
  exception when others then
    execute 'reset role';
    get stacked diagnostics v_msg = message_text;
    insert into ensayo_resultado values ('permisos de la web', false, v_msg);
  end;

  -- Se limpia la sesión simulada.
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.headers', '{}', true);

  -- Informe: SIEMPRE termina en error para que nada se confirme.
  select count(*) filter (where not ok), string_agg(case when ok then 'OK    ' else 'FALLÓ ' end || paso || coalesce(' [' || detalle || ']', ''), E'\n' order by ctid)
    into v_fallos, v_informe from ensayo_resultado;
  if v_fallos = 0 then
    raise exception E'ENSAYO OK (sin cambios: todo se deshizo a propósito)\n%', v_informe;
  else
    raise exception E'ENSAYO FALLÓ en % paso(s) (sin cambios)\n%', v_fallos, v_informe;
  end if;
end;
$ensayo$;
