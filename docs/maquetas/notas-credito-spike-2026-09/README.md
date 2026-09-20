# Spike visual · Notas de crédito de compra (2026-09-19)

> **Estado: propuesta, sin implementar.** Nada de esto está en `apps/`, `supabase/` ni en producción. Este HTML es la referencia
> visual para que Felipe decida; lo que requiere migración está marcado abajo y se puede ver encendido dentro del propio HTML.

`notas-credito-vivo.html` — autocontenido (CSS y JS inline), ábrelo con doble clic. Datos inventados; «hoy» fijo en 18/09 para que cuadre
con el spike de Por pagar (mismos proveedores, mismo F001-000482). Único acceso a red: las dos fuentes de Google Fonts, igual que el spike
de Por pagar; sin red cae a las fuentes del sistema y todo funciona.

**Pedido de Felipe:** «Aplicar un módulo más para las notas de crédito, para no mezclarlas en Recepción de mercadería».
**Ruta propuesta:** `/compras/notas-credito` (hermana de `/compras/por-pagar`), solo líder (ADR-0126).

## Cómo mirarlo

Botones de la franja punteada de arriba: «Repetir la entrada», «Movimiento reducido», «Restablecer datos», **«Mostrar lo que requiere
migración»** (dibuja un borde ámbar y la etiqueta sobre cada pieza que la base de hoy no soporta), **«Ver Recepción (así queda)»** (la
comparación antes/después) y «Simular: nada por reclamar» (el estado vacío).

**Recorrido sugerido:** toca la fila de *Confecciones Sur Andino* (la única con el punto que late) → «Registrar nota» → escribe un monto de
más y mira el error con su salida («Usar S/ 330.40») → registra y mira cómo se reordena la pantalla → *Saldos a favor* → «De qué viene» →
«Pedir reembolso» → «Usar en un pago» → *Ver Recepción*.
Atajos: `/` buscar · `j` `k` (o ↑ ↓) moverse · `Enter` vista rápida · `N` nueva nota · `Esc` cierra lo de encima.

## Qué muestra

| # | Pantalla | Qué hace |
|---|---|---|
| 1 | **Tablero** | 4 cifras que cuentan (Por reclamar · Emitidas este mes · Saldo a favor total · Aplicado este mes); la barra de «Por reclamar» *es* el dato (3 tramos de antigüedad) y al tocarla filtra la lista; pestañas con pulgar deslizante (Por reclamar · Emitidas · Aplicadas · Todas); búsqueda con `/`; agrupar por urgencia o por proveedor (las filas se deslizan con FLIP); chip «Hace 19 días» con el punto que late **solo** en el reclamo más viejo (tope de rojo por pantalla). |
| 1b | **Vista rápida** (cajón) | Línea de vida de 4 puntos, «siguiente paso» sugerido según el caso (cierra las unidades que faltan / reclámala / ya van 19 días: llama), ↑ ↓ para recorrer la lista. |
| 2 | **Detalle** (modal ADR-0136) | Cabecera con estado, línea de tiempo vertical (faltante → reclamada → nota recibida → aplicada), prendas que la originan con costo + IGV, comprobante de origen con enlace, «qué pasará / qué pasó con el dinero» con barras, adjunto, mensaje listo para copiar al proveedor (con «Copiado» que se dibuja), historial que no se edita. |
| 3 | **Registrar nota** (modal) | La **factura de origen se elige con un buscador real** (ver 3b). Viene precargada desde una «nota pendiente» o se busca a mano. Motivo, serie-número, fecha, monto, adjunto. **Destino del dinero (ajuste del 19/09):** ver 3a. Vista previa del efecto en vivo con deuda, saldo a favor (del proveedor y total), «Aplicado este mes» y crédito fiscal (IGV), antes → después. Errores: serie faltante o repetida, fecha anterior al comprobante, monto que no cuadra (con botón «Usar S/ …»), «faltante» bloqueado con su porqué. Al registrar: «visto» que se dibuja y la pantalla reacciona. |
| 3a | **Destino del dinero** (sección del modal) | En palabras simples: *«Lo primero que hace una nota es bajar lo que aún le debes al proveedor por esa factura. El dinero que sobra —o todo el monto, si la factura ya estaba pagada— es el que se devuelve o queda a favor.»* Muestra siempre las tres partes: **Baja la deuda · Se devuelve ahora · Queda a favor** (con barra de tres tramos) y dos fichas tipo radio (flechas ← → ↑ ↓, Inicio, Fin): **«Nos lo devuelve ahora»** (pide medio —transferencia, efectivo, Yape, Plin, otro—, fecha y N.° de operación opcional, y dice en qué cuenta de CAYLA entra) y **«Queda a favor para otra compra»** (recuerda: se sugiere al pagar, nunca se descuenta solo). Si no sobra nada las fichas se ven pero **deshabilitadas** y dice «Esta nota solo baja la deuda: no hay dinero que devolver». Tres casos de ejemplo: **pendiente** (F001-000482: la nota, S/ 847.24, es menor que la deuda de S/ 3,923.60), **pagada** (F004-000129: todo sobra, S/ 188.80) y **mixto** (F001-000401: debe S/ 1,128.00 y la nota es de S/ 1,180.00 → baja S/ 1,128.00 y sobran S/ 52.00). El estado se refleja en tablero, vista rápida y detalle («Devuelta · Devuelto el 11/09 · transferencia», «A favor S/ 236.00»), la línea de tiempo suma el paso «Dinero devuelto» y los KPIs «Saldo a favor total» y «Aplicado este mes» cambian según la elección (el modal ya adelanta el antes → después). Si devuelven ahora, el «visto» dice «Nota … y reembolso registrados». |
| 3b | **Buscador de facturas** (dentro de Registrar nota y en «Cambiar») | Escribe serie-número, proveedor o monto (con o sin guiones y comas: `2360` encuentra «S/ 2,360.00»); filtra mientras escribes y **resalta la coincidencia**. Cada resultado muestra proveedor, documento, fecha, total, saldo y chips (**Pagada · Pendiente · Vencida · Con nota**). Filtros rápidos: Todas · Con saldo · Pagadas · Del proveedor elegido. Teclado: ↑ ↓ mueven, `Enter` elige, `Esc` primero borra la búsqueda y luego cancela el cambio. Estado vacío «No hay facturas que coincidan». Al elegir, la ficha compacta muestra líneas, total, pagado, debe, pagos, notas ya emitidas y la nota pendiente por faltante, y alimenta la vista previa. Con `N` (o «Registrar nota») el foco cae directo en el buscador. 14 facturas de ejemplo coherentes con las notas. El buscador principal del tablero también encuentra por factura de origen y resalta (`f001-0004` → 4 filas). |
| 4 | **Saldos a favor** | Total por proveedor, de qué notas viene (libro con saldo corrido), «Usar en un pago» (modal que muestra qué verías en Por pagar; el saldo viene **apagado**: se sugiere, lo decide quien paga) y «Pedir reembolso» (monto, medio, referencia, fecha; el saldo baja en vivo). |
| 5 | **Vacíos, errores y Recepción** | «Nada por reclamar» (trazo que se dibuja), «Ninguna nota coincide con …», sin saldos. **Recepción sin la nota adentro**: solo la decisión de faltante y el chip «Se reclama en Notas de crédito ↗»; confirmar la recepción crea de verdad la nota pendiente en el módulo. Con el interruptor «Hoy» se ve la versión actual para comparar. |

Movimiento: entrada escalonada (≤ 40 ms de desfase, una sola vez), cifras que cuentan, pulgar deslizante, FLIP al filtrar/agrupar, cajón
que se desliza, modales con la regla de ADR-0136 (velo → hoja que sube 18 px y crece → cascada de 55 ms → salida de 220 ms; en móvil, hoja
desde el borde), barras que se llenan, «visto» que se dibuja, una sola animación en bucle (el punto de lo urgente y el hilo mientras la base
responde). Todo se apaga con `prefers-reduced-motion` (y con el botón del spike).

## Mapa pantalla → datos reales

Verificado contra `docs/datos/generado/DICCIONARIO-RETAIL.md`, `funciones-produccion.txt` y las migraciones `20260918215000` a `20260918220000`.

| Pieza de la pantalla | Tabla / columna / RPC que ya existe | Estado |
|---|---|---|
| «Por reclamar» (lista y cifra) | `compras_nota_pendiente(p_compra_ids uuid[])` → `unidades_cerradas`, `monto_esperado`, `resuelto`. Líneas: `compra_item_cierres` (`cantidad`, `motivo`, `nota`, `usuario_id`, `created_at`) × `compra_items.costo_unitario` | Existe, **pero** exige pasarle los ids: hay que conocerlos → **requiere función de lectura nueva** (ver abajo) |
| Antigüedad («Hace 12 días») | `compra_item_cierres.created_at` (fecha del cierre, hoy de Lima) | Existe |
| «Falta cerrar 12 uds» (bloqueada) | `compras.facturado_cantidad − recibido_cantidad − cerrado_cantidad`; regla `disponibilidadNota` en `lib/recepciones-reglas.ts` | Existe |
| Lista de notas registradas | `compra_notas_credito` (`serie_numero`, `fecha`, `subtotal`, `igv`, `monto`, `aplicado`, `motivo`, `nota`, `cierre_id`, `usuario_id`) | Existe. Hoy solo se lee **de a un comprobante** (`getNotasCreditoCompra`) → falta lectura transversal |
| Motivos de la nota | `faltante · devolucion · descuento · otro` (CHECK `compra_notas_credito_motivo_check`). «Precio» de Felipe = `descuento`. «Mercadería dañada» **no** es motivo de nota: es motivo del *cierre* (`danada`) y la nota va como `faltante` | Existe (se muestra «Descuento (precio)») |
| Registrar | `registrar_nota_credito_compra(p_compra_id, p_serie_numero, p_fecha, p_monto, p_motivo, p_nota, p_cierre_id)` — solo líder, reglas de `fn_insertar_nota_credito_compra` (una por faltante y comprobante, resuelto al 100 %, tope = cerrado a su costo con IGV + S/ 1, suma de notas ≤ total, fecha no futura ni anterior a la emisión, serie única por comprobante) | Existe. **La pantalla nunca manda `p_cierre_id` ni `p_nota`** (`DRIFT.md`); el spike tampoco los pide |
| Destino del dinero: «queda a favor» | Ya es lo que hace `fn_insertar_nota_credito_compra`: `aplicado = min(monto, saldo)` y el excedente entra a `proveedor_creditos` como `nota_credito` | Existe: es el comportamiento de hoy |
| Destino del dinero: «nos lo devuelve ahora» | Un reembolso ya existe (`registrar_reembolso_proveedor`: medio, referencia, fecha, monto ≤ saldo a favor, solo líder) pero es **otra RPC**: registrar la nota y el reembolso son dos llamadas, dos transacciones | **Requiere migración** (ver «Destino del dinero: qué necesita la base») |
| Cuenta de CAYLA donde entra el reembolso | La base solo guarda las cuentas **del proveedor** (`proveedores.banco`, `cuenta_bancaria`, `cci`, `titular_cuenta`). Las de CAYLA no existen | **Requiere dato nuevo** (ver D6): en el spike es un dato de ejemplo |
| Buscador de facturas (lista, filtros, estados) | `listar_compras(p_busqueda, p_proveedor_id, p_con_saldo, p_solo_vencidas, p_estado_pago, p_solo_vigentes, …)`; chip «Con nota» = `compras.notas_credito > 0`; Pagada/Pendiente/Vencida salen de `saldo` y `fecha_vencimiento` | Existe **salvo la búsqueda por monto**: `p_busqueda` hoy compara documento y proveedor, no importes → **requiere ampliar `listar_compras`** (un parámetro nuevo `p_monto` o aceptar números en `p_busqueda`) |
| Ficha compacta de la factura | Líneas: `getLineasCompra`; pagos: `getPagosCompra`; notas ya emitidas: `getNotasCreditoCompra`; nota pendiente: `compras_nota_pendiente([id])` | Existe (todas por comprobante; se piden al elegir, no en la lista) |
| Efecto («baja de X a Y», «quedan S/ … a favor») | `reparteNota` / `textoReparteNota` / `efectoCierre` (`lib/recepciones-reglas.ts`); la base guarda `aplicado = min(monto, saldo)` | Existe (reutilizar tal cual) |
| Crédito fiscal (IGV) del mes | `compras_resumen_extra` → `igvMes` (`lib/compras-indicadores.ts`) | Existe |
| Saldo a favor por proveedor | `fn_saldo_favor_proveedor(p_proveedor_id)` (suma de `proveedor_creditos`); en lista, `fn_proveedores().saldo_favor` | Existe. **Ojo: el libro se llama `proveedor_creditos`, no `libro_creditos`** |
| «De qué viene» (libro con saldo corrido) | `fn_proveedor_creditos(p_proveedor_id, p_limite)` → `tipo`, `monto`, `fecha`, `documento`, `nota_serie_numero`, `metodo`, `referencia` | Existe (ya lo usa la ficha del proveedor) |
| «Usar en un pago» | Enlace a `/compras/por-pagar?prov=<id>&marcar=1`; el descuento lo hace `registrar_pago_compras(..., p_credito)` desde «Pagar juntos» (commit `9f707bd6`: se sugiere, no viene marcado) | Existe |
| «Pedir reembolso» | `registrar_reembolso_proveedor(p_proveedor_id, p_monto, p_metodo, p_referencia, p_fecha, p_nota)` — solo líder, monto ≤ saldo, no mueve caja | Existe, pero **registra un reembolso que ya ocurrió**: no hay «pedido / pendiente» |
| «Aplicado este mes» | Σ `compra_notas_credito.aplicado` del mes + Σ `proveedor_creditos` (`tipo = 'aplicacion'`) del mes | Existe (calculable) |
| Permisos | `fn_puede_ver_dinero_de_compras()` (notas) y `fn_puede_registrar_compras()` (libro): hoy ambas = líder | Existe |

### Qué requiere migración (se ve en el HTML con «Mostrar lo que requiere migración»)

1. **Una función de lectura para el tablero** (`notas_credito_tablero()` o similar): devuelve, en una llamada, las notas pendientes de *todos* los
   comprobantes vigentes + las notas registradas con proveedor y comprobante. **Es una función de lectura, no cambia ninguna tabla**; con
   candado `fn_puede_ver_dinero_de_compras()` y `security definer` como `compras_nota_pendiente`. Sin ella el módulo no arranca.
2. **«Reclamada al proveedor»** (paso 2 de la línea de tiempo, «Marcar como reclamada», recordatorio a los 14 días): hoy no existe dónde guardarlo.
   Propuesta mínima: tabla `compra_nota_reclamos (id, compra_id, fecha, medio, nota, usuario_id, created_at)`, append-only como el resto del libro,
   RLS de lectura solo líder. Sin ella el módulo funciona igual, solo que sin ese paso.
3. **Adjunto de la nota**: `compra_adjuntos` cuelga del comprobante (`compra_id`), no de la nota. Propuesta: columna nullable `nota_credito_id`
   (+ misma ruta `<compra_id>/…`, mismo bucket `retail-compras-adjuntos`, mismos tipos y tope de 10 MB, que ya se validan). Sin ella, el adjunto se
   sube al comprobante y no se sabe de qué nota es.
4. *(Opcional, ver decisión D3)* `proveedor_creditos.nota_credito_origen_id` en los movimientos `aplicacion`/`reembolso`, para saber de cuál nota
   salió cada uso. Sin ella el spike **deduce** el estado «Aplicada» con orden de llegada (FIFO) por proveedor.
5. *(Opcional)* Estado «reembolso solicitado» si Felipe quiere que «Pedir» deje algo pendiente en vez de registrar lo ya recibido.

6. **Devolver ahora (atómico)** y **buscar por monto** — ver la sección siguiente y la fila del buscador arriba.

### Destino del dinero: qué necesita la base

Hoy `registrar_nota_credito_compra` **no puede** devolver dinero: solo baja la deuda y deja el sobrante como saldo a favor. Para «Nos lo devuelve ahora» hay dos caminos:

| Camino | Ganas | Pagas |
|---|---|---|
| **A · RPC atómica nueva** `registrar_nota_credito_con_devolucion(p_compra_id, p_serie_numero, p_fecha, p_monto, p_motivo, p_nota, p_cierre_id, p_devolver boolean, p_metodo, p_referencia, p_fecha_devolucion)` que llama a `fn_insertar_nota_credito_compra` y a la lógica de `registrar_reembolso_proveedor` **en una sola transacción** | Nota y reembolso nacen juntos o no nace nada (principio 2: cero estados inconsistentes); las dos funciones que ya mueven dinero **no se tocan**; el reembolso puede llevar `nota_credito_id` y así el estado «Devuelta» es exacto (adiós FIFO para ese caso) | Una función nueva que mantener y probar |
| **B · Parámetro nuevo en `registrar_nota_credito_compra`** | Una sola función | Cambiar la firma de una RPC que ya usa la pantalla: `create or replace` con otros parámetros crea una **sobrecarga** (ya nos pasó), y se toca una función de dinero |
| C · Dos llamadas seguidas desde la pantalla | Cero migración | Si la segunda falla, queda la nota sin reembolso y el saldo a favor «pendiente de devolver»: exactamente el estado inconsistente que el diseño prohíbe |

**Recomiendo A.** Requiere migración (una función; sin tablas nuevas). Detalles: si `p_devolver = false` (o no sobra nada) se comporta como hoy; si `p_devolver = true` y sobra dinero, registra el reembolso por exactamente el excedente, con el mismo candado de saldo (`for update` del proveedor) y con `usuario_id`. Verificar contra `proveedor_creditos_origen` (permite `nota_credito_id` en un reembolso: la constraint solo exige `metodo`) y contra `fn_proveedor_creditos`, que hoy une `nota_credito_id` para mostrar «nota_serie_numero».

## Lo que hoy está mezclado en Recepción (y el módulo separa)

Verificado leyendo el código:

- `components/RecepcionEnvio.tsx` (líneas ~564–630 y ~1313) arma un `bloquesNota` por comprobante, valida serie y monto **antes de recibir**, y renderiza
  `NotaCreditoCierre` **dentro de la guía de recepción** (interruptor «Ya tengo la nota de crédito del proveedor», serie, fecha, monto, «Cómo quedan tus cuentas»).
- `components/NotaCreditoCierre.tsx` (210 líneas) trae consigo `igvMes`, `saldoFavorAntes`, `porRecibirAtrasadas` y el encadenado entre comprobantes del mismo proveedor:
  plomería de **dinero** dentro de una pantalla que también usa un colaborador de sede para contar.
- `recibir_envio(..., p_notas_credito jsonb, ...)` recibe las notas junto con el conteo; `EnvioRecibido.tsx` cuenta «N notas de crédito registradas».
  Una recepción que solo debía contar y cerrar termina escribiendo dinero (`compra_notas_credito`, `proveedor_creditos`) en la misma transacción.
- `components/AccionesFaltantes.tsx` (`BotonRegistrarNota`, `RegistrarNotaModal`) vive en el detalle del comprobante: una **segunda** puerta de entrada al mismo formulario.
- `lib/recepciones-reglas.ts` mezcla reglas de recepción (`cierresElegidos`, `sinDecidir`, `etiquetaConfirmar`) con reglas de dinero de la nota (`notaDelBloque`, `reparteNota`, `efectoCierre`).

**Cómo queda con el módulo:** Recepción conserva contar y decidir (`DecisionFaltanteFila`: «los espero» / No llegaron / Dañadas / Error del proveedor) y suma un chip que apunta al módulo.
El formulario de la nota vive en un solo lugar. `recibir_envio` puede seguir aceptando `p_notas_credito` (compatibilidad) pero la pantalla deja de enviarlo: **sin migración**.

## Cómo se conecta

- **Qué sale de Recepción:** `NotaCreditoCierre`, el estado `notas` de la guía, la validación de serie/monto, el contador «notas registradas» de `EnvioRecibido`, y `BotonRegistrarNota` del detalle (queda un enlace al módulo con el comprobante precargado).
- **Qué queda:** decidir qué pasó con lo que faltó (cierre append-only). Al confirmar, `cerrar_linea_compra` crea el cierre y `compras_nota_pendiente` empieza a devolver ese comprobante: **aparece solo en «Por reclamar»** (el spike lo demuestra al confirmar la recepción).
- **Con Por pagar:** la nota que baja una deuda ya se refleja en `compras.saldo`/`notas_credito` (no cambia). Lo que sobra queda a favor y Por pagar lo **sugiere** en «Pagar juntos» (`p_credito`); el módulo solo *lleva* ahí («Usar en un pago» → `?prov=…&marcar=1`). Regla de Felipe respetada: nunca se descuenta solo.
- **Con Proveedores:** la ficha ya muestra saldo a favor e historial (`SaldoFavorProveedor`, `SaldoFavorAcciones`); el módulo es la vista **transversal** de lo mismo. Conviene que ambas usen el mismo componente de libro.
- **Menú:** entrada «Notas de crédito» dentro del grupo Compras, junto a Por pagar (icono `receipt-text`), con un contador ámbar de «Por reclamar» como el de Por pagar.

## Decisiones que aún debe tomar Felipe (D1–D5 del primer spike, D6 del ajuste del 19/09)

**D1 · ¿Se puede registrar la nota desde Recepción, aunque sea opcional?**
- *Sí, dejar el interruptor:* **Ganas** un paso menos cuando el proveedor entrega la nota junto con la mercadería. **Pagas** seguir con dinero dentro de una pantalla que usan colaboradores, dos puertas al mismo formulario y `recibir_envio` acoplado a notas.
- *No, solo en el módulo:* **Ganas** un lugar único, Recepción más simple y limpia de dinero. **Pagas** un clic más cuando la nota llega en mano (mitigado: el chip lleva al módulo con el comprobante precargado).
- **Recomiendo: solo en el módulo.** Es lo que pediste, y el caso «nota en mano» es minoritario.

**D2 · ¿Guardamos el «reclamada al proveedor»?**
- *Sí (tabla `compra_nota_reclamos`):* **Ganas** saber a quién le falta llamar y el recordatorio a los 14 días; cierra el ciclo real. **Pagas** una tabla nueva y un botón más que hay que acordarse de apretar.
- *No:* **Ganas** cero migración de esquema. **Pagas** el módulo solo dice «hace N días», sin saber si ya reclamaste.
- **Recomiendo: sí, pero en una segunda fase.** Lanzar primero el tablero (solo función de lectura) y sumar el reclamo cuando lo uses una semana.

**D3 · ¿Cómo se sabe que una nota está «Aplicada»?**
- *Deducirlo (FIFO por proveedor, como el spike):* **Ganas** cero migración. **Pagas** que con varias notas y usos mezclados la nota que dice «aplicada» puede no ser la que realmente se usó (el total por proveedor siempre es exacto).
- *Guardar de cuál nota salió cada uso:* **Ganas** trazabilidad exacta. **Pagas** una columna nueva y cambiar `registrar_pago_compras` y `registrar_reembolso_proveedor`, dos funciones que mueven dinero.
- **Recomiendo: deducirlo.** Es solo una etiqueta; no toques las funciones de pago por una etiqueta.

**D4 · ¿A partir de cuántos días un reclamo es urgente?**
- *14 días (el spike):* **Ganas** un punto que late solo cuando importa. **Pagas** que sea un número puesto por mí, no por tu experiencia con cada proveedor.
- *Un plazo por proveedor (`plazo_credito_dias` u otro campo):* **Ganas** urgencia a la medida. **Pagas** un dato más que mantener.
- **Recomiendo: una constante (14) en `lib/nota-pendiente-reglas.ts`**, fácil de cambiar; el plazo por proveedor si algún día lo pides.

**D5 · ¿Dónde vive el adjunto de la nota?**
- *Columna `nota_credito_id` en `compra_adjuntos`:* **Ganas** el PDF ligado a su nota, con el bucket, los tipos y el tope de 10 MB que ya existen. **Pagas** una migración pequeña.
- *Adjuntarlo al comprobante como hoy:* **Ganas** cero migración. **Pagas** que un comprobante con dos notas tenga un cajón de archivos sin saber cuál es cuál.
- **Recomiendo: la columna.** Es chica y la evidencia de una nota es justo lo que se busca en una auditoría.

**D6 · Cuando sobra dinero, ¿qué es lo normal: devolver o dejar a favor? (ajuste del 19/09)**
- *El spike propone «queda a favor» como valor inicial y el líder elige «devolver ahora» cuando quiera:* **Ganas** que el comportamiento por defecto sea el de hoy y que nunca se registre un reembolso por descuido. **Pagas** un clic extra cada vez que el proveedor sí devuelve el dinero al momento.
- *Que el valor inicial sea «devolver ahora» para facturas ya pagadas (típico de contado) y «a favor» para el resto:* **Ganas** menos clics en el caso más frecuente. **Pagas** el riesgo de registrar un reembolso que en realidad todavía no llegó (el sistema no sabe si el dinero entró).
- **Recomiendo lo primero** y una segunda parte de la decisión: **¿guardamos las cuentas de CAYLA?** El spike dice «Se lo depositan en: BCP …» con un dato inventado; la base no lo tiene. Ganas: quien registra ve el destino sin preguntar. Pagas: una tabla o ajuste nuevo (`cuentas_cayla` por sede, o texto en configuración) y mantenerla al día. Recomiendo **no guardarlo todavía** y dejar solo el medio y el N.° de operación (que sí caben en `registrar_reembolso_proveedor`); si el líder lo pide, se agrega después.

## Otros hallazgos del modelo actual (no son decisiones, son deuda)

- El libro se llama **`proveedor_creditos`**; el encargo hablaba de `libro_creditos`. Conviene que el ADR use el nombre real.
- Dos candados distintos para dinero de la misma familia: notas → `fn_puede_ver_dinero_de_compras()`; libro de saldo a favor → `fn_puede_registrar_compras()`. Hoy los dos son «líder»; si un día divergen, el módulo mostraría notas sin saldo o al revés.
- La regla del monto de la nota vive duplicada (TypeScript en `recepciones-reglas.ts` y SQL en `fn_insertar_nota_credito_compra`). El módulo la reutiliza tal cual; no agregar una tercera copia.
- `compra_notas_credito` no tiene `proveedor_id`: el proveedor se llega por `compra_id`. La función de lectura del tablero debe hacer ese `join`.
- En producción `compra_notas_credito` y `compra_item_cierres` tienen ~0 filas (diccionario): no hay datos reales que migrar.
- Vocabulario del ERP respetado: «colaborador/líder», «sede/tienda», «Taller Lima»; las series de las notas siguen el placeholder real del código (`FC01-000018`).

## Cómo se implementaría (estimación)

Sin dependencias nuevas. Cero cambios a las funciones de dinero existentes.
1. Migración de **lectura** (`notas_credito_tablero`) + `lib/notas-credito.ts` (servidor) y `lib/notas-credito-reglas.ts` (puro: tramos de antigüedad, «siguiente paso», FIFO de restos; testeable).
2. Ruta `app/(app)/compras/notas-credito/page.tsx` (+ `@modal` para el detalle/registro con `<ModalRuta>`), componentes: `NotasCreditoLista`, `NotaCreditoVistaRapida`, `RegistrarNotaModal` (mover el de `AccionesFaltantes.tsx`, sin cambios de lógica), `SaldosAFavorTablero` (reutiliza `SaldoFavorAcciones`).
3. Recepción: quitar `NotaCreditoCierre` y `bloquesNota`/`notas` de `RecepcionEnvio.tsx`, agregar el chip; `EnvioRecibido` deja de contar notas.
4. Menú lateral + contador «Por reclamar». ADR nuevo + actualizar `docs/ARQUITECTURA.md` y `docs/datos/modulos/09-compras-y-proveedores.md`.
5. Después, según D2 y D5: `compra_nota_reclamos` y `compra_adjuntos.nota_credito_id`.

## Cómo se verificó (2026-09-19, primera pasada y ajuste de destino del dinero + buscador)

Ejecutado en el navegador integrado (Chromium), con el HTML abierto por `file://`. Datos actuales: 6 notas por reclamar (S/ 2,999.56), 6 registradas, 14 facturas.
- **Sintaxis y consola:** `node --check` sin errores; consola del navegador sin mensajes en toda la sesión (antes y después del ajuste). Las 14 facturas de ejemplo se comprobaron con un script: líneas × costo × 1.18 = total en todas.
- **Destino del dinero, los tres casos (cifras vistas en pantalla):**
  - *Pendiente* (F001-000482, nota S/ 847.24, debe S/ 3,923.60): baja S/ 847.24 · devuelve S/ 0.00 · a favor S/ 0.00; las dos fichas quedan `aria-disabled` y dicen «Esta nota solo baja la deuda: no hay dinero que devolver».
  - *Pagada* (F004-000129, nota S/ 188.80): con «queda a favor» el modal anuncia saldo a favor total S/ 656.00 → S/ 844.80 y aplicado S/ 1,114.00 sin cambio; con «devuelve ahora» (elegido con la flecha ←, el foco pasó a la ficha) muestra medio, fecha, N.° de operación y la cuenta, saldo a favor S/ 656.00 → S/ 656.00 y aplicado S/ 1,114.00 → S/ 1,302.80. Registrado con «Op. 00912345»: Por reclamar S/ 2,999.56 → S/ 2,810.76, Emitidas S/ 1,770.00 → S/ 1,958.80, Saldo a favor total S/ 656.00 (igual), Aplicado S/ 1,114.00 → S/ 1,302.80; el «visto» dice «Nota FC04-000011 y reembolso registrados»; la fila queda «Devuelta · Devuelto el 18/09 · transferencia».
  - *Mixto* (F001-000401, debe S/ 1,128.00, nota S/ 1,180.00, elegida desde el buscador): baja S/ 1,128.00 · devuelve S/ 0.00 · a favor S/ 52.00. Registrado: Por reclamar S/ 2,999.56 → S/ 1,819.56, Saldo a favor total S/ 656.00 → S/ 708.00 (Tejidos Rímac S/ 52.00 en Saldos a favor), Aplicado S/ 1,114.00 → S/ 2,242.00. Elegido «devolver ahora» el sobrante de S/ 52.00 se registra como reembolso.
  - La nota ya registrada FC02-000009 (devuelta) muestra en la vista rápida «Devuelto S/ 354.00 · 11/09 · transferencia», y en el detalle el paso «Dinero devuelto» y el reembolso en el historial.
- **Buscador de facturas con teclado:** `N` abre el registro con el foco en el buscador; «hilad» → 3 facturas con la coincidencia resaltada; «2360» → F003-000771 con «2,360» resaltado en total y saldo; «f001-0004» → 3 facturas; «zzzz» → «No hay facturas que coincidan» con «Ver todas»; `Esc` borra la búsqueda sin cerrar el modal; filtros Pagadas (6) / Con saldo (8) / Todas (14); ↓ ↓ ↑ mueven la opción activa (`aria-activedescendant`); «401» + `Enter` elige F001-000401, cierra el buscador, abre la ficha y pasa el foco a serie-número; «Cambiar» reabre el buscador con «Del proveedor: Tejidos Rímac SAC» (→ 4 facturas) y `Esc` cancela el cambio sin cerrar el modal. Sin factura elegida el resto del formulario está `inert` y atenuado.
- **Tablero:** el buscador principal con `f001-0004` devolvió 4 filas con la coincidencia resaltada.
- **Móvil (375 px) y escritorio:** capturas del registro (ficha, buscador, destino, reembolso con etiquetas «requiere migración»); `scrollWidth` = 375 en móvil (sin scroll horizontal).
- **Movimiento:** `prefers-reduced-motion` y el botón «Movimiento reducido» comparten regla; las secciones que se abren (buscador ↔ ficha, panel del reembolso) usan una transición de altura de 380 ms con `--ease-cayla`, sin rebote.

**Lo que NO pude verificar (deducido, no ejecutado):**
- El movimiento *en curso* (velo, hoja, cascada, barras): el panel del navegador estaba oculto casi todo el tiempo y sus animaciones no avanzan; comprobé estados finales por DOM y con capturas en «Movimiento reducido». **Conviene que Felipe lo mire en su navegador.**
- `prefers-reduced-motion` real del sistema (el panel no lo emula), un teléfono físico, el teclado en pantalla y la copia al portapapeles en `file://`.
- El foco atrapado con Tab dentro del modal (está programado, no lo probé).
- Nota sobre el método: cuando el panel del navegador se muestra, las herramientas envían clics reales entre llamadas y pueden cerrar un modal o elegir una fila; por eso cada recorrido se hizo dentro de una sola ejecución.
