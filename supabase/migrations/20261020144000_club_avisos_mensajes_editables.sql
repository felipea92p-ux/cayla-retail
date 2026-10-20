-- ============================================================================
-- 20261020144000_club_avisos_mensajes_editables.sql — CAYLA V2 · Club · Avisos: los mensajes se editan desde la pantalla y llevan un cierre común
-- Sigue a `20261019222000_club_puntos_textos_y_avisos.sql` (que dejó los textos `aviso_*` vigentes y la regla de la BAJA).
--
-- EL PROBLEMA. Los mensajes de Clientes ▸ Avisos (cumpleaños, puntos por vencer, novedades, rebajas) solo se cambiaban con una
-- migración. Felipe (2026-10-20) pidió poder cambiarlos desde la pantalla, que sean más llamativos y que TODOS terminen invitando a la
-- tienda web («Recuerda que también puedes visitar tienda.cayla.pe…»), porque ahí el cliente ve sus puntos, sus avisos y lo nuevo.
--
-- QUÉ HACE
--   1. Un tipo nuevo de texto, `aviso_cierre`: la línea que va al final de todos los avisos, antes de la BAJA.
--   2. `fn_club_aviso_componer(cuerpo, cierre)`: arma el texto que se guarda = cuerpo + cierre + «Si no quieres recibir más mensajes,
--      responde BAJA.». La BAJA la pone siempre la base (Ley 29733; la regla `club_textos_aviso_con_baja` ya la exige al final).
--   3. `fn_club_aviso_problema(tipo, cuerpo)`: por qué un mensaje no se puede guardar (sin {nombre}, un dato que ese aviso no sabe
--      completar, la BAJA escrita a mano, demasiado largo). La web repite la misma regla (`lib/club-avisos-mensajes.ts`) para avisar
--      antes de guardar; manda la de aquí.
--   4. `fn_club_avisos_textos()` (lectura): los mensajes vigentes y el cierre, para la hoja «Editar mensajes». Con el módulo «Avisos del club».
--   5. `guardar_mensajes_avisos(mensajes, cierre)`: guarda una versión nueva SOLO de lo que cambió. Solo el líder (`fn_es_lider()`): lo
--      que se cambia aquí lo reciben los miembros de las 3 tiendas. Firma con el responsable del combo y queda en configuracion_historial.
--   6. Publica los mensajes nuevos que Felipe aprobó en la maqueta (`docs/maquetas/avisos-club-2026-10/`), con su cierre, UNA sola vez:
--      si ya existe un cierre (alguien ya editó desde la pantalla), volver a pegar esta migración no pisa nada.
--
-- DECIDÍ: el texto guardado en `club_textos` sigue siendo el mensaje COMPLETO (cuerpo + cierre + BAJA). Así `fn_club_avisos_pendientes`,
--   `registrar_aviso_enviado` y la regla de la BAJA no cambian ni una línea. El cierre vive además aparte (`aviso_cierre`) para que la
--   hoja lo muestre como un solo campo; cambiarlo guarda una versión nueva de los cuatro avisos.
-- DECIDÍ: solo el líder. Quien ve el módulo manda los avisos de SU tienda; cambiar lo que dicen cambia lo que reciben en las 3 tiendas.
-- DESCARTÉ: guardar solo el cuerpo y armar el texto al leer: obligaba a reescribir `fn_club_avisos_pendientes` (que vive en producción)
--   y la regla de la BAJA, para el mismo resultado.
-- SE ROMPE SI: alguien agrega un dato nuevo a un aviso en `fn_club_avisos_pendientes` sin sumarlo a `fn_club_aviso_problema` (no se
--   podría guardar un mensaje que lo use) — y al revés, sumarlo aquí sin completarlo allá deja el «{dato}» en el mensaje (la pantalla lo
--   frena: `problemaParaEnviar`).
--
-- CÓMO SE PEGA: SOLO en el SQL Editor de producción, de una vez. Idempotente. `lock_timeout` 3 s. Sin políticas ni `drop trigger`.
-- CAÍDA EXTERNA. Nada llama a la red.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 1. El tipo nuevo: el cierre común ----------
alter table retail.club_textos drop constraint if exists club_textos_tipo_valido;
alter table retail.club_textos add constraint club_textos_tipo_valido check (tipo = any (array[
  'club', 'mensaje_personal', 'mensaje_generico', 'pagina_publicidad', 'terminos', 'privacidad', 'casilla_publicidad', 'saludo',
  'aviso_cumpleanos', 'aviso_aniversario', 'aviso_novedades', 'aviso_rebaja', 'aviso_puntos', 'aviso_cierre']));

-- ---------- 2. Armar el mensaje completo ----------
create or replace function retail.fn_club_aviso_componer(p_cuerpo text, p_cierre text)
returns text
language sql
immutable
set search_path = retail, public, extensions
as $$
  select btrim(p_cuerpo, E' \t\r\n') || E'\n\n'
         || case when btrim(coalesce(p_cierre, ''), E' \t\r\n') = '' then '' else btrim(p_cierre, E' \t\r\n') || E'\n\n' end
         || 'Si no quieres recibir más mensajes, responde BAJA.';
$$;
comment on function retail.fn_club_aviso_componer(text, text) is
  'El texto completo de un aviso del club: el cuerpo, el cierre común (si hay) y al final, siempre, la línea de la BAJA (Ley 29733). Lo mismo arma la web en lib/club-avisos-mensajes.ts (componerMensaje).';

-- ---------- 3. Por qué un mensaje no se puede guardar ----------
create or replace function retail.fn_club_aviso_problema(p_tipo text, p_cuerpo text)
returns text
language plpgsql
immutable
set search_path = retail, public, extensions
as $$
declare
  v_permitidos text[];
  v_cuerpo text := btrim(coalesce(p_cuerpo, ''), E' \t\r\n');
  m text[];
begin
  -- Los datos que `fn_club_avisos_pendientes` completa en cada aviso. Uno que no completa quedaría escrito tal cual: «{codigo}».
  v_permitidos := case p_tipo
    when 'cumpleanos' then array['{nombre}', '{regalo}', '{tienda}']
    when 'puntos'     then array['{nombre}', '{puntos}', '{valor}', '{fecha}', '{tienda}']
    when 'novedades'  then array['{nombre}', '{tienda}']
    when 'rebaja'     then array['{nombre}', '{prenda}', '{pct}', '{tienda}']
  end;
  if v_permitidos is null then
    return 'Ese aviso no existe.';
  end if;
  if v_cuerpo = '' then
    return 'El mensaje está vacío.';
  end if;
  if char_length(v_cuerpo) > 700 then
    return 'El mensaje es muy largo: máximo 700 letras.';
  end if;
  if position('{nombre}' in v_cuerpo) = 0 then
    return 'Falta {nombre}: el mensaje saluda a cada persona por su nombre.';
  end if;
  for m in select regexp_matches(v_cuerpo, '\{[a-z_]+\}', 'g') loop
    if not (m[1] = any (v_permitidos)) then
      return 'Este aviso no sabe completar ' || m[1] || '.';
    end if;
  end loop;
  if v_cuerpo ~* 'responde\s+baja' then
    return 'La línea de la BAJA va sola al final: no la escribas en el mensaje.';
  end if;
  return null;
end;
$$;
comment on function retail.fn_club_aviso_problema(text, text) is
  'Por qué el cuerpo de un aviso del club no se puede guardar, o null: vacío, más de 700 letras, sin {nombre}, un dato que ese aviso no completa (fn_club_avisos_pendientes) o la BAJA escrita a mano. La web repite la regla en lib/club-avisos-mensajes.ts (problemaDelMensaje).';

-- ---------- 4. Lectura para la hoja «Editar mensajes» ----------
create or replace function retail.fn_club_avisos_textos()
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
begin
  if not retail.fn_ve_modulo('avisos_club') then
    raise exception 'No tienes permiso para ver los avisos del club.' using errcode = '42501', hint = 'sin_permiso';
  end if;
  return jsonb_build_object(
    'puede_editar', retail.fn_es_lider(),
    'cierre', (select t.texto from retail.club_textos t where t.tipo = 'aviso_cierre' order by t.version desc limit 1),
    'mensajes', coalesce((
      select jsonb_agg(jsonb_build_object('tipo', substr(v.tipo, 7), 'texto', v.texto, 'version', v.version, 'vigente_desde', v.vigente_desde)
                       order by v.tipo)
        from (select distinct on (t.tipo) t.tipo, t.texto, t.version, t.vigente_desde
                from retail.club_textos t
               where t.tipo in ('aviso_cumpleanos', 'aviso_puntos', 'aviso_novedades', 'aviso_rebaja')
               order by t.tipo, t.version desc) v), '[]'::jsonb));
end;
$$;
comment on function retail.fn_club_avisos_textos() is
  'Clientes ▸ Avisos, hoja «Editar mensajes»: el texto vigente de cada aviso (cumpleanos, puntos, novedades, rebaja; completo, con cierre y BAJA), el cierre común y si quien pregunta puede editarlos (líder). Con el módulo «Avisos del club». Lectura (prefijo fn_).';
revoke all on function retail.fn_club_avisos_textos() from public, anon;
grant execute on function retail.fn_club_avisos_textos() to authenticated;

-- ---------- 5. Guardar ----------
create or replace function retail.guardar_mensajes_avisos(p_mensajes jsonb, p_cierre text)
returns integer
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_persona uuid;
  v_cierre text := btrim(coalesce(p_cierre, ''), E' \t\r\n');
  v_cierre_viejo text;
  v_tipo text;
  v_cuerpo text;
  v_problema text;
  v_texto text;
  v_viejo text;
  v_cambiados text[] := array[]::text[];
begin
  if not retail.fn_ve_modulo('avisos_club') then
    raise exception 'Los mensajes de los avisos los cambia quien tiene el módulo «Avisos del club».' using errcode = '42501', hint = 'sin_permiso';
  end if;
  -- Lo que se cambia aquí lo reciben los miembros de las 3 tiendas: solo el líder.
  if not retail.fn_es_lider() then
    raise exception 'Los mensajes de los avisos los cambia el líder: llegan a los miembros de las 3 tiendas.' using errcode = '42501', hint = 'avisos_solo_lider';
  end if;
  v_persona := retail.fn_actor_persona_id(true);

  if jsonb_typeof(p_mensajes) is distinct from 'object' then
    raise exception 'Faltan los mensajes.' using errcode = '22023', hint = 'mensaje_aviso_invalido';
  end if;
  if char_length(v_cierre) > 300 then
    raise exception 'El cierre es muy largo: máximo 300 letras.' using errcode = '22023', hint = 'mensaje_aviso_invalido', detail = 'cierre';
  end if;
  if v_cierre ~ '\{[a-z_]+\}' then
    raise exception 'El cierre va igual para todos: no lleva datos entre llaves.' using errcode = '22023', hint = 'mensaje_aviso_invalido', detail = 'cierre';
  end if;
  if v_cierre ~* 'responde\s+baja' then
    raise exception 'La línea de la BAJA va sola al final: no la escribas en el cierre.' using errcode = '22023', hint = 'mensaje_aviso_invalido', detail = 'cierre';
  end if;

  -- Dos líderes guardando a la vez no chocan con la misma versión: uno espera al otro.
  perform pg_advisory_xact_lock(hashtext('retail.club_textos.avisos'));

  v_cierre_viejo := (select t.texto from retail.club_textos t where t.tipo = 'aviso_cierre' order by t.version desc limit 1);
  if v_cierre is distinct from coalesce(v_cierre_viejo, '') then
    -- Un cierre vacío también es una versión (la tabla no acepta texto vacío: se guarda un guion que la web lee como «sin cierre»).
    insert into retail.club_textos (tipo, version, texto, creado_por)
    select 'aviso_cierre', coalesce(max(t.version), 0) + 1, coalesce(nullif(v_cierre, ''), '-'), v_persona
      from retail.club_textos t where t.tipo = 'aviso_cierre';
    v_cambiados := array_append(v_cambiados, 'cierre');
  end if;

  foreach v_tipo in array array['cumpleanos', 'puntos', 'novedades', 'rebaja'] loop
    v_cuerpo := p_mensajes ->> v_tipo;
    if v_cuerpo is null then
      raise exception 'Falta el mensaje de %.', v_tipo using errcode = '22023', hint = 'mensaje_aviso_invalido', detail = v_tipo;
    end if;
    v_problema := retail.fn_club_aviso_problema(v_tipo, v_cuerpo);
    if v_problema is not null then
      raise exception '%', v_problema using errcode = '22023', hint = 'mensaje_aviso_invalido', detail = v_tipo;
    end if;
    v_texto := retail.fn_club_aviso_componer(v_cuerpo, v_cierre);
    v_viejo := (select t.texto from retail.club_textos t where t.tipo = 'aviso_' || v_tipo order by t.version desc limit 1);
    if v_texto is distinct from v_viejo then
      insert into retail.club_textos (tipo, version, texto, creado_por)
      select 'aviso_' || v_tipo, coalesce(max(t.version), 0) + 1, v_texto, v_persona
        from retail.club_textos t where t.tipo = 'aviso_' || v_tipo;
      v_cambiados := array_append(v_cambiados, v_tipo);
    end if;
  end loop;

  if cardinality(v_cambiados) > 0 then
    insert into retail.configuracion_historial (que, detalle, hecho_por)
    values ('mensajes_avisos_club', jsonb_build_object('cambiados', to_jsonb(v_cambiados)), v_persona);
  end if;
  return cardinality(v_cambiados);
end;
$$;
comment on function retail.guardar_mensajes_avisos(jsonb, text) is
  'Clientes ▸ Avisos, «Editar mensajes»: guarda una versión nueva de cada aviso (cumpleanos, puntos, novedades, rebaja) y del cierre común SOLO si cambió. p_mensajes = {tipo: cuerpo} (sin cierre ni BAJA: los pone fn_club_aviso_componer). Solo el líder (hint avisos_solo_lider), con el módulo «Avisos del club», firmado con el responsable; queda en configuracion_historial. Devuelve cuántos textos cambió. Lo ya enviado no cambia.';
revoke all on function retail.guardar_mensajes_avisos(jsonb, text) from public, anon;
grant execute on function retail.guardar_mensajes_avisos(jsonb, text) to authenticated;

-- ---------- 6. Los mensajes nuevos (una sola vez) ----------
do $do$
declare
  v_cierre constant text := '🛍️ Recuerda que en *tienda.cayla.pe* puedes ver tus puntos, tus avisos y todo lo nuevo de CAYLA, cuando quieras.';
  r record;
begin
  if exists (select 1 from retail.club_textos where tipo = 'aviso_cierre') then
    return;  -- Ya hay un cierre: los mensajes ya se publicaron o alguien los editó desde la pantalla. No se pisa nada.
  end if;
  insert into retail.club_textos (tipo, version, texto) values ('aviso_cierre', 1, v_cierre);
  for r in
    select * from (values
      ('cumpleanos', E'🎂 ¡Feliz mes de cumpleaños, {nombre}!\nEn el Club CAYLA queremos celebrarte: con tu primera compra de este mes te regalamos *{regalo} puntos*, en cualquier tienda CAYLA o en la tienda web.\nTe esperamos en {tienda}. 💐'),
      ('puntos', E'Hola, {nombre} ✨\nTienes *{puntos} puntos* en el Club CAYLA, que valen *S/ {valor}* en tu próxima compra.\nÚsalos antes del *{fecha}*: si no hay compras hasta esa fecha, se eliminan junto con tus datos, como indican los términos del club.\nTe esperamos en {tienda}.'),
      ('novedades', E'Hola, {nombre} 👋\nAcaban de llegar prendas nuevas a {tienda} y, como miembro del Club CAYLA, eres de las primeras personas en saberlo.\nVen a conocerlas antes que nadie. ✨'),
      ('rebaja', E'Hola, {nombre} 🏷️\n*{prenda}* está con *{pct} % de descuento* en {tienda} y tenemos tu talla.\nLa promoción dura mientras haya stock: si te gusta, no esperes mucho.')
    ) as m(tipo, cuerpo)
  loop
    if retail.fn_club_aviso_problema(r.tipo, r.cuerpo) is not null then
      raise exception 'El mensaje sugerido de % no pasa su propia regla: %', r.tipo, retail.fn_club_aviso_problema(r.tipo, r.cuerpo);
    end if;
    insert into retail.club_textos (tipo, version, texto)
    select 'aviso_' || r.tipo, coalesce(max(t.version), 0) + 1, retail.fn_club_aviso_componer(r.cuerpo, v_cierre)
      from retail.club_textos t where t.tipo = 'aviso_' || r.tipo;
  end loop;
end;
$do$;

reset lock_timeout;
