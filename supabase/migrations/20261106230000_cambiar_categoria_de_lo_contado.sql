-- ============================================================================
-- 20261106230000_cambiar_categoria_de_lo_contado.sql — CAYLA V2 · ADR-0393 (act. 2026-11-06)
-- Recibir: lo contado como nuevo se puede pasar a su categoría de verdad, con el envío ya cerrado.
--
-- EL PROBLEMA PRIMERO. Al contar un envío sin aviso se anotó «Polo 3» en Polos, pero la prenda es un top. En «Para después» la categoría no se podía cambiar:
-- «Crear o asociar» busca solo en la categoría de la línea, así que los tops de esa marca no salían y la prenda habría nacido en la categoría equivocada. La
-- única salida era reabrir el envío entero (Felipe 2026-11-06).
--
-- QUÉ CAMBIA
--   1. Dos candados dejan pasar SOLO este cambio, con la marca de la transacción `retail.cambia_categoria`: `fn_despacho_conteos_fija` (lo contado de fuera de
--      la guía, también con el envío cerrado) y `fn_despacho_pendientes_fija` (el pendiente cambia de línea y de nada más).
--   2. `cambiar_categoria_de_pendiente(p_despacho_id, p_pendiente_id, p_categoria_id)`: pasa el pendiente «por crear» a una línea de fuera de la guía con la
--      categoría correcta, la misma marca, el mismo proveedor y el mismo costo (la que ya exista o una nueva). Lo contado se mueve con él: la línea de origen baja
--      y la de destino sube, así que el total del envío y el «en stock + pendientes + sin separar = contadas» de cada línea siguen cuadrando. Queda en la Actividad.
--
-- LO QUE NO CAMBIA
--   · Toda prenda sigue siendo de la categoría de su línea: `ligar_prenda_a_pendiente`, `resolver_pendiente_envio`, `fn_recepcion_entrar` y el cierre no se tocan.
--   · Stock, movimientos y costos no se tocan: lo «por crear» todavía no entró al stock.
--   · Solo lo de fuera de la guía. Una línea de la guía viene de una orden de compra: bajarle lo contado inventaría un faltante, y se corrige en Compras.
--   · Se niega si la línea ya anotó una diferencia al cerrar: quedó escrita con esa categoría y es inmutable.
--
-- DESCARTÉ
--   · Soltar el candado de categoría en ligar, resolver y entrar: la prenda quedaría en una línea de otra categoría, y reabrir el envío ya no pasaría `guardar_conteo_envio`.
--   · Cambiar la categoría de la línea entera: «Polo 1» puede ser polo y «Polo 3» no, y dos modelos de una línea no se parten.
--   · Pedir ver el dinero de Compras, como el proveedor: la categoría no decide a quién se le atribuye un costo. Basta el módulo Recibir, como ligar la prenda.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). UNA parte, sin políticas ni `drop trigger` (ADR-0195), idempotente.
-- ============================================================================

set lock_timeout = '3s';

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
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición viva.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- ---------- 1. Los candados ----------
select pg_temp.reemplazar('retail.fn_despacho_conteos_fija()',
$v$  if tg_op = 'DELETE' then
    raise exception 'Lo contado de un envío no se borra$v$,
$n$  -- Pasar lo contado a su categoría (20261106230000): solo lo de fuera de la guía, solo lo contado y lo separado de la fila, también con el envío cerrado.
  if tg_op in ('INSERT', 'UPDATE') and coalesce(current_setting('retail.cambia_categoria', true), '') = 'si' and new.extra_posicion is not null
     and (tg_op = 'INSERT'
          or (to_jsonb(new) - 'contadas' - 'separado' - 'costos_prendas' - 'version') = (to_jsonb(old) - 'contadas' - 'separado' - 'costos_prendas' - 'version')) then
    return new;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Lo contado de un envío no se borra$n$,
1);

select pg_temp.reemplazar('retail.fn_despacho_pendientes_fija()',
$v$  if tg_op = 'UPDATE' then
$v$,
$n$  -- Pasar lo contado a su categoría (20261106230000): el pendiente cambia de línea y de nada más.
  if tg_op = 'UPDATE' and coalesce(current_setting('retail.cambia_categoria', true), '') = 'si'
     and old.estado = 'pendiente' and old.tipo = 'crear' and new.extra_posicion is not null
     and (to_jsonb(new) - 'extra_posicion') = (to_jsonb(old) - 'extra_posicion') then
    return new;
  end if;
  if tg_op = 'UPDATE' then
$n$,
1);

-- ---------- 2. El cambio ----------
create or replace function retail.cambiar_categoria_de_pendiente(p_despacho_id uuid, p_pendiente_id uuid, p_categoria_id uuid)
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
  v_origen retail.despacho_conteos;
  v_destino retail.despacho_conteos;
  v_cat_antes text;
  v_cat text;
  v_clave text;
  v_costo jsonb;
  v_nuevas jsonb;
  v_falta integer;
  v_x jsonb;
begin
  if retail.fn_ve_modulo('recibir') is not true then
    raise exception 'Terminar lo pendiente de un envío necesita el módulo «Recibir mercadería» en tu rol'
      using errcode = '42501', hint = 'recibir_sin_modulo';
  end if;

  -- Candados en el orden de siempre (ADR-0190): el envío → su pendiente → sus líneas.
  v_despacho := (select d from retail.despachos d where d.id = p_despacho_id for update);
  if v_despacho.id is null then
    raise exception 'Ese envío no existe' using hint = 'envio_no_existe';
  end if;
  if v_despacho.estado <> 'cerrado' then
    raise exception 'La categoría se corrige aquí con el envío cerrado: mientras se cuenta, quita el modelo y agrégalo en su categoría' using hint = 'categoria_envio_no_cerrado';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  perform retail.fn_recepcion_exigir(v_despacho.id, v_despacho.ubicacion_destino_id, v_actor);

  v_pend := (select x from retail.despacho_pendientes x where x.id = p_pendiente_id for update);
  if v_pend.id is null or v_pend.despacho_id <> p_despacho_id then
    raise exception 'Ese pendiente no es de este envío: recarga la pantalla' using hint = 'pendiente_ajeno';
  end if;
  if v_pend.estado <> 'pendiente' or v_pend.tipo <> 'crear' then
    raise exception 'Esa prenda ya tiene ficha: recarga la pantalla' using hint = 'pendiente_ya_resuelto';
  end if;
  if v_pend.extra_posicion is null then
    raise exception 'Esta línea viene de una orden de compra: su categoría se corrige en Compras' using hint = 'categoria_linea_de_la_guia';
  end if;

  v_origen := (select k from retail.despacho_conteos k
                where k.despacho_id = p_despacho_id and k.extra_posicion = v_pend.extra_posicion for update);
  if v_origen.id is null then
    raise exception 'Esa línea no es de este envío: recarga la pantalla' using hint = 'recepcion_linea_ajena';
  end if;
  if p_categoria_id is null or not exists (select 1 from retail.categorias c where c.id = p_categoria_id and c.activo) then
    raise exception 'Elige una categoría activa' using hint = 'recepcion_extra_categoria';
  end if;
  if p_categoria_id = v_origen.categoria_id then
    return jsonb_build_object('despacho_id', p_despacho_id, 'pendiente_id', p_pendiente_id, 'extra_posicion', v_pend.extra_posicion, 'cambio', false);
  end if;
  if exists (select 1 from retail.despacho_diferencias f where f.despacho_id = p_despacho_id and f.extra_posicion = v_pend.extra_posicion and f.vigente) then
    raise exception 'Esta línea anotó lo que sobró al cerrar: reabre el envío para corregir su categoría' using hint = 'categoria_linea_con_diferencia';
  end if;

  -- Lo separado de origen deja de traer este modelo; lo demás queda igual, en su orden.
  v_nuevas := '[]'::jsonb;
  v_falta := v_pend.cantidad;
  for v_x in select n.x from jsonb_array_elements(v_origen.separado -> 'nuevas') with ordinality n(x, o) order by n.o loop
    if v_falta > 0 and v_x ->> 'descripcion' is not distinct from v_pend.descripcion then
      if (v_x ->> 'cantidad')::integer > v_falta then
        v_nuevas := v_nuevas || jsonb_set(v_x, '{cantidad}', to_jsonb((v_x ->> 'cantidad')::integer - v_falta));
        v_falta := 0;
      else
        v_falta := v_falta - (v_x ->> 'cantidad')::integer;
      end if;
    else
      v_nuevas := v_nuevas || v_x;
    end if;
  end loop;

  -- El costo que se le puso por su descripción viaja con él (ADR-0519). En origen se queda si otro «por crear» de esa línea se llama igual.
  v_clave := 'nueva:' || v_pend.descripcion;
  v_costo := v_origen.costos_prendas -> v_clave;

  perform set_config('retail.cambia_categoria', 'si', true);
  begin
    -- La línea de destino: la de esa categoría, marca, proveedor y costo, o una nueva. Con otro costo no se junta: el modelo entraría con un costo que no es el suyo.
    v_destino := (select k from retail.despacho_conteos k
                   where k.despacho_id = p_despacho_id and k.extra_posicion is not null
                     and k.categoria_id = p_categoria_id
                     and k.marca_id is not distinct from v_origen.marca_id
                     and k.proveedor_id is not distinct from v_origen.proveedor_id
                     and k.costo_unitario is not distinct from v_origen.costo_unitario
                   order by k.extra_posicion limit 1 for update);
    if v_destino.id is null then
      insert into retail.despacho_conteos (despacho_id, extra_posicion, proveedor_id, categoria_id, marca_id, contadas, costo_unitario, contado_por)
      values (p_despacho_id,
              (select coalesce(max(k.extra_posicion), 0) + 1 from retail.despacho_conteos k where k.despacho_id = p_despacho_id),
              v_origen.proveedor_id, p_categoria_id, v_origen.marca_id, 0, v_origen.costo_unitario, v_actor)
      returning * into v_destino;
    end if;

    update retail.despacho_conteos k
       set contadas = k.contadas - v_pend.cantidad,
           separado = jsonb_set(k.separado, '{nuevas}', v_nuevas),
           costos_prendas = case
             when v_costo is null then k.costos_prendas
             when exists (select 1 from retail.despacho_pendientes y
                           where y.despacho_id = p_despacho_id and y.id <> p_pendiente_id and y.extra_posicion = v_pend.extra_posicion
                             and y.tipo = 'crear' and y.estado = 'pendiente' and y.descripcion = v_pend.descripcion) then k.costos_prendas
             else k.costos_prendas - v_clave end,
           version = k.version + 1
     where k.id = v_origen.id;

    update retail.despacho_conteos k
       set contadas = k.contadas + v_pend.cantidad,
           separado = jsonb_set(k.separado, '{nuevas}', (k.separado -> 'nuevas') || jsonb_strip_nulls(jsonb_build_object('cantidad', v_pend.cantidad, 'descripcion', v_pend.descripcion))),
           costos_prendas = case when v_costo is null then k.costos_prendas else k.costos_prendas || jsonb_build_object(v_clave, v_costo) end,
           version = k.version + 1
     where k.id = v_destino.id;

    update retail.despacho_pendientes x set extra_posicion = v_destino.extra_posicion where x.id = p_pendiente_id;
  exception when others then
    perform set_config('retail.cambia_categoria', '', true);
    raise;
  end;
  perform set_config('retail.cambia_categoria', '', true);

  v_cat_antes := (select c.nombre from retail.categorias c where c.id = v_origen.categoria_id);
  v_cat := (select c.nombre from retail.categorias c where c.id = p_categoria_id);
  begin
    perform retail.fn_actividad_anotar(
      'recibir', 'despacho_pendiente_categoria_cambiada',
      'pasó ' || coalesce(v_pend.descripcion, v_pend.cantidad || ' por crear') || ' de ' || v_cat_antes || ' a ' || v_cat || ' en ' || retail.fn_envio_numero_texto(v_despacho.numero),
      v_actor, retail.fn_actividad_terminal_ahora(), v_despacho.ubicacion_destino_id, null,
      'despachos', p_despacho_id::text, now(),
      jsonb_build_object('despacho_id', p_despacho_id, 'pendiente_id', p_pendiente_id, 'categoria_antes', v_origen.categoria_id, 'categoria_id', p_categoria_id, 'cantidad', v_pend.cantidad),
      'vivo');
  exception when others then
    raise warning 'actividad: no se anotó el cambio de categoría del envío % (%)', v_despacho.numero, sqlerrm;
  end;

  return jsonb_build_object('despacho_id', p_despacho_id, 'pendiente_id', p_pendiente_id, 'extra_posicion', v_destino.extra_posicion, 'cambio', true);
end;
$$;
comment on function retail.cambiar_categoria_de_pendiente(uuid, uuid, uuid) is
  'ADR-0393 (act. 2026-11-06): con el envío CERRADO, pasa un pendiente «por crear» de fuera de la guía a una línea con su categoría de verdad (misma marca, proveedor y costo), '
  'moviendo lo contado con él. No toca stock ni costos. Módulo Recibir, su sede y la decisión 17; firma el responsable; queda en la Actividad. La misma categoría no cambia nada.';
revoke all on function retail.cambiar_categoria_de_pendiente(uuid, uuid, uuid) from public, anon;
grant execute on function retail.cambiar_categoria_de_pendiente(uuid, uuid, uuid) to authenticated, service_role;

-- ---------- 3. Comprobación: si algo no quedó, la migración no se da por aplicada ----------
do $$
begin
  if position('retail.cambia_categoria' in pg_get_functiondef('retail.fn_despacho_conteos_fija()'::regprocedure)) = 0
     or position('retail.cambia_categoria' in pg_get_functiondef('retail.fn_despacho_pendientes_fija()'::regprocedure)) = 0 then
    raise exception 'los candados de lo contado no dejan pasar el cambio de categoría';
  end if;
end;
$$;

reset lock_timeout;
