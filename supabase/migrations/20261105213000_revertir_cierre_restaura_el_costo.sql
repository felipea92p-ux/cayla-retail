-- ============================================================================
-- 20261105213000_revertir_cierre_restaura_el_costo.sql — CAYLA V2 (Felipe, 2026-11-05; ADR-0614, actividad 1)
-- Revertir el cierre de una orden del Taller devuelve también el costo de la prenda
--
-- EL PROBLEMA PRIMERO. `cerrar_produccion` mete el costo real de la orden en el promedio de la prenda (`variantes.costo`, uno solo
-- para todas las sedes). `revertir_produccion` sacaba las prendas del stock, pero dejaba ese promedio tal como quedó: una orden mal
-- cerrada dejaba mal el costo para siempre, y el cierre siguiente se medía contra un número equivocado. Hallazgo abierto desde el 15-oct.
--
-- LA DECISIÓN. Se devuelve el costo exacto de antes del cierre (`costo_anterior` de su fila), solo si ese cierre es lo último que movió
-- el costo de la prenda. Si después entró otra compra u otro cierre, el costo ya está mezclado: se rechaza (`revertir_costo_mezclado`).
-- Revertir en orden inverso sí se puede: primero el cierre más nuevo, después el anterior. Es el mismo criterio de «corregir solo la
-- última compra» (ADR-0515): lo mezclado no se reescribe.
--
-- CÓMO QUEDA ESCRITO. `costo_historial` solo se agrega: el cierre no se borra. Se suma una fila `origen = 'reversion'` que apunta al
-- movimiento del cierre que deshace (`revierte_movimiento_id`). Así la cadena costo anterior → costo que quedó sigue entera (la vigila
-- `cadena_rota` en `fn_resumen_variantes`) y `fn_costo_variante_al` responde bien sin cambiar. El par cierre + reversión sale de
-- `fn_costo_historial_efectivo`, que es lo que lee la pestaña «Costo» y «corregir la última compra»: para ellos ese cierre nunca pasó.
--
-- `orden` (columna nueva) dice qué fila va después de cuál. `created_at` no alcanza: es la hora de la transacción y todas las líneas de
-- una compra la comparten a propósito (`corregir_costo_de_compra` las agrupa por ella).
--
-- CONTRATO (Liskov)
--   PROMETE: `revertir_produccion` con la misma firma; por cada prenda que entró al stock, una fila de reversión y `variantes.costo`
--            igual a lo que era antes del cierre. Lo vendido entre el cierre y la reversión no cambia: cada venta guardó su costo.
--   ASUME:   que la llama `revertir_produccion`, ya con la orden bloqueada, antes de aplicar la salida (el stock todavía incluye esas prendas).
--   FALLA:   `revertir_costo_mezclado` (otra compra o cierre entró después) y `revertir_costo_desalineado` (el costo no es el que dejó
--            el cierre: algo lo movió por fuera, se detiene en vez de pisarlo). No queda nada escrito.
--   NO HACE: no toca una orden «ya estaba» ni una muestra (nunca movieron el costo), ni `fn_variantes_con_costo_oficial`: una prenda con
--            un cierre revertido sigue con su costo bloqueado a mano.
--
-- PRODUCCIÓN. Una sola parte, re-ejecutable. Sin políticas ni `drop trigger`: ADR-0195 no aplica. `costo_historial` se reescribe una vez por
-- la columna `orden` (unas miles de filas, una fracción de segundo; lo usa Recibir, por eso el `lock_timeout`). Producción tiene 0
-- órdenes cerradas: no hay ninguna fila que convertir. Pegar ANTES de publicar la web; la web vieja funciona igual con esto.
--
-- VERIFICACIÓN (solo lectura):
--   select position('fn_revertir_costo_del_cierre' in pg_get_functiondef('retail.revertir_produccion(uuid)'::regprocedure)) > 0,
--          exists (select 1 from information_schema.columns where table_schema = 'retail' and table_name = 'costo_historial' and column_name = 'orden');  → t | t
-- CÓMO SE DESHACE: los cinco reemplazos al revés, `drop function retail.fn_revertir_costo_del_cierre(uuid, integer, uuid, uuid)` y las dos
-- columnas si no hay ninguna fila `reversion` (si la hay, se deja: la fila dice lo que pasó).
-- ============================================================================

set lock_timeout = '3s';

alter table retail.costo_historial
  add column if not exists orden bigint generated always as identity,
  add column if not exists revierte_movimiento_id uuid references retail.movimientos (id),
  drop constraint if exists costo_historial_origen_check,
  add constraint costo_historial_origen_check check (origen = any (array['compra'::text, 'produccion'::text, 'reversion'::text])),
  drop constraint if exists costo_historial_reversion_coherente,
  add constraint costo_historial_reversion_coherente check ((origen = 'reversion') = (revierte_movimiento_id is not null));

create unique index if not exists costo_historial_revierte_una_vez
  on retail.costo_historial (revierte_movimiento_id) where revierte_movimiento_id is not null;

create index if not exists costo_historial_variante_orden on retail.costo_historial (variante_id, orden);

comment on column retail.costo_historial.orden is 'ADR-0614: en qué orden se escribieron las filas. created_at no alcanza: las líneas de una misma compra lo comparten.';
comment on column retail.costo_historial.revierte_movimiento_id is 'ADR-0614: en una fila de reversión, el movimiento del cierre del Taller que deshace.';

create or replace function retail.fn_revertir_costo_del_cierre(p_variante_id uuid, p_cantidad integer, p_produccion_id uuid, p_movimiento_id uuid)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_cierre retail.costo_historial%rowtype;
  v_costo numeric;
  v_codigo text;
  v_stock integer;
begin
  -- El mismo candado de `fn_recalcular_costo_variante`: una compra o un cierre de esta prenda se turna con esta reversión.
  select v.costo, coalesce(v.codigo, v.sku, 'esta prenda') into v_costo, v_codigo
    from retail.variantes v where v.id = p_variante_id for no key update;

  select ch.* into v_cierre
    from retail.costo_historial ch
    join retail.movimientos m on m.id = ch.movimiento_id
   where ch.variante_id = p_variante_id
     and ch.origen = 'produccion'
     and m.produccion_id = p_produccion_id
     and not exists (select 1 from retail.costo_historial r where r.revierte_movimiento_id = ch.movimiento_id)
   order by ch.orden desc
   limit 1;
  if not found then
    return; -- Ese cierre no movió el costo: no hay nada que devolver.
  end if;

  if exists (
    select 1 from retail.costo_historial d
     where d.variante_id = p_variante_id
       and d.orden > v_cierre.orden
       and d.origen <> 'reversion'
       and not exists (select 1 from retail.costo_historial r where r.revierte_movimiento_id = d.movimiento_id)
  ) then
    raise exception 'Después de este cierre entró otra compra o se cerró otra orden de %, y su costo ya está mezclado. Si fue otra orden, revierte esa primero.', v_codigo
      using hint = 'revertir_costo_mezclado';
  end if;

  if v_costo is distinct from v_cierre.costo_resultante then
    raise exception 'El costo de % no es el que dejó este cierre: no se revierte para no pisarlo. Avisa al líder.', v_codigo
      using hint = 'revertir_costo_desalineado';
  end if;

  v_stock := (select coalesce(sum(s.cantidad), 0)::integer from retail.stock s where s.variante_id = p_variante_id);

  insert into retail.costo_historial (
    variante_id, stock_previo, costo_anterior, cantidad_nueva, costo_unitario_nuevo, costo_resultante, origen, movimiento_id, usuario_id, revierte_movimiento_id
  ) values (
    p_variante_id, v_stock, v_costo, p_cantidad, v_cierre.costo_unitario_nuevo, v_cierre.costo_anterior, 'reversion', p_movimiento_id,
    retail.fn_actor_persona_id(true), v_cierre.movimiento_id
  );

  update retail.variantes set costo = v_cierre.costo_anterior where id = p_variante_id;
end;
$$;

revoke all on function retail.fn_revertir_costo_del_cierre(uuid, integer, uuid, uuid) from public, anon, authenticated;

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

-- Revertir: cada prenda que sale devuelve su costo, antes de aplicar la salida.
select pg_temp.reemplazar_anclado(
  'retail.revertir_produccion(uuid)',
  $v$'reversion_produccion', p_produccion_id, v_persona)
        returning id into v_mov;
$v$,
  $n$'reversion_produccion', p_produccion_id, v_persona)
        returning id into v_mov;
      perform retail.fn_revertir_costo_del_cierre(v_linea.variante_id, v_linea.cantidad_buenas, p_produccion_id, v_mov);
$n$
);

-- La pestaña «Costo» y «corregir la última compra»: el par cierre + reversión no existe para ellas.
select pg_temp.reemplazar_anclado(
  'retail.fn_costo_historial_efectivo(uuid)',
  $v$where v.producto_id = p_producto_id$v$,
  $n$where v.producto_id = p_producto_id
     and ch.origen <> 'reversion'
     and not exists (select 1 from retail.costo_historial r where r.revierte_movimiento_id = ch.movimiento_id)$n$
);

-- «¿Cuál es la última compra?» se pregunta a lo efectivo: un cierre revertido no le quita a la compra de antes el ser la última.
select pg_temp.reemplazar_anclado(
  'retail.fn_costo_compra_corregible(uuid,timestamp with time zone)',
  $v$from retail.costo_historial ch join retail.variantes v on v.id = ch.variante_id$v$,
  $n$from retail.fn_costo_historial_efectivo(p_producto_id) ch join retail.variantes v on v.id = ch.variante_id$n$
);
select pg_temp.reemplazar_anclado(
  'retail.previsualizar_correccion_de_costo(uuid,timestamp with time zone,numeric)',
  $v$from retail.costo_historial ch join retail.variantes v on v.id = ch.variante_id$v$,
  $n$from retail.fn_costo_historial_efectivo(p_producto_id) ch join retail.variantes v on v.id = ch.variante_id$n$
);

-- Balance: la fila de reversión saca prendas en vez de sumarlas. Con la fórmula de una entrada contaría como un descuadre lo que es solo
-- volver atrás; con esta, igual que en una compra, lo único que queda es el redondeo del promedio.
select pg_temp.reemplazar_anclado(
  'retail.fn_bal_causas_mercaderia(date,date)',
  $v$-sum((h.stock_previo + h.cantidad_nueva) * h.costo_resultante - h.stock_previo * h.costo_anterior - h.cantidad_nueva * h.costo_unitario_nuevo)$v$,
  $n$-sum(case when h.origen = 'reversion'
                then (h.stock_previo - h.cantidad_nueva) * h.costo_resultante - h.stock_previo * h.costo_anterior + h.cantidad_nueva * h.costo_unitario_nuevo
                else (h.stock_previo + h.cantidad_nueva) * h.costo_resultante - h.stock_previo * h.costo_anterior - h.cantidad_nueva * h.costo_unitario_nuevo end)$n$
);

reset lock_timeout;
