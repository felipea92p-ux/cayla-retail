# Spike v2 · Inicio del Admin (2026-10-03)

> **Estado: Felipe eligió la A (2026-10-03), que sigue en `inicio-admin-v3-2026-10/`** (en claro, con zoom por departamento). Reemplazan a las de `inicio-admin-2026-10/`, que Felipe descartó. No tocan la web
> ni la base. `inicio-admin-v2.html` es un solo archivo; se abre con el servidor `maquetas` de `.claude/launch.json`
> (`http://localhost:8791/inicio-admin-v2-2026-10/inicio-admin-v2.html`) o con doble clic.

## Lo que pidió Felipe (segunda vuelta)

La cuenta de Admin («Felipe») **no vende**. Quiere ver cómo va el negocio, comparar las tiendas y ver lo que hay que
revisar, **lo más visual posible**: si se acumula texto, se pierde de vista lo que importa. Además, el diseño tenía que ser
más sofisticado o más innovador, con animaciones increíbles.

Lo que cambió respecto de la primera vuelta:

- Sin «Vender», sin «Abrir caja», sin equipo con su última acción y sin medios de pago. El Admin mira; no opera.
- Sin frases largas. Cada bloque tiene una etiqueta de una a tres palabras, una cifra y una forma. El detalle va en el tooltip.
- Una sola fila de filtros arriba, que manda sobre toda la pantalla: **Hoy · 7 días · 30 días** y **Toda CAYLA · TRU · AQP · LIM**.
- **Énfasis en lugar de un color por tienda:** la tienda elegida va en tinta y las demás pasan a segundo plano, siempre con
  su nombre al lado. Así no hace falta inventar colores fuera de la paleta y la comparación se lee sin leyenda.
- El selector de arriba dice «CAYLA Global» (la vista de toda la empresa, ADR-0275).

## Las tres

| | A · Observatorio | B · Carrera | C · Reloj |
|---|---|---|---|
| Idea | Sala de control en oscuro: el negocio sobre el mapa del Perú | Las tres tiendas compiten por llegar a su meta | El día como esfera de reloj: cada anillo, una tienda; cada rayo, una hora |
| Pieza central | Mapa: cada tienda es un punto que crece con lo que vende y un anillo que se cierra con su meta. El traslado TRU → LIM viaja como un cometa | La carrera: el % de la meta acumulado de cada tienda, contra el ritmo ideal | Rayos por hora (o por día, en 7 y 30 días) con la sombra del periodo anterior, y la aguja en la hora |
| Comparar tiendas | Ranking por % de la meta y barras de «vs antes» | Podio y un retrato por tienda con las mismas piezas | Ranking, «antes y ahora» (punto vacío y lleno) y ticket medio contra el promedio de CAYLA |
| «Por revisar» | Orbes: el número adentro y un aro de color que se llena según cuánto lleva esperando | Mosaicos con el número grande y la barra de qué tienda los tiene | Tarjetas con el aro de días esperando |
| Carácter | La más inmersiva y la más distinta al resto del ERP | La más clara para comparar | La más original |

**Lo que comparten:** el total rueda como un odómetro, dígito por dígito. Al cambiar de periodo o de tienda, todo cambia de forma
sin volver a entrar, y los puestos del ranking se reordenan con un deslizamiento. **▶ Repetir el día** pasa el día de 10:00 a
ahora en unos 7 segundos. Al tocar un aviso, se abre en su lugar con un gráfico chico (View Transitions). Las tarjetas se
iluminan desde el puntero, y los retratos de la B se inclinan en 3D. Lo que está más abajo se anima recién cuando llega a la
vista.

## Cómo probarlo

- La barra negra (no existe en el ERP) elige la maqueta, el tamaño (todo el ancho, tablet 834 o celular 375), la hora (9:40 a. m.
  o 5:40 p. m.), las ventas en vivo (una cada 9 s), el movimiento continuo o reducido y «Falla una lectura» (el Taller dice
  «Sin datos» en vez de 0).
- Dentro de la pantalla: el periodo, la tienda, **▶ Repetir el día**, tocar un aviso y pasar el mouse por los puntos, las barras
  y los rayos (cada uno muestra su cifra).
- «ⓘ La idea» explica cada animación de la maqueta.

## Datos (inventados, cuadran entre sí)

- **Hoy a las 5:40 p. m.:** S/ 7,530 en 50 tickets (TRU 3,180 · AQP 2,460 · LIM 1,890). Metas diarias: TRU 3,000, AQP 2,500 y LIM
  2,500 (8,000 en total, 94%). Contra el sábado pasado a la misma hora: TRU +9%, AQP +13% y LIM +15%.
- **7 y 30 días:** 60 días de historia por tienda, con el patrón de la semana (el sábado vende más) y una tendencia por tienda.
  La comparación es contra los 7 o los 30 días anteriores, cortados a la misma hora de hoy.
- **El % de la meta** es siempre lo vendido sobre la meta del periodo entero (un día, 7 o 30 días). Por eso, a media tarde, hoy
  todavía no llega a 100%.

## A decidir con Felipe (además de elegir A, B o C)

1. **El oscuro de la A.** El modo oscuro quedó fuera de la paleta (ADR-0169). Si se elige la A, sería la única pantalla oscura
   del ERP: hay que decidir si es una excepción o si se pasa el mapa a claro.
2. **Movimiento en bucle.** El cometa del traslado, el latido de las tiendas abiertas, el halo de los avisos urgentes y el eco de
   la aguja se repiten. ADR-0136 solo admite bucles que sean señal; se pueden ver apagados con «Movimiento continuo».
3. **Meta de 7 y 30 días.** Se calcula como la meta diaria × días. Si la meta debería cambiar según el día de la semana (el sábado
   pesa más), hay que guardarla así en la base.
4. **«Por revisar» para el Admin:** qué avisos ve y cuál es el límite de días para cada uno (el aro mide días esperando sobre 7).
5. **El Taller en el Inicio:** prendas cosidas contra una meta del día o de la semana. Esa meta todavía no existe.

## Lecturas que necesitaría la implementación

Ya existen: ventas del día por sede (`fn_ventas_del_dia`), meta diaria (`ubicaciones.meta_venta_diaria`), avisos
(`lib/inicio-avisos.ts`) y estado de caja.

Faltan:

- Ventas por día de cada sede (60 días) y por hora de hoy, para el Admin, en una sola lectura.
- Lo mismo del periodo anterior, cortado a la misma hora.
- Cuántos días lleva esperando cada aviso y su reparto por sede.
- El resumen del Taller (prendas por día y órdenes atrasadas).

El Inicio no tiene campos, así que la guía de foco no aplica (ADR-0284). Antes de darlo por terminado, se captura al mismo ancho
que esta maqueta y se comparan las dos imágenes.
