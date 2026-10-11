# ADR-0049 — El ticket en espera vive en el navegador, por sede, y el mismo almacén servirá a la cola offline

**Fecha:** 2026-09-14
**Estado:** Aplicado (`feat/pos-ticket-progresivo`, commits `147e849`, `a0561b4`, `b8d72ec`). Sin
migración: no toca la base.
**Afecta:** `apps/web/lib/almacen-local.ts` (nuevo, puro, 9 tests), `PuntoDeVenta.tsx`
(estado `enEspera`, `dejarEnEspera`, `retomar`, vaciado al cerrar caja), `PuntoDeVentaTicket.tsx`
(momento «espera»), `lib/vender-reglas.ts` (`MomentoTicket` suma «espera»).

## Contexto

Si una clienta va a probarse otra talla, la caja quedaba tomada: el ticket a medio armar no
tenía dónde esperar. SAP lo llama Park/Resume, Xstore Suspend. Felipe pidió resolverlo
**sin tabla**: es estado del mostrador, no de la venta, y la base no tiene por qué saber
de tickets que todavía no existen. Y pidió hacerlo «bien desde el inicio» porque la cola
offline (BACKLOG, principio 9) va a necesitar exactamente el mismo almacén.

## Decisión

1. **`localStorage`, con una llave por sede y por uso:** `cayla:vender:<ubicacionId>:<nombre>`
   (`claveLocal`). Dos tiendas en el mismo navegador no se pisan; «en-espera» hoy, «cola»
   mañana, sobre el mismo módulo.
2. **El módulo nunca rompe una venta.** `leer` devuelve el valor por defecto si no hay
   nada, si el JSON está roto o si el storage no se puede tocar (modo privado, cookies
   bloqueadas); `guardar` devuelve `false` en vez de lanzar (cuota llena); en el servidor
   todo es inerte (`typeof window`). Está fijado con tests, incluido el storage que lanza.
3. **Se carga después de montar, nunca durante el render.** El servidor no tiene
   `localStorage`: leerlo en el render dejaría el HTML del servidor (`[]`) distinto del
   primero del navegador — desincronización de hidratación. El `useEffect` de carga lleva
   el `eslint-disable` de `react-hooks/set-state-in-effect` con el motivo escrito, la misma
   decisión que el BACKLOG registró el 2026-09-10 para la cola. El vaciado al cerrar caja
   usa el otro patrón que documenta React (ajuste durante el render con «previo +
   comparación») y el efecto solo borra la llave.
4. **Qué se guarda:** `{ id, creadoEn, carrito, nota, codigoDescuento }`. El descuento por
   línea ya viaja dentro de `carrito`; el formulario de % no se guarda (es un borrador).
5. **Reglas del mostrador (decisiones de Felipe):** tope de **5** por sede — el sexto avisa por
   `avisar.error`; **retomar intercambia** si el ticket actual tiene líneas (el actual ocupa
   el lugar del retomado); **al cerrar caja se vacía** la espera de esa sede (un ticket de
   ayer no sobrevive a la caja de hoy; también al abrir la página con caja cerrada).
6. **No reserva stock.** Al retomar, la pantalla compara con el stock que conoce
   (`variantes`, refrescado tras cada venta) y avisa por nombre si algo ya no alcanza, sin
   bloquear. Al cobrar, la base tiene la última palabra; si rechaza por stock (su mensaje
   no trae el nombre), el padre deduce la prenda culpable comparando el ticket con
   `variantes` y la nombra — si no la encuentra (otra caja vendió la última unidad hace un
   segundo), queda el mensaje genérico traducido.

Se descartó: una tabla `tickets_en_espera` (estado de mostrador, no de negocio; la
sincronización entre navegadores no se pidió y traería su propia limpieza); `sessionStorage`
(no sobrevive a cerrar la pestaña, y el recojo del sábado sí); reservar stock al dejar en
espera (crearía movimientos fantasma o un segundo inventario paralelo).

## Consecuencias

- La espera es **por navegador**: dos cajas de la misma sede en dos computadoras no ven
  los tickets de la otra. Es lo esperado hoy (una caja por sede); si cambia, es la tabla.
- Limpiar datos del navegador borra la espera. Aceptable: nada de valor fiscal vive ahí.
- La cola offline hereda llave, encoding y la regla de «nunca lanzar»: cuando llegue, solo
  cambia `nombre`.

## Verificación

- `almacen-local.test.ts` 9/9; `vender-reglas.test.ts` con el momento «espera»; suite
  183/183; `tsc` y `eslint` limpios (el único disable, documentado).
- Navegador, con sesión real: 2 prendas + nota → Dejar en espera (vacío, escáner enfocado,
  chip «En espera · 1», storage con 2 prendas y la nota) → venta intermedia cobrada → Retomar
  (mismas líneas, nota y total; storage vacío) → recarga (el chip sobrevive) → intercambio
  con un ticket actual de 1 prenda → tope: con 5, el sexto avisa y el actual conserva su
  línea; la lista muestra hora en 24 h, prendas, total y nota → **cerrar caja** (con el OK
  de Felipe): chip fuera y llave borrada.

## Actualización 2026-10-11 — al cambiar de sede, el ticket queda en espera en SU sede (Felipe)

**El problema.** El selector de sede de la cabecera cambia la sede con `router.refresh()`: la ruta no cambia y React conserva el
estado de todo componente cliente cuya `key` siga igual. Vender montaba `PuntoDeVenta` con la misma key en todas las sedes
(`"caja"`), así que el ticket armado en Lima (prendas, cliente, nota, medio de pago y comprobante elegidos) quedaba entero en la
caja de Trujillo, con «Confirmar cobro» encendido. Reproducido en local: el ticket de Lima apareció en Trujillo con «Stock: 0»
en rojo y el botón activo. La base valida el stock de Trujillo al cobrar, pero si esas prendas también estaban allí, la venta, el
dinero y la boleta quedaban en la sede equivocada. La espera ya era por sede (su llave lleva la sede); el ticket activo, no.

**La decisión (Felipe, entre vaciarlo, preguntar antes de cambiar o conservarlo):** la caja de la sede nueva arranca vacía y el
ticket que se deja queda **en la espera de su sede**, con el nombre «Al cambiar de sede» (o «Al cambiar de sede 2», si ya hay
uno con ese nombre). Un aviso dice «El ticket de Tienda Lima quedó en espera en esa tienda». Al volver, se retoma como cualquier
ticket en espera (con los precios de ese momento, punto 5).

- Se guarda lo mismo que guarda «Dejar en espera»: prendas (con su descuento adentro), nota y cliente. El medio de pago y el
  comprobante elegidos no, como nunca los guardó la espera.
- **Entra aunque la sede ya tenga sus 5 en espera** (punto del tope): el tope frena a quien deja OTRO ticket en el mostrador;
  aquí nadie lo eligió, y perder un ticket armado es peor que uno de más en la tira.
- **Una proforma en cobro no se guarda** como ticket suelto: sigue vigente en Proformas y se cobra desde ahí; como ticket
  suelto perdería el vínculo y se cobraría como una venta nueva.
- **Salir de Vender** (a Caja, a Apartados, o elegir «Toda la empresa») sigue perdiendo el ticket como siempre: la regla es
  solo para el cambio de sede con Vender a la vista. También cubre la recarga que trae la sede que eligió otra pestaña.

**Cómo está hecho.** `vender/page.tsx` monta el Punto de venta con `key={claveDelPuntoDeVenta({ ubicacionId, … })}` (la sede
primero: otra sede, otro montaje) dentro de `<TicketPorSede ubicacionId>` (`components/punto-de-venta/TicketPorSede.tsx`), que
NO lleva key y por eso sobrevive al cambio. El Punto de venta le reporta su ticket en un efecto cada vez que cambia; cuando la
sede cambia, `TicketPorSede` escribe el ticket de la anterior en `claveLocal(<sede anterior>, "en-espera")`. Guarda un ticket
por sede y no uno solo: los efectos del hijo nuevo corren antes que el del padre, y el ticket vacío de la sede nueva pisaría el
de la que se deja. La regla es pura en `lib/vender-cambio-de-sede.ts`, con su prueba (`vender-cambio-de-sede.test.ts`, que
además falla si la página vuelve a montar el Punto de venta sin la sede en la key).

**Descartado:** vaciar el ticket a secas (quien cambia de sede por error pierde todo sin aviso); preguntar antes de cambiar
(una pregunta más cada vez y un puente entre la cabecera y Vender, y aun así hay que decidir qué pasa al confirmar); avisar
desde el selector con un evento antes de cambiar (no cubre la recarga que trae la sede de otra pestaña).
