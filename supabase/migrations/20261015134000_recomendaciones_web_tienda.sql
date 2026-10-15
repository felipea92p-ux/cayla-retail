-- ============================================================================
-- 20261015134000_recomendaciones_web_tienda.sql — CAYLA V2 · Tienda online (ADR-0408) · Recomendaciones · PARTE 1 de 2: la tienda
--
-- EL PROBLEMA PRIMERO. Felipe (2026-10-15): «En la tienda de los clientes debe haber un apartado de recomendaciones donde el cliente
-- puede escribir libremente cualquier sugerencia adicional que pueda tener para la tienda o la empresa». Hoy una sugerencia llega, si
-- llega, por el WhatsApp de una tienda: se pierde entre los pedidos, nadie sabe si alguien la leyó y el cliente nunca sabe si sirvió.
-- Decidió además que cada recomendación va SIEMPRE con su nombre (no hay anónimas: así CAYLA puede responderle) y que se leen en un
-- módulo nuevo del ERP, «Recomendaciones» (la PARTE 2, 20261015135000).
--
-- ANALOGÍA CAYLA. El libro de sugerencias junto a la caja, pero firmado: cada hoja lleva el nombre de quien la escribió (para poder
-- contestarle en su cuenta) y se queda en el libro aunque la tienda la archive.
--
-- QUÉ HACE
--   1. `retail.recomendaciones_web`: una fila por recomendación, ligada a la cuenta web que la escribió (`cuenta_web_id`) y a su
--      ficha del Club (`clienta_id`); sobre qué es (`ubicacion_id`: una tienda de las que se ven en la web, o vacía: «CAYLA en
--      general»); el texto; la marca con que la mandó el formulario; y lo que el ERP hace con ella en la PARTE 2 (leída, respondida
--      y archivada: quién y cuándo). RLS encendido y sin políticas: solo la leen y la escriben sus funciones.
--   2. Sus candados (disparador `recomendaciones_web_reglas`): la ficha es la de su cuenta y la cuenta está abierta; nace sin leer,
--      sin respuesta y sin archivar; quién la escribió, sobre qué, cuándo y su texto no cambian; leída y respondida se ponen UNA vez;
--      una respondida o archivada está leída; archivar va y viene.
--   3. `tienda_recomendar(usuario, texto, tienda, marca)`: la guarda. Valida todo por dentro (el texto limpio, de 10 a 1000 letras; la
--      tienda, una de las que se ven en la web), pone el tope (3 por día de Lima y por cuenta, `fn_recomendaciones_tope`) y no
--      duplica: la misma marca de la misma cuenta devuelve la que ya se guardó (dos toques, o un reintento cuando la respuesta se
--      perdió en el camino). No lanza errores de negocio: responde {estado}.
--   4. `tienda_mis_recomendaciones(usuario)`: lo que muestra su página: las suyas (la más nueva primero), cada una con su estado
--      para el cliente (recibida, leída o respondida, con la respuesta), y cuántas lleva hoy contra el tope.
--   5. Al anonimizarse la ficha (la conservación del Club o porque la persona lo pidió), sus recomendaciones SE QUEDAN, sin su nombre
--      (disparador `clientas_recomendaciones_al_anonimizar`, en la misma escritura): la PARTE 2 ya no la nombra ni lleva a su ficha,
--      y del texto y de la respuesta se quitan su nombre, su DNI, su celular y su correo (`[…]`). Una que ya no tiene a quién
--      responder no se responde.
--
-- DECIDÍ: dos llaves, la cuenta y la ficha. La cuenta prueba quién la escribió (solo una cuenta abierta escribe) y la ficha es la que
--   el ERP nombra y la que se anonimiza. La ficha de una cuenta no cambia nunca (`fn_cuenta_web_reglas`), así que guardar las dos no
--   puede desalinearse: el disparador exige al insertar que sea la de su cuenta.
-- DECIDÍ: el texto se guarda LIMPIO (`fn_recomendacion_texto`): sin caracteres invisibles ni de control (los que cambian el sentido
--   de lectura o esconden letras), espacios seguidos en uno, a lo más una línea en blanco. Las letras se cuentan después de limpiar:
--   el contador de la tienda cuenta igual. Lo que parece código (`<script>`) es texto: la pantalla lo escribe como texto.
-- DECIDÍ: el tope es por día de Lima (3), no por 24 horas corridas: «puedes enviar 3 al día, mañana otra» se entiende; «en 5 horas»
--   no. Cada envío toma la fila de su cuenta (`for update`): dos pestañas que mandan a la vez se turnan y el tope no se pasa.
-- DECIDÍ: la marca (un uuid que el formulario crea por cada borrador) es lo que hace idempotente el envío, no el texto: dos personas
--   distintas pueden escribir lo mismo, y la misma persona puede repetir una idea otro día. La misma marca con otro texto devuelve la
--   guardada (solo pasa con un formulario adulterado: el de la tienda cambia de marca cuando cambia el texto).
-- DECIDÍ: con la ficha ARCHIVADA (no anonimizada) la cuenta sí puede recomendar: archivar es una decisión de la tienda sobre la ficha,
--   y lo que el cliente quiera decirle a CAYLA igual sirve (a diferencia de un favorito o una espera, que es un dato de marketing).
--   Por eso estas funciones no leen la ficha: la cuenta abierta basta (una anonimizada ya tiene su cuenta cerrada).
-- DECIDÍ: al anonimizar, la recomendación se queda (es lo que CAYLA aprendió) y se le quita lo que dice quién es: el nombre del ERP
--   (PARTE 2) y, en su texto y en la respuesta, las palabras de su nombre (de 3 letras o más, sin «del», «las», «los», sin importar
--   tildes ni mayúsculas), su DNI, su celular (aunque venga con espacios o guiones) y su correo. Es el mismo criterio de la ficha
--   (el motivo escrito de archivar no se guarda «porque puede nombrar a la clienta», Felipe 2026-09-27). Puede quitar de más (una
--   «Rosa» que escribe «el color rosa»): se prefiere eso a dejar un dato. Si quitar fallara, el texto entero queda en `[…]`: nunca se
--   frena la anonimización.
-- DESCARTÉ: borrar la recomendación al anonimizar (se pierde lo aprendido) o dejar el texto intacto (puede llevar su nombre o su
--   celular); guardar una copia del nombre en la fila (dos fuentes del nombre: una se olvidaría de anonimizar); contar el tope por
--   24 horas corridas; un `pg_cron` o un aviso de la base a la tienda (ADR-0166, ADR-0352).
--
-- SE ROMPE SI: alguien anonimiza una ficha sin pasar por `anonimizada = true` (el disparador no se entera); o una función nueva escribe
--   en `recomendaciones_web` sin `fn_recomendacion_texto`; o se cambia el tope en la tienda y no en `fn_recomendaciones_tope` (la tienda
--   lo lee de la base: no lo escribe).
--
-- PRODUCCIÓN. NO está aplicada (la tienda no está en producción; actividad 13, con el OK de Felipe). Va DESPUÉS de las migraciones de
-- la tienda (20261014220000 el rol, 20261014231000 las tiendas de la web, 20261015012000 `fn_tienda_sedes_web`, 20261015055000 la
-- cuenta que se cierra) y ANTES de la PARTE 2 (20261015135000). Una sola parte, idempotente (se puede pegar dos veces). Crea una tabla
-- nueva (sus llaves foráneas toman `clientas`, `cuentas_web`, `ubicaciones` y `personas` en modo compartido, sin frenar lecturas) y
-- engancha un disparador a `clientas` (SHARE ROW EXCLUSIVE, breve: `lock_timeout` de 3 s; si una tienda la tiene tomada, falla sin
-- tocar nada y se vuelve a pegar). Sin políticas ni `drop trigger`, y ningún `select … into` dentro de un texto entre comillas.
--
-- VERIFICACIÓN (solo lectura, después de pegar):
--   select to_regclass('retail.recomendaciones_web');                                                          → retail.recomendaciones_web
--   select has_function_privilege('tienda_web', 'retail.tienda_recomendar(uuid, text, uuid, uuid)', 'execute'); → t
--   select has_function_privilege('authenticated', 'retail.tienda_recomendar(uuid, text, uuid, uuid)', 'execute'); → f
--   select tgname from pg_trigger where tgname in ('recomendaciones_web_reglas', 'clientas_recomendaciones_al_anonimizar') order by 1;
--     → las dos
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 0. Lo que esta migración da por hecho ----------
do $guarda$
begin
  if not exists (select 1 from pg_roles where rolname = 'tienda_web') then
    raise exception 'Falta el rol tienda_web: pega antes 20261014220000_tienda_puerta_y_portada.sql.';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'retail' and table_name = 'cuentas_web' and column_name = 'cerrada_en') then
    raise exception 'Faltan las cuentas web con su cierre: pega antes 20261015055000_tienda_cuentas_entrada_y_cierre.sql.';
  end if;
  if to_regprocedure('retail.fn_tienda_sedes_web()') is null or to_regclass('retail.ubicacion_datos_web') is null then
    raise exception 'Faltan las tiendas de la web: pega antes 20261014231000_tienda_web_sedes_y_plazos.sql y 20261015012000_tienda_ficha_y_niveles_por_tienda.sql.';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'retail' and table_name = 'clientas' and column_name = 'correo') then
    raise exception 'Falta clientas.correo: pega antes la tanda 1g del Club (20261001210000_club_paso1g_parte1_clientas.sql).';
  end if;
end
$guarda$;

-- ---------- 1. La tabla ----------
create table if not exists retail.recomendaciones_web (
  id             uuid primary key default gen_random_uuid(),
  cuenta_web_id  uuid not null references retail.cuentas_web (id),
  clienta_id     uuid not null references retail.clientas (id),
  -- Sobre qué tienda es; vacía: «CAYLA en general».
  ubicacion_id   uuid references retail.ubicaciones (id),
  texto          text not null,
  -- La marca del borrador que la mandó: la misma marca de la misma cuenta es la misma recomendación.
  marca          uuid not null,
  creada_en      timestamptz not null default now(),
  leida_en       timestamptz,
  leida_por      uuid references public.personas (id),
  respuesta      text,
  respondida_en  timestamptz,
  respondida_por uuid references public.personas (id),
  archivada_en   timestamptz,
  archivada_por  uuid references public.personas (id),
  -- Cuándo su ficha se anonimizó: desde ahí no la nombra nadie y su texto ya no tiene sus datos.
  sin_nombre_en  timestamptz,
  constraint recomendaciones_web_marca_unica unique (cuenta_web_id, marca),
  -- Un texto quitado al anonimizar puede quedar más corto que el mínimo (o ser solo «[…]»): el mínimo es de lo que escribe el cliente.
  constraint recomendaciones_web_texto_largo check (
    char_length(texto) <= 1000 and (sin_nombre_en is not null or char_length(btrim(texto)) >= 10)),
  constraint recomendaciones_web_respuesta_larga check (
    respuesta is null or (char_length(respuesta) <= 400 and (sin_nombre_en is not null or char_length(btrim(respuesta)) >= 2))),
  constraint recomendaciones_web_respondida check (
    (respuesta is null) = (respondida_en is null) and (respondida_por is null or respondida_en is not null)),
  constraint recomendaciones_web_leida_por check (leida_por is null or leida_en is not null),
  constraint recomendaciones_web_archivada_por check (archivada_por is null or archivada_en is not null),
  -- Responder o archivar es haberla leído.
  constraint recomendaciones_web_respondida_leida check (respondida_en is null or leida_en is not null),
  constraint recomendaciones_web_archivada_leida check (archivada_en is null or leida_en is not null),
  constraint recomendaciones_web_fechas check (
    (leida_en is null or leida_en >= creada_en) and (respondida_en is null or respondida_en >= creada_en)
    and (archivada_en is null or archivada_en >= creada_en) and (sin_nombre_en is null or sin_nombre_en >= creada_en))
);

comment on table retail.recomendaciones_web is
  'Recomendaciones de la tienda online (ADR-0408, Felipe 2026-10-15): lo que un cliente le escribe a CAYLA desde su cuenta, siempre con su nombre. Ligada a su cuenta web y a su ficha del Club; sobre una tienda de la web o CAYLA en general (ubicacion_id vacía). La escribe tienda_recomendar (3 por día de Lima y por cuenta, idempotente por marca); la lee, la marca leída, la responde y la archiva el módulo «Recomendaciones» del ERP. No se borra: se archiva. Al anonimizarse la ficha se queda sin su nombre (sin_nombre_en) y sin sus datos en el texto. RLS sin políticas: solo sus funciones.';
comment on column retail.recomendaciones_web.ubicacion_id is
  'Sobre qué tienda es (una de las que se ven en la web al escribirla). Vacía: CAYLA en general.';
comment on column retail.recomendaciones_web.texto is
  'Lo que escribió, limpio (fn_recomendacion_texto): de 10 a 1000 letras. No cambia, salvo una vez: al anonimizarse la ficha se le quitan su nombre, DNI, celular y correo.';
comment on column retail.recomendaciones_web.marca is
  'El uuid del borrador que la mandó (el formulario crea uno por borrador): la misma marca de la misma cuenta devuelve la misma recomendación (dos toques, un reintento sin red).';
comment on column retail.recomendaciones_web.respuesta is
  'Lo que CAYLA le contestó (de 2 a 400 letras), que el cliente ve en su página de recomendaciones. Una sola vez y no cambia.';
comment on column retail.recomendaciones_web.sin_nombre_en is
  'Cuándo su ficha se anonimizó (disparador clientas_recomendaciones_al_anonimizar): el ERP ya no la nombra ni lleva a la ficha, y el texto y la respuesta no tienen sus datos. No se responde.';

create index if not exists recomendaciones_web_cuenta_idx on retail.recomendaciones_web (cuenta_web_id, creada_en desc);
create index if not exists recomendaciones_web_creada_idx on retail.recomendaciones_web (creada_en desc, id);
create index if not exists recomendaciones_web_clienta_idx on retail.recomendaciones_web (clienta_id);

alter table retail.recomendaciones_web enable row level security;
revoke all on retail.recomendaciones_web from public, anon, authenticated;

-- ---------- 2. El tope, el texto limpio y el texto sin datos ----------
-- El tope por día vive en UN lugar: la tienda lo lee de la base (tienda_mis_recomendaciones) y la base lo hace cumplir.
create or replace function retail.fn_recomendaciones_tope()
returns integer
language sql
immutable
set search_path = retail, public
as $$ select 3 $$;
comment on function retail.fn_recomendaciones_tope() is
  'Recomendaciones (Felipe 2026-10-15: «unas pocas por día»): cuántas puede mandar una cuenta por día de Lima. Interna.';

-- Sin invisibles ni caracteres de control (menos el salto de línea), espacios seguidos en uno, sin espacios pegados a un salto, a lo
-- más una línea en blanco, y sin espacios ni saltos en las puntas. Vacío: null.
create or replace function retail.fn_recomendacion_texto(p_texto text)
returns text
language sql
immutable
set search_path = retail, public
as $$
  select nullif(btrim(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            replace(replace(coalesce(p_texto, ''), E'\r\n', E'\n'), E'\r', E'\n'),
            '[\u0001-\u0008\u000B-\u001F\u007F-\u009F­​-‏‪-‮⁠-⁤⁦-⁩﻿]', '', 'g'),
          '[\t   -   　]+', ' ', 'g'),
        ' ?\n ?', E'\n', 'g'),
      '\n{3,}', E'\n\n', 'g'),
    E' \n'), '');
$$;
comment on function retail.fn_recomendacion_texto(text) is
  'Recomendaciones: el texto limpio (sin invisibles ni caracteres de control, espacios seguidos en uno, a lo más una línea en blanco, sin espacios en las puntas), o null si queda vacío. La usan tienda_recomendar y responder_recomendacion. Interna.';

-- Lo que dice quién es, fuera del texto (al anonimizar). Nunca lanza: si algo falla, el texto entero queda en «[…]».
create or replace function retail.fn_recomendacion_sin_datos(p_texto text, p_nombre text, p_documento text, p_celular text, p_correo text)
returns text
language plpgsql
immutable
set search_path = retail, public
as $$
declare
  c_marca constant text := '[…]';
  c_letra constant text := '[:alnum:]áéíóúüñÁÉÍÓÚÜÑ';
  v text := p_texto;
  v_palabra text;
  v_patron text;
  v_cifras text;
  v_dato text;
begin
  if v is null then
    return null;
  end if;
  begin
    -- 1. El correo, tal cual (sin importar mayúsculas): cada carácter especial de una expresión regular, escapado.
    v_dato := lower(btrim(coalesce(p_correo, '')));
    if v_dato <> '' then
      v := regexp_replace(v, regexp_replace(v_dato, '([.^$*+?()\[\]{}|\\/-])', '\\\1', 'g'), c_marca, 'gi');
    end if;
    -- 2. El DNI y el celular: sus cifras (o letras, un carné), aunque vengan separadas por espacios, puntos o guiones. Solo una
    --    secuencia entera (no un pedazo de un número más largo).
    foreach v_dato in array array[p_documento, p_celular] loop
      v_cifras := regexp_replace(coalesce(v_dato, ''), '[^0-9A-Za-z]', '', 'g');
      if char_length(v_cifras) >= 6 then
        v_patron := array_to_string(regexp_split_to_array(v_cifras, ''), '[ .-]?');
        v := regexp_replace(v, '(^|[^0-9A-Za-z])' || v_patron || '(?=$|[^0-9A-Za-z])', '\1' || c_marca, 'gi');
      end if;
    end loop;
    -- 3. Cada palabra de su nombre (3 letras o más, sin «del», «las», «los»), sin importar tildes ni mayúsculas: «María» también
    --    quita «maria» y «MARÍA». Solo palabras enteras.
    for v_palabra in
      select distinct x
        from regexp_split_to_table(lower(coalesce(p_nombre, '')), '[^[:alpha:]áéíóúüñ]+') as x
       where char_length(x) >= 3 and x not in ('del', 'las', 'los')
    loop
      v_patron := translate(v_palabra, 'áàäâéèëêíìïîóòöôúùüûñ', 'aaaaeeeeiiiioooouuuun');
      -- Solo letras de la a a la z: lo demás de un nombre raro no entra al patrón (no puede romperlo).
      v_patron := regexp_replace(v_patron, '[^a-z]', '', 'g');
      continue when char_length(v_patron) < 3;
      v_patron := replace(v_patron, 'a', '[aáàäâ]');
      v_patron := replace(v_patron, 'e', '[eéèëê]');
      v_patron := replace(v_patron, 'i', '[iíìïî]');
      v_patron := replace(v_patron, 'o', '[oóòöô]');
      v_patron := replace(v_patron, 'u', '[uúùüû]');
      v_patron := replace(v_patron, 'n', '[nñ]');
      v := regexp_replace(v, '(^|[^' || c_letra || '])' || v_patron || '(?=$|[^' || c_letra || '])', '\1' || c_marca, 'gi');
    end loop;
  exception when others then
    return c_marca;
  end;
  return v;
end;
$$;
comment on function retail.fn_recomendacion_sin_datos(text, text, text, text, text) is
  'Recomendaciones (al anonimizar): el texto sin el nombre (cada palabra de 3 letras o más, sin tildes ni mayúsculas), el DNI, el celular (aunque venga separado) y el correo de la persona, cada uno cambiado por «[…]». Nunca lanza: si algo falla, devuelve «[…]». Interna.';

-- ---------- 3. Los candados de la fila ----------
create or replace function retail.fn_recomendacion_web_reglas()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_ficha uuid;
  v_cerrada timestamptz;
  v_hay boolean := false;
  v_anonimiza boolean;
begin
  if tg_op = 'INSERT' then
    -- Sin filas, un `for … in` deja sus variables en NULL: «la hay» se marca adentro.
    for v_ficha, v_cerrada in
      select w.clienta_id, w.cerrada_en from retail.cuentas_web w where w.id = new.cuenta_web_id
    loop
      v_hay := true;
      exit;
    end loop;
    if not v_hay or v_ficha is distinct from new.clienta_id then
      raise exception 'La ficha de una recomendación es la de la cuenta web que la escribió.'
        using errcode = '23514', hint = 'recomendacion_ficha_de_otra_cuenta';
    end if;
    if v_cerrada is not null then
      raise exception 'Una cuenta web cerrada no escribe recomendaciones.' using errcode = '23514', hint = 'recomendacion_cuenta_cerrada';
    end if;
    if new.leida_en is not null or new.respuesta is not null or new.respondida_en is not null or new.archivada_en is not null
       or new.sin_nombre_en is not null then
      raise exception 'Una recomendación nace sin leer, sin respuesta y sin archivar.' using errcode = '23514', hint = 'recomendacion_nace_nueva';
    end if;
    return new;
  end if;

  if (new.id, new.cuenta_web_id, new.clienta_id, new.ubicacion_id, new.marca, new.creada_en)
     is distinct from (old.id, old.cuenta_web_id, old.clienta_id, old.ubicacion_id, old.marca, old.creada_en) then
    raise exception 'De una recomendación no se cambia quién la escribió, sobre qué es ni cuándo.'
      using errcode = '23514', hint = 'recomendacion_inmutable';
  end if;
  if old.sin_nombre_en is not null and new.sin_nombre_en is distinct from old.sin_nombre_en then
    raise exception 'Una recomendación que quedó sin nombre no vuelve a tenerlo.' using errcode = '23514', hint = 'recomendacion_inmutable';
  end if;
  v_anonimiza := old.sin_nombre_en is null and new.sin_nombre_en is not null;
  -- El texto y una respuesta ya dada cambian una sola vez: al quedar sin nombre (se les quitan sus datos).
  if not v_anonimiza and (new.texto is distinct from old.texto
                          or (old.respuesta is not null and new.respuesta is distinct from old.respuesta)) then
    raise exception 'El texto de una recomendación y su respuesta no se cambian.' using errcode = '23514', hint = 'recomendacion_inmutable';
  end if;
  -- Sin nombre no se responde (tampoco en la misma escritura que la deja sin nombre).
  if new.sin_nombre_en is not null and old.respuesta is null and new.respuesta is not null then
    raise exception 'Esta recomendación ya no tiene a quién responder: la ficha de quien la escribió se anonimizó.'
      using errcode = '23514', hint = 'recomendacion_sin_nombre';
  end if;
  -- Leída y respondida, una sola vez (quién y cuándo no se reescriben).
  if old.leida_en is not null and (new.leida_en, new.leida_por) is distinct from (old.leida_en, old.leida_por) then
    raise exception 'Cuándo se leyó una recomendación no se reescribe.' using errcode = '23514', hint = 'recomendacion_inmutable';
  end if;
  if old.respondida_en is not null and (new.respondida_en, new.respondida_por) is distinct from (old.respondida_en, old.respondida_por) then
    raise exception 'Cuándo se respondió una recomendación no se reescribe.' using errcode = '23514', hint = 'recomendacion_inmutable';
  end if;
  return new;
end;
$$;
comment on function retail.fn_recomendacion_web_reglas() is
  'Disparador de recomendaciones_web (ADR-0408, Felipe 2026-10-15): la ficha es la de su cuenta y la cuenta está abierta; nace sin leer, sin respuesta y sin archivar; quién, sobre qué, cuándo, el texto y la respuesta no cambian (salvo al quedar sin nombre, una vez); leída y respondida se ponen una sola vez; sin nombre no se responde (23514, hints recomendacion_*).';
revoke all on function retail.fn_recomendacion_web_reglas() from public, anon, authenticated;

create or replace trigger recomendaciones_web_reglas before insert or update on retail.recomendaciones_web
  for each row
  execute function retail.fn_recomendacion_web_reglas();

-- ---------- 4. Al anonimizarse la ficha: sin su nombre, en la misma escritura ----------
-- Por la conservación del Club (fn_club_anonimizar_inactivas) o porque lo pidió (archivar con anonimizar, «Eliminar mi cuenta»): las
-- dos pasan por `anonimizada = true`. Los datos que se quitan son los de ANTES (`old`): en el mismo cambio la ficha los pierde.
create or replace function retail.fn_recomendaciones_al_anonimizar()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
begin
  update retail.recomendaciones_web r set
    texto = retail.fn_recomendacion_sin_datos(r.texto, old.nombre, old.documento_numero, old.telefono_whatsapp, old.correo),
    respuesta = retail.fn_recomendacion_sin_datos(r.respuesta, old.nombre, old.documento_numero, old.telefono_whatsapp, old.correo),
    sin_nombre_en = greatest(now(), r.creada_en)
   where r.clienta_id = new.id
     and r.sin_nombre_en is null;
  return null;
end;
$$;
comment on function retail.fn_recomendaciones_al_anonimizar() is
  'Disparador de clientas (ADR-0408, Felipe 2026-10-15: «sus recomendaciones quedan sin su nombre»): al anonimizarse una ficha, sus recomendaciones se quedan, marcadas sin_nombre_en, y su texto y su respuesta pierden el nombre, el DNI, el celular y el correo que la ficha tenía (fn_recomendacion_sin_datos). No devuelve nada de la ficha. Nada se borra.';
revoke all on function retail.fn_recomendaciones_al_anonimizar() from public, anon, authenticated;

create or replace trigger clientas_recomendaciones_al_anonimizar after update of anonimizada on retail.clientas
  for each row
  when (new.anonimizada and not old.anonimizada)
  execute function retail.fn_recomendaciones_al_anonimizar();

-- ---------- 5. La tienda: recomendar ----------
create or replace function retail.tienda_recomendar(p_usuario_web_id uuid, p_texto text, p_ubicacion_id uuid, p_marca uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = retail, public
as $$
declare
  c_minimo constant integer := 10;
  c_maximo constant integer := 1000;
  v_tope constant integer := retail.fn_recomendaciones_tope();
  v_cuenta uuid;
  v_ficha uuid;
  v_id uuid;
  v_texto text;
  v_hoy integer;
begin
  if p_usuario_web_id is null then
    return jsonb_build_object('estado', 'sin_cuenta');
  end if;
  -- Su cuenta ABIERTA, tomada: dos pestañas (o dos toques) que mandan a la vez pasan de a una por la marca y por el tope.
  for v_cuenta, v_ficha in
    select w.id, w.clienta_id from retail.cuentas_web w where w.usuario_web_id = p_usuario_web_id and w.cerrada_en is null for update
  loop
    exit;
  end loop;
  if v_cuenta is null then
    return jsonb_build_object('estado', 'sin_cuenta');
  end if;
  if p_marca is null then
    return jsonb_build_object('estado', 'invalido', 'campo', 'marca');
  end if;

  v_hoy := (select count(*)::integer from retail.recomendaciones_web r
             where r.cuenta_web_id = v_cuenta and (r.creada_en at time zone 'America/Lima')::date = retail.fn_hoy_lima());

  -- La misma marca: la que ya se guardó, sin contarla otra vez.
  v_id := (select r.id from retail.recomendaciones_web r where r.cuenta_web_id = v_cuenta and r.marca = p_marca);
  if v_id is not null then
    return jsonb_build_object('estado', 'enviada', 'id', v_id, 'repetida', true, 'tope', v_tope, 'quedan_hoy', greatest(v_tope - v_hoy, 0));
  end if;

  v_texto := retail.fn_recomendacion_texto(p_texto);
  if v_texto is null or char_length(v_texto) < c_minimo then
    return jsonb_build_object('estado', 'invalido', 'campo', 'texto', 'detalle', 'corto', 'minimo', c_minimo);
  end if;
  if char_length(v_texto) > c_maximo then
    return jsonb_build_object('estado', 'invalido', 'campo', 'texto', 'detalle', 'largo', 'maximo', c_maximo);
  end if;
  -- Solo una tienda de las que hoy se ven en la web (una escondida o un id cualquiera no): la persona elige otra o «CAYLA en general».
  if p_ubicacion_id is not null and not (p_ubicacion_id = any (retail.fn_tienda_sedes_web())) then
    return jsonb_build_object('estado', 'invalido', 'campo', 'sobre');
  end if;
  if v_hoy >= v_tope then
    return jsonb_build_object('estado', 'limite', 'tope', v_tope);
  end if;

  insert into retail.recomendaciones_web (cuenta_web_id, clienta_id, ubicacion_id, texto, marca)
  values (v_cuenta, v_ficha, p_ubicacion_id, v_texto, p_marca)
  returning id into v_id;
  return jsonb_build_object('estado', 'enviada', 'id', v_id, 'repetida', false, 'tope', v_tope, 'quedan_hoy', v_tope - v_hoy - 1);
end;
$$;
comment on function retail.tienda_recomendar(uuid, text, uuid, uuid) is
  'Tienda online (ADR-0408, Felipe 2026-10-15): guarda una recomendación de la cuenta abierta de ese usuario del proyecto de clientes, con su nombre (su ficha). {estado: enviada (id, repetida, tope, quedan_hoy) | invalido (campo: texto | sobre | marca; detalle: corto | largo) | limite (tope) | sin_cuenta}. El texto se guarda limpio (de 10 a 1000 letras); la tienda, una de la web o null (CAYLA en general); 3 por día de Lima; la misma marca devuelve la misma. No lanza errores de negocio. Solo la llama tienda_web.';

-- ---------- 6. La tienda: las suyas ----------
create or replace function retail.tienda_mis_recomendaciones(p_usuario_web_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public
as $$
declare
  v_cuenta uuid;
begin
  if p_usuario_web_id is null then
    return null;
  end if;
  v_cuenta := (select w.id from retail.cuentas_web w where w.usuario_web_id = p_usuario_web_id and w.cerrada_en is null);
  if v_cuenta is null then
    return null;
  end if;
  return jsonb_build_object(
    'tope', retail.fn_recomendaciones_tope(),
    'hoy', (select count(*) from retail.recomendaciones_web r
             where r.cuenta_web_id = v_cuenta and (r.creada_en at time zone 'America/Lima')::date = retail.fn_hoy_lima()),
    'recomendaciones', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', x.id,
               'texto', x.texto,
               'creada_en', x.creada_en,
               -- El nombre que lee el cliente («Trujillo»), no el del sistema; si la tienda dejó de verse en la web, el que tenía.
               'sobre', case when x.ubicacion_id is null then null
                             else jsonb_build_object('id', x.ubicacion_id, 'nombre', coalesce(nullif(btrim(dw.nombre_web), ''), u.nombre)) end,
               -- Para el cliente, archivar es haberla leído: el archivo es de la tienda.
               'estado', case when x.respuesta is not null then 'respondida' when x.leida_en is not null then 'leida' else 'recibida' end,
               'respuesta', x.respuesta,
               'respondida_en', x.respondida_en)
             order by x.creada_en desc, x.id)
        from (select r.* from retail.recomendaciones_web r
               where r.cuenta_web_id = v_cuenta
               order by r.creada_en desc, r.id
               limit 100) x
        left join retail.ubicaciones u on u.id = x.ubicacion_id
        left join retail.ubicacion_datos_web dw on dw.ubicacion_id = x.ubicacion_id), '[]'::jsonb)
  );
end;
$$;
comment on function retail.tienda_mis_recomendaciones(uuid) is
  'Tienda online (ADR-0408, Felipe 2026-10-15): las recomendaciones de la cuenta abierta de ese usuario (las 100 más nuevas primero), cada una con sobre qué tienda (su nombre web) o null, su estado para el cliente (recibida | leida | respondida) y la respuesta; y el tope por día y cuántas lleva hoy. null si ese usuario no tiene cuenta abierta. No escribe nada. Solo la llama tienda_web.';

-- ---------- 7. La puerta: solo tienda_web ----------
revoke all on function retail.fn_recomendaciones_tope() from public, anon, authenticated;
revoke all on function retail.fn_recomendacion_texto(text) from public, anon, authenticated;
revoke all on function retail.fn_recomendacion_sin_datos(text, text, text, text, text) from public, anon, authenticated;
revoke all on function retail.tienda_recomendar(uuid, text, uuid, uuid) from public, anon, authenticated;
revoke all on function retail.tienda_mis_recomendaciones(uuid) from public, anon, authenticated;
grant execute on function retail.tienda_recomendar(uuid, text, uuid, uuid) to tienda_web;
grant execute on function retail.tienda_mis_recomendaciones(uuid) to tienda_web;

reset lock_timeout;
