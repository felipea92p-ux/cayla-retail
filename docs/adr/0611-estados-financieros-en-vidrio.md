# ADR-0611 · Estados financieros en vidrio: una cifra, una frase y un gráfico sobre hilos

- **Fecha:** 2026-11-05 · **Estado:** aceptado y construido, en la rama `claude/estados-financieros-vidrio` (9 actividades que Felipe aprobó). La migración `20261105230000` se pegó en producción el 2026-11-05 con su OK; la pantalla llega a las tiendas al fusionar el PR.
- **Decide:** Felipe, mirando dos rondas de referencias y la maqueta `docs/maquetas/finanzas-eeff-vidrio-2026-11/`.
- **Toca:** ADR-0585 (Estados financieros, que este rediseño reemplaza en su forma, no en sus datos ni permisos), ADR-0596 (vidrio «Serena»), ADR-0169
  (paleta), ADR-0136 (movimiento), ADR-0493 (El telar) y ADR-0358 (una función, una pieza).

## El problema

Felipe: el submódulo es de los más importantes y «no dice mucho» en sus vistas. Hoy hay siete vistas en una barra y cada estado carga varias tarjetas.
Pidió algo gráfico, entendible para cualquiera, sofisticado, con muchas animaciones, sin conceptos raros y serio. Además opina que el vidrio actual del
ERP es «algo pobre». La propia receta da la causa en `app/estilos/vidrio/recetas.css`: «con el fondo tan parejo el desenfoque casi no se ve».

## Lo que se decidió

| Tema | Decisión | De dónde sale |
|---|---|---|
| Sensación | Neobanco moderno, con material y luz | Pregunta 1; descartó Mercury y Linear por planos, eligió LifeStats y Revolut |
| Protagonista | La cifra y una frase que la interpreta | Pregunta 4 |
| Densidad | Muy poca información a la vista; lo demás, plegado | Pregunta 5 |
| Nombres | El nombre real del estado, sin las preguntas de ADR-0585 | Pregunta 9 |
| Navegación | Pestañas fijas | Eligió mirando la maqueta, contra la portada que se abre |
| Letra de las cifras | Inter | Eligió mirando, contra DM Sans |
| Fondo | Hilos: hilos finos que fluyen, con un hilo rojo | Eligió mirando, entre ocho estilos |
| Gráficos | Línea y área, cascada, tubos; categorías a la vista. Sin río de flujo | Marcas de las dos rondas |
| Temas | Claro y oscuro al mismo nivel | Pregunta 3 |

**Fechas (Felipe, 2026-11-05):** pidió poder elegir fechas específicas. `<SelectorMes>` cede su lugar a un calendario de vidrio con atajos y meses: rango en
Ganancias, Flujo y Patrimonio; una sola fecha en Balance. Lo demás de Finanzas sigue con su mes.

## Las excepciones a las reglas, y por qué

- **ADR-0596, una receta nueva y no otro vidrio suelto.** El vidrio con filo de luz, brillo que sigue al mouse y borde que desvía se agrega a `recetas.css`
  como receta propia. **Se usa solo en Estados financieros: no cambia ninguna pieza del resto del ERP.** Llevarlo a todo el sistema es otra decisión,
  porque toca todos los módulos. Felipe (2026-11-05): se hará después de construir Estados financieros, con las demás mejoras visuales (ver el backlog de esta rama). La regla de que una hoja no lleva `backdrop-filter` no cambia: la receta es de las placas de la pantalla.
- **Letra.** Inter entra por `next/font` solo en el layout de `/finanzas/reportes`, y solo para las cifras. El ERP sigue con DM Sans y EB Garamond.
- **ADR-0169, colores.** El fondo y sus hilos salen de los tokens, leídos del CSS al pintar. El hilo rojo cuenta como uno de los dos acentos rojos de la
  pantalla. Rojo en texto chico: `rojo-profundo` en claro y un rojo aclarado en oscuro, porque el token `rojo` no alcanza 4,5:1 sobre el vidrio.
- **ADR-0136, movimiento.** Excepción con su lista y su prueba, como las demás: el filo de luz que corre una vez, las cifras que ruedan, la línea que se
  dibuja, las columnas que crecen, los tubos que se llenan y los hilos que se reacomodan al cambiar de pestaña. Sin rebote ni bucle; todo se apaga con
  `prefers-reduced-motion`. El brillo y un desplazamiento de pocos píxeles siguen al mouse, sin moverse solos.
- **Se mantienen sin excepción:** `<EncabezadoPagina>`, la mesa de mando del telar con su sede en la URL, `<Pestanas>` (su gota ya fluye),
  `<Chip>`, los botones del sistema, permisos y lecturas.

## Lo que cuesta

- Cada placa lleva `backdrop-filter`: de 4 a 5 por pantalla. Una tabla o grilla larga no usa esta receta.
- El borde que desvía solo se ve en navegadores Chromium. En otro navegador queda el vidrio sin esa curva.
- Falta medir la fluidez en el Mac mini de la tienda. Si no alcanza, se apaga primero el borde que desvía.

## Lo que se descartó

- **Portada que se abre:** Felipe prefirió pestañas fijas.
- **Fondos Arena, Atardecer, Rojo, Dunas, Ventana, Trama y Niebla:** comparados en la maqueta. El rojo como fondo se lee además como pérdida.
- **Las capturas de referencia en el repo:** son de terceros y el repo es público. Viven en un tablero privado.

## Las mejoras de los componentes, ya en el ERP (2026-11-05)

Salieron de comparar los componentes con otros sistemas (`docs/investigacion/2026-11-05-componentes-frente-a-sistemas.html`) y de probarlas en la maqueta. Felipe ordenó: «Empieza por 1 a 5 y luego elijo
"rápido" para avanzar hasta la 8 y dejar la 9 para el final». **Valen para todo el ERP, no solo para Finanzas**, y son independientes de la reconstrucción de Estados financieros.

| # | Qué | Dónde vive | Alcance real |
|---|---|---|---|
| 1 | Guardar con algo pendiente lleva al campo y dice el error ahí | `useGuiaCampos` (`revisar`, `errorDe`, `marcarError`), `CampoGuiado` | Toda hoja con guía que use `confirma`; `marcarError` solo en Registrar gasto |
| 2 | Lo mal escrito se avisa al salir y se va al corregirlo | `useValidarAlSalir`, `lib/validar-al-salir.ts` | Gastos, `ConsultaDocumento`, `EntradaMonto`; los `<input>` con `CLASE_MONTO_ILEGIBLE` no se marcan con el foco |
| 3 | El monto se ve con miles y dos decimales al salir | `montoParaMostrar` | `CampoMonto` (31 archivos) y `EntradaMonto` (4). Los `<input>` propios con `atributosMontoTexto` o `CLASE_MONTO_ILEGIBLE` (17 archivos), no |
| 4 | El botón no se apaga por lo que falta | `<Boton confirma={guia}>` | 117 botones en 100 archivos |
| 5 | Con el dedo, 44 px | `app/estilos/tacto.css`, `pnpm --filter web tacto:medir` | Medido en 8 rutas a 375 px. Fuera: los puntos de color de Existencias, que no caben sin pisarse |
| 6 | Cuatro tiempos con nombre, ritmo «Rápido» | `--t-resp`, `--t-cambio`, `--t-hoja`, `--t-momento` | Piezas del sistema. Las excepciones de ADR-0136 siguen con los suyos |
| 7 | Vidrio macizo con menos transparencia o más contraste | Final de `recetas.css` | Automático en todo el ERP |
| 8 | Fechas con límites, fechas cortas y teclado en el mes | `CampoFecha` (`min`, `max`), `lib/campo-fecha-reglas.ts`, `SelectorMes` | Límites puestos en Registrar gasto y en las etiquetas. 18 archivos siguen con `type="date"` del navegador |
| 9 | Tabla | «Compacta» en `TablaViva` | Solo esto por ahora: ver abajo |

**Decisiones que se tomaron al construir.** Lo mostrado nunca dice otra cifra: como cada pantalla lee lo escrito a su manera, por defecto solo se da formato a lo que todas leen igual, y lo ambiguo se queda como
se escribió. El límite de una fecha no borra lo tipeado: si lo borrara, un «Hasta» opcional se guardaría vacío mientras la pantalla muestra un error, y por eso la validación de quien usa el campo sigue mandando.
Al poner límites a un rango solo se limita «Hasta»: si «Desde» también tuviera tope, mover una temporada hacia adelante obligaría a cambiar primero el final.

**La mejora 9: lo que decidió Felipe (2026-11-05),** mirando los pros y contras de cada opción:

- **Más tablas con encabezado fijo y orden: después.** `TablaViva` sigue solo en Rendimiento y Movimientos ▸ Ingresos, y 75 tablas son `<Tabla>`. Primero se implementa el diseño de Estados financieros; recién después se llevan las mejoras de componentes y de visuales al resto de los módulos. Lo que falta está anotado, con sus archivos, en `docs/backlog/2026-11-05-financial-statements-redesign-afaa35.md`.
- **Otro lote: no, por ahora.** Marcar varias filas ya existe en Por pagar («Pagar juntos»), Productos, Existencias y Apartados. Si la tienda lo pide en otra pantalla, se hace con ese caso real.
- **Editar en la fila: no.** Toda corrección sigue en su hoja, con responsable y «antes → ahora», y el monto de un gasto no se corrige ni ahí (ADR-0588).
- **Esqueleto de carga: no cambia nada.** Sigue el loader único, y el esqueleto parcial de una sección que ADR-0149 ya admite.

## Lo que se decidió al construirla

La maqueta decía cómo se ve; esto es lo que salió al conectarla con los datos reales.

- **Una sola fecha para los cuatro estados, en la URL** (`lib/estados-periodo.ts`). Un mes entero es `?mes=` (el de hoy no se escribe); otras fechas suman `?desde=&hasta=`. `mes` es siempre el mes de `hasta`, porque viaja al
  resto de Finanzas. Balance mira `hasta`, y la URL vieja con `?corte=` se sigue leyendo.
- **El calendario se cierra al aplicar,** distinto de la maqueta: cada elección rehace la pantalla, así que quedarse abierto taparía justo lo que se quiso ver. Lo escrito a mano pide «Ver»; lo tocado se aplica solo.
- **Un mes en curso se compara con los mismos días del mes pasado,** no con el mes entero: comparar cinco días contra treinta siempre daría «bajó».
- **Una pieza común, `<EstadoVidrio>`** (`components/finanzas/estados/`): cifra, frase, gráfico, partes con su detalle y libro del contador. Las reglas de cada estado viven en `lib/estados-ganancias.ts`, `estados-flujo.ts`,
  `estados-balance.ts` y `estados-patrimonio.ts`, con su prueba; lo común, en `lib/estados-partes.ts`.
- **Lo que está en cero no se dibuja,** salvo el resultado. «Faltaron» tiene su tarjeta y no su tramo en la barra, porque la barra reparte lo que se gastó.
- **Balance compara solo contra un cierre que también cuadre.** Compararlo con uno que no cuadra daría una diferencia sin sentido. Las filas de cada sede no muestran su caja abierta (ADR-0186).
- **`?forma=formal` se retira.** El formato formal de cada estado se abre ahí mismo («Ver el formato formal», `LibroDelContador`), y una URL vieja solo muestra el estado. No se perdió nada: el cuadro por sede con «De dónde sale», comparar con el mes
  anterior, semana a semana, el cuadro por columna y los saldos de arranque siguen en «Ver más». Los avisos graves del Estado de resultados (rojo y ámbar) se ven bajo la cifra, sin abrir nada.
- **El aviso de costo estimado (tarea 28 de «Las 36 de Finanzas») se mudó con el rediseño.** Llegó a `main` en `GanamosPanel`, que este rediseño reemplaza: ahora es un `<Aviso>` bajo la cifra de Ganancias y pérdidas, con las fechas del calendario, su paso opcional en la guía y su botón a «Registrar el costo real».
- **«Para el contador» es un botón con menú** (`MenuContador`, `opcionesDelContador`): los saldos por cuenta, el libro diario y las descargas de cada archivo.
- **«Qué te recomiendo» va a todo el ancho,** no en una columna al costado como en la maqueta: la columna dejaba muy poco lugar a la barra. Dentro de esa placa, el botón de cada recomendación va bajo el texto: a su lado, a 375 px, el texto quedaba en una columna de una palabra.
- **Los puntos de «días con más ventas» salen de `fn_rendimiento_serie`,** así que solo los ve quien tiene Rendimiento; los demás ven el calendario sin puntos. Es una lectura de apoyo, por `GET /finanzas/reportes/periodo`, con `x-espera: no`: si falla, el calendario funciona igual.
- **La lente (el borde que desvía) solo se aplica** en Chromium, desde 760 px, sin «reducir movimiento», sin «reducir transparencia» y sin «más contraste». En otro caso, queda el mismo vidrio sin esa curva.
- **Fuera de la pieza del sistema, a propósito:** la línea de los meses (`LineaDeMeses`), la barra que se explora (`TuboDePartes`) y el calendario (`SelectorPeriodo`) son de esta pantalla, por la maqueta que Felipe eligió. Lo anotan `docs/unificar/grafico.linea.md`,
  `grafico.barra.md` y `mes.md`.

**Una función nueva en la base: `retail.fn_patrimonio_en_fechas(p_desde, p_hasta)`** (migración `20261105230000`; solo lee, `security definer`, con el mismo candado de `fn_patrimonio_cambios`; sin `alter` ni políticas). Se pegó en producción el 2026-11-05, con el OK de Felipe y antes de fusionar. Se comprobó que lo pegado era idéntico al archivo (SHA-256 y md5 del cuerpo), que `anon` no la puede ejecutar y que `authenticated` sí. Sin ella, un mes entero funcionaría igual con
`fn_patrimonio_cambios`, y solo fallarían, con su mensaje, otras fechas y la comparación del mes en curso.

**Lo que Felipe aprobó tras la prueba ciega (2026-11-05):** el calendario dice cómo se usa («Toca el primer día y luego el último. Se aplica solo»); una pérdida se dice en soles («por cada S/ 100 que vendiste, faltaron S/ 177»), con la tarjeta «Perdiste» y los porcentajes «de lo vendido»; y el tubo del Balance nombra sus lados («Debes … + tuyo …»). Además, el detalle de «Ganaste» en Patrimonio avisa que no trae los sueldos estimados que Ganancias y pérdidas ya resta: las dos cifras pueden diferir en un mes con sueldos sin pagar, y no se igualaron porque eso es tema del contador.

**Con el dedo, un tramo angosto de la barra sigue siendo angosto** (de 7 a 42 px): su ancho es la proporción, que es el dato. La tarjeta de abajo hace lo mismo y mide 44 px; WCAG 2.5.8 admite ese caso (control equivalente).

## Cómo se verificó

Local, base `54421`, con los datos del seed y, solo para mirar, datos inventados que nunca se commitearon.

- **Cada actividad** se abrió en un navegador sin ventana (el panel estaba oculto). Se probaron meses con pérdida, rangos, sede, Empresa, fecha de inicio, «reducir movimiento» y descarga. `pnpm pruebas:patrimonio-cambios`: 34 comprobaciones.
- **Guías** (`guias:recorrer`): las cinco pasan con datos reales y con los inventados, a 1440 y 375 px, y a 1440 en oscuro.
- **Contraste** (`tema:auditar`, 15 vistas a 1440 y 15 a 375, con calendario, detalle, libro y «Ver más»): 0 hallazgos solo en oscuro. Lo heredado del claro que queda es falso positivo: «Registrar gasto», «Ver» y el día elegido tienen fondo degradado, que el detector no lee. Lo real se corrigió:
  el «S/ 0» de la línea, el rojo y el verde sobre el tinte y en las partes apagadas, y el aviso rojo del calendario en la hoja del celular.
- **Ancho:** 0 desbordes en 1920, 1440, 1024 y 375, en claro y oscuro, sin errores de consola.
- **Dedo** (`tacto:medir`): solo quedan los tramos de la barra. **Ciega y notas:** `docs/formidable/finanzas-estados-financieros.md`.
- **No medido:** la fluidez en el Mac mini (lente, desenfoque y lienzos que se mueven). Si no alcanza, se apaga primero la lente.

## Actualización 2026-11-06 — camino «A · El informe»

Felipe miró la pantalla en producción y la rechazó («qué horrible forma de mostrarme cada estado financiero»): la cifra gigante, los hilos cruzando detrás de los números
y el Balance enterrado bajo siete tarjetas de comprobación. Eligió mirando el camino **A · El informe** entre tres (`docs/maquetas/estados-financieros-2026-11-rediseno/`).

- **Cada estado es un informe**: una fila por concepto, con sus subtotales y su total, la columna de ahora y las de antes (un período que no se pudo leer es «—», nunca un
  cero), y cuánto pesa cada fila contra la de referencia (lo vendido, lo que tienes). Una fila se abre en su lugar con qué es y de qué está hecha; «Nombres del contador»
  cambia las palabras, no las cifras. Reemplaza a las tarjetas de partes y al «formato formal» (eran dos maneras de decir lo mismo). Piezas: `lib/estados-informe.ts`,
  `InformeEstado`, `EstadoEnInforme`. Es un `<table>` a propósito (un estado contable con columnas, no registros), con su excepción en `unificar/familias.mjs`.
- **A la derecha, la respuesta**: la cifra (ya no a 148 px), la frase, el chip contra antes, el gráfico del estado y lo que hay que saber.
- **Sin tela de Hilos ni lentes**: las cifras se leen sobre el fondo del ERP, en la placa Serena. Las variables `--hilos-*` de `recetas.css` se quedan (contrato de familia con
  Dynamic: quitarlas abre una tarea allá).
- **El Balance que no cuadra se dice en una línea**: qué no cuadra y por cuánto, cada comprobación como un chip, de dónde sale la diferencia con su enlace y la lista
  completa a un toque.
- **Errores corregidos el mismo día**: la comparación «octubre a esta fecha» salía sin sueldos (la base los pone en el mes donde termina el período de Dynamic) y exageraba la
  caída: ahora lleva la parte de los días corridos (`sueldosAEstaFecha`); la frase de un mes en curso dice que el mes recién empieza; la raya del cero ya no se sale del
  gráfico; todos los montos van con céntimos (también `solesBalance`).
- **No verificado en el navegador** (la base local no tiene `fn_patrimonio_cambios` ni un Balance que no cuadre): Cambios en el patrimonio y la vista del bloqueo. Ganancias
  y Flujo sí, a 1440 px.
