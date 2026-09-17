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
