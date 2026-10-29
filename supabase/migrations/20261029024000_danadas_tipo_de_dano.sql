-- ============================================================================
-- 20261029024000_danadas_tipo_de_dano.sql — CAYLA V2 · ADR-0564, actividad 1 (Felipe, 2026-10-28)
-- Dañadas en tienda: lo que tiene la prenda se elige de una lista corta (mancha, descosido, botón o cierre, rotura, otro).
--
-- EL PROBLEMA PRIMERO. «Reportar dañada» pedía escribir qué tiene la prenda (3 a 200 letras). Con la tienda abierta y una
-- clienta esperando, escribir es lo que se salta: la prenda queda colgada, o se descarta como merma. Y como cada quien lo
-- escribía distinto («descosida», «se rompió la costura», «descosido en la manga»), nadie podía contar cuáles daños se repiten.
--
-- DECISIÓN DE FELIPE (2026-10-28, ADR-0564): el daño se elige de una lista corta y la nota queda como complemento. La nota
-- sigue siendo obligatoria solo cuando el tipo es «Otro».
--
-- QUÉ HACE.
--   1. `prendas_danadas.tipo_dano` (mancha | descosido | boton_cierre | rotura | otro): qué tiene la prenda, ELEGIDO. Null en lo
--      de antes y en lo que no es un reporte de tienda (devolución, cambio, recepción): no tienen tipo, y no se inventa uno.
--   2. `reportar_danada` gana `p_tipo text default null` al final. Una web VIEJA que no lo manda sigue funcionando y se
--      comporta como antes: sin tipo cuenta como «otro», con la nota obligatoria. Con un tipo de la lista la nota es opcional;
--      lo que queda escrito (en `motivo_reporte` y en la nota del traslado) es la nota si la hay y, si no, el nombre del tipo.
--
-- POR QUÉ UNA SOLA FUNCIÓN CON UN PARÁMETRO POR DEFECTO, Y NO DOS. Dos versiones de `reportar_danada` (una de 6 y otra de 7
-- parámetros) harían que una llamada de 6 coincida con las dos y PostgREST conteste «no es única»; con una sola, la web vieja
-- y la nueva llaman a la misma. Por eso se borra la firma de 6 antes de crear la de 7, en la misma transacción.
--
-- ESTADOS QUE DEJAN DE SER POSIBLES:
--   · un tipo de daño fuera de la lista (CHECK + la función lo rechaza antes con `danada_tipo_invalido`);
--   · un reporte con tipo «Otro» y sin nota (la función lo rechaza con `danada_sin_motivo`, como antes).
--
-- CÓMO SE PEGA EN PRODUCCIÓN: UNA sola parte, tal cual en el SQL Editor (trae `retail.` y su `search_path`), ANTES de
-- publicar la web. Si la web sale primero, Existencias sigue en pie (la lectura de Dañadas reintenta sin `tipo_dano` ante un
-- 42703) pero «Reportar dañada» falla al usarse. Sin políticas ni `drop trigger` (ADR-0195 no aplica). El `alter table` toma
-- un candado breve sobre `prendas_danadas` (lock_timeout 3 s: si no lo consigue falla sin daño y se vuelve a pegar). Idempotente.
-- Cómo se verifica después:
--   select pg_get_function_identity_arguments(oid) from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'reportar_danada';
--   (debe devolver UNA fila, con p_tipo text al final)
--
-- SE ROMPE SI:
--   · alguien vuelve a pegar 20261005140000_danadas_reportar_y_se_arreglo.sql: recrea la firma de 6 parámetros al lado de esta y
--     las llamadas de 6 dejan de ser únicas. Si pasa: `drop function retail.reportar_danada(uuid, uuid, integer, text, text, uuid);`;
--   · una prenda reportada en cantidad 3 tiene daños distintos: la fila es una sola y lleva un solo tipo (se reporta por separado
--     lo que se decidirá distinto, como antes).
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- ---------------------------------------------------------------------------
-- 1. El tipo de daño
-- ---------------------------------------------------------------------------
alter table retail.prendas_danadas add column if not exists tipo_dano text;

comment on column retail.prendas_danadas.tipo_dano is
  'ADR-0564: qué tiene la prenda, elegido de una lista corta (mancha, descosido, boton_cierre, rotura, otro) al reportarla desde la tienda (reportar_danada). Null en las dañadas que no vienen de un reporte de tienda (devolución, cambio, recepción) y en las de antes: no se les inventa un tipo.';

alter table retail.prendas_danadas drop constraint if exists prendas_danadas_tipo_dano_valido;
alter table retail.prendas_danadas add constraint prendas_danadas_tipo_dano_valido
  check (tipo_dano is null or tipo_dano in ('mancha', 'descosido', 'boton_cierre', 'rotura', 'otro'));

-- ---------------------------------------------------------------------------
-- 2. reportar_danada con p_tipo (una sola firma: se borra la de 6 parámetros)
-- ---------------------------------------------------------------------------
drop function if exists retail.reportar_danada(uuid, uuid, integer, text, text, uuid);

create or replace function retail.reportar_danada(
  p_ubicacion_id uuid,
  p_variante_id uuid,
  p_cantidad integer,
  p_desde text,
  p_motivo text,
  p_token uuid,
  p_tipo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $fn$
declare
  c_centinela constant uuid := '22222222-2222-4222-8222-222222222222'; -- «Prenda sin registrar» / cargo especial: no es una prenda
  v_nota text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_tipo text := coalesce(nullif(btrim(coalesce(p_tipo, '')), ''), 'otro');
  v_texto text;
  v_origen uuid;
  v_cuarentena uuid;
  v_marca uuid;
  v_mov uuid;
  v_id uuid;
  v_actor uuid;
  v_hay integer;
  v_apartadas integer;
  v_lugar text := case p_desde when 'piso' then 'el piso' when 'almacen' then 'el almacén' end;
begin
  if p_token is null then
    raise exception 'Falta la marca de este intento. Cierra la ventana y vuelve a abrirla.' using hint = 'danada_sin_token';
  end if;
  if not fn_ve_modulo('existencias') then
    raise exception 'No puedes reportar prendas dañadas: tu rol no tiene el módulo «Existencias». Pídele al líder que lo active.'
      using errcode = '42501', hint = 'danada_sin_modulo';
  end if;
  if p_ubicacion_id is null or not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No puedes reportar prendas dañadas en esa tienda: no es tu sede.' using hint = 'danada_sin_tienda';
  end if;
  if v_lugar is null then
    raise exception 'Di dónde estaba la prenda: colgada en el piso o guardada en el almacén.' using hint = 'danada_desde_invalido';
  end if;
  if p_cantidad is null or p_cantidad < 1 or p_cantidad > 999 then
    raise exception 'Reporta al menos 1 prenda.' using hint = 'danada_cantidad_invalida';
  end if;
  if v_tipo not in ('mancha', 'descosido', 'boton_cierre', 'rotura', 'otro') then
    raise exception 'Elige qué tiene la prenda de la lista.' using hint = 'danada_tipo_invalido';
  end if;
  -- Con un tipo de la lista la nota es opcional; con «Otro» (y con una web vieja que no manda tipo) es obligatoria, como siempre.
  if (v_nota is null and v_tipo = 'otro') or (v_nota is not null and char_length(v_nota) < 3) then
    raise exception 'Escribe qué tiene la prenda (al menos 3 letras): así quien decide sabe si se puede arreglar.'
      using hint = 'danada_sin_motivo';
  end if;
  if char_length(v_nota) > 200 then
    raise exception 'Lo que tiene la prenda admite hasta 200 caracteres.' using hint = 'danada_motivo_largo';
  end if;
  -- Lo que queda escrito en la dañada y en el traslado: la nota si la hay; si no, el nombre del tipo.
  v_texto := coalesce(v_nota, case v_tipo when 'mancha' then 'Mancha' when 'descosido' then 'Descosido'
                                          when 'boton_cierre' then 'Botón o cierre' when 'rotura' then 'Rotura' end);
  if p_variante_id is null or p_variante_id = c_centinela then
    raise exception 'Eso no es una prenda del catálogo: no se reporta como dañada.' using hint = 'danada_no_es_prenda';
  end if;
  if not exists (select 1 from variantes v where v.id = p_variante_id) then
    raise exception 'Esa prenda ya no existe en el catálogo. Recarga la pantalla.' using hint = 'danada_no_existe';
  end if;

  v_origen := (select s.id from sububicaciones s
                where s.ubicacion_id = p_ubicacion_id
                  and s.tipo = case p_desde when 'piso' then 'piso_venta' else 'almacen_tienda' end);
  v_cuarentena := (select s.id from sububicaciones s where s.ubicacion_id = p_ubicacion_id and s.tipo = 'cuarentena');
  if v_origen is null or v_cuarentena is null then
    raise exception 'Esta sede no separa piso, almacén y cuarentena: aquí no se reportan prendas dañadas.'
      using hint = 'danada_sede_sin_cuarentena';
  end if;

  -- La marca de este reporte, en su propio espacio de nombres: nunca coincide con la de otra pantalla que use mover_interno.
  -- El candado de la marca es el MISMO que toma mover_interno (se puede tomar dos veces en la transacción): dos reintentos
  -- simultáneos se esperan, y el segundo ve el reporte del primero ya confirmado.
  v_marca := md5('reportar_danada:' || p_token::text)::uuid;
  perform pg_advisory_xact_lock(hashtextextended('mover_interno:' || v_marca::text, 0));

  -- ¿Ya se reportó con esta marca? Antes de pedir responsable y de mirar el stock: comprobar algo ya guardado no escribe
  -- nada, así que responde aunque quien lo hizo ya marcó su salida y aunque el piso ya haya bajado. `mover_interno` vuelve a
  -- comparar los datos con los guardados: con otra cantidad, otro lugar u otro motivo lo rechaza.
  if exists (select 1 from movimientos_internos_intentos i where i.token_cliente = v_marca) then
    v_mov := mover_interno(p_ubicacion_id, p_variante_id, p_cantidad, v_origen, v_cuarentena, v_texto, v_marca);
    v_id := (select pd.id from prendas_danadas pd where pd.movimiento_entrada_id = v_mov);
    return jsonb_build_object('ya_registrada', true, 'id', v_id, 'movimiento_id', v_mov, 'unidades', p_cantidad);
  end if;

  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación.' using hint = 'responsable_requerido';
  end if;

  -- Candado: el stock de esa prenda en la sede, en orden (ADR-0190). Con él tomado, lo libre no cambia hasta el final.
  perform fn_bloquear_en_orden(p_ubicacion_id, array[p_variante_id]);
  v_hay := coalesce((select s.cantidad from stock s
                      where s.variante_id = p_variante_id and s.ubicacion_id = p_ubicacion_id and s.sububicacion_id = v_origen), 0);
  v_apartadas := coalesce((select s.cantidad_apartada from stock s
                            where s.variante_id = p_variante_id and s.ubicacion_id = p_ubicacion_id and s.sububicacion_id = v_origen), 0);
  if v_hay - v_apartadas < p_cantidad then
    raise exception '%',
      'No se reportó nada. ' || coalesce(fn_prenda_corta(p_variante_id), 'Esa prenda') || ': pides ' || p_cantidad
      || ' y en ' || v_lugar || ' hay ' || greatest(v_hay - v_apartadas, 0) || ' libre' || case when greatest(v_hay - v_apartadas, 0) = 1 then '' else 's' end
      || case when v_apartadas = 1 then ' (1 apartada para un cliente: si es la dañada, libera primero el apartado)'
              when v_apartadas > 1 then ' (' || v_apartadas || ' apartadas para clientes: si es una de ellas, libera primero el apartado)'
              else '' end
      || '. Puede que otra persona ya la haya movido: revisa ' || v_lugar || '.'
      using hint = 'danada_sin_alcance',
            detail = jsonb_build_object('variante_id', p_variante_id, 'desde', p_desde, 'pide', p_cantidad,
                                        'hay', greatest(v_hay - v_apartadas, 0), 'apartadas', v_apartadas)::text;
  end if;

  -- El movimiento: un traslado DENTRO de la sede (no es pérdida: la prenda sigue en CAYLA). Su nota es lo que tiene.
  v_mov := mover_interno(p_ubicacion_id, p_variante_id, p_cantidad, v_origen, v_cuarentena, v_texto, v_marca);

  insert into prendas_danadas (variante_id, ubicacion_id, cantidad, movimiento_entrada_id, motivo_reporte, tipo_dano)
    values (p_variante_id, p_ubicacion_id, p_cantidad, v_mov, v_texto, v_tipo)
    returning id into v_id;

  return jsonb_build_object('ya_registrada', false, 'id', v_id, 'movimiento_id', v_mov, 'unidades', p_cantidad);
end;
$fn$;


comment on function retail.reportar_danada(uuid, uuid, integer, text, text, uuid, text) is
  'ADR-0328 act. 10 + ADR-0564: reporta una prenda dañada desde Existencias. Mueve lo LIBRE (sin lo apartado) del piso o del almacén (p_desde) a la cuarentena de la sede con mover_interno (traslado interno: no es pérdida) y abre su fila en prendas_danadas con motivo_reporte y tipo_dano, todo o nada. p_tipo (mancha, descosido, boton_cierre, rotura, otro) es opcional por compatibilidad: sin él cuenta como otro. La nota (p_motivo) es obligatoria solo con otro; si falta, queda escrito el nombre del tipo. p_token obligatorio (una por ventana): el reintento con los mismos datos devuelve ya_registrada sin mover nada. Pide el módulo Existencias y operar la sede; firma el responsable.';

revoke all on function retail.reportar_danada(uuid, uuid, integer, text, text, uuid, text) from public, anon;
grant execute on function retail.reportar_danada(uuid, uuid, integer, text, text, uuid, text) to authenticated;

notify pgrst, 'reload schema';
