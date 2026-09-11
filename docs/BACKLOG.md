# BACKLOG VIVO — CAYLA Retail

> Lo mantiene Claude. Se actualiza al cierre de cada sesión/paso. Máx. 3 ítems por
> cubo — un décimo ítem no es señal de ambición, es señal de que no se está cerrando.

**Auditoría completa 2026-09-03.** BITACORA.md y este archivo llevaban congelados
desde el 19-20 de julio, pero el repo tiene commits reales hasta el 23 de julio —
incluida una fase entera de "Unificación" (9 pasos + fixes) sin documentar en
ningún lado. Se cierra esa brecha aquí. Ver el hallazgo #1 de ARREGLAR: es el más
importante que ha entrado a este archivo desde que existe.

## 🔨 CONSTRUIR (lo que no existe y desbloquea)

- [ ] **Apartado C, columna «Caja de tienda» — análisis hecho el 2026-09-11; el menú
      espera la elección de Felipe.** `docs/ESTANDAR-CAJA-DE-TIENDA.md` (artefacto «El
      estándar de la caja»): los siete sistemas con caja real (Shopify, Lightspeed, Square,
      Loyverse, Bsale, INVY, Odoo) verificados en su documentación oficial y contrastados
      contra el repo archivo por archivo. Doce mecanismos en la tabla del estándar; los que
      faltan del todo: pago dividido + vuelto, descuento con motivo y permiso, clienta y
      comprobante EN la venta, cambio/devolución desde la venta original, recibo, apartado.
      Cuatro son **decisiones de negocio antes que de código** (descuento: hasta cuánto la
      Encargada; comprobante: ¿emite la Encargada?; devolución: ¿a qué sede reingresa, dinero
      o vale?; apartado: ¿con seña, cuántos días?). Orden sugerido en §5 del doc, de menor a
      mayor superficie. **Siguen las otras seis columnas** (talla y color, almacenes y
      transferencias, fiscal, finanzas, IA, omnicanal), una por sesión, mismo método.
- [x] **Importador de catálogos de clientes con IA — CONSTRUIDO y verificado de
      punta a punta (ADR-0030, ADR-0035).** Excel, CSV, Google Sheets, PDF y foto
      entran por `/inventario/importar`; el modelo (`claude-haiku-4-5`, fijo)
      infiere qué es cada columna y de qué universal cuelga cada color o
      categoría nueva; `importar_catalogo` (0055) escribe todo en una
      transacción con stock en cero; `deshacer_importacion` descontinúa, nunca
      borra. Costos medidos: $0.006 el mapeo, $0.01 los valores, $0.0036 una
      foto de cuaderno. Verificado en el navegador con la sesión real y
      confirmado en la base. 178 tests.
      **Lo que falta para usarlo en producción:** pegar `0056` (y `0052` + su
      seed, si no se pegaron aún) con prefijo `retail.`. Y darle a *guardar* en
      **Inventario → Vocabulario** para anclar los 30 colores y 37 categorías de
      CAYLA — el examen ya corrió y aprobó; solo falta confirmar en pantalla
      (corregir a mano `Tops → Tops cortos deportivos` y decidir `Fucsia →
      Púrpura` o `Rosa`).
      **Lo que queda fuera, dicho:** las prendas que CAYLA ya tiene no ganan
      atributos ricos (tejido, patrón) — `producto_atributos` existe pero el
      importador solo la llena para catálogos nuevos; llenarla para el catálogo
      actual es otro trabajo. Y el cron semanal para `revisar-version.mjs` no
      existe: se corre a mano cuando se quiera saber si hay versión nueva.

- [ ] **`0052` no está en producción.** Se aplicó y verificó solo contra el
      Postgres local. Pegarla en el SQL Editor de producción requiere el prefijo
      `retail.` (CLAUDE.md §"Cómo aplicar SQL a producción") y es un cambio de
      esquema en producción, o sea decisión de Felipe. El seed de la taxonomía
      (`supabase/seed-taxonomia/*.sql`, ~1.5 MB, gitignored) se regenera con
      `node scripts/taxonomia/cargar.mjs` y lleva su propio `set search_path`.

- [ ] **`gen-types`: ningún entorno tiene el esquema completo, así que ninguna
      regeneración sale bien sola — y ya son 3 parches a mano.**
      **CORRECCIÓN 2026-09-10:** este ítem decía que el script "apunta al proyecto
      viejo de retail". Es falso, y se corrige acá porque mandó a alguien a
      arreglar lo que no estaba roto. `--project-id vovjyyiafkxteijimpuy` **es**
      cayla-dynamic, o sea producción (comprobado con `list_projects`: los dos
      únicos proyectos vivos son `cayla-dynamic` y `Freewheel`). El script está
      bien; lo que está mal es que ningún entorno sirva como fuente única.
      Generar desde **local** borra `catalogo_con_stock`, `configuracion_empresa`,
      `sede_meta`, `sede_datos_fiscales`, `persona_actual` y `puede_operar_sede`.
      Generar desde **producción** borra los 5 tipos de taxonomía y las 2 columnas
      de anclaje (`0052` no está aplicada allá).
      Lo puesto a mano hasta hoy, ahora listado con fecha en la cabecera del
      propio `types.ts` —que no tenía ninguna, y ése es justo el mecanismo por el
      que un parche se pierde—: los 5 tipos de taxonomía + 2 columnas de anclaje
      (10-sep) y `ventas.token_cliente` + `registrar_venta.p_token` (10-sep).
      **La salida más corta es aplicar `0052` en producción**: con eso producción
      pasa a ser superconjunto de local y `gen-types` vuelve a ser fiable de un
      solo tiro. Es DDL en el proyecto compartido, o sea decisión de Felipe.


- [x] **`almacen interno`: aplicado y verificado en producción 2026-09-03 —
      backend completo, frontend adaptado, falta la prueba en vivo por Felipe.**
      "Recibir mercadería" era el único camino para crear un producto y no
      tenía a dónde escribir (la unificación nunca recreó las sedes-almacén
      TRU-ALM/AQP-ALM/LIM-ALM del retail original). Decisión: el almacén deja
      de ser una sede hermana — pasa a ser un contenedor `tipo='almacen'`
      dentro de la misma sede + tabla `retail.stock_almacen` aparte.
      `supabase/unificacion/12_almacen_interno.sql` pegado y verificado: 4
      contenedores (TRU/AQP/003/LIM, CCO sin ninguno — confirmado con
      `select` real). Las 3 funciones que reescribe (`fn_aplicar_movimiento`,
      `recalcular_stock`, `puede_operar_sede`) se verificaron byte por byte
      contra producción ANTES de pegar, no se asumieron. Frontend actualizado
      en 7 archivos (`inventario/recibir`, `RecibirLoteForm`,
      `inventario/almacen`, `AlmacenStockList`, `BajarATiendaModal`,
      `inventario` catálogo, `InventarioAgrupado`) — ya no buscan una sede
      `tipo='almacen'`, usan el contenedor de la propia sede. Tipos de
      `packages/database` regenerados contra el proyecto correcto
      (`--project-id` de cayla-DYNAMIC, `--schema retail`) — el script de
      `gen-types` en `package.json` sigue apuntando al proyecto viejo de
      retail y hay que corregirlo a mano la próxima vez (ver ítem de tipos
      abajo). **Sin decidir todavía:** si lo terminado del Taller (LIM) debe
      pasar por el almacén interno (con su propio "bajar a piso") o seguir
      directo al piso como hoy — su contenedor ya existe, pero
      `registrar_produccion`/`cerrar_produccion` no lo usan. Y "Devolver a
      almacén" (piso → almacén) quedó con su RPC (`retail.devolver_a_almacen`)
      pero sin conectar en el frontend — pregunta de UX abierta con Felipe
      (¿botón propio, o dentro de `MovimientoModal`?). **Falta lo único que
      de verdad lo cierra: que Felipe entre un producto real por la pantalla
      y confirme que aparece.**
- [x] **RESUELTO (verificado 2026-09-09: `npx tsc --noEmit` sale con exit 0 y
      `next build` compila las 28 rutas). Se arregló en algún momento entre el
      03-09 y hoy sin que nadie lo anotara — mismo patrón que el ítem de
      "no hay registro de qué corrió" de más abajo, pero en el código. Texto
      original abajo, como quedó registrado el 2026-09-03:**
      **`tipos de TypeScript`: regenerar contra el proyecto correcto sacó a la
      luz 30 errores en 14 archivos que nadie tocó hoy — deuda real, no
      ruido de esta sesión.** `retail.sedes`/`retail.personas` son VISTAS
      (join contra `public` de Dynamic) — Postgres no le garantiza a Supabase
      que sus columnas nunca sean nulas, así que el tipo real es
      `string | null` donde el proyecto viejo (con el que se generaban los
      tipos hasta hoy) decía `string`. Afecta `finanzas/*`, `produccion/page.tsx`,
      `producto/[varianteId]/page.tsx`, `layout.tsx`, `actions/sede.ts`,
      `api/export/inventario`, `PatrimonioEditor.tsx`, `lib/finanzas-nucleo.ts`,
      `lib/panel.ts`, `lib/persona.ts`, `lib/sedes.ts` — ninguno tocado en esta
      sesión. `next build` (sin `ignoreBuildErrors` en `next.config`) fallaría
      hoy con estos 30 errores. Necesita su propia sesión, revisando caso por
      caso si el `null` es real (¿puede una sede no tener código?) o si basta
      con filtrar/asegurar como se hizo en `inventario/page.tsx` esta sesión.
      Aparte: `packages/database/package.json` (`gen-types`) sigue apuntando al
      proyecto viejo de retail — corregirlo al de Dynamic + `--schema retail`
      para que esto no se repita.
      **CERRADO 2026-09-09.** Se regeneraron los tipos contra el proyecto
      correcto (`vovjyyiafkxteijimpuy`, `--schema retail`) al empezar
      `lib/conteo.ts`, que no compilaba porque los tipos no conocían `conteos`,
      `conteo_lineas`, `codigos_barras` ni `colores`. De los 30 errores quedaba
      **uno solo**: las otras sesiones limpiaron 29 hoy con la auditoría de
      lecturas. Era `api/lucode/emitir/route.ts:167`, mandando `null` a un
      parámetro que supabase-js tipa opcional (`string | undefined`) porque la
      función tiene default; se cambió a `undefined`, que deja a Postgres
      aplicar ese default. Y se corrigió el `gen-types` para que apunte al
      proyecto de Dynamic con `--schema retail`. `tsc --noEmit` limpio,
      `pnpm build` compila, 79 tests pasan.
- [ ] `catalogo real`: cargar los 300-900 SKUs físicos — el desbloqueador más grande
      que queda. **Cambió de estrategia el 2026-09-09: deja de ser captura gradual
      y pasa a ser un CENSO de una vez.** El plan de `PLAN-DE-TRABAJO.md` §5 ("es
      un ritmo, no un evento") llevaba dos meses sin moverse, y tiene un defecto
      que explica por qué: mientras el catálogo esté a medias, "stock dice 0" es
      ambiguo (¿se agotó, o nunca se capturó?), así que ninguna alerta ni clase
      ABC es confiable, nadie usa el sistema, y nadie lo llena. El censo rompe el
      círculo: desde el día X, 0 significa cero.
      **Decisiones de Felipe (2026-09-09):** solo el piso de las 3 tiendas (no la
      trastienda); costo por modelo, no por talla/color; código corto nuevo
      (`BLU-0042-AZM-M`); las Encargadas cuentan y Felipe aprueba al cerrar el
      conteo. Y el dato que más cambia el diseño: **casi todas las prendas ya
      traen código de barras de fábrica**, así que el censo escanea desde el
      minuto uno en vez de imprimir y pegar 900 etiquetas primero.
      Plan completo en `~/.claude/plans/analiza-el-modulo-de-cached-jellyfish.md`.
      **Avance:** bloques 0 y 1 hechos y verificados en local (ver los dos ítems de
      abajo). Faltan: colores (vocabulario cerrado), códigos + `codigos_barras`,
      conteos, y las pantallas de captura por matriz y de conteo.
      **Consecuencia operativa del alcance que hay que decirle al equipo:** como
      no se cuenta la trastienda, `stock_almacen` queda en 0 y "Bajar a tienda"
      va a fallar por stock insuficiente. Lo que baje de atrás entra como
      "Recibir", no como "Bajar a tienda".
- [x] **`almacen interno en el riel numerado` — hecho y verificado en local
      2026-09-09 (`0044_almacen_interno.sql`); falta pegar `unificacion/26` en
      producción.** `stock_almacen`, el contenedor `tipo='almacen'`,
      `bajar_a_piso` y `devolver_a_almacen` solo existían en producción desde el
      3-sep, así que `npx supabase db reset` dejaba una base local donde
      `catalogo.ts:47` consultaba una tabla inexistente. Y apareció la deriva
      inversa: `unificacion/12` reescribió `fn_aplicar_movimiento` partiendo de un
      cuerpo anterior a `0011` y **perdió `ultima_venta`** — en producción la
      columna existe y nadie la escribe, así que "Días sin venta" mide la edad de
      la variante desde que se creó y todo el catálogo aparece estancado para
      siempre. `unificacion/26_ultima_venta_en_aplicar_movimiento.sql` la restaura
      y hace backfill desde `movimientos`. **Pendiente de Felipe: pegar `26` en el
      SQL Editor de producción, ANTES que `27`.**
- [x] **`el ajuste lleva signo` — hecho y verificado en local 2026-09-09
      (`0045_ajuste_con_signo.sql`, ADR-0023); falta pegar `unificacion/27`.**
      Era imposible registrar un conteo MENOR a lo que dice el sistema: la rama
      `ajuste` proponía la fila con el delta y Postgres evalúa el CHECK sobre la
      fila propuesta — el mismo bug de ADR-0020, a cincuenta líneas de la función
      que ese ADR daba por segura. Y producción **nunca tuvo**
      `stock_cantidad_no_negativa`, así que allá no habría explotado: habría
      creado stock negativo en silencio. Se arregla con
      asegurar→bloquear→verificar→sumar bajo `for update`, y se ponen las tres
      redes que faltaban (`stock`, `stock_almacen`, y `movimientos.cantidad <> 0`
      con signo solo para el ajuste). **Pendiente de Felipe: correr el pre-flight
      de `unificacion/27` y LEERLO antes de aplicar** — si hay filas negativas o
      movimientos en cero, se miran una por una y se corrigen con movimientos,
      nunca borrando.
- [x] **`vocabulario cerrado de colores` — hecho y verificado en local 2026-09-09
      (`0046_colores.sql`, ADR-0024); falta pegar `unificacion/28`.** 29 colores
      aprobados por Felipe, con índice único sobre el nombre normalizado: la base
      rechaza "azul marino" si ya existe "Azul marino". Es la pieza con mayor
      costo de postergación del proyecto — unificar colores después del censo no
      es un `update` de texto, es fusionar variantes con stock e historial. NO se
      hizo tabla de tallas, a propósito: agregarla tarde es barato (no es FK de
      nada), agregar colores tarde es caro.
- [x] **`código corto + codigos_barras` — hecho y verificado en local 2026-09-09
      (`0047_codigos.sql`, ADR-0025); falta pegar `unificacion/29` DESPUÉS de la
      `28`.** `BLU-0042-AZM-M` al lado del SKU, que no se toca. El argumento no es
      estético: `EtiquetasGenerator` estira el Code 128 al ancho de la etiqueta,
      así que 40 caracteres dan 1.2 puntos por módulo a 300 dpi cuando la regla
      térmica es ≥3 — **ésa es la razón real de que la pistola a veces no lea**.
      Más `variantes_identidad_unica`, que impide que 4 personas creen la misma
      prenda 4 veces. Y `codigos_barras` (varios códigos → una prenda), que como
      casi todas las prendas ya traen código de fábrica convierte el censo en
      "escanear lo que está en la percha" en vez de "pegar 900 etiquetas primero";
      el backfill registra el `sku` viejo, así que las etiquetas ya impresas
      siguen funcionando. **Pendiente de Felipe: los TRES pre-flight de
      `unificacion/29`** (categorías que el archivo no conoce, variantes
      duplicadas, SKUs repetidos). Si el de duplicados devuelve filas, se resuelve
      una por una — nunca borrando.
- [x] **`sesiones de conteo` — hecho y verificado en local 2026-09-09
      (`0048_conteos.sql`, ADR-0027); falta pegar `unificacion/30` al final de la
      cola.** Dos tablas y siete RPC. Un conteo que puede crear prendas al vuelo
      es un censo; un censo sobre un catálogo cargado es un conteo — la misma
      operación, así que no hay código de "carga inicial" que se abandone.
      `cantidad_sistema` se congela AL CONTAR (si se vende algo entre contar y
      cerrar, la venta sobrevive; leyendo el sistema al cerrar se borraría).
      `ajuste` con signo en vez de un `tipo='conteo'` nuevo, porque
      `recalcular_stock` conoce cuatro tipos y un quinto quedaría excluido en
      silencio. **Verificado con una Encargada real:** abre, crea la prenda
      adoptando su código de fábrica, cuenta 4 — y al cerrar recibe "Solo un líder
      puede cerrar un conteo". El stock quedó en 0 hasta que el Líder cerró.
- [x] **CERRADO 2026-09-10 — `censo`: las pantallas.** El ítem estaba viejo: al auditarlo el
      2026-09-10 resultó que la proyección delgada (`getCatalogoParaConteo`, 6 columnas en
      vez de 1,1 MB) y la pantalla de conteo con pistola ya existían desde `ab479ba`.
      **Cerrado hoy: el cierre del conteo** — `/inventario/conteo/cerrar`, con la varianza
      valorizada en soles, el aviso de lo que nadie contó, y las dos decisiones de la Líder
      (cerrar / anular). Era el agujero que dejaba el módulo entero sin servir: la pantalla
      de conteo prometía "lo contado no entra al inventario hasta que la Líder cierra" y
      `cerrar_conteo` no estaba cableada en ninguna parte.
      **CERRADO TAMBIÉN el alta repetida, y no como se había planeado.** El backlog pedía una
      MATRIZ talla × color; al mirarlo de cerca se descartó y se hizo otra cosa, por dos
      razones. (1) `conteo_crear_variante` siempre termina llamando a `conteo_contar`, así que
      crear las 12 celdas de golpe metería 11 líneas «contadas: 0» al conteo — en el cierre eso
      significa «miré y no había», que es una afirmación, no un vacío. (2) El dolor real no era
      declarar 12 celdas: era que la segunda talla del mismo modelo pedía otra vez los siete
      campos. Se implementó **recordar el modelo**: la siguiente alta pide talla, color y
      cantidad, y nada más.
      **Y de paso destapó un defecto que el censo habría golpeado en la prenda nº 2:**
      `AltaEnConteo` nunca pasaba `p_producto_id`, así que declarar la talla M y después la L
      de la misma blusa creaba DOS productos con la misma referencia y dos códigos cortos
      distintos — y el código corto es lo que va impreso en la etiqueta y lo que agrupa el
      catálogo por modelo. Recordar el modelo es lo que lo impide.
      (Etiquetas en lote quedó fuera del alcance del censo: esa pantalla es de la sesión de QR.)
- [x] **CERRADO 2026-09-10 — LA `33` YA ESTÁ EN PRODUCCIÓN. No queda ninguna migración
      pendiente de pegar.** Aplicada desde la sesión a pedido de Felipe (autorización
      explícita: "aplícala tú"), y verificada en la misma base, no por suposición:
      `la_33_aplicada = true` buscando `v_color_id := nullif(trim(p_color_codigo)` en el
      cuerpo, **una sola firma viva** de 12 argumentos (no se creó sobrecarga, que era el
      riesgo del ADR-0009), e idéntica a la de local argumento por argumento.
      **Se corrió con `execute_sql`, NO con `apply_migration`, y el motivo importa:**
      `apply_migration` habría escrito una fila en `supabase_migrations.schema_migrations`
      del proyecto de Dynamic — el historial de ELLOS, no el nuestro —, y una versión
      fantasma ahí puede romperle el `db push` a quien mantenga Dynamic. `unificacion/`
      se pega, no se registra; eso es justo lo que dice CLAUDE.md.
      **Única divergencia, cosmética y anotada para que nadie la investigue después:** el
      comentario del arreglo quedó en producción sin las flechas `↓↓↓` del archivo del
      repo. El código es idéntico; el marcador que usan las auditorías es la línea de
      código, no el comentario. Texto original abajo:**
      **FALTA UNA SOLA, LA `33` — verificado contra producción 2026-09-10.** Inventario leído de la base y pasado por `migraciones:verificar`:
      la `27`, `28`, `29`, `30`, `31` y `32` **están aplicadas**. Comprobado objeto por
      objeto, no por documento: existen `colores` (30 filas, con `ARN` de la 32),
      `codigos_barras`, `codigos_correlativos`, `conteos`, `conteo_lineas`; hay **0
      funciones sobrecargadas** en `retail` (o sea la 31 corrió); y las 37 categorías
      están. **La única pendiente es `unificacion/33_conteo_color_vacio.sql`:**
      producción tiene todavía la `conteo_crear_variante` de la `30`, confirmado
      buscando `v_color_id := nullif(trim(p_color_codigo)` en el cuerpo de la función
      — no está. Es un `create or replace` de una sola función, con la MISMA firma de
      12 argumentos (no crea sobrecarga) y **no toca ni una fila**.
      **BLOQUEO DE ORDEN:** pegarla ANTES de desplegar la pantalla de conteo. Sin ella,
      crear una prenda al vuelo dejando el color vacío revienta — el formulario manda
      `''` y la versión vieja solo contempla `null`. Es exactamente el bug que `0051`
      arregló en local hoy.
      **Dos avisos que salieron del mismo barrido y NO bloquean:** (a) el verificador
      marca `unificacion/01_sedes.sql` como incompleto por `retail_sede_meta` — falsa
      alarma, la tabla vive en `retail.sede_meta`, se movió de schema en la
      unificación; (b) la sobrecarga de `fn_set_meta_cobertura` que reporta es de
      `public`, o sea de Dynamic, no nuestra. Texto original abajo:**
      **Pegar en producción `27` → `28` → `29` → `30`, en ese orden.** Estado real
      de producción **verificado contra la base el 2026-09-09** (no contra estos
      documentos, que decían otra cosa): la `25`, la `26` y la `31` **ya están
      aplicadas** — el encabezado de ADR-0020 decía que la 25 estaba pendiente
      cuando su propio cuerpo dice que se aplicó, y nadie había registrado que la
      26 ya se pegó. Faltan solo esas cuatro.
      Cada una depende de la anterior: la 29 arma el código de cada prenda con el
      código de color que crea la 28, y la 30 no puede registrar un conteo hacia
      abajo sin el ajuste con signo de la 27.
      **Los siete pre-flight se corrieron contra producción y dieron todos 0**
      (stock negativo, stock_almacen negativo, movimientos en cero, movimientos
      negativos que no son ajuste, categorías desconocidas, variantes duplicadas,
      SKU repetidos). Las 37 categorías calzan exactas con los prefijos de la 29.
      No hay nada que limpiar antes: se pueden pegar seguidas.
      Guía paso a paso con el SQL listo para copiar:
      `~/AppData/Local/Temp/.../scratchpad/falta-pegar.html`, publicada como
      artifact "Lo que falta pegar".
- [ ] **Dos colores escritos a mano que no calzan con los 29.** Los va a destapar
      la `28` en cuanto se pegue: **"Arena"** (3 variantes) y **"azul"** a secas
      (2 variantes) — 5 de las 19 variantes de producción. Arena es un color real
      del catálogo de CAYLA y probablemente convenga agregarlo (`ARN`, familia
      tierra); "azul" hay que decidir si es marino o claro. Mientras no tengan
      color resuelto, esas 5 variantes **no reciben código corto** — es
      deliberado (ADR-0025: el código no se inventa), y en cuanto se les asigne
      color, `retail.fn_asignar_codigo_variante` se los da.
- [x] **RESUELTO EN LOCAL 2026-09-10 — `recalcular_stock` ya no borra el `stock_minimo`.**
      `supabase/migrations/0053_stock_minimo_sobrevive.sql`: `and s.stock_minimo is null` en
      el `delete` del piso. Se decidió en vez de volver a diferirlo, con este criterio: la
      función reconstruye CANTIDADES desde `movimientos`, y `stock_minimo` no se deriva de
      movimientos — lo dice su propia cabecera —, así que no es suyo para borrarlo.
      **Reproducido y verificado en local, las dos mitades:** con el bug, una fila creada por
      `fijar_stock_minimo` sin movimientos pasaba de 1 a 0 al correr la función; con el
      arreglo sobrevive. Y una fila huérfana de verdad —sin movimientos Y sin mínimo— se
      sigue borrando, que es la mitad que se olvida al poner un guard.
      `stock_almacen` no lleva `stock_minimo`, así que su `delete` no se tocó.

- [x] **DESCARTADA 2026-09-10 — la sospecha del almacén era falsa, y lo que apareció en su
      lugar es más serio.** Se sospechó que `retail.recalcular_stock` en producción había
      perdido el bloque de `stock_almacen`, porque `unificacion/12` la define CON él y
      `unificacion/25` la redefine SIN ninguna mención, y por las fechas registradas el `25`
      parecía haber pisado último. **Medido contra la base: falso.** La función de producción
      conoce el almacén — `delete from retail.stock_almacen sa` está en su cuerpo. La
      evidencia de los archivos era buena y la conclusión equivocada: el orden real de
      aplicación no fue el que los archivos sugerían.

- [ ] **EL REPO NO DESCRIBE PRODUCCIÓN: hay un arreglo vivo allá que no existe en ningún
      archivo.** Encontrado el 2026-09-10 al medir lo de arriba. `retail.recalcular_stock` en
      producción **ya trae** el guard `where s.stock_minimo is null` en el `delete` del piso
      —el mismo arreglo que `0053` acaba de hacer en local— y con un comentario propio que
      empieza `-- guardar un stock_minimo configurado (fijar_stock_minimo crea la fila con`.
      Ese comentario **no está en ningún archivo de este repositorio** (verificado con `grep`
      sobre todo el árbol, no solo sobre `supabase/`), y su redacción no es la de `0053`.
      Alguien lo aplicó a mano en el SQL Editor y no quedó archivo.
      **Lo que significa, y es lo que hay que arreglar:** `npx supabase db reset` más la
      carpeta `unificacion/` NO reproduce lo que hay en producción. El repo dejó de ser la
      descripción del sistema para ser una descripción parcial, y no hay forma de saber
      cuántos parches más como éste hay vivos.
      **MEDIDO 2026-09-10: son DIEZ, no una.** Corrido el verificador con cuerpos contra la
      base de producción (lectura de catálogo vía el conector de Supabase), diez funciones de
      `retail` tienen un cuerpo que **no coincide con ningún archivo del repo**:
      `abrir_caja`, `cerrar_caja`, `registrar_venta`, `cerrar_produccion`,
      `set_etapa_produccion`, `recalcular_stock`, `es_lider`, `es_supervisor`,
      `puede_operar_sede`, y `catalogo_con_stock` —esta última ni siquiera existe como
      nombre en el repositorio—.

      **LA MÁS GRAVE, y es un candado de permisos.** Las tres funciones de
      `unificacion/03_candados.sql` están endurecidas en producción y no en el repo:

      | | repo | producción |
      |---|---|---|
      | `es_lider` | `select public.fn_rol_actual() = 'admin'` | `select coalesce(…, false)` |
      | `es_supervisor` | ídem sin coalesce | `coalesce(…, false)` |
      | `puede_operar_sede` | ídem sin coalesce | `coalesce(…, false)` en las dos ramas |

      No es cosmético. Sin el `coalesce`, si `fn_rol_actual()` devuelve NULL —sesión sin rol,
      usuario sin fila— la función devuelve NULL; y en un `if not es_lider() then raise`,
      `not null` **no es true**, así que la excepción NO se dispara y el candado se abre
      solo. Alguien lo encontró y lo parchó a mano en producción.
      **El riesgo vivo:** volver a pegar `03_candados.sql` —que es lo que haría cualquiera
      siguiendo el repo— **deshace ese endurecimiento en silencio**.

      **CERRADAS LAS TRES DE PERMISOS el 2026-09-10 — quedan 7.** Se corrigió
      `unificacion/03_candados.sql` en el archivo (para que un replay desde cero produzca el
      estado bueno y volver a pegarlo deje de deshacer el endurecimiento) y se agregó
      `unificacion/34_candados_no_null.sql` como paso suelto con fecha, para cualquier base
      que haya recibido la versión vieja. Producción no necesita correr nada: ya lo tenía.
      **Verificado con la propia herramienta:** el verificador pasó de 10 cuerpos sin archivo
      a 7, o sea que el repo ahora produce exactamente lo que producción tiene en esas tres.
      `mi_sede()` NO lleva `coalesce` a propósito: devuelve un uuid y ahí NULL es la
      respuesta correcta.
- [x] **RESUELTO Y VERIFICADO EN PRODUCCIÓN 2026-09-10 — vender volvió a funcionar.** Encontrado
      2026-09-10 comparando firmas entre entornos. Producción:
      `registrar_venta(p_caja_id, p_metodo_pago, p_items, p_nota text, p_token uuid default null)`
      — `p_nota` **sin default**. Local: `(…, p_nota text default null)`. Y
      `RegistrarVentaModal.tsx` llama con TRES parámetros nombrados. PostgREST resuelve por
      nombres, y con un obligatorio que nadie manda no hay candidata: «Could not find the
      function … in the schema cache». **La primera venta que alguien intente por la app en
      producción falla**, con la clienta enfrente. No se nota hoy porque nadie vende por ahí
      todavía — el catálogo real no está cargado.
      **Causa:** quien agregó `p_token` a mano —un buen arreglo, la venta idempotente que el
      repo no tiene— reescribió la firma y perdió el `default null` de `p_nota`. El costo
      exacto de parchar sin archivo: nadie revisó la firma contra lo que la app manda.
      **Aplicado con autorización explícita de Felipe** («pégalo tú»), con `execute_sql` y NO
      `apply_migration` —ese habría escrito una fila en el historial de migraciones de
      Dynamic, que no es el nuestro—. Archivo: `unificacion/35_registrar_venta_p_nota.sql`.
      **Verificado antes y después contra la base, no por suposición:** antes,
      `explain select retail.registrar_venta(p_caja_id => …, p_metodo_pago => …, p_items => …)`
      devolvía «function … does not exist»; después devuelve un plan. Una sola firma viva,
      con `p_nota text DEFAULT NULL::text`, y la idempotencia por token **intacta**
      (`conserva_idempotencia = true`). El verificador pasó de 5 cuerpos sin archivo a 4.

      **CERRADO 2026-09-10 — el repo describe producción: 49 de 50.** Se pusieron al día
      `unificacion/07` (el candado de `puede_operar_sede` en `abrir_caja` y `cerrar_caja`,
      con `is not true` para que un NULL no lo abra) y `unificacion/25` (cuerpo completo de
      `recalcular_stock`: candado de Líder, ruteo al almacén, traslado que cuenta como piso
      en ambas patas, y el guard de `stock_minimo`). Los cuerpos se trajeron desde la base
      con `pg_get_functiondef`, no transcritos a mano.
      Y los archivos que definen versiones viejas —`07` para `registrar_venta`, `08` y `12`
      para `recalcular_stock`— llevan ahora un aviso que dice cuál los redefine y que hay
      que pegar después. No se duplicó ningún cuerpo: dos fuentes de verdad de la misma
      función es exactamente cómo se llegó hasta acá.

      **QUEDA UNA, y es una decisión, no un arreglo: `catalogo_con_stock()`.** Existe en
      producción, no está en ningún archivo del repo, y **la app no la llama** — solo aparece
      en `packages/database/src/types.ts` porque `gen-types` la recogió. Las opciones son
      borrarla en producción (DDL en el proyecto compartido: lo decide Felipe) o escribirla
      en `unificacion/` si resulta que alguien la usa. Antes de borrar conviene mirar si
      Dynamic la llama desde su lado.

      **Faltan decidir, una por una, las restantes:** `abrir_caja`, `cerrar_caja`, `registrar_venta`,
      `recalcular_stock` y `catalogo_con_stock` — bajaron de 7 a 5 al dejar de contar como
      drift las diferencias de espaciado junto a la puntuación (`coalesce(x,0)` vs
      `coalesce(x, 0)`), que era estilo, no código.
      **Lo que ya se sabe de cada una, medido:** las tres primeras tienen en producción una
      validación de permiso —`if puede_operar_sede(...) is not true then raise`— que
      `unificacion/07` NO tiene, o sea que **volver a pegar ese archivo las desarma**, igual
      que pasaba con `03`. `registrar_venta` suma además la idempotencia por `p_token` y la
      columna `ventas.token_cliente`, que no está en ningún archivo. `recalcular_stock` suma
      candado de Líder, instrumentación con `get diagnostics`, y un arreglo real: cuenta los
      traslados como piso aunque traigan contenedor de almacén, sin el cual esa cantidad se
      duplicaba. `catalogo_con_stock` no existe en el repo y la app no la llama —solo aparece
      en los tipos generados—, así que es candidata a borrar, no a traer. Cuál se trae al repo y cuál es legítimamente propia de
      producción; elegir mal es peor que no elegir.

      **La herramienta ya lo detecta, desde el 2026-09-10.** `pnpm migraciones:verificar`
      compara ahora el CUERPO de cada función de `retail` contra todas las definiciones que
      el repo tenga de ese nombre, no solo su existencia (ADR-0026, ampliación). Probadas las
      dos alarmas a propósito. **Lo que falta es correrlo contra producción:** pegar
      `scripts/migraciones/inventario.sql` en el SQL Editor de Dynamic, guardar el resultado
      —vale el JSON copiado o el CSV descargado, el script acepta los dos— y correr
      `pnpm migraciones:verificar <archivo>`. Eso lista TODOS los parches a mano que haya
      vivos, no solo el que se encontró de casualidad.
      **Lo que NO es:** un problema de `0053`. Local sí tenía el bug —reproducido: la fila del
      mínimo pasaba de 1 a 0— y ahora local y producción coinciden. No hace falta gemelo.
- [ ] **`reemplazo total de Alegra` (antes "finanzas F3") — proyecto propio con
      plan de 8 fases aprobado (Fase 0.5 sumada después). Fase 0 CERRADA Y
      CONFIRMADA EN PRODUCCIÓN 2026-09-05; Fase 0.5 en construcción.** Felipe
      decidió reemplazar Alegra por completo (facturación + contabilidad +
      gastos + ingresos + resumen ejecutivo), no solo conectar SUNAT. Plan
      completo en `~/.claude/plans/cozy-gathering-nova.md`.
      **Corrección importante (ADR-0005, actualizado 2026-09-05):** el
      proveedor de transmisión SUNAT NO es Nubefact — es **Lucode**
      (`app.apisunat.pe`), con quien Felipe ya tenía relación comercial y
      credenciales de sandbox emitidas; más barato que Nubefact (S/30/mes vs
      S/70/mes al mismo volumen). El mecanismo es tercerización **PSE** (sí es
      término oficial SUNAT — la investigación original se equivocó en eso),
      no homologación OSE: CAYLA sigue como "SEE - Del Contribuyente" pero
      autoriza a Lucode a transmitir en su nombre. **Trámite pendiente, hace
      Felipe, no requiere código:** alta como PSE tercero en SUNAT SOL
      (RUCs GIOR TECHNOLOGY `20515809822` / VIDA SOFTWARE `20600337832`, fecha
      de inicio mañana o posterior — SUNAT no permite el mismo día). Mientras
      no se dé de alta, no se puede transmitir en producción aunque el código
      esté listo.
      **Fase 0 (ADR-0007) — verificada en producción:** `17_facturacion_completa.sql`
      pegado; confirmado con `pg_proc`/`information_schema.tables` que las 6
      funciones y las 3 tablas (`comprobantes`, `series_comprobantes`,
      `proformas`) existen. Proforma en tabla separada (nunca se "promociona"
      con UPDATE), NC/ND con referencia obligatoria a un comprobante aceptado
      (CHECK + trigger), `nota_debito` agregado.
      **Fase 1 (Lucode, ADR-0009) — construida y verificada en local, falta
      producción + credenciales:** `comprobantes.items jsonb` (con fallback
      genérico si `ComprobantesPanel.tsx` no manda desglose — el desglose real
      por SKU queda pendiente de conectar Facturación a `ventas`, decisión de
      UX de Felipe), adaptador `apps/web/lib/lucode.ts`, ruta
      `/api/lucode/emitir`, botón "Transmitir" visible en comprobantes
      pendiente/rechazado. Local: `0037_comprobantes_items.sql` +
      `0038_actualizar_transmision_comprobante.sql`. Producción:
      `supabase/unificacion/20_comprobantes_items.sql` +
      `21_actualizar_transmision_comprobante.sql` — **aplicadas en producción
      el 2026-09-08**, junto con `22_serie_numero_inicial.sql` (ver BITÁCORA
      de ese día; el texto de abajo quedó como se escribió el 05-09).
      **Pendiente, ambos bloquean la prueba real:** (1) ~~que Felipe pegue esas
      dos migraciones en el SQL Editor de producción~~ **hecho 2026-09-08**;
      (2) que Felipe ponga su
      `LUCODE_TOKEN` real en `.env.local` (`LUCODE_ENTORNO=sandbox`) — nunca en
      el chat. Sin eso el botón responde "sin_credenciales", sin riesgo de
      transmitir a medias. Independiente del código: el trámite SUNAT SOL de
      alta como PSE tercero (línea de arriba) sigue sin confirmarse hecho —
      bloquea sandbox→producción real aunque el código esté listo.
      **ACTUALIZACIÓN 2026-09-05 (noche) — transmitir a producción YA FUNCIONA,
      verificado con documentos reales.** Sandbox: boleta **B005-000001**
      (S/189.90) ACEPTADA con CDR. Producción: boleta **B004-000001** (TRU,
      S/1.00) transmitida y aceptada en cola por SUNAT (PENDIENTE, firmada, con
      PDF). El token de Lucode autentica igual en ambos ambientes. Tres cosas
      que esto deja pendientes: (1) **dar de baja B004-000001** desde el panel
      de Lucode (resumen diario de bajas, 7 días) — es un documento legal por
      una venta que no existió, y el sistema todavía no sabe anular; (2) al
      configurar la base definitiva, registrar la serie **B004 de TRU con
      próximo número 2** — ese correlativo ya está consumido ante SUNAT y
      arrancar en 1 hace que rechace todo por duplicado; (3) pegar
      `supabase/unificacion/22_serie_numero_inicial.sql`, que es lo que permite
      fijar ese próximo número (antes la serie siempre nacía en 1). Numeración
      acordada con Felipe: una serie por tienda — **TRU B004/F004, AQP B005/F005,
      LIM B006/F006**. Nota de seguridad: el `LUCODE_TOKEN` terminó pegado en el
      chat pese a la advertencia de arriba; conviene rotarlo desde el panel.
      **ACTUALIZACIÓN 2026-09-09 — la pantalla decía que SUNAT no estaba
      conectado.** El modal de emisión seguía con el texto de la Fase 0 ("el
      envío a SUNAT todavía no está conectado — ver SEE propio vs. OSE"), falso
      desde el 05-09 y apuntando a una decisión que ya no existe (es Lucode
      como PSE, ADR-0005). Corregido: ahora dice que Emitir reserva el número y
      que "Transmitir" es lo que lo manda. `ARQUITECTURA.md` repetía la misma
      afirmación y nunca había documentado `/api/lucode/emitir` ni
      `actualizar_transmision_comprobante` — agregados. El bloqueo real no era
      ese texto sino las variables de Lucode que faltan en Vercel (ítem propio
      más abajo, 2026-09-08).
      **PASO (a) HECHO 2026-09-09 — ADR-0015, el ambiente entra al comprobante.**
      `comprobantes.entorno_transmision` + `p_entorno` obligatorio en la RPC:
      un comprobante transmitido al sandbox ya no se guarda igual que uno real,
      y la pantalla lo dice ("Aceptado · prueba"). Cierra dos agujeros: el chip
      verde que no distinguía, y una nota de crédito real colgada de una boleta
      de prueba (`emitir_nota` solo exige que el original esté aceptado).
      **Falta correr el SQL:** `0040_comprobante_entorno_transmision.sql` en
      local (necesita Docker arriba) y `unificacion/23_...` en el SQL Editor de
      producción. Ojo al pegar: dropea la firma de 4 parámetros antes de crear
      la de 5, si se salta ese paso quedan dos sobrecargas.
      **Sigue (b):** variables de Lucode en Vercel — recomendado `LUCODE_TOKEN`
      en los tres ambientes pero `LUCODE_ENTORNO=produccion` SOLO en Production
      (sandbox en Preview y Development), para que ningún preview emita algo
      legal por accidente. **Sigue (c):** anulación dentro del sistema
      (`anularDocumentoLucode` ya existe en el adaptador, sin ruta ni botón, y
      la RPC rechaza `anulado` a propósito).
      **PASO (c) HECHO 2026-09-09 — ADR-0016, anulación dentro del sistema.**
      Ruta `/api/lucode/anular` + RPC `anular_comprobante` (solo líder, motivo
      obligatorio, `anulado_por`) + botón en la fila. Dos caminos según tipo,
      como exige SUNAT: `/api/v3/voided` para factura/notas,
      `/api/v3/daily-summary` con `accion_resumen: "anular"` para boletas
      (verificado en `docs.apisunat.pe/llms-full.txt`). "Anulado" solo se
      escribe con confirmación de SUNAT; si vuelve PENDIENTE la fila dice
      "Anulación en trámite". **Falta correr el SQL** (`0041_anular_comprobante.sql`
      local / `unificacion/24_...` producción) **y probar la llamada real en
      sandbox** — el nombre del campo `motivo` en /voided y la forma de la
      respuesta del resumen diario salen de la documentación, no de una
      respuesta real. Abierto: cerrar solo el ciclo de una anulación en trámite,
      y qué hacer con un correlativo reservado que nunca se transmitió.
      **Queda solo (b):** `LUCODE_TOKEN` y `LUCODE_ENTORNO` en Vercel —
      `produccion` SOLO en Production, `sandbox` en Preview y Development.
      **SQL DE (a) Y (c) CORRIDO Y PROBADO EN LOCAL 2026-09-09.** `db reset`:
      las 41 migraciones aplican en orden, las dos restricciones quedan
      `VALIDADO` y `actualizar_transmision_comprobante` tiene una sola firma
      (sin sobrecarga). Siete reglas probadas contra Postgres real. **Falta
      pegar en producción `unificacion/23_...` y `24_...`** (en ese orden; la
      24 depende de la 23), y probar la llamada real a Lucode en sandbox.
      **Hallazgo nuevo — el local de la app no es el local del repo:** corren
      dos stacks, `cayla-retail` (54421/54422) y `cayla-dynamic` (54321/54322),
      y `apps/web/.env.local` apunta al de Dynamic, cuyo schema `retail` no
      tiene `comprobantes`/`series_comprobantes`/`proformas`. Mientras siga
      así, ninguna pantalla de Facturación se puede verificar en navegador
      local. Decidir cuál de los dos es "el local" de este repo y dejarlo
      escrito — hoy `supabase db reset` administra uno y la app lee el otro.
      **CERRADO 2026-09-09 (final de la jornada):** ya no leen distinto —
      `apps/web/.env.local` dice `:54421` y el bundle que sirve el `:3000` vivo
      confirma `:54421`. "El local de este repo" es `cayla-retail`, escrito en el
      README y comprobable con `pnpm local:donde`.
      **(a) Y (c) EN PRODUCCIÓN 2026-09-09.** `unificacion/23` y `24` pegadas y
      verificadas: una sola firma de `actualizar_transmision_comprobante` (5
      args), las 6 columnas nuevas, `comprobantes_anulado_tiene_motivo` en
      VALIDADO. **Dos cosas quedan abiertas de esto:** (1)
      `comprobantes_transmitido_tiene_entorno` quedó NOT VALID porque
      producción tenía **B004-000002** (boleta S/10.00, aceptada 08-09, ambiente
      DESCONOCIDO) — mirar el panel de Lucode, escribir el ambiente real y
      recién ahí `validate constraint` (SQL exacto en ADR-0015); (2) la llamada
      real a Lucode de anulación sigue **sin probarse en sandbox**: el nombre
      del campo `motivo` en /voided y la forma de la respuesta del resumen
      diario salen de la documentación, no de una respuesta real.
      **Corrección al dato del backlog:** `retail.comprobantes` NO estaba vacía;
      la serie **B004 de TRU va por el número 3**, no el 2 que decía arriba.
      **(b1) HECHO 2026-09-09 — anulación PROBADA contra el sandbox real.**
      Encontró y corrigió dos bugs del adaptador que la documentación tapaba:
      ninguno de los dos endpoints acepta el cuerpo plano. Boleta va con
      `{documento:"resumen_diario", documentos_afectados:[…]}` y factura con
      `{documento:"comunicacion_baja", motivo, documento_afectado:{…}}`. Los dos
      devuelven PENDIENTE, así que "Anulación en trámite" es el camino normal
      de TODA anulación, no solo de boletas (ADR-0016).
      **BLOQUEO DE ORDEN, importante:** el deploy vivo llama a
      `actualizar_transmision_comprobante` con 4 argumentos y producción ya
      solo tiene la de 5. **No poner `LUCODE_TOKEN` en Vercel antes de
      desplegar el código**, o "Transmitir" mandaría el documento a SUNAT y
      fallaría al guardarlo. Orden: push → deploy → token.
      **Falta (b2):** `LUCODE_TOKEN` en Vercel, `LUCODE_ENTORNO=produccion` SOLO
      en Production y `sandbox` en Preview/Development.
      **Falta también:** cerrar el ciclo de una anulación en trámite
      (`consultarEstadoLucode` → promover a `anulado`); hoy queda en trámite
      hasta que alguien mire el panel de Lucode.
      **CICLO DE ANULACIÓN CERRADO 2026-09-09 — botón "Consultar".**
      `/api/lucode/consultar-anulacion` + botón en las filas en trámite:
      pregunta a Lucode y, solo si SUNAT confirmó, promueve a `anulado` con el
      motivo original. `interpretarEstadoAnulacion` es un lector propio porque
      Lucode usa un vocabulario aparte para la anulación (`ANULANDO`/`ANULADO`)
      y reusar el de emisión habría dejado toda baja en trámite para siempre.
      5 tests nuevos. **Falta desplegarlo** y apretar "Consultar" en
      B004-000003, que sigue en trámite desde las 11:58 del 09-09.
      **Sigue abierto:** `ANULADO` no se vio con los ojos todavía — solo
      `ANULANDO`. Confirmarlo cuando SUNAT cierre esa baja.
      **Fase 0.5 (tokens de diseño) — cerrada:** `packages/shared/src/
      design-tokens.ts` (espejo tipado de `globals.css`) y `TarjetaIndicador.tsx`
      construidos (dos sesiones paralelas llegaron al mismo archivo, byte por
      byte); radios corregidos a 0px en toda la app (brandbook pedía esquinas
      rectas, se habían desviado a 8-18px). `tsc` limpio.
      **Fase 2 (Egresos) — primera pantalla nueva construida y verificada en
      vivo:** `/finanzas/egresos` (antes no existía; los gastos solo se veían
      agregados dentro del EERR). Small multiples por sede (`TarjetaIndicador`
      × 5, siempre visibles), tabla de detalle con cifras tabulares. Probado en
      local (ADR-0010): un gasto de prueba en AQP solo movió esa tarjeta, las
      otras tres quedaron en S/0 — segmentación por sede real, no agregada. De
      paso: `RegistrarGastoModal`/`RegistrarGastoButton` nunca habían recibido
      el sistema de identidad CAYLA (usaban `bg-white`/`rounded-2xl` desde que
      se construyeron) — corregido; `METODOS_PAGO_GASTO` separado de
      `METODOS_PAGO` (mismo nombre, dos constraints reales distintos —
      `0013_finanzas_nucleo.sql` vs `0007_finanzas.sql`); `getGastos()` muerto
      en `lib/finanzas.ts` borrado (nadie lo llamaba). Falta: auto-sugerencia
      de categoría por texto (parte 2 de esta fase, no empezada).
      **Aparte, ya construido 2026-09-05 (ADR-0008):** verificación de cliente
      contra RENIEC/SUNAT antes de emitir (`packages/shared/src/documento.ts`,
      `apps/web/lib/padron.ts`, `ConsultaDocumento.tsx`) — encontró y corrigió
      2 bugs reales (middleware bloqueaba rutas de API, estado de tipo de
      documento desincronizado del tipo de comprobante).
      **Aparte, ya construido 2026-09-05:** `supabase/seed.sql` renombra
      `public`→`retail` después de migrar en local — el stack local nunca
      había podido correr con el mismo schema que producción hasta ahora.
      **Pendiente, sin bloquear el proyecto:** preguntarle al contador si
      CAYLA ya cruzó el umbral SIRE (75 UIT, ~S/412,500/año) — obligación
      distinta del PLE (300 UIT) que probablemente ya aplica hoy.
- [x] **LA RPC YA ESTÁ EN PRODUCCIÓN — verificado 2026-09-10.** `retail.crear_producto_con_variantes`
      existe con una sola firma, y la pantalla `/inventario/producto/nuevo` está
      desplegada. O sea que `unificacion/16` se pegó en algún momento y nadie lo anotó.
      **Lo único que queda de este item es manual y de Felipe:** crear un producto real
      con varias tallas/colores y confirmar que aparece en Catálogo. Texto original abajo:**
      **`crear_producto_con_variantes`: construido y verificado (build/lint,
      `next build` limpio) 2026-09-04 — falta que Felipe pegue la RPC en
      producción.** "Recibir mercadería" crea un `producto` nuevo por CADA
      ítem agregado con "+ Agregar prenda nueva": pedir la misma referencia
      varias veces (una por talla/color) dejaba varios productos duplicados
      en vez de un modelo con N variantes. Nueva pantalla
      `/inventario/producto/nuevo` (solo Líder): referencia + familia/
      categoría + chips de talla/color + matriz generada con precio/costo/
      SKU editable por fila → un solo INSERT a `productos` + N a `variantes`,
      sin tocar `stock`/`movimientos` (el modelo nace con 0 unidades hasta el
      primer lote real). Mismo patrón dual que `recibir_lote` (ADR-0004):
      versión local sin prefijo en `0033_crear_producto_variantes.sql`,
      versión schema-calificada para pegar en el SQL Editor de producción en
      `supabase/unificacion/16_crear_producto_variantes.sql`. **Pendiente:
      que Felipe pegue el archivo 16 en producción y cree un producto real
      (ej. varias tallas/colores) para confirmar que aparece en Catálogo** —
      cierra además la verificación que le faltaba a `almacen interno` de
      arriba ("que Felipe entre un producto real por la pantalla").
- [ ] **PROVEEDOR YA CONTRATADO — lo que queda es confirmar Vercel, 2026-09-10.**
      `apps/web/.env.local` tiene un `PADRON_TOKEN` real de `apisnetpe_v1`, así que la
      parte de "contratar" está hecha; y la BITÁCORA del 08-09 registra la consulta
      funcionando en producción (el fallo de ese día fue `apisnetpe` vs `apisnetpe_v1`,
      no falta de credencial). **Lo único abierto: confirmar que Vercel tenga
      `PADRON_PROVEEDOR=apisnetpe_v1` — con el `_v1`.** No pude verificarlo desde la
      sesión: el conector de Vercel devuelve 403 y hay que reautenticar el scope "cayla".
      Se comprueba en un segundo emitiendo en producción y escribiendo un DNI. Texto
      original abajo:**
      **`padrón RENIEC/SUNAT`: construido y verificado 2026-09-05 — falta que
      Felipe contrate un proveedor y ponga dos variables de entorno.** El modal
      de emisión ya lee el DNI/RUC y muestra a quién pertenece antes de emitir
      (nombre o razón social, y para RUC además estado y condición, porque una
      factura a un RUC de baja o "no habido" la rechaza SUNAT con el correlativo
      ya quemado). Adaptadores para tres proveedores intercambiables — ADR-0008.
      **Pendiente:** contratar `decolecta`, `apisnetpe` o `factiliza`, y poner
      en Vercel `PADRON_PROVEEDOR` (uno de esos tres nombres) y `PADRON_TOKEN`.
      Sin eso la pantalla funciona igual, avisando que la consulta automática no
      está activada y dejando escribir el nombre a mano. Reversible: sí (no
      toca el esquema).
- [x] **`la app nunca ha corrido contra el Supabase local` — RESUELTO
      2026-09-05 (ADR-0010).** Eran tres causas: healthchecks que abortaban
      `supabase start` entero, el schema `retail` que en local no existía, y
      `lib/persona.ts` sin reconocer el rol `lider`. Ahora `npx supabase start`
      + `pnpm dev` levanta la app completa contra local (instrucciones en el
      README). Verificado emitiendo una boleta real. Precio: Storage apagado en
      local — subir fotos de producto no funciona ahí.
- [ ] **La misma función de permiso se llama DISTINTO en local y en producción, y
      plpgsql no lo delata — 2026-09-10.** Local: `retail.fn_puede_operar_sede`.
      Producción: `retail.puede_operar_sede`, **sin el `fn_`**. Verificado en las dos
      bases. Los archivos están bien escritos: 20 de `migrations/` usan la versión con
      `fn_` y 17 de `unificacion/` la de sin — nadie se equivocó todavía.
      **Por qué es una trampa y no una curiosidad:** el cuerpo de una función plpgsql
      NO se resuelve al crearla, solo al ejecutarla. O sea que copiar un gemelo al otro
      —el gesto más natural del mundo cuando escribes el par— produce un
      `create or replace` que **corre en verde** y revienta la primera vez que alguien
      la usa, con "function does not exist" y la clienta esperando. `migraciones:verificar`
      tampoco lo ve: comprueba que la función exista por nombre, no a quién llama por
      dentro. Hoy casi muerde al aplicar la `33`: el archivo dice
      `retail.puede_operar_sede` y en local eso no existe, lo que parece un error y no
      lo es.
      Arreglo de fondo: renombrar en producción para que los dos lados digan lo mismo
      (con un alias temporal que llame al nuevo, para no romper las 17 que ya la
      nombran). Arreglo barato mientras tanto: que `migraciones:verificar` extraiga los
      nombres que llama cada cuerpo y los cruce contra el inventario — es la misma idea
      que ya tiene, un nivel más adentro.

- [ ] `migraciones duales (local sin prefijo / producción con prefijo retail.)`:
      la causa raíz de ADR-0004 y ADR-0006 sigue viva — cada cambio de esquema
      se escribe dos veces y las dos copias se desincronizan. Ahora que el local
      corre en el schema `retail` (ADR-0010), la ruta para matarlo es más corta:
      escribir las migraciones una sola vez, ya calificadas. Requiere revisar
      las 32 funciones con `set search_path` y las vistas puente sobre dynamic.
      No urgente, pero es la deuda que más caro ha salido hasta hoy.
- [ ] `produccion — insumos del taller`: la receta de costo (`0024`-`0029`) calcula
      con tela+avíos como costo directo declarado a mano, pero sigue sin inventario
      real de materia prima (decisión de julio: "insumos después"). Sin esto, el
      Taller no sabe cuándo se queda sin tela hasta que pasa. Depende de: decidir
      con Felipe si ya toca retomarlo o sigue postergado. Reversible: sí.
- [ ] `local-first de lecturas (Fase 2 del ADR-0013)`: replicar catálogo, stock,
      precios y sedes al navegador para que las pantallas pinten en 0 ms y la tienda
      siga operando con el wifi caído. Lo hace inusualmente viable el volumen: el
      negocio entero pesa <1 MB hoy y ~1-2 MB con 5.000 variantes — entra completo en
      IndexedDB. **Las escrituras NO se replican**: venta, movimiento y recepción
      siguen pasando por los RPC, `movimientos` sigue siendo la única fuente de verdad
      (principio 4). Escrituras local-first sin arbitraje dejarían el stock en −1
      cuando dos sedes venden offline la misma última unidad — rompe el principio 2.
      Regla de negocio ya decidida por Felipe (2026-09-09): la venta offline se permite
      **solo con stock de sobra**; si es la última unidad, bloquea. Falta definir con
      él el umbral exacto de "de sobra" y qué ve la Encargada cuando se bloquea.
      **Fase 0 y Fase 1: aplicadas y medidas** (09-09: `/inventario` en 131 ms de TTFB
      y 750 ms de carga total; el "~2 s" que se repetía nunca fue una medición). El
      motor ya está elegido: instantánea en IndexedDB + Supabase Realtime, sin motor
      externo (ADR-0018).
      **EL PRIMER PASO REAL ES UN `alter publication`, y no es mío:** hoy
      `supabase_realtime` tiene **0 tablas** (reverificado contra producción el
      10-sep). Habilitarla sobre `retail.stock` y `retail.movimientos` es DDL en el
      proyecto compartido con Dynamic → parar y confirmar con Felipe. Ojo también con
      local: `config.toml` tiene el contenedor de `realtime` **apagado** desde ADR-0010,
      así que probar esto en local exige encenderlo primero (y ADR-0010 avisa que dos
      stacks compitiendo era justo lo que rompía los healthchecks).
      **Ya NO depende de la idempotencia:** cerrada el 10-sep (ADR-0033, `0054`). La
      cola de la Fase 3 tiene su red puesta antes de existir.

## 🩹 ARREGLAR (lo que existe y está mal — deuda que crece)

- [ ] **La caja no lee la etiqueta que ella misma imprime.** Encontrado el 2026-09-11 al
      mapear la caja para el estándar (`docs/ESTANDAR-CAJA-DE-TIENDA.md`, mecanismo 1). La
      etiqueta imprime el código corto (`codigo ?? sku`, `EtiquetasGenerator.tsx:24-25`) y el
      conteo resuelve por `codigos_barras` (`lib/conteo.ts:194-206`), pero el buscador de
      venta compara **solo `sku`** (`RegistrarVentaModal.tsx:83,160`) y `vender/page.tsx:78-86`
      ni le pasa `codigo` aunque `VarianteConStock.codigo` existe. Cualquier prenda etiquetada
      después del censo, o adoptada con su código de fábrica, **no entra al escanearla en
      Vender** — la Zebra sirve en el conteo y no en la caja. Arreglo solo en `apps/web`, sin
      SQL: pasar `codigo`, cargar `codigos_barras`, y resolver el Enter por código corto →
      código de fábrica → SKU. Se verifica escaneando una etiqueta impresa.
- [ ] **Queda UNA prueba de navegador del conteo sin red, y es corta.** El 11-sep se
      sembró el catálogo de prueba (`supabase/seed-pruebas/catalogo-de-prueba.sql`) y con él
      se verificó lo principal: la cola sube sola al volver la red (la prenda encolada
      apareció en `conteo_lineas`), y la prueba destapó tres defectos del camino de fallo
      que ya existían — encolaba rechazos del servidor, trababa la pantalla con un error
      contradictorio, «Las 1 prendas» — todos corregidos (ADR-0034, addendum).
      **Lo que falta ver en navegador es el flujo corregido:** escanear sin red y que la
      línea aparezca SIN error rojo, con el buscador tomando foco. Se trabó por el arnés
      (pestaña oculta → React no revela el streaming), no por la app. Receta: build de
      producción, `cayla-retail-prod`, conteo abierto, dos recargas con red, apagar Next **y**
      `docker stop supabase_kong_cayla-retail`, recargar, escanear `BLU-0001-BLA-S`, levantar
      los dos, esperar el latido de 30 s.
      Y sigue pendiente **vender por la app en navegador** (la idempotencia de `0054` se probó
      por SQL y HTTP, no con el modal): entra natural en el paso 3 del brief.

- [ ] **Los candados de local pueden abrirse solos con NULL — barrido pendiente.**
      `34_candados_no_null.sql` cerró `es_lider`, `es_supervisor` y `puede_operar_sede`
      en **producción**. Local tiene otros nombres (`fn_es_lider`, `fn_puede_operar_sede`)
      y **no recibió ese endurecimiento**. El mecanismo: si la función devuelve NULL
      —una sesión sin rol—, `if not fn_puede_operar_sede(...)` no dispara el `raise`,
      porque `not NULL` no es true, y **el permiso pasa**. `fn_puede_operar_sede` es un
      `select` sin `coalesce` sobre `fn_es_lider()`, así que puede devolver NULL.
      Cerrado hasta ahora en **una sola** función: `registrar_venta`, por `0054`, y solo
      porque era la que esa migración reescribía igual (ADR-0033). Falta el barrido:
      listar cada `if not <candado>` de las funciones de local y pasarlo a `is not true`,
      o ponerle `coalesce(..., false)` a `fn_es_lider`/`fn_puede_operar_sede` en su
      definición, que es el arreglo por el otro lado y probablemente el correcto.
      `mi_sede()`/`fn_sede_actual_persona()` **NO** llevan `coalesce`: devuelven uuid, y
      ahí NULL es la respuesta honesta.
      Reversible: sí. Riesgo real hoy: bajo (local es entorno de desarrollo), pero
      mantiene local y producción divergiendo justo en el modelo de seguridad.

- [x] **RESUELTO 2026-09-09. Ahora corre 3 tareas y encontró 1 error real el primer día.**
      `"typecheck": "tsc --noEmit"` en los tres paquetes y la tarea declarada en
      `turbo.json`. Estado al encenderlo: `apps/web` **0 errores** y `packages/shared`
      **0** —estaban limpios porque `next build` ya los tipaba—, y
      `packages/database` **1**: `client.ts:12` usa `process.env` sin `@types/node`
      (TS2580). Invisible desde que existe el paquete, porque `apps/web` lo compila con
      SU tsconfig, que sí tiene los tipos de Node. Arreglado agregando la dependencia,
      que es lo que el paquete de verdad necesita.
      **Dos detalles sin los cuales el gate no sirve, y los dos costaron una corrida
      cada uno:** (1) SIN `dependsOn: ["^typecheck"]` — `apps/web` tipa leyendo el
      código FUENTE de los paquetes, no un artefacto construido, así que encadenarlos
      solo hace que el primer paquete roto cancele los demás y esconda el resto; (2)
      CON `--continue` en el script de la raíz — turbo, por defecto, cancela lo que
      falta en cuanto algo falla, y un gate tiene que dar la lista completa en un solo
      viaje. Con los dos puestos, dos errores plantados a propósito (uno en `web`, otro
      en `shared`) salieron **los dos** en la misma corrida, con salida 2.
      **Probado en rojo antes de creerle al verde** — un gate que nunca se vio fallar no
      es un gate. Cuesta 5 s en frío y **39 ms cacheado** (`FULL TURBO`), o sea que es
      barato de correr antes de cada push.
      **Lo que sigue abierto y no es este item:** no hay CI (`.github/workflows/` no
      existe), así que nada obliga a correrlo; y `apps/web/tsconfig.json` incluye
      `.next/types/**`, que solo existe después de un `build`/`dev` — en un clon limpio
      los tipos de ruta de Next no se verifican. Ninguna de las dos cosas convierte el
      verde en mentira, pero conviene saber qué NO cubre.
      **LAS DOS CERRADAS EL MISMO DÍA (2026-09-10), `.github/workflows/ci.yml`:** el CI
      corre `typecheck` + `lint` + `test` en cada push a main y en cada PR, así que ya no
      depende de que alguien se acuerde; y el agujero de los tipos de ruta se tapó con
      `next typegen` (3,5 s, genera `.next/types/` sin construir), de modo que el clon
      limpio del CI verifica lo mismo que la máquina de Felipe. Texto original abajo:**
      **`pnpm typecheck` no verifica NADA — corre 0 tareas y sale en verde.** El
      script existe en el `package.json` de la raíz (`turbo run typecheck`), pero
      ningún paquete del workspace define esa tarea, así que turbo responde
      *"No tasks were executed as part of this run · 0 successful, 0 total"* y
      termina con éxito. Encontrado el 2026-09-09 usándolo como gate antes de
      pushear: da exactamente la falsa confianza que ADR-0026 describe para el
      verificador de migraciones (*"un verificador que aprueba lo que no entendió
      es peor que no tenerlo: enseña a confiar en un verde vacío"*). El único
      gate real hoy es `pnpm build`, que sí tipa (`next.config.ts` **no** tiene
      `ignoreBuildErrors`) y tarda ~21 s. Arreglo: agregar `"typecheck": "tsc
      --noEmit"` a `apps/web` y a los dos paquetes, y declarar la tarea en
      `turbo.json`. Barato, y convierte un verde mentiroso en uno que significa
      algo.
- [x] **Streaming en las 10 pantallas: hecho y verificado, con resultado NEGATIVO en
      tiempo — 2026-09-09, ADR-0021.** Funciona mecánicamente (el HTML trae el esqueleto
      y llega en 3 trozos), pero **no movió los tiempos**: TTFB 131→124 ms y carga total
      750→730 ms, dentro del ruido. La razón: entre el primer byte y el HTML completo solo
      hay ~100 ms, así que había poco que repartir. Se mantiene porque cambia QUÉ se ve
      durante la espera (estructura en vez de "Cargando…"), no por velocidad. **No volver
      a proponer streaming como solución de rendimiento en este repo.**
- [x] **Auditoria de lecturas silenciosas: CERRADA el 2026-09-09.** Se paso de **20
      consultas que descartaban el error de Supabase a 1**, y esa es deliberada (la memoria
      de conveniencia del padron: si falla, queda preguntarle al padron -- degradarse a la
      ruta lenta es correcto, tumbar la consulta por un cache frio no). `lib/resultado.ts`
      tiene los tres comportamientos con la regla escrita para elegir: `exigir()` cuando un
      numero equivocado ES una decision equivocada, `exigirOpcional()` para los
      `.maybeSingle()` donde "no hay fila" es respuesta legitima pero un error no, y
      `tolerar()` para lo secundario. Las barreras `(app)/error.tsx` y `global-error.tsx`
      quedaron verificadas en vivo el mismo dia.
      **CORRECCIÓN Y CIERRE 2026-09-09 (barrido sobre TODO `apps/web`):** ese "de 20 a 1" era
      correcto **para la lista que auditó** —la que este BACKLOG nombraba—, pero el patrón
      seguía vivo fuera de ella: 52 destructuraciones `{ data: x }` sin `error`, en 16 archivos.
      **Cerradas las 52 el mismo día.** Queda 1, la del padrón, deliberada y explicada en su
      propio código. Lo que alimentaban las que importaban:
      · `lib/finanzas-nucleo.ts` (13) — EERR, cuadre de efectivo, comparativo, patrimonio.
        `getEERRMensual` (`:48`) hace `(ventasData ?? []).forEach(...)`: si la consulta de
        `ventas` falla, el Estado de Resultados dibuja **S/0 en ventas** con cara de
        normalidad. Es, literalmente, el ejemplo que `lib/resultado.ts` usa en su cabecera
        para explicar por qué existe.
      · `lib/contabilidad.ts` (8) — Balance, Flujo de Efectivo, Cambios en el Patrimonio.
      · `lib/pendientes.ts` (4) — la bandeja del Inicio. Su diseño se apoya en que "el valor
        del bloque está en cuándo NO aparece"; si la consulta falla, no aparece, y eso se
        lee como "todo al día". La forma más cara de mentir que tiene el sistema.
      · `lib/panel.ts` (2), `lib/egresos.ts` (2), `lib/actividad.ts` (2),
        `lib/inteligencia.ts` (1), y 5 pantallas más.
      Verificadas y descartadas como falsos positivos: los tres `auth.getClaims()` (si falla,
      no hay sesión y la ruta redirige al login) y `FotoProducto:54` (`getPublicUrl` arma una
      URL en memoria, no devuelve error).
      **Cómo se resolvió cada una.** `exigir()` en todo lo que alimenta una decisión de plata o
      de stock — que resultó ser casi todo. Dos excepciones razonadas:
      · `lib/pendientes.ts` — `exigir` habría tumbado el Inicio entero por una de cinco
        consultas de un bloque secundario, pero `tolerar` a secas tampoco servía: esa bandeja
        **se esconde** cuando no hay nada que hacer, así que una consulta caída se vería igual
        que un día tranquilo. El silencio es su estado normal, y por eso ahí miente mejor que
        en ninguna otra parte. Se resolvió metiendo el fallo A LA BANDEJA como un pendiente
        más ("Esta bandeja está incompleta"): no poder leer tu cola de trabajo es, literalmente,
        algo que atender — y no hizo falta tocar la pantalla.
      · `producto/[varianteId]` — `exigirOpcional()` en las tres consultas que solo corren para
        el Líder: el respaldo llega en `null` a propósito y lo que no puede pasar callado es un
        error, que es la distinción exacta que ese ayudante existe para hacer.
      **El hallazgo más feo, de paso:** `inventario/recibir` derivaba `contenedorAlmacen` de una
      consulta sin revisar. Si fallaba, la pantalla decía «tu sede no tiene un almacén
      configurado» — un mensaje FALSO que manda a configurar lo que ya estaba, con el fardo
      abierto en el mostrador. Un error se entiende; ese mensaje engaña.
      Regla para elegir, la misma de siempre: ¿alguien puede tomar una decisión de negocio
      mirando ese dato? Si sí, `exigir()`.
- [ ] **No hay ninguna pantalla para dar de alta un activo fijo.** `finanzas/activos/page.tsx:54`
      solo LEE `activos_fijos`; ningún componente del repo escribe esa tabla, así que los
      activos entran hoy a mano por SQL. Encontrado el 09-09 al hacer accionables los estados
      vacíos: el de esa pantalla no podía nombrar dónde se resuelve porque no se resuelve en
      ningún lado. Por ahora el texto lo dice tal cual, que es preferible a inventar un botón.
      Cuando toque, el patrón ya existe: `PatrimonioEditor` («+ Agregar partida») hace
      exactamente esto para las partidas de patrimonio.

- [x] **RESUELTO 2026-09-09 — ningún componente del repo muestra ya el error crudo de
      Postgres al escribir.** `traducirError` (ADR-0022) quedó en los 31 sitios de escritura
      de los 17 componentes; el grep de `error.message` fuera de `lib/error-escritura.ts`
      no devuelve nada. De paso aparecieron **dos escrituras que se tragaban el error
      entero** —`ComprasManager.cancelar` y `RecetaCosto.quitarItem`, ambas
      `if (!error) router.refresh()`—: se tocaba el botón, no pasaba nada y nadie se
      enteraba. Es la misma falla que `lib/resultado.ts` arregló del lado de la lectura,
      viva del lado de la escritura.
      **Lo que queda de esto, y es la parte que ninguna prueba puede cerrar:** provocar el
      error de cada pantalla a propósito para saber si la frase sirve de verdad. El
      traductor garantiza que no salga inglés; no garantiza que la frase oriente.
      **Sospecha concreta:** `FotoProducto` no habla con Postgres sino con Supabase
      Storage, así que sus errores (archivo muy pesado, sobre todo) caen al fallback con
      "Código:". No se inventó una huella para eso porque nadie ha visto el texto real —
      cuando alguien suba una foto demasiado grande, se copia el mensaje y se agrega a
      `HUELLAS` **con su prueba** en `lib/error-escritura.test.ts`.

- [x] **RESUELTO — verificado en vivo con la pistola Zebra el 2026-09-09 por Felipe: nada falló.** Lo construido el 09-09
      (escaneo dentro del modal de venta, Enter que ya no registra la venta a medio
      escaneo, tope contra el stock de la sede, acuse con el monto) pasa build, lint,
      tsc y 77 pruebas, **pero no se pudo probar en el navegador**: el layout redirige al
      login y no corresponde que Claude escriba la contraseña. Hay que hacerlo con la
      pistola real, no simulando el tecleo. Felipe lo probó y confirmó que nada falló: el
      escaneo agrega la prenda, dos escaneos seguidos no cierran la venta, y el tope contra
      el stock de la sede frena con el número.
      **Lo que NO se hizo, y se decidió no hacer:** cronometrar a una persona nueva. Sin ese
      número, "facilidad de aprendizaje" —la dimensión del apartado D que esta tanda de
      trabajo vino a cerrar— sigue sin línea base contra la cual comparar la próxima vez.

- [x] **RESUELTO — `recalcular_stock()` aplicada y verificada en producción
      2026-09-09 (ADR-0020). Encontró 2 filas desincronizadas el primer día;
      las 10 filas de stock siguen siendo 10 y todas tienen movimientos
      detrás, así que corrigió cantidades sin borrar nada (eran SKUs de prueba
      de la unificación, no catálogo real). Queda una lección de procedimiento
      registrada en el ADR: la verificación usaba `create temporary table` y el
      SQL Editor de Supabase la destruye entre ejecuciones, así que se supo que
      había 2 diferencias y ya no hubo con qué compararlas. Corregido en
      `unificacion/25`. Texto original abajo:**
      **`recalcular_stock()` arreglada en local, SIN PEGAR EN PRODUCCIÓN —
      2026-09-09, ADR-0020.** La red de seguridad del inventario
      (ARQUITECTURA.md §4.2) nunca pudo correr en una base con ventas: Postgres
      evalúa los CHECK sobre la fila propuesta antes de resolver el
      `on conflict`, así que la fila negativa moría antes del update.
      `supabase/migrations/0042_recalcular_stock_neto.sql` aplicada y verificada
      en local (0 diferencias contra el stock calculado aparte).
      **Falta que Felipe pegue `supabase/unificacion/25_recalcular_stock_neto.sql`
      en el SQL Editor de producción** y corra las dos verificaciones que trae al
      final. Ojo con la segunda: si devuelve algo distinto de 0, no es que el
      arreglo esté mal — es que `stock` y `movimientos` ya estaban
      desincronizados y la red hizo su trabajo por primera vez.

- [x] **YA NO — verificado 2026-09-09.** `supabase/migrations/0044_almacen_interno.sql`
      la crea en local; la base de este repo tiene `retail.stock_almacen`. La entrada
      quedó vieja: describe el estado de antes de la 0044. (Lo que sigue siendo cierto
      del párrafo es el patrón de migraciones duales, no este caso.) Texto original:**
      **`retail.stock_almacen` no existe en local — 2026-09-09.** Solo la crea
      `supabase/unificacion/12_almacen_interno.sql`, que es de producción;
      ninguna migración de `supabase/migrations/` la tiene. `lib/catalogo.ts`
      la consulta sin revisar el error, así que en local devuelve `{}` en
      silencio: el almacén se ve vacío y "Recibir mercadería" / "Bajar a tienda"
      no son verificables en local. Cuarto caso del patrón de migraciones
      duales (con ADR-0004, ADR-0006 y las categorías). Es también lo que
      impide verificar la línea "Incluye S/X en almacén" del Inicio sin
      producción.

- [x] **RESUELTO 2026-09-09 — y el arreglo no fue apagar un stack, fue construir el
      instrumento.** Los dos Supabase locales son legítimos y los dos se quedan: son
      dos repos distintos (`cayla-retail` 54421 / `cayla-dynamic` 54321). Apagar el de
      Dynamic rompería el otro proyecto. Lo que se hizo: (1) el `.env.local` de la raíz
      salió del repo (archivado fuera; se regenera con `vercel env pull` si alguna vez
      hiciera falta) — nada lo leía: no hay `dotenv`, ni `globalDotEnv` en `turbo.json`,
      ni uso de OIDC, o sea que era solo una pista falsa a la mano; (2) `pnpm local:donde`
      (`scripts/local/donde-estoy.mjs`) contesta en un segundo qué stacks corren, cuál
      declara `config.toml`, cuál leerá la app —detectando el caso feo, la variable
      exportada que le gana al archivo— y qué puerto trae de verdad el bundle del `:3000`
      vivo, abriendo los chunks, que es donde Next inlinea `NEXT_PUBLIC_*` (en el HTML no
      está: por eso la primera versión del check salía muda); (3) la tabla de puertos
      abre la sección de Desarrollo del README. **El dato que faltaba en el diagnóstico
      original:** la base de Dynamic también tiene schema `retail` —28 tablas contra las
      36 de acá, le faltan `comprobantes`, `conteos`, `colores`, `stock_almacen`,
      `proformas`, `series_comprobantes`, `codigos_barras`, `codigos_correlativos`—, así
      que el puerto equivocado no falla, miente a medias. Eso es lo que convierte el
      error en una hora. Probado en los dos caminos: en verde, y forzando el puerto malo.
      Texto original abajo:**
      **Dos `.env.local` y uno de ellos con basura — 2026-09-09.** El de la raíz
      tiene `NEXT_PUBLIC_SUPABASE_URL="[SENSITIVE]"` y la clave igual: restos de
      un `vercel env pull` del 08-09 (cuando una variable es *Sensitive* en
      Vercel, el CLI no la puede descifrar y escribe ese literal). Hoy no rompe
      nada porque Next lee el de `apps/web`, pero hizo perder media hora de
      diagnóstico en esta sesión. **Peor todavía:** el servidor de desarrollo
      tiene `NEXT_PUBLIC_SUPABASE_URL` exportada en su terminal, y en Next eso le
      gana al archivo — `apps/web/.env.local` dice `:54321` (stack local de
      dynamic) y la app en realidad habla con `:54421` (stack local de retail).
      Mínimo viable: borrar el `.env.local` de la raíz y dejar en el README qué
      puerto es cuál.

- [x] **RESUELTO 2026-09-09 (pasos 5 y 6 del Inicio). La causa no era el `if`:
      era que el CÓDIGO de sede no sirve para decidir nada y cada pantalla lo
      re-deducía. `PersonaActual` expone ahora `sedeTipo` y los tres sitios leen
      de ahí. De paso el Taller dejó de ver "Vender" (no tiene caja ni piso) y
      el pie del menú dejó de llamarlo "Encargada". Texto original abajo:**
      **`esTaller === "TALLER"` esconde Producción en producción — 2026-09-09.**
      `AppShell.tsx:216` y `mas/page.tsx:10` detectan el Taller por código de
      sede, pero tras la unificación la sede del Taller se llama **`LIM`**
      (`unificacion/01_sedes.sql:35` la mapea a `tipo='fabrica'` justamente
      porque su código no es TALLER). Hoy, en producción, la persona del Taller
      no ve el enlace a Producción en ningún lado. `packages/shared/src/enums.ts:5`
      también quedó viejo (lista `TALLER`, le faltan `003` y `CCO`). Arreglo:
      detectar por `tipo === 'fabrica'`. Va en el paso 6 del plan del Inicio.

- [x] **Fase 0 de latencia: DESPLEGADA Y VERIFICADA EN PRODUCCIÓN el 2026-09-09.**
      La función corre en `gru1` (São Paulo): confirmado con `x-vercel-id: iad1::gru1::…`
      — dos segmentos, el segundo es dónde ejecuta. Las mediciones anteriores daban un
      solo segmento porque las respondía el proxy en el borde sin llegar a la función.
      Pantalla con sesión: TTFB 124 ms, carga total 730 ms. **Registro original abajo,
      por si hay que rediscutirlo:** Lo único que queda
      es `git push` (hoy hay 6 commits sin subir, 3 de otras sesiones — no se
      empujaron para no desplegar trabajo ajeno sin su visto bueno) y después
      confirmar con `curl -sI <dominio>/login | grep -i x-vercel-id`: si dice
      `gru1`, la región tomó; si sigue diciendo `iad1`, el Root Directory del
      proyecto no es `apps/web` y hay que mover `vercel.json` a la raíz o fijar
      la región desde el panel (Settings → Functions). **Medir el TTFB antes y
      después de cada cambio por separado; el que no supere el ruido se revierte.**
      Lo aplicado: (1) `apps/web/vercel.json` con `regions: ["gru1"]`;
      (2) `Promise.all` en `getEstadoResultados` y `getDiarioCaja`, y `sedes`
      pasó a salir de `getSedes()` cacheado — esa consulta desaparece, no se
      paraleliza; (3) `getUser()` → `getClaims()` en `middleware.ts` y
      `lib/persona.ts`. **El riesgo que se temía en (3) no existía:** el proyecto
      ya firma con ES256 asimétrica (verificado en el JWKS), así que la validación
      es local con WebCrypto y no hubo que tocar auth en producción.
      Diagnóstico original, por si hay que rediscutirlo: Diagnóstico medido: la base
      responde en **0.862 ms** (19 variantes, 28 movimientos, <1 MB de schema) y el
      sistema tarda ~2 s. Todo el tiempo es red. `X-Vercel-Id: iad1::…` confirma que
      la función corre en Washington D.C. contra Supabase en `sa-east-1`; una página
      **estática ya cacheada** tarda 430 ms de TTFB desde Perú. Encima, cada
      navegación hace 4 viajes secuenciales, dos de los cuales son el mismo
      `auth.getUser()` pedido dos veces (`middleware.ts:31` y `lib/persona.ts:52` —
      el `cache()` de React no cruza entre middleware y render). Los tres pasos, en
      orden de riesgo creciente: (1) mover la función a `gru1`; (2) `Promise.all` en
      `getEstadoResultados` (`lib/finanzas.ts:150-172`, 5 consultas independientes en
      fila india) y `getDiarioCaja` (3 más); (3) claves JWT asimétricas +
      `getClaims()` para matar el `getUser()` duplicado — este último toca auth en
      producción, va al final y con los otros dos ya verificados. **Medir antes y
      después de cada uno por separado; el que no supere el ruido se revierte.**
      Falta confirmar si `iad1` fue decisión o default: el token de Vercel da 403
      sobre el scope `cayla`.
- [ ] **No hay forma de saber qué archivos de `supabase/unificacion/` están
      aplicados en producción — 2026-09-08.** Se descubrió que `20`, `21` y
      `22` nunca se habían pegado, y solo porque una pantalla se rompió
      ("Could not find the function ... in the schema cache" al registrar una
      serie). Ya aplicadas y verificadas, pero el problema de fondo sigue: el
      historial de migraciones de Supabase no conoce esta carpeta. El ítem de
      categorías de aquí abajo muestra el otro lado del mismo problema: se
      arregló y nadie lo supo hasta que se contó a mano hoy. Salió barato
      porque `comprobantes` y
      `series_comprobantes` estaban vacías. Mínimo viable: un script que
      compare las funciones/columnas que cada archivo promete contra
      `pg_proc`/`information_schema` y liste lo que falta.

- [x] **RESUELTO — Felipe puso las variables el 2026-09-08 por la noche, y
      nadie lo anotó (otra vez el ítem de "no sabemos qué está aplicado").**
      Verificado 2026-09-09 con `vercel env ls`: `LUCODE_TOKEN` y
      `LUCODE_ENTORNO=produccion` existen en Production desde hace 19h, y el
      token es el mismo que el de `apps/web/.env.local`. El deploy transmite:
      **B004-000002 (08-09 17:35) y B004-000003 (09-09 11:57) salieron de ahí**,
      no de la computadora de Felipe. La segunda ya trae
      `entorno_transmision='produccion'` escrito, o sea que corrió contra la RPC
      de 5 argumentos del código desplegado a las 11:50 — circuito completo
      verificado en producción. Texto original abajo, como se escribió el 08-09:
      *"Producción no tiene LUCODE_TOKEN ni LUCODE_ENTORNO. El botón Transmitir
      responde sin_credenciales en el deploy; facturar a SUNAT solo funciona
      desde el npm run dev de Felipe."*
      **Sigue pendiente y es de seguridad:** el token nunca se rotó pese a haber
      pasado por el chat el 05-09, y es el MISMO que ahora vive en Vercel.
      Rotarlo en app.apisunat.pe → Organizaciones, y actualizar los dos lugares
      (Vercel y `apps/web/.env.local`).

- [x] **RESUELTO (verificado 2026-09-08: `select count(*)` devuelve 37 filas,
      por encima de las 30 esperadas). Se aplicó en algún momento entre el
      05-09 y hoy sin que nadie lo anotara — que es justo el ítem de arriba.
      Texto original abajo, como quedó registrado el 2026-09-05:**
      `retail.categorias` le faltan 25 de 30 filas en producción (mismo
      patrón que ADR-0004/ADR-0006, sin arreglar todavía) — encontrado por
      Felipe en vivo, 2026-09-05. `04_catalogo.sql` (paso 4 de la
      unificación) recreó la tabla desde cero pero nunca insertó la semilla
      de `0009` — solo las 5 filas de `0030_categorias_captura_real.sql`
      (pegadas después) existen hoy. "Blusas" y otras 14 de indumentaria más
      todo calzado/accesorios/bisutería/belleza/papelería faltan. Migración
      lista en `supabase/unificacion/19_categorias_completas.sql`
      (`on conflict do nothing`, segura de correr), **falta que Felipe la
      pegue en el SQL Editor**. Sin esto, "Recibir mercadería" y "Nuevo
      producto" no pueden clasificar la mayoría del catálogo real.
      Reversible: sí, son datos (insert aditivo).
- [x] **`patrimonio_items.categoria`: arreglado y confirmado en producción
      2026-09-05 (ADR-0006) — cerrado.** La unificación de julio copió
      `patrimonio_items` desde la migración `0013`, antes de que `0019` le
      agregara `categoria`; `PatrimonioEditor.tsx` inserta esa columna en cada
      ítem, así que agregar un ítem de patrimonio llevaba roto en producción
      desde julio sin que nadie lo notara. Felipe pegó
      `supabase/unificacion/15_patrimonio_categoria.sql` y confirmó con la
      consulta de verificación: `information_schema.columns` ya devuelve
      `categoria` en `retail.patrimonio_items`. Tercer caso del mismo patrón
      de drift (con ADR-0004 y las categorías de `04_catalogo.sql`) — lo que
      falta no es arreglar el siguiente, es dejar de no saber qué corrió en
      producción (ver la deuda de `registro de migraciones aplicadas` abajo).
- [x] **RESUELTO — CUATRO FUNCIONES TENÍAN DOS O TRES FIRMAS VIVAS EN LOCAL. Producción estaba limpia.**
      Encontrado 2026-09-09 por `pnpm migraciones:verificar` en su primera corrida, contra la
      base LOCAL: `registrar_movimiento` (10 y 12 args), `recibir_lote` (6, 7 y 8),
      `registrar_produccion` (11, 13 y 15), `crear_producto_con_variantes` (7 y 8). Probado con
      `explain` (no ejecuta): una llamada que solo nombra los parámetros comunes devuelve
      `function is not unique`. En la práctica, en local, **una devolución al almacén funciona y
      un ajuste, una merma o un traslado normal no** — `MovimientoModal` solo manda
      `p_contenedor_id` cuando es devolución, y `supabase-js` borra las claves `undefined`.
      **Corrección del mismo día, y es importante:** se dio por hecho que esto explicaba que
      `recibir_lote` no esté en los tipos generados y que `RecibirLoteForm` "siempre falla
      cuando se usa". Felipe corrió la consulta y **producción no tiene ninguna función
      duplicada**, así que allá esos dos síntomas siguen sin causa conocida. El motivo de la
      divergencia: local replica el historial completo (`0002` crea la de 10 args, `0008` la
      redefine con 12 y la vieja queda viva), y producción recibió el estado final consolidado
      —`unificacion/07_funciones_operacion.sql:55` la define UNA vez con 12—. O sea: **la base
      local no es una réplica fiel de producción**, y no por los datos sino por la forma. Es el
      costo concreto de la deuda de migraciones duales.
      **Falta saber si producción tiene lo mismo** — se responde corriendo
      `scripts/migraciones/inventario.sql` allá.
      **ARREGLO LISTO, falta pegarlo.** `supabase/migrations/0049_una_sola_firma_por_funcion.sql`
      (aplicado y verificado en local: las cinco formas de llamada que usa la app resuelven, y
      el verificador ya no reporta sobrecargas) y su gemelo
      `supabase/unificacion/31_una_sola_firma_por_funcion.sql` para el SQL Editor de Dynamic.
      El gemelo lleva candado —no borra la firma vieja si la nueva no existe, porque producción
      recibió las migraciones a mano y puede tener otra combinación—, es idempotente (probado
      corriéndolo dos veces) y termina con una tabla que muestra el estado, porque el SQL Editor
      no siempre enseña los `raise notice`. **Pegarlo en producción es decisión de Felipe: es DDL
      en el proyecto compartido con Dynamic.** Antes de eso, la comprobación de 10 segundos está
      escrita en la cabecera del gemelo. Ver ADR-0026.
      Nota al margen: con `recibir_lote` ya sin ambigüedad, podría por fin salir en los tipos
      generados — pero `pnpm gen-types` sigue apuntando al proyecto viejo de retail y sin
      `--schema retail`, así que eso espera a que se arregle ese otro ítem.

- [ ] **`no hay registro de qué migración corrió en producción` — la deuda que
      produce todas las anteriores.** `supabase/unificacion/` tiene 20 archivos
      y el único registro de cuáles se pegaron vive en la memoria de Felipe y
      en frases sueltas de este backlog. Los tres casos de drift de esta semana
      (ADR-0004 `recibir_lote`, ADR-0006 `patrimonio_items.categoria`, y las 25
      categorías que `04_catalogo.sql` nunca insertó) son el mismo agujero, no
      tres bugs distintos: producción se desvía de local y nadie se entera
      durante semanas, hasta que una pantalla falla delante de una clienta.
      Arreglo propuesto: una tabla `retail.migraciones_aplicadas (archivo text
      primary key, aplicada_at timestamptz default now())` y una línea al final
      de cada script de unificación que inserte su propio nombre; con eso, una
      sola consulta dice qué falta. Barato y aditivo. **Decidir con Felipe
      cuándo** — después de vaciar la cola pendiente, no antes.
- [x] **`recibir_lote`: arreglado y confirmado en producción 2026-09-03
      (ADR-0004) — cerrado, con un susto en el camino que vale registrar.**
      Dos sesiones paralelas llegaron a esta función el mismo día por caminos
      distintos y convergieron en el mismo arreglo: la unificación había
      migrado una copia de `recibir_lote` más vieja que la `0018` local, sin
      validar sede, sin guardar `categoria_id` (rompía la taxonomía de
      `0030`) y sin aceptar `p_orden_compra_id`. Cuerpo schema-calificado
      pegado en `supabase/unificacion/14_recibir_lote_produccion.sql`
      (7 parámetros); `13_recibir_lote_valida_sede.sql` quedó SUPERADO (mismo
      hallazgo, alcance más angosto). **Lo que salió mal al pegar:**
      `CREATE OR REPLACE` con un parámetro nuevo (`p_orden_compra_id`) no
      reemplaza la función vieja de 6 parámetros — Postgres las trata como
      dos funciones distintas y crea una segunda, dejando **dos versiones de
      `recibir_lote` conviviendo a la vez** (la vieja insegura + la nueva
      completa). Se detectó regenerando `packages/database/src/types.ts`
      contra el proyecto correcto (el generador mostró un tipo unión con dos
      firmas) — no por una revisión manual. Cualquier "Recibir mercadería"
      sin orden de compra ligada (la mayoría) habría fallado con
      "function is not unique". Verificado con
      `select oid::regprocedure from pg_proc where proname='recibir_lote'
      and pronamespace='retail'::regnamespace` (2 filas), corregido con
      `drop function retail.recibir_lote(uuid,text,jsonb,text,text,text)`
      (la de 6), reverificado (1 fila, la de 7). Lección para la próxima
      migración que le agregue un parámetro a una función existente: un
      `CREATE OR REPLACE` que cambia la firma no reemplaza nada — hay que
      `DROP` la firma vieja explícitamente, o verificar con
      `pg_proc`/`regprocedure` que no quedó una sobrecarga fantasma.
      Agravante relacionado, sin arreglar todavía: `retail.puede_operar_sede`
      (`03_candados.sql:53-55`) tampoco tiene la cláusula `tienda_asociada_id`
      que sí tenía la versión local (`0012`) — hoy solo Líder/admin pasaría ese
      candado para una sede que no es la propia.
- [ ] **`producción`: reconciliar `ordenes_produccion` (modelo viejo) con
      `producciones` (modelo vigente desde `0025`-`0029`) — nunca se propagó.**
      Encontrado al intentar arreglar `recibir_lote`: `inventario/recibir/
      page.tsx:52,57` todavía consulta `retail.ordenes_produccion` y una
      columna `retail.lotes.orden_produccion_id` que **no existe** en
      producción (verificado: `retail.lotes` solo tiene `orden_compra_id`).
      El frontend manda `p_orden_produccion_id` a `recibir_lote`
      (`RecibirLoteForm.tsx:218`) y siempre falla cuando se usa. Deliberadamente
      fuera de `0031` — decidido con Felipe 2026-09-03. Necesita: decidir si
      `producciones` reemplaza del todo a `ordenes_produccion` (¿se puede
      dropear la vieja?), una columna nueva en `lotes` para el vínculo, y
      reescribir la consulta de "producciones pendientes de recibir" contra el
      modelo nuevo. Reversible: sí, nada de esto se ha tocado todavía.
- [ ] `web`: `middleware.ts` usa convención deprecada de Next.js 16 (pide
      `proxy.ts`). Solo un warning en build, no rompe nada. Reversible: sí.
- [x] **ARREGLADOS 2026-09-10, cada uno como pedía su caso — `pnpm lint` en verde.**
      El `:95` quedó con `eslint-disable-next-line` y el motivo escrito (leer
      `localStorage` durante el render devuelve `[]` en el servidor y la cola real en el
      navegador: eso ES una desincronización de hidratación, no una preferencia). El
      `:106` se reemplazó por el ajuste durante el render que documenta React —
      `conteoPrevio` + comparación—, y de paso quitó el parpadeo: el efecto corría
      después de pintar, así que la lista vieja alcanzaba a verse un instante. **El
      montaje no necesitó nada** porque `lineas` ya nacía de `conteo?.lineas` en su
      `useState` (`:62`), o sea que el efecto solo repetía ese valor — por eso el cambio
      conserva el comportamiento exacto. Sin riesgo de bucle: `conteo` llega de un Server
      Component (`page.tsx` hace `await getConteoAbierto`), su identidad solo cambia
      cuando el servidor manda datos nuevos, y la condición se apaga sola en el re-render
      inmediato. Verificado: lint, tipos y las 79 pruebas en verde. Texto original abajo:**
      **`pnpm lint` está en ROJO en main — 2 errores, los dos en `ConteoPanel.tsx`,
      los dos de `react-hooks/set-state-in-effect` — 2026-09-10.** Es lo primero que
      va a marcar el CI recién encendido, y está bien que lo marque: son de código ya
      commiteado (`ab479ba`), no de trabajo suelto. Los dos casos NO son el mismo problema:
      · **`:95` — hidratar `pendientes` desde `localStorage` al montar.** Probablemente
        un falso positivo: en Next no se puede leer `localStorage` durante el render
        (no existe en el servidor y desincroniza la hidratación), así que el efecto es
        justamente el patrón correcto. Lo que corresponde acá es un
        `eslint-disable-next-line` **con el motivo escrito**, no un rediseño.
      · **`:106` — copiar `conteo.lineas` del servidor al estado local.** Éste sí es el
        antipatrón que la regla persigue, y React documenta el reemplazo exacto
        ("ajustar estado durante el render", comparando contra el valor previo). Además
        de callar el lint, quita un render de más: la lista vieja deja de pintarse un
        instante antes de corregirse — en una pantalla donde se cuenta inventario, eso
        no es cosmético.
      Decidir con quien tenga el contexto de la pantalla. Mientras tanto el CI queda
      rojo, que es la verdad.

- [ ] `pruebas`: **dato corregido 2026-09-10 — ya no es un solo archivo: son 7 y 79
      pruebas** (`documento`, `error-escritura`, `lucode`, `padron`, `panel-serie`,
      `proformas`, `registro-contable`), y desde hoy corren en CI en cada push. **Pero
      lo que la entrada denunciaba sigue en pie, y es lo que importa:** las 7 prueban
      lógica de TypeScript, ninguna toca Postgres. El
      núcleo de dinero e inventario — `registrar_venta`, `cerrar_caja`,
      `fn_aplicar_movimiento`, las RPCs de producción — no tiene prueba
      automatizada, solo verificación manual en vivo por Felipe. Cayla Dynamic
      (proyecto hermano) corre 302 pruebas pgTAP sobre su propio dinero; acá el
      principio 7 ("pasos verificables") se cumple con el navegador pero no queda
      capturado para que no se repita un bug ya resuelto.
- [ ] `unificación retail↔dynamic`: confirmada aplicada y con datos (ver CERRADO),
      pero sin documentar formalmente — falta el ADR que debió escribirse en
      julio (principio 8) y el `02_*.sql` que crea el schema en sí nunca quedó en
      el repo (se infiere solo de la cabecera de `03_candados.sql`). Deuda de
      documentación, no de funcionamiento. Reversible: sí, es solo escribir.

## ✨ MEJORAR (lo que funciona y podría ser de talla mundial)

- [x] **`cacheComponents`: ARCHIVADO el 2026-09-09 tras intentarlo de verdad -- ADR-0028.**
      Con el arbol quieto se activo el flag, se corrio el codemod oficial (27 rutas, 0
      errores) y se ejecuto el build. Varias preocupaciones se cayeron al medirlas: 0
      configs de segmento que migrar, 0 `unstable_cache`, y 13 pantallas ya tenian
      `<Suspense>` del mismo dia. **El impedimento real es de producto, no de codigo:**
      `AppShell.tsx:328` decide con `esLider` que enlaces dibuja, asi que la navegacion
      depende del rol -- y un armazon prerenderizado no puede contener un menu que cambia
      segun quien mira. El layout lee cookies para saberlo y bloquea la ruta entera por mas
      `<Suspense>` que se le ponga a cada pagina. No paga: el streaming ya dio CERO en
      tiempo, la cache del router entrega 6-7 ms en pantalla repetida y el armazon llega en
      124 ms. **Solo se revisa si la navegacion deja de depender del rol por una razon de
      producto**, nunca por rendimiento.
- [ ] **Mover `/almacen` y `/almacen/recibir` a `redirects()` de la config.** Hoy son
      paginas de React que solo llaman a `redirect()` -- pantallas que no dibujan nada. Un
      alias de ruta pertenece a la config, no al arbol de paginas. Se descubrio intentando
      cacheComponents (ahi rompian el prerender) y se revirtio con el resto; el arreglo
      sigue siendo correcto por su cuenta. Usar `permanent: false`: un 308 se queda cacheado
      en el navegador de cada quien y recuperar esas rutas despues costaria explicar como
      limpiar la cache.
- [ ] `inteligencia`: umbral de estancado (45d) y lead time (14d) siguen siendo
      constantes globales, no por categoría/sede. Sigue sin justificarse afinarlo:
      no hay datos reales de venta todavía (depende de `catalogo real` arriba).
- [ ] `almacen/recibir`: rediseño de UX pendiente desde el 17-jul — talla/color/
      categoría quedan escondidos hasta buscar y crear un producto nuevo. Pedido
      explícito de Felipe, nunca agendado en una sesión propia.
- [ ] `finanzas`: el costo de lo vendido usa el costo VIGENTE de cada prenda, no el
      costo del día de la venta. Inofensivo mientras los costos sean estables (nota
      del 17-jul); si algún día se mueven, distorsiona el histórico de EERR pasados.
- [ ] Contraste: el barrido del 08-sep (ADR-0012) midió solo las pantallas que se
      pueden ver sin sesión más Facturación. Las de Finanzas, Inventario y Producción
      quedaron con el piso aplicado por sustitución mecánica pero SIN medición sobre
      el DOM renderizado. Vale una pasada de verificación cuando haya sesión de prueba.
      El hallazgo de taupe que salió acá el 09-sep ya está cerrado (ADR-0017,
      `--color-taupe-profundo`); lo que queda es el barrido de las pantallas con
      sesión, que es más ancho que ese solo color.
- [ ] Campos viejos: `ProformasPanel`, `EfectivoPanel` y los 6 modales del núcleo
      siguen con los strings `campoTexto`/`campoSelect`/`botonPrimario` de
      `ui/Modal.tsx`. `components/ui/campos.tsx` (ADR-0011) ya los reemplaza en
      Facturación con campos que sí tienen estado (hilo de foco, desplegable propio,
      segmentado). Migrar pantalla por pantalla, nunca de un saque: los strings
      viejos siguen exportados justamente para que la migración sea opcional.
      Esperar a que Felipe confirme que le gusta el diseño en Facturación primero.

---

## 📚 CONCEPTOS PENDIENTES DE ENSEÑAR

- [ ] **Schema de Postgres como "cajón" aislado** — el hallazgo de arriba no se
      entiende sin este modelo mental: `public` y `retail` pueden vivir en el
      MISMO proyecto Supabase sin verse entre sí a menos que algo los conecte a
      propósito (las vistas puente del paso 3 de unificación). Es la pieza que
      explica por qué "cambiar una palabra en el cliente" puede romper todo.
- [ ] **`security definer`** — por qué `fn_aplicar_movimiento` y las RPCs de venta/
      producción pueden saltarse RLS y por qué eso es seguro *solo* porque validan
      todo adentro (sede del que llama, cuadre de asiento, etc.).
- [ ] **Costeo por margen de contribución** (introducido en `0024`) — por qué la
      mano de obra y los gastos fijos del Taller NO entran al costo por prenda y sí
      al resultado mensual del Taller; es una decisión contable, no un descuido.

## ✅ CERRADO (últimos, con fecha)

- [x] 2026-09-10 — **`registrar_venta` deja de duplicar una venta si la red se
      corta a mitad de un cobro (ADR-0032).** `registrar_venta` era atómica
      dentro de Postgres pero no idempotente hacia afuera: si la respuesta se
      perdía después del commit, un reintento de la Encargada entraba como
      venta nueva, con doble descuento de stock. Se agregó `p_token uuid`
      (uno por carrito, generado en `RegistrarVentaModal.tsx`) +
      `ventas.token_cliente` con índice único. Tres rondas de revisión
      adversarial encontraron y cerraron dos bugs reales antes de tocar
      producción: la primera versión devolvía la venta existente ANTES de
      validar el candado de sede (`retail.puede_operar_sede`) — un bypass de
      autorización real; la segunda dejaba la rama de la carrera concurrente
      (`exception when unique_violation`) sin la misma comparación de
      contexto (caja/método/monto) que sí tenía la rama normal. La versión
      final repite esa comparación en las dos ramas y valida sede/caja/estado
      siempre primero, con o sin token. Verificado en producción con consulta
      directa (no solo el `raise notice` del propio script) y con el
      verificador de `scripts/migraciones/` contra una foto fresca de
      producción: firma nueva de 5 argumentos activa, firma vieja ausente,
      `anon`/`PUBLIC` sin `EXECUTE`, cero filas de prueba dejadas atrás.
      `pnpm typecheck` limpio en los 3 paquetes.
- [x] 2026-09-10 — **`recalcular_stock()` vuelve a saber que el almacén
      existe, y de paso corrigió 2 filas de stock que ya estaban infladas
      (ADR-0031).** La versión vigente en producción (ADR-0020, "el neto en
      una pasada") se escribió antes de que existiera el almacén interno —
      producción ya tiene 4 contenedores tipo `almacen` reales y 9
      movimientos enrutados ahí que esa versión no conocía; invocarla
      habría mezclado el almacén de vuelta al piso. Se portó el diseño de
      `0044_almacen_interno.sql` (nunca pegado a producción con ese
      alcance), sumando el candado de Líder que se había perdido en el
      camino, el guard de `stock_minimo` (borde heredado de ADR-0020, ya
      anotado hace días en este archivo) y `EXECUTE` revocado de `PUBLIC`.
      Una revisión adversarial encontró y corrigió un bug antes de aplicar:
      sin una excepción para `tipo='traslado'`, un traslado hacia un
      contenedor de almacén (el mecanismo real de "devolver a almacén", hoy
      inalcanzable desde el frontend) se habría restado del piso de origen
      sin sumarse en ningún lado. Verificando la lógica contra los datos
      reales (por `select`, sin invocar la función) aparecieron 2 filas de
      `stock` con el doble conteo exacto de una entrada al almacén también
      contada como piso, del 2026-09-05 — corregidas a mano con confirmación
      explícita de Felipe (99→49 y 98→58 en Arequipa), sin tocar
      `movimientos`.
- [x] 2026-09-10 — La cabecera dice DÓNDE estás parado, y la tienda de Lima quedó
      entera. El selector mostraba `codigo` — que dejó de ser legible con la
      unificación: el Taller es `LIM` y la tienda de Lima es `003`. Ahora muestra
      una etiqueta derivada (`TND LIM`, `TLL LIM`, `TND AQP`, `TND TRU`, `CCO`) con
      la regla en `lib/etiqueta-sede.ts`, pura y con 9 pruebas que la fijan contra
      los datos reales de producción Y del seed local. Mismo trato para el lateral y
      para la pastilla de la Encargada. Rastreando eso apareció que `003` tenía
      `activo = false`: se podía vender ahí pero no cargarle un gasto ni un asiento
      (`egresos`, `registrar` filtraban por ese flag). El flag resultó ser de
      Dynamic (`retail.sedes` es una vista sobre `public.sedes.activa`) — Felipe
      decidió no escribir en la tabla de Dynamic y que retail deje de mirarlo:
      **ADR-0029**. Verificado antes de tocar nada que ni RLS ni `puede_operar_sede`
      bloqueaban por su lado. **Falta comprobarlo en navegador** (Docker apagado en
      la sesión): typecheck y 88 pruebas en verde, demo pendiente.
- [x] 2026-09-04 — Modal compartido `components/ui/Modal.tsx` sobre Radix Dialog
      (ADR-0003): los 6 modales del núcleo que seguían con estilos genéricos
      pre-brandbook (abrir/cerrar caja, vender, bajar a tienda, registrar gasto,
      movimiento de stock) migraron a los tokens CAYLA v3, y los 8 modales de la
      app ganaron foco atrapado + cierre con `Escape` (antes ninguno lo tenía,
      salvo `Ayuda.tsx` con lógica propia). Verificado en navegador con página de
      prueba temporal (borrada al cerrar). Sin adoptar ningún kit visual externo —
      Radix solo aporta comportamiento, el look sigue siendo 100% CAYLA.
- [x] 2026-07-19/23 — Producción del Taller construida de punta a punta más allá de
      lo registrado en BITACORA: costeo por margen de contribución (`0024`),
      registrar producción por corrida (`0025`), producción a nivel de modelo
      (`0026`), variantes estilo Shopify + "marcar terminado" → inventario
      (`0027`), corrección de producciones mal registradas (`0028`), y la orden de
      producción unificada con 6 etapas y 2 tipos (muestra/producción) en `0029` —
      reemplaza los dos mecanismos que se pisaban entre sí. **Commiteado, sin
      confirmación explícita de Felipe en producción todavía** (no hay entrada de
      bitácora que lo confirme, a diferencia de todo lo anterior).
- [x] 2026-07-16 — Fase 2 pivotada de finanzas a "Inventario Inteligente" (decisión de Felipe)
- [x] 2026-07-17 — Inventario Inteligente commiteado (`feat(inventario)`, `fix(movimientos)`, `docs`)
- [x] 2026-07-17 — Fix RLS: traslados visibles para la sede que los recibe → ADR-0001
- [x] 2026-07-17 — Fix: 4 filas duplicadas en `personas` bloqueaban el login de Felipe;
      agregado `unique(auth_user_id)` para que no se repita → ADR-0002
- [x] 2026-07-17 — Repo conectado a GitHub (`felipea92p-ux/cayla-retail`, privado) —
      antes solo existía en esta Mac, sin respaldo. Vercel conectado al repo para
      deploy automático en cada push; deploy de Inventario Inteligente confirmado
      en `cayla-retail.vercel.app`.
- [x] 2026-07-17 — Fase 2 financiera: Diario de Caja (apertura/cierre con conteo
      ciego), Gastos, Estado de Resultados (mermas como COGS). Verificado por Felipe
      en local. "Venta" se retiró del modal de movimiento genérico — el botón
      "Vender" es ahora la única fuente de verdad para registrar una venta.
- [x] 2026-07-17 — Fase 3: ingreso de mercadería y almacén — un almacén hermano por
      tienda (TRU-ALM/AQP-ALM/LIM-ALM), contenedores, `/almacen/recibir` (lotes),
      `/almacen` (stock + "Bajar a tienda"), devolución con motivo estructurado
      reutilizando `traslado`. Diseñado tras 24 preguntas de descubrimiento (no
      adivinado). Verificado en producción por Felipe.
- [x] 2026-07-17 — Taxonomía real de catálogo: `productos.categoria` (texto libre)
      → 6 familias fijas + 30 categorías en tabla `categorias`, editable por Líder
      sin deploy. Tallas sugeridas por categoría alimentan un `<select>` real en
      "Recibir mercadería". Migración `0009` corrida en Supabase y verificada en vivo.
- [x] 2026-07-17 — Endurecimiento de stock contra concurrencia (`0010`): `for update`
      al validar + `check (cantidad >= 0)` + FK de `movimientos.venta_id`. Cierra la
      condición de carrera que dejaba el stock en -1 con dos ventas simultáneas de la
      última unidad. Encontrado en la revisión nocturna, aprobado y corrido por Felipe.
- [x] 2026-07-18 — "Estancado" mide días sin venta real (`0011`): columna
      `stock.ultima_venta` sellada solo con motivo='venta'. Indicador renombrado a
      "Días sin venta".
- [x] 2026-07-18 — Las 5 RPCs security-definer validan la sede del que llama (`0012`,
      helper `fn_puede_operar_sede`). Cierra la puerta de atrás: nadie mueve stock ni
      cajas de otra sede por API directa.
- [x] 2026-07-18/19 — Identidad visual CAYLA aplicada (brandbook v3.0: Rojo #B8412D,
      Crema #F5F0E8, Tinta #1A1A18, EB Garamond + DM Sans) y rediseño UX total v3
      (AppShell, navegación lateral/móvil, catálogo agrupado, selector de sede del
      Líder). Verificado en vivo por Felipe.
- [x] 2026-07-19 — F1 núcleo financiero (jubilación de SINATRA): proveedores,
      depósitos, ajustes de efectivo, históricos, patrimonio (`0013`-`0014`). Fase B:
      etiquetas Brother con código de barras Code 128 propio, fotos por modelo,
      stock mínimo por sede (`0015`-`0016`). F2: órdenes de compra formales, export
      Excel, modelo de gastos corregido (`0017`). Producción del Taller v1: etapas,
      receta de costo (`0018`). C1: los 4 estados financieros completos por lectura,
      sin tocar money paths (`lib/contabilidad.ts`). Ayudas (!) educativas regadas
      por toda la app. Todo desplegado y verificado el mismo día.
- [x] 2026-07-19 — Motor contable de doble partida (`0019`-`0023`): plan de cuentas
      PCGE, `registrar_asiento` con cuadre forzado, activos fijos con depreciación
      NIIF/SUNAT automática, fix de recursión infinita en RLS de identidad.
- [x] ~2026-07-20/23, confirmado en producción 2026-09-03 — Unificación de
      identidad: retail deja de tener sus propias `sedes`/`personas` y pasa a
      leerlas de Dynamic vía un schema `retail` dedicado dentro del proyecto
      Dynamic, con vistas puente y RPCs migradas (`supabase/unificacion/01`-`11`).
      Verificado con Felipe contra el SQL Editor de producción: el schema
      `retail` existe, tiene 28 tablas (más que las ~22 originales — las
      migraciones de producción `0024`-`0029`, posteriores a la unificación,
      sumaron tablas nuevas encima), y `retail.sedes` devuelve 5 filas reales, no
      vacío. Descarta el riesgo que abrió esta auditoría: la app NO llevaba 6
      semanas rota. Pendiente solo la documentación (ver ARREGLAR).

## 📎 De sesiones previas de Claude Code (contexto, no repetir)

- `docs/CHECKLIST-MANANA.md` (17-jul) y `docs/PLAN-DE-TRABAJO.md` (19-jul): ya
  incorporados arriba, todo lo accionable de ahí quedó cerrado o migró a este
  backlog. Se conservan como registro histórico, no como pendientes activos.
