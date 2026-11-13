# Ficha al milímetro — Hoja «Fusionar productos repetidos», dirección B · «La ficha que se arma»

## 2026-11-13 · diseñar (antes del código)

**Propósito:** juntar dos o tres fichas de la misma prenda en una sola, eligiendo cuál queda y con qué datos, viendo el resultado
armado antes de confirmar. Las ventas, las fotos y el stock no se pierden (ADR-0650).

**Referencia visual y de comportamiento:** `docs/maquetas/fusionar-productos-2026-11/index.html`, dirección B (Felipe la eligió mirando el
2026-11-13; las 10 decisiones, en `docs/backlog/2026-11-13-fusionar-productos-rediseno.md`). **Reemplaza a**
`apps/web/components/fusionar-productos/FusionarProductosHoja.tsx` (la entrada desde `PosiblesDuplicados.tsx`, la vista rápida y la Tabla no cambia).

**Cómo se armó:** `/milimetro diseñar` → `/textos` → `/espacio` → `/tipografia` → `/color` → estados → `/movimiento` → `/graficos` (regla 16).
Medido **leyendo el código** de la rama `claude/fusionar-productos-rediseno` (sin servidor levantado): cada valor dice su `archivo:línea` o su token.
Lo que pide navegador dice «sin medir» y cómo medirlo. Los contrastes salen de `.claude/skills/color/referencia/contrastes.md`.

**Regla 19 (la ficha nunca tiene menos que lo que reemplaza):** la hoja de hoy tiene cosas que la maqueta B no dibuja. **Se conservan todas:**
«Fotos que quedan» con su `<Casilla>` y su «Principal» (ADR-0650, decisión 9), el `<ComboResponsable>` con su candado, el aviso de bloqueos de la
base, el aviso de error de lectura, la nota del costo, el «leyendo» del plan, la guía de foco y el buscador con «¿Es alguna de estas?». Dónde va
cada una está en «Árbol» y en «Choques».

---

## Árbol (reglas 1–4): qué pieza para qué parte

| Parte | Pieza | Rama del árbol |
|---|---|---|
| La hoja | `<Modal variante="hoja" ancho="max-w-[67.5rem]" bloqueado={guardando}>` con `/* unificar-fijo: la ficha que se arma es de diseño propio (dirección B elegida por Felipe 2026-11-13) */`. 1080 px = 67,5 rem. Una sola hoja con tres vistas: `armar` → `revisar` → `listo` (mismo `<Modal>`, cambia `titulo`/`subtitulo`) | decidida (`modal`, 2026-10-14 · 2026-11-05); el ancho propio lo permite la familia con su `unificar-fijo` (como `ClientaFichaModal.tsx:499`) |
| Salida de la hoja | `armar` y `revisar` guardan → «Cancelar» en `pie-acciones`, **sin ×**; `listo` solo se lee → `conCerrar={vista === "listo"}` | decidida (`modal`: una salida a la vista) |
| Bloque «¿Cuál se queda?», «Lo que es distinto», «Fotos que quedan» | `<CampoGuiado id titulo ayuda>` (la marca ✓ / «Sigue» del título es la de la guía) | decidida (ADR-0284) |
| Columna-ficha elegible | **nueva → `/unificar`** (familia propuesta `opcion`, ver Propuestas 1). Se arma con recetas: no elegida = vidrio claro (`--vidrio-claro-fondo`, `--vidrio-claro-filo`) + borde `borde-control`; elegida = `--gota-marca` + `--gota-luz` + borde `tinta` + el visto + `<Chip tono="tinta">Queda</Chip>` | nueva |
| Foto de la columna, de la ficha final y la grande de comparar | `<FotoDePrenda>` (`components/ui/FotoDePrenda.tsx:9`; sin foto: `MosaicoPrenda` con el ícono de la categoría sobre el color, ADR-0333). Hoy solo dibuja 3:4: ver Propuesta 2 | decidida (ADR-0333) + cambio de pieza |
| «Ver ficha» y «N fotos» sobre la foto | botón con la clase `.prod-sobre-foto` (`app/estilos/vidrio/pantalla.css:574`: `--gota-marca` + `--gota-luz`; en oscuro, papel al 88 %) — **sin `backdrop-filter`** (la foto corre con el scroll, ADR-0623; la maqueta le pone `blur(8px)`, se quita) | receta existente |
| Quitar una ficha (con 3) | botón de ícono solo de 32 px, `area-dedo`, `X` de lucide 16 px, `aria-label="Quitar «…» de la fusión"` (la forma de `<LapizEditar>`/`icono-fila`, `vidrio/campos-y-botones.css:231`) | forma A (`icono-fila`) |
| Insignia «El que más vendió» / «El más antiguo» | `<Chip tono="pizarra" versalitas={false}>` con el texto de `motivoSugerido` (`lib/fusionar-productos-reglas.ts:148`) | decidida (`estado`) |
| Buscar / agregar otra ficha | `<Buscador>` + `<ListaSugerencias enLinea>` + `ariaDelBuscador` (como hoy, `FusionarProductosHoja.tsx` `BuscarFicha`); sin escribir, «¿Es esta?» con las sugerencias de `buscar_productos_parecidos`; sin resultados, `<Vacio tamano="chico" icono={<SearchX />}>` | decidida (`buscador`, `campo`, `vacio`) |
| Opción de «Lo que es distinto» | la misma pieza nueva que la columna (Propuesta 1), en su tamaño de fila | nueva |
| Nota del costo | `nota-cayla` (como hoy) | decidida (`aviso`) |
| Fotos que quedan | `<TituloGrupo cuenta nota>` + `<Casilla>` sobre cada foto + `<Chip tono="tinta">Principal</Chip>` (como hoy) | decidida |
| Ficha final «Así va a quedar» | **nueva → `/unificar`**: placa Serena (`--placa-fondo`, `--placa-borde`, `--placa-luz`), pegada (`position: sticky; top: 0`) dentro de la hoja que scrollea. Título del bloque con `<TituloGrupo>` | nueva (receta existente) |
| Matriz color × talla | **nueva → `/unificar`** (familia «matrices de tallas», que hoy queda aparte de `<Tabla>` y tiene 8 versiones: `MatrizIngreso`, `MatrizUnidades`, `MatrizStockFicha`…). Se arma como `MatrizIngreso.tsx` (un `<table>` real con `caption`, `unificar-fijo`), el color con `<CapsulaColor>` (`components/ui/MuestraColor.tsx:29`) | nueva, sobre forma A |
| Barra de stock por sede (comparar) | `<BarraAvance tono="tinta" alto="normal" pct decorativa>` contra la mayor de **todas** las columnas | decidida (`grafico.escala`) |
| Bloqueos de la base | `<Aviso id="fusionar-bloqueos" tono="atencion" titulo="Todavía no se puede fusionar">` | decidida (`aviso`) |
| Error al leer / al fusionar | `<Aviso tono="error">` sobre los botones | decidida (`aviso`) |
| Responsable | `<ComboResponsable>` dentro de `<CampoGuiado id="responsable">`, en la vista `revisar` (ver Choque 6) | decidida (ADR-0162) |
| Pie | `pie-hoja-fijo` + `pie-acciones` + `<PieGuia>`; «Cancelar» `<Boton peso="fantasma">`; «Revisar y fusionar» `<Boton peso="primario" confirma={guiaArmar}>` + `ArrowRight` | decidida (`accion.cancelar`, `boton`) |
| Volver de `revisar` a `armar` | `<Volver onClick a="Volver a elegir">` (la flecha redonda) a la izquierda del pie | decidida (`accion.anterior`, «volver solo es una flecha») |
| No se deshace | `<AvisoNoSeDeshace />` justo sobre los botones de `revisar` | decidida (`accion.eliminar`) |
| «Sí, fusionar» | `<Boton peso="primario" cargando={guardando} textoCargando="Fusionando…" confirma={guiaRevisar}>` + `Merge` | decidida (`accion.guardar`, «lo peligroso» es negro) |
| Sello «Fusionado» | nueva dentro de la excepción de movimiento (Propuesta 5); su receta sale de `ajuste-estampa` (`app/estilos/ajuste-modelo.css:358`) | nueva |
| «Ver la ficha» (listo) | `<BotonVer onClick>` (abre la vista rápida de la que queda) | decidida (`accion.ver`: nunca negro) |
| Hoja «Para comparar» | un segundo `<Modal variante="hoja" ancho="max-w-[67.5rem]" conCerrar>` encima (la pila de ADR-0528 cierra la de arriba con «atrás»); solo se lee: × y nada más en su pie | decidida (`modal`) |
| Miniaturas de la galería | botones con `aria-pressed` (forma de lo elegido: anillo de 2 px de tinta) | forma A (`pildora-cayla[aria-pressed]` como modelo de «elegido») |

**Datos (lo que se ve es lo que pasa, ADR-0650):** todo lo que dice la ficha final y la matriz sale de `previsualizar_fusion_productos`
(`PlanFusion`: `productos`, `variantes` con `trato` `muda|junta` y `conVarianteId`, `resumen`, `bloqueos`). La maqueta calcula la matriz en el
navegador: el código no; lee `plan.variantes`. **Falta un dato:** el **stock por sede** (y piso/almacén) de cada ficha no viene en el plan
(`ProductoPlan.stock` es el total, `lib/fusionar-productos-reglas.ts:31`). Se lee aparte con `fn_existencias(null, ids)`: ver Choque 1.

---

## Texto  (de /textos)

| Lugar (estado) | Texto literal | Regla | Nivel |
|---|---|---|---|
| Título de la hoja (`armar`) | «Fusionar productos repetidos» | B3 | [Norma] Apple HIG |
| Bajada (`armar`) | «Junta las fichas de una misma prenda en una sola. Las ventas, las fotos y el stock no se pierden.» | B3, A2 | [Norma] |
| Bloque 1, título · ayuda | «¿Cuál se queda?» · «Toca la ficha que queda. Las demás pasan a esa; ninguna cambia de lugar.» | B4, B5 | [Práctica] |
| Columna: código · categoría | «CMS-0001 · Camisas y Blusas» (punto medio, F7) | F7 | [Práctica] |
| Columna: cifras | «46» «vendidas» · «31» «en stock» · «3 sep. 2026» «creado» (`toLocaleString("es-PE")`; fecha de Lima, `dateStyle: "medium"`) | F3, F4 | [Norma] CLDR |
| Insignias | «Queda» · «El que más vendió» · «El más antiguo» (de `motivoSugerido`) | A9 | [Práctica] |
| Sobre la foto | «Ver ficha» (lector: «Ver la ficha completa de Blusa Emma») · «4 fotos» | B1, A3 | [Norma] |
| Quitar (lector) | «Quitar «Capa Emma» de la fusión» | A3 | [Norma] |
| Buscador: etiqueta · placeholder | «Buscar otra ficha de esta prenda» · «Busca la otra ficha de «Capa Emma»» (derivado: `/sugerir`, ya en verde) | B4 | [Práctica] |
| Sugerencia sin escribir | «¿Es esta?» (una) · «¿Es alguna de estas?» (varias) | B5 | [Práctica] |
| Búsqueda sin resultado | «No hay otra ficha con «emna»» · «Prueba con otra parte del nombre o con su código.» | B12 | [Práctica] |
| Bloque 2, título · ayuda | «Lo que es distinto» · «Toca el dato con el que se queda. Lo que no está aquí es igual en las fichas.» | B4, B5 | [Práctica] |
| Filas | las de `NOMBRE_CAMPO` (`lib/fusionar-productos-reglas.ts:157`): «Nombre», «Descripción», «Categoría», «Marca y proveedor», «Tejido», «Patrón», «Temporada», «Precio», «Costo»; valores de `valorDeCampo` («Sin descripción», «S/ 79.90» con `soles()`) | B4, F1 | [Norma] CLDR |
| Nota del costo | «El costo que ya sale de las compras no cambia: el elegido va solo en las tallas que todavía no tienen compras.» (la de hoy; la de la maqueta, «sin compras: solo cambian las tallas nuevas», es más corta pero pierde el porqué) | A2 | [Práctica] |
| Fotos que quedan | «Fotos que quedan» + cuenta · «las que no marques se guardan en la ficha repetida» · Casilla: «Quedarse con esta foto de Blusa Emma» · «Principal» | B4 | [Práctica] |
| Ficha final | «Así va a quedar» · «Categoría» «Precio» «Vendidas» «En stock» «Fotos» | B4 | [Práctica] |
| Leyenda de la matriz | «Ya estaba» · «Pasa de la otra ficha» (con 3 fichas: «Pasa de otra ficha») · «Se junta y suma» | B4 | [Práctica] |
| Frase de la matriz | la de la base, `frasesDelResumen` (`lib/fusionar-productos-reglas.ts:271`), nunca la que la maqueta arma en el navegador | A6 | regla del repo (ADR-0650) |
| Pie (`armar`) | «Cancelar» · «Revisar y fusionar» (+ flecha) · `PieGuia` listo: «Todo listo para revisar.»; con bloqueo: «Revisa lo que falta arriba.» | B1, D1 | [Norma] |
| Título · bajada (`revisar`) | «Revisa y fusiona» · «Capa Emma pasa a Blusa Emma.» (dos o más: «Capa Emma y Blusa Ema pasan a Blusa Emma.») | B3, B10 | [Práctica] NN/g |
| Lo que pasa (`revisar`) | las frases de `frasesDelResumen` + «Las etiquetas ya impresas siguen sirviendo al escanearlas.» + «La ficha repetida queda archivada con su historia; nunca se borra.» (las dos, verdad por ADR-0650, decisiones 10 y 14) | B10 | [Práctica] |
| Pie (`revisar`) | `<Volver>` «Volver a elegir» (lector) · `<AvisoNoSeDeshace />` («No se puede deshacer», texto fijo de la pieza) · «Cancelar» · «Sí, fusionar»; cargando «Fusionando…» | B1, B10 | [Norma] |
| Responsable | lo trae `<ComboResponsable>` (no se reescribe) | candado 1 | regla del repo |
| Bloqueos | «Todavía no se puede fusionar» + los mensajes de la base | B7 | [Práctica] |
| Error al leer | «No se pudieron leer las fichas» + `traducirError(…, "leer las fichas", { lectura: true })` | B7 | [Práctica] |
| Error al fusionar | `<Aviso tono="error" titulo="No se pudo fusionar">` + `traducirError(…, "fusionar los productos")` + «Las fichas siguen como estaban.» (verdad: la función es una transacción) | B7, A7 | [Norma] WCAG 3.3.1 |
| Listo | sello «Fusionado» · «Blusa Emma es ahora una sola ficha» · «Lleva 49 prendas vendidas y 39 en stock. La ficha repetida quedó archivada.» · `<BotonVer>` «Ver la ficha» | B8 | [Norma] 4.1.3 |
| Comparar: título · bajada | «Las fichas, una al lado de la otra» · «Lo que importa de cada una para decidir cuál queda.» | B3 | [Norma] |
| Comparar: bloques | «Ventas» («Vendidas», «En cuántas ventas», «Última venta» = «12 nov. 2026» o «Sin ventas») · «Stock por sede» + total («Lima 18 · 6 en almacén») · «Tallas y colores» · «Precio y alta» («Precio», «Costo» solo si `costo !== null`, «Marca», «Proveedor», «Creado») | F4, A9 | [Norma] CLDR |
| Miniatura (lector) | «Foto 2 de Blusa Emma» | A3 | [Norma] |

**Formatos:** montos con `soles()` de `lib/compras-reglas.ts` (F1; `S/` con espacio duro, `lib/montos-sin-corte.test.ts`); fechas «3 sep. 2026»
de Lima (F4); cantidades `es-PE` (F3). La maqueta escribe «hace 4 días» y «(6 alm.)»: se cambian por la fecha y «6 en almacén» (sin abreviatura).
**De otros:** el placeholder del buscador → `/sugerir` (ya derivado); «Sigue: … · quedan N» → `/focus`; las piezas → `/unificar`.
**Medido:** sin medir (`auditar.pl` corre sobre el código, que todavía no existe; corre `perl .claude/skills/textos/referencia/auditar.pl components/fusionar-productos`
al terminar, y `medir.js` a 1440 y 375 con las tres vistas y la hoja de comparar abiertas).

---

## Espacio  (de /espacio)

Densidad: **cómoda** (escritorio con mouse; `tacto.css` agranda con `pointer: coarse`). Una sola en la hoja.

| Parte | Medida | Token / origen | Nivel |
|---|---|---|---|
| Hoja | 1080 px máx. (`max-w-[67.5rem]`, ancho a medida con `unificar-fijo`); relleno 24 (`p-6`, `Modal.tsx:278`); radio `--radius-hoja` 32 | `Modal.tsx`; `globals.css:349` | regla del repo (ADR-0358, ADR-0596) |
| Cuerpo en dos columnas | izquierda `minmax(0,1fr)` + derecha **340**, hueco **24** (la maqueta dice 22: fuera de escala → 24) | escala A1 | [Práctica] |
| Bajo un ancho de cuerpo de 880 px (`@container`) | una columna: la ficha final baja después de «Lo que es distinto» y deja de pegarse | B7 (`@container`, no la ventana) | [Norma] CSS Container Queries |
| Entre bloques (¿Cuál se queda? · Lo que es distinto · Fotos) | 24 arriba del título, 8 entre título y contenido (la maqueta: 22/10 → 24/8) | A4 adentro ≤ entre | [Práctica] |
| Mesa de columnas | una columna por ficha, `minmax(180px, 1fr)`, hueco **12**; sin la columna de rótulo «Fichas» de 100 px de la maqueta (no dice nada que el título no diga, y le quita 100 px a tres fichas) | A1 | [Práctica] |
| Ancho de una columna (calculado) | 2 fichas: (1080 − 48 − 24 − 340 − 12) / 2 ≈ **328 px**; 3 fichas: ≈ **214 px** | cálculo, sin medir | — |
| Si no cabe (3 fichas a 1024 px) | la mesa pasa a fila deslizable con `scroll-snap-type: x mandatory`, columnas de 214 px; nunca scroll de la página | B7, B30 | [Práctica] |
| Columna | relleno **12**; radio `--radius-tarjeta` 22; foto con radio `--radius-lg` 12 (concéntrico: 22 − 12 = 10 ≤ 12, no más redondo que su contenedor ✓) | E21, E22 | [Práctica] |
| Foto de la columna | **4:3** (la maqueta 5:4; la familia de fotos de la prenda usa 3:4: ver Propuesta 2) | — | sin fuente |
| Cifras de la columna | con columna ≥ 240 px (`@container`): tres baldosas, hueco 8 (maqueta 6 → 8), relleno 8, radio `--radius-lg` 12; con < 240 px: tres renglones, hueco 4 | A2, A4 | [Práctica] |
| Visto ✓ | círculo de **24** (en la opción, 24; la maqueta 22 → 24), a 12 del borde superior derecho | A1 | [Práctica] |
| «Ver ficha» | alto **32** (objetivo con mouse), relleno 0 12 (maqueta 11 → 12), hueco ícono-texto 6 (medio paso dentro de un control ✓), a 8 de los bordes de la foto; con dedo 44 por `area-dedo` | D17, D18 | [Norma] W-258 · [Práctica] |
| Quitar × | 32 × 32 (maqueta 28 → 32), `area-dedo`, a 8 del borde | D17 | [Práctica] |
| Franja de agregar | debajo de la mesa, hueco 12; `<Buscador>` 44 de alto (lo trae); la sugerencia es una fila de 48 (`<ListaSugerencias>`) | C13 | regla del repo |
| Fila de «Lo que es distinto» | rótulo de 100 px + una celda por ficha alineada **bajo su columna** (misma rejilla que la mesa: si la mesa desliza, las filas también se apilan, ver 375 px); hueco 12 entre celdas, **8** entre filas | A4 | [Práctica] |
| Opción | alto mín. **48** (maqueta 46 → 48), relleno 12 · 40 (el visto) · 12 · 16; radio `--radius-campo` 14 (es un control) | C15, E21 | [Práctica] |
| Ficha final | relleno 16; radio `--radius-tarjeta` 22 (la maqueta 26: no existe → 22); foto 4:3 (308 × 231 calculado); `dl` en dos columnas, hueco 8 · 12 | E21 | [Práctica] |
| Matriz grande (revisar, comparar) | celda alto **48** (maqueta 52 → 48), radio `--radius-lg` 12, hueco **8**; columna de color 112 (maqueta 110), tallas `minmax(56px, 1fr)` | A1 | [Práctica] |
| Matriz chica (ficha final) | celda alto **36**, radio `--radius-md` 8, hueco **4**; columna de color 72, tallas `minmax(28px, 1fr)` | A1 | [Práctica] |
| Pie | `pie-hoja-fijo` (`globals.css:1978`) + `pie-acciones`; botones de 40 (`btn-cayla`) | regla del repo | — |
| Comparar | columnas `repeat(n, minmax(0, 1fr))`, hueco 16 (maqueta 14 → 16); galería 4:3 hasta 256 px de alto (maqueta 260 → 256); miniaturas **48 × 64** (3:4; maqueta 44 × 52, fuera de escala), hueco 8; bloques de placa con relleno 12, radio `--radius-lg` 12, hueco 12 entre bloques | A1, D18 | [Práctica] · [Evidencia] PARHI |
| Revisar | ficha final de 300 + lista, hueco 24; lista con filas de relleno 12, hueco 8 | A4 | [Práctica] |
| Sello (listo) | 120 × 120, borde 3 px (la maqueta; 3 px es grosor de trazo, no espacio); 32 arriba y 32 abajo del bloque | A1 | [Práctica] |

**Materia (regla 4 / F24):** lo elegido es **gota** (`--gota-marca`), lo elegible **vidrio claro** (se desplaza: sin desenfoque, ADR-0623), lo que
explica **placa** (ficha final, bloques de comparar), lo que espera un dato **pozo** (`<Buscador>`). Nada sólido sobre el vidrio. La sombra de la
gota es su `--gota-luz`; ninguna `shadow-*` propia (la maqueta pone `0 14px 30px -18px`: se quita, la luz de la receta ya la trae).

**375 px:** el `<Modal>` ya es la hoja de abajo con asa (ADR-0479), relleno 24 y `safe-area`. Las columnas deslizan (`grid-auto-flow: column`,
`grid-auto-columns: 78%`, snap al inicio) y se asoma la siguiente; las filas de lo distinto pasan a una por ficha, apiladas, cada opción con
«de CMS-0001» debajo (la columna de arriba puede no estar a la vista); la ficha final baja al final y deja de pegarse; el pie, en mitades. La
hoja de comparar desliza igual (columnas al 86 %).

**Área de toque:** columna entera ≥ 214 × 300 ✓ · opción ≥ 48 ✓ · «Ver ficha», ×, miniaturas: 32–48 con mouse (≥ 24 AA ✓), 44 con dedo por
`area-dedo` → **sumar `.ver-ficha` (si nace clase propia) a la lista de `tacto.css:33`**.
**Fuera de escala:** ninguno en la ficha (los de la maqueta están corregidos arriba). **Verificado con:** sin medir (correr `medir.js` y
`medir-oficio.js` a 1440, 1024 y 375 con 2 y 3 fichas, y `pnpm --filter web tacto:medir`).

---

## Tipografía  (de /tipografia)

| Texto | Qué hace la persona | Pieza / clase | Letra · tamaño/interlineado · peso · tracking | Nivel y fuente |
|---|---|---|---|---|
| Título de la hoja | escanea | `<Modal titulo>` (`.hoja-serena > h2.font-display`, `vidrio/hoja.css:41`) | EB Garamond · 27/1,1 · 600 | decidido (ADR-0596) |
| Bajada de la hoja | lee | `<Modal subtitulo>` | DM Sans · 15/1,4 · 400 · taupe | decidido (`texto`) |
| Título de bloque y su ayuda | escanea / lee | `<CampoGuiado titulo ayuda>` | lo que traiga la pieza (no se reescribe) | decidido (ADR-0284) |
| Nombre en la columna | escanea | título de una fila | DM Sans · 15/1,25 · 600 (maqueta 15,5 → 15: la rampa no tiene 15,5) | decidido (fila `texto`) |
| Código · categoría | escanea | `.texto-detalle` | DM Sans · 14/1,4 · 400 · taupe (maqueta 13 → 14, piso de lectura) | [Evidencia] Legge y Bigelow 2011 |
| Cifra de baldosa | compara | — | DM Sans · 15 · 600, `tabular-nums` (no hace nada en DM Sans: Propuesta 1 de `/tipografia`; las tres cifras no van en columna, así que no hace falta) | [Verificación] |
| Rótulo de baldosa | escanea | `label-cayla` | DM Sans · 11 · 600 · mayúsculas 0,13 em («VENDIDAS»): la maqueta pone 11,5 px en minúscula, bajo el piso de lectura → versalitas | decidido (`etiqueta-campo`) |
| Cifras en renglones (columna < 240 px) | lee | `.texto-detalle` | cifra 15 · 600 + palabra 14 · 400 | [Evidencia] |
| Rótulo de fila («NOMBRE») y de tallas | escanea | `campo-etiqueta` | DM Sans · 11 · 600 · 0,13 em | decidido |
| Valor de una opción | compara | — | DM Sans · 15/1,4 · 400 (maqueta 14 → 15, `text-sm`); su línea secundaria 14 | decidido (`texto`) |
| Ficha final: nombre | lee | — | EB Garamond · **24**/1,1 · 500 → **600** (la rampa: 24 es el título de cajón, peso 600; 500 no está en la rampa de la serif) | decidido (`cajon`) |
| Ficha final: `dt` · `dd` | escanea · compara | `.texto-detalle` / título de fila | 14 · 400 · taupe / 15 · 600, a la derecha (maqueta 13,5 → 14/15) | [Evidencia] |
| Matriz grande: número · marca | compara | — | DM Sans · 15 · 600 · `tabular-nums` / «pasa», «+3»: 11 · 600 · 0,04 em (maqueta 10,5 → 11, piso de etiqueta) | [Práctica] Material Label S |
| Matriz chica: número · marca | compara | — | 13 · 600 / «+3» 11 · 600; **sin la palabra «pasa»** (a 9,5 px no se lee): la dice la forma de la celda y la leyenda | [Práctica] |
| Color de la fila | escanea | — | DM Sans · 14 · 500 (maqueta 13,5 → 14) | [Evidencia] |
| Leyenda | escanea | `text-xs` | 13/1,5 · taupe (etiqueta de gráfico, fuera del piso de 14) | regla del repo (fila `texto`) |
| Frase de la matriz y lista de revisar | lee | `text-sm` | 15/1,55 · 400, medida ≤ 68 ch (`.resumen-frase`) | [Práctica] Bringhurst |
| Listo: título · frase | lee | — | EB Garamond 27/1,1 · 600 (maqueta 28 → 27, título de hoja) / DM Sans 15/1,55, `max-w` 46 ch | decidido |
| Sello «Fusionado» | ve | — | EB Garamond · 22 · 400 (el título de un vacío) | decidido (`vacio`) |
| Botones | hace | `btn-cayla` | 13,5/1,25 · 500 (en la hoja, nunca versalitas) | decidido (`boton`) |
| Comparar: rótulo de bloque | escanea | `label-cayla` | 11 · 600 · 0,13 em (maqueta 10,5 → 11) | decidido |

**Medida:** la lista de revisar y la frase de la matriz, ≤ 68 ch. **Cifras:** en las celdas, centradas (una sola cifra por celda; no hay
columna que alinear); en `dl`, a la derecha. **Español:** probar con «Camisas y Blusas», «Marca y proveedor», «Pasa de la otra ficha» y un nombre
de 40 letras a 214 px. **Accesibilidad:** 1.4.12 y 200 % sin medir (`medir.js` modo `espaciado`; ninguna caja con texto lleva alto fijo: celdas y
opciones con `min-height`).

---

## Color  (de /color)

Tema medido: claro y oscuro (de `contrastes.md`; los pares sobre degradado de vidrio no valen de tabla: ver «Vidrio»).

| Elemento | Rol | Token claro / oscuro | Sobre | WCAG claro / oscuro | Puerta | Fuente |
|---|---|---|---|---|---|---|
| Nombre, cifras, valores | texto | `tinta` | papel | 16,44 / 13,67 | 4,5 | [Norma] 1.4.3 |
| Código, `dt`, leyenda | texto 2.º | `taupe` | papel | 5,58 / 6,94 | 4,5 | [Norma] 1.4.3 |
| Rótulos versalitas | texto 2.º | `tinta` al 64 % (el piso de `tema.css`; la maqueta usa `--t65`) | papel | 5,11 / 5,82 | 4,5 | regla del repo (ADR-0336) |
| Columna y opción **no elegidas** | control | relleno `--vidrio-claro-fondo` + **borde `borde-control`** (la maqueta usa el borde al 45 %: no pasa 1.4.11) | hoja | 3,82 / 3,80 (borde sobre papel) | 3 | [Norma] 1.4.11 |
| Columna y opción **elegidas** | estado | `--gota-marca` + `--gota-luz` + borde `tinta` (la maqueta: tinta al 70 %; plena da más y no es sólido) | hoja | borde 15,4 / 13,7; cambio de borde entre estados `borde-control` → `tinta`: sin medir (≥ 3 esperado) | 3 | [Norma] 1.4.11 |
| Visto ✓ | estado | círculo `tinta`, trazo `crema` (trazo 3, `unificar-fijo` de iconos) | gota | ≈ 15 / 13 | 3 | [Norma] 1.4.11 |
| Hover de lo no elegido | — | borde `tinta` al 40 % → solo en `@media (hover: hover)`; no baja el borde de reposo | — | — | — | [Norma] MQ4 |
| «Queda» | estado | `<Chip tono="tinta">` | gota | sin medir (lo trae la pieza) | 4,5 | decidido (`estado`) |
| «El que más vendió» | info | `<Chip tono="pizarra">` | vidrio claro | 5,17 / 5,59 (sobre papel) | 4,5 | [Norma] 1.4.3 |
| «Ver ficha», «4 fotos» | control sobre foto | `.prod-sobre-foto` (gota-marca; oscuro: papel 88 %) + letra `tinta` | foto (dato) | sin medir: depende de la foto; `.prod-sobre-foto` ya se usa sobre fotos de Productos | 4,5 | regla del repo |
| Foto sin foto | dato | `MosaicoPrenda` con `data-color-dato` (no cambia de tema) | — | — | — | regla del repo (ADR-0333) |
| Celda «ya estaba» | dato | `tinta` al 4 % de fondo, número `tinta` | placa | ≈ 15 / 13 | 4,5 | [Norma] |
| Celda «pasa» | dato | `pizarra` al 12 % + **contorno punteado** `pizarra` al 35 %; marca `pizarra` | placa | ≥ 5,17 / ≥ 5,59 (medido para /15; /12 es más claro, da algo más) | 4,5 | [Norma] 1.4.3 + 1.4.1 (forma) |
| Celda «se junta» | dato | `verde` al 12 % + contorno continuo `verde` al 40 %; «+3» en `verde` | placa | ≥ 5,27 / ≥ 6,04 | 4,5 | [Norma] 1.4.3 |
| Celda vacía | — | «—» en `tinta` al 30 % (fantasma a propósito: no es dato) | placa | 2,4 (exento: decorativo) | — | regla del repo |
| Barra de stock | dato | `<BarraAvance tono="tinta">`: relleno tinta, pista arena | placa | relleno contra pista > 3 (la cifra va escrita al lado: exenta igual) | 3 | [Norma] 1.4.11 |
| Bloqueo | estado | `<Aviso tono="atencion">` | hoja | lo trae la pieza | 4,5 | decidido |
| No se deshace / error | error | `<AvisoNoSeDeshace />`, `<Aviso tono="error">` (`rojo-profundo` sobre su tinte) | hoja | 7,03 | 4,5 | decidido |
| Sello | logro | borde y letra `verde` | papel | 6,56 / 8,37 | 3 (texto grande) | [Norma] 1.4.3 |
| Foco | foco | `--foco-color` tinta, 2 px a 2 px | — | 15,4 | 3 | regla del repo (ADR-0351) |

**Rojos en pantalla:** `armar` 0 (el `btn-primario` pasa a `rojo-profundo` solo al pasar el mouse) · `revisar` 1 (`<AvisoNoSeDeshace />`) · con error
de guardado, 2. Dentro del presupuesto de 2.
**Sin color solo:** elegida = ✓ + «Queda» + borde; opción elegida = ✓; «pasa» = punteado + palabra (grande) o punteado + leyenda (chica); «se junta» =
«+N»; «ya estaba» = sin contorno; bloqueo = título + ícono.
**Daltonismo:** `pizarra`/`verde` en tritanopía ΔE 5,5 (claro) y 8,6 (oscuro): **vecinos en la matriz** → se separan por forma (punteado frente a
continuo) y por texto («+N»). Ningún otro par de dato va vecino.
**El punto verde de «Así va a quedar» de la maqueta se quita:** el verde es «hecho» en el semáforo (§A7) y ahí no dice un estado.
**Vidrio:** el texto sobre `--gota-marca`, `--vidrio-claro-fondo` y `--placa-fondo` dentro de la hoja Serena va sobre degradado: lo mide
`lib/vidrio-contraste.test.ts`, que **hay que ampliar** con estos tres pares (tinta y taupe sobre gota-marca y vidrio claro, en los dos temas).
**Aguanta:** con menos transparencia, `--gota-marca` pasa a `hueso` (`vidrio/aguanta.css:13`) y el vidrio claro a papel: el borde tinta sigue diciendo cuál es.
**Cómo se verificó:** `contrastes.md` (2026-11-12) leído; sin medir en navegador (`medir.js` de `/color` con cada vista abierta, en los dos temas, y
`pnpm --filter web tema:auditar -- --ruta /productos --escenarios` con un escenario nuevo por vista en `tema/escenarios/registro.mjs`).

---

## Estados  (de /milimetro)

### Columna-ficha (radio de «¿Cuál se queda?») · nueva → `/unificar`

| Estado | Qué se ve (token / clase) | Qué se anuncia (ARIA) | Cómo se mide | Nivel · fuente |
|---|---|---|---|---|
| default | vidrio claro + borde `borde-control`; foto, nombre, código, cifras, insignia | `role="radio"` en un botón que cubre la columna (no la columna entera: «Ver ficha» y × van **fuera** de él, hermanos encima; un botón dentro de un radio es interactivo anidado), `aria-checked="false"`, nombre = nombre + código, `aria-describedby` con las cifras | medir.js · contraste; axe `nested-interactive` | [Norma] 1.4.11, 4.1.2 |
| hover | solo `@media (hover: hover)`: borde `tinta` al 40 % en `--t-resp` | — | medir.js · hoverSueltos; `lib/hover-con-mouse.test.ts` | [Norma] MQ4 |
| focus-visible | anillo `--foco-*` 2 px / 2 px de separación sobre el radio de la columna (22 px); `overflow` de la mesa deslizable no lo recorta (relleno de 4 en la pista) | — | medir.js `{ foco: true }` | [Norma] 2.4.7, 2.4.13 |
| active | `scale: 0.985` en `--t-resp` (una columna es grande: 0,97 la deforma) | — | a ojo + /movimiento | [Práctica] M3 |
| selected | gota (`--gota-marca` + `--gota-luz`), borde `tinta`, ✓ de 24 px, `<Chip tono="tinta">Queda</Chip>` tras el nombre. **No cambia de lugar** (orden en que se agregaron) | `aria-checked="true"`; grupo `role="radiogroup" aria-label="La ficha que se queda"`; flechas mueven y eligen (patrón radio de APG), Tab entra a la elegida | medir.js · seleccion | [Norma] 1.4.1, 4.1.2 |
| disabled | solo mientras guarda (`guardando`): opacidad 0,5 de `btn`, sin hover | `aria-disabled="true"` | medir.js · apagados | regla del repo (ADR-0611) |
| loading | al cambiar la que queda, la columna ya se ve elegida (es de la persona); lo que recalcula la base (matriz, cifras de la ficha final) se atenúa al 60 % hasta que llega el plan | `aria-busy="true"` en la ficha final | medir.js · cargando | regla del repo (ADR-0149: lectura sin loader) |
| error | no aplica en la columna: si la base no responde, `<Aviso tono="error">` «No se pudieron leer las fichas» sobre el pie | — | en el navegador con la base caída | regla del repo (`aviso`) |
| read-only | no aplica: una columna siempre se puede elegir | — | — | — |
| vacío | con una sola ficha: la mesa muestra esa columna (elegida por defecto) y, a su lado, la franja de agregar con «¿Es esta?»; la guía dice «Sigue: Ficha repetida» | — | en el navegador | [Práctica] NN/g |
| quieto | gota y ✓ ya en su sitio, sin la cascada de entrada ni el trazo; el cambio de borde y fondo queda (color, no movimiento) | — | medir.js con `data-movimiento="quieto"` | [Norma] 2.3.3 |

### Opción de «Lo que es distinto» (radio) · nueva → `/unificar` (la misma pieza en tamaño de fila)

| Estado | Qué se ve | ARIA | Cómo se mide | Nivel |
|---|---|---|---|---|
| default | vidrio claro + borde `borde-control`, 48 px, valor 15 px | `role="radio"` dentro de `role="radiogroup" aria-label="Nombre"` | medir.js | [Norma] 1.4.11 |
| hover | borde tinta 40 %, solo con mouse | — | hover-con-mouse.test | [Norma] MQ4 |
| focus-visible | anillo del sistema (radio 14) | — | `{ foco: true }` | [Norma] 2.4.7 |
| active | `scale: 0.97`, `--t-resp` | — | a ojo | [Práctica] |
| selected | gota + borde tinta + ✓ de 24 (forma, no solo color: lo pidió la auditoría del 2026-11-12) | `aria-checked="true"` | medir.js · seleccion | [Norma] 1.4.1 |
| disabled | solo guardando | `aria-disabled` | apagados | regla del repo |
| loading | no aplica: elegir un dato no lee la base salvo `categoria` (que cambia la clave del plan): entonces la ficha final se atenúa, como arriba | — | — | — |
| error | no aplica en la opción | — | — | — |
| read-only | no aplica: si el valor es igual en todas, la fila no se dibuja (`camposAElegir`) | — | — | — |
| vacío | «Sin descripción», «Sin categoría»… (`valorDeCampo`): se elige igual | — | lectura | [Práctica] |
| quieto | gota y ✓ en su sitio; el valor de la ficha final cambia sin voltearse y lo anuncia la región viva | — | quieto | [Norma] 2.3.3 |

### «Ver ficha» (botón sobre la foto)

default `.prod-sobre-foto` + `Expand`/lente 16 px + «Ver ficha», 32 px, nombre «Ver la ficha completa de …» · hover: la gota de `btn` (`--gota-fondo-encima`), solo con mouse · focus-visible: anillo del sistema, **no lo recorta** el `overflow: hidden` de la foto (el botón va fuera de la caja recortada, o el anillo con `outline-offset` hacia adentro: sin medir) · active `scale 0.97` · selected: no aplica (abre una hoja) · disabled: no aplica (leer no se apaga, ni guardando) · loading: no aplica (los datos de comparar ya están en el plan; si se amplía la lectura con el stock por sede, «Ver ficha» abre la hoja con esqueleto en el bloque «Stock por sede») · error: en la hoja de comparar, el bloque que no se pudo leer dice «No se pudo leer el stock por sede» (`<Vacio tamano="chico">`) · read-only: no aplica · vacío: no aplica · quieto: sin luz ni subida.

### Quitar × (con 3 fichas, en las no elegidas)

default 32 px, `X` 16 px, `.prod-sobre-foto` sobre la foto, nombre «Quitar «…» de la fusión» · hover gota · focus anillo · active 0,97 · selected no aplica · disabled guardando · loading: la columna sale y el plan se vuelve a leer (ficha final atenuada) · error: si la lectura falla, `<Aviso tono="error">` · read-only no aplica · vacío: con 2 fichas no se dibuja (quitar una dejaría una sola: se cancela la hoja) · quieto: la columna desaparece sin salida animada. **El foco** va a la columna siguiente (o a la anterior si era la última): nunca se pierde al `body`.

### Buscador y sugerencia

Los once estados los trae `<Buscador>` + `<ListaSugerencias>` (decididos; «Buscando…» solo si pasa de 350 ms, `<Vacio>` al no encontrar, Escape
cierra la lista con `stopPropagation` y el segundo cierra la hoja, ADR-0136 act. 2026-09-26). La sugerencia «¿Es esta?» es una fila de
`ListaSugerencias` o un `btn-secundario btn-chico` (como hoy `SugeridosEnLinea`). Con 3 fichas la franja no se dibuja (tope de ADR-0650: sin verificar el
número en la base; la maqueta topa en 3).

### Casilla de foto · `<Casilla>` (decidida)

Sus estados los trae la pieza (fondo que crece, ✓ que se dibuja, `disabled` guardando). La foto no marcada baja al 60 % de opacidad (como hoy) y
**además** pierde su contorno tinta: no solo opacidad.

### Miniatura de la galería (comparar)

default 48 × 64 con su foto · hover borde tinta 40 % · focus anillo · active 0,97 · selected anillo 2 px tinta, `aria-pressed="true"` · disabled no
aplica · loading la foto grande hace fundido (`ImagenDePrenda` y su fondo de color mientras carga) · error `fallback` de `ImagenDePrenda` (el mosaico) ·
read-only no aplica · vacío: con una foto, sin fila de miniaturas · quieto: cambio de foto sin fundido. Las flechas ← → pasan de foto cuando el foco está en la fila.

### Celda de la matriz

No es interactiva: default (las cuatro formas de arriba), hover/focus/active/selected/disabled **no aplican** (no se toca; la maqueta no la hace
tocable). loading: atenuada al 60 % mientras se recalcula. error: si no hay plan, la matriz no se dibuja. vacío: «—». read-only: es su naturaleza.
quieto: sin la cascada de entrada.

### Botones del pie · `<Boton>` (decididos)

«Revisar y fusionar»: `confirma={guiaArmar}` (no se apaga por lo que falta: al tocarlo, la guía lleva a «Ficha repetida» o a «Cuál queda»). Solo se
apaga, con su motivo, si la base bloquea (`aria-describedby="fusionar-bloqueos"`) o mientras lee el plan (`aria-disabled` + `title="Leyendo las fichas…"`,
nunca sin motivo). No guarda: no lleva `cargando` ni loader (cambia de vista). «Sí, fusionar»: `confirma={guiaRevisar}` (Responsable), `cargando` +
«Fusionando…» + `bloqueado` en el `<Modal>`; **un doble clic no fusiona dos veces** (`disabled` mientras guarda + `p_versiones` de la base) — `/chaos`
todavía no lo probó sobre esta hoja nueva. Con la base caída: «No se pudo fusionar» y las fichas siguen igual; `<RefrescoTrasCorte />` rehace la pantalla
al volver.

---

## Movimiento  (de /movimiento)

**Qué explica:** la ficha que queda (la gota se asienta donde tocaste, nada se reordena), qué dato cambió en el resultado (el dato que entra
volteándose), de dónde viene cada talla (las celdas que entran por su color) y el momento único del final (el sello).
**Frecuencia:** media/rara (una fusión es de pocas veces por semana) → techo `--t-momento`, con una coreografía de llegada **que es excepción**.
**Disparador:** llegada (la hoja), clic (elegir), dato pedido (el plan que vuelve), guardado (el sello).

**Excepción:** Felipe la pidió («movimiento rico una vez, sin rebote ni bucle», decisión 8 del 2026-11-13), pero **todavía no está escrita** en la
lista de ADR-0136 ni en `CLAUDE.md` «Movimiento y modales». Entra en el mismo PR, con su prueba `lib/fusionar-movimiento.test.ts` (modelo
`lib/vitrinas-movimiento.test.ts`: sin `infinite`, solo `--ease-cayla`/`--ease-salida`, ≤ 1 200 ms, apagado con reducir movimiento, `prefiereQuieto()`).
Los estilos van en un archivo propio, `app/estilos/fusionar.css` (prefijo `fus-`).

| Pieza | Propiedad | Desde → hasta | Duración | Curva | Desfase | Origen | Si la interrumpen |
|---|---|---|---|---|---|---|---|
| Hoja | la de `<Modal>` (sube 18 px y crece) | — | `--t-hoja` | `--ease-cayla` | — | centro | Escape/Cancelar: sale en 220 ms |
| Cabecera y bloques directos de la hoja | la cascada de `<Modal>` | 10 px → 0 | `--t-hoja` | `--ease-cayla` | 40 + 18 × k | — | — |
| **Columnas (protagonista)** | `opacity`, `transform`, `filter` | 0 · `translateY(6px)` · `blur(8px)` → reposo (la receta `cv-enfoca` de Configuración, ya aceptada) | `--t-momento` (maqueta 550 → 480) | `--ease-cayla` | 80 + 70 × i (i ≤ 2) | — | `backwards`; se puede elegir desde el primer cuadro |
| Ficha final | igual que una columna | — | `--t-momento` | `--ease-cayla` | 140 | — | — |
| Filas de lo distinto | `opacity`, `translateY(10px)` | → reposo | `--t-hoja` | `--ease-cayla` | 200 + 18 × k (k ≤ 7) | — | — |
| Celdas de la matriz | `opacity`, `translateY(6px)` (sin `blur`: son muchas) | → reposo | `--t-hoja` | `--ease-cayla` | 300 + 35 × k, **k topado en 12** | — | — |
| Elegir: la gota | `background`, `border-color`, `box-shadow` (**`transition`**, se da vuelta a medio camino) | vidrio claro → gota | `--t-cambio` | `--ease-cayla` | — | — | otro clic manda |
| Elegir: el ✓ | `opacity` + `scale(0.6) → 1`; trazo `stroke-dashoffset 24 → 0` | — | `--t-hoja`; trazo `--t-hoja` con 120 ms de espera | `--ease-cayla` | — | centro del círculo | se reinicia en la nueva |
| La que deja de ser elegida | `transition` inversa; el ✓ se va con `opacity` | — | `--t-resp` | `--ease-salida` | — | — | — |
| Dato que cambia en la ficha final | `opacity` + `rotateX(90deg) → 0` (padre con `perspective: 400px`) | — | `--t-momento` (maqueta 500 → 480) | `--ease-cayla` | — | eje horizontal del renglón | se reinicia con la clave nueva; solo el dato que cambió |
| Celda cuyo tipo cambió (otro plan) | `background` y contorno por `transition`; su número se voltea como arriba | — | `--t-cambio` / `--t-momento` | `--ease-cayla` | — | — | clave = color + talla: la celda de «Negro M» sigue siendo la de «Negro M»; nunca se re-arma la matriz entera |
| Agregar una ficha | la columna nueva entra como las otras; las de al lado se acomodan con `Flip` (`lib/motion-gsap.ts`) | — | `--t-momento` / `--t-hoja` | `caylaEase` | — | — | — |
| Quitar una ficha | sale: `opacity` + `scale(0.96)`; las demás con `Flip` | — | 220 ms | `--ease-salida` | — | — | — |
| Cambiar de vista (armar → revisar → armar) | el contenido nuevo entra con la cascada de la hoja; la hoja vuelve arriba (`scrollTop = 0`) | — | `--t-hoja` | `--ease-cayla` | 40 + 18 × k | — | Volver interrumpe |
| Lista de revisar | `opacity`, `translateY(10px)`; su ícono ✓ se traza | — | `--t-hoja` | `--ease-cayla` | 40 + 18 × k | — | — |
| «Sí, fusionar» | `<Boton cargando>`: el hilo (`data-senal`, sigue quieto) | — | 1,1 s lineal (señal) | `linear` | — | — | — |
| **Sello «Fusionado»** | `opacity` + `scale(1.5) → 1`, `rotate(-8deg)` fijo (la receta `ajuste-estampa`, **sin** el 0,96 de la maqueta: eso es un rebote) | — | `--t-momento` | `--ease-cayla` | — | centro | — |
| Título y frase de listo | cascada | — | `--t-hoja` | `--ease-cayla` | 200 + 40 × k | — | — |
| Hoja de comparar | la de `<Modal>`; columnas como arriba (70 ms × i); las barras de stock: la entrada propia de `<BarraAvance>` (no se le suma la `llena` de la maqueta) | — | — | — | — | — | Escape cierra la de arriba |
| Foto grande al tocar una miniatura | `opacity` (fundido) | — | `--t-cambio` | `--ease-cayla` | — | — | — |

**Cambios a la maqueta:** se quita el «posa» de la columna elegida (`translateY(-3px)` a mitad y vuelta: es un ida y vuelta, cuenta como rebote,
ADR-0136) y el 0,96 del sello; los 550, 450, 500 y 700 ms pasan a tokens; el `blur` de la lente sobre la foto se quita (ADR-0623).
**Salida:** 220 ms con `--ease-salida`, todo junto, sin cascada (la de `<Modal>`).
**Presupuesto (calculado, sin medir):** llegada → todo quieto: celdas `300 + 35 × 12 + 260 = 980 ms` (≤ 1 200 ✓); columnas usables desde el primer
cuadro (nada bloquea el clic; ≤ 500 ✓). Elegir → quieto: 380 ms. Dato que voltea: 480 ms. Sello: 480 + 200 + 40 × 2 + 260 = 1 020 ms.
**Teclado:** las flechas del grupo de radios eligen sin el trazo del ✓ (llega en el siguiente cuadro; regla 3 de `/movimiento`).
**Bucles:** ninguno. El hilo de «Fusionando…» es señal de espera (`data-senal`).
**Quieto (ADR-0625) y reducido:** todo en su lugar final, con el ✓ dibujado, «Queda» puesto, las celdas con su forma y el sello estampado. Lo que la
animación contaba queda dicho: qué ficha queda (✓ + «Queda»), qué dato cambió (la región viva lo anuncia y el ✓ de la opción lo muestra) y que se
fusionó (el sello y su frase). Lo que anima desde JS (`Flip`) pregunta `prefiereQuieto()`/`useQuieto()`.
**Medido:** sin medir (correr `__mov.grabar(4000)` de `referencia/medir.js` al abrir, al elegir, al cambiar un dato y al fusionar; Animations al 10 %).

---

## Gráfico  (de /graficos)

### La matriz color × talla (ficha final, revisar y comparar)

**Pregunta → respuesta:** «¿Con qué tallas y colores queda la ficha, y de dónde viene cada una?» → la frase de la base: «2 tallas y colores pasan tal
cual, con su stock y sus ventas. 3 ya existen en el que queda: se juntan y 10 prendas se suman a su stock.» (`frasesDelResumen`). La frase es el
titular; la matriz la muestra.
**Relación:** parte del todo por categoría (de dónde viene cada variante), no magnitud: **no es un gráfico de la tabla de seis**; es una
**matriz de tallas** (que la fila `tabla` de `CLAUDE.md` deja aparte). ¿Hace falta? Sí: decide si fusionar (una talla que se junta suma stock en
cada sede, ADR-0650 decisión 5) y es lo que pidió Felipe (decisión 7).
**Pieza:** `<table>` real con `caption` (como `MatrizIngreso.tsx`), `unificar-fijo` → nueva familia en `/unificar` (Propuesta 3).
**Escala:** no hay escala de largo: cada celda escribe su cifra. Filas = colores en el orden de la base; columnas = tallas en el orden de la curva
(`S · M · L · XL`, `36 · 38 · 40`), solo las que existen en alguna ficha.
**Codificación (de más a menos fuerte):** texto (el número; «+3»; «pasa» en la grande) → forma del contorno (ninguno · punteado · continuo) →
tinte (tinta 4 % · pizarra 12 % · verde 12 %). Nunca solo el tinte (1.4.1).
**Escrito a la vista:** todas las cifras; la leyenda con las tres muestras dibujadas con la misma forma que la celda (no cuadritos de color plano).
**Color:** pizarra = información («pasa», no es semáforo), verde = se suma (lo bueno), tinta = ya estaba. Rojo: no.
**Contraste:** las marcas no necesitan 3:1 porque su valor va escrito (excepción de 1.4.11); el texto, en «Color».
**Daltonismo:** pizarra/verde vecinos (ΔE 5,5 en tritanopía): separados por el contorno y el «+N».
**Lector:** `caption` «Tallas y colores de la ficha que queda»; cada `td` con su texto completo para el lector: «Negro M: 13. Se juntan 6 de esta ficha y 7 de
Capa Emma» / «Blanco M: 3, pasa de Capa Emma» / «Negro XL: sin prendas». Encabezados `th scope`.
**Movimiento de datos:** al cambiar la que queda, las celdas conservan su clave (color + talla); cambia el tinte y la cifra se voltea; una talla
nueva entra, la que se va sale. Nunca se re-arma la matriz.

### La barra de stock por sede (hoja de comparar)

**Pregunta → respuesta:** «¿Dónde tiene stock cada ficha?» → «Blusa Emma tiene 40 (18 en Lima); Capa Emma, 6».
**Relación:** magnitud por sede, comparada **entre columnas** → `grafico.escala`: `<BarraAvance tono="tinta" alto="normal" pct={n / mayor × 100} decorativa>`.
**Escala común:** `mayor` = el stock más alto de cualquier sede en **cualquiera de las fichas** (la maqueta ya lo hace): múltiplos pequeños con la misma
escala ([Evidencia] Heer y Robertson 2007, regla 4). Base cero; una sede en 0 dibuja la pista vacía.
**Orden:** el mismo en todas las columnas (el de `ubicaciones`), **no de mayor a menor** (la regla 2 pide ordenar para rankear; aquí se compara la misma
sede entre fichas, y el orden fijo alinea las filas). Decisión de esta ficha, sin fuente.
**Escrito:** nombre de la sede, su total y «· N en almacén» a la derecha (`tabular-nums`); el total de la ficha en el rótulo del bloque. Por eso la barra es
`decorativa` (el texto dice lo mismo).
**Color:** tinta sobre arena; no se pone verde (no es avance). **Movimiento:** la entrada propia de `<BarraAvance>` (se llena al verse, sin JS).
**Lector:** la lista `dl` se lee sola; la barra no se anuncia.
**Dato:** hoy no viene en el plan (Choque 1).

---

## Accesibilidad

| Criterio | Qué toca | Cómo se verifica |
|---|---|---|
| 1.3.1 Info y relaciones (A) | grupos de radios con `role="radiogroup"` + nombre; matriz como `<table>` con `th scope` y `caption`; `dl` en la ficha final y en comparar | axe en el navegador; lectura con VoiceOver |
| 1.4.1 Uso del color (A) | lo elegido (✓ + «Queda»), las celdas (forma + texto), la foto no marcada (contorno + opacidad) | medir.js · seleccion; DevTools ▸ Emulate vision deficiencies |
| 1.4.3 / 1.4.11 Contraste (AA) | texto sobre vidrio; borde `borde-control` de lo elegible; el cambio de borde al elegir | `lib/vidrio-contraste.test.ts` ampliado; medir.js de `/color` |
| 1.4.4 / 1.4.10 Zoom y reflujo (AA) | dos columnas → una bajo 880 px de cuerpo; mesa deslizable sin scroll de la página | `resize_window` 720 × 450 y 375; `scrollWidth` = ancho |
| 1.4.12 Espaciado (AA) | celdas, opciones y baldosas con `min-height`, nunca alto fijo | medir.js de `/tipografia`, modo `espaciado` |
| 2.1.1 Teclado (A) | Tab entra al grupo; flechas eligen; Enter/Espacio en «Ver ficha» y ×; Escape cierra la lista del buscador y después la hoja (`useEscapeLibre`) | recorrido con teclado en las tres vistas |
| 2.4.3 Orden del foco (A) | al pasar a `revisar`, el foco va al título; al volver, a «Revisar y fusionar»; al cerrar comparar, a su «Ver ficha» (`alCerrarEnfocar`); al quitar, a la columna vecina; en `listo`, al título | recorrido con teclado |
| 2.4.7 / 2.4.13 Foco visible | anillo del sistema en columnas, opciones, miniaturas, «Ver ficha» (que no lo recorte la foto) | medir.js `{ foco: true }` |
| 2.4.11 Foco no tapado (AA) | el `pie-hoja-fijo` pegado abajo puede tapar una opción enfocada al bajar con Tab → `scroll-padding-bottom` en la hoja igual al alto del pie | medir.js `{ foco: true }` → `focoTapado` |
| 2.5.8 Tamaño del blanco (AA) | todo ≥ 32 con mouse; 44 con dedo (`area-dedo`) | `pnpm --filter web tacto:medir` |
| 3.3.1 / 3.3.3 Errores (A/AA) | «Falta: Ficha repetida» al tocar «Revisar y fusionar»; el error de guardar sobre los botones | en el navegador; `lib/boton-confirma.test.ts` |
| 4.1.2 Nombre, función, valor (A) | `aria-checked`, `aria-pressed`, `aria-busy`, `aria-describedby` del bloqueo; ningún interactivo dentro de un radio | axe `nested-interactive` |
| 4.1.3 Mensajes de estado (AA) | región `aria-live="polite"` en la ficha final que dice el dato que cambió («Nombre: Blusa Emma»), y `role="status"` en `listo` | VoiceOver al elegir |
| 2.3.3 Animación por interacción (AAA) | arranca quieto (ADR-0625); reducir movimiento gana | `data-movimiento="quieto"`; `lib/fusionar-movimiento.test.ts` |

**Guía de foco (ADR-0284):** la hoja ya está `aplicada` en `lib/guia-de-foco-pantallas.ts`; cambian sus campos por vista: `armar` = Ficha repetida ·
Cuál queda · Lo que es distinto (sugerido) · Fotos (sugerido); `revisar` = Responsable. `camposDeLaGuia` (`lib/fusionar-productos-reglas.ts:311`) recibe
la vista y su prueba lo cruza con lo que bloquea la base. La hoja de comparar se declara `no-aplica` («solo se lee»). **Guía interactiva (ADR-0389):**
anclas que se quedan `fusionar.fichas`, `.queda`, `.diferencias`, `.fotos`, `.bloqueos`, `.botones`; nuevas `fusionar.ver-ficha`, `fusionar.final`,
`fusionar.matriz`, `fusionar.revisar` → `/guia` y `guias:huella`. **Cierre:** `/formidable`, `/focus`, `/sugerir`, `/chaos` (guarda) y `tema:auditar` con
un escenario por vista.

---

## Fuentes

- [Norma] WCAG 2.2: 1.3.1, 1.4.1, 1.4.3, 1.4.4, 1.4.10, 1.4.11, 1.4.12, 2.1.1, 2.3.3, 2.4.3, 2.4.7, 2.4.11, 2.4.13, 2.5.8, 3.3.1, 3.3.3, 4.1.2, 4.1.3 ·
  WAI-ARIA APG (patrón radio group) · CSS Container Queries · Media Queries 4 · CLDR es-PE (montos, fechas) · Apple HIG (textos).
- [Evidencia] Legge y Bigelow 2011 (piso de 14 px) · Heer y Robertson 2007 (escala común, transición de datos, clave estable) · PARHI (44 px con dedo) ·
  Abrams y Christ 2003 (una vez, sin bucle).
- [Práctica] Material 3 (capas de estado, Label S 11), Primer/Carbon (alturas, salida más corta), NN/g (confirmar lo irreversible, ≤ 500 ms), Bringhurst (medida).
- Regla del repo: ADR-0136/0625 (movimiento y quieto), ADR-0149 (loader), ADR-0162 (responsable), ADR-0169/0336 (tokens, oscuro), ADR-0284 (guía de foco),
  ADR-0333 (sin foto), ADR-0351 (foco), ADR-0358 (piezas), ADR-0389 (guías), ADR-0479/0528 (celular), ADR-0596/0623 (vidrio), ADR-0611 (confirma), ADR-0650 (la fusión).

---

## Choques con la maqueta o con el repo (resolver antes de codificar)

1. **El stock por sede no viene en el plan — resuelto sin migración (2026-11-13).** `retail.fn_existencias(null, <ids>)` (security definer,
   `fn_tiene_acceso_retail`) ya devuelve, a toda cuenta con acceso a retail, el stock de cada talla y color en cada sede, partido en piso y almacén
   (verificado con una integrante que no es líder: Trujillo, Lima y Taller). La hoja de comparar lo lee aparte, junto con `variantes` (color y talla).
2. **«Fotos que quedan» no está en la maqueta B** y es una decisión de ADR-0650 (9). Esta ficha la pone como tercer bloque de la izquierda, bajo «Lo
   que es distinto», y la ficha final cuenta las que quedan. Felipe no la vio en B: mostrársela.
3. **La maqueta tiene × y «Cancelar» a la vez:** la familia `modal` pide una sola salida. `armar` y `revisar` llevan «Cancelar»; solo `listo` lleva la ×.
   La hoja de comparar lleva solo la × (su «Volver a la fusión» del pie es un «Cerrar» al pie de una hoja que no guarda: se quita).
4. **«Volver» de revisar** es la flecha redonda `<Volver>` (familia `accion.anterior`), no el botón secundario «← Volver» de la maqueta; y «No se puede
   deshacer» es `<AvisoNoSeDeshace />` sobre los botones, no el texto rojo suelto del pie.
5. **Sin sobretítulo:** «Catálogo · Productos», «Último vistazo» y «Para comparar» de la maqueta no tienen lugar en `<Modal>` (el `arriba` es para la
   vuelta a otra vista). Se omiten; el título y la bajada bastan.
6. **Dónde va el Responsable:** esta ficha lo pone en `revisar` (es quien firma «Sí, fusionar»). Hoy está al pie de la única vista.
7. **El éxito:** la vista `listo` con su sello reemplaza al `avisar.exito("Productos fusionados")` de hoy (no los dos). El error de guardar pasa del aviso
   de esquina a `<Aviso tono="error">` sobre los botones (patrón B7).
8. **Rebotes de la maqueta:** el «posa» de la columna y el 0,96 del sello se quitan (ver Movimiento).
9. **Vocabulario del dato:** el repo dice «El que más vendió» y «Creado el…» (el producto) mientras la hoja habla de «fichas». Se deja como está en la
   base de reglas; si Felipe prefiere «La que más vendió» / «creada», es un cambio en `lib/fusionar-productos-reglas.ts`.

## Propuestas

1. **Una pieza para «elegir una opción en tarjeta» (familia nueva `opcion`, por `/unificar`).** Hoy cada pantalla la dibuja a su modo
   (`.hoja-gasto-sede[aria-checked]` en `telar.css:578` es tinta sólida, `.gr-baldosa`, `.cal-op`, las tarjetas de `ReabrirPrendaModal`). Esta hoja la
   necesita en dos tamaños (columna y fila). Propuesta: `<OpcionTarjeta>` con vidrio claro + `borde-control` y, elegida, `--gota-marca` + borde tinta + ✓ de
   24 px; `role="radio"` sin interactivos adentro y sus hermanos encima. Riesgo: otra variante hasta que `/unificar` migre las demás. Se mide: el censo de
   `/unificar` y `lib/unificar.test.ts`. **Mientras Felipe no la elija por `/unificar` (regla 3), vive dentro de `components/fusionar-productos/` con su `unificar-fijo`, no en `components/ui/`;** si entra a `components/ui/`, Dynamic la mira («queda como tarea allá»).
2. **`<FotoDePrenda proporcion>`.** Hoy solo dibuja 3:4 (`FotoDePrenda.tsx:17`); la columna y la ficha final piden 4:3 (con 3:4 una columna de 328 px
   mide 437 px solo de foto). Propuesta: prop `proporcion="3 / 4" | "4 / 3"`, de fábrica 3:4. Riesgo: bajo. Toca `components/ui/`: avisar en el PR que queda
   como tarea en Dynamic.
3. **Las matrices de tallas como familia de `/unificar`.** Esta sería la novena (`MatrizIngreso`, `MatrizUnidades`, `MatrizStockFicha`, `MatrizNuevas`,
   `MatrizCantidades`, `MatrizVariantes`, `MatrizDelModelo`, `MatrizRecepcion`). Mientras Felipe no decida, se arma sobre la forma de `MatrizIngreso`
   con su `unificar-fijo`.
4. **`.prod-sobre-foto` como receta.** Lo que va sobre una foto (botón, insignia) vive como clase de Productos en `vidrio/pantalla.css:574`. Propuesta: pasarla
   a `vidrio/` común con un nombre de función (`.sobre-foto`) para que esta hoja no dependa de una clase de otra pantalla. Riesgo: ninguno visual.
5. **La excepción de movimiento** «Fusionar productos repetidos» entra a la lista de ADR-0136 y de `CLAUDE.md` con `lib/fusionar-movimiento.test.ts`
   (columnas que se enfocan, gota que se asienta con su ✓ que se dibuja, dato que se voltea, celdas en cascada, sello que se estampa; una vez, sin
   rebote ni bucle). Felipe ya la pidió; falta escribirla.
6. **Ampliar `lib/vidrio-contraste.test.ts`** con tinta y taupe sobre `--gota-marca`, `--vidrio-claro-fondo` y `--placa-fondo` dentro de la hoja Serena, en
   los dos temas: hoy esos pares no se miden.
