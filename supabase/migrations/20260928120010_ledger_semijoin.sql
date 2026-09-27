-- ============================================================================
-- 20260928120010_ledger_semijoin.sql — CAYLA V2 · ADR-0202 (libro único) · paso 1 de Frescura 3c (ADR-0208, ADR-0248)
-- `fn_ledger_puntos` más rápido, con los mismos resultados.
--
-- EL PROBLEMA PRIMERO. `fn_ledger_puntos` es el libro único de piso y almacén: lo leen Análisis, Existencias,
-- Movimientos (el saldo por prenda) y «Bajadas al piso», y lo va a leer Frescura. Cuando se le pasa la lista de
-- prendas, filtra con `variante_id = any(p_variante_ids)` en tres lugares (el stock de hoy y las dos mitades de los
-- movimientos). Dentro de una función, Postgres no conoce la lista al planear, así que compara CADA fila contra la
-- lista ENTERA: con una tienda de 2.000 prendas, cada movimiento se compara hasta 2.000 veces. Medido con carga
-- sintética el 2026-09-25 (una tienda, 2.000 prendas, 20.001 bajadas, 10.001 ventas): `fn_bajadas_del_piso` a 120 días
-- tardaba unos 560 ms, casi todo en el libro (ADR-0208, «Verificación en local»; BACKLOG, bloque 1).
--
-- QUÉ HACE. Cambia esas tres comparaciones por `variante_id in (select unnest(p_variante_ids))`: Postgres arma la
-- lista UNA vez en una tabla hash y cada fila se busca de un salto. Nada más cambia: misma firma, mismas columnas,
-- mismas filas. Con la lista vacía (null = todas las prendas de la tienda) sigue igual.
--
-- CUÁNTO GANA (medido el 2026-09-27 en un Postgres 17 desechable, producción es 17.6; una tienda, 2.000 prendas, 20.000
-- bajadas en 1.000 documentos y 10.000 ventas en 120 días; cinco corridas de cada una):
--   · `fn_bajadas_del_piso` a 120 días: de 489-506 ms a 295-307 ms.
--   · `fn_ledger_puntos` con las 2.000 prendas: de 395-426 ms a 204-243 ms.
--   · 0 filas distintas: 20.001 bajadas y 44.000 puntos del libro, comparados con `except all` en los dos sentidos.
--   · El plan anidado (auto_explain) muestra «hashed SubPlan» en los tres filtros.
--
-- LA GUARDA. Reescribir el cuerpo borraría en silencio cualquier parche en vivo, así que solo sigue si el cuerpo vivo
-- es uno de estos (md5 de `prosrc`):
--   · 6e46fe4f28b487569c05c2fd986055a9 — producción (consulta de solo lectura del 2026-09-27).
--   · 96dcc45e365aa806370871a0296d7481 — una base armada desde el repo (local y CI). Es el MISMO código: el archivo
--     20260924030000 tiene un comentario de 6 líneas antes de `ids_piso`, en la columna 0, que el cuerpo de
--     producción no trae (quitándolo, el md5 da exactamente el de producción). El cuerpo de abajo tampoco lo trae,
--     para que el resultado sea el mismo en todas partes.
--   · a3d9fb69f32e0df2bb7f082e4b14215b — esta misma migración ya pegada: se puede volver a pegar sin daño.
-- Con cualquier otro, aborta sin tocar nada: alguien la cambió después y hay que reescribir desde su definición real.
-- (Buscado antes de escribir: ninguna migración la recrea ni la parcha con `reemplazar_vivo` después de 20260924030000.)
--
-- CÓMO SE PEGA EN PRODUCCIÓN. Sola, en el SQL Editor, tal cual (ya trae `retail.`), a cualquier hora: una guarda, un
-- `create or replace function` con la misma firma, su comentario y un `revoke`. No toma candados de tablas en uso ni
-- lleva políticas ni `drop trigger` (ADR-0195). Es la primera del diseño 3c y no depende de ninguna otra de ese diseño.
-- Cómo se verifica después: `select md5(prosrc) from pg_proc where pronamespace = 'retail'::regnamespace and proname =
-- 'fn_ledger_puntos';` da a3d9fb69f32e0df2bb7f082e4b14215b, y Análisis de TRU muestra las mismas cifras que antes.
--
-- SE ROMPE SI alguien vuelve a pegar 20260924030000 (vuelve el `= any`: los mismos resultados, más lento), o si una
-- versión futura de Postgres deja de convertir el `in (select …)` dentro de un `or` en una búsqueda por hash (se ve
-- con auto_explain y `log_nested_statements`: debe decir «hashed SubPlan»).
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

do $$
declare
  v_md5 text;
begin
  select md5(p.prosrc) into v_md5
    from pg_proc p
   where p.oid = to_regprocedure('retail.fn_ledger_puntos(uuid, timestamptz, uuid[])');
  if v_md5 is null then
    raise exception 'Falta retail.fn_ledger_puntos: pega antes 20260924030000_ledger_fuente_unica.sql';
  end if;
  if v_md5 not in ('6e46fe4f28b487569c05c2fd986055a9', '96dcc45e365aa806370871a0296d7481', 'a3d9fb69f32e0df2bb7f082e4b14215b') then
    raise exception 'fn_ledger_puntos cambió desde que se escribió esta migración (md5 del cuerpo: %, se esperaba 6e46fe4f28b487569c05c2fd986055a9). Alguien la parchó en vivo: reescribe el cuerpo desde su definición real antes de pegar.', v_md5;
  end if;
end $$;

create or replace function retail.fn_ledger_puntos(
  p_ubicacion_id uuid,
  p_desde timestamptz,
  p_variante_ids uuid[] default null
)
returns table (
  variante_id uuid,
  bucket text,          -- 'piso' (solo piso_venta) | 'total' (piso + almacén, nunca cuarentena)
  ts timestamptz,
  ord smallint,          -- 0 = saldo inicial (ancla en `stock` real), 1 = movimiento real
  oid uuid,              -- id del movimiento; null en el saldo inicial
  delta integer,         -- variación neta de este punto (el saldo inicial "varía" desde 0)
  nivel integer,         -- saldo acumulado en este punto
  es_venta boolean,      -- solo tiene sentido en 'piso'; una venta real o un cambio (nunca traslado/ajuste)
  es_interno boolean     -- solo tiene sentido en 'piso'; traslado piso↔almacén de la MISMA sede (fn_es_traslado_interno), no cruza de sede
)
language sql
stable
set search_path to 'retail', 'public', 'extensions'
as $$
with params as (
  select '22222222-2222-4222-8222-222222222222'::uuid as centinela
),
pedidas as (
  select v as variante_id from unnest(p_variante_ids) as v where p_variante_ids is not null
),
ub as (
  select exists (
    select 1 from sububicaciones su where su.ubicacion_id = p_ubicacion_id and su.tipo in ('piso_venta', 'almacen_tienda')
  ) as separa
  from ubicaciones u
  where u.id = p_ubicacion_id and u.activo
),
actual as (
  select s.variante_id,
    coalesce(sum(s.cantidad) filter (where su.tipo is distinct from 'cuarentena'), 0)::integer as total,
    case when ub.separa then coalesce(sum(s.cantidad) filter (where su.tipo = 'piso_venta'), 0)
         else coalesce(sum(s.cantidad) filter (where su.tipo is distinct from 'cuarentena'), 0) end::integer as piso
  from stock s
  left join sububicaciones su on su.id = s.sububicacion_id
  cross join ub
  where s.ubicacion_id = p_ubicacion_id
    and s.variante_id <> (select centinela from params)
    and (p_variante_ids is null or s.variante_id in (select unnest(p_variante_ids)))
  group by s.variante_id, ub.separa
),
efectos as (
  select e.variante_id, e.created_at, e.id, e.delta, su.tipo as sub_tipo, e.es_venta, e.es_interno
  from (
    select m.variante_id, m.sububicacion_id, m.created_at, m.id,
      case m.tipo when 'entrada' then m.cantidad when 'salida' then -m.cantidad
                  when 'ajuste' then m.cantidad when 'traslado' then -m.cantidad end as delta,
      retail.fn_es_venta_de_stock(m.tipo, m.motivo, m.cambio_id, m.venta_item_id, ve.estado) as es_venta,
      retail.fn_es_traslado_interno(m.tipo, m.ubicacion_id, m.ubicacion_destino_id) as es_interno
    from movimientos m
    left join venta_items vi on vi.id = m.venta_item_id
    left join ventas ve on ve.id = vi.venta_id
    where m.ubicacion_id = p_ubicacion_id
      and m.created_at >= p_desde
      and m.tipo in ('entrada', 'salida', 'ajuste', 'traslado')
      and m.variante_id <> (select centinela from params)
      and (p_variante_ids is null or m.variante_id in (select unnest(p_variante_ids)))
    union all
    select m.variante_id, m.sububicacion_destino_id, m.created_at, m.id, m.cantidad, false as es_venta,
      retail.fn_es_traslado_interno(m.tipo, m.ubicacion_id, m.ubicacion_destino_id) as es_interno
    from movimientos m
    where m.ubicacion_destino_id = p_ubicacion_id
      and m.created_at >= p_desde
      and m.tipo = 'traslado'
      and m.variante_id <> (select centinela from params)
      and (p_variante_ids is null or m.variante_id in (select unnest(p_variante_ids)))
  ) e
  left join sububicaciones su on su.id = e.sububicacion_id
  where e.delta <> 0
),
efectos_clase as (
  select ef.variante_id, ef.created_at, ef.id, ef.es_venta, ef.es_interno,
    case when ub.separa
         then case when ef.sub_tipo = 'piso_venta' then ef.delta else 0 end
         else case when ef.sub_tipo is distinct from 'cuarentena' then ef.delta else 0 end end as d_piso,
    -- Nunca condicionado a que la sede separe piso/almacén ni a que `sub_tipo` resuelva a un tipo
    -- conocido (fix del bucket total, ADR-0200): un movimiento sin sububicacion_id no debe inflar
    -- ni vaciar el total en silencio.
    case when ef.sub_tipo is distinct from 'cuarentena' then ef.delta else 0 end as d_total
  from efectos ef
  cross join ub
),
mov_piso as (
  select ec.variante_id, ec.created_at, ec.id, sum(ec.d_piso) as d, bool_or(ec.es_venta) as es_venta, bool_or(ec.es_interno) as es_interno
  from efectos_clase ec
  group by ec.variante_id, ec.created_at, ec.id
  having sum(ec.d_piso) <> 0
),
mov_total as (
  select ec.variante_id, ec.created_at, ec.id, sum(ec.d_total) as d
  from efectos_clase ec
  group by ec.variante_id, ec.created_at, ec.id
  having sum(ec.d_total) <> 0
),
ids_piso as (
  select variante_id from mov_piso
  union
  select variante_id from pedidas
),
ids_total as (
  select variante_id from mov_total
  union
  select variante_id from pedidas
),
s_piso as (
  select i.variante_id, coalesce(max(ac.piso), 0) - coalesce(sum(mp.d), 0) as s_start
  from ids_piso i
  left join actual ac on ac.variante_id = i.variante_id
  left join mov_piso mp on mp.variante_id = i.variante_id
  group by i.variante_id
),
s_total as (
  select i.variante_id, coalesce(max(ac.total), 0) - coalesce(sum(mp.d), 0) as s_start
  from ids_total i
  left join actual ac on ac.variante_id = i.variante_id
  left join mov_total mp on mp.variante_id = i.variante_id
  group by i.variante_id
),
puntos_piso as (
  select si.variante_id, 'piso'::text as bucket, p_desde as ts, 0::smallint as ord, null::uuid as oid,
    si.s_start as delta, si.s_start as nivel, false as es_venta, false as es_interno
  from s_piso si
  union all
  select mp.variante_id, 'piso'::text, mp.created_at, 1::smallint, mp.id,
    mp.d,
    si.s_start + sum(mp.d) over (partition by mp.variante_id order by mp.created_at, mp.id),
    mp.es_venta, mp.es_interno
  from mov_piso mp
  join s_piso si on si.variante_id = mp.variante_id
),
puntos_total as (
  select si.variante_id, 'total'::text as bucket, p_desde as ts, 0::smallint as ord, null::uuid as oid,
    si.s_start as delta, si.s_start as nivel, false as es_venta, false as es_interno
  from s_total si
  union all
  select mp.variante_id, 'total'::text, mp.created_at, 1::smallint, mp.id,
    mp.d,
    si.s_start + sum(mp.d) over (partition by mp.variante_id order by mp.created_at, mp.id),
    false, false
  from mov_total mp
  join s_total si on si.variante_id = mp.variante_id
)
select * from puntos_piso
union all
select * from puntos_total;
$$;

comment on function retail.fn_ledger_puntos(uuid, timestamptz, uuid[]) is
  'Única fuente de verdad de la reconstrucción del ledger (2026-09-24, ADR-0202): el nivel de PISO y de TOTAL (piso+almacén, nunca cuarentena) en cada punto (saldo inicial + cada movimiento neto), para una sede desde un punto de partida, opcionalmente acotado a un arreglo de variantes. No calcula intervalos ni eventos: fn_resumen_comparacion y fn_ledger_timeline arman lo que necesitan a partir de estos mismos puntos. Función interna (no otorgada a authenticated): la autorización vive en cada función que la llama. Desde 20260928120010 el arreglo filtra con un semi-join por hash (in (select unnest(...))), no con = any: mismas filas, más rápido.';

revoke all on function retail.fn_ledger_puntos(uuid, timestamptz, uuid[]) from public, anon, authenticated;

reset lock_timeout;
