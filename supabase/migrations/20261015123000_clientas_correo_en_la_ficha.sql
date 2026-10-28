-- ============================================================================
-- 20261015123000_clientas_correo_en_la_ficha.sql — CAYLA V2 · Clientes (ADR-0288) y tienda online (ADR-0408)
--
-- EL PROBLEMA PRIMERO. Felipe (2026-10-15, «Sí, antes de abrir la tienda»): la ficha del cliente en el ERP tiene que mostrar y dejar
-- corregir el CORREO. Hoy el correo de contacto (`clientas.correo`) lo escriben solo el cartel del Club y la tienda online al crear la
-- cuenta; «Editar» de la ficha no lo recibe (`editar_clienta` no tiene ese parámetro), así que un correo mal escrito se quedaba mal
-- para siempre. Y al archivar una ficha nadie avisaba que su dueño tenía un pedido de la tienda online a medio camino: la regla de
-- conservación del Club ya no anonimiza a quien tiene un pedido en curso (20261015055000), pero la persona que archiva a mano no lo sabía.
--
-- ANALOGÍA CAYLA. El cuaderno de clientes de la tienda: el correo es un renglón más de la página, y quien la corrige tiene que poder
-- borrarlo y reescribirlo como el celular. Y antes de guardar la página en el archivo de atrás, la encargada mira si esa persona tiene
-- un paquete esperando en el mostrador.
--
-- QUÉ HACE
--   1. `editar_clienta` gana `p_correo` (al final, opcional): NULO = no se toca (una pantalla de antes, que no lo manda, no borra el
--      correo de nadie); VACÍO = se borra; un correo = se guarda en minúsculas y sin espacios, con su formato (el mismo del candado
--      `clientas_correo_formato`). Mal escrito → 22023, hint `correo_invalido`, detail `correo`.
--      Si es de OTRA ficha (su correo de contacto) o es con el que entra a la tienda online la cuenta de otra ficha, el disparador
--      `fn_correo_de_una_persona` (20261015054000) lo rechaza; `editar_clienta` lo atrapa y dice DE CUÁL (nombre, código del club,
--      archivada): 23505, hint `correo_de_otra_ficha`, detail `correo`. Lo ve solo quien edita fichas (el módulo «Clientes»), como el
--      documento de otra ficha. La página pública del Club y la tienda online siguen sin decir de quién es (`correo_repetido`).
--      Todo lo demás de la función, igual. Se cambia la firma: se crea la de 11 parámetros y se BORRA la de 10 (dos sobrecargas harían
--      dudar a PostgREST).
--   2. `fn_clienta_tienda_online(ficha)`: lo que esa ficha tiene en la tienda online, para la hoja de la ficha: si tiene una cuenta
--      ABIERTA (sí o no; ni su correo de entrada ni nada más) y sus pedidos web EN CURSO (por confirmar dentro de su plazo, confirmados
--      o pagados sin entregar) con su código, su estado y su tienda. Con el candado del módulo «Clientes», como toda lectura de la ficha.
--
-- LO QUE NO HACE, A PROPÓSITO: cambiar el correo con que la persona ENTRA a la tienda online (`cuentas_web.correo`). Ese correo es el de
--   su usuario en el proyecto de inicio de sesión de los clientes (otro proyecto, ADR-0408 decisión 2) y es la llave de su cuenta:
--   cambiarlo desde el ERP sin que ella confirme el nuevo dejaría su cuenta en manos de quien escribió el correo («olvidé mi
--   contraseña» llegaría al correo nuevo). Corregir el correo de CONTACTO de una ficha con cuenta deja los dos distintos, y eso ya es
--   válido (la misma persona puede tener los dos, `fn_correo_de_una_persona`). Si la tienda tiene que dejar cambiar el correo de
--   entrada, es una decisión de Felipe (pregunta abierta en el informe de esta tanda).
--
-- DECIDÍ: el texto entero de la función con su candado de versión (md5 «antes» y «después»), como 20261015054000 y las tandas del
--   Club, y no un reemplazo por anclas sobre `pg_get_functiondef`: la firma cambia (un parámetro más), y las pruebas del Club
--   (`club_permisos`, `club_venta_ligada`, `clientas_por_modulo_y_anonimizar`) comparan el cuerpo vivo de `editar_clienta` con el de
--   un archivo. El candado cumple lo mismo que un ancla: si la función viva no es exactamente la de 20261015054000, no se toca nada.
-- DECIDÍ: `p_correo` nulo = no tocar, aunque en esta función los demás campos nulos SÍ borran (`p_nombre`, `p_telefono_whatsapp`).
--   Es por el orden de publicación: si este SQL se pega antes de que la web nueva esté publicada, la ficha de antes llama sin
--   `p_correo` y no puede borrar correos sin querer. La web nueva manda siempre el texto (vacío para borrar).
-- DECIDÍ: el formato se revisa aquí con la misma expresión del candado `clientas_correo_formato` (y no con
--   `fn_cuenta_web_correo`, de la tienda): la ficha no depende de que existan las funciones de la tienda.
-- DECIDÍ: la lectura de la tienda online dice si hay una cuenta, no cuál es su correo: la hoja solo necesita avisar que el correo de
--   entrada no cambia desde aquí. Menos datos personales en pantalla (Ley 29733).
-- DESCARTÉ: frenar el archivo de una ficha con un pedido en curso. Felipe (2026-10-15): la hoja AVISA y deja seguir; lo que no puede
--   pasar sola (la conservación de 3 años) ya lo frena 20261015055000.
-- DESCARTÉ: una RPC aparte para el correo (`guardar_correo_clienta`): «Guardar» haría dos escrituras con dos versiones, y una podría
--   quedar a medias. El correo viaja con lo demás de la ficha, en una sola transacción.
--
-- SE ROMPE SI: una migración futura recrea `editar_clienta` desde un archivo viejo (el candado de versión lo impide al pegar ESTA; y
--   si alguien pega 20261015054000 después, su propio candado aborta porque la firma de 10 ya no existe); o alguien vuelve a crear la
--   firma de 10 parámetros al lado de esta (PostgREST no sabría cuál llamar: `pnpm pruebas:clientas-correo-ficha` lo marca).
--
-- PRODUCCIÓN. NO está aplicada. Va DESPUÉS de 20261015054000 (el correo de una sola persona) y de 20261015055000 (las cuentas que se
-- cierran), y de las migraciones de la tienda que crean `cuentas_web` y `pedidos_web`. Una sola parte, idempotente (se puede pegar dos
-- veces). No toca tablas: crea y borra funciones (`drop function` no toma las tablas de `auth` ni de `storage`; CLAUDE.md, «Políticas y
-- deadlocks»). Sin políticas ni `drop trigger`, y ningún `select … into` dentro de un texto entre comillas. Pegar ESTE SQL ANTES de
-- publicar la web: la ficha nueva manda `p_correo` y llama `fn_clienta_tienda_online`; con la web nueva y sin este SQL, «Guardar» de
-- la ficha falla («la función no existe») y la hoja de archivar no avisa (sin romper nada más). Con este SQL y la web de antes, todo
-- sigue igual que hoy (sin `p_correo`, el correo no se toca).
--
-- VERIFICACIÓN (solo lectura, después de pegar):
--   select pg_get_function_identity_arguments(p.oid) from pg_proc p where p.proname = 'editar_clienta';
--     → una sola fila, que termina en «p_version_esperada integer, p_correo text»
--   select has_function_privilege('anon', 'retail.fn_clienta_tienda_online(uuid)', 'execute'),
--          has_function_privilege('authenticated', 'retail.fn_clienta_tienda_online(uuid)', 'execute');   → f | t
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 0. Lo que da por hecho y el candado de versión (si algo no calza, no se toca nada) ----------
do $guarda$
declare
  r record;
  v_md5 text;
begin
  if to_regprocedure('retail.fn_correo_de_una_persona()') is null then
    raise exception 'Falta el correo de una sola persona: pega antes 20261015054000_clientas_correo_unico_y_sin_unir_fichas.sql.';
  end if;
  if to_regclass('retail.cuentas_web') is null or to_regclass('retail.pedidos_web') is null
     or to_regprocedure('retail.fn_pedido_web_plazos()') is null then
    raise exception 'Faltan las cuentas y los pedidos de la tienda online: pega antes sus migraciones (20261014224000, 20261014235000 y 20261015010000).';
  end if;
  if to_regprocedure('retail.tienda_anotar_entrada(uuid)') is null then
    raise exception 'Falta la cuenta que se cierra al anonimizar: pega antes 20261015055000_tienda_cuentas_entrada_y_cierre.sql.';
  end if;
  for r in
    select * from (values
      -- firma                                                                                         antes (20261015054000)               despues (este archivo)
      ('retail.editar_clienta(uuid,text,text,text,text,smallint,smallint,smallint,jsonb,integer)',      '2f8480789502382d85f53404e1488065',  null),
      ('retail.editar_clienta(uuid,text,text,text,text,smallint,smallint,smallint,jsonb,integer,text)', null,                                '32d7947315f97a44d437eabd99985773'),
      ('retail.fn_clienta_tienda_online(uuid)',                                                         null,                                '34c668ecb3d183421361bdebff57210e')
    ) as t(firma, antes, despues)
  loop
    v_md5 := (select md5(regexp_replace(regexp_replace(regexp_replace(p.prosrc, '/\*.*?\*/', '', 'g'), '--[^' || chr(10) || ']*', '', 'g'), '\s+', '', 'g'))
                from pg_proc p where p.oid = to_regprocedure(r.firma));
    if v_md5 is not null and v_md5 is distinct from r.antes and v_md5 is distinct from r.despues then
      raise exception '% cambió desde que se escribió esta migración (md5 normalizado %; se esperaba % —antes— o % —después—). No se reemplaza a ciegas: lee su definición viva y rehace este cambio sobre ESA versión.',
        r.firma, v_md5, coalesce(r.antes, 'que no exista'), coalesce(r.despues, 'que ya no exista');
    end if;
  end loop;
  -- Ni la firma de antes ni la de después: a esta base le falta la tanda 1b del Club (y 20261015054000).
  if to_regprocedure('retail.editar_clienta(uuid,text,text,text,text,smallint,smallint,smallint,jsonb,integer)') is null
     and to_regprocedure('retail.editar_clienta(uuid,text,text,text,text,smallint,smallint,smallint,jsonb,integer,text)') is null then
    raise exception 'editar_clienta no existe en esta base: pega antes la tanda 1b del Club (20260930200100) y 20261015054000.';
  end if;
end
$guarda$;

-- ---------- 1. editar_clienta: el correo de contacto ----------
-- Sobre su definición viva (la de 20261015054000, md5 2f848078…). Cambia SOLO: el parámetro `p_correo` (al final), su revisión de
-- formato, la columna `correo` en el `update`, y el rechazo del correo de otra ficha, que dice de cuál es. Lo demás, igual.
create or replace function retail.editar_clienta(
  p_id uuid,
  p_documento_tipo text default 'dni',
  p_documento_numero text default null,
  p_nombre text default null,
  p_telefono_whatsapp text default null,
  p_cumple_dia smallint default null,
  p_cumple_mes smallint default null,
  p_cumple_anio smallint default null,
  p_tallas jsonb default null,
  p_version_esperada integer default null,
  p_correo text default null
)
returns integer
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_persona uuid;
  v_actual record;
  v_tipo text := coalesce(nullif(btrim(p_documento_tipo), ''), 'dni');
  v_numero text;
  v_telefono text;
  -- El correo de contacto (Felipe 2026-10-15): nulo = no se toca (una pantalla de antes no lo manda); vacío = se borra.
  v_correo text := lower(btrim(p_correo));
  v_ligadas integer := 0;
  v_hint text;
  v_restriccion text;
  v_otra_nombre text;
  v_otra_codigo text;
  v_otra_archivada boolean;
  v_otra_detalle text;
  v_otra text;
  v_de_su_cuenta boolean := false;
  v_encontrada boolean := false;
begin
  perform retail.fn_exigir_modulo('clientas');
  v_persona := retail.fn_actor_persona_id(true);
  v_numero := retail.fn_documento_clienta(v_tipo, p_documento_numero);
  v_telefono := retail.fn_exigir_celular(p_telefono_whatsapp, false);
  -- El mismo formato que exige el candado clientas_correo_formato (y el cartel del Club): algo@algo.algo, sin espacios.
  if v_correo <> '' and (char_length(v_correo) > 254 or v_correo !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then
    raise exception 'Revisa el correo: parece incompleto. Si no lo tiene, déjalo vacío.'
      using errcode = '22023', hint = 'correo_invalido', detail = 'correo';
  end if;

  -- `for update` desde la primera lectura: si otra caja la une al club mientras se edita, esta espera y ve que ya es
  -- socia (y no le puede borrar el celular). ADR-0193, candado optimista: al despertar, compara la versión que pidió.
  select * into v_actual from retail.clientas where id = p_id for update;
  if v_actual.id is null then
    raise exception 'Esa clienta ya no existe — actualiza la pantalla.';
  end if;
  if v_actual.archivada_en is not null then
    raise exception 'Esta ficha está archivada — reactívala antes de editarla.';
  end if;
  if p_version_esperada is not null and v_actual.version <> p_version_esperada then
    raise exception 'Alguien más editó esta ficha mientras la mirabas. Recarga para ver sus cambios.'
      using errcode = 'PT409', hint = 'version_cambiada';
  end if;
  -- ADR-0288 (CL-1): una socia necesita su celular (es por donde se le avisa), su documento y su nombre (candados
  -- clientas_socia_con_celular y clientas_socia_con_documento_y_nombre).
  if v_actual.club_desde is not null and v_telefono is null then
    raise exception 'Es socia del club: su celular no se puede borrar. Si lo cambió, escribe el nuevo.'
      using errcode = 'P0001', hint = 'socia_sin_celular';
  end if;
  if v_actual.club_desde is not null and (v_numero is null or nullif(btrim(p_nombre), '') is null) then
    raise exception 'Es socia del club: su ficha necesita documento y nombre. No los borres.'
      using errcode = 'P0001', hint = 'socia_sin_documento';
  end if;

  -- ADR-0288 D-4: la ficha no da permisos. El club se da con unirse_al_club; la publicidad, solo con un mensaje de ella;
  -- la BAJA, con registrar_baja_whatsapp. Ajuste d: el celular sí se cambia, y si tenía publicidad se la quita en esta
  -- misma operación (la publicidad es del número desde el que escribió). Sigue socia; la recupera con «Llegó su mensaje».
  if v_actual.publicidad_desde is not null
     and v_telefono is distinct from retail.fn_celular_normalizado(v_actual.telefono_whatsapp) then
    perform retail.fn_club_quitar_publicidad_por_celular(p_id, v_persona);
  end if;

  begin
    update retail.clientas set
      documento_tipo = v_tipo,
      documento_numero = v_numero,
      nombre = nullif(btrim(p_nombre), ''),
      telefono_whatsapp = v_telefono,
      cumple_dia = p_cumple_dia,
      cumple_mes = p_cumple_mes,
      cumple_anio = p_cumple_anio,
      tallas = coalesce(p_tallas, tallas),
      -- El correo de contacto. NO el de su cuenta de la tienda online (`cuentas_web.correo`): ese es la llave de su cuenta y no
      -- cambia desde aquí (ver la cabecera de 20261015123000).
      correo = case when p_correo is null then correo else nullif(v_correo, '') end
    where id = p_id;
  exception when unique_violation then
    get stacked diagnostics v_hint = pg_exception_hint, v_restriccion = constraint_name;
    -- Un correo es de UNA persona (Felipe 2026-10-14). El disparador fn_correo_de_una_persona no dice de quién es (lo comparten la
    -- página pública del Club y la tienda); quien edita aquí ve el módulo «Clientes»: se le dice de qué ficha es, para que la busque.
    if v_hint = 'correo_repetido' or v_restriccion = 'clientas_correo_unico' then
      for v_otra_nombre, v_otra_codigo, v_otra_archivada in
        select c.nombre, c.codigo_club, c.archivada_en is not null
          from retail.clientas c
         where lower(btrim(c.correo)) = v_correo and c.id <> p_id
      loop
        v_encontrada := true;
        exit;
      end loop;
      -- Si no es el de contacto de otra ficha, es con el que entra a la tienda online la cuenta de otra ficha (en su propia
      -- sentencia: PL/pgSQL la prepara recién al ejecutarla).
      if not v_encontrada and to_regclass('retail.cuentas_web') is not null then
        for v_otra_nombre, v_otra_codigo, v_otra_archivada in
          select c.nombre, c.codigo_club, c.archivada_en is not null
            from retail.cuentas_web w
            join retail.clientas c on c.id = w.clienta_id
           where w.correo = v_correo and w.clienta_id <> p_id
        loop
          v_encontrada := true;
          v_de_su_cuenta := true;
          exit;
        end loop;
      end if;
      if not v_encontrada then
        raise exception 'Ese correo ya está registrado con los datos de otra persona.'
          using errcode = '23505', hint = 'correo_repetido', detail = 'correo';
      end if;
      v_otra_detalle := concat_ws(', ', v_otra_codigo, case when v_otra_archivada then 'archivada' end);
      v_otra := coalesce(nullif(btrim(v_otra_nombre), ''), 'un cliente sin nombre')
                || case when v_otra_detalle <> '' then ' (' || v_otra_detalle || ')' else '' end;
      if v_de_su_cuenta then
        raise exception 'Con ese correo entra a la tienda online la ficha de %. Un correo es de una sola persona: usa otro para esta ficha.', v_otra
          using errcode = '23505', hint = 'correo_de_otra_ficha', detail = 'correo';
      end if;
      raise exception 'Ese correo ya es de la ficha de %. Un correo es de una sola persona: búscala en Clientes y corrige la que esté mal.', v_otra
        using errcode = '23505', hint = 'correo_de_otra_ficha', detail = 'correo';
    end if;

    -- Un documento es de UNA persona (Felipe 2026-10-14: ya no se unen fichas). Quien edita ve el módulo «Clientes»: se le dice
    -- de qué ficha es, para que la busque y corrija la que esté mal.
    for v_otra_nombre, v_otra_codigo, v_otra_archivada in
      select c.nombre, c.codigo_club, c.archivada_en is not null
        from retail.clientas c
       where c.documento_tipo = v_tipo and c.documento_numero = v_numero and c.id <> p_id
    loop
      exit;
    end loop;
    v_otra_detalle := concat_ws(', ', v_otra_codigo, case when v_otra_archivada then 'archivada' end);
    v_otra := coalesce(nullif(btrim(v_otra_nombre), ''), 'un cliente sin nombre')
              || case when v_otra_detalle <> '' then ' (' || v_otra_detalle || ')' else '' end;
    raise exception 'Ese documento ya es de la ficha de %. Un documento es de una sola persona: búscala en Clientes y corrige la que esté mal.', v_otra
      using errcode = '23505', hint = 'documento_de_otra_ficha', detail = 'documento';
  end;

  -- CL-27: si el documento cambió, sus compras anteriores con ese documento pasan a su ficha.
  if v_numero is not null and (v_actual.documento_numero is distinct from v_numero or v_actual.documento_tipo is distinct from v_tipo) then
    v_ligadas := retail.fn_ligar_ventas_por_documento(p_id, v_tipo, v_numero);
  end if;

  -- Sin nombre ni documento: quién es queda en registro_id (ADR-0249, 2026-09-28).
  perform retail.fn_actividad_anotar(
    'clientas', 'editar', 'editó la ficha de una clienta',
    v_persona, null, null, null, 'clientas', p_id::text, now(),
    jsonb_build_object('ventas_ligadas', v_ligadas), 'vivo'
  );

  return (select version from retail.clientas where id = p_id);
end;
$$;

-- La firma de 10 parámetros se va: con las dos vivas, PostgREST no sabría cuál llamar sin `p_correo`.
drop function if exists retail.editar_clienta(uuid, text, text, text, text, smallint, smallint, smallint, jsonb, integer);

comment on function retail.editar_clienta(uuid, text, text, text, text, smallint, smallint, smallint, jsonb, integer, text) is
  'Edita la ficha (documento con tipo, nombre, celular, cumpleaños con año opcional, tallas y, desde 20261015123000, el correo de contacto) con candado optimista (PT409 version_cambiada). No da permisos del club (ADR-0288 D-4). A una socia no se le borra el celular (socia_sin_celular), el documento ni el nombre (socia_sin_documento); si se le cambia el celular y tenía publicidad, se la quita en la misma transacción (medio cambio_celular) y sigue socia. Documento de otra ficha → 23505 documento_de_otra_ficha, con el nombre de esa ficha (desde 2026-10-14 no se unen fichas: un documento es de una sola persona). Correo: nulo = no se toca, vacío = se borra; mal escrito → 22023 correo_invalido; de otra ficha o con el que entra a la tienda online la cuenta de otra ficha → 23505 correo_de_otra_ficha, con el nombre de esa ficha. No cambia el correo con que entra a la tienda online (cuentas_web.correo). Módulo «Clientas».';
revoke all on function retail.editar_clienta(uuid, text, text, text, text, smallint, smallint, smallint, jsonb, integer, text) from public, anon;
grant execute on function retail.editar_clienta(uuid, text, text, text, text, smallint, smallint, smallint, jsonb, integer, text) to authenticated;

-- ---------- 2. Lo que la ficha tiene en la tienda online ----------
create or replace function retail.fn_clienta_tienda_online(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  -- La ficha es del módulo «Clientas» (42501 clientas_sin_modulo). Va primero: si falla, no se lee nada.
  select retail.fn_exigir_modulo('clientas');

  select jsonb_build_object(
    -- Si tiene una cuenta ABIERTA en la tienda online. Ni su correo de entrada ni nada más: la ficha solo avisa que ese correo no
    -- cambia desde aquí (ver la cabecera de 20261015123000).
    'cuenta_web', exists (select 1 from retail.cuentas_web w where w.clienta_id = p_id and w.cerrada_en is null),
    -- Sus pedidos web en curso: por confirmar (dentro de su plazo: pasado, ya se LEE vencido, como fn_pedidos_web_estado_hoy),
    -- confirmados sin pagar y pagados sin entregar. Los más viejos primero.
    'pedidos_en_curso', coalesce((
      select jsonb_agg(jsonb_build_object('codigo', w.codigo, 'estado', w.estado, 'tienda', u.nombre, 'creado_en', w.creado_en)
                       order by w.creado_en, w.numero)
        from retail.pedidos_web w
        join retail.ubicaciones u on u.id = w.ubicacion_id
       where w.clienta_id = p_id
         and w.estado in ('por_confirmar', 'confirmado', 'pagado')
         and not (w.estado = 'por_confirmar'
                  and now() >= w.creado_en + make_interval(hours => (select z.horas_para_confirmar from retail.fn_pedido_web_plazos() z)))
    ), '[]'::jsonb)
  );
$$;

comment on function retail.fn_clienta_tienda_online(uuid) is
  'La ficha y la tienda online (ADR-0408, Felipe 2026-10-15): {cuenta_web: si tiene una cuenta abierta, pedidos_en_curso: [{codigo, estado (por_confirmar | confirmado | pagado), tienda, creado_en}]} (por confirmar solo dentro de su plazo). La lee la hoja de la ficha de /clientas: avisa al archivar si hay un pedido en curso y, al editar el correo, que el de entrada a la tienda no cambia. Sin el correo de entrada. Módulo «Clientas».';
revoke all on function retail.fn_clienta_tienda_online(uuid) from public, anon;
grant execute on function retail.fn_clienta_tienda_online(uuid) to authenticated;

reset lock_timeout;

notify pgrst, 'reload schema';
