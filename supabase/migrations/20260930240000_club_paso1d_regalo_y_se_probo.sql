-- ============================================================================
-- 20260930240000_club_paso1d_regalo_y_se_probo.sql — CAYLA V2 · Club de clientas · paso 1, tanda 1d
-- ADR-0288 (DECISIÓN 6, DECISIÓN 7 y «Actualización 2026-09-30 (e): tanda 1d»); acta
-- docs/datos/DECISIONES-2026-09-29-club-clientas.md (CL-7, CL-14) y D-101. UNA SOLA PARTE: sin políticas ni `drop trigger`
-- (CLAUDE.md, «Políticas y deadlocks»). Va DESPUÉS de la tanda 1c (20260930230000/230100).
--
-- EL PROBLEMA. Dos señales de la clienta se perdían o mentían:
--   · «Se la probó y no la llevó» no quedaba en ningún lado. Compras solo veía «buscó y no había» (`pedidos_no_atendidos`,
--     ADR-0152), y la pregunta de Compras y del Taller es una sola: ¿qué querían y no se llevaron? (CL-14).
--   · Una blusa talla S comprada para regalar a la hermana se volvía «su talla» en la ficha (D-101): `deducirTallas`
--     (apps/web/lib/clienta-actividad-reglas.ts) no tenía cómo saber que esa prenda no era para ella («LÍMITE CONOCIDO
--     (v1)» de ese archivo).
--
-- QUÉ HACE
--   1. `pedidos_no_atendidos` suma `motivo` (`no_habia_talla` por defecto, así que TODO lo de hoy queda como «buscó y no
--      había»; o `se_probo_no_llevo`) y `razon` (opcional, solo con `se_probo_no_llevo`: `no_le_quedo`, `precio`, `color` o
--      `lo_piensa`). Candados en el esquema: el motivo es uno de los dos, y una razón sin «se la probó» es imposible.
--   2. `registrar_pedido_no_atendido` recibe `p_motivo` y `p_razon` al final, con los defaults de hoy: la llamada vieja
--      (5 parámetros: «Anotar que no había» del modal de talla y de Cambios) sigue igual. Cambia de firma: `drop` de la
--      vieja y `create` de la nueva, partiendo de su definición viva (la de 20260923100000, que firma con
--      `fn_actor_persona_id(true)`). Se conservan quién firma, el candado de ubicación y que NO exige módulo (cualquiera que
--      opera la sede anota). Rechazos nuevos, con hint estable: `pedido_motivo_invalido`, `pedido_razon_sin_se_probo` y
--      `pedido_razon_invalida`.
--   3. `venta_items.es_regalo boolean not null default false` (D-7): la marca por prenda vendida. Toda venta de hoy queda
--      como «no es regalo». Quién la escribe: `registrar_venta`, en la FASE B de esta tanda (cuando la 1c esté en su lugar;
--      ver «Lo que falta» abajo). Mientras tanto la columna existe y vale false: nada cambia para nadie.
--   4. `fn_clienta_compras` devuelve `es_regalo`. Cambia su tipo de retorno: `drop` y `create`, con la misma lectura, el
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
-- LO QUE FALTA (FASE B de la tanda 1d): que `registrar_venta` guarde `es_regalo` desde `p_items`
--   (`(v_item ->> 'es_regalo')::boolean`), sin cambiar su firma. Espera a la 1c, que reescribe `registrar_venta` con
--   `p_canjear_cumpleanos` y `descuento_club_unitario`: se hace sobre ESA definición, con un reemplazo anclado y su md5.
--
-- CANDADO DE VERSIÓN. La sección 0 compara el md5 NORMALIZADO (sin comentarios ni espacios) del cuerpo vivo de las dos
-- funciones que reescribe con el de producción (el que dejaron 20260923100000 y 20260928190000; comprobado en una base
-- armada con todas las migraciones del repo) o con el de después de este archivo. Con cualquier otro, aborta sin tocar nada.
--
-- CÓMO SE PEGA EN PRODUCCIÓN. Este archivo, solo, en el SQL Editor (corre en UNA transacción), DESPUÉS de las de la 1c. Se
--   puede pegar dos veces (idempotente). Espera como mucho 3 s un candado (`lock_timeout`): si la tienda está vendiendo en
--   ese instante (toma `venta_items`), falla limpio y se vuelve a pegar. No mezcla `alter` con políticas: no hay políticas.
--   Orden de las tablas: primero `venta_items`, después `pedidos_no_atendidos`, y recién después las funciones. Así nada
--   espera en cruz: lo único que lee las dos es `fn_producto_historia` (la historia de un producto), y las lee en ESE orden;
--   ninguna venta toca `pedidos_no_atendidos`, y quien anota un pedido no toca `venta_items`. Al revés, una historia abierta
--   justo al pegar podía quedar esperando `pedidos_no_atendidos` con `venta_items` tomado, y Postgres cortaba una de las dos
--   (40P01).
--   Fusionar el PR DESPUÉS de pegar: la web nueva lee `es_regalo` y `motivo`.
--
-- VERIFICACIÓN (solo lectura, después de pegar):
--   select p.oid::regprocedure, md5(regexp_replace(regexp_replace(regexp_replace(p.prosrc, '/\*.*?\*/', '', 'g'),
--          '--[^' || chr(10) || ']*', '', 'g'), '\s+', '', 'g'))
--     from pg_proc p
--    where p.pronamespace = 'retail'::regnamespace
--      and p.proname in ('registrar_pedido_no_atendido', 'fn_clienta_compras')
--    order by 1;
--   → exactamente 2 filas (una sola firma de registrar_pedido_no_atendido, la de 7 parámetros), con su md5 «después»; y
--   select count(*) from retail.pedidos_no_atendidos where motivo <> 'no_habia_talla';   → 0 (lo de antes quedó igual)
--   select column_default from information_schema.columns
--    where table_schema = 'retail' and table_name = 'venta_items' and column_name = 'es_regalo';   → false
--
-- CONCURRENCIA. Anotar no bloquea nada: es un insert suelto, sin leer otras filas. Dos cajas que anotan la misma prenda a
--   la vez dejan dos filas, y está bien: son dos señales de demanda.
-- CAÍDA EXTERNA. Nada de esto llama a SUNAT/Lucode, al padrón ni a WhatsApp.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- ---------- 0. candado de versión ----------
do $guarda$
declare
  r record;
  v_md5 text;
begin
  for r in
    select * from (values
      -- firma                                                                   antes (producción)                  despues (este archivo)
      ('retail.registrar_pedido_no_atendido(uuid,uuid,text,text,uuid)',           '750b65e98c09826228ba5f72b7800391', null),
      ('retail.registrar_pedido_no_atendido(uuid,uuid,text,text,uuid,text,text)', null,                               'b48f006fb8336ea27fb9e2929343d10d'),
      ('retail.fn_clienta_compras(uuid)',                                         '4e70112f67b81461aad1fc813bdd057e', 'dbe1a8808f4c1d4fef7ed7bc7d5e4344')
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

-- ---------- 1. la prenda para regalo (D-7) ----------
-- PRIMERO `venta_items`, después `pedidos_no_atendidos` (ver «Cómo se pega»): toda venta toma `venta_items`, y el candado
-- corto no la hace esperar más que el instante del `alter`.
alter table retail.venta_items add column if not exists es_regalo boolean not null default false;

comment on column retail.venta_items.es_regalo is
  'ADR-0288 D-7 (D-101): esta prenda es para regalar, no para la clienta del ticket. La ficha no deduce su talla de ella (deducirTallas la salta). Se marca por línea solo si hay clienta elegida; la guarda registrar_venta desde p_items.';

-- ---------- 2. «buscó y no había» y «se probó y no llevó»: la misma tabla (D-6) ----------
-- `add column ... default` con una constante no reescribe la tabla (Postgres 11+): toda fila de hoy queda `no_habia_talla`.
alter table retail.pedidos_no_atendidos add column if not exists motivo text not null default 'no_habia_talla';
alter table retail.pedidos_no_atendidos add column if not exists razon text;

alter table retail.pedidos_no_atendidos drop constraint if exists pedidos_no_atendidos_motivo_valido;
alter table retail.pedidos_no_atendidos add constraint pedidos_no_atendidos_motivo_valido
  check (motivo in ('no_habia_talla', 'se_probo_no_llevo'));

-- La razón solo existe cuando se la probó y no la llevó, y es una de cuatro (se cuentan en el informe CL-14).
alter table retail.pedidos_no_atendidos drop constraint if exists pedidos_no_atendidos_razon_solo_si_se_probo;
alter table retail.pedidos_no_atendidos add constraint pedidos_no_atendidos_razon_solo_si_se_probo
  check (razon is null or (motivo = 'se_probo_no_llevo' and razon in ('no_le_quedo', 'precio', 'color', 'lo_piensa')));

comment on column retail.pedidos_no_atendidos.motivo is
  'ADR-0288 D-6: no_habia_talla = pidió y esta sede no la tenía (todo lo anotado antes de la tanda 1d); se_probo_no_llevo = la prenda estaba, se la probó y no la llevó. «Llegó tu talla» (paso 3) avisa SOLO por no_habia_talla.';
comment on column retail.pedidos_no_atendidos.razon is
  'Solo con se_probo_no_llevo, opcional: no_le_quedo, precio, color o lo_piensa (CL-14: «Tallas y prendas que faltaron» las cuenta).';

-- ---------- 3. registrar_pedido_no_atendido con motivo y razón ----------
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

-- ---------- 4. fn_clienta_compras devuelve es_regalo ----------
-- Cambia el tipo de retorno: Postgres no deja hacerlo con `create or replace`, así que se suelta y se crea. La lectura es la
-- de 20260928190000 más `vi.es_regalo`: el mismo candado del módulo, las mismas ventas (completadas, en cualquier sede).
drop function if exists retail.fn_clienta_compras(uuid);

create or replace function retail.fn_clienta_compras(p_id uuid)
returns table (
  venta_id uuid, fecha timestamptz, ubicacion text, categoria text, talla text,
  cantidad integer, subtotal numeric, es_regalo boolean
)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  -- Solo con el módulo «Clientas» (42501 clientas_sin_modulo). Va primero: si falla, no se lee nada.
  select retail.fn_exigir_modulo('clientas');

  select v.id, v.created_at, u.nombre, cat.nombre, ta.valor, vi.cantidad, vi.subtotal, vi.es_regalo
  from retail.ventas v
  join retail.ubicaciones u on u.id = v.ubicacion_id
  join retail.venta_items vi on vi.venta_id = v.id
  join retail.variantes va on va.id = vi.variante_id
  join retail.productos pr on pr.id = va.producto_id
  left join retail.categorias cat on cat.id = pr.categoria_id
  left join retail.tallas ta on ta.id = va.talla_id
  where v.cliente_id = p_id and v.estado = 'completada'
  order by v.created_at desc;
$$;

comment on function retail.fn_clienta_compras(uuid) is
  'Una fila por prenda comprada por esta clienta, en cualquier sede (security definer, ver cabecera de 20260928180000). Base de "talla deducida por tipo de prenda" (D-101, que salta las prendas con es_regalo: ADR-0288 D-7) y "te falta N para frecuente" (D-103) — el cálculo vive en TypeScript, esta función solo entrega los hechos.';

revoke execute on function retail.fn_clienta_compras(uuid) from public, anon;
grant execute on function retail.fn_clienta_compras(uuid) to authenticated;
