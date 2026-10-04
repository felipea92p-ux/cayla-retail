-- ============================================================================
-- 20261005100200_pedidos_que_no_se_pierden_parte3_para_enviar.sql — CAYLA V2 · ADR-0328, actividad 17 (Felipe, 2026-10-04)
-- Traslados: pedidos que no se pierden · PARTE 3 de 3: la lista «Para enviar».
--
-- EL PROBLEMA PRIMERO. Felipe decidió que una prenda COLGADA no se manda a otra sede en un paso: primero se sube al
-- almacén y después sale en un traslado (ADR-0328, decisión técnica 12; distinta de la recomendada). El riesgo de dos
-- pasos es que el segundo se olvide: la prenda queda en el almacén «para mandarla a Arequipa» y nadie vuelve a pensar en
-- ella. Hoy «Subir prenda» (`retirar_del_piso`, ADR-0300) no sabe para qué se subió.
--
-- QUÉ HACE.
--   · `subir_para_enviar(sede, destino, prendas, nota, marca)`: sube al almacén con la MISMA puerta de siempre
--     (`retirar_del_piso`: módulo Existencias, operar la sede, todo o nada, marca de reintento) y, en la misma
--     transacción, deja cada prenda en `prendas_para_enviar` con su destino. No hay una segunda forma de subir.
--   · Disparador `para_enviar_al_salir` (AFTER INSERT en `transferencia_items`): cuando sale un traslado de esa sede a ese
--     destino con esa prenda, descuenta de la lista lo que se llevó (lo más antiguo primero) en `prendas_para_enviar_salidas`.
--     Da igual cómo se armó el traslado (Nuevo traslado, «Armar el envío», enviar un pedido): si sale, sale de la lista.
--     Si el traslado se anula, su salida deja de contar sola (se lee el estado del traslado): la prenda vuelve a la lista.
--   · `cancelar_para_enviar`: «Ya no la envío» (se vendió aquí, se decidió otra cosa). Queda con su motivo.
--   · `fn_para_enviar(sede)`: la lista, con lo que falta enviar y cuánto hay HOY libre en el almacén de esa prenda.
--   · «Eliminar un producto» la conoce (`fn_producto_historia`, anclado): una prenda para enviar frena el borrado, como
--     un pedido a otra sede. Sin esto, la prueba de deriva de `eliminar_producto.mjs` queda en rojo y el borrado chocaría
--     con la llave.
--
-- ESTADO QUE DEJA DE SER POSIBLE: una prenda subida «para enviar» que sale en un traslado y sigue en la lista, o que se
-- anula su traslado y desaparece de la lista sin haber salido.
--
-- CONCURRENCIA. El disparador corre DENTRO de `iniciar_traslado`, que ya tomó el stock del origen (ADR-0190); después toma
-- las filas de la lista de esa prenda `for update`, en orden de creación. `cancelar_para_enviar` toma solo su fila. Dos
-- traslados a la vez de la misma prenda se ponen en fila en el stock: el segundo ve lo que el primero ya descontó.
--
-- CÓMO SE PEGA EN PRODUCCIÓN. DESPUÉS de la parte 1 (sus tablas) y ANTES de fusionar la web. Funciones +
-- `create or replace trigger` (nunca `drop trigger`, CLAUDE.md «Políticas y deadlocks»); ninguna política, ningún `alter`.
-- El disparador toma un instante el candado de `transferencia_items` (lock_timeout de 3 s: si alguien está enviando,
-- falla limpio y se repite). Idempotente. Cómo se verifica después:
--   select tgname from pg_trigger where tgrelid = 'retail.transferencia_items'::regclass and tgname = 'para_enviar_al_salir';
--
-- SE ROMPE SI `retirar_del_piso` cambia su firma o deja de recibir la marca (la lista quedaría sin su reintento), o si
-- algún día un traslado sale sin pasar por `transferencia_items` (el disparador no lo vería y la prenda seguiría «para
-- enviar»).
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- ---------------------------------------------------------------------------
-- 1. Lo que falta enviar de una prenda de la lista (una sola fórmula, la usan el disparador y la lectura)
-- ---------------------------------------------------------------------------
create or replace function retail.fn_para_enviar_pendiente(p_id uuid)
returns integer
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select pp.cantidad - coalesce((
           select sum(s.cantidad)
             from prendas_para_enviar_salidas s
             join transferencia_items ti on ti.id = s.transferencia_item_id
             join transferencias t on t.id = ti.transferencia_id
            where s.prenda_para_enviar_id = pp.id
              and t.estado <> 'anulada'), 0)::integer
    from prendas_para_enviar pp
   where pp.id = p_id;
$$;
revoke all on function retail.fn_para_enviar_pendiente(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. El disparador: lo que sale en un traslado sale de la lista
-- ---------------------------------------------------------------------------
-- PROMETE: por cada línea de traslado, descuenta de las prendas «para enviar» de esa sede, a ese destino y de esa prenda,
-- lo más antiguo primero, hasta lo que se llevó. Nunca más de lo que falta. ASUME: el traslado ya existe (se insertó antes
-- que sus líneas, como en `iniciar_traslado`).
create or replace function retail.trg_para_enviar_al_salir()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_origen uuid;
  v_destino uuid;
  v_resto integer := new.cantidad;
  v_falta integer;
  v_toma integer;
  r record;
begin
  v_origen := (select t.ubicacion_origen_id from transferencias t where t.id = new.transferencia_id);
  v_destino := (select t.ubicacion_destino_id from transferencias t where t.id = new.transferencia_id);
  if v_origen is null or coalesce(new.cantidad, 0) <= 0 then
    return null;
  end if;
  for r in
    select pp.id
      from prendas_para_enviar pp
     where pp.ubicacion_id = v_origen
       and pp.ubicacion_destino_id = v_destino
       and pp.variante_id = new.variante_id
       and pp.cancelado_en is null
     order by pp.created_at, pp.id
     for update
  loop
    exit when v_resto <= 0;
    v_falta := fn_para_enviar_pendiente(r.id);
    continue when v_falta <= 0;
    v_toma := least(v_falta, v_resto);
    insert into prendas_para_enviar_salidas (prenda_para_enviar_id, transferencia_item_id, cantidad)
      values (r.id, new.id, v_toma);
    v_resto := v_resto - v_toma;
  end loop;
  return null;
end;
$$;
revoke all on function retail.trg_para_enviar_al_salir() from public, anon, authenticated;

create or replace trigger para_enviar_al_salir
  after insert on retail.transferencia_items
  for each row execute function retail.trg_para_enviar_al_salir();

-- ---------------------------------------------------------------------------
-- 3. Subir para enviar: la misma subida de siempre + la lista
-- ---------------------------------------------------------------------------
-- PROMETE: sube del piso al almacén (todo o nada, con `retirar_del_piso`) y anota cada prenda «para enviar» al destino.
-- Reenviar la misma marca no sube dos veces ni duplica la lista (devuelve ya_registrada). ASUME: p_items como
-- `retirar_del_piso` ([{variante_id, cantidad}], repetidas se suman); el destino es otra sede activa.
create or replace function retail.subir_para_enviar(
  p_ubicacion_id uuid,
  p_destino_id uuid,
  p_items jsonb,
  p_nota text default null,
  p_token uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_destino text;
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  v_res jsonb;
  v_actor uuid;
  v_n integer;
begin
  if p_token is null then
    raise exception 'Falta la marca de este intento. Cierra la ventana y vuelve a abrirla.' using hint = 'retiro_sin_token';
  end if;
  if p_destino_id is null or p_destino_id = p_ubicacion_id then
    raise exception 'Elige a qué otra sede la vas a enviar' using hint = 'para_enviar_sin_destino';
  end if;
  v_destino := (select u.nombre from ubicaciones u where u.id = p_destino_id and u.activo);
  if v_destino is null then
    raise exception 'Esa sede no existe o está inactiva' using hint = 'para_enviar_sin_destino';
  end if;
  if char_length(coalesce(v_nota, '')) > 200 then
    raise exception 'La nota admite hasta 200 caracteres.' using hint = 'retiro_nota_larga';
  end if;

  -- La subida: la puerta de siempre (módulo, sede, prendas, piso que alcanza, marca). Su nota es la del libro de
  -- movimientos: dice para dónde va. Si es un reintento, devuelve ya_registrada sin mover nada.
  v_res := retirar_del_piso(p_ubicacion_id, p_items,
                            left('Para enviar a ' || v_destino || coalesce(' · ' || v_nota, ''), 200), p_token);

  -- La lista: una fila por prenda (repetidas sumadas), con una marca derivada de la de la ventana. Un reintento choca con
  -- su marca y no duplica.
  if exists (
    select 1
      from (select (e ->> 'variante_id')::uuid as v from jsonb_array_elements(p_items) e group by 1) l
     where not exists (select 1 from prendas_para_enviar pp where pp.token_cliente = md5(p_token::text || ':para_enviar:' || l.v::text)::uuid)
  ) then
    v_actor := fn_actor_persona_id(true);
  end if;
  insert into prendas_para_enviar (ubicacion_id, ubicacion_destino_id, variante_id, cantidad, nota, creado_por, token_cliente)
    select p_ubicacion_id, p_destino_id, l.v, l.c, v_nota, v_actor, md5(p_token::text || ':para_enviar:' || l.v::text)::uuid
      from (select (e ->> 'variante_id')::uuid as v, sum((e ->> 'cantidad')::integer)::integer as c
              from jsonb_array_elements(p_items) e group by 1) l
    on conflict (token_cliente) do nothing;
  get diagnostics v_n = row_count;
  return v_res || jsonb_build_object('para_enviar', v_n, 'destino', v_destino);
end;
$$;

comment on function retail.subir_para_enviar(uuid, uuid, jsonb, text, uuid) is
  'ADR-0328 act. 17: sube al almacén (retirar_del_piso: Existencias, todo o nada, marca) y anota cada prenda en la lista «Para enviar» a p_destino_id, en una transacción. Reintento con la misma marca: ni sube ni duplica. Sale de la lista sola cuando sale en un traslado a ese destino (disparador para_enviar_al_salir).';

-- ---------------------------------------------------------------------------
-- 4. «Ya no la envío»
-- ---------------------------------------------------------------------------
create or replace function retail.cancelar_para_enviar(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  pp prendas_para_enviar%rowtype;
  v_motivo text := left(nullif(btrim(coalesce(p_motivo, '')), ''), 200);
begin
  select * into pp from prendas_para_enviar where id = p_id for update;
  if not found then
    raise exception 'Esa prenda no está en la lista para enviar';
  end if;
  if not (fn_ve_modulo('traslados') or fn_ve_modulo('existencias')) then
    raise exception 'Tu rol no tiene Traslados ni Existencias' using errcode = '42501';
  end if;
  if not fn_puede_operar_ubicacion(pp.ubicacion_id) then
    raise exception 'La quita de la lista la sede que la iba a enviar' using errcode = '42501';
  end if;
  if pp.cancelado_en is not null then
    return;   -- reintento: ya estaba fuera de la lista
  end if;
  if fn_para_enviar_pendiente(pp.id) <= 0 then
    raise exception 'Esa prenda ya salió en un traslado';
  end if;
  if v_motivo is null then
    raise exception 'Escribe por qué ya no la envías (por ejemplo: «se vendió aquí»)';
  end if;
  update prendas_para_enviar
     set cancelado_en = now(), cancelado_por = fn_actor_persona_id(true), cancelado_motivo = v_motivo
   where id = pp.id;
end;
$$;

comment on function retail.cancelar_para_enviar(uuid, text) is
  'ADR-0328 act. 17: saca una prenda de la lista «Para enviar» con su motivo («Ya no la envío»). Traslados o Existencias + operar la sede que la iba a enviar. Lo que ya salió no se cancela. Reintento sin error.';

-- ---------------------------------------------------------------------------
-- 5. La lista
-- ---------------------------------------------------------------------------
-- Lo que la sede tiene para enviar: solo lo que falta enviar (> 0) y no se canceló, con lo libre HOY en su almacén.
create or replace function retail.fn_para_enviar(p_ubicacion_id uuid)
returns table (
  id uuid, destino_id uuid, destino text, variante_id uuid, producto text, color text, talla text, sku text,
  cantidad integer, falta integer, en_almacen integer, nota text, created_at timestamptz, creado_por_nombre text
)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select x.id, x.destino_id, x.destino, x.variante_id, x.producto, x.color, x.talla, x.sku, x.cantidad, x.falta,
         x.en_almacen, x.nota, x.created_at, x.creado_por_nombre
    from (
      select pp.id,
             pp.ubicacion_destino_id as destino_id,
             u.nombre as destino,
             pp.variante_id,
             p.referencia as producto,
             co.nombre as color,
             ta.valor as talla,
             coalesce(va.codigo, va.sku) as sku,
             pp.cantidad,
             fn_para_enviar_pendiente(pp.id) as falta,
             greatest(coalesce((
               select sum(st.cantidad - st.cantidad_apartada)
                 from stock st
                where st.variante_id = pp.variante_id
                  and st.ubicacion_id = pp.ubicacion_id
                  and st.sububicacion_id is not distinct from fn_sububicacion_por_defecto(pp.ubicacion_id, 'traslado_salida')), 0), 0)::integer as en_almacen,
             pp.nota,
             pp.created_at,
             nullif(btrim(coalesce(per.nombres, '') || ' ' || coalesce(per.apellidos, '')), '') as creado_por_nombre
        from prendas_para_enviar pp
        join ubicaciones u on u.id = pp.ubicacion_destino_id
        join variantes va on va.id = pp.variante_id
        join productos p on p.id = va.producto_id
        left join colores co on co.codigo = va.color_codigo
        left join tallas ta on ta.id = va.talla_id
        left join public.personas per on per.id = pp.creado_por
       where pp.ubicacion_id = p_ubicacion_id
         and pp.cancelado_en is null
         and fn_puede_operar_ubicacion(p_ubicacion_id)
    ) x
   where x.falta > 0
   order by x.destino, x.created_at, x.id
   limit 300;
$$;

comment on function retail.fn_para_enviar(uuid) is
  'ADR-0328 act. 17: la lista «Para enviar» de la sede: lo subido al almacén para otra sede que todavía no sale (falta > 0) ni se canceló, por destino, con lo libre hoy en su almacén. Exige operar la sede.';

-- ---------------------------------------------------------------------------
-- 6. «Eliminar un producto» la conoce: una prenda que se iba a mandar a otra sede FRENA el borrado (como un pedido a
--    otra sede, renglón 16). Sin esto, eliminar ese producto chocaría con la llave y diría solo «otra parte del sistema
--    todavía lo usa». Reemplazo ANCLADO de `fn_producto_historia` (vive en producción con parches de Frescura y, si se
--    pega antes, del cuadre del piso, que ancla en el renglón 13: este ancla en el 16 y no se pisan). Re-pegable.
-- ---------------------------------------------------------------------------
create or replace function pg_temp.anclar(p_firma text, p_viejo text, p_nuevo text)
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
    raise exception '% cambió desde que se escribió esta migración: el texto ancla aparece % veces (se esperaba 1). Regenera el reemplazo desde su definición viva.',
      p_firma, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

select pg_temp.anclar(
  'retail.fn_producto_historia(uuid)',
  $v$      union all select 16, 'pedidos a otra sede para apartar', count(*), false
        from retail.separacion_pedidos x where x.variante_id in (select id from vs)$v$,
  $n$      union all select 16, 'pedidos a otra sede para apartar', count(*), false
        from retail.separacion_pedidos x where x.variante_id in (select id from vs)
      union all select 21, 'prendas para enviar a otra sede', count(*), false
        from retail.prendas_para_enviar x where x.variante_id in (select id from vs)$n$
);

-- ---------------------------------------------------------------------------
-- 7. Permisos
-- ---------------------------------------------------------------------------
revoke all on function retail.subir_para_enviar(uuid, uuid, jsonb, text, uuid) from public, anon;
revoke all on function retail.cancelar_para_enviar(uuid, text) from public, anon;
revoke all on function retail.fn_para_enviar(uuid) from public, anon;
grant execute on function retail.subir_para_enviar(uuid, uuid, jsonb, text, uuid) to authenticated;
grant execute on function retail.cancelar_para_enviar(uuid, text) to authenticated;
grant execute on function retail.fn_para_enviar(uuid) to authenticated;

notify pgrst, 'reload schema';
