-- ============================================================================
-- 20261017044000_tienda_looks_guardados.sql — CAYLA V2 · Tienda online · «Arma el tuyo» (ADR-0434, actividad 8)
--
-- EL PROBLEMA PRIMERO. El cliente arma un look en el probador (`/looks/arma`) y quiere volver a él otro día, cuando le paguen o cuando
-- llegue su talla, sin armarlo de nuevo. Hoy el look vive solo en la dirección de la página: si la cierra sin copiarla, lo pierde.
--
-- ANALOGÍA CAYLA. Es el cliente que en la tienda le pide a la vendedora «sepárame este conjunto en la cabeza, que vuelvo el sábado»:
-- no se aparta stock (eso es «Separar»), solo se recuerda qué prendas y en qué colores.
--
-- QUÉ HACE.
--   · `retail.looks_web`: un look que una cuenta web guardó, con su nombre. Quitar marca `quitado_en` (no se borra), como los
--     favoritos (20261015024000).
--   · `retail.look_web_piezas`: sus prendas, de 2 a 4 (lo que cabe en un look: arriba, abajo, encima y bolso), cada una un modelo en un
--     color y su lugar. No guarda tallas ni precios: el precio y lo que hay se leen al día cada vez que se abre.
--   · `tienda_guardar_look`, `tienda_quitar_look`, `tienda_renombrar_look` y `tienda_mis_looks`, solo de `tienda_web`.
--   · Cerrar o eliminar la cuenta (`fn_cuentas_web_cerrar_al_anonimizar`, por donde pasan los dos) también quita sus looks vivos, igual
--     que sus favoritos y sus esperas (ADR-0434). Es un reemplazo anclado: agrega una línea después de la de las esperas.
--
-- DECIDÍ: el mismo look (las mismas prendas en los mismos colores, en cualquier orden) se guarda una sola vez por cuenta: su `huella`.
--   Volver a guardarlo responde `guardado` con el mismo look, sin escribir (el corazón tocado dos veces no duplica). Un índice único
--   parcial lo hace imposible aunque dos pestañas guarden a la vez.
-- DECIDÍ: el nombre, si el cliente no da uno, sale del día de Lima en que lo guardó («Look de sábado», como el lienzo, «Look de
--   domingo»); se cambia con `tienda_renombrar_look` (1 a 40 letras).
-- DECIDÍ: tope de 30 looks vivos por cuenta (ADR-0434), contra el abuso de una cuenta robada o un programa, como los 100 favoritos.
-- DECIDÍ: solo se guarda lo que se ve en la web: cada modelo publicado y vendible (`fn_tienda_modelo_se_ve`, la regla de los
--   favoritos) y en un color que tiene activo. Al leer, una prenda que dejó de verse vuelve marcada (`se_ve`): la tienda dice que ya
--   no está; la fila no se toca (si vuelve a la web, vuelve al look).
-- DECIDÍ: como los favoritos, con la ficha archivada la cuenta ya no GUARDA looks (`cuenta_inactiva`), pero sí los quita.
-- DESCARTÉ: guardarlo en el navegador (se pierde al cambiar de celular, y la actividad 9 lo comparte por enlace); guardar las tallas
--   (envejecen apenas alguien compra la última; se eligen al llevarlo a la bolsa).
--
-- SE ROMPE SI: alguien reescribe `fn_cuentas_web_cerrar_al_anonimizar` sin la línea de los looks (quedarían vivos looks de una
--   cuenta cerrada, aunque nadie pueda abrirlos): `pnpm pruebas:tienda-looks-guardados` lo vigila.
--
-- PRODUCCIÓN. APLICADA el 2026-10-17 con el OK de Felipe, antes de fusionar su PR (ADR-0434, PR 3), con las seis huellas esperadas.
-- Tablas nuevas, funciones y permisos, sin políticas: se pega entera y se puede volver a correr. El reemplazo anclado se detiene sin
-- tocar nada si su ancla no aparece exactamente una vez (en producción, antes de pegarla: md5 7d44e90da23e4d089eca65ec1603c5b5).
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- Lo que da por hecho (si falta, no se pega nada).
do $$
begin
  if to_regclass('retail.cuentas_web') is null or to_regclass('retail.favoritos_web') is null
     or to_regprocedure('retail.fn_tienda_modelo_se_ve(uuid)') is null then
    raise exception 'Faltan las cuentas web y los favoritos de la tienda: pega antes 20261015024000_tienda_favoritos_y_esperas.sql.';
  end if;
  if to_regprocedure('retail.fn_cuentas_web_cerrar_al_anonimizar()') is null then
    raise exception 'Falta el cierre de la cuenta web al anonimizar: pega antes 20261015055000_tienda_cuentas_entrada_y_cierre.sql.';
  end if;
end
$$;

-- ---------- 1. Las tablas ----------
create table if not exists retail.looks_web (
  id            uuid primary key default gen_random_uuid(),
  cuenta_web_id uuid not null references retail.cuentas_web (id),
  nombre        text not null,
  -- Las prendas en orden de modelo y color («modelo.COLOR~modelo.COLOR», uuid y color byte a byte): el mismo look en cualquier orden
  -- es la misma huella.
  huella        text not null,
  guardado_en   timestamptz not null default now(),
  quitado_en    timestamptz,
  constraint looks_web_nombre_valido check (nombre = btrim(nombre) and char_length(nombre) between 1 and 40),
  constraint looks_web_quitado_despues check (quitado_en is null or quitado_en >= guardado_en)
);
comment on table retail.looks_web is
  'Tienda online, «Arma el tuyo» (ADR-0434, actividad 8): los looks que una cuenta web guardó desde el probador, con su nombre. Uno vivo por cuenta y huella; quitar marca quitado_en (no se borra). Solo por las funciones tienda_*_look; RLS sin políticas.';
comment on column retail.looks_web.huella is 'Sus prendas en orden de modelo y color: el mismo look guardado dos veces es el mismo.';

create unique index if not exists looks_web_uno_vivo_por_huella on retail.looks_web (cuenta_web_id, huella) where quitado_en is null;
create index if not exists looks_web_de_la_cuenta on retail.looks_web (cuenta_web_id, guardado_en desc) where quitado_en is null;

create table if not exists retail.look_web_piezas (
  look_id      uuid not null references retail.looks_web (id) on delete cascade,
  posicion     smallint not null,
  -- Como los favoritos: solo se elimina un modelo sin historia (`eliminar_producto`), y su lugar en el look se va con él.
  producto_id  uuid not null references retail.productos (id) on delete cascade,
  color_codigo text not null references retail.colores (codigo),
  constraint look_web_piezas_pkey primary key (look_id, posicion),
  constraint look_web_piezas_posicion_valida check (posicion between 1 and 4),
  constraint look_web_piezas_un_modelo unique (look_id, producto_id)
);
comment on table retail.look_web_piezas is
  'Tienda online, «Arma el tuyo» (ADR-0434, actividad 8): las prendas de un look guardado (de 2 a 4), cada una un modelo en un color y su lugar. Sin tallas ni precios: se leen al día. RLS sin políticas.';
create index if not exists look_web_piezas_del_producto on retail.look_web_piezas (producto_id);

alter table retail.looks_web enable row level security;
alter table retail.look_web_piezas enable row level security;
revoke all on retail.looks_web from public, anon, authenticated;
revoke all on retail.look_web_piezas from public, anon, authenticated;

-- ---------- 2. Piezas internas ----------
-- El nombre como se guarda: sin espacios de más; null si no sirve (vacío o de más de 40 letras).
create or replace function retail.fn_look_web_nombre(p_nombre text)
returns text
language sql
immutable
set search_path = retail, public
as $$
  select case when x.n between 1 and 40 then l.limpio end
    from (select regexp_replace(btrim(coalesce(p_nombre, '')), '[[:space:]]+', ' ', 'g') as limpio) l
    cross join lateral (select char_length(l.limpio) as n) x
$$;
comment on function retail.fn_look_web_nombre(text) is
  'Tienda online (ADR-0434): el nombre de un look guardado sin espacios de más, o null si queda vacío o pasa de 40 letras. Interna.';
revoke all on function retail.fn_look_web_nombre(text) from public, anon, authenticated;

-- El nombre que se pone solo: el día de Lima de hoy («Look de sábado»).
create or replace function retail.fn_look_web_nombre_del_dia()
returns text
language sql
stable
set search_path = retail, public
as $$
  select 'Look de ' || (array['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'])[extract(isodow from retail.fn_hoy_lima())::integer]
$$;
comment on function retail.fn_look_web_nombre_del_dia() is
  'Tienda online (ADR-0434): el nombre por omisión de un look guardado, del día de Lima («Look de sábado»). Interna.';
revoke all on function retail.fn_look_web_nombre_del_dia() from public, anon, authenticated;

-- ---------- 3. Guardar ----------
-- p_piezas: [{producto_id, color}], de 2 a 4, sin repetir modelo (su lugar es su orden). {estado: guardado (id, nombre, nuevo) | tope |
-- no_disponible | cuenta_inactiva | sin_cuenta | invalido}. Guardar el mismo look otra vez responde `guardado` con el que ya estaba.
create or replace function retail.tienda_guardar_look(p_usuario_web_id uuid, p_piezas jsonb, p_nombre text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public
as $fn$
declare
  v_cuenta uuid;
  v_activa boolean;
  v_productos uuid[];
  v_colores text[];
  v_huella text;
  v_n integer;
  v_id uuid;
  v_nombre text;
begin
  if p_usuario_web_id is null or p_piezas is null or jsonb_typeof(p_piezas) <> 'array' then
    return jsonb_build_object('estado', 'invalido');
  end if;
  v_n := jsonb_array_length(p_piezas);
  if v_n < 2 or v_n > 4 then
    return jsonb_build_object('estado', 'invalido');
  end if;
  -- Las prendas, en su orden (el orden es su lugar en el look). Un id que no es uuid: no se guarda nada.
  begin
    v_productos := array(select (t.x ->> 'producto_id')::uuid from jsonb_array_elements(p_piezas) with ordinality as t (x, n) order by t.n);
    v_colores := array(select upper(btrim(t.x ->> 'color')) from jsonb_array_elements(p_piezas) with ordinality as t (x, n) order by t.n);
  exception when invalid_text_representation then
    return jsonb_build_object('estado', 'invalido');
  end;
  if array_position(v_productos, null) is not null or array_position(v_colores, null) is not null or '' = any (v_colores)
     or (select count(distinct x) from unnest(v_productos) as x) <> v_n then
    return jsonb_build_object('estado', 'invalido');
  end if;
  -- En el orden del uuid y del color byte a byte (`C`): la misma huella para el mismo look en cualquier base y con cualquier idioma.
  v_huella := (select string_agg(p.producto::text || '.' || p.color, '~' order by p.producto, p.color collate "C")
                 from unnest(v_productos, v_colores) as p (producto, color));

  -- La cuenta, tomada: dos pestañas o un doble clic se turnan (y el tope no se pasa).
  for v_cuenta, v_activa in
    select w.id, c.archivada_en is null
      from retail.cuentas_web w
      join retail.clientas c on c.id = w.clienta_id
     where w.usuario_web_id = p_usuario_web_id
       for update of w
  loop
    exit;
  end loop;
  if v_cuenta is null then
    return jsonb_build_object('estado', 'sin_cuenta');
  end if;

  for v_id, v_nombre in
    select l.id, l.nombre from retail.looks_web l where l.cuenta_web_id = v_cuenta and l.huella = v_huella and l.quitado_en is null
  loop
    return jsonb_build_object('estado', 'guardado', 'id', v_id, 'nombre', v_nombre, 'nuevo', false);
  end loop;
  if not v_activa then
    return jsonb_build_object('estado', 'cuenta_inactiva');
  end if;
  if exists (select 1 from unnest(v_productos, v_colores) as p (producto, color)
              where not retail.fn_tienda_modelo_se_ve(p.producto)
                 or not exists (select 1 from retail.variantes v where v.producto_id = p.producto and v.color_codigo = p.color and v.activo)) then
    return jsonb_build_object('estado', 'no_disponible');
  end if;
  if (select count(*) from retail.looks_web l where l.cuenta_web_id = v_cuenta and l.quitado_en is null) >= 30 then
    return jsonb_build_object('estado', 'tope', 'tope', 30);
  end if;

  v_nombre := coalesce(retail.fn_look_web_nombre(p_nombre), retail.fn_look_web_nombre_del_dia());
  insert into retail.looks_web (cuenta_web_id, nombre, huella) values (v_cuenta, v_nombre, v_huella) returning id into v_id;
  insert into retail.look_web_piezas (look_id, posicion, producto_id, color_codigo)
  select v_id, p.n::smallint, p.producto, p.color from unnest(v_productos, v_colores) with ordinality as p (producto, color, n);
  return jsonb_build_object('estado', 'guardado', 'id', v_id, 'nombre', v_nombre, 'nuevo', true);
end;
$fn$;
comment on function retail.tienda_guardar_look(uuid, jsonb, text) is
  'Tienda online, «Arma el tuyo» (ADR-0434, act. 8): guarda el look del probador en la cuenta (2 a 4 prendas, cada una modelo y color; nombre opcional, si no «Look de <día>»). {estado: guardado (id, nombre, nuevo) | tope | no_disponible | cuenta_inactiva | sin_cuenta | invalido}. El mismo look (la misma huella) se guarda una vez. Solo la llama tienda_web.';

-- ---------- 4. Quitar y renombrar ----------
-- {estado: quitado | sin_cuenta | invalido}. Quitar lo que no está (o no es suyo) responde `quitado` sin escribir.
create or replace function retail.tienda_quitar_look(p_usuario_web_id uuid, p_look_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public
as $fn$
declare
  v_cuenta uuid;
begin
  if p_usuario_web_id is null or p_look_id is null then
    return jsonb_build_object('estado', 'invalido');
  end if;
  v_cuenta := (select w.id from retail.cuentas_web w where w.usuario_web_id = p_usuario_web_id);
  if v_cuenta is null then
    return jsonb_build_object('estado', 'sin_cuenta');
  end if;
  update retail.looks_web set quitado_en = greatest(now(), guardado_en)
   where id = p_look_id and cuenta_web_id = v_cuenta and quitado_en is null;
  return jsonb_build_object('estado', 'quitado');
end;
$fn$;
comment on function retail.tienda_quitar_look(uuid, uuid) is
  'Tienda online (ADR-0434, act. 8): quita un look guardado de esa cuenta (marca quitado_en; no se borra). {estado: quitado | sin_cuenta | invalido}. Idempotente. Solo la llama tienda_web.';

-- {estado: renombrado (nombre) | no_esta | sin_cuenta | invalido}.
create or replace function retail.tienda_renombrar_look(p_usuario_web_id uuid, p_look_id uuid, p_nombre text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public
as $fn$
declare
  v_cuenta uuid;
  v_nombre text := retail.fn_look_web_nombre(p_nombre);
  v_id uuid;
begin
  if p_usuario_web_id is null or p_look_id is null or v_nombre is null then
    return jsonb_build_object('estado', 'invalido');
  end if;
  v_cuenta := (select w.id from retail.cuentas_web w where w.usuario_web_id = p_usuario_web_id);
  if v_cuenta is null then
    return jsonb_build_object('estado', 'sin_cuenta');
  end if;
  update retail.looks_web set nombre = v_nombre
   where id = p_look_id and cuenta_web_id = v_cuenta and quitado_en is null
  returning id into v_id;
  if v_id is null then
    return jsonb_build_object('estado', 'no_esta');
  end if;
  return jsonb_build_object('estado', 'renombrado', 'nombre', v_nombre);
end;
$fn$;
comment on function retail.tienda_renombrar_look(uuid, uuid, text) is
  'Tienda online (ADR-0434, act. 8): cambia el nombre de un look guardado de esa cuenta (1 a 40 letras, sin espacios de más). {estado: renombrado (nombre) | no_esta | sin_cuenta | invalido}. Solo la llama tienda_web.';

-- ---------- 5. Leer ----------
-- {looks: [{id, nombre, guardado_en, huella, piezas: [{posicion, producto_id, color, se_ve}]}]} (lo más nuevo primero), o null sin
-- cuenta. `se_ve`: el modelo sigue publicado y vendible.
create or replace function retail.tienda_mis_looks(p_usuario_web_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = retail, public
as $$
  select jsonb_build_object('looks', coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', l.id,
             'nombre', l.nombre,
             'guardado_en', l.guardado_en,
             'huella', l.huella,
             'piezas', (select coalesce(jsonb_agg(jsonb_build_object(
                                 'posicion', p.posicion, 'producto_id', p.producto_id, 'color', p.color_codigo,
                                 'se_ve', retail.fn_tienda_modelo_se_ve(p.producto_id)) order by p.posicion), '[]'::jsonb)
                          from retail.look_web_piezas p where p.look_id = l.id))
           order by l.guardado_en desc, l.id)
      from retail.looks_web l
     where l.cuenta_web_id = w.id and l.quitado_en is null), '[]'::jsonb))
  from retail.cuentas_web w
  where w.usuario_web_id = p_usuario_web_id;
$$;
comment on function retail.tienda_mis_looks(uuid) is
  'Tienda online (ADR-0434, act. 8): los looks guardados vivos de esa cuenta, lo más nuevo primero, cada uno con sus prendas (modelo, color y si sigue en la web). {looks: [...]}, o null sin cuenta. Solo la llama tienda_web.';

-- ---------- 6. Cerrar o eliminar la cuenta también quita sus looks ----------
create or replace function pg_temp.reemplazar_anclado(p_firma text, p_viejos text[], p_nuevos text[])
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
  v_cambio boolean := false;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  for i in 1 .. cardinality(p_viejos) loop
    -- Ya aplicado: el texto nuevo está. Se mira primero porque, una vez aplicado, el ancla vieja ya no aparece y el conteo abortaría.
    continue when position(p_nuevos[i] in v_def) > 0;
    v_n := (length(v_def) - length(replace(v_def, p_viejos[i], ''))) / length(p_viejos[i]);
    if v_n <> 1 then
      raise exception '% cambió desde que se escribió esta migración: el ancla % aparece % veces (se esperaba 1). Regenera el reemplazo desde su definición real.',
        p_firma, i, v_n;
    end if;
    v_def := replace(v_def, p_viejos[i], p_nuevos[i]);
    v_cambio := true;
  end loop;
  if v_cambio then
    execute v_def;
  end if;
end;
$f$;

select pg_temp.reemplazar_anclado(
  'retail.fn_cuentas_web_cerrar_al_anonimizar()',
  array[E'    update retail.esperas_web e set quitada_en = greatest(v_ahora, e.creada_en)\n     where e.cuenta_web_id = v_cuenta and e.quitada_en is null;\n'],
  array[E'    update retail.esperas_web e set quitada_en = greatest(v_ahora, e.creada_en)\n     where e.cuenta_web_id = v_cuenta and e.quitada_en is null;\n'
        || E'    -- Y sus looks guardados del probador («Arma el tuyo», ADR-0434), igual que sus favoritos.\n'
        || E'    update retail.looks_web l set quitado_en = greatest(v_ahora, l.guardado_en)\n     where l.cuenta_web_id = v_cuenta and l.quitado_en is null;\n']
);

comment on function retail.fn_cuentas_web_cerrar_al_anonimizar() is
  'Disparador de clientas (ADR-0408, Felipe 2026-10-14; ADR-0434): cuando una ficha se anonimiza, cierra su cuenta web en la misma escritura: sin correo ni usuario (pasa a usuario_cerrado_id para borrarlo en el proyecto de clientes) y con sus favoritos, sus esperas y sus looks guardados vivos quitados. Nada se borra.';

-- ---------- 7. La puerta: solo tienda_web ----------
revoke all on function retail.tienda_guardar_look(uuid, jsonb, text) from public, anon, authenticated;
revoke all on function retail.tienda_quitar_look(uuid, uuid) from public, anon, authenticated;
revoke all on function retail.tienda_renombrar_look(uuid, uuid, text) from public, anon, authenticated;
revoke all on function retail.tienda_mis_looks(uuid) from public, anon, authenticated;
grant execute on function retail.tienda_guardar_look(uuid, jsonb, text) to tienda_web;
grant execute on function retail.tienda_quitar_look(uuid, uuid) to tienda_web;
grant execute on function retail.tienda_renombrar_look(uuid, uuid, text) to tienda_web;
grant execute on function retail.tienda_mis_looks(uuid) to tienda_web;

-- Validación final: si algo no quedó, se deshace todo.
do $$
begin
  if position('update retail.looks_web l set quitado_en' in pg_get_functiondef('retail.fn_cuentas_web_cerrar_al_anonimizar()'::regprocedure)) = 0 then
    raise exception 'tienda looks guardados: el cierre de la cuenta no quita los looks';
  end if;
  if has_function_privilege('anon', 'retail.tienda_guardar_look(uuid, jsonb, text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'retail.tienda_mis_looks(uuid)', 'EXECUTE')
     or not has_function_privilege('tienda_web', 'retail.tienda_guardar_look(uuid, jsonb, text)', 'EXECUTE')
     or not has_function_privilege('tienda_web', 'retail.tienda_quitar_look(uuid, uuid)', 'EXECUTE')
     or not has_function_privilege('tienda_web', 'retail.tienda_renombrar_look(uuid, uuid, text)', 'EXECUTE')
     or not has_function_privilege('tienda_web', 'retail.tienda_mis_looks(uuid)', 'EXECUTE') then
    raise exception 'tienda looks guardados: las funciones tienen que ser solo de tienda_web';
  end if;
  if has_table_privilege('tienda_web', 'retail.looks_web', 'SELECT') or has_table_privilege('tienda_web', 'retail.look_web_piezas', 'SELECT') then
    raise exception 'tienda looks guardados: las tablas no se leen directo';
  end if;
end;
$$;

reset lock_timeout;
