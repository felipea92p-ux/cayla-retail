# ADR-0551 · La orden de producción con cinco pasos, la orden «de antes» y las tres etapas de una prenda

- **Fecha:** 2026-10-27 · **Estado:** **PROPUESTO — solo este documento. Nada construido, ninguna migración, ningún dato tocado.** Dinero, stock y permisos
  esperan el OK de Felipe actividad por actividad (CLAUDE.md, «Reglas de ejecución»).
- **Número reservado (ADR-0381):** ADR-0551 (`pnpm reservar adr`, rama `claude/production-order-cleanup-tagging-567ea8`). Las migraciones se reservan
  al empezar cada actividad, no aquí.
- **Pide y decide:** Felipe, 2026-10-27. Mandó una hoja manuscrita «Prendas x Registrar» (Blusa Claudia y Chaleco CAYLA, con el costo de cada paso y de la tela y los
  avíos) y pidió cambiar los pasos de la orden. 23 preguntas en 6 rondas; lo de abajo marcado «**Felipe**» es suyo, lo marcado «**Arquitecto**» es una propuesta mía
  que él no ha visto, y lo de «Preguntas abiertas» espera su respuesta.
- **Cambia:** ADR-0400 act. (k) y (l) en lo que dice cuáles pasos son fijos. **Reabre en parte** D-31 (ver ADR-0547, que va por su propio carril).
- **Complementa:** ADR-0400 (fases, Salida y Vuelta, cierre al stock), ADR-0361 y ADR-0371 (el modelo que nace de la orden y su revisión), ADR-0509 (Nueva orden
  sobre la lista), ADR-0377 (familias fuera de los motores), ADR-0161/0306 (módulos y roles), ADR-0358 (una función, una pieza).

## El problema, medido en el repo y en producción (solo lectura, 2026-10-27)

1. **La base obliga siete pasos y la hoja de Felipe tiene cinco.** `20261019191000_produccion_fases_nuevas_expandir.sql` (:192-202) exige Ploteo, Corte,
   Habilitado, Costura, Limpiar hilos y revisar, Planchado y Etiquetar y embolsar (hint `fases_espina`), y rechaza `acabado` si se mezclan rutas. Una orden de cinco
   pasos **no se puede abrir**. Un paso que nadie del Taller marca, además, traba «Pasar al stock» (`fn_fases_de_orden` deriva «hecha» de lo anotado).
2. **Lo ya fabricado no tiene por dónde entrar.** Toda orden nace «hacia adelante»: avances y marcas llevan la hora en que se anotan (`produccion_avances.created_at`)
   y el cierre siempre mete una `entrada` en `movimientos` (`20261014160000_produccion_cierre_al_stock_y_costos_del_taller.sql`:242-243). El Chaleco CAYLA **ya está
   en tienda (66 prendas)** y hoy existe su OP-1 como lote de 57 en el Taller: cerrarla normal **duplicaría stock**.
3. **Una prenda con orden abierta no tiene una regla de visibilidad.** Hoy es un `producto` con variantes activas como cualquier otro: aparece en Catálogo ▸ Productos,
   en «en el catálogo, sin stock aquí» de Existencias (`existencias-catalogo-reglas.ts`:64), y la vitrina la puede dar por publicable (`fn_vitrina_por_que_no` no mira
   `producciones`). Vender no la ofrece solo porque no hay filas de `stock`: es **un accidente**, no una regla.
4. **Los datos para registrar lo hecho no están.** `insumos`, `insumo_lotes`, `comprobantes_produccion` y `produccion_insumos` tienen 0 filas; `proveedores_produccion` tiene 1
   (Multiplaza), faltan ploteo, corte, habilitado y ojal y botón; ningún gasto coincide con los montos de la hoja; hay 4 órdenes abiertas (OP-1 Chaleco lote de 57, OP-4
   Blusa Claudia muestra de 69, OP-2 y OP-3 muestras ajenas a la hoja). **Estas cifras envejecen: se vuelven a medir antes de actuar.**

## Las decisiones

### De Felipe (2026-10-27)

1. **Cinco pasos fijos:** Ploteo · Corte · Habilitado · Costura · Planchado. **«Limpiar hilos y revisar» y «Etiquetar y embolsar» pasan a opcionales, apagados y sin
   ofrecerse** (los hace la tienda; el planchado industrial es del Taller). La ruta anterior (Corte · Costura · Acabado) no se toca.
2. **«Ojales y botones» es un paso con proveedor, tras Costura, y nace prendido si la orden lleva botones.**
3. **Quién lo hace por defecto:** Ploteo y Corte nacen como **servicio**; los demás, en el **Taller**. Se puede cambiar hasta que el paso empiece, como hoy (ADR-0400, 3).
4. **El costo sigue al paso:** tarifa por prenda más un fijo por orden. Ya existe (`proveedor_tarifas`, `produccion_fases.tarifa_prenda` y `fijo_orden`); no se construye nada.
5. **Orden «de antes»:** una orden de algo ya fabricado se registra con sus pasos **hechos**, la **fecha real de cada paso** y el **consumo de la compra entera de cada insumo**.
6. **Lo que ya está en tienda no entra otra vez:** el Chaleco ya está en tienda; su orden **no mete stock** y su costo **se guarda solo en la orden**.
7. **Pago:** los servicios **nuevos** restan de **BCP Operativa** al registrar la Vuelta con «Pagado».
8. **Visibilidad en tres etapas.** Una prenda **en producción** no aparece en ningún lado; **terminada**, aparece en Existencias y Análisis; **al llegar a una tienda**, en Catálogo,
   Tienda web y Vender.
9. **El Taller simula un mayorista:** reabre D-31. Va en ADR-0547 y en una sesión propia; aquí solo se cita.

### Del arquitecto (propuesta; Felipe aún no la ha visto)

A. **Las rutas de pasos son tres ramas de UNA lista, no tres funciones.** La base ya acepta dos rutas (`fn_produccion_fases_normalizar`). La ruta nueva baja su mínimo de siete a
   cinco; Limpieza y Etiquetado siguen siendo claves válidas pero opcionales, igual que `ojales_botones`, `bordado`, `estampado` y `lavanderia`. Una orden ya abierta con siete
   pasos sigue válida: nadie reescribe filas, porque `produccion_fases` ya es lo que la orden tiene.

B. **«De antes» es un modo de la orden, no otra tabla.** Una marca en `producciones` (`registro_retroactivo`) y una **fecha real por paso** en `produccion_fases`
   (`fecha_real`, nula en toda orden normal). La orden «de antes» se abre por una función propia, **solo del líder** (`fn_es_lider()`), que escribe los avances y marcas de todos
   los pasos en **una transacción**: o queda la orden completa, o no queda nada. No se inventa un camino paralelo de avances. Una orden **ya abierta** (OP-1, OP-4) se convierte
   con una función hermana que solo agrega lo que falta y nunca reescribe un avance (pregunta 4).

C. **«Ya estaba en stock» es una forma de cerrar, no un estado nuevo de la orden.** `producciones.estado` sigue siendo `en_proceso · terminada · anulada`; se agrega **cómo
   terminó** (`ingreso_al_stock`: `movimiento` o `ya_estaba`). Con `ya_estaba`, el cierre guarda el costo en la orden y **no escribe en `movimientos` ni toca
   `variantes.costo`**. Es la única forma de que el principio 4 siga entero (todo el stock nace de un movimiento) sin duplicar lo que ya hay.

D. **La etapa de una prenda se deriva, no se guarda** (principio 4: una fuente de verdad). Una función de lectura `fn_producto_etapa(producto_id)` responde
   `en_produccion · terminada · en_tienda · null`:
   - **`null` para todo modelo que nunca tuvo una orden** — así lo que hoy se ve (los ~160 modelos aprobados) **no cambia**. El radio de la regla son solo los modelos del Taller.
   - **El stock manda sobre la orden:** si hay stock en una tienda, es `en_tienda` aunque haya una orden abierta (es el caso del Chaleco, 66 en tienda y OP-1 abierta).
   - `en_produccion`: orden `en_proceso` y stock 0 en todas partes · `terminada`: stock solo en el Taller.
   Todas las pantallas preguntan **esa** función (como ya hacen con `fn_categoria_entra_a_motores`, ADR-0377); ninguna repite la regla. Es una sesión aparte (decisión 8).

E. **Los datos primero, las funciones después.** Antes de registrar la Blusa y el Chaleco hay que cargar proveedores y los insumos con `retail.recibir_insumo` y
   `p_origen = 'saldo_inicial'` (sin pago). Esa carga es dato, no esquema, y no se versiona (el repo es público).

## Plan (actividades; una por commit; `/construir`)

0. **Solo lectura del estado de producción.** HECHA el 2026-10-27 (su resultado está arriba, «El problema»). Este ADR es su entrega.
1. **Bajar los pasos de 7 a 5.** Migración propia en partes (CLAUDE.md, «Políticas y deadlocks»): `fn_produccion_fases_normalizar` y la lista de la web. **Con el OK de Felipe.**
2. **Orden «de antes».** Función propia solo del líder, `fecha_real` por paso y la marca de la orden. **Con el OK de Felipe** (toca el costo y el libro de insumos).
3. **Cierre «ya estaba en stock».** `cerrar_produccion` sin movimiento. **Toca stock y dinero: OK explícito.**
4. **Pago automático desde BCP Operativa** al registrar la Vuelta con «Pagado». **Toca dinero: OK explícito.**
5. **Registrar la Blusa Claudia y el Chaleco CAYLA**, con los datos cargados. Depende de la 1, 2, 3 y de E.

Sesiones aparte (no se construyen aquí): **la visibilidad en tres etapas** (decisión 8 y D) y **el Taller como mayorista** (ADR-0547).

## DECIDÍ

Bajar el mínimo de pasos a cinco **sin tocar las órdenes ya abiertas**, registrar lo ya hecho con una **orden «de antes»** hecha por una función propia del líder, y que lo que ya
está en tienda cierre **sin movimiento** y con su costo solo en la orden. La visibilidad se **deriva de una función** y nunca de una columna.

## DESCARTÉ

- **Un estado nuevo `ya_en_stock` en `producciones.estado`:** mezcla «cómo terminó» con «en qué va», y cada pantalla que lee el estado tendría una rama más.
- **Guardar la etapa de la prenda como columna** (`productos.etapa`): dos fuentes de verdad que se desencuentran al primer traslado o al primer ajuste de stock; una prenda se
  quedaría «en producción» sin que nadie lo note.
- **Escribir las órdenes «de antes» a mano en la base:** no es repetible, no deja Actividad y se salta los candados de la orden (tope de lo disponible, un solo `quien`).
- **Quitar `limpieza_revision` y `etiquetado_embolsado` del catálogo de claves:** rompería cualquier orden abierta que ya las tenga y la tarifa que ya se pueda haber guardado.
  Se apagan, no se borran.
- **Que la web esconda la prenda y la base no:** ya pasó con `esProducible`, que solo decide qué se le ofrece a la líder en el Resumen. Vender, Existencias, Productos y la vitrina
  son cinco lecturas distintas; una regla repetida cinco veces se desfasa.

## SE ROMPE SI

- **Alguien ajusta el stock del Taller a mano** y hay una orden abierta: la prenda dejaría de ser `en_produccion` y reaparecería en pantallas que debían ignorarla. Por eso la etapa
  mira el stock y la orden juntos, y una prueba exige que Vender, la vitrina y Productos den la misma respuesta.
- **Se cierra OP-1 (el Chaleco) con el cierre normal** antes de la actividad 3: entran 57 prendas encima de las 66 que ya están. La orden no se cierra hasta que exista el cierre
  «ya estaba».
- **Se paga una orden «de antes»:** el saldo de un banco solo suma movimientos con fecha ≥ `saldo_desde` (BCP Operativa, Interbank Empresas e Interbank Operativa cuentan desde el
  27-oct; BCP Empresa desde el 25-sep). Un pago anotado con la fecha de hoy **sí** restaría de más. Regla: **una orden «de antes» nunca paga**; solo los servicios nuevos.
- **Se apaga un paso en una orden con avances ya anotados:** esa fase ya «empezó». Los pasos se apagan al abrir; después, no.
- **El Taller no tiene a quien le entregue la prenda con el visto de calidad:** hoy «Limpiar hilos y revisar» es donde alguien declara «buena» a la prenda (P-26 de
  `docs/investigacion/2026-10-16-ordenes-de-produccion-proceso-real/13-respuestas-de-felipe.md`). Si ese paso se apaga, la pregunta de quién da el visto queda sin responsable.

## Preguntas abiertas (de Felipe; ninguna se resuelve sola)

1. **RESUELTA (Felipe, 2026-10-27): el visto de calidad lo lleva Planchado.** Con Limpiar hilos y revisar apagado, el último paso del Taller declara «buena» a la prenda; las
   segundas y los faltantes se siguen anotando en la Vuelta del servicio, como hoy. Costo aceptado: quien plancha juzga una costura que no hizo, y una falla de costura se descubre tarde.
2. **ELEGIDA (Felipe, 2026-10-27), con una aclaración suya que manda: Catálogo ▸ Productos la muestra solo a quien edita el catálogo, con la insignia «En producción».** La decisión 8
   se mantiene para todos los demás: **Vender y la Tienda web nunca la muestran** (no es existencia de ninguna tienda) y el cliente no la ve. Se muestra en Catálogo para que quien edita
   pueda completar fotos y detalles (tejido, patrón, descripción) mientras se fabrica, y para que siga existiendo la cola «Por revisar» (ADR-0371). Las cantidades no se editan ahí: salen
   de la orden y entran al stock al cerrarla.
3. **RESUELTA (Felipe, 2026-10-27): «lleva ojales y botones» es un dato del modelo.** La primera orden pregunta «¿Lleva ojales y botones?», el modelo se acuerda y las siguientes nacen con
   el paso prendido (el mismo patrón de la tela y los avíos del modelo, ADR-0513). **Corrige mi propuesta anterior** («de los avíos del modelo»): en Insumos un botón es solo un avío
   (`insumos.tipo` es `tela` o `avio`, sin forma de distinguirlo), así que no se podía deducir. Costo aceptado: una columna aditiva en el modelo, en la actividad 1.
4. **RESUELTA (Felipe, 2026-10-27): OP-1 y OP-4 se convierten en «de antes», no se anulan** (mi recomendación era anular y registrar de nuevo; él eligió conservar su número y su historia).
   Cómo se hace sin romper lo que solo se agrega: la conversión **no reescribe ningún avance** (siguen con la hora en que se anotaron); agrega los avances y marcas que faltan para que cada paso
   quede `hecha` y pone la **fecha real en el paso** (`produccion_fases.fecha_real`), que es donde se lee la fecha, no en el avance. Es la función hermana de la que abre una orden «de antes»,
   solo del líder y en una transacción. **Antes de escribirla se mide** si OP-1 y OP-4 ya tienen avances, Salidas o Vueltas. **OP-2 y OP-3 (ajenas a la hoja) no se tocan.**
5. **Con qué ruta nacieron las 4 órdenes abiertas.** Si tienen siete pasos, la actividad 1 no las afecta; si tienen la ruta anterior, tampoco. Hay que medirlo antes de la 1.
6. **Pago desde BCP Operativa.** ¿En qué categoría de gasto cae, y la guía/factura del servicio queda como papel de Finanzas (ADR-0400, «el papel sigue como gasto») o se enlaza a la Vuelta?
7. **Fecha real y Actividad.** ¿Basta una fecha por paso, o también se quiere quién lo hizo en la fecha real? (Propuesta: solo la fecha, la firma es la de quien registra.)
8. **NUEVA (sale de la 4): el Chaleco no cuadra.** OP-1 es un lote de 57 y la tienda ya tiene 66. Al convertirla, ¿la orden dice 57 (lo que se anotó) o 66 (lo que hay)? La orden «de antes»
   no mete stock, pero su costo por prenda se divide entre las prendas buenas: 57 y 66 dan costos distintos. Es una decisión de dinero, tuya. Se mide primero cuántas hay de verdad.

## Cómo se verifica (lo que cada actividad debe demostrar antes de darse por terminada)

- **1:** abrir una orden con los cinco pasos y otra con los siete; la de cinco cierra al stock; una orden ya abierta con siete sigue funcionando; `fases_espina` ya no rechaza cinco.
- **2:** una orden «de antes» deja todos sus pasos `hecha` con sus fechas reales; si cualquier paso falla, no queda ni la orden (todo o nada); un colaborador no líder recibe `42501`.
- **3:** cerrar con `ya_estaba` no crea ni una fila en `movimientos` ni cambia `variantes.costo`; cerrar normal sigue igual (la suite `produccion_cierre.mjs` no cambia).
- **4:** pagar una Vuelta resta una sola vez de BCP Operativa; reintentar tras perder la red no paga dos veces (token); una orden «de antes» no paga.
- **Visibilidad:** un modelo sin órdenes sigue visible en todo; un modelo en producción no sale en Vender, vitrina ni Existencias de tienda; al cerrar entra a Existencias del Taller; al llegar a
  una tienda sale en Catálogo, Tienda web y Vender. **Concurrencia:** dos cierres a la vez de la misma orden dejan una sola entrada. **Caída externa:** si la lectura de la etapa falla,
  la pantalla muestra la prenda (nunca la esconde por no poder preguntar).
