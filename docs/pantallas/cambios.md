# Pantalla — Cambios (`/cambios`)

> **Colisión doble declarada por el workflow — verificada y desmentida.** El disparador de este análisis afirmaba una "colisión doble, la más seria del módulo" entre `interface-recommendations-8ce365` (commits locales sin push) y `ventas-visual-redesign-240e2b` (PR #128 "abierto sin fusionar"). Lo comprobé contra el repo real: **PR #128 está `MERGED`** (`gh pr view 128` → `state: MERGED`, fusionado el 2026-09-18 como `b0b3ecfd`), y el diseño de `interface-recommendations-8ce365` (flujo guiado de 4 pasos, `ComprasAgrupadas`, `FlujoGuiado`) **ya es el código vigente de `origin/main`** — los archivos que esa rama iba a reemplazar (`CambioFormV2.tsx`, `CambiosLista.tsx`) ya no existen en el árbol. Más: hoy mismo se fusionó otro PR con el mismo scope de commit en el título — **#261** ("docs(cambios): auditoría de la pantalla /cambios", el análisis anterior de este mismo archivo, `bb540298`). **Corrección sobre esta misma nota:** el PR #292 lleva "cambios" en el título (`feat(cambios): Actividad reciente resume una tarjeta por venta`, mergeCommit `6b8b9058`), pero el título está mal escrito — su commit real es `feat(devoluciones): ...` y su propio mensaje dice «Cambios no se toca»; los archivos que tocó (`DevolucionesVentas.tsx`, `devoluciones-reglas.ts`, `DevolucionesPanel.tsx`) lo confirman. No es un PR sobre esta pantalla; ver §0 y §10. No hay colisión activa sobre `/cambios` en este momento. Lo que sí hay es un **hallazgo real, distinto**: `docs/SESIONES-ACTIVAS.md` tiene filas de 2026-09-18 (#22, #23, #24) que describen trabajo ya fusionado hace días y nunca se movieron a "Cerradas hoy" — el tablero que se creó *exactamente* para evitar colisiones fantasma está generando una. Va en la sección 10.

> Modo: completo · Fecha: 2026-09-22 · Rol/sede: líder · TIENDA TRU · Datos: **real, reutilizado** — la muestra de producción (1 cambio, 18 ventas en TRU, 0 prendas en cuarentena) es la que Felipe pegó el 2026-09-21 para el análisis anterior; ningún cambio de código desde entonces toca las tablas que esas consultas leyeron (`cambios`, `venta_items`, `prendas_danadas`), así que las reuso como `[producción, 2026-09-21]` en vez de pedir a Felipe que las repita. Donde no hay dato reciente, digo `[no verificable]`.
> SHA analizado: `88457700` (= origin/main; rama local del worktree 10 commits detrás, se leyó todo con `git show origin/main:<archivo>`)
> Archivos: `apps/web/app/(app)/cambios/page.tsx` · `CambiosPanel.tsx` → `BuscadorVentas` · `CambiosVentas.tsx` (`ComprasAgrupadas`, sin cambios — sigue solo en modo `renderFila`, una fila por prenda) · `CambiosFlujo.tsx` → `CambioReemplazo.tsx`/`CambioResumen.tsx` · `lib/cambios-reglas.ts` · `lib/cambios-estadisticas.ts` · `lib/ventas-v2.ts` (`getVentasRecientes`) · RPC `registrar_cambio` (migración `20260919000100`, sin cambios desde el análisis anterior) · tablas `cambios`, `prendas_danadas`, `venta_items`, `movimientos`, `cajas`
> Otra sesión tocándola: **no, ahora mismo.** Ver la nota de arriba: las tres filas de `SESIONES-ACTIVAS.md` que mencionan `/cambios` describen trabajo ya fusionado.

## 0 · Veredicto
Sigue siendo de lo mejor construido del ERP en ergonomía, y sin cambios reales desde el análisis anterior. **Corrección sobre lo que dijo un borrador previo de este análisis:** el PR #292 ("Actividad reciente resume una tarjeta por venta", fusionado hoy) **no tocó esta pantalla** — su propio mensaje de commit lo dice explícitamente («`ComprasAgrupadas` gana `renderCompra`... Cambios no se toca»), y lo confirmé leyendo `CambiosVentas.tsx`: sigue usando solo `renderFila`, sin el nuevo modo `renderCompra`. La mejora es real, pero es de `/devoluciones`, no de `/cambios` — quien lea este archivo no debe restar la tarea de estética de la lista de pendientes de Cambios (ver #10). Y el defecto que importa sigue sin tocarse: un cambio con diferencia de precio **sigue moviendo plata sin comprobante, sin líder y, si no es efectivo, sin que la caja se entere** — exactamente el mismo RPC del análisis anterior, con la misma diferencia real en producción: **S/ 100 devueltos por Plin, sin nota de crédito, sin aprobación.**
**Cumple su finalidad:** 5.0/10 (promedio 6.08, con tope 5 por defectos que pueden dañar dinero y stock) · **Relevancia:** 5.8/10 — Comodidad (en el borde de Soporte)

## 1 · Finalidad declarada
"Esta pantalla existe para que quien está en caja cambie una prenda de una compra de los últimos 15 días por otra, moviendo bien el stock y la caja, sin pedir autorización de líder."
Fuente: `docs/datos/15-COMO-OPERA-CAYLA.md` R-37 (primero se cambia; nota de crédito o vale después; devolver plata es lo último), R-38 (15 días, lo aplica cualquiera en caja), R-39 (el estado de la prenda decide el destino); ADR-0125, ADR-0053, ADR-0064; D-79 (`docs/datos/DECISIONES-2026-09-21-menu-comercial.md`, motivo obligatorio en 1 toque). No sale de la captura.
¿Docs y pantalla coinciden? **Casi**, igual que antes. Dos mismas diferencias: (1) el botón «Sin comprobante →» parece iniciar un cambio sin venta, pero es un atajo de filtro `[código CambiosPanel.tsx:128-136]`; (2) R-37 pone «devolver la plata» como última opción y la pantalla la ofrece como método por defecto de una diferencia negativa. Ninguna decisión escrita cubre el punto (2): D-43 habla de devoluciones, no de cambios con reembolso, y la migración nueva de motivo (D-79, 20260922180000) documenta explícitamente que dejó fuera unificar el vocabulario de Cambios con el de Devoluciones — una decisión, no un olvido `[código 20260922180000...sql:54-66]`.

## 2 · Objeción
**Un cambio con diferencia sigue siendo dinero que entra o sale del negocio sin ningún documento ni ninguna aprobación — y nadie tocó eso desde el análisis anterior.**
- `registrar_cambio` es exactamente el mismo cuerpo del 2026-09-19 (`git diff HEAD origin/main -- supabase/migrations/20260919000100...sql` → sin cambios). La diferencia se sigue guardando solo en `cambios.diferencia`: no genera boleta, nota de crédito ni línea de venta `[código 20260919000100...sql:155-211]`.
- **Producción sigue demostrándolo con el mismo caso** (nadie más se registró desde el 2026-09-21): el único cambio (2026-09-18) cambió una prenda de S/ 179 por una de S/ 79, diferencia **−S/ 100, método `plin`**. La boleta de esa venta sigue diciendo S/ 179. `[producción, 2026-09-21]`
- **Si la diferencia no es efectivo, ni el arqueo ni ningún reporte la ven.** Confirmado de nuevo hoy: `lib/caja.ts:117` y `app/actions/caja.ts:35` siguen filtrando `.eq("metodo_pago_diferencia", "efectivo")` `[código, verificado 2026-09-22]`.
- **Sin líder.** `registrar_cambio` no llama `fn_es_lider()` en ningún punto (grep sobre el archivo, 0 resultados) `[código]`. La misma diferencia de S/ 100 en Devoluciones exige líder (`aprobar_devolucion` sí la llama).
- **Candado de concurrencia cambio↔devolución: sigue sin existir, y lo volví a verificar hoy sobre la versión más reciente de `crear_devolucion`** (`20260922180000_devoluciones_motivo_estructurado.sql`, fusionada esta misma tarde). Su `v_ya_devuelto` solo suma `devolucion_items` — nunca mira `cambios` — y no usa `for update` `[código 20260922180000...sql:139-141]`. `registrar_cambio` tiene el mismo hueco en el sentido contrario (`…sql:144`). Una migración que sí tocó `crear_devolucion` hoy y no cerró esto confirma que el hueco no es un descuido puntual: nadie lo ha puesto en la lista de lo que hay que arreglar cuando se toca esa función.
- **La prenda nueva sale del piso sin venta**, igual que antes: `motivo='cambio'` en el movimiento, sin línea de venta, sin costo ni margen para R-41. `[código]` `[inferido]` sobre el reporte.

Trade-off: cerrar esto toca dinero real y SUNAT (CLAUDE.md: confirmar antes). El remedio natural —nota de crédito— **sigue sin poder emitirse para una venta con boleta**, pero el estado avanzó un poco: **Felipe ya decidió la opción A el 2026-09-21** (una serie de nota de crédito con prefijo B por tienda) — **"Falta ejecutarlo"**, dice el BACKLOG hoy `[BACKLOG.md:451, verificado 2026-09-22]`. Sigue sin ejecutarse: la tarea #1 de abajo sigue bloqueada por lo mismo, con una salida ya decidida y solo pendiente de aplicar.

## 3 · Lo que está bien y no se toca
- **Una sola transacción, sin cambios**: `registrar_cambio` sigue siendo `security definer` con `search_path` fijo, escribe `cambios`, dos `movimientos` y `prendas_danadas` si corresponde, todo o nada. `[código 20260919000100...sql:89-211]`
- **Idempotencia**: `token_cliente` con índice único parcial, sin cambios. `[código CambiosFlujo.tsx:117,240]`
- **Candados en la tabla**: `cambios_defecto_no_vuelve_al_piso`, `cambios_diferencia_liquidada`, listas cerradas de `motivo`/`condicion`/`metodo_pago_diferencia`, `prendas_danadas_un_origen`. Sin cambios.
- **RLS activo y sin escritura directa**: sin cambios (no hay migración nueva sobre políticas de `cambios`).
- **El precio nuevo lo lee el servidor**, no el cliente. `[código :150]`
- **`ComprasAgrupadas` (el componente de lista compartido) sigue bien resuelto y sin cambios**: el hilo vertical, el agrupado por día y por compra, y la grilla `auto-fill` de mínimo 34rem `[código ComprasAgrupadas.tsx:106-144]` siguen sirviendo tanto a Cambios como a Devoluciones.
- **La selección de qué prenda cambiar sigue siendo correcta cuando no viene preseleccionada**: `CambiosFlujo` arranca en el paso "Prenda" (`paso 2`) cuando `lineaInicialId` es `null` y deja elegir con radios, cada una con su propio chip de estado `[código CambiosFlujo.tsx:106-107,261-312]`. No hay ningún estado roto por el cambio: lo probé leyendo el flujo completo con `lineaId = null`.
- **Cero datos sucios**, igual que en el análisis anterior (mismas tablas, sin cambios de fondo): sin cambios sobre venta anulada, sin misma variante, sin fuera de plazo, sin efectivo sin caja. `[producción, 2026-09-21]`
- **Sin objeción de rendimiento**, sin cambios: ~6 600 filas en 3 años a este ritmo. `[producción, 2026-09-21]` `[inferido]`
- **Estética base**: cabecera con hilo y título serif iguales a Caja/Devoluciones/Facturación; rojo solo en «Confirmar cambio»; chips con palabra e ícono. Sin cambios, sigue bien.
- **`docs/pantallas/devoluciones.md` tarea #8 ya tiene su solución construida** (PR #292, `actividadPreviaVenta`/`totalesVenta`/`valorPagado` en `devoluciones-reglas.ts:150-193`) — es la misma queja de estética que sigue abierta en Cambios (#10 de abajo), resuelta primero del lado de Devoluciones. Cuando se lleve a Cambios, debería usar el mismo patrón (`renderCompra` de `ComprasAgrupadas`) para no repetir la solución dos veces (principio de integridad conceptual).

## 4 · Las seis dimensiones
| Dimensión | Puntaje | Hallazgo principal | Evidencia |
|---|---|---|---|
| Estética | 7.5 | Sin cambios reales: la grilla `ComprasAgrupadas` (compartida) mejoró para Devoluciones, no para Cambios, que sigue en modo fila-por-prenda. El paso 3 sigue igual: select nativo, colores de 40 px, textos de 11 px | `[código CambiosVentas.tsx:1-53]` `[código CambioReemplazo.tsx:248,339]` |
| Lógica de negocio | 4.0 | Sin cambios: dinero sin comprobante ni líder; descuento ignorado; plazo solo en pantalla; sin vale | `[producción, 2026-09-21]` `[código 20260919000100...sql:144-155]` |
| Arquitectura | 5.5 | Sin cambios: atómica e idempotente, pero sin candado de concurrencia — reverificado hoy contra `crear_devolucion` recién fusionada | `[código 20260922180000...sql:139-141]` |
| Funciones | 6.0 | Sin cambios: "actividad previa" (cambiada/devuelta/pendiente de un vistazo) existe para Devoluciones (`devoluciones-reglas.ts:165-187`), no para Cambios; siguen faltando vale/nota de crédito y el tope de 30 compras sigue silencioso | `[código devoluciones-reglas.ts:165-187]` `[código ventas-v2.ts:75]` |
| Utilidad | 7.0 | Sin cambios: el paso 3 sigue juntando 8 decisiones y el método de pago sigue invitando a Plin sin verificación; la lista de "Actividad reciente" de Cambios sigue siendo 18 botones idénticos | `[código]` `[inferido]` |
| Conexión con el ERP | 5.0 | Sin cambios: llega a movimientos, stock y caja (solo efectivo); no llega a ventas, comprobantes ni márgenes | `[código]` `[producción, 2026-09-21]` |

**Cumple su finalidad:** (7.5 + 4.0 + 5.5 + 6.0 + 7.0 + 5.0) / 6 = 5.83 → **tope 5** (el mismo defecto que ya bajaba la nota en el análisis anterior sigue sin tocarse: diferencia sin comprobante ni líder; cambio↔devolución sin candado, reverificado hoy contra código nuevo).

### Estética — 7.5 (sin cambios)
- **Corrección: la mejora de "Actividad reciente" (tarjeta por venta) NO llegó a esta pantalla.** El commit `aa5f07f6` ("feat(devoluciones): Actividad reciente resume una tarjeta por venta") dice en su propio mensaje «Cambios no se toca», y `CambiosVentas.tsx` (54 líneas completas, leído entero) sigue usando solo `renderFila` de `ComprasAgrupadas` — el nuevo `renderCompra` existe en el componente compartido pero Cambios no lo usa `[código CambiosVentas.tsx:22-51]` `[código ComprasAgrupadas.tsx:93-102]`. La lista de "Actividad reciente" de Cambios sigue siendo 18 botones `bg-tinta` idénticos, uno por prenda, sin resumen por venta — el mismo defecto que el análisis anterior señalaba.
- **Lo que sigue igual (verificado de nuevo hoy, mismas líneas que el análisis anterior).** El método de pago en el paso 3 sigue siendo un `<select>` nativo del sistema operativo, distinto de cualquier otro control de la pantalla `[código CambioReemplazo.tsx:339-351]`. Los círculos de color siguen midiendo 40×40 px (`h-10 w-10`), bajo el mínimo táctil de 44 `[código CambioReemplazo.tsx:248]`. Las tallas sin stock siguen con borde punteado pero tocables `[código CambioReemplazo.tsx:125,219]`. «¿Qué se lleva?» sigue siendo un combo de estilo distinto a los demás campos `[código CambioReemplazo.tsx:187-195]`. Los SKU y "no queda aquí" siguen en ~11px `[código CambioReemplazo.tsx:212,223]` — probable choque con el piso de contraste de ADR-0012, sin medir `[inferido]`.

### Lógica de negocio — 4.0 (sin cambios)
- **Diferencia sin comprobante ni líder** (ver §2). Sin cambios desde el análisis anterior: mismo RPC, mismo caso de producción.
- **El descuento de la línea se sigue ignorando**: `diferencia = (v_precio_nuevo − v_item.precio_unitario) × p_cantidad` en el RPC `[código 20260919000100...sql:155]`, sin tocar `descuento_unitario`; el cliente calcula igual (`CambioReemplazo.tsx:116`, verificado hoy: la fórmula sigue sin `descuentoUnitario`). Mismo defecto compartido con la nota de crédito de Devoluciones `[BACKLOG:572]` — sigue siendo una tarea raíz, no dos.
- **El plazo de 15 días sigue viviendo solo en la pantalla**: reverifiqué el cuerpo entero de `registrar_cambio` (211 líneas) buscando `interval` o cualquier comparación de fecha — cero resultados `[código, grep verificado 2026-09-22]`. La RPC se sigue llamando directo desde el navegador (`CambiosFlujo.tsx:217`).
- **Falta el vale**, sin cambios: R-37 pone la nota de crédito o vale antes de devolver plata; el paso 3 solo ofrece los 5 métodos de pago `[código CambioReemplazo.tsx:346-351]`.
- **Vocabulario de motivo distinto entre Cambios y Devoluciones — verificado hoy que es una decisión, no una inconsistencia sin dueño.** La migración `20260922180000` (Devoluciones, D-79) documenta explícitamente por qué NO unificó `cambios.motivo` con el nuevo `devoluciones.motivo_codigo`: perdería la distinción talla_chica/talla_grande que le dice al Taller hacia qué lado corregir el patrón, y tocar un `check` ya en producción sin necesidad real viola el principio 12 `[código 20260922180000...sql:54-66]`. **Sin objeción aquí** — es exactamente el tipo de decisión documentada que este archivo pide, aunque deja la pregunta abierta para Felipe ("¿unificar antes de construir el reporte de calce por prenda?").
- **Misma variante seguimos sin bloquearla en el servidor**: grep sobre el RPC de `p_variante_nueva_id = variante_id` → cero resultados `[código, verificado 2026-09-22]`. En pantalla si se ignora (comentario de ADR-0125), pero la RPC llamada directo la aceptaría.

### Arquitectura — 5.5 (sin cambios)
- **Cadena**: sin cambios, `CambiosFlujo.tsx:217` sigue llamando `registrar_cambio` directo desde el navegador.
- **Estados imposibles**: sin cambios. Los impide el esquema: defecto→cuarentena, diferencia→método. No los impide: cantidad cambiada > comprada (si hay una carrera), misma variante, motivo nulo en filas viejas.
- **Concurrencia — reverificada hoy contra código que se acaba de fusionar.** `registrar_cambio` sigue sumando solo `cambios` (`…sql:144`, sin `for update`); `crear_devolucion`, en su versión de esta misma tarde (`20260922180000`), sigue sumando solo `devolucion_items` (`…sql:139-141`), también sin `for update` y sin mirar `cambios`. El escenario del análisis anterior sigue intacto: colaboradora A abre Cambios sobre una línea y la deja abierta; B aprueba una devolución de esa misma línea; A confirma 10 minutos después. El servidor lo acepta y el stock queda +2 con una sola unidad vendida.
- **Caída externa**: sin cambios. Un cambio no llama a SUNAT/Nubefact/Culqi — se degrada bien porque no depende de nadie; sin red, `registrar_cambio` falla entera sin cola offline `[inferido]`.
- **Volumen**: sin cambios, ~6 600 filas en 3 años. `[producción, 2026-09-21]` `[inferido]`
- **RLS y datos personales**: sin cambios, sin problemas.

### Funciones — 6.0 (sin cambios)
- **Existen y funcionan**, igual que antes.
- **`actividadPreviaVenta` existe, pero es de Devoluciones, no de Cambios** — corrección sobre una versión anterior de este análisis que lo daba como función nueva de esta pantalla. Vive en `devoluciones-reglas.ts:165-187` y la usa `DevolucionesVentas.tsx:128`, no `CambiosVentas.tsx`. Sigue siendo una mejora real y aplicable a Cambios (ver #10), solo que todavía no se construyó ahí.
- **Medio fantasma, sin cambios**: «Escanear prenda» solo enfoca el campo `[código BuscadorVentas.tsx:130-142]`; «Sin comprobante →» solo activa el filtro `[código CambiosPanel.tsx:128-136]`.
- **Sobra, sin cambios**: `BuscarPorComprobante.tsx` sigue siendo código muerto — reverifiqué hoy con `grep -rn "BuscarPorComprobante" apps/web` fuera de su propio archivo: cero resultados `[código, verificado 2026-09-22]`.
- **Faltan, sin cambios**: vale/saldo a favor para diferencia negativa; comprobante o ticket del cambio para la clienta (el «N.º de operación» sigue siendo los 8 primeros caracteres de un UUID `[código CambiosFlujo.tsx:233]`); aviso de que la lista corta en 30 compras.
- **Tope silencioso, sin cambios**: `LIMITE_ACTIVIDAD = 30` `[código ventas-v2.ts:75]`, el texto sigue diciendo «Compras de los últimos 15 días» `[código CambiosPanel.tsx:215]`. TRU tenía 18 ventas en 15 días el 2026-09-21 `[producción, 2026-09-21]`; a más de 2 por día, las más viejas siguen desapareciendo sin aviso.
- **«Sin comprobante 0», sin cambios**: el filtro sigue siendo `!l.comprobante` `[código CambiosPanel.tsx:34]`, y `comprobante` en `LineaVentaReciente` es no-nulo para una boleta `pendiente` igual que para una `aceptada` `[código ventas-v2.ts:216-217]` — sigue contando "pendiente" como "con comprobante".

### Utilidad — 7.0 (sin cambios)
Mismo escenario que el análisis anterior: una clienta vuelve a los 8 días con una casaca de S/ 179 y quiere una blusa de S/ 79.
1. La colaboradora nueva ve, en "Actividad reciente", 18 botones «Iniciar cambio» idénticos — uno por prenda, sin resumen por venta. Sigue siendo el mismo ruido visual del análisis anterior; la corrección de este punto (tarjeta por venta) todavía no llegó a Cambios, solo a Devoluciones. `[código CambiosVentas.tsx:22-51]`
2. Al entrar, elige la prenda exacta entre las de esa venta (paso "Prenda", con cada una diciendo si se puede cambiar). Sigue siendo claro.
3. Paso 3: mismas 8 decisiones que antes (motivo, prenda, talla, color, condición, cantidad, método). **Dudas sin resolver:** los colores siguen sin nombre hasta elegirlos, la talla punteada sigue pareciendo deshabilitada.
4. Aparece «Diferencia a devolver S/ 100», método arranca en Efectivo, la clienta pide Plin. **Se sigue equivocando el sistema, no la colaboradora**: acepta Plin sin comprobante, sin líder, sin que la caja se entere.
5. Paso 4: revisión clara, confirma. La pantalla de éxito (ahora verificada en código, no `[no verificable]` como antes) muestra Devolvió/Se llevó/Diferencia/N.º de operación, pero **sigue sin nada que la clienta se lleve** que diga qué cambió o hasta cuándo puede volver `[código CambiosFlujo.tsx:398-427]`.

### Conexión con el ERP — 5.0 (sin cambios)
Ver §6.

## 5 · Relevancia
| Criterio | Peso | Puntaje | Por qué (una línea) |
|---|---|---|---|
| Gestión (directo + indirecto) | ×2 | 6 | Directo: KPIs de cambios y «Tallas que no calzan»; indirecto: el motivo alimenta al Taller, la nueva "actividad previa" ayuda a la colaboradora, no cambia el peso de gestión. |
| Dinero y stock que toca | ×1 | 7 | Mueve stock ±1 y plata en la diferencia; sumas chicas por operación, sin cambios. |
| Frecuencia y personas que la usan | ×1 | 5 | 1 cambio en 3 días de uso `[producción, 2026-09-21]`; toda colaboradora en caja la puede usar. |
| Qué se detiene si falla | ×1 | 5 | Sin Cambios, la clienta cae en devolución + venta nueva (más lento, pero se puede). |

Relevancia = (2·6 + 7 + 5 + 5) / 5 = **5.8 → Comodidad** (a 0.2 de Soporte; sin cambios desde el análisis anterior — nada de lo que se tocó hoy mueve dinero, stock ni frecuencia de uso).

## 6 · Conexión con el ERP
- **Aguas arriba:** `ventas`/`venta_items`, `variantes` (precio nuevo), `stock` por sede, `cajas` (caja abierta), `comprobantes` (chips). Sin cambios.
- **Aguas abajo:** `movimientos` (`motivo='cambio'`), `stock`, `prendas_danadas` → cuarentena de `/devoluciones`, `cerrar_caja` (solo efectivo), «Tallas que no calzan». **No llega a:** `venta_items`, `venta_pagos`, `comprobantes`, márgenes por prenda. Sin cambios.
- **Pájaro dueño y vecinos:** Colibrí (07 · Ventas y caja); vecinos: Devoluciones (misma cuarentena; `devoluciones-reglas.ts` importa de `cambios-reglas.ts` — plazo, `EstadoVisual`, `Validacion` — pero la "tarjeta por venta" de PR #292 solo llegó al lado de Devoluciones, ver §0), Caja, Facturación, Movimientos.
- **Externos, y qué pasa si caen:** ninguno hoy. Se degrada así: sin red, no se registra nada (no se pierde ningún dato porque no hay escritura parcial). Sin cambios.

## 7 · Las 12 tareas, por importancia

### #1 · Replantear — Decidir cómo se documenta la diferencia de un cambio
- **Dónde:** `registrar_cambio` (`supabase/migrations/20260919000100_cambios_motivo_y_estado_de_prenda.sql:155-211`) · `cambios.diferencia`/`metodo_pago_diferencia` · sección §8.
- **Por qué en este puesto:** sigue siendo la raíz de la objeción, sin ningún avance de código desde el análisis anterior. Ya ocurrió (S/ 100 por Plin `[producción, 2026-09-21]`). Toca dinero y SUNAT (CLAUDE.md: confirmar).
- **Novedad de hoy que cambia el plan:** **Felipe ya decidió la serie de nota de crédito (opción A, B por tienda) el 2026-09-21 — solo falta ejecutarlo** `[BACKLOG.md:451, 2026-09-22]`. Eso desbloquea el remedio de fondo antes de lo que decía el análisis anterior.
- **Cómo lo verificas tú:** recorres §8 y eliges A, B o C. Después de ejecutar, un cambio con diferencia en Plin deja un documento visible en Facturación y una línea de venta en `/vender/historial`.
- **Esfuerzo / dependencias:** L (opción B) · ya no depende de "decidir la serie" (Felipe lo hizo), depende de "ejecutar el registro de la serie B por tienda" (tarea de Facturación, fuera de esta pantalla).
- **DECIDÍ (recomendación, tuya la última palabra):** que un cambio sea «devolución parcial + venta nueva» en una sola transacción cuando la diferencia ≠ 0, con nota de crédito (si sube plata) o boleta por la diferencia (si baja), y que un cambio a igual precio siga como hoy, sin documento nuevo.
- **DESCARTÉ:** dejarlo como está (costo: un hueco que ya tiene S/ 100 reales y sin tope), y emitir una sola boleta por la diferencia sin tocar la venta original (costo: la boleta original sigue mintiendo por el valor de la prenda devuelta).
- **SE ROMPE SI:** una clienta cambia una casaca de S/ 179 por una blusa de S/ 79 y se le devuelven S/ 100 por Plin: la boleta original sigue en S/ 179, el negocio declara S/ 100 de ingresos que no existen y nadie lo ve en el arqueo. `[no verificable]`: tratamiento tributario exacto de un cambio sin diferencia — **confirmar con el contador antes de diseñar**.

### #2 · Corregir — Reembolso por cambio exige líder
- **Dónde:** `registrar_cambio` (agregar `fn_es_lider()` cuando `v_diferencia < 0`, mismo patrón de `aprobar_devolucion`) · `CambioResumen.tsx` (avisar «lo aprueba una líder») · prueba nueva en `scripts/pruebas/registrar_cambio.mjs`.
- **Por qué en este puesto:** sin cambios desde el análisis anterior — es el cierre barato del peor agujero.
- **Cómo lo verificas tú:** entra como integrante, arma un cambio de S/ 179 → S/ 79 y confirma: debe rechazar. Como líder pasa.
- **Esfuerzo / dependencias:** S · independiente de #1 si solo se pide líder.

### #3 · Corregir — Candado cambio↔devolución y bloqueo de la línea
- **Dónde:** `registrar_cambio` (`select … for update`; sumar `cambios` **y** `devolucion_items`) · `crear_devolucion` (mismo bloqueo, sumar `cambios`; su versión más reciente es `20260922180000_devoluciones_motivo_estructurado.sql:132-146`, fusionada hoy y **todavía sin este candado**).
- **Por qué en este puesto:** único riesgo de stock duplicado (principio 2). **Reverifiqué hoy contra la migración de Devoluciones fusionada esta misma tarde: el hueco sigue exactamente igual** — otra prueba de que nadie lo tiene anotado como pendiente al tocar esa función.
- **Cómo lo verificas tú:** con dos pestañas: en A abre Cambios sobre una línea; en B devuelve esa línea; en A confirma el cambio. Debe rechazar con «ya se devolvió».
- **Esfuerzo / dependencias:** M · migración con las dos funciones; parte del cuerpo de `pg_proc` de producción, no del archivo del repo (aviso de `SESIONES-ACTIVAS.md`).

### #4 · Corregir — Plazo de 15 días en el servidor, con excepción de líder
- **Dónde:** `registrar_cambio` (comparar `ventas.created_at` con hoy en zona Lima — **reverifiqué hoy que el cuerpo entero sigue sin ningún `interval`**) · `lib/cambios-reglas.ts:409` (`DIAS_PLAZO_CAMBIO`, una sola constante).
- **Por qué en este puesto:** la regla existe solo en el navegador; la RPC es llamable desde la consola.
- **Cómo lo verificas tú:** llama el RPC desde la consola con una línea de hace 20 días: debe rechazar; con líder y excepción marcada, pasa (si decides la excepción).
- **Esfuerzo / dependencias:** M · decidir antes la excepción («cambio extendido», R-33, `BACKLOG:480`).

### #5 · Corregir — El descuento de la línea entra al cálculo (raíz compartida con Devoluciones)
- **Dónde:** `registrar_cambio:155` · `CambioReemplazo.tsx:116` (**reverifiqué hoy: la fórmula sigue sin `descuentoUnitario`**) · `cambios-estadisticas.ts:38` · nota de crédito de devoluciones `[BACKLOG:572]`.
- **Por qué en este puesto:** mismo defecto en 3 sitios: una sola tarea raíz.
- **Cómo lo verificas tú:** vende una prenda con descuento y cámbiala por una del mismo precio de lista: la diferencia debe ser lo que se descontó.
- **Esfuerzo / dependencias:** M · junto con el arreglo de la nota de crédito.

### #6 · Corregir — La lista de 30 compras dice «15 días»
- **Dónde:** `lib/ventas-v2.ts:75` (`LIMITE_ACTIVIDAD`) · `CambiosPanel.tsx:215` (el texto, línea desplazada por el cambio de hoy).
- **Por qué en este puesto:** en el mostrador la colaboradora asume que lo que no aparece no se puede cambiar. Sin cambios desde el análisis anterior (TRU: 18 ventas en 15 días, `[producción, 2026-09-21]`).
- **Cómo lo verificas tú:** siembra 35 ventas en TRU: deben verse todas, o el texto debe decir «las 30 más recientes» y ofrecer «Ver más».
- **Esfuerzo / dependencias:** S.

### #7 · Mejorar — «Vale / saldo a favor» y método sin Efectivo por defecto para diferencia negativa
- **Dónde:** `CambioReemplazo.tsx:339-351` (control del método) · `cambios.metodo_pago_diferencia` (lista cerrada; agregar `vale` exige migración) · `seleccionInicial` (`CambioReemplazo.tsx:53-63`, `metodo: "efectivo"` prefijado — el propio código ya comenta que arrancar vacío depende de esta decisión).
- **Por qué en este puesto:** R-37 pone el vale antes de devolver plata; sigue sin existir. Depende de #1.
- **Cómo lo verificas tú:** en una diferencia negativa aparece «Vale por S/ X» y ningún método toma valor por defecto.
- **Esfuerzo / dependencias:** M · no antes de la #1.

### #8 · Corregir — Misma variante bloqueada y aviso cuando motivo y reemplazo se contradicen
- **Dónde:** `cambios-reglas.ts` (`derivarReemplazo`) · `registrar_cambio` (rechazar `p_variante_nueva_id = venta_items.variante_id` — **reverifiqué hoy: sigue sin este chequeo**).
- **Por qué en este puesto:** cambiar una prenda por sí misma mueve stock ±0 y no cambia nada. Hoy 0 casos `[producción, 2026-09-21]`.
- **Cómo lo verificas tú:** elige la misma talla y color: el botón se bloquea con «es la misma prenda».
- **Esfuerzo / dependencias:** S.

### #9 · Mejorar — Que «Valor cambiado» diga qué valor es
- **Dónde:** `cambios-estadisticas.ts:22-38` (sin cambios: sigue sumando `cantidad × precio_unitario`, sin descuento ni signo de diferencia) · `page.tsx:56-58`.
- **Por qué en este puesto:** el KPI muestra el valor de lista de la prenda devuelta, no la plata que se movió de verdad.
- **Cómo lo verificas tú:** tras el cambio de −S/ 100, la tarjeta muestra el neto y el bruto con rótulos distintos.
- **Esfuerzo / dependencias:** S · mejor después de #5.

### #10 · Corregir — Detalles de estética y accesibilidad del paso 3, y llevar la tarjeta-por-venta de Devoluciones a Cambios
- **Dónde:** `CambioReemplazo.tsx:248` (colores 40→44 px con nombre visible — sigue en `h-10 w-10`) · `CambioReemplazo.tsx:125,219` (talla sin stock que parece desactivada) · `CambioReemplazo.tsx:339-351` (`<select>` nativo → selector del sistema) · «¿Qué se lleva?» con el estilo de los otros campos (`:187-195`) · `CambiosVentas.tsx` (pasar de `renderFila` a `renderCompra` de `ComprasAgrupadas`, igual que ya hizo `DevolucionesVentas.tsx:128` con `actividadPreviaVenta`/`totalesVenta` de `devoluciones-reglas.ts:150-193`).
- **Por qué en este puesto:** no daña dinero, pero es donde la colaboradora nueva duda. **Incluye la lista de "Actividad reciente" de Cambios**: sigue con 18 botones idénticos — la solución ya existe, construida y en producción para Devoluciones (PR #292), solo falta portarla al lado de Cambios.
- **Cómo lo verificas tú:** en la tablet, ves el nombre de cada color sin tocar, ningún control mide menos de 44 px, y "Actividad reciente" en `/cambios` muestra una tarjeta por venta (no una fila por prenda), igual que ya se ve en `/devoluciones`.
- **Esfuerzo / dependencias:** S (paso 3) + S (portar `renderCompra`, el patrón ya existe) · reduce el riesgo copiando `devoluciones-reglas.ts` a una función equivalente en `cambios-reglas.ts` en vez de reescribirla.

### #11 · Eliminar/fusionar — `BuscarPorComprobante.tsx` y el botón «Sin comprobante →» *(bajo valor)*
- **Dónde:** `apps/web/components/BuscarPorComprobante.tsx` (muerto — **reverifiqué hoy: sigue sin ningún import**) · `BuscadorVentas.tsx:130-142` · `CambiosPanel.tsx:128-136`.
- **Por qué en este puesto:** limpieza. Bajo valor: no cambia dinero ni stock.
- **Cómo lo verificas tú:** `rg BuscarPorComprobante apps/web` da 0 usos fuera de su propio archivo.
- **Esfuerzo / dependencias:** S.

### #12 · Mejorar — `cambios.motivo` obligatorio para filas nuevas *(bajo valor / opcional)*
- **Dónde:** migración nueva con `check (motivo is not null) not valid`.
- **Por qué en este puesto:** la pantalla ya lo exige y hay 1 sola fila vieja con motivo nulo `[producción, 2026-09-21]`.
- **Cómo lo verificas tú:** una llamada directa al RPC sin motivo falla; la fila del 2026-09-18 sigue intacta.
- **Esfuerzo / dependencias:** S · después de #3 (misma migración).

## 8 · Estrategia alternativa
**Hoy:** un cambio es una operación propia (`cambios`) que mueve stock y anota una diferencia.
**Alternativa:** un cambio es **devolución parcial + venta nueva en una sola transacción**, con el neto como diferencia.

| | Ganas | Pagas |
|---|---|---|
| **A · Como hoy** | Cero trabajo; el flujo ya está probado. | Dinero sin documento (S/ 100 ya en producción), sin líder, ni margen ni ventas ven la prenda nueva. |
| **B · Devolución + venta nueva (recomendada)** | Comprobante correcto (NC o boleta), venta nueva con costo y margen, un solo camino contable, el líder ya aprueba devoluciones. | Reescribir `registrar_cambio`, depender de Lucode/SUNAT, y tener la serie de nota de crédito registrada — **esto último ya lo decidió Felipe el 2026-09-21 (opción A del BACKLOG), falta solo ejecutarlo**. |
| **C · Puente** | Solo #2 y #7: líder para reembolsos y vale en lugar de Plin; cierra la fuga sin tocar SUNAT. | El documento sigue faltando; la boleta original sigue diciendo el total viejo. |

Decide Felipe (con el contador). Mi orden, ajustado con la novedad de hoy: C ya (más barato que antes de ejecutar, porque #2 y #7 no dependen de la serie de nota de crédito); B en cuanto se registre la serie B por tienda que Felipe ya decidió.

## 9 · Referentes de ERP y futuro
`[no verificable]`: lo que sigue viene de memoria, no lo verifiqué.
- **Shopify POS / Odoo POS:** el cambio es un reembolso y una orden nueva ligadas, con el saldo como crédito de tienda o tarjeta regalo. Es la base de la opción B.
- **Vale digital ligado a la clienta:** necesita la base de clientas (R-33). Futuro.
- **Buscar por teléfono:** el dato no existe (ADR-0125). Futuro.
- **Cámara para «Escanear prenda»:** hoy sirve a la pistola de mostrador; la cámara solo aporta en celular. Futuro.
- **Cambio en otra tienda, para integrantes:** hoy solo un líder puede buscar boletas de otra sede (RLS). Futuro.

## 10 · Fuera de esta pantalla
**`docs/SESIONES-ACTIVAS.md` tiene filas de trabajo ya fusionado hace días que nunca se movieron a "Cerradas hoy", y eso acaba de generar una alarma falsa de colisión en este mismo análisis.** El disparador de esta tarea me dio, como el hallazgo de mayor consecuencia, una "colisión doble" entre `interface-recommendations-8ce365` (fila #24, fechada 2026-09-18) y `ventas-visual-redesign-240e2b` (fila #23, mismo día, "PR #128 abierto sin fusionar"). Verifiqué las dos con `gh pr view` y `git ls-tree`: **PR #128 está fusionado desde el 2026-09-18** (`b0b3ecfd`), y el diseño de la otra rama (flujo guiado, `ComprasAgrupadas`) ya es el código vigente — los archivos que iba a reemplazar (`CambioFormV2.tsx`, `CambiosLista.tsx`) no existen más en el árbol. Las dos filas describen una tensión que ya se resolvió, sea porque una sesión posterior reconcilió ambas visiones, sea porque el tablero simplemente no se limpió. **Esto es justo el incidente que hizo nacer el tablero** (2026-09-17, según su propio encabezado: colisiones de numeración, migraciones duplicadas, una función construida dos veces en paralelo) — si las filas viejas no se cierran, el tablero deja de ser confiable y una sesión nueva (como esta) puede gastar tiempo, o peor, frenar trabajo real, por una colisión que no existe. Vale la pena que alguien revise `SESIONES-ACTIVAS.md` completo (no solo las filas de Cambios) y mueva a "Cerradas hoy" todo lo que el `git log` ya muestra fusionado — no es una tarea de esta pantalla, pero es más grave que cualquiera de las 12 de arriba porque puede desperdiciar el tiempo de la próxima sesión que lo lea confiando en él.

Segundo hallazgo, más chico: la tabla de precio de esta pantalla (§2) sigue exactamente donde estaba en el análisis anterior a pesar de que hoy se fusionaron 2 PR que sí tocan `/cambios` (#261, y `crear_devolucion` en cuanto comparte candado de concurrencia) — ninguno tocó el problema de fondo. (Corrección: el PR #292 no es uno de los tres — toca solo `/devoluciones`, ver §0.) Es una señal de que el trabajo reciente en el módulo se está concentrando en pulir la experiencia (motivos estructurados, tarjetas — esta última todavía solo del lado de Devoluciones) y no en el hueco de dinero que el propio código ya señala como "decisión pendiente" desde ADR-0125.

## 11 · Líneas propuestas para BACKLOG.md
- [ ] `[pantalla:cambios]` #1 Decidir cómo se documenta la diferencia de un cambio (A/B/C de §8) — L · **novedad:** la serie de nota de crédito (bloqueante de B) ya la decidió Felipe el 2026-09-21, falta ejecutarla
- [ ] `[pantalla:cambios]` #2 Reembolso por cambio (diferencia negativa) exige líder — S
- [ ] `[pantalla:cambios]` #3 Candado cambio↔devolución y `for update` en la línea (verificado hoy: `crear_devolucion` fusionada esta tarde todavía no lo tiene) — M
- [ ] `[pantalla:cambios]` #4 Plazo de 15 días en el servidor, con excepción de líder — M
- [ ] `[pantalla:cambios]` #5 El descuento de la línea entra al cálculo del cambio, KPI y nota de crédito — M
- [ ] `[pantalla:cambios]` #6 «Actividad reciente» trae solo 30 compras aunque dice 15 días — S
- [ ] `[pantalla:cambios]` #7 Opción «Vale / saldo a favor» y método sin Efectivo por defecto en diferencia negativa — M
- [ ] `[pantalla:cambios]` #8 Bloquear cambio a la misma variante y avisar motivo vs. reemplazo — S
- [ ] `[pantalla:cambios]` #9 KPI «Valor cambiado»: bruto y neto con rótulos claros — S
- [ ] `[pantalla:cambios]` #10 Paso 3: colores con nombre y 44 px, selector del sistema, textos al piso de contraste; y portar la tarjeta-por-venta de "Actividad reciente" (ya construida en Devoluciones, PR #292) a Cambios — S+S
- [ ] `[pantalla:cambios]` #11 Borrar `BuscarPorComprobante.tsx` y fusionar «Sin comprobante →» con el chip — S *(bajo valor)*
- [ ] `[pantalla:cambios]` #12 `cambios.motivo` obligatorio para filas nuevas (`NOT VALID`) — S *(bajo valor)*
- [ ] `[pantalla:cambios]` Fuera de la pantalla: limpiar `docs/SESIONES-ACTIVAS.md` — mover a "Cerradas hoy" las filas de trabajo ya fusionado (al menos #22, #23, #24 de la tabla actual) para que deje de generar colisiones falsas — S

## Inventario de elementos
| Zona | Elemento | Qué hace | Veredicto | Evidencia |
|---|---|---|---|---|
| Cabecera | Tarjetas «Cambios hoy · Este mes · Valor cambiado» | Cuenta cambios de la sede y suma valor de lista de lo devuelto | ajustar (#9) | `[código cambios-estadisticas.ts:22-38]` |
| Iniciar un cambio | Buscador único + «/» | Boleta, DNI, clienta, prenda o código | bien | `[código BuscadorVentas.tsx:10-23]` |
| Iniciar un cambio | «Escanear prenda» | Solo enfoca el campo | bien (rótulo engañoso para cámara) | `[código :130-142]` |
| Iniciar un cambio | «Sin comprobante →» | Activa filtro y baja | sobra (#11) | `[código CambiosPanel.tsx:128-136]` |
| Actividad reciente | Fila por prenda (**sin cambios**; la tarjeta-por-venta de PR #292 es de `/devoluciones`, no de esta pantalla) | Un botón «Iniciar cambio» por prenda, 18 en TRU | ajustar (#10) | `[código CambiosVentas.tsx:22-51]` |
| Actividad reciente | Chips Todas / Con cambio / Sin comprobante | Filtran por compra entera | ajustar (#6, cuenta pendientes como comprobante) | `[código CambiosPanel.tsx:31-39]` |
| Actividad reciente | Tope de 30 compras | Corta sin avisar | falta aviso (#6) | `[código ventas-v2.ts:75]` |
| Flujo | Barra de 4 pasos | Navega y muestra avance | bien | `[código CambiosFlujo.tsx:47-55]` |
| Paso Prenda | Radios con chip de estado por línea | Elige qué prenda cambiar (incluso sin preselección) | bien | `[código CambiosFlujo.tsx:261-312]` |
| Paso 3 | Motivo (5 chips) | Lista cerrada | bien | `[código cambios-reglas.ts:23-29]` |
| Paso 3 | «¿Qué se lleva?» | Combo de productos con stock | ajustar (estilo, #10) | `[código CambioReemplazo.tsx:187-195]` |
| Paso 3 | Talla y color | Elige la variante nueva | ajustar (#10) | `[código CambioReemplazo.tsx:125,219,248]` |
| Paso 3 | Diferencia + método | Calcula y pide método | corregir (#1, #2, #5, #7) | `[código :116,339-351]` |
| Lateral | «Lo que revisa el sistema» | Checklist en cliente | bien | `[código cambios-reglas.ts:234-317]` |
| Paso 4 | Confirmar cambio (rojo) | Llama a `registrar_cambio` | bien | `[código CambiosFlujo.tsx:217-226]` |
| Éxito | Pantalla final | Muestra «Operación» | falta comprobante para la clienta (verificado en código) | `[código CambiosFlujo.tsx:398-427]` |
| Código | `BuscarPorComprobante.tsx` | — | sobra, sigue muerto | `[código, verificado 2026-09-22]` |

## Historial
| Fecha | Modo | Cumplimiento | Relevancia | Tareas cerradas de las 12 anteriores |
|---|---|---|---|---|
| 2026-09-21 | completo | 5.0 | 5.8 | — (primer análisis) |
| 2026-09-22 | completo (re-análisis, SQL reutilizada de 2026-09-21) | 5.0 | 5.8 | 0 de las 12 numeradas cerró — el hueco de dinero (núcleo de #1, #2, #3, #5, #7, #8) no se tocó, y tampoco la estética del paso 3 ni la lista de "Actividad reciente" de esta pantalla (#10): el PR #292 ("Actividad reciente resume una tarjeta por venta") resolvió esa misma queja pero solo en `/devoluciones` — su propio commit dice «Cambios no se toca». Una versión anterior de este análisis le atribuyó esa mejora a esta pantalla por error (subió Estética/Funciones/Utilidad y citó `actividadPreviaVenta` como si viviera en `cambios-reglas.ts`); quedó corregido en esta auditoría tras verificar `CambiosVentas.tsx` completo y el mensaje del commit `aa5f07f6`. Se descartó como hallazgo la "colisión doble" que el disparador de este análisis daba como la más grave del módulo: verificada contra `gh pr` y `git ls-tree`, ambas ramas ya estaban reconciliadas en `main` antes de empezar este análisis. |
