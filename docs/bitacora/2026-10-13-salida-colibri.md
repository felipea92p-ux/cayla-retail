## 2026-10-13 (La salida con el colibrí)
Qué hice: al apretar «Salir», la entrada al revés y más rápido (~2,2 s): la pantalla que se deja se encoge dentro de la silueta del colibrí, la ventana se cierra, el
colibrí flota en el centro mientras se cierra la sesión y carga el login, y vuela de vuelta a su lugar mientras el fondo oscuro se va. El login llega ya terminado, con su
colibrí en su lugar, y el colibrí de la capa aterriza exactamente encima. Con «reducir movimiento» no hay vuelo: se sale como siempre.
Por qué así: Felipe pidió un efecto «similar al de entrar pero al revés», se le dieron tres versiones en la maqueta (`docs/maquetas/login-entrada-2026-10/`: A espejo,
B espejo rápido, C cortina y vuelo) y eligió la B. Reutiliza la misma capa de la entrada: la salida es la entrada con el tiempo corrido hacia atrás (`estadoDeLaSalida`),
así que no hay una segunda coreografía que mantener. La sesión se cierra recién con la ventana cerrada, con la marca de «salida propia» del PR #1045.
Felipe se lleva: «Salir» ya no es un corte seco. Pendiente: verlo con cuentas reales (salir de Inicio, de Vender, de una terminal) y a 375 px. Verificado en local con una
«pantalla del ERP» y un «login» de prueba (sin cerrar sesión real) fotografiando el reloj instante por instante: la ventana se encoge y se cierra, el ave flota, aterriza
sobre el colibrí del login sin salto y la capa se retira limpia; `lib/login-entrada.test.ts` (29 pruebas) cubre el recorrido, la espera y que nunca retrocede.
