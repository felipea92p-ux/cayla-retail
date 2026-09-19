-- ============================================================================
-- ADR-0131 — Pagos de Compras: cinco huecos de la base que la auditoría CONFIRMÓ ejecutando en el local.
--
-- EL PROBLEMA. Una auditoría del flujo «pagar a un proveedor» probó, con SQL contra el Postgres local, que
-- la base deja pasar cosas que la pantalla no puede corregir después (son funciones de dinero):
--
--   A1 (alto)  Registrar un comprobante «con IGV incluido» y con el total del papel falla con «no cuadra con
--              sus líneas» aunque el papel esté bien. La pantalla manda el costo unitario SIN IGV redondeado a
--              2 decimales (`compra_items.costo_unitario` es numeric(12,2): no admite más), y ese error de
--              centésimas se MULTIPLICA por la cantidad, pero la tolerancia era fija (0.01 × (líneas + 1)).
--              Fallaban 5 u × S/ 10.00, 10 u × S/ 25.00, 100 u × S/ 12.50 y 100 u × S/ 1.00.
--   A2 (alto)  `registrar_pagos_compra` (el pago desde el detalle del comprobante) no tenía token de
--              idempotencia: dos llamadas iguales registraban dos pagos, y un corte de red DESPUÉS del commit
--              hacía que el reintento pagara dos veces. El lote (`registrar_pago_compras`) sí lo tenía.
--   M1 (medio) El lote validaba `p_credito <= saldo a favor` ANTES de mirar el token. El reintento de un lote
--              que usó saldo a favor fallaba con «el saldo a favor … es S/ 0.00» aunque el pago ya se hizo.
--   M2 (medio) Las tres rutas de pago aceptaban cualquier fecha (2099-01-01; 1990-01-01, antes de que el
--              comprobante existiera). Una fecha imposible ensucia el libro y la conciliación con el banco.
--   M3 (medio) El detalle y el pago inicial de `registrar_compra` redondeaban EN SILENCIO un monto con más de
--              2 decimales (10.005 → 10.01) — la causa es que la variable era numeric(12,2) y el cast redondea
--              antes de cualquier chequeo —, mientras el lote lo rechazaba. Tres rutas, tres criterios.
--
-- DECISIÓN.
--   A1  Se sigue tomando el TOTAL DEL PAPEL como verdad (el proveedor lo emitió; la base no lo discute), pero la
--       tolerancia crece con lo que el redondeo puede explicar de verdad:
--           0.01 × (líneas + 1)  +  0.006 × Σ cantidad
--       0.006 = 0.005 (medio centavo perdido al redondear el costo unitario) × 1.18 (el IGV lo agranda), y se
--       multiplica por las UNIDADES porque el error nace por unidad. Un descuadre real (+ S/ 5, o S/ 0.50 en una
--       sola unidad) sigue rechazado: el candado se afloja lo que el redondeo exige y nada más. Con
--       `p_igv_porcentaje = 0` sigue siendo igualdad exacta (ahí no hay nada que redondear).
--   A2  `registrar_pagos_compra` gana `p_token uuid default null` (nueva firma de 4 parámetros; se hace DROP
--       explícito de la de 3, regla de ADR-0009: `create or replace` con otra lista crearía una SOBRECARGA).
--       Se reutiliza `compra_pagos.pago_grupo_id`, que ya es «el token» del lote y ya tiene su índice parcial
--       `compra_pagos_grupo_idx`: no hace falta columna nueva. NO se pone índice ÚNICO porque un pago con varios
--       medios (o un lote) escribe varias filas con el mismo id; la garantía sale del candado por fila de
--       `compras` (`for update`), que serializa a los dos llamadores, y del chequeo del token DESPUÉS del
--       candado (el segundo espera, ve el pago del primero y devuelve los mismos ids). Sin token todo funciona
--       igual que hoy (`pago_grupo_id` queda NULL). Un token que ya se usó en OTRO comprobante se rechaza.
--   M1  El chequeo del token pasa ANTES de las validaciones que miran el estado de la base (saldo a favor,
--       estado del comprobante, saldo, fecha). Las de forma del pedido (que no dependen de la base) siguen
--       primero. Regla: un reintento con token válido SIEMPRE devuelve el éxito original.
--   M2  Un helper interno, `fn_validar_fecha_pago_compra(fecha, emisión, documento)`, exige
--           fecha ≤ hoy (Lima)   y   fecha ≥ mínimo(emisión del comprobante, hoy)
--       y lo usan las tres rutas (en el lote, contra CADA comprobante; en `registrar_compra`, contra cada
--       línea de pago que traiga fecha). El «mínimo con hoy» es a propósito: si un comprobante se registró con
--       emisión FUTURA (nada lo impide hoy) o `p_fecha_emision` quedó en su valor por defecto `CURRENT_DATE`
--       —que es la fecha UTC y desde las 19:00 de Lima ya es «mañana»—, exigir `fecha ≥ emisión` dejaría al
--       comprobante impagable. Así el piso nunca supera a hoy.
--   M3  Se copia el rechazo del lote, con el mismo mensaje: `monto <> round(monto, 2)` sobre el valor CRUDO
--       (antes de asignarlo a una variable numeric(12,2), que es donde se redondeaba).
--
-- ALTERNATIVAS DESCARTADAS. (A1) Validar cada línea contra su propio redondeo y luego confiar en el papel:
-- exige que la pantalla mande el precio bruto por línea (contrato nuevo) y no cubre facturas cuyo total el
-- proveedor calculó distinto; la tolerancia proporcional es un cambio de una línea, sin cambiar el contrato.
-- (A2) Columna nueva `token_pago` + índice único: no soporta un pago con varios medios y duplica un mecanismo
-- que ya existe. (M2) Solo `fecha ≤ hoy` sin piso: deja pasar 1990.
--
-- SEGURIDAD Y FIRMAS. Las tres funciones conservan `security definer` y `set search_path = retail, public,
-- extensions`. `registrar_compra` y `registrar_pago_compras` conservan su firma exacta (`create or replace`);
-- `registrar_pagos_compra` cambia de firma: se suelta la de 3 y queda UNA de 4. Los permisos: la de 3 tenía
-- EXECUTE también para PUBLIC (`=X`, o sea anon incluido — el líder lo exigía la función por dentro, pero el
-- permiso sobraba); la nueva lo cierra igual que sus hermanas: `revoke … from public, anon` + `grant … to
-- authenticated`. El helper de fecha es interno: sin EXECUTE para nadie (lo llaman funciones del mismo dueño).
-- El chequeo `fn_puede_registrar_compras()` (solo líder, ADR-0126) queda intacto en las tres.
--
-- RIESGO Y ORDEN. Son funciones de dinero: entre el `drop` y el `create` de `registrar_pagos_compra` no puede
-- haber un instante sin función. Esta migración corre en UNA transacción (psql -1 / SQL Editor), así que nadie
-- la ve a medias. `registrar_pago_compra` (la de UN medio) llama a `registrar_pagos_compra` por nombre y con
-- 3 argumentos: sigue resolviendo, ahora contra la de 4 con el token por defecto.
-- Re-ejecutable: `create or replace` / `drop function if exists` / `comment on`. No borra ni modifica datos.
-- Cambios que necesita el cliente: ver ADR-0131 (el detalle debería mandar `p_token`; sin él, todo igual que hoy).
--
-- ESTADO. Aceptada en el Postgres LOCAL. PENDIENTE de aplicar en producción (requiere confirmación de Felipe).
-- Al pegarla en el SQL Editor de producción el `set search_path` inicial ya apunta a `retail`, pero los nombres
-- de arriba llevan `retail.` igual (regla de CLAUDE.md).
-- ============================================================================
set search_path = retail, public, extensions;

-- ---------- 1. helper de fecha de pago (M2) ----------
create or replace function retail.fn_validar_fecha_pago_compra(p_fecha date, p_fecha_emision date, p_documento text)
returns void
language plpgsql
stable
set search_path = retail, public, extensions
as $$
declare
  v_hoy date := retail.fn_hoy_lima();
begin
  if p_fecha is null then
    return;
  end if;
  if p_fecha > v_hoy then
    raise exception 'La fecha del pago (%) no puede ser futura: hoy es %', to_char(p_fecha, 'DD/MM/YYYY'), to_char(v_hoy, 'DD/MM/YYYY');
  end if;
  if p_fecha_emision is not null and p_fecha < least(p_fecha_emision, v_hoy) then
    raise exception 'La fecha del pago (%) es anterior a la emisión del comprobante % (%)', to_char(p_fecha, 'DD/MM/YYYY'), coalesce(p_documento, ''), to_char(p_fecha_emision, 'DD/MM/YYYY');
  end if;
end;
$$;

comment on function retail.fn_validar_fecha_pago_compra(date, date, text) is
  'ADR-0131: la fecha de un pago a proveedor no puede ser futura ni anterior a la emisión del comprobante (el piso nunca supera a hoy). Helper interno de las tres rutas de pago; sin EXECUTE para nadie.';

revoke all on function retail.fn_validar_fecha_pago_compra(date, date, text) from public, anon, authenticated;

-- ---------- 2. registrar_pagos_compra: token (A2), fecha (M2), 2 decimales (M3) ----------
-- Fuera la firma de 3 parámetros: `create or replace` con otra lista crearía una SOBRECARGA (ADR-0009).
drop function if exists retail.registrar_pagos_compra(uuid, jsonb, date);

create or replace function retail.registrar_pagos_compra(p_compra_id uuid, p_pagos jsonb, p_fecha date default null::date, p_token uuid default null::uuid)
 returns uuid[]
 language plpgsql
 security definer
 set search_path to 'retail', 'public', 'extensions'
as $function$
declare
  v_compra compras%rowtype; v_suma numeric(12, 2) := 0;
  v_persona uuid; v_pago jsonb; v_monto numeric; v_id uuid; v_ids uuid[] := '{}';
begin
  if not fn_puede_registrar_compras() then
    raise exception 'No tienes permiso para registrar pagos a proveedores';
  end if;
  if p_pagos is null or jsonb_typeof(p_pagos) <> 'array' or jsonb_array_length(p_pagos) = 0 then
    raise exception 'El pago necesita al menos un medio con su monto';
  end if;

  -- validar cada medio antes de escribir nada
  for v_pago in select * from jsonb_array_elements(p_pagos) loop
    v_monto := (v_pago ->> 'monto')::numeric;
    if v_monto is null or v_monto <= 0 then
      raise exception 'Cada medio de pago necesita un monto mayor a cero';
    end if;
    -- M3: se mira el valor CRUDO; asignarlo a un numeric(12,2) lo redondeaba en silencio (10.005 -> 10.01)
    if v_monto <> round(v_monto, 2) then
      raise exception 'Los montos del pago admiten como máximo 2 decimales (llegó %)', v_monto;
    end if;
    if coalesce(v_pago ->> 'metodo', '') not in ('transferencia', 'yape', 'plin', 'efectivo', 'deposito', 'otro', 'saldo_a_favor') then
      raise exception 'Medio de pago no reconocido: %', coalesce(v_pago ->> 'metodo', '(vacío)');
    end if;
    v_suma := v_suma + v_monto;
  end loop;

  -- bloquea la factura: dos pagos simultáneos no pueden pasarse del saldo
  select * into v_compra from compras where id = p_compra_id for update;
  if not found then
    raise exception 'La compra % no existe', p_compra_id;
  end if;

  -- A2/M1: idempotencia. Va DESPUÉS del candado (dos llamadas simultáneas con el mismo token se serializan: la
  -- segunda ve el pago de la primera) y ANTES de todo lo que mira el estado (anulada, saldo, fecha): un reintento
  -- tras un corte de red devuelve el éxito original aunque el comprobante ya quedara saldado.
  if p_token is not null then
    select coalesce(array_agg(id order by created_at, id), '{}') into v_ids
      from compra_pagos where pago_grupo_id = p_token and compra_id = p_compra_id;
    if cardinality(v_ids) > 0 then
      return v_ids;
    end if;
    if exists (select 1 from compra_pagos where pago_grupo_id = p_token) then
      raise exception 'El identificador de este pago ya se usó en otro comprobante; recarga la pantalla e inténtalo de nuevo';
    end if;
  end if;

  if v_compra.estado = 'anulada' then
    raise exception 'La factura %-% está anulada, no acepta pagos', v_compra.serie, v_compra.numero;
  end if;

  -- el saldo ya descuenta pagos Y notas de crédito
  if v_suma > v_compra.saldo then
    raise exception 'El pago (S/ %) supera el saldo pendiente (S/ %)', v_suma, v_compra.saldo;
  end if;

  -- M2: ni futura ni anterior a la emisión
  perform fn_validar_fecha_pago_compra(p_fecha, v_compra.fecha_emision, v_compra.serie || '-' || v_compra.numero);

  select id into v_persona from personas where auth_user_id = auth.uid();

  for v_pago in select * from jsonb_array_elements(p_pagos) loop
    insert into compra_pagos (compra_id, fecha, monto, metodo, referencia, usuario_id, pago_grupo_id)
      values (p_compra_id, coalesce(p_fecha, fn_hoy_lima()), (v_pago ->> 'monto')::numeric, v_pago ->> 'metodo', nullif(trim(coalesce(v_pago ->> 'referencia', '')), ''), v_persona, p_token)
      returning id into v_id;
    v_ids := v_ids || v_id;
    if v_pago ->> 'metodo' = 'saldo_a_favor' then
      perform fn_consumir_saldo_favor(v_compra.proveedor_id, (v_pago ->> 'monto')::numeric, p_compra_id, v_id, coalesce(p_fecha, fn_hoy_lima()), v_persona);
    end if;
  end loop;

  return v_ids;
end;
$function$;

revoke all on function retail.registrar_pagos_compra(uuid, jsonb, date, uuid) from public, anon;
grant execute on function retail.registrar_pagos_compra(uuid, jsonb, date, uuid) to authenticated;

comment on column retail.compra_pagos.pago_grupo_id is
  'Token de idempotencia de un pago: todas las filas de un mismo envío comparten este id (un pago por lote, registrar_pago_compras, o un pago de un solo comprobante con varios medios, registrar_pagos_compra con p_token). Nulo en pagos sin token. No es único: un envío puede escribir varias filas.';

-- ---------- 3. registrar_pago_compras (lote): token antes del saldo a favor (M1) y fecha (M2) ----------
create or replace function retail.registrar_pago_compras(p_proveedor_id uuid, p_metodo text, p_aplicaciones jsonb, p_referencia text default null::text, p_fecha date default null::date, p_token uuid default null::uuid, p_credito numeric default 0)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'retail', 'public', 'extensions'
as $function$
declare
  v_persona uuid;
  v_grupo uuid;
  v_ref text;
  v_fecha date;
  v_app jsonb;
  v_compra_ids uuid[] := '{}';
  v_montos numeric[] := '{}';
  v_compra_id uuid;
  v_monto numeric;
  v_c compras%rowtype;
  v_i integer;
  v_pago_id uuid;
  v_suma numeric(12, 2) := 0;
  v_credito_restante numeric(12, 2);
  v_credito_i numeric(12, 2);
  v_resto_i numeric(12, 2);
begin
  if not fn_puede_registrar_compras() then
    raise exception 'No tienes permiso para registrar pagos a proveedores';
  end if;

  -- ---- forma del pedido (no depende del estado de la base) ----
  if p_proveedor_id is null then
    raise exception 'El pago necesita el proveedor al que se paga';
  end if;
  if not exists (select 1 from proveedores where id = p_proveedor_id) then
    raise exception 'El proveedor % no existe', p_proveedor_id;
  end if;
  p_credito := coalesce(p_credito, 0);
  if p_credito < 0 or p_credito <> round(p_credito, 2) then
    raise exception 'El saldo a favor a usar debe ser un monto positivo con hasta 2 decimales (llegó %)', p_credito;
  end if;
  if p_aplicaciones is null or jsonb_typeof(p_aplicaciones) <> 'array' or jsonb_array_length(p_aplicaciones) = 0 then
    raise exception 'El pago necesita al menos un comprobante con su monto';
  end if;

  for v_app in select * from jsonb_array_elements(p_aplicaciones) loop
    v_compra_id := (v_app ->> 'compra_id')::uuid;
    v_monto := (v_app ->> 'monto')::numeric;
    if v_compra_id is null or v_monto is null or v_monto <= 0 then
      raise exception 'Cada comprobante del pago necesita su compra_id y un monto mayor a cero';
    end if;
    if v_monto <> round(v_monto, 2) then
      raise exception 'Los montos del pago admiten como máximo 2 decimales (llegó %)', v_monto;
    end if;
    if v_compra_id = any(v_compra_ids) then
      raise exception 'El comprobante % aparece más de una vez en el pago', v_compra_id;
    end if;
    v_compra_ids := v_compra_ids || v_compra_id;
    v_montos := v_montos || v_monto;
    v_suma := v_suma + v_monto;
  end loop;

  -- Cuánto del total se cubre con saldo a favor; el resto, con el medio elegido. (Solo miran el pedido.)
  if p_credito > v_suma then
    raise exception 'El saldo a favor a usar (S/ %) supera el total del pago (S/ %)', p_credito, v_suma;
  end if;
  if p_credito < v_suma and coalesce(p_metodo, '') not in ('transferencia', 'yape', 'plin', 'efectivo', 'deposito', 'otro') then
    raise exception 'Medio de pago no reconocido: %', coalesce(p_metodo, '(vacío)');
  end if;

  v_fecha := coalesce(p_fecha, fn_hoy_lima());
  v_ref := nullif(trim(coalesce(p_referencia, '')), '');
  v_grupo := coalesce(p_token, gen_random_uuid());

  -- ---- candado por comprobante, siempre en el mismo orden ----
  perform 1 from compras where id = any(v_compra_ids) order by id for update;

  -- ---- idempotencia: si este token ya se registró, es un reintento ----
  -- M1: va ANTES de mirar el saldo a favor. Un lote que usó saldo a favor lo dejó en 0; el reintento no puede
  -- fallar por eso, tiene que devolver el éxito original.
  if p_token is not null and exists (select 1 from compra_pagos where pago_grupo_id = p_token) then
    return p_token;
  end if;

  -- ---- validar TODO antes de escribir nada (lo que sí mira el estado de la base) ----
  if p_credito > fn_saldo_favor_proveedor(p_proveedor_id) then
    raise exception 'El saldo a favor con este proveedor es S/ % y se intenta usar S/ %', fn_saldo_favor_proveedor(p_proveedor_id), p_credito;
  end if;

  for v_i in 1 .. array_length(v_compra_ids, 1) loop
    select * into v_c from compras where id = v_compra_ids[v_i];
    if not found then
      raise exception 'La compra % no existe', v_compra_ids[v_i];
    end if;
    if v_c.proveedor_id <> p_proveedor_id then
      raise exception 'Un pago por lote cubre comprobantes de un solo proveedor: %-% es de otro proveedor', v_c.serie, v_c.numero;
    end if;
    if v_c.estado <> 'vigente' then
      raise exception 'El comprobante %-% está anulado, no acepta pagos', v_c.serie, v_c.numero;
    end if;
    if v_c.saldo <= 0 then
      raise exception 'El comprobante %-% no tiene saldo pendiente', v_c.serie, v_c.numero;
    end if;
    if v_montos[v_i] > v_c.saldo then
      raise exception 'El pago (S/ %) al comprobante %-% supera su saldo pendiente (S/ %)', v_montos[v_i], v_c.serie, v_c.numero, v_c.saldo;
    end if;
    -- M2: ni futura ni anterior a la emisión de ESTE comprobante
    perform fn_validar_fecha_pago_compra(v_fecha, v_c.fecha_emision, v_c.serie || '-' || v_c.numero);
  end loop;

  select id into v_persona from personas where auth_user_id = auth.uid();

  -- El saldo a favor se reparte en el orden de los comprobantes del pedido (la pantalla los manda del más
  -- vencido al menos vencido); cada comprobante puede quedar con dos filas: una con saldo a favor y otra con el medio.
  v_credito_restante := p_credito;
  for v_i in 1 .. array_length(v_compra_ids, 1) loop
    v_credito_i := least(v_montos[v_i], v_credito_restante);
    v_resto_i := v_montos[v_i] - v_credito_i;
    v_credito_restante := v_credito_restante - v_credito_i;
    if v_credito_i > 0 then
      insert into compra_pagos (compra_id, fecha, monto, metodo, referencia, usuario_id, pago_grupo_id)
        values (v_compra_ids[v_i], v_fecha, v_credito_i, 'saldo_a_favor', null, v_persona, v_grupo)
        returning id into v_pago_id;
      perform fn_consumir_saldo_favor(p_proveedor_id, v_credito_i, v_compra_ids[v_i], v_pago_id, v_fecha, v_persona);
    end if;
    if v_resto_i > 0 then
      insert into compra_pagos (compra_id, fecha, monto, metodo, referencia, usuario_id, pago_grupo_id)
        values (v_compra_ids[v_i], v_fecha, v_resto_i, p_metodo, v_ref, v_persona, v_grupo);
    end if;
  end loop;

  return v_grupo;
end;
$function$;

revoke all on function retail.registrar_pago_compras(uuid, text, jsonb, text, date, uuid, numeric) from public, anon;
grant execute on function retail.registrar_pago_compras(uuid, text, jsonb, text, date, uuid, numeric) to authenticated;

-- ---------- 4. registrar_compra: tolerancia de redondeo (A1), fecha (M2), 2 decimales (M3) ----------
-- Misma firma de 15 parámetros: `create or replace` la reemplaza (no crea sobrecarga).
create or replace function retail.registrar_compra(p_proveedor_id uuid, p_serie text, p_numero text, p_condicion text, p_ubicacion_destino_id uuid, p_items jsonb, p_tipo text default 'factura'::text, p_fecha_emision date default current_date, p_fecha_vencimiento date default null::date, p_igv_porcentaje numeric default 18, p_pago jsonb default null::jsonb, p_nota text default null::text, p_total numeric default null::numeric, p_token uuid default null::uuid, p_fecha_estimada_llegada date default null::date)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'retail', 'public', 'extensions'
as $function$
declare
  v_compra_id uuid; v_persona uuid; v_item jsonb;
  v_subtotal numeric(12, 2) := 0; v_igv numeric(12, 2); v_total numeric(12, 2);
  v_producto uuid; v_variante uuid;
  v_tolerancia numeric;
  v_unidades numeric := 0;
  v_pago_id uuid;
  v_pagos jsonb; v_pago jsonb; v_monto numeric; v_pago_suma numeric(12, 2) := 0; v_pago_fecha date;
  v_existente compras%rowtype;
  v_constraint text;
begin
  if not fn_puede_registrar_compras() then
    raise exception 'No tienes permiso para registrar compras';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Una factura necesita al menos una línea';
  end if;
  if p_condicion not in ('contado', 'credito') then
    raise exception 'La condición debe ser contado o credito';
  end if;
  if p_condicion = 'credito' and p_fecha_vencimiento is null then
    raise exception 'Una compra al crédito necesita fecha de vencimiento';
  end if;
  if p_condicion = 'contado' and p_pago is null then
    raise exception 'Una compra al contado se registra con su pago';
  end if;

  -- Reintento honesto: el primer envío sí llegó, solo se cortó la respuesta.
  -- Se devuelve la compra que ya existe sin volver a escribir nada.
  if p_token is not null then
    select * into v_existente from compras where token_cliente = p_token;
    if found then return v_existente.id; end if;
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_producto := (v_item ->> 'producto_id')::uuid;
    v_variante := (v_item ->> 'variante_id')::uuid;
    if v_producto is null then
      raise exception 'Cada línea necesita producto_id';
    end if;
    if v_variante is not null and not exists (
      select 1 from variantes where id = v_variante and producto_id = v_producto
    ) then
      raise exception 'La variante % no pertenece al producto %', v_variante, v_producto;
    end if;
    if coalesce((v_item ->> 'cantidad')::integer, 0) <= 0 then
      raise exception 'Cada línea necesita cantidad mayor a cero';
    end if;
    v_subtotal := v_subtotal + (v_item ->> 'cantidad')::integer * (v_item ->> 'costo_unitario')::numeric;
    v_unidades := v_unidades + (v_item ->> 'cantidad')::integer;
  end loop;

  v_igv := round(v_subtotal * coalesce(p_igv_porcentaje, 0) / 100, 2);
  v_total := v_subtotal + v_igv;

  if p_total is not null then
    if p_total < 0 then
      raise exception 'El total no puede ser negativo';
    end if;
    if coalesce(p_igv_porcentaje, 0) = 0 and p_total <> v_subtotal then
      raise exception 'Sin IGV el total tiene que ser igual a la suma de las líneas (S/ %), llegó S/ %', v_subtotal, p_total;
    end if;
    -- A1: el costo unitario llega redondeado a 2 decimales (numeric(12,2)) y ese medio centavo, agrandado por el
    -- IGV (× 1.18 ≈ 0.006), se multiplica por la cantidad. La tolerancia sigue al redondeo: 0.01 por línea (+1
    -- por el IGV y el papel) más 0.006 por unidad. Un descuadre real (S/ 5, o S/ 0.50 en una unidad) sigue fuera.
    v_tolerancia := 0.01 * (jsonb_array_length(p_items) + 1) + 0.006 * v_unidades;
    if abs(p_total - v_total) > v_tolerancia then
      raise exception 'El total del documento (S/ %) no cuadra con sus líneas (S/ %): revisa los costos', p_total, v_total;
    end if;
    v_total := p_total;
    v_igv := p_total - v_subtotal;
  end if;

  if p_pago is not null then
    if jsonb_typeof(p_pago) = 'object' then
      v_pagos := jsonb_build_array(p_pago);
    elsif jsonb_typeof(p_pago) = 'array' and jsonb_array_length(p_pago) > 0 then
      v_pagos := p_pago;
    else
      raise exception 'El pago necesita al menos un medio con su monto';
    end if;
    v_pago_fecha := coalesce((v_pagos -> 0 ->> 'fecha')::date, fn_hoy_lima());
    for v_pago in select * from jsonb_array_elements(v_pagos) loop
      v_monto := (v_pago ->> 'monto')::numeric;
      if v_monto is null or v_monto <= 0 then
        raise exception 'Cada medio de pago necesita un monto mayor a cero';
      end if;
      -- M3: el valor CRUDO; con la variable en numeric(12,2) el cast redondeaba en silencio (10.005 -> 10.01)
      if v_monto <> round(v_monto, 2) then
        raise exception 'Los montos del pago admiten como máximo 2 decimales (llegó %)', v_monto;
      end if;
      if coalesce(v_pago ->> 'metodo', '') not in ('transferencia', 'yape', 'plin', 'efectivo', 'deposito', 'otro', 'saldo_a_favor') then
        raise exception 'Medio de pago no reconocido: %', coalesce(v_pago ->> 'metodo', '(vacío)');
      end if;
      -- M2: cada fecha que llegue no puede ser futura ni anterior a la emisión del comprobante
      perform fn_validar_fecha_pago_compra(
        nullif(v_pago ->> 'fecha', '')::date,
        coalesce(p_fecha_emision, fn_hoy_lima()),
        upper(trim(p_serie)) || '-' || trim(p_numero)
      );
      v_pago_suma := v_pago_suma + v_monto;
    end loop;
    if p_condicion = 'contado' and v_pago_suma <> v_total then
      raise exception 'Al contado el pago debe ser el total de la factura (S/ %), se recibió S/ %', v_total, v_pago_suma;
    end if;
    if v_pago_suma > v_total then
      raise exception 'El pago (S/ %) supera el total de la factura (S/ %)', v_pago_suma, v_total;
    end if;
  end if;

  select id into v_persona from personas where auth_user_id = auth.uid();

  insert into compras (
    proveedor_id, tipo, serie, numero, fecha_emision, condicion, fecha_vencimiento,
    ubicacion_destino_id, subtotal, igv, total, nota, usuario_id, token_cliente, fecha_estimada_llegada
  ) values (
    p_proveedor_id, p_tipo, upper(trim(p_serie)), trim(p_numero), p_fecha_emision, p_condicion,
    case when p_condicion = 'contado' then null else p_fecha_vencimiento end,
    p_ubicacion_destino_id, v_subtotal, v_igv, v_total, p_nota, v_persona, p_token, p_fecha_estimada_llegada
  ) returning id into v_compra_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into compra_items (compra_id, producto_id, variante_id, descripcion, cantidad, costo_unitario)
      values (
        v_compra_id,
        (v_item ->> 'producto_id')::uuid,
        (v_item ->> 'variante_id')::uuid,
        v_item ->> 'descripcion',
        (v_item ->> 'cantidad')::integer,
        (v_item ->> 'costo_unitario')::numeric
      );
  end loop;

  if v_pagos is not null then
    for v_pago in select * from jsonb_array_elements(v_pagos) loop
      insert into compra_pagos (compra_id, fecha, monto, metodo, referencia, usuario_id)
        values (
          v_compra_id,
          v_pago_fecha,
          (v_pago ->> 'monto')::numeric,
          v_pago ->> 'metodo',
          nullif(trim(coalesce(v_pago ->> 'referencia', '')), ''),
          v_persona
        )
        returning id into v_pago_id;
      -- Saldo a favor del proveedor como medio de pago (ADR-0111): descuenta del libro, con candado por proveedor.
      if v_pago ->> 'metodo' = 'saldo_a_favor' then
        perform fn_consumir_saldo_favor(p_proveedor_id, (v_pago ->> 'monto')::numeric, v_compra_id, v_pago_id, v_pago_fecha, v_persona);
      end if;
    end loop;
  end if;

  return v_compra_id;
exception
  when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'compras_token_cliente_key' then
      select * into v_existente from compras where token_cliente = p_token;
      if found then return v_existente.id; end if;
    end if;
    raise exception 'La factura %-% de este proveedor ya está registrada', upper(trim(p_serie)), trim(p_numero);
end;
$function$;

revoke all on function retail.registrar_compra(uuid, text, text, text, uuid, jsonb, text, date, date, numeric, jsonb, text, numeric, uuid, date) from public, anon;
grant execute on function retail.registrar_compra(uuid, text, text, text, uuid, jsonb, text, date, date, numeric, jsonb, text, numeric, uuid, date) to authenticated;
