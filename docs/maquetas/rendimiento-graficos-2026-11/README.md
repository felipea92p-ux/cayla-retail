# Maqueta · Gestión ▸ Rendimiento en gráficos simples (2026-11-04)

Tercera ronda, tras «No me gusta ninguna, haz 3 más, con gráficos entendibles y amigables, con full animaciones. No tiene que ser nada súper elaborado».
Son pantallas normales con gráficos que todos conocen. Datos inventados; nada guarda.

Abrir `index.html` con la config `maqueta-referentes` del navegador integrado. La barra negra elige opción, rol, caso, tema y ancho, y «Repetir animación» vuelve a correr la entrada.

| Opción | El gráfico principal | Responde rápido |
|---|---|---|
| **A · Barras** (recomendada) | Una barra por persona contra su meta, y columnas por día u hora | ¿Quién llegó, quién va bien y quién necesita ayuda? |
| **B · Anillos** | Un anillo por persona que se cierra en su meta, una dona de lo que aportó cada una y columnas apiladas | ¿Cuánto le falta a cada una? ¿Quién aportó qué? |
| **C · Línea** | Lo vendido que sube contra lo que tocaba y a dónde se llega si sigue así, con una línea chica por persona | ¿Vamos arriba o abajo de lo que tocaba? |

Las tres se usan igual: eliges tienda y período (Hoy, Esta semana, Este mes), tocas a una persona y todo se acomoda a ella; la tocas otra vez y vuelve el equipo.

## Movimiento

- Al entrar: las piezas suben en cascada, las barras crecen, los anillos se cierran, la línea se dibuja y las cifras cuentan.
- Al cambiar de período o de persona: todo viaja de un valor al otro, y en A las filas se reordenan solas.
- Al pasar el mouse: se apaga a las demás personas y sale un globo con el detalle.
- Al llegar a la meta: un visto que se dibuja o una onda, una sola vez.

Sin rebote ni bucle, y apagado con `prefers-reduced-motion`.

## Reglas que respeta

Reconocer y acompañar, sin dinero (D-65, D-112) · solo encargadas y Admin (D-113) · nunca se mezclan tiendas · sin rojo para juzgar (D-159) · sin meta no se inventa cuánto tocaba · «Adelante / En ritmo / Por debajo» con ±10 puntos (`lecturaDeRitmo`) · Lima sin horarios no lleva esa lectura por persona.

## Lo que simplifica y habría que resolver al construir

- **Lo que tocaba:** aquí se reparte por tiempo transcurrido. El ERP lo reparte por horas programadas.
- **Hoy y semana:** aquí la meta del mes se divide entre los días. Si estos períodos gustan, hay que decidir cómo se reparte de verdad.
- **Datos:** por tienda, el día y la hora ya existen (`fn_rendimiento_detalle`). Por persona, día a día y hora a hora, hace falta una lectura nueva.
- **Lo que quedó fuera:** contracción y cota prudente, muestra chica, cambiar la meta, historial de cambios y la tabla accesible. No se quitan del ERP: esta ronda solo prueba cómo se ven los gráficos.
- **Movimiento y colores:** requieren su excepción en ADR-0136 y tokens para los colores por persona.

## Pendiente de decidir

- Cuál opción, o qué mezcla.
- Acordarlo con Dany: el tablero de vidrio dice que en esta pantalla solo cambiaba el material (`docs/vidrio/README.md`).

## Lo que se decidió

El 2026-11-04 se pidió algo más sofisticado e interactivo, con la tabla con superpoderes. Sigue en `../rendimiento-superpoderes-2026-11/`.
