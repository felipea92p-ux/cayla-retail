# Maqueta · el Observatorio con vidrio (2026-10-31)

Felipe: «me refería al observatorio». Es el Inicio de las cuentas Admin (ADR-0322, `components/observatorio/`,
`app/estilos/observatorio.css`), que estaba «fuera hasta que Felipe diga» por su diseño propio: con esto entra al vidrio.

Abrir `index.html` (o con la config `maquetas` del navegador integrado). Es la maqueta aprobada `../inicio-admin-v3-2026-10/` tal cual
—el mapa con su zoom por departamento, el panel de la tienda con Ritmo, Productos, Equipo y Stock, «Por revisar» con sus orbes, el
odómetro, «Repetir el día» y los tres bucles que son señal (el latido, el cometa, el halo)— con una capa de vidrio encima. La barra
negra suma tres selectores; el análisis de cada cara está en «ⓘ La idea».

## Las caras

| Pieza | Como ahora | Caras |
|---|---|---|
| Vidrio (fondo, marco, tarjetas) | crema plano, tarjetas de papel | **A · Serena** (todo en la placa elegida, con la Aurora y el marco elegido) · B · El mapa al aire (el Perú directo sobre la Aurora; solo el panel es placa) |
| Controles (Hoy · 7 · 30 días, tiendas, pestañas del panel) | pista hueso, la elegida en tinta maciza | **A · Pozo y gota** (la pestaña elegida) · B · Ahumado |
| Por revisar (orbes) | círculo de papel | **A · Lente** · B · Pozo |

En negrita, la recomendada. En todas las caras, además: la meta y el ranking en el Tubo de vidrio; «Repetir el día», «Ver …», las flechas
y la ✕ del panel en gotas; los avatares en su lente; el globito y los avisos en vidrio ahumado. Los colores de los datos no cambian.

## Lo que no cambia

Todo lo que hace el Observatorio (ADR-0322): los datos, el zoom, el panel, las pestañas, los orbes, el en vivo, el movimiento y sus tres
bucles, el claro y el oscuro.

## Medido

En Chrome sin ventana, a 1600 px, en tableta y en celular, en claro y oscuro, con Toda CAYLA y con TRU elegida: sin errores de JS.

## Lo que decidió Felipe

**B · El mapa al aire, controles B · Ahumado y orbes A · Lente** (2026-10-31). Pidió «más contraste porque no se distinguen bien los
controles»: la pista del ahumado lleva ahora el borde de lo que se toca (`borde-control`, 3:1), una sombra que la separa de la placa,
lo no elegido pasa de tinta al 65 % a tinta al 80 % y la elegida es un ahumado más denso (al 84–97 %); «Toda CAYLA», las flechas, la ✕
y «Repetir el día» llevan el mismo borde. Medido: el texto de un control no elegido contra su pista, 16,5:1 en su trazo más oscuro.

Y pidió «más cosas para mejorar e integrar al liquid glass». Encendidos en la maqueta (casillas «Extras», se apagan una por una):
orbes con líquido, cinta de vidrio para la venta en vivo, anillos de tubo y el Perú de vidrio. De la lista de ideas eligió además la 5, la
6, la 7 y la 10, ya hechas (casillas «El panel nace del mapa», «Gráficos de vidrio», «Estela del cometa»):

- ~~**La línea del día**~~: se quitó (Felipe 2026-10-31: «quita la barra de abajo del día»).
- **El panel nace del mapa:** al elegir una tienda, una gota de vidrio sale de su punto y se estira hasta ser el panel (820 ms, una vez,
  sin rebote; apagado con movimiento reducido).
- **Gráficos de vidrio:** el área bajo la línea de la tienda en «Ritmo» y la de los mini gráficos es vidrio esmerilado (en el SVG, un
  degradado del vidrio que vela la retícula).
- **Estela del cometa:** el traslado en camino deja una cola de cuatro gotas que se desvanecen; es el mismo bucle-señal de ADR-0322.

Probado en Chrome sin ventana: la gota del panel aparece y se va, los degradados y la estela se pintan, en claro, oscuro y celular, sin errores de JS.

**«Repetir el día» con su hora legible** (Felipe: «que las horas se noten bien en repetir el día, el fondo es blanco y las letras
también»): la piel de vidrio le ganaba al botón mientras corre y dejaba la hora en crema sobre vidrio claro. Mientras corre, el botón es el
primario ahumado (oscuro, hora en crema, 14:1) y su ícono una gota clara; en oscuro, al revés (13,8:1). En el ERP de hoy se veía bien
porque ahí la piel de vidrio todavía no existe: **al implementarla, la regla de `.o-repetir.va` tiene que ir después de la del vidrio**.

**Elegido entero (2026-10-31)**, sin la línea del día («no me gustó la 5, también quítalo y pásaselo»): B · El mapa al aire, controles
B · Ahumado con contraste, orbes A · Lente y los siete extras que quedan encendidos en la maqueta. Pasado a la sesión que implementa.
