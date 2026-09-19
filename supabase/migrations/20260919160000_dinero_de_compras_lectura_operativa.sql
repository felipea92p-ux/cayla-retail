-- ============================================================================
-- ADR-0126 (parte A de 2) — El dinero de Compras es solo del líder: candado + lectura operativa.
--
-- POR QUÉ. Desde ADR-0075 un integrante lee las compras de SU sede (lo necesita para recibir), y esa
-- lectura incluía los montos: deuda, IGV, pagos, costo por línea. Las pruebas SQL de Compras (PR #165,
-- hallazgo H4) lo dejaron como decisión pendiente; Felipe decidió el 2026-09-19 que se cierra.
-- Cerrar solo las funciones de resumen no serviría —el integrante leería lo mismo directo de las
-- tablas—, así que el cierre son DOS migraciones y esta es la primera:
--
--   A (este archivo)  → es ADITIVA: nada deja de funcionar para nadie al pegarla.
--     1. `fn_puede_ver_dinero_de_compras()` y `fn_exige_dinero_de_compras(...)`: la regla, en UN lugar.
--        Hoy es «solo el líder» (igual que `fn_puede_registrar_compras`); si un día una contadora ve
--        el dinero sin registrar compras, se cambia acá y no en veinte funciones.
--     2. `fn_aplicar_candado_de_dinero()`: le pone el candado a las 5 funciones que devolvían dinero
--        con solo el candado de sede —resumen_compras, resumen_compras_extra, deuda_por_vencimiento,
--        salidas_caja_30d y por_pagar_tramos— y se llama una vez acá. Para un integrante esas funciones
--        pasan a fallar con «Solo un líder puede ver …» (42501). Ninguna pantalla que un integrante abre
--        las llama (todas viven bajo /compras, solo-líder; /recibir las pide solo si `esLider`).
--     3. `recepciones_sin_comprobante`: el costo promedio sale NULL para quien no es líder.
--     4. `listar_compras_operativo` y `lineas_compra_operativo`: lo que un integrante necesita para
--        recibir —qué comprobantes vienen a su sede, de quién, cuántas prendas, cuánto falta— SIN un
--        solo monto. Es una lista de PERMITIDOS (devuelve solo esas columnas), no una de tapados:
--        si Compras agrega mañana otra columna de dinero, queda cerrada por omisión.
--   B (20260919161000) → cierra las tablas y el bucket de escaneos. Se pega DESPUÉS de esta y DESPUÉS
--        de desplegar la app (ver su encabezado).
--
-- POR QUÉ EL CANDADO SE INYECTA EN VEZ DE COPIAR LOS CUERPOS. Estas funciones las tocan otras
-- migraciones en vuelo (la de los hallazgos H1/H2/H3/H5 de Compras, por ejemplo, suelta y recrea
-- `por_pagar_tramos` con otra firma) y en producción se pegan a mano en el orden que toque. Copiar aquí
-- un cuerpo pisaría la versión más nueva o crearía una SOBRECARGA sin candado. Así que esta migración lee
-- la definición que tenga CADA base (`pg_get_functiondef`), le agrega UNA línea al principio del cuerpo y
-- la vuelve a crear con la MISMA firma, sea cual sea. Y como otra migración puede recrear una de las cinco
-- sin el candado, la rutina se puede volver a correr cuando se quiera —es idempotente— y devuelve qué
-- tuvo que arreglar:      select retail.fn_aplicar_candado_de_dinero();       -- {} = todo estaba bien
-- Conviene correrla después de pegar cualquier migración de Compras.
--
-- QUÉ NO ES DINERO. Los estados (pagada/pendiente, vencida, condición, vencimiento) no son montos:
-- los sigue leyendo quien opera la sede en `compras_resumen`. Si Felipe quiere esconderlos también,
-- es sacar columnas de las dos funciones operativas — sin tocar nada más.
--
-- CÓMO SE VERIFICÓ. `pnpm pruebas:dinero-compras` (contra el Postgres local, transacciones con
-- rollback; `--en-seco` carga las dos migraciones sin aplicarlas) y las suites de Compras
-- (`pruebas:compras-indicadores`, `pruebas:compras-faltantes`).
--
-- PARA PEGAR EN PRODUCCIÓN: ya trae `set search_path`; no hace falta el prefijo `retail.`.
-- ============================================================================

set search_path = retail, public, extensions;

-- ----------------------------------------------------------------------------
-- 1. La regla, en un solo lugar
-- ----------------------------------------------------------------------------

create or replace function retail.fn_puede_ver_dinero_de_compras()
returns boolean
language sql
stable
set search_path = retail, public, extensions
as $$ select retail.fn_puede_registrar_compras(); $$;

comment on function retail.fn_puede_ver_dinero_de_compras() is
  'ADR-0126. ¿Puede quien consulta ver montos de Compras (totales, deuda, pagos, costos, cuentas)? Hoy: solo el líder. Toda política y función que muestre dinero de Compras usa ESTA, no `fn_puede_operar_ubicacion` (que solo dice «de mi sede»).';

create or replace function retail.fn_exige_dinero_de_compras(p_que text default 'los montos de Compras')
returns void
language plpgsql
stable
set search_path = retail, public, extensions
as $$
begin
  if not coalesce(retail.fn_puede_ver_dinero_de_compras(), false) then
    raise exception 'Solo un líder puede ver %.', p_que using errcode = '42501';
  end if;
end;
$$;

comment on function retail.fn_exige_dinero_de_compras(text) is
  'ADR-0126. Primera línea de toda función que devuelve dinero de Compras: si quien llama no es líder, aborta con 42501 «Solo un líder puede ver <p_que>.» antes de leer nada.';

revoke all on function retail.fn_puede_ver_dinero_de_compras() from public, anon;
grant execute on function retail.fn_puede_ver_dinero_de_compras() to authenticated;
revoke all on function retail.fn_exige_dinero_de_compras(text) from public, anon;
grant execute on function retail.fn_exige_dinero_de_compras(text) to authenticated;

-- ----------------------------------------------------------------------------
-- 2. El candado en las 5 funciones de dinero — inyectado, idempotente, vuelve a correrse
-- ----------------------------------------------------------------------------
-- Recorre TODAS las firmas que existan de esas cinco (si hay dos, las guarda las dos) y a cada una que
-- todavía no lleve el candado le pone su llamada como PRIMERA instrucción del cuerpo. Devuelve las firmas
-- que arregló. Ejecuta DDL: por eso NO es `security definer` y NO se le da execute a authenticated —
-- solo la puede correr quien es dueño de las funciones (el SQL Editor / las migraciones).

create or replace function retail.fn_aplicar_candado_de_dinero()
returns text[]
language plpgsql
set search_path = retail, public, extensions
as $$
declare
  f record;
  v_def text;
  v_nuevo text;
  v_que text;
  v_arregladas text[] := '{}';
begin
  for f in
    select p.oid, p.proname, l.lanname, p.oid::regprocedure::text as firma
    from pg_proc p
    join pg_language l on l.oid = p.prolang
    where p.pronamespace = 'retail'::regnamespace
      and p.proname in ('resumen_compras', 'resumen_compras_extra', 'deuda_por_vencimiento', 'salidas_caja_30d', 'por_pagar_tramos')
    order by p.proname, p.oid
  loop
    v_def := pg_get_functiondef(f.oid);
    continue when v_def like '%fn_exige_dinero_de_compras%';

    v_que := case f.proname
      when 'deuda_por_vencimiento' then 'la deuda por vencimiento'
      when 'salidas_caja_30d' then 'las salidas de caja de Compras'
      when 'por_pagar_tramos' then 'lo que hay por pagar'
      else 'las cifras de dinero de Compras'
    end;

    if f.lanname = 'sql' then
      -- Un cuerpo `sql` devuelve el resultado de su ÚLTIMA instrucción: la primera solo exige el candado
      -- (si falla, aborta antes de leer un solo peso). Da igual si el cuerpo empieza en la misma línea
      -- que `AS $function$` o en la siguiente: el candado se inserta justo después de la apertura.
      v_nuevo := regexp_replace(
        v_def,
        E'AS \\$function\\$',
        format(E'AS $function$\n  -- CANDADO (ADR-0126): solo el líder ve dinero de Compras.\n  select retail.fn_exige_dinero_de_compras(%L);', v_que)
      );
    elsif f.lanname = 'plpgsql' then
      -- El primer `begin` que abre el cuerpo (los `declare`, si los hay, van antes). Sin 'g': solo el primero.
      v_nuevo := regexp_replace(
        v_def,
        E'\\mbegin\\M',
        format(E'begin\n  -- CANDADO (ADR-0126): solo el líder ve dinero de Compras.\n  perform retail.fn_exige_dinero_de_compras(%L);', v_que),
        'i'
      );
    else
      raise exception '% está escrita en % y esta rutina solo sabe ponerle el candado a `sql` y `plpgsql`', f.firma, f.lanname;
    end if;

    if v_nuevo = v_def then
      raise exception 'No encontré dónde poner el candado en % — ponlo a mano como primera instrucción del cuerpo: %', f.firma, format('select retail.fn_exige_dinero_de_compras(%L);', v_que);
    end if;

    execute v_nuevo;
    v_arregladas := v_arregladas || f.firma;
  end loop;

  return v_arregladas;
end;
$$;

comment on function retail.fn_aplicar_candado_de_dinero() is
  'ADR-0126. Le pone `fn_exige_dinero_de_compras` a las funciones de dinero de Compras que no lo lleven (resumen_compras, resumen_compras_extra, deuda_por_vencimiento, salidas_caja_30d, por_pagar_tramos), sea cual sea su firma. Idempotente. Devuelve las firmas que arregló ({} = todo estaba bien). Correrla después de pegar cualquier migración que recree una de esas funciones.';

-- Ejecuta DDL: solo el dueño (SQL Editor / migraciones). Nunca la app.
revoke all on function retail.fn_aplicar_candado_de_dinero() from public, anon, authenticated;

select retail.fn_aplicar_candado_de_dinero() as funciones_a_las_que_se_les_puso_el_candado;

-- ----------------------------------------------------------------------------
-- 3. El costo promedio de un ingreso sin comprobante también es dinero
-- ----------------------------------------------------------------------------
-- Solo envuelve el cálculo de `costo_unitario_promedio` en «si eres líder» (NULL si no); el resto de la
-- función —incluida `sin_costo`, que solo avisa SI falta el costo— queda como esté en cada base. Si el
-- cálculo ya no tiene la forma que se revisó (alguien lo cambió), aborta en vez de adivinar.

do $$
declare
  v_oid oid;
  v_def text;
  v_nuevo text;
begin
  select p.oid into strict v_oid
  from pg_proc p
  where p.pronamespace = 'retail'::regnamespace and p.proname = 'recepciones_sin_comprobante';

  v_def := pg_get_functiondef(v_oid);
  if v_def like '%fn_puede_ver_dinero_de_compras%' then
    return; -- ya estaba
  end if;

  v_nuevo := regexp_replace(
    v_def,
    '(round\(\s*sum\(m\.cantidad \* ch\.costo_unitario_nuevo\) filter \(where ch\.id is not null\)\s*/\s*nullif\(sum\(m\.cantidad\) filter \(where ch\.id is not null\), 0\),\s*2\s*\))',
    'case when retail.fn_puede_ver_dinero_de_compras() then \1 end'
  );

  if v_nuevo = v_def then
    raise exception 'No encontré el cálculo del costo promedio en recepciones_sin_comprobante: alguien lo cambió. Envuélvelo a mano en «case when retail.fn_puede_ver_dinero_de_compras() then … end».';
  end if;

  execute v_nuevo;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. Lo que un integrante necesita para RECIBIR — sin un solo monto
-- ----------------------------------------------------------------------------
-- Reemplazan, para quien no es líder, la lectura de `listar_compras` y de `compra_items_resumen`
-- (que la parte B cierra para él). Son `security definer` con el candado de sede escrito a mano,
-- igual que `listar_recepciones_compras`: ADR-0075 ya advertía que una función así «no pasa por RLS
-- en absoluto» y tiene que repetir `fn_puede_operar_ubicacion`.
--
-- El orden y el cursor son los de `listar_compras` (emisión, más reciente primero) para que la
-- pantalla pagine igual. No hay filtros de pago (saldo, vencidas, condición): filtrar por una
-- columna de dinero es una forma de enterarse del dinero.

create or replace function retail.listar_compras_operativo(
  p_limite integer default 50,
  p_cursor_fecha date default null,
  p_cursor_creado_en timestamptz default null,
  p_cursor_id uuid default null,
  p_busqueda text default null,
  p_proveedor_id uuid default null,
  p_estado_recepcion text default null,
  p_por_recibir boolean default false,
  p_desde date default null,
  p_hasta date default null,
  p_tipo text default null
)
returns table (
  id uuid,
  proveedor_id uuid,
  proveedor_nombre text,
  proveedor_ruc text,
  tipo text,
  documento text,
  fecha_emision date,
  ubicacion_destino_id uuid,
  estado text,
  nota text,
  created_at timestamptz,
  facturado_cantidad integer,
  recibido_cantidad integer,
  estado_recepcion text,
  fecha_estimada_llegada date,
  recepcion_atrasada boolean,
  cerrado_cantidad integer
)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_limite integer := greatest(1, least(coalesce(p_limite, 50), 200)) + 1;
  v_busqueda text := nullif(trim(p_busqueda), '');
  v_proveedores uuid[];
begin
  if auth.uid() is null then
    return;
  end if;
  if v_busqueda is not null then
    select coalesce(array_agg(pr.id), '{}') into v_proveedores from proveedores pr where pr.nombre ilike '%' || v_busqueda || '%';
  end if;
  return query
    select r.id, r.proveedor_id, r.proveedor_nombre, r.proveedor_ruc, r.tipo, r.documento, r.fecha_emision,
           r.ubicacion_destino_id, r.estado, r.nota, r.created_at, r.facturado_cantidad, r.recibido_cantidad,
           r.estado_recepcion, r.fecha_estimada_llegada, r.recepcion_atrasada, r.cerrado_cantidad
    from compras_resumen r
    where fn_puede_operar_ubicacion(r.ubicacion_destino_id)
      and (v_busqueda is null or r.documento ilike '%' || v_busqueda || '%' or r.proveedor_id = any(v_proveedores))
      and (p_proveedor_id is null or r.proveedor_id = p_proveedor_id)
      and (p_estado_recepcion is null or r.estado_recepcion = p_estado_recepcion)
      and (p_tipo is null or r.tipo = p_tipo)
      and (not p_por_recibir or (r.estado = 'vigente' and r.estado_recepcion in ('sin_recibir', 'parcial')))
      and (p_desde is null or r.fecha_emision >= p_desde)
      and (p_hasta is null or r.fecha_emision <= p_hasta)
      and (p_cursor_id is null or (r.fecha_emision, r.created_at, r.id) < (p_cursor_fecha, p_cursor_creado_en, p_cursor_id))
    order by r.fecha_emision desc, r.created_at desc, r.id desc
    limit v_limite;
end;
$$;

comment on function retail.listar_compras_operativo(integer, date, timestamptz, uuid, text, uuid, text, boolean, date, date, text) is
  'ADR-0126. Comprobantes de compra de las sedes que opera quien consulta, SIN montos ni datos de pago: lo que hace falta para recibir. Devuelve limite+1 filas (la de más solo avisa que hay otra página), como `listar_compras`.';

create or replace function retail.lineas_compra_operativo(p_compra_ids uuid[])
returns table (
  id uuid,
  compra_id uuid,
  producto_id uuid,
  variante_id uuid,
  descripcion text,
  cantidad integer,
  recibido bigint,
  cerrado bigint,
  pendiente bigint
)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select r.id, r.compra_id, r.producto_id, r.variante_id, r.descripcion, r.cantidad, r.recibido, r.cerrado, r.pendiente
  from compra_items_resumen r
  join compras c on c.id = r.compra_id
  where auth.uid() is not null
    and r.compra_id = any(p_compra_ids)
    and fn_puede_operar_ubicacion(c.ubicacion_destino_id);
$$;

comment on function retail.lineas_compra_operativo(uuid[]) is
  'ADR-0126. Líneas (qué, cuánto, cuánto llegó, cuánto falta) de comprobantes de las sedes que opera quien consulta, SIN costo ni subtotal.';

revoke all on function retail.listar_compras_operativo(integer, date, timestamptz, uuid, text, uuid, text, boolean, date, date, text) from public, anon;
grant execute on function retail.listar_compras_operativo(integer, date, timestamptz, uuid, text, uuid, text, boolean, date, date, text) to authenticated;
revoke all on function retail.lineas_compra_operativo(uuid[]) from public, anon;
grant execute on function retail.lineas_compra_operativo(uuid[]) to authenticated;

-- ----------------------------------------------------------------------------
-- Cómo mirar que quedó bien (en el SQL Editor, como líder):
--   select proname from pg_proc where pronamespace = 'retail'::regnamespace
--    and proname in ('fn_puede_ver_dinero_de_compras', 'fn_exige_dinero_de_compras', 'fn_aplicar_candado_de_dinero',
--                    'listar_compras_operativo', 'lineas_compra_operativo');            -- 5 filas
--   select retail.fn_aplicar_candado_de_dinero();                                       -- {} (ya estaban con candado)
--   select * from retail.resumen_compras();                                             -- sigue funcionando (eres líder)
-- ----------------------------------------------------------------------------
