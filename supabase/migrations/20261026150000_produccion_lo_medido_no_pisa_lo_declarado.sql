-- ============================================================================
-- 20261026150000_produccion_lo_medido_no_pisa_lo_declarado.sql — CAYLA V2 (ficha de consumo del modelo, ADR-0513, actividad 1 · 2026-10-26)
--
-- EL PROBLEMA PRIMERO. `cerrar_produccion` escribía lo medido (metros gastados ÷ prendas buenas) en `producto_consumos.tela_por_prenda`, encima de lo
-- declarado, ya desde la PRIMERA orden cerrada. Tres daños: (1) la cifra de Audaces se perdía y «Volver a Audaces» era imposible; (2) contradecía la regla
-- de Felipe (P-21, 2026-10-16: lo medido manda solo desde la 3.ª orden cerrada del modelo); (3) con consumo por talla, un promedio de lote aplanaría la
-- diferencia entre la S y la M. Dos cosas distintas (lo declarado y lo medido) vivían entrelazadas en una sola columna con una etiqueta (`fuente`).
--
-- LA DECISIÓN. Se separan:
--   · `producto_consumos` queda SOLO con lo declarado (Audaces, o lo que alguien dejó como el del modelo). Nadie más lo pisa.
--   · `producto_consumo_medido`: una fila por orden cerrada con las prendas buenas y los metros de tela que de verdad se gastaron. La escribe `cerrar_produccion`
--     (si se vuelve a cerrar la misma orden, se reescribe su fila; no suma otra).
--   · `fn_consumo_efectivo(producto)`: lo que manda hoy. Lo medido manda cuando hay 3 o más órdenes cerradas DESPUÉS de la última vez que alguien declaró el
--     consumo (declarar de nuevo —o «Dejar como el del modelo»— reinicia la cuenta: es volver a Audaces a propósito). Una orden que se revierte
--     (`revertir_produccion` la deja de nuevo en proceso) deja de contar sola, sin tocar nada.
--   · `fn_nueva_orden_opciones` entrega lo que manda como siempre (`tela_por_prenda` y `fuente`, para que la web de hoy no cambie) y suma tres datos
--     (`declarado_por_prenda`, `medido_por_prenda`, `ordenes_medidas`) que las siguientes actividades leen.
--
-- CONTRATO (Liskov)
--   PROMETE: ningún cierre vuelve a escribir `producto_consumos`; lo declarado queda intacto hasta que alguien lo declare. `fn_consumo_efectivo` dice
--            `medido` solo con 3 o más órdenes cerradas posteriores a lo declarado, y su cifra es Σ metros ÷ Σ buenas de ellas (3 decimales).
--   ASUME:   las dos funciones vivas a la fecha (anclas verificadas en local el 2026-10-26): `cerrar_produccion(uuid, jsonb, numeric, numeric, numeric, boolean)`
--            y `fn_nueva_orden_opciones(uuid)`. Si cambiaron, el reemplazo se detiene sin tocar nada.
--   NO HACE: no toca stock, costos ni `movimientos`; no migra datos (en producción hay 0 órdenes cerradas con fases y 0 consumos medidos, 2026-10-26); no
--            borra la columna `fuente` (queda con sus dos valores permitidos; nada nuevo escribe `medido`).
--
-- DESCARTÉ
--   · Guardar un contador y una marca «lo medido manda» en `producto_consumos`: dos números que se desencuentran al primer revertir una orden. Lo medido es
--     una consulta sobre filas, no una columna.
--   · Una bandera `revertido` para «Volver a Audaces»: otra columna que recordar. Declarar de nuevo ya dice «desde aquí cuenta lo nuevo».
--
-- SE ROMPE SI
--   · Dos cierres de órdenes del mismo modelo en el mismo milisegundo: cada uno escribe SU fila (la clave es la orden), así que no se pisan.
--   · Alguien edita `producto_consumos.updated_at` a mano hacia el pasado: contaría órdenes viejas. No hay camino de la API que lo haga.
--
-- CÓMO SE PEGA. Una sola parte. Una tabla nueva (sin políticas: RLS encendido y solo las funciones la leen), una función y dos reemplazos ANCLADOS
-- (ADR-0288: el texto viejo tiene que aparecer exactamente una vez; si no, se detiene sin tocar nada). Idempotente. Nada de `select … into` dentro de un texto
-- entre comillas.
-- ============================================================================
set lock_timeout = '3s';

create table if not exists retail.producto_consumo_medido (
  produccion_id uuid primary key references retail.producciones (id),
  producto_id uuid not null references retail.productos (id),
  buenas integer not null check (buenas > 0),
  metros numeric(12, 3) not null check (metros > 0),
  cerrada_en timestamptz not null default clock_timestamp()
);
create index if not exists producto_consumo_medido_producto_idx on retail.producto_consumo_medido (producto_id, cerrada_en);
comment on table retail.producto_consumo_medido is
  'ADR-0513: lo que de verdad se gastó en una orden cerrada (metros de tela ÷ prendas buenas). Una fila por orden. Solo lo escribe cerrar_produccion; '
  'lo declarado vive aparte en producto_consumos y nunca se pisa.';
alter table retail.producto_consumo_medido enable row level security;

-- Lo que manda hoy para un modelo. Sin fila declarada no devuelve nada (no hay consumo que proponer).
create or replace function retail.fn_consumo_efectivo(p_producto_id uuid)
returns table (manda text, medido_por_prenda numeric, ordenes_medidas integer)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  -- 3 = las órdenes cerradas que hacen falta para que lo gastado mande sobre lo declarado (P-21, Felipe 2026-10-16). La web lo repite como constante.
  select case when m.n >= 3 then 'medido' else 'declarado' end, m.por_prenda, m.n
    from retail.producto_consumos c
   cross join lateral (
     select count(*)::integer as n,
            case when coalesce(sum(x.buenas), 0) > 0 then round(sum(x.metros) / sum(x.buenas), 3) end as por_prenda
       from retail.producto_consumo_medido x
       join retail.producciones p on p.id = x.produccion_id
      where x.producto_id = c.producto_id and p.estado = 'terminada' and x.cerrada_en > c.updated_at
   ) m
   where c.producto_id = p_producto_id;
$$;
comment on function retail.fn_consumo_efectivo(uuid) is
  'ADR-0513: qué manda para el consumo de tela del modelo: lo declarado, o lo medido si hay 3 o más órdenes cerradas posteriores a la última declaración.';
revoke all on function retail.fn_consumo_efectivo(uuid) from public, anon, authenticated;

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

-- 1. Al pasar un lote al stock, lo medido se anota en su fila (no encima de lo declarado).
select pg_temp.reemplazar_anclado(
  'retail.cerrar_produccion(uuid, jsonb, numeric, numeric, numeric, boolean)',
  $v$      insert into retail.producto_consumos (producto_id, tela_por_prenda, fuente, actualizado_por)
        values (v_orden.producto_id, round(v_usado / v_total, 3), 'medido', v_persona)
      on conflict (producto_id) do update
        set tela_por_prenda = excluded.tela_por_prenda, fuente = 'medido', actualizado_por = excluded.actualizado_por, updated_at = now();$v$,
  $v$      insert into retail.producto_consumo_medido (produccion_id, producto_id, buenas, metros)
        values (p_produccion_id, v_orden.producto_id, v_total, round(v_usado, 3))
      on conflict (produccion_id) do update
        set producto_id = excluded.producto_id, buenas = excluded.buenas, metros = excluded.metros, cerrada_en = clock_timestamp();$v$
);

-- 2. Nueva orden recibe lo que manda (con la forma de siempre) y, además, lo declarado, lo medido y cuántas órdenes lo respaldan.
select pg_temp.reemplazar_anclado(
  'retail.fn_nueva_orden_opciones(uuid)',
  $v$      select jsonb_agg(jsonb_build_object('producto_id', c.producto_id, 'tela_por_prenda', c.tela_por_prenda, 'por_talla', c.por_talla, 'fuente', c.fuente))
      from retail.producto_consumos c), '[]'::jsonb),$v$,
  $v$      select jsonb_agg(jsonb_build_object('producto_id', c.producto_id,
        'tela_por_prenda', case when e.manda = 'medido' then e.medido_por_prenda else c.tela_por_prenda end,
        'por_talla', c.por_talla,
        'fuente', case when e.manda = 'medido' then 'medido' else 'declarado' end,
        'declarado_por_prenda', c.tela_por_prenda, 'medido_por_prenda', e.medido_por_prenda, 'ordenes_medidas', e.ordenes_medidas))
      from retail.producto_consumos c
      cross join lateral retail.fn_consumo_efectivo(c.producto_id) e), '[]'::jsonb),$v$
);

reset lock_timeout;
