-- ============================================================================
-- 20261122195000_barrido_piso_por_resolver.sql — CAYLA V2 · ADR-0690 «El barrido del piso» · actividad 8 · «Por resolver»
-- Pega DESPUÉS de 20261122193000_barrido_piso_confirmar.sql (lee cuadres_piso.barrido_id y .no_cargado): lo comprueba la guarda.
--
-- EL PROBLEMA PRIMERO. Un barrido confirmado deja dos cosas sin cerrar, a propósito, porque mover stock ahí sería inventarlo:
--   · las NO CARGADAS: prendas que se escanearon colgadas pero el sistema no tiene en la sede (ni en el piso ni en el almacén). Viven en
--     `cuadres_piso.no_cargado` del barrido, con dónde las tiene el sistema (otras sedes) y lo que viene en camino hacia aquí;
--   · lo APARTADO: prendas sin etiqueta o con un código que el catálogo no conoce (`barrido_piso_hallazgos`), con su foto o su nota,
--     que esperan en la caja «Por etiquetar».
-- Hasta hoy eso quedaba escrito y nada más: nadie sabía qué faltaba resolver ni cuándo se resolvió. Con el barrido una vez al mes,
-- sin un lugar para cerrarlo, la lista crece y la prenda física sigue colgada sin existir en el sistema (no se puede vender).
--
-- LA REGLA. Cada unidad pendiente se cierra UNA vez, con quién y cuándo, de una de tres formas:
--   · «colgada»     — ya está en el sistema, en el almacén de la sede (llegó en un traslado que ya se recibió, o la cargaron después):
--                     se BAJA al piso (`mover_interno`). Lo hace quien ve Existencias, como «Reponer».
--   · «encontrada»  — el sistema no la tiene: entra con «Encontré prendas» al almacén y se baja al piso en la MISMA operación, por las
--                     funciones de siempre (`ajustar_inventario`, con su candado `fn_puede_ajustar_stock`: quien ve Existencias, Conteos
--                     o Traslados, ADR-0306; este camino no cambia quién puede sumar stock; con la carga inicial de la sede abierta y
--                     una prenda sin historia, es stock inicial al piso). Si viene en un traslado en camino hacia la sede, se RECHAZA: se recibe el traslado y se cuelga, o se
--                     contaría dos veces.
--   · «no_era»      — no era de aquí o ya no está (se devolvió a su sede, era de una clienta): no mueve nada, queda escrito.
-- Un apartado (sin etiqueta) puede ser varias prendas distintas: cada resolución dice QUÉ prenda era (`variante_id`), y se resuelve por
-- partes hasta cubrir su cantidad. Una no cargada ya sabe su prenda.
--
-- QUÉ CREA.
--   · `retail.barrido_piso_resueltos`: append-only (ni se edita ni se borra), RLS encendido SIN políticas (solo la leen y escriben estas
--     funciones `security definer`). El id lo elige el aparato al abrir la hoja: tocar «Resolver» dos veces no resuelve dos veces.
--   · `fn_barrido_piso_por_resolver(sede)`: lo que falta, de todos los barridos CONFIRMADOS de la sede (uno descartado no deja nada).
--   · `resolver_pendiente_barrido(...)`: cierra una parte, todo o nada, y devuelve la lista nueva.
--
-- CÓMO SE PEGA EN PRODUCCIÓN. Una sola parte, a cualquier hora: una tabla NUEVA (sin políticas: no toma las tablas de auth ni storage,
-- ADR-0195) y funciones nuevas. No altera ninguna tabla en uso. Idempotente.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

do $guarda$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'retail' and table_name = 'cuadres_piso' and column_name = 'barrido_id') then
    raise exception 'Falta cuadres_piso.barrido_id: pega antes 20261122193000_barrido_piso_confirmar.sql.';
  end if;
  if to_regprocedure('retail.ajustar_inventario(uuid, uuid, jsonb, text, jsonb, boolean, text, uuid)') is null
     or to_regprocedure('retail.mover_interno(uuid, uuid, integer, uuid, uuid, text, uuid)') is null
     or to_regprocedure('retail.fn_carga_inicial_abierta(uuid)') is null
     or not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname = 'retail' and p.proname = 'fn_bloquear_en_orden') then
    raise exception 'Faltan ajustar_inventario, mover_interno, fn_carga_inicial_abierta o fn_bloquear_en_orden.';
  end if;
end;
$guarda$;

-- ----------------------------------------------------------------------------
-- 1. La tabla: una fila por cada parte que se resolvió.
-- ----------------------------------------------------------------------------
create table if not exists retail.barrido_piso_resueltos (
  id uuid primary key,
  barrido_id uuid not null references retail.barridos_piso (id),
  -- Lo apartado que se resolvió (null: es una no cargada, y su prenda es `pendiente_variante_id`).
  hallazgo_id uuid references retail.barrido_piso_hallazgos (id),
  -- La no cargada que se resolvió (null: es un apartado).
  pendiente_variante_id uuid references retail.variantes (id),
  como text not null check (como in ('colgada', 'encontrada', 'no_era')),
  -- La prenda que era: la misma de la no cargada; la que se eligió para un apartado; null en «no_era» de un apartado.
  variante_id uuid references retail.variantes (id),
  cantidad integer not null check (cantidad between 1 and 500),
  nota text check (nota is null or char_length(nota) <= 200),
  persona_id uuid not null references public.personas (id),
  registrado_en timestamptz not null default clock_timestamp(),
  constraint barrido_piso_resueltos_una_cosa check (num_nonnulls(hallazgo_id, pendiente_variante_id) = 1),
  constraint barrido_piso_resueltos_prenda check (
    (pendiente_variante_id is not null and variante_id = pendiente_variante_id)
    or (hallazgo_id is not null and (como = 'no_era' or variante_id is not null)))
);

create index if not exists barrido_piso_resueltos_barrido on retail.barrido_piso_resueltos (barrido_id);
create index if not exists barrido_piso_resueltos_hallazgo on retail.barrido_piso_resueltos (hallazgo_id) where hallazgo_id is not null;

comment on table retail.barrido_piso_resueltos is
  'ADR-0690 (actividad 8): cada parte de lo que un barrido del piso dejó «por resolver» (una no cargada o un apartado), con cómo se cerró (colgada · encontrada · no_era), quién y cuándo. Append-only; solo la escribe resolver_pendiente_barrido.';

alter table retail.barrido_piso_resueltos enable row level security;
revoke all on table retail.barrido_piso_resueltos from public, anon, authenticated;

create or replace function retail.fn_barrido_piso_resuelto_inmutable()
returns trigger
language plpgsql
set search_path = retail, public, extensions
as $fn$
begin
  raise exception 'Lo resuelto de un barrido no se edita ni se borra.' using hint = 'barrido_inmutable';
end;
$fn$;

comment on function retail.fn_barrido_piso_resuelto_inmutable() is
  'ADR-0690: impide editar, borrar o vaciar barrido_piso_resueltos.';

create or replace trigger barrido_piso_resueltos_inmutables
  before update or delete on retail.barrido_piso_resueltos
  for each row execute function retail.fn_barrido_piso_resuelto_inmutable();

create or replace trigger barrido_piso_resueltos_sin_vaciar
  before truncate on retail.barrido_piso_resueltos
  for each statement execute function retail.fn_barrido_piso_resuelto_inmutable();

-- ----------------------------------------------------------------------------
-- 2. Lo que falta resolver en una sede.
-- ----------------------------------------------------------------------------
create or replace function retail.fn_barrido_piso_por_resolver(p_ubicacion_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $fn$
begin
  if not ((fn_es_lider() or fn_ve_modulo('existencias')) and fn_puede_operar_ubicacion(p_ubicacion_id)) then
    raise exception 'No tienes acceso al barrido del piso de esa sede.' using errcode = '42501', hint = 'barrido_sin_permiso';
  end if;

  return jsonb_build_object(
    'no_cargadas', coalesce((
      select jsonb_agg(x order by x ->> 'confirmado_en' desc, x ->> 'prenda')
        from (
          select jsonb_build_object(
                   'barrido_id', b.id,
                   'confirmado_en', b.cerrado_en,
                   'confirmado_por', fn_actividad_nombre(b.cerrado_por),
                   'variante_id', (l ->> 'variante_id')::uuid,
                   'prenda', coalesce(l ->> 'prenda', 'Una prenda'),
                   'pendientes', (l ->> 'no_cargadas')::integer - coalesce(r.n, 0),
                   'otras_sedes', coalesce(l -> 'otras_sedes', '[]'::jsonb),
                   -- Lo que viene en camino hoy (no lo de ese día): si llegó, ya no está en camino.
                   'en_camino', coalesce((
                     select sum(ti.cantidad)::integer from transferencias tr join transferencia_items ti on ti.transferencia_id = tr.id
                      where tr.estado = 'en_transito' and tr.ubicacion_destino_id = p_ubicacion_id
                        and ti.variante_id = (l ->> 'variante_id')::uuid), 0),
                   -- Lo que la sede tiene en su cuarentena (no se vende ni cuenta en el piso o el almacén).
                   'en_cuarentena', coalesce((
                     select sum(st.cantidad)::integer from stock st join sububicaciones sb on sb.id = st.sububicacion_id
                      where st.ubicacion_id = p_ubicacion_id and sb.tipo = 'cuarentena'
                        and st.variante_id = (l ->> 'variante_id')::uuid), 0)) as x
            from barridos_piso b
            join cuadres_piso c on c.barrido_id = b.id
            cross join lateral jsonb_array_elements(coalesce(c.no_cargado, '[]'::jsonb)) l
            left join lateral (
              select sum(z.cantidad)::integer as n from barrido_piso_resueltos z
               where z.barrido_id = b.id and z.pendiente_variante_id = (l ->> 'variante_id')::uuid) r on true
           where b.ubicacion_id = p_ubicacion_id and b.estado = 'confirmado'
             and (l ->> 'no_cargadas')::integer - coalesce(r.n, 0) > 0
           limit 300
        ) t), '[]'::jsonb),
    'apartados', coalesce((
      select jsonb_agg(x order by x ->> 'registrado_en' desc)
        from (
          select jsonb_build_object(
                   'id', h.id,
                   'barrido_id', b.id,
                   'confirmado_en', b.cerrado_en,
                   'tipo', h.tipo,
                   'codigo', h.codigo,
                   'nota', h.nota,
                   'foto_ruta', h.foto_ruta,
                   'cantidad', h.cantidad,
                   'pendientes', h.cantidad - coalesce(r.n, 0),
                   'por', fn_actividad_nombre(h.persona_id),
                   'registrado_en', h.registrado_en) as x
            from barridos_piso b
            join barrido_piso_hallazgos h on h.barrido_id = b.id and h.anulada_en is null
            left join lateral (
              select sum(z.cantidad)::integer as n from barrido_piso_resueltos z where z.hallazgo_id = h.id) r on true
           where b.ubicacion_id = p_ubicacion_id and b.estado = 'confirmado'
             and h.cantidad - coalesce(r.n, 0) > 0
           limit 300
        ) t), '[]'::jsonb));
end;
$fn$;

revoke all on function retail.fn_barrido_piso_por_resolver(uuid) from public, anon;
grant execute on function retail.fn_barrido_piso_por_resolver(uuid) to authenticated;
comment on function retail.fn_barrido_piso_por_resolver(uuid) is
  'ADR-0690 (actividad 8): lo que los barridos CONFIRMADOS de la sede dejaron por resolver y todavía no se cierra: {no_cargadas: [{barrido_id, confirmado_en, confirmado_por, variante_id, prenda, pendientes, otras_sedes, en_camino, en_cuarentena}], apartados: [{id, barrido_id, confirmado_en, tipo, codigo, nota, foto_ruta, cantidad, pendientes, por, registrado_en}]}. Hasta 300 de cada uno. Lo lee quien ve Existencias en la sede.';

-- ----------------------------------------------------------------------------
-- 3. Resolver una parte: todo o nada.
-- ----------------------------------------------------------------------------
create or replace function retail.resolver_pendiente_barrido(
  p_id uuid,
  p_barrido_id uuid,
  p_hallazgo_id uuid,
  p_variante_id uuid,
  p_como text,
  p_cantidad integer,
  p_nota text
)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_nota text := nullif(btrim(p_nota), '');
  v_sede uuid;
  v_estado text;
  v_actor uuid;
  v_pendiente_variante uuid;
  v_variante uuid;
  v_total integer;
  v_resuelto integer;
  v_piso uuid;
  v_almacen uuid;
  v_libre integer;
  v_en_camino integer;
  v_nota_mov text;
  v_carga boolean;
  r record;
begin
  if p_id is null then
    raise exception 'Falta la marca de esta operación. Cierra la ventana y vuelve a abrirla.' using hint = 'barrido_sin_token';
  end if;
  if p_como is null or p_como not in ('colgada', 'encontrada', 'no_era') then
    raise exception 'Elige qué pasó con la prenda.' using hint = 'barrido_resolver_como';
  end if;
  if p_cantidad is null or p_cantidad < 1 or p_cantidad > 500 then
    raise exception 'La cantidad va de 1 a 500.' using hint = 'barrido_resolver_cantidad';
  end if;
  if v_nota is not null and char_length(v_nota) > 200 then
    raise exception 'La nota no puede pasar de 200 letras.' using hint = 'barrido_resolver_nota';
  end if;

  -- Candado 1: la marca. Un segundo envío espera aquí y encuentra lo ya guardado.
  perform pg_advisory_xact_lock(hashtextextended('resolver_pendiente_barrido:' || p_id::text, 0));
  for r in select z.* from barrido_piso_resueltos z where z.id = p_id loop
    if r.barrido_id is distinct from p_barrido_id or r.hallazgo_id is distinct from p_hallazgo_id or r.como <> p_como
       or r.cantidad <> p_cantidad
       or (r.pendiente_variante_id is null and r.variante_id is distinct from p_variante_id)
       or (r.pendiente_variante_id is not null and r.pendiente_variante_id is distinct from p_variante_id) then
      raise exception 'Eso ya se resolvió con otros datos: no se repitió nada.' using hint = 'barrido_token_reusado';
    end if;
    return fn_barrido_piso_por_resolver(
      (select b.ubicacion_id from barridos_piso b where b.id = r.barrido_id)) || jsonb_build_object('ya_registrado', true);
  end loop;

  -- Candado 2: el barrido, en exclusiva (dos personas no resuelven la misma prenda a la vez: la segunda ve lo que quedó).
  for r in select b.ubicacion_id, b.estado from barridos_piso b where b.id = p_barrido_id for update loop
    v_sede := r.ubicacion_id;
    v_estado := r.estado;
  end loop;
  if v_sede is null then
    raise exception 'Ese barrido no existe.' using hint = 'barrido_no_existe';
  end if;
  if not fn_ve_modulo('existencias') then
    raise exception 'Resolver lo del barrido necesita el módulo Existencias en tu rol.' using errcode = '42501', hint = 'barrido_sin_modulo';
  end if;
  if not fn_puede_operar_ubicacion(v_sede) then
    raise exception 'No tienes permiso para mover mercadería en esa sede.' using errcode = '42501', hint = 'barrido_sin_tienda';
  end if;
  if v_estado <> 'confirmado' then
    raise exception 'Solo se resuelve lo de un barrido confirmado.' using hint = 'barrido_no_confirmado';
  end if;
  v_actor := fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación.' using hint = 'responsable_requerido';
  end if;

  -- Qué se resuelve y cuánto le falta.
  if p_hallazgo_id is null then
    -- Una no cargada: su prenda es la de la línea del cuadre del barrido.
    if p_variante_id is null then
      raise exception 'Falta la prenda.' using hint = 'barrido_resolver_prenda';
    end if;
    v_total := coalesce((
      select sum((l ->> 'no_cargadas')::integer)::integer
        from cuadres_piso c, jsonb_array_elements(coalesce(c.no_cargado, '[]'::jsonb)) l
       where c.barrido_id = p_barrido_id and (l ->> 'variante_id')::uuid = p_variante_id), 0);
    if v_total = 0 then
      raise exception 'Esa prenda no quedó por resolver en este barrido.' using hint = 'barrido_resolver_no_esta';
    end if;
    v_resuelto := coalesce((select sum(z.cantidad)::integer from barrido_piso_resueltos z
                             where z.barrido_id = p_barrido_id and z.pendiente_variante_id = p_variante_id), 0);
    v_pendiente_variante := p_variante_id;
    v_variante := p_variante_id;
  else
    v_total := coalesce((select h.cantidad from barrido_piso_hallazgos h
                          where h.id = p_hallazgo_id and h.barrido_id = p_barrido_id and h.anulada_en is null), 0);
    if v_total = 0 then
      raise exception 'Eso apartado no es de este barrido o se quitó.' using hint = 'barrido_resolver_no_esta';
    end if;
    v_resuelto := coalesce((select sum(z.cantidad)::integer from barrido_piso_resueltos z where z.hallazgo_id = p_hallazgo_id), 0);
    if p_como <> 'no_era' and p_variante_id is null then
      raise exception 'Elige qué prenda era.' using hint = 'barrido_resolver_prenda';
    end if;
    v_variante := case when p_como = 'no_era' then null else p_variante_id end;
  end if;
  if p_cantidad > v_total - v_resuelto then
    raise exception 'Quedan % por resolver y pediste %. Alguien más ya resolvió una parte: revisa la lista.',
      v_total - v_resuelto, p_cantidad using hint = 'barrido_ya_resuelto';
  end if;

  if v_variante is not null and p_como <> 'no_era' then
    if not exists (select 1 from variantes va join productos pr on pr.id = va.producto_id
                    where va.id = v_variante and va.activo and not pr.es_prueba
                      and va.id <> '22222222-2222-4222-8222-222222222222'
                      and pr.id <> '11111111-1111-4111-8111-111111111111') then
      raise exception 'Esa prenda no está activa en el catálogo.' using hint = 'barrido_resolver_prenda';
    end if;
    v_piso := (select s.id from sububicaciones s where s.ubicacion_id = v_sede and s.tipo = 'piso_venta');
    v_almacen := (select s.id from sububicaciones s where s.ubicacion_id = v_sede and s.tipo = 'almacen_tienda');
    if v_piso is null or v_almacen is null then
      raise exception 'Esta sede no separa piso y almacén.' using hint = 'barrido_sin_separar';
    end if;
    v_nota_mov := left('Barrido del piso' || coalesce(': ' || v_nota, ''), 200);

    if p_como = 'colgada' then
      -- Ya está en el almacén de la sede: se baja al piso. Bajo el candado del stock de la prenda.
      perform fn_bloquear_en_orden(v_sede, array[v_variante], true);
      v_libre := coalesce((select sum(st.cantidad - st.cantidad_apartada)::integer from stock st
                            where st.ubicacion_id = v_sede and st.sububicacion_id = v_almacen and st.variante_id = v_variante), 0);
      if v_libre < p_cantidad then
        raise exception 'En el almacén de la sede hay % libre(s) de esa prenda y pediste %. Si viene en un traslado, recíbelo primero en Traslados.',
          greatest(v_libre, 0), p_cantidad using hint = 'barrido_sin_almacen';
      end if;
      perform mover_interno(v_sede, v_variante, p_cantidad, v_almacen, v_piso, v_nota_mov, null);
    else
      -- «encontrada»: si viene en camino, se contaría dos veces.
      v_en_camino := coalesce((
        select sum(ti.cantidad)::integer from transferencias tr join transferencia_items ti on ti.transferencia_id = tr.id
         where tr.estado = 'en_transito' and tr.ubicacion_destino_id = v_sede and ti.variante_id = v_variante), 0);
      if v_en_camino > 0 then
        raise exception 'Esa prenda viene en un traslado hacia esta sede (% en camino). Recíbelo en Traslados y luego elige «Ya está en el almacén».',
          v_en_camino using hint = 'barrido_en_camino';
      end if;
      -- Por las funciones de siempre: con la carga abierta y sin historia en la sede, es stock inicial que se baja al piso; si no,
      -- «Encontré prendas» al almacén (su candado: fn_puede_ajustar_stock) y se baja al piso aquí mismo.
      v_carga := fn_carga_inicial_abierta(v_sede)
                 and not exists (select 1 from movimientos m where m.variante_id = v_variante and m.ubicacion_id = v_sede);
      if v_carga then
        perform ajustar_inventario(v_sede, v_almacen, '[]'::jsonb,
                                   null, jsonb_build_array(jsonb_build_object('variante_id', v_variante, 'cantidad', p_cantidad)),
                                   true, v_nota_mov, p_id);
      else
        perform ajustar_inventario(v_sede, v_almacen,
                                   jsonb_build_array(jsonb_build_object('variante_id', v_variante, 'cantidad', p_cantidad)),
                                   'reposicion', '[]'::jsonb, false, v_nota_mov, p_id);
        perform mover_interno(v_sede, v_variante, p_cantidad, v_almacen, v_piso, v_nota_mov, null);
      end if;
    end if;
  end if;

  insert into barrido_piso_resueltos (id, barrido_id, hallazgo_id, pendiente_variante_id, como, variante_id, cantidad, nota, persona_id)
    values (p_id, p_barrido_id, p_hallazgo_id, v_pendiente_variante, p_como, v_variante, p_cantidad, v_nota, v_actor);

  return fn_barrido_piso_por_resolver(v_sede) || jsonb_build_object('ya_registrado', false);
end;
$fn$;

revoke all on function retail.resolver_pendiente_barrido(uuid, uuid, uuid, uuid, text, integer, text) from public, anon;
grant execute on function retail.resolver_pendiente_barrido(uuid, uuid, uuid, uuid, text, integer, text) to authenticated;
comment on function retail.resolver_pendiente_barrido(uuid, uuid, uuid, uuid, text, integer, text) is
  'ADR-0690 (actividad 8): cierra una parte de lo que un barrido confirmado dejó por resolver. p_hallazgo_id null = una no cargada (p_variante_id es su prenda); con p_hallazgo_id = un apartado (p_variante_id es la prenda que era; null en no_era). p_como: colgada (baja del almacén al piso, mover_interno), encontrada («Encontré prendas» por ajustar_inventario —candado fn_puede_ajustar_stock— y se baja al piso; rechazada si viene en camino: barrido_en_camino), no_era (no mueve nada). p_id lo elige el aparato: el mismo id con los mismos datos devuelve la lista sin repetir. Pide Existencias, operar la sede y responsable. Devuelve fn_barrido_piso_por_resolver(sede) + ya_registrado.';

-- ----------------------------------------------------------------------------
-- 4. Lo resuelto de un barrido es historia: frena «Eliminar producto» (renglón 28 de fn_producto_historia, junto al 27 de las
--    lecturas que sumó 20261122194500). Reemplazo ANCLADO: si el texto vivo no es el esperado, aborta sin cambiar nada.
-- ----------------------------------------------------------------------------
do $historia$
declare
  c_viejo constant text := $v$        from retail.barrido_piso_lecturas x where x.variante_id in (select id from vs)
    ) h$v$;
  c_nuevo constant text := $n$        from retail.barrido_piso_lecturas x where x.variante_id in (select id from vs)
      union all select 28, 'prendas resueltas de un barrido del piso', count(*), false
        from retail.barrido_piso_resueltos x where x.variante_id in (select id from vs) or x.pendiente_variante_id in (select id from vs)
    ) h$n$;
  v_def text := pg_get_functiondef('retail.fn_producto_historia(uuid)'::regprocedure);
  v_n integer;
begin
  if position(c_nuevo in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, c_viejo, ''))) / length(c_viejo);
  if v_n <> 1 then
    raise exception 'fn_producto_historia no es la que esta migración espera (falta el renglón 27 de 20261122194500, o la parcharon en vivo). No se cambió nada.';
  end if;
  execute replace(v_def, c_viejo, c_nuevo);
end;
$historia$;

reset lock_timeout;

notify pgrst, 'reload schema';
