-- ============================================================================
-- 20261005170000_retirar_fn_pedidos_para_apartar.sql — CAYLA V2 · ADR-0328, actividad 17 (cierre)
--
-- EL PROBLEMA. `retail.fn_pedidos_para_apartar(uuid)` (creada en 20260927140000, recreada igual en 20260927210000) era la
-- lectura de Apartados para los pedidos de una prenda a otra sede para un cliente. Desde ADR-0328 act. 17 (PR #799,
-- 20261005130100) la reemplaza `retail.fn_pedidos_con_cliente(uuid)`, que además dice dónde está apartada la prenda en la
-- sede que la tiene, si ya se avisó al cliente y de qué lado se cerró un pedido que no llegó. La vieja quedó viva en
-- producción sin que nadie la llame, y no es inofensiva:
--   · le entrega a CUALQUIER sede del pedido —también a la que envía— el nombre, los apellidos y el celular del cliente
--     (columnas `clienta_*`). La decisión del 2026-10-04 (privacidad) fue justo la contraria: la sede que tiene la prenda
--     guarda «un pedido de Trujillo» y no conoce al cliente. Con la vieja viva, cualquiera que opere esa sede la puede
--     llamar directo por la API y leer lo que la pantalla ya no le muestra;
--   · son dos lecturas del mismo pedido que ya divergen (nombres de columna, qué se ve de lo cerrado), y la próxima
--     persona que toque Apartados no sabe cuál es la buena.
--
-- LA DECISIÓN. Borrarla. Nada la usa: ni la web de `main` (desde #799 lee `fn_pedidos_con_cliente`; solo queda un
-- comentario en `apps/web/lib/separaciones-reglas.ts`), ni otra función, vista, política, disparador o trabajo de pg_cron
-- de producción (consulta de solo lectura del 2026-10-05: cero coincidencias en `pg_proc.prosrc`, `pg_views`,
-- `pg_matviews`, `pg_policies`, `pg_depend`, `pg_trigger` y `cron.job`). Las dos pruebas que la usaban
-- (`pedir_a_otra_sede.mjs`, `separaciones.mjs`) leen ahora la nueva con las mismas verificaciones.
--
-- QUÉ SE ROMPERÍA SI ALGUIEN LA LLAMARA DESPUÉS. Una web vieja (una rama anterior a #799 o su vista previa) recibiría
-- «la función no existe». Esa web ya la trataba como secundaria: sin la función, la lista «Pedidos a otra sede» de
-- Apartados queda vacía y el resto de la pantalla funciona (así se diseñó para cuando la migración aún no estaba). No se
-- pierde ningún dato: la función solo leía `separacion_pedidos`, que no se toca.
--
-- PRODUCCIÓN. Una sola parte, se pega tal cual: `drop function` NO toma en exclusiva las tablas de auth/storage (CLAUDE.md,
-- «Políticas y deadlocks»), sin políticas, sin `alter`, sin `drop trigger`. Idempotente (`if exists`): pegarla dos veces no
-- falla. Firma exacta leída en producción el 2026-10-05 con `pg_get_function_identity_arguments`: `p_ubicacion_id uuid`.
-- Antes de pegar, sonda de solo lectura (las dos deben dar 0; si no, NO se pega y se avisa a Felipe):
--   select count(*) from pg_proc where prosrc ilike '%fn_pedidos_para_apartar%' and proname <> 'fn_pedidos_para_apartar';
--   select count(*) from pg_views where definition ilike '%fn_pedidos_para_apartar%';
-- Después de pegar (debe dar 0):
--   select count(*) from pg_proc where pronamespace = 'retail'::regnamespace and proname = 'fn_pedidos_para_apartar';
--
-- SE ROMPE SI alguien vuelve a pegar 20260927140000 o 20260927210000 enteros: la recrean (y además borran las anclas de
-- ADR-0328 act. 17, el problema mayor que ya avisa la cabecera de 20261005130100).
-- ============================================================================

set lock_timeout = '3s';

drop function if exists retail.fn_pedidos_para_apartar(p_ubicacion_id uuid);

notify pgrst, 'reload schema';
