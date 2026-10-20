# Maqueta · Cambio de sede y cambio de pestaña en la tienda web (2026-10-20)

> **Estado: para que Felipe elija mirando.** Solo maqueta: nada de esto existe en `apps/tienda`, no hay migración ni cambio en
> producción. Los **precios y el stock son de ejemplo**; las fotos y los nombres de las 8 prendas son los de la portada pública.

`index.html`: un solo archivo. Hace falta un servidor local (abierta como archivo suelto, la vista previa del panel no deja tocarla):

```bash
python3 -m http.server 8791 --bind 127.0.0.1 --directory docs/maquetas
```

y abrir `http://localhost:8791/tienda-cambio-de-sede-y-pestana-2026-10/`. La barra negra de arriba elige qué se prueba (sede o pestaña),
cuál de las tres pruebas, la velocidad (**«Lenta ×4»** para ver cada paso), computador o celular, claro u oscuro, «Reducir movimiento»
y «Repetir» (vuelve a correr el último cambio). No es parte del diseño. La leyenda de arriba dice qué hace cada prueba, cuánto dura, qué se
paga y cómo se construiría; abajo mide la última corrida en milisegundos.

## Qué pidió Felipe (2026-10-20)

1. «A la hora que se cambia de sede, mostrarme una animación para visualizar el cambio de sedes.»
2. «Alguna animación rápida cuando se cambia entre pestañas como Arma tu look, Lo nuevo, etc.»
3. Tres maquetas de cada una, para elegir mirando.

## Qué pasa hoy en la tienda (lo que se cambiaría)

- **Cambiar de tienda** (`SelectorTienda`, `components/CabeceraConCuenta.tsx`): la lista baja, se toca un nombre y la página se vuelve a
  pedir con `?sede=…`. Es la **misma vista** para `claveDeVista` (ADR-0445), así que **no funde nada**: la lista solo se atenúa al 45 %
  mientras llega la nueva y el nombre de la cabecera cambia de golpe. Nada dice «ahora estás en Lima».
- **Cambiar de pestaña** (Lo nuevo, Ropa, Looks, Ofertas): otra ruta, así que la pantalla **se funde en 0,24 s** (lo nuevo aparece sobre
  lo viejo, `vistas.css`) y la raya de la cabecera pasa a la pestaña tocada. Es correcto pero no dice hacia dónde se fue ni le da
  protagonismo al título.

## Las 3 pruebas de **cambio de sede**

| # | Nombre | Qué se ve | Dura | Pagas |
|---|---|---|---|---|
| 1 | **La cédula** | El nombre de la tienda rueda hacia arriba (como la cédula de un museo) y cada prenda se vuelve a colgar —una tras otra— con su precio y su stock nuevos. Nada tapa la pantalla. | ≈ 0,6 s (medido 0,8 s) | La más discreta: quien no mira la cabecera puede no notar que cambió de tienda. |
| 2 | **El telón** | Un telón grafito cruza el catálogo desde la tienda elegida, escribe en grande «AHORA VES LO QUE HAY EN · TRUJILLO» y se retira hacia el otro lado dejando el catálogo ya cambiado. La cabecera queda a la vista y su nombre rueda debajo. | ≈ 1,1 s | Tapa el catálogo un segundo: nadie duda de que cambió, pero dos cambios seguidos cansan. |
| 3 | **El mapa** | Al tocar la tienda se abre un mapa fino de la costa del Perú con las tres sedes (Trujillo, Lima, Arequipa). Al elegir una, el marcador viaja por la costa hasta ella, deja su ruta punteada, el nombre rueda y las prendas se refrescan. | ≈ 1,2 s (0,55 s de viaje; medido 1,4 s) | Cambia el selector (ya no es una lista de nombres): la más cara de construir; una sede nueva lejos de la costa pide redibujar el mapa. El marcador podría ser el colibrí, como en el login del ERP (ADR-0136 act. 2026-10-13). |

## Las 3 pruebas de **cambio de pestaña**

| # | Nombre | Qué se ve | Dura | Pagas |
|---|---|---|---|---|
| 1 | **La raya que viaja** | La raya de la pestaña corre de la palabra vieja a la nueva, y el contenido entra de lado en el sentido del recorrido (hacia la derecha si la pestaña nueva está a la derecha). | ≈ 0,3 s | Orienta sin protagonismo: el título no se luce. En el celular no hay raya: queda solo el deslizamiento. |
| 2 | **El título se cuelga** | El título viejo cae por su línea, el nuevo sube palabra por palabra y las prendas se cuelgan en cascada, como cuando se monta una exposición en el muro. | ≈ 0,55 s | La más rica y la más larga. Dos toques muy seguidos se pisan (se corta la primera). |
| 3 | **Desde la palabra** | La página nueva se despliega desde la palabra tocada, hacia los dos lados, hasta cubrir la vieja. El toque y lo que llega quedan unidos. | ≈ 0,4 s | Es un corte, no un fundido: la vieja no se apaga. En el celular sale desde el menú ☰, no desde una palabra de la cabecera. |

Las seis respetan la regla de la tienda: **ricas, una vez, sin rebote y sin bucle** (ADR-0430 / ADR-0136), la curva `--ease` de
`apps/tienda/app/globals.css` y los tokens de «A · Muro» en claro y en oscuro. Con «Reducir movimiento» todo cambia de golpe
(medido: 3 ms). Se probaron en el navegador integrado a 1180 px y en el celular (375 px), en los dos temas.

## Mi recomendación (Felipe decide)

- **Sede: 1 · La cédula.** Cambiar de tienda es una acción de un segundo que se repite (la clienta compara precios entre sedes); un telón
  cada vez cansa, y el mapa es lo más bonito pero reemplaza un selector que ya funciona y que Felipe decidió el 2026-10-19 (ADR-0455:
  «siempre una tienda», la lista como enlaces compartibles). Si Felipe quiere que **se note** el cambio, el telón; si quiere **contar**
  que CAYLA tiene tres ciudades, el mapa.
- **Pestaña: 3 · Desde la palabra** por rápida (0,4 s) y porque une el toque con lo que llega; **2 · El título se cuelga** es la que más
  parece «A · Muro» (la galería que se monta) y vale si Felipe prefiere que cada pestaña llegue como una exposición. La 1 es la más
  convencional (así cambian de sección casi todas las apps).

## Cómo se construiría (no se hizo)

Todo cabe en el sistema que ya existe (`components/Vistas.tsx`, `app/estilos/vistas.css`, transiciones de vista de React 19.3):

- **Sede.** Hoy `claveDeVista` no cambia con `?sede=`: para animar, el cambio de tienda pasa a ser **su propia vista** (la clave incluye la
  sede) o se anima a mano con `flushSync` como hace `EnCamino`. 1: `view-transition-name` en la palabra de la cabecera y `view-transition-class:
  t-recolgar` en cada `.t-card` con `animation-delay` por índice (`--i`). 2: una capa `t-telon` bajo la cabecera, dos `clip-path`; mientras
  está cubierto llega la página de Next (eso ya tarda 0,3–1 s: el telón **esconde la espera**, es el único que convierte la carga en algo que
  se ve a propósito). 3: un SVG con la costa y `getPointAtLength` para el marcador; reemplaza la lista de `SelectorTienda` (o la lista se
  queda y el mapa solo sale durante el cambio).
- **Pestaña.** 1: `view-transition-name: t-raya` en la raya (el navegador la mueve sola) y `::view-transition-new(root)` con `translateX`
  según el orden de `lib/menu`. 2: `view-transition-class` en el título (`t-cuelga`, cada palabra en un `<span>`) y en las tarjetas, con
  `animation-delay` por índice: el mismo patrón de la foto que viaja (ADR-0445). 3: `::view-transition-new(root)` con `clip-path:
  inset(…)` cuyo origen se guarda al tocar en una variable (`--ox`); el esqueleto de `EnCamino` sigue saliendo igual debajo.
- **Orden sugerido:** (1) ADR con lo elegido y la clave de vista por sede; (2) la pieza elegida de pestaña en `vistas.css`; (3) la de sede;
  (4) `prefers-reduced-motion` y la prueba `lib/tienda-web-movimiento.test.ts` (o una hermana en `apps/tienda/lib`) que vigile que no
  entre un bucle ni un rebote.

## Qué es real y qué es de ejemplo

- **Real:** la cabecera de la tienda (Lo nuevo · Ropa · Accesorios · Looks · Ofertas, el logo oficial, la tienda como palabra, bolsa y
  cuenta), los tokens claro/oscuro, Archivo ancha y Newsreader, los nombres y fotos de las 8 prendas, las tres sedes y su orden
  alfabético (ADR-0455), los textos de los vacíos de `lib/listas.ts`.
- **De ejemplo:** los precios por tienda, el stock («Hay», «Última», «No hay»), los dos looks y su precio, la frase de la franja.
  «Accesorios» muestra prendas de ropa porque la maqueta solo tiene esas 8 fotos: sirve solo para ver el movimiento.
- **El mapa es una ilustración:** la costa está trazada a mano alzada desde coordenadas aproximadas, no es cartografía exacta.
