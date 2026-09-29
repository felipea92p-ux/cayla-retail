## 2026-09-29 (Cada escaneo deja el campo de Vender limpio; entra al ticket solo si hay en el piso)

Qué hice: en Vender, cuando la pistola leía un código que el sistema no reconocía, el texto se quedaba escrito en
el campo y la siguiente lectura se escribía ENCIMA («CMS'0011…CMS-0011…»): ninguna volvía a coincidir y la
encargada tenía que borrar a mano. Ahora cada Enter cierra la lectura y deja el campo vacío, la haya encontrado
o no; lo que no se encontró se dice en el aviso, con el código. La decisión de qué hace el Enter salió de
`PuntoDeVenta` a `accionDelEnter` (`lib/vender-buscador-reglas.ts`), con pruebas.

Por qué así: lo de «se agrega al ticket solo con stock» ya era así y ahora queda probado: el código exacto de
una prenda con piso entra; sin piso (agotada, en el almacén de la tienda o apartada) no entra y el aviso dice por
qué; un código desconocido no entra. Esa decisión sigue siendo de `agregar` (`motivoNoCobrable`), una sola, la
misma para la pistola, el teclado y la cámara. Sin migración: solo web.

Felipe se lleva: probar en tienda escaneando (1) una prenda con stock → entra y el campo queda vacío, (2) una sin
stock → aviso ámbar, no entra y el campo queda vacío, (3) un código de otra marca → «No encontramos…» y el campo
vacío. No se verificó en el navegador (el inicio de sesión de desarrollo no se pudo automatizar): cubre la lógica
la prueba `vender-buscador-reglas.test.ts`. Queda igual en Apartar (`ApartarVista`), que conserva el texto si no
encuentra la prenda: se dejó fuera a propósito porque el pedido era del ticket.
