# Spike visual · Historial de ventas conectado y usable en el celular (2026-09-26)

> **Estado (2026-09-26): aplicado (ADR-0230, PR #488).** Felipe eligió todo lo «encendido de fábrica» más «Volver a
> vender», «Exportar (líder)» y «Buscar por nº de operación Yape»; quedaron fuera WhatsApp y nota interna. En el celular
> se usó la variante A (hoja desde abajo). La migración del nº de operación espera su OK para producción.
>
> **Lo de abajo es el estado original del spike:** en revisión con Felipe, sin aplicar. No toca `vender/historial/page.tsx`,
> `HistorialVentasLista.tsx`, `DetalleVentaModal.tsx` ni ninguna RPC: es HTML/CSS/JS autocontenido
> con datos inventados (las 7 primeras ventas reproducen las capturas del 26-set), para decidir
> qué se construye antes de construirlo.

`historial-spike.html`: un solo archivo, ábrelo en el navegador. La barra negra de arriba no existe
en el ERP; sirve para cambiar lo que se ve:

- **Escritorio / Celular / Otros sistemas / Hallazgos**: las cuatro vistas.
- **Hoy / Propuesta**: «Hoy» reproduce la pantalla actual; «Propuesta» enciende lo marcado.
- **Líder / Colaboradora**: la colaboradora no ve otras tiendas ni «Anular venta», y «Mis ventas»
  son las de Angie Chavez.
- **Encendido de fábrica** (buscador, Hoy · Mis ventas · Por enviar, avisos, acciones, marcas de
  posventa y apartado, recorrido) y **Por elegir** (WhatsApp, volver a vender, exportar, nº de
  operación Yape, nota interna).
- **Celular**: A · hoja desde abajo, B · página propia, C · acciones en la fila, o las tres lado a lado.

Para probar el buscador: `B004-31`, `Rivas`, `7045`, `carlita`. Mira **todas las fechas**, no solo el
período: «Rivas» encuentra una factura rechazada del 15 de agosto.

## De dónde sale

Felipe pidió conectar Historial con las pantallas nuevas que trabajan de la mano con él y que
funcione en el teléfono. Se revisaron sus 3 capturas y el código de `main` (`471ee16b`). Los nueve
hallazgos están en la vista «Hallazgos»; los tres más grandes son:

1. **No hay buscador** (`FiltrosHistorialVentas.tsx`): para encontrar la venta de una clienta que
   vuelve a cambiar hay que bajar día por día.
2. **El detalle solo imprime** (`DetalleVentaModal.tsx:182-197`). Cambios y Devoluciones ya aceptan
   `?q=`, así que se puede llegar con la venta cargada sin tocar la base.
3. **«Pendiente de enviar» no lleva a ninguna parte**, y un comprobante rechazado de hace más de 30
   días no aparece.

La comparación con Shopify POS, Square, Lightspeed, Loyverse y Odoo está en «Otros sistemas». Sale
de su documentación pública; **no se verificó en vivo**.

## Qué pide cada opción

| Opción | Solo pantalla | Lee algo que ya existe | Pide decisión o base |
|---|---|---|---|
| Buscador único | | `ventas`, `comprobantes`, `clientas`, `variantes` | |
| Hoy · Mis ventas · Por enviar + atajos elegibles | ✓ | | recordar los atajos de cada persona (navegador o base) |
| Avisos arriba (SUNAT, apartado que vence) | | `comprobantes.estado`, `apartados.vence_el` | |
| Acciones → Cambios, Devoluciones, Comprobantes, Clientas, Apartados | ✓ (`?q=` ya existe) | | |
| Marcas «Tuvo cambio» / «Devuelta» / «Desde apartado» | | `cambios.venta_item_id`, `devolucion_items.venta_item_id`, `venta_pagos.metodo = 'anticipo'` | |
| Recorrido de la venta | | ✓ | |
| Celular A / B / C | ✓ | | |
| Exportar (líder) | ✓ | | |
| Enviar por WhatsApp | | | enlace público del comprobante y número de la clienta |
| Volver a vender | | | el POS tiene que aceptar prendas por URL |
| Buscar por nº de operación Yape/Plin | | | `venta_pagos` no tiene columna de referencia |
| Nota interna | | | columna o tabla nueva |

## Qué queda por decidir

- Cuál de las tres formas de abrir una venta en el celular.
- Cuáles de «Por elegir» entran.
- Dónde se guardan los atajos que elige cada colaboradora: en el navegador (sin base, pero se
  pierden al cambiar de equipo) o en la base.
