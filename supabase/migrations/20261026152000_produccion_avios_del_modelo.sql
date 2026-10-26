-- ============================================================================
-- 20261026152000_produccion_avios_del_modelo.sql — CAYLA V2 (ficha de consumo del modelo, ADR-0513, actividad 3 · 2026-10-26)
--
-- EL PROBLEMA PRIMERO. Los botones, el hilo y las etiquetas de un modelo se reescribían en CADA orden: la lista de avíos vivía solo en la orden
-- (`produccion_insumos`) y el modelo no se acordaba de ellos. Lo que sí recordaba era un número de tela (`producto_consumos`).
--
-- LA DECISIÓN.
--   · `producto_avios`: los avíos del modelo, con la MISMA forma que una fila de la orden (insumo, color o «toda la orden», cuánto lleva cada prenda).
--     Así «proponer los avíos» es copiar filas y la base los vuelve a validar con la misma función que usa abrir (`fn_produccion_insumos_normalizar`).
--     Reemplazar la lista NO borra: las filas anteriores quedan archivadas (`archivado_at`) con quién y cuándo (catálogos con historial no se borran).
--   · Abrir una orden con avíos los deja como los del modelo si el modelo todavía no tiene ninguno (la primera orden los declara, como la tela) o si
--     quien edita el catálogo lo pide a propósito (`fijar_avios_modelo`: corregir lo que el modelo YA dice es de quien edita el catálogo; se comprueba
--     ANTES de abrir, así una orden rechazada no gasta número).
--   · `fn_nueva_orden_opciones` entrega `avios_modelo` (los vigentes de cada modelo) para que Nueva orden los proponga sola.
--
-- CONTRATO (Liskov)
--   PROMETE: un modelo tiene a lo sumo una fila vigente por (avío, color); reemplazar la lista archiva las anteriores y no deja el modelo a medias (es
--            una sola transacción). Sin `fijar_avios_modelo` y con avíos ya declarados, abrir una orden NO toca los del modelo.
--   ASUME:   las dos funciones vivas a la fecha (anclas verificadas en local el 2026-10-26): `abrir_orden_produccion(jsonb, jsonb, jsonb)` y
--            `fn_nueva_orden_opciones(uuid)`, ya con los reemplazos de 20261026150000 y 20261026151000. Si cambiaron, el reemplazo se detiene sin tocar nada.
--   NO HACE: no cambia órdenes abiertas ni cerradas; no hay avíos «por talla» (una etiqueta de la S y otra de la M son dos avíos de Insumos, y la orden
--            sabe de colores, no de tallas: queda para decidir); no valida que exista un avío del color de cada prenda (la hoja lo muestra, no lo impide).
--
-- DESCARTÉ
--   · Guardar el avío como «familia» (hilo poliéster) y resolver el insumo por color al abrir: Insumos no tiene familia de avíos; inventarla es otro módulo.
--     Una fila por (avío, color) ya dice lo mismo y la hoja la propone «cada color» sin que la base sepa de familias.
--   · Un `jsonb` con la lista en `productos`: no se puede unir con Insumos ni vigilar con una llave foránea.
--   · Borrar y volver a insertar: se pierde qué avíos tuvo el modelo antes (regla del repo: no se borra lo que tiene historia).
--
-- SE ROMPE SI
--   · Un avío del modelo se archiva en Insumos: Nueva orden no lo propone (la web lo salta) y, si llegara a la base, el validador lo rechaza
--     (`insumo_archivado`). El modelo conserva la fila hasta que alguien declare otra lista.
--   · Dos personas corrigen los avíos del mismo modelo a la vez desde dos órdenes: la última en abrir gana; la otra queda archivada, no perdida.
--
-- CÓMO SE PEGA. Una sola parte: tabla nueva (RLS encendido y sin políticas: solo las funciones la leen), dos funciones y reemplazos ANCLADOS (ADR-0288).
-- Va DESPUÉS de 20261026150000 y 20261026151000. Idempotente. Sin `select … into` dentro de un texto entre comillas.
-- ============================================================================
set lock_timeout = '3s';

create table if not exists retail.producto_avios (
  id uuid primary key default gen_random_uuid(),
  -- Con cascada: la ficha es configuración del modelo (como sus fotos), no historia; un modelo sin órdenes ni movimientos se puede eliminar aunque ya tenga su ficha (ADR-0513).
  producto_id uuid not null references retail.productos (id) on delete cascade,
  insumo_id uuid not null references retail.insumos (id),
  -- Nulo = para toda la orden (el botón, la etiqueta); un color = solo para las prendas de ese color (el hilo del beige).
  color_codigo text references retail.colores (codigo),
  cantidad_por_prenda numeric(10, 3) not null check (cantidad_por_prenda > 0 and cantidad_por_prenda <= 9999),
  declarado_por uuid references public.personas (id),
  created_at timestamptz not null default now(),
  archivado_at timestamptz
);
create unique index if not exists producto_avios_vigente_uq on retail.producto_avios (producto_id, insumo_id, coalesce(color_codigo, '')) where archivado_at is null;
create index if not exists producto_avios_producto_idx on retail.producto_avios (producto_id) where archivado_at is null;
comment on table retail.producto_avios is
  'ADR-0513: los avíos de un modelo (con la forma de una fila de la orden). Los vigentes los propone Nueva orden; reemplazar la lista archiva los anteriores, no los borra.';
alter table retail.producto_avios enable row level security;

-- Reemplaza los avíos vigentes de un modelo por los AVÍOS de `p_insumos` (la lista ya normalizada de una orden: las telas se ignoran). Interna: la llaman las funciones
-- que ya comprobaron permisos. Devuelve cuántos avíos quedaron vigentes.
create or replace function retail.fn_producto_avios_reemplazar(p_producto_id uuid, p_insumos jsonb, p_actor uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare
  v_n integer := 0;
  v_i jsonb;
begin
  update retail.producto_avios set archivado_at = now() where producto_id = p_producto_id and archivado_at is null;
  for v_i in select e.value from jsonb_array_elements(coalesce(p_insumos, '[]'::jsonb)) e loop
    if exists (select 1 from retail.insumos x where x.id = (v_i ->> 'insumo_id')::uuid and x.tipo = 'avio') then
      insert into retail.producto_avios (producto_id, insumo_id, color_codigo, cantidad_por_prenda, declarado_por)
      values (p_producto_id, (v_i ->> 'insumo_id')::uuid, nullif(v_i ->> 'color_codigo', ''), (v_i ->> 'consumo_por_prenda')::numeric, p_actor);
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;
comment on function retail.fn_producto_avios_reemplazar(uuid, jsonb, uuid) is
  'ADR-0513: archiva los avíos vigentes del modelo y deja como vigentes los avíos de la lista. Interna: quien la llama ya comprobó permisos.';
revoke all on function retail.fn_producto_avios_reemplazar(uuid, jsonb, uuid) from public, anon, authenticated;

-- Reemplaza `p_viejo` por `p_nuevo` en la función viva; `p_viejo` tiene que aparecer exactamente una vez. Si `p_nuevo` ya está, no hace nada.
create or replace function pg_temp.reemplazar_anclado(p_firma text, p_viejo text, p_nuevo text)
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
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta migración: el ancla aparece % veces (se esperaba 1). Regenera el reemplazo desde su definición real.',
      p_firma, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- 1. Antes de abrir: corregir los avíos que el modelo YA dice es de quien edita el catálogo (como el consumo).
select pg_temp.reemplazar_anclado(
  'retail.abrir_orden_produccion(jsonb, jsonb, jsonb)',
  $v$  v_fases := retail.fn_produccion_fases_normalizar(p_fases);$v$,
  $v$  if coalesce((p_apertura ->> 'fijar_avios_modelo')::boolean, false) and not coalesce((p_apertura ->> 'modelo_nuevo')::boolean, false) and not retail.fn_puede_editar_catalogo()
     and exists (select 1 from retail.producto_avios a where a.producto_id = nullif(p_apertura ->> 'producto_id', '')::uuid and a.archivado_at is null) then
    raise exception 'Corregir los avíos que dice el modelo es de quien edita el catálogo' using errcode = '42501', hint = 'avios_modelo_sin_permiso';
  end if;
  v_fases := retail.fn_produccion_fases_normalizar(p_fases);$v$
);
-- 2. Ya abierta la orden: sus avíos pasan a ser los del modelo (si el modelo no tenía, o si se pidió y se puede). Fuera del bloque que se traga los errores de la actividad.
select pg_temp.reemplazar_anclado(
  'retail.abrir_orden_produccion(jsonb, jsonb, jsonb)',
  $v$  begin
    select p.referencia into v_referencia from retail.productos p where p.id = v_producto;$v$,
  $v$  if exists (select 1 from jsonb_array_elements(v_insumos) e where exists (select 1 from retail.insumos x where x.id = (e ->> 'insumo_id')::uuid and x.tipo = 'avio'))
     and (coalesce((p_apertura ->> 'fijar_avios_modelo')::boolean, false) or not exists (select 1 from retail.producto_avios a where a.producto_id = v_producto and a.archivado_at is null)) then
    perform retail.fn_producto_avios_reemplazar(v_producto, v_insumos, v_actor);
  end if;

  begin
    select p.referencia into v_referencia from retail.productos p where p.id = v_producto;$v$
);
-- 3. Nueva orden recibe los avíos vigentes de cada modelo.
select pg_temp.reemplazar_anclado(
  'retail.fn_nueva_orden_opciones(uuid)',
  $v$    'comprometido', coalesce((
      select jsonb_agg(jsonb_build_object('insumo_id', x.insumo_id, 'cantidad', x.cantidad))$v$,
  $v$    'avios_modelo', coalesce((
      select jsonb_agg(jsonb_build_object('producto_id', a.producto_id, 'insumo_id', a.insumo_id, 'color_codigo', a.color_codigo, 'cantidad_por_prenda', a.cantidad_por_prenda) order by a.created_at, a.id)
      from retail.producto_avios a where a.archivado_at is null), '[]'::jsonb),
    'comprometido', coalesce((
      select jsonb_agg(jsonb_build_object('insumo_id', x.insumo_id, 'cantidad', x.cantidad))$v$
);

reset lock_timeout;
