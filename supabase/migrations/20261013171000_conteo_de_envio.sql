-- ADR-0393 · actividad 2, segundo paso: contar un envío y que lo contado quede guardado, línea por línea.
--
-- EL PROBLEMA PRIMERO. En la fase 4 (ADR-0362) lo contado de un envío vive en el navegador hasta el cierre: un F5, una tablet que se
-- apaga o dos personas contando el mismo fardo y lo hecho se pierde o se pisa sin aviso (hallazgo 2 de /formidable,
-- docs/formidable/recibir-envio.md). La cara A (las 10 decisiones de Felipe del 2026-10-13) cuenta por categoría con un número, separa
-- por nombre si se quiere, y lo hacen varias personas a la vez: cada categoría guarda quién la contó y firma quien cierra (decisión 9).
-- Para eso lo contado tiene que estar en la base desde el primer número, no recién al cerrar.
--
-- QUÉ HACE (una sola parte, re-pegable).
--   1. `despacho_conteos`: una fila por línea del envío (o por algo que no estaba en la guía), escrita al contar: cuántas llegaron
--      (`contadas`), el borrador de «¿Qué blusas son?» (`separado`: prendas conocidas, con o sin sus tallas y colores, y nuevas por
--      cantidad), quién la contó, cuándo y su versión. El costo se fija al cerrar. Se escribe solo con el envío ABIERTO y no se borra
--      nunca (quitar algo es dejarlo en 0); lo separado nunca pasa de lo contado (un CHECK, no una validación).
--   2. `guardar_conteo`: guarda una línea. Si otra persona la guardó después de lo que viste, guarda lo tuyo y te devuelve lo que
--      pisaste («Lucía había puesto 38»): gana el último, con aviso (decisión 9). Agrega también lo que no estaba en la guía.
--   3. `fn_envio_conteos`: lo contado de un envío, con quién contó cada línea y los nombres de lo separado.
--   4. `recibir_despacho` (REEMPLAZO ANCLADO sobre su definición de 20261013170000): lo que se recibe con el formulario de la fase 4
--      queda también como el conteo de cada línea, todo detallado. Así todo envío cerrado se lee igual, se haya contado como se haya
--      contado.
--
-- LO QUE NUNCA DEBE EXISTIR (y quién lo impide):
--   · Lo separado de una línea pasa de lo contado → CHECK `despacho_conteos_separado_cabe`.
--   · Un conteo en un envío en camino, cerrado o anulado, o con una línea de otro envío → disparador `despacho_conteos_fija`.
--   · Dos conteos de la misma línea → únicos parciales (línea; posición de lo de fuera de la guía).
--   · Un conteo borrado, o que cambia de línea → disparador `despacho_conteos_fija`.
--   · Una prenda de otra categoría o marca, o una talla y color de otra prenda → `guardar_conteo` (con la prenda a la vista) y, al
--     cerrar, otra vez `fn_recepcion_entrar`.
--
-- CONTRATO de guardar_conteo
--   PROMETE: con el módulo Recibir, la sede del envío y quien firma (el responsable, que no hizo ninguna de sus órdenes, decisión 17),
--            deja la línea con lo que mandaste y te dice si pisaste otra cosa. Repetir lo mismo no avisa nada.
--   ASUME:   el envío está abierto («Empezar a recibir» es `abrir_despacho`). La pantalla manda lo contado ya corregido (si separaste
--            más de lo que contaste, el número sube: perdonar antes que preguntar, ley 7 de /formidable).
--   NO HACE: no mueve stock, no cierra, no anota actividad (contar no es un hecho del negocio; recibir sí).
--
-- DESCARTÉ:
--   · Guardar lo separado en filas (una por prenda, una por talla): mientras el envío está abierto cambia a cada toque y lo reemplaza
--     entero quien guarda la línea; nadie lo consulta salvo la pantalla. Los hechos nacen al cerrar, en filas (`despacho_recibidos`,
--     y en la actividad 3, `despacho_pendientes`).
--   · Ampliar `fn_envio_detalle` con los conteos: ya lleva dos reemplazos anclados de la fase 5a; una lectura propia no toca nada de lo
--     que ya lee Compras y la pantalla las pide juntas.
--   · Que guardar suba la versión del envío: la versión es de lo que decide Compras (la guía, anularlo); contar una línea no debe
--     hacerle «Alguien cambió este envío» a quien cierra.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). UNA parte, después de 20261013170000. Una tabla NUEVA sin políticas (RLS encendido,
-- se lee y escribe por funciones `security definer`); sin `drop trigger` (los disparadores van con `create or replace trigger`), sin
-- `select … into` dentro de textos entre comillas (ADR-0288). El reemplazo de recibir_despacho aborta sin tocar nada si su definición
-- viva cambió y no hace nada si ya está. Se puede pegar dos veces. El bloque final comprueba que quedó todo.

set lock_timeout = '3s';

-- Reemplazo anclado (el mismo de 20261012211000): falla si la función viva cambió, y es re-ejecutable.
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

-- ---------- 1. Cuánto se separó de una línea (para el CHECK; la forma la valida guardar_conteo antes) ----------
create or replace function retail.fn_conteo_total_separado(p_separado jsonb)
returns integer
language sql
immutable
set search_path = retail, public, extensions
as $$
  select coalesce((select sum((x ->> 'cantidad')::integer) from jsonb_array_elements(coalesce(p_separado -> 'prendas', '[]'::jsonb)) x), 0)::integer
       + coalesce((select sum((x ->> 'cantidad')::integer) from jsonb_array_elements(coalesce(p_separado -> 'nuevas', '[]'::jsonb)) x), 0)::integer;
$$;
comment on function retail.fn_conteo_total_separado(jsonb) is
  'ADR-0393: cuántas prendas de una línea ya se separaron (conocidas + nuevas) en el borrador de despacho_conteos.separado.';
revoke all on function retail.fn_conteo_total_separado(jsonb) from public, anon;
grant execute on function retail.fn_conteo_total_separado(jsonb) to authenticated, service_role;

-- ---------- 2. Lo contado, línea por línea ----------
create table if not exists retail.despacho_conteos (
  id uuid primary key default gen_random_uuid(),
  despacho_id uuid not null references retail.despachos (id),
  -- La línea del envío; nula si es algo que no estaba en la guía, y entonces `extra_posicion` dice cuál (desde 1) y lleva de quién,
  -- qué categoría y qué marca.
  despacho_item_id uuid references retail.despacho_items (id),
  extra_posicion integer check (extra_posicion is null or extra_posicion > 0),
  proveedor_id uuid references retail.proveedores (id),
  categoria_id uuid references retail.categorias (id),
  marca_id uuid references retail.marcas (id),
  -- Cuántas llegaron (el número de la cara A). 0 es «no llegó nada» (o, fuera de la guía, «quité esto»).
  contadas integer not null check (contadas between 0 and 99999),
  -- El borrador de «¿Qué … son?»: {prendas: [{producto_id, cantidad, variantes: null | [{variante_id, cantidad, danadas,
  -- danada_solucion}]}], nuevas: [{cantidad, descripcion}]}. Lo valida guardar_conteo; el CHECK de abajo, que no pase de lo contado.
  separado jsonb not null default '{"prendas": [], "nuevas": []}'::jsonb,
  -- El costo con el que se cierra (decisión 6 de Felipe y 18 de ADR-0362): lo fija el cierre, no el conteo.
  costo_unitario numeric(12, 2) check (costo_unitario is null or costo_unitario >= 0),
  contado_por uuid not null references public.personas (id),
  contado_en timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  constraint despacho_conteos_linea_o_extra check ((despacho_item_id is null) <> (extra_posicion is null)),
  constraint despacho_conteos_extra_con_que check (
    extra_posicion is null or (proveedor_id is not null and categoria_id is not null and marca_id is not null)),
  constraint despacho_conteos_linea_sin_que check (
    despacho_item_id is null or (proveedor_id is null and categoria_id is null and marca_id is null)),
  constraint despacho_conteos_separado_forma check (
    jsonb_typeof(separado) = 'object' and jsonb_typeof(separado -> 'prendas') = 'array' and jsonb_typeof(separado -> 'nuevas') = 'array'),
  constraint despacho_conteos_separado_cabe check (retail.fn_conteo_total_separado(separado) <= contadas)
);
create unique index if not exists despacho_conteos_linea_unica on retail.despacho_conteos (despacho_id, despacho_item_id)
  where despacho_item_id is not null;
create unique index if not exists despacho_conteos_extra_unica on retail.despacho_conteos (despacho_id, extra_posicion)
  where extra_posicion is not null;
comment on table retail.despacho_conteos is
  'ADR-0393: lo contado de un envío, línea por línea (o por algo fuera de la guía), escrito al contar: cuántas llegaron, el borrador de '
  'lo separado (prendas conocidas con o sin tallas, nuevas por cantidad), quién contó, cuándo y su versión. Solo con el envío abierto; '
  'no se borra. Solo se lee y escribe por funciones (RLS sin políticas).';

alter table retail.despacho_conteos enable row level security;
revoke all on table retail.despacho_conteos from anon, authenticated;

-- Solo con el envío abierto, con una línea de ESE envío; no se borra ni cambia de línea.
create or replace function retail.fn_despacho_conteos_fija()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Lo contado de un envío no se borra: se corrige, o se deja en 0' using errcode = '42501', hint = 'conteo_inmutable';
  end if;
  if tg_op = 'UPDATE' and (new.despacho_id is distinct from old.despacho_id
                            or new.despacho_item_id is distinct from old.despacho_item_id
                            or new.extra_posicion is distinct from old.extra_posicion) then
    raise exception 'Un conteo no cambia de envío ni de línea' using errcode = '42501', hint = 'conteo_inmutable';
  end if;
  if not exists (select 1 from retail.despachos d where d.id = new.despacho_id and d.estado = 'abierto') then
    raise exception 'Solo se cuenta un envío abierto' using errcode = '23514', hint = 'conteo_envio_no_abierto';
  end if;
  if new.despacho_item_id is not null and not exists (
    select 1 from retail.despacho_items di where di.id = new.despacho_item_id and di.despacho_id = new.despacho_id
  ) then
    raise exception 'Esa línea no es de este envío' using errcode = '23514', hint = 'conteo_linea_ajena';
  end if;
  return new;
end;
$$;
revoke all on function retail.fn_despacho_conteos_fija() from public, anon, authenticated;
create or replace trigger despacho_conteos_fija
  before insert or update or delete on retail.despacho_conteos
  for each row execute function retail.fn_despacho_conteos_fija();

-- ---------- 3. La forma del borrador de lo separado ----------
-- Devuelve el borrador limpio {prendas: [{producto_id, cantidad, variantes}], nuevas: [{cantidad, descripcion}]}: sin repetir una
-- prenda, con cantidades enteras y, si una prenda trae sus tallas y colores, que sumen lo que dice. Solo la forma: si la prenda existe
-- y es de la línea lo mira guardar_conteo, con la línea a la vista.
create or replace function retail.fn_conteo_leer_separado(p_separado jsonb, p_donde text)
returns jsonb
language plpgsql
immutable
set search_path = retail, public, extensions
as $$
declare
  v_prendas jsonb := '[]'::jsonb;
  v_nuevas jsonb := '[]'::jsonb;
  v_p jsonb;
  v_n jsonb;
  v_id uuid;
  v_cantidad numeric;
  v_vars jsonb;
  v_suma integer;
  v_desc text;
  v_vistos uuid[] := '{}';
begin
  if p_separado is null or jsonb_typeof(p_separado) = 'null' then
    return jsonb_build_object('prendas', v_prendas, 'nuevas', v_nuevas);
  end if;
  if jsonb_typeof(p_separado) <> 'object'
     or jsonb_typeof(coalesce(p_separado -> 'prendas', '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_separado -> 'nuevas', '[]'::jsonb)) <> 'array' then
    raise exception 'Lo separado de % no se entiende: recarga la pantalla', p_donde using hint = 'conteo_separado';
  end if;

  for v_p in select e.value from jsonb_array_elements(coalesce(p_separado -> 'prendas', '[]'::jsonb)) e loop
    if jsonb_typeof(v_p) <> 'object' then
      raise exception 'Lo separado de % no se entiende: recarga la pantalla', p_donde using hint = 'conteo_separado';
    end if;
    begin
      v_id := nullif(btrim(v_p ->> 'producto_id'), '')::uuid;
      v_cantidad := nullif(btrim(v_p ->> 'cantidad'), '')::numeric;
    exception when others then
      raise exception 'Una prenda de % no se entiende: recarga la pantalla', p_donde using hint = 'conteo_separado';
    end;
    if v_id is null then
      raise exception 'A una prenda de % le falta cuál es: búscala de nuevo', p_donde using hint = 'conteo_separado';
    end if;
    if v_id = any(v_vistos) then
      raise exception 'En % una prenda se repite: ponla una sola vez con todo lo que llegó', p_donde using hint = 'conteo_prenda_repetida';
    end if;
    v_vistos := v_vistos || v_id;
    if v_cantidad is null or v_cantidad <> trunc(v_cantidad) or v_cantidad < 1 or v_cantidad > 99999 then
      raise exception 'Cuántas llegaron de cada prenda de % va de 1 a 99 999, sin decimales', p_donde using hint = 'conteo_cantidad';
    end if;
    v_vars := null;
    if v_p ? 'variantes' and jsonb_typeof(v_p -> 'variantes') <> 'null' then
      -- Las tallas y colores (con sus dañadas), en la forma que lee el cierre; las que quedaron en 0 no cuentan.
      select coalesce(jsonb_agg(jsonb_build_object('variante_id', x ->> 'variante_id', 'cantidad', (x ->> 'cantidad')::integer,
                                                   'danadas', (x ->> 'danadas')::integer, 'danada_solucion', x ->> 'solucion')
                                order by ord), '[]'::jsonb)
        into v_vars
        from jsonb_array_elements(retail.fn_recepcion_leer_variantes(v_p -> 'variantes', p_donde)) with ordinality t(x, ord)
       where (x ->> 'cantidad')::integer > 0;
      v_suma := coalesce((select sum((x ->> 'cantidad')::integer) from jsonb_array_elements(v_vars) x), 0);
      if v_suma <> v_cantidad then
        raise exception 'Las tallas y colores de una prenda de % suman % y pusiste %: corrige una de las dos', p_donde, v_suma,
          v_cantidad::integer using hint = 'conteo_detalle_no_suma';
      end if;
    end if;
    v_prendas := v_prendas || jsonb_build_object('producto_id', v_id, 'cantidad', v_cantidad::integer, 'variantes', v_vars);
  end loop;

  for v_n in select e.value from jsonb_array_elements(coalesce(p_separado -> 'nuevas', '[]'::jsonb)) e loop
    if jsonb_typeof(v_n) <> 'object' then
      raise exception 'Lo nuevo de % no se entiende: recarga la pantalla', p_donde using hint = 'conteo_separado';
    end if;
    begin
      v_cantidad := nullif(btrim(v_n ->> 'cantidad'), '')::numeric;
    exception when others then
      raise exception 'Cuántas nuevas llegaron de % no se entiende: escribe solo números', p_donde using hint = 'conteo_cantidad';
    end;
    if v_cantidad is null or v_cantidad <> trunc(v_cantidad) or v_cantidad < 1 or v_cantidad > 99999 then
      raise exception 'Cuántas nuevas llegaron de % va de 1 a 99 999, sin decimales', p_donde using hint = 'conteo_cantidad';
    end if;
    v_desc := nullif(btrim(coalesce(v_n ->> 'descripcion', '')), '');
    if v_desc is not null and length(v_desc) > 200 then
      raise exception 'Lo que dice de una prenda nueva de % es muy largo: hasta 200 letras', p_donde using hint = 'conteo_nueva_descripcion';
    end if;
    v_nuevas := v_nuevas || jsonb_build_object('cantidad', v_cantidad::integer, 'descripcion', v_desc);
  end loop;

  return jsonb_build_object('prendas', v_prendas, 'nuevas', v_nuevas);
end;
$$;
comment on function retail.fn_conteo_leer_separado(jsonb, text) is
  'ADR-0393: valida la forma del borrador de lo separado de una línea y lo devuelve limpio. Interna.';
revoke all on function retail.fn_conteo_leer_separado(jsonb, text) from public, anon, authenticated;

-- Una persona como la lee la pantalla: {id, nombre}.
create or replace function retail.fn_conteo_persona(p_persona uuid)
returns jsonb
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select case when p_persona is null then null else
    jsonb_build_object('id', p_persona,
                       'nombre', (select nullif(btrim(concat_ws(' ', p.nombres, p.apellidos)), '') from public.personas p where p.id = p_persona))
  end;
$$;
comment on function retail.fn_conteo_persona(uuid) is 'ADR-0393: {id, nombre} de una persona, para las lecturas del conteo. Interna.';
revoke all on function retail.fn_conteo_persona(uuid) from public, anon, authenticated;

-- ---------- 4. Lecturas internas (las usa guardar_conteo para responder) ----------
-- Lo separado con los nombres que muestra la pantalla: cada prenda con su nombre y código, cada talla y color con su etiqueta.
create or replace function retail.fn_conteo_separado_con_nombres(p_separado jsonb)
returns jsonb
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select jsonb_build_object(
    'prendas', coalesce((
      select jsonb_agg(
               (x - 'variantes')
               || jsonb_build_object(
                    'nombre', pr.referencia, 'codigo', pr.codigo,
                    'variantes', case when jsonb_typeof(x -> 'variantes') = 'array' then coalesce((
                      select jsonb_agg(v || jsonb_build_object('talla', t.valor, 'color', co.nombre, 'color_hex', co.hex, 'codigo', vr.codigo)
                                       order by t.valor, co.nombre)
                        from jsonb_array_elements(x -> 'variantes') v
                        left join retail.variantes vr on vr.id = (v ->> 'variante_id')::uuid
                        left join retail.tallas t on t.id = vr.talla_id
                        left join retail.colores co on co.codigo = vr.color_codigo), '[]'::jsonb) end)
               order by ord)
        from jsonb_array_elements(coalesce(p_separado -> 'prendas', '[]'::jsonb)) with ordinality e(x, ord)
        left join retail.productos pr on pr.id = (x ->> 'producto_id')::uuid), '[]'::jsonb),
    'nuevas', coalesce(p_separado -> 'nuevas', '[]'::jsonb));
$$;
comment on function retail.fn_conteo_separado_con_nombres(jsonb) is
  'ADR-0393: el borrador de lo separado con nombre y código de cada prenda y talla, color y hex de cada variante. Interna.';
revoke all on function retail.fn_conteo_separado_con_nombres(jsonb) from public, anon, authenticated;

-- Un conteo como lo lee la pantalla (y lo devuelve guardar_conteo).
create or replace function retail.fn_conteo_json(p_fila retail.despacho_conteos)
returns jsonb
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select jsonb_build_object(
    'despacho_id', p_fila.despacho_id,
    'despacho_item_id', p_fila.despacho_item_id,
    'extra_posicion', p_fila.extra_posicion,
    'proveedor', (select jsonb_build_object('id', pr.id, 'nombre', pr.nombre) from retail.proveedores pr where pr.id = p_fila.proveedor_id),
    'categoria', (select jsonb_build_object('id', c.id, 'nombre', c.nombre, 'prefijo', c.prefijo, 'familia', c.familia)
                    from retail.categorias c where c.id = p_fila.categoria_id),
    'marca', (select jsonb_build_object('id', m.id, 'nombre', m.nombre) from retail.marcas m where m.id = p_fila.marca_id),
    'contadas', p_fila.contadas,
    'separadas', retail.fn_conteo_total_separado(p_fila.separado),
    'separado', retail.fn_conteo_separado_con_nombres(p_fila.separado),
    'costo_unitario', p_fila.costo_unitario,
    'version', p_fila.version,
    'contado_por', retail.fn_conteo_persona(p_fila.contado_por),
    'contado_en', p_fila.contado_en);
$$;
comment on function retail.fn_conteo_json(retail.despacho_conteos) is 'ADR-0393: un conteo con sus nombres, como lo lee la pantalla. Interna.';
revoke all on function retail.fn_conteo_json(retail.despacho_conteos) from public, anon, authenticated;

-- ---------- 5. Guardar lo contado de una línea ----------
-- `p_despacho_item_id`: la línea del envío. Para lo que no estaba en la guía va null y: `p_extra_posicion` para corregir uno ya
-- anotado, o nada para anotar uno nuevo (con `p_proveedor_id` —null = el único del envío—, `p_categoria_id` y `p_marca_id`).
-- `p_version`: la versión de esa línea que viste (null si todavía no tenía conteo).
create or replace function retail.guardar_conteo(
  p_despacho_id uuid,
  p_despacho_item_id uuid,
  p_contadas integer,
  p_separado jsonb,
  p_version integer,
  p_extra_posicion integer default null,
  p_proveedor_id uuid default null,
  p_categoria_id uuid default null,
  p_marca_id uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare
  v_actor uuid;
  v_despacho retail.despachos;
  v_nueva_extra boolean := p_despacho_item_id is null and p_extra_posicion is null;
  v_proveedores uuid[];
  v_cat uuid;
  v_marca uuid;
  v_prov uuid;
  v_donde text;
  v_sep jsonb;
  v_total integer;
  v_malo record;
  v_fila retail.despacho_conteos;
  v_existia boolean := false;
  v_pisaste jsonb;
begin
  if retail.fn_ve_modulo('recibir') is not true then
    raise exception 'Contar un envío necesita el módulo «Recibir mercadería» en tu rol' using errcode = '42501', hint = 'recibir_sin_modulo';
  end if;
  -- El envío se bloquea en modo compartido: varias personas cuentan a la vez (cada una espera solo por SU línea), pero nadie lo cierra
  -- ni lo anula a mitad de un guardado. Anotar algo NUEVO fuera de la guía lo toma en exclusiva: dos personas a la vez no se llevan
  -- la misma posición.
  if v_nueva_extra then
    select d.* into v_despacho from retail.despachos d where d.id = p_despacho_id for no key update;
  else
    select d.* into v_despacho from retail.despachos d where d.id = p_despacho_id for share;
  end if;
  if not found then
    raise exception 'Ese envío no existe' using hint = 'envio_no_existe';
  end if;
  if v_despacho.estado = 'en_camino' then
    raise exception 'Este envío todavía no se abrió: pulsa «Empezar a recibir»' using hint = 'envio_sin_abrir';
  end if;
  if v_despacho.estado = 'cerrado' then
    raise exception 'Este envío ya se recibió: para corregir lo contado, reábrelo' using hint = 'envio_ya_recibido';
  end if;
  if v_despacho.estado = 'anulado' then
    raise exception 'Este envío se anuló: ya no llega' using hint = 'envio_anulado';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  perform retail.fn_recepcion_exigir(v_despacho.id, v_despacho.ubicacion_destino_id, v_actor);
  if p_contadas is null or p_contadas < 0 or p_contadas > 99999 then
    raise exception 'Cuántas llegaron va de 0 a 99 999' using hint = 'conteo_contadas';
  end if;

  -- ---- La línea: del envío, una ya anotada fuera de la guía, o una nueva fuera de la guía. ----
  if p_despacho_item_id is not null then
    if p_extra_posicion is not null then
      raise exception 'Una línea del envío no lleva posición de fuera de la guía: recarga la pantalla' using hint = 'conteo_linea';
    end if;
    select di.categoria_id, di.marca_id, concat_ws(' · ', c.nombre, m.nombre, di.descripcion)
      into v_cat, v_marca, v_donde
      from retail.despacho_items di
      join retail.categorias c on c.id = di.categoria_id
      join retail.marcas m on m.id = di.marca_id
     where di.id = p_despacho_item_id and di.despacho_id = p_despacho_id;
    if not found then
      raise exception 'Esa línea no es de este envío: recarga la pantalla' using hint = 'conteo_linea_ajena';
    end if;
  else
    v_proveedores := array(select distinct o.proveedor_id
                             from retail.despacho_items di
                             join retail.orden_compra_items i on i.id = di.orden_compra_item_id
                             join retail.ordenes_compra o on o.id = i.orden_compra_id
                            where di.despacho_id = p_despacho_id);
    if p_extra_posicion is not null then
      select k.* into v_fila
        from retail.despacho_conteos k
       where k.despacho_id = p_despacho_id and k.extra_posicion = p_extra_posicion
         for update;
      if not found then
        raise exception 'Eso que no estaba en la guía ya no está anotado: recarga la pantalla' using hint = 'conteo_extra_no_existe';
      end if;
      v_existia := true;
    end if;
    -- De quién, qué categoría y qué marca: lo que mandes o, al corregir, lo que ya tenía.
    v_prov := coalesce(p_proveedor_id, v_fila.proveedor_id);
    v_cat := coalesce(p_categoria_id, v_fila.categoria_id);
    v_marca := coalesce(p_marca_id, v_fila.marca_id);
    if v_prov is null then
      if cardinality(v_proveedores) <> 1 then
        raise exception 'Este envío trae varios proveedores: elige de cuál es lo que no estaba en la guía' using hint = 'recepcion_extra_proveedor';
      end if;
      v_prov := v_proveedores[1];
    elsif not (v_prov = any(v_proveedores)) then
      raise exception 'Ese proveedor no viene en este envío: elige uno de los del envío' using hint = 'recepcion_extra_proveedor';
    end if;
    if v_cat is null or not exists (select 1 from retail.categorias c where c.id = v_cat and c.activo) then
      raise exception 'Elige una categoría activa para lo que no estaba en la guía' using hint = 'recepcion_extra_categoria';
    end if;
    if v_marca is null or not exists (select 1 from retail.marcas m where m.id = v_marca and m.activo) then
      raise exception 'Elige una marca activa para lo que no estaba en la guía' using hint = 'recepcion_extra_marca';
    end if;
    v_donde := concat_ws(' · ', (select c.nombre from retail.categorias c where c.id = v_cat),
                         (select m.nombre from retail.marcas m where m.id = v_marca)) || ' (fuera de la guía)';
  end if;

  -- ---- Lo separado: la forma, que no pase de lo contado, y que cada prenda sea de esta línea. ----
  v_sep := retail.fn_conteo_leer_separado(p_separado, v_donde);
  v_total := retail.fn_conteo_total_separado(v_sep);
  if v_total > p_contadas then
    raise exception 'De % separaste % y contaste %: si llegaron más, corrige cuántas llegaron', v_donde, v_total, p_contadas
      using hint = 'conteo_separado_de_mas';
  end if;
  for v_malo in
    select pr.id, pr.estado, pr.estado_alta, (pr.categoria_id = v_cat and pr.marca_id is not distinct from v_marca) as de_la_linea
      from jsonb_array_elements(v_sep -> 'prendas') x
      left join retail.productos pr on pr.id = (x ->> 'producto_id')::uuid
     where pr.id is null or pr.categoria_id <> v_cat or pr.marca_id is distinct from v_marca
        or pr.estado <> 'activo' or pr.estado_alta = 'rechazado'
     limit 1
  loop
    if v_malo.id is null then
      raise exception 'Una de las prendas de % ya no existe: búscala de nuevo', v_donde using hint = 'conteo_prenda_no_existe';
    end if;
    if not v_malo.de_la_linea then
      raise exception 'Una de las prendas de % es de otra categoría o marca: búscala en su línea', v_donde using hint = 'conteo_prenda_ajena';
    end if;
    raise exception 'Una de las prendas de % no está activa: búscala de nuevo', v_donde using hint = 'conteo_prenda_inactiva';
  end loop;
  if exists (
    select 1
      from jsonb_array_elements(v_sep -> 'prendas') x
     cross join lateral jsonb_array_elements(coalesce(nullif(x -> 'variantes', 'null'::jsonb), '[]'::jsonb)) v
      left join retail.variantes vr on vr.id = (v ->> 'variante_id')::uuid
     where vr.id is null or vr.producto_id <> (x ->> 'producto_id')::uuid or not vr.activo
  ) then
    raise exception 'Una talla o color de % no es de esa prenda o ya no está activo: elígelo de nuevo', v_donde
      using hint = 'conteo_variante_ajena';
  end if;

  -- ---- Guardar: gana el último, y si pisaste lo de otro, te lo devuelve. ----
  if not v_existia then
    if p_despacho_item_id is not null then
      select k.* into v_fila
        from retail.despacho_conteos k
       where k.despacho_id = p_despacho_id and k.despacho_item_id = p_despacho_item_id
         for update;
      v_existia := found;
    end if;
    if not v_existia then
      begin
        insert into retail.despacho_conteos (despacho_id, despacho_item_id, extra_posicion, proveedor_id, categoria_id, marca_id,
                                             contadas, separado, contado_por)
        values (p_despacho_id, p_despacho_item_id,
                case when p_despacho_item_id is null
                     then coalesce((select max(k.extra_posicion) from retail.despacho_conteos k where k.despacho_id = p_despacho_id), 0) + 1
                end,
                case when p_despacho_item_id is null then v_prov end,
                case when p_despacho_item_id is null then v_cat end,
                case when p_despacho_item_id is null then v_marca end,
                p_contadas, v_sep, v_actor)
        returning * into v_fila;
      exception when unique_violation then
        -- Otra persona guardó esa misma línea en el mismo instante: se espera su guardado y se sigue como si ya estuviera.
        select k.* into v_fila
          from retail.despacho_conteos k
         where k.despacho_id = p_despacho_id and k.despacho_item_id = p_despacho_item_id
           for update;
        v_existia := true;
      end;
    end if;
  end if;

  if v_existia then
    -- Lo que había, si no es lo que viste y no es lo mismo que mandas: es lo que vas a pisar.
    if p_version is distinct from v_fila.version
       and (v_fila.contadas, v_fila.separado) is distinct from (p_contadas, v_sep) then
      v_pisaste := jsonb_build_object('contadas', v_fila.contadas, 'separado', retail.fn_conteo_separado_con_nombres(v_fila.separado),
                                      'contado_por', retail.fn_conteo_persona(v_fila.contado_por), 'contado_en', v_fila.contado_en,
                                      'version', v_fila.version);
    end if;
    update retail.despacho_conteos k
       set contadas = p_contadas,
           separado = v_sep,
           proveedor_id = case when k.despacho_item_id is null then v_prov end,
           categoria_id = case when k.despacho_item_id is null then v_cat end,
           marca_id = case when k.despacho_item_id is null then v_marca end,
           contado_por = v_actor,
           contado_en = now(),
           version = k.version + 1
     where k.id = v_fila.id
    returning * into v_fila;
  end if;

  return retail.fn_conteo_json(v_fila) || jsonb_build_object('pisaste', v_pisaste);
end;
$$;
comment on function retail.guardar_conteo(uuid, uuid, integer, jsonb, integer, integer, uuid, uuid, uuid) is
  'ADR-0393: guarda lo contado de una línea de un envío abierto (cuántas llegaron y el borrador de lo separado: prendas conocidas, con '
  'o sin sus tallas y colores, y nuevas por cantidad), o de algo que no estaba en la guía. Gana el último: si otra persona la guardó '
  'después de la versión que viste, guarda lo tuyo y devuelve lo pisado en «pisaste». Módulo Recibir, la sede del envío y la '
  'decisión 17; firma el responsable. No mueve stock. Devuelve el conteo (como fn_envio_conteos) con «pisaste».';
revoke all on function retail.guardar_conteo(uuid, uuid, integer, jsonb, integer, integer, uuid, uuid, uuid) from public, anon;
grant execute on function retail.guardar_conteo(uuid, uuid, integer, jsonb, integer, integer, uuid, uuid, uuid) to authenticated, service_role;

-- ---------- 6. Lo contado de un envío: las líneas del envío primero (en el orden de sus órdenes) y después lo de fuera de la guía ----------
create or replace function retail.fn_envio_conteos(p_despacho_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_estado text;
begin
  if retail.fn_ve_modulo('ordenes_compra') is not true and retail.fn_ve_modulo('recibir') is not true then
    raise exception 'Ver un envío necesita el módulo «Órdenes de compra» o «Recibir mercadería» en tu rol'
      using errcode = '42501', hint = 'envios_sin_modulo';
  end if;
  select d.estado into v_estado from retail.despachos d where d.id = p_despacho_id;
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'despacho_id', p_despacho_id,
    'estado', v_estado,
    'conteos', coalesce((
      select jsonb_agg(retail.fn_conteo_json(k) order by k.extra_posicion nulls first, o.numero, i.posicion)
        from retail.despacho_conteos k
        left join retail.despacho_items di on di.id = k.despacho_item_id
        left join retail.orden_compra_items i on i.id = di.orden_compra_item_id
        left join retail.ordenes_compra o on o.id = i.orden_compra_id
       where k.despacho_id = p_despacho_id), '[]'::jsonb));
end;
$$;
comment on function retail.fn_envio_conteos(uuid) is
  'ADR-0393: lo contado de un envío, línea por línea (y lo de fuera de la guía): {despacho_id, estado, conteos: [{despacho_item_id, '
  'extra_posicion, proveedor, categoria, marca, contadas, separadas, separado (con nombres), costo_unitario, version, contado_por '
  '{id, nombre}, contado_en}]}. NULL si el envío no existe. Módulo Órdenes de compra o Recibir mercadería.';
revoke all on function retail.fn_envio_conteos(uuid) from public, anon;
grant execute on function retail.fn_envio_conteos(uuid) to authenticated, service_role;

-- ---------- 7. Lo que se recibe con el formulario de la fase 4 queda como el conteo de cada línea ----------
-- Interna: por cada unidad que armó recibir_despacho, su conteo con todo detallado (las prendas agrupadas por producto, con sus tallas
-- y colores) y el costo con el que entró. Lo de fuera de la guía que se había anotado contando y no vino en el formulario queda en 0.
create or replace function retail.fn_recepcion_conteos_detallados(p_despacho_id uuid, p_unidades jsonb, p_actor uuid)
returns void
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare
  v_u jsonb;
  v_sep jsonb;
  v_extra integer;
  v_id uuid;
begin
  for v_u in select u.value from jsonb_array_elements(p_unidades) u loop
    v_sep := jsonb_build_object(
      'prendas', coalesce((
        select jsonb_agg(jsonb_build_object('producto_id', g.producto_id, 'cantidad', g.cantidad, 'variantes', g.variantes)
                         order by g.primera)
          from (select vr.producto_id, sum((v ->> 'cantidad')::integer)::integer as cantidad, min(ord) as primera,
                       jsonb_agg(jsonb_build_object('variante_id', v ->> 'variante_id', 'cantidad', (v ->> 'cantidad')::integer,
                                                    'danadas', (v ->> 'danadas')::integer, 'danada_solucion', v ->> 'solucion')
                                 order by ord) as variantes
                  from jsonb_array_elements(v_u -> 'variantes') with ordinality t(v, ord)
                  join retail.variantes vr on vr.id = (v ->> 'variante_id')::uuid
                 where (v ->> 'cantidad')::integer > 0
                 group by vr.producto_id) g), '[]'::jsonb),
      'nuevas', '[]'::jsonb);
    if v_u ->> 'tipo' = 'linea' then
      v_id := (select k.id from retail.despacho_conteos k
                where k.despacho_id = p_despacho_id and k.despacho_item_id = (v_u ->> 'despacho_item_id')::uuid
                  for update);
      if v_id is null then
        insert into retail.despacho_conteos (despacho_id, despacho_item_id, contadas, separado, costo_unitario, contado_por)
        values (p_despacho_id, (v_u ->> 'despacho_item_id')::uuid, (v_u ->> 'contado')::integer, v_sep, (v_u ->> 'costo')::numeric, p_actor);
      else
        update retail.despacho_conteos k
           set contadas = (v_u ->> 'contado')::integer, separado = v_sep, costo_unitario = (v_u ->> 'costo')::numeric,
               contado_por = p_actor, contado_en = now(), version = k.version + 1
         where k.id = v_id;
      end if;
    else
      v_extra := (v_u ->> 'extra')::integer;
      v_id := (select k.id from retail.despacho_conteos k
                where k.despacho_id = p_despacho_id and k.extra_posicion = v_extra
                  for update);
      if v_id is null then
        insert into retail.despacho_conteos (despacho_id, extra_posicion, proveedor_id, categoria_id, marca_id, contadas, separado,
                                             costo_unitario, contado_por)
        values (p_despacho_id, v_extra, (v_u ->> 'proveedor_id')::uuid, (v_u ->> 'categoria_id')::uuid, (v_u ->> 'marca_id')::uuid,
                (v_u ->> 'contado')::integer, v_sep, (v_u ->> 'costo')::numeric, p_actor);
      else
        update retail.despacho_conteos k
           set proveedor_id = (v_u ->> 'proveedor_id')::uuid, categoria_id = (v_u ->> 'categoria_id')::uuid,
               marca_id = (v_u ->> 'marca_id')::uuid, contadas = (v_u ->> 'contado')::integer, separado = v_sep,
               costo_unitario = (v_u ->> 'costo')::numeric, contado_por = p_actor, contado_en = now(), version = k.version + 1
         where k.id = v_id;
      end if;
    end if;
  end loop;
  -- Lo de fuera de la guía anotado al contar que el formulario no trajo: no llegó a recibirse, queda en 0.
  update retail.despacho_conteos k
     set contadas = 0, separado = '{"prendas": [], "nuevas": []}'::jsonb, costo_unitario = null, contado_por = p_actor,
         contado_en = now(), version = k.version + 1
   where k.despacho_id = p_despacho_id
     and k.extra_posicion is not null
     and not exists (select 1 from jsonb_array_elements(p_unidades) u where (u ->> 'extra')::integer = k.extra_posicion)
     and (k.contadas <> 0 or k.separado <> '{"prendas": [], "nuevas": []}'::jsonb);
end;
$$;
comment on function retail.fn_recepcion_conteos_detallados(uuid, jsonb, uuid) is
  'ADR-0393: lo recibido con el formulario de la fase 4 queda como el conteo de cada línea, todo detallado y con su costo. Interna.';
revoke all on function retail.fn_recepcion_conteos_detallados(uuid, jsonb, uuid) from public, anon, authenticated;

select pg_temp.reemplazar(
  'retail.recibir_despacho(uuid,integer,jsonb,jsonb,text,uuid)',
  $v$  perform retail.fn_recepcion_entrar(p_despacho_id, v_despacho.ubicacion_destino_id, v_despacho.numero_guia, v_envio, v_actor,
                                     v_unidades, v_variantes, v_nota);$v$,
  $v$  perform retail.fn_recepcion_entrar(p_despacho_id, v_despacho.ubicacion_destino_id, v_despacho.numero_guia, v_envio, v_actor,
                                     v_unidades, v_variantes, v_nota);
  -- ADR-0393: lo recibido con este formulario queda también como el conteo de cada línea (todo detallado, con su costo), igual que
  -- si se hubiera contado con la cara A: todo envío cerrado se lee de la misma forma.
  perform retail.fn_recepcion_conteos_detallados(p_despacho_id, v_unidades, v_actor);$v$,
  1);

-- ---------- 8. Comprobación: si algo no quedó, la migración no se da por aplicada ----------
do $$
declare
  v_funcion text;
begin
  if to_regclass('retail.despacho_conteos') is null then
    raise exception 'falta retail.despacho_conteos';
  end if;
  if not coalesce((select c.relrowsecurity from pg_class c where c.oid = 'retail.despacho_conteos'::regclass), false) then
    raise exception 'retail.despacho_conteos tiene que tener RLS encendido';
  end if;
  if exists (select 1 from pg_policies p where p.schemaname = 'retail' and p.tablename = 'despacho_conteos') then
    raise exception 'retail.despacho_conteos no lleva políticas: solo se lee y escribe por funciones';
  end if;
  if has_table_privilege('authenticated', 'retail.despacho_conteos', 'select')
     or has_table_privilege('anon', 'retail.despacho_conteos', 'select') then
    raise exception 'retail.despacho_conteos: ni anon ni authenticated la leen directo';
  end if;
  if not exists (select 1 from pg_trigger t where t.tgrelid = 'retail.despacho_conteos'::regclass and t.tgname = 'despacho_conteos_fija') then
    raise exception 'falta el disparador despacho_conteos_fija';
  end if;
  if to_regclass('retail.despacho_conteos_linea_unica') is null or to_regclass('retail.despacho_conteos_extra_unica') is null then
    raise exception 'faltan los únicos de despacho_conteos';
  end if;
  if not exists (select 1 from pg_constraint c
                  where c.conrelid = 'retail.despacho_conteos'::regclass and c.conname = 'despacho_conteos_separado_cabe') then
    raise exception 'falta el candado despacho_conteos_separado_cabe';
  end if;
  foreach v_funcion in array array[
    'retail.guardar_conteo(uuid,uuid,integer,jsonb,integer,integer,uuid,uuid,uuid)',
    'retail.fn_envio_conteos(uuid)'] loop
    if not (select p.prosecdef from pg_proc p where p.oid = v_funcion::regprocedure) then
      raise exception '% tiene que ser security definer', v_funcion;
    end if;
    if has_function_privilege('anon', v_funcion, 'execute') or not has_function_privilege('authenticated', v_funcion, 'execute') then
      raise exception '%: la ejecuta authenticated y no anon', v_funcion;
    end if;
  end loop;
  foreach v_funcion in array array[
    'retail.fn_conteo_leer_separado(jsonb,text)', 'retail.fn_conteo_persona(uuid)', 'retail.fn_conteo_separado_con_nombres(jsonb)',
    'retail.fn_conteo_json(retail.despacho_conteos)', 'retail.fn_recepcion_conteos_detallados(uuid,jsonb,uuid)',
    'retail.fn_despacho_conteos_fija()'] loop
    if has_function_privilege('authenticated', v_funcion, 'execute') or has_function_privilege('anon', v_funcion, 'execute') then
      raise exception '% es interna: ni authenticated ni anon la ejecutan', v_funcion;
    end if;
  end loop;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'retail' and p.proname in ('guardar_conteo', 'fn_envio_conteos')
              group by p.proname having count(*) > 1) then
    raise exception 'guardar_conteo o fn_envio_conteos quedó con dos versiones';
  end if;
  if position('perform retail.fn_recepcion_conteos_detallados(' in
              pg_get_functiondef('retail.recibir_despacho(uuid,integer,jsonb,jsonb,text,uuid)'::regprocedure)) = 0 then
    raise exception 'recibir_despacho no deja el conteo de cada línea';
  end if;
end;
$$;

reset lock_timeout;
