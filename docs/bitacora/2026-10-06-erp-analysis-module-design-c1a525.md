## 2026-10-06 (Análisis v4: cuatro preguntas, cada una con su gráfico y su botón — ADR-0357)
Qué hice: Análisis (`/inventario/resumen`) pasó a la maqueta que aprobó Felipe: Hoy · Se está acabando · No se vende · Qué pedir, cada prenda con
su botón al flujo que ya existe y sin Comparar períodos; mientras la tienda no cumple las tres condiciones del motor (ADR-0346) dice «Todavía no» y
qué falta; la encargada ve lo mismo que el líder (enmienda a ADR-0328). Cuatro migraciones (`20261006213000` a `20261006216000`), ninguna en
producción. Quedó escrito en ADR-0357, ADR-0136 (act. 2026-10-06 (b), el movimiento), ARQUITECTURA y CLAUDE.md.
Por qué así: el Análisis viejo eran tablas y períodos con palabras de analista, y quien atiende llega con una pregunta; en la prueba ciega ganaron
las listas con nombre de prenda (5 de 5) y Felipe eligió el flujo de «Qué hacer hoy»; la cantidad y el «pedir o comprar» los decide la persona
(ADR-0231), y nada se recomienda sobre ventas sin su prenda.
Qué sigue: pegar las cuatro migraciones en producción, en orden y con el OK de Felipe, antes de publicar; probarla con una encargada real; que
Compras reciba prendas por URL y Etiquetas la rebaja; y limpiar las libs del Análisis viejo (tarea aparte, ya lanzada).

## 2026-10-06 (Análisis abre con los datos de hoy — ADR-0357, decisión 2, act. 2)
Qué hice: mientras la tienda no cumple las tres condiciones del motor, Análisis abre con todo el diseño y un aviso fijo arriba que nombra lo
primero que falta; «Ver qué falta» lleva a «Todavía no», con el mismo aviso y «Ver con los datos de hoy» para volver (`?ver=falta`). Sin SQL.
Por qué así: Felipe lo pidió al verlo en producción, donde ninguna tienda cumple y la pantalla escondía el diseño detrás de un botón chico; la
regla de ADR-0346 sigue diciendo si las cifras son confiables, ya no si se ven.
Qué sigue: `/formidable` y `/chaos` siguen pendientes.

## 2026-10-06 (Análisis, solo de la tienda elegida — ADR-0357, decisión 3, act.)
Qué hice: quité de Análisis la comparación de las tres tiendas («Por tienda» en Hoy, los anillos de cada tienda en «Todavía no» y las barras de
edad de las tres en «No se vende», que quedó como «Lo que tienes, por tiempo sin venderse»); con ella se fueron `resumenSedes` y `resumenDeSede`.
Por qué así: Felipe, con TRU elegida, veía Arequipa y Lima y pidió que todo sea de la tienda donde está; la vista de las tres es de CAYLA Global.
Las otras tiendas quedan solo donde hay algo que hacer con una prenda de la tuya (pedir, mandar, «Dónde hay»).
Qué sigue: `/formidable` y `/chaos`; pedir el motor solo de la tienda (no urge).
