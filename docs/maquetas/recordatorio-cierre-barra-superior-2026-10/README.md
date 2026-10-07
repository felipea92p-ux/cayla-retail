# Maquetas · El aviso de cierre de caja, en el centro de la barra superior (2026-10-06)

> **Estado (2026-10-06): elegida la maqueta 3, «Marcador», y construida — ver `docs/adr/0359-recordatorio-de-cierre-en-la-barra-el-marcador.md`.**
> Cambios que Felipe pidió después de verla: sin el nombre de la tienda sobre «Caja sin cerrar», aviso desde 15 min antes, pestaña que baja
> sola cada 5 min desde la hora de cierre, y resplandor más largo e intenso en rojo. Las maquetas 1 y 2 quedan como referencia.
>
> Pedido original de Felipe: sacar el aviso de la esquina de abajo (la «Isla» de ADR-0305) y
> ponerlo en la barra de arriba, entre el buscador y Actividad / modo oscuro / sede, **justo en el medio**, notorio y con
> movimiento rico. Datos inventados (Tienda Trujillo: abrió 9:05 a. m., cierra 7:45 p. m., S/ 962.00 en el cajón, 17 ventas).

`index.html` es un solo archivo. Se abre desde el servidor «maquetas» de `.claude/launch.json` (puerto 8791). La barra negra
de arriba no es parte del ERP: cambia la maqueta, el momento (antes de la hora, +12, +40, +1 h 4), corre el reloj (1 s = 1 min),
el tema, el ancho (escritorio, laptop, celular 375) y el movimiento.

**Recorrido:** al elegir un momento el aviso nace solo y, la primera vez, se abre 1 s después y se pliega a los 5 s. Toca la
píldora para abrirla, `Esc` o clic afuera para plegarla. «Cerrar caja» muestra la despedida (verde, ✓, sale). «Reabrir caja»
empieza de nuevo. Prueba «▶ Correr el reloj» para ver subir de nivel con los tres colores.

## Lo que comparten las tres
| Regla | Viene de |
|---|---|
| Hora de `ubicaciones.hora_cierre`; sin hora no hay aviso | ADR-0305 |
| Tres niveles por tiempo: en hora (0–29 min) → sigue abierta (30–59) → sin cerrar (60+). Colores pizarra → ámbar → rojo | ADR-0305, ADR-0169 |
| Sin ✕; se va solo al cerrar la caja; «Cerrar caja» lleva a Caja | ADR-0305 |
| Centrado en la barra (a la mitad de la cabecera, no del espacio libre) | pedido de hoy |
| Solo tokens de la paleta y modo oscuro; sin rebote; todo se apaga con `prefers-reduced-motion` | ADR-0169, ADR-0336, ADR-0136 |

**Espacio real:** con el lateral abierto en un laptop, entre el buscador y «Actividad» quedan ≈ 320 px; en una pantalla grande,
más de 500. Por eso la 2 y la 3 sacan el botón «Cerrar» de la barra bajo 1300 px (queda dentro del detalle) y a 375 px todo se
reduce a anillo/regla/dígitos + minutos.

## Las tres

| | 1 · Isla central | 2 · Horizonte | 3 · Marcador |
|---|---|---|---|
| Idea | La Isla de hoy, pero nace en el centro y **cuelga** de la barra al abrirse | Un instrumento de tiempo: regla con aguja, bandera «cierre» que se aleja y un hilo que cruza **toda** la barra | Contador mecánico de paletas + resplandor hacia la página + ticket que cuelga |
| Se ve de lejos | Medio | **Alto** (el hilo cruza la pantalla) | **Alto** (resplandor + dígitos) |
| Ancho en la barra | 183 px | 300–530 px | 300–400 px |
| Qué es dato | La píldora se llena 0→60 min; el anillo; la línea del día | La regla se desliza cada 5 min; el hilo avanza con el tiempo | Cada dígito gira solo cuando cambia; la barra del turno |
| Señal por nivel | Onda única al subir; color; punto que late en «sin cerrar» | Barrido de luz por toda la barra al subir; velo bajo la barra | Color, LED; el resplandor crece con el nivel |
| Decorativo (necesita OK) | Arco de luz que gira por el borde en «sin cerrar» | Ninguno | Resplandor que deriva y destello cada 6 s |

**ADR-0136:** el interruptor «Movimiento» separa lo permitido de lo que habría que aprobar. En **Sobrio** solo corre lo que
la regla ya admite (cascada, ola única, cifra que cuenta, punto que late en «sin cerrar»); en **Completo**, además, los tres
bucles decorativos de la tabla. Si Felipe elige una, la excepción se agrega a la lista de ADR-0136 con su porqué.

## Si se elige una (qué cambia en el ERP)
- Hoy el aviso es `components/RecordatorioCierreCaja.tsx` (montado en el layout) + `app/estilos/recordatorio-cierre.css`;
  la lógica (`lib/recordatorio-cierre-reglas.ts`) y la lectura (`lib/recordatorio-cierre.ts`, `GET /api/caja/recordatorio`) **no cambian**.
- Cambia dónde se pinta: dentro de la cabecera de la app (a la mitad, `left: 50%`), no `position: fixed` abajo a la derecha.
  Se elimina la medición de la barra inferior (`alturaBarraInferior`), que ya no hace falta.
- Pruebas: `lib/recordatorio-cierre-reglas.test.ts` sigue igual; el escenario del modo oscuro (`tema/escenarios/registro.mjs`) se
  actualiza, y se prueba a 375 px (Vender es celular obligatorio, PL-105).
