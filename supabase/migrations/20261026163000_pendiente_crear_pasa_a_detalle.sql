-- ADR-0393 (actualización 2026-10-26) · «Crear ahora» deja la prenda creada en «Para después».
--
-- EL PROBLEMA PRIMERO. En «Para después», un pendiente «crear» dice «6 prendas nuevas · por crear en el catálogo». Con «Crear ahora»,
-- la persona crea la prenda de verdad (preparar_prenda_al_recibir → el catálogo la tiene) y la pantalla le abre «Tallas y colores».
-- Si no quiere repartir las 6 todavía y toca «Dejar para después», la prenda ya existe en Catálogo ▸ Productos, pero el pendiente sigue
-- diciendo «por crear»: nada en la base une una con otro (preparar_prenda_al_recibir no sabe de pendientes). La lista miente, la
-- persona vuelve a «Crear ahora» y se topa con «ya existe esa prenda», y el aviso de Productos («N prendas por crear») cuenta como
-- por crear algo que ya se creó. Un pendiente de otra clase, el «detalle» (se sabe qué prenda es, faltan tallas y colores), ya existe y es
-- justo lo que quedó: lo que falta es que el «crear» pueda PASAR a «detalle» cuando se crea su prenda.
--
-- QUÉ HACE (una sola parte, re-pegable).
--   1. `ligar_prenda_a_pendiente(envío, pendiente, prenda)`: con el envío CERRADO, el pendiente «crear» pasa a «detalle» con esa prenda
--      (y suelta la descripción que se anotó al contar: ahora la prenda tiene nombre). Un pendiente que ya es «detalle» no cambia: responde
--      `ligado: false` sin error (un reintento, o la persona creó otra prenda estando ya ligado).
--   2. `fn_despacho_pendientes_fija` (REEMPLAZO ANCLADO): deja pasar ESE cambio, y solo ese, mientras la función de arriba tiene encendida
--      su marca de transacción `retail.ligando_pendiente`. Todo lo demás de un pendiente sigue sin cambiar (envío, línea, cantidad, quién
--      lo anotó, su estado), y un pendiente no se borra.
--
-- LO QUE NUNCA DEBE EXISTIR (y quién lo impide):
--   · Un pendiente que cambia de qué es a mano o por otra función → el disparador exige la marca `retail.ligando_pendiente`, que solo
--     enciende `ligar_prenda_a_pendiente` y apaga al terminar (o al fallar).
--   · Un «detalle» con una prenda de otra categoría o marca, inactiva o rechazada → `ligar_prenda_a_pendiente` lo rechaza con las mismas
--     pistas que `resolver_pendiente_envio` (`recepcion_prenda_ajena`, `recepcion_prenda_inactiva`).
--   · Que lo contado se descuadre: ligar no toca cantidades ni stock; el candado diferido `despacho_pendientes_cuadra` sigue mirando.
--
-- CONTRATO de ligar_prenda_a_pendiente
--   PROMETE: con el módulo Recibir, la sede del envío y quien firma (que no hizo ninguna de sus órdenes, decisión 17), un pendiente
--            «crear» de un envío cerrado pasa a «detalle» de esa prenda, con la misma cantidad, la misma línea y el mismo estado. Todo o nada.
--   ASUME:   el envío está cerrado; la prenda de la misma categoría y marca que la línea, activa y no rechazada (la que acaba de crear
--            `preparar_prenda_al_recibir`, o la que la persona eligió porque «ya existe»).
--   NO HACE: no mete nada al stock ni cambia lo contado (eso es `resolver_pendiente_envio`); no crea la prenda; no vuelve un «detalle»
--            a «crear» ni lo cambia de prenda (un pendiente se termina con tallas de cualquier prenda de su línea).
--
-- DESCARTÉ:
--   · Que `preparar_prenda_al_recibir` ligue por sí sola (un parámetro más): es una función larga ya parchada dos veces con reemplazos
--     anclados y de más de un módulo (Compras la usa al contar); ligar es un paso aparte, que la pantalla da justo después. Si falla
--     entre uno y otro, queda exactamente lo de hoy (la prenda creada y el pendiente «por crear»), sin estado imposible, y el próximo
--     «ya existe esa prenda» lo repara.
--   · Anular el pendiente «crear» y abrir uno «detalle» nuevo: un pendiente anulado significa «se reabrió el envío», y el rastro de
--     quién lo anotó y cuándo se perdería.
--   · Agregar una columna «prenda creada» al «crear»: dos pendientes con dos maneras de decir lo mismo («detalle» ya es «prenda sin
--     tallas»), y cada lectura (Inicio, Productos, reabrir) tendría que mirar las dos.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). UNA parte, después de 20261013172000 y 20261013173000. Sin tablas nuevas, sin
-- políticas, sin `alter table` ni `drop trigger` (ADR-0195), y sin `select … into` dentro de textos entre comillas (ADR-0288). El
-- reemplazo del disparador aborta sin tocar nada si su definición viva cambió y no hace nada si ya está. Se puede pegar dos veces. El
-- bloque final comprueba que quedó todo.

set lock_timeout = '3s';

-- Reemplazo anclado (el mismo de 20261013173000): falla si la función viva cambió, y es re-ejecutable.
create or replace function pg_temp.reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
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
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- ---------- 1. El candado de los pendientes deja pasar «crear» → «detalle», y solo eso, con la marca de la función ----------
select pg_temp.reemplazar(
  'retail.fn_despacho_pendientes_fija()',
  $v$  if tg_op = 'UPDATE' then
    if (new.despacho_id,$v$,
  $v$  if tg_op = 'UPDATE' then
    -- ADR-0393 (2026-10-26): la ÚNICA vez que un pendiente cambia de qué es: «crear» → «detalle», cuando se crea la prenda que esperaba
    -- (`ligar_prenda_a_pendiente` enciende la marca de esta transacción). Todo lo demás queda igual; la descripción se suelta porque la
    -- prenda ya tiene nombre.
    if old.tipo = 'crear' and new.tipo = 'detalle' and current_setting('retail.ligando_pendiente', true) = 'si'
       and old.estado = 'pendiente' and new.estado = 'pendiente' and new.producto_id is not null and new.descripcion is null
       and (new.despacho_id, new.despacho_item_id, new.extra_posicion, new.cantidad, new.anotado_por, new.anotado_en,
            new.resuelto_por, new.resuelto_en)
           is not distinct from
           (old.despacho_id, old.despacho_item_id, old.extra_posicion, old.cantidad, old.anotado_por, old.anotado_en,
            old.resuelto_por, old.resuelto_en) then
      return new;
    end if;
    if (new.despacho_id,$v$,
  1);

-- ---------- 2. Ligar la prenda recién creada al pendiente que la esperaba ----------
create or replace function retail.ligar_prenda_a_pendiente(
  p_despacho_id uuid,
  p_pendiente_id uuid,
  p_producto_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare
  v_actor uuid;
  v_despacho retail.despachos;
  v_pend retail.despacho_pendientes;
  v_linea record;
  v_prenda record;
begin
  if retail.fn_ve_modulo('recibir') is not true then
    raise exception 'Terminar lo pendiente de un envío necesita el módulo «Recibir mercadería» en tu rol'
      using errcode = '42501', hint = 'recibir_sin_modulo';
  end if;

  -- Candados en el orden de siempre (ADR-0190): el envío (dos personas terminando el mismo envío se ponen en fila; reabrir también
  -- espera) → su pendiente → la prenda.
  select d.* into v_despacho from retail.despachos d where d.id = p_despacho_id for update;
  if not found then
    raise exception 'Ese envío no existe' using hint = 'envio_no_existe';
  end if;
  if v_despacho.estado = 'anulado' then
    raise exception 'Este envío se anuló: ya no llega' using hint = 'envio_anulado';
  end if;
  if v_despacho.estado = 'en_camino' then
    raise exception 'Este envío todavía no se abrió: pulsa «Empezar a recibir»' using hint = 'envio_sin_abrir';
  end if;
  if v_despacho.estado = 'abierto' then
    raise exception 'Este envío todavía se está contando: la prenda se pone en el conteo' using hint = 'pendiente_envio_abierto';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  perform retail.fn_recepcion_exigir(v_despacho.id, v_despacho.ubicacion_destino_id, v_actor);

  select x.* into v_pend from retail.despacho_pendientes x where x.id = p_pendiente_id for update;
  if not found or v_pend.despacho_id <> p_despacho_id then
    raise exception 'Ese pendiente no es de este envío: recarga la pantalla' using hint = 'pendiente_ajeno';
  end if;
  if v_pend.estado <> 'pendiente' then
    raise exception 'Ese pendiente ya salió de la lista: recarga la pantalla' using hint = 'pendiente_ya_resuelto';
  end if;
  -- Ya sabe qué prenda es: no hay nada que ligar (un reintento, o la persona creó otra prenda estando ya ligado).
  if v_pend.tipo = 'detalle' then
    return jsonb_build_object('despacho_id', p_despacho_id, 'pendiente_id', p_pendiente_id, 'producto_id', v_pend.producto_id,
                              'ligado', false);
  end if;

  -- La prenda: de la categoría y la marca de la línea (como lo exige resolver_pendiente_envio), activa y no rechazada.
  select coalesce(di.categoria_id, k.categoria_id) as categoria_id, coalesce(di.marca_id, k.marca_id) as marca_id
    into v_linea
    from retail.despacho_conteos k
    left join retail.despacho_items di on di.id = k.despacho_item_id
   where k.despacho_id = p_despacho_id
     and k.despacho_item_id is not distinct from v_pend.despacho_item_id
     and k.extra_posicion is not distinct from v_pend.extra_posicion;
  if not found then
    raise exception 'Esa línea no es de este envío: recarga la pantalla' using hint = 'recepcion_linea_ajena';
  end if;
  select pr.estado, pr.estado_alta, pr.categoria_id, pr.marca_id
    into v_prenda
    from retail.productos pr
   where pr.id = p_producto_id
     for share;
  if not found then
    raise exception 'Esa prenda no existe: recarga la pantalla' using hint = 'recepcion_prenda_no_existe';
  end if;
  if v_prenda.categoria_id is distinct from v_linea.categoria_id or v_prenda.marca_id is distinct from v_linea.marca_id then
    raise exception 'Esa prenda es de otra categoría o marca que la línea: elígela de nuevo' using hint = 'recepcion_prenda_ajena';
  end if;
  if v_prenda.estado <> 'activo' or v_prenda.estado_alta = 'rechazado' then
    raise exception 'Esa prenda no está activa: elígela de nuevo' using hint = 'recepcion_prenda_inactiva';
  end if;

  -- El único cambio que el disparador deja pasar, y solo con esta marca; se apaga siempre, falle o no.
  perform set_config('retail.ligando_pendiente', 'si', true);
  begin
    update retail.despacho_pendientes x
       set tipo = 'detalle', producto_id = p_producto_id, descripcion = null
     where x.id = p_pendiente_id;
  exception when others then
    perform set_config('retail.ligando_pendiente', '', true);
    raise;
  end;
  perform set_config('retail.ligando_pendiente', '', true);

  return jsonb_build_object('despacho_id', p_despacho_id, 'pendiente_id', p_pendiente_id, 'producto_id', p_producto_id, 'ligado', true);
end;
$$;
comment on function retail.ligar_prenda_a_pendiente(uuid, uuid, uuid) is
  'ADR-0393 (2026-10-26): con el envío CERRADO, el pendiente «crear» pasa a «detalle» de la prenda que se creó para él (o que ya existía): '
  'misma línea, misma cantidad, mismo estado; la descripción anotada al contar se suelta. Un «detalle» no cambia (ligado: false). La '
  'prenda es de la categoría y marca de la línea, activa y no rechazada. No mete nada al stock: eso es resolver_pendiente_envio. '
  'Módulo Recibir, su sede y la decisión 17; firma el responsable. Devuelve {despacho_id, pendiente_id, producto_id, ligado}.';
revoke all on function retail.ligar_prenda_a_pendiente(uuid, uuid, uuid) from public, anon;
grant execute on function retail.ligar_prenda_a_pendiente(uuid, uuid, uuid) to authenticated, service_role;

-- ---------- 3. Comprobación: si algo no quedó, la migración no se da por aplicada ----------
do $$
declare
  v_funcion text := 'retail.ligar_prenda_a_pendiente(uuid,uuid,uuid)';
begin
  if not (select p.prosecdef from pg_proc p where p.oid = v_funcion::regprocedure) then
    raise exception '% tiene que ser security definer', v_funcion;
  end if;
  if has_function_privilege('anon', v_funcion, 'execute') or not has_function_privilege('authenticated', v_funcion, 'execute') then
    raise exception '%: la ejecuta authenticated y no anon', v_funcion;
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'retail' and p.proname = 'ligar_prenda_a_pendiente' group by p.proname having count(*) > 1) then
    raise exception 'ligar_prenda_a_pendiente quedó con dos versiones';
  end if;
  if position('retail.ligando_pendiente' in pg_get_functiondef('retail.fn_despacho_pendientes_fija()'::regprocedure)) = 0 then
    raise exception 'el disparador de los pendientes no deja pasar «crear» → «detalle»';
  end if;
  if has_function_privilege('authenticated', 'retail.fn_despacho_pendientes_fija()', 'execute')
     or has_function_privilege('anon', 'retail.fn_despacho_pendientes_fija()', 'execute') then
    raise exception 'fn_despacho_pendientes_fija es interna: ni authenticated ni anon la ejecutan';
  end if;
end;
$$;

reset lock_timeout;
