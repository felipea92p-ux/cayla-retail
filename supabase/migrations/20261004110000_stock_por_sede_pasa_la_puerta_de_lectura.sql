-- ============================================================================
-- 20261004110000_stock_por_sede_pasa_la_puerta_de_lectura.sql — CAYLA V2 · ADR-0289 (segunda tanda)
-- `fn_stock_por_sede()` deja de tener su propia puerta y usa la de todas las lecturas de retail, que ya conoce a las
-- terminales.
--
-- EL PROBLEMA PRIMERO. Una terminal (ADR-0162) es una cuenta de Auth sin persona ni colaborador. El 2026-09-30 el ADR-0289
-- le enseñó a `fn_tiene_acceso_retail()` a reconocerla (`20260930050000`), pero `fn_stock_por_sede()` nunca la usó: desde
-- ADR-0270 (`20260929020000`, sección C) conserva SU PROPIA puerta —«persona activa con colaborador activo», escrita a
-- mano dentro de un `exists (…)`—. Para una terminal esa puerta no se abre y la función devuelve CERO FILAS SIN ERROR;
-- `fn_stock_por_sede_json()` (que la empaqueta) devuelve `[]`. Vender («Dónde más hay», `leerStockDeLasSedes` en
-- `lib/inventario-v2.ts`), Cambios, Apartados y «Pedir a otra sede» leen esa lista: con una terminal la leen vacía y se
-- ven como «ninguna otra sede tiene stock». No avisa nada, que es lo peor: una prenda que SÍ está en Lima se le ofrece al
-- cliente como agotada. El rol `terminal_administrativa` trae el módulo Traslados (`20260923030000`), y las terminales
-- de ventas viven en Vender: son justo quienes más preguntan «¿dónde más hay?».
--
-- POR QUÉ ES LA MISMA CAUSA QUE EL ADR-0289 Y NO OTRA. La puerta es una sola idea («esta sesión es un actor activo de
-- retail») y estaba escrita dos veces: una en `fn_tiene_acceso_retail()` (arreglada) y una copiada a mano en esta función
-- (olvidada). Se midió en la base con todas las migraciones y en producción (2026-10-04, md5 de cada cuerpo idéntico en las
-- dos): de las 11 funciones de `retail` que mezclan `colaboradores` con `auth_user_id = auth.uid()`, cuatro ya conocen la
-- terminal (`fn_actor_persona_id`, `fn_mi_rol_id`, `fn_persona_actual_resumen`, `fn_ubicacion_actual_persona`), una ES la
-- puerta, y las que quedan fuera lo hacen A PROPÓSITO: `fn_es_lider`, `fn_es_admin` (una terminal no es líder, ADR-0161/0178),
-- `fn_colaboradores` (solo quien gestiona colaboradores), `fn_mi_perfil` (el perfil de una PERSONA: la terminal no tiene) y
-- `fn_compras_ubicaciones` (ya trae a la terminal por `fn_ubicacion_actual_persona`, ADR-0184). Esta es la única LECTURA de
-- la red con puerta propia. Un barrido de las 71 funciones `fn_*` de lectura sin argumentos (líder contra terminal, en la
-- base local con el seed) lo confirma: `fn_stock_por_sede` es la única que da filas al líder (96) y 0 a la terminal en
-- silencio; las demás que le dan 0 o un 42501 son candados de rol o de dinero a propósito (`fn_puede_*`, `fn_es_lider`). La prueba nueva (`pnpm pruebas:terminales-red`) deja ese inventario escrito para que la próxima
-- función que copie la puerta la ponga en rojo en vez de pasar semanas dando `[]`.
--
-- QUÉ CAMBIA. Un solo reemplazo: el `exists (select 1 from colaboradores … personas …)` pasa a ser
-- `retail.fn_tiene_acceso_retail()`. Es la misma pregunta para una persona (persona activa con colaborador activo: el
-- cuerpo de la puerta tiene las mismas condiciones) y, además, deja pasar a una terminal activa de una sede activa.
--
-- QUÉ NO CAMBIA (y por qué esto no abre de más).
--   · El resto del cuerpo es el de ADR-0270, línea por línea: lo disponible de `fn_existencias_base(null, null)`, sin
--     tallas retiradas, solo > 0, solo sedes activas. Mismas columnas, mismo orden, mismo `security definer`, mismo
--     `search_path`, mismos permisos (`create or replace` conserva el ACL: {postgres, authenticated}).
--   · Lo que ve una cuenta en la web lo sigue decidiendo su ROL (ADR-0161): esto solo hace que la base responda lo mismo
--     que la web ya promete. La lista es cifras por prenda y sede (variante, sede, cantidad): sin dinero, sin personas.
--   · Quien NO pasa la puerta sigue sin ver nada: una terminal desactivada o de una sede apagada, una persona de Dynamic sin
--     colaborador, una colaboradora con el alta pendiente, una cuenta de Auth sin persona ni terminal, y quien no tiene
--     sesión.
--
-- COSTO. Nada que medir contra la cifra de ADR-0270: la puerta nueva no tiene variables de la consulta, así que Postgres la
-- evalúa UNA vez por llamada (un filtro de una sola vez sobre el plan, no una vez por fila de stock); la prueba lo
-- comprueba contando las llamadas a la puerta con `pg_stat_xact_user_functions` (una sola por consulta).
--
-- PRODUCCIÓN (POR PEGAR — necesita el OK de Felipe; ver `docs/backlog/2026-10-04-frosty-bartik-ad6e8f.md`).
--   Es un solo `create or replace function` más un `comment on function`: no crea políticas ni toca tablas, así que no toma
--   los bloqueos de `auth`/`storage` (ADR-0195) y se pega en el SQL Editor sin partirla en PARTES. La web NO cambia:
--   `lib/inventario-v2.ts` ya tolera la lista vacía y seguirá leyendo lo mismo (ahora, con filas, también para terminales).
--   Antes de pegar (producción, solo lectura):
--     select md5(prosrc) from pg_proc where oid = 'retail.fn_stock_por_sede()'::regprocedure;
--       → `19273e623fa7554c4cf8c0b3986fbb0e` (el de 20260929020000; verificado igual en producción el 2026-10-04).
--     select md5(prosrc) from pg_proc where oid = 'retail.fn_tiene_acceso_retail()'::regprocedure;
--       → `709e77234c9ec6f3877fef5b30f7bf49` (la de ADR-0289, que ya conoce la terminal; verificado igual el 2026-10-04).
--   Después de pegar, el primero debe dar `b7396e8adcf99dba24dc7fb71fbd0211`.
--
-- GUARDIA. Antes de reemplazar compara el md5 del cuerpo vivo de `fn_stock_por_sede` con el de producción (consultado el
-- 2026-10-04) y con el de este archivo; si es otro, alguien la cambió en vivo y se detiene sin tocar nada. También exige
-- que la puerta ya conozca la terminal (si no, esta función quedaría igual de vacía para una terminal). Se puede pegar
-- dos veces.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

do $$
declare
  v_md5 text;
  v_puerta text;
begin
  select p.prosrc into v_puerta from pg_proc p where p.oid = to_regprocedure('retail.fn_tiene_acceso_retail()');
  if v_puerta is null then
    raise exception 'fn_tiene_acceso_retail() no está en la base: pega antes 20260922170000_alta_colaborador_requiere_aprobacion.sql.';
  end if;
  if v_puerta !~ 'fn_terminal_actual' then
    raise exception 'La puerta fn_tiene_acceso_retail() todavía no reconoce a las terminales: pega antes 20260930050000_terminales_pasan_la_puerta_de_lectura.sql (si no, fn_stock_por_sede seguiría vacía para una terminal).';
  end if;
  select md5(p.prosrc) into v_md5 from pg_proc p where p.oid = to_regprocedure('retail.fn_stock_por_sede()');
  if v_md5 is null then
    raise exception 'fn_stock_por_sede() no está en la base: pega antes 20260929020000_catalogo_y_otras_sedes_leen_la_cifra_unica.sql.';
  end if;
  if v_md5 not in ('19273e623fa7554c4cf8c0b3986fbb0e', 'b7396e8adcf99dba24dc7fb71fbd0211') then
    raise exception 'fn_stock_por_sede() tiene otro cuerpo (md5 %): no es la de 20260929020000 ni la de este archivo. Alguien la cambió en vivo: reescribe desde su definición real antes de pegar.', v_md5;
  end if;
end $$;

create or replace function retail.fn_stock_por_sede()
returns table (variante_id uuid, ubicacion_id uuid, cantidad integer)
language sql stable security definer
set search_path = retail, public, extensions
as $$
  -- ADR-0270: lo que otra sede puede ofrecer de verdad. Sin Cuarentena, sin apartadas, sin tallas retiradas, sin
  -- pruebas ni «Monto manual». Antes: `sum(stock.cantidad)` físico. Solo sedes activas, como antes.
  -- Solo lo que es > 0: la web ya ignoraba los ceros (`agruparStockPorSede`: «una sede que suma cero no se nombra») y
  -- `fn_stock_por_sede_json` los empaquetaba todos en un solo JSON que Vender descarga al abrir.
  -- ADR-0289: la puerta es la de todas las lecturas de retail (persona activa con colaborador activo, o terminal activa).
  select e.variante_id, e.ubicacion_id, e.disponible as cantidad
  from fn_existencias_base(null, null) e
  join ubicaciones u on u.id = e.ubicacion_id and u.activo
  where not e.talla_retirada
    and e.disponible > 0
    and retail.fn_tiene_acceso_retail();
$$;

comment on function retail.fn_stock_por_sede() is
  'Cantidades disponibles por prenda y sede (solo ubicaciones activas, sin tallas retiradas, solo > 0) para cualquier cuenta con acceso a retail: una persona con colaborador activo o una terminal activa (ADR-0289, retail.fn_tiene_acceso_retail()). Solo lectura; no amplía stock_select.';
