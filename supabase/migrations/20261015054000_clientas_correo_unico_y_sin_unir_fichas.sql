-- ============================================================================
-- 20261015054000_clientas_correo_unico_y_sin_unir_fichas.sql — CAYLA V2 · Clientes y tienda online (ADR-0288, ADR-0408) · PARTE 1 de 2
--
-- EL PROBLEMA PRIMERO. Felipe (2026-10-14): «No debería dejar registrar 2 DNIs y correos iguales, debe ser único por cada usuario,
-- entonces el unir fichas es innecesario». El documento ya era único (`clientas_documento_unico`, por tipo y número), pero el correo
-- no: dos fichas podían tener el mismo correo, y la cuenta de la tienda online (que entra con su correo, `cuentas_web`) podía llevar
-- el correo de OTRA ficha. Con el documento y el correo de una sola persona, no nacen fichas repetidas y «Unir fichas» sobra: en
-- producción nunca se usó (`clientas_fusiones` vacía, leído el 2026-10-14: 42 fichas, 5 con correo, 0 correos ni documentos
-- repetidos).
--
-- ANALOGÍA CAYLA. El cuaderno de clientes de la tienda: un DNI es una página, y un correo también. Si dos páginas dicen el mismo
-- correo, el cuaderno ya no sabe a quién avisar ni de quién es la cuenta de la web.
--
-- QUÉ HACE (solo lo del ERP; lo de la tienda online va en la PARTE 2, 20261015055000)
--   1. Un correo, una persona: índice único `clientas_correo_unico` sobre `lower(btrim(correo))` donde no es nulo. Antes de crearlo
--      busca correos repetidos y, si hay, ABORTA con un mensaje claro sin tocar nada (decidir a qué ficha le queda cada uno es de
--      Felipe, no de esta migración).
--   2. El disparador `fn_correo_de_una_persona` (en `clientas`; la PARTE 2 lo engancha también a `cuentas_web`): un correo no puede
--      ser el de otra ficha NI el de la cuenta web de otra ficha. Rechaza con 23505, hint `correo_repetido`, detail `correo`, y un
--      mensaje que NO dice de quién es (lo puede ver la página pública del cartel del Club). Dos escrituras del mismo correo a la vez
--      hacen fila en un candado consultivo por correo, así la segunda ve la primera.
--   3. `editar_clienta`: el documento de otra ficha ya no dice «únelas con Unir con otra ficha» (no existe más): dice DE QUÉ FICHA
--      es (nombre, código del club y si está archivada), para que quien edita (ve el módulo «Clientes») la busque y corrija la que
--      esté mal. Mismo hint (`documento_de_otra_ficha`) y mismo código (23505); lo demás de la función, igual.
--   4. `unir_clientas` se BORRA (`drop function`). La tabla `clientas_fusiones` y lo que la lee (la foto que anonimizar limpia, el
--      `fusionada_en_id` que siguen una venta o un pedido) se QUEDAN: son historia, y nunca se borran datos.
--
-- DECIDÍ: `drop function` y no `revoke` + comentario. Sin la función no queda «sin uso posible a medias»: un `revoke` lo deshace
--   cualquier `grant execute on all functions in schema retail` futuro (el patrón de 0005_grants.sql), y la función seguiría
--   arrastrando columnas y reglas de la ficha que habría que mantener compilando para nadie. No es un dato: su código vive en git
--   (20260928170000, 20260928190000, 20260930160000 y 20260930200100), y la evidencia de lo que hizo (nada, en producción) vive en
--   `clientas_fusiones`, que no se toca. `pruebas:roles-cobertura` no la extraña: «Fichas de clientes» tiene otros guardianes.
-- DECIDÍ: el mensaje del correo repetido no nombra a nadie (la misma frase sirve al cartel público y a la tienda). El del documento
--   repetido sí nombra la ficha: solo lo ve quien edita fichas en el ERP, que además podría encontrarla buscando el documento.
-- DECIDÍ: el disparador mira `cuentas_web` solo si la tabla existe (`to_regclass`): esta PARTE se puede pegar antes o después de las
--   migraciones de la tienda online sin romper el cartel del Club, que escribe el correo.
-- DESCARTÉ: dejar que el índice único hable solo (23505 con el nombre del índice): la pantalla mostraría «Código: …»; y el índice no
--   alcanza a `cuentas_web` (son dos tablas), que es justo el choque que pidió revisar Felipe.
-- DESCARTÉ: un `unique` sobre `correo` a secas: hoy es lo mismo (el candado `clientas_correo_formato` ya lo exige en minúsculas y sin
--   espacios), pero el índice sobre `lower(btrim(correo))` sigue siendo correcto aunque ese candado cambie un día.
--
-- SE ROMPE SI: alguien escribe el correo de una ficha saltándose el disparador (un `session_replication_role = replica`); o una
--   migración futura recrea `editar_clienta` desde un archivo viejo (el candado de versión de la sección 0 lo impide al pegar esta).
--
-- PRODUCCIÓN. NO está aplicada. Se pega SOLA en el SQL Editor; idempotente (se puede pegar dos veces). Toca `clientas`, que toda venta
-- lee: el índice toma la tabla en modo SHARE y el disparador en SHARE ROW EXCLUSIVE, los dos compatibles con las lecturas de una venta
-- (`for key share`); un alta o una edición de ficha espera lo que dura este pegado (`lock_timeout` de 3 s: si alguien la tiene tomada,
-- falla limpio y se vuelve a pegar). Sin políticas ni `drop trigger` (CLAUDE.md, «Políticas y deadlocks»), y ningún `select … into`
-- dentro de un texto entre comillas (ADR-0288). Publicar la web de este PR ANTES de pegar (la ficha deja de ofrecer «Unir con otra
-- ficha»); si se pega primero, ese botón falla con «la función no existe» y nada más.
--
-- VERIFICACIÓN (solo lectura, después de pegar):
--   select indexdef from pg_indexes where schemaname = 'retail' and indexname = 'clientas_correo_unico';
--     → CREATE UNIQUE INDEX clientas_correo_unico ON retail.clientas USING btree (lower(btrim(correo))) WHERE (correo IS NOT NULL)
--   select to_regprocedure('retail.unir_clientas(uuid,uuid,integer,integer)');   → (vacío)
--   select count(*) from retail.clientas_fusiones;   → lo mismo que antes (en producción, 0)
--   select tgname from pg_trigger where tgrelid = 'retail.clientas'::regclass and tgname like 'clientas_correo%' order by 1;
--     → clientas_correo_de_una_persona_alta · clientas_correo_de_una_persona_cambio
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 0. Candado de versión y correos repetidos (si algo no calza, no se toca nada) ----------
do $guarda$
declare
  r record;
  v_md5 text;
  v_repetidos integer;
begin
  for r in
    select * from (values
      -- firma                                                                                    antes (producción, la de la 1b)       despues (este archivo)
      ('retail.editar_clienta(uuid,text,text,text,text,smallint,smallint,smallint,jsonb,integer)', 'e00a9edb0e8781417504abb7c361a226',  '2f8480789502382d85f53404e1488065'),
      ('retail.unir_clientas(uuid,uuid,integer,integer)',                                          '575bfff00b96a24f838d3f0f1959d29c',  null),
      ('retail.fn_correo_de_una_persona()',                                                        null,                                '8ada798863bdf976e1d3a75e1f71d639')
    ) as t(firma, antes, despues)
  loop
    v_md5 := (select md5(regexp_replace(regexp_replace(regexp_replace(p.prosrc, '/\*.*?\*/', '', 'g'), '--[^' || chr(10) || ']*', '', 'g'), '\s+', '', 'g'))
                from pg_proc p where p.oid = to_regprocedure(r.firma));
    if v_md5 is null then
      -- Que no exista es «después» para unir_clientas (este archivo la borra) y «antes» para la función nueva.
      if r.antes is not null and r.despues is not null then
        raise exception '% no existe en esta base: pega antes la tanda 1b del club (20260930200100).', r.firma;
      end if;
    elsif v_md5 is distinct from r.antes and v_md5 is distinct from r.despues then
      raise exception '% cambió desde que se escribió esta migración (md5 normalizado %; se esperaba % —antes— o % —después—). No se reemplaza a ciegas: lee su definición viva y rehace este cambio sobre ESA versión.',
        r.firma, v_md5, coalesce(r.antes, 'que no exista'), coalesce(r.despues, 'que ya no exista');
    end if;
  end loop;

  v_repetidos := (select count(*) from (select 1 from retail.clientas c where c.correo is not null
                                         group by lower(btrim(c.correo)) having count(*) > 1) x);
  if v_repetidos > 0 then
    raise exception 'clientas: % correo(s) están en más de una ficha, y desde ahora un correo es de una sola persona. No se toca nada. Míralos (solo lectura) con: select lower(btrim(correo)), count(*) from retail.clientas where correo is not null group by 1 having count(*) > 1; y decide con Felipe a qué ficha le queda cada uno antes de volver a pegar.',
      v_repetidos;
  end if;
end
$guarda$;

-- ---------- 1. Un correo, una ficha ----------
create unique index if not exists clientas_correo_unico on retail.clientas (lower(btrim(correo))) where correo is not null;
comment on index retail.clientas_correo_unico is
  'Un correo es de una sola persona (Felipe 2026-10-14): dos fichas no comparten correo. El disparador fn_correo_de_una_persona da el mensaje claro y cubre también el correo de la cuenta web de otra ficha (cuentas_web).';

comment on column retail.clientas.correo is
  'Correo de contacto, opcional (ADR-0288 G-3): solo para contactarla si hace falta, nunca para publicidad. Se guarda en minúsculas y sin espacios. Es de UNA persona (Felipe 2026-10-14): ni otra ficha ni la cuenta web de otra ficha lo tienen (clientas_correo_unico y el disparador fn_correo_de_una_persona). Se borra al anonimizar (disparador clientas_club_datos_al_salir).';

-- ---------- 2. Ni el de otra ficha ni el de la cuenta web de otra ficha ----------
-- Sirve a las dos tablas: en `clientas` la persona es la fila (`id`); en `cuentas_web`, su ficha (`clienta_id`). La PARTE 2 lo
-- engancha a `cuentas_web`. Mira esa tabla solo si existe.
create or replace function retail.fn_correo_de_una_persona()
returns trigger
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_correo text := lower(btrim(new.correo));
  v_ficha uuid;
begin
  if v_correo is null or v_correo = '' then
    return new;
  end if;
  if tg_table_name = 'cuentas_web' then
    v_ficha := new.clienta_id;
  else
    v_ficha := new.id;
  end if;
  -- Dos escrituras del mismo correo a la vez (una ficha y una cuenta web, o dos fichas) hacen fila aquí: la segunda despierta
  -- cuando la primera confirma, y su consulta de abajo ya la ve.
  perform pg_advisory_xact_lock(hashtextextended('correo_de_una_persona:' || v_correo, 0));
  if exists (select 1 from retail.clientas c where lower(btrim(c.correo)) = v_correo and c.id is distinct from v_ficha)
     or (to_regclass('retail.cuentas_web') is not null
         and exists (select 1 from retail.cuentas_web w where w.correo = v_correo and w.clienta_id is distinct from v_ficha)) then
    raise exception 'Ese correo ya está registrado con los datos de otra persona.'
      using errcode = '23505', hint = 'correo_repetido', detail = 'correo';
  end if;
  return new;
end;
$$;

comment on function retail.fn_correo_de_una_persona() is
  'Disparador (Felipe 2026-10-14): un correo es de una sola persona. Rechaza el correo de una ficha o de una cuenta web (cuentas_web) que ya tiene OTRA ficha o la cuenta web de otra ficha: 23505, hint correo_repetido, detail correo, sin decir de quién es. La misma persona sí puede tener su correo de contacto y el de su cuenta web. Un candado consultivo por correo pone en fila dos escrituras a la vez.';
revoke all on function retail.fn_correo_de_una_persona() from public, anon, authenticated;

create or replace trigger clientas_correo_de_una_persona_alta before insert on retail.clientas
  for each row
  when (new.correo is not null)
  execute function retail.fn_correo_de_una_persona();

create or replace trigger clientas_correo_de_una_persona_cambio before update of correo on retail.clientas
  for each row
  when (new.correo is not null and new.correo is distinct from old.correo)
  execute function retail.fn_correo_de_una_persona();

-- ---------- 3. editar_clienta: el documento de otra ficha dice de cuál es ----------
-- Sobre su definición viva (la de la 1b, md5 e00a9edb…). Cambia SOLO el rechazo del documento repetido: ya no ofrece «Unir con
-- otra ficha», dice de qué ficha es el documento.
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
  v_otra_nombre text;
  v_otra_codigo text;
  v_otra_archivada boolean;
  v_otra_detalle text;
  v_otra text;
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

comment on function retail.editar_clienta(uuid, text, text, text, text, smallint, smallint, smallint, jsonb, integer) is
  'Edita la ficha (documento con tipo, nombre, celular, cumpleaños con año opcional, tallas) con candado optimista (PT409 version_cambiada). No da permisos del club (ADR-0288 D-4). A una socia no se le borra el celular (socia_sin_celular), el documento ni el nombre (socia_sin_documento); si se le cambia el celular y tenía publicidad, se la quita en la misma transacción (medio cambio_celular) y sigue socia. Documento de otra ficha → 23505 documento_de_otra_ficha, con el nombre de esa ficha (desde 2026-10-14 no se unen fichas: un documento es de una sola persona). Módulo «Clientas».';

-- ---------- 4. Ya no se unen fichas ----------
-- Felipe (2026-10-14): con el documento y el correo de una sola persona, «Unir fichas» sobra. La función se va; lo que dejó (nada,
-- en producción) se queda en clientas_fusiones.
drop function if exists retail.unir_clientas(uuid, uuid, integer, integer);

comment on table retail.clientas_fusiones is
  'D-99: la foto completa de cada ficha que se unió a otra (unir_clientas), para reconstruirla a mano si la unión fue un error. Historia: desde el 2026-10-14 ya no se unen fichas (Felipe: el documento y el correo son de una sola persona; unir_clientas se borró en 20261015054000). Lo que hay se queda (en producción, nada) y anonimizar sigue limpiando la foto de las fichas de la misma persona. Sin políticas: solo la leen funciones security definer.';
comment on column retail.clientas.fusionada_en_id is
  'Si esta ficha se unió a otra (unir_clientas, hasta el 2026-10-14), la ficha que quedó. Ver retail.clientas_fusiones. Desde 20261015054000 ya no se unen fichas: nada nuevo escribe esta columna.';

reset lock_timeout;

notify pgrst, 'reload schema';
