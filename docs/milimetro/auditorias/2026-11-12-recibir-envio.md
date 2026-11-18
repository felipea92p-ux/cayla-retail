# Auditoría al milímetro — /recibir/envio/[id] · 2026-11-12 · claude/mis-envios-faltaron-reales (a9e40b993)

Medido: 1440×900 claro vivo (el contador y «Revisa y cierra») · 1440 oscuro (color de «Revisa y cierra») · el ancho del panel (877 px de placa) y 1024 px a ojo
Servidor: http://localhost:3010, base local con ENV-001660 en curso (la recepción de Felipe), sin escribir nada.
Resumen: 0 graves · 0 medias · 1 leve · 4 decididos a propósito o heredados

Lo que cambió en esta rama y se midió: «Revisa y cierra» rediseñada (cifras arriba, «Lo que te toca decidir», «Lo que cuadra» plegado, «Antes de cerrar» en una
tarjeta, el pie que dice qué falta), el contador con paso 1 y paso 2 lado a lado, la tabla de tallas con el 0 centrado y «Llenar todas con», y el contador que rueda.

## Graves
Ninguno. Contraste: 0 textos bajo 4.5:1 en claro y en oscuro dentro de «Revisa y cierra». Blancos bajo 24 px: 0. Ningún botón que confirma apagado por lo que
falta («Cerrar el envío» sigue tocable y lleva a lo primero que falta, ADR-0611 mejora 4).

## Medias
Ninguna nueva.

## Leves
1. Filas de «Falta contar» y de la tabla corta de lo que cuadra — `CerrarEnvio.tsx` (`filaSinContar`, `filaQueCuadra`) — el medidor de /espacio marca «adentro 16 px >
   afuera 0 px». Son filas de `<Tabla>` separadas por su línea, como el resto de las tablas del ERP: se deja así. [Práctica] — va a /espacio.

## Decidido a propósito o heredado (no lo trajo esta rama)
- Cifras proporcionales en DM Sans (29 cifras piden tabulares y la letra no las tiene): es la propuesta 1 del tablero (`docs/milimetro/propuestas.md`), de todo el ERP.
- Chips y pie de campo a 13 px, el globito de `TituloSeccion` a 10,5 px: medidas de piezas decididas (`<Chip>`, `<Campo pie>`, `cuenta`).
- «Llegó dañada» y «Es otra prenda» apagados en un modelo nuevo por crear: el motivo lo dice `notaDeAlgo` debajo; es de antes de esta rama.
- El dial del contador avisa de un desajuste servidor/navegador en sus coordenadas (redondeo de `Math.cos`): es de antes de esta rama; anotado en el backlog.

## Falsos positivos confirmados
- /textos «botón en dos renglones» en «Llegaron las 10», «No llegó nada» y las opciones de «¿Qué pasó?»: miden 40 y 32 px de alto, en un renglón (`white-space` y alto medidos).
- /textos «cortados» en el contador que rueda: es la tira de 0 a 9 dentro de su ventana (`overflow: hidden` a propósito).

## Sin medir
- 375×812: Recibir es de escritorio (CLAUDE.md, PL-105 no lo incluye); a 1024 px los pasos van uno bajo el otro y se miró a ojo.
- Foco (`{ foco: true }`) y /movimiento: no se corrieron; el foco movería el scroll de la pantalla donde Felipe estaba contando.
- Los estados que exigen guardar (cerrar de verdad): `/chaos` todavía no lo probó en esta rama.
