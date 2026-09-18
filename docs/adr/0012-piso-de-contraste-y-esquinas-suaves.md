# ADR-0012 — Piso de contraste legible y reversión de las esquinas rectas

**Fecha:** 2026-09-08
**Estado:** Aplicado
**Revierte:** la decisión de radio 0 del 2026-09-05 (ver `app/globals.css` y BITÁCORA)

## Contexto

Con el rediseño de Facturación ya en producción (ADR-0011), Felipe pidió tres cosas
sobre **todo el sistema**, no solo esa pantalla:

1. Texto más grande o con más contraste — "las letras pequeñas no se llegan a notar".
2. Que siguiera futurista y elegante pero **menos sharp**: menos bordes en punta, más
   smooth.
3. Más animaciones.

El punto 2 revierte una decisión suya del 2026-09-05, donde se fijó radio `0px` en los
cinco tokens y se desactivaron las utilidades de sombra, siguiendo el brandbook v3.0
("Hermès/The Row/Aesop: cero sombras/gradientes/bordes redondeados"). Se le marcó
explícitamente antes de tocar código; confirmó el cambio de criterio. Queda asentado
acá para que no se lea como drift accidental dentro de seis meses.

El punto 1 resultó medible, no una cuestión de gusto. Midiendo el contraste real de
cada texto renderizado sobre `crema` (#f5f0e8):

| Elemento | Antes | Mínimo AA |
|---|---|---|
| `text-tinta/45` (136 usos, la etiqueta más común) | 2.57:1 | 4.5:1 |
| `text-tinta/40` (73 usos) | 2.46:1 | 4.5:1 |
| `text-ambar` (chips "pendiente") | 3.07:1 | 4.5:1 |
| `text-verde` (chips "aceptado") | 4.21:1 | 4.5:1 |

Es decir: la queja no era de percepción, el sistema efectivamente reprobaba WCAG AA
en su etiqueta más usada. El agravante era la combinación — 9px, versalita, tracking
de 0.2em y 45% de opacidad, las cuatro cosas restando legibilidad a la vez.

## Decisión

**Se sube el piso, no el techo.** La queja era sobre el texto chico; los títulos y
cifras (`text-2xl`, `3xl`, `font-display`) quedan intactos.

- **Tamaños:** `8px→10`, `9px→11`, `10px→11`, `11px→12`. Los tokens `--text-xs` y
  `--text-sm` suben de 12→13px y 14→15px, lo que mueve ~320 apariciones desde un solo
  lugar. Excepción: `EtiquetasGenerator` queda congelado — imprime en rollo físico de
  62×29mm, ahí el tamaño es restricción del hardware, no decisión de diseño.
- **Contraste:** piso de `text-tinta/65` (5.14:1) para todo lo que sea contenido.
  `placeholder:` puede quedar en `/55` porque no es contenido. Medido después: **0
  elementos reprueban AA, el peor está en 4.72:1.**
- **Semánticos:** `--color-verde` #5f7a52→#556e49 y `--color-ambar` #b0812f→#8c631f.
  Además se agregan `--color-verde-profundo` y `--color-ambar-profundo`, SOLO para
  texto sobre su propio tinte: un chip pinta el fondo con su mismo color al 10% y eso
  le come ~0.6 puntos de contraste al texto. `rojo-profundo` ya cumplía ese rol.
- **`label-cayla`:** tracking 0.2em→0.13em y peso 500→600. A 9px el aire entre letras
  compensaba el tamaño; con las etiquetas ya en 11px, ese mismo aire las volvía a
  romper en pedacitos.
- **Radios:** `0px` → escala progresiva 4/8/12/16/22px. Progresiva a propósito: un
  control chico con el radio de una tarjeta grande se ve deformado, no suave.
- **Sombras:** reactivadas SOLO para lo que flota (modal, desplegable, globo de
  ayuda). Un panel sin sombra sobre un fondo del mismo color se ve recortado con
  tijera — que es exactamente el "sharp" que había que sacar. Son sombras de tinta,
  no negras, y muy abiertas. Lo que está pegado al fondo (tarjetas, tablas, celdas)
  sigue sin sombra.
- **Movimiento:** se agregan salidas (`anim-salida`, `anim-velo-salida`), globo de
  ayuda, escalonado de listas, alza al pasar el mouse y un barrido de luz en los
  botones. El easing por defecto arranca más gradual (`cubic-bezier(0.32,0.72,0.24,1)`)
  y las duraciones suben ~20%: eso es lo que se lee como "smooth".

## Consecuencias

- `Modal` cierra en dos tiempos: anima la salida y recién ahí avisa al padre que
  desmonte. Acepta `children` como función que recibe el cierre animado, para que un
  botón "Cancelar" propio salga igual que `Escape`. La forma vieja (nodo) sigue
  funcionando: ningún consumidor se rompió.
- Las rejillas de celdas con `gap-px` necesitaron `overflow-hidden`: sin eso, la celda
  de la esquina asoma cuadrada por debajo del borde curvo. Se aplicó en las 6 pantallas
  que usan ese patrón.
- Los `<Link>` con forma de botón necesitaron `rounded-md` a mano: la capa base solo
  redondea `button/input/select/textarea`, así que habrían quedado cuadrados al lado
  de botones redondeados.
- Las tablas subieron su ancho mínimo de 640 a 760px: con el texto más grande, las
  celdas se partían en dos renglones.
- Riesgo asumido: 61 archivos tocados por sustitución mecánica. Mitigado con `tsc`,
  `eslint`, 51 tests, `next build` y medición de contraste sobre el DOM renderizado —
  no sobre las clases del código.
