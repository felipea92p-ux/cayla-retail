-- ============================================================================
-- 20261107191000_quitar_combinacion_nacida_al_recibir.sql — CAYLA V2 · ADR-0393 (act. 2026-11-07 b)
-- Recibir: la talla o el color que se agregó por error en un envío se puede quitar; lo que la prenda ya tenía, no.
--
-- EL PROBLEMA PRIMERO. «+ talla o color» no se queda en la pantalla: `preparar_prenda_al_recibir` crea la combinación en el catálogo en el acto, para
-- poder contarla. Si se eligió el color equivocado (Felipe, prueba del 2026-11-07: «puse un color equivocado y no lo puedo quitar»), la prenda quedaba
-- con esa combinación para siempre, en Existencias, en la tienda web y en las etiquetas, sin que nada en Recibir dejara deshacerlo. Y no había forma de
-- distinguirla de las que la prenda ya tenía: nada anotaba en qué envío nació.
--
-- QUÉ CAMBIA
--   1. `variantes_nacidas_al_recibir`: qué combinación nació (o volvió a activarse) al recibir y en qué envío. Solo la escriben las funciones de Recibir.
--   2. `preparar_prenda_al_recibir` la anota: al crear una prenda nueva (todas sus combinaciones) y al sumarle una talla o un color a una que ya existe.
--   3. `fn_combinaciones_quitables(p_despacho_id)`: las que nacieron en ese envío y todavía se pueden quitar (solo lectura).
--   4. `quitar_combinaciones_al_recibir(p_despacho_id, p_variante_ids)`: las archiva (`activo = false`, nunca se borran), todo o nada.
--      Solo si nació en ESTE envío, sigue activa, no tiene stock ni un solo movimiento, no está repartida en lo contado de ningún envío, y a su prenda le
--      queda otra combinación activa. Queda en la Actividad. Firma con el responsable del combo (`fn_actor_persona_id(true)`).
--
-- CÓMO SE VE MAL HECHO: borrar la fila (rompería códigos de barras y el historial), o dejar quitar cualquier combinación de la prenda desde Recibir (una
-- talla con ventas desaparecería del catálogo). Por eso el candado es «nació aquí y nadie la usó»; el resto se archiva en Productos, como siempre.
--
-- DESCARTÉ
--   · Recordarlo solo en la pantalla: al recargar se perdía, y la base no podría negarse a quitar una combinación que la prenda ya tenía.
--   · Una columna en `variantes`: el núcleo del catálogo no se toca por una necesidad de Recibir (principio 1); una tabla al lado basta.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). UNA parte, idempotente: la tabla nueva solo se lee por funciones `security definer`, así que lleva RLS
-- encendido SIN políticas (regla de «Políticas y deadlocks», ADR-0195), y nada aquí toma las tablas de `auth` ni `storage`. Necesita el
-- `preparar_prenda_al_recibir` vivo con los tres anclajes (el reemplazo lo comprueba y se niega si cambió).
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- ---------- 1. Dónde nació cada combinación ----------
create table if not exists retail.variantes_nacidas_al_recibir (
  variante_id uuid primary key references retail.variantes (id),
  despacho_id uuid not null references retail.despachos (id),
  -- Ya existía desactivada y el envío la volvió a activar: quitarla la deja como estaba.
  reactivada boolean not null default false,
  creada_por uuid,
  creada_at timestamptz not null default now()
);
comment on table retail.variantes_nacidas_al_recibir is
  'ADR-0393 (act. 2026-11-07 b): qué combinación de talla y color nació (o se reactivó) al recibir un envío. Permite quitar solo lo agregado por error en ese envío.';
create index if not exists variantes_nacidas_al_recibir_despacho on retail.variantes_nacidas_al_recibir (despacho_id);
alter table retail.variantes_nacidas_al_recibir enable row level security;
revoke all on table retail.variantes_nacidas_al_recibir from anon, authenticated;

-- ---------- 2. preparar_prenda_al_recibir la anota ----------
create or replace function pg_temp.reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
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
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición viva.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- La prenda nueva: todas sus combinaciones nacen en este envío. Va DESPUÉS del `if` que la crea, no adentro: el reemplazo de 20261104003000 vive
-- adentro, y meterse en medio de su texto haría que no se reconozca si se vuelve a aplicar (las pruebas lo hacen).
select pg_temp.reemplazar(
  'retail.preparar_prenda_al_recibir(uuid,uuid,uuid,uuid,uuid,text,jsonb,numeric,text,uuid,uuid,boolean,uuid,uuid)',
  $v$    v_producto_id := p_producto_id;
  end if;
$v$,
  $v$    v_producto_id := p_producto_id;
  end if;
  -- ADR-0393 (act. 2026-11-07 b): las combinaciones de una prenda nueva nacieron en este envío; se pueden quitar mientras nadie las use.
  if p_producto_id is null then
    insert into retail.variantes_nacidas_al_recibir (variante_id, despacho_id, creada_por)
    select v.id, p_despacho_id, v_actor from retail.variantes v where v.producto_id = v_producto_id
    on conflict (variante_id) do nothing;
  end if;
$v$,
  1);

-- Una combinación que estaba desactivada y vuelve.
select pg_temp.reemplazar(
  'retail.preparar_prenda_al_recibir(uuid,uuid,uuid,uuid,uuid,text,jsonb,numeric,text,uuid,uuid,boolean,uuid,uuid)',
  $v$        update retail.variantes v set activo = true where v.id = v_existente.id;
      end if;$v$,
  $v$        update retail.variantes v set activo = true where v.id = v_existente.id;
        insert into retail.variantes_nacidas_al_recibir (variante_id, despacho_id, reactivada, creada_por)
        values (v_existente.id, p_despacho_id, true, v_actor)
        on conflict (variante_id) do update set despacho_id = excluded.despacho_id, reactivada = true, creada_por = excluded.creada_por, creada_at = now();
      end if;$v$,
  1);

-- Una talla o un color nuevo de una prenda que ya existe.
select pg_temp.reemplazar(
  'retail.preparar_prenda_al_recibir(uuid,uuid,uuid,uuid,uuid,text,jsonb,numeric,text,uuid,uuid,boolean,uuid,uuid)',
  $v$    insert into retail.variantes (producto_id, talla_id, color_codigo, precio, costo)
    values (v_producto_id, v_talla, v_color, v_precio, v_costo_nueva);$v$,
  $v$    with nueva as (
      insert into retail.variantes (producto_id, talla_id, color_codigo, precio, costo)
      values (v_producto_id, v_talla, v_color, v_precio, v_costo_nueva)
      returning id
    )
    -- ADR-0393 (act. 2026-11-07 b): nació en este envío.
    insert into retail.variantes_nacidas_al_recibir (variante_id, despacho_id, creada_por)
    select nueva.id, p_despacho_id, v_actor from nueva
    on conflict (variante_id) do nothing;$v$,
  1);

-- ---------- 3. Las que se pueden quitar ----------
-- Por qué una combinación nacida en el envío ya no se puede quitar, o `null` si se puede. Una sola regla para la lectura y para quitar.
create or replace function retail.fn_combinacion_no_se_quita(p_despacho_id uuid, p_variante_id uuid)
returns text
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select case
    when not exists (select 1 from retail.variantes_nacidas_al_recibir n where n.variante_id = p_variante_id and n.despacho_id = p_despacho_id)
      then 'no_nacio_aqui'
    when not exists (select 1 from retail.variantes v where v.id = p_variante_id and v.activo)
      then 'ya_quitada'
    when exists (select 1 from retail.stock s where s.variante_id = p_variante_id and s.cantidad <> 0)
      or exists (select 1 from retail.movimientos m where m.variante_id = p_variante_id)
      or exists (select 1 from retail.despacho_recibidos r where r.variante_id = p_variante_id)
      then 'con_prendas'
    -- Repartida en lo contado de un envío (lo separado o un pendiente): primero se pone en 0 ahí.
    when exists (select 1 from retail.despacho_conteos k where k.separado::text like '%' || p_variante_id::text || '%')
      or exists (select 1 from retail.despacho_pendientes dp where to_jsonb(dp)::text like '%' || p_variante_id::text || '%')
      then 'repartida'
    when not exists (
      select 1 from retail.variantes o
       where o.producto_id = (select v.producto_id from retail.variantes v where v.id = p_variante_id)
         and o.activo and o.id <> p_variante_id)
      then 'ultima'
    else null
  end;
$$;
revoke all on function retail.fn_combinacion_no_se_quita(uuid, uuid) from public, anon, authenticated;

create or replace function retail.fn_combinaciones_quitables(p_despacho_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
begin
  if retail.fn_ve_modulo('recibir') is not true then
    raise exception 'Recibir un envío necesita el módulo «Recibir mercadería» en tu rol'
      using errcode = '42501', hint = 'recibir_sin_modulo';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('variante_id', n.variante_id, 'producto_id', v.producto_id) order by n.creada_at)
      from retail.variantes_nacidas_al_recibir n
      join retail.variantes v on v.id = n.variante_id
     where n.despacho_id = p_despacho_id
       and retail.fn_combinacion_no_se_quita(p_despacho_id, n.variante_id) is null
  ), '[]'::jsonb);
end;
$$;
comment on function retail.fn_combinaciones_quitables(uuid) is
  'ADR-0393 (act. 2026-11-07 b): las combinaciones que nacieron al recibir este envío y todavía se pueden quitar ([{variante_id, producto_id}]). Solo lectura.';
revoke all on function retail.fn_combinaciones_quitables(uuid) from public, anon;
grant execute on function retail.fn_combinaciones_quitables(uuid) to authenticated, service_role;

-- ---------- 4. Quitarlas ----------
create or replace function retail.quitar_combinaciones_al_recibir(p_despacho_id uuid, p_variante_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_actor uuid;
  v_despacho record;
  v_id uuid;
  v_motivo text;
  v_nombres text[] := '{}';
begin
  if retail.fn_ve_modulo('recibir') is not true then
    raise exception 'Recibir un envío necesita el módulo «Recibir mercadería» en tu rol'
      using errcode = '42501', hint = 'recibir_sin_modulo';
  end if;
  select d.id, d.numero, d.estado, d.ubicacion_destino_id into v_despacho from retail.despachos d where d.id = p_despacho_id;
  if not found then
    raise exception 'Ese envío no existe' using hint = 'envio_no_existe';
  end if;
  v_actor := retail.fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  perform retail.fn_recepcion_exigir(v_despacho.id, v_despacho.ubicacion_destino_id, v_actor);
  if coalesce(cardinality(p_variante_ids), 0) = 0 then
    raise exception 'Elige qué talla o color quitar' using hint = 'combinacion_sin_elegir';
  end if;

  -- Las prendas se bloquean (como al sumarles una talla): nadie le agrega una combinación mientras se quita otra.
  perform 1 from retail.productos pr
   where pr.id in (select v.producto_id from retail.variantes v where v.id = any(p_variante_ids))
     for no key update;

  foreach v_id in array p_variante_ids loop
    v_motivo := retail.fn_combinacion_no_se_quita(p_despacho_id, v_id);
    -- Ya quitada (un doble clic, un reintento tras un corte): no es un error, no hace nada.
    if v_motivo = 'ya_quitada' then
      continue;
    end if;
    if v_motivo is not null then
      raise exception '%', case v_motivo
          when 'no_nacio_aqui' then 'Esa talla o color ya era de la prenda: solo se quita lo que agregaste en este envío. Lo demás se archiva en Productos'
          when 'con_prendas' then 'Esa talla o color ya tiene prendas en el stock o movimientos: ya no se puede quitar desde aquí'
          when 'repartida' then 'Esa talla o color tiene prendas repartidas en lo contado: ponla en 0 y vuelve a intentar'
          when 'ultima' then 'La prenda se quedaría sin tallas ni colores: agrega la correcta antes de quitar esta'
          else 'No se pudo quitar esa talla o color'
        end
        using hint = 'combinacion_' || v_motivo;
    end if;
    -- Para que la segunda de la lista no se crea la última por culpa de la primera, se archiva una por una.
    update retail.variantes v set activo = false where v.id = v_id;
    v_nombres := v_nombres || (
      select concat_ws(' ', pr.referencia, nullif(concat_ws(' · ', t.valor, c.nombre), ''))
        from retail.variantes v
        join retail.productos pr on pr.id = v.producto_id
        left join retail.tallas t on t.id = v.talla_id
        left join retail.colores c on c.codigo = v.color_codigo
       where v.id = v_id);
  end loop;

  if cardinality(v_nombres) > 0 then
    begin
      perform retail.fn_actividad_anotar(
        'recibir', 'despacho_combinacion_quitada',
        'quitó de ' || retail.fn_envio_numero_texto(v_despacho.numero) || ' lo agregado por error: ' || array_to_string(v_nombres, ', '),
        v_actor, retail.fn_actividad_terminal_ahora(), v_despacho.ubicacion_destino_id, null,
        'despachos', p_despacho_id::text, now(),
        jsonb_build_object('despacho_id', p_despacho_id, 'variante_ids', to_jsonb(p_variante_ids)),
        'vivo');
    exception when others then
      raise warning 'actividad: no se anotó lo quitado del envío % (%)', v_despacho.numero, sqlerrm;
    end;
  end if;

  return jsonb_build_object('despacho_id', p_despacho_id, 'quitadas', cardinality(v_nombres));
end;
$$;
comment on function retail.quitar_combinaciones_al_recibir(uuid, uuid[]) is
  'ADR-0393 (act. 2026-11-07 b): archiva las tallas o colores que se agregaron por error al recibir este envío (nacieron aquí, sin stock ni movimientos, sin repartir, y no la última de su prenda). Todo o nada; queda en la Actividad.';
revoke all on function retail.quitar_combinaciones_al_recibir(uuid, uuid[]) from public, anon;
grant execute on function retail.quitar_combinaciones_al_recibir(uuid, uuid[]) to authenticated, service_role;

reset search_path;
reset lock_timeout;
