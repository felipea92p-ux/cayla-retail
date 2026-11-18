-- ============================================================================
-- 20261112204000_fusionar_productos_base.sql — Fusionar productos duplicados, parte 1: la base (ADR-0650)
-- ============================================================================
--
-- EL PROBLEMA. Hay prendas registradas dos veces (o tres): la misma capa de dos piezas entró como «Blusa» y como «Capa»,
-- cada una con su stock, sus ventas y sus fotos. Borrar una pierde su historia; ajustar su stock a cero deja las ventas
-- repartidas en dos fichas. Felipe (2026-11-12): fusionarlas en una sola sin perder ventas, fotos ni stock.
--
-- LA IDEA. Las variantes (talla × color) se MUDAN al producto que queda: `variantes.producto_id` cambia y todo lo que
-- apunta a la variante (stock, movimientos, ventas, apartados, traslados, códigos de barras) la sigue sin reescribirse.
-- El libro `movimientos` no se toca (es inmutable). Esta parte prepara la base; la función que fusiona es 20261112210000.
--
-- QUÉ AGREGA
--   1. `productos.fusionado_en_id` (+ `fusionado_en`): el producto duplicado queda descontinuado y apuntando al que quedó.
--      Nunca se borra (CLAUDE.md, «Nunca borres datos»).
--   2. `variantes.fusionada_en_id`: cuando los dos tenían la MISMA talla y color, las unidades se pasan a la variante que
--      queda con movimientos nuevos, y la duplicada se apaga apuntando a ella. También se muda al producto que queda, para
--      que su historial de ventas cuente en él.
--   3. Los dos índices únicos dejan de mirar lo fusionado, con el MISMO nombre (los mensajes de `lib/error-escritura.ts`
--      los reconocen por nombre):
--        · `variantes_identidad_unica` (ADR-0263, D-138): una variante VIVA por (prenda, talla, color). La fusionada es
--          historia, no una combinación que se pueda reactivar (D-138 sigue valiendo para todo lo demás).
--        · `productos_marca_referencia_clave_unica` (ADR-0294): el producto que queda puede tomar el nombre del duplicado.
--   4. `producto_fusiones`: el rastro. La ficha completa de cada duplicado ANTES de fusionar (producto, variantes, fotos,
--      stock), lo que eligió la persona y cuánto se movió. No hay «deshacer» (decisión 14 de Felipe): es la evidencia
--      para reconstruir a mano.
--
-- PARA PEGAR EN PRODUCCIÓN: una sola parte, sin políticas (RLS encendido sin políticas: la tabla solo la escriben y la
-- leen funciones `security definer`). Los `alter table` de `productos` y `variantes` son de tablas en uso, por eso no va
-- ninguna política aquí (CLAUDE.md, «Políticas y deadlocks»). Re-ejecutable. Ensayo primero con `begin; … rollback;`.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- ---------- 1. El producto duplicado apunta al que quedó ----------

alter table retail.productos add column if not exists fusionado_en_id uuid references retail.productos (id);
alter table retail.productos add column if not exists fusionado_en timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'productos_fusionado_coherente' and conrelid = 'retail.productos'::regclass) then
    alter table retail.productos add constraint productos_fusionado_coherente check (
      fusionado_en_id is null
      or (fusionado_en_id <> id and fusionado_en is not null and estado = 'descontinuado')
    );
  end if;
end;
$$;

comment on column retail.productos.fusionado_en_id is
  'ADR-0650: este producto era un duplicado y se fusionó en el que se indica. Queda descontinuado, nunca borrado. Quien lea por producto un dato que no se mudó (decisiones de Frescura, tráfico web) sigue esta columna.';
comment on column retail.productos.fusionado_en is 'ADR-0650: cuándo se fusionó en `fusionado_en_id`.';

create index if not exists productos_fusionado_en_idx on retail.productos (fusionado_en_id) where fusionado_en_id is not null;

-- ---------- 2. La variante repetida apunta a la que la absorbió ----------

alter table retail.variantes add column if not exists fusionada_en_id uuid references retail.variantes (id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'variantes_fusionada_coherente' and conrelid = 'retail.variantes'::regclass) then
    alter table retail.variantes add constraint variantes_fusionada_coherente check (
      fusionada_en_id is null or (fusionada_en_id <> id and not activo)
    );
  end if;
end;
$$;

comment on column retail.variantes.fusionada_en_id is
  'ADR-0650: al fusionar dos productos con la misma talla y color, las unidades de esta variante pasaron a la indicada (con movimientos) y esta quedó apagada. Vive en el mismo producto que la que la absorbió, así que sus ventas cuentan en él. No se reactiva.';

create index if not exists variantes_fusionada_en_idx on retail.variantes (fusionada_en_id) where fusionada_en_id is not null;

-- ---------- 3. Los índices únicos dejan de mirar lo fusionado (mismo nombre) ----------

do $$
begin
  if position('WHERE' in pg_get_indexdef('retail.variantes_identidad_unica'::regclass)) = 0 then
    create unique index variantes_identidad_unica_fusion
      on retail.variantes (producto_id, talla_id, color_codigo) nulls not distinct
      where fusionada_en_id is null;
    drop index retail.variantes_identidad_unica;
    alter index retail.variantes_identidad_unica_fusion rename to variantes_identidad_unica;
  end if;

  if position('fusionado_en_id' in pg_get_indexdef('retail.productos_marca_referencia_clave_unica'::regclass)) = 0 then
    create unique index productos_marca_referencia_clave_unica_fusion
      on retail.productos (marca_id, (retail.fn_clave_referencia(referencia))) nulls not distinct
      where estado_alta <> 'rechazado' and fusionado_en_id is null;
    drop index retail.productos_marca_referencia_clave_unica;
    alter index retail.productos_marca_referencia_clave_unica_fusion rename to productos_marca_referencia_clave_unica;
  end if;
end;
$$;

comment on index retail.variantes_identidad_unica is
  'ADR-0263 (D-138) / ADR-0069 / ADR-0650: una variante viva por (prenda, talla, color). NULLS NOT DISTINCT: «Sin color» y «sin talla» cuentan como un valor más. Activa o no, una combinación desactivada se reactiva, no se repite; solo la fusionada (`fusionada_en_id`) queda fuera, porque es historia.';
comment on index retail.productos_marca_referencia_clave_unica is
  'Un nombre, un producto POR MARCA (ADR-0294, D1). NULLS NOT DISTINCT. El rechazado y el fusionado (ADR-0650) no ocupan el nombre.';

-- ---------- 4. El rastro de cada fusión ----------

create table if not exists retail.producto_fusiones (
  id uuid primary key default gen_random_uuid(),
  -- Una llamada a `fusionar_productos` puede juntar varios duplicados (decisión 15): todas sus filas comparten este id.
  fusion_id uuid not null,
  producto_queda_id uuid not null references retail.productos (id),
  producto_fusionado_id uuid not null references retail.productos (id),
  -- La ficha del duplicado COMPLETA antes de fusionar: producto, variantes, códigos de barras, fotos y stock.
  ficha_fusionada jsonb not null,
  -- La ficha del que queda antes de que la fusión le cambie campos (nombre, precio, categoría…), para ver qué cambió.
  ficha_queda_antes jsonb not null,
  -- Lo que eligió la persona: qué campos tomó del duplicado, el precio, el costo, las fotos.
  elecciones jsonb not null default '{}'::jsonb,
  -- Cuánto se movió: variantes mudadas, variantes juntadas, unidades pasadas, fotos, filas repuntadas por tabla.
  conteos jsonb not null default '{}'::jsonb,
  fusionada_por uuid references public.personas (id),
  fusionada_en timestamptz not null default now(),
  constraint producto_fusiones_no_a_si_mismo check (producto_queda_id <> producto_fusionado_id),
  constraint producto_fusiones_una_vez unique (producto_fusionado_id)
);

comment on table retail.producto_fusiones is
  'ADR-0650: el rastro de cada fusión de productos duplicados. Una fila por duplicado; no hay deshacer, esta es la evidencia para reconstruir a mano. Solo la escriben y la leen funciones security definer.';

create index if not exists producto_fusiones_queda_idx on retail.producto_fusiones (producto_queda_id);
create index if not exists producto_fusiones_fusion_idx on retail.producto_fusiones (fusion_id);

alter table retail.producto_fusiones enable row level security;
revoke all on retail.producto_fusiones from anon, authenticated, public;
