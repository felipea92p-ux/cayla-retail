# Pantalla — Existencias (`/inventario`)

> Modo: completo · Fecha: 2026-10-04 · Rol/sede: líder, Tienda TRU (captura de Felipe, 13:42 Lima) · Dispositivo: escritorio a 2000 px (la captura); celular a 375 px **juzgado por el código**, no capturado `[código]` · Datos: **real**, producción (proyecto cayla-dynamic, schema `retail`), dos consultas de solo lectura hechas hoy a las 13:56 Lima, sin datos personales (ver Anexo).
> SHA analizado: `e6fde14d` = `origin/main`. El análisis del 2026-10-03 (SHA `b4cb05c3`) **queda vencido**: desde ese SHA cambiaron 18 archivos de la pantalla (la barra de filtros nueva, `FiltrosExistencias.tsx` con +399 líneas, ADR-0326; `InventarioPanel.tsx` con +/−599; `lib/existencias-hoy.ts` nuevo). No se tomó como base: en el Historial se marca qué tareas suyas se cerraron.
> Archivos: `app/(app)/inventario/page.tsx` · `components/InventarioPanel.tsx` · `ExistenciasTarjetas.tsx` · `TarjetaReponerAPiso.tsx` · `FiltrosExistencias.tsx` · `CajonPrendaExistencias.tsx` · `ExistenciasPorPrenda.tsx` · `ui/EncabezadoPagina.tsx` · `lib/existencias-hoy.ts` · `lib/existencias-prendas.ts` · `lib/existencias-recomendaciones.ts` · `lib/politica-operativa-inventario.ts` · `lib/inventario-reglas.ts` · `lib/inventario-v2.ts` · `lib/por-regularizar.ts` · RPC `bajar_al_piso`, `retirar_del_piso`, `ajustar_inventario`, `fn_stock_por_sede_json`, `fn_ritmo_reciente_json`, `fn_resumen_variantes_json`, `listar_apartados` · tablas `stock`, `sububicaciones`, `prendas_danadas`, `apartados`, `prendas_por_regularizar`, `bajadas_piso`.
> Otra sesión tocándola: **no** en código. Las filas de `docs/SESIONES-ACTIVAS.md` que nombran Existencias (líneas 18, 44, 49-53, 56) son de ramas ya fusionadas o viejas: el tablero está vencido. Esta misma sesión tiene un rediseño sin commit en el árbol de trabajo (cabecera y «Para hoy»); este análisis juzga `origin/main`.
> Método: mapa del código por un subagente de solo lectura (cadena `page.tsx` → componentes → `lib/` → RPC → RLS, con `archivo:línea` de `origin/main`); consultas de producción propias; lentes de `/rigor` donde cambiaron la decisión. Etiquetas: `[visto]` captura · `[código archivo:línea]` · `[producción]` consulta de hoy · `[inferido]` · `[no verificable]`.
> Contexto de negocio de hoy: Felipe respondió tres rondas de preguntas sobre Inventario (2026-10-04). Las que tocan esta pantalla: la portada es **buscador + «Para hoy» (3 frases como máximo, con cifra y botón) + catálogo**; el número grande es **colgadas** (y, cuando exista la capacidad, «de las que caben»); se diseña para **encargado de sede, asesora y cuenta Almacén**; «formidable» = **cifras verdaderas + sin capacitación + que se vea espectacular**; el mínimo es **1 colgada por talla y color, solo tallas centrales**; Análisis y Frescura los ven todos.

## 0 · Veredicto
La base es sana y las escrituras son todo-o-nada, pero la cara **dice cosas que no son verdad y no dice por dónde empezar**: «Incidencias 0» con 78 ventas sin registrar en TRU, «reponer» en las 538 tallas, un rojo en cada tarjeta y cinco botones compitiendo arriba.
**Cumple su finalidad:** 4,5/10 (promedio de las 6; el tope de 5 no hizo falta) · **Relevancia:** 8,2/10 — **Núcleo**.

## 1 · Finalidad declarada
«Existencias existe para que la sede sepa **cuántas prendas tiene, dónde están** (colgadas, guardadas, en camino, dañadas) **y qué toca hacer hoy con ellas**, y lo haga sin salir.» Fuente: `docs/datos/modulos/05-inventario-y-movimientos.md` §«Para qué existe» («nadie sabe cuántas hay, dónde están, ni por qué la cuenta cambió»), la frase de la cabecera `page.tsx:171` y ADR-0231/0237. No se usó la captura como fuente.
**¿Docs y pantalla coinciden?** En lo que guarda, sí. En lo que dice, no: promete «qué deberías reponer hoy» y contesta «todo» (§4.2). Además `docs/ARQUITECTURA.md:196` todavía describe la `/inventario` de V1 (`lib/inteligencia.ts`, `InventarioAgrupado.tsx`, `/inventario/almacen`), que no existen: manda el código.

## 2 · Objeción
1. **Lo peor no es feo, es falso.** La tarjeta «Incidencias» dice **0** `[visto]` mientras en TRU hay **78 ventas sin registrar, 14 vencidas** `[producción]`: prendas que ya se fueron y el stock todavía cuenta. Existencias no lee esa cola (`prendas_por_regularizar` no aparece en ningún archivo de la pantalla) `[código]`. Una pantalla que miente por omisión es peor que una vacía.
2. **«Reponer» no distingue nada.** La regla es «reponer si hay 4 o menos colgadas» (`lib/politica-operativa-inventario.ts:39-42`, `lib/existencias-recomendaciones.ts:131-137`). En TRU **ninguna talla tiene 5 o más en el piso** `[producción]`: la regla marca el 100 % (538 de 538). Una regla que dice «sí» a todo no informa nada. Felipe ya decidió el reemplazo hoy: **1 colgada por talla y color**.
3. **«Por colgar» es casi todo un error de registro, no trabajo.** 391 de 538 tallas figuran «por colgar» `[producción]`. Pero con el mínimo decidido, TRU necesita **539 lugares de 600** (546 combinaciones talla-color con stock, 539 en talla central) `[producción]`, y Felipe contó **600–750 prendas colgadas** el 30-sep: lo que el sistema llama «por colgar» ya está colgado y entró al sistema como «guardado». Si la pantalla manda a colgarlo, el equipo aprende el primer día a no creerle. (Lente de `/rigor`: el mínimo cabe, así que el hueco es de datos, no de piso.)
4. **El rojo dejó de ser señal.** El sistema fija **2 rojos por pantalla como máximo** (`packages/shared/src/design-tokens.ts:73`) y **ningún archivo de código lo importa** `[código]`. En la captura hay más de 30 elementos rojos: la caja «Piso» de cada tarjeta va siempre en rojo (`ExistenciasTarjetas.tsx:233-235`), la pastilla «por colgar» es roja (`lib/existencias-hoy.ts:60-65` → `ExistenciasTarjetas.tsx:89`), la tarjeta «Reponer a piso hoy» es rosada casi siempre (`TarjetaReponerAPiso.tsx:62-72`).
5. **Trade-off que asumo:** arreglar la cara sin cuadrar el piso de TRU deja una pantalla bonita con «por colgar» inflado. Por eso «Para hoy» dice la verdad sobre ese número (tarea #3) y el cuadre va como la cosa de mayor consecuencia fuera de esta pantalla (§10).

## 3 · Lo que está bien y no se toca
- **El libro manda.** El stock es foto del libro de movimientos (705 claves sin diferencia el 3-oct) y cada movimiento piso↔almacén es una RPC `security definer` con candado de módulo (`bajar_al_piso` 20261002120000:62-67, `retirar_del_piso` :76-81, `ajustar_inventario` `fn_puede_ajustar_stock` :87-92) `[código]`.
- **Lo secundario no tumba la pantalla.** La comparación de 7 días, el ritmo, la marca y los colores fallan con aviso y la pantalla sigue en pie (`page.tsx:69-75`, `:82-84`; `InventarioPanel.tsx:864-866`) `[código]`.
- **Filtros en la URL con conteos por opción** (ADR-0326): recargar, volver o copiar el enlace los trae puestos; las opciones que vaciarían la lista se esconden (`FiltrosExistencias.tsx`, `lib/existencias-filtros.ts`) `[código]`.
- **«Hoy» como una sola palabra por talla** (`hoyDeTalla`, `lib/existencias-hoy.ts:45-50`): los cuatro casos no se pisan; el filtro y la pastilla dicen lo mismo `[código]`.
- **La pistola y la cámara abren la talla exacta** (`InventarioPanel.tsx:547-557`, `:770-772`) y el botón fijo «Escanear prenda» del celular (`:1403-1416`) `[código]`.
- **El estado vacío explica y propone** (`ExistenciasVacio`, 56 pruebas) `[código]`.

## 4 · Las seis dimensiones
| Dimensión | Puntaje | Hallazgo principal | Evidencia |
|---|---|---|---|
| Estética | 4 | Cinco botones en dos renglones, cuatro tarjetas de las que dos dicen 0, rótulos en mayúsculas espaciadas por todas partes y más de 30 rojos contra un tope de 2 | `[visto]`, `[código ExistenciasTarjetas.tsx:233]`, `design-tokens.ts:73` |
| Lógica de negocio | 3 | «Incidencias 0» con 78 ventas sin registrar; «reponer» en 538 de 538; dos clasificaciones por talla que se contradicen | `[producción]`, `[código existencias-prendas.ts:38-43 vs existencias-hoy.ts:45-50]` |
| Arquitectura | 7 | Libro sano y escrituras con candado; lecturas que se piden y no se muestran; el tope de rojo no lo hace cumplir nada | `[código page.tsx:159-160, inventario-v2.ts:357]` |
| Funciones | 5 | Bajar, subir, ajustar, buscar y escanear funcionan; la tarjeta «Reponer a piso hoy» no tiene cifra y su clic solo escribe en el buscador | `[código TarjetaReponerAPiso.tsx:49-108, InventarioPanel.tsx:722-728]` |
| Utilidad | 3 | Una asesora nueva no sabe qué número creer ni por dónde empezar | `[visto]`, §4.5 |
| Conexión con el ERP | 5 | No lee la cola de Recibir; no muestra la edad del piso (Frescura); ninguna capacidad por sede | `[código]` |

### 4.1 Estética (4)
- **Cabecera:** cinco controles en dos renglones a la derecha; el oscuro es «+ Nuevo traslado» (`page.tsx:195-199`), que no es el trabajo diario de una tienda; «Bajar al piso», que sí lo es, va claro (`:190-194`) `[visto][código]`.
- **«Prioridades de hoy»:** un título y una bajada (`InventarioPanel.tsx:688-689`) más cuatro tarjetas fijas; «En camino 0» e «Incidencias 0» ocupan media fila diciendo nada `[visto]`. «Resumen disponible: 795 uds» es la cifra más grande y la que menos sirve: la caja no cobra 795 `[visto]`.
- **Barra de filtros abierta de fábrica:** «BUSCAR /», «PRENDA», «GESTIÓN», «CATEGORÍA», «TALLA», «COLOR», «HOY», «CONDICIÓN», «MARCA», «COPIAR ENLACE», «ORDENAR POR: MÁS RELEVANTES»: once rótulos en mayúsculas espaciadas antes de la primera prenda `[visto]`. La primera prenda empieza a ~920 px de 1.107 en la captura `[visto]`.
- **Tarjeta de prenda:** la caja «Piso» va en fondo rojo al 9 % con la cifra en rojo profundo **siempre**, aunque no pase nada (`ExistenciasTarjetas.tsx:233-235`); cuatro botones por tarjeta y uno negro en cada una: 15 botones negros por página (`:315-358`) `[código]`. La curva de tallas repite «Piso / Almacén» con íconos en cada renglón (`:109-130`).
- **Hermanas:** Ventas, Cambios y Devoluciones usan `ResumenSede` a la derecha de la cabecera (cifras centradas en un recuadro de papel); Existencias es la única de Inventario con la cabecera de Ventas (ADR-0220) que no lo usa `[código]`.

### 4.2 Lógica de negocio (3)
- **Viola el principio 4 de `CLAUDE.md` por omisión** («una sola fuente de verdad»): el stock cuenta como presentes 78 prendas de TRU y 170 de AQP que ya se vendieron (`prendas_por_regularizar` pendientes) `[producción]`, y la pantalla dice «Incidencias 0» `[visto]`. Ninguna decisión escrita dice que Existencias no deba mostrarlas; ADR-0179 fija el plazo de 2 días.
- **La regla de reponer** (ADR-0231, umbral 4) quedó contradicha por la decisión de Felipe de hoy (1 por talla y color). Con el 4 no hay talla en «Mantener» en TRU `[producción]`.
- **Dos nombres para el mismo hecho:** `estadoTalla` (`lib/existencias-prendas.ts:38-43`: sin_stock / por_colgar / reponer / normal) y `hoyDeTalla` (`lib/existencias-hoy.ts:45-50`: por_colgar / por_reponer / sin_stock_atras / mantener). Una talla con 2 en el piso y 0 en el almacén es «reponer» en la celda de la tarjeta y «sin stock atrás» en la pastilla de la misma tarjeta `[código]`. Integridad conceptual: una de las dos sobra.
- **«Reponer a piso hoy» no cuenta lo mismo que el filtro «Hoy»:** toma la unión de tres casos (todo menos «mantener») y ninguna opción del filtro reproduce ese conjunto; su clic escribe el nombre en el buscador en vez de filtrar (`TarjetaReponerAPiso.tsx:57-62`, `InventarioPanel.tsx:722-728`) `[código]`. ADR-0326 §5 dejó esto pendiente.

### 4.3 Arquitectura (7)
- **Transacción y concurrencia:** cada movimiento piso↔almacén es UNA llamada a `bajar_al_piso` / `retirar_del_piso` con todas sus líneas (inserta `bajadas_piso`, ítems y movimientos juntos) `[código]`; dos personas bajando la misma talla a la vez: la segunda ve el stock nuevo o choca con el candado de la RPC, nunca deja negativo (`stock` no tiene cantidades negativas en producción, 0 filas) `[producción 3-oct]`.
- **Caída externa:** la pantalla no llama a nada fuera de Supabase. Se degrada así: si una lectura secundaria falla, la sección lo dice y el resto sigue; no pierde datos porque solo lee.
- **Volumen:** TRU tiene 538 tallas y 101 modelos hoy; con 3 sedes y la carga de AQP, del orden de 2.000–3.000 tallas en un año `[inferido]`. Todo se filtra en el navegador sobre ese tamaño: sin problema de rendimiento medible (la auditoría del 3-oct midió 62–90 ms en `fn_resumen_variantes`).
- **Lo que sobra:** en una tienda, `getFilasSemanaDeSede` (`page.tsx:69-75`) solo alimenta una cifra que se pinta en el Taller (`InventarioPanel.tsx:712-718`); `resumen.requierenReposicion` se calcula (`page.tsx:129`) y no se pinta en ningún lado `[código]`.
- **El tope de rojo no tiene candado:** `MAX_ROJO_POR_PANTALLA` solo vive en comentarios `[código]`.

### 4.4 Funciones (5)
- **Funcionan:** buscar (con «/»), escanear, filtros con conteos en la URL, bajar al piso, subir al almacén, ajustar, ver detalle con tabla Por prenda / Por talla, cajón, exportar CSV, copiar enlace `[código]`.
- **Fantasma:** la tarjeta «Reponer a piso hoy» no muestra ningún número y su fila no filtra: escribe el nombre en el buscador `[código TarjetaReponerAPiso.tsx; InventarioPanel.tsx:722-728]`. «N apartadas para clientes» aparece sin comprobar que el rol vea Apartados (`InventarioPanel.tsx:692`) `[código]`.
- **Faltan para la finalidad:** las ventas sin registrar; cuándo se cuadró el piso por última vez; cuánto cabe en el piso (la capacidad no existe en la base) `[código]`.
- **Sobran:** dos tarjetas que casi siempre dicen 0; el título «Prioridades de hoy» con su bajada; «Ver detalle» que significa «abrir la tabla» en la barra y «llevar esta prenda a la tabla» en la tarjeta `[código]`.

### 4.5 Utilidad (3) — una asesora nueva, TRU, sábado 10:30
1. Abre Existencias: lo más grande es «795 uds». Un cliente pide una blusa M; la asesora cree que hay 795 para vender. La caja no se la cobra porque el sistema la cree guardada (antes del botón de ADR-0321). **Duda: ¿cuál de los números es el que vende?**
2. Busca «por dónde empezar»: la tarjeta rosada dice «Empieza por estas prendas: Body Bonita, Body Lavie, Body Leonor» `[visto]`, en orden alfabético-urgente y sin cifra. Toca una: la pantalla escribe «Body Bonita» en el buscador y baja. **Duda: ¿y cuántas son en total?**
3. Recorre las tarjetas: todas tienen «Piso 0» en rojo y «3 tallas por colgar» en rojo `[visto]`. Las prendas están colgadas frente a ella. **Error: deja de creerle a la pantalla.**
4. Ve un botón negro «Reponer prenda» en cada tarjeta y otros tres al lado. **Duda: ¿cuál toco?**
No es falta de capacitación: la pantalla no dice qué número vende, cuánto trabajo hay ni cuál es el primer paso.

### 4.6 Conexión con el ERP (5)
Aguas arriba recibe el stock de `carga_inicial`, Recibir y Traslados; aguas abajo la usan Vender (lo colgado es lo que se cobra; ADR-0321 registra la bajada olvidada), Frescura (la edad del piso nace de las bajadas) y Análisis. **No lee** `prendas_por_regularizar` (la cola de Recibir) ni la edad de Frescura. Dueño: Halcón (05); la cola de regularizar es de Colibrí (07): la brecha entre los dos no tiene dueño `[código][AVIARIO]`.

## 5 · Relevancia
| Criterio | Peso | Puntaje | Por qué (una línea) |
|---|---|---|---|
| Gestión (directo + indirecto) | ×2 | 9 | Decide qué se cuelga hoy; cada bajada que registra alimenta Frescura y Análisis |
| Dinero y stock que toca | ×1 | 8 | Mueve stock entre piso y almacén y ajusta; el stock de 808 prendas de TRU vive aquí |
| Frecuencia y personas que la usan | ×1 | 9 | Todos los días: encargado, asesoras y la cuenta Almacén (12 bajadas en TRU hoy a las 13:56) |
| Qué se detiene si falla | ×1 | 6 | La venta sigue (Vender), pero nadie cuelga ni corrige con orden |

Relevancia = (2·9 + 8 + 9 + 6) / 5 = **8,2 — Núcleo**.

## 6 · Conexión con el ERP
- **Aguas arriba:** `stock` (foto de `movimientos`), `fn_stock_por_sede_json` (lo que hay en otras sedes), traslados en camino, `prendas_danadas`, `apartados`, catálogo y colores.
- **Aguas abajo:** Vender cobra lo colgado; Frescura mide la edad desde las bajadas; Análisis y el Inicio de la cuenta Almacén leen el mismo stock.
- **Pájaro dueño y vecinos:** Halcón (05). Vecinos: Colibrí (07, ventas y la cola sin registrar), Águila (13, Frescura y Análisis), Lechuza (06, conteo).
- **Externos, y qué pasa si caen:** ninguno. Si Supabase no responde, la pantalla no carga (`loading.tsx` → error); no hay escritura a medias porque cada RPC es una transacción.

## 7 · Las 12 tareas, por importancia
Orden por lo que afirma algo falso sobre el stock, después por cuánto le cambia el día a quien la usa. Las decisiones de Felipe de hoy ya desbloquean casi todas; la única abierta es la #10.

### #1 · Eliminar/fusionar/conectar — La cola de ventas sin registrar entra a la pantalla
- **Dónde:** `page.tsx:53-85` (nueva lectura: conteo `head` de `prendas_por_regularizar` por sede, pendientes y vencidas, solo si el rol ve Recibir); se muestra en «Para hoy» (#3) con botón a `/recibir?vista=por-regularizar`.
- **Por qué en este puesto:** hoy la pantalla dice «0» con 78 pendientes en TRU y 170 en AQP; el stock cuenta prendas vendidas. Es lo único de la lista que hace que la pantalla deje de afirmar algo falso.
- **Cómo lo verificas tú:** en TRU, «Para hoy» dice «78 ventas sin registrar · 14 llevan más de 2 días»; con la cola en 0, la fila no aparece; si la consulta falla, la fila dice que no se pudo leer (no un 0).
- **Esfuerzo / dependencias:** S · se dibuja dentro de la #3.

### #2 · Corregir — Aplicar el mínimo que decidiste hoy: 1 colgada por talla y color
- **Dónde:** `lib/politica-operativa-inventario.ts:39-42` (`umbralStockPisoReposicion` 4 → la regla «reponer» pasa a «0 en el piso»); `lib/existencias-recomendaciones.ts:131-137`.
- **Por qué en este puesto:** con el 4, las 538 tallas de TRU piden reponer y «Mantener» no existe. Con 1, las 147 tallas que ya tienen entre 1 y 4 colgadas pasan a «Mantener», y «Por reponer» deja de mezclarse con «Por colgar».
- **Cómo lo verificas tú:** en TRU local, el filtro «Hoy» muestra «Mantener» con las tallas que tienen al menos 1 colgada; «Por reponer» queda en 0.
- **Esfuerzo / dependencias:** S · ninguna. «Solo tallas centrales» se deja para cuando existan las tallas clave: en TRU son 7 tallas extremas de 546 (1,3 %) `[producción]`.
- **DECIDÍ:** el umbral de piso pasa a «reponer cuando no queda ninguna colgada» para todas las tallas, que es tu mínimo de 1 por talla y color. **DESCARTÉ:** dejar el 4 hasta tener el motor del mix, porque mientras tanto la pantalla sigue diciendo «reponer» en el 100 % de las tallas y nadie le cree; y construir ya la excepción de tallas extremas, porque en TRU cambia 7 de 546 tallas. **SE ROMPE SI:** un color se vende tan rápido que su única colgada se va antes de que alguien mire: no vuelve a aparecer hasta la mañana siguiente. Lo cubre la #3, que pone primero lo que se vendió.

### #3 · Reconstruir — «Prioridades de hoy» pasa a «Para hoy»
- **Dónde:** `InventarioPanel.tsx:685-750` (se quitan `TarjetaPrioridad` :153-210 y `TarjetaReponerAPiso`); función pura nueva `lib/existencias-para-hoy.ts` con su prueba; componente `components/existencias/ParaHoy.tsx`.
- **Por qué en este puesto:** es tu decisión de la ronda 2 y la pieza que responde «por dónde empiezo». Cada pendiente es una frase con su cifra y UN botón, en el orden en que conviene hacerlo: colgar → ventas sin registrar → dañadas → apartados vencidos → traslados → lo que se pide afuera. Lo que está en 0 no aparece; se ven 3 y el resto a un toque.
- **Cómo lo verificas tú:** en TRU, la primera fila dice cuántas tallas hay por colgar con el MISMO número que el filtro «Hoy ▸ Por colgar»; su botón «Bajar al piso» abre la pantalla de escaneo con la lista cargada; «Ver cuáles» filtra la lista. Con todo al día, «Todo al día».
- **Esfuerzo / dependencias:** M · después de la #2 (para que «por colgar» cuente lo de verdad).
- **Honestidad del número (lente de `/rigor`):** mientras el piso no esté cuadrado (§10), «por colgar» lleva la frase «si ya están colgadas, regístralas en Bajar al piso: el sistema las cree guardadas».
- **DECIDÍ:** tareas como lista ordenada, con el mismo conjunto que el filtro «Hoy» (`hoyDeTalla`), como máximo 2 filas en rojo (solo plazos vencidos) y la cola de ventas sin registrar dentro. **DESCARTÉ:** conservar las 4 tarjetas y solo esconder las que dicen 0, porque siguen sin decir cuánto trabajo hay ni en qué orden, y la de «reponer» seguiría contando la unión de tres casos que ningún filtro reproduce; y un tablero con 6 tarjetas, porque es más ruido en la primera pantalla. **SE ROMPE SI:** un día de campaña TRU acumula 30 ventas sin registrar y 80 tallas por colgar: «Para hoy» pone primero colgar, y la cola se ve en segundo lugar en rojo. Si Felipe prefiere la cola primero, se cambia el orden en una línea de la función.

### #4 · Reconstruir — La cabecera dice qué se vende y tiene un solo botón fuerte
- **Dónde:** `page.tsx:168-228`; usa `components/ui/ResumenSede.tsx` (el de Ventas, Cambios y Devoluciones).
- **Por qué en este puesto:** el número grande decide qué cree la asesora. Pasa de «795 uds» a **Colgadas · Guardadas (· En camino si hay)**, en el recuadro de cifras de las pantallas hermanas. Un solo botón oscuro, «Bajar al piso» (el trabajo de todos los días en tienda); Recibir, Contar, Trasladar y Apartados, claros. Era la D3 del 3-oct.
- **Cómo lo verificas tú:** en TRU arriba a la derecha «155 Colgadas en el piso · 653 Guardadas en el almacén»; en el Taller, «Disponibles aquí»; un solo botón oscuro.
- **Esfuerzo / dependencias:** S · ninguna. Cuando exista la capacidad por sede, la cifra pasa a «155 de 600».
- **DECIDÍ:** `ResumenSede` con colgadas y guardadas libres, y «Bajar al piso» como único botón oscuro en tienda. **DESCARTÉ:** una cifra propia con un riel dibujado, porque sería un sexto estilo de cabecera cuando Ventas ya tiene uno, y mantener «+ Nuevo traslado» como oscuro, porque se usa unas veces al mes y colgar, todos los días. **SE ROMPE SI:** quien mira es el Taller (no cuelga): no hay «Bajar al piso» y el botón principal desaparece; ahí queda «Trasladar» claro, que es lo correcto porque el Taller casi no opera Existencias.

### #5 · Corregir — El rojo vuelve a ser señal
- **Dónde:** `lib/existencias-hoy.ts:60-65` (por_colgar → ámbar; sin_stock_atras → pizarra, informativo: se pide afuera), `ExistenciasTarjetas.tsx:86-90, 112, 233-235, 270`, la leyenda `InventarioPanel.tsx:965, 1003, 55/1234`.
- **Por qué en este puesto:** con más de 30 rojos, el único rojo que importa (una venta vencida, una prenda dañada) no se ve. «Por colgar» es trabajo, no un error.
- **Cómo lo verificas tú:** en TRU, una página de tarjetas sin un solo rojo si no hay dañadas ni vencidas.
- **Esfuerzo / dependencias:** S · junto con la #6.

### #6 · Reconstruir — La tarjeta de prenda: el riel de tallas y un solo botón
- **Dónde:** `ExistenciasTarjetas.tsx:137-365`.
- **Por qué en este puesto:** es lo que más se ve de la pantalla. Cada talla como una **etiqueta colgada de un riel**: el número grande son las colgadas y debajo «+N guardadas»; la etiqueta toma el tono de su estado (colgada, por colgar en ámbar, agotada punteada). Arriba, el nombre y los colores; abajo, la pastilla y **un solo botón** («Reponer» solo si hay algo que bajar); Subir, Ajustar y Ver detalle van al menú «⋯». Desaparecen las cajas «Piso/Almacén» con rojo fijo y los rótulos repetidos.
- **Cómo lo verificas tú:** a 1440 px se leen 4 tarjetas por pantalla sin bajar; una prenda sin nada que bajar no tiene botón oscuro; el menú «⋯» abre Subir, Ajustar y Ver detalle.
- **Esfuerzo / dependencias:** M · después de la #5.
- **DECIDÍ:** el riel de etiquetas como pieza propia de Existencias (la que la hace reconocible) y un botón contextual por tarjeta. **DESCARTÉ:** la tabla «Por prenda» como entrada, porque ya existe en «Ver detalle» y en el celular no se lee; y mantener cuatro botones, porque dan 15 botones negros por página. **SE ROMPE SI:** una prenda tiene 8 o más tallas (calzado 35–40 + medias): el riel se desliza de lado dentro de la tarjeta y lo que no se ve se nota por el borde que se desvanece.

### #7 · Corregir — Una sola clasificación por talla
- **Dónde:** `lib/existencias-prendas.ts:38-43` (`estadoTalla`) la leen la celda de la tarjeta, `CurvaTallas` (`ExistenciasPorPrenda.tsx:39-75`) y el cajón (`CajonPrendaExistencias.tsx:252-271`); pasa a leer `hoyDeTalla` (+ «agotada» cuando no hay nada en ningún lado).
- **Por qué en este puesto:** la misma talla no puede ser «reponer» en la celda y «sin stock atrás» en la pastilla de la misma tarjeta.
- **Cómo lo verificas tú:** una talla con 2 colgadas y 0 guardadas dice lo mismo en la tarjeta, la tabla y el cajón.
- **Esfuerzo / dependencias:** S–M · con la #6.

### #8 · Mejorar — Los filtros esperan a que los pidas; el buscador va primero
- **Dónde:** `lib/panel-filtros.ts:15-17` (de fábrica: cerrado en Existencias, abierto en Productos; lo que cada equipo guardó manda), `page.tsx:157`.
- **Por qué en este puesto:** el panel abierto de seis píldoras con dos rótulos de fila empuja la primera prenda bajo el pliegue. La estructura de Productos (ADR-0326) no cambia: solo se abre cuando la piden.
- **Cómo lo verificas tú:** en una laptop de 1366 × 768, la primera prenda se ve sin bajar; «Filtros» abre el panel y queda abierto en ese equipo.
- **Esfuerzo / dependencias:** S · ninguna.

### #9 · Mejorar — Celular a 375 px
- **Dónde:** `page.tsx:188-226` (fila de accesos que se desliza sin aviso), `ParaHoy` (una frase y el resto plegado), `ExistenciasTarjetas` (el riel se desliza dentro de la tarjeta), el botón fijo «Escanear prenda» (`InventarioPanel.tsx:1403-1416`).
- **Por qué en este puesto:** la asesora y la cuenta Almacén usan el celular frente al perchero (decisión de la ronda 1: celular en Bajar y Conteo).
- **Cómo lo verificas tú:** a 375 px, sin desplazamiento horizontal de la página; «Para hoy» ocupa menos de media pantalla; la primera prenda se ve en la segunda pantalla como mucho.
- **Esfuerzo / dependencias:** M · después de #3, #4 y #6.

### #10 · Replantear — ¿La edad del piso entra en Existencias?
- **Dónde:** sección 8.
- **Por qué en este puesto:** tu pedido de esta semana es que el inventario ayude a renovar el piso. Hoy la edad de cada prenda colgada vive solo en Frescura; Existencias, que es donde se cuelga y se retira, no la muestra. Esta tarea solo pide que decidas.
- **Cómo lo verificas tú:** tu respuesta en la sección 8.
- **Esfuerzo / dependencias:** — · decide Felipe.
- **DECIDÍ:** nada todavía; presento las dos opciones. **DESCARTÉ:** decidirlo yo, porque cambia cómo se gestiona el piso, no cómo se dibuja. **SE ROMPE SI:** —

### #11 · Corregir — *bajo valor / opcional:* lo que se pide y no se muestra, y documentos vencidos
- **Dónde:** `page.tsx:69-75` (la comparación de 7 días solo se pinta en el Taller: pedirla solo ahí), `page.tsx:129` y `inventario-v2.ts:357, 364` (`requierenReposicion` sin uso), comentarios desactualizados `page.tsx:126-128` y `InventarioPanel.tsx:680-684` (hablan del filtro «Acción», que ya no existe), `docs/ARQUITECTURA.md:196-206` (describe V1) y las filas viejas de `docs/SESIONES-ACTIVAS.md`.
- **Por qué en este puesto:** no cambia lo que ve nadie; evita que la próxima sesión crea lo que dicen los comentarios.
- **Cómo lo verificas tú:** en una tienda, la red no pide `fn_resumen_variantes_json` al cargar Existencias.
- **Esfuerzo / dependencias:** S.

### #12 · Mejorar — *bajo valor / opcional:* pruebas y registro de la guía de foco
- **Dónde:** pruebas para `resumirExistencias`, `ordenarModelos`/`agruparPorModelo` (viven en un componente: pasarlos a `lib/`), el cálculo de `enCamino`; `lib/guia-de-foco-pantallas.ts:91` («/inventario» pasa de pendiente a «no aplica»: su único campo es el buscador y «Para hoy» ya dice qué sigue) bajando `PENDIENTES_HOY`.
- **Por qué en este puesto:** lo que no tiene prueba es lo que se rompe en silencio en el próximo cambio.
- **Cómo lo verificas tú:** `vitest` en verde con las pruebas nuevas; `guia-de-foco.test.ts` en verde con la cuenta bajada.
- **Esfuerzo / dependencias:** S.

## 8 · Estrategia alternativa — Existencias como la pantalla del piso, con su edad
Hoy Existencias dice **cuántas** hay y **dónde**; Frescura, en otra pantalla, dice **cuánto llevan colgadas** y qué renovar. Quien cuelga y retira (la asesora, la cuenta Almacén) está en Existencias y nunca ve la edad.

| | La pantalla actual, arreglada (las 12) | Existencias con la edad del piso |
|---|---|---|
| Qué agrega | — | En cada etiqueta del riel, un punto de edad (Nueva · Vigente · Envejecida · Crítica, la vara de Frescura) y en «Para hoy» la tarea «N prendas envejecidas: renuévalas» con «entra una, sale una» |
| Ganas | Pantalla clara y verdadera, sin depender de otro módulo | Renovar el piso se decide donde se cuelga; Frescura queda para el análisis del líder |
| Pagas | La renovación sigue en otra pantalla que la asesora no abre | Una lectura más (`fn_frescura_sede`) y el riesgo de mostrar edad falsa mientras el piso no esté cuadrado (hoy Frescura mide una quinta parte del piso de TRU) |

Decide Felipe. Mi recomendación: **sí, pero después de cuadrar el piso**. Antes, la edad sería tan falsa como el «por colgar» de hoy.

## 9 · Referentes de ERP y futuro
- **Shopify POS:** cada cantidad tiene nombre y la suma se explica («disponible, comprometido, no disponible»): es la idea de la #4 `[artefacto «Inventario contra los mejores», 3-oct, verificado allí con su fuente]`.
- **Lightspeed «Things to do»:** al abrir, lo que hay por recibir y por contar: es la idea de «Para hoy» `[mismo artefacto]`.
- **Sortly:** carpetas como lugares con cantidad (piso, almacén): CAYLA ya lo tiene mejor `[mismo artefacto]`.
- **Futuro (no entra en las 12):** la capacidad por sede y el mix por categoría (la franja del piso: «Blusas 138 de 150») cuando exista la tabla del mix; la ubicación exacta en el almacén (estante, caja) si los almacenes crecen.

## 10 · Fuera de esta pantalla
**Cuadrar el piso de TRU antes del 15-oct.** El sistema ve 155 colgadas y tú contaste 600–750; 391 tallas figuran «por colgar» y casi todas ya están colgadas. Mientras no se cuadre, ningún diseño hace verdad el «por colgar», la edad de Frescura ni el «qué falta que se vendió rápido». El 15-oct se cierra la carga inicial barata (ADR-0270 D20); después, cada corrección es un ajuste que se lee como pérdida. Decidiste el método el 4-oct: escanear lo guardado (más de 200 prendas) y pasar el resto al piso en un solo movimiento, con tu «dale» antes de tocar producción.

## 11 · Líneas propuestas para el backlog
- [ ] `[pantalla:inventario]` #1 La cola de ventas sin registrar entra a «Para hoy» (conteo por sede, con aviso si no se lee) — S
- [ ] `[pantalla:inventario]` #2 Mínimo 1 colgada por talla y color: umbral de piso 4 → 0 en `politica-operativa-inventario.ts` — S
- [ ] `[pantalla:inventario]` #3 «Para hoy» reemplaza «Prioridades de hoy» (función pura + componente, mismo conjunto que «Hoy», ≤ 2 rojos) — M
- [ ] `[pantalla:inventario]` #4 Cabecera con `ResumenSede` (colgadas · guardadas) y un solo botón oscuro «Bajar al piso» — S
- [ ] `[pantalla:inventario]` #5 Rojo como señal: por colgar en ámbar, sin stock atrás en pizarra, caja «Piso» sin rojo — S
- [ ] `[pantalla:inventario]` #6 Tarjeta con el riel de tallas y un solo botón contextual + menú «⋯» — M
- [ ] `[pantalla:inventario]` #7 Una sola clasificación por talla (`estadoTalla` → `hoyDeTalla`) — S–M
- [ ] `[pantalla:inventario]` #8 Panel de filtros cerrado de fábrica en Existencias — S
- [ ] `[pantalla:inventario]` #9 Celular a 375 px: accesos, «Para hoy» plegado, riel deslizable — M
- [ ] `[pantalla:inventario]` #10 Decidir si la edad del piso (Frescura) entra a Existencias — decisión
- [ ] `[pantalla:inventario]` #11 *(bajo valor)* Lecturas sin uso, comentarios y `ARQUITECTURA.md` vencidos — S
- [ ] `[pantalla:inventario]` #12 *(bajo valor)* Pruebas de lo que no tiene y registro de guía de foco — S

## Inventario de elementos
| Zona | Elemento | Qué hace | Veredicto | Evidencia |
|---|---|---|---|---|
| Cabecera | Sede · fecha · «vista de las HH:MM» | dice de cuándo es la foto | bien | `page.tsx:174-175` |
| Cabecera | Título y frase | «Qué hay en piso y almacén…» | ajustar (frase más corta, con «colgado/guardado») | `page.tsx:170-171` |
| Cabecera | «Bajar al piso» | abre la pantalla de escaneo | ajustar (pasa a ser el único oscuro) | `page.tsx:190-194` |
| Cabecera | «+ Nuevo traslado» oscuro | abre un traslado | ajustar (claro, «Trasladar») | `page.tsx:195-199` |
| Cabecera | Recibir · Contar · Apartados | accesos | bien (claros) | `page.tsx:201-224` |
| Cabecera | (falta) cifras colgadas / guardadas | — | falta | §4.1 |
| Prioridades | Título y bajada «Prioridades de hoy» | rótulo | sobra | `InventarioPanel.tsx:688-689` |
| Prioridades | «Resumen disponible 795 uds» | total libre | ajustar (pasa a la cabecera partido; el desglose por categoría queda como enlace) | `:708-720` |
| Prioridades | «Reponer a piso hoy» | 3 prendas sin cifra | sobra (lo reemplaza «Para hoy») | `TarjetaReponerAPiso.tsx` |
| Prioridades | «En camino hacia acá» | traslados en camino | ajustar (solo cuando hay) | `:730-736` |
| Prioridades | «Incidencias» | dañadas en cuarentena | ajustar (solo cuando hay, y suma la cola sin registrar aparte) | `:737-748` |
| Prioridades | (falta) ventas sin registrar | — | falta | §2.1 |
| Filtros | Buscador «/» | busca y lee la pistola | bien | `FiltrosExistencias.tsx:303-323` |
| Filtros | Panel Prenda / Gestión abierto | seis píldoras en dos filas | ajustar (cerrado de fábrica) | `:167-267`, `panel-filtros.ts:15-17` |
| Filtros | Chips de lo elegido | quitar de a uno | bien | `:271-289` |
| Filtros | Copiar enlace · Ver detalle · Ordenar por | herramientas de la lista | bien | `:356-395` |
| Tarjeta | Foto / colibrí | identifica | bien (la foto por color es futuro) | `ExistenciasTarjetas.tsx:193-195` |
| Tarjeta | Puntos de color | cambia el color que se ve | bien | `:209-227` |
| Tarjeta | Cajas «Piso» (rojo fijo) y «Almacén» | totales del color | sobra (el riel ya los dice) | `:230-251` |
| Tarjeta | Curva con rótulos «Piso/Almacén» por renglón | cifras por talla | ajustar (riel de etiquetas) | `:255-285` |
| Tarjeta | Pastilla «N tallas por colgar» roja | qué pide | ajustar (ámbar) | `:95-105` |
| Tarjeta | Reponer prenda (negro) · Subir · Ajustar · Ver detalle | acciones | ajustar (un botón contextual + «⋯») | `:314-358` |
| Pie | Paginación · Exportar CSV · leyenda con rojo | herramientas | ajustar (leyenda del riel, sin rojo) | `InventarioPanel.tsx:947-970` |
| Celular | Botón fijo «Escanear prenda» | escanea | bien | `:1403-1416` |

## Historial
| Fecha | Modo | Cumplimiento | Relevancia | Tareas cerradas de las 12 anteriores |
|---|---|---|---|---|
| 2026-09-26 | completo | 5/10 (promedio 6.0, con tope 5) | 7.4 — Soporte | primer análisis (pantalla anterior al #445) |
| 2026-09-26 (tarde) | completo, sin SQL | 5/10 (promedio 6.3, con tope 5) | 7.8 — Soporte | Sobre el PR #500 (`ffa5d52b`). **Cerradas:** #2 (el #445 se fusionó), #3, #4 y #5 (buscador con marca, filtro Marca y vacío que explica: están en el código). **Superadas por el rediseño:** #8 (el semáforo de 4 estados ya no existe, pero su defecto reaparece como «todo pide reponer»: nueva #5) y #11 (la tabla por talla dejó de ser la vista principal). **Siguen abiertas:** #1 (Ajustar, nueva #1), #10 (candado de módulo, nueva #3), #6 (estrategia alternativa: ahora sección 8), #7 (motor único de búsqueda), #9 (`es_prueba`: la lista lo excluye, `fn_resumen_variantes` sin verificar) y #12. |
| 2026-10-03 (17:38 Lima) | **rápido**, sin SQL (PR #770, sesión `vista-informativa-ux`; no comparable con filas completas) | 6.7/10 (sin tope: escrituras sin revisar) | 7.2 — Soporte | Mismo día, mismo diagnóstico de fondo («Reponer» no dice cuántas son ni desempata por venta). **Este análisis completo lo reemplaza:** suma SQL de producción, las escrituras, «Incidencias» y la cola por regularizar. Sus tareas #1 (ponerle número a Reponer), #4 (desempatar), #9 (tarjetas en cero) y #5 (capa comercial) están absorbidas en #3, #7 y la sección 8. |
| 2026-10-03 | completo, con SQL de solo lectura | 4,5/10 (promedio de 6; el tope 5 no hizo falta) | 8,0 — Núcleo | **Análisis anterior vencido** (la pantalla se rehízo: −1.284 líneas en `InventarioPanel.tsx`). Once de las 12 del 26-sep figuraban ✅ hechas (la #12 era de bajo valor); de ellas **siguen vivas en otra forma** `[inferido: comparé sus títulos con lo que hoy muestra el código]`: #5 (el umbral quedó abierto: hoy 533/533 → nueva #2/#3), #10 (un solo vocabulario: hoy tres verbos → nueva #9) y #11 (pruebas: `resumirExistencias` y `ordenarModelos` siguen sin prueba → #12). Nuevas: #1 (cola por regularizar), #4 (Eliminar en el cajón) y #5–#7 (tarjeta). |
| 2026-10-04 | completo, con SQL de solo lectura (13:56 Lima) | 4,5/10 (promedio de 6; sin tope) | 8,2 — Núcleo | **Análisis anterior vencido** (18 archivos cambiaron desde `b4cb05c3`). De sus 12: **cerrada** #10 (filtros con conteos y en la URL: ADR-0326, #774). **Cerrada en parte** #5 (la tarjeta avisa «Solo M · L (de 4 tallas)», `c5fa30bb`; el total del modelo sigue abierto). **Siguen vivas en otra forma:** #1 → nueva #1; #2 (una regla por talla: `hoyDeTalla` existe, pero `estadoTalla` sigue en paralelo) → nueva #7; #3 → nuevas #2 y #3; #6 → nueva #6; #7 → nueva #5; #8 → nueva #4; #9 (un solo verbo para bajar) sigue abierta, sin tarea propia aquí; #12 → nuevas #11 y #12. **Sigue abierta y fuera de las 12:** #4 (D4, «Eliminar el producto» en el cajón: `CajonPrendaExistencias.tsx:291`) y #11 (foto por color). Nuevo: el tope de rojo no lo hace cumplir ningún código; el mínimo de 1 por talla y color cabe en TRU (539 de 600), así que «por colgar» es casi todo error de registro. |

## Anexo · consultas de solo lectura usadas (producción, proyecto `cayla-dynamic`, schema `retail`, 2026-10-04 13:56 Lima)
Todas son `SELECT`, sin datos personales.
```sql
-- Q1 · Existencias por sede como las pinta la pantalla (libres = cantidad − apartada)
with s as (
  select u.nombre as sede, st.variante_id, ss.tipo, greatest(st.cantidad - coalesce(st.cantidad_apartada,0),0) as libre
  from retail.stock st join retail.ubicaciones u on u.id = st.ubicacion_id
  left join retail.sububicaciones ss on ss.id = st.sububicacion_id where st.cantidad > 0),
t as (select sede, variante_id, sum(libre) filter (where tipo='piso_venta') as piso, sum(libre) filter (where tipo='almacen_tienda') as almacen from s group by 1,2)
select t.sede, sum(coalesce(t.piso,0)) colgadas, sum(coalesce(t.almacen,0)) guardadas, count(*) tallas,
  count(*) filter (where coalesce(t.piso,0)=0 and coalesce(t.almacen,0)>0) tallas_por_colgar,
  count(*) filter (where coalesce(t.piso,0) between 1 and 4) tallas_piso_1a4,
  count(*) filter (where coalesce(t.piso,0)>=5) tallas_piso_5omas,
  count(distinct v.producto_id) modelos, count(distinct (v.producto_id, v.color_codigo)) modelo_color
  -- + subconsultas por sede: prendas_danadas pendientes, apartados abiertos, prendas_por_regularizar pendientes y vencidas (> 2 días), bajadas_piso de hoy
from t join retail.variantes v on v.id = t.variante_id group by t.sede;
-- Resultado TRU: 155 colgadas · 653 guardadas · 538 tallas · 391 por colgar · 147 con 1–4 en el piso · 0 con 5 o más · 101 modelos · 418 modelo-color
--                0 dañadas · 0 apartados · 78 sin registrar (14 vencidas) · 12 bajadas hoy
-- AQP: 13 colgadas · 0 guardadas · 170 sin registrar (64 vencidas). LIM: 1 guardada.

-- Q2 · ¿Cabe «1 colgada por talla y color, solo tallas centrales» en los 600 lugares de TRU?
-- (variantes con stock libre en TRU, por su talla)
-- Resultado: 546 talla-color con stock · 539 en talla central (Estándar 224, S 86, M 83, L 69, Única 32, 30 16, 28 13, 32 10, S/M 6)
--            · 7 extremas (XL 2, 26 2, 34 2, XS 1) · 426 modelo-color.
```
