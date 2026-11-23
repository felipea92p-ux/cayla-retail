# ADR-0691 — La letra sale de una escala, y nada baja de 13 px

- **Fecha:** 2026-11-23 · **Estado:** construido en la rama `claude/letra-escala-cerrada` (actividad 1 de la lista de `/construir` de las
  ocho mejoras de estética). Sin migraciones ni base: entra al fusionar y publicar la web. Número reservado con `pnpm reservar adr`.
- **Pidió:** Felipe, 2026-11-19: «algo que quiero cambiar definitivamente es el tamaño de las letras, hay cosas con fuente demasiado
  pequeña y son imposibles de leer». Eligió mirando la lámina `docs/maquetas/escala-de-letra-2026-11/` (en la rama del PR #1976): dio el
  «sí, empieza» sobre la escala B, la recomendada.
- **Sigue a:** el cambio del 2026-09-08 en `globals.css` (primera subida del piso), ADR-0358 fila `texto` (lo que se lee no baja de 14),
  ADR-0611 mejora 5 (44 px con el dedo), ADR-0336 (modo oscuro).

## El problema

Es la segunda vez que Felipe pide letra más grande. La primera, el 2026-09-08, se resolvió desde los tokens: `text-xs` pasó de 12 a 13 px
y `text-sm` de 14 a 15. La queja volvió porque la mayor parte de la letra chica **no pasaba por los tokens**: estaba escrita a mano.

Medido el 2026-11-19 en 31 pantallas del ERP local, a 1440 px:

| Qué | Dato |
|---|---|
| Textos a la vista | 5.191 |
| Por debajo de 14 px | 2.773 (53 %) |
| Por debajo de 12 px | 500; el más chico, 9 px |
| Tamaños distintos en ocho pantallas | 28 (entre 13 y 19 por pantalla) |
| Tamaños escritos a mano en el código, de menos de 22 px | 2.583 en 518 archivos |

## Las decisiones

### 1. Una escala de cinco escalones, con el piso en 13 px

DECIDÍ: la letra de menos de 22 px sale de cinco tamaños, que viven en el `@theme` de `apps/web/app/globals.css`:

| px | Utilidad | En una hoja de estilos | Para qué |
|---|---|---|---|
| 13 | `text-xs` | `var(--text-xs)` | lo más chico que se escribe: etiquetas, chips, conteos |
| 14 | `text-detalle` | `var(--text-detalle)` | la segunda línea de una fila, lo denso de una tabla, los botones |
| 16 | `text-sm` | `var(--text-sm)` | lo que se lee (era 15) |
| 18 | `text-lg` | `var(--text-lg)` | el título de una fila o de una tarjeta |
| 21 | `text-xl` | `var(--text-xl)` | el título de una sección (era 20) |

Un tamaño escrito a mano va al escalón más cercano y, en empate, al mayor (13,5 → 14; 15 → 16). Desde 22 px es exhibición (títulos de
pantalla y de hoja, cifras grandes): no cambia y todavía no se vigila.

`text-sm` sigue siendo «lo que se lee», como en todo el repo (3.589 usos): por eso mide 16 y coincide con `text-base`. El escalón de 14
recibe un nombre nuevo, `text-detalle`, en vez de correr todos los nombres un lugar.

DESCARTÉ:
- **La escala A** (piso en 12): lo chico seguía siendo chico; subía 1 o 2 px.
- **La escala C** (piso en 14, subtítulos a 18): la más cómoda de leer, pero en Existencias empujaba las prendas 170 px hacia abajo.
- **Renombrar los escalones al orden de Tailwind** (`text-sm` = 14, `text-base` = 16): obligaba a reescribir 3.589 clases en más de
  mil archivos, y chocaba con todo lo que las demás sesiones tienen en vuelo.

SE ROMPE SI: alguien vuelve a escribir un tamaño a mano «solo aquí». Para eso está la decisión 3.

### 2. Un puente, para que la letra chica deje de verse hoy

Pasar 2.583 tamaños a la escala lleva varias actividades, módulo por módulo, mirando cada pantalla. Felipe no tiene por qué esperar.

DECIDÍ: `apps/web/app/estilos/letra.css`, el **puente**. Lleva en pantalla cada clase `text-[Npx]` a su escalón: `text-[11px]` se ve a
13 px desde hoy, aunque el archivo todavía no se haya migrado. Va sin capa (le gana a la utilidad de Tailwind, que vive en
`@layer utilities`) y dentro de `:where()` (con peso cero no le gana a ninguna pieza del sistema que ponga su propia letra).

No toca:
- **El papel** (`.papel-fijo`, `[data-papel]`): un ticket, una etiqueta o un rótulo miden lo que mide su papel, y su vista previa tiene
  que verse como saldrá. Además solo vale en `@media screen`.
- **Un dibujo** (`svg`): ahí la letra escala con el dibujo.
- **Lo marcado con `data-letra-fija`**, con su motivo escrito al lado. Hoy: el rótulo de la baldosa de una prenda sin foto.
- **Una clase con variante** (`sm:text-[11px]`): no se puede puentear sin repetir su condición. Las doce que había se pasaron a la
  utilidad de la escala, y la prueba no deja que haya ninguna.

Las hojas de estilo no tienen puente: su `font-size: 11px` se cambia a mano por `var(--text-xs)`. En esta actividad se pasaron las de las
piezas comunes (menú, cabecera, etiquetas, botones, pestañas, títulos, buscador, vacíos, globito, barra de abajo, tabla viva: 85 tamaños
en 12 hojas). La deuda bajó de 2.583 a 2.471.
Las de cada módulo van en su actividad.

DESCARTÉ:
- **Un reemplazo automático de todas las hojas de una vez:** no distingue el papel impreso, las etiquetas de los gráficos ni las
  matrices de tallas, y nadie habría mirado las pantallas que solo se abren al guardar.
- **Esperar a migrar cada módulo:** la letra chica habría seguido a la vista varias semanas más.
- **`zoom` o agrandar la raíz:** los tamaños están en px, no en rem, y agrandaría también lo que no hace falta.

SE ROMPE SI: se usa el puente como destino. Es un puente: cada tamaño que ya no usa nadie se borra de `letra.css`, y cuando la deuda
llegue a cero se borra el archivo.

### 3. Un candado: un archivo nuevo nace con la escala y la deuda solo baja

DECIDÍ: `apps/web/lib/letra-suelta.test.ts`, con una sola definición de «letra suelta» en `apps/web/tema/letra-suelta.mjs` (el mismo
patrón que el beige plano):
- Un archivo que no está en la lista no puede tener una letra de menos de 22 px escrita a mano.
- Un archivo de la lista (`lib/letra-suelta-archivos.ts`) no puede tener **más** que las declaradas.
- El puente tiene que cubrir cada tamaño que la web todavía usa, y llevarlo a su escalón.
- Los tokens de `globals.css` tienen que ser la escala, escalón por escalón.

`pnpm --filter web tema:letra` lista lo que queda y `tema:letra:registro` reescribe la lista al terminar un módulo.

La cuenta por archivo es un **tope** y no un número exacto, a diferencia del beige: con ~6 publicaciones por hora, un número exacto
dejaría `main` en rojo cada vez que otra sesión limpie una clase de un archivo de la lista.

SE ROMPE SI: se marca `letra-fija:` para callar la prueba. La marca pide un motivo de verdad, y lo lee quien revisa el PR.

### 4. Las cifras: los diez dígitos salen de una letra con ancho fijo

DM Sans, la letra del sistema, no trae cifras de ancho fijo. Medido: con `tabular-nums` puesto, «1111» ocupaba 49,9 px y «0000»,
109,5 px. Por eso una columna de dinero no cuadraba dígito por dígito y una cifra que cuenta bailaba de ancho, aunque 445 archivos lo
pedían. Estaba propuesto en `docs/milimetro/propuestas.md` (n.º 1), sin decidir; Felipe lo aprobó al ver la lámina
`docs/maquetas/ocho-mejoras-2026-11/`.

DECIDÍ: una letra que **solo tiene los diez dígitos** (`unicode-range: U+0030-0039`), sacada de Inter, que sí trae cifras de ancho fijo.
Va primera en `--font-sans`: el navegador toma de ella los dígitos y de DM Sans todo lo demás. Se declara en `apps/web/lib/letra-cifras.ts`
con `next/font/local` y la pone el `<html>`. `size-adjust: 96 %` iguala el alto de los dígitos de las dos letras. La serif no cambia:
EB Garamond ya trae cifras de ancho fijo. El archivo sale del paquete `@fontsource-variable/inter` (licencia OFL-1.1), fijado en su versión.

El papel conserva sus dígitos (`app/estilos/cifras.css`): al imprimir, `--font-sans` vuelve a ser solo DM Sans; en pantalla, lo que se ve
como saldrá impreso redefine la variable. Un ticket o una etiqueta están medidos al milímetro con los dígitos de siempre.

DESCARTÉ:
- **Cambiar la letra de todo elemento que pide `tabular-nums`:** un elemento serif que la pide (una cifra grande en EB Garamond) habría
  pasado a Inter, y no hay forma de saberlo desde el CSS cuando la serif se hereda.
- **Cambiar DM Sans por otra letra:** es la del brandbook.
- **Pedir los dígitos a Google en cada visita** (`…css2?family=Inter&text=0123456789`): hoy ninguna letra se pide a un tercero al abrir
  el ERP; `next/font` las sirve desde la propia web.
- **Copiar el archivo de la letra al repo:** el paquete trae su licencia y su versión; un archivo suelto, no.

SE ROMPE SI: se le quita el `unicode-range` (todo el ERP pasaría a Inter) o si deja de ir primera en `--font-sans` (los dígitos
volverían a DM Sans). Las dos cosas las cuida `lib/letra-cifras.test.ts`.

## Lo que cambia a la vista

- Lo que se lee pasa de 15 a 16 px en todo el ERP.
- Las etiquetas en versalitas, los chips, los conteos y las teclas pasan de 9–12,5 a 13 px.
- Los botones pasan de 13,5 a 14 px; los de la cabecera de una pantalla, de 11 a 13 px.
- El menú pasa de 13,5 a 14 px. Plegado, sus nombres cortos pasan de 10 a 13 px, y las filas ganan 8 px de ancho para que «Inventario»
  y «Apariencia» entren.
- Un título de fila que estaba a 17 o 19 px queda en 18; uno de sección a 20, en 21.
- Los dígitos de todo texto en la letra del sistema cambian de forma (son los de Inter) y, donde se pide ancho fijo, cuadran en columna.

## Verificado y no verificado

**Verificado** (ERP local con Supabase local, Chrome de prueba, 31 pantallas a 1440 px y 5 a 375 px, antes y después):
- Textos por debajo de 13 px: de 1.012 a 250, de 6.423. Los 250 que quedan vienen de hojas de estilo propias de cada módulo.
- Textos que quedaron cortados por el cambio: 3 (un nombre de prenda largo en Existencias y dos descripciones de Atributos). Ninguna
  pantalla ganó desborde horizontal.
- El medidor de tipografía del repo, en siete pantallas: de 13–19 tamaños distintos por pantalla a 5–7; cero lectura por debajo de
  14 px en seis de las siete.
- Miradas en captura: Existencias, Compras, la hoja de una talla en claro y oscuro, el menú plegado, y Vender, Cambios, Devoluciones y
  Apartados a 375 px.
- `lib/letra-suelta.test.ts`: 17 casos. Se vio en rojo con un archivo nuevo con `text-[11px]` y con un tamaño quitado del puente.
- Las cifras, en el navegador: con ancho fijo, «1111», «0000» y «8888» miden lo mismo (99,6 px a 40 px de letra); una frase sin
  dígitos mide igual con la letra nueva y sin ella (301,6 px); la serif no cambió. El medidor de tipografía pasó de 36, 10, 5, 30 y 62
  cifras «que piden ancho fijo y no lo tienen» a 0 en las siete pantallas. Las 36 vistas, antes y después de las cifras: 0 cortes nuevos.
  `lib/letra-cifras.test.ts`: 6 casos; se vio en rojo al agrandar el rango de la letra.

**No verificado:**
- Las hojas y los estados que solo se abren al guardar o con la caja abierta (el cobro de Vender, un cambio en curso). Se miran en la
  actividad de cada módulo.
- El Mac mini de la tienda y un teléfono de verdad.
- Una impresión de verdad (ticket, etiqueta, rótulo): la regla que les conserva sus dígitos se revisó en el código, no en papel.
- Lo que tarda en llegar la letra de las cifras con mala conexión: son 48 KB más y, mientras llega, los dígitos se ven en DM Sans.
- Los 250 textos que siguen por debajo de 13 px: Observatorio, gráficos, Plan del piso, Movimientos, Finanzas y la persiana de Caja.

## Dynamic

- **Llega solo:** nada. `recetas.css` y el contrato no cambian.
- **Queda como tarea allá:** las hojas de `apps/web/app/estilos/vidrio/` que pasaron a la escala (`marco.css`, `notas-avisos-combos.css`,
  `tabla-viva.css`) y las piezas de `components/ui/` tocadas (`ResumenSede`, `TarjetaCifra`). Si Dynamic quiere la misma escala, necesita
  sus cinco tokens: `globals.css` no viaja. Lo mismo las cifras: `lib/letra-cifras.ts` y el paquete de la letra son de retail.
