-- ============================================================================
-- 20260927180000_existencias_una_puerta_un_candado.sql — CAYLA V2 · ADR-0240 · PARTE 1 de 2
-- Cada escritura de stock que se hace desde Existencias pregunta el módulo que la nombra, en la base.
--
-- EL PROBLEMA PRIMERO. Bajar prendas del almacén al piso tenía dos puertas con candados distintos:
--   · «Bajar al piso» (`bajar_al_piso`) pide el módulo «Bajada al piso» dentro de la función (ADR-0208).
--   · «Reponer al piso» y «Retirar del piso» (el detalle de la prenda en Existencias) llaman a `mover_interno`, que hace
--     el MISMO movimiento almacén↔piso y no pregunta ningún módulo.
-- Con «Apartar» pasaba igual: `apartar_stock` no pregunta el módulo «Apartados». En la siembra, el rol integrante ve
-- Existencias sin «Bajada al piso» ni «Apartados», y el detalle le dejaba hacer las dos cosas (análisis `/pantalla`,
-- `docs/pantallas/inventario.md`, tarea #3). Felipe eligió la opción A (2026-09-26): mover piso↔almacén es de
-- «Bajada al piso» y apartar es de «Apartados», que es lo que ya dice Roles y accesos (ADR-0161).
--
-- POR QUÉ PUERTAS NUEVAS Y NO EL CANDADO DENTRO DE `mover_interno` / `apartar_stock`. Esas dos funciones también las
-- usan otras por dentro, en nombre de otro módulo:
--   · `apartar_stock`: recibir un traslado aparta sola la prenda de un pedido (`fn_apartar_pedidos_que_llegaron`, desde
--     el disparador de pedidos; lo hace quien RECIBE, con Traslados, que puede no tener «Apartados»), y las
--     separaciones de Apartados.
--   · `mover_interno`: `bajar_al_piso` (cada línea) y `separar_pedido_para_apartar` (Apartados: la prenda pedida sube
--     al piso para apartarla con adelanto).
-- Un candado adentro rompería recibir un traslado para quien no tiene «Apartados». Así que:
--   · `mover_entre_piso_y_almacen` y `apartar_prenda` son las puertas de la PANTALLA: mismo contrato que la función de
--     siempre, más el módulo; la de piso además solo acepta el par piso↔almacén de esa tienda.
--   · `mover_interno` y `apartar_stock` quedan como piezas internas: la PARTE 2 (20260927180200) les quita el EXECUTE
--     a `authenticated`, DESPUÉS de publicar la web que ya llama a las puertas. Las funciones `security definer` que
--     las llaman corren como su dueño y no pierden nada.
--
-- CONTRATO. `mover_entre_piso_y_almacen` PROMETE lo mismo que `mover_interno` (una fila traslado, marca de reintento,
-- firma del responsable) y ASUME: módulo «Bajada al piso» (hint `bajada_sin_modulo`, el mismo de `bajar_al_piso`) y
-- origen/destino = piso de venta y almacén de ESA tienda (hint `mover_fuera_de_piso_almacen`). `apartar_prenda`
-- PROMETE lo mismo que `apartar_stock` y ASUME el módulo «Apartados» (hint `apartar_sin_modulo`).
--
-- SE ROMPE SI una pantalla nueva vuelve a llamar a `mover_interno` o `apartar_stock` desde el navegador: después de la
-- parte 2 recibe «permission denied» (42501). Es a propósito: la puerta con candado es la otra.
--
-- CÓMO SE PEGA EN PRODUCCIÓN: tal cual, en una vez (trae `retail.`). Solo crea dos funciones: no toca tablas en uso ni
-- crea políticas o disparadores (ADR-0195 no aplica). Idempotente. ORDEN: esta parte → publicar la web → parte 2.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- ---------------------------------------------------------------------------
-- «Reponer al piso» y «Retirar del piso»: es de «Bajada al piso».
-- ---------------------------------------------------------------------------
create or replace function retail.mover_entre_piso_y_almacen(
  p_ubicacion_id uuid, p_variante_id uuid, p_cantidad integer,
  p_sububicacion_origen_id uuid, p_sububicacion_destino_id uuid,
  p_nota text default null,
  p_token uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
begin
  if not fn_ve_modulo('bajada_piso') then
    raise exception 'No puedes mover prendas entre el piso y el almacén: tu rol no tiene el módulo «Bajada al piso». Pídele al líder que lo active.'
      using hint = 'bajada_sin_modulo';
  end if;
  -- Esta puerta mueve SOLO entre el piso de venta y el almacén de la misma tienda: la cuarentena y cualquier otro par
  -- tienen su propio camino (y su propio candado).
  if not exists (
    select 1
      from sububicaciones o
      join sububicaciones d on d.ubicacion_id = o.ubicacion_id
     where o.id = p_sububicacion_origen_id
       and d.id = p_sububicacion_destino_id
       and o.ubicacion_id = p_ubicacion_id
       and (o.tipo, d.tipo) in (('almacen_tienda', 'piso_venta'), ('piso_venta', 'almacen_tienda'))
  ) then
    raise exception 'Aquí solo se mueve entre el piso de venta y el almacén de la misma tienda.'
      using hint = 'mover_fuera_de_piso_almacen';
  end if;
  -- El resto (tienda que se opera, cantidad, marca de reintento, responsable, stock bajo candado) es de mover_interno:
  -- se llama, no se copia.
  return mover_interno(p_ubicacion_id, p_variante_id, p_cantidad, p_sububicacion_origen_id, p_sububicacion_destino_id,
                       p_nota, p_token);
end;
$$;

comment on function retail.mover_entre_piso_y_almacen(uuid, uuid, integer, uuid, uuid, text, uuid) is
  'ADR-0240: la puerta de «Reponer al piso» y «Retirar del piso» (Existencias). mover_interno + el módulo «Bajada al piso» + solo el par piso↔almacén de esa tienda. Con p_token, el reintento con los mismos datos devuelve el mismo movimiento.';

revoke all on function retail.mover_entre_piso_y_almacen(uuid, uuid, integer, uuid, uuid, text, uuid) from public, anon;
grant execute on function retail.mover_entre_piso_y_almacen(uuid, uuid, integer, uuid, uuid, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- «Apartar» desde Existencias: es de «Apartados».
-- ---------------------------------------------------------------------------
create or replace function retail.apartar_prenda(
  p_variante_id uuid, p_ubicacion_id uuid, p_cantidad integer,
  p_clienta_nombre text, p_clienta_contacto text, p_vence_el date,
  p_nota text default null,
  p_sububicacion_id uuid default null,
  p_token uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
begin
  if not fn_ve_modulo('apartados') then
    raise exception 'No puedes apartar prendas: tu rol no tiene el módulo «Apartados». Pídele al líder que lo active.'
      using hint = 'apartar_sin_modulo';
  end if;
  return apartar_stock(p_variante_id, p_ubicacion_id, p_cantidad, p_clienta_nombre, p_clienta_contacto, p_vence_el,
                       p_nota, p_sububicacion_id, p_token);
end;
$$;

comment on function retail.apartar_prenda(uuid, uuid, integer, text, text, date, text, uuid, uuid) is
  'ADR-0240: la puerta de «Apartar» (Existencias). apartar_stock + el módulo «Apartados». apartar_stock queda para las funciones que apartan en nombre de otro módulo (recibir un traslado con pedido, separaciones).';

revoke all on function retail.apartar_prenda(uuid, uuid, integer, text, text, date, text, uuid, uuid) from public, anon;
grant execute on function retail.apartar_prenda(uuid, uuid, integer, text, text, date, text, uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
