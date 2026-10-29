# ADR-0558 — La mercadería de CLAURE en Lima es consignación: no es de CAYLA en el Balance y lo que se le debe nace al vender

- **Fecha:** 2026-10-28 · **Decidió:** Felipe · **Estado:** aceptada; la migración `20261028212000_balance_mercaderia_de_claure_en_consignacion.sql` **no está en producción** (la pega Felipe, una sola parte, **antes de cerrar octubre**).
- **Relacionados:** ADR-0542 (el stock de Lima se parte por dueño), ADR-0463 (empresas CAYLA y CLAURE), ADR-0532 (lo vendido por empresa; «la liquidación, a costo, es otra cosa»), ADR-0198 (el Balance no se dibuja si un chequeo que bloquea no cuadra), ADR-0195 (Finanzas), ADR-0408 (pedidos web en Finanzas).

## El problema

`fn_bal_stock` —la mitad «stock × costo» de la cuenta 201 y la «Mercadería» de cada tienda— sumaba `retail.stock` entero y no miraba `stock_dueno`. El diario (`fn_asientos`), en cambio, **nunca asentó la entrada de esa mercadería** (la 201 sube solo con una factura de mercadería vigente) y **sí asentaba su venta** (Cr 201 al costo sellado). La comprobación de la 201 (`fn_conciliacion_contable`) a la 201 no le acepta ninguna diferencia, y el Balance no se dibuja si un chequeo que bloquea queda en «no cuadra» (`apps/web/lib/balance-reglas.ts`, ADR-0198). Cada unidad de CLAURE que entra a Tienda LIM sin factura de CAYLA, y cada una que se vende, aparta las dos mitades de la 201.

Con las unidades de una prenda de CLAURE: entrada de X al costo, vendido S ⇒ el stock sube X − S y el diario baja S: diferencia −X, «otras entradas sin asiento». **Corregir solo `fn_bal_stock` no arregla el Balance:** si CLAURE sale del stock pero su venta sigue bajando la 201 del diario, la diferencia pasa a −S y queda «sin explicar». Las dos mitades van en pareja.

## La pregunta de negocio y lo que Felipe decidió

«Si una prenda de CLAURE en Tienda LIM no se vende, ¿quién pierde?» → **CLAURE se la lleva de vuelta; CAYLA solo le paga, a costo, lo que vende** (consignación). Lo que CAYLA le debe a CLAURE nace **al vender, no al recibir**. Los textos del repo ya apuntaban ahí (ADR-0542 llama «dueño» a CLAURE; ADR-0532: «lo que CAYLA le debe a CLAURE es la liquidación, a costo»), pero nadie lo había dicho con esas palabras.

## Decisión

DECIDÍ: la mercadería de CLAURE en Lima **no es de CAYLA**: sale de la 201 y de la «Mercadería» de Tienda LIM, y lo vendido de ella (a su costo sellado en la venta) queda como **deuda en una cuenta propia, la 4699 «Por liquidar a CLAURE»**.

- **Una regla de lectura, en un solo lugar.** `fn_dueno_del_movimiento(empresa_id, ubicacion_id, variante_id)`: el dueño escrito en el movimiento; si no hay (movimiento anterior al libro de ADR-0542) y la sede tiene dos empresas, el de la ficha; si no, la casa. Es la misma regla que `fn_dueno_de_la_linea` (ADR-0542), por movimiento en vez de por línea vendida.
- **El diario no se reescribe: se le une una reclasificación.** `fn_asientos_claure` (uso interno, se une a `fn_asientos` con una sola línea, el patrón de `fn_asientos_pedidos_web`) devuelve a la 201 el Cr/Dr que la regla de siempre hizo para una línea de otro dueño y lo lleva a la 4699: venta (Dr 201 / Cr 4699), anulación vendible y devolución (Cr 201 / Dr 4699, la deuda baja) y merma (Dr 201 / Cr 4699). La utilidad no cambia: el costo de lo vendido (691) y la merma (6951) siguen siendo el gasto de CAYLA. Cada asiento nuevo cuadra solo.
- **`fn_bal_stock` resta lo ajeno:** `stock_dueno` de hoy menos lo que se movió después del corte con dueño ajeno (el mismo cálculo de `despues`), y una venta web sin entregar de otro dueño no se resta dos veces. `fn_bal_causas_mercaderia` deja fuera los movimientos de otro dueño (no son de CAYLA, no se explican contra su 201).
- **Los cambios van fuera del texto de los parches de pedidos web** (`20261015053000` y `20261015115000`), porque su prueba (`pnpm pruebas:pedidos-web-anular`) exige que se puedan volver a pegar después. El primer intento (una ancla dentro de `vendido_web`) duplicaba un CTE al volver a pegarlas: lo atrapó la regresión.
- **Web:** rótulos de la 4699 y de las cuatro reglas nuevas del diario, y una nota bajo la línea del Balance: «lo vendido de la mercadería de CLAURE, a su costo: los pagos a CLAURE todavía no se registran, por ahora solo sube» (como el IGV).

DESCARTÉ:
- **(a) La mercadería de CLAURE es de CAYLA, con una deuda por liquidar al recibir.** Habría dejado `fn_bal_stock` como está, pero exige asentar Dr 201 / Cr deuda por cada entrada (un asiento nuevo sin papel que lo respalde, o que CLAURE facture cada entrada), hace que CAYLA cargue con lo que no se vende —que no es el trato— y obliga a que el valor de inventario de Existencias incluya a CLAURE para coincidir con el Balance.
- **Solo corregir `fn_bal_stock`.** Deja el Balance bloqueado (la venta de CLAURE sigue bajando la 201), ver arriba.
- **Un «puente»: aceptar la diferencia de CLAURE como una nota que no bloquea.** Dejaría de lado la deuda con CLAURE (el Balance ocultaría un pasivo real) y obligaría a parchar `fn_conciliacion_contable` (la 201 no admite diferencias aceptadas).
- **Modificar las cinco reglas del diario (venta, anulación, devolución, cambio, merma) para que se partan por dueño.** Cinco ediciones sobre la función más parchada del sistema. Una función auxiliar que se une con una línea cambia menos.
- **Una categoría de gasto «Liquidación a CLAURE»** para registrar el pago: sumaría al total de gastos del mes y daría crédito de IGV (ver «Lo que falta»).

SE ROMPE SI:
- **Una migración vuelve a definir ENTERA `fn_asientos` o `fn_bal_stock`** después de esta: pierde el enganche o la resta, y la 201 vuelve a desfasarse. La prueba nueva lo vería (`pnpm pruebas:balance-claure`, y su autoprueba deshace una mitad para comprobar que la propiedad se rompe).
- **Un cambio (de talla/prenda) involucra una prenda de CLAURE:** su ajuste de costo mezcla dos prendas y no se reclasifica. La 201 saldrá «sin explicar» por ese monto: se ve, no se calla.
- **Un pedido web con una prenda de CLAURE:** hasta entregarse, su dueño se lee de la ficha (todavía no hay movimiento con dueño). Si la ficha dice CLAURE y las unidades que saldrán son de CAYLA (o al revés), la 201 se desfasa hasta la entrega.
- **Octubre se cierra antes de pegar esto.** El diario de un mes cerrado se congela (`diario_cerrado`): sin las reclasificaciones congeladas dentro, la 201 de todos los Balances siguientes quedaría desfasada por lo vendido de CLAURE en octubre. Es el único motivo de urgencia: **se pega antes del 4-nov**.
- **El pago a CLAURE se registra con un gasto o un movimiento de dinero que no sabe de la 4699:** aparece como diferencia en la comprobación de caja o bancos, y la 4699 nunca baja.

## Lo que falta (decisión de Felipe y del contador)

1. **La liquidación: el PAGO a CLAURE.** La 4699 sube con lo que se vende y todavía no baja. Hace falta una forma de registrar «le pagué S/ X a CLAURE» que baje la 4699 sin pasar por Gastos (inflaría el total de gastos y daría IGV). Es la siguiente pieza.
2. **Quién responde por una prenda de CLAURE que se pierde o se daña en Lima.** Hoy la merma sigue siendo gasto de CAYLA y se le debe a CLAURE (no cambia el Estado de Resultados). Si CLAURE asume esas pérdidas, se cambia `claure_merma`.
3. **Para el contador:** (a) ¿CLAURE es tercero (cuenta 46) o relacionada (47)? 4699 es provisional. (b) La consignación frente a SUNAT: CAYLA vende con su boleta y reconoce el ingreso completo (como hoy), pero ¿quién factura a quién el costo, y hay crédito fiscal por él? No se decidió ni se tocó.
4. **El cambio de una prenda de CLAURE** (arriba) y **el pedido web de CLAURE** (arriba), si se vuelven comunes.
5. **Existencias:** su valor de inventario a costo debe separar a CLAURE y NO sumarlo al total de CAYLA para coincidir con la Mercadería del Balance (la separación ya diseñada en esa rama coincide con esta decisión).

## Verificación

- **`pnpm pruebas:balance-claure` — 16/16** (Postgres local, cada caso en ROLLBACK, con las migraciones de ADR-0542 y esta aplicadas dentro): entrar mercadería de CLAURE no mueve la mercadería de CAYLA ni las causas de la 201; venta + anulación + devolución + merma de CLAURE mueven la mercadería del Balance exactamente lo mismo que la 201 del diario (Δ = 0), y la 4699 suma S/ 60 como se calcula a mano; un corte pasado devuelve lo mismo antes y después; Trujillo y una venta de CAYLA en Lima no generan reclasificaciones; cada asiento nuevo cuadra solo; **tres autopruebas** deshacen una mitad del arreglo y la propiedad se rompe (la prueba no está ciega); pegar dos veces no cambia la huella; permisos (de uso interno).
- **Regresión con la migración aplicada dentro de cada prueba existente** (un `--import` que la inyecta tras el `begin;` de cada transacción): `balance`, `estado-resultados`, `perdidas`, `cierre-mes`, `pedidos-web-anular` (29/29), `pedidos-web-entregar` (28/28), `finanzas-alcance-coherente`, `resumen-finanzas`, `reversa-de-cobro-por-su-cuenta` (28/28) y `roles-cobertura-modulos` (32/32): todas en verde. La primera vuelta falló en `pedidos-web-anular` y `pedidos-web-entregar` (re-pegar los parches viejos duplicaba `anulado_web`); se corrigió moviendo el cambio de sitio y ambas pasan.
- Web: `balance-reglas.test.ts` y `resultados-reglas.test.ts` (63 casos) en verde. La suite completa de `apps/web` no se pudo correr limpia en este worktree (sin `node_modules` propio; con el del repo principal fallan 58 archivos por paquetes que no están: `zod/v4`, `@sentry/nextjs`, `@cayla-retail/shared/*`, ninguno de Finanzas).
- Verificadores de migraciones: sin `drop trigger`, sin choque de `pg_temp`, versión reservada y sin repetir.
- **No verificado:** producción. La sesión que hizo esto no tiene acceso al proyecto `cayla-dynamic` (el conector de Supabase solo ve otra organización), así que **no se midió cuántas unidades ni soles de CLAURE cuenta hoy la 201**, ni si `stock_dueno` ya está pegada (la migración aborta con un mensaje si falta). Las consultas de solo lectura para medirlo están en la nota de la sesión. Tampoco se probó un pedido web con CLAURE ni un cambio con CLAURE.
