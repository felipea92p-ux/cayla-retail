-- ============================================================================
-- 20260928200000_arreglos_en_vivo_a_main.sql — CAYLA V2 · Deriva producción ↔ main (ADR-0251, ADR-0252)
-- Trae a `main` lo que se arregló directo en producción y nunca volvió al repo. Pegada en producción cambia SOLO las
-- tres envolturas `_json` (punto 5): todo lo demás ya está así allá, y esta migración solo lo escribe en el repo.
--
-- EL PROBLEMA PRIMERO. La auditoría de huellas del 2026-09-28 (`scripts/migraciones/deriva.sql`, ADR-0251) comparó el
-- catálogo de `retail` de producción con una base armada desde `main` y encontró arreglos que viven SOLO en producción:
-- se pegaron a mano (SQL Editor o el MCP de Supabase) y su migración nunca llegó a `main`. Cuestan dos cosas, las dos en
-- silencio: (1) una base armada desde el repo —el CI, el Postgres local de cada worktree— prueba OTRO sistema que el que
-- corre en las tiendas; y (2) la próxima migración que recree una de esas funciones desde el repo borra el arreglo sin
-- que nadie lo note (le pasó a Análisis con el PR 397).
--
-- QUÉ TRAE (en cada punto, lo que producción tiene hoy; así queda `main`):
--   1. `emitir_comprobante` y `emitir_nota` sin EXECUTE para ningún rol de la app (PUBLIC, `anon`, `authenticated`,
--      `service_role`): solo las ejecuta su dueña. Reservan el número de la serie y crean el comprobante que va a SUNAT,
--      y las llaman por dentro las funciones `security definer` que validan la venta, la separación o la devolución
--      (`registrar_venta`, `separar_prendas`, `abonar_separacion`, `entregar_separacion`, `aprobar_devolucion`,
--      `registrar_devolucion_separacion`, `convertir_proforma_a_comprobante`). La web nunca las llama (buscado el
--      2026-09-28 en `apps/web`, `scripts/` y `packages/`: solo comentarios; las pruebas las llaman como `postgres`). En
--      producción desde el 2026-09-26 (historial de producción: `cerrar_emitir_comprobante_y_emitir_nota`).
--   2. `fn_aplicar_movimiento` y `recalcular_stock` sin EXECUTE para `service_role` (a `authenticated` y `anon` ya se les
--      había quitado en 20260917193651 y 20260920160000). Las llaman por dentro las funciones que mueven stock, todas
--      `security definer` con dueña `postgres` (medido el 2026-09-28: 24 llamadoras, ninguna `security invoker`);
--      `recalcular_stock` es mantenimiento que se corre a mano desde el SQL Editor. La llave del servidor (reintento de
--      SUNAT y alta de terminales) no toca ninguna de las dos.
--   3. `stock`: `authenticated` solo lee (ni insert, ni update, ni delete, ni truncate), y `service_role` tampoco
--      escribe. `movimientos`: `service_role` tampoco escribe (a `authenticated` ya se le había quitado en 20260914165703
--      y 20260915150000). Es la regla de «solo por las funciones» de 20260923234700 (ventas, clientas, conteos, lotes,
--      traslados) aplicada al libro y a su foto: `movimientos` es la verdad y `stock` se deriva de ella (principio 4);
--      escribir cualquiera de las dos a mano, aunque sea con la llave del servidor, deja la foto distinta del libro. La web
--      solo las LEE (8 lecturas de `stock`, 3 de `movimientos`, buscadas el 2026-09-28; ninguna escritura).
--   4. `fn_rentabilidad(date, integer, numeric)`: la lectura de «qué vende mucho y deja poco» (ADR-0118, PR #168, en
--      borrador). Está en producción sin su pantalla; entra aquí con el cuerpo EXACTO de producción, que es el del PR
--      (mismo md5 de `prosrc`), y los mismos permisos: la ejecuta `authenticated` y adentro exige líder.
--   5. `fn_stock_por_sede_json`, `fn_resumen_comparacion_json` y `fn_resumen_variantes_json`: la ÚNICA diferencia es que
--      `main` escribe `retail.fn_x()` y producción `fn_x()` (equivalentes: el search_path de la función empieza en
--      `retail`). Se queda la de `main` (20260923171700), copiada tal cual: es lo único que cambia en producción.
--
-- LO QUE NO TRAE, a propósito:
--   · `compras_nota_pendiente` y `notas_credito_tablero`. Producción tiene otra versión (commit 1807fdfb8, nunca
--     fusionado): un cierre de compra deja de estar «pendiente de nota» si ESE cierre tiene cualquier nota. Arregla el
--     caso que buscaba (un cierre saldado con una nota por devolución), pero rompe otro que la pantalla sí recorre: la
--     nota por faltante es UNA por comprobante y cubre todos sus cierres, y la pantalla la ata solo al último; con dos
--     líneas cerradas, la primera queda «pendiente» para siempre con su monto esperado (reproducido el 2026-09-28, y
--     `pnpm pruebas:compras-faltantes` se pone roja con ese cuerpo). Va en su propia migración, 20260928200100, con las
--     dos reglas juntas: cambia lo que ve el líder en producción y por eso se pega aparte.
--   · La política `clientas_fusiones_select`: está en `main` y no en producción. Es SQL de Clientas sin pegar (ADR-0249),
--     no un arreglo en vivo, y las políticas van solas en su pegada (ADR-0195).
--
-- DECIDÍ: quitar con `revoke` explícito SOLO lo que sobra (y nunca re-otorgar lo que ya está), con una guarda de md5 del
--   cuerpo vivo antes de recrear y una verificación final que aborta si el resultado no es EXACTAMENTE el de producción
--   para los roles de la app (ni un permiso de más, tampoco por columna ni a `anon`). Así la misma migración corre sobre
--   una base de `main` (cierra) y sobre producción (no cambia nada salvo el punto 5).
-- DESCARTÉ: `revoke all` + `grant select` (dejar la lista «limpia»). En producción quitaría y volvería a dar permisos que
--   hoy están bien; si alguno lo otorgó otro rol, quedarían dos entradas y la huella de producción cambiaría sin razón.
-- DESCARTÉ: dejar `main` como está y anotar las diferencias como «conocidas» en `deriva.mjs`. El CI seguiría probando
--   funciones y tablas con puertas que producción ya cerró: una pantalla nueva que escribiera `stock` directo pasaría
--   todas las pruebas y fallaría recién en la tienda.
-- SE ROMPE SI: (a) una pantalla o un script futuro escribe `stock` o `movimientos` directo, o llama alguna de las cuatro
--   funciones con la sesión o con la llave del servidor: recibe `permission denied` (42501); la salida es una función
--   `security definer` con su candado, nunca devolver el permiso. (b) Alguien recrea una de las cuatro con
--   `drop function` + `create function`: los `revoke` no sobreviven a eso (`create or replace` sí los conserva);
--   `pnpm pruebas:arreglos-en-vivo` mira el estado vivo y se pone roja. (c) El PR #168 cambia el cuerpo de
--   `fn_rentabilidad` antes de que esta entre: la guarda de abajo aborta en el CI; el PR tiene que quitar su propia
--   creación o dejarla idéntica (si la cambia DESPUÉS, en una migración nueva, esta no se vuelve a correr y no pasa nada).
--   (d) La dueña de alguna de las cuatro pierde su propio EXECUTE: la verificación final aborta el pegado nombrándola (de
--   eso dependen las funciones que las llaman por dentro).
--
-- CÓMO SE PEGA EN PRODUCCIÓN. UNA sola parte, sola, en el SQL Editor, tal cual (ya trae `retail.`), a cualquier hora. No
-- lleva políticas ni `drop trigger` ni `alter table` (ADR-0195). Los `revoke` de tabla no toman candado de la tabla
-- (medido: 0 candados y 5 ms con otra transacción escribiendo `stock` al mismo tiempo); `lock_timeout` cubre las
-- funciones que se recrean. Se puede pegar dos veces. Da igual antes o después de 20260928200100. Si la guarda aborta,
-- NO se toca nada (todo es una transacción): alguien cambió la función después del 2026-09-28 y hay que partir de su
-- definición real.
--
-- CÓMO SE VERIFICA DESPUÉS (solo lectura, en el SQL Editor):
--   select p.oid::regprocedure as funcion, p.proacl,
--          md5(regexp_replace(regexp_replace(regexp_replace(p.prosrc, '/\*.*?\*/', '', 'g'), '--[^' || chr(10) || ']*', '', 'g'), '\s+', '', 'g')) as huella
--     from pg_proc p
--    where p.pronamespace = 'retail'::regnamespace
--      and p.proname in ('emitir_comprobante', 'emitir_nota', 'fn_aplicar_movimiento', 'recalcular_stock', 'fn_rentabilidad',
--                        'fn_stock_por_sede_json', 'fn_resumen_comparacion_json', 'fn_resumen_variantes_json')
--    order by 1;
--   Esperado: las cuatro primeras con proacl {postgres=X/postgres}; fn_rentabilidad 1a61f19254ea7a84d87b1abdb939734f
--   con {postgres=X/postgres,authenticated=X/postgres}; fn_stock_por_sede_json 8ea080da9ff1b07de8f893afc8f5ce74,
--   fn_resumen_comparacion_json 2921579370257dba433159ce171f9779 y fn_resumen_variantes_json
--   23e23e1359bdf05e822669f86e317187 (antes de pegar: 4365f3228a2f…, cc71c6d66dfc… y 972b6bc8c2a3…). Y:
--   select relname, relacl from pg_class where relnamespace = 'retail'::regnamespace and relname in ('stock', 'movimientos');
--   → authenticated=r y service_role=rxtm (más la dueña) en las dos. Existencias, Análisis y Movimientos se ven igual.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ── 1. LA GUARDA ────────────────────────────────────────────────────────────
-- Antes de tocar nada: cada función que se recrea abajo tiene que tener el cuerpo de `main` o el de producción del
-- 2026-09-28 (md5 del cuerpo sin comentarios ni espacios, igual que `deriva.sql`; los dos valen, porque esta migración
-- corre sobre las dos). Con cualquier otro, alguien la parchó después: se aborta sin cambiar nada. Las cuatro que solo
-- cambian permisos tienen que existir con esa firma exacta.
do $guarda$
declare
  r record;
  v_md5 text;
begin
  for r in
    select *
      from (values
        -- firma                                                            main                                producción                          puede faltar
        ('retail.fn_stock_por_sede_json()',                                 '8ea080da9ff1b07de8f893afc8f5ce74', '4365f3228a2f68db7dabe607f7dd6bb4', false),
        ('retail.fn_resumen_comparacion_json(uuid, date, date, date, date)', '2921579370257dba433159ce171f9779', 'cc71c6d66dfce3ccac05c1ac8c16b532', false),
        ('retail.fn_resumen_variantes_json(uuid, date, date, date, date)',   '23e23e1359bdf05e822669f86e317187', '972b6bc8c2a396021fde0aba600c5cd3', false),
        -- En `main` no existe (nace aquí); en producción, el cuerpo del PR #168.
        ('retail.fn_rentabilidad(date, integer, numeric)',                  null,                               '1a61f19254ea7a84d87b1abdb939734f', true)
      ) as t(firma, md5_main, md5_produccion, puede_faltar)
  loop
    select md5(regexp_replace(regexp_replace(regexp_replace(p.prosrc, '/\*.*?\*/', '', 'g'), '--[^' || chr(10) || ']*', '', 'g'), '\s+', '', 'g'))
      into v_md5
      from pg_proc p
     where p.oid = to_regprocedure(r.firma);
    if v_md5 is null then
      if r.puede_faltar then
        continue;
      end if;
      raise exception 'Falta % en esta base: esta migración la recrea y no la crea. Revisa que estén pegadas las migraciones anteriores.', r.firma;
    end if;
    if v_md5 is distinct from r.md5_main and v_md5 is distinct from r.md5_produccion then
      raise exception '% cambió después del 2026-09-28 (huella del cuerpo: %; se esperaba la de main % o la de producción %). No se tocó nada. Si esta migración ya está en main, no la edites: lo que falte va en una migración nueva que parta de la definición real (pg_get_functiondef).',
        r.firma, v_md5, coalesce(r.md5_main, '(no existe)'), r.md5_produccion;
    end if;
  end loop;

  if to_regprocedure('retail.emitir_comprobante(uuid, text, numeric, numeric, numeric, uuid, text, text, text, jsonb, uuid)') is null
     or to_regprocedure('retail.emitir_nota(uuid, text, text, numeric, numeric, numeric, jsonb)') is null
     or to_regprocedure('retail.fn_aplicar_movimiento(uuid)') is null
     or to_regprocedure('retail.recalcular_stock()') is null then
    raise exception 'Falta emitir_comprobante, emitir_nota, fn_aplicar_movimiento o recalcular_stock con la firma del 2026-09-28: alguien la cambió; revisa antes de pegar.';
  end if;
end
$guarda$;

-- ── 2. FUNCIONES QUE SOLO EJECUTA SU DUEÑA (puntos 1 y 2) ────────────────────
revoke execute on function retail.emitir_comprobante(uuid, text, numeric, numeric, numeric, uuid, text, text, text, jsonb, uuid) from public, anon, authenticated, service_role;
revoke execute on function retail.emitir_nota(uuid, text, text, numeric, numeric, numeric, jsonb) from public, anon, authenticated, service_role;
revoke execute on function retail.fn_aplicar_movimiento(uuid) from public, anon, authenticated, service_role;
revoke execute on function retail.recalcular_stock() from public, anon, authenticated, service_role;

-- ── 3. EL LIBRO Y SU FOTO SE ESCRIBEN SOLO POR LAS FUNCIONES (punto 3) ───────
-- Se quita solo la escritura: la lectura (y lo que `service_role` conserva en producción: references, trigger, maintain)
-- queda como está.
revoke insert, update, delete, truncate on retail.stock from public, anon, authenticated, service_role;
revoke insert, update, delete, truncate on retail.movimientos from public, anon, authenticated, service_role;

-- ── 4. fn_rentabilidad (punto 4): cuerpo EXACTO de producción = PR #168 ──────
-- Copiado de supabase/migrations/20260918194000_panel_rentabilidad.sql de la rama del PR #168 (ADR-0118), que es lo
-- que está pegado en producción (mismo md5 de `prosrc`: 957354c030adfa184fec0ff64a308e93). Depende de
-- `fn_origen_producto` y `fn_es_lider`, que ya están en `main`.
create or replace function retail.fn_rentabilidad(
  p_dia date default null,
  p_dias integer default 90,
  p_igv numeric default 0.18
)
returns table (
  nivel text,
  clave text,
  etiqueta text,
  unidades integer,
  venta_neta numeric,
  venta_neta_con_costo numeric,
  costo numeric,
  unidades_sin_costo integer,
  descuento numeric,
  unidades_devueltas integer,
  stock integer,
  dias_ventana integer,
  desde date,
  hasta date
)
language plpgsql
stable
security definer
set search_path to 'retail', 'public', 'extensions'
as $$
#variable_conflict use_column
declare
  v_dia date;
  v_desde date;
  v_hasta date;
  v_ts_desde timestamptz;
  v_ts_hasta timestamptz;
begin
  if not fn_es_lider() then
    raise exception 'Solo un líder puede ver la rentabilidad';
  end if;
  if p_dias < 1 or p_igv < 0 or p_igv > 1 then
    raise exception 'Parámetros fuera de rango (p_dias >= 1, p_igv entre 0 y 1)';
  end if;

  v_dia := coalesce(p_dia, (now() at time zone 'America/Lima')::date);
  v_hasta := v_dia + 1;                 -- exclusivo: el día de hoy entra completo
  v_desde := v_hasta - p_dias;
  v_ts_desde := v_desde::timestamp at time zone 'America/Lima';
  v_ts_hasta := v_hasta::timestamp at time zone 'America/Lima';

  return query
  with lineas as (
    select vi.id as item_id, va.producto_id, p.categoria_id, p.temporada,
           o.tipo as origen_tipo, o.origen_id,
           vi.cantidad,
           (vi.precio_unitario - vi.descuento_unitario) * vi.cantidad as pagado,
           vi.descuento_unitario * vi.cantidad as descuento,
           vi.costo_unitario,
           vi.costo_unitario * vi.cantidad as costo_total
    from ventas ve
    join venta_items vi on vi.venta_id = ve.id
    join variantes va on va.id = vi.variante_id
    join productos p on p.id = va.producto_id
    left join lateral fn_origen_producto(p.id, (ve.created_at at time zone 'America/Lima')::date) o on true
    where ve.estado = 'completada'
      and ve.created_at >= v_ts_desde
      and ve.created_at <  v_ts_hasta
  ),
  devuelto as (
    select di.venta_item_id, sum(di.cantidad) as cantidad
    from devolucion_items di
    join devoluciones d on d.id = di.devolucion_id and d.estado = 'aprobada'
    group by di.venta_item_id
  ),
  base as (
    select l.*, coalesce(dv.cantidad, 0) as devueltas
    from lineas l
    left join devuelto dv on dv.venta_item_id = l.item_id
  ),
  ventas_n as (
    select
      case when grouping(b.producto_id) = 0 then 'producto'
           when grouping(b.categoria_id) = 0 then 'categoria'
           when grouping(b.temporada) = 0 then 'temporada'
           when grouping(b.origen_tipo) = 0 then 'origen'
           else 'total' end as nivel,
      case when grouping(b.producto_id) = 0 then b.producto_id::text
           when grouping(b.categoria_id) = 0 then coalesce(b.categoria_id::text, '')
           when grouping(b.temporada) = 0 then coalesce(b.temporada, '')
           when grouping(b.origen_tipo) = 0 then coalesce(b.origen_tipo, 'sin') || ':' || coalesce(b.origen_id::text, '')
           else '' end as clave,
      coalesce(sum(b.cantidad), 0)::integer as unidades,
      coalesce(sum(b.pagado), 0) / (1 + p_igv) as venta_neta,
      coalesce(sum(b.pagado) filter (where b.costo_unitario > 0), 0) / (1 + p_igv) as venta_neta_con_costo,
      coalesce(sum(b.costo_total) filter (where b.costo_unitario > 0), 0) as costo,
      coalesce(sum(b.cantidad) filter (where b.costo_unitario = 0), 0)::integer as unidades_sin_costo,
      coalesce(sum(b.descuento), 0) as descuento,
      coalesce(sum(b.devueltas), 0)::integer as devueltas
    from base b
    group by grouping sets ((b.producto_id), (b.categoria_id), (b.temporada), (b.origen_tipo, b.origen_id), ())
  ),
  stock_prod as (
    -- Una fila por producto: unidades vendibles hoy (sin cuarentena). Solo con stock > 0.
    select va.producto_id, sum(st.cantidad)::integer as stock
    from stock st
    join variantes va on va.id = st.variante_id
    left join sububicaciones sb on sb.id = st.sububicacion_id
    where coalesce(sb.tipo, '') <> 'cuarentena'
    group by va.producto_id
    having sum(st.cantidad) > 0
  ),
  stock_n as (
    select
      case when grouping(sp.producto_id) = 0 then 'producto'
           when grouping(pr.categoria_id) = 0 then 'categoria'
           when grouping(pr.temporada) = 0 then 'temporada'
           else 'total' end as nivel,
      case when grouping(sp.producto_id) = 0 then sp.producto_id::text
           when grouping(pr.categoria_id) = 0 then coalesce(pr.categoria_id::text, '')
           when grouping(pr.temporada) = 0 then coalesce(pr.temporada, '')
           else '' end as clave,
      sum(sp.stock)::integer as stock
    from stock_prod sp
    join productos pr on pr.id = sp.producto_id
    group by grouping sets ((sp.producto_id), (pr.categoria_id), (pr.temporada), ())
  ),
  unidos as (
    select coalesce(v.nivel, s.nivel) as nivel,
           coalesce(v.clave, s.clave) as clave,
           coalesce(v.unidades, 0) as unidades,
           coalesce(v.venta_neta, 0) as venta_neta,
           coalesce(v.venta_neta_con_costo, 0) as venta_neta_con_costo,
           coalesce(v.costo, 0) as costo,
           coalesce(v.unidades_sin_costo, 0) as unidades_sin_costo,
           coalesce(v.descuento, 0) as descuento,
           coalesce(v.devueltas, 0) as devueltas,
           s.stock
    from ventas_n v
    full join stock_n s on s.nivel = v.nivel and s.clave = v.clave
  )
  select
    u.nivel,
    u.clave,
    case u.nivel
      when 'producto'  then coalesce((select pr.referencia from productos pr where pr.id = u.clave::uuid), 'Producto sin nombre')
      when 'categoria' then case when u.clave = '' then 'Sin categoría'
                                 else coalesce((select ca.nombre from categorias ca where ca.id = u.clave::uuid), 'Categoría sin nombre') end
      when 'temporada' then case when u.clave = '' then 'Sin temporada' else u.clave end
      when 'origen'    then case split_part(u.clave, ':', 1)
                              when 'proveedor' then coalesce((select pv.nombre from proveedores pv where pv.id = nullif(split_part(u.clave, ':', 2), '')::uuid), 'Proveedor sin nombre')
                              when 'taller' then 'Taller'
                              else 'Sin origen registrado' end
      else 'Total' end as etiqueta,
    u.unidades,
    u.venta_neta,
    u.venta_neta_con_costo,
    u.costo,
    u.unidades_sin_costo,
    u.descuento,
    u.devueltas,
    -- en el nivel origen el stock no se atribuye: NULL, no 0
    case when u.nivel = 'origen' then null else coalesce(u.stock, 0) end,
    p_dias,
    v_desde,
    v_dia
  from unidos u
  order by 1, 5 desc, 3;
end;
$$;

-- Mismos permisos que en producción: `authenticated` la ejecuta (el candado de líder está adentro); nadie más.
revoke all on function retail.fn_rentabilidad(date, integer, numeric) from public, anon, service_role;
grant execute on function retail.fn_rentabilidad(date, integer, numeric) to authenticated;

-- ── 5. Las tres envolturas `_json` (punto 5): la versión de `main`, tal cual ─
-- Copiadas de 20260923171700_lecturas_en_una_fila_jsonb.sql sin cambiar un carácter. `create or replace` conserva los
-- permisos que ya tienen (en las dos bases: solo `authenticated`).

create or replace function retail.fn_resumen_variantes_json(
  p_ubicacion_id uuid,
  p_desde date default null,
  p_hasta date default null,
  p_cmp_desde date default null,
  p_cmp_hasta date default null
)
returns jsonb
language sql
stable
security invoker
set search_path to 'retail', 'public', 'extensions'
as $$
  select coalesce(jsonb_agg(to_jsonb(r) - 'ordinality' order by r.ordinality), '[]'::jsonb)
  from retail.fn_resumen_variantes(
    p_ubicacion_id => p_ubicacion_id,
    p_desde => p_desde,
    p_hasta => p_hasta,
    p_cmp_desde => p_cmp_desde,
    p_cmp_hasta => p_cmp_hasta
  ) with ordinality r;
$$;

create or replace function retail.fn_resumen_comparacion_json(
  p_ubicacion_id uuid,
  p_a_desde date,
  p_a_hasta date,
  p_b_desde date,
  p_b_hasta date
)
returns jsonb
language sql
stable
security invoker
set search_path to 'retail', 'public', 'extensions'
as $$
  select coalesce(jsonb_agg(to_jsonb(r) - 'ordinality' order by r.ordinality), '[]'::jsonb)
  from retail.fn_resumen_comparacion(p_ubicacion_id, p_a_desde, p_a_hasta, p_b_desde, p_b_hasta) with ordinality r;
$$;

create or replace function retail.fn_stock_por_sede_json()
returns jsonb
language sql
stable
security invoker
set search_path to 'retail', 'public', 'extensions'
as $$
  select coalesce(jsonb_agg(to_jsonb(r) - 'ordinality' order by r.ordinality), '[]'::jsonb)
  from retail.fn_stock_por_sede() with ordinality r;
$$;

-- ── 6. VERIFICACIÓN FINAL ────────────────────────────────────────────────────
-- Si algo no quedó como en producción, se revierte todo (una sola transacción) en vez de dejarlo a medias.
do $verifica$
declare
  r record;
  v_md5 text;
begin
  -- (a) Ninguna sobrecarga de las cuatro (por NOMBRE: una firma nueva entra sola) la ejecuta un rol de la app...
  for r in
    select 'retail.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as firma, g.rol
      from pg_proc p
     cross join (values ('public'), ('anon'), ('authenticated'), ('service_role')) as g(rol)
     where p.pronamespace = 'retail'::regnamespace
       and p.proname in ('emitir_comprobante', 'emitir_nota', 'fn_aplicar_movimiento', 'recalcular_stock')
       and has_function_privilege(g.rol, p.oid, 'execute')
  loop
    raise exception '% todavía la puede ejecutar %: tiene que quedar solo para su dueña, como en producción', r.firma, r.rol;
  end loop;

  -- ...y su dueña SÍ (las funciones que las llaman por dentro corren con los privilegios de la dueña; un superusuario se
  -- salta toda ACL y siempre pasa, pero la dueña de producción no lo es).
  for r in
    select 'retail.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as firma, pg_get_userbyid(p.proowner) as duena
      from pg_proc p
     where p.pronamespace = 'retail'::regnamespace
       and p.proname in ('emitir_comprobante', 'emitir_nota', 'fn_aplicar_movimiento', 'recalcular_stock')
       and not has_function_privilege(p.proowner, p.oid, 'execute')
  loop
    raise exception 'La dueña de % (%) no la puede ejecutar: las ventas, devoluciones y movimientos dejarían de funcionar. Devuélveselo (grant execute on function % to %) y vuelve a pegar.',
      r.firma, r.duena, r.firma, r.duena;
  end loop;

  -- (b) `stock` y `movimientos`: los roles de la app quedan EXACTAMENTE con lo de producción, ni un permiso de más
  --     (`authenticated` solo lee; `service_role` lee, más references y trigger; `anon` y PUBLIC, nada). Se mira la tabla
  --     Y cada columna: un `grant update (cantidad)` no aparece en has_table_privilege y deja escribir igual.
  for r in
    select c.relname, g.rol, x.priv
      from pg_class c
     cross join (values ('public'), ('anon'), ('authenticated'), ('service_role')) as g(rol)
     cross join (values ('select'), ('insert'), ('update'), ('delete'), ('truncate'), ('references'), ('trigger')) as x(priv)
     where c.oid in ('retail.stock'::regclass, 'retail.movimientos'::regclass)
       and (has_table_privilege(g.rol, c.oid, x.priv)
            or (x.priv in ('select', 'insert', 'update', 'references') and has_any_column_privilege(g.rol, c.oid, x.priv)))
       and not (g.rol = 'authenticated' and x.priv = 'select')
       and not (g.rol = 'service_role' and x.priv in ('select', 'references', 'trigger'))
  loop
    raise exception '% todavía tiene % sobre retail.% (en la tabla o en alguna columna): el libro y su foto se escriben solo por las funciones, y en producción nadie más de la app tiene permisos ahí', r.rol, r.priv, r.relname;
  end loop;
  if not (has_table_privilege('authenticated', 'retail.stock', 'select') and has_table_privilege('authenticated', 'retail.movimientos', 'select')
          and has_table_privilege('service_role', 'retail.stock', 'select') and has_table_privilege('service_role', 'retail.movimientos', 'select')) then
    raise exception 'authenticated o service_role perdió la LECTURA de stock o movimientos: Existencias y Movimientos se quedarían en blanco';
  end if;

  -- (c) Los cuerpos quedaron como se escribieron aquí (el de `main` para las `_json`, el de producción para
  --     fn_rentabilidad).
  for r in
    select *
      from (values
        ('retail.fn_stock_por_sede_json()',                                 '8ea080da9ff1b07de8f893afc8f5ce74'),
        ('retail.fn_resumen_comparacion_json(uuid, date, date, date, date)', '2921579370257dba433159ce171f9779'),
        ('retail.fn_resumen_variantes_json(uuid, date, date, date, date)',   '23e23e1359bdf05e822669f86e317187'),
        ('retail.fn_rentabilidad(date, integer, numeric)',                  '1a61f19254ea7a84d87b1abdb939734f')
      ) as t(firma, md5_esperado)
  loop
    select md5(regexp_replace(regexp_replace(regexp_replace(p.prosrc, '/\*.*?\*/', '', 'g'), '--[^' || chr(10) || ']*', '', 'g'), '\s+', '', 'g'))
      into v_md5
      from pg_proc p
     where p.oid = to_regprocedure(r.firma);
    if v_md5 is distinct from r.md5_esperado then
      raise exception '% quedó con la huella % y se esperaba %', r.firma, coalesce(v_md5, '(no existe)'), r.md5_esperado;
    end if;
  end loop;

  -- (d) fn_rentabilidad y las tres `_json`, con los permisos de producción: las ejecuta `authenticated` y nadie más de la app.
  for r in
    select f.firma
      from (values ('retail.fn_stock_por_sede_json()'), ('retail.fn_resumen_comparacion_json(uuid, date, date, date, date)'),
                   ('retail.fn_resumen_variantes_json(uuid, date, date, date, date)'), ('retail.fn_rentabilidad(date, integer, numeric)')) as f(firma)
     where not has_function_privilege('authenticated', f.firma, 'execute')
        or has_function_privilege('anon', f.firma, 'execute')
        or has_function_privilege('public', f.firma, 'execute')
        or has_function_privilege('service_role', f.firma, 'execute')
  loop
    raise exception '% no quedó con los permisos de producción (la ejecuta authenticated y nadie más de la app)', r.firma;
  end loop;
end
$verifica$;
