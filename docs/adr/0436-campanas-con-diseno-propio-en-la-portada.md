# ADR-0436 — Tienda web ▸ Campañas: cada campaña con su diseño en la portada, y una sola regla de cuál sale

- **Fecha:** 2026-10-17 · **Estado:** aceptado (Felipe aprobó las maquetas, «implementa todo tal cual», y la lista de 9 actividades).
  Se construye actividad por actividad (`/construir`); este ADR crece con cada una. Cada migración se pega con su OK: lo que ya está
  en producción, en «Lo pegado en producción», al final.
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
y «Sorpréndeme» son de la actividad 7: hasta entonces, un estilo con otro fondo o acomodo (Huellitas, Galería) solo cambia los colores
(hechos: «Actividad 7», al final).

**Verificación:** `pnpm pruebas:campanas-diseno` (44 casos: los estados imposibles, guardar con su versión, publicar, volver al anterior,
la lista con el borrador y las prendas con su categoría, quién y la migración dos veces), `campanas-portada` (25) y las pruebas de
`campana-diseno.ts` y `campanas-reglas.ts`. En el navegador, en la pila propia, con Día Internacional del Gato: elegir «Huellitas» guardó el
borrador (versión 1); «Publicar diseño» lo publicó a nombre de Felipe y la pantalla dijo «Es el diseño que ve el cliente hoy»; otro estilo y
«Volver al anterior» dejaron el publicado como anterior y la portada de siempre, y el siguiente toque guardó la versión 2 sin choque. La lista,
Datos y el diseño en 1440 px claro y oscuro y a 375 px, sin desborde ni errores de consola. Las guías de la lista (10 pasos) y de la campaña
(13) recorren en escritorio y a 375 px en oscuro sin escribir en la base (el piloto no toca un estilo ni un color: cada toque guarda).

## Actividad 5 — La tienda pinta el diseño publicado (`20261017200000`)

**DECIDÍ 13 — `tienda_portada()` trae, dentro de la campaña que sale, su diseño PUBLICADO (`fn_diseno_json`, la misma forma que lee el
ERP; null sin uno).** Cuál campaña sale no cambia: sigue siendo LA regla `fn_campana_en_portada`. Un borrador nunca llega al cliente. La
migración comprueba al final que, sin contar el diseño, la tienda ve lo mismo que antes; por eso la de la actividad 1 (`20261017144000`)
ahora compara sin el diseño: pegarla otra vez después le quita el diseño a la tienda (sale el rojo de siempre) hasta volver a pegar esta.
**DESCARTÉ** una función aparte para el diseño: la tienda haría dos preguntas que pueden responder campañas distintas si la regla cambia
entre una y otra (la actividad 6 la cambia).
**SE ROMPE SI** se pega `20261017200000` en producción sin `20261017160000`: la función no encuentra `campana_disenos` y el pegado falla
entero (no se aplica nada: el orden es 144000 → 151000 → 160000 → 200000).

**DECIDÍ 14 — La tienda pinta un diseño solo si pasa `disenoParaPintar` (`packages/portada/src/revision.ts`): que esta versión lo sepa
leer (`leerDiseno`) y que la letra se lea en claro y en oscuro (`seLee`, la misma medida que apaga «Publicar» en el ERP).** Si no, `null`
y la portada sale con el rojo de siempre; nunca tumba la campaña (la validación de `lib/portada.ts` lo transforma, no lo rechaza).
**DESCARTÉ** confiar en que el ERP ya lo revisó: un diseño guardado por un ERP más nuevo (una opción que esta tienda no conoce) o publicado
antes de un cambio de la regla del contraste llegaría igual, y el primer cliente lo vería roto.
**SE ROMPE SI** se cambia `seLee` para que sea más estricto: un diseño que ya estaba publicado deja de pintarse en la tienda (sale el rojo)
mientras el ERP lo sigue mostrando como publicado. Se ve en la revisión del editor, que lo marca en rojo.

**DECIDÍ 15 — La tienda no sabe en el servidor si el cliente la ve en claro o en oscuro, así que el héroe lleva los colores del diseño en
los dos temas (`variablesDeLosDosTemas`: `--t-dia*` y `--t-noche*`) y `heroe.css` elige con el tema de la tienda (`prefers-color-scheme` o
`:root[data-theme]`, como sus tokens).** La vista previa del ERP sigue pasando `tema` (lo elige con su botón) y recibe los colores ya
resueltos: el modo oscuro del ERP nunca cambia la portada que se diseña. La mezcla vive en el paquete, no en la tienda (DECIDÍ 7: el héroe
tiene un solo dueño), y `diseno.test.ts` exige que cada variable del héroe tenga su par de día y de noche en los tres bloques.
**DESCARTÉ** un `<style>` armado con los colores de la base: sería CSS escrito desde datos (aunque los colores vengan revisados) y dejaría
de funcionar el día que la tienda prohíba los estilos en línea; las variables en el atributo `style` ya las usaba el héroe.

Lo demás del diseño que el héroe ya sabe hacer llega igual a la tienda: el colibrí (Galería lo apaga), el contador y desde qué palabra va
la cursiva. Lo que todavía no dibuja (el fondo con dibujo, los acomodos, la frase, el sello, el % gigante) es de la actividad 7, y llegará a
los dos lados a la vez porque es la misma pieza (llegó: DECIDÍ 25).

**Verificación:** `pnpm pruebas:campanas-diseno` (49: suma la tienda —sin diseño sale vacío, un borrador no llega, al publicar llega y
un borrador nuevo encima no lo cambia— y las dos migraciones pegadas dos veces), `campanas-portada` (25) y `campanas-llave` (26); las pruebas
del paquete (107: `disenoParaPintar`, las variables de los dos temas y su paso en `heroe.css`) y de la tienda (`interpretarPortada` con
diseño, sin él, con uno que no se sabe leer). En la tienda local (3048), con Día Internacional del Gato publicado desde el ERP: antes, el
rojo de siempre; con «Bosque», verde en claro y más oscuro en oscuro, también a 375 px; con «Galería» (una paleta clara), letra y botón
oscuros y sin colibrí en claro, y su versión de noche en oscuro; el Inicio con cuenta, igual. La portada cambió en menos de un minuto
después de publicar.

## Actividad 6 — Campañas sin descuento y cuál va primero (6a: `20261017204000`)

Felipe, al preguntarle cómo se cambia «a mano» qué campaña va primero (2026-10-17): «Si hay dos campañas activas, eso debe convertirse en
un carrusel que va deslizándose cada ciertos segundos». La actividad se parte en dos cortes: **6a**, una campaña sin descuento sale en la
portada (una sola, la de descuento primero), y **6b**, el carrusel cuando corre más de una.

**DECIDÍ 16 — LA regla (`fn_campana_en_portada`) suma las campañas sin descuento: sale la aprobada, activa y vigente con prendas o
categorías o, si no tiene descuento, con su diseño publicado; primero las de descuento y después, como siempre, la que termina primero,
la de mayor descuento y el nombre** (decisión 2 de Felipe). Una campaña CON descuento y sin prendas sigue sin salir: anunciaría
«−N % en prendas elegidas» sin ninguna. La caja no cambia: esto solo decide qué anuncia la portada.
**DESCARTÉ** un botón «Poner primero» o un orden a mano: Felipe eligió el carrusel (6b), y en él todas salen.
**SE ROMPE SI** se diseña y publica una campaña sin fechas ni descuento «para probar»: sale en la portada y no se quita sola (la hoja
«Publicar» lo dice: «Se quita sola: cuando la apagues»).

**DECIDÍ 17 — Para mostrar las prendas de una campaña sin descuento (no bajan de precio, no salen en «Ofertas»), `tienda_portada()` manda
el `id` de la campaña y sus modelos (`fn_modelos_de_campana`: los que lleva a mano y los de sus categorías, sin los descontinuados, hasta
200); el héroe toma los que se ven en la tienda, y «Ver la campaña» lleva a una lista nueva del catálogo, `?lista=campana`, con esos
modelos.** Las de descuento siguen como antes (sus prendas en oferta y sus «Ofertas»), para no mezclar el precio de una campaña con las
prendas de otra.
**DESCARTÉ** sumar a cada prenda del catálogo todas sus campañas (`tienda_catalogo`): es la lectura más pesada de la tienda y la que dice el
precio; para una lista que solo se abre desde el héroe bastan los modelos de la campaña que ya lee la portada.
**SE ROMPE SI** una campaña sin descuento lleva más de 200 modelos (una categoría entera muy grande): su lista muestra 200.

**DECIDÍ 18 — Sin prendas a la vista, una campaña SIN descuento sale igual si tiene su diseño publicado: su texto, su diseño y la tarjeta del
Club, y en el Inicio el botón lleva a «Lo nuevo» (o a toda la tienda), nunca a una lista vacía** (Felipe 2026-10-17: «sí, sin fotos»). Una
CON descuento sin prendas a la vista sigue la regla del 15-oct: sale «Lo nuevo» (anunciaría un descuento sin mostrar en qué).
**SE ROMPE SI** el texto del Inicio («Sepáralas online…») se lee raro sin prendas: con fotos se entiende; sin ellas, la frase invita a
separar algo que no se ve. Si molesta, la actividad 7 (el texto propio) le da otra frase (ya puede: «El texto ▸ Tu frase»).

La franja de arriba y la frase en negrita del héroe salen de una sola pieza del paquete (`anuncioDeCampana`, `destacadoDeCampana`): «Navidad
· mira lo que elegimos» y «Prendas elegidas para Navidad.», iguales en la tienda y en la vista previa del ERP. En el ERP, «por qué no sale»
ya no dice «no tiene descuento»: dice que le faltan prendas (o prendas y diseño, sin descuento), o qué campaña sale hoy.

**Migraciones viejas pegadas otra vez:** las comprobaciones de `20261017144000` y `20261017200000` comparan qué campaña se anuncia (nombre, %
y fin), no la forma de la respuesta, porque las que siguen le suman campos y las suites las vuelven a pegar sobre la base final.

**Verificación (6a):** `pnpm pruebas:campanas-portada` (33: la regla con las sin descuento —la de descuento primero aunque otra termine
antes, sin descuento con prendas o con solo su diseño, con descuento y sin prendas no—, `tienda_portada` con su id y sus modelos, y las dos
migraciones pegadas dos veces), `campanas-diseno` (49) y `campanas-llave` (26); el paquete (109) y la tienda (`heroDelInicio`, la lista de la
campaña, `interpretarPortada` sin descuento). En la tienda local, con el Gato terminado a mano en la pila propia: Halloween, sin descuento,
sale con sus prendas y sin «−%», y «Ver la campaña» abre «Campaña · Halloween» con sus 4 prendas a precio normal; con Navidad traída a hoy,
sin prendas y con su diseño publicado desde el ERP, sale en verde con la tarjeta del Club y el Inicio (375 px, oscuro) ofrece «Ver lo nuevo».
En el ERP, la lista dice «En la web ahora» en Halloween. Las fechas se devolvieron después.

### 6b — El carrusel (`20261017210000`)

**DECIDÍ 19 — LA regla devuelve TODAS las campañas que salen ese día, en orden (`fn_campanas_en_portada`: la de descuento primero, luego
la que termina primero, la de mayor descuento y el nombre), y `fn_campana_en_portada` pasa a ser su primera: una sola regla.**
`tienda_portada()` suma `campanas` y mantiene `campana` (la primera), y `campanas_portada_dias` suma `campanas` por día y mantiene `campana`:
una tienda o un ERP que todavía no se publicaron con el carrusel siguen mostrando la primera, como antes.
**DESCARTÉ** que la tienda arme la lista con varias preguntas a la base (una por campaña): la regla viviría a medias en la tienda.
**SE ROMPE SI** se vuelve a pegar `20261017144000` o `20261017204000` después de esta: la regla vuelve a ser de UNA campaña hasta pegar esta
otra vez (la tienda muestra solo la primera, sin romperse).

**DECIDÍ 20 — Con más de una campaña, la portada y el Inicio las pasan en carrusel (`components/CarruselDePortada.tsx`): una por diapositiva,
deslizándose cada 7 segundos, en el orden de la base. Se detiene con el mouse encima, con el foco adentro o con su botón de pausa (WCAG
2.2.2), y con `prefers-reduced-motion` no se mueve solo (se pasa con los puntos).** Cada diapositiva es el héroe de siempre
(`HeroeDePortada`), con sus prendas, su texto y su diseño; las que no se ven no las lee el lector ni llega el teclado (`inert`). La franja de
arriba suma la frase de cada campaña. Una campaña que la tienda no puede mostrar (sin prendas a la vista ni, sin descuento, diseño) no entra
al carrusel; si ninguna puede, sale «Lo nuevo» o la marca, como antes.
**DESCARTÉ** partir el héroe en dos mitades (las dos campañas a la vez): cada una perdía la mitad de su diseño, y en el celular no cabían.
**SE ROMPE SI** corren cuatro o cinco campañas a la vez: el carrusel tarda medio minuto en dar la vuelta (no tiene tope: un tope escondería
una campaña sin decirlo). Si pasa seguido, se decide un tope con Felipe.

En el ERP, «La portada, día a día» dibuja los días en carrusel con una franja por campaña y sus nombres en una pastilla oscura; la cifra
de hoy dice «2 en carrusel» con sus nombres; la nota del cruce dice en qué orden las pasa; «Después sale», en la hoja Publicar, nombra todas
(«Halloween y Navidad, en carrusel»); y «por qué no sale» ya no dice «hoy la portada muestra otra»: todas las que pueden salir, salen.

**Verificación (6b):** `pnpm pruebas:campanas-portada` (39: suma el carrusel —tres que salen en orden, la tienda las recibe así con la
primera como `campana`, el ERP recibe las del día— y la migración pegada dos veces), `campanas-diseno` (49) y `campanas-llave` (26); el
paquete (109), la tienda (449: `heroesDelInicio`, la lista de la portada con una campaña rara que se salta, la franja con varias) y el ERP
(los días con varias campañas, la forma de antes del carrusel, los tramos). En la tienda local, con el Gato y Halloween a la vez: la
portada abre en el Gato y a los 8 segundos pasa a Halloween; con la pausa se queda; el punto vuelve al Gato; con movimiento reducido no se
mueve; igual en el Inicio con cuenta a 375 px en oscuro; sin desborde ni errores. En el ERP (oscuro), la línea muestra el 1 al 30 de octubre
en carrusel y la cifra «2 en carrusel».

## Lo pegado en producción (2026-10-17)

Felipe: «Ve pegando todas las migraciones necesarias en producción». La sesión que abrió esta rama pegó, ensayando antes cada lote en uno que
se deshizo a propósito, `20261017144000` (registrada como `20261017202815`), `20261017160000` (`20261017202943`), `20261017200000`
(`20261017203014`) y, con su OK aparte («acepto que las terminales no puedan poner prendas en campañas hasta que se publique la web»),
`20261017151000` (`20261017203618`), tal como estaban en el commit `d32f50113`. Verificó en vivo que cada función tiene la huella del repo, que
`tienda_portada()` responde lo de antes (`{"campana": null}`: ese día ninguna campaña tenía descuento), que el módulo existe sin ningún rol y que
`campana_disenos` nació vacía, con RLS y sin políticas.

**DECIDÍ 21 — Esas cuatro quedan CONGELADAS: un cambio va en una migración nueva, nunca en ellas; `campanas-migraciones-pegadas.test.ts`
guarda la huella de cada archivo y falla si cambia; y las suites ya no las vuelven a pegar sobre la base final.** La actividad 6a había
cambiado el bloque de comprobación del final de `144000` y `200000` después de `d32f50113` (para que las suites pudieran volver a pegarlas);
esos dos archivos volvieron a lo pegado, y lo que hacía ese cambio pasó a las suites.
**DESCARTÉ** dejar esos dos bloques cambiados porque las funciones son idénticas: el archivo es el registro de lo que corrió en producción,
y `migraciones:deriva` compara funciones, no comprobaciones, así que la diferencia no la vería nadie.
**SE ROMPE SI** alguien vuelve a pegar una de las cuatro en producción después de `20261017204000` o `20261017210000`: deshace la regla y la
portada nuevas hasta pegar otra vez las que siguen (está escrito en `CONTINUAR.md`).

**Faltan pegar:** `20261017204000` y `20261017210000`, con la web que las lee. Y una más por construir: **la puerta de Editar producto**
(Felipe 2026-10-17). `actualizar_variantes_etiquetas` deja poner o quitar una campaña con Productos o Atributos, sin la llave de Campañas;
se cierra con una migración nueva (cada etiqueta de campaña pasa por `fn_puede_tocar_etiqueta`) que se pega el día que se publique la web,
justo antes de fusionar.

## La puerta de Editar producto (`20261017212000`, se pega el día que se publique la web)

**DECIDÍ 22 — `actualizar_variantes_etiquetas` (lo que guarda Editar producto) pide la llave de Campañas para una campaña: una campaña que la
variante no lleva entra solo con la llave (sin ella, 42501 `campana_sin_llave`, «se hace en Tienda web ▸ Campañas ▸ Prendas»); una que ya
lleva se queda si quien guarda no tiene la llave, aunque la ficha no la mande. Las demás etiquetas, como siempre (Etiquetas o Productos y
Atributos, ADR-0293).** Felipe (2026-10-17): «que la sesión de Campañas construya la migración que cierra la puerta de Editar producto (cada
etiqueta de campaña pide Campañas) y que se pegue el día que se publique la web». Es un parche anclado sobre el tramo que borra y pone (igual en
producción, md5 `ce8f37f3…`, y en el repo, `e9979200…`, que solo difieren en un comentario de arriba). En la web, Editar producto ya no le
ofrece las campañas a quien no tiene el módulo, y una línea bajo las etiquetas le dice dónde se ponen y que las que la prenda tiene se quedan.
**DESCARTÉ** que la ficha sin la llave pudiera quitar una campaña: la ficha de quien no la ve la manda sin ella, y cada guardado sacaría la
prenda de su campaña (y de su descuento en caja) sin que nadie lo pidiera. **DESCARTÉ** también ignorar en silencio una campaña nueva sin la
llave: si llega, alguien la quiso poner; el error le dice dónde se hace.
**SE ROMPE SI** se pega antes que la web: la web publicada todavía ofrece las campañas en la ficha y su guardado de etiquetas fallaría para
las terminales. Por eso va en la casilla 1 del día de publicar, justo antes de fusionar.

**Otra puerta, que decidió Felipe dejar abierta (ver la sección siguiente):** Nuevo producto (`crear_producto_con_variantes`,
`p_etiqueta_ids`) también pone etiquetas y ofrece las campañas a quien da de alta una prenda (Productos, o Recibir al recibir un envío).

**Verificación:** `pnpm pruebas:campanas-llave` (31: suma la ficha con una cuenta con Productos y sin Campañas —no pone una campaña, sí otra
etiqueta, guardar sin la campaña no la quita, guardar con ella no cambia nada, con Campañas la quita y la vuelve a poner— y la migración dos
veces); `historial_prenda`, `roles_por_modulo` y `terminales_por_tienda` en la pila propia (el caso de ADR-0293 de esta última pasa a decir
que la ficha no tiene guardia de descuento y pide la llave solo para una campaña). En el navegador, Editar producto de la Blusa Valentina
(en el Día del Gato): Micaela no ve el grupo de campañas y lee la línea; Felipe ve el Día del Gato.

## Las terminales tienen Campañas (2026-10-17, 16:44 de Lima)

Felipe cambió el rumbo: «Quiero que los terminales de almacén y de tienda puedan editar eso, no lo limites. Ahora incluso no deja editar el
porcentaje de descuento de las campañas y quiero que cambie para que puedan hacer eso.»

**DECIDÍ 23 — Terminal Almacén y Terminal de ventas tienen el módulo «Campañas»: configuran el porcentaje, las fechas y las prendas de una
campaña.** La sesión que abrió esta rama se lo dio en producción a los dos roles (`711464fb…`, versión 20; `15fb08fe…`, versión 37) por SQL,
porque la pantalla de Roles publicada no conoce el módulo, con su fila en `rol_modulos` y en `roles_historial` (el antes y el después,
firmadas por Felipe). No es una migración y no va en el repo (ADR-0161: un módulo nunca se le asigna a un rol desde el código). Probado como
cada una de las 6 terminales: `fn_puede_campanas()` y `fn_puede_tocar_etiqueta(Halloween)` dan `true`. Con eso, la consecuencia aceptada en
DECIDÍ 1 (las terminales perdían la configuración de campañas) ya no corre, y la casilla 3 del día de publicar pasa a «verificar que siguen con
Campañas».
**SE ROMPE SI** alguien guarda uno de esos dos roles desde Colaboradores ▸ Roles y accesos antes de que se publique la web: la pantalla
publicada no conoce la clave `campanas`, no la manda, y `guardar_modulos_rol` borra lo que no viene en la lista; «Campañas» se va sin aviso.
Está escrito en `CONTINUAR.md` y en la casilla 3.

**DECIDÍ 24 — Nuevo producto queda abierto** (Felipe: «no lo limites»): `crear_producto_con_variantes` sigue dejando poner una prenda nueva en
una campaña a quien da de alta, sin pedir Campañas. No se construye ninguna puerta ahí.

**La puerta de Editar producto (`20261017212000`) se queda como se decidió:** ya no frena a las terminales (tienen la llave), y sigue frenando a
cualquier otro rol con Productos o Atributos que no tenga Campañas. Se pega el día de publicar, salvo que Felipe la quiera fuera.

## Actividad 7 — El resto del editor y el héroe que lo dibuja (sin migración)

Felipe (2026-10-17): «Sigue con la 7». Dos cortes: **7a**, el héroe compartido (`packages/portada`, el mismo de la tienda y de la vista previa)
aprende a dibujar todo lo que `retail.campana_disenos` ya guardaba; **7b**, el editor suma los pasos que faltaban. La base no cambia: la tabla, sus
`check` y `guardar_diseno_borrador` (que ya exige que las prendas sean de la campaña) son los de `20261017160000`.

**DECIDÍ 25 — El héroe dibuja el diseño entero con atributos (`data-fondo`, `data-acomodo`, `data-tamano`, `data-largo`) y una sola hoja,
`heroe.css`:** fondo liso (sin degradado ni grano), degradado o con uno de los ocho dibujos y su intensidad; los cuatro acomodos (tres polaroids,
una foto grande hasta el borde con su píldora, un mosaico de cuatro —tres en el celular— con la teja del «−15%» si faltan, solo letras centradas);
la frase bajo el nombre; el % gigante y el sello. El tamaño del nombre sale de su largo (`largoDelNombre`: hasta 12 letras y palabras de hasta 9,
hasta 20 y 11, más), en tres tramos para el celular (60 · 50 · 44 px a 375) y tres para la computadora (116 · 96 · 82 px a 1280), y «Enorme» lo
agranda menos cuanto más largo es (×1,18 · ×1,12 · ×1,06; ×1,3 con solo letras, que tiene todo el ancho). Sin diseño, la portada de siempre;
lo único que cambia también ahí es el tamaño del nombre de una campaña: «Internacional» ya no se mete debajo de las polaroids (lo anotado en la
actividad 4). Los títulos de la tienda sin campaña («Lo nuevo de CAYLA») conservan su tamaño de siempre.
**DESCARTÉ** un tamaño libre (un deslizador de px): cada nombre largo necesitaría que alguien lo pruebe a mano en dos anchos; con tres tramos la
regla se prueba una vez (`textos.test.ts`).
**SE ROMPE SI** una campaña tiene una palabra de 16 letras o más («Internacionalmente»): en el tramo largo, a 82 px, todavía no cabe junto a las
fotos y se monta un poco; una palabra no se parte. Hoy no hay ninguna así.

**DECIDÍ 26 — El dibujo del fondo es una MÁSCARA pintada con el acento (`mascaraDePatron`, `packages/portada/src/patrones.ts`), no una imagen con
el color adentro.** La tienda no sabe en el servidor si el cliente la ve en claro o en oscuro (DECIDÍ 15); la máscara toma `--t-hero-acento`, que
`heroe.css` ya cambia con el tema, así el dibujo de noche sale en el acento de noche sin dibujarlo dos veces. Si un navegador no supiera de
máscaras, el dibujo no sale y queda el degradado (`@supports`), nunca un velo de color encima.
**DESCARTÉ** el SVG con el color escrito, como la maqueta: habría que mandar dos (día y noche) y elegir con CSS, el doble de peso por portada.
**SE ROMPE SI** se suma un dibujo con colores propios (dos tonos): la máscara solo sabe «hay tinta o no hay»; un dibujo así necesita otra pieza.

**DECIDÍ 27 — La portada de siempre trae el % gigante (`DISENO_DE_SIEMPRE.pctGigante = true`): es la que el cliente ya veía, con el «−15%»
calado detrás de las polaroids.** Los estilos que dicen el descuento de otra forma (Huellitas con su sello, Galería y Bosque con la teja del mosaico)
o que lo dejan de lado (Suave, Fiesta) lo apagan, como en la maqueta; ningún estilo ni «Sorpréndeme» dice el descuento dos veces (lo prueban
`diseno.test.ts` y `campana-diseno.test.ts`).
**DESCARTÉ** dejarlo apagado como en la maqueta: publicar el «Clásico CAYLA» sin tocar nada borraba el «−15%» de la tienda, y la vista previa de
una campaña sin diseño mostraba una portada distinta de la que veía el cliente.
**SE ROMPE SI** había un borrador guardado con el «Clásico» antes de este cambio: queda con el % apagado y se ve como «Borrador», no como «de
siempre». En producción no hay ninguno (el editor no está publicado); en la pila local, sí puede.

**DECIDÍ 28 — Las prendas elegidas salen solas y en el orden en que se tocaron (`prendasElegidas`), cada acomodo toma las que le caben
(`piezasQueCaben`: 3 · 1 · 4 · 0), y con solo letras «Ver la campaña» igual lleva a su lista (`conPrendas`).** Si ninguna de las elegidas se puede
mostrar aquí (sin foto publicada, sin stock en la tienda elegida del Inicio), las elige la web (las de foto primero), como antes. En el editor,
tocar una prenda la suma al final y, si ya no cabe, sale la primera (con «Foto grande», tocar otra la cambia); el interruptor «Que las elija la
web» vuelve a dejarlo en sus manos.
**DESCARTÉ** completar con las de la web cuando se eligen menos de las que caben: elegir dos es decir «estas dos».
**SE ROMPE SI** las elegidas no tienen stock en la tienda que el cliente eligió: ve las de la web en esa tienda (bien para el cliente), distintas
de la vista previa del ERP, que no sabe de tiendas. La miniatura de la lista del ERP sale de las tres con foto que manda `campanas_lista`: si las
elegidas no están entre ellas, la miniatura muestra otras (pendiente en el backlog; arreglarlo pide una migración).

**DECIDÍ 29 — Con solo letras, el sello va arriba del texto y centrado, no en una esquina.** En la maqueta iba arriba a la derecha; con «Día
Internacional del Gato» en Enorme, tapaba «del». Arriba del texto nunca choca, con cualquier largo. Con fotos, sigue contra ellas (arriba a la
derecha), como en la maqueta.

**DECIDÍ 30 — «Deshacer» es de la visita (los últimos 30 toques; escribir la frase cuenta como uno) y «Sorpréndeme» arma un diseño al azar
dentro del marco (`sorprendeme`): una paleta curada, un fondo, un dibujo suave o medio, un acomodo (solo letras si no hay prendas), a veces
un sello y a veces el % gigante; deja la frase, las prendas, la cuenta y el colibrí, y la revisión siempre queda en verde.** Cada toque sigue
guardándose como borrador (DECIDÍ 9), y «Deshacer» guarda el de antes del mismo modo.
**DESCARTÉ** un «Deshacer» guardado en la base (el historial de borradores): una tabla más que nadie pidió; lo publicado ya tiene «Volver al
anterior».
**SE ROMPE SI** se recarga la página: lo que se podía deshacer se olvida (el borrador queda como estaba).

Menores, sin decisión de negocio: el sello del editor se elige con cuatro tarjetas que lo dibujan en los colores de la campaña (el segmento no
cabía en el panel); el ejemplo de la frase sigue lo que la campaña tiene (con descuento y fin, «Solo por unos días…»; sin descuento, nunca un
descuento ni un plazo), no su nombre (`sugerirFrase`, `/sugerir`). La polaroid sin foto de la vista previa sigue con la categoría sobre el color
(`SinFoto`, ADR-0333), distinta de la silueta de la tienda: es la regla del ERP; que la vista previa copie a la tienda lo decide Felipe.

**Verificación (7):** el paquete (120 pruebas: el largo del nombre, los ocho dibujos sin color, las prendas por acomodo, el % de siempre y que
ningún estilo diga el descuento dos veces), la tienda (450: el Inicio con prendas elegidas, mosaico, grande y solo letras con su enlace) y el ERP
(los resúmenes de los siete pasos, la cursiva, tocar prendas, «Sorpréndeme» con 300 semillas, el ejemplo de la frase). En la pila propia, con el
diseño publicado del Gato cambiado a mano: Huellitas (dibujo, frase, sello), Cartel (solo letras, Enorme, sello y % al centro), Noche de gala (foto
grande, píldora, % detrás del texto) y Bosque (mosaico con dos elegidas en su orden y la teja del −15 %), en la vista previa y en la tienda real a
1440 y a 375 px, en claro y en oscuro. En el editor: los siete pasos, «Deshacer» (la frase entera de un toque, luego la cursiva),
«Sorpréndeme», las prendas en orden con el borrador guardado en la base; sin desborde a 375 px; contraste de la palabra en cursiva 6,1 a 1 en
oscuro. `guias:recorrer` (14 pasos, escritorio y 375 px en oscuro) antes de aceptar la huella. Knip y las pruebas de tema, unificar y movimiento
en verde.

## Actividad 8 — El fondo con foto (`20261017231000`, se pega el día de publicar)

La cuarta opción de «Fondo» en la maqueta: «Con foto · La que subas». Tres cortes: **8a** la base guarda la foto, **8b** el héroe compartido la
dibuja con su velo y la revisión la mide, **8c** el editor la sube y la oscurece.

**DECIDÍ 31 — La foto vive en un almacén propio, público (`retail-campanas-fotos`, 5 MB, JPG, PNG o WebP), donde sube quien tiene el módulo
Campañas, y el diseño guarda su dirección pública.** La base solo acepta `…/retail-campanas-fotos/fondos/<uuid>.jpg` (el mismo candado que las
fotos de prendas: nadie mete en la portada una imagen de otro sitio), comprueba al guardar que el archivo está en el almacén (`foto_sin_subir`) y
pide su tono. La foto puede quedarse guardada con otro fondo: quien vuelve a «Con foto» no la sube de nuevo, y cambiar de estilo no la pierde.
Ni update ni delete: una foto no se pisa (un diseño anterior puede seguir usándola).
**DESCARTÉ** el almacén de las fotos de prendas (sube quien tiene Productos, otra llave) y uno privado con dirección firmada (la tienda tendría que
firmar en cada visita, y la firma vence).
**SE ROMPE SI** se sube una foto y no se usa (se cambió por otra o nunca se guardó): queda en el almacén sin diseño que la nombre. Nadie la ve;
queda en el backlog por si un día pesa.

**DECIDÍ 32 — Si la letra se lee sobre la foto se mide con su TONO: el promedio de su décima parte más clara (`tonoClaro`), medido por el ERP al
subirla, tapado por el velo donde va la letra.** Ese tono se guarda con el diseño, así la revisión del ERP y la de la tienda (`disenoParaPintar`,
DECIDÍ 14) dan lo mismo sin volver a abrir la foto. Si no se lee, «Publicar» se apaga y dice el arreglo: oscurecer la foto.
**DESCARTÉ** el promedio de toda la foto (una foto oscura con un cielo blanco detrás del nombre pasaba por oscura) y medir en la tienda (bajar y
analizar la foto en cada visita).
**SE ROMPE SI** lo claro de la foto es un detalle chico (menos de un décimo, un logo blanco) justo detrás del nombre: el promedio del décimo más
claro lo diluye y la revisión puede dar por buena una letra que ahí se lee mal. Con fotos de prenda y de campaña no pasa; si pasa, se mide solo la
zona del texto.

**DECIDÍ 33 — El velo es del color de la campaña (de noche, el de noche), más tupido donde va la letra (`veloDeLaFoto`: el oscurecido más 0,3; del
otro lado, el oscurecido): arriba en el celular, a la izquierda en la computadora, parejo con solo letras.** Se oscurece de 0,15 a 0,90, con 0,45 de
fábrica, como la maqueta; mover el control seguido cuenta como un solo «Deshacer». La foto se reduce en el navegador a 2000 px y la tienda la
pide por su optimizador (`FotoDeFondo`, con un ancho de 1920 para la computadora) y de inmediato, porque está arriba de todo. Mientras carga, o si
el almacén no responde, se ve el degradado de la campaña bajo el velo: la letra se lee igual y no se pierde nada.
**DESCARTÉ** un velo negro: apagaba la paleta elegida, que es lo que hace a la campaña reconocible.

**DECIDÍ 34 — La migración se pega en dos partes:** la 1 (las columnas, sus `check`, `fn_diseno_json` y `guardar_diseno_borrador`) y la 2 (el
almacén y su política, sola, ADR-0195). Va después de `20261017212000`, el día de publicar (casilla 1). Una web de antes la tolera: no manda la
foto y no pisa el oscurecido; un diseño con foto que lea una tienda de antes no lo sabe leer y sale el de siempre (DECIDÍ 14).

**Verificación (8):** `campanas_diseno.mjs` 61 de 61 en la pila propia (los estados imposibles de la foto, la foto que no está en el almacén,
guardar y leer la foto, la web de antes, publicar a la tienda, la migración pegada dos veces), `campanas_portada` 39 y `campanas_llave` 31; el
paquete (124: leer la foto, el velo, la revisión sobre la foto, cambiar de estilo sin perderla), la tienda (450) y el ERP (el tono, los avisos de
foto chica o vertical). En la pila, con Storage levantado: una foto de prueba subida desde el editor (llegó al almacén, el borrador la guardó con
su tono), la revisión apagó «Publicar» en oscuro al 45 % y lo encendió al 55 %, publicada desde la hoja, y vista en la tienda real a 1440 y 375
px, en claro y oscuro, por el optimizador. `guias:recorrer` (14 pasos, escritorio y 375 px en oscuro) antes de aceptar la huella; Knip en verde.

## Actividad 9 — El cierre: `/chaos`, el modo oscuro y `/formidable` (sin migración)

Antes del PR, las pantallas que guardan se atacaron a propósito (`/chaos`, semilla 436, en la pila propia), el modo oscuro se midió (`tema:auditar`, con
12 escenarios nuevos de Campañas en `tema/escenarios/registro.mjs`) y las pantallas se calificaron (`/formidable`, con prueba ciega). Los informes
completos viven en `.chaos/` (local), `docs/chaos/README.md` y `docs/formidable/tienda-web-campanas.md`.

**DECIDÍ 35 — Se arregló todo lo que vive en la web, cada hallazgo con su prueba primero y el mismo ataque repetido; lo que vive en la base lo decide
Felipe.** Arreglado (commits `8fa590824` a `2c40e50d6`): una frase con espacio al final se guarda recortada y el pie ya no dice «guardado» si falló;
la respuesta perdida de un guardado ya no traba el editor con un «alguien más» falso (el editor relee el borrador y, si es el suyo, sigue con su
versión); diez clics en «Publicar» o «Volver al anterior» son una sola llamada (`unaSolaPasada`); el nombre de una campaña no admite caracteres
invisibles; la tienda solo pinta la foto del fondo si es de su propio almacén; Datos pregunta antes de perder un cambio sin guardar; y los tres cambios
de `/formidable` (sin «Falta» en un diseño ya armado, «Qué prendas salen» contado por lo que sale, «vuelve al diseño anterior»).
**DESCARTÉ** arreglar de paso la base (las fechas, `volver_al_diseno_anterior`, `fn_clave_texto`, el control de la foto): son RPC y reglas de una
tabla que cobra descuentos; la web ya no depende de ellas para no romperse.
**SE ROMPE SI** alguien llama a la base sin pasar por la web (una llamada a mano): lo que la web cuida (la frase recortada, los invisibles, la
versión de «Volver al anterior») la base todavía lo acepta. Queda abierto, para Felipe:
- Las fechas de una campaña aceptan el año 0001 o el 9999 sin aviso, y deciden cuándo la caja cobra el descuento (una ventana de años, en el campo
  y en la base).
- `volver_al_diseno_anterior` no lleva versión (publicar sí): una llamada repetida lo intercambia otra vez.
- `fn_clave_texto` no quita los caracteres invisibles: dos nombres que se ven iguales no chocan en la base.
- Un control más estricto del lugar de la foto en la base (hay un hallazgo anotado en el chat de la sesión, no aquí).

**Verificación (9):** `/chaos` 20 del plan + 8 propios, sin violaciones nuevas de INV-01..20 ni de las 8 invariantes propias de Campañas (C1–C8:
dos borradores, foto con tono, foto en el almacén, nombre limpio, nombres repetidos, descuento válido, diseño de una campaña, prendas de la
campaña); la base quedó idéntica a su foto tras cada ataque. `tema:auditar` (admin, 13 visitas): lo que falla solo en oscuro está dentro de la
portada en chico y de la barra de la línea (color de dato, con su foto o dibujo detrás: no se oscurece a propósito) y en la pestaña activa (pieza
del sistema). `/formidable`: leyes 7,0 y oficio 7, con un agente ciego que terminó la tarea sin ayuda (la colaboradora real, sin probar).
