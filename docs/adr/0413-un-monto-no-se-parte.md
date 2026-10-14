# ADR-0413 · Un monto no se parte: «S/» y la cifra van con un espacio que no se parte, en todo el ERP

- **Fecha:** 2026-10-14 · **Estado:** pedido por Felipe el 2026-10-14 («Evitar que "S/" y la cifra se partan en todo el ERP», la tarea
  que dejó /formidable de Fondos por rendir). La forma —corregirlo donde nace el espacio y vigilarlo con una prueba— es técnica y sin regla
  de negocio: solo cambia el carácter que separa «S/» de la cifra. Solo web: sin migración, sin RPC. Rama `claude/montos-sin-corte`.
- **Extiende:** ADR-0362 decisión 83 (donde nació `solesSinCorte`, que esta decisión absorbe en `soles`).

## El problema

Un renglón que se acaba justo en un monto lo partía en dos: «S/» al final y la cifra al comienzo del siguiente. Se vio en Fondos por rendir
(«No escribió qué pasó: si se aprueba así, su deuda pasa de S/ ⏎ 25.00 a S/ 30.00») y es igual en toda frase con un monto: el subtítulo de
una hoja, un `<Aviso>`, el pie de la guía, un aviso de éxito, una celda angosta, el ticket de 80 mm. La causa es una sola: el ERP escribía
«S/» y la cifra separadas por un espacio **normal**, que el navegador puede usar para bajar de renglón.

El propio `Intl` en es-PE ya lo escribe bien: `new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" })` da «S/ 1,234.50» con
`U+00A0`, el espacio que no se parte. El ERP no lo usaba: `soles` (`lib/compras-reglas.ts`) y unas quince copias locales armaban el texto a
mano con un espacio normal, y otros 160 textos lo escribían directo.

## Inventario (2026-10-14, sobre la punta de #1088)

- **173 textos en 111 archivos** de `app/`, `components/` y `lib/` escribían «S/» + espacio normal: `soles` y sus copias (`club`,
  `caja`, `cierre`, `comprobantes`, `ordenes-insumo`, `produccion`, `perdidas`, `cuentas-dinero`…), plantillas como `` `Faltan S/ ${x}` ``,
  sumas como `"S/ " + n` y texto de JSX como `<b>S/ {precio}</b>`.
- **38 migraciones** arman mensajes con montos (`raise exception '… S/ % …'`). Llegan a la pantalla, casi todas, por `traducirError`.
- **Descripciones de Actividad** (las escribe Postgres: «vendió 2 prendas por S/ 189») que el Inicio muestra como la última acción de cada
  persona; y el detalle de los errores de Liquidación.
- **625 apariciones en 89 archivos de pruebas**, de las que 372 eran montos esperados.

## La decisión

1. **Todo monto que el ERP escribe lleva el espacio que no se parte**, donde nace: `soles` devuelve «S/ 1,234.50», y lo mismo cada
   copia local, cada plantilla y cada texto de JSX (`S/&nbsp;{precio}`). Se hizo con una transformación sobre el árbol del código (solo
   textos y JSX; nunca comentarios), revisada caso por caso.
2. **Lo que llega hecho desde afuera se arregla al mostrarlo**, con una sola pieza: `montosSinCorte(texto)` (`lib/montos-sin-corte.ts`).
   La usan `traducirError` (todo mensaje de la base), `errorDeLiquidacion` y la última acción del Inicio. Las migraciones no se tocan.
3. **`solesSinCorte` desaparece**: era la misma idea solo para las frases de Fondos; ahora es lo que hace `soles`.
4. **Lo vigila `lib/montos-sin-corte.test.ts`**: lee el árbol de cada archivo de `app/`, `components/` y `lib/` y falla si un texto que el
   ERP escribe trae «S/» con un espacio normal, con el mensaje de cómo arreglarlo. Una línea que de verdad necesita el espacio normal lleva
   `// monto-partible: <por qué>`.

## Lo que NO cambia (a propósito)

- **Lo que se guarda o va a SUNAT.** `lib/ya-emitido-reglas.ts` arma el texto que se guarda en la cola de Lucode (`enCola`): sigue con
  espacio normal y lleva su `// monto-partible:`. Lo de comprobantes y SUNAT no se toca sin Felipe. El QR de la boleta no lleva «S/». Ningún
  texto que se manda a una función de la base trae un monto escrito con «S/» (revisado archivo por archivo en los 26 que también guardan).
- **Lo impreso cambia solo el carácter**: la boleta A4, el ticket y la frase de la Ley 29571 se ven igual en el papel, pero el ticket
  angosto ya no puede partir un monto.
- **El valor de un atributo** (`placeholder="S/ 0.00"`): una caja de una línea no se parte.
- **Los exportes** (CSV, Excel) no escriben montos con «S/».
- **Lo que el código busca en un texto** (`texto.replace("S/ ", …)`) ni las expresiones regulares que leen montos (el cartel del club pasó a
  `/^S\/\s/`, que lee los dos espacios).
- **Lo que una función devuelve tal como llegó** (la nota de un ingreso, el resaltado de una búsqueda): su prueba sigue con el espacio normal.

## Descartado

- **Cambiarlo solo en las frases, con `solesSinCorte`** (lo que proponía la tarea): dejaba dos formas de escribir un monto y la mala seguía
  a mano para la próxima pantalla; una celda angosta también se parte; y ninguna prueba podía vigilarlo. Arreglarlo donde nace es la causa
  (principio 12).
- **CSS (`white-space: nowrap`)**: no existe una regla que impida partir en UN espacio de un texto corrido; habría que envolver cada monto
  en su elemento, en 173 lugares, y los mensajes de la base no tienen elemento.
- **Normalizar en las piezas comunes** (`<Aviso>`, el subtítulo de `<Modal>`, `avisar.*`): arregla solo lo que pasa por ellas, en
  silencio, y una pantalla que dibuja su frase a mano quedaba fuera.
- **Cambiar las 38 migraciones**: tocar la base y pegar en producción por un carácter; el mensaje se arregla igual al mostrarlo.
- **Quitar el espacio** («S/25.00», como el `money` del punto de venta): cambia cómo se ve el monto en todo el ERP; la forma peruana es
  «S/ 25.00».

## Verificación

- `lib/montos-sin-corte.test.ts`: el detector con ejemplos (lo que cuenta, lo que no, la marca), `soles` igual a `Intl`, `montosSinCorte`
  y un mensaje de la base por `traducirError`; y el repo entero en cero.
- Las pruebas de la web: 159 523, en verde. Las fotos de la matriz de cantidades cambian solo en ese carácter (comprobado); la huella de la
  guía de Plan de campaña, solo por la etiqueta «Usar el del catálogo: S/».
- En el navegador, contra el banco local, con un recorrido que mira el texto ya dibujado: las 88 pantallas del ERP (todas las rutas sin
  dato, menos «Por reintentar», que llama a Lucode al abrirse), las de tienda con la sede puesta. **0 montos que se puedan partir** y 440
  con el espacio que no se parte, en 42 pantallas. A 375 px, Vender, Apartados, Historial, Cambios, Devoluciones y Caja: también 0.

## Consecuencias

- Una prueba que compara un monto escrito por el ERP lo espera con ` ` («S/ 20.00»). El mensaje de la prueba guardiana lo dice.
- El cambio toca 111 archivos, uno o dos caracteres por línea: un PR abierto que edite la misma línea tendrá un conflicto trivial. Si
  trae un «S/ » nuevo, la prueba guardiana se lo dice al fusionar.
