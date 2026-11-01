# Maqueta · los gráficos del sistema, con vidrio (2026-11-01)

Piezas de «3. Las pantallas» del tablero `docs/vidrio/README.md` (ADR-0596): `<BarraAvance>` (61 archivos), `<BarraApilada>` (39),
`<Anillo>` (16), `<Linea>` (17, más 6 `Sparkline`) y `<BarrasTiempo>` (12), con el globito que lee el dato.

Abrir `index.html` (o con la config `maquetas`). Va sobre el marco y las piezas elegidas (`../vidrio-base-2026-10/`), en un Resumen de
sede: la meta de hoy (anillo grande y barra gruesa con su rayita), las ventas de hoy contra ayer (línea, referencia punteada y
proyección), cada sede (anillos chicos, uno cumplido y uno en ámbar), cómo cobraste (barra apilada y la meta del mes), lo que más se vendió
(barras finas a escala) y cómo cerró cada día (barras por tiempo con la meta, el promedio, un día en rojo y hoy rayado). **Pasa el mouse
por la línea y por las barras** para ver el globito.

## Lo que hay hoy

Pistas de arena o hueso macizas; rellenos, arcos y la barra que importa en tinta sólida; barras neutras en gris; área bajo la línea de tinta
al 6 %; y el globito que lee el dato, una caja de tinta sólida. En el Observatorio Felipe ya eligió «anillos de tubo» y «área de vidrio
bajo las curvas», que hoy viven solo ahí.

## Las caras

| Pieza | Caras |
|---|---|
| Gráficos | **A · Tubo de vidrio** (lo del Observatorio en todo: pista = pozo, dato = vidrio teñido con su luz, área esmerilada, columnas de vidrio y la que importa ahumada) · B · Tinta sobre vidrio (el dato en color pleno; solo la pista, la rejilla y el área pasan a vidrio) |
| Globito del dato | **A · Placa** (la placa clara de las cifras, letra en tinta) · B · Ahumado |

En negrita, la recomendada. Lo que gana y lo que cuesta cada una, al pie de `index.html`.

## Lo que no cambia

Los colores del dato (tinta; verde al cumplir; ámbar y rojo los pone la pantalla), la rayita de «a esta hora tocaba», la referencia
punteada, la proyección, el día en curso rayado y las cifras; el movimiento (se llena, se cierra, se dibuja, crece), una vez y sin rebote.

## Medido

En Chrome sin ventana: 30 combinaciones (320 a 1440 px, claro y oscuro, las tres caras), nada se desborda; sin errores de JS. Dos cosas que
aparecieron al medir y quedaron resueltas: a 768 px la meta de hoy no cabía en media fila (ahora la meta y la línea ocupan la fila entera
bajo 1180 px), y la cifra de la última barra se salía de la tarjeta (ahora se apoya en el borde derecho).
