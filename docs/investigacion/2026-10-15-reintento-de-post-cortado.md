# ¿Chrome repite un POST cortado? Sí, y a veces sin que la pantalla se entere

- **Fecha:** 2026-10-15 · **Rama:** `claude/magical-herschel-3d3003` · **Nace de:** ADR-0411, «Hallazgo de paso».
- **Pregunta:** cuando la conexión se cae DESPUÉS de que la base guardó y antes de que llegue la respuesta, ¿Chrome vuelve a mandar el mismo
  POST por su cuenta contra el Supabase de producción? Y si lo hace, ¿qué escrituras del ERP sin marca (`p_token`) se guardarían dos veces?
- **Solo lectura e investigación:** no cambia código de la web, ni la base, ni SUNAT. Lo que se propone espera el OK de Felipe.

Evidencia en tres niveles, como pide `/formidable`: **Medido** (un experimento que se puede repetir), **Observado** (el código de Chromium y
de nuestra base, con archivo y línea) y **Opinión** (lo que se infiere y no se pudo medir).

## La respuesta corta

1. **Sí.** Chrome reenvía un POST, sin mirar el método, cuando la conexión se cierra o se resetea antes de recibir la respuesta y esa conexión
   ya se había usado antes. Pasa igual con HTTP/1.1 y con HTTP/2; con HTTP/3, si la conexión QUIC falla después de enviar, lo reenvía por TCP.
2. **Lo peor no es el error, es el éxito.** Si solo se corta el primer envío, el reenvío entra bien y la pantalla recibe un **OK normal**:
   para la colaboradora no pasó nada, y la base guardó dos veces. Ni el aviso de ADR-0410 ni el refresco de ADR-0411 se enteran, porque no
   hubo ningún error.
3. **Producción está expuesta:** Supabase responde por HTTP/2 detrás de Cloudflare y ofrece HTTP/3. Toda conexión al proyecto ya está
   «usada» después de la primera petición (el preflight CORS basta).
4. **Lo central del dinero ya resiste** (venta, abono de apartado, gasto, movimientos e ingresos de caja, pagos de compras, cambio, ajuste,
   traslados, llegada de mercadería): son 34 funciones con marca. **Quedan 141 funciones de escritura sin marca.** De las 31 que tocan dinero,
   stock o comprobantes, **6 pueden guardar dos veces**. La más grave es `crear_devolucion`: puede terminar en un reembolso doble y dos notas
   de crédito en SUNAT. Las otras 22 rechazan el reenvío con un mensaje que contradice lo que pasó.
5. **Hay una salida en un solo lugar:** el reenvío de Chrome trae exactamente las mismas cabeceras (medido), así que una marca por petición lo
   distingue de un clic repetido. Propuesta abajo; la decide Felipe.

## Medido: el experimento

`scripts/investigacion/reintento-post-cortado.mjs` (se repite con `node scripts/investigacion/reintento-post-cortado.mjs`). Un contador
local cuenta cuántas veces le llega cada POST; entre el navegador y el contador, un proxy corta la conexión **después** de que el contador
guardó. El navegador es el **Google Chrome 155.0.8059.40** instalado en este Mac, manejado por Playwright con un perfil temporal. HTTP/2 va
con un certificado de prueba que solo acepta ese Chrome; no se instaló nada en el equipo. Cada escenario usa un perfil nuevo, sin conexiones
de antes. Se corrió tres veces y dio lo mismo (la tercera, con la cabecera `x-intento` de abajo).

| # | Protocolo | Escenario | Envíos de Chrome | Guardado en el servidor | Lo que vio la página |
|---|---|---|---|---|---|
| 1 | HTTP/1.1 | conexión ya usada · se corta solo la 1.ª respuesta | 2 | **2** | **OK 200** |
| 2 | HTTP/1.1 | conexión ya usada · se cortan todas | 2 | 2 | `Failed to fetch` |
| 3 | HTTP/1.1 | cuatro conexiones usadas en reserva · se cortan todas | 5 | 5 | `Failed to fetch` |
| 4 | HTTP/1.1 | primera petición, pero con preflight CORS antes | 2 | **2** | **OK 200** |
| 5 | HTTP/1.1 | primera petición, sin preflight (conexión nueva) | 1 | 1 | `Failed to fetch` |
| 6 | HTTP/1.1 | conexión ya usada · se corta ANTES de llegar al servidor | 2 | 1 | OK 200 |
| 7 | HTTP/2 | se cae la conexión tras guardar (solo la 1.ª) | 2 | **2** | **OK 200** |
| 8 | HTTP/2 | se cae la conexión tras guardar (todas) | 2 | 2 | `Failed to fetch` |
| 9 | HTTP/2 | `RST_STREAM REFUSED_STREAM` tras guardar (todas) | 3 | 3 | `Failed to fetch` |
| 10 | HTTP/2 | `GOAWAY` «no la procesé» tras guardar (todas) | 2 | 2 | `Failed to fetch` |
| 11 | HTTP/2 | `RST_STREAM INTERNAL_ERROR` tras guardar | 1 | 1 | `Failed to fetch` |
| 12 | HTTP/2 | primera petición, con preflight CORS antes | 2 | **2** | **OK 200** |

Cómo leerla:

- **1, 4, 7 y 12 son el duplicado silencioso:** un solo clic, dos escrituras y una pantalla que dice «listo».
- **6 es para lo que existe el reintento:** el servidor cerró una conexión vieja antes de leer el pedido, y reenviarlo es lo correcto. Chrome
  no puede distinguir este caso del 1.
- **3:** cuantas más conexiones abiertas tenga Chrome con el servidor, más veces repite. Lo frena una conexión nueva, que no se reintenta.
- **5 y 11 no repiten:** una conexión nueva, o un servidor que dice «error interno», cortan el reintento.
- **4 y 12 cuentan para producción:** cada RPC de Supabase lleva cabeceras propias (`apikey`, `authorization`), así que el navegador manda
  primero un preflight CORS. Ese preflight ya «usa» la conexión, y el POST sale sobre una conexión que Chrome considera probada.

**El reenvío trae la misma cabecera.** En los 12 escenarios, cada clic mandó una cabecera `x-intento` con un uuid propio, y todos sus envíos
(2, 3 o 5) llegaron al contador con el mismo valor. O sea: una marca por petición distingue el reenvío de Chrome (misma marca) de una persona
que vuelve a apretar (otra petición, otra marca). Supabase la deja pasar: su preflight devuelve cualquier cabecera pedida
(`access-control-allow-headers: …,x-intento`, consultado el 2026-10-15), como ya pasa con `x-responsable`, `x-ubicacion` y `x-momento`, que la
base lee hoy en la firma del responsable (ADR-0162).

El 2026-10-14, en la verificación de ADR-0411 (navegador integrado de la app, proxy local HTTP/1.1 frente a la base local), cada clic de
Ingresar insumo llegó **tres** veces a la base. Fue el escenario 3: había varias conexiones abiertas. La marca de la hoja lo dejó en un lote.

## Observado: el código de Chromium

`chromium/chromium` en `main`, commit `687b43f1` (2026-10-01), que es la base de Chrome 155:

- `net/http/http_network_transaction.cc:2125` `GetRetryReasonForIOError`: `ERR_CONNECTION_RESET`, `ERR_CONNECTION_CLOSED`,
  `ERR_CONNECTION_ABORTED`, `ERR_SOCKET_NOT_CONNECTED` y `ERR_EMPTY_RESPONSE` son motivos para reenviar.
- `:2388` `ShouldResendRequest()`: reenvía si `stream_->IsConnectionReused() && !has_received_headers`. **No mira el método.** El comentario
  dice que es para la carrera de una conexión keep-alive que el servidor estaba cerrando, y no distingue si el pedido ya se procesó.
- `:112` `kMaxRetryAttemptsOnConnectionErrors = 50`: hasta 50 reenvíos mientras siga encontrando conexiones usadas (el escenario 3).
- `:108` `kMaxRetryAttempts = 2`: para `ERR_HTTP2_PING_FAILED`, `ERR_HTTP2_SERVER_REFUSED_STREAM`, `ERR_QUIC_HANDSHAKE_FAILED` y el GOAWAY de
  QUIC, hasta dos reenvíos más (el escenario 9: tres envíos).
- `:442`: la «idempotencia» del pedido (GET sí, POST no) solo decide si se puede mandar en el arranque TLS (early data). **No frena el reintento.**
- `:1160`: `ERR_NETWORK_CHANGED` (cambio de wifi a datos) solo se anota y no se reenvía.
- `:2302` y `net/quic/quic_context.h:151`: un error QUIC sin respuesta se reenvía **por TCP**
  (`retry_without_alt_svc_on_quic_errors = true`). `net/quic/quic_http_stream.cc:740`: si el pedido ya salió, el error es
  `ERR_QUIC_PROTOCOL_ERROR`, que cae en ese camino.
- `net/spdy/spdy_session.cc:1499` `IsReused()`: en HTTP/2 la sesión cuenta como usada apenas recibió un frame, o sea, siempre después del
  primer intercambio. `:2925` y `:2966`: `REFUSED_STREAM` y `GOAWAY` sin error pasan a `ERR_HTTP2_SERVER_REFUSED_STREAM`, que se reenvía.

Nuestro lado:

- **supabase-js no reintenta un POST** (`@supabase/postgrest-js`: `RETRYABLE_METHODS` son GET, HEAD y OPTIONS). El reenvío viene solo de Chrome.
- **Una página no puede apagar el reintento:** `fetch()` no tiene opción para eso.

## Observado: producción

Sin clave y sin tocar datos, solo las cabeceras del endpoint de salud del proyecto (`vovjyyiafkxteijimpuy.supabase.co`):

- `HTTP/2 401`, `server: cloudflare`, `cf-ray: …-LIM` (el borde de Lima);
- `alt-svc: h3=":443"; ma=86400`: Chrome pasa a **HTTP/3** después de la primera respuesta y lo recuerda un día;
- preflight con `access-control-max-age: 3600`.

Opinión: en una tienda, Chrome habla con Supabase por HTTP/3 casi siempre y cae a HTTP/2 cuando QUIC falla. Los dos caminos reenvían.

## Qué escrituras están expuestas

Inventario hecho leyendo el código de `apps/web` (todas las llamadas `.rpc(…)` que no son de lectura) y la definición de cada función en la
base local (`pg_get_functiondef`, con las mismas migraciones que `main`):

- **175 funciones de escritura** se llaman desde el navegador.
- **34 llevan marca y la web siempre la manda:** `abonar_separacion`, `abrir_produccion`, `abrir_produccion_con_modelo_nuevo`,
  `ajustar_inventario`, `anotar_decision_frescura`, `anular_decision_frescura`, `anular_traslado`, `crear_pieza_liquidacion`,
  `crear_producto_con_stock_inicial`, `editar_separacion`, `entregar_separacion`, `enviar_pedido_a_otra_sede`, `enviar_pedido_para_apartar`,
  `iniciar_traslado`, `pedir_a_otra_sede`, `pedir_prenda_para_apartar`, `recibir_comprobante_produccion`, `recibir_envio`, `recibir_insumo`,
  `recibir_lote`, `registrar_activo`, `registrar_cambio`, `registrar_compra`, `registrar_comprobante_produccion`, `registrar_gasto`,
  `registrar_ingreso_caja`, `registrar_movimiento_caja`, `registrar_movimiento_dinero`, `registrar_pago_compras`,
  `registrar_pago_compras_medios`, `registrar_pago_comprobante_produccion`, `registrar_pagos_compra`, `registrar_venta` y `separar_prendas`.
  El patrón de ADR-0190 aguanta también el reenvío **simultáneo** (la conexión se cae mientras la base todavía trabaja): en `recibir_insumo`,
  la función toma `pg_advisory_xact_lock` por token, y el segundo intento espera al primero y devuelve su resultado. No se revisaron las 34 una
  por una.
- **141 no tienen marca.** 83 insertan filas; 58 solo actualizan, y en esas repetir casi siempre deja lo mismo.
- **Los comprobantes no se duplican.** La serie y el número se fijan en la base antes de transmitir, y un segundo envío del mismo número
  vuelve de Lucode como «ya emitido» y se resuelve preguntándole a Lucode (`lib/transmitir-comprobante.ts`, `esYaEmitido` y
  `resolverYaEmitido`).
- **Las server actions** son lecturas, o escrituras que chocan con una restricción única si se repiten (registro en el club, crear terminal).
- **Siete escrituras directas a tablas desde el navegador**: insumos, fotos de producto, cotizaciones de maquila, terminales, estado de
  productos y marcas. Ninguna mueve dinero ni stock.

### Las 31 sin marca que tocan dinero, stock o comprobantes

Cada una se leyó entera en la base local (`pg_get_functiondef`), preguntando qué hace una **segunda ejecución idéntica que empieza después de
que la primera confirmó**. Los índices únicos se cruzaron con el volcado de producción (`docs/datos/generado/retail_indices_unicos.json`). Las
dos más graves (`crear_devolucion` y `registrar_consumo_insumo`) se revisaron dos veces.

**Pueden guardar dos veces (6).** Cinco duplican solo si después de la primera queda saldo; la proforma, siempre.

| Función | Pantalla | Cuándo duplica | Qué queda duplicado |
|---|---|---|---|
| `crear_devolucion` | Devoluciones (`DevolucionesFlujo.tsx`) | La línea vendida tiene más unidades que las devueltas (2 vendidas, 1 devuelta). Con líneas de 1 unidad, el segundo choca. | Una segunda devolución **pendiente**. Si un líder aprueba las dos, la prenda reingresa dos veces, el reembolso sale dos veces y van dos notas de crédito a SUNAT. Hoy lo frena solo que alguien note la repetida antes de aprobar. |
| `registrar_consumo_insumo` | Producción ▸ orden ▸ insumos (`OrdenInsumos.tsx`) | El rollo más antiguo tiene más saldo que lo consumido: el caso normal (2 m de un rollo de 50). | La tela o el avío se descuenta dos veces y el costo de la orden sube; al cerrarla, ese costo pasa al costo de la prenda. |
| `devolver_insumo_de_produccion` | la misma | Lo consumido neto alcanza para devolver dos veces. | El insumo vuelve dos veces al estante y la orden sale con menos costo. |
| `cerrar_linea_compra` | Compras ▸ cerrar faltante (`CerrarFaltanteModal.tsx`) | La primera cerró la mitad o menos de lo pendiente. | Se da por perdida el doble de mercadería del proveedor, y la tienda deja de esperar lo que quizá sí llega. |
| `reasignar_reparto_compra` | Compras ▸ reasignar (`ReasignarReparto.tsx`) | A la tienda de origen le queda pendiente igual o más que lo movido. | Se pasan otra vez N unidades de la factura de una tienda a otra. |
| `crear_proforma` | Proformas (`NuevaProformaModal.tsx`) | Siempre. | Una proforma igual con otro número. No mueve dinero, stock ni SUNAT. |

**Rechazan la segunda (22): no rompen datos, pero el mensaje contradice lo que pasó.** La base revisa el estado después de bloquear la fila,
o choca con un índice único, y la pantalla, que solo recibe la respuesta del reenvío, muestra un error aunque lo que pidió ya se hizo.
`abrir_caja` (sale el error crudo de clave duplicada, en inglés), `abrir_conteo` («ya hay un conteo abierto… ciérralo»), `anular_produccion`,
`anular_venta`, `aprobar_devolucion`, `asignar_cuenta_pasada`, `cerrar_caja`, `cerrar_conteo`, `cerrar_produccion`,
`cerrar_traslado_con_diferencia` y `confirmar_traslado` (estos dos muestran el estado interno crudo), `corregir_pagos_venta` («los pagos ya
estaban así»), `extender_separacion`, `liberar_apartado`, `liquidar_prenda_danada`, `marcar_egreso_no_gasto`, `registrar_conciliacion`,
`registrar_devolucion_separacion`, `registrar_serie_comprobante` («archívala primero»: le pide archivar la serie que acaba de crear),
`regularizar_prenda` (culpa a «otra persona»), `resolver_prenda_danada` y `revertir_produccion`; y `registrar_saldo_inicial`, que en el primer
arranque pide «el motivo de la corrección». **Cuatro, además, pierden lo que devolvía la primera:** `cerrar_caja` (el cuadre: sistema, contado,
diferencia y fondo), `aprobar_devolucion` (la serie y el número de la nota de crédito), `cerrar_conteo` (el resumen de ajustes) y
`liquidar_prenda_danada` (la venta que creó).

**No cambian nada (2):** `conteo_contar` y `registrar_recepcion_traslado` (las dos guardan con `on conflict … do update` el mismo valor).

## Propuesta

### Qué tan seguido pasa (Opinión)

No se sabe, y hoy no hay cómo saberlo: ni la base ni la web anotan un reenvío. Pasa con **cortes breves con la red viva**: un wifi que se
reconecta, un router que resetea conexiones, el borde de Cloudflare que cierra una conexión, QUIC que falla y cae a TCP. No pasa con un corte
total: ahí el reenvío también falla, y queda el caso de ADR-0410 y ADR-0411. Sin medirlo no se puede poner un número: puede ser raro o puede ser
semanal en una tienda con un wifi que parpadea. Por eso la salida A empieza solo anotando.

### Las tres salidas, y la que recomiendo

**A. Una marca por petición, en un solo lugar (la estructural).** Esta es la que recomiendo, pero **la decide Felipe**: toca la configuración
del proyecto compartido con Dynamic y más de un módulo.

- **Navegador:** el cliente de Supabase (o el interceptor de `fetch` del loader, que ya sabe qué petición es un guardado) agrega
  `x-intento: <uuid nuevo>` a cada escritura. Chrome repite la marca en su reenvío (medido); una persona que vuelve a apretar manda otra.
- **Base:** PostgREST puede correr una función antes de cada petición (`db_pre_request`). En una escritura con `x-intento`, la función
  inserta la marca en una tabla con clave única, dentro de la misma transacción. Si la marca ya está, la petición se corta antes de ejecutar
  nada con un error propio (`intento_repetido`). Si la primera todavía corre, el insert espera a que termine: es la misma idea que el
  candado por token de ADR-0190, pero para todas las funciones a la vez.
- **Pantalla:** ese error es lo único que le llega, porque la respuesta original se perdió. Se trata como «se guardó, pero no recibimos la
  respuesta»: la frase de ADR-0410 y el refresco de ADR-0411.
- **Ganas:** las 141 funciones sin marca, y las que vengan, dejan de duplicar por un reenvío, sin tocarlas una por una. Las 22 que
  rechazaban con un mensaje engañoso pasan a decir la verdad. Y antes de cortar nada se puede **solo anotar** durante unas semanas y
  medir cuántos reenvíos hay de verdad (hoy no hay forma de saberlo).
- **Pagas:** se configura PostgREST en el proyecto de Dynamic. La función tiene que dejar pasar todo lo que no traiga la marca, y nunca
  escribir en una lectura (`GET` corre en una transacción de solo lectura). Suma una escritura por guardado y una tabla que hay que podar. No
  cubre las rutas `/api` (no pasan por PostgREST). Y la pantalla pierde el resultado de la primera llamada, así que **no reemplaza** al
  `p_token` donde ese resultado importa (la venta, el cuadre de caja).
- **Por verificar antes de decidir:** que el proyecto no tenga ya un `db_pre_request` (Dynamic podría usarlo), y medir su costo en la base
  local.

**B. `p_token` en las seis que duplican (lo de siempre, pantalla por pantalla).** Es el patrón probado (ADR-0190: marca en un `useRef`,
`fn_intento_con_huella` y candado por token), en este orden: `crear_devolucion`, `registrar_consumo_insumo`, `devolver_insumo_de_produccion`,
`cerrar_linea_compra`, `reasignar_reparto_compra` y `crear_proforma`. Cada una es una migración (un reemplazo anclado) y su pantalla. Toca
stock y dinero, así que lleva el OK de Felipe. **Ganas:** el resultado de la primera llamada vuelve a la pantalla. **Pagas:** cubre seis y
nada más; la próxima función que nazca sin marca vuelve a estar expuesta.

**C. No hacer nada.** Es defendible solo para `crear_proforma`.

**Hecho el 2026-10-15 (Felipe):** `crear_devolucion` ya lleva marca en la rama `claude/magical-herschel-3d3003` (migración
`20261015162000`, prueba `pruebas:crear-devolucion-token`), verificado con el corte real en Devoluciones a 375 px. En
producción desde el mismo día (versión registrada `20261015160914`).

**Recomendación:** empezar **ya** por B con `crear_devolucion`, la única que puede terminar en plata devuelta dos veces y dos notas de crédito
en SUNAT. Escribir A como ADR, primero en modo «solo anotar» para medir, y decidir con datos si se activa el corte. Si A se activa, B queda
para las pantallas que necesitan el resultado de la primera llamada (entre ellas las cuatro que hoy lo pierden: cerrar caja, aprobar
devolución, cerrar conteo y liquidar una prenda dañada).

## Lo que no se midió

- **HTTP/3:** necesita un certificado de confianza y un servidor QUIC. Lo que se afirma sale del código de Chromium, no de una medición.
- **La frecuencia real en las tiendas:** sin telemetría (la salida A en modo «solo anotar» la daría).
- **Safari y Firefox:** las tiendas usan Chrome. Firefox y Safari tienen sus propias reglas de reenvío y no se revisaron.
- **Las rutas `/api` del catálogo** (crear color, talla, categoría…): un reenvío choca casi siempre con el nombre único; no se revisaron una
  por una.

## Cómo repetirlo

```bash
node scripts/investigacion/reintento-post-cortado.mjs
```

Necesita Google Chrome instalado y `pnpm install` hecho. No toca ninguna base: el «servidor» es un contador en memoria. El inventario se
armó con un script de una sola vez (las llamadas `.rpc(…)` de `apps/web` cruzadas con `pg_get_functiondef` de la base local); para repetirlo,
basta con `grep -rn '\.rpc(' apps/web` y leer cada función en `supabase/migrations/`.
