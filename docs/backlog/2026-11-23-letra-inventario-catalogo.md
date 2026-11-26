# Letra y texto de Inventario y Catálogo — 2026-11-23

Rama `claude/letra-inventario-catalogo`, sobre `main` (las actividades 1 a 4 ya entraron: PR #1978, #1981 y #1984).
Actividad 5 de las ocho mejoras de estética. ADR-0691. Sin migraciones.

## Hecho

- [x] **Letra (TSX):** 460 tamaños a mano de 150 archivos que se ven desde Existencias, Movimientos, Traslados, Conteo, Recibir mercadería,
      Productos, Categorías, Marcas, Atributos, Campañas e Insignias pasaron a la utilidad de su escalón. 40 botones recuperaron su
      interlineado (`leading-tight`).
- [x] **Los visores de cámara** (`EscanerCamara`, `EscanerBusqueda`, `EscanerConteo`, `ExistenciasEnCamara`, 20 tamaños): el puente no los
      alcanzaba porque van sobre el video. Sus rótulos estaban a 10 y 11 px; ahora, a 13. Se vieron con la cámara de prueba del navegador.
- [x] **Letra (hojas):** 343 tamaños de 18 hojas pasaron a `var(--text-…)`: los pases de Traslados, los sellos de Movimientos, la vista
      rápida, el historial de una prenda, «Ajustar stock», Recibir (la mesa, la recepción viva y el conteo), Ofertas, Campañas, Insignias,
      Fusionar, las parecidas de Nuevo producto, la etiqueta de campaña, la Vitrina de Existencias, «Ventas sin registrar» y el nombre que
      encabeza el globo del «?» (estaba a 10,5 px en todo el ERP).
- [x] **Letra fija, con su motivo:** el rótulo de la muestra de color de la vista rápida, el precio y el dato chico dentro de una celda de
      la matriz de tallas (vista rápida y Fusionar), el aviso dentro del cuadro de un QR y el signo «?» dentro de su círculo.
- [x] **Deuda de letra:** de 2.117 a 1.309 (de 401 a 232 archivos); por debajo de 13 px, de 799 a 450.
- [x] **Texto:** 31 frases.

| Dónde sale | Hoy | Ahora |
|---|---|---|
| Existencias ▸ aviso del piso sin cuadrar | Lo que dice «en almacén» puede estar colgado: los números del almacén no están verificados hasta el primer cuadre. | Lo que dice «en almacén» puede estar colgado hasta el primer cuadre. |
| Existencias ▸ Para hoy, sin stock | No queda ninguna, ni colgada ni guardada, y no viene ninguna en camino: pídela a otra sede o al Taller. | No queda ninguna ni viene en camino: pídela a otra sede o al Taller. |
| Movimientos ▸ nota | Registro transparente: cada movimiento queda con quién lo hizo, a qué hora y contra qué documento (boleta, factura del proveedor, traslado, conteo). No se edita ni se borra nunca — se corrige con otro movimiento, y los dos quedan. | Un movimiento no se edita ni se borra: se corrige con otro, y quedan los dos. |
| Movimientos ▸ Ingresos, vacío | En Tienda Lima no se cargó stock inicial ni se recibió mercadería en ese período. Prueba con más días. | Prueba con más días. (el título ya dice «No entró nada…») |
| Movimientos ▸ Ingresos, nota | Qué cuenta: lo que entró como stock inicial y como mercadería recibida, sumado por modelo. No resta lo que se ajustó después: para eso está la lista de Movimientos. | Qué cuenta: el stock inicial y la mercadería recibida, por modelo. Los ajustes están en Movimientos. |
| Movimientos ▸ Pérdidas, nota | Una sola cuenta: perder es todo lo que salió sin venderse —faltantes al contar o quitados a mano, dañadas que se botaron o donaron, la venta anulada cuya prenda no volvió y lo que faltó en un traslado (en la sede que lo envió)—. Es la misma cifra de «Mermas» en Finanzas. Lo liquidado es venta; el stock inicial, el primer conteo de una sede y lo que se mueve entre piso y almacén nunca son pérdida. Lo que apareció va aparte. | Perder es lo que salió sin venderse: la misma cifra de «Mermas» en Finanzas. Lo que apareció va aparte. |
| Conteo ▸ elegir prendas | Primero elige dónde vas a contar: así solo se buscan las prendas de ese lugar. | Primero elige dónde vas a contar. |
| Conteo ▸ abrir un conteo | Al empezar se congela lo que CAYLA dice que hay, para compararlo con lo que cuentes. | Al empezar se congela lo que CAYLA dice que hay. |
| Conteo ▸ nota | Cómo se cuenta: se escanea o se escribe lo que encuentras en la tienda y se compara con lo que CAYLA esperaba. Cada diferencia se confirma antes de cerrar y cada ajuste queda como movimiento. | Cada diferencia se confirma antes de cerrar y queda como movimiento. |
| Bajar al piso ▸ bajo el campo | La primera lectura de una prenda suma 1; si la misma vuelve a leerse, te pregunto antes de sumarla. Si tienes 12 iguales, toca «Cambiar cantidad». Si la etiqueta no se lee, escribe el modelo, la talla o el color y elígela de la lista. | Si una prenda se repite, te pregunto. Si la etiqueta no se lee, escribe el modelo, la talla o el color. |
| Bajar al piso ▸ rótulo del visor | Bajar · si se repite, te pregunto | Bajar al piso |
| Cuadrar el piso ▸ rótulo del visor | Cuadrar el piso · si se repite, te pregunto | Cuadrar el piso |
| Cuadrar el piso ▸ cuidados (1) | Hazlo antes de abrir: si mientras escaneas se vende, se repone o se recibe algo del almacén, tendrás que volver a escanear esas prendas. | Hazlo antes de abrir: lo que se mueva mientras escaneas hay que escanearlo de nuevo. |
| Cuadrar el piso ▸ cuidados (2) | Escanea solo lo GUARDADO. No escanees las dañadas (cuarentena) ni el estante de Apartados: el cuadre no las mueve. | Escanea solo lo guardado: ni las dañadas ni el estante de Apartados. |
| Cuadrar el piso ▸ cuidados (3) | Una prenda guardada sin etiqueta no se puede escanear y quedaría como colgada: cárgala antes de cuadrar. | Una prenda guardada sin etiqueta quedaría como colgada: cárgala antes. |
| Cuadrar el piso ▸ cuidados (4) | Lo escaneado se guarda en este equipo hasta 12 horas: termina hoy y aquí. | Lo escaneado dura 12 horas en este equipo: termina hoy y aquí. |
| Cuadrar el piso ▸ «Lo guardado» | La primera lectura de una prenda suma 1; si se repite, te pregunto. Si tienes 12 iguales, toca «Cambiar cantidad». | Si una prenda se repite, te pregunto. |
| Ventas sin registrar ▸ nota | Son prendas que caja vendió antes de que estuvieran en el sistema. Al regularizarlas, la venta pasa a la prenda real y el stock queda cuadrado. Las pendientes salen todas; las ya resueltas, las de este mes y el anterior. | Prendas que caja vendió antes de estar en el sistema. Al regularizarlas, el stock cuadra. |
| Nuevo producto ▸ categoría | La categoría trae el código, las tallas y los tejidos. Al tocarla, pasas al siguiente paso. | La categoría trae el código, las tallas y los tejidos. |
| Editar producto ▸ ficha del Taller | Cuánta tela y qué avíos lleva una prenda. Las órdenes de producción la proponen solas. | Cuánta tela y qué avíos lleva una prenda. |
| Historial de una prenda ▸ bajada | «Blusa Emma» · lo que cambió en esta prenda, quién lo hizo y cuándo | «Blusa Emma» · qué cambió, quién lo hizo y cuándo |
| Historial de una prenda ▸ recién creada | Cuando alguien le cambie el precio, un color, una etiqueta o la ficha, aparecerá aquí arriba, con su nombre. | Los cambios de precio, color, etiqueta o ficha aparecerán aquí, con su autor. |
| Historial de una prenda ▸ pie | Las ventas, traslados y ajustes de stock de esta prenda no están aquí: viven en Movimientos. | Las ventas, traslados y ajustes de stock están en Movimientos. |
| Familias ▸ interruptor prendido | Lo normal: lo que se vende de esta familia se cuenta como demanda y se pide al Taller o a Compras. | Lo que se vende cuenta como demanda y se pide. |
| Familias ▸ interruptor apagado | Sus ventas siguen entrando a caja y al comprobante, pero no cuentan como demanda ni se piden. Úsalo para bolsas, cajas o empaques. | Se vende, pero no cuenta como demanda. Para bolsas, cajas o empaques. |
| Marcas ▸ nota | Con productos activos, una marca no se desactiva. Se elimina solo si ningún producto la tuvo: así no se pierde historia. | Con productos activos, una marca no se desactiva. Solo se elimina si nunca tuvo productos. |
| Marcas ▸ editar, proveedores | Un proveedor con productos no se quita aquí: cámbiales el proveedor en Productos primero. | Un proveedor con productos se cambia primero en Productos. |
| Atributos ▸ Clases de avío | La clase de un avío decide tres cosas en «Nuevo avío»: en qué se cuenta (el hilo en conos), si lleva color y qué medida se le pide. Lo que una clase propone se puede cambiar al crear el avío; lo que no se puede cambiar nunca es la unidad, una vez que entró su primer lote. | La clase decide en qué se cuenta un avío, si lleva color y qué medida pide. La unidad no cambia después de su primer lote. |
| Insignias ▸ elegir el dibujo | ¿No está el que buscas? Sube tu imagen: mejor un PNG con fondo transparente, que se reduce a 256 × 256. | ¿No está? Sube tu imagen: mejor un PNG sin fondo. |
| Productos ▸ Por revisar | La creó alguien que no edita el catálogo. Mientras tanto se cuenta y, con precio, se vende. Rechazar es para siempre: para sacarla de venta un tiempo, descontínuala en su ficha. | La creó alguien que no edita el catálogo. Rechazar es para siempre: para pausarla, descontínuala en su ficha. |
| Productos ▸ Revisar precios | «Pierde dinero» y «margen bajo» se miden solo con el costo real de la prenda. Una prenda sin costo propio se compara solo con su categoría. | «Pierde dinero» y «margen bajo» usan el costo real de la prenda; sin costo propio, el de su categoría. |

- [x] Medido en 79 vistas (47 a 1440 × 900 y 32 a 375 × 812), en claro contra el «antes» y repetido en oscuro: 0 textos cortados
      nuevos, 0 desbordes; 19 vistas cambiaron de alto, casi todas más cortas por el texto.
- [x] Nada se guardó en la base: las vistas solo abren hojas.

## Pendiente

- [ ] **Que Felipe revise el tono** de las 31 frases. A mirar con cuidado: la nota de **Pérdidas** (se quedó en una línea; lo que
      cuenta y lo que no cuenta como pérdida lo explica el paso «Una sola cuenta» de la guía de esa pantalla) y los cuatro **cuidados de
      Cuadrar el piso**, que son instrucciones de stock.
- [ ] **Sin ver en pantalla** (cambiaron igual: es letra de lectura sin medidas fijas):
      la mesa de **Contar** de Recibir (ningún envío por recibir en Tienda Lima), la mesa de **Ventas sin registrar** (sin prendas por
      regularizar), las **parecidas** de Nuevo producto, la hoja **Fusionar productos** y un conteo en curso.
- [ ] **Textos que no se tocaron:** dos tienen una prueba que exige su frase exacta («Se muestran los 20 conteos más recientes…» y
      «Hasta cuadrarlo, «Hoy» no manda a colgar nada…»), y los de Categorías y Atributos ya van detrás del «?».
- [ ] **Sigue de antes:** el aviso de cierre de caja de la cabecera (necesita una tienda con hora de cierre), los gráficos
      (`graficos-tiempo.css`) y las preguntas del paso «Reemplazo» de Cambios.
- [ ] **El Inicio de almacén** (`inicio-almacen.css`, 51 tamaños): es del Inicio, no de Inventario. Va con la actividad 7.
- [ ] **En el pase de un traslado**, el sello «Recibida» pisa un poco la línea «Envía …». Ya pasaba antes; con el sello a 13 px se
      nota algo más.
- [ ] **Dynamic:** queda como tarea allá. Cambiaron dos hojas de `app/estilos/vidrio/` (`recibir-mesa.css` y `fusionar.css`): solo el
      tamaño de la letra, de pantallas que son de Retail.
