-- ============================================================================
-- 20260917100000 — Tallas: vocabulario cerrado, propone/aprueba/rechaza
--
-- EL PROBLEMA
--   `variantes.talla` es texto libre desde el día uno (0002_esquema.sql).
--   Con el censo real por arrancar (300-900 SKUs) eso significa "M"/"m"/
--   "Medium"/"Mediano" conviviendo como tallas distintas para siempre — el
--   mismo problema que `colores_clave_unica` (20260912235500) ya cerró para
--   colores, sin cerrar nunca para talla. Decisión de Felipe, 2026-09-17.
--
-- POR QUÉ id UUID Y NO codigo text COMO colores
--   `colores.codigo` (3 letras) es PK porque se inyecta directo en el
--   código de barras (`fn_asignar_codigo_variante`, AZM-M). Talla no tiene
--   ese requisito — el valor mismo ("M", "38", "XSS") ya es corto y legible,
--   y usar uuid mantiene el mismo molde que categorias/productos/variantes
--   (integridad conceptual, principio 2 de CLAUDE.md) en vez de inventar un
--   segundo esquema de claves solo para esta tabla.
--
-- REJECT DESDE EL DÍA UNO, NO RETROFITEADO
--   Colores construyó "proponer/aprobar" (ADR-0070) y "rechazar" (ADR-0095)
--   en dos pasadas separadas. Acá se construyen juntos: 'rechazado' es un
--   tercer valor de `estado` desde la primera migración, mismo patrón ya
--   probado, sin la ventana intermedia donde una propuesta mala solo se
--   podía aprobar-y-desactivar.
--
-- LA DIFERENCIA REAL CON COLORES: COMENTARIO OBLIGATORIO AL APROBAR
--   Felipe (2026-09-17): un color de más es barato de limpiar (desactivar);
--   una talla mal aprobada ensucia la unicidad de variante y es más cara de
--   deshacer una vez que hay SKUs colgando. Aprobar una talla exige que el
--   Líder deje un comentario breve en `notas` — las otras 4 tablas de
--   vocabulario (colores/tejidos/patrones/etiquetas) siguen de un clic, sin
--   fricción (ADR-0070). No es inconsistencia: es una excepción con razón
--   de negocio nombrada, no una arbitrariedad.
-- ============================================================================

create table retail.tallas (
  id uuid primary key default gen_random_uuid(),
  valor text not null,
  activo boolean not null default true,
  estado text not null default 'aprobado' check (estado in ('pendiente', 'aprobado', 'rechazado')),
  propuesto_por uuid references public.personas (id),
  aprobado_por uuid references public.personas (id),
  aprobado_en timestamptz,
  notas text,
  created_at timestamptz not null default now()
);

comment on table retail.tallas is
  'Vocabulario cerrado de tallas. Reemplaza variantes.talla (texto libre) — ver 20260917100600_variantes_talla_cerrada.sql. Qué categorías la ofrecen vive en retail.categoria_tallas, no acá: esta tabla es el universo completo (S, M, 26, XSS...), no el filtro por categoría.';
comment on column retail.tallas.notas is
  'A diferencia de colores/tejidos/patrones/etiquetas: OBLIGATORIO al aprobar (fn_tallas_estado_trigger lo exige). Opcional al rechazar, igual que el resto.';

create unique index tallas_clave_unica on retail.tallas (retail.fn_clave_texto(valor));

-- Seed: nada todavía — a diferencia de colores (30 valores reales de V1),
-- talla no tiene un catálogo previo confiable que migrar en limpio. Nace
-- vacía; se puebla proponiendo desde el censo o cargándola a mano por
-- categoría (ver retail.categoria_tallas).

-- ---------- el candado real: mismo mecanismo que colores (ADR-0070), con rechazar y comentario obligatorio ----------
create or replace function retail.fn_tallas_estado_trigger()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_persona uuid;
begin
  select id into v_persona from public.personas where auth_user_id = auth.uid();

  if tg_op = 'INSERT' then
    new.propuesto_por := v_persona;
    if retail.fn_es_lider() then
      new.estado := 'aprobado';
      new.aprobado_por := v_persona;
      new.aprobado_en := now();
    else
      new.estado := 'pendiente';
      new.aprobado_por := null;
      new.aprobado_en := null;
    end if;
    return new;
  end if;

  -- UPDATE: aprobar o rechazar solo tienen sentido viniendo de 'pendiente'.
  -- Mismo candado atómico que ADR-0078: si dos Líderes resuelven la misma
  -- propuesta casi al mismo tiempo, el trigger corre DENTRO del UPDATE de
  -- quien gana la fila — el segundo ve old.estado ya distinto de 'pendiente'
  -- y choca acá, nunca pisa la decisión del primero.
  if new.estado = 'aprobado' and old.estado is distinct from 'aprobado' then
    if old.estado <> 'pendiente' then
      raise exception 'Solo se puede aprobar una talla que todavía está pendiente.';
    end if;
    if coalesce(trim(new.notas), '') = '' then
      raise exception 'Aprobar una talla exige un comentario breve (a qué categoría aplica, por qué es distinta de las que ya existen).';
    end if;
    new.aprobado_por := v_persona;
    new.aprobado_en := now();
  elsif new.estado = 'rechazado' and old.estado is distinct from 'rechazado' then
    if old.estado <> 'pendiente' then
      raise exception 'Solo se puede rechazar una propuesta que todavía está pendiente de aprobar.';
    end if;
    -- El candado "hay una variante activa usando esta talla" se agrega en
    -- 20260917100600 (CREATE OR REPLACE de esta misma función): acá
    -- `variantes.talla_id` todavía no existe — Postgres valida las
    -- referencias de tabla al crear la función (plpgsql.check_function_bodies),
    -- así que una referencia adelantada haría fallar esta migración.
    new.activo := false;
    new.aprobado_por := v_persona;
    new.aprobado_en := now();
  end if;

  return new;
end;
$$;

drop trigger if exists tallas_estado_biut on retail.tallas;
create trigger tallas_estado_biut
  before insert or update on retail.tallas
  for each row execute function retail.fn_tallas_estado_trigger();

alter table retail.tallas
  add constraint tallas_rechazado_no_activo check (estado <> 'rechazado' or activo = false);

-- ---------- RLS: mismo patrón que colores ----------
alter table retail.tallas enable row level security;

create policy tallas_select on retail.tallas
  for select using (auth.role() = 'authenticated');

create policy tallas_insert_autenticado on retail.tallas
  for insert
  with check (auth.role() = 'authenticated');

create policy tallas_update_lider on retail.tallas
  for update
  using (retail.fn_es_lider())
  with check (retail.fn_es_lider());
