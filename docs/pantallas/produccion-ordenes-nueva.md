# Pantalla — Nueva orden de producción (`/produccion/ordenes`, hoja «Nueva orden»)

> Modo: completo · Fecha: 2026-10-13 · Rol/sede: [líder] (admin) parado en el Taller, que es lo que muestran las dos capturas; la cuenta compartida del Taller ve la misma hoja **sin** curva de la red, sin margen y sin «¿alcanza la tela?» · Datos: **real** (producción: 0 órdenes) · Suposición declarada: la ruta se dedujo de las capturas (título «Nueva orden de producción» sobre el tablero «Órdenes de producción»), no la dio Felipe.
> SHA analizado: `1f8345e3a` (origin/main). Los archivos de la pantalla **no cambiaron** entre `bab35a233` y ese SHA (`git diff --stat`), así que lo que se leyó es lo que se ve en las capturas. Si esos archivos cambian después, este análisis está vencido.
> Archivos: `app/(app)/produccion/ordenes/page.tsx` · `app/(app)/produccion/layout.tsx` · `components/OrdenesTablero.tsx` · `components/NuevaOrdenProduccionForm.tsx` · `components/ModeloNuevoCampos.tsx` · `components/alta-producto/ElegirColores.tsx` · `components/motor-demanda/MotorEnProduccion.tsx` · `lib/produccion.ts` · `lib/modelo-nuevo-reglas.ts` · `lib/decision-produccion.ts` · `lib/produccion-decision-reglas.ts` · `lib/produccion-reglas.ts` · RPC `abrir_produccion`, `abrir_produccion_con_modelo_nuevo`, `cerrar_produccion`, `fn_costos_producciones` · tablas `producciones`, `produccion_lineas` (y `productos` / `variantes` cuando el modelo es nuevo)
> Otra sesión tocándola: **sí — la mía**. La rama `claude/optimal-registration-process-67a4ae` ya trae **A1 de ADR-0396** («el modelo primero») sobre esta misma hoja (commits `d6643217e` y `8b3f3589d`, sin PR). Y la rama `purchase-order-phase7` (Órdenes de insumos del Taller) toca el menú de Producción y los insumos. **Las tareas #6, #7, #8, #10, #11 y #12 de abajo son las actividades A1, A2, A3, A4/A4b, A6 y A5 del ADR-0396** (plan y maqueta en `docs/maquetas/produccion-nueva-orden-2026-10/`): este análisis las ordena contra el resto y agrega lo que ese plan no cubría (#1 a #5 y #9).

## 0 · Veredicto
Por dentro está bien hecha (una transacción, token idempotente, solo lectura por RLS, y la función de modelo nuevo ya endurecida en producción); por fuera es una columna de 2.000 px donde la prenda no aparece, y **Escape con trabajo escrito la deja invisible y congela la pantalla** (probado, #4). **Lo grave no es lo visible:** la hoja le pide dinero estimado a quien después no puede leerlo, y ese número —sin nadie que lo corrija— pasa a ser el costo real de las prendas.
**Cumple su finalidad:** 5/10 (el promedio de las seis es 5,2; tope 5 por el costo tecleado que se vuelve costo real, #1) · **Relevancia:** 6,4/10 — **Soporte**

## 1 · Finalidad declarada
"Esta pantalla existe para **decidir y registrar qué modelo fabrica el Taller, cuántas prendas de cada talla y color y para cuándo, con un costo ESTIMADO**, de modo que la corrida aparezca en el tablero, cuente como «ya se está fabricando» para las sugerencias y, al cerrarse, entre al stock con su costo real."
Fuente (no la captura): `docs/datos/modulos/10-produccion-del-taller.md` («ESTADO ACTUAL»), ADR-0133 (decisión 4 y D-31), ADR-0361, `docs/PLAN-PRODUCCION.md` (F2 y F5).
**¿Docs y pantalla coinciden? No del todo, y eso ya es hallazgo:**
- ADR-0133 decisión 4 y D-47 dicen que el costo de tela y avíos sale **del consumo real, no de un campo tecleado**; la hoja sigue pidiéndolo (concesión de F5, «hasta que el Taller cargue sus insumos»; hoy hay **0 insumos**). Manda lo escrito en la decisión; la pantalla está en deuda.
- ADR-0361 dice que la migración de «modelo nuevo» **falta pegar** en producción; **ya está** y con todas las salvaguardas del `/chaos` `[producción]`. Manda producción.
- `docs/PLAN-PRODUCCION.md` F7 da D-E (cotización de maquila) por descartada; ADR-0156 y la pantalla `/produccion/cotizaciones-maquila` existen. El módulo 10 se declara V1 en su encabezado. Mandan el código y producción.

## 2 · Objeción
**El costo que se teclea en esta hoja no es un estimado: es la semilla del costo real de cada prenda, y hoy nadie lo corrige.**
- `cerrar_produccion` guarda `coalesce(p_costo_tela, costo_tela)` (y lo mismo avíos y maquila): si al cerrar no se escribe un costo, **se queda el que se tecleó al abrir** `[código supabase/migrations/20260930121000_cerrar_produccion_costo_atipico.sql:101-103]` `[producción: la función viva lo hace, verificado 2026-10-13]`.
- Ese costo entra al promedio ponderado de `variantes.costo` (`fn_recalcular_costo_variante`, `:159`) y de ahí salen el margen, Finanzas y las decisiones de rebaja (D-31, D-45).
- La única red es la banda de «costo atípico» (`sin_costo`, `mayor_que_precio`, `sube`, `baja`; `:117-137`): un número **verosímil y equivocado** pasa sin que nadie lo vea. Y quien cierra sin ser líder manda `null` a propósito (PLAN F2: «el cierre manda `null` a quien no es líder»), de modo que **la cuenta del Taller cierra con lo tecleado**.
- Lo agrava que la base no le deja a esa cuenta ni leer el costo de vuelta (F4e, `fn_costos_producciones` es solo `fn_es_lider()`) `[producción]`: quien lo escribió no puede notar que está mal. Y con **0 insumos** `[producción]`, no hay consumo que lo reemplace (F3): el número tecleado es hoy la **única** fuente de costo del Taller.
- **El trade-off:** quitar el campo deja la orden sin margen previsto al abrirla. ADR-0396 (A4/A4b) lo resuelve mostrando un estimado con su procedencia y exigiendo confirmación cuando no hay consumo; mientras no se construya, #1 propone el candado mínimo en la base.

*(Segunda objeción, de comportamiento, **probada en el navegador el 2026-10-13**: con una cantidad escrita, Escape o un clic fuera muestran «¿Salir sin guardar?» **con la hoja ya cerrada**; «Seguir editando» no la devuelve y la pantalla deja de responder (los clics en «Abrir una orden» y en el menú no hacen nada) hasta recargar, y lo escrito se pierde. La hoja pasa su aviso por `onClose` y no por `antesDeCerrar`: el propio `Modal.tsx:28-32` documenta este defecto y su arreglo. Es la tarea #4. Tercera, la de forma: la prenda nunca aparece, 6 rojos contra un tope de 2, y con el scroll al final el pie fijo tapa el combo «Responsable»: tareas #8 y #12.)*

## 3 · Lo que está bien y no se toca
- **Una sola transacción y un token que no duplica:** `abrir_produccion` inserta cabecera y líneas juntas y deja el mismo token devolver la misma orden `[código 20260915130000_produccion_del_taller.sql:195-196, :215-228]`; `producciones_token_cliente_key` es `UNIQUE` `[producción]`. En el cliente, la marca síncrona `enVuelo` corta el segundo clic `[código NuevaOrdenProduccionForm.tsx:306-307, :371-372]`.
- **Nadie escribe directo:** RLS activo en `producciones` y `produccion_lineas`, con **solo** políticas `SELECT` (líder, o quien está asignado a esa ubicación); toda escritura pasa por funciones `security definer` con `search_path` fijo `[producción]`.
- **El modelo nuevo ya está endurecido en producción:** `abrir_produccion_con_modelo_nuevo` trae talla obligatoria, tope de precio, celda repetida, nombre casi igual y manejo de `NaN` `[producción: marcadores en la definición viva]`; crea modelo + variantes + orden en una transacción y con un token (ADR-0361).
- **El dinero del Taller está cerrado en la base:** las funciones de costos devuelven filas solo al líder `[producción]`.
- **Las palabras de dinero no se adivinan:** «12,50» se explica, no se acepta (Felipe 2026-10-10) `[código modelo-nuevo-reglas.ts]`.
- **La sugerencia no inventa:** usa las reglas de Inventario (`velocidadDeFila`, `calcularCobertura`) y sin ritmo medido no sugiere `[código produccion-decision-reglas.ts:91-130]`.
- **El margen se mide con el precio más bajo de cualquier tienda** (ADR-0370): la vara prudente `[código produccion-reglas.ts]`.
- **Tallas y colores solo del vocabulario** (nunca texto libre; la lección de V1): 46 categorías activas, **todas con tallas**, 95 colores `[producción]`.
- «Cancelar» con trabajo escrito sí pregunta y funciona `[código NuevaOrdenProduccionForm.tsx:243-245, :747]`. **Escape y clic fuera, no** (#4).

## 4 · Las seis dimensiones
| Dimensión | Puntaje | Hallazgo principal | Evidencia |
|---|---|---|---|
| Estética | 5 | 6 rojos (tope 2), borde doble, halo que desalinea «Nombre» y «Categoría», etiquetas de 11 px, ninguna prenda a la vista | `[visto]` capturas 1 y 2 · `/formidable` 2026-10-10: oficio 5, ley 5 = 4 |
| Lógica de negocio | 5 | El costo tecleado se vuelve costo real; «Precio a tienda (C/U)» dice una cosa y la barra otra; fecha de entrega sin validar; Tipo × Modelo es una matriz 2×2 donde 3 de 4 casos casi no ocurren | `[código]` · `[producción]` · ADR-0133 d.4, D-31, D-45, D-47 |
| Arquitectura | 7 | Bien: transacción, token, RLS, `search_path`. Mal: `abrir_produccion` no valida `NaN`, negativos (frase) ni tope de cantidad; la base no exige el módulo `produccion` | `[código]` · `[producción]` |
| Funciones | 5 | **«Seguir editando» no devuelve la hoja** (probado); «Usar ese modelo» sin botón si el modelo no está en la lista. Sobran: tres campos de costo abiertos, aviso azul, motor ×3 y tarjeta «¿alcanza?» sin datos. Faltan: «Ver la orden», «Producir esta muestra», plazo | `[probado en el navegador]` · `[código]` |
| Utilidad | 4 | Un Escape accidental con trabajo escrito congela la pantalla: una persona sin contexto no sabe cómo salir. La prueba ciega (Opus, como líder) la completó a la primera pero en 42 acciones, con 10 dudas y 6 palabras no entendidas; con colaboradoras reales: sin probar | `[probado]` · `docs/formidable/produccion-nueva-orden.md` |
| Conexión con el ERP | 5 | Recibe bien (Resumen, Nuevo producto) pero **no entrega**: una muestra terminada no lleva a producir, Movimientos no sabe de qué orden vino una entrada, cotización de maquila sin conectar | `[código]` · PLAN F8 |

### Estética (5)
- `[visto]` Dos filas de pestañas de igual peso arriba («PRODUCCIÓN | MUESTRA» y «YA EXISTE | MODELO NUEVO») que dicen jerga; con ellas y el aviso azul hay **8 controles y 6 bloques de texto antes de la tabla** (captura 1).
- `[visto]` El halo de «Nombre del modelo — Sigue aquí» queda más alto que «Categoría» y «Precio a tienda» arranca pegado debajo: la fila se ve torcida. «Colores» es el único título en negrita normal (los demás son versalitas) y dos frases suyas van en tono rojizo aunque nada es un error.
- `[visto]` Captura 2: el motor repite la misma frase tres veces (AQP, LIM, TRU) con jerga operativa; «¿Alcanza la tela y los avíos?» es una tarjeta entera para decir que no hay datos; con el scroll al final, el pie fijo tapa el combo «Responsable» (solo asoma «Eres admin…»).
- `[código NuevaOrdenProduccionForm.tsx:522-524]` la celda con cantidad se pinta `border-rojo/60 bg-rojo/5`: **un rojo por celda llena**. `/formidable` midió 6 visibles contra `MAX_ROJO_POR_PANTALLA = 2` (`design-tokens.ts`).
- `[código :513]` la matriz es una tabla a mano con `unificar-fijo` mientras Nuevo producto ya tiene `MatrizCantidades` (totales, «Llenar todas», celda rayada, color con identidad): lo que ADR-0358 prohíbe.
- Coherencia con CAYLA: solo tokens (la prueba de colores lo vigila), crema/tinta bien. **Es el mismo defecto de rojo que `compras-comprobantes` #5, `caja` #9 y `colaboradores` #6: es una tarea raíz del sistema (#12), no cuatro.**

### Lógica de negocio (5)
- **Costo tecleado → costo real** (la objeción; #1). `[código]` · `[producción]`.
- `[código ModeloNuevoCampos.tsx:141]` «Precio a tienda (c/u)» contra «se vende a» en la barra de abajo (`NuevaOrdenProduccionForm.tsx:695`): lo mismo con dos nombres, y «C/U» fue palabra no entendida en la prueba ciega.
- `[código]` `abrir_produccion` guarda cualquier `p_fecha_entrega` (`20260915130000:215-220`) `[producción: la definición viva no compara con `current_date`]`: en la captura 2 la fecha es la de hoy y no pasa nada.
- `[código 20260915130000:205-208]` el modelo se valida contra las variantes, **pero no que la variante siga activa**: una hoja abierta mucho rato podría abrir una orden sobre una talla desactivada (se entra al stock de una variante inactiva al cerrar). `[inferido]`, sin probar.
- Ninguna decisión escrita cubre «una muestra terminada se convierte en una orden de producción»: el ciclo Muestra → aprobación → Producción (R-29, `ETAPAS_MUESTRA`) existe en las etapas pero no en el sistema.
- Producción 0 órdenes, así que la **regla del tablero** («ya hay orden abierta» apaga la sugerencia del Resumen) nunca se ha ejercido con datos reales.

### Arquitectura (7)
- **Cadena:** `page.tsx` (lee `getOrdenesProduccion`, `getModelosProducibles`, `getInsumosDelTaller`, `getVocabularioModeloNuevo`; solo el líder suma `getPreciosDeLasTiendas` y `getDecisionProduccion`, `:54-74`) → `OrdenesTablero.tsx:276` → `NuevaOrdenProduccionForm.tsx` → `ModeloNuevoCampos` / `ElegirColores` / `MotorEnProduccion` → RPC.
- **Estados imposibles:** `cantidad_plan > 0`, `UNIQUE (produccion_id, variante_id)`, estado y `producciones_terminada_coherente`, `token_cliente UNIQUE` `[producción]`. **Lo que no impide:** los `CHECK (costo >= 0)` dejan pasar `NaN` (`NaN >= 0` es verdadero) y `abrir_produccion` no lo frena `[producción: sin manejo de NaN en la definición viva]` — la hermana nueva sí. La pantalla lo bloquea, la API no (#2).
- **Transacción:** `abrir_produccion` es una sola. **Concurrencia:** el token se consulta antes de insertar y sin bloqueo (`:195-196`): dos envíos simultáneos con el mismo token pasan los dos la consulta y el segundo choca con el `UNIQUE` y recibe un error en vez de la misma orden. No duplica (la base lo impide), pero el aviso del segundo es un error, no «ya estaba abierta» `[inferido]`.
- **Permiso:** la RPC pregunta `fn_puede_operar_ubicacion` y nada más (`:182`); **no exige el módulo `produccion`** `[producción: la definición viva no llama a `fn_ve_modulo`]`. Al revés, `produccion/layout.tsx:6` sí lo exige. Resultado `[producción]`: de las cuentas asignadas al Taller, **3 son «Integrante»** (sin el módulo: no ven la pantalla) y **1 es «Producción»** (la única que la ve): **la base deja pasar a quien el menú no deja entrar.**
- **Caída externa:** si la decisión de la red falla, la hoja avisa y abre igual (`decision-produccion.ts:72`); si no se leen tallas y colores, «Modelo nuevo» lo dice y el resto sigue; si no se leen los precios de las tiendas, el margen se mide con el de la grilla **en silencio** (backlog 2026-10-11). **Excepción real:** `page.tsx:73-74` hace `await getLineasPorRecibir(...)` **dentro de los argumentos** de `getDecisionProduccion`, fuera de su `try/catch` (`decision-produccion.ts:39,72`), y esa lectura usa `exigir` (lanza): si `fn_lineas_comprobantes_produccion` falla, **cae toda la página del líder**, pese al comentario «si falla, la orden se abre igual» `[código, verificado]`. *Para el resto se degrada así, no pierde este dato; para esta lectura no.*
- **Estados que la base no impide:** `getOrdenesProduccion` aplica `.limit(60)` a **todas** las órdenes, aunque su comentario dice que las en proceso «siempre vienen todas» (`produccion.ts:69-70` contra `:97`): con más de 60 órdenes más nuevas, una abierta antigua sale del tablero y de `enProduccionPorVariante`, y la curva sugiere fabricar de más `[código, verificado]`. Y el token **no está atado al contenido** (`abrir_produccion` `:195-196` devuelve la orden vieja sin comparar): si la respuesta se pierde, la persona corrige cantidades y reintenta con el mismo token, la base devuelve la orden **vieja** y la pantalla dice «abierta» con las cantidades nuevas `[código]`.
- **Definición viva distinta del archivo:** el cuerpo de `abrir_produccion` fue reescrito en producción por `20260923100000` y `20260923230000` (la firma del responsable, `fn_actor_persona_id`); el archivo `20260915130000` ya no coincide, y si alguien lo pega otra vez, revierte esa firma `[código]`. Toda corrección (#2) parte de la definición viva, no del archivo.
- **Volumen:** hoy 0 filas. Con 3 tiendas + 1 taller `[inferido]`: ≤ 10 órdenes al mes → ≤ ~360 en tres años y ~4.300 líneas: trivial. El costo real está en la **lectura**: para el líder, `page.tsx:73-74` espera `getDecisionProduccion` (una lectura de `fn_resumen_variantes`, de 24 kB, por cada ubicación, `decision-produccion.ts:46`) **antes de pintar el tablero**, aunque nadie abra la hoja. Sin medir; con 1.455 variantes es aceptable hoy `[inferido]`.

### Funciones (6)
- **Existen y funcionan** `[código]`: curva sugerida (`:253`), «Usar como costo estimado» (`:258`), «Cubrir N días», «Ver por qué», motor (comparación), alta de modelo nuevo con vocabulario, color nuevo, «Es otro modelo, crearlo igual», y «Cancelar» con aviso de salida. **Fantasmas parciales (2):** (1) «Seguir editando» del aviso de salida: el botón corre, pero la hoja ya se había cerrado, así que no hay a dónde volver **[probado en el navegador]**; (2) «Usar ese modelo» solo aparece si el modelo está en la lista cargada (`:728`): un modelo sin variantes activas, uno creado por otra sesión después de cargar la página, o uno de otra sede dejan el aviso **sin ninguna acción** `[código]`. Además, «Usar la sugerencia» y «Usar la del motor» **reemplazan todo lo tecleado** sin avisar (`:253-257`, `MotorEnProduccion.tsx:31-35`), y «+ Nuevo color» escribe el color en el catálogo **en el acto**, fuera de la transacción y del token de la orden, y queda aunque se cancele la orden (`NuevoColorAlta.tsx:117-119`) `[código, subagente; no verificado por mí]`.
- **Sobran:** los tres campos de costo para quien no puede leerlos; el aviso azul que explica lo que no se pide; el motor repetido por tienda; la tarjeta de insumos vacía.
- **Faltan:** «Ver la orden» tras abrir; «Producir este modelo» desde una muestra; plazo de entrega con atajos; saber que el modelo ya tiene una orden abierta; tercerizar al abrir.

### Utilidad (5)
Escenario: **una colaboradora nueva del Taller, una mañana de lunes, abre la primera corrida de un modelo que tienen en el catálogo.** Entra con la cuenta compartida del Taller. `[visto]`/`[código]`:
1. Abre «+ Nueva orden». Lo primero que lee son dos pares de pestañas: «Producción / Muestra» y «Ya existe / Modelo nuevo». Duda cuál es cuál (palabras no entendidas de la ciega: «Muestra», «corrida»).
2. Elige el modelo de un combo de 234, solo texto. No ve la prenda ni si ya hay una orden abierta del mismo modelo (puede abrir una segunda sin saberlo; el tablero lo permite).
3. Escribe cantidades en la tabla. No hay curva ni margen para ella (son del líder), y **le piden tela, avíos y maquila**: no sabe qué poner, no puede leer ningún costo, escribe un número o los deja en 0.
4. Pone la fecha. Nadie le dice que «hoy» no tiene sentido.
5. Abre la orden. Aparece un aviso y la hoja se cierra: no sabe dónde quedó ni cómo verla.
6. Si en el medio presiona Escape o toca fuera por error, ve «¿Salir sin guardar?» sobre un tablero vacío; elige «Seguir editando» y **no pasa nada**: el menú y los botones no responden. Recarga y pierde lo escrito `[probado]`.
**Dónde se equivoca: el paso 3 (dato que no puede leer) y el paso 6 (pantalla congelada).** Es del diseño, no de la capacitación: se le pide un dato que el propio sistema le niega después. **Medido** (ciega, Opus, como líder): completó en 42 acciones, 10 dudas, 6 palabras no entendidas, 1 error evitable; real con colaboradoras: **sin probar**.

### Conexión con el ERP (5)
Ver sección 6.

## 5 · Relevancia
| Criterio | Peso | Puntaje | Por qué (una línea) |
|---|---|---|---|
| Gestión (directo + indirecto) | ×2 | 8 | Directo: la curva y el margen ayudan a decidir cuánto fabricar. Indirecto, y es lo grande: de las órdenes salen «ya se está fabricando» (que apaga sugerencias del Resumen) y el costo real por prenda (D-31, «cuánto gana de verdad por prenda», R-41.1) |
| Dinero y stock que toca | ×1 | 7 | Compromete tela y maquila; el stock entra al cerrar y el costo se promedia en `variantes.costo` |
| Frecuencia y personas que la usan | ×1 | 3 | 0 órdenes hasta hoy; pocas al mes `[inferido]`; 4 cuentas asignadas al Taller, una sola con el módulo |
| Qué se detiene si falla | ×1 | 6 | Sin la hoja el Taller trabaja en papel: lo fabricado no entra al stock y la red no sabe qué viene; las tiendas siguen vendiendo |

Relevancia = (2·8 + 7 + 3 + 6) / 5 = **6,4 — Soporte**. Sube a Núcleo el día que el Taller opere de verdad con insumos cargados; hoy la limita que no tiene uso.

## 6 · Conexión con el ERP
- **Aguas arriba:** Resumen de Producción («Abrir orden sugerida» → `?nueva=<modelo>`), Análisis (`hrefComprar`), Nuevo producto (`?desde=produccion` y vuelta con `?nueva=`), el catálogo (variantes activas; `getModelosProducibles`), la red (`fn_resumen_variantes` por sede, solo líder), Insumos (rendimiento medido: 0 filas). Mal: **ninguna entrada trae el costo**; todo costo es tecleado.
- **Aguas abajo:** el tablero y `etapas` (`set_etapa_produccion`); `cerrar_produccion` (stock del Taller, `movimientos` con `produccion_id`, costo promedio) y de ahí Mover/Traslados («Llevarlas a las tiendas»), Inventario, Finanzas (Eficiencia: costo por prenda). Mal: **Movimientos no muestra de qué orden salió una entrada** (hueco F8, `fn_movimientos` no devuelve `produccion_id`); una **muestra terminada** no tiene salida.
- **Pájaro dueño y vecinos** (`AVIARIO.md`): **Gallito** (Producción del Taller: `producciones`, `produccion_lineas`, `insumos`, `insumo_lotes`, `comprobantes_produccion`…); vecinos: Inventario (stock, Movimientos), Catálogo (modelo y variantes; el modelo nuevo nace aquí), Compras (separada a propósito, D-H), Finanzas (Eficiencia, planilla de Dynamic).
- **Externos y qué pasa si caen:** esta hoja no llama a SUNAT, Culqi ni Shopify. Depende de la base y de Dynamic solo para la identidad. Si la base no responde: no se guarda nada (una transacción) y el aviso dice que **no se puede confirmar** si llegó a guardarse (`confirmarAntesDeRepetir`). *Se degrada así, no pierde este dato.*

## 7 · Las 12 tareas, por importancia
### #1 · [Corregir] Que un costo tecleado no se vuelva costo real sin que nadie lo confirme
- **Dónde:** `cerrar_produccion` (`supabase/migrations/20260930121000_cerrar_produccion_costo_atipico.sql:101-103` y la banda `:116-137`); `fn_costo_fuera_de_banda`; `NuevaOrdenProduccionForm.tsx:684-690` y `:710-713`; cierre de `OrdenPanel`.
- **Por qué en este puesto:** es dinero. Hoy el costo tecleado es la única fuente (0 insumos) y entra al promedio de `variantes.costo`. Si no se hace, el primer lote real fija un costo que nadie midió y el margen de esa prenda (y Finanzas) nace equivocado. Es la causa de tope 5.
- **Cómo lo verificas tú:** en local, abre una orden con tela 50, avíos 10 y 12 prendas; ciérrala como colaborador sin escribir costo y mira `variantes.costo` (hoy queda 5,00 sin avisar). Después del arreglo, ese mismo cierre debe pedir a un líder que confirme («costo sin medir») y dejarlo en la nota de la orden, como ya hace el «costo atípico».
- **Esfuerzo / dependencias:** M · ninguna; es **de Felipe** (dinero y RPC). Reutiliza el mecanismo existente: un motivo nuevo en `fn_costo_fuera_de_banda` («estimado sin confirmar» cuando no hubo consumo de insumos ni costo real al cerrar).
- **DECIDÍ:** el candado mínimo: reutilizar el «costo atípico» y exigir líder cuando el costo viene solo de lo tecleado al abrir. **DESCARTÉ:** quitar los campos de costo del todo, porque deja la orden sin margen previsto y Felipe pidió que el Taller y los líderes vean costos (ADR-0396). **SE ROMPE SI:** el Taller cierra una orden de noche sin líder disponible: la orden queda abierta y no entra al stock hasta que un líder la confirme; por eso A4b (que el Taller vea el costo) debe llegar antes o junto con esto.

### #2 · [Corregir] `abrir_produccion` con las mismas salvaguardas que su hermana nueva
- **Dónde:** `abrir_produccion` (`20260915130000_produccion_del_taller.sql:176-228`, más los reemplazos de `20260923100000_actor_firma_las_operaciones.sql`); compárese con `abrir_produccion_con_modelo_nuevo` (`20261010210000`, ya en producción).
- **Por qué en este puesto:** el `CHECK (costo >= 0)` deja pasar `NaN` y la función no lo frena; un `NaN` entra a `producciones` y de ahí a `variantes.costo` al cerrar `[inferido]`, sin probar con `ROLLBACK` (backlog 2026-10-10). La pantalla lo bloquea; cualquier llamada directa, no. También sin tope de cantidad por línea (`integer`; en modo «modelo que existe» la hoja lee `Math.floor(Number(...))`, así que «2.5» pasa a 2 y «1e9» pasa y revienta con error crudo, `NuevaOrdenProduccionForm.tsx:206`), nota ilimitada, fecha sin validar y `variante.activo` sin mirar. **Se parte de la definición viva** (reescrita por `20260923100000` y `20260923230000`), no del archivo.
- **Cómo lo verificas tú:** `pnpm pruebas:abrir-produccion-modelo-nuevo` y una prueba hermana que llame `abrir_produccion` con `'NaN'`, `-1`, `12.5` cantidad y una variante desactivada: cada una debe fallar **con una frase**, no con «violates check constraint».
- **Esfuerzo / dependencias:** S–M · es **núcleo** (principio 1): de Felipe. Mejor junto a #1. *(Aparte, decidir si el token se ata al contenido: hoy un reintento con cantidades corregidas devuelve la orden vieja; ver Arquitectura.)*

### #3 · [Corregir] Que la base y el menú digan lo mismo sobre quién opera el Taller
- **Dónde:** `abrir_produccion` `:182` (`fn_puede_operar_ubicacion`) contra `app/(app)/produccion/layout.tsx:6` (`exigirModulo("produccion")`); roles en producción.
- **Por qué en este puesto:** permiso sobre un registro que mueve stock. `[producción]` hay 3 cuentas «Integrante» asignadas al Taller sin el módulo (no ven la pantalla) y 1 «Producción» (la única que la ve); la base deja a las cuatro abrir y cerrar órdenes por la API. No es un agujero hacia afuera (siguen siendo del Taller), pero **el menú y la base contradicen lo que Felipe decidió en ADR-0161** («quien ve un módulo hace todo lo que hay en él») y no está escrito cuál manda.
- **Cómo lo verificas tú:** con una cuenta «Integrante» del Taller, llamar `abrir_produccion` por la API (hoy abre la orden); decidida la regla, debe responder con frase o abrirla, y la pantalla igual.
- **Esfuerzo / dependencias:** S · decisión de Felipe primero (¿lo opera cualquiera del Taller, o solo quien ve el módulo?). Mismo defecto de fondo que `caja` #1 y `compras-comprobantes` #1: **tarea raíz** «la base hace cumplir el módulo en las funciones que guardan».

### #4 · [Corregir] «¿Salir sin guardar?» que no congele la pantalla (Escape y clic fuera con trabajo escrito) — **✅ hecha el 2026-10-13**
- **Dónde:** `NuevaOrdenProduccionForm.tsx:403` (`<Modal … onClose={() => avisoSalida.pedirAccion(onClose)}>`; sin `antesDeCerrar`); `components/ui/Modal.tsx:28-32` y `:110-114` (`antesDeCerrar`). Mismo patrón en `RegistrarGastoModal.tsx:346` (Finanzas) `[código; no probado ahí]`. Ya lo hacen bien `GastoRapidoModal.tsx:321`, `IngresoRapidoModal.tsx:198`, `PanelTalla.tsx:565`, `PlanCategoriaModal.tsx:59` y `EditarCampanaModal.tsx:137`.
- **Por qué en este puesto:** es **trabajo perdido y pantalla congelada con una tecla común**. **Probado el 2026-10-13 en el ERP local:** elegir un modelo, escribir 12 en una celda, Escape → aparece «¿Salir sin guardar?» con la hoja **ya cerrada** detrás; «Seguir editando» la deja **invisible pero abierta** (en el DOM, `data-state="open"`, con el 12 intacto) y, como el diálogo sigue capturando la interacción, los clics en «Abrir una orden» y en el menú **no responden**: solo recargar sale, y se pierde lo escrito. `/chaos` NAV-04 y `/formidable` dieron esto por resuelto porque miraron que la pregunta apareciera, no que se pudiera seguir. Es la **misma falla que Plan de campaña arregló el 2026-10-10** (el comentario de `Modal.tsx` lo cuenta) y que esta hoja y «Registrar gasto» copiaron antes de ese arreglo: **una raíz, dos pantallas**.
- **Cómo lo verificas tú:** en local, abre la hoja, elige un modelo, escribe 12, pulsa Escape: debe preguntar **con la hoja a la vista**; «Seguir editando» la deja como estaba y el menú responde; «Salir sin guardar» cierra. Repetir con clic fuera y con «Registrar gasto». Y una prueba que falle si un `<Modal>` recibe `pedirAccion` por `onClose` (como `lib/hojas-escape.test.ts` hace con Escape).
- **Esfuerzo / dependencias:** S · ninguna. Es independiente y conviene hacerla **primero**, antes de A2 (también afecta la rama de ADR-0396: A1 no cambió esa línea).
### #5 · [Replantear] ¿El consumo de tela nace en la Muestra o se mide recién tras la primera orden cerrada?
- **Dónde:** D-D del PLAN (rendimiento medido), R-26 y R-27 de `15-COMO-OPERA-CAYLA.md`, `produccion-decision-reglas.ts:155` (`rendimientoMedido`), etapa «Escalado y ploteo» de la muestra.
- **Por qué en este puesto:** es la decisión que decide si «¿alcanza la tela?» y el costo estimado servirán **este año**. Con el rendimiento medido hace falta **una orden cerrada con insumos descontados por cada modelo**; hay **232 modelos** y 0 órdenes: cubrir el catálogo tardaría años. La **Estrategia alternativa** (sección 8) lo cambia de raíz. Es de Felipe: no se da por decidida.
- **Cómo lo verificas tú:** decidir A o B de la sección 8; si B, la primera orden de un modelo con consumo cargado muestra «alcanza» y costo por prenda **sin** una orden cerrada previa.
- **Esfuerzo / dependencias:** L (esquema) · después de #1 y de #10.
- **DECIDÍ:** pedirte la decisión y no construir nada. **DESCARTÉ:** importar Audaces directamente (ADR-0073 se borró y no hay un importador), porque es un proyecto aparte. **SE ROMPE SI:** se carga un consumo de patrón y nadie lo actualiza cuando cambia el molde: el estimado envejece como envejeció `bom_items`; por eso «lo medido gana» cuando existe.

### #6 · [Reconstruir] El modelo primero y el tipo deducido — *ADR-0396 A1, construida en la rama, sin PR*
- **Dónde:** `NuevaOrdenProduccionForm.tsx:405-468` (los dos `Segmentado` y el `CampoSelect`), `ModeloNuevoCampos.tsx` (aviso azul), `lib/orden-modelo-reglas.ts` (rama).
- **Por qué en este puesto:** es la causa de la mitad de las dudas de la prueba ciega y de «8 controles y 6 textos antes de la tabla»; cambia la primera pregunta de la hoja y no toca lo que se manda a la base.
- **Cómo lo verificas tú:** abrir «+ Nueva orden» con el ERP local (rama) y ver el buscador con prendas; escribir «falda», elegir con Enter y comprobar que el cursor cae en la primera celda; «Crear un modelo nuevo» arranca como Muestra. Hecho el 2026-10-13 (462 archivos y 158.700 pruebas en verde).
- **Esfuerzo / dependencias:** hecha (M) · va **antes** de #8.
- **DECIDÍ:** que el tipo se deduce del modelo y se corrige con un interruptor (Felipe, 2026-10-13). **DESCARTÉ:** una pregunta explícita arriba con tarjetas, porque Resumen ya contesta el modelo y el tipo en dos de tres entradas. **SE ROMPE SI:** alguien abre una **muestra** de un modelo que ya existe y no ve el interruptor: se abre un lote de producción y la orden entra al stock al cerrarla.

### #7 · [Eliminar/fusionar] Una sola tabla de cantidades — *ADR-0396 A2*
- **Dónde:** `NuevaOrdenProduccionForm.tsx:470-556` (la matriz a mano, `:513` `unificar-fijo`, `:522-524` rojo por celda) → molde de `components/alta-producto/MatrizCantidades.tsx`.
- **Por qué en este puesto:** quita el rojo por celda y la duplicación (ADR-0358); **es lo que se manda a la base**, así que es el riesgo de toda la reforma. Gana totales por fila, columna y general, «Llenar todas con», la celda rayada, teclado.
- **Cómo lo verificas tú:** la carga útil a `abrir_produccion` / `abrir_produccion_con_modelo_nuevo` es **idéntica** antes y después (prueba de paridad); `modelo-nuevo-reglas.test.ts` (55) en verde; Tab / Enter bajan.
- **Esfuerzo / dependencias:** M–L · antes de #8.
- **DECIDÍ:** reutilizar el molde de `MatrizCantidades`, no copiarlo. **DESCARTÉ:** arreglar solo el rojo de la celda, porque deja dos tablas distintas para lo mismo. **SE ROMPE SI:** la tabla reordena las líneas y una celda cae en la talla equivocada: por eso la prueba de paridad compara variante por variante.

### #8 · [Reconstruir] Hoja ancha de dos paneles con ficha viva de la prenda — *ADR-0396 A3*
- **Dónde:** `NuevaOrdenProduccionForm.tsx:403` (`<Modal ancho="max-w-2xl">`), `:744-759` (`pie-hoja-fijo`); ficha nueva a la derecha.
- **Por qué en este puesto:** la prenda nunca aparece (ley 5 = 4) y el pie fijo tapa el combo «Responsable». Es lo que más sube la comprensión sin tocar reglas; cabe sin scroll para un modelo existente a 1440 × 900 (maqueta, medido).
- **Cómo lo verificas tú:** a 1440 × 900 la tabla y «Abrir orden» se ven sin bajar; a 1024 × 768 la ficha sigue fija con el botón a la vista; sin ningún rojo.
- **Esfuerzo / dependencias:** M · después de #6 y de #7.
- **DECIDÍ:** ficha viva fija a la derecha, sin pie fijo. **DESCARTÉ:** pasos con puntos como Nuevo producto (ADR-0260), porque un lote de un modelo que ya existe tendría 2 de 4 pasos vacíos. **SE ROMPE SI:** se abre en una pantalla de 1024 px con el menú abierto: la ficha pasa a barra pegada abajo (no probado con el menú lateral abierto).

### #9 · [Corregir] Los callejones y las caídas que ya existen (y que la documentación diga lo que es)
- **Dónde:** `NuevaOrdenProduccionForm.tsx:728` («Usar ese modelo» solo si el modelo está en la lista), `produccion.ts:190` (`getModelosProducibles` descarta los modelos sin variantes activas), `ModeloNuevoCampos.tsx:67-69` (sin vocabulario), `NuevaOrdenProduccionForm.tsx:265, :271, :274-277` (cambiar de modelo, de modo o de categoría borra cantidades y reinicia tallas).
- **Por qué en este puesto:** no daña dinero pero **ya ocurre**: hay **2 modelos sin variantes activas** `[producción]`; si alguien intenta crear uno con ese nombre, la base responde «ya existe» y la hoja **no ofrece nada** (`/formidable`: «Ese modelo ya existe» sin botón). Y cambiar de categoría o de modo borra lo escrito sin avisar ni deshacer.
- **Cómo lo verificas tú:** crear un modelo nuevo con el nombre de uno de esos 2: debe ofrecer «Ver el modelo» o «Reactivar sus tallas», no un callejón; cambiar de categoría con cantidades escritas debe conservarlas donde la talla exista (o avisar).
- **Y lo que trajo la lectura del código** `[código]`: (a) `page.tsx:73-74` — si falla `fn_lineas_comprobantes_produccion`, **cae toda la página del líder** (el `await` está fuera del `try/catch` de la decisión); (b) `produccion.ts:97` — `.limit(60)` también recorta las órdenes **en proceso**, y la curva sugeriría fabricar de más; (c) la decisión y los modelos se leen al renderizar y no se refrescan: una orden abierta por otra sesión no entra en la curva (doble producción); (d) `getModelosProducibles` no filtra el estado del producto: un modelo rechazado o descontinuado se ofrece y la base lo acepta *(subagente; no verificado por mí)*; (e) si no hay modelos con variantes activas la hoja dice «Todavía no hay modelos» aunque haya 234.
- **Bajo valor / opcional, en el mismo PR:** corregir lo que ya engañó a este análisis dos veces: ADR-0361 («falta pegar» la migración que ya está en producción), `docs/PLAN-PRODUCCION.md` F7 (D-E «descartada» y ADR-0156 la construyó) y el encabezado V1 de `docs/datos/modulos/10-produccion-del-taller.md`. Verificable con `select proname from pg_proc where proname = 'abrir_produccion_con_modelo_nuevo'` (1 fila).
- **Esfuerzo / dependencias:** S–M · puede ir junto a #6.

### #10 · [Mejorar] El consejo cabe en una línea, y el costo estimado se ve para quien debe verlo — *ADR-0396 A4 y A4b*
- **Dónde:** `NuevaOrdenProduccionForm.tsx:561-633` (curva, ¿por qué?, motor), `:636-682` (insumos), `:684-703` (costos y resumen); `page.tsx:73-74` (la decisión se espera antes de pintar el tablero).
- **Por qué en este puesto:** hoy el consejo ocupa media pantalla incluso sin datos (el motor ×3 con jerga operativa, captura 2) y, para el Taller, el estimado ni se ve. A4b es la decisión de Felipe de que el Taller y los líderes **vean todos los costos** (reabre D-G): migración de permiso que pega Felipe. Además `getDecisionProduccion` bloquea el tablero del líder aunque no abra la hoja.
- **Cómo lo verificas tú:** sin datos de la red, la hoja no pinta ninguna tarjeta extra; con la cuenta del Taller aparece la línea «Costo estimado» (y, tras A4b, el estimado medido); medir el tiempo del tablero del líder antes y después de leer la decisión **al abrir la hoja**.
- **Esfuerzo / dependencias:** M (+ migración de permiso) · después de #1 (que decide qué hace el estimado) y de #6.

### #11 · [Conectar] Después de abrir: ver la orden, y producir lo que la muestra aprobó — *ADR-0396 A6*
- **Dónde:** `NuevaOrdenProduccionForm.tsx:343, :398` (aviso y cierre), `OrdenPanel.tsx:95` (`llevarUrl` solo para lotes), `fn_movimientos` (no devuelve `produccion_id`).
- **Por qué en este puesto:** cierra el único ciclo que el negocio hace y el sistema no conoce: Muestra → aprobación → Producción (R-29). Hoy una muestra terminada **no tiene salida**; y Movimientos muestra «Producción → Taller» sin decir de qué orden.
- **Cómo lo verificas tú:** terminar una muestra y ver «Producir este modelo» → abre la hoja con ese modelo y tipo lote; tras abrir una orden, «Ver la orden» la abre en el tablero con la tarjeta destacada.
- **Esfuerzo / dependencias:** S–M · después de #6.

### #12 · [Corregir] Palabras, rojo y oficio visual (una raíz, cuatro pantallas) — *ADR-0396 A5*
- **Dónde:** `NuevaOrdenProduccionForm.tsx:522-524`, `ModeloNuevoCampos.tsx:141, :157-160`, `Segmentado`; el presupuesto de rojo (`MAX_ROJO_POR_PANTALLA`).
- **Por qué en este puesto:** el rojo pasado de 2 aparece también en `compras-comprobantes` #5, `caja` #9 y `colaboradores` #6: **es una raíz, no cuatro tareas**; las palabras («Precio a tienda (C/U)», «corrida», «Maquila» sin explicar) fueron lo que más dudó la ciega. Incluye plazos «1 semana · 2 semanas · 1 mes · otra fecha» y avisar si la fecha es pasada.
- **Cómo lo verificas tú:** contar los rojos visibles (hoy 6; debe ser ≤ 2); la ciega sin palabras no entendidas; `label-cayla` de 11 px es del sistema (no se cambia aquí, va a ADR).
- **Esfuerzo / dependencias:** S · con #8.

## 8 · Estrategia alternativa
**«El consumo nace en la Muestra y se hereda a cada lote»** (reemplaza a D-D como *fuente del arranque*, no como fuente de la verdad).
| | Hoy (rendimiento medido, D-D) | Alternativa (ficha de consumo por modelo y talla) |
|---|---|---|
| Cuándo hay «¿alcanza la tela?» y costo por prenda | Desde que el modelo tenga **una orden cerrada con insumos descontados** | Desde la **primera** orden: el consumo sale de la marcada de la muestra (R-26: el número de Audaces «ya existe y es exacto») |
| Cobertura del catálogo | 232 modelos × años de órdenes | Cada muestra que se aprueba deja su consumo |
| Cuánto cuesta construirla | Nada (ya está) | Esquema nuevo (consumo por modelo y talla, R-27) + que alguien lo cargue al cerrar «Escalado y ploteo» |
| Riesgo | Estimado vacío mucho tiempo | La receta que envejece (la razón por la que murió `bom_items`) |
**Ganas:** el estimado de costo existe desde el primer lote; el puente Muestra → Producción (#11) pasa a llevar algo concreto; usa el dato exacto en vez de una aproximación. **Pagas:** una tabla y un paso más al cerrar la muestra; contradice D-D («lo medido no miente; una receta manual envejece») y exige decidir qué manda cuando hay las dos (propongo: **lo medido gana**, el patrón solo cubre el arranque). **Decide Felipe.**

## 9 · Referentes de ERP y futuro
Filtro: ¿le sirve a 3 tiendas y 1 taller **hoy**? Lo que pasó el filtro ya está en el plan (A1–A6). Lo demás:
- **Katana MRP** *(verificado en su ayuda: [crear una orden](https://support.katanamrp.com/en/articles/5914365-creating-a-new-manufacturing-order), [disponibilidad](https://support.katanamrp.com/en/articles/5914374-ingredients-availability), [costos](https://support.katanamrp.com/en/articles/5914362-manufacturing-costs-for-products))*: el orden producto → cantidad → ¿alcanza? → fecha → costo; la disponibilidad de insumos como un **estado de una palabra**; el costo de una orden abierta como **estimado que se recalcula al terminar**. **Pasó el filtro** (ADR-0396 lo usa).
- **Futuro, no cuenta entre las 12:** (1) prioridad entre órdenes que reservan la misma tela (Katana) — con 0–10 órdenes al mes no hay competencia por tela; (2) una orden «a pedido» ligada a una venta (R-42: ya se vende por WhatsApp; sin canal en `movimientos` hoy); (3) **plan de corte y fardos con marcada, tendido y capas** y pago por prenda a destajo *(solo lo describe un proveedor de ERPNext, no es un estándar; no verificado)*: R-30 ya paga la maquila por prenda terminada; (4) *Odoo MRP: orden de fabricación desde una lista de materiales con disponibilidad de componentes — de memoria, no verificado.*

## 10 · Fuera de esta pantalla
**El Taller todavía no está cargado en el ERP, y sin eso ninguna mejora de esta hoja produce un costo real.** `[producción]` 0 insumos, 0 lotes, 0 proveedores de Producción, 0 comprobantes, 0 cotizaciones de maquila, 0 órdenes. La cadena que D-47 define como «la condición para que D-31 sea medición» —proveedor → comprobante → recibir → lote → consumo al cortar— **no ha corrido ni una vez**, así que «cuánto gana de verdad por prenda» (R-41.1) hoy no se puede contestar para nada de lo que fabrica el Taller. La hoja de «Nueva orden» es el último eslabón; el primero es cargar un proveedor de tela y una factura. Conviene una **primera corrida real acompañada** (con `/flujo-de-negocio`) antes de pulir más la pantalla.

## 11 · Líneas propuestas para el backlog
- [ ] `[pantalla:produccion-ordenes-nueva]` #1 Que un costo tecleado no se vuelva costo real sin confirmación (`cerrar_produccion`) — M · de Felipe
- [ ] `[pantalla:produccion-ordenes-nueva]` #2 `abrir_produccion` con las salvaguardas de la hermana nueva (NaN, negativos, tope, variante activa, definición viva) — S–M · núcleo, de Felipe
- [ ] `[pantalla:produccion-ordenes-nueva]` #3 Que la base y el menú coincidan en quién opera el Taller (raíz con caja y compras-comprobantes) — S · decisión de Felipe
- [x] `[pantalla:produccion-ordenes-nueva]` #4 «¿Salir sin guardar?» con la hoja a la vista: `antesDeCerrar` en Nueva orden y en Registrar gasto, y una prueba que lo vigile — hecha el 2026-10-13 (`lib/hojas-salida-sin-guardar.test.ts`; probada antes y después en el navegador, también en Registrar gasto)
- [ ] `[pantalla:produccion-ordenes-nueva]` #5 Decidir dónde nace el consumo de tela: muestra o primera orden cerrada — L · de Felipe
- [x] `[pantalla:produccion-ordenes-nueva]` #6 El modelo primero y el tipo deducido (ADR-0396 A1) — hecha en la rama, sin PR
- [ ] `[pantalla:produccion-ordenes-nueva]` #7 Una sola tabla de cantidades (ADR-0396 A2) — M–L
- [ ] `[pantalla:produccion-ordenes-nueva]` #8 Hoja ancha de dos paneles con ficha viva (ADR-0396 A3) — M
- [ ] `[pantalla:produccion-ordenes-nueva]` #9 Callejones y caídas: página del líder que cae si falla una lectura, límite de 60, «Usar ese modelo» sin botón, docs vencidos — S–M
- [ ] `[pantalla:produccion-ordenes-nueva]` #10 Consejo en una línea y costo estimado visible para el Taller y los líderes (A4 y A4b) — M + migración
- [ ] `[pantalla:produccion-ordenes-nueva]` #11 Después de abrir: «Ver la orden» y «Producir este modelo» (A6) — S–M
- [ ] `[pantalla:produccion-ordenes-nueva]` #12 Palabras, rojo y oficio visual (A5; raíz con compras-comprobantes, caja y colaboradores) — S

## Inventario de elementos
| Zona | Elemento | Qué hace | Veredicto | Evidencia |
|---|---|---|---|---|
| Cabecera | Título «Nueva orden de producción» pegado al primer rótulo | Nombra la hoja | ajustar (aire, ficha) | `[visto]` captura 1 |
| Tipo | Pestañas «Producción / Muestra» | Elige el tipo | **sobra** como pregunta (se deduce) | `[código :406-414]` |
| Modelo | Pestañas «Ya existe / Modelo nuevo» | Elige el modo | **sobra** (buscar y «Crear…») | `[código :415-430]` |
| Modelo | Combo de modelos (solo texto) | Elige un modelo del catálogo | ajustar (buscador con prenda) | `[código :458-466]` |
| Modelo nuevo | Aviso azul de 3 líneas | Explica lo que se crea y lo que no | **sobra** | `[visto]` · `[código ModeloNuevoCampos.tsx:79-93]` |
| Modelo nuevo | Nombre, Categoría, Precio, Tallas | Arman el modelo | bien (ajustar rótulo «Precio a tienda (C/U)») | `[código :141]` |
| Modelo nuevo | Colores: buscador, «Ver los 95», «+ Nuevo color» | Elige colores del vocabulario | ajustar (se agregan desde la tabla) | `[código ElegirColores.tsx]` |
| Cantidades | Tabla color × talla a mano | Cuántas por celda | **ajustar** (una sola tabla; sin rojo por celda) | `[código :470-556]` |
| Consejo (líder) | «Curva sugerida por la red» + Cubrir N días + Usar la sugerencia | Propone cantidades | bien, ajustar a una línea | `[código :561-633]` |
| Consejo (líder) | «Lo que dice el motor de demanda» | Segunda opinión, por tienda | **ajustar** (una frase por causa) | `[visto]` captura 2 |
| Consejo (líder) | «¿Alcanza la tela y los avíos?» | Estado de insumos | ajustar (solo con medida) | `[código :636-682]` |
| Costos | Tela / Avíos / Maquila | Costo estimado de la corrida | **sobra para el Taller; plegar para el líder** | `[código :684-690]` · #1 |
| Resumen | «N prendas · costo estimado · se vende a · S/ x / prenda» | Cuenta y margen (líder) | bien | `[código :692-703]` |
| Entrega | Fecha y Nota | Para cuándo y qué | ajustar (plazos, aviso de fecha pasada) | `[código :714-717]` |
| Cierre | Combo Responsable | Quién abre (ADR-0162) | bien; ajustar (el pie lo tapa) | `[visto]` captura 2 |
| Cierre | Falta: … + frase | Guía de foco | bien | `[código :744-759]` |
| Salida | «¿Salir sin guardar?» (Escape, clic fuera, Cancelar) | Pregunta antes de perder lo escrito | **falla** (con Escape y clic fuera la hoja ya se cerró y «Seguir editando» no la devuelve; con «Cancelar» sí funciona) | `[probado]` · `[código :403]` · #4 |
| Cierre | Cancelar / Abrir orden · Crear y abrir orden | Guarda | bien | `[código :347-400, :295-345]` |

## Mapa del código, de la base y de producción (resumen de evidencias)
- **UI:** `layout.tsx:6` exige el módulo `produccion`; `page.tsx:54` define `esLider = persona.rol === "lider"` y de él cuelgan `conCostos`, `getPreciosDeLasTiendas` (`:67`) y `getDecisionProduccion` (`:73-74`); `OrdenesTablero.tsx:276` monta la hoja; el formulario es `NuevaOrdenProduccionForm.tsx` (765 líneas).
- **Escritura:** `abrir_produccion` (10 parámetros, `security definer`, `search_path` fijo) y `abrir_produccion_con_modelo_nuevo` (13 parámetros), ambas vivas en producción; al cerrar, `cerrar_produccion` con `p_confirma_costo_atipico`.
- **Producción (solo lectura, 2026-10-13):** `producciones` 0 filas; `insumos`, `insumo_lotes`, `movimientos_insumo`, `cotizaciones_maquila`, `comprobantes_produccion`, `proveedores_produccion`: 0; 234 modelos (2 sin variantes activas), 1.455 variantes (1 activa en precio 0), 46 categorías activas (todas con tallas), 95 colores; 14 líderes; cuentas asignadas al Taller: 3 «Integrante» y 1 «Producción».
- **Subagente de código (Explore, terminó después del primer borrador):** confirmó la cadena y las dos RPC; sus hallazgos nuevos están incorporados **solo los que verifiqué yo contra el código** (`page.tsx:73-74`, `produccion.ts:69-97`, `Modal.tsx:28-32`, el cuerpo de `abrir_produccion`) y uno que probé en el navegador (Escape). Los que no verifiqué van marcados «subagente; no verificado por mí».
- *Consulta de la plantilla corrida por la conexión de solo lectura a producción (A2, D1–D3, E1–E2 y las de volumen y roles) en lugar de pedirle a Felipe que la pegue; el SQL es el de `plantilla-sql.md` con `<TABLAS> = 'producciones','produccion_lineas'`. Sin datos personales.*

## Historial
| Fecha | Modo | Cumplimiento | Relevancia | Tareas cerradas de las 12 anteriores |
|---|---|---|---|---|
| 2026-10-13 | completo | 5/10 | 6,4 (Soporte) | — (primer análisis; #6 ya está hecha en la rama) |
