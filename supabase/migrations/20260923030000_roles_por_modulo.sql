-- ============================================================================
-- 20260923030000_roles_por_modulo.sql — CAYLA V2
--
-- ADR-0150 (roles a medida) RETOMADO por el ADR-0161 (sección B), con las terminales del ADR-0162 dentro.
-- Fases F1+F2+F3 del ADR-0150, adaptadas a la regla vigente: un rol decide SOLO «ve / no ve» por MÓDULO.
--
-- EL PROBLEMA PRIMERO. Hasta hoy quién ve qué estaba fijo en dos lugares: en el código (`lib/menu.ts`, `permisosDe`)
-- y en la base (`fn_puede_*()` = «líder O terminal de tal tipo»). Para crear un «Almacén» que solo mueva mercadería,
-- o para cambiar lo que ve la terminal de ventas, había que tocar código y migraciones. Ahora es un dato: cada cuenta
-- (una persona o una terminal) tiene UN rol, y el rol es la lista de módulos que ve.
--
-- LA REGLA (Felipe, 2026-09-22 — ADR-0161 B2, B2b, B2c)
--   · Quien ve un módulo hace todo lo que hay en él, SALVO la lista fija «siempre solo del líder» (anular ventas y
--     comprobantes, series SUNAT, descuento sobre el tope, aprobar devoluciones, costos y montos de Compras, etiquetas
--     con descuento). Esa lista NO vive aquí: sigue en cada función con `fn_es_lider()`, como hoy.
--   · Colaboradores, y Roles y accesos, nunca se delegan (`modulos.solo_lider`).
--   · Solo «Líder de equipo» es fijo. «Integrante» se edita, pero no se archiva (es el rol de una persona nueva).
--     Los roles se archivan, nunca se borran. Un rol por cuenta. Solo el líder administra roles.
--
-- QUÉ HACE
--   1. `retail.modulos`: el catálogo de los 23 módulos del spike aprobado, con lo que `incluye` cada uno.
--      `delegable = false` es «Solo líder por ahora»: la base todavía exige `fn_es_lider()` en sus funciones, así
--      que encenderlo en un rol abriría una pantalla que falla al guardar (principio 2). Se rechaza.
--   2. `retail.roles`, `retail.rol_modulos` y `retail.roles_historial` (solo se agrega: disparador que impide update,
--      delete y truncate).
--   3. `rol_id` en `colaboradores`, `colaboradores_suspendidos` (suspender y reactivar conservan el rol) y
--      `terminales`. Un disparador mantiene `rol = 'lider'` ⇔ `rol_id = Líder` en ambas direcciones.
--   4. `fn_ve_modulo(clave)` y `fn_mis_modulos()`: qué ve la cuenta de la sesión.
--   5. RPC de escritura, todas solo del líder y todas anotan el historial: `crear_rol`, `guardar_modulos_rol`,
--      `renombrar_rol`, `archivar_rol`, `restaurar_rol`, `asignar_rol`.
--   6. PUNTO DE ENCHUFE (ADR-0161 C3): las 4 capacidades `fn_puede_gestionar_caja / ajustar_inventario /
--      editar_catalogo / editar_cuentas_proveedor` pasan a «líder O su rol ve el módulo». Las 23 funciones y
--      15 políticas que las llaman NO se tocan. `fn_puede_dar_descuento_por_etiqueta` sigue siendo solo del líder.
--
-- COMPORTAMIENTO DE HOY INTACTO — y el conflicto que NO se decide aquí (ADR-0161 B2d)
--   Hoy un integrante VE Caja, Existencias, Conteo, Traslados y Productos, pero no cierra caja, no ajusta stock y no
--   edita el catálogo (ADR-0143). Con «quien ve un módulo hace todo», sembrar a Integrante con lo que ve hoy le abriría
--   esos poderes; sembrarlo sin esos módulos le cambiaría el menú. Felipe todavía no confirmó B2d. Por eso:
--     `roles.limitado_como_hoy = true` (solo Integrante nace así): el rol VE sus módulos pero NO recibe las 4
--     capacidades de escritura. Es el integrante de hoy, exacto. Cuando Felipe decida:
--       · «que integrante haga todo lo que ve»   → update retail.roles set limitado_como_hoy = false where clave = 'integrante';
--       · «que integrante no vea esos módulos»   → apagarlos en la pantalla Roles y accesos.
--   Los roles a medida y los de terminal nacen con `limitado_como_hoy = false`: aplican B2 al pie de la letra.
--
-- UNA CAPACIDAD, VARIOS MÓDULOS. `fn_puede_ajustar_inventario` la usan ajustar stock (Existencias), cerrar conteo
--   (Conteos) y cerrar un traslado con diferencia (Traslados); `fn_puede_editar_catalogo`, Productos y Categorías/
--   atributos. Sin tocar a quienes la llaman no se puede saber desde qué módulo se pide, así que la capacidad se da si
--   el rol ve CUALQUIERA de sus módulos. Se eligió así para que ningún módulo encendido abra una pantalla que falla al
--   guardar (principio 2). El costo: un rol que ve solo Conteos podría, por API y no por pantalla, ajustar stock.
--   Se cierra cuando esas funciones pregunten por su propio módulo (fase siguiente, anotada en el BACKLOG).
--
-- SE ROMPE SI
--   · Otra migración recrea una `fn_puede_*()` desde el archivo viejo del ADR-0160: vuelve a «terminal de tal tipo»
--     y deja de leer el rol. Falla cerrado para los roles a medida; `pnpm pruebas:roles` lo detecta.
--   · Se agrega una terminal o un colaborador sin `rol_id`: el disparador le pone el rol de su tipo (nunca queda vacío).
--   · Se enciende un módulo cuyas funciones aún exigen `fn_es_lider()`: `delegable = false` lo impide.
--
-- Re-ejecutable: no pisa los módulos de un rol ya editado (la siembra corre solo al crear el rol).
-- Producción: se pega entera en el SQL Editor de cayla-dynamic (ya trae `retail.`).
-- ============================================================================

set search_path = retail, public, extensions;

-- ==================== 1. El catálogo de módulos ====================
create table if not exists retail.modulos (
  clave       text primary key check (clave ~ '^[a-z_]+$'),
  grupo       text not null,
  nombre      text not null,
  incluye     text not null,
  orden       integer not null,
  -- Nunca se delega, en ningún rol (ADR-0150 decisión 3): un rol con esa puerta podría darse más poder a sí mismo.
  solo_lider  boolean not null default false,
  -- «Solo líder por ahora»: sus funciones aún exigen `fn_es_lider()`. Pasa a true cuando se migren.
  delegable   boolean not null default true,
  constraint modulos_solo_lider_no_delegable check (not (solo_lider and delegable))
);

comment on table retail.modulos is
  'Los módulos que un rol puede ver (ADR-0161 B2). Quien ve un módulo hace todo lo que hay en él, salvo lo que sigue siendo solo del líder dentro de cada función. delegable=false: «Solo líder por ahora».';

insert into retail.modulos (clave, grupo, nombre, incluye, orden, solo_lider, delegable) values
  ('vender',          'Ventas',     'Punto de venta',                 'Registrar ventas, descuento hasta su tope, dejar en espera, monto manual', 10, false, true),
  ('caja',            'Ventas',     'Caja',                           'Abrir y cerrar caja, ingresos y egresos, ajustes de caja', 20, false, true),
  ('cambios',         'Ventas',     'Cambios',                        'Registrar cambios de prenda', 30, false, true),
  ('devoluciones',    'Ventas',     'Devoluciones',                   'Solicitar devoluciones', 40, false, true),
  ('historial',       'Ventas',     'Historial de ventas',            'Consultar, reimprimir y exportar', 50, false, true),
  ('facturacion',     'Ventas',     'Facturación',                    'Emitir boletas, facturas y notas; reenviar a SUNAT', 60, false, true),
  ('clientas',        'Ventas',     'Clientas',                       'Registrar, editar y archivar clientas; ver sus compras', 70, false, true),
  ('existencias',     'Inventario', 'Existencias',                    'Consultar stock, ajustar stock, apartar prendas', 80, false, true),
  ('conteos',         'Inventario', 'Conteos',                        'Iniciar, registrar y cerrar conteos', 90, false, true),
  ('traslados',       'Inventario', 'Traslados',                      'Enviar, recibir, cancelar y cerrar con diferencia', 100, false, true),
  ('movimientos',     'Inventario', 'Movimientos',                    'Consultar y exportar', 110, false, true),
  ('productos',       'Catálogo',   'Productos',                      'Crear, editar y archivar prendas; precios, fotos y códigos', 120, false, true),
  ('atributos',       'Catálogo',   'Categorías, marcas y atributos', 'Crear, editar, desactivar y aprobar propuestas', 130, false, true),
  ('etiquetas',       'Catálogo',   'Etiquetas',                      'Crear, editar y archivar etiquetas sin descuento', 140, false, false),
  ('facturas_compra', 'Compras',    'Facturas de compra',             'Registrar, corregir y anular facturas', 150, false, false),
  ('recibir',         'Compras',    'Recibir mercadería',             'Recibir envíos de proveedores', 160, false, true),
  ('por_pagar',       'Compras',    'Por pagar',                      'Ver lo que se debe y registrar pagos', 170, false, false),
  ('proveedores',     'Compras',    'Proveedores',                    'Crear, editar y archivar; cuentas bancarias, Yape y Plin', 180, false, true),
  ('notas_credito',   'Compras',    'Notas de crédito',               'Registrar y anular notas', 190, false, false),
  ('produccion',      'Producción', 'Órdenes de producción',          'Crear, editar y cancelar órdenes; registrar avance', 200, false, true),
  ('analisis',        'Gestión',    'Análisis',                       'Reportes de ventas e inventario', 210, false, false),
  ('colaboradores',   'Gestión',    'Colaboradores',                  'Dar y quitar accesos, suspender, cambiar ubicación', 220, true, false),
  ('roles',           'Gestión',    'Roles y accesos',                'Crear roles y asignarlos', 230, true, false)
on conflict (clave) do update set
  grupo = excluded.grupo, nombre = excluded.nombre, incluye = excluded.incluye, orden = excluded.orden,
  solo_lider = excluded.solo_lider, delegable = excluded.delegable;

-- ==================== 2. Roles, sus módulos y su historial ====================
create table if not exists retail.roles (
  id                uuid primary key default gen_random_uuid(),
  -- Los roles que siembra el sistema tienen clave estable (la usa esta migración para ser re-ejecutable); null = a medida.
  clave             text unique check (clave is null or clave in ('lider', 'integrante', 'terminal_ventas', 'terminal_administrativa')),
  nombre            text not null check (length(btrim(nombre)) between 1 and 60),
  descripcion       text check (descripcion is null or length(descripcion) <= 200),
  -- No se archiva (Líder, Integrante).
  es_sistema        boolean not null default false,
  -- No se edita (solo Líder: ve y hace todo, siempre).
  fijo              boolean not null default false,
  -- ADR-0161 B2d pendiente: VE sus módulos pero no recibe las 4 capacidades de escritura. Ver la cabecera.
  limitado_como_hoy boolean not null default false,
  creado_at         timestamptz not null default now(),
  creado_por        uuid references public.personas (id),
  archivado_at      timestamptz,
  archivado_por     uuid references public.personas (id),
  constraint roles_fijo_es_sistema check (not fijo or es_sistema),
  constraint roles_sistema_no_se_archiva check (not (es_sistema and archivado_at is not null))
);

comment on table retail.roles is
  'Roles de retail (ADR-0150 retomado por ADR-0161 B). Un rol = los módulos que ve. Se archivan, nunca se borran. Catálogo separado de los roles de Dynamic.';

create unique index if not exists roles_nombre_unico_vigente on retail.roles (lower(btrim(nombre))) where archivado_at is null;

create table if not exists retail.rol_modulos (
  rol_id  uuid not null references retail.roles (id),
  modulo  text not null references retail.modulos (clave),
  primary key (rol_id, modulo)
);

comment on table retail.rol_modulos is
  'Qué módulos ve cada rol. Solo se escribe con guardar_modulos_rol(); cada cambio queda en roles_historial con el antes y el después.';

create table if not exists retail.roles_historial (
  id          bigint generated always as identity primary key,
  rol_id      uuid not null references retail.roles (id),
  accion      text not null check (accion in ('creacion', 'modulos', 'renombre', 'archivo', 'restauracion', 'asignacion')),
  detalle     jsonb not null default '{}'::jsonb,
  hecho_por   uuid references public.personas (id),
  hecho_at    timestamptz not null default now()
);

comment on table retail.roles_historial is
  'Quién cambió qué rol y cuándo. Solo se agrega (disparador). Distinto de colaboradores_historial, que cuenta accesos.';

create or replace function retail.fn_roles_historial_inmutable() returns trigger
language plpgsql
set search_path = retail, public, extensions
as $$
begin
  raise exception 'El historial de roles solo se agrega: no se edita ni se borra' using errcode = '42501';
end;
$$;

drop trigger if exists roles_historial_inmutable on retail.roles_historial;
create trigger roles_historial_inmutable before update or delete on retail.roles_historial
  for each row execute function retail.fn_roles_historial_inmutable();
drop trigger if exists roles_historial_sin_truncate on retail.roles_historial;
create trigger roles_historial_sin_truncate before truncate on retail.roles_historial
  for each statement execute function retail.fn_roles_historial_inmutable();

-- Candado de coherencia de rol_modulos: nunca un módulo solo del líder, ni uno «solo líder por ahora», ni en el
-- rol fijo (Líder ya ve todo) ni en uno archivado. Vale también para un INSERT hecho a mano desde el SQL Editor.
create or replace function retail.fn_rol_modulos_coherente() returns trigger
language plpgsql
set search_path = retail, public, extensions
as $$
declare
  v_m retail.modulos;
  v_r retail.roles;
begin
  select * into v_m from retail.modulos where clave = new.modulo;
  select * into v_r from retail.roles where id = new.rol_id;
  if v_m.solo_lider then
    raise exception '«%» es siempre solo del líder: no se delega en ningún rol', v_m.nombre using errcode = '23514';
  end if;
  if not v_m.delegable then
    raise exception '«%» es solo del líder por ahora: la base todavía no lo deja hacer a nadie más', v_m.nombre using errcode = '23514';
  end if;
  if v_r.fijo then
    raise exception 'El rol % no se edita: ya ve todo', v_r.nombre using errcode = '23514';
  end if;
  if v_r.archivado_at is not null then
    raise exception 'El rol % está archivado: restáuralo antes de editarlo', v_r.nombre using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists rol_modulos_coherente on retail.rol_modulos;
create trigger rol_modulos_coherente before insert or update on retail.rol_modulos
  for each row execute function retail.fn_rol_modulos_coherente();

-- RLS: se lee el catálogo; los roles y su historial solo el líder; nadie escribe directo (solo por RPC).
alter table retail.modulos enable row level security;
alter table retail.roles enable row level security;
alter table retail.rol_modulos enable row level security;
alter table retail.roles_historial enable row level security;

drop policy if exists modulos_select on retail.modulos;
create policy modulos_select on retail.modulos for select to authenticated using (true);
drop policy if exists roles_select on retail.roles;
create policy roles_select on retail.roles for select to authenticated using (retail.fn_es_lider());
drop policy if exists rol_modulos_select on retail.rol_modulos;
create policy rol_modulos_select on retail.rol_modulos for select to authenticated using (retail.fn_es_lider());
drop policy if exists roles_historial_select on retail.roles_historial;
create policy roles_historial_select on retail.roles_historial for select to authenticated using (retail.fn_es_lider());

revoke all on retail.modulos, retail.roles, retail.rol_modulos, retail.roles_historial from anon;
revoke insert, update, delete, truncate on retail.modulos, retail.roles, retail.rol_modulos, retail.roles_historial from authenticated;
grant select on retail.modulos, retail.roles, retail.rol_modulos, retail.roles_historial to authenticated;
grant all on retail.modulos, retail.roles, retail.rol_modulos, retail.roles_historial to service_role;

-- ==================== 3. La siembra: los cuatro roles de hoy ====================
-- Solo se siembran los módulos de un rol el día que el rol NACE: re-ejecutar la migración no pisa lo que el líder editó.
-- Lo que ve cada uno sale del menú de hoy (`lib/menu.ts` + `menu-hoy.golden.json`, ADR-0160) — la prueba
-- `pnpm pruebas:roles` y `menu.test.ts` comprueban que el menú y las capacidades no cambian.
do $$
declare
  v_id uuid;
begin
  insert into retail.roles (clave, nombre, descripcion, es_sistema, fijo)
    values ('lider', 'Líder de equipo', 'Ve y hace todo, siempre', true, true)
    on conflict (clave) do nothing returning id into v_id;
  if v_id is not null then
    insert into retail.roles_historial (rol_id, accion, detalle) values (v_id, 'creacion', '{"origen":"migracion 20260923030000"}');
  end if;

  v_id := null;
  insert into retail.roles (clave, nombre, descripcion, es_sistema, limitado_como_hoy)
    values ('integrante', 'Integrante', 'Rol por defecto de una persona nueva', true, true)
    on conflict (clave) do nothing returning id into v_id;
  if v_id is not null then
    -- Lo que un integrante ve HOY en el menú (tienda, almacén y, parado en el Taller, Producción), más Clientas
    -- (spike). Sin Facturación (exige `facturar`), sin Compras (exige `verDinero`), sin Análisis (`analizar`).
    insert into retail.rol_modulos (rol_id, modulo)
      select v_id, m from unnest(array['vender', 'caja', 'cambios', 'devoluciones', 'historial', 'clientas',
        'existencias', 'conteos', 'traslados', 'movimientos', 'productos', 'atributos', 'recibir', 'produccion']) m;
    insert into retail.roles_historial (rol_id, accion, detalle) values (v_id, 'creacion', '{"origen":"migracion 20260923030000"}');
  end if;

  v_id := null;
  insert into retail.roles (clave, nombre, descripcion)
    values ('terminal_ventas', 'Terminal de ventas', 'Cuenta compartida por tienda: el mostrador')
    on conflict (clave) do nothing returning id into v_id;
  if v_id is not null then
    -- ADR-0160: Ventas entero (con Facturación y la caja), más Clientas (spike).
    insert into retail.rol_modulos (rol_id, modulo)
      select v_id, m from unnest(array['vender', 'caja', 'cambios', 'devoluciones', 'historial', 'facturacion', 'clientas']) m;
    insert into retail.roles_historial (rol_id, accion, detalle) values (v_id, 'creacion', '{"origen":"migracion 20260923030000"}');
  end if;

  v_id := null;
  insert into retail.roles (clave, nombre, descripcion)
    values ('terminal_administrativa', 'Terminal administrativa', 'Cuenta compartida por tienda: inventario y catálogo')
    on conflict (clave) do nothing returning id into v_id;
  if v_id is not null then
    -- ADR-0160: Inventario (sin Análisis), Catálogo y las cuentas bancarias de proveedores. Proveedores no le
    -- aparece en el menú (Compras exige `verDinero`), pero su capacidad de hoy (`editar_cuentas_proveedor`) sale de ahí.
    insert into retail.rol_modulos (rol_id, modulo)
      select v_id, m from unnest(array['existencias', 'conteos', 'traslados', 'movimientos', 'recibir',
        'productos', 'atributos', 'proveedores']) m;
    insert into retail.roles_historial (rol_id, accion, detalle) values (v_id, 'creacion', '{"origen":"migracion 20260923030000"}');
  end if;
end $$;

create or replace function retail.fn_rol_por_clave(p_clave text) returns uuid
language sql stable security definer
set search_path = retail, public, extensions
as $$ select id from retail.roles where clave = p_clave; $$;

-- ==================== 4. rol_id en cada cuenta ====================
alter table retail.colaboradores add column if not exists rol_id uuid references retail.roles (id);
alter table retail.colaboradores_suspendidos add column if not exists rol_id uuid references retail.roles (id);
alter table retail.terminales add column if not exists rol_id uuid references retail.roles (id);

-- Una persona: `rol = 'lider'` ⇔ `rol_id = Líder`. Sin rol_id (alta nueva), Integrante (ADR-0161 B2c).
-- Es el único lugar que lo decide: `agregar_colaborador` y los demás no se tocan.
create or replace function retail.fn_colaborador_rol_coherente() returns trigger
language plpgsql
set search_path = retail, public, extensions
as $$
declare
  v_lider uuid := retail.fn_rol_por_clave('lider');
begin
  if new.rol = 'lider' then
    new.rol_id := v_lider;
  elsif new.rol_id is null or new.rol_id = v_lider then
    new.rol_id := retail.fn_rol_por_clave('integrante');
  end if;
  return new;
end;
$$;

drop trigger if exists colaboradores_rol_coherente on retail.colaboradores;
create trigger colaboradores_rol_coherente before insert or update on retail.colaboradores
  for each row execute function retail.fn_colaborador_rol_coherente();
drop trigger if exists colaboradores_suspendidos_rol_coherente on retail.colaboradores_suspendidos;
create trigger colaboradores_suspendidos_rol_coherente before insert or update on retail.colaboradores_suspendidos
  for each row execute function retail.fn_colaborador_rol_coherente();

-- Una terminal: sin rol_id (la crea `pnpm terminales:crear`), el rol de su tipo. Nunca el de Líder: los permisos son de
-- la cuenta, y una cuenta compartida no puede ser líder (ADR-0162).
create or replace function retail.fn_terminal_rol_coherente() returns trigger
language plpgsql
set search_path = retail, public, extensions
as $$
begin
  if new.rol_id is null then
    new.rol_id := retail.fn_rol_por_clave(case new.tipo when 'ventas' then 'terminal_ventas' else 'terminal_administrativa' end);
  end if;
  if new.rol_id = retail.fn_rol_por_clave('lider') then
    raise exception 'Una terminal no puede tener el rol Líder de equipo' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists terminales_rol_coherente on retail.terminales;
create trigger terminales_rol_coherente before insert or update on retail.terminales
  for each row execute function retail.fn_terminal_rol_coherente();

-- Relleno de lo que ya existe (y de un re-intento a medias). El disparador lo hace por nosotros.
update retail.colaboradores set rol_id = null where rol_id is null or (rol = 'lider') <> (rol_id = retail.fn_rol_por_clave('lider'));
update retail.colaboradores_suspendidos set rol_id = null where rol_id is null or (rol = 'lider') <> (rol_id = retail.fn_rol_por_clave('lider'));
update retail.terminales set rol_id = null where rol_id is null;

alter table retail.colaboradores alter column rol_id set not null;
alter table retail.colaboradores_suspendidos alter column rol_id set not null;
alter table retail.terminales alter column rol_id set not null;

-- Suspender y reactivar MUEVEN la fila entre dos tablas (ADR-0148): sin llevar rol_id, la persona volvería como
-- Integrante. Se inyecta en su definición real (patrón del ADR-0160: si la función cambió, aborta sin tocar nada).
create or replace function pg_temp.reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n = 0 and position(p_nuevo in v_def) > 0 then
    return; -- ya aplicada
  end if;
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: se esperaban % ocurrencias de "%" y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

do $$
begin
  perform pg_temp.reemplazar('retail.suspender_colaborador(uuid, text)', 'suspendido_por, motivo, terminal)', 'suspendido_por, motivo, terminal, rol_id)', 1);
  perform pg_temp.reemplazar('retail.suspender_colaborador(uuid, text)', 'v_motivo, v_fila.terminal)', 'v_motivo, v_fila.terminal, v_fila.rol_id)', 1);
  perform pg_temp.reemplazar('retail.reactivar_colaborador(uuid)', 'rol, ubicacion_asignada_id, terminal)', 'rol, ubicacion_asignada_id, terminal, rol_id)', 1);
  perform pg_temp.reemplazar('retail.reactivar_colaborador(uuid)', 'v_fila.ubicacion_asignada_id, v_fila.terminal)', 'v_fila.ubicacion_asignada_id, v_fila.terminal, v_fila.rol_id)', 1);
end $$;

-- ==================== 5. Qué ve la cuenta de la sesión ====================
-- El rol de la cuenta: el de la terminal si la sesión es de un aparato (ADR-0162), si no el de la persona.
create or replace function retail.fn_mi_rol_id() returns uuid
language sql stable security definer
set search_path = retail, public, extensions
as $$
  select coalesce(
    (select t.rol_id from retail.terminales t join retail.fn_terminal_actual() a on a.id = t.id limit 1),
    (select c.rol_id from public.personas p join retail.colaboradores c on c.persona_id = p.id
      where p.auth_user_id = auth.uid() and p.estado = 'activo' and c.estado = 'activo' limit 1)
  );
$$;

-- ¿La cuenta de la sesión ve este módulo? El líder ve todo. Nunca devuelve null (un null no dispara un `raise`).
create or replace function retail.fn_ve_modulo(p_clave text) returns boolean
language sql stable security definer
set search_path = retail, public, extensions
as $$
  select retail.fn_es_lider() or exists (
    select 1 from retail.rol_modulos rm
    join retail.roles r on r.id = rm.rol_id and r.archivado_at is null and not r.fijo
    join retail.modulos m on m.clave = rm.modulo and m.delegable and not m.solo_lider
    where rm.rol_id = retail.fn_mi_rol_id() and rm.modulo = p_clave
  );
$$;

comment on function retail.fn_ve_modulo(text) is
  'ADR-0161 B2: ¿la cuenta de la sesión (persona o terminal) ve el módulo? Líder: siempre. Es VISIBILIDAD; las 4 capacidades de escritura usan fn_capacidad_por_modulos, que además respeta roles.limitado_como_hoy.';

-- La capacidad de escribir que da ver alguno de estos módulos. Igual que `fn_ve_modulo` pero un rol
-- `limitado_como_hoy` (Integrante, mientras B2d no se decida) no la recibe. Sin el lado del líder: lo pone cada capacidad.
create or replace function retail.fn_capacidad_por_modulos(p_claves text[]) returns boolean
language sql stable security definer
set search_path = retail, public, extensions
as $$
  select exists (
    select 1 from retail.rol_modulos rm
    join retail.roles r on r.id = rm.rol_id and r.archivado_at is null and not r.fijo and not r.limitado_como_hoy
    join retail.modulos m on m.clave = rm.modulo and m.delegable and not m.solo_lider
    where rm.rol_id = retail.fn_mi_rol_id() and rm.modulo = any (p_claves)
  );
$$;

-- Para la web: los módulos que ve la cuenta y si los ve «completos» (con sus capacidades) o limitados como hoy.
-- Una sola lectura por petición, junto con `fn_persona_actual_resumen` (no se cambia su firma: ADR-0026).
create or replace function retail.fn_mis_modulos()
returns table (clave text, completo boolean)
language sql stable security definer
set search_path = retail, public, extensions
as $$
  select m.clave, true from retail.modulos m where retail.fn_es_lider()
  union all
  select m.clave, not r.limitado_como_hoy
    from retail.rol_modulos rm
    join retail.roles r on r.id = rm.rol_id and r.archivado_at is null and not r.fijo
    join retail.modulos m on m.clave = rm.modulo and m.delegable and not m.solo_lider
   where not retail.fn_es_lider() and rm.rol_id = retail.fn_mi_rol_id();
$$;

-- ==================== 6. El punto de enchufe: las capacidades leen el rol ====================
-- Misma firma, mismo `language sql stable` sin definer: `create or replace` no crea sobrecarga y conserva los grants.
-- Las 23 funciones y 15 políticas que las llaman no se tocan (ADR-0161 C3).
create or replace function retail.fn_puede_gestionar_caja() returns boolean
language sql stable set search_path = retail, public, extensions
as $$ select retail.fn_es_lider() or retail.fn_capacidad_por_modulos(array['caja']); $$;

create or replace function retail.fn_puede_ajustar_inventario() returns boolean
language sql stable set search_path = retail, public, extensions
as $$ select retail.fn_es_lider() or retail.fn_capacidad_por_modulos(array['existencias', 'conteos', 'traslados']); $$;

create or replace function retail.fn_puede_editar_catalogo() returns boolean
language sql stable set search_path = retail, public, extensions
as $$ select retail.fn_es_lider() or retail.fn_capacidad_por_modulos(array['productos', 'atributos']); $$;

create or replace function retail.fn_puede_editar_cuentas_proveedor() returns boolean
language sql stable set search_path = retail, public, extensions
as $$ select retail.fn_es_lider() or retail.fn_capacidad_por_modulos(array['proveedores']); $$;

comment on function retail.fn_puede_gestionar_caja() is
  'Líder, o un rol que ve Caja (ADR-0161 C3; antes: terminal de ventas, ADR-0160). Cerrar caja y mover caja.';
comment on function retail.fn_puede_ajustar_inventario() is
  'Líder, o un rol que ve Existencias, Conteos o Traslados (ADR-0161 C3; antes: terminal administrativa). Ajustar stock, cerrar conteo, cerrar un traslado con diferencia.';
comment on function retail.fn_puede_editar_catalogo() is
  'Líder, o un rol que ve Productos o Categorías/atributos (ADR-0161 C3; antes: terminal administrativa). Las etiquetas con descuento NO: fn_puede_dar_descuento_por_etiqueta.';
comment on function retail.fn_puede_editar_cuentas_proveedor() is
  'Líder, o un rol que ve Proveedores (ADR-0161 C3; antes: terminal administrativa). Cuentas bancarias de proveedores.';

-- ==================== 7. Escribir roles: solo el líder, siempre con historial ====================
create or replace function retail.fn_exigir_lider_de_roles() returns void
language plpgsql stable security definer
set search_path = retail, public, extensions
as $$
begin
  if not retail.fn_es_lider() then
    raise exception 'Solo un líder puede administrar roles' using errcode = '42501';
  end if;
end;
$$;

-- Crea un rol a medida. Con `p_copiar_de`, nace con los mismos módulos que ese rol («Duplicar»).
create or replace function retail.crear_rol(p_nombre text, p_descripcion text default null, p_copiar_de uuid default null)
returns uuid
language plpgsql security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_id uuid;
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_origen retail.roles;
begin
  perform retail.fn_exigir_lider_de_roles();
  if v_nombre = '' then
    raise exception 'Ponle un nombre al rol';
  end if;
  if exists (select 1 from retail.roles where lower(btrim(nombre)) = lower(v_nombre) and archivado_at is null) then
    raise exception 'Ya hay un rol llamado «%»', v_nombre using errcode = '23505';
  end if;
  if p_copiar_de is not null then
    select * into v_origen from retail.roles where id = p_copiar_de;
    if v_origen.id is null then
      raise exception 'El rol que quieres duplicar no existe — actualiza la pantalla';
    end if;
  end if;
  insert into retail.roles (nombre, descripcion, creado_por)
    values (v_nombre, nullif(btrim(coalesce(p_descripcion, '')), ''), retail.fn_actor_persona_id(false))
    returning id into v_id;
  if v_origen.id is not null then
    -- Duplicar el Líder da un rol con todo lo delegable (el Líder no guarda filas: ya ve todo).
    insert into retail.rol_modulos (rol_id, modulo)
      select v_id, m.clave from retail.modulos m
       where m.delegable and not m.solo_lider
         and (v_origen.fijo or exists (select 1 from retail.rol_modulos o where o.rol_id = v_origen.id and o.modulo = m.clave));
  end if;
  insert into retail.roles_historial (rol_id, accion, detalle, hecho_por)
    values (v_id, 'creacion', jsonb_build_object('nombre', v_nombre, 'copia_de', v_origen.nombre,
            'modulos', coalesce((select jsonb_agg(modulo order by modulo) from retail.rol_modulos where rol_id = v_id), '[]'::jsonb)),
            retail.fn_actor_persona_id(false));
  return v_id;
end;
$fn$;

-- Guarda la lista COMPLETA de módulos que ve un rol (lo que queda encendido en la pantalla).
create or replace function retail.guardar_modulos_rol(p_rol_id uuid, p_modulos text[])
returns void
language plpgsql security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_rol retail.roles;
  v_antes jsonb;
  v_despues jsonb;
  v_malo text;
begin
  perform retail.fn_exigir_lider_de_roles();
  select * into v_rol from retail.roles where id = p_rol_id for update;
  if v_rol.id is null then
    raise exception 'Ese rol no existe — actualiza la pantalla';
  end if;
  if v_rol.fijo then
    raise exception 'El rol % no se edita: ve y hace todo, siempre', v_rol.nombre using errcode = '42501';
  end if;
  if v_rol.archivado_at is not null then
    raise exception 'El rol % está archivado: restáuralo antes de editarlo', v_rol.nombre;
  end if;
  select x into v_malo from unnest(coalesce(p_modulos, '{}')) x
   where not exists (select 1 from retail.modulos m where m.clave = x) limit 1;
  if v_malo is not null then
    raise exception 'No existe el módulo «%»', v_malo;
  end if;
  select coalesce(jsonb_agg(modulo order by modulo), '[]'::jsonb) into v_antes from retail.rol_modulos where rol_id = p_rol_id;
  -- Se quitan los apagados y se suman los encendidos. Es configuración, no un dato del negocio: el antes y el
  -- después quedan en roles_historial, que no se borra nunca.
  delete from retail.rol_modulos where rol_id = p_rol_id and not (modulo = any (coalesce(p_modulos, '{}')));
  insert into retail.rol_modulos (rol_id, modulo)
    select distinct p_rol_id, x from unnest(coalesce(p_modulos, '{}')) x
    on conflict do nothing; -- el disparador rechaza lo que no se delega
  select coalesce(jsonb_agg(modulo order by modulo), '[]'::jsonb) into v_despues from retail.rol_modulos where rol_id = p_rol_id;
  if v_antes <> v_despues then
    insert into retail.roles_historial (rol_id, accion, detalle, hecho_por)
      values (p_rol_id, 'modulos', jsonb_build_object('antes', v_antes, 'despues', v_despues), retail.fn_actor_persona_id(false));
  end if;
end;
$fn$;

create or replace function retail.renombrar_rol(p_rol_id uuid, p_nombre text, p_descripcion text default null)
returns void
language plpgsql security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_rol retail.roles;
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_descripcion text := nullif(btrim(coalesce(p_descripcion, '')), '');
begin
  perform retail.fn_exigir_lider_de_roles();
  select * into v_rol from retail.roles where id = p_rol_id for update;
  if v_rol.id is null then
    raise exception 'Ese rol no existe — actualiza la pantalla';
  end if;
  if v_rol.fijo then
    raise exception 'El rol % no se edita', v_rol.nombre using errcode = '42501';
  end if;
  if v_nombre = '' then
    raise exception 'Ponle un nombre al rol';
  end if;
  if exists (select 1 from retail.roles where lower(btrim(nombre)) = lower(v_nombre) and archivado_at is null and id <> p_rol_id) then
    raise exception 'Ya hay un rol llamado «%»', v_nombre using errcode = '23505';
  end if;
  update retail.roles set nombre = v_nombre, descripcion = v_descripcion where id = p_rol_id;
  insert into retail.roles_historial (rol_id, accion, detalle, hecho_por)
    values (p_rol_id, 'renombre', jsonb_build_object('antes', v_rol.nombre, 'despues', v_nombre,
            'descripcion_antes', v_rol.descripcion, 'descripcion_despues', v_descripcion), retail.fn_actor_persona_id(false));
end;
$fn$;

-- Cuentas que tienen el rol, incluidas las suspendidas y las terminales desactivadas: todas volverían con él.
create or replace function retail.fn_cuentas_del_rol(p_rol_id uuid) returns integer
language sql stable security definer
set search_path = retail, public, extensions
as $$
  select (select count(*) from retail.colaboradores where rol_id = p_rol_id)::integer
       + (select count(*) from retail.colaboradores_suspendidos where rol_id = p_rol_id)::integer
       + (select count(*) from retail.terminales where rol_id = p_rol_id)::integer;
$$;

create or replace function retail.archivar_rol(p_rol_id uuid)
returns void
language plpgsql security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_rol retail.roles;
  v_n integer;
begin
  perform retail.fn_exigir_lider_de_roles();
  select * into v_rol from retail.roles where id = p_rol_id for update;
  if v_rol.id is null then
    raise exception 'Ese rol no existe — actualiza la pantalla';
  end if;
  if v_rol.es_sistema then
    raise exception 'El rol % no se archiva: %', v_rol.nombre,
      case when v_rol.fijo then 'siempre tiene que haber quien administre' else 'es el que recibe una persona nueva' end
      using errcode = '42501';
  end if;
  if v_rol.archivado_at is not null then
    raise exception 'Ese rol ya está archivado — actualiza la pantalla';
  end if;
  v_n := retail.fn_cuentas_del_rol(p_rol_id);
  if v_n > 0 then
    raise exception 'El rol % lo tienen % cuenta(s): asígnales otro rol antes de archivarlo', v_rol.nombre, v_n using errcode = '23503';
  end if;
  update retail.roles set archivado_at = now(), archivado_por = retail.fn_actor_persona_id(false) where id = p_rol_id;
  insert into retail.roles_historial (rol_id, accion, detalle, hecho_por)
    values (p_rol_id, 'archivo', '{}'::jsonb, retail.fn_actor_persona_id(false));
end;
$fn$;

create or replace function retail.restaurar_rol(p_rol_id uuid)
returns void
language plpgsql security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_rol retail.roles;
begin
  perform retail.fn_exigir_lider_de_roles();
  select * into v_rol from retail.roles where id = p_rol_id for update;
  if v_rol.id is null or v_rol.archivado_at is null then
    raise exception 'Ese rol no está archivado — actualiza la pantalla';
  end if;
  if exists (select 1 from retail.roles where lower(btrim(nombre)) = lower(btrim(v_rol.nombre)) and archivado_at is null) then
    raise exception 'Ya hay otro rol vigente llamado «%»: renómbralo antes de restaurar este', v_rol.nombre using errcode = '23505';
  end if;
  update retail.roles set archivado_at = null, archivado_por = null where id = p_rol_id;
  insert into retail.roles_historial (rol_id, accion, detalle, hecho_por)
    values (p_rol_id, 'restauracion', '{}'::jsonb, retail.fn_actor_persona_id(false));
end;
$fn$;

-- Asigna un rol a UNA cuenta: una persona (colaborador, activo o suspendido) o una terminal. El rol Líder no se asigna
-- aquí (ser líder es `colaboradores.rol`, ADR-0150) y a un líder no se le cambia: siempre tiene Líder.
create or replace function retail.asignar_rol(p_rol_id uuid, p_persona_id uuid default null, p_terminal_id uuid default null)
returns void
language plpgsql security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_rol retail.roles;
  v_antes uuid;
  v_rol_cuenta text;
  v_cuenta text;
begin
  perform retail.fn_exigir_lider_de_roles();
  if (p_persona_id is null) = (p_terminal_id is null) then
    raise exception 'Elige una sola cuenta: una persona o una terminal';
  end if;
  select * into v_rol from retail.roles where id = p_rol_id;
  if v_rol.id is null then
    raise exception 'Ese rol no existe — actualiza la pantalla';
  end if;
  if v_rol.archivado_at is not null then
    raise exception 'El rol % está archivado', v_rol.nombre;
  end if;
  if v_rol.fijo then
    raise exception 'El rol % no se asigna desde aquí: ser líder de equipo es un acceso aparte', v_rol.nombre using errcode = '42501';
  end if;

  if p_persona_id is not null then
    select c.rol_id, c.rol into v_antes, v_rol_cuenta from retail.colaboradores c where c.persona_id = p_persona_id for update;
    if v_antes is null then
      select c.rol_id, c.rol into v_antes, v_rol_cuenta from retail.colaboradores_suspendidos c where c.persona_id = p_persona_id for update;
    end if;
    if v_antes is null then
      raise exception 'Esa persona no tiene acceso a retail — actualiza la pantalla';
    end if;
    if v_rol_cuenta = 'lider' then
      raise exception 'A un líder de equipo no se le cambia el rol: ve y hace todo' using errcode = '42501';
    end if;
    update retail.colaboradores set rol_id = p_rol_id where persona_id = p_persona_id;
    update retail.colaboradores_suspendidos set rol_id = p_rol_id where persona_id = p_persona_id;
    select p.nombres || ' ' || p.apellidos into v_cuenta from public.personas p where p.id = p_persona_id;
  else
    select t.rol_id, t.nombre into v_antes, v_cuenta from retail.terminales t where t.id = p_terminal_id for update;
    if v_antes is null then
      raise exception 'Esa terminal no existe — actualiza la pantalla';
    end if;
    update retail.terminales set rol_id = p_rol_id where id = p_terminal_id;
  end if;

  if v_antes <> p_rol_id then
    insert into retail.roles_historial (rol_id, accion, detalle, hecho_por)
      values (p_rol_id, 'asignacion', jsonb_build_object(
        'cuenta', v_cuenta, 'persona_id', p_persona_id, 'terminal_id', p_terminal_id,
        'rol_antes', (select nombre from retail.roles where id = v_antes), 'rol_antes_id', v_antes),
        retail.fn_actor_persona_id(false));
  end if;
end;
$fn$;

-- Lectura de la pantalla Roles y accesos: todas las cuentas con su rol (personas activas, pendientes y suspendidas, y
-- terminales). Solo el líder. SECURITY DEFINER porque junta `personas` de Dynamic con las tablas de retail.
create or replace function retail.fn_cuentas_con_rol()
returns table (tipo text, id uuid, nombre text, ubicacion_nombre text, rol_id uuid, es_lider boolean, estado text)
language plpgsql stable security definer
set search_path = retail, public, extensions
as $fn$
begin
  perform retail.fn_exigir_lider_de_roles();
  return query
    select 'persona'::text, p.id, (p.nombres || ' ' || p.apellidos)::text, u.nombre::text, c.rol_id, c.rol = 'lider', c.estado::text
      from retail.colaboradores c
      join public.personas p on p.id = c.persona_id
      left join retail.ubicaciones u on u.id = c.ubicacion_asignada_id
    union all
    select 'persona', p.id, p.nombres || ' ' || p.apellidos, u.nombre, s.rol_id, s.rol = 'lider', 'suspendido'
      from retail.colaboradores_suspendidos s
      join public.personas p on p.id = s.persona_id
      left join retail.ubicaciones u on u.id = s.ubicacion_asignada_id
    union all
    select 'terminal', t.id, t.nombre, u.nombre, t.rol_id, false, case when t.activo then 'activo' else 'desactivada' end
      from retail.terminales t
      join retail.ubicaciones u on u.id = t.ubicacion_id
    order by 1, 3;
end;
$fn$;

-- ==================== 8. Grants ====================
do $$
declare
  v_f text;
begin
  foreach v_f in array array[
    'retail.fn_rol_por_clave(text)', 'retail.fn_mi_rol_id()', 'retail.fn_ve_modulo(text)',
    'retail.fn_capacidad_por_modulos(text[])', 'retail.fn_mis_modulos()', 'retail.fn_exigir_lider_de_roles()',
    'retail.crear_rol(text, text, uuid)', 'retail.guardar_modulos_rol(uuid, text[])', 'retail.renombrar_rol(uuid, text, text)',
    'retail.fn_cuentas_del_rol(uuid)', 'retail.archivar_rol(uuid)', 'retail.restaurar_rol(uuid)',
    'retail.asignar_rol(uuid, uuid, uuid)', 'retail.fn_cuentas_con_rol()'] loop
    execute format('revoke all on function %s from public, anon', v_f);
    execute format('grant execute on function %s to authenticated', v_f);
  end loop;
end $$;
