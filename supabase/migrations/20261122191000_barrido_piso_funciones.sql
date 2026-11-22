-- ============================================================================
-- 20261122191000_barrido_piso_funciones.sql — CAYLA V2 · ADR-0690 «El barrido del piso» · actividad 1 · PARTE 2 de 2
-- Pega ANTES 20261122190000_barrido_piso_tablas.sql (lo comprueba la guarda de abajo).
--
-- QUÉ HACE. Cinco funciones, ninguna mueve stock (mover llega en la actividad 5, al confirmar):
--   · `abrir_barrido_piso(sede)`: abre el barrido del piso de la sede, o devuelve el que ya está abierto. Quien llega a la
--     tienda a mitad del barrido toca lo mismo y se suma: nunca hay dos (índice barridos_piso_uno_abierto + candado por sede).
--   · `registrar_lecturas_barrido(barrido, lecturas)`: guarda un lote de lecturas (1 a 300) firmadas por el responsable del
--     combo. Cada lectura trae su `id`, generado en el aparato: la misma lectura reenviada tras un corte no se cuenta dos veces
--     (`on conflict do nothing`); el mismo id con OTRO contenido se rechaza sin guardar nada (`barrido_lectura_reusada`).
--     Devuelve lo que el equipo lleva de cada prenda del lote y el total, para que la pantalla no tenga que releer.
--   · `fn_barrido_piso_estado(sede)`: el barrido abierto de la sede con lo que lleva cada prenda y cada persona. Solo lectura.
--   · `fn_barrido_piso_lecturas(barrido)`: lo escaneado, una lectura por fila, con quién y a qué hora (actividad 3). Solo lectura.
--   · `anular_lecturas_barrido(barrido, ids, motivo)`: quita lecturas SIN borrarlas (actividad 3): una repetida o un tramo que no
--     debía contarse. La lectura queda tachada con quién la quitó, cuándo y por qué, y deja de sumar en todos los totales.
--
-- PUERTAS. Las de Existencias (ADR-0306: el barrido es una función de Existencias, no un módulo; ADR-0534 y Felipe
-- 2026-11-22: lo hace y lo confirma quien ve Existencias). Escribir pide `fn_ve_modulo('existencias')` y operar la sede;
-- leer, además, lo puede el líder. La firma es el responsable (`fn_actor_persona_id(true)`), ADR-0162.
--
-- POR QUÉ UNA LECTURA POR FILA Y NO UN TOTAL POR PRENDA. Conteo guarda «el total que el aparato cree» y la base lo reemplaza:
-- con dos personas en la misma prenda gana la última (A guarda 3, B que veía 0 escanea 1 y la prenda queda en 1). Aquí cada
-- escaneo es un hecho que se agrega y el total es la suma: el mismo camino que `movimientos` → `stock` (principio 4).
--
-- CÓMO SE PEGA EN PRODUCCIÓN. Solo `create or replace function` + `comment` + `revoke` + `grant`: no toma las tablas de auth
-- ni de storage, se pega en una sola parte a cualquier hora. Sin `select … into` dentro de textos entre comillas (ADR-0288).
--
-- SE ROMPE SI la pantalla deja de mandar el `id` de cada lectura (un reintento contaría doble) o si otra función inserta en
-- barrido_piso_lecturas sin firma.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

do $guarda$
begin
  if to_regclass('retail.barridos_piso') is null or to_regclass('retail.barrido_piso_lecturas') is null then
    raise exception 'Faltan las tablas del barrido: pega antes 20261122190000_barrido_piso_tablas.sql';
  end if;
  if to_regprocedure('retail.fn_actor_persona_id(boolean)') is null or to_regprocedure('retail.fn_ve_modulo(text)') is null
     or to_regprocedure('retail.fn_es_lider()') is null or to_regprocedure('retail.fn_puede_operar_ubicacion(uuid)') is null then
    raise exception 'Faltan los candados de la casa (fn_actor_persona_id, fn_ve_modulo, fn_es_lider, fn_puede_operar_ubicacion).';
  end if;
  if to_regprocedure('retail.fn_actividad_nombre(uuid)') is null then
    raise exception 'Falta fn_actividad_nombre: pega antes 20261002233000.';
  end if;
end;
$guarda$;

-- ---------------------------------------------------------------------------
-- 1. El estado del barrido abierto de una sede (solo lectura).
--    PROMETE: {separa, barrido}. `separa` dice si la sede tiene piso y almacén; `barrido` es null si no hay uno abierto, o
--             {id, abierto_en, abierto_por, unidades, lecturas, prendas, por_prenda: [{variante_id, cantidad}],
--              personas: [{persona_id, nombre, unidades, lecturas, ultima}]} con las personas de la que leyó último a la primera.
-- ---------------------------------------------------------------------------
create or replace function retail.fn_barrido_piso_estado(p_ubicacion_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_separa boolean;
  v_barrido barridos_piso%rowtype;
begin
  if not ((fn_es_lider() or fn_ve_modulo('existencias')) and fn_puede_operar_ubicacion(p_ubicacion_id)) then
    raise exception 'Para ver el barrido del piso hace falta ver Existencias en tu rol y que sea tu sede.'
      using errcode = '42501', hint = 'barrido_sin_permiso';
  end if;
  v_separa := exists (select 1 from sububicaciones s where s.ubicacion_id = p_ubicacion_id and s.tipo = 'piso_venta')
          and exists (select 1 from sububicaciones s where s.ubicacion_id = p_ubicacion_id and s.tipo = 'almacen_tienda');

  for v_barrido in select * from barridos_piso b where b.ubicacion_id = p_ubicacion_id and b.estado = 'abierto' loop
    return jsonb_build_object(
      'separa', v_separa,
      'barrido', jsonb_build_object(
        'id', v_barrido.id,
        'abierto_en', v_barrido.abierto_en,
        'abierto_por', fn_actividad_nombre(v_barrido.abierto_por),
        'unidades', coalesce((select sum(l.cantidad) from barrido_piso_lecturas l where l.barrido_id = v_barrido.id and l.anulada_en is null), 0),
        'lecturas', (select count(*) from barrido_piso_lecturas l where l.barrido_id = v_barrido.id and l.anulada_en is null),
        'prendas', (select count(distinct l.variante_id) from barrido_piso_lecturas l where l.barrido_id = v_barrido.id and l.anulada_en is null),
        'anuladas', (select count(*) from barrido_piso_lecturas l where l.barrido_id = v_barrido.id and l.anulada_en is not null),
        'por_prenda', coalesce((
          select jsonb_agg(jsonb_build_object('variante_id', x.variante_id, 'cantidad', x.cantidad) order by x.variante_id)
            from (select l.variante_id, sum(l.cantidad)::integer as cantidad
                    from barrido_piso_lecturas l where l.barrido_id = v_barrido.id and l.anulada_en is null group by l.variante_id) x), '[]'::jsonb),
        'personas', coalesce((
          select jsonb_agg(jsonb_build_object('persona_id', p.persona_id, 'nombre', fn_actividad_nombre(p.persona_id),
                                              'unidades', p.unidades, 'lecturas', p.lecturas, 'ultima', p.ultima)
                           order by p.ultima desc)
            from (select l.persona_id, sum(l.cantidad)::integer as unidades, count(*)::integer as lecturas, max(l.leida_en) as ultima
                    from barrido_piso_lecturas l where l.barrido_id = v_barrido.id and l.anulada_en is null group by l.persona_id) p), '[]'::jsonb)
      ));
  end loop;
  return jsonb_build_object('separa', v_separa, 'barrido', null);
end;
$fn$;

comment on function retail.fn_barrido_piso_estado(uuid) is
  'ADR-0690: el barrido del piso abierto de una sede, con lo que lleva cada prenda y cada persona: {separa, barrido|null}. Quien ve Existencias en su sede (o el líder). Solo lectura.';

-- ---------------------------------------------------------------------------
-- 2. Abrir el barrido (o sumarse al que está).
--    PROMETE: deja la sede con UN barrido abierto y devuelve {nuevo, estado} donde estado es fn_barrido_piso_estado.
--             Si ya había uno, no crea otro (nuevo = false) aunque dos personas toquen a la vez.
--    ASUME:   la sede separa piso y almacén.
-- ---------------------------------------------------------------------------
create or replace function retail.abrir_barrido_piso(p_ubicacion_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_actor uuid;
  v_nuevo boolean := false;
begin
  if p_ubicacion_id is null then
    raise exception 'Falta la sede.' using errcode = '22004', hint = 'barrido_sin_sede';
  end if;
  if not fn_ve_modulo('existencias') then
    raise exception 'El barrido del piso necesita el módulo Existencias en tu rol.' using errcode = '42501', hint = 'barrido_sin_modulo';
  end if;
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para mover mercadería en esa sede.' using errcode = '42501', hint = 'barrido_sin_tienda';
  end if;
  if not (exists (select 1 from sububicaciones s where s.ubicacion_id = p_ubicacion_id and s.tipo = 'piso_venta')
          and exists (select 1 from sububicaciones s where s.ubicacion_id = p_ubicacion_id and s.tipo = 'almacen_tienda')) then
    raise exception 'Esta sede todavía no separa piso y almacén: no hay piso que barrer.' using hint = 'barrido_tienda_sin_piso';
  end if;
  v_actor := fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación.' using hint = 'responsable_requerido';
  end if;

  -- Dos personas que tocan «Empezar» a la vez: la segunda espera aquí y, al soltarse, encuentra el barrido de la primera.
  perform pg_advisory_xact_lock(hashtextextended('barrido_piso_sede:' || p_ubicacion_id::text, 0));
  if not exists (select 1 from barridos_piso b where b.ubicacion_id = p_ubicacion_id and b.estado = 'abierto') then
    insert into barridos_piso (ubicacion_id, abierto_por) values (p_ubicacion_id, v_actor);
    v_nuevo := true;
  end if;
  return jsonb_build_object('nuevo', v_nuevo, 'estado', fn_barrido_piso_estado(p_ubicacion_id));
end;
$fn$;

comment on function retail.abrir_barrido_piso(uuid) is
  'ADR-0690: abre el barrido del piso de la sede o devuelve el que ya está abierto (quien llega se suma). Quien ve Existencias en su sede, firmado por el responsable. {nuevo, estado}.';

-- ---------------------------------------------------------------------------
-- 3. Guardar un lote de lecturas.
--    PROMETE: o entran todas las lecturas nuevas del lote, o ninguna y el error dice por qué. Una lectura que ya estaba
--             (mismo id, mismo contenido) no se cuenta otra vez. Devuelve {guardadas, ya_estaban, unidades,
--             por_prenda: [{variante_id, cantidad}], personas: [...]} con lo que el EQUIPO lleva de cada prenda del lote y lo de
--             cada persona (la misma forma que fn_barrido_piso_estado): quien escanea seguido no espera la próxima puesta al día
--             para ver su cifra.
--    ASUME:   p_lecturas = [{id, variante_id, cantidad?, codigo?, leida_en_aparato?}], de 1 a 300.
-- ---------------------------------------------------------------------------
create or replace function retail.registrar_lecturas_barrido(p_barrido_id uuid, p_lecturas jsonb)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_sede uuid;
  v_estado text;
  v_actor uuid;
  v_n integer;
  v_lista jsonb;
  v_guardadas integer;
  r record;
begin
  if p_barrido_id is null then
    raise exception 'Falta el barrido.' using errcode = '22004', hint = 'barrido_no_existe';
  end if;
  if p_lecturas is null or jsonb_typeof(p_lecturas) <> 'array' then
    raise exception 'Las lecturas llegaron mal formadas.' using errcode = '22023', hint = 'barrido_lecturas_invalidas';
  end if;
  v_n := jsonb_array_length(p_lecturas);
  if v_n < 1 or v_n > 300 then
    raise exception 'Se guardan de 1 a 300 lecturas por vez (llegaron %).', v_n using errcode = '22023', hint = 'barrido_lecturas_invalidas';
  end if;

  -- El barrido, con candado compartido: dos lotes entran a la vez, pero nadie lo cierra mientras uno se guarda.
  for r in select b.ubicacion_id, b.estado from barridos_piso b where b.id = p_barrido_id for share loop
    v_sede := r.ubicacion_id;
    v_estado := r.estado;
  end loop;
  if v_sede is null then
    raise exception 'Ese barrido no existe.' using hint = 'barrido_no_existe';
  end if;
  if not fn_ve_modulo('existencias') then
    raise exception 'El barrido del piso necesita el módulo Existencias en tu rol.' using errcode = '42501', hint = 'barrido_sin_modulo';
  end if;
  if not fn_puede_operar_ubicacion(v_sede) then
    raise exception 'No tienes permiso para mover mercadería en esa sede.' using errcode = '42501', hint = 'barrido_sin_tienda';
  end if;
  if v_estado <> 'abierto' then
    raise exception 'Este barrido ya se cerró: lo que escaneaste no se sumó. Abre el barrido de nuevo para seguir.'
      using hint = 'barrido_cerrado';
  end if;
  v_actor := fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación.' using hint = 'responsable_requerido';
  end if;

  -- La forma de cada lectura, antes de tocar nada.
  begin
    v_lista := (
      select jsonb_agg(jsonb_build_object(
               'id', (x ->> 'id')::uuid,
               'variante_id', (x ->> 'variante_id')::uuid,
               'cantidad', coalesce((x ->> 'cantidad')::integer, 1),
               'codigo', nullif(btrim(coalesce(x ->> 'codigo', '')), ''),
               'leida_en_aparato', (x ->> 'leida_en_aparato')::timestamptz))
        from jsonb_array_elements(p_lecturas) x);
  exception when others then
    raise exception 'Una lectura llegó mal formada.' using errcode = '22023', hint = 'barrido_lecturas_invalidas';
  end;
  if exists (select 1 from jsonb_array_elements(v_lista) x
              where x ->> 'id' is null or x ->> 'variante_id' is null
                 or (x ->> 'cantidad')::integer not between 1 and 500
                 or char_length(coalesce(x ->> 'codigo', '')) > 120) then
    raise exception 'Una lectura llegó sin prenda o con una cantidad fuera de 1 a 500.' using errcode = '22023', hint = 'barrido_lecturas_invalidas';
  end if;
  if (select count(distinct x ->> 'id') from jsonb_array_elements(v_lista) x) <> v_n then
    raise exception 'El lote trae la misma lectura dos veces.' using errcode = '22023', hint = 'barrido_lecturas_invalidas';
  end if;
  if exists (select 1 from jsonb_array_elements(v_lista) x
              where not exists (select 1 from variantes va where va.id = (x ->> 'variante_id')::uuid)) then
    raise exception 'Una de las prendas escaneadas no existe en el catálogo.' using hint = 'barrido_prenda_desconocida';
  end if;
  -- El mismo id con OTRO contenido es un error del aparato, no un reintento: no se guarda nada.
  if exists (select 1 from jsonb_array_elements(v_lista) x
               join barrido_piso_lecturas l on l.id = (x ->> 'id')::uuid
              where l.barrido_id <> p_barrido_id or l.variante_id <> (x ->> 'variante_id')::uuid
                 or l.cantidad <> (x ->> 'cantidad')::integer) then
    raise exception 'Una lectura ya se guardó con otros datos: no se guardó nada de este lote.' using hint = 'barrido_lectura_reusada';
  end if;

  with nuevas as (
    insert into barrido_piso_lecturas (id, barrido_id, variante_id, cantidad, codigo, persona_id, leida_en_aparato)
    select (x ->> 'id')::uuid, p_barrido_id, (x ->> 'variante_id')::uuid, (x ->> 'cantidad')::integer, x ->> 'codigo', v_actor,
           (x ->> 'leida_en_aparato')::timestamptz
      from jsonb_array_elements(v_lista) x
    on conflict (id) do nothing
    returning 1
  )
  select count(*) into v_guardadas from nuevas;

  return jsonb_build_object(
    'guardadas', v_guardadas,
    'ya_estaban', v_n - v_guardadas,
    'unidades', coalesce((select sum(l.cantidad) from barrido_piso_lecturas l where l.barrido_id = p_barrido_id and l.anulada_en is null), 0),
    'por_prenda', coalesce((
      select jsonb_agg(jsonb_build_object('variante_id', t.variante_id, 'cantidad', t.cantidad) order by t.variante_id)
        from (select l.variante_id, sum(l.cantidad)::integer as cantidad
                from barrido_piso_lecturas l
               where l.barrido_id = p_barrido_id and l.anulada_en is null
                 and l.variante_id in (select (x ->> 'variante_id')::uuid from jsonb_array_elements(v_lista) x)
               group by l.variante_id) t), '[]'::jsonb),
    'personas', coalesce((
      select jsonb_agg(jsonb_build_object('persona_id', p.persona_id, 'nombre', fn_actividad_nombre(p.persona_id),
                                          'unidades', p.unidades, 'lecturas', p.lecturas, 'ultima', p.ultima)
                       order by p.ultima desc)
        from (select l.persona_id, sum(l.cantidad)::integer as unidades, count(*)::integer as lecturas, max(l.leida_en) as ultima
                from barrido_piso_lecturas l where l.barrido_id = p_barrido_id and l.anulada_en is null group by l.persona_id) p), '[]'::jsonb));
end;
$fn$;

comment on function retail.registrar_lecturas_barrido(uuid, jsonb) is
  'ADR-0690: guarda un lote de 1 a 300 lecturas de un barrido abierto, firmadas por el responsable. Idempotente por el id de cada lectura (lo genera el aparato). Devuelve {guardadas, ya_estaban, unidades, por_prenda, personas} con lo que lleva el equipo y cada persona.';

-- ---------------------------------------------------------------------------
-- 4. Lo escaneado, una lectura por fila (actividad 3: «Ver lo escaneado»). Solo lectura.
--    PROMETE: {lecturas: [...], total, tope} con las lecturas del barrido (anuladas incluidas, tachadas), de la más reciente a la
--             más antigua por la hora en que se ESCANEARON (la del aparato si la trae; si no, la del servidor), hasta 5.000. Cada
--             una con quién la escaneó y, si se quitó, quién, cuándo y por qué. La pantalla las agrupa en tramos por persona.
-- ---------------------------------------------------------------------------
create or replace function retail.fn_barrido_piso_lecturas(p_barrido_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $fn$
declare
  c_tope constant integer := 5000;
  v_sede uuid;
begin
  v_sede := (select b.ubicacion_id from barridos_piso b where b.id = p_barrido_id);
  if v_sede is null then
    raise exception 'Ese barrido no existe.' using hint = 'barrido_no_existe';
  end if;
  if not ((fn_es_lider() or fn_ve_modulo('existencias')) and fn_puede_operar_ubicacion(v_sede)) then
    raise exception 'Para ver el barrido del piso hace falta ver Existencias en tu rol y que sea tu sede.'
      using errcode = '42501', hint = 'barrido_sin_permiso';
  end if;
  return jsonb_build_object(
    'total', (select count(*) from barrido_piso_lecturas l where l.barrido_id = p_barrido_id),
    'tope', c_tope,
    'lecturas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', x.id, 'variante_id', x.variante_id, 'cantidad', x.cantidad, 'codigo', x.codigo,
               'persona_id', x.persona_id, 'nombre', fn_actividad_nombre(x.persona_id),
               'escaneada_en', x.escaneada_en,
               'anulada_en', x.anulada_en, 'anulada_por', case when x.anulada_por is null then null else fn_actividad_nombre(x.anulada_por) end,
               'motivo', x.motivo_anulacion)
             order by x.escaneada_en desc, x.id)
        from (select l.*, coalesce(l.leida_en_aparato, l.leida_en) as escaneada_en
                from barrido_piso_lecturas l
               where l.barrido_id = p_barrido_id
               order by coalesce(l.leida_en_aparato, l.leida_en) desc, l.id
               limit c_tope) x), '[]'::jsonb));
end;
$fn$;

comment on function retail.fn_barrido_piso_lecturas(uuid) is
  'ADR-0690: las lecturas de un barrido (hasta 5.000, de la más reciente a la más antigua por la hora del escaneo), anuladas incluidas, con quién las escaneó y quién las quitó. Quien ve Existencias en la sede (o el líder). Solo lectura.';

-- ---------------------------------------------------------------------------
-- 5. Quitar lecturas (una repetida, o un tramo contado de más), SIN borrarlas.
--    PROMETE: o se anulan todas las lecturas pedidas que seguían contando, o ninguna. Las ya anuladas no se vuelven a anular
--             (quitar dos veces no resta dos veces). Devuelve {anuladas, ya_estaban, estado} con estado = fn_barrido_piso_estado.
--    ASUME:   p_ids son lecturas de ESTE barrido (1 a 2.000); el barrido está abierto; p_motivo es 'repetida' o 'tramo'.
-- ---------------------------------------------------------------------------
create or replace function retail.anular_lecturas_barrido(p_barrido_id uuid, p_ids uuid[], p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_sede uuid;
  v_estado text;
  v_actor uuid;
  v_n integer;
  v_anuladas integer;
  r record;
begin
  if p_barrido_id is null then
    raise exception 'Falta el barrido.' using errcode = '22004', hint = 'barrido_no_existe';
  end if;
  v_n := coalesce(cardinality(p_ids), 0);
  if v_n < 1 or v_n > 2000 or exists (select 1 from unnest(p_ids) i where i is null) then
    raise exception 'Se quitan de 1 a 2.000 lecturas por vez.' using errcode = '22023', hint = 'barrido_anular_invalido';
  end if;
  if p_motivo is null or p_motivo not in ('repetida', 'tramo') then
    raise exception 'Falta por qué se quitan.' using errcode = '22023', hint = 'barrido_anular_invalido';
  end if;
  -- El barrido en exclusiva: nadie lo cierra mientras se quita, y dos personas que quitan lo mismo van una tras otra.
  for r in select b.ubicacion_id, b.estado from barridos_piso b where b.id = p_barrido_id for update loop
    v_sede := r.ubicacion_id;
    v_estado := r.estado;
  end loop;
  if v_sede is null then
    raise exception 'Ese barrido no existe.' using hint = 'barrido_no_existe';
  end if;
  if not fn_ve_modulo('existencias') then
    raise exception 'El barrido del piso necesita el módulo Existencias en tu rol.' using errcode = '42501', hint = 'barrido_sin_modulo';
  end if;
  if not fn_puede_operar_ubicacion(v_sede) then
    raise exception 'No tienes permiso para mover mercadería en esa sede.' using errcode = '42501', hint = 'barrido_sin_tienda';
  end if;
  if v_estado <> 'abierto' then
    raise exception 'Este barrido ya se cerró: lo escaneado ya no se puede quitar.' using hint = 'barrido_cerrado';
  end if;
  v_actor := fn_actor_persona_id(true);
  if v_actor is null then
    raise exception 'Elige quién hace esta operación.' using hint = 'responsable_requerido';
  end if;
  if (select count(*) from barrido_piso_lecturas l where l.id = any (p_ids) and l.barrido_id = p_barrido_id)
     <> (select count(distinct i) from unnest(p_ids) i) then
    raise exception 'Alguna de esas lecturas no es de este barrido: no se quitó nada.' using hint = 'barrido_lectura_ajena';
  end if;

  with quitadas as (
    update barrido_piso_lecturas l
       set anulada_en = clock_timestamp(), anulada_por = v_actor, motivo_anulacion = p_motivo
     where l.id = any (p_ids) and l.barrido_id = p_barrido_id and l.anulada_en is null
    returning 1
  )
  select count(*) into v_anuladas from quitadas;

  return jsonb_build_object(
    'anuladas', v_anuladas,
    'ya_estaban', (select count(distinct i) from unnest(p_ids) i) - v_anuladas,
    'estado', fn_barrido_piso_estado(v_sede));
end;
$fn$;

comment on function retail.anular_lecturas_barrido(uuid, uuid[], text) is
  'ADR-0690: quita (anula, sin borrar) de 1 a 2.000 lecturas de un barrido abierto, firmado por el responsable; motivo repetida o tramo. Quitar dos veces no resta dos veces. Devuelve {anuladas, ya_estaban, estado}.';

revoke all on function retail.fn_barrido_piso_es_historia() from public, anon, authenticated;
revoke all on function retail.fn_barrido_piso_lectura_valida() from public, anon, authenticated;
revoke all on function retail.fn_barrido_piso_estado(uuid) from public, anon;
grant execute on function retail.fn_barrido_piso_estado(uuid) to authenticated;
revoke all on function retail.abrir_barrido_piso(uuid) from public, anon;
grant execute on function retail.abrir_barrido_piso(uuid) to authenticated;
revoke all on function retail.registrar_lecturas_barrido(uuid, jsonb) from public, anon;
grant execute on function retail.registrar_lecturas_barrido(uuid, jsonb) to authenticated;
revoke all on function retail.fn_barrido_piso_lecturas(uuid) from public, anon;
grant execute on function retail.fn_barrido_piso_lecturas(uuid) to authenticated;
revoke all on function retail.anular_lecturas_barrido(uuid, uuid[], text) from public, anon;
grant execute on function retail.anular_lecturas_barrido(uuid, uuid[], text) to authenticated;
revoke all on function retail.fn_barrido_piso_lectura_solo_anular() from public, anon, authenticated;

notify pgrst, 'reload schema';

reset lock_timeout;
