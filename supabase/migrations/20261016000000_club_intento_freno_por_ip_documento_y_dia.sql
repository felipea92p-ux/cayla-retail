-- ============================================================================
-- 20261016000000_club_intento_freno_por_ip_documento_y_dia.sql — CAYLA V2 · Club (ADR-0288) y tienda online (ADR-0408)
-- El freno de las puertas públicas (el cartel del Club y el registro de la tienda online) cuenta mejor y no hace esperar a todos.
--
-- EL PROBLEMA PRIMERO. `club_intento` es el único freno de las dos páginas que cualquiera abre sin cuenta. Tenía tres huecos:
--   · un solo candado para TODAS las llamadas (`pg_advisory_xact_lock(hashtext('retail.club_intento'))`): un programa que repite
--     consultas hace esperar en fila a cada persona de cada tienda, y esa fila vive en la misma base que las cajas;
--   · anotaba ANTES de mirar el tope: un programa que insiste ya pasado el tope seguía llenando la tabla;
--   · la consulta del nombre por DNI solo tenía tope por ip: cambiando de ip se podía preguntar por un mismo DNI sin fin, y gastar
--     la consulta al padrón (SUNAT puede bloquear al servidor que le pregunta de más).
--
-- QUÉ CAMBIA (Felipe 2026-10-15, D6)
--   1. El candado es por ip (`retail.club_intento:<ip>`): una ip que insiste solo se espera a sí misma.
--   2. Primero se mira el tope; solo se anota lo que pasa. Los topes de siempre no cambian de número (20 consultas por ip y hora;
--      5 registros por ip, 3 por celular y 3 por documento, por hora).
--   3. La consulta de un DNI (una consulta con documento) tiene además tope por documento —5 por hora— y un tope del día para toda
--      CAYLA —300, día de Lima—. Las consultas de correo de la tienda (sin documento) no entran en esos dos: no tocan el padrón.
--   4. De paso, se borran de a poco los intentos de más de un día (hasta 200 por llamada). Son huellas para el tope (ip y documento
--      con sal), no datos de negocio; pasado un día no frenan nada. La conservación del Club ya vaciaba su celular.
--
-- QUÉ NO CAMBIA. La firma, quién la puede llamar (solo la llave de servicio y el dueño; la tienda la usa por sus `tienda_*`) y lo que
-- devuelve (true: pasa; false: tope). Las páginas siguen diciendo lo mismo con `false` («límite»).
--
-- GUARDIA. Antes de reemplazar se compara el md5 de su cuerpo sin comentarios ni espacios (como 20261003235000) con el de producción del
-- 2026-10-15 y con el de este archivo; si es otro, alguien la cambió en vivo y se detiene sin tocar nada.
--
-- PRODUCCIÓN. Una sola parte, idempotente. Solo reemplaza una función: no toca tablas ni políticas.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

do $$
declare
  c_antes constant text := '9009590c9d0aeb380974301b8987a2e7';    -- «después» de 20261001210700 (el de producción el 2026-10-15)
  c_despues constant text := '92b661a8d33ef50c6241f9b1fef952f6';  -- «después» de este archivo
  v_md5 text := (select md5(regexp_replace(regexp_replace(regexp_replace(p.prosrc, '/\*.*?\*/', '', 'g'), '--[^' || chr(10) || ']*', '', 'g'), '\s+', '', 'g'))
                   from pg_proc p where p.oid = to_regprocedure('retail.club_intento(text, text, text, text)'));
begin
  if v_md5 is null or v_md5 not in (c_antes, c_despues) then
    raise exception 'club_intento tiene otro cuerpo (md5 normalizado %): no es el de producción del 2026-10-15 (%) ni el de este archivo (%). Reescríbelo desde su definición real antes de pegar.',
      coalesce(v_md5, 'ninguno'), c_antes, c_despues;
  end if;
end $$;

create or replace function retail.club_intento(p_tipo text, p_ip_hash text, p_documento_hash text default null, p_celular text default null)
returns boolean
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_ip text := nullif(btrim(coalesce(p_ip_hash, '')), '');
  v_documento text := nullif(btrim(coalesce(p_documento_hash, '')), '');
  v_celular text := retail.fn_celular_normalizado(p_celular);
  v_hace_una_hora timestamptz := now() - interval '1 hour';
  v_ok boolean;
begin
  if p_tipo is null or p_tipo not in ('consulta', 'registro') or v_ip is null then
    raise exception 'Intento sin tipo o sin ip.' using errcode = '22023', hint = 'club_datos_invalidos';
  end if;
  if v_celular is not null and v_celular !~ '^[0-9]{9}$' then
    v_celular := null;
  end if;
  -- Un candado por ip: una ip que insiste solo se espera a sí misma (20261016000000).
  perform pg_advisory_xact_lock(hashtext('retail.club_intento:' || v_ip));

  if p_tipo = 'consulta' then
    v_ok := (select count(*) from retail.club_intentos_registro i
              where i.tipo = 'consulta' and i.ip_hash = v_ip and i.creado_en > v_hace_una_hora) < 20
        -- La consulta de un DNI (con documento): 5 por documento y hora, y 300 al día para toda CAYLA (día de Lima).
        and (v_documento is null or (
              (select count(*) from retail.club_intentos_registro i
                where i.tipo = 'consulta' and i.documento_hash = v_documento and i.creado_en > v_hace_una_hora) < 5
          and (select count(*) from retail.club_intentos_registro i
                where i.tipo = 'consulta' and i.documento_hash is not null
                  and i.creado_en >= (date_trunc('day', now() at time zone 'America/Lima') at time zone 'America/Lima')) < 300));
  else
    v_ok := (select count(*) from retail.club_intentos_registro i
              where i.tipo = 'registro' and i.ip_hash = v_ip and i.creado_en > v_hace_una_hora) < 5
        and (v_celular is null
             or (select count(*) from retail.club_intentos_registro i
                  where i.tipo = 'registro' and i.celular = v_celular and i.creado_en > v_hace_una_hora) < 3)
        and (v_documento is null
             or (select count(*) from retail.club_intentos_registro i
                  where i.tipo = 'registro' and i.documento_hash = v_documento and i.creado_en > v_hace_una_hora) < 3);
  end if;

  -- Solo se anota lo que pasa el tope: un programa que insiste ya no llena la tabla.
  if v_ok then
    insert into retail.club_intentos_registro (tipo, ip_hash, documento_hash, celular)
    values (p_tipo, v_ip, v_documento, v_celular);
  end if;

  -- Lo de más de un día ya no frena nada: se va de a poco (hasta 200 por llamada).
  delete from retail.club_intentos_registro
   where id in (select i.id from retail.club_intentos_registro i where i.creado_en < now() - interval '1 day' order by i.id limit 200);

  return v_ok;
end;
$$;

comment on function retail.club_intento(text, text, text, text) is
  'El freno de las puertas públicas (cartel del Club y registro de la tienda online, ADR-0288 G-10, 20261016000000). Candado por ip; primero mira el tope y solo anota lo que pasa. Consulta: 20 por ip y hora; con documento, además 5 por documento y hora y 300 al día en toda CAYLA. Registro: 5 por ip, 3 por celular y 3 por documento, por hora. Borra de a poco los intentos de más de un día. Devuelve true si pasa. Solo la llave de servicio (y las tienda_*, que corren como su dueño).';

reset lock_timeout;
