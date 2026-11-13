-- ============================================================================
-- 20261105233000_anular_con_tela_cortada.sql — CAYLA V2 (Felipe, 2026-10-16, P-05; ADR-0614, actividad 10)
-- Anular una orden con la tela ya cortada pregunta qué se hace con lo cortado
--
-- EL PROBLEMA PRIMERO. `anular_produccion` devolvía al estante toda la tela usada, a su lote y a su costo, aunque ya estuviera cortada. Una tela cortada no vuelve a ser un rollo: el
-- estante decía tener metros que no existen y el costo de lo perdido desaparecía sin que nadie lo viera. Felipe (P-05): «preguntar qué se hace» (usarla en otra orden, liquidar o botar, con motivo).
--
-- LA DECISIÓN. Una orden con prendas ya cortadas y tela usada no se anula por la puerta de siempre (`anular_con_tela_cortada`): se usa `anular_orden_con_tela_cortada`, que pide el destino y el motivo.
--   · `otra_orden`: la tela pasa a otra orden abierta del mismo Taller: sale de esta como devolución y entra a la otra como consumo, del mismo lote y al mismo costo. Si la otra no la tenía
--     declarada, se declara como complemento, para que no cuente en lo medido del modelo.
--   · `liquidar` o `botar`: la tela no vuelve. Queda como consumo de la orden anulada, con su costo a la vista. No hay tabla de retazos: el destino queda escrito en la nota y en Actividad.
-- Los avíos vuelven al estante en los tres casos: un botón sin coser sigue siendo un botón.
--
-- CONTRATO (Liskov)
--   PROMETE: la orden queda anulada con su nota, y el libro de insumos dice lo que pasó. Todo o nada.
--   ASUME:   quien llama opera el Taller; el responsable del combo firma, como en toda anulación.
--   FALLA:   `anular_con_tela_cortada` (por la puerta de siempre), `destino_invalido`, `anular_sin_motivo`, `sin_tela_cortada`, `orden_destino_invalida`, y los rechazos de `anular_produccion`.
--   NO HACE: no toca el stock de prendas ni el costo de una prenda. No cubre una orden sin tela anotada: esa se anula por la puerta de siempre.
--
-- PRODUCCIÓN. Una sola parte, re-ejecutable. Solo funciones: ADR-0195 no aplica. Pegar ANTES de publicar la web. Con la web vieja, anular una orden con tela cortada daría un error con su motivo,
-- y por eso conviene publicar enseguida.
--
-- VERIFICACIÓN: select to_regproc('retail.anular_orden_con_tela_cortada') is not null, position('anular_con_tela_cortada' in pg_get_functiondef('retail.anular_produccion'::regproc)) > 0;  → t | t
-- CÓMO SE DESHACE: los dos reemplazos al revés y `drop function retail.anular_orden_con_tela_cortada(uuid, text, text, uuid)`.
-- ============================================================================

set lock_timeout = '3s';

create or replace function retail.fn_orden_tiene_tela_cortada(p_produccion_id uuid)
returns boolean
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  -- Tela usada y prendas en la primera fase que cuenta: hay algo cortado.
  select exists (
      select 1 from retail.movimientos_insumo mi join retail.insumos i on i.id = mi.insumo_id
       where mi.produccion_id = p_produccion_id and mi.tipo in ('consumo', 'devolucion') and i.tipo = 'tela'
       group by mi.insumo_id, mi.insumo_lote_id
      having sum(case when mi.tipo = 'consumo' then mi.cantidad else -mi.cantidad end) > 0)
    and exists (
      select 1 from jsonb_array_elements(coalesce(retail.fn_fases_de_orden(p_produccion_id), '[]'::jsonb)) f
       where coalesce((f ->> 'hechas')::numeric, 0) > 0 or coalesce((f ->> 'salieron')::numeric, 0) > 0);
$$;

revoke all on function retail.fn_orden_tiene_tela_cortada(uuid) from public, anon, authenticated;

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

-- La puerta de siempre frena si hay tela cortada, salvo que venga de la función que ya preguntó.
select pg_temp.reemplazar_anclado(
  'retail.anular_produccion(uuid,text)',
  $v$  v_persona := retail.fn_actor_persona_id(true);

  -- Cada (insumo, lote) con neto > 0 vuelve entero, al costo con que salió.$v$,
  $n$  if coalesce(current_setting('retail.anular_tela_decidida', true), '') <> 'on' and retail.fn_orden_tiene_tela_cortada(p_produccion_id) then
    raise exception 'Esta orden ya tiene tela cortada: di qué se hace con ella.' using hint = 'anular_con_tela_cortada';
  end if;

  v_persona := retail.fn_actor_persona_id(true);

  -- Cada (insumo, lote) con neto > 0 vuelve entero, al costo con que salió.$n$
);
-- Con el destino decidido, la tela cortada no vuelve al estante. Los avíos, sí.
select pg_temp.reemplazar_anclado(
  'retail.anular_produccion(uuid,text)',
  $v$where mi.produccion_id = p_produccion_id and mi.tipo in ('consumo', 'devolucion')
    group by mi.insumo_id, mi.insumo_lote_id, mi.costo_unitario$v$,
  $n$where mi.produccion_id = p_produccion_id and mi.tipo in ('consumo', 'devolucion')
      and not (coalesce(current_setting('retail.anular_tela_decidida', true), '') = 'on'
               and (select i.tipo from insumos i where i.id = mi.insumo_id) = 'tela')
    group by mi.insumo_id, mi.insumo_lote_id, mi.costo_unitario$n$
);

create or replace function retail.anular_orden_con_tela_cortada(p_produccion_id uuid, p_motivo text, p_destino text, p_orden_destino uuid default null)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_orden retail.producciones%rowtype;
  v_destino retail.producciones%rowtype;
  v_persona uuid;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_t record;
  v_texto text;
begin
  select * into v_orden from retail.producciones where id = p_produccion_id for update;
  if not found then raise exception 'La orden no existe'; end if;
  if not retail.fn_puede_operar_ubicacion(v_orden.ubicacion_id) then
    raise exception 'No tienes permiso sobre las órdenes de ese Taller' using errcode = '42501';
  end if;
  if p_destino not in ('otra_orden', 'liquidar', 'botar') then
    raise exception 'Di qué se hace con lo cortado.' using hint = 'destino_invalido';
  end if;
  if v_motivo is null then
    raise exception 'Escribe por qué se anula.' using hint = 'anular_sin_motivo';
  end if;
  if not retail.fn_orden_tiene_tela_cortada(p_produccion_id) then
    raise exception 'Esta orden no tiene tela cortada: anúlala como siempre.' using hint = 'sin_tela_cortada';
  end if;

  if p_destino = 'otra_orden' then
    select * into v_destino from retail.producciones d where d.id = p_orden_destino for update;
    if not found or v_destino.id = v_orden.id or v_destino.estado <> 'en_proceso' or v_destino.ubicacion_id <> v_orden.ubicacion_id then
      raise exception 'Elige otra orden abierta del mismo Taller.' using hint = 'orden_destino_invalida';
    end if;
    v_persona := retail.fn_actor_persona_id(true);
    for v_t in
      select mi.insumo_id, mi.insumo_lote_id, mi.costo_unitario,
             sum(case when mi.tipo = 'consumo' then mi.cantidad else -mi.cantidad end) as neto
        from retail.movimientos_insumo mi join retail.insumos i on i.id = mi.insumo_id
       where mi.produccion_id = p_produccion_id and mi.tipo in ('consumo', 'devolucion') and i.tipo = 'tela'
       group by mi.insumo_id, mi.insumo_lote_id, mi.costo_unitario
      having sum(case when mi.tipo = 'consumo' then mi.cantidad else -mi.cantidad end) > 0
    loop
      insert into retail.movimientos_insumo (insumo_id, insumo_lote_id, ubicacion_id, tipo, cantidad, costo_unitario, produccion_id, usuario_id, motivo, nota)
      values (v_t.insumo_id, v_t.insumo_lote_id, v_orden.ubicacion_id, 'devolucion', v_t.neto, v_t.costo_unitario, p_produccion_id, v_persona, 'anulacion_orden',
              'Pasa a la ' || retail.fn_produccion_numero_texto(v_destino.numero));
      insert into retail.movimientos_insumo (insumo_id, insumo_lote_id, ubicacion_id, tipo, cantidad, costo_unitario, produccion_id, usuario_id, nota)
      values (v_t.insumo_id, v_t.insumo_lote_id, v_orden.ubicacion_id, 'consumo', v_t.neto, v_t.costo_unitario, v_destino.id, v_persona,
              'Viene de la ' || retail.fn_produccion_numero_texto(v_orden.numero) || ', anulada');
      if not exists (select 1 from retail.produccion_insumos p where p.produccion_id = v_destino.id and p.insumo_id = v_t.insumo_id) then
        insert into retail.produccion_insumos (produccion_id, insumo_id, consumo_por_prenda, cantidad_plan, es_complemento, nota)
        values (v_destino.id, v_t.insumo_id, greatest(round(v_t.neto / nullif(v_destino.cantidad_plan, 0), 3), 0.001), v_t.neto, true,
                'Viene de la ' || retail.fn_produccion_numero_texto(v_orden.numero));
      end if;
    end loop;
    perform retail.fn_recalcular_costo_insumos_produccion(v_destino.id);
    v_texto := 'La tela pasó a la ' || retail.fn_produccion_numero_texto(v_destino.numero);
  elsif p_destino = 'liquidar' then
    v_texto := 'Lo cortado se liquida';
  else
    v_texto := 'Lo cortado se bota';
  end if;

  perform set_config('retail.anular_tela_decidida', 'on', true);
  perform retail.anular_produccion(p_produccion_id, v_texto || ': ' || v_motivo);
  perform set_config('retail.anular_tela_decidida', 'off', true);
end;
$$;

revoke all on function retail.anular_orden_con_tela_cortada(uuid, text, text, uuid) from public, anon;
grant execute on function retail.anular_orden_con_tela_cortada(uuid, text, text, uuid) to authenticated;

reset lock_timeout;
