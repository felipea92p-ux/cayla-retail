# ADR-0071 — El historial de movimientos se cierra con disparadores "siempre" y retiro de permisos, no con FORCE RLS

**Fecha:** 2026-09-16
**Estado:** Aplicado en local (`20260916200000_historial_candado_completo.sql`). Producción:
pendiente de que Felipe pegue `docs/datos/SQL-PENDIENTE-PRODUCCION-2026-09-16-halcon.sql`
(pre-flight medido el mismo día: 0 funciones afectadas, 0 trabajos programados).
**Afecta:** `retail.movimientos` (disparadores y permisos), `retail.stock` (permisos),
`retail.fn_aplicar_movimiento` y `retail.recalcular_stock` (quién las ejecuta). Módulo 05 · Halcón,
hueco 1 (D-22).

## El problema

`movimientos` es la única fuente desde la que se reconstruye el stock de TRU, AQP y el Taller.
Desde el 14-sep ninguna tienda edita ni borra el libro. Medido en producción el 16-sep, seguía
abierto lo siguiente:

- **Vaciarlo.** `service_role` conservaba TRUNCATE. La seguridad por fila no aplica a TRUNCATE y
  el disparador era por fila. Un `truncate retail.variantes cascade` "para limpiar datos de
  prueba" se llevaba toda la historia, y `recalcular_stock` reconstruía cero.
- **Saltarse el disparador.** Estaba en modo normal: con `session_replication_role = replica`
  no se activa.
- **Inflar el stock sin libro.** Cualquier sesión con login podía ejecutar
  `fn_aplicar_movimiento` con el id de una entrada que ve en pantalla. Cinco llamadas sobre una
  entrada de 12 blusas: la tienda muestra 60 prendas que no existen y la caja las vende.
- **Cambiar la cifra de stock directo.** `authenticated` tenía INSERT/UPDATE/DELETE sobre
  `stock`. Lo frenaba que nadie escribió una policy de escritura: omisión, no decisión.

## Decisión

DECIDÍ: disparadores con `enable always` (se activan para cualquier rol y también en modo
réplica): el de UPDATE/DELETE que ya existía y uno nuevo `before truncate` por sentencia, que
también se activa cuando el TRUNCATE llega en cascada. Retiro de INSERT/UPDATE/DELETE/TRUNCATE
sobre `movimientos` y `stock` a `authenticated`, `anon` y `service_role`, y de EXECUTE sobre
`fn_aplicar_movimiento` y `recalcular_stock`. Solo las RPC (security definer, dueño `postgres`)
escriben el libro y aplican stock.

DESCARTÉ: `alter table retail.movimientos force row level security`, la pieza que D-22 daba por
necesaria. En producción el dueño de la tabla y de las 82 funciones security definer (`postgres`)
y `service_role` tienen `rolbypassrls = true`: forzar RLS no le aplica a nadie que pueda
escribir. Sería un candado que existe en el documento y no en la base, y si algún día cambiara el
dueño de las funciones rompería cada venta, porque `stock` no tiene policy de escritura.
También descarté una "puerta de emergencia" con motivo obligatorio (`set local` + tabla de
rastro): la base no distingue a Felipe de un agente conectado con la misma llave, así que la
puerta la abriría cualquiera que la conozca. La corrección sigue siendo escribir el movimiento
contrario; la emergencia real (desactivar el disparador) es DDL del dueño y queda en el log.

SE ROMPE SI: una integración nueva (un script, Dynamic, una Edge Function) escribe `stock` o
`movimientos` con la llave de `service_role` en vez de llamar a una RPC: falla con "permission
denied", y está bien que falle. O si una RPC nueva se escribe como `security invoker` y aplica
stock: falla igual. Y el candado no frena a quien entra como `postgres` y ejecuta
`alter table ... disable trigger`: eso ya no es un accidente, y es otro problema (quién tiene la
llave de dueño).

## Por qué no rompe nada

Medido en producción: las 14 funciones que insertan movimientos o aplican stock son security
definer de `postgres`; ninguna función que corre como quien la llama toca `stock` o
`movimientos`; ninguna hace UPDATE/DELETE sobre `movimientos`; las 5 FK hacia `movimientos` son
NO ACTION; no hay trabajos de `pg_cron` sobre esas tablas; la app no usa `service_role` y solo
lee `stock` y `movimientos`.

## Cómo se verificó

`pnpm pruebas:candado-historial` (patrón ADR-0066): **antes** de la migración, 1/9 en verde —la
prueba reproduce los 8 huecos en local—; **después**, 9/9. Una sesión de tienda (`set local role
authenticated`) sigue registrando un movimiento por la RPC y el stock sube 3. Las pruebas
existentes siguen en verde: `pruebas:registrar-cambio` 13/13 y `pruebas:aprobar-devolucion-caja`
2/2. El script de producción corrió dos veces seguidas contra local sin errores.
