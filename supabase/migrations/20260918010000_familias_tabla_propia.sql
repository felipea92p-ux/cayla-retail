-- ============================================================================
-- 20260918010000 — Familia deja de ser un CHECK constraint fijo, pasa a tabla
--
-- EL PROBLEMA
--   `categorias.familia` (20260912235500) es un CHECK constraint con 6
--   valores acuñados a mano ('indumentaria', 'calzado', 'accesorios',
--   'bisuteria', 'belleza', 'papeleria'). Agregar una familia nueva exige
--   una migración y un deploy — Felipe pidió una pantalla para hacerlo él
--   mismo (BACKLOG, ADR-0096 §"decisiones abiertas").
--
-- POR QUÉ TABLA SIN PROPONER/APROBAR (NO el mecanismo de Colores/Tallas)
--   Colores/Tallas/Tejidos/Patrones/Etiquetas son vocabulario OPERATIVO:
--   cualquier colaborador de sede propone uno nuevo catalogando una prenda,
--   un líder aprueba después. Familia es una decisión de MARCA, no de piso
--   de venta — la última vez que se tocó (ADR-0096) exigió investigar cómo
--   la nombran Zara/H&M/Hermès/Ralph Lauren antes de decidir, no algo que
--   se resuelve con un clic al catalogar. Mismo patrón que ya usa
--   `retail.categorias` (`categorias_write_lider`, sin proponer/aprobar) —
--   familia se trata igual, por integridad conceptual (principio 2).
--
-- POR QUÉ `codigo text` Y NO uuid COMO tallas
--   `familia` ya vive como texto en TODO el código (`packages/shared`
--   `Familia`/`FAMILIAS`, `CategoriasLista.tsx`, las rutas de API, la RPC
--   `catalogo_crear_categoria` con `p_familia`). Migrar a uuid obligaría a
--   tocar cada uno de esos sitios solo para guardar una clave subrogada que
--   nadie necesita — 'accesorios' ya es una clave estable y legible.
--   `codigo` se autogenera desde `nombre` con un trigger (ver más abajo)
--   SOLO cuando no se manda uno explícito — las 6 semillas de abajo fijan
--   el suyo a mano para no romper ninguna fila existente de `categorias`.
--
-- QUÉ NO CAMBIA TODAVÍA
--   El código de la app (`FAMILIAS`, `Familia`, la validación estática en
--   `/api/productos/categorias`) sigue leyendo la lista fija — eso se
--   actualiza en la migración de frontend que sigue a esta (mismo paso,
--   commit separado: primero el terreno, después el cambio, principio 11
--   de CLAUDE.md global). Esta migración por sí sola es no-op para la app:
--   los 6 valores existen igual, solo que ahora viven en una tabla.
-- ============================================================================

create table retail.familias (
  codigo text primary key,
  nombre text not null,
  activo boolean not null default true,
  orden integer not null default 100,
  created_at timestamptz not null default now()
);

comment on table retail.familias is
  'Vocabulario de marca (Indumentaria, Calzado...). A diferencia de colores/tallas: sin proponer/aprobar, solo un líder la edita — es una decisión de negocio, no operativa. `codigo` es la clave estable que ya usa categorias.familia en todo el código; `nombre` es lo que ve la persona.';
comment on column retail.familias.codigo is
  'Autogenerado desde nombre si no se manda (fn_familias_generar_codigo). Nunca cambia una vez creado: categorias.familia lo referencia.';

-- Mismo candado que colores/tallas: dos nombres que solo difieren en
-- acentos/mayúsculas/espacios no pueden convivir.
create unique index familias_nombre_unico on retail.familias (retail.fn_clave_texto(nombre));

-- ---------- código autogenerado desde nombre, solo si no se manda uno ----------
create or replace function retail.fn_familias_generar_codigo()
returns trigger
language plpgsql
as $$
begin
  if new.codigo is null or trim(new.codigo) = '' then
    new.codigo := regexp_replace(retail.fn_clave_texto(new.nombre), '\s+', '_', 'g');
  end if;
  if new.codigo is null or trim(new.codigo) = '' then
    raise exception 'La familia necesita un nombre para generar su código.';
  end if;
  return new;
end;
$$;

drop trigger if exists familias_generar_codigo_biu on retail.familias;
create trigger familias_generar_codigo_biu
  before insert on retail.familias
  for each row execute function retail.fn_familias_generar_codigo();

-- ---------- candado: no desactivar una familia con categorías activas colgando ----------
create or replace function retail.fn_familias_desactivar_candado()
returns trigger
language plpgsql
as $$
declare
  v_en_uso integer;
begin
  if new.activo = false and old.activo = true then
    select count(*) into v_en_uso from retail.categorias
      where familia = old.codigo and activo = true;
    if v_en_uso > 0 then
      raise exception 'No se puede desactivar "%": % categoría(s) activa(s) todavía la usan.', old.nombre, v_en_uso;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists familias_desactivar_candado_bu on retail.familias;
create trigger familias_desactivar_candado_bu
  before update on retail.familias
  for each row execute function retail.fn_familias_desactivar_candado();

-- ---------- las 6 de siempre, codigo fijo a mano para no romper categorias.familia ----------
insert into retail.familias (codigo, nombre, orden) values
  ('indumentaria', 'Indumentaria', 10),
  ('calzado', 'Calzado', 20),
  ('accesorios', 'Accesorios y Complementos', 30),
  ('bisuteria', 'Bisutería', 40),
  ('belleza', 'Belleza', 50),
  ('papeleria', 'Papelería', 60)
on conflict (codigo) do nothing;

-- ---------- categorias.familia: de CHECK fijo a FK contra la tabla ----------
alter table retail.categorias drop constraint if exists categorias_familia_check;
alter table retail.categorias
  add constraint categorias_familia_fk foreign key (familia) references retail.familias (codigo);

-- ---------- RLS: mismo patrón que categorias (líder-only, sin proponer/aprobar) ----------
alter table retail.familias enable row level security;

create policy familias_select on retail.familias
  for select using (auth.role() = 'authenticated');

create policy familias_write_lider on retail.familias for all
  using (retail.fn_es_lider())
  with check (retail.fn_es_lider());
