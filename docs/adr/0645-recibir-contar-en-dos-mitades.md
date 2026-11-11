# ADR-0645 — Recibir ▸ Contar en dos mitades

- **Fecha:** 2026-11-11 · **Estado:** construido y verificado en local; **PR abierto** ([felipea92p-ux/cayla-retail#1779](https://github.com/felipea92p-ux/cayla-retail/pull/1779)), sin fusionar ni publicar. Solo web: no hay
  migración ni RPC nuevas.
- **Rama:** `claude/redesign-receiving-merchandise-6cbf2f`. Número reservado con `pnpm reservar adr`.
- **Relacionados:** ADR-0604 (Contar modelo por modelo, la pantalla que esto reordena), ADR-0393 (Recibir contando y «Llevar al stock»),
  ADR-0575 (Recibir «B»: el Trayecto y el Dial), ADR-0596 (vidrio «Serena»), ADR-0284 (guía de foco), ADR-0389 (guías interactivas),
  ADR-0479 (la hoja y la isla del celular), ADR-0336 (modo oscuro), ADR-0611 (44 px con el dedo).
- **Maqueta de la que sale:** `docs/maquetas/recibir-dos-mitades-2026-11/` (con el marco de `recibir-ordenada-2026-11/`).

## El problema

Felipe, 2026-11-11: en Contar había muchos campos y textos repartidos, nadie leía el «Resumen del envío» de la derecha y, con el menú
plegado, sobraba media pantalla «que se la queda un simple contador». La tabla de tallas vivía dentro de la placa del contador, donde no
cabía. Vio tres direcciones (Mesa de tres, Tablero, Mostrador), las encontró «muy apretujadas» y pidió otra: **solo las categorías y el
contador, del mismo tamaño, y las tallas y colores en una hoja**. Sobre esa maqueta pidió tres ajustes: los filtros en UN botón («el
buscador está muy largo y los filtros son muchos»), «Llevar al stock ahora» como botón principal (las colaboradoras casi siempre llevan
la prenda al stock desde el conteo, para venderla ya) y un solo «Revisar y cerrar» («es redundante»).

## Lo que se decidió

Contar son **dos mitades iguales con el mismo esqueleto** (cabeza, cuerpo que corre, pie fijo): a la izquierda todo lo del envío, a la
derecha el modelo que se cuenta. Llenan la ventana y cada una tiene su propio scroll (`.rc-mesa`, `app/estilos/vidrio/recibir-mesa.css`).

1. **La lista se queda con lo del envío entero** (`ListaDelEnvio` en `CategoriasAcordeon.tsx`). Arriba, el avance en una línea
   (`AvanceDelEnvio`: barra, «N de M prendas contadas» y la frase de `fraseDelAvance`). Debajo, el buscador y **un botón «Filtros»**
   (`FiltrosDelEnvio`): estado (por contar, con diferencia, cuadran, tallas para después, por llevar al stock), tipo, proveedor, marca y
   orden; el panel flota sobre la lista, elegir lo cierra y lo puesto queda escrito con su ✕. En el pie (`PieDeLaLista`): lo que falta,
   quién cuenta, las fotos de las facturas y el **único «Revisar y cerrar»** de la pantalla. Se fueron `ResumenDelEnvio` y `TiposDelEnvio`.
2. **El contador va en tres bloques** (`PlacaDelModelo`): «¿Cuántas llegaron?» (el Dial y «Llegaron las N», el botón grande),
   «Tallas y colores» y «¿Pasó algo con esta prenda?». Su pie habla solo de la prenda: cuál viene («Después: …»), «Anterior» y
   «Listo, siguiente»; en el último modelo lleva al que quedó sin contar (`siguientePendiente`).
3. **«¿Qué deseas hacer?» ya no se pregunta: viene contestado por lo que es la prenda** (regla nueva, decidida por Felipe).
   `modoDeTallas(elegido, conTallas, enCatalogo)`: lo que está en el catálogo se reparte ahora; lo nuevo queda para después. La tarjeta
   (`TarjetaDeTallas`, ocho estados en `estadoDeLaTarjeta`) dice cómo va y ofrece el otro camino («Dejar para después», «Crearla ahora»).
4. **Las tallas y colores se reparten en una hoja** (`HojaRepartir`, ancha, con la tabla de siempre: `TallasDeLaPlaca`). Se guarda sola
   cuando lo repartido cuadra con lo contado, así que no tiene «Guardar»: se cierra con su ×. **«Agregar talla o color» abre la hoja
   completa de la prenda** (`HojaPrenda` con `enTabla`) con sus tallas y la carta de colores, en vez de dos combos (Felipe, al verla en
   local: «buscar en un combo es muy complicado»). Al volver, la tabla muestra justo lo marcado (`tablaConLoMarcado`); si desmarcar pisa
   cantidades ya escritas, el aviso trae «Deshacer».
5. **«Llevar al stock ahora» es el botón principal** cuando todo está repartido, en la tarjeta y en el pie de la hoja; a medias se puede
   llevar lo ya repartido («Llevar N al stock ya»). La hoja de confirmación y la RPC son las de ADR-0393, sin cambios. La lista gana el
   filtro «Por llevar al stock» (`porLlevarAlStock`).
6. **«¿Pasó algo con esta prenda?» va a la vista**, con palabra y no detrás de un «Más»: «Llegó dañada» (abre la hoja de tallas en su
   parte de dañadas), «Es otra prenda» y «Anotar algo».
7. **Angosto y celular.** Bajo 760 px de contenedor las mitades se apilan y elegir un modelo baja la vista hasta el contador
   (`elegirEnLaLista`). Bajo 640 px de ventana la pantalla es el contador: la lista se abre en una hoja (`HojaDeLaLista`) desde la isla de
   abajo (`IslaDelEnvio`, la pieza `barra-movil`), que dice cuánto falta y, con todo contado, trae «Revisar y cerrar».
8. **El aviso de asistencia va arriba de las dos mitades.** Si nadie marcó entrada hoy (o no se pudo leer el turno), el combo
   «Quién cuenta» dibuja un aviso con pasos; en el pie de la lista dejaba una sola fila de modelos a la vista. En el pie queda una insignia
   (`sinTurno`, `PieDeLaLista.tsx`).

9. **Tres ajustes de `/formidable`, con el OK de Felipe (2026-11-11).** (a) Al tocar «Llegaron las N», el contador baja solo hasta la
   tarjeta de tallas: se mueve su mitad, no la página; apiladas y en el celular, baja la página lo justo. (b) **Un solo botón negro a la
   vez:** `botonPrincipal` (`lib/recepcion-tallas-reglas.ts`) decide si lo lleva la tarjeta del modelo, «Revisar y cerrar» o «Listo,
   siguiente»; en la isla del celular «Lista» va siempre en claro. (c) **Una sola frase de lo que falta por contar:** «Faltan N por
   contar», arriba de la lista, que se toca y lleva al primero (`primeroPorContar`); el pie de la lista habla solo de lo que impide cerrar
   y no es contar (`faltaAparteDeContar`: quién cuenta, qué son unas prendas, una categoría sin modelos, un nombre que conviene poner).
10. **Mientras se recibe, el navegador no devuelve el scroll solo** (`history.scrollRestoration = "manual"`, `RecibirContando.tsx`). Cada
    guardado pone y retira la guardia de «salir sin guardar», una entrada del historial que se quita con un «atrás»; con la restauración
    automática, ese «atrás» devolvía la página adonde estaba al tocar. Ya pasaba antes de esta obra, donde se desplaza la página (el
    celular, las mitades apiladas): quien tocaba «+» y bajaba antes de que guardara veía saltar la pantalla.

**Las hojas se diseñaron con Felipe al llegar a cada una en local**, no se portaron de la maqueta («no me convencen del todo»). Las que ya
existían (agregar modelo, quitar, editar, la confirmación de llevar al stock) quedaron como estaban.

## Lo que doy por hecho (Felipe puede corregirlo)

- **Un color nuevo se crea solo en las tallas marcadas** en la hoja de la prenda, no en todas las tallas del producto.
- **«Llegó dañada» está apagado en una prenda nueva sin crear**, con la nota «primero crea la prenda»: las dañadas se anotan por talla y
  color, y una prenda sin crear no las tiene.
- **«Es otra prenda» abre la hoja grande de antes** (`HojaTallas`); no se rediseñó.
- **El rango angosto que no es celular (640 px hasta que caben las dos mitades) se queda apilado**, no pasa a isla y hoja.
- **Con todo contado, «Revisar y cerrar» espera en claro mientras al modelo en foco le toque algo** (repartir, llevar al stock) y pasa a
  negro cuando no. Es la regla del botón único; si todas las prendas del envío quedan con tallas pendientes, el negro lo tiene siempre la
  tarjeta y el cierre se toca en claro.
- **«Falta», en el pie de la lista, ya no incluye contar:** lo dice la línea de arriba. Es una decisión de la guía de foco (ADR-0284)
  que Felipe aceptó con el cambio 3.

## Descarté

- **Las tres direcciones de la primera maqueta** (tres columnas, tablero de tarjetas, una prenda grande con tira de modelos): Felipe las
  vio apretujadas.
- **Los filtros siempre a la vista** (píldoras bajo el buscador, tarjetas «Re stock / Nuevo» arriba): ocupaban dos filas para algo que se
  usa pocas veces por envío.
- **La tabla de tallas dentro de la placa:** con cinco colores y tres tallas no cabía en media pantalla y empujaba el pie.
- **Dos combos «Agregar color» y «Agregar talla»:** hay 87 colores; buscarlos en un combo es más lento que marcarlos en la carta.
- **Un «Revisar y cerrar» en cada mitad:** redundante. Quedó uno, en el pie de la lista (y, en el celular, en la isla con todo contado).
- **Lo que inventó la maqueta y no existe en la base:** el aviso de «número raro», el conflicto entre dos personas que cuentan lo mismo y
  seguir sin conexión. Quedan fuera hasta que Felipe los pida; «Revisa y cierra» y «Cerrado» tampoco se tocaron.

## Se rompe si

- **`.rc-atajo-grande` se escribe antes que `.rc-atajo`** en `recibir-mesa.css`: tienen la misma fuerza y gana la última; el botón grande
  vuelve a 40 px (pasó, y lo encontró la medición).
- **El pie de la lista vuelve a dibujar el combo «Quién cuenta» en los estados `nadie` o `sin_lectura`:** su aviso mide media columna.
- **Un paso de la guía del contador pide (`requiere`) un ancla de la lista:** en el celular la lista no está a la vista y el paso se salta.
  Los pasos del contador piden `CONTADOR_A_LA_VISTA`; los de la lista abren la hoja con `LISTA_DEL_CELULAR` (`lib/guias/pantallas/inventario.ts`).
- **`--rc-mesa-arriba` deja de medirse** (`ContarEnvio.tsx`): las mitades toman 540 px o se salen de la ventana.
- **Alguien quita el `scrollRestoration = "manual"` de `RecibirContando`:** vuelve el salto de la página al guardar, en el celular y
  apiladas; y el cambio (a) deja de funcionar ahí, porque la página baja y a los 0,7 s vuelve.
- **Un botón nuevo de Contar se pone negro sin pasar por `botonPrincipal`:** vuelven a convivir dos.
- **Se cambia el estilo de `.rc-modelo` sin mirar la lista angosta:** bajo 400 px un modelo agregado a mano necesita su tercera línea, o
  «10 contadas» se corta entre «No estaba anotada» y el tacho.

## Cómo se verificó

- **Pruebas:** 890 archivos de prueba de la web en verde, `pnpm knip` y `pnpm knip:produccion` limpios, tipos y lint en cada commit.
  Lógica nueva con su prueba en `lib/recepcion-modelos-reglas.test.ts`, `lib/recepcion-tallas-reglas.test.ts` y
  `lib/recepcion-envio-reglas.test.ts`.
- **Medido en el navegador** contra una base local aislada con datos inventados (un envío de 6 modelos, uno de 26 con nombres largos y
  dos proveedores, y uno en otra sede): a 1024×768, 1280×720, 1366×768, 1440×900, 1536×864, 1680×1050 y 1920×1080, con el menú plegado y
  abierto, y a 375, 639, 700 y 768 px; en claro, oscuro y con las animaciones apagadas. Sin scroll horizontal, nada fuera de su panel y
  ningún botón encima de otro. Los flujos se recorrieron enteros: contar con Enter, filtrar, repartir con guardado solo, agregar talla y
  color y desmarcar con «Deshacer», llevar al stock, las tres acciones de «¿Pasó algo?» y el celular de punta a punta.
- **Guía interactiva** (`recibir.envio.id`) recorrida con `guias:recorrer` a 1440 px y a 375 px, con una cuenta Admin y con una sin
  asistencia: 19 a 21 pasos, sin escribir en la base. Huella aceptada: 281 controles.
- **Modo oscuro** medido con `tema:auditar` en cuatro escenarios (Contar, la hoja de tallas, la hoja de la prenda y la lista del
  celular): 0 hallazgos solo en oscuro. Encontró y se corrigió el ✓ de la carta de colores, que no se leía sobre un color claro
  (`components/alta-producto/ElegirColores.tsx`, la misma carta de Nuevo producto).
- **Guía de foco y sugerencias:** `pnpm focus` (la pantalla y sus hojas, aplicadas o declaradas) y `pnpm sugerir` (0 ejemplos por revisar).

## Lo que NO se verificó

- **`/chaos` no corrió.** Sus instrumentos (la foto y las invariantes) solo conocen la base local compartida, y a esa base le faltan 51
  migraciones de esta rama; actualizarla es una orden de Felipe. No se rodeó el candado.
- **La prueba ciega de `/formidable` no corrió:** un filtro de seguridad de la API frenó al agente en su primer mensaje. La medición de
  oficio, la revisión de leyes y el veredicto del escéptico están en `docs/formidable/recibir-contar-dos-mitades.md`; sus tres cambios
  ya están hechos y medidos (punto 9), pero nadie sin contexto usó la pantalla.
- **La pieza compartida `useSalidaSinGuardar` no se tocó.** El mismo salto del scroll puede pasar en cualquier otra pantalla que se
  guarde sola mientras la página está desplazada; no se buscó cuáles.
- **Ninguna colaboradora real la usó**, ni se probó en un celular o una tablet de verdad (solo el tamaño emulado).
- **Dos personas contando el mismo envío a la vez** no se probó en esta rama: el guardado por línea no cambió, pero la pantalla nueva no
  se miró con dos sesiones.

## Lo que le toca a CAYLA Dynamic

Se tocó `apps/web/app/estilos/vidrio/recibir-mesa.css`, que está en la lista de lo que Dynamic mira: su vigilante abrirá una tarea de
aviso. **No hay nada que llevar allá:** son clases `rc-*` de esta pantalla, que Dynamic no tiene. No se tocaron `recetas.css`, el contrato
ni `components/ui/`.
