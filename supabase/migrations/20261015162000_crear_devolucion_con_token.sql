-- ============================================================================
-- 20261015162000_crear_devolucion_con_token.sql — CAYLA V2 · la devolución lleva marca (Felipe 2026-10-15)
--
-- EL PROBLEMA PRIMERO. Chrome reenvía un POST por su cuenta cuando la conexión se corta antes de la respuesta y ya estaba
-- usada (medido el 2026-10-15 en HTTP/1.1 y HTTP/2: `docs/investigacion/2026-10-15-reintento-de-post-cortado.md`). Si solo
-- se corta el primer envío, el reenvío entra bien y la pantalla dice «listo»: la base guardó dos veces y nadie lo ve.
-- `crear_devolucion` no tenía marca: con una línea vendida de 2 o más unidades, el reenvío creaba OTRA devolución pendiente
-- (con 1 unidad, el segundo choca con «quedan 0»). Si un líder aprobaba las dos, la prenda reingresaba dos veces, el reembolso
-- salía dos veces y se iban dos notas de crédito a SUNAT. De las 141 escrituras sin marca, es la única que llega a dinero, stock
-- y SUNAT a la vez.
--
-- LA DECISIÓN. El patrón probado (ADR-0190 y ADR-0398), igual que `registrar_cambio`, su hermana en la misma pantalla:
--   · `devoluciones.token_cliente uuid` con índice único parcial (la última red).
--   · `p_token uuid default null` AL FINAL de `crear_devolucion`.
--   · Antes de crear nada, `fn_intento_con_huella`: el mismo token con OTRO contenido se rechaza (`token_reusado`). Su insert en
--     `intentos_con_token` (clave única) hace que un reenvío que llega mientras la primera todavía guarda ESPERE a que termine.
--   · Si ya hay una devolución con ese token, se devuelve SU id (el mismo resultado, no un error); si no, se crea y queda
--     marcada con el token.
--
-- CONTRATO (Liskov)
--   PROMETE: con un token ya usado y el mismo contenido, devuelve la misma devolución sin escribir nada; con otro contenido,
--            `token_reusado` sin escribir nada; sin token, todo igual que antes (una web vieja sigue funcionando).
--   ASUME:   `fn_intento_con_huella` e `intentos_con_token` (ADR-0398, 20261013200000, en producción); la definición viva de
--            `crear_devolucion` con su `insert into devoluciones (…)` de una sola vez (verificada en local el 2026-10-15; la firma
--            de producción es la misma, `docs/datos/generado/funciones-produccion.txt`).
--   NO HACE: no cambia qué valida la devolución ni sus mensajes; no toca `aprobar_devolucion` ni `rechazar_devolucion`.
--
-- CÓMO. Reemplazo ANCLADO sobre la definición viva (ADR-0288): cada ancla tiene que aparecer exactamente una vez; si no, se
-- detiene sin tocar nada. Con firma nueva, drop + create en la misma transacción (sin sobrecarga, que confundiría a PostgREST)
-- con los mismos permisos y el mismo comentario. Re-pegable: si la función ya trae la marca, no hace nada. Sin `select … into`.
--
-- ORDEN AL PEGAR: ESTA migración primero; recién entonces la web que manda `p_token`. Una web vieja sigue funcionando con esta
-- base (el token es opcional); una web nueva contra una base sin esta migración falla con «Could not find the function».
-- Trae `set search_path`: se pega en el SQL Editor de producción tal cual.
-- ============================================================================
set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- ----------------------------------------------------------------------------
-- La columna y su índice
-- ----------------------------------------------------------------------------
alter table retail.devoluciones add column if not exists token_cliente uuid;
create unique index if not exists devoluciones_token_cliente_key on retail.devoluciones (token_cliente) where token_cliente is not null;
comment on column retail.devoluciones.token_cliente is
  'Id del intento que mandó la pantalla de Devoluciones (uno por devolución que se arma). El mismo token devuelve la misma devolución: un reenvío del navegador o un doble clic no crean otra (20261015162000).';

-- Si la tabla da lectura columna por columna (ADR-0126), la columna nueva nace ilegible: el token no es dinero, se abre igual.
do $$
begin
  if not has_table_privilege('authenticated', 'retail.devoluciones', 'select')
     and exists (select 1 from information_schema.column_privileges
                  where table_schema = 'retail' and table_name = 'devoluciones' and grantee = 'authenticated' and privilege_type = 'SELECT') then
    grant select (token_cliente) on retail.devoluciones to authenticated;
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- La función: parche anclado sobre la definición viva
-- ----------------------------------------------------------------------------
do $$
declare
  f record;
  g record;
  v_def text;
  v_nuevo text;
  v_acl aclitem[];
  v_comentario text;
  v_dueno oid;
  v_firma_nueva text;
  v_ancla text;
  v_veces integer;
  c_marca constant text := $m$fn_intento_con_huella('crear_devolucion'$m$;
  c_fin_parametros constant text := E')\n RETURNS ';
  c_insert_columnas constant text := 'insert into devoluciones (venta_id, ubicacion_id, motivo, motivo_codigo, solicitado_por)';
  c_insert_valores constant text := 'values (p_venta_id, p_ubicacion_id, p_motivo, p_motivo_codigo, v_persona)';
begin
  if (select count(*) from pg_proc where proname = 'crear_devolucion' and pronamespace = 'retail'::regnamespace) <> 1 then
    raise exception 'crear_devolucion: se esperaba exactamente una versión. Revisar antes de pegar.';
  end if;
  select p.oid, p.proacl, p.proowner into f from pg_proc p where p.proname = 'crear_devolucion' and p.pronamespace = 'retail'::regnamespace;
  v_def := pg_get_functiondef(f.oid);

  if position(c_marca in v_def) > 0 then
    raise notice 'crear_devolucion ya tiene su marca: nada que hacer.';
    return;
  end if;
  if position('p_token' in v_def) > 0 then
    raise exception 'crear_devolucion ya menciona p_token sin la marca de esta migración. Revisar su definición antes de pegar.';
  end if;

  -- Cada ancla, exactamente una vez.
  foreach v_ancla in array array[c_fin_parametros, c_insert_columnas, c_insert_valores] loop
    v_veces := (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla);
    if v_veces <> 1 then
      raise exception 'crear_devolucion cambió desde que se escribió esta migración: «%» aparece % veces (se esperaba 1). Regenera el reemplazo desde su definición real.',
        v_ancla, v_veces;
    end if;
  end loop;

  v_nuevo := v_def;
  -- 1. El parámetro nuevo, al final.
  v_nuevo := replace(v_nuevo, c_fin_parametros, E', p_token uuid DEFAULT NULL::uuid)\n RETURNS ');
  -- 2. Antes de crear la devolución: la huella y, si ese token ya guardó, su devolución.
  v_nuevo := replace(v_nuevo, '  ' || c_insert_columnas, $b$  -- La marca (20261015162000): un reenvío del navegador o un doble clic con el mismo token espera al primero y devuelve SU
  -- devolución; el mismo token con otra devolución se rechaza (token_reusado).
  perform retail.fn_intento_con_huella('crear_devolucion', p_token, md5(jsonb_build_array(p_venta_id, p_ubicacion_id, p_items, p_motivo, p_motivo_codigo)::text));
  if p_token is not null then
    for v_devolucion_id in select d.id from devoluciones d where d.token_cliente = p_token loop
      return v_devolucion_id;
    end loop;
  end if;

  $b$ || c_insert_columnas);
  if position(c_marca in v_nuevo) = 0 then
    raise exception 'crear_devolucion: el insert de la devolución no está al principio de su línea («  %»). Regenera el reemplazo desde su definición real.', c_insert_columnas;
  end if;
  -- 3. La devolución queda marcada con su token (el índice único es la última red).
  v_nuevo := replace(v_nuevo, c_insert_columnas, replace(c_insert_columnas, 'solicitado_por)', 'solicitado_por, token_cliente)'));
  v_nuevo := replace(v_nuevo, c_insert_valores, replace(c_insert_valores, 'v_persona)', 'v_persona, p_token)'));

  -- 4. Firma nueva: drop + create, con los mismos permisos y el mismo comentario.
  v_acl := f.proacl;
  v_dueno := f.proowner;
  v_comentario := obj_description(f.oid, 'pg_proc');
  v_firma_nueva := 'retail.crear_devolucion(uuid, uuid, jsonb, text, text, uuid)';
  execute format('drop function %s', f.oid::regprocedure);
  execute v_nuevo;
  execute format('revoke all on function %s from public, anon, authenticated, service_role', v_firma_nueva);
  if v_acl is null then
    execute format('grant execute on function %s to public', v_firma_nueva);
  else
    for g in select distinct a.grantee from aclexplode(v_acl) a where a.privilege_type = 'EXECUTE' and a.grantee <> v_dueno loop
      if g.grantee = 0 then
        execute format('grant execute on function %s to public', v_firma_nueva);
      else
        execute format('grant execute on function %s to %s', v_firma_nueva, g.grantee::regrole);
      end if;
    end loop;
  end if;
  if v_comentario is not null then
    execute format('comment on function %s is %L', v_firma_nueva, v_comentario);
  end if;
  raise notice 'crear_devolucion: ahora recibe p_token.';
end;
$$;

-- PostgREST: que vea ya el parámetro nuevo.
notify pgrst, 'reload schema';
