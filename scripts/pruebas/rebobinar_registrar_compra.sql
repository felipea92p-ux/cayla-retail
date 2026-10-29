-- Rebobina `retail.registrar_compra_rapida` al estado de ANTES de 20261029193000 (la versión de ocho parámetros, sin serie ni número), para las pruebas
-- que pegan migraciones viejas de Compras simple en una base que ya trae la nueva (la del CI y la de producción solo tienen la de diez parámetros).
--
-- POR QUÉ. Esas pruebas pegan 20261023005000 / 20261023181000, que crean o recrean `registrar_compra_rapida` de seis y de ocho parámetros. En una base
-- que ya pasó por 20261029193000 la de ocho queda al lado de la de diez, y toda llamada con 6 u 8 argumentos es ambigua («is not unique»). Salida:
-- ANTES de pegar lo viejo se rebobina (este archivo: deja solo la de ocho) y, las pruebas que lo necesitan, pegan DESPUÉS 20261029193000, que la retira.
--
-- Idempotente: sin la de diez parámetros (una base anterior a la migración) no hace nada. El cuerpo es el de la función de ocho parámetros tal como
-- la dejó 20261027231000 (H11), al revés de lo que añade 20261029193000.
do $mig$
begin
  if to_regprocedure('retail.registrar_compra_rapida(uuid,uuid,text,numeric,text,jsonb,numeric,text,text,text)') is null then
    return;
  end if;
  create or replace function retail.registrar_compra_rapida(
    p_id uuid, p_proveedor_id uuid, p_tipo text, p_monto numeric, p_foto_ruta text, p_lineas jsonb,
    p_pagado numeric default null, p_medio text default null
  ) returns jsonb
  language plpgsql security definer set search_path = retail, public, extensions as $f$
declare
  v_pagado numeric := round(p_pagado, 2);
  v_medio text := nullif(lower(btrim(coalesce(p_medio, ''))), '');
  v_monto numeric := round(p_monto, 2);
  v_r jsonb;
begin
  -- Auditoría 2026-10-27 (H11): el mismo candado que abrir y cerrar la ronda; si se está cerrando, esta compra espera y la base le dice «Abre tu ronda».
  if retail.fn_ve_modulo('ordenes_compra') is true then
    perform retail.fn_ronda_compras_candado(retail.fn_actor_persona_id(true));
  end if;
  -- Sin el pago (una pantalla de antes): como siempre, todo pagado en efectivo (lo pone el disparador).
  if p_pagado is null and p_medio is null then
    return retail.fn_registrar_compra_rapida_base(p_id, p_proveedor_id, p_tipo, p_monto, p_foto_ruta, p_lineas);
  end if;
  if v_pagado is null or v_pagado = 'NaN'::numeric or v_pagado < 0 or (v_monto is not null and v_pagado > v_monto) then
    raise exception 'Lo que pagas ahora va de S/ 0 a lo que dice el papel' using errcode = 'P0001', hint = 'compra_rapida_pagado';
  end if;
  if v_pagado <> p_pagado then
    raise exception 'Lo que pagas ahora admite como máximo 2 decimales' using errcode = 'P0001', hint = 'compra_rapida_pagado';
  end if;
  if v_pagado = 0 then
    v_medio := null;
  elsif v_medio is null or v_medio not in ('yape', 'efectivo', 'transferencia') then
    raise exception 'Elige cómo pagaste: Yape, efectivo o transferencia' using errcode = 'P0001', hint = 'compra_rapida_medio';
  end if;

  perform set_config('retail.compra_pago', jsonb_build_object('pagado', v_pagado, 'medio', v_medio)::text, true);
  v_r := retail.fn_registrar_compra_rapida_base(p_id, p_proveedor_id, p_tipo, p_monto, p_foto_ruta, p_lineas);
  perform set_config('retail.compra_pago', '', true);

  -- Un reintento con el mismo identificador devuelve lo que ya quedó: si quedó con otro pago, lo dice (como con otros datos).
  if exists (select 1 from retail.compra_papeles c where c.id = p_id and (c.pagado, c.medio_pago) is distinct from (v_pagado, v_medio)) then
    raise exception 'Esa compra ya se guardó con otros datos: recarga la pantalla' using errcode = 'P0001', hint = 'compra_rapida_otros_datos';
  end if;
  return v_r;
end $f$;
  revoke all on function retail.registrar_compra_rapida(uuid, uuid, text, numeric, text, jsonb, numeric, text) from public, anon;
  grant execute on function retail.registrar_compra_rapida(uuid, uuid, text, numeric, text, jsonb, numeric, text) to authenticated;
  drop function retail.registrar_compra_rapida(uuid, uuid, text, numeric, text, jsonb, numeric, text, text, text);
end
$mig$;
