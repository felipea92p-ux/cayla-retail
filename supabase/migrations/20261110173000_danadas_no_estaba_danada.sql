-- ============================================================================
-- 20261110173000_danadas_no_estaba_danada.sql — CAYLA V2 · ADR-0640, actividad 2 (Felipe, 2026-11-10)
-- Dañadas: «No estaba dañada». La prenda reportada por error vuelve a donde estaba, sin anotarse como arreglo.
--
-- EL PROBLEMA PRIMERO. Una prenda que se reportó dañada y no lo estaba (la mancha era del probador, se tomó la prenda equivocada) solo
-- volvía a la venta con «Se arregló», que exige escribir «qué se arregló» y la cuenta como arreglada: el historial dice que hubo un
-- arreglo que nunca existió, y la cuenta de arreglos por tipo de daño se ensucia. La otra salida era un ajuste, que crea una pérdida
-- y un hallazgo que tampoco existieron.
--
-- DECISIÓN DE FELIPE (2026-11-10, ADR-0640): «No estaba dañada» la marca cualquiera que vea Existencias, siempre (no solo el mismo
-- día ni solo el líder).
--
-- QUÉ HACE.
--   1. Un desenlace más de `prendas_danadas`: 'no_estaba_danada'. Como 'se_arreglo', no es una salida de CAYLA: es un traslado
--      interno de vuelta (`mover_interno`), así que la definición única de pérdida no lo cuenta nunca.
--   2. `devolver_danada_sin_dano(p_id, p_nota, p_token)`: con la fila y el stock tomados, devuelve TODAS sus unidades de la cuarentena
--      al lugar de donde salieron (el origen de su movimiento de entrada: el piso o el almacén) y cierra la fila con quién y cuándo.
--      Nota opcional (por qué no lo estaba).
--
-- SOLO LO REPORTADO EN LA TIENDA (como «Me equivoqué de prenda», 20261110172000): lo que llegó dañado de una devolución, un cambio o
-- una recepción no salió de ningún piso al que volver. Y NO si ya salió a arreglar: si se mandó a una costurera, estaba dañada; al
-- volver es «Se arregló» o «No se pudo».
--
-- ESTADOS QUE DEJAN DE SER POSIBLES (con la herramienta correcta a mano):
--   · una prenda sana registrada como «arreglada» con una nota inventada;
--   · una pérdida y un hallazgo de un ajuste para devolver a la venta algo que nunca se perdió;
--   · «No estaba dañada» dos veces por un doble clic (marca con huella: el reintento devuelve lo hecho).
--
-- CÓMO SE PEGA EN PRODUCCIÓN: UNA sola parte, DESPUÉS de 20261110172000, tal cual en el SQL Editor, ANTES de publicar la web. Si la web
-- sale primero, solo «No estaba dañada» falla al usarse. Sin políticas ni `drop trigger` (ADR-0195 no aplica). El `alter table` toma un
-- candado breve sobre `prendas_danadas` (lock_timeout 3 s). Idempotente.
-- Cómo se verifica después:
--   select pg_get_constraintdef(oid) from pg_constraint where conname = 'prendas_danadas_estado_check';   (incluye no_estaba_danada)
--   select pg_get_function_identity_arguments(oid) from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'devolver_danada_sin_dano';
--
-- SE ROMPE SI:
--   · alguien vuelve a pegar 20261005140000 (recrea el CHECK de estados sin 'no_estaba_danada': falla si ya hay una así);
--   · `resolver_prenda_danada` acepta 'no_estaba_danada' algún día: escribiría una salida 'cuarentena_no_estaba_danada' que nadie
--     decidió si es pérdida (lo vigila `scripts/pruebas/perdidas.mjs`, que la excluye como a 'se_arreglo').
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

do $guarda$
begin
  if to_regprocedure('retail.corregir_prenda_danada(uuid, uuid, text, uuid)') is null then
    raise exception 'Falta «Me equivoqué de prenda»: pega antes 20261110172000_danadas_corregir_la_prenda.sql.';
  end if;
end;
$guarda$;

alter table retail.prendas_danadas drop constraint if exists prendas_danadas_estado_check;
alter table retail.prendas_danadas add constraint prendas_danadas_estado_check
  check (estado in ('en_cuarentena', 'liquidada', 'se_boto', 'donada', 'devuelta_proveedor', 'se_arreglo', 'no_estaba_danada'));

-- PROMETE: con la dañada 'en_cuarentena' `p_id` reportada en la tienda y que no salió a arreglar, devuelve todas sus unidades de la
--   cuarentena al lugar de donde salieron y la cierra como 'no_estaba_danada', con quién, cuándo y la nota si la hay. O no hace nada
--   y dice por qué. Devuelve {ya_registrada, id, movimiento_id, unidades}. La misma marca con los mismos datos devuelve lo hecho.
-- ASUME: quien llama ve Existencias, opera la sede y eligió quién lo hace.
-- NO HACE: no cuenta pérdida ni hallazgo, no toca dinero, no la cuelga si salió del almacén (para eso, «Bajar al piso»).
create or replace function retail.devolver_danada_sin_dano(p_id uuid, p_nota text default null, p_token uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $fn$
declare
  pd prendas_danadas%rowtype;
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  v_tipo_entrada text;
  v_origen uuid;
  v_destino_entrada uuid;
  v_tipo_origen text;
  v_cuarentena uuid;
  v_marca uuid;
  v_mov uuid;
  v_actor uuid;
begin
  if p_token is null then
    raise exception 'Falta la marca de este intento. Cierra la ventana y vuelve a abrirla.' using hint = 'sin_dano_sin_token';
  end if;
  if not fn_ve_modulo('existencias') then
    raise exception 'No puedes devolver una dañada a la venta: tu rol no tiene el módulo «Existencias». Pídele al líder que lo active.'
      using errcode = '42501', hint = 'sin_dano_sin_modulo';
  end if;
  if v_nota is not null and (char_length(v_nota) < 3 or char_length(v_nota) > 200) then
    raise exception 'La nota debe tener entre 3 y 200 letras, o déjala vacía.' using hint = 'sin_dano_nota_invalida';
  end if;

  select * into pd from prendas_danadas where id = p_id for update;
  if not found then
    raise exception 'Esa prenda dañada ya no está en la lista. Recarga la pantalla.' using hint = 'sin_dano_no_existe';
  end if;
  if not fn_puede_operar_ubicacion(pd.ubicacion_id) then
    raise exception 'No puedes devolver una dañada de esa tienda: no es tu sede.' using hint = 'sin_dano_sin_tienda';
  end if;

  perform retail.fn_intento_con_huella('devolver_danada_sin_dano', p_token, md5(jsonb_build_array(p_id, v_nota)::text));
  v_marca := md5('devolver_danada_sin_dano:' || p_token::text)::uuid;

  if pd.estado <> 'en_cuarentena' then
    -- El reintento de ESTA misma devolución (la respuesta se perdió después de guardar) devuelve lo hecho, sin error.
    if pd.estado = 'no_estaba_danada' and exists (
      select 1 from movimientos_internos_intentos i where i.token_cliente = v_marca and i.movimiento_id = pd.movimiento_salida_id
    ) then
      return jsonb_build_object('ya_registrada', true, 'id', pd.id, 'movimiento_id', pd.movimiento_salida_id, 'unidades', pd.cantidad);
    end if;
    raise exception 'Esta prenda ya se resolvió. Recarga la pantalla.' using hint = 'sin_dano_ya_resuelta';
  end if;
  if pd.en_arreglo_desde is not null then
    raise exception 'Esta prenda ya salió a arreglar: estaba dañada. Cuando vuelva, márcala «Se arregló» o «No se pudo».'
      using hint = 'sin_dano_en_arreglo';
  end if;

  -- ¿Se reportó en la tienda? Su entrada es un traslado del piso o del almacén de la sede a su cuarentena.
  for v_tipo_entrada, v_origen, v_destino_entrada in
    select m.tipo, m.sububicacion_id, m.sububicacion_destino_id from movimientos m where m.id = pd.movimiento_entrada_id
  loop
    exit;
  end loop;
  v_cuarentena := (select s.id from sububicaciones s where s.ubicacion_id = pd.ubicacion_id and s.tipo = 'cuarentena');
  v_tipo_origen := (select s.tipo from sububicaciones s where s.id = v_origen and s.ubicacion_id = pd.ubicacion_id);
  if v_tipo_entrada is distinct from 'traslado' or v_destino_entrada is distinct from v_cuarentena
     or v_tipo_origen is null or v_tipo_origen not in ('piso_venta', 'almacen_tienda') then
    raise exception 'Esta dañada no se reportó en la tienda (llegó de una devolución, un cambio o una recepción): no tiene a qué lugar volver. Decide su destino con las demás opciones.'
      using hint = 'danada_no_se_corrige';
  end if;

  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación.' using hint = 'responsable_requerido';
  end if;

  perform fn_bloquear_en_orden(pd.ubicacion_id, array[pd.variante_id]);
  v_mov := mover_interno(pd.ubicacion_id, pd.variante_id, pd.cantidad, v_cuarentena, v_origen,
                         coalesce('No estaba dañada: ' || v_nota, 'No estaba dañada'), v_marca);

  update prendas_danadas
     set estado = 'no_estaba_danada', movimiento_salida_id = v_mov, resuelto_por = v_actor, resuelto_en = now(), nota = v_nota
   where id = p_id;

  return jsonb_build_object('ya_registrada', false, 'id', p_id, 'movimiento_id', v_mov, 'unidades', pd.cantidad);
end;
$fn$;

comment on function retail.devolver_danada_sin_dano(uuid, text, uuid) is
  'ADR-0640: «No estaba dañada». Devuelve todas las unidades de una dañada en cuarentena, reportada en la tienda y que no salió a arreglar, al lugar de donde salieron (traslado interno con mover_interno: no es pérdida ni arreglo) y la cierra como no_estaba_danada. Nota opcional. Quien ve Existencias y opera la sede, siempre (Felipe 2026-11-10); firma el responsable. p_token obligatorio: el reintento con los mismos datos devuelve ya_registrada.';

revoke all on function retail.devolver_danada_sin_dano(uuid, text, uuid) from public, anon;
grant execute on function retail.devolver_danada_sin_dano(uuid, text, uuid) to authenticated;

notify pgrst, 'reload schema';
