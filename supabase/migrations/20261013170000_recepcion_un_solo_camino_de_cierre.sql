-- ADR-0393 · actividad 2, primer paso (refactor, sin cambio de comportamiento): un solo camino escribe el stock de un envío.
--
-- EL PROBLEMA PRIMERO. La recepción de un envío (ADR-0362, fase 4) mete el stock dentro de `recibir_despacho`: el papel, las prendas,
-- el costo atípico, los lotes, los movimientos al almacén y a la cuarentena, lo recibido y lo que faltó o sobró, todo en una función de
-- 600 líneas. ADR-0393 agrega un segundo cierre —el del conteo guardado, donde se cuenta por categoría y lo que no se detalla queda
-- pendiente— que tiene que escribir el stock EXACTAMENTE igual. Copiar esas 240 líneas en otra función dejaría dos verdades de cómo
-- entra una prenda al almacén, y la primera corrección a una se olvidaría en la otra.
--
-- QUÉ HACE (una sola parte, re-pegable; no cambia lo que hace `recibir_despacho` ni lo que responde).
--   1. `fn_recepcion_entrar` (interna): la parte de `recibir_despacho` que escribe, tal cual —candados del papel, las variantes y el
--      stock en el orden de siempre (ADR-0190); prendas existentes, activas y de su categoría y marca; costo atípico; dónde entra; un lote
--      por proveedor; entradas al almacén y a la cuarentena con su fila en `prendas_danadas`, cargadas al papel hasta su cupo; el costo
--      promediado una vez por variante; lo recibido; y lo que faltó o sobró—. Dos ajustes que en `recibir_despacho` dan lo mismo y dejan
--      lista la cara A: el lote es del proveedor que trae ENTRADAS (aquí lo contado siempre es la suma de sus tallas), y si el envío ya
--      tiene el lote de ese proveedor (un segundo cierre, después de reabrir) se usa ese.
--   2. `recibir_despacho` se reescribe entera desde su definición VIVA (la de la fase 4 con los tres reemplazos anclados de la fase 5a,
--      20261013015000), con la parte de arriba cambiada por una llamada a `fn_recepcion_entrar`. Los tres parches de la 5a quedan con
--      su texto exacto: re-pegar 20261013015000 encima no hace nada (sus reemplazos ven su texto nuevo y salen), y el orden deja de
--      importar.
--
-- CONTRATO de fn_recepcion_entrar
--   PROMETE: con el envío abierto y bloqueado por quien llama, deja en la base TODO lo que entra de `p_unidades` (las unidades ya
--            validadas en su forma, como las arma `recibir_despacho`) y lo que faltó o sobró, o no deja nada (la transacción es de
--            quien llama). Rechaza con el mismo mensaje y la misma pista de antes una prenda que no existe, inactiva o ajena, un
--            costo atípico sin confirmar y una dañada en una sede sin cuarentena.
--   ASUME:   quien llama ya comprobó el módulo, la sede, quién firma, la versión y la forma de cada unidad, y ya bloqueó el envío, sus
--            órdenes y sus líneas pedidas (el orden de candados sigue desde el papel).
--   NO HACE: no cierra el envío, no escribe la actividad ni salda reposiciones (eso es de quien llama, después).
--
-- DESCARTÉ:
--   · Escribir el cierre del conteo copiando el cuerpo de `recibir_despacho`: dos caminos que escriben stock, y la regla del papel o del
--     costo corregida en uno solo.
--   · Partirla por reemplazos anclados sobre la definición viva: el bloque a mover son 240 líneas; un ancla de ese tamaño es un ensayo de
--     memoria, no un candado. La reescritura entera lleva adentro los parches de la 5a y se comprueba al final.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). UNA parte, después de 20261013015000. Solo funciones: sin tablas, sin políticas ni
-- `drop trigger` (ADR-0195), sin `select … into` dentro de textos entre comillas (ADR-0288). Se puede pegar dos veces. El bloque final
-- comprueba que quedó todo.

set lock_timeout = '3s';

-- ---------- 1. Lo que entra de un envío: la única puerta al stock de una recepción ----------
create or replace function retail.fn_recepcion_entrar(
  p_despacho_id uuid,
  p_ubicacion_id uuid,
  p_numero_guia text,
  p_envio text,
  p_actor uuid,
  p_unidades jsonb,
  p_variantes uuid[],
  p_nota text
)
returns void
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare
  v_costo numeric;
  v_prov uuid;
  v_compra_items uuid[];
  v_malo record;
  v_atipicos jsonb;
  v_sin_marca jsonb;
  v_sub_almacen uuid;
  v_sub_cuarentena uuid;
  v_lote_de jsonb := '{}'::jsonb;
  v_lote uuid;
  v_n_atipicos integer;
  v_u jsonb;
  v_v jsonb;
  v_ci_ids uuid[];
  v_ci_cupo integer[];
  v_c record;
  v_k integer;
  v_var uuid;
  v_buenas integer;
  v_danadas integer;
  v_resto integer;
  v_toma integer;
  v_ci uuid;
  v_idx integer;
  v_ch_ci uuid[];
  v_ch_b integer[];
  v_ch_d integer[];
  v_tipo text;
  v_movs uuid[];
  v_mov_b uuid;
  v_mov_d uuid;
  v_m uuid;
  v_i integer;
begin
  -- FOR KEY SHARE: un comprobante no se anula (anular_compra lo toma FOR UPDATE) mientras se le cargan entradas, y si se anuló justo
  -- antes, lo de abajo ya lo ve anulado. No choca con la escritura de `recibido_cantidad` (otra recepción del mismo papel espera
  -- en sus líneas, no aquí).
  perform 1
     from retail.compras c
    where c.id in (select ci.compra_id
                     from retail.compra_items ci
                     join retail.despacho_items di on di.orden_compra_item_id = ci.orden_compra_item_id
                    where di.despacho_id = p_despacho_id)
    order by c.id
      for key share;
  v_compra_items := array(select ci.id
                            from retail.compra_items ci
                            join retail.compras c on c.id = ci.compra_id and c.estado = 'vigente'
                            join retail.despacho_items di on di.orden_compra_item_id = ci.orden_compra_item_id
                           where di.despacho_id = p_despacho_id);
  perform retail.fn_bloquear_en_orden(p_ubicacion_id, p_variantes, true, v_compra_items);

  -- ---- Cada prenda contada: existe, está activa y es de la categoría y marca de su línea. ----
  for v_malo in
    select u ->> 'donde' as donde, vr.id as variante_id, pr.estado, pr.estado_alta, vr.activo,
           (pr.categoria_id is not distinct from (u ->> 'categoria_id')::uuid
            and pr.marca_id is not distinct from (u ->> 'marca_id')::uuid) as de_la_linea
      from jsonb_array_elements(p_unidades) u
     cross join lateral jsonb_array_elements(u -> 'variantes') v
      left join retail.variantes vr on vr.id = (v ->> 'variante_id')::uuid
      left join retail.productos pr on pr.id = vr.producto_id
     where vr.id is null
        or pr.categoria_id is distinct from (u ->> 'categoria_id')::uuid
        or pr.marca_id is distinct from (u ->> 'marca_id')::uuid
        or pr.estado <> 'activo' or pr.estado_alta = 'rechazado' or not vr.activo
     limit 1
  loop
    if v_malo.variante_id is null then
      raise exception 'Una de las prendas de % ya no existe: recarga la pantalla', v_malo.donde using hint = 'recepcion_prenda_no_existe';
    end if;
    if not v_malo.de_la_linea then
      raise exception 'Una de las prendas de % es de otra categoría o marca: elígela de nuevo', v_malo.donde
        using hint = 'recepcion_prenda_ajena';
    end if;
    raise exception 'Una de las prendas de % no está activa: elígela de nuevo', v_malo.donde using hint = 'recepcion_prenda_inactiva';
  end loop;

  -- ---- Costo atípico (decisión 18: quien recibe ve y corrige el costo). Las variantes ya están bloqueadas: su costo vigente no cambia
  -- mientras se compara. Se confirma por línea (`confirma_costo`), y lo confirma quien ve los costos al recibir. ----
  select jsonb_agg(jsonb_build_object(
           'despacho_item_id', u -> 'despacho_item_id', 'extra', u -> 'extra', 'variante_id', vr.id, 'motivo', x.motivo,
           'costo', (u ->> 'costo')::numeric, 'vigente', vr.costo, 'precio', vr.precio, 'sku', vr.codigo,
           'costo_unitario', (u ->> 'costo')::numeric, 'costo_vigente', vr.costo,
           'proveedor_id', u -> 'proveedor_id', 'confirmada', (u ->> 'confirma')::boolean
         ) order by (u ->> 'tipo') desc, (u ->> 'orden_numero')::integer, (u ->> 'posicion')::integer, (u ->> 'extra')::integer, vr.codigo)
    into v_atipicos
    from jsonb_array_elements(p_unidades) u
   cross join lateral jsonb_array_elements(u -> 'variantes') v
    join retail.variantes vr on vr.id = (v ->> 'variante_id')::uuid
   cross join lateral (select retail.fn_costo_fuera_de_banda((u ->> 'costo')::numeric, vr.costo, vr.precio) as motivo) x
   where (v ->> 'cantidad')::integer > 0
     and x.motivo is not null;
  if v_atipicos is not null then
    if not retail.fn_ve_costos_al_recibir() then
      raise exception 'Hay un costo fuera de lo normal y tu rol no puede confirmarlo: pídeselo a quien ve los costos de Compras'
        using hint = 'recepcion_costo_atipico_sin_permiso';
    end if;
    select jsonb_agg(a - 'confirmada' - 'proveedor_id') into v_sin_marca
      from jsonb_array_elements(v_atipicos) a
     where not (a ->> 'confirmada')::boolean;
    if v_sin_marca is not null then
      raise exception 'Hay un costo fuera de lo normal: revísalo y confírmalo para recibir'
        using hint = 'recepcion_costo_atipico', detail = v_sin_marca::text;
    end if;
  end if;

  -- ---- Dónde entra: lo bueno al almacén, lo dañado a la cuarentena (decisión 23). ----
  v_sub_almacen := retail.fn_sububicacion_por_defecto(p_ubicacion_id, 'entrada');
  v_sub_cuarentena := (select s.id from retail.sububicaciones s
                        where s.ubicacion_id = p_ubicacion_id and s.tipo = 'cuarentena');
  if v_sub_cuarentena is null and exists (
    select 1 from jsonb_array_elements(p_unidades) u cross join lateral jsonb_array_elements(u -> 'variantes') v
     where (v ->> 'danadas')::integer > 0
  ) then
    raise exception 'Esta sede no separa la cuarentena: aquí no se reciben prendas dañadas' using hint = 'recepcion_sin_cuarentena';
  end if;

  -- ---- Un lote por proveedor que trajo algo (un fardo puede traer dos, decisión 11). ----
  -- ADR-0393: el lote es de quien trae ENTRADAS (en recibir_despacho es lo mismo que «contó algo»: lo contado es la suma de sus tallas;
  -- en el cierre de un conteo se puede contar sin detallar) y, si el envío ya tiene el de ese proveedor (un cierre después de reabrir),
  -- se usa ese.
  for v_prov in
    select distinct (u ->> 'proveedor_id')::uuid
      from jsonb_array_elements(p_unidades) u
     where exists (select 1 from jsonb_array_elements(u -> 'variantes') v where (v ->> 'cantidad')::integer > 0)
     order by 1
  loop
    v_lote := (select l.id from retail.lotes l where l.despacho_id = p_despacho_id and l.proveedor_id = v_prov);
    if v_lote is not null then
      v_lote_de := v_lote_de || jsonb_build_object(v_prov::text, v_lote);
      continue;
    end if;
    v_n_atipicos := coalesce((select count(*) from jsonb_array_elements(v_atipicos) a where (a ->> 'proveedor_id')::uuid = v_prov), 0);
    insert into retail.lotes (ubicacion_id, proveedor_id, numero_guia, recibido_por, nota, despacho_id)
    values (p_ubicacion_id, v_prov, p_numero_guia, p_actor,
            concat_ws(' · ', 'Envío ' || p_envio, p_nota,
                      case when v_n_atipicos = 1 then 'Costo atípico confirmado en 1 talla o color'
                           when v_n_atipicos > 1 then 'Costo atípico confirmado en ' || v_n_atipicos || ' tallas o colores' end),
            p_despacho_id)
    returning id into v_lote;
    v_lote_de := v_lote_de || jsonb_build_object(v_prov::text, v_lote);
  end loop;

  -- ---- Lo que entra, línea por línea y variante por variante. ----
  for v_u in
    select u.value
      from jsonb_array_elements(p_unidades) u
     order by (u.value ->> 'tipo') desc, (u.value ->> 'orden_numero')::integer, (u.value ->> 'posicion')::integer,
              (u.value ->> 'extra')::integer
  loop
    v_lote := (v_lote_de ->> (v_u ->> 'proveedor_id'))::uuid;
    v_costo := (v_u ->> 'costo')::numeric;

    -- El papel (decisión 9): las líneas de comprobantes VIGENTES de esa línea pedida, con cupo (facturado − recibido − cerrado);
    -- primero la que nombra el envío, después las más antiguas. Lo que pase del cupo entra sin papel.
    v_ci_ids := '{}';
    v_ci_cupo := '{}';
    if v_u ->> 'tipo' = 'linea' then
      for v_c in
        select ci.id,
               ci.cantidad
                 - coalesce((select sum(mv.cantidad) from retail.movimientos mv where mv.compra_item_id = ci.id), 0)
                 - coalesce((select sum(k.cantidad) from retail.compra_item_cierres k where k.compra_item_id = ci.id), 0) as cupo
          from retail.compra_items ci
          join retail.compras c on c.id = ci.compra_id and c.estado = 'vigente'
         where ci.orden_compra_item_id = (v_u ->> 'orden_compra_item_id')::uuid
         order by coalesce(ci.id = (v_u ->> 'compra_item_id')::uuid, false) desc, c.created_at, ci.id
      loop
        if v_c.cupo > 0 then
          v_ci_ids := array_append(v_ci_ids, v_c.id);
          v_ci_cupo := array_append(v_ci_cupo, v_c.cupo::integer);
        end if;
      end loop;
    end if;
    v_k := 1;

    for v_v in select x.value from jsonb_array_elements(v_u -> 'variantes') with ordinality x order by x.ordinality loop
      if (v_v ->> 'cantidad')::integer = 0 then
        continue;
      end if;
      v_var := (v_v ->> 'variante_id')::uuid;
      v_danadas := (v_v ->> 'danadas')::integer;
      v_buenas := (v_v ->> 'cantidad')::integer - v_danadas;

      -- Se reparte por el cupo del papel: primero las buenas, después las dañadas (también llegaron: cuentan como recibidas).
      v_ch_ci := '{}';
      v_ch_b := '{}';
      v_ch_d := '{}';
      foreach v_tipo in array array['buenas', 'danadas'] loop
        v_resto := case v_tipo when 'buenas' then v_buenas else v_danadas end;
        while v_resto > 0 loop
          if v_k <= coalesce(array_length(v_ci_ids, 1), 0) then
            v_toma := least(v_resto, v_ci_cupo[v_k]);
            v_ci := v_ci_ids[v_k];
            v_ci_cupo[v_k] := v_ci_cupo[v_k] - v_toma;
            if v_ci_cupo[v_k] = 0 then
              v_k := v_k + 1;
            end if;
          else
            v_toma := v_resto;
            v_ci := null;
          end if;
          v_idx := array_position(v_ch_ci, v_ci);
          if v_idx is null then
            v_ch_ci := array_append(v_ch_ci, v_ci);
            v_ch_b := array_append(v_ch_b, 0);
            v_ch_d := array_append(v_ch_d, 0);
            v_idx := array_length(v_ch_ci, 1);
          end if;
          if v_tipo = 'buenas' then
            v_ch_b[v_idx] := v_ch_b[v_idx] + v_toma;
          else
            v_ch_d[v_idx] := v_ch_d[v_idx] + v_toma;
          end if;
          v_resto := v_resto - v_toma;
        end loop;
      end loop;

      -- Las entradas (el stock todavía no se toca), su dañada y su fila de lo recibido.
      v_movs := '{}';
      for v_i in 1 .. coalesce(array_length(v_ch_ci, 1), 0) loop
        v_mov_b := null;
        v_mov_d := null;
        if v_ch_b[v_i] > 0 then
          insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, lote_id, compra_item_id,
                                          usuario_id, nota)
          values (v_var, p_ubicacion_id, v_sub_almacen, 'entrada', v_ch_b[v_i], 'recepcion', v_lote, v_ch_ci[v_i],
                  p_actor, 'Llegó en ' || p_envio)
          returning id into v_mov_b;
          v_movs := array_append(v_movs, v_mov_b);
        end if;
        if v_ch_d[v_i] > 0 then
          insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, lote_id, compra_item_id,
                                          usuario_id, nota)
          values (v_var, p_ubicacion_id, v_sub_cuarentena, 'entrada', v_ch_d[v_i], 'recepcion', v_lote, v_ch_ci[v_i],
                  p_actor, 'Llegó dañada en ' || p_envio)
          returning id into v_mov_d;
          v_movs := array_append(v_movs, v_mov_d);
          -- La dañada, en cuarentena con su fila (decisiones 23 y 27): se arregla, liquida, regala, desecha o devuelve desde
          -- Existencias. Sin proveedor: esa columna es solo de «devuelta al proveedor» (se lee del lote).
          insert into retail.prendas_danadas (variante_id, ubicacion_id, cantidad, movimiento_entrada_id, motivo_reporte, nota)
          values (v_var, p_ubicacion_id, v_ch_d[v_i], v_mov_d, 'Llegó dañada en ' || p_envio,
                  case v_v ->> 'solucion' when 'pendiente' then 'Tiene arreglo' else 'Sin arreglo' end);
        end if;
        insert into retail.despacho_recibidos (despacho_id, despacho_item_id, extra_posicion, proveedor_id, categoria_id, marca_id,
                                               variante_id, cantidad, danadas, danada_solucion, costo_unitario, movimiento_id,
                                               movimiento_danada_id, compra_item_id, creado_por)
        values (p_despacho_id, (v_u ->> 'despacho_item_id')::uuid, (v_u ->> 'extra')::integer, (v_u ->> 'proveedor_id')::uuid,
                (v_u ->> 'categoria_id')::uuid, (v_u ->> 'marca_id')::uuid, v_var, v_ch_b[v_i] + v_ch_d[v_i], v_ch_d[v_i],
                case when v_ch_d[v_i] > 0 then v_v ->> 'solucion' end, v_costo, v_mov_b, v_mov_d, v_ch_ci[v_i], p_actor);
      end loop;

      -- El costo: UNA vez por variante, con todas sus unidades (buenas y dañadas) y ANTES de aplicar sus entradas [provisional:
      -- también lo que sobró, aun si es regalo, al costo de la línea]. Después, el stock.
      perform retail.fn_recalcular_costo_variante(v_var, v_buenas + v_danadas, v_costo, 'compra', v_movs[1]);
      foreach v_m in array v_movs loop
        perform retail.fn_aplicar_movimiento(v_m);
      end loop;
    end loop;

    -- Lo que faltó o sobró: la deuda que resuelve la fase 5.
    if v_u ->> 'tipo' = 'linea' and (v_u ->> 'contado')::integer < (v_u ->> 'enviado')::integer then
      insert into retail.despacho_diferencias (despacho_id, despacho_item_id, extra_posicion, proveedor_id, categoria_id, marca_id, tipo,
                                               causa, cantidad, costo_unitario, nota, creado_por)
      values (p_despacho_id, (v_u ->> 'despacho_item_id')::uuid, null, (v_u ->> 'proveedor_id')::uuid, (v_u ->> 'categoria_id')::uuid,
              (v_u ->> 'marca_id')::uuid, 'faltante', v_u ->> 'faltante_causa',
              (v_u ->> 'enviado')::integer - (v_u ->> 'contado')::integer, v_costo, v_u ->> 'nota', p_actor);
    elsif (v_u ->> 'contado')::integer > (v_u ->> 'enviado')::integer then
      insert into retail.despacho_diferencias (despacho_id, despacho_item_id, extra_posicion, proveedor_id, categoria_id, marca_id, tipo,
                                               causa, cantidad, costo_unitario, nota, creado_por)
      values (p_despacho_id, (v_u ->> 'despacho_item_id')::uuid, (v_u ->> 'extra')::integer, (v_u ->> 'proveedor_id')::uuid,
              (v_u ->> 'categoria_id')::uuid, (v_u ->> 'marca_id')::uuid, 'sobrante', v_u ->> 'sobrante_causa',
              (v_u ->> 'contado')::integer - (v_u ->> 'enviado')::integer, v_costo, v_u ->> 'nota', p_actor);
    end if;
  end loop;
end;
$$;
comment on function retail.fn_recepcion_entrar(uuid, uuid, text, text, uuid, jsonb, uuid[], text) is
  'ADR-0393: lo que entra de un envío abierto y ya validado —papel hasta su cupo, prendas, costo atípico, un lote por proveedor (o el '
  'que ya tenga el envío), entradas al almacén y a la cuarentena, costo promediado, lo recibido y lo que faltó o sobró—. La única '
  'puerta al stock de una recepción: la usan recibir_despacho y el cierre de un conteo. Interna.';
revoke all on function retail.fn_recepcion_entrar(uuid, uuid, text, text, uuid, jsonb, uuid[], text) from public, anon, authenticated;

-- ---------- 2. recibir_despacho: la misma firma y la misma respuesta, sobre la puerta única ----------
create or replace function retail.recibir_despacho(
  p_despacho_id uuid,
  p_version integer,
  p_lineas jsonb,
  p_extras jsonb default '[]'::jsonb,
  p_nota text default null,
  p_token uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public, extensions
as $$
declare
  v_actor uuid;
  v_despacho retail.despachos;
  v_envio text;
  v_extras jsonb := coalesce(p_extras, '[]'::jsonb);
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  v_huella text;
  v_proveedores uuid[];
  v_unidades jsonb := '[]'::jsonb;
  v_vistas uuid[] := '{}';
  v_e jsonb;
  v_pos integer;
  v_item record;
  v_id uuid;
  v_costo numeric;
  v_vars jsonb;
  v_contado integer;
  v_falt text;
  v_sobr text;
  v_nota_u text;
  v_donde text;
  v_prov uuid;
  v_cat uuid;
  v_marca uuid;
  v_variantes uuid[];
  v_resto integer;
  v_toma integer;
  v_res jsonb;
  v_desc text;
begin
  if retail.fn_ve_modulo('recibir') is not true then
    raise exception 'Recibir un envío necesita el módulo «Recibir mercadería» en tu rol'
      using errcode = '42501', hint = 'recibir_sin_modulo';
  end if;

  -- Candados, siempre en el mismo orden (ADR-0190): el envío → sus órdenes → sus líneas pedidas → los comprobantes y sus líneas →
  -- las variantes → el stock. Primero el envío: dos personas cerrando a la vez se ponen en fila y la segunda ve lo que dejó la primera.
  select d.* into v_despacho from retail.despachos d where d.id = p_despacho_id for update;
  if not found then
    raise exception 'Ese envío no existe' using hint = 'envio_no_existe';
  end if;
  v_envio := retail.fn_envio_numero_texto(v_despacho.numero);

  -- Doble clic o reintento sin red: la misma recepción (mismo token, misma huella) ya se guardó y se devuelve lo mismo, aunque quien
  -- la hizo ya no esté de turno (comprobar algo guardado no escribe nada). El mismo token con otros datos no es un reintento.
  v_huella := md5(jsonb_build_object('lineas', p_lineas, 'extras', v_extras, 'nota', p_nota)::text);
  if p_token is not null then
    if v_despacho.recepcion_token = p_token then
      if v_despacho.recepcion_huella = v_huella then
        return retail.fn_recepcion_resultado(v_despacho.id);
      end if;
      raise exception 'Esa recepción ya se guardó con otros datos: recarga la pantalla' using hint = 'recepcion_otros_datos';
    end if;
    if exists (select 1 from retail.despachos d where d.recepcion_token = p_token and d.id <> p_despacho_id) then
      raise exception 'Esa recepción ya se guardó con otros datos: recarga la pantalla' using hint = 'recepcion_otros_datos';
    end if;
  end if;

  if v_despacho.estado = 'cerrado' then
    raise exception 'Este envío ya se recibió' using hint = 'envio_ya_recibido';
  end if;
  if v_despacho.estado = 'anulado' then
    raise exception 'Este envío se anuló: ya no llega' using hint = 'envio_anulado';
  end if;
  if v_despacho.estado = 'en_camino' then
    raise exception 'Este envío todavía no se abrió: pulsa «Empezar a recibir»' using hint = 'envio_sin_abrir';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  perform retail.fn_recepcion_exigir(v_despacho.id, v_despacho.ubicacion_destino_id, v_actor);
  if p_version is null then
    raise exception 'Falta saber qué versión del envío viste: recarga la pantalla' using hint = 'envio_sin_version';
  end if;
  if v_despacho.version <> p_version then
    raise exception 'Alguien cambió este envío: recarga' using errcode = 'PT409', hint = 'version_cambiada';
  end if;
  if v_nota is not null and length(v_nota) > 500 then
    raise exception 'La nota es muy larga: hasta 500 letras' using hint = 'recepcion_nota';
  end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' then
    raise exception 'Falta lo que se contó de cada línea: recarga la pantalla' using hint = 'recepcion_lineas';
  end if;
  if jsonb_typeof(v_extras) <> 'array' then
    raise exception 'Lo que no estaba en la guía no se entiende: recarga la pantalla' using hint = 'recepcion_extra';
  end if;

  -- Las órdenes del envío (nadie las anula, edita ni les registra papel mientras se recibe) y sus líneas pedidas.
  perform 1
     from retail.ordenes_compra o
    where o.id in (select i.orden_compra_id
                     from retail.despacho_items di
                     join retail.orden_compra_items i on i.id = di.orden_compra_item_id
                    where di.despacho_id = p_despacho_id)
    order by o.id
      for share;
  perform 1
     from retail.orden_compra_items i
    where i.id in (select di.orden_compra_item_id from retail.despacho_items di where di.despacho_id = p_despacho_id)
    order by i.id
      for update;
  v_proveedores := array(select distinct o.proveedor_id
                           from retail.despacho_items di
                           join retail.orden_compra_items i on i.id = di.orden_compra_item_id
                           join retail.ordenes_compra o on o.id = i.orden_compra_id
                          where di.despacho_id = p_despacho_id);

  -- ---- Las líneas del envío: todas, una sola vez. Solo la forma y las cuentas; las prendas se miran con los candados tomados. ----
  v_pos := 0;
  for v_e in select e.value from jsonb_array_elements(p_lineas) e loop
    v_pos := v_pos + 1;
    if jsonb_typeof(v_e) <> 'object' then
      raise exception 'La línea % no se entiende: recarga la pantalla', v_pos using hint = 'recepcion_lineas';
    end if;
    begin
      v_id := nullif(btrim(v_e ->> 'despacho_item_id'), '')::uuid;
    exception when others then
      raise exception 'La línea % no se entiende: recarga la pantalla', v_pos using hint = 'recepcion_lineas';
    end;
    select di.id, di.cantidad, di.precio_unitario, di.categoria_id, di.marca_id, di.compra_item_id, di.orden_compra_item_id,
           i.posicion, o.numero as orden_numero, o.proveedor_id,
           concat_ws(' · ', c.nombre, m.nombre, di.descripcion) as etiqueta
      into v_item
      from retail.despacho_items di
      join retail.orden_compra_items i on i.id = di.orden_compra_item_id
      join retail.ordenes_compra o on o.id = i.orden_compra_id
      join retail.categorias c on c.id = di.categoria_id
      join retail.marcas m on m.id = di.marca_id
     where di.id = v_id and di.despacho_id = p_despacho_id;
    if not found then
      raise exception 'La línea % no es de este envío: recarga la pantalla', v_pos using hint = 'recepcion_linea_ajena';
    end if;
    if v_id = any(v_vistas) then
      raise exception 'La línea % se repite: cada línea del envío va una sola vez', v_pos using hint = 'recepcion_linea_repetida';
    end if;
    v_vistas := v_vistas || v_id;
    v_donde := v_item.etiqueta;

    begin
      v_costo := nullif(btrim(v_e ->> 'costo_unitario'), '')::numeric;
    exception when others then
      raise exception 'El costo de % no se entiende: escribe solo números', v_donde using hint = 'recepcion_costo';
    end;
    v_costo := coalesce(v_costo, v_item.precio_unitario);
    if v_costo < 0 or v_costo > 99999.99 or v_costo <> round(v_costo, 2) then
      raise exception 'El costo de % va de S/ 0 a S/ 99 999.99, con hasta dos decimales', v_donde using hint = 'recepcion_costo';
    end if;
    v_vars := retail.fn_recepcion_leer_variantes(v_e -> 'variantes', v_donde);
    v_contado := coalesce((select sum((x ->> 'cantidad')::integer) from jsonb_array_elements(v_vars) x), 0);
    v_falt := nullif(btrim(coalesce(v_e ->> 'faltante_causa', '')), '');
    v_sobr := nullif(btrim(coalesce(v_e ->> 'sobrante_causa', '')), '');
    v_nota_u := nullif(btrim(coalesce(v_e ->> 'nota', '')), '');

    -- Lo que faltó (decisión 14) o sobró (decisión 15): la causa la elige quien recibe, y solo cuando hace falta.
    if v_contado < v_item.cantidad then
      if v_falt is null then
        raise exception 'Faltan % de %: elige qué pasó', v_item.cantidad - v_contado, v_donde using hint = 'recepcion_faltante_causa';
      end if;
      if v_falt not in ('no_vino', 'se_perdio', 'otra_sede') then
        raise exception 'No se entiende qué pasó con lo que falta de %: elige una opción', v_donde using hint = 'recepcion_faltante_causa';
      end if;
    elsif v_falt is not null then
      raise exception 'De % no falta nada: quita «qué pasó»', v_donde using hint = 'recepcion_faltante_causa';
    end if;
    if v_contado > v_item.cantidad then
      if v_sobr is null then
        raise exception 'Vinieron % de más de %: elige qué pasa con ellas', v_contado - v_item.cantidad, v_donde
          using hint = 'recepcion_sobrante_causa';
      end if;
      if v_sobr not in ('regalo', 'cobra_aparte', 'proxima_compra', 'reposicion_faltante') then
        raise exception 'No se entiende qué pasa con lo de más de %: elige una opción', v_donde using hint = 'recepcion_sobrante_causa';
      end if;
    elsif v_sobr is not null then
      raise exception 'De % no vino nada de más: quita «qué pasa con lo de más»', v_donde using hint = 'recepcion_sobrante_causa';
    end if;
    if v_nota_u is not null and length(v_nota_u) > 300 then
      raise exception 'La nota de % es muy larga: hasta 300 letras', v_donde using hint = 'recepcion_nota';
    end if;

    v_unidades := v_unidades || jsonb_build_object(
      'tipo', 'linea', 'despacho_item_id', v_item.id, 'extra', null, 'orden_numero', v_item.orden_numero, 'posicion', v_item.posicion,
      'orden_compra_item_id', v_item.orden_compra_item_id, 'compra_item_id', v_item.compra_item_id,
      'proveedor_id', v_item.proveedor_id, 'categoria_id', v_item.categoria_id, 'marca_id', v_item.marca_id,
      'enviado', v_item.cantidad, 'costo', v_costo,
      'confirma', coalesce(lower(v_e ->> 'confirma_costo') = 'true', false),
      'variantes', v_vars, 'contado', v_contado, 'faltante_causa', v_falt, 'sobrante_causa', v_sobr, 'nota', v_nota_u,
      'donde', v_donde);
  end loop;
  for v_item in
    select di.id, i.posicion, o.numero as orden_numero, concat_ws(' · ', c.nombre, m.nombre, di.descripcion) as etiqueta
      from retail.despacho_items di
      join retail.orden_compra_items i on i.id = di.orden_compra_item_id
      join retail.ordenes_compra o on o.id = i.orden_compra_id
      join retail.categorias c on c.id = di.categoria_id
      join retail.marcas m on m.id = di.marca_id
     where di.despacho_id = p_despacho_id and not (di.id = any(v_vistas))
     order by o.numero, i.posicion
     limit 1
  loop
    raise exception 'Falta contar % (línea % de la %): cuéntala, aunque no haya llegado nada', v_item.etiqueta, v_item.posicion,
      retail.fn_orden_compra_numero_texto(v_item.orden_numero) using hint = 'recepcion_falta_linea';
  end loop;

  -- ---- Lo que no estaba en la guía (decisión 13): todo sobra, con su causa. ----
  v_pos := 0;
  for v_e in select e.value from jsonb_array_elements(v_extras) e loop
    v_pos := v_pos + 1;
    v_donde := 'lo que no estaba en la guía (fila ' || v_pos || ')';
    if jsonb_typeof(v_e) <> 'object' then
      raise exception 'No se entiende %: recarga la pantalla', v_donde using hint = 'recepcion_extra';
    end if;
    begin
      v_prov := nullif(btrim(v_e ->> 'proveedor_id'), '')::uuid;
      v_cat := nullif(btrim(v_e ->> 'categoria_id'), '')::uuid;
      v_marca := nullif(btrim(v_e ->> 'marca_id'), '')::uuid;
    exception when others then
      raise exception 'No se entiende %: recarga la pantalla', v_donde using hint = 'recepcion_extra';
    end;
    if v_prov is null then
      if cardinality(v_proveedores) <> 1 then
        raise exception 'Este envío trae varios proveedores: elige de cuál es %', v_donde using hint = 'recepcion_extra_proveedor';
      end if;
      v_prov := v_proveedores[1];
    elsif not (v_prov = any(v_proveedores)) then
      raise exception 'El proveedor de % no viene en este envío: elige uno de los del envío', v_donde using hint = 'recepcion_extra_proveedor';
    end if;
    if v_cat is null or not exists (select 1 from retail.categorias c where c.id = v_cat and c.activo) then
      raise exception 'Elige una categoría activa para %', v_donde using hint = 'recepcion_extra_categoria';
    end if;
    if v_marca is null or not exists (select 1 from retail.marcas m where m.id = v_marca and m.activo) then
      raise exception 'Elige una marca activa para %', v_donde using hint = 'recepcion_extra_marca';
    end if;
    v_donde := concat_ws(' · ', (select c.nombre from retail.categorias c where c.id = v_cat),
                         (select m.nombre from retail.marcas m where m.id = v_marca)) || ' (fuera de la guía)';
    begin
      v_costo := nullif(btrim(v_e ->> 'costo_unitario'), '')::numeric;
    exception when others then
      raise exception 'El costo de % no se entiende: escribe solo números', v_donde using hint = 'recepcion_costo';
    end;
    if v_costo is null then
      raise exception 'Escribe el costo de %', v_donde using hint = 'recepcion_costo';
    end if;
    if v_costo < 0 or v_costo > 99999.99 or v_costo <> round(v_costo, 2) then
      raise exception 'El costo de % va de S/ 0 a S/ 99 999.99, con hasta dos decimales', v_donde using hint = 'recepcion_costo';
    end if;
    v_vars := retail.fn_recepcion_leer_variantes(v_e -> 'variantes', v_donde);
    v_contado := coalesce((select sum((x ->> 'cantidad')::integer) from jsonb_array_elements(v_vars) x), 0);
    if v_contado = 0 then
      raise exception 'Cuenta lo que llegó de % o quítalo', v_donde using hint = 'recepcion_extra_vacio';
    end if;
    v_sobr := nullif(btrim(coalesce(v_e ->> 'sobrante_causa', '')), '');
    if v_sobr is null or v_sobr not in ('regalo', 'cobra_aparte', 'proxima_compra', 'reposicion_faltante') then
      raise exception 'Elige qué pasa con %', v_donde using hint = 'recepcion_sobrante_causa';
    end if;
    v_nota_u := nullif(btrim(coalesce(v_e ->> 'nota', '')), '');
    if v_nota_u is not null and length(v_nota_u) > 300 then
      raise exception 'La nota de % es muy larga: hasta 300 letras', v_donde using hint = 'recepcion_nota';
    end if;
    v_unidades := v_unidades || jsonb_build_object(
      'tipo', 'extra', 'despacho_item_id', null, 'extra', v_pos, 'orden_numero', null, 'posicion', null,
      'orden_compra_item_id', null, 'compra_item_id', null,
      'proveedor_id', v_prov, 'categoria_id', v_cat, 'marca_id', v_marca,
      'enviado', 0, 'costo', v_costo,
      'confirma', coalesce(lower(v_e ->> 'confirma_costo') = 'true', false),
      'variantes', v_vars, 'contado', v_contado, 'faltante_causa', null, 'sobrante_causa', v_sobr, 'nota', v_nota_u,
      'donde', v_donde);
  end loop;

  -- ---- Los comprobantes de esas líneas y sus líneas (el papel), las variantes y el stock: en orden. ----
  -- ---- ADR-0362 (fase 5, decisión 14): «Es la reposición de lo que faltó». Lo de más marcado así salda lo que ese proveedor debe
  -- de esa categoría y marca por envíos ANTERIORES (no por este). Sus deudas se bloquean aquí (en orden de id), antes que el papel y el
  -- stock: dos recepciones del mismo proveedor, o una reposición marcada a mano, se ponen en fila y la segunda ve lo que la primera ya
  -- saldó. Lo que pase de lo debido no es reposición: es un sobrante con otra causa. El reparto se escribe al final. ----
  declare
    v_rep record;
  begin
    perform 1
       from retail.despacho_diferencias x
      where x.tipo = 'faltante' and x.causa = 'no_vino' and x.despacho_id <> p_despacho_id
        and (x.proveedor_id, x.categoria_id, x.marca_id) in (
              select (u ->> 'proveedor_id')::uuid, (u ->> 'categoria_id')::uuid, (u ->> 'marca_id')::uuid
                from jsonb_array_elements(v_unidades) u
               where u ->> 'sobrante_causa' = 'reposicion_faltante')
      order by x.id
        for update;
    for v_rep in
      select g.repuesto, pr.nombre as proveedor, concat_ws(' · ', c.nombre, m.nombre) as que,
             retail.fn_nos_debe_pendiente(g.proveedor_id, g.categoria_id, g.marca_id, p_despacho_id) as debe
        from (select (u ->> 'proveedor_id')::uuid as proveedor_id, (u ->> 'categoria_id')::uuid as categoria_id,
                     (u ->> 'marca_id')::uuid as marca_id,
                     sum((u ->> 'contado')::integer - (u ->> 'enviado')::integer)::integer as repuesto
                from jsonb_array_elements(v_unidades) u
               where u ->> 'sobrante_causa' = 'reposicion_faltante'
               group by 1, 2, 3) g
        join retail.proveedores pr on pr.id = g.proveedor_id
        join retail.categorias c on c.id = g.categoria_id
        join retail.marcas m on m.id = g.marca_id
       order by pr.nombre, c.nombre, m.nombre
    loop
      if v_rep.debe = 0 then
        raise exception '% no debe nada de %: elige otra causa para lo de más', v_rep.proveedor, v_rep.que
          using hint = 'recepcion_reposicion_sin_deuda';
      end if;
      if v_rep.repuesto > v_rep.debe then
        raise exception 'Marcaste % como reposición de %, pero % solo debe %: lo que pase de eso es un sobrante con otra causa',
          v_rep.repuesto, v_rep.que, v_rep.proveedor, v_rep.debe using hint = 'recepcion_reposicion_de_mas';
      end if;
    end loop;
  end;

  v_variantes := array(select distinct (v ->> 'variante_id')::uuid
                         from jsonb_array_elements(v_unidades) u
                        cross join lateral jsonb_array_elements(u -> 'variantes') v);
  -- ---- Lo que entra (ADR-0393): el papel, las prendas, el costo atípico, los lotes, el stock y lo que faltó o sobró. Es el ÚNICO
  -- camino que escribe stock de un envío; lo usan esta función y el cierre de un conteo (ADR-0393). ----
  perform retail.fn_recepcion_entrar(p_despacho_id, v_despacho.ubicacion_destino_id, v_despacho.numero_guia, v_envio, v_actor,
                                     v_unidades, v_variantes, v_nota);

  -- ---- El envío queda recibido (decisión 13: y muestra cómo se cerró). ----
  -- ---- ADR-0362 (fase 5, decisión 14): lo de más marcado como reposición salda las deudas de ese proveedor, de esa categoría y
  -- marca, de la más antigua a la más nueva (por cuándo se anotó el faltante; a igual fecha, el envío de menor número), con el envío de
  -- esta recepción y su sobrante. Las deudas ya están bloqueadas y lo marcado cabe en lo debido (arriba). ----
  declare
    v_sob record;
    v_deu record;
    v_resto integer;
    v_toma integer;
  begin
    for v_sob in
      select x.id, x.proveedor_id, x.categoria_id, x.marca_id, x.cantidad
        from retail.despacho_diferencias x
        left join retail.despacho_items xd on xd.id = x.despacho_item_id
        left join retail.orden_compra_items xi on xi.id = xd.orden_compra_item_id
        left join retail.ordenes_compra xo on xo.id = xi.orden_compra_id
       where x.despacho_id = p_despacho_id and x.tipo = 'sobrante' and x.causa = 'reposicion_faltante'
       order by x.extra_posicion nulls first, xo.numero, xi.posicion
    loop
      v_resto := v_sob.cantidad;
      for v_deu in
        select x.id, x.cantidad - s.resuelto as pendiente
          from retail.despacho_diferencias x
          join retail.despachos dd on dd.id = x.despacho_id
         cross join lateral (select coalesce(sum(r.cantidad), 0)::integer as resuelto
                               from retail.proveedor_deuda_resoluciones r
                              where r.diferencia_id = x.id) s
         where x.tipo = 'faltante' and x.causa = 'no_vino' and x.despacho_id <> p_despacho_id
           and x.proveedor_id = v_sob.proveedor_id and x.categoria_id = v_sob.categoria_id and x.marca_id = v_sob.marca_id
           and x.cantidad > s.resuelto
         order by x.creado_en, dd.numero, x.id
      loop
        exit when v_resto = 0;
        v_toma := least(v_resto, v_deu.pendiente);
        insert into retail.proveedor_deuda_resoluciones (diferencia_id, forma, cantidad, despacho_id, sobrante_id, creado_por)
        values (v_deu.id, 'repuesta', v_toma, p_despacho_id, v_sob.id, v_actor);
        v_resto := v_resto - v_toma;
      end loop;
      if v_resto > 0 then
        raise exception 'Lo marcado como reposición en % ya no cabe en lo que el proveedor debe: recarga la pantalla', v_envio
          using hint = 'recepcion_reposicion_de_mas';
      end if;
    end loop;
  end;

  update retail.despachos d
     set estado = 'cerrado',
         cerrado_por = v_actor,
         cerrado_en = now(),
         nota_recepcion = v_nota,
         recepcion_token = p_token,
         recepcion_huella = v_huella
   where d.id = p_despacho_id;

  v_res := retail.fn_recepcion_resultado(p_despacho_id);

  -- Actividad (ADR-0207), sin montos: «recibió ENV-000061 (32 prendas: 30 buenas, 2 dañadas; faltan 2)». Si falla, igual queda.
  begin
    if (v_res ->> 'unidades')::integer = 0 then
      v_desc := 'cerró la ' || v_envio || ' sin prendas';
    else
      v_desc := 'recibió ' || v_envio || ' (' || (v_res ->> 'unidades')
        || case when (v_res ->> 'unidades')::integer = 1 then ' prenda' else ' prendas' end
        || case when (v_res ->> 'danadas')::integer > 0
                then ': ' || (v_res ->> 'buenas') || case when (v_res ->> 'buenas')::integer = 1 then ' buena, ' else ' buenas, ' end
                     || (v_res ->> 'danadas') || case when (v_res ->> 'danadas')::integer = 1 then ' dañada' else ' dañadas' end
                else '' end;
    end if;
    v_desc := v_desc
      || case when (v_res ->> 'faltan')::integer = 1 then '; falta 1'
              when (v_res ->> 'faltan')::integer > 1 then '; faltan ' || (v_res ->> 'faltan') else '' end
      || case when (v_res ->> 'sobran')::integer = 1 then '; sobra 1'
              when (v_res ->> 'sobran')::integer > 1 then '; sobran ' || (v_res ->> 'sobran') else '' end
      || case when (v_res ->> 'unidades')::integer = 0 then '' else ')' end;
    perform retail.fn_actividad_anotar(
      'recibir', 'despacho_recibido', v_desc,
      v_actor, retail.fn_actividad_terminal_ahora(), v_despacho.ubicacion_destino_id, null,
      'despachos', p_despacho_id::text, now(),
      jsonb_build_object('despacho_id', p_despacho_id, 'envio', v_envio, 'unidades', (v_res ->> 'unidades')::integer,
                         'buenas', (v_res ->> 'buenas')::integer, 'danadas', (v_res ->> 'danadas')::integer,
                         'faltan', (v_res ->> 'faltan')::integer, 'sobran', (v_res ->> 'sobran')::integer,
                         'ordenes', (select jsonb_agg(distinct retail.fn_orden_compra_numero_texto(o.numero))
                                       from retail.despacho_items di
                                       join retail.orden_compra_items i on i.id = di.orden_compra_item_id
                                       join retail.ordenes_compra o on o.id = i.orden_compra_id
                                      where di.despacho_id = p_despacho_id)),
      'vivo');
  exception when others then
    raise warning 'actividad: no se anotó la recepción del envío % (%)', v_envio, sqlerrm;
  end;

  return v_res;
end;

$$;
comment on function retail.recibir_despacho(uuid, integer, jsonb, jsonb, text, uuid) is
  'ADR-0362 (fases 4 y 5) y ADR-0393: cierra la recepción de un envío abierto. Por línea (todas, una vez): lo contado talla por talla '
  '(buenas al almacén, dañadas a la cuarentena con su fila en prendas_danadas), el costo corregido (promedio ponderado), lo que faltó o '
  'sobró con su causa; y lo que no estaba en la guía. Un sobrante «reposicion_faltante» (fase 5) solo vale si ese proveedor debe eso de '
  'esa categoría y marca por envíos anteriores, y salda sus deudas de la más antigua a la más nueva (proveedor_deuda_resoluciones). Lo '
  'que entra lo escribe fn_recepcion_entrar (la única puerta al stock de una recepción). Un lote por proveedor; las entradas llevan la '
  'línea del papel hasta su cupo. Costo atípico: hint recepcion_costo_atipico con el detalle en JSON. Módulo Recibir, su sede y la '
  'decisión 17. Token + huella; versión vieja: PT409. Devuelve {despacho_id, numero, lotes, unidades, buenas, danadas, faltan, sobran}.';
revoke all on function retail.recibir_despacho(uuid, integer, jsonb, jsonb, text, uuid) from public, anon;
grant execute on function retail.recibir_despacho(uuid, integer, jsonb, jsonb, text, uuid) to authenticated, service_role;

-- ---------- 3. Comprobación: si algo no quedó, la migración no se da por aplicada ----------
do $$
declare
  v_def text;
  v_marca text;
begin
  if to_regprocedure('retail.fn_recepcion_entrar(uuid,uuid,text,text,uuid,jsonb,uuid[],text)') is null then
    raise exception 'falta retail.fn_recepcion_entrar';
  end if;
  if not (select p.prosecdef from pg_proc p where p.oid = 'retail.fn_recepcion_entrar(uuid,uuid,text,text,uuid,jsonb,uuid[],text)'::regprocedure) then
    raise exception 'fn_recepcion_entrar tiene que ser security definer';
  end if;
  if has_function_privilege('authenticated', 'retail.fn_recepcion_entrar(uuid,uuid,text,text,uuid,jsonb,uuid[],text)', 'execute')
     or has_function_privilege('anon', 'retail.fn_recepcion_entrar(uuid,uuid,text,text,uuid,jsonb,uuid[],text)', 'execute') then
    raise exception 'fn_recepcion_entrar es interna: ni authenticated ni anon la ejecutan';
  end if;
  if has_function_privilege('anon', 'retail.recibir_despacho(uuid,integer,jsonb,jsonb,text,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'retail.recibir_despacho(uuid,integer,jsonb,jsonb,text,uuid)', 'execute') then
    raise exception 'recibir_despacho: la ejecuta authenticated y no anon';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'retail' and p.proname in ('recibir_despacho', 'fn_recepcion_entrar')
              group by p.proname having count(*) > 1) then
    raise exception 'recibir_despacho o fn_recepcion_entrar quedó con dos versiones';
  end if;
  v_def := pg_get_functiondef('retail.recibir_despacho(uuid,integer,jsonb,jsonb,text,uuid)'::regprocedure);
  if position('perform retail.fn_recepcion_entrar(' in v_def) = 0 then
    raise exception 'recibir_despacho no entra por fn_recepcion_entrar';
  end if;
  if position('insert into retail.movimientos' in v_def) > 0 or position('insert into retail.despacho_recibidos' in v_def) > 0 then
    raise exception 'recibir_despacho todavía escribe stock por su cuenta: la única puerta es fn_recepcion_entrar';
  end if;
  -- Los tres parches de la fase 5a (20261013015000), con su texto: así re-pegarla no hace nada.
  v_marca := $t$'proxima_compra', 'reposicion_faltante')$t$;
  if (length(v_def) - length(replace(v_def, v_marca, ''))) / length(v_marca) <> 2
     or position('retail.fn_nos_debe_pendiente(g.proveedor_id' in v_def) = 0
     or position('insert into retail.proveedor_deuda_resoluciones' in v_def) = 0 then
    raise exception 'recibir_despacho perdió la reposición de la fase 5a';
  end if;
  v_def := pg_get_functiondef('retail.fn_recepcion_entrar(uuid,uuid,text,text,uuid,jsonb,uuid[],text)'::regprocedure);
  if position('insert into retail.movimientos' in v_def) = 0 or position('perform retail.fn_bloquear_en_orden(' in v_def) = 0 then
    raise exception 'fn_recepcion_entrar no quedó con lo que entra';
  end if;
end;
$$;

reset lock_timeout;
