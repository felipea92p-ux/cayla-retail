# Formidable · Inventario ▸ Movimientos   (`/inventario/movimientos`, pestaña «Movimientos»)

- **Fecha / SHA:** 2026-11-28 · `b3531fe9c` (rama `claude/sin-punto-medio-panel`, PR #2052)   · **Dispositivo que manda:** escritorio (Mac mini); 375 px se adapta
- **Pregunta que debería resolver (1 frase):** ¿qué le pasó a esta prenda, dónde está y cuántas nos quedan?   · **Protagonista:** la prenda
- **Veredicto en una línea:** «Se entiende en 5 s, pero la fila no dice dónde está la prenda ni de qué es el "quedan", y "Todo el historial" se ve como un período vacío.»

Datos: la base local compartida (Tienda Lima, 18 movimientos de septiembre y octubre), cuenta del seed, solo lectura. Escala: 2 agentes (ciego sobre
capturas y escéptico sobre el código), avisada antes de lanzarlos.

## Notas (0–10)
| Eje | Nota | Evidencia |
|---|---|---|
| 1 Sin manual | 7 | [Observado] ciego: a los 5 s dijo «lo que les pasa a las prendas en la tienda… de dónde a dónde»; contestó qué pasó con 80 % de seguridad, dónde está con 60 % y cuántas quedan con 40 %. · real: sin probar |
| 2 Una pregunta, una respuesta | 7 | [Medido] con el período abierto en «Personalizado» la primera fila empieza a 560 px de 900: los filtros ocupan media pantalla. La columna de tipos compite, pero filtra |
| 3 Simplicidad profunda | 6 | [Observado] «quedan 16» sin decir de qué ni dónde (H2); [Medido] «−1 faltaron y +0 aparecieron» (H6) |
| 4 Lenguaje de tienda | 7 | [Observado] el ciego no entendió «Cuarentena» ni «Filtros 1» en el celular; «operaciones» compite con «prendas» |
| 5 Contenido primero | 7 | [Observado] la fila manda: nombre, talla y color, el trayecto y la cantidad. [Opinión] en el celular el sello y la miniatura dejan 83 px al nombre |
| 6 Lo difícil, a un toque | 7 | [Medido] el «?» del título abre la explicación; el desglose de cada tipo solo vive en un `title` (pasar el mouse), sin toque |
| 7 Perdonar antes que preguntar | no aplica | la pantalla solo lee: el libro no se edita (ADR-0234) |
| 8 Quitar antes de agregar | 6 | [Observado] «📍 Piso» repite el trayecto y en una guardada dice el origen (H1, lo trajo ADR-0716); las franjas de cada día no se entendieron (H4); «+0» (H6) |
| 9 De punta a punta | 7 | [Medido] el vacío dice qué pasó y ofrece «Ver los últimos 90 días» (bien); «Todo el historial» deja «Personalizado» marcado con Desde y Hasta vacíos (H3) |
| **Leyes (promedio de 8)** | **6,8** | Ninguna bajo 5 |
| **Oficio visual** | **5** | [Medido] 6 de 8 comprobaciones del medidor fallan a 1440, 1024 y 375 (lista abajo) |

**Oficio, lo que falla** (`referencia/medir-oficio.js`): blancos bajo 24 px (las franjas de cada día, 22 × 12, que bajan hasta 3 px de ancho, `movimientos-sellos.css:254-255`;
«Todo el historial», 19,5 de alto; el «Abrir calendario» de `CampoFecha`, 20 × 20, pieza global); 44 bordes casi alineados (la mayoría del marco y las pestañas, del
chrome global); 7 tamaños de letra (13 · 14 · 16 · 22 · 30 · 32 · 46); 14 radios; 11 rojos a la vista (sellos de cambio y devolución, decididos en ADR-0353).
**Pasa:** contraste de texto (0 fallas), foco visible en 80 controles, texto mínimo, orden de pantalla. Teclado: sin probar.

## Los 3 cambios de mayor impacto
1. **La fila deja de decir «📍 Dónde»** (salvo en un traslado, donde es lo único que dice si quedó en piso o almacén).
   Antes: «📏 28  🎨 Beige  📍 Piso» con la ruta «Piso → Almacén» abajo. Después: «📏 28  🎨 Beige» y la ruta.
   Ley 8 y 3. **Verificación:** repetir la prueba ciega con la misma pregunta; capturas a 1440 y 375. **Esfuerzo:** S. **Decide:** Felipe (presentación).
   Escéptico: MATIZADO (redundante en venta, devolución, cambio, recepción, ajuste y conteo; en un movimiento interno es el origen; en un traslado es el único dato de la zona).
2. **«quedan 16» dice de qué y dónde.** Es el saldo de esa talla y color en la sede, piso más almacén (`lib/movimientos-saldo.ts`).
   Después: «quedan 16 en la sede» desde 640 px; a 375 se queda «quedan 16» (cabe en 84 px).
   Ley 3. **Verificación:** ciego con la misma pregunta; que suba su seguridad del 40 %. **Esfuerzo:** S. **Decide:** Felipe (es texto sobre stock: no cambia la cifra).
   Escéptico: CONFIRMADO, con dos ajustes ya incorporados («en la sede», no «en la tienda», porque el Taller también es sede; y el ancho a 375).
3. **«Todo el historial» es su propio período.** Antes: queda marcada la píldora «Personalizado» con Desde y Hasta vacíos (`FiltrosMovimientos.tsx:153, 220, 231-234`).
   Después: una píldora «Todo» junto a «90 días» y el panel de fechas cerrado.
   Ley 9 y 3. **Verificación:** tocarla, ver la píldora marcada y la URL `?rango=todo`. **Esfuerzo:** S. **Decide:** Felipe (presentación).
   Escéptico: CONFIRMADO; alternativa más barata: dejar «Personalizado» y escribir «desde el inicio» y «hasta hoy» en las fechas.

## Lo que sobra (ley 8)
- «+0 aparecieron» (o «−0 faltaron») en Ajustes y conteos: el lado en cero no se dice (`TiposMovimiento.tsx:48`; la ayuda de la línea 47 ya lo filtra).

## Lo que no pediste y importa más
Las franjas de colores de cada día son botones de 22 × 12 px que bajan a 3 px de ancho en un día lleno: nadie sin contexto supo qué eran y no se pueden tocar con el
dedo (44 px, `vidrio.md`). Su intención está escrita (ADR-0353 §6), su tamaño no: decidir si se agrandan a una banda de 24 px o se vuelven solo dibujo.

## Lista aparte (no se ejecuta)
1. Operaciones en grande y prendas en chico en la columna de tipos: no es una decisión escrita (escéptico, H5); invertirla mueve también la barra.
2. El desglose de cada tipo solo vive en un `title`.
3. El cajón no dice «quedan» ni muestra la otra fila del mismo día.
4. Las dos filas de un mismo minuto se leen de abajo arriba (la más nueva arriba): el ciego tuvo que mirar la hora.

## Prueba ciega
| Medida | Resultado |
|---|---|
| Lectura de 5 s | Coincide: «una lista de lo que les pasa a las prendas… de dónde a dónde» |
| Primer intento | Sí, sobre capturas (sin tocar) |
| Pasos | Leer el día, abrir la fila, volver: el mínimo |
| Dudas | «quedan 16» (de qué, dónde) · «📍 Piso» (¿estaba o está?) · el orden de las filas · «Personalizado» con fechas vacías |
| Palabras no entendidas | las barritas de colores · «Cuarentena» · «Filtros 1» |
| Errores | Ninguno; dedujo «debe estar en el almacén» porque la pantalla no lo dice |

## Antes de decir «listo»
- **Concurrencia:** la pantalla solo lee un libro que no se edita; dos personas a la vez ven lo mismo. · **Caída externa:** si la base no responde, el ERP manda a
  `/sin-base` (ADR-0450); los saldos que no llegan dejan la fila sin «quedan» (`textoQuedan` devuelve null), sin romperla. · **Persona sin contexto:** ciego sobre
  capturas, sí; colaboradora real, sin probar.

## Historial
| Fecha | SHA | Leyes | Oficio | Cambios cerrados |
|---|---|---|---|---|
| 2026-11-28 | `b3531fe9c` | 6,8 | 5 | — (primera medición; el análisis del 2026-10-03 vive en `docs/pantallas/inventario-movimientos.md`) |
| 2026-11-28 | rama `claude/movimientos-formidable` | sin volver a calificar | 5 (mismas 6 de 8 fallas del medidor: las franjas siguen) | Los 3 cambios y «lo que sobra», con el OK de Felipe: «Dónde» solo en un traslado, «quedan N en la sede» desde 640 px, la píldora «Todo» y sin el lado en cero. Medido: «Todo» marcado sin fechas vacías, las filas 70 px más arriba, «−1 faltaron» |
