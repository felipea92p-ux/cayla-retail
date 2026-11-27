# Auditoría al milímetro — Producción más clara: Resumen, Eficiencia, Órdenes con «Nueva orden» e Insumos con sus cuatro hojas (PR #2043, ADR-0708) · 2026-11-26 · claude/produccion-pantallas-revision-9c5ccd @ 674413261
Medido: 1440×900 claro quieto y vivo · 375×812 claro · 1440 oscuro · foco con el teclado (Tab de verdad en las cuatro hojas)     Servidor: `http://localhost:3078` (esta worktree, contra el banco propio `supabase_db_cayla-prod-clara`, con datos inventados)
Resumen: 0 graves abiertos (los 4 medidos se corrigieron el mismo día y se volvieron a medir) · 4 medias · 10 leves · 6 decididos a propósito · 11 de piezas que ya existían (3 de ellas rompen una norma AA: quedan abiertas, no son de este PR)

Cómo se midió: once vistas reales con la cuenta del seed en el Taller: `/produccion` (y con «¿Alcanza la tela?» desplegado), `/produccion/eficiencia`,
`/produccion/ordenes`, `/produccion/ordenes?nueva=auto` (y con un modelo elegido), `/produccion/insumos` y sus hojas «Nueva tela», «Nuevo avío»,
«Lo que ya tenías» y «Llegó una compra», abiertas. Los siete medidores (`milimetro`, `espacio`, `tipografia` en sus tres modos, `color`, `movimiento`,
`textos`, `graficos`) corrieron enteros, inyectados desde Playwright aislado (el archivo de cada skill, sin tocarlo; para las hojas, la raíz `main` de
`/espacio` y `/tipografia` se apuntó al diálogo al inyectarlo). Lo que un medidor marcó «revisar» se confirmó con `grep` y con una segunda medida:
foco con y sin teclado comparado píxel a píxel, recorrido con Tab de verdad, y contraste contra el fondo real (se esconde la letra y se mide lo que
queda detrás). Las medidas se tomaron entre `4d5e1f74f` y `674413261` (quien integra subió tres arreglos mientras se medía); los números de línea
son de `674413261`. Pruebas del repo: 20 archivos guardianes (hover, tokens, colores, unificar, botón que confirma, movimiento, letra, esquinas,
foco, vidrio, beige, montos, guía de foco, sugerir, hojas, ancho, select, vidrio que aguanta) en verde (439 pruebas). Colador de `/textos`
(`auditar.pl`) sobre los archivos del PR: 0 en las 18 reglas.

Lo que salió bien, medido: 0 blancos de menos de 24 px con mouse en las once vistas · 0 desbordes a 375 px (`scrollWidth` 375 en todas) · 0 letras
por debajo de 13 px · todas las cifras con tabulares de verdad (EB Garamond y la letra de cifras; 0 «pide y no tiene») · 0 montos partibles · 0 recortes
con el espaciado de WCAG 1.4.12 · 0 rojos en las siete vistas de página (en las hojas el medidor no los cuenta, porque viven fuera de `<main>`: a ojo, uno, la opción elegida del segmentado, más los errores) · 0 animaciones con las animaciones apagadas · 0 errores sin ligar a su campo
(«Nueva tela», «Nuevo avío» y «Lo que ya tenías» dicen el error bajo el campo, con ícono y texto, y `aria-describedby`) · en las páginas, de 33 a
55 controles enfocados por vista, ninguno tapado, y todos con su anillo salvo los de los graves 2 y 3 · abrir una hoja deja todo quieto en cerca de 1 s y el primer campo se puede tocar a los 430 ms.

Capturas: `docs/milimetro/auditorias/2026-11-26-produccion-mas-clara/`.

## Graves

> **Corregidos el 2026-11-26, después de medir** (quien integra, no la auditoría), y vueltos a medir con Tab real a 1440 y 375 px:
> 1. «Llegó una compra»: el botón ya no se apaga por lo que falta (`confirma={guia}`); al tocarlo con la hoja vacía muestra 6 errores, pone el cursor en el primer campo y no llama a la base.
> 2. Insumos: la fila de un color muestra el anillo de foco (`solid 2px`).
> 3. Nueva orden ▸ elegir modelo: cada fila muestra el anillo de foco.
> 4. Hojas con pie pegado: `scroll-margin-bottom: 6rem` en `app/globals.css`; 0 controles tapados en 40 paradas de Tab, a 1440 y a 375. Medido inyectando la misma regla, porque el servidor de desarrollo no recompiló `globals.css` durante la corrida: falta verlo con el servidor reiniciado.
>
> Lo que sigue es lo que se midió antes de corregir.
1. **El botón que confirma se apaga por lo que falta** — «Llegó una compra»: `<Boton type="submit" … disabled={!listo}>`,
   `components/insumos-taller/LlegoUnaCompraModal.tsx:328` — medido: `milimetro/medir.js` → `apagados` (1 de 1, «¿apagado por lo que falta?», sin
   motivo ligado), a 1440 y 375, claro y oscuro; no se llega al estado de error porque el botón no se puede tocar — regla: el botón que confirma no
   se apaga; al tocarlo cada campo dice su error y el foco va al primero (`<Boton confirma={guia}>`) — regla del repo (ADR-0611, mejora 4; «Guía de
   foco», punto 6). La prueba `lib/boton-confirma.test.ts` no lo ve porque `listo` no sale de `guia.puedeConfirmar` — **venía de antes** (en `main`,
   línea 268); las otras tres hojas ya usan `confirma={guia}` — arreglo: `disabled={cargando}`, `confirma={guia}`, `title={guia.frase ??
   responsable.motivo ?? undefined}` y `className={guia.claseConfirmar}`, como `NuevaTelaModal.tsx:348` (la hoja ya tiene `guia` y `<PieGuia>`), y que
   `guardar` marque los errores de las líneas con `guia.marcarError` — va a `/focus`.
2. **El foco del teclado no se ve en la fila de un color** — Insumos: `button.insumo-fila-cabecera`, `components/InsumosPanel.tsx:573`
   (`outline-none focus-visible:bg-tinta/[0.03]`) — medido: entre la fila con foco y sin foco el mayor contraste de un píxel es **1,08:1** en claro y
   1,10:1 en oscuro (diferencia máxima de 7 sobre 255 por canal); `milimetro/medir.js { foco: true }` → `sinAnillo` (4 de 4 filas) — regla: el
   indicador existe siempre que el control tiene el foco; el anillo único del repo (`--foco-color` 2 px a 2 px, ADR-0351) — [Norma] WCAG 2.4.7 (AA)
   — **venía de antes** (`main`, línea 422); el PR reescribió esa línea y conservó el `outline-none` — arreglo: quitar `outline-none
   focus-visible:bg-tinta/[0.03]` y poner `focus-visible:-outline-offset-2` (la fila está dentro de una tarjeta con `overflow-hidden`; es lo que
   ya hacen `ListaQueFabricarPrimero.tsx:79` y `TablaDeModelos.tsx:36`) — capturas `insumos-fila-sin-foco.png` y `insumos-fila-con-foco.png`.
3. **El foco del teclado no dice en qué modelo estás** — Nueva orden ▸ «Qué se fabrica»: las filas de modelo y «Crear un modelo nuevo»,
   `components/orden-produccion/ElegirModelo.tsx:113` y `:148` (`outline-none` + `vd-pasa`, cuyo foco es `background: var(--gota-fondo)`, blanco
   sobre blanco) — medido: en claro, de 62 928 píxeles de la fila solo cambian 361, y 276 de ellos son el hilo de la guía al costado del grupo
   entero (x = 5 a 7): la fila enfocada queda igual; en oscuro la fila se tiñe sin llegar a 3:1; `foco.sinAnillo` 7 de 7 — [Norma] WCAG 2.4.7 (AA)
   — **venía de antes** (`main`, líneas 117 y 150) — arreglo: cambiar `outline-none` por `focus-visible:-outline-offset-2` en las dos líneas (el
   `vd-pasa` puede quedarse: tiñe además del anillo) — capturas `elegir-modelo-sin-foco.png` y `elegir-modelo-con-foco.png`.
4. **El control con foco queda tapado entero por el pie pegado de la hoja** — «Llegó una compra» a 1440: al llegar con Tab a «Agregar una nota»
   (`LlegoUnaCompraModal.tsx:306`, **control nuevo de este PR**) queda en y = 851 px, debajo de `div.pie-acciones.pie-hoja-fijo` (0 de 9 puntos a la
   vista, también después de esperar 900 ms); a 375: «Número» y el interruptor «Todavía no tengo la factura»; «Nueva tela» a 375: «Buscar un color»,
   «Ver los 86 colores» y «Nuevo color» — [Norma] WCAG 2.4.11 (AA) — causa: la regla que ya resuelve esto solo mira las páginas
   (`app/globals.css:2041`, `main:has(.pie-hoja-fijo) … { scroll-margin-bottom: 15rem }`; su comentario dice «no de una hoja»). El mecanismo **venía
   de antes**; a 1440 lo destapa el control nuevo — arreglo: la misma regla para la hoja, junto a esa línea:
   `:is(.hoja-serena, .hoja-vidrio):has(.pie-hoja-fijo) :is(a[href], button, input, select, textarea, summary, [tabindex]):not(.pie-hoja-fijo *) {
   scroll-margin-bottom: 6rem; }` (el pie mide 68 px a 1440 y 64 a 375, más su degradado de 16), sin el `@media (min-width: 640px)` porque en la hoja el pie se pega
   también en el celular; se vuelve a medir con el recorrido de Tab (0 tapados) — capturas `compra-foco-bajo-el-pie-1440.png` y
   `nueva-tela-foco-bajo-el-pie-375.png` — va a `/espacio`.

## Medias
1. **Dos caras de etiqueta en la misma hoja** — «Llegó una compra»: «Cantidad» y «Precio de …, sin IGV» son un `<span aria-hidden className="mb-1
   block text-xs text-tenue">` escrito a mano (`LlegoUnaCompraModal.tsx:196` y `:205`; «Subtotal», `:211`), y el resto de la hoja usa la etiqueta
   de `<Campo>` (versalitas, 600) — medido: 13 px / 400 en tono tenue; contra el fondo real, 4,17 a 4,21:1 a 375 px (bajo 4,5; a 1440 pasan) —
   regla: «Una función, una pieza» (familia `etiqueta-campo`, ADR-0358) y `/tipografia` 2 — **nuevo de este PR** — arreglo: quitar el `span` y el
   `sinPie`, y dejar que `<CampoTexto caja etiqueta="Cantidad">` dibuje su etiqueta (la unidad ya la dice `<ConUnidad>`).
2. **«Abrir orden» se apaga si falta elegir quién la abre** — `components/NuevaOrdenProduccionForm.tsx:1227`
   (`disabled={cargando || !responsable.listo} confirma={guia}`) — leído en el código; como Admin el responsable queda puesto solo y no se pudo ver
   apagado — regla: lo mismo que el grave 1 (el responsable se arregla eligiéndolo en la hoja); el motivo sí se dice («Solo falta elegir quién abre la
   orden») — **venía de antes** (`main`, línea 1175) — arreglo: `disabled={cargando}` y que el responsable entre a la guía como un campo más — va a `/focus`.
3. **Apagado sin motivo a la vista** — Insumos, botón «Llegó una compra» de la cabecera: `disabled={insumos.length === 0}`,
   `components/InsumosPanel.tsx:236`; a su lado, «Lo que ya tenías» sí dice «Primero crea una tela o un avío.» — leído en el código (con insumos en el
   banco no se ve) — regla: lo que se apaga por estado lleva el motivo a la vista (`estados.md`, 6) — **venía de antes** (`main`, línea 152) — arreglo:
   no dibujarlo mientras no hay insumos (el vacío ya ofrece «Crear la primera tela»).
4. **Al confirmar con faltantes el foco no va al primer campo** — «Nuevo avío»: tras pulsar «Crear el avío» vacío, los tres errores salen bien
   ligados pero el foco queda en el botón; en «Nueva tela» y «Lo que ya tenías» va al primer campo pendiente — observado en el navegador (1440) —
   regla: «el foco va al primero» (ADR-0611, mejora 4) — el primer pendiente es el combo «Clase»: puede ser a propósito, para no abrirle la lista
   encima — sin comparar con `main` — va a `/focus`.

## Leves
1. **«Listas para el stock» salta a dos renglones** en la franja de Órdenes, a 1440 y a 375, y descuadra su tramo contra los otros cuatro —
   `textos/medir.js` → `botonEnDos`; `.ol-tramo-nombre`, `app/estilos/ordenes-lista.css:64` — `/textos` D1 — nuevo — «Listas» a secas, o
   `white-space: nowrap` con el tramo más ancho.
2. **Pasos fuera de la escala de 4 px en lo nuevo**: `ordenes-lista.css:25` y `:27` (14), `:114` (18 y 22), `:130` (30);
   `EficienciaTallerPanel.tsx:185`, `:187`, `:242`, `:243` (14) — `/espacio` 3 — nuevo — 12 o 16, 16 y 24, 32.
3. **Interlineado 1,38 en textos que pasan a dos renglones** (`leading-snug`): `produccion-resumen/LoDemasEnOrden.tsx:28` y `:29` (nuevo) y el
   nombre del insumo de «Por acabarse» a 375 (`InsumosPanel.tsx:183`) — `/tipografia` 5 (≥ 1,4) — `leading-normal` o la clase `texto-detalle`.
4. **La cifra grande de Eficiencia usa un peso que la serif no tiene en la rampa**: EB Garamond 500 a 54 y 72 px (`EficienciaTallerPanel.tsx:167`,
   `font-medium`), y los números de la franja de Órdenes también (500) — `/tipografia` 9 (400 y 600) — nuevo — `font-display` (600).
5. **Proximidad**: en el Resumen, «Qué fabricar primero» tiene 32 px adentro y 28 afuera; en «Elegir modelo», «Colores / Tallas» tienen 24 px
   entre sí y 12 con lo de al lado — `/espacio` 4 — nuevo.
6. **«Nueva tela» a 1440**: la etiqueta «Se pierde al cortar · opcional» se parte en dos renglones y baja su campo unos 20 px respecto del
   segmentado de la misma fila (`insumos-taller/PiezasDeLaTela.tsx:290`); el marcador del tejido se corta («Busca o escribe el tejid») — `/espacio` 12,
   `/textos` D4 — nuevo — «Merma al cortar», y el marcador pasa por `/sugerir`.
7. **El gráfico de Eficiencia dice su título, no su conclusión**: `etiqueta={meses.titulo}` («Materiales por prenda, mes a mes»),
   `EficienciaTallerPanel.tsx:119`; los meses sin dato son una raya de 1,46:1 sin cifra — `/graficos` 23 y 16 — nuevo — la frase del titular como
   etiqueta («En noviembre, S/ 20.91 por prenda; setiembre y octubre sin cierres»).
8. **Órdenes en oscuro**: «24 prendas» del tramo elegido queda al filo: mediana 4,61:1 y 4,47:1 en su peor punto (`.ol-tramo-prendas`,
   `ordenes-lista.css:72`, tono tenue sobre `--gota-marca`) — [Norma] 1.4.3 — nuevo — `--color-secundario` en el tramo `[aria-pressed="true"]`.
9. **Nueva orden a 375**: los nombres de modelo se cortan con puntos suspensivos («Falda Renata», «Casaca Ximena») — `textos/medir.js` →
   `cortados` — dejar que el nombre baje a dos renglones.
10. **El acordeón de Insumos dura 300 ms escritos a mano** (`InsumosPanel.tsx:608` y `:612`, `duration-300`) — `/movimiento` 7: el token es
    `--t-hoja` (260 ms) — venía de antes.

## Decidido a propósito
- El acordeón por `grid-template-rows` de la fila de Insumos (ADR-0128) y el «ver más» de «¿Alcanza la tela?» (`.filas-de-mas`,
  `app/estilos/globito-vermas.css:77`, 400 ms): el medidor de `/movimiento` los marca «layout».
- Los dos `:hover` fuera de `(hover: hover)` (`.barra-t` y `.parecidas-punto`) llevan su `hover-tactil` (ADR-0479); la prueba pasa.
- Las entradas de más de 500 ms son de las piezas, una vez y sin bucle: barras 560 ms y avance 760 ms (ADR-0357), la raya de `TituloGrupo` 520 ms,
  el pulso del hilo de la guía 900 ms (ADR-0284) y el lienzo del marco 1 400 ms.
- La pestaña elegida mide 1,24:1 (claro) y 1,65:1 (oscuro) entre su gota y el pozo: se distingue por su forma de píldora (familia `pestanas`).
- Las barras de «De qué se forma», «En qué se fue la plata» y el nivel de cada color van `decorativa` con su nombre y su cifra escritos al lado
  (relleno 13,75:1 contra su pista; la marca del mínimo, 4,66:1 en claro y 8,37:1 en oscuro; el estado va con palabra: «Bajo el mínimo»).
- El ERP arranca quieto (ADR-0625): con las animaciones apagadas, 0 animaciones y toda la información en su lugar.

## De piezas que ya existían (no de este PR)
1. **`<Segmentado>`** (`components/ui/campos.tsx:428`), en «Nueva tela», «Nuevo avío» y «Llegó una compra»: su foco es `outline-none
   focus-visible:bg-rojo/8`: **1,16:1** entre con y sin foco (1,13 en oscuro) y en rojo (WCAG 2.4.7; el foco nunca es rojo, ADR-0351); lleva
   `transition-all duration-300`; con el dedo mide 36 a 39 px de alto; a 375 «Por metro», «Por rollo» y «Queda por pagar» saltan a dos renglones; la
   opción elegida va en `text-rojo` a 13 px (4,48 a 4,68:1 sobre el vidrio de la hoja) — va a `/unificar` (toca `components/ui/`: avisar qué cambia en Dynamic).
2. **`<Modal>`**: al dar la vuelta con Tab, el foco vuelve al primer control sin traerlo a la vista (el «?» del paso 1 de «Llegó una compra» queda en
   y = −127 px a 1440 y −506 a 375; el nombre de «Nueva tela», en −86 a 375) durante una parada — WCAG 2.4.7 y 2.4.11.
3. **`<Chip tono="pizarra">` en oscuro**: «1 orden abierta» mide 3,57:1 (mediana contra su fondo real) en las filas de «Elegir modelo»; «Admin ·
   queda a tu nombre», 3,7 a 5,4 según el tramo del vidrio — WCAG 1.4.3 — va a `/color` y a `tema:auditar`.
4. **La etiqueta de `<Campo>` sobre el vidrio de la hoja**: 4,43 a 4,56:1 a 1440 («De qué está hecha · opcional», 4,43); a 375, donde lo oscuro de la
   página se trasluce bajo la hoja, 3,83 a 3,94:1 («Tejido · conviene», «Nombre») — WCAG 1.4.3 — `lib/vidrio-contraste.test.ts` no tiene ese caso.
5. **`caja-cayla`**: en error su borde es rojo al 55 % (2,4:1); en reposo mide 2,35:1 dentro de la tarjeta de la línea de la compra y a 375
   (WCAG 1.4.11 pide 3:1).
6. **`<Interruptor>` apagado** (`campos.tsx:295`): relleno 1,11:1 contra lo de alrededor y sin borde medible (1.4.11).
7. **`ComboBuscable`**: con el espaciado de WCAG 1.4.12 el nombre de la opción pisa su detalle («Botón nácar 1.8 cm, color Blanco» sobre «Hay 620
   unid.»; `ComboBuscable.tsx:396` y `:397`; medido por el modo `espaciado`, sin captura); el detalle (`text-tinta/55`) da 3,87 a 4,71:1 en oscuro.
8. **`TituloGrupo` chico** («Recientes», «Los demás»): 4,43:1 en oscuro (4,85 en claro).
9. **`MatrizCantidades`** (`components/alta-producto/MatrizCantidades.tsx:398`): la celda con foco solo cambia de relleno (hundido a papel) y de
   borde (a taupe), sin el halo de los campos (ADR-0351, act. 2026-11-05).
10. **La letra del navegador**: del 82 % al 98 % de los textos no la siguen (están en px): propuesta 4 de `/tipografia`.
11. **El lector de tamaño de `<Boton cargando>`**: el medidor lo lee como «espera escrita a mano» («Crear la telaGuardando…»): es `PalabraEnEspera`, no una falla.

## Sin medir
- `tacto:medir` (44 px con el dedo): no corre aquí (no acepta `NAVEGADOR_CANAL` y el Chromium de Playwright no está instalado). Con el dedo solo se
  midieron las cuatro hojas (`pointer: coarse` emulado); las páginas a 375 se midieron con puntero fino.
- `tema:auditar`, `formidable/medir-oficio.js` y el ancho 1024×768 que piden `/color` y `/espacio`: fuera de la tabla de `/milimetro auditar`.
- Lo que exige guardar: el botón mientras guarda, el aviso de éxito, el error que devuelve la base y el doble clic (`/chaos`). No se guardó nada.
- Lo que el banco no tiene: «Qué fabricar primero» con filas, la hoja del modelo, «Un pago está vencido», Eficiencia con planilla y con más de un mes.
- Otra cuenta: quien no es líder, la terminal con el combo «Responsable» y el candado de dinero (todo se midió como Admin).
- El estado `hover` y `active` en vivo (solo se leyó el CSS), el cambio de mes de Eficiencia con las animaciones encendidas (falló el selector del
  recorrido), el 200 % de zoom (1.4.4), el oscuro a 375 px, `prefers-reduced-motion` del sistema y la simulación de daltonismo.
- «Tela, cliente, urgencia…» (`lib/sugerencias-orden-produccion.ts:14`): `textos/medir.js` lo marca como campo «solo con marcador»; no se confirmó
  si tiene etiqueta a la vista.
