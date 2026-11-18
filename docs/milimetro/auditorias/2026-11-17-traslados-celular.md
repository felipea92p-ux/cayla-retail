# Auditoría al milímetro — `/inventario/traslados` en el celular: «Nuevo traslado» en ícono y «Lo de hoy» plegado al anillo junto al buscador · 2026-11-17 · `claude/nuevo-icono-nada-pendiente-1b3aa9`

Piezas: el botón «Nuevo traslado» de la cabecera (`app/(app)/inventario/traslados/(billetera)/layout.tsx`) y el bloque «Lo de hoy» + buscador de la
billetera (`components/traslados-pases/Billetera.tsx`, `app/estilos/traslados-pases.css`). Solo lo que cambió en esta rama.

Medido: 375×812 táctil claro (estados, espacio, tipografía, foco con Tab) · 350×760 (encuadre) · 1440×900 claro (estados, espacio, tipografía, color,
textos, movimiento, foco con Tab) · 1440 oscuro (estados, color) · 375 oscuro (a ojo y con los valores calculados) · 375 con las animaciones
encendidas (movimiento) · 700×900 (que la tarjeta siga). Servidor: `localhost:3110` (`next dev`, base local, sede Lima). Los medidores se
corrieron con `fetch` + `eval` desde `public/__medir` (borrado al terminar). `guias:recorrer`: `inventario.traslados`, 10 pasos a 375 y 14 a 1440;
`inventario.traslados.id`, 8 y 10.

Resumen: **0 graves · 0 medias · 0 leves** en lo nuevo · 3 heredados de la pantalla (no se tocaron) · el estado con pendientes, visto con dos cajas simuladas.

## Lo que se midió

| Pieza | Medida | Regla | Resultado |
|---|---|---|---|
| Cabecera a 375: «Pedir a otra sede» + «+» | 165 × 44 y 44 × 44 px, 12 px entre los dos, en UNA fila (antes, dos filas) | 44 px con el dedo (ADR-0611, mejora 5) | pasa |
| «+» (`a.btn-cayla`) | nombre para el lector y `title`: «Nuevo traslado»; ícono de 16 px | nombre accesible (WCAG 4.1.2); ícono de 16 en un botón (`icono`) | pasa |
| «+» con el foco | contorno de 2 px en tinta, a 2 px | ADR-0351, WCAG 2.4.7 | pasa (3 de 3 controles de la cabecera, a 375 y a 1440) |
| «Lo de hoy» a 375 | píldora de 42 × 40 con el anillo chico de 40, a 8 px del buscador (44 de alto) | las mismas medidas del anillo «N de M hoy» de Existencias (42 × 40, 8 px) | igual |
| Cifra del anillo | 11,5 px seminegrita; tinta sobre crema ≈ 15:1 en claro y en oscuro (calculado desde los tokens) | 4,5:1 (WCAG 1.4.3) | pasa |
| Arco del anillo | verde 6,1:1 y ámbar 6,4:1 sobre crema en claro; 9,4:1 y 9,5:1 en oscuro (calculado) | 3:1 para un gráfico (WCAG 1.4.11) | pasa |
| Estado sin depender del color | adentro va un ✓ (al día) o el número de lo que toca | WCAG 1.4.1 | pasa |
| Lector de pantalla | el anillo va oculto y las palabras («Nada pendiente hoy · Todo al día») siguen en el DOM (`sr-only` bajo 640 px) | WCAG 1.1.1 | pasa |
| El anillo con pendientes (enlace) | 42 × 40 dibujado, área de toque de 44 × 44 (`area-dedo`); nombre «Ir a lo primero que te toca»; al tocarlo abre la primera caja por hacer y «atrás» vuelve a la lista | 44 px con el dedo (ADR-0611, mejora 5); WCAG 4.1.2 | pasa |
| El enlace con el foco | contorno de 2 px en tinta, a 2 px | ADR-0351, WCAG 2.4.7 | pasa |
| El enlace desde 640 px | `display: none`: no se ve ni recibe el foco | que no cambie | igual que antes |
| Buscador a 375 y 350 | «Número, sede o prenda…» mide 182 px y tiene 245 (375) y 220 (350) | el ejemplo cabe a 375 px (ADR-0290, punto 4) | pasa (el de antes, de 40 letras, ya se cortaba) |
| Página a 350 y 375 | sin scroll de lado (0 px) | — | pasa |
| Movimiento (animaciones encendidas) | el arco se cierra una vez en 1100 ms (`cayla-anillo-cierra`, la pieza `grafico.anillo`); 0 bucles | ADR-0136 | pasa |
| Quieto (de fábrica) | 0 animaciones; el anillo y el «+» se ven completos | ADR-0625 | pasa |
| Desde 640 px | tarjeta de 380 × 82 con su anillo de 52, 14 px al buscador; botones de 165 y 176 × 40 con su palabra | que no cambie | igual que antes |

## Estados

- **«+ Nuevo traslado»** es `<BotonEnlace>` (familia `accion.nuevo`, decidida 2026-10-07): default, hover (solo con mouse), foco, presionado y quieto
  son los de `btn-cayla btn-secundario`. Selected, disabled, loading, error, read-only y vacío no aplican: es un enlace a otra pantalla.
- **El anillo de «Lo de hoy»** es `<Anillo tamano="chico">` (familia `grafico.anillo`, 2026-10-15) en la píldora del «N de M hoy» de Existencias.
  Al día es un dibujo (`span`): no se toca. Con pendientes es un enlace a la primera caja por hacer: hover solo con mouse (la línea pasa a
  taupe, como en Existencias), foco con su contorno, y quieto sigue respondiendo con el color. Selected, disabled, loading, error, read-only
  y vacío no aplican: no guarda nada.

## Heredados (ya estaban; no son de este cambio)

- En el pase abierto, «26 SEP · 16:00» (`small`, 10 px) da 4,25:1 en claro; pide 4,5:1 (`color/medir.js`, 1440).
- A 375 px o menos, el globito de «Terminadas» queda fuera de la fila de pestañas (se corta a la derecha).
- Los sellos de los pases («ANULADA», «CON NOTA») van en mayúsculas escritas y bajo 11 px: diseño propio de los pases (ADR-0355).

## Visto con dos cajas simuladas

- El anillo con pendientes (ámbar, «2», enlace): la base local no tiene nada en camino (4 cajas cerradas y 1 anulada), así que se le pasaron a
  la billetera dos de sus cajas reales marcadas «por hacer», con un cambio temporal en el `layout.tsx` que se quitó al terminar. Con eso se
  midió el componente de verdad: tono, cifra, área de toque, foco, oscuro, y el toque que abre la caja (la primera por hacer, no la primera
  de la lista). A qué caja lleva lo decide `primeroPorHacer` (`lib/traslados-pases-reglas.ts`), con su prueba.

## Sin medir

- En un teléfono de verdad (se midió con la emulación táctil del navegador).
