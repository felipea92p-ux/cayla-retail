# Ficha al milímetro — Gestión ▸ Análisis, cara B «Una respuesta por pregunta»

Diseñada el **2026-11-21** antes del código (`/milimetro diseñar`), sobre la cara B de `docs/maquetas/analisis-claro-2026-11/` que eligió Felipe
(con los filtros, «Qué pedir» de B y «No se vende» sin «Liquidar»). Funciones de la maqueta: `caraB`, `noSeVendeB`, `pedirB`, `fichaTipo`,
`ficha`, `barraFiltros`, `pildora`, `listaFlotante`, `pintarHoja`, `vacio` (`index.html:636–950`) y sus clases (`index.html:118–140`, `177–180`,
`235–361`).

**Cómo se midió:** leyendo el código de la rama (`claude/analisis-design-improvement-6bc529` @ `d4e7c080c`), sin servidor del ERP. Cada valor dice su
`archivo:línea`; lo que sale de sumar CSS dice «calculado»; lo que necesita el navegador dice «sin medir». La maqueta es el objetivo, no la medida:
donde la maqueta y una pieza decidida difieren, **gana la pieza** y la diferencia va a «Propuestas y choques» (§9).

**Terreno (paso 0):** `docs/SESIONES-ACTIVAS.md` no tiene a nadie rediseñando Análisis hoy (las filas de Análisis son del 06 y 14-oct). No se corrió
`git fetch`. Lo que ya existe en el módulo y se reusa: `components/analisis/piezas.tsx` (`TilePrenda`, `ChipEstado`, `COLOR_ESTADO`, `soles`, `Cuenta`),
`Carril.tsx` (la fila que abre la ficha), `FichaPrenda.tsx` (la hoja de hoy), `app/estilos/analisis*.css` (cascada `.entra`, `.m-tabla`).

---

## 1. El árbol (reglas 1–3)

| # | Pieza / parte | Rama | La pieza del repo (componente · props) | Por qué |
|---|---|---|---|---|
| 1 | **La respuesta** (cifra grande + frase + acciones) | **sin pieza decidida → composición en `components/analisis/` (`Respuesta`)** · si sale de Análisis, **nueva → `/unificar` (familia `cifra`, variante grande)** | Placa: la receta del vidrio claro, la misma de `.tarjeta-cifra` (`vidrio/pantalla.css:62–66`, `--vidrio-claro-*` en `recetas.css:299–302`). Cifra: la letra de `TarjetaCifra` (`font-display lining-nums tabular-nums`, `TarjetaCifra.tsx:236`) a 46 px. Frase: `.texto-bajada`. Acciones: `<Boton peso="fantasma" className="btn-chico">` / `<BotonVer chico>` | La más cercana, `<TarjetaCifra>`, **no alcanza**: cifra tope 28 px (`clamp(1rem,16cqi,1.75rem)`, :236), `etiqueta` en versalitas obligatoria arriba, no admite controles adentro («una cifra que se toca entera no lleva adentro ni (!) ni acción», :43). B es justamente la cifra grande: con 28 px deja de ser la cara que eligió Felipe |
| 1·a | Cuatro respuestas en «Hoy» (`.resp4`/`.resp`) | la misma composición, 2 columnas | `Respuesta` + `ChipEstado` (`piezas.tsx:28`) + pila de `TilePrenda` 44 + `<BotonVer onClick chico>` | El botón «Ver y comprar →» negro con flecha escrita es `accion.ver`: **secundario con su flecha** (CLAUDE.md, fila `accion.ver`) |
| 1·b | La pila de miniaturas (`.pila`) | sin pieza decidida → composición | 5 × `TilePrenda tamano={44}` superpuestas 8 px; la más cercana, `PilaPersonas` (`ui/AvatarPersona.tsx:69`), es de avatares | No se inventa una «pila de prendas» del sistema |
| 1·c | Orden de «No se vende» (`.orden-ns`) | decidida: `pildora-cayla` con `aria-pressed` | `globals.css:668–694`, la gota y su ✓ (`vidrio/campos-y-botones.css:140–157`) | Pero **choca**: en esa pestaña habría dos controles de orden (§9, choque 5) |
| 2 | **La tarjeta de prenda** (`.tarj`) | **sin pieza decidida → composición en `components/analisis/` (`TarjetaPrenda`)** · familia nueva «tarjeta de prenda» → `/unificar` cuando otra pantalla la pida | Conducta de la Vitrina de Existencias: `<article tabIndex={0} aria-label>` sin `role`, el clic que nace en un `button`/`a` no abre (`ExistenciasTarjetas.tsx:327–357`, ADR-0128). Materia: vidrio claro (como `.tarjeta-cifra`). Miniatura: `TilePrenda tamano={72}`. Cifra: 28 px de `TarjetaCifra`. Botón: `<Boton peso="fantasma" className="btn-chico">` | La más cercana, `.tarjeta-vitrina` (ADR-0589), es de Existencias: foto de 104 px, tira de tallas y **la única sombra en reposo permitida**; no se copia su sombra. `Carril` (`.c-fila`) es una fila, no una tarjeta |
| 3 | **La tarjeta de tipo** («Qué pedir») | la misma `TarjetaPrenda` con otra miniatura | Miniatura: `IconoCategoria prefijo familia` (`components/IconoCategoria.tsx:11`) en la lente teñida de su estado, la de `.c-grupo .ic` (`analisis.css:163`) llevada a 72 px | Es la misma tarjeta (Felipe: «una sola para todas las pestañas») |
| 4 | **La barra de filtros** | **decidida, reusada:** el patrón de Productos y Existencias | `<Buscador>` (`ui/Buscador.tsx`) · `<DesplegablePildora varias opciones[{cantidad}]>` ×6 (`ui/FiltrosPildora.tsx:137`) · `<BotonLimpiar>` (`ui/FiltrosPuestos.tsx:27`) · «Ordenar por» = `<DesplegablePildora encoger>` (`FiltrosProductos.tsx:317–327`) · celular: `<BotonFiltros soloIcono>` (`FiltrosPildora.tsx:30`) + `<Modal titulo="Filtros">` con el mismo panel y su pie (`FiltrosProductos.tsx:575–595`, `FiltrosExistencias.tsx:476–489`) · `<FiltroPuesto>` bajo el buscador en el celular · vacío: `<Vacio icono={<SearchX/>} filtros acciones>` | Familias `buscador`, `filtro`, `accion.filtrar`, `accion.limpiar`, `vacio`, `hoja-movil`: todas decididas. Los chips de la hoja de la maqueta (`.hf-chip`) **no** son el patrón decidido (§9, choque 6) |
| 5 | **La ficha** (tres bloques) | **decidida en su cáscara, compuesta adentro** | `<Modal titulo subtitulo variante="hoja" tamano="mediana" conCerrar>` (como `FichaPrenda.tsx:85`) | Familia `modal`: una sola cara (Serena), ancho con nombre |
| 5·a | Veredicto en una línea con su color (`.f-ver`) | sin pieza decidida → composición en `components/analisis/` | `Icono` de Análisis + `COLOR_ESTADO` + placa teñida con `--c`; hoy lo dice `ChipEstado` en `.h-cab` (`FichaPrenda.tsx:88–91`) | `<Aviso>` no sirve: es un aviso, no un veredicto, y `tono="error"` pone `role="alert"` y destella (`ui/Aviso.tsx:51`) |
| 5·b | Las tres cifras (`.f-cif`) | **decidida:** `<TarjetaCifra etiqueta valor>` ×3 (informa) | `ui/TarjetaCifra.tsx` | `/graficos` regla 18: «La cifra es `<TarjetaCifra>`» |
| 5·c | Vendidas cada semana (`.sem`) | **decidida:** `<BarrasTiempo barras destacada cifras="todas" alto={96} etiqueta>` (`ui/BarrasTiempo.tsx:56`) | La maqueta dibuja exactamente su cara: arena/36 % de tinta, la última en tinta, máx. 28 px | Análisis podría quedar aparte (CLAUDE.md `grafico.barras`), pero la pieza ya es igual: menos CSS propio |
| 5·d | Talla y color (`.mat`) | **existe en el módulo:** `.m-tabla` + `.m-leyenda` con `tablaDelModelo` (`FichaPrenda.tsx:120–188`, `analisis.css:232–275`) | | Las matrices de tallas quedan fuera de `<Tabla>` (CLAUDE.md, fila `tabla`) |
| 5·e | Títulos de bloque («Vendidas cada semana», «Talla y color») | **decidida:** `<TituloGrupo>` (`ui/TituloSeccion.tsx:85`) | | Grupo dentro de una hoja: versalitas de 11 px con su raya |
| 5·f | Botones al pie | **decididas:** `pie-acciones` (`estilos/pie-acciones.css:12`) · principal `<BotonEnlace peso="primario">` · «Ver en Existencias» `<BotonVer href>` · «Pedir a Arequipa» `<Boton peso="fantasma">` · «Movimientos» a la izquierda (`pie-acciones-izq`, :22) | | Familias `boton`, `accion.ver`, `accion.cancelar` (el pie) |
| — | Títulos de sección de «No se vende» (`.sec-t`) | **decidida:** `<TituloSeccion cuenta={n} dato={…} ayuda={…}>` (`ui/TituloSeccion.tsx:37`) | | El globito pegado al nombre (ronda 9); «allá se vendieron este mes» explica → `ayuda` |
| — | Pestañas | **decidida:** `<Pestanas items[{conteo, tono:"rojo"|"neutro", pide}]>` (como hoy, `AnalisisPantalla.tsx:330–342`) | | |

**Materia (regla 4):** respuesta y tarjetas **corren con el scroll y son muchas iguales** → vidrio claro **sin `backdrop-filter`** (ADR-0623). Solo flotan
quietos la lista de una píldora (la pieza ya trae su receta) y las hojas (Serena, la pone `<Modal>`).

---

## 2. Pieza 1 — La respuesta (`Respuesta`, composición)

Propósito: decir **la respuesta** de la pestaña en un número antes que cualquier lista («3 modelos se acaban en 3 días o menos»).

### Texto (de /textos)
| Dónde | Literal | Regla |
|---|---|---|
| Se acaba | **«3 modelos»** · «se acaban en 3 días o menos» · botón «Comprar todas» | patrón 1 (verbo + qué) |
| No se vende | **«S/ 2,280»** · «parados en 9 modelos que no se venden» | F1: `soles` sin céntimos con U+00A0 (`piezas.tsx:192`), cifra para decidir |
| Sin salir | **«4 modelos»** · «están guardados y nadie los vio» · «Bajar todas» | |
| Qué pedir | **«5 tipos»** · «no te alcanzan hasta Navidad, en 34 días» · «Abrir el plan de campaña» (`BotonVer`) | Felipe: la pestaña es «Qué pedir», nunca «Para Navidad» |
| Hoy (×4) | pregunta en versalitas «¿Qué se acaba?» · chip «Urgente»/«Atención» · cifra · frase · «y 3 más» · «Ver y comprar» | versalitas de 1–3 palabras (`/tipografia` 11) |
| Ninguno | «Ninguno» + «se acaba antes de Navidad» (Qué pedir); en las demás, `<Vacio tamano="chico">` | patrón 11 |
Plural: «1 modelo» / «2 modelos» (la maqueta ya lo hace, `index.html:907–910`). Sin «!» ni relleno.

### Espacio (de /espacio)
- Densidad: cómoda (escritorio, mouse); táctil por `tacto.css`.
- Placa: relleno **24 px** (`p-6`; la maqueta trae 24 × 26 → 26 está fuera de escala) y **16 px bajo 640 px** del contenedor `analisis` (como `TarjetaCifra`, `p-4`).
  Radio `--radius-tarjeta` **22 px** (`globals.css:334`). Ancho: todo el de la pantalla (ADR-0462).
- Adentro: cifra → frase **4 px** (la maqueta 6: medio paso fuera de un control → 4); bloque de texto ↔ acciones **16 / 24 px** (`gap: 16px 24px`, ya en escala).
  Hueco con lo de abajo: el `gap` de la vista, **24 px** (`.an`, `index.html:20`). Adentro (4) ≤ entre (24) ✓.
- Hoy: rejilla de 2 columnas, hueco **16 px**; una columna bajo **760 px** del contenedor (`@container analisis`). Cada tarjeta: relleno 24, hueco
  vertical **12 px** (la maqueta 14 → fuera de escala). Sin `min-height: 220px`: la rejilla ya iguala la fila.
- Pila: miniaturas de 44 px, `margin-right: -8px`, anillo de 2 px en `--color-papel` (la receta de `index.html:125`, sin la sombra propia) · «y N más» a 16 px.
- Área de clic: los botones 40 px con mouse (`vidrio/campos-y-botones.css:84` le gana a `btn-chico` 44 de `globals.css:574`; propuesta 2 de `/espacio`) y 44 con el
  dedo (`tacto.css:13`). Alto calculado de la respuesta: 24 + 46 + 4 + 21 + 24 ≈ **119 px** (sin medir).

### Tipografía (de /tipografia)
| Texto | Qué hace | Pieza / clase | Letra · tamaño/interlineado · peso | Nivel |
|---|---|---|---|---|
| Cifra | compara | `.font-display lining-nums tabular-nums` | EB Garamond · **46/1** (36 bajo 640 px) · **600** · −0,025 em | rampa: 46/36 del título de pantalla (`escala.md`); la maqueta trae 52 y 500 → fuera de rampa y peso que EB no usa (§9) |
| Frase | lee | `.texto-bajada` (`titulos.css:38`) | DM Sans · 15/1,4 · 400 · taupe | decidido (`texto`, ronda 19); la maqueta trae 16 |
| Pregunta (Hoy) | escanea | `label-cayla` | DM Sans · 11 · 600 · 0,13 em, mayúsculas | `/tipografia` 11 |
| «y 3 más» | lee | `.texto-detalle` (`titulos.css:39`) | 14/1,4 · tinta 70 % | piso de lectura 14 (la maqueta 13,5) |
Cifras: EB Garamond **sí** trae tabulares; «S/» con espacio duro. Medida: la frase cabe en una línea (≤ 60 caracteres).

### Color (de /color)
| Parte | Token | Claro crema/papel | Oscuro crema/papel |
|---|---|---|---|
| Cifra «Se acaba» | `--color-rojo-profundo` (= `COLOR_ESTADO.urg`, `piezas.tsx:20`) | 7.56 / 8.09 | 8.05 / 7.19 |
| Cifra «No se vende», «Qué pedir» (pide) | `--color-ambar` | 6.37 / 6.82 | 9.46 / 8.44 |
| Cifra «Sin salir» | `--color-pizarra` | 5.98 / 6.39 | 8.49 / 7.58 |
| Cifra «Qué pedir» (ninguno) | `--color-verde` | 6.13 / 6.56 | 9.38 / 8.37 |
| Frase | `--color-taupe` | 5.21 / 5.58 | 7.77 / 6.94 |
| Placa | `--vidrio-claro-fondo/-borde/-sombra` | — | `recetas.css:529–530` |
Valores de `color/referencia/contrastes.md` (texto ≥ 24 px pasa desde 3:1). Sobre el vidrio claro (más claro que la crema) el contraste sube; **sin medir** sobre la
Aurora en oscuro. **Nunca `--color-rojo` en la cifra** (la maqueta lo usa): el rojo pleno es acento de presupuesto 2 por pantalla y ya lo gasta el globito de la pestaña.

### Estados (de /milimetro)
Pieza: `Respuesta` · rama: sin pieza decidida → composición (la conducta de `TarjetaCifra`: informa).
| Estado | Qué se ve | Qué se anuncia | Cómo se mide | Nivel · fuente |
|---|---|---|---|---|
| default | placa de vidrio claro, cifra en su tono | la cifra y su frase en un solo `<p>` («3 modelos se acaban en 3 días o menos») | medir.js · contraste | [Norma] 1.4.3 |
| hover | no aplica: la placa informa, no se toca (los botones de adentro llevan el suyo) | — | medir.js · hoverSueltos | — |
| focus-visible | solo en sus botones: el anillo único (`globals.css:463–468`) | — | medir.js `{ foco: true }` | [Norma] 2.4.7 |
| active | en sus botones: `.mov-boton` (`scale` 0,97 en `--t-resp`) | — | /movimiento | [Práctica] M3 |
| selected | no aplica en la placa. Los chips de orden de «No se vende», `aria-pressed` + ✓ (`campos-y-botones.css:149–157`) | `aria-pressed` | medir.js · seleccion | [Norma] 1.4.1, 4.1.2 |
| disabled | no aplica: «Comprar todas» no se apaga; si el rol no ve el destino, **no se dibuja** (como `accionPrincipal`, `FichaPrenda.tsx:78`) | — | — | regla del repo (ADR-0161) |
| loading | no aplica: no guarda; la pestaña carga con su esqueleto (`loading.tsx`, ADR-0149) | — | — | ADR-0149 |
| error | no aplica: lo que falla en la lectura es la pantalla (`error.tsx`) | — | — | — |
| read-only | toda la placa es lectura: enfocable solo por sus botones, contraste completo | — | — | — |
| vacío | cero: «Ninguno …» en verde (Qué pedir) o `<Vacio tamano="chico">` («Con estos filtros no hay ninguno aquí.») | — | medir.js · etiquetas | patrón 11 |
| quieto | llega en su lugar (sin cascada) y la cifra **no cuenta**: sale con su valor final | — | `data-movimiento="quieto"` | [Norma] 2.3.3; ADR-0625 |

### Movimiento (de /movimiento)
- Explica: «esta es la respuesta», una vez al entrar a la pestaña. Frecuencia media (unas veces al día).
- **Entrada (excepción de Análisis, ADR-0357 / ADR-0136 act. 2026-10-06 b):** `.entra` = `an-entra` 380 ms `--ease-cayla`, sube 8 px, desfase 55 ms × min(i, 8)
  (`analisis.css:17,48`), solo mientras la raíz tiene `.anim`. La respuesta es la pieza 3 de la cascada (cabecera 0, pestañas 1, barra 2).
- **La cifra cuenta** de 0 a su valor en 700 ms (`data-cuenta` / `Cuenta`, `piezas.tsx:184`; el bucle está en `AnalisisPantalla.tsx:190–205`). «S/ 2,280» **no
  cuenta**: `Cuenta` solo escribe enteros y `CifraQueCuenta` da céntimos; queda quieta (no se inventa un formato).
- **Al filtrar o escribir no vuelve a entrar ni a contar** (la maqueta: `.sin-entrada`, `index.html:306`): lo dispara una tecla → el número cambia en el cuadro
  siguiente (`/movimiento` regla 3).
- Sin rebote ni bucle; `lib/analisis-movimiento.test.ts` ya vigila `analisis*.css` (curva única, ≤ 1,2 s, sin `infinite`, `@layer components`).
- **Quieta:** todo en su lugar final, el color de la cifra conserva el estado.

---

## 3. Pieza 2 — La tarjeta de prenda (`TarjetaPrenda`, composición)

Propósito: una prenda y **un** número que dice por qué está ahí; toda la tarjeta abre su ficha y, si corresponde, un botón hace lo suyo.

### Texto (de /textos)
| Parte | Literal (ejemplo) | Regla |
|---|---|---|
| Nombre | «Vestido Rubí» | `nombre` del modelo |
| Color y tallas | «Rubí · S a L» | `queTiene()` (`lib/analisis-modelo.ts`), el punto medio |
| Número + unidad | «3» «días te quedan» · «Ya no hay» · «5» «días guardada» · «64» «días sin venderse» | el número va solo; la unidad dice qué es |
| Detalle | «Llegan 6 el 26 nov.» · «Arequipa vendió 15 este mes» · «Tienes 6 · S/ 576 parados» | F4: fecha de Lima con punto (`lib/fechas-lima.ts`); F1 `soles` |
| Botón | «Comprar» · «Bajar» · «Mandar» (nada en «No se vende» salvo «Mandar») | patrón 1; Felipe 2026-11-21: sin «Liquidar» |
| Nombre accesible | «Vestido Rubí, Rubí S a L: 3 días te quedan. Enter abre su ficha.» | como la Vitrina (`ExistenciasTarjetas.tsx:335`) |

### Espacio (de /espacio)
- Rejilla de tarjetas: `repeat(auto-fill, minmax(250px, 1fr))`, hueco **16 px** (la maqueta 14 → fuera de escala). A 375 px, una columna (343 útiles).
- Tarjeta: relleno **16 px**, rejilla `72px minmax(0,1fr)`, hueco **12 px** (filas) × **16 px** (columnas); el pie a todo el ancho con su línea `--hilo-fila`
  (`recetas.css:112`) y **12 px** arriba (la maqueta 10 → medio paso fuera de un control). Radio **22 px** (`--radius-tarjeta`; la maqueta 20).
- Miniatura: `TilePrenda tamano={72}` → radio 14 px (`tamano/5`, `piezas.tsx:69`). Concéntrico esperado 22 − 16 = 6 px: **no lo es** y no se corrige aquí (es la pieza
  de ADR-0333; anotado para `/espacio`).
- Nombre → color/tallas 0; bloque de nombre → cifra **8 px** (la maqueta 6). Botón: 40 px con mouse, 44 con dedo. Alto calculado ≈ **170 px** con botón (sin medir).
- Área de clic: la tarjeta entera (≫ 24). El botón de adentro mide 40 por sí mismo (`/espacio` regla 19 ✓).

### Tipografía (de /tipografia)
| Texto | Qué hace | Clase | Letra · tamaño/interlineado · peso | Nivel |
|---|---|---|---|---|
| Nombre | escanea | título de fila | DM Sans · **15**/1,3 · 600 | decidido (ronda 19) |
| Color y tallas | lee | `.texto-detalle` | DM Sans · **14**/1,4 · tinta 70 % | piso 14 (la maqueta 13,5 → **reprueba** la fila `texto`) |
| Número | compara | `.font-display lining-nums tabular-nums` | EB Garamond · **28**/1 · 600 | rampa: cifra de tarjeta (`TarjetaCifra.tsx:236`); la maqueta 30 |
| Unidad | lee | `text-sm text-taupe` | DM Sans · **15** · taupe | como la `unidad` de `TarjetaCifra` |
| Detalle del pie | lee | `.texto-detalle` | **14**/1,4 | la maqueta 13 → **reprueba** |
| Botón | toca | `btn-chico` | 12,5 / 500 | `globals.css:574` |
Español: el nombre más largo real a 250 px de tarjeta (~158 px de texto) puede partirse en dos líneas: **dos, nunca «…» sin `title`** (1.4.12).

### Color (de /color)
- Placa: vidrio claro (`--vidrio-claro-*`), **sin la sombra de reposo de la Vitrina** (la excepción es solo de Existencias, ADR-0589).
- Número en el tono del estado de su grupo, por `--c` = `COLOR_ESTADO` (`piezas.tsx:19–25`): `urg` rojo-profundo · `ate` ámbar · `info` pizarra · `bien` verde · `nd` taupe.
  En «No se vende», desde **90 días**, rojo-profundo (README de la maqueta: «rojo desde 3 meses»). Contrastes: §2, tabla de color.
- Nombre `tinta` (15.36 / 16.44 claro; 15.31 / 13.67 oscuro); detalle tinta 70 % (sobre el piso de 64 %, `tema.css`); unidad `taupe` (5.21 / 5.58).
- Miniatura: color de la prenda = dato (`data-color-dato`, lo pone `MosaicoPrenda`). Lo que no se distingue solo por color: el número lleva su unidad en palabras
  («días te quedan» vs «días sin venderse»), así rojo/ámbar (ΔE 8,6 en deuteranopía) no confunde.

### Estados (de /milimetro)
Pieza: `TarjetaPrenda` · rama: sin pieza decidida → composición (conducta de la Vitrina, materia de `TarjetaCifra`).
| Estado | Qué se ve | Qué se anuncia | Cómo se mide | Nivel · fuente |
|---|---|---|---|---|
| default | vidrio claro, borde `--vidrio-claro-borde` | `<article tabIndex={0} aria-label>` | medir.js · contraste | [Norma] 1.4.3, 4.1.2 |
| hover | solo `@media (hover: hover)`: sube 2 px y `--serena-sombra-encima` (`recetas.css:105`), como `.tarjeta-cifra[data-conducta="lleva"]` (`pantalla.css:77`) | — | medir.js · hoverSueltos; `hover-con-mouse.test` | [Práctica] M3 · regla del repo |
| focus-visible | el anillo único: 2 px de tinta a 2 px (`globals.css:463–468`) | — | medir.js `{ foco: true }` + Tab | [Norma] 2.4.7, 2.4.13 |
| active | la tarjeta no se encoge (el botón de adentro sí: `.mov-boton`); el clic abre la ficha | — | a ojo | [Práctica] |
| selected | no aplica: abre una hoja, no queda elegida | — | — | — |
| disabled | no aplica en la tarjeta. El botón: si el rol no ve su destino, **no se dibuja** (nunca apagado) | — | medir.js · apagados | ADR-0161 · [Práctica] Axess Lab |
| loading | no aplica: no guarda. «Mandar» abre `PedirAOtraSedeModal`, que trae su `<Boton cargando>` | — | `/chaos` sobre esa hoja | ADR-0358 `accion.guardar` |
| error | no aplica | — | — | — |
| read-only | es lectura salvo su botón: contraste completo, enfocable | — | — | — |
| vacío | sin tarjetas: `<Vacio tamano="chico">` en su lugar | — | medir.js · etiquetas | patrón 11 |
| quieto | sin cascada; al pasar el mouse la sombra cambia y el alza de 2 px llega sin viaje (0,01 ms, `movimiento.css:16–23`) | — | `data-movimiento="quieto"` | ADR-0625 (ver propuesta 2 de `/movimiento`) |

### Movimiento (de /movimiento)
- Entrada: `.entra` en cascada con la vista (índice desde 4, topado en 8: `min(var(--i), 8) × 55 ms`, `analisis.css:48`). Con 18 tarjetas la cascada termina en
  ≤ 380 + 8 × 55 = **820 ms** (calculado), dentro del presupuesto de 1,2 s.
- Hover: `transform` y `box-shadow` en **`--t-cambio` (160 ms)** con `--ease-cayla` (no los 250 ms escritos de `pantalla.css:66`: no es token).
- Al filtrar: lo que queda no vuelve a entrar; lo nuevo aparece sin cascada (lo dispara una tecla).
- Sin rebote ni bucle. Quieta: ver «Estados».

### Accesibilidad
- 4.1.2: **nunca `role="button"` con un `<button>` adentro** (lo hace la maqueta, `index.html:917`): los hijos de un `role="button"` son presentacionales y el
  lector no anuncia «Comprar». El patrón de la Vitrina: `<article tabIndex={0} aria-label>` + `onClick` que ignora `button, a` y el clic que no nació en su DOM;
  Enter/espacio solo si `e.target === e.currentTarget` (`ExistenciasTarjetas.tsx:345–356`). El `alTeclear` de `AnalisisPantalla` mira `[role="button"]`: la tarjeta
  lleva su propio `onKeyDown`.
- 2.4.11: al tabular, la tarjeta no queda tapada entera por la cabecera de vidrio (sin medir: propuesta 5 de `/milimetro`).

---

## 4. Pieza 3 — La tarjeta de tipo («Qué pedir»)

**Lo mismo que §3**, con estas diferencias:
- **Miniatura:** lente de 72 px, radio 14 px, fondo `color-mix(--c 12%, transparent)` y el ícono en `--c` (la de `.c-grupo .ic`, `analisis.css:163`); adentro
  `<IconoCategoria prefijo familia className="h-10 w-10">` (40 px). Contraste del ícono sobre su lente: ámbar sobre ámbar/15 = 5.47 (≥ 3:1 de gráfico ✓).
  No es una prenda: **sin** `data-color-dato`. La maqueta mezcla con `--papel` (`index.html:177`); la lente del repo mezcla con transparente → se queda la del repo.
- **Texto:** nombre «Blusas» · detalle «Vendiste 18 · tienes 9» · número «6» + «días te alcanzan» (o «Ya no hay») · pie «La M se acaba primero» / «Ya no hay talla S»
  (`tallaTxt`) · botón «Comprar».
- **Color:** `--c` = ámbar (pide) o rojo-profundo (≤ 3 días); verde «te alcanza»; taupe «sin ventas» (`colorTipo`, `index.html:762`, con rojo-profundo en vez de rojo).
- **Abre** la hoja del tipo (§6, variante). Los tipos que alcanzan o no se vendieron van como `btn-enlace` dentro de una frase («Te alcanzan: Jeans, Vestidos y
  Pantalones», `index.html:833–834`): enlace en una frase = `btn-enlace` (familia `enlace`).

---

## 5. Pieza 4 — La barra de filtros

Propósito: llegar a una prenda o a un grupo **mientras se escribe o se toca**, viendo cuántos hay antes de elegir.

### El árbol en detalle
| Parte | Pieza · props |
|---|---|
| Buscar | `<Buscador valor={q} onCambio={setQ} placeholder="Busca prenda, tipo o color" etiqueta="Busca una prenda" atajo guia="analisis.buscador" className="flex-1 max-w-[360px]">` — filtra en el navegador: nunca `buscando` (hoy así, `AnalisisPantalla.tsx:248`). Placeholder con `// sugerir-fijo:` (dice qué se puede buscar) |
| Tipo · Talla · Color · Precio · Viene de · Sin venderse | `<DesplegablePildora icono={…} etiqueta="Tipo" varias={{ valores, onValores }} opciones={[{ valor, texto, cantidad }]} rotuloCantidad="Modelos">` ×6. Íconos lucide: `Shirt` (como Productos), `Ruler`, `Palette`, `Tag`, `Factory`, `Clock`. Color: `icono` = el punto de la prenda con `data-color-dato` (como `FiltrosProductos.tsx:409–415`). Precio: tres tramos como opciones (no el `BloquePrecio` de rango de Productos: Análisis ya tiene el precio en tres tramos) |
| Limpiar | `<BotonLimpiar onClick>Limpiar todo</BotonLimpiar>` — «todo» porque también borra la búsqueda (`FiltrosPuestos.tsx:10–12`); solo con algo puesto |
| Cuántos | `<p aria-live="polite" class="text-sm">Ves <strong>16</strong> de 18 modelos</p>` / «<strong>18</strong> modelos en tu tienda» (la línea de Productos, `FiltrosProductos.tsx:331–335`) |
| Orden | `<DesplegablePildora encoger icono={ArrowUpDown} etiqueta="Ordenar por" valor valorPorDefecto onValor opciones>` (`FiltrosProductos.tsx:317–327`): «Lo más urgente» · «Lo que más se vende» · «Por nombre»; en Qué pedir, «Lo que más se vende» · «Lo que se acaba antes» · «Por nombre» |
| Celular | `<BotonFiltros soloIcono abierto activos onClick>` junto al buscador · `<Modal titulo="Filtros" subtitulo="Cada cambio se aplica al momento." tamano="mediana">` con **el mismo panel** (`PanelPildoras filas` + `FilaPildoras`) y `<div className="pie-hoja-fijo pie-acciones mt-4">` con «Limpiar» (`btn-secundario`, solo con algo puesto) y «Ver 16 modelos» (`btn-primario flex-1`) — exactamente `FiltrosProductos.tsx:575–595`. Con la hoja cerrada, lo puesto va en `<FiltroPuesto>` bajo el buscador |
| Nada | `<Vacio icono={<SearchX/>} titulo="Nada coincide con «blusa roja»" filtros={[{ texto, onQuitar }]} acciones={<BotonLimpiar onClick>Limpiar todo</BotonLimpiar>}>Quita un filtro o busca otra cosa.</Vacio>`; sin búsqueda, `icono={<FunnelX/>}` y «Nada coincide con estos filtros» (patrón 12) |

### Espacio (de /espacio)
- Fila: buscador **44 px** (`vidrio/campos-y-botones.css:78`), píldoras **34 px** con mouse (`campos-y-casillas.css:246`) y **44 px** con el dedo (`tacto.css:28`);
  hueco **8 px** entre píldoras y **12 px** entre el buscador y las píldoras (la maqueta 10 → fuera de escala). Dos altos en la fila (44 / 34): es el par decidido
  de Productos; anotado (`/espacio` regla 12), no se corrige aquí.
- Línea de cuántos: **12 px** bajo la barra (la maqueta: 24 − 12, `index.html:261`). La barra ↔ el contenido: 24 px (el `gap` de la vista).
- Lista que se abre: la de la pieza (portal, `useDestinoFlotante`), opción 36 px con mouse y **44 con el dedo** (`tacto.css:34–35`); buscador propio con más de 8 opciones (ADR-0209).
- Celular: el contenedor de la barra declara `@container barra-filtros` y bajo 640 px la píldora marcada es solo su ícono de **38 px** (`campos-y-casillas.css:308–318`).
  En la cabecera de Existencias el botón crece a 44 (`existencias/FiltrosEnCabecera.tsx:21`); aquí va junto al buscador: 38 (como Productos).
- La ✕ de una píldora puesta mide **22 × 22** con mouse (`campos-y-casillas.css:284–288`): bajo 24 (WCAG 2.5.8) y dentro de la píldora. Es la pieza decidida: anotado para `/espacio`.

### Tipografía (de /tipografia)
Lo pone la pieza: píldora 14 / 500 (valor 600), buscador 14, cantidad de cada opción 13 (`text-xs tabular-nums`, sube al piso de 64 %), «Ves 16 de 18 modelos» 15
(`text-sm`) con la cifra en 600. Lo puesto con varias: «Blusas, Polos +1» (`textoPildoraVarias`, `lib/pildora-reglas.ts:18–22`), nunca «3 elegidos».

### Color (de /color)
Reposo: gota con borde `borde-control` (3.57 claro / 4.25 oscuro, 1.4.11 ✓), letra tinta 82 % (`campos-y-botones.css:125–131`). Puesta: ahumado denso + crema
(`campos-y-botones.css:140–146`). Abierta: flecha en rojo de marca (`campos-y-casillas.css:281`) — **gasta un rojo mientras está abierta**. Buscador: el pozo,
`borde-control`, al escribir sube a `--pozo-encendido-*`. Punto de color de la opción: dato (`data-color-dato`).

### Estados (de /milimetro)
Pieza: el conjunto de la barra · rama: decidida (piezas `buscador`, `filtro`, `accion.filtrar`, `accion.limpiar`, `vacio`, `hoja-movil`).
| Estado | Qué se ve | Qué se anuncia | Cómo se mide | Nivel · fuente |
|---|---|---|---|---|
| default | buscador pozo con «/»; píldoras gota con su nombre y ▾ | `aria-haspopup="listbox"`, `aria-expanded` | medir.js · contraste | [Norma] 1.4.3, 1.4.11 |
| hover | solo `(hover: hover)`: la píldora sube 1 px y pasa a `--gota-marca` (`campos-y-botones.css:132–137`) | — | hover-con-mouse.test | regla del repo |
| focus-visible | píldora: el anillo único; buscador: el anillo único por `:has(input:focus-visible)` (`vacio-aviso-buscador.css:151`) y el pozo encendido (`vidrio/campos-y-botones.css:79`) | — | medir.js `{ foco: true }` | [Norma] 2.4.7 |
| active | la píldora se rellena al tocar una opción; la lista sigue abierta (varias) | `aria-selected` en la opción | a ojo | — |
| selected | píldora **puesta**: ahumado + valor + ✕; opción: casilla marcada | `aria-label="Tipo: Blusas, Polos"`, `aria-multiselectable` | medir.js · seleccion | [Norma] 1.4.1, 4.1.2 |
| disabled | una opción con 0 modelos **se ve con su 0 y se puede tocar** (la pieza no tiene `deshabilitada`; la maqueta la apaga → §9) | — | medir.js · apagados | regla del repo |
| loading | no aplica: filtra en el navegador; nunca «Buscando…» (ronda 5) | — | — | ADR-0358 `buscador` |
| error | no aplica | — | — | — |
| read-only | no aplica | — | — | — |
| vacío | barra sin nada puesto: sin «Limpiar todo»; lista de la píldora sin coincidencias: `<Vacio tamano="chico" icono={<SearchX/>}>` (la pieza ya lo trae); pantalla sin resultados: el `<Vacio>` de arriba | — | medir.js · etiquetas | patrón 12 |
| quieto | la lista aparece sin `anim-revelar`, la flecha gira sin viaje, la hoja del celular llega en su lugar; el hilo del buscador no corre (no busca) | — | `data-movimiento="quieto"` | ADR-0625 |

### Movimiento (de /movimiento)
De la pieza, sin agregar nada: lista `anim-revelar` 240 ms (ADR-0211); flecha −180° en `--t-cambio`; fondo de la puesta en `--t-cambio`; `<FiltroPuesto>` con
`anim-entrada`; la hoja del celular llega desde el borde (460 ms entra / 300 sale, `Modal.tsx:18–20`) y se baja con el dedo. **Cambiar un filtro no anima la lista
de abajo** (no vuelve a entrar; la maqueta `.sin-entrada`). El foco y el cursor se quedan donde estaban al repintar (`index.html:981–988`: en React, la clave estable del campo).

### Accesibilidad
2.1.1 teclado: «/» lleva al buscador (`atajo`, uno por pantalla); Escape cierra primero la lista y después la hoja (`useEscapeLibre`, ADR-0136 act. 2026-09-26).
4.1.3: la línea de cuántos es `aria-live="polite"`. 1.4.1: lo puesto se lee (valor y ✕), no solo se rellena.

---

## 6. Pieza 5 — La ficha de la prenda (tres bloques)

Propósito: **qué hacer** con esta prenda (veredicto), **cómo se vendió** (cifras y semanas) y **qué talla falta** (matriz), con su botón.

### Orden y piezas (de arriba abajo)
1. `<Modal titulo="Vestido Rubí" subtitulo="Rubí · S a L · S/ 169" variante="hoja" tamano="mediana" conCerrar>` — 576 px (`ANCHO_HOJA.mediana = max-w-xl`,
   `Modal.tsx:110`; la maqueta 620). Lee y lleva a otras pantallas: **la × sola, sin «Cancelar»** (familia `modal`).
2. **Fila de arriba** (`.h-cab`, `FichaPrenda.tsx:88`): `TilePrenda tamano={72}` + **el veredicto** a su derecha. `Modal` dibuja su propio título: la miniatura no
   puede ir pegada a él sin `lateral` (que corre toda la hoja y no sale en el celular, `Modal.tsx:52–56`); va en la primera fila, como hoy.
3. **Veredicto** (`Veredicto`, composición): placa teñida `color-mix(--c 9%, transparent)`, borde `color-mix(--c 28%, transparent)`, radio 16 (`--radius-xl`),
   relleno 16, ícono de Análisis de 20 px (`Icono nombre={ICONO_ESTADO[est]}`) + la frase en EB Garamond **24**/1,15 **400** en `--c`. La frase sale de una función
   pura nueva en `lib/analisis-ficha.ts` (`veredictoDe`), con su prueba, junto a `chipDeGrupo`.
4. **Tres cifras:** rejilla de 3 columnas, hueco 12 px, `<TarjetaCifra etiqueta="Vendiste" valor={12}>en 30 días</TarjetaCifra>` · `etiqueta="Tienes" valor={26}>hoy` ·
   la tercera según el grupo («Llegan» 6 / «el 26 nov.»; «Parados» S/ 576; «Te dura» 3 / «semanas»). Etiqueta de 1–2 palabras (versalitas: nunca una frase).
5. `<TituloGrupo>Vendidas cada semana</TituloGrupo>` + `<BarrasTiempo barras={8 semanas} destacada={última} cifras="todas" alto={96} etiqueta="Vendidas cada semana en Trujillo, últimas 8">`
   con `etiqueta` de cada barra «27 set.»…«15 nov.». Sin ventas: `<Vacio tamano="chico">Ninguna en las últimas 8 semanas.</Vacio>`.
6. `<TituloGrupo>Talla y color</TituloGrupo>` + `.m-tabla` (`tablaDelModelo`) + `.m-leyenda`. Celdas: «quedan 3» (verde) · «se acabó» (**ámbar**, como `.m-tabla td.pedir`,
   `analisis.css:242`; la maqueta rojo) · «no hay» (borde).
7. `<div className="pie-acciones">`: a la izquierda «Movimientos» (`btn-cayla btn-sutil`, como hoy, o `btn-enlace`) · a la derecha «Pedir a Arequipa» (`<Boton peso="fantasma">`,
   solo si hay de dónde) y la principal (`<BotonEnlace peso="primario">` «Comprar» / «Bajar al piso» / «Mandar a Arequipa»; o `<BotonVer href>` «Ver en Existencias»
   cuando no hay nada que hacer). Cada uno solo si el rol ve su destino (`accionPrincipal`, `sedeParaPedir`, `hrefExistencias`, `hrefMovimientos`).

**Variante: la hoja del tipo** (`fichaTipo`): la misma cáscara; fila de arriba con la lente del tipo; veredicto («Te alcanzan hasta el 4 de diciembre. Pide antes.»);
tres `TarjetaCifra`; «Las tallas que se llevan» = por talla, dos `<BarraAvance alto="normal" tono="tinta">` (vendiste, y tienes con `color` de tinta al 30 %) contra
la mayor (`grafico.escala`) con «vendiste 4 · tienes 7» escrito al lado (así la barra clara no necesita 3:1, `/graficos` regla 16) y **sin leyenda** (la etiqueta
directa ya lo dice, regla 11); «Lo que más se vende»: filas con `TilePrenda 36` + nombre + `<Chip tono>` «Quedan 3»/«Agotada»; pie «Abrir el plan de campaña»
(`<BotonVer href>`) y «Comprar» (`<BotonEnlace peso="primario">`) si pide.

### Espacio (de /espacio)
Hoja: relleno 28 px (`vidrio/hoja.css:35`), la cascada del sistema. Entre bloques **24 px**; título de grupo → su contenido 12 px (adentro ≤ entre ✓). Fila de
arriba: miniatura 72 + 16 px + veredicto. Cifras: 3 columnas también a 375 px (la `TarjetaCifra` achica su número con `@container`, 16 → 28 px). Matriz: la de
`.m-tabla` (celdas con 4 px de separación, `analisis.css:233`; a 375 px se desliza con la columna de color pegada, :259–267). Pie pegado abajo en una hoja larga:
`pie-hoja-fijo` (CLAUDE.md «Botones a la vista»). Botones 40 / 44.

### Tipografía (de /tipografia)
Título de hoja 27/1,1 (25 bajo 640, `hoja.css:48–50`) · subtítulo 15 taupe · veredicto EB Garamond **24**/1,15 **400** (rampa: 24; la maqueta 500) · cifras de
`TarjetaCifra` (28 · etiqueta 11 versalitas · contexto 14) · título de grupo 11 versalitas · etiquetas de las barras: de la pieza (fuera del piso de 14: son de
gráfico) · matriz 14 (`analisis.css:233`; la maqueta 13) · botones 13,5.

### Color (de /color)
Veredicto: el texto en `--c` sobre su tinte al 9 % — ámbar ≈ el chip ámbar (5.47 sobre ámbar/15) y rojo-profundo ≈ 7.03 (sobre rojo/10): **sin medir** sobre
el vidrio de la hoja en los dos temas → se mide con `medir.js` de `/color` antes del PR. Barras: arena/36 % y la destacada en tinta (la pieza). Matriz: verde y ámbar
al 12 % (los de `.m-tabla`). Rojos en la hoja: **0 de marca** (todo urgente en rojo-profundo).

### Gráfico (de /graficos)
- Pregunta: «¿se está vendiendo?». Forma: barras por tiempo, una serie, 8 semanas (`grafico.barras`, regla 2). Arrancan en cero, 3 px mínimo (`BarrasTiempo` `px()`).
- Alto **96 px** (≥ 80 para leer magnitud, regla 9; la maqueta 64 de barra + 46 de cifras y fechas). Un acento: la semana en curso en tinta (regla 12). Cifra
  sobre cada barra (`cifras="todas"`): el valor está escrito, así la barra arena no necesita 3:1 (regla 16). Sin ejes ni rejilla: las cifras bastan.
- A 375 px, las 8 fechas no caben: la pieza decide; la maqueta oculta las pares (`index.html:404`) — **sin medir** cómo lo hace `BarrasTiempo` a ese ancho.
- La matriz no es un gráfico: es una tabla con palabras («quedan 3»).

### Estados (de /milimetro)
Pieza: `<Modal>` + piezas decididas + `Veredicto` (composición).
| Estado | Qué se ve | Qué se anuncia | Cómo se mide | Nivel · fuente |
|---|---|---|---|---|
| default | hoja Serena, × arriba a la derecha | `role="dialog"` con su título | medir.js · contraste | [Norma] 1.4.3 |
| hover | en sus botones y celdas (`.m-tabla td` con `data-tip`) | — | hover-con-mouse.test | regla del repo |
| focus-visible | el foco entra a la hoja (Radix); anillo único en botones; las celdas de la matriz con su contorno (`analisis.css:253`, **pizarra**: distinto del anillo de tinta → §9) | — | medir.js `{ foco: true }` | [Norma] 2.4.7 |
| active | `.mov-boton` | — | — | — |
| selected | no aplica | — | — | — |
| disabled | ningún botón apagado: el que no corresponde no se dibuja | — | medir.js · apagados | ADR-0161 |
| loading | no aplica: la ficha lee lo ya cargado. «Pedir a Arequipa» abre su hoja, que guarda con `<Boton cargando>` | — | `/chaos` en `PedirAOtraSedeModal` | — |
| error | la prenda ya no está: `<Modal titulo="Esta prenda ya no está en tu tienda" conCerrar>` (hoy, `FichaPrenda.tsx:49–55`) | — | — | — |
| read-only | toda la ficha es lectura | — | — | — |
| vacío | sin ventas: el `<Vacio chico>` en lugar de las barras; sin tabla: solo la frase | — | — | patrón 11 |
| quieto | la hoja llega en su lugar, las barras ya crecidas, sin cascada | — | `data-movimiento="quieto"` | ADR-0625 |

### Movimiento (de /movimiento)
La entrada de la hoja y su cascada (`--t-hoja` 260 ms, 18 ms por pieza, salida 220 ms con `--ease-salida`); las barras crecen **una vez** al abrir (excepción de
Análisis: «barras que crecen»); el resto quieto. Sin bucle. «Atrás» en el teléfono la cierra (ADR-0528, lo trae `<Modal>`). Desde la hoja del tipo, tocar una prenda
abre su ficha **en lugar de** la del tipo (una hoja a la vez), como hace la maqueta (`index.html:801`, `data-ficha`).

### Accesibilidad
4.1.2: la hoja nombra su título; la × es `aria-label="Cerrar"` (la pieza). 1.3.1: la matriz es `<table>` con `scope` (ya). 1.4.1: el veredicto lleva ícono y palabras,
la matriz palabras («se acabó»), no solo color. 2.4.3: Tab recorre veredicto → cifras → celdas → botones. Guía de foco: **no aplica** (no tiene campos, como hoy,
`FichaPrenda.tsx:35`).

---

## 7. Accesibilidad común (criterios WCAG que toca la cara B)

| Criterio | Dónde | Cómo se verifica |
|---|---|---|
| 1.4.3 / 1.4.11 contraste | cifras en su tono, detalle, píldoras, bordes de control | `color/referencia/medir.js` a 1440 claro y oscuro; `lib/vidrio-contraste.test.ts` |
| 1.4.1 uso del color | estado = número + unidad en palabras; veredicto con ícono; puesta con valor y ✕ | medir.js · seleccion |
| 1.4.4 / 1.4.12 texto | nombres que se parten en dos líneas, sin «…» sin `title` | `tipografia/referencia/medir.js` modo `espaciado`; 720 × 450 |
| 2.1.1 teclado | «/», Tab por tarjetas (`tabIndex=0`), Enter/espacio abren, Escape cierra lista y luego hoja | recorrido a mano |
| 2.4.7 / 2.4.11 foco | anillo único; que la cabecera fija no tape la tarjeta enfocada | medir.js `{ foco: true }` (`focoTapado`) |
| 2.5.8 blanco ≥ 24 | botones 40/44; la ✕ de la píldora puesta 22 (pieza) | `espacio/referencia/medir.js`; `pnpm --filter web tacto:medir -- /gestion/analisis` |
| 2.3.3 movimiento | arranca quieto (ADR-0625); `prefiereQuieto()` en la cifra que cuenta | `data-movimiento="quieto"` + `lib/analisis-movimiento.test.ts` |
| 4.1.2 nombre y función | `<article>` sin `role="button"`; listbox multiselección de la pieza | lector de pantalla (VoiceOver) en la tarjeta con botón |
| 4.1.3 estado | «Ves 16 de 18 modelos» `aria-live="polite"` | lector de pantalla al filtrar |

---

## 8. Fuentes

- **[Norma]** WCAG 2.2: 1.3.1, 1.4.1, 1.4.3, 1.4.4, 1.4.11, 1.4.12, 2.1.1, 2.3.3, 2.4.3, 2.4.7, 2.4.11, 2.4.13, 2.5.8, 4.1.2, 4.1.3. WAI-ARIA 1.2 (hijos
  presentacionales de `button`). Media Queries 4 (`hover`). CLDR es-PE (formato de soles).
- **[Evidencia]** Legge y Bigelow 2011 (piso de 14 px); Heer y Robertson 2007 (animar el cambio de datos, no reescalar); Cleveland y McGill 1984 (barra en
  escala común); Perea et al. 2017 (mayúsculas sostenidas más lentas: versalitas de 1–3 palabras).
- **[Práctica]** Material 3 (capas de estado), Carbon (`$support-*`), Primer (≤ 300 ms en la interfaz), NN/g (etiqueta directa; bullet), Axess Lab (no apagar
  botones), Datawrapper (un acento y grises).
- **Regla del repo:** ADR-0357 (Análisis v4 y su excepción de movimiento), ADR-0358 (piezas únicas: `buscador`, `filtro`, `accion.filtrar`, `accion.limpiar`,
  `accion.ver`, `vacio`, `cifra`, `modal`, `titulo-seccion`, `estado`, `grafico.barras`, `grafico.escala`, `hoja-movil`), ADR-0596 y ADR-0623 (vidrio claro, sin
  desenfoque en lo que corre), ADR-0589 (la Vitrina, su sombra solo en Existencias), ADR-0333 (`TilePrenda`/`MosaicoPrenda`), ADR-0128 (clic que sube por React),
  ADR-0161 (botón que el rol no ve no se dibuja), ADR-0625 (quieto de fábrica), ADR-0209 (buscador en listas > 8), ADR-0479 y ADR-0528 (hoja del celular).

---

## 9. Propuestas y choques con el repo (esperan a Felipe)

Donde la maqueta y una regla del repo difieren. **Lo que gana en el código es la columna «Se construye»**; si Felipe quiere lo de la maqueta, va por su camino.

| # | La maqueta | La regla del repo | Se construye | Si Felipe quiere la maqueta |
|---|---|---|---|---|
| 1 | Cifra de 52 px en Hoy, 46 arriba, 44/36 y 20 en el celular, 30 en la tarjeta; serif 500 | rampa cerrada 46·28·27·24·22·21·15·14·13,5·13·12,5·11; EB Garamond 400/600 (`/tipografia` 4 y 9) | 46 (36 bajo 640) · 28 · 24; peso 600 (400 el veredicto) | un tamaño nuevo de la rampa → `/milimetro proponer` |
| 2 | Lectura a 13,5 y 13 px (color y tallas, pie de la tarjeta, rótulos de cifras, matriz) | nada de lectura bajo 14 px (CLAUDE.md fila `texto`, vigilado por `lib/unificar.test.ts`) | 14 (`.texto-detalle`) | — (es una regla con prueba) |
| 3 | `--rojo` en la cifra de «Se acaba», en cada tarjeta urgente, en ≥ 90 días y en «se acabó» de la matriz | máx. 2 rojos de marca por pantalla (`globals.css:155`; `/color` 19) | `rojo-profundo` para texto (`COLOR_ESTADO.urg`), ámbar en la matriz (`.m-tabla`); el rojo de marca solo en el globito de la pestaña | — |
| 4 | «Ver y comprar →» negro, cuatro en Hoy | `accion.ver` = `<BotonVer>` secundario con su flecha; una acción principal por zona | `<BotonVer onClick chico>` | — |
| 5 | En «No se vende», la píldora «Ordenar» de la barra **y** los chips «Ordenar: Más días · Más plata parada · Más prendas» a la vez (`index.html:664`, `916`) | una función, un control (ley 2 de `/formidable`; ADR-0358) | **una sola**: en esa pestaña la píldora «Ordenar por» trae esas tres opciones y los chips se van (decidido al construir, 2026-11-21: una función, un control) | si quiere los chips a la vista, que la píldora no salga en esa pestaña |
| 6 | Hoja de filtros del celular con chips de 44 px (`.hf-chip`) y todo a la vista | la hoja de Productos y Existencias lleva el mismo panel de `DesplegablePildora` | el panel de Productos | familia `filtro` / `hoja-movil` → `/unificar` (cambiaría también Productos y Existencias) |
| 7 | Píldoras de 40 px | `pildora-filtro` 34 px con mouse, 44 con dedo | 34 / 44 | familia `filtro` → `/unificar` |
| 8 | Opción con 0 apagada en la lista | `DesplegablePildora` no tiene `deshabilitada` (`OpcionPildora`, `FiltrosPildora.tsx:135`) | se ve con su 0 y lleva al vacío | sumar `deshabilitada` a la pieza → `/unificar` |
| 9 | «Tipo: Blusas, Polos» / «3 elegidos» | `textoPildoraVarias`: «Blusas, Polos +1» | lo de la pieza | — |
| 10 | `<article role="button">` con `<button>` adentro | 4.1.2; el patrón de la Vitrina (ADR-0128) | `<article tabIndex={0} aria-label>` | — (es una norma) |
| 11 | Huecos 14, rellenos 22/26/18, medio paso 6 y 10 fuera de un control; radios 20 y 16 | escala de 4 (`/espacio` 1–3); `--radius-tarjeta` 22 | 16 · 24 · 12 · 4/8; 22 y la miniatura de la pieza (14) | — |
| 12 | Ficha de 620 px con la miniatura junto al título | `<Modal tamano>` 448 · 576 · 768; el título lo dibuja la hoja | `mediana` 576, miniatura en la primera fila | `ancho` a medida solo con `unificar-fijo` (diseño propio) |
| 13 | Tarjeta sin hover | la familia de vidrio claro que lleva sube 2 px (`pantalla.css:77`) | sube 2 px en `--t-cambio` | quitarlo es posible: no es una regla con prueba |
| 14 | Pestañas «Se acaba» y «Sin salir» | hoy «Se está acabando» y «Nunca salió al piso» (`AnalisisPantalla.tsx:38–44`) | **decidido:** Felipe aprobó la lista de actividades el 2026-11-21 con «Hoy · Se acaba · No se vende · Sin salir · Qué pedir»; cambian la guía y su huella (`/guia`) | — |
| 15 | El buscador pasa de la cabecera a la barra | hoy en `EncabezadoPagina` (`AnalisisPantalla.tsx:246–249`) | en la barra (como la maqueta) | cambia la guía interactiva entera (`/guia`) |
| 16 | — | el contorno de foco de una celda de la matriz es pizarra (`analisis.css:253`), no el anillo único de tinta (ADR-0351) | se deja (es de antes) | pasarlo al anillo único: un renglón, con el OK de Felipe |

**Movimiento sin token** (va a `/movimiento`): la cuenta de 700 ms y su curva cúbica escrita en JavaScript (`AnalisisPantalla.tsx:200`) no usan `--t-*` ni `caylaEase`;
los 250 ms del alza de `.tarjeta-cifra` (`pantalla.css:66`) tampoco. La tarjeta nueva usa `--t-cambio`.

**Una pieza nueva y su ADR:** `Respuesta`, `TarjetaPrenda` y `Veredicto` nacen en `components/analisis/` (Análisis tiene diseño propio por decisión). La cara B
necesita su actualización de ADR-0357 (o un ADR nuevo, con su número reservado con `pnpm reservar adr`) antes del código.

---

## 10. Lo que no se midió y lo que sigue

- **Sin medir en el navegador:** ninguna medida de esta ficha se corrió con `medir.js` (no había servidor del ERP en esta worktree y no se levantó uno). Los altos
  «calculados» (respuesta ≈ 119 px, tarjeta ≈ 170 px), el contraste del veredicto sobre la hoja en los dos temas, el contraste de las cifras sobre el vidrio claro
  en oscuro y cómo `BarrasTiempo` reparte 8 fechas a 375 px se miden al construir, con `/milimetro auditar /gestion/analisis` (1440 claro, 375 claro, 1440 oscuro, quieto).
- **Lo que pasa la posta:** `/formidable` (la pantalla entera en 5 s, con la prueba ciega), `/guia` (la guía de Análisis cambia entera: pestañas, buscador, tarjetas),
  `/sugerir` (el placeholder del buscador, `sugerir-fijo`), `/multi-view-responsive` (1024–1920 y celular). `/focus`: no aplica (no hay campos que llenar; el
  buscador filtra). `/chaos`: la pantalla no guarda; sí las hojas que abre «Mandar» y «Pedir a Arequipa», que ya existen.
- **Construir por actividades** (`/construir`): 1) `TarjetaPrenda` + `Respuesta` en una pestaña («Se acaba») · 2) la barra de filtros con su hoja del celular · 3) las
  demás pestañas · 4) la ficha en tres bloques y la del tipo · 5) guía, huellas y auditoría. Cada una verificable en el navegador.
