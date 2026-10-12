# ADR-0382 — La nota de crédito de una devolución declara solo lo devuelto

- **Fecha:** 2026-10-12 · **Estado:** construido y probado en una copia de la base local con las mismas funciones que producción; **SQL SIN pegar en producción** (es SUNAT: espera el OK de Felipe).
- **Pedido:** el pendiente que dejó el ADR-0380 («Lo que este ADR no arregla»). Se vio al revisar si el hallazgo #1 del análisis de Ventas («Cambios y devoluciones con lo que la clienta pagó») estaba cerrado: el punto «lo que se emite a SUNAT también cambia» solo se había corregido en el total.
- **Sigue a:** ADR-0100 (la devolución emite su nota de crédito sola), ADR-0380 (la nota sale por lo pagado).

## El problema

`aprobar_devolucion` llama a `emitir_nota(comprobante, 'nota_credito', '06'|'07', subtotal, igv, total)` **sin `p_items`**, y `emitir_nota` hace
`v_items := coalesce(p_items, v_original.items)`: la nota hereda **todas las líneas de la boleta**. Eso es lo que `itemsParaLucode`
(`apps/web/lib/transmision-reglas.ts`) arma y `lib/lucode.ts` manda a SUNAT.

| Devolución | Total de la nota (desde ADR-0380) | Ítems de la nota (antes de este ADR) |
|---|---|---|
| Total (motivo «06») | lo pagado por todo | todas las líneas, ✓ coinciden |
| **Parcial** (motivo «07»): polera S/ 80 pagado + blusa S/ 60, devuelve la polera | S/ 80 ✓ | **polera + blusa (S/ 140)** ✗ |

Una nota que le dice a SUNAT que volvieron prendas que la clienta se llevó, con líneas que no suman su total: o el PSE la rechaza o, peor, la acepta
con un detalle falso. El ADR-0100 prometía «por el valor exacto de lo devuelto — no de toda la venta»; el valor ya lo cumplía, el detalle no.

**Estado real (consulta de solo lectura a producción, 2026-10-12):** 0 notas de crédito emitidas, 0 devoluciones en 30 días, 485 boletas y facturas
aceptadas. El daño era latente: aparecía con la primera devolución parcial de una boleta aceptada.

## Decisión

DECIDÍ: que `aprobar_devolucion` le pase a `emitir_nota` los ítems de **lo devuelto**: `devolucion_items ⋈ venta_items`, con la forma de las líneas de una
venta `{variante_id, cantidad, precio_unitario, descuento_unitario}` (la que ya entiende `itemsParaLucode`), y `descripcion_libre` desde
`prendas_por_regularizar.descripcion` cuando la línea fue una prenda sin registrar (ADR-0179). Siempre, sea la devolución total o parcial: un solo camino,
sin un `if` para el «07». Con eso, Σ (precio − descuento) × cantidad de la nota **es** su total (la misma cuenta que `v_total_devuelto`, ADR-0380).
Reemplazo anclado de `aprobar_devolucion` (`20261012200000`); de paso corrige su comentario «sigue sobre precio de lista», falso desde el ADR-0380.

DESCARTÉ: **filtrar las líneas de la boleta original** (para que la nota repita su texto exacto) porque no hay cómo saber con certeza qué línea de la boleta es
qué línea de venta: `comprobantes.items` es el pedido tal como llegó del mostrador y `venta_items` no guarda su posición. Dos prendas sin registrar comparten
la variante centinela, y tras regularizar una, su línea pasa a la variante real y puede compartirla con otra línea (es uno de los casos de la prueba). Cruzar
por variante + precio elegiría la línea equivocada justo en el caso difícil.
DESCARTÉ también **un candado en `emitir_nota`** («los ítems de una nota tienen que sumar su total») porque los ítems llegan de dos formas (el comprobante
manual trae el precio SIN IGV; el de una venta, CON IGV y el descuento aparte) y el redondeo por línea obliga a una tolerancia: un candado difuso en la
función que da validez legal es peor que dos llamadores correctos. Hoy solo hay dos: este y `registrar_devolucion_separacion`, que acredita cada boleta de
anticipo completa con sus propios ítems y está bien. Si nace un tercero, ese es el momento de poner el candado.

SE ROMPE SI: (a) **alguien corrige el texto de una prenda sin registrar después de vender** (`corregir_prenda_sin_registrar`, ADR-0369): la nota repite el
texto corregido, no el que imprimió la boleta. Es la misma prenda; SUNAT no cruza el texto línea por línea. (b) **Nace un descuento a nivel de TICKET** que no
se reparte en `descuento_unitario`: «lo pagado» por línea dejaría de ser exacto (el mismo riesgo que ya nombra el ADR-0380). (c) **Una tercera función
llama a `emitir_nota` con un total menor que el comprobante y sin ítems**: repetiría el hueco. Ver la segunda opción descartada.

## Verificación

- **Copia aislada de la base local** (`pg_dump` → base nueva, con permisos), con la migración del ADR-0380 aplicada: la huella (`md5(prosrc)`) de
  `aprobar_devolucion`, `emitir_nota` y `registrar_cambio` quedó **idéntica a la de producción** (94dfe580 / 196885b8 / 36b15583) antes de aplicar esta.
- `pnpm pruebas:aprobar-devolucion-caja` (con `PRUEBAS_BASE`): **12/12**. Los cuatro casos nuevos: una de dos prendas («07», 1 ítem, con su descuento, suma el
  total), una de dos unidades («07», 1 unidad), la devolución total («06», las dos líneas, suma el total) y la prenda sin registrar regularizada junto a otra
  de la misma variante (1 ítem, «Blusa lino beige», S/ 50). **Tres de los cuatro fallan contra la función de producción** (la nota traía 2 ítems y no sumaba
  el total); el de la devolución total pasa en los dos, a propósito: vigila que lo que ya estaba bien no cambie.
- Pegada dos veces: idempotente (misma huella, `284f3596…`), una sola versión de la función y sus permisos sin cambios.
- Regresión en la misma copia: `arreglos_en_vivo` 47/47, `notas_credito_serie_por_letra` 17/17, `crear_devolucion_motivo` 11/11, `cuenta_sellada` 76/76.
  `candado_dinero_caja_cambios_devoluciones` (19/20) y `concurrencia_orden_y_doble_clic` (14/15) fallan en **un caso de permisos cada una, igual en la base
  local compartida sin ninguna de las dos migraciones**: es una deriva previa de la base local, no de este cambio (el CI corre sobre una base nueva).
- Lo que no se probó: **una nota parcial real contra el sandbox de Lucode**. La forma de los ítems es la de cualquier boleta de venta, que Lucode ya acepta,
  pero ninguna nota «07» se transmitió todavía.

## Producción

**Sin pegar.** Una sola parte: solo el `create or replace` de una función, sin tablas ni políticas; no depende de la web (la web no cambia) y se puede pegar
antes o después de publicar. Necesita que el ADR-0380 (`20261012120100`) ya esté, y lo está desde el 2026-10-12. Al pegar: comprobar en solo lectura que
`aprobar_devolucion` tiene una sola firma y que su huella es `94dfe580…`; después, que quedó en `284f3596…`. Antes de la primera devolución parcial real,
conviene transmitir una nota «07» al sandbox de Lucode.
