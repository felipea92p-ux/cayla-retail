-- ============================================================================
-- 20260917100400 — Qué categorías ofrecen qué talla/tejido/patrón
--
-- Felipe (2026-09-17): tejido/patrón hoy aplican a CUALQUIER categoría sin
-- filtro — un collar o un cuaderno igual muestran el selector, aunque nadie
-- lo llene ahí. Pidió filtrar por categoría en vez de dejarlo así.
--
-- POR QUÉ TABLA PUENTE Y NO categorias.tallas_sugeridas (array de texto)
--   `tallas_sugeridas` no tiene integridad referencial: nada impide que
--   apunte a un valor que no existe en ningún vocabulario cerrado — era
--   aceptable cuando `variantes.talla` era texto libre, deja de serlo ahora
--   que talla es un vocabulario cerrado (20260917100000). Mismo molde que
--   `variante_etiquetas`: una fila real por combinación válida, con FK real.
--
-- CATEGORÍA vs. SUBCATEGORÍA: REEMPLAZA, NO AMPLÍA
--   Felipe (2026-09-17): si "Jeans" permite 26-36 y su subcategoría
--   "Jeans niño" necesita 6-14, la subcategoría tiene SU lista propia,
--   explícita — no hereda la del padre. Más predecible: un cambio en la
--   categoría padre nunca afecta en silencio a sus hijas. Aplica igual a
--   los 3 ejes (tallas/tejidos/patrones) — misma decisión, integridad
--   conceptual (principio 2).
--
-- Todavía NO se dropea `categorias.tallas_sugeridas` (lo lee
-- NuevoProductoForm.tsx/productos/page.tsx) — el corte de esas dos pantallas
-- a `categoria_tallas` y el drop de la columna vieja quedan en el paso de
-- UI, para no dejar la app rota a mitad de esta migración (principio 11:
-- primero el terreno, después el cambio, nunca los dos mezclados a medias).
-- ============================================================================

create table retail.categoria_tallas (
  categoria_id uuid not null references retail.categorias (id) on delete cascade,
  talla_id uuid not null references retail.tallas (id),
  created_at timestamptz not null default now(),
  primary key (categoria_id, talla_id)
);

create table retail.categoria_tejidos (
  categoria_id uuid not null references retail.categorias (id) on delete cascade,
  tejido_id uuid not null references retail.tejidos (id),
  created_at timestamptz not null default now(),
  primary key (categoria_id, tejido_id)
);

create table retail.categoria_patrones (
  categoria_id uuid not null references retail.categorias (id) on delete cascade,
  patron_id uuid not null references retail.patrones (id),
  created_at timestamptz not null default now(),
  primary key (categoria_id, patron_id)
);

comment on table retail.categoria_tallas is 'Qué tallas ofrece el formulario para una categoría/subcategoría dada. Sin fila = sin tallas sugeridas ahí (ej. Collares). Reemplaza categorias.tallas_sugeridas — no hereda de categoría a subcategoría, cada una tiene la suya.';
comment on table retail.categoria_tejidos is 'Qué tejidos ofrece el formulario para una categoría/subcategoría dada. Sin fila = tejido no aplica ahí.';
comment on table retail.categoria_patrones is 'Qué patrones ofrece el formulario para una categoría/subcategoría dada. Sin fila = patrón no aplica ahí.';

-- RLS: leer es abierto (cualquiera arma el formulario), escribir es de
-- Líder — mismo candado que categorias_write_lider (0004_rls.sql), porque
-- esto ES edición de categoría, no aprobación de vocabulario.
alter table retail.categoria_tallas enable row level security;
create policy categoria_tallas_select on retail.categoria_tallas for select using (auth.role() = 'authenticated');
create policy categoria_tallas_write_lider on retail.categoria_tallas for all
  using (retail.fn_es_lider()) with check (retail.fn_es_lider());

alter table retail.categoria_tejidos enable row level security;
create policy categoria_tejidos_select on retail.categoria_tejidos for select using (auth.role() = 'authenticated');
create policy categoria_tejidos_write_lider on retail.categoria_tejidos for all
  using (retail.fn_es_lider()) with check (retail.fn_es_lider());

alter table retail.categoria_patrones enable row level security;
create policy categoria_patrones_select on retail.categoria_patrones for select using (auth.role() = 'authenticated');
create policy categoria_patrones_write_lider on retail.categoria_patrones for all
  using (retail.fn_es_lider()) with check (retail.fn_es_lider());

-- ---------- backfill: de categorias.tallas_sugeridas (texto libre) a filas reales ----------
-- Cada valor sugerido que no calza (normalizado) con ninguna talla existente
-- nace como talla nueva, aprobada de una (fue puesto ahí por V1 con
-- criterio real, no una propuesta al azar de un colaborador) — mismo
-- criterio que los 30 colores originales nacieron 'aprobado'.
--
-- El trigger tallas_estado_biut (20260917100000) decide `estado` mirando
-- fn_es_lider() — y una migración corre sin sesión, así que fn_es_lider()
-- da `false` y el INSERT de abajo nacería 'pendiente' pese al `estado`
-- explícito. Se desactiva el trigger solo durante este bloque (no durante
-- el resto de la migración) — mismo criterio que un seed de datos ya
-- confiables, igual que los 30 colores originales entraron por default de
-- columna y nunca por este camino.
alter table retail.tallas disable trigger tallas_estado_biut;

do $$
declare
  v_cat record;
  v_valor text;
  v_talla_id uuid;
begin
  for v_cat in select id, tallas_sugeridas from retail.categorias where tallas_sugeridas is not null loop
    foreach v_valor in array v_cat.tallas_sugeridas loop
      if coalesce(trim(v_valor), '') = '' then continue; end if;

      select id into v_talla_id from retail.tallas
        where retail.fn_clave_texto(valor) = retail.fn_clave_texto(v_valor);

      if v_talla_id is null then
        insert into retail.tallas (valor, estado, notas)
          values (trim(v_valor), 'aprobado', 'Migrado desde categorias.tallas_sugeridas el 2026-09-17 — valor ya vivía en el catálogo de V1, no es una propuesta nueva.')
          returning id into v_talla_id;
      end if;

      insert into retail.categoria_tallas (categoria_id, talla_id)
        values (v_cat.id, v_talla_id)
        on conflict do nothing;
    end loop;
  end loop;
end $$;

alter table retail.tallas enable trigger tallas_estado_biut;
