# Rediseño de la tienda web: maquetas y decisiones (2026-10-31 → 2026-11-02)

**Empieza aquí si retomas esto en otra sesión o con otra cuenta.** Aquí está el estado, lo que Felipe ya decidió, lo que falta decidir y cómo
ver cada maqueta. Nada de esto es todavía una decisión de construir: reemplazaría a «G · Pasarela» (ADR-0524), y el ADR se escribe cuando
Felipe elija mirando (regla de CLAUDE.md, «Skills de diseño de afuera», punto 3).

## Estado (2026-11-02)

La última maqueta es **`i-tienda.html`** (I · tres portadas). Falta que Felipe elija **cuál de las tres portadas** va al inicio: Probador, Frase
u Ocasión. Todo lo demás de la I sale de lo que ya decidió.

## Lo que Felipe decidió, ronda por ronda

1. **31-oct · Informe de referentes** (`docs/investigacion/2026-10-31-vitrinas-shopify-para-la-tienda.md`): de tres rutas eligió la
   **B · Editorial cálido** («y te doy acceso a las fotos de campaña»). Maqueta: `../tienda-editorial-2026-10/`.
2. **31-oct · Pidió dos más** «un poco más elegantes, con fotos de prendas del ERP, full animaciones y sofisticadas»: **C · Atelier** y
   **D · Vitrina de noche**. Eligió la **C por sus animaciones** («me encantan, mantén todo eso»), pero **no le gusta del todo la estética de
   taller**; y de la D le gustó **el panel de los looks que sube al pasar el mouse**.
3. **31-oct · Pidió tres más** con todas las animaciones de la C y los looks de la D: **E · Galería** (neutra), **F · Casona** (otra temática) y
   **H · Hilo** (la C sin el taller). De las tres solo le gustó **la letra de F: Marcellus, en oración** (le gustó cómo se ve el título de la
   ficha, «Casaca Jean / Oversize Clásica»). **No le gusta ninguna temática.**
4. **31-oct · Pidió**: el **cursor normal** («no lo cambies»), **algo ingenioso en el inicio**, y **vistas propias para Inicio y para «Lo
   nuevo»**. Resultado: la **I**, con tres ideas de portada.

En limpio, lo que ya está decidido para la tienda nueva:
- Letra: **Marcellus** en oración para títulos (nunca títulos grandes en mayúsculas) + **Karla** para el texto. Las cifras de Forum (en
  Marcellus el «1» se lee «I»: «S/ II5.00»); esto último lo resolvió Claude, Felipe no lo ha visto aparte.
- **Sin temática** (ni taller, ni galería, ni casona, ni hilo): una tienda de moda cálida y sobria.
- **Cursor normal.**
- **Todas las animaciones de la C** (salvo el cursor propio) y **los looks de la D** (panel que sube al pasar el mouse; fijo en táctil).
- **Inicio y «Lo nuevo» son vistas distintas.**

## Lo que falta decidir (siempre Felipe)

- **La portada del inicio:** Probador, Frase u Ocasión (ver la tercera ronda, abajo).
- **«Hecho en nuestro taller»:** la tienda vende también prendas que no se cosen en el taller; ninguna maqueta desde la E lo promete.
- **Las cifras del taller** (dos de tres están en «— —»).
- **Los cruces prenda ↔ foto de campaña** (hechos a ojo; lista en «Datos»).
- **Si las fotos de campaña pueden subirse al repo** (es público y son fotos de personas): hoy no se suben; se bajan con un script.
- Lo que la tienda real necesita y no existe en la base: medidas por categoría, calce y altura y talla de la modelo (no se inventan).

## Qué sigue cuando Felipe elija

1. ADR con el número reservado (`pnpm reservar adr`), que reemplaza a «G · Pasarela» (ADR-0524) y deja escrito lo de arriba.
2. Plan de construcción en `apps/tienda` actividad por actividad (`/construir`): la paleta y las letras se escriben en
   `apps/tienda/app/globals.css`, que sigue siendo la única fuente de la tienda; nada de `--persist` de `ui-ux-pro-max`.
3. Las maquetas son HTML suelto con datos de ejemplo: se construye con los datos reales de la tienda (stock por tienda, looks del ERP,
   horarios), no copiando el JS de la maqueta.

## Cómo verlas

1. Las fotos de campaña no están en git: `node docs/maquetas/tienda-editorial-2026-10/bajar-fotos.mjs` las baja de Drive (carpeta pública
   «FOTOS PARA WEB ▸ EDITADAS», `1VQaKHGXAwMRKz9f_B8MY61o-sNmump6I`) a `../tienda-editorial-2026-10/fotos/`. Los recortes de las prendas
   (`erp/`) sí están en git: son fotos de producto, sin personas, que ya publica tienda.cayla.pe.
2. `preview_start maqueta-referentes` (o `python3 -m http.server 3031 --directory docs/maquetas`) y abrir
   `http://localhost:3031/tienda-sofisticada-2026-10/i-tienda.html`. Hay que servirlas: la I carga sus portadas con `fetch`.
3. La barra negra de abajo pasa entre vistas, cambia de portada (en la I) y de tema.

| Archivo | Qué es |
|---|---|
| `../tienda-editorial-2026-10/index.html` | B · Editorial cálido |
| `c-atelier.html` · `d-nocturno.html` | C · Atelier · D · Vitrina de noche |
| `e-galeria.html` · `f-casona.html` · `h-hilo.html` | E · Galería · F · Casona · H · Hilo (la G se salta: es «G · Pasarela», la tienda de hoy) |
| `i-tienda.html` + `portadas/*.js` | **I · la última**, con sus tres portadas y su contrato (`portadas/CONTRATO.md`) |
| `datos.js` · `erp/` | 55 prendas reales del catálogo público y sus recortes |

Ojo con las letras: el informe de referentes llamaba «A, B, C» a tres **rutas** (A Pasarela completa, B Editorial cálido, C Catálogo limpio);
las maquetas «C, D, E…» son otra cosa. La B es la misma en los dos.

## Primera ronda: C · Atelier y D · Vitrina de noche (2026-10-31)

| Maqueta | Idea | Letras |
|---|---|---|
| `c-atelier.html` | Claro. La tienda como la mesa de corte del Taller de Lima: papel de patronaje, los recortes del ERP clavados con alfiler y un hilo rojo que cose la página. | Italiana · Instrument Serif · Jost |
| `d-nocturno.html` | Oscuro primero (con modo día). La vitrina de noche: cada prenda bajo su haz de luz, capítulos que cambian la foto al bajar y la prenda que se transforma en la ficha al tocarla. | Fraunces · Manrope |

Se abren con `preview_start maqueta-referentes` → `http://localhost:3031/tienda-sofisticada-2026-10/c-atelier.html` (o `d-nocturno.html`).
La barra de abajo pasa entre Inicio, Catálogo y Ficha y cambia de tema.

## Segunda ronda: E, F y H (2026-10-31)

Al verlas, Felipe eligió la C por sus animaciones, pero no le gusta del todo la estética de taller (papel cuadriculado, alfileres, cinta
métrica); de la D le gustaron los looks cuyo panel sube al pasar el mouse. Pidió tres más con **todas** las animaciones y transiciones de
la C y los looks de la D, «una con otra temática y otra más neutra». Las tres parten de una copia de la C y le quitan lo de taller.
La letra G se salta: «G · Pasarela» es la tienda de hoy.

| Maqueta | Idea | Letras |
|---|---|---|
| `e-galeria.html` | La neutra. Una galería de paredes blancas: negro sobre blanco cal, cada prenda enmarcada con su cartela de museo; el color lo ponen solo las prendas. | Inter Tight · IBM Plex Mono |
| `f-casona.html` | Otra temática. Una casona de sus tres ciudades: arcos de medio punto, cada sección un patio con su muro de color (terracota, añil, ocre, verde). | Marcellus · Karla |
| `h-hilo.html` | La C sin el taller a la vista: se queda solo su firma, el hilo rojo del colibrí que cose la página, con una serif de moda y fotos a sangre. | Bodoni Moda · Albert Sans |

Cada animación de la C sigue en las tres, traducida a su tema: el hilo bajo la cabecera, el titular que sube y los tres recortes que se
asientan, la costura atada al scroll, la sección horizontal fijada («La sala», «Los portales», «La pasada»), el recorte que sigue al cursor
en el índice, la foto de campaña que se abre desde el cursor, el telón entre vistas, los botones magnéticos, las medidas de la ficha, la
caja de talla que se desliza, el vuelo a la bolsa, el cursor «Ver», el carnet del Club en 3D, «Así se separa», las cifras que cuentan y el
revelado al bajar. Además, el menú ☰ del celular abre de verdad (en la C era decorativo). Lo de ejemplo es lo mismo que en C y D; ninguna
dice «Hecho en nuestro taller» (la frase sobre el taller va marcada «por confirmar»).

## Tercera ronda: I · tres portadas (2026-10-31)

De E/F/H a Felipe solo le gustó la letra de F (Marcellus, en oración, como el título de la ficha); ninguna temática. Pidió el cursor normal,
algo ingenioso en el inicio y vistas propias para Inicio y para «Lo nuevo». `i-tienda.html` es una tienda sin temática: Marcellus + Karla
(las cifras salen de Forum, porque en Marcellus el «1» se lee «I»: «S/ II5.00»), paleta neutra cálida, cursor normal, todas las animaciones
de la C menos el cursor y los looks de la D. Vistas: Inicio, Lo nuevo (cifras de la semana, «Recién llegadas» fijada y «Día por día»), Ropa y
Ficha. El inicio tiene tres portadas que se cambian desde la barra de abajo (`?portada=`), cada una en su archivo de `portadas/`:

| Portada | Lo ingenioso |
|---|---|
| `probador.js` | Un probador: tres filas de prendas reales (arriba, abajo, complemento) que se deslizan para armar un look; dice cuánto suma y si está en tu tienda, «Mezclar» lo arma al azar y «Separar el look» lo separa completo. |
| `frase.js` | La tienda te habla: una frase con los datos del día («Hoy en Arequipa te esperan 24 prendas nuevas, 38 que se están acabando y una tienda abierta hasta las 10 p. m.») que es el menú: cada dato abre sus prendas y lleva a su lugar, y la tienda se cambia dentro de la frase. |
| `ocasion.js` | «¿A dónde vas hoy?»: eliges un plan (trabajo, cena, fin de semana, fiesta, viaje) y ves un look con su foto y sus prendas, listo para separar. |

Las portadas hablan con la base por `window.TIENDA` (prendas, stock por tienda, horarios, bolsa, navegación) y se registran en
`window.PORTADAS`. De ejemplo: las fechas de llegada, las combinaciones por plan y lo mismo que en las rondas anteriores.

## Datos

- `datos.js`: 55 prendas reales leídas del catálogo público de tienda.cayla.pe el 2026-10-31 (nombre, precio, categoría, foto y el stock que
  decía su tarjeta en la tienda donde se leyó; por eso algunas dicen Trujillo aunque la cabecera diga Arequipa).
- `erp/`: los recortes de esas prendas (webp de 1080 px), en git: fotos de producto sin personas que ya publica tienda.cayla.pe.
- Cruces prenda ↔ foto de campaña, hechos a ojo y **por confirmar**: Chaleco Cecia ↔ f19/f20, Casaca Jean Oversize Clásica ↔ f32–f35,
  Blusa Emilia ↔ f06, Chaleco Corte Princesa ↔ f21, Top Bandana ↔ f40, Casaca Jean Crop ↔ f50/f51, Cartera Delia ↔ f13/f14.

## Lo que es de ejemplo

Tallas por prenda, calce, medidas, stock por talla, el segundo color de la D, los textos de descripción, los looks y dos de las tres cifras del
taller. Y la frase «Hecho en nuestro taller»: la tienda vende también prendas que no se cosen en el taller, así que esa promesa la decide Felipe
antes de llevarla a la tienda real.

## Movimiento

Todo corre una vez, sin rebote ni bucles, y se apaga con «reducir movimiento». Lo que sigue al cursor solo calcula mientras el mouse se mueve.
