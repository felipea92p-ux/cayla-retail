-- ============================================================================
-- PROVEEDORES: VARIOS RUBROS POR PROVEEDOR (ADR-0211, Felipe 2026-09-25)
--
-- Hasta hoy `proveedores.rubro` era UN texto: un proveedor que vende polos Y casacas tenía que elegir uno, y
-- en la lista, al filtrar por «Casacas», no aparecía. Pasa a `rubros text[]`: todos los que vende.
--
-- Sigue siendo texto libre, sin vocabulario cerrado (la razón de ADR-0094 no cambió: agrupa, no cuadra
-- inventario). Lo que SÍ se vuelve imposible desde la base, con un CHECK y no con validación en pantalla:
--   · un rubro vacío o con espacios sobrantes,
--   · el mismo rubro dos veces en un proveedor («Polos» y «polos »),
--   · «sin rubro» escrito de dos formas: vacío es `{}` y nunca NULL (columna NOT NULL).
-- `fn_rubros_limpios` es la regla, y el CHECK exige que lo guardado ya esté limpio.
--
-- Cambian 4 funciones, todas por parche sobre su definición VIVA (como `pg_temp.reescribir` de 20260925150000),
-- porque fn_proveedores() tiene parches en vivo (20260923130000 y siguientes) que un `create function` copiado de
-- un archivo viejo desharía:
--   · fn_proveedores()                 devuelve `rubros text[]` en el lugar de `rubro text`.
--   · registrar_proveedor(…)           `p_rubro text` → `p_rubros text[]` (mismo lugar).
--   · actualizar_proveedor(…)          `p_rubro text` → `p_rubros text[]` (mismo lugar).
--   · registrar_proveedor_de_gasto(…)  el proveedor que nace desde Gastos lleva `{Gastos}`.
-- Ninguna vista usa la columna (consultado en producción el 2026-09-25: `compras_resumen` depende de la
-- tabla, no de `rubro`). `proveedores_produccion.rubro` (Taller) es otra tabla y otro vocabulario: no se toca.
--
-- Orden al pegar: ESTE SQL primero y enseguida el despliegue de la web. Entre uno y otro, la web vieja no ve los
-- rubros en la lista y «Guardar» en un proveedor falla con un error que se puede reintentar (no guarda a
-- medias). Al revés (web nueva con la base vieja) la lista no mostraría rubros y guardar fallaría igual.
--
-- Se puede pegar dos veces: cada paso mira si ya está hecho. Una sola transacción: la columna nueva, las
-- funciones y el retiro de la columna vieja entran juntos o no entra nada. No crea políticas (ADR-0195).
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. la regla: qué es una lista de rubros limpia ----------
-- Recorta y junta espacios, quita vacíos y NULL, y deja uno solo por rubro con la misma clave que ya agrupa
-- nombres en todo el sistema (`fn_clave_texto`: sin tildes, sin mayúsculas). Conserva el primero en el orden en
-- que se eligieron. IMMUTABLE: la usa un CHECK.
create or replace function retail.fn_rubros_limpios(p_rubros text[])
returns text[] language sql immutable set search_path = retail, public, extensions as $$
  select coalesce(array_agg(t.r order by t.primera), '{}'::text[])
    from (
      select distinct on (retail.fn_clave_texto(x.r)) x.r, x.ord as primera
        from (select btrim(regexp_replace(u.r, '\s+', ' ', 'g')) as r, u.ord
                from unnest(p_rubros) with ordinality as u(r, ord)) x
       where retail.fn_clave_texto(x.r) is not null
       order by retail.fn_clave_texto(x.r), x.ord
    ) t;
$$;

comment on function retail.fn_rubros_limpios(text[]) is
  'ADR-0211: rubros de un proveedor sin vacíos, sin espacios sobrantes y sin repetidos (misma clave que fn_clave_texto), en el orden en que se eligieron. NULL o vacío → {}.';

revoke all on function retail.fn_rubros_limpios(text[]) from public, anon;
grant execute on function retail.fn_rubros_limpios(text[]) to authenticated;

-- ---------- 2. la columna nueva y la copia de lo que ya había ----------
alter table retail.proveedores add column if not exists rubros text[] not null default '{}';

do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'retail' and table_name = 'proveedores' and column_name = 'rubro') then
    -- Cada proveedor conserva su rubro de hoy como el primero de su lista. Nunca pisa una lista ya escrita.
    execute $q$
      update retail.proveedores
         set rubros = retail.fn_rubros_limpios(array[rubro])
       where rubros = '{}' and retail.fn_clave_texto(rubro) is not null
    $q$;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'retail.proveedores'::regclass and conname = 'proveedores_rubros_limpios') then
    alter table retail.proveedores
      add constraint proveedores_rubros_limpios check (rubros = retail.fn_rubros_limpios(rubros));
  end if;
end $$;

comment on column retail.proveedores.rubros is
  'ADR-0211: todo lo que vende el proveedor (Polos, Casacas…). Texto libre sin vocabulario cerrado (ADR-0094). Sin rubro = {} (nunca NULL); sin vacíos ni repetidos: lo exige el CHECK proveedores_rubros_limpios.';

-- ---------- 3. las funciones, parchadas sobre su definición viva ----------
-- Un texto literal como patrón: escapa lo especial y acepta cualquier espacio o salto de línea donde hay espacios.
create or replace function pg_temp.lit_rubros_110000(p text) returns text language sql immutable as $f$
  select regexp_replace(regexp_replace(p, '([.^$*+?(){}|\[\]\\])', '\\\1', 'g'), '\s+', '\\s+', 'g');
$f$;

-- `p_cambios` va de a tres: patrón, reemplazo y cuántas veces TIENE que aparecer el patrón. Si aparece otro número
-- de veces, la función cambió en la base y la migración se detiene sin tocar nada. La vieja se quita ANTES de crear
-- la nueva: fn_proveedores() cambia lo que devuelve (`create or replace` no lo permite) y las otras dos cambian el
-- tipo de un parámetro (sin quitarla quedarían dos firmas vivas, el bug de ADR-0009). Se copian sus permisos.
create or replace function pg_temp.reescribir_rubros_110000(p_firma text, p_firma_nueva text, p_marca text, p_cambios text[])
returns void language plpgsql as $f$
declare
  v_vieja regprocedure := to_regprocedure(p_firma);
  v_nueva regprocedure := to_regprocedure(p_firma_nueva);
  v_def text; v_hay integer; v_auth boolean; i integer;
begin
  -- ¿Ya está? (la migración se puede pegar dos veces)
  if v_nueva is not null and position(p_marca in pg_get_functiondef(v_nueva)) > 0 then
    if v_vieja is not null and v_vieja <> v_nueva then
      execute 'drop function ' || v_vieja::text;
    end if;
    return;
  end if;
  if v_vieja is null then
    raise exception '%: no está en la base. Revisar antes de pegar.', p_firma;
  end if;
  v_def := pg_get_functiondef(v_vieja);
  for i in 1 .. coalesce(array_length(p_cambios, 1), 0) / 3 loop
    select count(*) into v_hay from regexp_matches(v_def, p_cambios[3 * i - 2], 'g');
    if v_hay <> p_cambios[3 * i]::integer then
      raise exception '%: se esperaban % apariciones de «%» y hay %. La función cambió en la base: revisar antes de pegar.',
        p_firma, p_cambios[3 * i], p_cambios[3 * i - 2], v_hay;
    end if;
    v_def := regexp_replace(v_def, p_cambios[3 * i - 2], p_cambios[3 * i - 1], 'g');
  end loop;
  if position(p_marca in v_def) = 0 then
    raise exception '%: el parche no dejó su marca «%».', p_firma, p_marca;
  end if;
  if v_def ~ '\mrubro\M|\m[pv]_rubro\M' then
    raise exception '%: después del parche todavía menciona «rubro». Revisar antes de pegar.', p_firma;
  end if;
  v_auth := has_function_privilege('authenticated', v_vieja, 'execute');
  execute 'drop function ' || v_vieja::text;
  execute v_def;
  v_nueva := to_regprocedure(p_firma_nueva);
  execute format('revoke all on function %s from public, anon', v_nueva);
  if v_auth then
    execute format('grant execute on function %s to authenticated', v_nueva);
  else
    execute format('revoke all on function %s from authenticated', v_nueva);
  end if;
end $f$;

do $do$
begin
  -- La lista de Proveedores (y la vista rápida): todos los rubros de cada uno.
  perform pg_temp.reescribir_rubros_110000('retail.fn_proveedores()', 'retail.fn_proveedores()',
    'rubros text[]', array[
      pg_temp.lit_rubros_110000($q$facturas_atrasadas bigint, rubro text,$q$),
      $q$facturas_atrasadas bigint, rubros text[],$q$, '1',
      -- en el select y en el group by
      pg_temp.lit_rubros_110000($q$p.rubro,$q$), $q$p.rubros,$q$, '2'
    ]);

  -- Alta desde Compras ▸ Proveedores.
  perform pg_temp.reescribir_rubros_110000(
    'retail.registrar_proveedor(text,text,text,text,integer,text,text,text,text)',
    'retail.registrar_proveedor(text,text,text,text[],integer,text,text,text,text)',
    'retail.fn_rubros_limpios(p_rubros)', array[
      pg_temp.lit_rubros_110000($q$p_rubro text DEFAULT NULL::text$q$), $q$p_rubros text[] DEFAULT NULL::text[]$q$, '1',
      pg_temp.lit_rubros_110000($q$v_rubro text := retail.fn_texto_o_null(p_rubro);$q$),
      $q$v_rubros text[] := retail.fn_rubros_limpios(p_rubros);$q$, '1',
      pg_temp.lit_rubros_110000($q$(nombre, ruc, contacto, rubro,$q$), $q$(nombre, ruc, contacto, rubros,$q$, '1',
      pg_temp.lit_rubros_110000($q$(v_nombre, v_ruc, v_contacto, v_rubro,$q$), $q$(v_nombre, v_ruc, v_contacto, v_rubros,$q$, '1'
    ]);

  -- Editar desde la lista o la ficha. Mandar la lista vacía (o nada) deja al proveedor sin rubro, como antes.
  perform pg_temp.reescribir_rubros_110000(
    'retail.actualizar_proveedor(uuid,text,text,text,text,integer,text,text,text,text)',
    'retail.actualizar_proveedor(uuid,text,text,text,text[],integer,text,text,text,text)',
    'retail.fn_rubros_limpios(p_rubros)', array[
      pg_temp.lit_rubros_110000($q$p_rubro text DEFAULT NULL::text$q$), $q$p_rubros text[] DEFAULT NULL::text[]$q$, '1',
      pg_temp.lit_rubros_110000($q$v_rubro text := retail.fn_texto_o_null(p_rubro);$q$),
      $q$v_rubros text[] := retail.fn_rubros_limpios(p_rubros);$q$, '1',
      pg_temp.lit_rubros_110000($q$rubro = v_rubro,$q$), $q$rubros = v_rubros,$q$, '1'
    ]);

  -- El proveedor que se suma al registrar un gasto (Finanzas ▸ Gastos) nace con el rubro «Gastos», como antes.
  perform pg_temp.reescribir_rubros_110000(
    'retail.registrar_proveedor_de_gasto(text,text)', 'retail.registrar_proveedor_de_gasto(text,text)',
    $q$array['Gastos']$q$, array[
      pg_temp.lit_rubros_110000($q$(nombre, ruc, rubro) values (v_nombre, v_ruc, 'Gastos')$q$),
      $q$(nombre, ruc, rubros) values (v_nombre, v_ruc, array['Gastos'])$q$, '1'
    ]);
end $do$;

drop function pg_temp.reescribir_rubros_110000(text, text, text, text[]);
drop function pg_temp.lit_rubros_110000(text);

-- ---------- 4. la columna vieja se va, solo si nada se perdió al copiar ----------
do $$
declare
  v_sin_copiar integer;
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'retail' and table_name = 'proveedores' and column_name = 'rubro') then
    execute $q$
      select count(*) from retail.proveedores
       where retail.fn_clave_texto(rubro) is not null
         and not (retail.fn_clave_texto(rubro) = any (select retail.fn_clave_texto(r) from unnest(rubros) r))
    $q$ into v_sin_copiar;
    if v_sin_copiar > 0 then
      raise exception '% proveedores tienen un rubro que no pasó a la lista nueva. No se quita la columna vieja.', v_sin_copiar;
    end if;
    alter table retail.proveedores drop column rubro;
  end if;
end $$;

notify pgrst, 'reload schema';
