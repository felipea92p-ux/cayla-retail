-- ============================================================================
-- 20261015135000_recomendaciones_web_erp.sql — CAYLA V2 · Tienda online (ADR-0408) · Recomendaciones · PARTE 2 de 2: el ERP
--
-- EL PROBLEMA PRIMERO. La PARTE 1 (20261015134000) deja que el cliente escriba sus recomendaciones desde la tienda online, siempre
-- con su nombre. Falta quién las lea: Felipe (2026-10-15) decidió que se leen en un módulo NUEVO del ERP, «Recomendaciones», que
-- nace solo para el líder (ADR-0161: el líder decide después a qué rol se lo da). Ahí se ve cada una con el nombre del cliente, su
-- ficha y sobre qué tienda es (o si es de CAYLA en general); se marca como leída, se responde con un texto corto que el cliente ve
-- en su cuenta y, cuando ya no hay nada que hacer, se archiva. Nada se borra.
--
-- ANALOGÍA CAYLA. El libro de sugerencias de la PARTE 1 llega a la oficina: alguien lo lee, le pone su visto («la leí»), escribe la
-- respuesta en el margen (que el cliente ve en su cuenta) y lo pasa al archivador. Cada visto y cada respuesta lleva la firma de
-- quien lo hizo.
--
-- QUÉ HACE
--   1. El módulo `recomendaciones` (Clientes ▸ Recomendaciones), después de Avisos del club. Nace SIN rol (sin `rol_modulos`):
--      solo lo ve el líder hasta que él lo da en Colaboradores ▸ Roles y accesos. Delegable: sus funciones piden el módulo, no al líder.
--   2. `fn_recomendaciones()`: la lista de la pantalla (las 1000 más nuevas, y si hay más), cada una con el NOMBRE del cliente y su
--      ficha (salvo que se haya anonimizado: entonces sin nombre ni ficha), sobre qué tienda es, y quién la leyó, la respondió o la
--      archivó y cuándo; las tiendas para el filtro; y si quien mira ve las fichas (para llevarlo a la del cliente).
--   3. `marcar_recomendacion_leida(id)`, `responder_recomendacion(id, respuesta)` y `archivar_recomendacion(id, archivar)`: las tres
--      escrituras. Cada una pide el módulo (`fn_exigir_modulo('recomendaciones')`, lo primero) y firma con el responsable del combo
--      (`fn_actor_persona_id(true)`, ADR-0162). Son idempotentes: dos toques, dos pestañas o dos personas a la vez dejan lo mismo
--      (responder dos veces lo mismo no hace nada; otra respuesta encima de una que ya está se rechaza: `recomendacion_ya_respondida`).
--      Cada una anota su línea en la Actividad, sin datos del cliente.
--
-- DECIDÍ: quien tiene el módulo ve las recomendaciones de TODAS las tiendas y las de CAYLA en general (como Órdenes de compra): son
--   pocas, una «general» no es de ninguna tienda, y el filtro por tienda está en la pantalla. Si Felipe prefiere que una encargada vea
--   solo las de su tienda, es una línea en `fn_recomendaciones` (pregunta en el informe).
-- DECIDÍ: el nombre del cliente sale de su ficha AL LEER (una sola fuente): si la ficha se corrige, la recomendación dice el nombre
--   nuevo; si se anonimiza, no dice ninguno. Quien tiene el módulo ve el nombre aunque no tenga «Clientes» (como Pedidos web: lo justo
--   para responderle), pero no la ficha: el enlace sale solo si su rol ve las fichas (`ve_fichas`).
-- DECIDÍ: la respuesta se escribe una vez y no se edita (lo que el cliente leyó no cambia por detrás); responder deja la recomendación
--   leída. Archivar también la deja leída, y se puede deshacer («Sacar del archivo»): por eso no pide confirmar (ADR-0350, ley 7).
-- DECIDÍ: la Actividad dice qué se hizo («respondió una recomendación de la tienda online») y la recomendación va en `registro_id`;
--   nunca el nombre ni el texto del cliente (ADR-0249: la actividad no guarda datos de clientes).
-- DESCARTÉ: un número en el menú con las sin leer (tocaría el armado del menú que comparten otras pantallas; queda para cuando Felipe lo
--   pida); responder por WhatsApp (los avisos del Club van por la cuenta, nunca por WhatsApp: ADR-0408 act. d).
--
-- SE ROMPE SI: se pega antes de la PARTE 1 (aborta: falta la tabla); o una función nueva del módulo lee la ficha sin
--   `fn_exigir_modulo('recomendaciones')` (lo vigila scripts/pruebas/clientas_por_modulo_y_anonimizar.mjs, lista DE_RECOMENDACIONES).
--
-- PRODUCCIÓN. NO está aplicada (actividad 13 de la tienda, con el OK de Felipe). Va DESPUÉS de 20261015134000. Una sola parte,
-- idempotente: el `insert` del módulo no pisa uno que ya exista, y las funciones son `create or replace`. Sin políticas, sin
-- disparadores y sin tocar tablas en uso. Ningún `select … into` dentro de un texto entre comillas.
--
-- VERIFICACIÓN (solo lectura, después de pegar):
--   select clave, grupo, orden, delegable from retail.modulos where clave = 'recomendaciones';   → recomendaciones|Clientes|78|t
--   select count(*) from retail.rol_modulos where modulo = 'recomendaciones';                     → 0 (nace solo para el líder)
--   select has_function_privilege('anon', 'retail.fn_recomendaciones()', 'execute');            → f
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

do $guarda$
begin
  if to_regclass('retail.recomendaciones_web') is null then
    raise exception 'Falta la PARTE 1: pega antes 20261015134000_recomendaciones_web_tienda.sql.';
  end if;
end
$guarda$;

-- ----------------------------------------------------------------------------
-- 1. El módulo (ADR-0161, CLAUDE.md «Módulos y roles»): sin `rol_modulos`, nace solo para el líder.
-- ----------------------------------------------------------------------------
insert into retail.modulos (clave, grupo, nombre, incluye, orden, solo_lider, delegable) values
  ('recomendaciones', 'Clientes', 'Recomendaciones',
   'Leer lo que los clientes recomiendan desde la tienda online, con su nombre y sobre qué tienda es, marcarlo como leído, responderles con un texto corto que ven en su cuenta y archivarlo',
   78, false, true)
on conflict (clave) do nothing;

-- ----------------------------------------------------------------------------
-- 2. Una línea en la Actividad (quién y cuándo, sin datos del cliente). Si anotar falla, lo guardado sigue en pie.
-- ----------------------------------------------------------------------------
create or replace function retail.fn_recomendacion_anotar(p_accion text, p_descripcion text, p_persona_id uuid, p_id uuid)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $fn$
begin
  begin
    perform retail.fn_actividad_anotar(
      'recomendaciones', p_accion, p_descripcion, p_persona_id, retail.fn_actividad_terminal_ahora(),
      retail.fn_actividad_sede_de(p_persona_id, 'vivo'), null, 'recomendaciones_web', p_id::text, now(), '{}'::jsonb, 'vivo');
  exception when others then
    raise warning 'actividad: no se anotó la recomendación (%)', sqlerrm;
  end;
end;
$fn$;
comment on function retail.fn_recomendacion_anotar(text, text, uuid, uuid) is
  'Recomendaciones (ADR-0408): anota en la Actividad lo que se hizo con una recomendación (registro_id = la recomendación), sin datos del cliente. Interna.';
revoke all on function retail.fn_recomendacion_anotar(text, text, uuid, uuid) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. La lista de la pantalla
-- ----------------------------------------------------------------------------
create or replace function retail.fn_recomendaciones()
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $fn$
declare
  c_maximo constant integer := 1000;
begin
  perform retail.fn_exigir_modulo('recomendaciones');
  return jsonb_build_object(
    've_fichas', coalesce(retail.fn_ve_modulo('clientas'), false),
    -- Las tiendas abiertas, y las que tienen alguna recomendación aunque ya no abran (para filtrar lo que ya llegó).
    'tiendas', coalesce((
      select jsonb_agg(jsonb_build_object('id', u.id, 'nombre', u.nombre) order by u.nombre, u.id)
        from retail.ubicaciones u
       where (u.tipo = 'tienda' and u.activo)
          or exists (select 1 from retail.recomendaciones_web r where r.ubicacion_id = u.id)), '[]'::jsonb),
    'recomendaciones', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', x.id,
               'texto', x.texto,
               'creada_en', x.creada_en,
               'tienda', case when x.ubicacion_id is null then null else jsonb_build_object('id', x.ubicacion_id, 'nombre', u.nombre) end,
               -- Siempre con su nombre (Felipe 2026-10-15), salvo que su ficha se haya anonimizado: entonces ni nombre ni ficha.
               'cliente', case when x.sin_nombre_en is not null or c.anonimizada then null
                               else jsonb_build_object('ficha_id', c.id, 'nombre', c.nombre) end,
               'leida_en', x.leida_en,
               'leida_por', nullif(btrim(coalesce(pl.nombres, '') || ' ' || coalesce(pl.apellidos, '')), ''),
               'respuesta', x.respuesta,
               'respondida_en', x.respondida_en,
               'respondida_por', nullif(btrim(coalesce(pr.nombres, '') || ' ' || coalesce(pr.apellidos, '')), ''),
               'archivada_en', x.archivada_en,
               'archivada_por', nullif(btrim(coalesce(pa.nombres, '') || ' ' || coalesce(pa.apellidos, '')), ''))
             order by x.creada_en desc, x.id)
        from (select r.* from retail.recomendaciones_web r order by r.creada_en desc, r.id limit c_maximo) x
        join retail.clientas c on c.id = x.clienta_id
        left join retail.ubicaciones u on u.id = x.ubicacion_id
        left join public.personas pl on pl.id = x.leida_por
        left join public.personas pr on pr.id = x.respondida_por
        left join public.personas pa on pa.id = x.archivada_por), '[]'::jsonb),
    'hay_mas', (select count(*) > c_maximo from retail.recomendaciones_web)
  );
end;
$fn$;
comment on function retail.fn_recomendaciones() is
  'Clientes ▸ Recomendaciones (ADR-0408, Felipe 2026-10-15): {ve_fichas, tiendas: [{id, nombre}], recomendaciones: [{id, texto, creada_en, tienda: {id, nombre} | null (CAYLA en general), cliente: {ficha_id, nombre} | null (ficha anonimizada), leida_en, leida_por, respuesta, respondida_en, respondida_por, archivada_en, archivada_por}], hay_mas}: las 1000 más nuevas de todas las tiendas. Pide el módulo «recomendaciones».';
revoke all on function retail.fn_recomendaciones() from public, anon;
grant execute on function retail.fn_recomendaciones() to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Marcar como leída
-- ----------------------------------------------------------------------------
create or replace function retail.marcar_recomendacion_leida(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_actor uuid;
  v_hay boolean := false;
  v_leida timestamptz;
begin
  perform retail.fn_exigir_modulo('recomendaciones');
  v_actor := retail.fn_actor_persona_id(true);
  -- Sin filas, un `for … in` deja sus variables en NULL: «la hay» se marca adentro.
  for v_leida in select r.leida_en from retail.recomendaciones_web r where r.id = p_id for update loop
    v_hay := true;
    exit;
  end loop;
  if not v_hay then
    raise exception 'Esa recomendación ya no está: recarga la pantalla.' using errcode = 'P0001', hint = 'recomendacion_no_existe';
  end if;
  if v_leida is not null then
    return jsonb_build_object('estado', 'ya_estaba');
  end if;
  update retail.recomendaciones_web set leida_en = now(), leida_por = v_actor where id = p_id;
  perform retail.fn_recomendacion_anotar('leer', 'marcó como leída una recomendación de la tienda online', v_actor, p_id);
  return jsonb_build_object('estado', 'leida');
end;
$fn$;
comment on function retail.marcar_recomendacion_leida(uuid) is
  'Clientes ▸ Recomendaciones (ADR-0408): la marca como leída, firmada con el responsable del combo. Idempotente: {estado: leida | ya_estaba}. Pide el módulo «recomendaciones».';
revoke all on function retail.marcar_recomendacion_leida(uuid) from public, anon;
grant execute on function retail.marcar_recomendacion_leida(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 5. Responder (el cliente lo ve en su cuenta)
-- ----------------------------------------------------------------------------
create or replace function retail.responder_recomendacion(p_id uuid, p_respuesta text)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $fn$
declare
  c_maximo constant integer := 400;
  v_actor uuid;
  v_texto text;
  v_hay boolean := false;
  v_respuesta text;
  v_sin_nombre timestamptz;
begin
  perform retail.fn_exigir_modulo('recomendaciones');
  v_actor := retail.fn_actor_persona_id(true);
  v_texto := retail.fn_recomendacion_texto(p_respuesta);
  if v_texto is null or char_length(v_texto) < 2 then
    raise exception 'Escribe la respuesta antes de enviarla.' using errcode = 'P0001', hint = 'recomendacion_respuesta_vacia';
  end if;
  if char_length(v_texto) > c_maximo then
    raise exception 'La respuesta va en % letras como mucho: acórtala un poco.', c_maximo
      using errcode = 'P0001', hint = 'recomendacion_respuesta_larga';
  end if;
  for v_respuesta, v_sin_nombre in
    select r.respuesta, r.sin_nombre_en from retail.recomendaciones_web r where r.id = p_id for update
  loop
    v_hay := true;
    exit;
  end loop;
  if not v_hay then
    raise exception 'Esa recomendación ya no está: recarga la pantalla.' using errcode = 'P0001', hint = 'recomendacion_no_existe';
  end if;
  if v_sin_nombre is not null then
    raise exception 'Esta recomendación ya no tiene a quién responder: la ficha de quien la escribió se anonimizó.'
      using errcode = 'P0001', hint = 'recomendacion_sin_nombre';
  end if;
  if v_respuesta is not null then
    -- La misma respuesta otra vez (dos toques, dos pestañas): ya está. Otra distinta no pisa la que el cliente ya pudo leer.
    if v_respuesta = v_texto then
      return jsonb_build_object('estado', 'ya_estaba');
    end if;
    raise exception 'Esta recomendación ya tiene respuesta: recarga la pantalla para verla.'
      using errcode = 'P0001', hint = 'recomendacion_ya_respondida';
  end if;
  update retail.recomendaciones_web set
    respuesta = v_texto,
    respondida_en = now(),
    respondida_por = v_actor,
    leida_en = coalesce(leida_en, now()),
    leida_por = case when leida_en is null then v_actor else leida_por end
   where id = p_id;
  perform retail.fn_recomendacion_anotar('responder', 'respondió una recomendación de la tienda online', v_actor, p_id);
  return jsonb_build_object('estado', 'respondida');
end;
$fn$;
comment on function retail.responder_recomendacion(uuid, text) is
  'Clientes ▸ Recomendaciones (ADR-0408): la responde (de 2 a 400 letras, ya limpias) y la deja leída, firmada con el responsable del combo; el cliente lo ve en su cuenta. Una sola vez: la misma respuesta otra vez es {estado: ya_estaba}; otra distinta, P0001 recomendacion_ya_respondida. No se responde una que quedó sin nombre (recomendacion_sin_nombre). Pide el módulo «recomendaciones».';
revoke all on function retail.responder_recomendacion(uuid, text) from public, anon;
grant execute on function retail.responder_recomendacion(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 6. Archivar y sacar del archivo (nada se borra)
-- ----------------------------------------------------------------------------
create or replace function retail.archivar_recomendacion(p_id uuid, p_archivar boolean)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_actor uuid;
  v_hay boolean := false;
  v_archivada timestamptz;
begin
  perform retail.fn_exigir_modulo('recomendaciones');
  v_actor := retail.fn_actor_persona_id(true);
  if p_archivar is null then
    raise exception 'Falta decir si se archiva o se saca del archivo.' using errcode = 'P0001', hint = 'recomendacion_datos_invalidos';
  end if;
  for v_archivada in select r.archivada_en from retail.recomendaciones_web r where r.id = p_id for update loop
    v_hay := true;
    exit;
  end loop;
  if not v_hay then
    raise exception 'Esa recomendación ya no está: recarga la pantalla.' using errcode = 'P0001', hint = 'recomendacion_no_existe';
  end if;
  -- Lo mismo dos veces deja lo mismo: nunca «alterna».
  if p_archivar = (v_archivada is not null) then
    return jsonb_build_object('estado', 'ya_estaba');
  end if;
  if p_archivar then
    update retail.recomendaciones_web set
      archivada_en = now(),
      archivada_por = v_actor,
      leida_en = coalesce(leida_en, now()),
      leida_por = case when leida_en is null then v_actor else leida_por end
     where id = p_id;
    perform retail.fn_recomendacion_anotar('archivar', 'archivó una recomendación de la tienda online', v_actor, p_id);
    return jsonb_build_object('estado', 'archivada');
  end if;
  update retail.recomendaciones_web set archivada_en = null, archivada_por = null where id = p_id;
  perform retail.fn_recomendacion_anotar('sacar_del_archivo', 'sacó del archivo una recomendación de la tienda online', v_actor, p_id);
  return jsonb_build_object('estado', 'en_bandeja');
end;
$fn$;
comment on function retail.archivar_recomendacion(uuid, boolean) is
  'Clientes ▸ Recomendaciones (ADR-0408): la archiva (p_archivar = true; también la deja leída) o la saca del archivo, firmada con el responsable del combo. Nada se borra. Idempotente: {estado: archivada | en_bandeja | ya_estaba}. Pide el módulo «recomendaciones».';
revoke all on function retail.archivar_recomendacion(uuid, boolean) from public, anon;
grant execute on function retail.archivar_recomendacion(uuid, boolean) to authenticated;

reset lock_timeout;
notify pgrst, 'reload schema';
