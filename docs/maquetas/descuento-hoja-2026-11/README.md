# Maqueta · el descuento de Vender (`/vender`) (2026-11-02)

Nació de una captura de Felipe: al tocar «%» en el panel de descuento del ticket, la sección «Porcentaje / Motivo» se siente confusa, y
propuso que se abra «al lado derecho, como el medio de pago». Esta maqueta lo dibuja para decidir mirando, antes de tocar el código.

Abrir `index.html` (con la config `maqueta-referentes` del `.claude/launch.json`). Es tocable. Parte de la mesa ya elegida de
`docs/maquetas/vender-vidrio-2026-11` (catálogo al aire, ticket en placa, foto al aire).

## Lo que hay hoy (`components/PuntoDeVentaTicket.tsx`, rama `descontando`)

Al tocar «Descuento» el ticket de 400 px **se reemplaza** por un panel: «% Porcentaje», un interruptor «% | S/», los atajos 5/10/15,
«Otro … %», el motivo en 2 columnas, «Aplicar a» y «Aplicar descuento». El cobro, en cambio, abre como **hoja ancha sobre el catálogo** con
el ticket quieto a la vista (`PuntoDeVenta.tsx`, `hoja-cobro`). Lo que confunde, medido en la captura:

1. El «%» sale tres veces (título, interruptor y campo «Otro»). El interruptor solo trae símbolos y «%» ya viene marcado: tocarlo no hace nada.
2. El título cambia solo a «Monto» al tocar «S/».
3. Los motivos se parten en 2 y 3 líneas con alturas desiguales.
4. «Aplicar a» (qué prendas) queda debajo del pliegue; no se ve a qué se descuenta.

## Las caras

| Cara | Qué es |
|---|---|
| Como ahora | Réplica del panel de hoy, para comparar al mismo ancho. |
| **A · Hoja lateral, como el cobro** (recomendada) | Una hoja de vidrio sobre el catálogo, con el ticket quieto a la derecha (igual que el cobro). Dos columnas: ¿A qué prendas? a la izquierda; ¿Cuánto? y ¿Por qué? a la derecha. Tres pasos numerados que se marcan ✓ al cumplirse. «Porcentaje» / «Monto en S/» con palabras; el motivo es una lista de una línea con sus palabras de siempre; «Quedaría en» y «Aplicar descuento −10 %» fijos al pie, como «Confirmar cobro». Se cierra con Volver, Esc o tocando el velo. |
| B · Dentro del ticket, arreglado | Mismo lugar de hoy, con las palabras, los tres pasos y la lista de motivos de A. Las prendas solo aparecen al desmarcar «Todo el ticket». |

En el celular (≤ 900 px) A y B son la misma hoja que sube desde abajo, con asa (como el cobro en la hoja del ticket); se abre con la
píldora «%» de la barra de abajo.

## Lo que no cambia (reglas de negocio)

Motivo obligatorio apenas hay descuento (una de las cinco razones de `RAZONES_DESCUENTO`, con las mismas palabras); argumento escrito pasado
el 15 %; el porcentaje deja cada prenda en un precio sin céntimos sueltos (ADR-0403); el monto en S/ se reparte entre las prendas según su
precio (la última se lleva el resto, para que la suma sea exacta); todo el ticket o prendas sueltas; «Quitar descuento». Cambia solo dónde y
cómo se dibuja. Nada de dinero, stock ni permisos.

## Medido

En Chrome sin ventana, 1440 px claro y oscuro, 375 px y a 1024 (la hoja de A apila sus columnas si queda angosta). Sin errores de JS. Un 20 %
sobre dos prendas pide el argumento; S/ 20 repartido en dos prendas suma S/ 20.00 exacto.

## Estado por la URL (para capturar o compartir)

`?dsc=ahora|hoja|ticket &tema=claro|oscuro &ancho=movil|w1440… &abrir=1 &modo=monto &pct=10 &monto=20 &razon=cerrar_venta &arg=texto &sin=0 &aplicar=1`

## Si Felipe elige

Implementación (aparte, con OK): una `HojaDeDescuento` que reutiliza el estado `descuento` / `onDescuento` que ya existe; en escritorio sale
del ticket y entra como `hoja-cobro`; en el celular sigue dentro de la hoja del ticket. Con ella: guía interactiva de Vender al día
(`data-guia`), prueba a 375 px, `/formidable` y `/unificar` (segmento con palabras, fichas de valor y lista de motivos como piezas únicas).
**Pendiente de decidir:** si el motivo conserva sus palabras largas (como en esta maqueta) o se acortan (decisión de negocio de Felipe).
