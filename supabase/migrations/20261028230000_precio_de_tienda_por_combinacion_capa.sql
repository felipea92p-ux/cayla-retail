-- ============================================================================
-- 20261028230000_precio_de_tienda_por_combinacion_capa.sql — CAYLA V2 · ADR-0370 (act. 2026-10-28), Inventario ▸ Recibir mercadería ▸ Cerrar
-- Una combinación (color y talla) puede tener, en UNA tienda, un precio distinto al de su prenda: una capa de excepciones encima de
-- lo que ya existe. ACTIVIDAD 1 de 7: solo la capa y la regla que la lee; todavía nada la escribe (eso es la actividad 2).
--
-- EL PROBLEMA PRIMERO. Al cerrar un envío, quien recibe ve una sola caja de precio por prenda. Pero lo que se vende vale distinto según el
-- color y la talla (la talla extra, el color con otro proveedor), y el precio de la TIENDA se guarda hoy por prenda entera
-- (`precios_sede_prenda`, ADR-0370): para que una talla valga otra cosa en Trujillo, toda la prenda tendría que valerla. El precio general
-- (`variantes.precio`) sí es por combinación y vale en todas las sedes.
--
-- LA REGLA, DE ARRIBA A ABAJO (`fn_precio_en_sede(variante, sede)`, la única que leen Vender, la caja, Apartados, Cambios, Proformas,
-- Ventas sin registrar y la tienda web; ninguna de esas funciones se toca):
--   0. La talla de OBSEQUIO (S/ 0 en una categoría que admite el 0, ADR-0384) vale 0 en toda tienda, como hasta hoy. Una excepción no la cobra.
--   1. NUEVO: la excepción de ESA combinación en ESA tienda (`precios_sede_variante`), si hay una vigente.
--   2. El precio de la prenda en esa tienda (`precios_sede_prenda`), si hay uno vigente.
--   3. El precio general (`variantes.precio`).
-- Con la capa vacía todo precio de todas las combinaciones en todas las sedes sale IGUAL que ayer: no hay nada que migrar en producción.
--
-- POR QUÉ UNA CAPA Y NO VOLVER A UNA FILA POR VARIANTE. ADR-0370 dejó el precio por prenda porque una fila por variante se desfasaba: una
-- talla o un color nuevo nacía sin fila (se vendía a la grilla en esa tienda), una talla desactivada conservaba su precio viejo, y un
-- precio propio igual a la grilla se quedaba guardado. Aquí la base sigue siendo la prenda: una combinación nueva simplemente HEREDA el precio
-- de su prenda, y la excepción es solo lo que se sale. (La limpieza automática de las excepciones —igual a lo de abajo, o de una talla que
-- se desactiva— llega en la actividad 2, junto con quien las escribe.)
--
-- LO QUE NO CAMBIA
--   · Con la tabla vacía, `fn_precio_en_sede` devuelve lo mismo que antes para toda combinación y toda sede (la prueba lo compara, una a una).
--   · `precios_sede_prenda`, `poner_precio_sede`, `quitar_precio_sede` y todas las pantallas: iguales. Nada escribe aún en la capa nueva.
--   · Ninguna función que cobra, aparta, cotiza, cambia o regulariza: todas siguen preguntándole a `fn_precio_en_sede`.
--
-- DESCARTÉ
--   · Copiar el precio general a una fila por tienda y combinación: congela la grilla en N × sedes filas y, al cambiarla, las tiendas dejan de
--     seguirla (el error que ADR-0370 corrigió). La capa vacía ya vale «todas las sedes».
--   · Reescribir `fn_precio_en_sede` entera: es la regla de cobro de las tres tiendas y la web, y otra migración ya la parchó (20261015121000);
--     el reemplazo anclado cambia solo la línea que importa y se detiene sin tocar nada si la función viva ya no es la esperada.
--   · Dejar que una excepción cambie el precio de un obsequio: la regla 0 va primero, igual que con el precio de la prenda.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe; hoy solo local). UNA parte, sin políticas ni `drop trigger` (ADR-0195): una tabla nueva
-- (sus llaves foráneas a `variantes` y `ubicaciones` toman un candado breve, con `lock_timeout`), dos disparadores
-- (`create or replace trigger`) y un reemplazo anclado. Idempotente. Sin `select … into` dentro de textos entre comillas (ADR-0288).
-- Verificación: el bloque final falla si algo no quedó. Prueba: `pnpm pruebas:precio-sede-variante`.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- Reemplazo anclado (el mismo de 20261013173000): falla si la función viva cambió, y es re-ejecutable.
create or replace function pg_temp.reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
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

-- ---------- 1. La tabla ----------

create table if not exists retail.precios_sede_variante (
  id               uuid primary key default gen_random_uuid(),
  variante_id      uuid not null references retail.variantes (id),
  ubicacion_id     uuid not null references retail.ubicaciones (id),
  precio           numeric(12,2) not null,
  motivo           text not null,
  -- Desde cuándo vale ESTE precio en esa tienda. Corregir solo el motivo crea otra fila (no se edita) pero no reinicia la fecha.
  vigente_desde    timestamptz not null default now(),
  creado_por       uuid references public.personas (id),
  created_at       timestamptz not null default now(),
  archivado_en     timestamptz,
  archivado_por    uuid references public.personas (id),
  archivado_motivo text,
  -- Mayor que cero y hasta S/ 5 000: dos candados que también dejan fuera a NaN (Postgres lo ordena por encima de todo número).
  constraint precios_sede_variante_precio_con_tope check (precio > 0 and precio <= 5000),
  constraint precios_sede_variante_motivo_no_vacio check (length(btrim(motivo)) >= 3)
);

comment on table retail.precios_sede_variante is
  'Excepción de precio de UNA combinación (color y talla) en UNA tienda (ADR-0370, act. 2026-10-28): gana al precio de la prenda en esa tienda '
  '(precios_sede_prenda) y al general (variantes.precio). Se lee con fn_precio_en_sede; no se borra ni se edita, solo se archiva.';
comment on column retail.precios_sede_variante.archivado_en is 'Cuándo dejó de valer (se quitó, se cambió o quedó igual a lo de abajo). Vacío = vigente. Nunca se borra la fila.';
comment on column retail.precios_sede_variante.archivado_motivo is 'Por qué dejó de valer, si no fue reemplazada por otra.';

-- Una sola vigente por combinación y tienda; el índice parcial sirve también a la lectura de `fn_precio_en_sede`.
create unique index if not exists precios_sede_variante_vigente_unico
  on retail.precios_sede_variante (variante_id, ubicacion_id) where archivado_en is null;
create index if not exists precios_sede_variante_ubicacion_vigente_idx
  on retail.precios_sede_variante (ubicacion_id) where archivado_en is null;

-- Sin políticas ni permisos: solo la tocan funciones `security definer` (la actividad 2).
alter table retail.precios_sede_variante enable row level security;
revoke all on table retail.precios_sede_variante from public, anon, authenticated;

-- Una fila no se borra ni se reescribe: solo se archiva, una vez (como la de la prenda).
create or replace function retail.fn_precios_sede_variante_inmutable() returns trigger
language plpgsql set search_path = retail, public, extensions as $fn$
begin
  if tg_op = 'DELETE' then
    raise exception 'Un precio de tienda no se borra: se quita (queda archivado).';
  end if;
  if old.archivado_en is not null
     or new.variante_id <> old.variante_id or new.ubicacion_id <> old.ubicacion_id
     or new.precio <> old.precio or new.motivo <> old.motivo or new.vigente_desde <> old.vigente_desde
     or new.creado_por is distinct from old.creado_por or new.created_at <> old.created_at then
    raise exception 'Un precio de tienda no se edita: se quita y se pone otro.';
  end if;
  return new;
end;
$fn$;
revoke all on function retail.fn_precios_sede_variante_inmutable() from public, anon, authenticated;

create or replace trigger precios_sede_variante_inmutable
  before update or delete on retail.precios_sede_variante
  for each row execute function retail.fn_precios_sede_variante_inmutable();

-- Poner o quitar una excepción sube la versión del catálogo: toda pantalla abierta se pone al día sola (como la de la prenda).
create or replace trigger catalogo_version_cambio
  after insert or update or delete or truncate on retail.precios_sede_variante
  for each statement execute function retail.fn_catalogo_cambio();

-- ---------- 2. La regla: la excepción de la combinación va antes que el precio de la prenda ----------
select pg_temp.reemplazar('retail.fn_precio_en_sede(uuid,uuid)',
$v$              else coalesce(
                (select ps.precio from retail.precios_sede_prenda ps$v$,
$n$              else coalesce(
                -- ADR-0370 (act. 2026-10-28): lo primero es la excepción de ESTA combinación en ESTA tienda; si no hay, el precio de la prenda.
                (select pv.precio from retail.precios_sede_variante pv
                  where pv.variante_id = v.id and pv.ubicacion_id = p_ubicacion_id and pv.archivado_en is null),
                (select ps.precio from retail.precios_sede_prenda ps$n$,
1);

-- ---------- 3. Comprobación ----------
do $$
begin
  if to_regclass('retail.precios_sede_variante') is null then
    raise exception 'falta la tabla precios_sede_variante';
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'retail' and indexname = 'precios_sede_variante_vigente_unico') then
    raise exception 'falta el índice único de la excepción vigente';
  end if;
  if position('precios_sede_variante' in pg_get_functiondef('retail.fn_precio_en_sede(uuid,uuid)'::regprocedure)) = 0 then
    raise exception 'fn_precio_en_sede no lee la excepción de la combinación';
  end if;
  if position('precios_sede_prenda' in pg_get_functiondef('retail.fn_precio_en_sede(uuid,uuid)'::regprocedure)) = 0 then
    raise exception 'fn_precio_en_sede dejó de leer el precio de la prenda';
  end if;
end;
$$;

reset lock_timeout;
