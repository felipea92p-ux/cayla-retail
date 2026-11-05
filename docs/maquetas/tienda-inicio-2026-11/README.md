# Inicio de la tienda: propuestas navegables (2026-11-04)

**Qué es:** Felipe no está convencido del Inicio de hoy (el desfile de ADR-0524). Son portadas distintas, navegables, para elegir mirando. **Una maqueta no cambia la tienda:** nada de esto existe en `apps/tienda`.

**Cómo verla:** abre `index.html`, o sírvela con `maqueta-referentes` de `.claude/launch.json` y entra a `/tienda-inicio-2026-11/`. La barra gris de arriba cambia de propuesta y no es parte del diseño.

## Ronda 7: letra y proporción (2026-11-05)

Felipe encontró la letra Bodoni muy fina y difícil de leer, y eligió **DM Serif Display** mirando tres opciones (A DM Serif, B Fraunces, C Archivo). En la maqueta ya reemplaza a Bodoni en todos los títulos; las frases, precios y nombres en listas siguen en Public Sans. La propuesta H conserva Instrument Sans.

También se quitó el aire de cada foto al recortarla y se rehízo la proporción de L, para que la prenda se vea grande también en pantallas anchas y bajas.

**Nota de existencias (Felipe):** con una tienda elegida no se repite su nombre: «Disponible», «Quedan 2» o «Última». La prenda siempre dice si hay. Con «Todas las tiendas», o si la prenda no está en la elegida, se sigue diciendo dónde hay. En la tienda real vive en `notaDeStock` (`apps/tienda/lib/stock.ts`).

**En la tienda real:** la letra y la nota se llevaron con ADR-0612. La portada sigue siendo solo esta maqueta.

## Ronda 6: L con lo rescatado (2026-11-05)

Felipe aprobó la propuesta de la investigación, y ya está en `#/l`:
- **Celular:** una prenda grande por pantalla, se desliza por las 9 y asoma la siguiente. No rota sola. El total y la tienda cambian con cada grupo, y las marcas llevan al grupo.
- **Computadora:** «Lo nuevo» cruza los tres paneles y toma el color de cada uno. El tríptico sigue rotando. El panel crece con el mouse (Felipe lo pidió de vuelta): el título queda quieto y cada panel muestra su tramo.
- **Debajo:** categorías con foto y las 9 prendas otra vez, con colores y precio, sin la etiqueta «Nuevo». La fila de categorías asoma en la primera pantalla del celular.

**Sigue pendiente para la tienda real:** preparar los recortes en WebP o AVIF livianos, y decidir fotos en escena, logo sobre la imagen y nombre por grupo.

## Investigación de referentes (2026-11-05)

Revisadas en computadora y a 390×664: SSENSE, Gentle Monster, SKIMS, Aritzia, Reformation, Mango, Toteme, Deadly Ponies, AOI, Maison AUGE, Acne Studios y, solo en computadora, Heirest. Jacquemus, COS, Zara y Sézane bloquearon la captura automática. Las capturas no se guardan en el repo porque son de terceros y el repo es público.

**Propuesta para L (aplicada en la ronda 6, salvo el peso de las fotos):**
1. En celular, una prenda grande por pantalla y deslizar por las 9, sin rotación automática. En computadora se queda el tríptico que rota.
2. «Lo nuevo» cruza los tres paneles en computadora.
3. Debajo, categorías con foto y las 9 prendas otra vez; hoy L las saca de esa lista. Dejar asomar la siguiente fila.
4. Los recortes en WebP o AVIF livianos, ya preparados; hoy se bajan originales de hasta 1,7 MB. Solo el primer grupo con prioridad.

**Decide Felipe:** fotos de escena con prendas (como Acne), logo sobre la imagen (como Toteme), nombre propio por grupo.

**Fuentes:** [carruseles, Baymard](https://baymard.com/blog/homepage-carousel) · [navegación en ropa, Baymard](https://baymard.com/blog/apparel-search) · [celular, Baymard](https://baymard.com/blog/mobile-ux-ecommerce) · [velocidad y conversión, Farfetch](https://web.dev/case-studies/farfetch) · [moda en Awwwards](https://www.awwwards.com/websites/fashion/)

## Ronda 5: Felipe eligió L y pidió afinarla (2026-11-05)

- **La mayoría entrará por celular:** esta portada se revisa primero ahí, con la barra del navegador a la vista (390×664 útiles), no solo a 375×812.
- **9 prendas que rotan de 3 en 3** cada 6 segundos. Cada grupo es un outfit de prendas de los últimos 30 días que se puede recoger en una misma tienda (`LS`): dos en Arequipa y uno en Trujillo. En la muestra no hay un grupo completo para Lima.
- **«Lo nuevo» ya no se corta** al pasar el mouse: el título cabe aun con su panel en el ancho mínimo.
- **La rotación se detiene** al pasar el mouse, con el foco, al tocar y con el botón de pausa; no corre con movimiento reducido.
- **En celular:** se desliza con el dedo para cambiar de grupo, y la barra de abajo se compactó para dejarles más espacio a las prendas.

## Ronda 4: la primera pantalla (2026-11-05)

A Felipe le preocupa la primera pantalla: tiene que ser lo más visual posible y profesional. K, L y M la ocupan completa y son las primeras en la barra; H, I y J siguen para comparar. C a G salieron de la barra (sus rutas siguen vivas).

| | K · El cartel | L · Tres paneles | M · El detalle |
|---|---|---|---|
| Idea | Color de pared a pared, «Lo nuevo» enorme y la prenda delante; rota entre 4 | Tres prendas, cada una en su color; juntas son un outfit | La tela de cerca a un lado, la prenda entera al otro |
| «Arma tu outfit» | Botón que toma el color de cada cartel | Barra negra con el total | Botón negro junto a la prenda |
| Lo que cuesta | Muestra una prenda a la vez | Hay que elegir tres que combinen y estén en una misma tienda | Exige una prenda con buena tela y foto grande |

**Lo que trae de nuevo:** el color. La tienda hoy es negro, blanco y marfil; aquí cada fondo se elige según la prenda. Es una decisión de identidad para Felipe.

**Recortes:** las prendas se recortan del fondo blanco en el navegador (`recortar`), y el gris del fondo queda como sombra. En la tienda real se prepararían una sola vez. Una prenda blanca o gris clara se recortaría mal.

**Sin la franja «Separa online y recoge en tu tienda»** en la primera pantalla: la promesa queda justo debajo.

**Revisado a 375, 1280×720, 1440×900 y 1920×1080**, sin desborde. Lo que falta para que sea aún más visual son fotos con modelo; ninguna de las revisadas las tiene, y en `apps/tienda/public` no hay fotos de campaña.

## Ronda 3: más profesional (2026-11-05)

Felipe pidió diseños más profesionales. H, I y J son los nuevos y van primero en la barra; C a G siguen ahí para comparar. Las tres se mantienen en la identidad (negro, blanco y el logo), sin collage ni prendas giradas, con frases normales en vez de versalitas y con «Arma tu outfit» siempre en negro.

| | H · El catálogo | I · La galería | J · El conjunto |
|---|---|---|---|
| Idea | Como un gran comercio: orden estricto, una sola familia de letra | Título enorme en Bodoni, blanco puro y prendas de distinto tamaño | La portada es el armador: tres prendas nuevas que se cambian con flechas |
| Letra | Instrument Sans | Bodoni Moda y Public Sans | Bodoni Moda y Public Sans |
| Lo que aporta | Filtrar por tipo sin salir, colores, precio y tienda en cada prenda | Se siente marca, no catálogo | Total en vivo y aviso de si todo se puede recoger en una misma tienda |
| Lo que cuesta | Es la menos distintiva | Muestra menos prendas al entrar y depende de que la primera sea muy buena | Alguien tiene que decidir qué prendas combinan |
| Prendas en la primera pantalla | 4 completas | 1 cortada y 2 | 3 |

**Revisado a 1440×900 y a 375 px.** Instrument Sans sería una letra nueva para la tienda (hoy Bodoni Moda y Public Sans). Las prendas de cada portada y las de J están elegidas a mano (`DEST`, `IDEST`, `JPOOL`).

**Navegación:** `irRuta` guarda la ruta en memoria, para que el archivo también se pueda recorrer donde el `#` no se puede cambiar (el archivo enviado, una vista previa).

## Lo que pidió Felipe en la ronda 2

La portada es **Lo nuevo**, con un botón adicional que destaca que se puede **armar el outfit**, y el término «looks» pasa a **«outfits»**. Por eso A (categorías) y B (un outfit como portada) salen de la barra; sus rutas `#/a` y `#/b` siguen vivas para comparar.

| Ronda 2 | C · La pasarela | D · El muro | E · La cinta | F · La portada | G · Combínalo aquí |
|---|---|---|---|---|---|
| Idea | El escenario negro, corregido | Lo nuevo de borde a borde | Fotos enormes que se deslizan | Portada de revista | Cada prenda lleva su «+» |
| «Arma tu outfit» | Botón junto a la prenda | Botón arriba y baldosa negra | Botón negro arriba y pieza final | Tarjeta negra; botón en el celular | Bandeja viva; barra fija en el celular |
| Prendas en la primera pantalla | 1, más 6 miniaturas | 4 | 4 y se desliza | 3 | 6 |

**Medido a 1436×879, bajo la barra de la maqueta:** C, D, E, F y G tienen la primera prenda a 0,2-0,3 pantallas (la portada de hoy muestra una, y su primera grilla sale a 3,8) y miden 5 a 5,4 pantallas (hoy 8,3 a 1705×877).

## Qué es real y qué es de ejemplo

- **Real** (producción, 2026-11-04): nombres, precios, fotos, colores, existencias por tienda, días desde que llegó, puesto en más vendidos, cantidad por categoría, direcciones y horarios. Es una muestra de 57 de 450 prendas.
- **De ejemplo:** las tallas, los outfits, el código `W-0000`, y que nada se guarda. La cuenta y WhatsApp no están conectados.
- **Elegidas a mano:** las prendas de la portada y su orden (`DEST`). La tienda ordena por fecha, y hoy eso da varias prendas beige seguidas.
- **El armador** es un dibujo de la idea. La tienda ya tiene el suyo («Arma el tuyo», ADR-0434), y sería el destino real del botón.
- **Fotos:** se leen de su almacén público por el optimizador de la tienda; no se copian al repo.

## Sin decidir

- Cuál dirección, o qué mezcla.
- Quién elige las prendas de la portada: la fecha, una regla o el líder.
- Hasta dónde llega el cambio de «looks» a «outfits»: tienda, rutas, ERP (Catálogo, Vitrina) y textos. En código y base los nombres pueden quedarse, como `clientas`.
- **Fotos con modelo:** las revisadas son prendas sobre fondo blanco. Las propuestas funcionan así, pero 6 de los 7 referentes mostraban una persona con la ropa puesta.
- Revertir el desfile como portada es decisión de Felipe: lo eligió en ADR-0524.
