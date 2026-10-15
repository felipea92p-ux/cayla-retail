-- ============================================================================
-- 20261015031000_vitrina_looks.sql — CAYLA V2 · Tienda online (ADR-0408), actividad 11: los looks (Vitrina web ▸ Looks)
--
-- EL PROBLEMA PRIMERO. «Arma tu look» (maqueta v4, propuesta h aprobada): la tienda online muestra combinaciones listas —de 2 a 4
-- prendas que se ven bien juntas— y el cliente agrega el look completo eligiendo la talla de cada una. Alguien en el ERP tiene que
-- armarlas, mostrarlas y ordenarlas. No vive en `productos` (principio 1): es vitrina, como mostrar u ocultar un modelo
-- (20261014225000), y por eso es parte del MISMO módulo `vitrina_web` (una pantalla adentro de un módulo no es otro módulo, ADR-0306).
--
-- LO QUE HACE
--   1. `retail.vitrina_looks` (un look: nombre, frase, si se ve, su lugar en «Arma tu look» y cuántas prendas lleva) y
--      `retail.vitrina_look_piezas` (cada prenda: el modelo, su color y su lugar en la lámina —x, y, ancho y giro, los de la maqueta—).
--      RLS encendido y SIN políticas: solo las tocan las funciones de abajo (security definer). Ocultar no borra: marca
--      `publicado = false`. Quién y cuándo de cada cambio, en `retail.actividad` (módulo `vitrina_web`, tabla `vitrina_looks`), que es
--      de solo agregar: ahí queda también cómo eran las prendas antes de cambiarlas.
--   2. Las funciones del ERP, todas con `fn_exigir_modulo('vitrina_web')` y firmadas con `fn_actor_persona_id(true)` (el combo
--      «Responsable», ADR-0162):
--        · `fn_vitrina_looks()` — la lectura de Vitrina web ▸ Looks: cada look con sus prendas, si se ve en la web (y si no, por qué) y
--          el total que ve el cliente con «Todas» (cada prenda, lo que vale en SU color: `fn_tienda_precios` por color, la misma pieza
--          de «Arma tu look» en la tienda, 20261015032000); y los modelos que se pueden poner en un look (los que se ven en la web).
--        · `vitrina_guardar_look(…)` — crear o editar: nombre, frase, prendas, si se ve y su lugar en «Arma tu look».
--        · `vitrina_mostrar_look(…)` — el interruptor de la lista: mostrar u ocultar.
--      La tienda lee con `tienda_looks` y `tienda_look` (20261015032000).
--
-- REGLAS (Lamport: lo que la base no deja que pase)
--   · Un look se GUARDA con 2 a 4 prendas, sin repetir modelo, cada una de un modelo que se puede vender (`fn_vitrina_publicable`) y en
--     un color con tallas activas. Para MOSTRARLO, cada prenda tiene que verse en la web en ese color: lo decide `tienda_catalogo` con
--     «Todas» —la misma regla de lo que ve el cliente, no otra (`fn_vitrina_look_se_ve`)—.
--   · Si después una prenda deja de verse (se ocultó, se descontinuó, se apagó su color), el look sigue encendido pero la tienda NO lo
--     muestra, y el ERP dice cuál prenda falta. DECIDÍ ocultar el look entero y no «dejar caer» la prenda: el nombre y la frase hablan
--     de todas sus prendas («un vestido vino y una cartera nude»), un look de 2 que pierde una ya no es un look, y la lámina está
--     pensada para su número de prendas. Se arregla en el ERP cambiando la prenda o volviendo a mostrar el modelo.
--   · Una prenda eliminada del catálogo (solo se puede si nunca se movió, `eliminar_producto`) se va con su ficha (`on delete cascade`,
--     como `vitrina_productos`): el look guarda cuántas prendas lleva (`piezas`), así que le falta una, no se muestra y el ERP lo dice.
--   · Dos personas con el mismo look abierto: gana la primera y la segunda recibe `vitrina_look_cambio_otro` (la fila lleva `version`).
--     El lugar de cada look se reparte de 1 a N sin huecos, con un candado de la transacción: dos altas a la vez no empatan.
--   · Dos looks no se llaman igual (sin mayúsculas ni tildes): el cliente los distingue por su nombre.
--
-- DESCARTÉ: guardar solo el orden de las prendas y calcular la lámina en la tienda (la maqueta guarda x, y, ancho y giro de cada
--   prenda, y así un día se podrá acomodar a mano sin otra migración; hoy los pone la base según cuántas son); un precio propio del look
--   (no hay precio web: cada prenda vale lo de la tienda elegida y el total es la suma); borrar un look (se oculta; archivarlo sería otra
--   decisión de Felipe); subir la `version` al cambiar el lugar (ordenar no pisa lo que otra persona está editando).
--
-- PRODUCCIÓN. NO está aplicada (actividad 13, con el OK de Felipe), después de 20261014225000, 20261014231000 y 20261015012000 (la
-- regla del precio, que da lo que vale cada prenda en su color). Una sola parte,
-- re-ejecutable: dos tablas NUEVAS sin políticas, funciones y el texto del módulo; no altera tablas en uso ni toca disparadores
-- (ADR-0195). Las llaves foráneas a `productos` y `colores` toman un instante esas tablas en modo SHARE ROW EXCLUSIVE (compatible con
-- las lecturas y las ventas; `lock_timeout` lo corta a los 3 s). Dentro de los textos entre comillas no hay ningún `select … into`
-- (ADR-0288). Prueba: `pnpm pruebas:vitrina-looks`.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 0. Lo que da por hecho (si falta, no se pega nada) ----------
do $$
begin
  if to_regprocedure('retail.fn_tienda_precios(uuid[], uuid, boolean)') is null then
    raise exception 'Falta la regla del precio de la tienda (fn_tienda_precios por color): pega antes 20261015012000_tienda_ficha_y_niveles_por_tienda.sql.';
  end if;
end
$$;

-- ---------- 1. El módulo: ahora también arma los looks (sigue siendo el mismo, ADR-0306) ----------
update retail.modulos
   set incluye = 'Elegir qué modelos se ven en la tienda online, mostrar u ocultar varios a la vez, fijarlos o quitarlos de Lo nuevo y armar los looks de «Arma tu look»'
 where clave = 'vitrina_web'
   and incluye is distinct from 'Elegir qué modelos se ven en la tienda online, mostrar u ocultar varios a la vez, fijarlos o quitarlos de Lo nuevo y armar los looks de «Arma tu look»';

-- ---------- 2. Las tablas ----------
create table if not exists retail.vitrina_looks (
  id               uuid primary key default gen_random_uuid(),
  nombre           text not null,
  -- Una línea que cuenta cómo se lleva («Denim liviano, un básico blanco y el palazo que va con todo»). Opcional.
  frase            text,
  publicado        boolean not null default false,
  -- Su lugar en «Arma tu look» (1 = primero). Lo reparte `vitrina_guardar_look`, de 1 a N sin huecos.
  orden            integer not null,
  -- Cuántas prendas se guardaron. Si una prenda se va con su ficha (eliminada), quedan menos filas que esto: el look no se muestra.
  piezas           smallint not null,
  -- La última vez que se mostró.
  publicado_en     timestamptz,
  version          integer not null default 1,
  creado_en        timestamptz not null default now(),
  creado_por       uuid references public.personas (id),
  actualizado_en   timestamptz not null default now(),
  actualizado_por  uuid references public.personas (id),
  constraint vitrina_looks_nombre check (nombre = btrim(nombre) and char_length(nombre) between 1 and 60),
  constraint vitrina_looks_frase check (frase is null or (frase = btrim(frase) and char_length(frase) between 1 and 200)),
  constraint vitrina_looks_orden check (orden >= 1),
  constraint vitrina_looks_piezas check (piezas between 2 and 4),
  constraint vitrina_looks_publicado_en check (not publicado or publicado_en is not null),
  constraint vitrina_looks_version check (version >= 1)
);

comment on table retail.vitrina_looks is
  'Los looks de la tienda online (ADR-0408, actividad 11): combinaciones de 2 a 4 prendas para «Arma tu look». Ocultar marca publicado = false (nunca se borra). Se escribe solo con vitrina_guardar_look / vitrina_mostrar_look; quién y cuándo, en retail.actividad (módulo vitrina_web, tabla vitrina_looks).';
comment on column retail.vitrina_looks.piezas is 'Cuántas prendas se guardaron (2 a 4). Si quedan menos filas en vitrina_look_piezas (una prenda se eliminó del catálogo), el look no se muestra.';

-- Dos looks no se llaman igual: sin mayúsculas, sin tildes y sin espacios de más (la misma clave de los colores).
create unique index if not exists vitrina_looks_nombre_unico on retail.vitrina_looks (retail.fn_clave_texto(nombre));
create index if not exists vitrina_looks_orden_idx on retail.vitrina_looks (orden, creado_en, id);

create table if not exists retail.vitrina_look_piezas (
  look_id       uuid not null references retail.vitrina_looks (id) on delete cascade,
  -- Su número en el look (el que se ve en la lámina y en la lista): de 1 a 4.
  posicion      smallint not null,
  producto_id   uuid not null references retail.productos (id) on delete cascade,
  color_codigo  text not null references retail.colores (codigo),
  -- Dónde va en la lámina, en % del ancho y del alto, y cuánto gira (grados): los de la maqueta según cuántas prendas lleva el look
  -- (`fn_vitrina_look_lamina`).
  x             numeric(5, 2) not null,
  y             numeric(5, 2) not null,
  ancho         numeric(5, 2) not null,
  giro          numeric(4, 1) not null,
  primary key (look_id, posicion),
  constraint vitrina_look_piezas_un_modelo unique (look_id, producto_id),
  constraint vitrina_look_piezas_posicion check (posicion between 1 and 4),
  constraint vitrina_look_piezas_lamina check (x between 0 and 100 and y between 0 and 100 and ancho > 0 and ancho <= 100 and giro between -45 and 45)
);

comment on table retail.vitrina_look_piezas is
  'Las prendas de cada look (ADR-0408, actividad 11): modelo, color y su lugar en la lámina. Configuración de la vitrina: se va con su ficha si la prenda se elimina (on delete cascade). Se escribe solo con vitrina_guardar_look.';

create index if not exists vitrina_look_piezas_producto_idx on retail.vitrina_look_piezas (producto_id);

alter table retail.vitrina_looks enable row level security;
alter table retail.vitrina_look_piezas enable row level security;
revoke all on table retail.vitrina_looks, retail.vitrina_look_piezas from public, anon, authenticated;

-- ---------- 3. Piezas internas ----------

-- La lámina de la maqueta (`POS_LOOK`): dónde va cada prenda según cuántas lleva el look.
create or replace function retail.fn_vitrina_look_lamina(p_piezas integer, p_posicion integer)
returns table (x numeric, y numeric, ancho numeric, giro numeric)
language sql
immutable
set search_path = retail, public
as $$
  select l.x::numeric, l.y::numeric, l.ancho::numeric, l.giro::numeric
    from (values
      (2, 1, 8, 4, 56, -4), (2, 2, 54, 44, 40, 7),
      (3, 1, 6, 4, 50, -5), (3, 2, 46, 15, 47, 4), (3, 3, 13, 57, 35, -6),
      (4, 1, 4, 3, 46, -6), (4, 2, 50, 3, 42, 5), (4, 3, 34, 37, 44, -2), (4, 4, 5, 60, 33, 6)
    ) as l (piezas, posicion, x, y, ancho, giro)
   where l.piezas = p_piezas and l.posicion = p_posicion
$$;
revoke all on function retail.fn_vitrina_look_lamina(integer, integer) from public, anon, authenticated;

-- ¿Esta prenda, en este color, se ve en la web? Lo dice el catálogo de la tienda (`tienda_catalogo`), ya leído: la MISMA regla de lo
-- que ve el cliente (publicado en la vitrina, se puede vender y ese color con tallas activas), nunca una copia.
create or replace function retail.fn_vitrina_look_se_ve(p_catalogo jsonb, p_producto_id uuid, p_color text)
returns boolean
language sql
immutable
set search_path = retail, public
as $$
  select exists (
    select 1
      from jsonb_array_elements(coalesce(p_catalogo -> 'prendas', '[]'::jsonb)) x
      cross join jsonb_array_elements(coalesce(x -> 'colores', '[]'::jsonb)) c
     where x ->> 'id' = p_producto_id::text
       and c ->> 'codigo' = p_color)
$$;
revoke all on function retail.fn_vitrina_look_se_ve(jsonb, uuid, text) from public, anon, authenticated;

-- Una línea en la Actividad (quién y cuándo). Si anotar falla, lo guardado sigue en pie (como en los demás módulos).
create or replace function retail.fn_vitrina_look_anotar(
  p_accion text, p_descripcion text, p_persona_id uuid, p_look_id uuid, p_detalle jsonb
)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $fn$
begin
  begin
    perform retail.fn_actividad_anotar(
      'vitrina_web', p_accion, p_descripcion, p_persona_id, retail.fn_actividad_terminal_ahora(),
      retail.fn_actividad_sede_de(p_persona_id, 'vivo'), null, 'vitrina_looks', p_look_id::text, now(), p_detalle, 'vivo');
  exception when others then
    raise warning 'actividad: no se anotó el look (%)', sqlerrm;
  end;
end;
$fn$;
revoke all on function retail.fn_vitrina_look_anotar(text, text, uuid, uuid, jsonb) from public, anon, authenticated;

-- Los looks tal como los lee la pantalla del ERP (todos, o los de `p_ids`), en su orden. `p_catalogo` es `tienda_catalogo(null)`: lo
-- que ve el cliente con «Todas». Cada prenda dice si se ve; el look, si se ve en la web (encendido y con todas sus prendas a la vista),
-- cuántas le faltan (eliminadas del catálogo) y el total que ve el cliente con «Todas» (solo si todas sus prendas se ven). Cada prenda
-- vale lo de SU color con «Todas» (`fn_tienda_precios` por color, la regla única del precio): el mismo total que «Arma tu look».
create or replace function retail.fn_vitrina_looks_json(p_ids uuid[], p_catalogo jsonb)
returns jsonb
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  with cat as (
    select (x ->> 'id')::uuid as producto_id, x as prenda
      from jsonb_array_elements(coalesce(p_catalogo -> 'prendas', '[]'::jsonb)) x
  ),
  todos as (
    select l.id, row_number() over (order by l.orden, l.creado_en, l.id) as lugar
      from retail.vitrina_looks l
  ),
  looks as (
    select l.*, t.lugar
      from retail.vitrina_looks l
      join todos t on t.id = l.id
     where p_ids is null or l.id = any (p_ids)
  ),
  piezas as (
    select pz.look_id, pz.posicion, pz.producto_id, pz.color_codigo,
           p.referencia as nombre, c.nombre as categoria, c.prefijo, c.familia,
           co.nombre as color_nombre, co.hex as color_hex,
           -- La foto de su color; si no tiene, la principal del modelo (propuesta c de la maqueta).
           (select pf.url from retail.producto_fotos pf
             where pf.producto_id = pz.producto_id
             order by (pf.color_codigo is not distinct from pz.color_codigo) desc, pf.es_principal desc, pf.orden, pf.created_at, pf.id
             limit 1) as foto,
           retail.fn_vitrina_look_se_ve(p_catalogo, pz.producto_id, pz.color_codigo) as se_ve,
           ct.prenda
      from retail.vitrina_look_piezas pz
      join looks l on l.id = pz.look_id
      join retail.productos p on p.id = pz.producto_id
      left join retail.categorias c on c.id = p.categoria_id
      left join retail.colores co on co.codigo = pz.color_codigo
      left join cat ct on ct.producto_id = pz.producto_id
  ),
  -- Lo que vale cada prenda del look en SU color, con «Todas»: el resumen por color de la regla única del precio (fn_tienda_precios).
  precio_del_color as (
    select distinct on (pc.producto_id, pc.color_codigo) pc.producto_id, pc.color_codigo, pc.resumen_final, pc.resumen_desde
      from retail.fn_tienda_precios(coalesce((select array_agg(distinct x.producto_id) from piezas x), '{}'::uuid[]), null, true) pc
     order by pc.producto_id, pc.color_codigo
  ),
  resumen as (
    select l.id,
           count(x.look_id) as guardadas,
           count(x.look_id) filter (where x.se_ve) as visibles,
           sum(pr.resumen_final) filter (where x.se_ve) as total,
           coalesce(bool_or(pr.resumen_desde) filter (where x.se_ve), false) as desde
      from looks l
      left join piezas x on x.look_id = l.id
      left join precio_del_color pr on pr.producto_id = x.producto_id and pr.color_codigo = x.color_codigo
     group by l.id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', l.id,
      'nombre', l.nombre,
      'frase', l.frase,
      'publicado', l.publicado,
      'lugar', l.lugar,
      'version', l.version,
      'piezas_del_look', l.piezas,
      'faltan', l.piezas - r.guardadas,
      'se_ve', l.publicado and r.visibles = l.piezas,
      'total', case when r.visibles = l.piezas then r.total end,
      'desde', r.desde,
      'publicado_en', l.publicado_en,
      'actualizado_en', l.actualizado_en,
      'actualizado_por', nullif(btrim(coalesce(pe.nombres, '') || ' ' || coalesce(pe.apellidos, '')), ''),
      'piezas', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'posicion', x.posicion,
                 'producto_id', x.producto_id,
                 'nombre', x.nombre,
                 'categoria', x.categoria,
                 'prefijo', x.prefijo,
                 'familia', x.familia,
                 'color', jsonb_build_object('codigo', x.color_codigo, 'nombre', x.color_nombre, 'hex', x.color_hex),
                 'foto', x.foto,
                 'se_ve', x.se_ve)
               order by x.posicion)
          from piezas x
         where x.look_id = l.id), '[]'::jsonb)
    ) order by l.lugar), '[]'::jsonb)
  from looks l
  join resumen r on r.id = l.id
  left join public.personas pe on pe.id = l.actualizado_por
$$;
revoke all on function retail.fn_vitrina_looks_json(uuid[], jsonb) from public, anon, authenticated;

-- ---------- 4. La lectura de la pantalla ----------
-- {looks: [...], modelos: [{id, nombre, categoria, prefijo, familia, foto, colores}]}: los modelos que se pueden poner en un look son los
-- que el cliente ve hoy en la web, con sus colores y fotos tal como los ve él.
create or replace function retail.fn_vitrina_looks()
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_catalogo jsonb;
begin
  perform retail.fn_exigir_modulo('vitrina_web');
  v_catalogo := retail.tienda_catalogo(null::uuid);
  return jsonb_build_object(
    'looks', retail.fn_vitrina_looks_json(null, v_catalogo),
    'modelos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id,
               'nombre', p.referencia,
               'categoria', c.nombre,
               'prefijo', c.prefijo,
               'familia', c.familia,
               'foto', coalesce(x -> 'fotos' ->> 0,
                                (select co ->> 'foto' from jsonb_array_elements(coalesce(x -> 'colores', '[]'::jsonb)) co
                                  where co ->> 'foto' is not null limit 1)),
               'colores', coalesce(x -> 'colores', '[]'::jsonb))
             order by p.referencia, p.id)
        from jsonb_array_elements(coalesce(v_catalogo -> 'prendas', '[]'::jsonb)) x
        join retail.productos p on p.id = (x ->> 'id')::uuid
        left join retail.categorias c on c.id = p.categoria_id), '[]'::jsonb)
  );
end;
$fn$;
revoke all on function retail.fn_vitrina_looks() from public, anon;
grant execute on function retail.fn_vitrina_looks() to authenticated;

-- ---------- 5. Crear o editar un look (la hoja) ----------
-- `p_look_id` null: un look nuevo (`p_version` también null). `p_piezas`: [{producto_id, color}] en el orden en que se ven (2 a 4).
-- `p_lugar`: su lugar en «Arma tu look» (1 = primero); null = donde está (o al final, si es nuevo). Devuelve el look como lo lee la
-- pantalla. Sin cambios, no escribe ni anota nada.
create or replace function retail.vitrina_guardar_look(
  p_look_id uuid,
  p_nombre text,
  p_frase text,
  p_publicado boolean,
  p_piezas jsonb,
  p_lugar integer,
  p_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_actor uuid;
  v_nombre text := nullif(btrim(regexp_replace(coalesce(p_nombre, ''), '\s+', ' ', 'g')), '');
  v_frase text := nullif(btrim(regexp_replace(coalesce(p_frase, ''), '\s+', ' ', 'g')), '');
  v_n integer;
  v_productos uuid[] := '{}';
  v_colores text[] := '{}';
  v_pieza jsonb;
  v_i integer;
  v_prenda text;
  v_catalogo jsonb;
  v_fila retail.vitrina_looks%rowtype;
  v_id uuid;
  v_antes jsonb;
  v_ahora jsonb;
  v_cambian_piezas boolean;
  v_partes text[] := '{}';
  v_otros uuid[];
  v_lugar_antes integer;
  v_lugar integer;
begin
  perform retail.fn_exigir_modulo('vitrina_web');
  v_actor := retail.fn_actor_persona_id(true);

  -- Lo que llega: nombre, frase, si se ve y de 2 a 4 prendas sin repetir modelo.
  if v_nombre is null or char_length(v_nombre) > 60 then
    raise exception 'vitrina_look_datos_invalidos' using hint = 'Ponle un nombre al look, de hasta 60 letras.';
  end if;
  if v_frase is not null and char_length(v_frase) > 200 then
    raise exception 'vitrina_look_datos_invalidos' using hint = 'La frase del look va en 200 letras como mucho.';
  end if;
  if p_publicado is null then
    raise exception 'vitrina_look_datos_invalidos' using hint = 'Falta decir si el look se ve en la web.';
  end if;
  if p_piezas is null or jsonb_typeof(p_piezas) <> 'array' or jsonb_array_length(p_piezas) not between 2 and 4 then
    raise exception 'vitrina_look_datos_invalidos' using hint = 'Un look lleva de 2 a 4 prendas.';
  end if;
  v_n := jsonb_array_length(p_piezas);
  for v_pieza in select e from jsonb_array_elements(p_piezas) e loop
    if jsonb_typeof(v_pieza) <> 'object'
       or coalesce(v_pieza ->> 'producto_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or nullif(btrim(coalesce(v_pieza ->> 'color', '')), '') is null then
      raise exception 'vitrina_look_datos_invalidos' using hint = 'Una de las prendas llegó incompleta. Vuelve a elegirla.';
    end if;
    v_productos := v_productos || (v_pieza ->> 'producto_id')::uuid;
    v_colores := v_colores || btrim(v_pieza ->> 'color');
  end loop;
  if (select count(distinct x) from unnest(v_productos) x) < v_n then
    raise exception 'vitrina_look_datos_invalidos' using hint = 'Cada modelo va una sola vez en el look.';
  end if;
  if p_lugar is not null and p_lugar < 1 then
    raise exception 'vitrina_look_datos_invalidos' using hint = 'El lugar del look va desde el 1 (el primero).';
  end if;

  -- Cada prenda: existe, se puede vender y ese color tiene tallas activas.
  for v_i in 1 .. v_n loop
    v_prenda := (select p.referencia from retail.productos p where p.id = v_productos[v_i]);
    if v_prenda is null then
      raise exception 'vitrina_look_prenda_no_existe' using hint = 'Una de las prendas ya no existe en el catálogo. Recarga la pantalla y elige otra.';
    end if;
    if not retail.fn_vitrina_publicable(v_productos[v_i])
       or not exists (select 1 from retail.variantes v
                       where v.producto_id = v_productos[v_i] and v.color_codigo = v_colores[v_i] and v.activo) then
      raise exception 'vitrina_look_prenda_invalida'
        using hint = format('«%s» no se puede usar así: está descontinuado, es de prueba o ese color ya no tiene tallas activas.', v_prenda);
    end if;
  end loop;

  -- Para mostrarlo, cada prenda tiene que verse en la web en ese color (lo que ve el cliente con «Todas»).
  if p_publicado then
    v_catalogo := retail.tienda_catalogo(null::uuid);
    for v_i in 1 .. v_n loop
      if not retail.fn_vitrina_look_se_ve(v_catalogo, v_productos[v_i], v_colores[v_i]) then
        raise exception 'vitrina_look_prenda_no_se_ve'
          using hint = format('Para mostrar el look, «%s» tiene que verse en la web en ese color. Muéstralo en Modelos, cámbialo o deja el look oculto.',
                              (select p.referencia from retail.productos p where p.id = v_productos[v_i]));
      end if;
    end loop;
  end if;

  v_ahora := (select jsonb_agg(jsonb_build_array(x.producto_id, x.color) order by x.n)
                from unnest(v_productos, v_colores) with ordinality as x (producto_id, color, n));

  -- Altas y cambios de lugar, de a uno: el lugar se reparte de 1 a N sin huecos ni empates.
  perform pg_advisory_xact_lock(hashtext('retail.vitrina_looks.lugar'));

  if p_look_id is null then
    if p_version is not null then
      raise exception 'vitrina_look_cambio_otro' using hint = 'Este look cambió mientras lo tenías abierto. Vuelve a abrirlo.';
    end if;
    begin
      insert into retail.vitrina_looks (nombre, frase, publicado, orden, piezas, publicado_en, creado_por, actualizado_por)
      values (v_nombre, v_frase, p_publicado, (select coalesce(max(l.orden), 0) + 1 from retail.vitrina_looks l), v_n,
              case when p_publicado then now() end, v_actor, v_actor)
      returning id into v_id;
    exception when unique_violation then
      raise exception 'vitrina_look_nombre_repetido' using hint = format('Ya hay un look que se llama «%s». Elige otro nombre.', v_nombre);
    end;
    v_cambian_piezas := true;
    v_partes := array[format('creó el look «%s» con %s prendas', v_nombre, v_n),
                      case when p_publicado then 'se ve en la web' else 'queda oculto' end];
  else
    select * into v_fila from retail.vitrina_looks where id = p_look_id for update;
    if not found then
      raise exception 'vitrina_look_no_existe' using hint = 'Ese look ya no existe. Recarga la pantalla.';
    end if;
    if p_version is null or p_version <> v_fila.version then
      raise exception 'vitrina_look_cambio_otro' using hint = 'Este look cambió mientras lo tenías abierto. Vuelve a abrirlo.';
    end if;
    v_id := v_fila.id;
    v_antes := (select jsonb_agg(jsonb_build_array(pz.producto_id, pz.color_codigo) order by pz.posicion)
                  from retail.vitrina_look_piezas pz where pz.look_id = v_id);
    v_cambian_piezas := v_antes is distinct from v_ahora or v_fila.piezas <> v_n;
    if v_nombre is distinct from v_fila.nombre then
      v_partes := v_partes || format('cambió el nombre a «%s»', v_nombre);
    end if;
    if v_frase is distinct from v_fila.frase then
      v_partes := v_partes || 'cambió la frase'::text;
    end if;
    if v_cambian_piezas then
      v_partes := v_partes || format('cambió sus prendas (%s)', v_n);
    end if;
    if p_publicado is distinct from v_fila.publicado then
      v_partes := v_partes || (case when p_publicado then 'se ve en la web' else 'ya no se ve en la web' end);
    end if;
    if cardinality(v_partes) > 0 then
      begin
        update retail.vitrina_looks
           set nombre = v_nombre,
               frase = v_frase,
               publicado = p_publicado,
               piezas = v_n,
               publicado_en = case when p_publicado and not v_fila.publicado then now() else publicado_en end,
               version = version + 1,
               actualizado_en = now(),
               actualizado_por = v_actor
         where id = v_id;
      exception when unique_violation then
        raise exception 'vitrina_look_nombre_repetido' using hint = format('Ya hay un look que se llama «%s». Elige otro nombre.', v_nombre);
      end;
    end if;
  end if;

  -- Las prendas: se reemplazan juntas, cada una en su lugar de la lámina (cómo eran antes queda en la Actividad).
  if v_cambian_piezas then
    delete from retail.vitrina_look_piezas where look_id = v_id;
    insert into retail.vitrina_look_piezas (look_id, posicion, producto_id, color_codigo, x, y, ancho, giro)
    select v_id, x.n, x.producto_id, x.color, l.x, l.y, l.ancho, l.giro
      from unnest(v_productos, v_colores) with ordinality as x (producto_id, color, n)
      cross join lateral retail.fn_vitrina_look_lamina(v_n, x.n::integer) l;
  end if;

  -- El lugar: el que pidió (dentro de 1..N) o el que ya tenía. Los demás se corren sin dejar huecos.
  v_otros := array(select l.id from retail.vitrina_looks l where l.id <> v_id order by l.orden, l.creado_en, l.id);
  v_lugar_antes := (select x.n from (select l.id, row_number() over (order by l.orden, l.creado_en, l.id) as n
                                       from retail.vitrina_looks l) x
                     where x.id = v_id);
  v_lugar := least(coalesce(p_lugar, v_lugar_antes), cardinality(v_otros) + 1);
  v_otros := v_otros[1:v_lugar - 1] || v_id || v_otros[v_lugar:];
  update retail.vitrina_looks l
     set orden = x.n
    from unnest(v_otros) with ordinality as x (id, n)
   where l.id = x.id and l.orden <> x.n;
  if p_look_id is not null and v_lugar <> v_lugar_antes then
    v_partes := v_partes || format('pasó al lugar %s', v_lugar);
  end if;

  if cardinality(v_partes) > 0 then
    perform retail.fn_vitrina_look_anotar(
      case when p_look_id is null then 'vitrina_look_creado' else 'vitrina_look_guardado' end,
      case when p_look_id is null then array_to_string(v_partes, ' · ')
           else '«' || v_nombre || '»: ' || array_to_string(v_partes, ' · ') end,
      v_actor, v_id,
      jsonb_build_object('look_id', v_id, 'publicado', p_publicado, 'lugar', v_lugar, 'piezas', v_ahora,
                         'piezas_antes', case when v_cambian_piezas then v_antes end));
  end if;

  return retail.fn_vitrina_looks_json(array[v_id], retail.tienda_catalogo(null::uuid)) -> 0;
end;
$fn$;
revoke all on function retail.vitrina_guardar_look(uuid, text, text, boolean, jsonb, integer, integer) from public, anon;
grant execute on function retail.vitrina_guardar_look(uuid, text, text, boolean, jsonb, integer, integer) to authenticated;

-- ---------- 6. Mostrar u ocultar (el interruptor de la lista) ----------
-- Mostrar pide lo mismo que guardar encendido: todas sus prendas, y cada una a la vista en la web. Ocultar no borra nada.
create or replace function retail.vitrina_mostrar_look(p_look_id uuid, p_publicado boolean, p_version integer)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_actor uuid;
  v_fila retail.vitrina_looks%rowtype;
  v_catalogo jsonb;
  v_prenda text;
begin
  perform retail.fn_exigir_modulo('vitrina_web');
  v_actor := retail.fn_actor_persona_id(true);

  if p_look_id is null or p_publicado is null then
    raise exception 'vitrina_look_datos_invalidos' using hint = 'Falta el look o si se ve en la web.';
  end if;
  select * into v_fila from retail.vitrina_looks where id = p_look_id for update;
  if not found then
    raise exception 'vitrina_look_no_existe' using hint = 'Ese look ya no existe. Recarga la pantalla.';
  end if;
  if p_version is null or p_version <> v_fila.version then
    raise exception 'vitrina_look_cambio_otro' using hint = 'Este look cambió mientras lo tenías abierto. Vuelve a abrirlo.';
  end if;
  if v_fila.publicado = p_publicado then
    return retail.fn_vitrina_looks_json(array[p_look_id], retail.tienda_catalogo(null::uuid)) -> 0;
  end if;

  if p_publicado then
    if (select count(*) from retail.vitrina_look_piezas pz where pz.look_id = p_look_id) < v_fila.piezas then
      raise exception 'vitrina_look_incompleto'
        using hint = format('A «%s» le falta una prenda: se eliminó del catálogo. Ábrelo y elige otra.', v_fila.nombre);
    end if;
    v_catalogo := retail.tienda_catalogo(null::uuid);
    v_prenda := (select p.referencia
                   from retail.vitrina_look_piezas pz
                   join retail.productos p on p.id = pz.producto_id
                  where pz.look_id = p_look_id
                    and not retail.fn_vitrina_look_se_ve(v_catalogo, pz.producto_id, pz.color_codigo)
                  order by pz.posicion
                  limit 1);
    if v_prenda is not null then
      raise exception 'vitrina_look_prenda_no_se_ve'
        using hint = format('Para mostrar el look, «%s» tiene que verse en la web en ese color. Muéstralo en Modelos o cámbialo.', v_prenda);
    end if;
  end if;

  update retail.vitrina_looks
     set publicado = p_publicado,
         publicado_en = case when p_publicado then now() else publicado_en end,
         version = version + 1,
         actualizado_en = now(),
         actualizado_por = v_actor
   where id = p_look_id;

  perform retail.fn_vitrina_look_anotar(
    case when p_publicado then 'vitrina_look_mostrado' else 'vitrina_look_ocultado' end,
    case when p_publicado then 'mostró el look «' || v_fila.nombre || '» en la web'
         else 'ocultó el look «' || v_fila.nombre || '» de la web' end,
    v_actor, p_look_id, jsonb_build_object('look_id', p_look_id, 'publicado', p_publicado));

  return retail.fn_vitrina_looks_json(array[p_look_id], retail.tienda_catalogo(null::uuid)) -> 0;
end;
$fn$;
revoke all on function retail.vitrina_mostrar_look(uuid, boolean, integer) from public, anon;
grant execute on function retail.vitrina_mostrar_look(uuid, boolean, integer) to authenticated;

-- ---------- 7. Validación final: si algo no quedó, se deshace todo ----------
do $$
begin
  if not exists (select 1 from retail.modulos where clave = 'vitrina_web' and incluye like '%looks%') then
    raise exception 'vitrina looks: el módulo vitrina_web no dice que arma los looks';
  end if;
  if not (select c.relrowsecurity from pg_class c where c.oid = 'retail.vitrina_looks'::regclass)
     or not (select c.relrowsecurity from pg_class c where c.oid = 'retail.vitrina_look_piezas'::regclass) then
    raise exception 'vitrina looks: las tablas tienen que tener RLS encendido';
  end if;
  if has_table_privilege('authenticated', 'retail.vitrina_looks', 'SELECT')
     or has_table_privilege('authenticated', 'retail.vitrina_look_piezas', 'SELECT')
     or has_table_privilege('anon', 'retail.vitrina_looks', 'SELECT')
     or has_table_privilege('tienda_web', 'retail.vitrina_looks', 'SELECT')
     or has_table_privilege('tienda_web', 'retail.vitrina_look_piezas', 'SELECT') then
    raise exception 'vitrina looks: las tablas se leen solo por sus funciones';
  end if;
  if has_function_privilege('anon', 'retail.vitrina_guardar_look(uuid, text, text, boolean, jsonb, integer, integer)', 'EXECUTE')
     or has_function_privilege('tienda_web', 'retail.vitrina_guardar_look(uuid, text, text, boolean, jsonb, integer, integer)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'retail.vitrina_guardar_look(uuid, text, text, boolean, jsonb, integer, integer)', 'EXECUTE')
     or has_function_privilege('authenticated', 'retail.fn_vitrina_looks_json(uuid[], jsonb)', 'EXECUTE')
     or has_function_privilege('tienda_web', 'retail.fn_vitrina_looks_json(uuid[], jsonb)', 'EXECUTE') then
    raise exception 'vitrina looks: las funciones del ERP son de las cuentas del ERP y las internas, de nadie';
  end if;
end;
$$;

reset lock_timeout;
