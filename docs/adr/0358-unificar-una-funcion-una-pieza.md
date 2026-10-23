# ADR-0358 · Unificar: una función, una pieza

- **Fecha:** 2026-10-06 · **Estado:** skill y motor escritos y probados contra el ERP local. Primera ronda decidida por Felipe el mismo día
  (Volver, Pestañas y Tarjetas de cifra; ver «Decisiones»). Sin migración de base de datos.
- **Pedido:** Felipe, 2026-10-06: una skill o un agente «que vaya módulo por módulo analizando componentes, tablas, etiquetas, iconos, gráficos»,
  para ver si hay «dos botones que tienen la misma función en diferentes pantallas pero con un diseño completamente distinto»; que diga
  **cuántas** variantes hay, las muestre **con capturas**, las **compare** y **elabore un diseño extra**, para elegir con cuál se queda y que
  esa «se use de ahí en adelante para todo el sistema, en todos los módulos, incluso para las vistas nuevas». Nombre: `/unificar`. Pidió además
  la recomendación entre skill y agente.
- **Complementa:** ADR-0169 (paleta y piezas de la guía), ADR-0336 (modo oscuro: solo tokens), ADR-0350 (`/formidable`: se entiende en 5 s),
  ADR-0351 (un solo anillo de foco), ADR-0220 (la cabecera de cada módulo). El eje E de `/revision` busca mecanismos duplicados **en el código**;
  ninguna herramienta medía lo que la persona **ve** repetido con distinta cara. Ese era el hueco.

## Qué había (medido)

Antes de escribir la skill, en el código: `components/ui/` ofrece **cuatro** piezas de pestañas (`Pestanas` en 2 archivos, `TabsSubrayado` en 2,
`SegmentoDeslizante` en 17, `SegmentoEnlaces` en 2) más `pestanas-vidrio` y `fin-pestana` en CSS; **tres** insignias (`Chip` en 121 archivos,
`Insignia` en 1, `badge` en 1); **cuatro** tarjetas de cifra (`TarjetaCifra` en 30, `TarjetaKpiVidrio` en 2, `TarjetaIndicador` y `TarjetaSenal`
en ninguno); 40 archivos con `<table>` propio frente a 27 con `Tabla`; y la pieza `Volver` con dos formas por decisión (ADR-0220).

El primer censo del ERP local (cuenta Admin, 1440 × 900, rama `claude/unificar-componentes-skill-7e9d26` @ `c215dd2f`): **101 de 109 vistas medidas** (77 pantallas y 32
modales y estados de Inventario; las 8 sin cubrir son 4 redirecciones y 4 escenarios que no abrieron) y **30 familias con más de una forma**:

| Familia | Formas distintas | En cuántas pantallas | Nota |
|---|---:|---:|---|
| Botones (estilo) | 123 (46 contando solo esquinas, fondo y borde) | 88 | el sistema define 5; solo 123 de los 591 botones en pantalla usan `btn-cayla` |
| Pestañas y segmentos | 25 | 54 | |
| Tablas | 30 | 36 | |
| Combos | 26 | 39 | |
| Estados vacíos | 23 | 24 | sin pieza del sistema |
| Buscadores | 18 | 49 | |
| Tarjetas de cifra | 17 | 46 | |
| Insignias de estado | 11 | 39 | |
| Títulos de pantalla | 8 | 97 | `EncabezadoPagina` en 56 |
| Botón «Ver» / «Nuevo» / «Volver» | 13 / 12 / 6 | 23 / 27 / 20 | «Volver»: botón secundario con destino (14), versalitas de 11 px, una X, un «Volver» a secas, un botón oscuro |
| La flecha de «siguiente» | 9 dibujos | — | `chevron-right` con trazo 1.5 (119), el glifo «→» (77), `chevron-right` con trazo 2 (16), «›»… |

Una forma distinta no es siempre un problema (la jerarquía de botones tiene 5 a propósito, y el motor cuenta 2 px de diferencia como otra
forma): separar el accidente de la decisión es el paso 2 de la skill.

## Decisión

**Una función, una pieza.** Dos piezas que hacen lo mismo para quien usa el ERP se ven igual en todo el sistema. Cuál es la forma de cada familia
**lo decide Felipe**, mirando las variantes reales lado a lado y una propuesta nueva; desde ese día es la única, también en las pantallas nuevas,
y una prueba del CI lo hace cumplir.

| | |
|---|---|
| **Forma** | **skill** `/unificar` (`.claude/skills/unificar/`) + un **motor** sin IA (`apps/web/unificar/`, Playwright) que mide y captura |
| **Familias** | 22 de estructura (botones por estilo, insignias, contadores, filtros, buscadores, pestañas, paginación, enlaces, cajas de texto, títulos de campo, combos, casillas, tablas, cifras, gráficos, títulos de pantalla y de sección, vacíos, avisos, iconos, hojas, avatares) + 18 de **botones por función** (Volver, Cerrar, Cancelar, Guardar, Limpiar, Nuevo, Editar, Eliminar, Buscar, Filtrar, Exportar, Imprimir, Siguiente, Anterior, Ver, Menú, Copiar, Deshacer). Una sola definición: `apps/web/unificar/familias.mjs` |
| **Cómo se reconoce una función** | por lo que el botón **dice** (texto, `aria-label` o `title`, sin tildes); si no dice nada, por su icono de lucide. «Cerrar caja» no es cerrar una hoja; «Quitar filtros» es limpiar, no eliminar (22 casos en la prueba) |
| **Qué es una variante** | la **huella** de lo que se ve: alto, esquinas, fondo, borde, relleno, letra, icono, con el color traducido al token («tinta», «rojo/35», «≈taupe», o el hex si no es ninguno). El tono de una insignia y el color de un icono no separan variantes (son dato) |
| **Fuera** | el marco (lateral y cabecera), el papel físico (`.papel-fijo`, `[data-papel]`) y el color de una prenda (`[data-color-dato]`, muestras) |
| **Salida** | `reporte.md` (lo lee la skill), `lamina.html` (las variantes A, B, C… con su captura a ×2, usos, pantallas, archivo probable y lo que cambia frente a la A en rojo, con la propuesta dibujada con el CSS real **en claro y oscuro**), `comparativas/<familia>.png` (una imagen por familia, para el chat). Fuera de git; se regenera |
| **Juicio** | el motor encuentra y cuenta; la skill **juzga** qué es la misma función, qué es un accidente (1–2 px) y qué es una decisión (`referencia/criterio.md`) |
| **Elección** | `AskUserQuestion` por familia, con la recomendación primero; nunca la toma la skill |
| **Cumplimiento** | `DECISIONES` en `familias.mjs`: pieza, ADR, registro, **firmas** (expresiones que reconocen la variante a mano) y **deuda**. `lib/unificar.test.ts` falla si un archivo nuevo tiene la firma o si la deuda no baja; `// unificar-fijo: <por qué>` exime una línea. Regla en `CLAUDE.md` con su tabla «Piezas únicas» |
| **Migrar** | `/unificar migrar <familia> [módulo]`, con el OK de Felipe (toca varios módulos), un commit por módulo, **solo presentación** (mismos handlers, textos y permisos), antes/después al mismo ancho y el censo de después con **una** forma |
| **Costo** | el motor es gratis y repetible (todo el ERP más los 32 modales de Inventario: 109 vistas en 10 min); la skill usa hasta 2 agentes (un cartógrafo de archivos, un escéptico) y avisa antes; sin `Workflow` salvo que Felipe lo pida |
| **Respeta** | lo que existe por un ADR (Finanzas ADR-0195, vista rápida ADR-0136, Movimientos ADR-0353, Observatorio ADR-0322, persiana de Caja ADR-0301, cabecera ADR-0220) se presenta como «decidido a propósito»: Felipe dice si se unifica |

**DECIDÍ:** skill + motor. La skill porque el trabajo es una **conversación**: mostrar capturas, recomendar, preguntar y esperar la elección de
Felipe, y después migrar con su OK. Un agente (subagente) corre aislado, no puede preguntarle nada y su informe no le llega a Felipe tal cual; la
skill sí puede lanzar agentes cuando conviene (el cartógrafo, el escéptico). El motor porque contar 40 familias en 77 pantallas y unos 190 escenarios de modales
a mano, con capturas de 800 px del panel, sería lento, caro en tokens e imposible de repetir igual; con Playwright es gratis, nítido (×2) y la
misma medida cada vez.

**DESCARTÉ:**
- *Un agente autónomo que detecta y migra solo:* la elección es de Felipe y migrar toca varios módulos (CLAUDE.md: se confirma).
- *Un catálogo de componentes (Storybook):* muestra lo que el código **ofrece**, no lo que la persona **ve** en cada pantalla; una variante
  dibujada a mano con utilidades sueltas no aparece en un catálogo. Más infraestructura para no responder la pregunta.
- *Una regla de lint por imports:* ve `<TabsSubrayado>` pero no ve un `<div className="rounded-full px-2 …">` que imita una insignia. La huella
  visual sí; y la prueba del CI usa firmas por línea, que sí ven lo dibujado a mano, solo para lo ya decidido.
- *Decidir todas las familias de golpe:* 40 familias a la vez no se deciden bien. De a 3 por ronda, primero lo que confunde en el mostrador.

**SE ROMPE SI:** (1) la huella junta dos funciones distintas porque se ven igual o separa una por 1 px — por eso el juicio es de la skill y el
informe marca `[probable]` y «≈»; (2) una firma es tan amplia que atrapa medio repo — `referencia/decision.md` exige probarla con
`unificar:deuda`; (3) el censo corre contra el servidor de otra worktree y mide otro código — el motor se niega salvo `--otra-obra`; (4) un
escenario o una pantalla cambia la sede (visitar `/global`) y el resto del censo cae en «elige una sede» — el motor restituye la sede de la cuenta
antes de cada visita (pasó en la primera corrida: 39 de 77 pantallas sin cubrir).

## Decisiones (una línea por familia; el detalle en `docs/unificar/<familia>.md`)

- **2026-10-06 · ronda 1, por descripción.** Felipe eligió las tres recomendaciones con `AskUserQuestion` (Volver «un solo botón con flecha»,
  Pestañas «tres piezas, lo elegido en tinta», Cifras «una marca por función») y se migraron unos 100 archivos. **Al verlas aplicadas, no le
  gustaron.** Lección que pasó a la skill (paso 5) y a `CLAUDE.md`: se elige **mirando**, en una página con la captura de cada opción
  (`unificar/elegir.mjs`); una pregunta por texto solo confirma.
- **2026-10-06 · `accion.volver` → la flecha redonda** (`<Volver>`): la de `EncabezadoPagina` que nació en `main` el día anterior (ADR-0220
  act.), única cara en todo el ERP. Deuda 0.
- **2026-10-06 · `pestanas` → F, A y L:** cambiar de sección = el vidrio de Comprobantes con la píldora oscura, en mayúsculas (`<Pestanas>`),
  **también Finanzas y Configuración**; filtrar o elegir período = la píldora rellena; ver de otra forma u ordenar = la caja arena de «GRILLA /
  TABLA». Deuda 0.
- **2026-10-06 · `cifra` → B**, la tarjeta de Compras tal cual (`<TarjetaCifra>`), sin las marcas nuevas de la ronda 1. Deuda 0.
- **2026-10-07 · ronda 2, mirando.** `accion.nuevo` → **B**, versalitas de 11 px y 40 px (`<Boton>` / `<BotonEnlace>` nuevo, con su barrido de
  luz, el encogerse al presionar y el hilo al guardar); 20 archivos migrados ese día; Vender espera la pasada de `terminal-ventas`. `estado` →
  `<Chip>` como ya era, y se quedan a propósito los chips con ícono de Análisis y el rol del líder en negro (sin candado del CI todavía).
- **2026-10-07 · ronda 3, el mostrador (censo con `terminal-ventas`), eligiendo con botones vivos.** El movimiento de un botón pasa a ser
  uno solo, `.mov-boton` (la D: sube con sombra, barrido, se encoge; más el «+» que gira y la flecha que avanza, pedido de Felipe), en
  `<Boton>`, `BotonCompacto` y `FlujoGuiado`; `boton-brillo` desaparece. El «Atrás» de un paso a paso es la flecha de `<Volver>` («volver
  solo es una flecha»): ninguna de las dos caras que había ni la propuesta. La página de elegir suma botones vivos con el CSS del ERP.
- **2026-10-07 · ronda 4, los botones, mirando y tocando.** Dos voces a propósito: la voz la pone el lugar (`data-voz="cabecera"` →
  versalitas; hojas y tarjetas → letra normal), con una pieza (`btn-cayla`, que `<Boton>` dibuja) y una onda que nace donde se toca
  (`<OndaBotones>`, pedido de Felipe: «más animaciones al hacer clic»). Lo peligroso, `btn-peligro` desde el principio. Cerrar una hoja,
  la × de `<Modal conCerrar>`. Migrados 41 + 15 botones y 17 hojas; el mostrador queda como deuda de `boton`, con su pasada a 375 px.
- **2026-10-07 · el movimiento entra al censo** (pedido de Felipe): la huella de lo que se toca o se mueve solo dice qué cambia al pasar el
  mouse, al presionar y con el foco, la transición, lo que late en bucle y lo que entra animado, y el censo lo mide pasándole el mouse. Dos
  piezas iguales en reposo y distintas en movimiento son dos variantes, y migrar no pierde movimiento.
- **2026-10-08 · ronda 5, vacíos, avisos y buscadores, tocándolos** (página de elegir con demos vivas en claro y oscuro, fotos antes/después
  sobre las pantallas reales). `vacio` → `<Vacio>`: el ícono de lo que falta que se dibuja, título serif, frase que dice qué hacer y su
  botón; chico en tablas y hojas; al no encontrar dice qué se buscó y deja deshacerlo ahí. `aviso` → `<Aviso>` con la franja a la izquierda
  (P2, no la recomendada), `nota-cayla` con su «i», y el error de un dato bajo su campo / el de la hoja en el aviso. `buscador` →
  `<Buscador>`: la caja hundida con lupa viva y el mostrador que se despega; Felipe pidió además que «Buscando…» salga solo cuando hace
  falta (espera de más de 350 ms) y que se busque mientras se escribe. Al cerrar, Felipe sumó Finanzas y Análisis, dejó el ícono en vez del colibrí y pidió que todo vacío de búsqueda lo
  deshaga ahí mismo; migrado entero el mismo día, deuda 0. Registros: `docs/unificar/vacio.md`, `aviso.md`, `buscador.md`.
- **2026-10-09 · ronda 5b, la barra apilada, tocándola.** Nació de la deuda que dejó Frescura (ADR-0208, act. 2026-10-07): su rama
  creó `ui/BarraApilada` con la forma de la barra de «Deuda por vencimiento» (Compras). El motor aprendió a ver una barra hecha con cajas
  (antes solo veía SVG) y se partió la familia: `grafico.barra` (la barra que reparte un total) queda decidida y `grafico` (línea, barras
  mensuales, dona) sigue por analizar. Quince archivos la dibujaban a mano con casi diez caras; Felipe eligió **P**: la pista de arena de
  Frescura y Facturación con todo el movimiento de Compras, tres altos (12 · 8 · 4), 24 px para el mouse y una sola voz para el lector.
  Migrada «Deuda por vencimiento»; **deuda 14 archivos**, módulo por módulo con su OK; ese mismo día Felipe pidió migrar las otras y **quedó migrada entera, módulo por módulo (deuda 0)**. Las barras de Análisis (ADR-0357) y la del aviso de cierre de
  Caja (ADR-0359) quedan a propósito hasta que Felipe diga. Registro: `docs/unificar/grafico.barra.md`.
- **2026-10-13 · rondas 6, 7 y 8, tocándolas.** Tres páginas de elegir juntas en un solo archivo, con todo vivo (fuentes en
  `docs/unificar/rondas/6-8/`). Felipe eligió la recomendada en 12 de 13 preguntas y en el enlace suelto la P2:
  **formularios** (ronda 6): la **caja que se enciende** para todo campo y todo combo de una hoja (`campo`, `combo`; hueso de 40 px que sube
  a papel y dibuja el hilo rojo), **una lista para todo combo** (hilo de canto y ✓ que se dibuja), la **píldora que dice su nombre** para el
  filtro que se abre (`filtro`; reemplaza el panel de versalitas sin caja del 2026-09-17), las **versalitas que se encienden** como título de
  campo (`etiqueta-campo`) y la **casilla que se dibuja** con el interruptor en tinta (`casilla`); **leer datos** (ronda 7): `<Tabla>` de
  hoy **con movimiento** (cascada, hilo de canto y «›», fila abierta; lo que Comprobantes ya hacía, para toda tabla) y tres piezas de
  **título** (`<TituloSeccion>` serif de 21 px con su dato, `<TituloGrupo>` versalitas con raya que se dibuja, `<SeparadorDia>` pegado
  arriba); **enlaces, páginas y caras** (ronda 8): `btn-enlace` con **el hilo que se llena**, `<EnlaceVer>` en **versalitas rojas con la
  flecha que avanza** (la P2), `<Paginas>` con **la píldora que se desliza** y `AvatarPersona` en **cuatro tamaños**. Las piezas cambiaron
  por dentro el mismo día (cientos de usos ya las tienen); quedan **deudas** por familia en `familias.mjs`, para migrar módulo por
  módulo (`node apps/web/unificar/deuda.mjs`). Finanzas (ADR-0195) y las pantallas decididas a propósito quedan como están, en las
  `excepciones` de cada decisión. Registros: `docs/unificar/campo-combo.md`, `etiqueta-campo.md`, `casilla.md`, `tabla.md`,
  `titulo-seccion.md`, `enlace.md`, `paginacion.md`, `avatar.md`.

- **2026-10-13 · ronda 9, las seis que dejaron abiertas las rondas 6–8, tocándolas** (fuentes en `docs/unificar/rondas/9/`; lo de hoy
  copiado del DOM real del ERP). Felipe eligió: **una lista de sugerencias para las tres** que sugieren mientras se escribe o se escanea
  (P1: `<ListaSugerencias>`, la lista de todo combo con su fila rica —miniatura de la prenda, título, detalle, dato a la derecha— y la tecla
  «Enter» en la activa; Llegó mercadería y Recibir contra factura flotan, las facturas de la nota de crédito van en línea); **Contar con la
  cara de la tabla del sistema** (P1: cabecera arena, rayado hueso, cascada, la talla recién contada respira en verde; sigue siendo un
  `<table>` por rendimiento, exento con su motivo); **Frescura con píldoras** cuya lista dibuja **apartados con título** (P1:
  `DesplegablePildora` aprende `apartado`); **«Desactivar color» rojo en el pie** como Categorías y Familias (P1; la hoja de Proveedor, que tenía el mismo enlace
  sin ninguna pantalla que lo mostrara, lo perdió: Felipe, «no se desactivan proveedores desde esa hoja»), y una firma nueva de `accion.eliminar` para que desactivar no vuelva a ser un enlace; **el número de un título pegado al
  nombre en el globito de las pestañas** (P2: `cuenta` en `TituloSeccion` y `TituloGrupo`; a la derecha queda solo lo que resume, y una
  firma nueva atrapa un conteo puesto como `dato`); y **las acciones chicas según lo que hacen** (P2: lo que cambia varias cosas de un
  toque —repartir, marcar todas, usar un saldo, cerrar con faltante, reasignar— es `btn-sutil btn-chico`; lo que corrige una sola
  —Cambiar, Editar, Deshacer— sigue `btn-enlace`). Migrado el mismo día: **deuda 4 → 0** en todas las familias. Registros:
  `campo-combo.md`, `tabla.md`, `boton.md`, `titulo-seccion.md`, `enlace.md`.

- **2026-10-13 · ronda 10, tres botones de una sola función, tocándolos** (fuentes en `docs/unificar/rondas/10/`). Felipe eligió las tres P1:
  **bajar un archivo es «Descargar» + qué** (`<BotonDescargar>`: el secundario con el ícono de descarga que baja 2 px y el hilo mientras se
  arma el archivo; nunca «Exportar» ni solo un ícono); **el botón de los filtros es una píldora más** (`<BotonFiltros>` con la cara de
  `.pildora-filtro`, cuántos hay puestos en el globito de los títulos; Existencias deja su cuadrado y en el celular queda el ícono con su
  punto); y **llevar a ver algo en otra pantalla es el botón secundario con la flecha que avanza** (`<BotonVer>`; nunca negro ni con «→»
  escrito; el vacío conserva su paso principal en negro, con su `unificar-fijo`). Migrado el mismo día: **deuda 0** en las tres. De paso,
  la caja del «+» y del ícono dentro de `<Boton>` pasó de `inline-flex` a `flex`: armaba su propia línea de texto y el botón medía hasta
  45 px junto a vecinos de 40. Registros: `accion.exportar.md`, `accion.filtrar.md`, `accion.ver.md`.

- **2026-10-14 · ronda 11, cancelar, limpiar e imprimir, tocándolos** (fuentes en `docs/unificar/rondas/11/`). Felipe eligió: **«Cancelar» a su
  medida, a la derecha y ANTES del botón que guarda** (P1: la clase `pie-acciones` y `<PieAcciones>`; lo que borra va solo a la izquierda; en el
  celular, mitades; el flujo del mostrador conserva sus 48 px; la clase va sin `@layer` para mandar sobre el `flex-1` de los pies de antes);
  **los filtros puestos con la píldora de los vacíos y «Limpiar todo» como una píldora punteada** (P2: `<FiltroPuesto>` y `<BotonLimpiar>`; el
  verbo es «Limpiar» + qué); e **imprimir siempre con la impresora, «Imprimir» + qué, negro solo si imprimir es el paso** (P1: `<BotonImprimir>`;
  la hoja sale de la impresora al pasar el mouse). Migrado el mismo día: 116 pies en 86 archivos (también los «Mejor no»), 8 filtros puestos y
  11 «Limpiar», 24 botones de imprimir; deuda 0 en las tres. Registros: `accion.cancelar.md`, `accion.limpiar.md`, `accion.imprimir.md`.

- **2026-10-14 · los pendientes antes de la ronda 12, mirando las fotos y tocando las demos** (fuentes en `docs/unificar/rondas/pendientes/`).
  Felipe eligió: **la cabecera de Inventario en todas las pantallas menos Finanzas** (P1: `<EncabezadoPagina>`; cierra lo que ADR-0220 dejaba
  «sin decidir» —Compras, Recibir, Producción, el resto de Catálogo— y también Configuración, Rendimiento, Etiquetas de precio, Actividad,
  Inicio, Comercial y Buscar, que usaban la de Finanzas o una a mano; Finanzas conserva `<CabeceraPantalla>`, su spike de ADR-0195); **«Etiquetas»
  lleva la etiqueta** en Productos y en Existencias (P1: la impresora es solo de lo que imprime ya); y **el «Ver» de una fila es el enlace del
  sistema** (P1: los pendientes del turno en Caja). Migrado el mismo día: 31 pantallas en 33 archivos (la frase de la pieza pasó a ser opcional
  y lo que decía el sobretítulo va tras la fecha, en `detalle`), 5 íconos y 1 enlace; deuda 0. Registro nuevo: `titulo-pagina.md`.

- **2026-10-14 · ronda 12, guardar, editar y las hojas, tocándolos** (fuentes en `docs/unificar/rondas/12/`). Felipe eligió P1 en las cinco
  preguntas: **mientras guarda, «Guardando…» y el hilo sin cambiar de ancho** (lo hace la pieza con `cargando`, también `BotonCompacto` y los
  botones del flujo del mostrador; cada acción que no es guardar dice su verbo con `textoCargando`); **«Editar» es el secundario con el
  lápiz y, en una fila o tarjeta de una lista, el lápiz solo** (`<BotonEditar>`, `<LapizEditar>`); y **las hojas tienen una cara** (papel,
  sin sombra, título de 24 px), **tres anchos con nombre** (`tamano`: angosta 448, mediana 576, ancha 768) **y una salida a la vista** (la ×
  si solo se lee, «Cancelar» si guarda, nunca las dos). Migrado el mismo día: 140 botones que esperaban a mano (dos codemods), 22 «Editar»,
  146 anchos y unas 30 salidas; deuda 0 en las tres. La salida no tiene firma (depende de si la hoja guarda). Registros: `accion.guardar.md`,
  `accion.editar.md`, `modal.md`.
- **2026-10-15 · ronda 13, la barra de avance, el anillo, copiar y el menú «Más», tocándolos** (fuentes en `docs/unificar/rondas/13/`). De la
  familia `grafico` salieron dos familias propias, `grafico.avance` y `grafico.anillo` (las líneas y las barras por hora o por día quedan para
  la ronda 14, y los íconos para la 15). Felipe eligió P1 en las cuatro: **una barra de avance con tres altos** (fina 3 · normal 6 · gruesa 12)
  en tinta que pasa a verde al completarse, y el rojo o el ámbar los pone la pantalla (`<BarraAvance>`, que reemplaza también a la homónima
  del detalle de un comprobante); **un anillo en tres tamaños** (chico 40 · mediano 72 · grande 160), el arco de tinta que pasa a verde al
  cerrarse, la cifra adentro (`<Anillo>`); **copiar**: junto a un dato, el ícono solo, y suelto, «Copiar …», los dos con «✓ Copiado» sin
  cambiar de ancho (`<BotonCopiar>`, que además copia por el camino viejo si el navegador no deja); y **el menú**: «Más ▾» con su palabra
  donde cabe y el «⋯» solo de 32 px en una fila de una lista (`<MenuAcciones>`, `<BotonPuntos>`). Migrado el mismo día: unas 40 barras en
  27 archivos, 9 anillos, 12 «copiar» y 3 menús; deuda 0 en las cuatro. Las del Observatorio, Análisis, Finanzas y los pases de Traslados
  quedan por su ADR. Registros: `grafico.avance.md`, `grafico.anillo.md`, `accion.copiar.md`, `accion.menu.md`.
- **2026-10-15 · ronda 14, la línea, las barras por tiempo, la barra a escala y la dona, tocándolas** (fuentes en `docs/unificar/rondas/14/`).
  `grafico` quedó repartida en familias propias: `grafico.linea`, `grafico.barras` y `grafico.escala` se suman a la barra apilada, la de
  avance y el anillo. Felipe eligió P1 en las cuatro: **la línea** de tinta con su área, la referencia en taupe punteado, tres rayas con sus
  montos, la cifra final y una guía con su globito (`<Linea>`; en una fila, `<Sparkline>`); **las barras por tiempo** en arena con la que
  importa en tinta y su cifra, la meta una rayita, el rojo o el ámbar de la pantalla y un globito (`<BarrasTiempo>`); **la barra a escala**,
  la de avance en tinta (la más larga no está «lista»); y **la dona de lo cobrado pasa a la barra apilada**, como «Cómo se pagó» del Historial.
  Lo que estaba bien o mal deja de ir en el color de la línea (la brecha de Caja, el rojo del plan, el verde o ámbar del costo de un
  proveedor): lo dicen el titular y el globito. Migrado el mismo día: 4 líneas, 11 grupos de barras, 5 barras a escala y la dona; deuda 0.
  Se quedan por su decisión «Cómo cerró cada día» de Caja (Felipe, 2026-10-12), las tarjetas de Facturación, Finanzas, Análisis y el
  Observatorio. Registros: `grafico.linea.md`, `grafico.barras.md`, `grafico.escala.md` y la actualización de `grafico.barra.md`.
- **2026-10-15 · ronda 15, los íconos, el globito con número, «Ver más», «Deshacer» y «Buscar», mirando y tocando** (fuentes en
  `docs/unificar/rondas/15/`). Felipe eligió P1 en las cinco: **los íconos** con el grosor de fábrica de lucide (2) y cuatro tamaños según
  el lugar (12 en una insignia, 14 junto a un texto, 16 en un botón o un campo, 20 junto a un título o en una tecla grande); la marca sobre un
  punto lleno lleva 3, como la casilla, y un ícono grande (24 px o más) 1,5, como el de un vacío, las dos con su `unificar-fijo`; **el
  globito** de las pestañas en todas partes (`<Globito>`; `Insignia` pasa a ser un `<Globito pide>`): gris suave, ámbar suave si pide algo,
  lleno con su anillo en la esquina, crema dentro de un botón negro y rojo solo para un error; **«Ver más»**, la franja al pie de la lista de
  Inicio de Almacén con las filas que bajan en su lugar (`<BotonVerMas>` + `<FilasDeMas>`); **«Deshacer»**, el enlace con la flecha curva
  (`<BotonDeshacer>`); y **«Buscar»** al apretar, el secundario con la lupa (`<BotonBuscar>`). Migrado el mismo día: 89 archivos de íconos, 9
  globitos, 4 «Ver más», 7 «Deshacer» y 5 «Buscar»; deuda 0. El marco (lateral y cabecera) dibuja con 1,5 y queda para decidir aparte.
  Registros: `icono.md`, `contador.md`, `accion.siguiente.md`, `accion.deshacer.md` y `accion.buscar.md`.
- **2026-10-15 · ronda 16, el cierre: el marco, las píldoras y los cierres del mes, mirando** (fuentes en `docs/unificar/rondas/16/`).
  Felipe eligió: **el marco se queda en trazo 1,5** (P2: a 20 px su línea se ve como la de un ícono de 16 px con trazo 2; sus tamaños
  sueltos, 18 y 22, pasan a la escala); **las 12 píldoras de color hechas a mano pasan a `<Chip>`** (P1), con lo que `estado` gana su
  candado; y **«Cómo cerró cada día» se queda** (P1, su maqueta del 12) como excepción de las barras por tiempo. Además, dos arreglos de
  herramientas: el escáner de las guías nombra una pieza que se cierra sola por sus datos (`texto`, `href`, `id`, `valor`, `control`…) y no
  por el código que le sigue (92 huellas aceptadas), y el censo ve un `<aside>` dentro de la pantalla (el ticket de Vender). Con esto quedan
  sin decisión solo `grafico` (repartida en sus familias) y `accion.anterior` (nada que decidir).
- **2026-10-22 · la hoja del celular (`hoja-movil`), tocando la maqueta con el dedo.** Felipe eligió **«B · Hoja viva con profundidad»**
  entre «Hoy», «A» y «B» (`docs/maquetas/hojas-movil-2026-10/`): bajo 640 px la hoja de `<Modal>` y de `<Cajon>` llega desde el borde con
  asa, se baja con el dedo y aleja lo de atrás; Filtros a media altura; el cajón se desliza entre registros. Su propio ADR (0479), porque
  cambia el movimiento de todas las hojas del teléfono. Deuda: 3 capas a mano. Registro: `docs/unificar/hoja-movil.md`.

**Número:** este ADR nació como 0354; al traer `main` el 2026-10-06, el 0354 (historial de la prenda), el 0355 (billetera de Traslados) y el 0356
(caos) ya estaban tomados, y pasó a 0357; horas después `main` trajo el 0357 de Análisis v4 y pasó a **0358**. Su fila en
`docs/SESIONES-ACTIVAS.md` lo reserva para que no vuelva a chocar.

## Cómo se verifica

`pnpm --filter web unificar:censo -- --base-url <url> --todas` contra el `next dev` de la worktree; `pnpm --filter web test -- unificar`;
`pnpm --filter web unificar:deuda`. Una decisión simulada («las pestañas son `SegmentoDeslizante`», firma `<TabsSubrayado|<Pestanas`) encontró los 5
archivos que hoy usan las piezas perdedoras y rechazó una pieza inexistente y una firma mal escrita.
