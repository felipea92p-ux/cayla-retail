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
