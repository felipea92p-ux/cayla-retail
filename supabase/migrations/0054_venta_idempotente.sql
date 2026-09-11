-- ============================================================================
-- 0054 — La venta se vuelve idempotente en local: `token_cliente` y `p_token`
--
-- ESTA MIGRACIÓN VA AL REVÉS QUE TODAS LAS DEMÁS, y por eso nadie la escribió.
--   Lo normal acá es que el repo vaya adelante y producción atrás. Acá es al
--   revés: **producción YA es idempotente y local no**. Alguien le agregó el
--   token a mano en el SQL Editor —un arreglo bueno— y nunca quedó en un
--   archivo hasta `unificacion/35`, que solo le devolvió el default a `p_nota`.
--   Verificado contra las dos bases el 2026-09-10:
--
--     producción  ventas.token_cliente ✓   ventas_token_cliente_key ✓   5 args
--     local       —                        —                            4 args
--
--   Mientras local no lo tenga, cualquier cosa que se construya encima —la cola
--   de la venta sin internet -- se prueba contra un entorno que no se parece al
--   que va a recibirla.
--
-- QUÉ PROBLEMA RESUELVE HOY, sin esperar a ninguna cola
--   `lib/error-escritura.ts` le dice esto a la Encargada cuando la llamada no
--   llega al servidor:
--
--     «la conexión falló antes de llegar al servidor. No se guardó nada —
--      revisa el internet y vuelve a intentar.»
--
--   **Esa frase es mentira la mitad de las veces.** `Failed to fetch` no
--   distingue entre "no salió" y "salió, entró, y se cortó la respuesta". Si el
--   corte fue de vuelta, la venta YA está registrada, el stock YA se descontó, y
--   el sistema está invitando a repetirla. La red de la tienda corta llamadas a
--   la mitad hoy, sin necesidad de que se caiga el wifi entero.
--
--   Con el token, el reintento con el mismo carrito devuelve la MISMA venta en
--   vez de crear una segunda. La frase deja de ser peligrosa.
--
-- CÓMO FUNCIONA LA GUARDA (el cuerpo se trajo de producción con
-- `pg_get_functiondef`, no se transcribió a ojo — ver BITACORA 2026-09-10)
--   1. Con `p_token` no nulo, primero BUSCA. Si ya hay una venta con ese token
--      y coincide caja, método de pago y monto, devuelve su id y no escribe
--      nada. Ese es el reintento honesto.
--   2. Si coincide el token pero NO los datos, RECHAZA. Es el caso de la
--      Encargada que agrega una prenda al carrito y vuelve a darle a Registrar
--      creyendo que la primera no entró: la primera SÍ entró, y lo correcto es
--      frenarla, no cobrar dos veces. `lib/error-escritura.ts` traduce ese
--      mensaje a idioma CAYLA (ADR-0022).
--   3. El `exception when unique_violation` resuelve la carrera: dos reintentos
--      simultáneos: el que pierde el índice único no revienta, relee y devuelve
--      la venta del que ganó.
--
--   Un `p_token` nulo se comporta EXACTAMENTE como antes. Múltiples NULL están
--   permitidos por el índice único (diseño estándar de Postgres), así que nada
--   de lo que hoy llama sin token cambia de comportamiento.
--
-- POR QUÉ `drop function` Y EN ESE ORDEN (ADR-0026)
--   `create or replace` con un argumento nuevo NO reemplaza: crea una SEGUNDA
--   firma y deja viva la vieja. Con las dos vivas, `RegistrarVentaModal` —que
--   nombra solo los parámetros comunes— deja de resolver: «function … is not
--   unique». Es el bug de `0049`, otra vez. Así que se crea la de 5, se
--   COMPRUEBA que existe, y recién entonces se borra la de 4. El candado es el
--   mismo de `0049`: si la nueva no estuviera, no se borra nada y se avisa.
--
-- LO ÚNICO QUE ESTE ARCHIVO CAMBIA MÁS ALLÁ DEL TOKEN, y va dicho aparte porque
-- no es idempotencia: el candado de permiso pasa de `if not
-- fn_puede_operar_sede(...)` a `if fn_puede_operar_sede(...) is not true`.
--   Si la función devolviera NULL —una sesión sin rol—, `not NULL` tampoco es
--   true, el `raise` no dispara y **el candado se abre solo**. Es el agujero que
--   `36_candados_no_null.sql` cerró en producción y que local todavía tenía en
--   esta función. Se cierra acá porque es la función que este archivo reescribe
--   igual; el barrido del resto queda en el BACKLOG.
--
-- REVERSIBLE: sí, y sin pérdida. Para volver atrás: recrear la firma de 4
-- argumentos con el cuerpo de `0007_finanzas.sql`, borrar la de 5, y
-- `drop index ventas_token_cliente_key` + `alter table ventas drop column
-- token_cliente`. La columna es aditiva y nullable: ninguna fila existente
-- cambia al agregarla.
-- ============================================================================

-- ==================== 1. La columna y su índice ====================
-- Mismos nombres y mismo comentario que producción, a propósito: los dos
-- entornos tienen que verse iguales cuando alguien los compare.
alter table ventas add column if not exists token_cliente uuid;

comment on column ventas.token_cliente is
  'Token generado por el cliente para idempotencia de registrar_venta. NULL valido (multiples NULL permitidos por diseno estandar de Postgres).';

create unique index if not exists ventas_token_cliente_key on ventas using btree (token_cliente);

-- ==================== 2. La firma nueva, con el token ====================
create or replace function registrar_venta(
  p_caja_id uuid,
  p_metodo_pago text,
  p_items jsonb,
  p_nota text default null,
  p_token uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caja cajas%rowtype;
  v_persona_id uuid;
  v_venta_id uuid;
  v_movimiento_id uuid;
  v_monto_total numeric := 0;
  v_linea_total numeric;
  v_item jsonb;
  v_existente ventas%rowtype;
begin
  select * into v_caja from cajas where id = p_caja_id;
  if not found then
    raise exception 'La caja % no existe', p_caja_id;
  end if;
  -- `is not true` y no `not`: con NULL, `not NULL` no es true y el raise no
  -- dispararía — el candado se abriría solo. Ver la cabecera.
  if fn_puede_operar_sede(v_caja.sede_id) is not true then
    raise exception 'No tienes permiso para vender en esa caja';
  end if;
  if v_caja.estado <> 'abierta' then
    raise exception 'Esta caja ya está cerrada — no se pueden registrar más ventas ahí';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'El carrito está vacío';
  end if;

  -- El total se calcula ANTES de mirar el token: es uno de los tres datos con
  -- los que se decide si el reintento es el mismo carrito o uno distinto.
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_monto_total := v_monto_total + (v_item ->> 'monto')::numeric * (v_item ->> 'cantidad')::numeric;
  end loop;

  if p_token is not null then
    select * into v_existente from ventas where token_cliente = p_token;
    if found then
      if v_existente.caja_id is distinct from p_caja_id
         or v_existente.metodo_pago is distinct from p_metodo_pago
         or v_existente.monto_total is distinct from v_monto_total then
        raise exception 'Este token ya se uso para una venta con otros datos (caja, metodo de pago o monto no coinciden) -- no se puede reutilizar.';
      end if;
      return v_existente.id;
    end if;
  end if;

  select id into v_persona_id from personas where auth_user_id = auth.uid();

  begin
    insert into ventas (sede_id, caja_id, metodo_pago, monto_total, usuario_id, nota, token_cliente)
      values (v_caja.sede_id, p_caja_id, p_metodo_pago, v_monto_total, v_persona_id, p_nota, p_token)
      returning id into v_venta_id;
  exception when unique_violation then
    -- La carrera: otro reintento con el mismo token ganó el índice entre el
    -- select de arriba y este insert. No es un error, es la respuesta correcta.
    if p_token is null then raise; end if;
    select * into v_existente from ventas where token_cliente = p_token;
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
    insert into movimientos (variante_id, sede_id, tipo, cantidad, motivo, canal, monto, venta_id, usuario_id)
      values (
        (v_item ->> 'variante_id')::uuid, v_caja.sede_id, 'salida',
        (v_item ->> 'cantidad')::integer, 'venta', 'tienda', v_linea_total, v_venta_id, v_persona_id
      )
      returning id into v_movimiento_id;
    perform fn_aplicar_movimiento(v_movimiento_id);
  end loop;

  return v_venta_id;
end;
$$;

comment on function registrar_venta(uuid, text, jsonb, text, uuid) is
  'Registra una venta y sus movimientos. Idempotente por `p_token`: el mismo token con el mismo carrito devuelve la venta ya registrada en vez de duplicarla; con datos distintos, rechaza. Un `p_token` nulo se comporta como antes de 0054.';

-- ==================== 3. Borrar la firma vieja, con candado ====================
-- Mismo patrón que `0049`: primero se comprueba que la nueva EXISTE. Borrar la
-- única implementación viva para "limpiar duplicados" sería exactamente el
-- estado imposible que prohíbe el principio 2.
--
-- Se pregunta con `to_regprocedure`, que devuelve NULL en vez de reventar
-- cuando la firma no existe. La primera versión de este candado comparaba
-- contra `pg_get_function_identity_arguments`, que devuelve los NOMBRES además
-- de los tipos (`p_caja_id uuid, …`, no `uuid, …`): nunca coincidía, así que
-- avisaba que la firma nueva no existía justo después de crearla. La
-- verificación de más abajo lo atajó — para eso está.
do $$
begin
  if to_regprocedure(current_schema() || '.registrar_venta(uuid, text, jsonb, text, uuid)') is not null then
    drop function if exists registrar_venta(uuid, text, jsonb, text);
    raise notice '0054: borrada la firma vieja de 4 argumentos.';
  else
    raise warning '0054: NO se borró la firma de 4 argumentos — la de 5 no existe en esta base. Revisar antes de seguir.';
  end if;
end $$;

-- Verificación: debe quedar UNA sola firma, la de 5 argumentos.
do $$
declare v_firmas int;
begin
  select count(*) into v_firmas
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = current_schema() and p.proname = 'registrar_venta';

  if v_firmas <> 1 then
    raise exception '0054: quedaron % firmas vivas de registrar_venta, debía quedar 1.', v_firmas;
  end if;
end $$;
