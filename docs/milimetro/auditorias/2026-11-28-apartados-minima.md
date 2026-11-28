# Auditoría al milímetro — Apartados en tres pestañas (Pendientes, Historial y el cobro) · 2026-11-28 · `claude/apartados-minima`

Medido en local con la página de prueba de la maqueta (datos inventados, una base de mentira: ni producción, ni una sesión, ni la base
compartida), corriendo los medidores de `/milimetro`, `/espacio`, `/tipografia`, `/color`, `/movimiento` y `/textos` con Playwright sobre
las tres vistas que cambian en ADR-0720 (actividades 1 a 4): la lista de Pendientes, la del Historial y el cobro que abre una fila. Anchos y
temas: 1440 × 900 en claro, en oscuro y quieto; 1024 × 768; 375 × 812 con el dedo. El foco se midió aparte, con una tecla Tab real
(`window.__milimetro = { foco: true }`). No hay gráficos en estas vistas.

Resumen: **2 medias arregladas · 2 leves arregladas · 0 graves abiertas** · lo heredado de piezas compartidas, abajo.

## Medias (arregladas)

- **Pendientes ▸ Pedidos entre tiendas a 375 px:** la insignia («En camino desde AQP») se quedaba en la fila del texto y lo aplastaba: el nombre
  salía «Blus…» y el detalle, una palabra por línea (`/textos` · `cortados`). Ahora el texto pide 12 rem y la insignia baja cuando no cabe
  (`PendientesVista.tsx`, `basis-48`).
- **Pendientes:** el aire entre la lista y los pedidos (24 px) era mayor que el de afuera (20 px): se leían como dos grupos que no van juntos
  (`/espacio` · proximidad). Ahora 20 px.

## Leves (arregladas)

- El hueco entre la cara del cliente y su nombre en el cobro (14 px) y el relleno de cada pedido (14 px) salían de la escala de 4 px: 12 px.

## Foco

57 controles medidos con Tab (24 en Pendientes, 18 en el Historial, 15 en el cobro): todos toman el foco, con su anillo, y ninguno queda
tapado. Un halo para mirar a ojo: el combo «Responsable» del cobro (es su forma decidida, ADR-0351).

## Decidido a propósito

- **El cobro a 1024 × 768:** el panel aprieta su cabecera y su pie, y la cifra de «Le falta» baja a 24 px en una pantalla de 820 px de alto o
  menos (`vidrio/vender.css`), para que «Solo abona una parte», el responsable y «Entregar y cobrar» entren sin bajar. Los nombres de los
  medios van a 14 px (`text-detalle`): a 16 «Efectivo» se cortaba en cinco columnas.
- **Quieto:** sin animaciones en las tres vistas (0 en marcha); vivo, solo `cayla-revelar` (160 ms) de la tarjeta y del panel.

## Heredado, no tocado (piezas compartidas o del módulo)

- **El dinero de Apartados se escribe con `money()`** («S/360.00», sin el espacio que no se parte): `/textos` pide `soles` («S/ 360.00»,
  ADR-0413). Es todo el módulo desde antes de este cambio; pasar Apartados a `soles` es otra decisión.
- **`<TablaViva>`:** los interruptores «Compacta» y «Letra grande» apagados no llegan a 3:1 contra el fondo (1,11 en claro, 1,08 en oscuro);
  su cabecera y sus filas declaran márgenes de 1, 13, 14, 15 y 18 px. Es la pieza de Recibir (ADR-0676): va a `/unificar`.
- **`<Pestanas>`:** la elegida se distingue de las demás solo por el color de su gota contra el pozo (1,24 en claro, 1,65 en oscuro), según el
  medidor; tiene su filo de `borde-control` (2026-11-16). Va a `/color`.
- **`<Chip tono="pizarra">`** en oscuro sobre el vidrio de los pedidos: entre 4,42 y 5,69 según lo que pasa por detrás (no concluyente).
- **`<Volver>`** con el dedo: 42 × 42 px (pide 44). Es la pieza de todas las pantallas: `tacto:medir`.
- **El botón «Entregar y cobrar» se apaga por lo que falta** (cómo paga, quién atiende), y la línea de abajo dice qué falta. La regla pide que
  el que confirma no se apague (ADR-0611, mejora 4): ya era así antes; va con `/focus` en el cierre (actividad 11). En el celular la barra
  ya no queda apagada: dice «Elige cómo paga» o «Elige quién atiende» y lleva hasta ahí.

## Sin medir

- `pnpm --filter web tema:auditar` y `guias:recorrer` (necesitan la base local con sesión).
- `/movimiento` grabando una acción (abrir el cobro, abrir «Más acciones»): solo se tomó la foto de lo que se mueve al llegar.

Capturas a 375 px: `capturas/2026-11-28-apartados-minima/`.
