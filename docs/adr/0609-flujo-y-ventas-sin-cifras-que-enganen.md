# ADR-0609 — Lo que el Flujo no cubre y el cuadre de Ventas a Finanzas

- **Fecha:** 2026-11-04 · **Estado:** construido; migraciones `20261104211000` y `20261104212000` **sin pegar en producción**.
- **Relacionados:** ADR-0195 F3 y F6 (cuentas y Flujo), ADR-0552 (reinicio de saldos), ADR-0560 (CLAURE), ADR-0585 (Estados financieros), ADR-0332 (desde cuándo cuenta Finanzas).
- **Cifras:** las reales no entran al repo (es público, como en el ADR-0552).

## El problema

Felipe comparó octubre entre Ventas y Finanzas y no cuadraba. Se conciliaron las dos cifras desde las tablas de producción (solo lectura) y salieron dos cosas distintas:

1. **«Vendido» y «Ventas» están bien y miden cosas distintas**, pero ninguna pantalla decía qué las separa. Ventas suma lo cobrado con IGV; Finanzas, lo que es ingreso de CAYLA.
2. **El Flujo de efectivo cuadraba y engañaba.** Una cuenta con `saldo_desde` solo suma de ese día en adelante, y es correcto, porque su saldo ya contiene lo anterior. Pero con bancos y máquinas reiniciados a fin de mes (ADR-0552), «lo que entró» salía por menos de la mitad de lo cobrado, y «Al empezar el mes» traía saldos de un día de fin de mes, porque `fn_cuentas_dinero_saldos` suma `saldo_inicial` aunque el corte sea anterior a `saldo_desde`. La identidad inicial + entró − salió ± ajustes = final se cumplía, así que nada avisaba.

## Decisión

DECIDÍ:

1. **El Flujo no cambia ninguna cifra; dice lo que no cubre.** `fn_flujo_caja_real` agrega `arranques`: por cada cuenta que arrancó después del primer día del período, lo que su libro registró antes. La pantalla (y el CSV del contador) lo muestra en céntimos, con lo cobrado en todo el período.
2. **Con una cuenta así no se afirma lo que no se sabe.** El titular dice cuánto hay, no «subió» ni «bajó»; «Al empezar el mes» pasa a «Saldo de partida»; la cabecera y la recomendación «ganaste y la plata bajó» tampoco lo afirman. Es una regla de lectura (`loQueNoCubre`), no un dato guardado: el mes que todas las cuentas ya sumen desde el día 1, todo vuelve solo a como estaba.
3. **Una cuenta que arrancó en cero y sin movimientos no cuenta como incompleta:** no le quita nada al cuadro.
4. **`fn_cuadre_ventas_finanzas`** da, por sede: vendido + igv + anulaciones de otro mes + devoluciones + cambios + CLAURE + otras = ventas netas. Vendido usa la regla de `fn_reporte_ventas_mes`; ventas netas se lee del mismo diario que el Estado de resultados. **«Otras» nunca se reparte:** si algo se separa sin nombre, aparece «Sin explicar» con su monto.
5. **El cuadre vive en ¿Ganamos?, los dos formatos**, bajo la cascada, porque ahí está la cifra que no coincide.
6. **`solesCentimos`:** lo que se compara con otra pantalla o un extracto va siempre con dos decimales. El resto de Finanzas sigue en soles redondos; no se cambia aquí.

DESCARTÉ:

- **Sumar a «entró» lo anterior al arranque, con un ajuste que lo reste:** daría la cifra completa, pero cambia `entro` para el Resumen y los gráficos, y el ajuste no significa nada para quien lo lee (no se sabe cuánto había el día 1).
- **Corregir `fn_cuentas_dinero_saldos` para que no sume `saldo_inicial` antes de `saldo_desde`:** el saldo inicial del mes bajaría, pero la identidad dejaría de cumplirse sin una línea más, y esa función la leen Cuentas, el Balance y la proyección.
- **Una tabla o una foto del cuadre:** son lecturas de lo que ya está en la base; una foto se atrasa.

## Qué se rompería sin esto

Se volvería a leer «entró» como «cobré» y un saldo de fin de mes como el del día 1, y cada comparación con Ventas empezaría desde cero con una consulta a mano.

## Cómo se verifica

- `pnpm pruebas:cuadre-ventas-finanzas`: las cifras a mano, la identidad, igualdad con el Estado de resultados sede por sede, CLAURE, anulaciones entre meses, permisos, y que el Flujo no se mueve.
- En la pantalla, mes de octubre: Finanzas ▸ Estados financieros ▸ Resultados (cuadre) y Flujo de efectivo (aviso y tabla).

## Queda fuera

Rótulos de Ventas ▸ Reportes («Vendido» no dice que lleva IGV ni CLAURE), las 4 ventas con boleta anulada, el IGV de notas de venta y de cambios (del contador), y los costos estimados. Son decisiones aparte.
