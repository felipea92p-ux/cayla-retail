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
OK: migrar las otras barras (eran 14 archivos; «13» fue la cuenta del pedido) módulo por módulo, y decidir si las de Análisis (ADR-0357) y del aviso de cierre de Caja (ADR-0359) se unifican.

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

## 2026-10-09 (Vender, Caja y Producción migradas: ya no queda ninguna barra apilada a mano — ADR-0358)
Qué hice: seguí con el resto de las barras, un commit por módulo. Vender: la pieza homónima de Facturación y Proformas (que traía su propia leyenda)
pasó a llamarse `BarraConLeyenda` y dibuja con la barra del sistema, y «Cómo se pagó» de Historial pinta cada método con su token de color. Caja:
«Cobrado en el turno» y «A dónde fue el efectivo» del cierre. Producción: el hilo de costo de la tarjeta de una orden, el del panel y el reparto del
gasto del Taller. Salió de `globals.css` lo que murió (`.kpi-apilada`, `kpi-crece-x`). Con eso la deuda de `grafico.barra` llegó a **0**.
Por qué así: cada barra tenía su forma de medirse (contra un total que no es la suma, con un color por método, decorativa o con resumen para el
lector) y la pieza ya sabía todo eso desde Compras. El único hallazgo nuevo: un cuadrito de leyenda con un tono translúcido se veía más claro que su
tramo (el cuadrito sobre la tarjeta, el tramo sobre la arena); las tres leyendas afectadas usan ahora `MuestraTramo`. El seed casi no trae datos de
estas pantallas: se vieron con datos reales en Facturación e Historial y con una página de ensayo temporal, ya borrada, en el resto.
Felipe se lleva: una sola barra apilada en todo el ERP. No se vio en vivo un turno de Caja con ventas, un cierre con traslados ni órdenes reales.
Queda su decisión: si las barras de Análisis (ADR-0357) y del aviso de cierre de Caja (ADR-0359) se unifican.

## 2026-10-09 (La segunda revisión adversaria de la migración: lo que se corrigió — ADR-0358)
Qué hice: seis revisores de solo lectura y escépticos por hallazgo (34 agentes) revisaron la migración completa; doce hallazgos confirmados. En el
código: las barras que cambian mientras se escribe o se marca (el reparto de un pago, la mezcla de lo marcado, las tres partes de una nota) habían
perdido su transición (un tramo en 0 desaparecía de golpe); la pieza ganó `viva` y `sinEntrada`, una barra decorativa ya no muestra cifras crudas al pasar el
mouse, la raíz es un `<span>`, soltar el mouse de la barra entera suelta el resaltado, y la firma del candado ve ahora las barras de 3 a 8 px (atrapó
el medidor de Recibir y la barra a escala de `ResumenStockOverlay`, marcadas con su motivo). En los documentos: la rama de Frescura ya estaba en `main`
(#889), `TarjetaCobrado` no se ve en `/caja` por otra razón, `PorPagarProduccionPanel` es de Producción y el estirón de tres barras pasa de 1,7× a 1,35×.
Por qué así: «Ninguna pierde nada» era mi afirmación y no era cierta; la revisión la midió. Se corrigió lo que se podía sin cambiar qué hace nada y
lo demás se dejó como pregunta para Felipe.
Felipe se lleva: una pieza más robusta y un registro que dice lo que se vio y lo que no. Le quedan cuatro decisiones: las barras de Análisis y del aviso de
cierre de Caja, el medidor de Recibir, 1,35× o 1,7× en las barras de 8 px, y la leyenda de Frescura con `<MuestraTramo>`.
