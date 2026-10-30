-- ============================================================================
-- 20261030151000_produccion_cambiar_tipo_de_la_orden.sql — CAYLA V2 (ADR-0581 · 2026-10-30)
--
-- EL PROBLEMA PRIMERO.
--   El 2026-10-27 el Taller abrió tres órdenes de 16, 54 y 69 prendas (OP-000002, 003 y 004) con «Crear un modelo nuevo». Ahí el formulario arranca en «Muestra» (ADR-0396: un modelo nuevo
--   se desarrolla antes de fabricarlo), nadie movió el interruptor, y la base guardó `es_muestra = true`. Eran lotes. Una muestra, al cerrarse, NO entra al stock y no toca el costo de la
--   prenda (`cerrar_produccion`), y las demás lecturas (el «pedido en camino» de Análisis, «Al stock este mes») tampoco la cuentan: 139 prendas de producción real habrían salido
--   como «Muestra terminada» sin entrar a ningún estante.
--   Y no había salida: NINGUNA función de la base cambia `es_muestra` después de abrir la orden. Un clic mal puesto era para siempre, salvo con SQL a mano. Eso no es un error de quien
--   abrió la orden: es un estado que el sistema deja crear y no deja corregir (principio 2).
--
-- QUÉ HACE.
--   · `cambiar_tipo_orden_produccion(orden, es_muestra, motivo?)`: pasa una orden ABIERTA de muestra a lote de producción, o al revés. Queda en la historia de la orden
--     (`produccion_cambios`, acción «tipo», con el antes y el después) y en la Actividad. Quien puede operar la orden (módulo Producción en ese Taller) la usa, como «Anular»: no es
--     solo del líder, porque lo que protege es lo que el Taller ya sabe de su propia orden. El motivo es opcional (corregir un clic no pide explicación) y, si no se escribe, la historia
--     dice igual qué cambió.
--   · De muestra a lote exige el precio a tienda de cada talla y color de la orden (la misma regla de «Crear un modelo nuevo»: «una producción necesita el precio; una muestra no»), salvo
--     las categorías de empaque, donde el precio 0 vale (ADR-0384). Sin eso, el lote cerraría y entraría al stock sin poder venderse.
--
-- CONTRATO (Liskov)
--   PROMETE: solo cambia el tipo de una orden en proceso; que el cambio y su rastro se escriben juntos o ninguno; que pedir el tipo que la orden ya tiene no hace nada ni falla (doble
--            clic, dos personas a la vez); que un lote nunca nace de aquí sin precio de venta; y que no toca prendas, stock, costos ni tela.
--   ASUME:   `producciones.es_muestra` solo se lee al cerrar la orden, en las lecturas de Análisis y de la lista y en el candado de la tela (se revisó en producción con `pg_proc`:
--            `cerrar_produccion`, `fn_produccion_exigir_tela`, `fn_analisis_pedido_en_camino`, `fn_origen_producto`, `fn_ordenes_produccion_lista`, `fn_orden_produccion`): ninguna
--            guarda una copia, así que cambiar el campo basta.
--   NO HACE: no cambia el tipo de una orden ya cerrada o anulada (una muestra cerrada no entró al stock: eso se resuelve con «Revertir el cierre», no con este botón); no cambia el
--            precio de nada; no pide la tela de la orden (el candado de «Pasar al stock» la pide al cerrar, como a cualquier lote).
--
-- DECIDÍ: una función propia con su acción «tipo» en la historia de la orden, como `permitir_pasar_sin_tela` hizo con «sin_tela».
-- DESCARTÉ: (a) dejar que el cambio entre como una «nota» de la historia: una nota es texto libre y no se puede consultar «qué órdenes cambiaron de tipo y de cuál a cuál»; (b) dejarlo
--   solo para el líder: el error nace en el Taller, y esperar a un líder para corregir un clic repite el problema (la orden queda mal mientras tanto); (c) un `update` suelto por orden
--   desde el SQL Editor: sin rastro en la orden y sin salida para la próxima.
-- SE ROMPE SI: dos personas piden tipos opuestos de la misma orden en el mismo segundo (gana el último, y los dos quedan en la historia); o una rama nueva agrega otra acción a
--   `produccion_cambios` y vuelve a escribir el CHECK sin la «tipo» (la prueba `pnpm pruebas:produccion-cambiar-tipo` lo detecta). Y una advertencia de orden: NO volver a pegar
--   20261029190000 (ni 20261029173000) DESPUÉS de esta cuando ya exista algún cambio «tipo» en la historia de una orden: sus CHECK no conocen «tipo» y Postgres no deja agregar un CHECK
--   que una fila viola. Falla en voz alta (`23514`, todo se deshace) y no pierde nada, pero no avanza; se resuelve volviendo a pegar ESTA. (Las pruebas de esas dos corren con ROLLBACK
--   sobre una base sin cambios «tipo» confirmados: en el CI no pasa; pasó en una base privada con filas confirmadas de las pruebas de concurrencia.)
--
-- PRODUCCIÓN. NO está aplicada. Una sola parte, re-ejecutable, `lock_timeout = 3s`: dos cambios de CHECK sobre `produccion_cambios` (tabla que la tienda no usa) y una función nueva.
-- Sin `drop trigger`, sin políticas, sin `select … into` dentro de ningún texto entre comillas (ADR-0195, ADR-0288). Va DESPUÉS de 20261029190000 (su CHECK ya trae «sin_tela»).
-- Mientras la web publicada sea la vieja, no pasa nada: ninguna pantalla vieja llama a esta función. Prueba: `pnpm pruebas:produccion-cambiar-tipo`.
-- ============================================================================
set lock_timeout = '3s';

-- 1. La historia de la orden guarda también el cambio de tipo, con su antes y su después (las columnas `antes` y `despues` ya existen para los «Terminé» corregidos).
alter table retail.produccion_cambios drop constraint if exists produccion_cambios_accion_check;
alter table retail.produccion_cambios add constraint produccion_cambios_accion_check check (accion in ('corregir', 'eliminar', 'restaurar', 'nota', 'sin_tela', 'tipo'));
alter table retail.produccion_cambios drop constraint if exists produccion_cambios_forma;
alter table retail.produccion_cambios add constraint produccion_cambios_forma check (case accion
  when 'nota' then objeto is null and fase_id is null and cardinality(quita_ids) = 0 and cardinality(pone_ids) = 0 and restaura_id is null
  when 'sin_tela' then objeto is null and fase_id is null and cardinality(quita_ids) = 0 and cardinality(pone_ids) = 0 and restaura_id is null
  -- Un cambio de tipo no toca filas de una fase: dice de qué tipo a cuál (`es_muestra` antes y después, distintos) y nada más. El `coalesce` es a propósito: un CHECK deja pasar un NULL,
  -- y un cambio sin su antes o su después tiene que ser imposible, no «desconocido».
  when 'tipo' then objeto is null and fase_id is null and cardinality(quita_ids) = 0 and cardinality(pone_ids) = 0 and restaura_id is null
                   and coalesce((antes ->> 'es_muestra') in ('true', 'false') and (despues ->> 'es_muestra') in ('true', 'false') and (antes ->> 'es_muestra') <> (despues ->> 'es_muestra'), false)
  when 'eliminar' then objeto is not null and fase_id is not null and cardinality(quita_ids) > 0 and cardinality(pone_ids) = 0 and restaura_id is null
  when 'corregir' then objeto = 'termine' and fase_id is not null and cardinality(quita_ids) > 0 and cardinality(pone_ids) > 0 and restaura_id is null
  when 'restaurar' then objeto is not null and fase_id is not null and cardinality(quita_ids) = 0 and cardinality(pone_ids) > 0 and restaura_id is not null
  else false end);

-- 2. Pasar una orden abierta de muestra a lote, o de lote a muestra.
create or replace function retail.cambiar_tipo_orden_produccion(p_produccion_id uuid, p_es_muestra boolean, p_motivo text default null)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare v_o record; v_actor uuid; v_motivo text; v_texto text; v_id uuid; v_referencia text; v_sin_precio text;
begin
  if p_es_muestra is null then
    raise exception 'Elige si es una muestra o un lote de producción' using hint = 'tipo_invalido';
  end if;
  -- El candado de la orden: si alguien la está cerrando en este instante, esperamos y miramos su estado ya cerrado.
  select p.id, p.ubicacion_id, p.estado, p.numero, p.es_muestra, p.producto_id into v_o from retail.producciones p where p.id = p_produccion_id for update;
  if v_o.id is null then
    raise exception 'Esa orden no existe' using hint = 'orden_inexistente';
  end if;
  perform retail.fn_produccion_exigir_operar(v_o.ubicacion_id);
  if v_o.estado <> 'en_proceso' then
    raise exception 'La orden ya no está en proceso: el tipo se cambia mientras sigue abierta' using hint = 'orden_cerrada';
  end if;
  -- Ya es lo que se pide: no hay nada que cambiar ni que escribir (un doble clic, o dos personas con la misma idea).
  if v_o.es_muestra = p_es_muestra then
    return jsonb_build_object('cambio', false);
  end if;
  v_motivo := nullif(btrim(coalesce(p_motivo, '')), '');
  if v_motivo is not null and length(v_motivo) > 300 then
    raise exception 'El motivo es muy largo: hasta 300 letras' using hint = 'cambio_motivo_largo';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién lo cambia' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  -- De muestra a lote: cada talla y color de la orden tiene que tener precio a tienda (salvo el empaque, donde el precio 0 vale). Una muestra sí puede ir sin precio.
  -- La talla se nombra por su `codigo`, como en el resto de la base: en producción casi ninguna tiene `sku` (el 2026-10-30, 1 de 3162). Con `sku` la lista de las que faltan
  -- salía vacía, y una lista vacía es «no falta ninguna»: el control nunca saltaba. El «sin código» es para que una talla sin ninguno de los dos también cuente.
  if not p_es_muestra then
    select string_agg(x.codigo, ', ' order by x.codigo) into v_sin_precio
      from (select coalesce(v.codigo, v.sku, 'sin código') as codigo
              from retail.produccion_lineas l
              join retail.variantes v on v.id = l.variante_id
              join retail.productos pr on pr.id = v.producto_id
             where l.produccion_id = p_produccion_id
               and coalesce(v.precio, 0) < 0.01
               and not retail.fn_categoria_admite_precio_cero(pr.categoria_id)
             order by 1
             limit 6) x;
    if v_sin_precio is not null then
      raise exception 'Un lote de producción necesita el precio a tienda: sin precio no hay margen que calcular ni se puede vender. Falta en: %. Ponlo en el catálogo y vuelve a intentar; una muestra sí puede ir sin precio.', v_sin_precio
        using hint = 'precio_obligatorio';
    end if;
  end if;
  v_texto := case when p_es_muestra then 'Pasó de lote de producción a muestra' else 'Pasó de muestra a lote de producción' end || coalesce(' · ' || v_motivo, '');
  update retail.producciones set es_muestra = p_es_muestra where id = p_produccion_id;
  insert into retail.produccion_cambios (produccion_id, accion, antes, despues, texto, hecho_por, created_at)
    values (p_produccion_id, 'tipo', jsonb_build_object('es_muestra', v_o.es_muestra), jsonb_build_object('es_muestra', p_es_muestra), v_texto, v_actor, clock_timestamp())
    returning id into v_id;
  begin
    v_referencia := (select p.referencia from retail.productos p where p.id = v_o.producto_id);
    perform retail.fn_actividad_anotar(
      'produccion', 'orden_produccion_tipo_cambiado',
      'cambió la ' || retail.fn_produccion_numero_texto(v_o.numero) || ' de ' || coalesce(v_referencia, 'un modelo') || ': '
        || case when p_es_muestra then 'de lote de producción a muestra' else 'de muestra a lote de producción' end,
      v_actor, retail.fn_actividad_terminal_ahora(), v_o.ubicacion_id, v_o.ubicacion_id,
      'produccion', p_produccion_id::text, now(),
      jsonb_build_object('produccion_id', p_produccion_id, 'numero', v_o.numero, 'cambio_id', v_id, 'es_muestra', p_es_muestra),
      'vivo');
  exception when others then
    raise warning 'actividad: no se anotó el cambio de tipo de la orden % (%)', v_o.numero, sqlerrm;
  end;
  return jsonb_build_object('cambio', true, 'id', v_id);
end;
$$;
comment on function retail.cambiar_tipo_orden_produccion(uuid, boolean, text) is
  'Pasa una orden en proceso de muestra a lote de producción o al revés. Quien opera la orden (módulo Producción en ese Taller). De muestra a lote exige precio a tienda en cada talla y color (salvo empaque). Queda en produccion_cambios (acción tipo) y en la Actividad. Pedir el tipo que ya tiene no hace nada.';
revoke all on function retail.cambiar_tipo_orden_produccion(uuid, boolean, text) from public, anon;
grant execute on function retail.cambiar_tipo_orden_produccion(uuid, boolean, text) to authenticated;

reset lock_timeout;
