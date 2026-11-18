-- ============================================================================
-- 20261028071000_produccion_quitar_paso_de_la_orden.sql — CAYLA V2 (ADR-0551, actividad 1b · 2026-10-28)
--
-- EL PROBLEMA PRIMERO. La actividad 1 bajó los pasos fijos de siete a cinco, pero solo para las órdenes que se abran DESPUÉS: las que ya estaban abiertas con siete
-- pasos «siguen válidas» (ADR-0551, propuesta A) y nadie dejó cómo quitarles «Limpiar hilos y revisar» ni «Etiquetar y embolsar». Medido en producción (solo lectura,
-- 2026-10-28): OP-1, OP-2, OP-3 y OP-4 tienen los siete pasos y NINGUNO ha empezado (0 avances, 0 salidas). Y esconder el paso en la pantalla no alcanza: «Etiquetar y
-- embolsar» sería la última fase de la orden, la que manda el cierre (`cerrar_produccion`), y nadie la marcaría: la orden quedaría trabada para pasar al stock.
--
-- QUÉ HACE (una función nueva; sin tablas, sin políticas, sin `alter`)
--   · `quitar_paso_orden(p_fase_id, p_motivo)` saca de UNA orden en proceso un paso que todavía no empezó. La pantalla la llama desde «Quitar este paso», en la ruta de fases.
--   · Solo se quita lo que NO tiene NADA anotado: ni un avance, ni una salida, ni una vuelta, ni una marca (aunque estén deshechos: un Deshacer total deja filas, y esas filas
--     son historia que apunta a la fase). Con cualquiera de esas filas responde `fase_empezada`.
--   · Un paso fijo no se quita: la ruta que queda tiene que pasar la MISMA validación que al abrir la orden (`fn_produccion_fases_normalizar`); si no la pasa, `paso_fijo`.
--     Así la lista de cuáles son fijos vive en UN solo lugar (la que ya existe) y no se repite aquí.
--   · Es lo mismo que ya exige `cambiar_quien_fase`: ve Producción, está parado en ese Taller y firma un responsable (ADR-0162); y queda en Actividad.
--
-- DECIDÍ: borrar la fila de `produccion_fases`, no marcarla «quitada». Una fila sin ningún hijo no tiene historia que perder (nada la referencia: la función de arriba lo
--   comprueba), y marcarla obligaría a cada lector de la ruta (`fn_fases_de_orden`, el cierre, la lista, el Resumen) a saltársela: un `if` más en cada uno. Lo que queda escrito
--   es la Actividad, con la clave, quién la hacía y lo que costaba. Las demás fases conservan su `secuencia` (la secuencia es la de la RUTA, no un contador: 5, 10, 15, 30, 65).
-- DESCARTÉ: (a) esconder el paso solo en la web: deja la orden sin poder cerrar; (b) un SQL puntual sobre las 4 órdenes: la próxima orden con un paso que sobra pide lo mismo;
--   (c) quitar el paso con «Cambiar quién»: ese botón cambia quién, no la ruta, y su validación supone que la ruta no cambia.
-- SE ROMPE SI: alguien anota algo en el paso EN EL MISMO INSTANTE en que otra persona lo quita. Lo impide el candado por orden (`pg_advisory_xact_lock` con la misma llave de
--   anular salida y vuelta) y la llave foránea de las cuatro tablas de anotaciones: si la fila aparece justo antes del `delete`, el `delete` se detiene y no se quita nada.
-- NO HAY «AGREGAR PASO»: quitar es de un solo sentido (lo dice la pantalla antes de confirmar). Si alguien quita uno por error, la orden se anula y se abre de nuevo, o se pide una
--   función hermana; con 0 órdenes cerradas y 4 abiertas sin empezar, se aceptó el costo.
--
-- PRODUCCIÓN. NO está aplicada. Una sola parte, re-ejecutable, `lock_timeout = 3s`: solo `create or replace` de una función nueva y sus permisos; no toca las tablas de `auth`
--   ni `storage`. Dentro de los textos no hay ningún `select … into` (ADR-0288). Prueba: `pnpm pruebas:produccion-quitar-paso`.
--   LA LIMPIEZA DE LAS 4 ÓRDENES NO VA AQUÍ (es dato, no esquema): va aparte, con la función ya aplicada, y entra a Actividad como cualquier otro quitado.
-- ============================================================================

set lock_timeout = '3s';

create or replace function retail.quitar_paso_orden(p_fase_id uuid, p_motivo text default null) returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare
  v_op record; v_f record; v_resto jsonb; v_motivo text;
begin
  -- Que la fase exista, que quien llama vea Producción y esté en ese Taller, que haya un responsable y que la orden siga en proceso.
  select * into v_op from retail.fn_produccion_operar_fase(p_fase_id);
  perform pg_advisory_xact_lock(hashtextextended('produccion:' || v_op.produccion_id::text, 0));
  v_motivo := nullif(btrim(coalesce(p_motivo, '')), '');

  -- Solo se quita lo que no tiene NADA anotado, ni siquiera algo deshecho: esas filas apuntan a la fase y son historia.
  if exists (select 1 from retail.produccion_avances a where a.fase_id = p_fase_id)
     or exists (select 1 from retail.produccion_salidas s where s.fase_id = p_fase_id)
     or exists (select 1 from retail.produccion_vueltas vu where vu.fase_id = p_fase_id)
     or exists (select 1 from retail.produccion_fase_marcas m where m.fase_id = p_fase_id) then
    raise exception 'La fase «%» ya tiene algo anotado: no se puede quitar', retail.fn_fase_nombre(v_op.clave) using hint = 'fase_empezada';
  end if;

  -- La ruta que queda pasa la misma validación que al abrir la orden; si no la pasa, el paso es fijo. Las demás fases viajan como están (en el Taller), igual que en
  -- `cambiar_quien_fase`: lo que se valida es la FORMA de la ruta, no quién hace cada paso.
  v_resto := coalesce((select jsonb_agg(jsonb_build_object('clave', o.clave, 'posicion', o.posicion, 'quien', 'taller') order by o.secuencia)
                         from retail.produccion_fases o where o.produccion_id = v_op.produccion_id and o.id <> p_fase_id), '[]'::jsonb);
  begin
    perform retail.fn_produccion_fases_normalizar(v_resto);
  exception when raise_exception then
    raise exception '«%» es un paso fijo de la ruta: no se quita', retail.fn_fase_nombre(v_op.clave) using hint = 'paso_fijo';
  end;

  select f.quien, f.tarifa_prenda, f.fijo_orden, f.proveedor_id into v_f from retail.produccion_fases f where f.id = p_fase_id;
  delete from retail.produccion_fases where id = p_fase_id;

  begin
    perform retail.fn_actividad_anotar(
      'produccion', 'produccion_paso_quitado',
      'quitó el paso ' || retail.fn_fase_nombre(v_op.clave) || ' de la ' || retail.fn_produccion_numero_texto(v_op.numero)
        || coalesce(': ' || v_motivo, ''),
      v_op.actor, retail.fn_actividad_terminal_ahora(), v_op.ubicacion_id, v_op.ubicacion_id,
      'produccion', v_op.produccion_id::text, now(),
      jsonb_build_object('produccion_id', v_op.produccion_id, 'numero', v_op.numero, 'fase', v_op.clave, 'quien', v_f.quien,
                         'proveedor_id', v_f.proveedor_id, 'tarifa_prenda', v_f.tarifa_prenda, 'fijo_orden', v_f.fijo_orden),
      'vivo');
  exception when others then
    raise warning 'actividad: no se anotó el paso quitado de la orden % (%)', v_op.numero, sqlerrm;
  end;

  return retail.fn_fases_de_orden(v_op.produccion_id);
end;
$$;
comment on function retail.quitar_paso_orden(uuid, text) is
  'ADR-0551 act. 1b: saca de una orden en proceso un paso que todavía no tiene nada anotado (ni avances, salidas, vueltas ni marcas). Un paso fijo de la ruta no se quita (paso_fijo). '
  'Borra la fila de produccion_fases y deja el rastro en Actividad. Devuelve fn_fases_de_orden.';

revoke all on function retail.quitar_paso_orden(uuid, text) from public, anon;
grant execute on function retail.quitar_paso_orden(uuid, text) to authenticated, service_role;

reset lock_timeout;
