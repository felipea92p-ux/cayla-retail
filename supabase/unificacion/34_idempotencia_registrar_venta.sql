-- ============================================================================
-- 34 — `registrar_venta` deja de duplicar una venta si la red se corta
-- Aplicado en producción (cayla-DYNAMIC) el 2026-09-10. Ver ADR-0030.
--
-- QUÉ PROMETE
--   Si la red se corta después de que la venta ya se comiteó pero antes de
--   que la respuesta llegue al navegador, un reintento con el MISMO token
--   (`p_token`, generado por el cliente, uno por carrito) devuelve la venta
--   que ya existe en vez de crear una segunda — sin repetir el descuento de
--   stock. Cubre tanto el reintento normal (secuencial) como una carrera real
--   (dos llamadas casi simultáneas con el mismo token): el índice único en
--   `ventas.token_cliente` garantiza que Postgres, no el código, decide cuál
--   INSERT gana. El candado de sede (`retail.puede_operar_sede(...) is not
--   true`), el chequeo de caja abierta y el de carrito no vacío se evalúan
--   SIEMPRE primero, con o sin token — un token no es un pase que se salte
--   ningún permiso.
--
-- QUÉ ASUME
--   Que `retail.registrar_venta(uuid, text, jsonb, text)` (4 argumentos) es
--   la ÚNICA firma viva en producción hoy — verificado en vivo antes de
--   escribir esto (`select oid::regprocedure from pg_proc where
--   proname='registrar_venta' and pronamespace='retail'::regnamespace`, una
--   sola fila). El `DROP FUNCTION` de abajo asume exactamente esa firma.
--
-- POR QUÉ SE ELIGIÓ ASÍ (tres rondas de revisión adversarial, dos bugs reales
-- encontrados y cerrados antes de llegar a este texto — se documentan
-- porque el patrón se va a repetir en la próxima función que necesite
-- idempotencia, y vale la pena que quien lo lea después no los repita)
--
--   RONDA 1 — DESCARTÉ devolver la venta existente ANTES de validar sede/
--   caja/estado. Por qué se descartó: es un bypass de autorización real —
--   cualquiera con el token (un uuid, no adivinable por fuerza bruta, pero
--   arquitectónicamente un bypass igual) recibía el resultado de una venta
--   ajena sin que se revisara ningún permiso. DECIDÍ: la validación de sede/
--   caja/estado corre siempre, primero, sin excepción — el chequeo de token
--   va DESPUÉS, nunca antes.
--
--   RONDA 2 — DESCARTÉ que solo la rama del `select` previo comparara
--   contexto (caja/método/monto) contra la venta encontrada, dejando la
--   rama `exception when unique_violation` (la que de verdad se dispara en
--   una carrera real) sin esa misma comparación. Por qué importa: es la
--   rama exacta que existe PARA el escenario de carrera, así que dejarla sin
--   el mismo candado que la rama "normal" anula la mitad del propósito del
--   cambio. DECIDÍ: las dos ramas repiten la misma comparación
--   (`is distinct from`, no `<>`, para que un campo nulo nunca deje pasar
--   una comparación sin resolver) y el mismo mensaje de error.
--
--   DESCARTÉ una tabla aparte de "solicitudes procesadas" (ej.
--   `ventas_tokens`) en vez de una columna + índice único en `ventas`.
--   Habría exigido coordinar dos escrituras dentro de la misma transacción
--   a mano — exactamente lo que un índice único evita: que Postgres, no el
--   código, sea quien impide la fila duplicada.
--
--   DESCARTÉ resolver la carrera solo con un `select ... for update` antes
--   del insert. No alcanza: dos transacciones nuevas (sin fila previa que
--   bloquear) pueden pasar el `select` al mismo tiempo y las dos intentar el
--   `insert`. El índice único + captura de `unique_violation` es la única
--   forma correcta de cerrar esa ventana en Postgres.
--
--   SE ROMPE SI: se agrega otra restricción única a `ventas` en el futuro —
--   el `exception when unique_violation` de esta función asume que la única
--   causa posible de ese error (aparte del PK, prácticamente imposible con
--   `gen_random_uuid()`) es el índice de `token_cliente`. Si se agrega otra,
--   hay que revisar ese bloque para no confundir un error real con "ya
--   existe esta venta".
--
-- CÓMO SE REVIERTE
--   1. drop function if exists retail.registrar_venta(uuid, text, jsonb, text, uuid);
--   2. Recrear la función vieja de 4 argumentos (cuerpo en ADR-0030, sección
--      "Original en producción").
--   3. grant execute on function retail.registrar_venta(uuid, text, jsonb, text)
--        to authenticated, service_role;
--   4. drop index if exists retail.ventas_token_cliente_key;
--   5. alter table retail.ventas drop column if exists token_cliente;
--   (Revertir la base primero y el frontend después deja una ventana corta
--   de errores visibles — "function does not exist" — nunca de datos
--   corruptos, si algún día hay que deshacer esto con el frontend ya
--   mandando `p_token`.)
--
-- Verificado en producción tras aplicar, con consulta directa (no solo el
-- bloque de autocomprobación de abajo): firma nueva de 5 argumentos activa,
-- firma vieja de 4 ausente, índice único presente, `authenticated`/
-- `service_role` con EXECUTE y `anon`/`PUBLIC` sin él, y la fila de prueba
-- de la autocomprobación (caja inexistente) no dejó ningún rastro en
-- `ventas` — 0 filas con ese `caja_id` después de aplicar.
-- ============================================================================

alter table retail.ventas add column if not exists token_cliente uuid;

comment on column retail.ventas.token_cliente is
  'Token generado por el cliente (uno por carrito, ver RegistrarVentaModal.tsx) '
  'para idempotencia de retail.registrar_venta. NULL es válido y esperado para '
  'cualquier llamador que no mande token — el índice único de abajo permite '
  'múltiples NULL por diseño estándar de Postgres (cada NULL es distinto de '
  'cualquier otro para efectos de unicidad), no hace falta tratamiento especial.';

create unique index if not exists ventas_token_cliente_key
  on retail.ventas (token_cliente);

comment on index retail.ventas_token_cliente_key is
  'Único índice que impide dos ventas con el mismo token_cliente. Es la pieza '
  'que resuelve la carrera real (dos requests simultáneos, mismo token): '
  'Postgres deja pasar un solo INSERT, el otro recibe unique_violation y lo '
  'captura retail.registrar_venta() para devolver la fila que sí entró — '
  'después de confirmar que es la misma caja/método/monto, no cualquier venta.';

drop function if exists retail.registrar_venta(uuid, text, jsonb, text);

create function retail.registrar_venta(
  p_caja_id uuid,
  p_metodo_pago text,
  p_items jsonb,
  p_nota text,
  p_token uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = retail, public
as $$
declare
  v_caja retail.cajas%rowtype; v_persona_id uuid; v_venta_id uuid; v_movimiento_id uuid;
  v_monto_total numeric := 0; v_linea_total numeric; v_item jsonb;
  v_existente retail.ventas%rowtype;
begin
  -- Validación SIEMPRE primero, con o sin token (ronda 1: nunca antes de esto).
  select * into v_caja from retail.cajas where id = p_caja_id;
  if not found then raise exception 'La caja % no existe', p_caja_id; end if;
  if retail.puede_operar_sede(v_caja.sede_id) is not true then
    raise exception 'No tienes permiso para vender en esa sede';
  end if;
  if v_caja.estado <> 'abierta' then raise exception 'Esta caja ya está cerrada — no se pueden registrar más ventas ahí'; end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'El carrito está vacío'; end if;

  -- Calculado antes del chequeo de token para poder comparar contexto
  -- completo (caja + método + monto) en las dos ramas de idempotencia.
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_monto_total := v_monto_total + (v_item ->> 'monto')::numeric * (v_item ->> 'cantidad')::numeric;
  end loop;

  if p_token is not null then
    select * into v_existente from retail.ventas where token_cliente = p_token;
    if found then
      if v_existente.caja_id is distinct from p_caja_id
         or v_existente.metodo_pago is distinct from p_metodo_pago
         or v_existente.monto_total is distinct from v_monto_total then
        raise exception 'Este token ya se usó para una venta con otros datos (caja, método de pago o monto no coinciden) — no se puede reutilizar.';
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
    -- Ronda 2: la misma comparación de contexto que la rama del `select`
    -- previo, no un `return` a ciegas del que gane la carrera.
    if p_token is null then raise; end if;
    select * into v_existente from retail.ventas where token_cliente = p_token;
    if not found then raise; end if;
    if v_existente.caja_id is distinct from p_caja_id
       or v_existente.metodo_pago is distinct from p_metodo_pago
       or v_existente.monto_total is distinct from v_monto_total then
      raise exception 'Este token ya se usó para una venta con otros datos (caja, método de pago o monto no coinciden) — no se puede reutilizar.';
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

revoke all on function retail.registrar_venta(uuid, text, jsonb, text, uuid) from public;
grant execute on function retail.registrar_venta(uuid, text, jsonb, text, uuid) to authenticated, service_role;

-- Autocomprobación: estructural + una prueba de COMPORTAMIENTO real (no solo
-- texto) — llama la función con una caja inventada y confirma que el
-- rechazo de verdad ocurre. Falla ruidoso y no deja rastro si algo no cuadra
-- (el `begin/exception` del `perform` descarta cualquier efecto parcial).
do $$
declare
  v_existe_vieja boolean; v_indice_ok boolean;
  v_anon_puede boolean; v_auth_puede boolean; v_service_puede boolean;
  v_lanzo_excepcion boolean := false;
begin
  select exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='retail' and p.proname='registrar_venta' and p.pronargs=4) into v_existe_vieja;
  if v_existe_vieja then raise exception 'FALLO: sigue la firma vieja de 4 args'; end if;

  select exists (select 1 from pg_indexes where schemaname='retail' and tablename='ventas'
    and indexdef ilike '%unique%' and indexdef ilike '%token_cliente%') into v_indice_ok;
  if not v_indice_ok then raise exception 'FALLO: falta el índice único de token_cliente'; end if;

  select has_function_privilege('anon','retail.registrar_venta(uuid,text,jsonb,text,uuid)','EXECUTE') into v_anon_puede;
  select has_function_privilege('authenticated','retail.registrar_venta(uuid,text,jsonb,text,uuid)','EXECUTE') into v_auth_puede;
  select has_function_privilege('service_role','retail.registrar_venta(uuid,text,jsonb,text,uuid)','EXECUTE') into v_service_puede;
  if v_anon_puede then raise exception 'FALLO: anon quedó con EXECUTE'; end if;
  if not v_auth_puede or not v_service_puede then raise exception 'FALLO: authenticated/service_role sin EXECUTE'; end if;

  begin
    perform retail.registrar_venta(
      '00000000-0000-0000-0000-000000000000'::uuid, 'efectivo',
      '[{"variante_id":"00000000-0000-0000-0000-000000000000","cantidad":1,"monto":1}]'::jsonb,
      null, gen_random_uuid());
  exception when others then
    v_lanzo_excepcion := true;
  end;
  if not v_lanzo_excepcion then
    raise exception 'FALLO: una caja inexistente no disparó excepción — la validación no está corriendo de verdad';
  end if;

  raise notice 'OK: firma vieja ausente, índice único presente, grants correctos, prueba de comportamiento pasada.';
end $$;
