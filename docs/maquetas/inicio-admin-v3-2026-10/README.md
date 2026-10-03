# Spike v3 · Inicio del Admin · «Observatorio» (2026-10-03)

> **Estado: la A de la v2, elegida por Felipe y ajustada a lo que pidió.** No toca la web ni la base.
> `inicio-admin-v3.html` es un solo archivo; se abre con el servidor `maquetas` de `.claude/launch.json`
> (`http://localhost:8791/inicio-admin-v3-2026-10/inicio-admin-v3.html`) o con doble clic.

## Lo que pidió Felipe

1. **Claro por ahora.** El oscuro le gusta, pero rompería con el resto del ERP: tiene que quedar listo para cuando se
   implemente el modo oscuro.
2. **Zoom por tienda.** Al elegir TRU, AQP o LIM, el mapa se acerca y el contorno del Perú se transforma en el del
   departamento. Después se corre a la izquierda para que a la derecha se vean los detalles con más foco.
3. **Recomendaciones para ese espacio:** filtros y cosas interactivas, siempre con mucha animación.

## Qué hace

- **Claro y oscuro salen de las mismas piezas.** Cada color del mapa y del panel es una variable (`--m-tierra`, `--m-costa`,
  `--m-nodo`, `--fondo`, `--sup`…), definida dos veces: en `.marco` (claro) y en `.marco.oscuro`. La barra del spike tiene
  «Oscuro · cuando exista» para verlo; en el ERP bastará con poner la clase cuando el modo oscuro exista. Todo sale de los
  tokens de `globals.css`.
- **El zoom.**
  - El `viewBox` del mapa viaja hasta el departamento. El ancho cambia en escala logarítmica, para que el acercamiento se
    sienta parejo.
  - Los contornos del Perú y de los tres departamentos se remuestrean a los mismos 160 puntos, en el mismo sentido y desde
    su punto más al norte. Así uno se transforma en el otro punto por punto.
  - Las tiendas, los anillos y el Taller mantienen su tamaño en pantalla aunque el mapa crezca.
  - Entre dos tiendas (con ‹ › del panel o con las flechas del teclado), el mapa se aleja a mitad de camino y vuelve a
    acercarse al otro departamento.
  - Escape, la × o «‹ Toda CAYLA» vuelven al país.
- **El mapa llena todo su lado, a cualquier tamaño** (pedido de Felipe, misma tarde: «que no quede tanto espacio en
  blanco»). Ya no tiene una proporción fija centrada con aire alrededor. El encuadre (`viewBox`) se calcula en cada cuadro con
  la proporción real de su espacio: en pantalla ancha aparece más mar a los lados y en una angosta, más arriba y abajo. La
  cuadrícula cubre mucho más que el Perú, así que no se ven bordes. En escritorio, la tarjeta principal ocupa el alto de la
  pantalla (menos la cabecera) y el panel de la derecha reparte su contenido en ese alto. En una columna, el mapa es tan
  alto como ancho (380 a 660 px). Las tiendas y sus anillos crecen con el mapa, pero no con el zoom.
- **El mapa se corre a la izquierda.** La tarjeta principal reparte sus dos columnas de otra forma: el mapa pasa de 1.4fr a
  0.95fr y el panel de 1fr a 1.25fr. La transición la hace el propio grid. El mapa queda fijo arriba mientras se baja por el
  panel.
- **En el zoom, el mapa muestra:** el nombre del departamento en grande, la ciudad junto a la tienda, el Taller (en Lima), un
  mapa chico del Perú con el departamento pintado y una cuadrícula más fina que aparece al acercarse.

## Las recomendaciones del panel de la tienda (están construidas, para elegir cuáles quedan)

| | Qué muestra | Por qué | Interacción y movimiento |
|---|---|---|---|
| Cabecera | Nombre, caja abierta desde qué hora, quién está en turno, venta (odómetro), anillo de meta, tickets, ticket medio y «vs antes» | Lo esencial de la tienda en una línea | ‹ › cambia de tienda viajando por el mapa |
| **Ritmo** | % de la meta acumulado contra el periodo anterior | ¿Va mejor o peor que la semana pasada a esta hora? | **Comparar con:** sola, vs CAYLA o vs otra tienda. Línea vertical al pasar el mouse con las tres cifras |
| **Horas pico** | Mapa de calor de 4 semanas (día × hora) | Para decidir turnos y cuándo reforzar el piso | Las celdas entran en ola; cada una dice su promedio |
| **Productos** | Peso de cada categoría en la tienda y lo que más sale | Cada tienda vende distinto (AQP vive de jeans; LIM, de vestidos) | **Filtro por categoría:** tocar una filtra la lista, que se reordena deslizándose |
| **Equipo** | Cuánto vendió cada integrante y desde qué hora está | Ver quién sostiene la tienda, sin abrir Rendimiento | Barras que crecen; el puesto se reordena al llegar una venta |
| **Stock** | Lo que se va a agotar (días que alcanza), lo que no se mueve hace 30 días y sus traslados | Evitar quiebres y detectar prendas quietas para mover | Barras de días (rojo con 2 o menos); el traslado en camino viaja |
| Por revisar en la tienda | Los avisos de esa sede (aperturas, por regularizar, fotos, traslados) | Lo pendiente sin buscarlo | Tocar uno abre su detalle abajo, en «Por revisar» |

**Otras ideas que no construí** (para la próxima vuelta, si sirven):
- **Clientes:** cuánto de lo vendido fue a miembros del club y cuántos clientes nuevos hubo.
- **Contra el año pasado:** el mismo mes de 2025, con la historia de Alegra.
- **Cambios y devoluciones:** qué parte de lo vendido vuelve, por tienda.
- **Margen:** el que ya mide CAYLA Global, por tienda.
- **Meta editable** ahí mismo, solo para el líder.
- **Clima y feriados locales,** para explicar un día flojo.

## Cómo probarlo

- Toca TRU, AQP o LIM (en el selector, en el mapa o en el ranking). Usa ‹ › en el panel o ← → en el teclado, y Escape para volver.
- En el panel: las pestañas **Ritmo · Productos · Equipo · Stock**, «Comparar con» y los filtros de categoría.
- Cambia el periodo (Hoy · 7 días · 30 días) estando dentro de una tienda: todo se recalcula sin salir del zoom.
- «Oscuro · cuando exista» muestra el oscuro. «Celular 375» apila el mapa sobre el panel.
- Siguen igual que en la v2: «▶ Repetir el día», ventas en vivo, «Por revisar» que se abre en su lugar y «Falla una lectura».

## A decidir con Felipe

1. **Qué pestañas quedan** (y si alguna de «otras ideas» entra).
2. **Los contornos.** Están dibujados a mano y simplificados: sirven para la maqueta, no para el ERP. Al construir, se usan los
   límites oficiales (INEI), simplificados a unos 150–200 puntos por departamento y guardados como archivo estático del
   repo, sin pedirlos a nadie al cargar. Si CAYLA abre en otro departamento, se agrega el suyo.
3. **El modo oscuro del ERP.** Esta pantalla ya está lista. Falta decidir cómo se activa en todo el sistema (preferencia de la
   cuenta o del aparato) y extender ADR-0169.
4. **Bucles** (cometa, latido, halo de lo urgente): ADR-0136 solo admite los que son señal.

## Lecturas que necesitaría la implementación

Además de las de la v2 (ventas por día y por hora de cada sede, periodo anterior a la misma hora, avisos con días esperando,
resumen del Taller):

- Ventas por categoría y por prenda, por sede y periodo.
- Ventas por integrante, por sede y periodo (`fn_ventas_del_dia` ya trae quién vendió hoy).
- Horas pico: ventas por día de la semana y hora de las últimas 4 semanas.
- Stock por prenda y sede con su venta diaria promedio (para los días que alcanza), y lo que no se movió en 30 días.

**Datos inventados**: las sedes suman el total, las categorías suman lo vendido por la tienda y el equipo también.
