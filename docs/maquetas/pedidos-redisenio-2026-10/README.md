# Tienda web ▸ Pedidos: rediseño visual (maqueta, 2026-10-31)

Prototipo tocable de `/tienda-web/pedidos` con **todas** sus vistas y hojas. **No cambia el ERP**: es solo `index.html` + `maqueta.css` + `datos.js` +
`base.js` + `hojas.js`, sin base ni red. Usa solo los tokens de `globals.css` y `tema.css` (claro y oscuro). Abre `index.html` (con `?quieto` se
apagan los movimientos, para capturas).

Se hizo mirando el código real (`PedidosWebPantalla.tsx`, `PedidoWebHoja.tsx`, las 6 hojas y `pedidos-web-reglas.ts`): mismos estados, plazos, motivos
y reglas. Cambia cómo se ve y cómo se lee, no qué hace.

## Cómo recorrerla
La barra negra de arriba es de la maqueta (no del ERP):
- **Pantalla:** día con pedidos · día tranquilo · sin pedidos todavía · cargando · no se pudo leer · sede sin tienda · pedido que no abre.
- **Sede:** Tienda TRU, o Tienda LIM (dos empresas: cada prenda muestra CAYLA o CLAURE).
- **Escritorio / Celular · Claro / Oscuro.**
- **Caja abierta / cerrada:** con la caja cerrada, el efectivo no se cobra ni se devuelve.
- **Cortar internet al guardar:** el próximo guardado queda «sin saber» y aparece «Revisar si se guardó».
- **Resaltar lo nuevo** marca con borde rojo lo que cambia. **Qué cambia** lo lista. **Reiniciar** vuelve a los datos de partida.

Todo guarda de verdad dentro de la maqueta: confirmar mueve el pedido a «Por cobrar»; el pago que lo completa lo pasa a «Por entregar» y le saca su
boleta; entregar (código de prueba **2094**) lo manda a «Cerrados»; anular, devolver y enviar también cambian la lista.

## Vistas y hojas incluidas
**Pantalla:** cabecera con «Cobrado hoy» · camino de 4 estaciones (filtra la lista) · «¿Cómo funciona?» · «Otra sede te pidió esto» · «Lo que te toca»
(por grupos) · cada estación filtrada y su vacío · «Todo al día» · cerrados con resumen por motivo, buscador y «Ver más» · cargando · error · sede sin
tienda · pedido que no abre.

**Hojas:** pedido por confirmar (decidir cada prenda: almacén o piso, pedirla a otra sede, comprarla, pedirla al taller, quitar; avisos de «la última» y de
quién la pidió antes) · no se puede confirmar · pedido por cobrar (recién confirmado, sin pagar, adelanto, «Reservarla») · anular el pedido · reservar
una prenda que llegó · registrar un pago (Yape, Plin, transferencia, efectivo; caja cerrada; todo lo que falta) · anular o devolver un pago · pedido
pagado (sin recoger, espera una prenda, entregar con código, código malo) · anular un pedido pagado (prendas, plata, boleta, nota de crédito, boleta
aún enviándose) · pedido entregado, cerrado sin confirmar, anulado, por devolver, anulado después de pagarse · enviar a otra sede · mensaje
predeterminado · avisos del celular (apagado, activo, activo en otra tienda, iPhone sin instalar, bloqueado, Android con sonido, sin soporte) ·
ticket de la boleta · avisos emergentes de cada guardado.

## Lo que se propone (todo marcado con «Resaltar lo nuevo»)
1. El **camino** siempre a la vista, con el plazo entre pasos.
2. La lista **por grupos** (Urgente, Pide tu atención, En plazo, Esperan una prenda) y filas con **franja de color** y barra de plazo. Sin encabezados.
3. **Cerrados:** resumen por motivo que filtra y buscador (hoy crece sin forma de encontrar uno).
4. **Cabecera** más liviana: Avisos y Mensaje a la par, «¿Cómo funciona?» como ícono.
5. **Hoja del pedido en dos columnas** con su **ruta** (Confirmar → Cobrar → Entregar), el cliente y el dinero al costado, y botones siempre a la vista.
6. **«Falta: …»** en cada hoja (guía de foco): dice qué falta y lleva al campo.
7. **Código de entrega en 4 casillas.**
8. **Mensaje predeterminado** con botones para insertar Nombre, Tienda y Código (hoy se escriben las llaves a mano).
9. **Textos más cortos** en toda la pantalla (una idea por frase).
10. En celular, las hojas llegan desde abajo y el primer botón es el principal.

## Cuando la prenda no está en la tienda del pedido
Si hay en la tienda (almacén o piso), se reserva ahí. Si no, la hoja muestra las tres salidas, más «Quitar del pedido»:
- **Pedirla a otra sede** (una opción por cada sede que la tiene): se reserva allá y esa sede la envía en un traslado. Esa sede ve «Otra sede te pidió esto» con «Enviar a …».
- **Comprarla:** con fecha prometida; queda «Por comprar».
- **Pedirla al taller:** con fecha prometida; queda «En taller».

## Lo que NO cambia
Reglas de negocio, plazos (24 h · 48 h · 7 días), estados, permisos y roles, responsable en cada guardado, caja, boleta y SUNAT, notas de crédito,
loader único, vocabulario («cliente», «tienda»). Dinero, stock, permisos y comprobantes siguen siendo decisión de Felipe.

## Piezas que se apartan de «una función, una pieza» (ADR-0358) y necesitan su OK
La fila de pedido como tarjeta con franja (hoy es una fila de `Tabla`), las 4 casillas del código (hoy un `CampoTexto`), la ruta del pedido (nueva) y
los botones de insertar del mensaje (nuevos). Si Felipe las aprueba, pasan por `/unificar` antes de construirse.

## Datos
**Inventados:** nombres, teléfonos, correos, números de operación y de boleta, fechas y la hora «ahora» (12:55). **Reales:** la forma de cada estado,
los plazos de fábrica, los motivos, las plantillas de WhatsApp y los textos de las reglas (acortados).
