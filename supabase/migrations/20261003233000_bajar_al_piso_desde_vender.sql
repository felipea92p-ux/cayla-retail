-- ============================================================================
-- 20261003233000_bajar_al_piso_desde_vender.sql — CAYLA V2 · ADR-0320 · la caja registra la bajada al piso que se olvidó.
-- Solo agrega una función: no toca tablas, políticas ni disparadores, ni `registrar_venta`.
--
-- EL PROBLEMA PRIMERO. En las tiendas a veces cuelgan una prenda del almacén en el piso sin registrar la bajada. Cuando la
-- clienta la lleva a la caja y la escanean, el sistema dice «0 en el piso, N en el almacén» y Vender no la deja entrar al
-- ticket (una venta descuenta el PISO, nunca el almacén en silencio). La colaboradora tenía que dejar a la clienta
-- esperando, ir a Inventario ▸ Existencias ▸ Reponer, registrar la bajada y volver a escanear; y si su rol no veía
-- Existencias, ni eso. La D-40 ya lo había decidido en septiembre: «la caja no se frena nunca por un trámite».
--
-- QUÉ HACE. `bajar_al_piso_desde_vender(p_ubicacion_id, p_variante_id, p_piso_necesario, p_token)`: deja el piso de esa tienda
-- con al menos `p_piso_necesario` unidades LIBRES de esa prenda, bajando del almacén de la MISMA tienda solo lo que falte.
--   · `p_piso_necesario` es lo que el ticket va a llevar de esa prenda (más lo vendido sin conexión que aún no subió). No es
--     «cuántas bajar»: si mientras tanto otra persona ya registró la bajada en Existencias, aquí no se baja nada y se
--     responde `bajadas = 0` — la misma prenda no se cuenta dos veces en el piso por una pantalla desactualizada.
--   · La bajada es la MISMA fila del libro que escribe «Reponer» (`mover_interno` almacén → piso, `traslado` /
--     `movimiento_interno`), con la nota «Bajada registrada desde Vender»: Movimientos, Actividad y Frescura la leen sin
--     cambios. Frescura la verá como «bajada tardía» si la prenda se vende en menos de 10 minutos, que es lo que es
--     (Felipe eligió un solo botón, 2026-10-03; los dos botones «Ya estaba colgada» / «La traje del almacén» del ADR-0208
--     bloque 3b siguen pendientes).
--   · Pide el módulo VENDER, no Existencias: el botón vive en Vender, y una acción dentro de una pantalla es de su módulo
--     (ADR-0306). Pide operar la tienda (`fn_puede_operar_ubicacion`) y la firma el responsable elegido en la caja
--     (`fn_actor_persona_id(true)`, ADR-0162).
--   · Bloquea el stock de la prenda (`fn_bloquear_en_orden`, el orden de ventas y traslados, ADR-0190) y mira con el candado
--     tomado lo libre del piso y del almacén (cantidad − apartadas: lo apartado para una clienta no se baja ni se vende).
--   · Reintento: la marca va tal cual a `mover_interno`, que la guarda en `movimientos_internos_intentos`. Reenviar la misma
--     marca devuelve `ya_registrada = true` con lo que hay ahora, sin mover nada (aunque quien la hizo ya marcó su salida).
--
-- CONTRATO. PROMETE: o el piso queda con `p_piso_necesario` libres (bajando lo que faltaba, todo de una vez), o no se mueve
-- nada y el error dice por qué. Devuelve `{ya_registrada, bajadas, piso, almacen, movimiento_id}` con lo libre DESPUÉS, para
-- que la caja no tenga que releer. ASUME: la tienda separa piso y almacén; la marca es obligatoria (una por toque).
--
-- POR QUÉ NO DENTRO DE `registrar_venta`. Bajar y vender en la misma transacción sería lo más atómico, pero `registrar_venta`
-- es la función más parchada del repo (18 parámetros, candado de huella; hoy mismo la parcha el redondeo, ADR-0311) y la
-- bajada es un hecho físico aparte de la venta: la prenda ya está en el piso aunque la clienta se arrepienta. Por eso se
-- registra al tocar el aviso, y la venta sigue siendo la de siempre.
--
-- CÓMO SE PEGA EN PRODUCCIÓN. Tal cual, en una vez, en el SQL Editor (trae `retail.` y `set search_path`), ANTES de publicar la
-- web que la llama (una web nueva contra una base sin esta función responde «Could not find the function» y la caja vuelve
-- al aviso de siempre: no se pierde ninguna venta). Solo `create or replace function` + `comment` + `revoke` + `grant`: no toma
-- las tablas de `auth`/`storage` (ADR-0195), no lleva políticas ni `drop trigger`, ni `select … into` dentro de comillas
-- (ADR-0288). Re-ejecutable. Cómo se verifica después:
--   select pg_get_function_identity_arguments(p.oid) from pg_proc p
--    where p.pronamespace = 'retail'::regnamespace and p.proname = 'bajar_al_piso_desde_vender';
--   (una fila: «p_ubicacion_id uuid, p_variante_id uuid, p_piso_necesario integer, p_token uuid»).
--
-- SE ROMPE SI `mover_interno` deja de recibir `p_token` (reintentar bajaría dos veces) o cambia la clave de su candado de
-- marca (`'mover_interno:' || token`: aquí se toma la misma para que dos reintentos simultáneos no bajen dos veces).
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function retail.bajar_al_piso_desde_vender(
  p_ubicacion_id uuid,
  p_variante_id uuid,
  p_piso_necesario integer,
  p_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $fn$
declare
  c_centinela constant uuid := '22222222-2222-4222-8222-222222222222';
  c_nota constant text := 'Bajada registrada desde Vender';
  v_piso uuid;
  v_almacen uuid;
  v_prev uuid;
  v_actor uuid;
  v_piso_libre integer;
  v_almacen_libre integer;
  v_falta integer;
  v_mov uuid;
  v_prenda text;
  v_sede text;
begin
  if p_token is null then
    raise exception 'Falta la marca de este intento. Vuelve a escanear la prenda.' using hint = 'bajada_vender_sin_token';
  end if;
  if not fn_ve_modulo('vender') then
    raise exception 'No puedes registrar la bajada desde Vender: tu rol no tiene el módulo «Vender». Pídele al líder que lo active.'
      using hint = 'bajada_vender_sin_modulo';
  end if;
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para mover mercadería en esa tienda.' using hint = 'bajada_vender_sin_tienda';
  end if;
  if p_piso_necesario is null or p_piso_necesario < 1 or p_piso_necesario > 999 then
    raise exception 'La cantidad de la prenda en el ticket no es válida.' using hint = 'bajada_vender_cantidad_invalida';
  end if;
  if p_variante_id is null or p_variante_id = c_centinela or not exists (select 1 from variantes where id = p_variante_id) then
    raise exception 'Esa prenda no está en el catálogo: no hay nada que bajar al piso.' using hint = 'bajada_vender_no_es_prenda';
  end if;

  v_piso := (select s.id from sububicaciones s where s.ubicacion_id = p_ubicacion_id and s.tipo = 'piso_venta');
  v_almacen := (select s.id from sububicaciones s where s.ubicacion_id = p_ubicacion_id and s.tipo = 'almacen_tienda');
  if v_piso is null or v_almacen is null then
    raise exception 'Esta tienda todavía no separa piso y almacén: no hay bajada que registrar.' using hint = 'bajada_vender_tienda_sin_piso';
  end if;

  -- ¿Ya se registró este toque? El mismo candado de marca que `mover_interno`: dos reintentos simultáneos se esperan, y el
  -- segundo encuentra la marca del primero. Antes de pedir responsable: comprobar algo ya guardado no escribe nada.
  perform pg_advisory_xact_lock(hashtextextended('mover_interno:' || p_token::text, 0));
  v_prev := (select i.movimiento_id from movimientos_internos_intentos i where i.token_cliente = p_token);
  if v_prev is not null then
    if not exists (
      select 1 from movimientos m
       where m.id = v_prev and m.variante_id = p_variante_id and m.ubicacion_id = p_ubicacion_id
         and m.sububicacion_id = v_almacen and m.sububicacion_destino_id = v_piso
    ) then
      raise exception 'Ese intento ya se guardó con otra prenda: no se repitió. Vuelve a escanear.' using hint = 'mover_interno_token_reusado';
    end if;
    return jsonb_build_object(
      'ya_registrada', true,
      'bajadas', (select m.cantidad from movimientos m where m.id = v_prev),
      'piso', coalesce((select greatest(s.cantidad - s.cantidad_apartada, 0) from stock s
                         where s.variante_id = p_variante_id and s.ubicacion_id = p_ubicacion_id and s.sububicacion_id = v_piso), 0),
      'almacen', coalesce((select greatest(s.cantidad - s.cantidad_apartada, 0) from stock s
                            where s.variante_id = p_variante_id and s.ubicacion_id = p_ubicacion_id and s.sububicacion_id = v_almacen), 0),
      'movimiento_id', v_prev);
  end if;

  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién está atendiendo.' using hint = 'responsable_requerido';
  end if;

  -- Candado: el stock de la prenda en la tienda, en el orden de ventas y traslados (ADR-0190). Desde aquí, lo que se lee
  -- es lo que hay de verdad: otra caja no puede vender ni otra pantalla bajar esta prenda hasta terminar.
  perform fn_bloquear_en_orden(p_ubicacion_id, array[p_variante_id]);

  v_piso_libre := coalesce((select greatest(s.cantidad - s.cantidad_apartada, 0) from stock s
                             where s.variante_id = p_variante_id and s.ubicacion_id = p_ubicacion_id and s.sububicacion_id = v_piso), 0);
  v_almacen_libre := coalesce((select greatest(s.cantidad - s.cantidad_apartada, 0) from stock s
                                where s.variante_id = p_variante_id and s.ubicacion_id = p_ubicacion_id and s.sububicacion_id = v_almacen), 0);
  v_falta := p_piso_necesario - v_piso_libre;

  -- Otra persona ya la registró (o la caja veía un piso viejo): el piso ya alcanza y no se baja nada.
  if v_falta <= 0 then
    return jsonb_build_object('ya_registrada', false, 'bajadas', 0, 'piso', v_piso_libre, 'almacen', v_almacen_libre, 'movimiento_id', null);
  end if;

  if v_almacen_libre < v_falta then
    v_prenda := coalesce(fn_prenda_corta(p_variante_id), 'Esta prenda');
    v_sede := coalesce((select u.nombre from ubicaciones u where u.id = p_ubicacion_id), 'esta tienda');
    raise exception '%', v_prenda || ': en el almacén de ' || v_sede || ' no queda libre para bajar ('
        || case when v_almacen_libre = 0 then 'no hay ninguna' when v_almacen_libre = 1 then 'hay 1 y faltan ' || v_falta
                else 'hay ' || v_almacen_libre || ' y faltan ' || v_falta end
        || '). Puede que otra persona ya la haya bajado, vendido o apartado: revisa Existencias.'
      using hint = 'bajada_vender_sin_almacen',
            detail = jsonb_build_object('piso', v_piso_libre, 'almacen', v_almacen_libre, 'falta', v_falta)::text;
  end if;

  -- El resto (tienda que se opera, la fila del libro, la firma, la marca) es de mover_interno: se llama, no se copia.
  v_mov := mover_interno(p_ubicacion_id, p_variante_id, v_falta, v_almacen, v_piso, c_nota, p_token);

  return jsonb_build_object(
    'ya_registrada', false,
    'bajadas', v_falta,
    'piso', v_piso_libre + v_falta,
    'almacen', v_almacen_libre - v_falta,
    'movimiento_id', v_mov);
end;
$fn$;

comment on function retail.bajar_al_piso_desde_vender(uuid, uuid, integer, uuid) is
  'ADR-0320: desde Vender, deja el piso de la tienda con al menos p_piso_necesario unidades libres de la prenda, bajando del almacén de la misma tienda solo lo que falte (0 si ya alcanza). Pide el módulo Vender y operar la tienda; firma el responsable. Es un mover_interno almacén→piso con la nota «Bajada registrada desde Vender» (la misma fila que Reponer). p_token obligatorio: reenviarlo devuelve ya_registrada sin mover nada. Devuelve {ya_registrada, bajadas, piso, almacen, movimiento_id} con lo libre después.';

revoke all on function retail.bajar_al_piso_desde_vender(uuid, uuid, integer, uuid) from public, anon;
grant execute on function retail.bajar_al_piso_desde_vender(uuid, uuid, integer, uuid) to authenticated;

notify pgrst, 'reload schema';
