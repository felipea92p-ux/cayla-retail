## 2026-10-29 (Producción: la orden como «Ruta viva» — ADR-0570, actividad 1 de 10)

**Qué hice:**
- Felipe pidió «editar con facilidad, eliminar con historial y comentario», ojal y botón, cierre y mejores colores, porque el módulo es «horrible de manejar».
- Se analizó con 4 agentes: Insumos, la página de la orden, el modelo de pasos e historial, y una prueba ciega. Después vinieron 34 preguntas en 9 rondas y una maqueta para elegir mirando (`docs/maquetas/produccion-taller-2026-10/`). Felipe eligió la A en la orden y en Insumos.
- La lista de 10 actividades quedó aprobada.
- La actividad 1, solo web, es la página de la orden como «Ruta viva»:
  - la ruta va en fila, con un color por paso;
  - el paso que toca se abre debajo con su botón, y tocar otro paso lo abre;
  - un punto ámbar marca dónde más hay algo para anotar;
  - la tela y el costo van debajo, y la ficha y la «Historia» al costado;
  - la tela dice «Falta anotar» (ámbar, con aviso y botón) en vez del verde «Ya se cortó»;
  - las tablas van sin franja y el texto secundario en gris neutro;
  - el punto de la historia lleva el color de lo que pasó.

**Por qué así:** antes había siete tarjetas casi iguales en una grilla. El paso hecho y el que tocaba se veían igual. La tela pendiente se leía como hecha («Ya se cortó» verde junto a «Usado 0 m»), y por eso una prenda ya entró al stock a S/ 4,50 en vez de S/ 22,38.

**Estado:**
- **Sin migración; nada en producción.**
  - 149 pruebas de `orden-pagina-reglas`, 6 de ellas nuevas.
  - Las guardas de guías, `unificar`, tema, hover, guía de foco, `sugerir` y ancho completo: 562 en verde.
  - `tsc` y `eslint` limpios, y Knip sin hallazgos.
  - La huella de la guía se aceptó tras ponerla al día.
- **Verificado en el navegador** sobre una copia propia de la base local (puertos 55980, 55972 y 55970, en el scratchpad), con la orden de prueba OP-000231 llevada al estado de OP-1 (Ploteo y Corte hechos, tela sin anotar):
  - a 1440 px, a 375 px y en modo oscuro;
  - sin desborde lateral;
  - el enlace del aviso con contraste de unos 6,3:1.
- **Sin correr:** `tema:auditar`, `guias:recorrer`, `/chaos` y `/formidable`. Quedan para la actividad 10.

## 2026-10-29 (Producción: «Terminé» con falla y con fecha — ADR-0570, actividad 2 de 10)

**Qué hice:**
- **Base** (`20261029164000_produccion_termine_con_falla_y_fecha.sql`):
  - `produccion_fallas`, de solo agregar: segunda, perdida o arreglo, con su motivo.
  - `produccion_avances.hecho_en`: el día real.
  - `anotar_termine`: buenas, fallas y día, todo o nada, bajo el candado de la orden.
  - `registrar_avance`: la misma firma, ahora la llama.
  - `deshacer_falla`: una fila contraria, una sola vez.
  - `fn_fases_de_orden`: segunda y perdida cierran la fase.
  - `fn_orden_produccion`: devuelve las fallas por talla y color, y en la línea de tiempo con el día real y cuándo se anotó.
- **Web:**
  - En «Terminé», «+ Anotar prendas con falla»: talla y color, cuántas, se arregla, segunda o se perdió, y el porqué a un toque. Las buenas bajan solas.
  - «¿Cuándo lo terminaste?», que viene en hoy.
  - La historia muestra «Con falla en …» con punto rojo y su Deshacer, y «anotó el …» cuando se anotó otro día.
  - La guía interactiva lleva dos pasos nuevos.

**Por qué así:**
- Una sola prenda manchada trababa la orden: un paso del Taller solo cerraba con todas buenas, y «Pasar al stock» no aparecía nunca.
- Todo pasaba «a las 20:29»: no había cómo decir cuándo se terminó de verdad.

**Estado:**
- **Migración SIN pegar en producción.** Va después de `20261029021000` y `20261029051000`, y antes de publicar la web.
- 21 casos nuevos y las 24 suites de Producción en una base desde cero (933 migraciones). La suite del Ploteo ahora deshace estos parches leyéndolos de la migración.
- 160 pruebas de reglas y 634 de guardas de pantalla; `tsc`, `eslint` y Knip limpios.
- Probado en el navegador:
  - 98 buenas y 2 segundas con fecha de ayer: Habilitado cierra y a Costura le entran 98.
  - Deshacer la falla reabre la fase.
- **Ojo:** la base local compartida (55990) trae una migración de otra rama sin fusionar (el día real de la marca de Ploteo). Probar en ella daba anclas falsas, así que se probó en una base desde cero.

## 2026-10-29 (Producción: corregir, eliminar y restaurar cualquier anotación, con historia y notas — ADR-0570, actividad 3 de 10)

**Qué hice:**
- **Base** (`20261029173000_produccion_corregir_y_eliminar_con_historia.sql`):
  - `produccion_cambios`, de solo agregar: cada corrección, eliminación, restauración y nota, con su motivo y el antes y el después, en la misma transacción que el cambio.
  - `corregir_anotacion_orden`, `eliminar_anotacion_orden`, `restaurar_anotacion_orden` y `comentar_orden`.
  - La regla de «Terminé» en una sola función (`fn_produccion_escribir_termine`), que usan «Terminé», corregir y restaurar.
  - `fn_produccion_exigir_cadena`: ningún cambio deja a la fase siguiente con más prendas de las que le llegaron.
  - `fn_orden_produccion` devuelve `cambios` y `deshechos`.
- **Web:**
  - Cada anotación viva de la historia lleva su lápiz. «Terminé» abre «Corregir»: cantidades, fallas, día y porqué, con «Eliminar» a la izquierda del pie. La marca de Ploteo abre «Quitar la marca». Una salida o una vuelta abre «Anular».
  - Lo que un cambio quitó sale de la vista y en su lugar va el cambio con su motivo. Una eliminación trae «Restaurar».
  - «Escribir una nota» arriba de la historia.
  - Las filas de falla son una sola pieza para «Terminé» y «Corregir».

**Por qué así:**
- «Deshacer» solo alcanzaba a la última anotación de cada talla: un error del lunes con algo anotado el martes encima quedaba para siempre.
- Una fecha mal puesta no se corregía, y lo que se deshacía no decía por qué.
- Felipe lo pidió así: «editar con facilidad, eliminar con historial de cambio y comentario para entender qué pasó».

**Estado:**
- **Migración SIN pegar en producción.** Va después de `20261029164000`, y antes de publicar la web.
- 28 casos nuevos. La suite de fallas ahora carga también esta migración. Las 25 suites de Producción, en una base desde cero.
- 171 pruebas de reglas y las guardas de pantalla en verde; `tsc`, `eslint` y Knip limpios.
- Probado en el navegador en escritorio y a 375 px:
  - corregir 98 → 97;
  - eliminar Corte con Habilitado ya anotado se rechaza con un mensaje claro;
  - eliminar y restaurar Habilitado;
  - una nota.
- **Ojo:** el primer intento agregaba `deshace_id` a las filas de la línea de tiempo con reemplazos anclados, y volver a pegar la migración de la actividad 2 duplicaba el bloque de fallas. Ahora la orden manda dos claves aparte y las filas de la línea de tiempo no se tocan.

## 2026-10-29 (Producción: la tela al cortar, «Encontré tela» y el candado de «Pasar al stock» — ADR-0570, actividad 4 de 10)

**Qué hice:**
- **Base** (`20261029190000_produccion_tela_al_cortar.sql`):
  - `anotar_insumos_de_la_orden`: lo que quedó de cada tela o lo usado de cada avío, PEPS en la base, todo o nada.
  - `encontre_tela`: un lote con origen «encontrada», al precio escrito o al último.
  - `permitir_pasar_sin_tela`: solo un líder, con motivo, y queda en la historia de la orden.
  - `cerrar_produccion` pide la tela (también un forro) de una orden que la declaró.
- **Web:**
  - «¿Cuánto quedó en el estante?» con todos los colores en una hoja; el partido de lotes del navegador se borró.
  - «Encontré tela», la tela que sale con un corte de afuera y el candado en «Pasar al stock» con el permiso de líder.

**Por qué así:** una prenda entró al stock a S/ 4,50 en vez de S/ 22,38 porque nadie anotó la tela. Además se preguntaba lo usado, un número que nadie mide: en el Taller se mide lo que quedó en el rollo.

**Estado:**
- **Migración SIN pegar en producción.** Va después de `20261029173000`, y antes de publicar la web.
- 16 casos nuevos; las 26 suites de Producción y 13 de otros módulos que cierran órdenes, en una base desde cero.
- `tsc` y 478 pruebas de reglas y guardas en verde.
- **Sin probar en el navegador** el permiso de líder, el corte de afuera y «Encontré tela» (también a 375 px): el contenedor del cierre no tenía base local. Queda para la actividad 10.
- **Decisión propia que Felipe tiene que confirmar:** el candado no aplica a una orden que no declaró tela (bloquearla rompía 20 suites de otros módulos y trababa toda orden sin tela). Si la quiere bloqueada, es otra migración.

## 2026-10-29 (Producción: el catálogo de procesos — ADR-0570, actividad 5 de 10)

**Qué hice:**
- **Base** (`20261029210000_produccion_catalogo_de_procesos.sql`): la tabla `procesos_produccion`, con los doce de siempre (sus mismos números) más «Pegar cierre», y Lavandería renombrada a «Lavado o teñido». Las fases de las órdenes y las tarifas apuntan a ella con llave foránea. El líder da de alta, renombra o apaga (`guardar_proceso_produccion`). `producto_procesos` guarda lo que lleva cada modelo y reemplaza a `lleva_ojales_botones`.
- **Web:**
  - Nueva orden ofrece el catálogo, prende lo que lleva el modelo y trae la casilla «Recordar en la ficha del modelo».
  - «+ Agregar un paso» ofrece todos los procesos activos, trae «Otro proceso…» para el líder y su propia casilla «Recordar en la ficha».
  - Servicios y tarifas suma «Procesos del Taller», con su hoja.

**Por qué así:** para que el Taller pegue un cierre o mande a lavar había que programar; las claves estaban escritas a mano en 9 lugares de la base.

**Estado:**
- **Migración SIN pegar en producción.** Va después de `20261029190000`.
- 15 casos nuevos y 45 suites en una base desde cero, con Postgres 17.
- Toda la web en verde, con `tsc` y Knip limpios.
- **Sin probar en el navegador:** no hay sesiones ni API de Supabase en este contenedor.
- **Número sin reserva:** el proxy de git no deja subir etiquetas.
- **Decisión propia que Felipe tiene que confirmar:** Lavandería se renombró en vez de sembrar «Lavado o teñido» aparte.

## 2026-10-29 (Producción: las seis migraciones de la obra, en producción)

- Felipe pegó en el SQL Editor, en orden, `20261029021000`, `051000`, `164000`, `173000`, `190000` y `210000`.
- Falta refrescar el volcado y el diccionario, y publicar la web de esta rama: el candado de «Pasar al stock» ya rige y la pantalla publicada todavía no tiene el permiso de líder.
