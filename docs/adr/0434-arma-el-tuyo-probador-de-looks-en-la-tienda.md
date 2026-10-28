# ADR-0434 — «Arma el tuyo»: el probador de looks de la tienda online

- **Fecha:** 2026-10-16 · **Estado:** aceptado (Felipe aprobó el diseño, la lista de actividades y el largo típico salvo vestidos y
  faldas, 2026-10-16). Se construye por actividades en la rama `claude/tienda-arma-el-tuyo`.
- **Relacionados:** ADR-0408 (la tienda online), ADR-0228 (fotos sin fondo y del mismo tamaño), ADR-0279 (fotos por color),
  ADR-0430 (grupo «Tienda web»), ADR-0432 (Cache Components en la tienda). Diseño aprobado: lienzo «Arma tu look — tienda CAYLA»,
  página «Arma el tuyo (versión final)» (https://claude.ai/artifact/UangKKR37pyF9dWbNy6Xd6).

## El problema

Felipe aprobó el diseño de «Arma el tuyo»: el cliente arma su propio look en el celular. Las prendas se apilan sobre una figura a su
tamaño real (arriba, abajo o un vestido, algo encima y un bolso). Cada una se cambia deslizándola o desde una tira de opciones, y se
elige en cualquiera de sus colores. Hay un buscador para algo puntual y un «Sorpréndeme» con candado. Una hoja de tallas lleva todo a la
bolsa; el look se guarda en Favoritos y se comparte como imagen para estados. Hoy la tienda solo tiene «Arma tu look» (`/looks`): los
looks que arma el equipo en el ERP, dibujados como lámina.

Para dibujar una prenda sobre otra a su tamaño real faltan tres cosas, medidas en producción el 2026-10-16:

1. **La prenda recortada, con fondo transparente.** Las 463 fotos de las prendas publicadas son JPG de 1200×1500 sobre blanco
   (ADR-0228). El ERP ya separa la prenda del fondo con MODNet al subir la foto, pero aplana el resultado sobre blanco y no guarda la
   transparencia. La lámina de los looks lo disimula con `mix-blend-mode: multiply`, y eso no sirve para encimar: un blazer
   «multiplicado» sobre un top deja ver el top a través. Las 463 tienen su original guardado en `originales/<id>.jpg`.
2. **El largo de cada prenda.** Ninguna tabla guarda un largo ni una medida (`productos`, `variantes`, `categorias`, `tallas`). Sin el
   largo, una falda maxi sale del tamaño de una mini.
3. **Fotos por color.** De 1.087 colores en las 220 prendas publicadas con varios colores, solo 236 tienen su foto. Felipe decidió
   (2026-10-16): **solo fotos reales, nada pintado**. Un color sin foto se puede elegir igual; la figura muestra otra foto de la prenda y
   la pantalla lo dice. La lista para fotografiar se entregó en Excel ese mismo día.

## Decisión

### 1. El recorte sale del mismo «sin fondo» que ya hace el ERP

- **Ninguna foto se modifica ni se borra.** La foto que muestran hoy la tienda y el ERP (`fotos/<id>.jpg`) y su original
  (`originales/<id>.jpg`) quedan como están. El recorte es un archivo más por foto, que solo usa el probador. Si sale mal se descarta, y
  la foto sigue igual.
- **Cada foto nueva** guarda también su recorte, `recortes/<id>.png`, en el bucket `retail-productos-fotos`, con el mismo `<id>` de la
  foto y su original.
  - Quien sube la foto no hace nada distinto: revisa «Sin fondo / Con fondo» como hoy, y el recorte se sube solo, después de la foto,
    sin hacerla esperar.
  - Solo se guarda si se eligió «Sin fondo». Una foto «Con fondo» queda en la lista como «sin recorte», para reintentar o cambiar.
  - `prepararFotoPrenda` ya tiene la máscara de MODNet: se recorta a la caja de la prenda, se baja a 1000 px de alto como máximo y se
    codifica en PNG. Se usa PNG porque Safari no codifica WebP desde un canvas (ADR-0228). La tienda lo sirve como WebP o AVIF con
    `next/image`, que conserva la transparencia.
- **Las 463 fotos de hoy** se recortan desde su original con el mismo worker, en el navegador de quien aprieta «Preparar recortes» en
  el ERP. Toma unos 15 minutos, una sola vez, y lo hace una persona del equipo con sus permisos de siempre, sin ningún script contra
  producción. Las fotos dudosas (con huecos, o que se subieron «con fondo») quedan marcadas para revisar, y lo que no sirve se descarta.
- **Dónde se anota:** una tabla nueva, `retail.foto_recortes`, con una fila por archivo de foto (`foto` = `fotos/<id>.jpg`). Guarda el
  archivo del recorte, su proporción (ancho/alto) para dibujarlo sin esperar a que cargue, y su estado (`listo` o `descartado`).
  - Se anota por archivo y no por fila de `producto_fotos` porque la fila recién nace al guardar la ficha, y el recorte se hace al subir
    la foto.
  - Así no se toca `catalogo_actualizar_producto`.
  - RLS queda encendido sin políticas. Se escribe por `registrar_recorte` y `descartar_recorte` (security definer; las puede llamar
    quien edita el catálogo o ve Vitrina; firman con `fn_actor_persona_id(true)`) y se lee por funciones.

### 2. El largo: uno típico por categoría y uno propio por prenda

- `retail.vitrina_largos_tipicos (categoria_id, largo_cm)`: el largo con que el probador dibuja la prenda hasta que alguien anote el
  suyo. Nace con estos valores, que se ajustan en el ERP:

  | Zona | Categorías y largo típico (cm) |
  |---|---|
  | Arriba | Tops 45 · Corsets 35 · Polos 60 · Poleras 62 · Camisas y Blusas 65 · Bodys 65 (va metido) |
  | Vestido | Vestidos, Conjuntos y Enterizos: sin típico |
  | Abajo | Shorts 35 · Pantalones 100 · Jeans 100 · Faldas: sin típico |
  | Encima | Chalecos 55 · Casacas 60 · Blazers 70 · Capas 80 |
  | Bolso | Bolsos y Carteras 30 |

- **Vestidos, conjuntos, enterizos y faldas no tienen largo típico (Felipe, 2026-10-16):** su largo cambia demasiado de una prenda a
  otra (una mini y una maxi). Entran al probador recién cuando alguien anota el suyo. Eran 56 de las prendas publicadas el 2026-10-16.
- `vitrina_productos.largo_cm`: el largo propio de la prenda, medido en la sesión de fotos.
- Las dos cosas son datos para mostrar la prenda en la web, como `descripcion_web`: viven en `vitrina_*` y se editan en Tienda web ▸
  Vitrina ▸ Probador. No se agregan a `productos` (eso tocaría Editar producto y su función de guardado).
- La zona de cada categoría sale de los grupos que ya usa la tienda (`apps/tienda/lib/grupos.ts`). El bolso es Bolsos y Carteras.
  Accesorios, bisutería y calzado quedan fuera de esta versión.

### 3. La lista viva en el ERP: Tienda web ▸ Vitrina ▸ Probador

Es una pestaña más de Vitrina (módulo `vitrina_web`), no un módulo nuevo (ADR-0306). Reemplaza al Excel, porque se actualiza sola.
Muestra cuántas prendas están listas para el probador y, por prenda, de lo que más se vende a lo que menos:

- qué fotos no tienen recorte;
- qué colores no tienen foto propia;
- qué largo usa.

Tiene «Preparar recortes» y la hoja de cada prenda, con su largo y sus recortes.

### 4. La tienda

- **Datos:** `retail.tienda_probador(p_sede)` devuelve, por prenda publicada, su largo (el propio o el típico) y sus recortes listos, cada
  uno con su color (o «todos los colores») y su proporción; y, por color, su precio y su stock en esa tienda (ver la actualización de
  abajo). Es igual para todos los que miran la misma tienda: se guarda como el catálogo (`lecturaCompartida`). El nombre, la categoría,
  los colores y si la prenda se ve salen del catálogo que ya existe. Una prenda sin largo o sin ningún recorte no entra al probador.
- **El probador:** `/looks/arma`, con cuenta como todo el catálogo. La figura apila cada prenda a escala (2,5 px por cm en el celular)
  desde su línea:
  - arriba, el vestido y lo de encima, desde los hombros;
  - abajo, desde la cintura;
  - el bolso, a un costado.

  Capas: el body va metido. Un vestido ocupa arriba y abajo y, al sacarlo, vuelven las que había.
- **Un color sin foto propia** se elige igual. La figura muestra la foto de «todos los colores» o la de otro color y lo dice: «Aún no hay
  foto en negro: ves la del rosa pálido» si la foto que se ve es de otro color, o «ves otra foto de esta prenda» si es una foto sin color
  marcado. Nunca nombra un color que el sistema no sabe.
- **«Sorpréndeme»** cambia lo que no tiene candado y prefiere colores que combinan con lo fijo (`colores.combina_con`, ya cargado en
  93 de 104 colores).
- **Tallas y bolsa:** la misma hoja de tallas de los looks (`AgregarLook`) y la misma acción (`agregarLookALaBolsa`, hasta 4 prendas,
  justo lo que cabe en un look: arriba, abajo, encima y bolso).
- **Guardar:** `retail.looks_web` + `look_web_piezas` (de 2 a 4 piezas, hasta 30 looks por cuenta, quitar sin borrar, como
  `favoritos_web`). Aparecen en Favoritos y se abren como los looks de CAYLA. Cerrar o eliminar la cuenta los alcanza igual que a los
  favoritos.
- **Compartir:** un enlace público, `/tu-look?p=<código de prenda>.<código de color>~…`, muestra el look sin precios e invita a crear
  la cuenta, como la portada. Su vista previa en WhatsApp y la imagen para estados (1080×1920) se arman con `next/og`, sin precios, con la marca y
  tienda.cayla.pe.
- **Entradas:** el menú, la página «Arma tu look» y la ficha («Arma un look con esta prenda»). Se publican al final, cuando Felipe diga.
  Hasta entonces el probador existe pero nadie llega a él sin el enlace.

## Las actividades (aprobadas por Felipe, en este orden)

1. Preparar recortes en el ERP: `foto_recortes` y la pestaña Tienda web ▸ Vitrina ▸ Probador con «Preparar recortes».
2. Cada foto nueva sale con su recorte: Editar producto, Nuevo producto y la cola sin conexión.
3. Largos y la lista viva: largo típico y propio, y lo que le falta a cada prenda, de lo que más se vende a lo que menos.
4. El probador en el celular (`/looks/arma`).
5. Buscar una prenda y ver todas las de una zona, con filtros.
6. Tallas y a la bolsa.
7. El probador en la computadora.
8. Guardar el look en Favoritos.
9. Compartir: enlace sin cuenta y sin precios, vista previa e imagen para estados.
10. Las entradas (menú, «Arma tu look» y la ficha), cuando Felipe diga.

PR 1 = actividades 1 a 3 (ERP); PR 2 = 4 a 7 (tienda, probador escondido); PR 3 = 8 a 10 (lanzamiento).

## Lo que se descartó

- **Pintar o teñir la foto de otro color:** Felipe lo descartó (2026-10-16), porque el cliente compraría lo que no es.
- **Una imagen generada con IA de una modelo con el look:** cuesta por imagen, tarda segundos y puede cambiar la prenda.
- **Recortar en el servidor separando el blanco del JPG** (lo que se usó en el lienzo). Una prenda blanca o crema sobre fondo blanco
  se come por los bordes, y en CAYLA hay muchas (Blanco, Crudo, Crema, Vainilla, Perla). MODNet sobre el original no tiene ese
  problema y es la misma prenda que muestra la ficha.
- **Recortar en la tienda al pedir la imagen:** cada publicación de Vercel lo recalcularía, y la tienda no puede escribir en el almacén.
- **El largo en `productos`:** obligaba a tocar Editar producto y `catalogo_actualizar_producto`, que comparten varias sesiones. El
  largo es un dato para la web.
- **Los looks guardados en un `jsonb`:** sin llave foránea, una prenda eliminada quedaría colgando. Se usa una tabla hija, como
  `vitrina_look_piezas`.

## Qué puede fallar (principio 9)

- **El navegador no carga MODNet** (sin red al CDN, un aparato viejo). La foto se sube igual, sin recorte, y queda en la lista para
  «Preparar recortes».
- **Una prenda pierde su recorte o su largo.** Sale del probador, no se dibuja mal.
- **La base no responde.** `tienda_probador` devuelve `null` y la página dice que el probador no está disponible por ahora, sin caerse.
- **Un color se queda sin stock** mientras el look está armado. La hoja de tallas lo dice y la bolsa solo agrega lo que hay, como en los
  looks de CAYLA.

## Pasos en producción (cada uno con el OK de Felipe)

1. Pegar las migraciones, cada una cuando su actividad esté probada en local: recortes, largos y lista viva, datos del probador, looks
   guardados.
2. Una persona del equipo aprieta «Preparar recortes» en el ERP de producción y revisa las dudosas.
3. Felipe fusiona cada PR. La tienda se publica al fusionar; las entradas, solo en el último.

## Actualización 2026-10-16 (actividad 4): el precio y el stock de cada color vienen con el probador

Al construir la actividad 4 se vio que el catálogo trae el precio y el stock del MODELO (todas sus tallas y colores juntos), y el probador
pone cada prenda en UN color. Con el precio del modelo, una campaña solo en el negro haría que la falda beige dijera el precio del negro
y que la bolsa cobrara el del beige: el mismo error que ya se corrigió en los looks de CAYLA (`20261015032000`). Por eso
`retail.tienda_probador` recibe la tienda (`p_sede`) y trae, por cada color que se ofrece ahí, lo que vale (`fn_tienda_precios` por
color, la regla única del precio, la misma de la ficha, los looks y la bolsa) y su nivel en cada tienda de la web (`fn_tienda_disponible`
con `fn_tienda_nivel`: nunca la cifra de 4 o más), y `combina` (los colores con que se lleva cada color, para «Sorpréndeme»).

- **Una sola fuente, igual:** el precio y el stock salen de las MISMAS piezas de la ficha y la bolsa; la prueba
  (`pnpm pruebas:tienda-probador`) cruza el precio de cada color con el del look de CAYLA de la misma prenda en la misma tienda.
- **Descartado:** preguntar la ficha (`tienda_ficha`) de cada prenda que el cliente se pone (un viaje a la base por toque, desde el
  celular); y armar el catálogo entero por dentro, como `tienda_looks` (1,6 s de media en producción): la tienda junta en la página el
  catálogo que ya guarda con lo del probador, y lo que una de las dos no trae no entra.
- **El look vive en la dirección** (`/looks/arma?p=<código de prenda>.<código de color>~…`, el mismo formato de compartir): recargar, cambiar de tienda o
  mandar el enlace deja el mismo look. Lo que ya no está (se agotó, o en esa tienda no hay) se salta y, si faltó lo de arriba o lo de
  abajo, se completa con lo primero que hay.


## Actualización 2026-10-16 (actividad 8): guardar el look en Favoritos

El corazón del probador guarda el look que se está armando: sus prendas y sus colores, nunca las tallas ni el precio. Cada vez que se
abre, el precio y lo que queda se leen al día. Así un look guardado en una campaña no promete el precio de la campaña cuando ya terminó.

- **La base decide qué se guarda** (`20261017044000`, `retail.tienda_guardar_look`):
  - de 2 a 4 prendas, sin repetir modelo, cada una visible en la web y en un color que tiene activo;
  - una vez por look: la huella son las prendas y sus colores ordenados, y un índice único sobre los vivos lo hace cumplir. Guardar el
    mismo look en otro orden devuelve el que ya estaba;
  - hasta 30 vivos por cuenta, con la fila de la cuenta bloqueada para que dos pestañas no pasen el tope a la vez.
- **El nombre por omisión es el día de Lima** («Look de viernes»). Se cambia en la página del look, de 1 a 40 letras.
- **Quitar no borra:** marca `quitado_en`, como `favoritos_web`. Cerrar o eliminar la cuenta quita sus looks vivos en el mismo
  disparador que ya quitaba sus favoritos (`fn_cuentas_web_cerrar_al_anonimizar`, con un reemplazo anclado).
- **Se abre como los looks de CAYLA** (`/looks/guardado/[id]`, lienzo v3, pantalla 8):
  - la figura quieta con el número de cada prenda y «Armado por ti»;
  - cada prenda con su color, cuánto queda y su precio en la tienda elegida;
  - el total, «Agregar el look a mi bolsa» (la misma hoja de tallas) y «Editar en el probador».
- **Las prendas que ya no están se dicen aparte** («Una prenda que guardaste ya no está: el look sigue con las demás»). Una prenda está
  en ese caso si dejó de verse en la web o ya no se puede probar. Si no queda ninguna, la página lo dice y ofrece quitar el look.
- **Es solo de su cuenta:** `tienda_mis_looks` devuelve únicamente los looks de quien pregunta. Otra persona con el enlace ve «Este look
  ya no está». El enlace para compartir, sin cuenta y sin precios, es la actividad 9.
- **En Favoritos**, «Tus looks» va arriba de las prendas guardadas: en el celular, un carril que se desliza; en la computadora, de a
  cuatro. Solo se muestra con la lista entera: con una categoría elegida se buscan prendas.
- **Descartado:**
  - Guardar la talla. La talla se elige al llevar el look a la bolsa, y lo que hay cambia todos los días.
  - Guardar el precio. Mentiría al terminar una campaña.
  - Guardar el look en el navegador, sin cuenta. Se pierde al cambiar de celular, y el Club empieza con la cuenta.

## Actualización 2026-10-16 (actividad 9): compartir el look

Desde el look guardado, «Compartir» abre una hoja con la imagen para estados (lienzo v3, pantalla 9) y tres caminos: la hoja de
compartir del celular (la imagen y el enlace), «Descargar la imagen» y «Copiar el enlace». El enlace es `/tu-look?p=…`. Esa página es
pública, como la portada: muestra la figura y cada prenda con su color, sin precio ni cuánto hay. Sin cuenta, invita a crearla («Crea
tu cuenta y arma el tuyo») y al terminar abre el probador con ese look. Con cuenta, «Pruébatelo en el probador».

- **Ninguna imagen pública lleva un texto que venga en la dirección.** Si la vista previa dijera el nombre que trae el enlace, cualquiera
  podría armar una imagen con la marca de CAYLA y su propio texto. Por eso:
  - la vista previa de WhatsApp (`/tu-look/vista`, 1200×630) dice «Mira este look» y los nombres de las prendas, que salen de la base;
  - la imagen para estados lleva el nombre del look, y la arma `/looks/guardado/[id]/historia` solo para la cuenta dueña. Nunca se
    guarda en la red.
- **Un look, una imagen guardada:** una dirección escrita de otra forma (minúsculas, prendas de más) va con un 308 a la del mismo look
  como la escribe el probador. La red guarda la vista previa un día.
- **Las letras de la marca:** `next/og` no lee el WOFF2 que guarda `next/font`. Pide EB Garamond y DM Sans en TTF a Google Fonts, las
  mismas que ya usa la tienda, una vez por servidor. Si Google no contesta en 3 s, la imagen sale con la letra de `next/og` (Geist), sin
  caerse. Una foto que no llega deja su tarjeta con el estudio vacío.
- **El acomodo de las polaroids** sigue el lienzo con un cambio: cada tarjeta tapa solo el borde de papel de la de arriba, no 34 px. En
  el lienzo tapaba el nombre de la prenda de arriba.
- **«Compartir» pide la imagen al abrir la hoja,** no al tocar el botón: el celular solo deja compartir desde el toque de la persona, y
  esperar a la red lo rompía.
- **Descartado:**
  - Dibujar la imagen en el navegador (`canvas`): la vista previa de WhatsApp igual necesita el servidor, y serían dos dibujos del mismo
    look.
  - Guardar las letras en el repositorio: hay que bajarlas, y la tienda ya depende de Google Fonts por `next/font`.

## Actualización 2026-10-17 (actividad 10): las entradas

Felipe pidió construirlas en el PR 3, junto con guardar y compartir (2026-10-17): el probador queda a la vista el día que se fusione ese
PR. Son tres:

- **La cabecera:** «Arma el tuyo» justo después de «Arma tu look», en la computadora y en el menú del celular. Está marcado cuando se
  está en el probador (`actual="probador"`). Antes, el probador marcaba «Arma tu look».
  - Sale solo si el probador tiene algo que probar con lo que se ve en esa tienda (Felipe 2026-10-17). Así, fusionar antes de «Preparar
    recortes» no lleva a nadie a un probador vacío; la entrada aparece sola cuando hay prendas listas.
  - Lo decide `hayParaProbar`, la misma regla que arma el probador, sobre la lectura guardada de «Todas». Si la base no responde, la
    entrada no sale.
- **«Arma tu look»:** arriba de los looks de CAYLA, una tarjeta en el oscuro de la campaña con el probador quieto (lo primero que hay en
  la tienda elegida, con prendas de verdad) y «Abrir el probador». Si el probador de esa tienda no tiene nada, no se dibuja.
- **La ficha:** «Arma un look con esta prenda» bajo el botón de la bolsa. Abre el probador con esa prenda en el color elegido, y lo
  demás se completa con lo primero que hay. Solo sale si el probador de esa tienda la tiene: la decisión usa las mismas reglas que lo
  arman (`armarProbador`: con su recorte, con su largo y con algo en esa tienda). Así el botón nunca abre un probador sin ella.

## Actualización 2026-10-17 (/formidable de Vitrina ▸ Probador)

La primera pasada de `/formidable` por la pantalla del ERP (`docs/formidable/tienda-web-vitrina-probador.md`) encontró que la lista
pedía largo y recorte a prendas que el probador nunca muestra: 36 de las 48 prendas «sin largo» de producción eran accesorios
(aretes, cinturones, maquillaje…). La regla de qué entra vivía solo en la tienda (`zonaDe`). Felipe aprobó los tres cambios:

- **Una sola regla de zonas para las dos apps.** La tabla de grupos de categorías de la tienda y la zona de cada una en el probador
  pasan a `packages/shared/src/categorias-de-la-tienda.ts` (`GRUPOS_DE_LA_TIENDA`, `zonaDelProbador`). La tienda la usa como antes
  (`lib/grupos.ts`, `zonaDe`), y el ERP deja en Vitrina ▸ Probador solo las prendas, los típicos y las fotos de lo que entra
  (`soloLoQueEntra`). Sin migración: las funciones de la base siguen devolviendo todo y cada pantalla aplica la misma regla.
- **Una palabra por prenda.** La columna «En el probador» dice «Lista» o lo primero que le falta, en el orden en que se arregla
  (`veredictoDelProbador`): su foto, revisar su recorte, recortarla, un recorte descartado o el largo.
- **El paso que toca, arriba.** La cabecera lleva un solo botón: «Preparar N recortes», después «Revisar N recortes», después «Anotar N
  largos» (`siguientePaso`).

Felipe también decidió (2026-10-17) **quitar** los largos típicos que se guardaron ese día en producción para Vestidos (110), Faldas (55)
y Enterizos (140), que eran los números de ejemplo de esas cajas: la decisión del 2026-10-16 sigue en pie. Las cajas vacías de «Largos
típicos» dicen ahora «Sin típico», no un «Ej.» que invite a llenarlas. Los quita él en el ERP de producción.

### Después de /chaos (2026-10-17)

`/chaos` de la misma pantalla (semilla 1017, `docs/chaos/README.md`) encontró que el «Deshacer» del aviso de un descarte, que volvía a
anotar el recorte con `registrar_recorte`, le pisaba la decisión a quien lo hubiera usado en esos 7 segundos, y no quedaba en la Actividad.
La migración `20261017183000` trae `deshacer_descarte_recorte(p_foto, p_estado)`: devuelve el recorte a como estaba solo si sigue
descartado (si no, `recorte_ya_cambio`) y lo anota. Además, `registrar_recorte` exige que el archivo sea el de esa foto
(`recortes/<foto>.png` o `recortes/<foto>-<sello>.png`) y que una foto con recorte la cambie quien ve la Vitrina web; el mismo archivo otra
vez es un reintento. Pegada en producción el 2026-10-17 con el OK de Felipe, antes de fusionar el PR #1164.



## Actualización 2026-10-17 (ADR-0442): el recorte sale del PNG de la IA

El recorte ya no se calcula con MODNet sobre `originales/<id>.jpg`: es la transparencia de la propia foto, que la IA del equipo entrega como PNG sin fondo,
limpiada y cortada a la prenda. Una foto sin fondo transparente (un JPG) queda «sin recorte». El resto de este ADR no cambia (la tabla `foto_recortes`, el largo, el
probador). Ver ADR-0442.


## Actualización 2026-10-17 (ADR-0449): la unión de arriba con abajo

La prenda de abajo ya no se dibuja por su largo en cm: su pretina se une al borde de abajo de la de arriba (±15 % de una cintura estándar) y su largo sale de la forma de la foto. Las
medidas salen del recorte, en el navegador. Ver ADR-0449.
