-- ============================================================================
-- 20261003235000_club_no_repetir_permiso_al_actualizar_datos.sql — CAYLA V2 (ADR-0288, tanda 1g, ajuste)
--
-- EL PROBLEMA PRIMERO. Una miembro que vuelve a escanear el cartel con su mismo documento para actualizar sus datos NO es una
-- clienta nueva: `registrarse_en_el_club` la encuentra por su documento, reemplaza sus datos y le conserva la fecha y el código
-- (G-4; la página le dice «Actualizamos tus datos»). Hasta ahora, además, dejaba CADA VEZ otra fila «club · otorga» en
-- `club_permisos` (y otra «publicidad · otorga» si volvía a marcar la casilla). La historia de la ficha mostraba «Se unió al club»
-- dos, tres veces, con la misma fecha y los mismos textos, como si se hubiera unido de nuevo. Visto el 2026-10-03 en la ficha de
-- C-0003 (Se unió · Pidió la publicidad · Se unió).
--
-- EL CAMBIO (dos anclas en el cuerpo vivo de `registrarse_en_el_club`, paso 9 y paso 10).
--   · CLUB. Si ya era miembro y ya tiene una fila «club · otorga» con la MISMA versión de los términos y de la privacidad, no hay
--     fila nueva: no aceptó nada que no hubiera aceptado. Si los textos cambiaron desde entonces, SÍ se anota (es prueba de qué
--     aceptó y cuándo, Ley 29733), con la nota «volvió a aceptar los textos nuevos…», para que la ficha la llame así y no «Se unió».
--   · PUBLICIDAD. Si ya la tenía (`publicidad_desde`) y ya hay una fila «publicidad · otorga» con la MISMA versión de la casilla,
--     no hay fila nueva. Con una casilla nueva se anota («volvió a aceptar el texto nuevo»). Si la perdió al cambiar de celular, esa
--     función ya puso `publicidad_desde` en null antes: marcar la casilla de nuevo es un permiso nuevo y se anota como siempre.
--
-- LO QUE NO CAMBIA. Los datos de la ficha, el código, la fecha, la respuesta de la función (`era_socia`, lo que lee la página),
-- la anotación de actividad, la revocación al cambiar de celular, ni la primera unión (siempre deja su fila). Las filas duplicadas
-- que ya existen se quedan: `club_permisos` es de solo agregar (un disparador rechaza update y delete) y son historia, no estorban.
--
-- DECIDÍ: omitir la fila en vez de dejarla y distinguirla en pantalla. Una fila que dice lo mismo que otra no prueba nada nuevo, y
-- «Se unió» dos veces confunde a quien atiende (¿se salió y volvió?). Con textos nuevos sí hay algo nuevo que probar.
-- DESCARTÉ: una tabla o una columna aparte para «actualizaciones de datos»: la actividad ya anota «una socia actualizó sus datos
--   desde el cartel» (con `era_socia`), sin datos suyos. Un permiso es lo que ella da, no que corrigió su celular.
-- DESCARTÉ: reescribir la función entera desde este archivo. `registrarse_en_el_club` vive en producción con la PARTE 8 de la 1g
--   (huella `757afd3b…`); se corta sobre `pg_get_functiondef` con dos anclas que deben aparecer EXACTAMENTE una vez y candado de
--   huella antes y después, como `20261003130000`. Con otra huella aborta sin tocar nada.
-- SE ROMPE SI alguien vuelve a pegar `20261001210700` (recrea la función desde su archivo y devuelve el comportamiento viejo; su
--   candado de huella aborta, porque la función viva ya no es ni su «antes» ni su «después»: es lo correcto).
--
-- PRODUCCIÓN. Pegar SOLA en el SQL Editor (ya trae `retail.`). Sin tablas, políticas ni `drop trigger`: ADR-0195 no aplica.
-- Idempotente: la segunda vez avisa y no toca nada. No depende de la web: nada que publicar antes ni después, salvo que la ficha
-- (PR aparte) llama «Aceptó los textos nuevos» a las filas con esa nota.
--
-- VERIFICACIÓN (solo lectura, después de pegar):
--   select md5(regexp_replace(regexp_replace(regexp_replace(p.prosrc, '/\*.*?\*/', '', 'g'), '--[^' || chr(10) || ']*', '', 'g'), '\s+', '', 'g')),
--          position('volvió a aceptar los textos nuevos' in p.prosrc) > 0
--     from pg_proc p where p.oid = 'retail.registrarse_en_el_club(uuid,text,text,text,text,date,text,boolean,boolean,boolean,jsonb,boolean)'::regprocedure;
--   → la huella «después» de abajo | t
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function pg_temp.club_no_repetir_md5(p_firma text)
returns text
language sql
as $f$
  select md5(regexp_replace(regexp_replace(regexp_replace(p.prosrc, '/\*.*?\*/', '', 'g'), '--[^' || chr(10) || ']*', '', 'g'), '\s+', '', 'g'))
    from pg_proc p where p.oid = to_regprocedure(p_firma)
$f$;

do $migracion$
declare
  c_firma constant text := 'retail.registrarse_en_el_club(uuid,text,text,text,text,date,text,boolean,boolean,boolean,jsonb,boolean)';
  c_antes constant text := '757afd3b843156eb2ba87524ce5966a4';    -- «después» de 20261001210700 (el de producción el 2026-10-03)
  c_despues constant text := 'e62ada5c57e772e4c0e3854cc8984ddb';  -- «después» de este archivo
  c_ancla_club constant text := $a$  insert into retail.club_permisos (clienta_id, finalidad, accion, medio, texto_tipo, texto_version, ubicacion_id, nota)
  values (v_id, 'club', 'otorga', 'pagina_cartel', 'terminos', v_terminos, p_ubicacion_id,
          'aceptó también la privacidad v' || v_privacidad);$a$;
  c_club_nuevo constant text := $n$  -- Ya era miembro y aceptó los MISMOS textos (términos y privacidad) que la última vez: no dio nada nuevo, no hay fila. Antes,
  -- cada vez que actualizaba sus datos en el cartel el historial decía «Se unió al club» otra vez. Con textos nuevos sí se anota.
  if not v_era_socia
     or not exists (select 1 from retail.club_permisos pp
                     where pp.clienta_id = v_id and pp.finalidad = 'club' and pp.accion = 'otorga'
                       and pp.texto_tipo = 'terminos' and pp.texto_version = v_terminos
                       and pp.nota like ('%privacidad v' || v_privacidad)) then
    insert into retail.club_permisos (clienta_id, finalidad, accion, medio, texto_tipo, texto_version, ubicacion_id, nota)
    values (v_id, 'club', 'otorga', 'pagina_cartel', 'terminos', v_terminos, p_ubicacion_id,
            case when v_era_socia then 'volvió a aceptar los textos nuevos · privacidad v' || v_privacidad
                 else 'aceptó también la privacidad v' || v_privacidad end);
  end if;$n$;
  c_ancla_pub constant text := $a$    insert into retail.club_permisos (clienta_id, finalidad, accion, medio, texto_tipo, texto_version, ubicacion_id)
    values (v_id, 'publicidad_whatsapp', 'otorga', 'pagina_cartel', 'casilla_publicidad', v_casilla, p_ubicacion_id);$a$;
  c_pub_nuevo constant text := $n$    -- Ya la tenía y marcó la misma casilla: no es un permiso nuevo. Con un texto de casilla nuevo, sí se anota.
    if v_publicidad_desde is null
       or not exists (select 1 from retail.club_permisos pp
                       where pp.clienta_id = v_id and pp.finalidad = 'publicidad_whatsapp' and pp.accion = 'otorga'
                         and pp.texto_tipo = 'casilla_publicidad' and pp.texto_version = v_casilla) then
      insert into retail.club_permisos (clienta_id, finalidad, accion, medio, texto_tipo, texto_version, ubicacion_id, nota)
      values (v_id, 'publicidad_whatsapp', 'otorga', 'pagina_cartel', 'casilla_publicidad', v_casilla, p_ubicacion_id,
              case when v_publicidad_desde is not null then 'volvió a aceptar el texto nuevo' end);
    end if;$n$;
  v_md5 text;
  v_def text;
begin
  v_md5 := pg_temp.club_no_repetir_md5(c_firma);
  if v_md5 is null then
    raise exception '% no existe en esta base.', c_firma;
  end if;
  if v_md5 = c_despues then
    raise notice 'registrarse_en_el_club ya no repite el permiso al actualizar datos: no se toca.';
    return;
  end if;
  if v_md5 <> c_antes then
    raise exception '% cambió desde que se escribió esta migración (md5 normalizado %; se esperaba % —antes— o % —después—). No se reemplaza a ciegas: lee su definición viva y rehace este parche sobre ESA versión.',
      c_firma, v_md5, c_antes, c_despues;
  end if;

  v_def := pg_get_functiondef(c_firma::regprocedure);
  if (length(v_def) - length(replace(v_def, c_ancla_club, ''))) / length(c_ancla_club) <> 1
     or (length(v_def) - length(replace(v_def, c_ancla_pub, ''))) / length(c_ancla_pub) <> 1 then
    raise exception 'club: las marcas de registrarse_en_el_club no aparecen exactamente una vez. No se toca nada.';
  end if;
  v_def := replace(v_def, c_ancla_club, c_club_nuevo);
  v_def := replace(v_def, c_ancla_pub, c_pub_nuevo);
  execute v_def;

  -- Validación final: si algo no quedó como se espera, se aborta TODO (la transacción entera).
  v_md5 := pg_temp.club_no_repetir_md5(c_firma);
  if v_md5 <> c_despues then
    raise exception 'club: registrarse_en_el_club quedó con md5 % y se esperaba %.', v_md5, c_despues;
  end if;
  if (select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'registrarse_en_el_club') <> 1 then
    raise exception 'club: quedaron sobrecargas de registrarse_en_el_club.';
  end if;
end
$migracion$;

-- ¿SE PEGÓ ENTERO? Esta es la ÚLTIMA instrucción del archivo. Si al terminar no ves una fila con esta parte y «QUEDÓ BIEN», el texto se
-- pegó cortado («Success» no quiere decir que se aplicó todo). Copia el archivo COMPLETO y vuelve a pegarlo: es seguro repetirlo.
select '20261003235000 · registrarse_en_el_club no repite el permiso' as parte,
       case when exists (select 1 from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = 'registrarse_en_el_club'
                            and p.prosrc like '%volvió a aceptar los textos nuevos%')
            then 'QUEDÓ BIEN' else 'REVISAR: falta alguna parte anterior o el texto se pegó cortado' end as resultado;
