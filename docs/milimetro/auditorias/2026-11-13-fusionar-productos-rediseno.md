# Auditoría al milímetro — `/productos` ▸ hoja «Fusionar productos repetidos», dirección B «La ficha que se arma» · 2026-11-13 · `claude/fusionar-productos-rediseno` @ `cdef7467e`

Medido: 1440×900 claro (vivo y quieto) · 1440×900 oscuro · 375×812 claro (táctil, quieto) · hoja de comparar 1440 claro y oscuro · vista «revisar» 1440 claro y oscuro.
Servidor: `http://localhost:3077` (base local aislada con datos de prueba; dos fichas: Capa Emma CAS-0004 y Blusa Emma CMS-0001).
Piezas: `apps/web/components/fusionar-productos/{FusionarProductosHoja,piezas,CompararFichas}.tsx`, `apps/web/app/estilos/vidrio/fusionar.css`.
Ficha de diseño contra la que se compara: `docs/milimetro/fusionar-productos.md`.

**Resumen: 2 graves · 2 medias (+1 heredada de piezas del sistema) · 6 leves · 6 decididos a propósito · 7 falsos positivos descartados.**

Cómo se midió: los siete `medir.js` del set se ejecutaron enteros en el navegador integrado (servidos sin cambios desde `.claude/skills/*/referencia/`
y evaluados en la página). Para medir solo la hoja, `window.__milimetro = { raiz: … }` en `/milimetro` y, en `/espacio` y `/tipografia` (que miden
`<main>`), `<main>` se apuntó a la hoja abierta. Cada «revisar» se confirmó con `grep` en el código. `auditar.pl` de `/textos` sobre la carpeta: **0 en las 18 reglas**.

## Graves

1. **El foco queda tapado entero por el pie fijo** — `button.fus-opcion.fus-opcion-fila` de la primera fila de «Lo que es distinto» («Nombre»), bajo
   `div.pie-hoja-fijo` (`FusionarProductosHoja.tsx:483`). Medido a 1440×900 con la hoja arriba: al enfocar con Tab las dos opciones de «Nombre», su caja
   (top 793, alto 48) queda debajo del pie (top 768, alto 107): **48 de 48 px tapados**; el navegador no desplaza porque la opción está «a la vista» dentro
   de la hoja. Las demás filas no se tapan. — regla: el control con foco no puede quedar tapado entero por algo del autor — `[Norma]` WCAG 2.4.11 (AA)
   — va a `/milimetro` (estados: focus-visible).
   **Arreglo probado en vivo:** `.fus-opcion { scroll-margin-bottom: 120px; }` en `fusionar.css:32` (la opción queda en 755, libre del pie en 768).
   Para todas las hojas con pie fijo, `scroll-padding-bottom` en la hoja que lo contiene (junto a `.pie-hoja-fijo`, `app/globals.css:1979`) también
   funcionó, pero toca todo el ERP: es la propuesta 5 de `/milimetro` y va con el OK de Felipe.
2. **El contorno de la celda «pasa» no llega a 3:1 en claro** — `.fus-celda[data-estado="pasa"]`, `fusionar.css:367`
   (`outline: 1px dashed color-mix(in srgb, var(--color-pizarra) 55%, transparent)`). Medido: **2,69:1 en claro** (3,70 en oscuro) sobre papel; el relleno
   1,19:1. En la matriz chica de «Así va a quedar» la celda «pasa» no lleva la palabra (`piezas.tsx:234`, `grande && <small>pasa</small>`), así que el
   punteado es lo único, además del color del número, que dice el estado a la vista. — regla: objeto gráfico necesario para entender ≥ 3:1 —
   `[Norma]` WCAG 1.4.11 (AA) — va a `/color` y `/graficos`. La ficha ya pedía 35 % (`fusionar-productos.md`, «Celda pasa»): el error viene de la ficha.
   **Arreglo:** `outline-color: var(--color-pizarra)` pleno (pizarra sobre papel ≈ 5,2:1) o al menos ~75 %, y volver a medir en claro y oscuro.
   Nota: el plan de prueba no traía ninguna talla que «pasa», así que se midió sobre la muestra de la leyenda (`piezas.tsx:322`, misma clase y regla).
   El «+N» de «se junta» lleva su texto (5,53:1), por eso su contorno de 2,04:1 no es hallazgo.

## Medias

3. **Comparar: la ficha que abriste solo la dice ARIA** — `CompararFichas.tsx:54` pone `aria-current="true"` en el `<li>` y ninguna regla la dibuja
   (`grep aria-current fusionar.css` → nada). Medido: `/milimetro` · seleccion: «solo lo dice ARIA: no se ve distinta de su hermana». — `[Norma]`
   WCAG 1.4.1 · estado «selected» de la ficha — va a `/milimetro`. **Arreglo:** dibujarla (`.fus-comparar > [aria-current="true"]` con el borde
   `tinta` de lo elegido) o quitar el `aria-current` si solo sirve para desplazar la hoja hasta ella.
4. **Las casillas de «Fotos que quedan» miden 20×20 con el dedo** — `<Casilla>` en `FusionarProductosHoja.tsx:391-393`. Medido a 375 táctil
   (`pointer: coarse`): 4 blancos de 20×20, por debajo de 44 (con mouse pasan 2.5.8 por la excepción de separación). — regla del repo sin prueba en el CI
   (ADR-0611 mejora 5, `tacto.css`; `pnpm --filter web tacto:medir`) — va a `/espacio`. **Arreglo:** que la foto entera sea el blanco (la foto como
   `<label>` de su casilla); sumar la casilla a la lista de `tacto.css:33` alcanza a todo el ERP y va con el OK de Felipe.
5. *(Heredada de piezas del sistema, no de la hoja)* **Letra de lectura bajo 14 px** — la bajada de la hoja a 13,5 px (`components/ui/Modal.tsx:325`,
   `text-[13.5px]`; la ficha prometía 15), la ayuda de cada bloque a 12 px y su título a 13 (`components/guia-de-foco/CampoGuiado.tsx:83`), y la cuenta
   de `<TituloGrupo>` a 10,5–11 px con interlineado 1,30. — regla del repo «La letra de lectura y su «?»» (sin prueba) · `[Evidencia]` Legge y Bigelow
   2011 — va a `/tipografia` (y `/unificar` si se decide subir la pieza). La hoja no lo arregla sin tocar esas piezas.

## Leves

6. **Proximidad invertida en «Lo que es distinto»** — el rótulo de cada fila está a 12 px de sus opciones (`fusionar.css:227`, `gap: 12px` también
   entre filas de la rejilla) y a 8 px de las opciones de la fila de arriba (`FusionarProductosHoja.tsx:330`, `space-y-2`). Medido: 5 filas con «adentro
   12 > afuera 8». `[Práctica]` (`/espacio` regla 4). **Arreglo:** `.fus-fila { row-gap: 8px; }` y el contenedor en `space-y-4` (16) o `space-y-6` (24).
7. **Medios pasos fuera de un control** — `space-y-2.5` en `CompararFichas.tsx:85` (stock por sede) y `gap-2.5` en `FusionarProductosHoja.tsx:441`
   (lista de revisar): 10 px. `[Práctica]` escala de 4. **Arreglo:** `space-y-2` / `space-y-3` y `gap-2` / `gap-3`.
8. **«Blanco» se corta en la matriz chica a 375 px** — `span.truncate` en la columna de color de 72 px (`fusionar.css:320`): 42 de 44 px. `[Práctica]`
   `/textos` (texto cortado). **Arreglo:** columna de 80 px a 375, o `title` con el nombre en la fila.
9. **La raya «—» de la celda que no existe** mide 1,93:1 en claro y 2,51:1 en oscuro (`fusionar.css:381`, al 30 %). Está declarada decorativa con su
   comentario `contraste: no aplica` y el lector oye «no existe» (sr-only); queda como leve por si se quiere subir al 45 %.
10. **La columna de color de la matriz grande mide 164,5 px**, no los 112 de la ficha (`fusionar.css:348`): la tabla en `table-layout: auto` reparte el
    sobrante. `[Práctica]`. **Arreglo:** `table-layout: fixed` en `.fus-matriz-grande` si se quiere el ancho de la ficha.
11. *(Heredada)* **El hilo del `<Buscador>` corre en bucle invisible** (`span.buscador-hilo::before`, `cayla-hilo-barrido` 1 100 ms infinito con
    opacidad 0) mientras la hoja está abierta. Es de la pieza `Buscador`, no de la hoja; va a `/movimiento`.

## Decidido a propósito

- Ancho de 1 080 px (`max-w-[67.5rem]` con `unificar-fijo`, `FusionarProductosHoja.tsx:270`, `CompararFichas.tsx:50`): medido 1 080, relleno 28, radio 32 (hoja Serena).
- Movimiento rico de una vez (ADR-0136 act. 2026-11-13, CLAUDE.md, vigilado por `lib/fusionar-movimiento.test.ts`). Medido al abrir (vivo, `__mov.grabar`):
  solo `--ease-cayla`, ningún bucle propio; columnas `fus-enfoca` 480 ms con 80/150 ms de espera; ficha final 140 ms; filas `fus-sube` 260 ms; ✓ `fus-asienta`
  260 ms y su trazo con 120 ms; **todo quieto ≈ 770 ms después de abrir** (presupuesto de la ficha: ≤ 1 200). El `blur` de `fus-enfoca` es la receta aceptada
  (`cv-enfoca`) y el mismo de `vidrio-enfoca` del sistema. Quieto (ADR-0625): 0 animaciones corriendo dentro de la hoja.
- El hilo de la guía sobre «Revisar y fusionar» (`hilo-aro`, 1 000 ms, una vez): pieza de la guía de foco.
- Leyenda de la matriz en 13 px (`piezas.tsx:316`, `unificar-fijo`: leyenda de un gráfico).
- `tabular-nums` no hace nada en DM Sans (11 cifras lo piden): es la propuesta 1 de `/tipografia`, no de esta hoja; las cifras de la hoja no van en columna.
- «Sí, fusionar» negro (`btn-primario`), rojo profundo solo al pasar el mouse: la regla «Lo peligroso».

## Cumple (medido contra la ficha)

Dos columnas 658 + 340 con hueco 24 · mesa de 2 fichas a 323 px con hueco 12 · columna con relleno 12 y radio 22 · foto 4:3 con radio 12 · nombre 15/600 ·
«Ver ficha» 32 de alto, relleno 0 12, hueco 6, **sin** `backdrop-filter` · visto de 24 · opción de fila 48 de alto, radio 14, relleno 12·44·12·16, letra 15 ·
ficha final pegada (`sticky; top: 0`), relleno 16, radio 22, nombre EB Garamond 24/600 · matriz chica 36 de alto, radio 8, 13/600 · matriz grande 48 de alto,
`border-spacing` 8, `<caption>` · comparar: columnas 503 + 503 con hueco 16, galería de 256 de alto, miniaturas 48×64 con `aria-pressed`, bloques con relleno 12
y radio 12 · a 375: la mesa desliza (`grid-auto-columns: 80%`, se asoma la siguiente), «de CAS-0004» visible bajo cada opción, la ficha final baja y deja de
pegarse, pie en mitades de 159×44, sin scroll lateral (375 = 375) · `/color`: 0 textos de la hoja bajo 4,5:1 en claro ni en oscuro (fuera de la raya del punto 9),
0 rojos · `/textos`: 0 fallas en la hoja; montos con `S/` y espacio · foco: 21 controles con anillo, ninguno flojo · ningún apagado sin motivo · 0 errores mal ligados.

## Falsos positivos descartados

- «Revisar y fusionar», «Sí, fusionar · Fusionando…» como espera escrita a mano y con contraste 1,12:1: es `PalabraEnEspera` de `<Boton cargando>`, la palabra escondida que reserva el ancho.
- `montoMal` «S/89.90»: está en la Tabla de Productos detrás de la hoja; en la hoja se lee «S/ 89.90».
- `mayusculasAMano` «CAYLA SAC»: es el dato de la marca.
- Controles bajo 3:1 («Blanco», «Beige», «Negro», «Cambiar de ubicación»): son de la página de atrás y del marco.
- `hover` sueltos (`.barra-t:hover`, `.parecidas-punto:hover`): CSS global de otras pantallas; los `:hover` de `fusionar.css` (líneas 45 y 484) están dentro de `@media (hover: hover)`.
- `proximidadRota` en `ul.space-y-2.5` de comparar y en `div.fus-cuerpo` de revisar: cajas que ya agrupan por su placa (región común).
- El primer Escape no cierra la hoja con el foco en el buscador: es la regla de `useEscapeLibre` (el buscador usa ese Escape).

## Sin medir

- **Tres fichas:** la × de quitar (32×32 + `area-dedo`), las columnas de 214 px y la mesa deslizable a 1 024 px (los datos de prueba traen dos).
- **Vista «listo» y el sello «Fusionado»:** exigen pulsar «Sí, fusionar», que guarda.
- **Errores y bloqueos de la base** (`<Aviso>` de bloqueos, «No se pudo fusionar»): necesitan la base caída o un plan bloqueado.
- **Movimiento al elegir, al cambiar un dato (el que se voltea) y al agregar o quitar una ficha**; solo se grabó la llegada (y la grabación corrió a
  1 168×833: el panel cambió de ancho a mitad de la corrida).
- **Foco a 375** y en la hoja de comparar; el modo `espaciado` (WCAG 1.4.12) y `letra-del-navegador` de `/tipografia`; 1 024 px.
- **«Ver ficha» y «N fotos» sobre una foto real:** las fotos de prueba son paños lisos; el contraste sobre foto salió «no concluyente».
- `pnpm --filter web tacto:medir` y `pnpm --filter web test -- vidrio-contraste` no se corrieron (esta auditoría no toca código).
