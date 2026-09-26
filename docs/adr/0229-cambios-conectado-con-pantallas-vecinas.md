# ADR-0229 · Cambios conectado con las pantallas vecinas, en computadora y celular

- **Fecha:** 2026-09-26 · **Estado:** Aprobado por Felipe en el demo (tarjeta C «como hoy», fijo abajo A «Escanear»,
  al terminar A «Ticket + seguir vendiendo», y los cuatro accesos). **Producción:** sin migración ni RPC nueva; es solo
  pantalla.
- **Demo e investigación:** `docs/maquetas/cambios-mejoras-2026-09/` (demo comparativo + 6 sistemas de venta).
- **Alcance:** `app/(app)/cambios/page.tsx`, `components/CambiosPanel.tsx`, `CambiosFlujo.tsx`, `CambioReemplazo.tsx`,
  `BuscadorVentas.tsx` (props aditivas `onCamara` y `extra`; Devoluciones no cambia), `EscanerCamara.tsx` (exporta
  `crearLector`), nuevos `CambioSalidas.tsx`, `CambioTicket.tsx`, `EscanerBusqueda.tsx` y `lib/cambios-atajos-reglas.ts`
  (puro, con pruebas). `lib/cambios-reglas.ts`: el texto y el color del plazo.
- **Complementa:** ADR-0125 (flujo guiado de Cambios), ADR-0101 (traslado prellenado por URL), ADR-0152 (pedidos no
  atendidos), ADR-0166 (Apartados), ADR-0114 (ticket en la térmica), ADR-0206 (en el celular el menú es el ☰), ADR-0225
  (botón fijo abajo en el Inicio).

## Problema

Cuando la talla no estaba en la tienda, el paso 3 decía «no queda aquí — hay en AQP» y ahí terminaba: la colaboradora
tenía que salir a buscar Traslados, Apartados o Pedidos no atendidos por el menú. «Escanear prenda» no escaneaba: solo
ponía el cursor en el campo, y en el celular no hay pistola. Al terminar, la clienta no se llevaba nada que dijera qué
cambió. Y «Dentro del plazo» se veía igual en una compra de hoy que en una de hace 14 días.

## Decisión

- **D1 — Salidas cuando la talla no está (`CambioSalidas`).** Cada una lleva a la pantalla que ya sabe hacerlo, con lo
  elegido puesto; nada se mueve desde Cambios:
  - **Pedirla a otra sede** → `/inventario/mover?origen&destino&variante&cantidad=1` (ADR-0101). Esa página solo respeta
    el origen por URL para un líder; por eso a una integrante se le dice dónde hay y que se lo pida a su líder, sin un
    enlace que la haría despachar desde su propia sede.
  - **Apartarla cuando llegue** → Apartados. **Decidido sin tocar el modelo:** el cambio NO queda «en espera». Apartados
    solo aparta lo que está en el piso, así que se aparta cuando llega y el cambio se hace cuando la clienta vuelve. Un
    estado «cambio en espera» pediría una columna y una regla nueva en `registrar_cambio` (principio 5: no hay volumen
    que lo pida todavía).
  - **No quiere esperar** → «Anotar que no había» (la misma pieza del Punto de venta, firmada con el responsable del
    cambio).
  - **No quiere nada a cambio** → Devoluciones con la prenda ya elegida (el inverso del «Cambiar por otra prenda»).
- **D2 — Escanear de verdad.** En el celular, un botón fijo abajo, «Escanear prenda o boleta», abre la cámara
  (`EscanerBusqueda`, el mismo lector de Vender): lee UNA vez y busca. El QR de SUNAT de una boleta se traduce a su serie
  y número (`busquedaDesdeLectura`). En la computadora el botón sigue preparando la pistola. En el celular el chip
  «Escanear prenda» se esconde, porque repetía el botón fijo.
- **D3 — Ticket del cambio al terminar (`CambioTicketHoja`).** Una hoja (ADR-0136) con el resumen, y tres salidas:
  WhatsApp (la venta no guarda el teléfono, así que WhatsApp pregunta a quién), imprimir en la térmica
  (`#comprobante-print`) y «Seguir vendiendo» (Punto de venta). **Dice en los dos formatos que no es comprobante de
  pago.**
- **D4 — El plazo dice cuántos días quedan.** «Quedan N días» en verde, y en **ámbar** los últimos 3 días. Esto cambia la
  decisión del 2026-09-18 (verde hasta el final): Felipe eligió el ámbar en el demo.
- **D5 — La caja se ve antes de empezar.** Un chip «Caja abierta / Caja cerrada» junto al buscador: con la caja cerrada,
  una diferencia en efectivo no se puede cobrar, y la colaboradora se enteraba recién en el paso 3.

## Lo que queda fuera, a propósito

- **La diferencia de precio sigue sin comprobante ni líder** (`docs/pantallas/cambios.md` §2). Es dinero y SUNAT; se
  decide aparte. El ticket del cambio no lo resuelve y lo dice.
- La tarjeta de Actividad reciente se queda como hoy (opción C del demo). El filtro «Por vencer» del demo no entró.
- La ficha de la clienta: la venta guarda la clienta como texto, no su id, y `/clientas` no recibe una búsqueda por URL.

## Cómo se verificó

Servidor del worktree contra el Postgres local, con sesión de líder en Tienda Lima, a 375 px y 1440 px: el plazo en las
tarjetas, el chip de caja, el botón fijo solo en el celular, las cuatro salidas con una talla sin stock, el traslado
llegando prellenado (Taller → Tienda Lima, Falda Renata L negra; no se guardó) y un cambio real en la base local
(S/ 5.00 en efectivo) que abrió la hoja del ticket, con el ticket de impresión montado y el enlace de WhatsApp. `tsc`,
`eslint` y 77.765 pruebas en verde.
