# Spike · Punto de Venta: el ticket a lo alto (2026-09-26)

> **Estado: en revisión con Felipe.** Sin aplicar. Ajuste sobre la pantalla publicada con el ADR-0221 (#480).

`punto-venta-ticket-alto.html`: un solo archivo. La barra negra cambia entre escritorio y celular, «Hoy (publicado)» y
«Propuesta», abre «Más» o «Apartados» y vacía o llena el ticket.

## Lo que pidió Felipe, dicho en concreto

1. **Fuera «Apartar» y «Proforma» del pie del ticket.** Bajo el total solo quedan «Aplicar descuento» y «Dejar en espera».
2. **Sin franja de arriba.** Hoy, Caja, Cambios, Devoluciones, Historial, Proformas y Cerrar caja entran en «Más». «Más» se
   corre a la izquierda, sobre el catálogo, junto a la sede.
3. **El ticket sube** y ocupa la columna derecha de la tarjeta de arriba abajo: gana los ~62 px de la franja.
4. **«Apartados» se queda a la vista** y hace lo que hacía «Apartar» del ticket: con prendas en el ticket dice «Apartar N»
   y lleva a Apartados con esas prendas ya cargadas (`/vender/apartados?prendas=`, `lib/apartar-desde-ticket.ts`); con el
   ticket vacío abre Apartados tal cual.

## Decisiones del spike (a confirmar)

- La cifra de «Hoy» queda como texto chico a la derecha de la fila, además de estar arriba en «Más»: se sigue viendo sin
  ocupar un botón.
- «Proforma» ya no tiene puerta desde el ticket: se llega por «Más ▸ Proformas» y se arma allá.
- De paso: la tira de espera decía «3216 min»; pasa a «hace 2 días».
