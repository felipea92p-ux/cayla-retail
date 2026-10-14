-- ADR-0393 (Felipe, 2026-10-14): el número de guía se escribe o se corrige al cerrar el conteo.
--
-- EL PROBLEMA PRIMERO. El número de guía de un envío lo escribe Compras al despacharlo, o la tienda al abrir uno que llegó sin aviso. Si
-- Compras lo escribió mal, o la tienda no lo tenía a mano al abrir, nadie lo podía corregir: ninguna función cambia `despachos.numero_guia`
-- después de crear el envío. La guía es el papel con el que se cruza lo que llegó (con el transportista, con la factura). Felipe decidió
-- (2026-10-14) que quien cierra el conteo, con la guía en la mano, pueda escribirla o corregirla.
--
-- QUÉ HACE (una sola parte, re-pegable). `corregir_guia_envio`: con el envío ABIERTO, escribe o corrige su número de guía. La misma guía
-- otra vez no hace nada. La pantalla la llama antes de `cerrar_conteo_envio` cuando el campo cambió, y cierra con la versión nueva.
--
-- LO QUE NUNCA DEBE EXISTIR (y quién lo impide):
--   · La guía cambiada en un envío en camino (es de Compras), cerrado o anulado → solo con el envío abierto.
--   · Una guía borrada → vacío se rechaza (`recepcion_guia`): se corrige, no se quita.
--   · Una corrección sin rastro → la actividad guarda la guía de antes y la de ahora, con quién la cambió.
--   · La cambia quien hizo una de las órdenes del envío o alguien de otra sede → `fn_recepcion_exigir`, la misma regla de contar y cerrar.
--
-- CONTRATO de corregir_guia_envio
--   PROMETE: con el módulo Recibir, la sede del envío y quien firma (el combo «Responsable»), a un envío abierto le escribe o corrige el
--            número de guía (hasta 40 letras). Devuelve {despacho_id, numero_guia, version, repetido}: la `version` nueva es la que se
--            pasa al cerrar (el disparador de Compras la sube con cualquier cambio del envío).
--   ASUME:   quien la escribe tiene el papel de la guía en la mano.
--   NO HACE: no cierra el envío ni toca lo contado; no cambia la guía de un envío que no está abierto.
--
-- DESCARTÉ:
--   · Un parámetro nuevo en `cerrar_conteo_envio`: cambiaría su firma, y `20261013180000` y `20261013183000` la parchan por ancla con
--     la firma de hoy (una función nueva con otra firma dejaría la vieja viva, y los parches irían a la vieja).
--   · Corregirla también con el envío en camino o cerrado: en camino es de Compras (el envío todavía no llegó); cerrado, el conteo ya es
--     oficial y para corregirlo está reabrir.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). UNA parte, después de `20261014144000` (el orden completo está en el ADR-0393). Solo
-- crea una función: sin tablas, sin políticas ni `drop trigger` (ADR-0195), sin `select … into` en textos entre comillas (ADR-0288). Se
-- puede pegar dos veces. El bloque final comprueba lo que dejó.

set lock_timeout = '3s';

create or replace function retail.corregir_guia_envio(p_despacho_id uuid, p_numero_guia text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare
  v_actor uuid;
  v_despacho retail.despachos;
  v_guia text := nullif(btrim(coalesce(p_numero_guia, '')), '');
  v_version integer;
begin
  if retail.fn_ve_modulo('recibir') is not true then
    raise exception 'Recibir mercadería necesita el módulo «Recibir mercadería» en tu rol' using errcode = '42501', hint = 'recibir_sin_modulo';
  end if;
  if v_guia is null then
    raise exception 'Escribe el número de guía (se corrige, no se borra)' using hint = 'recepcion_guia';
  end if;
  if length(v_guia) > 40 then
    raise exception 'El número de guía es muy largo: hasta 40 letras' using hint = 'recepcion_guia';
  end if;

  -- El envío en exclusiva, como al cerrar: nadie cierra mientras se corrige su guía.
  select d.* into v_despacho from retail.despachos d where d.id = p_despacho_id for update;
  if not found then
    raise exception 'Ese envío no existe' using hint = 'envio_no_existe';
  end if;
  -- Doble clic o reintento: la misma guía otra vez no cambia nada.
  if v_despacho.numero_guia is not distinct from v_guia then
    return jsonb_build_object('despacho_id', v_despacho.id, 'numero_guia', v_guia, 'version', v_despacho.version, 'repetido', true);
  end if;
  if v_despacho.estado <> 'abierto' then
    raise exception 'La guía se corrige mientras se cuenta: este envío no está abierto' using hint = 'envio_no_abierto';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  perform retail.fn_recepcion_exigir(v_despacho.id, v_despacho.ubicacion_destino_id, v_actor);

  update retail.despachos d set numero_guia = v_guia where d.id = p_despacho_id returning d.version into v_version;

  -- El rastro: la guía de antes y la de ahora. Si la actividad falla, la corrección queda igual.
  begin
    perform retail.fn_actividad_anotar(
      'recibir', 'despacho_guia',
      case when v_despacho.numero_guia is null
           then 'escribió la guía de ' || retail.fn_envio_numero_texto(v_despacho.numero) || ': ' || v_guia
           else 'corrigió la guía de ' || retail.fn_envio_numero_texto(v_despacho.numero) || ': ' || v_despacho.numero_guia || ' → ' || v_guia end,
      v_actor, retail.fn_actividad_terminal_ahora(), v_despacho.ubicacion_destino_id, null,
      'despachos', p_despacho_id::text, now(),
      jsonb_build_object('despacho_id', p_despacho_id, 'antes', v_despacho.numero_guia, 'ahora', v_guia),
      'vivo');
  exception when others then
    raise warning 'actividad: no se anotó la guía del envío % (%)', v_despacho.numero, sqlerrm;
  end;

  return jsonb_build_object('despacho_id', p_despacho_id, 'numero_guia', v_guia, 'version', v_version, 'repetido', false);
end;
$$;
comment on function retail.corregir_guia_envio(uuid, text) is
  'ADR-0393 (Felipe 2026-10-14): escribe o corrige el número de guía de un envío abierto (hasta 40 letras; vacío no). La misma guía otra '
  'vez no hace nada. Módulo Recibir, la sede del envío y quien firma (fn_recepcion_exigir). Devuelve {despacho_id, numero_guia, version, '
  'repetido}: la versión nueva es la que se pasa a cerrar_conteo_envio.';
revoke all on function retail.corregir_guia_envio(uuid, text) from public, anon;
grant execute on function retail.corregir_guia_envio(uuid, text) to authenticated, service_role;

-- Comprobación: si algo no quedó, la migración no se da por aplicada.
do $$
declare
  v_funcion text := 'retail.corregir_guia_envio(uuid,text)';
begin
  if to_regprocedure(v_funcion) is null
     or not (select p.prosecdef from pg_proc p where p.oid = v_funcion::regprocedure)
     or has_function_privilege('anon', v_funcion, 'execute') or not has_function_privilege('authenticated', v_funcion, 'execute') then
    raise exception '%: tiene que existir, ser security definer, y la ejecuta authenticated y no anon', v_funcion;
  end if;
end;
$$;

reset lock_timeout;
