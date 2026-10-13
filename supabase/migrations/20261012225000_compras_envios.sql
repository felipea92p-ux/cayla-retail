-- ADR-0362 · fase 3 (Felipe 2026-10-12, «desarrollar de corrido»): el envío de lo comprado a una sede.
-- Contrato con la pantalla: docs/compras/ordenes-de-compra-2026-10/contrato-envio-a-sede.md.
--
-- EL PROBLEMA PRIMERO. La orden dice qué se pidió (fase 1) y el comprobante, qué se facturó (fase 2), pero nada dice qué salió hacia
-- cada sede. Lo de una orden «Por repartir» llega a Lima, que no es una sede (nada es stock ahí, decisiones 10 y 22), y se reparte
-- en una guía por sede; lo de una orden «directo a la tienda» va solo a esa tienda. Sin el envío, la sede no sabe qué le llega, la
-- recepción (fase 4) no tiene contra qué contar y nadie ve cuánto de lo pedido falta mandar.
--
-- QUÉ HACE (una sola parte, re-pegable).
--   1. `despachos` (la guía: una sede, número de guía opcional, nace «en camino») y `despacho_items` (cada línea pedida que va, con
--      su categoría, marca, descripción y precio CONGELADOS al enviar). RLS encendido y SIN políticas: solo las leen y escriben las
--      funciones de abajo. `numero` lleva su propio contador (ENV-000001); anular no lo libera.
--   2. Candados de esquema: lo enviado vigente de una línea pedida (envíos en camino, abiertos o cerrados) no pasa de lo pedido o lo
--      facturado, lo que sea mayor (decisión 43) — disparador DIFERIDO que bloquea la línea pedida; una línea de una orden «directo»
--      va solo a su tienda; un envío no suma líneas si ya no está en camino; su camino es en camino → abierto → cerrado, o en camino
--      → anulado, y nunca se borra.
--   3. `crear_envio`, `anular_envio`, `fn_envios_por_abrir`, `fn_envio_detalle` y `fn_ordenes_compra_por_enviar`. Piden el módulo
--      Órdenes de compra (decisión 34; las dos lecturas de la sede, también Recibir) y firman con `fn_actor_persona_id(true)` y la
--      clave nueva `orden_compra_envio` (decisión 39). Un envío no mueve stock: el stock entra cuando la sede lo recibe (fase 4).
--   4. Sobre funciones que ya existen (REEMPLAZOS ANCLADOS sobre la definición viva, como 20261012211000):
--      · `fn_orden_compra_detalle`: por línea, `enviado` y `por_enviar`; la orden suma `envios`.
--      · `editar_orden_compra`: no edita una orden que ya salió en un envío (vigente o anulado: sus líneas son el respaldo de la guía
--        y `despacho_items` las referencia, igual que el comprobante en la fase 2).
--      · `anular_orden_compra`: no anula una orden con un envío vigente (en camino, abierto o cerrado).
--
-- DESCARTÉ guardar el envío como un traslado (`traslados`): un traslado mueve stock entre sedes y aquí no hay stock de origen (Lima no
-- es una sede); y meter el reparto en `compra_item_destinos`: el papel no bloquea (decisión 9), así que la guía tiene que existir sin él.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). UNA parte, después de 20261012211000: tablas NUEVAS sin políticas, sin
-- `drop trigger` (los disparadores comunes van con `create or replace trigger`; el diferido se crea solo si falta, porque Postgres no
-- acepta `create or replace` en uno de restricción), sin `select … into` dentro de textos entre comillas (ADR-0288). Los reemplazos
-- abortan SIN TOCAR NADA si una función viva cambió y no hacen nada si ya están aplicados: se puede pegar dos veces. El bloque final
-- comprueba que quedó todo.

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

-- ---------- 1. El envío (la guía) ----------
create sequence if not exists retail.despachos_numero_seq;

create table if not exists retail.despachos (
  id uuid primary key default gen_random_uuid(),
  -- Correlativo de la empresa (ENV-000001 en pantalla); anular no lo libera.
  numero integer not null default nextval('retail.despachos_numero_seq'),
  -- Una guía, una sede (decisión 12).
  ubicacion_destino_id uuid not null references retail.ubicaciones (id),
  numero_guia text check (numero_guia is null or (btrim(numero_guia) <> '' and length(numero_guia) <= 40)),
  estado text not null default 'en_camino',
  nota text check (nota is null or (btrim(nota) <> '' and length(nota) <= 500)),
  despachado_por uuid not null references public.personas (id),
  despachado_en timestamptz not null default now(),
  -- Los llena la recepción (fase 4).
  abierto_por uuid references public.personas (id),
  abierto_en timestamptz,
  cerrado_por uuid references public.personas (id),
  cerrado_en timestamptz,
  anulado_por uuid references public.personas (id),
  anulado_en timestamptz,
  motivo_anulacion text,
  -- Doble clic o reintento sin red: el mismo token con la misma huella devuelve el envío que ya se guardó.
  token_cliente uuid,
  huella_envio text,
  -- Sube sola con cada escritura (ADR-0193): quien anula con una versión vieja no pisa a quien cambió antes.
  version integer not null default 1 check (version > 0),
  constraint despachos_numero_unico unique (numero),
  constraint despachos_token_cliente_key unique (token_cliente),
  constraint despachos_estado check (estado in ('en_camino', 'abierto', 'cerrado', 'anulado')),
  -- Abierto (o cerrado) si y solo si dice quién y cuándo lo abrió; cerrado si y solo si dice quién y cuándo lo cerró.
  constraint despachos_apertura check (
    case when estado in ('abierto', 'cerrado') then abierto_por is not null and abierto_en is not null
         else abierto_por is null and abierto_en is null end),
  constraint despachos_cierre check (
    case when estado = 'cerrado' then cerrado_por is not null and cerrado_en is not null
         else cerrado_por is null and cerrado_en is null end),
  -- Anulado si y solo si dice quién, cuándo y por qué (hasta 300 letras).
  constraint despachos_anulacion check (
    case when estado = 'anulado'
           then anulado_por is not null and anulado_en is not null and coalesce(btrim(motivo_anulacion), '') <> ''
                and length(motivo_anulacion) <= 300
         else anulado_por is null and anulado_en is null and motivo_anulacion is null end)
);
alter sequence retail.despachos_numero_seq owned by retail.despachos.numero;
create index if not exists despachos_destino_estado_idx on retail.despachos (ubicacion_destino_id, estado);
comment on table retail.despachos is
  'ADR-0362 (fase 3): el envío (la guía) de lo comprado a UNA sede (ENV-000001). Nace en_camino; la sede lo abre y lo cierra (fase 4); '
  'se anula solo en camino. No mueve stock. Solo se lee y escribe por funciones security definer (RLS sin políticas).';

-- ---------- 2. Lo que va en el envío ----------
create table if not exists retail.despacho_items (
  id uuid primary key default gen_random_uuid(),
  despacho_id uuid not null references retail.despachos (id),
  orden_compra_item_id uuid not null references retail.orden_compra_items (id),
  -- La línea del comprobante, si la línea pedida está en UNA sola de un comprobante vigente; nula si no hay papel (decisión 9) o si
  -- hay varias [provisional].
  compra_item_id uuid references retail.compra_items (id),
  cantidad integer not null check (cantidad > 0),
  -- CONGELADOS al enviar: lo que la sede verá aunque la orden cambie después. El precio es el neto de la orden
  -- ((precio × cantidad − descuento) / cantidad, a 2 decimales); quien recibe lo ve y lo corrige (fase 4, decisión 18).
  categoria_id uuid not null references retail.categorias (id),
  marca_id uuid not null references retail.marcas (id),
  descripcion text check (descripcion is null or btrim(descripcion) <> ''),
  precio_unitario numeric(12, 2) not null check (precio_unitario >= 0),
  constraint despacho_items_linea_unica unique (despacho_id, orden_compra_item_id)
);
create index if not exists despacho_items_orden_compra_item_idx on retail.despacho_items (orden_compra_item_id);
create index if not exists despacho_items_compra_item_idx on retail.despacho_items (compra_item_id) where compra_item_id is not null;
comment on table retail.despacho_items is
  'ADR-0362 (fase 3): una línea pedida que va en un envío, con categoría, marca, descripción y precio congelados al enviar. Lo enviado '
  'vigente de una línea no pasa de lo pedido o lo facturado (lo mayor). Solo se lee y escribe por funciones (RLS sin políticas).';

alter table retail.despachos enable row level security;
alter table retail.despacho_items enable row level security;
revoke all on table retail.despachos from anon, authenticated;
revoke all on table retail.despacho_items from anon, authenticated;
revoke all on sequence retail.despachos_numero_seq from anon, authenticated;

-- ---------- 3. Candados de esquema ----------
-- El envío: lo que lo identifica no cambia, su camino no vuelve atrás y no se borra (se anula).
create or replace function retail.fn_despachos_camino()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Un envío no se borra: se anula' using errcode = '42501', hint = 'envio_no_se_borra';
  end if;
  if new.numero is distinct from old.numero
     or new.ubicacion_destino_id is distinct from old.ubicacion_destino_id
     or new.despachado_por is distinct from old.despachado_por
     or new.despachado_en is distinct from old.despachado_en
     or new.token_cliente is distinct from old.token_cliente
     or new.huella_envio is distinct from old.huella_envio then
    raise exception 'El número, la sede, quién y cuándo despachó un envío no se cambian' using errcode = '23514', hint = 'envio_inmutable';
  end if;
  if new.estado is distinct from old.estado
     and not ((old.estado = 'en_camino' and new.estado in ('abierto', 'anulado'))
              or (old.estado = 'abierto' and new.estado = 'cerrado')) then
    raise exception 'Un envío % no pasa a %', replace(old.estado, '_', ' '), replace(new.estado, '_', ' ')
      using errcode = '23514', hint = 'envio_estado';
  end if;
  return new;
end;
$$;
revoke all on function retail.fn_despachos_camino() from public, anon, authenticated;
create or replace trigger despachos_camino
  before update or delete on retail.despachos
  for each row execute function retail.fn_despachos_camino();
create or replace trigger despachos_version
  before update on retail.despachos
  for each row execute function retail.fn_subir_version();

-- La línea, al entrar (inmediato): el envío sigue en camino, la orden sigue generada, una orden «directo» va solo a su tienda y la
-- línea del comprobante es de esa misma línea pedida. Lo que la identifica no cambia y no se borra.
create or replace function retail.fn_despacho_items_al_entrar()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_despacho record;
  v_linea record;
begin
  if tg_op = 'DELETE' then
    raise exception 'Una línea de un envío no se borra: se anula el envío' using errcode = '42501', hint = 'envio_no_se_borra';
  end if;
  if tg_op = 'UPDATE' and (new.despacho_id is distinct from old.despacho_id
                           or new.orden_compra_item_id is distinct from old.orden_compra_item_id) then
    raise exception 'Una línea de un envío no cambia de envío ni de línea pedida' using errcode = '23514', hint = 'envio_linea_inmutable';
  end if;
  if tg_op = 'INSERT' then
    select d.estado, d.ubicacion_destino_id, u.nombre as sede
      into v_despacho
      from retail.despachos d
      join retail.ubicaciones u on u.id = d.ubicacion_destino_id
     where d.id = new.despacho_id;
    select o.numero, o.estado, o.ubicacion_destino_id, u.nombre as destino
      into v_linea
      from retail.orden_compra_items i
      join retail.ordenes_compra o on o.id = i.orden_compra_id
      left join retail.ubicaciones u on u.id = o.ubicacion_destino_id
     where i.id = new.orden_compra_item_id;
    if v_despacho.estado <> 'en_camino' then
      raise exception 'Solo un envío en camino suma líneas' using errcode = '23514', hint = 'envio_no_en_camino';
    end if;
    if v_linea.estado <> 'generada' then
      raise exception 'La % está anulada: ya no se envía', retail.fn_orden_compra_numero_texto(v_linea.numero)
        using errcode = '23514', hint = 'envio_orden_anulada';
    end if;
    if v_linea.ubicacion_destino_id is not null and v_linea.ubicacion_destino_id <> v_despacho.ubicacion_destino_id then
      raise exception 'La % llega directo a %: no se envía a %', retail.fn_orden_compra_numero_texto(v_linea.numero),
        v_linea.destino, v_despacho.sede using errcode = '23514', hint = 'envio_otra_sede';
    end if;
  end if;
  if new.compra_item_id is not null and not exists (
    select 1 from retail.compra_items ci where ci.id = new.compra_item_id and ci.orden_compra_item_id = new.orden_compra_item_id
  ) then
    raise exception 'La línea del comprobante no es de esa línea de la orden' using errcode = '23514', hint = 'envio_comprobante_ajeno';
  end if;
  return new;
end;
$$;
revoke all on function retail.fn_despacho_items_al_entrar() from public, anon, authenticated;
create or replace trigger despacho_items_al_entrar
  before insert or update or delete on retail.despacho_items
  for each row execute function retail.fn_despacho_items_al_entrar();

-- El tope (diferido, al confirmar): lo enviado vigente de una línea pedida no pasa de lo pedido o lo facturado, lo que sea mayor.
-- La línea pedida se bloquea: dos envíos de la misma línea se ponen en fila y el segundo suma lo del primero. Solo se mide cuando la
-- línea suma unidades: bajar una cantidad o corregir el precio (fase 4) no se frena, aunque un comprobante anulado después haya bajado
-- el tope (eso lo ve la recepción como sobrante). Es `security definer` porque un disparador diferido corre al CONFIRMAR, con el rol de
-- la sesión (authenticated desde la web): sin eso no podría leer estas tablas (RLS sin políticas) y el tope no mediría nada.
create or replace function retail.fn_despacho_items_tope()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_linea record;
  v_enviado integer;
  v_facturado integer;
begin
  if tg_op = 'UPDATE' and new.cantidad <= old.cantidad then
    return null;
  end if;
  select i.id, i.cantidad, i.posicion, o.numero
    into v_linea
    from retail.orden_compra_items i
    join retail.ordenes_compra o on o.id = i.orden_compra_id
   where i.id = new.orden_compra_item_id
     for update of i;
  v_enviado := (select coalesce(sum(di.cantidad), 0)::integer
                  from retail.despacho_items di
                  join retail.despachos d on d.id = di.despacho_id
                 where di.orden_compra_item_id = new.orden_compra_item_id
                   and d.estado in ('en_camino', 'abierto', 'cerrado'));
  v_facturado := (select coalesce(sum(ci.cantidad), 0)::integer
                    from retail.compra_items ci
                    join retail.compras c on c.id = ci.compra_id
                   where ci.orden_compra_item_id = new.orden_compra_item_id
                     and c.estado = 'vigente');
  if v_enviado > greatest(v_linea.cantidad, v_facturado) then
    raise exception 'De la línea % de la % se enviarían % y el tope es % (lo pedido o lo facturado, lo que sea mayor)',
      v_linea.posicion, retail.fn_orden_compra_numero_texto(v_linea.numero), v_enviado, greatest(v_linea.cantidad, v_facturado)
      using errcode = '23514', hint = 'envio_de_mas';
  end if;
  return null;
end;
$$;
revoke all on function retail.fn_despacho_items_tope() from public, anon, authenticated;
-- Postgres no acepta `create or replace` en un disparador de restricción, y `drop trigger` toma las tablas de `auth` y `storage`
-- (CLAUDE.md, «Políticas y deadlocks»): se crea solo si falta. Su función sí se reemplaza arriba.
do $do$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'retail.despacho_items'::regclass and tgname = 'despacho_items_tope') then
    create constraint trigger despacho_items_tope
      after insert or update of cantidad on retail.despacho_items
      deferrable initially deferred
      for each row execute function retail.fn_despacho_items_tope();
  end if;
end;
$do$;

-- ---------- 4. Piezas comunes ----------
create or replace function retail.fn_envio_numero_texto(p_numero integer)
returns text
language sql
immutable
as $$
  select 'ENV-' || lpad(p_numero::text, 6, '0');
$$;
comment on function retail.fn_envio_numero_texto(integer) is 'ADR-0362 (fase 3): el número de un envío como se lee (ENV-000012).';
revoke all on function retail.fn_envio_numero_texto(integer) from public, anon, authenticated;

-- La respuesta de crear_envio (también en un reintento). Avisa «de más» cuando, con este envío, lo enviado de una línea pasa lo pedido
-- (cabe porque el papel trajo más, decisión 43). Cuenta este envío y los vigentes anteriores, así un reintento responde lo mismo.
create or replace function retail.fn_envio_resultado(p_despacho_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select jsonb_build_object(
           'despacho_id', d.id,
           'numero', retail.fn_envio_numero_texto(d.numero),
           'sede', u.nombre,
           'unidades', (select coalesce(sum(di.cantidad), 0)::integer from retail.despacho_items di where di.despacho_id = d.id),
           'avisos', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'tipo', 'de_mas',
                      'orden_compra_item_id', i.id,
                      'orden', retail.fn_orden_compra_numero_texto(o.numero),
                      'posicion', i.posicion,
                      'descripcion', concat_ws(' · ', cat.nombre, mar.nombre, i.descripcion),
                      'pedido', i.cantidad,
                      'enviado', env.cantidad
                    ) order by o.numero, i.posicion)
               from retail.despacho_items di
               join retail.orden_compra_items i on i.id = di.orden_compra_item_id
               join retail.ordenes_compra o on o.id = i.orden_compra_id
               join retail.categorias cat on cat.id = i.categoria_id
               join retail.marcas mar on mar.id = i.marca_id
              cross join lateral (
                select coalesce(sum(x.cantidad), 0)::integer as cantidad
                  from retail.despacho_items x
                  join retail.despachos y on y.id = x.despacho_id
                 where x.orden_compra_item_id = i.id
                   and (y.id = d.id or (y.estado in ('en_camino', 'abierto', 'cerrado') and y.numero < d.numero))
              ) env
              where di.despacho_id = d.id
                and env.cantidad > i.cantidad
           ), '[]'::jsonb)
         )
    from retail.despachos d
    join retail.ubicaciones u on u.id = d.ubicacion_destino_id
   where d.id = p_despacho_id;
$$;
comment on function retail.fn_envio_resultado(uuid) is
  'ADR-0362 (fase 3): la respuesta de crear_envio (despacho_id, numero, sede, unidades, avisos «de_mas»). Interna.';
revoke all on function retail.fn_envio_resultado(uuid) from public, anon, authenticated;

-- ---------- 5. Con la cuenta de una persona, sin combo (decisión 39) ----------
insert into retail.acciones_sin_responsable (clave, descripcion) values
  ('orden_compra_envio',
   'Enviar a una sede lo de una orden de compra, o anular ese envío (con la cuenta de una persona firma ella, desde una terminal se elige quién)')
on conflict (clave) do update set descripcion = excluded.descripcion;

-- ---------- 6. Crear un envío ----------
-- `p_lineas`: [{ "orden_compra_item_id": uuid, "cantidad": entero > 0 }]. Las líneas pueden ser de varias órdenes y proveedores
-- (decisión 11); una orden «directo» va solo a su tienda; cada línea, hasta lo que le queda por enviar (lo pedido o lo facturado, lo
-- mayor, menos lo enviado vigente). El comprobante no bloquea (decisión 9).
create or replace function retail.crear_envio(
  p_ubicacion_destino_id uuid,
  p_lineas jsonb,
  p_numero_guia text default null,
  p_nota text default null,
  p_token uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare
  v_actor uuid;
  v_huella text;
  v_guia text := nullif(btrim(coalesce(p_numero_guia, '')), '');
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  v_sede text;
  v_linea jsonb;
  v_pos integer := 0;
  v_item_id uuid;
  v_cantidad numeric;
  v_ids uuid[] := '{}';
  v_pedidas jsonb := '[]'::jsonb;
  v_item record;
  v_facturado integer;
  v_enviado integer;
  v_queda integer;
  v_compra_item uuid;
  v_lineas jsonb := '[]'::jsonb;
  v_existente record;
  v_despacho_id uuid;
  v_numero integer;
  v_restriccion text;
  v_orden record;
begin
  -- Permiso: el módulo Órdenes de compra (decisión 34).
  if retail.fn_ve_modulo('ordenes_compra') is not true then
    raise exception 'Enviar a una sede necesita el módulo «Órdenes de compra» en tu rol'
      using errcode = '42501', hint = 'ordenes_compra_sin_modulo';
  end if;
  -- Quién despacha: con la cuenta de una persona, ella (`orden_compra_envio` está soltada del combo); desde una terminal, el
  -- responsable elegido. NULL solo pasa si una terminal manda la clave sin elegir a nadie: un envío sin autor no sale.
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;

  v_huella := md5(jsonb_build_object('sede', p_ubicacion_destino_id, 'lineas', p_lineas, 'guia', p_numero_guia, 'nota', p_nota)::text);

  -- Las líneas, primero solo su forma: lo demás se valida con las filas ya bloqueadas.
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'Elige al menos una línea para enviar' using hint = 'envio_sin_lineas';
  end if;
  for v_linea in select e.value from jsonb_array_elements(p_lineas) e loop
    v_pos := v_pos + 1;
    if jsonb_typeof(v_linea) <> 'object' then
      raise exception 'La línea % no se entiende', v_pos using hint = 'envio_linea';
    end if;
    begin
      v_item_id := nullif(btrim(v_linea ->> 'orden_compra_item_id'), '')::uuid;
      v_cantidad := nullif(btrim(v_linea ->> 'cantidad'), '')::numeric;
    exception when others then
      raise exception 'La línea % tiene un número o un dato que no se entiende', v_pos using hint = 'envio_linea';
    end;
    if v_item_id is null then
      raise exception 'La línea % no dice qué línea de la orden va: recarga la pantalla', v_pos using hint = 'envio_linea';
    end if;
    if v_cantidad is null or v_cantidad <> trunc(v_cantidad) or v_cantidad < 1 or v_cantidad > 99999 then
      raise exception 'La cantidad de la línea % va de 1 a 99 999 unidades, sin decimales', v_pos using hint = 'envio_cantidad';
    end if;
    if v_item_id = any(v_ids) then
      raise exception 'La línea % se repite en este envío', v_pos using hint = 'envio_linea_repetida';
    end if;
    v_ids := v_ids || v_item_id;
    v_pedidas := v_pedidas || jsonb_build_object('orden_compra_item_id', v_item_id, 'cantidad', v_cantidad::integer, 'pos', v_pos);
  end loop;

  -- Se bloquean las órdenes (nadie las anula, edita ni les registra papel mientras salen) y las líneas pedidas (dos envíos de la misma
  -- línea se ponen en fila y el segundo ve lo del primero), siempre en el mismo orden para que dos envíos no se traben entre sí.
  perform 1
     from retail.ordenes_compra o
    where o.id in (select i.orden_compra_id from retail.orden_compra_items i where i.id = any(v_ids))
    order by o.id
      for share;
  perform 1 from retail.orden_compra_items i where i.id = any(v_ids) order by i.id for update;

  -- Doble clic o reintento sin red: el mismo envío ya se guardó y se devuelve lo mismo. El mismo token con OTRO contenido no es un
  -- reintento: es otro guardado que la pantalla no debió mandar con ese token.
  if p_token is not null then
    for v_existente in select d.id, d.huella_envio from retail.despachos d where d.token_cliente = p_token loop
      if v_existente.huella_envio = v_huella then
        return retail.fn_envio_resultado(v_existente.id);
      end if;
      raise exception 'Ese envío ya se guardó con otros datos: recarga la pantalla' using hint = 'envio_otro_envio';
    end loop;
  end if;

  -- La sede: una tienda o un almacén activo (el Taller no: sus insumos van por otra orden, decisión 25).
  v_sede := (select u.nombre from retail.ubicaciones u
              where u.id = p_ubicacion_destino_id and u.activo and u.tipo in ('tienda', 'almacen'));
  if v_sede is null then
    raise exception 'Elige una sede activa a la que enviar' using hint = 'envio_sede';
  end if;
  if v_guia is not null and length(v_guia) > 40 then
    raise exception 'El número de guía es muy largo: hasta 40 letras' using hint = 'envio_guia';
  end if;
  if v_nota is not null and length(v_nota) > 500 then
    raise exception 'La nota es muy larga: hasta 500 letras' using hint = 'envio_nota';
  end if;

  -- Cada línea, ya bloqueada: de una orden generada, a la sede que le toca y hasta lo que le queda por enviar.
  for v_linea in select e.value from jsonb_array_elements(v_pedidas) e loop
    select i.id, i.posicion, i.cantidad, i.subtotal, i.categoria_id, i.marca_id, i.descripcion, i.orden_compra_id,
           o.numero, o.estado, o.ubicacion_destino_id, ud.nombre as destino
      into v_item
      from retail.orden_compra_items i
      join retail.ordenes_compra o on o.id = i.orden_compra_id
      left join retail.ubicaciones ud on ud.id = o.ubicacion_destino_id
     where i.id = (v_linea ->> 'orden_compra_item_id')::uuid;
    if not found then
      raise exception 'La línea % no es de ninguna orden: recarga la pantalla', v_linea ->> 'pos' using hint = 'envio_linea_no_existe';
    end if;
    if v_item.estado <> 'generada' then
      raise exception 'La % está anulada: ya no se envía', retail.fn_orden_compra_numero_texto(v_item.numero)
        using hint = 'envio_orden_anulada';
    end if;
    if v_item.ubicacion_destino_id is not null and v_item.ubicacion_destino_id <> p_ubicacion_destino_id then
      raise exception 'La % llega directo a %: no se envía a %', retail.fn_orden_compra_numero_texto(v_item.numero), v_item.destino, v_sede
        using hint = 'envio_otra_sede';
    end if;
    v_facturado := (select coalesce(sum(ci.cantidad), 0)::integer
                      from retail.compra_items ci
                      join retail.compras c on c.id = ci.compra_id
                     where ci.orden_compra_item_id = v_item.id and c.estado = 'vigente');
    v_enviado := (select coalesce(sum(di.cantidad), 0)::integer
                    from retail.despacho_items di
                    join retail.despachos d on d.id = di.despacho_id
                   where di.orden_compra_item_id = v_item.id and d.estado in ('en_camino', 'abierto', 'cerrado'));
    v_queda := greatest(greatest(v_item.cantidad, v_facturado) - v_enviado, 0);
    if (v_linea ->> 'cantidad')::integer > v_queda then
      raise exception 'De la línea % de la % quedan % por enviar: no se pueden enviar %',
        v_item.posicion, retail.fn_orden_compra_numero_texto(v_item.numero), v_queda, v_linea ->> 'cantidad'
        using hint = 'envio_de_mas';
    end if;
    -- El papel: si la línea pedida está en UNA sola línea de un comprobante vigente, el envío la nombra; con ninguna o varias queda
    -- sin nombrar [provisional] y la recepción (fase 4) lo resuelve.
    v_compra_item := (select case when count(*) = 1 then (array_agg(ci.id))[1] end
                        from retail.compra_items ci
                        join retail.compras c on c.id = ci.compra_id
                       where ci.orden_compra_item_id = v_item.id and c.estado = 'vigente');
    v_lineas := v_lineas || jsonb_build_object(
      'orden_compra_item_id', v_item.id, 'orden_compra_id', v_item.orden_compra_id, 'orden_numero', v_item.numero,
      'compra_item_id', v_compra_item, 'cantidad', (v_linea ->> 'cantidad')::integer,
      'categoria_id', v_item.categoria_id, 'marca_id', v_item.marca_id, 'descripcion', v_item.descripcion,
      'precio_unitario', round(v_item.subtotal / v_item.cantidad, 2));
  end loop;

  -- Todo bien: recién ahora se toma el número. Una carrera con el mismo token termina en el único y se responde igual que arriba.
  begin
    insert into retail.despachos (ubicacion_destino_id, numero_guia, nota, despachado_por, token_cliente, huella_envio)
    values (p_ubicacion_destino_id, v_guia, v_nota, v_actor, p_token, v_huella)
    returning id, numero into v_despacho_id, v_numero;
  exception when unique_violation then
    get stacked diagnostics v_restriccion = constraint_name;
    if v_restriccion = 'despachos_token_cliente_key' then
      for v_existente in select d.id, d.huella_envio from retail.despachos d where d.token_cliente = p_token loop
        if v_existente.huella_envio = v_huella then
          return retail.fn_envio_resultado(v_existente.id);
        end if;
      end loop;
      raise exception 'Ese envío ya se guardó con otros datos: recarga la pantalla' using hint = 'envio_otro_envio';
    end if;
    raise;
  end;

  insert into retail.despacho_items (despacho_id, orden_compra_item_id, compra_item_id, cantidad, categoria_id, marca_id, descripcion,
                                     precio_unitario)
  select v_despacho_id, (l ->> 'orden_compra_item_id')::uuid, (l ->> 'compra_item_id')::uuid, (l ->> 'cantidad')::integer,
         (l ->> 'categoria_id')::uuid, (l ->> 'marca_id')::uuid, l ->> 'descripcion', (l ->> 'precio_unitario')::numeric
    from jsonb_array_elements(v_lineas) l;

  -- Actividad (ADR-0207), sin montos, una por orden (así sale en la historia de cada orden). Si falla, el envío igual queda guardado.
  begin
    for v_orden in
      select (l ->> 'orden_compra_id')::uuid as id, (l ->> 'orden_numero')::integer as numero,
             sum((l ->> 'cantidad')::integer)::integer as unidades
        from jsonb_array_elements(v_lineas) l
       group by 1, 2
       order by 2
    loop
      perform retail.fn_actividad_anotar(
        'ordenes_compra', 'orden_compra_envio',
        'envió ' || case when v_orden.unidades = 1 then '1 unidad' else v_orden.unidades || ' unidades' end
          || ' de la ' || retail.fn_orden_compra_numero_texto(v_orden.numero) || ' ('
          || (select pr.nombre from retail.ordenes_compra o join retail.proveedores pr on pr.id = o.proveedor_id where o.id = v_orden.id)
          || ') a ' || v_sede || ' en la ' || retail.fn_envio_numero_texto(v_numero),
        v_actor, retail.fn_actividad_terminal_ahora(), retail.fn_orden_compra_sede_actividad(v_actor), p_ubicacion_destino_id,
        'ordenes_compra', v_orden.id::text, now(),
        jsonb_build_object('orden_id', v_orden.id, 'numero', v_orden.numero, 'despacho_id', v_despacho_id,
                           'envio', retail.fn_envio_numero_texto(v_numero), 'unidades', v_orden.unidades),
        'vivo');
    end loop;
  exception when others then
    raise warning 'actividad: no se anotó el envío % (%)', v_numero, sqlerrm;
  end;

  return retail.fn_envio_resultado(v_despacho_id);
end;
$$;
comment on function retail.crear_envio(uuid, jsonb, text, text, uuid) is
  'ADR-0362 (fase 3): crea un envío en camino a UNA sede con líneas de órdenes generadas (una orden directo, solo a su tienda; cada '
  'línea hasta lo pedido o lo facturado, lo mayor, menos lo enviado). No mueve stock. Solo el módulo Órdenes de compra. Devuelve '
  '{despacho_id, numero, sede, unidades, avisos}. p_token + huella: un reintento devuelve lo mismo.';
revoke all on function retail.crear_envio(uuid, jsonb, text, text, uuid) from public, anon;
grant execute on function retail.crear_envio(uuid, jsonb, text, text, uuid) to authenticated, service_role;

-- ---------- 7. Anular un envío (solo en camino, con motivo) ----------
create or replace function retail.anular_envio(p_despacho_id uuid, p_version integer, p_motivo text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare
  v_actor uuid;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_despacho retail.despachos;
  v_version integer;
  v_orden record;
begin
  if retail.fn_ve_modulo('ordenes_compra') is not true then
    raise exception 'Anular un envío necesita el módulo «Órdenes de compra» en tu rol'
      using errcode = '42501', hint = 'ordenes_compra_sin_modulo';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  if p_despacho_id is null or p_version is null then
    raise exception 'Falta saber qué envío y qué versión estás anulando: vuelve a abrirlo' using hint = 'envio_sin_version';
  end if;
  if v_motivo is null then
    raise exception 'Escribe por qué se anula el envío' using hint = 'envio_motivo';
  end if;
  if length(v_motivo) > 300 then
    raise exception 'El motivo es muy largo: hasta 300 letras' using hint = 'envio_motivo';
  end if;

  -- El envío se bloquea: anular y abrir (fase 4) a la vez se ponen en fila, y el segundo ve lo que dejó el primero.
  select d.* into v_despacho from retail.despachos d where d.id = p_despacho_id for update;
  if not found then
    raise exception 'Ese envío no existe' using hint = 'envio_no_existe';
  end if;
  if v_despacho.estado = 'anulado' then
    -- El mismo pedido otra vez (doble clic, reintento): ya está hecho, se devuelve como quedó.
    if v_despacho.motivo_anulacion = v_motivo and v_despacho.anulado_por = v_actor then
      return jsonb_build_object('despacho_id', v_despacho.id, 'numero', retail.fn_envio_numero_texto(v_despacho.numero),
                                'estado', v_despacho.estado, 'version', v_despacho.version);
    end if;
    raise exception 'Este envío ya estaba anulado' using hint = 'envio_ya_anulado';
  end if;
  if v_despacho.estado = 'abierto' then
    raise exception 'Este envío ya se abrió en la sede: no se anula' using hint = 'envio_no_en_camino';
  end if;
  if v_despacho.estado = 'cerrado' then
    raise exception 'Este envío ya se recibió en la sede: no se anula' using hint = 'envio_no_en_camino';
  end if;
  if v_despacho.version <> p_version then
    raise exception 'Otra persona cambió este envío mientras lo mirabas. Recarga para verlo antes de anularlo.'
      using errcode = 'PT409', hint = 'version_cambiada';
  end if;

  update retail.despachos d
     set estado = 'anulado',
         anulado_por = v_actor,
         anulado_en = now(),
         motivo_anulacion = v_motivo
   where d.id = p_despacho_id
  returning d.version into v_version;

  -- Actividad (ADR-0207), una por orden del envío. Si falla, la anulación igual queda guardada.
  begin
    for v_orden in
      select o.id, o.numero
        from retail.ordenes_compra o
       where o.id in (select i.orden_compra_id
                        from retail.despacho_items di
                        join retail.orden_compra_items i on i.id = di.orden_compra_item_id
                       where di.despacho_id = p_despacho_id)
       order by o.numero
    loop
      perform retail.fn_actividad_anotar(
        'ordenes_compra', 'orden_compra_envio_anulado',
        'anuló la ' || retail.fn_envio_numero_texto(v_despacho.numero) || ' a '
          || (select u.nombre from retail.ubicaciones u where u.id = v_despacho.ubicacion_destino_id)
          || ' (' || retail.fn_orden_compra_numero_texto(v_orden.numero) || '): «' || v_motivo || '»',
        v_actor, retail.fn_actividad_terminal_ahora(), retail.fn_orden_compra_sede_actividad(v_actor), v_despacho.ubicacion_destino_id,
        'ordenes_compra', v_orden.id::text, now(),
        jsonb_build_object('orden_id', v_orden.id, 'numero', v_orden.numero, 'despacho_id', p_despacho_id,
                           'envio', retail.fn_envio_numero_texto(v_despacho.numero), 'motivo', v_motivo),
        'vivo');
    end loop;
  exception when others then
    raise warning 'actividad: no se anotó la anulación del envío % (%)', v_despacho.numero, sqlerrm;
  end;

  return jsonb_build_object('despacho_id', p_despacho_id, 'numero', retail.fn_envio_numero_texto(v_despacho.numero),
                            'estado', 'anulado', 'version', v_version);
end;
$$;
comment on function retail.anular_envio(uuid, integer, text) is
  'ADR-0362 (fase 3): anula un envío EN CAMINO, con motivo y la versión que la pantalla vio (PT409 si cambió). Lo anulado deja de '
  'contar como enviado. Solo el módulo Órdenes de compra. Devuelve {despacho_id, numero, estado, version}.';
revoke all on function retail.anular_envio(uuid, integer, text) from public, anon;
grant execute on function retail.anular_envio(uuid, integer, text) to authenticated, service_role;

-- ---------- 8. Lo que está en camino a una sede (para la recepción, fase 4) ----------
create or replace function retail.fn_envios_por_abrir(p_ubicacion_id uuid)
returns table (
  id uuid,
  numero text,
  numero_guia text,
  nota text,
  despachado_por text,
  despachado_en timestamptz,
  version integer,
  lineas integer,
  unidades integer,
  ordenes text[],
  proveedores text[]
)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
begin
  if retail.fn_ve_modulo('ordenes_compra') is not true and retail.fn_ve_modulo('recibir') is not true then
    raise exception 'Ver los envíos necesita el módulo «Órdenes de compra» o «Recibir mercadería» en tu rol'
      using errcode = '42501', hint = 'envios_sin_modulo';
  end if;

  return query
  select d.id,
         retail.fn_envio_numero_texto(d.numero),
         d.numero_guia,
         d.nota,
         nullif(btrim(concat_ws(' ', pe.nombres, pe.apellidos)), ''),
         d.despachado_en,
         d.version,
         t.lineas,
         t.unidades,
         t.ordenes,
         t.proveedores
    from retail.despachos d
    left join public.personas pe on pe.id = d.despachado_por
    cross join lateral (
      select count(*)::integer as lineas,
             coalesce(sum(di.cantidad), 0)::integer as unidades,
             array_agg(distinct retail.fn_orden_compra_numero_texto(o.numero)) as ordenes,
             array_agg(distinct pr.nombre) as proveedores
        from retail.despacho_items di
        join retail.orden_compra_items i on i.id = di.orden_compra_item_id
        join retail.ordenes_compra o on o.id = i.orden_compra_id
        join retail.proveedores pr on pr.id = o.proveedor_id
       where di.despacho_id = d.id
    ) t
   where d.ubicacion_destino_id = p_ubicacion_id
     and d.estado = 'en_camino'
   order by d.numero;
end;
$$;
comment on function retail.fn_envios_por_abrir(uuid) is
  'ADR-0362 (fase 3): los envíos en camino a una sede, del más antiguo al más nuevo (para abrirlos en la fase 4). Módulo Órdenes de '
  'compra o Recibir mercadería.';
revoke all on function retail.fn_envios_por_abrir(uuid) from public, anon;
grant execute on function retail.fn_envios_por_abrir(uuid) to authenticated, service_role;

-- ---------- 9. Un envío por dentro ----------
create or replace function retail.fn_envio_detalle(p_despacho_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_resultado jsonb;
begin
  if retail.fn_ve_modulo('ordenes_compra') is not true and retail.fn_ve_modulo('recibir') is not true then
    raise exception 'Ver un envío necesita el módulo «Órdenes de compra» o «Recibir mercadería» en tu rol'
      using errcode = '42501', hint = 'envios_sin_modulo';
  end if;

  select jsonb_build_object(
           'id', d.id,
           'numero', retail.fn_envio_numero_texto(d.numero),
           'estado', d.estado,
           'sede', jsonb_build_object('id', u.id, 'nombre', u.nombre),
           'numero_guia', d.numero_guia,
           'nota', d.nota,
           'despachado_por', nullif(btrim(concat_ws(' ', pd.nombres, pd.apellidos)), ''),
           'despachado_en', d.despachado_en,
           'abierto_por', nullif(btrim(concat_ws(' ', pab.nombres, pab.apellidos)), ''),
           'abierto_en', d.abierto_en,
           'cerrado_por', nullif(btrim(concat_ws(' ', pce.nombres, pce.apellidos)), ''),
           'cerrado_en', d.cerrado_en,
           'anulado_por', nullif(btrim(concat_ws(' ', pan.nombres, pan.apellidos)), ''),
           'anulado_en', d.anulado_en,
           'motivo_anulacion', d.motivo_anulacion,
           'version', d.version,
           'unidades', (select coalesce(sum(x.cantidad), 0)::integer from retail.despacho_items x where x.despacho_id = d.id),
           'lineas', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'id', di.id,
                      'orden_compra_id', o.id,
                      'orden', retail.fn_orden_compra_numero_texto(o.numero),
                      'orden_compra_item_id', i.id,
                      'posicion', i.posicion,
                      'proveedor', jsonb_build_object('id', pr.id, 'nombre', pr.nombre),
                      'categoria_id', di.categoria_id,
                      'categoria', c.nombre,
                      'marca_id', di.marca_id,
                      'marca', m.nombre,
                      'descripcion', di.descripcion,
                      'cantidad', di.cantidad,
                      'precio_unitario', di.precio_unitario,
                      'compra_item_id', di.compra_item_id
                    ) order by o.numero, i.posicion)
               from retail.despacho_items di
               join retail.orden_compra_items i on i.id = di.orden_compra_item_id
               join retail.ordenes_compra o on o.id = i.orden_compra_id
               join retail.proveedores pr on pr.id = o.proveedor_id
               join retail.categorias c on c.id = di.categoria_id
               join retail.marcas m on m.id = di.marca_id
              where di.despacho_id = d.id
           ), '[]'::jsonb)
         )
    into v_resultado
    from retail.despachos d
    join retail.ubicaciones u on u.id = d.ubicacion_destino_id
    left join public.personas pd on pd.id = d.despachado_por
    left join public.personas pab on pab.id = d.abierto_por
    left join public.personas pce on pce.id = d.cerrado_por
    left join public.personas pan on pan.id = d.anulado_por
   where d.id = p_despacho_id;

  return v_resultado;
end;
$$;
comment on function retail.fn_envio_detalle(uuid) is
  'ADR-0362 (fase 3): un envío con su cabecera y sus líneas (orden OC-…, proveedor, categoría · marca · descripción, cantidad y '
  'precio congelado). NULL si no existe. Módulo Órdenes de compra o Recibir mercadería.';
revoke all on function retail.fn_envio_detalle(uuid) from public, anon;
grant execute on function retail.fn_envio_detalle(uuid) to authenticated, service_role;

-- ---------- 10. Las órdenes con algo por enviar (la píldora «Por enviar» de la lista) ----------
-- Solo las órdenes generadas a las que les queda algo: la que no aparece no tiene nada por enviar.
create or replace function retail.fn_ordenes_compra_por_enviar()
returns table (orden_compra_id uuid, unidades_por_enviar integer)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
begin
  if retail.fn_ve_modulo('ordenes_compra') is not true then
    raise exception 'Ver las órdenes de compra necesita el módulo «Órdenes de compra» en tu rol'
      using errcode = '42501', hint = 'ordenes_compra_sin_modulo';
  end if;

  return query
  select q.orden_id, q.por_enviar
    from (
      select i.orden_compra_id as orden_id,
             sum(greatest(greatest(i.cantidad, coalesce(f.facturado, 0)) - coalesce(e.enviado, 0), 0))::integer as por_enviar
        from retail.orden_compra_items i
        join retail.ordenes_compra o on o.id = i.orden_compra_id and o.estado = 'generada'
        left join (
          select ci.orden_compra_item_id as item_id, sum(ci.cantidad) as facturado
            from retail.compra_items ci
            join retail.compras c on c.id = ci.compra_id and c.estado = 'vigente'
           where ci.orden_compra_item_id is not null
           group by ci.orden_compra_item_id
        ) f on f.item_id = i.id
        left join (
          select di.orden_compra_item_id as item_id, sum(di.cantidad) as enviado
            from retail.despacho_items di
            join retail.despachos d on d.id = di.despacho_id and d.estado in ('en_camino', 'abierto', 'cerrado')
           group by di.orden_compra_item_id
        ) e on e.item_id = i.id
       group by i.orden_compra_id
    ) q
   where q.por_enviar > 0;
end;
$$;
comment on function retail.fn_ordenes_compra_por_enviar() is
  'ADR-0362 (fase 3): por orden generada con algo por enviar, cuántas unidades le quedan (lo pedido o lo facturado, lo mayor, menos lo '
  'enviado vigente). Exige el módulo Órdenes de compra.';
revoke all on function retail.fn_ordenes_compra_por_enviar() from public, anon;
grant execute on function retail.fn_ordenes_compra_por_enviar() to authenticated, service_role;

-- ---------- 11. Ver una orden: cuánto salió y sus envíos ----------
select pg_temp.reemplazar(
  'retail.fn_orden_compra_detalle(uuid)',
  $v$               ) f
              where i.orden_compra_id = o.id$v$,
  $v$               ) f
               -- Cuánto de esta línea salió en envíos vigentes (en camino, abiertos o cerrados).
               cross join lateral (
                 select coalesce(sum(di.cantidad), 0)::integer as enviado
                   from retail.despacho_items di
                   join retail.despachos dd on dd.id = di.despacho_id
                  where di.orden_compra_item_id = i.id
                    and dd.estado in ('en_camino', 'abierto', 'cerrado')
               ) env
              where i.orden_compra_id = o.id$v$,
  1);
select pg_temp.reemplazar(
  'retail.fn_orden_compra_detalle(uuid)',
  $v$'pendiente', greatest(i.cantidad - f.facturado, 0)$v$,
  $v$'pendiente', greatest(i.cantidad - f.facturado, 0),
                      'enviado', env.enviado,
                      'por_enviar', greatest(greatest(i.cantidad, f.facturado) - env.enviado, 0)$v$,
  1);
select pg_temp.reemplazar(
  'retail.fn_orden_compra_detalle(uuid)',
  $v$             else 'completa'
           end$v$,
  $v$             else 'completa'
           end,
           -- Los envíos de la orden (vigentes y anulados, el más reciente primero) y cuántas unidades de ESTA orden van en cada uno.
           'envios', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'id', dd.id,
                      'numero', retail.fn_envio_numero_texto(dd.numero),
                      'sede', ud.nombre,
                      'numero_guia', dd.numero_guia,
                      'estado', dd.estado,
                      'despachado_en', dd.despachado_en,
                      'unidades', x.unidades,
                      'version', dd.version
                    ) order by dd.numero desc)
               from (select di.despacho_id, sum(di.cantidad)::integer as unidades
                       from retail.despacho_items di
                       join retail.orden_compra_items oi on oi.id = di.orden_compra_item_id
                      where oi.orden_compra_id = o.id
                      group by di.despacho_id) x
               join retail.despachos dd on dd.id = x.despacho_id
               join retail.ubicaciones ud on ud.id = dd.ubicacion_destino_id
           ), '[]'::jsonb)$v$,
  1);

-- ---------- 12. Editar una orden: no, si ya salió en un envío ----------
-- Vigente o anulado: `editar_orden_compra` reemplaza las líneas, y un envío (aun anulado) sigue colgando de ellas.
select pg_temp.reemplazar(
  'retail.editar_orden_compra(uuid,integer,uuid,uuid,date,text,jsonb)',
  $v$    raise exception 'Esta orden está anulada: ya no se puede editar' using hint = 'orden_compra_anulada';
  end if;$v$,
  $v$    raise exception 'Esta orden está anulada: ya no se puede editar' using hint = 'orden_compra_anulada';
  end if;

  -- Una orden que ya salió en un envío no se edita: la guía lleva sus líneas (y una anulada sigue colgando de ellas).
  if exists (select 1 from retail.despacho_items di
               join retail.orden_compra_items ei on ei.id = di.orden_compra_item_id
              where ei.orden_compra_id = p_id) then
    raise exception 'Esta orden ya salió en un envío (%): no se edita',
      (select string_agg(retail.fn_envio_numero_texto(dd.numero), ', ' order by dd.numero)
         from retail.despachos dd
        where dd.id in (select di.despacho_id from retail.despacho_items di
                          join retail.orden_compra_items ei on ei.id = di.orden_compra_item_id
                         where ei.orden_compra_id = p_id))
      using hint = 'orden_compra_con_envio';
  end if;$v$,
  1);

-- ---------- 13. Anular una orden: no, si tiene un envío vigente ----------
select pg_temp.reemplazar(
  'retail.anular_orden_compra(uuid,integer,text)',
  $v$Recarga para ver sus cambios antes de anularla.'
      using errcode = 'PT409', hint = 'version_cambiada';
  end if;$v$,
  $v$Recarga para ver sus cambios antes de anularla.'
      using errcode = 'PT409', hint = 'version_cambiada';
  end if;

  -- Un envío vigente (en camino, abierto o cerrado) se anula primero: lo que salió ya no es solo un pedido.
  if exists (select 1 from retail.despacho_items di
               join retail.orden_compra_items ei on ei.id = di.orden_compra_item_id
               join retail.despachos dd on dd.id = di.despacho_id
              where ei.orden_compra_id = p_id and dd.estado in ('en_camino', 'abierto', 'cerrado')) then
    raise exception 'Esta orden tiene un envío vigente (%): anula primero el envío y después la orden',
      (select string_agg(retail.fn_envio_numero_texto(dd.numero), ', ' order by dd.numero)
         from retail.despachos dd
        where dd.estado in ('en_camino', 'abierto', 'cerrado')
          and dd.id in (select di.despacho_id from retail.despacho_items di
                          join retail.orden_compra_items ei on ei.id = di.orden_compra_item_id
                         where ei.orden_compra_id = p_id))
      using hint = 'orden_compra_con_envio';
  end if;$v$,
  1);

-- ---------- 14. Comprobación: si algo no quedó, la migración no se da por aplicada ----------
do $$
declare
  v_tabla text;
  v_funcion text;
  v_def text;
begin
  foreach v_tabla in array array['despachos', 'despacho_items'] loop
    if not coalesce((select c.relrowsecurity from pg_class c where c.oid = ('retail.' || v_tabla)::regclass), false) then
      raise exception 'retail.% tiene que tener RLS encendido', v_tabla;
    end if;
    if exists (select 1 from pg_policies p where p.schemaname = 'retail' and p.tablename = v_tabla) then
      raise exception 'retail.% no lleva políticas: solo se lee y escribe por funciones', v_tabla;
    end if;
  end loop;
  if not exists (select 1 from pg_trigger t
                  where t.tgrelid = 'retail.despacho_items'::regclass and t.tgname = 'despacho_items_tope'
                    and t.tgdeferrable and t.tginitdeferred
                    and t.tgfoid = 'retail.fn_despacho_items_tope()'::regprocedure) then
    raise exception 'falta el disparador diferido despacho_items_tope (o tiene otra forma)';
  end if;
  if not (select p.prosecdef from pg_proc p where p.oid = 'retail.fn_despacho_items_tope()'::regprocedure) then
    raise exception 'fn_despacho_items_tope tiene que ser security definer: corre al confirmar, con el rol de la sesión';
  end if;
  foreach v_funcion in array array[
    'retail.crear_envio(uuid,jsonb,text,text,uuid)', 'retail.anular_envio(uuid,integer,text)',
    'retail.fn_envios_por_abrir(uuid)', 'retail.fn_envio_detalle(uuid)', 'retail.fn_ordenes_compra_por_enviar()'] loop
    if not (select p.prosecdef from pg_proc p where p.oid = v_funcion::regprocedure) then
      raise exception '% tiene que ser security definer', v_funcion;
    end if;
    if has_function_privilege('anon', v_funcion, 'execute') or not has_function_privilege('authenticated', v_funcion, 'execute') then
      raise exception '%: la ejecuta authenticated y no anon', v_funcion;
    end if;
  end loop;
  if has_function_privilege('authenticated', 'retail.fn_envio_resultado(uuid)', 'execute') then
    raise exception 'fn_envio_resultado es interna: authenticated no la ejecuta';
  end if;
  if not exists (select 1 from retail.acciones_sin_responsable a where a.clave = 'orden_compra_envio') then
    raise exception 'falta la clave orden_compra_envio en acciones_sin_responsable';
  end if;
  if position('orden_compra_con_envio' in pg_get_functiondef('retail.editar_orden_compra(uuid,integer,uuid,uuid,date,text,jsonb)'::regprocedure)) = 0 then
    raise exception 'editar_orden_compra no quedó con el candado del envío';
  end if;
  if position('orden_compra_con_envio' in pg_get_functiondef('retail.anular_orden_compra(uuid,integer,text)'::regprocedure)) = 0 then
    raise exception 'anular_orden_compra no quedó con el candado del envío vigente';
  end if;
  v_def := pg_get_functiondef('retail.fn_orden_compra_detalle(uuid)'::regprocedure);
  if position($t$'por_enviar', greatest$t$ in v_def) = 0 or position($t$'envios', coalesce$t$ in v_def) = 0
     or position($t$) env$t$ in v_def) = 0 then
    raise exception 'fn_orden_compra_detalle no quedó con lo enviado, lo por enviar y los envíos';
  end if;
end;
$$;

reset lock_timeout;
