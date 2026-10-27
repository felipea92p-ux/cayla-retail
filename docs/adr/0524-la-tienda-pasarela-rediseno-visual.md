# ADR-0524 — La tienda online pasa de «A · Muro» a «G · Pasarela» (blanco, negro y marfil; el desfile de lo nuevo)

- **Fecha:** 2026-10-26 · **Estado:** aceptada (Felipe eligió mirando las maquetas y aprobó la lista de 10 actividades y las tres decisiones de abajo el 2026-10-26); se construye por actividades, cada una en su commit
- **Decidió:** Felipe
- **Relacionados:** ADR-0446 (letras y logo oficial; la tienda tiene identidad propia), ADR-0455 (A · Muro y «siempre una tienda»), ADR-0466 (el velo y el título que se cuelga), ADR-0445 (esqueletos fieles y paso suave entre vistas), ADR-0430 y ADR-0136 (movimiento: «ricas, una vez, sin rebote ni bucle»), ADR-0408 (la tienda online), ADR-0450 (si la base no responde). Maquetas: `docs/maquetas/tienda-rediseno-2026-10/g-pasarela.html` (la elegida), `docs/maquetas/tienda-cambio-de-sede-y-pestana-2026-10/` (el movimiento) y las rondas descartadas `docs/maquetas/tienda-paleta-2026-10/` y `docs/maquetas/tienda-spike-2026-10/`.

## El problema

Felipe dijo el 2026-10-24 que no le convencían la paleta ni la estética de la tienda («A · Muro»: yeso frío y grafito, Archivo ancha en versalitas), que la sentía
**plana**, y pidió seis direcciones minimalistas. Se dibujaron seis (Blanco, Índigo, Musgo, Mantequilla, Arcilla, Rojo colibrí), se grabó una demo de cada una y
se profundizó un spike de tres (Blanco, Arcilla, Rojo). Al mirar todo, **Felipe volvió a «G · Pasarela»**, de la ronda del 2026-10-17, y dijo: «me gustó el diseño,
animación, estética, orden de pasarela; realicemos ese con esas configuraciones», mostrando la maqueta de movimiento con **«La raya que viaja»** para cambiar de
pestaña y **«El velo»** para cambiar de sede.

Lo que hace especial a la Pasarela, y lo que Felipe quiere conservar: blanco y negro puros con marfil; una Didone (Bodoni Moda) de alto contraste con Public Sans
para el texto; una portada que es un **desfile** (cada prenda sale a un escenario negro, cruza hacia la luz, estalla un flash y sigue su camino); el **programa**
del desfile como lista de «salidas»; el visor que encuadra y dispara al agregar una prenda; la invitación del Club que se da vuelta.

## Lo que se decidió

**1. La dirección visual es G · Pasarela, aplicada a TODA la tienda real**, no solo a las cinco pantallas que la maqueta dibujó (la tienda tiene unas 30 rutas):
Inicio, catálogo y listas, ficha, looks y «Arma el tuyo», bolsa y «Separado», entrar y crear cuenta, Mi perfil, Club y pedidos, tiendas, ayuda y los vacíos. Lo que la
maqueta no dibujó (insignias, campañas y ofertas, favoritos, filtros, campanita, precio por tienda, cuenta regresiva) se diseña con la misma lengua: Didone para los
nombres y las cifras grandes, versalitas de 12 px con tracking ancho para los rótulos, filos de 1 px, sin sombras de adorno y la foto sobre su placa.

**2. Se hace por tokens, sin reescribir componentes.** Como en A: los tokens de `apps/tienda/app/globals.css` conservan su nombre (`--crema`, `--papel`, `--hueso`,
`--tinta`, `--rojo`…) y cambia el color que guarda cada uno; las letras salen de `next/font` (`Bodoni Moda` y `Public Sans`) y reemplazan a Archivo y Newsreader. Las piezas
nuevas (el escenario, el programa, el visor, la invitación) son componentes nuevos o clases nuevas; la cabecera y la ficha se tocan lo mínimo.

**3. El movimiento de navegación es el de la captura de Felipe:**
- **Pestañas: «La raya que viaja»** (opción 1 de la maqueta de movimiento). La raya de la pestaña corre de la palabra vieja a la nueva y el contenido entra de lado en
  el sentido del recorrido; lo que entra de lado es el esqueleto de la pestaña con su título real. **Reemplaza a «El título se cuelga»** (ADR-0466, que había descartado
  la raya el 2026-10-20: Felipe cambió de opinión al ver la Pasarela). En el celular no hay raya: queda el deslizamiento.
- **Sede: «El velo»** (opción 2), que **ya está construido** (ADR-0466): se queda y solo se re-viste con los colores de la Pasarela (el negro al 62 % con desenfoque, las
  letras en Didone).
- La regla de ADR-0466 sigue: **la pantalla de carga manda sobre la animación**; cubre la espera real y termina cuando llega la página.
- La maqueta G tenía su propio paso entre pantallas («las luces bajan y vuelven a subir», 1,15 s en negro): **se descarta**, porque Felipe pidió la raya y el velo.

**4. Tres decisiones de Felipe (2026-10-26), cada una con su porqué:**

- **El desfile es un bucle, con pausa (excepción a «sin bucle»).** La regla de ADR-0430 y ADR-0136 es «ricas, una vez, sin rebote ni bucle». Felipe vio el desfile
  girando y dijo que le gustó; **elige dejarlo como lo vio**. La excepción es solo esta y queda acotada: botón «Pausar el desfile»; se detiene cuando la sección sale de
  la pantalla o la pestaña está oculta; con «reducir movimiento» no corre (queda una prenda quieta y el programa deja elegir cuál); y la **primera prenda ya está quieta
  en la luz al cargar** (la maqueta la hacía aparecer a los ~2,8 s: en la tienda real eso es lo más lento de la portada, que las sesiones de velocidad de 2026-10-17
  acortaron). El desfile empieza desde la segunda prenda, ~1,3 s después de cargar.
- **La campaña manda sobre la portada.** El Inicio real tiene tres portadas (`HeroeDelInicio`: campaña con la imagen que sube el líder, «lo nuevo» y «marca»). Con una
  campaña vigente **la portada es el diseño de la campaña** (imagen, plantilla, sello y cuenta regresiva, que el líder arma en el ERP) y **el desfile baja a «Lo nuevo»**
  como su propia sección; sin campaña, el desfile es la portada. Así el diseño del líder no se pisa.
- **Modo oscuro «backstage».** La tienda ya tiene modo oscuro (`prefers-color-scheme` y `data-theme`) y la maqueta no lo dibujaba. En oscuro todo el sitio pasa a negro y
  marfil (`#0b0b0b`, `#f4f1ea`); el escenario y el Club, que en claro ya eran negros, suben un tono para separarse del fondo; **las fotos siguen sobre una placa clara**,
  porque son prendas recortadas sobre blanco y se funden con ella (`mix-blend-mode: multiply`); y lo que es dato de la prenda (su color) no se oscurece.

**5. Lo que NO se copia de la maqueta:**
- **«Ver precio»**: la maqueta lo pone sin cuenta, pero desde el 2026-10-17 el catálogo, los precios y cuánto hay en cada tienda se ven **sin cuenta**; la cuenta se pide al «Separar».
- **Las versalitas de 10,5 px** con tracking de .26 em: se suben a 12 px (y el cuerpo a 15), con contraste ≥ 4,5 : 1.
- **El rótulo de la tienda en la cabecera**: la maqueta dibuja «Tiendas» como un enlace; la tienda real tiene el **selector de la tienda elegida** (ADR-0455, «siempre una tienda»)
  y se conserva, vestido de Pasarela, junto con el buscador, los favoritos, la campanita, la cuenta y la bolsa.

## Cómo se construye (10 actividades, un commit cada una; Felipe ve captura antes del siguiente)

0 Terreno y papeles (este ADR, `main` al día, maquetas guardadas) · 1 El sistema (tokens claro y oscuro, letras, botones con cortina, foco) · 2 Cabecera, anuncio y pie ·
3 Inicio (el escenario con el desfile, el programa y el orden de la Pasarela) · 4 Catálogo y tarjeta de prenda · 5 La ficha (visor, flash, la foto que vuela, la lupa) ·
6 Bolsa, Separar y «Separado» (la invitación que se da vuelta, el total que cuenta) · 7 Entrar, cuenta, perfil y Club · 8 El movimiento (la raya, el velo re-vestido, los
esqueletos, «reducir movimiento») · 9 Cierre (barrido de anchos y temas, contraste, peso de la portada, pruebas, bitácora, backlog y PR).

**Orden con otros PR:** el PR #1341 (filtros de color y talla en la lista y la ficha que abre ya elegida, ADR-0512) toca las mismas piezas que las actividades 4 y 5: se hacen
después de que se fusione o encima de su rama, nunca en paralelo sobre los mismos archivos.

DECIDÍ: G · Pasarela para toda la tienda, por tokens y sin reescribir los componentes, con La raya que viaja (pestañas) y El velo (sede), el desfile en bucle con pausa, la campaña
mandando sobre la portada y el modo oscuro «backstage».
DESCARTÉ: las seis direcciones nuevas (Blanco, Índigo, Musgo, Mantequilla, Arcilla, Rojo colibrí), porque Felipe las miró y volvió a la Pasarela; **reescribir los componentes** de la
tienda para calzar la Pasarela, porque rompería la cabecera (862 líneas), la ficha (591) y los formularios, que tienen mucho estado y ya están probados; **quitar el modo oscuro**, que
sería un retroceso para quien ya lo usa; **un desfile de una sola vuelta**, porque Felipe quiso el que vio; y copiar «Ver precio».
SE ROMPE SI: (a) el desfile con seis fotos grandes y `mix-blend-mode` pesa en un teléfono viejo o hace perder la portada ganada en velocidad: se mide en la actividad 9 (LCP y cuadros por
segundo) y, si falla, el desfile pasa a una vuelta o a quieto, que es el plan B de Felipe; (b) una campaña sin imagen (solo texto) no tiene qué mandar sobre el desfile: ahí la portada es la
tarjeta de campaña de siempre y el desfile baja igual; (c) la Pasarela pide una estructura distinta en un componente con estado (la cabecera, la ficha) y ya no alcanza con cambiar clases: se
avisa antes de partirlo; (d) la foto de una prenda no es recortada sobre blanco (una foto de modelo): se funde mal con la placa y hay que darle otra caja.

## Todo puede fallar (principio 9)

El diseño no toca a ninguna dependencia externa nueva. Lo que sí depende de otros: las **fuentes** (`next/font` las sirve desde la propia tienda: si Google Fonts no responde en el
build, el build falla, no la página); **la foto que no llega** (se dibuja la prenda sin foto de siempre, nunca una imagen rota); **la base caída** (ADR-0450: `/sin-base`); y el **velo**
(sigue con su tope de 8 s: si la página nunca llega, se disipa y la tienda sigue donde estaba).

## Qué se verifica y cómo

Cada actividad: captura a 1440 y 375 px en claro y oscuro, el contraste medido (≥ 4,5 : 1 el texto, ≥ 3 : 1 los controles), texto de 12 px como mínimo, blancos de 24 px (44 con el dedo) y `pnpm --filter tienda
test`, `typecheck` y `lint`. La tienda **no tiene vista previa de rama** (sus variables viven solo en Producción): fusionar publica, así que todo se mira en local con la pila de clientes antes de fusionar.

## Actualización 2026-10-26 (actividad 8): cómo quedó el movimiento

- **La raya que viaja** (`components/useRayaDelNav.ts`, `cabecera.css`, `vistas.css`): la cabecera tiene UNA raya bajo la pestaña de la sección (`.t-raya`, con `left` y `width` en transición de 0,32 s). Al tocar otra pestaña la cabecera ya la marca (`useCamino`) y a la vez la página entra de lado: la de antes sale 22 px hacia el lado contrario y se apaga (0,2 s), la nueva llega desde 22 px (0,32 s), en el sentido del recorrido (derecha si la pestaña nueva está a la derecha). El sentido lo apunta la cabecera en la página (`--dir`, `data-viaja`) y `Marca` (`Vistas.tsx`) lo quita 500 ms después de empezar la transición, para que el paso del esqueleto a la página sea el fundido de siempre. La raya lleva nombre de transición de vista (`t-raya`): si el navegador reemplaza la cabecera a medio camino (el esqueleto trae la suya), sigue su recorrido en vez de saltar. En el celular no hay raya (la navegación es el menú): queda el deslizamiento hacia la derecha.
- **El esqueleto ya no se mueve** (el título y las tarjetas dejaron de colgarse): lo que entra de lado es la página entera con el esqueleto de la pestaña y su título real; la bolsa y el Inicio, además, esperan quietos y suben/escriben su entrada una sola vez cuando llega la página de verdad.
- **El velo** (cambio de tienda) ya hablaba con los tokens (`--t-hero*`: negro al 62 % con desenfoque, Didone en mayúsculas); solo se le subió el tracking del rótulo a 0,22 em.
- **«Reducir movimiento»:** las transiciones de vista se apagan (`animation: none !important`), la raya se coloca sin recorrido, el desfile no corre y los números no ruedan. `lib/bucles-de-movimiento.test.ts` cuenta los bucles de CSS por archivo (exactos, con su razón) y vigila las condiciones del desfile (pausa, fuera de pantalla, pestaña oculta, sin movimiento).
- **Sin verificar:** el recorrido de la raya con la red lenta y el esqueleto de la ficha y de «Mi perfil» (la prueba con la red frenada no llegó a mostrar el esqueleto: la tienda precarga el de cada ruta y, con la red lenta, ni eso llega); la cabecera sigue sin quedar pegada arriba al bajar (la maqueta sí), decisión pendiente de Felipe.

## Actualización 2026-10-26 (actividad 9): el cierre — barrido, contraste, peso de la portada

- **Barrido de anchos y temas.** 10 pantallas (Inicio, Catálogo, ficha, Looks, Tiendas, Cómo separar, Entrar, Crear cuenta, Olvidé mi contraseña, Bolsa) × 5 anchos (375, 768, 1024, 1440, 1920) × claro y oscuro = 100 combinaciones, con el medidor de oficio de `/formidable` (desborde, texto chico, blancos de toque, contraste, alineación). Tras los arreglos, las 100 salen **sin desborde horizontal y sin hallazgos**. Lo que midió y se corrigió (commit `a72c2f9ba`): texto por debajo de 12 px (el conteo de las píldoras, los rótulos de la ficha y del pie, los chips, el pie de la foto, la cabecera de «cuántos hay», «Estás aquí», la tarjeta del Club) subió a 12 px; el selector de tienda, el nombre de la tarjeta y «Sin pagar en la web» crecieron en zona de toque sin moverse; un contraste bajo que la primera pasada marcó en «Crear cuenta» ya no aparece en la segunda. El único error de consola del barrido («Viewport size changed», de las transiciones de vista) es del navegador sin ventana al cambiar de ancho en plena transición, no de la tienda.
- **Excepción declarada: las insignias de una tarjeta chica** (`.t-insignias .t-insignia`) quedan en **11 px** (tarjeta de ~160 px, dos columnas en el celular) y **10 px** (la más angosta): antes eran 10,5 y 8,5. Van en la esquina de la foto, hasta 3 apiladas (tope de ADR-0489); a 12 px taparían la prenda. Se leen por su texto, no por su color, y la ficha repite el mismo dato en 12 px o más.
- **Peso y velocidad de la portada** (`/inicio` compilado con `next start`, caché fría, contra una compilación de `origin/main` en el mismo equipo y la misma base):

  | | Pasarela | `main` |
  |---|---|---|
  | Escritorio 1440: LCP | **676 ms** (foto del desfile) | 1436 ms (foto) |
  | Escritorio: total / fuentes | 2487 kB / **250 kB** | 2664 kB / 724 kB |
  | Celular (4G lento, CPU ×4): LCP | **5528 ms** (foto del desfile) | 2896 ms (un texto) |
  | Celular: total | 1137 kB (imágenes 198) | 901 kB (imágenes 30) |

  En escritorio la Pasarela es más rápida y más liviana (menos fuentes: `next/font` con solo los ejes que usa). **En el celular con la red más lenta es más lenta, y hay que decirlo:** la portada de `main` no tenía una foto a la vista, la Pasarela pone la primera salida del desfile en la primera pantalla, y esa foto es el LCP. La foto se pide a los 250 ms pero llega a los 5,7 s porque comparte los 1,6 Mbps simulados con el resto de lo que baja (CSS, fuentes, 49 recursos): es una portada limitada por el ancho de banda, no por la animación (la figura entra a 1,8 s y la foto llega más tarde). **Ojo con la medición local:** las URL de las fotos de la base local son las del almacenamiento de producción mientras `TIENDA_FOTOS_ORIGEN` apunta al local, así que `fotoOptimizable` las deja **sin optimizar** (foto original). En Vercel, con las fotos de su propio almacenamiento, salen por `_next/image` (AVIF, al ancho de `sizes`) y pesan bastante menos; el número de producción no se puede medir desde aquí.
- **Decisión que queda abierta (de Felipe):** el plan B del SE ROMPE SI (a) —desfile de una vuelta o quieto— **no se aplicó**: en escritorio no hace falta y en celular el dato local está inflado por la foto sin optimizar. Se mide en producción con la primera fusión (PageSpeed o Lighthouse móvil sobre `/inicio`); si el LCP móvil pasa de ~4 s, lo más barato es que la primera salida del desfile en celular sea la foto más liviana ya optimizada o que la portada llegue quieta (la animación no es lo que pesa).
- **No verificado:** el desfile en un teléfono real (cuadros por segundo con seis fotos y `mix-blend-mode`), la portada con una campaña sin imagen, y las fotos que no son recortadas sobre blanco (sin una foto de modelo en la base local).

## Actualización 2026-10-27: el menú desplegable de «Ropa» y «Accesorios» recupera su ancho

- **Qué pasó:** Felipe vio los nombres de las categorías cortados con «…» («Ca… 39», «To… 22») en el panel de «Ropa». Era una **regresión de la actividad 8**: para colocar la raya que viaja le puse `position: relative` al `<nav>`, y el panel (`.t-mega`, `position: absolute; left: 0; right: 0`) se ancla al ancestro posicionado más cercano, que pasó de ser la fila de la cabecera (todo el ancho) a ser el nav (~620 px). El panel se encogió a ese ancho y apagó, de paso, la vitrina «Recién llegado». El barrido de la actividad 9 no lo vio porque el panel solo existe con el mouse encima.
- **Arreglo:** el nav vuelve a no estar posicionado; la raya se ancla a la fila (`.t-cab-fila`) y `useRayaDelNav` la mide desde su `offsetParent`. `lib/cabecera-mega.test.ts` falla si el nav o el envoltorio del menú vuelven a ser un ancestro posicionado.
- **Además, primero los nombres:** las columnas de los grupos dejaron de toparse en 210 px (`minmax(190px, auto)`: cada una mide lo que pide su categoría más larga) y «Recién llegado» se queda con lo que sobra, apagándose si no llega a 230 px, como antes. Un nombre que aun así no cabe (ventana de 1000 a 1100 px con «Ropa interior/Lencería») baja a una segunda línea en vez de cortarse, y el número de prendas lo sigue en la última línea. Medido con los nombres más largos del catálogo a 1000 y 1440 px: ninguno cortado, sin desborde, raya alineada con su pestaña.
- **Costo (calculado, no medido: la base local no trae prendas recién llegadas para ese menú):** con nombres largos en varios grupos a 1280 px o menos, la vitrina «Recién llegado» puede apagarse antes que antes (los nombres tienen la prioridad). Si Felipe prefiere lo contrario, se vuelve a topar la columna. Falta verlo con los datos reales de producción.
