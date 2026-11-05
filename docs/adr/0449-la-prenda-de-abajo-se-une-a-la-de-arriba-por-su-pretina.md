# ADR-0449 — En el probador, la prenda de abajo se une a la de arriba por su pretina

**Fecha:** 2026-10-17
**Estado:** Construido en la rama. `tsc` de la tienda, `eslint`, `pnpm knip` y las 565 pruebas de la tienda en verde. **Mirado en el navegador local** con la figura real y
prendas de producción (polo con ojal, camisa beige, blusa bordada, blusa negra crop, falda y pantalón de pierna ancha). **Falta:** verlo con una cuenta real en
`/looks/arma`, en un celular de verdad (Safari) y la figura quieta (ver «Pendiente»).
**Afecta:** `apps/tienda/lib/union-prendas.ts` y su prueba (nuevos, puros), `apps/tienda/components/probador/useUnionDeLaFigura.ts` (nuevo) y `Figura.tsx`. **No toca la
base**: sin migración, sin columna nueva, sin RPC.
**Relacionado:** ADR-0434 (el probador), ADR-0444 (máximo 3 prendas), ADR-0442 (el recorte sale del PNG de la IA).

## Contexto

Felipe (2026-10-17), mirando el probador: «la unión con el pantalón debe coincidir». Con un polo con ojal y la «Falda Jean», la pretina de la falda asomaba más ancha que el borde
del polo (244 px contra 155 px en la escena). La causa: cada prenda se dibujaba por su **largo en cm** (el propio o el típico de su categoría) y su ancho salía de la proporción de
su recorte. La falda no tiene largo propio y usaba el típico de 55 cm, cuando una mini mide unos 40: salía más grande que la realidad, con la pretina ancha.

## Decidí

1. **La prenda de abajo se dibuja por su PRETINA, no por su largo.** `cajaDeAbajoUnida` iguala la pretina de la falda, el short o el pantalón al ancho del borde de abajo del torso de la
   prenda de arriba; su largo sale de la forma de la foto, entre 20 y 120 cm. Una mini y una maxi salen bien sin anotarles nada.
2. **Con un margen de ±15 % de una cintura estándar (36 cm plana).** Una falda no cambia de tamaño porque se cambie de blusa: con una blusa ajustada la unión coincide, y una oversize
   o un crop simplemente cuelga por encima de la pretina, como en una persona.
3. **Las dos medidas salen de la propia imagen del recorte, en el navegador del cliente** (`useUnionDeLaFigura`): el almacén deja leer los píxeles de un recorte (CORS abierto), se baja
   a 240 px y se miden dos fracciones por prenda. Funciona ya con los 338 recortes que existen, sin columna nueva y sin volver a procesar nada. Se guardan en memoria por URL mientras
   dura la pestaña.
4. **Se mide con el tramo de prenda más ancho de cada fila**, así dos mangas sueltas a los lados no se suman al torso; el borde de abajo es donde termina ese torso.
5. **Mientras llegan las medidas, o si no se pueden leer, la prenda se dibuja como siempre** (por su largo) y, al llegar, cambia de tamaño con la transición que ya tiene la figura
   (principio 9: sin la medida, no se rompe nada). Un body metido (`metida`) no se ajusta.

## Medido con prendas reales de producción (`medirRecorte` y `cajaDeAbajoUnida` sobre los PNG reales, con la prenda de arriba a 62 cm)

| La falda con… | Borde de la blusa | Pretina | Largo de la falda |
|---|---|---|---|
| Polo con ojal | 80 px | 80 px | 36 cm |
| Camisa beige | 88 px | 88 px | 40 cm |
| Blusa bordada | 63 px | 76 px (acotada) | 34 cm |
| Blusa negra crop | 121 px | 103 px (acotada) | 47 cm |

Sin el margen (la pretina copiando el borde exacto), la misma falda salía de **28 a 54 cm** según la blusa elegida: una falda no cambia de largo al cambiar de blusa, y por eso se acotó.
El pantalón de pierna ancha da de 84 a 114 cm. En el navegador, el polo con ojal y la falda quedan con la unión coincidente.

## Descarté

- **Igualar la cintura de todas las prendas de arriba.** Mostrado con cuatro blusas reales: el polo ajustado salía altísimo, el crop diminuto y se perdía ver qué es oversize.
- **Que la pretina copie el borde exacto, sin margen.** El largo de la falda cambiaba de blusa en blusa (28 a 54 cm).
- **Guardar las medidas en la base** (una columna en `foto_recortes` y un cambio en `registrar_recorte`). Es esquema en producción y obliga a volver a medir los 338 recortes; medir en el
  navegador no necesita nada de eso. Si algún día pesa en el celular, se guarda.
- **Poner un largo por defecto a cada categoría.** Una falda midi o maxi saldría como mini.

## Pendiente y riesgos

- **La figura quieta** (Favoritos, la página de un look guardado, el enlace compartido) se dibuja en el servidor y sigue por largo: allí la unión todavía no coincide. Hacerla pide un
  componente de cliente o guardar las medidas.
- **Prendas de arriba que se llevan metidas o con volado:** un body queda sin ajustar; una blusa con peplum tiene el borde más ancho que la cintura y su falda sale al tope del margen.
  Con las mangas pegadas al torso el «tramo más ancho» las incluye y el borde sale ancho: el margen lo acota. Hace falta probarlo con más prendas.
- **Recortes viejos con gancho** (la camisa beige de producción lo tiene) se miden igual: el gancho no es un torso, pero no se limpian aquí.
- **El largo sigue siendo la puerta de entrada**: una prenda sin largo no entra al probador («Falta el largo»), aunque para las de abajo su valor ya no se use. Quitar esa exigencia es un
  cambio de la base y lo decide Felipe.
- **No probado** en Safari ni en un celular real; sí en el navegador de escritorio.

## Actualización 2026-10-18: la unión se siente inmediata y avisa cuando espera

Felipe pidió que la prenda de abajo no se moviera «tarde» al adaptarse, y que el cliente supiera que se estaba ajustando. Causa: la medida bajaba el PNG entero de cada recorte, por aparte de la copia que ya
se ve, y recién empezaba al poner las dos prendas. Ahora (`useUnionDeLaFigura`, `lib/union-prendas.ts`):

- **Se mide la copia chica** que ya sirve el optimizador de imágenes (`/_next/image?…&w=256&q=75`, 3 a 27 kB en las 8 prendas probadas) en vez del PNG entero. Medido con `sharp` en AVIF y WebP sobre esas
  8 prendas: el borde, la fila del borde y la pretina salen idénticos a los del PNG. Una foto que no pasa por el optimizador se baja tal cual, como antes.
- **Se recuerda entre visitas** (`localStorage`, los últimos 300 recortes, solo tres fracciones por prenda): una prenda ya vista se une al instante. Se lee después de montar, para que la primera
  pintura coincida con la del servidor.
- **Se miden las vecinas** de arriba y de abajo (las que se pasan con la flecha o deslizando) cuando el navegador está libre, de a una.
- **Si igual hay que esperar** más de 180 ms, la prenda de abajo se atenúa y aparece «Ajustando la prenda…» con un hilo que va y viene sobre la unión. Es una señal de espera (como el hilo de los botones
  del ERP), no un adorno; se apaga con `prefers-reduced-motion`. Una imagen que no responde en 4 s se da por no medible y la figura queda como antes.
- La prenda de abajo se acomoda en 0,32 s (antes 0,55 s).

Sigue sin hacerse en la figura quieta (servidor). No probado en un celular real ni en Safari.

## Actualización 2026-10-19: el bajo no siempre es recto, y la figura quieta también se une

Felipe mostró tres looks que «se ven raros al unirlos»: una blusa de encaje con caída asimétrica, una camisa bordada de bajo curvo y una blusa de cuadros de bajo en diagonal, todas con jeans o
pantalón. Reproducido en `/looks/arma` con la «Blusa Cuadros Coreana» y el pantalón negro: la pretina arrancaba en el punto MÁS BAJO del bajo de la blusa, y en el lado donde el bajo sube
quedaba una franja de aire entre la blusa y el pantalón. Causa: `medirRecorte` guardaba una sola fila para el bajo (la más baja con un tramo del 30 % del ancho) y la unión la usaba entera.

- **Se mide el perfil del bajo** (`MedidaDelRecorte.bajo`): dónde termina la prenda en cada una de 24 franjas verticales (la mediana del último píxel de prenda de sus columnas, para que un hilo suelto no
  cuente), como 24 números de 2 decimales por recorte. Lo recordado en el navegador sube a `cayla-union-v2`; lo de `v1` se vuelve a medir una vez.
- **La pretina arranca en el punto más alto del bajo** dentro del ancho central que ocupa (`filaAltaDelBorde`: entre el 30 % y el 60 % del ancho de la prenda de arriba, según lo ancha que sea
  la pretina). La parte del bajo que cuelga más abajo simplemente tapa la pretina: la prenda de arriba va delante. Una franja que termina más de 25 % del alto por encima del punto más bajo es un
  hombro o una manga, no el bajo, y no cuenta. Con un bajo recto da lo mismo que antes; sin perfil medido, también.
- **La figura quieta se une igual** (Favoritos, la página de un look guardado, el enlace compartido): `FiguraQuieta` (servidor) elige las piezas y manda al navegador solo lo que se dibuja
  (`FiguraQuietaUnida`, cliente), que usa el mismo `useUnionDeLaFigura`. Un look se ve igual al guardarlo o compartirlo que cuando se armó. Mientras llega la medida se ve la caja por largo y la prenda de
  abajo se acomoda en 0,35 s (sin movimiento con `prefers-reduced-motion`).
- Medido con `sharp` sobre los 9 recortes del probador de Arequipa: el punto alto queda entre 0,00 y 0,14 del alto de la prenda por encima del bajo (la blusa de cuadros, 0,05, unos 8 px en la figura).

- **La cintura del pantalón sigue el ancho de toda la zona del bajo, no el de su última fila** (`anchoDelBajo`, derivado del mismo perfil, sin guardar nada nuevo). Felipe vio que la blusa «se ve grande»
  y pidió que fuera automático, sin revisar prenda por prenda. Causa: en una blusa cruzada o con caída la fila más baja es solo la punta, angosta (0,52 del ancho en la «Blusa Cuadros Coreana»), así
  que la cintura del pantalón caía al mínimo de su rango (30,6 cm) y la blusa parecía enorme. Con el ancho real de la zona del bajo (0,75) la cintura sale de 37,9 cm, el pantalón recupera su largo
  de foto (el tope de 120 cm sigue) y la figura entera se achica sola si no cabe (`escalaDe`). No se tocó el largo de las prendas de arriba: sigue mandando el que anota el ERP.

- **La prenda de arriba se ajusta sola a su forma, sin tocar lo que ya se ve bien** (`cajaDeArribaAjustada`). Felipe vio blusas que no igualan el ancho del pantalón y pidió que fuera automático y sin
  deformar las otras. Causa: el largo de cada categoría es un solo número (65 cm para todas las blusas, 45 para los tops, 60 para los polos) y no encaja con la forma de cada prenda. Regla: si el
  bajo de la prenda mide menos que la cintura más angosta que admite la unión (30,6 cm), la prenda se dibujó demasiado chica y crece desde el centro de los hombros, sin subir, por la raíz
  cuadrada de lo que le falta y a lo más ×1,3; desde ese umbral hacia arriba no se toca NADA y **nunca se encoge** (los oversize, casacas y cardigans son anchos a propósito: 25 de las 105 prendas de
  arriba miden más de 50 cm de bajo). Es continua en el umbral. Medido sobre el catálogo de las tres tiendas (105 prendas de arriba, jeans Adelle Wide Leg): 80 quedan idénticas, 25 crecen (la de
  encaje asimétrica y el top con escote ×1,3; 7 más entre ×1,1 y ×1,2; las otras 16 menos de ×1,1) y ninguna se achica. La prenda de arriba ahora se mide siempre, también sin pantalón. El largo
  que anota el ERP sigue siendo el punto de partida.
- Descartado: encoger las prendas anchas hasta la cintura del pantalón (deformaría los oversize), y subir el tope por encima de ×1,3 (un top de 9,8 cm de bajo, que es probablemente una punta de amarre y no un bajo, saldría enorme).

## Actualización 2026-10-19 (b): el ancho del bajo se mide por filas, y el ajuste es proporcional

Felipe mostró un chaleco sobre camisa y un corset rojo que «tampoco se adaptan». Dos causas, una mía:
- **El chaleco con mangas largas** salía con un jean enorme (cintura 41,5 cm, largo 113 cm): el «ancho de la zona del bajo» se medía por franjas verticales seguidas y las mangas que cuelgan hasta el bajo
  contaban como cuerpo (1,00 del ancho). Ahora se mide **por filas** (`anchoBajo`: el tramo seguido más ancho en el último 12 % del torso): las mangas separadas del cuerpo no cuentan y el chaleco vuelve a
  30,8 cm de cintura. Se guarda en la medida; lo recordado en el navegador sube a `cayla-union-v3`.
- **El corset rojo** medía 30 cm de ancho y el ajuste suave (raíz cuadrada) lo agrandaba apenas ×1,08, así que el jean (mínimo 30,6 cm) quedaba más ancho que el top. El ajuste de la prenda de arriba ahora es
  **proporcional** a lo que le falta para llegar a esa cintura mínima (tope ×1,3): el corset sube ×1,26 y las dos anchuras coinciden.
- Catálogo (105 prendas de arriba, jeans Adelle Wide Leg): 74 idénticas, 31 crecen (22 más de ×1,05) y ninguna se achica. El umbral (30,6 cm) no cambió: lo que ya se veía bien no se mueve.

Queda por hacer: probar la figura quieta en `/looks/guardado/<id>` y en una tarjeta de «Tus looks» con una cuenta real (aquí solo se comprobaron tipos, las 676 pruebas de la tienda y la medida con las
imágenes reales), y mirar cómo se ven las prendas de arriba con volado o peplum.

## Actualización 2026-10-22 — la prenda de abajo no se ve más ancha que la de arriba en más de 5 %

**Qué pasó.** Una clienta vio el look `CMS-0026.ROS~FAL-0011.MOS~CAR-0010.CRU` con la falda «muy grande». La unión SÍ se aplicó (medido en `tienda.cayla.pe`: la falda
salió de 151 px en la escena, justo el máximo que permitía la regla, 148 + redondeo). La blusa (un peplum, 125 px de ancho) tiene el bajo con vuelo, así que llevaba la
pretina al tope de la holgura (+15 % = 41,4 cm) y la falda, que es acampanada (su pretina mide el 70 % de su ancho), se abría hasta 59 cm: 1,2 veces el ancho de la blusa.
No era un dato faltante ni algo que tuviera que medir una persona: el largo propio (`largo_cm`) no entra en esta cuenta cuando hay una prenda de arriba y las dos medidas están.

**Decisión.** Un tope más en `cajaDeAbajoUnida`: la prenda de abajo no pasa de `ANCHO_MAXIMO_DE_ABAJO_SOBRE_ARRIBA` (×1,05) el ancho de la de arriba. La pretina **nunca baja
de la cintura mínima** (30,6 cm): una falda de mucho vuelo, o un pantalón de pierna ancha, sigue siendo más ancha que su blusa, porque así es la prenda. Solo cambia lo que
antes llegaba al tope de la holgura por un peplum o una blusa ancha con una falda de pretina ancha; el resto de los looks no se mueve. Sin migración, sin columna, sin
trabajo para nadie: sigue saliendo de la propia foto.

**Prueba.** `union-prendas.test.ts` (dos casos nuevos: el de este look y el de una falda de mucho vuelo que conserva la cintura mínima). 775 pruebas de la tienda en verde, `tsc` limpio.

**Pendiente.** Verlo en el navegador con la tienda local (no se hizo: la medida y la imagen de comparación salen de las piezas reales de producción, no de la página). La medida
de los recortes se sigue haciendo en el navegador (primera pintura por largo típico, luego la unión): guardarla al generar el recorte la haría inmediata también para la imagen
que se comparte; es una migración y espera el OK de Felipe.

## Actualización 2026-10-22 (b) — el momento «Ajustando»: el hilo con su etiqueta (B1)

**Qué pasaba.** Mientras la unión esperaba su medida, la falda se apagaba al 45 % y salía un cartel blanco con una rayita que iba y venía («Ajustando la prenda…»). Felipe: se sentía
muy básico, como una pantalla de carga, y el cliente no entendía que algo se estaba ajustando ni que tenía que esperar.

**Decisión (Felipe, 2026-10-22, eligió mirando la maqueta `docs/maquetas/probador-ajustando-2026-10/`: 5 propuestas, cuatro variantes del hilo; eligió B1 y pidió atenuar la escena y sacar la etiqueta de las prendas).**
Mientras se espera la medida:
- **El hilo:** un hilo cochinilla (`--t-oferta`) cose el borde de abajo de la blusa, con su aguja que va y viene. Al llegar la medida deja un nudo y se desvanece. Su lugar (`hiloDeLaEspera`) es la fila medida de la blusa o, si todavía no se midió, la estimada (0,9 del alto); se achica con la figura.
- **El velo:** toda la escena se atenúa al 35 % (`.pb-velo`, el color del estudio) y «Sorpréndeme» se apaga (cambiaría lo que se mide); las flechas se atenúan pero siguen sirviendo. Se levanta al llegar la medida.
- **La etiqueta:** una etiqueta tejida dice «Ajustando tu look…» y, al llegar la medida, «✓ Listo» (`MS_DEL_LISTO` = 1,1 s). Vive en una franja `.pb-estado` **debajo del arco**, con su alto reservado (46 px): con un pantalón largo las prendas llegan casi al piso y dentro del estudio taparía una prenda; con el alto reservado la página no salta.
- Sigue valiendo la regla de antes: no aparece nada si la medida llega en menos de 180 ms (`ESPERA_ANTES_DE_AVISAR_MS`), para que no parpadee; con movimiento reducido queda el hilo punteado fijo y la etiqueta, sin animación.
- Se quitó el cartel `pb-ajusta` y la atenuación de la falda sola (`data-ajustando`, `.45`). La figura ahora es `.pb-figura` (estudio + franja); el área de la grilla de escritorio y lo fijo a la vista pasaron de `.pb-escena` a `.pb-figura`, y el esqueleto de carga (`FormaDelEsqueleto`) sigue la misma estructura.

**Descarté** (con la maqueta tocable): la cinta de modista (A), el zigzag que une (B2), la etiqueta colgante (B3: es justo lo que se quita de las fotos), el carrete (B4), el foco de galería (C), los alfileres (D) y el «respiro» (E: limpio pero no dice «espera»).

**Qué cambia en el código.** `lib/union-prendas.ts` (`hiloDeLaEspera`, `siguienteFase`, `FaseDelAjuste`, `MS_DEL_LISTO`; puros y con su prueba), `components/probador/useUnionDeLaFigura.ts` (devuelve `hilo`), `useFaseDelAjuste.ts` (nuevo: la fase y el temporizador del «Listo»), `Figura.tsx`, `FormaDelEsqueleto.tsx` y `app/estilos/probador.css`. Sin migración ni base.

**Verificado.** 781 pruebas de la tienda, `tsc`, `eslint`, `pnpm knip` y `knip:produccion` en verde. El CSS real (las hojas de la tienda, sin tocar) se miró en una página de prueba con el marcado exacto del componente, en la espera y en el «Listo», a 420 px.
**Falta** verlo en la tienda de verdad con un celular (Safari: la aguja usa `offset-path`; sin él no se dibuja y el hilo corre igual) y confirmar el tiempo real de la medida con la red de una tienda.

## Actualización 2026-10-22 (c) — la blusa se dibuja por su propio torso

**Qué pasaba.** Cada categoría se dibuja con UN largo típico (un polo, 60 cm; una camisa, 65), igual para todas las blusas del probador. Una blusa corta de verdad (un crop) salía
dibujada de 65 × 60 cm y una larga, de la misma medida: lo que cambiaba entre prendas era la forma de la foto, no su tamaño. Felipe: «no tengo que ajustar el recorte de cada prenda,
necesito que el sistema lo haga solo».

**Decisión (Felipe, 2026-10-22).** El tamaño de la blusa sale de su propio torso (`factorDelTorso`, `cajaDeArribaAjustada` con `porTorso`). El ancho del bajo dibujado es
`largo típico × proporción × fracción del bajo`, y el real es el mismo con el largo real; la razón entre los dos es la razón de los largos. Como se mide del propio recorte en el
navegador (ya se hacía para la unión), la blusa se escala por `(40 cm / bajo medido) ^ 0,8` —se corrige el 80 % de la diferencia, no el 100 %, porque la forma de la foto también se
mueve—, entre ×0,75 y ×1,35, sin cambiar nada si el bajo medido queda fuera de 18 a 62 cm (una foto rara) o la corrección es menor a 3 % (lo que ya se ve bien no se mueve). Escala desde
el centro de los hombros y sin subir. Solo para blusas, camisas, polos, tops y corsés (`PREFIJOS_POR_TORSO`: CMS, BLU, TOP, POL, COR, solo en la zona de arriba); casacas, chalecos, blazers
y abrigos siguen con la regla de siempre (solo crecen si su bajo es implausiblemente angosto, jamás encogen: son anchos a propósito). La falda se une a la blusa ya escalada.

**Descarté** (a) quitar la sombra suelta de un recorte con código al generarlo: se probó (`quitarSombraSuelta`, una regla de «casi blanco, blando, pegado al borde de abajo») y
sobre el recorte NUEVO de un pañuelo con flecos blancos (ACC-0001) cortaba 62 filas de flecos, un detalle real del producto; no se pudo separar de la sombra que dejó el recortador
viejo por ninguna medida simple. Esa sombra vive solo en recortes viejos, y se arregla rehaciendo la foto (13 fotos, con ChatGPT y el OK de Felipe, ver el backlog). (b) guardar la
medida al generar el recorte (sigue siendo la migración pendiente de arriba) y (c) un campo «largo real» por prenda: es el trabajo manual que Felipe no quiere.

**Prueba.** `union-prendas.test.ts` (10 casos nuevos: topes, banda muerta, monotonía, forma de la caja, lo que no se toca). `tsc` limpio.
**Pendiente.** Verlo con la tienda local sobre blusas reales (cambian de tamaño ~80 % de las blusas, poco cada una): conviene mirar un par de looks antes de fusionar.
