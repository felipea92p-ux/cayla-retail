-- ============================================================================
-- 20261010200000_crear_pieza_liquidacion_con_token.sql — CAYLA V2 (ADR-0371, actualización 2026-10-10; /chaos)
--
-- EL PROBLEMA. `/chaos` (semilla 371, ataques DC-01 y RS-03): tres clics seguidos en «Etiquetar» crearon TRES piezas de
-- liquidación. El botón ya se traba en la pantalla, pero eso no alcanza cuando la respuesta se pierde (la base guardó, el
-- navegador no se enteró) y la persona vuelve a pulsar: queda una pieza fantasma «a la venta» que infla las cifras y cuyo código
-- nadie imprimió. Es el mismo caso que `registrar_venta` resolvió con su `p_token`.
--
-- LO QUE HACE. `crear_pieza_liquidacion` recibe `p_token` (la hoja lo genera una vez por pieza). Si ese token ya creó una pieza,
-- devuelve ESA pieza y no crea otra. Dos llamadas simultáneas con el mismo token se turnan en el índice único: la segunda no
-- inserta (`on conflict do nothing`) y lee la de la primera. Sin token (una llamada vieja) funciona como antes.
--
-- PRODUCCIÓN. Una parte, idempotente. La tabla es nueva y aún no la usa ninguna pantalla publicada: el `alter` no compite con la
-- tienda. Sin políticas (ADR-0195 no aplica). `drop function` no toma los candados de `auth` y `storage`. Se pega ANTES de publicar
-- la web, que ya manda `p_token`.
--
-- VERIFICACIÓN (solo lectura):
--   select to_regprocedure('retail.crear_pieza_liquidacion(uuid,uuid,numeric,uuid)') is not null,
--          to_regprocedure('retail.crear_pieza_liquidacion(uuid,uuid,numeric)') is null;          → t | t
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

alter table retail.piezas_liquidacion add column if not exists token uuid;
create unique index if not exists piezas_liquidacion_token_key on retail.piezas_liquidacion (token) where token is not null;

-- La firma cambia (cuarto parámetro): se quita la de tres para que no queden dos sobrecargas que la web confunda.
drop function if exists retail.crear_pieza_liquidacion(uuid, uuid, numeric);

create or replace function retail.crear_pieza_liquidacion(p_ubicacion_id uuid, p_categoria_id uuid, p_precio numeric, p_token uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_persona uuid;
  v_terminal uuid;
  v_precio numeric;
  v_id uuid;
  v_codigo text;
  v_cat text;
begin
  perform fn_exigir_modulo('liquidacion');
  v_persona := fn_actor_persona_id(true);
  v_terminal := fn_actividad_terminal_ahora();
  if p_ubicacion_id is null or not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para etiquetar piezas de esa tienda' using errcode = '42501';
  end if;

  -- El mismo pedido otra vez (doble clic, o la respuesta se perdió y se volvió a pulsar): la pieza que ya creó.
  if p_token is not null then
    v_id := (select id from piezas_liquidacion where token = p_token);
    if v_id is not null then
      return fn_pieza_liquidacion_json(v_id);
    end if;
  end if;

  v_cat := (select nombre from categorias where id = p_categoria_id and activo);
  if v_cat is null then
    raise exception 'liquidacion_datos_invalidos' using hint = 'Elige una categoría de la lista';
  end if;
  v_precio := fn_exigir_precio_liquidacion(p_precio);

  insert into piezas_liquidacion (ubicacion_id, categoria_id, precio, creada_por, terminal_id, token)
    values (p_ubicacion_id, p_categoria_id, v_precio, v_persona, v_terminal, p_token)
    on conflict (token) where token is not null do nothing
    returning id into v_id;
  -- Otra llamada con el mismo token ganó el índice mientras tanto: se devuelve la suya.
  if v_id is null then
    return fn_pieza_liquidacion_json((select id from piezas_liquidacion where token = p_token));
  end if;
  v_codigo := fn_codigo_liquidacion_nuevo();
  insert into piezas_liquidacion_etiquetas (codigo, pieza_id, precio, persona_id, terminal_id)
    values (v_codigo, v_id, v_precio, v_persona, v_terminal);

  begin
    perform fn_actividad_anotar(
      'liquidacion', 'pieza_liquidacion_creada',
      'etiquetó una pieza de liquidación: ' || v_cat || ' a ' || fn_actividad_soles(v_precio) || ' (' || v_codigo || ')',
      v_persona, v_terminal, p_ubicacion_id, null, 'piezas_liquidacion', v_id::text, now(),
      jsonb_build_object('codigo', v_codigo, 'precio', v_precio, 'categoria_id', p_categoria_id), 'vivo');
  exception when others then
    raise warning 'actividad: no se anotó la pieza de liquidación % (%)', v_id, sqlerrm;
  end;

  return fn_pieza_liquidacion_json(v_id);
end;
$$;
revoke all on function retail.crear_pieza_liquidacion(uuid, uuid, numeric, uuid) from public, anon;
grant execute on function retail.crear_pieza_liquidacion(uuid, uuid, numeric, uuid) to authenticated;

do $v$
begin
  if (select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'crear_pieza_liquidacion') <> 1 then
    raise exception 'crear_pieza_liquidacion: debe quedar una sola';
  end if;
end
$v$;
