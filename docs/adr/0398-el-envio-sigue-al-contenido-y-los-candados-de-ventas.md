# ADR-0398 · Ventas después de /chaos: el envío sigue a su contenido, el efectivo no baja de cero y los montos son de verdad

- **Fecha:** 2026-10-13 · **Estado:** construido y verificado en local (pruebas de base, vitest y re-ataque en el navegador). **Las nueve
  migraciones están en producción** (la primera a las 14:57 y las otras ocho el 2026-10-13 de noche, con las cuatro cajas cerradas; versiones
  `20261014025824` a `20261014030230`). Rama `claude/chaos-skill-all-screens-5c56e1`, PR #1054.
- **Pedido:** Felipe, 2026-10-13, después de la corrida de `/chaos` en todo el ERP: «Arregla todo lo que está por arreglar en ese módulo
  [Ventas] y no pares hasta que termines, tiene que quedar todo cubierto».
- **Decisiones de Felipe (2026-10-13):** la base bloquea el efectivo negativo; boleta con DNI de 8 dígitos y factura con RUC de 11, en la
  pantalla y en la base; el vuelto máximo es S/ 500.
- **Complementa:** ADR-0356 (`/chaos`), ADR-0190 (el doble clic y el token), ADR-0063/0210 (la cola sin conexión), ADR-0136 (movimiento de
  modales), ADR-0186 (arqueo ciego), ADR-0288 (reemplazos anclados y el SQL Editor), ADR-0195 (partes y candados al pegar).

## 1. El envío sigue a su contenido (el problema más grave)

Cada pantalla que guarda manda un `p_token` para que un doble toque o un reintento no guarde dos veces: la función busca el token y, si ya
existe, devuelve lo que guardó. Pero solo miraba el TOKEN. Tras una respuesta perdida, la vendedora sacaba una prenda del ticket (o elegía
otro apartado) y volvía a cobrar con la misma marca: la base devolvía la venta VIEJA y la pantalla anunciaba la NUEVA. Y al revés: una marca
nueva tras una respuesta perdida puede cobrar dos veces.

**La regla:** la marca va atada a la HUELLA de lo que se manda, en los dos lados.

- **Base** (`20261013200000`, `…201000`): `intentos_con_token(operacion, token, huella)` guarda la huella (md5 de todos los parámetros menos el
  token) la primera vez que llega un token. El mismo token con la misma huella es un reintento de verdad; con otra, `token_reusado`. Lo
  llaman las once funciones de Ventas y Caja con token (registrar_venta, entregar_separacion, registrar_movimiento_caja,
  registrar_ingreso_caja, registrar_gasto, separar_prendas, separar_pedido_para_apartar, abonar_separacion, editar_separacion,
  enviar_pedido_para_apartar, registrar_cambio). `fn_resolver_intento(op, token)` dice si un envío llegó (`hecho`, con lo que guardó) o no
  (`no_llego`). Un «no llegó» deja una marca y es definitivo: si ese envío aparece después, se rechaza (`intento_descartado`). Si el envío
  todavía está guardando, el resolver espera a que termine (choca con la misma llave) y responde lo que de verdad pasó.
- **Web:** `lib/intento-reglas.ts` (pura) y `lib/useIntento.ts`. La marca se renueva solo cuando cambia lo que se manda. Una ráfaga de clics no
  manda dos veces (freno síncrono). Si la respuesta no trae veredicto (un corte, un 502), la pantalla queda **en duda**: los campos se
  congelan (`fieldset.campos-congelables`), la hoja no se cierra, y hay dos salidas: reenviar LO MISMO o «Revisar si se guardó».
  Un «no» que llega después de una duda se le pregunta a la base antes de soltar el formulario (pudo venir de antes de mirar la marca).
- **Vender:** el cobro en duda tapa la caja (`CobroEnDuda`). El cobro en curso se anota en el almacén de la sede antes de mandarlo y, si la
  página se recarga o se cierra, al volver se resuelve (solo los de más de 20 s: uno más nuevo puede venir de otra pestaña). Lo que se puede
  encolar sin conexión se encola con la misma marca, como antes; el canje del club, la pieza de liquidación y lo que deja una prenda en 0 no
  se encolan y quedan en duda (antes se ofrecía «sácala del ticket y cobra», el camino exacto del hueco). Una sola declaración a SUNAT por
  venta en la pestaña (`primeraVez`).
- **Lo vigila:** `pruebas:token-sigue-al-contenido` (33 casos, con controles y concurrencia) y la guardiana de `intento-reglas.test.ts`:
  toda pantalla que llama a una de esas funciones usa `useIntento` (la deuda, con su motivo: `GastosPanel` de Finanzas y `PasePedido` de
  Traslados, que van con el `/chaos` de su módulo). La guardiana lee el código sin comentarios y cuenta también la llamada que elige el
  nombre con un ternario: hasta el 2026-10-13 solo veía `rpc("registrar_gasto"` y se le escapaba **Registrar gasto** (el formulario
  completo que Caja abre desde el gasto rápido, `RegistrarGastoModal`), que ya usa `useIntento` para el gasto. Su activo fijo
  (`registrar_activo`, solo Finanzas) sigue con una marca por apertura porque la base aún no compara su contenido: deuda declarada
  (`TOKEN_FIJO_TODAVIA`).

**Descartado:** comparar el contenido solo en la web. Un cliente viejo (una pestaña sin recargar, la cola sin conexión de una versión
anterior) seguiría mandando la marca vieja con otro contenido; la base es la única que ve todos los caminos.

## 2. El efectivo de una caja abierta nunca queda bajo cero

`fn_exigir_efectivo_en_caja` recalcula el esperado con la misma cuenta que `cerrar_caja` y rechaza con `efectivo_insuficiente` si queda
bajo cero (la cifra solo para quien cierra la caja: el arqueo ciego). La llaman **disparadores de restricción diferidos** (`20261013203000`)
en cada forma de sacar plata: egresos, reembolsos en efectivo, vueltos de cambios, ventas anuladas y pagos corregidos. Diferidos porque
así corren al confirmar, cuando la operación ya tomó todos sus candados: el candado por caja que toman es el último (sin bloqueos mutuos), y
miran el resultado final (corregir un pago borra e inserta).

**Lo que cambia para la tienda:** anular o corregir una venta en efectivo cuya plata ya se depositó queda bloqueado. Es correcto: esa
plata ya no está en el cajón; se resuelve con una devolución por otro medio.

## 3. Montos de verdad, el vuelto con tope y el reembolso válido

`'NaN'::numeric` es mayor que cualquier número y `'Infinity'` existe desde Postgres 14: los dos pasaban los CHECK `>= 0`. Candados
`*_montos_finitos` (`abs(x) < 'Infinity'`) en las quince tablas de dinero de Ventas y Caja; el «recibido» con tope de vuelto de S/ 500;
el reembolso de una devolución ≥ 0, con uno de los cinco medios y con medio si hay plata (`20261013204000`). Las funciones dicen qué
corregir antes de que el candado rebote (`20261013205000`, `fn_monto_valido`). `cerrar_caja` con lo contado en blanco ya no cierra.

## 4. El documento del comprobante, la búsqueda, la nota de venta y los candados menores

- Boleta con DNI de 8 dígitos y factura con RUC de 11 (`20261013210000`): en `emitir_comprobante` y en un disparador de respaldo, solo
  para boleta y factura (no un CHECK: no traba la cola de reintento de una boleta vieja). En la pantalla, el cobro dice cuántos dígitos faltan.
- La búsqueda de Cambios, Devoluciones e Historial ya no se cae con un texto de miles de caracteres ni con un número de comprobante de más
  de 9 dígitos (`MAX_LARGO_BUSQUEDA`, `parsearComprobante`).
- La hoja de cobro solo ofrece los comprobantes que la sede tiene con serie.
- Apartados y proformas (`20261013211000`): un celular sin dígitos, una proforma vencida al nacer y una proforma marcada con otra venta se
  rechazan.
- `anular_venta` sigue la regla de las otras puertas sobre una venta cobrada (`20261013195000`).

## Cómo se pega en producción

Una parte por llamada, en orden, **con todas las cajas cerradas** (los disparadores y los alter toman candados breves; una caja abierta en
negativo se revisa antes: el 2026-10-13 no había ninguna). Antes de cada parte: las anclas y los md5 (verificados el 2026-10-13: mismas
cuentas en local y en producción; `emitir_comprobante` tiene CRLF en producción, por eso su ancla es de una línea). Después: md5 «después»,
`pg_constraint.convalidated` y `pg_trigger`. Al final, el volcado y `pnpm datos:generar:produccion` / `pnpm datos:comparar`.

**Hecho el 2026-10-13.** Antes de pegar, las 19 anclas aparecían en producción exactamente las veces esperadas (aunque otras sesiones
habían pegado ese día Finanzas y Producción). Después de cada parte: md5 de `fn_intento_con_huella` y `fn_resolver_intento` idéntico al
local; las once funciones con su llamada a la huella una sola vez; los 5 disparadores diferidos activos; los 20 CHECK validados contra todas
las filas (ninguna vieja los viola); las guardas y el disparador del documento en su lugar. El volcado se refrescó por diferencia (las 1 358
huellas coinciden con producción) y `datos:comparar` no encontró ninguna pantalla que llame a algo que producción no acepte.

## Lo que queda fuera (va con el `/chaos` de cada módulo)

- El mismo patrón de token en Finanzas, Producción, Inventario y Compras.
- `NaN` en Producción, Finanzas, Catálogo y Clientes (`fn_monto_valido` ya queda lista).
- INV-14 (recibir y anular la misma factura de proveedor a la vez).
- `intentos_con_token` crece una fila por escritura con token: la purga a los 90 días queda en el backlog.
