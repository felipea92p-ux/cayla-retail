-- ============================================================================
-- 20261029161000 — Configuración ▸ Gastos con CLAURE: el líder cambia qué parte de cada categoría de gasto es de CLAURE (ADR-0560; actividad 17)
--
-- EL PROBLEMA PRIMERO. La actividad 8 dejó el reparto de gastos con CLAURE (alquiler 50 %, limpieza 100 %…) en una tabla que solo se cambiaba por SQL: cada cambio le pedía una migración a quien
-- programa. Felipe (2026-10-29): «construir una pantalla para cambiar los porcentajes». Esta migración da lo que la pantalla necesita, con la regla de siempre de Configuración: cada cambio lo firma
-- un responsable, queda en la historia (`configuracion_historial`) y es solo del líder, porque mueve plata.
--
-- CONTRATO (Liskov)
--   PROMETE: (1) `fn_reparto_claure()`: todas las categorías de gasto activas con la parte de CLAURE de cada una (0 si no tiene fila: todo de CAYLA), y cuándo se cambió. (2) `guardar_reparto_claure(categoria, pct)`:
--            fija esa parte (de 0 a 100, hasta dos decimales) para una categoría activa; firma a quien figure como responsable (`fn_actor_persona_id(true)`), guarda quién y cuándo (`actualizado_por`,
--            `actualizado_en`) y deja el antes y el después en `configuracion_historial`. Las dos son solo del líder con el módulo «Configuración» y `anon` no las ejecuta.
--            Todo lo que ya lee la tabla (`fn_claure_gastos`, el Diario, el aviso del cierre) toma el cambio solo; no se reescribe ninguna función.
--   ASUME:   `categorias_gasto` es el catálogo de categorías; `gasto_reparto_claure` ya existe (actividad 8).
--   NO HACE: no toca los gastos ya registrados (su parte se calcula al leer, con el porcentaje de hoy: cambiar un porcentaje cambia también lo de antes, a propósito) ni crea categorías.
--
-- CÓMO SE PEGA EN PRODUCCIÓN — UNA SOLA EJECUCIÓN, después de 20261029160000 y ANTES de la web (la pestaña llama a estas dos funciones). Un `alter table` de una tabla de configuración que la tienda no usa (una columna
-- nueva, sin políticas) y dos funciones nuevas; idempotente.
-- ============================================================================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

alter table retail.gasto_reparto_claure add column if not exists actualizado_por uuid references public.personas (id);

create or replace function retail.fn_reparto_claure()
returns table (categoria text, nombre text, ejemplos text, pct_claure numeric, actualizado_en timestamptz)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
begin
  if not retail.fn_es_lider() or not retail.fn_puede_configurar() then
    raise exception 'El reparto de gastos con CLAURE lo ve el líder, con el módulo «Configuración» en su rol.' using errcode = '42501';
  end if;
  return query
  select k.codigo, k.nombre, k.ejemplos, coalesce(r.pct_claure, 0)::numeric, r.actualizado_en
    from retail.categorias_gasto k
    left join retail.gasto_reparto_claure r on r.categoria = k.codigo
   where k.activo
   order by k.orden, k.codigo;
end $$;

comment on function retail.fn_reparto_claure() is
  'ADR-0560: las categorías de gasto activas con la parte de cada una que es de CLAURE (0 si no tiene fila). Solo el líder con el módulo Configuración.';
revoke all on function retail.fn_reparto_claure() from public, anon;
grant execute on function retail.fn_reparto_claure() to authenticated;

create or replace function retail.guardar_reparto_claure(p_categoria text, p_pct numeric)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_actor uuid := retail.fn_actor_persona_id(true);
  v_nombre text;
  v_antes numeric;
  v_pct numeric;
begin
  if not retail.fn_es_lider() or not retail.fn_puede_configurar() then
    raise exception 'Cambiar el reparto de gastos con CLAURE lo hace el líder, con el módulo «Configuración» en su rol.' using errcode = '42501';
  end if;
  if p_pct is null or p_pct < 0 or p_pct > 100 then
    raise exception 'La parte de CLAURE va de 0 %% a 100 %%.' using errcode = 'P0001';
  end if;
  v_nombre := (select k.nombre from retail.categorias_gasto k where k.codigo = p_categoria and k.activo);
  if v_nombre is null then
    raise exception 'Esa categoría de gasto no existe o está desactivada.' using errcode = 'P0001';
  end if;
  v_pct := round(p_pct, 2);
  -- Dos personas que cambian la misma categoría a la vez (el caos de 2026-10-29 lo encontró): sin esto, el «antes» de la historia podía leerse a medias y la cadena antes→después se rompía. Se hacen en fila.
  perform pg_advisory_xact_lock(hashtext('reparto_claure:' || p_categoria));
  v_antes := coalesce((select r.pct_claure from retail.gasto_reparto_claure r where r.categoria = p_categoria), 0);
  insert into retail.gasto_reparto_claure (categoria, pct_claure, actualizado_en, actualizado_por)
  values (p_categoria, v_pct, now(), v_actor)
  on conflict (categoria) do update set pct_claure = excluded.pct_claure, actualizado_en = now(), actualizado_por = excluded.actualizado_por;
  if v_antes is distinct from v_pct then
    insert into retail.configuracion_historial (que, detalle, hecho_por)
    values ('reparto_claure', jsonb_build_object('categoria', p_categoria, 'nombre', v_nombre, 'antes', v_antes, 'despues', v_pct), v_actor);
  end if;
end $$;

comment on function retail.guardar_reparto_claure(text, numeric) is
  'ADR-0560: fija qué parte (0 a 100) de una categoría de gasto es de CLAURE. Solo el líder con el módulo Configuración; firma al responsable y deja el antes y el después en configuracion_historial.';
revoke all on function retail.guardar_reparto_claure(text, numeric) from public, anon;
grant execute on function retail.guardar_reparto_claure(text, numeric) to authenticated;

do $$
begin
  if to_regprocedure('retail.fn_reparto_claure()') is null or to_regprocedure('retail.guardar_reparto_claure(text, numeric)') is null
     or not exists (select 1 from information_schema.columns where table_schema = 'retail' and table_name = 'gasto_reparto_claure' and column_name = 'actualizado_por') then
    raise exception 'ADR-0560: la pantalla del reparto de gastos no quedó con sus funciones';
  end if;
end $$;
