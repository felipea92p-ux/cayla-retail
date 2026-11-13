-- ============================================================================
-- 20261029190000_produccion_tela_al_cortar.sql — CAYLA V2 (ADR-0570, actividad 4 · 2026-10-29)
--
-- EL PROBLEMA PRIMERO.
--   (1) Una prenda ya entró al stock a S/ 4,50 en vez de S/ 22,38: la orden declaró su tela, nadie anotó cuánta se usó y «Pasar al stock» la dejó pasar con el costo de tela en
--       cero. La pantalla solo avisaba.
--   (2) Anotar la tela pide «¿cuánto usaste?», un número que nadie midió: en el Taller se mide lo que QUEDÓ en el rollo. Y se anota con una llamada por lote: si el corte cruza de
--       lote y la segunda falla, queda la mitad.
--   (3) Un retazo o una tela que nunca se registró no tiene cómo entrar al estante sin inventar una compra.
--
-- QUÉ HACE (Felipe, 2026-10-29, rondas 5 y 7: «¿cuánto quedó?» por color; «sin tela anotada no pasa al stock, salvo el Líder o el Admin con motivo»; «Encontré tela» con el
-- último precio).
--   · `anotar_insumos_de_la_orden(orden, líneas)`: cada tela (por color) o avío con «quedó» (lo que quedó en el estante) o «usado» (lo que salió, como al mandar la tela a un corte de
--     afuera). Lo usado sale de los lotes del más antiguo al más nuevo (PEPS, como `registrar_consumo_insumo`), todo o nada, en una sola llamada: la pantalla ya no parte entre lotes.
--   · `encontre_tela(color, ubicación, cantidad, precio?)`: un lote con origen «encontrada», al precio escrito o al del último lote de ese color.
--   · `permitir_pasar_sin_tela(orden, motivo)`: solo un líder (o un Admin, que también es líder aquí). Queda en la historia de la orden (`produccion_cambios`, acción «sin_tela»).
--   · `cerrar_produccion` exige la tela: si la orden declaró tela (también un forro) y alguna no tiene nada anotado, no pasa al stock salvo que un líder lo haya permitido. Una
--     muestra no.
--
-- CONTRATO (Liskov)
--   PROMETE: lo que quedó nunca pasa de lo que había; lo usado nunca pasa de lo que hay en los lotes; nada queda a medias (todos los colores o ninguno); una orden con tela declarada
--            no entra al stock con un color sin tela anotada, salvo el permiso escrito de un líder. Nada se borra: un lote encontrado es un lote más, con su origen a la vista.
--   ASUME:   las funciones vivas con el texto de hoy (el ancla de `cerrar_produccion` se verificó con las migraciones de esta rama hasta 20261029173000).
--   NO HACE: no exige tela a una orden que no declaró ninguna (ver DESCARTÉ): esa sigue con el aviso de la pantalla. No toca dinero de caja ni comprobantes: un lote encontrado
--            entra al valor del inventario a su precio, sin factura ni pago. No arregla que el saldo de un lote ignore los ajustes (actividad 6).
--
-- DECIDÍ: «quedó» se resta de lo que muestra la pantalla como «en el estante» (el libro de movimientos, `fn_insumo_saldo_en`), y lo usado sale de los lotes. Así el número que la
--   persona ve antes de medir es el mismo que usa la base, y si dos órdenes cortan del mismo rollo, la segunda mide lo que de verdad quedó después de las dos.
-- DESCARTÉ: exigir tela también a una orden que no declaró ninguna. Es la lectura literal de «sin tela no pasa», pero hoy 20 suites de otros módulos (Frescura, el plan del piso,
--   costos) cierran órdenes sin tela para armar su escena, y toda orden abierta sin declarar tela quedaría trabada. La pantalla ya avisa y ofrece «Declarar la tela»; volverlo
--   candado es una decisión de Felipe, aparte.
-- SE ROMPE SI: alguien anota «quedó» de un color que se cortó para dos órdenes a la vez, en una sola medición: la base le carga todo a la orden que anota. Se corrige devolviendo
--   lo que no era suyo («Devolver lo que sobró»).
--
-- PRODUCCIÓN. NO está aplicada. Una sola parte, re-ejecutable, `lock_timeout = 3s`: dos cambios de CHECK (`insumo_lotes.origen`, `produccion_cambios`), funciones nuevas y UN
-- reemplazo ANCLADO en `cerrar_produccion` (ADR-0288). Sin `drop trigger` ni políticas. Dentro del texto de reemplazo no hay ningún `select … into`.
-- Va DESPUÉS de 20261029173000 (usa `produccion_cambios`). Prueba: `pnpm pruebas:produccion-tela-al-cortar`.
-- ============================================================================
set lock_timeout = '3s';

-- Reemplaza `p_viejo` por `p_nuevo` en la función viva; `p_viejo` tiene que aparecer exactamente una vez. Si `p_nuevo` ya está, no hace nada.
create or replace function pg_temp.reemplazar_anclado(p_firma text, p_viejo text, p_nuevo text)
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
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta migración: el ancla aparece % veces (se esperaba 1). Regenera el reemplazo desde su definición real.',
      p_firma, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- 1. Un lote puede ser tela encontrada (un retazo, una tela que nunca se registró): se ve de dónde vino.
alter table retail.insumo_lotes drop constraint if exists insumo_lotes_origen_check;
alter table retail.insumo_lotes add constraint insumo_lotes_origen_check check (origen in ('compra', 'saldo_inicial', 'encontrada'));

-- 2. La historia de la orden guarda también el permiso de pasar al stock sin tela: con su motivo, como cualquier cambio.
alter table retail.produccion_cambios drop constraint if exists produccion_cambios_accion_check;
alter table retail.produccion_cambios add constraint produccion_cambios_accion_check check (accion in ('corregir', 'eliminar', 'restaurar', 'nota', 'sin_tela'));
alter table retail.produccion_cambios drop constraint if exists produccion_cambios_forma;
alter table retail.produccion_cambios add constraint produccion_cambios_forma check (case accion
  when 'nota' then objeto is null and fase_id is null and cardinality(quita_ids) = 0 and cardinality(pone_ids) = 0 and restaura_id is null
  when 'sin_tela' then objeto is null and fase_id is null and cardinality(quita_ids) = 0 and cardinality(pone_ids) = 0 and restaura_id is null
  when 'eliminar' then objeto is not null and fase_id is not null and cardinality(quita_ids) > 0 and cardinality(pone_ids) = 0 and restaura_id is null
  when 'corregir' then objeto = 'termine' and fase_id is not null and cardinality(quita_ids) > 0 and cardinality(pone_ids) > 0 and restaura_id is null
  when 'restaurar' then objeto is not null and fase_id is not null and cardinality(quita_ids) = 0 and cardinality(pone_ids) > 0 and restaura_id is not null
  else false end);

-- 3. Lo que hay de un insumo en el estante de una ubicación: la misma cuenta que la página de la orden muestra como «en el estante» (el libro de movimientos).
create or replace function retail.fn_insumo_saldo_en(p_insumo_id uuid, p_ubicacion_id uuid)
returns numeric
language sql
stable
set search_path = retail, public, extensions
as $$
  select coalesce(sum(case when mi.tipo in ('compra', 'devolucion') then mi.cantidad
                           when mi.tipo in ('consumo', 'merma') then -mi.cantidad else mi.cantidad end), 0)
    from retail.movimientos_insumo mi
   where mi.insumo_id = p_insumo_id and mi.ubicacion_id = p_ubicacion_id
$$;
revoke all on function retail.fn_insumo_saldo_en(uuid, uuid) from public, anon, authenticated;

-- 4. Descuenta para una orden lo usado de un insumo, de los lotes del más antiguo al más nuevo (PEPS, como `registrar_consumo_insumo`), partiendo entre lotes si hace falta.
--    No pide permisos ni toma el candado de la orden: eso lo hace quien la llama.
create or replace function retail.fn_insumo_consumir_peps(p_produccion_id uuid, p_insumo_id uuid, p_ubicacion_id uuid, p_cantidad numeric, p_nota text, p_actor uuid)
returns void
language plpgsql
set search_path = retail, public, extensions
as $$
declare v_lote record; v_saldo numeric; v_toma numeric; v_falta numeric := p_cantidad;
begin
  for v_lote in
    select l.id, l.costo_unitario from retail.insumo_lotes l
     where l.insumo_id = p_insumo_id and l.ubicacion_id = p_ubicacion_id
     order by l.fecha_ingreso, l.created_at
     for update
  loop
    exit when v_falta <= 0;
    v_saldo := (select l.cantidad_ingresada
                       - coalesce((select sum(mi.cantidad) from retail.movimientos_insumo mi where mi.insumo_lote_id = l.id and mi.tipo in ('consumo', 'merma')), 0)
                       + coalesce((select sum(mi.cantidad) from retail.movimientos_insumo mi where mi.insumo_lote_id = l.id and mi.tipo = 'devolucion'), 0)
                  from retail.insumo_lotes l where l.id = v_lote.id);
    if v_saldo > 0 then
      v_toma := least(v_saldo, v_falta);
      insert into retail.movimientos_insumo (insumo_id, insumo_lote_id, ubicacion_id, tipo, cantidad, costo_unitario, produccion_id, usuario_id, nota)
        values (p_insumo_id, v_lote.id, p_ubicacion_id, 'consumo', v_toma, v_lote.costo_unitario, p_produccion_id, p_actor, p_nota);
      v_falta := v_falta - v_toma;
    end if;
  end loop;
  if v_falta > 0 then
    raise exception 'Los lotes de % no alcanzan para descontar %: el estante tiene un ajuste que los lotes no ven. Avisa al líder',
      (select i.nombre from retail.insumos i where i.id = p_insumo_id), p_cantidad using hint = 'uso_lotes_sin_saldo';
  end if;
end;
$$;
revoke all on function retail.fn_insumo_consumir_peps(uuid, uuid, uuid, numeric, text, uuid) from public, anon, authenticated;

-- 5. Lo usado de una orden: cada tela (por color) o avío con «quedó» (lo que quedó en el estante después de cortar) o «usado» (lo que salió, como al mandarla a cortar afuera). Todo o nada.
create or replace function retail.anotar_insumos_de_la_orden(p_produccion_id uuid, p_lineas jsonb, p_nota text default null)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_o record; v_actor uuid; v_x jsonb; v_insumo uuid; v_nombre text; v_habia numeric; v_quedo numeric; v_usado numeric; v_vistos uuid[] := '{}';
  v_hechas jsonb := '[]'::jsonb; v_total numeric := 0; v_nota text;
begin
  -- El mismo orden de candados que `registrar_consumo_insumo`: la orden primero, después los lotes.
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
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'Di cuánto quedó o cuánto se usó de cada tela o avío' using hint = 'uso_sin_lineas';
  end if;
  v_nota := nullif(btrim(coalesce(p_nota, '')), '');

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
    v_habia := retail.fn_insumo_saldo_en(v_insumo, v_o.ubicacion_id);
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
      perform retail.fn_insumo_consumir_peps(p_produccion_id, v_insumo, v_o.ubicacion_id, v_usado, v_nota, v_actor);
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
      'anotó la tela usada en la ' || retail.fn_produccion_numero_texto(v_o.numero) || ' (' || jsonb_array_length(v_hechas) || ' '
        || case when jsonb_array_length(v_hechas) = 1 then 'color' else 'colores' end || ')',
      v_actor, retail.fn_actividad_terminal_ahora(), v_o.ubicacion_id, v_o.ubicacion_id,
      'produccion', p_produccion_id::text, now(),
      jsonb_build_object('produccion_id', p_produccion_id, 'numero', v_o.numero, 'lineas', v_hechas),
      'vivo');
  exception when others then
    raise warning 'actividad: no se anotó la tela de la orden % (%)', v_o.numero, sqlerrm;
  end;
  return jsonb_build_object('lineas', v_hechas, 'total', v_total);
end;
$$;
comment on function retail.anotar_insumos_de_la_orden(uuid, jsonb, text) is
  'ADR-0570: la tela de una orden por color, con «quedó» (lo que quedó en el estante) o «usado» (lo que salió). Descuenta de los lotes PEPS, todo o nada.';
revoke all on function retail.anotar_insumos_de_la_orden(uuid, jsonb, text) from public, anon;
grant execute on function retail.anotar_insumos_de_la_orden(uuid, jsonb, text) to authenticated;

-- 6. «Encontré tela»: un retazo o una tela que nunca se registró entra al estante como un lote más, al precio escrito o al del último lote de ese color.
create or replace function retail.encontre_tela(p_insumo_id uuid, p_ubicacion_id uuid, p_cantidad numeric, p_costo_unitario numeric default null, p_nota text default null, p_token uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare v_i record; v_actor uuid; v_costo numeric; v_precio text; v_lote uuid; v_nota text;
begin
  -- ADR-0190: doble clic. El segundo intento con el mismo token devuelve el mismo lote.
  perform retail.fn_intento_con_huella('encontre_tela', p_token, md5(row(p_insumo_id, p_ubicacion_id, p_cantidad, p_costo_unitario, p_nota)::text));
  if p_token is not null then
    perform pg_advisory_xact_lock(hashtextextended('insumo_lotes:' || p_token::text, 0));
    if exists (select 1 from retail.insumo_lotes where token_cliente = p_token) then
      return (select jsonb_build_object('lote_id', l.id, 'costo_unitario', l.costo_unitario, 'precio', 'repetido') from retail.insumo_lotes l where l.token_cliente = p_token);
    end if;
  end if;
  perform retail.fn_produccion_exigir_operar(p_ubicacion_id);
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién anota la tela' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  select i.id, i.nombre, i.tipo into v_i from retail.insumos i where i.id = p_insumo_id;
  if v_i.id is null then
    raise exception 'Esa tela no existe' using hint = 'encontre_inexistente';
  end if;
  if v_i.tipo <> 'tela' then
    raise exception '«Encontré tela» es para telas: un avío se ingresa con su compra' using hint = 'encontre_no_es_tela';
  end if;
  if p_cantidad is null or p_cantidad <= 0 or p_cantidad <> round(p_cantidad, 3) or p_cantidad > 100000 then
    raise exception 'Cuánta tela encontraste: un número mayor que cero, con hasta tres decimales' using hint = 'encontre_cantidad_invalida';
  end if;
  if p_costo_unitario is not null and (p_costo_unitario < 0 or p_costo_unitario > 100000) then
    raise exception 'El precio no puede ser negativo' using hint = 'encontre_precio_invalido';
  end if;
  v_costo := p_costo_unitario;
  v_precio := 'escrito';
  if v_costo is null then
    -- El último precio de ese color, en cualquier sede: lo más parecido a lo que vale (Felipe: «con el último precio si no se sabe»).
    v_costo := (select l.costo_unitario from retail.insumo_lotes l where l.insumo_id = p_insumo_id order by l.fecha_ingreso desc, l.created_at desc limit 1);
    v_precio := 'ultimo';
  end if;
  if v_costo is null then
    raise exception '% nunca tuvo un precio: escribe cuánto vale el metro', v_i.nombre using hint = 'encontre_sin_precio';
  end if;
  v_nota := 'Encontré tela' || coalesce(': ' || nullif(btrim(coalesce(p_nota, '')), ''), '');
  insert into retail.insumo_lotes (insumo_id, ubicacion_id, cantidad_ingresada, costo_unitario, origen, nota)
    values (p_insumo_id, p_ubicacion_id, p_cantidad, round(v_costo, 4), 'encontrada', v_nota) returning id into v_lote;
  -- La entrada al estante (el libro de movimientos no tiene otro tipo de entrada; el lote dice que fue encontrada).
  insert into retail.movimientos_insumo (insumo_id, insumo_lote_id, ubicacion_id, tipo, cantidad, costo_unitario, usuario_id, nota)
    values (p_insumo_id, v_lote, p_ubicacion_id, 'compra', p_cantidad, round(v_costo, 4), v_actor, v_nota);
  if p_token is not null then
    update retail.insumo_lotes set token_cliente = p_token where id = v_lote;
  end if;
  begin
    perform retail.fn_actividad_anotar(
      'produccion', 'insumo_tela_encontrada',
      'anotó ' || p_cantidad || ' de ' || v_i.nombre || ' encontrada' || case when v_precio = 'ultimo' then ' (al último precio)' else '' end,
      v_actor, retail.fn_actividad_terminal_ahora(), p_ubicacion_id, p_ubicacion_id,
      'insumos', p_insumo_id::text, now(),
      jsonb_build_object('insumo_id', p_insumo_id, 'lote_id', v_lote, 'cantidad', p_cantidad, 'precio', v_precio),
      'vivo');
  exception when others then
    raise warning 'actividad: no se anotó la tela encontrada (%)', sqlerrm;
  end;
  return jsonb_build_object('lote_id', v_lote, 'costo_unitario', round(v_costo, 4), 'precio', v_precio);
end;
$$;
comment on function retail.encontre_tela(uuid, uuid, numeric, numeric, text, uuid) is
  'ADR-0570: «Encontré tela». Un lote con origen «encontrada», al precio escrito o al del último lote de ese color. Sin factura ni pago.';
revoke all on function retail.encontre_tela(uuid, uuid, numeric, numeric, text, uuid) from public, anon;
grant execute on function retail.encontre_tela(uuid, uuid, numeric, numeric, text, uuid) to authenticated;

-- 7. La tela que una orden declaró y que todavía no tiene nada anotado, por insumo: también un forro (su costo también falta en el de la prenda; la misma regla que la pantalla,
--    `telasSinAnotar`). Un avío no: se puede usar después del corte.
create or replace function retail.fn_produccion_tela_sin_anotar(p_produccion_id uuid)
returns text[]
language sql
stable
set search_path = retail, public, extensions
as $$
  select coalesce(array_agg(distinct i.nombre order by i.nombre), '{}')
    from retail.produccion_insumos pi
    join retail.insumos i on i.id = pi.insumo_id
   where pi.produccion_id = p_produccion_id and i.tipo = 'tela'
     and coalesce((select sum(case when mi.tipo = 'consumo' then mi.cantidad else -mi.cantidad end) from retail.movimientos_insumo mi
                    where mi.produccion_id = p_produccion_id and mi.insumo_id = pi.insumo_id and mi.tipo in ('consumo', 'devolucion')), 0) <= 0
$$;
revoke all on function retail.fn_produccion_tela_sin_anotar(uuid) from public, anon, authenticated;

-- 8. El permiso de pasar al stock sin tela: solo un líder, con su motivo, y queda en la historia de la orden.
create or replace function retail.permitir_pasar_sin_tela(p_produccion_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare v_o record; v_actor uuid; v_motivo text; v_id uuid;
begin
  select p.id, p.ubicacion_id, p.estado, p.numero into v_o from retail.producciones p where p.id = p_produccion_id for update;
  if v_o.id is null then
    raise exception 'Esa orden no existe' using hint = 'orden_inexistente';
  end if;
  perform retail.fn_produccion_exigir_operar(v_o.ubicacion_id);
  if not retail.fn_es_lider() then
    raise exception 'Solo un líder deja pasar una orden al stock sin tela' using errcode = '42501', hint = 'sin_tela_solo_lider';
  end if;
  if v_o.estado <> 'en_proceso' then
    raise exception 'La orden ya no está en proceso' using hint = 'orden_cerrada';
  end if;
  v_motivo := retail.fn_produccion_motivo_cambio(p_motivo);
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién lo permite' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  insert into retail.produccion_cambios (produccion_id, accion, texto, hecho_por, created_at)
    values (p_produccion_id, 'sin_tela', v_motivo, v_actor, clock_timestamp()) returning id into v_id;
  begin
    perform retail.fn_actividad_anotar(
      'produccion', 'produccion_sin_tela_permitido',
      'dejó pasar al stock sin tela la ' || retail.fn_produccion_numero_texto(v_o.numero) || ': ' || v_motivo,
      v_actor, retail.fn_actividad_terminal_ahora(), v_o.ubicacion_id, v_o.ubicacion_id,
      'produccion', p_produccion_id::text, now(),
      jsonb_build_object('produccion_id', p_produccion_id, 'numero', v_o.numero, 'cambio_id', v_id),
      'vivo');
  exception when others then
    raise warning 'actividad: no se anotó el permiso sin tela de la orden % (%)', v_o.numero, sqlerrm;
  end;
  return jsonb_build_object('id', v_id);
end;
$$;
comment on function retail.permitir_pasar_sin_tela(uuid, text) is
  'ADR-0570: un líder deja pasar al stock una orden con tela declarada y sin anotar, con su motivo. Queda en produccion_cambios (acción sin_tela).';
revoke all on function retail.permitir_pasar_sin_tela(uuid, text) from public, anon;
grant execute on function retail.permitir_pasar_sin_tela(uuid, text) to authenticated;

-- 9. El candado de «Pasar al stock»: una orden que declaró su tela no entra con un color sin tela anotada, salvo el permiso de un líder. Una muestra no toca el stock: no lo pide.
create or replace function retail.fn_produccion_exigir_tela(p_produccion_id uuid)
returns void
language plpgsql
stable
set search_path = retail, public, extensions
as $$
declare v_faltan text[];
begin
  if (select p.es_muestra from retail.producciones p where p.id = p_produccion_id) then
    return;
  end if;
  v_faltan := retail.fn_produccion_tela_sin_anotar(p_produccion_id);
  if cardinality(v_faltan) = 0 or exists (select 1 from retail.produccion_cambios c where c.produccion_id = p_produccion_id and c.accion = 'sin_tela') then
    return;
  end if;
  raise exception 'Falta anotar la tela de %: anota cuánto quedó en «Tela» o pide a un líder que la deje pasar sin tela', array_to_string(v_faltan, ', ')
    using hint = 'cierre_sin_tela';
end;
$$;
revoke all on function retail.fn_produccion_exigir_tela(uuid) from public, anon, authenticated;

select pg_temp.reemplazar_anclado(
  'retail.cerrar_produccion(uuid,jsonb,numeric,numeric,numeric,boolean)',
  $v$  -- El costo de los servicios sale de lo devengado$v$,
  $v$  -- ADR-0570: sin tela anotada no pasa al stock, salvo el permiso de un líder (`permitir_pasar_sin_tela`).
  perform retail.fn_produccion_exigir_tela(p_produccion_id);

  -- El costo de los servicios sale de lo devengado$v$
);

reset lock_timeout;
