-- ============================================================================
-- 20261031014000_produccion_corte_con_su_tela_todo_o_nada.sql — CAYLA V2 (ADR-0587 · 2026-10-30)
--
-- EL PROBLEMA PRIMERO (evaluación del módulo, mejoras 1 y 2 de docs/pantallas/produccion-modulo-21-mejoras.md).
--   (1) «Terminé el corte» y «lo que quedó del rollo» se guardaban con DOS llamadas seguidas (AnotarAvanceModal, y lo mismo la Salida con la
--       tela que sale a un corte de afuera). Si el wifi del Taller se caía entre las dos, el corte quedaba anotado y la tela no: la orden
--       llegaba a «Pasar al stock» sin tela y el costo por prenda salía mal.
--   (2) Ninguna de las dos llevaba token. Tras un corte de red, apretar otra vez anotaba otras 30 prendas, o descontaba la tela dos veces.
--   (3) «Deshacer» quitaba las prendas pero no devolvía la tela al estante (el aviso lo decía: «Deshacer no la devuelve»), y deshacía avance
--       por avance en llamadas sueltas: si la tercera fallaba, quedaba a medias.
--   (4) `anotar_insumos_de_la_orden` leía cuánto «había» en el estante sin candado. Dos cortadoras que anotan casi a la vez «quedaron 20 m»
--       del mismo color para dos órdenes leían las dos «había 45 m»: la segunda recibía un «Avisa al líder» falso porque los lotes ya no
--       alcanzaban, o medía contra un número viejo.
--
-- QUÉ HACE (Felipe 2026-10-30: «Integridad 1–4»; «Deshacer devuelve la tela: sí»; la 4, ajustes por lote, se pasó a #1499).
--   · `fn_produccion_anotar_tela`: la regla de «quedó/usado» de ADR-0570, una sola, ahora bajo un candado por (tela, sede) tomado ANTES de
--     leer lo que había, en orden de id (dos llamadas con los mismos colores nunca se traban). Devuelve también los movimientos que escribió.
--     `anotar_insumos_de_la_orden` (la hoja «Tela») la usa igual que antes.
--   · `anotar_termine_con_tela`: «Terminé» y su tela en UNA transacción, con token (ADR-0190). El mismo token con lo mismo devuelve
--     «repetido» sin anotar nada; con otro contenido se rechaza (`token_reusado`). `anotar_termine` pasa a ser su puerta sin tela: una sola
--     regla de «Terminé» (registrar_avance, que la llama, no cambia).
--   · `registrar_salida_con_tela`: la Salida a un servicio y la tela que sale con ella, en una transacción y con token.
--   · `deshacer_termine`: deshace las prendas, las fallas y DEVUELVE la tela de ese «Terminé», todo o nada. La devolución es un movimiento
--     nuevo que apunta al consumo que deshace (`movimientos_insumo.deshace_id`): nada se borra y un consumo no se devuelve dos veces.
--
-- CONTRATO (Liskov)
--   PROMETE: un «Terminé» con tela queda entero o no queda; un reintento con el mismo token no anota dos veces; dos anotaciones de la misma
--            tela en la misma sede se forman en fila y la segunda mide lo que de verdad quedó; un consumo se deshace una vez como máximo y
--            nunca deja a la orden con más tela devuelta que consumida.
--   ASUME:   las funciones de ADR-0570 con el texto de main al 2026-10-30 (`fn_produccion_escribir_termine`, `fn_produccion_operar_fase`,
--            `fn_insumo_consumir_peps`, `fn_insumo_saldo_en`, `deshacer_avance`, `deshacer_falla`, `registrar_salida`).
--   NO HACE: no cambia cómo se calcula el saldo de un lote ni los ajustes (eso es #1499). No deshace una Salida (se anula, como siempre).
--            No toca dinero de caja ni comprobantes.
--
-- DECIDÍ: el candado es por (tela, sede), no por orden. El choque real es entre DOS órdenes que cortan del mismo rollo, y el candado de la
--   orden no las ve.
-- DESCARTÉ: guardar cada «Terminé» en una tabla propia («el envío») para recordar sus ids. La pantalla ya los recibe en la respuesta y
--   `deshacer_termine` valida cada uno por separado (que sea de la misma orden, que no esté deshecho). Una tabla más sería otra cosa que
--   mantener, sin un estado imposible nuevo que evitar.
-- SE ROMPE SI: alguien devuelve a mano con «Devolver lo que sobró» parte de la tela de un corte y después aprieta «Deshacer». La base lo
--   frena (no deja a la orden con más devuelto que consumido) y pide corregir desde «Tela»: no devuelve dos veces, pero tampoco lo resuelve solo.
--
-- PRODUCCIÓN. NO está aplicada. Una sola parte, re-ejecutable, `lock_timeout = 3s`: un `alter table` (columna nueva, nula, sin valor por
-- defecto: no reescribe la tabla) con su CHECK y su índice, y funciones. Sin políticas ni `drop trigger` (ADR-0195). Sin reemplazos anclados.
-- Va DESPUÉS de 20261029190000. Prueba: `pnpm pruebas:produccion-corte-con-su-tela`.
-- ============================================================================
set lock_timeout = '3s';

-- 1. Una devolución puede decir qué consumo deshace. Solo una devolución, y cada consumo una sola vez.
alter table retail.movimientos_insumo add column if not exists deshace_id uuid references retail.movimientos_insumo(id);
-- Las columnas de `movimientos_insumo` se leen una por una (candado del dinero, 20260921151000: `costo_unitario` no es legible por la API): una columna
-- NUEVA no se lee hasta que se le da permiso, y una lectura que la pida entera se cae con «permission denied». `deshace_id` no es dinero.
-- Lo vigila la guardia 6 de `pruebas:candado-dinero-produccion`.
grant select (deshace_id) on retail.movimientos_insumo to authenticated;
alter table retail.movimientos_insumo drop constraint if exists movimientos_insumo_deshace_es_devolucion;
alter table retail.movimientos_insumo add constraint movimientos_insumo_deshace_es_devolucion check (deshace_id is null or tipo = 'devolucion');
create unique index if not exists movimientos_insumo_deshace_una_vez on retail.movimientos_insumo (deshace_id) where deshace_id is not null;
comment on column retail.movimientos_insumo.deshace_id is
  'ADR-0587: en una devolución, el consumo que deshace («Deshacer» de un corte). Un consumo se deshace una sola vez (índice único).';

-- 2. La regla de «quedó/usado» (ADR-0570), una sola, bajo el candado del estante. No pide permisos ni toma el candado de la orden: eso lo hace quien
--    la llama. Devuelve las líneas, el total y los movimientos de consumo que escribió.
create or replace function retail.fn_produccion_anotar_tela(p_produccion_id uuid, p_ubicacion_id uuid, p_lineas jsonb, p_nota text, p_actor uuid, p_numero integer)
returns jsonb
language plpgsql
set search_path = retail, public, extensions
as $$
declare
  v_x jsonb; v_clave text; v_insumo uuid; v_nombre text; v_habia numeric; v_quedo numeric; v_usado numeric; v_vistos uuid[] := '{}';
  v_hechas jsonb := '[]'::jsonb; v_total numeric := 0; v_nota text; v_antes uuid[]; v_consumos uuid[] := '{}';
begin
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'Di cuánto quedó o cuánto se usó de cada tela o avío' using hint = 'uso_sin_lineas';
  end if;
  v_nota := nullif(btrim(coalesce(p_nota, '')), '');

  -- El candado del estante, ANTES de leer cuánto había: por cada (tela, sede), en orden, para que dos llamadas con los mismos colores se formen
  -- en fila en vez de trabarse. Un id mal escrito no toma candado: lo rechaza la validación de abajo.
  for v_clave in
    select distinct lower(x ->> 'insumo_id') from jsonb_array_elements(p_lineas) x
     where (x ->> 'insumo_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     order by 1
  loop
    perform pg_advisory_xact_lock(hashtextextended('estante:' || v_clave || ':' || p_ubicacion_id::text, 0));
  end loop;

  for v_x in select * from jsonb_array_elements(p_lineas) loop
    begin
      v_insumo := nullif(v_x ->> 'insumo_id', '')::uuid;
    exception when others then
      raise exception 'Una de las telas o avíos no es válida' using hint = 'uso_ajeno';
    end;
    if v_insumo is null or not exists (select 1 from retail.produccion_insumos pi where pi.produccion_id = p_produccion_id and pi.insumo_id = v_insumo) then
      raise exception 'Eso no es de esta orden: decláralo primero en «Editar»' using hint = 'uso_ajeno';
    end if;
    if v_insumo = any (v_vistos) then
      raise exception 'Cada tela o avío va una sola vez' using hint = 'uso_repetido';
    end if;
    v_vistos := v_vistos || v_insumo;
    v_nombre := (select i.nombre from retail.insumos i where i.id = v_insumo);
    if (v_x ? 'quedo') = (v_x ? 'usado') then
      raise exception 'Di cuánto quedó de %, o cuánto salió', v_nombre using hint = 'uso_cantidad_invalida';
    end if;
    begin
      v_quedo := case when v_x ? 'quedo' then nullif(btrim(v_x ->> 'quedo'), '')::numeric end;
      v_usado := case when v_x ? 'usado' then nullif(btrim(v_x ->> 'usado'), '')::numeric end;
    exception when others then
      raise exception 'Lo que escribiste de % no es un número', v_nombre using hint = 'uso_cantidad_invalida';
    end;
    v_habia := retail.fn_insumo_saldo_en(v_insumo, p_ubicacion_id);
    if v_x ? 'quedo' then
      if v_quedo is null or v_quedo < 0 or v_quedo <> round(v_quedo, 3) or v_quedo > 1000000 then
        raise exception 'Lo que quedó de % tiene que ser cero o más, con hasta tres decimales', v_nombre using hint = 'uso_cantidad_invalida';
      end if;
      if v_quedo > v_habia then
        raise exception 'En el estante había % de %: no pudo quedar %. Si apareció tela que no estaba anotada, anótala con «Encontré tela»', v_habia, v_nombre, v_quedo
          using hint = 'uso_quedo_de_mas';
      end if;
      v_usado := v_habia - v_quedo;
    else
      if v_usado is null or v_usado <= 0 or v_usado <> round(v_usado, 3) or v_usado > 1000000 then
        raise exception 'Lo que salió de % tiene que ser mayor que cero, con hasta tres decimales', v_nombre using hint = 'uso_cantidad_invalida';
      end if;
      if v_usado > v_habia then
        raise exception 'En el estante hay % de %: no pueden salir %', v_habia, v_nombre, v_usado using hint = 'uso_no_alcanza';
      end if;
    end if;
    if v_usado > 0 then
      -- Los consumos que escribe esta línea: los que no estaban antes (la orden está bajo su candado, nadie más le escribe ahora).
      v_antes := array(select mi.id from retail.movimientos_insumo mi
                        where mi.produccion_id = p_produccion_id and mi.insumo_id = v_insumo and mi.tipo = 'consumo');
      perform retail.fn_insumo_consumir_peps(p_produccion_id, v_insumo, p_ubicacion_id, v_usado, v_nota, p_actor);
      v_consumos := v_consumos || array(select mi.id from retail.movimientos_insumo mi
                                         where mi.produccion_id = p_produccion_id and mi.insumo_id = v_insumo and mi.tipo = 'consumo'
                                           and mi.id <> all (v_antes) order by mi.created_at, mi.id);
      v_hechas := v_hechas || jsonb_build_object('insumo_id', v_insumo, 'usado', v_usado);
      v_total := v_total + v_usado;
    end if;
  end loop;

  if jsonb_array_length(v_hechas) = 0 then
    raise exception 'Con eso no se usó nada: lo que quedó es lo mismo que había. Si todavía no se corta, anótalo después' using hint = 'uso_nada';
  end if;
  -- D-47 + F3b: el costo de tela y avíos de la orden es lo consumido menos lo devuelto.
  perform retail.fn_recalcular_costo_insumos_produccion(p_produccion_id);
  begin
    perform retail.fn_actividad_anotar(
      'produccion', 'produccion_tela_anotada',
      'anotó la tela usada en la ' || retail.fn_produccion_numero_texto(p_numero) || ' (' || jsonb_array_length(v_hechas) || ' '
        || case when jsonb_array_length(v_hechas) = 1 then 'color' else 'colores' end || ')',
      p_actor, retail.fn_actividad_terminal_ahora(), p_ubicacion_id, p_ubicacion_id,
      'produccion', p_produccion_id::text, now(),
      jsonb_build_object('produccion_id', p_produccion_id, 'numero', p_numero, 'lineas', v_hechas),
      'vivo');
  exception when others then
    raise warning 'actividad: no se anotó la tela de la orden % (%)', p_numero, sqlerrm;
  end;
  return jsonb_build_object('lineas', v_hechas, 'total', v_total, 'consumo_ids', to_jsonb(v_consumos));
end;
$$;
comment on function retail.fn_produccion_anotar_tela(uuid, uuid, jsonb, text, uuid, integer) is
  'Interna (ADR-0587): «quedó/usado» de la tela de una orden bajo el candado del estante (tela, sede), PEPS, todo o nada. La usan anotar_insumos_de_la_orden, anotar_termine_con_tela y registrar_salida_con_tela.';
revoke all on function retail.fn_produccion_anotar_tela(uuid, uuid, jsonb, text, uuid, integer) from public, anon, authenticated;

-- 3. La hoja «Tela» de la orden: la misma de ADR-0570, ahora sobre la regla única.
create or replace function retail.anotar_insumos_de_la_orden(p_produccion_id uuid, p_lineas jsonb, p_nota text default null)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare v_o record; v_actor uuid;
begin
  -- El mismo orden de candados que `registrar_consumo_insumo`: la orden primero, después el estante y los lotes.
  select p.id, p.ubicacion_id, p.estado, p.numero into v_o from retail.producciones p where p.id = p_produccion_id for update;
  if v_o.id is null then
    raise exception 'Esa orden no existe' using hint = 'orden_inexistente';
  end if;
  perform retail.fn_produccion_exigir_operar(v_o.ubicacion_id);
  if v_o.estado <> 'en_proceso' then
    raise exception 'La orden ya no está en proceso' using hint = 'orden_cerrada';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién anota la tela' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  return retail.fn_produccion_anotar_tela(p_produccion_id, v_o.ubicacion_id, p_lineas, p_nota, v_actor, v_o.numero);
end;
$$;
comment on function retail.anotar_insumos_de_la_orden(uuid, jsonb, text) is
  'ADR-0570 + ADR-0587: la tela de una orden por color, con «quedó» o «usado». Descuenta de los lotes PEPS, todo o nada, bajo el candado del estante.';
revoke all on function retail.anotar_insumos_de_la_orden(uuid, jsonb, text) from public, anon;
grant execute on function retail.anotar_insumos_de_la_orden(uuid, jsonb, text) to authenticated;

-- 4. El token de un envío (ADR-0190): ¿este token ya se guardó con esto mismo? Toma el candado del token para que un reintento espere al primero.
--    Devuelve true si ya estaba guardado (el que llama no escribe nada); false si es la primera vez. Otro contenido con el mismo token se rechaza.
create or replace function retail.fn_produccion_envio_repetido(p_operacion text, p_token uuid, p_huella text)
returns boolean
language plpgsql
set search_path = retail, public, extensions
as $$
declare v_ya boolean;
begin
  if p_token is null then
    return false;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('intento:' || p_operacion || ':' || p_token::text, 0));
  v_ya := exists (select 1 from retail.intentos_con_token i where i.operacion = p_operacion and i.token = p_token);
  perform retail.fn_intento_con_huella(p_operacion, p_token, p_huella);
  return v_ya;
end;
$$;
comment on function retail.fn_produccion_envio_repetido(text, uuid, text) is
  'Interna (ADR-0587): ¿ya se guardó este envío? Bajo el candado del token; el mismo token con otro contenido se rechaza (token_reusado).';
revoke all on function retail.fn_produccion_envio_repetido(text, uuid, text) from public, anon, authenticated;

-- 5. «Terminé» con su tela, todo o nada.
create or replace function retail.anotar_termine_con_tela(
  p_fase_id uuid, p_lineas jsonb, p_nota text default null, p_hecho_en date default null, p_fallas jsonb default null,
  p_tela jsonb default null, p_token uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare v_op record; v_hecho timestamptz; v_r jsonb; v_t jsonb; v_total integer; v_con_falla integer; v_hay_tela boolean;
begin
  -- Permisos y orden en proceso primero (también para un reintento: un token no abre la puerta a quien no puede operar la orden).
  select * into v_op from retail.fn_produccion_operar_fase(p_fase_id);
  if retail.fn_produccion_envio_repetido('anotar_termine_con_tela', p_token,
       md5(row(p_fase_id, p_lineas, p_nota, p_hecho_en, p_fallas, p_tela)::text)) then
    return jsonb_build_object('repetido', true, 'fases', retail.fn_fases_de_orden(v_op.produccion_id));
  end if;
  if retail.fn_fase_es_hito(v_op.clave) then
    raise exception 'La fase «%» no cuenta prendas: se marca como hecha, no se anota «Terminé»', retail.fn_fase_nombre(v_op.clave) using hint = 'fase_es_hito';
  end if;
  if v_op.quien <> 'taller' then
    raise exception 'La fase «%» la hace %: lo que vuelve se anota en la Vuelta, no como avance', retail.fn_fase_nombre(v_op.clave), coalesce(v_op.proveedor_nombre, 'un servicio')
      using hint = 'fase_de_servicio';
  end if;
  -- Un candado por orden (ADR-0190): dos «Terminé» a la vez se forman en fila y el segundo ve el saldo real.
  perform pg_advisory_xact_lock(hashtextextended('produccion:' || v_op.produccion_id::text, 0));
  v_hecho := retail.fn_produccion_fecha_real(v_op.produccion_id, p_hecho_en);
  v_r := retail.fn_produccion_escribir_termine(p_fase_id, p_lineas, p_fallas, p_nota, v_hecho, v_op.actor);
  v_total := (v_r ->> 'buenas')::integer;
  v_con_falla := (v_r ->> 'con_falla')::integer;

  v_hay_tela := p_tela is not null and jsonb_typeof(p_tela) = 'array' and jsonb_array_length(p_tela) > 0;
  if v_hay_tela then
    -- El candado de la fila de la orden, como `anotar_insumos_de_la_orden`: una hoja «Tela» abierta a la vez espera.
    perform 1 from retail.producciones p where p.id = v_op.produccion_id for update;
    v_t := retail.fn_produccion_anotar_tela(v_op.produccion_id, v_op.ubicacion_id, p_tela, 'al terminar el corte', v_op.actor, v_op.numero);
  end if;

  -- Actividad (ADR-0207): sin montos. Si falla, lo anotado igual queda.
  begin
    perform retail.fn_actividad_anotar(
      'produccion', 'produccion_avance',
      'terminó ' || retail.fn_actividad_cuantas(v_total, 'prenda', 'prendas') || ' de ' || retail.fn_fase_nombre(v_op.clave)
        || case when v_con_falla > 0 then ' (' || retail.fn_actividad_cuantas(v_con_falla, 'con falla', 'con falla') || ')' else '' end
        || ' de la ' || retail.fn_produccion_numero_texto(v_op.numero),
      v_op.actor, retail.fn_actividad_terminal_ahora(), v_op.ubicacion_id, v_op.ubicacion_id,
      'produccion', v_op.produccion_id::text, now(),
      jsonb_build_object('produccion_id', v_op.produccion_id, 'numero', v_op.numero, 'fase_id', p_fase_id, 'fase', v_op.clave, 'cantidad', v_total,
                         'con_falla', v_con_falla, 'hecho_en', v_hecho),
      'vivo');
  exception when others then
    raise warning 'actividad: no se anotó el avance de la orden % (%)', v_op.numero, sqlerrm;
  end;
  return jsonb_build_object(
    'repetido', false,
    'fases', retail.fn_fases_de_orden(v_op.produccion_id),
    'avance_ids', v_r -> 'avance_ids',
    'falla_ids', v_r -> 'falla_ids',
    'consumo_ids', coalesce(v_t -> 'consumo_ids', '[]'::jsonb),
    'tela', coalesce(v_t -> 'lineas', '[]'::jsonb),
    'buenas', v_total,
    'con_falla', v_con_falla);
end;
$$;
comment on function retail.anotar_termine_con_tela(uuid, jsonb, text, date, jsonb, jsonb, uuid) is
  'ADR-0587: «Terminé» (buenas, fallas y día real, ADR-0570) y la tela que quedó, en una transacción; con token, un reintento no anota dos veces. Devuelve los ids para «Deshacer».';
revoke all on function retail.anotar_termine_con_tela(uuid, jsonb, text, date, jsonb, jsonb, uuid) from public, anon;
grant execute on function retail.anotar_termine_con_tela(uuid, jsonb, text, date, jsonb, jsonb, uuid) to authenticated;

-- 6. «Terminé» sin tela: la misma regla, por la misma puerta (registrar_avance la llama con esta firma).
create or replace function retail.anotar_termine(p_fase_id uuid, p_lineas jsonb, p_nota text default null, p_hecho_en date default null, p_fallas jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
begin
  return retail.anotar_termine_con_tela(p_fase_id, p_lineas, p_nota, p_hecho_en, p_fallas, null, null) -> 'fases';
end;
$$;
comment on function retail.anotar_termine(uuid, jsonb, text, date, jsonb) is
  'ADR-0570 + ADR-0587: «Terminé» sin tela ni token; la regla vive en anotar_termine_con_tela. Devuelve las fases de la orden, como siempre.';
revoke all on function retail.anotar_termine(uuid, jsonb, text, date, jsonb) from public, anon;
grant execute on function retail.anotar_termine(uuid, jsonb, text, date, jsonb) to authenticated;

-- 7. La Salida a un servicio y la tela que sale con ella (un corte de afuera), todo o nada.
create or replace function retail.registrar_salida_con_tela(
  p_fase_id uuid, p_lineas jsonb, p_guia text default null, p_nota text default null, p_tela jsonb default null, p_token uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare v_op record; v_fases jsonb; v_t jsonb;
begin
  select * into v_op from retail.fn_produccion_operar_fase(p_fase_id);
  if retail.fn_produccion_envio_repetido('registrar_salida_con_tela', p_token, md5(row(p_fase_id, p_lineas, p_guia, p_nota, p_tela)::text)) then
    return jsonb_build_object('repetido', true, 'fases', retail.fn_fases_de_orden(v_op.produccion_id));
  end if;
  v_fases := retail.registrar_salida(p_fase_id, p_lineas, p_guia, p_nota);
  if p_tela is not null and jsonb_typeof(p_tela) = 'array' and jsonb_array_length(p_tela) > 0 then
    perform 1 from retail.producciones p where p.id = v_op.produccion_id for update;
    v_t := retail.fn_produccion_anotar_tela(v_op.produccion_id, v_op.ubicacion_id, p_tela,
             'sale a ' || lower(retail.fn_fase_nombre(v_op.clave)) || ' con ' || coalesce(v_op.proveedor_nombre, 'un servicio'), v_op.actor, v_op.numero);
    v_fases := retail.fn_fases_de_orden(v_op.produccion_id);
  end if;
  return jsonb_build_object('repetido', false, 'fases', v_fases, 'tela', coalesce(v_t -> 'lineas', '[]'::jsonb), 'consumo_ids', coalesce(v_t -> 'consumo_ids', '[]'::jsonb));
end;
$$;
comment on function retail.registrar_salida_con_tela(uuid, jsonb, text, text, jsonb, uuid) is
  'ADR-0587: la Salida a un servicio (registrar_salida) y la tela que sale con ella, en una transacción; con token, un reintento no manda dos veces.';
revoke all on function retail.registrar_salida_con_tela(uuid, jsonb, text, text, jsonb, uuid) from public, anon;
grant execute on function retail.registrar_salida_con_tela(uuid, jsonb, text, text, jsonb, uuid) to authenticated;

-- 8. «Deshacer» de un «Terminé»: las prendas, las fallas y la tela, todo o nada. La tela vuelve al MISMO lote, al mismo costo.
create or replace function retail.deshacer_termine(p_avance_ids uuid[], p_falla_ids uuid[], p_consumo_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_prod uuid; v_o record; v_id uuid; v_m record; v_neto numeric; v_actor uuid; v_devuelto numeric := 0; v_n integer := 0;
begin
  -- La orden de este «Terminé»: la de la primera pieza. Todas tienen que ser de la misma.
  v_prod := coalesce(
    (select f.produccion_id from retail.produccion_avances a join retail.produccion_fases f on f.id = a.fase_id where a.id = (p_avance_ids)[1]),
    (select f.produccion_id from retail.produccion_fallas fa join retail.produccion_fases f on f.id = fa.fase_id where fa.id = (p_falla_ids)[1]),
    (select mi.produccion_id from retail.movimientos_insumo mi where mi.id = (p_consumo_ids)[1]));
  if v_prod is null then
    raise exception 'No hay nada que deshacer' using hint = 'deshacer_vacio';
  end if;
  if exists (select 1 from unnest(coalesce(p_avance_ids, '{}')) x(id)
              where not exists (select 1 from retail.produccion_avances a join retail.produccion_fases f on f.id = a.fase_id where a.id = x.id and f.produccion_id = v_prod))
     or exists (select 1 from unnest(coalesce(p_falla_ids, '{}')) x(id)
              where not exists (select 1 from retail.produccion_fallas fa join retail.produccion_fases f on f.id = fa.fase_id where fa.id = x.id and f.produccion_id = v_prod))
     or exists (select 1 from unnest(coalesce(p_consumo_ids, '{}')) x(id)
              where not exists (select 1 from retail.movimientos_insumo mi where mi.id = x.id and mi.produccion_id = v_prod and mi.tipo = 'consumo')) then
    raise exception 'Lo que quieres deshacer no es todo de la misma orden' using hint = 'deshacer_ajeno';
  end if;

  -- Los candados de siempre: la orden (la misma llave que «Terminé») y su fila (la misma que la hoja «Tela»).
  perform pg_advisory_xact_lock(hashtextextended('produccion:' || v_prod::text, 0));
  select p.id, p.ubicacion_id, p.estado, p.numero into v_o from retail.producciones p where p.id = v_prod for update;
  perform retail.fn_produccion_exigir_operar(v_o.ubicacion_id);
  if v_o.estado <> 'en_proceso' then
    raise exception 'La orden ya no está en proceso: no se puede deshacer' using hint = 'orden_cerrada';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién deshace' using errcode = '42501', hint = 'responsable_requerido';
  end if;

  -- Las prendas y las fallas: cada una con su regla de siempre (la última, que no haya pasado a la fase siguiente…).
  foreach v_id in array coalesce(p_avance_ids, '{}') loop
    perform retail.deshacer_avance(v_id);
  end loop;
  foreach v_id in array coalesce(p_falla_ids, '{}') loop
    perform retail.deshacer_falla(v_id);
  end loop;

  -- La tela: cada consumo vuelve a su lote, una sola vez, y la orden nunca queda con más devuelto que consumido de esa tela.
  for v_m in
    select mi.id, mi.insumo_id, mi.insumo_lote_id, mi.ubicacion_id, mi.cantidad, mi.costo_unitario
      from retail.movimientos_insumo mi where mi.id = any (coalesce(p_consumo_ids, '{}')) order by mi.insumo_id, mi.id
  loop
    perform pg_advisory_xact_lock(hashtextextended('estante:' || v_m.insumo_id::text || ':' || v_m.ubicacion_id::text, 0));
    if exists (select 1 from retail.movimientos_insumo d where d.deshace_id = v_m.id) then
      raise exception 'Esa tela ya se devolvió' using hint = 'deshacer_ya_hecho';
    end if;
    v_neto := coalesce((select sum(case when mi.tipo = 'consumo' then mi.cantidad else -mi.cantidad end) from retail.movimientos_insumo mi
                         where mi.produccion_id = v_prod and mi.insumo_id = v_m.insumo_id and mi.tipo in ('consumo', 'devolucion')), 0);
    if v_neto < v_m.cantidad then
      raise exception 'Ya devolviste parte de % de esta orden: deshacer devolvería de más. Corrígelo desde «Tela»',
        (select i.nombre from retail.insumos i where i.id = v_m.insumo_id) using hint = 'deshacer_tela_ya_devuelta';
    end if;
    insert into retail.movimientos_insumo (insumo_id, insumo_lote_id, ubicacion_id, tipo, cantidad, costo_unitario, produccion_id, usuario_id, nota, deshace_id)
      values (v_m.insumo_id, v_m.insumo_lote_id, v_m.ubicacion_id, 'devolucion', v_m.cantidad, v_m.costo_unitario, v_prod, v_actor, 'deshacer el corte', v_m.id);
    v_devuelto := v_devuelto + v_m.cantidad;
    v_n := v_n + 1;
  end loop;
  if v_n > 0 then
    perform retail.fn_recalcular_costo_insumos_produccion(v_prod);
    begin
      perform retail.fn_actividad_anotar(
        'produccion', 'produccion_tela_devuelta',
        'devolvió al estante la tela de un corte deshecho en la ' || retail.fn_produccion_numero_texto(v_o.numero),
        v_actor, retail.fn_actividad_terminal_ahora(), v_o.ubicacion_id, v_o.ubicacion_id,
        'produccion', v_prod::text, now(),
        jsonb_build_object('produccion_id', v_prod, 'numero', v_o.numero, 'consumo_ids', to_jsonb(p_consumo_ids), 'cantidad', v_devuelto),
        'vivo');
    exception when others then
      raise warning 'actividad: no se anotó la devolución de la orden % (%)', v_o.numero, sqlerrm;
    end;
  end if;
  return retail.fn_fases_de_orden(v_prod);
end;
$$;
comment on function retail.deshacer_termine(uuid[], uuid[], uuid[]) is
  'ADR-0587: «Deshacer» de un «Terminé»: prendas (deshacer_avance), fallas (deshacer_falla) y la tela de vuelta a su lote (devolución con deshace_id), todo o nada.';
revoke all on function retail.deshacer_termine(uuid[], uuid[], uuid[]) from public, anon;
grant execute on function retail.deshacer_termine(uuid[], uuid[], uuid[]) to authenticated;
