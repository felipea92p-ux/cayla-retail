-- ============================================================================
-- 20261102211000_costo_atipico_con_motivo.sql — CAYLA V2 · P19 del «Análisis del Taller» (2-nov-2026)
-- Confirmar un costo atípico al pasar una orden al stock pide un MOTIVO escrito, y la orden guarda quién lo confirmó y cuándo.
--
-- EL PROBLEMA PRIMERO. Al pasar 720 prendas al stock con costo cero, la hoja pidió confirmar y, con un clic, entraron con costo 0.00 y la nota
-- «Costo atípico confirmado por un líder (sin costo)»: sin el nombre de quien confirmó y sin una razón. Ese costo entra al promedio de la prenda en
-- todas las sedes y nadie puede reconstruir después quién lo aprobó ni por qué. Felipe decidió el 2-nov-2026: motivo escrito + nombre + hora.
--
-- CONTRATO (3 líneas).
--   PROMETE: confirmar un costo atípico es imposible sin un motivo de 5 a 300 letras; al confirmar, la nota de la orden dice «Costo atípico
--            confirmado por <nombre> el <día y hora de Lima> (<clase>): «<motivo>»» y Actividad guarda una fila con el mismo motivo.
--   ASUME:   quien llama es un líder (como siempre) y el motivo llega por `cerrar_produccion_con_motivo`; llamar a `cerrar_produccion(…, true)` a
--            pelo ya no confirma nada (la API directa no se salta la regla: lo exige el servidor, no la pantalla).
--   NO HACE: no cambia cuándo un costo es atípico (`fn_costo_fuera_de_banda`), ni quién puede confirmar, ni toca las otras funciones que escriben
--            «Costo atípico confirmado» (compras, recibir_lote, recibir_envio).
--
-- DECIDÍ  dejar `cerrar_produccion` con su firma de siempre y agregar `cerrar_produccion_con_motivo(…, p_motivo text)`, que deja el motivo en una
--         variable de la TRANSACCIÓN (`retail.motivo_costo_atipico`) y llama a la de siempre; `cerrar_produccion` lo exige al confirmar.
-- DESCARTÉ un 7.º parámetro en `cerrar_produccion`: cambiar su firma obliga a borrar la anterior, y seis migraciones y ocho pruebas la nombran
--          (`pg_get_functiondef('…boolean)'::regprocedure)`): cada vez que se vuelven a cargar, se rompen. Tampoco un encabezado HTTP: hay que
--          codificar las tildes y es un canal escondido.
-- SE ROMPE SI una web VIEJA (sin motivo) confirma un costo atípico después de pegar este SQL: recibe `costo_atipico_sin_motivo` y se queda en la
--          pregunta hasta que recargue (el aviso «Hay una versión nueva» se lo dice). Solo afecta a un líder confirmando un costo atípico
--          justo en esos minutos.
--
-- TODO O NADA. El `raise` por falta de motivo ocurre dentro de `cerrar_produccion`, antes de escribir un solo movimiento o costo: se deshace todo
-- lo que ya había tocado (buenas, estado), como la pregunta de siempre. Actividad se anota DESPUÉS y nunca frena el cierre (un aviso en el log).
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). UNA parte: solo funciones, sin tablas ni políticas, con `lock_timeout`. Idempotente: un reemplazo
-- ya hecho se salta. Sin `select … into` dentro de textos entre comillas (ADR-0288). Reemplazo anclado: se detiene si la definición viva no es la
-- esperada.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

create or replace function pg_temp.reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_nuevo in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- ---------- 1. El motivo de esta transacción ----------
create or replace function retail.fn_costo_atipico_motivo()
returns text
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_motivo text := nullif(btrim(coalesce(current_setting('retail.motivo_costo_atipico', true), '')), '');
begin
  if v_motivo is null or length(v_motivo) < 5 then
    raise exception 'Escribe el motivo: por qué este costo es correcto (al menos 5 letras)'
      using hint = 'costo_atipico_sin_motivo';
  end if;
  if length(v_motivo) > 300 then
    raise exception 'El motivo es muy largo: hasta 300 letras'
      using hint = 'costo_atipico_sin_motivo';
  end if;
  return v_motivo;
end;
$$;
comment on function retail.fn_costo_atipico_motivo() is
  'P19 (2-nov-2026): el motivo con el que un líder confirma un costo atípico, de 5 a 300 letras; lo deja cerrar_produccion_con_motivo en la variable de la '
  'transacción retail.motivo_costo_atipico. Sin motivo, rechaza con la pista costo_atipico_sin_motivo. Interna.';
revoke all on function retail.fn_costo_atipico_motivo() from public, anon, authenticated;

-- ---------- 2. «Costo atípico confirmado por <nombre> el <día y hora de Lima>» ----------
create or replace function retail.fn_costo_atipico_prefijo()
returns text
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  v_quien text;
begin
  -- El motivo se exige ANTES que nada: sin él no hay constancia que escribir.
  perform retail.fn_costo_atipico_motivo();
  v_quien := (select nullif(btrim(concat_ws(' ', pe.nombres, pe.apellidos)), '') from public.personas pe where pe.id = retail.fn_actor_persona_id(true));
  return 'Costo atípico confirmado por ' || coalesce(v_quien, 'un líder') || ' el ' || to_char(now() at time zone 'America/Lima', 'DD/MM/YYYY HH24:MI');
end;
$$;
comment on function retail.fn_costo_atipico_prefijo() is
  'P19 (2-nov-2026): la primera mitad de la constancia de un costo atípico confirmado: quien lo confirmó (el responsable que firma) y el día y la hora de '
  'Lima. Rechaza si no hay motivo. Interna.';
revoke all on function retail.fn_costo_atipico_prefijo() from public, anon, authenticated;

-- ---------- 3. cerrar_produccion: la constancia lleva nombre, hora y motivo ----------
select pg_temp.reemplazar('retail.cerrar_produccion(uuid,jsonb,numeric,numeric,numeric,boolean)',
$v$'Costo atípico confirmado por un líder (' || case v_motivo$v$,
$n$retail.fn_costo_atipico_prefijo() || ' (' || case v_motivo$n$,
1);
select pg_temp.reemplazar('retail.cerrar_produccion(uuid,jsonb,numeric,numeric,numeric,boolean)',
$v$end || ')')$v$,
$n$end || '): «' || retail.fn_costo_atipico_motivo() || '»')$n$,
1);

-- ---------- 4. La puerta con motivo ----------
create or replace function retail.cerrar_produccion_con_motivo(
  p_produccion_id uuid,
  p_buenas jsonb,
  p_costo_tela numeric,
  p_costo_avios numeric,
  p_costo_maquila numeric,
  p_confirma_costo_atipico boolean default false,
  p_motivo text default null
)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_antes text;
  v_despues text;
  v_numero integer;
  v_sede uuid;
begin
  v_antes := (select pr.nota from retail.producciones pr where pr.id = p_produccion_id);
  -- El motivo vive solo en esta transacción (`true`): no se queda pegado a la conexión.
  perform set_config('retail.motivo_costo_atipico', coalesce(btrim(p_motivo), ''), true);
  perform retail.cerrar_produccion(p_produccion_id, p_buenas, p_costo_tela, p_costo_avios, p_costo_maquila, coalesce(p_confirma_costo_atipico, false));
  perform set_config('retail.motivo_costo_atipico', '', true);

  -- Si esta llamada dejó una constancia nueva en la nota, queda también en Actividad. Anotar nunca frena el cierre.
  v_despues := (select pr.nota from retail.producciones pr where pr.id = p_produccion_id);
  if v_despues is distinct from v_antes and v_despues like '%Costo atípico confirmado por%' then
    begin
      v_numero := (select pr.numero from retail.producciones pr where pr.id = p_produccion_id);
      v_sede := (select pr.ubicacion_id from retail.producciones pr where pr.id = p_produccion_id);
      perform retail.fn_actividad_anotar(
        'produccion', 'costo_atipico_confirmado',
        retail.fn_produccion_numero_texto(v_numero) || ': costo atípico confirmado — «' || btrim(p_motivo) || '»',
        retail.fn_actor_persona_id(true), retail.fn_actividad_terminal_ahora(), v_sede, null,
        'producciones', p_produccion_id::text, now(),
        jsonb_build_object('produccion_id', p_produccion_id, 'orden', retail.fn_produccion_numero_texto(v_numero), 'motivo', btrim(p_motivo)), 'vivo');
    exception when others then
      raise warning 'actividad: no se anotó el costo atípico confirmado de la orden % (%)', p_produccion_id, sqlerrm;
    end;
  end if;
end;
$$;
comment on function retail.cerrar_produccion_con_motivo(uuid, jsonb, numeric, numeric, numeric, boolean, text) is
  'P19 (2-nov-2026): lo mismo que cerrar_produccion, más el MOTIVO con el que un líder confirma un costo atípico (5 a 300 letras). Sin motivo, un costo '
  'atípico no se confirma. La nota de la orden y Actividad guardan quién, cuándo y por qué. Con un costo normal el motivo se ignora.';
revoke all on function retail.cerrar_produccion_con_motivo(uuid, jsonb, numeric, numeric, numeric, boolean, text) from public, anon;
grant execute on function retail.cerrar_produccion_con_motivo(uuid, jsonb, numeric, numeric, numeric, boolean, text) to authenticated;

-- ---------- 5. Comprobación final ----------
do $$
declare
  v_def text := pg_get_functiondef('retail.cerrar_produccion(uuid,jsonb,numeric,numeric,numeric,boolean)'::regprocedure);
begin
  if position('fn_costo_atipico_prefijo()' in v_def) = 0 or position('fn_costo_atipico_motivo()' in v_def) = 0 then
    raise exception 'cerrar_produccion no quedó con la constancia de nombre, hora y motivo';
  end if;
  if to_regprocedure('retail.cerrar_produccion_con_motivo(uuid,jsonb,numeric,numeric,numeric,boolean,text)') is null then
    raise exception 'falta cerrar_produccion_con_motivo';
  end if;
end;
$$;

reset lock_timeout;
