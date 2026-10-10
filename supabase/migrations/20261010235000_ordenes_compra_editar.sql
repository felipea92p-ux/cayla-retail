-- Órdenes de compra, fase 1 · actividad 4 (ADR-0362): editar una orden mientras está «generada».
--
-- EL PROBLEMA PRIMERO. Una orden se crea en el puesto, deprisa, y casi siempre algo se corrige después: el proveedor bajó el precio, eran
-- 30 y no 24, la entrega se corrió una semana. Sin poder editarla, la única salida sería anularla y crear otra: un número quemado y una
-- lista llena de anuladas por un dedo que se equivocó. Pero editar trae tres riesgos que la base tiene que cerrar:
--   · Dos personas con la misma orden abierta: gana la última en guardar y nadie se entera (ADR-0193). Aquí sería peor: la segunda
--     devolvería a la orden un precio que la primera ya corrigió con el proveedor.
--   · Lo que la orden decía antes desaparece: «¿quién le cambió el precio?» no tendría respuesta, y la regla de la casa es no borrar.
--   · Un doble clic en «Guardar cambios» chocaría consigo mismo («otra persona cambió esto», cuando fue la misma persona).
--
-- QUÉ CREA.
--   1. La clave `orden_compra_editar` en `acciones_sin_responsable` (decisión 39): con la cuenta de una persona firma ella; desde una
--      terminal, el combo.
--   2. `ordenes_compra.version` que sube SOLA en cada escritura de la fila (disparador, como `productos` en ADR-0193): lo que mande quien
--      escribe se ignora. La anulación (actividad 5) también la sube: una pantalla que editaba una orden que otra persona anuló recibe el
--      mismo aviso y, al recargar, ve que está anulada.
--   3. `orden_compra_versiones`: el ARCHIVO de lo que la orden decía antes de cada edición (la foto completa de `fn_orden_compra_detalle`,
--      con precios). Solo se agrega; nadie la edita ni la borra. Así las líneas de la orden se pueden reemplazar al editar sin perder lo
--      de antes («nunca borres datos: mueve a archivo»). Se lee solo por funciones (RLS sin políticas); hoy ninguna pantalla la muestra.
--   4. Las reglas de una orden en UN lugar (`fn_orden_compra_validar`), que usan crear y editar: lo que valida una, lo valida la otra.
--      Al editar, lo que NO se tocó no se vuelve a juzgar: un proveedor, una sede, una categoría o una marca que se desactivaron después,
--      o una entrega estimada que ya pasó, no impiden corregir la nota. Elegir de nuevo uno inactivo, sí se rechaza.
--   5. `editar_orden_compra(...)`: con la versión que la pantalla vio (`p_version_esperada`). Si otra persona guardó antes, responde
--      `PT409` / `version_cambiada` (el navegador recibe un 409, ADR-0193) y no escribe nada. Si lo que llega es IGUAL a lo que la orden
--      ya dice (un doble clic, un reintento sin red), devuelve la orden tal cual, sin choque y sin subir la versión. Sin cambios, tampoco
--      la sube. Con cambios: guarda la foto de antes, reemplaza cabecera y líneas y devuelve la versión nueva. El aviso del choque dice
--      la verdad (Formidable, 2026-10-10): si la orden se anuló, «se anuló mientras la editabas»; si el último cambio fue de la misma
--      persona (su guardado anterior SÍ llegó, pero la respuesta se perdió con la señal), «tu cambio anterior sí se guardó»; si no,
--      «otra persona cambió esta orden».
--   6. «Actividad» (ADR-0207): crear y editar anotan su línea en el módulo `ordenes_compra` («creó la OC-000129 para…», «editó la
--      OC-000129: entrega 15/10 → 18/10 · 1 línea cambiada»). SIN montos, como el costo en Productos: la línea la lee quien tiene el
--      módulo Actividad aunque no vea Órdenes de compra; los montos de antes quedan en el archivo. Se ve en la sede donde se hizo y en
--      la sede a la que llega. Un error al anotar nunca detiene el guardado (deja un WARNING).
--   7. `crear_orden_compra` se vuelve a escribir con las reglas compartidas y su línea de Actividad. Y el reintento deja de mentir
--      (Formidable, 2026-10-10): la pantalla reusa el mismo id en cada intento para que un doble clic no cree dos órdenes, pero si la
--      señal se cortó DESPUÉS de guardar y la persona corrigió algo antes de reintentar, devolver la orden «tal cual» hacía que la
--      pantalla dijera «guardada» con el total nuevo mientras la base seguía con lo de antes. Ahora compara lo pedido con lo guardado
--      (las mismas huellas que editar): igual, devuelve la orden; distinto, avisa «ya se guardó como OC-… con lo de antes»
--      (`orden_compra_ya_guardada`) y no cambia nada.
--
-- REGLAS (las de crear, en palabras de la pantalla, hint `orden_compra_*`); además: solo se edita una orden «generada»
-- (`orden_compra_anulada`), y hay que decir qué versión se editaba (`orden_compra_sin_version`). El número y la fecha de emisión no se
-- editan.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). Después de 20261010231500. Crea una tabla, pero SIN políticas (RLS encendido y nada
-- más) y con `create or replace trigger`, nunca `drop trigger`: no toma `auth`/`storage` (ADR-0195), va en UNA parte. Sin `select … into`
-- dentro de textos entre comillas (ADR-0288). Idempotente.

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. Con la cuenta de una persona, sin combo (decisión 39) ----------
insert into retail.acciones_sin_responsable (clave, descripcion) values
  ('orden_compra_editar', 'Editar una orden de compra (con la cuenta de una persona firma ella, desde una terminal se elige quién)')
on conflict (clave) do update set descripcion = excluded.descripcion;

-- ---------- 2. La versión sube sola en cada escritura (ADR-0193) ----------
create or replace function retail.fn_orden_compra_version() returns trigger
language plpgsql
as $$
begin
  -- Lo que mande quien escribe se ignora: la versión no se fija a mano.
  new.version := old.version + 1;
  return new;
end;
$$;
create or replace trigger ordenes_compra_version
  before update on retail.ordenes_compra
  for each row execute function retail.fn_orden_compra_version();

-- ---------- 3. El archivo de lo que la orden decía antes de cada edición ----------
create table if not exists retail.orden_compra_versiones (
  id bigint generated always as identity primary key,
  orden_compra_id uuid not null references retail.ordenes_compra (id),
  -- La versión que se reemplazó (la que la pantalla editó).
  version integer not null,
  -- La orden entera como la devuelve `fn_orden_compra_detalle`: cabecera, líneas con precios y descuentos, unidades y total.
  datos jsonb not null,
  reemplazada_por uuid references public.personas (id),
  reemplazada_en timestamptz not null default now(),
  constraint orden_compra_versiones_unica unique (orden_compra_id, version)
);
comment on table retail.orden_compra_versiones is
  'ADR-0362: lo que una orden de compra decía antes de cada edición (foto de fn_orden_compra_detalle). Solo se agrega. Se lee por funciones.';
alter table retail.orden_compra_versiones enable row level security;
revoke all on retail.orden_compra_versiones from anon, authenticated;

create or replace function retail.fn_orden_compra_versiones_inmutable() returns trigger
language plpgsql
as $$
begin
  raise exception 'El archivo de una orden de compra no se edita ni se borra: es lo que la orden decía antes' using errcode = '42501';
end;
$$;
create or replace trigger orden_compra_versiones_inmutable
  before update or delete on retail.orden_compra_versiones
  for each row execute function retail.fn_orden_compra_versiones_inmutable();

-- ---------- 4. Piezas comunes ----------

-- «OC-000129»: el número como se dice (el prefijo es presentación; la base guarda el número, decisión 2).
create or replace function retail.fn_orden_compra_numero_texto(p_numero integer) returns text
language sql immutable as $$
  select 'OC-' || lpad(p_numero::text, 6, '0');
$$;

-- Las reglas de una orden, para crear y para editar. `p_anterior` es la orden como estaba (`fn_orden_compra_detalle`) al editar, o NULL
-- al crear: lo que no cambió no se vuelve a juzgar (un proveedor, una sede, una categoría o una marca desactivados después; una entrega
-- estimada que ya pasó). Rechaza con el mensaje de la pantalla y su hint.
create or replace function retail.fn_orden_compra_validar(
  p_proveedor_id uuid,
  p_destino_id uuid,
  p_fecha_entrega_estimada date,
  p_nota text,
  p_lineas jsonb,
  p_anterior jsonb default null
) returns void
language plpgsql
stable
set search_path = retail, public, extensions
as $$
declare
  v_hoy date := retail.fn_hoy_lima();
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  v_editando boolean := p_anterior is not null;
  v_linea jsonb;
  v_pos integer := 0;
  v_categoria uuid;
  v_marca uuid;
  v_descripcion text;
  v_cantidad numeric;
  v_precio numeric;
  v_pct numeric;
  v_descuento numeric;
  v_bruto numeric;
begin
  -- Cabecera.
  if p_proveedor_id is null
     or not exists (
       select 1 from retail.proveedores pr
        where pr.id = p_proveedor_id
          and (pr.activo or (v_editando and pr.id::text = p_anterior -> 'proveedor' ->> 'id'))
     ) then
    raise exception 'Elige un proveedor activo' using hint = 'orden_compra_proveedor';
  end if;
  if p_destino_id is not null and not exists (
    select 1 from retail.ubicaciones u
     where u.id = p_destino_id
       and u.tipo in ('tienda', 'almacen')
       and (u.activo or (v_editando and u.id::text = p_anterior -> 'destino' ->> 'id'))
  ) then
    raise exception 'La mercadería llega a una tienda activa o se reparte desde Lima' using hint = 'orden_compra_destino';
  end if;
  if p_fecha_entrega_estimada is not null
     and (p_fecha_entrega_estimada < v_hoy or p_fecha_entrega_estimada > v_hoy + 365)
     and not (v_editando and p_fecha_entrega_estimada::text = p_anterior ->> 'fecha_entrega_estimada') then
    raise exception 'La entrega estimada va desde hoy y hasta dentro de un año' using hint = 'orden_compra_entrega';
  end if;
  if v_nota is not null and length(v_nota) > 500 then
    raise exception 'La nota es muy larga: hasta 500 letras' using hint = 'orden_compra_nota';
  end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'Agrega al menos una prenda a la orden' using hint = 'orden_compra_sin_lineas';
  end if;
  if jsonb_array_length(p_lineas) > 100 then
    raise exception 'Una orden lleva hasta 100 líneas: parte el pedido en dos órdenes' using hint = 'orden_compra_muchas_lineas';
  end if;

  -- Líneas: TODAS antes de escribir nada (al crear, el número del contador se toma recién si la orden se va a guardar).
  for v_linea in select value from jsonb_array_elements(p_lineas) loop
    v_pos := v_pos + 1;
    if jsonb_typeof(v_linea) <> 'object' then
      raise exception 'La línea % no se entiende', v_pos using hint = 'orden_compra_linea';
    end if;
    begin
      v_categoria := nullif(v_linea ->> 'categoria_id', '')::uuid;
      v_marca := nullif(v_linea ->> 'marca_id', '')::uuid;
      v_cantidad := nullif(btrim(v_linea ->> 'cantidad'), '')::numeric;
      v_precio := nullif(btrim(v_linea ->> 'precio_unitario'), '')::numeric;
      v_pct := nullif(btrim(v_linea ->> 'descuento_pct'), '')::numeric;
      v_descuento := nullif(btrim(v_linea ->> 'descuento'), '')::numeric;
    exception when others then
      raise exception 'La línea % tiene un número o un dato que no se entiende', v_pos using hint = 'orden_compra_linea';
    end;
    v_descripcion := nullif(btrim(coalesce(v_linea ->> 'descripcion', '')), '');
    -- Al editar, una categoría o marca que la orden ya tenía vale aunque hoy esté inactiva (no se obliga a cambiarla para tocar otra cosa).
    if v_categoria is null or not exists (
      select 1 from retail.categorias c
       where c.id = v_categoria
         and (c.activo or (v_editando and exists (
               select 1 from jsonb_array_elements(p_anterior -> 'lineas') a where a ->> 'categoria_id' = v_categoria::text)))
    ) then
      raise exception 'La línea % necesita una categoría activa', v_pos using hint = 'orden_compra_categoria';
    end if;
    if v_marca is null or not exists (
      select 1 from retail.marcas m
       where m.id = v_marca
         and (m.activo or (v_editando and exists (
               select 1 from jsonb_array_elements(p_anterior -> 'lineas') a where a ->> 'marca_id' = v_marca::text)))
    ) then
      raise exception 'La línea % necesita una marca activa', v_pos using hint = 'orden_compra_marca';
    end if;
    if v_descripcion is not null and length(v_descripcion) > 200 then
      raise exception 'La descripción de la línea % es muy larga: hasta 200 letras', v_pos using hint = 'orden_compra_descripcion';
    end if;
    if v_cantidad is null or v_cantidad <> trunc(v_cantidad) or v_cantidad < 1 or v_cantidad > 99999 then
      raise exception 'La cantidad de la línea % va de 1 a 99 999 unidades, sin decimales', v_pos using hint = 'orden_compra_cantidad';
    end if;
    if v_precio is null or v_precio < 0 or v_precio > 99999.99 or v_precio <> round(v_precio, 2) then
      raise exception 'El precio de la línea % va de S/ 0 a S/ 99 999.99, con hasta dos decimales', v_pos using hint = 'orden_compra_precio';
    end if;
    v_bruto := v_cantidad * v_precio;
    if v_pct is not null and (v_pct < 0 or v_pct > 100 or v_pct <> round(v_pct, 4)) then
      raise exception 'El descuento de la línea % va de 0 %% a 100 %%', v_pos using hint = 'orden_compra_descuento';
    end if;
    if v_pct is null and v_descuento is not null and (v_descuento < 0 or v_descuento <> round(v_descuento, 2) or v_descuento > v_bruto) then
      raise exception 'El descuento de la línea % no puede pasar de lo que cuesta la línea', v_pos using hint = 'orden_compra_descuento';
    end if;
  end loop;
end;
$$;

-- Lo que la orden PIDE, en una forma comparable: cabecera y líneas con el descuento ya en soles. Sirve para saber si una edición cambia
-- algo (sin cambios no se escribe) y si un pedido repetido es el mismo que ya se guardó. Solo con líneas ya validadas.
create or replace function retail.fn_orden_compra_huella(
  p_proveedor_id uuid,
  p_destino_id uuid,
  p_fecha_entrega_estimada date,
  p_nota text,
  p_lineas jsonb
) returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'proveedor', p_proveedor_id,
    'destino', p_destino_id,
    'entrega', p_fecha_entrega_estimada,
    'nota', nullif(btrim(coalesce(p_nota, '')), ''),
    'lineas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'categoria_id', (l.valor ->> 'categoria_id')::uuid,
               'marca_id', (l.valor ->> 'marca_id')::uuid,
               'descripcion', nullif(btrim(coalesce(l.valor ->> 'descripcion', '')), ''),
               'cantidad', (l.valor ->> 'cantidad')::numeric,
               'precio', (l.valor ->> 'precio_unitario')::numeric,
               'descuento', case
                              when nullif(btrim(l.valor ->> 'descuento_pct'), '') is not null
                                then round((l.valor ->> 'cantidad')::numeric * (l.valor ->> 'precio_unitario')::numeric
                                           * (l.valor ->> 'descuento_pct')::numeric / 100, 2)
                              else coalesce(nullif(btrim(l.valor ->> 'descuento'), '')::numeric, 0)
                            end,
               'descuento_pct', nullif(btrim(l.valor ->> 'descuento_pct'), '')::numeric
             ) order by l.posicion)
        from jsonb_array_elements(p_lineas) with ordinality as l(valor, posicion)
    ), '[]'::jsonb)
  );
$$;

-- La huella de la orden como está guardada (mismas claves que `fn_orden_compra_huella`).
create or replace function retail.fn_orden_compra_huella_guardada(p_orden_id uuid) returns jsonb
language sql
stable
set search_path = retail, public, extensions
as $$
  select jsonb_build_object(
    'proveedor', o.proveedor_id,
    'destino', o.ubicacion_destino_id,
    'entrega', o.fecha_entrega_estimada,
    'nota', o.nota,
    'lineas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'categoria_id', i.categoria_id,
               'marca_id', i.marca_id,
               'descripcion', i.descripcion,
               'cantidad', i.cantidad,
               'precio', i.precio_unitario,
               'descuento', i.descuento,
               'descuento_pct', i.descuento_pct
             ) order by i.posicion)
        from retail.orden_compra_items i
       where i.orden_compra_id = o.id
    ), '[]'::jsonb)
  )
  from retail.ordenes_compra o
  where o.id = p_orden_id;
$$;

-- Escribe las líneas de una orden (ya validadas). El descuento en % se convierte a soles aquí, así el candado
-- `orden_compra_items_descuento_cuadra` se cumple por construcción.
create or replace function retail.fn_orden_compra_escribir_lineas(p_orden_id uuid, p_lineas jsonb) returns void
language sql
volatile
set search_path = retail, public, extensions
as $$
  insert into retail.orden_compra_items (orden_compra_id, posicion, categoria_id, marca_id, descripcion, cantidad, precio_unitario, descuento, descuento_pct)
  select p_orden_id,
         l.posicion,
         (l.valor ->> 'categoria_id')::uuid,
         (l.valor ->> 'marca_id')::uuid,
         nullif(btrim(coalesce(l.valor ->> 'descripcion', '')), ''),
         (l.valor ->> 'cantidad')::numeric::integer,
         (l.valor ->> 'precio_unitario')::numeric,
         case
           when nullif(btrim(l.valor ->> 'descuento_pct'), '') is not null
             then round((l.valor ->> 'cantidad')::numeric * (l.valor ->> 'precio_unitario')::numeric
                        * (l.valor ->> 'descuento_pct')::numeric / 100, 2)
           else coalesce(nullif(btrim(l.valor ->> 'descuento'), '')::numeric, 0)
         end,
         nullif(btrim(l.valor ->> 'descuento_pct'), '')::numeric
    from jsonb_array_elements(p_lineas) with ordinality as l(valor, posicion);
$$;

-- Dónde se ve una línea de Actividad de una orden: en la sede desde donde se operó (la terminal o la sede elegida; si no, la asignada).
create or replace function retail.fn_orden_compra_sede_actividad(p_persona_id uuid) returns uuid
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
begin
  return retail.fn_actividad_sede_de(p_persona_id, 'vivo');
exception when others then
  return null;
end;
$$;

-- ¿Lo que llega con un `p_id` que ya existe es el MISMO pedido? (un doble clic, o un reintento después de perder la respuesta con la
-- señal). Si lo es, no pasa nada. Si cambió algo, avisa que la orden ya se guardó con lo de antes: devolverla «tal cual» haría que la
-- pantalla dijera «guardada» con datos que la base no tiene (lo vio el escéptico de Formidable, 2026-10-10).
create or replace function retail.fn_orden_compra_exigir_mismo_pedido(
  p_id uuid,
  p_numero integer,
  p_proveedor_id uuid,
  p_destino_id uuid,
  p_fecha_entrega_estimada date,
  p_nota text,
  p_lineas jsonb
) returns void
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_pedida jsonb;
begin
  begin
    v_pedida := retail.fn_orden_compra_huella(p_proveedor_id, p_destino_id, p_fecha_entrega_estimada, p_nota, p_lineas);
  exception when others then
    v_pedida := null; -- lo pedido ni siquiera se puede leer: no es el mismo pedido
  end;
  if v_pedida is null or v_pedida is distinct from retail.fn_orden_compra_huella_guardada(p_id) then
    raise exception 'Esta orden ya se guardó como % con lo que tenía antes de tu cambio. Ábrela y corrígela ahí.',
      retail.fn_orden_compra_numero_texto(p_numero)
      using hint = 'orden_compra_ya_guardada';
  end if;
end;
$$;

-- ---------- 5. Crear (las mismas reglas, ahora compartidas, y su línea de Actividad) ----------
create or replace function retail.crear_orden_compra(
  p_id uuid,
  p_proveedor_id uuid,
  p_destino_id uuid,
  p_fecha_entrega_estimada date,
  p_nota text,
  p_lineas jsonb
)
returns table (id uuid, numero integer)
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare
  v_actor uuid;
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  v_existente record;
  v_id uuid;
  v_numero integer;
  v_lineas integer;
  v_unidades bigint;
begin
  if retail.fn_ve_modulo('ordenes_compra') is not true then
    raise exception 'Crear una orden de compra necesita el módulo «Órdenes de compra» en tu rol'
      using errcode = '42501', hint = 'ordenes_compra_sin_modulo';
  end if;
  -- Quién la crea: con la cuenta de una persona, ella (`orden_compra_crear` está soltada del combo); desde una terminal, el responsable
  -- elegido, presente en la tienda. NULL solo pasa si una terminal manda la clave sin elegir a nadie: una orden sin autor no se guarda.
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  if p_id is null then
    raise exception 'Falta el identificador de la orden: vuelve a abrir el formulario' using hint = 'orden_compra_sin_id';
  end if;

  -- Doble clic o reintento: la orden ya se guardó. Si es el mismo pedido se devuelve tal cual; si la persona cambió algo entre un
  -- intento y otro, se le avisa que quedó con lo de antes. Nunca se crea otra ni se cambia nada.
  for v_existente in select o.id, o.numero, o.creada_por from retail.ordenes_compra o where o.id = p_id loop
    if v_existente.creada_por is distinct from v_actor then
      raise exception 'Esa orden ya existe' using hint = 'orden_compra_ya_existe';
    end if;
    perform retail.fn_orden_compra_exigir_mismo_pedido(
      v_existente.id, v_existente.numero, p_proveedor_id, p_destino_id, p_fecha_entrega_estimada, v_nota, p_lineas);
    return query select v_existente.id, v_existente.numero;
    return;
  end loop;

  perform retail.fn_orden_compra_validar(p_proveedor_id, p_destino_id, p_fecha_entrega_estimada, v_nota, p_lineas, null);

  -- Todo bien: recién ahora se toma el número.
  insert into retail.ordenes_compra (id, proveedor_id, ubicacion_destino_id, fecha_entrega_estimada, nota, creada_por)
  values (p_id, p_proveedor_id, p_destino_id, p_fecha_entrega_estimada, v_nota, v_actor)
  on conflict on constraint ordenes_compra_pkey do nothing
  returning ordenes_compra.id, ordenes_compra.numero into v_id, v_numero;
  -- Dos pedidos con el mismo `p_id` al mismo tiempo: el segundo no inserta y devuelve el del primero (si pedía lo mismo).
  if v_id is null then
    for v_existente in select o.id, o.numero, o.creada_por from retail.ordenes_compra o where o.id = p_id loop
      if v_existente.creada_por is distinct from v_actor then
        raise exception 'Esa orden ya existe' using hint = 'orden_compra_ya_existe';
      end if;
      perform retail.fn_orden_compra_exigir_mismo_pedido(
        v_existente.id, v_existente.numero, p_proveedor_id, p_destino_id, p_fecha_entrega_estimada, v_nota, p_lineas);
      return query select v_existente.id, v_existente.numero;
      return;
    end loop;
  end if;

  perform retail.fn_orden_compra_escribir_lineas(v_id, p_lineas);

  -- Actividad (ADR-0207): sin montos. Si falla, la orden igual queda guardada.
  begin
    v_lineas := jsonb_array_length(p_lineas);
    v_unidades := (select coalesce(sum(i.cantidad), 0) from retail.orden_compra_items i where i.orden_compra_id = v_id);
    perform retail.fn_actividad_anotar(
      'ordenes_compra', 'orden_compra_creada',
      'creó la ' || retail.fn_orden_compra_numero_texto(v_numero) || ' para '
        || (select pr.nombre from retail.proveedores pr where pr.id = p_proveedor_id) || ': '
        || retail.fn_actividad_cuantas(v_lineas, 'línea', 'líneas') || ', '
        || retail.fn_actividad_cuantas(v_unidades, 'unidad', 'unidades') || ' · '
        || coalesce('llega a ' || (select u.nombre from retail.ubicaciones u where u.id = p_destino_id), 'por repartir desde Lima'),
      v_actor, retail.fn_actividad_terminal_ahora(), retail.fn_orden_compra_sede_actividad(v_actor), p_destino_id,
      'ordenes_compra', v_id::text, now(),
      jsonb_build_object('orden_id', v_id, 'numero', v_numero, 'lineas', v_lineas, 'unidades', v_unidades, 'destino_id', p_destino_id),
      'vivo');
  exception when others then
    raise warning 'actividad: no se anotó la orden de compra % (%)', v_numero, sqlerrm;
  end;

  return query select v_id, v_numero;
end;
$$;
comment on function retail.crear_orden_compra(uuid, uuid, uuid, date, text, jsonb) is
  'ADR-0362: crea una orden de compra con sus líneas (generada). p_id lo genera la pantalla: repetido devuelve la misma orden. '
  'Destino NULL = por repartir desde Lima. Firma fn_actor_persona_id(true) (orden_compra_crear: persona sin combo, terminal con combo).';
revoke all on function retail.crear_orden_compra(uuid, uuid, uuid, date, text, jsonb) from public, anon;
grant execute on function retail.crear_orden_compra(uuid, uuid, uuid, date, text, jsonb) to authenticated, service_role;

-- ---------- 6. Editar ----------
create or replace function retail.editar_orden_compra(
  p_id uuid,
  p_version_esperada integer,
  p_proveedor_id uuid,
  p_destino_id uuid,
  p_fecha_entrega_estimada date,
  p_nota text,
  p_lineas jsonb
)
returns table (id uuid, numero integer, version integer)
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare
  v_actor uuid;
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  v_orden retail.ordenes_compra;
  v_anterior jsonb;
  v_guardada jsonb;
  v_pedida jsonb;
  v_version integer;
  v_cambios text[] := '{}';
  v_claves text[] := '{}';
  v_antes jsonb;
  v_despues jsonb;
  v_n_antes integer;
  v_n_despues integer;
  v_agregadas integer := 0;
  v_quitadas integer := 0;
  v_cambiadas integer := 0;
  v_unidades_antes bigint;
  v_unidades_despues bigint;
  v_i integer;
begin
  if retail.fn_ve_modulo('ordenes_compra') is not true then
    raise exception 'Editar una orden de compra necesita el módulo «Órdenes de compra» en tu rol'
      using errcode = '42501', hint = 'ordenes_compra_sin_modulo';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  if p_id is null or p_version_esperada is null then
    raise exception 'Falta saber qué orden y qué versión estás editando: vuelve a abrirla' using hint = 'orden_compra_sin_version';
  end if;

  -- La fila se bloquea: dos guardados a la vez se ponen en fila, y el segundo, al despertar, ve la versión que dejó el primero.
  select o.* into v_orden from retail.ordenes_compra o where o.id = p_id for update;
  if not found then
    raise exception 'Esa orden de compra no existe' using hint = 'orden_compra_no_existe';
  end if;

  if v_orden.version <> p_version_esperada then
    -- ¿Es el mismo pedido que ya se guardó (doble clic, reintento sin red)? Entonces no hay choque: se devuelve la orden como está.
    begin
      v_pedida := retail.fn_orden_compra_huella(p_proveedor_id, p_destino_id, p_fecha_entrega_estimada, v_nota, p_lineas);
    exception when others then
      v_pedida := null;
    end;
    if v_pedida is not null and v_pedida = retail.fn_orden_compra_huella_guardada(p_id) and v_orden.estado = 'generada' then
      return query select v_orden.id, v_orden.numero, v_orden.version;
      return;
    end if;
    -- El choque dice la verdad sobre QUÉ pasó: siempre PT409 (la pantalla ofrece «Recargar»), con la frase que corresponde.
    if v_orden.estado = 'anulada' then
      raise exception 'Esta orden se anuló mientras la editabas. Recarga para verla.'
        using errcode = 'PT409', hint = 'version_cambiada';
    end if;
    if v_orden.actualizada_por = v_actor then
      -- Su guardado anterior SÍ llegó (la respuesta se perdió con la señal, u otra pestaña suya): no fue «otra persona».
      raise exception 'Tu cambio anterior sí se guardó, pero esta pantalla todavía no lo muestra. Recarga para ver cómo quedó.'
        using errcode = 'PT409', hint = 'version_cambiada';
    end if;
    raise exception 'Otra persona cambió esta orden mientras la editabas. Recarga para ver sus cambios.'
      using errcode = 'PT409', hint = 'version_cambiada';
  end if;

  if v_orden.estado <> 'generada' then
    raise exception 'Esta orden está anulada: ya no se puede editar' using hint = 'orden_compra_anulada';
  end if;

  v_anterior := retail.fn_orden_compra_detalle(p_id);
  perform retail.fn_orden_compra_validar(p_proveedor_id, p_destino_id, p_fecha_entrega_estimada, v_nota, p_lineas, v_anterior);

  v_guardada := retail.fn_orden_compra_huella_guardada(p_id);
  v_pedida := retail.fn_orden_compra_huella(p_proveedor_id, p_destino_id, p_fecha_entrega_estimada, v_nota, p_lineas);
  if v_pedida = v_guardada then
    -- Sin cambios: nada que guardar, ni versión que subir.
    return query select v_orden.id, v_orden.numero, v_orden.version;
    return;
  end if;

  -- Lo que la orden decía, al archivo (con precios): las líneas se reemplazan, pero lo de antes no se pierde.
  insert into retail.orden_compra_versiones (orden_compra_id, version, datos, reemplazada_por)
  values (p_id, v_orden.version, v_anterior, v_actor);

  update retail.ordenes_compra o
     set proveedor_id = p_proveedor_id,
         ubicacion_destino_id = p_destino_id,
         fecha_entrega_estimada = p_fecha_entrega_estimada,
         nota = v_nota,
         actualizada_por = v_actor,
         actualizada_en = now()
   where o.id = p_id
  returning o.version into v_version;

  delete from retail.orden_compra_items i where i.orden_compra_id = p_id;
  perform retail.fn_orden_compra_escribir_lineas(p_id, p_lineas);

  -- Actividad (ADR-0207): qué cambió, sin montos. Las líneas se comparan por su lugar en la orden (la 1 con la 1): basta para decir
  -- cuántas se agregaron, quitaron o cambiaron. Si falla, la edición igual queda guardada.
  begin
    if v_pedida -> 'proveedor' is distinct from v_guardada -> 'proveedor' then
      v_claves := v_claves || 'proveedor'::text;
      v_cambios := v_cambios || ('proveedor ' || (select pr.nombre from retail.proveedores pr where pr.id = v_orden.proveedor_id)
                                 || ' → ' || (select pr.nombre from retail.proveedores pr where pr.id = p_proveedor_id));
    end if;
    if v_pedida -> 'destino' is distinct from v_guardada -> 'destino' then
      v_claves := v_claves || 'destino'::text;
      v_cambios := v_cambios || ('llega a '
        || coalesce((select u.nombre from retail.ubicaciones u where u.id = v_orden.ubicacion_destino_id), 'por repartir') || ' → '
        || coalesce((select u.nombre from retail.ubicaciones u where u.id = p_destino_id), 'por repartir'));
    end if;
    if v_pedida -> 'entrega' is distinct from v_guardada -> 'entrega' then
      v_claves := v_claves || 'entrega'::text;
      v_cambios := v_cambios || ('entrega ' || coalesce(to_char(v_orden.fecha_entrega_estimada, 'DD/MM'), 'sin fecha') || ' → '
                                 || coalesce(to_char(p_fecha_entrega_estimada, 'DD/MM'), 'sin fecha'));
    end if;
    if v_pedida -> 'nota' is distinct from v_guardada -> 'nota' then
      v_claves := v_claves || 'nota'::text;
      v_cambios := v_cambios || 'la nota'::text;
    end if;
    v_n_antes := jsonb_array_length(v_guardada -> 'lineas');
    v_n_despues := jsonb_array_length(v_pedida -> 'lineas');
    for v_i in 0 .. greatest(v_n_antes, v_n_despues) - 1 loop
      v_antes := v_guardada -> 'lineas' -> v_i;
      v_despues := v_pedida -> 'lineas' -> v_i;
      if v_antes is null then
        v_agregadas := v_agregadas + 1;
      elsif v_despues is null then
        v_quitadas := v_quitadas + 1;
      elsif v_antes <> v_despues then
        v_cambiadas := v_cambiadas + 1;
      end if;
    end loop;
    if v_agregadas > 0 then v_cambios := v_cambios || retail.fn_actividad_cuantas(v_agregadas, 'línea agregada', 'líneas agregadas'); end if;
    if v_quitadas > 0 then v_cambios := v_cambios || retail.fn_actividad_cuantas(v_quitadas, 'línea quitada', 'líneas quitadas'); end if;
    if v_cambiadas > 0 then v_cambios := v_cambios || retail.fn_actividad_cuantas(v_cambiadas, 'línea cambiada', 'líneas cambiadas'); end if;
    v_unidades_antes := coalesce((v_anterior ->> 'unidades')::bigint, 0);
    v_unidades_despues := (select coalesce(sum(i.cantidad), 0) from retail.orden_compra_items i where i.orden_compra_id = p_id);
    if v_unidades_antes <> v_unidades_despues then
      v_cambios := v_cambios || (v_unidades_antes::text || ' → ' || retail.fn_actividad_cuantas(v_unidades_despues, 'unidad', 'unidades'));
    end if;

    perform retail.fn_actividad_anotar(
      'ordenes_compra', 'orden_compra_editada',
      'editó la ' || retail.fn_orden_compra_numero_texto(v_orden.numero)
        || coalesce(': ' || nullif(array_to_string(v_cambios, ' · '), ''), ''),
      v_actor, retail.fn_actividad_terminal_ahora(), retail.fn_orden_compra_sede_actividad(v_actor),
      coalesce(p_destino_id, v_orden.ubicacion_destino_id),
      'ordenes_compra', p_id::text, now(),
      jsonb_build_object('orden_id', p_id, 'numero', v_orden.numero, 'version_anterior', v_orden.version, 'version', v_version,
                         'campos', to_jsonb(v_claves),
                         'lineas', jsonb_build_object('agregadas', v_agregadas, 'quitadas', v_quitadas, 'cambiadas', v_cambiadas),
                         'unidades', jsonb_build_object('antes', v_unidades_antes, 'despues', v_unidades_despues)),
      'vivo');
  exception when others then
    raise warning 'actividad: no se anotó la edición de la orden de compra % (%)', v_orden.numero, sqlerrm;
  end;

  return query select v_orden.id, v_orden.numero, v_version;
end;
$$;
comment on function retail.editar_orden_compra(uuid, integer, uuid, uuid, date, text, jsonb) is
  'ADR-0362: edita una orden generada con la versión que vio la pantalla (PT409 / version_cambiada si otra persona guardó antes; '
  'el mismo pedido repetido devuelve la orden sin choque). Archiva lo de antes en orden_compra_versiones y anota en Actividad, sin montos. '
  'Firma fn_actor_persona_id(true) (orden_compra_editar: persona sin combo, terminal con combo).';
revoke all on function retail.editar_orden_compra(uuid, integer, uuid, uuid, date, text, jsonb) from public, anon;
grant execute on function retail.editar_orden_compra(uuid, integer, uuid, uuid, date, text, jsonb) to authenticated, service_role;

-- Las piezas internas no se llaman desde la web.
revoke all on function retail.fn_orden_compra_version() from public, anon, authenticated;
revoke all on function retail.fn_orden_compra_versiones_inmutable() from public, anon, authenticated;
revoke all on function retail.fn_orden_compra_numero_texto(integer) from public, anon, authenticated;
revoke all on function retail.fn_orden_compra_validar(uuid, uuid, date, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function retail.fn_orden_compra_huella(uuid, uuid, date, text, jsonb) from public, anon, authenticated;
revoke all on function retail.fn_orden_compra_huella_guardada(uuid) from public, anon, authenticated;
revoke all on function retail.fn_orden_compra_escribir_lineas(uuid, jsonb) from public, anon, authenticated;
revoke all on function retail.fn_orden_compra_sede_actividad(uuid) from public, anon, authenticated;
revoke all on function retail.fn_orden_compra_exigir_mismo_pedido(uuid, integer, uuid, uuid, date, text, jsonb) from public, anon, authenticated;

reset lock_timeout;
