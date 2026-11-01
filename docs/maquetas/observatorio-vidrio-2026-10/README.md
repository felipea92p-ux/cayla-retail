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
6, la 7 y la 10, ya hechas (casillas «Línea del día», «El panel nace del mapa», «Gráficos de vidrio», «Estela del cometa»):

- **La línea del día:** un riel de vidrio flota abajo, de 9:30 a. m. a 9 p. m. Arrastrar la gota (o ← →) muestra todo el Observatorio a
  esa hora; «Volver a ahora» regresa; lo que aún no pasó va rayado; «Repetir el día» la hace correr. Agrega algo que no estaba: ver
  cualquier hora del día (hoy solo se repite entero). En el teléfono quedan tres horas marcadas.
- **El panel nace del mapa:** al elegir una tienda, una gota de vidrio sale de su punto y se estira hasta ser el panel (820 ms, una vez,
  sin rebote; apagado con movimiento reducido).
- **Gráficos de vidrio:** el área bajo la línea de la tienda en «Ritmo» y la de los mini gráficos es vidrio esmerilado (en el SVG, un
  degradado del vidrio que vela la retícula).
- **Estela del cometa:** el traslado en camino deja una cola de cuatro gotas que se desvanecen; es el mismo bucle-señal de ADR-0322.

Probado en Chrome sin ventana: arrastrar lleva a la hora (1:32 p. m. al soltar en el 35 %), «Volver a ahora» regresa, la gota del panel
aparece y se va, los degradados y la estela se pintan, en claro, oscuro y celular, sin errores de JS.
