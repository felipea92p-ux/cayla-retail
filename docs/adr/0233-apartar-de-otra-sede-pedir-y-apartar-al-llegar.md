# ADR-0233 — Apartar de otra sede: pedir el traslado y apartar al llegar

**Fecha:** 2026-09-26
**Estado:** Aprobado por Felipe el 2026-09-26 («pedir traslado y apartar al llegar»).
**Afecta:** migración `20260927140000_apartados_pedido_otra_sede.sql` (tabla `separacion_pedidos`, cinco funciones y un
disparador sobre `transferencias`). Web: `ApartarVista` («Pedir a AQP para apartar»), `TodosVista` («Pedidos entre
tiendas»), `ModalesApartado` (`PedirOtraSedeModal`, `EnviarPedidoModal`, `CancelarPedidoModal`) y la opción `otra_sede`.
**Sigue a:** ADR-0232 («Lo que NO entró»).

## El problema

La clienta está en TRU y la prenda que quiere solo queda en AQP. La vendedora coordinaba con la otra tienda por fuera,
y cuando la prenda llegaba nadie sabía para quién era: a veces la vendía otra caja.

## Decisión

1. **TRU pide** la prenda a AQP con el nombre y el celular de la clienta (`pedir_prenda_para_apartar`). La base
   comprueba que AQP la tenga disponible, pero no se la reserva todavía: ese era el otro camino, que cambiaba cómo
   despacha Traslados.
2. **AQP la envía** desde su «Todos» con un toque (`enviar_pedido_para_apartar`). Es el traslado de siempre
   (`iniciar_traslado`), con la clienta en la nota: Traslados no cambia.
3. **Al cerrar el traslado en TRU, la prenda queda guardada sola** para la clienta durante 3 días. Lo hace un disparador
   sobre `transferencias` que llama a `apartar_stock` en el almacén donde entró. Si falla, el traslado se cierra igual y
   el pedido queda «llegó» para hacerlo a mano.
4. **Cuando la clienta deja su adelanto** (`separar_pedido_para_apartar`), todo pasa en una sola transacción: se suelta
   esa reserva, la prenda pasa al piso (`mover_interno`) y se aparta con `separar_prendas`, como cualquier apartado
   (boleta de anticipo, estante, plazo). No queda ninguna ventana en que otra caja pueda venderla.
5. Cualquiera de las dos tiendas puede cancelar antes del adelanto. Si la prenda ya había llegado, se suelta la reserva.

**Qué se paga:** mientras la prenda viaja, la clienta no tiene boleta de anticipo, que es el costo de este camino, y
AQP no la tiene reservada. Si la vende entre el pedido y el envío, el envío falla con el mensaje de stock de siempre.

## Cómo se verifica

`pnpm pruebas:separaciones` **77/77**: pedir no toca el stock de la otra tienda; al cerrar el traslado queda guardada
en el almacén; con el adelanto se suelta la reserva, pasa al piso y queda un apartado con estante (los invariantes dan
0); no se pide lo que la otra tienda no tiene; cancelar suelta la reserva; sin el módulo no se pide. En la pantalla:
escanear una prenda agotada aquí → «Pedir a AQP para apartar»; en Todos, «Pedidos entre tiendas» con «Enviar» (la otra
tienda) y «Apartar con adelanto» (al llegar).
