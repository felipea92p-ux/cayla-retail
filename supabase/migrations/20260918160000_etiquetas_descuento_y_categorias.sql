-- ============================================================================
-- 20260918160000 — Etiquetas de campaña: % de descuento y categorías donde rige
--
-- QUÉ ES ESTO Y QUÉ NO
--   Felipe (2026-09-18): una etiqueta de campaña (Black Friday, Día de la Madre)
--   debe poder llevar un descuento que el administrador configura y cambia, y
--   las prendas etiquetadas lo reciben solas en Vender. Esta migración es SOLO
--   EL MODELO: guarda el % y las categorías. NADIE lo lee todavía —
--   `registrar_venta` no se toca acá (es dinero real; va en el paso siguiente,
--   con revisión aparte). Una etiqueta con `descuento_pct` no cambia hoy ni un
--   precio.
--
-- REGLAS YA DECIDIDAS QUE ESTE MODELO TIENE QUE PODER EXPRESAR
--   · Una prenda con varias etiquetas recibe UN solo descuento: el mayor. Eso
--     lo resuelve la venta al leer (max), no una columna — por eso acá no hay
--     nada de "prioridad".
--   · Categorías opcionales. CON categorías, la etiqueta alcanza a todas las
--     prendas de esas categorías sin etiquetarlas una por una; SIN ninguna, solo
--     a las que alguien etiquetó a mano (`variante_etiquetas`). Ambos caminos
--     dicen lo mismo —"esta variante tiene esta etiqueta"— así que nunca chocan
--     entre sí; solo puede haber choque ENTRE etiquetas, y ahí gana el mayor.
--   · `codigos_descuento` sigue aparte: el código dice QUIÉN puede descontar y
--     hasta cuánto; la etiqueta dice QUÉ CAMPAÑA rige y en qué prendas.
--
-- ESTADOS IMPOSIBLES QUE EL ESQUEMA CIERRA
--   · Un % fuera de (0, 100] — check.
--   · Un % sobre una etiqueta que no está aprobada — check. Una colaboradora
--     puede PROPONER una etiqueta (nace 'pendiente'); si pudiera proponerla ya
--     con "100 %", el candado dependería de que la venta se acuerde de mirar
--     el estado. Con el check y la policy de abajo, esa fila no puede existir.
--   · Categorías de una etiqueta guardadas a medias: el RPC de abajo actualiza
--     % + fechas + categorías en UNA transacción.
--
-- LO QUE NO SE HIZO, A PROPÓSITO
--   · Sin índice por `categoria_id`: son ~22 etiquetas × 42 categorías, como
--     mucho unos cientos de filas. Un scan es instantáneo; el índice se agrega
--     el día que el paso de la venta lo mida como necesario.
--   · La tabla guarda lo que el administrador ELIGIÓ. Hoy no hay subcategorías
--     (categorias.categoria_padre_id es null en las 45 filas de producción);
--     si aparecen, si "Jeans" cubre a "Jeans niño" se decide al leer, sin
--     cambiar este modelo.
--
-- ESTADO: escrita el 2026-09-18. NO en producción — la pega Felipe (lleva el
-- prefijo `retail.` y es idempotente: se puede correr dos veces).
-- SE ROMPE SI: se despliega el frontend antes de pegar esto. `/productos/atributos`
-- pide `descuento_pct` y `etiqueta_categorias`; sin ellos, Etiquetas no carga.
-- ============================================================================

set search_path = retail, public, extensions;

-- ---------- el descuento ----------
alter table retail.etiquetas add column if not exists descuento_pct numeric(5, 2);

alter table retail.etiquetas drop constraint if exists etiquetas_descuento_rango;
alter table retail.etiquetas add constraint etiquetas_descuento_rango
  check (descuento_pct is null or (descuento_pct > 0 and descuento_pct <= 100));

alter table retail.etiquetas drop constraint if exists etiquetas_descuento_solo_aprobada;
alter table retail.etiquetas add constraint etiquetas_descuento_solo_aprobada
  check (descuento_pct is null or estado = 'aprobado');

comment on column retail.etiquetas.descuento_pct is
  'Descuento de campaña, en % (0-100]. null = etiqueta informativa, sin descuento. Solo lo pone un Líder y solo sobre una etiqueta aprobada. Todavía no lo lee registrar_venta (paso siguiente).';

-- Una colaboradora puede proponer una etiqueta (nace 'pendiente') pero no
-- fijarle un descuento: el check de arriba ya lo haría fallar, esto lo dice
-- claro y lo deja escrito en la política.
drop policy if exists etiquetas_insert_autenticado on retail.etiquetas;
create policy etiquetas_insert_autenticado on retail.etiquetas for insert
  with check (auth.role() = 'authenticated' and (descuento_pct is null or retail.fn_es_lider()));

-- ---------- dónde rige ----------
create table if not exists retail.etiqueta_categorias (
  etiqueta_id uuid not null references retail.etiquetas (id),
  categoria_id uuid not null references retail.categorias (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (etiqueta_id, categoria_id)
);

comment on table retail.etiqueta_categorias is
  'Categorías donde rige una etiqueta de campaña. Sin filas = la etiqueta solo alcanza a las variantes etiquetadas a mano (variante_etiquetas); con filas = alcanza a todas las prendas de esas categorías.';

alter table retail.etiqueta_categorias enable row level security;
drop policy if exists etiqueta_categorias_select on retail.etiqueta_categorias;
create policy etiqueta_categorias_select on retail.etiqueta_categorias for select using (auth.role() = 'authenticated');
drop policy if exists etiqueta_categorias_write_lider on retail.etiqueta_categorias;
create policy etiqueta_categorias_write_lider on retail.etiqueta_categorias for all
  using (retail.fn_es_lider()) with check (retail.fn_es_lider());

grant select on retail.etiqueta_categorias to authenticated;
grant insert, delete on retail.etiqueta_categorias to authenticated;

-- ---------- guardar la campaña completa, o nada ----------
-- Todo va junto (% + fechas + categorías) porque son una sola idea para quien
-- edita: "esta campaña, estos días, en estas categorías". Hacerlo en dos o tres
-- llamadas del navegador dejaba un estado a medias si la segunda fallaba.
create or replace function retail.actualizar_campana_etiqueta(
  p_etiqueta_id uuid,
  p_descuento_pct numeric,
  p_vigente_desde date,
  p_vigente_hasta date,
  p_categoria_ids uuid[]
) returns void
language plpgsql security definer set search_path = retail, public as $$
declare
  v_estado text;
begin
  if not retail.fn_es_lider() then
    raise exception 'Solo un Líder puede configurar una campaña.';
  end if;

  select estado into v_estado from retail.etiquetas where id = p_etiqueta_id;
  if not found then
    raise exception 'Esa etiqueta ya no existe. Recarga la pantalla.';
  end if;
  if p_descuento_pct is not null and v_estado <> 'aprobado' then
    raise exception 'Aprueba la etiqueta antes de ponerle un descuento.';
  end if;
  if p_descuento_pct is not null and (p_descuento_pct <= 0 or p_descuento_pct > 100) then
    raise exception 'El descuento tiene que ser mayor que 0 y como máximo 100 %%.';
  end if;
  if p_vigente_desde is not null and p_vigente_hasta is not null and p_vigente_desde > p_vigente_hasta then
    raise exception 'La fecha de inicio no puede ser posterior a la de fin.';
  end if;

  update retail.etiquetas
    set descuento_pct = p_descuento_pct,
        vigente_desde = p_vigente_desde,
        vigente_hasta = p_vigente_hasta
    where id = p_etiqueta_id;

  delete from retail.etiqueta_categorias where etiqueta_id = p_etiqueta_id;
  insert into retail.etiqueta_categorias (etiqueta_id, categoria_id)
    select p_etiqueta_id, c from (select distinct unnest(coalesce(p_categoria_ids, '{}'::uuid[])) as c) x;
end;
$$;

comment on function retail.actualizar_campana_etiqueta(uuid, numeric, date, date, uuid[]) is
  'Fija el % de descuento, la vigencia y las categorías de una etiqueta en una sola transacción (reemplaza el conjunto de categorías). Solo Líder. No aplica nada a ventas: eso lo lee registrar_venta en un paso aparte.';

revoke all on function retail.actualizar_campana_etiqueta(uuid, numeric, date, date, uuid[]) from public;
grant execute on function retail.actualizar_campana_etiqueta(uuid, numeric, date, date, uuid[]) to authenticated;
