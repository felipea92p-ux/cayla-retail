-- ============================================================================
-- 20261107194000_costo_al_recibir_para_quien_recibe.sql — CAYLA V2 · ADR-0393 (act. 2026-11-07 d)
-- Recibir: el costo sale junto al precio para quien recibe, también en una terminal. ESPERA EL OK DE FELIPE: es un permiso sobre dinero.
--
-- EL PROBLEMA PRIMERO. Felipe, 2026-11-07: «el costo y el precio siempre deben salir juntos, incluso en las cuentas de terminales». En lo que llega sin aviso
-- (y en lo de fuera de la guía de un envío sin aviso), el costo solo lo escribía quien ve el dinero de Compras (`fn_puede_ver_dinero_de_compras`: el líder o
-- un rol con un módulo de Compras). Una terminal veía el precio de venta y lo cambiaba, pero el costo ni aparecía, y si lo mandaba la base lo rechazaba
-- (`recepcion_costo_sin_permiso`). Y el costo de la prenda ya le llegaba igual: `fn_prendas_para_recibir` lo devuelve a quien tiene Recibir.
--
-- QUÉ CAMBIA
--   `fn_puede_poner_costo_al_recibir()` = quien ve el dinero de Compras, O quien tiene el módulo «Recibir mercadería». La usan, en vez de
--   `fn_puede_ver_dinero_de_compras()`, SOLO los cuatro candados del costo de lo que se recibe (`cerrar_conteo_envio` dos veces, `resolver_pendiente_envio`
--   y `llevar_al_stock_ahora`) y `fn_costos_de_hoy` (el costo que ya tiene cada combinación, para decir «antes S/ …»).
--
-- LO QUE NO CAMBIA: el resto del dinero de Compras sigue cerrado para quien no lo ve: facturas, saldos, lo que se le debe a cada proveedor, los totales de
-- Compras y «Corregir proveedor». Una terminal pone el costo de lo que entra; no ve cuánto se le compró a nadie.
--
-- DESCARTÉ
--   · Darle un módulo de Compras al rol de la terminal (Roles y accesos): más rápido, pero le abriría todo el dinero de Compras.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). UNA parte, idempotente, sin políticas ni `drop trigger` (ADR-0195).
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- Un reemplazo anclado cuyo anclaje puede no estar (0 o 1 vez): las suites de prueba rearman estas funciones sin todas las migraciones que las fueron
-- parchando. En producción está una vez; después de pegar se comprueba que ninguna de las cinco siga preguntando por el dinero de Compras.
create or replace function pg_temp.reemplazar_si_esta(p_firma text, p_viejo text, p_nuevo text)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n > 1 then
    raise exception '% cambió: «%» aparece % veces', p_firma, p_viejo, v_n;
  end if;
  if v_n = 1 then
    execute replace(v_def, p_viejo, p_nuevo);
  end if;
end;
$f$;

create or replace function retail.fn_puede_poner_costo_al_recibir()
returns boolean
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select coalesce(retail.fn_puede_ver_dinero_de_compras(), false) or coalesce(retail.fn_ve_modulo('recibir'), false);
$$;
comment on function retail.fn_puede_poner_costo_al_recibir() is
  'ADR-0393 (act. 2026-11-07 d): quien recibe pone el costo de lo que recibe (quien ve el dinero de Compras, o quien tiene «Recibir mercadería»). Solo para el costo de lo que entra; el resto del dinero de Compras sigue con fn_puede_ver_dinero_de_compras.';
revoke all on function retail.fn_puede_poner_costo_al_recibir() from public, anon;
grant execute on function retail.fn_puede_poner_costo_al_recibir() to authenticated, service_role;

select pg_temp.reemplazar_si_esta(
  'retail.cerrar_conteo_envio(uuid,integer,jsonb,text,uuid)',
  $v$      if v_costo is not null and not retail.fn_puede_ver_dinero_de_compras() then$v$,
  $v$      if v_costo is not null and not retail.fn_puede_poner_costo_al_recibir() then$v$);
select pg_temp.reemplazar_si_esta(
  'retail.cerrar_conteo_envio(uuid,integer,jsonb,text,uuid)',
  $v$    if v_cp <> '{}'::jsonb and v_k.despacho_item_id is null and not retail.fn_puede_ver_dinero_de_compras()$v$,
  $v$    if v_cp <> '{}'::jsonb and v_k.despacho_item_id is null and not retail.fn_puede_poner_costo_al_recibir()$v$);
select pg_temp.reemplazar_si_esta(
  'retail.resolver_pendiente_envio(uuid,uuid,integer,uuid,jsonb,boolean,uuid)',
  $v$  if v_cp <> '{}'::jsonb and v_k.despacho_item_id is null and not retail.fn_puede_ver_dinero_de_compras()$v$,
  $v$  if v_cp <> '{}'::jsonb and v_k.despacho_item_id is null and not retail.fn_puede_poner_costo_al_recibir()$v$);
select pg_temp.reemplazar_si_esta(
  'retail.llevar_al_stock_ahora(uuid,uuid,integer,integer,uuid,jsonb,numeric,boolean,uuid)',
  $v$    if v_k.despacho_item_id is null and v_sin_aviso and not retail.fn_puede_ver_dinero_de_compras() then$v$,
  $v$    if v_k.despacho_item_id is null and v_sin_aviso and not retail.fn_puede_poner_costo_al_recibir() then$v$);
select pg_temp.reemplazar_si_esta(
  'retail.fn_costos_de_hoy(uuid[])',
  $v$  if retail.fn_puede_ver_dinero_de_compras() is not true then
    raise exception 'Tu rol no ve el dinero de Compras' using errcode = '42501', hint = 'sin_dinero_de_compras';$v$,
  $v$  if retail.fn_puede_poner_costo_al_recibir() is not true then
    raise exception 'Tu rol no ve el costo de lo que recibe' using errcode = '42501', hint = 'sin_dinero_de_compras';$v$);

reset search_path;
reset lock_timeout;
