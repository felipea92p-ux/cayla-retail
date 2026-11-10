# ADR-0624 — La regla pareja del IGV: lo que cobras de IGV es de SUNAT, y Ganancias lo resta siempre

- Estado: construido en la rama `claude/excluir-igv-compras-66846a`, **sin aplicar en producción**. Decisión de Felipe, 2026-11-07.
- Reemplaza en parte: ADR-0620 (el «IGV que dice el líder»). Conserva de ADR-0620 el arranque del Balance contra el crédito y el grupo «Saldo a favor de IGV».
- Migración: `supabase/migrations/20261107174000_igv_de_las_ventas_regla_pareja.sql`.
- Pruebas: `pnpm pruebas:igv-ventas` (26 casos), `apps/web/lib/igv-ventas-reglas.test.ts`, `apps/web/lib/igv-ventas-uso.test.ts`, los casos «lo cobrado y el IGV de tus ventas» de
  `lib/estados-ganancias.test.ts` y «cascadaGanamos con lo cobrado» de `lib/ganamos-reglas.test.ts`, y las frases de saldo a favor de `lib/impuestos-cuenta-reglas.test.ts`.
- Relacionados: ADR-0453 (sueldos estimados, que siguen), ADR-0433 (el costo de la carga inicial trae IGV), ADR-0417 d.2 (corregir ese costo), ADR-0618 (arranque del Balance).

## El problema primero

ADR-0620 dejó que el líder dijera «este mes pago S/ X de IGV» y Ganancias restaba solo eso. Octubre no paga IGV porque hay saldo a favor, así que con 0 dicho
Ganancias leía las ventas con IGV casi enteras como ganancia. Pero ese mismo IGV ya estaba contado en otro lado, dos veces:

1. **El saldo a favor ya está en el Balance.** El arranque (20261107035000) pone la 4011 = 41,878 a favor y sube el capital (50) por eso. Cuando una venta usa
   ese saldo, el IGV de la venta se lo come: el saldo baja. Si además Ganancias lo cuenta como ganancia, la misma plata sube el patrimonio por el capital y
   otra vez por el resultado.
2. **El costo de la carga inicial trae IGV** (ADR-0433). Ese IGV de las compras es parte del saldo a favor (lo descuenta SUNAT) y a la vez pesa como costo.

Restar 0 no arreglaba el segundo y empeoraba el primero.

## La decisión (Felipe, 2026-11-07)

**Regla pareja:** el IGV que cobras es de SUNAT; el que SUNAT te descuenta (compra con factura) no es costo, y el de una boleta o una compra informal sí.

- **Ganancias y pérdidas resta SIEMPRE todo el IGV de las ventas.** El resultado vuelve a ser el del libro (ventas sin IGV − costos), más los sueldos estimados
  de ADR-0453. Ya no hay «estimado», «dicho» ni «mixto», ni avisos de «el líder todavía no dijo», ni fila «Según el libro»: es una sola cifra.
- **Mientras haya saldo a favor, el IGV no sale de la caja: se descuenta de ese saldo.** Eso lo dice Impuestos, en la frase de «Pagas»: «No pagas IGV: tu saldo
  a favor bajó S/ 20,157 y te quedan S/ 41,878.» (`lib/impuestos-cuenta-reglas.ts`, con lo que el panel ya trae). Dice «bajó» y no «usaste»: el IGV de las
  compras del mes lo vuelve a subir, y «usaste» sería falso en un mes con compras con factura.
- **Lo cobrado con IGV se ve como PRESENTACIÓN, no como otra cifra.** En el informe y en la cascada de Ganancias, arriba:
  «Vendiste con IGV» (133,922.31 en octubre) → «IGV de tus ventas» (se resta, 20,501.26, sin peso ni barrita) → «Lo que vendiste» (113,421.05, el 100 %) → mercadería → … → resultado.
  El detalle del IGV lleva a Impuestos con la misma sede y el mismo mes. Primero se llamó «Cobraste»; tras /formidable (2026-11-07) Felipe pidió la recomendación y quedó
  «Vendiste con IGV»: es venta, no la plata que entró, que Caja y el Flujo llaman «cobrado».
  Los pesos siguen contra lo vendido sin IGV; el chip contra el mes de antes compara siempre (misma base). Si no se pudo leer el IGV de las ventas, esas dos filas
  no se dibujan y la pantalla queda como antes, sin aviso: el resultado no depende del IGV, así que no hay mezcla de bases posible.
- **El Flujo de caja** vuelve a leer el resultado del libro, sin capa ni aviso.

## Ejemplo de una prenda

Se compra con factura a 100 + 18 de IGV y se vende a 200 + 36.

| Lectura | Cuenta | Resultado |
|---|---|---|
| Libro hoy (costo de la carga inicial con IGV) | 200 − 118 | **82** |
| Vista de ayer (ADR-0620, IGV dicho 0) | 236 − 0 − 118 | **118** |
| Regla pareja (cuando el costo vaya neto, entrega 2) | 200 − 100 | **100** |

Lo correcto es 100: los 36 son de SUNAT (se pagan, o se descuentan del saldo a favor que formaron los 18), y los 18 no son costo porque SUNAT los descuenta.
La vista de ayer contaba los 18 como costo y los 36 como ganancia a la vez. Esta entrega deja Ganancias en 82 para las prendas de la carga inicial (lo del libro);
la entrega 2 lleva ese costo a 100.

## Lo que se va de ADR-0620

`decir_igv_del_mes`, `fn_igv_de_gestion` y, si sigue vacía (0 filas en producción, medido el 2026-11-07), `retail.igv_del_mes` con su disparador,
`fn_igv_del_mes_candado` y `fn_exigir_igv_mes_abierto`. Si la tabla tuviera filas, la migración la deja y avisa: no se borran datos. En la web: el modal
`DecirIgvDelMesModal`, el botón «Decir/Cambiar IGV del mes» de Impuestos, `igv-del-mes-reglas`, `sugerencias-igv-del-mes`, `igv-gestion(-reglas)`, el punto hueco
«estimado» de la línea de meses, `mismaBaseDeIgv`, «Utilidad bruta de gestión», «Resultado de gestión», los rótulos «según el libro» y su paso de la guía.

## Lo que se queda de ADR-0620

- El arranque contra el crédito (20261107035000, ya en producción) y su suite `pruebas:arranque-igv`.
- En el Balance, la 4011 a favor va en su grupo «Saldo a favor de IGV», fuera de «plata y cobros»: SUNAT no la paga en efectivo (commit 59c6a7521).
- La nota de ADR-0618 y, de main, ADR-0621 (`ventaDelMes` en la nota de Ganancias).

## Cómo funciona

`fn_igv_de_las_ventas(desde, hasta)` devuelve por mes y unidad el IGV incluido en las ventas del rango, con la misma regla de la 4011 que tenía `fn_igv_de_gestion`
(venta = haber, anulación = −debe, devolución y cambio = haber − debe, sin adelantos), leyendo `fn_diario` solo del rango. Mismos permisos que el diario. La web
(`lib/igv-ventas.ts` → `lib/igv-ventas-reglas.ts`) suma por columna (CAYLA todas, «De la empresa» las sin tienda, una tienda la suya) y lo deja en `FilaER.igvCobrado`,
que no entra a ninguna suma. Se llama `igvCobrado` y no `igvVentas` porque `fn_estado_resultados` ya trae `igv_ventas`, que cuenta también los adelantos.

## Lo que queda para la entrega 2 (cuando el contador confirme las facturas)

- Corregir el costo de la carga inicial con las facturas que el contador confirme (con rastro, `costo_correcciones`; mueve el 591 del arranque, ADR-0618).
- El freno `venta_descuento_bajo_costo`: comparar el precio sin IGV contra el costo neto.
- Las prendas sin registrar de octubre no se tocan.
- Las puertas del Taller y los gastos: el IGV con factura no es costo; el de boleta o informal, sí.
- En esta entrega no se tocan costos, `variantes`, `venta_items`, `registrar_venta` ni `fn_asientos`.

## Actualización 2026-11-09: lo vendido de CLAURE se ve, con su línea (Felipe)

**El problema:** «Vendiste con IGV» sumaba `ventas + igvCobrado`. Las ventas ya venían sin lo de CLAURE, pero el IGV lo traía, porque la boleta sale con el RUC de CAYLA. En Lima, octubre no decía ni lo de CAYLA ni lo de la tienda: era la venta de CAYLA con el IGV de las dos.

**Lo decidido:** «Vendiste con IGV» es todo lo vendido en la tienda, y una línea aparte dice lo de CLAURE sin IGV. Cada columna se lee: vendiste con IGV − IGV − Prendas de CLAURE = Lo que vendiste. El IGV de CLAURE se queda en su fila porque CAYLA lo declara; palabras de Felipe sobre quién lo asume: «claure puede luego devolvernos el igv con facturas de compras».

**Cómo se arma:** `FilaER.claureSinIgv` sale de `fn_cuadre_ventas_finanzas.claure` (lo que el Diario le quitó a cada sede, también en cambios). No se usa `fn_claure_ventas_en` porque no trae los cambios. Es solo presentación: `ventas`, `margen` y `resultado` no cambian, y sin una de las dos lecturas no se dibuja ninguna. Las cifras que se comparan contra una meta o un punto de equilibrio siguen siendo de CAYLA: lo de CLAURE no cuenta para ellas (ADR-0560).

**Las facturas de CLAURE:** el IGV de lo cobrado en cuentas de CAYLA ya se descuenta de lo que se le debe a CLAURE (ADR-0560, decisión 2), y el de las ventas en efectivo no. Si CLAURE además factura con IGV lo vendido, CAYLA recuperaría dos veces la parte ya descontada. Felipe decidió el mismo día que, cuando CLAURE facture, se deja de descontar (ADR-0560, actualización del 2026-11-09, con lo que falta definir con el contador). CLAURE tampoco existe hoy como proveedor, y registrar una factura de mercadería en consignación como compra normal subiría stock y costo que no son de CAYLA.

**En el Resumen (mismo día):** «Vendido por sede», la frase de «¿Cuánto te deja?» y «A dónde va la plata» dicen lo vendido con IGV y con lo de CLAURE. En el anillo, el IGV y las Prendas de CLAURE salen por su propio hilo, sin porcentaje, así que «Otros ajustes» y lo que te deja no cambian; los porcentajes de los demás se siguen midiendo sin IGV. «Lo que más se movió» conserva la fila «Ventas, sin IGV», porque es la que suma la diferencia de lo que te deja.

## Alternativas descartadas

- **Seguir con el IGV dicho y restar el arranque aparte:** dos cifras de resultado que no cuadran entre sí, y el doble conteo del saldo a favor sigue en otra forma.
- **Prorratear el saldo a favor como ganancia mientras dure:** es la misma plata que ya subió el capital.
