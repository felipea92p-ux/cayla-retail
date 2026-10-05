-- ============================================================================
-- 20261005110000_cola_arranque_reabrir.sql — CAYLA V2 (ADR-0334, Felipe 2026-10-04)
-- «Reabrir una venta cerrada sin prenda»: la salida cuando una cliente la devuelve o la quiere cambiar.
--
-- EL PROBLEMA. Cerrar la cola de arranque (20261005100100) deja la prenda sin identificar, y una venta cerrada sigue bloqueada para
-- cambios y devoluciones: el sistema no sabe a qué stock volvería. Con ~267 ventas cerradas y una ventana de devolución, alguna
-- cliente va a volver. Sin una salida, quien atiende en el mostrador se queda en un callejón sin salida.
--
-- LA DECISIÓN (Felipe, 2026-10-04: «líder puede reabrir»): un LÍDER devuelve esa fila a `pendiente`; desde ahí se regulariza como
-- cualquier otra (eligiendo la prenda real) y recién entonces se puede devolver o cambiar. Queda anotado quién y por qué (Actividad).
--
-- CONTRATO de `reabrir_prenda_cerrada(p_id, p_motivo)`.
--   PROMETE: la fila vuelve a `pendiente` y deja de apuntar a su cierre; nada más cambia (ni stock, ni la venta, ni el registro del
--            cierre, que sigue diciendo lo que el líder aceptó ese día). Una línea en Actividad con el motivo.
--   EXIGE:   cuenta de LÍDER que opere esa tienda, y que la fila esté `cerrada_sin_prenda` (una pendiente, regularizada o anulada no
--            se «reabre»: no hay nada que deshacer).
--   NO EXIGE el plazo del cierre: reabrir corrige, no es la salida de emergencia, y una devolución puede llegar pasado el 15-oct.
--
-- SE ROMPE SI: se reabre una prenda cuyo stock ya corrigió un conteo y después se regulariza con «ya estaba registrada»: se
--   descontaría dos veces. La pantalla lo avisa; la base no puede saberlo (el conteo no recuerda de qué venta salió la diferencia).
--
-- PRODUCCIÓN: pegar con OK de Felipe, tras las partes 1 y 2 de 20261005100000. Un solo archivo: solo `create or replace` y una alta.
-- Ya lleva `retail.`. Se puede pegar dos veces.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function retail.reabrir_prenda_cerrada(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_persona uuid;
  v_p prendas_por_regularizar%rowtype;
begin
  -- Mismo orden que `cerrar_cola_arranque`: primero el permiso, después la firma.
  if not fn_es_lider() then
    raise exception 'cola_solo_lider' using errcode = '42501', hint = 'Solo un líder puede reabrir una venta cerrada sin prenda';
  end if;
  v_persona := fn_actor_persona_id(true);
  if v_persona is null then
    raise exception 'cola_sin_persona' using errcode = '42501', hint = 'No se sabe quién reabre la venta: entra con tu cuenta';
  end if;
  if p_motivo is null or p_motivo not in ('devolucion_o_cambio', 'ya_se_sabe', 'cierre_por_error') then
    raise exception 'reabrir_motivo_invalido' using hint = 'Elige por qué se reabre la venta';
  end if;

  select * into v_p from prendas_por_regularizar where id = p_id for update;
  if not found then
    raise exception 'La prenda por regularizar % no existe', p_id;
  end if;
  if not fn_puede_operar_ubicacion(v_p.ubicacion_id) then
    raise exception 'cola_sin_permiso_sede' using errcode = '42501', hint = 'No tienes permiso para reabrir ventas de esa tienda';
  end if;
  if v_p.estado <> 'cerrada_sin_prenda' then
    raise exception 'prenda_no_cerrada' using hint = 'Esa venta no está cerrada sin prenda: recarga la página para ver cómo quedó';
  end if;

  update prendas_por_regularizar set estado = 'pendiente', cierre_id = null where id = p_id;

  -- Actividad: quién la reabrió y por qué. Un error del historial nunca detiene la reapertura.
  begin
    perform fn_actividad_anotar(
      'existencias', 'prenda_reabierta',
      'reabrió la venta sin registrar «' || btrim(v_p.descripcion) || '» (' || fn_actividad_soles(v_p.precio_cobrado) || ') que estaba cerrada sin prenda — '
        || case p_motivo
             when 'devolucion_o_cambio' then 'una cliente la quiere devolver o cambiar'
             when 'ya_se_sabe' then 'ya se sabe qué prenda era'
             else 'se cerró por error'
           end,
      v_persona, fn_actividad_terminal_ahora(), v_p.ubicacion_id, null,
      'prendas_por_regularizar', v_p.id::text, now(),
      jsonb_build_object('motivo', p_motivo, 'cierre_id', v_p.cierre_id, 'precio_cobrado', v_p.precio_cobrado),
      'vivo');
  exception when others then
    raise warning 'actividad: no se anotó la reapertura de % (%)', p_id, sqlerrm;
  end;
end;
$$;

comment on function retail.reabrir_prenda_cerrada(uuid, text) is
  'ADR-0334: un líder devuelve a pendiente una venta sin registrar cerrada sin prenda (cerrar_cola_arranque), para poder regularizarla y después devolverla o cambiarla. No exige el plazo del cierre.';
revoke all on function retail.reabrir_prenda_cerrada(uuid, text) from public, anon;
grant execute on function retail.reabrir_prenda_cerrada(uuid, text) to authenticated;

-- Sin combo «Responsable»: la cuenta del líder firma (como `cerrar_cola_arranque` y `regularizar_prenda`, ADR-0280).
insert into retail.acciones_sin_responsable (clave, descripcion) values
  ('cola_arranque_reabrir', 'Reabrir una venta sin registrar que se cerró sin prenda')
on conflict (clave) do nothing;

do $v$
begin
  if (select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'reabrir_prenda_cerrada') <> 1 then
    raise exception 'cola de arranque: debe haber una sola reabrir_prenda_cerrada';
  end if;
  if not exists (select 1 from retail.acciones_sin_responsable where clave = 'cola_arranque_reabrir') then
    raise exception 'cola de arranque: falta la acción sin responsable de reabrir';
  end if;
end
$v$;
