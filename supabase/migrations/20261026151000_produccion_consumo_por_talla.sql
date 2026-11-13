-- ============================================================================
-- 20261026151000_produccion_consumo_por_talla.sql — CAYLA V2 (ficha de consumo del modelo, ADR-0513, actividad 2 · 2026-10-26)
--
-- EL PROBLEMA PRIMERO. El plan de una orden usaba UN número de tela por prenda para todas las tallas, aunque una M gasta más que una S
-- (`producto_consumos.por_talla` existe desde ADR-0400 y nada la escribía ni la leía). Con 40 S y 60 M, escribir el consumo de la S deja corto el
-- pedido y escribir el de la M lo deja largo. Y un número solo es, por definición, un aproximado: sin ese dato no hay forma de decirlo.
--
-- LA DECISIÓN.
--   · `produccion_insumos.consumo_por_talla` (jsonb, opcional): {"S": 1.150, "M": 1.200}. Nulo = un número para todas las tallas = aproximado.
--   · La MISMA función que valida al abrir y al editar (`fn_produccion_insumos_normalizar`) acepta `consumo_por_talla` en cada fila de la lista.
--     Si llega, MANDA: el plan es Σ (consumo de la talla × prendas de esa talla en el color de la fila) × (1 + merma de la tela), y
--     `consumo_por_prenda` pasa a ser el promedio de la fila (así todo lo que lee solo ese número sigue siendo cierto). Se exige una cifra por
--     cada talla que la fila fabrica y se rechaza una talla que la orden no fabrica (`insumo_talla_ajena`).
--   · `abrir_orden_produccion` y `guardar_insumos_orden` lo guardan (y lo comparan: una fila que no cambió de consumo por talla no se toca).
--   · Lo que la primera tela deja declarado en el modelo (o lo que «Dejar como el del modelo» corrige) incluye `por_talla`.
--   · La orden en una sola lectura (`fn_orden_produccion`) devuelve `consumo_por_talla` en cada fila, para que la hoja de editar lo muestre.
--
-- CONTRATO (Liskov)
--   PROMETE: sin `consumo_por_talla` todo queda EXACTAMENTE como estaba (mismo plan, mismos rechazos). Con él, el plan es la suma por talla y
--            `consumo_por_prenda` × prendas × (1 + merma) se acerca a ese plan (difiere solo por el redondeo a 3 decimales del promedio).
--   ASUME:   las cuatro funciones vivas a la fecha (anclas verificadas en local el 2026-10-26): `fn_produccion_insumos_normalizar(jsonb, jsonb, uuid)`,
--            `abrir_orden_produccion(jsonb, jsonb, jsonb)`, `guardar_insumos_orden(uuid, jsonb)` y `fn_orden_produccion(uuid)`. Si alguna cambió, el reemplazo
--            se detiene sin tocar nada. Las llaves del JSON son el nombre de la talla (`tallas.valor`: «S», «M»…), como en `producto_consumos.por_talla`.
--   NO HACE: no cambia órdenes ya abiertas (su plan sigue congelado); no toca el libro de insumos, stock ni costos; no migra datos (0 filas en producción).
--
-- DESCARTÉ
--   · Una tabla `produccion_insumo_tallas` con una fila por talla: un plan que se reparte en filas que alguien tiene que mantener sincronizadas con la
--     suma; un jsonb en la misma fila se escribe y se lee de una vez, y la suma sigue siendo del validador.
--   · Que la web mande el plan ya sumado: dos lugares que calculan lo mismo y se desencuentran (principio 4). El plan lo calcula la base.
--   · Que `consumo_por_prenda` quede en null con por talla: lo leen la hoja de la orden, el modelo (`tela_por_prenda`) y «Alcanza»; el promedio los
--     deja funcionando sin tocarlos.
--
-- SE ROMPE SI
--   · Una talla se renombra en el catálogo después de abrir la orden: la llave guardada ya no calza y la hoja de editar lo mostraría vacío (pide reescribir).
--     Las tallas no se renombran en la práctica (S, M, L…); si se vuelve común, guardar `talla_id`.
--   · Alguien manda el consumo por talla de un modelo cuyas variantes cambiaron de talla en mitad de la orden: se valida con las líneas de ESTA orden, no
--     con el catálogo de hoy.
--
-- CÓMO SE PEGA. Una sola parte: un `alter table … add column` (tabla sin filas y sin políticas) y reemplazos ANCLADOS (ADR-0288: el texto viejo aparece
-- exactamente una vez; si no, se detiene sin tocar nada). Va DESPUÉS de 20261026035000 y de 20261026150000. Idempotente. Sin `select … into` dentro de un
-- texto entre comillas.
-- ============================================================================
set lock_timeout = '3s';

alter table retail.produccion_insumos
  add column if not exists consumo_por_talla jsonb check (consumo_por_talla is null or jsonb_typeof(consumo_por_talla) = 'object');
comment on column retail.produccion_insumos.consumo_por_talla is
  'ADR-0513: metros (o unidades) por prenda de cada talla, {"S": 1.150, "M": 1.200}. Nulo = una sola cifra para todas las tallas (aproximado). Si está, el plan es la suma por talla.';

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

-- 1. El validador: acepta y valida `consumo_por_talla`, y calcula el plan por talla.
select pg_temp.reemplazar_anclado(
  'retail.fn_produccion_insumos_normalizar(jsonb, jsonb, uuid)',
  $v$  v_prendas integer; v_total integer; v_salida jsonb := '[]'::jsonb;$v$,
  $v$  v_prendas integer; v_total integer; v_salida jsonb := '[]'::jsonb;
  v_por_talla jsonb; v_tallas jsonb; v_plan numeric; v_suma numeric; v_peso numeric; v_t record;$v$
);
select pg_temp.reemplazar_anclado(
  'retail.fn_produccion_insumos_normalizar(jsonb, jsonb, uuid)',
  $v$    begin
      v_consumo := nullif(btrim(coalesce(v_i ->> 'consumo_por_prenda', '')), '')::numeric;$v$,
  $v$    -- ADR-0513: consumo por talla. Si llega, manda: el plan es la suma de cada talla × sus prendas × (1 + merma) y el consumo por prenda que se guarda
    -- es el promedio de la fila (así lo que lee solo ese número sigue siendo cierto).
    v_plan := null;
    v_por_talla := nullif(v_i -> 'consumo_por_talla', 'null'::jsonb);
    if v_por_talla is not null then
      if jsonb_typeof(v_por_talla) <> 'object' then
        raise exception 'El consumo por talla no es válido' using hint = 'insumo_consumo_invalido';
      end if;
      v_tallas := (
        select coalesce(jsonb_object_agg(x.talla, x.prendas), '{}'::jsonb) from (
          select t.valor as talla, sum((l ->> 'cantidad')::integer) as prendas
            from jsonb_array_elements(p_lineas) l
            join retail.variantes vv on vv.id = (l ->> 'variante_id')::uuid
            join retail.tallas t on t.id = vv.talla_id
           where v_color is null or vv.color_codigo = v_color
           group by t.valor
          having sum((l ->> 'cantidad')::integer) > 0) x);
      v_suma := 0;
      v_peso := 0;
      for v_t in select e.key as talla, e.value::integer as prendas from jsonb_each_text(v_tallas) e loop
        begin
          v_consumo := nullif(btrim(coalesce(v_por_talla ->> v_t.talla, '')), '')::numeric;
        exception when others then
          raise exception 'El consumo por prenda de la talla % no es un número válido', v_t.talla using hint = 'insumo_consumo_invalido';
        end;
        if v_consumo is null or v_consumo <= 0 or v_consumo > 9999 then
          raise exception 'Escribe cuánto lleva cada prenda de la talla %, mayor que cero', v_t.talla using hint = 'insumo_consumo_invalido';
        end if;
        v_suma := v_suma + v_consumo * v_t.prendas;
        v_peso := v_peso + v_t.prendas;
      end loop;
      for v_t in select k as talla, 0 as prendas from jsonb_object_keys(v_por_talla) k where not (v_tallas ? k) loop
        raise exception 'La orden no fabrica la talla «%»: su consumo no tiene a qué aplicarse', v_t.talla using hint = 'insumo_talla_ajena';
      end loop;
      if v_peso = 0 then
        raise exception 'La orden no fabrica ninguna talla para esa tela o avío' using hint = 'insumo_color_ajeno';
      end if;
      v_plan := round(v_suma * (1 + coalesce(v_merma, 0)), 3);
      v_i := jsonb_set(v_i, '{consumo_por_prenda}', to_jsonb(round(v_suma / v_peso, 3)));
      v_por_talla := (select jsonb_object_agg(e.key, round(e.value::numeric, 3)) from jsonb_each_text(v_por_talla) e);
    end if;
    begin
      v_consumo := nullif(btrim(coalesce(v_i ->> 'consumo_por_prenda', '')), '')::numeric;$v$
);
select pg_temp.reemplazar_anclado(
  'retail.fn_produccion_insumos_normalizar(jsonb, jsonb, uuid)',
  $v$      'cantidad_plan', round(v_consumo * v_prendas * (1 + coalesce(v_merma, 0)), 3), 'nota', v_nota);$v$,
  $v$      'cantidad_plan', coalesce(v_plan, round(v_consumo * v_prendas * (1 + coalesce(v_merma, 0)), 3)), 'nota', v_nota,
      'consumo_por_talla', case when v_plan is null then null else v_por_talla end);$v$
);

-- 2. Abrir la orden guarda el consumo por talla (en la fila de la orden y, si toca, en lo declarado del modelo).
select pg_temp.reemplazar_anclado(
  'retail.abrir_orden_produccion(jsonb, jsonb, jsonb)',
  $v$    insert into retail.produccion_insumos (produccion_id, insumo_id, color_codigo, consumo_por_prenda, cantidad_plan, nota)
    values (v_id, (v_i ->> 'insumo_id')::uuid, v_i ->> 'color_codigo', (v_i ->> 'consumo_por_prenda')::numeric,
      (v_i ->> 'cantidad_plan')::numeric, v_i ->> 'nota');$v$,
  $v$    insert into retail.produccion_insumos (produccion_id, insumo_id, color_codigo, consumo_por_prenda, consumo_por_talla, cantidad_plan, nota)
    values (v_id, (v_i ->> 'insumo_id')::uuid, v_i ->> 'color_codigo', (v_i ->> 'consumo_por_prenda')::numeric,
      nullif(v_i -> 'consumo_por_talla', 'null'::jsonb), (v_i ->> 'cantidad_plan')::numeric, v_i ->> 'nota');$v$
);
select pg_temp.reemplazar_anclado(
  'retail.abrir_orden_produccion(jsonb, jsonb, jsonb)',
  $v$        insert into retail.producto_consumos (producto_id, tela_por_prenda, fuente, actualizado_por)
        values (v_producto, (v_i ->> 'consumo_por_prenda')::numeric, 'declarado', v_actor)
        on conflict (producto_id) do update set tela_por_prenda = excluded.tela_por_prenda, fuente = 'declarado', actualizado_por = excluded.actualizado_por, updated_at = now();$v$,
  $v$        insert into retail.producto_consumos (producto_id, tela_por_prenda, por_talla, fuente, actualizado_por)
        values (v_producto, (v_i ->> 'consumo_por_prenda')::numeric, nullif(v_i -> 'consumo_por_talla', 'null'::jsonb), 'declarado', v_actor)
        on conflict (producto_id) do update set tela_por_prenda = excluded.tela_por_prenda, por_talla = excluded.por_talla, fuente = 'declarado', actualizado_por = excluded.actualizado_por, updated_at = now();$v$
);
select pg_temp.reemplazar_anclado(
  'retail.abrir_orden_produccion(jsonb, jsonb, jsonb)',
  $v$        insert into retail.producto_consumos (producto_id, tela_por_prenda, fuente, actualizado_por)
        values (v_producto, (v_i ->> 'consumo_por_prenda')::numeric, 'declarado', v_actor)
        on conflict (producto_id) do nothing;$v$,
  $v$        insert into retail.producto_consumos (producto_id, tela_por_prenda, por_talla, fuente, actualizado_por)
        values (v_producto, (v_i ->> 'consumo_por_prenda')::numeric, nullif(v_i -> 'consumo_por_talla', 'null'::jsonb), 'declarado', v_actor)
        on conflict (producto_id) do nothing;$v$
);

-- 3. Editar la tela de una orden abierta: lo guarda, y una fila cuyo consumo por talla cambió se corrige aunque el promedio sea el mismo.
select pg_temp.reemplazar_anclado(
  'retail.guardar_insumos_orden(uuid, jsonb)',
  $v$      insert into retail.produccion_insumos (produccion_id, insumo_id, color_codigo, consumo_por_prenda, cantidad_plan, nota)
      values (p_produccion_id, (v_n ->> 'insumo_id')::uuid, v_n ->> 'color_codigo', (v_n ->> 'consumo_por_prenda')::numeric, (v_n ->> 'cantidad_plan')::numeric, v_n ->> 'nota');$v$,
  $v$      insert into retail.produccion_insumos (produccion_id, insumo_id, color_codigo, consumo_por_prenda, consumo_por_talla, cantidad_plan, nota)
      values (p_produccion_id, (v_n ->> 'insumo_id')::uuid, v_n ->> 'color_codigo', (v_n ->> 'consumo_por_prenda')::numeric, nullif(v_n -> 'consumo_por_talla', 'null'::jsonb), (v_n ->> 'cantidad_plan')::numeric, v_n ->> 'nota');$v$
);
select pg_temp.reemplazar_anclado(
  'retail.guardar_insumos_orden(uuid, jsonb)',
  $v$        insert into retail.producto_consumos (producto_id, tela_por_prenda, fuente, actualizado_por)
        values (v_o.producto_id, (v_n ->> 'consumo_por_prenda')::numeric, 'declarado', v_actor)
        on conflict (producto_id) do nothing;$v$,
  $v$        insert into retail.producto_consumos (producto_id, tela_por_prenda, por_talla, fuente, actualizado_por)
        values (v_o.producto_id, (v_n ->> 'consumo_por_prenda')::numeric, nullif(v_n -> 'consumo_por_talla', 'null'::jsonb), 'declarado', v_actor)
        on conflict (producto_id) do nothing;$v$
);
select pg_temp.reemplazar_anclado(
  'retail.guardar_insumos_orden(uuid, jsonb)',
  $v$    elsif v_fila.consumo_por_prenda <> (v_n ->> 'consumo_por_prenda')::numeric then
      update retail.produccion_insumos set consumo_por_prenda = (v_n ->> 'consumo_por_prenda')::numeric,
        cantidad_plan = (v_n ->> 'cantidad_plan')::numeric, nota = coalesce(v_n ->> 'nota', nota)$v$,
  $v$    elsif v_fila.consumo_por_prenda <> (v_n ->> 'consumo_por_prenda')::numeric
       or (select pi2.consumo_por_talla from retail.produccion_insumos pi2 where pi2.id = v_fila.id) is distinct from nullif(v_n -> 'consumo_por_talla', 'null'::jsonb) then
      update retail.produccion_insumos set consumo_por_prenda = (v_n ->> 'consumo_por_prenda')::numeric,
        consumo_por_talla = nullif(v_n -> 'consumo_por_talla', 'null'::jsonb),
        cantidad_plan = (v_n ->> 'cantidad_plan')::numeric, nota = coalesce(v_n ->> 'nota', nota)$v$
);

-- 4. La orden en una sola lectura devuelve el consumo por talla de cada fila de tela y avío.
select pg_temp.reemplazar_anclado(
  'retail.fn_orden_produccion(uuid)',
  $v$'consumo_por_prenda', pi.consumo_por_prenda, 'cantidad_plan', pi.cantidad_plan,$v$,
  $v$'consumo_por_prenda', pi.consumo_por_prenda, 'consumo_por_talla', pi.consumo_por_talla, 'cantidad_plan', pi.cantidad_plan,$v$
);

reset lock_timeout;
