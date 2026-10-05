## ♿ Un solo anillo de foco de teclado (2026-10-05, ADR-0351) — sin migración; rama `claude/angry-jennings-1b3f58`

Del informe `/formidable` de Frescura («Lista aparte»). Solo web: CSS y componentes.

- [x] **Medido en el navegador (píxeles reales):** combo/buscador 2,10:1 (1 px), pastilla de sede sin indicador, fila 2,04:1; la cifra
  de `ResumenSede` NO era débil, usaba el azul del navegador (5,56:1, fuera de paleta).
- [x] **Anillo común** (`--foco-color/ancho/separacion` en `globals.css`, tinta 2 px): base para todo `:focus-visible` + regla sin capa para
  `.caja-cayla` y `.fila-cayla`.
- [x] **Piezas compartidas migradas:** `Boton`, combo, `BotonCompacto`, `MenuAcciones`, `FiltrosPildora`, `TarjetaSenal`, `Graficos`,
  `FrescuraFila`; en las tres pantallas recorridas, la tarjeta de prenda y el interruptor de Vender, y la tarjeta, las tallas, el botón de
  acciones y el punto de color de Existencias; las filas con scroll (píldoras de Existencias, categorías de Vender)
  llevan 4 px de holgura y los controles segmentados llevan el anillo hacia adentro, para que el contenedor no lo recorte.
- [x] **Cajas y filas en `@layer components`** (ADR-0105): se quitó `outline-none` a 16 cajas (`caja-cayla`) y 2 filas (`fila-cayla`).
- [x] **Verificado con Tab** en Frescura, Existencias y Vender, a 1280 y a 375 px (ver el cierre en el ADR).
- [ ] **Migrar los 64 anillos propios restantes** (rojo o tinta con transparencia, 47 archivos; `lib/foco-comun.test.ts`, `PENDIENTES_HOY`):
  cada pantalla al tocarse, borrando su `outline-none` y su anillo.
- [ ] **Decisión de Felipe:** el foco de Finanzas (`.fin-control:focus`, borde taupe 55 % ≈ 2,1:1, ADR-0195) ¿se alinea al anillo común?
- [ ] **Lo de afuera de lo medido:** el campo de búsqueda dentro de la lista abierta de un combo (`outline-none`, solo cursor) y `MuestraColor`.
- [ ] **El lateral (`AppShell`) recorta el anillo de cada enlace por los costados** (envoltura `overflow-hidden` sin holgura lateral); se ve arriba y abajo.
- [ ] **Otras pantallas con Tab:** solo se recorrieron tres; el resto del ERP no se midió.
