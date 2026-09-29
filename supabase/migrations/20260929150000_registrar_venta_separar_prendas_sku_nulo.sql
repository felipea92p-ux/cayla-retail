-- Parche vivo (guarda de md5 por ancla) — la caja muestra el error crudo de Postgres en vez de un
-- mensaje en español (auditoría 2026-09-29, hallazgo C3 del carril profundo).
--
-- CAUSA. `registrar_venta` y `separar_prendas` arman el detalle de 13 rechazos distintos pegando
-- `v_sku`, que sale de `select ... v.sku ... into ... v_sku ... from variantes v`. Con la migración
-- 20260929045000 (integrar variantes como matriz) el catálogo nuevo deja de escribir `sku` y usa
-- `codigo`: una variante creada así tiene `sku` NULL. En PL/pgSQL, `raise exception ... using detail =
-- x || y` con `y` NULL hace que el `detail` entero salga NULL, y Postgres aborta ese `raise` con
-- 22004 («RAISE statement option cannot be null») ANTES de mostrar cualquiera de las 15 frases en
-- español que ya existen en `error-escritura.ts`. Es una regresión (BACKLOG lo daba por resuelto para
-- el nombre de la prenda) que hoy no se ve porque producción no tiene ningún producto real todavía —
-- y esta misma noche entra el primer censo cargado por la nueva ruta de `codigo`.
--
-- ARREGLO. Un solo ancla por función, en el SELECT que llena `v_sku` (y en el `string_agg` del
-- comprobante de anticipo): `coalesce(v.codigo, v.sku, 'sin código')`. Nunca vuelve a ser NULL, así
-- que los 13 `raise` no se tocan uno por uno. No toca `entregar_separacion` (su `descripcion` la lee
-- `itemsParaLucode` como línea manual y tomaría un precio con IGV como si fuera sin IGV — fuera de
-- alcance de este parche).
--
-- CÓMO SE PROBÓ. Postgres desechable (todas las migraciones + seed), con una variante `sku=NULL,
-- codigo=NULL`: antes del parche, `venta_precio_cambiado` moría con 22004; después, el `detail` sale
-- «Referencia (sin código)». Ensayo en producción con `raise exception` al final (se revierte solo).
--
-- Huellas ANTES de este parche (verificadas en vivo el 2026-09-29, mismo día):
--   retail.registrar_venta(uuid,jsonb,jsonb,uuid,uuid,text,text,text,text,text,text,uuid,text,numeric,uuid,text)
--     md5(prosrc) = 9525f1bfeb0c0e4bd60201dfb3f0e1aa
--   retail.separar_prendas(uuid,jsonb,jsonb,text,text,text,text,text,text,text,text,text,text,uuid,uuid,text,uuid)
--     md5(prosrc) = 27d5091e7b175d1a7402a9e8401a30e9
-- Si al pegar esto la huella real difiere, la guarda de md5 de abajo aborta el lote entero: revisar
-- antes de reintentar (alguna otra migración recreó la función desde su archivo, ver C1 de la
-- auditoría).

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- Un texto literal como patrón: escapa lo especial y acepta cualquier espacio o salto de línea donde hay espacios.
create or replace function pg_temp.lit(p text) returns text language sql immutable as $f$
  select regexp_replace(regexp_replace(p, '([.^$*+?(){}|\[\]\\])', '\\\1', 'g'), '\s+', '\\s+', 'g');
$f$;

create or replace function pg_temp.reescribir(p_firma text, p_firma_nueva text, p_marca text, p_cambios text[])
returns void language plpgsql as $f$
declare
  v_vieja regprocedure := to_regprocedure(p_firma);
  v_nueva regprocedure := to_regprocedure(coalesce(p_firma_nueva, p_firma));
  v_def text; v_hay integer; v_auth boolean; i integer;
begin
  -- ¿Ya está? (la parte se puede repetir)
  if v_nueva is not null and position(p_marca in pg_get_functiondef(v_nueva)) > 0 then
    if p_firma_nueva is not null and v_vieja is not null then
      execute 'drop function ' || p_firma;
    end if;
    return;
  end if;
  if v_vieja is null then
    raise exception '%: no está en la base. Revisar antes de pegar.', p_firma;
  end if;
  v_def := pg_get_functiondef(v_vieja);
  for i in 1 .. coalesce(array_length(p_cambios, 1), 0) / 2 loop
    select count(*) into v_hay from regexp_matches(v_def, p_cambios[2 * i - 1], 'g');
    if v_hay <> 1 then
      raise exception '%: se esperaba 1 aparición de «%» y hay %. La función cambió en la base: revisar antes de pegar.',
        p_firma, p_cambios[2 * i - 1], v_hay;
    end if;
    v_def := regexp_replace(v_def, p_cambios[2 * i - 1], p_cambios[2 * i]);
  end loop;
  if position(p_marca in v_def) = 0 then
    raise exception '%: el parche no dejó su marca «%».', p_firma, p_marca;
  end if;
  v_auth := has_function_privilege('authenticated', v_vieja, 'execute');
  execute v_def;
  if p_firma_nueva is not null then
    execute 'drop function ' || p_firma;
    execute format('revoke all on function %s from public, anon', p_firma_nueva);
    if v_auth then
      execute format('grant execute on function %s to authenticated', p_firma_nueva);
    else
      execute format('revoke all on function %s from authenticated', p_firma_nueva);
    end if;
  end if;
end $f$;

-- La guarda real es la de `pg_temp.reescribir`: cada ancla exige exactamente 1 aparición en el cuerpo
-- VIVO (nunca en el archivo), y aborta el lote entero si la función cambió desde que se midieron las
-- huellas de arriba. No se duplica ese chequeo aquí (las huellas del encabezado son para el registro).
do $do$
begin
  -- ---- registrar_venta: el SELECT que llena v_sku para los 12 mensajes de rechazo ----
  perform pg_temp.reescribir('retail.registrar_venta(uuid,jsonb,jsonb,uuid,uuid,text,text,text,text,text,text,uuid,text,numeric,uuid,text)', null,
    'sin código', array[
      pg_temp.lit($q$p.referencia, v.sku$q$),
      $q$p.referencia, coalesce(v.codigo, v.sku, 'sin código')$q$
    ]);

  -- ---- separar_prendas: el SELECT que llena v_sku para los 5 mensajes de rechazo ----
  perform pg_temp.reescribir('retail.separar_prendas(uuid,jsonb,jsonb,text,text,text,text,text,text,text,text,text,text,uuid,uuid,text,uuid)', null,
    'sin código', array[
      pg_temp.lit($q$p.referencia, v.sku into v_precio, v_ref, v_sku$q$),
      $q$p.referencia, coalesce(v.codigo, v.sku, 'sin código') into v_precio, v_ref, v_sku$q$,
      pg_temp.lit($q$|| v.sku, ', '$q$),
      $q$|| coalesce(v.codigo, v.sku, 'sin código'), ', '$q$
    ]);
end $do$;
