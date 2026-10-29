-- ============================================================================
-- 20261029033000_danadas_se_arreglo_o_no_se_pudo.sql — CAYLA V2 · ADR-0564, actividad 5 (Felipe, 2026-10-28)
-- Dañadas: cuando la prenda vuelve de arreglarse, «Se arregló» elige si vuelve al PISO o al ALMACÉN (con el costo si lo hubo), o «No se pudo».
--
-- EL PROBLEMA PRIMERO. «Se arregló» devolvía SIEMPRE la prenda al almacén (ADR-0328 act. 10): para venderla había que hacer otro paso, «Bajar
-- al piso». Con la tienda abierta y la prenda ya arreglada en la mano, ese segundo paso se olvida y la prenda queda guardada. Además no había
-- cómo decir que la prenda volvió SIN arreglarse: una costurera que no pudo con la mancha la devolvía y quedaba «en arreglo» para siempre. Y el
-- dinero de un arreglo externo no se anotaba en ningún lado.
--
-- DECISIONES DE FELIPE (2026-10-28 y 2026-10-29, ADR-0564): (1) quien decide elige si vuelve al piso o al almacén; (2) el costo es OPCIONAL (no
-- siempre se cobra) y, cuando lo hay, SÍ genera su gasto en Finanzas (2026-10-29): se registra con `registrar_gasto`, la misma puerta de Caja ▸ Gasto,
-- en la categoría «Mantenimiento y reparaciones» y pagado del cajón, con Yape o con Plin; (3) «No se pudo» devuelve la prenda a la cuarentena
-- de la tienda para decidir su destino con las salidas de siempre (liquidar, botar, donar, devolver al proveedor).
--
-- QUÉ HACE.
--   1. `prendas_danadas` gana `arreglo_costo`, `arreglo_gasto_id` (el gasto de Finanzas que nació de ese costo), `arreglo_volvio_en`,
--      `arreglo_resultado` ('arreglada' | 'no_se_pudo') y `arreglo_no_se_pudo_motivo`. CHECK: el costo solo existe en una prenda arreglada y no es
--      negativo; «volvió» exige que haya salido.
--   2. `arreglar_prenda_danada` gana `p_destino text default 'almacen'` ('almacen' | 'piso') y `p_costo numeric default null`. Con 'piso' hace DOS
--      traslados internos en la misma transacción (cuarentena→almacén y almacén→piso, cada uno con su marca): el segundo es una bajada de
--      verdad, el mismo par de lugares que «Bajar al piso», así que Frescura cuenta la edad desde ese momento. Con un costo mayor que cero pide
--      `p_medio_pago` (efectivo, yape o plin) y registra el gasto en la MISMA transacción con `registrar_gasto` (todo o nada: si la caja está
--      cerrada o la cuenta no puede registrar gastos, no se arregla nada y lo dice). Sin los tres parámetros (una web vieja) se comporta como
--      siempre. Se borra la firma de 3 parámetros antes de crear la de 6, en la misma transacción.
--   3. `no_se_pudo_arreglar(p_id, p_motivo)`: la prenda volvió sin arreglarse; sigue en cuarentena, ya no «en arreglo», con el motivo.
--   4. `sacar_danada_a_arreglar` (20261029032000) se redefine para que una prenda que volvió «sin arreglo» pueda volver a salir.
--
-- ESTADOS QUE DEJAN DE SER POSIBLES:
--   · un costo en una prenda que no se arregló, o negativo (CHECK); un costo sin cómo se pagó (la función lo rechaza); un destino que no es piso
--     ni almacén (la función lo rechaza);
--   · una prenda que «volvió» sin haber salido (CHECK).
--
-- CÓMO SE PEGA EN PRODUCCIÓN: UNA sola parte, tal cual en el SQL Editor (trae `retail.` y su `search_path`), DESPUÉS de 20261029032000 y ANTES de
-- publicar la web. Si la web sale primero, «Se arregló» sigue funcionando (llama con 3 parámetros) pero sin elegir destino ni costo.
-- Sin políticas ni `drop trigger` (ADR-0195 no aplica). El `alter table` toma un candado breve sobre `prendas_danadas` (lock_timeout 3 s:
-- si no lo consigue falla sin daño y se vuelve a pegar). Idempotente.
-- Cómo se verifica después:
--   select pg_get_function_identity_arguments(oid) from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'arreglar_prenda_danada';
--   (debe devolver UNA fila, con p_destino, p_costo y p_medio_pago al final)
--
-- SE ROMPE SI: alguien vuelve a pegar 20261005140000_danadas_reportar_y_se_arreglo.sql (recrea la firma de 3 parámetros al lado de esta: las
-- llamadas de 3 dejan de ser únicas). Si pasa: `drop function retail.arreglar_prenda_danada(uuid, text, uuid);`. Y un parche anclado futuro a esta
-- función debe apuntar a la firma de 6 parámetros.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

alter table retail.prendas_danadas add column if not exists arreglo_costo numeric(10, 2);
alter table retail.prendas_danadas add column if not exists arreglo_gasto_id uuid references retail.gastos (id);
alter table retail.prendas_danadas add column if not exists arreglo_volvio_en timestamptz;
alter table retail.prendas_danadas add column if not exists arreglo_resultado text;
alter table retail.prendas_danadas add column if not exists arreglo_no_se_pudo_motivo text;

comment on column retail.prendas_danadas.arreglo_costo is
  'ADR-0564: lo que costó arreglar la prenda, si se anotó (opcional: a veces no se cobra). Con un costo mayor que cero, arreglar_prenda_danada registra su gasto en Finanzas (arreglo_gasto_id).';
comment on column retail.prendas_danadas.arreglo_gasto_id is
  'ADR-0564: el gasto de Finanzas (retail.gastos) que nació del costo del arreglo. Null si no hubo costo o la prenda es de antes.';
comment on column retail.prendas_danadas.arreglo_volvio_en is
  'ADR-0564: cuándo volvió de arreglarse (Se arregló o No se pudo). Null mientras sigue fuera, o si nunca salió.';
comment on column retail.prendas_danadas.arreglo_resultado is
  'ADR-0564: cómo terminó el arreglo: arreglada (Se arregló) o no_se_pudo (volvió sin arreglarse). Null en lo de antes y en lo que aún no vuelve.';

alter table retail.prendas_danadas drop constraint if exists prendas_danadas_arreglo_resultado_valido;
alter table retail.prendas_danadas add constraint prendas_danadas_arreglo_resultado_valido
  check (arreglo_resultado is null or arreglo_resultado in ('arreglada', 'no_se_pudo'));

alter table retail.prendas_danadas drop constraint if exists prendas_danadas_arreglo_costo_valido;
alter table retail.prendas_danadas add constraint prendas_danadas_arreglo_costo_valido
  check (arreglo_costo is null or (arreglo_costo >= 0 and coalesce(arreglo_resultado, '') = 'arreglada'));

alter table retail.prendas_danadas drop constraint if exists prendas_danadas_arreglo_volvio_exige_salida;
alter table retail.prendas_danadas add constraint prendas_danadas_arreglo_volvio_exige_salida
  check (arreglo_volvio_en is null or en_arreglo_desde is not null);

alter table retail.prendas_danadas drop constraint if exists prendas_danadas_arreglo_motivo_valido;
alter table retail.prendas_danadas add constraint prendas_danadas_arreglo_motivo_valido
  check (arreglo_no_se_pudo_motivo is null or (coalesce(arreglo_resultado, '') = 'no_se_pudo' and char_length(btrim(arreglo_no_se_pudo_motivo)) between 3 and 200));

-- ---------------------------------------------------------------------------
-- «Se arregló» con destino y costo (una sola firma: se borra la de 3 parámetros)
-- ---------------------------------------------------------------------------
drop function if exists retail.arreglar_prenda_danada(uuid, text, uuid);
drop function if exists retail.arreglar_prenda_danada(uuid, text, uuid, text, numeric);

create or replace function retail.arreglar_prenda_danada(p_id uuid, p_nota text, p_token uuid, p_destino text default 'almacen', p_costo numeric default null, p_medio_pago text default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'retail', 'public', 'extensions'
as $function$
declare
  pd prendas_danadas%rowtype;
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  v_cuarentena uuid;
  v_almacen uuid;
  v_piso uuid;
  v_marca uuid;
  v_marca_piso uuid;
  v_caja uuid;
  v_gasto uuid;
  v_costo numeric := nullif(p_costo, 0);
  v_medio text := nullif(btrim(coalesce(p_medio_pago, '')), '');
  v_mov uuid;
  v_destino text := coalesce(nullif(btrim(p_destino), ''), 'almacen');
  v_actor uuid;
begin
  if p_token is null then
    raise exception 'Falta la marca de este intento. Cierra la ventana y vuelve a abrirla.' using hint = 'arreglo_sin_token';
  end if;
  -- Devolver a la venta una prenda arreglada lo hace quien ve Existencias (Felipe 2026-10-09); liquidar, botar y donar siguen del líder.
  if not fn_ve_modulo('existencias') then
    raise exception 'Para devolver a la venta una prenda arreglada necesitas el módulo Existencias.' using hint = 'arreglo_sin_modulo';
  end if;
  if v_nota is null or char_length(v_nota) < 3 then
    raise exception 'Escribe qué se arregló (al menos 3 letras): la prenda vuelve a la venta y tiene que quedar dicho.'
      using hint = 'arreglo_sin_nota';
  end if;
  if char_length(v_nota) > 200 then
    raise exception 'Lo que se arregló admite hasta 200 caracteres.' using hint = 'arreglo_nota_larga';
  end if;
  -- ADR-0564: a dónde vuelve la prenda arreglada (el líder elige) y, si la hubo, lo que costó. Sin ellos (una web vieja) es como siempre:
  -- al almacén y sin costo.
  if v_destino not in ('almacen', 'piso') then
    raise exception 'Elige a dónde vuelve la prenda: al almacén o al piso.' using hint = 'arreglo_destino_invalido';
  end if;
  if p_costo is not null and (p_costo < 0 or p_costo > 99999.99) then
    raise exception 'El costo del arreglo debe estar entre 0 y 99,999.99 soles, o déjalo vacío.' using hint = 'arreglo_costo_invalido';
  end if;
  -- Un costo es plata que salió: su gasto en Finanzas (la misma puerta de Caja ▸ Gasto) pide cómo se pagó. Sin costo, no hay gasto ni medio.
  if v_costo is not null and (v_medio is null or v_medio not in ('efectivo', 'yape', 'plin')) then
    raise exception 'Di cómo se pagó el arreglo: del cajón, con Yape o con Plin.' using hint = 'arreglo_pago_invalido';
  end if;

  -- La fila, con candado: dos líderes que deciden a la vez la misma prenda se esperan, y el segundo ve la decisión del primero.
  select * into pd from prendas_danadas where id = p_id for update;
  if not found then
    raise exception 'Esa prenda dañada ya no está en la lista. Recarga la pantalla.' using hint = 'arreglo_no_existe';
  end if;

  -- El token sigue al contenido: el mismo token con OTRA dañada se rechaza (antes daba por arregladas dos con un solo movimiento) (token_reusado).
  perform retail.fn_intento_con_huella('arreglar_prenda_danada', p_token, md5(jsonb_build_array(p_id, p_nota, v_destino, p_costo, v_medio)::text));
  v_marca := md5('arreglar_prenda_danada:' || p_token::text)::uuid;
  v_marca_piso := md5('arreglar_prenda_danada_piso:' || p_token::text)::uuid;
  if pd.estado <> 'en_cuarentena' then
    -- El reintento de ESTE mismo arreglo (la respuesta se perdió después de guardar) devuelve lo hecho, sin error.
    if pd.estado = 'se_arreglo' and exists (
      select 1 from movimientos_internos_intentos i where i.token_cliente = v_marca and i.movimiento_id = pd.movimiento_salida_id
    ) then
      return jsonb_build_object('ya_registrada', true, 'id', pd.id, 'movimiento_id', pd.movimiento_salida_id, 'unidades', pd.cantidad, 'destino', v_destino);
    end if;
    raise exception 'Esta prenda ya se resolvió como «%». Recarga la pantalla.',
      case pd.estado when 'se_arreglo' then 'Se arregló' when 'liquidada' then 'Liquidada' when 'se_boto' then 'Se botó'
                     when 'donada' then 'Donada' when 'devuelta_proveedor' then 'Devuelta al proveedor' else pd.estado end
      using hint = 'arreglo_ya_resuelta';
  end if;

  v_cuarentena := (select s.id from sububicaciones s where s.ubicacion_id = pd.ubicacion_id and s.tipo = 'cuarentena');
  v_almacen := (select s.id from sububicaciones s where s.ubicacion_id = pd.ubicacion_id and s.tipo = 'almacen_tienda');
  if v_cuarentena is null or v_almacen is null then
    raise exception 'Esta sede no tiene almacén de tienda: la prenda arreglada no tiene a dónde volver.' using hint = 'arreglo_sede_sin_almacen';
  end if;
  v_piso := (select s.id from sububicaciones s where s.ubicacion_id = pd.ubicacion_id and s.tipo = 'piso_venta');
  if v_destino = 'piso' and v_piso is null then
    raise exception 'Esta sede no tiene piso de venta: la prenda arreglada no puede volver al piso.' using hint = 'arreglo_sede_sin_piso';
  end if;

  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación.' using hint = 'responsable_requerido';
  end if;

  -- Cuarentena → almacén de la MISMA sede: un traslado interno (no es pérdida ni bajada). Su nota es lo que se arregló.
  -- El gasto de Finanzas, antes de mover nada: si no se puede registrar (caja cerrada, sin permiso), no se mueve ni se anota nada.
  if v_costo is not null then
    v_caja := (select k.id from cajas k where k.ubicacion_id = pd.ubicacion_id and k.estado = 'abierta' limit 1);
    if v_medio = 'efectivo' and v_caja is null then
      raise exception 'La caja de esta tienda está cerrada: ábrela, o paga el arreglo con Yape o con Plin.' using hint = 'arreglo_caja_cerrada';
    end if;
    begin
      v_gasto := retail.registrar_gasto(
        p_ubicacion_id => pd.ubicacion_id,
        p_categoria => 'mantenimiento',
        p_descripcion => 'Arreglo de prenda — ' || coalesce(fn_prenda_corta(pd.variante_id), 'una prenda') || ' · ' || v_nota,
        p_fecha => retail.fn_hoy_lima(),
        p_monto_total => v_costo,
        p_comprobante => null,
        p_medio_pago => v_medio,
        p_caja_id => case when v_medio = 'efectivo' then v_caja end,
        p_caja_movimiento_id => null,
        p_referencia => null,
        p_token => md5('arreglo_gasto:' || p_token::text)::uuid,
        p_gasto_fijo_id => null,
        p_cuenta_id => null
      );
    exception when insufficient_privilege then
      raise exception 'Para anotar lo que costó el arreglo hace falta quien maneja la caja o tiene el módulo Gastos. Deja el costo vacío y anótalo después en Caja ▸ Gasto.'
        using errcode = '42501', hint = 'arreglo_gasto_sin_permiso';
    end;
  end if;

  v_mov := mover_interno(pd.ubicacion_id, pd.variante_id, pd.cantidad, v_cuarentena, v_almacen, v_nota, v_marca);
  -- Al piso (ADR-0564): lo que sigue es una bajada de verdad, almacén → piso en la misma transacción, con su propia marca. Es el MISMO par de
  -- lugares que «Bajar al piso», así que Frescura cuenta la edad de la prenda desde este momento y no como una prenda vieja. `movimiento_salida_id`
  -- sigue siendo la salida de la cuarentena: es el que reconoce el reintento.
  if v_destino = 'piso' then
    perform mover_interno(pd.ubicacion_id, pd.variante_id, pd.cantidad, v_almacen, v_piso, v_nota, v_marca_piso);
  end if;

  update prendas_danadas
     set estado = 'se_arreglo', movimiento_salida_id = v_mov, resuelto_por = v_actor, resuelto_en = now(), nota = v_nota,
         arreglo_costo = p_costo, arreglo_gasto_id = v_gasto, arreglo_resultado = 'arreglada',
         arreglo_volvio_en = case when en_arreglo_desde is not null then now() end
   where id = p_id;

  return jsonb_build_object('ya_registrada', false, 'id', p_id, 'movimiento_id', v_mov, 'unidades', pd.cantidad, 'destino', v_destino);
end;
$function$;

comment on function retail.arreglar_prenda_danada(uuid, text, uuid, text, numeric, text) is
  'ADR-0328 act. 10 + ADR-0564: «Se arregló». Saca de la cuarentena todas las unidades de la dañada y las deja en el ALMACÉN de su sede (p_destino = almacen, de fábrica) o, con p_destino = piso, también las baja al piso en la misma transacción (dos traslados internos con mover_interno: no es pérdida, y la segunda es una bajada de verdad para Frescura). Nota obligatoria de qué se arregló; p_costo (opcional) pide p_medio_pago (efectivo, yape o plin) y registra su gasto en Finanzas con registrar_gasto, todo o nada. Quien ve Existencias; firma el responsable. p_token obligatorio: el reintento con los mismos datos devuelve ya_registrada.';

revoke all on function retail.arreglar_prenda_danada(uuid, text, uuid, text, numeric, text) from public, anon;
grant execute on function retail.arreglar_prenda_danada(uuid, text, uuid, text, numeric, text) to authenticated;

-- ---------------------------------------------------------------------------
-- «No se pudo»: volvió sin arreglarse
-- ---------------------------------------------------------------------------
create or replace function retail.no_se_pudo_arreglar(p_id uuid, p_motivo text default null)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $fn$
declare
  pd prendas_danadas%rowtype;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_actor uuid;
begin
  if not fn_ve_modulo('existencias') then
    raise exception 'No puedes marcar el resultado de un arreglo: tu rol no tiene el módulo «Existencias». Pídele al líder que lo active.'
      using errcode = '42501', hint = 'arreglo_sin_modulo';
  end if;
  if v_motivo is not null and (char_length(v_motivo) < 3 or char_length(v_motivo) > 200) then
    raise exception 'El motivo debe tener entre 3 y 200 letras, o déjalo vacío.' using hint = 'arreglo_nota_invalida';
  end if;

  select * into pd from prendas_danadas where id = p_id for update;
  if not found then
    raise exception 'Esa prenda dañada ya no está en la lista. Recarga la pantalla.' using hint = 'arreglo_no_existe';
  end if;
  if not fn_puede_operar_ubicacion(pd.ubicacion_id) then
    raise exception 'No puedes marcar el resultado de un arreglo en esa tienda: no es tu sede.' using hint = 'arreglo_sin_tienda';
  end if;
  if pd.estado <> 'en_cuarentena' then
    raise exception 'Esta prenda ya se resolvió. Recarga la pantalla.' using hint = 'arreglo_ya_resuelta';
  end if;
  if pd.en_arreglo_desde is null then
    raise exception 'Esta prenda no salió a arreglar: primero anota su salida.' using hint = 'arreglo_no_esta_fuera';
  end if;
  if pd.arreglo_volvio_en is not null then
    -- Un doble toque o un reintento tras un corte de red: lo mismo, sin cambiar nada.
    if pd.arreglo_resultado = 'no_se_pudo' then
      return jsonb_build_object('ya_registrada', true, 'id', pd.id);
    end if;
    raise exception 'Esta prenda ya volvió de arreglarse. Recarga la pantalla.' using hint = 'arreglo_ya_volvio';
  end if;

  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación.' using hint = 'responsable_requerido';
  end if;

  update prendas_danadas
     set arreglo_volvio_en = now(), arreglo_resultado = 'no_se_pudo', arreglo_no_se_pudo_motivo = v_motivo
   where id = p_id;

  return jsonb_build_object('ya_registrada', false, 'id', p_id);
end;
$fn$;

comment on function retail.no_se_pudo_arreglar(uuid, text) is
  'ADR-0564: la prenda que salió a arreglarse volvió SIN arreglarse. Sigue en la cuarentena de la tienda (ya no «en arreglo») para decidir su destino con las salidas de siempre. Motivo opcional. Quien ve Existencias y opera la sede; firma el responsable. Repetirlo devuelve ya_registrada.';

revoke all on function retail.no_se_pudo_arreglar(uuid, text) from public, anon;
grant execute on function retail.no_se_pudo_arreglar(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- «Salió a arreglar» otra vez: una prenda que volvió sin arreglo puede volver a salir
-- ---------------------------------------------------------------------------
create or replace function retail.sacar_danada_a_arreglar(p_id uuid, p_ruta text, p_nota text default null)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $fn$
declare
  pd prendas_danadas%rowtype;
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  v_actor uuid;
begin
  if not fn_ve_modulo('existencias') then
    raise exception 'No puedes sacar prendas a arreglar: tu rol no tiene el módulo «Existencias». Pídele al líder que lo active.'
      using errcode = '42501', hint = 'arreglo_sin_modulo';
  end if;
  if p_ruta is null or p_ruta not in ('cerca', 'taller') then
    raise exception 'Elige quién la arregla: cerca de la tienda o el Taller de CAYLA.' using hint = 'arreglo_ruta_invalida';
  end if;
  if v_nota is not null and (char_length(v_nota) < 3 or char_length(v_nota) > 200) then
    raise exception 'La nota debe tener entre 3 y 200 letras, o déjala vacía.' using hint = 'arreglo_nota_invalida';
  end if;

  -- La fila, con candado: dos personas que la sacan a la vez se esperan, y la segunda ve la salida de la primera.
  select * into pd from prendas_danadas where id = p_id for update;
  if not found then
    raise exception 'Esa prenda dañada ya no está en la lista. Recarga la pantalla.' using hint = 'arreglo_no_existe';
  end if;
  if not fn_puede_operar_ubicacion(pd.ubicacion_id) then
    raise exception 'No puedes sacar a arreglar una prenda de esa tienda: no es tu sede.' using hint = 'arreglo_sin_tienda';
  end if;
  if pd.estado <> 'en_cuarentena' then
    raise exception 'Esta prenda ya se resolvió. Recarga la pantalla.' using hint = 'arreglo_ya_resuelta';
  end if;
  if pd.en_arreglo_desde is not null and pd.arreglo_volvio_en is null then
    -- Un doble toque o un reintento tras un corte de red: lo mismo, sin cambiar nada. Otra ruta es otra decisión.
    if pd.ruta_arreglo = p_ruta then
      return jsonb_build_object('ya_registrada', true, 'id', pd.id, 'ruta', pd.ruta_arreglo);
    end if;
    raise exception 'Esta prenda ya salió a arreglar (%). Si cambió de manos, avísale al líder.',
      case pd.ruta_arreglo when 'taller' then 'al Taller de CAYLA' else 'cerca de la tienda' end
      using hint = 'arreglo_ya_en_arreglo';
  end if;

  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación.' using hint = 'responsable_requerido';
  end if;

  -- Una prenda que volvió «sin arreglo» y sale de nuevo empieza otra vuelta limpia.
  update prendas_danadas
     set en_arreglo_desde = now(), ruta_arreglo = p_ruta, sacada_por = v_actor, nota_arreglo = v_nota,
         arreglo_volvio_en = null, arreglo_resultado = null, arreglo_no_se_pudo_motivo = null
   where id = p_id;

  return jsonb_build_object('ya_registrada', false, 'id', p_id, 'ruta', p_ruta);
end;
$fn$;

notify pgrst, 'reload schema';
