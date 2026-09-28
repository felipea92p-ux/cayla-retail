-- ============================================================================
-- 20260928235500_corregir_color_y_talla_de_variantes.sql — CAYLA V2 · ADR-0257 (D-136, D-137, D-138)
-- Corregir el color y la talla de una variante que ya existe, desde su ficha (Felipe, 2026-09-28)
--
-- EL PROBLEMA PRIMERO. BOD-0003 «Body Amir» nació «Sin color» y sus tres variantes ya tienen su carga inicial (8/5/4 en
-- Trujillo, ADR-0212). ADR-0243 D-133 dejó color, talla y código de solo lectura: «si está mal, desactívala y agrega la
-- correcta». Para BOD-0003 eso es desactivar 3, crear 3, ajustar −17 y cargar +17 que nunca pasaron (y ajustar es solo
-- del líder), volver a poner sus etiquetas y reimprimir 17 etiquetas, porque las pegadas apuntan a la variante
-- desactivada y en Vender salen «no encontrada». Y D-133 era un candado de PANTALLA: por la API cualquier cuenta que
-- edita el catálogo cambiaba color, talla o código de una variante sin dejar rastro («hueco 3»). Encima, el candado de
-- identidad dejó de tratar «Sin color» como un color el 17-sep: el índice `nulls not distinct` de ADR-0069 se fue con la
-- columna `talla` (20260917100500) y lo reemplazó un UNIQUE común, que deja pasar dos «Sin color S» de la misma prenda.
--
-- LAS DECISIONES (Felipe, 2026-09-28; ADR-0257).
--   D-136: el color y la talla se corrigen desde la ficha, en el MISMO «Guardar cambios». Es la misma prenda física mal
--          registrada: conserva su id, su stock y su historia (las 19 tablas que la citan lo hacen por id). Si ya salió
--          con una clienta —se vendió (`venta_items`), una clienta la separó (`separacion_items`) o se la llevó en un
--          cambio (`cambios.variante_nueva_id`: `registrar_cambio` no escribe `venta_items` para la prenda que sale)—,
--          solo un líder (`fn_es_lider()`, permiso de la CUENTA, no del responsable). Todo cambio queda en
--          `historial_producto_cambios` con quién lo hizo.
--   D-137: al corregir, `variantes.codigo` se recalcula con la identidad nueva (BOD-0003-S → BOD-0003-NEG-S) y el código
--          viejo SE QUEDA en `codigos_barras` apuntando a la MISMA variante: las etiquetas pegadas siguen sonando en
--          Vender, Conteo, Cambios y Traslados. Si el código nuevo ya lo tiene OTRA variante, se le agrega -2, -3…; lo
--          mismo al crear una variante (`fn_asignar_codigo_variante`).
--   D-138: si la corrección cae sobre una combinación (color, talla) que ya existe en la prenda —activa o no; «Sin color»
--          cuenta como un color— se rechaza con un aviso que nombra esa variante y qué hacer. No se unen variantes.
--
-- QUÉ PROMETE.
--   1. `variantes_identidad_unica` (producto, talla, color) NULLS NOT DISTINCT: dos «Sin color S» de la misma prenda ya
--      no pueden existir. Antes de crearlo, una guarda aborta nombrando los duplicados si los hubiera. Reemplaza al
--      UNIQUE `variantes_producto_talla_color_unico` (estrictamente más débil: dejaba pasar los vacíos repetidos), que se
--      borra. Ninguna función ni pantalla lo usa en un `on conflict` (revisado con grep y en `pg_proc`);
--      `apps/web/lib/error-escritura.ts` ya traduce el nombre nuevo.
--   2. Candado `variantes_identidad_solo_por_funcion`: una sesión de la API (`authenticated` o `anon`) no cambia el
--      color, la talla, el código ni la prenda de una variante con un update directo (hint `identidad_variante`). Las
--      funciones SECURITY DEFINER corren como su dueño y pasan: son el camino oficial (mismo patrón que
--      `variantes_costo_hasta_la_primera_compra`, 20260927190000).
--   3. `fn_codigo_variante_libre(codigo, variante)` (interna): el código pedido si ninguna OTRA variante lo usa (ni como
--      código ni en `codigos_barras`); si no, el primero libre de codigo-2, codigo-3…
--   4. `fn_asignar_codigo_variante` (parche con ancla) pasa su código por `fn_codigo_variante_libre`: una Negro S creada
--      después de corregir la Negro S original a Azul nace BOD-0003-NEG-S-2 en vez de chocar con un 23505.
--   5. `fn_corregir_identidad_variante(producto, variante, datos)`: la corrección entera, todo o nada. Primero mira SIN
--      candado si hay algo que corregir y, si no, sale sin bloquear nada (la ficha vieja manda color y talla de TODAS las
--      variantes). Si hay cambio: exige el permiso de catálogo, bloquea la prenda y la variante (en ese orden, el de
--      `catalogo_actualizar_producto`), vuelve a mirar con la fila bloqueada, aplica la regla de líder (D-136), valida
--      color y talla, rechaza el choque (D-138), actualiza color/talla/código (D-137), mueve fotos y temporada del color
--      si el color viejo se quedó sin variantes (el paso de la temporada queda en el historial de la prenda como
--      'temporada:<COLOR>', el mismo campo que usa asignar_temporadas), y sube la versión de la prenda (ADR-0193) para
--      que una ficha abierta con la versión vieja reciba PT409 en vez de revertir la corrección.
--   6. `catalogo_actualizar_producto` (parches con ancla): (a) una variante existente que trae `color_codigo` o
--      `talla_id` pasa por `fn_corregir_identidad_variante` antes de su update (las fichas viejas mandan el color y la
--      talla que ya tiene: no cambia nada y no pide nada); (b) una variante nueva con un color inactivo se rechaza con
--      palabras (antes: sin revisar); (c) al final, una prenda que quedaría con variantes ACTIVAS «Sin color» junto a
--      otras ACTIVAS con color se rechaza (hint `mezcla_sin_color`); (d) ANTES del `update productos`, si alguna variante
--      cambia de verdad de color o de talla, bloquea la prenda y esas variantes (solo esas, por id): ver CANDADOS.
--   7. `fn_registrar_cambio_producto` (parche con ancla) anota en el historial de la variante 'color', 'talla' (el valor
--      legible, no el uuid), 'codigo' (no la asignación inicial) y 'activo' (desactivar ya no pasa sin rastro).
--   8. `fn_variantes_estado(producto)`: para la ficha, por variante: stock total, apartado, stock por sede y si ya se
--      vendió (la misma regla que D-136: venta, separación o cambio). Lectura SECURITY DEFINER (el stock tiene RLS por
--      sede); '[]' a quien no edita el catálogo.
--   9. `fn_productos` (parche con ancla): la foto de una variante cae a la foto general de la prenda si su color no
--      tiene foto propia (lo mismo que ya hace `fotoDeVariante` en la web, apps/web/lib/producto-fotos-reglas.ts).
--
-- QUÉ NO HACE.
--   - No cambia ningún dato existente: no hay duplicados que limpiar (la guarda lo comprueba) y no corrige nada solo.
--   - No une variantes (D-138): si aparece un duplicado real con stock en las dos, se desactiva una y se ajusta su stock.
--   - No recalcula el `sku` (texto libre; hoy 1 variante de 189 lo tiene) ni reescribe copias de texto viejas
--     (`actividad.descripcion`, `proformas.items`): son la foto del momento, como una boleta.
--   - No cambia SUNAT: el nombre que se declara es `referencia · sku`, sin color ni talla.
--
-- LO QUE LA FICHA TIENE QUE SABER (la base no lo puede adivinar).
--   - El bucle de fotos de `catalogo_actualizar_producto` corre DESPUÉS del de variantes y escribe el color de cada foto
--     tal como llega en `p_fotos`. Si la ficha corrige Negro→Azul (todo el Negro) y manda sus fotos todavía marcadas
--     «Negro», la foto vuelve al Negro, un color que la prenda ya no tiene. La ficha manda en `p_fotos` el color NUEVO
--     (o `p_fotos` null si no tocó fotos). Lo mismo con `asignar_temporadas`: con la clave del color viejo, falla
--     (`color_no_es_de_la_prenda`).
--   - Dentro de `p_variantes`, las correcciones van ANTES que las variantes nuevas: si la misma prenda corrige Negro S→Azul
--     S y agrega una Negro S nueva, con la nueva primero choca con la Negro S que todavía no se corrigió.
--
-- CANDADOS (ADR-0257 T8; revisión del 2026-09-28, dos psql reales). Cambiar el color o la talla toca columnas de un
-- índice único, así que Postgres bloquea la fila de la variante en su modo más fuerte (FOR UPDATE), que choca con el
-- FOR KEY SHARE que toma TODA inserción que cita la variante: el movimiento de una venta, un traslado, un conteo, un
-- cierre de producción. Hasta ADR-0257 guardar la ficha solo cambiaba precio, costo y activo (FOR NO KEY UPDATE, que no
-- choca con nada de eso). Además, `update productos` toma con su disparador por sentencia la fila única de
-- `catalogo_version` hasta el final de la transacción. Si la variante se bloquea DESPUÉS de esa fila, un cierre de
-- producción que ya insertó el movimiento de la variante y después recalcula su costo (que también toma
-- `catalogo_version`) cierra un círculo con la ficha: 40P01 y el cierre se cae. Por eso el orden es uno solo:
--   la prenda (FOR UPDATE, el de la versión) → las variantes que DE VERDAD cambian, por id → `catalogo_version`.
-- Y la variante que no cambia no se bloquea nunca (la ficha vieja manda color y talla de todas).
-- Lo que este orden NO cubre: una operación que cita VARIAS de las variantes que se corrigen en el mismo guardado, en
-- otro orden que el id (una venta de M y S mientras se corrigen S y M). Esas operaciones toman el FOR KEY SHARE fila por
-- fila al insertar, sin orden; el círculo es posible en una ventana de milisegundos y una de las dos cae con 40P01 (sin
-- dejar nada a medias: la base deshace entera la que cae). Cerrarlo del todo pide que `fn_bloquear_en_orden` tome
-- `for key share` de las variantes por id en TODAS las operaciones; queda anotado en el ADR.
--
-- CÓMO (parches). Mismo patrón que 20260924160000 y 20260927190000: se parte de la definición VIVA (`pg_get_functiondef`)
-- y se reemplazan anclas que tienen que aparecer EXACTAMENTE una vez, o la migración aborta sin tocar nada. Re-pegable: si
-- la función ya lleva la marca 20260928235500, no se vuelve a parchar. Huellas md5(prosrc) antes del parche en la base
-- local (2026-09-28; las tres primeras son las que se midieron en producción ese día): catalogo_actualizar_producto
-- a66ff20a82f0e022b454cce0d04a1dad, fn_registrar_cambio_producto c4f2676e8f9dc11153b1c36e9c95b728, fn_productos
-- 8af6c222ec07356ed4912af92409c3de, fn_asignar_codigo_variante aea116da6a51f1e4fdf8abcab37856e7. Si producción tuviera
-- otro cuerpo, las anclas lo detectan y la migración aborta entera.
--
-- ORDEN PARA PRODUCCIÓN: primero ESTA migración, después la web. La web vieja con la base nueva sigue funcionando (manda
-- el color y la talla que ya tiene cada variante: no cambia nada); la web nueva con la base vieja no encuentra
-- `fn_variantes_estado` y su corrección se ignoraría en silencio.
-- PARA PEGAR EN PRODUCCIÓN: entera, sola, en el SQL Editor. Trae `set search_path` (no hace falta el prefijo) y
-- `lock_timeout` de 3 s. Sin `create policy` y sin borrar disparadores (ADR-0195: el candado se crea con
-- `create or replace trigger`). Lo PRIMERO que hace es tomar `variantes` en exclusiva: espera a que terminen las
-- operaciones de la tienda que ya la usan (3 s como máximo; si no, falla limpia sin aplicar nada y se vuelve a pegar) y
-- las que llegan después la esperan a ella (menos de un segundo). Nunca tumba una venta con 40P01. Se puede pegar dos
-- veces.
--
-- CÓMO SE DESHACE (a mano, en este orden; nada de esto borra datos):
--   drop trigger if exists variantes_identidad_solo_por_funcion on retail.variantes;   -- (drop trigger: pegar SOLO)
--   drop function if exists retail.fn_variante_identidad_solo_por_funcion();
--   drop function if exists retail.fn_corregir_identidad_variante(uuid, uuid, jsonb);
--   drop function if exists retail.fn_variantes_estado(uuid);
--   y quitar de catalogo_actualizar_producto, fn_registrar_cambio_producto, fn_asignar_codigo_variante y fn_productos
--   los bloques marcados «20260928235500» (fn_codigo_variante_libre se borra al final, cuando nadie la llame). El índice
--   `variantes_identidad_unica` conviene dejarlo: es el candado que faltaba.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ----------------------------------------------------------------------------
-- 0. El candado fuerte PRIMERO (revisión 2026-09-28)
-- ----------------------------------------------------------------------------
-- Sin esto, la guarda y el índice de abajo tomaban un candado débil sobre `variantes` (ShareLock) y el `alter table`
-- pedía después el exclusivo. Una operación de la tienda que ya había leído `variantes` y todavía tenía que escribirla
-- (guardar una ficha, recibir una compra que recalcula el costo) quedaba en círculo con la migración, y Postgres tumbaba
-- a la de la tienda con 40P01. Pedido al empezar, no hay círculo: la migración espera (3 s como máximo) o falla limpia.
-- Dentro de un DO a propósito: `lock table` suelto falla fuera de un bloque de transacción («LOCK TABLE can only be used
-- in transaction blocks»: psql sin -1, o un aplicador que no abre `begin`). Desde plpgsql vale siempre, y dentro de la
-- transacción de la migración (SQL Editor, psql -1) el candado dura igual hasta el final.
do $$
begin
  lock table retail.variantes in access exclusive mode;
end;
$$;

-- ----------------------------------------------------------------------------
-- 1. La identidad de una variante: (prenda, talla, color), con «Sin color» y «sin talla» contando como un valor más
-- ----------------------------------------------------------------------------
-- Guarda: si ya hubiera dos variantes con la misma identidad, el índice no se podría crear. Mejor abortar nombrándolas
-- (con su código) que con un 23505 anónimo. `group by` junta los vacíos, igual que hará el índice.
do $$
declare
  v_repetidas text;
begin
  select string_agg(format('%s [%s]', coalesce(p.codigo, p.referencia), d.codigos), '; ')
    into v_repetidas
    from (select producto_id, string_agg(coalesce(codigo, id::text), ', ' order by codigo) as codigos
            from retail.variantes
           group by producto_id, talla_id, color_codigo
          having count(*) > 1) d
    join retail.productos p on p.id = d.producto_id;
  if v_repetidas is not null then
    raise exception '20260928235500: hay variantes repetidas (misma prenda, talla y color) y el candado de identidad no se puede crear: %. Desactiva y ajusta una de cada par, bórrala si no tiene historia, y vuelve a pegar.', v_repetidas;
  end if;
end;
$$;

create unique index if not exists variantes_identidad_unica
  on retail.variantes (producto_id, talla_id, color_codigo) nulls not distinct;

-- Si ya existía un índice con ese nombre pero con otra forma (el de ADR-0069 se borró con la columna `talla`, pero por
-- si acaso), `if not exists` lo habría dejado pasar callado.
do $$
begin
  if (select pg_get_indexdef('retail.variantes_identidad_unica'::regclass))
       <> 'CREATE UNIQUE INDEX variantes_identidad_unica ON retail.variantes USING btree (producto_id, talla_id, color_codigo) NULLS NOT DISTINCT' then
    raise exception '20260928235500: retail.variantes_identidad_unica existe con otra forma: %. Revisar antes de pegar.',
      pg_get_indexdef('retail.variantes_identidad_unica'::regclass);
  end if;
end;
$$;

comment on index retail.variantes_identidad_unica is
  'ADR-0257 (D-138) / ADR-0069: una variante por (prenda, talla, color). NULLS NOT DISTINCT: «Sin color» y «sin talla» cuentan como un valor más, así que dos «Sin color S» de la misma prenda chocan. Activa o no: una combinación desactivada se reactiva, no se repite.';

-- El UNIQUE anterior es estrictamente más débil (dos vacíos no chocaban): sobra.
alter table retail.variantes drop constraint if exists variantes_producto_talla_color_unico;

-- ----------------------------------------------------------------------------
-- 2. El candado: color, talla, código y prenda de una variante no se cambian con un update directo por la API
-- ----------------------------------------------------------------------------
-- SECURITY INVOKER a propósito: `current_user` tiene que ser quien escribe. Por la API es `authenticated` (o `anon`);
-- dentro de `fn_corregir_identidad_variante` y de `fn_asignar_codigo_variante` (SECURITY DEFINER) es el dueño, y pasan.
create or replace function retail.fn_variante_identidad_solo_por_funcion()
returns trigger
language plpgsql
set search_path to 'retail', 'public', 'extensions'
as $$
begin
  if current_user in ('authenticated', 'anon')
     and (new.color_codigo is distinct from old.color_codigo
          or new.talla_id is distinct from old.talla_id
          or new.codigo is distinct from old.codigo
          or new.producto_id is distinct from old.producto_id) then
    raise exception 'El color, la talla y el código de una variante se corrigen desde su ficha, no directo.'
      using errcode = '42501', hint = 'identidad_variante';
  end if;
  return new;
end;
$$;

comment on function retail.fn_variante_identidad_solo_por_funcion() is
  'ADR-0257: disparador de variantes. Una sesión de la API no cambia color, talla, código ni prenda de una variante con un update directo (hint identidad_variante); el camino es fn_corregir_identidad_variante (desde la ficha).';

-- `create or replace trigger`, nunca borrar y volver a crear: en el SQL Editor de producción borrar un disparador (aunque
-- no exista) toma en exclusiva las tablas de auth y storage hasta el final y puede chocar con el Asesor de seguridad
-- (40P01; CLAUDE.md, «Políticas y deadlocks», ADR-0195).
create or replace trigger variantes_identidad_solo_por_funcion
  before update of color_codigo, talla_id, codigo, producto_id on retail.variantes
  for each row execute function retail.fn_variante_identidad_solo_por_funcion();

-- ----------------------------------------------------------------------------
-- 3. Un código libre (D-137)
-- ----------------------------------------------------------------------------
-- Libre = ninguna OTRA variante lo tiene como código ni en `codigos_barras` (el código viejo de una variante corregida
-- sigue en `codigos_barras`: está pegado en una percha). La misma variante sí puede volver a un código que ya fue suyo.
create or replace function retail.fn_codigo_variante_libre(p_codigo text, p_variante_id uuid)
returns text
language plpgsql
stable
security definer
set search_path to 'retail', 'public', 'extensions'
as $$
declare
  v_candidato text := p_codigo;
  v_n integer := 1;
begin
  if p_codigo is null then
    return null;
  end if;
  loop
    exit when not exists (select 1 from retail.variantes v
                           where v.codigo = v_candidato and v.id is distinct from p_variante_id)
          and not exists (select 1 from retail.codigos_barras cb
                           where cb.codigo = v_candidato and cb.variante_id is distinct from p_variante_id);
    v_n := v_n + 1;
    v_candidato := p_codigo || '-' || v_n;
  end loop;
  return v_candidato;
end;
$$;
revoke all on function retail.fn_codigo_variante_libre(text, uuid) from public, anon, authenticated;

comment on function retail.fn_codigo_variante_libre(text, uuid) is
  'ADR-0257 (D-137), interna: el código pedido si ninguna OTRA variante lo usa (variantes.codigo o codigos_barras); si no, codigo-2, codigo-3… el primero libre.';

-- ----------------------------------------------------------------------------
-- Ayudante de esta migración (nombre propio: los pg_temp de otras migraciones viven en la misma sesión al migrar en
-- local). Parte de la definición VIVA, exige cada ancla EXACTAMENTE una vez y no hace nada si ya lleva la marca.
-- ----------------------------------------------------------------------------
create or replace function pg_temp.parchar_235500(p_firma text, p_anclas text[], p_nuevos text[], p_marca text)
returns void
language plpgsql
as $$
declare
  v_def text;
  v_veces integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_marca in v_def) > 0 then
    raise notice '20260928235500: % ya tenía el parche (se volvió a pegar)', p_firma;
    return;
  end if;
  for i in 1 .. array_length(p_anclas, 1) loop
    v_veces := (length(v_def) - length(replace(v_def, p_anclas[i], ''))) / length(p_anclas[i]);
    if v_veces <> 1 then
      raise exception '20260928235500: % no tiene el ancla % esperada (aparece % veces). Revisar su definición viva antes de pegar.',
        p_firma, i, v_veces;
    end if;
    v_def := replace(v_def, p_anclas[i], p_nuevos[i]);
  end loop;
  execute v_def;
  raise notice '20260928235500: % parchada', p_firma;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. fn_asignar_codigo_variante: el código de una variante nueva también pasa por «libre» (D-137)
-- ----------------------------------------------------------------------------
do $$
declare
  v_ancla constant text := E'  update variantes set codigo = v_codigo where id = p_variante_id;\n';
begin
  perform pg_temp.parchar_235500(
    'retail.fn_asignar_codigo_variante(uuid)',
    array[v_ancla],
    array[
      E'  -- 20260928235500 (D-137): si otra variante ya usa este código (p. ej. el viejo de una Negro S corregida a Azul,\n'
      '  -- que sigue pegado en su percha), la nueva nace con -2, -3… en vez de chocar.\n'
      '  v_codigo := retail.fn_codigo_variante_libre(v_codigo, p_variante_id);\n'
      || v_ancla],
    '20260928235500');
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. La corrección (D-136, D-137, D-138): todo o nada, dentro del «Guardar cambios» de la ficha
-- ----------------------------------------------------------------------------
create or replace function retail.fn_corregir_identidad_variante(p_producto_id uuid, p_variante_id uuid, p_datos jsonb)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_prod record;
  v_var record;
  v_otra record;
  v_pide_color boolean := coalesce(p_datos ? 'color_codigo', false);
  v_pide_talla boolean := coalesce(p_datos ? 'talla_id', false);
  -- Qué se pide. Una clave AUSENTE = ese eje no cambia; '' o null = «Sin color» / «sin talla».
  v_color_pedido text := nullif(btrim(coalesce(p_datos ->> 'color_codigo', '')), '');
  v_talla_pedida uuid := nullif(btrim(coalesce(p_datos ->> 'talla_id', '')), '')::uuid;
  v_color_nuevo text;
  v_talla_nueva uuid;
  v_cambia_color boolean;
  v_codigo_nuevo text;
  v_temporada text;
  v_actor uuid;
begin
  -- 1. ¿Cambia algo? Se mira SIN candado. La ficha vieja manda el color y la talla de TODAS sus variantes: si no
  --    cambian, se sale aquí sin bloquear nada (un FOR UPDATE de la variante choca con el FOR KEY SHARE de cualquier
  --    venta, traslado o conteo que la cite, y antes lo tomaba cada guardado). Mirar sin candado es seguro: lo protege la
  --    versión de la prenda (ADR-0193), que catalogo_actualizar_producto ya comprobó con la prenda bloqueada, y toda
  --    corrección pasa por el candado de la prenda. Si la variante no aparece o es de otra prenda, se sigue al paso 2,
  --    que lo dice con palabras.
  select v.producto_id, v.color_codigo, v.talla_id into v_var
    from retail.variantes v where v.id = p_variante_id;
  if found and v_var.producto_id = p_producto_id
     and (not v_pide_color or v_color_pedido is not distinct from v_var.color_codigo)
     and (not v_pide_talla or v_talla_pedida is not distinct from v_var.talla_id) then
    return;
  end if;

  -- Permisos: se le preguntan a la CUENTA (ADR-0161), no al responsable que firma. Antes de bloquear nada: quien no
  -- edita el catálogo no llega a poner un candado.
  if not retail.fn_puede_editar_catalogo() then
    raise exception 'No tienes permiso para corregir el color o la talla de una prenda.'
      using errcode = '42501', hint = 'catalogo_sin_permiso';
  end if;

  -- 2. Hay algo que corregir: candados en el orden de catalogo_actualizar_producto (T8): primero la prenda, después la
  --    variante; desde la ficha, los dos ya están tomados desde antes de catalogo_version y aquí no se espera nada. Dos
  --    correcciones de la misma prenda a la vez se ponen en fila y la segunda ve lo que dejó la primera: por eso se
  --    vuelve a leer la variante, ya bloqueada.
  select p.id, p.codigo, p.categoria_id into v_prod
    from retail.productos p where p.id = p_producto_id for update;
  if not found then
    raise exception 'Esa prenda ya no existe. Recarga la pantalla.' using hint = 'producto_inexistente';
  end if;
  select v.id, v.producto_id, v.color_codigo, v.talla_id, v.codigo into v_var
    from retail.variantes v where v.id = p_variante_id for update;
  if not found or v_var.producto_id <> p_producto_id then
    raise exception 'Esa variante no es de esta prenda. Recarga la pantalla.' using hint = 'variante_de_otra_prenda';
  end if;
  v_color_nuevo := case when v_pide_color then v_color_pedido else v_var.color_codigo end;
  v_talla_nueva := case when v_pide_talla then v_talla_pedida else v_var.talla_id end;
  if v_color_nuevo is not distinct from v_var.color_codigo and v_talla_nueva is not distinct from v_var.talla_id then
    return;  -- otra corrección ya la dejó así mientras se esperaba el candado
  end if;
  v_cambia_color := v_color_nuevo is distinct from v_var.color_codigo;

  -- 3. D-136: una variante que ya salió con una clienta tiene historia con esa identidad; corregirla cambia cómo se lee
  --    esa historia (el análisis diría «se vendieron N Azul»). Por eso, solo un líder. Salió = una línea de venta, una
  --    separación con abonos o la prenda que se llevó en un cambio (`registrar_cambio` escribe `cambios` y el
  --    movimiento, no `venta_items`). Se mira con la variante bloqueada: ninguna de esas filas nuevas puede entrar
  --    mientras tanto (su inserción pide FOR KEY SHARE de la variante). Un apartado sin dinero no cuenta (T7).
  if (exists (select 1 from retail.venta_items vi where vi.variante_id = p_variante_id)
      or exists (select 1 from retail.separacion_items si where si.variante_id = p_variante_id)
      or exists (select 1 from retail.cambios c where c.variante_nueva_id = p_variante_id))
     and not retail.fn_es_lider() then
    -- La frase es la misma que dice la ficha (variantes-ficha-reglas.ts, bloqueoPorVenta): un cambio también es «se vendió».
    raise exception 'La variante % ya se vendió (o una clienta la apartó): solo un líder puede corregir su color o su talla.',
      coalesce(v_var.codigo, p_variante_id::text)
      using errcode = '42501', hint = 'correccion_solo_lider';
  end if;

  -- 4. Lo nuevo tiene que valer: el color, activo en el vocabulario; la talla, habilitada en la categoría de la prenda
  --    (la categoría ya es la nueva si la ficha la cambió en este mismo guardado). Solo el eje que cambia.
  if v_cambia_color and v_color_nuevo is not null
     and not exists (select 1 from retail.colores c where c.codigo = v_color_nuevo and c.activo) then
    raise exception 'El color % no existe o ya no está activo en el vocabulario. Elige otro.', v_color_nuevo
      using hint = 'color_inactivo';
  end if;
  if v_talla_nueva is distinct from v_var.talla_id and v_talla_nueva is not null
     and not exists (select 1 from retail.categoria_tallas ct
                      where ct.categoria_id = v_prod.categoria_id and ct.talla_id = v_talla_nueva) then
    raise exception 'Esa talla no está habilitada para la categoría de esta prenda.' using hint = 'talla_no_habilitada';
  end if;

  -- 5. D-138: si esa combinación ya existe en la prenda (activa o no), no se unen: se avisa cuál es y qué hacer.
  --    El índice variantes_identidad_unica lo frenaría igual; esto lo dice con palabras.
  select v.id, v.codigo, v.activo,
         coalesce(c.nombre, 'Sin color') as color_nombre,
         coalesce(t.valor, 'sin talla') as talla_valor
    into v_otra
    from retail.variantes v
    left join retail.colores c on c.codigo = v.color_codigo
    left join retail.tallas t on t.id = v.talla_id
   where v.producto_id = p_producto_id
     and v.id <> p_variante_id
     and v.color_codigo is not distinct from v_color_nuevo
     and v.talla_id is not distinct from v_talla_nueva
   limit 1;
  if found then
    if v_otra.activo then
      -- Primero las unidades, después desactivar: desactivar no las saca del inventario (misma frase que la ficha,
      -- textoChoque en apps/web/lib/variantes-ficha-reglas.ts).
      raise exception 'Ya existe % % en esta prenda (%). Elige otra combinación; si de verdad son la misma prenda, pasa su stock a esa con un ajuste y después desactiva esta.',
        v_otra.color_nombre, v_otra.talla_valor, coalesce(v_otra.codigo, 'sin código')
        using hint = 'variante_ya_existe', detail = v_otra.id::text;
    else
      raise exception 'Ya existe % % en esta prenda (%), pero está desactivada: reactívala en vez de corregir esta.',
        v_otra.color_nombre, v_otra.talla_valor, coalesce(v_otra.codigo, 'sin código')
        using hint = 'variante_ya_existe', detail = v_otra.id::text;
    end if;
  end if;

  -- 6. D-137: el código de la identidad nueva, con la misma fórmula que fn_asignar_codigo_variante
  --    (base || ['-' || color] || '-' || talla), libre de choques. El viejo se queda en codigos_barras apuntando a ESTA
  --    variante: las etiquetas ya pegadas siguen sonando.
  v_codigo_nuevo := retail.fn_codigo_variante_libre(
    coalesce(v_prod.codigo, retail.fn_asignar_codigo_producto(p_producto_id))
      || case when v_color_nuevo is null then '' else '-' || v_color_nuevo end
      || '-' || retail.fn_token_talla((select t.valor from retail.tallas t where t.id = v_talla_nueva)),
    p_variante_id);
  if v_var.codigo is not null and v_codigo_nuevo is distinct from v_var.codigo then
    insert into retail.codigos_barras (codigo, variante_id, origen)
      values (v_var.codigo, p_variante_id, 'propio')
      on conflict (codigo) do nothing;
  end if;

  -- Un solo update: el disparador del historial anota 'color', 'talla' y 'codigo' con quien firma.
  update retail.variantes
     set color_codigo = v_color_nuevo,
         talla_id = v_talla_nueva,
         codigo = v_codigo_nuevo
   where id = p_variante_id;

  insert into retail.codigos_barras (codigo, variante_id, origen)
    values (v_codigo_nuevo, p_variante_id, 'propio')
    on conflict (codigo) do nothing;

  -- 7. Fotos (ADR-0228) y temporada por color (ADR-0246) siguen al color, pero solo si el color viejo se quedó sin
  --    ninguna variante en la prenda (activa o no): corregir UNA Negro S a Azul mientras queda una Negro M no se lleva
  --    las fotos del Negro. Las fotos generales (sin color) no se mueven nunca.
  if v_cambia_color and v_var.color_codigo is not null
     and not exists (select 1 from retail.variantes v
                      where v.producto_id = p_producto_id and v.color_codigo = v_var.color_codigo) then
    -- Al color nuevo; si la corrección fue a «Sin color», quedan como fotos generales.
    update retail.producto_fotos
       set color_codigo = v_color_nuevo
     where producto_id = p_producto_id and color_codigo = v_var.color_codigo;

    -- La temporada del color viejo pasa al nuevo si el nuevo no tiene la suya; si la tiene, manda la del nuevo y la del
    -- viejo se borra (un color sin variantes no puede tener temporada, y «Sin color» no puede tener). Va DESPUÉS del
    -- update de la variante: `producto_color_temporadas_valida` exige una variante del color nuevo. Queda en el historial
    -- de la prenda con el mismo campo que usa asignar_temporadas ('temporada:<COLOR>').
    select pct.temporada into v_temporada
      from retail.producto_color_temporadas pct
     where pct.producto_id = p_producto_id and pct.color_codigo = v_var.color_codigo;
    if found then
      v_actor := retail.fn_actor_persona_id(true);
      if v_color_nuevo is not null
         and not exists (select 1 from retail.producto_color_temporadas pct
                          where pct.producto_id = p_producto_id and pct.color_codigo = v_color_nuevo) then
        update retail.producto_color_temporadas
           set color_codigo = v_color_nuevo
         where producto_id = p_producto_id and color_codigo = v_var.color_codigo;
        insert into retail.historial_producto_cambios (entidad, entidad_id, campo, valor_anterior, valor_nuevo, usuario_id)
        values ('producto', p_producto_id, 'temporada:' || v_color_nuevo, null, v_temporada, v_actor);
      else
        delete from retail.producto_color_temporadas
         where producto_id = p_producto_id and color_codigo = v_var.color_codigo;
      end if;
      insert into retail.historial_producto_cambios (entidad, entidad_id, campo, valor_anterior, valor_nuevo, usuario_id)
      values ('producto', p_producto_id, 'temporada:' || v_var.color_codigo, v_temporada, null, v_actor);
    end if;
  end if;

  -- 8. ADR-0193: las variantes no tienen versión propia; la corrección sube la de la prenda. `productos_version_bu`
  --    (fn_subir_version) pone old.version + 1 en CUALQUIER update de la fila, así que basta un update inocuo. Una ficha
  --    abierta antes recibe PT409 al guardar, en vez de devolver el color viejo.
  update retail.productos set version = version where id = p_producto_id;
end;
$$;
revoke all on function retail.fn_corregir_identidad_variante(uuid, uuid, jsonb) from public, anon;
grant execute on function retail.fn_corregir_identidad_variante(uuid, uuid, jsonb) to authenticated;

comment on function retail.fn_corregir_identidad_variante(uuid, uuid, jsonb) is
  'ADR-0257 (D-136/137/138): corrige el color y/o la talla de una variante existente (p_datos: color_codigo, talla_id; clave ausente = no cambia; '''' o null = sin color / sin talla). Conserva id, stock e historia; recalcula el código y deja el viejo en codigos_barras; mueve fotos y temporada del color si el viejo se quedó sin variantes; sube la versión de la prenda. Vendida, separada o entregada en un cambio: solo líder (correccion_solo_lider). Choque: variante_ya_existe. Sin cambios: no hace nada ni bloquea nada (se mira sin candado); con cambios bloquea prenda → variante (T8).';

-- ----------------------------------------------------------------------------
-- 6. catalogo_actualizar_producto: corrige en el mismo guardado, revisa el color de las nuevas y no deja la mezcla
-- ----------------------------------------------------------------------------
do $$
declare
  v_ancla_d constant text := E'  update productos\n    set categoria_id = p_categoria_id,\n';
  v_ancla_a constant text := E'    if v_id is not null then\n      if v_ve_costo then\n';
  v_ancla_b constant text := E'      insert into variantes (producto_id, color_codigo, talla_id, sku, precio, costo)\n';
  v_ancla_c constant text := E'  -- ADR-0193: la versión nueva (el update de arriba la subió), para un segundo guardado sin recargar.\n';
begin
  perform pg_temp.parchar_235500(
    'retail.catalogo_actualizar_producto(uuid,text,text,jsonb,uuid,text,integer,text,boolean,jsonb,uuid,uuid,uuid,uuid,boolean,integer)',
    array[v_ancla_d, v_ancla_a, v_ancla_b, v_ancla_c],
    array[
      -- (d) Antes del update de la prenda: los candados de las correcciones, en el orden de T8.
      E'  -- 20260928235500 (ADR-0257, T8): los candados de una corrección van ANTES de este update, que toma la fila única\n'
      '  -- de catalogo_version (disparador por sentencia) hasta el final. Si la variante se bloqueara después, un cierre de\n'
      '  -- producción o una recepción que ya insertó su movimiento (FOR KEY SHARE de la variante) y después recalcula su\n'
      '  -- costo (catalogo_version) cerraría un círculo con esta ficha: 40P01. Orden: la prenda → las variantes que DE\n'
      '  -- VERDAD cambian de color o de talla, por id → catalogo_version. Las que no cambian no se bloquean (la ficha vieja\n'
      '  -- manda el color y la talla de todas). La misma comparación que fn_corregir_identidad_variante ('''' = sin color).\n'
      '  declare\n'
      '    v_corregidas uuid[];\n'
      '  begin\n'
      '    select array_agg(v.id order by v.id) into v_corregidas\n'
      '      from jsonb_array_elements(coalesce(p_variantes, ''[]''::jsonb)) e\n'
      '      join variantes v on v.id = nullif(e ->> ''id'', '''')::uuid and v.producto_id = p_producto_id\n'
      '     where (e ? ''color_codigo'' and nullif(btrim(coalesce(e ->> ''color_codigo'', '''')), '''') is distinct from v.color_codigo)\n'
      '        or (e ? ''talla_id'' and nullif(btrim(coalesce(e ->> ''talla_id'', '''')), '''')::uuid is distinct from v.talla_id);\n'
      '    if v_corregidas is not null then\n'
      '      perform 1 from productos where id = p_producto_id for update;\n'
      '      perform 1 from variantes where id = any(v_corregidas) order by id for update;\n'
      '    end if;\n'
      '  end;\n\n'
      || v_ancla_d,
      -- (a) Antes del update de una variante existente.
      E'    if v_id is not null then\n'
      '      -- 20260928235500 (ADR-0257, D-136): si la ficha manda color o talla, pasa por la corrección (todo o nada con\n'
      '      -- este guardado). Una ficha vieja manda los que ya tiene: no cambia nada ni pide permisos de más.\n'
      '      if v_variante ? ''color_codigo'' or v_variante ? ''talla_id'' then\n'
      '        perform retail.fn_corregir_identidad_variante(p_producto_id, v_id, v_variante);\n'
      '      end if;\n'
      '      if v_ve_costo then\n',
      -- (b) Antes de insertar una variante nueva.
      E'      -- 20260928235500 (ADR-0257): el color de una variante nueva tiene que estar activo, como en el alta.\n'
      '      if nullif(v_variante->>''color_codigo'', '''') is not null and not exists (\n'
      '        select 1 from colores where codigo = nullif(v_variante->>''color_codigo'', '''') and activo\n'
      '      ) then\n'
      '        raise exception ''El color % no existe o ya no está activo en el vocabulario. Elige otro.'', v_variante->>''color_codigo''\n'
      '          using hint = ''color_inactivo'';\n'
      '      end if;\n'
      || v_ancla_b,
      -- (c) Antes del return final.
      E'  -- 20260928235500 (ADR-0257): una prenda es «Sin color» o tiene colores, no las dos cosas a la vez (una «Sin color S»\n'
      '  -- junto a una «Negro S» son la misma talla vendida en dos filas). Las desactivadas no cuentan.\n'
      '  if exists (select 1 from variantes where producto_id = p_producto_id and activo and color_codigo is null)\n'
      '     and exists (select 1 from variantes where producto_id = p_producto_id and activo and color_codigo is not null) then\n'
      '    raise exception ''Esta prenda quedaría con variantes «Sin color» junto a otras con color. Ponle color a las que no lo tienen o desactívalas.''\n'
      '      using hint = ''mezcla_sin_color'';\n'
      '  end if;\n\n'
      || v_ancla_c],
    '20260928235500');
end;
$$;

-- ----------------------------------------------------------------------------
-- 7. fn_registrar_cambio_producto: color, talla, código y activo de una variante quedan en su historial
-- ----------------------------------------------------------------------------
do $$
declare
  v_ancla constant text := E'        old.costo::text, new.costo::text, v_usuario_id);\n    end if;\n';
begin
  perform pg_temp.parchar_235500(
    'retail.fn_registrar_cambio_producto()',
    array[v_ancla],
    array[
      v_ancla ||
      E'    -- 20260928235500 (ADR-0257, D-136): la identidad corregida y el activar/desactivar también dejan rastro, con quien\n'
      '    -- firma. La talla, con su valor legible (no el uuid); el código, solo si ya tenía (la asignación inicial no es un cambio).\n'
      '    if new.color_codigo is distinct from old.color_codigo then\n'
      '      insert into retail.historial_producto_cambios (entidad, entidad_id, campo, valor_anterior, valor_nuevo, usuario_id)\n'
      '      values (''variante'', new.id, ''color'', old.color_codigo, new.color_codigo, v_usuario_id);\n'
      '    end if;\n'
      '    if new.talla_id is distinct from old.talla_id then\n'
      '      insert into retail.historial_producto_cambios (entidad, entidad_id, campo, valor_anterior, valor_nuevo, usuario_id)\n'
      '      values (''variante'', new.id, ''talla'',\n'
      '        (select t.valor from retail.tallas t where t.id = old.talla_id),\n'
      '        (select t.valor from retail.tallas t where t.id = new.talla_id), v_usuario_id);\n'
      '    end if;\n'
      '    if new.codigo is distinct from old.codigo and old.codigo is not null then\n'
      '      insert into retail.historial_producto_cambios (entidad, entidad_id, campo, valor_anterior, valor_nuevo, usuario_id)\n'
      '      values (''variante'', new.id, ''codigo'', old.codigo, new.codigo, v_usuario_id);\n'
      '    end if;\n'
      '    if new.activo is distinct from old.activo then\n'
      '      insert into retail.historial_producto_cambios (entidad, entidad_id, campo, valor_anterior, valor_nuevo, usuario_id)\n'
      '      values (''variante'', new.id, ''activo'', old.activo::text, new.activo::text, v_usuario_id);\n'
      '    end if;\n'],
    '20260928235500');
end;
$$;

-- ----------------------------------------------------------------------------
-- 8. Lo que la ficha necesita saber de cada variante antes de dejar corregirla
-- ----------------------------------------------------------------------------
-- SECURITY DEFINER porque `stock` tiene RLS por sede (una integrante solo ve la suya) y la ficha tiene que decir cuánto
-- hay en TODAS; y `venta_items`/`separacion_items`/`cambios`, también por sede. Solo cifras y sí/no; a quien no edita el
-- catálogo, nada. `vendida` es la MISMA regla que el paso 3 de fn_corregir_identidad_variante (D-136): si una cambia, la
-- otra también. `cambios` no tiene índice por variante_nueva_id y no le hace falta: son decenas de cambios al mes (miles
-- de filas a 3 años) y la ficha lo pregunta para las ~10 variantes de UNA prenda al abrirla.
create or replace function retail.fn_variantes_estado(p_producto_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select case
    when not retail.fn_puede_editar_catalogo() then '[]'::jsonb
    else coalesce((
      select jsonb_agg(jsonb_build_object(
               'variante_id', v.id,
               'stock', coalesce(s.stock, 0),
               'apartado', coalesce(s.apartado, 0),
               'sedes', coalesce(s.sedes, '[]'::jsonb),
               'vendida', exists (select 1 from retail.venta_items vi where vi.variante_id = v.id)
                          or exists (select 1 from retail.separacion_items si where si.variante_id = v.id)
                          or exists (select 1 from retail.cambios c where c.variante_nueva_id = v.id))
             order by v.created_at, v.id)
        from retail.variantes v
        left join lateral (
          select sum(x.cantidad)::integer as stock,
                 sum(x.apartada)::integer as apartado,
                 jsonb_agg(jsonb_build_object('ubicacion_id', x.ubicacion_id, 'nombre', x.nombre, 'cantidad', x.cantidad)
                           order by x.nombre) filter (where x.cantidad <> 0) as sedes
            from (select st.ubicacion_id, u.nombre,
                         sum(st.cantidad)::integer as cantidad,
                         sum(st.cantidad_apartada)::integer as apartada
                    from retail.stock st
                    join retail.ubicaciones u on u.id = st.ubicacion_id
                   where st.variante_id = v.id
                   group by st.ubicacion_id, u.nombre) x
        ) s on true
       where v.producto_id = p_producto_id
    ), '[]'::jsonb)
  end;
$$;
revoke all on function retail.fn_variantes_estado(uuid) from public, anon;
grant execute on function retail.fn_variantes_estado(uuid) to authenticated;

comment on function retail.fn_variantes_estado(uuid) is
  'ADR-0257: por cada variante de la prenda: {variante_id, stock (todas las sedes), apartado, sedes: [{ubicacion_id, nombre, cantidad}] (solo con cantidad <> 0, por nombre), vendida (venta_items, separacion_items o cambios.variante_nueva_id: la regla de líder de D-136)}. ''[]'' a quien no edita el catálogo.';

-- ----------------------------------------------------------------------------
-- 9. fn_productos: sin foto propia de su color, la variante muestra la foto general de la prenda
-- ----------------------------------------------------------------------------
do $$
begin
  perform pg_temp.parchar_235500(
    'retail.fn_productos(text,uuid,text,text,numeric,numeric,text,integer,integer,text,uuid,uuid)',
    array[E'and pf.color_codigo is not distinct from v.color_codigo\n    order by pf.orden'],
    array[
      E'and (pf.color_codigo is not distinct from v.color_codigo or pf.color_codigo is null)\n'
      '    -- 20260928235500 (ADR-0228/0257): la de su color primero; si su color no tiene, la general.\n'
      '    order by (pf.color_codigo is null), pf.orden'],
    '20260928235500');
end;
$$;

drop function pg_temp.parchar_235500(text, text[], text[], text);

-- PostgREST: que vea las funciones nuevas sin reiniciar.
notify pgrst, 'reload schema';

-- ----------------------------------------------------------------------------
-- Verificación de solo lectura, para después de pegar en producción (todo debe decir true / 1 / 0):
--
--   select
--     (select pg_get_indexdef('retail.variantes_identidad_unica'::regclass) like '%NULLS NOT DISTINCT') as indice,
--     (select count(*) from pg_constraint where conname = 'variantes_producto_talla_color_unico') as unique_viejo,      -- 0
--     (select count(*) from pg_trigger where tgname = 'variantes_identidad_solo_por_funcion') as candado,               -- 1
--     to_regprocedure('retail.fn_corregir_identidad_variante(uuid, uuid, jsonb)') is not null as corregir,
--     to_regprocedure('retail.fn_variantes_estado(uuid)') is not null as estado,
--     has_function_privilege('authenticated', 'retail.fn_codigo_variante_libre(text, uuid)', 'execute') as libre_api, -- false
--     (select count(*) from pg_proc p where p.pronamespace = 'retail'::regnamespace
--        and p.proname in ('catalogo_actualizar_producto', 'fn_registrar_cambio_producto', 'fn_asignar_codigo_variante', 'fn_productos')
--        and p.prosrc like '%20260928235500%') as parchadas;                                                          -- 4
-- ----------------------------------------------------------------------------
