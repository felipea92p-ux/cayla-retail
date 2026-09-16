# ADR-0063 — Vuelve la venta sin red: la cola offline, adaptada a V2

**Fecha:** 2026-09-16
**Estado:** Construido y verificado en local — con una salvedad de entorno, ver
"Verificación" antes de dar por probado el camino feliz completo.
**Afecta:** `lib/ventas-offline.ts` (nuevo, puro, 19 tests), `lib/error-escritura.ts`
(`esFalloDeRed` exportado), `components/PuntoDeVenta.tsx` (estado `cola`, overlay de
stock, trío de sincronización, bifurcación de `cobrar()`), `components/PuntoDeVentaColaOffline.tsx`
(nuevo).
**Deriva de:** ADR-0036 (V1, 2026-09-11 — el diseño original; se borró en el corte
V1→V2, `0af2f1b`, sin estar mal) y sus dos addendums del mismo día ("por sede" y
"Descartar"); ADR-0013 §C (Felipe: vender offline solo con stock de sobra); ADR-0049
(`lib/almacen-local.ts`, que ya reservó la llave `"cola"` para esto exactamente);
ADR-0032/0033 (el contrato de `p_token` que hace segura la subida).

## Contexto

BACKLOG.md lo marcaba como el ítem más grande pendiente: el POS de V2 no tiene ninguna
resiliencia sin internet, regresión contra V1. Si se corta la red en TRU/AQP/LIM a mitad
de una venta, la Encargada ve un error, la clienta está pagando en el mostrador, y la
venta se pierde o se anota en papel — contradice el principio 9 de `CLAUDE.md`.

V1 ya lo había resuelto por completo (ADR-0036), pero tres cosas cambiaron desde
entonces y el diseño no se pudo copiar tal cual:

1. `registrar_venta` pasó de 5 a 11 parámetros (piso/almacén, descuento con motivo y
   escalonado, código, nota, comprobante+clienta).
2. El stock ahora es piso+almacén por sububicación (`lib/stock-por-sede.ts`), no la
   columna plana que V1 leía — el umbral de sobra (ADR-0013 §C) tiene que evaluarse
   sobre el PISO, que es lo que una venta descuenta.
3. `lib/almacen-local.ts` (ADR-0049, 2026-09-14) ya es el módulo reutilizable para
   `localStorage` por sede que V1 armaba a mano — `claveLocal(ubicacionId, "cola")`
   estaba reservado en su propio comentario de cabecera exactamente para esto.

## Decisión

**DECIDÍ** recuperar el diseño de V1 (el overlay de stock comprometido, el umbral de
sobra, la cola por sede que sobrevive el cierre de caja, "Descartar" con confirmación
de dos pasos) y adaptarlo:

1. `lib/ventas-offline.ts` guarda el **payload completo** de `registrar_venta`
   (`ParamsRegistrarVenta`, los 11 parámetros de hoy) por venta encolada, y lo reenvía
   tal cual al subir — no se recalcula desde el carrito, que puede haber cambiado.
2. El overlay (`conStockComprometidoDescontado`) se aplica en `PuntoDeVenta.tsx` sobre
   `variantes` **antes** de derivar catálogo, búsqueda y grilla — así toda la pantalla
   ve el mismo stock, no solo el chequeo del umbral en `cobrar()`.
3. `esFalloDeRed()` vive en `lib/error-escritura.ts` (reusa `SIN_RED`, la misma lista de
   huellas que ya traducía errores de escritura) — no se duplica la lista, como
   proponía el BACKLOG.
4. El trío de sincronización (mount / evento `online` / latido de 30 s) vive en
   `PuntoDeVenta.tsx`, corre tenga o no la sede una caja abierta (addendum "por sede" de
   V1: una venta ya cobrada no se pierde porque alguien cerró caja antes de que subiera).

**Dos correcciones sobre el diseño original, encontradas probando esta sesión (no
existían en V1 o no se habían notado):**

- **Mutex en el trío de sincronización.** Probando en el navegador con Kong real (no
  simulado) apareció DOS VECES la misma venta como intento de red (`read_network_requests`
  mostró dos `POST .../rpc/registrar_venta` con 26 ms de diferencia, ambos con 409) — el
  mount, el evento `online` y el latido pueden solaparse (y React Strict Mode, en
  desarrollo, invoca efectos dos veces), y dos llamadas paralelas con el mismo `p_token`
  chocan en la numeración del comprobante en vez de deduplicarse limpio. Un mutex
  (`subidaEnCursoRef`, una promesa compartida) asegura que cualquier disparo mientras hay
  una pasada en curso espera esa MISMA pasada en vez de lanzar otra.
- **Una venta rechazada no compromete stock en pantalla.** `stockComprometido` original
  sumaba TODAS las ventas de la cola, incluidas las rechazadas — pero una venta
  rechazada por el servidor no existe (`registrar_venta` revierte la transacción entera
  al fallar), así que seguir descontándola dejaba la pantalla mostrando menos stock del
  que en realidad hay, pudiendo bloquear una venta válida por un fantasma. Se corrigió
  para excluir `rechazo !== null` del overlay (sí se sigue excluyendo de
  `totalEfectivoEncolado`, que ya lo hacía bien desde el primer borrador).

**DESCARTÉ** integrar `totalEfectivoEncolado()` al "esperado" de `CerrarCajaModalV2`
(la cuarta pieza que BACKLOG sugería sobre el patrón de ADR-0052/0053) — `lib/caja.ts` y
la UI de Caja las tiene otra sesión en paralelo (instrucción explícita del encargo de
esta sesión). La función ya está exportada y lista para que esa integración la use.

**DESCARTÉ** la ficha de clienta (`p_cliente_id`, el onceavo parámetro) — preguntado a
Felipe con `AskUserQuestion`: "el campo ya está pero aún no tengo contemplado el
almacenar clientes en mi sistema". Ni la pantalla de consulta aparte ni la integración
al cobro se construyen esta sesión; queda en BACKLOG como decisión más temprana de lo
que se pensaba (ni siquiera está decidido SI se van a guardar clientas todavía).

## Consecuencias

- Cinco archivos nuevos/tocados: `lib/ventas-offline.ts`, su test, `lib/error-escritura.ts`
  (aditivo), `components/PuntoDeVenta.tsx`, `components/PuntoDeVentaColaOffline.tsx`.
- `vitest` 258/258, `tsc` y `eslint` limpios sobre los archivos tocados.
- **Se rompe si** se agrega una segunda pantalla que lea/escriba
  `cayla:vender:<sede>:cola` sin pasar por `lib/almacen-local.ts` — mismo riesgo que ya
  dejó escrito ADR-0049 para "en-espera".
- **Deuda anotada, no de este cambio:** el "esperado" de `CerrarCajaModalV2` todavía no
  suma el efectivo encolado sin subir (`totalEfectivoEncolado()` ya existe, falta
  quien la use); un rechazo transitorio (ej. una carrera de numeración de comprobante,
  ver más abajo) se trata igual que uno permanente (solo "Descartar", sin reintento
  automático) — aceptable por ahora porque nunca hubo una fila real que perder, pero si
  en la práctica aparece seguido, vale la pena distinguirlos.

## Verificación

**Lo que SÍ se verificó en el navegador, con Postgres real (Kong nunca se tocó — apagarlo
habría cortado a las otras ~27 worktrees que comparten el mismo stack):** la red se
simuló interceptando `window.fetch` solo para `/rpc/registrar_venta` (un `TypeError`
como el que produce un corte real), nunca tocando infraestructura compartida.

- Como Micaela (Trujillo): cobrar con la red "cortada" encola la venta, muestra el
  modal "Venta guardada sin conexión" (sin comprobante, con el aviso correcto) y el
  banner persistente "1 venta guardada sin conexión… no cierres esta pestaña" — visible
  tanto con caja abierta como cerrada.
- Restaurada la red y disparado el evento `online`: la cola se reintenta sola.
- Un rechazo REAL del servidor (dos casos distintos aparecieron solos durante la prueba,
  ver abajo) se traduce, queda con "Descartar" (confirmación de dos pasos: "¿Seguro?" /
  "Sí, descartar" / "Cancelar"), y descartar vacía la cola sin dejar rastro.
- El fix del mutex: confirmado con `read_network_requests` que un mismo token pasó de
  disparar 2 POST reales a disparar exactamente 1.

**Lo que NO se pudo demostrar de punta a punta: una subida exitosa real ("sube sola" →
desaparece de la cola → aparece en "Ventas de hoy").** A mitad de la verificación,
`retail.stock` quedó con **las 96 filas en `sububicacion_id = NULL`** en las tres sedes
(`sububicaciones` conserva sus 6 filas intactas — no es que falte el catálogo de
sububicaciones, es que ninguna fila de stock apunta a una) — probablemente un reseed de
`stock` desde otra de las worktrees que comparten este mismo Postgres local, sin su
backfill de piso/almacén. Con eso, **toda** venta (offline o en vivo, con o sin este
cambio) se rechaza con "Stock insuficiente: hay 0…", incluso vendiendo el ítem
"Monto manual" (`ID_CARGO_ESPECIAL`), que no debería depender de sububicación. Los dos
rechazos reales que sí se vieron y sirvieron para probar "Descartar" (`comprobante ya
usado` de la carrera sin mutex, y este `stock insuficiente`) son session de esa misma
causa ambiental, no de la lógica de la cola. Queda anotado en BITACORA — no es una
migración ni una decisión de esquema, así que no amerita frenar y preguntar, pero sí
avisar: quien retome esto (o cualquier sesión que use este Postgres local) puede
toparse con el mismo síntoma hasta que alguien corra el backfill de sububicación sobre
`stock`.
