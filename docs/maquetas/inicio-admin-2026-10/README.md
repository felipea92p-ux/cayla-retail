# Spike · Inicio del Admin (2026-10-03)

> **Estado: tres maquetas para elegir.** No toca la web ni la base. `inicio-admin.html` es un solo archivo, con el CSS y el
> JS adentro; solo pide las fuentes a Google Fonts. Se abre con el servidor `maquetas` de `.claude/launch.json`
> (`http://localhost:8791/inicio-admin-2026-10/inicio-admin.html`) o haciendo doble clic.

## Lo que pidió Felipe

El Inicio de hoy (cabecera, una línea de «Hoy», «Te toca», cuatro accesos y «Equipo de hoy» en una columna angosta) es pobre
y poco estético. Lo quiere sofisticado, elegante y, sobre todo, funcional. Que ocupe todo el espacio necesario, que sea
muy responsive y que tenga muchas animaciones. Pidió tres maquetas.

## Las tres

| | A · Portada | B · Mosaico | C · Mesa |
|---|---|---|---|
| Idea | La portada de un diario: un titular cuenta cómo va el día y el detalle va en columnas con filetes | Un centro de mando en tarjetas de varios tamaños que se reacomodan solas | Lo urgente primero y de a uno, junto a un panel oscuro con el pulso del día |
| Lo primero que se ve | «Lima lleva S/ 1,890, el 59% de su meta del día.» y la bajada con lo que falta por hora | La cifra grande, el anillo de la meta y las ventas de cada hora contra el sábado pasado | La hora, el anillo y las sedes en el panel; a la derecha, «Lo primero» con su detalle |
| Gráfico central | Curva del día contra el sábado pasado, la meta y la proyección al cierre | Barras por hora sobre la sombra del sábado pasado y una curvita por sede | La línea del día: una rayita por venta (el alto es el monto) y cada sede en su carril |
| «Te toca» | Lista numerada con números grandes (rojo solo lo urgente) | Tarjeta con íconos y contadores | Una tarjeta grande por asunto, con su tabla (las 5 aperturas, las 31 prendas…), que se pasa con ← → |
| Carácter | La más sobria y la más tipográfica | La más completa y la más viva | La más enfocada y la de más contraste |
| Riesgo | Pide escribir bien las frases (titular y bajada) para cada caso | Mucha información a la vez: en un día flojo puede verse vacía | El panel oscuro es nuevo en el ERP; en el celular empuja «Lo primero» hacia abajo |

## Igual en las tres

- **Los mismos datos.** Ventas de hoy contra la meta de la sede (`ubicaciones.meta_venta_diaria`) y contra el sábado pasado a
  la misma hora; cuánto falta por hora y la proyección al cierre; «Te toca» (los mismos avisos de `lib/inicio-avisos.ts`,
  con lo urgente arriba); las tres tiendas más el Taller; quién está y qué hizo por última vez (`retail.actividad`,
  ADR-0207); cómo pagan, con los colores de método de `globals.css`; lo que más sale; y los accesos de siempre.
- **Tocar una sede la pone arriba** sin cambiar la sede de la sesión: el selector de arriba sigue mandando para operar.
  «Toda CAYLA» suma las tres.
- **Una venta nueva o un cambio de sede no re-anima la pantalla:** solo se re-asienta lo que cambió (las cifras cuentan desde
  el valor anterior y los trazos cambian de forma). Así lo pide la regla de ADR-0128.
- **Cada bloque falla por separado.** «Falla una lectura» muestra que «Cómo pagan» dice «No se pudo leer…» en vez de 0.
- **Responsive por el ancho real del marco** (container queries). El mismo código se ve a todo el ancho (hasta 1,880 px de
  contenido), en tablet (834) y a 375 px. En el celular desaparece el lateral, la barra pasa a ☰ y «Vender» queda fijo
  abajo, como decidió el Inicio por rol (`inicio-movil-roles-2026-09`).
- **Solo tokens de la paleta** (ADR-0169). El rojo marca solo lo urgente (además del logo y el filete del menú).
- Con «Movimiento reducido», o con `prefers-reduced-motion` del sistema, todo pasa en un instante.

## Cómo probarlo

La barra negra de arriba no existe en el ERP:

- **A · B · C** cambia de maqueta. **Todo el ancho · Tablet 834 · Celular 375** cambia el tamaño.
- **9:40 a. m. · antes de abrir**: TRU ya abrió caja y LIM y AQP no. Así se ve el Inicio vacío, con lo de ayer como
  referencia. La caja de LIM se puede abrir desde la pantalla.
- **5:40 p. m. · en marcha**: el día lleno (S/ 7,530 en 50 tickets: TRU 3,180, AQP 2,460 y LIM 1,890).
- **Ventas en vivo** hace llegar una venta cada 9 s; **+ Llega una venta** trae una al instante.
- **↺ Ver la entrada otra vez** repite la llegada. **ⓘ La idea** abre el detalle de la maqueta y de su movimiento.
- En la C, «Lo primero» también se pasa con las flechas del teclado, y al pasar el mouse por una rayita de la línea del día
  se ve quién vendió, cuánto y cómo pagó.

## A decidir con Felipe (además de elegir A, B o C)

1. **Movimiento en bucle.** El punto «En vivo» y el de «ahora» laten (y en la C, la raya de «Ahora»). La regla de movimiento
   (ADR-0136) solo admite bucles que sean señal. Si se queda, va escrito como excepción. Con «Movimiento continuo» apagado se
   ve cómo queda sin bucle.
2. **La cabecera.** El Inicio usa hoy `CabeceraPantalla`. Fuera de Ventas, Inventario, Catálogo ▸ Productos y Finanzas, la
   cabecera está sin decidir (CLAUDE.md). La B usa la forma de `EncabezadoPagina` (hilo taupe, título, frase); la A y la C
   proponen la suya.
3. **Qué sede ve el Admin al entrar:** la de la sesión (como hoy, y como lo dibujan las maquetas) o «Toda CAYLA». Y cómo
   convive esto con «Salud del negocio» de CAYLA Global (ADR-0275): el Inicio es *hoy*, aquel es *el mes y los 12 meses*.
4. **La proyección al cierre** supone que el resto del día se parece a un sábado típico (una curva por día de la semana). Hay que
   decidir si se calcula así, con las semanas reales de cada sede, o si no se muestra.
5. **En la A, el titular nombra la ciudad** («Lima lleva…») en vez de la sede («Tienda LIM lleva…»). Se lee mejor, pero se
   aparta de cómo se nombran las sedes en el resto del ERP.

## Lecturas que necesitaría la implementación

Ya existen: ventas del día por sede (`fn_ventas_del_dia`, `getHoyDeLaSede`), meta diaria, avisos (`lib/inicio-avisos.ts`),
equipo y última acción (`getEquipoDeHoy`, `retail.actividad`), estado de caja.

Faltan:

- Ventas de **todas** las sedes para el Admin en una sola lectura.
- Ventas por hora, y del mismo día de la semana pasada a la misma hora.
- Medios de pago del día por sede.
- Lo que más se vendió hoy (prendas y unidades).
- El resumen del Taller para el Inicio (prendas del día, órdenes en curso, atrasadas).
- El detalle de cada aviso que muestra la C (hoy los avisos traen solo la cuenta).

Al construir: el Inicio no tiene campos, así que la guía de foco no aplica (ADR-0284). Se prueba a 375 px y, antes de darlo
por terminado, se captura al mismo ancho que esta maqueta y se comparan las dos imágenes.

**Datos inventados**: ninguna cifra ni nombre es real. Las cifras cuadran entre sí: las sedes suman el total, los medios de
pago también, y tickets × ticket medio da lo vendido.
