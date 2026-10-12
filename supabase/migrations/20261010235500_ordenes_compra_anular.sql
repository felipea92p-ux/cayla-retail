-- Órdenes de compra, fase 1 · actividad 5 (ADR-0362): anular una orden con su motivo.
--
-- EL PROBLEMA PRIMERO. Una orden que ya no va (el proveedor no tenía la tela, se pidió dos veces) no se puede borrar: su número ya
-- circuló (decisión 2: anular no libera el número) y la regla de la casa es no borrar. Tiene que quedar a la vista como anulada, con
-- quién, cuándo y por qué, y dejar de contar en lo pedido. Y como editar (20261010235000), anular choca con otra persona que tenga la
-- orden abierta: la que guarda segunda tiene que enterarse.
--
-- QUÉ CREA.
--   1. La clave `orden_compra_anular` en `acciones_sin_responsable` (decisión 39): con la cuenta de una persona firma ella; desde una
--      terminal, el combo.
--   2. `anular_orden_compra(p_id, p_version_esperada, p_motivo)`: deja la orden «anulada» con quién, cuándo y el motivo (el candado
--      `ordenes_compra_anulacion` de 20261010214500 exige los tres). Con la versión que vio la pantalla: si otra persona la cambió
--      antes, `PT409` / `version_cambiada` (ADR-0193). Si llega dos veces con el mismo motivo (doble clic, reintento sin red), devuelve
--      la orden como quedó, sin error. La versión sube sola (disparador de 20261010235000), así que una pantalla que la estaba editando
--      recibe el aviso de choque y, al recargar, la ve anulada.
--   3. Su línea en «Actividad» (ADR-0207): «anuló la OC-000129 para Textiles Andina SAC: «el proveedor no tenía la tela»», en la sede
--      donde se hizo y en la que iba a recibirla. Sin montos, como crear y editar.
--
-- REGLAS: solo se anula una orden «generada» (`orden_compra_ya_anulada`); el motivo es obligatorio y va hasta 300 letras
-- (`orden_compra_motivo`). Cuando existan el comprobante y el envío (fases 2 y 3), anular pedirá además que la orden no tenga ninguno
-- vivo (decisión por defecto del ADR): ese candado se suma con esas tablas.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). Después de 20261010235000. Sin tablas ni políticas ni `drop trigger`: una parte.
-- Sin `select … into` dentro de textos entre comillas (ADR-0288). Idempotente.

set search_path = retail, public, extensions;
set lock_timeout = '3s';

insert into retail.acciones_sin_responsable (clave, descripcion) values
  ('orden_compra_anular', 'Anular una orden de compra (con la cuenta de una persona firma ella, desde una terminal se elige quién)')
on conflict (clave) do update set descripcion = excluded.descripcion;

create or replace function retail.anular_orden_compra(
  p_id uuid,
  p_version_esperada integer,
  p_motivo text
)
returns table (id uuid, numero integer, version integer)
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare
  v_actor uuid;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_orden retail.ordenes_compra;
  v_version integer;
begin
  if retail.fn_ve_modulo('ordenes_compra') is not true then
    raise exception 'Anular una orden de compra necesita el módulo «Órdenes de compra» en tu rol'
      using errcode = '42501', hint = 'ordenes_compra_sin_modulo';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  if p_id is null or p_version_esperada is null then
    raise exception 'Falta saber qué orden y qué versión estás anulando: vuelve a abrirla' using hint = 'orden_compra_sin_version';
  end if;
  if v_motivo is null then
    raise exception 'Escribe por qué se anula la orden' using hint = 'orden_compra_motivo';
  end if;
  if length(v_motivo) > 300 then
    raise exception 'El motivo es muy largo: hasta 300 letras' using hint = 'orden_compra_motivo';
  end if;

  -- La fila se bloquea: un anular y un editar a la vez se ponen en fila, y el segundo ve lo que dejó el primero.
  select o.* into v_orden from retail.ordenes_compra o where o.id = p_id for update;
  if not found then
    raise exception 'Esa orden de compra no existe' using hint = 'orden_compra_no_existe';
  end if;

  if v_orden.estado = 'anulada' then
    -- El mismo pedido otra vez (doble clic, reintento): ya está hecho, se devuelve como quedó.
    if v_orden.motivo_anulacion = v_motivo and v_orden.anulada_por = v_actor then
      return query select v_orden.id, v_orden.numero, v_orden.version;
      return;
    end if;
    raise exception 'Esta orden ya estaba anulada' using hint = 'orden_compra_ya_anulada';
  end if;
  if v_orden.version <> p_version_esperada then
    raise exception 'Otra persona cambió esta orden mientras la mirabas. Recarga para ver sus cambios antes de anularla.'
      using errcode = 'PT409', hint = 'version_cambiada';
  end if;

  update retail.ordenes_compra o
     set estado = 'anulada',
         anulada_por = v_actor,
         anulada_en = now(),
         motivo_anulacion = v_motivo
   where o.id = p_id
  returning o.version into v_version;

  -- Actividad (ADR-0207): sin montos. Si falla, la anulación igual queda guardada.
  begin
    perform retail.fn_actividad_anotar(
      'ordenes_compra', 'orden_compra_anulada',
      'anuló la ' || retail.fn_orden_compra_numero_texto(v_orden.numero) || ' para '
        || (select pr.nombre from retail.proveedores pr where pr.id = v_orden.proveedor_id) || ': «' || v_motivo || '»',
      v_actor, retail.fn_actividad_terminal_ahora(), retail.fn_orden_compra_sede_actividad(v_actor), v_orden.ubicacion_destino_id,
      'ordenes_compra', p_id::text, now(),
      jsonb_build_object('orden_id', p_id, 'numero', v_orden.numero, 'version', v_version, 'motivo', v_motivo),
      'vivo');
  exception when others then
    raise warning 'actividad: no se anotó la anulación de la orden de compra % (%)', v_orden.numero, sqlerrm;
  end;

  return query select v_orden.id, v_orden.numero, v_version;
end;
$$;
comment on function retail.anular_orden_compra(uuid, integer, text) is
  'ADR-0362: anula una orden generada con su motivo (PT409 / version_cambiada si otra persona la cambió antes; el mismo pedido '
  'repetido devuelve la orden sin error). El número no se libera. Anota en Actividad, sin montos. '
  'Firma fn_actor_persona_id(true) (orden_compra_anular: persona sin combo, terminal con combo).';
revoke all on function retail.anular_orden_compra(uuid, integer, text) from public, anon;
grant execute on function retail.anular_orden_compra(uuid, integer, text) to authenticated, service_role;

reset lock_timeout;
