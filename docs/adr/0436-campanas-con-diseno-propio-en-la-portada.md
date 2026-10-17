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
los dos lados a la vez porque es la misma pieza.

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
separar algo que no se ve. Si molesta, la actividad 7 (el texto propio) le da otra frase.

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
