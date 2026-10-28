-- ============================================================================
-- 20260930121000_cerrar_produccion_costo_atipico.sql
-- Cerrar una orden del Taller pide confirmación si el costo por prenda es atípico (Felipe, 2026-09-30) — actividad 2 de 5
--
-- EL PROBLEMA PRIMERO. `cerrar_produccion` calcula el costo por prenda (tela + avíos + maquila, entre las buenas) y lo
-- mete al promedio ponderado de cada talla (`fn_recalcular_costo_variante`, la misma función que usa Compras). Solo
-- validaba que no fuera negativo: un cero de más en la tela, o un «100» en vez de «10» en las buenas, contamina el
-- costo de esa prenda en las tres sedes, y no tiene arreglo desde la app (`revertir_produccion` no toca el costo; el
-- candado de 20260927190000 impide corregirlo a mano una vez que hay historial).
--
-- QUÉ PROMETE. Después de calcular el costo por prenda y ANTES de escribir movimientos o costos, se le pregunta a
-- `fn_costo_fuera_de_banda` (20260930120000) por cada talla que entra (con sus buenas > 0), contra el costo vigente y el
-- precio de esa talla. Si alguna sale atípica:
--   - Quien NO es líder no puede cerrarla: `costo_atipico_sin_lider`, sin cifras (no ve montos: candado de dinero).
--   - Un líder recibe `costo_atipico` con el dato en `detail` (JSON: motivo, costo_unitario, costo_vigente, precio, sku)
--     y la orden queda abierta. Lo vuelve a intentar con `p_confirma_costo_atipico => true`, y el cierre deja constancia
--     en la nota de la orden (sin montos).
--   - El servidor lo exige: el permiso se pregunta a la cuenta (`fn_es_lider`, ADR-0161), así que un integrante que
--     mande `true` por la API directa recibe lo mismo que sin él.
-- Una muestra no toca costos ni stock y no pregunta nada. Todo o nada: el `raise` deshace la orden entera (buenas por
-- talla, estado, movimientos), como cualquier otro error de la función.
--
-- QUÉ CAMBIA DE LA FIRMA. Parámetro nuevo al final con valor por defecto (`p_confirma_costo_atipico boolean default
-- false`), así que quien llama con los cinco de siempre sigue funcionando. Para no dejar dos sobrecargas (PostgREST
-- rechazaría por ambigua una llamada con los cinco parámetros), se elimina la firma vieja y se crea la nueva; `drop
-- function` no toma los bloqueos de `auth`/`storage` que sí toman las políticas (ADR-0195), así que va en una sola parte.
--
-- ORDEN PARA PRODUCCIÓN: SQL y web, en cualquiera de los dos órdenes.
--   - SQL primero: la web vieja sigue cerrando sus órdenes de costo normal; una atípica muestra el aviso técnico
--     (`costo_atipico`) en vez de la pantalla de confirmación, y no se cierra hasta que salga la web.
--   - Web primero: la web nueva NO manda el parámetro en el primer intento, solo en el reintento tras `costo_atipico`,
--     que la base vieja nunca levanta. Nunca llama con un parámetro que la base no conozca.
-- PARA PEGAR EN PRODUCCIÓN: trae `set search_path`, no hace falta el prefijo `retail.`. Requiere antes 20260930120000.
--
-- BASE DEL CUERPO. Es el cuerpo vivo de producción (2026-09-29; el de producción trae los comentarios recortados, la
-- lógica es idéntica al de 20260915130000 + el `fn_actor_persona_id(true)` de 20260923100000). Nada más cambia que lo
-- marcado con «COSTO ATÍPICO».
--
-- CÓMO SE DESHACE. drop function retail.cerrar_produccion(uuid, jsonb, numeric, numeric, numeric, boolean);
--   y volver a crear la de cinco parámetros desde 20260915130000 (+ el actor de 20260923100000), con el grant a authenticated.
-- ============================================================================

set search_path = retail, public, extensions;

drop function if exists retail.cerrar_produccion(uuid, jsonb, numeric, numeric, numeric);

create or replace function retail.cerrar_produccion(
  p_produccion_id uuid,
  p_buenas jsonb,
  p_costo_tela numeric,
  p_costo_avios numeric,
  p_costo_maquila numeric,
  p_confirma_costo_atipico boolean default false
)
returns void
language plpgsql
security definer
set search_path to 'retail', 'public', 'extensions'
as $$
declare
  v_orden producciones%rowtype; v_persona uuid; v_b jsonb; v_total integer := 0;
  v_linea produccion_lineas%rowtype; v_mov uuid; v_sub uuid; v_costo numeric;
  -- COSTO ATÍPICO
  v_sku text; v_vigente numeric; v_precio numeric; v_motivo text;
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
  end loop;
  -- Línea que el formulario no mandó = ninguna buena. Así toda línea queda contestada.
  update produccion_lineas set cantidad_buenas = 0
    where produccion_id = p_produccion_id and cantidad_buenas is null;

  select coalesce(sum(cantidad_buenas), 0) into v_total from produccion_lineas where produccion_id = p_produccion_id;
  if v_total = 0 then
    raise exception 'No salió ninguna prenda buena — si la corrida se perdió, anula la orden en vez de cerrarla';
  end if;

  update producciones
    set cantidad_buenas = v_total,
        costo_tela = coalesce(p_costo_tela, costo_tela),
        costo_avios = coalesce(p_costo_avios, costo_avios),
        costo_maquila = coalesce(p_costo_maquila, costo_maquila),
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

-- Los permisos de producción (2026-09-29): dueño y la API, sin public ni anon.
revoke all on function retail.cerrar_produccion(uuid, jsonb, numeric, numeric, numeric, boolean) from public, anon;
grant execute on function retail.cerrar_produccion(uuid, jsonb, numeric, numeric, numeric, boolean) to authenticated;

comment on function retail.cerrar_produccion(uuid, jsonb, numeric, numeric, numeric, boolean) is
  'Cierra una orden: buenas por talla, costo real por prenda al promedio ponderado y entrada al stock del Taller. Si el costo por prenda es atípico (fn_costo_fuera_de_banda) un líder debe confirmarlo con p_confirma_costo_atipico; quien no es líder no puede cerrarla.';
