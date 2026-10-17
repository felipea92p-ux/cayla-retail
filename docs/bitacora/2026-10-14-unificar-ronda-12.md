## 2026-10-14 (/unificar: los pendientes antes de la ronda 12 — la cabecera de todo el ERP, «Etiquetas», el «Ver» de Caja, Nueva compra y los contrastes)
Qué hice: cerré lo que las rondas 9–11 dejaron anotado. Sin decisión de por medio: Nueva compra a 1440 px (la fila reparte el ancho y el combo
de talla dice «Sin desglose» cerrado, con `Opcion.corto`) y 91 textos tenues que no llegaban a 4,5:1 en Compras, Por pagar, Categorías y
Configuración (y la fila «ya pasó» de Finanzas, que ahora atenúa su texto y no la opacidad entera). Para lo de Felipe armé una página de elegir
con fotos de cada pantalla —la cabecera de hoy y la de Inventario puesta en su lugar en el navegador— y demos vivas; eligió P1 · P1 · P1: la
cabecera de Inventario en todas las pantallas menos Finanzas, «Etiquetas» con la etiqueta y el «Ver» de una fila como el enlace. Migré 31
pantallas (Compras, Recibir, las 8 de Producción, el resto de Catálogo, Configuración, Rendimiento, Actividad, Etiquetas de precio, Inicio,
Comercial y Buscar), con su decisión `titulo-pagina` y sus firmas en `familias.mjs`: deuda 0.
Por qué así: «una función, una pieza» (ADR-0358) y lo que ADR-0220 dejaba «sin decidir»; la pieza aceptó lo que cada pantalla traía (frase
opcional, el sobretítulo tras la fecha) para no inventar textos ni perder datos, y la sede de arriba dice qué está mirando la persona.
Felipe se lleva: una sola cabecera en todo el ERP (menos Finanzas, por su spike), vigilada por la prueba; las fotos de antes y después en claro,
oscuro y 375 px (`docs/unificar/capturas/titulo-pagina.*.jpg`). Familias y Editar producto no se miraron en local porque a la base le falta
`familias.entra_a_motores` (ADR-0377).

## 2026-10-14 (/unificar: ronda 12 — guardar, editar y las hojas, decididas y migradas)
Qué hice: traje `main` (con el #1074 ya fusionado; tres huellas de guías regeneradas), corrí el censo de las tres familias con Admin y el
mostrador y armé una página de elegir con cinco preguntas y demos vivas (hojas que entran como una de verdad, un botón que espera 2 s).
Felipe eligió las cinco P1: «Guardando…» y el hilo sin cambiar de ancho; «Editar» secundario con el lápiz y, en una fila, el lápiz solo;
y toda hoja con la misma cara (papel, sin sombra, título de 24 px), tres anchos con nombre y una salida a la vista. Lo hice en las piezas
(`Modal`, `Boton`, `BotonCompacto`, `FlujoGuiado`, dos piezas nuevas `BotonEditar`/`LapizEditar`) y migré con dos codemods y a mano:
146 anchos, unas 30 salidas, 140 botones que esperaban a mano y 22 «Editar». Deuda 0, con firmas nuevas en `familias.mjs`.
Por qué así: «una función, una pieza» (ADR-0358); la pieza decide sola (la colaboradora no tiene que adivinar si el botón se colgó) y
migrar no cambió qué hace ningún botón: solo cómo espera, cómo se ve y por dónde se sale.
Felipe se lleva: las hojas iguales en todo el ERP, una salida a la vista en cada una, botones que esperan igual y dicen su verbo, y las
fotos de propuesta y después en `docs/unificar/capturas/` (`accion.guardar.*`, `accion.editar.*`, `modal.*`).

## 2026-10-14 (/unificar: ronda 12 — el merge con Recibir contando, #1056)
Qué hice: al traer `main` entró «Recibir contando» (ADR-0393), hecho antes de la ronda 12; pasé sus hojas y botones a las piezas: seis hojas a
`tamano`, la × fuera de las cinco que guardan y ya tenían su salida al pie («Cancelar»; en Tallas y colores, «Dejar para después») y de
«Hay un costo fuera de lo normal», que sale con su «Volver»; siete botones que cambiaban la palabra a mano a `<Boton cargando textoCargando>` y «Describir ahora» a `<BotonEditar>`. La cabecera de `/recibir` sigue siendo
`EncabezadoPagina` y conserva la frase propia de recibir contando. «Guardando…» de cada línea del conteo queda con su `unificar-fijo` (es el
estado de la fila mientras se guarda sola, no un botón).
Por qué así: lo decidido es la única pieza también para lo que llega después; migrar no cambió qué hace ningún botón.
Felipe se lleva: Recibir contando con las mismas hojas y botones que el resto. No se miró en el navegador: la base local no tiene la migración
de ADR-0393 y no se aplican migraciones sin su pedido.
