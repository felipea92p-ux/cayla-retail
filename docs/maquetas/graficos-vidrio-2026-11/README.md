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

## Lo que decidió Felipe

**Gráficos B · Tinta sobre vidrio y globito B · Ahumado** (2026-11-01). El dato sigue en su color pleno (rellenos, arcos, trazos y
barras); solo lo que no es dato pasa a vidrio: la pista es un pozo fino, la rejilla una ranura y el área bajo la línea, esmerilada. El
globito que lee el dato es el vidrio ahumado de tinta con letra crema. Los anillos de tubo y el área de vidrio del Observatorio siguen
siendo de él (su diseño propio).

**Actualización (2026-11-01): la barra de avance es A · Tubo en todo el ERP**, no la B de esta maqueta. Felipe la eligió en las hojas
(`../modales-vidrio-2026-10/`) y en el Inicio (`../inicio-lider-vidrio-2026-10/`), y es la misma pieza: pista hundida de 14 px (8 la fina,
20 la gruesa) con el relleno de vidrio teñido de su tono. La apilada, el anillo, la línea y las barras por tiempo siguen en B.
