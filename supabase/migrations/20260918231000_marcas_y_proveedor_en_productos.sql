-- ============================================================================
-- 20260918231000 — Todo producto tiene marca y proveedor (el terreno)
--
-- EL PROBLEMA (verificado en producción, 2026-09-18)
--   `productos` tiene 13 columnas y ninguna dice de quién es la prenda ni quién
--   la trae. Hoy no se puede filtrar por marca, ni agrupar el stock bajo por
--   proveedor para saber a quién pedirle, ni buscar "adidas" en la caja.
--   El directorio `proveedores` existe (ficha ampliada, Compras), pero ningún
--   producto lo cita.
--
-- LO QUE DIJO FELIPE (2026-09-18, AskUserQuestion)
--   · La marca es un vocabulario cerrado, y "primero debe existir el
--     proveedor": un proveedor tiene varias marcas.
--   · Una misma marca PUEDE llegar por más de un proveedor: raro, pero pasa con
--     accesorios y con chompas importadas.
--   · Marca y proveedor son obligatorios (también en el censo).
--   · Los 44 productos actuales son de prueba/demo: marca CAYLA, proveedor
--     CAYLA SAC.
--
-- DECIDÍ
--   `marcas` (vocabulario global) + `marca_proveedores` (qué proveedores traen
--   cada marca) y el producto guarda marca_id Y proveedor_id, atados por una
--   LLAVE COMPUESTA a la pareja registrada: un proveedor que no trae esa marca
--   es un estado que la base no deja guardar.
--
-- DESCARTÉ `marcas.proveedor_id` (una marca, un proveedor; duplicar la marca
-- si llega por dos). Más simple, pero (1) cambiar de proveedor pasaría a ser
-- cambiar de MARCA —una chompa Adidas que cambia de distribuidor "cambiaría de
-- marca" aunque Adidas siga siendo Adidas—, y (2) la marca se fragmenta sin
-- que la base lo impida: "Adidass" bajo el otro distribuidor nace como marca
-- distinta y solo una validación de pantalla lo frena.
--
-- SE ROMPE SI una marca deja de tener sentido sin proveedor, o si registrar el
-- vínculo marca↔proveedor de cada compra nueva estorbara al catalogar (con 3
-- tiendas y un taller, poco probable; el formulario lo hace en un toque).
--
-- ORDEN: esta migración deja `marca_id` y `proveedor_id` NOT NULL. Las RPC que
-- crean productos se actualizan en 20260918231100: pegar las tres seguidas.
-- ============================================================================

-- ---------- marcas: vocabulario global, un Líder la edita ----------
create table if not exists retail.marcas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (btrim(nombre) <> ''),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

-- Dos nombres que solo difieren en tildes, mayúsculas o espacios no pueden
-- convivir ("Adidas" / "adidas " / "ADIDAS"): es lo que impide que la marca se fragmente.
create unique index if not exists marcas_nombre_unico on retail.marcas (retail.fn_clave_texto(nombre));

comment on table retail.marcas is
  'Vocabulario de marcas (CAYLA, Adidas...). Sin proponer/aprobar, como familias y categorías: un Líder la administra. Qué proveedores la traen vive en marca_proveedores.';

-- ---------- qué proveedores traen cada marca (N:N) ----------
create table if not exists retail.marca_proveedores (
  marca_id uuid not null references retail.marcas (id),
  proveedor_id uuid not null references retail.proveedores (id),
  created_at timestamptz not null default now(),
  primary key (marca_id, proveedor_id)
);

comment on table retail.marca_proveedores is
  'Parejas válidas marca↔proveedor. productos.(marca_id, proveedor_id) las referencia con llave compuesta: un producto no puede citar un proveedor que no trae su marca. Una pareja en uso no se puede borrar (la llave la protege).';

create index if not exists marca_proveedores_proveedor_idx on retail.marca_proveedores (proveedor_id);

-- ---------- RLS: leer lo ve cualquiera con sesión, escribir es de Líder ----------
alter table retail.marcas enable row level security;
drop policy if exists marcas_select on retail.marcas;
create policy marcas_select on retail.marcas for select using (auth.role() = 'authenticated');
drop policy if exists marcas_write_lider on retail.marcas;
create policy marcas_write_lider on retail.marcas for all using (retail.fn_es_lider()) with check (retail.fn_es_lider());

alter table retail.marca_proveedores enable row level security;
drop policy if exists marca_proveedores_select on retail.marca_proveedores;
create policy marca_proveedores_select on retail.marca_proveedores for select using (auth.role() = 'authenticated');
drop policy if exists marca_proveedores_write_lider on retail.marca_proveedores;
create policy marca_proveedores_write_lider on retail.marca_proveedores for all using (retail.fn_es_lider()) with check (retail.fn_es_lider());

-- ---------- no se desactiva una marca con productos activos colgando ----------
-- Mismo candado que fn_familias_desactivar_candado: si no, el catálogo activo
-- tendría productos de una marca que ya no se puede elegir.
create or replace function retail.fn_marcas_desactivar_candado()
returns trigger
language plpgsql
as $$
declare
  v_en_uso integer;
begin
  if new.activo = false and old.activo = true then
    select count(*) into v_en_uso from retail.productos where marca_id = old.id and estado = 'activo';
    if v_en_uso > 0 then
      raise exception 'No se puede desactivar "%": % producto(s) activo(s) todavía la usan.', old.nombre, v_en_uso;
    end if;
  end if;
  return new;
end;
$$;

-- ---------- CAYLA SAC y la marca CAYLA (los 44 de prueba, y lo que fabrica el Taller) ----------
-- El proveedor solo se crea si no hay uno con ese nombre (clave sin tildes ni
-- mayúsculas): no pisa una ficha que alguien haya cargado a mano.
insert into retail.proveedores (nombre)
select 'CAYLA SAC'
where not exists (select 1 from retail.proveedores where retail.fn_clave_texto(nombre) = 'cayla sac');

insert into retail.marcas (nombre)
select 'CAYLA'
where not exists (select 1 from retail.marcas where retail.fn_clave_texto(nombre) = 'cayla');

insert into retail.marca_proveedores (marca_id, proveedor_id)
select m.id, p.id
from retail.marcas m, retail.proveedores p
where retail.fn_clave_texto(m.nombre) = 'cayla' and retail.fn_clave_texto(p.nombre) = 'cayla sac'
on conflict do nothing;

-- ---------- el producto guarda marca y proveedor, atados a una pareja válida ----------
alter table retail.productos add column if not exists marca_id uuid;
alter table retail.productos add column if not exists proveedor_id uuid;

-- Los productos que ya existen (44 de prueba/demo + "Cargo especial") son de
-- CAYLA / CAYLA SAC, dicho por Felipe. Solo se rellenan los que no tienen.
update retail.productos
   set marca_id = (select id from retail.marcas where retail.fn_clave_texto(nombre) = 'cayla'),
       proveedor_id = (select id from retail.proveedores where retail.fn_clave_texto(nombre) = 'cayla sac')
 where marca_id is null or proveedor_id is null;

alter table retail.productos alter column marca_id set not null;
alter table retail.productos alter column proveedor_id set not null;

alter table retail.productos drop constraint if exists productos_marca_proveedor_fk;
alter table retail.productos
  add constraint productos_marca_proveedor_fk
  foreign key (marca_id, proveedor_id) references retail.marca_proveedores (marca_id, proveedor_id);

-- Llaves simples ADEMÁS de la compuesta: no cambian ninguna regla (la compuesta ya lo
-- garantiza), pero sin ellas PostgREST no puede traer `marca:marcas(nombre)` ni
-- `proveedor:proveedores(nombre)` desde productos — la compuesta apunta a la tabla puente.
alter table retail.productos drop constraint if exists productos_marca_fk;
alter table retail.productos add constraint productos_marca_fk foreign key (marca_id) references retail.marcas (id);
alter table retail.productos drop constraint if exists productos_proveedor_fk;
alter table retail.productos add constraint productos_proveedor_fk foreign key (proveedor_id) references retail.proveedores (id);

create index if not exists productos_marca_idx on retail.productos (marca_id);
create index if not exists productos_proveedor_idx on retail.productos (proveedor_id);

comment on column retail.productos.marca_id is
  'De qué marca es el producto. Con proveedor_id forma una pareja registrada en marca_proveedores (llave compuesta).';
comment on column retail.productos.proveedor_id is
  'Proveedor habitual del producto, para reponer. El proveedor REAL de cada entrega vive en compras/lotes; esto es a quién se le pide.';

drop trigger if exists marcas_desactivar_candado_bu on retail.marcas;
create trigger marcas_desactivar_candado_bu
  before update on retail.marcas
  for each row execute function retail.fn_marcas_desactivar_candado();

-- ---------- crear_marca: la marca y su primer proveedor, juntos o nada ----------
-- Si la marca ya existe (mismo nombre sin tildes/mayúsculas) NO se crea otra:
-- se le suma el proveedor. Es exactamente el caso "la misma marca llega por
-- otro distribuidor", y es lo que impide el "Adidass" duplicado.
create or replace function retail.crear_marca(p_nombre text, p_proveedor_id uuid)
returns uuid
language plpgsql
security definer
set search_path = retail, public
as $$
declare
  v_nombre text := btrim(regexp_replace(coalesce(p_nombre, ''), '\s+', ' ', 'g'));
  v_marca uuid;
begin
  if not fn_es_lider() then
    raise exception 'Solo un Líder puede agregar marcas.';
  end if;
  if v_nombre = '' then
    raise exception 'Falta el nombre de la marca.';
  end if;
  if not exists (select 1 from proveedores where id = p_proveedor_id and activo) then
    raise exception 'Ese proveedor no existe o está desactivado.';
  end if;

  select id into v_marca from marcas where fn_clave_texto(nombre) = fn_clave_texto(v_nombre);
  if v_marca is null then
    insert into marcas (nombre) values (v_nombre) returning id into v_marca;
  elsif not exists (select 1 from marcas where id = v_marca and activo) then
    raise exception 'La marca "%" existe pero está desactivada. Reactívala en Catálogo → Marcas.', v_nombre;
  end if;

  insert into marca_proveedores (marca_id, proveedor_id) values (v_marca, p_proveedor_id) on conflict do nothing;
  return v_marca;
end;
$$;

comment on function retail.crear_marca(text, uuid) is
  'Crea la marca con su proveedor, o le suma ese proveedor si la marca ya existe. Devuelve el id de la marca. Solo Líder.';

revoke execute on function retail.crear_marca(text, uuid) from public, anon;
grant execute on function retail.crear_marca(text, uuid) to authenticated;

-- ---------- el cambio de marca o proveedor deja rastro, como categoría y estado ----------
-- `fn_registrar_cambio_producto` audita categoria_id y estado (y precio/costo de las
-- variantes). Cambiar de marca o de proveedor mueve a quién se le pide y qué se lista bajo
-- cada marca: sin historial nadie sabría quién ni cuándo (revisión adversarial del PR).
-- Mismo cuerpo que producción (2026-09-18) + dos bloques; se guarda el id, como categoria_id.
create or replace function retail.fn_registrar_cambio_producto()
returns trigger
language plpgsql
security definer
set search_path to 'retail', 'public', 'extensions'
as $$
declare
  v_usuario_id uuid;
begin
  select id into v_usuario_id from public.personas where auth_user_id = auth.uid();

  if TG_TABLE_NAME = 'productos' then
    if new.categoria_id is distinct from old.categoria_id then
      insert into retail.historial_producto_cambios (entidad, entidad_id, campo, valor_anterior, valor_nuevo, usuario_id)
      values ('producto', new.id, 'categoria_id', old.categoria_id::text, new.categoria_id::text, v_usuario_id);
    end if;
    if new.estado is distinct from old.estado then
      insert into retail.historial_producto_cambios (entidad, entidad_id, campo, valor_anterior, valor_nuevo, usuario_id)
      values ('producto', new.id, 'estado', old.estado::text, new.estado::text, v_usuario_id);
    end if;
    if new.marca_id is distinct from old.marca_id then
      insert into retail.historial_producto_cambios (entidad, entidad_id, campo, valor_anterior, valor_nuevo, usuario_id)
      values ('producto', new.id, 'marca_id', old.marca_id::text, new.marca_id::text, v_usuario_id);
    end if;
    if new.proveedor_id is distinct from old.proveedor_id then
      insert into retail.historial_producto_cambios (entidad, entidad_id, campo, valor_anterior, valor_nuevo, usuario_id)
      values ('producto', new.id, 'proveedor_id', old.proveedor_id::text, new.proveedor_id::text, v_usuario_id);
    end if;
  elsif TG_TABLE_NAME = 'variantes' then
    if new.precio is distinct from old.precio then
      insert into retail.historial_producto_cambios (entidad, entidad_id, campo, valor_anterior, valor_nuevo, usuario_id)
      values ('variante', new.id, 'precio', old.precio::text, new.precio::text, v_usuario_id);
    end if;
    if new.costo is distinct from old.costo then
      insert into retail.historial_producto_cambios (entidad, entidad_id, campo, valor_anterior, valor_nuevo, usuario_id)
      values ('variante', new.id, 'costo', old.costo::text, new.costo::text, v_usuario_id);
    end if;
  end if;
  return new;
end;
$$;
