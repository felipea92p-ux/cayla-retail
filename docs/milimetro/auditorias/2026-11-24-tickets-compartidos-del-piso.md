# Auditoría al milímetro — Vender: «Mandar a la caja» y «Del piso» · 2026-11-24 · `claude/tickets-compartidos-0511`

Medido: la sección «Del piso» dentro del ticket vacío (`punto-de-venta/DesdeElPiso.tsx`, raíz `[data-guia="vender.desde-el-piso"]`) a 1440 × 900
claro y quieto, y en oscuro; el foco con teclado real; «Mandar a la caja» y el chip «Del piso · N» (`PuntoDeVentaTicket.tsx`) a 375 × 812 y a
1440 con la cabecera de 418 px. Medidores del repo cargados enteros (`milimetro`, `espacio`, `tipografia`, `color`, `textos`, `movimiento` de
`.claude/skills/*/referencia/medir.js`). Servidor de la rama contra una base privada con todas las migraciones y el seed, cuenta Líder en Tienda Lima.

Resumen: **0 graves · 0 medias · 0 leves de esta rama** (uno arreglado antes de medir: el chip se salía de la cabecera) · 1 heredado anotado abajo.

## Lo que dijeron los medidores

- **Estados (`/milimetro`), en «Del piso»:** 0 apagados sin motivo, 0 ocupados que se pulsan, 0 errores, 0 etiquetas faltantes, 0 bucles. Marca
  «espera escrita a mano» en «Abrir / Abriendo…»: es `<Boton cargando textoCargando>` (la pieza decidida, ADR-0358), que dibuja las dos palabras
  para no cambiar de ancho. No es hallazgo. **Foco** con teclado real: 2 controles («Abrir» y el basurero), 0 sin anillo, 0 flojos, 0 tapados.
- **Espacio:** 0 blancos bajo 24 px. Lo «fuera de escala» y la proximidad que marca son del catálogo de la izquierda, no de esta sección.
  «Mandar a la caja» mide 44 px de alto (`h-11`); el basurero usa `area-dedo` como el de «En espera».
- **Tipografía:** 0 lecturas bajo 14 px en la sección (el único chico de la página es el chip «Admin · queda a tu nombre», 13 px, escalón de chips
  de ADR-0691); montos con `tabular-nums`.
- **Color:** en claro, 0 textos de la sección bajo 4,5:1; en oscuro, tampoco (los 5 que marca son del catálogo y del marco: «Prenda sin
  registrar», «Todo», «Vestidos», «Punto de Venta», «Retail»).
- **Movimiento:** 0 animaciones nuevas; la sección entra con `anim-sube`, la clase que ya usa el ticket vacío.
- **Medido y arreglado antes de cerrar:** con «En espera · N» al lado, el chip «Del piso · 1» se salía 52 px de la cabecera (scrollWidth 470 de
  418). Ahora, en ese caso, queda el ícono con el número y su nombre va en `aria-label` (scrollWidth 418 de 418).

## Heredados (no son de esta rama)

- **Montos sin espacio** (`/textos`, «montoMal»): Vender escribe «S/79.90» con `lib/money.ts`, sin el espacio que no se parte de ADR-0413. Esta
  rama usa la misma función para no mezclar dos formatos en una pantalla; cambiarlo es de todo Vender.

## Sin medir

- La hoja «Del piso» (desde el chip) y la hoja de cierre con los del piso, con los medidores: se revisaron a ojo en claro.
- `pnpm --filter web tacto:medir` a 375 px con el dedo.
