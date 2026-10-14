## 2026-10-14 (Auditoría del ERP para el equipo de ingeniería, y el plazo de la cola de arranque sigue a la carga inicial)
Qué hice: una auditoría de los 41 módulos con 25 agentes (12 auditores por grupo de módulos y por eje transversal —precios entre módulos,
comunicación entre módulos, arquitectura de información, plataforma—, un escéptico por eje y una síntesis), leyendo `origin/main` en `d4533724e` y
producción en solo lectura: 233 hallazgos verificados, nota media 5,5/10, 9 patrones transversales, un menú propuesto por puesto de trabajo, 8 flujos
rediseñados, una hoja de ruta en 5 fases y 8 decisiones de Felipe. Publicada como artefacto privado para sus colegas; los 64 hallazgos de seguridad
se entregaron aparte y NO se versionan (repo público). Felipe eligió empezar por «la prenda sin registrar deja de entrar sin dato» (bloque 1, 7
actividades) con un candado en la anulación de comprobantes. A0, hecha y en producción: migración `20261014161000` (en producción con la versión
`20261014161821` que anotó el MCP): `fijar_cierre_carga_inicial` deja la misma fecha en `cola_arranque_plazo`, y las tres tiendas quedaron con el
plazo de su carga inicial (TRU 18-oct, AQP 21-oct, LIM 31-oct; antes, 15-oct en las tres). ADR-0334, actualización del día.
Por qué así: la auditoría dio por hecho que la cola «se cerraba sola» el 15; leyendo la función, lo que vencía era el BOTÓN de cerrar en bloque (la
salida de emergencia para una prenda aún no cargada), mientras AQP y LIM siguen cargando hasta el 21 y el 31. La migración original ya preveía
unir las dos fechas. Reemplazo anclado, no `create or replace` desde el archivo: la función vive en producción (md5 idéntico al repo ese día), y así
no se pisa un parche vivo. Quitar la fecha (solo Admin) no toca el plazo: una cola sin tope sería una salida que nunca vence.
Felipe se lleva: el núcleo (stock = movimientos, venta = pagos = comprobante) está sano; lo que falla vive entre módulos y en el dato de origen
(69 % de las líneas vendidas sin prenda). Verificado: `pnpm pruebas:cierre-carga-inicial` 128/128 (casos 4d y 6c nuevos), `pnpm pruebas:cola-arranque`
53/53, la migración pegada dos veces en local sin cambiar nada la segunda, y en producción un `select` por sede devuelve la misma fecha en
`carga_inicial_hasta` y en `cola_arranque_plazo.hasta`. Siguen A1 (la baja de un comprobante anula la venta en el mismo acto) y A2–A6.

## 2026-10-14 (A1: dar de baja un comprobante anula la venta en el mismo acto)
Qué hice: `/api/lucode/anular` lee la venta que documenta una boleta o una factura y revisa ANTES de llamar a Lucode todo lo que `anular_venta`
va a exigir (caja abierta, mismo día de Lima, sin cambio ni devolución, módulo Devoluciones; `motivoParaNoAnularLaVenta`, pura y probada); si la
venta no se puede anular, la baja no se pide y manda a Devolución con nota de crédito. Tras guardar la baja, llama `anular_venta` con la misma
firma y el motivo «Comprobante B005-000202 dado de baja: …». Migración `20261014165000` (reemplazo anclado): un comprobante aceptado cuya baja
ya se pidió a SUNAT (en trámite) deja de sostener la venta; uno aceptado sin baja pedida sigue frenando. El modal lo explica antes de confirmar.
ADR-0016, actualización del día.
Por qué así: Felipe eligió la versión estricta («la anula en el mismo acto; si no se puede, se niega»): la baja ante SUNAT no se deshace, así que
o van juntas o no va ninguna. Una RPC compuesta en una sola transacción no alcanza porque Lucode va entre las dos escrituras; lo que sí se puede es
revisar todo antes y escribir todo después. Las guardas se repiten en la ruta con el mismo patrón que `motivoParaNoPedirBaja`.
Felipe se lleva: nunca más una venta completada sin comprobante vivo por esta puerta; «era factura» pasa a ser anular + volver a cobrar, coherente
en stock y caja. Verificado: `pnpm pruebas:anular-venta-comprobante` 12/12 (casos J y K nuevos; con el parche revertido dentro de la transacción,
K cae), 21 pruebas de `lib/anular-comprobante-reglas.test.ts`, `tsc` y `eslint` limpios, y en el navegador local: una boleta aceptada de una caja ya
cerrada responde 409 antes de Lucode («La caja de esta venta ya cerró…») y una de caja abierta pasa la revisión y recién ahí llama a Lucode. Queda
abierto el caso raro de SUNAT rechazando la baja después (venta anulada con comprobante vigente): lo detectará la invariante de la Fase 1.
Pendiente de aplicar en producción con OK de Felipe (la web no se publica antes que la migración).

## 2026-10-14 (A2: «¿Es alguna de estas?» en la hoja «Prenda sin registrar»)
Qué hice: con categoría, talla y color elegidos, la hoja muestra, antes de la descripción, las prendas del catálogo que coinciden y se
pueden cobrar ahora en esta tienda (`lib/prenda-sin-registrar-posibles.ts`, pura, 9 pruebas: por id de categoría y talla y por código de
color, nunca por el nombre; la misma definición de «posible» que `fn_candidatas_de_venta` y el mismo «cobrable» con que Vender deja entrar
una prenda al ticket). Tocar una (`ListaSugerencias`, la pieza única de lo sugerido, con `MiniaturaPrenda`) la mete al ticket como venta
normal y cierra la hoja; si no es ninguna, se sigue anotando como siempre. El catálogo de Vender trae ahora `tallaId` y `categoriaId`
(opcionales: una copia guardada antes no ofrece nada, nunca adivina). La guía interactiva de Vender lo cuenta en su paso.
Por qué así: sin RPC nueva —Vender ya tiene el catálogo y el stock en vivo de la sede— y por id, no por nombre (ADR-0290). Dos o tres
posibles se muestran todas: elegir por la persona sería adivinar (ADR-0334, decisión 9).
Felipe se lleva: la vía dominante del mostrador (69 % de las líneas) deja de ser un atajo ciego: si la prenda ya está en el sistema, se
cobra con su stock y su costo. Verificado: vitest entero (479 archivos, incluidos los candados de guías, foco, sugerir, unificar y tema),
`tsc` y `eslint` limpios; en el navegador local (Tienda Lima, «Camisas y Blusas · M · Negro») la hoja ofreció «Blusa Emma · 19 en el piso ·
S/ 79.90» y al tocarla la hoja se cerró y la línea entró al ticket con su stock; a 375 px la hoja no se desborda (página 375 px de ancho,
lista de 325 px).

## 2026-10-14 (A3: el precio de «Prenda sin registrar» con referencia)
Qué hice: con la categoría elegida, bajo el precio se lee cuánto cuestan sus prendas en el catálogo («Faldas en tu catálogo: de S/ 64.90 a
S/ 74.90»); si lo tecleado se sale de ese rango, aparece el aviso del sistema (`Aviso` de atención, la misma forma que el costo atípico de
Compras) con «Corregir el precio» y «Sí, cobré S/ 15.00», y «Agregar al ticket» espera esa confirmación, que vale para ESE precio (cambiarlo
la pide de nuevo). `lib/prenda-sin-registrar-precio.ts` (pura, 11 pruebas): con menos de 8 precios, de mínimo a máximo; desde 8, del
percentil 10 al 90, inclusivo; precio de esta tienda si lo tiene. Solo al anotar en Vender; al corregir, el precio es fijo. La guía de
Vender lo cuenta y las huellas de Vender y de Ventas sin registrar se aceptaron tras revisarlas.
Por qué así: Felipe aprobó «confirmación fuera de rango» (A3) y dejó el candado en `registrar_venta` (muy fuera → líder) para la Fase 1 con
el contador; aquí nada bloquea por la base, pide una decisión. Sin rojo: no es un error, es una pregunta. El rango sale del catálogo que
Vender ya tiene (sin consulta ni dato nuevo).
Felipe se lleva: un precio tecleado por error (15 en vez de 65) ya no entra en silencio; y la persona ve el rango ANTES de teclear.
Verificado: vitest entero en verde, `tsc` y `eslint` limpios; en el navegador local (Faldas · L · Coral): 15 avisa y deja «Agregar» apagado,
«Sí, cobré S/ 15.00» lo enciende y la hoja dice «Confirmado», 70 vuelve a la referencia sin aviso; a 375 px el aviso cabe (25–350 px) sin
desborde.

## 2026-10-14 (A5: la cola llega a quien vende)
Qué hice: bajo «Cobrar», el pie del ticket dice «Hoy N sin registrar · M por regularizar en tu tienda · Regularizar» (el enlace, de frase,
solo si la cuenta ve Existencias, donde vive la mesa; ADR-0306). Dos conteos por PostgREST sobre `prendas_por_regularizar` de la sede
(`useSinRegistrarDeHoy`: las vendidas hoy en hora de Lima sin las anuladas, y las pendientes), releídos tras cada venta como las ventas de
hoy; sin nada que decir, o sin poder leer, el pie no se dibuja. `lib/vender-sin-registrar-reglas.ts` (pura, 5 pruebas). La guía de Vender
lo cuenta en el paso del pie y la huella se aceptó tras revisarla.
Por qué así: la cola vivía en Existencias y en el «Te toca» del Inicio, que la terminal de ventas no ve (aterriza en el mostrador). Es la
versión mínima de «lo pendiente va a la persona» (auditoría, tema 7); la insignia global «Te toca» en la cabecera es de la Fase 3.
Felipe se lleva: quien vende ve cada día cuántas prendas entraron sin registrar y cuántas esperan, a un toque de la mesa. Verificado: vitest
entero en verde, `tsc` y `eslint` limpios; en el navegador local (Tienda Lima, con una venta de hoy sin registrar de fixture) el pie dice
«Hoy 1 sin registrar · 1 por regularizar en tu tienda · Regularizar» con el enlace a `/inventario/por-regularizar`.

## 2026-10-14 (A6: cerrar la cola en bloque exige un cuadre del piso)
Qué hice: migración `20261015004000` (reemplazo anclado a `cerrar_cola_arranque`): sin un cuadre del piso de la sede guardado después de la
última venta que se cierra, `cola_sin_cuadre` con la salida en el hint. La mesa de Ventas sin registrar lee el último cuadre de cada tienda
con pendientes (`getUltimoCuadrePorSede` sobre `fn_cuadre_piso_estado`) y, si falta, no ofrece el cierre y dice «primero cuadra el piso»
(`sedesParaCerrar` con `cuadres`, `faltaCuadre`). ADR-0334, actualización (b).
Por qué así: Felipe eligió la versión estricta: lo que sí está en el sistema queda cuadrado antes de dar el resto por perdido. Se mide con
`created_at` porque es lo único que la pantalla puede leer: base y pantalla dicen lo mismo. Los cuadres son inmutables (las pruebas insertan
uno viejo en vez de editarlo).
Felipe se lleva: cerrar en bloque deja de enterrar sin contar; TRU, AQP y LIM tienen que cuadrar el piso al menos una vez antes del 18, 21 y
31. Verificado: `pnpm pruebas:cola-arranque` 56/56 (3 casos nuevos), `lib/cola-arranque-reglas.test.ts` 33, `tsc` y vitest entero en verde;
en el navegador local la mesa muestra el aviso en vez del botón. **Pendiente de producción con OK de Felipe** (después de A1).
