# ADR-0511 — Vender: varios clientes a la vez, con pestañas de tickets (paso 1 de 3)

**Estado:** aceptada, **paso 1 en su PR (solo web, sin migración, nada en producción que pegar)**; los pasos 2 y 3 **no están construidos** y esperan el OK de Felipe ·
**Fecha:** 2026-10-25 · **Decidió:** Felipe (21 preguntas respondidas y la lista de 7 actividades aprobada el 2026-10-25) ·
**Sigue a:** ADR-0136 (movimiento), ADR-0149 (loader), ADR-0161 y ADR-0163 (quién atiende), ADR-0358 (una función, una pieza), ADR-0479 (hoja del celular)

## Contexto

Felipe: el Punto de Venta tiene que permitir varias ventas separadas a la vez, de clientes distintos, para que una cliente que paga o duda no frene a la
siguiente. En diciembre, con la campaña, cobran más de tres personas a la vez (hoy, hasta tres); en cada tienda hay una MacBook y celulares.

Lo que había (verificado en el código):

- **Un solo ticket vivo** (`carrito`) y una «espera» de hasta 5 tickets en el `localStorage` del navegador. Nadie en las tiendas conocía la espera: la tira
  solo aparecía cuando ya había algo esperando.
- **Una caja abierta por sede**: el índice único `cajas_ubicacion_abierta_unica` (`0008_caja_y_pagos.sql`).
- **Un cobro en vuelo por pantalla** (`useIntento("registrar_venta")`), y un loader que tapa toda la pantalla al guardar (ADR-0149).
- El stock del último talle ya era seguro con dos cobros a la vez (`FOR UPDATE`), así que el choque entre clientas no es un problema de la base.

«Varias ventas a la vez» eran **tres problemas distintos** y Felipe confirmó que los tres ocurren (sobre todo los dos primeros): una persona con varias
clientas a la vez, dos personas que quieren cobrar al mismo tiempo, y un cobro que tarda (tarjeta, Yape, RUC). Cada uno pide una solución distinta, por eso
se parte en tres pasos.

## Decisión

Las 21 respuestas de Felipe, que mandan:

| # | Tema | Decidió |
|---|---|---|
| 1–4 | El cuello | Los tres casos ocurren. Hasta 3 cobrando a la vez hoy, más en diciembre. Una MacBook y celulares por tienda. Nadie conoce «Dejar en espera». |
| 5 | Cómo se ven | **Pestañas siempre visibles**, desde el primer ticket (no una tira que aparece sola). |
| 6 | Nombre | **Automático** («Cliente 2»), sin preguntar; se cambia tocándolo. |
| 7 | Tope | **9** tickets abiertos por equipo, contando el de la caja (antes 5 en espera). |
| 8 | Qué recuerda cada ticket | Quién atendió, el cliente, descuento y cupón, boleta/factura y medio de pago. |
| 9 | La misma prenda en dos tickets | Solo un **aviso discreto**; no se reserva (el choque es improbable: cada integrante separa lo suyo). |
| 10, 11, 16 | Cobro en paralelo, loader, recibo | **Sí** al cobro en paralelo con el ticket congelado, loader **híbrido** (uno solo = pantalla completa; 2 o más = segundo plano) y recibo en chip si hay otros tickets. **Paso 3, sin construir.** |
| 12 | Máquinas de tarjeta | 2 o más por tienda: no hace falta «máquina ocupada». |
| 13, 14 | Entre equipos | Tickets **compartidos por la tienda** (MacBook ↔ celular), se traspasan a quien los abre. **Paso 2, sin construir.** |
| 15 | Caja | Una por tienda, registrando **quién cobró** cada venta (no una caja por cajera). **Paso 3.** |
| 17 | Recordatorio | La pestaña **late a los 5 minutos** sin atenderla (idea de Felipe). |
| 18 | Celular | Selector «Cliente 2 de 4» que abre una hoja con la lista. |
| 19 | Cerrar caja | Avisar con la lista y decidir. |
| 20, 21 | Fecha y entrega | «Para mañana antes de la apertura»; mi recomendación (aceptada) fue **tres pasos**, y solo el 1 es seguro para esa fecha: los pasos 2 y 3 tocan esquema en producción y dinero. |

### Lo construido (paso 1, 7 actividades más 2 arreglos)

1. **Cada ticket recuerda su cobro** (`lib/ticket-cobro-reglas.ts`): al dejarlo en espera y retomarlo vuelven quién atendió, la boleta o factura, el documento
   escrito a mano, el celular de la boleta, los pagos y el cupón. Se lee con tolerancia: un ticket guardado antes no trae nada de esto y vuelve con el cobro vacío.
2. **Pestañas y «Nuevo cliente»** (`lib/tickets-abiertos-reglas.ts`, `components/punto-de-venta/Esperas.tsx`). Cambiar de pestaña intercambia los dos
   tickets **sin mover a los demás**. Descartar pide confirmación. «Nuevo cliente» queda fuera del tramo que se desliza para no perderse con 3 o más.
3. **Celular (375 px):** el selector «Cliente 2 de 4» y la hoja a media altura «Tus clientes» (`<Modal mediaAltura>`, ADR-0479), con controles de 44 px.
4. **Recordatorio:** un punto ámbar fijo en cada ticket que espera; a los 5 minutos late con `punto-vivo`, **la pieza que el ERP ya usa** (Atrasadas, las
   tarjetas de cifra) y que se detiene con «reducir movimiento». **No hay animación nueva ni excepción nueva a ADR-0136.** Solo late el que lleva rato.
5. **La misma prenda en dos tickets:** `<Aviso>` en la línea («Ya está en el ticket de Cliente 1, y solo queda 1»), solo cuando entre todos piden más de lo
   que hay.
6. **Cerrar la caja con tickets abiertos:** una hoja lista los tickets con prendas antes del cierre. «Seguir con el cierre» no descarta nada por sí solo.
7. **Cierre:** guía interactiva y su huella, escenarios de modo oscuro, este ADR y la bitácora.

Arreglos que salieron de las pruebas, cada uno en su commit: los textos de los tickets pasaron de «clienta» a «cliente» (ADR-0288 act. k), y el ticket nuevo
nace con su nombre para que no cambie si otro se descarta.

### Un defecto que ya estaba

`limpiarTicket()` no vaciaba la boleta/factura ni el cupón: al dejar en espera un ticket de factura, el siguiente heredaba la factura y el cupón. Ahora los vacía
(lo exige que el cobro viaje con el ticket).

### Quién atendió y ADR-0161 (A6)

ADR-0161 deja el combo «¿Quién está atendiendo?» **vacío siempre** en Vender para no heredar a la persona de la sesión ni a la venta anterior. Recordar a quien se
eligió **a propósito para ese ticket** es otra cosa y es lo que Felipe pidió (pregunta 8). Se restaura solo si esa persona sigue presente en la tienda
(`responsableVigente`, la base la sigue validando); si salió, el combo vuelve vacío. **No se pudo probar en el navegador:** la cuenta de prueba es Admin (firma sin
combo) y la base local no tiene la asistencia de Dynamic. Lo cubre la prueba unitaria del lector del ticket.

## Lo que NO se construyó (y por qué)

- **Paso 2 — tickets compartidos entre MacBook y celular.** Tabla nueva en la base (con RLS, traspaso y vigencia): es un cambio de esquema en producción, y el SQL
  lo pega Felipe, por partes (ADR-0195). También resuelve que **el ticket de la caja vive solo en pantalla**: recargar la página lo pierde (los que esperan sobreviven).
- **Paso 3 — cobro en paralelo.** Un `useIntento` por ticket, el «cobro en curso» por ticket (hoy hay uno solo por sede, `claveCobro`), el ticket congelado
  mientras cobra, el loader híbrido (**excepción a ADR-0149**, técnicamente barata: ya existe `x-espera: no`), el recibo como chip, y «quién cobró» en cada venta. Toca
  dinero y stock: se prueba con carreras de dos cobros y reinicios antes de dar nada por listo.
- **Historial de tickets descartados.** Hoy viven solo en el navegador: no hay dónde anotar «descartado». Llega con el paso 2.

## DECIDÍ / DESCARTÉ / SE ROMPE SI

**DECIDÍ:** que el paso 1 sea solo pantalla y navegador: pestañas sobre el mismo ticket vivo y la misma lista guardada de siempre, sin tocar cómo se cobra.
**DESCARTÉ:** hacerlo todo antes de la apertura, porque el cobro en paralelo y los tickets compartidos tocan dinero y esquema en producción, y si fallan, fallan en caja
con clientes delante. Y también descarté un panel lateral de clientes, que le quita ancho a la pantalla.
**SE ROMPE SI:** la colaboradora recarga la página con un ticket armado en la caja (se pierde: solo los que esperan sobreviven); si dos equipos de la misma tienda
usan tickets distintos creyendo que son los mismos (cada equipo tiene su lista hasta el paso 2); o si alguien cierra la caja desde `/caja` en vez de desde Vender
(esa pantalla no ve los tickets de otro equipo y no avisa).

## Cómo se verificó

- `lib/ticket-cobro-reglas.test.ts` y `lib/tickets-abiertos-reglas.test.ts`: orden y posiciones (con toda combinación de posición y destino), nombres, tope, recordatorio y
  prenda repetida, incluidos los casos en que **no** debe avisar.
- En un navegador real contra la base local (escritorio 1440 px, celular 375 px con pantalla táctil, y «reducir movimiento»), siete recorridos que no cobran ni
  escriben en la base: espera con cobro, pestañas, celular, recordatorio, prenda repetida, cierre de caja y nombre estable.
- La guía de Vender recorre sus 21 pasos en escritorio y 16 en celular sin escribir en la base. Knip, el linter, el chequeo de tipos y toda la suite en verde.
- Cinco escenarios de modo oscuro registrados en `tema/escenarios/registro.mjs` (`vender.tickets`, `vender.tickets-descartar`, `vender.tickets-cierre`, `vender.m-tickets`, `vender.m-tickets-lista`), auditados con la cuenta Admin: 0 hallazgos solo en oscuro, y las capturas se miraron (la marcada se invierte con buen contraste; el aviso de la prenda repetida conserva su borde ámbar). Las otras cuentas no se auditaron: la base usada solo trae a Admin.

## Se rompe si (resumen operativo)

Nada se cobra distinto: `registrar_venta`, la caja y el stock no se tocaron. Revertir el paso 1 es revertir los commits del PR; los tickets que ya estaban en espera
siguen abriendo (el campo `cobro` es opcional).
