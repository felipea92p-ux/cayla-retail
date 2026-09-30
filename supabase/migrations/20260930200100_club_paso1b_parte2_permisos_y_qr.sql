-- ============================================================================
-- 20260930200100_club_paso1b_parte2_permisos_y_qr.sql — CAYLA V2 · Club de clientas · paso 1, tanda 1b
-- ADR-0288 (D-4 reescrita, «Actualización 2026-09-30» y «Contrato de la tanda 1b»). DOS PARTES, sin políticas ni
-- `drop trigger` (CLAUDE.md, «Políticas y deadlocks»).
--
-- EL PROBLEMA. La clienta tenía un solo permiso, `whatsapp_consentimiento_en`, que la asesora marcaba en caja con un
-- interruptor. La Ley 32323 (9-may-2025, art. 58.1.e del Código del Consumidor) solo deja mandar publicidad a quien «por
-- iniciativa propia» le escribe a la empresa: un «sí» de palabra en caja no alcanza para las novedades y las rebajas, y
-- nada impedía marcarlo igual. Y no había club: ni desde cuándo es socia, ni un código para reconocer el mensaje que
-- llega por WhatsApp, ni el número de la tienda para armar el QR.
--
-- QUÉ HACE
--   PARTE 1 (ubicaciones, sola): `ubicaciones.whatsapp_numero`, el celular de cada tienda (9 dígitos que empiezan en 9).
--     Sin número no hay QR y el club sigue sin publicidad.
--   PARTE 2 (lo demás):
--   1. `clientas` suma `club_desde`, `publicidad_desde`, `codigo_club` (C-0001, correlativo, único) y `cumple_anio`, con
--      sus candados: socia ⇒ celular válido, documento y nombre (CL-1); publicidad ⇒ socia; código ⇔ socia; anonimizada
--      ⇒ sin nada de eso.
--   2. `club_textos` (versionados, nunca se editan): el texto que lee la asesora y los dos mensajes que ELLA envía. Se
--      siembran los v2 de la «Actualización 2026-09-30» (el v1 nunca se sembró).
--   3. `club_permisos`, de solo agregar (un disparador rechaza update, delete y truncate, también a `postgres`): cada
--      «sí», cada mensaje suyo, cada BAJA y cada cambio de celular que le quitó la publicidad (medio `cambio_celular`). El
--      candado de la ley está en el esquema: una publicidad que se otorga exige el medio `whatsapp_propio`. `club_desde` y
--      `publicidad_desde` son la foto que la misma transacción deriva de ahí.
--   4. Funciones nuevas: `unirse_al_club`, `registrar_mensaje_publicidad` («Llegó su mensaje»), `registrar_desde_whatsapp`
--      (el cartel), `registrar_baja_whatsapp`, `resumen_clienta_caja`, `fn_club_textos_vigentes` y
--      `guardar_whatsapp_tienda`.
--   5. `registrar_clienta` y `editar_clienta` pierden `p_acepta_whatsapp`/`p_revoca_whatsapp` y ganan `p_cumple_anio`
--      (se suelta la firma vieja y se crea la nueva: un `create or replace` con otros parámetros crea una sobrecarga).
--      No dan ningún permiso. A una socia no se le puede borrar el celular (`socia_sin_celular`), el documento ni el
--      nombre (`socia_sin_documento`); el celular sí se le cambia, y si tenía publicidad se le quita en la misma
--      transacción (evento `revoca`, medio `cambio_celular`, con quien lo registra): sigue socia y la recupera cuando
--      escriba desde el número nuevo («Llegó su mensaje»).
--   5b. El disparador `clientas_celular_con_publicidad` lo hace imposible por cualquier otro camino: el celular de una
--      ficha que tenía publicidad y la conserva solo cambia si en esa misma transacción quedó registrado que ella escribió
--      desde el número nuevo (un `otorga` por `whatsapp_propio`: «Llegó su mensaje» o el cartel). Si no, `celular_con_publicidad`.
--   6. `archivar_clienta` al anonimizar escribe primero los `revoca` (medio `anonimizar`) y después vacía el club;
--      `unir_clientas` pasa a la que queda el club y la publicidad más antiguos y el código si no tenía; `buscar_clienta`
--      encuentra también por el código de socia y por el celular escrito con espacios o con +51.
--   7. Legado: las fichas con `whatsapp_consentimiento_en` pasan a socias SIN publicidad (evento `club`/`legado`), solo
--      si tienen un celular válido, documento y nombre. Producción tenía 0 el 2026-09-30; imprime cuántas tocó y cuántas
--      quedaron fuera (y por qué).
--
-- AJUSTES AL CONTRATO (Felipe como arquitecto, 2026-09-30, a pedido de Cobrar):
--   a. `fn_club_textos_vigentes` no exige el módulo «Clientas» (ver DECIDÍ abajo).
--   b. CL-1: para ser socia, la ficha necesita documento y nombre además del celular. `unirse_al_club` y
--      `registrar_desde_whatsapp` rechazan con `socia_sin_documento`, y el esquema lo hace imposible
--      (`clientas_socia_con_documento_y_nombre`). El legado sin documento o sin nombre no pasa a socia.
--   c. `unirse_al_club` suma `p_texto_version integer default null` al final: la versión del texto `club` que la asesora
--      leyó. Si ya no es la vigente, rechaza con `club_texto_cambio`; null = la vigente. El evento cita lo que ella oyó.
--   d. (el arquitecto, 2026-09-30, a pedido de Felipe, que quiere poder cambiar el celular; Felipe puede revertirla) El
--      celular de una socia se cambia siempre; si tenía publicidad, el cambio se la quita (medio `cambio_celular`).
--
-- DECIDÍ: el celular de una socia se guarda normalizado (9 dígitos, sin espacios ni +51) y todo celular que entra por una
--   función se valida igual (hint `celular_invalido`): la BAJA busca por número, y «987 654 321» y «987654321» tienen que
--   ser la misma clienta. El de la tienda, igual (hint `whatsapp_tienda_invalido`).
-- DECIDÍ: el evento NO guarda el teléfono. Anonimizar tiene que poder borrar a la clienta (Ley 29733) y un registro de
--   solo agregar no se edita: la prueba del número es el chat de la tienda.
-- DECIDÍ: `fn_club_textos_vigentes` no exige el módulo «Clientas»: son los textos públicos del cartel del mostrador, y el
--   ticket de una venta SIN clienta lleva el QR genérico aunque quien vende no tenga el módulo. No devuelve nada de
--   ninguna clienta.
-- DECIDÍ: los ayudantes (`fn_celular_normalizado`, `fn_exigir_celular`, `fn_codigo_club_normalizado`,
--   `fn_club_codigo_nuevo`, `fn_club_quitar_publicidad_por_celular`) no son `security definer` ni los ejecuta la API:
--   corren con los permisos de la función que los llama.
-- DECIDÍ (ajuste d): la publicidad es del NÚMERO, no de la persona: la prueba es el chat desde ese número, y el nuevo no
--   tiene prueba. Cambiar el celular de una socia con publicidad se la quita en la misma transacción, con su evento
--   (`fn_club_quitar_publicidad_por_celular`, un solo lugar: evento, foto y actividad); «Llegó su mensaje» y el cartel
--   cambian el celular AL número desde el que ella escribió y por eso la conservan. `unir_clientas` no cambia el celular
--   de la que queda si esta tenía publicidad (el celular sigue al permiso), así que no necesita nada.
-- DECIDÍ: el disparador mira la HISTORIA, no una marca: deja pasar el cambio si esta transacción registró su mensaje
--   (`club_permisos` con `created_at = now()`, que es la hora de la transacción). Es la condición de la ley escrita en el
--   esquema, y cierra la carrera de `registrar_clienta`: si el cartel crea la misma ficha a la vez con otro celular, el
--   upsert cae sobre una ficha con publicidad que no vio y el disparador lo rechaza en vez de dejarla en un número sin prueba.
-- DESCARTÉ: no dejar cambiar el celular a una socia con publicidad (Felipe quiere poder cambiarlo); conservarle la
--   publicidad al cambiarlo (quedaría en un número que no la pidió); una marca de transacción (`set_config`) que solo
--   pusieran las funciones «legítimas» (es una promesa de la función: cualquiera la pone sin el mensaje de ella, y hay que
--   acordarse de quitarla); cuidarlo solo en las funciones (la carrera de arriba y cualquier función futura quedarían sin
--   candado); un booleano `es_socia` (no dice desde cuándo, y el aniversario lo necesita); guardar el teléfono en el
--   evento (ver arriba); dejar que la ficha o la caja marquen la publicidad «de palabra» (es justo lo que la ley no deja).
-- SE ROMPE SI: una función nueva escribe `club_desde` o `publicidad_desde` sin su evento en `club_permisos` (la foto deja
--   de salir de la historia), o alguien reescribe `registrar_clienta`/`editar_clienta` con un parámetro que vuelva a dar
--   la publicidad. Una función nueva que cambie el celular de una ficha con publicidad sin llamar antes a
--   `fn_club_quitar_publicidad_por_celular` (ni registrar el mensaje de ella) no se rompe en silencio: la base la rechaza
--   con `celular_con_publicidad`. Límite conocido: DENTRO de una transacción que ya registró su mensaje, el disparador deja
--   pasar otro cambio de celular de esa ficha; por la API cada llamada es su propia transacción. Lo vigila
--   scripts/pruebas/club_permisos.mjs (sección n).
--
-- CANDADO DE VERSIÓN. Antes de tocar nada, la sección 0 compara el md5 NORMALIZADO (sin comentarios ni espacios) del
-- cuerpo vivo de las funciones que reescribe con el de producción el 2026-09-30 (el «después» de la tanda 1a, que está en
-- producción) o con el de después de este archivo. Con cualquier otro, aborta sin tocar nada.
--
-- CÓMO SE PEGA EN PRODUCCIÓN — DOS ARCHIVOS, CADA UNO SOLO EN EL SQL EDITOR, EN ORDEN (el SQL Editor corre todo lo pegado
-- en UNA transacción):
--   · PARTE 1 = 20260930200000_club_paso1b_parte1_whatsapp_tienda.sql: solo `ubicaciones`. Va sola porque toda venta lee
--     `ubicaciones`: tomada en exclusiva en la misma transacción que `clientas`, una venta con clienta a medio camino las
--     esperaría en el orden contrario (deadlock).
--   · PARTE 2 = 20260930200100_club_paso1b_parte2_permisos_y_qr.sql (este archivo): lo demás. Toma `clientas` primero y recién después crea las tablas nuevas
--     (sus llaves foráneas toman `ventas`, `ubicaciones` y `personas` en modo compartido): así una venta que ya leyó su
--     ficha termina antes, y ninguna queda esperando algo que esta parte tenga.
--   Cada parte espera como mucho 3 s un candado (`lock_timeout`): si la tienda está usando esa tabla, falla limpio y se
--   vuelve a pegar ESA parte. Las dos se pueden pegar dos veces (idempotentes). En local y en el CI corren seguidas, como dos migraciones.
--   Fusionar el PR de la web DESPUÉS de pegar las dos: la web nueva llama las funciones nuevas. Entre el pegado y el
--   despliegue, la pantalla vieja no puede registrar ni editar fichas (llama con `p_acepta_whatsapp`); vender, buscar y
--   leer funcionan igual.
--
-- VERIFICACIÓN (solo lectura, después de pegar las dos partes):
--   select p.oid::regprocedure, md5(regexp_replace(regexp_replace(regexp_replace(p.prosrc, '/\*.*?\*/', '', 'g'),
--          '--[^' || chr(10) || ']*', '', 'g'), '\s+', '', 'g'))
--     from pg_proc p
--    where p.pronamespace = 'retail'::regnamespace
--      and p.proname in ('registrar_clienta', 'editar_clienta', 'buscar_clienta', 'archivar_clienta', 'unir_clientas')
--    order by 1;
--   → exactamente 5 filas, cada una con su md5 «después» de la sección 0 (una sola firma de registrar y de editar); y
--   select count(*) from retail.club_textos where version = 2;   → 3
--   select count(*) from pg_trigger where tgrelid = 'retail.clientas'::regclass and tgname = 'clientas_celular_con_publicidad';   → 1
--   select pg_get_constraintdef(oid) ~ 'cambio_celular' from pg_constraint where conname = 'club_permisos_medio_valido';   → t
--
-- CONCURRENCIA. Dos cajas invitan a la misma clienta a la vez: `unirse_al_club` toma la ficha con `for update`; la
-- segunda espera, la encuentra socia y devuelve el mismo código sin otro evento. Lo mismo «Llegó su mensaje», el cartel y
-- la BAJA (esta toma sus fichas en orden de id, para que dos BAJAs a la vez no se crucen), y el cambio de celular:
-- `editar_clienta` y `registrar_clienta` deciden si quitar la publicidad con la ficha ya tomada. El código sale de una
-- secuencia: dos socias nuevas a la vez nunca comparten número (y el único de `codigo_club` lo garantiza igual).
-- CAÍDA EXTERNA. Nada de esto llama a WhatsApp, al padrón ni a Lucode: la asesora mira el chat de la tienda y lo registra.
-- Sin número de la tienda no hay QR; sin texto vigente, la base rechaza con `club_sin_texto` y la caja no ofrece «Invitar».
-- ============================================================================

-- ============================== PARTE 2 · el club (lo demás) ==============================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 0. candado de versión ----------
do $guarda$
declare
  r record;
  v_md5 text;
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'retail' and table_name = 'ubicaciones' and column_name = 'whatsapp_numero') then
    raise exception 'Falta la PARTE 1 de esta migración (ubicaciones.whatsapp_numero): pégala antes que esta.';
  end if;
  for r in
    select * from (values
      -- firma                                                                                     antes (producción, = «después» de la 1a)   despues (este archivo)
      ('retail.registrar_clienta(text,text,text,text,boolean,smallint,smallint)',                  '08af40374c65d9aebf1e266783bd65d1', null),
      ('retail.editar_clienta(uuid,text,text,text,text,boolean,boolean,smallint,smallint,jsonb,integer)', '6978f91f9bdad2461223545be2a65c4d', null),
      ('retail.buscar_clienta(text,boolean)',                                                      '398706b77a9fdc51f70eec76a0cc23ae', 'ef22a7c5fd32697698ef260f8ff53586'),
      ('retail.archivar_clienta(uuid,text,boolean,integer)',                                       'a3fa06de786fb5adcfc511e0eb66ec37', '5999f3545b05cbd9b3084e8d3a10e262'),
      ('retail.unir_clientas(uuid,uuid,integer,integer)',                                          '39a5f804607137727b9b396dfa168995', '03fcb1c598de56c8a05b6ef904e0450e'),
      ('retail.registrar_clienta(text,text,text,text,smallint,smallint,smallint)',                 null,                               '88228c6b292c078ef462fa7c7f11e8fe'),
      ('retail.editar_clienta(uuid,text,text,text,text,smallint,smallint,smallint,jsonb,integer)',   null,                               'e00a9edb0e8781417504abb7c361a226')
    ) as t(firma, antes, despues)
  loop
    select md5(regexp_replace(regexp_replace(regexp_replace(p.prosrc, '/\*.*?\*/', '', 'g'), '--[^' || chr(10) || ']*', '', 'g'), '\s+', '', 'g'))
      into v_md5
      from pg_proc p
     where p.oid = to_regprocedure(r.firma);
    if v_md5 is null then
      -- Que no exista es «después» para las dos firmas viejas (este archivo las suelta) y «antes» para las dos nuevas.
      if r.antes is not null and r.despues is not null then
        raise exception '% no existe en esta base: pega antes la tanda 1a del club (20260930160000).', r.firma;
      end if;
    elsif v_md5 is distinct from r.antes and v_md5 is distinct from r.despues then
      raise exception '% cambió desde que se escribió esta migración (md5 normalizado %; se esperaba % —antes— o % —después—). No se reemplaza a ciegas: lee su definición viva y rehace este cambio sobre ESA versión.',
        r.firma, v_md5, coalesce(r.antes, 'que no exista'), coalesce(r.despues, 'que ya no exista');
    end if;
  end loop;
end
$guarda$;

-- ---------- 1. la ficha: socia, publicidad, código y año de nacimiento ----------
-- `clientas` va PRIMERO (ver «Cómo se pega»): el resto de esta parte no toma nada que una venta tenga a medias.
alter table retail.clientas add column if not exists club_desde timestamptz;
alter table retail.clientas add column if not exists publicidad_desde timestamptz;
alter table retail.clientas add column if not exists codigo_club text;
alter table retail.clientas add column if not exists cumple_anio smallint;

comment on column retail.clientas.club_desde is
  'Socia del club desde (su «sí» de palabra en caja o en la ficha, o su mensaje por WhatsApp). Foto derivada de club_permisos en la misma transacción (ADR-0288 D-4). Null = no es socia.';
comment on column retail.clientas.publicidad_desde is
  'Con permiso de publicidad por WhatsApp desde: SOLO nace de un mensaje que ella escribió a la tienda (Ley 32323; club_permisos, medio whatsapp_propio). Es del número: si su celular cambia, se pierde (medio cambio_celular) y vuelve cuando escriba desde el nuevo. Null = sin publicidad (sí avisos informativos si es socia).';
comment on column retail.clientas.codigo_club is
  'Su código de socia (C-0001, correlativo y único): va en su QR y en el mensaje que envía, y es lo que la asesora busca cuando llega. Existe si y solo si es socia.';
comment on column retail.clientas.cumple_anio is
  'Año de nacimiento, opcional (CL-3). El cumpleaños del club usa solo cumple_dia y cumple_mes.';
comment on column retail.clientas.whatsapp_consentimiento_en is
  'LEGADO (ADR-0154): el permiso marcado en caja antes de ADR-0288. Sin escrituras nuevas desde la tanda 1b: el club es club_desde y la publicidad, publicidad_desde. Se retira cuando ninguna lectura lo use.';

create sequence if not exists retail.clientas_codigo_club_seq;
revoke all on sequence retail.clientas_codigo_club_seq from public, anon, authenticated;

create unique index if not exists clientas_codigo_club_unico on retail.clientas (codigo_club);

alter table retail.clientas drop constraint if exists clientas_codigo_club_formato;
alter table retail.clientas add constraint clientas_codigo_club_formato
  check (codigo_club is null or codigo_club ~ '^C-[0-9]{4,}$');

alter table retail.clientas drop constraint if exists clientas_socia_con_celular;
-- `is not null` explícito: con un celular null el `~` da null, y un check que da null PASA.
alter table retail.clientas add constraint clientas_socia_con_celular
  check (club_desde is null or (telefono_whatsapp is not null and telefono_whatsapp ~ '^9[0-9]{8}$'));

-- CL-1: para ser socia, documento + celular + nombre (el celular, en el candado de arriba).
alter table retail.clientas drop constraint if exists clientas_socia_con_documento_y_nombre;
alter table retail.clientas add constraint clientas_socia_con_documento_y_nombre
  check (club_desde is null or (documento_numero is not null and nullif(btrim(nombre), '') is not null));

alter table retail.clientas drop constraint if exists clientas_publicidad_exige_club;
alter table retail.clientas add constraint clientas_publicidad_exige_club
  check (publicidad_desde is null or club_desde is not null);

alter table retail.clientas drop constraint if exists clientas_codigo_si_y_solo_si_club;
alter table retail.clientas add constraint clientas_codigo_si_y_solo_si_club
  check ((codigo_club is null) = (club_desde is null));

alter table retail.clientas drop constraint if exists clientas_cumple_anio_valido;
alter table retail.clientas add constraint clientas_cumple_anio_valido
  check (cumple_anio is null or cumple_anio between 1900 and 2100);

alter table retail.clientas drop constraint if exists clientas_anonimizada_sin_club;
alter table retail.clientas add constraint clientas_anonimizada_sin_club
  check (not anonimizada or (club_desde is null and publicidad_desde is null and codigo_club is null and cumple_anio is null));

-- ---------- 2. los textos del club (versionados: nunca se editan) ----------
create table if not exists retail.club_textos (
  tipo          text not null,
  version       integer not null,
  texto         text not null,
  vigente_desde timestamptz not null default now(),
  creado_por    uuid references public.personas (id),
  constraint club_textos_pkey primary key (tipo, version),
  constraint club_textos_tipo_valido check (tipo in ('club', 'mensaje_personal', 'mensaje_generico')),
  constraint club_textos_version_positiva check (version >= 1),
  constraint club_textos_no_vacio check (btrim(texto) <> ''),
  constraint club_textos_personal_con_codigo check (tipo <> 'mensaje_personal' or position('{codigo}' in texto) > 0)
);
comment on table retail.club_textos is
  'Los textos del club (ADR-0288): club = lo que la asesora le lee al invitarla; mensaje_personal = lo que ELLA envía desde su QR ({codigo} = su código); mensaje_generico = lo que envía desde el cartel o un ticket sin clienta. El vigente de cada tipo es su versión más alta. Nunca se editan ni se borran: hay permisos que citan cada versión.';

-- ---------- 3. los permisos: la historia, de solo agregar ----------
create table if not exists retail.club_permisos (
  id             uuid primary key default gen_random_uuid(),
  clienta_id     uuid not null references retail.clientas (id),
  finalidad      text not null,
  accion         text not null,
  medio          text not null,
  texto_tipo     text,
  texto_version  integer,
  ubicacion_id   uuid references retail.ubicaciones (id),
  venta_id       uuid references retail.ventas (id),
  registrado_por uuid references public.personas (id),
  nota           text,
  created_at     timestamptz not null default now(),
  constraint club_permisos_finalidad_valida check (finalidad in ('club', 'publicidad_whatsapp')),
  constraint club_permisos_accion_valida check (accion in ('otorga', 'revoca')),
  -- (los medios y lo que puede cada uno, abajo: fuera del `create table`, para que pegar otra vez los rehaga)
  -- La ley (Ley 32323, art. 58.1.e): la publicidad SOLO nace de un mensaje que ella escribió. Nadie la marca de palabra.
  constraint club_permisos_publicidad_solo_por_su_mensaje
    check (not (finalidad = 'publicidad_whatsapp' and accion = 'otorga') or medio = 'whatsapp_propio'),
  constraint club_permisos_otorga_con_texto check (accion <> 'otorga' or medio = 'legado' or texto_version is not null),
  constraint club_permisos_texto_completo check ((texto_tipo is null) = (texto_version is null)),
  constraint club_permisos_texto_del_medio check (
       texto_tipo is null
    or (medio in ('caja_palabra', 'ficha') and texto_tipo = 'club')
    or (medio = 'whatsapp_propio' and texto_tipo in ('mensaje_personal', 'mensaje_generico'))
  ),
  constraint club_permisos_con_quien_registra check (medio = 'legado' or registrado_por is not null),
  constraint club_permisos_legado_con_nota check (medio <> 'legado' or nullif(btrim(nota), '') is not null),
  constraint club_permisos_texto_existe foreign key (texto_tipo, texto_version) references retail.club_textos (tipo, version)
);
comment on table retail.club_permisos is
  'La historia de los dos permisos del club (ADR-0288 D-4): club (su «sí») y publicidad por WhatsApp (solo si ella escribió). De solo agregar, como movimientos: un disparador rechaza update, delete y truncate. Sin teléfono: anonimizar tiene que poder borrar a la clienta, y la prueba del número es el chat de la tienda (por eso un cambio de celular quita la publicidad: medio cambio_celular). clientas.club_desde y publicidad_desde son su foto. Los eventos de una ficha unida se quedan con ella (clientas_fusiones lleva a la que quedó).';

-- Cada medio, con lo que puede hacer: el «sí» de palabra solo da el club; la BAJA y el cambio de celular solo quitan
-- publicidad; anonimizar solo quita; el legado solo es el club marcado en caja antes de este archivo. Fuera del `create
-- table` (drop + add, como los candados de `clientas`): pegar otra vez rehace la versión de este archivo.
alter table retail.club_permisos drop constraint if exists club_permisos_medio_valido;
alter table retail.club_permisos add constraint club_permisos_medio_valido
  check (medio in ('caja_palabra', 'ficha', 'whatsapp_propio', 'baja_whatsapp', 'cambio_celular', 'anonimizar', 'legado'));
alter table retail.club_permisos drop constraint if exists club_permisos_medio_coherente;
alter table retail.club_permisos add constraint club_permisos_medio_coherente check (
     (medio in ('caja_palabra', 'ficha') and finalidad = 'club' and accion = 'otorga')
  or (medio = 'whatsapp_propio' and accion = 'otorga')
  or (medio in ('baja_whatsapp', 'cambio_celular') and finalidad = 'publicidad_whatsapp' and accion = 'revoca')
  or (medio = 'anonimizar' and accion = 'revoca')
  or (medio = 'legado' and finalidad = 'club' and accion = 'otorga')
);

create index if not exists club_permisos_clienta_idx on retail.club_permisos (clienta_id, created_at);

-- ---------- 4. solo agregar: ni update, ni delete, ni truncate (tampoco postgres) ----------
create or replace function retail.fn_club_solo_agregar()
returns trigger
language plpgsql
set search_path = retail, public, extensions
as $$
begin
  if tg_table_name = 'club_textos' then
    raise exception 'Un texto del club no se edita ni se borra: hay permisos que lo citan. Crea una versión nueva.'
      using errcode = 'P0001', hint = 'club_solo_agregar';
  end if;
  raise exception 'La historia del club solo se agrega: un permiso no se edita ni se borra. Si algo cambió, se registra un evento nuevo.'
    using errcode = 'P0001', hint = 'club_solo_agregar';
end;
$$;
revoke all on function retail.fn_club_solo_agregar() from public, anon, authenticated;

create or replace trigger club_permisos_solo_agregar before update or delete on retail.club_permisos
  for each row execute function retail.fn_club_solo_agregar();
create or replace trigger club_permisos_sin_truncate before truncate on retail.club_permisos
  for each statement execute function retail.fn_club_solo_agregar();
create or replace trigger club_textos_solo_agregar before update or delete on retail.club_textos
  for each row execute function retail.fn_club_solo_agregar();
create or replace trigger club_textos_sin_truncate before truncate on retail.club_textos
  for each statement execute function retail.fn_club_solo_agregar();

-- RLS encendido y SIN políticas: solo las leen y escriben funciones security definer. Y sin permisos para la API.
alter table retail.club_textos enable row level security;
alter table retail.club_permisos enable row level security;
revoke all on retail.club_textos, retail.club_permisos from public, anon, authenticated;
revoke update, delete, truncate on retail.club_textos, retail.club_permisos from service_role;

-- ---------- 5. los textos v2 (Actualización 2026-09-30 del ADR). El v1 nunca se sembró. ----------
insert into retail.club_textos (tipo, version, texto, creado_por) values
  ('club', 2,
   'Te unes al Club CAYLA: guardamos tu nombre, documento, celular y cumpleaños para tus beneficios y para avisarte por WhatsApp de tus apartados y de las tallas que nos pidas. Puedes salir cuando quieras.',
   null),
  ('mensaje_personal', 2,
   'Hola CAYLA, quiero recibir por WhatsApp novedades, rebajas y mi saludo de cumpleaños. Sé que me doy de baja escribiendo BAJA. (Club {codigo})',
   null),
  ('mensaje_generico', 2,
   'Hola CAYLA, quiero unirme al Club CAYLA y recibir por WhatsApp novedades, rebajas y mi saludo de cumpleaños. Sé que me doy de baja escribiendo BAJA.',
   null)
on conflict (tipo, version) do nothing;

-- ---------- 6. ayudantes (internos: sin EXECUTE para la API, sin security definer) ----------
-- PROMETE: el celular solo con dígitos, sin el 51 de Perú delante («+51 987 654 321» → «987654321»), o null si no trae
--   ningún dígito. No valida: eso es fn_exigir_celular.
create or replace function retail.fn_celular_normalizado(p_numero text)
returns text
language plpgsql
immutable
set search_path = retail, public, extensions
as $$
declare
  v_digitos text := nullif(regexp_replace(coalesce(p_numero, ''), '[^0-9]', '', 'g'), '');
begin
  if v_digitos is not null and length(v_digitos) = 11 and left(v_digitos, 2) = '51' then
    return substr(v_digitos, 3);
  end if;
  return v_digitos;
end;
$$;

-- PROMETE: el celular normalizado si es un celular peruano (9 dígitos que empiezan en 9); si viene vacío, null (o, si
--   es obligatorio, el mismo rechazo). Un solo lugar para el mensaje y el hint `celular_invalido`.
create or replace function retail.fn_exigir_celular(p_numero text, p_obligatorio boolean default true)
returns text
language plpgsql
immutable
set search_path = retail, public, extensions
as $$
declare
  v_celular text := retail.fn_celular_normalizado(p_numero);
begin
  if nullif(btrim(coalesce(p_numero, '')), '') is null and not p_obligatorio then
    return null;
  end if;
  if v_celular is null or v_celular !~ '^9[0-9]{8}$' then
    raise exception 'El celular tiene 9 dígitos y empieza en 9 (por ejemplo, 987 654 321).'
      using errcode = '22023', hint = 'celular_invalido';
  end if;
  return v_celular;
end;
$$;

-- PROMETE: el código de socia que trae un texto, escrito como lo guarda la base: «club c-142», «(Club C-0142)» o «C0142»
--   → «C-0142». Null si no trae ninguno. La misma regla que `codigoEnTexto` de apps/web/lib/club-reglas.ts.
create or replace function retail.fn_codigo_club_normalizado(p_texto text)
returns text
language plpgsql
immutable
set search_path = retail, public, extensions
as $$
declare
  v_digitos text := substring(upper(coalesce(p_texto, '')) from '\mC-?\s?([0-9]{1,6})\M');
  v_n bigint;
begin
  if v_digitos is null then
    return null;
  end if;
  v_n := v_digitos::bigint;
  return 'C-' || lpad(v_n::text, greatest(4, length(v_n::text)), '0');
end;
$$;

-- PROMETE: el próximo código de socia (C-0001, C-0002…; después de C-9999, C-10000). Nunca se repite: sale de una
--   secuencia, y el único de `codigo_club` lo cierra igual.
create or replace function retail.fn_club_codigo_nuevo()
returns text
language plpgsql
volatile
set search_path = retail, public, extensions
as $$
declare
  v_n bigint := nextval('retail.clientas_codigo_club_seq');
begin
  return 'C-' || lpad(v_n::text, greatest(4, length(v_n::text)), '0');
end;
$$;

-- PROMETE: le quita la publicidad a una ficha porque su celular cambia (la prueba era el chat desde el número de antes; el
--   nuevo no tiene prueba). En la misma transacción: la foto (`publicidad_desde = null`), el evento `revoca` con medio
--   `cambio_celular` y quien lo registra, y la actividad. Sigue socia. Si ya no tenía publicidad, no hace nada. Quien la
--   llama ya tiene la ficha tomada (`for update`), decidió que el celular cambia, y lo cambia DESPUÉS de llamarla (el
--   disparador clientas_celular_con_publicidad no deja hacerlo antes). Sin responsable → `responsable_requerido`.
create or replace function retail.fn_club_quitar_publicidad_por_celular(p_clienta_id uuid, p_persona uuid)
returns void
language plpgsql
volatile
set search_path = retail, public, extensions
as $$
begin
  if p_persona is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  update retail.clientas set publicidad_desde = null where id = p_clienta_id and publicidad_desde is not null;
  if not found then
    return;
  end if;
  insert into retail.club_permisos (clienta_id, finalidad, accion, medio, registrado_por)
  values (p_clienta_id, 'publicidad_whatsapp', 'revoca', 'cambio_celular', p_persona);
  perform retail.fn_actividad_anotar(
    'clientas', 'publicidad_cambio_celular', 'quitó la publicidad por WhatsApp de una clienta porque cambió su celular',
    p_persona, null, null, null, 'clientas', p_clienta_id::text, now(), '{}'::jsonb, 'vivo'
  );
end;
$$;

-- PROMETE (disparador): el celular de una ficha que tenía publicidad y la conserva solo cambia si esta misma transacción
--   registró que ella escribió desde el número nuevo: un `otorga` de publicidad por `whatsapp_propio` («Llegó su mensaje»
--   o el cartel), con `created_at = now()` (la hora de la transacción). Si no, `celular_con_publicidad`: el camino es
--   quitarle la publicidad en la misma operación (fn_club_quitar_publicidad_por_celular, lo que hacen la ficha y el alta).
--   El `when` del disparador deja pasar sin llamarla todo lo demás (quitar la publicidad y cambiar el celular a la vez,
--   anonimizar, una ficha sin publicidad).
create or replace function retail.fn_club_celular_con_publicidad()
returns trigger
language plpgsql
set search_path = retail, public, extensions
as $$
begin
  if exists (select 1 from retail.club_permisos p
              where p.clienta_id = new.id
                and p.finalidad = 'publicidad_whatsapp' and p.accion = 'otorga' and p.medio = 'whatsapp_propio'
                and p.created_at = now()) then
    return new;
  end if;
  raise exception 'Esta socia tiene publicidad por WhatsApp en su celular de ahora: al cambiárselo se le quita (se hace desde su ficha) y la recupera cuando escriba desde el número nuevo.'
    using errcode = 'P0001', hint = 'celular_con_publicidad';
end;
$$;

revoke all on function
  retail.fn_celular_normalizado(text),
  retail.fn_exigir_celular(text, boolean),
  retail.fn_codigo_club_normalizado(text),
  retail.fn_club_codigo_nuevo(),
  retail.fn_club_quitar_publicidad_por_celular(uuid, uuid),
  retail.fn_club_celular_con_publicidad()
from public, anon, authenticated;

-- `clientas` ya está tomada en exclusiva desde la sección 1: crear el disparador no espera a nadie más.
create or replace trigger clientas_celular_con_publicidad before update on retail.clientas
  for each row
  when (old.publicidad_desde is not null and new.publicidad_desde is not null
        and new.telefono_whatsapp is distinct from old.telefono_whatsapp)
  execute function retail.fn_club_celular_con_publicidad();

-- ---------- 7. registrar_clienta y editar_clienta: sin permiso de WhatsApp, con el año ----------
drop function if exists retail.registrar_clienta(text, text, text, text, boolean, smallint, smallint);

create or replace function retail.registrar_clienta(
  p_documento_tipo text default 'dni',
  p_documento_numero text default null,
  p_nombre text default null,
  p_telefono_whatsapp text default null,
  p_cumple_dia smallint default null,
  p_cumple_mes smallint default null,
  p_cumple_anio smallint default null
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_id uuid;
  v_persona uuid;
  v_tipo text := coalesce(nullif(btrim(p_documento_tipo), ''), 'dni');
  v_numero text;
  v_nombre text := nullif(btrim(p_nombre), '');
  v_telefono text;
  v_estaba_archivada boolean;
  v_previa uuid;
  v_telefono_previo text;
  v_publicidad_previa timestamptz;
  v_ligadas integer;
begin
  -- La ficha es del módulo «Clientas»: se pregunta a la CUENTA, antes de resolver quién firma.
  perform retail.fn_exigir_modulo('clientas');
  v_persona := retail.fn_actor_persona_id(true);
  v_numero := retail.fn_documento_clienta(v_tipo, p_documento_numero);
  -- El celular, normalizado (la BAJA busca por número); vacío = sin celular.
  v_telefono := retail.fn_exigir_celular(p_telefono_whatsapp, false);

  -- ADR-0288 D-4: registrarse NO es unirse al club ni dar la publicidad. Aquí no se DA ningún permiso: el club lo da
  -- unirse_al_club y la publicidad, solo un mensaje de ella (registrar_mensaje_publicidad, registrar_desde_whatsapp).
  if v_numero is not null then
    -- ¿Vuelve una clienta con su ficha archivada? (Felipe, 2026-09-27): se reactiva sola y sigue con su historial. La fila
    -- se toma con `for update`: si dos cajas la registran a la vez, la segunda espera y ya la encuentra activa.
    select c.id, c.archivada_en is not null, c.telefono_whatsapp, c.publicidad_desde
      into v_previa, v_estaba_archivada, v_telefono_previo, v_publicidad_previa
      from retail.clientas c
     where c.documento_tipo = v_tipo and c.documento_numero = v_numero
       for update;

    -- ADR-0288, ajuste d: un celular NUEVO sobre una ficha con publicidad se la quita antes de guardarlo (la publicidad es
    -- del número desde el que ella escribió), como en editar_clienta. Sin celular, el upsert conserva el que tenía.
    if v_publicidad_previa is not null and v_telefono is not null
       and v_telefono is distinct from retail.fn_celular_normalizado(v_telefono_previo) then
      perform retail.fn_club_quitar_publicidad_por_celular(v_previa, v_persona);
    end if;

    -- Upsert por documento: una clienta que ya existe no se duplica, se completa. El índice clientas_documento_unico es
    -- parcial: `on conflict` repite su `where` para poder inferirlo.
    insert into retail.clientas (documento_tipo, documento_numero, nombre, telefono_whatsapp, cumple_dia, cumple_mes, cumple_anio, created_por)
    values (v_tipo, v_numero, v_nombre, v_telefono, p_cumple_dia, p_cumple_mes, p_cumple_anio, v_persona)
    on conflict (documento_tipo, documento_numero) where documento_numero is not null do update set
      nombre = coalesce(excluded.nombre, retail.clientas.nombre),
      telefono_whatsapp = coalesce(excluded.telefono_whatsapp, retail.clientas.telefono_whatsapp),
      cumple_dia = coalesce(excluded.cumple_dia, retail.clientas.cumple_dia),
      cumple_mes = coalesce(excluded.cumple_mes, retail.clientas.cumple_mes),
      cumple_anio = coalesce(excluded.cumple_anio, retail.clientas.cumple_anio),
      -- La que vuelve deja de estar archivada. Con una activa no cambia nada.
      archivada_en = null,
      archivada_por = null,
      motivo_archivo = null
    returning id into v_id;

    if coalesce(v_estaba_archivada, false) then
      perform retail.fn_actividad_anotar(
        'clientas', 'reactivar', 'reactivó una clienta archivada al volver a registrarla',
        v_persona, null, null, null, 'clientas', v_id::text, now(),
        jsonb_build_object('al_registrar', true), 'vivo'
      );
    end if;

    -- CL-27: sus compras anteriores con ese documento pasan a su ficha.
    v_ligadas := retail.fn_ligar_ventas_por_documento(v_id, v_tipo, v_numero);
    if v_ligadas > 0 then
      perform retail.fn_actividad_anotar(
        'clientas', 'ligar_ventas', 'ligó ' || v_ligadas || ' compra(s) anteriores a la ficha de una clienta',
        v_persona, null, null, null, 'clientas', v_id::text, now(),
        jsonb_build_object('ventas_ligadas', v_ligadas), 'vivo'
      );
    end if;
  else
    insert into retail.clientas (documento_tipo, nombre, telefono_whatsapp, cumple_dia, cumple_mes, cumple_anio, created_por)
    values (v_tipo, v_nombre, v_telefono, p_cumple_dia, p_cumple_mes, p_cumple_anio, v_persona)
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

comment on function retail.registrar_clienta(text, text, text, text, smallint, smallint, smallint) is
  'Alta de clienta, o upsert por (tipo, número de documento) si se repite; si ese documento es de una ficha archivada, la reactiva con su historial. Al registrarla con documento, liga sus compras anteriores con ese mismo documento (CL-27). Registrarse NO es unirse al club ni dar la publicidad (ADR-0288 D-4): no da ningún permiso; un celular nuevo sobre una socia con publicidad se la quita (medio cambio_celular). Celular normalizado (celular_invalido). Solo para cuentas que ven el módulo «Clientas» (42501 clientas_sin_modulo). Firma con el responsable del combo (fn_actor_persona_id(true), ADR-0162).';

drop function if exists retail.editar_clienta(uuid, text, text, text, text, boolean, boolean, smallint, smallint, jsonb, integer);

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
  p_version_esperada integer default null
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
  v_ligadas integer := 0;
begin
  perform retail.fn_exigir_modulo('clientas');
  v_persona := retail.fn_actor_persona_id(true);
  v_numero := retail.fn_documento_clienta(v_tipo, p_documento_numero);
  v_telefono := retail.fn_exigir_celular(p_telefono_whatsapp, false);

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
      tallas = coalesce(p_tallas, tallas)
    where id = p_id;
  exception when unique_violation then
    raise exception 'Ese documento ya es de otra ficha. Si son la misma clienta, únelas con «Unir con otra ficha».'
      using errcode = '23505', hint = 'documento_de_otra_ficha';
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

comment on function retail.editar_clienta(uuid, text, text, text, text, smallint, smallint, smallint, jsonb, integer) is
  'Edita la ficha (documento con tipo, nombre, celular, cumpleaños con año opcional, tallas) con candado optimista (PT409 version_cambiada). No da permisos del club (ADR-0288 D-4). A una socia no se le borra el celular (socia_sin_celular), el documento ni el nombre (socia_sin_documento); si se le cambia el celular y tenía publicidad, se la quita en la misma transacción (medio cambio_celular) y sigue socia. Documento de otra ficha → 23505 documento_de_otra_ficha. Módulo «Clientas».';

revoke execute on function
  retail.registrar_clienta(text, text, text, text, smallint, smallint, smallint),
  retail.editar_clienta(uuid, text, text, text, text, smallint, smallint, smallint, jsonb, integer)
from public, anon;

grant execute on function
  retail.registrar_clienta(text, text, text, text, smallint, smallint, smallint),
  retail.editar_clienta(uuid, text, text, text, text, smallint, smallint, smallint, jsonb, integer)
to authenticated;

-- ---------- 8. buscar_clienta: también por el código de socia y por el celular como se escriba ----------
create or replace function retail.buscar_clienta(p_termino text, p_incluir_archivadas boolean default false)
returns setof retail.clientas
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  -- La ficha es del módulo «Clientas» (42501 clientas_sin_modulo). Va primero: si falla, no se lee nada.
  select retail.fn_exigir_modulo('clientas');

  select *
  from retail.clientas
  where nullif(btrim(p_termino), '') is not null
    and (p_incluir_archivadas or archivada_en is null)
    and (
      documento_numero = upper(regexp_replace(p_termino, '\s', '', 'g'))
      -- El celular como venga del chat: «987 654 321» o «+51 987654321» (ADR-0288).
      or telefono_whatsapp in (btrim(p_termino), retail.fn_celular_normalizado(p_termino))
      -- El código de socia, solo o dentro del mensaje que llegó: «C-0142», «c142», «… (Club C-0142)».
      or codigo_club = retail.fn_codigo_club_normalizado(p_termino)
      or nombre ilike '%' || btrim(p_termino) || '%'
    )
  order by nombre nulls last, created_at desc
  limit 20;
$$;

-- ---------- 9. archivar_clienta: anonimizar revoca los permisos antes de vaciar el club ----------
create or replace function retail.archivar_clienta(p_id uuid, p_motivo text, p_anonimizar boolean default false, p_version_esperada integer default null)
returns integer
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_persona uuid;
  v_actual record;
  v_motivo text := nullif(btrim(p_motivo), '');
  v_fusiones integer := 0;
  v_revocados integer := 0;
begin
  perform retail.fn_exigir_modulo('clientas');
  v_persona := retail.fn_actor_persona_id(true);

  if v_motivo is null then
    raise exception 'Escribe un motivo antes de archivar a esta clienta.';
  end if;

  -- `for update` desde la primera lectura: los `revoca` de abajo salen de lo que la ficha tiene AHORA, y nadie la une al
  -- club en el medio.
  select * into v_actual from retail.clientas where id = p_id for update;
  if v_actual.id is null then
    raise exception 'Esa clienta ya no existe — actualiza la pantalla.';
  end if;
  if v_actual.archivada_en is not null then
    raise exception 'Esta ficha ya está archivada.';
  end if;

  if p_version_esperada is not null and v_actual.version <> p_version_esperada then
    raise exception 'Alguien más cambió esta ficha mientras la mirabas. Recarga para ver sus cambios.'
      using errcode = 'PT409', hint = 'version_cambiada';
  end if;

  -- ADR-0288: antes de vaciar el club, la historia registra que se fue (un `revoca` por cada permiso vigente, medio
  -- `anonimizar`). El evento no lleva datos suyos: queda colgado de la ficha anonimizada.
  if p_anonimizar and (v_actual.club_desde is not null or v_actual.publicidad_desde is not null) then
    if v_persona is null then
      raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
    end if;
    if v_actual.publicidad_desde is not null then
      insert into retail.club_permisos (clienta_id, finalidad, accion, medio, registrado_por)
      values (p_id, 'publicidad_whatsapp', 'revoca', 'anonimizar', v_persona);
      v_revocados := v_revocados + 1;
    end if;
    if v_actual.club_desde is not null then
      insert into retail.club_permisos (clienta_id, finalidad, accion, medio, registrado_por)
      values (p_id, 'club', 'revoca', 'anonimizar', v_persona);
      v_revocados := v_revocados + 1;
    end if;
  end if;

  update retail.clientas set
    archivada_en = now(),
    archivada_por = v_persona,
    -- (b) Al anonimizar, el motivo escrito no se guarda: puede nombrar a la clienta (Ley 29733, Felipe 2026-09-27).
    motivo_archivo = case when p_anonimizar then 'Anonimizada (Ley 29733)' else v_motivo end,
    anonimizada = p_anonimizar,
    documento_numero = case when p_anonimizar then null else documento_numero end,
    nombre = case when p_anonimizar then 'Clienta anonimizada' else nombre end,
    telefono_whatsapp = case when p_anonimizar then null else telefono_whatsapp end,
    whatsapp_consentimiento_en = case when p_anonimizar then null else whatsapp_consentimiento_en end,
    cumple_dia = case when p_anonimizar then null else cumple_dia end,
    cumple_mes = case when p_anonimizar then null else cumple_mes end,
    cumple_anio = case when p_anonimizar then null else cumple_anio end,
    tallas = case when p_anonimizar then null else tallas end,
    club_desde = case when p_anonimizar then null else club_desde end,
    publicidad_desde = case when p_anonimizar then null else publicidad_desde end,
    codigo_club = case when p_anonimizar then null else codigo_club end
  where id = p_id;

  if p_anonimizar then
    -- (b) La foto que `unir_clientas` guardó de cada ficha que se le unió a ésta, o a una que se le unió (son la misma
    -- persona), pierde todo dato personal: queda solo cuándo se anonimizó. Se mira el lado que sea de cada fusión.
    with recursive arbol (id) as (
      select p_id
      union
      select c.id from retail.clientas c join arbol a on c.fusionada_en_id = a.id
    )
    update retail.clientas_fusiones f
       set ficha_fusionada = jsonb_build_object('anonimizada_en', now())
     where f.clienta_mantiene_id in (select id from arbol)
        or f.clienta_fusionada_id in (select id from arbol);
    get diagnostics v_fusiones = row_count;
  end if;

  -- (b) Sin nombre, DNI ni el motivo escrito: quién es queda en registro_id (ADR-0249, 2026-09-28).
  perform retail.fn_actividad_anotar(
    'clientas', case when p_anonimizar then 'anonimizar' else 'archivar' end,
    case when p_anonimizar then 'anonimizó la ficha de una clienta (Ley 29733)' else 'archivó la ficha de una clienta' end,
    v_persona, null, null, null, 'clientas', p_id::text, now(),
    case when p_anonimizar
      then jsonb_build_object('anonimizada', true, 'fusiones_limpiadas', v_fusiones, 'permisos_revocados', v_revocados)
      else jsonb_build_object('anonimizada', false)
    end,
    'vivo'
  );

  return (select version from retail.clientas where id = p_id);
end;
$$;

-- ---------- 10. unir_clientas: la que queda toma el club más antiguo (y el código si no tenía) ----------
create or replace function retail.unir_clientas(p_mantener_id uuid, p_fusionar_id uuid, p_version_mantener_esperada integer default null, p_version_fusionar_esperada integer default null)
returns retail.clientas
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_persona uuid;
  v_mantener retail.clientas;
  v_fusionar retail.clientas;
  v_snapshot jsonb;
  v_ventas integer;
  v_separaciones integer;
  v_pedidos integer;
  v_celular_de_la_otra boolean;
begin
  perform retail.fn_exigir_modulo('clientas');
  v_persona := retail.fn_actor_persona_id(true);

  if p_mantener_id = p_fusionar_id then
    raise exception 'No puedes unir una ficha consigo misma.';
  end if;

  -- Bloquea las dos filas desde el principio: cierra la carrera de dos fusiones a la vez sobre la misma pareja.
  select * into v_mantener from retail.clientas where id = p_mantener_id for update;
  select * into v_fusionar from retail.clientas where id = p_fusionar_id for update;

  if v_mantener.id is null or v_fusionar.id is null then
    raise exception 'Una de las dos fichas ya no existe — actualiza la pantalla.';
  end if;
  if v_mantener.archivada_en is not null then
    raise exception 'La ficha que quieres conservar está archivada — reactívala primero, o une hacia la otra ficha.';
  end if;
  if v_fusionar.archivada_en is not null then
    raise exception 'Esa ficha ya está archivada o ya se unió a otra — no se puede volver a fusionar.';
  end if;

  if p_version_mantener_esperada is not null and v_mantener.version <> p_version_mantener_esperada then
    raise exception 'Alguien más cambió la ficha que ibas a conservar mientras decidías. Recarga para ver sus cambios.'
      using errcode = 'PT409', hint = 'version_cambiada';
  end if;
  if p_version_fusionar_esperada is not null and v_fusionar.version <> p_version_fusionar_esperada then
    raise exception 'Alguien más cambió la ficha que ibas a unir mientras decidías. Recarga para ver sus cambios.'
      using errcode = 'PT409', hint = 'version_cambiada';
  end if;

  -- Foto de la perdedora ANTES de tocar nada: es lo único con que se podría reconstruir a mano si esta fusión fue un error.
  -- Si después se anonimiza la ficha que queda, archivar_clienta la vacía (Ley 29733).
  v_snapshot := to_jsonb(v_fusionar);

  update retail.ventas set cliente_id = p_mantener_id where cliente_id = p_fusionar_id;
  get diagnostics v_ventas = row_count;

  update retail.separaciones set clienta_id = p_mantener_id where clienta_id = p_fusionar_id;
  get diagnostics v_separaciones = row_count;

  update retail.pedidos_no_atendidos set clienta_id = p_mantener_id where clienta_id = p_fusionar_id;
  get diagnostics v_pedidos = row_count;

  -- ADR-0288: el celular sigue al permiso. Si la que se va tiene publicidad (escribió desde ESE número) y la que queda no,
  -- o si solo la que se va es socia, queda el celular de la que se va; si no, el de la que queda (o el de la otra si no
  -- tenía). Así la publicidad nunca termina en un número que no escribió, y nunca cambia el celular de la que queda si
  -- ESTA tenía publicidad (el disparador clientas_celular_con_publicidad no tiene nada que frenar aquí).
  v_celular_de_la_otra :=
       (v_fusionar.publicidad_desde is not null and v_mantener.publicidad_desde is null)
    or (v_fusionar.club_desde is not null and v_mantener.club_desde is null);

  -- Primero se vacía a la perdedora (libera su documento y su código de los índices únicos) y SOLO DESPUÉS se completa a
  -- la que gana. `nombre` al texto exacto que exige clientas_anonimizada_sin_datos_personales (nunca null). Sus eventos
  -- del club se quedan con ella: clientas_fusiones lleva de una a la otra.
  update retail.clientas set
    documento_numero = null, nombre = 'Clienta anonimizada', telefono_whatsapp = null, whatsapp_consentimiento_en = null,
    cumple_dia = null, cumple_mes = null, cumple_anio = null, tallas = null,
    club_desde = null, publicidad_desde = null, codigo_club = null,
    anonimizada = true,
    archivada_en = now(),
    archivada_por = v_persona,
    motivo_archivo = 'Se unió a otra ficha de clienta (unir_clientas)',
    fusionada_en_id = p_mantener_id
  where id = p_fusionar_id;

  update retail.clientas set
    documento_tipo = case when documento_numero is null and v_fusionar.documento_numero is not null
                          then v_fusionar.documento_tipo else documento_tipo end,
    documento_numero = coalesce(documento_numero, v_fusionar.documento_numero),
    nombre = coalesce(nombre, v_fusionar.nombre),
    telefono_whatsapp = case when v_celular_de_la_otra then v_fusionar.telefono_whatsapp
                             else coalesce(telefono_whatsapp, v_fusionar.telefono_whatsapp) end,
    whatsapp_consentimiento_en = greatest(whatsapp_consentimiento_en, v_fusionar.whatsapp_consentimiento_en),
    cumple_dia = coalesce(cumple_dia, v_fusionar.cumple_dia),
    cumple_mes = coalesce(cumple_mes, v_fusionar.cumple_mes),
    cumple_anio = coalesce(cumple_anio, v_fusionar.cumple_anio),
    tallas = coalesce(tallas, v_fusionar.tallas),
    -- ADR-0288: lo más antiguo de las dos (least ignora el null), y el código de la otra solo si esta no tenía.
    club_desde = least(club_desde, v_fusionar.club_desde),
    publicidad_desde = least(publicidad_desde, v_fusionar.publicidad_desde),
    codigo_club = coalesce(codigo_club, v_fusionar.codigo_club)
  where id = p_mantener_id;

  insert into retail.clientas_fusiones (
    clienta_mantiene_id, clienta_fusionada_id, ficha_fusionada,
    ventas_movidas, separaciones_movidas, pedidos_movidos, fusionada_por
  ) values (
    p_mantener_id, p_fusionar_id, v_snapshot, v_ventas, v_separaciones, v_pedidos, v_persona
  );

  perform retail.fn_actividad_anotar(
    'clientas', 'unir',
    'unió dos fichas de una misma clienta: ' || v_ventas || ' venta(s), ' || v_separaciones || ' apartado(s) y '
      || v_pedidos || ' pedido(s) pasaron a la ficha que quedó',
    v_persona, null, null, null, 'clientas', p_mantener_id::text, now(),
    jsonb_build_object('fusionada_id', p_fusionar_id, 'ventas_movidas', v_ventas,
                        'separaciones_movidas', v_separaciones, 'pedidos_movidos', v_pedidos),
    'vivo'
  );

  return (select c from retail.clientas c where c.id = p_mantener_id);
end;
$$;

-- ---------- 11. unirse_al_club: su «sí» de palabra, en caja o en la ficha ----------
-- PROMETE: la deja socia con el texto `club` vigente, su celular (obligatorio) y su cumpleaños, y le asigna su código.
--   CL-1: la ficha necesita documento y nombre (socia_sin_documento). `p_texto_version` es la versión del texto que la
--   asesora le leyó: si ya no es la vigente, rechaza (club_texto_cambio) para que el evento nunca cite un texto que ella
--   no escuchó; null = la vigente. Si ya es socia, completa lo que le falte del cumpleaños y devuelve su código, sin otro
--   evento. Rechaza una ficha archivada, anonimizada o unida a otra. NUNCA da la publicidad: eso solo nace de un mensaje
--   de ella.
create or replace function retail.unirse_al_club(
  p_clienta_id uuid,
  p_telefono_whatsapp text,
  p_cumple_dia smallint default null,
  p_cumple_mes smallint default null,
  p_cumple_anio smallint default null,
  p_medio text default 'caja_palabra',
  p_ubicacion_id uuid default null,
  p_venta_id uuid default null,
  p_texto_version integer default null
)
returns table (codigo_club text, club_desde timestamptz)
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
#variable_conflict use_column
declare
  v_persona uuid;
  v_medio text := coalesce(nullif(btrim(p_medio), ''), 'caja_palabra');
  v_celular text;
  v_texto integer;
  v_archivada boolean;
  v_anonimizada boolean;
  v_unida boolean;
  v_con_documento_y_nombre boolean;
  v_club_desde timestamptz;
  v_codigo text;
begin
  perform retail.fn_exigir_modulo('clientas');
  v_persona := retail.fn_actor_persona_id(true);
  -- Sin bot: cada «sí» lo registra una persona del equipo (ADR-0288, 2026-09-30).
  if v_persona is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  if v_medio not in ('caja_palabra', 'ficha') then
    raise exception 'El «sí» al club se registra en caja o en la ficha.' using errcode = '22023';
  end if;
  v_celular := retail.fn_exigir_celular(p_telefono_whatsapp);
  v_texto := (select max(t.version) from retail.club_textos t where t.tipo = 'club');
  if v_texto is null then
    raise exception 'Todavía no hay un texto del club para leerle a la clienta: no se puede invitarla.'
      using errcode = 'P0001', hint = 'club_sin_texto';
  end if;
  if p_venta_id is not null and not exists (select 1 from retail.ventas v where v.id = p_venta_id) then
    raise exception 'Esa venta no existe: invítala sin ligarla a una venta.' using errcode = 'P0001';
  end if;

  -- `for update`: si dos cajas la invitan a la vez, la segunda espera, la encuentra socia y devuelve el mismo código.
  select c.archivada_en is not null, c.anonimizada, c.fusionada_en_id is not null,
         c.documento_numero is not null and nullif(btrim(c.nombre), '') is not null, c.club_desde, c.codigo_club
    into v_archivada, v_anonimizada, v_unida, v_con_documento_y_nombre, v_club_desde, v_codigo
    from retail.clientas c
   where c.id = p_clienta_id
     for update;
  if not found then
    raise exception 'Esa clienta ya no existe — actualiza la pantalla.' using errcode = 'P0001', hint = 'clienta_no_existe';
  end if;
  if v_unida then
    raise exception 'Esta ficha se unió a otra: búscala otra vez y usa la que quedó.' using errcode = 'P0001', hint = 'clienta_unida';
  end if;
  if v_anonimizada then
    raise exception 'Esta clienta pidió borrar sus datos: esta ficha no puede unirse al club.'
      using errcode = 'P0001', hint = 'clienta_anonimizada';
  end if;
  if v_archivada then
    raise exception 'Esta ficha está archivada — reactívala antes de unirla al club.' using errcode = 'P0001', hint = 'clienta_archivada';
  end if;

  if v_club_desde is not null then
    -- Ya es socia: solo completa el cumpleaños que falte (sin tocar la versión si no hay nada que completar).
    update retail.clientas c set
      cumple_dia = coalesce(c.cumple_dia, p_cumple_dia),
      cumple_mes = coalesce(c.cumple_mes, p_cumple_mes),
      cumple_anio = coalesce(c.cumple_anio, p_cumple_anio)
    where c.id = p_clienta_id
      and ((c.cumple_dia is null and p_cumple_dia is not null)
        or (c.cumple_mes is null and p_cumple_mes is not null)
        or (c.cumple_anio is null and p_cumple_anio is not null));
    return query select v_codigo, v_club_desde;
    return;
  end if;

  -- El evento cita el texto que la asesora LEYÓ: si cambió mientras la invitaba, se lo vuelve a leer.
  if p_texto_version is not null and p_texto_version is distinct from v_texto then
    raise exception 'El texto del club cambió mientras la invitabas: vuelve a leérselo.'
      using errcode = 'P0001', hint = 'club_texto_cambio';
  end if;
  -- CL-1: socia = documento + celular + nombre (candado clientas_socia_con_documento_y_nombre).
  if not v_con_documento_y_nombre then
    raise exception 'Para unirla al club, su ficha necesita documento y nombre: complétalos primero.'
      using errcode = 'P0001', hint = 'socia_sin_documento';
  end if;

  v_codigo := retail.fn_club_codigo_nuevo();
  v_club_desde := now();
  update retail.clientas c set
    telefono_whatsapp = v_celular,
    cumple_dia = coalesce(p_cumple_dia, c.cumple_dia),
    cumple_mes = coalesce(p_cumple_mes, c.cumple_mes),
    cumple_anio = coalesce(p_cumple_anio, c.cumple_anio),
    club_desde = v_club_desde,
    codigo_club = v_codigo
  where c.id = p_clienta_id;

  insert into retail.club_permisos (clienta_id, finalidad, accion, medio, texto_tipo, texto_version, ubicacion_id, venta_id, registrado_por)
  values (p_clienta_id, 'club', 'otorga', v_medio, 'club', v_texto, p_ubicacion_id, p_venta_id, v_persona);

  perform retail.fn_actividad_anotar(
    'clientas', 'unirse_club',
    case v_medio when 'ficha' then 'unió a una clienta al club (su «sí», anotado en la ficha)'
                 else 'unió a una clienta al club (su «sí» en caja)' end,
    v_persona, null, p_ubicacion_id, null, 'clientas', p_clienta_id::text, now(),
    jsonb_build_object('medio', v_medio, 'texto_version', v_texto, 'venta_id', p_venta_id), 'vivo'
  );

  return query select v_codigo, v_club_desde;
end;
$$;

comment on function retail.unirse_al_club(uuid, text, smallint, smallint, smallint, text, uuid, uuid, integer) is
  'Su «sí» al club, de palabra (medio caja_palabra o ficha), con el texto club vigente (club_sin_texto; si p_texto_version ya no es la vigente, club_texto_cambio), su celular (celular_invalido) y una ficha con documento y nombre (socia_sin_documento). Asigna su código C-0001… Si ya es socia, devuelve su código sin otro evento. NUNCA da la publicidad (ADR-0288 D-4). Módulo «Clientas»; firma con el responsable del combo.';

-- ---------- 12. registrar_mensaje_publicidad: «Llegó su mensaje» ----------
-- PROMETE: registra que ELLA escribió a la tienda desde su QR pidiendo publicidad (medio whatsapp_propio, texto
--   mensaje_personal vigente). Exige que sea socia (no_es_socia). El número que escribió pasa a ser su celular; si ya
--   tenía publicidad desde otro número, la conserva con su fecha (es el único cambio de celular que no la quita: ella
--   escribió desde el nuevo). Si ya tenía publicidad con ese mismo número, devuelve la fecha sin otro evento.
create or replace function retail.registrar_mensaje_publicidad(
  p_clienta_id uuid,
  p_telefono_que_escribio text,
  p_ubicacion_id uuid default null
)
returns timestamptz
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_persona uuid;
  v_celular text;
  v_texto integer;
  v_archivada boolean;
  v_anonimizada boolean;
  v_unida boolean;
  v_club_desde timestamptz;
  v_publicidad_desde timestamptz;
  v_telefono text;
begin
  perform retail.fn_exigir_modulo('clientas');
  v_persona := retail.fn_actor_persona_id(true);
  if v_persona is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  v_celular := retail.fn_exigir_celular(p_telefono_que_escribio);
  v_texto := (select max(t.version) from retail.club_textos t where t.tipo = 'mensaje_personal');
  if v_texto is null then
    raise exception 'Todavía no hay un mensaje de publicidad vigente para el QR.' using errcode = 'P0001', hint = 'club_sin_texto';
  end if;

  select c.archivada_en is not null, c.anonimizada, c.fusionada_en_id is not null, c.club_desde, c.publicidad_desde,
         c.telefono_whatsapp
    into v_archivada, v_anonimizada, v_unida, v_club_desde, v_publicidad_desde, v_telefono
    from retail.clientas c
   where c.id = p_clienta_id
     for update;
  if not found then
    raise exception 'Esa clienta ya no existe — actualiza la pantalla.' using errcode = 'P0001', hint = 'clienta_no_existe';
  end if;
  if v_unida then
    raise exception 'Esta ficha se unió a otra: búscala otra vez y usa la que quedó.' using errcode = 'P0001', hint = 'clienta_unida';
  end if;
  if v_anonimizada then
    raise exception 'Esta clienta pidió borrar sus datos: esta ficha no puede recibir publicidad.'
      using errcode = 'P0001', hint = 'clienta_anonimizada';
  end if;
  if v_archivada then
    raise exception 'Esta ficha está archivada — reactívala antes de registrar su mensaje.' using errcode = 'P0001', hint = 'clienta_archivada';
  end if;
  if v_club_desde is null then
    raise exception 'Todavía no es socia del club: únela primero (su «sí» en caja o en la ficha). La publicidad es solo para socias.'
      using errcode = 'P0001', hint = 'no_es_socia';
  end if;

  -- Ya tenía publicidad y escribió desde el mismo número: nada nuevo que registrar.
  if v_publicidad_desde is not null and v_telefono = v_celular then
    return v_publicidad_desde;
  end if;

  -- Primero su mensaje, después la foto: el número que escribió pasa a ser su celular y, si ya tenía publicidad desde
  -- otro número, la conserva (escribió desde el nuevo). El disparador clientas_celular_con_publicidad deja pasar ese
  -- cambio porque ve este evento en la misma transacción.
  insert into retail.club_permisos (clienta_id, finalidad, accion, medio, texto_tipo, texto_version, ubicacion_id, registrado_por)
  values (p_clienta_id, 'publicidad_whatsapp', 'otorga', 'whatsapp_propio', 'mensaje_personal', v_texto, p_ubicacion_id, v_persona);

  update retail.clientas c set
    telefono_whatsapp = v_celular,
    publicidad_desde = coalesce(c.publicidad_desde, now())
  where c.id = p_clienta_id
  returning c.publicidad_desde into v_publicidad_desde;

  perform retail.fn_actividad_anotar(
    'clientas', 'publicidad_whatsapp', 'registró que una clienta escribió a la tienda pidiendo publicidad por WhatsApp',
    v_persona, null, p_ubicacion_id, null, 'clientas', p_clienta_id::text, now(),
    jsonb_build_object('texto_version', v_texto, 'cambio_celular', v_telefono is distinct from v_celular), 'vivo'
  );

  return v_publicidad_desde;
end;
$$;

comment on function retail.registrar_mensaje_publicidad(uuid, text, uuid) is
  '«Llegó su mensaje»: ella escribió primero desde su QR. Da la publicidad por WhatsApp (medio whatsapp_propio, texto mensaje_personal vigente) a una socia (no_es_socia). El número que escribió pasa a ser su celular. Devuelve publicidad_desde. Módulo «Clientas»; firma con el responsable del combo.';

-- ---------- 13. registrar_desde_whatsapp: el cartel del mostrador ----------
-- PROMETE: con su documento (obligatorio) y el número que escribió, completa o crea la ficha como registrar_clienta, y la
--   deja socia CON publicidad: los dos eventos con medio whatsapp_propio y el texto mensaje_generico (ella escribió
--   primero «quiero unirme al Club CAYLA y recibir…»). Si ya era socia, conserva su código; si ya tenía publicidad desde
--   ese número, no repite eventos; desde otro número, la conserva y el celular pasa a ser el que escribió.
create or replace function retail.registrar_desde_whatsapp(
  p_documento_tipo text,
  p_documento_numero text,
  p_nombre text default null,
  p_telefono_que_escribio text default null,
  p_ubicacion_id uuid default null
)
returns table (clienta_id uuid, codigo_club text)
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
#variable_conflict use_column
declare
  v_persona uuid;
  v_tipo text := coalesce(nullif(btrim(p_documento_tipo), ''), 'dni');
  v_numero text;
  v_celular text;
  v_texto integer;
  v_id uuid;
  v_club_desde timestamptz;
  v_publicidad_desde timestamptz;
  v_codigo text;
  v_telefono text;
  v_con_nombre boolean;
  v_ahora timestamptz := now();
begin
  perform retail.fn_exigir_modulo('clientas');
  v_persona := retail.fn_actor_persona_id(true);
  if v_persona is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  -- CL-1: sin documento no hay ficha, y sin ficha el ERP no le escribe.
  v_numero := retail.fn_documento_clienta(v_tipo, p_documento_numero);
  if v_numero is null then
    raise exception 'Pídele su documento por el chat: sin documento no se la registra.' using errcode = '22023', hint = 'documento_invalido';
  end if;
  v_celular := retail.fn_exigir_celular(p_telefono_que_escribio);
  v_texto := (select max(t.version) from retail.club_textos t where t.tipo = 'mensaje_generico');
  if v_texto is null then
    raise exception 'Todavía no hay un mensaje del cartel vigente.' using errcode = 'P0001', hint = 'club_sin_texto';
  end if;

  -- La ficha, como en caja (upsert por documento, reactiva una archivada, liga sus compras anteriores). Sin celular: el
  -- de abajo se pone con la fila tomada, para comparar con el que tenía.
  v_id := retail.registrar_clienta(v_tipo, v_numero, p_nombre, null, null, null, null);

  select c.club_desde, c.publicidad_desde, c.codigo_club, c.telefono_whatsapp, nullif(btrim(c.nombre), '') is not null
    into v_club_desde, v_publicidad_desde, v_codigo, v_telefono, v_con_nombre
    from retail.clientas c
   where c.id = v_id
     for update;

  -- CL-1: socia = documento + celular + nombre. Sin nombre (ni en la ficha ni del padrón), se deshace también el alta.
  if v_club_desde is null and not v_con_nombre then
    raise exception 'Para unirla al club, su ficha necesita documento y nombre: escribe su nombre.'
      using errcode = 'P0001', hint = 'socia_sin_documento';
  end if;

  if v_club_desde is null then
    v_codigo := retail.fn_club_codigo_nuevo();
    update retail.clientas c set
      telefono_whatsapp = v_celular,
      club_desde = v_ahora,
      codigo_club = v_codigo
    where c.id = v_id;
    insert into retail.club_permisos (clienta_id, finalidad, accion, medio, texto_tipo, texto_version, ubicacion_id, registrado_por)
    values (v_id, 'club', 'otorga', 'whatsapp_propio', 'mensaje_generico', v_texto, p_ubicacion_id, v_persona);
  end if;

  if v_publicidad_desde is null or v_telefono is distinct from v_celular then
    -- Primero su mensaje, después la foto (como «Llegó su mensaje»): si ya tenía publicidad desde otro número, el
    -- disparador clientas_celular_con_publicidad deja pasar el cambio porque ve este evento en la misma transacción.
    insert into retail.club_permisos (clienta_id, finalidad, accion, medio, texto_tipo, texto_version, ubicacion_id, registrado_por)
    values (v_id, 'publicidad_whatsapp', 'otorga', 'whatsapp_propio', 'mensaje_generico', v_texto, p_ubicacion_id, v_persona);
    update retail.clientas c set
      telefono_whatsapp = v_celular,
      publicidad_desde = coalesce(c.publicidad_desde, v_ahora)
    where c.id = v_id;

    perform retail.fn_actividad_anotar(
      'clientas', 'registrar_desde_whatsapp', 'registró desde WhatsApp a una clienta que escribió al cartel (club y publicidad)',
      v_persona, null, p_ubicacion_id, null, 'clientas', v_id::text, now(),
      jsonb_build_object('texto_version', v_texto, 'nueva_socia', v_club_desde is null), 'vivo'
    );
  end if;

  return query select v_id, v_codigo;
end;
$$;

comment on function retail.registrar_desde_whatsapp(text, text, text, text, uuid) is
  'El cartel: escribió «quiero unirme al Club CAYLA y recibir…» y la tienda le pidió su documento. Completa o crea la ficha (como registrar_clienta) y la deja socia con publicidad (medio whatsapp_propio, texto mensaje_generico); el número que escribió es su celular. Módulo «Clientas»; firma con el responsable del combo.';

-- ---------- 14. registrar_baja_whatsapp: escribió BAJA ----------
-- PROMETE: quita la publicidad (medio baja_whatsapp) de TODA ficha con ese celular (en las 3 tiendas: la BAJA vale desde
--   hoy) y vacía su publicidad_desde. El club sigue: los avisos informativos no son publicidad. Devuelve cuántas fichas
--   tienen ese número (con o sin publicidad).
create or replace function retail.registrar_baja_whatsapp(p_telefono text, p_ubicacion_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_persona uuid;
  v_celular text;
  r record;
  v_fichas integer := 0;
begin
  perform retail.fn_exigir_modulo('clientas');
  v_persona := retail.fn_actor_persona_id(true);
  if v_persona is null then
    raise exception 'Elige quién hace esta operación' using errcode = '42501', hint = 'responsable_requerido';
  end if;
  v_celular := retail.fn_exigir_celular(p_telefono);

  -- En orden de id: dos BAJAs a la vez toman las mismas fichas en el mismo orden (sin deadlock).
  for r in
    select c.id, c.publicidad_desde
      from retail.clientas c
     where not c.anonimizada
       and (c.telefono_whatsapp = v_celular or retail.fn_celular_normalizado(c.telefono_whatsapp) = v_celular)
     order by c.id
       for update
  loop
    v_fichas := v_fichas + 1;
    if r.publicidad_desde is not null then
      insert into retail.club_permisos (clienta_id, finalidad, accion, medio, ubicacion_id, registrado_por)
      values (r.id, 'publicidad_whatsapp', 'revoca', 'baja_whatsapp', p_ubicacion_id, v_persona);
      update retail.clientas set publicidad_desde = null where id = r.id;
      perform retail.fn_actividad_anotar(
        'clientas', 'baja_whatsapp', 'registró la BAJA de publicidad por WhatsApp de una clienta',
        v_persona, null, p_ubicacion_id, null, 'clientas', r.id::text, now(), '{}'::jsonb, 'vivo'
      );
    end if;
  end loop;

  return v_fichas;
end;
$$;

comment on function retail.registrar_baja_whatsapp(text, uuid) is
  'Escribió BAJA: quita la publicidad (medio baja_whatsapp) de toda ficha con ese celular, desde hoy y en todas las tiendas; su club sigue. Devuelve cuántas fichas tienen ese número. Módulo «Clientas»; firma con el responsable del combo.';

-- ---------- 15. lecturas: la tarjeta de la caja y los textos vigentes ----------
create or replace function retail.resumen_clienta_caja(p_clienta_id uuid)
returns table (
  es_socia boolean,
  codigo_club text,
  club_desde timestamptz,
  con_publicidad boolean,
  celular text,
  cumple_dia smallint,
  cumple_mes smallint
)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  -- La ficha es del módulo «Clientas» (42501 clientas_sin_modulo). Va primero: si falla, no se lee nada.
  select retail.fn_exigir_modulo('clientas');

  select c.club_desde is not null, c.codigo_club, c.club_desde, c.publicidad_desde is not null,
         c.telefono_whatsapp, c.cumple_dia, c.cumple_mes
    from retail.clientas c
   where c.id = p_clienta_id;
$$;

comment on function retail.resumen_clienta_caja(uuid) is
  'La tarjeta de la clienta en Cobrar (ADR-0288 D-8): socia, código, desde cuándo, con publicidad, celular y cumpleaños. Lectura (prefijo resumen_: no abre el loader). Módulo «Clientas».';

create or replace function retail.fn_club_textos_vigentes()
returns table (tipo text, version integer, texto text)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  -- Sin el módulo «Clientas» a propósito: son los textos públicos del cartel, y el ticket de una venta sin clienta lleva
  -- el QR genérico aunque quien vende no tenga el módulo. No devuelve nada de ninguna clienta.
  select distinct on (t.tipo) t.tipo, t.version, t.texto
    from retail.club_textos t
   order by t.tipo, t.version desc;
$$;

comment on function retail.fn_club_textos_vigentes() is
  'Los textos vigentes del club (la versión más alta de cada tipo): club, mensaje_personal (con {codigo}) y mensaje_generico. Lectura para cualquier cuenta con sesión: son públicos.';

-- ---------- 16. guardar_whatsapp_tienda: Configuración ▸ Tiendas y caja ----------
create or replace function retail.guardar_whatsapp_tienda(p_ubicacion_id uuid, p_numero text default null)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_actor uuid;
  v_numero text;
  v_tipo text;
  v_antes text;
begin
  -- El mismo candado que guardar_metas_tienda: el líder o quien tenga el módulo «Configuración».
  if not retail.fn_puede_configurar() then
    raise exception 'Cambiar el WhatsApp de la tienda necesita el módulo «Configuración» en tu rol.' using errcode = 'P0001';
  end if;
  v_actor := retail.fn_actor_persona_id(true);

  -- Vacío = quitarlo (la tienda deja de mostrar el QR).
  if nullif(btrim(coalesce(p_numero, '')), '') is not null then
    v_numero := retail.fn_celular_normalizado(p_numero);
    if v_numero is null or v_numero !~ '^9[0-9]{8}$' then
      raise exception 'El WhatsApp de la tienda es un celular de 9 dígitos que empieza en 9.'
        using errcode = '22023', hint = 'whatsapp_tienda_invalido';
    end if;
  end if;

  -- `for no key update`: dos líderes guardando a la vez no se mezclan, y una venta (que solo pide la llave) no espera.
  select u.tipo, u.whatsapp_numero into v_tipo, v_antes
    from retail.ubicaciones u where u.id = p_ubicacion_id
     for no key update;
  if not found then
    raise exception 'Esa tienda no existe.' using errcode = 'P0001';
  end if;
  if v_tipo is distinct from 'tienda' then
    raise exception 'Solo una tienda tiene WhatsApp del club.' using errcode = 'P0001';
  end if;
  if v_antes is not distinct from v_numero then
    return;
  end if;

  update retail.ubicaciones set whatsapp_numero = v_numero where id = p_ubicacion_id;

  insert into retail.configuracion_historial (que, detalle, hecho_por)
  values ('whatsapp_tienda', jsonb_build_object('ubicacion_id', p_ubicacion_id, 'antes', v_antes, 'despues', v_numero), v_actor);
end;
$$;

comment on function retail.guardar_whatsapp_tienda(uuid, text) is
  'El WhatsApp de una tienda para el QR del club (9 dígitos que empiezan en 9: whatsapp_tienda_invalido). Vacío lo quita. Mismo permiso que guardar_metas_tienda (Configuración ▸ Tiendas y caja). Deja rastro en configuracion_historial.';

-- ---------- 17. permisos de las funciones ----------
revoke execute on function
  retail.unirse_al_club(uuid, text, smallint, smallint, smallint, text, uuid, uuid, integer),
  retail.registrar_mensaje_publicidad(uuid, text, uuid),
  retail.registrar_desde_whatsapp(text, text, text, text, uuid),
  retail.registrar_baja_whatsapp(text, uuid),
  retail.resumen_clienta_caja(uuid),
  retail.fn_club_textos_vigentes(),
  retail.guardar_whatsapp_tienda(uuid, text)
from public, anon;

grant execute on function
  retail.unirse_al_club(uuid, text, smallint, smallint, smallint, text, uuid, uuid, integer),
  retail.registrar_mensaje_publicidad(uuid, text, uuid),
  retail.registrar_desde_whatsapp(text, text, text, text, uuid),
  retail.registrar_baja_whatsapp(text, uuid),
  retail.resumen_clienta_caja(uuid),
  retail.fn_club_textos_vigentes(),
  retail.guardar_whatsapp_tienda(uuid, text)
to authenticated;

-- ---------- 18. legado: el permiso marcado en caja antes de este archivo pasa a socia SIN publicidad ----------
-- Solo con un celular válido, documento y nombre (CL-1: lo que una socia necesita). club_desde = cuando se marcó, y el
-- evento lleva esa misma fecha: la foto sale de la historia. Idempotente: una ficha que ya es socia no se vuelve a tocar.
do $legado$
declare
  r record;
  v_celular text;
  v_socias integer := 0;
  v_sin_celular integer := 0;
  v_sin_documento integer := 0;
begin
  for r in
    select c.id, c.telefono_whatsapp, c.whatsapp_consentimiento_en,
           c.documento_numero is not null and nullif(btrim(c.nombre), '') is not null as con_documento_y_nombre
      from retail.clientas c
     where c.whatsapp_consentimiento_en is not null
       and c.club_desde is null
       and not c.anonimizada
     order by c.whatsapp_consentimiento_en, c.id
       for update
  loop
    v_celular := retail.fn_celular_normalizado(r.telefono_whatsapp);
    if v_celular is null or v_celular !~ '^9[0-9]{8}$' then
      v_sin_celular := v_sin_celular + 1;
      continue;
    end if;
    if not r.con_documento_y_nombre then
      v_sin_documento := v_sin_documento + 1;
      continue;
    end if;
    update retail.clientas
       set telefono_whatsapp = v_celular,
           club_desde = r.whatsapp_consentimiento_en,
           codigo_club = retail.fn_club_codigo_nuevo()
     where id = r.id;
    insert into retail.club_permisos (clienta_id, finalidad, accion, medio, nota, created_at)
    values (r.id, 'club', 'otorga', 'legado', 'marcado en caja antes de ADR-0288: socia sin publicidad', r.whatsapp_consentimiento_en);
    v_socias := v_socias + 1;
  end loop;
  raise notice 'Legado del club (ADR-0288): % ficha(s) con el permiso marcado en caja pasaron a socias SIN publicidad; % quedaron fuera por no tener un celular válido y % por no tener documento o nombre (CL-1).',
    v_socias, v_sin_celular, v_sin_documento;
end
$legado$;

reset lock_timeout;
notify pgrst, 'reload schema';
-- ============================== FIN DE LA PARTE 2 ==============================
