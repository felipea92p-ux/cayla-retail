# Pantalla — Historial de ventas (`/vender/historial`)

> Modo: completo · Fecha: 2026-09-22 · Rol/sede: líder de equipo, vista «Todas las tiendas» (mostrador/tablet) · Datos: sin SQL nuevo esta vez — se reutiliza como `[producción]` solo lo que `docs/BACKLOG.md`/`docs/BITACORA.md` registran YA VERIFICADO contra producción entre el 2026-09-21 y el 2026-09-22 (fechas citadas en cada hallazgo); lo que necesitaría una consulta nueva de verdad queda en `[no verificable]` y en «SQL pendiente»
> SHA analizado: `88457700` (origin/main, 2026-09-22) — si `page.tsx`, `lib/ventas-historial*.ts` o los componentes `HistorialVentas*`/`FiltrosHistorialVentas` cambian después, este análisis está vencido. El worktree ya tenía estos 5 archivos idénticos a `origin/main` (`git diff --stat` vacío) aunque va 10 commits detrás en el resto del repo.
> Archivos: `apps/web/app/(app)/vender/historial/page.tsx` · `components/FiltrosHistorialVentas.tsx` · `components/HistorialVentasLista.tsx` · `components/HistorialVentasPulso.tsx` · `components/Paginacion.tsx` (`PaginacionCursor`) · `components/DetalleVentaModal.tsx` · `lib/venta-detalle.ts` · `lib/venta-detalle-reglas.ts` · `lib/ventas-historial.ts` · `lib/ventas-historial-reglas.ts` · `lib/comprobantes-reglas.ts` · tablas `ventas`, `venta_items`, `venta_pagos`, `comprobantes`, `productos`, `variantes`, `producto_fotos`, `clientas` (nueva) · RPC `fn_nombres_personas`
> Otra sesión tocándola: no como colisión. `docs/SESIONES-ACTIVAS.md` no lista esta pantalla como propia de nadie hoy. **Dependencia declarada:** la tarea #7 de abajo (enlaces cruzados «Ver historial →») espera a que terminen los rediseños en curso de Caja/Punto de Venta (`ventas-visual-redesign-240e2b`) y de Comprobantes/ex-Facturación (ADR-0165, «envío automático a SUNAT y series», con dos migraciones sin pegar en producción); no es un choque, es que enlazar hacia una pantalla que está cambiando de forma ahora mismo sería enlazar hacia un blanco móvil.

## 0 · Veredicto
El «libro» de ventas es sólido por dentro —cursor estable, RLS correcta, defensas reales contra una migración que aún no llegó a producción— pero acaba de sumar una dependencia nueva (`cliente:clientas`) que, a diferencia de todo lo demás en este archivo, no tiene el mismo resguardo si esa migración no está en producción cuando el código se despliegue: podría tumbar la pantalla entera, no solo el nombre de la clienta. Sigue siendo, como en el análisis anterior, un libro que no ayuda a encontrar una venta ni a actuar sobre ella —sin buscador, sin acciones, sin enlaces de entrada ni de salida— y eso es justo lo que la separa de Shopify, Square y Lightspeed.
**Cumple su finalidad:** 6,0/10 · **Relevancia:** 8,0/10 — Núcleo

## 1 · Finalidad declarada
"Esta pantalla existe para ser el libro de todas las ventas registradas —de cualquier fecha y de todas las tiendas— donde se encuentra una venta concreta, se mide el pulso de un período y se llega al detalle; es de solo lectura: una venta se corrige con el proceso (anular, cambio, devolución), nunca tocando la fila."
Fuente: `docs/adr/0147-historial-de-ventas-en-ventas-sin-funcion-nueva.md` y `docs/BACKLOG.md:128-135` («Historial de ventas»), no la captura ni el análisis anterior. Coinciden docs y pantalla en «libro» y «pulso»; siguen sin coincidir del todo en «donde se encuentra una venta concreta» (sin buscador, §4 Funciones) y en «se llega al detalle» (el detalle no lleva a ningún otro proceso, §4 Funciones).
Nota: `docs/datos/modulos/07-ventas-y-caja.md` avisa que describe V1; no se cita como vigente. Mandan el código y lo que `BACKLOG`/`BITACORA` registran como verificado en producción.

## 2 · Objeción
1. **La pantalla acaba de ganar una dependencia sin el resguardo que el resto del archivo sí tiene.** `EMBEBIDOS_LISTA` en `lib/ventas-historial.ts:45-51` embebe `cliente:clientas ( nombre )` a través de la FK `ventas_clienta_fk`, creada por la migración `20260922140000_ficha_de_clienta_v1_backend.sql` `[código]`. Esa migración **no está aplicada en producción** — `docs/BITACORA.md:8812`, «Sin resolver: una migración sin aplicar en producción», 2026-09-22 `[producción, BITACORA 2026-09-22]`. El mismo archivo SÍ sabe protegerse de una migración aditiva que tarda: la columna `es_prueba` tiene un reintento explícito (`COLUMNA_INEXISTENTE = "42703"`, `ventas-historial.ts:63,132-133,161-162`) que quita la columna del `select` y vuelve a pedir. El embed de `clientas` no tiene ese reintento: si la relación no existe todavía, PostgREST no devuelve `42703` (columna inexistente) sino un error de relación no encontrada, y **ni `SELECT_LISTA` ni `SELECT_LISTA_SIN_PRUEBA` lo evitan** porque los dos incluyen `EMBEBIDOS_LISTA` `[código ventas-historial.ts:52-53]`. El propio comentario del archivo (línea 62) explica el patrón correcto y no lo aplicó a esta pieza nueva. Si el código sale a producción antes que la migración, no se pierde solo el nombre de la clienta: **se cae toda la lista y todos los totales**, porque `listarVentasHistorial` y `totalesVentasHistorial` pasan por la misma `consulta()`.
2. **Sigue siendo un libro que no ayuda a encontrar ni a actuar** — mismo defecto central del análisis anterior, verificado de nuevo hoy contra el código vivo, no heredado: `FiltrosHistorialVentas.tsx` no tiene una sola barra de texto (solo período/tienda/vendedor/pago/estado/comprobante, `:36-226`), y `buscarVentas` sigue siendo una función interna de `lib/ventas-v2.ts:118` que ningún componente de esta pantalla importa `[código, verificado hoy]`. `DetalleVentaModal.tsx:180-201` solo ofrece «Imprimir ticket» e «Imprimir … A4»: ninguna acción lleva a Cambiar, Devolver o ver el comprobante en Comprobantes. Es el mismo trade-off de siempre —una pantalla de solo lectura no debería iniciar un cambio de stock— pero hoy la resuelve desapareciendo la acción en vez de ofrecerla y dejar que el proceso real (Cambios/Devoluciones) la controle.

## 3 · Lo que está bien y no se toca
- **El cursor de paginado es estable y barato:** `(created_at, id)` descendente, con una fila de más para saber si hay página siguiente, sin `count()` aparte `[código ventas-historial.ts:126-131]`.
- **Lista y totales comparten la misma `consulta()`:** un total que no coincide con la lista es peor que ninguno, y acá no puede pasar (mismos filtros, misma fuente) `[código ventas-historial.ts:76-100,124-133,160-162]`.
- **Días de Lima correctos:** intervalo `[desde, hasta+1)` calculado en `-05:00`, agrupación con `Intl.DateTimeFormat` en `America/Lima` `[código ventas-historial-reglas.ts:90-99,229,233]`.
- **Defensa real contra una migración aditiva que tarda:** el patrón `COLUMNA_INEXISTENTE`/reintento para `es_prueba` es exactamente lo que D-54 (ADR-0159) pedía — nadie tiene que coordinar el despliegue del código con el de la migración para esa columna `[código ventas-historial.ts:58-63,124-133,160-162]` `[ADR-0159]`.
- **Una venta anulada no se disfraza:** se ve tachada, sigue en el libro, no suma a lo vendido ni al ticket ni al trazo `[código ventas-historial-reglas.ts:270-285,302-308; HistorialVentasLista.tsx:109,137,154]`.
- **El comprobante que se muestra es el correcto tras ADR-0164:** `elegirComprobante` cuenta boleta, factura y nota de venta como documento de la venta, y una nota de crédito no la reemplaza `[código ventas-historial-reglas.ts:198-204]`.
- **«Quién vendió» ya lee la asistencia real, no la sesión que cobró:** `quienVendio` prioriza `asesora_id` sobre `usuario_id` `[código ventas-historial-reglas.ts:236]`, con índice propio `ventas_asesora_id_idx` `[código supabase/migrations/20260922150000_venta_asesora_emisor_descuento_lider.sql:138]` — así el filtro «Vendedor» del líder no hace un escaneo completo.
- **La corrección de la analista anterior sobre `PaginacionCursor`:** el análisis 2026-09-21 decía que faltaba `<nav>`/`aria-label`; el código ya lo tenía entonces y lo sigue teniendo — `<nav aria-label="Paginación">` `[código Paginacion.tsx:128]`, verificado también contra el SHA `553c0ff7` que citaba ese análisis. Se corrige acá para no repetir un hallazgo que nunca fue cierto.
- **El total de cada día viene de la serie de TODO el rango, no de la página** — un día partido entre dos páginas muestra el mismo total en las dos `[código HistorialVentasLista.tsx:66-86]`.
- **RLS coherente con el resto del repo:** `ventas_select` usa `fn_puede_operar_ubicacion` (líder ve todo, integrante solo su tienda) `[código supabase/migrations/0004_rls.sql:103]`, sin política de UPDATE/DELETE en `ventas` — una venta se corrige con el proceso, nunca con un `update` directo.

## 4 · Las seis dimensiones
| Dimensión | Puntaje | Hallazgo principal | Evidencia |
|---|---|---|---|
| Estética | 7,0 | Coherente con Cambios/Devoluciones/Caja (Atelier); persisten chips de 10 px/`py-1` (~24 px) bajo el mínimo táctil, y ninguna pista visual (chevron/ícono) de que la fila abre un detalle | `[código FiltrosHistorialVentas.tsx:21; HistorialVentasLista.tsx:113-119]` |
| Lógica de negocio | 7,0 | Cursor, días de Lima y ADR-0164 correctos; «Por día» sigue dividiendo entre los días del rango, no entre los días con venta | `[código HistorialVentasPulso.tsx:145]` |
| Arquitectura | 6,0 | Consulta base compartida sin N+1 y RLS correcta, pero el embed nuevo `cliente:clientas` no tiene el resguardo de despliegue que sí tiene `es_prueba`, y el tope de 1000 sigue sin verificarse en producción | `[código ventas-historial.ts:45-53,58-63]` |
| Funciones | 5,0 | Sin buscador (la lógica existe y sigue sin exponerse), sin acciones desde el detalle, sin exportar | `[código FiltrosHistorialVentas.tsx; DetalleVentaModal.tsx:180-201; ventas-v2.ts:118]` |
| Utilidad | 6,0 | Sirve para mirar el libro; una clienta que devuelve a los 8 días obliga a salir y volver a buscar la prenda en otra pantalla | `[inferido del código, mismo escenario del análisis anterior]` |
| Conexión con el ERP | 5,0 | Ningún enlace de entrada (Caja/Punto de Venta/Comprobantes) ni de salida (Cambios/Devoluciones/Comprobantes); la tarea que lo resolvería está bloqueada, con razón, por tres rediseños en vuelo | `[código, verificado hoy con grep; docs/SESIONES-ACTIVAS.md]` |

### Estética (7,0)
(a) Coherencia CAYLA: hilo taupe por día, hoja de papel (`bg-papel`), esquinas suaves, tipografía serif en el título de la venta — la misma línea que Cambios, Devoluciones y Caja `[código HistorialVentasLista.tsx:63-99,127]`. `--color-rojo` aparece solo en estados `hover`/`focus` (subrayado de «Todo el historial», borde de chip al pasar el mouse, contorno de foco del botón que abre el detalle) `[código FiltrosHistorialVentas.tsx:23,142,204,218; HistorialVentasLista.tsx:118,137]`: no hay dos rojos a la vista al mismo tiempo, pero no se midió con el tablero real `[inferido]`.
(b) Marca y tono: el racimo de miniaturas de color cuando no hay foto (`Miniatura`, `HistorialVentasLista.tsx:184-188`) es un recurso propio de CAYLA que ningún referente externo tiene (§9).
(c) Universales: las píldoras de período (`PASTILLA`, `FiltrosHistorialVentas.tsx:21`) miden `px-3 py-1 text-[10px]` (~24 px de alto) y los desplegables del panel `h-9` (36 px, `FiltrosPildora.tsx:85`) — ambos por debajo de los 44 px táctiles recomendados para un mostrador/tablet `[código]`. La fila de una venta no tiene chevron ni ícono que anticipe que se abre un detalle; solo un cambio sutil de fondo al pasar el cursor (`hover:bg-tinta/[0.025]`, línea 113) — en tablet, sin cursor, esa pista no existe `[código]`.

### Lógica de negocio (7,0)
- El cursor `(created_at, id)` y el intervalo de Lima `[desde, hasta+1)` son correctos y estables ante empates `[código ventas-historial-reglas.ts:90-99]`.
- `elegirComprobante` sigue ADR-0164 (nota de venta cuenta, nota de crédito no reemplaza) `[código ventas-historial-reglas.ts:198-204]`.
- **«Por día» sigue siendo el mismo divisor engañoso del análisis anterior**, verificado de nuevo hoy: `HistorialVentasPulso.tsx:145` calcula `resumen.total / Math.max(1, dias.length)`, y `dias` viene de `serieDiaria` (`ventas-historial-reglas.ts:302-324`), que rellena con ceros todo el rango hasta 400 días. Con un ERP joven (ventas desde hace ~1 semana) y un rango de 30 días, el promedio sale bajo y el trazo casi plano — ninguna decisión escrita de Felipe fija cuál divisor es el correcto (`[ninguna decisión escrita cubre esto]`).
- **D-54/ADR-0159 (datos de prueba) está bien resuelto en el código pero no en producción todavía:** el toggle «Con datos de prueba» (`FiltrosHistorialVentas.tsx:115-120`) y el filtro `es_prueba = false` por defecto (`ventas-historial.ts:94`) existen, pero el script que marca las filas reales de producción **no se aplicó** (`docs/BITACORA.md:8805`, «nada se aplicó», 2026-09-22) `[producción, BITACORA 2026-09-22]`. Las ~14 boletas «pendiente hace más de un día» que el análisis anterior marcó como H2 pueden ser en parte esas mismas ventas de prueba sin archivar — no se puede saber cuánto sin correr E2 de nuevo (§ SQL pendiente).
- Referentes (de memoria, `[no verificable]`): Shopify, Square y Lightspeed resuelven "por día" con el propio rango elegido por quien mira, no con un relleno de ceros hasta 400 días.

### Arquitectura (6,0)
- **Cadena:** `page.tsx` → `FiltrosHistorialVentas`/`HistorialVentasLista`/`HistorialVentasPulso` (client) → `ventas-historial.ts` (server, PostgREST) → RLS `ventas_select`/`venta_items_select`/`venta_pagos_select`/`comprobantes_select` → tablas. Sin RPC propio salvo `fn_nombres_personas` para resolver nombres cross-schema `[código ventas-historial.ts:104-109]`.
- **Estado imposible que la base sí impide:** no hay política de UPDATE/DELETE en `ventas`; una fila del historial no se puede editar desde acá, solo desde `anular_venta` u otro proceso `[código 0004_rls.sql:103-105; inferido de la ausencia de política]`.
- **Estado imposible que el código no impide (nuevo):** desplegar esta versión del front antes que la migración `20260922140000` llegue a producción rompe la pantalla entera, no un campo — ver Objeción #1. **Se degrada así:** hoy, nada — no hay reintento ni mensaje específico; el error genérico de `exigir()` sube tal cual `[código resultado.ts, no leído a fondo esta vuelta; inferido]`.
- **Transacción:** ninguna — es lectura pura, no hay escritura desde esta pantalla.
- **Concurrencia:** dos líderes mirando el historial a la vez leen la misma foto sin bloquearse (PostgREST/RLS, sin problema); una venta que se anula mientras alguien mira la lista no se refleja hasta recargar — sin problema porque no es un panel «en vivo» como Caja.
- **Caída externa:** no aplica un proveedor externo directo (SUNAT la toca indirectamente vía `comprobantes.estado`, que esta pantalla solo lee).
- **Volumen:** sin cifra nueva verificada hoy (`[no verificable]`); la última cifra citada en `BACKLOG.md:130` es 16-17 ventas en producción (2026-09-21). A ese volumen ningún plan de acceso sufre. El tope de 1000 (`TOPE_TOTALES`, `ventas-historial-reglas.ts:25`) y el `max_rows = 1000` de `supabase/config.toml:21` siguen sin confirmarse en producción — E1 de la consulta SQL pendiente (§ SQL pendiente) es la única forma de saberlo.
- **Índices:** `ventas_asesora_id_idx` es nuevo (`20260922150000…sql:138`) y ayuda al filtro «Vendedor»; sigue sin existir un índice compuesto `(created_at desc, id desc)` que sostenga el cursor de esta pantalla a volumen — hoy no duele (16-17 filas), en 3 años con 3 tiendas sí (H9 del análisis anterior, sin resolver).
- **Lentes extra:** **RLS** (correcta, sin cambios) y **datos personales** — el nuevo embed trae `clientas.nombre`, dato personal real; no se ve en este archivo por la regla de enmascarado, y la tabla `clientas` ya separa el consentimiento de WhatsApp del dato transaccional (Ley 29733) según su propia migración `[código 20260922140000…sql:159]`.

### Funciones (5,0)
- **Existen y funcionan:** filtros por período/tienda/vendedor/pago/estado/comprobante, lista agrupada por día, pulso del período, paginado por cursor, detalle con reimpresión de ticket/A4, toggle de datos de prueba.
- **Fantasma:** ninguna encontrada esta vuelta (a diferencia de Caja, no hay componentes huérfanos en el mapa de este screen).
- **Faltan, para cumplir la finalidad declarada:** buscador único (boleta/DNI/clienta/prenda) — la lógica ya existe como `buscarVentas` en `ventas-v2.ts:118` y sigue sin exponerse aquí; acciones desde el detalle (Cambiar/Devolver/Ver comprobante); enlaces de entrada desde Caja, Punto de Venta y Comprobantes.
- **Sobran:** nada — a diferencia de Caja, esta pantalla no acumuló código muerto.

### Utilidad (6,0)
Escenario: una clienta vuelve a los 8 días con una prenda para devolver, y la colaboradora de turno (nueva, sin capacitación completa) necesita encontrar esa venta.
1. Abre Historial. El período por defecto es 30 días `[código movimientos-reglas.ts + ventas-historial-reglas.ts:71-87]`, así que la venta de hace 8 días SÍ aparece — bien.
2. No hay un campo de texto: tiene que reconocer visualmente la fila entre las de esos 8 días, o usar los filtros de píldora (tienda/vendedor/pago/estado/comprobante), ninguno de los cuales busca por clienta ni por prenda.
3. La encuentra por el título (`titulosDePrendas`, el nombre del producto o su código si falta la descripción) y la abre.
4. En el detalle ve el total, las líneas, los pagos y el comprobante — y dos botones: «Imprimir ticket» e «Imprimir … A4». **Ninguno dice «Devolver» ni «Cambiar».** Tiene que cerrar el modal, salir de Historial, entrar a Devoluciones, y volver a buscar la misma venta o la misma prenda desde cero.
Se equivoca de pantalla en el paso 4 por diseño, no por falta de capacitación: el sistema le mostró la venta exacta y no le ofreció el siguiente paso obvio.

### Conexión con el ERP (5,0)
Ver §6.

## 5 · Relevancia
| Criterio | Peso | Puntaje | Por qué (una línea) |
|---|---|---|---|
| Gestión (directo + indirecto) | ×2 | 9 | Es el registro de verdad para verificar que una venta ocurrió, reconciliar el día y decidir si un reclamo es legítimo; Cambios/Devoluciones/Caja dependen indirectamente de que este libro sea correcto. |
| Dinero y stock que toca | ×1 | 9 | Todo el dinero vendido pasa por acá para mostrarse; no escribe, pero un total mal calculado (H1 latente) engaña a quien decide con esa cifra. |
| Frecuencia y personas que la usan | ×1 | 7 | Se usa siempre que hay que revisar una venta pasada, pero con fricción real (sin buscador) — y es, en palabras de Felipe, la pantalla que menos le gusta del módulo. |
| Qué se detiene si falla | ×1 | 6 | Las ventas nuevas no se frenan si Historial falla (es de solo lectura); sí se detiene la capacidad de auditar, reconciliar o resolver un reclamo. |

Relevancia = (2·9 + 9 + 7 + 6) / 5 = **8,0** → **Núcleo**.

## 6 · Conexión con el ERP
- **Aguas arriba:** `ventas`, `venta_items`, `venta_pagos`, `comprobantes` (escritos por `registrar_venta`, Caja y Comprobantes/ex-Facturación), y ahora `clientas` (escrita desde `/clientas` y, cuando esa pantalla se conecte al mostrador, desde Punto de Venta — `docs/BITACORA.md:8812`).
- **Aguas abajo:** ninguna — es una hoja terminal. El detalle solo produce una reimpresión (ticket/A4), no un dato que otra pantalla consuma.
- **Pájaro dueño y vecinos:** COLIBRÍ (Ventas y caja) según `docs/datos/generado/AVIARIO.md:19,110` `[producción, generado]` — el archivo aún lista `clientes`, no `clientas`, coherente con que esa migración no está en producción. Vecinos directos: Caja, Cambios, Devoluciones, Comprobantes (comparten `ventas`/`comprobantes`).
- **Externos, y qué pasa si caen:** ninguno de forma directa. Indirectamente, el estado del comprobante que esta pantalla muestra depende de que Comprobantes/Lucode-SUNAT respondan; si SUNAT no responde, el chip sigue diciendo «Pendiente de enviar»/«En cola: se reintenta solo» sin que esta pantalla haga nada más — se degrada mostrando el estado tal cual está, nunca lo inventa ni lo oculta.

## 7 · Las 12 tareas, por importancia

### #1 · [Corregir] Que el embed nuevo de `clientas` no tumbe la pantalla si la migración no llegó a producción
- **Dónde:** `apps/web/lib/ventas-historial.ts:45-53` (`EMBEBIDOS_LISTA`), `:58-63,124-133,160-162` (patrón de reintento existente para `es_prueba`, como referencia).
- **Por qué en este puesto:** es el único hallazgo de hoy que puede tumbar la pantalla entera (lista Y totales), no degradar un campo; y la migración que la habilita (`20260922140000`) sigue sin producción según `docs/BITACORA.md:8812` (2026-09-22). El propio archivo ya resolvió este problema para `es_prueba` — falta aplicar el mismo criterio acá antes de que ambos cambios se desplieguen juntos.
- **Cómo lo verificas tú:** contra un Postgres local SIN la migración `20260922140000` aplicada, cargar `/vender/historial` como líder → debe mostrar la lista (con «Cliente varios» o similar en vez del nombre), no una pantalla de error.
- **Esfuerzo / dependencias:** S · antes de fusionar a producción cualquier rama que despliegue este archivo.

### #2 · [Corregir] Hacer fiable el aviso del tope de 1000 ventas
- **Dónde:** `lib/ventas-historial-reglas.ts:25` (`TOPE_TOTALES`), `lib/ventas-historial.ts:158-170` (`totalesVentasHistorial`), `supabase/config.toml:21` (`max_rows = 1000`, solo local).
- **Por qué en este puesto:** si `max_rows` de producción también es 1000 (el valor por defecto del dashboard de Supabase), PostgREST recorta en el mismo punto donde el código espera detectar el «hay más de 1000»: `parcial` jamás sería verdadero y los totales saldrían truncados en silencio, justo lo que el comentario del propio archivo (línea 23-24) dice evitar. Es un defecto latente sobre dinero mostrado (H1 del análisis anterior, sin resolver).
- **Cómo lo verificas tú:** en el dashboard de Supabase del proyecto `cayla-dynamic` → Settings → API, leer `max_rows`; si es 1000 o ausente, cambiar la detección (pedir `limite+1` real vía RPC de agregados) en vez de confiar en el corte silencioso.
- **Esfuerzo / dependencias:** M · si toca esquema (una RPC de agregados), confirma Felipe antes de escribirla.

### #3 · [Corregir] Distinguir «pendiente hace horas» de «pendiente hace días» en el chip del comprobante
- **Dónde:** `lib/comprobantes-reglas.ts:93-118` (`ESTADO_ESTILO`, `ESTADO_ETIQUETA`), `components/HistorialVentasLista.tsx:35-44` (`TONO_COMPROBANTE`, pinta `pendiente`/`enviado`/`pendiente_reintento` con el mismo tono ámbar).
- **Por qué en este puesto:** `ESTADO_ETIQUETA` ya distingue el texto («Pendiente de enviar» / «En cola: se reintenta solo» / «Enviado a SUNAT»), pero el color y la falta de antigüedad siguen sin decir si es un comprobante recién emitido o uno que lleva días sin transmitirse a SUNAT — es dinero fiscal en juego. ADR-0165 (envío automático) apunta a resolver la causa de fondo, pero sus dos migraciones (`20260922193700`, `20260922234100`) siguen sin producción (`docs/BITACORA.md:8845`, 2026-09-22): mientras tanto, esta pantalla sigue siendo el único lugar donde se ve la acumulación.
- **Cómo lo verificas tú:** una boleta con más de 24 h en `pendiente` se pinta o etiqueta distinto de una recién emitida (por ejemplo, «Pendiente hace 3 días» en vez de solo «Pendiente de enviar»).
- **Esfuerzo / dependencias:** S · no depende de ADR-0165, pero se vuelve menos urgente en cuanto esas migraciones lleguen a producción.

### #4 · [Mejorar] Barra de búsqueda única (boleta, DNI, clienta, prenda)
- **Dónde:** `components/FiltrosHistorialVentas.tsx` (agregar el campo), `lib/ventas-v2.ts:118` (`buscarVentas`, hoy interna — exponerla o portar su lógica a `ventas-historial.ts`).
- **Por qué en este puesto:** es lo que más separa esta pantalla de su finalidad declarada («donde se encuentra una venta concreta») y de los tres referentes externos (§9): los tres resuelven la búsqueda con una sola barra de texto.
- **Cómo lo verificas tú:** escribir un número de boleta o el nombre de una prenda en el buscador devuelve solo esas ventas y conserva el resto de los filtros y el cursor.
- **Esfuerzo / dependencias:** M.

### #5 · [Replantear] De libro cerrado a punto de partida: acciones desde la venta
- **Dónde:** `components/DetalleVentaModal.tsx:180-201` (hoy solo «Imprimir ticket» / «Imprimir … A4»).
- **Por qué en este puesto:** es el hallazgo que más le pesa a Felipe («es la que menos me gusta») y el que más consecuencia tiene sobre el trabajo diario — el escenario de la clienta que devuelve a los 8 días (§4 Utilidad) lo prueba paso a paso. Su único trabajo acá es pedirle a Felipe que decida (ver §8): no se puede dar por resuelto sin su OK, porque cambia el contrato de «esta pantalla nunca escribe».
- **Cómo lo verificas tú:** Felipe elige A o B en §8; con B, desde una venta de hace 8 días se llega a Devoluciones con la prenda ya elegida.
- **Esfuerzo / dependencias:** decisión primero; implementación L. No antes de que Cambios/Devoluciones terminen de asentar su propio flujo guiado (ya construido, ADR-0122/0125).
- **DECIDÍ (propuesta, la confirma Felipe):** el detalle gana botones «Devolver», «Cambiar» y «Ver comprobante» que abren esas pantallas con la venta/prenda ya elegida, sin que Historial ejecute ninguna escritura — solo pasa el `ventaId`.
- **DESCARTÉ:** *dejarlo como está* — obliga a repetir la búsqueda de la misma venta en otra pantalla, exactamente el defecto que Felipe señaló; *mover Cambios/Devoluciones dentro de Historial* — mezclaría la unidad «venta, de solo lectura» con la unidad «prenda, que se está procesando», rompiendo la regla actual que sí está bien (§3).
- **SE ROMPE SI:** una colaboradora nueva, con la clienta esperando en el mostrador, encuentra la venta en 10 segundos y luego pierde 2 minutos re-buscando la misma prenda en Devoluciones porque el detalle no le dio el atajo — y la clienta se impacienta por algo que el sistema ya sabía.

### #6 · [Corregir] Título de la venta con el nombre de la prenda, no el código
- **Dónde:** `lib/ventas-historial-reglas.ts:166-171` (`titulosDePrendas`), `:179-187` (`textoPrendas`), `lib/venta-detalle-reglas.ts:78` (mismo problema en el detalle) — todos usan `producto.referencia`, no `productos.descripcion`.
- **Por qué en este puesto:** sin datos nuevos de producción para confirmar cuántas líneas siguen sin `descripcion` hoy (el análisis anterior midió 46 % el 2026-09-21), el código no cambió: sigue siendo un defecto de lectura, aunque una parte sea deuda de catálogo, no de esta pantalla.
- **Cómo lo verificas tú:** ninguna fila muestra un código tipo «BLU-001» si el producto tiene `descripcion`; la referencia queda solo de respaldo.
- **Esfuerzo / dependencias:** S + catálogo (completar las descripciones que faltan es tarea de Productos, no de acá).

### #7 · [Conectar] Enlaces cruzados «Ver historial →» desde Caja, Punto de Venta y Comprobantes
- **Dónde:** `components/CajaAbiertaPanel.tsx:308` (hoy enlaza a `/caja/historial`, no a `/vender/historial`), Punto de Venta (sin ningún enlace a Historial hoy), Comprobantes (`app/(app)/vender/comprobantes/**`, sin enlace a Historial hoy) — verificado con grep sobre el código actual, ninguno de los tres apunta a esta pantalla.
- **Por qué en este puesto:** es la otra mitad del hallazgo H6/H7 del análisis anterior (BACKLOG:133) y la razón por la que hoy nadie llega acá desde el flujo normal de venta. Va después de las tareas de dinero (#1-#3) porque su ejecución depende de rediseños en vuelo, no de una decisión propia.
- **Cómo lo verificas tú:** desde Caja, con una caja abierta, un enlace «Ver todas las ventas →» lleva a `/vender/historial` filtrado por esa tienda y ese turno.
- **Esfuerzo / dependencias:** S por enlace · **no antes de que terminen** el rediseño de Caja/Punto de Venta (`ventas-visual-redesign-240e2b`) y el de Comprobantes (ADR-0165) — enlazar ahora sería enlazar hacia una pantalla que está cambiando de forma.

### #8 · [Corregir] Definir el divisor de «Por día» — decisión de Felipe
- **Dónde:** `components/HistorialVentasPulso.tsx:145`.
- **Por qué en este puesto:** mismo hallazgo del análisis anterior (H5), sin resolver, verificado de nuevo hoy contra el código: divide entre los días del rango elegido, no entre los días que de verdad tuvieron venta, y con un ERP de una semana de operación el promedio sale artificialmente bajo.
- **Cómo lo verificas tú:** la cifra mostrada coincide con la fórmula que Felipe elija (días del rango vs. días con venta).
- **Esfuerzo / dependencias:** S · espera la decisión.

### #9 · [Corregir] Alinear el alcance de la pantalla con la sede activa del líder
- **Dónde:** `app/(app)/vender/historial/page.tsx:57` (`alcance` se calcula solo, por `?sede=`), `lib/persona-actual.ts:39` (`COOKIE_UBICACION = "cayla_ubicacion_activa"`, el selector global que otras pantallas sí leen).
- **Por qué en este puesto:** un líder puede ver «Tienda TRU» en la cabecera global (por la cookie) y «Todas las tiendas» en el título de esta pantalla (porque `alcance` ignora esa cookie salvo que la URL traiga `?sede=`) — el mismo hallazgo del análisis anterior (H4), sin resolver.
- **Cómo lo verificas tú:** con «Tienda TRU» activa en la cabecera global, entrar a Historial sin tocar el filtro de tienda → el título no dice «Todas las tiendas» sin explicar por qué difiere de la cabecera.
- **Esfuerzo / dependencias:** S.

### #10 · [Corregir] Índice compuesto en `ventas` para el cursor a volumen
- **Dónde:** nueva migración con `create index on retail.ventas (created_at desc, id desc)`; opcionalmente `(ubicacion_id, created_at desc)` para el filtro de tienda.
- **Por qué en este puesto:** sin cifra de producción nueva (§ SQL pendiente, B1), pero el código no cambió: sigue sin existir ese índice (solo se sumó `ventas_asesora_id_idx`, que no cubre el orden del cursor). A 16-17 ventas no duele; con 3 tiendas y 3 años de operación, cualquier estimado razonable (unas 30-50 ventas/día × 3 tiendas × 365 × 3 ≈ 100 000-160 000 filas) sí empieza a notarse en un `order by created_at desc, id desc limit 21`.
- **Cómo lo verificas tú:** `explain analyze` de la consulta de `listarVentasHistorial` con datos simulados a ese volumen, sin `Seq Scan`.
- **Esfuerzo / dependencias:** M · migración a producción con prefijo `retail.`, confirma Felipe (regla de CLAUDE.md).

### #11 · [Mejorar] Objetivos táctiles y teclado — *bajo valor hoy*
- **Dónde:** `FiltrosHistorialVentas.tsx:21` (píldoras de 10 px/`py-1`), `FiltrosPildora.tsx:85` (`h-9`), `HistorialVentasPulso.tsx:64-69,96-97` (el gráfico solo responde a `onPointerMove`, sin equivalente de teclado).
- **Por qué al final:** no daña dinero ni datos; en un mostrador con dedo (no mouse) las píldoras de 24 px son más difíciles de tocar que el mínimo de 44 px, y el gráfico del pulso es puramente decorativo sin mouse/dedo con precisión.
- **Cómo lo verificas tú:** en la emulación de tablet (768 px, táctil), las píldoras de período se tocan sin fallar dos veces de cada diez.
- **Esfuerzo / dependencias:** S.

### #12 · [Mejorar] Pruebas de integración con clics reales — *bajo valor hoy, pendiente propio del BACKLOG*
- **Dónde:** `lib/ventas-historial-reglas.test.ts` (hoy solo pruebas unitarias sobre funciones puras); falta lo que `docs/BACKLOG.md:132` ya pide: «cambiar filtros con el mouse, paginar, tocar una fila, el hover del pulso y una venta anulada de verdad».
- **Por qué al final:** ningún dato dice que esto esté rompiéndose hoy; es cobertura preventiva, no un defecto encontrado.
- **Cómo lo verificas tú:** una prueba e2e o de integración que abra `/vender/historial`, cambie un filtro, pagine y abra el detalle, corriendo en CI.
- **Esfuerzo / dependencias:** M · depende de tener una venta anulada real en algún entorno de prueba (hoy no hay ninguna, según el mismo BACKLOG).

## 8 · Estrategia alternativa

**De libro cerrado a punto de partida (la misma pregunta que la tarea #5, en Ganas/Pagas).**

| | **A — Historial se queda de solo lectura (hoy)** | **B — El detalle ofrece Devolver/Cambiar/Ver comprobante** |
|---|---|---|
| **Ganas** | La regla «una venta no se toca desde acá» es simple y ya está probada; cero riesgo de que Historial termine escribiendo algo. | Una colaboradora resuelve el caso real («la clienta que vuelve a los 8 días») sin salir de la pantalla donde ya encontró la venta; es lo que hacen los tres referentes (§9). |
| **Pagas** | Cada devolución o cambio empieza con una búsqueda repetida en otra pantalla — el costo que Felipe ya nombró como el motivo de que no le guste esta pantalla. | Historial deja de ser puramente terminal: hay que cuidar que los botones solo *naveguen* (pasen el `ventaId`) y nunca escriban desde acá, o la regla «solo lectura» se vuelve solo de palabra. |

No la doy por decidida: cambia el contrato de la pantalla. **Decide Felipe.**

## 9 · Referentes de ERP y futuro
`[no verificable]`: lo que sigue viene de memoria de productos externos, no de una fuente citada hoy (el análisis anterior sí citó URLs de ayuda oficial para Shopify/Square/Lightspeed el 2026-09-21; se resume acá sin repetir la tabla completa).
- Shopify, Square y Lightspeed resuelven la búsqueda con una sola barra de texto sobre boleta/clienta/producto — filtro obligatorio: le sirve a CAYLA hoy (tarea #4, no futuro).
- Vistas guardadas de un clic («Pendientes de comprobante», «Anuladas») — sirve a 3 tiendas hoy, pero es comodidad, no lo que Felipe señaló como el defecto que más le pesa; queda en BACKLOG como opcional, no entre las 12.
- Exportar a CSV — todos los referentes lo tienen; útil para contabilidad, pero nadie lo pidió todavía → Futuro.
- Conteo por denominaciones o doble firma: no aplican a esta pantalla (son de Caja).

## 10 · Fuera de esta pantalla
**El mismo patrón de «embed nuevo sin resguardo de despliegue» puede repetirse en cualquier otra pantalla que ya use `clientas` antes de que la migración `20260922140000` llegue a producción.** `grep` sobre el repo muestra `clientas` referenciada en `lib/caja.ts`, `lib/inventario-v2.ts`, `lib/cambios-estadisticas.ts`, `lib/resumen-reglas.ts`, `components/ApartadosModal.tsx`, `components/ResumenComparacionPanel.tsx`, `components/ResumenDesempenoPanel.tsx`, además de `ClientasPanel.tsx`/`app/(app)/clientas/page.tsx` (la pantalla dueña). No verifiqué si esos otros archivos también embeben la tabla directamente o solo mencionan la palabra en un comentario — un barrido de 10 minutos antes de fusionar cualquier rama que toque `clientas` evitaría que el mismo error de Historial se repita en 5 pantallas a la vez el día que alguien despliegue sin pegar antes la migración. Es más grave que cualquier otro hallazgo de este archivo porque no se ve desde ninguna pantalla individual: solo se ve mirando todas a la vez, que es exactamente lo que ninguna auditoría de `/pantalla` hace por diseño (analiza una pantalla).

## 11 · Líneas propuestas para BACKLOG.md
Felipe aprueba antes de anexar (**no editar `docs/BACKLOG.md` sin su OK**).

- [ ] `[pantalla:vender-historial]` #1 Resguardar el embed `cliente:clientas` con el mismo patrón de reintento que `es_prueba`, antes de desplegar — S
- [ ] `[pantalla:vender-historial]` #2 Verificar `max_rows` de producción y hacer fiable el aviso del tope de 1000 — M
- [ ] `[pantalla:vender-historial]` #3 Antigüedad visible del comprobante pendiente (independiente de ADR-0165) — S
- [ ] `[pantalla:vender-historial]` #4 Barra de búsqueda única (boleta, DNI, clienta, prenda) — M
- [ ] `[pantalla:vender-historial]` #5 Replantear: acciones desde la venta (Devolver/Cambiar/Ver comprobante) — decisión + L
- [ ] `[pantalla:vender-historial]` #6 Título con nombre de la prenda, no código — S + catálogo
- [ ] `[pantalla:vender-historial]` #7 Enlaces «Ver historial →» desde Caja/Punto de Venta/Comprobantes — S por enlace, espera rediseños en vuelo
- [ ] `[pantalla:vender-historial]` #8 «Por día»: decisión de Felipe sobre el divisor — S
- [ ] `[pantalla:vender-historial]` #9 Alinear el alcance con la sede activa (cookie global) — S
- [ ] `[pantalla:vender-historial]` #10 Índice compuesto en `ventas` para el cursor — M
- [ ] `[pantalla:vender-historial]` #11 Objetivos táctiles de 44 px y teclado en el gráfico — S (bajo valor)
- [ ] `[pantalla:vender-historial]` #12 Pruebas de integración con clics reales — M (bajo valor)
- [ ] `[pantalla:vender-historial]` Fuera de la pantalla: barrer los demás consumidores de `clientas` antes de desplegar esa migración — S

## SQL pendiente
No se corrió SQL nuevo esta vuelta (regla del Paso 2: no bloquear el flujo). Lo que `BACKLOG`/`BITACORA` ya tenían verificado se citó como `[producción, fecha]` en cada hallazgo. Lo que sigue sin verificar, con la plantilla de `.claude/skills/pantalla/plantilla-sql.md`:

```sql
-- E1. ¿Cuál es el tope de filas que devuelve la API hoy? (si sigue en 1000, la tarea #2 es urgente)
select rolname, rolconfig from pg_roles where rolname = 'authenticator';

-- E2. Estado real de los comprobantes y cuántos siguen "pendiente" por más de un día,
--     separando los que ya deberían estar marcados es_prueba (si la migración D-54 se aplicó)
select estado, tipo, count(*) as n, min(created_at) as el_mas_viejo,
       count(*) filter (where created_at < now() - interval '1 day') as con_mas_de_1_dia
from retail.comprobantes
group by 1, 2 order by 3 desc;

-- E5 (repetida). Prendas vendidas sin descripción legible, para medir si la tarea #6 sigue igual de grande
select count(*) as lineas_vendidas,
       count(*) filter (where pr.descripcion is null or pr.descripcion = '') as producto_sin_descripcion
from retail.venta_items vi
join retail.variantes va on va.id = vi.variante_id
join retail.productos pr on pr.id = va.producto_id;

-- F1 (nueva). ¿Ya existe la relación ventas_clienta_fk / la tabla clientas en producción?
select table_name from information_schema.tables where table_schema = 'retail' and table_name = 'clientas';
select conname from pg_constraint where conname = 'ventas_clienta_fk';

-- F2 (nueva). Volumen actual, para decidir si la tarea #10 (índice) ya urge
select count(*) as filas, min(created_at) as primera, max(created_at) as ultima from retail.ventas;
```

## Inventario de elementos
| Zona | Elemento | Qué hace | Veredicto (bien / ajustar / sobra / falta) | Evidencia |
|---|---|---|---|---|
| Cabecera | Título «Historial» + `ResumenSede` (vendido, ventas) | Cifras del rango completo | bien (se oculta si `parcial`) | `[código page.tsx:65-82]` |
| Filtros | Píldoras de período (7/30/90/Personalizado/Todo) | Cambian el rango en la URL | bien; táctil bajo el mínimo | `[código FiltrosHistorialVentas.tsx:99-121]` |
| Filtros | «Con datos de prueba» | Trae de vuelta ventas `es_prueba` | bien, defensivo ante migración pendiente | `[código :115-120; ventas-historial.ts:58-63]` |
| Filtros | Panel de píldoras (tienda/vendedor/pago/estado/comprobante) | Filtros adicionales | bien | `[código :149-193]` |
| Filtros | — | Buscador de texto libre | **falta** | `[código, ausente]` |
| Lista | Fila por día, con total del día | Agrupa y muestra ventas | bien | `[código HistorialVentasLista.tsx:66-99]` |
| Lista | Racimo de miniaturas | Colores/fotos de las prendas vendidas | bien | `[código :162-188]` |
| Lista | Título de la venta | Nombre o código de la prenda | ajustar (usa `referencia`, no `descripcion`) | `[código ventas-historial-reglas.ts:166-171]` |
| Lista | Chip de comprobante | Estado ante SUNAT | ajustar (sin antigüedad, mismo tono para 3 estados) | `[código HistorialVentasLista.tsx:35-44]` |
| Lista | Botón que abre el detalle | Cubre la fila entera | ajustar (sin pista visual sin hover) | `[código :113-119]` |
| Lateral | Pulso del período (SVG) | Trazo + mejor día + cómo se pagó | bien; sin teclado | `[código HistorialVentasPulso.tsx]` |
| Lateral | «Por día» | Promedio del rango | ajustar (divisor engañoso, H5) | `[código :145]` |
| Paginación | `PaginacionCursor` | Avanza por cursor | bien, con `<nav aria-label>` (el análisis anterior decía que faltaba: no era cierto) | `[código Paginacion.tsx:128]` |
| Detalle | `DetalleVentaModal` | Líneas, pagos, comprobante, reimpresión | ajustar (sin acciones de proceso) | `[código DetalleVentaModal.tsx:180-201]` |
| Consulta | `cliente:clientas` embed | Trae el nombre de la clienta | **ajustar — riesgo de romper la pantalla entera sin la migración en producción** | `[código ventas-historial.ts:45-53]` |

## Historial
| Fecha | Modo | Cumplimiento | Relevancia | Tareas cerradas de las 12 anteriores |
|---|---|---|---|---|
| 2026-09-21 | completo + referentes (Shopify, Square, Lightspeed) | 6/10 | 8/10 | — (primer análisis) |
| 2026-09-22 | completo (sin SQL nuevo; se reutilizó evidencia de producción ya citada en BACKLOG/BITACORA con su fecha) | 6,0/10 | 8,0/10 | Ninguna de las 12 del análisis anterior se cerró tal cual. **Cerca de cerrarse por trabajo de otras sesiones, no de esta pantalla:** la corrección de «`PaginacionCursor` sin `<nav>`» resultó ser un hallazgo equivocado del análisis anterior (ya existía en el SHA que citaba, `553c0ff7`); «`fn_ventas_del_dia` no filtra `ventas.estado`» (BACKLOG:135, deuda ajena) se corrigió en la migración `20260921103000` aplicada en producción — no afecta a esta pantalla directamente (usa su propia consulta), pero cierra esa nota. Todo lo demás (búsqueda, acciones desde la venta, enlaces cruzados, tope de 1000, título con código, «Por día», índices, pruebas e2e) sigue abierto, y se sumó un hallazgo nuevo (#1, el embed de `clientas`). |
