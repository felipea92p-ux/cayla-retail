-- ============================================================================
-- 20260928190000_clientas_por_modulo_y_anonimizar_todo.sql — CAYLA V2 · Clientas · PARTE 1 de 2 (solo funciones)
-- ADR-0249, «Actualización 2026-09-28». Tres decisiones de Felipe sobre la ficha de clienta, en un solo pegado.
--
-- EL PROBLEMA, EN TRES PARTES.
--   (c) Clientas por módulo (B-03, Felipe 2026-09-26, opción a). La pantalla /clientas ya exige el módulo «Clientas»
--       (`exigirModulo`), pero sus 11 funciones son `security definer` y no lo preguntaban: la puerta de la pantalla no es
--       la de la base. Desde este archivo, las 11 preguntan a la CUENTA de la sesión (persona o terminal) si su rol ve el
--       módulo, antes de hacer nada.
--   (a) La clienta que vuelve (Felipe 2026-09-27). Si su ficha estaba archivada y se la registra de nuevo con su DNI,
--       `registrar_clienta` reusaba la ficha SIN reactivarla: la clienta quedaba escondida (el buscador no muestra
--       archivadas) y lo que se le vendiera se colgaba de una ficha invisible. Ahora la reactiva sola y sigue con su
--       historial.
--   (b) Anonimizar borra todo (Felipe 2026-09-27, Ley 29733). Anonimizar dejaba la ficha limpia, pero su nombre, su DNI y su
--       celular seguían en dos lugares: la foto de la ficha en `clientas_fusiones.ficha_fusionada` (cuando se le unió otra
--       ficha) y las frases de `retail.actividad`: las de Clientas («Editó la ficha de Ana Pérez», «Archivó la ficha de
--       4455…: …») y las de Apartados («apartó «Blusa» para Ana Pérez…», «abonó S/ 20 al apartado APT-TRU-0007 de Ana
--       Pérez…», con el nombre también en `detalle.clienta`). Ahora anonimizar limpia también las fusiones de esa persona, y
--       la actividad deja de escribir datos de la clienta: Clientas dice «una clienta» y Apartados «la clienta». Quién es
--       queda solo en la fila (tabla y registro_id: la ficha o el apartado), que después de anonimizar la ficha ya no la
--       nombra.
--
-- DECIDÍ (c): un ayudante `retail.fn_exigir_modulo(clave)` que rechaza con 42501 y el hint estable `<clave>_sin_modulo`
--   (la web lo traduce en error-escritura.ts), llamado en la primera línea de las 11, ANTES de `fn_actor_persona_id(true)`:
--   una cuenta sin el módulo recibe «no tienes Clientas», no «elige quién hace esta operación». La pregunta es a la cuenta
--   (`fn_ve_modulo`, que ya incluye al líder y al admin), nunca al responsable del combo: el combo decide quién FIRMA, no
--   qué puede ver la cuenta (CLAUDE.md, «Módulos y roles»).
-- DESCARTÉ: la misma guarda de 4 líneas copiada en 11 funciones (once textos que se desincronizan: el día que cambie el
--   mensaje o el hint, alguna se queda con el viejo), y devolver 0 filas en silencio desde las lecturas («no hay clientas» y
--   «no tienes permiso» se leerían igual).
-- SE ROMPE SI: alguien le quita «Clientas» a un rol que vende con clienta. Hoy todo rol con Vender, Historial o Facturación
--   la tiene (Integrante y Terminal de ventas; consultado en producción el 2026-09-28) y el Punto de venta ya no le ofrece la
--   búsqueda a quien no la tiene. O alguien le pasa al ayudante un nombre de módulo armado en tiempo de ejecución: la prueba
--   de cobertura (roles_cobertura_modulos) solo cuenta `fn_exigir_modulo('clave')` con literal.
--
-- DECIDÍ (a): en `registrar_clienta`, cuando el DNI cae en una ficha archivada, el mismo upsert la reactiva (vacía
--   archivada_en, archivada_por y motivo_archivo; `version` sube sola por su disparador) y completa lo que venga, igual que
--   con una activa. La actividad lo anota sin nombre. Una ficha anonimizada o unida a otra no tiene DNI (el esquema lo
--   exige), así que el DNI nunca cae en ellas: la clienta anonimizada que vuelve es una ficha nueva (pidió que la
--   olvidaran), y la que se unió a otra encuentra la ficha que se conservó, porque `unir_clientas` le pasó el DNI.
-- DESCARTÉ: seguir el rastro `fusionada_en_id` dentro de `registrar_clienta` para «devolver la ficha que se conservó»: es
--   un caso que el esquema ya hace imposible, y un `if` para un estado imposible es código que nadie ejercita. En su lugar,
--   el candado nuevo `clientas_fusionada_implica_anonimizada` lo deja escrito en la base: una ficha unida a otra está
--   anonimizada, y una anonimizada no tiene DNI ni celular (candado de 20260928140000).
-- SE ROMPE SI: alguien cambia el upsert por DNI por una búsqueda que también mire el celular: el celular no es único y dos
--   fichas pueden compartirlo (por eso existe «unir fichas», D-99). Ese día, cuál reactivar es una decisión de negocio.
--
-- DECIDÍ (b): la actividad PREVIENE en vez de borrar. `retail.actividad` es de solo agregar para todo el ERP (ADR-0207,
--   disparador `trg_actividad_inmutable`): en vez de abrirle una excepción para que anonimizar la edite, nadie escribe en
--   ella datos de la clienta. Las funciones de Clientas dejan de escribir el nombre, el DNI, el celular y el motivo escrito
--   a mano (puede nombrarla); las dos de Apartados (`fn_actividad_separacion`, `trg_actividad_separacion_hijas`) dejan de
--   copiar el nombre del apartado: dicen «la clienta», y el resto de cada frase queda igual. Lo único que queda que limpiar
--   son las filas escritas ANTES de este archivo: se reescriben aquí, una sola vez, apagando el candado a la vista solo si
--   hay alguna (producción tenía 0 de Clientas y 0 de Apartados el 2026-09-28: ahí ni se toca la tabla). Y al anonimizar,
--   `archivar_clienta` vacía en la misma transacción la foto de `clientas_fusiones` de esa persona: la de cada ficha que se
--   le unió (o que se unió a una que se le unió), porque son la misma persona. El motivo que se escribe al anonimizar se
--   sigue pidiendo (es la pausa antes de algo que no se deshace) pero no se guarda: la ficha queda con «Anonimizada (Ley
--   29733)».
-- DESCARTÉ: una excepción en `trg_actividad_inmutable` para que anonimizar reescriba las filas de la clienta: agujerea el
--   registro de solo agregar de TODOS los módulos, y encima tendría que encontrar las líneas de Apartados por el texto del
--   nombre (el apartado copia nombres y apellidos escritos en caja, la ficha no: «Ana Pérez» y «Ana María Pérez Ríos» no
--   se encuentran). Y guardar el motivo quitándole «a mano» el nombre y el DNI: un nombre mal escrito o un apodo pasan
--   igual. Lo que se pierde: «abonó S/ 20 al apartado APT-TRU-0007 de la clienta» ya no dice su nombre de un vistazo; el
--   código del apartado lleva a él.
-- SE ROMPE SI: una función nueva vuelve a copiar el nombre, el DNI o el celular de la clienta en `descripcion` o en
--   `detalle`. Lo vigilan dos pruebas: clientas_por_modulo_y_anonimizar (busca el DNI, el nombre y el celular en todas las
--   columnas de clientas, clientas_fusiones y actividad después de anonimizar, y nombra toda función que anota actividad
--   leyendo las columnas de la clienta de un apartado) y separaciones.mjs (recorre un apartado entero sin encontrarla).
--   Fuera de esto, a propósito: lo que un apartado o un comprobante copiaron al hacerse (el nombre en `separaciones`, el
--   documento en `comprobantes`) es un documento de esa operación y se conserva (docs/datos/06-DATOS-PERSONALES.md §7: «se
--   anonimiza el dato, se conserva el documento»); el ADR-0249 lo deja como decisión aparte. Tampoco el texto libre que una
--   persona escribe en otro módulo (el motivo de un descuento o de una anulación): si nombra a la clienta, no hay cómo
--   encontrarlo con certeza.
--
-- CANDADO DE VERSIÓN. Recrea 13 funciones enteras (las 11 de la ficha y las 2 de la actividad de Apartados). Antes de tocar
-- nada, la sección 0 compara el md5 NORMALIZADO del cuerpo vivo de cada una (sin comentarios `--` ni `/* */` y sin
-- espacios: una sangría o un comentario distinto no lo cambian) con dos valores: el de main y producción ANTES de este
-- archivo, o el de DESPUÉS (pegarlo dos veces es inocuo). Con cualquier otro, aborta y no reemplaza nada: alguien la cambió
-- en vivo y hay que rehacer este cambio sobre ESA versión. Ninguna de las 13 tiene reemplazos en vivo (`reemplazar_vivo`) en el repo;
-- `registrar_clienta` parte de su cuerpo vivo (20260922140000 + el reemplazo de 20260923100000 que la hizo firmar con
-- `fn_actor_persona_id(true)`). Los trece «antes» se compararon con producción el 2026-09-28 (solo lectura): iguales.
--
-- CÓMO SE PEGA (dos partes, cada una SOLA en el SQL Editor de producción; se pueden pegar más de una vez, y en cualquier
-- orden, aunque este es el recomendado):
--   1. ESTE archivo: solo funciones, un candado nuevo en `clientas` (0 filas en producción), permisos de
--      `clientas_fusiones` y comentarios. Sin políticas ni `drop trigger` (CLAUDE.md, «Políticas y deadlocks»). Con
--      `lock_timeout` de 3 s: si algo lo bloquea, falla limpio y se vuelve a pegar.
--   2. 20260928190100_clientas_politicas_por_modulo.sql: SOLO las políticas.
--
-- VERIFICACIÓN DESPUÉS DE PEGAR (solo lectura). Cada md5 tiene que dar el de la columna «despues» de la sección 0:
--   select p.oid::regprocedure as funcion,
--          md5(regexp_replace(regexp_replace(regexp_replace(p.prosrc, '/\*.*?\*/', '', 'g'), '--[^' || chr(10) || ']*', '', 'g'), '\s+', '', 'g')) as md5_normalizado
--     from pg_proc p
--    where p.pronamespace = 'retail'::regnamespace
--      and p.proname in ('fn_exigir_modulo', 'registrar_clienta', 'buscar_clienta', 'editar_clienta', 'archivar_clienta',
--                        'reactivar_clienta', 'unir_clientas', 'exportar_clientas', 'fn_clienta_compras', 'fn_clienta_cambios',
--                        'fn_clienta_devoluciones', 'fn_clienta_separaciones', 'fn_actividad_separacion',
--                        'trg_actividad_separacion_hijas')
--    order by 1;
--
-- CONCURRENCIA. Dos cajas registran a la vez a la misma clienta archivada: `registrar_clienta` toma la fila con `for update`
-- antes del upsert; la segunda espera, la encuentra ya activa y no anota una segunda reactivación. Anonimizar y unir a la
-- vez sobre la misma ficha: `unir_clientas` bloquea sus dos filas y `archivar_clienta` pide la versión que leyó (PT409): una
-- de las dos gana entera y la otra se rechaza con un mensaje claro.
-- CAÍDA EXTERNA. Nada de esto toca SUNAT/Lucode, el padrón ni WhatsApp.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 0. candado de versión: no pisar en silencio una función que ya no es la que se revisó ----------
do $guarda$
declare
  r record;
  v_md5 text;
begin
  for r in
    select * from (values
      -- firma                                                                                     antes (main = producción)           despues (este archivo)
      ('retail.fn_exigir_modulo(text)',                                                            null,                               'feba9aed1cb89b7ef3dce1fa6807814c'),
      ('retail.registrar_clienta(text,text,text,boolean,smallint,smallint)',                       '7f71055c7f41e483056481790945af3b', 'eef0904d59c4f4f697c6f72790c9b0f6'),
      ('retail.buscar_clienta(text,boolean)',                                                      '740a93d34137446e3fb069bd7fc72b83', '889b7dc1d697156d480fe21c59ddae0d'),
      ('retail.editar_clienta(uuid,text,text,text,boolean,boolean,smallint,smallint,jsonb,integer)', 'f7189bb9f19ed9ecc0ee06f4a11e492d', '7399e713d8cc624c9c8522ef783b1d67'),
      ('retail.archivar_clienta(uuid,text,boolean,integer)',                                       '5bd0b3725b9f7d980afa48528ee3710d', 'eedd3fcb06a98a0984433cf1eaf7fc13'),
      ('retail.reactivar_clienta(uuid,integer)',                                                   '2a0d3b63a5fe12827309e91283a6d4db', '104b336e6f18fff3ca7f4ebb73c259cf'),
      ('retail.unir_clientas(uuid,uuid,integer,integer)',                                          'f316d5530575325098afce5c4b3f686f', '26d5a7986bea76e20f6e71017900e817'),
      ('retail.exportar_clientas()',                                                               'fe79263c5e698d9327af9bfe85389163', '80476e190db5e06cbabaa8bb0bb032ab'),
      ('retail.fn_clienta_compras(uuid)',                                                          'cb3223a2739d97cc5a1cddf53c189a1a', '4e70112f67b81461aad1fc813bdd057e'),
      ('retail.fn_clienta_cambios(uuid)',                                                          'b8decb3fb3ee19f5c00cdef62a563ad2', 'b1017922cc4a7b8df439865ea6c1bd82'),
      ('retail.fn_clienta_devoluciones(uuid)',                                                     'b6faaaad3fea31d84630d2cc209db8f7', '1d75051fe7276984bee50e3f88322b98'),
      ('retail.fn_clienta_separaciones(uuid)',                                                     'ff25130bc441b7801066f1dc886fb25a', 'b116d08edfa8db7793ab975de8608abd'),
      ('retail.fn_actividad_separacion(uuid,text,text)',                                           '1fbeffaeaff7772d72f30b929a38d6bf', 'feae2b4ae2ef50d0ae5488df4fa7d3fa'),
      ('retail.trg_actividad_separacion_hijas()',                                                  'ae25138d15cc91963edc29c6ce0c2525', '23eed0ef9113fb13593775d65675d3f1')
    ) as t(firma, antes, despues)
  loop
    select md5(regexp_replace(regexp_replace(regexp_replace(p.prosrc, '/\*.*?\*/', '', 'g'), '--[^' || chr(10) || ']*', '', 'g'), '\s+', '', 'g'))
      into v_md5
      from pg_proc p
     where p.oid = to_regprocedure(r.firma);
    if v_md5 is null and r.antes is not null then
      raise exception '% no existe en esta base: pega antes el paso 2 de Clientas (20260928140000 a 20260928180000) y la actividad de Apartados (20260927120000).', r.firma;
    end if;
    if v_md5 is not null and v_md5 is distinct from r.antes and v_md5 <> r.despues then
      raise exception '% cambió desde que se escribió esta migración (md5 normalizado %; se esperaba % —antes— o % —después—). No se reemplaza a ciegas: lee su definición viva y rehace este cambio sobre ESA versión.',
        r.firma, v_md5, coalesce(r.antes, 'que no exista'), r.despues;
    end if;
  end loop;
end
$guarda$;

-- ---------- 1. el ayudante: ¿la cuenta ve este módulo? ----------
-- PROMETE: vuelve sin hacer nada si la cuenta de la sesión (persona o terminal) ve el módulo `p_clave` según su rol (el
--   líder y el admin, siempre: `fn_ve_modulo`); si no, rechaza con 42501, un mensaje en castellano listo para mostrar y el
--   hint estable `<clave>_sin_modulo`.
-- ASUME: que quien lo llama pasa la clave con literal (`fn_exigir_modulo('clientas')`): así lo lee la prueba de cobertura.
-- Interno: sin EXECUTE para nadie de la API. Lo llaman funciones `security definer` (dueña `postgres`), que sí pueden.
create or replace function retail.fn_exigir_modulo(p_clave text)
returns void
language plpgsql
stable
set search_path = retail, public, extensions
as $$
begin
  -- `is not true` y no `not`: si la respuesta fuera NULL, tampoco deja pasar (falla cerrado).
  if retail.fn_ve_modulo(p_clave) is not true then
    raise exception 'Tu rol no tiene el módulo «%». Pídele al líder que lo active en Roles y accesos.',
      coalesce((select m.nombre from retail.modulos m where m.clave = p_clave), p_clave)
      using errcode = '42501', hint = p_clave || '_sin_modulo';
  end if;
end;
$$;

comment on function retail.fn_exigir_modulo(text) is
  'ADR-0249 (2026-09-28): rechaza con 42501 y hint <clave>_sin_modulo si la cuenta de la sesión no ve el módulo (fn_ve_modulo: el líder y el admin, siempre). Se pregunta a la CUENTA, nunca al responsable del combo. Interno: solo lo llaman funciones security definer.';

revoke all on function retail.fn_exigir_modulo(text) from public, anon, authenticated;

-- ---------- 2. registrar_clienta: el módulo, y la clienta archivada que vuelve se reactiva (a) ----------
create or replace function retail.registrar_clienta(
  p_dni text default null,
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
  v_dni text := nullif(btrim(p_dni), '');
  v_nombre text := nullif(btrim(p_nombre), '');
  v_telefono text := nullif(btrim(p_telefono_whatsapp), '');
  v_estaba_archivada boolean;
begin
  -- La ficha es del módulo «Clientas»: se pregunta a la CUENTA, antes de resolver quién firma.
  perform retail.fn_exigir_modulo('clientas');
  v_persona := retail.fn_actor_persona_id(true);

  if v_dni is not null then
    -- ¿Vuelve una clienta con su ficha archivada? (Felipe, 2026-09-27): se reactiva sola y sigue con su historial. La fila
    -- se toma con `for update`: si dos cajas la registran a la vez, la segunda espera y ya la encuentra activa.
    select c.archivada_en is not null into v_estaba_archivada
      from retail.clientas c
     where c.dni = v_dni
       for update;

    -- Upsert por DNI: una clienta que ya existe no se duplica, se completa. El índice clientas_dni_unico es parcial:
    -- `on conflict` repite su `where` para poder inferirlo.
    insert into retail.clientas (dni, nombre, telefono_whatsapp, whatsapp_consentimiento_en, cumple_dia, cumple_mes, created_por)
    values (
      v_dni, v_nombre, v_telefono,
      case when p_acepta_whatsapp then now() else null end,
      p_cumple_dia, p_cumple_mes, v_persona
    )
    on conflict (dni) where dni is not null do update set
      nombre = coalesce(excluded.nombre, retail.clientas.nombre),
      telefono_whatsapp = coalesce(excluded.telefono_whatsapp, retail.clientas.telefono_whatsapp),
      -- Explícita a true: (re)confirma el consentimiento con fecha nueva. Sin marcar (false, el default): NUNCA revoca uno
      -- ya dado (Ley 29733; «LA OBJECIÓN» de 20260922140000).
      whatsapp_consentimiento_en = case
        when p_acepta_whatsapp then now()
        else retail.clientas.whatsapp_consentimiento_en
      end,
      cumple_dia = coalesce(excluded.cumple_dia, retail.clientas.cumple_dia),
      cumple_mes = coalesce(excluded.cumple_mes, retail.clientas.cumple_mes),
      -- (a) La que vuelve deja de estar archivada. Con una activa no cambia nada.
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
  else
    insert into retail.clientas (nombre, telefono_whatsapp, whatsapp_consentimiento_en, cumple_dia, cumple_mes, created_por)
    values (
      v_nombre, v_telefono,
      case when p_acepta_whatsapp then now() else null end,
      p_cumple_dia, p_cumple_mes, v_persona
    )
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

comment on function retail.registrar_clienta(text, text, text, boolean, smallint, smallint) is
  'Alta de clienta, o upsert por DNI si se repite; si ese DNI es de una ficha archivada, la reactiva con su historial (ADR-0249, 2026-09-28). El consentimiento de WhatsApp solo se marca cuando p_acepta_whatsapp=true en ESA llamada; false nunca revoca uno ya dado. Solo para cuentas que ven el módulo «Clientas» (42501 clientas_sin_modulo). Firma con el responsable del combo (fn_actor_persona_id(true), ADR-0162).';

-- ---------- 3. buscar_clienta ----------
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
      dni = btrim(p_termino)
      or telefono_whatsapp = btrim(p_termino)
      or nombre ilike '%' || btrim(p_termino) || '%'
    )
  order by nombre nulls last, created_at desc
  limit 20;
$$;

comment on function retail.buscar_clienta(text, boolean) is
  'Busca por DNI o WhatsApp exactos, o por nombre (ILIKE). p_incluir_archivadas=false por defecto: una búsqueda normal no reaparece una ficha anonimizada o fusionada. Solo para cuentas que ven el módulo «Clientas» (42501 clientas_sin_modulo, ADR-0249 2026-09-28).';

-- ---------- 4. editar_clienta ----------
-- El consentimiento de WhatsApp sigue el criterio de `registrar_clienta` (nunca se revoca por omisión, ADR-0154) PERO aquí
-- sí se puede revocar a propósito, con su propio parámetro (`p_revoca_whatsapp`): la clienta puede pedir que no le escriban.
create or replace function retail.editar_clienta(
  p_id uuid,
  p_dni text default null,
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
begin
  perform retail.fn_exigir_modulo('clientas');
  v_persona := retail.fn_actor_persona_id(true);

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

  update retail.clientas set
    dni = nullif(btrim(p_dni), ''),
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

  -- (b) Sin nombre ni DNI: quién es queda en registro_id (ADR-0249, 2026-09-28).
  perform retail.fn_actividad_anotar(
    'clientas', 'editar', 'editó la ficha de una clienta',
    v_persona, null, null, null, 'clientas', p_id::text, now(),
    jsonb_build_object('revoco_whatsapp', p_revoca_whatsapp), 'vivo'
  );

  return (select version from retail.clientas where id = p_id);
end;
$$;

-- ---------- 5. archivar_clienta: anonimizar borra también las fusiones de esa persona (b) ----------
create or replace function retail.archivar_clienta(
  p_id uuid,
  p_motivo text,
  p_anonimizar boolean default false,
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
  v_motivo text := nullif(btrim(p_motivo), '');
  v_fusiones integer := 0;
begin
  perform retail.fn_exigir_modulo('clientas');
  v_persona := retail.fn_actor_persona_id(true);

  if v_motivo is null then
    raise exception 'Escribe un motivo antes de archivar a esta clienta.';
  end if;

  select * into v_actual from retail.clientas where id = p_id;
  if v_actual.id is null then
    raise exception 'Esa clienta ya no existe — actualiza la pantalla.';
  end if;
  if v_actual.archivada_en is not null then
    raise exception 'Esta ficha ya está archivada.';
  end if;

  if p_version_esperada is not null then
    perform 1 from retail.clientas where id = p_id and version = p_version_esperada for update;
    if not found then
      raise exception 'Alguien más cambió esta ficha mientras la mirabas. Recarga para ver sus cambios.'
        using errcode = 'PT409', hint = 'version_cambiada';
    end if;
  end if;

  update retail.clientas set
    archivada_en = now(),
    archivada_por = v_persona,
    -- (b) Al anonimizar, el motivo escrito no se guarda: puede nombrar a la clienta (Ley 29733, Felipe 2026-09-27).
    motivo_archivo = case when p_anonimizar then 'Anonimizada (Ley 29733)' else v_motivo end,
    anonimizada = p_anonimizar,
    dni = case when p_anonimizar then null else dni end,
    nombre = case when p_anonimizar then 'Clienta anonimizada' else nombre end,
    telefono_whatsapp = case when p_anonimizar then null else telefono_whatsapp end,
    whatsapp_consentimiento_en = case when p_anonimizar then null else whatsapp_consentimiento_en end,
    cumple_dia = case when p_anonimizar then null else cumple_dia end,
    cumple_mes = case when p_anonimizar then null else cumple_mes end,
    tallas = case when p_anonimizar then null else tallas end
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
      then jsonb_build_object('anonimizada', true, 'fusiones_limpiadas', v_fusiones)
      else jsonb_build_object('anonimizada', false)
    end,
    'vivo'
  );

  return (select version from retail.clientas where id = p_id);
end;
$$;

comment on function retail.archivar_clienta(uuid, text, boolean, integer) is
  'Archiva una ficha (nunca delete). p_anonimizar=true además le quita todo dato personal (Ley 29733) y, en la misma transacción, vacía la foto de clientas_fusiones de esa persona (las fichas que se le unieron); el motivo escrito no se guarda. Sus ventas, cambios, devoluciones y separaciones NO se tocan. p_version_esperada: ADR-0193. Solo con el módulo «Clientas» (ADR-0249, 2026-09-28).';

-- ---------- 6. reactivar_clienta ----------
create or replace function retail.reactivar_clienta(
  p_id uuid,
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
begin
  perform retail.fn_exigir_modulo('clientas');
  v_persona := retail.fn_actor_persona_id(true);

  select * into v_actual from retail.clientas where id = p_id;
  if v_actual.id is null then
    raise exception 'Esa clienta ya no existe — actualiza la pantalla.';
  end if;
  if v_actual.archivada_en is null then
    raise exception 'Esta ficha no está archivada.';
  end if;
  if v_actual.anonimizada then
    raise exception 'Esta ficha fue anonimizada: sus datos personales ya no existen, no se puede reactivar.';
  end if;
  if v_actual.fusionada_en_id is not null then
    raise exception 'Esta ficha se unió a otra — abre esa ficha en su lugar.';
  end if;

  if p_version_esperada is not null then
    perform 1 from retail.clientas where id = p_id and version = p_version_esperada for update;
    if not found then
      raise exception 'Alguien más cambió esta ficha mientras la mirabas. Recarga para ver sus cambios.'
        using errcode = 'PT409', hint = 'version_cambiada';
    end if;
  end if;

  update retail.clientas set archivada_en = null, archivada_por = null, motivo_archivo = null where id = p_id;

  perform retail.fn_actividad_anotar(
    'clientas', 'reactivar', 'reactivó la ficha de una clienta',
    v_persona, null, null, null, 'clientas', p_id::text, now(), '{}'::jsonb, 'vivo'
  );

  return (select version from retail.clientas where id = p_id);
end;
$$;

-- ---------- 7. unir_clientas ----------
-- La transacción, el orden que evita el choque transitorio de DNI y el porqué de la foto en clientas_fusiones: cabecera de
-- 20260928170000_unir_clientas.sql. Aquí cambian dos cosas: el candado del módulo y la frase de la actividad (sin nombres).
create or replace function retail.unir_clientas(
  p_mantener_id uuid,
  p_fusionar_id uuid,
  p_version_mantener_esperada integer default null,
  p_version_fusionar_esperada integer default null
)
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

  -- Primero se vacía a la perdedora (libera su DNI del índice único) y SOLO DESPUÉS se completa a la que gana. `nombre` al
  -- texto exacto que exige clientas_anonimizada_sin_datos_personales (nunca null).
  update retail.clientas set
    dni = null, nombre = 'Clienta anonimizada', telefono_whatsapp = null, whatsapp_consentimiento_en = null,
    cumple_dia = null, cumple_mes = null, tallas = null,
    anonimizada = true,
    archivada_en = now(),
    archivada_por = v_persona,
    motivo_archivo = 'Se unió a otra ficha de clienta (unir_clientas)',
    fusionada_en_id = p_mantener_id
  where id = p_fusionar_id;

  update retail.clientas set
    dni = coalesce(dni, v_fusionar.dni),
    nombre = coalesce(nombre, v_fusionar.nombre),
    telefono_whatsapp = coalesce(telefono_whatsapp, v_fusionar.telefono_whatsapp),
    whatsapp_consentimiento_en = greatest(whatsapp_consentimiento_en, v_fusionar.whatsapp_consentimiento_en),
    cumple_dia = coalesce(cumple_dia, v_fusionar.cumple_dia),
    cumple_mes = coalesce(cumple_mes, v_fusionar.cumple_mes),
    tallas = coalesce(tallas, v_fusionar.tallas)
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

-- ---------- 8. exportar_clientas ----------
-- D-109/G.4: exportar la lista completa es de Admin y queda anotado. Como las otras 10, pide antes el módulo (el Admin es
-- líder y lo tiene siempre: va primero por uniformidad, no porque cambie a quién deja pasar).
create or replace function retail.exportar_clientas()
returns setof retail.clientas
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_persona uuid;
  v_total integer;
begin
  perform retail.fn_exigir_modulo('clientas');
  if not retail.fn_es_admin() then
    raise exception 'Solo un Admin puede exportar la lista completa de clientas.';
  end if;
  v_persona := retail.fn_actor_persona_id(true);

  select count(*) into v_total from retail.clientas;

  perform retail.fn_actividad_anotar(
    'clientas', 'exportar', 'exportó la lista completa de clientas (' || v_total || ')',
    v_persona, null, null, null, 'clientas', 'lista', now(),
    jsonb_build_object('filas', v_total), 'vivo'
  );

  return query select * from retail.clientas order by created_at desc;
end;
$$;

-- ---------- 9. lo que la ficha lee de ventas, cambios, devoluciones y apartados (cruzando sedes, ADR-0249 decisión 4) ----------
create or replace function retail.fn_clienta_compras(p_id uuid)
returns table (
  venta_id uuid, fecha timestamptz, ubicacion text, categoria text, talla text,
  cantidad integer, subtotal numeric
)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  -- Solo con el módulo «Clientas» (42501 clientas_sin_modulo). Va primero: si falla, no se lee nada.
  select retail.fn_exigir_modulo('clientas');

  select v.id, v.created_at, u.nombre, cat.nombre, ta.valor, vi.cantidad, vi.subtotal
  from retail.ventas v
  join retail.ubicaciones u on u.id = v.ubicacion_id
  join retail.venta_items vi on vi.venta_id = v.id
  join retail.variantes va on va.id = vi.variante_id
  join retail.productos pr on pr.id = va.producto_id
  left join retail.categorias cat on cat.id = pr.categoria_id
  left join retail.tallas ta on ta.id = va.talla_id
  where v.cliente_id = p_id and v.estado = 'completada'
  order by v.created_at desc;
$$;

create or replace function retail.fn_clienta_cambios(p_id uuid)
returns table (cambio_id uuid, fecha timestamptz, ubicacion text, motivo text, diferencia numeric)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select retail.fn_exigir_modulo('clientas');

  select c.id, c.created_at, u.nombre, c.motivo, c.diferencia
  from retail.cambios c
  join retail.venta_items vi on vi.id = c.venta_item_id
  join retail.ventas v on v.id = vi.venta_id
  join retail.ubicaciones u on u.id = c.ubicacion_id
  where v.cliente_id = p_id
  order by c.created_at desc;
$$;

create or replace function retail.fn_clienta_devoluciones(p_id uuid)
returns table (devolucion_id uuid, fecha timestamptz, estado text, motivo text, reembolso_monto numeric)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select retail.fn_exigir_modulo('clientas');

  select d.id, d.created_at, d.estado, d.motivo, d.reembolso_monto
  from retail.devoluciones d
  join retail.ventas v on v.id = d.venta_id
  where v.cliente_id = p_id
  order by d.created_at desc;
$$;

create or replace function retail.fn_clienta_separaciones(p_id uuid)
returns table (separacion_id uuid, codigo text, fecha timestamptz, estado text, total numeric, vence_el date)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select retail.fn_exigir_modulo('clientas');

  select s.id, s.codigo, s.created_at, s.estado, s.total, s.vence_el
  from retail.separaciones s
  where s.clienta_id = p_id
  order by s.created_at desc;
$$;

-- Los privilegios no cambian con `create or replace`; se repiten para que esta parte sea autosuficiente.
revoke execute on function
  retail.registrar_clienta(text, text, text, boolean, smallint, smallint),
  retail.buscar_clienta(text, boolean),
  retail.editar_clienta(uuid, text, text, text, boolean, boolean, smallint, smallint, jsonb, integer),
  retail.archivar_clienta(uuid, text, boolean, integer),
  retail.reactivar_clienta(uuid, integer),
  retail.unir_clientas(uuid, uuid, integer, integer),
  retail.exportar_clientas(),
  retail.fn_clienta_compras(uuid),
  retail.fn_clienta_cambios(uuid),
  retail.fn_clienta_devoluciones(uuid),
  retail.fn_clienta_separaciones(uuid)
from public, anon;

grant execute on function
  retail.registrar_clienta(text, text, text, boolean, smallint, smallint),
  retail.buscar_clienta(text, boolean),
  retail.editar_clienta(uuid, text, text, text, boolean, boolean, smallint, smallint, jsonb, integer),
  retail.archivar_clienta(uuid, text, boolean, integer),
  retail.reactivar_clienta(uuid, integer),
  retail.unir_clientas(uuid, uuid, integer, integer),
  retail.exportar_clientas(),
  retail.fn_clienta_compras(uuid),
  retail.fn_clienta_cambios(uuid),
  retail.fn_clienta_devoluciones(uuid),
  retail.fn_clienta_separaciones(uuid)
to authenticated;

-- ---------- 10. la actividad de Apartados deja de copiar a la clienta (b) ----------
-- Hasta hoy cada línea de Apartados llevaba el nombre que se escribió en el apartado («apartó «Blusa» para Ana Pérez…»,
-- «abonó S/ 20 al apartado APT-TRU-0007 de Ana Pérez…») y, en las del apartado, también `detalle.clienta`. Ahora dice «la
-- clienta»: quién es queda en el apartado (tabla + registro_id), que es el documento de esa operación. Solo cambian esa
-- palabra y la llave `clienta` del detalle; el resto de cada frase, quién la firma y cuándo, es el de 20260927120000.
-- Las dos siguen sin poder tumbar la operación: sus disparadores atrapan cualquier error y lo avisan con un WARNING.
create or replace function retail.fn_actividad_separacion(p_id uuid, p_accion text, p_origen text default 'vivo')
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  s retail.separaciones;
  v_prendas text;
  v_mas integer;
  -- (b) ADR-0249 2026-09-28: la actividad no copia el nombre de la clienta (Ley 29733); lo guarda el apartado.
  v_clienta constant text := 'la clienta';
  v_desc text;
  v_persona uuid;
  v_cuando timestamptz;
begin
  select * into s from retail.separaciones where id = p_id;
  if s.id is null then return; end if;
  select retail.fn_actividad_prenda(si.variante_id), (select count(*) - 1 from retail.separacion_items x where x.separacion_id = s.id)
    into v_prendas, v_mas
    from retail.separacion_items si where si.separacion_id = s.id order by si.id limit 1;
  v_prendas := coalesce('«' || v_prendas || '»', 'prendas') || case when coalesce(v_mas, 0) > 0 then ' y ' || v_mas || ' más' else '' end;

  if p_accion = 'apartado_registrado' then
    v_desc := 'apartó ' || v_prendas || ' para ' || v_clienta || ' · adelanto ' || retail.fn_actividad_soles(s.adelanto)
              || ' de ' || retail.fn_actividad_soles(s.total) || ' · ' || s.codigo;
    v_persona := s.creado_por; v_cuando := s.created_at;
  elsif p_accion = 'apartado_entregado' then
    v_desc := 'entregó el apartado ' || s.codigo || ' a ' || v_clienta || ' · venta de ' || retail.fn_actividad_soles(s.total);
    v_persona := s.entregada_por; v_cuando := s.entregada_en;
  elsif p_accion = 'apartado_liberado' then
    v_desc := case when s.liberada_por is null
                   then 'se liberó solo el apartado ' || s.codigo || ' de ' || v_clienta || ': venció hace más de 2 días'
                   else 'liberó el apartado ' || s.codigo || ' de ' || v_clienta
                        || case s.liberada_motivo when 'clienta_desistio' then ' · la clienta desistió'
                                                  when 'error_de_carga' then ' · fue un error al apartar'
                                                  else ' · venció y no vino' end end
              || ' · falta devolver ' || retail.fn_actividad_soles(s.adelanto);
    v_persona := s.liberada_por; v_cuando := s.liberada_en;
  elsif p_accion = 'adelanto_devuelto' then
    v_desc := 'devolvió ' || retail.fn_actividad_soles(s.adelanto) || ' a ' || v_clienta || ' por ' || coalesce(s.devolucion_medio_real, '—')
              || ' · ' || s.codigo;
    v_persona := s.devuelta_por; v_cuando := s.devuelta_en;
  elsif p_accion = 'apartado_extendido' then
    v_desc := 'extendió el apartado ' || s.codigo || ' de ' || v_clienta || ' hasta el ' || to_char(s.vence_el, 'DD/MM');
    begin v_persona := retail.fn_actor_persona_id(true); exception when others then v_persona := null; end;
    v_cuando := now();
  else
    return;
  end if;

  perform retail.fn_actividad_anotar(
    'apartados', p_accion, v_desc, v_persona, retail.fn_actividad_terminal(), s.ubicacion_id, null, 'separaciones',
    s.id::text || ':' || p_accion || case when p_accion = 'apartado_extendido' then ':' || s.extensiones else '' end,
    v_cuando, jsonb_build_object('codigo', s.codigo, 'total', s.total, 'adelanto', s.adelanto, 'vence_el', s.vence_el),
    p_origen);
end;
$$;
revoke all on function retail.fn_actividad_separacion(uuid, text, text) from public, anon, authenticated;

create or replace function retail.trg_actividad_separacion_hijas()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  s retail.separaciones;
  -- (b) ADR-0249 2026-09-28: la actividad no copia el nombre de la clienta (Ley 29733); lo guarda el apartado.
  v_clienta constant text := 'la clienta';
begin
  begin
    select * into s from retail.separaciones where id = new.separacion_id;
    if tg_table_name = 'separacion_abonos' then
      perform retail.fn_actividad_anotar(
        'apartados', 'abono_registrado',
        'abonó ' || retail.fn_actividad_soles(new.monto) || ' al apartado ' || s.codigo || ' de ' || v_clienta
          || ' · falta ' || retail.fn_actividad_soles(greatest(s.total - s.adelanto - new.monto, 0))
          || case when new.dias_espera > 0 then ' · se la espera ' || new.dias_espera || ' días más, hasta el ' || to_char(new.vence_despues, 'DD/MM') else '' end,
        new.creado_por, retail.fn_actividad_terminal(), s.ubicacion_id, null, 'separacion_abonos', new.id::text, new.created_at,
        jsonb_build_object('codigo', s.codigo, 'monto', new.monto, 'dias_espera', nullif(new.dias_espera, 0)), 'vivo');
    elsif tg_table_name = 'separacion_avisos' then
      perform retail.fn_actividad_anotar(
        'apartados', 'aviso_whatsapp',
        'le escribió por WhatsApp a ' || v_clienta || ' · ' || s.codigo || ' vence el ' || to_char(s.vence_el, 'DD/MM'),
        new.avisado_por, retail.fn_actividad_terminal(), s.ubicacion_id, null, 'separacion_avisos', new.id::text, new.created_at,
        jsonb_build_object('codigo', s.codigo), 'vivo');
    elsif tg_table_name = 'separacion_ediciones' then
      perform retail.fn_actividad_anotar(
        'apartados', 'apartado_editado',
        'editó las prendas del apartado ' || s.codigo || ' de ' || v_clienta || ' · total '
          || retail.fn_actividad_soles(new.total_antes) || ' → ' || retail.fn_actividad_soles(new.total_despues),
        new.creado_por, retail.fn_actividad_terminal(), s.ubicacion_id, null, 'separacion_ediciones', new.id::text, new.created_at,
        jsonb_build_object('codigo', s.codigo, 'total_antes', new.total_antes, 'total_despues', new.total_despues), 'vivo');
    end if;
  exception when others then
    raise warning 'actividad: no se anotó % % (%)', tg_table_name, new.id, sqlerrm;
  end;
  return null;
end;
$$;
revoke all on function retail.trg_actividad_separacion_hijas() from public, anon, authenticated;

-- ---------- 11. el estado imposible que hace innecesario «seguir el rastro» al registrar (a) ----------
-- Una ficha unida a otra está anonimizada (unir_clientas lo hace así desde que existe; esto lo vuelve ley del esquema), y
-- una anonimizada no tiene DNI ni celular (clientas_anonimizada_sin_datos_personales): el DNI de quien vuelve nunca cae en
-- una ficha unida, cae en la que se conservó. Se agrega solo si falta: pegar dos veces no vuelve a tomar la tabla.
do $candado$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'retail.clientas'::regclass and conname = 'clientas_fusionada_implica_anonimizada'
  ) then
    alter table retail.clientas add constraint clientas_fusionada_implica_anonimizada
      check (fusionada_en_id is null or anonimizada);
  end if;
end
$candado$;

-- ---------- 12. quién lee la ficha, y la foto de las fusiones sin puerta desde la API ----------
comment on table retail.clientas is
  'La ficha MAESTRA de clienta (D-76/D-77): identificación mínima y no invasiva. Es de la marca, no de la asesora ni de la sede, y la ve solo la cuenta cuyo rol tiene el módulo «Clientas» (o el líder): sus 11 funciones y la política clientas_select (ADR-0249, 2026-09-28). Se escribe solo por sus funciones.';

comment on table retail.clientas_fusiones is
  'D-99: rastro de cada «unir fichas». No se borra ni se edita, con UNA excepción: al anonimizar a la clienta (archivar_clienta con p_anonimizar), ficha_fusionada pierde todo dato personal (Ley 29733, Felipe 2026-09-27). Solo la leen y escriben funciones security definer: RLS encendido, sin políticas y sin permisos para la API.';

-- Nadie de la API la lee ni la escribe (solo funciones security definer), igual que retail.actividad.
revoke all on retail.clientas_fusiones from anon, authenticated;

-- ---------- 13. la actividad vieja, sin datos de la clienta (una sola vez) ----------
-- Las filas escritas ANTES de este archivo: las de Clientas con el nombre, el DNI o el motivo escrito a mano, y las de
-- Apartados con el nombre del apartado (en la frase y en `detalle.clienta`). `retail.actividad` es de solo agregar
-- (ADR-0207): el candado se apaga a la vista, solo si hay algo que reescribir, y se deja en el mismo modo en que estaba.
-- Producción tenía 0 filas de Clientas y 0 de Apartados el 2026-09-28: ahí este bloque no toca la tabla. Idempotente: la
-- segunda vez no encuentra nada que reescribir.
--   · Clientas: cada acción toma la frase nueva (la que escriben desde la sección 4 a la 6) y pierde `detalle.motivo`.
--   · Apartados: el nombre, tal como lo guardó el apartado (nombres y apellidos), se cambia por «la clienta» en la frase,
--     y se quita `detalle.clienta`. El apartado se encuentra por la fila: `registro_id` es el apartado (y su acción) en
--     las líneas de `separaciones`, y el abono, el aviso o la edición en las demás.
do $limpieza$
declare
  v_modo "char";
  v_clientas bigint[];
  v_apartados bigint[];
  v_nombres text[];
begin
  select coalesce(array_agg(a.id), '{}')
    into v_clientas
    from retail.actividad a
   where a.modulo = 'clientas'
     and a.accion in ('editar', 'archivar', 'anonimizar', 'reactivar')
     and (a.descripcion not in ('editó la ficha de una clienta', 'archivó la ficha de una clienta',
                                'anonimizó la ficha de una clienta (Ley 29733)', 'reactivó la ficha de una clienta',
                                'reactivó una clienta archivada al volver a registrarla')
          or a.detalle ? 'motivo');

  select coalesce(array_agg(x.id), '{}'), coalesce(array_agg(x.nombre), '{}')
    into v_apartados, v_nombres
    from (
      select a.id, a.descripcion, a.detalle,
             coalesce(nullif(btrim(a.detalle ->> 'clienta'), ''), (
               select nullif(btrim(s.clienta_nombres || ' ' || s.clienta_apellidos), '')
                 from retail.separaciones s
                where s.id = coalesce(
                        (select h.separacion_id from retail.separacion_abonos h
                          where a.tabla = 'separacion_abonos' and h.id::text = a.registro_id),
                        (select h.separacion_id from retail.separacion_avisos h
                          where a.tabla = 'separacion_avisos' and h.id::text = a.registro_id),
                        (select h.separacion_id from retail.separacion_ediciones h
                          where a.tabla = 'separacion_ediciones' and h.id::text = a.registro_id),
                        (select s2.id from retail.separaciones s2
                          where a.tabla = 'separaciones' and s2.id::text = split_part(a.registro_id, ':', 1))))) as nombre
        from retail.actividad a
       where a.modulo = 'apartados'
    ) x
   where x.detalle ? 'clienta' or strpos(x.descripcion, x.nombre) > 0;

  if cardinality(v_clientas) + cardinality(v_apartados) > 0 then
    select t.tgenabled into v_modo
      from pg_trigger t
     where t.tgrelid = 'retail.actividad'::regclass and t.tgname = 'trg_actividad_inmutable';

    alter table retail.actividad disable trigger trg_actividad_inmutable;

    update retail.actividad a set
      descripcion = case a.accion
        when 'editar' then 'editó la ficha de una clienta'
        when 'archivar' then 'archivó la ficha de una clienta'
        when 'anonimizar' then 'anonimizó la ficha de una clienta (Ley 29733)'
        else 'reactivó la ficha de una clienta'
      end,
      detalle = a.detalle - 'motivo'
     where a.id = any (v_clientas);

    update retail.actividad a set
      descripcion = case when x.nombre is null then a.descripcion else replace(a.descripcion, x.nombre, 'la clienta') end,
      detalle = a.detalle - 'clienta'
      from unnest(v_apartados, v_nombres) as x(id, nombre)
     where a.id = x.id;

    -- El mismo modo en que estaba: un `enable trigger` a secas bajaría un ALWAYS a normal (la lección de 20260926160000).
    if v_modo = 'A' then
      alter table retail.actividad enable always trigger trg_actividad_inmutable;
    elsif v_modo = 'R' then
      alter table retail.actividad enable replica trigger trg_actividad_inmutable;
    elsif v_modo = 'D' then
      null; -- ya estaba apagado: se deja como estaba
    else
      alter table retail.actividad enable trigger trg_actividad_inmutable;
    end if;
  end if;
end
$limpieza$;

notify pgrst, 'reload schema';
