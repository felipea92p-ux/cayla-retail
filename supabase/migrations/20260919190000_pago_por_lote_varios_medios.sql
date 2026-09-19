-- ============================================================================
-- Pago por lote con VARIOS MEDIOS de pago — ADR-0132 (Por pagar, «Pagar juntos»).
--
-- EL PROBLEMA. «Pagar juntos» (ADR-0111, D3) paga varios comprobantes de un proveedor en un solo acto, pero
-- `registrar_pago_compras` recibe UN solo `p_metodo`: no se puede pagar 5,000 por transferencia + 3,000 en
-- efectivo. El pago de UN comprobante sí puede repartirse en varios medios (`registrar_pagos_compra`,
-- 20260914200000_compras_multipago). Repartirlo desde la pantalla con varias llamadas a la función vieja no sería
-- todo-o-nada: si la segunda falla, la primera ya pagó.
--
-- DECISIÓN. UNA función nueva, `registrar_pago_compras_medios`, con OTRO NOMBRE (no una sobrecarga de
-- `registrar_pago_compras`: `create or replace` con otra lista de parámetros crea una segunda firma y hace ambigua la
-- llamada — ya pasó con `registrar_compra`, 20260918219000). La función vieja NO se toca: la pantalla sigue
-- llamándola cuando el pago lleva un solo medio, así que desplegar el código antes o después de pegar esta migración no
-- rompe ningún pago de un solo medio. Solo el pago con 2 o más medios necesita esta función.
--
-- CÓMO SE REPARTE. `p_aplicaciones` = cuánto se paga a cada comprobante (la pantalla los manda del más vencido al
-- menos vencido, como siempre). `p_medios` = con qué se paga lo que NO cubre el saldo a favor, en orden. Se recorre
-- comprobante por comprobante gastando los medios EN CASCADA: el primer comprobante consume el primer medio hasta
-- agotarlo, luego el siguiente, y así. Cada fila de `compra_pagos` (una por comprobante y medio) lleva el mismo
-- `pago_grupo_id`: en el estado de cuenta del banco sigue habiendo UNA línea por medio y cada comprobante conserva su
-- historial. Con saldo a favor, primero se consume este (igual que en la función vieja) y los medios cubren el resto.
--
-- REGLAS (todas se validan ANTES de escribir; todo o nada):
--   · Σ medios = Σ aplicaciones − saldo a favor, al centavo. Si el saldo a favor cubre todo, `p_medios` va vacío.
--   · Cada medio: uno de transferencia, yape, plin, efectivo, deposito, otro (el saldo a favor NO es un medio:
--     entra por `p_credito`), monto > 0 con máximo 2 decimales, referencia opcional.
--   · Lo demás es idéntico a `registrar_pago_compras`: solo quien puede registrar compras, un solo proveedor,
--     comprobantes vigentes y con saldo, monto ≤ saldo, candado por comprobante, idempotente por `p_token`.
--
-- No borra nada (es aditiva). Permisos igual que la vieja: solo `authenticated`.
-- Definición de partida: `pg_get_functiondef` de producción (huella e5c51ca9f0a658c45fdbbcd61cc07953), 2026-09-19.
-- ============================================================================
set search_path = retail, public, extensions;

create or replace function retail.registrar_pago_compras_medios(
  p_proveedor_id uuid,
  p_aplicaciones jsonb,
  p_medios jsonb default null,
  p_fecha date default null,
  p_token uuid default null,
  p_credito numeric default 0
)
returns uuid
language plpgsql
security definer
set search_path to 'retail', 'public', 'extensions'
as $function$
declare
  v_persona uuid;
  v_grupo uuid;
  v_fecha date;
  v_app jsonb;
  v_med jsonb;
  v_compra_ids uuid[] := '{}';
  v_montos numeric[] := '{}';
  v_compra_id uuid;
  v_monto numeric;
  v_c compras%rowtype;
  v_i integer;
  v_pago_id uuid;
  v_suma numeric(12, 2) := 0;
  v_por_medios numeric(12, 2);
  v_credito_restante numeric(12, 2);
  v_credito_i numeric(12, 2);
  v_resto_i numeric(12, 2);
  -- los medios, en el orden en que llegaron
  v_med_metodos text[] := '{}';
  v_med_montos numeric[] := '{}';
  v_med_refs text[] := '{}';
  v_med_suma numeric(12, 2) := 0;
  v_metodo text;
  v_ref text;
  v_k integer := 1;
  v_med_restante numeric(12, 2) := 0;
  v_tomar numeric(12, 2);
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

  -- Cuánto del total se cubre con saldo a favor; el resto, con los medios elegidos.
  if p_credito > v_suma then
    raise exception 'El saldo a favor a usar (S/ %) supera el total del pago (S/ %)', p_credito, v_suma;
  end if;
  if p_credito > fn_saldo_favor_proveedor(p_proveedor_id) then
    raise exception 'El saldo a favor con este proveedor es S/ % y se intenta usar S/ %', fn_saldo_favor_proveedor(p_proveedor_id), p_credito;
  end if;
  v_por_medios := v_suma - p_credito;

  -- ---- los medios de pago ----
  if v_por_medios = 0 then
    if p_medios is not null and (jsonb_typeof(p_medios) <> 'array' or jsonb_array_length(p_medios) <> 0) then
      raise exception 'El saldo a favor cubre todo el pago: no lleva medios de pago';
    end if;
  else
    if p_medios is null or jsonb_typeof(p_medios) <> 'array' or jsonb_array_length(p_medios) = 0 then
      raise exception 'El pago necesita al menos un medio de pago para cubrir S/ %', v_por_medios;
    end if;
    if jsonb_array_length(p_medios) > 8 then
      raise exception 'Un pago admite como máximo 8 medios de pago';
    end if;
    for v_med in select * from jsonb_array_elements(p_medios) loop
      if jsonb_typeof(v_med) <> 'object' then
        raise exception 'Cada medio de pago necesita su metodo y su monto';
      end if;
      v_metodo := v_med ->> 'metodo';
      v_monto := (v_med ->> 'monto')::numeric;
      if coalesce(v_metodo, '') not in ('transferencia', 'yape', 'plin', 'efectivo', 'deposito', 'otro') then
        raise exception 'Medio de pago no reconocido: % (el saldo a favor se indica con p_credito, no como medio)', coalesce(v_metodo, '(vacío)');
      end if;
      if v_monto is null or v_monto <= 0 then
        raise exception 'Cada medio de pago necesita un monto mayor a cero';
      end if;
      if v_monto <> round(v_monto, 2) then
        raise exception 'Los montos de los medios admiten como máximo 2 decimales (llegó %)', v_monto;
      end if;
      v_med_metodos := v_med_metodos || v_metodo;
      v_med_montos := v_med_montos || v_monto;
      v_med_refs := v_med_refs || coalesce(nullif(trim(coalesce(v_med ->> 'referencia', '')), ''), '');
      v_med_suma := v_med_suma + v_monto;
    end loop;
    if v_med_suma <> v_por_medios then
      raise exception 'Los medios de pago suman S/ % y hay que cubrir S/ % (el total del pago menos el saldo a favor)', v_med_suma, v_por_medios;
    end if;
    v_med_restante := v_med_montos[1];
  end if;

  v_fecha := coalesce(p_fecha, fn_hoy_lima());
  v_grupo := coalesce(p_token, gen_random_uuid());

  -- ---- candado por comprobante, siempre en el mismo orden ----
  perform 1 from compras where id = any(v_compra_ids) order by id for update;

  -- ---- idempotencia: si este token ya se registró, es un reintento ----
  if p_token is not null and exists (select 1 from compra_pagos where pago_grupo_id = p_token) then
    return p_token;
  end if;

  -- ---- validar TODO antes de escribir nada ----
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
  end loop;

  select id into v_persona from personas where auth_user_id = auth.uid();

  -- El saldo a favor se reparte primero, en el orden de los comprobantes del pedido (la pantalla los manda del más
  -- vencido al menos vencido); lo que resta de cada comprobante se cubre gastando los medios EN CASCADA.
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
    while v_resto_i > 0 loop
      -- Con los totales validados arriba nunca se acaban los medios antes que los comprobantes; si pasara, es un error de la
      -- función y se aborta todo (mejor que dejar un pago a medias).
      if v_k > coalesce(array_length(v_med_montos, 1), 0) then
        raise exception 'Reparto inconsistente: se acabaron los medios de pago antes de cubrir el comprobante %', v_compra_ids[v_i];
      end if;
      v_tomar := least(v_resto_i, v_med_restante);
      insert into compra_pagos (compra_id, fecha, monto, metodo, referencia, usuario_id, pago_grupo_id)
        values (v_compra_ids[v_i], v_fecha, v_tomar, v_med_metodos[v_k], nullif(v_med_refs[v_k], ''), v_persona, v_grupo);
      v_resto_i := v_resto_i - v_tomar;
      v_med_restante := v_med_restante - v_tomar;
      if v_med_restante = 0 and v_k < array_length(v_med_montos, 1) then
        v_k := v_k + 1;
        v_med_restante := v_med_montos[v_k];
      end if;
    end loop;
  end loop;

  return v_grupo;
end;
$function$;

comment on function retail.registrar_pago_compras_medios(uuid, jsonb, jsonb, date, uuid, numeric) is
  'Pago por lote con VARIOS medios (ADR-0132): reparte p_medios en cascada entre los comprobantes de p_aplicaciones (uno solo proveedor), todo o nada, idempotente por p_token. Saldo a favor por p_credito, no como medio. Con un solo medio se sigue usando registrar_pago_compras.';

-- Mismos permisos que `registrar_pago_compras` en producción: solo `authenticated` (y el dueño).
revoke all on function retail.registrar_pago_compras_medios(uuid, jsonb, jsonb, date, uuid, numeric) from public, anon;
grant execute on function retail.registrar_pago_compras_medios(uuid, jsonb, jsonb, date, uuid, numeric) to authenticated;
