-- ============================================================================
-- 20261118145000_libro_reclamaciones_tienda.sql — CAYLA V2 · Tienda online · Libro de Reclamaciones · PARTE 1: la hoja
-- (ADR-0679, Felipe 2026-11-18)
--
-- EL PROBLEMA PRIMERO. El Código de Protección y Defensa del Consumidor (Ley 29571, art. 150) obliga a todo proveedor a tener un
-- Libro de Reclamaciones, y el que vende por internet, uno virtual (DS 011-2011-PCM y modificatorias). La tienda online de CAYLA no lo
-- tenía: un cliente con un problema no tenía dónde dejarlo por escrito, y CAYLA quedaba expuesta a una multa de Indecopi. Felipe lo
-- vio al comparar una lista de 35 puntos legales con el repo (2026-11-18) y pidió construirlo.
--
-- ANALOGÍA CAYLA. El libro empastado que la tienda tiene junto a la caja: cada hoja con su número impreso, que no se arranca ni se
-- corrige. Esta es la misma hoja, pero en la web: lleva su número correlativo del año, los datos de CAYLA y lo que el cliente
-- escribió, y desde que se guarda ya no cambia.
--
-- QUÉ HACE
--   1. `retail.hojas_reclamacion`: una fila por hoja. El número (`numero` por `anio`, `codigo` «000001-2026»); los datos de CAYLA tal
--      como estaban ese día (razón social, RUC, domicilio fiscal y, si el cliente eligió una tienda, su dirección); los del cliente
--      (nombre, documento, domicilio, teléfono, correo y, si es menor, quién lo representa); lo que compró o contrató (producto o
--      servicio, monto reclamado, descripción); si es reclamo o queja, el detalle y lo que pide. RLS encendido y sin políticas: solo sus
--      funciones la leen y la escriben.
--   2. Su candado (disparador `hojas_reclamacion_reglas`): nada de lo escrito cambia y ninguna hoja se borra. Las partes siguientes
--      (la copia al correo, la respuesta) agregan sus propias columnas y amplían este candado solo para ellas.
--   3. `tienda_registrar_hoja_reclamacion(datos, usuario, huella_ip, marca)`: la guarda. Valida todo por dentro, le da su número (sin
--      saltos: el contador avanza en la misma transacción) y no duplica: la misma marca devuelve la hoja ya guardada (dos toques, o un
--      reintento cuando la respuesta se perdió en el camino). Tope: 5 hojas por hora desde la misma conexión (huella de la ip). No lanza
--      errores de negocio: responde {estado}.
--   4. `tienda_ver_hoja_reclamacion(id, marca)`: la hoja completa, para la constancia que el cliente ve e imprime. Pide las dos llaves:
--      el id solo no basta para leer los datos de otra persona.
--   5. `tienda_libro_reclamaciones_datos()`: los datos de CAYLA que la hoja muestra ANTES de llenarla.
--
-- DECIDÍ: no pide cuenta. La ley no deja condicionar el libro a registrarse ni a haber comprado. Si la persona tiene sesión, la hoja
--   queda ligada a su cuenta (`cuenta_web_id`) y el formulario le trae sus datos; sin sesión, igual se guarda.
-- DECIDÍ: los datos de CAYLA se COPIAN en la hoja, no se enlazan. Una hoja es una constancia de ese día: si mañana cambia el domicilio
--   o la razón social, la hoja 000001-2026 tiene que seguir diciendo lo que decía al guardarse. La razón social y el RUC salen de
--   `configuracion_empresa`; el domicilio fiscal, de `fn_libro_reclamaciones_domicilio()` (el mismo que imprime la boleta,
--   `apps/web/lib/emisor.ts`, y que dice la política de privacidad); la dirección de la tienda elegida, de `ubicacion_datos_web`.
-- DECIDÍ: el número es por año y sin saltos (`fn_siguiente_correlativo('LR-<año>')`, el contador de los códigos del catálogo): si el
--   guardado falla después de tomar el número, la transacción entera se deshace y el contador también. El año es el de Lima.
-- DECIDÍ: el tope por ip existe para frenar a un programa, no a una persona: 5 por hora es más de lo que una persona escribe. Sin
--   huella (la tienda sin su sal) la hoja SE GUARDA igual: es un derecho del cliente, y un hueco de configuración no se lo quita.
-- DECIDÍ: el texto se guarda limpio con `fn_recomendacion_texto` (el limpiador de Recomendaciones: sin invisibles ni caracteres de
--   control, espacios seguidos en uno). Lo que parece código es texto: la pantalla lo escribe como texto.
-- DESCARTÉ: guardarla en `recomendaciones_web` con un tipo más (una recomendación se archiva y se responde si se quiere; una hoja tiene
--   plazo legal, número correlativo y no se archiva); pedir el DNI por padrón (una persona sin DNI peruano también reclama: carné de
--   extranjería o pasaporte, y el nombre lo escribe ella); un `pg_cron` o un aviso de la base a la tienda (ADR-0166, ADR-0352).
--
-- SE ROMPE SI: una función nueva escribe en `hojas_reclamacion` sin pasar por su disparador (no puede: no hay `session_replication_role`
--   en la tienda); alguien borra o renombra `LR-<año>` en `codigos_correlativos` (el número volvería a 1 ese año y chocaría con la
--   restricción única: el guardado fallaría, no duplicaría); o cambia el domicilio fiscal en la boleta y no en
--   `fn_libro_reclamaciones_domicilio()`.
--
-- PRODUCCIÓN. APLICADA el 2026-11-18 con el OK de Felipe (CLI `supabase db query --linked`, en una transacción, registrada con
-- esta misma versión en schema_migrations; las 18 funciones del Libro, idénticas a la base local probada). Antes: NO estaba aplicada: espera el OK de Felipe. Una sola parte, idempotente (se puede pegar dos veces). Crea dos tablas nuevas
-- (sus llaves foráneas toman `ubicaciones` y `cuentas_web` en modo compartido, sin frenar lecturas), sin políticas, sin `drop trigger`
-- y sin `select … into` dentro de un texto entre comillas. `lock_timeout` de 3 s: si algo está tomado, falla sin tocar nada y se pega
-- otra vez.
--
-- VERIFICACIÓN (solo lectura, después de pegar):
--   select to_regclass('retail.hojas_reclamacion');                                                               → retail.hojas_reclamacion
--   select has_function_privilege('tienda_web', 'retail.tienda_registrar_hoja_reclamacion(jsonb, uuid, text, uuid)', 'execute'); → t
--   select has_function_privilege('authenticated', 'retail.tienda_registrar_hoja_reclamacion(jsonb, uuid, text, uuid)', 'execute'); → f
--   select tgname from pg_trigger where tgname = 'hojas_reclamacion_reglas';                                       → la fila
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 0. Lo que esta migración da por hecho ----------
do $guarda$
begin
  if not exists (select 1 from pg_roles where rolname = 'tienda_web') then
    raise exception 'Falta el rol tienda_web: pega antes 20261014220000_tienda_puerta_y_portada.sql.';
  end if;
  if to_regclass('retail.cuentas_web') is null or to_regclass('retail.ubicacion_datos_web') is null
     or to_regprocedure('retail.fn_tienda_sedes_web()') is null then
    raise exception 'Faltan las cuentas o las tiendas de la web: pega antes las migraciones de la tienda (ADR-0408).';
  end if;
  if to_regprocedure('retail.fn_recomendacion_texto(text)') is null then
    raise exception 'Falta fn_recomendacion_texto: pega antes 20261015134000_recomendaciones_web_tienda.sql.';
  end if;
  if to_regprocedure('retail.fn_siguiente_correlativo(text)') is null or to_regclass('retail.configuracion_empresa') is null then
    raise exception 'Faltan fn_siguiente_correlativo o configuracion_empresa.';
  end if;
end
$guarda$;

-- ---------- 1. La tabla ----------
create table if not exists retail.hojas_reclamacion (
  id                          uuid primary key default gen_random_uuid(),
  anio                        smallint not null,
  numero                      integer not null,
  codigo                      text generated always as (lpad(numero::text, 6, '0') || '-' || anio::text) stored,
  creada_en                   timestamptz not null default now(),
  -- La marca del borrador que la mandó: la misma marca es la misma hoja.
  marca                       uuid not null,
  -- Si la mandó alguien con sesión en la tienda.
  cuenta_web_id               uuid references retail.cuentas_web (id),
  -- Los datos de CAYLA ese día (copiados: la hoja es una constancia).
  proveedor_razon_social      text not null,
  proveedor_ruc               text not null,
  proveedor_domicilio         text not null,
  -- La tienda sobre la que reclama (una de las que se ven en la web) y su dirección ese día; vacía: la tienda online.
  ubicacion_id                uuid references retail.ubicaciones (id),
  ubicacion_nombre            text,
  ubicacion_direccion         text,
  -- El cliente.
  consumidor_nombre           text not null,
  consumidor_tipo_documento   text not null,
  consumidor_documento        text not null,
  consumidor_domicilio        text not null,
  consumidor_telefono         text not null,
  consumidor_correo           text not null,
  menor_de_edad               boolean not null default false,
  apoderado_nombre            text,
  -- Lo que compró o contrató.
  bien_tipo                   text not null,
  bien_monto                  numeric(12, 2),
  bien_descripcion            text not null,
  -- Lo que pasó y lo que pide.
  tipo                        text not null,
  detalle                     text not null,
  pedido                      text not null,
  constraint hojas_reclamacion_numero_unico unique (anio, numero),
  constraint hojas_reclamacion_marca_unica unique (marca),
  constraint hojas_reclamacion_anio check (anio between 2026 and 2200 and numero >= 1),
  constraint hojas_reclamacion_tipo check (tipo in ('reclamo', 'queja')),
  constraint hojas_reclamacion_bien_tipo check (bien_tipo in ('producto', 'servicio')),
  constraint hojas_reclamacion_documento_tipo check (consumidor_tipo_documento in ('dni', 'ce', 'pasaporte')),
  constraint hojas_reclamacion_documento check (
    (consumidor_tipo_documento = 'dni' and consumidor_documento ~ '^[0-9]{8}$')
    or (consumidor_tipo_documento in ('ce', 'pasaporte') and consumidor_documento ~ '^[A-Z0-9]{6,12}$')),
  constraint hojas_reclamacion_correo check (char_length(consumidor_correo) <= 254 and consumidor_correo ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  constraint hojas_reclamacion_telefono check (consumidor_telefono ~ '^\+?[0-9]{6,15}$'),
  constraint hojas_reclamacion_monto check (bien_monto is null or (bien_monto >= 0 and bien_monto <= 1000000)),
  constraint hojas_reclamacion_apoderado check (
    (menor_de_edad and apoderado_nombre is not null and char_length(apoderado_nombre) between 3 and 120)
    or (not menor_de_edad and apoderado_nombre is null)),
  constraint hojas_reclamacion_largos check (
    char_length(consumidor_nombre) between 3 and 120 and char_length(consumidor_domicilio) between 5 and 200
    and char_length(bien_descripcion) between 3 and 300 and char_length(detalle) between 10 and 3000
    and char_length(pedido) between 3 and 1000),
  constraint hojas_reclamacion_ubicacion check ((ubicacion_id is null) = (ubicacion_nombre is null))
);

comment on table retail.hojas_reclamacion is
  'Libro de Reclamaciones virtual de la tienda online (Ley 29571 art. 150, DS 011-2011-PCM; ADR-0679, Felipe 2026-11-18). Una fila por hoja, con su número correlativo por año (codigo «000001-2026»), los datos de CAYLA copiados ese día y los del cliente. No pide cuenta. La escribe tienda_registrar_hoja_reclamacion; nada de lo escrito cambia y no se borra (disparador hojas_reclamacion_reglas). RLS sin políticas: solo sus funciones.';
comment on column retail.hojas_reclamacion.codigo is 'El número de la hoja que ve el cliente: el correlativo del año con 6 cifras y el año («000001-2026»).';
comment on column retail.hojas_reclamacion.marca is 'El uuid del borrador que la mandó (el formulario crea uno por borrador): la misma marca devuelve la misma hoja. Es también la segunda llave para leer la constancia (tienda_ver_hoja_reclamacion).';
comment on column retail.hojas_reclamacion.tipo is 'reclamo: disconformidad con el producto o el servicio. queja: malestar con la atención, que no es sobre el producto o el servicio.';
comment on column retail.hojas_reclamacion.proveedor_domicilio is 'El domicilio fiscal de CAYLA ese día (fn_libro_reclamaciones_domicilio).';
comment on column retail.hojas_reclamacion.ubicacion_id is 'La tienda sobre la que reclama, si eligió una de las que se ven en la web. Vacía: la tienda online.';

create index if not exists hojas_reclamacion_creada_idx on retail.hojas_reclamacion (creada_en desc, id);
create index if not exists hojas_reclamacion_cuenta_idx on retail.hojas_reclamacion (cuenta_web_id) where cuenta_web_id is not null;

alter table retail.hojas_reclamacion enable row level security;
revoke all on retail.hojas_reclamacion from public, anon, authenticated;

-- Los intentos por conexión: solo la huella de la ip (un HMAC con la sal de la tienda) y cuándo. Lo de más de un día se va.
create table if not exists retail.hojas_reclamacion_intentos (
  id        bigint generated always as identity primary key,
  ip_hash   text not null check (btrim(ip_hash) <> '' and char_length(ip_hash) <= 128),
  creado_en timestamptz not null default now()
);
comment on table retail.hojas_reclamacion_intentos is
  'Libro de Reclamaciones: cuántas hojas mandó cada conexión en la última hora (huella HMAC de la ip, nunca la ip). Lo de más de un día se borra en cada guardado. RLS sin políticas.';
create index if not exists hojas_reclamacion_intentos_ip_idx on retail.hojas_reclamacion_intentos (ip_hash, creado_en);
alter table retail.hojas_reclamacion_intentos enable row level security;
revoke all on retail.hojas_reclamacion_intentos from public, anon, authenticated;

-- ---------- 2. El domicilio fiscal ----------
create or replace function retail.fn_libro_reclamaciones_domicilio()
returns text
language sql
immutable
set search_path = retail, public
as $$ select 'Mz. Q Lt. 26, Urb. San Andrés V Etapa, Víctor Larco Herrera, Trujillo, La Libertad' $$;
comment on function retail.fn_libro_reclamaciones_domicilio() is
  'Libro de Reclamaciones: el domicilio fiscal de CAYLA que se copia en cada hoja. Es el mismo de la boleta (apps/web/lib/emisor.ts) y de la política de privacidad: si cambia, cambia en los tres. Interna.';

-- ---------- 3. El candado ----------
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
    -- Lo que escribió el cliente y lo que decía la hoja ese día no cambia nunca. Las partes siguientes agregan columnas propias.
    if (new.id, new.anio, new.numero, new.creada_en, new.marca, new.cuenta_web_id, new.proveedor_razon_social, new.proveedor_ruc,
        new.proveedor_domicilio, new.ubicacion_id, new.ubicacion_nombre, new.ubicacion_direccion, new.consumidor_nombre,
        new.consumidor_tipo_documento, new.consumidor_documento, new.consumidor_domicilio, new.consumidor_telefono,
        new.consumidor_correo, new.menor_de_edad, new.apoderado_nombre, new.bien_tipo, new.bien_monto, new.bien_descripcion,
        new.tipo, new.detalle, new.pedido)
       is distinct from
       (old.id, old.anio, old.numero, old.creada_en, old.marca, old.cuenta_web_id, old.proveedor_razon_social, old.proveedor_ruc,
        old.proveedor_domicilio, old.ubicacion_id, old.ubicacion_nombre, old.ubicacion_direccion, old.consumidor_nombre,
        old.consumidor_tipo_documento, old.consumidor_documento, old.consumidor_domicilio, old.consumidor_telefono,
        old.consumidor_correo, old.menor_de_edad, old.apoderado_nombre, old.bien_tipo, old.bien_monto, old.bien_descripcion,
        old.tipo, old.detalle, old.pedido) then
      raise exception 'Lo escrito en una hoja del Libro de Reclamaciones no cambia.' using errcode = '42501';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;
revoke all on function retail.fn_hojas_reclamacion_reglas() from public, anon, authenticated;

create or replace trigger hojas_reclamacion_reglas
  before update or delete on retail.hojas_reclamacion
  for each row execute function retail.fn_hojas_reclamacion_reglas();

-- ---------- 4. Los datos de CAYLA para la hoja ----------
create or replace function retail.tienda_libro_reclamaciones_datos()
returns jsonb
language sql
stable
security definer
set search_path = retail, public
as $$
  -- Sin la fila de configuracion_empresa (una base nueva), los mismos datos de respaldo que imprime la boleta (apps/web/lib/emisor.ts):
  -- un hueco de configuración no le quita al cliente su derecho a reclamar.
  select jsonb_build_object(
    'razon_social', coalesce((select nullif(btrim(e.razon_social), '') from retail.configuracion_empresa e where e.id), 'CAYLA S.A.C.'),
    'ruc', coalesce((select nullif(btrim(e.ruc), '') from retail.configuracion_empresa e where e.id), '20605964550'),
    'domicilio', retail.fn_libro_reclamaciones_domicilio())
$$;
comment on function retail.tienda_libro_reclamaciones_datos() is
  'Tienda online, Libro de Reclamaciones (ADR-0679): los datos de CAYLA que la hoja muestra antes de llenarla {razon_social, ruc, domicilio}. Solo la llama tienda_web.';

-- ---------- 5. Guardar la hoja ----------
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
    menor_de_edad, apoderado_nombre, bien_tipo, bien_monto, bien_descripcion, tipo, detalle, pedido)
  values (
    v_anio, v_numero, p_marca, v_cuenta, v_razon, v_ruc, retail.fn_libro_reclamaciones_domicilio(),
    v_ubicacion, v_ubicacion_nombre, v_ubicacion_direccion,
    v_nombre, v_tipo_doc, v_doc, v_domicilio, v_telefono, v_correo,
    v_menor, v_apoderado, v_bien_tipo, v_monto, v_descripcion, v_tipo, v_detalle, v_pedido)
  returning id into v_id;

  return jsonb_build_object('estado', 'registrada', 'id', v_id, 'repetida', false,
                            'codigo', lpad(v_numero::text, 6, '0') || '-' || v_anio::text);
end;
$$;
comment on function retail.tienda_registrar_hoja_reclamacion(jsonb, uuid, text, uuid) is
  'Tienda online, Libro de Reclamaciones (ADR-0679): guarda una hoja. datos: {tipo, nombre, tipo_documento, documento, domicilio, telefono, correo, menor_de_edad, apoderado, bien_tipo, monto, bien_descripcion, detalle, pedido, ubicacion_id}. No pide cuenta (con sesión, la liga). {estado: registrada (id, codigo, repetida) | invalido (campo) | limite}. Número correlativo por año sin saltos; 5 por hora por huella de ip; la misma marca devuelve la misma hoja. No lanza errores de negocio. Solo la llama tienda_web.';

-- ---------- 6. La constancia ----------
create or replace function retail.tienda_ver_hoja_reclamacion(p_id uuid, p_marca uuid)
returns jsonb
language sql
stable
security definer
set search_path = retail, public
as $$
  select jsonb_build_object(
    'id', h.id, 'codigo', h.codigo, 'creada_en', h.creada_en,
    'proveedor', jsonb_build_object('razon_social', h.proveedor_razon_social, 'ruc', h.proveedor_ruc, 'domicilio', h.proveedor_domicilio),
    'tienda', case when h.ubicacion_id is null then null
                   else jsonb_build_object('nombre', h.ubicacion_nombre, 'direccion', h.ubicacion_direccion) end,
    'consumidor', jsonb_build_object(
      'nombre', h.consumidor_nombre, 'tipo_documento', h.consumidor_tipo_documento, 'documento', h.consumidor_documento,
      'domicilio', h.consumidor_domicilio, 'telefono', h.consumidor_telefono, 'correo', h.consumidor_correo,
      'menor_de_edad', h.menor_de_edad, 'apoderado', h.apoderado_nombre),
    'bien', jsonb_build_object('tipo', h.bien_tipo, 'monto', h.bien_monto, 'descripcion', h.bien_descripcion),
    'tipo', h.tipo, 'detalle', h.detalle, 'pedido', h.pedido)
    from retail.hojas_reclamacion h
   where p_id is not null and p_marca is not null and h.id = p_id and h.marca = p_marca
$$;
comment on function retail.tienda_ver_hoja_reclamacion(uuid, uuid) is
  'Tienda online, Libro de Reclamaciones (ADR-0679): la hoja completa para la constancia que el cliente ve e imprime. Pide el id y la marca (el id solo no basta para leer los datos de otra persona); null si no coinciden. Solo la llama tienda_web.';

-- ---------- 7. Permisos ----------
revoke all on function retail.fn_libro_reclamaciones_domicilio() from public, anon, authenticated;
revoke all on function retail.tienda_libro_reclamaciones_datos() from public, anon, authenticated;
revoke all on function retail.tienda_registrar_hoja_reclamacion(jsonb, uuid, text, uuid) from public, anon, authenticated;
revoke all on function retail.tienda_ver_hoja_reclamacion(uuid, uuid) from public, anon, authenticated;
grant execute on function retail.tienda_libro_reclamaciones_datos() to tienda_web;
grant execute on function retail.tienda_registrar_hoja_reclamacion(jsonb, uuid, text, uuid) to tienda_web;
grant execute on function retail.tienda_ver_hoja_reclamacion(uuid, uuid) to tienda_web;
