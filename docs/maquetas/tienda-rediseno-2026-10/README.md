# Rediseño de la tienda online: direcciones (2026-10-17)

**Qué es:** tres maneras distintas de rediseñar por completo la tienda online (`apps/tienda`) para que se vea sofisticada y
elegante. Cada una tiene sus cinco pantallas tocables (portada, catálogo, prenda, bolsa y entrar) en escritorio y en celular.
Felipe elige mirando. **Una maqueta no cambia la tienda:** nada de esto existe todavía en `apps/tienda`.

## Lo que Felipe decidió antes de dibujar (2026-10-17)
1. **La tienda puede tener identidad visual propia:** colores y letras nuevos, solo en la tienda (el ERP sigue con CAYLA
   Dynamic). Está escrito en CLAUDE.md, «Skills de diseño de afuera», punto 3.
2. **Maquetas primero**, nunca directo en el código.
3. **Entran las cuatro partes:** portada, catálogo y ficha, bolsa y separar, cuenta y entrar.

## Lo que no cambia en ninguna
El logo (el colibrí y CAYLA en EB Garamond con su espaciado), que sin cuenta no se ven precios, el stock por tienda («Hay»,
2, «Última», «—»), separar sin pagar, confirmar por WhatsApp y pagar al recoger, y el tope de 3 separaciones abiertas
(ADR-0426).

## Las tres

| | A · Muro | B · Lookbook | C · Cochinilla |
|---|---|---|---|
| Idea | Lujo silencioso: una galería con muros de yeso frío | Revista de moda: papel blanco y titulares grandes | La evolución del oscuro de hoy: vino de cochinilla y su rosa |
| Firma | La cédula de museo de cada prenda y la portada colgada a la altura de los ojos | El look Nº como doble página y el fondo del color de la propia prenda | El riel: cada prenda cuelga de su cuerda y se mece una vez |
| Letras | Archivo ancha (mayúsculas finas) + Newsreader cursiva | Newsreader de titulares + Schibsted Grotesk | Gilda Display + Hanken Grotesk |
| Movimiento | Las obras aparecen una vez, despacio | La doble página se arma al llegar (fondo, prendas, titular) | Las prendas bajan por su cuerda al llegar |

**Las fotos de la tienda mandan:** son prendas recortadas sobre fondo blanco, sin modelos, de 1200×1500, y algunas traen su
propia percha. Las tres funden ese blanco con un fondo propio (`mix-blend-mode: multiply`), y así parecen hechas en el mismo
estudio. En B, el fondo de un look toma el color de su prenda más clara: con la más oscura, una camisa blanca desaparecía.

**Lo que descarté y por qué:** las parejas de letras que propuso `ui-ux-pro-max` (Cormorant + Montserrat, Playfair + Inter,
Bodoni Moda + Jost) son las de siempre en moda; y la crema con serif y acento terracota, que es la paleta de hoy, es la
combinación más repetida en este tipo de diseño. Ninguna dirección la repite.

## Cómo se abre
Hace falta un servidor local (abierta como archivo suelto, la vista previa del panel no deja tocarla). Desde la raíz del repo:

```bash
python3 -m http.server 3032 --bind 127.0.0.1 --directory docs/maquetas
```

y abrir `http://localhost:3032/tienda-rediseno-2026-10/`. La barra negra de arriba de cada dirección cambia de dirección, de
pantalla y entre escritorio y celular; no es parte del diseño.

## Qué es real y qué es de ejemplo
- **Real:** los nombres y las fotos de las 13 prendas de la portada pública de tienda.cayla.pe (las fotos se leen de su
  almacén público; no se copian a este repo, que es público), las dos tiendas con su dirección, horario y WhatsApp, y cómo
  funciona separar.
- **De ejemplo:** precios, colores de más, tallas, stock por tienda, los looks y el número de la separación.

## Cómo se verificó (y qué no)
Capturas de página completa con Chrome sin ventana a 1440 y 390 px: ninguna pantalla se sale del ancho. Con clics reales, en
las tres: sin talla pide la talla, agrega a la bolsa, sin tienda pide la tienda, dice cuánto hay en la tienda elegida, separa
y arma el mensaje de WhatsApp, sin errores en la consola. El contraste del texto tenue sobre cada fondo es de 4,9:1 o más.
**No se probó** con clientes reales ni con fotos de modelo, que no existen.

## Ronda 2: la familia de A (2026-10-17)
Felipe eligió A («me gusta que sea elegante») y pidió tres más en esa línea, sofisticadas y «con full animaciones». Las tres
conservan lo que hace a A —la galería, la cédula de cada prenda, Archivo ancha con Newsreader— y cada una prueba una idea
distinta de movimiento:

| | A2 · Telón | A3 · Recorrido | A4 · Luz |
|---|---|---|---|
| Idea | A tal cual, contada como cine | La galería que se camina | A en clave romántica |
| Paleta | La de A (yeso frío, grafito) | Hueso cálido y azul noche | Sillar con grano y luz cálida |
| Firma de movimiento | La foto viaja de la lista a la ficha | Al bajar, las prendas pasan de lado (3 / 7) | Una luz sigue al mouse por el muro |
| Además | Telón de entrada (una vez), titulares que suben desde su línea, obras que se descubren, lupa sobre la tela, la foto vuela a la bolsa | Aviso que pasa, cursor «Ver», pasos que se encienden, bolsa de costado, pasar de pantalla como de sala | Letras desde el desenfoque, prendas a distintas profundidades, fotos que se revelan, brillo en la tela, trazo en la talla y en el visto |
| Pagas | El telón demora ~2 s la primera vez | El recorrido toma el control del desplazamiento; en celular es un carrusel | El desenfoque y el grano pesan en teléfonos viejos |

**Cómo está hecho:** `movimiento.js` reúne las piezas comunes (revelar al entrar en vista, contar, la foto que vuela, el
indicador que se desliza, filtrar sin saltos, letras, seguir al mouse), sin librerías: CSS, `IntersectionObserver` y la Web
Animations API. Los cambios de pantalla usan las transiciones de vista del navegador; donde no existen, la pantalla cambia sin
animar. Con «reducir movimiento» activado, todo queda quieto y el recorrido de A3 se desliza con el dedo. A2 nació de A con un
script (mismo dibujo, otro prefijo de clases); desde ahí es un archivo propio.

**Trampas que aparecieron (sirven para cuando se construya):**
- El lienzo es un contenedor de consultas por tamaño (`container-type`), y eso hace que un `position: fixed` de adentro se fije
  al lienzo y no a la ventana. Por eso el telón de A2 y la bolsa de costado de A3 viven fuera del lienzo.
- `IntersectionObserver` no ve un elemento recortado entero con `clip-path`: nunca lo da por visto. El recorte va en un hijo.
- Un `style="display:grid"` puesto en el elemento le gana al atributo `hidden`: el bloque «Separar» seguía a la vista después
  de separar, en las seis direcciones. Lo arregla una regla en `marco.css`.

**Verificado:** las tres a 1440 y 390 px sin desbordes; el movimiento, en cuadros capturados a distintos milisegundos y bajando
por la página; el camino de separar con clics reales y el movimiento encendido, en escritorio y en celular, sin errores en la
consola.

## Ronda 3: las hermanas de A, con identidad propia (2026-10-17)
Felipe aclaró el encargo: no quería variaciones casi idénticas de A (eso fue la ronda 2), sino diseños con **identidad propia
que compartan su gusto**, todos con mucho movimiento. Lo que se tomó de A: fondos claros, mucho aire, poco color, tipografía
refinada y cada prenda tratada como algo valioso. Lo que cambia en cada una: letras, colores, composición y firma.

| | D · Seda | E · Etiqueta | F · Friso |
|---|---|---|---|
| Idea | La suavidad de la tela | Elegancia utilitaria de tienda de autor | El adobe del norte |
| Paleta | Perla rosada, rosa polvo, tinta ciruela | Celadón, papel, verde oliva, una señal óxido | Adobe, arena, espresso, verde totora |
| Letras | Noto Serif Display (cursiva) + Ysabeau Office | Albert Sans + Fragment Mono | Italiana + Jost |
| Composición | Centrada, cabecera en dos pisos, marcos redondeados | Índice a la izquierda en el catálogo, esquinas cortadas | Asimétrica, bandas de friso, marcos escalonados |
| Firma | Una cinta que se dibuja al bajar y cose la página | La etiqueta colgante que se mece y se da vuelta; la ficha es una etiqueta con talón | Un friso escalonado (como los de Chan Chan) que se dibuja línea por línea |
| Movimiento | Letras que caen como tela, cápsulas que flotan, cinta que vuela a la bolsa, lazo al separar, seda que se descorre al cambiar de pantalla | Fotos que se imprimen, etiquetas que caen y se mecen, cifras que ruedan, el talón que se arranca, mensaje a máquina | Luz de sol que recorre el muro, marcos que se abren desde una cruz, frisos que se dibujan, escalera al cambiar de pantalla |
| Pagas | La cinta necesita una portada larga | Es la menos romántica | Un motivo cultural pide medida |

**Arreglos de paso, en todas las direcciones:** sin cuenta ya no se ve el rango de tallas (A y sus variaciones lo mostraban; la
tienda real lo esconde junto con precios y stock); y el titular partido en letras ya no se corta a la mitad de una palabra
(«NU / EVO»): las letras de cada palabra van juntas (`movimiento.js`, `letras`). Las cifras que ruedan en E llevan su número en
texto para los lectores de pantalla. Probado otra vez el camino de separar en las nueve: todas pasan.

## Ronda 4: inspiradas en las grandes casas de moda (2026-10-17)
Felipe pidió tres más, ya sin partir de A (que se queda como referencia), sofisticadas y elegantes, inspiradas en las principales
casas de moda. Cada una toma **la manera de trabajar** de una familia de casas, no su marca: no usa sus nombres en la tienda, ni
logos, monogramas, tramas registradas, la caja naranja o el tejido trenzado. El logo de CAYLA no cambia.

| | G · Pasarela | H · Vitrina | I · Pespunte |
|---|---|---|---|
| A la manera de | La alta costura de París (Dior, Chanel, Saint Laurent) | El modernismo italiano (Prada, Max Mara) | Las casas del oficio (Hermès, Loewe) |
| Paleta | Blanco y negro puros, marfil en el escenario | Camel, negro, blanco hueso y una gota de rojo laca | Marfil, lino, tabaco y un celeste |
| Letras | Bodoni Moda + Public Sans | Josefin Sans + Manrope | Libre Caslon + Libre Franklin |
| Firma | La portada es un desfile: cada prenda cruza a la luz y estalla el flash | La portada es una vitrina: planos, nichos y pedestales, con un reflejo de vidrio | El pespunte: costuras que se cosen solas; al separar, una caja que se cierra y se sella |
| Movimiento | Programa con la prenda que asoma junto al cursor, visor que encuadra y dispara al agregar, invitación que se da vuelta, luces que bajan y suben | Planos que se arman y se mueven al bajar, la prenda que baja a su pedestal, la luz del nicho, puertas que se abren al cambiar de pantalla | Muestras prendidas con alfiler, la puntada que corre bajo el mouse, muestras con borde de tijera de zigzag, un hilo a la bolsa |
| Pagas | El escenario delata una foto floja; lo que se mueve solo distrae (se puede pausar) | El camel domina: con fotos cálidas todo queda del mismo tono | Puede volverse decorado; no dar a entender que todo es hecho a mano |

**Trampas que aparecieron (para cuando se construya):**
- En G, la prenda se funde con la luz del escenario (`mix-blend-mode: multiply`), pero solo si la fusión va en el elemento que se
  anima: la animación le crea su propia capa, y una fusión dentro de esa capa no ve el escenario (queda un rectángulo blanco).
  Detrás de la prenda va un círculo de luz claro: en él la prenda conserva su color; fuera de él se oscurece.
- El desfile se mueve solo, así que tiene botón para pausarlo y se detiene cuando no está a la vista o la pestaña está oculta.
- Un texto gris sobre camel se lee mal (2,8 a 1): en H, sobre camel el texto tenue es casi negro (4,7 a 1). Un medidor de contraste
  real (en `scratchpad`, no en el repo) revisó las portadas y fichas: ningún texto queda bajo el mínimo.

## Después de elegir
1. La dirección elegida se vuelve un sistema: colores, letras y piezas en `apps/tienda/app/globals.css`, que es la única fuente.
2. Un ADR con lo elegido, lo descartado y en qué escenario se rompe.
3. Se construye con `/construir`, pantalla por pantalla, sin perder lo que se ganó en velocidad (#1163, #1165) y en coordinación
   con la sesión de «Arma el tuyo», que toca la cabecera, la ficha y los looks.
