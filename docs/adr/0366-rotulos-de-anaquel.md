# ADR-0366 — Rótulos de anaquel en la Brother

- **Fecha:** 2026-10-09
- **Estado:** aceptada (Felipe: «quiero que el sistema, aparte de etiquetas, me genere con la Brother rótulos para poner por
  fuera a las prendas o a los anaqueles, para ubicar dónde está cada cosa»; foto del anaquel con «CHALECO VALERIA MIA» a plumón)

## Contexto

En el almacén cada anaquel o pila de bolsas se marca con un papel escrito a mano. Se borronea, no siempre está y cada
quien lo escribe distinto. La Brother QL-1110NWB y su rollo DK-22205 de 62 mm continuo ya imprimen las etiquetas de precio
(ADR-0180, y en Mac, el ayudante de ADR-0304). Nada en el sistema sabe en qué anaquel está un modelo: dentro de una sede solo
existen «Piso de venta», «Almacén de tienda» y «Cuarentena» (`sububicaciones`).

## Decisión (Felipe eligió entre tres alcances, 2026-10-09)

1. **Solo imprimir.** El rótulo sale del catálogo y no se guarda nada: ni anaqueles, ni posiciones, ni stock por anaquel.
   Hacer de los anaqueles un lugar del sistema cambia el modelo de stock (principio 1) y queda para cuando el rótulo
   impreso esté probado en el almacén.
2. **62 × 100 mm, en el mismo rollo.** El rótulo se diseña acostado (100 × 62, se lee a lo largo de la tira) y viaja en
   una hoja de 62 × 100 —el ancho del rollo por el largo del corte— girado adentro, igual que la forma A de la etiqueta.
   El nombre va en el tamaño más grande que entra (13 mm para una palabra corta, se lee a 2–3 m). En Windows sirve el papel
   «62 mm» de la Brother tal cual, que ya corta cada 100 mm.
3. **Qué dice:** la categoría arriba («CHALECOS»), el nombre del modelo sin repetir la categoría («VALERIA»), sus colores y
   tallas ACTIVOS (los del modelo, no los del stock de la sede: el anaquel guarda el modelo, y una talla que hoy no hay va al
   mismo lugar cuando llegue) y los códigos al pie. Uno por modelo, o **todos en un rótulo** (hasta 4, como el «CHALECO
   VALERIA MIA» de la foto); con categorías distintas, sin título.
4. **Sin QR.** El escáner y Buscar leen el código de una talla, no el de un modelo: un QR que no lleva a nada enseña a
   escanear algo que no sirve.
5. **Desde tres lugares:** la barra de lo marcado en Catálogo ▸ Productos y en Existencias («Rótulo») y un acceso
   «Rótulos» en Inicio de Almacén (sin modelos: se buscan en la misma pantalla). La ruta `/rotulos` no es un módulo
   (ADR-0306): es la salida de pantallas que ya tienen el suyo, como `/etiquetas-de-precio`.
6. **Un solo camino a la Brother.** La lógica de imprimir (diálogo en Windows, ayudante en Mac) sale de
   `ImprimirEtiquetasPrecio` a `components/impresion/useImpresionBrother.tsx`, y la usan las dos pantallas.
7. **El ayudante de Mac pasa a la versión 2:** `POST /imprimir?medida=62x100mm`, con una lista cerrada de medidas en
   `servidor.sh` (nunca llega a `lp` un texto de la petición). La pantalla de rótulos pide la versión 2; con la 1 avisa
   «es de una versión anterior» y ofrece la misma línea de Terminal para reinstalarlo. Las etiquetas de precio siguen
   funcionando con la 1.

## Consecuencias

- Sin migración, sin RPC: `getRotulos` solo lee `productos`, `categorias`, `variantes`, `tallas` y `colores`.
- Inicio de Almacén pasa a siete accesos; Escanear, solo en la última fila, ocupa la fila entera.
- Las Mac con el ayudante ya instalado tienen que reinstalarlo una vez para imprimir rótulos (la pantalla lo dice).

## Actualización 2026-10-09 (tarde) — Formidable

`/formidable` (informe en `docs/formidable/rotulos.md`) pidió tres cambios y Felipe los aprobó:
1. **El rótulo primero:** desde 1024 px, dos columnas (a la izquierda qué prendas y cómo salen; a la derecha los rótulos, pegados arriba); en
   angosto, la vista previa se achica para caber (`VistaQueCabe`, `zoom` medido con `ResizeObserver`). La hoja de impresión no cambia.
2. **El buscador sin la «Prenda sin registrar»** (`ID_PRODUCTO_CARGO_ESPECIAL`) ni productos `es_prueba`, como las demás lecturas.
3. **El aviso del ayudante de Mac en una línea** («Puedes imprimir igual…» + «Ver cómo»): `avisoDelAyudante` suma `resumen`, y
   `AvisoAyudanteMac` esconde el detalle técnico bajo un toque. **Cambia también en Etiquetas de precio**, que comparte el aviso.

## Actualización 2026-10-09 (noche) — el papel de la etiqueta, y solo nombre, colores y tallas

Felipe imprimió los primeros en la tienda (foto) y pidió tres cosas: **que no haya que cambiar el papel** (la Brother queda
configurada con el de la etiqueta y pasar a 62 × 100 era un paso de más; uno salió encogido y cortado por eso), **que sea más chico**,
y **que lleve solo el nombre, los colores y las tallas, lo más grande posible**, sin logo ni categoría. Además «CAMISA CROP CON
AMARRES» se cortaba a la derecha: el nombre no podía partirse en líneas.

1. **Papel: 62 × 40,1 mm, el de la etiqueta de precio, acostado.** El rótulo mide 62 de ancho por 40,1 de alto y va DERECHO en la
   hoja de la forma A (62 × 40,1); en la forma B (40,1 × 62) va girado 90°. Usa la misma forma que esa computadora eligió en
   Etiquetas de precio (`cayla.etiquetas.modo`). En la Mac va por el ayudante con su papel de siempre: no necesita la versión 2 ni
   `?medida=` (el ayudante la sigue aceptando, sin uso). Se quitaron `VERSION_CON_MEDIDA`, `MEDIDA_ROTULO` y el estado «desactualizado».
2. **Solo nombre, colores (hasta 2 líneas) y tallas.** Sin logo, categoría, códigos, «CAYLA» ni las palabras «Colores» / «Tallas».
   Como ya no sale la categoría, el nombre va completo («BODY BONITA»): se quitó `nombreSinCategoria`.
3. **El nombre, lo más grande que entra:** `medidaNombre` prueba 1, 2 y 3 líneas con el corte más parejo y se queda con el tamaño
   mayor que cabe en 57 × 19,5 mm (tope 14 mm). Mide el texto con el ancho REAL de cada letra de DM Sans 800 (medido en el navegador),
   no con un promedio. La hoja usa ese tamaño, y un solo texto con espacio duro antes del «·», para que el navegador corte igual.
   Ejemplos: «Mia» 14 mm · «Body Bonita» 9,1 mm en 2 líneas · «Camisa crop con amarres» 7,6 mm en 2 · cuatro modelos juntos 6,3 mm.

Verificado: pruebas de `medidaNombre` (nunca se sale a lo ancho ni a lo alto, más largo nunca más grande, tope); en el navegador, siete
nombres reales y largos con el tamaño calculado: ninguno se desborda y las líneas coinciden; PDF de impresión en forma A (62,1 × 40,2 mm)
y B (40,2 × 62,1 mm). **Falta:** imprimir en la Brother de la tienda y, en una computadora con la forma B, ver que sale derecho.

## Actualización 2026-10-09 (noche, b) — marca y proveedor en vez de los colores

Felipe: «en vez de los colores, que salga escrito el proveedor y la marca para identificarlo mejor». Donde iban los colores (2 líneas)
van ahora **«MARCA …»** y **«PROVEEDOR …»**, una línea cada uno, con su palabra delante (los dos son nombres de empresa y sin ella no
se sabría cuál es cuál). El proveedor es el habitual del modelo (`productos.proveedor_id`), no el de cada lote. Con varios modelos
juntos, los distintos se separan con «/»; si un modelo no tiene marca o proveedor, esa línea no sale. Si no cabe, «…» al final: el
nombre no pierde tamaño (usa las mismas 2 líneas que tenían los colores).

## Actualización 2026-10-09 (noche, c) — solo la marca, y el rótulo desde la vista rápida

Felipe: «que solo salga la marca, el proveedor no ("Marca: Mias")» y «que se pueda imprimir el rótulo desde el modal del producto».
1. La línea dice **«Marca: Mias»** (con varias marcas juntas, «Marca: Mias / Zara»); sin marca, no sale. El proveedor ya no se lee ni se
   imprime. La línea que se liberó vuelve al nombre: `ALTO_NOMBRE_MM` pasa de 19,5 a 23,5 mm («Body Bonita» sube de 9,1 a 11 mm).
2. La **vista rápida del producto** (Catálogo ▸ Productos) lleva «Rótulo» junto a «Etiquetas»: abre los rótulos con ese modelo, y
   «Volver» regresa a Productos. Es del modelo, no de las tallas elegidas, y no depende del stock.

## Actualización 2026-10-12 — la pantalla es la Brother (maqueta A «Rollo») y «Quitar todas»

Felipe pidió tres maquetas «sofisticadas, elegantes y con full animaciones» (`docs/maquetas/rotulos-2026-10/`: A Rollo, B Anaquel,
C Molde), eligió la **A** y pidió además **una opción para borrar todas las prendas**. Qué cambió:

1. **La vista previa es la Brother y su tira** (`components/rotulos/TiraBrother.tsx`, `app/estilos/rotulos-brother.css`): los
   rótulos salen uno bajo otro, como del rollo, con el corte punteado entre ellos y las copias al costado (− n +, el mismo paso que
   Etiquetas de precio); en angosto (< 560 px de columna) las copias bajan bajo cada rótulo. Al pie, cuántos salen y cuánto papel
   usan (`papelDeTiraCm`: 40,1 mm por rótulo). Sin prendas, la Brother asoma un rótulo de ejemplo en gris («Así sale un rótulo») en
   lugar del `<Vacio>` con el poste: la escena es el vacío.
2. **Las prendas viven en el navegador.** Antes cada prenda sumada o quitada era una navegación: el loader tapaba la pantalla y la
   pantalla se rearmaba entera (`key` por la lista de modelos), borrando las copias. Ahora `getRotulos` trae, junto al catálogo, la
   marca y las tallas activas de cada modelo (medido en producción el 2026-10-12: 195 modelos y 1.266 variantes, unos 75 KB), y
   `ImprimirRotulos` suma y quita sin ir al servidor; la URL (`?productos=`) se reescribe con `history.replaceState` para que
   recargar no pierda nada. Las copias son de cada rótulo y sobreviven a sumar otra prenda.
   - DECIDÍ: el catálogo con marca y tallas, y la lista en el navegador.
   - DESCARTÉ: seguir navegando por servidor en cada prenda (loader a pantalla completa y medio segundo o más por prenda: ninguna
     animación posible) y pedir la marca y las tallas al sumar (una consulta por prenda; la tira esperaría a la red).
   - SE ROMPE SI: el catálogo pasa de unas 10.000 variantes (~600 KB): ahí conviene traer las tallas solo al sumar.
3. **«Quitar todas»** (`btn-peligro`, la pieza de «quitar» de ADR-0358) junto al conteo de prendas, desde 2 prendas. No pregunta —es
   una lista para imprimir, no toca la base— y se perdona con **«Deshacer»** en el aviso (7 s), como el tacho de Etiquetas de precio;
   la × de una prenda también avisa con «Deshacer». Lo deshecho vuelve a su lugar sin perder lo sumado mientras tanto.
4. **Cabecera de Productos y Existencias** (`EncabezadoPagina`, con la flecha de volver junto a la sede, ADR-0358); antes era
   `CabeceraPantalla` con la flecha en una fila aparte. «Modelo» pasa a «prenda» en los textos (lista aparte de `/formidable`).
5. **Movimiento (ADR-0136), sin excepción nueva:** sin rebote ni bucle y quieto con `prefers-reduced-motion`. Al entrar la impresora
   baja, se enciende su luz (fija, no respira: el bucle de la maqueta no se construyó) y la tira se imprime rótulo por rótulo; sumar
   alarga la tira, quitar la saca hacia la derecha y la cierra. Al imprimir, la luz pasa a ámbar y el cabezal (una línea roja,
   señal y no adorno) recorre cada rótulo **antes** de mandar la hoja (≈1 s, `recorridoDeImpresion`): después no se vería, porque
   en Windows el diálogo de Chrome detiene la pantalla y en la Mac la tapa el loader mientras responde el ayudante.

Verificado: `lib/rotulos-reglas.test.ts` (28, suma papel, recorrido y la tira con los que salen); en local con Chrome sin ventana,
sobre una página de andamio con un catálogo inventado (la base local no trae prendas), sumar con Enter, copias, «Quitar todas» →
«Deshacer» (vuelven con sus copias), juntar y separar, imprimir (el diálogo se abre una vez tras el recorrido), claro, oscuro, 375 px
sin desborde y movimiento reducido; `tema:auditar` sobre `/rotulos`: 0 hallazgos solo en oscuro. **Falta:** `/formidable` sobre la
pantalla nueva y la prueba en papel en la Brother del almacén.

## Verificación

- `lib/rotulos-reglas.test.ts` (13), `lib/mac-etiquetas.test.ts` (versión y medida), `scripts/mac-etiquetas/servidor.prueba.mjs`
  con Chrome real: 2 rótulos con `?medida=62x100mm` → PDF de 62,1 × 99,8 mm y `-o media=Custom.62x100mm`; medida fuera de la
  lista → 400.
- En el navegador local: buscador, uno por modelo / todos juntos, vista previa a tamaño real; la hoja de impresión pasada a
  PDF con Chrome sale en páginas de 62 × 100 mm con el rótulo girado.
- **Falta:** imprimir uno de verdad en la Brother de la tienda (Windows y Mac) y pegarlo en el anaquel.

## Lo que quedó fuera

- Anaqueles como lugar del sistema (código A-01, «está en A-03» en Buscar): decisión de Felipe para después.
- Un texto libre en el rótulo («Anaquel 3»): sin esa línea, el rótulo dice qué hay, no dónde está.
