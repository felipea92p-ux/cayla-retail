# Prompt para limpiar la foto de una prenda con una IA (sin cambiar la prenda)

**Fecha:** 2026-10-17 · **Estado:** propuesta; el prompt se puede usar hoy, la automatización espera la decisión de Felipe.
**Relacionado:** ADR-0228 (fotos sin fondo y del mismo tamaño), ADR-0434 (probador «Arma el tuyo»).

## El problema

Hoy el equipo toma la foto, la pasa por una IA externa (ChatGPT u otra) para quitar el fondo y enderezarla, y recién la sube al ERP.
Dos cosas fallan sin un prompt fijo: cada persona pide algo distinto, y la IA a veces «mejora» la prenda (cambia un botón, un
estampado, el tono). Además se quiere que el top, el pantalón y lo que va encima (chaleco, casaca) se vean como en la realidad.

## Qué le toca a la IA y qué le toca al código

| Se necesita | Quién lo resuelve | Por qué |
|---|---|---|
| Fondo liso, prenda derecha y centrada, sin gancho ni sombra | **La IA, con el prompt de abajo** | Es limpiar una sola prenda |
| Que el top «encaje» con el pantalón y la casaca quede sobre la blusa | **El probador** (`apps/tienda/lib/probador.ts`) | Ya apila cada recorte desde los hombros o la cintura, a escala (2,5 px por cm, largo de `vitrina_largos_tipicos` o `vitrina_productos.largo_cm`), con casaca/chaleco encima (`CAPA`). Una IA que junte dos prendas en UNA foto las inventa |
| Que la casaca «se vea real sobre la blusa» | **La foto de la casaca, abierta** | Para encimarla, el espacio entre sus dos frentes tiene que ser fondo (transparente en el recorte). Si la IA lo rellena de tela, tapa la blusa |

Lo que de verdad hace que las piezas encajen es el **encuadre**: el recorte debe tocar los bordes reales de la prenda (hombros
arriba, bajo abajo, sin sombra ni gancho), porque el probador calcula el tamaño con el largo en cm y la proporción del recorte.

## Prompt base (va siempre, con el bloque de la zona de abajo)

```
Esta es la foto real de una prenda de mi tienda de ropa. Quiero una versión limpia para el catálogo SIN cambiar la prenda.

LO QUE SÍ HACES
1. Quita el fondo y todo lo que no es la prenda: gancho, pinzas, maniquí, manos, pared, piso, sombras y etiquetas colgantes o de precio. Las etiquetas cosidas a la prenda se quedan.
2. Fondo blanco puro #FFFFFF, liso, siempre (también si la prenda es blanca, crema o muy clara), sin degradado, sin sombra proyectada y sin reflejo.
3. Endereza la prenda: eje central vertical, centrada, hombros y bajo a nivel, mangas o piernas con el mismo ángulo a izquierda y derecha. Solo corriges la postura de la foto, no el diseño.
4. Quita solo las arrugas de la toma (dobleces de guardado o de colgar). Los pliegues que son parte del diseño (plisados, fruncidos, drapeados, vuelos) se quedan.
5. Luz pareja, con los colores fieles a la prenda real.
6. Encuadre ajustado y vertical 4:5: la prenda ocupa casi todo el alto, con un margen pequeño por lado, sin cortar ninguna parte (mangas, bajo, tirantes).

LO QUE NUNCA HACES
- No cambies el color ni el tono, ni lo «mejores».
- No cambies estampado, bordado, encaje, costuras, botones (cantidad, posición, forma), cierres, bolsillos, cuello, escote, largo, ancho ni proporciones.
- No inventes lo que no se ve. Si una parte está tapada, déjala tapada.
- No agregues personas, piel, otra prenda, accesorios, texto ni logos.
- Simétrica no es espejo: no copies un lado sobre el otro. Si la prenda es asimétrica de diseño (hombro caído, bajo en diagonal, bolsillo de un solo lado, estampado descentrado), se queda asimétrica.
- Si para limpiarla tuvieras que cambiar algo de lo anterior, no lo cambies y dime qué era.

Al terminar, dime en una línea si ajustaste algo que no esté en esta lista.
```

## Bloque por zona (se pega debajo del base)

Son las mismas cinco zonas del probador (`ZONAS` en `apps/tienda/lib/probador.ts`).

**Arriba** (polo, blusa, camisa, top, body, corset)
```
ZONA: ARRIBA, vista de frente. El borde superior de la imagen es la línea de los hombros (o el cuello); nada de gancho encima. El escote y el cuello quedan tal como son, y el hueco del cuello es fondo (sin piel ni maniquí). Mangas relajadas, apenas separadas del cuerpo, iguales a los dos lados. El bajo de la prenda toca el borde inferior del encuadre.
```

**Abajo** (pantalón, jean, falda, short)
```
ZONA: ABAJO, vista de frente. La pretina, recta y horizontal, es el borde superior. Piernas rectas, paralelas y sin cruzar; entre las piernas hay fondo. El bajo toca el borde inferior. Una falda cae con su vuelo natural, parejo a los dos lados.
```

**Encima** (chaleco, casaca, blazer, capa)
```
ZONA: ENCIMA, vista de frente, ABIERTA como se lleva sobre un polo o una blusa: los dos frentes caen a cada lado y el espacio entre ellos es FONDO liso. No lo rellenes con tela, ni camisa, ni maniquí, ni piel, ni pongas otra prenda debajo. Si se ve el forro o el cuello trasero por dentro, déjalo como está, sin inventar. Mangas a los lados, sin cruzar. Una prenda que no abre (poncho, capa cerrada) se queda como es.
```

**Vestido / conjunto / enterizo**
```
ZONA: VESTIDO, entero y de frente, de la línea de los hombros al bajo. El vuelo cae natural y parejo. Si es un conjunto de dos piezas, muestra las dos en su lugar, sin juntarlas ni taparlas.
```

**Bolso**
```
ZONA: BOLSO, de frente, con el asa o la correa en su posición natural (sin estirar) y sin contenido ni etiqueta colgante.
```

### Por qué cada decisión

- **Fondo blanco puro siempre (corregido el 2026-10-17).** Esta versión pedía gris claro para lo blanco o crema, y fue un error: el ERP marca
  «Por revisar» (`con_fondo`) toda foto cuyo fondo no es blanco (tono < 245), como pasó con «Basic Ori» (POL-0034). El recorte del probador se
  calcula con MODNet sobre la foto original (ADR-0434) y no tiene problema con prendas blancas. Ver `2026-10-17-prompt-estandar-fotos-armador.md`.
- **Sin sombra y sin margen grande.** Una sombra queda dentro del recorte y ensucia la prenda de abajo al encimarlas; un margen
  grande hace que el probador la dibuje más corta de lo que es.
- **«Simétrica no es espejo».** Espejar un lado borra el bolsillo, el estampado o el bajo diagonal, justo lo que el cliente compra.
- **La pregunta final** («dime si ajustaste algo») hace visible el cambio que la IA suele callar.

## Revisión de 60 segundos antes de subir (siempre)

Con el original al lado (el modal de revisión del ERP ya muestra «Antes»), mirar con zoom: cantidad y posición de botones, estampado,
costuras y bolsillos, escote y cuello, largo del bajo, y el color contra la prenda real. Si cambió algo, se pide otra pasada o se sube la
foto original (ADR-0228 la acepta y la limpia sola).

## Foto de un look completo (aparte, solo para redes)

El probador arma el look con las fotos reales de cada prenda. Una foto de «la casaca sobre la blusa» hecha por IA es un dibujo, no la
prenda: no va al catálogo. Si se quiere para redes, con las fotos reales ya limpias como referencia:

```
Te paso [2 o 3] fotos de prendas reales ya limpias. Arma una foto plana (flat lay) vista de frente, con la [casaca] abierta sobre la [blusa] y debajo el [pantalón], a la escala real de cada una. Reproduce cada prenda EXACTAMENTE como en su foto: mismo color, estampado, botones y costuras. No inventes nada que no se vea. Fondo liso [color]. Dime si algo no se pudo reproducir igual.
```

Se revisa pieza por pieza contra su foto, y se rotula como imagen de ejemplo si no es una foto tomada.

## Cómo automatizarlo (de más fácil a más trabajo)

1. **Botón «Copiar instrucción para la IA» en la revisión de fotos** (`components/RevisarFotosModal.tsx`, junto a «Cómo tomar una
   buena foto»). Elige solo el bloque de la zona según la categoría de la prenda (la misma regla `ZONA_DEL_GRUPO` del probador) y pone el
   color de fondo según si la prenda es clara. La persona sigue pegándolo en su IA, pero ya no tiene que escribirlo ni recordarlo.
   Sin costo, sin llave de API, sin tocar la base. Usa `<BotonCopiar>` (CLAUDE.md, «Una función, una pieza»).
2. **La IA dentro del ERP.** El servidor manda la foto y el prompt a una API de edición de imágenes y la revisión muestra un tercer
   resultado, «Mejorada con IA», al lado de «Antes» y de «Sin fondo». Cuesta unos centavos de dólar por foto, necesita una llave y
   **revierte lo que decidió ADR-0228** («descartado: un mejorador con IA generativa»), así que es decisión de Felipe. Si se hace,
   con una prueba automática de fidelidad que compare la prenda original con la resultante (silueta, color promedio, cantidad de
   piezas) y avise «la IA cambió algo» antes de que alguien la sube.
3. **Nada de IA para enderezar.** Girar para dejar el eje vertical y centrar se puede hacer en el navegador sin inventar píxeles
   (`lib/foto-encuadre.ts` ya centra). Es un camino sin riesgo para la parte de «derecha y simétrica», pero no quita el gancho.
