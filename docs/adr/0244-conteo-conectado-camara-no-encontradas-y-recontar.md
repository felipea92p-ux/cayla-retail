# ADR-0244 · Conteo conectado: cámara en ráfaga, «no se encontraron» y recontar (parte 1 de 2)

- **Fecha:** 2026-09-26 · **Estado:** Parte 1 construida (solo web, sin migración). La parte 2 (varias personas a la vez)
  está decidida y **sin construir**: necesita migración.
- **Pedido:** Felipe pasó 4 capturas de Conteo y pidió conectarlo con las pantallas nuevas, hacerlo rápido en el celular
  («la mayoría usará el teléfono gran parte del día»), mirar cómo lo hacen otras empresas y quitar lo que sobra. Lo decidió
  en tres tandas de preguntas.
- **Spike:** `docs/maquetas/conteo-conectado-2026-09/spike.html` (computadora y celular lado a lado; README con el análisis).
- **Número:** 0243 lo reservó el PR #520.
- **Sigue a:** ADR-0174 (conteo a ciegas y conteo vacío), ADR-0189 (recontar renueva la foto), ADR-0237 (Existencias
  conectada, `?variantes=` y «por escanear»), ADR-0241 (Conteo acepta `?variantes=`), ADR-0231 (CAYLA no sugiere cuánto
  reponer), ADR-0206 (celular sin barra de navegación), ADR-0136 (hojas).

## Problema

1. En el celular no había cámara: `ConteoPanel` solo aceptaba la pistola o que se escribiera el código. Vender, Cambios y
   Existencias ya leían con la cámara.
2. En el celular, el campo para escanear quedaba como a tres pantallas de la parte de arriba: antes aparecían las tres
   cifras y la cabecera del conteo. La tarjeta «Conteo abierto · Seguir contando» repetía lo que estaba justo debajo.
3. «Faltan por contar» era una fila por talla. En el rack se busca por modelo y color.
4. Al cerrar, lo que nadie contó quedaba como estaba (un aviso ámbar y nada más). En un conteo completo, la merma nunca bajaba.
5. Un error de escaneo pasaba directo a ser un ajuste de stock. Y no había sonido: con la pistola se mira el rack, no la pantalla.
6. Los traslados en camino no se avisaban antes de abrir, y después de cerrar no había un siguiente paso.
7. **Dos personas contando a la vez se pisan.** `conteo_contar` guarda el total de la prenda, y cada celular suma sobre lo que
   tenía al cargar la página: gana la última escritura. Esto lo resuelve la parte 2.

## Decidí (parte 1, construida)

1. **Cámara en ráfaga** (`components/EscanerConteo.tsx`): la misma hoja `variante="camara"` y el mismo lector que Vender
   (`crearLector`). Cada etiqueta suma 1 y la bandeja muestra la prenda con − / + grandes. **La regla nueva es
   `debeContarLectura`:** en una pila de 12 blusas iguales las 12 etiquetas tienen el mismo código, así que el mismo código
   vuelve a sumar solo si la etiqueta **salió del cuadro** (un cuadro sin código) y pasaron 350 ms. La misma etiqueta quieta
   frente a la cámara nunca suma sola. En el celular la cámara es un botón fijo abajo; en la computadora, un botón junto al campo.
2. **Suena y vibra** en cada lectura (`lib/sonido-conteo.ts`, patrones en `PATRON_SONIDO`): agudo = otra unidad, doble =
   la primera unidad de una prenda, grave = el código no es de ninguna prenda. Es una comodidad: sin Web Audio o sin
   vibración, el conteo funciona igual.
3. **Con un conteo abierto se van las tres cifras.** La cabecera del conteo ya dice el avance. La exactitud y el último conteo vuelven al cerrar.
4. **«Faltan» por modelo y color, en pestañas con «Contadas»** (`agruparPorPercha`). Tocar una talla la anota a mano
   (− / +), en cualquier modo.
5. **Imprimir etiquetas:** lo que se eligió a mano (tocando una talla o un resultado de la búsqueda, no leyendo la etiqueta)
   queda en **este aparato** y sale «Imprimir etiquetas · N» con `/etiquetas-de-precio?variantes=`. Se marca al registrar,
   no al elegir: si se cancela, no hubo nada que reponer.
6. **«No se encontraron» se decide al revisar** (Felipe): lo que el sistema tiene aquí, dentro del alcance y con stock, y nadie
   contó. Una por una o todas: «No está → 0» (se anota 0 con `conteo_contar` y el cierre lo ajusta como a cualquier prenda) o
   «Dejar como está» (lo de antes). **Cerrar espera a que estén todas decididas.** Sin migración: un 0 contado es una cantidad más.
7. **Diferencias: opción A, «Recontar las N» opcional** (Felipe, comparando en el spike contra «cerrar directo» y «recuento
   obligatorio sobre un monto»). Las prendas con diferencia vuelven arriba de «Faltan» como «A recontar», «Contadas» esconde
   su cifra y **la primera lectura empieza en 1** (`cantidadTrasLectura`). Sin migración: `conteo_contar` ya renueva la foto
   del sistema al recontar (ADR-0189). La marca vive en este aparato.
8. **Antes de abrir:** si hay traslados hacia la sede por atender (el mismo número del menú, `getTrasladosPorAtender`, sin
   otra consulta), un aviso con «Ver traslados →». Solo a quien ve Traslados.
9. **Después de cerrar, «Lo que sigue»** en el detalle: «Bajar al piso · N» cuando el conteo fue del **piso** y hay prendas
   que quedaron en 0 con algo en el almacén (`getLibreEnAlmacen` + `urlBajarTrasConteo`: llegan con 1 y Bajar las recibe por
   escanear, ADR-0231/0237). Solo en la sede de quien mira y con el módulo `bajada_piso`. Y «Ver los ajustes en Movimientos».
10. **Historial:** los conteos vacíos se pliegan en una línea (`<details>` del navegador, sin JavaScript).

## Decidí (parte 2, sin construir: necesita migración)

- Cada persona cuenta su **tanda** (persona × prenda) y el total de la prenda suma las tandas. Una función que **suma** en vez
  de guardar el total, una tabla de tandas y una lectura para **«Contando ahora»** (quién cuenta qué prenda y cuántas
  lleva). Se actualiza preguntando a la base cada 4 segundos, no con Realtime (principio 9: sin señal, se pone al día sola),
  y **nunca muestra la cifra del sistema**.
- Una prenda se confirma **sola al pasar a otra** (5 s para «Deshacer») o con «Terminé esta prenda».
- **Misma prenda y talla que otra compañera:** se pregunta «otras unidades → se suman» o «la misma pila → mi lectura no cuenta».
  **Otra talla del mismo modelo:** solo un aviso de una línea. **Ya confirmada por otra:** «encontré más → se suman», «la
  recuento → reemplaza» o «no cuenta».
- Con las tandas en la base, las marcas de «a mano» y «recontar» dejan de vivir solo en el aparato.

## Descarté

- **Aviso de mercadería de proveedor por recibir antes de contar** (estaba en el spike): el sistema no sabe qué llegó
  físicamente y no se registró, así que un número ahí sería inventado. Los traslados en camino sí se saben.
- **«Ver en Existencias» por fila y «Recontar» en el detalle cerrado** (estaban en el spike): Existencias no abre una prenda
  por URL con talla y color desde aquí, y recontar un conteo ya cerrado pide abrir otro con una lista guardada en la base
  (parte 2). El recuento vive en la revisión, antes de cerrar, que es donde se evita el ajuste equivocado.
- **Bajar al piso o Traslados mientras se cuenta:** moverían prendas antes de contarlas.
- **Realtime para «Contando ahora»:** más piezas y peor sin señal que preguntar cada 4 s.

## Cómo se verificó

- `lib/conteo-conectado.test.ts` (16 pruebas): ráfaga (la etiqueta quieta no suma; sí suma la que salió del cuadro; un cuadro
  perdido no cuenta), sonidos, recuento desde 1, no encontradas (alcance, stock > 0, sin repetir), decisiones y URLs.
  Suite completa en verde (78.069), `tsc` y `eslint`.
- En el navegador local, con una página temporal y datos de muestra (sin sesión; se borró): contar, «Faltan» por percha,
  anotar a mano → «Imprimir etiquetas · 1», revisión con «No se encontraron» (la de stock 0 no aparece) y «Falta decidir 2»,
  «Recontar las 2» → «A recontar · 2», historial plegado y el detalle con «Lo que sigue». Capturas a 1.440 px y a 375 px.
  La hoja de la cámara se abrió con una cámara falsa; **falta probarla con un teléfono real y etiquetas reales.**
- **Falta:** verlo con una cuenta real (líder e integrante) y un conteo de verdad.

## Actualización 2026-09-29 (ADR-0277)

Se conservan la cámara en ráfaga y el bip (`EscanerConteo`, `debeContarLectura`, `sonido-conteo`). **Se reemplazan** «No se encontraron» / «No está → 0» / «Dejar como está» (una variante sin contar es «Pendiente», nunca 0; el cierre parcial se llama «Cerrar como conteo parcial» y deja las pendientes intactas), el recontar a ciegas (ahora se ve «CAYLA dice» y «Contaste») y las marcas locales `a-mano`/`recontar` en `localStorage` (el estado de reconteo vive en la base). También se retiran «Imprimir etiquetas · N» y «Lo que sigue» del detalle.
