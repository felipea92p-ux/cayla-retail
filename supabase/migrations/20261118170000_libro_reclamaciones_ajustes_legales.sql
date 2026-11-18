-- ============================================================================
-- 20261118170000_libro_reclamaciones_ajustes_legales.sql — CAYLA V2 · Libro de Reclamaciones · PARTE 5: lo que pidió la revisión legal
-- (ADR-0679, Felipe 2026-11-18; informe `docs/legal/2026-11-18-revision-legal-tienda.md`, «Requisitos exactos del Libro de Reclamaciones»)
--
-- EL PROBLEMA PRIMERO. La revisión legal comparó la hoja con el formato oficial (Anexo I del DS 011-2011-PCM y la guía del Indecopi) y
-- encontró tres huecos en lo que la hoja guarda: (1) cada libro lleva un CÓDIGO DE IDENTIFICACIÓN que elige el proveedor, y la hoja no lo
-- tenía; (2) si reclama un menor, van el nombre, domicilio, documento, teléfono y correo de su padre, madre o representante, y la hoja solo
-- guardaba el nombre; (3) en el libro virtual la firma se reemplaza por una constancia de que el consumidor está conforme con lo escrito.
--
-- ANALOGÍA CAYLA. En el libro de papel, el código va impreso en la tapa, la hoja tiene renglones para el apoderado y abajo va la firma de
-- quien reclama. Esta parte agrega esos renglones a la hoja de la web.
--
-- QUÉ HACE
--   1. `hojas_reclamacion` suma `libro_codigo` (el de este libro, «LR-WEB-01», copiado en cada hoja como los datos de CAYLA), los datos de
--      quien representa a un menor (`apoderado_tipo_documento`, `apoderado_documento`, `apoderado_domicilio`, `apoderado_telefono`,
--      `apoderado_correo`) y `conforme` (declaró que lo escrito es correcto).
--   2. `fn_libro_reclamaciones_codigo()`: el código del libro de la tienda online, en un solo lugar.
--   3. `tienda_registrar_hoja_reclamacion` exige la casilla («conforme») y, con un menor, todos los datos de quien lo representa.
--   4. El candado, la constancia (`tienda_ver_hoja_reclamacion`) y la lista del ERP (`fn_libro_reclamaciones`) suman los datos nuevos.
--
-- DECIDÍ: el código es «LR-WEB-01» (Felipe aceptó la propuesta el 2026-11-18): LR de Libro de Reclamaciones, WEB del canal, 01 por si un
--   día hay otro libro virtual. Las tiendas físicas tienen su libro de papel con su propio código.
-- DECIDÍ: las hojas que ya existían (solo pruebas locales: nada está en producción) quedan con `conforme = false` y sin datos del
--   apoderado; las restricciones nuevas valen para todas porque ninguna de esas era de un menor.
-- DESCARTÉ: un código por tienda en la hoja virtual (la tienda elegida ya va en la hoja; el código es del libro, no de la tienda).
--
-- PRODUCCIÓN. APLICADA el 2026-11-18 con el OK de Felipe (CLI `supabase db query --linked`, en una transacción, registrada con
-- esta misma versión en schema_migrations; las 18 funciones del Libro, idénticas a la base local probada). Antes: NO estaba aplicada: va DESPUÉS de las PARTES 1 a 4 y espera el OK de Felipe. Idempotente. Agrega columnas a una tabla que en
-- producción todavía no existe; sin políticas, sin `drop trigger`, sin `select … into` dentro de un texto entre comillas.
--
-- VERIFICACIÓN (solo lectura, después de pegar):
--   select retail.fn_libro_reclamaciones_codigo();                                                  → LR-WEB-01
--   select column_name from information_schema.columns where table_schema = 'retail' and table_name = 'hojas_reclamacion'
--      and column_name in ('libro_codigo', 'conforme', 'apoderado_correo');                           → las tres
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

do $guarda$
begin
  if to_regprocedure('retail.responder_hoja_reclamacion(uuid, text)') is null then
    raise exception 'Faltan las partes anteriores: pega antes 20261118145000, 150000, 151000 y 152000.';
  end if;
end
$guarda$;

-- ---------- 1. El código del libro ----------
create or replace function retail.fn_libro_reclamaciones_codigo()
returns text
language sql
immutable
set search_path = retail, public
as $$ select 'LR-WEB-01' $$;
comment on function retail.fn_libro_reclamaciones_codigo() is
  'Libro de Reclamaciones (ADR-0679): el código de identificación del libro virtual de la tienda online, que va en cada hoja. Interna.';
revoke all on function retail.fn_libro_reclamaciones_codigo() from public, anon, authenticated;

-- ---------- 2. Las columnas ----------
alter table retail.hojas_reclamacion
  add column if not exists libro_codigo             text not null default 'LR-WEB-01',
  add column if not exists apoderado_tipo_documento text,
  add column if not exists apoderado_documento      text,
  add column if not exists apoderado_domicilio      text,
  add column if not exists apoderado_telefono       text,
  add column if not exists apoderado_correo         text,
  add column if not exists conforme                 boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'hojas_reclamacion_apoderado_datos') then
    alter table retail.hojas_reclamacion add constraint hojas_reclamacion_apoderado_datos check (
      (not menor_de_edad and apoderado_tipo_documento is null and apoderado_documento is null and apoderado_domicilio is null
         and apoderado_telefono is null and apoderado_correo is null)
      or (menor_de_edad and (
        apoderado_tipo_documento is null
        or (apoderado_tipo_documento in ('dni', 'ce', 'pasaporte')
            and ((apoderado_tipo_documento = 'dni' and apoderado_documento ~ '^[0-9]{8}$')
                 or (apoderado_tipo_documento <> 'dni' and apoderado_documento ~ '^[A-Z0-9]{6,12}$'))
            and char_length(apoderado_domicilio) between 5 and 200
            and apoderado_telefono ~ '^\+?[0-9]{6,15}$'
            and char_length(apoderado_correo) <= 254
            and apoderado_correo ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'))));
  end if;
end
$$;

comment on column retail.hojas_reclamacion.libro_codigo is 'El código de identificación del libro (fn_libro_reclamaciones_codigo), copiado en la hoja ese día.';
comment on column retail.hojas_reclamacion.conforme is 'El cliente declaró que lo escrito es correcto (la firma del libro virtual). Toda hoja nueva lo exige.';
comment on column retail.hojas_reclamacion.apoderado_documento is 'Si reclama un menor: el documento de su padre, madre o representante (con su tipo, domicilio, teléfono y correo).';

-- ---------- 3. El candado, con los datos nuevos ----------
create or replace function retail.fn_hojas_reclamacion_reglas()
returns trigger
language plpgsql
set search_path = retail, public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Una hoja del Libro de Reclamaciones no se borra.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    -- Lo que escribió el cliente y lo que decía la hoja ese día no cambia nunca.
    if (new.id, new.anio, new.numero, new.creada_en, new.marca, new.cuenta_web_id, new.proveedor_razon_social, new.proveedor_ruc,
        new.proveedor_domicilio, new.ubicacion_id, new.ubicacion_nombre, new.ubicacion_direccion, new.consumidor_nombre,
        new.consumidor_tipo_documento, new.consumidor_documento, new.consumidor_domicilio, new.consumidor_telefono,
        new.consumidor_correo, new.menor_de_edad, new.apoderado_nombre, new.bien_tipo, new.bien_monto, new.bien_descripcion,
        new.tipo, new.detalle, new.pedido, new.libro_codigo, new.apoderado_tipo_documento, new.apoderado_documento,
        new.apoderado_domicilio, new.apoderado_telefono, new.apoderado_correo, new.conforme)
       is distinct from
       (old.id, old.anio, old.numero, old.creada_en, old.marca, old.cuenta_web_id, old.proveedor_razon_social, old.proveedor_ruc,
        old.proveedor_domicilio, old.ubicacion_id, old.ubicacion_nombre, old.ubicacion_direccion, old.consumidor_nombre,
        old.consumidor_tipo_documento, old.consumidor_documento, old.consumidor_domicilio, old.consumidor_telefono,
        old.consumidor_correo, old.menor_de_edad, old.apoderado_nombre, old.bien_tipo, old.bien_monto, old.bien_descripcion,
        old.tipo, old.detalle, old.pedido, old.libro_codigo, old.apoderado_tipo_documento, old.apoderado_documento,
        old.apoderado_domicilio, old.apoderado_telefono, old.apoderado_correo, old.conforme) then
      raise exception 'Lo escrito en una hoja del Libro de Reclamaciones no cambia.' using errcode = '42501';
    end if;
    -- La copia (PARTE 2): enviada una vez, y los intentos solo suben.
    if old.copia_enviada_en is not null and new.copia_enviada_en is distinct from old.copia_enviada_en then
      raise exception 'La copia de la hoja ya salió: no se desmarca.' using errcode = '42501';
    end if;
    if new.copia_intentos < old.copia_intentos then
      raise exception 'Los intentos de la copia no bajan.' using errcode = '42501';
    end if;
    -- La respuesta (PARTE 4): se escribe una vez, con quién y cuándo, y no cambia; su correo se marca una vez.
    if old.respuesta is not null
       and (new.respuesta, new.respondida_en, new.respondida_por) is distinct from (old.respuesta, old.respondida_en, old.respondida_por) then
      raise exception 'La respuesta de una hoja no se corrige.' using errcode = '42501';
    end if;
    if old.respuesta_enviada_en is not null and new.respuesta_enviada_en is distinct from old.respuesta_enviada_en then
      raise exception 'La respuesta ya salió por correo: no se desmarca.' using errcode = '42501';
    end if;
    if new.respuesta_intentos < old.respuesta_intentos then
      raise exception 'Los intentos de la respuesta no bajan.' using errcode = '42501';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;
revoke all on function retail.fn_hojas_reclamacion_reglas() from public, anon, authenticated;

-- ---------- 4. Guardar la hoja: la casilla y los datos de quien representa a un menor ----------
create or replace function retail.tienda_registrar_hoja_reclamacion(p_datos jsonb, p_usuario_web_id uuid, p_ip_hash text, p_marca uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public
as $$
declare
  v_ip text := nullif(btrim(coalesce(p_ip_hash, '')), '');
  v_id uuid;
  v_cuenta uuid;
  v_anio smallint := extract(year from (now() at time zone 'America/Lima'))::smallint;
  v_numero integer;
  v_razon text;
  v_ruc text;
  v_ubicacion uuid;
  v_ubicacion_nombre text;
  v_ubicacion_direccion text;
  v_tipo text;
  v_bien_tipo text;
  v_nombre text;
  v_tipo_doc text;
  v_doc text;
  v_domicilio text;
  v_telefono text;
  v_correo text;
  v_menor boolean;
  v_apoderado text;
  v_ap_tipo_doc text;
  v_ap_doc text;
  v_ap_domicilio text;
  v_ap_telefono text;
  v_ap_correo text;
  v_monto numeric;
  v_monto_texto text;
  v_descripcion text;
  v_detalle text;
  v_pedido text;
begin
  if p_marca is null or p_datos is null or jsonb_typeof(p_datos) <> 'object' then
    return jsonb_build_object('estado', 'invalido', 'campo', 'marca');
  end if;

  -- La misma marca: la hoja que ya se guardó (un segundo toque o un reintento), sin contarla otra vez.
  v_id := (select h.id from retail.hojas_reclamacion h where h.marca = p_marca);
  if v_id is not null then
    return jsonb_build_object('estado', 'registrada', 'id', v_id, 'repetida', true,
                              'codigo', (select h.codigo from retail.hojas_reclamacion h where h.id = v_id));
  end if;

  -- Lo que llega, limpio. Un campo que no viene o viene vacío queda null y lo frena su validación.
  v_tipo       := lower(btrim(coalesce(p_datos ->> 'tipo', '')));
  v_bien_tipo  := lower(btrim(coalesce(p_datos ->> 'bien_tipo', '')));
  v_nombre     := retail.fn_recomendacion_texto(replace(coalesce(p_datos ->> 'nombre', ''), E'\n', ' '));
  v_tipo_doc   := lower(btrim(coalesce(p_datos ->> 'tipo_documento', '')));
  v_doc        := upper(regexp_replace(coalesce(p_datos ->> 'documento', ''), '[^0-9A-Za-z]', '', 'g'));
  v_domicilio  := retail.fn_recomendacion_texto(replace(coalesce(p_datos ->> 'domicilio', ''), E'\n', ' '));
  v_telefono   := regexp_replace(coalesce(p_datos ->> 'telefono', ''), '[^0-9+]', '', 'g');
  v_correo     := lower(btrim(coalesce(p_datos ->> 'correo', '')));
  -- Solo «true» marca a un menor: un valor raro no lanza un error, cuenta como no.
  v_menor      := coalesce(p_datos ->> 'menor_de_edad', '') = 'true';
  v_apoderado  := case when v_menor then retail.fn_recomendacion_texto(replace(coalesce(p_datos ->> 'apoderado', ''), E'\n', ' ')) end;
  -- Quien representa a un menor: los mismos datos que el consumidor (Anexo I del DS 011-2011-PCM; informe legal 2026-11-18).
  v_ap_tipo_doc  := case when v_menor then lower(btrim(coalesce(p_datos ->> 'apoderado_tipo_documento', ''))) end;
  v_ap_doc       := case when v_menor then upper(regexp_replace(coalesce(p_datos ->> 'apoderado_documento', ''), '[^0-9A-Za-z]', '', 'g')) end;
  v_ap_domicilio := case when v_menor then retail.fn_recomendacion_texto(replace(coalesce(p_datos ->> 'apoderado_domicilio', ''), E'\n', ' ')) end;
  v_ap_telefono  := case when v_menor then regexp_replace(coalesce(p_datos ->> 'apoderado_telefono', ''), '[^0-9+]', '', 'g') end;
  v_ap_correo    := case when v_menor then lower(btrim(coalesce(p_datos ->> 'apoderado_correo', ''))) end;
  v_descripcion := retail.fn_recomendacion_texto(coalesce(p_datos ->> 'bien_descripcion', ''));
  v_detalle    := retail.fn_recomendacion_texto(coalesce(p_datos ->> 'detalle', ''));
  v_pedido     := retail.fn_recomendacion_texto(coalesce(p_datos ->> 'pedido', ''));
  v_monto_texto := nullif(btrim(coalesce(p_datos ->> 'monto', '')), '');

  if v_tipo not in ('reclamo', 'queja') then
    return jsonb_build_object('estado', 'invalido', 'campo', 'tipo');
  end if;
  if v_nombre is null or char_length(v_nombre) not between 3 and 120 then
    return jsonb_build_object('estado', 'invalido', 'campo', 'nombre');
  end if;
  if v_tipo_doc not in ('dni', 'ce', 'pasaporte')
     or (v_tipo_doc = 'dni' and v_doc !~ '^[0-9]{8}$')
     or (v_tipo_doc <> 'dni' and v_doc !~ '^[A-Z0-9]{6,12}$') then
    return jsonb_build_object('estado', 'invalido', 'campo', 'documento');
  end if;
  if v_domicilio is null or char_length(v_domicilio) not between 5 and 200 then
    return jsonb_build_object('estado', 'invalido', 'campo', 'domicilio');
  end if;
  if v_telefono !~ '^\+?[0-9]{6,15}$' then
    return jsonb_build_object('estado', 'invalido', 'campo', 'telefono');
  end if;
  if char_length(v_correo) > 254 or v_correo !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return jsonb_build_object('estado', 'invalido', 'campo', 'correo');
  end if;
  if v_menor and (v_apoderado is null or char_length(v_apoderado) not between 3 and 120) then
    return jsonb_build_object('estado', 'invalido', 'campo', 'apoderado');
  end if;
  if v_menor and (v_ap_tipo_doc not in ('dni', 'ce', 'pasaporte')
                  or (v_ap_tipo_doc = 'dni' and v_ap_doc !~ '^[0-9]{8}$')
                  or (v_ap_tipo_doc <> 'dni' and v_ap_doc !~ '^[A-Z0-9]{6,12}$')) then
    return jsonb_build_object('estado', 'invalido', 'campo', 'apoderado_documento');
  end if;
  if v_menor and (v_ap_domicilio is null or char_length(v_ap_domicilio) not between 5 and 200) then
    return jsonb_build_object('estado', 'invalido', 'campo', 'apoderado_domicilio');
  end if;
  if v_menor and v_ap_telefono !~ '^\+?[0-9]{6,15}$' then
    return jsonb_build_object('estado', 'invalido', 'campo', 'apoderado_telefono');
  end if;
  if v_menor and (char_length(v_ap_correo) > 254 or v_ap_correo !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then
    return jsonb_build_object('estado', 'invalido', 'campo', 'apoderado_correo');
  end if;
  if v_bien_tipo not in ('producto', 'servicio') then
    return jsonb_build_object('estado', 'invalido', 'campo', 'bien_tipo');
  end if;
  if v_monto_texto is not null then
    if v_monto_texto !~ '^[0-9]{1,7}([.][0-9]{1,2})?$' then
      return jsonb_build_object('estado', 'invalido', 'campo', 'monto');
    end if;
    v_monto := v_monto_texto::numeric;
    if v_monto > 1000000 then
      return jsonb_build_object('estado', 'invalido', 'campo', 'monto');
    end if;
  end if;
  if v_descripcion is null or char_length(v_descripcion) not between 3 and 300 then
    return jsonb_build_object('estado', 'invalido', 'campo', 'bien_descripcion');
  end if;
  if v_detalle is null or char_length(v_detalle) not between 10 and 3000 then
    return jsonb_build_object('estado', 'invalido', 'campo', 'detalle');
  end if;
  if v_pedido is null or char_length(v_pedido) not between 3 and 1000 then
    return jsonb_build_object('estado', 'invalido', 'campo', 'pedido');
  end if;
  -- La firma del libro virtual: declara que lo escrito es correcto (guía del Indecopi; informe legal 2026-11-18). Solo «true».
  if coalesce(p_datos ->> 'conforme', '') <> 'true' then
    return jsonb_build_object('estado', 'invalido', 'campo', 'conforme');
  end if;

  -- La tienda: solo una de las que hoy se ven en la web (una escondida o un id cualquiera, no). Su nombre y su dirección de ese día.
  if nullif(btrim(coalesce(p_datos ->> 'ubicacion_id', '')), '') is not null then
    begin
      v_ubicacion := (p_datos ->> 'ubicacion_id')::uuid;
    exception when invalid_text_representation then
      return jsonb_build_object('estado', 'invalido', 'campo', 'ubicacion');
    end;
    if not (v_ubicacion = any (retail.fn_tienda_sedes_web())) then
      return jsonb_build_object('estado', 'invalido', 'campo', 'ubicacion');
    end if;
    for v_ubicacion_nombre, v_ubicacion_direccion in
      select coalesce(nullif(btrim(dw.nombre_web), ''), u.nombre), nullif(btrim(dw.direccion), '')
        from retail.ubicaciones u
        left join retail.ubicacion_datos_web dw on dw.ubicacion_id = u.id
       where u.id = v_ubicacion
    loop
      exit;
    end loop;
  end if;

  -- El tope por conexión (con huella). Un candado por huella: dos envíos a la vez de la misma conexión se turnan.
  if v_ip is not null then
    perform pg_advisory_xact_lock(hashtext('retail.hojas_reclamacion:' || v_ip));
    -- Pudo guardarse mientras esperaba el candado (dos toques a la vez con la misma marca).
    v_id := (select h.id from retail.hojas_reclamacion h where h.marca = p_marca);
    if v_id is not null then
      return jsonb_build_object('estado', 'registrada', 'id', v_id, 'repetida', true,
                                'codigo', (select h.codigo from retail.hojas_reclamacion h where h.id = v_id));
    end if;
    if (select count(*) from retail.hojas_reclamacion_intentos i
         where i.ip_hash = v_ip and i.creado_en > now() - interval '1 hour') >= 5 then
      return jsonb_build_object('estado', 'limite');
    end if;
    insert into retail.hojas_reclamacion_intentos (ip_hash) values (v_ip);
    delete from retail.hojas_reclamacion_intentos
     where id in (select i.id from retail.hojas_reclamacion_intentos i where i.creado_en < now() - interval '1 day' order by i.id limit 200);
  end if;

  -- La cuenta, si tiene sesión y su cuenta está abierta (si no, la hoja va sin cuenta: igual se guarda).
  if p_usuario_web_id is not null then
    v_cuenta := (select w.id from retail.cuentas_web w where w.usuario_web_id = p_usuario_web_id and w.cerrada_en is null);
  end if;

  v_razon := retail.tienda_libro_reclamaciones_datos() ->> 'razon_social';
  v_ruc := retail.tienda_libro_reclamaciones_datos() ->> 'ruc';

  -- El número, en la misma transacción: si el insert falla, el contador vuelve atrás y no queda un salto.
  v_numero := retail.fn_siguiente_correlativo('LR-' || v_anio::text);

  insert into retail.hojas_reclamacion (
    anio, numero, marca, cuenta_web_id, proveedor_razon_social, proveedor_ruc, proveedor_domicilio,
    ubicacion_id, ubicacion_nombre, ubicacion_direccion,
    consumidor_nombre, consumidor_tipo_documento, consumidor_documento, consumidor_domicilio, consumidor_telefono, consumidor_correo,
    menor_de_edad, apoderado_nombre, bien_tipo, bien_monto, bien_descripcion, tipo, detalle, pedido,
    libro_codigo, apoderado_tipo_documento, apoderado_documento, apoderado_domicilio, apoderado_telefono, apoderado_correo, conforme)
  values (
    v_anio, v_numero, p_marca, v_cuenta, v_razon, v_ruc, retail.fn_libro_reclamaciones_domicilio(),
    v_ubicacion, v_ubicacion_nombre, v_ubicacion_direccion,
    v_nombre, v_tipo_doc, v_doc, v_domicilio, v_telefono, v_correo,
    v_menor, v_apoderado, v_bien_tipo, v_monto, v_descripcion, v_tipo, v_detalle, v_pedido,
    retail.fn_libro_reclamaciones_codigo(), v_ap_tipo_doc, v_ap_doc, v_ap_domicilio, v_ap_telefono, v_ap_correo, true)
  returning id into v_id;

  return jsonb_build_object('estado', 'registrada', 'id', v_id, 'repetida', false,
                            'codigo', lpad(v_numero::text, 6, '0') || '-' || v_anio::text);
end;
$$;

-- ---------- 5. La constancia ----------
create or replace function retail.tienda_ver_hoja_reclamacion(p_id uuid, p_marca uuid)
returns jsonb
language sql
stable
security definer
set search_path = retail, public
as $$
  select jsonb_build_object(
    'id', h.id, 'codigo', h.codigo, 'libro_codigo', h.libro_codigo, 'creada_en', h.creada_en,
    'proveedor', jsonb_build_object('razon_social', h.proveedor_razon_social, 'ruc', h.proveedor_ruc, 'domicilio', h.proveedor_domicilio),
    'tienda', case when h.ubicacion_id is null then null
                   else jsonb_build_object('nombre', h.ubicacion_nombre, 'direccion', h.ubicacion_direccion) end,
    'consumidor', jsonb_build_object(
      'nombre', h.consumidor_nombre, 'tipo_documento', h.consumidor_tipo_documento, 'documento', h.consumidor_documento,
      'domicilio', h.consumidor_domicilio, 'telefono', h.consumidor_telefono, 'correo', h.consumidor_correo,
      'menor_de_edad', h.menor_de_edad, 'apoderado', h.apoderado_nombre,
      'apoderado_datos', case when h.menor_de_edad then jsonb_build_object(
        'tipo_documento', h.apoderado_tipo_documento, 'documento', h.apoderado_documento, 'domicilio', h.apoderado_domicilio,
        'telefono', h.apoderado_telefono, 'correo', h.apoderado_correo) end),
    'bien', jsonb_build_object('tipo', h.bien_tipo, 'monto', h.bien_monto, 'descripcion', h.bien_descripcion),
    'tipo', h.tipo, 'detalle', h.detalle, 'pedido', h.pedido,
    'copia_enviada', h.copia_enviada_en is not null,
    'respuesta', h.respuesta,
    'respondida_en', h.respondida_en)
    from retail.hojas_reclamacion h
   where p_id is not null and p_marca is not null and h.id = p_id and h.marca = p_marca
$$;
-- ---------- 6. La lista del ERP ----------
create or replace function retail.fn_libro_reclamaciones()
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public
as $$
declare
  v_hoy date := (now() at time zone 'America/Lima')::date;
begin
  perform retail.fn_exigir_modulo('libro_reclamaciones');
  return jsonb_build_object(
    'hoy', v_hoy,
    'hojas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', x.id, 'codigo', x.codigo, 'libro_codigo', x.libro_codigo, 'creada_en', x.creada_en, 'tipo', x.tipo,
               'tienda', x.ubicacion_nombre,
               'consumidor', jsonb_build_object(
                 'nombre', x.consumidor_nombre, 'tipo_documento', x.consumidor_tipo_documento, 'documento', x.consumidor_documento,
                 'domicilio', x.consumidor_domicilio, 'telefono', x.consumidor_telefono, 'correo', x.consumidor_correo,
                 'menor_de_edad', x.menor_de_edad, 'apoderado', x.apoderado_nombre,
                 'apoderado_datos', case when x.menor_de_edad then jsonb_build_object(
                   'tipo_documento', x.apoderado_tipo_documento, 'documento', x.apoderado_documento, 'domicilio', x.apoderado_domicilio,
                   'telefono', x.apoderado_telefono, 'correo', x.apoderado_correo) end),
               'bien', jsonb_build_object('tipo', x.bien_tipo, 'monto', x.bien_monto, 'descripcion', x.bien_descripcion),
               'detalle', x.detalle, 'pedido', x.pedido,
               'copia_enviada', x.copia_enviada_en is not null,
               'vence_el', x.vence,
               'dias_restantes', retail.fn_libro_dias_habiles_restantes(v_hoy, x.vence),
               'respuesta', x.respuesta,
               'respondida_en', x.respondida_en,
               'respuesta_enviada', x.respuesta_enviada_en is not null)
             order by x.creada_en desc, x.id)
        from (select h.*, retail.fn_libro_vence_el((h.creada_en at time zone 'America/Lima')::date) as vence
                from retail.hojas_reclamacion h
               order by h.creada_en desc, h.id
               limit 1000) x), '[]'::jsonb),
    'hay_mas', (select count(*) > 1000 from retail.hojas_reclamacion));
end;
$$;
-- ---------- 7. Permisos ----------
revoke all on function retail.tienda_registrar_hoja_reclamacion(jsonb, uuid, text, uuid) from public, anon, authenticated;
grant execute on function retail.tienda_registrar_hoja_reclamacion(jsonb, uuid, text, uuid) to tienda_web;
revoke all on function retail.tienda_ver_hoja_reclamacion(uuid, uuid) from public, anon, authenticated;
grant execute on function retail.tienda_ver_hoja_reclamacion(uuid, uuid) to tienda_web;
revoke all on function retail.fn_libro_reclamaciones() from public, anon, authenticated;
grant execute on function retail.fn_libro_reclamaciones() to authenticated;
