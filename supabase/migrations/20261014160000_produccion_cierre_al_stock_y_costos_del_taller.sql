-- ADR-0400, actividad 6 (2026-10-15; OK explícito de Felipe, porque toca stock y dinero): pasar la orden al stock con sus candados, y los costos del Taller.
--
-- EL PROBLEMA
--   1. `cerrar_produccion` acepta cuántas salieron buenas de cada talla sin mirar cuántas se terminaron: se podía pasar al stock una prenda que nadie cosió, o cerrar con
--      prendas todavía en un servicio. Con las fases (154000, 155000) la base SABE cuántas terminaron en la última (`produccion_avances`) y cuántas están afuera.
--   2. El costo de los servicios del Taller era una cifra tecleada («Maquila (real)»), cuando la base ya deriva lo devengado de cada fase (buenas × tarifa + fijo).
--   3. Lo que cuesta una orden solo lo veía el líder (`fn_costos_producciones`, `fn_costos_insumos_taller`): la encargada del Taller no podía saber si el lote salía caro.
--      Felipe (2026-10-15): lo ve quien ve Producción parado en ese Taller, como ya lo ve la página de la orden (`fn_orden_produccion`).
--   4. `anular_produccion` anulaba aunque hubiera prendas afuera: quedaban en un servicio sin orden que las reclamara.
--
-- QUÉ HACE (solo funciones; sin tablas nuevas, sin políticas, sin `alter table`)
--   · `cerrar_produccion` (misma firma, ADR-0090): en una orden CON fases (a) rechaza si hay prendas afuera (`cierre_con_prendas_afuera`), (b) rechaza más buenas de una talla y
--     color que las terminadas en la última fase (`cierre_buenas_exceden`), (c) si no le mandan `p_costo_maquila` toma lo devengado por los servicios, y (d) en un lote escribe lo
--     MEDIDO en `producto_consumos` (metros de tela usados ÷ buenas), que desde ahora gana sobre lo declarado. Las prendas segundas no entran al stock (decisión de Felipe):
--     solo las buenas, y el costo del lote se reparte entre ellas. Una orden de ANTES de las fases (sin ninguna) cierra exactamente como hoy.
--   · `anular_produccion` (misma firma): no anula con prendas afuera (`anular_con_prendas_afuera`).
--   · `fn_costos_producciones` y `fn_costos_insumos_taller` (misma firma): «líder, o quien ve `produccion` y opera ese Taller» (`fn_ve_costos_del_taller`).
--   · `fn_costo_servicios_orden(orden)`: lo devengado por los servicios de la orden (la suma de lo que `fn_fases_de_orden` ya calcula; una sola fórmula).
--
-- DESCARTÉ
--   · Aceptar el cierre con prendas afuera y «arreglarlo después»: una prenda en un servicio sin orden abierta es un estado imposible (principio 2). Primero la Vuelta, o los
--     faltantes con su motivo (los faltantes no se pagan).
--   · Que las segundas entren al stock como otro producto: otro cambio en el núcleo del catálogo (principio 1) con reglas de precio que hoy no existen; quedan anotadas en la Vuelta.
--   · Tocar `revertir_produccion`: devuelve el stock como siempre. Lo medido que dejó el cierre se reescribe en el siguiente cierre del modelo.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe, después de 154000 y 155000): solo `create or replace function` sobre funciones que ya existen o son nuevas; ninguna política
-- ni `alter table`. Idempotente.

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. Lo devengado por los servicios de una orden ----------
create or replace function retail.fn_costo_servicios_orden(p_produccion_id uuid) returns numeric
language sql stable
security definer
set search_path = retail, public, extensions
as $$
  select coalesce(sum((f ->> 'devengado')::numeric), 0)
    from jsonb_array_elements(coalesce(retail.fn_fases_de_orden(p_produccion_id), '[]'::jsonb)) f
   where f ->> 'quien' = 'servicio';
$$;
comment on function retail.fn_costo_servicios_orden(uuid) is
  'ADR-0400 (actividad 6): lo devengado por los servicios de la orden (buenas × tarifa + fijo, de fn_fases_de_orden). Interna: la usa cerrar_produccion.';

-- ---------- 2. ¿Quién ve los costos del Taller? ----------
create or replace function retail.fn_ve_costos_del_taller(p_ubicacion_id uuid) returns boolean
language sql stable
security definer
set search_path = retail, public, extensions
as $$
  select retail.fn_es_lider() or (retail.fn_ve_modulo('produccion') and retail.fn_puede_operar_ubicacion(p_ubicacion_id));
$$;
comment on function retail.fn_ve_costos_del_taller(uuid) is
  'ADR-0400 (actividad 6, Felipe 2026-10-15): los costos del Taller los ve el líder, o quien ve Producción parado en ese Taller (la misma regla que fn_orden_produccion).';

create or replace function retail.fn_costos_producciones(p_ubicacion_id uuid)
returns table (produccion_id uuid, costo_tela numeric, costo_avios numeric, costo_maquila numeric, costo_unitario numeric)
language sql stable
security definer
set search_path = retail, public, extensions
as $$
  select p.id, p.costo_tela, p.costo_avios, p.costo_maquila, p.costo_unitario
  from retail.producciones p
  where retail.fn_ve_costos_del_taller(p_ubicacion_id) and p.ubicacion_id = p_ubicacion_id;
$$;

create or replace function retail.fn_costos_insumos_taller(p_ubicacion_id uuid)
returns table (lote_id uuid, costo_unitario numeric)
language sql stable
security definer
set search_path = retail, public, extensions
as $$
  select l.id, l.costo_unitario
  from retail.insumo_lotes l
  where retail.fn_ve_costos_del_taller(p_ubicacion_id) and l.ubicacion_id = p_ubicacion_id;
$$;

-- ---------- 3. Pasar la orden al stock ----------
create or replace function retail.cerrar_produccion(
  p_produccion_id uuid, p_buenas jsonb, p_costo_tela numeric, p_costo_avios numeric, p_costo_maquila numeric, p_confirma_costo_atipico boolean default false
) returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_orden producciones%rowtype; v_persona uuid; v_b jsonb; v_total integer := 0;
  v_linea produccion_lineas%rowtype; v_mov uuid; v_sub uuid; v_costo numeric;
  -- COSTO ATÍPICO
  v_sku text; v_vigente numeric; v_precio numeric; v_motivo text;
  -- FASES (ADR-0400): la última fase y lo que está afuera
  v_con_fases boolean; v_ultima uuid; v_ultima_nombre text; v_terminadas integer; v_afuera record; v_usado numeric;
begin
  select * into v_orden from producciones where id = p_produccion_id for update;
  if not found then raise exception 'La orden no existe'; end if;
  if not fn_puede_operar_ubicacion(v_orden.ubicacion_id) then
    raise exception 'No tienes permiso sobre las órdenes de ese Taller';
  end if;
  -- El candado del doble conteo: un segundo clic no vuelve a sumar las mismas prendas.
  if v_orden.estado <> 'en_proceso' or v_orden.inventariado_at is not null then
    raise exception 'Esta orden ya está cerrada';
  end if;
  if p_buenas is null or jsonb_array_length(p_buenas) = 0 then
    raise exception 'Indica cuántas salieron buenas de cada talla';
  end if;

  -- Una orden con fases no se cierra con prendas todavía en un servicio: primero su Vuelta (o los faltantes, con su motivo).
  v_con_fases := exists (select 1 from retail.produccion_fases f where f.produccion_id = p_produccion_id);
  if v_con_fases then
    select f.id, retail.fn_fase_nombre(f.clave) into v_ultima, v_ultima_nombre
      from retail.produccion_fases f where f.produccion_id = p_produccion_id order by f.secuencia desc limit 1;
    select (f ->> 'afuera')::integer as afuera, f ->> 'proveedor_nombre' as servicio, f ->> 'nombre' as fase into v_afuera
      from jsonb_array_elements(retail.fn_fases_de_orden(p_produccion_id)) f
     where coalesce((f ->> 'afuera')::integer, 0) > 0
     order by (f ->> 'secuencia')::integer limit 1;
    if found then
      raise exception 'Hay % de % afuera con %: anota primero su vuelta (o los faltantes, con su motivo)',
        retail.fn_actividad_cuantas(v_afuera.afuera, 'prenda', 'prendas'), v_afuera.fase, coalesce(v_afuera.servicio, 'un servicio')
        using hint = 'cierre_con_prendas_afuera';
    end if;
  end if;

  -- Las buenas se anotan línea por línea; una variante que no era de la orden se rechaza.
  for v_b in select * from jsonb_array_elements(p_buenas) loop
    if (v_b ->> 'cantidad')::integer is null or (v_b ->> 'cantidad')::integer < 0 then
      raise exception 'Las buenas de cada talla son cero o más';
    end if;
    update produccion_lineas set cantidad_buenas = (v_b ->> 'cantidad')::integer
      where produccion_id = p_produccion_id and variante_id = (v_b ->> 'variante_id')::uuid;
    if not found then
      raise exception 'Una de las tallas no pertenece a esta orden';
    end if;
    -- El candado de las buenas: a esa talla y color no entran al stock más prendas que las terminadas en la última fase.
    if v_con_fases then
      select coalesce(sum(a.cantidad), 0)::integer into v_terminadas
        from retail.produccion_avances a where a.fase_id = v_ultima and a.variante_id = (v_b ->> 'variante_id')::uuid;
      if (v_b ->> 'cantidad')::integer > v_terminadas then
        raise exception 'No puedes pasar al stock % de %: en % se terminaron %',
          (v_b ->> 'cantidad')::integer, retail.fn_produccion_variante_texto((v_b ->> 'variante_id')::uuid), v_ultima_nombre, v_terminadas
          using hint = 'cierre_buenas_exceden';
      end if;
    end if;
  end loop;
  -- Línea que el formulario no mandó = ninguna buena. Así toda línea queda contestada.
  update produccion_lineas set cantidad_buenas = 0
    where produccion_id = p_produccion_id and cantidad_buenas is null;

  select coalesce(sum(cantidad_buenas), 0) into v_total from produccion_lineas where produccion_id = p_produccion_id;
  if v_total = 0 then
    raise exception 'No salió ninguna prenda buena — si la corrida se perdió, anula la orden en vez de cerrarla';
  end if;

  -- El costo de los servicios sale de lo devengado (buenas × tarifa + fijo) salvo que alguien mande otro monto; el de tela y avíos, del libro de insumos (`coalesce` con el que ya tiene la orden).
  update producciones
    set cantidad_buenas = v_total,
        costo_tela = coalesce(p_costo_tela, costo_tela),
        costo_avios = coalesce(p_costo_avios, costo_avios),
        costo_maquila = case when v_con_fases then coalesce(p_costo_maquila, retail.fn_costo_servicios_orden(p_produccion_id))
                             else coalesce(p_costo_maquila, costo_maquila) end,
        estado = 'terminada',
        inventariado_at = case when es_muestra then null else now() end
    where id = p_produccion_id;

  -- Una muestra se da por terminada y no toca el stock ni el costo de la prenda.
  if v_orden.es_muestra then return; end if;

  select costo_unitario into v_costo from producciones where id = p_produccion_id;

  -- COSTO ATÍPICO. Antes de escribir un solo movimiento o costo: si el costo por prenda no pasa la regla para alguna de
  -- las tallas que entran, un líder confirma o corrige los montos; quien no es líder no puede cerrarla. El `raise` deshace
  -- todo lo de arriba (buenas, estado). Las tallas de una prenda comparten costo en la práctica, así que se informa la
  -- primera atípica por código.
  select vr.sku, vr.costo, vr.precio, retail.fn_costo_fuera_de_banda(v_costo, vr.costo, vr.precio)
    into v_sku, v_vigente, v_precio, v_motivo
    from produccion_lineas l
    join variantes vr on vr.id = l.variante_id
   where l.produccion_id = p_produccion_id
     and l.cantidad_buenas > 0
     and retail.fn_costo_fuera_de_banda(v_costo, vr.costo, vr.precio) is not null
   order by vr.sku
   limit 1;

  if v_motivo is not null then
    if not retail.fn_es_lider() then
      raise exception 'costo_atipico_sin_lider';
    end if;
    if not coalesce(p_confirma_costo_atipico, false) then
      raise exception 'costo_atipico'
        using detail = jsonb_build_object(
          'motivo', v_motivo, 'costo_unitario', v_costo, 'costo_vigente', v_vigente, 'precio', v_precio, 'sku', v_sku
        )::text;
    end if;
    update producciones
      set nota = concat_ws(' · ', nota, 'Costo atípico confirmado por un líder (' || case v_motivo
            when 'sin_costo' then 'sin costo'
            when 'mayor_que_precio' then 'costo igual o mayor que el precio'
            when 'sube' then 'más del doble del costo vigente'
            when 'baja' then 'menos de dos tercios del costo vigente'
          end || ')')
      where id = p_produccion_id;
  end if;

  v_persona := retail.fn_actor_persona_id(true);
  v_sub := fn_sububicacion_por_defecto(v_orden.ubicacion_id, 'entrada');

  -- LO MEDIDO (ADR-0400): los metros de tela que de verdad se usaron en este lote ÷ las prendas buenas. Gana sobre lo declarado: la próxima orden del modelo propone esa cifra.
  if v_con_fases then
    select coalesce(sum(case when mi.tipo = 'consumo' then mi.cantidad else -mi.cantidad end), 0) into v_usado
      from retail.movimientos_insumo mi
      join retail.insumos i on i.id = mi.insumo_id
     where mi.produccion_id = p_produccion_id and mi.tipo in ('consumo', 'devolucion') and i.tipo = 'tela' and i.unidad_medida = 'metro';
    if v_usado > 0 and round(v_usado / v_total, 3) > 0 then
      insert into retail.producto_consumos (producto_id, tela_por_prenda, fuente, actualizado_por)
        values (v_orden.producto_id, round(v_usado / v_total, 3), 'medido', v_persona)
      on conflict (producto_id) do update
        set tela_por_prenda = excluded.tela_por_prenda, fuente = 'medido', actualizado_por = excluded.actualizado_por, updated_at = now();
    end if;
  end if;

  for v_linea in
    select * from produccion_lineas where produccion_id = p_produccion_id and cantidad_buenas > 0
  loop
    insert into movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, produccion_id, usuario_id)
      values (v_linea.variante_id, v_orden.ubicacion_id, v_sub, 'entrada', v_linea.cantidad_buenas, 'produccion', p_produccion_id, v_persona)
      returning id into v_mov;

    -- D-31 / D-45: el costo REAL de la corrida entra al promedio ponderado de
    -- la prenda (ya no lo pisa) — misma función que recibir_lote/recibir_compras.
    perform fn_recalcular_costo_variante(v_linea.variante_id, v_linea.cantidad_buenas, v_costo, 'produccion', v_mov);

    perform fn_aplicar_movimiento(v_mov);
  end loop;
end;
$$;

-- ---------- 4. Anular una orden ----------
create or replace function retail.anular_produccion(p_produccion_id uuid, p_motivo text default null) returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_orden producciones%rowtype;
  v_persona uuid;
  v_resto record;
  v_afuera record;
begin
  select * into v_orden from producciones where id = p_produccion_id for update;
  if not found then raise exception 'La orden no existe'; end if;
  if not fn_puede_operar_ubicacion(v_orden.ubicacion_id) then
    raise exception 'No tienes permiso sobre las órdenes de ese Taller';
  end if;
  if v_orden.estado <> 'en_proceso' then
    raise exception 'Solo se anula una orden en proceso — una cerrada se revierte';
  end if;

  -- Con prendas afuera no se anula: quedarían en un servicio sin una orden que las reclame. Primero su vuelta (o los faltantes, con su motivo).
  select (f ->> 'afuera')::integer as afuera, f ->> 'proveedor_nombre' as servicio, f ->> 'nombre' as fase into v_afuera
    from jsonb_array_elements(coalesce(retail.fn_fases_de_orden(p_produccion_id), '[]'::jsonb)) f
   where coalesce((f ->> 'afuera')::integer, 0) > 0
   order by (f ->> 'secuencia')::integer limit 1;
  if found then
    raise exception 'Hay % de % afuera con %: anota primero su vuelta (o los faltantes, con su motivo)',
      retail.fn_actividad_cuantas(v_afuera.afuera, 'prenda', 'prendas'), v_afuera.fase, coalesce(v_afuera.servicio, 'un servicio')
      using hint = 'anular_con_prendas_afuera';
  end if;

  v_persona := retail.fn_actor_persona_id(true);

  -- Cada (insumo, lote) con neto > 0 vuelve entero, al costo con que salió.
  for v_resto in
    select mi.insumo_id, mi.insumo_lote_id, mi.costo_unitario,
           sum(case when mi.tipo = 'consumo' then mi.cantidad else -mi.cantidad end) as neto
    from movimientos_insumo mi
    where mi.produccion_id = p_produccion_id and mi.tipo in ('consumo', 'devolucion')
    group by mi.insumo_id, mi.insumo_lote_id, mi.costo_unitario
    having sum(case when mi.tipo = 'consumo' then mi.cantidad else -mi.cantidad end) > 0
  loop
    insert into movimientos_insumo (
      insumo_id, insumo_lote_id, ubicacion_id, tipo, cantidad, costo_unitario, produccion_id, usuario_id, motivo, nota
    ) values (
      v_resto.insumo_id, v_resto.insumo_lote_id, v_orden.ubicacion_id, 'devolucion', v_resto.neto, v_resto.costo_unitario,
      p_produccion_id, v_persona, 'anulacion_orden', nullif(btrim(p_motivo), '')
    );
  end loop;

  update producciones
    set estado = 'anulada',
        nota = concat_ws(' · ', nota, nullif(btrim(p_motivo), ''))
    where id = p_produccion_id;

  perform fn_recalcular_costo_insumos_produccion(p_produccion_id);
end;
$$;

-- ---------- 5. Permisos ----------
-- Las funciones que ya existían conservan los suyos (`create or replace`). Las nuevas son internas: nadie las llama desde la API.
revoke all on function retail.fn_costo_servicios_orden(uuid) from public, anon, authenticated;
revoke all on function retail.fn_ve_costos_del_taller(uuid) from public, anon, authenticated;

reset lock_timeout;
