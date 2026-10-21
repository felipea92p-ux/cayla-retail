-- Datos bancarios de proveedores: solo quien paga los ve, y cada cambio deja rastro (2026-10-13, auditoría de 20 puntos,
-- punto 18; decisiones de Felipe del mismo día). Una sola parte, sin políticas. (La política de los códigos de descuento que se
-- pensó como parte 2 se descartó: `registrar_venta` ya no usa códigos desde 20261002100000, «descuento sin código».)
--
-- POR QUÉ. Los datos para pagar a un proveedor (CCI, cuenta, Yape o Plin, titular) son de quien paga, no de todo el ERP; y un
-- cambio de cuenta antes de un pago tiene que dejar rastro de quién y cuándo, para poder confirmarlo con el proveedor.
--
-- LO QUE DECIDIÓ FELIPE (2026-10-13):
--   · Los datos bancarios los ve solo quien ve Proveedores, Por pagar (Compras) o Cuentas y dinero (Finanzas):
--     `fn_puede_ver_datos_bancarios()`, la única regla; también quien puede editar un proveedor (la llave de su ficha), para que
--     guardar una edición nunca borre una cuenta que no se veía.
--   · Cada cambio de cuenta queda en un historial y al líder le aparece un aviso en el Inicio (no se bloquea el pago).
--
-- LA SALIDA.
--   1. `fn_puede_ver_datos_bancarios()`.
--   2. La tabla deja de entregar las seis columnas bancarias en una lectura directa: `select` por columna para `authenticated`,
--      todas MENOS banco, cuenta_bancaria, cci, celular_billetera, billeteras y titular_cuenta. Las escrituras siguen por sus
--      funciones (`registrar_proveedor`, `actualizar_proveedor`, `guardar_cuentas_proveedor`), que no cambian.
--      OJO al agregar una columna a `proveedores`: ya no hay `select` de tabla entera; hay que darle `grant select (<columna>)`
--      a `authenticated` o la pantalla que la lea recibirá «permission denied for column».
--   3. `fn_proveedores()` devuelve esas seis columnas en NULL a quien no puede verlas (reemplazo anclado sobre las dos líneas
--      que las listan, idénticas en local y en producción el 2026-10-13 aunque el resto de la función difiere por ADR-0387).
--   4. `fn_proveedor_datos_bancarios(id)`: la ficha del proveedor los lee por aquí (cero filas si no puede verlos).
--   5. `proveedores_cambios_bancarios`: una fila por campo que cambió (antes, después, quién, cuándo), escrita por un disparador
--      en la misma transacción que el cambio, venga de la función que venga. Solo se lee por funciones: RLS encendido sin
--      políticas y sin permisos para las cuentas.
--   6. `fn_cuentas_bancarias_cambiadas(dias)`: lo que el aviso del Inicio necesita, solo para el líder; cuenta solo una cuenta que
--      ya existía y cambió, hecha por otra persona (la primera carga y los cambios propios no encienden el aviso).
--      `fn_proveedor_cambios_bancarios(id)`: el detalle en la ficha, para quien puede ver datos bancarios.
--
-- DECIDÍ: permisos por columna sobre la tabla de siempre.
-- DESCARTÉ: mover los datos bancarios a una tabla aparte con su propia política, porque obliga a migrar los datos y a reescribir
-- las tres funciones que escriben y la ficha, para el mismo resultado; hoy no hay ningún proveedor con datos bancarios en
-- producción, pero el día que los haya el modelo tiene que estar cerrado.
-- SE ROMPE SI: alguien vuelve a dar `grant select on retail.proveedores to authenticated` (tabla entera) en una migración de
-- permisos: las seis columnas volverían a estar a la vista. Lo vigila `pnpm pruebas:datos-sensibles-proveedores`.
--
-- PRODUCCIÓN. PRIMERO se publica la web y DESPUÉS se pega esto, solo. La web nueva tolera que las funciones todavía no existan
-- (lee la cuenta como antes); la web vieja, en cambio, se caería en la ficha del proveedor si el permiso por columna llega antes
-- que ella. Re-pegable. El `revoke`/`grant` y el disparador toman un candado breve sobre `proveedores` (87 filas, se usa poco):
-- `lock_timeout = 3s`. La última línea dice «QUEDÓ BIEN».

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- 1. La regla única. --------------------------------------------------------------------------------------------------------

create or replace function retail.fn_puede_ver_datos_bancarios()
returns boolean
language sql
stable
security definer
set search_path to 'retail', 'public', 'extensions'
as $$
  -- Quien puede EDITAR un proveedor también ve su cuenta (`fn_puede_gestionar_proveedores`, la llave de la ficha): si no, al
  -- guardar cualquier cambio la edición mandaría banco y cuenta en blanco y `actualizar_proveedor` borraría los datos reales.
  select retail.fn_puede_gestionar_proveedores()
      or retail.fn_ve_modulo('proveedores') or retail.fn_ve_modulo('por_pagar') or retail.fn_ve_modulo('cuentas_dinero');
$$;
revoke all on function retail.fn_puede_ver_datos_bancarios() from public, anon;
grant execute on function retail.fn_puede_ver_datos_bancarios() to authenticated;
comment on function retail.fn_puede_ver_datos_bancarios() is
  'Quién ve el CCI, la cuenta, el Yape y el titular de los proveedores: quien ve Proveedores, Por pagar o Cuentas y dinero (Felipe 2026-10-13).';

-- 2. La tabla ya no entrega las columnas bancarias en una lectura directa. ---------------------------------------------------
--
-- Antes, la vista `compras_resumen` (security_invoker: corre con los permisos de quien la lee; la usa `listar_compras`, que
-- devuelve exactamente su forma) mostraba `p.banco` y `p.cuenta_bancaria`. Con el permiso por columna, esa vista fallaría
-- entera para todos, líder incluido («permission denied for table proveedores»). Ninguna pantalla ni función lee esas dos
-- columnas de la vista (buscado en la web y en las funciones el 2026-10-13), así que pasan a NULL con el mismo nombre y tipo
-- (`create or replace view` exige conservarlos). Reemplazo anclado: si la vista cambió, aborta sin tocar nada.
do $$
declare
  v_def text := pg_get_viewdef('retail.compras_resumen'::regclass);
begin
  if position('NULL::text AS proveedor_banco' in v_def) > 0 then
    return; -- ya se aplicó
  end if;
  if (select count(*) from regexp_matches(v_def, 'p\.banco AS proveedor_banco', 'g')) <> 1
     or (select count(*) from regexp_matches(v_def, 'p\.cuenta_bancaria AS proveedor_cuenta_bancaria', 'g')) <> 1 then
    raise exception 'compras_resumen cambió desde que se escribió esta migración (no encuentra banco y cuenta del proveedor una vez cada uno): regenera este reemplazo.';
  end if;
  v_def := replace(v_def, 'p.banco AS proveedor_banco', 'NULL::text AS proveedor_banco');
  v_def := replace(v_def, 'p.cuenta_bancaria AS proveedor_cuenta_bancaria', 'NULL::text AS proveedor_cuenta_bancaria');
  execute 'create or replace view retail.compras_resumen with (security_invoker = true) as ' || v_def;
end;
$$;

do $$
declare
  v_columnas text;
begin
  revoke select on retail.proveedores from authenticated, anon;
  v_columnas := (
    select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
      from information_schema.columns
     where table_schema = 'retail' and table_name = 'proveedores'
       and column_name not in ('banco', 'cuenta_bancaria', 'cci', 'celular_billetera', 'billeteras', 'titular_cuenta')
  );
  execute format('grant select (%s) on retail.proveedores to authenticated', v_columnas);
end;
$$;

comment on column retail.proveedores.cci is
  'Dato bancario: no se lee directo (permiso por columna). Se lee con fn_proveedor_datos_bancarios o fn_proveedores, si fn_puede_ver_datos_bancarios.';

-- 3. fn_proveedores: las seis columnas en NULL para quien no puede verlas. ---------------------------------------------------

create or replace function pg_temp.reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  -- Re-ejecutable: si el texto nuevo ya está puesto, no se vuelve a parchear.
  if position(p_nuevo in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

select pg_temp.reemplazar(
  'retail.fn_proveedores()',
  $viejo$  select p.id, p.nombre, p.ruc, p.contacto, p.telefono, p.banco, p.cuenta_bancaria, p.activo,
$viejo$,
  $nuevo$  select p.id, p.nombre, p.ruc, p.contacto, p.telefono,
         -- Datos bancarios solo para quien paga (Felipe 2026-10-13, auditoría punto 18). `(select …)`: Postgres calcula el permiso
         -- UNA vez por consulta, no seis por fila (medido en local: 1,3 ms contra 462 ms con 87 proveedores).
         case when (select retail.fn_puede_ver_datos_bancarios()) then p.banco end,
         case when (select retail.fn_puede_ver_datos_bancarios()) then p.cuenta_bancaria end,
         p.activo,
$nuevo$,
  1
);

select pg_temp.reemplazar(
  'retail.fn_proveedores()',
  $viejo$         p.cci, p.celular_billetera, p.billeteras, p.titular_cuenta
  from retail.proveedores p
$viejo$,
  $nuevo$         case when (select retail.fn_puede_ver_datos_bancarios()) then p.cci end,
         case when (select retail.fn_puede_ver_datos_bancarios()) then p.celular_billetera end,
         case when (select retail.fn_puede_ver_datos_bancarios()) then p.billeteras end,
         case when (select retail.fn_puede_ver_datos_bancarios()) then p.titular_cuenta end
  from retail.proveedores p
$nuevo$,
  1
);

-- 4. La ficha lee los datos bancarios por aquí. ------------------------------------------------------------------------------

create or replace function retail.fn_proveedor_datos_bancarios(p_proveedor_id uuid)
returns table (banco text, cuenta_bancaria text, cci text, celular_billetera text, billeteras text[], titular_cuenta text)
language sql
stable
security definer
set search_path to 'retail', 'public', 'extensions'
as $$
  select p.banco, p.cuenta_bancaria, p.cci, p.celular_billetera, p.billeteras, p.titular_cuenta
    from retail.proveedores p
   where p.id = p_proveedor_id
     and retail.fn_tiene_acceso_retail()
     and retail.fn_puede_ver_datos_bancarios();
$$;
revoke all on function retail.fn_proveedor_datos_bancarios(uuid) from public, anon;
grant execute on function retail.fn_proveedor_datos_bancarios(uuid) to authenticated;

-- 5. El historial de cambios de cuenta. --------------------------------------------------------------------------------------

create table if not exists retail.proveedores_cambios_bancarios (
  id uuid primary key default gen_random_uuid(),
  proveedor_id uuid not null references retail.proveedores (id),
  campo text not null check (campo in ('banco', 'cuenta_bancaria', 'cci', 'celular_billetera', 'billeteras', 'titular_cuenta')),
  antes text,
  despues text,
  cambiado_por uuid,
  cambiado_en timestamptz not null default now(),
  constraint proveedores_cambios_bancarios_cambio_real check (antes is distinct from despues)
);
create index if not exists proveedores_cambios_bancarios_reciente_idx on retail.proveedores_cambios_bancarios (cambiado_en desc);
create index if not exists proveedores_cambios_bancarios_proveedor_idx on retail.proveedores_cambios_bancarios (proveedor_id, cambiado_en desc);
alter table retail.proveedores_cambios_bancarios enable row level security;
revoke all on table retail.proveedores_cambios_bancarios from public, anon, authenticated;
comment on table retail.proveedores_cambios_bancarios is
  'Cada cambio del CCI, la cuenta, el Yape o el titular de un proveedor (Felipe 2026-10-13): antes, después, quién y cuándo. Lo escribe un disparador; nadie lo edita ni lo borra. Se lee por funciones.';

create or replace function retail.fn_proveedores_anotar_cambio_bancario()
returns trigger
language plpgsql
security definer
set search_path to 'retail', 'public', 'extensions'
as $$
declare
  v_persona uuid;
begin
  -- Quién firmó el cambio (el responsable del combo, ADR-0162). Si no se puede saber (SQL Editor), queda sin persona: el cambio
  -- se anota igual, porque un historial con huecos no sirve para investigar un pago a la cuenta equivocada.
  begin
    v_persona := retail.fn_actor_persona_id(true);
  exception when others then
    v_persona := null;
  end;
  insert into retail.proveedores_cambios_bancarios (proveedor_id, campo, antes, despues, cambiado_por)
  select new.id, c.campo, c.antes, c.despues, v_persona
    from (values
      ('banco', case when tg_op = 'UPDATE' then old.banco end, new.banco),
      ('cuenta_bancaria', case when tg_op = 'UPDATE' then old.cuenta_bancaria end, new.cuenta_bancaria),
      ('cci', case when tg_op = 'UPDATE' then old.cci end, new.cci),
      ('celular_billetera', case when tg_op = 'UPDATE' then old.celular_billetera end, new.celular_billetera),
      ('billeteras', case when tg_op = 'UPDATE' then array_to_string(old.billeteras, ', ') end, array_to_string(new.billeteras, ', ')),
      ('titular_cuenta', case when tg_op = 'UPDATE' then old.titular_cuenta end, new.titular_cuenta)
    ) as c(campo, antes, despues)
   where nullif(c.antes, '') is distinct from nullif(c.despues, '');
  return null;
end;
$$;
revoke all on function retail.fn_proveedores_anotar_cambio_bancario() from public, anon, authenticated;

create or replace trigger proveedores_anotar_cambio_bancario
  after insert or update of banco, cuenta_bancaria, cci, celular_billetera, billeteras, titular_cuenta on retail.proveedores
  for each row execute function retail.fn_proveedores_anotar_cambio_bancario();

-- 6. Lo que leen el aviso del Inicio y la ficha. -----------------------------------------------------------------------------

create or replace function retail.fn_cuentas_bancarias_cambiadas(p_dias integer default 7)
returns jsonb
language sql
stable
security definer
set search_path to 'retail', 'public', 'extensions'
as $$
  -- El aviso es para el líder (Felipe 2026-10-13): a cualquier otra cuenta le responde null. Cuenta solo lo que merece una
  -- llamada al proveedor: una cuenta que YA EXISTÍA y cambió (`antes` no vacío), y no la que cambió la propia persona que mira.
  -- La primera carga de datos de un proveedor queda en el historial de su ficha, pero no enciende el aviso: al cargar los 87
  -- proveedores, un aviso fijo de una semana se aprendería a ignorar.
  select case when not retail.fn_es_lider() then null else (
    select jsonb_build_object(
             'cambios', count(*),
             'proveedores', count(distinct x.proveedor_id),
             'ultimo_proveedor_id', (array_agg(x.proveedor_id order by x.cambiado_en desc))[1],
             'ultimo_proveedor', (array_agg(p.nombre order by x.cambiado_en desc))[1],
             'ultimo_en', max(x.cambiado_en),
             'primero_en', min(x.cambiado_en))
      from retail.proveedores_cambios_bancarios x
      join retail.proveedores p on p.id = x.proveedor_id
     where x.cambiado_en > now() - make_interval(days => greatest(coalesce(p_dias, 7), 1))
       and nullif(x.antes, '') is not null
       and x.cambiado_por is distinct from retail.fn_actor_persona_id(false)
  ) end;
$$;
revoke all on function retail.fn_cuentas_bancarias_cambiadas(integer) from public, anon;
grant execute on function retail.fn_cuentas_bancarias_cambiadas(integer) to authenticated;

create or replace function retail.fn_proveedor_cambios_bancarios(p_proveedor_id uuid)
returns table (campo text, antes text, despues text, cambiado_por_nombre text, cambiado_en timestamptz)
language sql
stable
security definer
set search_path to 'retail', 'public', 'extensions'
as $$
  select x.campo, x.antes, x.despues, nullif(concat_ws(' ', pe.nombres, pe.apellidos), ''), x.cambiado_en
    from retail.proveedores_cambios_bancarios x
    left join public.personas pe on pe.id = x.cambiado_por
   where x.proveedor_id = p_proveedor_id
     and retail.fn_tiene_acceso_retail()
     and retail.fn_puede_ver_datos_bancarios()
   order by x.cambiado_en desc
   limit 50;
$$;
revoke all on function retail.fn_proveedor_cambios_bancarios(uuid) from public, anon;
grant execute on function retail.fn_proveedor_cambios_bancarios(uuid) to authenticated;

-- ¿SE PEGÓ ENTERO? Esta es la ÚLTIMA instrucción del archivo. Si no ves «QUEDÓ BIEN», es seguro volver a pegarlo completo.
select '20261013161000 · datos bancarios de proveedores' as parte,
       case when not has_column_privilege('authenticated', 'retail.proveedores', 'cci', 'select')
             and has_column_privilege('authenticated', 'retail.proveedores', 'nombre', 'select')
             and pg_get_functiondef('retail.fn_proveedores()'::regprocedure) like '%fn_puede_ver_datos_bancarios()) then p.titular_cuenta%'
             and exists (select 1 from pg_trigger where tgrelid = 'retail.proveedores'::regclass and tgname = 'proveedores_anotar_cambio_bancario')
             and pg_get_viewdef('retail.compras_resumen'::regclass) like '%NULL::text AS proveedor_cuenta_bancaria%'
            then 'QUEDÓ BIEN' else 'REVISAR: falta algún paso' end as resultado;
