# 2026-11-16 · Los graves heredados de `/milimetro`, pieza por pieza

- **Qué:** la auditoría del PR #1895 dejó 351 graves heredados de `main` en las 135 rutas del responsive. Cuatro frentes los trabajaron (foco,
  contraste, nombres y blancos, gráficos) y aparecieron dos cosas: el medidor de color contaba como grave lo que no lo es (texto `sr-only`,
  controles que son solo texto, fondos con capas y degradados; con el medidor corregido `main` tiene 223, no 354), y lo real se concentraba en
  pocas piezas. Se arregló sin cambiar el aspecto lo que no lo cambia (anillos de foco quitados o recortados, controles tapados por las barras de
  abajo, nombres, motivos de un botón apagado, blancos de 24 px, el globito de la pestaña, los puntos de Dinero en oscuro) y lo que sí lo cambia lo
  eligió Felipe mirando las capturas («Siete decisiones de accesibilidad», «todo lo recomendado»): la página deja el alto de la cabecera
  (`scroll-padding-top`, y la mesa de Finanzas pegada), el filo de la elegida del segmento y las pestañas, el borde del buscador del mostrador, la
  barra de Tienda web en oscuro, las barras por tiempo sin cifra en gris, el foco de `.fin-control` y el aro de los puntos de color. ADR-0351 y
  ADR-0358, actualizaciones del 2026-11-16. Informe: `docs/milimetro/auditorias/2026-11-16-graves-heredados.md`.
- **Verificado:** con los siete medidores en las 135 rutas, la misma corrida sobre la rama y sobre `main`: 223 graves en `main`, **132 en la rama, 0 nuevos**
  (foco tapado, apagado por lo que falta, blanco de 24 y sin nombre, a 0). En el navegador, cada decisión: Tab y Shift+Tab de 120 pasos en Gastos, Caja, Dinero,
  Inventario y Por pagar sin un control de la pantalla bajo la cabecera ni la mesa; «Abrir la tienda» 6,7:1; barras sin cifra 3,26:1 claro y 6,0 oscuro; aro de los
  peores puntos 3,3–3,9:1 por píxel; el foco de Finanzas, el filo y el borde del buscador en capturas. `tsc`, 168.530 pruebas de la web, Knip y números en verde.
- **No verificado:** hojas y combos abiertos, aparatos reales, `prefers-contrast: more` y colores forzados (el anillo de 2 px de `.fin-control` se leyó, no se vio),
  `tema:auditar`. Los ~40 destinos con `scroll-mt-*` bajado se probaron en Inventario y Finanzas, no uno por uno. **Riesgo:** un `scroll-margin-top` escrito de
  otra forma (en un `style` o un `scroll-mt-[NNpx]`) que sumaba la cabecera ahora deja ese destino 64 px más abajo; se buscaron y no hay en una página.
  Cambia piezas de vidrio que Dynamic mira: queda como tarea allá.
