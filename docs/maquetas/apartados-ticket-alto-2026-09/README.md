# Spike · Apartados: pestañas a la izquierda y el ticket a lo alto (2026-09-26)

> **Estado: en revisión con Felipe.** Sin aplicar. Es el mismo ajuste que el spike de Punto de Venta
> (`docs/maquetas/punto-venta-ticket-alto-2026-09/`), aplicado a la hoja de Apartados publicada (ADR-0223, ADR-0236).

`apartados-ticket-alto.html` es un solo archivo y se abre sin servidor. Con la barra negra se cambia entre computador y
celular, entre «Hoy (publicado)» y «Propuesta», y entre las pestañas Apartar, Entregar y Todos. También se puede prender o
apagar el aviso de arriba y vaciar o llenar el ticket. El estado va en la URL; por ejemplo:
`#device=pc&v=prop&tab=entregar&aviso=1&lleno=1`. Las capturas están en `capturas/`.

## Lo que pidió Felipe, dicho en concreto

1. **Las opciones de arriba se corren a la izquierda.** Las pestañas Apartar / Entregar / Todos y el botón «Opciones»
   quedan pegados a «Apartados · Tienda TRU», separados por una raya fina. Hoy están en el otro extremo de la hoja.
2. **El ticket sube hasta el borde de arriba.** «Por apartar» (en Apartar) y «Saldo» (en Entregar) ocupan la columna
   derecha entera. La fila de pestañas y el aviso quedan solo sobre la columna de trabajo, la de la izquierda.
3. **La cabecera del ticket se alinea con las pestañas.** Baja de 84 a 64 px y queda en la misma raya.

## Lo que se gana (medido en el spike, hoja de 730 px de alto)

| | Hoy | Propuesta |
|---|---|---|
| Alto del ticket con aviso | 626 px | 730 px |
| Alto que queda para las prendas | ~340 px | ~464 px (**+124 px**: franja 64 + aviso 40 + cabecera 20) |
| Prendas enteras a la vista (de 5) | 2 | **3** |
| Sin aviso | +84 px | |

En Entregar, esos mismos píxeles hacen que entren sin desplazar el cobro, el medio de pago y las prendas que se lleva.

## Decisiones del spike (a confirmar)

- **En Todos no hay ticket**, así que la fila ocupa todo el ancho. Aun así, las pestañas siguen a la izquierda: si no,
  saltarían de lugar al cambiar de pestaña.
- **El aviso** («3 clientas vencen mañana…», «No hay caja abierta») pasa a vivir sobre la columna de trabajo, no a todo
  el ancho. Es un aviso de la pantalla, no del ticket.
- **En el celular casi no cambia nada.** Las pestañas ya están abajo (ADR-0223) y el ticket ya es un paso con su barra
  negra, así que no hay franja que quitar. Lo único que cambia es que «Opciones» se corre junto al nombre, igual que en
  el computador.

## Qué tocaría la implementación (solo web, sin migración)

- `apps/web/components/apartados/ApartadosPanel.tsx:77`: hoy el `<header>` y el aviso (línea 110) van arriba, a todo el
  ancho. Pasan a una pieza que el panel le entrega a cada vista, y cada vista la pinta al tope de su columna izquierda.
  En Todos va a todo el ancho. En la pieza, las pestañas y «Opciones» quedan pegados a la etiqueta y se quita el
  `justify-between`.
- `ApartarVista.tsx:449` y `EntregarVista.tsx:129`: la grilla `lg:grid-cols-[minmax(0,1fr)_420px]` llega al borde de
  arriba de la hoja. La cabecera del `<aside>` cambia `min-h-[84px] … py-5` por `h-16` (líneas 598 y 233).
- En el celular (`max-lg`) todo sigue apilado como hoy. Solo cambia el orden de la etiqueta y «Opciones».
- Se prueba a 375 px (PL-105) y se compara la captura con la de este spike.
