## 2026-10-07 (Ventas sin registrar: la mesa del «Puente», de la maqueta a la pantalla — ADR-0360)
Qué hice: Felipe pidió cambiar el estilo de «Ventas sin registrar»; hice tres maquetas, él eligió el formato de la A (talón y hilo), luego
la variante A2 «Puente», le ajusté la parte de arriba (una franja en vez de cuatro tarjetas y el anillo) y le agregué un buscador de todo el
catálogo bajo las sugerencias; después la implementé en `/inventario/por-regularizar`: la mesa (talones · puente · prendas con sus hilos), la
franja, la guía de foco y las animaciones de la maqueta, con los dibujos ya establecidos (`MosaicoPrenda`) y en tres modos según el ancho (tres
columnas, dos, y una hoja `<Modal>` en celular). Nueva lógica pura con prueba (`lib/por-regularizar-mesa.ts`, 28 casos), stock por tienda de
`fn_existencias` (`lib/por-regularizar-stock.ts`), CSS en `app/estilos/ventas-sin-registrar.css`, componentes en `components/por-regularizar/`. El
modal «Regularizar» ya no existe: es el puente. Sin migración; `regularizar_prenda` no cambió.
Por qué así: lo difícil de esa pantalla no es guardar sino reconocer la prenda (¿cuál de estas es?); ver la venta, la prenda y su diferencia de
precio al mismo tiempo, y que el botón no se esconda, es lo que la hace rápida. Las columnas del medio y de la derecha van pegadas a la ventana para
no obligar a desplazar nada que no haga falta; la sugerida usa la misma definición que la base (una sola prenda que calza y tiene unidades) y nunca
guarda sola.
Felipe se lleva: abrir `/inventario/por-regularizar` con la base local (hoy tiene 7 ventas de demostración de Tienda Lima, ver el backlog) y
probar elegir, buscar una prenda que no salió, regularizar y mirar la franja; a 1440 px (tres columnas), 1100 (dos) y en el celular. La
excepción de movimiento está escrita en ADR-0136 («Actualización 2026-10-07») y en CLAUDE.md. Decidir si A3 «Arrastrar» y A4 «Perchero» se
guardan o se borran de `docs/maquetas/`.

## 2026-10-07 (Ventas sin registrar: `/formidable` y `/chaos`, y lo que se arregló — ADR-0360, act. b)
Qué hice: corrí `/formidable` (prueba ciega, revisor de leyes y escéptico) y `/chaos` sobre la mesa y, con tu OK, ejecuté los cambios 1 y 2 de Formidable y los 4 hallazgos del caos: herramientas en una fila y
lo de líder en «Más», la rueda ya no se atrapa, el botón «Regularizar» se trae a la vista, el talón y el puente vuelven a decir talla y color anotados (y contra qué es un «≠»), todo el texto a 12 px o más
y el vacío del puente a 5,3:1, una sola parada de Tab para los talones con ↑ ↓, el foco vuelve al talón al cerrar la hoja del celular, y «ya la regularizó otra persona» relee la lista sola.
Por qué así: lo medido (la mesa al 64 %, el botón 460 px más abajo, la rueda atrapada) y lo observado (la ciega: 8 pasos, 7 dudas) apuntaban a lo mismo: lo que decide tenía que estar a la vista y legible.
Felipe se lleva: abrir la pantalla en 1440×900 y comprobar que la mesa empieza más arriba, que la rueda baja la página sobre las prendas y que el botón queda a la vista; falta el cambio 3 («¿Por qué?»
y un veredicto por tarjeta) y la pasada con colaboradoras reales.

## 2026-10-07 (Ventas sin registrar: el cambio 3 de Formidable, y nada queda pendiente de esa corrida — ADR-0360, act. c)
Qué hice: un veredicto por tarjeta («Calza en todo» o qué cambia) y la diferencia de precio siempre visible; tres «¿Por qué?» que se tocan (vencida, estas prendas, cuál elijo); aviso cuando falla la lectura del stock;
palabras de tienda («Venta y prenda», «Unidades libres»); sin chip «Pendiente» en el filtro «Pendientes» y una nota de pie corta. Una segunda prueba ciega completó la tarea al primer intento en 8 pasos, y de ahí salieron
dos ajustes: el botón «Regularizar» ya no se corta a 1440×800 ni a 720, y al abrir un «¿Por qué?» el puente se trae a la vista.
Por qué así: lo difícil tiene que vivir bajo un toque (ley 6) y una sola palabra por tarjeta se lee más rápido que tres notaciones del mismo dato.
Felipe se lleva: probar la pantalla con 3 a 5 colaboradoras reales (lo único que falta para llamarla Formidable); el resto de la corrida de `/formidable` y `/chaos` quedó hecho.
