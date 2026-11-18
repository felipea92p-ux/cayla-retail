## 2026-11-07 (Configuración ▸ Metas: los tubos pasan a barras)
Qué hice: en «Cuánto vender» los tubos redondos de cada mes y de cada día («parecen píldoras», Felipe) pasan a la pieza de las barras por
tiempo (`<BarrasTiempo>`, ADR-0358): seis barras de mes en arena con su monto encima, el mes a la vista en tinta, y «Lo normal» como su
propia píldora (`pildora-cayla`, con el monto). La semana es otra fila de barras, con cada casilla en la misma columna que su día; en un
mes, el día que cambia va en tinta. Se fueron `.cv-tubo`, `.cv-mes` y `alturas()` (la barra mide sola). Guía y huella al día.
Por qué así: una función, una pieza: «cuánto en cada mes» ya tiene pieza decidida, y su grilla deja cada casilla bajo su día, que con los
tubos y su tarjeta flotante se veía desalineado.
Cómo se verificó: en local a 1440 y 375 px, claro y oscuro, eligiendo «Lo normal» y diciembre y escribiendo un día propio; las pruebas de
Metas, movimiento, familia, unificar, tema, guías, foco y sugerir, tipos y Knip en verde. `config-vistas.css` está en `estilos/vidrio/`: el
vigilante de Dynamic lo mira; si allá existe algo parecido, queda como tarea a mano.
