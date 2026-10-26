-- Producción · editar la tela y los avíos de una orden que ya está abierta (ADR-0510, actividad 1 de «Tela y avíos de la orden»).
--
-- EL PROBLEMA PRIMERO. La tela y los avíos de una orden (`produccion_insumos`: cuánto lleva cada prenda y cuánto hay que pedir) solo se escriben UNA vez,
-- en `abrir_orden_produccion`. Si la orden se abrió sin declararlos, o con un consumo mal calculado, no hay cómo arreglarlo: la página dice «Esta orden no
-- declaró qué tela ni qué avíos lleva», «Anotar lo que usaste» no ofrece nada que anotar, Corte se cierra sin preguntar por la tela y «Pasar al stock» no
-- avisa. El lote entra al stock con costo sin tela (la OP-343 entró a S/ 4.50 en vez de S/ 22.38), y ese costo alimenta el promedio de la prenda en todas
-- las sedes. La base de insumos SÍ deja descontar tela sin que esté declarada (`registrar_consumo_insumo` no la exige); es la pantalla la que no tenía
-- cómo declararla.
--
-- QUÉ CREA (una sola función de escritura; solo `create or replace`, sin tablas, sin políticas, sin `alter`)
--   `guardar_insumos_orden(p_produccion_id uuid, p_insumos jsonb) → jsonb` (`security definer`; exige el módulo `produccion` y estar parado en ese Taller
--   —`fn_produccion_exigir_operar`— y firma con `fn_actor_persona_id(true)`, ADR-0161/0162). `p_insumos` es la lista COMPLETA de tela y avíos que la orden
--   debe tener desde ahora, con la misma forma que recibe `abrir_orden_produccion`: [{insumo_id, color_codigo, consumo_por_prenda}] (color vacío = toda la
--   orden). Devuelve {agregadas, corregidas, quitadas}.
--
-- CONTRATO
--   PROMETE: al terminar, `produccion_insumos` de esa orden es exactamente la lista que llegó, o NADA cambió (todo en una transacción). La lista se valida
--            con la MISMA función que usa abrir (`fn_produccion_insumos_normalizar`), sobre las líneas reales de la orden: la tela existe y no está archivada,
--            su color es uno que la orden fabrica, el consumo está entre 0 y 9999, la misma tela va una vez por color. El plan se recalcula como siempre:
--            consumo × prendas del color × (1 + merma). Una fila que no cambió de consumo no se toca (su plan, congelado al abrir, no se mueve). Una tela o
--            avío con consumo anotado en esta orden (lo consumido menos lo devuelto > 0) NO se quita: se rechaza con `insumo_con_consumo`; sí se puede corregir
--            su consumo por prenda, o quitar uno de sus colores si le queda otro. Enviar la misma lista dos veces da el mismo resultado y no anota nada nuevo.
--   ASUME:   la orden está en proceso; las líneas (talla y color) de la orden no cambian después de abrirla. El libro de insumos no sabe de colores: el
--            consumo se cuenta por tela, no por fila.
--   NO HACE: no descuenta ni devuelve tela (eso es `registrar_consumo_insumo`), no toca costos ni stock, no pisa el consumo que el modelo ya declaró o midió
--            (`producto_consumos`): solo si el modelo todavía no tiene ninguno, la primera TELA nueva lo deja declarado, igual que al abrir. No hay
--            interruptor «dejar como el del modelo» aquí: ese sigue solo en Nueva orden.
--
-- DESCARTÉ
--   · Tres funciones (agregar, corregir, quitar): son tres puntos donde el plan puede quedar a medias y un doble clic repite la mitad. Una lista completa que
--     reemplaza es declarativa: repetirla no cambia nada.
--   · Dejar editar el plan sin mirar el consumo: se quitaría una tela con metros ya descontados y el costo real de la orden quedaría sin renglón en pantalla.
--   · Pasar `null` o algo que no sea una lista como «sin tela»: un parámetro faltante vaciaría el plan sin que nadie lo pidiera. Vaciarlo se pide con `[]`.
--
-- SE ROMPE SI
--   · Alguien anota «lo que usaste» de una tela en el mismo instante en que otra persona la quita. No pasa: las dos toman `select … for update` de la fila de
--     `producciones` (la misma que toma `registrar_consumo_insumo`) y se forman en fila; la segunda ve lo que dejó la primera.
--   · Una tela de la orden se archiva en Insumos después de abrirla. El validador la rechaza al guardar (`insumo_archivado`): hay que desarchivarla, o
--     quitarla si no tiene consumo. Es a propósito (una tela archivada no se vuelve a elegir) y la pantalla lo dice.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe, después de 154000 y 155000): solo `create or replace function` y permisos; ninguna política ni `alter`.
-- Una sola parte. Idempotente.

set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function retail.guardar_insumos_orden(p_produccion_id uuid, p_insumos jsonb) returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare
  v_ubicacion uuid; v_o record; v_actor uuid; v_lineas jsonb; v_nuevas jsonb; v_n jsonb; v_e record; v_fila record;
  v_usado numeric; v_nombre text; v_referencia text; v_partes text[] := '{}';
  v_agregadas integer := 0; v_corregidas integer := 0; v_quitadas integer := 0;
begin
  -- Una lista que no es lista no es «sin tela»: es un envío roto, y vaciaría el plan.
  if p_insumos is null or jsonb_typeof(p_insumos) <> 'array' then
    raise exception 'Falta la lista de tela y avíos de la orden' using hint = 'insumos_invalidos';
  end if;
  select p.ubicacion_id into v_ubicacion from retail.producciones p where p.id = p_produccion_id;
  if v_ubicacion is null then
    raise exception 'Esa orden no existe' using hint = 'orden_inexistente';
  end if;
  perform retail.fn_produccion_exigir_operar(v_ubicacion);
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién anota esto' using errcode = '42501', hint = 'responsable_requerido';
  end if;

  -- La misma fila que bloquea `registrar_consumo_insumo`: nadie anota consumo de esta orden mientras se decide qué tela lleva, y el estado que se mira es el de ahora.
  select p.id, p.estado, p.producto_id, p.numero into v_o from retail.producciones p where p.id = p_produccion_id for update;
  if v_o.estado <> 'en_proceso' then
    raise exception 'La orden ya no está en proceso' using hint = 'orden_cerrada';
  end if;

  -- Las líneas reales de la orden (talla y color con su plan), para repartir la tela por color como al abrir.
  select coalesce(jsonb_agg(jsonb_build_object('variante_id', l.variante_id, 'cantidad', l.cantidad_plan)), '[]'::jsonb)
    into v_lineas from retail.produccion_lineas l where l.produccion_id = p_produccion_id;
  v_nuevas := retail.fn_produccion_insumos_normalizar(p_insumos, v_lineas, v_o.producto_id);

  -- Lo que se quita: las filas que ya no están en la lista. Una tela con consumo anotado no puede quedarse sin ninguna fila.
  for v_e in select pi.id, pi.insumo_id, pi.color_codigo from retail.produccion_insumos pi where pi.produccion_id = p_produccion_id loop
    if not exists (
      select 1 from jsonb_array_elements(v_nuevas) n
      where (n ->> 'insumo_id')::uuid = v_e.insumo_id and coalesce(n ->> 'color_codigo', '') = coalesce(v_e.color_codigo, '')
    ) then
      if not exists (select 1 from jsonb_array_elements(v_nuevas) n where (n ->> 'insumo_id')::uuid = v_e.insumo_id) then
        select coalesce(sum(case when mi.tipo = 'consumo' then mi.cantidad else -mi.cantidad end), 0) into v_usado
          from retail.movimientos_insumo mi
          where mi.produccion_id = p_produccion_id and mi.insumo_id = v_e.insumo_id and mi.tipo in ('consumo', 'devolucion');
        if v_usado > 0 then
          select i.nombre into v_nombre from retail.insumos i where i.id = v_e.insumo_id;
          raise exception 'No se quita «%»: ya se anotó que se usó en esta orden. Puedes corregir cuánto lleva cada prenda', v_nombre using hint = 'insumo_con_consumo';
        end if;
      end if;
      delete from retail.produccion_insumos where id = v_e.id;
      v_quitadas := v_quitadas + 1;
    end if;
  end loop;

  -- Lo que se agrega y lo que se corrige. Una fila con el mismo consumo no se toca: su plan, congelado al abrir, no se mueve.
  for v_n in select * from jsonb_array_elements(v_nuevas) loop
    select pi.id, pi.consumo_por_prenda into v_fila from retail.produccion_insumos pi
      where pi.produccion_id = p_produccion_id and pi.insumo_id = (v_n ->> 'insumo_id')::uuid and coalesce(pi.color_codigo, '') = coalesce(v_n ->> 'color_codigo', '');
    if v_fila.id is null then
      insert into retail.produccion_insumos (produccion_id, insumo_id, color_codigo, consumo_por_prenda, cantidad_plan, nota)
      values (p_produccion_id, (v_n ->> 'insumo_id')::uuid, v_n ->> 'color_codigo', (v_n ->> 'consumo_por_prenda')::numeric, (v_n ->> 'cantidad_plan')::numeric, v_n ->> 'nota');
      v_agregadas := v_agregadas + 1;
      -- Como al abrir: si el modelo todavía no dice cuánto lleva, la primera tela lo deja declarado. Nunca pisa lo declarado ni lo medido.
      if exists (select 1 from retail.insumos i where i.id = (v_n ->> 'insumo_id')::uuid and i.tipo = 'tela') then
        insert into retail.producto_consumos (producto_id, tela_por_prenda, fuente, actualizado_por)
        values (v_o.producto_id, (v_n ->> 'consumo_por_prenda')::numeric, 'declarado', v_actor)
        on conflict (producto_id) do nothing;
      end if;
    elsif v_fila.consumo_por_prenda <> (v_n ->> 'consumo_por_prenda')::numeric then
      update retail.produccion_insumos set consumo_por_prenda = (v_n ->> 'consumo_por_prenda')::numeric,
        cantidad_plan = (v_n ->> 'cantidad_plan')::numeric, nota = coalesce(v_n ->> 'nota', nota)
      where id = v_fila.id;
      v_corregidas := v_corregidas + 1;
    end if;
  end loop;

  -- Actividad (ADR-0207): sin montos, y solo si algo cambió. Si falla, el cambio igual queda guardado.
  if v_agregadas + v_corregidas + v_quitadas > 0 then
    begin
      select p.referencia into v_referencia from retail.productos p where p.id = v_o.producto_id;
      if v_agregadas > 0 then v_partes := v_partes || ('agregó ' || v_agregadas); end if;
      if v_corregidas > 0 then v_partes := v_partes || ('corrigió ' || v_corregidas); end if;
      if v_quitadas > 0 then v_partes := v_partes || ('quitó ' || v_quitadas); end if;
      perform retail.fn_actividad_anotar(
        'produccion', 'orden_produccion_tela_editada',
        'editó la tela y los avíos de la ' || retail.fn_produccion_numero_texto(v_o.numero) || ' de ' || coalesce(v_referencia, 'un modelo') || ': ' || array_to_string(v_partes, ', '),
        v_actor, retail.fn_actividad_terminal_ahora(), v_ubicacion, v_ubicacion,
        'produccion', p_produccion_id::text, now(),
        jsonb_build_object('produccion_id', p_produccion_id, 'numero', v_o.numero, 'agregadas', v_agregadas, 'corregidas', v_corregidas, 'quitadas', v_quitadas),
        'vivo');
    exception when others then
      raise warning 'actividad: no se anotó la edición de tela de la orden % (%)', v_o.numero, sqlerrm;
    end;
  end if;

  return jsonb_build_object('agregadas', v_agregadas, 'corregidas', v_corregidas, 'quitadas', v_quitadas);
end;
$$;

comment on function retail.guardar_insumos_orden(uuid, jsonb) is
  'Reemplaza la tela y los avíos declarados de una orden en proceso con la lista que llega (ADR-0510). Valida con fn_produccion_insumos_normalizar; no quita lo que ya tiene consumo anotado; devuelve {agregadas, corregidas, quitadas}.';

revoke all on function retail.guardar_insumos_orden(uuid, jsonb) from public, anon;
grant execute on function retail.guardar_insumos_orden(uuid, jsonb) to authenticated, service_role;

reset lock_timeout;
