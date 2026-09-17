-- ============================================================================
-- 20260917150001_revocar_execute_correlativos_y_codigos.sql — CAYLA V2
--
-- Al auditar fn_aplicar_movimiento (20260917150000) se pidió mirar si el
-- mismo patrón — motor security definer, sin auto-chequeo, con EXECUTE
-- público — se repite en otras funciones. Se repite en cuatro, con dos
-- remedios distintos según quién más las necesita llamar directo.
--
-- ---------- 1. fn_reservar_numero_serie / fn_siguiente_correlativo ----------
-- Ambas mutan un contador compartido (series_comprobantes.siguiente_numero,
-- codigos_correlativos.ultimo) y son security definer con EXECUTE abierto a
-- anon Y authenticated (verificado con has_function_privilege, igual que
-- fn_aplicar_movimiento). Consecuencia real si alguien las llama directo sin
-- pasar por emitir_comprobante/emitir_nota: cada llamada quema un número de
-- una serie de boleta/factura SIN emitir nada — un hueco permanente en la
-- numeración correlativa que SUNAT exige sin saltos. fn_siguiente_correlativo
-- es el mismo mecanismo para códigos internos (GEN-0001, etc.): menos grave
-- que un salto SUNAT, pero mismo patrón.
--
-- Confirmado 2026-09-17 contra pg_proc: los únicos llamadores de ambas son
-- emitir_comprobante, emitir_nota y fn_asignar_codigo_producto — los tres
-- security definer. Ningún trigger las invoca (pg_trigger sin filas). Revoke
-- de ambos roles es seguro para los tres llamadores, igual razonamiento que
-- fn_aplicar_movimiento: corren con el privilegio del owner.
--
-- ---------- 2. fn_asignar_codigo_producto / fn_asignar_codigo_variante ----------
-- También security definer, también mutan (asignan `productos.codigo` /
-- `variantes.codigo`, insertan en `codigos_barras`, y de paso queman un
-- correlativo vía fn_siguiente_correlativo). Pero acá NO se puede copiar el
-- revoke completo: `fn_variantes_asignar_codigo` — el trigger AFTER INSERT
-- de `variantes` que las dispara en el flujo normal — no es security
-- definer. Cuando `authenticated` inserta una variante directo por la API
-- de tablas de PostgREST (tiene INSERT en retail.variantes, confirmado en
-- information_schema.role_table_grants), el trigger corre como
-- `authenticated`, no como el owner. Revocarle EXECUTE a `authenticated`
-- rompería ese insert directo con "permission denied for function".
--
-- `anon` en cambio no tiene ningún grant de tabla sobre productos/variantes
-- (cero filas en role_table_grants) — no puede disparar el trigger, así que
-- su único camino a estas dos funciones es la llamada RPC directa.
--
-- OJO: `anon` no aparece nunca como grantee explícito en proacl — su acceso
-- viene entero del grant automático a PUBLIC (`=X/postgres`, confirmado
-- 2026-09-17 leyendo proacl directo). `authenticated` sí tiene su propia
-- entrada separada (`authenticated=X/postgres`, la de 0005_grants.sql). Por
-- eso el remedio no es "revoke ... from anon" — no hay nada que revocarle a
-- anon directamente, sería un no-op idéntico al error que ya se documentó
-- para fn_recalcular_costo_variante. Es "revoke all ... from public": eso
-- apaga la entrada de PUBLIC (el único camino de anon) sin tocar la entrada
-- propia de `authenticated`.
--
-- Nota aparte, ya revisada y sin acción: fn_sububicacion_por_defecto NO es
-- security definer (LANGUAGE sql, STABLE, un solo select) — no bypassa RLS,
-- no aplica el patrón. codigos_correlativos/series_comprobantes tienen GRANT
-- de tabla a authenticated pero RLS habilitado sin policy de UPDATE/INSERT
-- — un intento de escribirlas directo por la API de tablas ya cae en cero
-- filas por su cuenta; no hace falta agregar policy.
--
-- Solo local por ahora — mismo pendiente de autorización de Felipe para
-- producción que 20260917150000.
-- ============================================================================

set search_path = retail, public, extensions;

revoke all on function retail.fn_reservar_numero_serie(uuid, text) from public;
revoke execute on function retail.fn_reservar_numero_serie(uuid, text) from authenticated;

revoke all on function retail.fn_siguiente_correlativo(text) from public;
revoke execute on function retail.fn_siguiente_correlativo(text) from authenticated;

revoke all on function retail.fn_asignar_codigo_producto(uuid) from public;
revoke all on function retail.fn_asignar_codigo_variante(uuid) from public;
