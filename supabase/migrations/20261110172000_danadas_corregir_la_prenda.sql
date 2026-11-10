-- ============================================================================
-- 20261110172000_danadas_corregir_la_prenda.sql — CAYLA V2 · ADR-0640, actividad 1 (Felipe, 2026-11-10)
-- Dañadas: «Me equivoqué de prenda». Se corrige la talla o el color de una dañada reportada en la tienda, en un solo paso.
--
-- EL PROBLEMA PRIMERO. El 2026-11-10, en Trujillo, se reportó dañado un Vestido Campanita Celeste talla 28 cuando la manchada era
-- la 30. No había cómo corregirlo: la dañada solo sale de la cuarentena arreglada, liquidada, botada, donada o devuelta. La tienda
-- lo «arregló» con dos «Ajustar stock» (28 +1, 30 −1 y después 30 +1) y el sistema terminó contando 3 vestidos donde había 2: una 28
-- en la cuarentena que no existe y la 30 manchada como vendible en el almacén. Un error de dedo se volvió un estado imposible porque
-- la única herramienta a mano (el ajuste) no sabe de la dañada.
--
-- DECISIÓN DE FELIPE (2026-11-10, ADR-0640): en cada dañada, «Me equivoqué de prenda»: eliges la talla o el color correcto y, en un
-- solo paso, la equivocada vuelve a donde estaba y la correcta pasa a dañadas. Sin ajustes.
--
-- QUÉ HACE.
--   1. `prendas_danadas` gana `corregida_de_variante_id`, `corregida_en` y `corregida_por`: la última corrección, para que la lista
--      y el historial digan «antes decía talla 28». Van juntas o ninguna (`prendas_danadas_correccion_coherente`).
--   2. `corregir_prenda_danada(p_id, p_variante_id, p_desde, p_token)`: con la fila y el stock de las DOS prendas tomados, mueve la
--      equivocada de la cuarentena al lugar de donde salió (el origen de su movimiento de entrada) y la correcta del piso o del
--      almacén (`p_desde`) a la cuarentena; la fila pasa a la prenda correcta y su movimiento de entrada es el nuevo. Todo o nada.
--
-- POR QUÉ DOS TRASLADOS INTERNOS Y NO AJUSTES. Un ajuste dice «conté y hay otra cifra»: cuenta como pérdida o hallazgo, y no sabe
-- que la prenda está en la cuarentena. Lo que pasó es que una prenda está en el lugar equivocado: son dos traslados dentro de la
-- sede (`mover_interno`), como el reporte mismo. Así no nace una pérdida que no existió (`fn_perdida_razon` no los cuenta) y
-- Movimientos cuenta la historia tal cual: «volvió al almacén: la dañada es la 30» y «pasó a cuarentena: mancha».
--
-- POR QUÉ SE MODIFICA LA FILA Y NO SE CIERRA UNA Y SE ABRE OTRA. La dañada es UNA prenda física con su daño, su foto, su lugar y, si
-- salió, su arreglo en curso: lo único que estaba mal era qué código se le puso. Cerrarla y abrir otra perdería eso y contaría dos
-- dañadas donde hubo una. Solo cambia `variante_id` y `movimiento_entrada_id`; la corrección queda dicha en sus columnas.
--
-- SOLO LO REPORTADO EN LA TIENDA. Se corrige si su movimiento de entrada es un traslado del piso o del almacén de la sede a su
-- cuarentena (`reportar_danada`, o una corrección anterior). Lo que llegó dañado de una devolución, un cambio o una recepción no
-- sale de ningún piso al que volver, y su prenda la fija el documento de origen: se rechaza con `danada_no_se_corrige`.
-- Solo entre tallas y colores del MISMO modelo: un modelo distinto no es un error de talla, es otra prenda.
--
-- ESTADOS QUE DEJAN DE SER POSIBLES (con la herramienta correcta a mano):
--   · corregir una dañada con «Ajustar stock» y crear una prenda que no existe (el caso de Trujillo);
--   · una corrección que mueve la equivocada y no la correcta, o al revés (una sola transacción);
--   · una corrección sobre algo apartado para un cliente (mira lo libre, con el candado de stock tomado);
--   · una corrección que se repite por un doble clic (marca con huella: el reintento devuelve lo hecho).
--
-- CÓMO SE PEGA EN PRODUCCIÓN: UNA sola parte, tal cual en el SQL Editor (trae `retail.` y su `search_path`), ANTES de publicar la web.
-- Si la web sale primero, la lista de Dañadas sigue en pie (lee sin las columnas nuevas ante un 42703) y solo «Me equivoqué de
-- prenda» falla al usarse. Sin políticas ni `drop trigger` (ADR-0195 no aplica). El `alter table` toma un candado breve sobre
-- `prendas_danadas` (lock_timeout 3 s: si no lo consigue falla sin daño y se vuelve a pegar). Idempotente.
-- Cómo se verifica después:
--   select pg_get_function_identity_arguments(oid) from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'corregir_prenda_danada';
--   (una fila: p_id uuid, p_variante_id uuid, p_desde text, p_token uuid)
--
-- SE ROMPE SI:
--   · `mover_interno` deja de recibir `p_token` (el reintento movería dos veces);
--   · una dañada de cantidad 3 tiene una sola prenda equivocada: la corrección mueve la fila ENTERA (las 3), como todas las salidas;
--     la pantalla lo dice antes de confirmar;
--   · alguien cambia `reportar_danada` para que entre a la cuarentena con otro tipo de movimiento: esta función dejaría de reconocer
--     lo reportado en la tienda y lo rechazaría (con su mensaje, sin mover nada).
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

do $guarda$
begin
  if to_regprocedure('retail.mover_interno(uuid, uuid, integer, uuid, uuid, text, uuid)') is null then
    raise exception 'Falta mover_interno con marca: pega antes 20260926200100.';
  end if;
  if to_regprocedure('retail.fn_intento_con_huella(text, uuid, text)') is null then
    raise exception 'Falta fn_intento_con_huella: pega antes 20261013200000.';
  end if;
  if to_regprocedure('retail.reportar_danada(uuid, uuid, integer, text, text, uuid, text)') is null then
    raise exception 'Falta reportar_danada con tipo de daño: pega antes 20261029024000.';
  end if;
end;
$guarda$;

-- ---------------------------------------------------------------------------
-- 1. La última corrección, dicha en la fila
-- ---------------------------------------------------------------------------
alter table retail.prendas_danadas add column if not exists corregida_de_variante_id uuid references retail.variantes (id);
alter table retail.prendas_danadas add column if not exists corregida_en timestamptz;
alter table retail.prendas_danadas add column if not exists corregida_por uuid references public.personas (id);

comment on column retail.prendas_danadas.corregida_de_variante_id is
  'ADR-0640: la prenda (talla o color) que decía la dañada antes de su última corrección con «Me equivoqué de prenda» (corregir_prenda_danada). Null si nunca se corrigió.';
comment on column retail.prendas_danadas.corregida_en is
  'ADR-0640: cuándo se corrigió por última vez la prenda de esta dañada. Va junto con corregida_de_variante_id y corregida_por.';
comment on column retail.prendas_danadas.corregida_por is
  'ADR-0640: quién corrigió la prenda de esta dañada (el responsable elegido, fn_actor_persona_id(true)).';

alter table retail.prendas_danadas drop constraint if exists prendas_danadas_correccion_coherente;
alter table retail.prendas_danadas add constraint prendas_danadas_correccion_coherente
  check (num_nonnulls(corregida_de_variante_id, corregida_en, corregida_por) in (0, 3));

-- ---------------------------------------------------------------------------
-- 2. Corregir la prenda de una dañada
-- ---------------------------------------------------------------------------
-- PROMETE: con la dañada 'en_cuarentena' `p_id` reportada en la tienda, devuelve su prenda (todas sus unidades) de la cuarentena al
--   lugar de donde salió y lleva la misma cantidad de `p_variante_id` (otra talla o color del mismo modelo) desde el piso o el almacén
--   (`p_desde`) a la cuarentena; la fila pasa a esa prenda con la corrección anotada. O no hace nada y dice por qué. Devuelve
--   {ya_registrada, id, movimiento_vuelta_id, movimiento_entrada_id, unidades}. La misma marca con los mismos datos devuelve lo hecho.
-- ASUME: quien llama ve Existencias, opera la sede y eligió quién lo hace. La correcta tiene lo libre suficiente en `p_desde`.
-- NO HACE: no cambia el daño, la foto, el lugar ni el arreglo en curso; no cuenta pérdida ni hallazgo; no toca dinero.
create or replace function retail.corregir_prenda_danada(p_id uuid, p_variante_id uuid, p_desde text, p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $fn$
declare
  pd prendas_danadas%rowtype;
  v_tipo_entrada text;
  v_origen_vieja uuid;
  v_destino_entrada uuid;
  v_tipo_origen text;
  v_cuarentena uuid;
  v_origen_nueva uuid;
  v_marca_vuelta uuid;
  v_marca_ida uuid;
  v_mov_vuelta uuid;
  v_mov_ida uuid;
  v_actor uuid;
  v_hay integer;
  v_apartadas integer;
  v_nota_vuelta text;
  v_lugar text := case p_desde when 'piso' then 'el piso' when 'almacen' then 'el almacén' end;
begin
  if p_token is null then
    raise exception 'Falta la marca de este intento. Cierra la ventana y vuelve a abrirla.' using hint = 'correccion_sin_token';
  end if;
  if not fn_ve_modulo('existencias') then
    raise exception 'No puedes corregir una prenda dañada: tu rol no tiene el módulo «Existencias». Pídele al líder que lo active.'
      using errcode = '42501', hint = 'correccion_sin_modulo';
  end if;
  if v_lugar is null then
    raise exception 'Di dónde está la prenda correcta: colgada en el piso o guardada en el almacén.' using hint = 'correccion_desde_invalido';
  end if;
  if p_variante_id is null then
    raise exception 'Elige cuál es la prenda dañada de verdad.' using hint = 'correccion_sin_prenda';
  end if;

  -- La fila, con candado: dos personas que corrigen o deciden la misma dañada a la vez se esperan.
  select * into pd from prendas_danadas where id = p_id for update;
  if not found then
    raise exception 'Esa prenda dañada ya no está en la lista. Recarga la pantalla.' using hint = 'correccion_no_existe';
  end if;
  if not fn_puede_operar_ubicacion(pd.ubicacion_id) then
    raise exception 'No puedes corregir una dañada de esa tienda: no es tu sede.' using hint = 'correccion_sin_tienda';
  end if;

  perform retail.fn_intento_con_huella('corregir_prenda_danada', p_token, md5(jsonb_build_array(p_id, p_variante_id, p_desde)::text));
  v_marca_vuelta := md5('corregir_prenda_danada_vuelta:' || p_token::text)::uuid;
  v_marca_ida := md5('corregir_prenda_danada_ida:' || p_token::text)::uuid;

  -- El reintento de ESTA corrección (la respuesta se perdió después de guardar) devuelve lo hecho, sin mover nada.
  if pd.variante_id = p_variante_id and exists (
    select 1 from movimientos_internos_intentos i where i.token_cliente = v_marca_ida and i.movimiento_id = pd.movimiento_entrada_id
  ) then
    return jsonb_build_object('ya_registrada', true, 'id', pd.id,
      'movimiento_vuelta_id', (select i.movimiento_id from movimientos_internos_intentos i where i.token_cliente = v_marca_vuelta),
      'movimiento_entrada_id', pd.movimiento_entrada_id, 'unidades', pd.cantidad);
  end if;

  if pd.estado <> 'en_cuarentena' then
    raise exception 'Esta prenda ya se resolvió: ya no se corrige. Recarga la pantalla.' using hint = 'correccion_ya_resuelta';
  end if;
  if pd.variante_id = p_variante_id then
    raise exception 'Es la misma prenda que ya dice la dañada: elige la talla o el color correcto.' using hint = 'correccion_misma_prenda';
  end if;

  -- ¿Se reportó en la tienda? Su entrada es un traslado del piso o del almacén de la sede a su cuarentena.
  for v_tipo_entrada, v_origen_vieja, v_destino_entrada in
    select m.tipo, m.sububicacion_id, m.sububicacion_destino_id from movimientos m where m.id = pd.movimiento_entrada_id
  loop
    exit;
  end loop;
  v_cuarentena := (select s.id from sububicaciones s where s.ubicacion_id = pd.ubicacion_id and s.tipo = 'cuarentena');
  v_tipo_origen := (select s.tipo from sububicaciones s where s.id = v_origen_vieja and s.ubicacion_id = pd.ubicacion_id);
  if v_tipo_entrada is distinct from 'traslado' or v_destino_entrada is distinct from v_cuarentena
     or v_tipo_origen is null or v_tipo_origen not in ('piso_venta', 'almacen_tienda') then
    raise exception 'Esta dañada no se reportó en la tienda (llegó de una devolución, un cambio o una recepción): su prenda la fija ese documento y no se corrige aquí.'
      using hint = 'danada_no_se_corrige';
  end if;

  if not exists (
    select 1 from variantes n join variantes v on v.producto_id = n.producto_id
     where n.id = p_variante_id and v.id = pd.variante_id
  ) then
    raise exception 'Solo se corrige a otra talla o color del mismo modelo. Si es otra prenda, márcala «No estaba dañada» y reporta la correcta.'
      using hint = 'correccion_otro_modelo';
  end if;

  v_origen_nueva := (select s.id from sububicaciones s
                      where s.ubicacion_id = pd.ubicacion_id
                        and s.tipo = case p_desde when 'piso' then 'piso_venta' else 'almacen_tienda' end);
  if v_origen_nueva is null then
    raise exception 'Esta sede no separa piso y almacén: aquí no se corrigen dañadas.' using hint = 'correccion_sede_sin_lugar';
  end if;

  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación.' using hint = 'responsable_requerido';
  end if;

  -- Candado: el stock de las DOS prendas en la sede, en orden (ADR-0190). Con él tomado, lo libre de la correcta no cambia.
  perform fn_bloquear_en_orden(pd.ubicacion_id, array[pd.variante_id, p_variante_id]);
  v_hay := coalesce((select s.cantidad from stock s
                      where s.variante_id = p_variante_id and s.ubicacion_id = pd.ubicacion_id and s.sububicacion_id = v_origen_nueva), 0);
  v_apartadas := coalesce((select s.cantidad_apartada from stock s
                            where s.variante_id = p_variante_id and s.ubicacion_id = pd.ubicacion_id and s.sububicacion_id = v_origen_nueva), 0);
  if v_hay - v_apartadas < pd.cantidad then
    raise exception '%',
      'No se corrigió nada. ' || coalesce(fn_prenda_corta(p_variante_id), 'Esa prenda') || ': la dañada es de ' || pd.cantidad
      || case when pd.cantidad = 1 then ' unidad' else ' unidades' end || ' y en ' || v_lugar || ' hay '
      || greatest(v_hay - v_apartadas, 0) || ' libre' || case when greatest(v_hay - v_apartadas, 0) = 1 then '' else 's' end
      || case when v_apartadas > 0 then ' (lo apartado para clientes no cuenta)' else '' end
      || '. Revisa si está en ' || case p_desde when 'piso' then 'el almacén' else 'el piso' end || '.'
      using hint = 'correccion_sin_alcance',
            detail = jsonb_build_object('variante_id', p_variante_id, 'desde', p_desde, 'pide', pd.cantidad,
                                        'hay', greatest(v_hay - v_apartadas, 0), 'apartadas', v_apartadas)::text;
  end if;

  -- 1) La equivocada vuelve a donde estaba. 2) La correcta pasa a la cuarentena con el daño de siempre.
  v_nota_vuelta := left('Reportada por error: la dañada es ' || coalesce(fn_prenda_corta(p_variante_id), 'otra prenda'), 200);
  v_mov_vuelta := mover_interno(pd.ubicacion_id, pd.variante_id, pd.cantidad, v_cuarentena, v_origen_vieja, v_nota_vuelta, v_marca_vuelta);
  v_mov_ida := mover_interno(pd.ubicacion_id, p_variante_id, pd.cantidad, v_origen_nueva, v_cuarentena, pd.motivo_reporte, v_marca_ida);

  update prendas_danadas
     set corregida_de_variante_id = variante_id, corregida_en = now(), corregida_por = v_actor,
         variante_id = p_variante_id, movimiento_entrada_id = v_mov_ida
   where id = p_id;

  return jsonb_build_object('ya_registrada', false, 'id', p_id, 'movimiento_vuelta_id', v_mov_vuelta,
                            'movimiento_entrada_id', v_mov_ida, 'unidades', pd.cantidad);
end;
$fn$;

comment on function retail.corregir_prenda_danada(uuid, uuid, text, uuid) is
  'ADR-0640: «Me equivoqué de prenda». En una dañada en cuarentena reportada en la tienda, devuelve su prenda al lugar de donde salió y lleva la misma cantidad de otra talla o color del MISMO modelo (p_variante_id) desde el piso o el almacén (p_desde) a la cuarentena, con dos traslados internos (mover_interno: no es pérdida ni ajuste). La fila pasa a la prenda correcta y anota la corrección (corregida_de_variante_id, corregida_en, corregida_por). Todo o nada; mira lo libre. Quien ve Existencias y opera la sede; firma el responsable. p_token obligatorio: el reintento con los mismos datos devuelve ya_registrada.';

revoke all on function retail.corregir_prenda_danada(uuid, uuid, text, uuid) from public, anon;
grant execute on function retail.corregir_prenda_danada(uuid, uuid, text, uuid) to authenticated;

notify pgrst, 'reload schema';
