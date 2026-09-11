# ADR-0033 — La venta sin red se guarda en el navegador y sube sola

**Fecha:** 2026-09-11
**Estado:** Construido y verificado en local (kong apagado/reencendido a mano).
Addendum "Paso 3.1" del mismo día, más abajo: cierra el agujero de la venta
huérfana cuando la caja cierra antes de que la venta suba.
**Deriva de:** ADR-0013 §C (decisión de negocio de Felipe: vender offline solo con
stock de sobra) y ADR-0032 (el token que hace segura la subida).

## Contexto

ADR-0018 dejó explícito que la venta offline (Fase 3 de local-first) **no queda
resuelta** por el diseño de lecturas replicadas: escrituras sin arbitraje pueden dejar
el stock en negativo si dos sedes venden offline la misma última unidad, y eso rompe
el principio 2 (cero estados inconsistentes). ADR-0013 §C ya había decidido la regla
de negocio — vender offline solo si queda stock de sobra — pero dejó el umbral exacto
y la experiencia de bloqueo pendientes de construir.

Este ADR es esa construcción: qué pasa en el navegador cuando `registrar_venta` no
llega al servidor.

## Decisión

**DECIDÍ:** una segunda cola de escrituras, entera en el navegador (`localStorage`,
`lib/ventas-offline.ts`), que:

1. **Detecta el corte de red por la forma del error**, no por `navigator.onLine`
   a secas — ese flag no ve un Kong caído con wifi arriba. `esFalloDeRed()`
   (`lib/error-escritura.ts`) reusa la MISMA lista de huellas de `fetch` que ya
   traducía errores de escritura (`SIN_RED`), para no mantener dos copias de la
   misma señal.
2. **Aplica el umbral de ADR-0013 §C ANTES de encolar, nunca después:**
   `stockAqui - cantidad >= 1`, sobre el `stockAqui` que la Encargada está viendo en
   pantalla — que ya incluye lo que la cola local comprometió. Si no pasa, se bloquea
   y no se guarda nada.
3. **Descuenta en pantalla lo que la cola ya vendió** (`conStockComprometidoDescontado`,
   un overlay sobre las `variantes` que llegan por props desde el servidor). Sin esto,
   una segunda venta offline de la misma prenda vería el stock de ANTES de la primera
   venta, y las dos podrían pasar el umbral por separado aunque juntas sobrevendan.
4. **Sube sola** con el mismo trío que ya usa la sincronización del panel: al montar,
   al recibir el evento `online`, y con un latido de 30 s por si el navegador nunca
   dispara ese evento. Cada venta sube con su `p_token` (ADR-0032): si el servidor ya
   la había recibido y solo se cortó la respuesta, `registrar_venta` la devuelve sin
   duplicarla.
5. **Un rechazo real del servidor no se descarta.** Si al subir la caja ya se cerró o
   el permiso cambió, la venta **se queda en la cola** —borrarla perdería una venta ya
   cobrada— y se muestra con su motivo traducido, para que alguien la resuelva a mano.

**DESCARTÉ** que el umbral se evaluara con el `stockAqui` crudo que manda el server
component. Sin el overlay, dos ventas seguidas de la última unidad de una prenda
pasarían las dos el chequeo por separado — es exactamente la sobreventa que el umbral
existe para evitar.

**DESCARTÉ** reintentar automáticamente un rechazo del servidor sin que alguien lo
revise: una caja cerrada no se reabre sola, y reintentar a ciegas solo repetiría el
mismo rechazo en cada latido sin decir nada útil.

**DESCARTÉ** un servicio de sincronización o una librería (PouchDB, Dexie, una cola
con reintentos exponenciales) — es una sola tabla append-only (la cola) con como
mucho un puñado de filas a la vez (3 tiendas, no 300), y el trío mount/online/latido
ya cubre "¿puede que ahora sí funcione?" sin necesitar backoff.

## Por qué el umbral vive en el navegador, y por qué eso no lo hace fuente de verdad

Es una pregunta razonable: si `movimientos` es la única fuente de verdad (principio
4), ¿por qué hay una regla de negocio evaluándose en el cliente?

**Porque el navegador es la única parte del sistema que sabe, en ese instante, que
está sin red.** El servidor no puede aplicar el umbral por la sede que se desconectó
— no tiene forma de enterarse hasta que la red vuelve, y para entonces la decisión de
vender o no ya se tuvo que tomar en el mostrador, con la clienta ahí. No es una
elección de dónde nos gustaría que viviera la regla: es la única ubicación donde la
información que la regla necesita (¿hay red ahora mismo?) existe.

**Y aun así no es fuente de verdad, en el sentido que importa:** el navegador nunca
decide que una venta EXISTE. Decide, como mucho, que una venta se guarda localmente
para reintentar. La fila real en `ventas` —la que mueve `stock` de verdad— la sigue
creando `registrar_venta` en Postgres, con sus mismos candados (`puede_operar_sede`,
`cajas.estado`, el `check` de `stock_cantidad_no_negativa`). Si dos sedes lograran
sobrevender offline la misma unidad a pesar del umbral (una carrera improbable pero no
imposible: dos Encargadas, dos redes cortadas, el mismo instante), el servidor sigue
siendo quien arbitra al subir — una de las dos ventas se aceptará y la otra reventará
contra el `check`, no silenciosamente. El umbral en el navegador reduce cuándo eso
puede pasar (principio 2, "diseña para que no se necesite código de más"); no
reemplaza la red de seguridad que ya existe en el esquema.

## Lo que NO entra en este ADR

- **Inventario offline** (recepción, traslados, ajustes) — cada uno tiene su propia
  superficie de sobreventa/estado imposible y su propia decisión de negocio pendiente.
- **Caja offline** (abrir/cerrar) — abrir dos cajas de la misma sede sin coordinación
  es otro estado imposible (principio 2) que este ADR no resuelve.
- **Facturación sin red.** Una venta encolada localmente no tiene `venta_id` real
  todavía, así que no hay nada que facturar hasta que suba. La pantalla lo dice en el
  acuse de la venta offline: "No se puede emitir comprobante para esta venta hasta que
  suba."

## Consecuencias

- Tres archivos nuevos/tocados: `lib/ventas-offline.ts` (puro, 11 pruebas),
  `esFalloDeRed()` en `lib/error-escritura.ts`, y `CajaPanel.tsx` +
  `RegistrarVentaModal.tsx` para el trío de sincronización y el flujo de venta.
- Verificado a mano en local apagando y encendiendo el contenedor de Kong
  (`docker stop/start supabase_kong_cayla-retail`): con Kong abajo, el panel abre con
  el aviso; una venta de 4 sobre un stock de 5 se encola y muestra el acuse offline;
  un segundo intento sobre la última unidad se bloquea con el texto del umbral y NO se
  encola; al reencender Kong y disparar el evento `online`, la venta sube sola, el
  stock en Postgres queda en 1 (no en -3 ni duplicado), hay una sola fila en `ventas` y
  una sola en `movimientos`, y el `token_cliente` guardado coincide con el de la cola.
- **Se rompe si** algún día se agrega otra restricción única a `ventas` además de
  `token_cliente` — la misma advertencia que ya deja ADR-0032 sobre la rama
  `unique_violation` de `registrar_venta` aplica igual acá, porque la cola depende de
  ese mismo contrato.
- **Deuda anotada, no de este cambio:** si una venta queda rechazada en la cola (caja
  cerrada mientras tanto) no hay botón para descartarla a mano ni para reintentarla
  fuera del latido de 30 s — hoy solo se ve el motivo. Vuelve a la mesa si en la
  práctica aparece un caso real.

## Addendum — Paso 3.1: la venta ya no queda huérfana si la caja cierra antes de subir (2026-09-11, misma tarde)

**El agujero.** La primera versión de este ADR indexaba la cola por `cajaId`, y
`CajaPanel` solo sondeaba/subía mientras ESA caja seguía abierta — apenas cerraba, el
componente dejaba de mirar su cola para siempre. Si la red no volvía antes del cierre
(la Encargada se va a su casa, o alguien cierra la caja sin saber que hay algo
pendiente), la venta quedaba atrapada en `localStorage` sin que ningún código volviera
a intentarlo. Es plata ya cobrada que el sistema deja de saber que existe — el
principio 9 ("nunca pierde datos") roto en silencio.

**DECIDÍ, entre dos caminos con costos distintos:**

1. ~~Bloquear "Cerrar caja" si hay algo pendiente.~~ **DESCARTÉ.** Es peor que el
   problema que resuelve: si la red no vuelve esa noche, la Encargada no podría cerrar
   e irse a su casa — castiga el caso normal (cerrar) por el caso raro (algo sin
   subir), justo el escenario para el que se construyó toda esta cola.
2. **La cola deja de estar atada a "mientras esta caja siga abierta" — pasa a ser por
   SEDE, no por caja.** `obtenerColaSede()` reemplaza a `obtenerCola(cajaId)`; el trío
   mount/`online`/latido corre siempre que la pantalla de venta esté montada, tenga o
   no la sede una caja abierta ahora mismo. Cada `VentaEncolada` sigue llevando su
   propio `cajaId` (el de cuando se vendió) — subirla no exige que esa caja siga
   abierta, la RPC decide sola si la acepta.

No relajé `registrar_venta`: sigue rechazando de plano una caja que no está `abierta`
(ADR-0032, a propósito). El problema de fondo no era permiso, era visibilidad — una
venta rechazada ahora se ve y se explica en el mismo lugar (la cola de rechazos),
tanto en la pantalla de "caja abierta" como en la de "caja cerrada": los avisos se
movieron arriba de esa bifurcación en `CajaPanel.tsx` a propósito.

**Se sumó, además, el aviso en `CerrarCajaModal`.** `retail.cerrar_caja` solo suma
`ventas.metodo_pago = 'efectivo'` que YA está en la base para calcular el "esperado" —
una venta en efectivo atrapada en la cola no entra en ese cálculo todavía, así que el
conteo físico (que SÍ tiene ese billete, la clienta ya pagó) se iba a leer como un
sobrante que no es un error de nadie. `totalEfectivoEncolado()` calcula el monto y el
modal lo muestra ANTES de que la Encargada cuente, con la aclaración de que puede
cerrar igual.

**Verificado en local, con Postgres real (no mocks), en dos pasadas** porque a mitad
de la primera el stack local de Supabase se reinició solo y perdió todos los datos
(`cajas`/`ventas`/`movimientos`/`stock` en cero — causa no confirmada, probablemente
ajena a este cambio; se resolvió con `npx supabase db reset`):

1. Con Kong apagado, se vendió 1 unidad dejando 1 de sobra (pasa el umbral) →
   quedó en la cola.
2. Se cerró la caja **directamente en la base** (simulando que se cerró por otra vía
   mientras la venta seguía sin subir — el caso real que este addendum cubre) sin
   tocar el navegador, para que la carrera no dependiera de cronometrar clicks.
3. Al recargar la pantalla de venta (ahora "caja cerrada"): apareció "Subiendo 1 venta
   guardada sin conexión…" y luego "Una venta guardada sin conexión no pudo subir:
   Esta caja ya está cerrada — no se pueden registrar más ventas ahí" — en la vista
   de caja CERRADA, que antes de este addendum no mostraba nada. La venta siguió en
   `localStorage`, no se perdió.
4. Se abrió una caja NUEVA de la misma sede: el buscador de la venta mostró `stock 1`
   (no 2) — el overlay de stock comprometido sobrevivió el cierre de la caja que
   generó la venta pendiente, protegiendo la unidad también bajo la caja nueva.
5. Antes del reinicio de datos también se vio el aviso de `CerrarCajaModal` render
   correctamente: "Hay S/89.90 en efectivo de ventas guardadas sin conexión que
   todavía no subieron…".

**Hallazgo aparte, no de este cambio pero vale dejarlo escrito:** una recarga completa
de la pantalla MIENTRAS el servidor está caído no funciona — el server component
también habla con Supabase a través de Kong, así que sin servidor la navegación entera
falla con la pantalla de error genérica ("El sistema no pudo arrancar"), no con la
cola. La cola offline protege una venta que se corta A MITAD de un envío con la
pantalla ya cargada; no convierte la app en algo que arranca sin servidor — eso sigue
siendo la Fase 2 de local-first (ADR-0018), explícitamente no construida.

**Se rompe si:** se agrega alguna vez una segunda pantalla que también lea/escriba
`cayla:cola-ventas` sin pasar por `lib/ventas-offline.ts` — hoy `CajaPanel` es el único
lugar que sincroniza, y cualquier otro punto de escritura directa a `localStorage`
podría pisar una venta a mitad de subir.

## Addendum 2 — "Descartar": la salida para un rechazo que nunca se va a resolver solo (2026-09-11, misma tarde)

El Paso 3.1 dejó una deuda anotada: una venta rechazada para siempre (la caja que la
generó nunca vuelve a existir "abierta") se reintentaba cada 30 s sin parar, mostrando
el mismo aviso rojo indefinidamente, sin ninguna salida más que borrar `localStorage`
a mano desde la consola del navegador.

**DECIDÍ:** un botón "Descartar" por venta rechazada, con confirmación de dos pasos
(nunca un solo click) que dice EXPLÍCITAMENTE lo que la acción no hace: no registra la
venta, no corrige el stock, no deja ningún rastro en el servidor — porque la fila
nunca llegó a existir en `ventas` (el rechazo pasó antes de eso, no hay nada que
revertir ahí). Solo saca la entrada de la cola local. El texto de confirmación incluye
el monto y le recuerda a quien lo lee que, si la prenda de verdad salió de la tienda,
tiene que anotarlo a mano — la responsabilidad de reconciliar pasa explícitamente a
una persona, no desaparece silenciosa.

**DESCARTÉ** un registro de auditoría en el servidor ("venta descartada", con su
propia tabla o columna) — habría sido un cambio de esquema para resolver lo que hoy es
un problema de visibilidad, no de datos: no hay ninguna fila del lado del servidor que
recuperar o marcar, porque el rechazo pasó ANTES del insert. Si en la práctica esto se
usa seguido y hace falta rastrear qué se descartó y por qué, ahí sí se vuelve a la
mesa con Felipe — no se adivina hoy.

**Verificado en local, con Postgres real:** venta encolada, caja cerrada directo en la
base (mismo método del Addendum 1, para no depender de cronometrar contra un servidor
real), reload → apareció el rechazo con "Descartar". Clic en "Cancelar" dejó la cola
intacta (seguía con 1 venta). Clic en "Descartar" → "Sí, descartar" mostró el monto
correcto (S/70.00) en la confirmación y, al confirmar, vació la cola y el aviso
desapareció sin dejar ningún error.
