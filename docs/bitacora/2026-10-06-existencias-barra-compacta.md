## 2026-10-06 (Existencias: la barra de buscar se achica y el texto del medio se va)
Qué hice: la barra de Existencias pasa de unos 190 px a 120 px de alto: buscar del alto de un control, «Filtros» solo como icono con el anillo del día al lado, los atajos siempre con su nombre, tabla o tarjetas en un solo icono, y la cifra sin frase de ayuda. El aviso del piso sin cuadrar y la franja vacía de «Colgar primero» salen de encima de las tarjetas: la pausa la dice el atajo «Por colgar» (pausa en vez de «0», con su explicación) y su lista vacía, con «Cuadrar el piso». La maqueta táctil tiene la misma barra.
Por qué así: con la barra grande y tres líneas de aviso, las prendas empezaban a media pantalla; los atajos solo con iconos obligaban a adivinar en una tablet, y los avisos repetían lo que ya dice «por cuadrar» en la cifra de arriba.
Felipe se lleva: ADR-0344, «Actualización 2026-10-06»: qué decisiones cambian, por qué el anillo va junto a Filtros y no en la cabecera, y las medidas a 1440, 1280, 1024 y 375 px.

## 2026-10-06 (Existencias: Filtros ordenado en tres filas y tarjetas más bajas, sin amontonar)
Qué hice: «Prioridad | A–Z» y el sonido pasan al panel «Filtros», que queda en tres filas con nombre (Prenda · Gestión · Vista); la acción de cada tarjeta sube a la fila de los colores y dice su nombre al pasar el cursor (y siempre con el dedo), con la ventana de las otras acciones; los atajos se deslizan en una fila bajo 1280 px y el anillo dice cuántos pendientes hay en vez de «Al día». La maqueta táctil tiene lo mismo.
Por qué así: la fila del buscador tenía siete controles y las tarjetas una fila vacía abajo; se pidió aprovechar el espacio sin que se vea amontonado.
Felipe se lleva: ADR-0344, «Segunda vuelta del mismo día»: medidas (tarjeta de ~240 a 192 px) y por qué el nombre de la acción aparece al pasar el cursor y no siempre.

## 2026-10-06 (Existencias: el panel de la talla dice si hay, si colgar y si pedir)
Qué hice: en «Esta talla», la frase verde «Disponible: N» se reemplaza por tres respuestas —Hay, Colgar en el piso, Pedir a otra sede— con su sí o no, su porqué y su botón cuando se resuelve ahí; «Faltan en el piso» aparece aunque el motor no decida. La maqueta tiene el mismo bloque.
Por qué así: con el motor sin responder o el piso en pausa, el panel callaba lo importante; una talla con 0 en el piso se veía «disponible» en verde.
Felipe se lleva: ADR-0344, «Tercera vuelta»: por qué manda el motor cuando decide y por qué en pausa no se manda a colgar.
Y la talla que más se vende, con un filtro puesto, lleva un solo borde sólido: sobre una talla sin stock se veía un borde doble (punteado y sólido).
Y las acciones del panel siguen a la talla: primero lo que necesita, después lo que se puede usar y, al final y chico, lo que no se puede ahora con su porqué; cada acción conserva su tecla.

Y la maqueta táctil publicada (versión 13 del enlace de siempre) trae su parte escrita al día: fecha y commit de referencia, los recuadros que todavía hablaban del interruptor «solo iconos» y de la ventana que repetía la acción principal, y una sección nueva, «Lo que cambió el 6 de octubre», con las tres decisiones del día.

## 2026-10-06 (Existencias: la vista en Filtros, el buscador a lo ancho y el panel lateral sin amontonar)
Qué hice: tarjetas, tabla o por talla pasan a «Filtros ▸ Vista» (con su chip «Vista: … ×»), el buscador ocupa la barra, y el panel de la talla queda en dos tarjetas: «Qué toca» con preguntas cortas (¿Hay? ¿Colgar? ¿Pedir?, con las otras sedes bajo «¿Pedir?») y «En este modelo» (tallas que faltan como botones y «Casi no hay aquí» con su «Pedir» alineado); «Todas» con una sola leyenda y «Colgar varias» sin casillas vacías. Igual en la maqueta, publicada.
Por qué así: se pidió usar el espacio de la barra y que el panel lateral no se vea amontonado; las mayúsculas partían «Colgar en el piso» en dos líneas y los botones de las franjas saltaban de línea.
Felipe se lleva: ADR-0344, «Cuarta vuelta del mismo día»: por qué «Casi no hay aquí» va sin «Pedir» dentro de «Colgar varias» (se perderían las cantidades).
