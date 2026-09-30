-- ============================================================================
-- 20260930160000_club_paso1a_venta_ligada_y_documento.sql — CAYLA V2 · Club de clientas · paso 1, tanda 1a
-- ADR-0288 (D-1, D-2 y CL-27). Una sola parte: sin políticas ni `drop trigger` (CLAUDE.md, «Políticas y deadlocks»).
--
-- EL PROBLEMA. Ninguna venta llegaba a la ficha de nadie: `registrar_venta` acepta `p_cliente_id` desde el 2026-09-22 y
-- `ventas.cliente_id` tiene su FK a `clientas`, pero Cobrar nunca lo mandaba (verificado en main y en producción el
-- 2026-09-30: 0 ventas con clienta). Y la ficha guardaba el documento en una columna `dni`, así que un carné de
-- extranjería o un pasaporte (CL-2) habría quedado escrito como si fuera un DNI: en la boleta sale con el código «1»
-- de SUNAT y un número que RENIEC no conoce.
--
-- QUÉ HACE
--   1. `clientas.dni` pasa a `documento_numero`, y se suma `documento_tipo` (`dni` por defecto, `carne_extranjeria` o
--      `pasaporte`). El único pasa a `(documento_tipo, documento_numero)`. Candado de formato: DNI de 8 dígitos; carné y
--      pasaporte, de 6 a 12 letras o dígitos, en mayúsculas.
--   2. `registrar_clienta` y `editar_clienta` cambian de parámetros (`p_dni` → `p_documento_tipo` + `p_documento_numero`):
--      se suelta la firma vieja y se crea la nueva (un `create or replace` con otros parámetros crea una sobrecarga).
--      El resto de su comportamiento no cambia; el permiso de WhatsApp (`p_acepta_whatsapp`) se rehace en la tanda 1b.
--   3. Al registrar o editar el documento, sus compras anteriores sin clienta cuyo comprobante lleva ese mismo tipo y
--      número se ligan a su ficha (CL-27), con un ayudante interno, `fn_ligar_ventas_por_documento`.
--   4. `buscar_clienta`, `archivar_clienta` y `unir_clientas`: reemplazos anclados sobre su cuerpo vivo (solo cambian
--      las líneas de `dni`).
--   5. `registrar_venta`: la venta se liga a la clienta que manda Cobrar. Si esa ficha se unió a otra, se liga a la que
--      quedó; si está anonimizada, la venta se rechaza con el hint `clienta_anonimizada`.
--
-- DECIDÍ: la venta con clienta NO exige el módulo «Clientas» en `registrar_venta`. El id de la ficha solo sale de
--   `buscar_clienta`, que sí lo exige, y exigirlo aquí haría fallar una venta ENTERA que esperaba en la cola sin conexión
--   si al rol le quitaron el módulo en el camino. La venta no se pierde por una etiqueta.
-- DESCARTÉ: dejar la columna `dni` y sumar solo el tipo (cada función futura tendría que recordar que «dni» no siempre
--   es un DNI), y un parámetro nuevo `p_clienta_id` en `registrar_venta` (dos nombres para lo mismo).
-- SE ROMPE SI: una función nueva vuelve a leer `clientas.dni`. La sección 6 falla si queda alguna.
--
-- CANDADO DE VERSIÓN. Antes de tocar nada, la sección 0 compara el md5 NORMALIZADO (sin comentarios ni espacios) del
-- cuerpo vivo de las 6 funciones con el que tenían main y producción el 2026-09-30 (comparado en solo lectura: iguales)
-- o con el de después de este archivo. Con cualquier otro, aborta sin tocar nada.
--
-- CÓMO SE PEGA: este archivo SOLO en el SQL Editor de producción, y fusionar el PR enseguida. Entre el pegado y el
-- despliegue, registrar o editar una ficha desde la pantalla vieja falla con un mensaje (la venta sigue sin clienta);
-- leer y buscar funcionan igual. Se puede pegar dos veces (idempotente). `lock_timeout` de 3 s: si algo lo bloquea,
-- falla limpio y se vuelve a pegar.
--
-- CONCURRENCIA. Dos cajas registran el mismo documento a la vez: el único `(documento_tipo, documento_numero)` y el
-- upsert hacen que la segunda complete la ficha de la primera. Una venta que se liga mientras otra caja une esa ficha:
-- `unir_clientas` bloquea las dos filas (`for update`) y mueve las ventas; `registrar_venta` lee la ficha con `for key
-- share`, así que espera a que la unión termine y sigue `fusionada_en_id` (sin ese candado, la venta leía la ficha de antes
-- y quedaba colgada de la unida: lo prueba la carrera h3 de scripts/pruebas/club_venta_ligada.mjs).
-- CAÍDA EXTERNA. Nada de esto llama al padrón, a Lucode ni a WhatsApp.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 0. candado de versión ----------
do $guarda$
declare
  r record;
  v_md5 text;
begin
  for r in
    select * from (values
      -- firma                                                                                           antes (main = producción)           despues (este archivo)
      ('retail.registrar_clienta(text,text,text,boolean,smallint,smallint)',                             'eef0904d59c4f4f697c6f72790c9b0f6', null),
      ('retail.editar_clienta(uuid,text,text,text,boolean,boolean,smallint,smallint,jsonb,integer)',       '7399e713d8cc624c9c8522ef783b1d67', null),
      ('retail.buscar_clienta(text,boolean)',                                                            '889b7dc1d697156d480fe21c59ddae0d', '398706b77a9fdc51f70eec76a0cc23ae'),
      ('retail.archivar_clienta(uuid,text,boolean,integer)',                                             'eedd3fcb06a98a0984433cf1eaf7fc13', 'a3fa06de786fb5adcfc511e0eb66ec37'),
      ('retail.unir_clientas(uuid,uuid,integer,integer)',                                                '26d5a7986bea76e20f6e71017900e817', '39a5f804607137727b9b396dfa168995'),
      ('retail.registrar_venta(uuid,jsonb,jsonb,uuid,uuid,text,text,text,text,text,text,uuid,text,numeric,uuid,text)', '5981c7c4b863ae9ad511c1919dec770c', 'ff37a1e177ad7e0edf4411924751954b')
    ) as t(firma, antes, despues)
  loop
    select md5(regexp_replace(regexp_replace(regexp_replace(p.prosrc, '/\*.*?\*/', '', 'g'), '--[^' || chr(10) || ']*', '', 'g'), '\s+', '', 'g'))
      into v_md5
      from pg_proc p
     where p.oid = to_regprocedure(r.firma);
    -- Las dos firmas viejas de registrar/editar desaparecen al pegar: su ausencia es «después».
    if v_md5 is null and r.despues is not null then
      raise exception '% no existe en esta base: pega antes el paso 2 de Clientas (20260928140000 a 20260928190100).', r.firma;
    end if;
    if v_md5 is not null and v_md5 is distinct from r.antes and v_md5 is distinct from r.despues then
      raise exception '% cambió desde que se escribió esta migración (md5 normalizado %; se esperaba % —antes— o % —después—). No se reemplaza a ciegas: lee su definición viva y rehace este cambio sobre ESA versión.',
        r.firma, v_md5, r.antes, coalesce(r.despues, 'que ya no exista');
    end if;
  end loop;
end
$guarda$;

-- ---------- 1. el documento con tipo ----------
do $esquema$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'retail' and table_name = 'clientas' and column_name = 'dni') then
    alter table retail.clientas rename column dni to documento_numero;
  end if;
  if exists (select 1 from pg_constraint where conname = 'clientas_dni_no_vacio' and conrelid = 'retail.clientas'::regclass) then
    alter table retail.clientas rename constraint clientas_dni_no_vacio to clientas_documento_no_vacio;
  end if;
end
$esquema$;

alter table retail.clientas add column if not exists documento_tipo text not null default 'dni';

comment on column retail.clientas.documento_tipo is
  'Qué documento es documento_numero: dni (por defecto), carne_extranjeria o pasaporte (CL-2, ADR-0288). Solo el DNI se consulta en el padrón.';
comment on column retail.clientas.documento_numero is
  'El número del documento, sin espacios y en mayúsculas. Único junto con documento_tipo. Antes se llamaba dni (ADR-0288).';

-- Lo que ya hay se normaliza antes del candado (producción: 1 ficha, con un DNI de 8 dígitos, el 2026-09-30).
update retail.clientas
   set documento_numero = upper(regexp_replace(documento_numero, '\s', '', 'g'))
 where documento_numero is not null
   and documento_numero <> upper(regexp_replace(documento_numero, '\s', '', 'g'));

alter table retail.clientas drop constraint if exists clientas_documento_tipo_valido;
alter table retail.clientas add constraint clientas_documento_tipo_valido
  check (documento_tipo in ('dni', 'carne_extranjeria', 'pasaporte'));

alter table retail.clientas drop constraint if exists clientas_documento_formato;
alter table retail.clientas add constraint clientas_documento_formato
  check (
    documento_numero is null
    or (documento_tipo = 'dni' and documento_numero ~ '^[0-9]{8}$')
    or (documento_tipo in ('carne_extranjeria', 'pasaporte') and documento_numero ~ '^[A-Z0-9]{6,12}$')
  ) not valid;
-- Se valida solo si ninguna ficha vieja lo viola (producción: ninguna, el 2026-09-30). En una base local con datos
-- viejos (el seed de antes traía una empresa con RUC como «clienta») la migración no aborta: el candado ya vale para
-- toda ficha nueva o editada, y avisa cuántas quedan por corregir a mano. Nunca se borra ni se cambia un documento.
do $formato$
declare
  v_malas integer;
begin
  select count(*) into v_malas from retail.clientas
   where documento_numero is not null
     and not ((documento_tipo = 'dni' and documento_numero ~ '^[0-9]{8}$')
          or (documento_tipo in ('carne_extranjeria', 'pasaporte') and documento_numero ~ '^[A-Z0-9]{6,12}$'));
  if v_malas = 0 then
    alter table retail.clientas validate constraint clientas_documento_formato;
  else
    raise notice '% ficha(s) tienen un documento que no cumple el formato (¿un RUC guardado como DNI?). El candado vale para lo nuevo; corrígelas en /clientas y luego: alter table retail.clientas validate constraint clientas_documento_formato;', v_malas;
  end if;
end
$formato$;

drop index if exists retail.clientas_dni_unico;
create unique index if not exists clientas_documento_unico
  on retail.clientas (documento_tipo, documento_numero)
  where documento_numero is not null;

-- ---------- 2. ayudante: normalizar y validar el documento (un solo lugar para los mensajes) ----------
-- PROMETE: devuelve el número limpio (sin espacios, en mayúsculas) o null si viene vacío; rechaza con un mensaje listo
--   para mostrar (hint `documento_invalido`) un tipo desconocido o un número con otro formato.
-- Interno: sin EXECUTE para la API.
create or replace function retail.fn_documento_clienta(p_tipo text, p_numero text)
returns text
language plpgsql
immutable
set search_path = retail, public, extensions
as $$
declare
  v_numero text := nullif(upper(regexp_replace(coalesce(p_numero, ''), '\s', '', 'g')), '');
begin
  if p_tipo is null or p_tipo not in ('dni', 'carne_extranjeria', 'pasaporte') then
    raise exception 'El tipo de documento tiene que ser DNI, carné de extranjería o pasaporte.'
      using errcode = '22023', hint = 'documento_invalido';
  end if;
  if v_numero is null then
    return null;
  end if;
  if p_tipo = 'dni' and v_numero !~ '^[0-9]{8}$' then
    raise exception 'El DNI tiene 8 dígitos.' using errcode = '22023', hint = 'documento_invalido';
  end if;
  if p_tipo <> 'dni' and v_numero !~ '^[A-Z0-9]{6,12}$' then
    raise exception 'El % tiene de 6 a 12 letras o números, sin guiones.',
      case p_tipo when 'pasaporte' then 'pasaporte' else 'carné de extranjería' end
      using errcode = '22023', hint = 'documento_invalido';
  end if;
  return v_numero;
end;
$$;

revoke all on function retail.fn_documento_clienta(text, text) from public, anon, authenticated;

-- ---------- 3. ayudante: ligar sus compras anteriores (CL-27) ----------
-- PROMETE: liga a la ficha las ventas SIN clienta cuyo comprobante lleva ese tipo y número de documento, y devuelve
--   cuántas. Nunca mueve una venta que ya es de otra ficha. Hoy el comprobante solo guarda DNI y RUC, así que un carné
--   o un pasaporte no liga nada hasta la tanda 1e (el comprobante con esos tipos): la misma línea los ligará entonces.
-- Interno: la llaman registrar_clienta y editar_clienta.
create or replace function retail.fn_ligar_ventas_por_documento(p_clienta_id uuid, p_tipo text, p_numero text)
returns integer
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_ligadas integer := 0;
begin
  if p_clienta_id is null or p_numero is null then
    return 0;
  end if;
  update retail.ventas v
     set cliente_id = p_clienta_id
    from retail.comprobantes co
   where co.venta_id = v.id
     and v.cliente_id is null
     and co.cliente_tipo_doc = p_tipo
     and co.cliente_num_doc = p_numero;
  get diagnostics v_ligadas = row_count;
  return v_ligadas;
end;
$$;

revoke all on function retail.fn_ligar_ventas_por_documento(uuid, text, text) from public, anon, authenticated;

-- ---------- 4. registrar_clienta y editar_clienta: documento con tipo ----------
drop function if exists retail.registrar_clienta(text, text, text, boolean, smallint, smallint);

create or replace function retail.registrar_clienta(
  p_documento_tipo text default 'dni',
  p_documento_numero text default null,
  p_nombre text default null,
  p_telefono_whatsapp text default null,
  p_acepta_whatsapp boolean default false,
  p_cumple_dia smallint default null,
  p_cumple_mes smallint default null
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
  v_telefono text := nullif(btrim(p_telefono_whatsapp), '');
  v_estaba_archivada boolean;
  v_ligadas integer;
begin
  -- La ficha es del módulo «Clientas»: se pregunta a la CUENTA, antes de resolver quién firma.
  perform retail.fn_exigir_modulo('clientas');
  v_persona := retail.fn_actor_persona_id(true);
  v_numero := retail.fn_documento_clienta(v_tipo, p_documento_numero);

  if v_numero is not null then
    -- ¿Vuelve una clienta con su ficha archivada? (Felipe, 2026-09-27): se reactiva sola y sigue con su historial. La fila
    -- se toma con `for update`: si dos cajas la registran a la vez, la segunda espera y ya la encuentra activa.
    select c.archivada_en is not null into v_estaba_archivada
      from retail.clientas c
     where c.documento_tipo = v_tipo and c.documento_numero = v_numero
       for update;

    -- Upsert por documento: una clienta que ya existe no se duplica, se completa. El índice clientas_documento_unico es
    -- parcial: `on conflict` repite su `where` para poder inferirlo.
    insert into retail.clientas (documento_tipo, documento_numero, nombre, telefono_whatsapp, whatsapp_consentimiento_en, cumple_dia, cumple_mes, created_por)
    values (
      v_tipo, v_numero, v_nombre, v_telefono,
      case when p_acepta_whatsapp then now() else null end,
      p_cumple_dia, p_cumple_mes, v_persona
    )
    on conflict (documento_tipo, documento_numero) where documento_numero is not null do update set
      nombre = coalesce(excluded.nombre, retail.clientas.nombre),
      telefono_whatsapp = coalesce(excluded.telefono_whatsapp, retail.clientas.telefono_whatsapp),
      -- Explícita a true: (re)confirma el consentimiento con fecha nueva. Sin marcar (false, el default): NUNCA revoca uno
      -- ya dado. La tanda 1b rehace este permiso (ADR-0288 D-4).
      whatsapp_consentimiento_en = case
        when p_acepta_whatsapp then now()
        else retail.clientas.whatsapp_consentimiento_en
      end,
      cumple_dia = coalesce(excluded.cumple_dia, retail.clientas.cumple_dia),
      cumple_mes = coalesce(excluded.cumple_mes, retail.clientas.cumple_mes),
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
    insert into retail.clientas (documento_tipo, nombre, telefono_whatsapp, whatsapp_consentimiento_en, cumple_dia, cumple_mes, created_por)
    values (
      v_tipo, v_nombre, v_telefono,
      case when p_acepta_whatsapp then now() else null end,
      p_cumple_dia, p_cumple_mes, v_persona
    )
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

comment on function retail.registrar_clienta(text, text, text, text, boolean, smallint, smallint) is
  'Alta de clienta, o upsert por (tipo, número de documento) si se repite; si ese documento es de una ficha archivada, la reactiva con su historial. Al registrarla con documento, liga sus compras anteriores con ese mismo documento (CL-27, ADR-0288). Solo para cuentas que ven el módulo «Clientas» (42501 clientas_sin_modulo). Firma con el responsable del combo (fn_actor_persona_id(true), ADR-0162).';

drop function if exists retail.editar_clienta(uuid, text, text, text, boolean, boolean, smallint, smallint, jsonb, integer);

create or replace function retail.editar_clienta(
  p_id uuid,
  p_documento_tipo text default 'dni',
  p_documento_numero text default null,
  p_nombre text default null,
  p_telefono_whatsapp text default null,
  p_acepta_whatsapp boolean default false,
  p_revoca_whatsapp boolean default false,
  p_cumple_dia smallint default null,
  p_cumple_mes smallint default null,
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
  v_ligadas integer := 0;
begin
  perform retail.fn_exigir_modulo('clientas');
  v_persona := retail.fn_actor_persona_id(true);
  v_numero := retail.fn_documento_clienta(v_tipo, p_documento_numero);

  select * into v_actual from retail.clientas where id = p_id;
  if v_actual.id is null then
    raise exception 'Esa clienta ya no existe — actualiza la pantalla.';
  end if;
  if v_actual.archivada_en is not null then
    raise exception 'Esta ficha está archivada — reactívala antes de editarla.';
  end if;

  -- ADR-0193: candado optimista. `for update` cierra la carrera de dos guardados a la vez (el segundo espera al primero y,
  -- al despertar, ya no encuentra la fila en la versión que pidió).
  if p_version_esperada is not null then
    perform 1 from retail.clientas where id = p_id and version = p_version_esperada for update;
    if not found then
      raise exception 'Alguien más editó esta ficha mientras la mirabas. Recarga para ver sus cambios.'
        using errcode = 'PT409', hint = 'version_cambiada';
    end if;
  end if;

  begin
    update retail.clientas set
      documento_tipo = v_tipo,
      documento_numero = v_numero,
      nombre = nullif(btrim(p_nombre), ''),
      telefono_whatsapp = nullif(btrim(p_telefono_whatsapp), ''),
      whatsapp_consentimiento_en = case
        when p_revoca_whatsapp then null
        when p_acepta_whatsapp then now()
        else whatsapp_consentimiento_en
      end,
      cumple_dia = p_cumple_dia,
      cumple_mes = p_cumple_mes,
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
    jsonb_build_object('revoco_whatsapp', p_revoca_whatsapp, 'ventas_ligadas', v_ligadas), 'vivo'
  );

  return (select version from retail.clientas where id = p_id);
end;
$$;

revoke execute on function
  retail.registrar_clienta(text, text, text, text, boolean, smallint, smallint),
  retail.editar_clienta(uuid, text, text, text, text, boolean, boolean, smallint, smallint, jsonb, integer)
from public, anon;

grant execute on function
  retail.registrar_clienta(text, text, text, text, boolean, smallint, smallint),
  retail.editar_clienta(uuid, text, text, text, text, boolean, boolean, smallint, smallint, jsonb, integer)
to authenticated;

-- ---------- 5. reemplazos anclados sobre el cuerpo vivo ----------
create or replace function pg_temp.reemplazar_club1a_20260930(p_firma text, p_viejo text, p_nuevo text)
returns void language plpgsql as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  -- Ya aplicado (pegar dos veces es inocuo). Se mira ANTES de contar el ancla: el texto nuevo de registrar_venta empieza por
  -- su propia ancla, que sigue ahí después del primer pegado; contada primero, el segundo pegado duplicaba el bloque D-1.
  if position(p_nuevo in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta migración: se esperaba 1 vez «%» y hay %.', p_firma, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- buscar_clienta: el número de cualquier documento, sin espacios y en mayúsculas.
select pg_temp.reemplazar_club1a_20260930('retail.buscar_clienta(text,boolean)',
  '      dni = btrim(p_termino)',
  '      documento_numero = upper(regexp_replace(p_termino, ''\s'', '''', ''g''))');

-- archivar_clienta: anonimizar vacía el número del documento (el tipo no es un dato personal).
select pg_temp.reemplazar_club1a_20260930('retail.archivar_clienta(uuid,text,boolean,integer)',
  '    dni = case when p_anonimizar then null else dni end,',
  '    documento_numero = case when p_anonimizar then null else documento_numero end,');

-- unir_clientas: la perdedora suelta su documento; la que queda toma el tipo y el número si no tenía.
select pg_temp.reemplazar_club1a_20260930('retail.unir_clientas(uuid,uuid,integer,integer)',
  '    dni = null, nombre = ''Clienta anonimizada'',',
  '    documento_numero = null, nombre = ''Clienta anonimizada'',');
select pg_temp.reemplazar_club1a_20260930('retail.unir_clientas(uuid,uuid,integer,integer)',
  '    dni = coalesce(dni, v_fusionar.dni),',
  '    documento_tipo = case when documento_numero is null and v_fusionar.documento_numero is not null
                          then v_fusionar.documento_tipo else documento_tipo end,
    documento_numero = coalesce(documento_numero, v_fusionar.documento_numero),');

-- registrar_venta (D-1): la venta se liga a la ficha que manda Cobrar, siguiendo una unión y rechazando una anonimizada.
-- Un solo ancla, sin tocar la declaración ni el `insert` (así no depende de comentarios que difieren entre bases): un
-- bloque anidado resuelve la ficha y deja el resultado en el mismo `p_cliente_id` (en PL/pgSQL un parámetro se puede
-- reasignar), que es lo que el `insert into ventas` ya guarda.
select pg_temp.reemplazar_club1a_20260930(
  'retail.registrar_venta(uuid,jsonb,jsonb,uuid,uuid,text,text,text,text,text,text,uuid,text,numeric,uuid,text)',
  '  v_persona := retail.fn_actor_persona_id(true);',
  '  v_persona := retail.fn_actor_persona_id(true);

  -- ADR-0288 D-1: la clienta del ticket. Si su ficha se unió a otra, la venta va a la que quedó (unir_clientas ya movió
  -- las anteriores); si está anonimizada, pidió que la olvidaran y no se le cuelga nada nuevo.
  -- Variables sueltas y no un `record`: sin clienta (la mayoría de las ventas) nadie las asigna, y leer un campo de un
  -- `record` sin asignar falla («record is not assigned yet») aunque el `and` de al lado ya sea falso.
  -- `for key share`: si otra caja está uniendo esta ficha (unir_clientas la toma con `for update`), la venta espera a que
  -- termine y sigue la unión; sin él, leía la ficha de antes de la unión y la venta quedaba colgada de la ficha unida.
  declare
    v_ficha_id uuid;
    v_ficha_anonimizada boolean;
    v_ficha_fusionada_en uuid;
    v_saltos_union integer := 0;
  begin
    while p_cliente_id is not null loop
      select c.id, c.anonimizada, c.fusionada_en_id into v_ficha_id, v_ficha_anonimizada, v_ficha_fusionada_en
        from retail.clientas c where c.id = p_cliente_id for key share;
      if v_ficha_id is null then
        raise exception ''Esa clienta ya no está en la libreta. Quítala del ticket y vuelve a buscarla.''
          using hint = ''clienta_no_existe'';
      end if;
      exit when v_ficha_fusionada_en is null;
      v_saltos_union := v_saltos_union + 1;
      if v_saltos_union > 10 then
        raise exception ''La ficha de esta clienta tiene una cadena de uniones demasiado larga. Avísale al líder.'';
      end if;
      p_cliente_id := v_ficha_fusionada_en;
    end loop;
    if v_ficha_anonimizada then
      raise exception ''Esta clienta pidió borrar sus datos: la venta no se puede guardar a su nombre. Quítala del ticket y vende sin clienta.''
        using hint = ''clienta_anonimizada'';
    end if;
  end;');

drop function pg_temp.reemplazar_club1a_20260930(text, text, text);

-- ---------- 6. nada en retail vuelve a leer clientas.dni ----------
do $sin_dni$
declare
  v_quienes text;
begin
  select string_agg(p.oid::regprocedure::text, ', ')
    into v_quienes
    from pg_proc p
   where p.pronamespace = 'retail'::regnamespace
     and p.prosrc ~ 'clientas'
     -- Sin comentarios: se busca `dni` como identificador (columna o campo de un registro), no el texto 'dni' entre
     -- comillas (un tipo de documento) ni la palabra en un comentario.
     and regexp_replace(regexp_replace(p.prosrc, '/\*.*?\*/', '', 'g'), '--[^' || chr(10) || ']*', '', 'g')
         ~ '(^|[^a-z_''])dni([^a-z_'']|$)'
     and p.proname not in ('separar_prendas');  -- usa su propio `clienta_dni` y el parámetro `p_clienta_dni`
  if v_quienes is not null then
    raise exception 'Estas funciones todavía nombran clientas.dni (ahora documento_numero): %', v_quienes;
  end if;
end
$sin_dni$;
