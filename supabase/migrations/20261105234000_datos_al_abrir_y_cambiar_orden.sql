-- ============================================================================
-- 20261105234000_datos_al_abrir_y_cambiar_orden.sql — CAYLA V2 (Felipe, 2026-10-16: P-28, P-29, P-34, P-35; ADR-0614, actividades 11 y 12)
-- Lo que una orden tiene que decir al abrir, y cambiarla con motivo mientras sigue abierta
--
-- EL PROBLEMA PRIMERO. Felipe decidió que cada orden diga si es reposición o novedad, a qué tienda va, si es urgente y quién aprobó la muestra de un modelo nuevo; nada de eso se guardaba.
-- Y una orden abierta no se podía cambiar: si el pedido cambiaba a media producción, había que anularla o seguir con un plan que ya no era cierto.
--
-- LA DECISIÓN.
--   · Cuatro columnas nullable en `producciones`, todas opcionales: ninguna frena abrir una orden (el Taller ya trabaja). Son datos: no reparten stock ni deciden prioridades (P-34, P-35).
--     La tienda destino no reemplaza a Traslados: lo que se traslada lo sigue decidiendo quien traslada.
--   · `cambiar_datos_de_orden` los cambia después. `cambiar_plan_de_orden` cambia cuántas de cada talla y color. Nunca baja de lo ya cortado, y puede sumar una talla o un color del mismo
--     modelo. Una línea sin cortar se puede quitar. Cada cambio queda en `produccion_cambios` con su motivo, y lo ya anotado no se toca.
--
-- CONTRATO (Liskov)
--   PROMETE: el plan de la orden es la suma de sus líneas; los candados de avance leen el plan nuevo.
--   ASUME:   quien llama opera el Taller, con el responsable del combo.
--   FALLA:   `orden_cerrada`, `plan_sin_motivo`, `plan_sin_lineas`, `plan_variante_ajena`, `plan_menor_que_lo_cortado`, `plan_cantidad_invalida`, `plan_sin_cambios`, `dato_motivo_invalido`, `dato_tienda_invalida`.
--   NO HACE: no recalcula la tela declarada: el aviso de «no alcanza» la compara con lo usado y la hoja «Editar tela» sigue siendo el lugar para cambiarla.
--
-- PRODUCCIÓN. PARTE ÚNICA: un `alter` en `producciones` y `produccion_cambios`, y funciones, sin políticas ni `drop trigger`: ADR-0195 no aplica. Pegar ANTES de publicar la web; la web vieja no las usa.
--
-- VERIFICACIÓN: select to_regproc('retail.cambiar_plan_de_orden') is not null, exists (select 1 from information_schema.columns where table_schema='retail' and table_name='producciones' and column_name='urgente');  → t | t
-- CÓMO SE DESHACE: los reemplazos al revés y `drop function` de las dos. Las columnas se dejan: son datos.
-- ============================================================================

set lock_timeout = '3s';

alter table retail.producciones
  add column if not exists motivo_orden text,
  add column if not exists tienda_destino_id uuid references retail.ubicaciones (id),
  add column if not exists urgente boolean not null default false,
  add column if not exists muestra_aprobada_por text,
  drop constraint if exists producciones_motivo_orden_valido,
  add constraint producciones_motivo_orden_valido check (motivo_orden is null or motivo_orden = any (array['reposicion'::text, 'novedad'::text])),
  drop constraint if exists producciones_muestra_aprobada_por_largo,
  add constraint producciones_muestra_aprobada_por_largo check (muestra_aprobada_por is null or (btrim(muestra_aprobada_por) <> '' and length(muestra_aprobada_por) <= 120));

-- El candado de dinero de `producciones` (20260923193700): una columna nueva nace sin lectura.
grant select (motivo_orden, tienda_destino_id, urgente, muestra_aprobada_por) on retail.producciones to authenticated;

alter table retail.produccion_cambios
  drop constraint if exists produccion_cambios_accion_check,
  add constraint produccion_cambios_accion_check check (accion = any (array['corregir'::text, 'eliminar'::text, 'restaurar'::text, 'nota'::text, 'sin_tela'::text, 'tipo'::text, 'paso_tarde'::text, 'plan'::text, 'datos'::text])),
  drop constraint if exists produccion_cambios_forma,
  add constraint produccion_cambios_forma check (
    case accion
      when 'nota'::text then ((objeto is null) and (fase_id is null) and (cardinality(quita_ids) = 0) and (cardinality(pone_ids) = 0) and (restaura_id is null))
      when 'sin_tela'::text then ((objeto is null) and (fase_id is null) and (cardinality(quita_ids) = 0) and (cardinality(pone_ids) = 0) and (restaura_id is null))
      when 'plan'::text then ((objeto is null) and (fase_id is null) and (cardinality(quita_ids) = 0) and (cardinality(pone_ids) = 0) and (restaura_id is null))
      when 'datos'::text then ((objeto is null) and (fase_id is null) and (cardinality(quita_ids) = 0) and (cardinality(pone_ids) = 0) and (restaura_id is null))
      when 'tipo'::text then ((objeto is null) and (fase_id is null) and (cardinality(quita_ids) = 0) and (cardinality(pone_ids) = 0) and (restaura_id is null) and coalesce((((antes ->> 'es_muestra'::text) = any (array['true'::text, 'false'::text])) and ((despues ->> 'es_muestra'::text) = any (array['true'::text, 'false'::text])) and ((antes ->> 'es_muestra'::text) <> (despues ->> 'es_muestra'::text))), false))
      when 'eliminar'::text then ((objeto is not null) and (fase_id is not null) and (cardinality(quita_ids) > 0) and (cardinality(pone_ids) = 0) and (restaura_id is null))
      when 'corregir'::text then ((objeto = 'termine'::text) and (fase_id is not null) and (cardinality(quita_ids) > 0) and (cardinality(pone_ids) > 0) and (restaura_id is null))
      when 'restaurar'::text then ((objeto is not null) and (fase_id is not null) and (cardinality(quita_ids) = 0) and (cardinality(pone_ids) > 0) and (restaura_id is not null))
      when 'paso_tarde'::text then ((objeto is null) and (fase_id is not null) and (cardinality(quita_ids) = 0) and (restaura_id is null))
      else false
    end);

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

-- Abrir la orden con sus datos. Un valor que no sirve rechaza la apertura entera (los CHECK), sin dejar nada.
select pg_temp.reemplazar_anclado(
  'retail.abrir_orden_produccion(jsonb,jsonb,jsonb)',
  $v$from retail.produccion_lineas l where l.produccion_id = v_id;$v$,
  $n$from retail.produccion_lineas l where l.produccion_id = v_id;

  update retail.producciones o_abierta set
    motivo_orden = nullif(p_apertura ->> 'motivo_orden', ''),
    tienda_destino_id = nullif(p_apertura ->> 'tienda_destino_id', '')::uuid,
    urgente = coalesce((p_apertura ->> 'urgente')::boolean, false),
    muestra_aprobada_por = nullif(btrim(coalesce(p_apertura ->> 'muestra_aprobada_por', '')), '')
  where o_abierta.id = v_id;$n$
);

-- La orden en una lectura los devuelve.
select pg_temp.reemplazar_anclado(
  (select p.oid::regprocedure::text from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = 'fn_orden_produccion'),
  $v$p.inventariado_at, p.ingreso_al_stock, p.cantidad_plan$v$,
  $n$p.inventariado_at, p.ingreso_al_stock, p.motivo_orden, p.tienda_destino_id, p.urgente, p.muestra_aprobada_por, p.cantidad_plan$n$
);
select pg_temp.reemplazar_anclado(
  (select p.oid::regprocedure::text from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = 'fn_orden_produccion'),
  $v$'ingreso_al_stock', v_o.ingreso_al_stock,$v$,
  $n$'ingreso_al_stock', v_o.ingreso_al_stock, 'motivo_orden', v_o.motivo_orden, 'urgente', v_o.urgente, 'muestra_aprobada_por', v_o.muestra_aprobada_por,
      'tienda_destino_id', v_o.tienda_destino_id, 'tienda_destino', (select u.nombre from retail.ubicaciones u where u.id = v_o.tienda_destino_id),$n$
);

create or replace function retail.cambiar_datos_de_orden(p_produccion_id uuid, p_motivo_orden text, p_tienda_destino_id uuid, p_urgente boolean, p_muestra_aprobada_por text)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  o retail.producciones;
  v_actor uuid;
  v_quien text := nullif(btrim(coalesce(p_muestra_aprobada_por, '')), '');
  v_motivo text := nullif(p_motivo_orden, '');
begin
  select * into o from retail.producciones x where x.id = p_produccion_id for update;
  if not found then raise exception 'Esa orden no existe' using hint = 'orden_inexistente'; end if;
  perform retail.fn_produccion_exigir_operar(o.ubicacion_id);
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  if o.estado <> 'en_proceso' then
    raise exception 'La orden ya no está en proceso' using hint = 'orden_cerrada';
  end if;
  if v_motivo is not null and v_motivo not in ('reposicion', 'novedad') then
    raise exception 'Di si es reposición o novedad.' using hint = 'dato_motivo_invalido';
  end if;
  if p_tienda_destino_id is not null and not exists (select 1 from retail.ubicaciones u where u.id = p_tienda_destino_id and u.tipo = 'tienda' and u.activo) then
    raise exception 'Elige una tienda activa.' using hint = 'dato_tienda_invalida';
  end if;
  update retail.producciones set motivo_orden = v_motivo, tienda_destino_id = p_tienda_destino_id, urgente = coalesce(p_urgente, false), muestra_aprobada_por = v_quien where id = o.id;
  insert into retail.produccion_cambios (produccion_id, accion, antes, despues, texto, hecho_por)
  values (o.id, 'datos',
    jsonb_build_object('motivo_orden', o.motivo_orden, 'tienda_destino_id', o.tienda_destino_id, 'urgente', o.urgente, 'muestra_aprobada_por', o.muestra_aprobada_por),
    jsonb_build_object('motivo_orden', v_motivo, 'tienda_destino_id', p_tienda_destino_id, 'urgente', coalesce(p_urgente, false), 'muestra_aprobada_por', v_quien),
    'Cambió los datos de la orden', v_actor);
end;
$$;

create or replace function retail.cambiar_plan_de_orden(p_produccion_id uuid, p_lineas jsonb, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  o retail.producciones;
  v_actor uuid;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_l jsonb;
  v_v uuid;
  v_n integer;
  v_cortado integer;
  v_antes jsonb;
  v_despues jsonb;
  v_primera uuid;
  v_total integer;
begin
  select * into o from retail.producciones x where x.id = p_produccion_id for update;
  if not found then raise exception 'Esa orden no existe' using hint = 'orden_inexistente'; end if;
  perform retail.fn_produccion_exigir_operar(o.ubicacion_id);
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  if o.estado <> 'en_proceso' then
    raise exception 'La orden ya no está en proceso' using hint = 'orden_cerrada';
  end if;
  if v_motivo is null or length(v_motivo) > 300 then
    raise exception 'Escribe por qué cambia el plan.' using hint = 'plan_sin_motivo';
  end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0
     or (select count(*) <> count(distinct x ->> 'variante_id') from jsonb_array_elements(p_lineas) x) then
    raise exception 'El plan necesita sus líneas, cada talla y color una sola vez.' using hint = 'plan_sin_lineas';
  end if;

  v_antes := (select coalesce(jsonb_object_agg(l.variante_id, l.cantidad_plan), '{}'::jsonb) from retail.produccion_lineas l where l.produccion_id = o.id);
  -- La primera fase que cuenta prendas: lo que ya se cortó no se puede quitar del plan.
  v_primera := (select f.id from retail.produccion_fases f where f.produccion_id = o.id and not retail.fn_fase_es_hito(f.clave) order by f.secuencia limit 1);

  for v_l in select * from jsonb_array_elements(p_lineas) loop
    v_v := nullif(v_l ->> 'variante_id', '')::uuid;
    if (v_l ->> 'cantidad') !~ '^[0-9]+$' then
      raise exception 'Cada cantidad es un número entero, cero o más.' using hint = 'plan_cantidad_invalida';
    end if;
    v_n := (v_l ->> 'cantidad')::integer;
    if not exists (select 1 from retail.variantes v where v.id = v_v and v.producto_id = o.producto_id) then
      raise exception 'Esa talla y color no son de este modelo.' using hint = 'plan_variante_ajena';
    end if;
  end loop;

  -- Una línea que no viene en la lista queda como está: se quita mandándola en cero.
  for v_v, v_n in select (x ->> 'variante_id')::uuid, (x ->> 'cantidad')::integer from jsonb_array_elements(p_lineas) x loop
    v_cortado := coalesce((select sum(a.cantidad) from retail.produccion_avances a where a.fase_id = v_primera and a.variante_id = v_v), 0)::integer
               + coalesce((select sum(sl.cantidad) from retail.produccion_salidas s join retail.produccion_salida_lineas sl on sl.salida_id = s.id where s.fase_id = v_primera and sl.variante_id = v_v
                            and not exists (select 1 from retail.produccion_avances a where a.fase_id = v_primera)), 0)::integer;
    if v_n < v_cortado then
      raise exception 'De esa talla y color ya se cortaron %: el plan no puede ser menos.', v_cortado using hint = 'plan_menor_que_lo_cortado';
    end if;
    if v_n = 0 then
      delete from retail.produccion_lineas l where l.produccion_id = o.id and l.variante_id = v_v;
    else
      insert into retail.produccion_lineas (produccion_id, variante_id, cantidad_plan) values (o.id, v_v, v_n)
      on conflict (produccion_id, variante_id) do update set cantidad_plan = excluded.cantidad_plan;
    end if;
  end loop;

  v_despues := (select coalesce(jsonb_object_agg(l.variante_id, l.cantidad_plan), '{}'::jsonb) from retail.produccion_lineas l where l.produccion_id = o.id);
  if v_despues = v_antes then
    raise exception 'No cambiaste nada.' using hint = 'plan_sin_cambios';
  end if;
  v_total := (select coalesce(sum(l.cantidad_plan), 0) from retail.produccion_lineas l where l.produccion_id = o.id)::integer;
  if v_total = 0 then
    raise exception 'La orden se quedaría sin prendas: anúlala.' using hint = 'plan_sin_lineas';
  end if;
  update retail.producciones set cantidad_plan = v_total where id = o.id;
  insert into retail.produccion_cambios (produccion_id, accion, antes, despues, texto, hecho_por)
  values (o.id, 'plan', jsonb_build_object('total', o.cantidad_plan, 'lineas', v_antes), jsonb_build_object('total', v_total, 'lineas', v_despues),
          'Cambió el plan de ' || o.cantidad_plan || ' a ' || v_total || ' prendas: ' || v_motivo, v_actor);
  return jsonb_build_object('total', v_total);
end;
$$;

revoke all on function retail.cambiar_datos_de_orden(uuid, text, uuid, boolean, text) from public, anon;
revoke all on function retail.cambiar_plan_de_orden(uuid, jsonb, text) from public, anon;
grant execute on function retail.cambiar_datos_de_orden(uuid, text, uuid, boolean, text) to authenticated;
grant execute on function retail.cambiar_plan_de_orden(uuid, jsonb, text) to authenticated;

reset lock_timeout;
