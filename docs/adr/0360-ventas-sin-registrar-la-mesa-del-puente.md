# ADR-0360 · Ventas sin registrar: la mesa del «Puente»

- **Fecha:** 2026-10-07 · **Estado:** construido y verificado en el ERP local (escritorio, dos columnas, celular a 375 px, claro y oscuro).
  **Sin migración de base de datos.**
- **Pedido:** Felipe, 2026-10-06: «quiero cambiar el estilo de la vista de prendas sin registrar, hazme 3 maquetas visuales, amigables,
  sofisticadas y con muchas animaciones». Eligió el formato de la A (el talón con perforación y el hilo); de las tres variantes eligió **A2 «Puente»**
  y pidió dos ajustes: cambiar la parte de arriba («esas cosas no ayudan mucho») y un buscador debajo de las sugerencias «por si no se muestra
  ninguno». El 2026-10-07 pidió implementarla «tal cual», con los dibujos ya establecidos, lo más responsive posible y sin scrolls innecesarios.
  Las maquetas están en `docs/maquetas/ventas-sin-registrar-2026-10/` (`a2-puente.html`).
- **Complementa:** ADR-0179 (la cola «Prenda sin registrar»), ADR-0330 (vive en Existencias), ADR-0334 (sugerencias y cierre de arranque),
  ADR-0333 (la prenda sin foto), ADR-0284 (guía de foco), ADR-0136 (movimiento).

## Qué cambió (y qué no)

**No cambió ninguna regla de dinero, stock ni permisos.** Lo que se guarda es lo de siempre: `regularizar_prenda(p_id, p_variante_id, p_forma)`,
firmada por el «Responsable» (ADR-0162). El precio oficial manda; la diferencia es *cobrado − oficial*; «Perdió la etiqueta» baja 1 del stock y
«Llegó nueva» no lo mueve; 2 días sin regularizar = «Vencida». Siguen igual los cuatro filtros, el buscador de la lista, «quién vendió», el paginado
de 25, «Identificar con sugerencias», «Cerrar la cola de arranque» y «Reabrir».

| Antes | Ahora |
|---|---|
| Una tabla con un botón «Regularizar» por fila y un modal para elegir la prenda | **La mesa**: talones · puente · prendas, todo a la vista (`MesaRegularizar`) |
| Cuatro tarjetas de cifras arriba | **Una franja** de una línea: cuántas faltan (con barra de avance de la visita), «N vencidas» (botón que filtra) y, en chico, el descuento y el sobreprecio del mes |
| Elegir la prenda en un combo de búsqueda | Las seis que más calzan como tarjetas (ícono de la categoría sobre su color, ADR-0333) y, debajo, un **buscador sobre todo el catálogo** |
| El precio se explicaba después de elegir, en una línea | **La balanza**: oficial contra cobrado, con el tramo entre las dos marcas |
| «¿Cómo estaba?» al final de un formulario | En el puente, con la **guía de foco** (qué falta, qué sigue) |

Se fue el orden por cada columna (ya no hay columnas): queda el orden por fecha (el botón «Recientes/Antiguas») y «N vencidas», que deja solo lo
urgente.

## Decisiones

1. **Tres modos según el ancho de la caja de la mesa** (no el de la ventana: el menú lateral le quita 260 px; `modoDeMesa`, medido con
   `ResizeObserver`): **tres columnas** ≥ 1000 px (talones · puente · prendas, con sus dos hilos), **dos** ≥ 700 px (talones a la izquierda y, a la
   derecha, las prendas sobre el puente) y **hoja** < 700 px (solo los talones; al tocar uno, las prendas y el puente suben en un `<Modal>`,
   ADR-0136). Medido sin desborde horizontal de 390 a 2200 px.
2. **Sin scrolls innecesarios:** la página se desplaza con la lista de talones y las columnas del puente y de las prendas van **pegadas** a la ventana
   (`position: sticky`); solo tienen scroll propio si lo que contienen no cabe (el puente con todo desplegado mide ~800 px y cabe a 900 px de alto;
   las prendas con resultados de búsqueda sí se desplazan). El botón «Regularizar» queda pegado al pie del puente aunque este se desplace.
3. **Una sola prenda sugerida, con la definición de la base** (`sugeridaDe`, la de `fn_candidatas_de_venta`, ADR-0334): la única que calza en
   categoría, talla y color **y** tiene al menos una unidad libre en la tienda de la venta. Con dos o con ninguna no se sugiere nada; sin poder leer el
   stock tampoco. **Sugerir no guarda nada:** elegir «cómo estaba» y confirmar sigue siendo de la persona.
4. **Stock a la vista, de la única fórmula** (ADR-0270): `getDisponiblePorSede` lee `fn_existencias` por tienda (solo las tiendas con ventas
   pendientes) y nunca lanza: si falla, la pantalla sigue sin cifras de stock y sin sugerida. Cada tarjeta dice «13 en Lima» o «Sin unidades libres»;
   el puente dice «Libres: 13 → 12» antes de guardar. **No bloquea:** una prenda sin unidades libres puede aun así regularizarse (la base mira el
   stock físico de la tienda, `regularizar_prenda`, y puede aceptarla); el puente solo avisa «Si no llegó registrada, elige “Llegó nueva”».
5. **Los dibujos son los ya establecidos** (ADR-0333): `MosaicoPrenda` (ícono de la categoría sobre el color de la prenda, `colores.hex` y
   `categorias.prefijo/familia`, que ahora trae `getPorRegularizar`). No hay fotos ni dibujos nuevos de prendas.
6. **La guía de foco** (ADR-0284) es la de siempre: `useGuiaCampos` con tres campos requeridos (la prenda, cómo estaba, el responsable), todos sacados
   de lo que ya apagaba el botón; «Falta: …» sobre «Regularizar». La pantalla pasa de «no-aplica» a «aplicada» en `lib/guia-de-foco-pantallas.ts`; el
   modal «Regularizar» deja de existir (el contador de modales pendientes baja de 59 a 58).
7. **Al guardar**, sin releer antes de tiempo: las dos mitades del puente se juntan, cae el sello «Regularizada», el talón se pliega y la franja baja
   su cuenta al instante; recién a los 1,7 s se relee la lista (`router.refresh()`) y se elige la siguiente venta. Un clic no puede repetirse.
8. **Lógica pura con prueba** (`lib/por-regularizar-mesa.ts`, 28 casos): cómo calza una prenda, el orden en que se ofrecen, la sugerida, la búsqueda
   (por inicio de palabra, sin tildes; el guion del código vale por espacio: «CAS-014» = «cas 014»), la diferencia de precio, la balanza, los tres
   visitos, el avance de la visita y el modo según el ancho.

## Movimiento (excepción de ADR-0136, pedida y elegida por Felipe)

Esta pantalla agrega movimiento «rico» (ver ADR-0136, «Actualización 2026-10-07»), con `--ease-cayla`, **sin rebote y sin bucle** (salvo el punto de
«Vencida», que late tres veces como el del chip), cada efecto corre una vez y todo se apaga con `prefers-reduced-motion`: el talón elegido se adelanta
y su hilo se dibuja, la cuerda se traza y los tres visitos entran en cascada, la balanza se llena, y al guardar las mitades se juntan, cae el sello y
el talón se pliega. Vive en `app/estilos/ventas-sin-registrar.css`.

## Lo que quedó fuera

- Las variantes A3 «Arrastrar» y A4 «Perchero» y las maquetas A, B y C: siguen en `docs/maquetas/ventas-sin-registrar-2026-10/` por si se retoman.
- «Identificar con sugerencias» sigue siendo la hoja de ADR-0334 (casillas sin marcar, solo líder), sin tocar.
- No se probó con una cola de más de 25 ventas (el paginado no cambió) ni con la cuenta de una colaboradora de tienda (el rol no cambia lo que ve la
  mesa; la base sigue decidiendo qué puede regularizar).

## Cómo se verifica

`pnpm --filter web test` (374 archivos, 156 240 pruebas, entre ellas `lib/por-regularizar-mesa.test.ts`, `guia-de-foco`, `sugerir`, `tema-colores`,
`reglas-sin-uso`); `pnpm --filter web tema:auditar -- --cuenta admin --ruta /inventario/por-regularizar --escenarios` en 1440 × 900 y a 375 px (0
hallazgos solo en oscuro; los escenarios nuevos `regularizar.puente` y `regularizar.hoja` abren lo que dicen). A mano, en local: elegir, guardar y ver
que la franja, el talón y la base (`prendas_por_regularizar`, `movimientos`) cuadran.

## Actualización 2026-10-07 (b) — después de `/formidable` y `/chaos` (cambios 1 y 2 de Formidable y los 4 hallazgos del caos)

Informes: `docs/formidable/inventario-ventas-sin-registrar.md` y el tablero de `docs/chaos/README.md`. Felipe eligió los cambios 1 y 2 más los cuatro del caos; el 3 («¿Por qué?» tocable y
un veredicto por tarjeta) queda pendiente. **Ninguno toca dinero, stock ni permisos.**

- **Nada importante bajo el pliegue.** Las herramientas pasan a UNA fila (buscador, pastillas, orden, «quién vendió») y lo que solo hace un líder —«Identificar con sugerencias» y «Cerrar la cola de
  arranque», con su plazo en la propia opción— va en el menú «Más» (`MenuAcciones`); la línea del plazo solo sale a la vista cuando hay algo que explicar (venció, no hay plazo, o es el último día). La
  mesa empieza al 51 % de la altura a 1440×900 (antes 64 %). Al elegir prenda y al elegir «cómo estaba» la página trae el botón «Regularizar» a la vista (no mientras se teclea).
- **La rueda ya no se atrapa:** se quitó `overscroll-behavior: contain` de las columnas pegadas (con la rueda sobre las prendas la página baja).
- **Devuelto lo que anotó caja:** el talón y «Lo que anotó caja» dicen «Talla S · Beige» (regresión del rediseño), quién vendió y cuándo van en su propia línea, y cuando un visito sale «≠» una lista dice
  contra qué («Caja anotó talla M; esta es talla S», `diferenciasDe`). Todo texto propio de la mesa pasó a 12 px o más (rótulos en minúscula, sin mayúsculas ni espaciado), el texto del puente vacío
  pasó de 3,43:1 a 5,3:1, los rótulos de la balanza se alinean hacia adentro cerca de los bordes y «Sugerida» usa `crema` (no `crema-fija`) para leerse también en oscuro.
- **Teclado:** la lista de talones es UNA parada de Tab (la venta elegida) y se recorre con ↑ ↓, Inicio y Fin (el foco se mueve; elegir es Enter o Espacio). Antes eran hasta 25 paradas.
- **Foco:** al cerrar la hoja del celular el foco vuelve al talón con que se abrió (`alCerrarEnfocar`).
- **Otra persona ganó la misma venta:** si la base responde `prenda_ya_regularizada`, el aviso dice «Otra persona ya regularizó esta venta (o se anuló). Actualizamos la lista…», la pantalla se relee
  sola y la prenda elegida se suelta (la base ya impedía el doble efecto; era solo la cara del error).
- **Verificado:** 374 archivos de pruebas (+3 casos nuevos), `tema:auditar` a 1440 y 375 px con 0 hallazgos solo en oscuro, y los ataques que fallaban se repiten y resisten (la rueda mueve la página,
  un solo Tab para los talones, el foco vuelve, la relectura ocurre). Límite conocido: a 1440×800 con pocas ventas el botón puede quedar a ~5 px del borde porque la página no tiene más recorrido.

## Actualización 2026-10-07 (c) — el cambio 3 de Formidable: un veredicto y un «¿Por qué?» tocable (nada queda pendiente de esa corrida)

- **Un veredicto por tarjeta** en vez de «coincide 2/3» + rayitas + visitos repetidos: «Calza en todo» (verde) o qué cambia («Cambia la talla», «Cambia el color», «Cambian talla y color», «Es otra prenda»;
  `veredictoDe`, con su prueba). La diferencia de precio de cada tarjeta se ve siempre (antes solo con hover o foco).
- **«¿Por qué?» tocable** (`PorQue`, un botón con `aria-expanded` y una nota en hueso; nunca solo hover): «¿Qué es “vencida”?» en la franja, «¿Por qué estas?» sobre las prendas (el orden y por qué «Sugerida») y «¿Cuál elijo?»
  bajo «cómo estaba» (qué hace «Perdió la etiqueta» y qué hace «Llegó nueva»). Se quitaron los `title` que eran lo único que explicaba.
- **Si falla la lectura del stock, la pantalla lo dice:** «No pudimos leer cuántas hay en la tienda ahora… Puedes regularizar igual».
- **Palabras:** «La unión» → «Venta y prenda»; se quitó «Descuento no planificado» del puente (la frase «Se cobró S/ 10.00 menos que el oficial» ya lo dice y se borró `nombreDeDiferencia`); «Libres» → «Unidades libres»; el aviso de
  cero unidades ya no dice «registrada» sino «Si nunca se contó en un lote, elige “Llegó nueva”».
- **Lo que sobraba:** el chip «Pendiente» en cada talón del filtro «Pendientes» (la «Vencida» se queda) y la nota larga del pie (de cuatro frases a dos).
- **Ajustes que salieron de la segunda prueba ciega:** el botón «Regularizar» queda a la vista también a 1440×800 y 1440×720 (el pie del puente se pega al borde sin cortarse) y al abrir un «¿Por qué?» el puente se trae a la vista.
- **Segunda prueba ciega (otra tarea, otra venta):** completó la tarea al primer intento, 8 pasos, 0 retrocesos, sin errores; el aviso de éxito y el contador lo confirmaron. Dudas que quedan: «Cerradas» frente a «Regularizadas» (heredado) y que la
  primera venta entre elegida sola (confundió un momento cuál estaba activa); se dejó así a propósito: con una sola tarea por venta, ahorra un toque en cada una.

