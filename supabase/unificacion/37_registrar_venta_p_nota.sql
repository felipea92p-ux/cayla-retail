-- ============================================================================
-- 37 — `registrar_venta` vuelve a resolver: `p_nota` recupera su default
-- Correr en cayla-DYNAMIC (SQL Editor). Todo en el cajón `retail`.
--
-- ⚠ ESTO ARREGLA UNA VENTA QUE HOY NO SE PUEDE REGISTRAR EN PRODUCCIÓN.
--
-- QUÉ PASA
--   La firma viva en producción es:
--
--     registrar_venta(p_caja_id uuid, p_metodo_pago text, p_items jsonb,
--                     p_nota text, p_token uuid DEFAULT NULL)
--
--   `p_nota` NO tiene default. Y `RegistrarVentaModal.tsx` llama con tres
--   parámetros nombrados —`p_caja_id`, `p_metodo_pago`, `p_items`— porque en
--   LOCAL la firma sí lo tiene:
--
--     registrar_venta(p_caja_id uuid, p_metodo_pago text, p_items jsonb,
--                     p_nota text DEFAULT NULL)
--
--   PostgREST resuelve la función por los nombres de los argumentos que recibe.
--   Con un parámetro obligatorio que nadie manda, no hay candidata: la llamada
--   falla con «Could not find the function … in the schema cache».
--
--   O sea: **vender por la app está roto en producción**, y no se nota porque
--   todavía nadie vende por ahí — el catálogo real no está cargado. El día que
--   el equipo entre a usarlo, revienta en la primera venta, con la clienta
--   enfrente.
--
-- POR QUÉ PASÓ
--   Alguien agregó `p_token` a mano en producción para hacer la venta
--   idempotente —un arreglo bueno, que el repo no tiene— y al reescribir la
--   firma perdió el `default null` de `p_nota`. Es el costo de parchar sin
--   archivo: nadie revisó la firma resultante contra lo que la app manda.
--
-- QUÉ HACE ESTE ARCHIVO
--   Vuelve a crear la función con EL MISMO CUERPO que ya tiene producción
--   —incluida la idempotencia por `p_token`, que se conserva entera— cambiando
--   solo la firma para devolverle el default a `p_nota`. No se pierde nada.
--
--   Es `create or replace` con los mismos tipos de argumento, así que NO crea
--   sobrecarga (ADR-0009/0026) y no toca ni una fila. Agregar un default está
--   permitido; quitarlo no lo estaría.
--
-- CÓMO COMPROBAR QUE QUEDÓ BIEN — pegar después, no ejecuta nada:
--     explain select retail.registrar_venta(
--       p_caja_id => null::uuid, p_metodo_pago => null::text, p_items => null::jsonb);
--   Antes: «function … does not exist». Después: un plan.
-- ============================================================================

create or replace function retail.registrar_venta(
  p_caja_id uuid,
  p_metodo_pago text,
  p_items jsonb,
  p_nota text default null,          -- ← lo único que cambia
  p_token uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to 'retail', 'public'
as $$
declare
  v_caja retail.cajas%rowtype; v_persona_id uuid; v_venta_id uuid; v_movimiento_id uuid;
  v_monto_total numeric := 0; v_linea_total numeric; v_item jsonb;
  v_existente retail.ventas%rowtype;
begin
  select * into v_caja from retail.cajas where id = p_caja_id;
  if not found then raise exception 'La caja % no existe', p_caja_id; end if;
  if retail.puede_operar_sede(v_caja.sede_id) is not true then
    raise exception 'No tienes permiso para vender en esa sede';
  end if;
  if v_caja.estado <> 'abierta' then raise exception 'Esta caja ya esta cerrada -- no se pueden registrar mas ventas ahi'; end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'El carrito esta vacio'; end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_monto_total := v_monto_total + (v_item ->> 'monto')::numeric * (v_item ->> 'cantidad')::numeric;
  end loop;

  if p_token is not null then
    select * into v_existente from retail.ventas where token_cliente = p_token;
    if found then
      if v_existente.caja_id is distinct from p_caja_id
         or v_existente.metodo_pago is distinct from p_metodo_pago
         or v_existente.monto_total is distinct from v_monto_total then
        raise exception 'Este token ya se uso para una venta con otros datos (caja, metodo de pago o monto no coinciden) -- no se puede reutilizar.';
      end if;
      return v_existente.id;
    end if;
  end if;

  select id into v_persona_id from public.personas where auth_user_id = auth.uid();

  begin
    insert into retail.ventas (sede_id, caja_id, metodo_pago, monto_total, usuario_id, nota, token_cliente)
      values (v_caja.sede_id, p_caja_id, p_metodo_pago, v_monto_total, v_persona_id, p_nota, p_token)
      returning id into v_venta_id;
  exception when unique_violation then
    if p_token is null then raise; end if;
    select * into v_existente from retail.ventas where token_cliente = p_token;
    if not found then raise; end if;
    if v_existente.caja_id is distinct from p_caja_id
       or v_existente.metodo_pago is distinct from p_metodo_pago
       or v_existente.monto_total is distinct from v_monto_total then
      raise exception 'Este token ya se uso para una venta con otros datos (caja, metodo de pago o monto no coinciden) -- no se puede reutilizar.';
    end if;
    return v_existente.id;
  end;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_linea_total := (v_item ->> 'monto')::numeric * (v_item ->> 'cantidad')::numeric;
    insert into retail.movimientos (variante_id, sede_id, tipo, cantidad, motivo, canal, monto, venta_id, usuario_id)
      values ((v_item ->> 'variante_id')::uuid, v_caja.sede_id, 'salida',
              (v_item ->> 'cantidad')::integer, 'venta', 'tienda', v_linea_total, v_venta_id, v_persona_id)
      returning id into v_movimiento_id;
    perform retail.fn_aplicar_movimiento(v_movimiento_id);
  end loop;

  return v_venta_id;
end;
$$;

-- El resumen que SÍ se ve. Debe decir `ok`.
select
  pg_get_function_arguments(p.oid) as firma,
  case when pg_get_function_arguments(p.oid) like '%p_nota text DEFAULT%' then 'ok' else 'REVISAR' end as estado
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'retail' and p.proname = 'registrar_venta';
