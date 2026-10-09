## 2026-10-09 (La barra apilada es una sola para todo el ERP, y «Deuda por vencimiento» ya la usa — ADR-0358)
Qué hice: Frescura dejó la deuda (ADR-0208, act. 2026-10-07, en su rama): `ui/BarraApilada` y la barra de «Deuda por vencimiento» (Compras)
dibujada a mano. Para llevarla a `/unificar` el motor del censo aprendió a ver una barra hecha con cajas (antes solo veía SVG) y a correr con el
Chrome instalado (`NAVEGADOR_CANAL=chrome`, sin bajar el Chromium de Playwright). El censo y el código contaron quince archivos que dibujan esa
barra con casi diez caras: Compras (tramos sueltos que responden y se mueven), Facturación, Historial, Caja y Producción (píldora con pista, casi
siempre quieta) y la de Frescura. Felipe eligió mirando y tocando las demos: **P**, la pista de arena con el movimiento de Compras, tres altos
(12 · 8 · 4), 24 px para el mouse y una sola voz para el lector. La pieza (`ui/BarraApilada`, `MuestraTramo` y `app/estilos/barra-apilada.css`) es
un superconjunto de la de Frescura; «Deuda por vencimiento» la usa con las mismas funciones, el mismo resumen para el lector y las mismas
etiquetas de tramo. Antes de commitear, seis revisores de solo lectura y dos escépticos por hallazgo (30 agentes) revisaron el árbol: cuatro
hallazgos confirmados y varios menores, todos corregidos. Los de más peso: las firmas dejaban pasar cinco archivos que reparten un total (la
deuda pasó de 9 a 14), el censo contaba como barra la «Racha» de 14 días, y al apuntar el tramo translúcido grande se partía en tres franjas
(ahora cada tramo lleva su base de arena y las leyendas usan `MuestraTramo`).
Por qué así: candado 1 de la skill (Felipe elige mirando, nunca por una descripción) y candado 4 (migrar no pierde movimiento: lo que Compras ya
hacía se quedó y Frescura, que no hacía nada, lo gana). Qué cuenta cada tramo y qué pasa al tocarlo siguen siendo de la pantalla. Verificado en el
navegador local: reposo, mouse encima, foco del teclado y filtro puesto, en claro y oscuro, a 1440 y a 375 px; el filtro deja 3 de 5 filas y se
suelta con el segundo toque; el auditor de modo oscuro da 0 hallazgos; el censo de después muestra «Deuda por vencimiento» con la huella de P.
Felipe se lleva: una sola barra apilada, vigilada por `lib/unificar.test.ts` (14 archivos de deuda que solo bajan) y una prueba de la pieza
(`lib/barra-apilada.test.ts`). **Dos cosas a la vista en Compras:** al apuntar un tramo de «Deuda por vencimiento», los demás bajan al 35 % (hoy
solo se estira el apuntado); y los tramos de en medio son rectos (en la demo, los botones los traían redondos por el navegador). Quedan para su
OK: migrar las otras 13 barras módulo por módulo, y decidir si las de Análisis (ADR-0357) y del aviso de cierre de Caja (ADR-0359) se unifican.

## 2026-10-09 (Compras migrada entera a la barra apilada — ADR-0358)
Qué hice: Felipe pidió migrar las otras barras, empezando por Compras. Siete archivos de Compras dejaron de dibujar la barra a mano:
«Deuda por proveedor» (sus tramos son enlaces que filtran la lista), la mezcla de lo marcado, el reparto de un pago, Producción contra
Compras, la «Concentración» de Proveedores, las dos barras de Notas de crédito y las tres partes de la hoja de la nota. Para no perder nada, la
pieza aprendió a dibujar tramos con enlace, con etiqueta propia, que no responden o que el lector no oye, a resaltar sin dejar «presionado», a ser
decorativa, a medirse contra un total que no es la suma y a esperar a su tarjeta. Salió del CSS lo que murió (`.nc-conc`, `.nc-barra`).
Por qué así: cada barra de Compras tenía su manera de responder (un enlace, un botón que abre una vista rápida, un filtro con segundo toque,
nada) y migrar no puede cambiar qué hace: se probó cada una en el navegador local, claro y oscuro, a 1440 y 375 px, y las que el seed no muestra
(Notas de crédito) con una página de ensayo con datos de prueba, borrada después. En el camino apareció un descuido propio: los tramos que abren
algo salían «no presionado» para el lector; ahora solo es un interruptor si la pantalla maneja un filtro.
Felipe se lleva: Compras con una sola barra apilada (el censo la ve igual en todas, con su alto según el lugar). Quedan 7 archivos de deuda en
Vender, Caja y Producción.
