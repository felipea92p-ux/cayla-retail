-- ============================================================================
-- 20261005110000_danadas_reportar_y_se_arreglo.sql — CAYLA V2 · ADR-0328, actividad 10 (Felipe, 2026-10-04)
-- Dañadas: una prenda manchada se REPORTA desde Existencias y, si el arreglo es menor, «Se arregló» la devuelve al almacén.
--
-- EL PROBLEMA PRIMERO. La cuarentena (sububicación 'cuarentena' + `prendas_danadas`, ADR-0071) solo aceptaba prendas que
-- llegaban de una devolución o de un cambio: el candado `prendas_danadas_un_origen` exigía `devolucion_item_id` o
-- `cambio_id`. Una mancha descubierta en el perchero no tenía puerta: terminaba como ajuste «Merma» (se perdía una prenda
-- que quizá se arreglaba con un botón) o, peor, se quedaba colgada y la caja la cobraba. Y la salida que Cambios promete
-- («un líder decide si se repara…», `CambioReemplazo.tsx`) no existía: de la cuarentena solo se salía liquidada, botada,
-- donada o devuelta al proveedor. Una prenda que se arreglaba no tenía cómo volver a la venta sin un ajuste a mano.
--
-- DECISIÓN DE FELIPE (ADR-0328, «Dañadas»): un arreglo menor (un botón descosido) se reporta y puede volver a la venta; el
-- daño mayor sigue con las salidas de ADR-0071. Y (ADR-0328, tarde) «Se dañó» va a Dañadas.
--
-- QUÉ HACE (el contrato de cada función, en su comentario):
--   1. `prendas_danadas` gana un TERCER origen: `motivo_reporte` (qué tiene la prenda, escrito por quien la reportó). El
--      candado `prendas_danadas_un_origen` pasa a exigir exactamente uno de devolución, cambio o reporte; el reporte es su
--      propio documento (no hay otra tabla que lo diga). Quién lo reportó y desde dónde (piso o almacén) NO se repiten
--      aquí: los dice el movimiento de entrada (`usuario_id`, `sububicacion_id`).
--   2. Un cuarto desenlace no-pérdida, `se_arreglo`, con nota obligatoria (qué se arregló): la prenda vuelve a la venta y
--      debe quedar dicho por qué. Lo exige la base (`prendas_danadas_arreglo_con_nota`), no solo la pantalla.
--   3. Un movimiento de entrada, una sola dañada (`prendas_danadas_movimiento_entrada_unico`): es el candado que hace
--      imposible que un reintento cree dos dañadas para un mismo traslado a la cuarentena.
--   4. `reportar_danada(sede, prenda, cantidad, 'piso'|'almacen', motivo, marca)`: mueve lo LIBRE (sin lo apartado para un
--      cliente) a la cuarentena de la sede y abre su fila en `prendas_danadas`, todo o nada. Esas unidades dejan de contar
--      para la venta (salen del piso; desde la cuarentena no se vende, 20260924093700). Quien ve Existencias y opera la sede.
--   5. `arreglar_prenda_danada(dañada, nota, marca)`: «Se arregló»: vuelve al ALMACÉN de la sede (no al piso: pasa por
--      «Bajar al piso» y Frescura le da reloj desde esa bajada). Solo el líder (`fn_es_lider()` a la vista).
--
-- POR QUÉ UN TRASLADO INTERNO Y NO SALIDA + ENTRADA. Las dos operaciones son un `mover_interno` (tipo 'traslado', misma
-- sede): la prenda no sale de CAYLA, cambia de lugar dentro de la tienda. Así (a) la definición única de pérdida
-- (actividad 14, PR #784, `fn_perdida_razon`) no la cuenta nunca: reportar dañada no es perder, y botar o donar sí lo es
-- allá, en `resolver_prenda_danada`; con una salida 'reporte' la habría contado como pérdida «a mano»; (b) Frescura y
-- Movimientos la leen por su par de lugares sin cambios (piso→cuarentena no es retiro; cuarentena→almacén no es bajada,
-- 20260928120200); (c) Actividad ya dice «pasó a cuarentena» (20261002233000); (d) la marca de reintento es la de
-- `mover_interno` (`movimientos_internos_intentos`), sin tabla nueva.
--
-- ESTADOS QUE DEJAN DE SER POSIBLES:
--   · una prenda reportada que sigue contando para la venta (se reporta = sale del piso o del almacén en la misma
--     transacción). El stock se cuenta por código, no por prenda: que la manchada salga del perchero lo pide la pantalla;
--   · una fila de `prendas_danadas` sin origen o con dos (devolución, cambio y reporte se excluyen por CHECK);
--   · una prenda que «se arregló» sin decir qué se le hizo (CHECK);
--   · dos dañadas abiertas por el mismo movimiento de entrada (índice único), aunque la pantalla reenvíe;
--   · reportar lo apartado para un cliente (el motor y esta función miran lo libre, con el candado de stock tomado).
--
-- CÓMO SE PEGA EN PRODUCCIÓN: UNA sola parte, tal cual en el SQL Editor (trae `retail.` y su `search_path`), ANTES de
-- publicar la web (la lista de Dañadas lee `motivo_reporte`: sin la columna, esa lista falla). Sin políticas ni
-- `drop trigger`: ADR-0195 no aplica. El `alter table prendas_danadas` toma un candado breve sobre una tabla de ~0 filas
-- (lock_timeout 3 s: si no lo consigue, falla sin daño y se vuelve a pegar). Idempotente: pegada dos veces deja lo mismo.
-- Sonda de solo lectura ANTES de pegar (debe devolver 0 filas; si no, la guarda de abajo aborta y dice por qué):
--   select movimiento_entrada_id, count(*) from retail.prendas_danadas group by 1 having count(*) > 1;
-- Cómo se verifica después:
--   select proname, pg_get_function_identity_arguments(oid) from pg_proc
--    where pronamespace = 'retail'::regnamespace and proname in ('reportar_danada', 'arreglar_prenda_danada');
--   select conname from pg_constraint where conrelid = 'retail.prendas_danadas'::regclass and conname like 'prendas_danadas_%';
--
-- SE ROMPE SI:
--   · alguien vuelve a pegar 20260918070000 (recrea `prendas_danadas_estado_check` sin 'se_arreglo': falla si ya hay una
--     arreglada, y si no la hay, «Se arregló» deja de poder guardarse) o 20260919000100 (no: su candado de origen se crea
--     solo «si no existe», y este lo deja con el mismo nombre);
--   · `mover_interno` deja de recibir `p_token` o cambia su huella (el reintento movería dos veces; la prueba
--     `pruebas:danadas-reportar-arreglar` lo detecta);
--   · una sede tienda nace sin sububicación 'cuarentena' (hoy la crea `seed.sql` y `activacion-cuarentena-produccion.sql`):
--     reportar ahí dice «esta sede no tiene cuarentena» y la pantalla no ofrece el botón;
--   · una prenda reportada en cantidad 3 tiene daños distintos: la fila es una sola y se resuelve entera (como una
--     devolución de 3); la pantalla pide reportar por separado lo que se decidirá distinto.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- ---------------------------------------------------------------------------
-- 0. Guardas: lo que esta migración da por hecho
-- ---------------------------------------------------------------------------
do $guarda$
begin
  if to_regclass('retail.prendas_danadas') is null then
    raise exception 'Falta la cuarentena: pega antes 20260917095000_cuarentena_prendas_danadas.sql y sus siguientes.';
  end if;
  if to_regprocedure('retail.mover_interno(uuid, uuid, integer, uuid, uuid, text, uuid)') is null
     or to_regclass('retail.movimientos_internos_intentos') is null then
    raise exception 'Falta la marca de mover_interno: pega antes 20260926200000 y 20260926200100.';
  end if;
  if to_regprocedure('retail.fn_actor_persona_id(boolean)') is null then
    raise exception 'Falta fn_actor_persona_id: pega antes 20260923100000_actor_firma_las_operaciones.sql.';
  end if;
  if exists (select 1 from retail.prendas_danadas group by movimiento_entrada_id having count(*) > 1) then
    raise exception 'Hay dos dañadas con el mismo movimiento de entrada: no se puede crear el candado prendas_danadas_movimiento_entrada_unico. Revisa esas filas antes de pegar (sonda en la cabecera).';
  end if;
end;
$guarda$;

-- ---------------------------------------------------------------------------
-- 1. El tercer origen: el reporte desde la tienda
-- ---------------------------------------------------------------------------
alter table retail.prendas_danadas add column if not exists motivo_reporte text;

comment on column retail.prendas_danadas.motivo_reporte is
  'ADR-0328 act. 10: qué tiene la prenda, escrito por quien la reportó desde Existencias (reportar_danada). Es el tercer origen de una dañada: exactamente uno de devolucion_item_id, cambio_id o motivo_reporte. Quién y desde dónde lo dice movimiento_entrada_id.';

alter table retail.prendas_danadas drop constraint if exists prendas_danadas_motivo_reporte_valido;
alter table retail.prendas_danadas add constraint prendas_danadas_motivo_reporte_valido
  check (motivo_reporte is null or char_length(btrim(motivo_reporte)) between 3 and 200);

-- Mismo nombre que el de 20260919000100: si alguien la vuelve a pegar, su `if not exists` no lo pisa.
alter table retail.prendas_danadas drop constraint if exists prendas_danadas_un_origen;
alter table retail.prendas_danadas add constraint prendas_danadas_un_origen
  check (num_nonnulls(devolucion_item_id, cambio_id, motivo_reporte) = 1);

-- ---------------------------------------------------------------------------
-- 2. El cuarto desenlace: «Se arregló» (no es pérdida: vuelve a la venta, con nota)
-- ---------------------------------------------------------------------------
alter table retail.prendas_danadas drop constraint if exists prendas_danadas_estado_check;
alter table retail.prendas_danadas add constraint prendas_danadas_estado_check
  check (estado in ('en_cuarentena', 'liquidada', 'se_boto', 'donada', 'devuelta_proveedor', 'se_arreglo'));

alter table retail.prendas_danadas drop constraint if exists prendas_danadas_arreglo_con_nota;
alter table retail.prendas_danadas add constraint prendas_danadas_arreglo_con_nota
  check (estado <> 'se_arreglo' or char_length(btrim(coalesce(nota, ''))) >= 3);

-- ---------------------------------------------------------------------------
-- 3. Un movimiento de entrada, una sola dañada
-- ---------------------------------------------------------------------------
create unique index if not exists prendas_danadas_movimiento_entrada_unico
  on retail.prendas_danadas (movimiento_entrada_id);

-- ---------------------------------------------------------------------------
-- 4. Reportar una prenda dañada
-- ---------------------------------------------------------------------------
-- PROMETE: mueve `p_cantidad` unidades LIBRES de la prenda desde el piso o el almacén de la sede a su cuarentena y abre UNA
--   fila 'en_cuarentena' en `prendas_danadas` con el motivo; o no hace nada y dice por qué. Devuelve
--   {ya_registrada, id, movimiento_id, unidades}. La misma marca con los mismos datos devuelve lo ya hecho sin mover nada;
--   con otros datos, se rechaza (hint `mover_interno_token_reusado`).
-- ASUME: la sede es una tienda con piso, almacén y cuarentena; quien llama ve Existencias, opera esa sede y eligió quién lo
--   hace (`fn_actor_persona_id(true)`). La marca es una por ventana abierta.
-- NO HACE: no decide el destino de la prenda (eso es del líder, en Dañadas) ni cuenta una pérdida.
create or replace function retail.reportar_danada(
  p_ubicacion_id uuid,
  p_variante_id uuid,
  p_cantidad integer,
  p_desde text,
  p_motivo text,
  p_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $fn$
declare
  c_centinela constant uuid := '22222222-2222-4222-8222-222222222222'; -- «Prenda sin registrar» / cargo especial: no es una prenda
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_origen uuid;
  v_cuarentena uuid;
  v_marca uuid;
  v_mov uuid;
  v_id uuid;
  v_actor uuid;
  v_hay integer;
  v_apartadas integer;
  v_lugar text := case p_desde when 'piso' then 'el piso' when 'almacen' then 'el almacén' end;
begin
  if p_token is null then
    raise exception 'Falta la marca de este intento. Cierra la ventana y vuelve a abrirla.' using hint = 'danada_sin_token';
  end if;
  if not fn_ve_modulo('existencias') then
    raise exception 'No puedes reportar prendas dañadas: tu rol no tiene el módulo «Existencias». Pídele al líder que lo active.'
      using errcode = '42501', hint = 'danada_sin_modulo';
  end if;
  if p_ubicacion_id is null or not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No puedes reportar prendas dañadas en esa tienda: no es tu sede.' using hint = 'danada_sin_tienda';
  end if;
  if v_lugar is null then
    raise exception 'Di dónde estaba la prenda: colgada en el piso o guardada en el almacén.' using hint = 'danada_desde_invalido';
  end if;
  if p_cantidad is null or p_cantidad < 1 or p_cantidad > 999 then
    raise exception 'Reporta al menos 1 prenda.' using hint = 'danada_cantidad_invalida';
  end if;
  if v_motivo is null or char_length(v_motivo) < 3 then
    raise exception 'Escribe qué tiene la prenda (al menos 3 letras): así quien decide sabe si se puede arreglar.'
      using hint = 'danada_sin_motivo';
  end if;
  if char_length(v_motivo) > 200 then
    raise exception 'Lo que tiene la prenda admite hasta 200 caracteres.' using hint = 'danada_motivo_largo';
  end if;
  if p_variante_id is null or p_variante_id = c_centinela then
    raise exception 'Eso no es una prenda del catálogo: no se reporta como dañada.' using hint = 'danada_no_es_prenda';
  end if;
  if not exists (select 1 from variantes v where v.id = p_variante_id) then
    raise exception 'Esa prenda ya no existe en el catálogo. Recarga la pantalla.' using hint = 'danada_no_existe';
  end if;

  v_origen := (select s.id from sububicaciones s
                where s.ubicacion_id = p_ubicacion_id
                  and s.tipo = case p_desde when 'piso' then 'piso_venta' else 'almacen_tienda' end);
  v_cuarentena := (select s.id from sububicaciones s where s.ubicacion_id = p_ubicacion_id and s.tipo = 'cuarentena');
  if v_origen is null or v_cuarentena is null then
    raise exception 'Esta sede no separa piso, almacén y cuarentena: aquí no se reportan prendas dañadas.'
      using hint = 'danada_sede_sin_cuarentena';
  end if;

  -- La marca de este reporte, en su propio espacio de nombres: nunca coincide con la de otra pantalla que use mover_interno.
  -- El candado de la marca es el MISMO que toma mover_interno (se puede tomar dos veces en la transacción): dos reintentos
  -- simultáneos se esperan, y el segundo ve el reporte del primero ya confirmado.
  v_marca := md5('reportar_danada:' || p_token::text)::uuid;
  perform pg_advisory_xact_lock(hashtextextended('mover_interno:' || v_marca::text, 0));

  -- ¿Ya se reportó con esta marca? Antes de pedir responsable y de mirar el stock: comprobar algo ya guardado no escribe
  -- nada, así que responde aunque quien lo hizo ya marcó su salida y aunque el piso ya haya bajado. `mover_interno` vuelve a
  -- comparar los datos con los guardados: con otra cantidad, otro lugar u otro motivo lo rechaza.
  if exists (select 1 from movimientos_internos_intentos i where i.token_cliente = v_marca) then
    v_mov := mover_interno(p_ubicacion_id, p_variante_id, p_cantidad, v_origen, v_cuarentena, v_motivo, v_marca);
    v_id := (select pd.id from prendas_danadas pd where pd.movimiento_entrada_id = v_mov);
    return jsonb_build_object('ya_registrada', true, 'id', v_id, 'movimiento_id', v_mov, 'unidades', p_cantidad);
  end if;

  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación.' using hint = 'responsable_requerido';
  end if;

  -- Candado: el stock de esa prenda en la sede, en orden (ADR-0190). Con él tomado, lo libre no cambia hasta el final.
  perform fn_bloquear_en_orden(p_ubicacion_id, array[p_variante_id]);
  v_hay := coalesce((select s.cantidad from stock s
                      where s.variante_id = p_variante_id and s.ubicacion_id = p_ubicacion_id and s.sububicacion_id = v_origen), 0);
  v_apartadas := coalesce((select s.cantidad_apartada from stock s
                            where s.variante_id = p_variante_id and s.ubicacion_id = p_ubicacion_id and s.sububicacion_id = v_origen), 0);
  if v_hay - v_apartadas < p_cantidad then
    raise exception '%',
      'No se reportó nada. ' || coalesce(fn_prenda_corta(p_variante_id), 'Esa prenda') || ': pides ' || p_cantidad
      || ' y en ' || v_lugar || ' hay ' || greatest(v_hay - v_apartadas, 0) || ' libre' || case when greatest(v_hay - v_apartadas, 0) = 1 then '' else 's' end
      || case when v_apartadas = 1 then ' (1 apartada para un cliente: si es la dañada, libera primero el apartado)'
              when v_apartadas > 1 then ' (' || v_apartadas || ' apartadas para clientes: si es una de ellas, libera primero el apartado)'
              else '' end
      || '. Puede que otra persona ya la haya movido: revisa ' || v_lugar || '.'
      using hint = 'danada_sin_alcance',
            detail = jsonb_build_object('variante_id', p_variante_id, 'desde', p_desde, 'pide', p_cantidad,
                                        'hay', greatest(v_hay - v_apartadas, 0), 'apartadas', v_apartadas)::text;
  end if;

  -- El movimiento: un traslado DENTRO de la sede (no es pérdida: la prenda sigue en CAYLA). Su nota es lo que tiene.
  v_mov := mover_interno(p_ubicacion_id, p_variante_id, p_cantidad, v_origen, v_cuarentena, v_motivo, v_marca);

  insert into prendas_danadas (variante_id, ubicacion_id, cantidad, movimiento_entrada_id, motivo_reporte)
    values (p_variante_id, p_ubicacion_id, p_cantidad, v_mov, v_motivo)
    returning id into v_id;

  return jsonb_build_object('ya_registrada', false, 'id', v_id, 'movimiento_id', v_mov, 'unidades', p_cantidad);
end;
$fn$;

comment on function retail.reportar_danada(uuid, uuid, integer, text, text, uuid) is
  'ADR-0328 act. 10: reporta una prenda dañada desde Existencias. Mueve lo LIBRE (sin lo apartado) del piso o del almacén (p_desde) a la cuarentena de la sede con mover_interno (traslado interno: no es pérdida) y abre su fila en prendas_danadas con motivo_reporte, todo o nada. p_token obligatorio (una por ventana): el reintento con los mismos datos devuelve ya_registrada sin mover nada. Pide el módulo Existencias y operar la sede; firma el responsable.';

revoke all on function retail.reportar_danada(uuid, uuid, integer, text, text, uuid) from public, anon;
grant execute on function retail.reportar_danada(uuid, uuid, integer, text, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. «Se arregló»: vuelve al almacén
-- ---------------------------------------------------------------------------
-- PROMETE: saca de la cuarentena TODAS las unidades de la dañada `p_id` y las deja en el ALMACÉN de su sede (traslado interno),
--   y la marca 'se_arreglo' con la nota y quien firmó; o no hace nada y dice por qué. Devuelve {ya_registrada, id,
--   movimiento_id, unidades}. Con la misma marca, un reintento después de guardar devuelve lo ya hecho.
-- ASUME: quien llama es líder (la decisión de devolver una prenda a la venta es suya, como las otras salidas de ADR-0071) y
--   eligió quién lo hace. La dañada sigue 'en_cuarentena' y su sede tiene almacén.
-- NO HACE: no la cuelga en el piso (para venderla, «Bajar al piso»: así Frescura cuenta su edad desde esa bajada) ni toca
--   costo ni Finanzas (moverla dentro de la sede no cambia su valor).
create or replace function retail.arreglar_prenda_danada(p_id uuid, p_nota text, p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $fn$
declare
  pd prendas_danadas%rowtype;
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  v_cuarentena uuid;
  v_almacen uuid;
  v_marca uuid;
  v_mov uuid;
  v_actor uuid;
begin
  if p_token is null then
    raise exception 'Falta la marca de este intento. Cierra la ventana y vuelve a abrirla.' using hint = 'arreglo_sin_token';
  end if;
  -- La decisión de devolver una prenda a la venta es del líder (como Liquidada, Se botó y Donada).
  if not fn_es_lider() then
    raise exception 'Solo un líder decide que una prenda dañada se arregló y vuelve a la venta.' using hint = 'arreglo_solo_lider';
  end if;
  if v_nota is null or char_length(v_nota) < 3 then
    raise exception 'Escribe qué se arregló (al menos 3 letras): la prenda vuelve a la venta y tiene que quedar dicho.'
      using hint = 'arreglo_sin_nota';
  end if;
  if char_length(v_nota) > 200 then
    raise exception 'Lo que se arregló admite hasta 200 caracteres.' using hint = 'arreglo_nota_larga';
  end if;

  -- La fila, con candado: dos líderes que deciden a la vez la misma prenda se esperan, y el segundo ve la decisión del primero.
  select * into pd from prendas_danadas where id = p_id for update;
  if not found then
    raise exception 'Esa prenda dañada ya no está en la lista. Recarga la pantalla.' using hint = 'arreglo_no_existe';
  end if;

  v_marca := md5('arreglar_prenda_danada:' || p_token::text)::uuid;
  if pd.estado <> 'en_cuarentena' then
    -- El reintento de ESTE mismo arreglo (la respuesta se perdió después de guardar) devuelve lo hecho, sin error.
    if pd.estado = 'se_arreglo' and exists (
      select 1 from movimientos_internos_intentos i where i.token_cliente = v_marca and i.movimiento_id = pd.movimiento_salida_id
    ) then
      return jsonb_build_object('ya_registrada', true, 'id', pd.id, 'movimiento_id', pd.movimiento_salida_id, 'unidades', pd.cantidad);
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

  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación.' using hint = 'responsable_requerido';
  end if;

  -- Cuarentena → almacén de la MISMA sede: un traslado interno (no es pérdida ni bajada). Su nota es lo que se arregló.
  v_mov := mover_interno(pd.ubicacion_id, pd.variante_id, pd.cantidad, v_cuarentena, v_almacen, v_nota, v_marca);

  update prendas_danadas
     set estado = 'se_arreglo', movimiento_salida_id = v_mov, resuelto_por = v_actor, resuelto_en = now(), nota = v_nota
   where id = p_id;

  return jsonb_build_object('ya_registrada', false, 'id', p_id, 'movimiento_id', v_mov, 'unidades', pd.cantidad);
end;
$fn$;

comment on function retail.arreglar_prenda_danada(uuid, text, uuid) is
  'ADR-0328 act. 10: «Se arregló». Saca de la cuarentena todas las unidades de la dañada y las deja en el ALMACÉN de su sede (traslado interno con mover_interno: no es pérdida), con nota obligatoria de qué se arregló. Solo el líder; firma el responsable. p_token obligatorio: el reintento del mismo arreglo devuelve ya_registrada.';

revoke all on function retail.arreglar_prenda_danada(uuid, text, uuid) from public, anon;
grant execute on function retail.arreglar_prenda_danada(uuid, text, uuid) to authenticated;

notify pgrst, 'reload schema';
