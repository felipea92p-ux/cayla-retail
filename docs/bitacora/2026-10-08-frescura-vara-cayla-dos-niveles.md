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

## Actividad 4 · el tablero «Cómo está el piso»

- **Qué hice:** el nivel 1 de la pantalla: una fila por categoría con la barra apilada de sus unidades colgadas por
  estado, cuántas prendas esperan decisión y con qué vara se juzgó; tocar una fila deja en la lista solo esa categoría
  (y otra vez la suelta). Verificado en el navegador con datos reales (la salida guardada de la base, 17 prendas), a
  1440 y 375 px, en claro y oscuro.
- **Por qué así:** la barra apilada ya existía dibujada a mano en «Deuda por vencimiento» (Compras); creé `ui/BarraApilada` con
  esa misma forma en vez de inventar otra (ADR-0358) —Compras sigue con la suya a mano: migrarla es deuda de `/unificar`, no de
  esta ronda—. Los colores de la barra son los de los chips
  (colores A): la encargada no aprende una segunda paleta. El tablero se arma con TODAS las prendas de la tabla, no con las
  filtradas, para que no cambie al tocarlo.
- **Felipe se lleva:** el tablero se ordena por lo que más pide decidir (unidades que se quedan o hay que mover), no por
  nombre: la primera fila es siempre la categoría que más atención necesita hoy.

## Actividad 5a · la fila ejecuta

- **Qué hice:** la primera sugerencia de cada prenda es ahora un botón con su verbo: «La cambié de lugar» anota a un toque
  (aviso con Deshacer 10 s), «Armar traslado» / «Retirar del piso» / «Ver sus ventas» abren la pantalla que lo hace con la
  prenda cargada, «Decidir» abre la hoja con la opción marcada cuando hay que elegir. El anotar salió de la hoja a un hook
  (`useAnotarDecision`) que ahora usan la hoja y la fila. Verificado contra la base local con una blusa vieja sembrada como
  en T13: un toque, aviso, «Decidida», Deshacer, «Por decidir» otra vez.
- **Por qué así:** antes anotar eran cuatro toques dentro de la hoja; la decisión más común (cambiarla de lugar 7 días) no
  necesita elegir nada más cuando ya se sabe quién anota. Y una sola función, una sola pieza: si la fila anotara por otro
  camino, el día que cambie la marca de reintento o el aviso, uno de los dos quedaría viejo.
- **Felipe se lleva:** el botón no mueve stock ni cambia precios: anota el HECHO de que la encargada ya lo hizo, y la
  lectura decide después si sirvió. Por eso puede ser un toque y perdonar con Deshacer.

## Actividad 5b · un solo aviso, y lo demás en «¿Cómo se lee esto?»

- **Qué hice:** sobre la tabla queda un solo aviso informativo (pocas ventas); el cartel «N de M sin temporada» y el chip
  «¿De qué temporada es?» de cada fila se fueron a una línea dentro de «¿Cómo se lee esto?», con su enlace a Catálogo. Ahí
  mismo la vara de CAYLA dice de cuándo es (o por qué no hay) y cada categoría, si se juzga contra CAYLA y si no, por qué.
- **Por qué así:** Formidable (ley 8, quitar antes de agregar) ya había marcado ese cartel como una tarea de Catálogo
  metida en una pantalla de frescura; y la regla nueva de respaldo tiene que poder leerse en algún lado, pero no encima
  de la decisión: «lo difícil, a un toque» (ley 6).
- **Felipe se lleva:** cuando una categoría dice «contra lo que vende CAYLA», el porqué está a un toque: cuántas ventas
  tiene CAYLA, cuántas tiene la tienda, y de cuándo es la foto.

## Cierre de la ronda (actividad 7)

- **Qué hice:** el mapa (`docs/ARQUITECTURA.md`) cuenta la segunda vara de punta a punta —cron, tabla, funciones, cómo
  decide `analizarSede` contra qué juzgar— y los dos niveles de la pantalla; Formidable registra la ronda como «sin
  recalificar»; `SESIONES-ACTIVAS` dice qué queda. La suite completa de la web (156 369 pruebas) quedó en verde antes del
  cierre. Queda fuera, a propósito, la columna «ocupa · meta» (espera el PR #831) y la pasada `/formidable` sobre la
  pantalla nueva.
- **Por qué así:** la migración `20261008120000` toca el candado de `fn_frescura_sede` con un parche anclado por md5: si se
  publica la web sin pegarla, el cron falla cada madrugada (sin datos, tolerado) y la pantalla sigue juzgando con la tienda
  sola, como hoy; por eso el orden es migración primero y web después, y lo dejo escrito en tres lugares.
- **Felipe se lleva:** lo que se construyó no cambia ningún número de la base ni mueve stock: cambia **contra qué se
  compara** cada prenda (su tienda, o CAYLA cuando la tienda sabe poco) y **cuánta evidencia** hace falta para decir «se
  está quedando». La captura de TRU del 7 de octubre, con esta rama, dice «Recién llegada» hasta que haya datos.

## Revisión adversaria antes del PR

- **Qué hice:** seis revisores de solo lectura sobre el diff (reglas, SQL, cron y lectura, pantalla, docs y herramientas, pruebas)
  y tres escépticos por hallazgo con lentes distintas (reproducirlo, ¿ya lo cubre algo?, ¿qué consecuencia real tiene?): 18
  hallazgos, 16 confirmados, 2 refutados, ninguno preexistente. Los 16 quedaron corregidos el mismo día con su prueba. El de peso:
  la resta «como en la foto» contra CAYLA cortaba por hora unos eventos armados con los apartados de HOY, y un apartado que en la
  foto seguía abierto (una venta para el cron) y hoy ya se liberó sin venderse quedaba dentro de «su categoría sin ella». Ahora la
  foto se rearma desde el libro y los apartados de entonces (`limpiosEnLaFoto`). Los demás: la fila decía «mucho más lenta» y al
  lado «no se sabe qué tan rápido se vende» en el caso exacto de la captura (`poca_evidencia`); «Contra CAYLA» en una categoría de
  puros clásicos; el botón de la fila abría «Ya decidí» con la libreta sin leer; las cifras del tablero solo al pasar el mouse;
  el error de anotar lejos del botón; «1 de 4 prendas no tienen»; y seis de docs/pruebas (DRIFT.md regenerado, la hora del cron
  nuevo ahora vigilada, el comentario copiado en la migración, la bitácora que decía que Compras ya usaba la pieza).
- **Por qué así:** antes del PR y no después: cada hallazgo se verificó ejecutando el código (los escépticos escribieron pruebas
  en un scratchpad), y lo que sobrevivió a dos de tres refutaciones se arregla; lo dudoso se pierde a propósito. El límite que
  queda (lo colgado entre el `desde` del cron y el de hoy no se resta) está escrito en el ADR y en el código, con su tamaño.
- **Felipe se lleva:** una revisión que intenta REFUTAR encuentra más que una que confirma: de 18, 2 cayeron por un mecanismo que
  el revisor había imaginado y no existía. Y el único error de dato de toda la rama vivía en el lugar que más veces decía «exacto».
