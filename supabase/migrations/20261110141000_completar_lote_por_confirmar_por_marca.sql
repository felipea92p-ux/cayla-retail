-- ============================================================================
-- 20261110141000_completar_lote_por_confirmar_por_marca.sql — CAYLA V2 · ADR-0393 (act. 2026-11-10)
-- Recibir sin aviso: cada marca se lleva SUS prendas del lote «Por confirmar» a su proveedor real, aunque ese lote sea compartido.
--
-- EL PROBLEMA PRIMERO. En el envío ENV-000007 (Trujillo, 2026-11-07) salieron al stock antes de cerrar 15 shorts de Jirish y 12 faldas de Blues
-- Company, las dos sin proveedor: cayeron en el MISMO lote «Por confirmar» (uno por envío: `lotes_despacho_proveedor_unico`). Jirish es de Textil
-- Anqori y Blues Company de otro proveedor. `poner_proveedor_de_marca` solo sabía cambiarle el proveedor al lote ENTERO, así que se negaba
-- («comparte lote con otras prendas: ponles el mismo proveedor») y el envío no se podía cerrar sin mentir. Lo mismo pasaba si el proveedor real
-- ya tenía su propio lote en el envío.
--
-- QUÉ CAMBIA (solo `poner_proveedor_de_marca`)
--   · Si el lote «Por confirmar» es entero de esta marca y el proveedor real no tiene lote en el envío: igual que antes, el lote pasa al real.
--   · Si no: las entradas de ESTA marca (`despacho_recibidos.movimiento_id` y `movimiento_danada_id`) pasan al lote del proveedor real del envío
--     (se crea copiando el de «Por confirmar» si no existe), y lo recibido de esta marca toma su proveedor. Lo de las otras marcas no se toca.
--   · Queda en la Actividad con el lote de antes, el de ahora y cuántos movimientos pasaron.
--
-- EL CANDADO DE MOVIMIENTOS (decisión de Felipe, 2026-11-10: «Completar el provisional»). `movimientos` no se edita: el disparador
-- `movimientos_inmutables` no aprende ninguna excepción. Igual que al eliminar un producto con historia (20260928230000), el dueño de la tabla lo apaga
-- SOLO dentro de esta transacción, cambia una sola columna (`lote_id`, de «Por confirmar» a su proveedor real del MISMO envío y la MISMA sede) y lo
-- vuelve a su modo; si algo falla, todo vuelve atrás solo. Cantidad, variante, sede, fecha, quién y motivo quedan igual: el stock no se mueve. No es
-- corregir la historia: es completar un dato que nació provisional a propósito («se pone antes de cerrar»).
--
-- CONCURRENCIA. Apagar el disparador toma `movimientos` en SHARE ROW EXCLUSIVE: una venta que llega en ese instante espera milisegundos. Si la tienda
-- está escribiendo justo ahora, se espera como máximo 3 s y se avisa «vuelve a intentar» sin tocar nada.
--
-- DESCARTÉ
--   · Movimientos de corrección (salida del lote provisional y entrada al real): el historial no se toca, pero cada prenda suma dos líneas y todo
--     reporte que cuenta lo que llegó (Recibir, Frescura, Análisis, costo) la vería dos veces. Felipe eligió completar el provisional.
--   · Una excepción escrita dentro de `fn_historial_es_inmutable`: abriría una segunda puerta permanente en el candado.
--   · Un lote «Por confirmar» por marca: no arregla lo que ya está en producción, y cambia el candado único de lotes.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). UNA parte, idempotente, sin políticas ni `drop trigger` (ADR-0195). Se niega si la función viva
-- ya no es la de 20261107192000.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

do $g$
declare
  v_def text := pg_get_functiondef('retail.poner_proveedor_de_marca(uuid,uuid,uuid)'::regprocedure);
begin
  if position('ADR-0393 (act. 2026-11-10)' in v_def) = 0
     and position('Solo pasa al real si ese lote es entero de esta marca' in v_def) = 0 then
    raise exception 'retail.poner_proveedor_de_marca cambió desde 20261107192000: regenera esta migración desde su definición viva.';
  end if;
end;
$g$;

create or replace function retail.poner_proveedor_de_marca(p_despacho_id uuid, p_marca_id uuid, p_proveedor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_actor uuid;
  v_despacho retail.despachos;
  v_nombre text;
  v_marca text;
  v_pc uuid;
  v_lote_pc uuid;
  v_lote_real uuid;
  v_lineas integer;
  v_recibidos uuid[] := '{}';
  v_movs uuid[] := '{}';
  v_modo "char";
  v_pasaron integer := 0;
  v_detalle jsonb;
begin
  if retail.fn_ve_modulo('recibir') is not true then
    raise exception 'Recibir mercadería necesita el módulo «Recibir mercadería» en tu rol' using errcode = '42501', hint = 'recibir_sin_modulo';
  end if;
  -- El envío en exclusiva, como poner_proveedor_envio: guardar_conteo_envio lo toma compartido.
  select d.* into v_despacho from retail.despachos d where d.id = p_despacho_id for update;
  if not found then
    raise exception 'Ese envío no existe' using hint = 'envio_no_existe';
  end if;
  if not exists (select 1 from retail.despachos_sin_aviso s where s.despacho_id = p_despacho_id) then
    raise exception 'Este envío vino de Compras: su proveedor es el de sus órdenes' using hint = 'envio_no_es_sin_aviso';
  end if;
  if v_despacho.estado <> 'abierto' then
    raise exception 'Este envío ya no se está contando: recarga la pantalla' using hint = 'envio_no_abierto';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  perform retail.fn_recepcion_exigir(v_despacho.id, v_despacho.ubicacion_destino_id, v_actor);
  v_nombre := (select pr.nombre from retail.proveedores pr where pr.id = p_proveedor_id and pr.activo and not coalesce(pr.por_confirmar, false));
  if v_nombre is null then
    raise exception 'Elige de quién llegó: un proveedor activo' using hint = 'recepcion_proveedor';
  end if;
  v_marca := coalesce((select m.nombre from retail.marcas m where m.id = p_marca_id), 'lo sin marca');
  v_lineas := (select count(*) from retail.despacho_conteos k
                where k.despacho_id = p_despacho_id and k.despacho_item_id is null and k.marca_id is not distinct from p_marca_id);
  if v_lineas = 0 then
    raise exception 'En este envío no hay nada contado de %: recarga la pantalla', v_marca using hint = 'proveedor_sin_lineas';
  end if;

  -- ADR-0393 (act. 2026-11-10): lo que ya salió al stock sin proveedor está en el lote «Por confirmar». Lo de ESTA marca pasa a su proveedor real.
  v_pc := (select p.id from retail.proveedores p where p.por_confirmar);
  v_lote_pc := (select l.id from retail.lotes l where l.despacho_id = p_despacho_id and l.proveedor_id = v_pc);
  if v_lote_pc is not null then
    v_recibidos := coalesce((
      select array_agg(r.id)
        from retail.despacho_recibidos r
        join retail.despacho_conteos k on k.despacho_id = r.despacho_id and k.extra_posicion = r.extra_posicion
       where r.despacho_id = p_despacho_id and r.proveedor_id = v_pc and k.marca_id is not distinct from p_marca_id), '{}');
  end if;

  if cardinality(v_recibidos) > 0 then
    v_lote_real := (select l.id from retail.lotes l where l.despacho_id = p_despacho_id and l.proveedor_id = p_proveedor_id);
    if v_lote_real is null and not exists (
      select 1 from retail.despacho_recibidos r
       where r.despacho_id = p_despacho_id and r.proveedor_id = v_pc and not (r.id = any (v_recibidos))
    ) then
      -- El lote es entero de esta marca: pasa entero al proveedor real (como hasta hoy).
      perform set_config('retail.corrige_proveedor', 'si', true);
      update retail.despacho_recibidos r set proveedor_id = p_proveedor_id where r.id = any (v_recibidos);
      update retail.lotes l set proveedor_id = p_proveedor_id where l.id = v_lote_pc;
      perform set_config('retail.corrige_proveedor', '', true);
      v_detalle := jsonb_build_object('lote', v_lote_pc, 'lote_entero', true);
    else
      -- El lote es compartido (o el real ya tiene el suyo): las entradas de esta marca se llevan al lote del proveedor real del envío.
      if v_lote_real is null then
        insert into retail.lotes (ubicacion_id, proveedor_id, numero_guia, fecha_recepcion, recibido_por, nota, despacho_id)
        select l.ubicacion_id, p_proveedor_id, l.numero_guia, l.fecha_recepcion, l.recibido_por, l.nota, l.despacho_id
          from retail.lotes l where l.id = v_lote_pc
        returning id into v_lote_real;
      end if;
      v_movs := coalesce((
        select array_agg(x.id)
          from retail.despacho_recibidos r
          cross join lateral (values (r.movimiento_id), (r.movimiento_danada_id)) x(id)
         where r.id = any (v_recibidos) and x.id is not null), '{}');

      perform set_config('lock_timeout', '3s', true);
      begin
        lock table retail.movimientos in share row exclusive mode;
        -- El candado se apaga SOLO dentro de esta transacción y vuelve a su modo (ALWAYS); si algo falla, vuelve solo.
        v_modo := (select t.tgenabled from pg_trigger t where t.tgrelid = 'retail.movimientos'::regclass and t.tgname = 'movimientos_inmutables');
        if v_modo is null then
          raise exception 'Falta el candado de historial movimientos_inmutables: no se cambia nada hasta revisar la base.';
        end if;
        alter table retail.movimientos disable trigger movimientos_inmutables;
        update retail.movimientos m set lote_id = v_lote_real
         where m.id = any (v_movs) and m.lote_id = v_lote_pc and m.ubicacion_id = v_despacho.ubicacion_destino_id;
        get diagnostics v_pasaron = row_count;
        execute format('alter table retail.movimientos enable %s trigger movimientos_inmutables',
                       case v_modo when 'A' then 'always' when 'R' then 'replica' else '' end);
        if v_modo = 'D' then
          alter table retail.movimientos disable trigger movimientos_inmutables;
        end if;
        if (select t.tgenabled from pg_trigger t where t.tgrelid = 'retail.movimientos'::regclass and t.tgname = 'movimientos_inmutables')
           is distinct from v_modo then
          raise exception 'El candado movimientos_inmutables no volvió a su modo: no se guarda nada.';
        end if;
      exception when lock_not_available or deadlock_detected then
        raise exception 'En este momento la tienda está registrando un movimiento. Vuelve a intentar en unos segundos.'
          using hint = 'proveedor_ocupado';
      end;

      perform set_config('retail.corrige_proveedor', 'si', true);
      update retail.despacho_recibidos r set proveedor_id = p_proveedor_id where r.id = any (v_recibidos);
      perform set_config('retail.corrige_proveedor', '', true);
      v_detalle := jsonb_build_object('lote_antes', v_lote_pc, 'lote', v_lote_real, 'movimientos', v_pasaron);
    end if;
  end if;

  update retail.despacho_conteos k set proveedor_id = p_proveedor_id
   where k.despacho_id = p_despacho_id and k.despacho_item_id is null and k.marca_id is not distinct from p_marca_id
     and k.proveedor_id is distinct from p_proveedor_id;
  -- La próxima vez se sabe solo: ese proveedor trae esa marca [provisional, como al crear una prenda al recibir].
  if p_marca_id is not null then
    insert into retail.marca_proveedores (marca_id, proveedor_id) values (p_marca_id, p_proveedor_id) on conflict do nothing;
  end if;

  begin
    perform retail.fn_actividad_anotar(
      'recibir', 'despacho_sin_aviso_proveedor_de_marca',
      'puso de quién llegó ' || v_marca || ' en ' || retail.fn_envio_numero_texto(v_despacho.numero) || ': ' || v_nombre,
      v_actor, retail.fn_actividad_terminal_ahora(), v_despacho.ubicacion_destino_id, null,
      'despachos', p_despacho_id::text, now(),
      jsonb_build_object('despacho_id', p_despacho_id, 'marca_id', p_marca_id, 'proveedor_id', p_proveedor_id) || coalesce(v_detalle, '{}'),
      'vivo');
  exception when others then
    raise warning 'actividad: no se anotó el proveedor de % en el envío % (%)', v_marca, v_despacho.numero, sqlerrm;
  end;

  return jsonb_build_object('despacho_id', p_despacho_id, 'marca_id', p_marca_id, 'proveedor', jsonb_build_object('id', p_proveedor_id, 'nombre', v_nombre),
                            'lineas', v_lineas);
end;
$$;

comment on function retail.poner_proveedor_de_marca(uuid, uuid, uuid) is
  'ADR-0393 (act. 2026-11-10): el proveedor de todo lo de una marca en un envío sin aviso abierto. Lo que ya salió al stock en el lote «Por confirmar» pasa a su proveedor real, aunque ese lote sea compartido con otras marcas.';

reset lock_timeout;
