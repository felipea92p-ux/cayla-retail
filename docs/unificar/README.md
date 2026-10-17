# Unificar — una función, una pieza (tablero)

`/unificar` (ADR-0358, `.claude/skills/unificar/`) cuenta cuántas formas distintas tiene cada familia de piezas del ERP —el botón «Cancelar»,
las pestañas, la insignia de estado, la tabla, la tarjeta de cifra…—, se las muestra a Felipe con capturas lado a lado y una propuesta nueva,
y **lo que Felipe elige pasa a ser la única forma de esa función en todo el ERP**, también en las pantallas que todavía no existen.
`lib/unificar.test.ts` lo hace cumplir: un archivo nuevo que vuelve a dibujar a mano una familia decidida falla, y la deuda solo baja.

**Felipe elige mirando** (la página de `unificar/elegir.mjs`), nunca por una descripción. **Antes de dibujar una pieza en una pantalla o un modal, mira la primera tabla.** Si su familia está decidida, se usa esa pieza. Si no, se usa la
forma más usada del último censo (la «A» de la lámina) y no se inventa otra.

## Piezas únicas (lo decidido)

| Familia | La pieza | Decidido | Deuda (archivos por migrar) | Registro |
|---|---|---|---:|---|
| Botón «Volver» (`accion.volver`) | `<Volver>` (`components/ui/Volver.tsx`): la flecha redonda, sola, con «Volver a …» para el lector. **También el «Atrás» de un paso a paso** (ronda 3) | 2026-10-06 (mirando) · 2026-10-07 | 0 | [accion.volver.md](accion.volver.md) |
| Pestañas y segmentos (`pestanas`) | `<Pestanas>` (vidrio con píldora oscura, en mayúsculas; también Finanzas) si cambia de sección · `pildora-cayla` si filtra o elige período · `SegmentoEnlaces` / `SegmentoDeslizante forma="modo"` (caja arena) si cambia el modo u orden | 2026-10-06 (mirando) | 0 | [pestanas.md](pestanas.md) |
| Tarjetas de cifra (`cifra`) | `<TarjetaCifra>`: la de Compras tal cual (flecha si lleva, arena si filtra, punteada sin dato) | 2026-10-06 (mirando) | 0 | [cifra.md](cifra.md) |
| Botón «Nuevo / Registrar» (`accion.nuevo`) | `<Boton>` / `<BotonEnlace>` (`components/ui/campos.tsx`): VERSALITAS de 11 px y 40 px; `primario` la acción, `fantasma` su pareja. Movimiento ÚNICO de todo botón (`.mov-boton`, ronda 3): sube con sombra, barrido de luz, el «+» gira y la flecha avanza, se encoge al presionar, hilo al guardar | 2026-10-07 (mirando y tocando) | 0 | [accion.nuevo.md](accion.nuevo.md) |
| Botones (`boton`) — dos voces | `btn-cayla` / `<Boton>`: versalitas dentro de una cabecera de pantalla (`data-voz="cabecera"`), letra normal en hojas y tarjetas; todo con el movimiento único y la onda al clic | 2026-10-07 (mirando y tocando) | 0 | [boton.md](boton.md) |
| Lo peligroso (`accion.eliminar`) | `btn-peligro`: rojo desde el principio | 2026-10-07 (mirando) | 0 | [boton.md](boton.md) |
| Cerrar una hoja (`accion.cerrar`) | la × sola arriba a la derecha (`<Modal conCerrar>`) | 2026-10-07 (mirando) | 0 | [boton.md](boton.md) |
| Insignias de estado (`estado`) | `<Chip>`, como ya era: con punto si dice un estado, sin punto (`versalitas={false}`) si nombra algo. Se quedan a propósito: los chips con ícono de Análisis y el rol «Líder de equipo» en negro. **Candado desde la ronda 16** (las 12 píldoras a mano, a `<Chip>`) | 2026-10-07 (mirando) · candado 2026-10-15 | 0 | [estado.md](estado.md) |
| Estados vacíos (`vacio`) | `<Vacio>` (`components/ui/Vacio.tsx`): el ícono de lo que falta que se dibuja, título serif, frase que dice qué hacer y el botón; `tamano="chico"` en tablas, hojas y listas; al no encontrar, nombra lo buscado y deja quitar los filtros ahí | 2026-10-08 (tocando) | 0 | [vacio.md](vacio.md) |
| Avisos y notas (`aviso`) | `<Aviso tono>` (`components/ui/Aviso.tsx`): la franja a la izquierda con el ícono que se dibuja (el error destella una vez); `nota-cayla` con su «i»; el error de un dato bajo su campo y el de la hoja en `<Aviso tono="error">` | 2026-10-08 (tocando) | 0 | [aviso.md](aviso.md) |
| Buscadores (`buscador`) | `<Buscador>` (`components/ui/Buscador.tsx`): la caja hundida con lupa viva, «/», «×», «Buscando…» solo si la espera tarda, y el conteo; `tamano="mostrador"`, la píldora que se despega; busca mientras se escribe | 2026-10-08 (escribiendo en ellos) | 0 | [buscador.md](buscador.md) |
| Barra apilada (`grafico.barra`) | `<BarraApilada>` (`components/ui/BarraApilada.tsx`): la píldora con pista de arena, el movimiento de Compras (entra tramo a tramo, se reacomoda, el tramo apuntado se estira y los demás bajan), tres altos (12 · 8 · 4 px), 24 px para el mouse y, si responde, cada tramo es un botón con su nombre | 2026-10-09 (tocando) | 0 | [grafico.barra.md](grafico.barra.md) |
| Campos y combos (`campo`, `combo`) | La caja que se enciende (`caja-cayla caja-campo`): `CampoTexto`, `CampoMonto`, `CampoFecha`, `Desplegable`, `ComboBuscable`, `ComboResponsable`; la lista de todo combo con hilo de canto y ✓; lo que sugiere mientras se escribe o se escanea, `<ListaSugerencias>` (ronda 9) | 2026-10-13 (tocando) | 0 · 0 | [campo-combo.md](campo-combo.md) |
| Filtro que se abre (`filtro`) | `<DesplegablePildora>`: la píldora con su nombre; puesta, rellena de tinta con su ✕; con `apartado`, sus opciones en grupos con título (ronda 9) | 2026-10-13 (tocando) | 0 | [campo-combo.md](campo-combo.md) |
| Título de campo (`etiqueta-campo`) | La de `<Campo>`: versalitas que se oscurecen con su caja | 2026-10-13 (tocando) | 0 | [etiqueta-campo.md](etiqueta-campo.md) |
| Casillas (`casilla`) | `<Casilla>` (el ✓ se dibuja) e `<Interruptor>` (en tinta) | 2026-10-13 (tocando) | 0 | [casilla.md](casilla.md) |
| Tablas (`tabla`) | `<Tabla>` con movimiento: cascada, hilo de canto y «›», fila abierta, recién guardada; la planilla de Contar con su cara (ronda 9) | 2026-10-13 (tocando) | 0 | [tabla.md](tabla.md) |
| Títulos de sección (`titulo-seccion`) | `<TituloSeccion>`, `<TituloGrupo>`, `<SeparadorDia>`; cuántos hay, en el globito pegado al nombre (`cuenta`, ronda 9) | 2026-10-13 (tocando) | 0 | [titulo-seccion.md](titulo-seccion.md) |
| Enlaces (`enlace`) | `btn-enlace` con el hilo que se llena; `<EnlaceVer>` en versalitas rojas con la flecha que avanza | 2026-10-13 (tocando) | 0 | [enlace.md](enlace.md) |
| Paginación (`paginacion`) | `<Paginas>`: la píldora que se desliza | 2026-10-13 (tocando) | 0 | [paginacion.md](paginacion.md) |
| Avatares (`avatar`) | `<AvatarPersona>` en cuatro tamaños y `<PilaPersonas>` | 2026-10-13 (tocando) | 0 | [avatar.md](avatar.md) |
| Descargar un archivo (`accion.exportar`) | `<BotonDescargar>` (`components/ui/BotonDescargar.tsx`): «Descargar» + qué, nunca «Exportar» ni solo un ícono; el secundario con el ícono de descarga que baja 2 px y el hilo mientras se arma el archivo (ronda 10) | 2026-10-13 (tocando) | 0 | [accion.exportar.md](accion.exportar.md) |
| Abrir los filtros (`accion.filtrar`) | `<BotonFiltros>` (`components/ui/FiltrosPildora.tsx`): una píldora más, con cuántos hay puestos en el globito; en el celular, solo el ícono con su punto (ronda 10) | 2026-10-13 (tocando) | 0 | [accion.filtrar.md](accion.filtrar.md) |
| Ver en otra pantalla (`accion.ver`) | `<BotonVer>` (`components/ui/BotonDescargar.tsx`): el secundario con la flecha que avanza, nunca negro ni con «→» escrito; en una frase, el enlace; junto a un resumen, `<EnlaceVer>` (ronda 10); al lado de una fila de una lista (los pendientes de Caja), el enlace del sistema (pendientes, 2026-10-14) | 2026-10-13 · 2026-10-14 (tocando) | 0 | [accion.ver.md](accion.ver.md) |
| Cancelar y el pie de una hoja (`accion.cancelar`) | `pie-acciones` / `<PieAcciones izquierda>` (`components/ui/PieAcciones.tsx`): «Cancelar» es el secundario a su medida, ANTES del botón que guarda, los dos a la derecha; lo que borra, a la izquierda; en el celular, mitades (ronda 11) | 2026-10-14 (tocando) | 0 | [accion.cancelar.md](accion.cancelar.md) |
| Limpiar los filtros (`accion.limpiar`) | `<FiltroPuesto>` (la píldora de los vacíos) y `<BotonLimpiar>` (la píldora punteada con el embudo tachado), `components/ui/FiltrosPuestos.tsx`; «Limpiar» + qué; en la hoja del celular, el secundario; en el calendario y «Pagar juntos», el enlace (ronda 11) | 2026-10-14 (tocando) | 0 | [accion.limpiar.md](accion.limpiar.md) |
| Imprimir (`accion.imprimir`) | `<BotonImprimir>` (`components/ui/BotonImprimir.tsx`): la impresora a la izquierda y «Imprimir» + qué; negro solo si imprimir ES el paso; la hoja sale de la impresora al pasar el mouse (ronda 11). La impresora es solo de lo que imprime ya: «Etiquetas», que lleva a su pantalla, lleva la etiqueta (pendientes) | 2026-10-14 (tocando) | 0 | [accion.imprimir.md](accion.imprimir.md) |
| La cabecera de una pantalla (`titulo-pagina`) | `<EncabezadoPagina>` (`components/ui/EncabezadoPagina.tsx`), la de Inventario, en todas las pantallas menos Finanzas: sede y fecha con su hilo, el nombre del menú en 46 px, la frase y los botones a la derecha; la vuelta, la flecha junto a la sede; de dónde se llegó, tras la fecha (`detalle`). Finanzas conserva `<CabeceraPantalla>` (ADR-0195) | 2026-10-14 (mirando) | 0 | [titulo-pagina.md](titulo-pagina.md) |
| Mientras guarda (`accion.guardar`) | `<Boton cargando textoCargando>` (y `BotonCompacto`, los del flujo del mostrador): «Guardando…» (u otro verbo) y el hilo, sin cambiar de ancho; el botón se apaga (ronda 12) | 2026-10-14 (tocando) | 0 | [accion.guardar.md](accion.guardar.md) |
| Editar algo (`accion.editar`) | `<BotonEditar>` (el secundario con el lápiz, nunca negro) y, en una fila o una tarjeta de una lista, `<LapizEditar>` (el lápiz solo de 32 px); en una frase, el enlace (ronda 12) | 2026-10-14 (tocando) | 0 | [accion.editar.md](accion.editar.md) |
| Las hojas (`modal`) | `<Modal>`: una cara (papel, sin sombra, título de 24 px), tres anchos con nombre (`tamano`: angosta, mediana, ancha) y una salida a la vista (la × si solo se lee, «Cancelar» si guarda) (ronda 12) | 2026-10-14 (tocando) | 0 | [modal.md](modal.md) |
| La barra de avance (`grafico.avance`) | `<BarraAvance>` (`components/ui/BarraAvance.tsx`): tres altos (fina 3 · normal 6 · gruesa 12), la pista en arena y el relleno en tinta que pasa a verde al completarse; el rojo o el ámbar los pone la pantalla; la rayita de «tocaba» opcional; se llena al verse (ronda 13) | 2026-10-15 (tocando) | 0 | [grafico.avance.md](grafico.avance.md) |
| El anillo (`grafico.anillo`) | `<Anillo>` (`components/ui/Anillo.tsx`): tres tamaños (chico 40 · mediano 72 · grande 160), pista en hueso y arco de tinta que pasa a verde al cerrarse, la cifra adentro; se cierra al verse (ronda 13) | 2026-10-15 (tocando) | 0 | [grafico.anillo.md](grafico.anillo.md) |
| Copiar (`accion.copiar`) | `<BotonCopiar>` (`components/ui/BotonCopiar.tsx`): junto a un dato, el ícono solo de 32 px; suelto, el secundario «Copiar …»; los dos dicen «✓ Copiado» sin cambiar de ancho y avisan si no se pudo (ronda 13) | 2026-10-15 (tocando) | 0 | [accion.copiar.md](accion.copiar.md) |
| El menú «Más» (`accion.menu`) | `<MenuAcciones texto="Más">` donde cabe la palabra (cabecera, tarjeta, barra); en una fila de una lista, el «⋯» solo de 32 px (`<MenuAcciones>` sin `texto`, o `<BotonPuntos>` si abre una hoja) (ronda 13) | 2026-10-15 (tocando) | 0 | [accion.menu.md](accion.menu.md) |
| La línea (`grafico.linea`) | `<Linea>` (`components/ui/Linea.tsx`): lo de hoy en tinta con su área, la referencia en taupe punteado, tres rayas con sus montos, la cifra final en serif y una guía con su globito al pasar el mouse; en una fila, `<Sparkline>` (ronda 14) | 2026-10-15 (tocando) | 0 | [grafico.linea.md](grafico.linea.md) |
| Las barras por tiempo (`grafico.barras`) | `<BarrasTiempo>` (`components/ui/BarrasTiempo.tsx`): todas en arena, la que importa en tinta con su cifra, la meta una rayita, el rojo o el ámbar de la pantalla, negativas hacia abajo, un globito al pasar el mouse; crecen en cascada (ronda 14) | 2026-10-15 (tocando) | 0 | [grafico.barras.md](grafico.barras.md) |
| La barra a escala (`grafico.escala`) | La barra de avance en tinta (`<BarraAvance tono="tinta">`): la más larga no está «lista»; con dos partes, la barra apilada medida contra la mayor (ronda 14) | 2026-10-15 (tocando) | 0 | [grafico.escala.md](grafico.escala.md) |
| Los íconos (`icono`) | lucide con su grosor de fábrica (2, sin `strokeWidth`) y cuatro tamaños según el lugar: 12 en una insignia, 14 junto a un texto, 16 en un botón o un campo, 20 junto a un título o en una tecla grande (`lib/iconos.ts`); la marca sobre un punto lleno, 3; un ícono grande, 1,5 (ronda 15). El marco se queda en 1,5, con sus tamaños en la escala (ronda 16) | 2026-10-15 (mirando) | 0 | [icono.md](icono.md) |
| El globito con número (`contador`) | `<Globito>` (`components/ui/Globito.tsx`): el de las pestañas en todas partes (gris suave; ámbar suave si pide algo); en la esquina, lleno con su anillo; dentro de un botón negro, crema suave; rojo solo si dice un error (ronda 15) | 2026-10-15 (tocando) | 0 | [contador.md](contador.md) |
| «Ver más / Ver menos» (`accion.siguiente`) | `<BotonVerMas>` + `<FilasDeMas>` (`components/ui/VerMas.tsx`): la franja al pie de la lista con la flecha que gira y las filas que bajan en su lugar; en una lista suelta, el enlace (ronda 15) | 2026-10-15 (tocando) | 0 | [accion.siguiente.md](accion.siguiente.md) |
| «Deshacer» (`accion.deshacer`) | `<BotonDeshacer>` (`components/ui/BotonDeshacer.tsx`): el enlace con la flecha curva delante (ronda 15) | 2026-10-15 (tocando) | 0 | [accion.deshacer.md](accion.deshacer.md) |
| «Buscar» al apretar (`accion.buscar`) | `<BotonBuscar>` (`components/ui/BotonBuscar.tsx`): el secundario con la lupa; primario solo si buscar es el paso (ronda 15) | 2026-10-15 (tocando) | 0 | [accion.buscar.md](accion.buscar.md) |
| Anterior y siguiente (`accion.anterior`) | `<Volver onClick>` + «Siguiente» primario con su flecha, como todo paso a paso (ronda 17) | 2026-10-17 (mirando) | 0 | [accion.anterior.md](accion.anterior.md) |

## Propuestas esperando decisión

Ninguna. **La ronda 12** (guardar, editar y las hojas: su cara, su ancho y su salida; fuentes en [rondas/12](rondas/12/README.md)) la eligió
Felipe tocando las demos el 2026-10-14 —las cinco P1— y se migró el mismo día: deuda 0.

**Los pendientes antes de la ronda 12** (la cabecera de las pantallas que no la tenían, el ícono de «Etiquetas» y el «Ver» de los
pendientes de Caja; fuentes en [rondas/pendientes](rondas/pendientes/README.md)) los eligió Felipe el 2026-10-14 —P1, P1 y P1— y se
migraron el mismo día: 31 pantallas, deuda 0.

**La ronda 11** (cancelar, limpiar e imprimir; fuentes en [rondas/11](rondas/11/README.md)) la eligió Felipe tocando las demos
el 2026-10-14 —P1, P2 y P1— y se migró el mismo día: deuda 0.

**La ronda 10** (descargar, filtros y ver en otra pantalla; fuentes en [rondas/10](rondas/10/README.md)) la eligió Felipe tocando las demos
el 2026-10-13, las tres **P1**, y se migró el mismo día: deuda 0.

**La migración de las rondas 6–8 (2026-10-13)** bajó la deuda de 258 archivos a 4 en un día, sin cambiar qué hace ningún botón, y dejó seis
preguntas que no se podían decidir por regla. **La ronda 9 (el mismo día, tocando las demos) las cerró y la deuda quedó en 0 en todas las
familias:**

1. La lista que sugiere al escanear o buscar (Llegó mercadería, Recibir contra factura, Registrar nota de crédito): **P1, una para las tres**,
   `<ListaSugerencias>` ([campo-combo.md](campo-combo.md)).
2. La planilla de Contar: **P1, con la cara de la tabla del sistema** y la talla recién contada que respira en verde ([tabla.md](tabla.md)).
3. Los filtros de Frescura: **P1, píldoras** cuya lista dibuja apartados con título ([campo-combo.md](campo-combo.md)).
4. «Desactivar color»: **P1, rojo en el pie** como Categorías; la hoja de Proveedor pierde su «Desactivar» (no se desactiva desde ahí) ([boton.md](boton.md)).
5. El número de un título: **P2, pegado al nombre en el globito** de las pestañas ([titulo-seccion.md](titulo-seccion.md)).
6. Las acciones chicas: **P2, según lo que hacen**: las que cambian varias cosas, botón sutil chico; las que corrigen una, enlace
   ([boton.md](boton.md)).

## Por analizar (las próximas rondas)

El motor (`apps/web/unificar/familias.mjs`) reconoce **46 familias**: 39 decididas y 7 por analizar (el 2026-10-15, tras la ronda 14; `grafico` quedó repartida en seis familias propias). Las cifras son del censo del 2026-10-06 **sin
depurar**: en la ronda 1 la depuración las bajó mucho (pestañas, de 25 formas a 18 reales; cifras, de 17 a 7), así que sirven para ordenar,
no como veredicto. El orden es la recomendación de Claude: primero lo que la colaboradora lee o toca en más pantallas.

**Antes de la próxima ronda, un censo nuevo.** El de la tabla es de antes de la ronda 1, solo con la cuenta Admin y con foco en Inventario, y
`main` cambió mucho desde entonces (Análisis v4, la billetera de Traslados). Desde `apps/web`, con el servidor de esa worktree:
`pnpm unificar:censo -- --base-url <url> --todas --escenarios`, y una pasada con `--cuenta terminal-ventas` para el mostrador.
Cada ronda se pide con `/unificar familia=<id>` (o `/unificar familia=estado,accion.nuevo` para dos a la vez) y termina con Felipe eligiendo
en la página de elegir, nunca por una descripción.

| # | Familia | Qué es | Formas (sin depurar) · pantallas | Por qué en este orden |
|---:|---|---|---|---|
| ~~1~~ | ~~`estado`~~ | Decidida el 2026-10-07 | | |
| ~~2~~ | ~~`boton`~~ | Decidida el 2026-10-07 (ronda 4): dos voces, peligro en rojo, cerrar con la ×; migrada entera, mostrador incluido | | |
| ~~3~~ | ~~`vacio`~~ | Decidida el 2026-10-08 (ronda 5): `<Vacio>` | | |
| ~~4~~ | ~~`aviso`~~ | Decidida el 2026-10-08 (ronda 5): `<Aviso>` en franja, la «i» de la nota, el error en su lugar | | |
| ~~5~~ | ~~`buscador`~~ | Decidida el 2026-10-08 (ronda 5): `<Buscador>` | | |
| 6 | `combo` | Desplegables | 42 sin depurar → **7 reales** (las 23 píldoras de filtro son una sola pieza) | **Decidida el 2026-10-13 (ronda 6)** |
| 7 | `tabla` | Tablas | 39 sin depurar → **4 reales** + `fin-tabla` | **Decidida el 2026-10-13 (ronda 7)** |
| 8 | `campo` + `etiqueta-campo` | Cajas de texto y sus títulos | 8 / 5 (censo parcial del 2026-10-12) + el código: 5 caras de campo en una misma hoja | **Decidida el 2026-10-13 (ronda 6)**: campo y combo en UNA pregunta |
| 9 | `titulo-seccion` | El título de cada bloque dentro de una pantalla | 46 sin depurar → serif en 8 tamaños, versalitas en 6, sans en 5, y 4 separadores de día | **Decidida el 2026-10-13 (ronda 7)**: bloque, grupo y separador de día |
| 10 | `accion.ver`, `accion.filtrar`, `accion.exportar` | Ver en otra pantalla, abrir los filtros, descargar un archivo | censo del 2026-10-13: 16 / 5 / 4 (depurado: 4 pesos de «ver», 2 caras de filtros, 4 caras y dos verbos de descargar) | **Decidida y migrada el 2026-10-13 (ronda 10, las tres P1)** (`accion.eliminar` ya estaba decidida, ronda 4) |
| 11 | ~~`casilla`~~ (decidida, ronda 6), ~~`enlace`~~, ~~`paginacion`~~, ~~`avatar`~~ (decididas, ronda 8), ~~`modal`~~ (decidida, ronda 12), `grafico` (la barra de avance y el anillo, decididos en la ronda 13) | Casillas e interruptores, enlaces de texto, hojas, gráficos, paginación, avatares | 6 / 9 / 5 / 5 / 2 / 2 | Pocas formas: rondas cortas. **La barra de avance (`grafico.avance`) y el anillo (`grafico.anillo`): decididos y migrados el 2026-10-15 (ronda 13).** **La línea, las barras por tiempo y la barra a escala, y la dona de lo cobrado (a la barra apilada): decididas y migradas el 2026-10-15 (ronda 14).** De los gráficos no queda nada por decidir. **De los gráficos, la barra apilada ya está decidida (`grafico.barra`, 2026-10-09)**; faltan la línea (Caja), las barras mensuales (Rendimiento) y la dona (mapa del Inicio). Los de Análisis tienen su excepción de movimiento (ADR-0357) |
| 12 | `accion.cerrar`, `accion.cancelar`, `accion.guardar`, `accion.limpiar`, `accion.editar`, `accion.buscar`, `accion.imprimir`, `accion.menu`, `accion.copiar` | Los botones de una sola función | 1–2 cada una | Casi todas tienen ya una sola forma: se pueden cerrar juntas en una ronda. **`accion.cancelar`, `accion.limpiar` y `accion.imprimir`: decididas y migradas el 2026-10-14 (ronda 11); `accion.guardar` y `accion.editar`, el mismo día (ronda 12).** `accion.menu` y `accion.copiar`, el 2026-10-15 (ronda 13). `accion.buscar` y `accion.deshacer`, el 2026-10-15 (ronda 15): el secundario con la lupa y el enlace con la flecha curva |
| ~~13~~ | ~~`icono`~~ | Iconos (tamaño y trazo) | 922 íconos en 320 archivos, 25 tamaños y 15 grosores | **Decidida y migrada el 2026-10-15 (ronda 15, P1)**: el grosor de fábrica y cuatro tamaños según el lugar. El marco queda para decidir aparte |
| ~~—~~ | ~~`titulo-pagina`~~ | La cabecera de cada pantalla | 8 · 97 | **Decidida y migrada el 2026-10-14 (pendientes, P1)**: la de Inventario en todas menos Finanzas |

Las otras cinco no salían en el censo del 2026-10-06: `filtro` quedó decidida en la ronda 9; `contador` (el globito con número),
`accion.siguiente` («Ver más»), `accion.deshacer` y `accion.buscar` se decidieron y migraron en la ronda 15 (2026-10-15); `accion.anterior`
se decidió en la ronda 17 (2026-10-17): la guía de impresión se había escapado con sus flechas escritas.

## Censos

| Fecha | Rama | Vistas medidas | Familias con más de una forma | Lo que más confunde |
|---|---|---:|---:|---|
| 2026-10-06 | `claude/unificar-componentes-skill-7e9d26` @ `c215dd2f`, cuenta Admin, foco Inventario | 101 de 109 | 30 | 25 formas de pestañas en 54 pantallas; 6 de «Volver»; solo 123 de 591 botones usan `btn-cayla` (detalle: ADR-0358) |
| 2026-10-07 | `claude/unificar-pendiente-7f0794` @ `83aea687`, cuenta `terminal-ventas` (el mostrador), con escenarios | 60 de 122 (las demás: sin acceso) | 26 | tres movimientos de botón principal; dos caras del «Atrás» de un paso; las tallas de Vender salían como «Nuevo» (motor corregido) |
| 2026-10-07 | `claude/unificar-pendiente-7f0794` @ `0807770f`, cuenta Admin, todo el ERP con escenarios | 240 de 247 | 33 | 180 estilos de botón en 219 pantallas; el botón «Nuevo / Registrar» con 2 caras reales (`btn-cayla` y versalitas). Falta la pasada de `terminal-ventas` |
| 2026-10-07 (noche) | `claude/unificar-next-round-bdaaa0` @ `f05530ca`, cuenta Admin, todo el ERP con escenarios, familias `vacio,aviso,buscador` | 242 de 250 | 3 | sin depurar: 23 buscadores, 29 vacíos, 23 avisos. Depurado con el código: 9 formas de vacío (~100 lugares), 6 recuadros de aviso + ~68 párrafos rojos sueltos, 8 buscadores. El motor confunde filas de lista con vacíos (el seed casi no deja listas vacías): las fotos de hoy se sacaron forzando «zzzz» en cada pantalla |
| 2026-10-07 (noche) | `claude/unificar-next-round-bdaaa0` @ `1b5ac53a`, cuenta `terminal-ventas` (el mostrador), con escenarios, familias `vacio,aviso,buscador` | 60 de 122 (las demás: sin acceso) | 3 | 6 buscadores en 24 pantallas (Facturación, Historial, Cambios/Devoluciones, Clientes, Proforma), 8 avisos (el de Facturación «más de 1 hora sin llegar a SUNAT», Caja, Sin conexión) y 5 vacíos |
| 2026-10-07 (noche) | `claude/unificar-next-round-bdaaa0` @ `63b64ba7`, cuenta Admin, todo el ERP con escenarios, familias `combo,tabla,titulo-seccion` (adelanto de la ronda 6, sin depurar) | 243 de 250 | 3 | 42 formas de combo en 118 pantallas, 39 de tabla en 70, 46 de título de sección en 151. Falta depurar y la pasada del mostrador; queda en `apps/web/unificar/.salida/r6-admin/` (fuera de git) |
| 2026-10-09 | `claude/keen-feistel-35a4cb` @ `ef8e017e`, cuentas Admin y Admin-Taller, todo el ERP con los escenarios de Compras, familia `grafico` (el motor aprendió a ver una barra apilada hecha con cajas: antes solo veía SVG) | 180 de 188 | 1 | 10 formas de gráfico en el censo; la barra apilada son 4 huellas (dos de ellas, la misma barra vista tras un modal). Quince archivos la dibujan a mano: Notas de crédito, Proformas, Producción, Caja, el cierre y Eficiencia no salen con el seed y se contaron leyendo el código (Facturación e Historial sí salen). Frescura (otra rama) se midió aparte contra su worktree (`--otra-obra`). Después de migrar «Deuda por vencimiento», el censo la muestra con la huella de P; «Deuda por proveedor» sigue a mano |
| 2026-10-12 | `claude/unificar-componentes-animaciones-f811a1` @ `6bffcd43c`, cuenta Admin, todo el ERP con escenarios, familias `combo,tabla,titulo-seccion,campo,etiqueta-campo,casilla` (rondas 6 y 7) | **47 de 274** (incompleto) | 6 | **Se cortó a la mitad:** el disco se llenó, Docker se apagó solo (`no space left on device`) y la base local cayó; desde ahí todas las rutas mandaban al login. Las rondas 6 y 7 se armaron con este censo parcial (campo, etiqueta-campo, casilla) y con el completo del 2026-10-07 (combo, tabla, titulo-seccion). La pasada de `terminal-ventas` no alcanzó a correr (la cuenta no existía en la base local y `tema:cuentas` necesita Docker) |
| 2026-10-13 | `claude/mystifying-jang-ef15d0` @ `3b4b888ef`, cuenta Admin, todo el ERP con escenarios (el censo de después de las rondas 6–9) | 252 de 277 | 41 familias medidas | Sin depurar, cifras altas (combo 36, tabla 39, títulos 41): son la misma pieza en otro tamaño, Finanzas y las excepciones. **Rastreado al código** (el texto de cada variante con `grep`): 10 títulos que la firma no veía (un `\b` tras `]`), 4 «Ver … →» en versalitas, 2 casillas a mano, 5 «+ Agregar» y la caja «Producto» de Nueva compra encogida a 78 px; todo migrado o arreglado ese día. Base de la ronda 10 |
| 2026-10-13 | `claude/mystifying-jang-ef15d0` @ `ec9b81fa5`, cuenta `terminal-ventas` (el mostrador), todo el ERP con escenarios | 61 de 133 (las demás: sin acceso) | 32 familias medidas | **Rastreado al código:** las seis formas de «vacío» de Caja eran frases grises sueltas, y en todo el ERP había 49 en 40 archivos que la firma no veía (estaba atada a clases exactas). Migradas a `<Vacio>` con una firma nueva, y 3 «Ver … →» de Caja a `<EnlaceVer>` |
| 2026-10-14 | `claude/mystifying-jang-ef15d0` @ `6b1d1e24e`, cuentas Admin y `terminal-ventas`, todo el ERP con escenarios, familias `accion.cancelar,accion.limpiar,accion.imprimir` | 253 de 280 · 61 de 133 | 3 | Cancelar: 3 formas (secundario 21, el flujo del mostrador 2, versalitas 1) y dos maneras de repartirse el pie; Limpiar: 3 (versalitas, dos enlaces); Imprimir: 4. Base de la ronda 11 |
| 2026-10-14/15 | `claude/unificar-ronda-13` @ `6446cc9f3`, cuentas Admin y `terminal-ventas`, con escenarios, familias `grafico,accion.buscar,accion.menu,accion.copiar` en los 11 módulos donde viven (el primero, con todo el ERP y los íconos, se cortó porque la caché de Turbopack llegó a 19 GB) | 172 de 201 · 44 de 51 | 2 | El motor solo ve bien los gráficos SVG grandes: las barras de avance y los anillos chicos salieron de un mapa del código (unos 120 gráficos en cuatro tipos). Buscar: una sola forma; menú: 2 en lo que se vio (4 en el código); copiar: 1 en lo que se vio (9 en el código). Base de la ronda 13 |
| 2026-10-15 | `claude/unificar-ronda-15`, cuenta Admin, un medidor rápido sin fotos (`rondas/15/medir.mjs`) más el código (el censo completo se cortó: el servidor se cayó a mitad) | 95 de 321 | 5 | 922 íconos en 320 archivos con 25 tamaños y 15 grosores; 6 caras del globito con número; 5 de «Ver más»; 3 de «Deshacer»; «Buscar» sin ícono. El censo no ve el panel del ticket de Vender (es un `<aside>` y el motor lo toma por el lateral) |

## Cómo se agrega una fila

- **Piezas únicas:** al registrar una decisión (`.claude/skills/unificar/referencia/decision.md`): la familia, la pieza, la fecha, cuántos
  archivos quedan en la deuda (`pnpm --filter web unificar:deuda <familia>`) y el enlace a `docs/unificar/<familia>.md`. Cuando un módulo se
  migra, baja el número. La misma fila va a la tabla «Piezas únicas» de `CLAUDE.md`.
- **Propuestas:** al dibujar una (`propuestas/<familia>.html`); sale de esta tabla cuando Felipe decide (gane o no).
- **Censos:** una fila por censo de `todo` o de un módulo: lo medido, no lo opinado.

## Qué hay en esta carpeta

| | |
|---|---|
| `README.md` | este tablero |
| `CONTINUAR.md` | cómo seguir desde otra sesión: lo que falta, cómo se trabaja y lo aprendido (se actualiza al cerrar cada ronda) |
| `<familia>.md` | el registro de una decisión: qué se comparó, qué se eligió y por qué, la deuda por módulo |
| `capturas/<familia>.png` | la comparativa con la que Felipe decidió (la evidencia, chica) |
| `propuestas/<familia>.html` | el diseño extra de `/unificar`: un fragmento que la lámina dibuja con el CSS real, en claro y oscuro |

El censo, las capturas sueltas y la lámina se regeneran y viven fuera de git, en `apps/web/unificar/.salida/`.
