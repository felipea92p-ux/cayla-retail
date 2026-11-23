# ADR-0677 — Campañas y ofertas, más simple: los descuentos van primero, en la lista

**Fecha:** 2026-11-18 · **Estado:** aceptado por Felipe (la cara A el 2026-11-17; la lista de 9 actividades, «Aprobada»; las dos reglas de la
actividad 4 el mismo día). Construye sobre ADR-0669 (los cajones de «Poner un %») y ADR-0655 (Campañas y ofertas). Este ADR cubre las
actividades 1 a 5; la campaña abierta, la hoja de ofertas en una sola hoja y la compra de ejemplo (6 a 8) van en el PR siguiente y lo amplían.

## Contexto

ADR-0669 dejó «Poner un %» en producción el 2026-11-16: un escáner arriba, una hoja con tres preguntas y, debajo, «Rebajas de tu tienda» en
tarjetas. Felipe, al verlo: «ese diseño está horrible… parecen 3 tarjetas sueltas al azar». Se dibujó la maqueta del módulo entero
(`docs/maquetas/campanas-simple-2026-11/`, corregida con una prueba ciega) con dos caras para los descuentos: **A · En la lista** (el descuento y
la campaña son la misma fila) y **B · Etiquetas colgadas** (un riel con una etiqueta por %).

## Decisión

Felipe, 2026-11-17:

| Pregunta | Decisión |
|---|---|
| Qué cara | **A · En la lista**: se aprende una vez, el descuento y la campaña se ven igual |
| Las campañas que hoy hacen de descuento («Para liquidar», «Top ventas») | Quedan como campañas: no se migra nada |
| El mismo % en la tienda y en todas | Dos filas («−20 %» y «−20 % · Todas las tiendas») |
| «Regalo» y «Club» en la hoja de ofertas | Salen (actividad 7) |
| Cambiar un descuento a un % que ya existe en la tienda | Las prendas **se juntan** ahí y el de antes se apaga |
| Desactivar un descuento con prendas | Sus prendas **vuelven a su precio**, con «Deshacer» |

1. **La lista.** Arriba de las campañas, «Descuentos»: una fila por cajón encendido que rige en la tienda (los suyos y los de todas), con su %,
   de dónde es y cuántas prendas (modelo y color) tiene; la última fila es «Nuevo descuento». Lee `campanas_descuentos(sede)` (solo lectura, pide
   ver Campañas y ofertas). La fila es `FilaDeLista`, la misma que tomarán las campañas en la actividad 6. Las piezas, al milímetro:
   `docs/milimetro/fila-de-lista-campanas.md`.
2. **El panel de un descuento.** Tocar la fila lo abre al costado (en una columna, debajo de su fila): el % en grande, quién lo hace, sus prendas en
   grilla con el precio que queda y «Bajo costo» si corresponde, y una × por prenda que quita y ofrece «Deshacer». «Más»: Cambiar el %, Imprimir
   etiquetas (la pantalla de siempre, con esa campaña) y Desactivar. Ficha: `docs/milimetro/panel-de-descuento.md`.
3. **Agregar.** Un buscador bajo la cabecera: con la pistola, un código exacto pregunta solo **«Solo esta» o «Todo el modelo · N colores»** (el % ya
   lo dice el descuento abierto) y Enter repite la última respuesta; por nombre, las sugerencias de siempre (`ListaSugerencias`). En el celular, la
   cámara lee una prenda tras otra (`EscanerBusqueda` continuo). Agregar sale de `poner_rebaja` (una prenda) o `poner_rebaja_varias` (todo el modelo, en
   una transacción); antes, `campanas_rebaja_de_variantes` dice en qué % estaba cada talla, para que «Deshacer» la devuelva a ese % y no solo la quite.
4. **Nuevo, cambiar el % y desactivar** (`20261118030000`), las tres con el módulo, la tienda donde se trabaja, «todas» solo un líder, la firma del
   responsable (`fn_actor_persona_id(true)`) y el mismo candado de transacción que `poner_rebaja`, para que dos personas a la vez no dejen un estado
   imposible:
   - `crear_descuento`: el cajón de ese % en la tienda (o en todas), vacío. Si ya existe, lo devuelve; si estaba apagado, lo enciende vacío.
   - `cambiar_pct_de_descuento`: si no hay otro con ese %, cambia su % y su nombre; si lo hay, junta las prendas ahí y apaga el de antes. Devuelve qué
     tallas se movieron, para «Deshacer».
   - `desactivar_descuento`: quita sus marcas y lo apaga (si conservara sus prendas, volver a crear ese % las rebajaría a todas). Devuelve las tallas.
5. **Lo que se fue.** El escáner suelto (`PonerUnPct`), la hoja de tres preguntas (`HojaRebaja`) y las tarjetas de «Rebajas de tu tienda»: el escáner
   vive ahora en el panel de cada descuento. Las funciones de ADR-0669 siguen igual y se reusan.
6. **Avisos después de releer.** Lo que cambia la lista (crear, cambiar, desactivar y sus «Deshacer») relee la pantalla dentro de una transición y el
   aviso sale después: un aviso que se ve mientras la pantalla se ocupa se retira solo (ADR-0146, ADR-0149) y se perdía su «Deshacer». Quitar y agregar
   dentro del panel no releen: la fila toma la cifra del panel.

## Alternativas descartadas

- **B · Etiquetas colgadas**: más «de tienda», pero dos formas en la misma pantalla para lo mismo (ADR-0358, «una función, una pieza»).
- **Migrar «Para liquidar» y «Top ventas» a cajones**: tocaba 1.199 tallas en producción y su historia, para que se vieran distinto. Felipe: quedan como campañas.
- **Una sola fila para el mismo % de la tienda y de todas**: escondía de dónde viene el %, y quitar ahí habría tocado otras tiendas.
- **Confirmar antes de desactivar**: es reversible, así que se perdona con «Deshacer» (ley 7 de Formidable) en vez de preguntar.
- **Al cambiar a un % que ya existe, rechazar**: obligaba a mover las prendas una por una. Felipe eligió juntarlas.

## Consecuencias

- **Base:** tres migraciones, solo funciones (ninguna tabla ni columna nueva): `20261118001000_campanas_descuentos`,
  `20261118010000_campanas_rebaja_de_variantes` y `20261118030000_descuentos_crear_cambiar_desactivar`. Van a producción en ese orden, después de las
  de ADR-0669 (ya pegadas), y **solo con el OK de Felipe**, **antes de fusionar el PR** (pegadas el 2026-11-18 por orden de Felipe, con los 9 md5
  idénticos a la base de la rama): la web nueva ya no trae el escáner de ADR-0669, así que
  publicada sin ellas la tienda se quedaría sin «Poner un %» (la lectura falla, la lista de descuentos no se dibuja y quedan solo las campañas).
- **Pruebas:** `pnpm pruebas:rebaja-rapida` (55 escenarios, sale de una tienda sin cajones dentro de su transacción), `lib/rebaja-rapida-reglas.test.ts`.
- **Guía:** la de Campañas suma «Un descuento nuevo» y «Agregar prendas a un descuento» (29 pasos recorridos en escritorio y a 375 px). La guía de foco
  de la hoja trata el % que llega puesto como «sugerido» hasta que la persona lo toca (ADR-0284 act. h).
- **Chaos (2026-11-18, semilla 1118):** 0 estados imposibles. Los dos hallazgos se cerraron con el OK de Felipe: el % de un descuento empieza en 1
  (`fn_pct_de_descuento` y `pctDeDescuento`; antes un −0,5 % pasaba) y, si la base dice que el descuento o el % ya no están, la pantalla vuelve a
  leer la lista y avisa «la lista ya está al día» (`avisoDeListaVieja`). `poner_rebaja` (ADR-0669, en producción) sigue aceptando más de 0, pero
  desde esta pantalla solo recibe el % de un descuento que ya existe.
- **Formidable (2026-11-18):** la prueba ciega terminó en 5 toques y dejó tres dudas que se arreglaron con el OK de Felipe: la prenda dice
  «todas las tallas» con palabras, el aviso al agregar dice «Antes tenía −20 %» (nunca el nombre interno del cajón) y tocar una prenda con todas sus
  tallas muestra cuáles (S · M · L).
- **Dynamic:** no cambia `vidrio/recetas.css` ni `components/ui/`: no le llega nada.

## Actualización 2026-11-18 (b) — abrir una campaña, la hoja de una oferta y «En caja» (actividades 6 a 8)

Rama `claude/campanas-abrir-campana`. Solo pantalla: ninguna migración, ninguna RPC nueva ni cambiada. Felipe partió la actividad 7 en tres
(7a, 7b, 7c) al verla demasiado grande para un solo paso.

1. **Abrir una campaña (6).** La campaña es la misma fila que un descuento (`FilaDeLista` con su insignia) y se abre al costado en
   `PanelDeCampana`: el nombre, tres chips (estado, fechas, tiendas, `chipsDeCampana`), «Editar» y «Más» (repetir, imprimir, web, desactivar),
   **sus ofertas como carteles** («3 x 2 · Toda la campaña», `cartelesDeCampana`) y sus prendas. Salen las «tres preguntas» del pase y la barra de
   días. Si sus ofertas eligen las prendas, ya no dice «Sin prendas» (`prendasLasEligenSusOfertas`).
2. **«Qué le das» (7a).** Cinco opciones (−20 %, 3 x 2 · 2 x 1, 2 por S/ 59.90, 2.ª −50 %, −S/ 30) y el ejemplo **es** la opción: la elegida dice sus
   números de ahora (`lib/oferta-que-le-das.ts`). Salen las ayudas y «Regalo» y «Club».
3. **Una sola hoja (7b).** Las cuatro preguntas una debajo de la otra; las tres de abajo aparecen al elegir qué le das. Sin pasos, sin
   «Siguiente», sin atajo: el pie siempre dice lo que falta, «Guardar como borrador» y «Activar».
4. **La oferta se abre desde su cartel (7c).** La hoja es de UNA oferta: «Nueva oferta» la abre vacía y un cartel la abre editando. Sale «Ya
   registradas» (la lista estaba dos veces: en el panel y en la hoja) y la franja de la campaña. **Guardar, activar o retirar cierran la hoja**: lo
   que quedó se ve en su cartel. «Retirar» va a la izquierda del pie, con su «Sí, retirar · No, dejarla»; el historial («1 cambio · antes: …») pasa a
   «Revisa». La hoja baja de 78 a 70 rem.
5. **«En caja» (8).** La columna de la derecha deja la etiqueta de la campaña y cobra **una compra de ejemplo** con prendas que la oferta alcanza,
   con la misma cuenta de Vender (`lib/compra-de-ejemplo.ts`: `descuentoDeCampana` para un %, `ejemploDeGrupo` / `ejemploDeMonto` para grupos y
   montos), con su foto, lo que paga cada una, el total y el ahorro. Sale el ejemplo suelto de «En qué prendas».

**Descartado:**
- **«Gratis» en la prenda que regala un 3 x 2** (como la maqueta): la caja reparte el ahorro del grupo entre sus prendas (`ofertasDeGrupo`); el ejemplo
  mostraría otro ticket que el que imprime la caja.
- **Volver a «Nueva oferta» después de guardar** (lo que hacía 7b): sin la lista adentro, la persona no veía lo que acababa de guardar.
- **«En caja» arriba en el celular**: empujaba «¿Qué le das?» medio alto de pantalla; va después de las preguntas.

**Después de Formidable y del caos (con el OK de Felipe, «Sí, los cuatro»):** el cartel dice sus tiendas, fechas y días cuando no son los de su
campaña (las fechas, comparadas desde hoy); con un choque, el pie dice «Puedes guardarla como borrador. Para activarla: …»; «Retirar» cambia el pie
entero a «¿Retirar la oferta «3 x 2»?» con «No se puede deshacer» (la base no reactiva una oferta retirada) y el foco va a «No, dejarla» sin mover la
hoja; guardar y retirar pasan por `unSoloEnvio`.

**Pendiente de Felipe** (backlog `2026-11-18-campanas-abrir-campana.md`): imprimir y «Ver en la web» de una campaña sin descuento de siempre;
desactivar una campaña con prendas marcadas; si el cartel dice también «Todas las tiendas».

**Verificado:** guía de Campañas (34 pasos, escritorio claro y celular oscuro), `/milimetro auditar` (0 graves,
`docs/milimetro/auditorias/2026-11-18-campanas-abrir-campana.md`), `/chaos` (0 estados imposibles), `/focus` al día. **Dynamic:** no cambia
`vidrio/recetas.css` ni `components/ui/`: no le llega nada.

## Actualización 2026-11-18 (b) — la hoja de una oferta vuelve a ir por fases, con todo en grande

Felipe, al ver la hoja única de 7b en uso: «las cosas muy pequeñas no funcionan», lo más importante («Lleva … y paga …») tiene que verse mucho más
grande, lo demás también, cada cosa tiene que decir para qué sirve, e «ir por fases para que no quede muy extenso el modal». Rama
`claude/ofertas-modales-tama-o-135e3a`. Solo pantalla: lo que guarda no cambia (ni migración ni RPC).

**Decidido (reemplaza el punto 3, «Una sola hoja (7b)»):**
1. **Cuatro fases, una pregunta por vez:** qué le das · en qué prendas · cuándo y dónde · revisar. Arriba, la barra de fases (píldoras de 44 px: la
   de ahora en el ahumado denso, la que quedó lista con su ✓); abajo, la flecha de «fase anterior», «Siguiente» y, en la última, «Guardar como
   borrador» y «Activar». «Falta: …» dice solo lo de la fase en que se está o de las de antes.
   Lo de 7c no cambia: la hoja es de UNA oferta, se abre desde su cartel y guardar, activar o retirar la cierran.
2. **Al editar, «Guardar cambios» está en todas las fases** (y «Retirar», a la izquierda): corregir un número no obliga a recorrer las cuatro.
3. **Los números de la oferta, en el paso «grande» del sistema** (`<PasoCantidad tamano="grande">`: 68 px de alto, el número en la serif a 36 px,
   − y + de 44 px) y las palabras de la frase en la serif a 28 px; el monto de «N por S/», en una caja de 68 px con la cifra a 36 px. Debajo, **una
   línea que dice qué hacen** («De cada 3 prendas, la más barata va gratis.», `loQueHace` en `lib/oferta-que-le-das.ts`, con su prueba).
4. **Lo demás, también grande:** las cinco formas (104 px de alto, el ejemplo a 26 px), las opciones (píldoras de 44 px a 15 px), los días (56 × 44),
   los botones del pie (44 px), la grilla de categorías y el segmento «Cómo las eliges» (44 px), y el nombre de cada control en letra normal de
   16 px en vez de versalitas de 11 px. Son las piezas del sistema; solo crecen dentro de esta hoja (`.of-wz`), no en el resto del ERP.
5. **«Nuevo descuento» y «Cambiar el %»** (`campanas/HojaDeDescuento.tsx`): su % pasa al mismo paso «grande» y sus porcentajes a un toque, a
   píldoras de 44 px.

6. **El contenido, al centro y con relieve** (Felipe, al probarla: «está muy plano y todo debería estar más centrado para no perder el foco de las
   cosas importantes»). Una sola columna de 54 rem al centro de la hoja (que baja de 70 a 62 rem): la barra de fases con un hilo entre fase y
   fase, la pregunta y las cinco formas centradas, y debajo **el escenario** (`.of-escena`): una placa del vidrio claro que sobresale, con los
   grupos de la fase centrados y separados por una línea. En «Qué le das», los números, la línea que dice qué hacen y, al pie y tras una línea
   punteada, **«En caja»** como el talón de un ticket. «En caja» deja la columna de la derecha y sale donde responde algo: bajo los números y bajo
   la frase de «Revisar»; en las fases de prendas y de fechas no se dibuja.

7. **La hoja no cambia de tamaño** (Felipe, al probarla: al volver de «Desde S/ 300» a una forma más baja, el pie quedaba flotando sobre los
   números). La causa: cuando el contenido se acorta, `<PaginaEstable>` (ADR-0185) reserva ese alto como **relleno** al fondo de la hoja, y el pie
   pegado (`pie-hoja-fijo`) se mide desde ese relleno. Aquí se resuelve en la hoja:
   - **Desde 640 px, alto fijo** (`<Modal altoFijo>` y `height: min(54rem, lo que deje la pantalla)`): arriba el título y las fases, abajo el pie, y
     en medio el contenido de la fase, que es lo ÚNICO que se desliza (`.of-cols`, con `data-sin-reserva`). La hoja mide lo mismo con cualquier
     forma, en cualquier fase, con uno o tres escalones y aunque el pie pase a dos renglones.
   - **En el celular** la hoja entera se desliza con su pie pegado, ocupa siempre su alto máximo y lleva `data-sin-reserva` (la marca que
     `<PaginaEstable>` ya lee): sin relleno reservado, el pie no flota.
   - **Las piezas miran su propio ancho, no el de la ventana** (`@container`): las fases nunca bajan a una segunda fila (con poco ancho, solo la
     de ahora dice su nombre; con menos, las cuatro son su número) y las cinco formas van 5 · 3+2 · 2+2+1 según su caja.
   - **Pantalla baja** (hasta 800 px de alto): lo que no es contenido se aprieta.

8. **«¿En qué prendas?»: primero leer la prenda** (Felipe: «las chicas suelen agregar una prenda ahí escaneando con la pistola de barras o con el
   teléfono, luego buscando por el nombre»; y «hay dos botones planos que parecen solo texto»). La fase se ordena por lo que más se usa:
   - **Agrega una prenda:** el buscador grande del mostrador (ícono de código de barras) y, al lado, «Con la cámara» como botón principal. La
     pistola escribe el código y Enter: la prenda entra sola y el cursor se queda para la siguiente; las lecturas hacen cola, así que ninguna se
     pierde aunque lleguen seguidas. Escribiendo, sugiere modelos con su foto y Enter toma el primero. La cámara lee una etiqueta tras otra
     (`EscanerBusqueda`, el visor de siempre). Lo que entra es el **modelo**, con todas sus tallas y colores: así elige prendas una oferta
     (ADR-0655), y la regla de qué entra no cambia (`alternarProducto`).
   - **Cómo reconoce el código:** primero entre las prendas que la hoja ya tiene (`productoDeCodigo`, `lib/oferta-prendas-buscar.ts`); si no, la
     base (`buscar_prenda_para_rebaja`, de solo lectura: SKU, etiqueta o código de fábrica). Sin tienda elegida o si la base no responde, sigue
     sirviendo lo que la hoja reconoce y el nombre.
   - **Prendas de la oferta:** un **mosaico compacto** (tres fichas por fila en escritorio, una en el celular), la última agregada primero (con un
     filo verde): foto, nombre, precio · colores y su ✕. Se ven seis; «Ver las N» abre un cuadro que se desliza por dentro, así que la fase mide lo
     mismo con 6 prendas que con 60. **Quitar:** la ✕ de la ficha; «Deshacer» recién agregada; tocar varias fichas las marca y «Quitar N marcadas»
     las saca juntas; «Quitar todas»; o buscarla arriba y tocar «Quitar» en su sugerencia (Enter nunca quita: toma la primera que aún no está).
     Hubo dos versiones antes, las dos devueltas por Felipe al verlas: fichas color hueso, una por prenda y una por categoría («está horrible», «ese
     beige desentona», «cuando hay muchas cosas se ve totalmente desordenado»), y una lista de una prenda por fila («si son varias se hará enorme»).
   - **Una categoría o insignia entera:** dos tarjetas lado a lado que se tocan enteras, con el ícono sobre el ahumado denso, lo que llevan dicho
     **en una línea** («Camisas y Blusas, Casacas, Faldas y 39 más», `resumirNombres`) y «Elegir» / «Cambiar» / «Listo»; la lista de la elegida se
     abre debajo, a todo el ancho. Antes eran dos filas anchas: Felipe pidió que fueran «más notorias» y que usaran mejor el espacio. Las categorías van como píldoras de
     44 px dentro de una tarjeta por familia, con su casilla y cuántas prendas trae; la marcada lleva borde de tinta. Al pie, el total que alcanza
     la oferta. «Elegir todas», «Quitar todas» y «Otro escalón» pasan del botón sutil al secundario (con borde).
   - **Sale «Ver todas las prendas»** (la lista completa con casillas): Felipe, «es completamente innecesario porque de todas maneras se va a
     buscar por prenda arriba».
   - «¿Se pueden mezclar?» y las prendas de Claurè quedan al final de la fase.

**Descartado:**
- **Preguntar «solo esta talla o todo el modelo» al leer** (como en un descuento): hoy una oferta elige modelos enteros
  (`retail.campana_regla_productos`); preguntar algo que la base no puede guardar sería prometer de más. **Felipe lo pidió después** («poder aplicar a
  una variante en concreto de una prenda»): necesita una tabla nueva, cambiar qué prendas alcanza una oferta en la base y en la caja, los choques
  entre ofertas y la tienda web. Es una decisión de Felipe y un trabajo aparte (backlog): no se construyó aquí. **Hecho después, en ADR-0682** (leer una
  etiqueta agrega su color con todas sus tallas).
- **Cambiar el botón sutil (`btn-sutil`) en todo el ERP:** es la pieza decidida para una acción chica dentro de una hoja (ADR-0358, ronda 9). Aquí
  se usa el secundario solo dentro de esta hoja; si el sutil debe cambiar en todas, lo decide Felipe con `/unificar` (backlog).
- **Cambiar `<PaginaEstable>` o `pie-hoja-fijo` para todo el ERP en este cambio:** el choque entre la reserva y el pie pegado puede pasar en
  cualquier hoja con pie fijo cuyo contenido se acorta; arreglarlo ahí toca dos piezas del sistema (y a Dynamic). Queda propuesto aparte (backlog).
- **Dejar «En caja» en una columna a la derecha:** con ella, el centro de lo que se mira no era el centro de la hoja y los números quedaban a un lado.
- **Agrandar la hoja única sin fases:** con los números en 68 px y cada control en 44, la hoja única quedaba todavía más larga, justo lo que
  Felipe pidió evitar.
- **El atajo «Listo, guardar con lo demás de fábrica» en una oferta nueva** (lo tenía la hoja por pasos de ADR-0655): un botón más en cada fase; en
  una nueva se recorren las cuatro, que son cortas. Al editar sí hay atajo (punto 2).
- **Un tamaño «grande» nuevo para las píldoras, el segmento y las categorías en todo el ERP:** es una decisión de `/unificar`; aquí crecen solo
  dentro de la hoja. Queda como pendiente de Felipe (backlog).

**Verificado (el punto 8, en el navegador, en claro):** a 1280 y a 375 px, sobre una base local con prendas: por nombre sugiere con foto y Enter
agrega; un código escrito como lo hace la pistola agrega su modelo; dos códigos seguidos entran los dos; un código que no existe lo dice en ámbar;
las fichas se quitan; el panel de categorías abre con sus píldoras; nada se sale de la hoja a 375. **No verificado:** la cámara leyendo una etiqueta
de verdad (la tienda local no tiene cámara) y una pistola física. **Verificado (el punto 7, midiendo el DOM):** a 375×812, 700×900, 824×990, 1024×768 y 1280×600, con las cinco formas, tres escalones, las cuatro
fases y el caso de Felipe (monto con tres escalones, bajar y volver a «3 x 2»): la hoja mide lo mismo en todos los estados de cada tamaño, el pie
queda siempre al fondo y nunca sobre el contenido, nada se sale de la hoja y las fases van en una fila. **Verificado (el punto 6, solo en claro):** las cuatro fases a 1440 y a 375 px, sin nada fuera de la hoja; en el celular las fases son cuatro
números en una fila y el pie queda en dos filas. **Verificado (lo anterior):** en el navegador a 1440 px (claro y oscuro) y a 375 px (nada se sale de la hoja; cada palabra baja con su número), las cinco formas,
las cuatro fases de una oferta nueva y el modo editar; tipos, lint, las 954 pruebas de la web y Knip en verde; guía de Campañas al día (un paso
nuevo, «Las cuatro fases», y cada paso lleva a su fase) con sus dos huellas aceptadas. **No verificado:** `guias:recorrer` y guardar de punta a
punta (la base local compartida no tiene `guardar_oferta_completa`: está atrás de `main`), y «Nuevo descuento» en el navegador (ninguna base local
trae la lista de descuentos). **Dynamic:** no cambia `vidrio/recetas.css` ni `components/ui/`: no le llega nada.
