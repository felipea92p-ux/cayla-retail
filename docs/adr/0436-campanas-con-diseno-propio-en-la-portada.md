# ADR-0436 — Tienda web ▸ Campañas: cada campaña con su diseño en la portada, y una sola regla de cuál sale

- **Fecha:** 2026-10-17 · **Estado:** aceptado (Felipe aprobó las maquetas, «implementa todo tal cual», y la lista de 9 actividades).
  Se construye actividad por actividad (`/construir`); este ADR crece con cada una. **Nada está en producción**: cada migración se pega con
  su OK.
- **Rama:** `claude/campanas-design-customization-ddbd90`.
- **Maqueta:** `docs/maquetas/campanas-diseno-2026-10/` (con sus decisiones del 2026-10-17).
- **Relacionados:** ADR-0408 (la tienda online y su portada), ADR-0430 (el grupo «Tienda web»), ADR-0107/0108/0302/0403 (la etiqueta de
  campaña, su descuento en caja y cómo se redondea), ADR-0293 (quién configura una campaña hoy), ADR-0161 y ADR-0306 (módulos y roles).

## El problema

Felipe: «quiero que el diseño de las campañas se pueda personalizar desde algún apartado dentro del módulo de Tienda Web, ya que ahora
siempre es el mismo fondo para todos […] que cualquier colaboradora pueda exprimir su creatividad». Hoy la portada de la tienda online pinta
toda campaña con los mismos colores fijos de `apps/tienda/app/globals.css` (`--t-hero: #6a2118`), y la regla de qué campaña anuncia vive
escondida dentro de `retail.tienda_portada()`: con tres campañas que se cruzan en octubre, nadie en el ERP podía saber cuál salía.

**Analogía CAYLA:** la vitrina de la calle tiene un solo fondo rojo pintado en la pared, y cada fecha especial se anuncia con el mismo
cartel. Lo que se construye es la caja de telones de la vitrina —uno por campaña— y el calendario colgado al lado que dice qué telón va
cada semana.

## Decisiones de Felipe (2026-10-17)

1. **Dónde vive:** «Campañas» es una pantalla del grupo «Tienda web» (ADR-0430 ya lo había creado: entra como su sexta hija, después de
   Vitrina, en el tope de 6).
2. **Una campaña sin descuento sale en la portada** si tiene prendas o diseño propio; con dos a la vez, la de descuento primero, salvo
   que se cambie a mano (actividad 6).
3. **Una sola llave, como hoy:** quien ve Campañas la diseña y le pone el descuento (se descartó separar el diseño del descuento).

## Actividad 1 — El módulo, la regla de la portada en un solo lugar y la lista (`20261017144000`)

**DECIDÍ 1 — El módulo `campanas`, sexta hija de Tienda web, nace solo para el líder.** Es una entrada del menú, así que es un módulo
(ADR-0306), y todo módulo nuevo nace sin rol (ADR-0161).
**DESCARTÉ** reusar el módulo `etiquetas`, que hoy configura las campañas: ese módulo también abre las etiquetas que no son campaña (Para
liquidar, Estreno) en Atributos, y un módulo con dos pantallas en dos grupos del menú es justo lo que ADR-0306 prohíbe.
**SE ROMPE SI** nadie le da el módulo a quien hoy configura campañas: en producción, el 2026-10-17, «Terminal Almacén» y «Terminal de
ventas» tienen Etiquetas. Desde la actividad 2 configurar una campaña pide Campañas, así que esas terminales lo pierden hasta que el líder
se lo dé en Roles y accesos (se le avisa a Felipe al publicar).

**DECIDÍ 2 — LA regla de qué campaña anuncia la portada vive una sola vez, en `retail.fn_campana_en_portada(dia)`.** `tienda_portada()`
la pregunta por hoy y `campanas_portada_dias(desde, hasta)` día por día para el ERP. La regla es la de siempre, copiada tal cual (verificada
igual en producción el 2026-10-17): aprobada, activa, con descuento, vigente ese día y con prendas o categorías; la que termina primero, luego
la de mayor descuento, luego por nombre. La migración comprueba al final que la tienda ve hoy exactamente lo mismo que antes.
**DESCARTÉ** repetir la regla en TypeScript para dibujar la línea del ERP: el día que cambie (la actividad 6 la cambia) habría dos reglas,
y el ERP podría decir «sale el Gato» mientras la tienda muestra otra cosa.
**SE ROMPE SI** alguien vuelve a pegar `20261014220000` (la tienda online) después de esta: `tienda_portada()` vuelve a tener la regla
adentro. Hoy da lo mismo; cuando la actividad 6 cambie la regla, esa migración llevará su candado.

**DECIDÍ 3 — La pantalla solo mira:** las cifras de hoy (qué anuncia la portada, cuántas corren, cuál viene), la línea «La portada, día a
día» de tres meses y las campañas con un filtro. Mientras ninguna tenga diseño, su portada en chico usa los colores de siempre (son un dato
de la portada, `data-color-dato`, no del tema). La configuración sigue en Atributos hasta la actividad 2, y la pantalla lo dice con su
enlace.

**Verificación:** `pnpm pruebas:campanas-portada` (25 casos: la regla día por día, los empates, la tienda pregunta lo mismo, la lista, quién
la lee y la migración dos veces); en el navegador, el líder la ve y una colaboradora sin el módulo cae en «Tu rol no ve "Campañas"»; modo
oscuro y 375 px sin desborde; la guía recorre sus 8 pasos en escritorio y celular. Las suites `tienda_puerta` e `tienda_inicio` pasan sus
casos de la regla; sus casos «como tienda_web» no corren en la imagen local `supabase/postgres:17.6.1.143`, que se cae con
`grant tienda_web to current_user with set true` aunque sea lo único de la transacción (no es de esta rama).

## Actividad 2 — Datos y Prendas, mudados de Atributos, con una sola llave (`20261017151000`)

**DECIDÍ 4 — La llave de cada etiqueta la decide una sola pregunta, `fn_puede_tocar_etiqueta(id)`: una campaña pide Campañas; cualquier
otra etiqueta, Etiquetas.** Ya la hacían `actualizar_campana_etiqueta` y `etiquetar_variantes` por cada etiqueta; ahora mira el estilo.
Con eso, el disparador del alta (`fn_etiquetas_estado_trigger`) aprueba una campaña nueva si quien la crea tiene Campañas, y
`etiquetar_variantes` deja entrar con cualquiera de las dos llaves (cada etiqueta se sigue mirando con la suya). Los cuatro cambios son
reemplazos anclados sobre los cuerpos verificados iguales en producción el 2026-10-17.
**DESCARTÉ** funciones nuevas que copiaran lo que hacen `actualizar_campana_etiqueta` y `etiquetar_variantes` solo para Campañas: dos
caminos para escribir lo mismo (el descuento de una campaña), y el día que uno cambie, el otro queda atrás.
**SE ROMPE SI** alguien cambia el estilo de una etiqueta de «campaña» a otro (o al revés): su llave cambia con él. Hoy el estilo no se cambia
desde ninguna pantalla.

**DECIDÍ 5 — Cuatro funciones de la pantalla, todas con `fn_puede_campanas()`:** `campana_detalle`, `crear_campana`, `guardar_campana`
(el nombre aquí y lo demás por `actualizar_campana_etiqueta`, todo o nada, con la fila tomada para que dos personas se turnen) y
`activar_campana` (la misma regla de Atributos: no se desactiva con prendas a mano).
**DESCARTÉ** seguir guardando por la API de Atributos (`/api/productos/etiquetas`): pide el permiso de Etiquetas y guarda el nombre y la
configuración en dos llamadas, que pueden quedar a medias.

**DECIDÍ 6 — Un solo formulario de campaña: `CamposDeCampana`** (descuento, fechas, categorías), que usan la pestaña Datos y la ventana
«Campaña» de Atributos, que se queda para las etiquetas con descuento que no son campaña (Para liquidar, Estreno). Se separó primero sin
cambiar nada (commit de refactor) y después se usó; al usarlo se vio que el título «Fechas» ocupaba una columna de la cuadrícula y bajaba
«Hasta» a otra fila, y se corrigió en la pieza (los dos lugares lo heredan).

**Verificación:** `pnpm pruebas:campanas-llave` (26 casos: la llave de cada etiqueta en las cuatro combinaciones, el alta aprobada,
crear con sus reglas de nombre y fechas, guardar todo o nada, activar y el detalle); `terminales_por_tienda` en verde con el mensaje nuevo;
en el navegador, el Gato pasó de −10 % a −15 % desde su pestaña Datos y quedó así en la base, «Nueva campaña» creó «Día del Abuelo» aprobada
con sus fechas y llevó a ella, el ejemplo del nombre propuso «Cyber Days» (la próxima fecha que no existe) y Atributos ▸ Etiquetas ya no
muestra Halloween pero sí Para liquidar; las guías recorren sus pasos en escritorio y a 375 px.

## Actividad 3 — La portada en una sola pieza (`packages/portada`), sin cambio visible

**DECIDÍ 7 — El héroe de la portada vive en un paquete, `@cayla-retail/portada`, que usan la tienda y (desde la actividad 4) el ERP.**
Trae la estructura (`HeroeDePortada`: ceja, nombre en dos partes, descripción, contador, botones, polaroids y el descuento calado), sus
estilos (`heroe.css`, movidos tal cual desde `apps/tienda/app/globals.css` y `estilos/collage.css`) y el modelo de colores (`PALETAS`, la
aritmética del contraste y `variablesDePaleta`, que escribe las seis `--t-hero*` que el héroe ya leía). Lo que cambia de un lugar a otro
llega de afuera: el colibrí (una imagen de Next), el contador (un reloj que corre), los botones y cómo lleva cada polaroid a su prenda
(`Enlace`). La tienda arma sus polaroids con `piezasDelHeroe` (la foto optimizada o la silueta de su categoría) y la ceja con
`CejaDeCampana`, que antes estaba escrita dos veces (portada e Inicio).
**DESCARTÉ** copiar el héroe en el ERP para la vista previa: es exactamente el problema que esta pantalla viene a resolver (lo que se ve en el
ERP y lo que ve el cliente se separan el primer día que alguien toca uno solo). **DESCARTÉ** también meter la tienda en un marco dentro del
ERP: no puede mostrar un diseño sin publicar sin guardarlo antes en la base, y su `frame-ancestors 'none'` lo prohíbe a propósito.
**SE ROMPE SI** alguien vuelve a escribir reglas `.t-hero*` en los estilos de la tienda en vez de en el paquete: habría dos dueños del mismo
héroe y la vista previa dejaría de ser la portada. Y si alguien cambia los `--t-hero*` de la tienda sin cambiar la paleta «Rojo CAYLA»: lo
detiene `apps/tienda/lib/heroe.test.ts`, que exige que sean iguales en claro y en oscuro.

Lo que el paquete pide de quien lo usa está escrito al principio de `heroe.css`: los colores, `--serif`, `--ease`, el papel de la
polaroid y un contenedor llamado `tienda` (el héroe cambia de forma a los 960 px de ese contenedor, no de la pantalla: así la vista previa
del celular en el ERP se acomoda como un celular). Las catorce paletas de la maqueta pasan el contraste de texto chico (4,5) en claro y en
oscuro: letra sobre los dos tonos del fondo, acento y descripción sobre el fondo (`paletas.test.ts`, 28 casos).

**Verificación (sin cambio visible):** capturas de la portada sin cuenta y del Inicio con cuenta, antes y después, a 1440 px en claro y
en oscuro y a 375 px, comparadas píxel por píxel. El Inicio sale idéntico (diferencia máxima 1 de 255, el redondeo de pasar
`rgba(246, 239, 230, .86)` a `color-mix`); la portada también, salvo el suavizado de los bordes del colibrí (unos 100 píxeles, que cambian
entre corridas según cuándo el navegador decodifica la imagen: con el código de antes también). Una primera versión del paquete apagaba
las animaciones con `animation: none` bajo `prefers-reduced-motion` y cambiaba el suavizado de los bordes de las polaroids: ahora las acorta,
como la regla general de la tienda. `next build` de la tienda pasa; el lockfile solo suma el paquete (sin re-resolver lo demás).

## Actividad 4 — Diseñar y publicar: borrador, publicado y anterior (`20261017160000`)

**DECIDÍ 8 — El diseño vive aparte de la etiqueta, en `retail.campana_disenos`: por campaña, a lo más UN borrador, UN publicado y UN
anterior (índices únicos parciales), y lo que sale de ahí queda «archivado», nunca se borra.** Cada opción sale de una lista curada (los
`check` de la tabla son las listas de `packages/portada`, y `campana-diseno.test.ts` exige que coincidan), y la base cierra los estados
imposibles: una paleta propia sin sus colores, colores sueltos en una paleta curada, una frase de más de 60 letras, más de 4 prendas, un
publicado sin fecha de publicación.
**DESCARTÉ** columnas del diseño en `retail.etiquetas`: el diseño no es el descuento (Vender y Atributos leerían una fila que cambia a cada
toque), un borrador en la misma fila que lo publicado obliga a elegir cuál ve el cliente, y sin el diseño anterior guardado «Volver al
anterior» no existiría.
**SE ROMPE SI** dos personas prueban el diseño de la misma campaña a la vez: la versión del borrador hace que la segunda no pise a la
primera (`diseno_cambiado`), pero su último cambio no se guarda; la pantalla lo dice y «Ver el último» trae el de la otra.

**DECIDÍ 9 — Cada toque se guarda solo, como borrador (`guardar_diseno_borrador`, 450 ms después del último toque y sin el loader), suelto
del combo «Responsable» (`campana_diseno_borrador`); publicar (`publicar_diseno_campana`) y volver al anterior
(`volver_al_diseno_anterior`) sí piden quién.** La web sigue mostrando lo publicado hasta que alguien publica. Publicar guarda antes lo
último que se tocó y publica ESA versión: si otra persona cambió el borrador en el medio, la base no publica y lo dice.
**DESCARTÉ** un botón «Guardar borrador»: la maqueta aprobada lo guarda solo, y quien prueba siete estilos y se va a almorzar pierde todo si
se olvida. **DESCARTÉ** también firmar cada toque: el combo a cada toque detiene a quien prueba, y un borrador no lo ve ningún cliente.
**SE ROMPE SI** el internet se corta mientras se prueba: el borrador deja de guardarse (la pantalla lo dice: «No se pudo guardar el
borrador»), lo publicado no cambia, y el próximo toque lo vuelve a intentar.

**DECIDÍ 10 — Si la letra se lee lo mide una sola regla, `revisarDiseno` (`packages/portada/src/revision.ts`): el ERP apaga «Publicar» si no
se lee en claro o en oscuro, y la tienda no pintará un diseño que no se lea (actividad 5).**
**DESCARTÉ** repetir la medida del contraste en SQL: serían dos reglas que un día dirían cosas distintas.
**SE ROMPE SI** alguien cambia la fórmula del contraste solo en un lado (no puede: hay uno solo) o publica por fuera del ERP (no hay otra
puerta: la tabla solo se escribe por estas funciones).

**DECIDÍ 11 — Una campaña abre en su «Diseño en la web» (la pestaña de la maqueta, la tercera); Datos y Prendas van por la URL
(`?pestana=datos`). «Nueva campaña» lleva a sus Datos**, porque una campaña recién creada todavía no tiene descuento ni prendas. Las
variantes y su costo (el aviso de «por debajo del costo») se leen solo en Datos y Prendas. «Después sale», en la hoja Publicar, lo dice la
base (`campanas_portada_dias` del día después de que termina), no la pantalla. Al publicar o volver al anterior, el editor se vuelve a
armar con lo guardado (`claveDelEstado`), así nunca guarda encima con una versión vieja.

**DECIDÍ 12 — La lista y la línea muestran la portada de verdad: la miniatura es la misma pieza de la tienda (`Lienzo` + `PortadaDeCampana`,
con su diseño publicado), cada barra de «La portada, día a día» lleva sus colores (punteada si todavía sale con el rojo de siempre), y la
insignia «Diseño de siempre» / «Borrador» la decide `disenoDeLaLista`, que es la misma pregunta del editor (`estadoDelBorrador`).** Por eso
`campanas_lista` devuelve el borrador entero (antes, un sí o no) y las prendas con su categoría y su color (la miniatura sin foto dibuja la
categoría, ADR-0333). `PortadaMini` y `PORTADA_DE_SIEMPRE` (la portada en chico con los colores fijos) se borraron.
**DESCARTÉ** que la base dijera si hay borrador: un borrador igual a lo publicado se veía como «Borrador», y compararlos en SQL sería otra
regla de «igual» al lado de `mismoDiseno`.
**SE ROMPE SI** la lista crece a cientos de campañas: cada tarjeta dibuja una portada entera (hoy son 14; a 100, conviene paginar la lista).

**Lo que se apartó de la maqueta, a propósito:** la cuarta cifra «Sin diseño propio» no entró: con los nombres reales («Día Internacional
del Gato») cortaba la cifra que importa, «En la portada hoy»; cada tarjeta ya dice «Diseño de siempre» y la línea la puntea. El editor pasa a
dos columnas desde un contenedor de 840 px (un laptop de 1280 con el lateral abierto), para ver cada toque sin bajar. Los pasos 3 a 7, «Deshacer»
y «Sorpréndeme» son de la actividad 7: hasta entonces, un estilo con otro fondo o acomodo (Huellitas, Galería) solo cambia los colores.

**Verificación:** `pnpm pruebas:campanas-diseno` (44 casos: los estados imposibles, guardar con su versión, publicar, volver al anterior,
la lista con el borrador y las prendas con su categoría, quién y la migración dos veces), `campanas-portada` (25) y las pruebas de
`campana-diseno.ts` y `campanas-reglas.ts`. En el navegador, en la pila propia, con Día Internacional del Gato: elegir «Huellitas» guardó el
borrador (versión 1); «Publicar diseño» lo publicó a nombre de Felipe y la pantalla dijo «Es el diseño que ve el cliente hoy»; otro estilo y
«Volver al anterior» dejaron el publicado como anterior y la portada de siempre, y el siguiente toque guardó la versión 2 sin choque. La lista,
Datos y el diseño en 1440 px claro y oscuro y a 375 px, sin desborde ni errores de consola. Las guías de la lista (10 pasos) y de la campaña
(13) recorren en escritorio y a 375 px en oscuro sin escribir en la base (el piloto no toca un estilo ni un color: cada toque guarda).
