-- ============================================================================
-- 20261015232000_club_cartel_no_escribe_en_una_ficha_existente.sql — CAYLA V2 · Club (ADR-0288) y tienda online (ADR-0408)
-- El cartel del Club no escribe en una ficha que ya existía: ni datos, ni Club, ni permisos. Se pide en caja.
--
-- EL PROBLEMA PRIMERO. La página del cartel (`/club/<tienda>`, sin cuenta) registra con el documento, y si el documento ya tenía
-- ficha la ACTUALIZABA (regla G-4 de ADR-0288): reemplazaba su celular, su fecha de nacimiento y su correo, la sumaba al Club y
-- anotaba permisos a su nombre. La página no puede saber si quien escribe es la dueña del documento: un DNI se ve en boletas y
-- chats. Con eso, cualquiera podía mandarse los avisos y beneficios de otra persona, dejar un consentimiento que ella no dio
-- (Ley 29733) y, desde la tienda online, poner su propio correo en la ficha ajena para después crear la cuenta web con él
-- (20261015230000 une una ficha a una cuenta solo con el correo que la ficha ya tenía).
--
-- QUÉ CAMBIA (Felipe 2026-10-15, opción A). `registrarse_en_el_club`: si el documento ya tiene ficha (archivada o no), no escribe
-- NADA y rechaza con P0001 `club_ya_tiene_ficha`: «Ya tienes una ficha con ese documento. Para unirte al Club o cambiar tus datos,
-- pídelo en caja.» En caja se ve a la persona y se usa «Editar» o «Unirse al Club» de la ficha. Un documento NUEVO se registra
-- igual que hoy (ficha nueva, socia con su código, sus permisos). La ficha archivada sigue con su mensaje propio.
--
-- QUÉ NO CAMBIA. Los topes del cartel (`club_intento`, que se cuenta ANTES y aparte), los textos legales, la ficha nueva, la caja.
--
-- CÓMO. Reemplazo anclado (como 20261008120000): se inserta el rechazo justo después del de la ficha archivada, antes de la primera
-- escritura sobre la ficha que ya existía. Lo que sigue en esa rama queda sin camino. Antes se compara el md5 del cuerpo vivo (sin
-- comentarios ni espacios, como 20261003235000) con el de producción del 2026-10-15 y con el de este archivo: si es otro, alguien la
-- cambió en vivo y se detiene sin tocar nada.
--
-- PRODUCCIÓN. Una sola parte, idempotente. Solo reemplaza una función: no toca tablas ni políticas. Va junto con 20261015230000.
-- Publicar antes la web de este PR (entiende `club_ya_tiene_ficha`); si se pega antes, la página de hoy dice «no pudimos» en ese
-- caso, sin escribir nada.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function pg_temp.reemplazar_anclado(p_firma text, p_viejo text, p_nuevo text)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  -- Ya aplicado: el texto nuevo está. Se mira primero porque, una vez aplicado, el ancla vieja ya no aparece y el conteo abortaría.
  if position(p_nuevo in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta migración: el ancla aparece % veces (se esperaba 1). Regenera el reemplazo desde su definición real.',
      p_firma, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- La cadena de versiones de registrarse_en_el_club (la leen las pruebas del cartel): el md5 de su cuerpo sin comentarios ni espacios,
-- como en 20261003235000. «Antes» es el «después» de esa migración (el de producción el 2026-10-15).
do $$
declare
  c_antes constant text := 'e62ada5c57e772e4c0e3854cc8984ddb';    -- «después» de 20261003235000 (el de producción el 2026-10-15)
  c_despues constant text := '28e2b3b980a8634d76a573ff15d580e2';  -- «después» de este archivo
  v_md5 text := (select md5(regexp_replace(regexp_replace(regexp_replace(p.prosrc, '/\*.*?\*/', '', 'g'), '--[^' || chr(10) || ']*', '', 'g'), '\s+', '', 'g'))
                   from pg_proc p where p.oid = to_regprocedure(
    'retail.registrarse_en_el_club(uuid, text, text, text, text, date, text, boolean, boolean, boolean, jsonb, boolean)'));
begin
  if v_md5 is null or v_md5 not in (c_antes, c_despues) then
    raise exception 'registrarse_en_el_club tiene otro cuerpo (md5 normalizado %): no es el de producción del 2026-10-15 (%) ni el de este archivo (%). Reescribe el reemplazo desde su definición real antes de pegar.',
      coalesce(v_md5, 'ninguno'), c_antes, c_despues;
  end if;
end $$;

select pg_temp.reemplazar_anclado(
  'retail.registrarse_en_el_club(uuid, text, text, text, text, date, text, boolean, boolean, boolean, jsonb, boolean)',
  $v$    if v_archivada then
      raise exception 'Para unirte necesitamos revisar tus datos en tienda: acércate a caja y te ayudamos.'
        using errcode = 'P0001', hint = 'club_documento_archivado';
    end if;
$v$,
  $n$    if v_archivada then
      raise exception 'Para unirte necesitamos revisar tus datos en tienda: acércate a caja y te ayudamos.'
        using errcode = 'P0001', hint = 'club_documento_archivado';
    end if;
    -- 20261015232000 (Felipe 2026-10-15, opción A): la página no prueba que el documento sea de quien escribe. Con una ficha que
    -- ya existía ANTES de este registro (creada en otra transacción) no se escribe nada (ni datos, ni Club, ni permisos): se pide en
    -- caja, donde ven a la persona.
    if (select c.created_at from retail.clientas c where c.id = v_id) < now() then
      raise exception 'Ya tienes una ficha con ese documento. Para unirte al Club o cambiar tus datos, pídelo en caja.'
        using errcode = 'P0001', hint = 'club_ya_tiene_ficha';
    end if;
$n$
);

reset lock_timeout;
