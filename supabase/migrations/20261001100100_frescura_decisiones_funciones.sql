-- ============================================================================
-- 20261001100100_frescura_decisiones_funciones.sql — CAYLA V2 · ADR-0208 «Frescura del piso» · paso 4b, PARTE 2 de 3.
-- Quién puede decidir, anotar, anular y leer lo decidido. Va DESPUÉS de 20261001100000 (la tabla) y ANTES de la web.
--
-- EL PROBLEMA PRIMERO. La tabla (parte 1) impide los estados imposibles, pero nadie sabe escribirla: las cuentas no tienen
-- permiso sobre ella (a propósito) y hay reglas que un constraint no puede saber porque son hechos DEL MOMENTO: ¿la prenda
-- tiene algo colgado ahora? ¿el traslado sale de esta sede? ¿quién puede anotar «La rebajé»? Esas reglas viven aquí, en
-- funciones `security definer`, con los mismos candados de las tres lecturas del paso 4.
--
-- LOS CONTRATOS (qué promete cada una y qué asume; si no cabe en tres líneas, no se entendió):
--   fn_puede_frescura(sede)                 PROMETE: «el líder, o quien tiene el módulo Frescura del piso, y solo en una sede
--                                           que opera» — la MISMA expresión de las tres lecturas del paso 4, escrita una
--                                           vez. Nunca devuelve NULL (un `if not NULL` no frena a nadie). ASUME: nada.
--   fn_puede_decidir_frescura(sede, acción) PROMETE: lo de arriba, y además «La rebajé» solo del líder (ADR-0208, decisión
--                                           11: la rebaja la aprueba el líder; y la venta ya exige líder para un descuento
--                                           manual). Es la ÚNICA excepción y vive aquí.
--   anotar_decision_frescura(…)             PROMETE: agrega UN renglón al final de la libreta de esa prenda en esa sede,
--                                           firmado por el responsable del combo, o no agrega nada. La misma marca con los
--                                           mismos datos devuelve el mismo renglón sin escribir. ASUME: `p_anterior_id` es
--                                           la última línea que vio la pantalla (null si la libreta estaba vacía).
--   anular_decision_frescura(…)             PROMETE: agrega un renglón `anulacion` que responde a la última línea (una
--                                           decisión), y la prenda queda sin decisión. No borra nada.
--   fn_frescura_decisiones(sede, días)      PROMETE: los renglones de la sede de los últimos días MÁS la última línea de cada
--                                           libreta aunque sea más vieja (sin ella, la pantalla no sabría a qué renglón
--                                           responder), con quién firmó, el traslado enlazado y, en «La rebajé», las ventas
--                                           desde ese día con su motivo de descuento. No calcula si sigue vigente ni si sirvió.
--
-- ORDEN DE LAS COMPROBACIONES (el orden ES parte del contrato; lo vigila la prueba T4):
--   1. el permiso, primero — como `mover_interno`: una cuenta sin permiso con la marca válida de otra persona recibe
--      `frescura_sin_permiso`, nunca el renglón guardado;
--   2. la MARCA, antes de la firma — un reintento de algo que ya se guardó responde aunque la responsable haya marcado su
--      salida entre tanto, y nunca dice «otra persona acaba de anotar» de sí misma (el reintento propio devuelve su renglón);
--   3. las validaciones del momento (algo colgado, el traslado, el plazo, que el antecedente sea de esta prenda…);
--   4. la firma (`fn_actor_persona_id(true)`: el responsable del combo, no la cuenta — ADR-0161/0162);
--   5. el insert. Si la última línea ya no es la que vio la pantalla —por una carrera o porque estaba abierta desde ayer—
--      lo dicen los índices únicos de la parte 1 y se atrapa aquí: PT409 `version_cambiada` (ADR-0193) con el nombre de
--      quien anotó y qué. UN solo mecanismo, sin un `if` que repita lo que la base ya garantiza.
--
-- QUÉ PASA SI ALGO FALLA (principio 9): estas funciones no tocan ningún servicio externo. Lo único que puede caer es la
-- lectura: `fn_frescura_decisiones` se llama APARTE de `fn_frescura_sede` y la pantalla la tolera — si no responde, «Por
-- decidir» vuelve a ser «quieta» (más prendas de las debidas, nunca menos), lo dice en una nota y esconde «Ya decidí»
-- (sin saber la última línea, chocaría).
--
-- TRANSACCIÓN: cada llamada es una transacción de una fila. No mueve stock: el retiro y el traslado son sus propias funciones.
--
-- PRODUCCIÓN: solo `create or replace function`, sus comentarios, `revoke` y `grant`: sin políticas, sin `drop trigger`, sin
-- `alter` de tablas (CLAUDE.md, «Políticas y deadlocks»). Sola, tal cual. Re-ejecutable. No edita `20260929100000` (es del
-- paso 4, ya en producción): sus tres lecturas pueden adoptar `fn_puede_frescura` cuando se reescriban; hasta entonces la
-- prueba T2 compara las dos expresiones sobre toda la matriz de roles.
--
-- VERIFICACIÓN después de pegar (solo lectura):
--   select proname, prosecdef from pg_proc where pronamespace = 'retail'::regnamespace and proname in
--     ('fn_puede_frescura', 'fn_puede_decidir_frescura', 'anotar_decision_frescura', 'anular_decision_frescura',
--      'fn_frescura_decisiones', 'fn_frescura_aviso_version') order by 1;   → 6 filas, una sola firma cada una
--   select has_function_privilege('anon', 'retail.anotar_decision_frescura(uuid,uuid,uuid,text,uuid,text,integer,uuid,text)', 'execute');   → false
--
-- SE ROMPE SI:
--   · una función futura escribe en la tabla sin atrapar `unique_violation` y le muestra el error crudo a la tienda: T5 lo
--     detecta con dos conexiones.
--   · quien tiene Frescura no ve Traslados: «La trasladé» pide un traslado real y tendría que pedírselo a quien arma los
--     traslados (a propósito: la anotación suelta contradice `transferencias`).
--   · el Taller (sin piso separado) o un producto de prueba: se rechazan con su pista; la pantalla nunca los ofrece.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

do $$
begin
  if to_regclass('retail.frescura_decisiones') is null then
    raise exception 'Falta la libreta: pega antes 20261001100000_frescura_decisiones_tabla.sql.';
  end if;
  if to_regprocedure('retail.fn_actor_persona_id(boolean)') is null or to_regprocedure('retail.fn_ve_modulo(text)') is null then
    raise exception 'Faltan fn_actor_persona_id o fn_ve_modulo (roles por módulo, 20260923100000 y 20260923030000).';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 0. Los dos candados
-- ---------------------------------------------------------------------------

create or replace function retail.fn_puede_frescura(p_ubicacion_id uuid)
returns boolean
language sql
stable
set search_path = retail, public, extensions
as $$
  -- coalesce: con una sede nula `fn_puede_operar_ubicacion` puede dar NULL, y `if not NULL` no frena a nadie.
  select coalesce(retail.fn_puede_operar_ubicacion(p_ubicacion_id) and (retail.fn_es_lider() or retail.fn_ve_modulo('frescura')), false);
$$;

comment on function retail.fn_puede_frescura(uuid) is
  'Frescura del piso (ADR-0208, 4b): el líder, o quien tiene el módulo «Frescura del piso» en su rol, y los dos solo en una sede que operan. Es la misma expresión de fn_frescura_sede, fn_confianza_registro y fn_bajadas_del_piso (paso 4), escrita una vez. Nunca NULL.';

create or replace function retail.fn_puede_decidir_frescura(p_ubicacion_id uuid, p_accion text)
returns boolean
language sql
stable
set search_path = retail, public, extensions
as $$
  -- «La rebajé» solo del líder (ADR-0208, decisión 11): es lo único que sube el nivel del permiso.
  select coalesce(retail.fn_puede_frescura(p_ubicacion_id) and (coalesce(p_accion, '') <> 'rebaje' or retail.fn_es_lider()), false);
$$;

comment on function retail.fn_puede_decidir_frescura(uuid, text) is
  'Frescura del piso (ADR-0208, 4b): fn_puede_frescura, y «La rebajé» (rebaje) solo del líder. Anotar y anular una rebaja piden lo mismo. Nunca NULL.';

-- ---------------------------------------------------------------------------
-- 1. El aviso de «otra persona ya anotó» (interna: la usan anotar y anular)
-- ---------------------------------------------------------------------------

create or replace function retail.fn_frescura_aviso_version(p_ubicacion_id uuid, p_producto_id uuid, p_color_clave text)
returns text
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  -- Dice quién y CUÁNDO con fecha y hora de Lima, no «hace un momento»: la pantalla puede llevar horas abierta y la
  -- última línea ser de ayer; una frase que a veces miente no sirve.
  select case d.accion
           when 'anulacion' then format('Otra persona acaba de quitar lo anotado sobre esta prenda (%s, el %s a las %s). Mírala antes de anotar la tuya.',
                                        coalesce(nullif(split_part(p.nombres, ' ', 1), ''), 'alguien'),
                                        to_char(d.creado_en at time zone 'America/Lima', 'DD/MM'), to_char(d.creado_en at time zone 'America/Lima', 'HH24:MI'))
           else format('Otra persona acaba de anotar una decisión sobre esta prenda («%s», %s, el %s a las %s). Mírala antes de anotar la tuya.',
                       case d.accion when 'cambie_lugar' then 'La cambié de lugar' when 'hasta_agotar' then 'La dejo hasta agotar'
                                     when 'traslade' then 'La trasladé a otra tienda' else 'La rebajé' end,
                       coalesce(nullif(split_part(p.nombres, ' ', 1), ''), 'alguien'),
                       to_char(d.creado_en at time zone 'America/Lima', 'DD/MM'), to_char(d.creado_en at time zone 'America/Lima', 'HH24:MI'))
         end
    from retail.frescura_decisiones d
    left join public.personas p on p.id = d.persona_id
   where d.ubicacion_id = p_ubicacion_id and d.producto_id = p_producto_id and d.color_clave = p_color_clave
     and not exists (select 1 from retail.frescura_decisiones r where r.anterior_id = d.id);
$$;

comment on function retail.fn_frescura_aviso_version(uuid, uuid, text) is
  'Interna (anotar/anular): el texto de «otra persona acaba de anotar…» con quién, qué y cuándo (hora de Lima) de la última línea de la libreta. Null si la libreta está vacía.';

-- ---------------------------------------------------------------------------
-- 2. Anotar una decisión
-- ---------------------------------------------------------------------------

create or replace function retail.anotar_decision_frescura(
  p_token uuid,
  p_ubicacion_id uuid,
  p_producto_id uuid,
  p_color_codigo text,
  p_anterior_id uuid,
  p_accion text,
  p_plazo_dias integer,
  p_transferencia_id uuid default null,
  p_nota text default null
)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $fn$
declare
  c_producto_centinela constant uuid := '11111111-1111-4111-8111-111111111111';   -- «Prenda sin registrar»
  v_color_clave text := coalesce(p_color_codigo, '');
  v_nota text := nullif(btrim(p_nota), '');
  v_prev retail.frescura_decisiones%rowtype;
  v_ant retail.frescura_decisiones%rowtype;
  v_piso uuid;
  v_alm uuid;
  v_libre bigint;
  v_persona uuid;
  v_terminal uuid;
  v_id uuid;
  v_creado timestamptz;
  v_c text;
begin
  -- 1. El permiso, primero (como mover_interno).
  if not retail.fn_puede_decidir_frescura(p_ubicacion_id, p_accion) then
    if coalesce(p_accion, '') = 'rebaje' and retail.fn_puede_frescura(p_ubicacion_id) then
      raise exception 'La rebaja la decide el líder. Si la sacaste del piso, elige «La saqué del piso».' using hint = 'frescura_rebaja_solo_lider';
    end if;
    raise exception 'Para anotar decisiones de esta sede hace falta el módulo «Frescura del piso» en tu rol y que sea una sede que operas.' using hint = 'frescura_sin_permiso';
  end if;
  if p_accion is null or p_accion not in ('cambie_lugar', 'hasta_agotar', 'traslade', 'rebaje') then
    raise exception 'Esa decisión no existe. Para quitar una decisión anotada se usa «Quitar lo anotado».' using hint = 'frescura_accion_invalida';
  end if;
  if p_token is null then
    raise exception 'Falta la marca de este toque.' using hint = 'frescura_token_requerido';
  end if;

  -- 2. La marca, antes de la firma y de la versión: un reintento de algo ya guardado responde aunque la responsable haya
  --    marcado su salida, y no se confunde con «otra persona».
  perform pg_advisory_xact_lock(hashtextextended('frescura_decision:' || p_token::text, 0));
  select * into v_prev from retail.frescura_decisiones where token_cliente = p_token;
  if found then
    if row(v_prev.ubicacion_id, v_prev.producto_id, v_prev.color_clave, v_prev.accion, v_prev.plazo_dias)
         is not distinct from row(p_ubicacion_id, p_producto_id, v_color_clave, p_accion, p_plazo_dias)
       and v_prev.anterior_id is not distinct from p_anterior_id
       and v_prev.transferencia_id is not distinct from p_transferencia_id
       and v_prev.nota is not distinct from v_nota then
      return jsonb_build_object('id', v_prev.id, 'creado_en', v_prev.creado_en, 'repetida', true);
    end if;
    raise exception 'Ese toque ya se guardó con otros datos: no se repitió. Elige de nuevo y vuelve a anotar.' using hint = 'frescura_token_reusado';
  end if;

  -- 3. Los hechos del momento.
  if v_nota is not null and char_length(v_nota) > 280 then
    raise exception 'La nota lleva hasta 280 letras.' using hint = 'frescura_nota_larga';
  end if;
  if p_plazo_dias is null or p_plazo_dias not between 1 and 30 then
    raise exception 'El plazo va de 1 a 30 días.' using hint = 'frescura_plazo_invalido';
  end if;
  select s.id into v_piso from retail.sububicaciones s where s.ubicacion_id = p_ubicacion_id and s.tipo = 'piso_venta';
  select s.id into v_alm from retail.sububicaciones s where s.ubicacion_id = p_ubicacion_id and s.tipo = 'almacen_tienda';
  if v_piso is null or v_alm is null or not exists (select 1 from retail.ubicaciones u where u.id = p_ubicacion_id and u.activo) then
    raise exception 'Esta sede no separa piso y almacén: no hay un piso que decidir.' using hint = 'frescura_sede_sin_piso';
  end if;
  if not exists (select 1 from retail.productos p where p.id = p_producto_id and not p.es_prueba and p.id <> c_producto_centinela)
     or not exists (select 1 from retail.variantes v where v.producto_id = p_producto_id and v.color_codigo is not distinct from p_color_codigo) then
    raise exception 'Esa prenda no existe o no se puede decidir.' using hint = 'frescura_producto_invalido';
  end if;
  -- Algo LIBRE colgado (lo apartado para una clienta ya tiene dueña y no cuenta: R7-1).
  select coalesce(sum(s.cantidad - s.cantidad_apartada), 0) into v_libre
    from retail.stock s
    join retail.variantes v on v.id = s.variante_id
   where s.ubicacion_id = p_ubicacion_id and s.sububicacion_id = v_piso
     and v.producto_id = p_producto_id and v.color_codigo is not distinct from p_color_codigo;
  if v_libre <= 0 then
    raise exception 'Esta prenda ya no tiene nada colgado en esta tienda: sale sola de «Por decidir». No hace falta anotar nada.' using hint = 'frescura_nada_colgado';
  end if;
  if p_accion = 'traslade' then
    if p_transferencia_id is null or not exists (
         select 1 from retail.transferencias t
          where t.id = p_transferencia_id and t.estado <> 'anulada' and t.ubicacion_origen_id = p_ubicacion_id
            and t.created_at >= now() - interval '14 days'
            and exists (select 1 from retail.transferencia_items ti join retail.variantes v on v.id = ti.variante_id
                         where ti.transferencia_id = t.id and v.producto_id = p_producto_id and v.color_codigo is not distinct from p_color_codigo)) then
      raise exception 'Ese traslado no lleva esta prenda desde esta tienda, se anuló o tiene más de 14 días. Elige otro o arma uno nuevo.' using hint = 'frescura_traslado_no_calza';
    end if;
  elsif p_transferencia_id is not null then
    raise exception 'Solo «La trasladé» lleva un traslado.' using hint = 'frescura_traslado_no_calza';
  end if;

  -- 4. El antecedente tiene que ser de ESTA prenda. Que sea o no la ÚLTIMA línea NO se pregunta aquí: lo dicen los índices
  --    únicos de la tabla al insertar (`una_respuesta`, `una_cabeza`), y es la misma respuesta que en una carrera. Preguntarlo
  --    dos veces era el mismo hecho en dos lugares que un día podían dejar de coincidir.
  if p_anterior_id is not null then
    select * into v_ant from retail.frescura_decisiones where id = p_anterior_id;
    if not found or v_ant.ubicacion_id <> p_ubicacion_id or v_ant.producto_id <> p_producto_id or v_ant.color_clave <> v_color_clave then
      raise exception 'Esa decisión anterior no es de esta prenda. Recarga la pantalla.' using hint = 'frescura_anterior_invalido';
    end if;
  end if;

  -- 5. La firma: el responsable del combo, no la cuenta.
  v_persona := retail.fn_actor_persona_id(true);
  select t.id into v_terminal from retail.fn_terminal_actual() t limit 1;

  -- 6. El insert. Si otra línea ya responde a ese antecedente (o la libreta ya tiene cabeza), la base lo dice con un único:
  --    PT409 `version_cambiada` con el nombre de quien anotó. Vale igual para el desfase de una pantalla abierta desde ayer que
  --    para dos personas en el mismo segundo (la segunda espera en el índice y choca aquí).
  begin
    insert into retail.frescura_decisiones
      (ubicacion_id, producto_id, color_codigo, accion, anterior_id, anterior_accion, transferencia_id, nota, plazo_dias, persona_id, terminal_id, token_cliente)
    values
      (p_ubicacion_id, p_producto_id, p_color_codigo, p_accion, p_anterior_id, v_ant.accion, p_transferencia_id, v_nota, p_plazo_dias, v_persona, v_terminal, p_token)
    returning id, creado_en into v_id, v_creado;
  exception
    when unique_violation then
      get stacked diagnostics v_c = constraint_name;
      if v_c in ('frescura_decisiones_una_respuesta', 'frescura_decisiones_una_cabeza') then
        raise exception '%', coalesce(retail.fn_frescura_aviso_version(p_ubicacion_id, p_producto_id, v_color_clave),
                                      'Otra persona acaba de anotar una decisión sobre esta prenda. Mírala antes de anotar la tuya.')
          using errcode = 'PT409', hint = 'version_cambiada';
      end if;
      raise;
    when foreign_key_violation then
      get stacked diagnostics v_c = constraint_name;
      if v_c = 'frescura_decisiones_misma_prenda' then
        raise exception 'Esa decisión anterior no es de esta prenda. Recarga la pantalla.' using hint = 'frescura_anterior_invalido';
      end if;
      raise;
  end;

  return jsonb_build_object('id', v_id, 'creado_en', v_creado, 'repetida', false);
end;
$fn$;

comment on function retail.anotar_decision_frescura(uuid, uuid, uuid, text, uuid, text, integer, uuid, text) is
  'Frescura del piso (ADR-0208, 4b): «Ya decidí». Agrega UN renglón al final de la libreta de una prenda (modelo+color) en una sede, firmado por el responsable del combo (fn_actor_persona_id(true)). Orden: permiso → marca (el mismo toque devuelve el mismo renglón, repetida=true) → hechos del momento (algo colgado, traslado real de los últimos 14 días, plazo 1-30) → firma → insert (PT409 version_cambiada si ya hay otra línea sobre ese antecedente). Devuelve {id, creado_en, repetida}.';

-- ---------------------------------------------------------------------------
-- 3. Anular (quitar lo anotado)
-- ---------------------------------------------------------------------------

create or replace function retail.anular_decision_frescura(p_token uuid, p_decision_id uuid, p_nota text default null)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_nota text := nullif(btrim(p_nota), '');
  v_d retail.frescura_decisiones%rowtype;
  v_prev retail.frescura_decisiones%rowtype;
  v_persona uuid;
  v_terminal uuid;
  v_id uuid;
  v_creado timestamptz;
  v_c text;
begin
  -- La sede y la acción se LEEN del renglón guardado, nunca las que mande el navegador.
  select * into v_d from retail.frescura_decisiones where id = p_decision_id;
  if not found then
    raise exception 'Esa decisión no existe. Recarga la pantalla.' using hint = 'frescura_decision_inexistente';
  end if;
  if not retail.fn_puede_decidir_frescura(v_d.ubicacion_id, v_d.accion) then
    if v_d.accion = 'rebaje' and retail.fn_puede_frescura(v_d.ubicacion_id) then
      raise exception 'La rebaja la decide el líder: solo él la quita.' using hint = 'frescura_rebaja_solo_lider';
    end if;
    raise exception 'Para quitar decisiones de esta sede hace falta el módulo «Frescura del piso» en tu rol y que sea una sede que operas.' using hint = 'frescura_sin_permiso';
  end if;
  if p_token is null then
    raise exception 'Falta la marca de este toque.' using hint = 'frescura_token_requerido';
  end if;

  -- La marca, antes de todo lo demás (igual que anotar).
  perform pg_advisory_xact_lock(hashtextextended('frescura_decision:' || p_token::text, 0));
  select * into v_prev from retail.frescura_decisiones where token_cliente = p_token;
  if found then
    if v_prev.accion = 'anulacion' and v_prev.anterior_id = p_decision_id and v_prev.nota is not distinct from v_nota then
      return jsonb_build_object('id', v_prev.id, 'creado_en', v_prev.creado_en, 'repetida', true);
    end if;
    raise exception 'Ese toque ya se guardó con otros datos: no se repitió. Vuelve a intentarlo.' using hint = 'frescura_token_reusado';
  end if;

  if v_nota is not null and char_length(v_nota) > 280 then
    raise exception 'La nota lleva hasta 280 letras.' using hint = 'frescura_nota_larga';
  end if;
  if v_d.accion = 'anulacion' then
    raise exception 'Eso ya está quitado.' using hint = 'frescura_no_anulable';
  end if;
  -- Si ya tiene otra línea encima, el índice único `una_respuesta` lo dice al insertar (PT409 version_cambiada).

  v_persona := retail.fn_actor_persona_id(true);
  select t.id into v_terminal from retail.fn_terminal_actual() t limit 1;

  begin
    insert into retail.frescura_decisiones
      (ubicacion_id, producto_id, color_codigo, accion, anterior_id, anterior_accion, nota, plazo_dias, persona_id, terminal_id, token_cliente)
    values
      (v_d.ubicacion_id, v_d.producto_id, v_d.color_codigo, 'anulacion', v_d.id, v_d.accion, v_nota, null, v_persona, v_terminal, p_token)
    returning id, creado_en into v_id, v_creado;
  exception
    when unique_violation then
      get stacked diagnostics v_c = constraint_name;
      if v_c = 'frescura_decisiones_una_respuesta' then
        raise exception '%', coalesce(retail.fn_frescura_aviso_version(v_d.ubicacion_id, v_d.producto_id, v_d.color_clave),
                                      'Otra persona acaba de anotar una decisión sobre esta prenda. Mírala antes de quitar lo anotado.')
          using errcode = 'PT409', hint = 'version_cambiada';
      end if;
      raise;
  end;

  return jsonb_build_object('id', v_id, 'creado_en', v_creado, 'repetida', false);
end;
$fn$;

comment on function retail.anular_decision_frescura(uuid, uuid, text) is
  'Frescura del piso (ADR-0208, 4b): «Quitar lo anotado» y el «Deshacer» de 10 segundos. Agrega un renglón anulacion que responde a la ÚLTIMA línea de la libreta (una decisión); no borra nada. El permiso se calcula con la sede y la acción del renglón guardado (quitar «La rebajé» es solo del líder). Devuelve {id, creado_en, repetida}.';

-- ---------------------------------------------------------------------------
-- 4. La lectura de una sede
-- ---------------------------------------------------------------------------

create or replace function retail.fn_frescura_decisiones(p_ubicacion_id uuid, p_dias integer default 120)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_ahora timestamptz := now();
  v_desde timestamptz;
  v_dec jsonb;
  v_tras jsonb;
begin
  if not retail.fn_puede_frescura(p_ubicacion_id) then
    raise exception 'Para ver lo que se decidió en esta sede hace falta el módulo «Frescura del piso» en tu rol y que sea una sede que operas.' using hint = 'frescura_sin_permiso';
  end if;
  if p_dias is null or p_dias not between 1 and 120 then
    raise exception 'La ventana va de 1 a 120 días.';
  end if;
  v_desde := v_ahora - make_interval(days => p_dias);

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id,
           'producto_id', s.producto_id,
           'color_codigo', s.color_codigo,
           'accion', s.accion,
           'anterior_id', s.anterior_id,
           'anterior_accion', s.anterior_accion,
           'transferencia_id', s.transferencia_id,
           'nota', s.nota,
           'plazo_dias', s.plazo_dias,
           'creado_en', s.creado_en,
           'persona', p.nombres || ' ' || p.apellidos,
           'traslado', case when s.accion = 'traslade' then (
             select jsonb_build_object(
                      'numero', t.numero, 'destino_id', t.ubicacion_destino_id, 'destino', ud.nombre,
                      'estado', t.estado, 'anulado', t.estado = 'anulada',
                      -- Cuándo ENTRÓ al stock de la tienda destino: el movimiento de la primera línea de esta prenda que se
                      -- recibió; si el traslado se cerró antes de llevar recepciones por línea, cuando se confirmó.
                      'recibido_en', coalesce(
                        (select min(m.created_at)
                           from retail.transferencia_recepciones r
                           join retail.movimientos m on m.id = r.movimiento_id
                           join retail.variantes v on v.id = r.variante_id
                          where r.transferencia_id = t.id and v.producto_id = s.producto_id and v.color_codigo is not distinct from s.color_codigo),
                        case when t.estado in ('completada', 'cerrada', 'recibido_con_diferencia') then t.confirmado_en end),
                      'unidades', (select coalesce(sum(ti.cantidad), 0)
                                     from retail.transferencia_items ti join retail.variantes v on v.id = ti.variante_id
                                    where ti.transferencia_id = t.id and v.producto_id = s.producto_id and v.color_codigo is not distinct from s.color_codigo))
               from retail.transferencias t join retail.ubicaciones ud on ud.id = t.ubicacion_destino_id
              where t.id = s.transferencia_id) end,
           -- «La rebajé»: lo que se vendió de la prenda en la sede desde ese día, con el motivo del descuento (null = sin
           -- descuento). Sin ventas anuladas. La web separa «liquidación» de «campaña»: contar una campaña como rebaja engañaría.
           'ventas', case when s.accion = 'rebaje' then (
             select coalesce(jsonb_agg(jsonb_build_array(v.created_at, vi.cantidad,
                                                         case when vi.descuento_unitario > 0 then coalesce(vi.motivo_descuento, 'otro') end)
                                       order by v.created_at), '[]'::jsonb)
               from retail.venta_items vi
               join retail.ventas v on v.id = vi.venta_id
               join retail.variantes va on va.id = vi.variante_id
              where v.ubicacion_id = s.ubicacion_id and v.estado = 'completada' and v.created_at >= s.creado_en
                and va.producto_id = s.producto_id and va.color_codigo is not distinct from s.color_codigo) end
         ) order by s.creado_en, s.id), '[]'::jsonb)
    into v_dec
    from retail.frescura_decisiones s
    left join public.personas p on p.id = s.persona_id
   where s.ubicacion_id = p_ubicacion_id
     and (s.creado_en >= v_desde
          -- La última línea de cada libreta, aunque sea vieja: la pantalla responde a ella (`anterior_id`).
          or not exists (select 1 from retail.frescura_decisiones r where r.anterior_id = s.id));

  -- Los traslados de los últimos 14 días que salen de la sede y no están anulados, con las prendas que llevan: lo que
  -- «La trasladé» ofrece elegir.
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', t.id, 'numero', t.numero, 'destino_id', t.ubicacion_destino_id, 'destino', ud.nombre,
           'estado', t.estado, 'creado_en', t.created_at,
           'prendas', (select coalesce(jsonb_agg(jsonb_build_object('producto_id', x.producto_id, 'color_codigo', x.color_codigo, 'unidades', x.u)), '[]'::jsonb)
                         from (select v.producto_id, v.color_codigo, sum(ti.cantidad) as u
                                 from retail.transferencia_items ti join retail.variantes v on v.id = ti.variante_id
                                where ti.transferencia_id = t.id
                                group by v.producto_id, v.color_codigo) x)
         ) order by t.created_at desc), '[]'::jsonb)
    into v_tras
    from retail.transferencias t
    join retail.ubicaciones ud on ud.id = t.ubicacion_destino_id
   where t.ubicacion_origen_id = p_ubicacion_id and t.estado <> 'anulada' and t.created_at >= v_ahora - interval '14 days';

  return jsonb_build_object('ahora', v_ahora, 'decisiones', v_dec, 'traslados_recientes', v_tras);
end;
$fn$;

comment on function retail.fn_frescura_decisiones(uuid, integer) is
  'Frescura del piso (ADR-0208, 4b): lo decidido en una sede — los renglones de los últimos p_dias (1-120) más la última línea de cada libreta aunque sea vieja, con quién firmó, el traslado enlazado (número, destino, cuándo entró) y, en «La rebajé», las ventas desde ese día con su motivo de descuento; y los traslados de los últimos 14 días que salen de la sede. No calcula si sigue vigente ni si sirvió: eso es de la web. Mismo candado que las lecturas del paso 4 (fn_puede_frescura).';

-- ---------------------------------------------------------------------------
-- 5. Permisos
-- ---------------------------------------------------------------------------

revoke all on function retail.fn_puede_frescura(uuid) from public, anon;
grant execute on function retail.fn_puede_frescura(uuid) to authenticated;
revoke all on function retail.fn_puede_decidir_frescura(uuid, text) from public, anon;
grant execute on function retail.fn_puede_decidir_frescura(uuid, text) to authenticated;
revoke all on function retail.fn_frescura_aviso_version(uuid, uuid, text) from public, anon, authenticated;
revoke all on function retail.anotar_decision_frescura(uuid, uuid, uuid, text, uuid, text, integer, uuid, text) from public, anon;
grant execute on function retail.anotar_decision_frescura(uuid, uuid, uuid, text, uuid, text, integer, uuid, text) to authenticated;
revoke all on function retail.anular_decision_frescura(uuid, uuid, text) from public, anon;
grant execute on function retail.anular_decision_frescura(uuid, uuid, text) to authenticated;
revoke all on function retail.fn_frescura_decisiones(uuid, integer) from public, anon;
grant execute on function retail.fn_frescura_decisiones(uuid, integer) to authenticated;

notify pgrst, 'reload schema';
