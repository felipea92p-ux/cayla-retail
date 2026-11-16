# Auditoría al milímetro — los graves heredados de `main` · 2026-11-16 · `claude/graves-heredados-milimetro` @ `9da96536b`

Sigue a la auditoría del PR #1895 (`2026-11-16-responsive-pr-1895.md`), que encontró **351 graves heredados** de `main` en las 135 rutas del responsive. Esta rama los trabaja pieza por pieza. Los siete medidores corrieron con el mismo guion que aquella vez (1440 claro/vivo + foco, 375 táctil, 1440 oscuro, quieto), sobre la rama y sobre `main` (`d0c3df4e0`, sus archivos puestos un rato en la misma copia).

## El número

| Corrida | Graves |
|---|---:|
| `main` con el medidor de color de antes | 354 |
| `main` con el medidor de color corregido (ver «El medidor») | 223 |
| La rama, antes de las siete decisiones de Felipe | 143 |
| **La rama, con las siete decisiones** | **132** |

**Nuevos: 0 graves, 0 medias, 0 leves.** Medias: 2818 (main 2821). Leves: 6682 (main 6683).

| Categoría | Severidad | `main` | Rama | Rutas (rama/main) |
|---|---|---:|---:|---|
| foco-sin-anillo | grave | 76 | 51 | 2/8 |
| contraste-control | grave | 45 | 41 | 7/9 |
| contraste-texto | grave | 42 | 30 | 6/10 |
| foco-tapado | grave | 23 | 0 | 0/6 |
| apagado-por-lo-que-falta | grave | 18 | 0 | 0/3 |
| grafico-3a1 | grave | 11 | 10 | 5/6 |
| blanco-24 | grave | 4 | 0 | 0/3 |
| sin-etiqueta | grave | 4 | 0 | 0/1 |
| movimiento-marcado | media | 994 | 991 | 114/114 |
| etiqueta-bajo-11 | media | 876 | 876 | 114/114 |
| lectura-bajo-14 | media | 232 | 232 | 37/37 |
| blanco-44-dedo | media | 227 | 227 | 58/58 |
| seleccion-solo-aria | media | 212 | 212 | 22/22 |
| rojo-de-mas | media | 198 | 198 | 8/8 |
| bucle-sin-senal | media | 32 | 32 | 10/10 |
| monto-sin-espacio | media | 27 | 27 | 5/5 |
| texto-cortado | media | 23 | 23 | 12/12 |
| proximidad | leve | 90 | 89 | 35/35 |

(Las leves sin cambio no se listan: son las mismas en las dos.)

Servidor `http://localhost:3010`, base local compartida, cuenta Admin de prueba. Guion: `apps/web/responsive/.salida/milimetro/auditar.mjs` (fuera de git).
La corrida final es del commit `9da96536b` (antes de traer `main` y del arreglo de Impuestos, que se verificó aparte).

## El medidor

`/color` contaba como grave lo que no lo es, y por eso `main` daba 354: el texto que solo lee el lector de pantalla (`sr-only`, recorte total), el
control que es solo texto (WCAG 1.4.11 no le pide borde: su palabra lo identifica) y fondos que no son el primer ancestro con color (capas hermanas,
degradados). Corregido en `.claude/skills/color/referencia/medir.js` (y su `SKILL.md`): **`main` tiene 223 graves, no 354**. La tabla de arriba compara
siempre con el mismo medidor en los dos lados.

## Lo que se arregló sin cambiar el aspecto

- **El foco se ve** (WCAG 2.4.7): los gráficos de Finanzas, los puntos de «Lo que debes», la fila de un movimiento de caja, Por pagar, Proveedores y las
  placas de Atributos (Categorías, Familias, Colores) dibujaban su anillo y un `outline: none` lo quitaba, o el `overflow` de la tarjeta lo recortaba.
- **El foco no queda tapado por lo de abajo** (2.4.11): el pie de Cierre de caja, el dock del telar y el pie fijo de las páginas apartan el control
  (`scroll-margin-bottom` / `scroll-padding-bottom`); la barra pegada de la campaña web baja bajo la cabecera; las filas de píldoras, pestañas y
  categorías de Vender dejan aire al correr de lado con Tab. **foco-tapado: 23 → 0.**
- **Nombres, blancos y motivos:** el campo de archivos de Adjuntar factura (4.1.2, **sin-etiqueta 4 → 0**); el «+N» de las piezas y «Le debes» de
  Proveedores a 24 px (2.5.8, **blanco-24 4 → 0**); los botones que se apagan dicen por qué (**apagado-por-lo-que-falta 18 → 0**: el medidor lo
  contaba porque no había motivo a la vista).
- **Contraste:** los puntos del gráfico de Dinero en oscuro, el globito neutro de la pestaña elegida (1,09:1).
- **«Registrar pago» de Impuestos** (hallado en esta corrida, solo en oscuro): sobre la tarjeta de tinta de la respuesta, la gota de vidrio le ganaba a
  su diseño de papel sobre tinta y quedaba invisible en oscuro (1:1) y gris en claro. Vuelve a ser sólido: 16:1 en los dos (`telar.css`).

## Lo que eligió Felipe mirando (página «Siete decisiones de accesibilidad», «todo lo recomendado»)

| # | Decisión | Medido después |
|---|---|---|
| 1A | La página deja el alto de la cabecera (`scroll-padding-top` en `<html>`) y, en Finanzas desde 640 px, el de la mesa pegada (`--alto-mesa-telar`); ~40 `scroll-mt-*` y `scroll-margin-top` bajaron a solo su aire | Tab y Shift+Tab (120 pasos) en Gastos, Caja, Dinero, Inventario y Por pagar: 0 controles de la pantalla tapados (solo «Contraer menú lateral», que es del marco). El destino de Inventario queda a 32 px bajo la cabecera |
| 2A | Filo de `borde-control` en la elegida del segmento, de las pestañas y del segmento de campo | Visto en claro y oscuro (Proveedores, Productos, Nueva orden) |
| 3A | El buscador del mostrador con su borde | `1px solid borde-control` a 375 y 1440 (Cambios) |
| 4A | En oscuro, la barra de la ventana de Tienda web más oscura | «Abrir la tienda» de 3,44 a 6,7:1 |
| 5B | La barra por tiempo que no escribe su cifra, en gris con 36 % de tinta | 3,26:1 en claro, 6,0:1 en oscuro (Historial de ventas) |
| 6A | El foco de `.fin-control` es el del sistema: borde de tinta y halo; anillo de 2 px con más contraste o colores forzados | Visto con Tab en Cuadrar con el banco |
| 7A | El aro de los puntos de color a 38–40 % | Los peores (Dorado, Plateado y Beige en claro; Negro y Azul marino en oscuro): 3,3 a 3,9:1, medido por píxel |

Registro: ADR-0351 y ADR-0358 (actualizaciones del 2026-11-16) y la tabla de `CLAUDE.md`.

## Lo que queda (132), clasificado

- **El medidor no ve lo que sí está (100):** el anillo de Proveedores y de Categorías va en el `::after` o en la placa, y se ve (capturas con Tab);
  el filo de la elegida del segmento de campo va en su gota, no en el botón; el aro del punto de color va en su `<i>` o en su `outline`; los tramos de
  `BarraApilada` (Plan, Proveedores, Resumen de Finanzas, Plan del piso) llevan su cifra en la leyenda de al lado; la semana de Metas es decorativa
  (`aria-hidden`, sus cifras están en las casillas); un `input` `sr-only` y una `caja-cayla` que no se toca. Va como tarea de los medidores (backlog).
- **Decidido a propósito (26):** los «fantasmas» de la ficha de Nuevo producto (`text-tinta/25`, CLAUDE.md «Modo oscuro», punto 4), el rótulo de ejemplo en
  gris de Rótulos (ADR-0366) y las iniciales del avatar (`aria-hidden`, 4,31:1, el nombre va al lado).
- **Espera a Felipe (2):** el interruptor apagado (su aro `borde-control` al 70 %, 1,11:1 de relleno en Cuadrar el piso).
- **Por hacer (3):** los pases de Traslados (la hora en 10 px a 4,25:1 y la «F» del pie a 2,75:1 en oscuro) y «Conf. Tienda» en Tienda web oscuro (4,13:1).

- **Arreglado después de la corrida (1):** «Registrar pago» de Impuestos en oscuro (ver arriba).

## Sin medir

Hojas y combos abiertos, lo que pide datos que la base local no tiene, aparatos reales, `prefers-contrast: more` y colores forzados
(la regla del anillo de 2 px de 6A se leyó en el código, no se vio). `tema:auditar` no se corrió: el oscuro se midió con el medidor de color en las 135 rutas.
