-- ============================================================================
-- 20260924130000_concurrencia_orden_y_doble_clic.sql — CAYLA V2 · ADR-0190 (varios usuarios a la vez, etapa 2b)
--
-- EL PROBLEMA PRIMERO. Dos hallazgos de la auditoría de concurrencia del 2026-09-23 (etapa 1: ADR-0188).
--
--   1. DOS VENTAS A LA VEZ SE PODÍAN CANCELAR ENTRE SÍ. Las funciones que mueven varias prendas recorren el carrito EN EL
--      ORDEN EN QUE LLEGA y bloquean el stock fila por fila (`fn_aplicar_movimiento` hace `select … for update`). La caja 1
--      vende [A, B] y la caja 2 vende [B, A] al mismo tiempo: la 1 toma A, la 2 toma B, cada una espera la prenda de la
--      otra y Postgres cancela una de las dos (bloqueo mutuo, 40P01). La clienta de esa caja ve un error y hay que volver a
--      cobrar. Lo mismo con traslados, recepciones, apartados con adelanto y devoluciones.
--   2. UN DOBLE CLIC MOVÍA STOCK O DINERO DOS VECES. `iniciar_traslado`, `recibir_lote`, `registrar_movimiento_caja`,
--      `apartar_stock` y `recibir_insumo` no tenían idempotencia: dos clics en «Enviar traslado» descontaban el stock dos
--      veces; un retiro de caja de S/ 200 quedaba registrado dos veces. Las ventas, cambios, separaciones y envíos ya
--      estaban protegidos con `token_cliente`.
--
-- QUÉ HACE
--   A. `fn_bloquear_en_orden(ubicación, variantes, bloquear_variantes, líneas de compra)`: toma los candados de una
--      operación EN UN ORDEN FIJO, antes de moverse nada — líneas de compra → variantes → stock, cada grupo ordenado por
--      id. Dos operaciones que comparten prendas ya no pueden esperarse en círculo: la segunda espera a la primera
--      ENTERA, sin tener nada tomado. El bucle de cada función no cambia (el orden del carrito sigue siendo el orden de
--      las líneas en la boleta): solo se le antepone esta llamada.
--      `fn_ids_de_items(items, clave)` saca los ids de una lista jsonb (tolera una lista vacía o mal formada: la función
--      que llama da después su propio mensaje).
--   B. Se antepone el pre-bloqueo a: `registrar_venta`, `separar_prendas`, `entregar_separacion`, `aprobar_devolucion`
--      (justo después de leer la caja con `for share`, ADR-0188), y a `iniciar_traslado`, `recibir_lote`,
--      `recibir_compras`, `recibir_envio` (al empezar la función). Las recepciones y la devolución bloquean también la
--      variante (`for no key update`, el mismo candado del costo promedio): así dos recepciones de prendas nuevas en una
--      sede —que crean la fila de stock, y no hay fila que bloquear— también se ordenan. No choca con las ventas.
--   C. Doble clic: `token_cliente uuid` + índice único parcial en `transferencias`, `lotes`, `caja_movimientos`,
--      `apartados` e `insumo_lotes`, y un parámetro nuevo `p_token uuid default null` AL FINAL de
--      `iniciar_traslado`, `recibir_lote`, `registrar_movimiento_caja`, `apartar_stock` y `recibir_insumo`. Con token:
--      la función toma un candado de transacción sobre ese token (`pg_advisory_xact_lock`), y si ya existe una fila con
--      ese token devuelve SU id (el mismo resultado, no un error); si no, hace todo y marca su fila con el token. El
--      segundo clic, que llega mientras el primero aún guarda, espera ese candado y al soltarse encuentra la fila ya
--      guardada. El índice único es la última red. Sin token (llamadas viejas, `separar_prendas` → `apartar_stock`)
--      todo sigue igual.
--
-- CÓMO. Igual que ADR-0188: se PARCHA la definición viva de cada base (`pg_get_functiondef`), no se copian cuerpos (el
-- local y producción difieren). Las anclas son estructurales siempre que se puede: la primera línea `begin` del cuerpo,
-- el cierre de la lista de parámetros, la línea `return <id>;` y la lectura de la caja con `for share` que dejó
-- ADR-0188 (por eso esta migración va DESPUÉS de 20260924110000). Cada ancla tiene que aparecer exactamente una vez; si
-- no, aborta sin cambiar nada. Una función que ya trae la marca «ADR-0190» se da por hecha: re-pegable.
-- Las 5 funciones con parámetro nuevo se recrean (drop + create, en la misma transacción) para no dejar una sobrecarga;
-- se les devuelven exactamente los mismos permisos y el mismo comentario.
--
-- QUÉ NO HACE. No toca datos. No toca `registrar_cambio`, `crear_devolucion`, `conteo_contar` ni `cerrar_conteo` (otra
-- etapa en paralelo; pueden usar `fn_bloquear_en_orden` igual). No cambia ningún mensaje.
--
-- ORDEN AL PEGAR: 20260924110000 (ADR-0188) → ESTA → recién entonces la web que manda `p_token` (una web vieja sigue
-- funcionando con esta base: el token es opcional; una web nueva contra una base sin esta migración falla con
-- «Could not find the function»).
--
-- PARA PEGAR EN PRODUCCIÓN: trae `set search_path`, no hace falta el prefijo `retail.`. Re-pegable.
-- ============================================================================

set search_path = retail, public, extensions;

-- ----------------------------------------------------------------------------
-- A. Los candados en orden
-- ----------------------------------------------------------------------------

create or replace function fn_ids_de_items(p_items jsonb, p_clave text default 'variante_id')
returns uuid[]
language sql
immutable
set search_path = retail, public, extensions
as $$
  select coalesce(array_agg(distinct (e ->> p_clave)::uuid) filter (where nullif(e ->> p_clave, '') is not null), '{}')
  from jsonb_array_elements(case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end) e
  where jsonb_typeof(e) = 'object'
$$;

comment on function fn_ids_de_items(jsonb, text) is
  'ADR-0190: los ids (sin repetir) de la clave p_clave en una lista jsonb de ítems. Lista vacía si no es una lista: la función que llama da su propio mensaje.';

create or replace function fn_bloquear_en_orden(
  p_ubicacion_id uuid,
  p_variantes uuid[],
  p_bloquear_variantes boolean default false,
  p_compra_items uuid[] default null
)
returns void
language plpgsql
set search_path = retail, public, extensions
as $$
begin
  -- EL ORDEN ES EL CONTRATO: líneas de compra → variantes → stock, y dentro de cada grupo por id. Toda función que
  -- mueva varias prendas llama a esto ANTES de su bucle; así nunca dos operaciones se esperan en círculo.
  -- `order by … for update` bloquea las filas en el orden del `order by` (el candado se toma después de ordenar).
  if cardinality(p_compra_items) > 0 then
    perform 1 from compra_items where id = any(p_compra_items) order by id for update;
  end if;
  if p_bloquear_variantes and cardinality(p_variantes) > 0 then
    -- El mismo candado que `fn_recalcular_costo_variante` (ADR-0188): no choca con las ventas.
    perform 1 from variantes where id = any(p_variantes) order by id for no key update;
  end if;
  if p_ubicacion_id is not null and cardinality(p_variantes) > 0 then
    perform 1 from stock
      where ubicacion_id = p_ubicacion_id and variante_id = any(p_variantes)
      order by variante_id, sububicacion_id nulls first
      for update;
  end if;
end;
$$;

comment on function fn_bloquear_en_orden(uuid, uuid[], boolean, uuid[]) is
  'ADR-0190: toma los candados de una operación en orden fijo (líneas de compra → variantes → stock, cada grupo por id) antes de mover nada, para que dos operaciones con las mismas prendas no se bloqueen mutuamente. Solo la llaman otras funciones.';

-- Solo la llaman funciones `security definer` (que corren como su dueño): nadie la invoca directo.
revoke all on function fn_ids_de_items(jsonb, text) from public, anon, authenticated;
revoke all on function fn_bloquear_en_orden(uuid, uuid[], boolean, uuid[]) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- C (tablas). Una columna de token por tabla, única cuando viene
-- ----------------------------------------------------------------------------

alter table transferencias add column if not exists token_cliente uuid;
alter table lotes add column if not exists token_cliente uuid;
alter table caja_movimientos add column if not exists token_cliente uuid;
alter table apartados add column if not exists token_cliente uuid;
alter table insumo_lotes add column if not exists token_cliente uuid;

create unique index if not exists transferencias_token_cliente_key on transferencias (token_cliente) where token_cliente is not null;
create unique index if not exists lotes_token_cliente_key on lotes (token_cliente) where token_cliente is not null;
create unique index if not exists caja_movimientos_token_cliente_key on caja_movimientos (token_cliente) where token_cliente is not null;
create unique index if not exists apartados_token_cliente_key on apartados (token_cliente) where token_cliente is not null;
create unique index if not exists insumo_lotes_token_cliente_key on insumo_lotes (token_cliente) where token_cliente is not null;

comment on column transferencias.token_cliente is 'ADR-0190: id del intento que mandó la pantalla (uno por formulario). El mismo token devuelve el mismo traslado: un doble clic no descuenta dos veces.';
comment on column lotes.token_cliente is 'ADR-0190: id del intento de «Recibir sin factura» (recibir_lote). El mismo token devuelve el mismo lote.';
comment on column caja_movimientos.token_cliente is 'ADR-0190: id del intento de ingreso/egreso de caja. El mismo token devuelve el mismo movimiento: un doble clic no registra dos retiros.';
comment on column apartados.token_cliente is 'ADR-0190: id del intento de apartar. El mismo token devuelve el mismo apartado.';
comment on column insumo_lotes.token_cliente is 'ADR-0190: id del intento de ingresar un lote de insumo. El mismo token devuelve el mismo lote.';

-- ----------------------------------------------------------------------------
-- B y C (funciones). Parche con anclas
-- ----------------------------------------------------------------------------

do $$
declare
  r record;
  f record;
  g record;
  v_def text;
  v_nuevo text;
  v_pos int;
  v_veces int;
  v_acl aclitem[];
  v_comentario text;
  v_dueno oid;
  v_firma_nueva text;
  v_hechas int := 0;
  v_ya int := 0;
  c_marca constant text := 'ADR-0190';
  c_begin constant text := E'\nbegin\n';
begin
  for r in
    select * from (values
      -- (función, dónde va el pre-bloqueo: 'caja' = tras el ancla de caja | 'inicio' = tras el primer `begin`,
      --  ancla de caja, pre-bloqueo, tabla del token (null = sin token), variable que devuelve)
      ('registrar_venta', 'caja',
       'from cajas where ubicacion_id = p_ubicacion_id and estado = ''abierta'' for share;',
       'perform fn_bloquear_en_orden(p_ubicacion_id, fn_ids_de_items(p_items));',
       null, null),
      ('separar_prendas', 'caja',
       'from cajas where ubicacion_id = p_ubicacion_id and estado = ''abierta'' for share;',
       'perform fn_bloquear_en_orden(p_ubicacion_id, fn_ids_de_items(p_items));',
       null, null),
      ('entregar_separacion', 'caja',
       'from cajas where ubicacion_id = s.ubicacion_id and estado = ''abierta'' for share;',
       'perform fn_bloquear_en_orden(s.ubicacion_id, array(select si.variante_id from separacion_items si where si.separacion_id = s.id));',
       null, null),
      ('aprobar_devolucion', 'caja',
       'from cajas where ubicacion_id = d.ubicacion_id and estado = ''abierta'' for share;',
       'perform fn_bloquear_en_orden(d.ubicacion_id, array(select vi.variante_id from devolucion_items di join venta_items vi on vi.id = di.venta_item_id where di.devolucion_id = p_devolucion_id), true);',
       null, null),
      ('recibir_compras', 'inicio', null,
       'perform fn_bloquear_en_orden(p_ubicacion_id, fn_ids_de_items(p_items), true, fn_ids_de_items(p_items, ''compra_item_id''));',
       null, null),
      -- Todo lo que el envío va a tocar en ESTA sede: ítems de comprobante, lo fuera de comprobante y las líneas de los
      -- traslados que se confirman; y las líneas de compra que recibe o cierra.
      ('recibir_envio', 'inicio', null,
       'perform fn_bloquear_en_orden(p_ubicacion_id,
    fn_ids_de_items(
      (case when jsonb_typeof(p_items) = ''array'' then p_items else ''[]''::jsonb end)
      || (case when jsonb_typeof(p_extras) = ''array'' then p_extras else ''[]''::jsonb end)
      || coalesce((select jsonb_agg(l)
                     from jsonb_array_elements(case when jsonb_typeof(p_traslados) = ''array'' then p_traslados else ''[]''::jsonb end) t,
                          jsonb_array_elements(case when jsonb_typeof(t -> ''lineas'') = ''array'' then t -> ''lineas'' else ''[]''::jsonb end) l),
                  ''[]''::jsonb)),
    true,
    fn_ids_de_items(
      (case when jsonb_typeof(p_items) = ''array'' then p_items else ''[]''::jsonb end)
      || (case when jsonb_typeof(p_cierres) = ''array'' then p_cierres else ''[]''::jsonb end),
      ''compra_item_id''));',
       null, null),
      ('iniciar_traslado', 'inicio', null,
       'perform fn_bloquear_en_orden(p_ubicacion_origen_id, fn_ids_de_items(p_items));',
       'transferencias', 'v_transferencia_id'),
      ('recibir_lote', 'inicio', null,
       'perform fn_bloquear_en_orden(p_ubicacion_id, fn_ids_de_items(p_items), true);',
       'lotes', 'v_lote_id'),
      ('registrar_movimiento_caja', 'inicio', null, null, 'caja_movimientos', 'v_id'),
      ('apartar_stock', 'inicio', null, null, 'apartados', 'v_id'),
      ('recibir_insumo', 'inicio', null, null, 'insumo_lotes', 'v_lote_id')
    ) as t(fn, donde, ancla_caja, prebloqueo, tabla_token, var_id)
  loop
    if not exists (select 1 from pg_proc where proname = r.fn and pronamespace = 'retail'::regnamespace) then
      raise exception 'ADR-0190: no existe retail.%', r.fn;
    end if;
    if (select count(*) from pg_proc where proname = r.fn and pronamespace = 'retail'::regnamespace) > 1 then
      raise exception 'ADR-0190: retail.% tiene más de una versión (sobrecarga). Revisar antes de pegar.', r.fn;
    end if;

    select p.oid, p.proacl, p.proowner into f from pg_proc p where p.proname = r.fn and p.pronamespace = 'retail'::regnamespace;
    v_def := pg_get_functiondef(f.oid);

    if position(c_marca in v_def) > 0 then
      v_ya := v_ya + 1;  -- ya parchada (se volvió a pegar)
      continue;
    end if;

    v_nuevo := v_def;

    -- 1. Token: parámetro nuevo al final, bloque de idempotencia al empezar y marca antes de devolver.
    if r.tabla_token is not null then
      if position('p_token' in v_nuevo) > 0 then
        raise exception 'ADR-0190: retail.% ya menciona p_token sin la marca. Revisar su definición antes de pegar.', r.fn;
      end if;
      v_pos := position(E')\n RETURNS ' in v_nuevo);
      if v_pos = 0 then
        raise exception 'ADR-0190: no se encontró el fin de los parámetros de retail.%', r.fn;
      end if;
      v_nuevo := overlay(v_nuevo placing E', p_token uuid DEFAULT NULL::uuid)\n RETURNS ' from v_pos for length(E')\n RETURNS '));

      v_veces := (length(v_nuevo) - length(replace(v_nuevo, '  return ' || r.var_id || ';', ''))) / length('  return ' || r.var_id || ';');
      if v_veces <> 1 then
        raise exception 'ADR-0190: retail.% no tiene la línea «return %;» exactamente una vez (aparece % veces).', r.fn, r.var_id, v_veces;
      end if;
      v_nuevo := replace(v_nuevo, '  return ' || r.var_id || ';',
        format(E'  -- %s: el intento queda marcado con su token (el índice único es la última red).\n'
               '  if p_token is not null then\n'
               '    update %I set token_cliente = p_token where id = %s;\n'
               '  end if;\n'
               '  return %s;', c_marca, r.tabla_token, r.var_id, r.var_id));
    end if;

    -- 2. Lo que va al empezar la función: el bloque del token y/o el pre-bloqueo.
    if r.donde = 'inicio' then
      v_pos := position(c_begin in v_nuevo);
      if v_pos = 0 then
        raise exception 'ADR-0190: no se encontró la línea «begin» de retail.%', r.fn;
      end if;
      v_nuevo := overlay(v_nuevo placing
        c_begin
        || case when r.tabla_token is not null then format(
             E'  -- %s: doble clic. El segundo intento con el mismo token espera al primero y devuelve SU resultado.\n'
             '  if p_token is not null then\n'
             '    perform pg_advisory_xact_lock(hashtextextended(%L || p_token::text, 0));\n'
             '    if exists (select 1 from %I where token_cliente = p_token) then\n'
             '      return (select id from %I where token_cliente = p_token);\n'
             '    end if;\n'
             '  end if;\n', c_marca, r.tabla_token || ':', r.tabla_token, r.tabla_token)
           else '' end
        || case when r.prebloqueo is not null then format(
             E'  -- %s: los candados en orden fijo antes de mover nada (sin bloqueos mutuos entre dos operaciones).\n  %s\n',
             c_marca, r.prebloqueo)
           else '' end
        from v_pos for length(c_begin));
    else
      v_veces := (length(v_nuevo) - length(replace(v_nuevo, r.ancla_caja, ''))) / length(r.ancla_caja);
      if v_veces <> 1 then
        raise exception 'ADR-0190: retail.% no tiene el ancla de caja de ADR-0188 (aparece % veces). ¿Se pegó 20260924110000 antes?', r.fn, v_veces;
      end if;
      v_nuevo := replace(v_nuevo, r.ancla_caja,
        r.ancla_caja || format(E'\n  -- %s: los candados en orden fijo antes de mover nada (sin bloqueos mutuos entre dos operaciones).\n  %s',
                               c_marca, r.prebloqueo));
    end if;

    -- 3. Aplicar. Con firma nueva: drop + create en esta misma transacción (sin sobrecarga), mismos permisos y comentario.
    if r.tabla_token is not null then
      v_acl := f.proacl;
      v_dueno := f.proowner;
      v_comentario := obj_description(f.oid, 'pg_proc');
      v_firma_nueva := format('retail.%I(%s, uuid)', r.fn, oidvectortypes((select proargtypes from pg_proc where oid = f.oid)));
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
            execute format('grant execute on function %s to %s', v_firma_nueva, g.grantee::regrole);  -- regrole ya sale entre comillas si hace falta
          end if;
        end loop;
      end if;
      if v_comentario is not null then
        execute format('comment on function %s is %L', v_firma_nueva, v_comentario);
      end if;
    else
      execute v_nuevo;  -- misma firma: create or replace conserva permisos y comentario
    end if;
    v_hechas := v_hechas + 1;
  end loop;

  raise notice 'ADR-0190: % funciones parchadas, % ya lo estaban', v_hechas, v_ya;
end;
$$;

-- PostgREST: que vea ya los parámetros nuevos.
notify pgrst, 'reload schema';
