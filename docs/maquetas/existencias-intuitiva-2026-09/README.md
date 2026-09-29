# Existencias intuitiva · spike (2026-09-28)

Pedido de Felipe: que Existencias sea lo más intuitiva posible, que cualquier persona la entienda sin que nadie se la
explique y sin marearse.

`spike.html` se abre directo en el navegador (datos inventados de Tienda Lima). Muestra la pantalla en computadora
(1.440 px) y en celular (375 px) lado a lado. La barra oscura de arriba no existe en el ERP y alterna tres cosas:

1. **Aparato:** los dos, solo computadora o solo celular.
2. **Quién entra:** líder o vendedora sin el módulo «Bajada al piso» (ADR-0240).
3. **Notas de diseño:** los círculos rojos numerados. Cada uno corresponde a una fila de la tabla «Por qué hoy marea y
   qué cambia», al pie.

Todo es clicable: buscar, los atajos, abrir una prenda, elegir talla, «Bajar al piso» con su contador (al confirmar,
la celda cambia en el lugar y sale el aviso), una talla agotada con «Pedir a otra tienda», «Más opciones», el
escáner del celular y el menú «Más». Los enlaces a otras pantallas no navegan: dicen a dónde irían. Para fijar un
estado (así se sacaron las capturas): `?solo=pc|tel&en=pc|tel&abrir=<id>&talla=M&bajar=1&atajo=faltan&rol=vend&notas=0`.

## Qué es y qué no es

- **Es** una propuesta de cómo se lee y dónde se decide. Mismo stock, mismas acciones y las mismas funciones de la
  base que hoy: `mover_entre_piso_y_almacen`, `apartar_prenda`, `pedir_prenda_para_apartar` y `ajustar_inventario`.
  **No hace falta migración.**
- **No cambia** la pantalla de `main`. Si Felipe la aprueba, la implementación va en otro PR, sobre
  `InventarioPanel.tsx`, `ExistenciasPorPrenda.tsx`, `DetallePrendaExistencias.tsx` e `inventario/page.tsx`.
- Parte de la pantalla de `main` al 2026-09-28 (`6f568acd`): ADR-0237 más las tareas #1 a #11 de
  `docs/pantallas/inventario.md`, todas hechas. Ese análisis midió que funciona; este spike ataca lo que queda: que
  se entienda.

## Diagnóstico en una línea por problema

| # | Hoy marea porque… | El spike lo resuelve con… |
|---|---|---|
| 1 | La misma tarea tiene cinco nombres («Reponer a piso hoy», «Por colgar», «Reponer N tallas», «Reponer al piso», «Bajar al piso») | Un verbo, **«Bajar al piso»**, y un estado, **«Falta en el piso»** |
| 2 | Siete bloques antes de la primera prenda (5 accesos, 4 tarjetas, 3 enlaces, 6 combos, píldora, interruptor) | Tres preguntas: «¿Qué hago hoy?», «¿Hay tal prenda?» y la lista |
| 3 | El buscador es un campo más entre los combos | Buscador grande primero (fijo en el celular) + 5 atajos con su número; categoría y talla van a «Más filtros» |
| 4 | «0·6» se entiende solo con una leyenda que está al pie | Mini tabla por prenda con los renglones **Piso** y **Almacén** rotulados; ámbar = falta, punteado = agotada |
| 5 | El detalle tiene tres bloques del mismo peso | «¿Qué talla?» arriba; si falta algo, abre parado en esa talla |
| 6 | Tocar una talla muestra botones, pero no explica qué pasa | Dos cifras con nombre + una frase («La clienta no la ve: las 6 de la M están en el almacén») + UN botón principal; lo demás, en «Más opciones» |
| 7 | La cabecera tiene dos filas de accesos, y el primario es «+ Nuevo traslado» | Un primario («Bajar al piso»), «Escanear» y «Más» con una línea por pantalla |
| 8 | Tras reponer, la fila cambia sin decir qué pasó | La celda se ilumina 900 ms y el aviso dice qué quedó dónde (después del loader, ADR-0149) |

## Decisiones que quedan para Felipe antes de implementar

1. **Vocabulario: ¿se retira «Por colgar»?** Es palabra de Felipe (ADR-0208, Frescura del piso). El spike la cambia por
   «Falta en el piso» para que el verbo sea uno solo («Bajar al piso», que ya es el nombre del módulo y de su pantalla).
   Si «colgar» es como hablan en las tiendas, se puede hacer al revés («Colgar en el piso» / «Por colgar»), pero
   siempre una sola pareja de palabras en toda la pantalla.
2. **La vista «Por talla»** (tabla con Cobertura y Ritmo, ADR-0231) no aparece en el spike. Propuesta: pasa a
   Análisis, que es donde se lee ritmo y cobertura. Si Felipe la quiere en Existencias, va dentro de «Más filtros»,
   nunca como interruptor al lado de la lista.
3. **«Disponible total» y su «% vs. semana anterior»** bajan a una línea de texto, sin tarjeta ni comparación. La
   comparación semanal es una lectura de líder y encaja mejor en Análisis.
4. **«Ver recomendaciones» y «Ver análisis de cobertura»** salen de Existencias. Hoy son dos enlaces sobre las tarjetas
   que abren paneles de análisis.

## Qué se rompería si se implementa sin cuidado

- Las pruebas de `lib/existencias-permisos.test.ts` vigilan quién ve cada botón del detalle. Mover acciones a «Más
  opciones» no cambia los permisos, pero sí los textos: hay que revisar las pruebas que buscan por texto.
- «Bajar al piso» de una talla (contador) es `ReponerPisoModal` → `mover_entre_piso_y_almacen`. La bajada de varias
  prendas sigue siendo `/inventario/bajar`, que se llena escaneando (ADR-0237, act. noche). Son dos puertas con el
  mismo candado (ADR-0240) y en el spike se llaman igual a propósito.
- En el Taller (no separa piso y almacén) la mini tabla lleva un solo renglón («Hay») y no existe «Falta en el piso».
  El spike no lo muestra.
