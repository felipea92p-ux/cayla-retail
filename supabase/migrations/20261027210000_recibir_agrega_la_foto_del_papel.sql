-- ============================================================================
-- 20261027210000_recibir_agrega_la_foto_del_papel.sql — CAYLA V2 · ADR-0538 (Recibir mercadería, «Los papeles de la compra»)
-- La tienda que cuenta un envío puede AGREGAR la foto de un papel que llegó sin ella (Felipe, 2026-10-27).
--
-- EL PROBLEMA PRIMERO. La foto del papel de una compra anotada desde el celular es opcional (20261023180000): la compradora, con el celular sin
-- batería o el papel en el fardo, la deja para después. Pero en «Recibir» el papel decía «No subió foto» y nadie podía completarlo: la tienda
-- tenía el papel en la mano y no tenía dónde subirlo, y Compras copiaba la serie y el número del papel «de memoria». Es que la base no deja
-- cambiar nada de lo que anotó la compradora (`fn_compra_papeles_inmutable`), foto incluida.
--
-- QUÉ HACE
--   1. La foto se puede AGREGAR (de «sin foto» a una ruta), nunca cambiar ni quitar: el disparador de inmutabilidad deja de mirar la foto en
--      la comparación general y agrega su propia regla («ya tiene foto: no se cambia»). Monto, tipo, proveedor, fecha, lo pagado… siguen
--      sin cambiar. Reemplazo ANCLADO: si el texto de la función en producción no es el esperado, aborta sin cambiar nada.
--   2. `agregar_foto_papel(p_despacho_id, p_papel_id, p_foto_ruta)`: pone la foto de un papel del envío. Módulo «Recibir mercadería», la sede
--      del envío, firma el responsable (`fn_actor_persona_id(true)`). Solo si el papel es de una orden de ESE envío, el envío no está anulado
--      y el papel no tiene foto; la misma ruta otra vez no hace nada. La subida de la foto ya la permite la política del depósito
--      `retail-gastos-viaje` (carpeta `papeles/`) y la lee quien recibe (`fn_puede_ver_foto_gasto_viaje`, 20261023121000).
--   Nada se borra ni se cambia de lo ya guardado.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). Una sola parte, sin políticas ni `drop trigger` (ADR-0195): dos funciones, sin tocar
-- ninguna tabla. Idempotente. Sin `select … into` dentro de textos entre comillas (ADR-0288).
-- ============================================================================
set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- El mismo reemplazo anclado del resto de Compras simple: falla si la función cambió desde que se escribió esto.
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

-- ---------- 1. La foto se agrega, no se cambia ----------
select pg_temp.reemplazar('retail.fn_compra_papeles_inmutable()',
$v$new.monto, new.foto_ruta, new.fecha$v$,
$v$new.monto, new.fecha$v$, 1);
select pg_temp.reemplazar('retail.fn_compra_papeles_inmutable()',
$v$old.monto, old.foto_ruta, old.fecha$v$,
$v$old.monto, old.fecha$v$, 1);
select pg_temp.reemplazar('retail.fn_compra_papeles_inmutable()',
$v$  return new;$v$,
$n$  -- ADR-0538: la foto se puede AGREGAR (de «sin foto» a una ruta), nunca cambiar ni quitar.
  if old.foto_ruta is not null and new.foto_ruta is distinct from old.foto_ruta then
    raise exception 'La foto del papel ya está puesta: no se cambia.' using errcode = 'P0001';
  end if;
  return new;$n$, 1);

-- ---------- 2. Agregar la foto de un papel del envío ----------
create or replace function retail.agregar_foto_papel(p_despacho_id uuid, p_papel_id uuid, p_foto_ruta text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare
  v_actor uuid;
  v_despacho retail.despachos;
  v_papel retail.compra_papeles;
  v_ruta text := nullif(btrim(coalesce(p_foto_ruta, '')), '');
begin
  if retail.fn_ve_modulo('recibir') is not true then
    raise exception 'Subir la foto de un papel necesita el módulo «Recibir mercadería» en tu rol' using errcode = '42501', hint = 'recibir_sin_modulo';
  end if;
  if v_ruta is null or v_ruta not like 'papeles/%' or char_length(v_ruta) > 300 then
    raise exception 'No se pudo subir la foto: vuelve a intentarlo' using hint = 'papel_foto_ruta';
  end if;
  select d.* into v_despacho from retail.despachos d where d.id = p_despacho_id for share;
  if not found then
    raise exception 'Ese envío no existe' using hint = 'envio_no_existe';
  end if;
  if v_despacho.estado = 'anulado' then
    raise exception 'Este envío se anuló: ya no llega' using hint = 'envio_anulado';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  if v_despacho.ubicacion_destino_id is null or not retail.fn_puede_operar_ubicacion(v_despacho.ubicacion_destino_id) then
    raise exception 'Este envío va a %: lo recibe esa tienda',
      coalesce((select u.nombre from retail.ubicaciones u where u.id = v_despacho.ubicacion_destino_id), 'otra sede')
      using errcode = '42501', hint = 'recibir_otra_sede';
  end if;
  -- El papel tiene que ser de una orden de ESTE envío.
  if not exists (
    select 1
      from retail.despacho_items x
      join retail.orden_compra_items xi on xi.id = x.orden_compra_item_id
      join retail.ordenes_compra xo on xo.id = xi.orden_compra_id
     where x.despacho_id = p_despacho_id and xo.papel_id = p_papel_id
  ) then
    raise exception 'Ese papel no es de este envío: recarga la pantalla' using hint = 'papel_ajeno';
  end if;
  select cp.* into v_papel from retail.compra_papeles cp where cp.id = p_papel_id for update;
  if v_papel.foto_ruta is not null then
    if v_papel.foto_ruta = v_ruta then
      return jsonb_build_object('papel_id', p_papel_id, 'foto_ruta', v_ruta, 'repetido', true);
    end if;
    raise exception 'Este papel ya tiene su foto: no se cambia' using hint = 'papel_con_foto';
  end if;

  update retail.compra_papeles cp set foto_ruta = v_ruta where cp.id = p_papel_id;

  begin
    perform retail.fn_actividad_anotar(
      'recibir', 'papel_foto_agregada',
      'subió la foto de un papel de ' || retail.fn_envio_numero_texto(v_despacho.numero),
      v_actor, retail.fn_actividad_terminal_ahora(), v_despacho.ubicacion_destino_id, null,
      'compra_papeles', p_papel_id::text, now(),
      jsonb_build_object('despacho_id', p_despacho_id, 'papel_id', p_papel_id),
      'vivo');
  exception when others then
    raise warning 'actividad: no se anotó la foto del papel % (%)', p_papel_id, sqlerrm;
  end;

  return jsonb_build_object('papel_id', p_papel_id, 'foto_ruta', v_ruta, 'repetido', false);
end;
$$;
comment on function retail.agregar_foto_papel(uuid, uuid, text) is
  'ADR-0538 (Felipe 2026-10-27): pone la foto de un papel de compra que llegó sin ella, desde Recibir. Solo AGREGA (un papel con foto no la cambia; '
  'la misma ruta otra vez no hace nada). Módulo Recibir y la sede del envío; firma el responsable. Devuelve {papel_id, foto_ruta, repetido}.';
revoke all on function retail.agregar_foto_papel(uuid, uuid, text) from public, anon;
grant execute on function retail.agregar_foto_papel(uuid, uuid, text) to authenticated, service_role;

reset lock_timeout;
