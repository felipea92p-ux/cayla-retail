-- ============================================================================
-- 20261004100000_agregar_celular_clienta.sql — CAYLA V2 (ADR-0288, «Actualización 2026-10-03 (o)», actividad 2)
--
-- EL PROBLEMA PRIMERO. El paso Comprobante del cobro pide «Celular para enviarle la boleta por WhatsApp». Para un cliente que ya
-- tiene ficha pero NO tiene celular (todos los registrados antes del 2026-10-03: «Registrar cliente» solo pedía el documento), ese
-- número se escribe en cada compra y se pierde. Guardarlo en su ficha la próxima vez lo trae puesto. Lo que no puede pasar es
-- guardarlo con las funciones que ya existen:
--   · `editar_clienta` REEMPLAZA todos los campos (cumpleaños, tallas…): desde la caja, que solo conoce el documento y el nombre,
--     los borraría.
--   · `registrar_clienta` (upsert por documento) SOBRESCRIBE el celular de una ficha que ya tiene uno y, si era socia con
--     publicidad, se la quita en la misma transacción (ADR-0288, ajuste d: la publicidad es del número desde el que ella escribió).
--     Un número mal tipeado en caja le quitaría la publicidad a una socia sin que nadie lo note.
-- La base tiene que hacer imposible ese estado, no la pantalla: una función que SOLO AGREGA.
--
-- CONTRATO (Liskov)
--   PROMETE: `agregar_celular_clienta(p_id, p_celular) → boolean`.
--            · true  = la ficha NO tenía celular y ahora tiene `p_celular` (normalizado a 9 dígitos).
--            · false = la ficha YA tenía un celular (el mismo u otro): no se toca, ni él ni nada. No es un error: es la respuesta de
--                      «otra caja se te adelantó», y repetir la llamada no cambia nada (idempotente).
--            Nunca cambia ni borra un celular, nunca toca el club ni la publicidad, nunca da un permiso. La versión de la ficha sube
--            sola (`clientas_version_bu`), así que quien la estaba editando recibe `version_cambiada` y no pisa lo agregado.
--   ASUME:   la cuenta ve el módulo «Clientas» (`fn_exigir_modulo`, 42501 `clientas_sin_modulo`, ANTES de resolver al responsable);
--            el responsable del combo firma (`fn_actor_persona_id(true)`, ADR-0162); el celular es peruano de 9 dígitos que empieza
--            en 9 (`fn_exigir_celular`, 22023 `celular_invalido`).
--   FALLA:   `clienta_no_existe` (la ficha ya no está), `ficha_archivada` (se reactiva antes: una archivada no recibe datos).
--   NO HACE: no registra clientas, no valida que el celular sea de esa persona (lo escribe quien cobra), no lo comparte con otra ficha.
--
-- ESTADOS IMPOSIBLES (Lamport). Un `update … where telefono_whatsapp is null` bajo `for update` serializa dos cajas a la vez: la segunda
-- espera, ve el celular de la primera y responde false. Una socia SIEMPRE tiene celular (`clientas_socia_con_celular`), así que esta
-- función nunca la alcanza; una anonimizada está archivada (`clientas_anonimizada_implica_archivada`) y se rechaza antes, y de todos
-- modos `clientas_anonimizada_sin_datos_personales` le impediría tener celular.
--
-- TRANSACCIÓN (Gray). Es UNA operación sobre UNA fila: el cobro NO la espera ni depende de ella. La web la llama DESPUÉS de que
-- `registrar_venta` ya guardó la venta, aparte; si falla (red, módulo, función aún sin pegar), la venta queda bien y lo único que se
-- pierde es que el cliente no quedó con celular en su ficha. Una venta guardada sin conexión no la llama.
--
-- DECIDÍ: una función aparte que solo agrega, con booleano, en vez de un error cuando ya había celular. Quien llama es una caja que
--   decide con lo que leyó hace minutos; «ya tenía» no es un fallo, y un error obligaría a la web a distinguirlo de uno de verdad.
-- DESCARTÉ: agregar un parámetro `p_celular_ficha` a `registrar_venta`. Es la función más parchada del sistema (cola sin conexión, canje
--   del club, redondeo): mezclaría la venta con un dato de la ficha, y un fallo del celular tumbaría el cobro.
-- DESCARTÉ: reutilizar `editar_clienta` leyendo antes la ficha completa. Dos lecturas y una escritura por un campo, y si otra caja la
--   edita en medio, `version_cambiada` hace perder el celular o la edición de la otra.
-- SE ROMPE SI alguien reutiliza esta función para CAMBIAR un celular desde caja: un celular nuevo sobre una socia con publicidad le
--   quita el permiso (ajuste d), y la prueba `agregar_celular_clienta.mjs` lo vigila (una ficha con celular no cambia).
--
-- PRODUCCIÓN. Pegar SOLA en el SQL Editor (ya trae `retail.`). Sin tablas, políticas ni `drop trigger`: ADR-0195 no aplica. Una sola
-- parte, idempotente (`create or replace` y permisos). NO está en producción mientras no se pegue. Si la web sale antes que este SQL,
-- el cobro sigue igual (la llamada es aparte de la venta) pero la tarjeta de «Venta registrada» dice «No se pudo guardar en su ficha»
-- en cada venta a un cliente sin celular: conviene pegarlo ANTES de fusionar la web, aunque no haya un orden que rompa nada.
--
-- VERIFICACIÓN (solo lectura, después de pegar):
--   select p.prosecdef, has_function_privilege('authenticated', p.oid, 'execute'), has_function_privilege('anon', p.oid, 'execute'),
--          md5(regexp_replace(regexp_replace(regexp_replace(p.prosrc, '/\*.*?\*/', '', 'g'), '--[^' || chr(10) || ']*', '', 'g'), '\s+', '', 'g'))
--     from pg_proc p where p.oid = 'retail.agregar_celular_clienta(uuid,text)'::regprocedure;
--   → t | t | f | 42dac263714148cb7b68108869d88007
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

create or replace function retail.agregar_celular_clienta(p_id uuid, p_celular text)
returns boolean
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_persona uuid;
  v_celular text;
  v_id uuid;
  v_archivada timestamptz;
  v_tenia text;
begin
  -- La ficha es del módulo «Clientas»: se pregunta a la CUENTA, antes de resolver quién firma.
  perform retail.fn_exigir_modulo('clientas');
  v_persona := retail.fn_actor_persona_id(true);
  v_celular := retail.fn_exigir_celular(p_celular, true);

  -- `for update` desde la primera lectura: dos cajas a la vez se turnan. La segunda ve el celular de la primera y no hace nada.
  select c.id, c.archivada_en, c.telefono_whatsapp into v_id, v_archivada, v_tenia
    from retail.clientas c where c.id = p_id for update;
  if v_id is null then
    raise exception 'Esa clienta ya no existe — actualiza la pantalla.' using errcode = 'P0001', hint = 'clienta_no_existe';
  end if;
  if v_archivada is not null then
    raise exception 'Esta ficha está archivada — reactívala antes de agregarle un celular.' using errcode = 'P0001', hint = 'ficha_archivada';
  end if;

  -- Solo se AGREGA. Con un celular ya guardado (aunque sea otro) no se toca nada: cambiarlo le quitaría la publicidad a una socia.
  if nullif(btrim(coalesce(v_tenia, '')), '') is not null then
    return false;
  end if;

  update retail.clientas set telefono_whatsapp = v_celular where id = p_id;

  -- Sin nombre, documento ni celular en la frase (ADR-0249: la actividad de Clientas no lleva datos personales).
  perform retail.fn_actividad_anotar(
    'clientas', 'agregar_celular', 'agregó el celular de un cliente al cobrarle',
    v_persona, null, null, null, 'clientas', p_id::text, now(),
    jsonb_build_object('origen', 'cobro'), 'vivo'
  );
  return true;
end;
$$;

comment on function retail.agregar_celular_clienta(uuid, text) is
  'Agrega el celular a una ficha que NO lo tiene (true) o responde false si ya tenía uno: nunca cambia ni borra un celular, ni toca el club ni la publicidad (ADR-0288 act. o). La llama el cobro, aparte de la venta.';

revoke all on function retail.agregar_celular_clienta(uuid, text) from public, anon;
grant execute on function retail.agregar_celular_clienta(uuid, text) to authenticated;
