-- ============================================================================
-- 20260921130000_compras_filtro_por_tienda_destino.sql — CAYLA V2 · ADR-0139 (anexo: filtro «Destino»)
--
-- PROBLEMA. Un comprobante puede traer mercadería para varias tiendas (ADR-0139) y Comprobantes y Por pagar
-- solo se filtraban por proveedor, pago, recepción, condición, tipo y fechas. Una líder que pregunta «¿qué facturas
-- traen algo para Tienda Lima?» no tenía cómo: la lista se pagina en Postgres, así que un filtro en el navegador
-- mostraría solo la página que tiene delante y mentiría.
--
-- QUÉ HACE. Suma un parámetro `p_ubicacion_id uuid default null` (la tienda de destino) a las dos funciones que
-- reciben los filtros de esa lista:
--   1. `listar_compras`   — la lista. Filtra con `compras_resumen.ubicaciones_destino` (las tiendas a las que va
--      alguna línea del comprobante; la misma vista que ya dibuja «Repartida: …»).
--   2. `por_pagar_tramos` — los subtotales de Por pagar (vencidas / esta semana / después). ADR-0111 (H3) manda que
--      un filtro que llega a la lista llegue también a estos subtotales; si no, dejan de cuadrar con las filas.
--      Filtra con un `exists` sobre `compra_item_destinos`: es una función sobre la tabla, sin pasar por la vista.
--
-- «Destino» significa «el comprobante trae mercadería para esa tienda» (aunque también traiga para otras y aunque ya
-- haya llegado). NO parte la deuda por tienda: el saldo del comprobante sigue entero (R-04/R-12: la deuda es de la
-- empresa, no de una tienda). Sin el parámetro (o en null) todo se comporta exactamente como antes.
--
-- CÓMO. Cada función se reescribe sobre su definición VIVA (`pg_get_functiondef`) con dos parches por anclas, y se
-- comprueba que cada ancla aparezca EXACTAMENTE las veces esperadas: si la base cambió por debajo, aborta con un mensaje
-- claro y no cambia nada. Cambiar la lista de parámetros crea otra firma, así que se suelta la vieja y se crea la nueva
-- (nunca dos sobrecargas). Un `create function` nuevo se entrega con EXECUTE a `public`: se cierra a `anon` y solo
-- `authenticated` ejecuta, como antes. Al final se reaplica el candado de dinero (`fn_aplicar_candado_de_dinero`,
-- ADR-0126) y se comprueba que `por_pagar_tramos` lo siga llevando.
--
-- No toca datos ni tablas. Re-pegable: lo ya migrado se salta solo. ORDEN respecto de la web: pegar ANTES de fusionar
-- el PR (la lista sin filtro funciona con o sin esto; elegir una tienda en «Destino» necesita esta migración).
-- Sin prefijo `retail.` (lleva `set search_path`).
-- ============================================================================

set search_path = retail, public, extensions;

-- ==================== 0. Guardas ====================
do $$
begin
  if to_regprocedure('retail.fn_puede_ver_compra(uuid)') is null or to_regclass('retail.compra_item_destinos') is null then
    raise exception 'Falta el reparto por tienda (20260919172000 y 20260919173000): aplícalo antes que esta migración';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'retail' and table_name = 'compras_resumen' and column_name = 'ubicaciones_destino') then
    raise exception 'compras_resumen no tiene ubicaciones_destino: el reparto por tienda no quedó completo';
  end if;
  if to_regprocedure('retail.fn_exige_dinero_de_compras(text)') is null or to_regprocedure('retail.fn_aplicar_candado_de_dinero()') is null then
    raise exception 'Falta el candado de dinero de Compras (ADR-0126): aplícalo antes que esta migración';
  end if;
end $$;

-- Cuántas veces aparece `a` dentro de `t` (para comprobar cada ancla antes de parchear).
create or replace function pg_temp.veces(t text, a text) returns integer language sql immutable as $$
  select (length(t) - length(replace(t, a, ''))) / greatest(length(a), 1)
$$;

-- ==================== 1. listar_compras: la lista ====================
do $$
declare
  v_viejo regprocedure := to_regprocedure('retail.listar_compras(integer,date,timestamp with time zone,uuid,text,text,uuid,text,text,text,boolean,boolean,boolean,boolean,date,date,text)');
  v_nuevo regprocedure := to_regprocedure('retail.listar_compras(integer,date,timestamp with time zone,uuid,text,text,uuid,text,text,text,boolean,boolean,boolean,boolean,date,date,text,uuid)');
  v_firmas integer;
  v_def text;
  v_cab constant text := 'p_tipo text DEFAULT NULL::text)';  -- el último parámetro; sin el RETURNS: `pg_get_functiondef` calla el esquema si `retail` está en el search_path
  v_fin constant text := 'and (p_hasta is null or r.fecha_emision <= p_hasta)';
begin
  if v_nuevo is not null then
    raise notice 'listar_compras ya tiene p_ubicacion_id: se salta';
    return;
  end if;
  select count(*) into v_firmas from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'listar_compras';
  if v_viejo is null or v_firmas <> 1 then
    raise exception 'Esperaba UNA listar_compras con la firma de 17 parámetros y encontré % firma(s): revisa las sobrecargas antes de seguir', v_firmas;
  end if;

  v_def := pg_get_functiondef(v_viejo);
  if pg_temp.veces(v_def, v_cab) <> 1 then
    raise exception 'listar_compras: la cabecera cambió (esperaba encontrar «%» una vez y la encontré % veces)', v_cab, pg_temp.veces(v_def, v_cab);
  end if;
  if pg_temp.veces(v_def, v_fin) <> 2 then
    raise exception 'listar_compras: esperaba el filtro de fecha final en sus DOS ramas (emisión y vencimiento) y lo encontré % veces', pg_temp.veces(v_def, v_fin);
  end if;

  v_def := replace(v_def, v_cab, 'p_tipo text DEFAULT NULL::text, p_ubicacion_id uuid DEFAULT NULL::uuid)');
  v_def := replace(v_def, v_fin, v_fin || E'\n        and (p_ubicacion_id is null or p_ubicacion_id = any(r.ubicaciones_destino))');

  execute format('drop function %s', v_viejo);
  execute v_def;

  revoke all on function retail.listar_compras(integer,date,timestamp with time zone,uuid,text,text,uuid,text,text,text,boolean,boolean,boolean,boolean,date,date,text,uuid) from public, anon;
  grant execute on function retail.listar_compras(integer,date,timestamp with time zone,uuid,text,text,uuid,text,text,text,boolean,boolean,boolean,boolean,date,date,text,uuid) to authenticated;
  comment on function retail.listar_compras(integer,date,timestamp with time zone,uuid,text,text,uuid,text,text,text,boolean,boolean,boolean,boolean,date,date,text,uuid) is
    'Lista de comprobantes con filtros y cursor (todo en Postgres). `p_ubicacion_id` = solo los comprobantes que traen mercadería para esa tienda (ADR-0139, filtro «Destino»); null = todas. Invoker: lee compras_resumen, que respeta la seguridad por fila de compras (el dinero de Compras es solo del líder, ADR-0126).';
end $$;

-- ==================== 2. por_pagar_tramos: los subtotales de Por pagar ====================
do $$
declare
  v_viejo regprocedure := to_regprocedure('retail.por_pagar_tramos(uuid,text,boolean,text,text,date,date)');
  v_nuevo regprocedure := to_regprocedure('retail.por_pagar_tramos(uuid,text,boolean,text,text,date,date,uuid)');
  v_firmas integer;
  v_def text;
  v_cab constant text := 'p_hasta date DEFAULT NULL::date)';  -- el último parámetro (ver la nota de listar_compras)
  v_fin constant text := 'and (p_hasta is null or c.fecha_emision <= p_hasta)';
  v_destino constant text := E'\n        and (p_ubicacion_id is null or exists (\n          select 1 from compra_item_destinos d join compra_items i on i.id = d.compra_item_id\n          where i.compra_id = c.id and d.ubicacion_id = p_ubicacion_id))';
begin
  if v_nuevo is not null then
    raise notice 'por_pagar_tramos ya tiene p_ubicacion_id: se salta';
    return;
  end if;
  select count(*) into v_firmas from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'por_pagar_tramos';
  if v_viejo is null or v_firmas <> 1 then
    raise exception 'Esperaba UNA por_pagar_tramos con la firma de 7 parámetros y encontré % firma(s): revisa las sobrecargas antes de seguir', v_firmas;
  end if;

  v_def := pg_get_functiondef(v_viejo);
  if pg_temp.veces(v_def, v_cab) <> 1 then
    raise exception 'por_pagar_tramos: la cabecera cambió (esperaba encontrar «%» una vez y la encontré % veces)', v_cab, pg_temp.veces(v_def, v_cab);
  end if;
  if pg_temp.veces(v_def, v_fin) <> 1 then
    raise exception 'por_pagar_tramos: esperaba el filtro de fecha final UNA vez y lo encontré % veces', pg_temp.veces(v_def, v_fin);
  end if;
  if v_def not like '%fn_exige_dinero_de_compras%' then
    raise exception 'por_pagar_tramos no lleva el candado de dinero (ADR-0126): reaplícalo antes de seguir (select retail.fn_aplicar_candado_de_dinero())';
  end if;

  v_def := replace(v_def, v_cab, 'p_hasta date DEFAULT NULL::date, p_ubicacion_id uuid DEFAULT NULL::uuid)');
  v_def := replace(v_def, v_fin, v_fin || v_destino);

  execute format('drop function %s', v_viejo);
  execute v_def;

  revoke all on function retail.por_pagar_tramos(uuid,text,boolean,text,text,date,date,uuid) from public, anon;
  grant execute on function retail.por_pagar_tramos(uuid,text,boolean,text,text,date,date,uuid) to authenticated;
  comment on function retail.por_pagar_tramos(uuid,text,boolean,text,text,date,date,uuid) is
    'Subtotal real (toda la deuda filtrada, no la página) de los 3 grupos de Por pagar: vencidas, semana, despues. Mismos filtros que listar_compras (proveedor, condición, solo vencidas, búsqueda, tipo de documento, rango de emisión y tienda de destino). Siempre 3 filas. "Hoy" = fn_hoy_lima(). Acotada por sede. ADR-0111, ADR-0139.';
end $$;

-- ==================== 3. Candado de dinero y autoverificación ====================
select retail.fn_aplicar_candado_de_dinero();

do $$
declare
  v_n integer;
begin
  select count(*) into v_n from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'listar_compras';
  if v_n <> 1 then raise exception 'Autoverificación: listar_compras debe quedar con UNA sola firma y tiene %', v_n; end if;
  select count(*) into v_n from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'por_pagar_tramos';
  if v_n <> 1 then raise exception 'Autoverificación: por_pagar_tramos debe quedar con UNA sola firma y tiene %', v_n; end if;

  if to_regprocedure('retail.listar_compras(integer,date,timestamp with time zone,uuid,text,text,uuid,text,text,text,boolean,boolean,boolean,boolean,date,date,text,uuid)') is null
     or to_regprocedure('retail.por_pagar_tramos(uuid,text,boolean,text,text,date,date,uuid)') is null then
    raise exception 'Autoverificación: alguna de las dos funciones no quedó con p_ubicacion_id';
  end if;
  if pg_get_functiondef('retail.por_pagar_tramos(uuid,text,boolean,text,text,date,date,uuid)'::regprocedure) not like '%fn_exige_dinero_de_compras%' then
    raise exception 'Autoverificación: por_pagar_tramos perdió el candado de dinero (ADR-0126)';
  end if;
  if has_function_privilege('anon', 'retail.listar_compras(integer,date,timestamp with time zone,uuid,text,text,uuid,text,text,text,boolean,boolean,boolean,boolean,date,date,text,uuid)', 'execute')
     or has_function_privilege('anon', 'retail.por_pagar_tramos(uuid,text,boolean,text,text,date,date,uuid)', 'execute') then
    raise exception 'Autoverificación: anon no debe poder ejecutar ninguna de las dos';
  end if;
  if not has_function_privilege('authenticated', 'retail.listar_compras(integer,date,timestamp with time zone,uuid,text,text,uuid,text,text,text,boolean,boolean,boolean,boolean,date,date,text,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'retail.por_pagar_tramos(uuid,text,boolean,text,text,date,date,uuid)', 'execute') then
    raise exception 'Autoverificación: authenticated debe poder ejecutar las dos';
  end if;
end $$;
