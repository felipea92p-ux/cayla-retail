# 2026-10-08 · Frescura del piso: la fórmula verificada, cuatro decisiones y el arranque de la construcción

- **Qué hice:** antes de tocar nada, `/explica` de la fórmula (Kaplan-Meier por categoría × tienda, reloj de novedad,
  rapidez contra la categoría sin ella) y una verificación **ejecutando las reglas reales**: con 3 ventas rápidas en una
  categoría, una capa de 4 días colgada sale «Se está quedando» y «Por decidir» (la captura de TRU del 2026-10-07,
  exacta); juzgada contra una vara de 30 ventas, «Recién llegada». Felipe decidió en 4 preguntas: medida relativa como
  hoy, vara CAYLA de respaldo con menos de 10 ventas, pantalla de dos niveles, y el mix en su propio submódulo (Plan del
  piso, PR #831). Actividad 0: rama al día con `origin/main` (`4613b0d53`) y actualización 2026-10-07 del ADR-0208.
- **Por qué así:** la fórmula es la correcta; lo inadecuado es que juzga con la misma firmeza con 3 ventas que con 30, y
  el único freno que existe (`RAPIDEZ_MIN_EVIDENCIA = 1`) deja pasar 1 de cada 3 «lentas» falsas por azar. Verificar
  ejecutando costó 7 pruebas; inferirlo me había dado una hipótesis equivocada en el detalle (creí que bastaban 2 ventas;
  hacen falta 3 para que la rapidez tenga dato).
- **Felipe se lleva:** el estado de Frescura no mide días: mide la posición de la prenda contra una curva que con 3
  ventas es un acantilado (P50 = 1 día, P75 = 2). La pregunta que ya puede hacer: «¿cuántas vendió el resto de la
  categoría y en cuántos días, para que el P75 quede en 2?».

## Actividades 1 y 2 · el umbral de evidencia y la vara de CAYLA en la base

- **Qué hice:** (1) `rapidezParaDecidir`: «Por decidir» exige 2 ventas esperadas; con poca evidencia el índice protege
  (pilar) pero no condena (lenta); la que dejó de vender decide igual. (2) La tabla `frescura_vara_cayla` con las
  observaciones anónimas de las tres tiendas, una función de guardar solo para la llave de servicio, una de leer para
  quien ve Frescura, el cron diario de la web que la llena con la receta de `referenciaCayla`, y `fn_frescura_sede`
  abierta a `service_role` con un parche anclado (md5 calculado fuera de la base y verificado adentro).
- **Por qué así:** el cron no tiene persona y el candado de `fn_frescura_sede` pedía una; el repo ya resolvió eso para
  SUNAT (`auth.role() is not distinct from 'service_role'`), y reescribir 386 líneas para una condición habría pisado
  los parches en vivo que otras migraciones vigilan por md5. Borrar las categorías que la corrida no trae por **ids** y
  no por hora: `now()` no avanza dentro de una transacción (la prueba lo encontró).
- **Felipe se lleva:** la vara de CAYLA no es un promedio de las tres tiendas: es UNA curva con las unidades de todas,
  así que una tienda con 2 ventas no pesa lo que una con 200. Y una tabla «calculada» es un snapshot derivado del libro:
  se reemplaza entera, no se edita.

## Actividad 3 · la vara de CAYLA juzga, y la fila lo dice

- **Qué hice:** `analizarSede` recibe el respaldo y, por categoría, decide contra qué juzgar: la tienda con 10 ventas o
  más; si no, CAYLA con 10 o más; si no, la tienda y «aproximado» como antes. Cada prenda dice `juzgadaContra` y cada
  categoría lleva su `respaldo` (vigente, con `enUso`). La pantalla pone «contra lo que vende CAYLA» bajo el estado.
  `frescura.ts` lee la tabla por `fn_frescura_vara_cayla` antes de las tiendas y cuenta de cuándo es.
- **Por qué así:** la curva de CAYLA es una foto de la madrugada y la prenda sigue colgada desde entonces: para restarle
  «sus propias unidades» (D5) las recalculo como estaban en la foto —los mismos eventos hasta `calculada_en`, el mismo
  FIFO—, no como están hoy; lo colgado después de la foto no se resta porque no está en ella. Es la única forma de que
  «sin ella» siga siendo exacto contra una curva que no se calculó ahora.
- **Felipe se lleva:** la decisión «contra qué» es de la categoría, no de cada prenda: todas las capas de TRU se juzgan
  contra lo mismo. Y en la cabecera la categoría sigue mostrando SUS 3 ventas, con la vara de CAYLA al lado: la pantalla
  no esconde cuánto sabe la tienda sola.
