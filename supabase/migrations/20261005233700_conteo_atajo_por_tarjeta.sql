-- ============================================================================
-- 20261005233700_conteo_atajo_por_tarjeta.sql — CAYLA V2 · Inventario ▸ Conteo (ADR-0328, actividad 15; decisión de Felipe 2026-10-05)
-- «Completar todo» de una tarjeta CUENTA, pero ahora lo DICE: la línea queda marcada `completada_con_atajo`.
--
-- EL PROBLEMA PRIMERO.
--   El botón «Completar todo» de cada tarjeta (un modelo y color) anota, en las tallas que siguen pendientes, lo que CAYLA esperaba
--   —«encontré todo tal como estaba»—. La pantalla lo manda como si la persona hubiera escrito cada número a mano, así que la base no
--   puede distinguir «alguien contó 3» de «alguien tocó Completar todo». Eso importa por lo que dice la parte 2 de ADR-0328 (migración
--   20261004230100): un conteo «de arranque» fija el punto de partida de su lugar, y un arranque que nadie miró deja los errores de
--   la carga inicial para el conteo SIGUIENTE, donde entran como merma (cuenta 659) en un libro que no se corrige. Para eso ya existe
--   `aplicada_sin_contar`, pero solo la pone «Aplicar todos completos»; el atajo por tarjeta, que hace lo mismo de a una tarjeta, no.
--   Felipe (2026-10-05) eligió, entre dejarlo como está, marcarlo «sin contar» o contarlo pero decirlo: CONTARLO PERO DECIRLO.
--
-- QUÉ HACE.
--   · `conteo_items.completada_con_atajo`: la cifra la anotó «Completar todo» con lo que CAYLA esperaba; la persona tenía la tarjeta
--     delante y lo afirmó, pero nadie escribió la cantidad. A diferencia de `aplicada_sin_contar`, SIGUE contando: sube la exactitud,
--     vale para el arranque y puede llevar una diferencia (si se vendió algo entre que se leyó y se tocó el botón). Solo informa.
--   · `conteo_completar_tarjeta(conteo, líneas)`: lo que antes eran N llamadas a `conteo_contar` en fila es UNA, en UNA transacción
--     (todo o nada). No reescribe `conteo_contar` (lleva marcas de ADR-0189 y parches vivos, y una migración anterior ya descartó
--     tocar su firma): la LLAMA, línea por línea, y marca las que ella acaba de contar. Devuelve {completadas, lineas} como su hermana
--     `conteo_aplicar_completos`, para que la pantalla tome las líneas de la base.
--   · Un disparador apaga la marca cuando la línea se vuelve a verificar o se le borra la cifra: escribir el número a mano ES mirar.
--
-- ESTADOS QUE DEJAN DE SER POSIBLES:
--   · una línea «completada con el atajo» sin cifra (CHECK);
--   · una línea que es a la vez «completada con el atajo» y «aplicada sin contar»: son dos historias (una contó, la otra no);
--   · una línea que se volvió a contar a mano y sigue diciendo «con el atajo» (el disparador la apaga en la misma escritura).
--
-- DESCARTÉ
--   · Deducirlo de los datos («contada = lo esperado»): la inmensa mayoría de las líneas bien contadas coinciden con lo esperado; el
--     atajo quedaría confundido con el conteo honesto.
--   · Recordarlo solo en el navegador: no viaja entre aparatos (se cuenta en el celular y se revisa en la computadora) ni sobrevive a
--     cerrar la pestaña, y es justo en la revisión donde se necesita.
--   · Marcarla `aplicada_sin_contar` (opción B de Felipe): el atajo perdería su razón de ser (habría que escribir cada talla) y se
--     frenaría el conteo en la semana más cargada.
--   · Un parámetro nuevo en `conteo_contar`: recrearla entera arrastra sus parches vivos; la función nueva la llama y no la toca.
--   · Que el atajo escriba el stock de ahora, como `conteo_aplicar_completos`: cambiaría lo que el botón ya hace (una persona que ve 3
--     y confirma 3 tiene una diferencia si entre tanto se vendió una) y lo volvería otra copia del atajo global.
--
-- LO QUE NO CAMBIA: `fn_conteo_vale_como_arranque`, `cerrar_conteo`, `fn_conteos_resumen` y `fn_conteo_lineas_json` (opción C: cuenta y
--   solo informa). La pantalla lee la marca con un `select` a `conteo_items` (RLS ya deja leer): sin recrear ninguna función de lectura.
--
-- CÓMO SE PEGA EN PRODUCCIÓN: en el SQL Editor, tal cual (ya trae `retail.`), de una sola vez y fuera del horario de tienda. Toma por
-- un instante `conteo_items` (columna con valor por defecto: no reescribe la tabla; el CHECK lee sus filas una vez: ~235 en producción
-- el 2026-10-03). Sin políticas ni `drop trigger` (el disparador va con `create or replace trigger`): no choca con el Asesor de
-- seguridad (ADR-0195). Con `lock_timeout` de 3 s: si una tienda está guardando, falla sin trabar y se vuelve a pegar. Idempotente. La
-- web vieja sigue funcionando con la columna puesta (nadie la lee); la web NUEVA necesita esto pegado ANTES (si no, «Completar todo»
-- cae al camino viejo, línea por línea, y la frase de Revisar no sale: ver `ContarConteo.tsx`).
--
-- SE ROMPE SI alguien escribe `completada_con_atajo = true` fuera de `conteo_completar_tarjeta` (la tabla no se escribe desde la API: RLS
-- solo deja leer), o si `conteo_contar` cambia de firma y esta función no se rehace con ella.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- ---------------------------------------------------------------------------
-- 1. La marca y sus candados
-- ---------------------------------------------------------------------------
alter table retail.conteo_items add column if not exists completada_con_atajo boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'conteo_items_atajo_coherente'
                   and conrelid = 'retail.conteo_items'::regclass) then
    alter table retail.conteo_items
      add constraint conteo_items_atajo_coherente
      check (not completada_con_atajo or (cantidad_contada is not null and not aplicada_sin_contar));
  end if;
end $$;

comment on column retail.conteo_items.completada_con_atajo is
  'ADR-0328 (Felipe, 2026-10-05): la cifra la anotó «Completar todo» de una tarjeta con lo que CAYLA esperaba; nadie escribió la '
  'cantidad. SIGUE contando (exactitud, arranque): solo informa en Revisar. La escribe solo conteo_completar_tarjeta; el disparador '
  'conteo_items_atajo_se_apaga la apaga al volver a verificar la línea.';

-- La marca vale solo para la verificación que la puso: si la línea se vuelve a verificar (otra hora, otra cifra u otro «debe haber»)
-- o se le borra la cifra, ya no es «con el atajo». Quien la pone (`conteo_completar_tarjeta`) la escribe DESPUÉS de verificar, desde
-- `false`: por eso se mira el valor VIEJO. Corre antes del CHECK, así que apagarla evita que «borrar la cifra» choque con él.
create or replace function retail.trg_conteo_items_atajo() returns trigger
language plpgsql
set search_path = retail, public, extensions
as $fn$
begin
  if old.completada_con_atajo and new.completada_con_atajo
     and (new.verificado_en is distinct from old.verificado_en
          or new.cantidad_contada is distinct from old.cantidad_contada
          or new.cantidad_sistema is distinct from old.cantidad_sistema) then
    new.completada_con_atajo := false;
  end if;
  return new;
end;
$fn$;

revoke all on function retail.trg_conteo_items_atajo() from public, anon, authenticated;

-- `create or replace trigger`, nunca `drop trigger` + `create trigger` (el `drop` toma los candados de auth/storage, ADR-0195).
create or replace trigger conteo_items_atajo_se_apaga
  before update on retail.conteo_items
  for each row execute function retail.trg_conteo_items_atajo();

-- ---------------------------------------------------------------------------
-- 2. «Completar todo» de una tarjeta, en una sola transacción
-- ---------------------------------------------------------------------------
-- PROMETE: en un conteo abierto, cuenta —con `conteo_contar`, la misma función de siempre— las variantes pedidas que SIGUEN sin
--   cifra y las marca `completada_con_atajo`. Todo o nada: si una línea falla (cantidad negativa, sin permiso, conteo cerrado), no
--   queda ninguna contada. Devuelve {completadas, lineas}: cuántas contó y las líneas pedidas tal como quedaron.
-- ASUME: la pantalla manda, por cada variante, lo que CAYLA esperaba que hubiera (`debe haber`); `conteo_contar` vuelve a leer el stock
--   ahora, así que si se vendió algo entre tanto la línea sale con su diferencia, como siempre. Las que ya tienen cifra (otra persona
--   las contó mientras tanto), las que no son de la foto del conteo y las repetidas no se tocan: repetirla no cambia nada
--   (idempotente por su estado). Las «en reconteo» SÍ entran, como hasta ahora: la persona tiene la tarjeta delante y afirma que
--   estaba todo (a diferencia de «Aplicar todos completos», que no las toca). Mismos permisos y candados que `conteo_contar`: primero el
--   conteo (`for update`, que `conteo_contar` vuelve a tomar en la misma transacción), después el stock de cada prenda en orden de variante.
-- NO HACE: no marca nada que no haya contado ella en esta llamada; no escribe stock ni movimientos (eso lo hace el cierre).
create or replace function retail.conteo_completar_tarjeta(p_conteo_id uuid, p_lineas jsonb)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $fn$
declare
  c retail.conteos%rowtype;
  r record;
  v_completadas integer := 0;
begin
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' then
    raise exception 'Las líneas del atajo deben venir en una lista' using errcode = 'P0001', hint = 'lineas_invalidas';
  end if;

  select * into c from retail.conteos where id = p_conteo_id for update;
  if not found then raise exception 'El conteo % no existe', p_conteo_id; end if;
  if c.estado <> 'abierto' then raise exception 'Ese conteo ya está %', c.estado; end if;
  if not retail.fn_puede_operar_ubicacion(c.ubicacion_id) then
    raise exception 'No tienes permiso para contar en esa ubicación';
  end if;
  perform retail.fn_actor_persona_id(true);

  -- Se valida TODO antes de escribir nada: una cantidad vacía no es «completar» (en `conteo_contar` NULL es des-contar) y una
  -- negativa o con decimales no es una cantidad.
  for r in select e.value as linea from jsonb_array_elements(p_lineas) as e(value) loop
    if jsonb_typeof(r.linea) <> 'object'
       or jsonb_typeof(r.linea -> 'variante_id') is distinct from 'string'
       or jsonb_typeof(r.linea -> 'cantidad') is distinct from 'number'
       or (r.linea ->> 'cantidad')::numeric < 0
       or (r.linea ->> 'cantidad')::numeric <> trunc((r.linea ->> 'cantidad')::numeric) then
      raise exception 'Cada línea del atajo necesita variante_id y una cantidad entera de 0 o más'
        using errcode = 'P0001', hint = 'lineas_invalidas';
    end if;
  end loop;

  -- En orden de variante: el mismo orden de candados que `conteo_contar` y `conteo_aplicar_completos`.
  for r in
    select (e.value ->> 'variante_id')::uuid as variante_id, (e.value ->> 'cantidad')::integer as cantidad
      from jsonb_array_elements(p_lineas) as e(value)
     order by 1
  loop
    continue when not exists (select 1 from retail.conteo_items ci
                               where ci.conteo_id = p_conteo_id and ci.variante_id = r.variante_id
                                 and ci.cantidad_contada is null);
    perform retail.conteo_contar(p_conteo_id, r.variante_id, r.cantidad, false);
    -- Después de contar y desde `false`: el disparador solo apaga una marca que ya estaba puesta.
    update retail.conteo_items
       set completada_con_atajo = true
     where conteo_id = p_conteo_id and variante_id = r.variante_id and cantidad_contada is not null;
    v_completadas := v_completadas + 1;
  end loop;

  return jsonb_build_object(
    'completadas', v_completadas,
    'lineas', (select coalesce(jsonb_agg(l.j), '[]'::jsonb)
                 from jsonb_array_elements(retail.fn_conteo_lineas_json(p_conteo_id, null, true)) as l(j)
                where (l.j ->> 'variante_id')::uuid in (select (e.value ->> 'variante_id')::uuid from jsonb_array_elements(p_lineas) as e(value))));
end;
$fn$;

revoke all on function retail.conteo_completar_tarjeta(uuid, jsonb) from public, anon;
grant execute on function retail.conteo_completar_tarjeta(uuid, jsonb) to authenticated;

comment on function retail.conteo_completar_tarjeta(uuid, jsonb) is
  'ADR-0328 (Felipe, 2026-10-05): «Completar todo» de una tarjeta. Cuenta con conteo_contar las variantes pedidas que siguen sin '
  'cifra y las marca completada_con_atajo (SIGUE contando: solo informa en Revisar). Todo o nada; idempotente. Devuelve '
  '{completadas, lineas}.';
