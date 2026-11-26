-- ============================================================================
-- 20261121164000 — En Vender, el Yape, el Plin o la transferencia de una prenda de una aliada se anota en el número de su dueña (ADR-0683, actividad 4)
--
-- EL PROBLEMA PRIMERO. La regla de Felipe (ADR-0638, regla 1) es que lo de una aliada por Yape o Plin se le paga a su dueña. Pero al cobrar, el pago se
-- sellaba siempre en la cuenta de CAYLA de ese medio (`fn_cuenta_de_cobro`) y alguien lo movía después con «Corregir pagos»; la pantalla solo decía qué número
-- dar. Con varias aliadas, y con aliadas que cobran por transferencia, eso ya no alcanza.
--
-- QUÉ PROMETE.
--   · La pantalla manda, junto a la venta, a qué cuenta va cada pago de Yape, Plin o transferencia (encabezado `x-cuentas-pagos`:
--     [{"metodo":"yape","monto":59,"cuenta":"<uuid>"}, …]). El disparador que sella la cuenta de cada pago (`fn_venta_pagos_sellar`) la usa: el primer pedido
--     del mismo medio y monto que todavía no se usó. `registrar_venta` no cambia.
--   · Si la cuenta pedida no sirve ahí (no es de una aliada de esa tienda, o no recibe ese medio), el pago se sella como siempre, en la de CAYLA: la venta
--     nunca se cae por esto, y lo que se cobró «mal» se ve y se corrige como hoy (Felipe, 2026-11-21: «se anota lo que pasó»).
--   · Una cuenta de una aliada también recibe transferencias (antes, solo Yape y Plin), para sus cuentas bancarias.
--   · `fn_cuentas_de_aliadas_en_sede`: los números de las aliadas de una tienda, para que la caja los ofrezca.
--
-- QUÉ NO PROMETE. Partir un mismo medio en dos números (la hoja de cobro tiene una línea por medio): un ticket de dos empresas pagado TODO por Yape a dos
-- números se corrige con «Corregir pagos». Una venta sin conexión que se sube después llega sin el encabezado: se sella en CAYLA, como hoy.
--
-- DECIDÍ un encabezado leído por el disparador del pago. DESCARTÉ aceptar la cuenta de Yape en `registrar_venta` (la función más parchada del ERP; doce pruebas
-- fijan su texto) y una columna nueva en el JSON de pagos (cambia el contrato de la venta en línea y sin conexión).
-- SE ROMPE SI dos pagos del mismo medio y monto piden cuentas distintas: se usan en el orden en que llegan, que es el de la hoja.
--
-- CÓMO VERIFICAR. pnpm pruebas:aliadas-cobro
-- CÓMO SE PEGA. Después de 20261121162000. Una sola parte, sin políticas. Se puede pegar dos veces.
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

do $comprueba$
begin
  if position('new.cuenta_dinero_id := retail.fn_cuenta_sellada(''cobro'', new.metodo, v_ubic, retail.fn_hoy_lima(), new.cuenta_dinero_id);' in pg_get_functiondef('retail.fn_venta_pagos_sellar()'::regprocedure)) = 0
     and position('fn_cuenta_pedida_para_pago' in pg_get_functiondef('retail.fn_venta_pagos_sellar()'::regprocedure)) = 0 then
    raise exception 'fn_venta_pagos_sellar no es la esperada (20261016182000): regenera esta migración. No se aplicó nada.';
  end if;
  if position('and not (p_clase = ''cobro'' and p_medio in (''yape'', ''plin'')' in pg_get_functiondef('retail.fn_cuenta_sellada(text, text, uuid, date, uuid)'::regprocedure)) = 0
     and position('''yape'', ''plin'', ''transferencia'')' in pg_get_functiondef('retail.fn_cuenta_sellada(text, text, uuid, date, uuid)'::regprocedure)) = 0 then
    raise exception 'fn_cuenta_sellada no tiene el candado de cuenta ajena esperado (ADR-0638): regenera esta migración. No se aplicó nada.';
  end if;
end
$comprueba$;

-- ---------- 1. La cuenta que la pantalla pidió para un pago ----------
-- El primer pedido de `x-cuentas-pagos` con ese medio y ese monto que no se usó todavía en esta llamada (se anota en `retail.cuentas_pagos_usadas`, local a la
-- transacción). Nulo si no hay pedido, si no se entiende o si ya se usaron todos.
create or replace function retail.fn_cuenta_pedida_para_pago(p_metodo text, p_monto numeric)
returns uuid
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare
  v_lista jsonb;
  v_usadas text := coalesce(current_setting('retail.cuentas_pagos_usadas', true), '');
  v_i int;
  v_x jsonb;
begin
  begin
    v_lista := (nullif(btrim(coalesce(current_setting('request.headers', true), '')), '')::json ->> 'x-cuentas-pagos')::jsonb;
  exception when others then
    return null;
  end;
  if v_lista is null or jsonb_typeof(v_lista) <> 'array' then
    return null;
  end if;
  for v_i in 0 .. jsonb_array_length(v_lista) - 1 loop
    v_x := v_lista -> v_i;
    continue when (',' || v_usadas || ',') like ('%,' || v_i || ',%');
    continue when v_x ->> 'metodo' is distinct from p_metodo;
    continue when (v_x ->> 'monto') !~ '^-?[0-9]+(\.[0-9]+)?$' or abs((v_x ->> 'monto')::numeric - p_monto) >= 0.005;
    continue when coalesce(v_x ->> 'cuenta', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
    perform set_config('retail.cuentas_pagos_usadas', v_usadas || case when v_usadas = '' then '' else ',' end || v_i, true);
    return (v_x ->> 'cuenta')::uuid;
  end loop;
  return null;
end
$$;
revoke all on function retail.fn_cuenta_pedida_para_pago(text, numeric) from public, anon, authenticated;

-- ---------- 2. El sello de cada pago: primero lo pedido, si sirve; si no, lo de siempre ----------
create or replace function retail.fn_venta_pagos_sellar()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $function$
declare
  v_ubic uuid;
  v_pedida uuid;
begin
  if tg_op = 'UPDATE' then
    -- ADR-0429: la única puerta es `fn_resellar_cobros_a_maquinas` (marca local a la transacción); desde una pantalla, nunca.
    if new.cuenta_dinero_id is distinct from old.cuenta_dinero_id and coalesce(current_setting('retail.resellar_cobros', true), '') <> 'si' then
      raise exception 'La cuenta de un cobro se sella al cobrar: no cambia.' using errcode = 'P0001';
    end if;
    return new;
  end if;
  select v.ubicacion_id into v_ubic from retail.ventas v where v.id = new.venta_id;
  -- ADR-0683: el Yape, el Plin o la transferencia que la caja anotó en el número de una dueña. Si esa cuenta no sirve aquí, sigue como siempre.
  if new.cuenta_dinero_id is null and new.metodo in ('yape', 'plin', 'transferencia') then
    v_pedida := retail.fn_cuenta_pedida_para_pago(new.metodo, new.monto);
    if v_pedida is not null then
      begin
        new.cuenta_dinero_id := retail.fn_cuenta_sellada('cobro', new.metodo, v_ubic, retail.fn_hoy_lima(), v_pedida);
        return new;
      exception when others then
        new.cuenta_dinero_id := null;
      end;
    end if;
  end if;
  begin
    new.cuenta_dinero_id := retail.fn_cuenta_sellada('cobro', new.metodo, v_ubic, retail.fn_hoy_lima(), new.cuenta_dinero_id);
  exception when others then
    new.cuenta_dinero_id := null;
  end;
  return new;
end $function$;

-- ---------- 3. Una cuenta de una aliada también recibe transferencias ----------
do $sellada$
declare
  v text := pg_get_functiondef('retail.fn_cuenta_sellada(text, text, uuid, date, uuid)'::regprocedure);
begin
  if position('and not (p_clase = ''cobro'' and p_medio in (''yape'', ''plin'')' in v) > 0 then
    v := replace(v, 'and not (p_clase = ''cobro'' and p_medio in (''yape'', ''plin'')', 'and not (p_clase = ''cobro'' and p_medio in (''yape'', ''plin'', ''transferencia'')');
    v := replace(v, 'aquí solo entra lo cobrado por Yape o Plin en su tienda.', 'aquí solo entra lo cobrado por Yape, Plin o transferencia en su tienda.');
    execute v;
  end if;
end
$sellada$;

-- ---------- 4. Los números de las aliadas de una tienda (lo que ofrece la caja) ----------
create or replace function retail.fn_cuentas_de_aliadas_en_sede(p_ubicacion_id uuid)
returns table(empresa_id uuid, clave text, nombre text, cuenta_id uuid, medio text, numero text)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
begin
  if not retail.fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso sobre esa tienda.' using errcode = '42501';
  end if;
  return query
  select e.id, e.clave, e.nombre, c.id, coalesce(c.medio_ajeno, 'yape'), c.numero
    from retail.empresas e
    join retail.empresa_sedes es on es.empresa_id = e.id and es.ubicacion_id = p_ubicacion_id
    join retail.cuentas_dinero c on c.empresa_id = e.id and c.archivada_en is null
   where e.id <> retail.fn_empresa_casa_id() and e.activo
   order by e.orden, e.nombre, c.created_at;
end
$$;
revoke all on function retail.fn_cuentas_de_aliadas_en_sede(uuid) from public, anon;
grant execute on function retail.fn_cuentas_de_aliadas_en_sede(uuid) to authenticated;

select 'QUEDÓ BIEN' as resultado;
