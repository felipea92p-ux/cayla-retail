-- ============================================================================
-- 20261010210000_pieza_liquidacion_descripcion.sql — CAYLA V2 (ADR-0375, actualización 2026-10-10; /formidable)
--
-- EL PROBLEMA. La prueba ciega de /formidable: con dos «Camisas y Blusas» a la venta, la lista solo las separa por código y precio, y
-- quien busca «la blusa beige» no la encuentra; tampoco había dónde decir «la blusa vieja» al etiquetarla. Felipe (2026-10-10): una
-- descripción corta y OPCIONAL al etiquetar, que se pueda buscar y salga en la etiqueta y en la boleta.
--
-- LO QUE HACE. `piezas_liquidacion.descripcion` (hasta 60 letras, opcional) y `crear_pieza_liquidacion` con `p_descripcion` (la firma
-- pasa de 4 a 5 parámetros: se quita la de 4). `fn_pieza_liquidacion_json` la devuelve. La venta no cambia: el nombre de la línea lo
-- arma la caja con `descripcion_libre` («Liquidación · Blusa beige, manga globo»).
--
-- PRODUCCIÓN. Una parte, idempotente; se pega DESPUÉS de 20261010205000 (token). La tabla aún no la usa ninguna pantalla publicada.
-- Sin políticas. Se pega ANTES de publicar la web, que ya manda `p_descripcion`.
--
-- VERIFICACIÓN (solo lectura):
--   select to_regprocedure('retail.crear_pieza_liquidacion(uuid,uuid,numeric,uuid,text)') is not null;   → t
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

alter table retail.piezas_liquidacion add column if not exists descripcion text;
do $c$
begin
  if not exists (select 1 from pg_constraint where conname = 'piezas_liquidacion_descripcion_corta') then
    alter table retail.piezas_liquidacion add constraint piezas_liquidacion_descripcion_corta
      check (descripcion is null or (length(btrim(descripcion)) between 1 and 60 and descripcion = btrim(descripcion)));
  end if;
end
$c$;

drop function if exists retail.crear_pieza_liquidacion(uuid, uuid, numeric, uuid);

create or replace function retail.crear_pieza_liquidacion(
  p_ubicacion_id uuid, p_categoria_id uuid, p_precio numeric, p_token uuid default null, p_descripcion text default null)
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
  v_desc text := nullif(regexp_replace(btrim(coalesce(p_descripcion, '')), '\s+', ' ', 'g'), '');
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
  if length(v_desc) > 60 then
    raise exception 'liquidacion_datos_invalidos' using hint = 'La descripción va en pocas palabras (hasta 60 letras)';
  end if;
  v_precio := fn_exigir_precio_liquidacion(p_precio);

  insert into piezas_liquidacion (ubicacion_id, categoria_id, precio, creada_por, terminal_id, token, descripcion)
    values (p_ubicacion_id, p_categoria_id, v_precio, v_persona, v_terminal, p_token, v_desc)
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
      'etiquetó una pieza de liquidación: ' || coalesce(v_desc, v_cat) || ' a ' || fn_actividad_soles(v_precio) || ' (' || v_codigo || ')',
      v_persona, v_terminal, p_ubicacion_id, null, 'piezas_liquidacion', v_id::text, now(),
      jsonb_build_object('codigo', v_codigo, 'precio', v_precio, 'categoria_id', p_categoria_id, 'descripcion', v_desc), 'vivo');
  exception when others then
    raise warning 'actividad: no se anotó la pieza de liquidación % (%)', v_id, sqlerrm;
  end;

  return fn_pieza_liquidacion_json(v_id);
end;
$$;
revoke all on function retail.crear_pieza_liquidacion(uuid, uuid, numeric, uuid, text) from public, anon;
grant execute on function retail.crear_pieza_liquidacion(uuid, uuid, numeric, uuid, text) to authenticated;

-- La pieza tal como la lee la web, ahora con su descripción.
create or replace function retail.fn_pieza_liquidacion_json(p_id uuid) returns jsonb
language sql stable security definer set search_path = retail, public, extensions as $$
  select jsonb_build_object(
    'id', p.id, 'estado', p.estado, 'precio', p.precio, 'ubicacion_id', p.ubicacion_id, 'ubicacion', u.nombre,
    'categoria_id', p.categoria_id, 'categoria', c.nombre, 'prefijo', c.prefijo, 'familia', c.familia, 'descripcion', p.descripcion,
    'codigo', (select e.codigo from piezas_liquidacion_etiquetas e where e.pieza_id = p.id and e.vigente),
    'etiquetas', (select count(*) from piezas_liquidacion_etiquetas e where e.pieza_id = p.id),
    'precio_inicial', (select e.precio from piezas_liquidacion_etiquetas e where e.pieza_id = p.id order by e.creado_en, e.codigo limit 1),
    'creado_en', p.creado_en, 'vendida_en', p.vendida_en, 'retirada_en', p.retirada_en, 'motivo_retiro', p.motivo_retiro,
    'venta_id', (select vi.venta_id from venta_items vi where vi.id = p.venta_item_id))
  from piezas_liquidacion p
  join categorias c on c.id = p.categoria_id
  join ubicaciones u on u.id = p.ubicacion_id
  where p.id = p_id
$$;
revoke all on function retail.fn_pieza_liquidacion_json(uuid) from public, anon, authenticated;

do $v$
begin
  if (select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'crear_pieza_liquidacion') <> 1 then
    raise exception 'crear_pieza_liquidacion: debe quedar una sola';
  end if;
end
$v$;
