# ADR-0566 — Agregar un paso a una orden ya abierta (ojal y botón)

**Estado:** aceptada; **la base y la web construidas y probadas en local; migración `20261029051000` SIN pegar en producción (va antes de publicar la web, y después de `20261029021000`)** · **Fecha:** 2026-10-29 ·
**Decidió:** Felipe (opción A, aprobada el 2026-10-29, con los tres defaults de abajo) · **Sigue a:** ADR-0551 (cinco pasos fijos y `quitar_paso_orden`)

## Contexto

Felipe (2026-10-29, con la captura de la orden del Chaleco): «además falta lo de ojal y botón». La ruta de esa orden salta de Costura a Planchado: se abrió sin el paso
opcional «Ojales y botones» (ADR-0551: nace prendido solo si el modelo lo lleva) y **una orden abierta no tiene cómo sumarlo**. La actividad 1b del ADR-0551 dejó
`quitar_paso_orden` y escribió, a propósito: «no hay agregar paso… se pide una función hermana».

Lo que ya estaba hecho y no hay que construir: el lugar del paso en la ruta (`fn_fase_secuencia`: Ojales y botones es 35, entre Costura 30 y Planchado 65), el estado de cada
fase (se DERIVA, no hay columna: una fila nueva nace «pendiente»), la validación de la ruta (`fn_produccion_fases_normalizar`) y el candado por orden.

## Decisión

**1. Una función hermana de `quitar_paso_orden`: `agregar_paso_orden(orden, clave, quién, proveedor, tarifa, fijo, mínimo, fecha, pendiente, posición)`** (migración
`20261029051000`, solo `create or replace`). Suma UN paso a una orden en proceso y devuelve `fn_fases_de_orden`. Mismas guardas que su hermana: ve Producción y está parado en
ese Taller (`fn_produccion_exigir_operar`), firma un responsable (`fn_actor_persona_id(true)`, ADR-0162), toma el candado por orden y queda en Actividad.

**2. La ruta resultante pasa la MISMA validación que al abrir** (`fn_produccion_fases_normalizar`): las fases que ya están viajan como están (se valida la FORMA de la ruta) y el
paso nuevo viaja con lo que se le dijo. Un paso repetido (`fase_repetida`), una clave que no existe (`fase_desconocida`), un servicio sin proveedor o sin tarifa
(`fase_sin_proveedor`, `fase_sin_tarifa`), un proveedor de telas (`fase_proveedor_rubro`) y la mezcla de la ruta anterior con la nueva (`fases_mezcla`) se rechazan con los mismos
`hint`. «Pendiente de registrar» (ADR-0551) vale: sale afuera sin saber todavía con quién.

**3. No se agrega un paso si alguno POSTERIOR ya tiene algo anotado** (`paso_despues_empezado`): un avance, una salida, una vuelta o una marca, aunque estén deshechos. El paso nuevo
iría antes de esas prendas y los conteos quedarían contradictorios (Planchado con 20 hechas y Ojales y botones con 0). Un paso ANTERIOR empezado no frena nada.

**4. No mueve dinero.** Un servicio agregado devenga su costo al registrar su vuelta, como cualquier otro; al agregarse el costo de servicios de la orden sigue igual.

**5. Quién puede: quien ve Producción**, igual que «Quitar este paso» (default aprobado: no pide líder). **Qué pasos ofrece la pantalla:** solo «Ojales y botones», como «Nueva orden»
(la base acepta los demás opcionales; Limpiar hilos y Etiquetar los hace la tienda). **Qué hace con el modelo:** si nadie ha dicho si el modelo lleva ojales y botones, agregar el paso lo deja
anotado como «sí lleva» (`guardar_ojales_botones_modelo`, que llama la web); si el modelo ya decía «no», el paso vale solo para esta orden y se avisa. (4 y 5 se construyen en la actividad 2.)

## La web (actividad 2)

- **«+ Agregar un paso»** en la cabecera de «Fases» (`RutaDeFases`), solo si hay algo que agregar (`pasosAgregables`: lo que ofrece «Nueva orden», que no esté ya en la ruta, que no mezcle con la ruta anterior y cuyos pasos
  de después no hayan empezado). Si un paso no se puede por eso último, la sección **lo dice** («Ojales y botones ya no se puede agregar: Planchado ya empezó, y Ojales y botones iría antes») en vez de esconderlo.
- **Hoja `AgregarPasoModal`:** la misma fila de «Cambiar quién» y de «Nueva orden» (`FilaFase`: Taller / Afuera, proveedor, tarifa de su lista de precios, mínimo, fecha, «pendiente de registrar» y alta de proveedor nuevo)
  y quién lo anota; la bajada dice entre qué pasos entra. Guía de foco propia (`camposDeAgregarPaso`) y «¿Salir sin guardar?».
- **El modelo:** si nadie había dicho si lleva ojales y botones, agregar el paso lo deja anotado como «sí lleva» (`guardar_ojales_botones_modelo`, firmado; si falla, el paso ya quedó); si el modelo decía «no», la hoja avisa que vale
  solo para esta orden. Va escrito en la hoja ANTES de guardar, no después.
- **«Deshacer»** en el aviso de éxito: quita el paso recién agregado con el mismo camino de «Quitar este paso» (`quitar_paso_orden`). «Quitar este paso» ya no dice «no se puede volver a agregar».
- Guía interactiva de Producción al día (dos pasos nuevos: el botón y la fila) y la hoja registrada en la guía de foco.
- Verificado en el navegador contra Postgres local: agregar afuera con la tarifa y el mínimo de la lista (1.80 · 20), agregar en el Taller, Deshacer, quitar y volver a agregar, y el caso de Planchado ya empezado; 375 px y modo oscuro.
  El costo estimado de la orden ya muestra el paso nuevo («al volver»); lo real llega con la vuelta.

## DESCARTÉ

- **Guardar los pasos opcionales «apagados» y reactivarlos.** Cada lector de la ruta (cierre, lista, Resumen) tendría que saltarse las filas apagadas —el mismo `if` por el que `quitar` borra la
  fila en vez de marcarla— y las órdenes que ya están abiertas no tienen esas filas.
- **Anular la orden y abrirla de nuevo.** Pierde la historia y la tela ya descontada; con el Chaleco (Ploteo y Corte hechos) sería destructivo.
- **Un SQL puntual para el Chaleco.** La próxima orden pide lo mismo.
- **Dejar agregar un paso antes de uno ya empezado y «arreglar» los conteos.** No hay forma honesta de decir cuántas prendas pasaron por un paso que no existía cuando se hicieron.
- **Ampliar `cambiar_quien_fase` o `abrir_orden_produccion`.** Agregar una fila a la ruta y cambiar quién hace una fase existente son dos hechos con dos reglas distintas («esa fase ya empezó» contra «un paso posterior ya empezó»).

## SE ROMPE SI

- **Dos personas a la vez:** una agrega el paso y otra anota el primer avance de Planchado en el mismo instante. Lo impide el candado por orden: `registrar_avance`, `registrar_salida`, `registrar_vuelta` y
  `marcar_fase_hecha` toman la misma llave que esta función, así que una espera a la otra y la segunda ve lo que dejó la primera. Se comprueba por su FORMA (prueba S2); con dos sesiones reales haría falta COMMIT.
- **Alguien empezó y DESHIZO Planchado:** las filas deshechas son historia que apunta a la fase y cuentan como «empezado» (prueba R5). El paso ya no se puede agregar; el mensaje dice cuál es la fase. Se arregla
  anotando el paso antes de que Planchado tenga historia, no forzando.
- **La clave que se agrega tiene posición (bordado, estampado) y no la trae:** se rechaza (`fase_sin_posicion`), como al abrir.

## Cómo se pega en producción

`supabase/migrations/20261029051000_produccion_agregar_paso_a_la_orden.sql`, **una sola parte**, después de `20261029021000`: solo `create or replace function`, su comentario y `revoke`. Ninguna política ni `alter`
(no choca con el Asesor de seguridad, ADR-0195). Idempotente. Se pega **antes de publicar la web** (sin ella, el botón «Agregar un paso» respondería que no se pudo guardar).

## Verificación

`pnpm pruebas:produccion-agregar-paso` (24 casos contra Postgres, todos con ROLLBACK; comprobada con tres mutaciones que la hacen fallar: no mirar los pasos posteriores, no mirar si la orden sigue en proceso y
no tomar el candado). Con la migración aplicada de verdad pasan sin cambios las suites vecinas: quitar paso (13), cinco pasos (13), fases nuevas (17), avances (29),
ploteo (20), proveedor pendiente (17), complementos (17), cierre (20) y anulaciones (18). La orden con el paso nuevo se trabaja y se pasa al stock de punta a punta (F1), y un servicio agregado devenga 90.00 al volver
(F2), no al agregarse.

## Actualización 2026-10-30 — el paso bloqueado se VE en la hoja (Felipe: «no me aparece ojal y botón»)

**Qué pasó:** en la orden del Short (Planchado ya hecho) el combo «Qué paso» abría directo en «Otro proceso…» y no listaba Ojales y botones. La base y `pasosAgregables` hacían bien su trabajo (Ojales y botones va en 35, antes de
Planchado 65, y Planchado ya tenía algo anotado: `paso_despues_empezado`), pero **la promesa de arriba —«la sección lo dice en vez de esconderlo»— se rompió con ADR-0570 act. 5**: un líder siempre ve «+ Agregar un paso» (puede dar de alta
«Otro proceso…»), y la línea de la página que explica lo bloqueado solo sale cuando NO hay botón. Resultado: el paso desaparecía sin decir por qué.

**Cambio (web, sin tocar la base ni la regla):**
- La hoja lista los pasos bloqueados **apagados y con su motivo** («Ojales y botones · Planchado ya empezó») y una frase bajo el combo los explica (`textoDePasosBloqueados`). Quien no es líder sigue viendo la línea de la página.
- **«Otro proceso…» pasa por la misma regla** (`pasoPosteriorEmpezado`, que `pasosAgregables` también usa): si iría antes de un paso ya empezado, la hoja lo frena y pide elegir otro «Va después de». Antes el alta del proceso iba primero y
  luego la base rechazaba el paso: quedaba un proceso en el catálogo sin haberse agregado a ninguna orden.
- La fila «Quién lo hace» mostraba la clave interna `__otro__` como título; ahora muestra el nombre que se está escribiendo («Proceso nuevo» mientras tanto), y toma el catálogo de la orden (un proceso propio del líder ya no sale con su clave).

**No se cambia (y es decisión de Felipe, no mía):** dejar agregar Ojales y botones con Planchado ya hecho exigiría cambiar `agregar_paso_orden` y volvería a abrir lo que el DESCARTÉ de arriba cerró (los conteos de las prendas ya planchadas quedarían contradictorios).

## Actualización 2026-10-31 — las prendas con falla también cuentan como «ya empezó» (`20261031031000`)

`agregar_paso_orden` decidía si un paso posterior ya había empezado mirando avances, salidas, vueltas y marcas, pero no `produccion_fallas`. Una fase puede tener solo prendas con falla (Planchado con 3 perdidas y ninguna buena): para la base no había empezado, el paso nuevo entraba antes, vacío, y Planchado quedaba con 3 perdidas de 0 que le llegaron. La pantalla ya lo evitaba; una llamada directa no.

- **DECIDÍ:** sumar `produccion_fallas` (cualquier destino) a la condición, igual que ya hace `agregar_paso_tarde` (ADR-0586): las dos funciones hermanas dicen lo mismo de cuándo un paso «ya empezó».
- **DESCARTÉ:** contar solo las fallas que no van a arreglo. Una prenda que vuelve a arreglo igual ya pasó por Planchado, y meter un paso vacío antes es la misma contradicción.
- **SE ROMPE SI:** aparece otra tabla que anote prendas contra una fase y nadie la suma aquí ni en `agregar_paso_tarde`.
- **Verificación:** caso R5b de `pnpm pruebas:produccion-agregar-paso`: falló antes del arreglo (6 fases, el paso entró) y pasa después (25/25).
- **Producción:** SIN pegar. Una parte, re-ejecutable; va después de `20261029051000`.
