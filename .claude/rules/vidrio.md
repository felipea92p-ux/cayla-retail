---
paths:
  - "apps/web/components/**/*.tsx"
  - "apps/web/app/**/*.tsx"
  - "apps/web/app/**/*.css"
  - "apps/web/app/estilos/**"
  - "apps/web/components/ui/**"
  - "docs/vidrio/**"
  - "docs/familia/**"
---

## El vidrio «Serena» (regla — ADR-0596, Felipe 2026-10-31)

**El ERP es de vidrio, pieza por pieza, y cada receta vive en UN solo lugar: `apps/web/app/estilos/vidrio/recetas.css`** (la placa, la gota,
el pozo, el ahumado, la lente, el velo; con su versión oscura). Las piezas se arman con esas recetas en `app/estilos/vidrio/*.css` (la hoja y
el cajón, los campos y los botones, las notas, los avisos y las listas de combo, el segmento, la barra y el paso de cantidad, el marco), sin
capa: le ganan a `components` y a las utilidades, así que **cambiar una pieza ahí la cambia en todo el ERP** y una pantalla nueva no hace nada.
El idioma: **lo hundido espera tu dato** (el pozo: campos, combos, buscador) · **lo que sobresale es lo que haces o donde estás** (la gota:
botones, la opción activa de una lista, la fila del menú) · **lo que explica es plano** (la placa: notas, filas, tarjetas dentro de una hoja).
Nada sólido sobre el vidrio. Dos cosas que no se tocan sin leer el ADR: **la hoja no lleva `backdrop-filter`** (la volvería el bloque
contenedor de las listas `fixed` de sus combos y las recortaría; el desenfoque lo pone el velo), y **una pieza nueva no inventa su vidrio**:
usa una receta o agrega una a `recetas.css`. Lo que ya se eligió vive en el tablero `docs/vidrio/README.md`.

**Nada de beige plano (Felipe 2026-11-19: «ese color plano le quita la estética al sistema, quítalo de donde sea que aparezca»):** una superficie,
un botón o un estado nunca se rellena con `hueso` o `sand` (`bg-hueso`, `bg-sand/40`, `hover:bg-sand`, `background: var(--color-hueso)`). En el JSX van
las clases de `app/estilos/vidrio/rellenos.css` —`vd-placa` (un bloque que explica), `vd-hundido` (un área de datos), `vd-gota` (un control),
`vd-gota-chica` (una insignia, un monograma), `vd-lente` (un ícono), `vd-marca` (lo elegido), `vd-pasa`/`vd-pasa-gota` (al pasar el mouse) y
`vd-pegado` (lo que va pegado y debe ser opaco)—; en un CSS, la receta en la misma regla. Lo que no es superficie (la pista o escala de un
gráfico, una línea, un esqueleto, el papel que se imprime, la muestra de una prenda sin color) lleva `beige-fijo: <motivo>` en su línea.
Un borde `border-sand` no es relleno y sigue. Lo vigila `lib/beige-plano.test.ts` (definición única: `tema/beige-plano.mjs`; `pnpm --filter web tema:beige`).

**Lo que se desplaza no se desenfoca (ADR-0623, Felipe 2026-11-07):** el fondo (Seda, antes la Aurora) está fijo detrás de todo, así que un `backdrop-filter` en algo que corre con el
scroll (una tabla, una cifra, una tarjeta, un botón de fila) obliga a desenfocar de nuevo en cada cuadro: en un equipo sin buena tarjeta gráfica era 32 cuadros/s
y 18 tirones contra 53 y 0 sin él. Eso va en el **vidrio claro** (`--vidrio-claro-*`), sin desenfoque; el desenfoque es solo de lo que flota quieto (cabecera, menú,
una cabecera pegada, las hojas y sus velos). Ya lo hacen `.tabla-cayla`, `.tarjeta-cifra`, `.resumen-sede`, `TablaViva` y los bloques de `.pantalla-en-vidrio`.

**El vidrio que dobla y el fondo Seda (ADR-0681, Felipe 2026-11-18):** lo que flota quieto (la cabecera, un aviso, el cajón de un módulo, la isla del
celular, un cajón lateral, una hoja) **dobla** lo de atrás en su canto donde el navegador sabe (Chrome y Edge); en los demás, en modo liviano y con
«menos transparencia» o «más contraste», queda el vidrio de siempre. Una pieza nueva que flota lo pide con `useVidrioQueDobla` (`components/ui/`) y
pone su regla en `app/estilos/vidrio/dobla.css`; nunca algo que se desplaza. Tres cosas que no se tocan sin leer el ADR: el relleno `claro` es solo
para una pieza cuyo texto va en tinta plena (su piso de luminosidad lo mide `lib/vidrio-dobla.test.ts`; con texto en taupe, relleno `propio`);
**la hoja sigue sin `backdrop-filter`**: su lente es una hermana (`.hoja-lente`, anclada a su caja); con ella el velo solo oscurece y lo de AFUERA lo desenfoca otra hermana, un marco con el hueco de la hoja (`.hoja-afuera`); y el fondo
**Seda** (`.marco-seda`, solo CSS, sin `filter`) no sale del rango de tonos en que todo texto se lee (`lib/tema-tokens.test.ts`). Seda va de borde a borde: el menú lateral de escritorio no tiene fondo propio (Felipe 2026-11-19).

**El vidrio aguanta (ADR-0611, mejora 7):** quien en su aparato pidió menos transparencia o más contraste ve las mismas piezas macizas y sin desenfoque. Una receta nueva con fondo translúcido
agrega su versión maciza a `vidrio/aguanta.css`: `lib/vidrio-que-aguanta.test.ts` falla si no.

**Retail manda en diseño (contrato de familia v4, Felipe 2026-11-05; `docs/familia/README.md`):** lo que cambie de aspecto aquí llega a CAYLA Dynamic, que trae `recetas.css` con un vigilante. Por eso `recetas.css` **solo lleva variables, en tres formas** (`:root`,
`@media screen { :root[data-tema="oscuro"] }` y `@media (prefers-reduced-transparency: reduce) { :root, :root[data-tema="oscuro"] }`), sin `--color-*` ni `--radius-*` propios: una regla de clase o un `@keyframes` va en otro archivo de `vidrio/`, y `lib/familia.test.ts` falla si no.
Renombrar o quitar una variable de una receta abre una tarea en Dynamic; un `--color-*` nuevo que una receta consuma entra antes al contrato; `recetas.css` y `docs/familia/contrato.json` no se mueven de lugar; y este repositorio sigue público, o el vigilante deja de verlo.

**Los dos sistemas: lo que viaja se publica solo, con cuidado, y siempre se avisa (Felipe 2026-11-05, ADR-0516 act. 2026-11-07).** Sus palabras: «Que se publique solo pero que hay que se cuidadosos y hacerle saber al usuario que es necesario actualizar el diseño en dynamic». La lista de qué le toca a Dynamic está en el `docs/familia/compartidos.json` de Dynamic:
- **Viajan solos** `apps/web/app/estilos/vidrio/recetas.css` y `docs/familia/contrato.json`. El vigilante de Dynamic los ve dentro de la hora y prepara el cambio. Lo publica solo si toca únicamente esos archivos, sus pruebas dan verde, no hay freno y son entre las 22:00 y las 05:00 de Perú. El freno de mano es de Dynamic (`FAMILIA_PUBLICAR`, apagada al 2026-11-07, y `FAMILIA_VIGILANTE = apagado`). Encenderlo o apagarlo lo decide Felipe allá, nunca una sesión de aquí.
- **Se miran** el resto de `apps/web/app/estilos/vidrio/` y `apps/web/components/ui/`. No se copian: si cambian, el vigilante abre una tarea en su aviso y se hace a mano. `globals.css` y `tema.css` no están en la lista, porque un valor de marca viaja por el contrato.
- **Lo que te toca:** si tu cambio toca uno de esos archivos, díselo a Felipe en tu cierre y escríbelo en el PR: «Esto cambia el diseño de Dynamic: llega solo» o «queda como tarea allá», con las piezas. Si cambia **cómo funciona** una pieza, y no solo cómo se ve, di también qué tendrá que hacerse a mano en Dynamic. Desde aquí nunca se escribe en el repositorio de Dynamic.

**Con el dedo, todo se toca en 44 px (ADR-0611, mejora 5):** `app/estilos/tacto.css`, solo con `pointer: coarse`. Una pieza nueva del sistema se suma ahí. **Los íconos y los puntos de color
se DIBUJAN de 44 px** (Felipe 2026-11-16, act. de ADR-0611); lo que va dentro de una frase o de otra pieza de 44, y un botón de ícono sin clase propia, lleva
`area-dedo`, que agranda su área sin cambiar su dibujo. Se mide con `pnpm --filter web tacto:medir`.

**Lo que flota sobre contenido que se desplaza lleva fondo de vidrio, nunca «en el aire» (regla — Felipe 2026-11-04):** una cabecera, una
barra pegada o una fila de herramientas que se queda quieta mientras la pantalla corre por detrás no puede quedar transparente: lo que pasa
por debajo se mezcla con sus botones y se ve roto (la cabecera de «dos islas» lo hacía, con los filtros pasando entre las cápsulas). Se le
pone fondo con **el vidrio de lo que flota** (`--vidrio-flota-fondo` + `--vidrio-flota-filtro`, las mismas variables de las islas, el cajón de
un módulo y la barra de abajo), con su borde que se desvanece si no es una barra a ras, y **se verifica haciendo scroll** con una tabla o
filtros debajo, en claro y en oscuro. No inventes otro color ni otro desenfoque: es la receta de `recetas.css`. Ejemplo hecho:
`.marco-cabecera-fila::before` en `app/estilos/vidrio/marco.css` (la barra rectangular de borde a borde que cubre toda la cabecera; reemplazó a la banda detrás de las dos islas, maqueta: `docs/maquetas/cabecera-banda-2026-11/`).

**Desde el 2026-11-02 esta es LA estética del ERP, y es obligatoria (Felipe):** toda pantalla, modal o pieza nueva o editada sigue esta línea y
se arma con las piezas ya elegidas (la tabla «4.1 Las piezas elegidas» del tablero: hoja Serena, pozo, gota, ahumado, placa Serena, vidrio
claro, lentes, tubo, hundido…), que llegan solas al usar el componente del sistema (`<Modal>`, `<Tabla>`, `<TarjetaCifra>`, `<Chip>`,
`<Buscador>`, `btn-cayla`…). Una pantalla nueva no nace en papel sólido: nada de una tarjeta propia en `card-cayla`/`bg-papel`/`bg-hueso`
con `border-sand` donde una pieza elegida ya responde (un bloque de la pantalla es la placa Serena; muchas tarjetas iguales, el vidrio
claro, sin desenfoque por costo). **Ya no se dibujan maquetas de vidrio:** Felipe cerró esa etapa; lo que falta se **audita** con las piezas
elegidas (tablero, «4.3» y «4.4»), y solo una pieza que no calza con ninguna se le muestra a Felipe con la más cercana. Lo de diseño propio
(«Fuera hasta que Felipe diga» en el tablero) no se toca sin él.
