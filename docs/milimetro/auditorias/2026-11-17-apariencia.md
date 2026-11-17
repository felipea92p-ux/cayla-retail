# Auditoría al milímetro — «Apariencia», los ajustes del aparato · 2026-11-17 · `claude/apariencia-ajustes-visuales-cf1643`

Piezas: la fila «Apariencia» al pie del menú (`components/AppShell.tsx`) y su hoja (`components/HojaApariencia.tsx`), con el modo oscuro,
las animaciones y el modo liviano (y su «Automático» / «Volver a automático»). Ficha: `docs/milimetro/apariencia.md`.

Medido: la hoja sola (`raiz: "[role=dialog]"`) a 1440×900 claro (estados, espacio, tipografía, color, textos), 375×812 táctil claro (estados,
espacio, tipografía), 1440 oscuro (estados, color) y 1440 con las animaciones encendidas (movimiento); la fila sola a 1440 claro y 375 oscuro;
segunda pasada de foco a 1440 sobre la fila (1/1) y la hoja (4/4). ERP local (`next dev`) con la base local. Los medidores se corrieron con
`page.evaluate` (Playwright), lo mismo que pegarlos en `javascript_tool`. Además, en el navegador del panel: 375, 320 y 1440, abierto y plegado.

Resumen: **0 graves · 0 medias · 0 leves abiertas** en lo nuevo. **1 media corregida** (el foco al cerrar). **2 falsos positivos** confirmados.

## Graves
Ninguno.

## Medias
1. **Corregida: al cerrar la hoja, el foco caía al inicio de la página.** Con el teclado, Escape cerraba la hoja y el foco quedaba en `<body>`
   (WCAG 2.4.3, orden del foco). Ahora la hoja recibe `alCerrarEnfocar` con la fila que la abrió. Medido después: Escape → el foco vuelve a
   «Apariencia».

## Leves
Ninguna.

## Falsos positivos confirmados
- **«El interruptor no tiene borde (relleno 1,11:1)».** `color/medir.js` lee `border`, y el aro del interruptor apagado va como sombra interior
  (`box-shadow: inset 0 0 0 1.5px var(--color-borde-control)`, `app/estilos/campos-y-casillas.css:395`). Ese aro pasa 3:1 y lo mide
  `lib/tema-tokens.test.ts`. Es la pieza decidida (`casilla`, 2026-10-13).
- **«El chip "Automático" en oscuro no es concluyente (3,74 a 5,02:1)».** Medido con los píxeles de la captura (escala 2): **4,86:1** a 1440
  y **4,63:1** a 375 en oscuro, y **5,52:1** en claro. Pasa 4,5:1. Es el `<Chip tono="pizarra">` de siempre, sobre la lámina de la hoja.

## Lo que marcaron los medidores y no es de esta pieza
- La pantalla de atrás (el Observatorio de Inicio): blancos de 34 px con el dedo, «Mayúscula De Título» en «Ir a Tienda Trujillo» y botones en
  dos líneas. Ya estaba.
- Una etiqueta del menú del celular en oscuro («Inventario», 2,79:1): el mismo falso positivo del `::after` del menú que anotó la auditoría de
  gama baja (`2026-11-17-telefonos-gama-baja.md`). La fila «Apariencia» no salió.
- La × de la hoja «sin outline»: es la pieza decidida (`accion.cerrar`) con su halo.

## Números de lo nuevo
- Fila: 40 px de alto, 13,5 px, 8 px sobre la tarjeta de la persona (1440). Plegado: 63 × 54, ícono centrado en el mismo eje que el resto del
  menú (x = 42) y «Apariencia» entero debajo (56 px, sin cortar).
- Hoja: texto de lectura de 14 y 15 px, título serif de 27 px (25 a 375); 0 textos bajo 14; con el dedo, 12 de 12 controles a 44 px.
- Cabecera: en el celular, «Actividad», la sede y la lupa; la sede mide 122 px a 320 y se lee entera. En el escritorio, «Actividad» y la sede.

## Sin medir
- Foco a 375 px: el medidor pide una tecla Tab real y el navegador sin interfaz no la da. A 1440 pasó.
- Cómo se siente el modo liviano «Automático» en un teléfono de gama baja real: aquí el equipo (16 GB) decide «apagado».
