-- ============================================================================
-- 20261001100200_frescura_decisiones_en_eliminar.sql — CAYLA V2 · ADR-0208 «Frescura del piso» · paso 4b, PARTE 3 de 3.
-- «Eliminar un producto con su historia» (ADR-0252, en producción) aprende que la libreta de «Ya decidí» existe.
-- Va DESPUÉS de 20261001100000 (la tabla). No depende de la parte 2.
--
-- EL PROBLEMA PRIMERO. `eliminar_producto_con_historia` está escrita para FALLAR ENTERA cuando una tabla nueva cita al
-- producto y ella no la conoce: su bloque `foreign_key_violation` responde «otra parte del sistema todavía lo usa». Es una
-- red de seguridad buena, y con esta tabla se dispara siempre: desde el primer «Ya decidí» del piloto en Trujillo, ningún
-- Admin podría eliminar ese producto de prueba (y la purga, `scripts/purga/purgar-producto-de-prueba.sql`, tampoco). Peor:
-- `fn_producto_se_puede_eliminar` (el Líder, sin historia) diría «puedes» y después la llave lo rechazaría.
--
-- QUÉ ES UNA DECISIÓN, PARA ESTE EFECTO. Una anotación de la tienda sobre su propio piso: no hay una clienta, un proveedor,
-- otra sede ni dinero del otro lado (una decisión «La trasladé» cita un traslado, pero el traslado es el documento y él sí
-- frena el borrado por su cuenta: `transferencia_items`). Por eso entra como historia «de stock»: `borrable = true`, la
-- misma clase que un conteo o una bajada al piso. Se respalda en `respaldo_purgas.filas` y se borra dentro de la transacción
-- de la función, con su disparador apagado SOLO ahí (`frescura_decisiones_inmutable`) y vuelto a encender antes de terminar
-- (la función ya comprueba que cada candado volvió a su modo).
--
-- CÓMO: PARCHE POR ANCLA, NO REESCRITURA. No copio las dos funciones enteras: cambio SOBRE SU DEFINICIÓN VIVA con los trozos
-- exactos de abajo (`pg_temp.reemplazar_vivo`, como 20260923130000). Reescribirlas desde el texto de 20260928230000 habría
-- borrado en silencio cualquier parche que alguien les haya puesto en producción (le pasó a Análisis con el PR 397; el 29 % de
-- las funciones de producción tiene un cuerpo distinto del repo). Con anclas, un parche ajeno no molesta; y si una ancla ya no
-- aparece exactamente una vez, la migración ABORTA entera sin tocar nada y dice cuál. Si ya está aplicada, no hace nada.
--
-- LO QUE CAMBIA EN CADA FUNCIÓN:
--   fn_producto_historia(uuid)  → un renglón más (19, «decisiones de Frescura», borrable).
--   eliminar_producto_con_historia(uuid) → (1) el candado `frescura_decisiones_inmutable` entra a la lista de los que se apagan
--     y se vuelven a encender, (2) la tabla entra al candado de tabla (`lock table … share row exclusive`) junto a las otras
--     tres, (3) sus filas se respaldan, (4) se borran ANTES que las variantes y el producto (hijos primero).
--
-- CÓMO SE PEGA EN PRODUCCIÓN. Sola, tal cual (trae `retail.` y su `set search_path`), después de la parte 1. Solo funciones:
-- sin políticas, sin `drop trigger`, sin `alter` de tablas en uso. Con `lock_timeout` de 3 s. Re-ejecutable.
--
-- VERIFICACIÓN después de pegar (solo lectura; tiene que dar exactamente esto):
--   select proname, position('frescura_decisiones' in prosrc) > 0 as conoce_la_libreta from pg_proc
--    where pronamespace = 'retail'::regnamespace and proname in ('fn_producto_historia', 'eliminar_producto_con_historia') order by 1;
--     eliminar_producto_con_historia | t
--     fn_producto_historia           | t
--
-- SE ROMPE SI:
--   · alguien reescribe una de las dos funciones desde una migración anterior (recrea el cuerpo sin la libreta): el borrado
--     vuelve a fallar con «otra parte del sistema todavía lo usa». Lo vigila la prueba T8 (eliminar con una decisión).
--   · otra tabla nueva cita `productos` y nadie enseña a estas funciones: pasa lo mismo con ESA tabla. La red de seguridad
--     `foreign_key_violation` es la que avisa; esta migración es lo que se hace cuando salta.
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

do $$
begin
  if to_regclass('retail.frescura_decisiones') is null then
    raise exception 'Falta la libreta: pega antes 20261001100000_frescura_decisiones_tabla.sql.';
  end if;
  if to_regprocedure('retail.fn_producto_historia(uuid)') is null or to_regprocedure('retail.eliminar_producto_con_historia(uuid)') is null then
    raise exception 'Faltan fn_producto_historia o eliminar_producto_con_historia: pega antes 20260928230000_eliminar_producto_con_historia.sql.';
  end if;
end $$;

-- `pg_temp.reemplazar_vivo` NO se vuelve a definir aquí: 20260923130000_abrir_modulos_a_los_roles.sql ya la crea con la
-- misma firma más un `p_opcional` (default false) para las 4 posiciones que esta migración usa — definirla dos veces con
-- aridad distinta en la misma sesión deja DOS sobrecargas y "function pg_temp.reemplazar_vivo(...) is not unique" (SQLSTATE
-- 42725, como lo encontró CI en la #641). Esa migración corre antes por orden de fecha (23-sep < 1-oct) en cualquier
-- contexto ordenado (local, CI, SQL Editor de producción). Con 4 argumentos, `p_opcional` cae en su default `false`: mismo
-- comportamiento que tenía esta versión (aborta si el texto vivo no coincide, nunca omite en silencio) — el `do $$ ... $$`
-- de arriba ya comprueba que ambas funciones existen antes de llegar aquí.

-- ==================== 1. La historia de un producto: un renglón más ====================
select pg_temp.reemplazar_vivo(
  'retail.fn_producto_historia(uuid)',
$viejo$         and (x.lote_id is not null or exists (select 1 from retail.envio_extras e where e.movimiento_id = x.id))
    ) h$viejo$,
$nuevo$         and (x.lote_id is not null or exists (select 1 from retail.envio_extras e where e.movimiento_id = x.id))
      -- Lo que la tienda anotó sobre su propio piso («Ya decidí», Frescura del piso, ADR-0208): historia de stock.
      union all select 19, 'decisiones de Frescura', count(*), true
        from retail.frescura_decisiones x where x.producto_id = p_producto_id
    ) h$nuevo$,
  1);

-- ==================== 2. Eliminar con su historia: la conoce, la respalda y la borra ====================
-- (1) Su candado de historial entra a la lista de los que se apagan solo dentro de la transacción y se vuelven a encender.
select pg_temp.reemplazar_vivo(
  'retail.eliminar_producto_con_historia(uuid)',
$viejo$'bajada_piso_items', 'bajada_piso_items_inmutables'];$viejo$,
$nuevo$'bajada_piso_items', 'bajada_piso_items_inmutables',
                                      'frescura_decisiones', 'frescura_decisiones_inmutable'];$nuevo$,
  1);
-- (2) Su tabla entra al candado de TABLA, en el mismo bloque que las otras tres y ANTES de bloquear el producto. No es adorno:
--     `anotar_decision_frescura` inserta (toma el candado de la tabla) y después la llave le pide la fila del producto; esta
--     función bloquea la fila del producto y después necesita la tabla para apagar el disparador. Si el orden fuera ese, cada
--     una esperaría lo que tiene la otra (40P01, deadlock). Con la tabla PRIMERO, la más lenta espera y, si pasan 3 s, esta
--     función se rinde con «vuelve a intentar» sin tocar nada (ADR-0252, CONCURRENCIA).
select pg_temp.reemplazar_vivo(
  'retail.eliminar_producto_con_historia(uuid)',
$viejo$lock table retail.movimientos, retail.movimientos_internos_intentos, retail.bajada_piso_items in share row exclusive mode;$viejo$,
$nuevo$lock table retail.movimientos, retail.movimientos_internos_intentos, retail.bajada_piso_items, retail.frescura_decisiones in share row exclusive mode;$nuevo$,
  1);
-- (3) Cada fila, tal cual, antes de tocarla (`scripts/purga/restaurar-purga.sql` la devuelve).
select pg_temp.reemplazar_vivo(
  'retail.eliminar_producto_con_historia(uuid)',
$viejo$from retail.movimientos_internos_intentos t where t.movimiento_id = any (v_movs);$viejo$,
$nuevo$from retail.movimientos_internos_intentos t where t.movimiento_id = any (v_movs)
      union all select v_respaldo, 'frescura_decisiones', to_jsonb(t) from retail.frescura_decisiones t where t.producto_id = p_producto_id;$nuevo$,
  1);
-- (4) Se borra ANTES que las variantes y el producto (hijos primero). Toda la libreta en UNA sentencia: sus llaves entre
--     renglones (anterior_id) se revisan al final de ella, cuando ya no queda ninguno.
select pg_temp.reemplazar_vivo(
  'retail.eliminar_producto_con_historia(uuid)',
$viejo$      delete from retail.bajada_piso_items where variante_id = any (v_vs);$viejo$,
$nuevo$      delete from retail.frescura_decisiones where producto_id = p_producto_id;
      delete from retail.bajada_piso_items where variante_id = any (v_vs);$nuevo$,
  1);
