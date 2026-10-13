# Maqueta · Recibir mercadería: el fardo que manda Compras (2026-10-12)

Lo que pidió Felipe: *cambiar el diseño que tiene hoy Recibir mercadería para que cualquiera entienda el proceso completo. Llega un
fardo que mandó Compras, con distintas categorías, marcas y proveedores. Primero lo abren y cuentan las prendas para ver si el número
coincide con lo que les dijeron (hoy por WhatsApp; el módulo de Compras lo está cambiando). Después ordenan y etiquetan las que ya se
conocen; también llega mercadería nueva, que tendrían que registrar, y puede que lo vean mientras cuentan. Que pongan la categoría que
van a contar y si el producto es nuevo o no, para que después se acuerden de crearlo. Amigable, sofisticado, lleno de animaciones.
Tres maquetas para evaluar cuál es la más apta.*

**Abrir:** `index.html` (las tres con pestañas) o cada archivo suelto. Con un servidor estático: la configuración `maquetas` de
`.claude/launch.json` (`python3 -m http.server --directory docs/maquetas`) y luego `/recibir-fardo-2026-10/`. La barra punteada de
arriba no es parte de la pantalla: cambia los datos (**con aviso de Compras** / **sin aviso, por WhatsApp**), el tema, el ancho
(escritorio o 375 px), el movimiento, y **«▶ Ver cómo se recibe»** recorre la recepción entera sola, como lo haría Mariana, de almacén.

## Actualización 2026-10-13 — Felipe eligió A y corrigió el proceso

Lo que dijo: *me gusta la A. Todas las prendas llegan **sin etiqueta**, así que escanear está de más. Las colaboradoras abren el fardo y
**cuentan por categoría**; si ven una prenda conocida, buscan su **nombre** y ponen cuántas llegaron, y si quieren ahí mismo las
variaciones, o lo dejan para cuando termine el conteo, **como un pendiente**; igual con las nuevas: un aviso de cuántas hubo y de qué
categoría. Lo esencial es contar el fardo primero.*

Lo que cambió en `a-camino.html` (versión 2; B y C quedan como referencia del 12-oct, sin actualizar):

- **Sin pistola.** Tres paradas: ¿Qué llegó? → **Contar** → Cerrar. El riel y el punto que late siguen igual.
- **Contar es lo esencial** y lo único que se exige por categoría: el número grande. Debajo, **«¿Qué blusas son?» es opcional**:
  se busca una prenda conocida **por su nombre** y se pone cuántas; cada una ofrece «Tallas y colores ahora» (la matriz del catálogo)
  **o queda pendiente**. Lo nuevo se anota como **cantidad** («Nuevas, no están en el catálogo: 6») y describirlo (nombre, color, tallas)
  también puede esperar. Lo que no se separe queda como pendiente; nada de eso frena el cierre.
- **Cerrar** pide solo lo que no cuadró (causa) y quién contó. La tabla dice, por categoría, cuánto entra al stock hoy y qué queda para después.
- **Fardo cerrado:** el conteo es oficial; «Ya en el stock» son las prendas con tallas y colores (ahí van «Imprimir N etiquetas» —todo llegó sin
  etiqueta— y «Colgar en el piso»); **«Para después · N pendientes»** lista cada uno con «Hacer ahora» (separar en una hoja, poner tallas y
  colores, crear lo nuevo) y la cabecera de Recibir muestra «N pendientes del fardo». Al resolverlos, las prendas entran al stock con la
  cantidad ya contada.

**Lo que esto cambia en el contrato (y no estaba en la versión 1):**

1. **El fardo se cierra sin que todo esté en el stock.** Al stock entra lo que ya tiene tallas y colores; el resto son prendas contadas que
   están en el almacén pero no en el sistema hasta resolver su pendiente. Mientras tanto Vender no las encuentra y Colgar en el piso no las
   ofrece: el candado es ese. La tabla nueva ya no es solo `prendas_por_crear`: es **`fardo_pendientes`** con tres tipos (`separar`,
   `detalle`, `crear`), cada uno con su cantidad, la línea del fardo, quién lo anotó y cómo se resolvió.
2. **El conteo por categoría es un dato propio** (`recepcion_conteos`: línea, contadas, quién, cuándo), distinto de los movimientos de stock:
   es lo que se compara contra el despacho de Compras y lo que firma quien contó.
3. **Separar más de lo contado corrige el conteo** (la prenda en la mano manda); el detalle por tallas corrige la cantidad del producto.

**Decisiones que ya quedaron tomadas con esto:** no hay escáner; contar primero; separar y detallar son pendientes, no candados.
**Siguen abiertas:** quién crea lo nuevo; si la sede ve el precio de la línea; dañadas a cuarentena; el «dijeron» del WhatsApp; y una nueva:
**¿puede colgarse en el piso una prenda contada pero sin tallas?** (la maqueta dice que no, hasta resolver el pendiente).

## Qué hay hoy y qué le falta

`/recibir` abre en «Llegó mercadería» (ADR-0330, 2026-10-04): se elige el proveedor, se escanea o busca cada prenda y cada lectura suma
una; entra al almacén con `recibir_lote`. Está bien para lo que resuelve —meter al stock lo que ya existe en el catálogo— y no cambia por
debajo. Lo que el proceso real tiene y la pantalla no:

| Lo que pasa en la tienda | Lo que la pantalla de hoy hace |
|---|---|
| Se abre el fardo y se **cuenta contra lo que dijeron** (por WhatsApp; pronto, el despacho de Compras, ADR-0362) | No hay con qué comparar: ni «dijeron» ni «contaste» |
| Se cuenta **por categoría** («40 blusas, 24 vestidos…») | Se escanea prenda por prenda, sin categoría ni montón |
| Parte de lo que llega es **nuevo** (no existe en el catálogo) y alguien tiene que **crearlo después** | La pistola no la encuentra y no hay salida: «no encontrado». Lo nuevo se queda sin anotar y sin recordatorio |
| Si no cuadra, la sede dice **por qué** (no vino, se dañó, Lima lo mandó a otra sede…) y Compras lo cobra | Nada: una diferencia no deja rastro |
| Al final: **etiquetar** lo conocido y **colgarlo** | Sí: «Imprimir etiquetas» y «Bajar al piso» después de recibir (se conserva) |

## El proceso que las tres respetan (el contrato)

Las tres caras pintan **el mismo modelo** (`_comun.js`, `Modelo`): cambia cómo se recorre, no qué se guarda.

1. **Llega.** Un fardo que Compras despachó (con su lista: categoría + marca + cantidad por línea, nunca talla por talla, ADR-0362 d.10 y
   d.13) o **algo sin aviso** (se elige el proveedor y, si lo dijeron, cuántas venían). Lo de otra sede de CAYLA no entra aquí: es Traslados
   (ADR-0299).
2. **Contar.** Cuántas llegaron de cada categoría. Es un hecho físico; si no coincide con lo que dijeron **no bloquea**: se explica al cerrar.
3. **Separar.** Cada prenda contada es **conocida** (la pistola encuentra su etiqueta, o se encuentra por nombre: entra al stock del almacén)
   o **nueva** (no existe en el catálogo: se anota qué es, color, tallas y cuántas, y queda **por crear**). Separar más de lo contado corrige
   el conteo: la prenda en la mano manda sobre el número tecleado.
4. **Cerrar.** Cada diferencia lleva su causa, elegida por la sede con las palabras del anexo de ADR-0362 (*No vino del proveedor · Lima lo
   mandó a otra sede · Se perdió en el camino · Llegó dañada · Vino de más · Era de otra sede · Llegó algo que no se pidió*); la sede nunca ve
   soles, Compras decide qué pasa con la plata. **Quién recibe** firma (combo Responsable, ADR-0162) y nunca es quien hizo la orden de
   compra (ADR-0362 d.17: por eso Rosa Delgado no aparece).
5. **Después.** Las conocidas ya están en el almacén: «Imprimir N etiquetas» y «Colgar en el piso». Las nuevas quedan **guardadas pero sin
   vender** hasta que alguien las cree; el recordatorio vive en Recibir, en Catálogo ▸ Productos ▸ **Por crear** y en el Inicio de la
   encargada, y al crearlas **el stock contado entra solo** (como «Nuevo producto con su stock», ADR-0212).

**Estados que no pueden existir** (lo que apaga «Recibir» y pinta «Falta:», ADR-0284): una prenda contada que no es conocida ni nueva; una
diferencia sin causa; una recepción sin quién. Lo opcional de verdad (la guía, el color de una nueva) nunca es un candado.

## Lo que las tres hacen igual

- La cabecera de Inventario (`EncabezadoPagina`), las piezas únicas (ADR-0358: `Chip`, `TarjetaCifra`, botones con su movimiento, `Vacio`,
  `Aviso`), la hoja «Prenda nueva» con la guía de foco (ADR-0284: una luz a la vez, ✓ que se dibuja), la pantalla final «Recibido» con el
  sello que se traza y las tres salidas (etiquetas, colgar, por crear), y el ejemplo que sigue a la categoría elegida (ADR-0290: en Casacas la
  caja dice «Ej. Casaca acolchada con capucha»).
- **La prenda sin foto es el ícono de su categoría sobre su color** (ADR-0333), nunca el isotipo.
- Solo tokens de `globals.css` / `tema.css`, en claro y en oscuro; probadas en escritorio y a 375 px; todo el movimiento con `--ease-cayla`,
  sin rebote y sin bucle, salvo las señales ya permitidas (el punto del paso abierto en A late como en Nuevo producto, ADR-0136 act.
  2026-10-06; el chip «en camino» late como «Vencida»). Con «Sin» en la barra o `prefers-reduced-motion`, todo se apaga.
- La pistola real escribe el código y manda Enter; aquí el botón «Leer con la pistola» la simula leyendo la caja real del fardo.

## A · Camino — `a-camino.html`

Cuatro paradas, una a la vez: **¿Qué llegó? → Contar → Separar → Cerrar.** El riel de arriba dice dónde estás y qué falta; cada paso entra
dando vuelta la página. Contar es por categoría con un número grande (−, +, +5, +10, «Llegaron las 40») y la barra que se pone verde al
cuadrar; Separar es la pistola sobre esa categoría, con lo conocido y lo nuevo en dos columnas; Cerrar es una tabla de lo que dijeron contra
lo que contaste, con las causas en píldoras, la guía, quién recibe y «Falta:» tocable.

- **Movimiento:** el hilo del riel se dibuja y los puntos se encienden en orden; la caja del fardo abre su tapa y asoman las prendas; el
  número rueda; la barra crece y cambia de tono; la balanza se inclina; el láser cruza la caja de la pistola y la caja destella en verde (conocida)
  o ámbar (nueva); el ✓ se dibuja en cada parada cumplida.
- **A favor:** no hay que entender nada antes de empezar: una pregunta, una respuesta (ley 2 de Formidable); sigue el orden real de la
  tienda (primero contar, después separar); el riel es un mapa del proceso que enseña solo; en celular es la que mejor cabe.
- **En contra:** es la más larga en clics (cinco categorías × dos pasos); quien ya sabe recibir siente los pasos como peaje; contar y separar
  dos veces la misma pila puede sentirse repetido cuando casi todo es conocido.

## B · Mesa de conteo — `b-mesa.html`

Sin pasos. Se abre el fardo y sobre la mesa aparece **un montón por categoría**: número grande, pila de papeles que crece, anillo contra lo
que dijeron, +1 por prenda (o se escribe el total), pistola, «es nueva» y, si no cuadra, «¿por qué?» ahí mismo. A la derecha, las
**bandejas** donde va cayendo lo separado —«Para etiquetar» y «Por crear»— y abajo quién recibe y el botón. Se trabaja montón por montón,
en el orden que se quiera, con todo a la vista.

- **Movimiento:** los montones suben en cascada al abrir; el +1 sube y se apaga; el anillo se llena y se pone verde; al leer, **una ficha vuela
  del montón a su bandeja**; el montón que se mira resalta y los demás bajan; los detalles se despliegan sin salto.
- **A favor:** contenido primero (ley 5): se ve el fardo entero y cuánto falta de cada cosa de un vistazo; la encargada puede supervisar
  desde lejos; las bandejas hacen visible el «por crear» todo el tiempo, no solo al final; dos personas pueden contar montones distintos.
- **En contra:** la pantalla es la más cargada (cinco tarjetas con tres controles cada una); en celular las bandejas pasan a una barra abajo y
  se pierde la gracia de la mesa; a alguien nuevo le cuesta saber por dónde empezar (no hay «sigue aquí», hay todo).

## C · Hilo de la pistola — `c-hilo.html`

**Una sola caja arriba.** Cada lectura escribe una línea en el hilo y suma: lo conocido se suma solo (y las lecturas iguales se juntan: «Blusa
Aurora · M · Negro ×6»); lo que la pistola no encuentra pregunta ahí mismo **«¿es nueva?»** con tres salidas (es nueva · buscar por nombre ·
ignorar). Contar y separar son **el mismo gesto**; para lo que no tiene código hay «+1 sin código» por categoría. A la derecha, el riel: cada
categoría con su barra (conocidas · nuevas · sin separar) contra lo que dijeron, la balanza, «Por crear», y «Cerrar el fardo», que pregunta
solo lo que no cuadró como líneas más del hilo.

- **Movimiento:** el láser cruza la caja en cada lectura; la línea nueva entra arriba y las demás bajan (FLIP); el ×6 rueda; las barras del
  riel se llenan en vivo; la línea «no está en el catálogo» pulsa una vez; al recibir, el hilo se pliega y aparece el sello.
- **A favor:** la más rápida con una pistola (una lectura, una línea, cero pasos); el registro se hace en el momento del hecho; el hilo es un
  comprobante legible de lo que pasó; es la que más se parece a «Llegó mercadería» de hoy, así que cuesta menos construir sobre ella.
- **En contra:** sin pistola (o con prendas sin etiqueta) es la más floja: el «+1 sin código» no separa y hay que buscar por nombre una por
  una; el hilo crece (118 líneas aunque se junten) y la comparación por categoría queda en un panel lateral que en celular sube arriba;
  no sigue el orden «primero cuenta, después separa» que Felipe describió.

## Lo que recomendé el 12-oct (Felipe eligió A el 13-oct)

```
DECIDÍ:    A · Camino como estructura, con dos préstamos: de B, que el «Por crear» se vea todo el tiempo (una bandeja fija en el paso
           Separar, no solo al final); de C, que al no encontrar un código la pregunta «¿es nueva?» salte sola sobre la caja de la pistola
           (ya lo hace: la hoja «Prenda nueva» se abre con el código del proveedor).
DESCARTÉ:  B, porque «todo a la vista» es lo contrario de «cualquiera entiende el proceso»: a la persona nueva le muestra cinco tarjetas y
           quince controles sin decirle por dónde empezar, y en el celular pierde la mesa. C, porque depende de que cada prenda tenga
           código: hoy lo que llega del proveedor no trae la etiqueta de CAYLA (por eso se etiqueta después), y en ese caso C obliga a
           buscar por nombre una por una. C queda como la mejor forma de la pantalla DESPUÉS, cuando lo que llegue ya venga etiquetado.
SE ROMPE SI: un fardo trae 20 categorías (A son 40 paradas: habría que agrupar por proveedor), o si en la práctica cuentan y separan en
           el mismo gesto (entonces contar primero es un paso de más y B o C lo resuelven mejor). Lo dice la primera semana de uso en TRU.
```

**Lo que Felipe decide mirando (no por esta descripción):** cuál de las tres, y si en A el paso Contar puede saltarse cuando se prefiere
contar con la pistola.

## Lo que necesita de la base (fase 3 de ADR-0362, aún sin dueño)

- **Leer el fardo:** `fn_despachos_por_abrir(p_ubicacion_id)` y la vista `fardo_items_detalle` (categoría raíz, marca, cantidad, descripción;
  con precio por línea, d.18). Nacen en la sesión de Órdenes de compra; la maqueta los asume.
- **Abrir y cerrar:** `abrir_fardo` (`en_camino → abierto`) y `recibir_fardo` (`abierto → cerrado`), una transacción: las conocidas entran
  como hoy (`lotes` + `movimientos` de entrada al almacén, `lotes.fardo_id`), las diferencias a `recepcion_diferencias` (solo se agregan filas;
  la suma de causas por línea tiene que calzar con esperado − contado), y las nuevas a una tabla nueva **`prendas_por_crear`** (categoría,
  marca, descripción, color, tallas con cantidad, lote, estado `pendiente | creada | descartada`, quién anotó). **No existe hoy** y es la
  decisión estructural de esta propuesta: sin ella, lo nuevo se olvida (es lo que pasa hoy).
- **Crear desde la cola:** «Nuevo producto» recibe `?por_crear=<id>` y precarga categoría, marca, color, tallas y **el stock contado** (la
  puerta de ADR-0212); al guardar, marca la fila `creada` y liga las variantes al lote. Mientras tanto esas unidades existen físicamente en el
  almacén y no en `stock`: la cola es la única memoria, por eso tiene que verse en tres lugares.
- **Sin aviso:** `recibir_lote` tal como está (proveedor + líneas), más las mismas `prendas_por_crear`.

## Decisiones que son de Felipe

1. **¿Quién crea lo nuevo?** La misma persona que recibe (si tiene Catálogo) o solo la encargada. *Recomiendo:* quien reciba y tenga el
   módulo; la cola avisa a la encargada igual.
2. **¿Puede cerrarse un fardo con prendas sin separar?** *Recomiendo que no:* una contada que no es conocida ni nueva no existe para el stock;
   el candado es el que vale el proceso. (A y B lo exigen; C lo avisa al cerrar.)
3. **¿La sede ve el precio de la línea del fardo?** ADR-0362 d.18 dice que sí y lo corrige al recibir. Las maquetas no lo muestran a propósito:
   es dinero y es tuyo decidir si entra aquí o en la fase que lo construya.
4. **¿Dañadas al recibir?** Hoy «Llegó dañada» es una causa de faltante; ADR-0362 d.23 la manda a cuarentena. La maqueta solo la anota.
5. **¿Se puede recibir sin elegir fardo cuando hay uno en camino?** Sí en las tres («Llegó otra cosa sin aviso»); el aviso de «misma caja dos
   veces» de ADR-0330 se conserva.
6. **El «dijeron» por WhatsApp**: ¿vale la pena pedirlo (un número total) mientras Compras no despacha? *Recomiendo que sí, opcional:* es lo
   único que permite la balanza hoy.

## Verificación

Recorridas en el navegador integrado con clics reales (abrir → contar → separar con la pistola → «Prenda nueva» → cerrar con causa y
responsable → «Recibido»), en claro y en oscuro, en escritorio y a 375 px, sin errores de consola; «▶ Ver cómo se recibe» corre la recepción
completa en las tres. Trampa de esta sesión: `python3 -m http.server` de la configuración `maquetas` no arranca desde este worktree
(`getcwd: Operation not permitted`); se sirvió con un Node estático desde el scratchpad y una entrada temporal en `launch.json`, revertida.
