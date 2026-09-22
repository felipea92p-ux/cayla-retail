# Pantalla — Comprobantes de proveedores (`/compras`)

> Modo: completo · Fecha: 2026-09-22 · Rol/sede: líder, Tienda TRU (la pantalla no depende de la sede, ver hallazgo #3) · Datos: real (parcial) — volumen de producción vía `docs/datos/generado/retail_filas.json` (refrescado 2026-09-21) + estructura/RLS/RPC leídas de `supabase/migrations/*.sql` (fuente que el propio CLAUDE.md trata como la definición vigente); **SQL de esta pantalla aún no corrido contra producción por Felipe** — bloque listo en la sección 2
> SHA analizado: `16e61448` (= `origin/main`; la rama iba 0/0) — si `page.tsx`, `CompraFormV2.tsx` o sus `lib/*` cambian después, este análisis está vencido
> Archivos: `apps/web/app/(app)/compras/page.tsx` · `layout.tsx` · `nueva/page.tsx` · `exportar/route.ts` · `components/CompraFormV2.tsx` (883 líneas) · `CompraFormProgreso.tsx` · `ComprobantesListaFilas.tsx` · `ComprobantesListaVacia.tsx` · `FiltrosCompras.tsx` · `lib/compras.ts` · `compras-reglas.ts` · `compras-indicadores.ts` · `compras-reparto.ts` · `comprobantes-lista-reglas.ts` · `adjuntos-compra.ts` · RPC `registrar_compra`, `listar_compras`/`listar_compras_operativo`, `resumen_compras`/`resumen_compras_extra`, `recibir_compras`, `fn_puede_registrar_compras`, `fn_puede_ver_dinero_de_compras` · tablas `compras`, `compra_items`, `compra_pagos`, `compra_adjuntos`, `compra_item_destinos`, `proveedores` · pájaro dueño: **09 Pelícano**
> Otra sesión tocándola: no directamente (`compras/page.tsx`, `CompraFormV2.tsx` y su `lib/` no aparecen en ninguna fila de `docs/SESIONES-ACTIVAS.md` — «Activas ahora»). Sí hay que coordinar con `claude/billing-design-analysis-ee464b` antes de tocar `components/ui/Chip.tsx` (sube el contraste del tono «apagado», y su propia nota dice «lo usa también Compras») y con `claude/proveedores-ui-ux-animaciones-48011f` si se toca `compras/proveedores/**`.

## 0 · Veredicto

El módulo de dinero mejor construido del repo — escritura solo por RPC, redondeo idéntico entre cliente y base, idempotencia ante reintento, candado de dinero en tres puertas — tiene **cero facturas registradas en producción** con 76 proveedores ya cargados. La causa más probable no es esta pantalla: es que solo un líder puede entrar, y R-10 (`docs/datos/15-COMO-OPERA-CAYLA.md`) dice que quien de verdad compra y paga con frecuencia en CAYLA **no es el líder**.

**Cumple su finalidad:** 7,1/10 · **Relevancia:** 8,0/10 — **Núcleo**

## 1 · Finalidad declarada

"Esta pantalla existe para que la factura del proveedor sea el eje: de ella cuelgan la recepción y el pago, y lo pendiente de ambos se calcula, nunca se guarda a mano." Fuente: `docs/adr/0035-la-factura-de-compra-es-el-eje-de-recepcion-y-pago.md` y el comentario de cabecera del propio `page.tsx:25-34` `[código]`. Coinciden docs y pantalla: **sí** — el copy visible ("Cada comprobante registra lo que se compró; la recepción y el pago se anotan contra él") es literalmente el resumen del ADR `[visto]` `[código page.tsx:108]`.

## 2 · Objeción

**Ningún rol para "la persona de Compras" — solo el líder entra, y en la vida real ella no es quien paga con frecuencia.** `apps/web/app/(app)/compras/layout.tsx:34` redirige a `/` a cualquiera que no tenga `rol = 'lider'`, y `fn_puede_registrar_compras()` (`supabase/migrations/20260912231956_compras_desde_factura.sql:191-196`) es literalmente `select fn_es_lider()` — sin excepción `[código]`. Pero `docs/datos/15-COMO-OPERA-CAYLA.md:100-108` (R-10, dato duro de Felipe) dice: *"Existe una persona encargada de Compras. Paga con frecuencia. También pagan Felipe y una persona de confianza; **rara vez** las líderes de equipo"* y agrega, en sus propias palabras, *"esto hay que pensarlo"* `[producción/doc]`.

El costo no es teórico: `docs/datos/generado/retail_filas.json` (refrescado 2026-09-21, 9 días después de que ADR-0035 puso el módulo en producción) muestra `compras: 0`, `compra_items: 0`, `compra_pagos: 0`, `compra_adjuntos: 0` — con `proveedores: 76` ya cargados `[producción]`. El módulo mejor construido de Compras lleva más de una semana en producción sin una sola factura, mientras la persona que en la realidad compra y paga no puede entrar. Trade-off: dar acceso de escritura de dinero a alguien que no es líder es exactamente lo que ADR-0126 acaba de cerrar con tres candados (funciones, tablas, bucket) — no se reabre a la ligera. La ruta más sólida es un **tercer rol semántico** (`verDinero`/`registrarCompras` ya existen como conceptos separables en `lib/menu.ts:44-53`, con el comentario propio: *"el día que nazcan Admin y Solo lectura (D-12), se cambia UNA función y el árbol no se toca"*), no abrir el candado a todo integrante. Decide Felipe — ver tarea #1.

## 3 · Lo que está bien y no se toca

- **Escritura solo por RPC.** `compras`, `compra_items` y `compra_pagos` tienen RLS con política de SELECT únicamente; sin política de INSERT, Postgres niega la escritura directa aunque exista el grant — nadie puede saltarse "contado exige pago" desde la API `[código ADR-0035]`.
- **Redondeo idéntico en cliente y base, documentado línea por línea.** `costoBase`/`totalesCompra` (`apps/web/lib/compras-reglas.ts:260-308`) usan exactamente la fórmula que `registrar_compra` aplica (ADR-0135 A1): con precio con IGV, el total es lo que suma el papel y el IGV absorbe el redondeo — nunca hay descuadre de centavos entre lo que el formulario muestra y lo que la base guarda `[código]`.
- **Idempotencia real ante reintento.** Un token por intento (`CompraFormV2.tsx:195,365`, renovado solo tras éxito) hace que un corte de red después del commit devuelva la misma factura en vez de duplicarla (ADR-0032/0135 A2) `[código]`.
- **El candado de dinero (ADR-0126) se inyecta, no se copia.** `fn_aplicar_candado_de_dinero()` relee la definición viva de las 5 funciones de dinero y les antepone el candado, sea cual sea su cuerpo — sobrevive a que otra rama recree una de esas funciones sin saberlo, y es re-verificable con una sola consulta `[código migración 20260919160000]`.
- **Adjuntos se degradan con gracia.** Se suben DESPUÉS de crear la compra; si alguno falla, no se pierde el registro — aviso con el nombre de los que faltaron y reintento desde el detalle (`CompraFormV2.tsx:381-398`) — exactamente el principio 9 del repo `[código]`.
- **Paginación por cursor, no por OFFSET.** `listar_compras`/`listar_compras_operativo` nunca traen más de 50 filas (`TAMANO_PAGINA`, `compras.ts:138`), con índice para vencimiento — sirve igual con 300 comprobantes que con 3 millones `[código]`.
- **`prefers-reduced-motion` respetado** en las dos hojas de estilo de esta pantalla (`comprobantes-lista.css:184`, `comprobantes-registro.css:204`) `[código]`.
- **Ninguna función fantasma detectada.** Cada promesa del copy tiene código detrás: "Sugerida: emisión + 7 días" (`sumarDias`, `CompraFormV2.tsx:204`), atajo `/` y `j`/`k` (`ComprobantesListaFilas.tsx:79-87`), "0 si la factura no discrimina IGV" (`discriminaIgv`, línea 78), exportar CSV con BOM para Excel `[código]`.

## 4 · Las seis dimensiones

| Dimensión | Puntaje | Hallazgo principal | Evidencia |
|---|---|---|---|
| Estética | 7 | Coherente con CAYLA y con ADR-0136; `MAX_ROJO_POR_PANTALLA` no se importa en esta pantalla y el rojo de la tabla se multiplica sin tope con varias vencidas | `[código]` |
| Lógica de negocio | 6 | El modelo (contado/crédito, redondeo, reparto, idempotencia) es de lo más sólido del repo; el hueco de rol (R-10) no tiene ADR de cierre | `[código]` `[doc]` |
| Arquitectura | 8,5 | Cero estados imposibles por RLS+RPC, transacción única, degradación elegante en adjuntos, candado de dinero verificable | `[código]` |
| Funciones | 8 | Todo lo prometido en el copy funciona; el detalle (`/compras/factura/[id]`) no se auditó en esta pasada | `[código]` `[no verificable]` |
| Utilidad | 5 | Para quien SÍ es líder el formulario es guiado y claro; para quien de verdad compra a diario (R-10), la puerta está cerrada | `[código]` `[doc]` |
| Conexión con el ERP | 8 | Bien conectada aguas arriba/abajo; Producción tiene su propio módulo paralelo por decisión ya tomada de Felipe (D-H), no por descuido | `[doc]` `[código]` |

### Estética
(a) **Coherencia con CAYLA:** `card-cayla`, `label-cayla`, `font-display`, crema/tinta, cascada de entrada con `--i` — mismo sistema que Colaboradores y Facturación `[visto]` `[código]`. (b) **Marca y tono:** copy en español, sin jerga técnica, coherente con el resto del ERP `[visto]`. (c) **Heurísticas:** el rojo del acento ("Por pagar", chip "vencida", fecha de vencimiento) es correcto conceptualmente (Nielsen: visibilidad del estado del sistema), pero `MAX_ROJO_POR_PANTALLA = 2` (`packages/shared/src/design-tokens.ts:73`) **no se importa** en `page.tsx` ni en `CompraFormV2.tsx` — a diferencia de `TarjetaCifra.tsx:18-19`, que sí lo conoce y por eso usa un borde en vez de texto rojo en la tarjeta. Con 3 comprobantes vencidos simultáneos, la tabla sola ya pinta 6 elementos rojo (3 fechas + 3 chips "vencida" vivos) además del borde de la tarjeta — sin que nada en el código lo limite `[código página.tsx:259,289]`. Objetivos táctiles: `SegmentoDeslizante` (Contado/Crédito, Factura/Boleta/Nota) usa `px-3.5 py-2.5` con texto de 11px — por debajo de 44px táctiles en tablet de mostrador; mismo patrón ya señalado en `docs/pantallas/colaboradores.md` #6 y `docs/pantallas/vender-historial.md` `[código SegmentoDeslizante.tsx:68]`.

### Lógica de negocio
Contra `docs/datos/01-INVARIANTES.md` §"Compras — el dinero" y `DECISIONES-2026-09-12.md`: la pantalla cumple D-46 (cuentas por pagar) parcialmente — el IGV del mes ya se muestra (tarjeta "IGV del mes"), pero el acumulado anual contra el umbral de 300 UIT sigue sin construirse, como ya anota `docs/BACKLOG.md:262-273` `[doc]`. Contra `15-COMO-OPERA-CAYLA.md`: R-01 (97% al contado) explica por qué el diseño no invirtió en un reporte de antigüedad por tramos — correcto, no sobre-construido `[doc]`. R-07/R-08 (30%+ de las compras sin factura, "lo primero que hay que responder es cuánto se compró sin respaldo") **no tiene ninguna cifra en esta pantalla**: esa métrica vive en `resumen_sin_comprobante` (`compras-indicadores.ts:249`), una función que ninguna vista de `/compras` llama — el líder tendría que saber que existe y navegar a otro lado `[código]`. El hueco de rol (R-10) es una decisión de negocio real, con la frase del propio Felipe ("esto hay que pensarlo") sin resolver en ningún ADR — ninguna decisión escrita lo cubre todavía `[doc]`. Referentes: Shopify POS/Lightspeed no tienen equivalente directo de "factura de proveedor" en el punto de venta; el patrón de Odoo/NetSuite (bill = eje, recepción y pago contra ella) es el mismo que ADR-0035 ya adoptó — sin diferencia práctica a construir hoy para 3 tiendas + 1 taller **[no verificado, de memoria]**.

### Arquitectura
Cadena completa trazada: `page.tsx` → `lib/compras.ts`/`compras-indicadores.ts` (server, solo lectura) → RPC `listar_compras`/`resumen_compras`/`resumen_compras_extra` (todas `security definer`, `set search_path` fijo) → vistas `compras_resumen`/`compra_items_resumen` (derivadas, nunca columnas que se desincronicen — principio 4) `[código]`. Estados imposibles: `compras_credito_tiene_vencimiento`, `compras_no_sobrepagada` (`pagado + notas_credito <= total`), `compras_no_sobrerecibida` y `unique (proveedor_id, serie, numero)` — los cuatro como CHECK/UNIQUE de tabla, no validación de app (principio 2) `[código migraciones 20260912231956, 20260918202000]`. Transacción: `registrar_compra` escribe comprobante + líneas + reparto + pago(s) en una sola llamada RPC — o todo o nada. Concurrencia: pagos con `for update` sobre la fila de `compras` (ADR-0135 A2). Caída externa: adjuntos se suben aparte y su falla no revierte la compra (ver §3); no hay integración externa (SUNAT/Culqi) en este flujo — coherente con que Compras es dinero saliente doméstico, sin API que se pueda caer `[código]` `[doc]`. Volumen: con 0 filas hoy, el diseño (cursor, límite 50, índices por vencimiento) ya está pensado para el volumen real de CAYLA (unos pocos cientos de comprobantes al año, no millones) — no hay sobre-ingeniería ni fragilidad esperable `[inferido]`. Lentes: **RLS** cerrado en tres puertas (ADR-0126); **datos personales** — `proveedores.banco`/`cuenta_bancaria` siguen legibles por cualquier sesión autenticada directo de la tabla (`01-INVARIANTES.md:174`), defecto ya conocido y que Felipe decidió posponer (ADR-0134/D7) — no es nuevo, se cita como contexto, no como tarea nueva `[doc]`; **IGV** correcto (solo factura discrimina, costo se guarda sin IGV); **auditoría** — `anular_compra` nunca borra, exige motivo (`compras.motivo_anulacion`), y la "foto" de `compras_resumen` la mantienen triggers (ADR-0036), no un cron `[doc]`.

### Funciones
Existen y funcionan: listado con filtros/orden/paginación/exportar, 4 KPIs, registro completo (proveedor, tipo, condición, reparto entre tiendas, líneas con ayuda de costo conocido, pago con varios medios, adjuntos, nota), checklist "LISTO N DE 4" que se actualiza en vivo `[código]`. Fantasma: ninguna detectada. Falta: ninguna acción de anular/editar visible **desde esta lista** (existe `anular_compra` por ADR-0035, pero vive en el detalle `/compras/factura/[compraId]`, que **no se auditó en esta pasada** — marcado `[no verificable]`, ver tarea #9). Sobra: nada — el propio comentario de `page.tsx:33-34` documenta que ya se quitó un contador ("Registradas") que no llevaba a ninguna acción; señal de que el equipo ya poda lo que sobra.

### Utilidad (persona sin contexto)
Escenario 1 — **la persona encargada de Compras** (R-10) llega un lunes con la factura del proveedor de tela en la mano, entra a CAYLA con su cuenta de integrante, hace clic en "Compras" del menú (que ni siquiera le aparece — `menu.ts:187` exige `verDinero`) o escribe `/compras` directo: `layout.tsx:34` la redirige a `/` sin ningún mensaje. No sabe si el sistema está roto, si no tiene permiso, o si se equivocó de URL — el fallo es del diseño (nunca dice "esto es para líderes"), no de su capacitación `[código]`. Escenario 2 — **el líder**, con la factura en la mano: proveedor, tipo, serie/número, fecha, condición, líneas con ayuda de costo — el formulario guía bien y el checklist evita registrar algo a medias; si el proveedor ya factura con IGV incluido, el switch "El precio incluye IGV" resuelve exactamente el problema que antes obligaba a dividir entre 1.18 a mano `[código]` `[visto]`. Pero el líder, según R-10, "rara vez" es quien paga con frecuencia — así que quien SÍ podría usarlo bien casi no lo usa, y quien SÍ lo usaría a diario no puede entrar. Coincide con el dato duro: 0 facturas en 9 días de producción.

### Conexión con el ERP
- **Aguas arriba:** proveedores activos (con marcas ADR-0140, datos de pago ADR-0134, plazo de crédito), catálogo de productos/variantes activas, ubicaciones `[código nueva/page.tsx:18]`.
- **Aguas abajo:** Recepción (`/compras/recibir`, `recibir_compras`), Por pagar, Notas de crédito, exportación CSV para el contador, IGV del mes (crédito fiscal, D-46) `[código]` `[doc]`.
- **Pájaro dueño y vecinos:** 09 · Pelícano (`docs/datos/generado/AVIARIO.md:21`). Vecino de **Producción** (10 · Gallito): tiene su propio directorio de proveedores y sus propios Comprobantes/Por pagar/Recibir (`comprobantes_produccion`, ADR-0133), **por decisión ya tomada de Felipe contra la recomendación de la sesión** (`docs/BACKLOG.md:204`: "D-H... Producción tiene su propio... Compras no se toca") — 0% de código compartido con `/compras`, y eso está bien: ya fue decidido, no es un defecto de esta pantalla `[doc]`.
- **Externos:** ninguno en este flujo (sin SUNAT/Culqi/Nubefact — Compras es dinero saliente sin comprobante electrónico). El 30%+ de compras sin factura (R-07) no pasa por `/compras` en absoluto: vive en `recepciones_sin_comprobante`, un flujo aparte, coherente con que `compras` ya no tiene una columna "factura nullable" del roadmap viejo — la tabla actual ES el comprobante `[código]` `[doc]`.

## 5 · Relevancia

| Criterio | Peso | Puntaje | Por qué (una línea) |
|---|---|---|---|
| Gestión (directo + indirecto) | ×2 | 9 | Decide a quién y cuánto se le paga, y alimenta el costo de cada prenda (margen en Vender) y el IGV/crédito fiscal, prioridad #1 de Felipe (D-46) |
| Dinero y stock que toca | ×1 | 10 | Es el registro de deuda con proveedores y la puerta de entrada de toda la mercadería que se recibe después |
| Frecuencia y personas que la usan | ×1 | 3 | Debería usarse a diario (R-10); en producción lleva 9 días en 0 y la persona que más pagaría no puede entrar |
| Qué se detiene si falla | ×1 | 9 | Sin esto, CAYLA vuelve a los 3 Excel distintos que el módulo 09 nació para reemplazar (`docs/datos/modulos/09-compras-y-proveedores.md:1-9`) |

Relevancia = (2·9 + 10 + 3 + 9) / 5 = **8,0** — Núcleo.

## 6 · Las 12 tareas, por importancia

### #1 · [Replantear] Quién puede registrar y pagar una compra
- **Dónde:** `apps/web/app/(app)/compras/layout.tsx:34` (redirect solo-líder) · `supabase/migrations/20260912231956_compras_desde_factura.sql:191-196` (`fn_puede_registrar_compras`) · `apps/web/lib/menu.ts:44-56` (`PERMISOS`, `permisosDe`) · `docs/datos/15-COMO-OPERA-CAYLA.md:100-108` (R-10)
- **Por qué en este puesto:** es la explicación más probable de por qué 76 proveedores y 0 facturas después de 9 días en producción; sin resolverlo, cualquier otra mejora de esta pantalla pule un mueble que nadie usa
- **Cómo lo verificas tú:** le preguntas a la persona que hoy paga a proveedores si puede entrar a `/compras` con su usuario — hoy la respuesta es no
- **Esfuerzo / dependencias:** L (toca D-12, más de un módulo) · ninguna otra tarea depende de esta, pero #2 y #3 se pueden hacer sin esperarla
- **DECIDÍ:** proponer un tercer valor de rol (o un permiso `registrarCompras` separado de `verDinero` — ya son conceptos distintos en `menu.ts:44-46`) para la persona de Compras, aprovechando que `permisosDe(rol)` ya está diseñado para crecer sin tocar el árbol de menú.
- **DESCARTÉ:** abrir `fn_puede_registrar_compras()` a todo integrante — reabriría exactamente el hueco de dinero que ADR-0126 cerró en tres puertas hace 3 días; y dejar el hueco como está — el módulo sigue sin usarse.
- **SE ROMPE SI:** Felipe decide que "líder" cubre roles de sede, no de función, y una persona de Compras necesita convertirse en líder de una sede que no lidera para poder pagar — eso filtra permisos de sede (traslados, ventas) que no debería tener.

### #2 · [Corregir] El redirect de `/compras` no dice por qué
- **Dónde:** `apps/web/app/(app)/compras/layout.tsx:34`
- **Por qué en este puesto:** hoy alguien sin acceso llega a "/" sin ningún mensaje — no sabe si el sistema falló o si no tiene permiso; corrección independiente de cómo se resuelva #1
- **Cómo lo verificas tú:** entras con una cuenta de integrante a `/compras` y ves un aviso claro en vez de un salto silencioso
- **Esfuerzo / dependencias:** S · ninguna

### #3 · [Corregir] El selector de sede de la cabecera no filtra esta pantalla, y no lo dice
- **Dónde:** `supabase/migrations/0006_colaboradores.sql:51-56` (`fn_puede_operar_ubicacion` devuelve `true` para cualquier sede si `fn_es_lider()`) · `apps/web/app/(app)/compras/page.tsx` (no pasa `ubicacionId` a `getResumenCompras`/`listarCompras` por defecto)
- **Por qué en este puesto:** un líder que cambia el selector de "Tienda TRU" a "Tienda AQP" esperando ver otra deuda no ve ningún cambio — las cifras y la lista ya son de la empresa entera, siempre. Es la misma pregunta de fondo que `docs/pantallas/colaboradores.md` #12 ("¿el líder manda en toda CAYLA o en su sede?"): no se duplica como Replantear, se referencia
- **Cómo lo verificas tú:** cambias de "Tienda TRU" a "Tienda AQP" en `/compras` con datos reales y confirmas que ninguna cifra cambia
- **Esfuerzo / dependencias:** S (aclarar con un rótulo, p.ej. "Todas las tiendas") · si `colaboradores.md` #12 se resuelve primero, esta tarea puede heredar esa decisión en vez de resolverse aparte

### #4 · [Corregir] El CSV para el contador no escapa fórmulas
- **Dónde:** `apps/web/lib/comprobantes-lista-reglas.ts:90-93` (`celdaCsv`) · usado por `apps/web/app/(app)/compras/exportar/route.ts`
- **Por qué en este puesto:** `celdaCsv` solo escapa comillas/comas/saltos de línea, no un valor que empiece con `=`, `+`, `-` o `@` (inyección de fórmulas CSV); hoy el nombre del proveedor y el documento los tipea el líder (`registrar_proveedor` es solo-líder, `supabase/migrations/20260918120000_proveedores_contacto_bancario.sql:122-125`), así que el riesgo es bajo hoy, pero el archivo lo abre "el contador" —una persona externa— y es defensa en profundidad barata
- **Cómo lo verificas tú:** registras un proveedor con nombre `=1+1` (o revisas el código), exportas el mes y confirmas que la celda sale como texto literal, no como fórmula, al abrir en Excel
- **Esfuerzo / dependencias:** S · ninguna

### #5 · [Corregir] El rojo no tiene presupuesto en esta pantalla
- **Dónde:** `apps/web/app/(app)/compras/page.tsx:259,289` (fecha y chip "vencida" por fila, sin tope) · comparar con `apps/web/components/ui/TarjetaCifra.tsx:18-19` (si ya conoce y respeta `MAX_ROJO_POR_PANTALLA`)
- **Por qué en este puesto:** con varias facturas vencidas a la vez, el rojo se multiplica por fila sin que nada lo limite — rompe la regla dura del propio sistema de diseño (`packages/shared/src/design-tokens.ts:73`), la misma que Colaboradores ya señaló (`colaboradores.md` #6, "foco en rojo que parece error")
- **Cómo lo verificas tú:** con 3+ comprobantes vencidos en pantalla, cuentas los elementos en rojo visibles a la vez — hoy pueden ser más de 6
- **Esfuerzo / dependencias:** M · coordinar con `claude/billing-design-analysis-ee464b` si toca `Chip.tsx`

### #6 · [Corregir] Objetivos táctiles bajo 44px en componentes compartidos
- **Dónde:** `apps/web/components/ui/SegmentoDeslizante.tsx:68` (`px-3.5 py-2.5`, texto 11px) · `apps/web/components/ui/Chip.tsx:52-53` (`py-0.5`)
- **Por qué en este puesto:** mismo defecto ya señalado en `colaboradores.md` #6 y en `vender-historial.md` — al arreglarse en el componente compartido, se corrige en Compras, Colaboradores y donde sea que se use, no pantalla por pantalla (causa raíz, principio 12)
- **Cómo lo verificas tú:** mides en devtools el alto real de "Contado"/"Crédito" en tablet — hoy ronda 31px, no 44px
- **Esfuerzo / dependencias:** S · no antes de coordinar con `billing-design-analysis-ee464b` (toca el mismo `Chip.tsx`)

### #7 · [Mejorar] "Cuánto compré sin respaldo este mes" no está en ningún lado de `/compras`
- **Dónde:** `apps/web/lib/compras-indicadores.ts:249-263` (`getResumenSinComprobante`, ya existe y no se usa en esta pantalla) · `docs/datos/15-COMO-OPERA-CAYLA.md:83-84` (R-08)
- **Por qué en este puesto:** R-08 dice textual que esta es la PRIMERA cifra que el módulo debería responder, y la función que la calcula ya existe pero vive desconectada de `/compras`
- **Cómo lo verificas tú:** hoy en `/compras` no hay ninguna cifra de "sin comprobante"; con la tarea hecha, hay un enlace o tarjeta que lleva a esa cifra
- **Esfuerzo / dependencias:** M · ninguna

### #8 · [Mejorar] IGV acumulado y alerta de umbral de 300 UIT (D-46, aún abierto)
- **Dónde:** tarjeta "IGV del mes" en `page.tsx:180-189` (ya existe la pieza mensual) · falta `credito_fiscal`/`igv_acumulado` (`docs/BACKLOG.md:262-273`)
- **Por qué en este puesto:** D-46 es la prioridad #1 que Felipe declaró para todo el módulo de Compras, y la mitad ("cuánto le debo") ya está resuelta — falta la otra mitad (IGV)
- **Cómo lo verificas tú:** hoy no hay ningún acumulado anual visible en ninguna pantalla de Compras; con la tarea, sí
- **Esfuerzo / dependencias:** M · requiere decidir con el contador de dónde sale el saldo a favor de IGV (A-04 en `15-COMO-OPERA-CAYLA.md:259`)

### #9 · [Mejorar] Auditar el detalle `/compras/factura/[compraId]`
- **Dónde:** ruta no leída en esta pasada — `@modal/(.)factura/[compraId]` y `factura/[compraId]/page.tsx`
- **Por qué en este puesto:** ahí viven anular, registrar pago desde el detalle y el reintento de adjuntos fallidos; sin auditarlo, esta pantalla queda con un hueco de cobertura declarado, no oculto
- **Cómo lo verificas tú:** corres `/pantalla /compras/factura/[id]` (o una pasada dedicada) y comparas contra este documento
- **Esfuerzo / dependencias:** M (es una pantalla aparte) · bajo valor si #1 se resuelve primero, porque cambia quién puede anular/pagar desde ahí

### #10 · [Eliminar/fusionar/conectar] La verificación de duplicado rompe el patrón "solo RPC"
- **Dónde:** `apps/web/components/CompraFormV2.tsx:305-313` (`comprobarRepetido` hace `createClient().from("compras").select("id")...` directo desde un componente `"use client"`)
- **Por qué en este puesto:** el propio comentario de `compras.ts:25-26` dice "los componentes cliente importan SOLO `compras-reglas.ts`" (puro); esta lectura directa de tabla es la única excepción, y aunque el RLS la protege igual (`compras_select` es de líder), es una grieta en la convención que el mismo archivo declara — más fácil de mantener como una función de lectura acotada
- **Cómo lo verificas tú:** ya no hay un `.from("compras")` dentro de un archivo `"use client"` de Compras
- **Esfuerzo / dependencias:** S · bajo valor / limpieza

### #11 · [Mejorar] Sin prueba de extremo a extremo del formulario en el navegador
- **Dónde:** `apps/web/lib/compras-reglas.test.ts` (cubre solo funciones puras) · no hay Playwright para `/compras/nueva`
- **Por qué en este puesto:** el flujo con más dinero en juego del repo depende hoy de pruebas unitarias de reglas y de pruebas SQL (`pruebas:dinero-compras`, `pruebas:compras-indicadores`), pero ningún test simula a una persona llenando el formulario real
- **Cómo lo verificas tú:** existe un test que abre `/compras/nueva`, llena una línea y confirma que el botón se habilita solo con el checklist completo
- **Esfuerzo / dependencias:** M · bajo valor / futuro

### #12 · [Corregir] Verificar en producción que ADR-0135 y ADR-0139 conviven en `registrar_compra` sin pisarse
- **Dónde:** función `registrar_compra` en producción — ver bloque SQL D3 de la sección 7
- **Por qué en este puesto:** ADR-0135 dice "pegado en producción por Felipe... pendiente de verificar y de refrescar el diccionario"; si el parche de reparto (ADR-0139) se aplicó después y sobrescribió el de endurecimiento (o viceversa), la función viva podría no tener ambos arreglos a la vez sin que nada lo avise en pantalla
- **Cómo lo verificas tú:** corres el bloque D3 de abajo contra producción y confirmas que el cuerpo de `registrar_compra` tiene `v_unidades` (A1), `fn_validar_fecha_pago_compra` (M2) y `compra_item_destinos` (reparto) a la vez
- **Esfuerzo / dependencias:** S (solo lectura) · bajo valor si ya se verificó en otra sesión — revisar `docs/BITACORA.md` primero

## 7 · SQL para producción (Paso 2, pendiente)

Copiado según `plantilla-sql.md`. Solo lectura. **Pega esto en el SQL Editor de producción (proyecto cayla-dynamic, schema `retail`) y pega aquí el resultado** — o dime "sin SQL" y sigo con lo que ya sale del repo, marcando lo que quede sin datos reales.

```sql
-- A1. Columnas de las tablas de Compras
select table_name, ordinal_position, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'retail' and table_name in ('compras','compra_items','compra_pagos','compra_adjuntos','compra_item_destinos','proveedores')
order by table_name, ordinal_position;

-- A2. Constraints (PK, FK, UNIQUE, CHECK)
select conrelid::regclass::text as tabla, contype, conname, pg_get_constraintdef(oid) as definicion
from pg_constraint
where conrelid in (
  select oid from pg_class
  where relnamespace = 'retail'::regnamespace and relname in ('compras','compra_items','compra_pagos','compra_adjuntos','compra_item_destinos')
)
order by 1, 2, 3;

-- B1. Filas y crecimiento reciente
select 'retail.compras' as tabla, count(*) as filas, count(*) filter (where created_at > now() - interval '30 days') as ultimos_30_dias from retail.compras
union all
select 'retail.compra_items', count(*), count(*) filter (where created_at > now() - interval '30 days') from retail.compra_items
union all
select 'retail.compra_pagos', count(*), count(*) filter (where created_at > now() - interval '30 days') from retail.compra_pagos
union all
select 'retail.proveedores', count(*), count(*) filter (where created_at > now() - interval '30 days') from retail.proveedores;

-- D1. Políticas RLS de las tablas de Compras
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'retail' and tablename in ('compras','compra_items','compra_pagos','compra_adjuntos','compra_item_destinos')
order by 1, 2;

-- D2. ¿RLS activado?
select relname, relrowsecurity, relforcerowsecurity
from pg_class
where relnamespace = 'retail'::regnamespace and relkind = 'r'
  and relname in ('compras','compra_items','compra_pagos','compra_adjuntos','compra_item_destinos');

-- D3. registrar_compra: firma, security definer, y que el cuerpo tenga A1 (ADR-0135), M2 (fecha de pago) y el reparto (ADR-0139) A LA VEZ
select p.proname,
       p.prosecdef as security_definer,
       p.proconfig,
       (pg_get_functiondef(p.oid) like '%v_unidades%') as tiene_adr0135_a1,
       (pg_get_functiondef(p.oid) like '%fn_validar_fecha_pago_compra%') as tiene_adr0135_m2,
       (pg_get_functiondef(p.oid) like '%compra_item_destinos%') as tiene_adr0139_reparto
from pg_proc p
where p.pronamespace = 'retail'::regnamespace and p.proname = 'registrar_compra';

-- E1. Tablas de Compras SIN RLS activado (debería salir vacío)
select relname from pg_class
where relnamespace = 'retail'::regnamespace and relkind = 'r'
  and relname in ('compras','compra_items','compra_pagos','compra_adjuntos','compra_item_destinos') and not relrowsecurity;

-- E2. Funciones de Compras security definer SIN search_path fijo (debería salir vacío)
select proname from pg_proc
where pronamespace = 'retail'::regnamespace and prosecdef
  and proname in ('registrar_compra','listar_compras','listar_compras_operativo','resumen_compras','resumen_compras_extra','recibir_compras')
  and (proconfig is null or not exists (select 1 from unnest(proconfig) c where c like 'search_path=%'));

-- E3. El candado de dinero (ADR-0126) sigue puesto en las 5 funciones (debería devolver {})
select retail.fn_aplicar_candado_de_dinero();

-- E4. Valores de estado fuera del vocabulario esperado (debería salir vacío)
select estado, count(*) from retail.compras group by 1
having estado not in ('vigente','anulada');
```

## 8 · Estrategia alternativa

No aplica: ADR-0035 (factura como eje) ya es la estrategia que los referentes de ERP (Odoo, NetSuite) usan para este mismo problema, y no hay una alternativa mejor identificada para 3 tiendas + 1 taller. La única decisión abierta es de rol (#1), no de arquitectura de datos.

## 9 · Referentes de ERP y futuro

Un reporte de antigüedad de deuda por tramos (1-30/31-60/61-90) — lo tiene Odoo/NetSuite de fábrica — es sobre-ingeniería para hoy: R-01 dice que el 97% se paga al contado, así que casi no hay deuda que envejecer; `estado_pago = 'parcial'` ya existe "porque es gratis" pero ninguna pantalla debería optimizarse para ese caso (`15-COMO-OPERA-CAYLA.md:35`). **[no verificado, de memoria]** sobre los productos citados.

## 10 · Fuera de esta pantalla

Lo de mayor consecuencia que nadie preguntó: **¿por qué nadie registró una sola factura en los primeros 9 días de este módulo en producción?** No es una pregunta de UI — puede ser el hueco de rol (#1), pero también puede ser que nadie le avisó a la persona de Compras que el sistema existe, o que sigue registrando en Excel por costumbre mientras el sistema well-built junta polvo. Antes de invertir más en pulir `/compras`, vale la pena que Felipe confirme con esa persona qué la está deteniendo hoy mismo — la respuesta puede no estar en ningún archivo de este repo.

## 11 · Líneas propuestas para BACKLOG.md

- [ ] `[pantalla:compras-comprobantes]` #1 Decidir quién puede registrar y pagar compras (rol nuevo o permiso separado de líder) — L
- [ ] `[pantalla:compras-comprobantes]` #2 El redirect de `/compras` explica por qué, no salta en silencio — S
- [ ] `[pantalla:compras-comprobantes]` #3 Aclarar que el selector de sede no filtra `/compras` (o conectarlo con colaboradores.md #12) — S
- [ ] `[pantalla:compras-comprobantes]` #4 Escapar fórmulas en el CSV de exportar (`celdaCsv`) — S
- [ ] `[pantalla:compras-comprobantes]` #5 Tope de rojo simultáneo en la tabla de comprobantes vencidos — M
- [ ] `[pantalla:compras-comprobantes]` #6 Objetivos táctiles ≥44px en `SegmentoDeslizante`/`Chip` (componente compartido) — S
- [ ] `[pantalla:compras-comprobantes]` #7 Enlazar "cuánto compré sin respaldo este mes" (R-08) desde `/compras` — M
- [ ] `[pantalla:compras-comprobantes]` #8 IGV acumulado y alerta de umbral 300 UIT (cierra D-46) — M
- [ ] `[pantalla:compras-comprobantes]` #9 Auditar `/compras/factura/[compraId]` con `/pantalla` — M
- [ ] `[pantalla:compras-comprobantes]` #10 Reemplazar el `.from("compras")` directo en `CompraFormV2.tsx` por una función de lectura — S
- [ ] `[pantalla:compras-comprobantes]` #11 Prueba end-to-end del formulario de registro en el navegador — M
- [ ] `[pantalla:compras-comprobantes]` #12 Verificar en producción que `registrar_compra` tiene ADR-0135 y ADR-0139 a la vez — S

## Inventario de elementos

| Zona | Elemento | Qué hace | Veredicto | Evidencia |
|---|---|---|---|---|
| Cabecera | "Exportar mes" | CSV del mes en curso para el contador | Ajustar (CSV injection) | `[código]` |
| Cabecera | "+ Registrar comprobante" | Va a `/compras/nueva` | Bien | `[código]` |
| Tarjetas KPI | Por pagar / Por recibir / Compras del mes / IGV del mes | 4 cifras, cada una con acción o comparación | Bien (falta "sin respaldo") | `[código]` |
| Pestañas | Todos/Por pagar/Por recibir/Vencidos/Pagados | Vistas por URL, con conteo | Bien | `[código]` |
| Buscador | "Número de documento o proveedor" | Atajo `/`, resalta coincidencias | Bien | `[código]` |
| Filtros | Proveedor, pago, recepción, destino, condición, tipo, fechas, vencidas | Todos resueltos en Postgres | Bien | `[código]` |
| Tabla | Fila de comprobante | Emisión, proveedor, documento, recepción, pago, total | Ajustar (rojo sin tope) | `[código]` |
| Estado vacío | "Todavía no hay comprobantes… Registrar el primero →" | Tres mensajes distintos según motivo | Bien | `[código]` |
| Form. nueva | Sección Documento | Proveedor, tipo, serie/número, fechas, condición, IGV%, destino | Bien | `[visto]` `[código]` |
| Form. nueva | Sección Líneas | Producto, talla/color, cantidad, costo, ayuda de costo conocido | Bien | `[visto]` `[código]` |
| Form. nueva | Sección Pago | Uno o varios medios, saldo a favor, datos de pago del proveedor | Bien | `[código]` |
| Form. nueva | Resumen (aside) | Subtotal/IGV/Total, "Dónde cae", adjuntos, nota, checklist, botón | Bien | `[visto]` `[código]` |

## Historial

| Fecha | Modo | Cumplimiento | Relevancia | Tareas cerradas de las 12 anteriores |
|---|---|---|---|---|
| 2026-09-22 | completo | 7,1 | 8,0 | Primer análisis — sin historial previo |
