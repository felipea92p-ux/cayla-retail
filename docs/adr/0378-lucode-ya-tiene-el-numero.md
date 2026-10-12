# ADR-0378 — Cuando Lucode ya tiene el número: confirmar con su XML, no reintentar para siempre

- **Fecha:** 2026-10-12 · **Estado:** construido y verificado en local (pruebas, más el ERP en el navegador contra un Lucode falso). **Solo
  web, sin migración:** entra a producción al fusionar el PR.
- **Pedido:** Felipe vio en Comprobantes «50 comprobantes llevan más de 1 hora sin llegar a SUNAT. El reintento automático no alcanzó:
  revisa el error» y preguntó por qué. Con la causa a la vista: «Hazlo… es algo alarmante ese mensaje y tiene que estar lo más pulido
  posible. Verifica que esté bien cubierto de extremo a extremo».

## El problema (producción, solo lectura, 2026-10-12)

Producción ya declara a SUNAT real (`entorno_transmision = 'produccion'`). En «Por enviar» había 53 comprobantes:

| Cuántos | Error | Qué era |
|---|---|---|
| 41 (B004 y B005, 9 al 11-oct) | `rechazado_por_lucode: ERROR: La boleta B005-262 fue emitido anteriormente.` | Lucode ya tenía esa boleta |
| 11 (B005, 11-oct) | `sin_respuesta: Lucode no respondió a tiempo` | cortes de tiempo, un solo intento |
| 1 (B005-273) | nunca intentado | se quedó sin enviar; su plazo vencía el mismo 12-oct |

La cadena: al cobrar, el ERP manda la boleta y espera **15 s** (`lib/lucode.ts`). Esos días SUNAT estuvo lenta (B005-261 volvió PENDIENTE y
la aceptó media hora después): el ERP dejaba de esperar y anotaba «no respondió», **pero Lucode sí la emitía**. El reintento la volvía a
mandar, Lucode contestaba «fue emitido anteriormente» y el ERP lo trataba como un rechazo común: a la cola, para siempre (hasta 21
intentos). Lo confirman los números: en B005 las atascadas (262…365) están **intercaladas** con 76 aceptadas del mismo rango; un
correlativo roto fallaría todo de un número en adelante, no una sí y otra no.

Dos cosas lo empeoraban:

1. **El barrido toma los 3 más viejos.** Las 41 atascadas volvían a estar vencidas cada 2 h y se llevaban los 3 lugares de cada pasada; las 11
   de verdad pendientes tenían un solo intento en 14 horas y B005-273 nunca tuvo uno. En producción el trabajo programado no transmite
   (`cronNoTransmite`), así que la cola solo avanza cuando alguien cobra o abre Comprobantes.
2. **«Más de 1 hora» se medía desde el último intento**, no desde la emisión (`fn_comprobantes_cola_reintento.horas_esperando`). Una boleta
   que se reintenta cada 15 minutos nunca llegaba a la hora aunque llevara días, y una con un problema de verdad entraba y salía del aviso.

## Decisión

1. **«Fue emitido anteriormente» no es un rechazo: es Lucode diciendo que ya tiene ese número.** `transmitirComprobante` lo reconoce
   (`esYaEmitido`, que exige que el número nombrado sea el nuestro) y, en vez de encolarlo, llama a `lib/resolver-ya-emitido.ts`, que:
   - pregunta el estado (`/api/v3/status`) — **solo lee, nunca reenvía**;
   - baja el **XML firmado** que devuelve Lucode (solo de `https://*.apisunat.pe` o del mismo origen en uso; 10 s, 2 MB) y lo **compara con el
     comprobante**: tipo (raíz UBL y código 03/01), serie-número, fecha de emisión, moneda, total al céntimo, cliente (código del catálogo 06 y
     número, con la misma regla del envío: `clienteParaLucode`) y cuántas líneas se declararon;
   - **si es el nuestro**, guarda lo que dice SUNAT por la RPC de siempre (`actualizar_transmision_comprobante`): ACEPTADO → `aceptado`,
     RECHAZADO → `rechazado` con su motivo, PENDIENTE → `enviado` (lo sigue la consulta del barrido, `20261007200000`). La respuesta guardada
     conserva la forma que leen las pantallas y deja el rastro `ya_emitido: { aviso_lucode, verificado_con_xml: true, consultado_at }`;
   - **si es otro documento con nuestro número**, NO se marca nada como declarado: queda en la cola como `numero_ocupado: <lo distinto>` y va
     al log (`capturarError`, sin datos del cliente). Reintentar no lo arregla; lo decide una persona;
   - **si no se pudo confirmar** (Lucode no respondió al consultar, dijo que no lo tiene, el XML no llegó o no se pudo leer), queda en la cola
     como `ya_emitido: …` y se vuelve a confirmar en la próxima pasada.
2. **La cola lo dice en palabras de tienda** (`errorDeColaLegible`, `queHacerConElError`): «Lucode ya la tiene: falta confirmar que es esta
   venta y traer su estado» / «Ese número ya lo usa otro documento en Lucode, con otro total (S/ 99.90 en Lucode, S/ 45.00 aquí)…» y qué
   hacer. Las 41 filas viejas, anotadas como rechazo, se leen así desde el primer día, sin esperar a su próxima pasada.
3. **El aviso cuenta desde la emisión.** `getPorEnviar` reemplaza las horas de la RPC por las horas desde `created_at` (si esa lectura falla,
   quedan las de la RPC). Sin migración: la RPC sigue igual para quien la use.
4. **Comprobantes vacía la cola al abrirse** (`vaciarColaSunat`): repite la pasada de 3 mientras haya trabajo, hasta 10 (30 comprobantes),
   refrescando la lista tras cada una. Para sola: en la primera pasada vacía, si Lucode no responde o no acepta la clave (insistir no lo
   levanta), o si la persona se va. No hay bucle posible: lo que falla vuelve con su espera (≥ 15 min) y lo tomado sin enviar queda reservado
   5 min. Vender, después de cobrar, sigue con una sola pasada.
5. **Cada pasada del servidor tiene un presupuesto de 30 s** (`PRESUPUESTO_MS` en `/api/lucode/reintentar`): un «ya emitido» suma dos
   lecturas, y con Lucode lento tres podrían pasar de los 60 s de Vercel. No se empieza otro comprobante pasado el presupuesto: cortar ENTRE
   comprobantes nunca deja uno a medias.
6. **Pulido de la pantalla:** «Reintentar ahora» refresca la fila también cuando falla (antes mostraba el error viejo y un intento menos), y a
   375 px el estado y el error de cada fila bajan a su propia línea (se cortaban por la derecha).

## Lo que se descartó

- **Marcar «aceptado» con solo consultar el estado.** Rápido, pero si el número lo usó otro documento (alguien emitió desde el panel de
  Lucode, otra base con la misma serie: ya pasó el 2026-09-22 con 2 boletas de prueba a SUNAT real), el ERP daría por declarada una venta que
  no lo está. La regla de la casa es la de `consulta-sunat-reglas.ts`: ante la duda no se escribe.
- **Subir el tiempo de espera de 15 s.** Reduce la causa pero no la elimina (SUNAT puede tardar más), deja a la caja esperando y no arregla
  las 41 que ya estaban atascadas.
- **Una migración** (que `fn_tomar_comprobantes_para_reintento` salte los «ya emitido», o que la RPC devuelva la fecha de emisión). Cambio de
  esquema en producción para algo que la web resuelve sola; queda como mejora si algún día hace falta.
- **Que el trabajo programado transmita en producción** para que la cola avance de noche. Es la decisión de «salir en vivo» que `cronNoTransmite`
  guarda a propósito: es de Felipe, no de este arreglo.

## Cómo se verificó

- **Pruebas** (`pnpm --filter web test`): `ya-emitido-reglas.test.ts` (detección, lectura del XML con la forma real —firma, emisor antes que el
  cliente, CDATA— y cada diferencia), `resolver-ya-emitido.test.ts` (de punta a punta por `transmitirComprobante` real, con Lucode y la base
  falsos: un solo envío y nunca un reenvío, aceptado/en trámite/rechazado, número ocupado, Lucode caído, Lucode que se contradice, XML ilegible
  o en una dirección ajena —ni se descarga—, un `rechazado` que no se encola, y lo que no cambia), `envio-sunat.test.ts` (el barrido en varias
  pasadas y cuándo para) y los textos de la cola en `transmision-reglas.test.ts`. El lector de XML se probó además contra el XML **real** de
  una boleta de producción (B005-263): lo lee y coincide; ese XML no entra al repo, que es público.
- **En el navegador, contra un Lucode falso** (`scripts/pruebas/lucode_falso.mjs`, que imita `/documents`, `/status` y el XML; `lib/lucode.ts`
  solo acepta `LUCODE_URL_LOCAL` con `next dev` y hacia localhost). Base local con foto antes y restaurada después (`estado.mjs`). Cuatro
  boletas armadas como las de producción (10 intentos con «fue emitido anteriormente», 3 h de antigüedad, y una nunca intentada). Al abrir
  Comprobantes como líder, en dos pasadas y ~6 s: la que Lucode tenía aceptada quedó `aceptado`, la que tenía en trámite quedó `enviado` y
  después, cuando el falso la aceptó, la consulta del barrido la pasó a `aceptado`; la que Lucode tenía con **otro total y otras líneas** quedó
  en la cola como número ocupado, sin entorno ni estado de SUNAT; la nunca intentada se envió normal. Cada «ya emitido» recibió **un solo**
  envío (el registro del falso lo cuenta). El aviso pasó a contar solo lo real. «Reintentar ahora» sobre la del número ocupado: 409, intento
  anotado, aviso con la diferencia y la fila refrescada. A 375 px en oscuro y en escritorio en claro.

## Qué queda para Felipe

- **Producción hoy:** al fusionar, la primera persona que abra Comprobantes vacía la cola (hasta 30 por visita). Las 11 `sin_respuesta` se
  reintentan como siempre. **B005-273** (nunca intentada) vencía su plazo el 12-oct: «Enviar ahora» en Por enviar.
- **Si aparece un «número ocupado»:** es real y grave (esa venta no está declarada). Se revisa en el panel de Lucode de quién es ese número;
  emitir la venta con otro número es una decisión tuya.
- **Que el trabajo programado transmita en producción** (para que la cola avance sin nadie mirando): decisión pendiente, ver «Lo que se descartó».
