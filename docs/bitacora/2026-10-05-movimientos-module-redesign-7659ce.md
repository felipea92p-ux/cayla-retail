## 2026-10-05 (Movimientos: tres maquetas de rediseño — sin código)
Qué hice: Felipe pidió rediseñar Movimientos para que se note de un vistazo si fue una venta, una colgada en piso o una subida al
almacén, con tres maquetas visuales y animadas. Armé `docs/maquetas/movimientos-rediseno-2026-10/` (`index.html` + A «Ruta», B «Tres
carriles», C «Plano vivo», con vista de celular y datos inventados de un día de TRU). Las tres comparten un idioma: cada tipo con su
color, su ícono que se anima una vez y su camino de dónde a dónde. Sin migraciones y sin tocar `apps/web`.
Por qué así: hoy una venta, una bajada y un retiro se leen casi igual (fila gris + número); distinguirlas por color + forma + posición
+ camino evita depender solo del color y sale de campos que `fn_movimientos` ya devuelve (par de sububicaciones, motivo, delta).
Lo que NO se hizo a propósito: elegir (decide Felipe), tocar la pestaña Pérdidas de la sesión de Inventario por olas, ni escribir ADR
(la elección todavía no existe). Cómo verificas tú: abre `docs/maquetas/movimientos-rediseno-2026-10/index.html` y prueba cada una en
«Escritorio» y «Celular»; en la C dale a reproducir el día.
Actualización (mismo día): Felipe eligió la A · Ruta (botones de tipo en columna a la derecha) y fijó las palabras para todo el
sistema: «Colgada en piso» y «Guardada en almacén» (reemplazan «Bajada al piso» / «Retiro del piso»). Colores separados y sellos
suaves con solo tokens CAYLA. Al construirla, esas palabras se cambian en `ETIQUETA_PROCESO`/`INTERNO_POR_PAR` y donde se nombren.
