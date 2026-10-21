# Maqueta · Cambio de sede y cambio de pestaña en la tienda web (2026-10-20)

> **Estado: para que Felipe elija mirando.** Solo maqueta: nada de esto existe en `apps/tienda`, no hay migración ni cambio en
> producción. Los **precios y el stock son de ejemplo**; las fotos y los nombres de las 8 prendas son los de la portada pública.
> Segunda vuelta (misma tarde, Felipe: «hazlo responsive pero quédate con esas opciones, y que funcionen como pantallas de carga»):
> las seis pruebas se quedan, caben en el celular y **cada una es también la pantalla de carga** de la página que llega.

`index.html`: un solo archivo. Hace falta un servidor local (abierta como archivo suelto, la vista previa del panel no deja tocarla):

```bash
python3 -m http.server 8791 --bind 127.0.0.1 --directory docs/maquetas
```

y abrir `http://localhost:8791/tienda-cambio-de-sede-y-pestana-2026-10/`. La barra negra de arriba elige qué se prueba (sede o pestaña),
cuál de las tres pruebas, la velocidad (**«Lenta ×4»** para ver cada paso), **cuánto tarda la página nueva** (nada · 1,2 s · 3 s: la
espera real de Next con red lenta, ADR-0445), computador o celular, claro u oscuro, «Reducir movimiento» y «Repetir». No es parte del
diseño. La leyenda dice qué hace cada prueba, **qué pasa mientras llega la página**, cuánto dura, qué se paga y cómo se construiría; abajo
mide la última corrida en milisegundos. La maqueta se encoge sola para caber en la ventana (`zoom`), sin cambiar las medidas de adentro.

## Qué pidió Felipe (2026-10-20)

1. «A la hora que se cambia de sede, mostrarme una animación para visualizar el cambio de sedes.»
2. «Alguna animación rápida cuando se cambia entre pestañas como Arma tu look, Lo nuevo, etc.»
3. Tres maquetas de cada una, para elegir mirando.
4. Después de mirarlas: «hazlo responsive pero quédate con esas opciones, y que funcionen como pantallas de carga».

## Qué pasa hoy en la tienda (lo que se cambiaría)

- **Cambiar de tienda** (`SelectorTienda`, `components/CabeceraConCuenta.tsx`): la lista baja, se toca un nombre y la página se vuelve a
  pedir con `?sede=…`. Es la **misma vista** para `claveDeVista` (ADR-0445), así que **no funde nada**: la lista solo se atenúa al 45 %
  mientras llega la nueva y el nombre de la cabecera cambia de golpe. Nada dice «ahora estás en Lima».
- **Cambiar de pestaña** (Lo nuevo, Ropa, Looks, Ofertas): otra ruta, así que la pantalla **se funde en 0,24 s** (lo nuevo aparece sobre
  lo viejo, `vistas.css`) y, de una lista a otra, sale el esqueleto de la que viene (`EnCamino`). Es correcto pero no dice hacia dónde se
  fue ni le da protagonismo al título.
- **La espera existe en los dos casos:** la página nueva tarda lo que tarde Next (medido entre 0,3 y 1,3 s con red lenta). Por eso la
  animación no puede durar un tiempo fijo: tiene que **cubrir la espera** y terminar cuando la página llega.

## Cada prueba es también la pantalla de carga

La regla que siguen las seis: **lo que ya se sabe se muestra al instante** (el nombre de la tienda elegida, el título de la pestaña
tocada), **lo que falta se espera con la señal de espera de la tienda** (el esqueleto que brilla, ADR-0445; el hilo que barre) y
**la animación termina recién cuando llega la página**, con un mínimo para no parpadear si llega al instante. Con «Reducir
movimiento» todo cambia de golpe y solo queda el esqueleto hasta que llega.

## Las 3 pruebas de **cambio de sede**

| # | Nombre | Qué se ve | Mientras llega la página | Dura | Pagas |
|---|---|---|---|---|---|
| 1 | **La cédula** | El nombre de la tienda rueda hacia arriba (como la cédula de un museo) y cada prenda se vuelve a colgar —una tras otra— con su precio y su stock nuevos. Nada tapa la pantalla. | El nombre rueda al instante. Las prendas se **descuelgan** (se atenúan al 45 % y bajan 6 px, una tras otra) y se quedan así, con la luz que barre su foto, hasta que llega la tienda nueva; recién ahí se vuelven a colgar. | ≈ 0,6 s + la página | La más discreta: quien no mira la cabecera puede no notar que cambió de tienda. |
| 2 | **El velo** (antes «El telón») | Un velo oscuro y desenfocado cubre el catálogo, que se sigue viendo detrás, borroso; escribe en grande «AHORA VES LO QUE HAY EN · TRUJILLO» y se disipa dejando el catálogo ya cambiado. La cabecera queda a la vista y su nombre rueda. Felipe pidió esta versión al ver el telón negro: «que no sea tan invasivo, un blur oscuro». | El velo **se queda** hasta que llega la página (0,3 s como mínimo después de cubrir), con un hilo que barre la línea bajo el nombre; recién entonces se disipa, y las prendas nuevas ya están debajo. Esconde la espera sin tapar la tienda. | ≈ 1,0 s o lo que tarde la página | Cubre el catálogo mientras dura la espera: con red lenta, el velo dura lo que dure la red. |
| 3 | **El mapa** | Al tocar la tienda se abre un mapa fino de la costa del Perú con las tres sedes (Trujillo, Lima, Arequipa). Al elegir una, el marcador viaja por la costa hasta ella, deja su ruta punteada, el nombre rueda y las prendas se refrescan. | Las prendas se descuelgan desde el toque. El marcador viaja mientras llega la página: si la página llega antes, espera a que aterrice; si llega después, **el anillo late sobre la sede** hasta que llegue. Recién ahí las prendas se cuelgan y el mapa se pliega. | ≈ 1,2 s (0,55 s de viaje) o lo que tarde la página | Cambia el selector (ya no es una lista de nombres): la más cara de construir; una sede nueva lejos de la costa pide redibujar el mapa. El marcador podría ser el colibrí, como en el login del ERP (ADR-0136 act. 2026-10-13). |

## Las 3 pruebas de **cambio de pestaña**

| # | Nombre | Qué se ve | Mientras llega la página | Dura | Pagas |
|---|---|---|---|---|---|
| 1 | **La raya que viaja** | La raya de la pestaña corre de la palabra vieja a la nueva, y el contenido entra de lado en el sentido del recorrido (hacia la derecha si la pestaña nueva está a la derecha). | Lo que entra de lado es **el esqueleto de la pestaña**: su título real y marcos que brillan donde van las fotos. Al llegar, cada foto y cada texto aparecen en su lugar, sin que nada se mueva. | ≈ 0,3 s + la página | Orienta sin protagonismo: el título no se luce. En el celular no hay raya: queda solo el deslizamiento. |
| 2 | **El título se cuelga** | El título viejo cae por su línea, el nuevo sube palabra por palabra y las prendas se cuelgan en cascada, como cuando se monta una exposición en el muro. | El título sube al instante y lo que se cuelga en cascada son **los marcos vacíos que brillan**. Al llegar, cada foto aparece dentro de su marco y cada texto en su renglón. | ≈ 0,55 s + la página | La más rica y la más larga. Dos toques muy seguidos se pisan (se corta la primera). |
| 3 | **Desde la palabra** | La página nueva se despliega desde la palabra tocada, hacia los dos lados, hasta cubrir la vieja. El toque y lo que llega quedan unidos. | Lo que se despliega es el esqueleto de la pestaña; al llegar, las fotos y los textos aparecen en su lugar. | ≈ 0,4 s + la página | Es un corte, no un fundido: la vieja no se apaga. En el celular sale desde el menú ☰, no desde una palabra de la cabecera. |

Las seis respetan la regla de la tienda: **ricas, una vez, sin rebote y sin bucle** (ADR-0430 / ADR-0136); los únicos bucles son
señales de espera que se apagan al llegar la página (la luz del esqueleto, el hilo del telón, el anillo del mapa), como el hilo del botón
del ERP. Curva `--ease` de `apps/tienda/app/globals.css` y tokens de «A · Muro» en claro y en oscuro.

## Lo que se arregló en el celular (segunda vuelta)

- **«AREQUI / PA»**: el nombre del telón se partía en dos líneas a 375 px. Ahora va en una sola línea y baja hasta 34 px (8 letras anchas
  caben en 343 px; medido: 284 px).
- **«ACCESORIC»**: el título de lista se salía por la derecha. El mínimo baja de 48 a 36 px (`clamp(36px, 8cqi, 120px)`); «ACCESORIOS»
  cabe. (En la tienda real el mismo título tiene mínimo 48 px: si se construye, revisar `catalogo.css` con un nombre de 10 letras.)
- **El velo** no tapa la cabecera: empieza bajo ella (90 px), así el nombre que rueda se ve. Y ya no es un telón negro: es el grafito al
  62 % con `backdrop-filter: blur(14px)`, entra y sale con un fundido (Felipe: «que no sea tan invasivo, un blur oscuro»).
- La maqueta se encoge para caber en la ventana y en el alto del panel (`zoom`), y la leyenda pasa a una columna bajo 900 px.

**Verificado en el navegador integrado** (1180 px y celular de 375 px, claro y oscuro, la página tardando 1,2 s y 3 s): cédula 1 869 ms,
telón 1 644 ms, mapa 3 668 ms con la página a 3 s, raya 1 703 ms, título 1 704 ms, desde la palabra 1 704 ms; con «Reducir movimiento», 3 ms.
Las fotos y los textos aparecen en su lugar sin que nada se corra.

## Mi recomendación (Felipe decide)

- **Sede: 2 · El velo**, desde que Felipe pidió el blur oscuro en vez del negro: es la única que **esconde la espera** (la página tarda
  0,3–1,3 s) y a la vez deja ver la tienda detrás; dice sin duda «ahora estás en Lima». Antes recomendaba la cédula (la más discreta, para
  una acción que se repite); sigue siendo la alternativa si el velo se siente demasiado cada vez. El mapa es lo más bonito pero reemplaza
  un selector que ya funciona y que Felipe decidió el 2026-10-19 (ADR-0455: «siempre una tienda», la lista como enlaces compartibles).
- **Pestaña: 3 · Desde la palabra** por rápida (0,4 s) y porque une el toque con lo que llega; **2 · El título se cuelga** es la que más
  parece «A · Muro» (la galería que se monta) y vale si Felipe prefiere que cada pestaña llegue como una exposición. La 1 es la más
  convencional (así cambian de sección casi todas las apps).

## Cómo se construiría (no se hizo)

Todo cabe en el sistema que ya existe (`components/Vistas.tsx`, `app/estilos/vistas.css`, `components/EnCamino.tsx`, transiciones de
vista de React 19.3). **La espera ya está resuelta en la tienda**: `EnCamino` pone el esqueleto al tocar y Next lo reemplaza al llegar;
lo que cambia es **cómo entra** el esqueleto y **cómo aparece** lo que llega.

- **Sede.** Hoy `claveDeVista` no cambia con `?sede=`: para animar, el cambio de tienda pasa a ser **su propia vista** (la clave incluye la
  sede) o se anima a mano con `flushSync` como hace `EnCamino`. 1: `view-transition-name` en la palabra de la cabecera; `recolgar-espera` en
  cada `.t-card` al tocar (donde hoy `.t-pendiente` atenúa la lista al 45 %) y `recolgar-vuelve` cuando llega la página. 2: una capa
  `t-velo` bajo la cabecera con `backdrop-filter: blur(14px)` y el grafito al 62 %, que entra y sale con un fundido; la salida se dispara
  en el mismo momento en que hoy se quita `.t-pendiente`. 3: un SVG con
  la costa y `getPointAtLength` para el marcador; reemplaza la lista de `SelectorTienda` (o la lista se queda y el mapa solo sale durante
  el cambio); el anillo late con una animación CSS que se quita al llegar.
- **Pestaña.** 1: `view-transition-name: t-raya` en la raya (el navegador la mueve sola) y `::view-transition-new(root)` con `translateX`
  según el orden de `lib/menu`. 2: `view-transition-class` en el título (`t-cuelga`, cada palabra en un `<span>`) y en las tarjetas del
  esqueleto, con `animation-delay` por índice: el mismo patrón de la foto que viaja (ADR-0445). 3: `::view-transition-new(root)` con
  `clip-path: inset(…)` cuyo origen se guarda al tocar en una variable (`--ox`). En los tres, lo que llega aparece en su lugar con el
  fundido que ya tiene `FotoTarjeta` (`img[data-esperando]`, 0,5 s).
- **Orden sugerido:** (1) ADR con lo elegido y la clave de vista por sede; (2) la pieza elegida de pestaña en `vistas.css`; (3) la de sede;
  (4) `prefers-reduced-motion` y la prueba `lib/tienda-web-movimiento.test.ts` (o una hermana en `apps/tienda/lib`) que vigile que no
  entre un bucle ni un rebote fuera de las señales de espera.

## Qué es real y qué es de ejemplo

- **Real:** la cabecera de la tienda (Lo nuevo · Ropa · Accesorios · Looks · Ofertas, el logo oficial, la tienda como palabra, bolsa y
  cuenta), los tokens claro/oscuro, Archivo ancha y Newsreader, los nombres y fotos de las 8 prendas, las tres sedes y su orden
  alfabético (ADR-0455), los textos de los vacíos de `lib/listas.ts`, el esqueleto con el título real (ADR-0445).
- **De ejemplo:** los precios por tienda, el stock («Hay», «Última», «No hay»), los dos looks y su precio, la frase de la franja, cuánto
  tarda la página (1,2 s es la medida de ADR-0445 con red lenta).
  «Accesorios» muestra prendas de ropa porque la maqueta solo tiene esas 8 fotos: sirve solo para ver el movimiento.
- **El mapa es una ilustración:** la costa está trazada a mano alzada desde coordenadas aproximadas, no es cartografía exacta.
