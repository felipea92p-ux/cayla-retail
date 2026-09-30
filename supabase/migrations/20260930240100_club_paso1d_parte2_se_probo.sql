-- ============================================================================
-- 20260930240100_club_paso1d_parte2_se_probo.sql — CAYLA V2 · Club de clientas · paso 1, tanda 1d · PARTE 2 de 4
-- ADR-0288 (DECISIÓN 6, DECISIÓN 7 y «Actualización 2026-09-30 (e): tanda 1d»); acta
-- docs/datos/DECISIONES-2026-09-29-club-clientas.md (CL-7, CL-14) y D-101. CUATRO PARTES, sin políticas ni `drop trigger`
-- (CLAUDE.md, «Políticas y deadlocks»). Van DESPUÉS de la tanda 1c (20260930230000 a 20260930230200).
--
-- EL PROBLEMA. Dos señales de la clienta se perdían o mentían:
--   · «Se la probó y no la llevó» no quedaba en ningún lado. Compras solo veía «buscó y no había» (`pedidos_no_atendidos`,
--     ADR-0152), y la pregunta de Compras y del Taller es una sola: ¿qué querían y no se llevaron? (CL-14).
--   · Una blusa talla S comprada para regalar a la hermana se volvía «su talla» en la ficha (D-101): `deducirTallas`
--     (apps/web/lib/clienta-actividad-reglas.ts) no tenía cómo saber que esa prenda no era para ella («LÍMITE CONOCIDO
--     (v1)» de ese archivo).
--
-- QUÉ HACE (cada punto dice en qué parte va)
--   1. (PARTE 1) `pedidos_no_atendidos` suma `motivo` (`no_habia_talla` por defecto, así que TODO lo de hoy queda como «buscó y no
--      había»; o `se_probo_no_llevo`) y `razon` (opcional, solo con `se_probo_no_llevo`: `no_le_quedo`, `precio`, `color` o
--      `lo_piensa`). Candados en el esquema: el motivo es uno de los dos, y una razón sin «se la probó» es imposible.
--   2. (PARTE 2, este archivo) `registrar_pedido_no_atendido` recibe `p_motivo` y `p_razon` al final, con los defaults de hoy: la llamada vieja
--      (5 parámetros: «Anotar que no había» del modal de talla y de Cambios) sigue igual. Cambia de firma: `drop` de la
--      vieja y `create` de la nueva, partiendo de su definición viva (la de 20260923100000, que firma con
--      `fn_actor_persona_id(true)`). Se conservan quién firma, el candado de ubicación y que NO exige módulo (cualquiera que
--      opera la sede anota). Rechazos nuevos, con hint estable: `pedido_motivo_invalido`, `pedido_razon_sin_se_probo` y
--      `pedido_razon_invalida`.
--   3. (PARTE 3, EN ESPERA) `venta_items.es_regalo boolean not null default false` (D-7): la marca por prenda vendida.
--      Toda venta de hoy queda como «no es regalo», y nada la escribe todavía (ver «EN ESPERA» abajo).
--   4. (PARTE 4, EN ESPERA) `fn_clienta_compras` devuelve `es_regalo`. Cambia su tipo de retorno: `drop` y `create`, con la misma lectura, el
--      mismo candado del módulo «Clientas» y los mismos permisos (EXECUTE solo para `authenticated`).
--
-- REGLA DE NEGOCIO QUE ESTO DEJA ESCRITA (ADR-0288 D-6, «SE ROMPE SI»): «Llegó tu talla» (paso 3, todavía no existe)
--   avisa SOLO por `motivo = 'no_habia_talla'`. Una fila `se_probo_no_llevo` es demanda para Compras y el Taller, no un
--   pedido de ella: la prenda sí estaba, se la probó y no la quiso, y avisarle «llegó tu talla» de algo que no pidió es un
--   mensaje equivocado. Por lo mismo, el conteo de «pedidos pendientes» de Inicio y de Análisis cuenta solo
--   `no_habia_talla` (apps/web/lib/inicio.ts y app/(app)/inventario/resumen): es lo que esas tarjetas siempre dijeron.
--
-- DECIDÍ: una sola tabla para las dos señales (D-6). El informe «Tallas y prendas que faltaron» (CL-14) lee un solo lugar.
-- DECIDÍ: `p_motivo` y `p_razon` van AL FINAL, con default. La web vieja (y una pestaña abierta antes del despliegue)
--   sigue llamando con 5 parámetros y la base resuelve la firma nueva: nadie queda sin poder anotar entre el pegado y el
--   despliegue.
-- DECIDÍ: los rechazos nuevos son `raise exception` comunes (P0001) con hint: `traducirError` muestra su mensaje tal cual,
--   sin tocar `error-escritura.ts`.
-- DECIDÍ: el candado de la razón está en el esquema (`pedidos_no_atendidos_razon_solo_si_se_probo`), no solo en la función:
--   un insert directo de un superusuario tampoco puede dejar «no había talla · por el precio» (principio 2).
-- DESCARTÉ: una tabla `senales_clienta` aparte (dos lugares para la misma pregunta de Compras, D-6); una razón libre en
--   texto (no se puede contar: CL-14 agrupa por razón); `es_regalo` en `ventas` (una misma compra lleva prendas para ella y
--   para regalar: la marca es por prenda, D-7); exigir clienta para anotar «se la probó» (sin clienta sigue siendo demanda
--   para Compras, D-6).
-- SE ROMPE SI: alguien arma «Llegó tu talla» sin filtrar `motivo = 'no_habia_talla'`; o una función nueva escribe en
--   `pedidos_no_atendidos` sin pasar por `registrar_pedido_no_atendido` (el esquema igual rechaza motivo y razón fuera de la
--   lista). Lo vigila scripts/pruebas/club_regalo_y_se_probo.mjs.
--
--
-- «ES PARA REGALO» ESTÁ EN ESPERA (2026-09-30). El spike aprobado del club (docs/maquetas/club-clientas-spike-2026-09,
--   README, punto 8) sacó «¿Es para regalo?» de la línea del ticket, y Felipe decide si la marca se queda. Por eso todo lo de
--   `es_regalo` vive en las PARTES 3 y 4, que se pueden pegar o no sin tocar las PARTES 1 y 2: la 3 solo agrega la columna
--   (false para todo) y la 4 solo hace que la ficha la lea. Nada escribe `es_regalo` todavía: `registrar_venta` (la de la
--   1c) no la conoce y la deja en false. Si la marca se queda, una migración nueva le enseña a `registrar_venta` a leer
--   `(v_item ->> 'es_regalo')::boolean` de `p_items`, sin cambiar su firma (con un reemplazo anclado sobre la definición de
--   la 1c, md5 normalizado `2b55a94a754e7708f5b133008f30469f`). Si sale, se borran las PARTES 3 y 4 antes de pegarlas.
--
-- CANDADO DE VERSIÓN. La sección 0 de esta parte (y la de la PARTE 4) compara el md5 NORMALIZADO (sin comentarios ni
-- espacios) del cuerpo vivo de la función que reescribe con el de producción (medido en producción el 2026-09-30) o con
-- el de después de este archivo. Con cualquier otro, aborta sin tocar nada. También aborta si falta la parte anterior.
--
-- CÓMO SE PEGA EN PRODUCCIÓN — CUATRO ARCHIVOS, CADA UNO SOLO EN EL SQL EDITOR, EN ORDEN (el SQL Editor corre todo lo
-- pegado en UNA transacción), DESPUÉS de las tres partes de la 1c:
--   · PARTE 1 = 20260930240000_club_paso1d_parte1_pedidos.sql: solo `pedidos_no_atendidos` (el `alter`).
--   · PARTE 2 = este archivo: `registrar_pedido_no_atendido` con motivo y razón. No toma ninguna tabla en exclusiva.
--   · PARTE 3 = 20260930240200_club_paso1d_parte3_regalo_venta_items.sql: solo `venta_items` (el `alter`). EN ESPERA.
--   · PARTE 4 = 20260930240300_club_paso1d_parte4_regalo_ficha.sql: `fn_clienta_compras` con `es_regalo`. EN ESPERA.
--   Por qué partes: toda venta escribe en `venta_items`, y una transacción que la tomara junto con `pedidos_no_atendidos`
--   podía quedar en cruz con algo que lee las dos (`fn_producto_historia`, la historia de un producto) y cortarse con
--   40P01. Cada parte toma una sola tabla en uso (o ninguna) y no puede trabarse con nadie; las funciones van después de
--   sus columnas. Cada parte espera como mucho 3 s un candado (`lock_timeout`): si la tienda está usando esa tabla, falla
--   limpio y se vuelve a pegar ESA parte. Las cuatro se pueden pegar dos veces (idempotentes). En local y en el CI corren
--   seguidas. Entre las partes, vender y anotar funcionan igual. Fusionar el PR de la web DESPUÉS de pegar las partes
--   1 y 2 (y la 3 y la 4 si «es para regalo» se queda: la ficha lee `es_regalo` y, sin la columna, la toma como false).
--
-- VERIFICACIÓN (solo lectura, después de pegar):
--   select p.oid::regprocedure, md5(regexp_replace(regexp_replace(regexp_replace(p.prosrc, '/\*.*?\*/', '', 'g'),
--          '--[^' || chr(10) || ']*', '', 'g'), '\s+', '', 'g'))
--     from pg_proc p
--    where p.pronamespace = 'retail'::regnamespace
--      and p.proname in ('registrar_pedido_no_atendido', 'fn_clienta_compras')
--    order by 1;
--   → una sola firma de registrar_pedido_no_atendido (la de 7 parámetros) con su md5 «después» de esta parte, y
--     fn_clienta_compras con el «después» de la PARTE 4 si se pegó (si no, el «antes»); y
--   select count(*) from retail.pedidos_no_atendidos where motivo <> 'no_habia_talla';   → 0 (lo de antes quedó igual)
--
-- CONCURRENCIA. Anotar no bloquea nada: es un insert suelto, sin leer otras filas. Dos cajas que anotan la misma prenda a
--   la vez dejan dos filas, y está bien: son dos señales de demanda.
-- CAÍDA EXTERNA. Nada de esto llama a SUNAT/Lucode, al padrón ni a WhatsApp. Sin conexión, anotar falla con el mensaje de
--   siempre y el ticket sigue igual: la pregunta es opcional y no frena la venta.
-- ============================================================================

-- ============================== PARTE 2 · «se la probó y no la llevó» ==============================
set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 0. candado de versión ----------
do $guarda$
declare
  r record;
  v_md5 text;
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'retail' and table_name = 'pedidos_no_atendidos' and column_name = 'motivo') then
    raise exception 'Falta la PARTE 1 de esta migración (pedidos_no_atendidos.motivo): pégala antes que esta.';
  end if;
  for r in
    select * from (values
      -- firma                                                                   antes (producción, 2026-09-30)      despues (este archivo)
      ('retail.registrar_pedido_no_atendido(uuid,uuid,text,text,uuid)',           '750b65e98c09826228ba5f72b7800391', null),
      ('retail.registrar_pedido_no_atendido(uuid,uuid,text,text,uuid,text,text)', null,                               'b48f006fb8336ea27fb9e2929343d10d')
    ) as t(firma, antes, despues)
  loop
    select md5(regexp_replace(regexp_replace(regexp_replace(p.prosrc, '/\*.*?\*/', '', 'g'), '--[^' || chr(10) || ']*', '', 'g'), '\s+', '', 'g'))
      into v_md5
      from pg_proc p
     where p.oid = to_regprocedure(r.firma);
    if v_md5 is null then
      -- Que no exista es «después» para la firma vieja (este archivo la suelta) y «antes» para la nueva.
      if r.antes is not null and r.despues is not null then
        raise exception '% no existe en esta base: pega antes las migraciones de Clientas (20260928190000).', r.firma;
      end if;
    elsif v_md5 is distinct from r.antes and v_md5 is distinct from r.despues then
      raise exception '% cambió desde que se escribió esta migración (md5 normalizado %; se esperaba % —antes— o % —después—). No se reemplaza a ciegas: lee su definición viva y rehace este cambio sobre ESA versión.',
        r.firma, v_md5, coalesce(r.antes, 'que no exista'), coalesce(r.despues, 'que ya no exista');
    end if;
  end loop;
end
$guarda$;

-- ---------- 1. registrar_pedido_no_atendido con motivo y razón ----------
-- La firma cambia: se suelta la vieja (5 parámetros) y se crea la nueva. Un `create or replace` con otros parámetros
-- crearía una SOBRECARGA, y una llamada con 5 argumentos no sabría a cuál ir.
drop function if exists retail.registrar_pedido_no_atendido(uuid, uuid, text, text, uuid);

create or replace function retail.registrar_pedido_no_atendido(
  p_ubicacion_id uuid,
  p_producto_id uuid default null,
  p_descripcion_libre text default null,
  p_talla text default null,
  p_clienta_id uuid default null,
  p_motivo text default 'no_habia_talla',
  p_razon text default null
)
returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_descripcion text := nullif(btrim(coalesce(p_descripcion_libre, '')), '');
  v_talla text := nullif(btrim(coalesce(p_talla, '')), '');
  -- Vacío o nulo = el motivo de siempre: la llamada vieja (sin motivo) sigue anotando «buscó y no había».
  v_motivo text := coalesce(nullif(btrim(coalesce(p_motivo, '')), ''), 'no_habia_talla');
  v_razon text := nullif(btrim(coalesce(p_razon, '')), '');
  v_persona uuid;
  v_id uuid;
begin
  -- CANDADO DE UBICACIÓN PRIMERO (mismo criterio que la ronda de candados del 20260921): el
  -- parámetro ya trae la ubicación, así que no hace falta mirar nada más para decidir el permiso.
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para anotar pedidos en esa ubicación';
  end if;
  -- ADR-0288 D-6: dos motivos, y la razón solo cuando se la probó y no la llevó. El esquema lo exige igual; aquí se
  -- rechaza antes, con un mensaje que la asesora entiende.
  if v_motivo not in ('no_habia_talla', 'se_probo_no_llevo') then
    raise exception 'Ese motivo no existe: se anota «buscó y no había» o «se la probó y no la llevó».'
      using hint = 'pedido_motivo_invalido';
  end if;
  if v_razon is not null and v_motivo <> 'se_probo_no_llevo' then
    raise exception 'La razón solo se anota cuando se la probó y no la llevó.'
      using hint = 'pedido_razon_sin_se_probo';
  end if;
  if v_razon is not null and v_razon not in ('no_le_quedo', 'precio', 'color', 'lo_piensa') then
    raise exception 'Esa razón no existe: no le quedó, el precio, el color o lo va a pensar.'
      using hint = 'pedido_razon_invalida';
  end if;
  if p_producto_id is null and v_descripcion is null then
    raise exception 'Anota el modelo del catálogo o describe lo que pidió la clienta';
  end if;
  if p_producto_id is not null and not exists (select 1 from productos where id = p_producto_id) then
    raise exception 'Ese producto no existe en el catálogo';
  end if;
  v_persona := retail.fn_actor_persona_id(true);
  if v_persona is null then
    raise exception 'No se encontró tu ficha de colaborador';
  end if;

  insert into pedidos_no_atendidos (ubicacion_id, producto_id, descripcion_libre, talla, clienta_id, atendido_por, motivo, razon)
    values (p_ubicacion_id, p_producto_id, v_descripcion, v_talla, p_clienta_id, v_persona, v_motivo, v_razon)
    returning id into v_id;
  return v_id;
end;
$$;

comment on function retail.registrar_pedido_no_atendido(uuid, uuid, text, text, uuid, text, text) is
  'ADR-0152 + ADR-0288 D-6: anota lo que una clienta quería y no se llevó. p_motivo = no_habia_talla (default: buscó y no había) o se_probo_no_llevo (se la probó y no la llevó, con p_razon opcional: no_le_quedo, precio, color, lo_piensa). Firma el responsable del combo (fn_actor_persona_id(true)); exige poder operar la sede, no un módulo.';

revoke all on function retail.registrar_pedido_no_atendido(uuid, uuid, text, text, uuid, text, text) from public, anon;
grant execute on function retail.registrar_pedido_no_atendido(uuid, uuid, text, text, uuid, text, text) to authenticated;

reset lock_timeout;
notify pgrst, 'reload schema';
-- ============================== FIN DE LA PARTE 2 ==============================
