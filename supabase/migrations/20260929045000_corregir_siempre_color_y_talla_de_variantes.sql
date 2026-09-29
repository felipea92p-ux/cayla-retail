-- ============================================================================
-- 20260929045000_corregir_siempre_color_y_talla_de_variantes.sql — CAYLA V2 · ADR-0263 (D-136, D-137, D-138)
-- Corregir el color y la talla de una variante que ya existe, SIEMPRE, desde su ficha (Felipe, 2026-09-28). Reemplaza
-- la regla «solo sin historia» del ADR-0258 (20260928235500, ya pegada en producción): D-139 y D-140 quedan superadas.
--
-- EL PROBLEMA PRIMERO. BOD-0003 «Body Amir» nació «Sin color» y sus tres variantes ya tienen su carga inicial (8/5/4 en
-- Trujillo, ADR-0212). ADR-0243 D-133 dejó color, talla y código de solo lectura: «si está mal, desactívala y agrega la
-- correcta». Para BOD-0003 eso es desactivar 3, crear 3, ajustar −17 y cargar +17 que nunca pasaron (y ajustar es solo
-- del líder), volver a poner sus etiquetas y reimprimir 17 etiquetas, porque las pegadas apuntan a la variante
-- desactivada y en Vender salen «no encontrada».
-- El ADR-0258 (20260928235500) abrió la corrección, pero SOLO para variantes sin historia: BOD-0003 tiene un movimiento
-- por variante (su carga inicial), así que ahí sigue fija; y la que sí se corrige RENOMBRA su código de barras, así que
-- una etiqueta ya impresa deja de sonar. Felipe eligió la regla de esta migración (2026-09-28, «Integrar sobre main»).
-- Encima, el candado de identidad dejó de tratar «Sin color» como un color el 17-sep: el índice `nulls not distinct` de
-- ADR-0069 se fue con la columna `talla` (20260917100500) y lo reemplazó un UNIQUE común, que deja pasar dos «Sin color
-- S» de la misma prenda.
--
-- LAS DECISIONES (Felipe, 2026-09-28; ADR-0263; en su rama nació 0254 y pasó por 0257 y 0262, números que tomó `main`).
--   D-136: el color y la talla se corrigen desde la ficha, en el MISMO «Guardar cambios», tenga o no historia. Es la
--          misma prenda física mal registrada: conserva su id, su stock y su historia (las tablas que la citan lo hacen
--          por id). Si ya salió con una clienta —se vendió (`venta_items`), una clienta la separó (`separacion_items`) o
--          se la llevó en un cambio (`cambios.variante_nueva_id`: `registrar_cambio` no escribe `venta_items` para la
--          prenda que sale)—, solo un líder (`fn_es_lider()`, permiso de la CUENTA, no del responsable). Todo cambio
--          queda en `historial_producto_cambios` con quién lo hizo.
--   D-137: al corregir, `variantes.codigo` se recalcula con la identidad nueva (BOD-0003-S → BOD-0003-NEG-S) y el código
--          viejo SE QUEDA en `codigos_barras` apuntando a la MISMA variante (el 0258 lo renombraba): las etiquetas
--          pegadas siguen sonando en Vender, Conteo, Cambios y Traslados. Si el código nuevo ya lo tiene OTRA variante,
--          se le agrega -2, -3…; lo mismo al crear una variante (`fn_asignar_codigo_variante`).
--   D-138: si la corrección cae sobre una combinación (color, talla) que ya existe en la prenda —activa o no; «Sin color»
--          cuenta como un color— se rechaza con un aviso que nombra esa variante y qué hacer. No se unen variantes.
--
-- DE DÓNDE PARTE. Del estado de `main` y de producción el 2026-09-28, con 20260928235500 (ADR-0258) aplicada:
--   - disparador `variantes_identidad_sin_historia` → `fn_identidad_variante_sin_historia()` (frena color, talla y
--     código solo en variantes con historia);
--   - `fn_corregir_identidad_variante(p_variante_id, p_producto_id, p_categoria_id, p_variante)` SECURITY INVOKER, que
--     `catalogo_actualizar_producto` llama con esos cuatro argumentos por cada variante existente;
--   - `fn_variantes_con_historia(uuid[])`, que la ficha de `main` pregunta al abrir;
--   - `fn_registrar_cambio_producto` anotando 'color_codigo', 'talla_id' (el uuid) y 'codigo'.
--   Huellas md5(prosrc) de ese estado, medidas en la réplica local de producción (todas las migraciones de `main`, sin
--   esta; 2026-09-28): catalogo_actualizar_producto 8d5e64ea36239df4c1d8cbce2d01436c, fn_registrar_cambio_producto
--   8727cba4f07a6f95fbaf299e975d9f33, fn_asignar_codigo_variante aea116da6a51f1e4fdf8abcab37856e7, fn_productos
--   8af6c222ec07356ed4912af92409c3de. La mañana del 2026-09-28, antes del 0258, producción tenía las mismas que el
--   local en catalogo_actualizar_producto (a66ff20a…), fn_registrar_cambio_producto (c4f2676e…) y fn_productos; que el
--   0258 quedó allá igual que aquí no se midió (esta sesión no consulta producción): lo dice la consulta de ANTES DE
--   PEGAR, sin escribir nada. Si producción tuviera otro cuerpo, las anclas lo detectan y la migración aborta entera sin
--   tocar nada.
--
-- QUÉ PROMETE.
--   1. `variantes_identidad_unica` (producto, talla, color) NULLS NOT DISTINCT: dos «Sin color S» de la misma prenda ya
--      no pueden existir. Antes de crearlo, una guarda aborta nombrando los duplicados si los hubiera. Reemplaza al
--      UNIQUE `variantes_producto_talla_color_unico` (estrictamente más débil: dejaba pasar los vacíos repetidos), que se
--      borra. Ninguna función ni pantalla lo usa en un `on conflict` (revisado con grep y en `pg_proc`);
--      `apps/web/lib/error-escritura.ts` ya traduce el nombre nuevo.
--   2. UN solo candado de identidad en la tabla: `variantes_identidad_solo_por_funcion`. Una sesión de la API
--      (`authenticated` o `anon`) no cambia el color, la talla, el código ni la prenda de NINGUNA variante con un update
--      directo (hint `identidad_variante`), tenga o no historia. Las funciones SECURITY DEFINER corren como su dueño y
--      pasan: son el camino oficial (mismo patrón que `variantes_costo_hasta_la_primera_compra`, 20260927190000). El
--      disparador del 0258 se RENOMBRA a este nombre y se le cambia la regla (`alter trigger … rename` +
--      `create or replace trigger`: sin borrar ningún disparador, ver PARA PEGAR); su función vieja se borra.
--  2b. Una prenda es «Sin color» o tiene colores, no las dos cosas (T5), en TODO camino que crea o cambia variantes:
--      el disparador de restricción `variantes_sin_mezcla_de_color` (DEFERRABLE INITIALLY IMMEDIATE) rechaza (hint
--      `mezcla_sin_color`) la variante que ESTA escritura crea, recolorea, activa o cambia de prenda si queda activa
--      junto a otra activa del otro lado. Antes la regla vivía solo al final de `catalogo_actualizar_producto`, y el
--      censo (`censo_crear_variante`, SECURITY DEFINER) le creaba una Negro S a una prenda «Sin color»: desde ahí la
--      ficha ya no guardaba NADA de esa prenda, ni un precio. «No empeora»: lo que la escritura no tocó no se revisa,
--      así que una prenda que ya venía mezclada se sigue guardando (precio, costo) y desactivar la arregla.
--   3. `fn_codigo_variante_libre(codigo, variante)` (interna): el código pedido si ninguna OTRA variante lo usa (ni como
--      código ni en `codigos_barras`); si no, el primero libre de codigo-2, codigo-3…
--   4. `fn_asignar_codigo_variante` (parche con ancla) pasa su código por `fn_codigo_variante_libre`: una Negro S creada
--      después de corregir la Negro S original a Azul nace BOD-0003-NEG-S-2 en vez de chocar con un 23505.
--   5. `fn_corregir_identidad_variante(p_variante_id, p_producto_id, p_categoria_id, p_variante)`: LA MISMA FIRMA y los
--      mismos nombres de parámetro del 0258 (`create or replace` no deja cambiarlos, y `catalogo_actualizar_producto` la
--      llama así), con la regla nueva y ahora SECURITY DEFINER con search_path fijo. La corrección entera, todo o nada.
--      Primero mira SIN candado si hay algo que corregir y, si no, sale sin bloquear nada (la ficha manda color y talla
--      de TODAS las variantes). Si hay cambio: exige el permiso de catálogo (a la cuenta), bloquea la prenda y la
--      variante (en ese orden, el de `catalogo_actualizar_producto`), vuelve a mirar con la fila bloqueada, aplica la
--      regla de líder (D-136), valida que el color esté activo y la talla habilitada en la categoría, rechaza el choque
--      (D-138), actualiza color/talla/código (D-137), mueve fotos y temporada del color si el color viejo se quedó sin
--      variantes (el paso de la temporada queda en el historial de la prenda como 'temporada:<COLOR>', el mismo campo que
--      usa asignar_temporadas), y sube la versión de la prenda (ADR-0193) para que una ficha abierta con la versión vieja
--      reciba PT409 en vez de revertir la corrección.
--      La categoría que manda es la de la prenda EN LA BASE: desde la ficha es exactamente `p_categoria_id`, porque
--      `catalogo_actualizar_producto` ya la escribió antes de recorrer las variantes. `p_categoria_id` queda por la
--      firma; una llamada directa no puede usarlo para validar una talla contra otra categoría.
--   6. `catalogo_actualizar_producto` (parches con ancla sobre el cuerpo que dejó el 0258): (a) el comentario del 0258
--      junto a su `perform fn_corregir_identidad_variante(…)` pasa a describir la regla nueva; el `perform` se queda;
--      (b) una variante nueva con un color inactivo se rechaza con palabras (antes: sin revisar); (c) al final, revisa
--      la regla de 2b con todas las variantes ya en su estado final (`set constraints … immediate`), para que el error
--      salga en esta llamada; (d) ANTES del `update productos`: difiere esa regla hasta (c) (una corrección de S, M, L
--      «Sin color» a Negro pasa por la mezcla entre la primera y la última) y, si alguna variante cambia de verdad de
--      color o de talla, bloquea la prenda y esas variantes (solo esas, por id): ver CANDADOS.
--   7. `fn_registrar_cambio_producto` (parche con ancla): el bloque del 0258 se REEMPLAZA (no se suma: nada se anota dos
--      veces) por uno que anota en el historial de la variante 'color', 'talla' (el valor legible, no el uuid), 'codigo'
--      (no la asignación inicial) y 'activo' (desactivar ya no pasa sin rastro). Las filas que el 0258 ya escribió
--      ('color_codigo', 'talla_id') se quedan: el historial no se edita.
--   8. `fn_variantes_estado(producto)`: para la ficha, por variante: stock total, apartado, stock por sede y si ya se
--      vendió (la misma regla que D-136: venta, separación o cambio). Lectura SECURITY DEFINER (el stock tiene RLS por
--      sede); '[]' a quien no edita el catálogo.
--   9. `fn_productos` (parche con ancla): la foto de una variante cae a la foto general de la prenda si su color no
--      tiene foto propia (lo mismo que ya hace `fotoDeVariante` en la web, apps/web/lib/producto-fotos-reglas.ts).
--  10. Se borran `fn_identidad_variante_sin_historia()` y `fn_variantes_con_historia(uuid[])` del 0258. La segunda la
--      pregunta HOY la ficha de `main` (`getVariantesConHistoria` en apps/web/lib/catalogo-v2.ts): ante el error
--      devuelve null y la ficha muestra todas las variantes fijas, como antes del 0258 (revisado en origin/main el
--      2026-09-28). Entre pegar esto y publicar la web nueva, nadie corrige desde la ficha vieja, pero nada se cae.
--
-- QUÉ NO HACE.
--   - No cambia ningún dato existente: no hay duplicados que limpiar (la guarda lo comprueba) y no corrige nada solo.
--     Si alguien alcanzó a corregir una variante con la regla del 0258 antes de pegar esto, su código viejo se renombró
--     (no quedó en `codigos_barras`); esta migración no lo reconstruye. La consulta de ANTES DE PEGAR las cuenta.
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
-- CANDADOS (T8; revisión del 2026-09-28, dos psql reales). Cambiar el color o la talla toca columnas de un índice
-- único, así que Postgres bloquea la fila de la variante en su modo más fuerte (FOR UPDATE), que choca con el FOR KEY
-- SHARE que toma TODA inserción que cita la variante: el movimiento de una venta, un traslado, un conteo, un cierre de
-- producción. Guardar la ficha solo precio, costo y activo toma FOR NO KEY UPDATE, que no choca con nada de eso.
-- Además, `update productos` toma con su disparador por sentencia la fila única de `catalogo_version` hasta el final de
-- la transacción. Si la variante se bloquea DESPUÉS de esa fila, un cierre de producción que ya insertó el movimiento de
-- la variante y después recalcula su costo (que también toma `catalogo_version`) cierra un círculo con la ficha: 40P01 y
-- el cierre se cae. Por eso el orden es uno solo:
--   la prenda (FOR UPDATE, el de la versión) → las variantes que DE VERDAD cambian, por id → `catalogo_version`.
-- Y la variante que no cambia no se bloquea nunca (la ficha manda color y talla de todas). La ficha del 0258 bloqueaba
-- con FOR UPDATE cada variante que corregía DESPUÉS de `catalogo_version`: este orden también cierra ese círculo.
-- Lo que este orden NO cubre: una operación que cita VARIAS de las variantes que se corrigen en el mismo guardado, en
-- otro orden que el id (una venta de M y S mientras se corrigen S y M). Esas operaciones toman el FOR KEY SHARE fila por
-- fila al insertar, sin orden; el círculo es posible en una ventana de milisegundos y una de las dos cae con 40P01 (sin
-- dejar nada a medias: la base deshace entera la que cae). Cerrarlo del todo pide que `fn_bloquear_en_orden` tome
-- `for key share` de las variantes por id en TODAS las operaciones; queda anotado en el ADR.
-- El disparador de 2b no toma ningún candado propio (solo lee): no suma ningún orden nuevo. Lo serializan los que ya
-- hay: una corrección de la ficha tiene la prenda FOR UPDATE, y el FOR KEY SHARE que el censo toma sobre la prenda al
-- insertar su variante choca con ese, así que uno de los dos espera y, al revisar, ve lo que dejó el otro. Lo que queda
-- sin serializar: dos altas de variante casi en el mismo instante sobre una prenda SIN ninguna variante activa, una
-- «Sin color» y otra con color (cada una ve a la prenda vacía). No hay pantalla que lo haga hoy.
--
-- CÓMO (parches). Mismo patrón que 20260924160000 y 20260927190000: se parte de la definición VIVA (`pg_get_functiondef`)
-- y se reemplazan anclas que tienen que aparecer EXACTAMENTE una vez, o la migración aborta sin tocar nada. Re-pegable: si
-- la función ya lleva la marca 20260929045000, no se vuelve a parchar.
--
-- ORDEN PARA PRODUCCIÓN: primero ESTA migración, después la web. La web de `main` con la base nueva sigue funcionando:
-- manda el color y la talla que ya tiene cada variante (no cambia nada, no bloquea nada, no pide líder) y, sin
-- `fn_variantes_con_historia`, muestra todas las variantes fijas. La web nueva con la base vieja no encuentra
-- `fn_variantes_estado` y no ofrece corregir.
-- NO vuelvas a pegar 20260928235500 después de esta: su sección 3 devolvería `fn_corregir_identidad_variante` a la
-- regla vieja (SECURITY INVOKER), y el candado de esta migración frenaría toda corrección.
--
-- PARA PEGAR EN PRODUCCIÓN: entera, sola, en el SQL Editor. Trae `set search_path` y `lock_timeout` de 3 s. Sin
-- `create policy` y sin borrar disparadores (ADR-0195: el candado se renombra con `alter trigger` y se redefine con
-- `create or replace trigger`). Lo PRIMERO que hace es tomar `variantes` en exclusiva: espera a que terminen las
-- operaciones de la tienda que ya la usan (3 s como máximo; si no, falla limpia sin aplicar nada y se vuelve a pegar) y
-- las que llegan después la esperan a ella (menos de un segundo). Nunca tumba una venta con 40P01. Se puede pegar dos
-- veces.
-- Sobre `alter trigger … rename`: la regla medida el 2026-09-24 (ADR-0195, CLAUDE.md «Políticas y deadlocks») es que
-- `create policy`, `drop policy` y borrar un disparador toman en exclusiva las tablas de auth y storage, y que `alter` y
-- `create trigger` no. `alter trigger` en particular NO se midió (en local no está el disparador de eventos de
-- Supabase). Si al pegar saliera 40P01 nombrando una tabla de auth o storage, no se aplicó nada: pegar primero, SOLA,
-- la línea `alter trigger variantes_identidad_sin_historia on retail.variantes rename to
-- variantes_identidad_solo_por_funcion;` y después esta migración entera (su paso 2 ve el nombre nuevo y no lo repite).
-- Lo mismo con el `create constraint trigger` de 2b (un `create trigger` que además anota la restricción; tampoco se
-- midió): si el 40P01 lo nombrara a él, pegar primero SOLA la sección 2b y después la migración entera (2b ve el
-- disparador ya creado y no lo repite).
--
-- CÓMO SE DESHACE (a mano, en este orden; nada de esto borra datos):
--   1. Quitar de catalogo_actualizar_producto, fn_asignar_codigo_variante y fn_productos los bloques marcados
--      «20260929045000»; en fn_registrar_cambio_producto, devolver el bloque del 0258 en lugar del de esta. PRIMERO
--      esto: catalogo_actualizar_producto nombra `variantes_sin_mezcla_de_color` en sus `set constraints`, y sin el
--      disparador la ficha dejaría de guardar.
--   2. SOLOS, cada uno en su propia pegada (borrar un disparador toma auth/storage):
--        drop trigger if exists variantes_identidad_solo_por_funcion on retail.variantes;
--        drop trigger if exists variantes_sin_mezcla_de_color on retail.variantes;
--   3. drop function if exists retail.fn_variante_identidad_solo_por_funcion();
--      drop function if exists retail.fn_variantes_sin_mezcla_de_color();
--   4. Para volver a la regla del 0258: pegar las secciones 1, 2 y 3 de 20260928235500 (vuelven
--      fn_variantes_con_historia, su disparador y su fn_corregir_identidad_variante, con la misma firma).
--   5. drop function if exists retail.fn_variantes_estado(uuid); fn_codigo_variante_libre se borra al final, cuando
--      nadie la llame. El índice `variantes_identidad_unica` conviene dejarlo: es el candado que faltaba.
--
-- VERIFICACIÓN DE SOLO LECTURA: al final del archivo, una para ANTES de pegar y otra para DESPUÉS.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ----------------------------------------------------------------------------
-- 0. El candado fuerte PRIMERO
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
    raise exception '20260929045000: hay variantes repetidas (misma prenda, talla y color) y el candado de identidad no se puede crear: %. Desactiva y ajusta una de cada par, bórrala si no tiene historia, y vuelve a pegar.', v_repetidas;
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
    raise exception '20260929045000: retail.variantes_identidad_unica existe con otra forma: %. Revisar antes de pegar.',
      pg_get_indexdef('retail.variantes_identidad_unica'::regclass);
  end if;
end;
$$;

comment on index retail.variantes_identidad_unica is
  'ADR-0263 (D-138) / ADR-0069: una variante por (prenda, talla, color). NULLS NOT DISTINCT: «Sin color» y «sin talla» cuentan como un valor más, así que dos «Sin color S» de la misma prenda chocan. Activa o no: una combinación desactivada se reactiva, no se repite.';

-- El UNIQUE anterior es estrictamente más débil (dos vacíos no chocaban): sobra.
alter table retail.variantes drop constraint if exists variantes_producto_talla_color_unico;

-- ----------------------------------------------------------------------------
-- 2. UN solo candado: color, talla, código y prenda de una variante no se cambian con un update directo por la API
-- ----------------------------------------------------------------------------
-- SECURITY INVOKER a propósito: `current_user` tiene que ser quien escribe. Por la API es `authenticated` (o `anon`);
-- dentro de `fn_corregir_identidad_variante` y de `fn_asignar_codigo_variante` (SECURITY DEFINER) es el dueño, y pasan.
-- A diferencia del candado del 0258, no pregunta si la variante tiene historia: TODA corrección pasa por la función, que
-- es la que aplica la regla (D-136) y deja el código viejo sonando (D-137).
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
  'ADR-0263: disparador de variantes. Una sesión de la API no cambia color, talla, código ni prenda de una variante con un update directo (hint identidad_variante); el camino es fn_corregir_identidad_variante (desde la ficha). Reemplaza a fn_identidad_variante_sin_historia (ADR-0258).';

-- El disparador del 0258 se RENOMBRA (no se borra: borrar un disparador en el SQL Editor de producción toma en
-- exclusiva las tablas de auth y storage hasta el final y puede chocar con el Asesor de seguridad; CLAUDE.md, «Políticas
-- y deadlocks», ADR-0195). Si ya tiene el nombre nuevo (se volvió a pegar, o se renombró aparte), no se hace nada.
do $$
declare
  v_viejo boolean := exists (select 1 from pg_trigger
                              where tgrelid = 'retail.variantes'::regclass and tgname = 'variantes_identidad_sin_historia');
  v_nuevo boolean := exists (select 1 from pg_trigger
                              where tgrelid = 'retail.variantes'::regclass and tgname = 'variantes_identidad_solo_por_funcion');
begin
  if v_viejo and v_nuevo then
    -- No debería pasar (la migración que creaba el nuevo nombre por su cuenta nunca se pegó). Dos candados a la vez no
    -- rompen la regla nueva, pero la regla es uno solo: se aborta en vez de dejarlo así.
    raise exception '20260929045000: retail.variantes tiene los dos candados de identidad (variantes_identidad_sin_historia y variantes_identidad_solo_por_funcion). Quita el primero SOLO, en su propia pegada, y vuelve a pegar esta.';
  end if;
  if v_viejo then
    alter trigger variantes_identidad_sin_historia on retail.variantes rename to variantes_identidad_solo_por_funcion;
    raise notice '20260929045000: variantes_identidad_sin_historia pasa a llamarse variantes_identidad_solo_por_funcion';
  end if;
end;
$$;

-- `create or replace trigger`, nunca borrar y volver a crear. Sobre el renombrado cambia las columnas (suma
-- `producto_id`) y la función; si no existía (una base sin el 0258), lo crea.
create or replace trigger variantes_identidad_solo_por_funcion
  before update of color_codigo, talla_id, codigo, producto_id on retail.variantes
  for each row execute function retail.fn_variante_identidad_solo_por_funcion();

-- Ya ningún disparador la usa.
drop function if exists retail.fn_identidad_variante_sin_historia();

-- ----------------------------------------------------------------------------
-- 2b. Una prenda es «Sin color» o tiene colores, no las dos cosas (T5): en TODO camino que crea o cambia variantes
-- ----------------------------------------------------------------------------
-- Una «Sin color S» junto a una «Negro S» son la misma talla vendida en dos filas. La regla vivía solo al final de
-- catalogo_actualizar_producto, y el censo (alta al vuelo en el Conteo) le creaba una variante con color a una prenda
-- «Sin color»: desde ahí la ficha no guardaba nada de esa prenda, ni un precio. Ahora la cumple la tabla.
--
-- Por FILA y «no empeora»: solo se revisa la variante que ESTA escritura creó, recoloreó, activó o cambió de prenda. Si
-- queda activa junto a otra activa del otro lado (una con color y otra «Sin color»), se rechaza. Lo que la escritura no
-- tocó no se revisa: guardar el precio de una prenda que ya venía mezclada (de antes de esta migración) pasa, y
-- desactivar una de sus variantes también (la arregla). Mira la fila como está AHORA, no como estaba en el evento:
-- diferido (desde la ficha), otra corrección del mismo guardado pudo cambiarla después.
--
-- DEFERRABLE INITIALLY IMMEDIATE: en el censo, el alta y una llamada suelta a fn_corregir_identidad_variante se revisa al
-- terminar cada sentencia. catalogo_actualizar_producto la difiere antes de tocar las variantes y la vuelve a inmediata
-- al final (su parche (d) y (c)), así el error sale DENTRO de su llamada y no al confirmar.
-- SECURITY DEFINER: tiene que ver todas las variantes de la prenda, lea quien lea (la ficha es SECURITY INVOKER).
create or replace function retail.fn_variantes_sin_mezcla_de_color()
returns trigger
language plpgsql
security definer
set search_path to 'retail', 'public', 'extensions'
as $$
declare
  v_ahora record;
begin
  if tg_op = 'UPDATE'
     and new.color_codigo is not distinct from old.color_codigo
     and new.activo is not distinct from old.activo
     and new.producto_id is not distinct from old.producto_id then
    return null;  -- esta escritura no tocó nada de la regla (un precio, un costo): no empeora nada
  end if;
  select v.producto_id, v.color_codigo, v.activo into v_ahora
    from retail.variantes v where v.id = new.id;
  if not found or not v_ahora.activo then
    return null;  -- desactivada (o ya no existe): no mezcla nada
  end if;
  if exists (select 1 from retail.variantes o
              where o.producto_id = v_ahora.producto_id
                and o.id <> new.id
                and o.activo
                and (o.color_codigo is null) <> (v_ahora.color_codigo is null)) then
    -- La misma frase que la ficha (FRASE_MEZCLA_SIN_COLOR, apps/web/lib/variantes-ficha-reglas.ts). El Conteo la cambia
    -- por la suya con el hint (apps/web/lib/conteo-reglas.ts, mensajeMezclaEnCenso).
    raise exception 'Esta prenda quedaría con variantes «Sin color» junto a otras con color. Ponle color a las que no lo tienen o desactívalas.'
      using hint = 'mezcla_sin_color';
  end if;
  return null;
end;
$$;

comment on function retail.fn_variantes_sin_mezcla_de_color() is
  'ADR-0263 (T5): disparador de restricción de variantes. Rechaza (hint mezcla_sin_color) la variante que la escritura crea, recolorea, activa o cambia de prenda si queda activa junto a otra activa del otro lado (con color / «Sin color»). No empeora: lo que la escritura no tocó no se revisa.';

-- Sin `create or replace` para un disparador de restricción (Postgres no lo acepta): se crea si no está y, si está con
-- otra forma, se aborta en vez de dejarlo callado. Re-pegable.
do $$
declare
  v_def text;
  v_funcion boolean;
begin
  -- La función se compara por oid: `pg_get_triggerdef` la escribe con o sin `retail.` según el search_path.
  select pg_get_triggerdef(t.oid), t.tgfoid = 'retail.fn_variantes_sin_mezcla_de_color()'::regprocedure
    into v_def, v_funcion
    from pg_trigger t
   where t.tgrelid = 'retail.variantes'::regclass and t.tgname = 'variantes_sin_mezcla_de_color';
  if v_def is null then
    create constraint trigger variantes_sin_mezcla_de_color
      after insert or update of color_codigo, activo, producto_id on retail.variantes
      deferrable initially immediate
      for each row execute function retail.fn_variantes_sin_mezcla_de_color();
  elsif not v_funcion
     or regexp_replace(v_def, ' EXECUTE FUNCTION .*$', '')
        <> 'CREATE CONSTRAINT TRIGGER variantes_sin_mezcla_de_color AFTER INSERT OR UPDATE OF color_codigo, activo, producto_id ON retail.variantes DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW' then
    raise exception '20260929045000: retail.variantes ya tiene variantes_sin_mezcla_de_color con otra forma: %. Revisar antes de pegar.', v_def;
  end if;
end;
$$;

comment on trigger variantes_sin_mezcla_de_color on retail.variantes is
  'ADR-0263 (T5): una prenda es «Sin color» o tiene colores. Revisa la variante que la escritura crea, recolorea, activa o cambia de prenda (hint mezcla_sin_color). Inmediato; catalogo_actualizar_producto lo difiere a su final.';

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
  'ADR-0263 (D-137), interna: el código pedido si ninguna OTRA variante lo usa (variantes.codigo o codigos_barras); si no, codigo-2, codigo-3… el primero libre.';

-- ----------------------------------------------------------------------------
-- Ayudante de esta migración (nombre propio: los pg_temp de otras migraciones viven en la misma sesión al migrar en
-- local). Parte de la definición VIVA, exige cada ancla EXACTAMENTE una vez y no hace nada si ya lleva la marca.
-- ----------------------------------------------------------------------------
create or replace function pg_temp.parchar_045000(p_firma text, p_anclas text[], p_nuevos text[], p_marca text)
returns void
language plpgsql
as $$
declare
  v_def text;
  v_veces integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_marca in v_def) > 0 then
    raise notice '20260929045000: % ya tenía el parche (se volvió a pegar)', p_firma;
    return;
  end if;
  for i in 1 .. array_length(p_anclas, 1) loop
    v_veces := (length(v_def) - length(replace(v_def, p_anclas[i], ''))) / length(p_anclas[i]);
    if v_veces <> 1 then
      raise exception '20260929045000: % no tiene el ancla % esperada (aparece % veces). Revisar su definición viva antes de pegar.',
        p_firma, i, v_veces;
    end if;
    v_def := replace(v_def, p_anclas[i], p_nuevos[i]);
  end loop;
  execute v_def;
  raise notice '20260929045000: % parchada', p_firma;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. fn_asignar_codigo_variante: el código de una variante nueva también pasa por «libre» (D-137)
-- ----------------------------------------------------------------------------
do $$
declare
  v_ancla constant text := E'  update variantes set codigo = v_codigo where id = p_variante_id;\n';
begin
  perform pg_temp.parchar_045000(
    'retail.fn_asignar_codigo_variante(uuid)',
    array[v_ancla],
    array[
      E'  -- 20260929045000 (ADR-0263, D-137): si otra variante ya usa este código (p. ej. el viejo de una Negro S corregida\n'
      '  -- a Azul, que sigue pegado en su percha), la nueva nace con -2, -3… en vez de chocar.\n'
      '  v_codigo := retail.fn_codigo_variante_libre(v_codigo, p_variante_id);\n'
      || v_ancla],
    '20260929045000');
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. La corrección (D-136, D-137, D-138): todo o nada, dentro del «Guardar cambios» de la ficha
-- ----------------------------------------------------------------------------
-- Misma firma y mismos nombres de parámetro que la del 0258 (`catalogo_actualizar_producto` la llama con estos cuatro
-- argumentos). `create or replace` sí deja pasar de SECURITY INVOKER a DEFINER y fijar el search_path.
create or replace function retail.fn_corregir_identidad_variante(
  p_variante_id uuid,
  p_producto_id uuid,
  p_categoria_id uuid,
  p_variante jsonb
)
returns void
language plpgsql
security definer
set search_path to 'retail', 'public', 'extensions'
as $$
declare
  v_prod record;
  v_var record;
  v_otra record;
  v_pide_color boolean := coalesce(p_variante ? 'color_codigo', false);
  v_pide_talla boolean := coalesce(p_variante ? 'talla_id', false);
  -- Qué se pide. Una clave AUSENTE = ese eje no cambia; '' o null = «Sin color» / «sin talla».
  v_color_pedido text := nullif(btrim(coalesce(p_variante ->> 'color_codigo', '')), '');
  v_talla_pedida uuid := nullif(btrim(coalesce(p_variante ->> 'talla_id', '')), '')::uuid;
  v_color_nuevo text;
  v_talla_nueva uuid;
  v_cambia_color boolean;
  v_codigo_nuevo text;
  v_temporada text;
  v_actor uuid;
begin
  -- 1. ¿Cambia algo? Se mira SIN candado. La ficha manda el color y la talla de TODAS sus variantes: si no cambian, se
  --    sale aquí sin bloquear nada (un FOR UPDATE de la variante choca con el FOR KEY SHARE de cualquier venta,
  --    traslado o conteo que la cite). Mirar sin candado es seguro: lo protege la versión de la prenda (ADR-0193), que
  --    catalogo_actualizar_producto ya comprobó con la prenda bloqueada, y toda corrección pasa por el candado de la
  --    prenda. Si la variante no aparece o es de otra prenda, se sigue al paso 2, que lo dice con palabras.
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
  --    mientras tanto (su inserción pide FOR KEY SHARE de la variante). Un apartado sin dinero no cuenta (T7). El stock y
  --    los movimientos (una carga inicial, un traslado) tampoco: esa es la diferencia con el 0258.
  if (exists (select 1 from retail.venta_items vi where vi.variante_id = p_variante_id)
      or exists (select 1 from retail.separacion_items si where si.variante_id = p_variante_id)
      or exists (select 1 from retail.cambios c where c.variante_nueva_id = p_variante_id))
     and not retail.fn_es_lider() then
    -- La frase es la misma que dice la ficha (variantes-ficha-reglas.ts, bloqueoPorVenta) y nombra SOLO lo que cuenta:
    -- «Apartar» de Existencias (retail.apartados, sin dinero) no bloquea y no se nombra.
    raise exception 'La variante % ya salió con una clienta (venta, separación en Apartados o cambio): solo un líder puede corregir su color o su talla.',
      coalesce(v_var.codigo, p_variante_id::text)
      using errcode = '42501', hint = 'correccion_solo_lider';
  end if;

  -- 4. Lo nuevo tiene que valer: el color, activo en el vocabulario; la talla, habilitada en la categoría de la prenda.
  --    Esa categoría es la de la base, que desde la ficha ya es `p_categoria_id` (catalogo_actualizar_producto la
  --    escribió antes de recorrer las variantes); una llamada directa no la puede cambiar pasando otra. Solo el eje que
  --    cambia.
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
  --    variante (el 0258 lo renombraba): las etiquetas ya pegadas siguen sonando.
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
revoke all on function retail.fn_corregir_identidad_variante(uuid, uuid, uuid, jsonb) from public, anon;
grant execute on function retail.fn_corregir_identidad_variante(uuid, uuid, uuid, jsonb) to authenticated;

comment on function retail.fn_corregir_identidad_variante(uuid, uuid, uuid, jsonb) is
  'ADR-0263 (D-136/137/138): corrige el color y/o la talla de una variante existente (p_variante: color_codigo, talla_id; clave ausente = no cambia; '''' o null = sin color / sin talla), tenga o no historia. Conserva id, stock e historia; recalcula el código y deja el viejo en codigos_barras; mueve fotos y temporada del color si el viejo se quedó sin variantes; sube la versión de la prenda. Vendida, separada o entregada en un cambio: solo líder (correccion_solo_lider). Choque: variante_ya_existe. La talla se valida contra la categoría de la prenda en la base (p_categoria_id queda por la firma). Sin cambios: no hace nada ni bloquea nada (se mira sin candado); con cambios bloquea prenda → variante (T8). La llama catalogo_actualizar_producto (20260929045000; reemplaza la regla de 20260928235500).';

-- ----------------------------------------------------------------------------
-- 6. catalogo_actualizar_producto: corrige en el mismo guardado, revisa el color de las nuevas y no deja la mezcla
-- ----------------------------------------------------------------------------
-- Parte del cuerpo que dejó el 0258. (a) solo cambia el comentario de su `perform`: la llamada se queda igual, porque
-- la función ya sale sin hacer nada (ni bloquear nada) cuando la variante no cambia.
do $$
declare
  v_ancla_d constant text := E'  update productos\n    set categoria_id = p_categoria_id,\n';
  v_ancla_a constant text := $a$      -- 20260928235500: color y talla se corrigen si la variante no tiene historia; si tiene, lo dice.
      perform retail.fn_corregir_identidad_variante(v_id, p_producto_id, p_categoria_id, v_variante);
$a$;
  v_ancla_b constant text := E'      insert into variantes (producto_id, color_codigo, talla_id, sku, precio, costo)\n';
  v_ancla_c constant text := E'  -- ADR-0193: la versión nueva (el update de arriba la subió), para un segundo guardado sin recargar.\n';
begin
  perform pg_temp.parchar_045000(
    'retail.catalogo_actualizar_producto(uuid,text,text,jsonb,uuid,text,integer,text,boolean,jsonb,uuid,uuid,uuid,uuid,boolean,integer)',
    array[v_ancla_d, v_ancla_a, v_ancla_b, v_ancla_c],
    array[
      -- (d) Antes del update de la prenda: los candados de las correcciones, en el orden de T8.
      E'  -- 20260929045000 (ADR-0263, T8): los candados de una corrección van ANTES de este update, que toma la fila única\n'
      '  -- de catalogo_version (disparador por sentencia) hasta el final. Si la variante se bloqueara después, un cierre de\n'
      '  -- producción o una recepción que ya insertó su movimiento (FOR KEY SHARE de la variante) y después recalcula su\n'
      '  -- costo (catalogo_version) cerraría un círculo con esta ficha: 40P01. Orden: la prenda → las variantes que DE\n'
      '  -- VERDAD cambian de color o de talla, por id → catalogo_version. Las que no cambian no se bloquean (la ficha\n'
      '  -- manda el color y la talla de todas). La misma comparación que fn_corregir_identidad_variante ('''' = sin color).\n'
      '  -- ADR-0263 (T5): «Sin color o con colores» (variantes_sin_mezcla_de_color) se revisa al final, con todas las\n'
      '  -- variantes en su estado final, no en cada una: corregir S, M, L «Sin color» a Negro pasa por la mezcla entre la\n'
      '  -- primera y la última. Ver el `set constraints … immediate` antes del return.\n'
      '  set constraints retail.variantes_sin_mezcla_de_color deferred;\n'
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
      -- (a) El comentario del 0258 junto a su perform pasa a describir la regla nueva; el perform no cambia.
      $n$      -- 20260929045000 (ADR-0263, D-136/137/138): color y talla se corrigen SIEMPRE, en este mismo guardado (todo o
      -- nada); reemplaza la regla «solo sin historia» del 0258. Vendida, separada o entregada en un cambio: solo un líder.
      -- El código se recalcula y el viejo sigue sonando. Si la ficha manda el color y la talla que ya tiene (la de antes
      -- los manda de todas), la función sale sin hacer nada ni bloquear nada.
      perform retail.fn_corregir_identidad_variante(v_id, p_producto_id, p_categoria_id, v_variante);
$n$,
      -- (b) Antes de insertar una variante nueva.
      E'      -- 20260929045000 (ADR-0263): el color de una variante nueva tiene que estar activo, como en el alta.\n'
      '      if nullif(v_variante->>''color_codigo'', '''') is not null and not exists (\n'
      '        select 1 from colores where codigo = nullif(v_variante->>''color_codigo'', '''') and activo\n'
      '      ) then\n'
      '        raise exception ''El color % no existe o ya no está activo en el vocabulario. Elige otro.'', v_variante->>''color_codigo''\n'
      '          using hint = ''color_inactivo'';\n'
      '      end if;\n'
      || v_ancla_b,
      -- (c) Antes del return final.
      E'  -- 20260929045000 (ADR-0263, T5): una prenda es «Sin color» o tiene colores, no las dos cosas a la vez (una «Sin\n'
      '  -- color S» junto a una «Negro S» son la misma talla vendida en dos filas). La regla es de la tabla\n'
      '  -- (variantes_sin_mezcla_de_color, también frena al censo); esta función la difirió antes de tocar las variantes y\n'
      '  -- la revisa aquí, con todas en su estado final, para que el error (hint mezcla_sin_color) salga en esta llamada y\n'
      '  -- no al confirmar. Solo frena lo que ESTE guardado creó, recoloreó o activó: una prenda que ya venía mezclada se\n'
      '  -- sigue guardando (un precio), y las desactivadas no cuentan.\n'
      '  set constraints retail.variantes_sin_mezcla_de_color immediate;\n\n'
      || v_ancla_c],
    '20260929045000');
end;
$$;

-- ----------------------------------------------------------------------------
-- 7. fn_registrar_cambio_producto: el bloque del 0258 se reemplaza (no se suma) por color, talla, código y activo
-- ----------------------------------------------------------------------------
do $$
declare
  -- El bloque EXACTO que insertó 20260928235500 (su sección 5).
  v_ancla constant text := $a$    -- 20260928235500: corregir color o talla de una variante sin historia queda anotado.
    if new.color_codigo is distinct from old.color_codigo then
      insert into retail.historial_producto_cambios (entidad, entidad_id, campo, valor_anterior, valor_nuevo, usuario_id)
      values ('variante', new.id, 'color_codigo', old.color_codigo, new.color_codigo, v_usuario_id);
    end if;
    if new.talla_id is distinct from old.talla_id then
      insert into retail.historial_producto_cambios (entidad, entidad_id, campo, valor_anterior, valor_nuevo, usuario_id)
      values ('variante', new.id, 'talla_id', old.talla_id::text, new.talla_id::text, v_usuario_id);
    end if;
    if old.codigo is not null and new.codigo is distinct from old.codigo then
      insert into retail.historial_producto_cambios (entidad, entidad_id, campo, valor_anterior, valor_nuevo, usuario_id)
      values ('variante', new.id, 'codigo', old.codigo, new.codigo, v_usuario_id);
    end if;
$a$;
  -- Nombra 20260928235500 a propósito: si alguien volviera a pegar el 0258, su sección 5 ve la marca y no suma su bloque.
  v_nuevo constant text := $n$    -- 20260929045000 (ADR-0263, D-136): la identidad corregida y el activar/desactivar dejan rastro, con quien firma.
    -- Reemplaza el bloque de 20260928235500 (ADR-0258), que anotaba 'color_codigo' y 'talla_id' con el uuid: la talla va
    -- con su valor legible; el código, solo si ya tenía (la asignación inicial no es un cambio).
    if new.color_codigo is distinct from old.color_codigo then
      insert into retail.historial_producto_cambios (entidad, entidad_id, campo, valor_anterior, valor_nuevo, usuario_id)
      values ('variante', new.id, 'color', old.color_codigo, new.color_codigo, v_usuario_id);
    end if;
    if new.talla_id is distinct from old.talla_id then
      insert into retail.historial_producto_cambios (entidad, entidad_id, campo, valor_anterior, valor_nuevo, usuario_id)
      values ('variante', new.id, 'talla',
        (select t.valor from retail.tallas t where t.id = old.talla_id),
        (select t.valor from retail.tallas t where t.id = new.talla_id), v_usuario_id);
    end if;
    if new.codigo is distinct from old.codigo and old.codigo is not null then
      insert into retail.historial_producto_cambios (entidad, entidad_id, campo, valor_anterior, valor_nuevo, usuario_id)
      values ('variante', new.id, 'codigo', old.codigo, new.codigo, v_usuario_id);
    end if;
    if new.activo is distinct from old.activo then
      insert into retail.historial_producto_cambios (entidad, entidad_id, campo, valor_anterior, valor_nuevo, usuario_id)
      values ('variante', new.id, 'activo', old.activo::text, new.activo::text, v_usuario_id);
    end if;
$n$;
begin
  perform pg_temp.parchar_045000('retail.fn_registrar_cambio_producto()', array[v_ancla], array[v_nuevo], '20260929045000');
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
  'ADR-0263: por cada variante de la prenda: {variante_id, stock (todas las sedes), apartado, sedes: [{ubicacion_id, nombre, cantidad}] (solo con cantidad <> 0, por nombre), vendida (venta_items, separacion_items o cambios.variante_nueva_id: la regla de líder de D-136)}. ''[]'' a quien no edita el catálogo.';

-- ----------------------------------------------------------------------------
-- 9. fn_productos: sin foto propia de su color, la variante muestra la foto general de la prenda
-- ----------------------------------------------------------------------------
do $$
begin
  perform pg_temp.parchar_045000(
    'retail.fn_productos(text,uuid,text,text,numeric,numeric,text,integer,integer,text,uuid,uuid)',
    array[E'and pf.color_codigo is not distinct from v.color_codigo\n    order by pf.orden'],
    array[
      E'and (pf.color_codigo is not distinct from v.color_codigo or pf.color_codigo is null)\n'
      '    -- 20260929045000 (ADR-0228/0263): la de su color primero; si su color no tiene, la general.\n'
      '    order by (pf.color_codigo is null), pf.orden'],
    '20260929045000');
end;
$$;

drop function pg_temp.parchar_045000(text, text[], text[], text);

-- ----------------------------------------------------------------------------
-- 10. Lo que el 0258 dejó y ya nadie usa en la base
-- ----------------------------------------------------------------------------
-- La ficha de `main` la pregunta al abrir y tolera que falte (getVariantesConHistoria → null → todas fijas). La regla
-- nueva no pregunta «¿tiene historia?»: pregunta «¿se vendió?» (fn_variantes_estado).
drop function if exists retail.fn_variantes_con_historia(uuid[]);

-- PostgREST: que vea las funciones nuevas (y deje de ofrecer las borradas) sin reiniciar.
notify pgrst, 'reload schema';

-- ----------------------------------------------------------------------------
-- ANTES DE PEGAR — solo lectura, en producción. Confirma que la base es la esperada y cuenta lo que el 0258 alcanzó a
-- corregir (esos códigos viejos se renombraron y esta migración no los devuelve):
--
--   select
--     (select md5(prosrc) from pg_proc where oid = 'retail.catalogo_actualizar_producto(uuid,text,text,jsonb,uuid,text,integer,text,boolean,jsonb,uuid,uuid,uuid,uuid,boolean,integer)'::regprocedure) as catalogo, -- 8d5e64ea36239df4c1d8cbce2d01436c
--     (select md5(prosrc) from pg_proc where oid = 'retail.fn_registrar_cambio_producto()'::regprocedure) as historial,            -- 8727cba4f07a6f95fbaf299e975d9f33
--     (select md5(prosrc) from pg_proc where oid = 'retail.fn_asignar_codigo_variante(uuid)'::regprocedure) as asignar_codigo,     -- aea116da6a51f1e4fdf8abcab37856e7
--     (select md5(prosrc) from pg_proc where oid = 'retail.fn_productos(text,uuid,text,text,numeric,numeric,text,integer,integer,text,uuid,uuid)'::regprocedure) as productos, -- 8af6c222ec07356ed4912af92409c3de
--     (select string_agg(tgname, ',') from pg_trigger where tgrelid = 'retail.variantes'::regclass and tgname like 'variantes_identidad%') as candado, -- variantes_identidad_sin_historia
--     (select count(*) from (select 1 from retail.variantes group by producto_id, talla_id, color_codigo having count(*) > 1) d) as repetidas, -- 0
--     (select count(*) from retail.historial_producto_cambios where entidad = 'variante' and campo in ('color_codigo', 'talla_id')) as corregidas_por_el_0258, -- 0 esperado
--     (select count(*) from (select producto_id from retail.variantes where activo group by producto_id
--        having bool_or(color_codigo is null) and bool_or(color_codigo is not null)) m) as mezcladas; -- 0 esperado
--   `mezcladas` cuenta las prendas que YA mezclan variantes activas «Sin color» y con color (el censo las podía crear
--   hasta hoy). No impide pegar: el candado de 2b solo frena lo que una escritura cambia, así que esas prendas se siguen
--   guardando (un precio) y la ficha avisa. Si sale más de 0, ordenarlas desde su ficha (ponerles color o desactivar
--   las «Sin color») cuando se pueda.
--
-- DESPUÉS DE PEGAR — solo lectura (todo debe decir lo que marca el comentario):
--
--   select
--     (select pg_get_indexdef('retail.variantes_identidad_unica'::regclass) like '%NULLS NOT DISTINCT') as indice,          -- true
--     (select count(*) from pg_constraint where conname = 'variantes_producto_talla_color_unico') as unique_viejo,         -- 0
--     (select string_agg(tgname || '>' || tgfoid::regproc::text, ',') from pg_trigger
--       where tgrelid = 'retail.variantes'::regclass and tgname like 'variantes_identidad%') as candado,                  -- variantes_identidad_solo_por_funcion>retail.fn_variante_identidad_solo_por_funcion
--     (select tgdeferrable::text || ',' || tginitdeferred::text || '>' || tgfoid::regproc::text from pg_trigger
--       where tgrelid = 'retail.variantes'::regclass and tgname = 'variantes_sin_mezcla_de_color') as sin_mezcla,       -- true,false>retail.fn_variantes_sin_mezcla_de_color
--     (select prosecdef from pg_proc where oid = 'retail.fn_corregir_identidad_variante(uuid,uuid,uuid,jsonb)'::regprocedure) as corregir_definer, -- true
--     to_regprocedure('retail.fn_variantes_estado(uuid)') is not null as estado,                                            -- true
--     to_regprocedure('retail.fn_variantes_con_historia(uuid[])') is null
--       and to_regprocedure('retail.fn_identidad_variante_sin_historia()') is null as sin_restos_0258,                     -- true
--     has_function_privilege('authenticated', 'retail.fn_codigo_variante_libre(text, uuid)', 'execute') as libre_api,      -- false
--     (select string_agg(proname || ':' || md5(prosrc), ' ' order by proname) from pg_proc
--       where pronamespace = 'retail'::regnamespace
--         and proname in ('catalogo_actualizar_producto', 'fn_asignar_codigo_variante', 'fn_corregir_identidad_variante',
--                         'fn_productos', 'fn_registrar_cambio_producto', 'fn_variante_identidad_solo_por_funcion',
--                         'fn_codigo_variante_libre', 'fn_variantes_estado', 'fn_variantes_sin_mezcla_de_color')) as huellas;
--   -- huellas: las de la base local rehecha desde cero (todas las migraciones), iguales a las de la réplica de
--   -- producción (main sin esta) con esta pegada encima dos veces con psql -1 (2026-09-29). Si una sale distinta, esa
--   -- función de producción no es la de main: compararla antes de publicar la web.
--   --   catalogo_actualizar_producto:ffe5459504b331631fd6e57e71c8eaaa fn_asignar_codigo_variante:0bbcfb8f7b1f8b247daec08b050c3db7
--   --   fn_codigo_variante_libre:5d07d0efc0ac8d96770e2a4df8670179 fn_corregir_identidad_variante:683d5711e76240568d1884368cdf0605
--   --   fn_productos:e350c813de06e96cfdc042e3171ef815 fn_registrar_cambio_producto:a3df4fc1c49848ced0e7eb6c473181d5
--   --   fn_variante_identidad_solo_por_funcion:ecabb1c4f80e41fed9c01ac5aa516fe3 fn_variantes_estado:49181cceef723bc0b07914185ea5f253
--   --   fn_variantes_sin_mezcla_de_color:7920915133759862269190ead46f0492
-- ----------------------------------------------------------------------------
