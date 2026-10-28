-- ============================================================================
-- 20261002233000_actividad_existencias_conteos_traslados.sql — CAYLA V2 (ADR-0207, «Actualización 2026-10-02»)
--
-- EL PROBLEMA. El botón «Actividad» de la cabecera solo contaba lo de Ventas (Punto de venta, Historial, Caja, Cambios,
-- Apartados). Donde más se mueve la tienda hoy —cargar stock, bajar prendas al piso, ajustar, contar y trasladar— no
-- quedaba en ningún historial que una líder pudiera leer: había que ir a Movimientos y adivinar qué fila era de qué
-- operación y quién la hizo. En producción (2026-10-02): ~117 cargas de stock, 26 bajadas al piso, 31 ajustes, 29
-- conteos y 4 traslados, ninguno en Actividad.
--
-- LA DECISIÓN (Felipe, 2026-10-02): suman su actividad Existencias, Conteos y Traslados. Mismo patrón que el primer paso
-- (ADR-0207): disparadores sobre las tablas que ya guardan, sin tocar ninguna función que guarda; un error del
-- historial nunca detiene la operación; lo pasado se carga.
--
-- UNA LÍNEA POR OPERACIÓN, NO POR PRENDA. Bajar 14 prendas al piso escribe 14 filas en `movimientos`; el historial
-- dice «bajó al piso 14 prendas de 6 modelos», una vez. Las operaciones con cabecera (`conteos`, `transferencias`)
-- cuelgan de ella. Las que no la tienen (ajustar, subir al almacén, cargar stock) se agrupan por TRANSACCIÓN: todos los
-- movimientos de una misma llamada comparten exactamente el mismo `created_at` (`now()` es la hora de inicio de la
-- transacción). Al confirmar, cada movimiento del grupo mira si es el «primero» (el menor id del grupo) y solo ese
-- anota: sin tabla de pendientes ni bloqueo, y la carga de lo pasado usa la misma regla.
--
-- QUÉ ES DE CADA MÓDULO (el de la pantalla que lo guarda, ADR-0207 D6):
--   · Existencias: cargar stock inicial desde «Ajustar stock», bajar al piso / reponer, subir al almacén / retirar,
--     ajustar (reposición, merma, conteo físico, otro, prenda hallada después de un conteo). Un ajuste hecho desde la
--     ficha de un producto es el mismo `ajustar_inventario`: la base no los distingue y se anota en Existencias.
--   · Conteos: abrir, cerrar (con cuántas prendas tuvieron diferencia), reabrir y cancelar.
--   · Traslados: enviar, recibir (todo o con faltantes), cerrar con diferencia y anular. Lo ven las dos sedes.
--   · NO se anota aquí el stock que se carga AL CREAR un producto (Nuevo producto): es de Productos y llega con su
--     etapa (se reconstruye de `movimientos` con la carga de lo pasado). Tampoco los movimientos de una venta, un
--     cambio, una compra o la producción: ya los cuenta su módulo o no son de estos tres.
--
-- FIRMA. Quien firmó (`usuario_id`, `abierto_por`, `creado_por`, `confirmado_por`…), que es el responsable del combo
-- (ADR-0162). En una terminal con firma omitida (recibir un traslado, cerrar un conteo) la persona queda vacía y la
-- línea dice el aparato. Reabrir un conteo no guarda quién: se toma el responsable de la sesión en el momento.
--
-- PRODUCCIÓN. Sin políticas (la tabla se lee solo por funciones `security definer`): UNA sola parte. Toma candados
-- breves de `movimientos`, `conteos` y `transferencias` al crear los disparadores: pegarla fuera del horario de tienda;
-- con `lock_timeout = 3s`, si una tienda está guardando falla sin trabar y se vuelve a pegar. Re-ejecutable.
-- Prueba: `pnpm pruebas:actividad-inventario`.
-- ============================================================================

set lock_timeout = '3s';

-- El módulo Actividad dice lo que ahora incluye (Roles y accesos lo muestra).
update retail.modulos
   set incluye = 'Ver quién hizo qué en cada módulo de su tienda: ventas, caja, cambios, apartados, existencias, conteos y traslados, con fecha, hora y persona'
 where clave = 'actividad';

-- ---------- 1. Piezas comunes ----------

-- La prenda como se nombra en la tienda: «Top con Escote y Amarre · Estándar · Vino». El NOMBRE es `referencia`; la
-- `descripcion` es el detalle («tirantes, sin mangas, espalda descubierta…»). Antes (20260926090000) se usaba la
-- descripción: una prenda sin ella salía como «S · Blanco» (23 de 91 productos en producción) y las demás con su detalle
-- largo en vez de su nombre (visto en producción al aplicar esto, 2026-10-02). Ahora: referencia, y la descripción solo
-- si falta. Huella de la definición anterior (producción y local, 2026-10-02):
-- md5(regexp_replace(pg_get_functiondef('retail.fn_actividad_prenda(uuid)'::regprocedure), '\s+', '', 'g')) = e81591eca9dcd94e27791d8d8cc45db9
create or replace function retail.fn_actividad_prenda(p_variante_id uuid) returns text
language sql stable security definer set search_path = retail, public, extensions as $$
  select concat_ws(' · ', coalesce(nullif(btrim(p.referencia), ''), nullif(btrim(p.descripcion), '')), t.valor, c.nombre)
    from retail.variantes v
    join retail.productos p on p.id = v.producto_id
    left join retail.tallas t on t.id = v.talla_id
    left join retail.colores c on c.codigo = v.color_codigo
   where v.id = p_variante_id;
$$;
revoke all on function retail.fn_actividad_prenda(uuid) from public, anon, authenticated;

-- «1 prenda», «5 prendas».
create or replace function retail.fn_actividad_cuantas(p_n bigint, p_singular text, p_plural text) returns text
language sql immutable as $$
  select coalesce(p_n, 0)::text || ' ' || case when coalesce(p_n, 0) = 1 then p_singular else p_plural end;
$$;

-- «a», «a y b», «a, b y c». Con un arreglo, no con comas: el nombre de una prenda puede llevar comas.
create or replace function retail.fn_actividad_enumerar(p text[]) returns text
language sql immutable as $$
  select case coalesce(cardinality(p), 0)
    when 0 then null
    when 1 then p[1]
    else array_to_string(p[1:cardinality(p) - 1], ', ') || ' y ' || p[cardinality(p)] end;
$$;

-- La terminal desde la que se está guardando ahora (o nada). Para un evento que firma otra persona que la que creó la
-- cabecera (recibir un traslado que envió otra sede): la terminal de la cabecera es la de quien la creó.
create or replace function retail.fn_actividad_terminal_ahora() returns uuid
language plpgsql stable security definer set search_path = retail, public, extensions as $fn$
begin
  return (select t.id from retail.fn_terminal_actual() t limit 1);
exception when others then
  return null;
end;
$fn$;

-- ---------- 2. Existencias: una línea por operación de stock ----------

-- Qué operación de Existencias es un movimiento, o nada si no es de Existencias.
create or replace function retail.fn_actividad_clase_inventario(p_tipo text, p_motivo text) returns text
language sql immutable as $$
  select case
    when p_tipo = 'entrada' and p_motivo = 'carga_inicial' then 'stock_cargado'
    when p_tipo = 'traslado' and p_motivo = 'movimiento_interno' then 'prendas_movidas'
    -- `conteo` es el cierre de un conteo: lo cuenta Conteos, con su propia línea.
    when p_tipo = 'ajuste' and p_motivo is distinct from 'conteo' then 'stock_ajustado'
  end;
$$;

create or replace function retail.fn_actividad_inventario(p_movimiento_id uuid, p_origen text default 'vivo') returns void
language plpgsql security definer set search_path = retail, public, extensions as $fn$
declare
  m retail.movimientos;
  v_clase text;
  v_variantes integer;
  v_modelos integer;
  v_prendas integer;
  v_mas integer;
  v_menos integer;
  v_lista text;
  v_items jsonb;
  v_al_piso integer;
  v_donde text;
  v_destino text;
  v_motivo text;
  v_texto text;
begin
  select * into m from retail.movimientos where id = p_movimiento_id;
  if m.id is null then return; end if;
  v_clase := retail.fn_actividad_clase_inventario(m.tipo, m.motivo);
  if v_clase is null then return; end if;

  -- El stock que se carga al CREAR un producto es de Productos (llega con su etapa), y la bajada al piso de esa misma
  -- carga, también. `productos.created_at` es `now()` de la misma transacción.
  if v_clase in ('stock_cargado', 'prendas_movidas')
     and exists (select 1 from retail.productos p where p.created_at = m.created_at) then
    return;
  end if;
  -- La bajada al piso de una carga hecha desde «Ajustar stock» va dentro de la línea de la carga («· 6 al piso»).
  if v_clase = 'prendas_movidas' and exists (
    select 1 from retail.movimientos g
     where g.created_at = m.created_at and g.ubicacion_id = m.ubicacion_id and g.tipo = 'entrada' and g.motivo = 'carga_inicial'
  ) then
    return;
  end if;

  -- El grupo: la misma operación (misma transacción, sede, quien firmó, clase, motivo y, al mover, el mismo trayecto).
  -- Solo anota el primero del grupo; los demás ya están contados en su línea.
  if exists (
    select 1 from retail.movimientos g
     where g.created_at = m.created_at and g.ubicacion_id = m.ubicacion_id
       and g.usuario_id is not distinct from m.usuario_id
       and g.tipo = m.tipo and g.motivo is not distinct from m.motivo
       and g.sububicacion_id is not distinct from m.sububicacion_id
       and g.sububicacion_destino_id is not distinct from m.sububicacion_destino_id
       and g.id::text < m.id::text
  ) then
    return;
  end if;

  -- Lo que pasó en el grupo, prenda por prenda (el nombre como se dice en la tienda).
  with grupo as (
    select g.variante_id, sum(g.cantidad)::integer as cantidad
      from retail.movimientos g
     where g.created_at = m.created_at and g.ubicacion_id = m.ubicacion_id
       and g.usuario_id is not distinct from m.usuario_id
       and g.tipo = m.tipo and g.motivo is not distinct from m.motivo
       and g.sububicacion_id is not distinct from m.sububicacion_id
       and g.sububicacion_destino_id is not distinct from m.sububicacion_destino_id
     group by g.variante_id
  ), nombrado as (
    select gr.variante_id, gr.cantidad, v.producto_id, coalesce(retail.fn_actividad_prenda(gr.variante_id), 'una prenda') as prenda
      from grupo gr left join retail.variantes v on v.id = gr.variante_id
  )
  select count(*)::integer, count(distinct producto_id)::integer, coalesce(sum(abs(cantidad)), 0)::integer,
         coalesce(sum(cantidad) filter (where cantidad > 0), 0)::integer, coalesce(-sum(cantidad) filter (where cantidad < 0), 0)::integer,
         -- Hasta tres prendas se nombran; con más, se cuentan.
         case when count(*) <= 3 then retail.fn_actividad_enumerar(array_agg(
           case when v_clase = 'stock_ajustado'
                then '«' || prenda || '» ' || case when cantidad > 0 then '+' || cantidad::text else '−' || abs(cantidad)::text end
                else case when abs(cantidad) > 1 then abs(cantidad)::text || ' × ' else '' end || '«' || prenda || '»' end
           order by prenda)) end,
         jsonb_agg(jsonb_build_object('prenda', prenda, 'cantidad', cantidad) order by prenda)
    into v_variantes, v_modelos, v_prendas, v_mas, v_menos, v_lista, v_items
    from nombrado;
  v_items := (select jsonb_agg(e) from (select e from jsonb_array_elements(v_items) e limit 20) x);

  if v_clase = 'stock_cargado' then
    select coalesce(sum(g.cantidad), 0)::integer into v_al_piso
      from retail.movimientos g
     where g.created_at = m.created_at and g.ubicacion_id = m.ubicacion_id and g.tipo = 'traslado' and g.motivo = 'movimiento_interno';
    v_texto := 'cargó stock inicial: '
      || coalesce(v_lista, retail.fn_actividad_cuantas(v_prendas, 'prenda', 'prendas') || ' de ' || retail.fn_actividad_cuantas(v_modelos, 'modelo', 'modelos'))
      || case when v_lista is not null then ' (' || retail.fn_actividad_cuantas(v_prendas, 'prenda', 'prendas') || ')' else '' end
      || case when v_al_piso > 0 then ' · ' || v_al_piso || ' al piso' else '' end;

  elsif v_clase = 'prendas_movidas' then
    select s.tipo into v_destino from retail.sububicaciones s where s.id = m.sububicacion_destino_id;
    v_texto := case v_destino when 'piso_venta' then 'bajó al piso ' when 'almacen_tienda' then 'subió al almacén '
                              when 'cuarentena' then 'pasó a cuarentena ' else 'movió ' end
      || coalesce(v_lista, retail.fn_actividad_cuantas(v_prendas, 'prenda', 'prendas') || ' de ' || retail.fn_actividad_cuantas(v_modelos, 'modelo', 'modelos'))
      || coalesce(' · ' || nullif(btrim(m.nota), ''), '');

  else
    select s.tipo into v_donde from retail.sububicaciones s where s.id = m.sububicacion_id;
    v_motivo := case m.motivo when 'reposicion' then 'reposición' when 'merma' then 'merma' when 'conteo_fisico' then 'conteo físico'
                              when 'otro' then 'otro' when 'hallazgo_conteo' then 'prenda hallada después de un conteo'
                              else replace(coalesce(m.motivo, 'sin motivo'), '_', ' ') end;
    v_texto := 'ajustó '
      || coalesce(v_lista,
           'el stock de ' || retail.fn_actividad_cuantas(v_variantes, 'prenda distinta', 'prendas distintas') || ': '
             || concat_ws(' y ', case when v_mas > 0 then '+' || v_mas end, case when v_menos > 0 then '−' || v_menos end))
      || case v_donde when 'piso_venta' then ' en el piso' when 'almacen_tienda' then ' en el almacén' else '' end
      || ' · motivo: ' || v_motivo
      || coalesce(' · ' || nullif(btrim(m.nota), ''), '');
  end if;

  perform retail.fn_actividad_anotar(
    'existencias', v_clase, v_texto,
    m.usuario_id, m.terminal_id, m.ubicacion_id, null, 'movimientos', m.id::text, m.created_at,
    jsonb_build_object('prendas', v_prendas, 'variantes', v_variantes, 'modelos', v_modelos, 'motivo', m.motivo,
                       'suben', nullif(v_mas, 0), 'bajan', nullif(v_menos, 0), 'al_piso', nullif(v_al_piso, 0),
                       'nota', nullif(btrim(m.nota), ''), 'items', v_items),
    p_origen);
end;
$fn$;

-- ---------- 3. Conteos ----------

-- Abrir: «abrió el conteo 12 del almacén de tienda · categoría Blusas · 120 prendas por contar».
create or replace function retail.fn_actividad_conteo_abierto(p_conteo_id uuid, p_origen text default 'vivo') returns void
language plpgsql security definer set search_path = retail, public, extensions as $fn$
declare
  c retail.conteos;
  v_lineas integer;
  v_donde text;
  v_categoria text;
begin
  select * into c from retail.conteos where id = p_conteo_id;
  if c.id is null then return; end if;
  select count(*)::integer into v_lineas from retail.conteo_items i where i.conteo_id = c.id;
  select lower(s.nombre) into v_donde from retail.sububicaciones s where s.id = c.sububicacion_id;
  select k.nombre into v_categoria from retail.categorias k where k.id = c.alcance_categoria_id;
  perform retail.fn_actividad_anotar(
    'conteos', 'conteo_abierto',
    'abrió el conteo' || coalesce(' ' || c.numero, '') || coalesce(' del ' || v_donde, '')
      || case when c.alcance = 'categoria' then coalesce(' · categoría ' || v_categoria, ' · una categoría') else ' · todo' end
      || case when v_lineas > 0 then ' · ' || retail.fn_actividad_cuantas(v_lineas, 'prenda distinta', 'prendas distintas') || ' por contar' else '' end,
    c.abierto_por, c.terminal_id, c.ubicacion_id, null, 'conteos', c.id::text, c.created_at,
    jsonb_build_object('numero', c.numero, 'alcance', c.alcance, 'categoria', v_categoria, 'lineas', v_lineas,
                       'es_prueba', nullif(c.es_prueba, false)),
    p_origen);
end;
$fn$;

-- Cerrar: cuántas prendas se contaron, cuántas tuvieron diferencia y en qué sentido; si quedó algo sin contar.
create or replace function retail.fn_actividad_conteo_cerrado(p_conteo_id uuid, p_origen text default 'vivo') returns void
language plpgsql security definer set search_path = retail, public, extensions as $fn$
declare
  c retail.conteos;
  v_cerradas integer;
  v_con_diferencia integer;
  v_sobran integer;
  v_faltan integer;
  v_pendientes integer;
begin
  select * into c from retail.conteos where id = p_conteo_id;
  if c.id is null or c.estado <> 'cerrado' then return; end if;
  select count(*) filter (where i.diferencia is not null)::integer,
         count(*) filter (where coalesce(i.diferencia, 0) <> 0)::integer,
         coalesce(sum(i.diferencia) filter (where i.diferencia > 0), 0)::integer,
         coalesce(-sum(i.diferencia) filter (where i.diferencia < 0), 0)::integer,
         count(*) filter (where i.diferencia is null)::integer
    into v_cerradas, v_con_diferencia, v_sobran, v_faltan, v_pendientes
    from retail.conteo_items i where i.conteo_id = c.id;
  perform retail.fn_actividad_anotar(
    'conteos', 'conteo_cerrado',
    'cerró el conteo' || coalesce(' ' || c.numero, '') || ': '
      || retail.fn_actividad_cuantas(v_cerradas, 'prenda distinta revisada', 'prendas distintas revisadas')
      || case when v_con_diferencia = 0 then ', todo cuadró'
              else ', ' || v_con_diferencia || ' con diferencia ('
                   || concat_ws(' y ', case when v_sobran = 1 then 'sobró 1' when v_sobran > 1 then 'sobraron ' || v_sobran end,
                                   case when v_faltan = 1 then 'faltó 1' when v_faltan > 1 then 'faltaron ' || v_faltan end)
                   || ')' end
      || case when v_pendientes > 0 then ' · quedaron ' || v_pendientes || ' sin contar' else '' end,
    c.cerrado_por, case when p_origen = 'vivo' then retail.fn_actividad_terminal_ahora() end, c.ubicacion_id, null,
    'conteos', c.id::text, c.cerrado_en,
    jsonb_build_object('numero', c.numero, 'revisadas', v_cerradas, 'con_diferencia', v_con_diferencia,
                       'sobran', nullif(v_sobran, 0), 'faltan', nullif(v_faltan, 0), 'pendientes', nullif(v_pendientes, 0),
                       'es_prueba', nullif(c.es_prueba, false)),
    p_origen);
end;
$fn$;

-- Cancelar (anular).
create or replace function retail.fn_actividad_conteo_cancelado(p_conteo_id uuid, p_origen text default 'vivo') returns void
language plpgsql security definer set search_path = retail, public, extensions as $fn$
declare
  c retail.conteos;
begin
  select * into c from retail.conteos where id = p_conteo_id;
  if c.id is null or c.estado <> 'anulado' then return; end if;
  perform retail.fn_actividad_anotar(
    'conteos', 'conteo_cancelado',
    'canceló el conteo' || coalesce(' ' || c.numero, '') || ' sin cambiar el stock',
    c.cerrado_por, case when p_origen = 'vivo' then retail.fn_actividad_terminal_ahora() end, c.ubicacion_id, null,
    'conteos', c.id::text, coalesce(c.cerrado_en, c.created_at),
    jsonb_build_object('numero', c.numero, 'es_prueba', nullif(c.es_prueba, false)),
    p_origen);
end;
$fn$;

-- Reabrir (solo en vivo: `reabrir_conteo` borra la firma del cierre y no guarda quién reabrió).
create or replace function retail.fn_actividad_conteo_reabierto(p_conteo_id uuid) returns void
language plpgsql security definer set search_path = retail, public, extensions as $fn$
declare
  c retail.conteos;
  v_actor uuid;
begin
  select * into c from retail.conteos where id = p_conteo_id;
  if c.id is null then return; end if;
  begin
    v_actor := retail.fn_actor_persona_id(true);
  exception when others then
    v_actor := null;
  end;
  perform retail.fn_actividad_anotar(
    'conteos', 'conteo_reabierto',
    'reabrió el conteo' || coalesce(' ' || c.numero, '') || ' para corregirlo',
    v_actor, retail.fn_actividad_terminal_ahora(), c.ubicacion_id, null, 'conteos', c.id::text, now(),
    jsonb_build_object('numero', c.numero, 'es_prueba', nullif(c.es_prueba, false)),
    'vivo');
end;
$fn$;

-- ---------- 4. Traslados (los ven las dos sedes: ubicación = origen, destino = destino) ----------

create or replace function retail.fn_actividad_traslado_enviado(p_id uuid, p_origen text default 'vivo') returns void
language plpgsql security definer set search_path = retail, public, extensions as $fn$
declare
  t retail.transferencias;
  v_prendas integer;
  v_modelos integer;
  v_destino text;
begin
  select * into t from retail.transferencias where id = p_id;
  if t.id is null then return; end if;
  select coalesce(sum(i.cantidad), 0)::integer, count(distinct v.producto_id)::integer into v_prendas, v_modelos
    from retail.transferencia_items i left join retail.variantes v on v.id = i.variante_id where i.transferencia_id = t.id;
  select u.nombre into v_destino from retail.ubicaciones u where u.id = t.ubicacion_destino_id;
  perform retail.fn_actividad_anotar(
    'traslados', 'traslado_enviado',
    'envió ' || retail.fn_actividad_cuantas(v_prendas, 'prenda', 'prendas')
      || case when v_modelos > 1 then ' de ' || v_modelos || ' modelos' else '' end
      || coalesce(' a ' || v_destino, '') || coalesce(' · traslado ' || t.numero, '')
      || coalesce(' · ' || nullif(btrim(t.nota), ''), ''),
    t.creado_por, t.terminal_id, t.ubicacion_origen_id, t.ubicacion_destino_id, 'transferencias', t.id::text, t.created_at,
    jsonb_build_object('numero', t.numero, 'prendas', v_prendas, 'modelos', v_modelos, 'nota', nullif(btrim(t.nota), '')),
    p_origen);
end;
$fn$;

-- Cuánto se mandó y cuánto se contó al llegar.
create or replace function retail.fn_actividad_traslado_cuentas(p_id uuid, out o_enviadas integer, out o_llegaron integer)
language sql stable security definer set search_path = retail, public, extensions as $$
  select (select coalesce(sum(i.cantidad), 0)::integer from retail.transferencia_items i where i.transferencia_id = p_id),
         (select coalesce(sum(r.cantidad_recibida), 0)::integer from retail.transferencia_recepciones r where r.transferencia_id = p_id);
$$;

-- Recibir: «recibió el traslado 4 de Tienda Trujillo: llegaron las 12 prendas» o «llegaron 10 de 12, faltan 2».
create or replace function retail.fn_actividad_traslado_recibido(p_id uuid, p_origen text default 'vivo') returns void
language plpgsql security definer set search_path = retail, public, extensions as $fn$
declare
  t retail.transferencias;
  c record;
  v_origen text;
begin
  select * into t from retail.transferencias where id = p_id;
  if t.id is null or t.confirmado_en is null or t.estado not in ('cerrada', 'recibido_con_diferencia') then return; end if;
  select * into c from retail.fn_actividad_traslado_cuentas(t.id);
  select u.nombre into v_origen from retail.ubicaciones u where u.id = t.ubicacion_origen_id;
  perform retail.fn_actividad_anotar(
    'traslados', 'traslado_recibido',
    'recibió el traslado' || coalesce(' ' || t.numero, '') || coalesce(' de ' || v_origen, '') || ': '
      || case when c.o_llegaron >= c.o_enviadas then 'llegaron ' || case when c.o_enviadas = 1 then 'la prenda' else 'las ' || c.o_enviadas || ' prendas' end
              else 'llegaron ' || c.o_llegaron || ' de ' || c.o_enviadas || ', faltan ' || (c.o_enviadas - c.o_llegaron) end,
    t.confirmado_por, case when p_origen = 'vivo' then retail.fn_actividad_terminal_ahora() end,
    t.ubicacion_origen_id, t.ubicacion_destino_id, 'transferencias', t.id::text, t.confirmado_en,
    jsonb_build_object('numero', t.numero, 'enviadas', c.o_enviadas, 'llegaron', c.o_llegaron,
                       'faltan', nullif(greatest(c.o_enviadas - c.o_llegaron, 0), 0)),
    p_origen);
end;
$fn$;

-- Cerrar con diferencia (después de recibir con faltantes).
create or replace function retail.fn_actividad_traslado_cerrado(p_id uuid, p_origen text default 'vivo') returns void
language plpgsql security definer set search_path = retail, public, extensions as $fn$
declare
  t retail.transferencias;
  c record;
begin
  select * into t from retail.transferencias where id = p_id;
  if t.id is null or t.estado <> 'cerrada' or t.cerrado_en is null then return; end if;
  -- En la carga de lo pasado: si se recibió todo, cierre y recepción fueron la misma operación (misma hora) y ya lo dice
  -- «recibió». En vivo no hace falta mirarlo: el disparador solo llama aquí al pasar de «recibido con diferencia» a «cerrada».
  if p_origen = 'carga_inicial' and t.cerrado_en = t.confirmado_en then return; end if;
  select * into c from retail.fn_actividad_traslado_cuentas(t.id);
  perform retail.fn_actividad_anotar(
    'traslados', 'traslado_cerrado',
    'cerró el traslado' || coalesce(' ' || t.numero, '') || ' con diferencia: llegaron ' || c.o_llegaron || ' de ' || c.o_enviadas
      || coalesce(' · ' || nullif(btrim(t.nota_cierre), ''), ''),
    t.cerrado_por, case when p_origen = 'vivo' then retail.fn_actividad_terminal_ahora() end,
    t.ubicacion_origen_id, t.ubicacion_destino_id, 'transferencias', t.id::text, t.cerrado_en,
    jsonb_build_object('numero', t.numero, 'enviadas', c.o_enviadas, 'llegaron', c.o_llegaron, 'nota', nullif(btrim(t.nota_cierre), '')),
    p_origen);
end;
$fn$;

create or replace function retail.fn_actividad_traslado_anulado(p_id uuid, p_origen text default 'vivo') returns void
language plpgsql security definer set search_path = retail, public, extensions as $fn$
declare
  t retail.transferencias;
  c record;
  v_destino text;
begin
  select * into t from retail.transferencias where id = p_id;
  if t.id is null or t.estado <> 'anulada' then return; end if;
  select * into c from retail.fn_actividad_traslado_cuentas(t.id);
  select u.nombre into v_destino from retail.ubicaciones u where u.id = t.ubicacion_destino_id;
  perform retail.fn_actividad_anotar(
    'traslados', 'traslado_anulado',
    'anuló el traslado' || coalesce(' ' || t.numero, '') || coalesce(' a ' || v_destino, '')
      || ' (' || retail.fn_actividad_cuantas(c.o_enviadas, 'prenda', 'prendas') || ' vuelven al origen)'
      || coalesce(' · motivo: ' || nullif(btrim(t.motivo_anulacion), ''), ''),
    t.anulado_por, case when p_origen = 'vivo' then retail.fn_actividad_terminal_ahora() end,
    t.ubicacion_origen_id, t.ubicacion_destino_id, 'transferencias', t.id::text, t.anulado_en,
    jsonb_build_object('numero', t.numero, 'prendas', c.o_enviadas, 'motivo', t.motivo_anulacion),
    p_origen);
end;
$fn$;

-- ---------- 5. Los disparadores (cada uno envuelto: un error del historial nunca detiene la operación) ----------

create or replace function retail.trg_actividad_movimientos() returns trigger
language plpgsql security definer set search_path = retail, public, extensions as $fn$
begin
  begin
    perform retail.fn_actividad_inventario(new.id);
  exception when others then
    raise warning 'actividad: no se anotó el movimiento % (%)', new.id, sqlerrm;
  end;
  return null;
end;
$fn$;

create or replace function retail.trg_actividad_conteos() returns trigger
language plpgsql security definer set search_path = retail, public, extensions as $fn$
begin
  begin
    if tg_op = 'INSERT' then
      perform retail.fn_actividad_conteo_abierto(new.id);
    elsif old.estado is distinct from new.estado then
      if new.estado = 'cerrado' then
        perform retail.fn_actividad_conteo_cerrado(new.id);
      elsif new.estado = 'anulado' then
        perform retail.fn_actividad_conteo_cancelado(new.id);
      elsif new.estado = 'abierto' and old.estado = 'cerrado' then
        perform retail.fn_actividad_conteo_reabierto(new.id);
      end if;
    end if;
  exception when others then
    raise warning 'actividad: no se anotó el conteo % (%)', new.id, sqlerrm;
  end;
  return null;
end;
$fn$;

create or replace function retail.trg_actividad_transferencias() returns trigger
language plpgsql security definer set search_path = retail, public, extensions as $fn$
begin
  begin
    if tg_op = 'INSERT' then
      perform retail.fn_actividad_traslado_enviado(new.id);
    elsif old.estado is distinct from new.estado then
      if new.estado = 'anulada' then
        perform retail.fn_actividad_traslado_anulado(new.id);
      elsif old.estado = 'en_transito' and new.estado in ('cerrada', 'recibido_con_diferencia') then
        perform retail.fn_actividad_traslado_recibido(new.id);
      elsif old.estado = 'recibido_con_diferencia' and new.estado = 'cerrada' then
        perform retail.fn_actividad_traslado_cerrado(new.id);
      end if;
    end if;
  exception when others then
    raise warning 'actividad: no se anotó el traslado % (%)', new.id, sqlerrm;
  end;
  return null;
end;
$fn$;

-- Lo que nace con sus líneas (un movimiento junto a los de su operación, un conteo con su foto, un traslado con sus
-- prendas) se anota al CONFIRMAR: disparador de restricción diferido. El `when` deja fuera, sin llamar a nada, los
-- movimientos que no son de Existencias (ventas, cambios, compras…). Se crean solo si faltan: nunca `drop trigger`
-- (en Supabase toma las tablas de auth/storage: CLAUDE.md).
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_actividad_movimientos' and tgrelid = 'retail.movimientos'::regclass) then
    create constraint trigger trg_actividad_movimientos
      after insert on retail.movimientos
      deferrable initially deferred
      for each row
      when (retail.fn_actividad_clase_inventario(new.tipo, new.motivo) is not null)
      execute function retail.trg_actividad_movimientos();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_actividad_conteo_nuevo' and tgrelid = 'retail.conteos'::regclass) then
    create constraint trigger trg_actividad_conteo_nuevo
      after insert on retail.conteos
      deferrable initially deferred
      for each row execute function retail.trg_actividad_conteos();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_actividad_traslado_nuevo' and tgrelid = 'retail.transferencias'::regclass) then
    create constraint trigger trg_actividad_traslado_nuevo
      after insert on retail.transferencias
      deferrable initially deferred
      for each row execute function retail.trg_actividad_transferencias();
  end if;
end $$;

-- Los cambios de estado se guardan al final de su operación (la cabecera después de sus movimientos): basta un AFTER.
create or replace trigger trg_actividad_conteo_estado
  after update of estado on retail.conteos
  for each row execute function retail.trg_actividad_conteos();

create or replace trigger trg_actividad_traslado_estado
  after update of estado on retail.transferencias
  for each row execute function retail.trg_actividad_transferencias();

-- ---------- 6. Permisos: anotar es SOLO de los disparadores ----------
-- `fn_actividad_clase_inventario`, `fn_actividad_cuantas` y `fn_actividad_enumerar` quedan abiertas: son puras (no leen nada) y la primera la
-- evalúa el `when` del disparador con los permisos de quien inserta.
revoke all on function retail.fn_actividad_terminal_ahora() from public, anon, authenticated;
revoke all on function retail.fn_actividad_inventario(uuid, text) from public, anon, authenticated;
revoke all on function retail.fn_actividad_conteo_abierto(uuid, text) from public, anon, authenticated;
revoke all on function retail.fn_actividad_conteo_cerrado(uuid, text) from public, anon, authenticated;
revoke all on function retail.fn_actividad_conteo_cancelado(uuid, text) from public, anon, authenticated;
revoke all on function retail.fn_actividad_conteo_reabierto(uuid) from public, anon, authenticated;
revoke all on function retail.fn_actividad_traslado_enviado(uuid, text) from public, anon, authenticated;
revoke all on function retail.fn_actividad_traslado_cuentas(uuid) from public, anon, authenticated;
revoke all on function retail.fn_actividad_traslado_recibido(uuid, text) from public, anon, authenticated;
revoke all on function retail.fn_actividad_traslado_cerrado(uuid, text) from public, anon, authenticated;
revoke all on function retail.fn_actividad_traslado_anulado(uuid, text) from public, anon, authenticated;
revoke all on function retail.trg_actividad_movimientos() from public, anon, authenticated;
revoke all on function retail.trg_actividad_conteos() from public, anon, authenticated;
revoke all on function retail.trg_actividad_transferencias() from public, anon, authenticated;

-- ---------- 7. Lo que ya pasó (como el primer paso: se carga desde las firmas, re-ejecutable) ----------
do $$
declare
  r record;
begin
  -- Existencias: cada movimiento candidato; dentro, solo el primero de su operación anota.
  for r in select id from retail.movimientos
            where retail.fn_actividad_clase_inventario(tipo, motivo) is not null
            order by created_at, id loop
    perform retail.fn_actividad_inventario(r.id, 'carga_inicial');
  end loop;
  for r in select id from retail.conteos order by created_at loop
    perform retail.fn_actividad_conteo_abierto(r.id, 'carga_inicial');
    perform retail.fn_actividad_conteo_cerrado(r.id, 'carga_inicial');
    perform retail.fn_actividad_conteo_cancelado(r.id, 'carga_inicial');
  end loop;
  for r in select id from retail.transferencias order by created_at loop
    perform retail.fn_actividad_traslado_enviado(r.id, 'carga_inicial');
    perform retail.fn_actividad_traslado_recibido(r.id, 'carga_inicial');
    perform retail.fn_actividad_traslado_cerrado(r.id, 'carga_inicial');
    perform retail.fn_actividad_traslado_anulado(r.id, 'carga_inicial');
  end loop;
end $$;
