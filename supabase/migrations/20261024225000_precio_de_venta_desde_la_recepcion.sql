-- ============================================================================
-- 20261024225000_precio_de_venta_desde_la_recepcion.sql — CAYLA V2 (Felipe, 2026-10-24; Inventario ▸ Recibir mercadería)
--
-- EL PROBLEMA. Quien recibe un envío ve el costo de cada línea y lo corrige con la factura en la mano, pero el precio de venta de la
-- prenda que acaba de llegar solo se cambia en Catálogo ▸ Productos, que no todo el que recibe ve. Felipe pidió poder cambiarlo
-- desde la recepción, sin tocar nada de lo anterior: lo vendido ya guarda su precio en `venta_items` y el cambio rige hacia adelante.
--
-- LA DECISIÓN (Felipe, 2026-10-24): quien recibe elige si el precio vale para TODAS las sedes o solo para ESTA, y lo puede cambiar
-- «todo el que recibe» (el módulo Recibir mercadería), no solo quien ve Productos. Solo para prendas YA identificadas en este envío:
-- lo nuevo se cuenta por cantidad y su precio se pone al crearlo (el pendiente «crear»).
--
-- LO QUE HACE.
--   1. `cambiar_precio_en_recepcion(despacho, producto, precio, alcance)`: exige el módulo Recibir, el responsable del combo, que el
--      envío esté abierto, que sea de tu sede y que no lo hayas comprado tú (`fn_recepcion_exigir`), y que la prenda sea de ESTE
--      envío (la separaste al contarlo). `todas` actualiza el precio de las tallas activas de la prenda (menos la de obsequio, S/ 0 en
--      una categoría que lo admite, ADR-0384); `sede` reutiliza `poner_precio_sede` con todos sus candados (precio propio de esa
--      tienda, piso del costo, historial). Los dos rechazan un precio bajo el costo, sin decir cuánto cuesta (el costo es dato con
--      permiso, ADR-0183): para liquidar está la campaña.
--   2. El rastro: el cambio general lo anota solo el disparador `variantes_registrar_cambio` (campo `precio`, con quien firma, el valor
--      anterior y el nuevo) y el de sede, `fn_precio_sede_anotar`; el de sede lleva el motivo «Recepción ENV-000123». Lo anterior
--      no se reescribe: son filas nuevas.
--   3. `fn_precio_sede_exigir` se salta SOLO la línea del módulo Productos cuando esta función lo pidió dentro de su propia
--      transacción (`retail.precio_desde_recepcion = on`, con `set_config(..., true)`: no sobrevive a la transacción y ningún cliente
--      puede ponerla, porque PostgREST no deja ejecutar SET). Lo demás (tienda abierta, tu propia tienda, la prenda existe) sigue igual.
--
-- PRODUCCIÓN. Una sola parte, re-ejecutable, sin tablas, políticas ni disparadores. Pruebas: `pnpm pruebas:precio-desde-recepcion`.
-- Verificación: `select pg_get_functiondef(p.oid) like '%precio_desde_recepcion%' from pg_proc p join pg_namespace n on n.oid =
-- p.pronamespace where n.nspname = 'retail' and p.proname = 'fn_precio_sede_exigir';` → `true`.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- 3. El guardián del precio por sede: igual que antes, salvo que la función de Recibir ya revisó el módulo que corresponde.
create or replace function retail.fn_precio_sede_exigir(p_producto_id uuid, p_ubicacion_id uuid)
returns void
language plpgsql security definer set search_path = retail, public, extensions as $fn$
declare
  v_tipo text;
  v_activa boolean;
begin
  if coalesce(current_setting('retail.precio_desde_recepcion', true), '') <> 'on' then
    perform retail.fn_exigir_modulo('productos');
  end if;
  for v_tipo, v_activa in select u.tipo, u.activo from retail.ubicaciones u where u.id = p_ubicacion_id loop
    exit;
  end loop;
  if v_tipo is null then
    raise exception 'Esa sede no existe.';
  end if;
  if v_tipo <> 'tienda' or not v_activa then
    raise exception 'Solo una tienda abierta puede tener precio propio.';
  end if;
  if retail.fn_puede_operar_ubicacion(p_ubicacion_id) is not true then
    raise exception 'Solo puedes cambiar el precio de tu propia tienda. Pídele al líder el de otra sede.'
      using errcode = '42501';
  end if;
  perform 1 from retail.productos p where p.id = p_producto_id for update;
  if not found then
    raise exception 'Esa prenda no existe.';
  end if;
end;
$fn$;
revoke all on function retail.fn_precio_sede_exigir(uuid, uuid) from public, anon, authenticated;

-- 1. El cambio de precio desde la recepción.
create or replace function retail.cambiar_precio_en_recepcion(
  p_despacho_id uuid, p_producto_id uuid, p_precio numeric, p_alcance text
) returns jsonb
language plpgsql security definer set search_path = retail, public, extensions as $fn$
declare
  v_actor uuid;
  v_despacho retail.despachos;
  v_precio numeric(12,2) := round(p_precio, 2);
  v_envio text;
  v_cubre integer;
  v_costo_max numeric;
  v_cambiadas integer;
begin
  if retail.fn_ve_modulo('recibir') is not true then
    raise exception 'Cambiar el precio desde la recepción necesita el módulo «Recibir mercadería» en tu rol'
      using errcode = '42501', hint = 'recibir_sin_modulo';
  end if;
  if p_alcance is null or p_alcance not in ('todas', 'sede') then
    raise exception 'Elige si el precio vale para todas las sedes o solo para esta' using hint = 'precio_alcance';
  end if;
  -- NaN (que numeric acepta y que Postgres ordena por ENCIMA de todo número) no pasa por «<= 0» ni por el tope: se rechaza aquí.
  if p_precio is null or p_precio = 'NaN'::numeric or v_precio <= 0 or v_precio > 5000 then
    raise exception 'Escribe un precio mayor que cero (hasta S/ 5,000).' using hint = 'precio_invalido';
  end if;

  select d.* into v_despacho from retail.despachos d where d.id = p_despacho_id for share;
  if not found then
    raise exception 'Ese envío no existe' using hint = 'envio_no_existe';
  end if;
  if v_despacho.estado <> 'abierto' then
    raise exception 'El precio se cambia mientras el envío está abierto, antes de cerrarlo' using hint = 'precio_envio_no_abierto';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  perform retail.fn_recepcion_exigir(v_despacho.id, v_despacho.ubicacion_destino_id, v_actor);
  v_envio := retail.fn_envio_numero_texto(v_despacho.numero);

  -- Solo una prenda de ESTE envío (la que se separó al contarlo): esta puerta no es para cambiar el precio de cualquier prenda.
  if not exists (
    select 1
      from retail.despacho_conteos k, jsonb_array_elements(k.separado -> 'prendas') p
     where k.despacho_id = v_despacho.id and p ->> 'producto_id' = p_producto_id::text
  ) then
    raise exception 'Esa prenda no es de este envío' using hint = 'precio_prenda_ajena';
  end if;

  perform 1 from retail.productos pr where pr.id = p_producto_id for update;
  if not found then
    raise exception 'Esa prenda no existe.' using hint = 'precio_prenda_ajena';
  end if;

  if p_alcance = 'sede' then
    -- El precio propio de esta tienda, con todos sus candados (tienda abierta, piso del costo, igual a la grilla = quitarlo, historial).
    perform set_config('retail.precio_desde_recepcion', 'on', true);
    v_cubre := retail.poner_precio_sede(p_producto_id, v_despacho.ubicacion_destino_id, v_precio, 'Recepción ' || v_envio);
    perform set_config('retail.precio_desde_recepcion', 'off', true);
    return jsonb_build_object('alcance', 'sede', 'variantes', v_cubre);
  end if;

  -- El precio general: las tallas activas menos la de obsequio. Nunca bajo el costo de ninguna de ellas (el mensaje no dice cuánto cuesta).
  for v_cubre, v_costo_max in
    select count(*)::integer, max(v.costo)
      from retail.variantes v
      join retail.productos pr on pr.id = v.producto_id
     where v.producto_id = p_producto_id and v.activo
       and not (v.precio = 0 and retail.fn_categoria_admite_precio_cero(pr.categoria_id))
  loop
    exit;
  end loop;
  if coalesce(v_cubre, 0) = 0 then
    raise exception 'Esta prenda no tiene tallas con precio que cambiar' using hint = 'precio_sin_tallas';
  end if;
  if v_costo_max is not null and v_precio < v_costo_max then
    raise exception 'Ese precio queda por debajo de lo que cuesta la prenda. Para liquidar usa una campaña (Catálogo ▸ Atributos ▸ Etiquetas).'
      using hint = 'precio_bajo_costo';
  end if;
  update retail.variantes v
     set precio = v_precio
   where v.producto_id = p_producto_id and v.activo and v.precio is distinct from v_precio
     and not (v.precio = 0 and retail.fn_categoria_admite_precio_cero((select pr.categoria_id from retail.productos pr where pr.id = p_producto_id)));
  get diagnostics v_cambiadas = row_count;
  return jsonb_build_object('alcance', 'todas', 'variantes', v_cambiadas);
end;
$fn$;
revoke all on function retail.cambiar_precio_en_recepcion(uuid, uuid, numeric, text) from public, anon;
grant execute on function retail.cambiar_precio_en_recepcion(uuid, uuid, numeric, text) to authenticated;
