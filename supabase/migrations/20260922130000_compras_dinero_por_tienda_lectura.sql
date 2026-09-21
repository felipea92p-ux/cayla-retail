-- ============================================================================
-- 20260922130000_compras_dinero_por_tienda_lectura.sql — CAYLA V2 · ADR-0150 (F1, paso 2: la LECTURA por tienda)
--
-- PROBLEMA. El paso 1 (20260922120000) dejó lista la pieza que dice a qué tiendas llega cada persona
-- (`fn_compras_ubicaciones()`), pero el dinero de Compras sigue cerrado a todo el que no es líder: la puerta
-- de lectura `fn_puede_ver_dinero_de_compras()` respondía «¿es líder?» y nada más. Un comprador de tienda
-- (ADR-0150, D1) tiene que poder LEER el dinero de las facturas de SU tienda y de ninguna otra.
--
-- POR QUÉ ESTO VIAJA JUNTO. Abrir la puerta sin acotar cada lectura dejaría a un comprador leer el dinero de
-- todas las tiendas: las políticas y las funciones `security definer` responden «¿es de Compras?», no «¿de qué
-- tienda?». Por eso en esta migración la puerta se abre y todo lo que cuelga de ella se acota, o se deja
-- cerrado al líder si todavía no se puede acotar. Nada queda a medio camino.
--
-- QUÉ HACE
--   1. `fn_compra_es_de_mis_tiendas(compra)`: el corazón. El líder ve todas; un comprador ve una factura solo
--      si TODA ella (todas las líneas, todos los destinos) va a tiendas suyas. Una factura repartida con una
--      tienda que no es suya queda cerrada para él hasta F2/F3 (vista de partes por tienda): sin partir el
--      dinero por tienda no hay forma de enseñarle «su parte» sin enseñarle la de otra (D2).
--   2. `fn_puede_ver_dinero_de_compras()` pasa de «es líder» a «es líder, o comprador de alguna tienda».
--      `fn_puede_registrar_compras()` NO SE TOCA: escribir (registrar, pagar, anular, adjuntar, notas de
--      crédito) sigue siendo solo del líder hasta F3/F4. Esas 12 funciones reciben un `compra_id` y no filtran
--      por tienda; dejarlas al comprador sería dejarlo pagar la factura de otra.
--      DESVÍO DEL ADR-0150 (que decía «las dos puertas»): el ADR no separaba lectura de escritura; se separan
--      porque F1 es la fase de lectura. Queda anotado allí.
--   3. Las 5 políticas de SELECT de `compras`, `compra_items`, `compra_pagos`, `compra_adjuntos` y
--      `compra_notas_credito` usan `fn_compra_es_de_mis_tiendas(compra_id)`; el bucket de escaneos, la carpeta
--      de la compra (`<compra_id>/…`). Las vistas `compras_resumen` y compañeras son `security_invoker`: heredan.
--   4. `compra_item_destinos` y `compra_item_cierres` (a qué tienda va cada línea / cada faltante) también las
--      lee quien compra para esa tienda, no solo quien está fijo en ella: sin eso el «Repartida: …» le sale vacío.
--   5. Las 5 funciones de indicadores (resumen_compras, resumen_compras_extra, deuda_por_vencimiento,
--      salidas_caja_30d, por_pagar_tramos) ya filtraban fila por fila con `fn_puede_ver_compra` (la de LA SEDE en
--      que está fijo el integrante, hecha para recibir). Aquí se cambia por `fn_compra_es_de_mis_tiendas` (las
--      tiendas donde COMPRA): son cosas distintas y un comprador de Lima fijo en Trujillo no debe ver Trujillo.
--      Se parchan sobre su definición VIVA (`pg_get_functiondef`), no sobre una copia: cualquier base las tiene
--      con su firma y su cuerpo, y `fn_aplicar_candado_de_dinero()` (ADR-0126) queda como red de seguridad que
--      ahora también repone ESTE filtro si otra migración recrea una de las cinco.
--   6. `notas_credito_tablero` y `fn_facturas_para_nota_credito` (notas de crédito, F6) no filtran por tienda:
--      pasan a `fn_exige_solo_lider_de_compras` y siguen siendo del líder.
--   7. `recepciones_sin_comprobante`: el costo promedio lo ve el líder o quien compra para ESA tienda (antes:
--      quien pasara la puerta, que ahora incluye compradores de otras tiendas).
--
-- QUÉ NO CAMBIA. Nadie que hoy ve algo deja de verlo: el líder ve exactamente lo mismo (todo), y un integrante
-- que no es comprador sigue sin ver un peso. Mientras `compradores_de_tienda` esté vacía, esta migración no
-- cambia el comportamiento de nadie. Los mensajes de error («Solo un líder puede ver …») no cambian.
--
-- LÍMITE CONOCIDO (F5). Las vistas calculan «recibido» leyendo `movimientos`/`lotes`, que se ven por SEDE. Un
-- comprador fijo en una sede que compra para otra tienda verá el estado de recepción de esa otra tienda según
-- lo que su sede alcanza a ver. La cuenta pensada para esto (una por tienda, fija en su tienda) no lo sufre; la
-- persona de Compras con varias tiendas sí, hasta que F5 lea esas pantallas por función.
--
-- VOLVER ATRÁS: `create or replace` de `fn_puede_ver_dinero_de_compras()` con `select fn_puede_registrar_compras()`
-- deja la puerta como estaba; las políticas vuelven con `fn_puede_ver_dinero_de_compras()` (ver 20260919161000).
--
-- PARA PEGAR EN PRODUCCIÓN: trae `set search_path`; no hace falta el prefijo `retail.`. Re-pegable. Va DESPUÉS de
-- 20260922120000. Al terminar corre `select retail.fn_aplicar_candado_de_dinero();` y debe devolver `{}`.
-- ============================================================================

set search_path = retail, public, extensions;

-- ==================== 0. guardas ====================
do $$
begin
  if to_regprocedure('retail.fn_compras_ubicaciones()') is null then
    raise exception 'Falta 20260922120000_compras_compradores_de_tienda.sql: aplícala antes que esta migración';
  end if;
  if to_regclass('retail.compra_item_destinos') is null or to_regprocedure('retail.fn_aplicar_candado_de_dinero()') is null then
    raise exception 'Falta el reparto por tienda (ADR-0139) o el candado de dinero (ADR-0126): aplícalos antes que esta migración';
  end if;
end;
$$;

-- ==================== 1. ¿el dinero de esta factura es de una tienda mía? ====================
create or replace function retail.fn_compra_es_de_mis_tiendas(p_compra_id uuid)
returns boolean
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select coalesce(
    retail.fn_es_lider()
    or (
      -- Tiene al menos una línea que va a una tienda mía…
      exists (
        select 1
        from compra_items i
        join compra_item_destinos d on d.compra_item_id = i.id
        where i.compra_id = p_compra_id
          and d.ubicacion_id in (select retail.fn_compras_ubicaciones())
      )
      -- …y NINGUNA va a una tienda que no sea mía (una factura repartida con otra tienda se abre en F2/F3).
      and not exists (
        select 1
        from compra_items i
        join compra_item_destinos d on d.compra_item_id = i.id
        where i.compra_id = p_compra_id
          and d.ubicacion_id not in (select retail.fn_compras_ubicaciones())
      )
    ),
    false);
$$;

comment on function retail.fn_compra_es_de_mis_tiendas(uuid) is
  'ADR-0150 (F1). ¿Puede quien consulta ver el DINERO de esta factura? Líder: siempre. Comprador de tienda: solo si toda la factura va a tiendas suyas (fn_compras_ubicaciones). NO es fn_puede_ver_compra (esa es por la SEDE en que está fijo el integrante y sirve para recibir, no para ver dinero). NULL → false.';

-- ==================== 2. la puerta de lectura ====================
-- Antes: `select retail.fn_puede_registrar_compras();` (o sea, «es líder»). Ahora: líder o comprador de alguna tienda.
-- Sola NO basta para ver una fila: cada política y cada función además acota con `fn_compra_es_de_mis_tiendas`.
create or replace function retail.fn_puede_ver_dinero_de_compras()
returns boolean
language sql
stable
set search_path = retail, public, extensions
as $$ select retail.fn_es_lider() or exists (select 1 from retail.fn_compras_ubicaciones()); $$;

comment on function retail.fn_puede_ver_dinero_de_compras() is
  'ADR-0126 + ADR-0150. ¿Pasa quien consulta la PUERTA de lectura del dinero de Compras? Líder, o comprador de alguna tienda (compradores_de_tienda). Pasar la puerta no da acceso a nada por sí sola: cada lectura se acota con fn_compra_es_de_mis_tiendas. Escribir sigue en fn_puede_registrar_compras (solo líder).';

-- Lo que todavía no se puede acotar por tienda queda del líder con esta puerta estricta.
create or replace function retail.fn_exige_solo_lider_de_compras(p_que text default 'los montos de Compras')
returns void
language plpgsql
stable
set search_path = retail, public, extensions
as $$
begin
  if not coalesce(retail.fn_es_lider(), false) then
    raise exception 'Solo un líder puede ver %.', p_que using errcode = '42501';
  end if;
end;
$$;

comment on function retail.fn_exige_solo_lider_de_compras(text) is
  'ADR-0150 (F1). Como fn_exige_dinero_de_compras pero SOLO para líder: para lo que aún no filtra por tienda (notas de crédito, hasta F6).';

revoke all on function retail.fn_compra_es_de_mis_tiendas(uuid) from public, anon;
revoke all on function retail.fn_exige_solo_lider_de_compras(text) from public, anon;
grant execute on function retail.fn_compra_es_de_mis_tiendas(uuid) to authenticated;
grant execute on function retail.fn_exige_solo_lider_de_compras(text) to authenticated;

-- El escaneo vive en `<compra_id>/<archivo>`: la carpeta dice de qué factura es. Una carpeta que no sea un uuid
-- (algo subido a mano) solo la ve el líder, en vez de romper la consulta con un error de conversión.
create or replace function retail.fn_puede_ver_adjunto_de_compra(p_ruta text)
returns boolean
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select case
    when split_part(coalesce(p_ruta, ''), '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then retail.fn_compra_es_de_mis_tiendas(split_part(p_ruta, '/', 1)::uuid)
    else coalesce(retail.fn_es_lider(), false)
  end;
$$;

comment on function retail.fn_puede_ver_adjunto_de_compra(text) is
  'ADR-0150 (F1). ¿Puede quien consulta ver este escaneo del bucket retail-compras-adjuntos? Según la factura de su carpeta; carpeta que no es un uuid → solo el líder.';

revoke all on function retail.fn_puede_ver_adjunto_de_compra(text) from public, anon;
grant execute on function retail.fn_puede_ver_adjunto_de_compra(text) to authenticated;

-- ==================== 3. las políticas de lectura ====================
drop policy if exists compras_select on retail.compras;
create policy compras_select on retail.compras
  for select using (retail.fn_compra_es_de_mis_tiendas(id));

drop policy if exists compra_items_select on retail.compra_items;
create policy compra_items_select on retail.compra_items
  for select using (retail.fn_compra_es_de_mis_tiendas(compra_id));

drop policy if exists compra_pagos_select on retail.compra_pagos;
create policy compra_pagos_select on retail.compra_pagos
  for select using (retail.fn_compra_es_de_mis_tiendas(compra_id));

drop policy if exists compra_adjuntos_select on retail.compra_adjuntos;
create policy compra_adjuntos_select on retail.compra_adjuntos
  for select using (retail.fn_compra_es_de_mis_tiendas(compra_id));

drop policy if exists compra_notas_credito_select on retail.compra_notas_credito;
create policy compra_notas_credito_select on retail.compra_notas_credito
  for select using (retail.fn_compra_es_de_mis_tiendas(compra_id));

drop policy if exists retail_compras_adjuntos_select on storage.objects;
create policy retail_compras_adjuntos_select on storage.objects
  for select to authenticated
  using (bucket_id = 'retail-compras-adjuntos' and retail.fn_puede_ver_adjunto_de_compra(name));

-- A qué tienda va cada línea y cada faltante: lo lee quien opera esa tienda (como antes) O quien compra para ella.
drop policy if exists compra_item_destinos_select on retail.compra_item_destinos;
create policy compra_item_destinos_select on retail.compra_item_destinos
  for select using (retail.fn_puede_operar_ubicacion(ubicacion_id) or retail.fn_puede_comprar_en(ubicacion_id));

drop policy if exists compra_item_cierres_select on retail.compra_item_cierres;
create policy compra_item_cierres_select on retail.compra_item_cierres
  for select using (retail.fn_puede_operar_ubicacion(ubicacion_id) or retail.fn_puede_comprar_en(ubicacion_id));

-- ==================== 4. parchar funciones sobre su definición viva ====================
-- Cada parche dice cuántas veces debe aparecer lo que reemplaza: si la base cambió por debajo, aborta con un mensaje
-- claro y no toca nada (mismo criterio que 20260921130000). Una función que ya no tiene lo que se busca y sí tiene lo
-- nuevo se salta: así se puede volver a pegar.
create or replace function pg_temp.parchar(p_funcion text, p_buscar text, p_poner text, p_ya_esta text, p_esperadas integer)
returns integer
language plpgsql
as $$
declare
  f record;
  v_def text;
  v_veces integer;
  v_hechas integer := 0;
begin
  for f in
    select p.oid, p.oid::regprocedure::text as firma
    from pg_proc p
    where p.pronamespace = 'retail'::regnamespace and p.proname = p_funcion
    order by p.oid
  loop
    v_def := pg_get_functiondef(f.oid);
    continue when position(p_ya_esta in v_def) > 0 and (select count(*) from regexp_matches(v_def, p_buscar, 'g')) = 0;
    select count(*) into v_veces from regexp_matches(v_def, p_buscar, 'g');
    if v_veces <> p_esperadas then
      raise exception '% tiene % veces «%» y se esperaban %: alguien la cambió. Revísala a mano antes de seguir.', f.firma, v_veces, p_buscar, p_esperadas;
    end if;
    execute regexp_replace(v_def, p_buscar, p_poner, 'g');
    v_hechas := v_hechas + 1;
  end loop;
  return v_hechas;
end;
$$;

-- 4.1 Notas de crédito: no filtran por tienda todavía → solo el líder (una llamada al candado en cada una).
select pg_temp.parchar('notas_credito_tablero', 'retail\.fn_exige_dinero_de_compras\(', 'retail.fn_exige_solo_lider_de_compras(', 'fn_exige_solo_lider_de_compras', 1);
select pg_temp.parchar('fn_facturas_para_nota_credito', 'retail\.fn_exige_dinero_de_compras\(', 'retail.fn_exige_solo_lider_de_compras(', 'fn_exige_solo_lider_de_compras', 1);

-- 4.2 Costo promedio de un ingreso sin comprobante: el líder o quien compra para ESA tienda.
select pg_temp.parchar(
  'recepciones_sin_comprobante',
  'case when (retail\.)?fn_puede_ver_dinero_de_compras\(\) then',
  'case when retail.fn_puede_comprar_en(l.ubicacion_id) then',
  'fn_puede_comprar_en',
  1);

-- ==================== 5. la red de seguridad, ahora también con el filtro por tienda ====================
-- Igual que en 20260919160000 (candado inyectado, idempotente, devuelve qué arregló) pero además cambia
-- `fn_puede_ver_compra(` (por la SEDE) por `fn_compra_es_de_mis_tiendas(` (por las tiendas donde COMPRA) en las cinco
-- funciones de indicadores. Si otra migración recrea una de las cinco con el cuerpo viejo, correr esto la repone.
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
    v_nuevo := v_def;

    -- 5.1 El candado (la puerta de lectura) como primera instrucción, si falta.
    if position('fn_exige_dinero_de_compras' in v_nuevo) = 0 then
      v_que := case f.proname
        when 'deuda_por_vencimiento' then 'la deuda por vencimiento'
        when 'salidas_caja_30d' then 'las salidas de caja de Compras'
        when 'por_pagar_tramos' then 'lo que hay por pagar'
        else 'las cifras de dinero de Compras'
      end;

      if f.lanname = 'sql' then
        -- Un cuerpo `sql` devuelve el resultado de su ÚLTIMA instrucción: la primera solo exige el candado.
        v_nuevo := regexp_replace(
          v_nuevo,
          E'AS \\$function\\$',
          format(E'AS $function$\n  -- CANDADO (ADR-0126): solo el líder o un comprador de tienda ve dinero de Compras.\n  select retail.fn_exige_dinero_de_compras(%L);', v_que)
        );
      elsif f.lanname = 'plpgsql' then
        -- El primer `begin` que abre el cuerpo (los `declare`, si los hay, van antes). Sin 'g': solo el primero.
        v_nuevo := regexp_replace(
          v_nuevo,
          E'\\mbegin\\M',
          format(E'begin\n  -- CANDADO (ADR-0126): solo el líder o un comprador de tienda ve dinero de Compras.\n  perform retail.fn_exige_dinero_de_compras(%L);', v_que),
          'i'
        );
      else
        raise exception '% está escrita en % y esta rutina solo sabe ponerle el candado a `sql` y `plpgsql`', f.firma, f.lanname;
      end if;

      if v_nuevo = v_def then
        raise exception 'No encontré dónde poner el candado en % — ponlo a mano como primera instrucción del cuerpo: %', f.firma, format('select retail.fn_exige_dinero_de_compras(%L);', v_que);
      end if;
    end if;

    -- 5.2 El filtro por tienda (ADR-0150): «de mi sede» → «de mis tiendas de compra». Token suelto: sirve con o sin `retail.`.
    v_nuevo := replace(v_nuevo, 'fn_puede_ver_compra(', 'fn_compra_es_de_mis_tiendas(');

    if v_nuevo <> v_def then
      execute v_nuevo;
      v_arregladas := v_arregladas || f.firma;
    end if;
  end loop;

  return v_arregladas;
end;
$$;

comment on function retail.fn_aplicar_candado_de_dinero() is
  'ADR-0126 + ADR-0150. Deja las 5 funciones de indicadores de dinero de Compras (resumen_compras, resumen_compras_extra, deuda_por_vencimiento, salidas_caja_30d, por_pagar_tramos) con (1) el candado fn_exige_dinero_de_compras y (2) el filtro por tienda fn_compra_es_de_mis_tiendas en vez de fn_puede_ver_compra, sea cual sea su firma. Idempotente. Devuelve las firmas que arregló ({} = todo estaba bien). Correrla después de pegar cualquier migración que recree una de esas funciones.';

revoke all on function retail.fn_aplicar_candado_de_dinero() from public, anon, authenticated;

select retail.fn_aplicar_candado_de_dinero() as funciones_arregladas;

-- ==================== 6. comprobación final (aborta si algo quedó a medias) ====================
do $$
declare v text[];
begin
  -- Ninguna de las cinco debe quedar con el filtro por sede.
  if exists (
    select 1 from pg_proc p
    where p.pronamespace = 'retail'::regnamespace
      and p.proname in ('resumen_compras', 'resumen_compras_extra', 'deuda_por_vencimiento', 'salidas_caja_30d', 'por_pagar_tramos')
      and position('fn_puede_ver_compra(' in pg_get_functiondef(p.oid)) > 0
  ) then
    raise exception 'Alguna función de indicadores sigue filtrando por sede (fn_puede_ver_compra)';
  end if;
  -- La red de seguridad debe encontrar todo en orden.
  v := retail.fn_aplicar_candado_de_dinero();
  if coalesce(array_length(v, 1), 0) <> 0 then
    raise exception 'fn_aplicar_candado_de_dinero todavía arregló %', v;
  end if;
  -- Las cinco políticas de lectura deben usar el filtro por tienda.
  if (select count(*) from pg_policies
      where schemaname = 'retail'
        and tablename in ('compras', 'compra_items', 'compra_pagos', 'compra_adjuntos', 'compra_notas_credito')
        and cmd = 'SELECT' and qual like '%fn_compra_es_de_mis_tiendas%') <> 5 then
    raise exception 'Las 5 políticas de lectura no quedaron con fn_compra_es_de_mis_tiendas';
  end if;
end;
$$;
