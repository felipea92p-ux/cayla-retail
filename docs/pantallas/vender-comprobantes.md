# Pantalla — Comprobantes (`/vender/comprobantes`)

> **Trabajo en vuelo — premisa de esta tarea desactualizada, dicho primero:** se me pidió analizar "la
> pantalla vieja de Comprobantes" porque el rediseño de cuatro vistas (`billing-design-analysis-ee464b`,
> ADR-0124) supuestamente seguía sin fusionar a `main`. **Eso ya no es cierto.** Verificado con `git log`
> al abrir esta sesión: ese PR (#243) se fusionó hace días (`fe0f4268`), y sobre esa base, **hoy mismo
> 2026-09-22** se construyó y fusionó un SEGUNDO rediseño — PR #287 (`claude/comprobantes-series-auto-emit-4346ee`,
> `723848a1`) — que reemplaza "Facturación" por **"Comprobantes"** (D-60, ADR-0165): el envío a SUNAT
> pasa a ser automático al cobrar y la pantalla base pasa a ser Series. Sus dos migraciones
> (`20260922193700`, `20260922234100`) ya están **pegadas en producción** (commit `852f6ad8`, verificado
> con huellas antes/después). `docs/SESIONES-ACTIVAS.md` todavía describe el estado de hace un día
> ("falta el PR y su fusión") y **está desactualizado**; mando lo que dice `git log` sobre `main`, no ese
> tablero (regla del repo: el código y la producción mandan sobre el documento). Además, PR #281
> (`claude/terminales-cuentas-129fd4`, ADR-0160) también está fusionado: el código ya usa
> `exigirPermiso("facturar")` en vez de `exigirLider()`, pero su migración de esquema
> (`20260922200000_terminales_por_tienda.sql`) **todavía no está pegada en producción** — así que hoy,
> en producción real, esta pantalla solo la abre un líder (ver Arquitectura). Analizo el código que
> hoy vive en `main`/`origin/main` — que para esta pantalla son idénticos — con el mismo rigor pedido,
> y marco qué construyó cada rama para que no se confunda con el "rediseño viejo" que se me describió.

> Modo: completo · Fecha: 2026-09-22 · Rol/sede: líder de equipo, cualquier tienda (mostrador/tablet y escritorio — la pantalla la usa tanto el mostrador al emitir como el líder en oficina) · Datos: sin SQL nuevo — uso el diccionario generado (desactualizado, ver Arquitectura) y las verificaciones contra producción ya citadas en BACKLOG.md/BITACORA.md de los últimos 7 días, con su fecha
> SHA analizado: `8845770` (`origin/main`; el worktree local está 10 commits detrás pero **sin diferencia** en los archivos de esta pantalla — verificado con `git diff --stat HEAD origin/main -- apps/web/app/\(app\)/vender/comprobantes apps/web/lib/comprobantes.ts apps/web/lib/proformas.ts apps/web/lib/facturacion-reglas.ts apps/web/components/ComprobantesPanel.tsx apps/web/components/ProformasPanel.tsx apps/web/components/FacturacionShell.tsx apps/web/components/SeriesPanel.tsx`, salida vacía) — si esos archivos cambian después, este análisis está vencido
> Archivos: `app/(app)/vender/comprobantes/{page,layout}.tsx` + `emitidos/`, `por-reintentar/`, `proformas/` · `components/{FacturacionShell,FacturacionCabecera,FacturacionPestanas,SeriesPanel,ComprobantesPanel,ComprobantesTarjetas,ColaSunatPanel,ProformasPanel,ProformasTarjetas,EmitirComprobanteModal,NuevaProformaModal,BarridoColaSunat,MarcaDeCarga}.tsx` · `lib/{comprobantes,proformas,facturacion-reglas,facturacion-comprobantes-reglas,facturacion-actividad,facturacion-busqueda,transmitir-comprobante,transmision-reglas,lucode,envio-sunat,persona-actual,menu}.ts` · `app/api/lucode/{emitir,reintentar,anular,consultar-anulacion}/route.ts` · RPC `emitir_comprobante`, `crear_proforma`, `convertir_proforma_a_comprobante`, `anular_comprobante`, `marcar_comprobante_no_emitido`, `registrar_serie_comprobante`, `archivar_serie_comprobante`, `fn_reservar_numero_serie`, `fn_marcar_reintento_transmision`, `fn_tomar_comprobantes_para_reintento`, `fn_comprobantes_cola_reintento`, `fn_ventas_del_dia` · tablas `comprobantes`, `series_comprobantes`, `proformas`
> Otra sesión tocándola: **no hoy, para esta ruta exacta.** `docs/SESIONES-ACTIVAS.md` no lista ninguna fila activa sobre `/vender/comprobantes` o `vender/facturacion` en este momento (la única fila de Facturación que lista, `billing-design-analysis-ee464b`, ya cerró: ver el aviso de arriba). Sí hay trabajo cercano abierto que puede chocar de refilón: `claude/pos-ticket-seller-selection-95d5b3` toca `fn_ventas_del_dia` (migración `20260922213700`, sin pegar) y `lib/ventas-v2.ts`/`ventas-offline.ts`, que Comprobantes no importa directamente pero comparte la función RPC con Caja y Vender.

## 0 · Veredicto
Comprobantes es, hoy, el módulo mejor construido de todo lo auditado en este repo hasta ahora: motivo escrito para cada decisión, candados reales en la base (`for update skip locked` contra doble envío, idempotencia, un solo intento de transmisión a la vez), y una arquitectura de "todo falla, todo el tiempo" tomada en serio — Lucode caído no pierde un comprobante, solo lo encola. El defecto real no está en lo que se construyó hoy: está en un cabo suelto de ayer (un texto que promete un botón "Transmitir" que ya no existe) y en que el propio repo no ha corrido su regla de oro sobre su propio trabajo (el diccionario de datos no describe lo que hay en producción desde esta tarde).
**Cumple su finalidad:** 8,0/10 · **Relevancia:** 8,8/10 — Núcleo

## 1 · Finalidad declarada
"Que cada venta se declare sola a SUNAT sin que nadie tenga que acordarse de transmitirla, que si SUNAT o Lucode fallan el comprobante quede en una cola visible que se reintenta y avisa si tarda, y que quien opera solo tenga que mirar qué series tiene cada tienda y en qué número va cada una." Fuente: ADR-0165 (Contexto y Decisión, punto 5) y D-60 (`docs/BACKLOG.md:427`, `docs/datos/DECISIONES-2026-09-21-menu-comercial.md`, citado en la cabecera de `20260922151500_comprobantes_cola_de_reintento.sql`).
¿Coinciden docs y pantalla? **Sí, con una salvedad de fecha.** El propio código lo dice en su comentario: "Facturación pasa a ser Comprobantes" (`facturacion-reglas.ts:66-68`) y la cabecera visible dice exactamente eso — "Cada venta se declara sola a SUNAT al cobrar" (`FacturacionCabecera.tsx:106`). La salvedad: `docs/datos/modulos/08-facturacion-sunat.md`, que debería explicar el módulo a alguien nuevo, sigue describiendo el mundo de "Transmitir" manual (no lo leí completo por presupuesto de esta tarea, pero el BACKLOG mismo lo lista pendiente: "el hueco de las proformas `vencida` ... ya vencidos", `docs/BACKLOG.md:470`) — **no lo cito como vigente**, igual que hace `caja.md` con `07-ventas-y-caja.md`.

## 2 · Objeción
1. **El único texto que sobrevivió del mundo anterior le miente a quien emite un comprobante a mano.** `EmitirComprobanteModal.tsx:183-186` dice, en un formulario que hoy sigue vivo y sigue emitiendo: *"Queda 'Pendiente de enviar' hasta que aprietes 'Transmitir' en la lista de abajo, que es lo que lo envía."* Ese botón no existe desde D-60: `accionesDelComprobante` (`facturacion-comprobantes-reglas.ts:129-133`) dice explícitamente en su propio comentario "Sin «Transmitir» desde 2026-09-22" y un comprobante `pendiente` solo ofrece "Liberar sin espera" (`:132`) — nunca "Transmitir" ni "Reintentar". Quien emite una boleta manual (un líder, hoy) sigue la instrucción de la pantalla, no encuentra el botón, y no tiene forma de saber si eso es un error del sistema o si de verdad tiene que esperar. **Trade-off de dejarlo así:** el comprobante SÍ se transmite solo — lo recoge el próximo barrido (`fn_tomar_comprobantes_para_reintento` toma un `pendiente` de más de 2 minutos, `20260922193700…sql:59-61`) la próxima vez que alguien cobre en Vender o abra Comprobantes como líder — así que no se pierde ni queda atascado; pero mientras tanto la pantalla instruye a buscar algo que ya no está, y eso es exactamente el tipo de fallo que D-12 de CLAUDE.md (Norman) pone en la cuenta del diseño, no de quien opera.
2. **El diccionario de datos, la única fuente que el propio repo se obliga a mantener al día, no describe lo que hay hoy en producción.** `docs/datos/generado/DICCIONARIO-RETAIL.md` se generó el 2026-09-21 (`git log`, último commit `52d569ac`) — antes de que existieran `pendiente_reintento`, `intentos_transmision`, `ultimo_error_transmision`, `proximo_reintento_at` en `comprobantes`, o `archivada_at`/`archivada_por`/`motivo_archivo` en `series_comprobantes`, o el índice parcial "una serie activa por tienda y tipo" que reemplazó a la unique completa (`:1499` sigue mostrando `series_comprobantes_ubicacion_id_tipo_key`, ya reemplazada por `series_comprobantes_activa_por_tienda_y_tipo` en `20260922234100…sql:53-55`). El propio `CLAUDE.md` de este repo lo llama "regla de oro" y lo lista como pendiente en el BACKLOG (`:443`, `:467`) — no es un hallazgo mío, es una deuda que el equipo ya escribió y no cerró. **Trade-off:** correrlo (`pnpm datos:generar:produccion`) es barato (un comando) pero exige volver a leer producción — quien lo salte confía en un diccionario que hoy describe una tabla que no existe más así.
3. **Sin objeción de fondo sobre el diseño de D-60 en sí** — la arquitectura de la cola de reintento, el candado contra doble envío y la idempotencia están, cada uno, mejor pensados que el promedio de este repo (ver §3). Lo que sigue en §7 son ajustes puntuales, no un rediseño.

## 3 · Lo que está bien y no se toca
- **Reintento sin condición de carrera real:** `fn_tomar_comprobantes_para_reintento` lee y reserva en una sola operación (`for update ... skip locked`, con `proximo_reintento_at = now() + 5 min` en la misma transacción) — dos pestañas barriendo a la vez nunca toman el mismo comprobante `[código 20260922193700_comprobantes_tomar_para_reintento.sql:50-71]`. Es el patrón correcto para "dos sedes tocando lo mismo al mismo milisegundo" (principio 10 de CLAUDE.md del repo).
- **Nunca se transmite dos veces por error:** `fn_marcar_reintento_transmision` solo mueve a la cola un comprobante que sigue `pendiente`/`pendiente_reintento` — si Lucode respondió tarde y el estado ya avanzó a `aceptado`/`rechazado`, la RPC lo rechaza con excepción en vez de pisarlo `[código 20260922151500…sql:134-140]`.
- **Idempotencia real en la emisión manual:** un token por sesión de modal sobrevive un reintento de red — el correlativo no se quema dos veces por un timeout del navegador `[código EmitirComprobanteModal.tsx:41-46; 20260918091500…sql:58-64,74-86]`.
- **Una venta anulada nunca se declara a SUNAT**, en las dos direcciones: `anular_venta` libera cualquier comprobante `pendiente`/`pendiente_reintento` de la venta que anula en la misma transacción `[código 20260922151500…sql:318-329]`, y `motivoParaNoTransmitir` se niega a transmitir si la venta está anulada o si ni siquiera se pudo confirmar su estado — falla cerrada ante la duda `[código transmision-reglas.ts:35-39]`.
- **Una serie se archiva, nunca se pisa ni se borra:** el candado viejo ("una serie por tienda y tipo", reemplazando el contador) se reemplazó por "una serie ACTIVA por tienda y tipo" con índice parcial — el historial de una serie vieja queda completo y sus comprobantes la siguen nombrando `[código 20260922234100…sql:38-55]`.
- **Una nota de crédito no puede cruzar de ambiente:** si el comprobante original se transmitió en producción real, la nota no se deja emitir desde el sandbox y viceversa — evita el caso "SUNAT real recibe una nota de un documento que solo existe en pruebas" `[código transmitir-comprobante.ts:116-124]`.
- **Falla cerrada en el envío al cobrar:** `enviarVentaASunat` es fire-and-forget con `keepalive` y no bloquea el cobro (`x-espera: no`, ADR-0149) — si no hay red, el comprobante se queda `pendiente` y lo recoge el próximo barrido, nunca se pierde `[código envio-sunat.ts:6-13]`.
- **El "Pruebas" del entorno se ve en todas partes a propósito:** la cabecera, la vista Series y `montosDelMes` separan sin ambigüedad lo aceptado en sandbox de lo aceptado en producción real (ADR-0015) — nadie puede confundir una boleta de prueba con una válida `[código FacturacionCabecera.tsx:112-116; facturacion-comprobantes-reglas.ts:82-87,100-106]`.
- **Un rechazo real de SUNAT nunca se confunde con un timeout de Lucode:** la cola de reintento es explícitamente solo para errores de red/proveedor; `vaALaColaDeReintento` excluye `rechazado`, que ya tiene una respuesta real y su único camino es un reintento manual con el mismo número `[código transmision-reglas.ts:44-49]`.

## 4 · Las seis dimensiones
| Dimensión | Puntaje | Hallazgo principal | Evidencia |
|---|---|---|---|
| Estética | 7,0 | Coherente con el resto del ERP (vidrio, cascada, `EncabezadoPagina` compartido); el rojo puede superar el tope de 2 por pantalla cuando hay rechazados + cola atrasada a la vez | `[código ComprobantesTarjetas.tsx:125; facturacion-actividad.ts:93,107-108; FacturacionShell.tsx:96]` |
| Lógica de negocio | 8,0 | La cola de reintento y el candado de venta-anulada son sólidos; la nota de crédito para una factura (letra F) sigue sin resolver, dormido hasta la primera factura corregida | `[código 20260922234100…sql:30-33; docs/BACKLOG.md:440,451]` |
| Arquitectura | 8,5 | Concurrencia y caída externa tratadas explícitamente con `for update skip locked` y backoff; `getComprobantesMes` no pagina (bajo volumen hoy) | `[código 20260922193700…sql:65; comprobantes.ts:14-29]` |
| Funciones | 7,5 | Series, Emitidos, Por reintentar y Proformas cubren el ciclo completo; el texto de "Emitir comprobante" es fantasma (promete un botón que no existe) | `[código EmitirComprobanteModal.tsx:183-186]` |
| Utilidad | 7,5 | Un líder nuevo entiende la pantalla sin ayuda (los globos `Ayuda` explican cada estado); tropieza justo en el mismo punto anterior, al emitir a mano | `[inferido, escenario abajo]` |
| Conexión con el ERP | 8,5 | Bien enganchada aguas arriba (Vender, vía `enviarVentaASunat`) y aguas abajo (Caja, Historial comparten `fn_ventas_del_dia`); el diccionario de datos que la describe está un día desactualizado | `[código PuntoDeVenta.tsx:876-877; DICCIONARIO-RETAIL.md, generado 2026-09-21]` |

### Estética (7,0)
(a) Coherencia CAYLA: crema/tinta, `font-display` serif en cifras y títulos, esquinas suaves, `card-cayla`/`vidrio-cayla`, y la misma cascada de entrada que Caja/Cambios/Devoluciones/Historial (`space-y-7`, `--i` incremental) `[código FacturacionShell.tsx:85-88,108]`. Comparado con `caja.md` (hermana más reciente auditada): mismo patrón de `EncabezadoPagina` + `ResumenSede`, mismo criterio de "un `null` no dibuja una cifra inventada, un cero sí" — coherencia de una sola mente, tal como pide el principio 2 (Brooks) del repo `[código FacturacionCabecera.tsx:89-96 vs. caja.md §3]`.
(b) Rojo: `MAX_ROJO_POR_PANTALLA = 2` (`design-tokens.ts:73`). En la vista Emitidos, con rechazados > 0, ya hay dos grupos (la tarjeta "Rechazados" en rojo, `ComprobantesTarjetas.tsx:125`, y un chip rojo por cada fila rechazada, que es un solo grupo semántico repetido, `facturacion-actividad.ts:93,107-108`); si ADEMÁS algo lleva más de una hora en la cola, el aviso del `FacturacionShell` (compartido por las CUATRO vistas) se suma como tercer grupo — `border-rojo/30 bg-rojo/[0.06] ... text-rojo-profundo` `[código FacturacionShell.tsx:96]`. Es un escenario real, no hipotético: un Lucode caído una hora Y una boleta rechazada el mismo día bastan para las tres. En "Por reintentar" el aviso y el chip de fila atrasada comparten la misma condición (>1 hora), así que ahí sí se queda en 2.
(c) Universales (Nielsen/WCAG): foco visible con `outline-solid` en todos los controles interactivos revisados (pestañas, caja de búsqueda, botones) `[código FacturacionPestanas.tsx:86; FacturacionCabecera.tsx:58]`; los textos de estado nunca dependen solo del color — cada chip lleva `texto` legible y un `title`/`sr-only` para lector de pantalla `[código facturacion-reglas.ts:140-142; FacturacionPestanas.tsx:92-99]`. No verifiqué contraste medido (`[no verificable]` sin herramienta de color).

### Lógica de negocio (8,0)
- **D-60 cumplida al pie de la letra**, verificada contra su propio ADR: envío automático al cobrar (`transmitir-comprobante.ts`), reintento sin cron con reserva atómica, pantalla reducida a Series/Emitidos/Por reintentar/Proformas, series que se archivan — los cuatro pasos que promete ADR-0165 están en el código, no solo en la intención `[código ADR-0165 §Decisión, cruzado contra el mapa de archivos de arriba]`.
- **Hueco real, ya documentado por el propio equipo, no cerrado:** SUNAT exige que una nota de crédito lleve la letra del documento que corrige (B si corrige boleta, F si corrige factura, RS 117-2017 Anexo 3). Con una sola serie de nota de crédito ACTIVA por tienda (`series_comprobantes_activa_por_tienda_y_tipo`), una tienda que algún día tenga que corregir una factura (letra F) con la misma serie que corrige boletas (letra B) quedaría bloqueada — `fn_reservar_numero_serie` no distingue qué corrige, solo mira tipo `[código 20260922234100…sql:58-68]`. Está anotado como dormido hasta la primera factura corregida (`docs/BACKLOG.md:440,451`) — no lo repito como hallazgo mío nuevo, lo confirmo vigente contra el código de hoy.
- **`moneda` sin candado en la base** (`comprobantes.moneda text not null default 'PEN'`, sin CHECK — `DICCIONARIO-RETAIL.md:1435`, desactualizado en fecha pero esta columna no cambió con D-60): ninguna pantalla de esta ruta manda otro valor que el default, así que hoy es un estado imposible que nadie puede alcanzar por la UI — pero una RPC llamada directo sí podría guardar `moneda = 'foo'`. `transmitirComprobante` se defiende solo (trata cualquier valor que no sea `"USD"` como `"PEN"`, `transmitir-comprobante.ts:91`), así que el riesgo real es bajo — lo anoto como estado imposible sin cerrar (principio 4, Lamport), no como algo que hoy le pase a alguien.
- **Referentes de ERP** (`[no verificable]`, de memoria): Shopify POS y Lightspeed también declaran la venta a la autoridad fiscal local en segundo plano al cobrar, con una cola visible de "documentos pendientes de timbrar" cuando el proveedor de facturación electrónica no responde — el patrón de D-60 (cola + reintento + aviso por antigüedad) es el mismo. Filtro de escala: un tope de reintentos con alerta a un humano (no solo "más de 1 hora") no le sirve a 3 tiendas hoy con el volumen que hay → Futuro (§9).

### Arquitectura (8,5)
- **Cadena:** `layout.tsx` (marco, `opcional`/tolerante) → 4× `page.tsx` (`exigir`, no tolerante — plata no se oculta en silencio) → paneles de cliente → RPC security-definer → tablas con RLS de solo SELECT (la escritura es 100% por RPC, ningún INSERT/UPDATE/DELETE de fila suelta) `[código layout.tsx:28-35 vs. emitidos/page.tsx:24-27; DICCIONARIO-RETAIL.md:1476-1480,1503-1507]`.
- **Estados imposibles que la base SÍ impide:** un comprobante `anulado` sin motivo (`comprobantes_anulado_tiene_motivo`), una factura sin RUC (`comprobantes_factura_requiere_ruc`), una nota sin su original y su motivo (`comprobantes_nota_requiere_original`), un número repetido para el mismo tipo y serie (`comprobantes_tipo_serie_numero_key`), un subtotal+igv que no cuadra con el total (`emitir_comprobante`, `20260918091500…sql:55-57`) `[producción, DICCIONARIO-RETAIL.md:1461-1471, generado 2026-09-21 — estos candados no cambiaron con D-60]`.
- **Estado imposible que la base NO impide:** `moneda` sin CHECK (ver Lógica de negocio arriba).
- **Transacción:** cada RPC de escritura es una sola llamada, una sola transacción — no hay operación de esta pantalla que toque más de lo que su propio nombre promete (emitir reserva y guarda; transmitir solo transmite y actualiza estado; nunca las dos a la vez, principio 9 del repo, "reservar y transmitir siguen separados a propósito" `[código ComprobantesTarjetas.tsx:118-119 comentario; transmitir-comprobante.ts:9-18]`).
- **Concurrencia (dos sedes, mismo milisegundo):** dos líderes reintentando la cola a la vez → cubierto (`skip locked`, ver §3). Dos clics del mismo formulario de emisión → cubierto (token + `unique_violation` atrapada, ver §3). Dos personas registrando la misma serie a la vez → el `select ... for update` de `fn_reservar_numero_serie` serializa correctamente `[código 20260922234100…sql:66-69]`.
- **Caída externa, dicho explícito:** "si Lucode no responde, el comprobante se queda en su estado real ('pendiente'), nunca se le inventa un estado" `[código lucode.ts:14-18]`. Se degrada así: la venta se cobra igual (D-49, no se congela), el comprobante espera en la cola visible, y pasada 1 hora el líder lo ve en rojo. Timeout medido: 15 s por llamada a Lucode (`AbortSignal.timeout(15000)`, `lucode.ts:200`), consistente con el comentario de la migración ("tarda como mucho 15 s") `[código 20260922193700…sql:19]`.
- **Volumen:** ~17 comprobantes y ~4 series en el diccionario de ayer `[producción, DICCIONARIO-RETAIL.md:1422,1485, generado 2026-09-21]`; el BITÁCORA de hoy habla de 23 comprobantes y 7 series tras D-60 (`docs/BACKLOG.md:438`). Con 3 tiendas emitiendo un puñado de boletas al día, en 3 años son del orden de unos pocos miles de filas — cualquier plan de acceso alcanza. El único riesgo de volumen real y ya escrito por el equipo: `getComprobantesMes` no usa `.range()` y PostgREST corta en 1000 filas (`supabase/config.toml`) — a ~17-23 comprobantes hoy falta mucho, pero el día que llegue no habrá aviso, solo una tarjeta que cuenta menos de lo real `[código comprobantes.ts:19-28; docs/BACKLOG.md:460]`.
- **Lente extra — permisos (D6 de ADR-0160):** la puerta de esta pantalla ya cambió de código (`exigirPermiso("facturar")`, no `exigirLider()`) pero la migración que le da ese permiso a una cuenta terminal no está en producción — hoy, en producción real, sigue siendo una pantalla solo de líder, aunque el comentario de `ComprobantesPanel.tsx:141` ("la pantalla entera ya lo es") dejará de ser cierto el día que `20260922200000_terminales_por_tienda.sql` se pegue `[código persona-actual.ts:119-123; menu.ts:81-83; ADR-0160 encabezado]`. No es un bug hoy — es una frase que caduca sola y nadie la va a volver a mirar cuando pase.

### Funciones (7,5)
- **Existen y funcionan:** Series (ver, registrar, archivar), Emitidos (emitir a mano, transmitir por fila desde la cola, anular, liberar sin espera, consultar una baja en trámite, ver PDF/XML/CDR), Por reintentar (ver la cola, reintentar una fila a mano), Proformas (crear, convertir con aviso si está vencida) — las cuatro vistas cubren el ciclo declarado en la finalidad.
- **Fantasma:** el texto "aprietes Transmitir en la lista de abajo" (§2.1) — la única función prometida por la pantalla que no existe.
- **Faltan:** paginación en `getComprobantesMes` (ver Arquitectura); un candado de letra B/F para nota de crédito de factura (ver Lógica de negocio) — ninguna de las dos bloquea hoy, las dos son deuda con fecha de vencimiento conocida.
- **Sobran:** nada que yo haya encontrado — es notable que, a diferencia de `caja.md` (que encontró `CajaGraficos.tsx` huérfano), no vi componentes ni funciones muertas en el recorrido de esta pantalla.

### Utilidad (7,5)
Escenario: una líder de equipo, sola en la tienda, tiene que darle una boleta a una clienta que pagó algo que no pasó por el Punto de Venta (una prenda que se llevó hace días y recién hoy trae el efectivo).
1. Abre "Emitir comprobante" desde la cabecera — se ve el número exacto que se va a reservar ANTES de confirmarlo (`serieDelComprobante`, `EmitirComprobanteModal.tsx:142-159`): buen diseño, un correlativo es irreversible y antes solo se veía después.
2. Llena el total, el tipo de documento (opcionalmente el DNI/RUC de la clienta) y confirma. El sistema le dice: *"Queda 'Pendiente de enviar' hasta que aprietes 'Transmitir' en la lista de abajo"*.
3. Busca ese botón en la lista de Emitidos. No está — solo hay "Liberar sin espera" junto a su fila `pendiente`. Se pregunta si algo salió mal, si tiene que recargar la página, o si perdió el correlativo.
4. Nada salió mal: el próximo barrido (el suyo mismo al volver a abrir Comprobantes, o el del siguiente cobro en Vender) lo recoge solo. Pero ella no tiene ninguna señal de eso — la pantalla, en el único lugar donde explica qué sigue, le describió un paso que ya no existe.
Se equivoca en el paso 3 por diseño (texto desactualizado), no por falta de capacitación — exactamente el criterio de D-12 (Norman) del CLAUDE.md de este repo.

### Conexión con el ERP (8,5)
Ver §6.

## 5 · Relevancia
| Criterio | Peso | Puntaje | Por qué (una línea) |
|---|---|---|---|
| Gestión (directo + indirecto) | ×2 | 9 | Es el único lugar donde CAYLA sabe si está al día con SUNAT — sin esto, un comprobante rechazado o atascado nunca se entera nadie hasta que llega una carta de la SUNAT. |
| Dinero y stock que toca | ×1 | 9 | Todo lo que se vende en las 3 tiendas se declara desde acá (o queda visiblemente sin declarar); no mueve stock directamente pero es la contraparte legal de cada venta. |
| Frecuencia y personas que la usan | ×1 | 8 | Se dispara solo en cada venta (automático) y un líder la abre para mirar la cola y las series con regularidad; hoy solo líderes, mañana también las cuentas de mostrador (ADR-0160). |
| Qué se detiene si falla | ×1 | 8 | Las ventas no se frenan (D-49: la caja no se congela), pero si esta pantalla fallara del todo, CAYLA dejaría de tener ninguna manera de ver ni resolver comprobantes atascados con SUNAT. |

Relevancia = (2·9 + 9 + 8 + 8) / 5 = **8,8** → **Núcleo**.

## 6 · Conexión con el ERP
- **Aguas arriba:** `registrar_venta` en Vender llama `enviarVentaASunat` en segundo plano justo después de cobrar (venta en vivo, `PuntoDeVenta.tsx:876-877`) y también al subir una venta que se guardó sin conexión (`:386`) — Comprobantes no inicia nada, reacciona a lo que Vender ya cerró.
- **Aguas abajo:** nada del ERP consume directamente un comprobante salvo el propio Historial de ventas y Caja, que comparten `fn_ventas_del_dia` con esta pantalla (la misma función que Facturación, Caja y Vender leen: un cambio ahí — como el que anda tocando `claude/pos-ticket-seller-selection-95d5b3` hoy — afecta a las tres a la vez).
- **Pájaro dueño y vecinos:** 08 Cuervo (`menu.ts:258`, `venta.facturacion`); vecinos directos: Vender (dispara el envío), Caja y Devoluciones (una nota de crédito nace de una devolución aprobada, comparte `series_comprobantes`). No confirmé `AVIARIO.md` línea por línea `[no verificable]`.
- **Externos, y qué pasa si caen:** Lucode/SUNAT (`sandbox.apisunat.pe` hoy — `LUCODE_ENTORNO=sandbox`, confirmado en BACKLOG.md:437 el 2026-09-22) es la única dependencia externa real de esta pantalla. Si cae: la venta se cobra igual, el comprobante queda `pendiente`/`pendiente_reintento` visible en la cola, se reintenta solo con backoff (15 min × intento, tope 2 horas, `20260922151500…sql:147-149`), y pasada 1 hora sin éxito el líder lo ve en rojo en las cuatro vistas (`FacturacionShell.tsx:92-107`). Es exactamente la frase que D-8 (Vogels) del CLAUDE.md de este repo exige por escrito, y aquí está escrita en el propio código, no solo en un documento aparte.

## 7 · Las 12 tareas, por importancia

### #1 · [Corregir] Que Felipe fusione y despliegue lo que ya está construido — la acción de mayor impacto no es tocar esta pantalla
- **Dónde:** nada de código. Es una decisión de negocio: aprobar y fusionar los PR ya abiertos sobre este módulo (si queda alguno; a la fecha de este análisis `claude/comprobantes-series-auto-emit-4346ee` y `claude/terminales-cuentas-129fd4` YA están fusionados — verificar si sigue habiendo un PR abierto de Comprobantes con `gh pr list` antes de dar esta tarea por hecha) y, sobre todo, **decidir cuándo pasar `LUCODE_ENTORNO` a `produccion`** siguiendo los 3 pasos que la propia pantalla Series ya explica (archivar series de prueba, registrar series nuevas desde 1, hacer una venta chica de prueba) `[código SeriesPanel.tsx:217-228]`.
- **Por qué en este puesto:** todo lo demás en esta lista es ajuste fino sobre un módulo que ya resuelve el 90 % de lo que importa. La única cosa que de verdad bloquea que CAYLA facture de verdad hoy es una decisión de Felipe, no una línea de código.
- **Cómo lo verificas tú:** `gh pr list --search "comprobantes"` no muestra ningún PR abierto sobre este módulo; y en Vercel, la variable `LUCODE_ENTORNO` dice lo que Felipe decidió que diga.
- **Esfuerzo / dependencias:** ninguna (es una decisión, no una tarea de código) · no depende de nada de esta lista.

### #2 · [Corregir] Borrar la promesa de un botón "Transmitir" que ya no existe
- **Dónde:** `EmitirComprobanteModal.tsx:183-187`.
- **Por qué en este puesto:** es el único hallazgo real de esta pantalla que confunde a una persona real en el momento de usarla (§2.1, §4 Utilidad). Barato de arreglar, y cada día que sigue así alguien se pregunta si perdió un correlativo.
- **Cómo lo verificas tú:** emitir un comprobante manual como líder; el texto bajo el formulario dice qué pasa de verdad (se transmite solo al abrir Comprobantes o al próximo cobro), no que hay que "apretar Transmitir".
- **Esfuerzo / dependencias:** S · ninguna.

### #3 · [Corregir] Refrescar el diccionario de datos de producción
- **Dónde:** `pnpm datos:generar:produccion` (regla de oro de `CLAUDE.md`, ya listada en `docs/BACKLOG.md:443,467`).
- **Por qué en este puesto:** desde hoy, `docs/datos/generado/DICCIONARIO-RETAIL.md` describe una tabla `comprobantes` y una `series_comprobantes` que ya no existen así en producción — cualquier persona (o sesión de Claude) que lo lea para entender el esquema real se equivoca con evidencia de ayer. Es la misma regla que el propio repo se dio a sí mismo.
- **Cómo lo verificas tú:** tras correrlo, `comprobantes` en el diccionario muestra `pendiente_reintento` en su CHECK de estado y las 4 columnas de bitácora de intentos; `series_comprobantes` muestra `archivada_at`.
- **Esfuerzo / dependencias:** S · ninguna (es un comando, no requiere aprobación de esquema — no escribe nada, solo lee).

### #4 · [Mejorar] `getComprobantesMes` con paginación antes de que el corte de PostgREST muerda en silencio
- **Dónde:** `lib/comprobantes.ts:14-29` (patrón a seguir: `resumen-inventario.ts` ya pagina con `.range()`, según lo cita `docs/BACKLOG.md:460`).
- **Por qué en este puesto:** hoy está lejos (17-23 filas contra el corte de 1000), pero es del tipo de falla que no avisa — un mes con más de 1000 comprobantes simplemente mostraría menos de los que hay, sin ningún error visible. Mejor cerrarlo con calma que apurado el día que el volumen llegue.
- **Cómo lo verificas tú:** con datos de prueba, insertar >1000 comprobantes de un mes y confirmar que la pantalla sigue mostrando el total real (o falla con un mensaje explícito) en vez de cortar en silencio.
- **Esfuerzo / dependencias:** M · ninguna.

### #5 · [Replantear] La nota de crédito de una factura: ¿una segunda serie por tienda, o falla explícita hasta entonces?
- **Dónde:** `20260922234100_series_archivar.sql:30-33` (documentado como fuera de alcance a propósito); `fn_reservar_numero_serie`, `emitir_nota`, `aprobar_devolucion`.
- **Por qué en este puesto:** es la única función de esta pantalla con un hueco de cumplimiento SUNAT real, aunque dormido — CAYLA hoy no emite facturas de verdad (solo boletas), así que no se ha activado, pero el día que la primera factura necesite una nota de crédito, el sistema fallaría sin aviso claro si nadie decidió esto antes. Su único trabajo en esta lista es forzar la decisión, no tomarla.
- **Cómo lo verificas tú:** Felipe elige A o B (ver §8, mismo formato Ganas/Pagas que ya usó el propio equipo en `docs/BACKLOG.md:451`); después, con B, corregir una factura de prueba en sandbox y ver que la nota de crédito sale con la serie F correcta.
- **Esfuerzo / dependencias:** decisión primero; implementación M. No es urgente — su disparador es la primera factura real, que hoy no existe.
- **DECIDÍ (propuesta, la confirma Felipe):** por ahora, que `aprobar_devolucion`/`emitir_nota` fallen con un mensaje explícito ("Esta tienda solo tiene serie de nota de crédito para boletas; para facturas, contacta a...") en vez de dejar que SUNAT rechace en silencio — sin tocar el esquema todavía.
- **DESCARTÉ:** migrar ya el esquema a dos series de NC por tienda (B y F) — es trabajo de verdad por algo que hoy tiene 0 casos en producción (0 facturas emitidas); mejor esperar al disparador real, como ya decidió el equipo el 2026-09-21 para el caso equivalente de boletas.
- **SE ROMPE SI:** CAYLA emite su primera factura real, alguien la tiene que corregir con una nota de crédito, y `fn_reservar_numero_serie` reserva un número de la serie de boletas (letra B) para un documento que corrige una factura (que SUNAT exige con letra F) — SUNAT rechaza la nota y nadie entiende por qué a simple vista.

### #6 · [Mejorar] Cerrar el hueco de `moneda` sin CHECK en `comprobantes`
- **Dónde:** `comprobantes.moneda` (sin constraint hoy, `DICCIONARIO-RETAIL.md:1435`).
- **Por qué en este puesto:** hoy ninguna pantalla puede alcanzar este estado imposible (todo lo que escribe usa el default `'PEN'`), y `transmitirComprobante` se defiende solo tratando cualquier valor no-`"USD"` como `"PEN"` — así que el riesgo real es bajo. Pero es exactamente el tipo de candado ausente que el principio 4 (Lamport) del repo pide cerrar en el esquema, no dejar a la defensiva del código de aplicación.
- **Cómo lo verificas tú:** intentar `insert`/`update` directo con `moneda = 'XYZ'` (fuera de la UI, como prueba) debe fallar con una excepción de constraint, no guardarse.
- **Esfuerzo / dependencias:** S · migración simple (`CHECK (moneda in ('PEN','USD'))`), sin tocar datos existentes (todo lo que hay ya es `'PEN'`).

### #7 · [Mejorar] Aviso rojo compartido: que el aviso de "más de 1 hora en cola" no se sume al rojo de una tarjeta y un chip que ya están contando lo mismo
- **Dónde:** `FacturacionShell.tsx:92-107` (el aviso, compartido por las 4 vistas) vs. `ComprobantesTarjetas.tsx:125` (tarjeta Rechazados) y `facturacion-actividad.ts:93` (chip por fila).
- **Por qué en este puesto:** no es un problema de datos ni de dinero — es el tope de 2 rojos por pantalla (ADR-0012) que se puede romper en un escenario real (rechazados + cola atrasada el mismo día) y nadie lo notó porque las piezas se construyeron en momentos distintos (el aviso es de hoy, la tarjeta es de ADR-0124).
- **Cómo lo verificas tú:** con datos de prueba, un comprobante `rechazado` y otro `pendiente_reintento` de más de 1 hora al mismo tiempo → contar los grupos de rojo en la vista Emitidos; no debería pasar de 2.
- **Esfuerzo / dependencias:** S · depende de que Felipe decida cuál de los tres cede el rojo (probablemente el aviso, que ya usa `border`/`bg` suaves y podría pasar a ámbar si nada lleva más de 1h pero sí hay rechazados, o mantenerse solo cuando la cola en sí es el problema).

### #8 · [Mejorar] Actualizar el comentario de `ComprobantesPanel.tsx` antes de que ADR-0160 lo vuelva falso en producción
- **Dónde:** `ComprobantesPanel.tsx:141-142` ("Solo líder — la pantalla entera ya lo es").
- **Por qué en este puesto:** hoy es cierto (la migración de terminales no está en producción); el día que se pegue, una cuenta de terminal de ventas SÍ entrará a esta pantalla sin ser líder, y el comentario quedará mintiendo exactamente como le pasó a `caja.md` con el comentario de ADR-0143 (`caja.md §2.1`) — el mismo patrón de raíz en dos pantallas.
- **Cómo lo verificas tú:** el comentario dice algo como "líder o terminal de ventas — la pantalla se abre con `exigirPermiso('facturar')`", verificable leyendo `layout.tsx:26`.
- **Esfuerzo / dependencias:** S · sin dependencias, se puede hacer ya (no hace falta esperar a que la migración de terminales se pegue).

### #9 · [Conectar] Confirmar en el navegador la puerta del integrante para las 4 vistas de Comprobantes, con datos reales
- **Dónde:** `layout.tsx:26`, las 4 `page.tsx`.
- **Por qué en este puesto:** el propio equipo lo dejó anotado como "falta solo el clic real" en la auditoría de R1 (`docs/BACKLOG.md:454`) para el módulo anterior (Facturación); con el módulo reconstruido hoy (Comprobantes) esa verificación en vivo no está repetida en ningún lado del BACKLOG que yo haya visto.
- **Cómo lo verificas tú:** entrar como una persona sin permiso `facturar` y escribir `/vender/comprobantes` en la barra → debe redirigir a `/`.
- **Esfuerzo / dependencias:** S · ninguna.

### #10 · [Mejorar] Móvil: filas apiladas altas en Emitidos y Proformas
- **Dónde:** `ComprobantesPanel.tsx` (`COLUMNAS`, `:113`), `ProformasPanel.tsx` (`COLUMNAS`, `:27`) — ya anotado en `docs/BACKLOG.md:461`.
- **Por qué en este puesto:** afecta la usabilidad en celular (el mostrador puede ser una tablet, no siempre escritorio) pero no dinero ni datos; el equipo ya lo tiene anotado, lo confirmo vigente.
- **Cómo lo verificas tú:** en 390 px de ancho, una lista de 20 comprobantes ocupa varias pantallas de scroll; comparar contra el mismo patrón ya resuelto en otra pantalla hermana si existe.
- **Esfuerzo / dependencias:** M · bajo valor frente a las anteriores.

### #11 · [Mejorar] Los modales de serie, anular y liberar siguen con `Boton` del sistema, no la "isla" — *bajo valor / opcional*
- **Dónde:** anotado ya en `docs/BACKLOG.md:462`; `SeriesPanel.tsx`, `ComprobantesPanel.tsx` (modales de anular/liberar).
- **Por qué al final:** es una decisión de sistema de diseño pendiente en todo el repo, no algo específico de esta pantalla que valga la pena resolver aislado.
- **Cómo lo verificas tú:** comparar visualmente contra el componente "isla" que use la pantalla hermana que ya lo adoptó, si existe.
- **Esfuerzo / dependencias:** S · depende de que el sistema de diseño decida primero el patrón "isla" en genérico.

### #12 · [Eliminar/fusionar/conectar] Cron de respaldo para la cola — *bajo valor / futuro*
- **Dónde:** anotado en `docs/BACKLOG.md:442`.
- **Por qué al final:** hoy la cola se barre sola con cada cobro y cada apertura de Comprobantes; un cron de respaldo solo importa si la cola se queda quieta de verdad (nadie cobra ni abre Comprobantes por horas), que con 3 tiendas operando es un escenario raro hoy.
- **Cómo lo verificas tú:** en un día sin ninguna venta ni apertura de Comprobantes, un comprobante `pendiente_reintento` seguiría esperando sin que nadie lo note — decidir si eso es aceptable antes de construir el cron.
- **Esfuerzo / dependencias:** M · futuro, sin disparador todavía.

## 8 · Estrategia alternativa

**Nota de crédito para una factura corregida: ¿fallar explícito ahora, o construir la segunda serie ya?**

| | **A — Fallar explícito hasta la primera factura (propuesta #5)** | **B — Migrar ya a dos series de NC por tienda (B y F)** |
|---|---|---|
| **Ganas** | Cero trabajo de esquema hoy; el mensaje de error es claro en vez de un rechazo silencioso de SUNAT. | Cumple la norma para siempre, sin fecha de vencimiento escondida. |
| **Pagas** | El día que llegue la primera factura, alguien tiene que acordarse de volver y construir B. | Una migración de producción por algo con 0 casos reales hoy (0 facturas emitidas), tocando funciones que otras ramas están modificando en paralelo (riesgo de choque). |

No la doy por decidida — mismo criterio que el equipo ya aplicó el 2026-09-21 para el caso equivalente de boletas (`docs/BACKLOG.md:451`, opción A elegida entonces). **Decide Felipe.**

## 9 · Referentes de ERP y futuro
`[no verificable]`: lo que sigue viene de memoria, no lo verifiqué contra ninguna documentación de esos productos.
- **Un tope de reintentos con escalamiento a un humano, no solo "más de 1 hora":** Shopify POS y sistemas de facturación electrónica de otros países suelen escalar (SMS/email a un admin) después de N intentos fallidos, no solo mostrar un color en una pantalla que alguien tiene que abrir. Filtro de escala: con 3 tiendas y un líder que ya revisa Comprobantes seguido, un canal de alerta aparte (correo, WhatsApp) es más infraestructura de la que el volumen de hoy justifica → Futuro.
- **Consultar el estado de un `enviado` que nunca avanza:** hoy no hay camino para eso (anotado como fuera de esta entrega en `docs/BACKLOG.md:473`) — en otros PSE existe un "consultar estado" genérico, no solo para anulaciones.
- **Panel de reconciliación contable (comprobante ↔ asiento):** fuera del alcance de "3 tiendas + 1 taller" hoy; CAYLA no tiene un módulo de contabilidad que consuma esto todavía.

## 10 · Fuera de esta pantalla
**El chip "Pruebas" y el paso a producción real dependen de una variable de entorno (`LUCODE_ENTORNO`) que nadie en este repo puede leer ni verificar desde el código — solo Felipe, desde Vercel.** `ADR-0165` lo dice explícito: "El valor no se pudo leer desde la CLI sin descargar todos los secretos; se confía en el cambio de Felipe" (`docs/BACKLOG.md:437`). Es más grave que cualquier hallazgo de esta pantalla porque significa que **nadie tiene forma automatizada de verificar, hoy, si CAYLA está declarando de verdad a SUNAT o solo al sandbox** — la única señal es el chip ámbar "Pruebas" en la cabecera, que un líder podría dejar de mirar. Un chequeo barato que sí se puede correr desde código (no necesita el secreto): que la cantidad de comprobantes con `entorno_transmision = 'produccion'` crezca cada semana que CAYLA opere de verdad — si se queda en 2 (los dos que ADR-0165 dice que ya se transmitieron por error el 8 y 9 de setiembre) mientras siguen entrando ventas, alguien dejó el sandbox prendido sin darse cuenta.

## 11 · Líneas propuestas para BACKLOG.md
- [ ] `[pantalla:vender-comprobantes]` #1 Confirmar con Felipe: ¿queda algún PR abierto de Comprobantes por fusionar, y cuándo pasa `LUCODE_ENTORNO` a producción? — decisión, sin código
- [ ] `[pantalla:vender-comprobantes]` #2 Corregir el texto de `EmitirComprobanteModal.tsx` que promete un botón "Transmitir" que ya no existe — S
- [ ] `[pantalla:vender-comprobantes]` #3 `pnpm datos:generar:produccion` para refrescar el diccionario tras D-60 — S
- [ ] `[pantalla:vender-comprobantes]` #4 Paginar `getComprobantesMes` con `.range()` antes del corte de 1000 filas de PostgREST — M
- [ ] `[pantalla:vender-comprobantes]` #5 Replantear nota de crédito de factura (letra B/F): decisión Ganas/Pagas de Felipe — decisión + M
- [ ] `[pantalla:vender-comprobantes]` #6 CHECK de `moneda` en `comprobantes` (solo PEN/USD) — S
- [ ] `[pantalla:vender-comprobantes]` #7 Evitar que el aviso de cola atrasada se sume al rojo de tarjeta+chip que ya cuentan lo mismo — S
- [ ] `[pantalla:vender-comprobantes]` #8 Actualizar el comentario de `ComprobantesPanel.tsx:141` antes de que ADR-0160 lo vuelva falso — S
- [ ] `[pantalla:vender-comprobantes]` #9 Verificar en el navegador la puerta del integrante en las 4 vistas de Comprobantes (post-D-60) — S
- [ ] `[pantalla:vender-comprobantes]` #10 Móvil: compactar filas apiladas en Emitidos y Proformas — M (bajo valor)
- [ ] `[pantalla:vender-comprobantes]` #11 Modales de serie/anular/liberar a la "isla" del sistema de diseño — S (bajo valor, depende del sistema de diseño)
- [ ] `[pantalla:vender-comprobantes]` #12 Cron de respaldo para la cola de SUNAT — M (futuro, sin disparador)
- [ ] `[pantalla:vender-comprobantes]` Fuera de la pantalla: un chequeo automatizado (sin leer el secreto) de que `entorno_transmision = 'produccion'` sigue creciendo semana a semana — S

## Inventario de elementos
| Zona | Elemento | Qué hace | Veredicto (bien / ajustar / sobra / falta) | Evidencia |
|---|---|---|---|---|
| Cabecera | Título "Comprobantes" + bajada "Cada venta se declara sola..." | Explica la finalidad en una frase | bien | `[código FacturacionCabecera.tsx:105-106]` |
| Cabecera | Línea viva "actualizado hace Ns" | Avisa si la vista se dejó abierta mucho rato | bien | `[código FacturacionCabecera.tsx:31-49]` |
| Cabecera | Chip "Pruebas: se envía al sandbox" | Evita confundir una boleta de prueba con una real | bien | `[código FacturacionCabecera.tsx:112-116]` |
| Cabecera | Cifras "Por enviar a SUNAT" / "Proformas vigentes" | Resumen a la derecha, solo si el dato es real | bien | `[código FacturacionCabecera.tsx:89-96]` |
| Cabecera | Botones "Emitir comprobante" / "Nueva proforma" | Abren los dos modales globales | bien | `[código FacturacionCabecera.tsx:121-127]` |
| Aviso | Banda roja "N comprobantes llevan más de 1 hora..." | Escalamiento cuando el reintento solo no alcanzó | ajustar (puede sumar un 3er rojo, ver #7) | `[código FacturacionShell.tsx:92-107]` |
| Pestañas | Series · Emitidos · Por reintentar · Proformas | Navegación con contador por pestaña | bien | `[código FacturacionPestanas.tsx:74-105]` |
| Series | Tarjeta por serie con "en uso"/"sin estrenar" | Estado de cada serie activa | bien | `[código SeriesPanel.tsx:150-178]` |
| Series | Tarjeta punteada "Sin serie de..." | Avisa qué falta por registrar, con acceso directo | bien | `[código SeriesPanel.tsx:180-193]` |
| Series | "El día de pasar a la SUNAT real" | Guía de 3 pasos, solo visible en sandbox | bien | `[código SeriesPanel.tsx:217-228]` |
| Emitidos | 4 tarjetas (Emitidos, Monto facturado, Pendientes, Rechazados) | Resumen del mes + cola sin filtro de mes | bien | `[código ComprobantesTarjetas.tsx]` |
| Emitidos | Modal "Emitir comprobante" | Emisión manual fuera de una venta | ajustar (texto fantasma, ver #2) | `[código EmitirComprobanteModal.tsx:183-187]` |
| Emitidos | Lista con botones por estado (Liberar/Reintentar/Anular/Consultar) | Acción correcta según `accionesDelComprobante` | bien | `[código facturacion-comprobantes-reglas.ts:129-135]` |
| Emitidos | Enlaces "Ver PDF / XML / CDR" | Documentos reales de SUNAT | bien | `[código ComprobantesPanel.tsx:85-106]` |
| Por reintentar | Lista de la cola con intentos y último error | Traduce el error técnico a texto de tienda | bien | `[código ColaSunatPanel.tsx; transmision-reglas.ts:96-102]` |
| Por reintentar | "Reintentar ahora" por fila | Adelanta el barrido para uno | bien | `[código ColaSunatPanel.tsx:64-66]` |
| Proformas | 4 tarjetas + orden "excepciones primero" | Las que vencen antes, arriba | bien | `[código ProformasPanel.tsx:34-38]` |
| Proformas | Modal "Convertir a comprobante" con aviso si venció | Pide confirmación consciente al precio viejo | bien | `[código ProformasPanel.tsx:169-178]` |

## Historial
| Fecha | Modo | Cumplimiento | Relevancia | Tareas cerradas de las 12 anteriores |
|---|---|---|---|---|
| 2026-09-22 | completo | 8,0 | 8,8 | — (primer análisis de esta pantalla) |
