# ADR-0560 — Las cuentas con Claudia: lo de CLAURE no suma a CAYLA y se le debe aparte

**Fecha:** 2026-10-28 · **Estado:** construido y verificado en la base local; **nada está en producción** (las migraciones se pegan solo con OK de Felipe) · **Decide:** Felipe Alvarez (20 preguntas del 2026-10-28)
**Relacionados:** ADR-0463 (CAYLA y CLAURE son dos empresas), ADR-0505 (CLAURE solo existe en Lima), ADR-0532 y ADR-0542 (de quién es lo vendido y el stock de Lima), ADR-0195 y ADR-0493 (Finanzas), ADR-0377 (familias fuera de los motores).

## El problema primero

En Tienda LIM se vende lo de CAYLA y lo de CLAURE (la empresa de Claudia, hermana de Felipe) en la misma caja y con la misma boleta, que sale con el RUC de CAYLA. El POS y los Yape de Lima caen en **cuentas de CAYLA**, así que lo que CLAURE vendió con tarjeta, QR o Yape lo tiene CAYLA y se lo debe a Claudia. El efectivo no: lo tiene ella, que administra esa caja. Hasta ahora nada en el sistema separaba las dos plazas: Finanzas, Análisis, Rendimiento y el club sumaban todo como si fuera de CAYLA, y nadie podía decir cuánto se le debía a Claudia al cerrar la caja.

## Lo que se decidió

1. **Se le debe lo que sus ventas cobraron en cuentas de CAYLA** (la cuenta destino manda: el Yape de Lima cae en «BCP Empresa», una cuenta de CAYLA, y cuenta). Efectivo: no. Comisión del POS y descuentos: los asume Claudia.
2. **El saldo se calcula, no se guarda** (principio 4): cobrado − devuelto − comisión − pagado − gastos suyos que pagó CAYLA. Los pagos a Claudia son un tipo más de `movimientos_dinero` (`pago_claure`, append-only, solo el líder, con su n.º de operación, como el pago a SUNAT).
3. **Retroactivo desde el 23-oct**; el saldo de arranque sale solo de las ventas (≈ S/ 291,69 con datos de producción del 28-oct).
4. **Una sola regla de «esta línea es de CLAURE»** (`fn_item_es_de_claure`): la sede es de las que CLAURE opera (`empresa_sedes`), la venta es del arranque de su cuenta (`empresas.cuenta_corriente_desde`) o después, y el dueño real de la línea (`fn_dueno_de_la_linea`, ADR-0542) es CLAURE. Todo lo demás la reusa.
5. **Lo de CLAURE no suma en las pantallas de CAYLA** (Felipe: Finanzas, Análisis, Rendimiento, metas, Inicio, Observatorio, Club y clientes) **pero Caja, Historial, Movimientos e Impuestos lo muestran todo** (es lo que hay en el cajón y lo que se declara). Un ticket solo de CLAURE no cuenta como venta; uno mixto cuenta por sus líneas de CAYLA.
6. **Se debe cuando la prenda sale**: el adelanto de un apartado o de un pedido web, que la venta guarda como `anticipo` sin cuenta, entra por la cuenta de cada abono y con la fecha de la venta.
7. **Gastos por empresa**: alquiler, luz, servicios básicos y mantenimiento, 50/50; limpieza y bolsas, 100 % de CLAURE; reparto por categoría (`gasto_reparto_claure`). La planilla de CLAURE no se toca (no hay a quién atribuirla).

## Cómo quedó construido

- **Finanzas se arregla en un solo lugar: el Diario.** `fn_asientos_claure` reclasifica, por documento y cuadrado, lo vendido de CLAURE sin IGV de 7011 y del costo a lo que se le debe (479), y la parte de CLAURE de un gasto del gasto de CAYLA a la 479. El Estado de resultados, el Resumen, el Balance y el Cierre de mes leen el Diario y dejan de contarlo sin cambiar. El IGV (4011) y los cobros no se tocan.
- **Cada pantalla de decisión se parchea con un reemplazo anclado** (`pg_temp.reemplazar`): una línea `and not retail.fn_item_es_de_claure(…)` donde se leen las líneas vendidas. 6a Inicio y Observatorio, 6b Rendimiento, metas y Comercial, 6c Club y ficha de la cliente, 6d Análisis y motores. Si la función de producción no tiene el texto esperado, la migración **aborta sin cambiar nada** y dice cuál.
- **Caja y Vender no se tocan**: el Inicio resta lo de CLAURE de lo que lee de Caja (`fn_claure_de_hoy`), en vez de cambiar la función que Caja también usa.
- **Candados**: lo nuevo lo ve el líder o quien tiene Cuentas y dinero (su sede); quien cierra una caja ve el aviso de esa caja sin pedir el módulo; el pago es solo del líder; `anon` no ejecuta nada.
- **Pruebas**: 10 suites de Postgres propias (`pruebas:claure-*`), cada caso en su transacción con ROLLBACK y verificadas con una mutación (sin la migración, fallan). Las pruebas viejas que fijan el texto o el md5 de una función parchada la devuelven a su estado dentro de su transacción (`scripts/pruebas/_deshacer_claure.mjs`).

## Lo que se descartó

- **Guardar el saldo en una tabla**: duplicaría la verdad que ya está en ventas, pagos y devoluciones (principio 4).
- **Filtrar en la web**: cada pantalla tendría su propia regla y cuadrarían distinto; la regla vive en la base.
- **Una columna `empresa_id` en cada línea de venta**: toca el núcleo (`venta_items`, tabla caliente) y producción; el dueño real ya se sabe por el libro y la ficha de la prenda.
- **Un módulo nuevo para la pantalla**: «CLAURE» es una pestaña de Cuentas y dinero, no una entrada del menú (ADR-0306).

## Orden de pegado en producción (solo con OK de Felipe; cada paso es una ejecución aparte)

`20261029004000` → `011000` → `013000` → `020000` → `023000` → `030000` → `035000` → `041000` → `043000` → `044000`, y recién ahí la web. Las partes con reemplazos anclados (`020000`, `023000`, `030000`, `035000`, `041000`) **abortan sin cambiar nada** si una función de producción no tiene el texto que esperan; no pude leer los textos vivos de producción, así que el aborto es el aviso. `044000` crea una tabla y dos categorías y va **antes** que la web. Después de pegar: `pnpm datos:generar:produccion` y `pnpm datos:comparar`.

## Qué queda abierto

Ver `docs/backlog/2026-10-28-reverent-mcclintock-755f41.md` (decisiones de Felipe, producción, deuda técnica) y el tablero `docs/maquetas/claure-pendientes-2026-10/index.html`.
