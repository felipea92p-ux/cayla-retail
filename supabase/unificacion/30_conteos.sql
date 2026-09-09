-- ============================================================================
-- 30 — Sesiones de conteo: el censo y el control permanente son lo mismo
-- Correr en cayla-DYNAMIC (SQL Editor). Todo en el cajón `retail`.
-- Gemelo de `supabase/migrations/0048_conteos.sql`. Ver ADR-0026.
--
-- ⚠ PEGAR DESPUÉS DE 26, 27, 28 y 29, en ese orden. Depende de:
--   · `27` — el ajuste con signo (antes de eso, un conteo hacia abajo era
--     imposible: es toda la razón de ser de este archivo);
--   · `28` — `retail.colores` (crear una prenda al vuelo exige un color válido);
--   · `29` — `fn_asignar_codigo_producto`, `fn_token_talla`, `codigos_barras` y
--     `registrar_codigo_barras`.
--
-- LA IDEA
--   Un conteo que puede CREAR PRENDAS AL VUELO es un censo. Un censo sobre un
--   catálogo ya cargado es un conteo. Por eso no hay código de "carga inicial"
--   que se use una vez y se abandone.
--
-- POR QUÉ SESIÓN Y NO APLICAR AL INSTANTE
--   Aplicar cada línea en el momento habría sido más simple y también correcto.
--   Se eligió la sesión porque Felipe pidió aprobar antes de que entre nada: las
--   Encargadas cuentan, y hasta que él no cierra el `stock` no se mueve.
--   **El cierre ES la aprobación**, y por eso `cerrar_conteo` es solo de Líder
--   mientras contar y crear prendas no lo son.
--
-- LA DECISIÓN MÁS FINA: `cantidad_sistema` SE CONGELA AL CONTAR
--   Sistema 10 → a las 15:00 cuenta 8 → a las 15:30 se vende 1 (sistema 9) → a
--   las 16:00 cierra. Con el delta del momento de contar (8−10 = −2): 9−2 = 7 ✔.
--   Leyendo el sistema al cerrar (8−9 = −1): 9−1 = 8 ✘, la venta desaparece.
--   Un conteo afirma un INSTANTE, no el presente. Verificado en local.
--
-- POR QUÉ `ajuste` CON SIGNO Y NO UN `tipo='conteo'`
--   `recalcular_stock` conoce entrada/salida/ajuste/traslado y nada más. Un tipo
--   nuevo quedaría excluido EN SILENCIO, y el día que alguien corriera la red de
--   seguridad, el censo entero se borraría. Además así no se toca el CHECK de
--   `movimientos.tipo` ni nada del núcleo.
--
-- CÓMO SE REVIERTE
--   drop function if exists retail.cerrar_conteo(uuid), retail.anular_conteo(uuid,text),
--     retail.previsualizar_cierre_conteo(uuid), retail.conteo_crear_variante,
--     retail.conteo_contar_por_codigo, retail.conteo_contar, retail.abrir_conteo;
--   drop table if exists retail.conteo_lineas, retail.conteos;
--   Los `movimientos` que un cierre haya emitido NO se revierten: son historia
--   (principio 4). Se corrigen con otro conteo.
-- ============================================================================

-- ---------- 1. la sesión ----------
create table if not exists retail.conteos (
  id uuid primary key default gen_random_uuid(),
  sede_id uuid not null references public.sedes (id),
  ubicacion text not null default 'piso' check (ubicacion in ('piso', 'almacen')),
  alcance text not null default 'todo' check (alcance in ('todo', 'familia', 'categoria', 'contenedor')),
  alcance_familia text check (alcance_familia in
    ('indumentaria', 'calzado', 'accesorios', 'bisuteria', 'belleza', 'papeleria')),
  alcance_categoria_id uuid references retail.categorias (id),
  alcance_contenedor_id uuid references retail.contenedores (id),
  -- Única pieza que puede destruir datos en masa. Por defecto NO hace nada.
  tratar_no_contado text not null default 'ignorar'
    check (tratar_no_contado in ('ignorar', 'poner_en_cero')),
  estado text not null default 'abierto' check (estado in ('abierto', 'cerrado', 'anulado')),
  nombre text,
  abierto_por uuid references public.personas (id),
  abierto_en timestamptz not null default now(),
  cerrado_por uuid references public.personas (id),
  cerrado_en timestamptz,
  lineas_ajustadas integer,
  unidades_diferencia integer,
  nota text,
  constraint conteos_alcance_coherente check (
    case alcance
      when 'todo'       then alcance_familia is null and alcance_categoria_id is null and alcance_contenedor_id is null
      when 'familia'    then alcance_familia is not null and alcance_categoria_id is null and alcance_contenedor_id is null
      when 'categoria'  then alcance_categoria_id is not null and alcance_familia is null and alcance_contenedor_id is null
      when 'contenedor' then alcance_contenedor_id is not null and alcance_familia is null and alcance_categoria_id is null
    end),
  constraint conteos_cierre_coherente check (
    (estado = 'abierto' and cerrado_en is null) or (estado <> 'abierto' and cerrado_en is not null))
);
create index if not exists conteos_sede_idx on retail.conteos (sede_id, estado);

-- LA restricción más importante: un solo conteo abierto por sede+ubicación. Dos
-- abiertos calcularían cada uno su varianza contra un sistema que el otro está
-- por cambiar (principio 2).
create unique index if not exists conteos_un_abierto_por_sede
  on retail.conteos (sede_id, ubicacion) where estado = 'abierto';

-- ---------- 2. las líneas ----------
create table if not exists retail.conteo_lineas (
  id uuid primary key default gen_random_uuid(),
  conteo_id uuid not null references retail.conteos (id),
  variante_id uuid not null references retail.variantes (id),
  cantidad_contada integer not null check (cantidad_contada >= 0),
  cantidad_sistema integer not null,     -- CONGELADO al momento de contar
  contenedor_id uuid references retail.contenedores (id),
  contado_por uuid references public.personas (id),
  contado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  diferencia integer,
  movimiento_id uuid references retail.movimientos (id),
  nota text,
  unique (conteo_id, variante_id)
);
create index if not exists conteo_lineas_conteo_idx on retail.conteo_lineas (conteo_id);

alter table retail.conteos enable row level security;
alter table retail.conteo_lineas enable row level security;
drop policy if exists conteos_select on retail.conteos;
create policy conteos_select on retail.conteos for select using (retail.puede_operar_sede(sede_id));
drop policy if exists conteo_lineas_select on retail.conteo_lineas;
create policy conteo_lineas_select on retail.conteo_lineas for select
  using (exists (select 1 from retail.conteos c where c.id = conteo_id and retail.puede_operar_sede(c.sede_id)));
-- Sin policies de escritura: solo vía las RPC, igual que `stock` y `movimientos`.

-- ---------- 3. una sola forma de componer el código de variante ----------
-- Se extrae de `fn_asignar_codigo_variante` (archivo 29) para que
-- `conteo_crear_variante` pueda calcular el código ANTES de insertar (necesita el
-- `sku`, que es not null) sin duplicar la regla. La de 29 se reemplaza abajo para
-- que las dos usen la misma.
create or replace function retail.fn_componer_codigo_variante(
  p_base text, p_color_id text, p_talla text
) returns text language sql immutable set search_path = retail, public as $$
  select p_base || case when p_color_id is null then '' else '-' || p_color_id end
                || '-' || retail.fn_token_talla(p_talla);
$$;

create or replace function retail.fn_asignar_codigo_variante(p_variante_id uuid)
returns text language plpgsql security definer set search_path = retail, public
as $$
declare v_codigo text; v_base text; v_producto_id uuid; v_color_id text; v_color text; v_talla text; v_sku text;
begin
  select v.codigo, p.codigo, v.producto_id, v.color_id, v.color, v.talla, v.sku
    into v_codigo, v_base, v_producto_id, v_color_id, v_color, v_talla, v_sku
    from variantes v join productos p on p.id = v.producto_id
    where v.id = p_variante_id;
  if not found then raise exception 'La variante % no existe', p_variante_id; end if;
  if v_codigo is not null then return v_codigo; end if;
  if v_color_id is null and retail.fn_clave_texto(v_color) is not null then
    return null;
  end if;

  if v_base is null then v_base := retail.fn_asignar_codigo_producto(v_producto_id); end if;
  v_codigo := retail.fn_componer_codigo_variante(v_base, v_color_id, v_talla);
  update variantes set codigo = v_codigo where id = p_variante_id;

  insert into codigos_barras (codigo, variante_id, origen, nota)
    values (v_codigo, p_variante_id, 'cayla', 'código corto CAYLA')
    on conflict (codigo) do nothing;
  if v_sku is not null then
    insert into codigos_barras (codigo, variante_id, origen, nota)
      values (v_sku, p_variante_id, 'cayla', 'sku de la variante')
      on conflict (codigo) do nothing;
  end if;
  return v_codigo;
end $$;

-- ---------- 4. abrir ----------
create or replace function retail.abrir_conteo(
  p_sede_id uuid, p_alcance text default 'todo', p_alcance_familia text default null,
  p_alcance_categoria_id uuid default null, p_alcance_contenedor_id uuid default null,
  p_ubicacion text default 'piso', p_nombre text default null
) returns uuid language plpgsql security definer set search_path = retail, public
as $$
declare v_id uuid; v_persona_id uuid;
begin
  if not retail.puede_operar_sede(p_sede_id) then
    raise exception 'No tienes permiso para contar en esa sede';
  end if;
  if exists (select 1 from conteos where sede_id = p_sede_id and ubicacion = p_ubicacion and estado = 'abierto') then
    raise exception 'Ya hay un conteo abierto en esta sede — ciérralo antes de abrir otro';
  end if;
  select id into v_persona_id from public.personas where auth_user_id = auth.uid();
  insert into conteos (sede_id, ubicacion, alcance, alcance_familia, alcance_categoria_id,
                       alcance_contenedor_id, nombre, abierto_por)
    values (p_sede_id, p_ubicacion, p_alcance, p_alcance_familia, p_alcance_categoria_id,
            p_alcance_contenedor_id, nullif(trim(p_nombre), ''), v_persona_id)
    returning id into v_id;
  return v_id;
end $$;

-- ---------- 5. contar una prenda ----------
-- `p_modo` 'sumar' (default): cada disparo de la pistola es UNA prenda que
-- acabas de levantar de la pila. Con modo absoluto, el segundo escaneo de la
-- segunda blusa idéntica pisaría al primero y el conteo siempre daría 1.
-- 'fijar': para teclear un número corregido.
create or replace function retail.conteo_contar(
  p_conteo_id uuid, p_variante_id uuid, p_cantidad integer,
  p_modo text default 'sumar', p_contenedor_id uuid default null
) returns uuid language plpgsql security definer set search_path = retail, public
as $$
declare c conteos%rowtype; v_persona_id uuid; v_sistema integer; v_linea_id uuid;
begin
  select * into c from conteos where id = p_conteo_id for update;
  if not found then raise exception 'El conteo % no existe', p_conteo_id; end if;
  if c.estado <> 'abierto' then raise exception 'Ese conteo ya está %', c.estado; end if;
  if not retail.puede_operar_sede(c.sede_id) then
    raise exception 'No tienes permiso para contar en esa sede';
  end if;
  if p_modo not in ('sumar', 'fijar') then raise exception 'Modo inválido: %', p_modo; end if;
  if p_cantidad is null or p_cantidad < 0 then raise exception 'La cantidad contada no puede ser negativa'; end if;

  if c.ubicacion = 'almacen' then
    select coalesce(cantidad, 0) into v_sistema from stock_almacen
      where variante_id = p_variante_id and sede_id = c.sede_id;
  else
    select coalesce(cantidad, 0) into v_sistema from stock
      where variante_id = p_variante_id and sede_id = c.sede_id;
  end if;
  v_sistema := coalesce(v_sistema, 0);

  select id into v_persona_id from public.personas where auth_user_id = auth.uid();

  insert into conteo_lineas (conteo_id, variante_id, cantidad_contada, cantidad_sistema,
                             contenedor_id, contado_por)
    values (p_conteo_id, p_variante_id, p_cantidad, v_sistema, p_contenedor_id, v_persona_id)
    on conflict (conteo_id, variante_id) do update
      set cantidad_contada = case when p_modo = 'sumar'
                                  then conteo_lineas.cantidad_contada + p_cantidad
                                  else p_cantidad end,
          contenedor_id = coalesce(excluded.contenedor_id, conteo_lineas.contenedor_id),
          actualizado_en = now()
      -- `cantidad_sistema` NO se toca acá: se conserva el del primer escaneo,
      -- que es el instante que la línea afirma.
    returning id into v_linea_id;
  return v_linea_id;
end $$;

-- ---------- 6. contar escaneando (el camino de la pistola Zebra) ----------
-- Devuelve null si no conoce el código: la pantalla usa eso para ofrecer "crear
-- esta prenda", que es lo que convierte el conteo en censo.
create or replace function retail.conteo_contar_por_codigo(
  p_conteo_id uuid, p_codigo text, p_cantidad integer default 1, p_modo text default 'sumar'
) returns uuid language plpgsql security definer set search_path = retail, public
as $$
declare v_variante_id uuid; v_codigo text;
begin
  v_codigo := nullif(trim(p_codigo), '');
  if v_codigo is null then raise exception 'No se escaneó ningún código'; end if;

  select variante_id into v_variante_id from codigos_barras where codigo = v_codigo;
  if v_variante_id is null then
    select id into v_variante_id from variantes where codigo = v_codigo;
  end if;
  if v_variante_id is null then
    select id into v_variante_id from variantes where sku = v_codigo;
  end if;
  if v_variante_id is null then return null; end if;

  return retail.conteo_contar(p_conteo_id, v_variante_id, p_cantidad, p_modo);
end $$;

-- ---------- 7. crear una prenda al vuelo (esto hace del conteo un censo) ----------
-- Gate: `puede_operar_sede`, NO `es_lider`. Es el cambio de permiso deliberado
-- que hace posible el censo: `crear_producto_con_variantes` (archivo 18) rechaza
-- a quien no es Líder, y si cada ficha la tiene que crear Felipe, no hay censo.
-- El control lo da el cierre, que sí es solo de Líder.
-- NO toca stock: el stock aparece al cerrar, como un ajuste, con auditoría.
create or replace function retail.conteo_crear_variante(
  p_conteo_id uuid,
  p_referencia text,
  p_talla text,
  p_color_codigo text,
  p_cantidad integer,
  p_categoria_id uuid default null,
  p_producto_id uuid default null,
  p_precio numeric default 0,
  p_costo numeric default 0,
  p_codigo_barras text default null,
  p_sku text default null,
  p_contenedor_id uuid default null
) returns uuid language plpgsql security definer set search_path = retail, public
as $$
declare
  c conteos%rowtype; v_producto_id uuid; v_variante_id uuid;
  v_base text; v_codigo text; v_sku text; v_color_nombre text;
begin
  select * into c from conteos where id = p_conteo_id;
  if not found then raise exception 'El conteo % no existe', p_conteo_id; end if;
  if c.estado <> 'abierto' then raise exception 'Ese conteo ya está %', c.estado; end if;
  if not retail.puede_operar_sede(c.sede_id) then
    raise exception 'No tienes permiso para contar en esa sede';
  end if;

  if p_color_codigo is not null then
    select nombre into v_color_nombre from colores where codigo = p_color_codigo;
    if v_color_nombre is null then
      raise exception 'El color % no existe. La Líder puede agregarlo en Catálogo → Colores', p_color_codigo;
    end if;
  end if;

  v_producto_id := p_producto_id;
  if v_producto_id is null then
    if coalesce(trim(p_referencia), '') = '' then
      raise exception 'Falta el nombre de la prenda';
    end if;
    -- `sku_padre` sigue siendo not null unique; nace provisional y se reemplaza
    -- por el código, que es el nombre real de cara a la gente.
    insert into productos (sku_padre, referencia, categoria_id, estado)
      values ('TMP-' || replace(gen_random_uuid()::text, '-', ''), trim(p_referencia), p_categoria_id, 'activa')
      returning id into v_producto_id;
    v_base := retail.fn_asignar_codigo_producto(v_producto_id);
    update productos set sku_padre = v_base where id = v_producto_id;
  else
    v_base := retail.fn_asignar_codigo_producto(v_producto_id);
  end if;

  -- `variantes_identidad_unica` (archivo 29) garantiza que haya como mucho una,
  -- así que dos personas creando la misma prenda a la vez terminan contando
  -- sobre la misma fila en vez de duplicarla.
  select id into v_variante_id from variantes
    where producto_id = v_producto_id
      and coalesce(talla, '') = coalesce(nullif(trim(p_talla), ''), '')
      and coalesce(color, '') = coalesce(v_color_nombre, '');

  if v_variante_id is null then
    v_codigo := retail.fn_componer_codigo_variante(v_base, p_color_codigo, p_talla);
    -- El sku por defecto es el código de fábrica escaneado si lo hay, y si no el
    -- código corto: la prenda nace ya escaneable por lo que trae puesto.
    v_sku := coalesce(nullif(trim(p_sku), ''), nullif(trim(p_codigo_barras), ''), v_codigo);
    insert into variantes (producto_id, sku, codigo, talla, color, color_id, costo, precio)
      values (v_producto_id, v_sku, v_codigo, nullif(trim(p_talla), ''), v_color_nombre,
              p_color_codigo, coalesce(p_costo, 0), coalesce(p_precio, 0))
      returning id into v_variante_id;

    insert into codigos_barras (codigo, variante_id, origen, nota)
      values (v_codigo, v_variante_id, 'cayla', 'código corto CAYLA')
      on conflict (codigo) do nothing;
  end if;

  if nullif(trim(p_codigo_barras), '') is not null then
    perform retail.registrar_codigo_barras(v_variante_id, trim(p_codigo_barras), 'proveedor',
                                           'adoptado durante el conteo');
  end if;

  return retail.conteo_contar(p_conteo_id, v_variante_id, p_cantidad, 'sumar', p_contenedor_id);
end $$;

-- ---------- 8. previsualizar el cierre ----------
-- Es lo que hace que cerrar no dé miedo: se ve exactamente qué va a pasar.
create or replace function retail.previsualizar_cierre_conteo(p_conteo_id uuid)
returns table (
  variante_id uuid, codigo text, referencia text, talla text, color text,
  contada integer, sistema integer, diferencia integer, origen text
) language sql stable security definer set search_path = retail, public
as $$
  select l.variante_id, v.codigo, p.referencia, v.talla, v.color,
         l.cantidad_contada, l.cantidad_sistema,
         l.cantidad_contada - l.cantidad_sistema, 'contado'::text
  from conteo_lineas l
  join variantes v on v.id = l.variante_id
  join productos p on p.id = v.producto_id
  where l.conteo_id = p_conteo_id

  union all

  select s.variante_id, v.codigo, p.referencia, v.talla, v.color,
         0, s.cantidad, -s.cantidad, 'no_contado'::text
  from conteos c
  join stock s on s.sede_id = c.sede_id and s.cantidad > 0
  join variantes v on v.id = s.variante_id
  join productos p on p.id = v.producto_id
  left join categorias cat on cat.id = p.categoria_id
  where c.id = p_conteo_id
    and c.tratar_no_contado = 'poner_en_cero'
    and c.ubicacion = 'piso'
    and not exists (select 1 from conteo_lineas l2
                    where l2.conteo_id = c.id and l2.variante_id = s.variante_id)
    and (c.alcance = 'todo'
      or (c.alcance = 'familia' and cat.familia = c.alcance_familia)
      or (c.alcance = 'categoria' and p.categoria_id = c.alcance_categoria_id)
      or (c.alcance = 'contenedor' and s.contenedor_id = c.alcance_contenedor_id));
$$;

-- ---------- 9. cerrar = la aprobación de Felipe ----------
-- SOLO Líder, y el único momento en que el conteo toca el stock. Idempotente:
-- cerrar dos veces devuelve el resumen guardado sin duplicar movimientos. Dos
-- cierres concurrentes: el segundo se bloquea en el `for update`, ve 'cerrado' y
-- devuelve sin emitir nada.
create or replace function retail.cerrar_conteo(p_conteo_id uuid)
returns table (lineas_totales integer, lineas_ajustadas integer,
               unidades_sobrantes integer, unidades_faltantes integer)
language plpgsql security definer set search_path = retail, public
as $$
declare
  c conteos%rowtype; r record; v_dif integer; v_mov_id uuid; v_persona_id uuid;
  v_contenedor_id uuid; v_ajustadas integer := 0; v_sobran integer := 0; v_faltan integer := 0;
begin
  select * into c from conteos where id = p_conteo_id for update;
  if not found then raise exception 'El conteo % no existe', p_conteo_id; end if;

  if c.estado <> 'abierto' then
    return query
      select (select count(*)::integer from conteo_lineas where conteo_id = p_conteo_id),
             coalesce(c.lineas_ajustadas, 0),
             coalesce((select sum(diferencia)::integer from conteo_lineas
                       where conteo_id = p_conteo_id and diferencia > 0), 0),
             coalesce((select -sum(diferencia)::integer from conteo_lineas
                       where conteo_id = p_conteo_id and diferencia < 0), 0);
    return;
  end if;

  if not retail.es_lider() then
    raise exception 'Solo un líder puede cerrar un conteo — es la aprobación de lo contado';
  end if;

  select id into v_persona_id from public.personas where auth_user_id = auth.uid();

  if c.ubicacion = 'almacen' then
    select id into v_contenedor_id from contenedores where sede_id = c.sede_id and tipo = 'almacen';
    if v_contenedor_id is null then
      raise exception 'Esta sede no tiene un almacén configurado';
    end if;
  end if;

  -- Las no contadas se materializan como líneas con 0 para que queden auditadas,
  -- en vez de ser movimientos huérfanos que nadie explica.
  if c.tratar_no_contado = 'poner_en_cero' then
    insert into conteo_lineas (conteo_id, variante_id, cantidad_contada, cantidad_sistema, contado_por, nota)
      select p_conteo_id, pv.variante_id, 0, pv.sistema, v_persona_id, 'no contada — puesta en cero al cerrar'
      from retail.previsualizar_cierre_conteo(p_conteo_id) pv
      where pv.origen = 'no_contado'
      on conflict (conteo_id, variante_id) do nothing;
  end if;

  for r in select * from conteo_lineas where conteo_id = p_conteo_id and diferencia is null loop
    v_dif := r.cantidad_contada - r.cantidad_sistema;   -- el sistema CONGELADO al contar
    v_mov_id := null;
    if v_dif <> 0 then
      insert into movimientos (variante_id, sede_id, tipo, cantidad, motivo, usuario_id, contenedor_id, nota)
        values (r.variante_id, c.sede_id, 'ajuste', v_dif, 'conteo', v_persona_id, v_contenedor_id,
                'Conteo ' || coalesce(c.nombre, p_conteo_id::text))
        returning id into v_mov_id;
      perform retail.fn_aplicar_movimiento(v_mov_id);
      v_ajustadas := v_ajustadas + 1;
      if v_dif > 0 then v_sobran := v_sobran + v_dif; else v_faltan := v_faltan - v_dif; end if;
    end if;
    update conteo_lineas set diferencia = v_dif, movimiento_id = v_mov_id where id = r.id;
  end loop;

  update conteos set estado = 'cerrado', cerrado_en = now(), cerrado_por = v_persona_id,
                     lineas_ajustadas = v_ajustadas, unidades_diferencia = v_sobran - v_faltan
    where id = p_conteo_id;

  return query select (select count(*)::integer from conteo_lineas where conteo_id = p_conteo_id),
                      v_ajustadas, v_sobran, v_faltan;
end $$;

-- ---------- 10. anular ----------
-- Nunca `DELETE`: las líneas quedan como registro de que se contó y se descartó.
create or replace function retail.anular_conteo(p_conteo_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path = retail, public
as $$
declare c conteos%rowtype; v_persona_id uuid;
begin
  select * into c from conteos where id = p_conteo_id for update;
  if not found then raise exception 'El conteo % no existe', p_conteo_id; end if;
  if c.estado <> 'abierto' then raise exception 'Ese conteo ya está %', c.estado; end if;
  if not retail.es_lider() then raise exception 'Solo un líder puede anular un conteo'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Anular un conteo necesita un motivo'; end if;
  select id into v_persona_id from public.personas where auth_user_id = auth.uid();
  update conteos set estado = 'anulado', cerrado_en = now(), cerrado_por = v_persona_id,
                     nota = concat_ws(' · ', nota, 'anulado: ' || trim(p_motivo))
    where id = p_conteo_id;
end $$;

-- ============================================================================
-- VERIFICACIÓN (correr a mano después de pegar)
-- ============================================================================
-- 1. Las 7 funciones existen y ninguna quedó duplicada (lección de ADR-0004):
--   select p.proname, count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'retail' and p.proname in
--     ('abrir_conteo','conteo_contar','conteo_contar_por_codigo','conteo_crear_variante',
--      'previsualizar_cierre_conteo','cerrar_conteo','anular_conteo')
--   group by 1 order by 1;
--   -- 7 filas, todas con count = 1.
--
-- 2. Prueba viva de punta a punta, en una tienda real y con la pistola:
--   select retail.abrir_conteo('<sede_id>', 'todo', null, null, null, 'piso', 'Prueba');
--   select retail.conteo_contar_por_codigo('<conteo_id>', '<escanear una prenda>');
--   select * from retail.previsualizar_cierre_conteo('<conteo_id>');   -- MIRAR antes de cerrar
--   select * from retail.cerrar_conteo('<conteo_id>');
--   -- y comprobar que `retail.stock` quedó en lo contado y que hay un movimiento
--   -- `tipo='ajuste' motivo='conteo'` que lo explica.
--
-- 3. Que una Encargada (no Líder) SÍ pueda contar y crear, y NO pueda cerrar:
--   -- desde su sesión: abrir_conteo y conteo_crear_variante deben funcionar;
--   -- cerrar_conteo debe decir "Solo un líder puede cerrar un conteo".
-- ============================================================================
