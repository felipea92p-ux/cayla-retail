-- ============================================================================
-- 20261104001000_corregir_proveedor_de_envio_sin_aviso.sql — CAYLA V2 · ADR-0393 (act. 2026-11-03)
-- Recibir: el proveedor de un envío sin aviso se puede corregir, con rastro.
--
-- EL PROBLEMA PRIMERO. Lo que llega sin aviso a veces no se sabe de quién es. En la prueba de punta a punta del 2026-11-03 la persona eligió uno a ciegas
-- para poder cerrar, y `poner_proveedor_envio` no deja cambiarlo: el dato malo quedaba para siempre en el envío, el lote y lo recibido, y de ahí en el costo
-- y las métricas de ese proveedor. Decisión de Felipe: quien ve el dinero de Compras lo corrige, con quién, cuándo y por qué.
--
-- QUÉ CAMBIA
--   1. Tres candados dejan pasar SOLO este cambio, con la marca de la transacción `retail.corrige_proveedor`: `fn_despachos_sin_aviso_fija` y el de
--      `despacho_recibidos` (solo la columna del proveedor), y `fn_despacho_conteos_fija` (lo contado de fuera de la guía, también con el envío cerrado).
--   2. `corregir_proveedor_envio(p_despacho_id, p_proveedor_id, p_motivo)`: cambia el proveedor del envío, sus conteos, sus lotes, lo recibido y las prendas
--      que nacieron con ese envío y no tienen otra entrada. Queda en la Actividad con el proveedor de antes, el nuevo y el motivo.
--
-- LO QUE NO CAMBIA
--   · `poner_proveedor_envio` sigue siendo la que pone el primero. Stock, movimientos y costos no se tocan: solo de quién vino.
--   · Se niega si lo recibido ya está unido a una factura: ahí el proveedor lo dice el papel, y se corrige en Compras.
--
-- DESCARTÉ
--   · Dejarlo a quien tiene Recibir: decide a quién se le atribuye un costo, y eso es de quien ve el dinero de Compras (Felipe 2026-11-03).
--   · Una tabla de correcciones: la Actividad ya guarda quién, cuándo y el detalle, y este cambio será raro.
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
select pg_temp.reemplazar('retail.fn_despachos_sin_aviso_fija()',
$v$  -- La única escritura: poner el proveedor que faltaba (por confirmar → uno), sin tocar nada más.$v$,
$n$  -- Corregirlo desde `corregir_proveedor_envio` (20261104001000), solo esa columna.
  if tg_op = 'UPDATE' and coalesce(current_setting('retail.corrige_proveedor', true), '') = 'si'
     and new.despacho_id = old.despacho_id and new.creado_por = old.creado_por and new.creado_en = old.creado_en then
    return new;
  end if;
  -- La única escritura: poner el proveedor que faltaba (por confirmar → uno), sin tocar nada más.$n$,
1);

select pg_temp.reemplazar('retail.fn_despacho_conteos_fija()',
$v$  if tg_op = 'DELETE' then
    raise exception 'Lo contado de un envío no se borra$v$,
$n$  -- Corregir el proveedor (20261104001000): solo esa columna, también con el envío cerrado.
  if tg_op = 'UPDATE' and coalesce(current_setting('retail.corrige_proveedor', true), '') = 'si'
     and (to_jsonb(new) - 'proveedor_id') = (to_jsonb(old) - 'proveedor_id') then
    return new;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Lo contado de un envío no se borra$n$,
1);

select pg_temp.reemplazar('retail.fn_recepcion_despacho_fija()',
$v$begin
$v$,
$n$begin
  -- Corregir el proveedor (20261104001000): solo esa columna, y solo en lo recibido (esta función vigila otras tablas).
  if tg_op = 'UPDATE' and tg_table_name = 'despacho_recibidos' and coalesce(current_setting('retail.corrige_proveedor', true), '') = 'si'
     and (to_jsonb(new) - 'proveedor_id') = (to_jsonb(old) - 'proveedor_id') then
    return new;
  end if;
$n$,
1);

-- ---------- 2. La corrección ----------
create or replace function retail.corregir_proveedor_envio(p_despacho_id uuid, p_proveedor_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_despacho retail.despachos;
  v_actor uuid;
  v_antes uuid;
  v_nombre_antes text;
  v_nombre text;
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_prendas uuid[];
begin
  if retail.fn_puede_ver_dinero_de_compras() is not true then
    raise exception 'Corregir el proveedor necesita ver el dinero de Compras' using errcode = '42501', hint = 'sin_dinero_de_compras';
  end if;
  v_despacho := (select d from retail.despachos d where d.id = p_despacho_id for update);
  if v_despacho.id is null then
    raise exception 'Ese envío no existe' using hint = 'envio_no_existe';
  end if;
  v_antes := (select s.proveedor_id from retail.despachos_sin_aviso s where s.despacho_id = p_despacho_id);
  if not exists (select 1 from retail.despachos_sin_aviso s where s.despacho_id = p_despacho_id) then
    raise exception 'Este envío vino de Compras: su proveedor es el de sus órdenes' using hint = 'envio_no_es_sin_aviso';
  end if;
  if v_despacho.estado = 'anulado' then
    raise exception 'Este envío se anuló: ya no llega' using hint = 'envio_anulado';
  end if;
  if v_antes is null then
    raise exception 'Este envío todavía no tiene proveedor: se elige al cerrar' using hint = 'envio_sin_proveedor';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  if length(v_motivo) < 3 or length(v_motivo) > 300 then
    raise exception 'Escribe por qué se corrige (hasta 300 letras)' using hint = 'corregir_motivo';
  end if;
  v_nombre := (select pr.nombre from retail.proveedores pr where pr.id = p_proveedor_id and pr.activo);
  if v_nombre is null then
    raise exception 'Elige de quién llegó: un proveedor activo' using hint = 'recepcion_proveedor';
  end if;
  if p_proveedor_id = v_antes then
    raise exception 'Ese ya es el proveedor de este envío' using hint = 'proveedor_igual';
  end if;
  if exists (select 1 from retail.despacho_recibidos r where r.despacho_id = p_despacho_id and r.compra_item_id is not null) then
    raise exception 'Lo recibido ya está unido a una factura: el proveedor se corrige en Compras' using hint = 'proveedor_con_factura';
  end if;
  v_nombre_antes := (select pr.nombre from retail.proveedores pr where pr.id = v_antes);

  perform set_config('retail.corrige_proveedor', 'si', true);
  update retail.despachos_sin_aviso s set proveedor_id = p_proveedor_id where s.despacho_id = p_despacho_id;
  update retail.despacho_conteos k set proveedor_id = p_proveedor_id where k.despacho_id = p_despacho_id and k.proveedor_id = v_antes;
  update retail.despacho_recibidos r set proveedor_id = p_proveedor_id where r.despacho_id = p_despacho_id and r.proveedor_id = v_antes;
  update retail.lotes l set proveedor_id = p_proveedor_id where l.despacho_id = p_despacho_id and l.proveedor_id = v_antes;
  -- Las prendas que nacieron con este proveedor y solo han entrado por este envío. Una prenda con marca necesita el vínculo marca-proveedor (`productos_marca_proveedor_fk`).
  v_prendas := array(
    select p.id from retail.productos p
     where p.proveedor_id = v_antes
       and exists (select 1 from retail.despacho_recibidos r join retail.variantes v on v.id = r.variante_id
                    where r.despacho_id = p_despacho_id and v.producto_id = p.id)
       and not exists (select 1 from retail.movimientos m join retail.variantes v on v.id = m.variante_id
                        left join retail.lotes l on l.id = m.lote_id
                       where v.producto_id = p.id and m.tipo = 'entrada' and l.despacho_id is distinct from p_despacho_id));
  insert into retail.marca_proveedores (marca_id, proveedor_id)
  select distinct p.marca_id, p_proveedor_id from retail.productos p where p.id = any(v_prendas) and p.marca_id is not null
  on conflict do nothing;
  update retail.productos p set proveedor_id = p_proveedor_id where p.id = any(v_prendas);
  perform set_config('retail.corrige_proveedor', '', true);

  begin
    perform retail.fn_actividad_anotar(
      'recibir', 'despacho_sin_aviso_proveedor_corregido',
      'corrigió el proveedor de ' || retail.fn_envio_numero_texto(v_despacho.numero) || ': de ' || v_nombre_antes || ' a ' || v_nombre,
      v_actor, retail.fn_actividad_terminal_ahora(), v_despacho.ubicacion_destino_id, null,
      'despachos', p_despacho_id::text, now(),
      jsonb_build_object('despacho_id', p_despacho_id, 'proveedor_antes', v_antes, 'proveedor_id', p_proveedor_id, 'motivo', v_motivo),
      'vivo');
  exception when others then
    raise warning 'actividad: no se anotó la corrección del proveedor del envío % (%)', v_despacho.numero, sqlerrm;
  end;

  return jsonb_build_object('despacho_id', p_despacho_id, 'proveedor', jsonb_build_object('id', p_proveedor_id, 'nombre', v_nombre));
end;
$$;
comment on function retail.corregir_proveedor_envio(uuid, uuid, text) is
  'ADR-0393 (act. 2026-11-03): corrige el proveedor de un envío sin aviso (envío, conteos, lotes, recibido y prendas que nacieron con él). Solo quien ve el dinero de Compras; queda en la Actividad con el motivo.';
revoke all on function retail.corregir_proveedor_envio(uuid, uuid, text) from public, anon;
grant execute on function retail.corregir_proveedor_envio(uuid, uuid, text) to authenticated, service_role;

reset lock_timeout;
