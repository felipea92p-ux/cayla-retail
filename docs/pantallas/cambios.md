# Pantalla — Cambios (`/cambios`)

> Modo: completo · Fecha: 2026-09-21 · Rol/sede: líder · TIENDA TRU · Datos: **real** (consulta A–E pegada por Felipe desde producción el 2026-09-21; la base tiene 1 cambio, 18 ventas, 0 prendas en cuarentena — la muestra es mínima y lo digo cada vez que pesa)
> SHA analizado: `bb540298` (= origin/main, rama al día `0 0`) — si `cambios/page.tsx`, `CambiosPanel.tsx`, `CambiosFlujo.tsx`, `CambioReemplazo.tsx`, `CambioResumen.tsx`, `lib/cambios-reglas.ts`, `lib/cambios-estadisticas.ts`, `lib/ventas-v2.ts` o `registrar_cambio` cambian después, este análisis está vencido
> Archivos: `apps/web/app/(app)/cambios/page.tsx` · `CambiosPanel` → `BuscadorVentas` · `CambiosVentas` → `ComprasAgrupadas` · `CambiosFlujo` → `FlujoGuiado`/`CambioReemplazo`/`CambioResumen` · `lib/cambios-reglas.ts` · `lib/cambios-estadisticas.ts` · `lib/ventas-v2.ts` (`getVentasRecientes`) · RPC `registrar_cambio` (migración `20260919000100`) · tablas `cambios`, `prendas_danadas`, `venta_items`, `movimientos`, `cajas`
> Capturas analizadas (5): lista de Actividad reciente · paso 3 «Reemplazo» · paso 3 con Impacto y diferencia · paso 4 «Confirmación» · lista con filtro «Con cambio». **No se capturó la pantalla de éxito** (`[no verificable]`).
> Otra sesión tocándola: no. `SESIONES-ACTIVAS.md` nombra tres filas con Cambios, todas de hace días y ya fusionadas en `main`.

## 0 · Veredicto
La pantalla es de lo mejor construido del ERP en ergonomía (flujo en 4 pasos, validaciones que se ven, impacto en inventario y caja explícito). Pero un cambio con diferencia de precio **mueve plata sin comprobante, sin líder y, si no es efectivo, sin caja**, y el único cambio real que hay en producción es exactamente ese caso: **S/ 100 devueltos por Plin**.
**Cumple su finalidad:** 5.0/10 (promedio 5.8, con tope 5 por defectos que pueden dañar dinero y stock) · **Relevancia:** 5.8/10 — Comodidad (en el borde de Soporte)

## 1 · Finalidad declarada
"Esta pantalla existe para que quien está en caja cambie una prenda de una compra de los últimos 15 días por otra, moviendo bien el stock y la caja, sin pedir autorización de líder."
Fuente: `docs/datos/15-COMO-OPERA-CAYLA.md` R-37 (primero se cambia; nota de crédito o vale después; devolver plata es lo último), R-38 (15 días, lo aplica cualquiera en caja), R-39 (el estado de la prenda decide el destino); ADR-0125, ADR-0053, ADR-0064. No sale de la captura.
¿Docs y pantalla coinciden? **Casi.** Dos diferencias: (1) el botón «Sin comprobante →» parece iniciar un cambio sin venta, pero el ADR-0125 dice que es un atajo de filtro `[código CambiosPanel.tsx:125-133]`; (2) R-37 pone «devolver la plata» como última opción y la pantalla la ofrece como método por defecto de una diferencia negativa. Ninguna decisión escrita cubre el punto (2): D-43 habla de devoluciones, no de cambios con reembolso.

## 2 · Objeción
**Un cambio con diferencia es dinero que entra o sale del negocio y no deja ningún documento, ni pasa por ninguna aprobación.**
- La diferencia se guarda solo en `cambios.diferencia`. No genera boleta, nota de crédito ni línea de venta: `registrar_cambio` no emite nada `[código 20260919000100:155-211]`, y el ADR-0125 lo deja como «decisión de dinero pendiente» `[código ADR-0125:96-97]`.
- **Producción ya lo demuestra.** El único cambio (2026-09-18) cambió una prenda de S/ 179 por una de S/ 79: diferencia **−S/ 100, método `plin`**. La boleta de esa venta sigue diciendo S/ 179; el negocio devolvió S/ 100 sin nota de crédito. `[producción C1 + E5]` `[visto: captura 5]`
- **Si la diferencia no es efectivo, ni el arqueo ni ningún reporte la ven.** Solo `lib/caja.ts:117` y `app/actions/caja.ts:35` leen `cambios.diferencia`, y ambos filtran `efectivo`. `[código]` Tarjeta, Yape, Plin y transferencia quedan fuera de `venta_pagos`.
- **Sin líder.** La misma devolución de S/ 100 exige líder y emite nota de crédito (`aprobar_devolucion` contiene `fn_es_lider`); `registrar_cambio` no. Una prenda de S/ 179 cambiada por una de S/ 79 es, en plata, una devolución parcial sin aprobación. `[producción D4]`
- **La prenda nueva sale del piso sin venta.** Baja 1 unidad de stock con `motivo='cambio'` pero no existe línea de venta: sin ingreso, sin costo, sin margen para R-41 («cuánto gana de verdad por prenda»). `[código]` `[inferido]` sobre el reporte.

Trade-off: cerrar esto toca dinero real y SUNAT (CLAUDE.md: confirmar antes). Además el remedio natural —nota de crédito— **hoy no se puede emitir**: no hay serie de nota de crédito registrada en producción `[BACKLOG:338, 2026-09-21]`. Por eso la tarea #1 pide decisión a Felipe y no se ejecuta sola.

## 3 · Lo que está bien y no se toca
- **Una sola transacción**: `registrar_cambio` es una función plpgsql `security definer` con `search_path` fijo; escribe `cambios`, dos `movimientos`, y `prendas_danadas` si la prenda vuelve con defecto, todo o nada. `[producción D3]` `[código 20260919000100:89-211]`
- **Idempotencia**: `token_cliente` con índice único parcial + `unique_violation` capturado; el cliente reusa el token en reintentos y lo renueva solo tras un éxito. `[producción A3]` `[código CambiosFlujo.tsx:117,240]`
- **Candados en la tabla**: `cambios_defecto_no_vuelve_al_piso`, `cambios_diferencia_liquidada` (diferencia ≠ 0 exige método), listas cerradas de `motivo`, `condicion` y `metodo_pago_diferencia`, `prendas_danadas_un_origen` y `UNIQUE(cambio_id)`. `[producción A2]`
- **RLS activo y sin escritura directa**: `cambios` y `prendas_danadas` solo tienen política `SELECT`; nada entra sin RPC. E1 y E2 dieron vacío. `[producción D1, D2, E1, E2]`
- **Trigger `cambios_venta_no_anulada`** (`BEFORE INSERT`) impide cambiar una prenda de venta anulada. `[producción D5]`
- **El precio nuevo lo lee el servidor** de `variantes.precio`; el cliente no lo dicta. `[código :150]`
- **La caja abierta es obligatoria si hay efectivo** (ADR-0064) y `cerrar_caja` suma la diferencia con signo. `[código]`
- **Cero datos sucios hoy**: sin cambios sobre venta anulada, sin misma variante, sin fuera de plazo, sin efectivo sin caja, sin `no_vendible` sin cuarentena, sin línea con más cambiado+devuelto que comprado. `[producción E3, E3b]`
- **Sin objeción de rendimiento**: 1 cambio hoy; a 3 tiendas con 2 cambios/día cada una serían ~6.600 filas en 3 años. Las consultas por `venta_item_id` sin índice no duelen a ese tamaño (principio 5). `[producción B1, A3]` `[inferido]`
- **Estética**: cabecera con hilo y título serif iguales a Caja/Devoluciones/Facturación `[BACKLOG:330]`; rojo solo en «Confirmar cambio» (1 de máx. 2) `[visto]`; chips con palabra e ícono (no solo color) `[visto]`; el panel «Lo que revisa el sistema» refleja reglas reales `[código FlujoGuiado.tsx:181-222]`.

## 4 · Las seis dimensiones
| Dimensión | Puntaje | Hallazgo principal | Evidencia |
|---|---|---|---|
| Estética | 7.5 | Coherente con el sistema; falla en detalles: selector nativo de método, campo «¿Qué se lleva?» con otro estilo, colores sin nombre y de 40 px, textos de 11 px | `[visto]` capturas 2 y 3 · `[código CambioReemplazo.tsx:248]` |
| Lógica de negocio | 4.0 | Dinero sin comprobante ni líder; descuento ignorado; plazo solo en pantalla; sin vale | `[producción C1, D4]` `[código 20260919000100:144-155]` |
| Arquitectura | 5.5 | Atómica e idempotente, pero sin candado de concurrencia ni cruce con devoluciones | `[producción D4]` `[código :144-148]` |
| Funciones | 6.0 | Funciona de punta a punta; faltan vale/nota de crédito y el tope de 30 compras es silencioso | `[código ventas-v2.ts:75]` |
| Utilidad | 7.0 | Guiada y clara, pero el paso 3 junta 8 decisiones y el método de pago invita a Plin sin verificación | `[visto]` capturas 2 y 3 |
| Conexión con el ERP | 5.0 | Llega a movimientos, stock y caja (solo efectivo); no llega a ventas, comprobantes ni márgenes | `[código]` `[producción]` |

**Cumple su finalidad:** (7.5 + 4 + 5.5 + 6 + 7 + 5) / 6 = 5.83 → **tope 5** (hay defectos que pueden dañar dinero y stock: diferencia sin comprobante ni líder; cambio↔devolución sin candado).

### Estética — 7.5
- (a) **Coherencia con CAYLA.** Crema de fondo, tinta en botones, títulos serif, un solo rojo (Confirmar) `[visto]`. Mismo encabezado que sus hermanas `[BACKLOG:330]`. El paso 4 es sobrio y legible `[visto]`.
- (b) **Marca y tono.** «Iniciar un cambio», «¿Por cuál la cambia?», «¿Nada de su agrado? Pasar a devolución»: frases de mostrador, sin jerga `[visto]`. «Diferencia a cobrar» debería decir «a devolver» cuando es negativa; el código lo hace (`impactoCambio`, `CambioReemplazo.tsx:337`) `[código]`.
- (c) **Heurísticas.**
  - El método de pago es un `<select>` nativo, distinto del resto de controles `[visto: captura 3]`.
  - «¿Qué se lleva?» usa un campo de solo línea inferior, cuando los demás campos son cajas redondeadas `[visto: captura 2]`.
  - Los colores no muestran nombre hasta elegirlos y miden 40 px, bajo el mínimo táctil de 44 `[visto]` `[código CambioReemplazo.tsx:248]`.
  - Las tallas sin stock tienen borde punteado (parecen deshabilitadas) pero se pueden tocar para ver otras sedes `[visto]` `[código CambioReemplazo.tsx:124]`.
  - «no queda aquí», «compró L» y los SKU están en ~11 px y gris claro: probable choque con el piso de contraste del ADR-0012 `[inferido]` (no medí el contraste).
  - «Impacto» aparece dos veces: en el lateral del paso 3 y en el cuerpo del paso 4 `[visto]`.
  - En la lista, 18 botones negros «Iniciar cambio» del mismo peso; en la columna derecha queda un vacío bajo una compra de una sola prenda `[visto: captura 1]`.

### Lógica de negocio — 4.0
- **Diferencia sin comprobante ni líder** (ver §2). Viola el espíritu de R-37 (devolver plata es lo último) y crea una vía sin aprobación para lo que en Devoluciones exige líder. Ninguna D-nn cubre el punto. `[producción C1, D4]`
- **El descuento de la línea se ignora.** `diferencia = (precio_nuevo − precio_unitario) × cantidad`, sin `descuento_unitario`; la pantalla hace igual (`CambioReemplazo.tsx:116`) y el KPI «Valor cambiado» suma precio de lista (`cambios-estadisticas.ts:38`). Una prenda de S/ 179 vendida con S/ 30 de descuento y cambiada por otra de S/ 179 da diferencia 0 cuando la clienta ya pagó 149. Hoy hay 0 casos (E3i), pero el descuento existe (R-45). Es el mismo defecto que el BACKLOG ya anotó en la nota de crédito de devoluciones `[BACKLOG:572]`. `[código]` `[producción E3i]`
- **El plazo de 15 días solo vive en la pantalla**: el cuerpo de `registrar_cambio` no contiene `interval`, y la RPC se llama directo desde el navegador. Cualquiera con la consola cambia una venta antigua. `[producción D4]` `[código CambiosFlujo.tsx:217]` R-38 dice «lo aplica cualquiera en caja», pero también existe un «cambio extendido» pendiente (R-33, `BACKLOG:480`).
- **Falta el vale.** R-37 pone la nota de crédito o vale antes de devolver plata; en un cambio con diferencia negativa no hay esa opción, solo los 5 métodos de pago. `[código]`
- **Referente (de memoria, no verificado).** Shopify POS y Odoo POS modelan el cambio como devolución + venta nueva en una operación, con el neto como saldo. Pasa el filtro «¿sirve a 3 tiendas y 1 taller hoy?» porque resuelve el comprobante; va como estrategia alternativa (§8).
- **Motivo vs. reemplazo.** El motivo existe para que el Taller sepa qué talla falla (ADR-0125, punto 2). La pantalla deja marcar «Le quedó chica» y llevarse un pantalón cuando compró una blusa (visto en captura 3), lo que ensucia esa señal. `[inferido]`; el código no cruza motivo con reemplazo.

### Arquitectura — 5.5
- **Cadena.** `page.tsx` (servidor) → `CambiosPanel` (cliente) → `CambiosFlujo.tsx:217` → `createClient().rpc('registrar_cambio')` **desde el navegador**, sin server action `[código]`. Es coherente con el patrón del repo (RPC + RLS) y la RLS protege lectura y escritura; el precio y la sede se validan en la RPC. Sin objeción.
- **Estados imposibles.** Los impide el esquema: defecto→cuarentena, diferencia→método, un solo origen por prenda dañada. **No los impide el esquema:** (1) cantidad cambiada > comprada; (2) cambiada + devuelta > comprada; (3) misma variante (E3f dio 0 hoy); (4) motivo nulo (1 fila vieja, E3a). `[producción A2, E3]`
- **Concurrencia.** El chequeo «ya cambiado» es un `select sum` **sin `for update`** y no mira `devolucion_items`; `crear_devolucion` no mira `cambios` ni tiene `for update`. `[producción D4]` Escenario real, sin necesidad de milisegundos: la colaboradora A abre Cambios y deja la pantalla; B aprueba una devolución de la misma línea; A confirma el cambio 10 minutos después desde la lista vieja. El servidor lo acepta y el stock queda +2 con una sola unidad vendida. `unidadesDisponibles` solo descuenta lo que la pantalla cargó `[código cambios-reglas.ts:106-111]`. Hoy 0 casos (E3b).
- **Caída externa.** Un cambio no llama a SUNAT/Nubefact/Culqi: se degrada bien porque no depende de nadie; el precio de esa independencia es el hueco fiscal de §2. Sin red, `registrar_cambio` falla entera y muestra el error; no hay cola offline (ADR-0063 cubre venta, no cambio) `[inferido]`.
- **Volumen.** 1 cambio en 3 días de uso; ~5.6% de las ventas (1/18, muestra minúscula). Ver «Sin objeción de rendimiento» en §3.
- **RLS y datos personales.** Sin problemas: la lista muestra nombre y DNI de la clienta solo porque `comprobantes_select` lo permite a líder o a la propia sede `[producción D1]`.

### Funciones — 6.0
- **Existen y funcionan:** buscador único (boleta, DNI, nombre, prenda, código), atajo «/», actividad de 15 días con chips de plazo, flujo de 4 pasos, condición de la prenda con destino a cuarentena, impacto en inventario y caja, cantidad cuando se compró más de 1. `[código]` `[visto]`
- **Medio fantasma:** «Escanear prenda» solo enfoca el campo (sirve a la pistola, no abre cámara) `[código BuscadorVentas.tsx:75-79]`; «Sin comprobante →» solo activa el filtro y baja `[código CambiosPanel.tsx:125-133]`, y con «Sin comprobante 0» al lado es doble.
- **Sobra:** `BuscarPorComprobante.tsx` es código muerto (nadie lo importa) `[código]`.
- **Faltan:** vale/saldo a favor para diferencia negativa; comprobante o ticket del cambio para la clienta (el «N.º de operación» del éxito son los 8 primeros caracteres de un UUID `[código CambiosFlujo.tsx:233]`, no un número que se dicte); aviso de que la lista corta en 30 compras.
- **Tope silencioso.** «Actividad reciente» dice «últimos 15 días» pero trae solo las 30 compras más nuevas `[código ventas-v2.ts:75, CambiosPanel.tsx:212]`. TRU tiene hoy 18 ventas en 15 días `[producción B2]`; a más de 2 ventas por día, las más viejas desaparecen sin aviso.
- **«Sin comprobante 0» engaña.** Cuenta como «con comprobante» a las boletas `pendiente`; 17 de las 19 boletas están pendientes de SUNAT `[BACKLOG:336]` `[producción B2]`.

### Utilidad — 7.0
Escenario: una clienta vuelve a los 8 días con una casaca comprada por S/ 179 y quiere una blusa de S/ 79 (es lo que pasó el 18 de setiembre).
1. La colaboradora nueva teclea la boleta o toca «Iniciar cambio» en la lista: **no duda** (captura 1). `[visto]`
2. Paso 3: elige motivo, cambia el producto en «¿Qué se lleva?» (el campo por defecto es el mismo producto; hay que tocar y escribir), talla, color y condición. **Dudas:** los colores no traen nombre; la talla punteada parece deshabilitada; son 8 decisiones en una pantalla larga. `[visto: capturas 2 y 3]`
3. Aparece «Diferencia a devolver S/ 100» y el método arranca en Efectivo. La clienta pide Plin. **Se equivoca el sistema, no la colaboradora:** acepta Plin sin comprobante de que salió, sin líder y sin que la caja se entere; nada le dice «esto es una devolución de dinero». `[código]` `[producción C1]`
4. Paso 4: la revisión es clara (venta, motivo, impacto). Confirma con el botón rojo. `[visto: captura 4]`
5. La clienta no se lleva nada que diga qué cambió ni hasta cuándo puede volver a cambiar (`[no verificable]`: falta la captura del éxito).

### Conexión con el ERP — 5.0
Ver §6.

## 5 · Relevancia
| Criterio | Peso | Puntaje | Por qué (una línea) |
|---|---|---|---|
| Gestión (directo + indirecto) | ×2 | 6 | Directo: KPIs de cambios y «Tallas que no calzan» para el líder; indirecto: el motivo alimenta al Taller, pero solo si la señal es limpia. |
| Dinero y stock que toca | ×1 | 7 | Mueve stock ±1 y plata en la diferencia; sumas chicas por operación. |
| Frecuencia y personas que la usan | ×1 | 5 | 1 cambio en 3 días de uso `[producción B1]`; toda colaboradora en caja la puede usar. |
| Qué se detiene si falla | ×1 | 5 | Sin Cambios, la clienta cae en devolución + venta nueva (más lento, pero se puede). |

Relevancia = (2·6 + 7 + 5 + 5) / 5 = **5.8 → Comodidad** (a 0.2 de Soporte; R-37 dice que cambiar es la primera opción, así que el peso real es mayor que el de la fórmula).

## 6 · Conexión con el ERP
- **Aguas arriba:** `ventas`/`venta_items` (la compra y su precio), `variantes` (precio nuevo), `stock` por sede (`fn_stock_por_sede`; hay que verificar que `pisoDisponible` nulo no difiera del piso real `[código page.tsx:44]`), `cajas` (caja abierta), `comprobantes` (solo para mostrar chips).
- **Aguas abajo:** `movimientos` (`motivo='cambio'`, 2 filas hoy `[producción B1]`), `stock` (vía `fn_aplicar_movimiento`), `prendas_danadas` → cuarentena de `/devoluciones`, `cerrar_caja` (solo efectivo), «Tallas que no calzan» para el líder. **No llega a:** `venta_items`, `venta_pagos`, `comprobantes`, márgenes por prenda. `[código]`
- **Pájaro dueño y vecinos:** Colibrí (07 · Ventas y caja) `[AVIARIO.md:19,37]`; vecinos: Devoluciones (misma cuarentena y misma línea de venta), Caja, Facturación, Movimientos.
- **Externos, y qué pasa si caen:** ninguno hoy. Se degrada así: si no hay red, no se registra nada (no se pierde ningún dato porque no hay escritura parcial). Si el cambio empieza a emitir comprobante, dependerá de Lucode/SUNAT y habrá que decidir cómo cae (ver §8).

## 7 · Las 12 tareas, por importancia

### #1 · Replantear — Decidir cómo se documenta la diferencia de un cambio
- **Dónde:** `registrar_cambio` (`supabase/migrations/20260919000100_cambios_motivo_y_estado_de_prenda.sql:155-211`) · `cambios.diferencia`/`metodo_pago_diferencia` · sección §8 de este archivo.
- **Por qué en este puesto:** es la raíz de la objeción: plata sin comprobante, sin línea de venta y sin cifra en reportes. Ya ocurrió (S/ 100 por Plin `[producción C1]`). Decide qué se construye en #2, #5 y #7, y toca dinero y SUNAT (CLAUDE.md: confirmar). Sin decisión, el hueco crece con cada cambio.
- **Cómo lo verificas tú:** recorres §8 y eliges A, B o C. Después de ejecutar, un cambio con diferencia en Plin deja un documento visible en Facturación y una línea de venta en `/vender/historial`.
- **Esfuerzo / dependencias:** L (opción B) · el remedio necesita la serie de nota de crédito registrada `[BACKLOG:338]`; no antes de eso.
- **DECIDÍ (recomendación, tuya la última palabra):** que un cambio sea «devolución parcial + venta nueva» en una sola transacción cuando la diferencia ≠ 0, con nota de crédito (si sube plata) o boleta por la diferencia (si baja), y que un cambio a igual precio siga como hoy, sin documento nuevo.
- **DESCARTÉ:** dejarlo como está y documentarlo en el BACKLOG (costo: un hueco que ya tiene S/ 100 reales y sin tope), y emitir una sola boleta por la diferencia sin tocar la venta original (costo: la boleta original sigue mintiendo por el valor de la prenda devuelta).
- **SE ROMPE SI:** una clienta cambia una casaca de S/ 179 por una blusa de S/ 79 y se le devuelven S/ 100 por Plin: la boleta B004 sigue en S/ 179, el negocio declara S/ 100 de ingresos que no existen y nadie lo ve en el arqueo. `[no verificable]`: cuál es el tratamiento tributario exacto de un cambio sin diferencia; **confirmar con el contador antes de diseñar**.

### #2 · Corregir — Reembolso por cambio exige líder
- **Dónde:** `registrar_cambio` (agregar `fn_es_lider()` cuando `v_diferencia < 0`, mismo patrón de `aprobar_devolucion`) · `CambioResumen.tsx` (avisar «lo aprueba una líder») · prueba nueva en `scripts/pruebas/registrar_cambio.mjs`.
- **Por qué en este puesto:** es el cierre barato del peor agujero: hoy S/ 100 salen por Plin con la firma de cualquier colaboradora, mientras la misma plata por Devoluciones pide líder. Es cambio de esquema en producción: necesita tu ok.
- **Cómo lo verificas tú:** entra como integrante, arma un cambio de S/ 179 → S/ 79 y confirma: debe rechazar con un mensaje claro. Como líder pasa.
- **Esfuerzo / dependencias:** S · independiente de #1 si solo se pide líder; #1 puede reemplazarla luego.

### #3 · Corregir — Candado cambio↔devolución y bloqueo de la línea
- **Dónde:** `registrar_cambio` (`select … from venta_items where id = p_venta_item_id for update`; sumar `cambios` **y** `devolucion_items`) · `crear_devolucion` (mismo bloqueo, sumar `cambios`) · `scripts/pruebas/registrar_cambio.mjs` (caso cruzado).
- **Por qué en este puesto:** es el único riesgo de stock duplicado (principio 2). Hoy 0 casos `[producción E3b]`, pero el escenario de la pantalla abierta e inactiva es realista en el mostrador.
- **Cómo lo verificas tú:** con dos pestañas: en A abre Cambios sobre una línea; en B devuelve esa línea; en A confirma el cambio. Debe rechazar con «ya se devolvió».
- **Esfuerzo / dependencias:** M · migración con las dos funciones; `aprobar_devolucion` ya tiene `for update` `[producción D4]`; parte del cuerpo de `pg_proc` de producción, no del archivo viejo (aviso de SESIONES-ACTIVAS).

### #4 · Corregir — Plazo de 15 días en el servidor, con excepción de líder
- **Dónde:** `registrar_cambio` (comparar `ventas.created_at` con hoy en zona Lima) · `lib/cambios-reglas.ts:341-356` (una sola constante, no dos).
- **Por qué en este puesto:** la regla del negocio existe solo en el navegador y la RPC es llamable desde la consola `[producción D4]`. Riesgo bajo por uso, alto por reglas: R-38 es un dato duro.
- **Cómo lo verificas tú:** llama el RPC desde la consola con una línea de hace 20 días: debe rechazar; con líder y excepción marcada, pasa (si decides la excepción).
- **Esfuerzo / dependencias:** M · decidir antes la excepción («cambio extendido», R-33, `BACKLOG:480`).

### #5 · Corregir — El descuento de la línea entra al cálculo (raíz compartida con Devoluciones)
- **Dónde:** `registrar_cambio` `:155` · `CambioReemplazo.tsx:116` · `cambios-estadisticas.ts:38` · y la nota de crédito de devoluciones `[BACKLOG:572]`.
- **Por qué en este puesto:** el mismo defecto está en 3 sitios (cambio, KPI, nota de crédito): es **una** tarea raíz. Hoy 0 casos `[producción E3i]`, pero cada descuento (R-45) lo activa y la clienta paga o recibe mal.
- **Cómo lo verificas tú:** vende una prenda con descuento y cámbiala por una del mismo precio de lista: la diferencia debe ser lo que se descontó.
- **Esfuerzo / dependencias:** M · va junto con el arreglo de la nota de crédito; decide antes contra qué se compara (lo pagado).

### #6 · Corregir — La lista de 30 compras dice «15 días»
- **Dónde:** `lib/ventas-v2.ts:75` (`LIMITE_ACTIVIDAD`) · `CambiosPanel.tsx:212` (el texto).
- **Por qué en este puesto:** en el mostrador la colaboradora asume que lo que no aparece no se puede cambiar. TRU hoy: 18 ventas en 15 días `[producción B2]`; a más de 2 por día pierde compras cambiables.
- **Cómo lo verificas tú:** siembra 35 ventas en TRU: deben verse todas, o el texto debe decir «las 30 más recientes» y ofrecer «Ver más».
- **Esfuerzo / dependencias:** S.

### #7 · Mejorar — «Vale / saldo a favor» y método sin Efectivo por defecto para diferencia negativa
- **Dónde:** `CambioReemplazo.tsx` (control del método) · `cambios.metodo_pago_diferencia` (lista cerrada; agregar `vale` exige migración) · texto «Diferencia a devolver».
- **Por qué en este puesto:** R-37 pone el vale antes de devolver plata; hoy no existe la opción. Depende de qué decidas en #1.
- **Cómo lo verificas tú:** en una diferencia negativa aparece «Vale por S/ X» y ningún método toma valor por defecto.
- **Esfuerzo / dependencias:** M · no antes de la #1.

### #8 · Corregir — Misma variante bloqueada y aviso cuando motivo y reemplazo se contradicen
- **Dónde:** `cambios-reglas.ts` (`derivarReemplazo`, `validarCambio`) · `registrar_cambio` (rechazar `p_variante_nueva_id = venta_items.variante_id`).
- **Por qué en este puesto:** cambiar una prenda por sí misma mueve stock ±0 y no cambia nada. Hoy 0 casos `[producción E3f]`. El aviso de motivo protege la señal para el Taller: no se bloquea, porque «otro pantalón en talla mayor» sí es válido.
- **Cómo lo verificas tú:** elige la misma talla y color: el botón se bloquea con «es la misma prenda».
- **Esfuerzo / dependencias:** S.

### #9 · Mejorar — Que «Valor cambiado» diga qué valor es
- **Dónde:** `cambios-estadisticas.ts:22-38` · `page.tsx:53-60`.
- **Por qué en este puesto:** el KPI muestra S/ 179 (valor de lista de la prenda devuelta), cuando la plata real que se movió fue −S/ 100 `[producción C1]`. Un líder lo lee como «cuánto se cambió» y no como «cuánto se devolvió». Además no sigue «Todas las tiendas».
- **Cómo lo verificas tú:** tras el cambio de −S/ 100, la tarjeta muestra el neto y el bruto con rótulos distintos.
- **Esfuerzo / dependencias:** S · mejor después de #5.

### #10 · Corregir — Detalles de estética y accesibilidad del paso 3
- **Dónde:** `CambioReemplazo.tsx:124,248` (colores 40→44 px con nombre visible; talla sin stock que parece desactivada) · el `<select>` del método → selector del sistema · «¿Qué se lleva?» con el estilo de los otros campos · textos de 11 px al piso del ADR-0012.
- **Por qué en este puesto:** no daña dinero, pero es donde la colaboradora nueva duda (Utilidad). Un color sin nombre solo se entiende si se toca.
- **Cómo lo verificas tú:** en la tablet, ves el nombre de cada color sin tocar, y ningún control mide menos de 44 px.
- **Esfuerzo / dependencias:** S.

### #11 · Eliminar/fusionar — `BuscarPorComprobante.tsx` y el botón «Sin comprobante →» *(bajo valor)*
- **Dónde:** `apps/web/components/BuscarPorComprobante.tsx` (muerto) · `BuscadorVentas.tsx:144` · `CambiosPanel.tsx:125-133` · comentario obsoleto `0007_cambios.sql:11-15`.
- **Por qué en este puesto:** limpieza. El botón repite el chip «Sin comprobante» de la lista y sugiere un flujo que no existe. Bajo valor: no cambia dinero ni stock.
- **Cómo lo verificas tú:** `rg BuscarPorComprobante` da 0 usos; el botón no aparece.
- **Esfuerzo / dependencias:** S.

### #12 · Mejorar — `cambios.motivo` obligatorio para filas nuevas *(bajo valor / opcional)*
- **Dónde:** migración nueva con `check (motivo is not null) not valid` (el repo ya usa `NOT VALID` en `venta_items`).
- **Por qué en este puesto:** la pantalla ya lo exige y hay 1 sola fila vieja con motivo nulo `[producción E3a]`. Sirve para que ningún camino directo lo salte. Sin `NOT VALID` habría que rellenar la fila vieja, y no se toca historial (CLAUDE.md).
- **Cómo lo verificas tú:** una llamada directa al RPC sin motivo falla; la fila del 2026-09-18 sigue intacta.
- **Esfuerzo / dependencias:** S · después de #3 (misma migración).

## 8 · Estrategia alternativa
**Hoy:** un cambio es una operación propia (`cambios`) que mueve stock y anota una diferencia.
**Alternativa:** un cambio es **devolución parcial + venta nueva en una sola transacción**, con el neto como diferencia.

| | Ganas | Pagas |
|---|---|---|
| **A · Como hoy** | Cero trabajo; el flujo ya está probado (18 pruebas de RPC). | Dinero sin documento (S/ 100 ya en producción), sin líder, ni margen ni ventas ven la prenda nueva. |
| **B · Devolución + venta nueva (recomendada)** | Comprobante correcto (NC o boleta), la venta nueva aparece con costo y margen, un solo camino contable, el líder ya aprueba devoluciones. | Reescribir `registrar_cambio`, depender de Lucode/SUNAT (si cae, hay que dejar el cambio como «por documentar»), y tener serie de nota de crédito; para cambios de igual precio quizá no hace falta documento nuevo `[no verificable]`. |
| **C · Puente** | Solo #2 y #7: líder para reembolsos y vale en lugar de Plin; cierra la fuga sin tocar SUNAT. | El documento sigue faltando; la boleta original sigue diciendo el total viejo. |

Decide Felipe (con el contador). Mi orden: C ya, B cuando esté la serie de nota de crédito.

## 9 · Referentes de ERP y futuro
Todo lo que sigue viene de memoria y **no está verificado**.
- **Shopify POS / Odoo POS:** el cambio es un reembolso y una orden nueva ligadas, con el saldo como crédito de tienda o tarjeta regalo. Es la base de la opción B.
- **Vale digital ligado a la clienta:** necesita la base de clientas (R-33); la captura 4 muestra «No quedó registrada en la venta». Futuro.
- **Buscar por teléfono:** el dato no existe (ADR-0125). Futuro.
- **Cámara para «Escanear prenda»:** hoy sirve a la pistola de mostrador; la cámara solo aporta en celular. Futuro.
- **Cambio en otra tienda, para integrantes:** hoy solo un líder puede buscar boletas de otra sede (RLS). Con 3 tiendas y clientas que viajan puede importar, pero no hay caso registrado.

## 10 · Fuera de esta pantalla
**La solución de #1 depende de Facturación, y Facturación hoy casi no transmite: 17 de las 19 boletas están «pendiente» y no hay serie de nota de crédito** `[BACKLOG:336,338 (2026-09-21)]`. Cualquier cambio o devolución sobre una boleta pendiente o sin serie de nota de crédito no tiene remedio fiscal, y el chip «Sin comprobante 0» de esta pantalla cuenta las pendientes como «con comprobante». Antes de diseñar el cambio de #1, la cola de SUNAT debe dejar de ser la restricción.

## 11 · Líneas propuestas para BACKLOG.md
- [ ] `[pantalla:cambios]` #1 Decidir cómo se documenta la diferencia de un cambio (A/B/C de §8) — L
- [ ] `[pantalla:cambios]` #2 Reembolso por cambio (diferencia negativa) exige líder — S
- [ ] `[pantalla:cambios]` #3 Candado cambio↔devolución y `for update` en la línea — M
- [ ] `[pantalla:cambios]` #4 Plazo de 15 días en el servidor, con excepción de líder — M
- [ ] `[pantalla:cambios]` #5 El descuento de la línea entra al cálculo del cambio, KPI y nota de crédito — M
- [ ] `[pantalla:cambios]` #6 «Actividad reciente» trae solo 30 compras aunque dice 15 días — S
- [ ] `[pantalla:cambios]` #7 Opción «Vale / saldo a favor» y método sin Efectivo por defecto en diferencia negativa — M
- [ ] `[pantalla:cambios]` #8 Bloquear cambio a la misma variante y avisar motivo vs. reemplazo — S
- [ ] `[pantalla:cambios]` #9 KPI «Valor cambiado»: bruto y neto con rótulos claros — S
- [ ] `[pantalla:cambios]` #10 Paso 3: colores con nombre y 44 px, selector del sistema, textos al piso de contraste — S
- [ ] `[pantalla:cambios]` #11 Borrar `BuscarPorComprobante.tsx` y fusionar «Sin comprobante →» con el chip — S *(bajo valor)*
- [ ] `[pantalla:cambios]` #12 `cambios.motivo` obligatorio para filas nuevas (`NOT VALID`) — S *(bajo valor)*

## Inventario de elementos
| Zona | Elemento | Qué hace | Veredicto | Evidencia |
|---|---|---|---|---|
| Cabecera | Tarjetas «Cambios hoy · Este mes · Valor cambiado» | Cuenta cambios de la sede y suma valor de lista de lo devuelto | ajustar (#9) | `[código cambios-estadisticas.ts:22-38]` |
| Iniciar un cambio | Buscador único + «/» | Boleta, DNI, clienta, prenda o código | bien | `[código BuscadorVentas.tsx:10-23]` |
| Iniciar un cambio | «Escanear prenda» | Solo enfoca el campo | bien (rótulo engañoso para cámara) | `[código :75-79]` |
| Iniciar un cambio | «Sin comprobante →» | Activa filtro y baja | sobra (#11) | `[código CambiosPanel.tsx:125-133]` |
| Iniciar un cambio | «Buscar en TIENDA TRU» | Solo líder; busca en otra sede | bien | `[código :150-169]` |
| Actividad reciente | Chips Todas / Con cambio / Sin comprobante | Filtran por compra entera | ajustar (#6, cuenta pendientes como comprobante) | `[código CambiosPanel.tsx:19-39]` |
| Actividad reciente | Lista por día, dos columnas | Agrupa por día y compra | ajustar (vacío bajo compras de 1 prenda; 18 botones iguales) | `[visto: captura 1]` |
| Actividad reciente | Tope de 30 compras | Corta sin avisar | falta aviso (#6) | `[código ventas-v2.ts:75]` |
| Flujo | Barra de 4 pasos | Navega y muestra avance | bien | `[visto: captura 2]` |
| Paso 3 | Motivo (5 chips) | Lista cerrada | bien | `[código cambios-reglas.ts:23-29]` |
| Paso 3 | «¿Qué se lleva?» | Combo de productos con stock | ajustar (estilo, #10) | `[visto: captura 2]` |
| Paso 3 | Talla y color | Elige la variante nueva | ajustar (#10) | `[código CambioReemplazo.tsx:124,248]` |
| Paso 3 | Impecable / Con defecto o uso | Decide piso o cuarentena | bien | `[código :267-295]` |
| Paso 3 | Diferencia + método | Calcula y pide método | corregir (#1, #2, #5, #7) | `[código :116, :337]` |
| Lateral | «Lo que revisa el sistema» | Checklist en cliente | bien | `[código FlujoGuiado.tsx:181-222]` |
| Lateral / paso 4 | «Impacto» | Inventario y caja | bien (aparece dos veces) | `[visto: capturas 3 y 4]` |
| Paso 4 | Confirmar cambio (rojo) | Llama a `registrar_cambio` | bien | `[código CambiosFlujo.tsx:217]` |
| Éxito | Pantalla final | Muestra «Operación» | falta (comprobante de la clienta) | `[no verificable]` |

## Historial
| Fecha | Modo | Cumplimiento | Relevancia | Tareas cerradas de las 12 anteriores |
|---|---|---|---|---|
| 2026-09-21 | completo | 5.0 | 5.8 | — (primer análisis) |
