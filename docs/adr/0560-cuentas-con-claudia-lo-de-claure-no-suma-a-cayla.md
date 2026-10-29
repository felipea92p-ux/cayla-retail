# ADR-0560 — Las cuentas con Claudia: lo de CLAURE no suma a CAYLA y se le debe aparte

**Fecha:** 2026-10-28 · **Estado:** construido y verificado en la base local (16 actividades vigentes; la 15 se retiró por el ADR-0558) y, encima de una copia de `main` con el ADR-0558, con sus 17 migraciones; **las 17 migraciones están EN producción desde el 2026-10-29** (pegadas con el OK de Felipe, una por una, por el MCP de Supabase); la web y el PR siguen pendientes · **Decide:** Felipe Alvarez (20 preguntas del 2026-10-28 y 14 respuestas del 2026-10-29)
**Relacionados:** ADR-0463 (CAYLA y CLAURE son dos empresas), ADR-0505 (CLAURE solo existe en Lima), ADR-0532 y ADR-0542 (de quién es lo vendido y el stock de Lima), ADR-0195 y ADR-0493 (Finanzas), ADR-0377 (familias fuera de los motores), **ADR-0558 (consignación a costo, cuenta 4699: esta decisión manda sobre su parte de la deuda)**.

## El problema primero

En Tienda LIM se vende lo de CAYLA y lo de CLAURE (la empresa de Claudia, hermana de Felipe) en la misma caja y con la misma boleta, que sale con el RUC de CAYLA. El POS y los Yape de Lima caen en **cuentas de CAYLA**, así que lo que CLAURE vendió con tarjeta, QR o Yape lo tiene CAYLA y se lo debe a Claudia. El efectivo no: lo tiene ella, que administra esa caja. Hasta ahora nada en el sistema separaba las dos plazas: Finanzas, Análisis, Rendimiento y el club sumaban todo como si fuera de CAYLA, y nadie podía decir cuánto se le debía a Claudia al cerrar la caja.

## Lo que se decidió

1. **Se le debe lo que sus ventas cobraron en cuentas de CAYLA** (la cuenta destino manda: el Yape de Lima cae en «BCP Empresa», una cuenta de CAYLA, y cuenta). Efectivo: no. Comisión del POS y descuentos: los asume Claudia.
2. **El saldo se calcula, no se guarda** (principio 4): cobrado − devuelto − **IGV** − comisión − pagado − gastos suyos que pagó CAYLA. El IGV se le descuenta porque la boleta sale con el RUC de CAYLA, que lo declara y lo paga (Felipe, 2026-10-29: «se le descuenta»; falta el visto del contador). Los pagos a Claudia son un tipo más de `movimientos_dinero` (`pago_claure`, append-only, solo el líder, con su n.º de operación, como el pago a SUNAT).
3. **El efectivo de CAYLA que Claudia guarda baja lo que se le debe** (Felipe, 2026-10-29): al cerrar la caja de Lima hay un destino más, «Se queda con Claudia»; sale del cajón, se asienta 479 al debe y 101 al haber, y no cuenta como depósito.
4. **En un cambio, la plata sigue a la prenda que se lleva el cliente** (Felipe, 2026-10-29): lo pagado por la prenda devuelta (en cuentas de CAYLA) y la diferencia pasan a los dueños de lo que se lleva; en la deuda y en el Diario (7011 ↔ 479). El efectivo no cuenta.
5. **Retroactivo desde el 23-oct**; el saldo de arranque sale solo de las ventas (≈ S/ 291,69 con datos de producción del 28-oct).
6. **Una sola regla de «esta línea es de CLAURE»** (`fn_item_es_de_claure`): la sede es de las que CLAURE opera (`empresa_sedes`), la venta es del arranque de su cuenta (`empresas.cuenta_corriente_desde`) o después, y el dueño real de la línea (`fn_dueno_de_la_linea`, ADR-0542) es CLAURE. Todo lo demás la reusa.
7. **Lo de CLAURE no suma en las pantallas de CAYLA** (Felipe: Finanzas, Análisis, Rendimiento, metas, Inicio, Observatorio, Club y clientes) **pero Caja, Historial, Movimientos e Impuestos lo muestran todo** (es lo que hay en el cajón y lo que se declara). Un ticket solo de CLAURE no cuenta como venta; uno mixto cuenta por sus líneas de CAYLA.
8. **Se debe cuando la prenda sale**: el adelanto de un apartado o de un pedido web, que la venta guarda como `anticipo` sin cuenta, entra por la cuenta de cada abono y con la fecha de la venta.
9. **Gastos por empresa**: alquiler, luz y mantenimiento, 50/50; agua, internet, baño, limpieza y bolsas, 100 % de CLAURE (Felipe, 2026-10-29: «lo demás lo asume Claudia»); reparto por categoría (`gasto_reparto_claure`). La planilla de CLAURE no se toca (no hay a quién atribuirla).

## Cómo quedó construido

- **Finanzas se arregla en un solo lugar: el Diario.** `fn_asientos_claure` reclasifica, por documento y cuadrado, lo vendido de CLAURE sin IGV de 7011 y del costo a lo que se le debe (479), y la parte de CLAURE de un gasto del gasto de CAYLA a la 479. El Estado de resultados, el Resumen, el Balance y el Cierre de mes leen el Diario y dejan de contarlo sin cambiar. El IGV (4011) y los cobros no se tocan.
- **Cada pantalla de decisión se parchea con un reemplazo anclado** (`pg_temp.reemplazar`): una línea `and not retail.fn_item_es_de_claure(…)` donde se leen las líneas vendidas. 6a Inicio y Observatorio, 6b Rendimiento, metas y Comercial, 6c Club y ficha de la cliente, 6d Análisis y motores. Si la función de producción no tiene el texto esperado, la migración **aborta sin cambiar nada** y dice cuál.
- **Caja y Vender no se tocan**: el Inicio resta lo de CLAURE de lo que lee de Caja (`fn_claure_de_hoy`), en vez de cambiar la función que Caja también usa.
- **Candados**: lo nuevo lo ve el líder o quien tiene Cuentas y dinero (su sede); quien cierra una caja ve el aviso de esa caja sin pedir el módulo; el pago es solo del líder; `anon` no ejecuta nada.
- **Pruebas**: 10 suites de Postgres propias (`pruebas:claure-*`), cada caso en su transacción con ROLLBACK y verificadas con una mutación (sin la migración, fallan). Las pruebas viejas que fijan el texto o el md5 de una función parchada la devuelven a su estado dentro de su transacción (`scripts/pruebas/_deshacer_claure.mjs`).

## Segunda ronda (2026-10-29): lo que Felipe contestó a lo que quedó abierto

Resueltas con obra (actividades 10 a 17, en la misma rama y un solo PR):
- **IGV:** se le descuenta a Claudia (actividad 10). **Efectivo:** destino «Se queda con Claudia» al cerrar la caja (11). **Servicios:** luz, alquiler y mantenimiento 50/50; agua, internet y baño 100 % de CLAURE (12; solo datos y la categoría de «Luz» en Gasto rápido).
- **Cambios:** «la plata sigue a la prenda que se lleva el cliente», en la deuda y en el Diario, revisado con él antes de tocar nada (13). **Pérdidas y dañadas por dueño** (14), **el Balance sin el stock de CLAURE** (15, retirada: ya lo hace el ADR-0558), **«¿Me alcanza?» sin la plata de Claudia** (16) y **una pantalla para cambiar los porcentajes** de reparto, solo del líder (17).
- Frescura del piso, el Resumen por variante y la capacidad del piso **NO** se separan por dueño (decisión suya).

Resueltas sin código: la 479 sigue provisional hasta el contador; la meta de Lima para CAYLA sola la carga él; los puntos del club ya dados y la ficha de una clienta solo-CLAURE se quedan; la planilla no tiene nada que separar (la trabajadora de CLAURE no está en Dynamic y Claudia le paga); los gastos de «suministros» de antes se quedan como CAYLA; sin nota en el Observatorio.

## Cómo se verificó y qué no

Diecinueve suites de Postgres propias (`pnpm pruebas:claure-*`), cada caso en su transacción con ROLLBACK y la mayoría verificadas con una mutación (sin la migración, fallan); las pantallas, en el navegador (claro, oscuro y 375 px donde importaba), con `tema:auditar` y `guias:recorrer`; el caos, **a nivel de base** (sesiones paralelas sobre el reparto, el cierre «Se queda con Claudia» y los pagos con el mismo token), que encontró y arregló un defecto (la historia del reparto bajo cambios simultáneos). **No** se corrió `/chaos` en el navegador ni sus 69 ataques, ni se vio el paso 3 del cierre de caja en esta ronda. Lo que sigue abierto vive en el tablero `docs/maquetas/claure-pendientes-2026-10/index.html`.

## Lo que se descartó

- **Guardar el saldo en una tabla**: duplicaría la verdad que ya está en ventas, pagos y devoluciones (principio 4).
- **Filtrar en la web**: cada pantalla tendría su propia regla y cuadrarían distinto; la regla vive en la base.
- **Una columna `empresa_id` en cada línea de venta**: toca el núcleo (`venta_items`, tabla caliente) y producción; el dueño real ya se sabe por el libro y la ficha de la prenda.
- **Un módulo nuevo para la pantalla**: «CLAURE» es una pestaña de Cuentas y dinero, no una entrada del menú (ADR-0306).

## Convivencia con el ADR-0558 (2026-10-29): manda lo cobrado

**El choque.** `main` trae el ADR-0558 (Felipe, 2026-10-28): la mercadería de CLAURE es consignación y lo que CAYLA le debe nace al vender, **a costo, en la 4699**. Esta obra dice otra cosa: se le debe **lo cobrado en cuentas de CAYLA, sin IGV y sin comisión, en la 479**. Las dos definen `fn_asientos_claure` con la misma firma y las dos reclasifican la misma venta. **Felipe decidió (2026-10-29): «manda lo cobrado: Claudia vende, CAYLA le cobra».**

**Lo que se verificó en producción (solo lectura, 2026-10-29).** El ADR-0558 **sí está pegado** (la cuenta 4699, `fn_dueno_del_movimiento`, `fn_asientos_claure` y los filtros de `fn_bal_stock` / `fn_bal_causas_mercaderia`); la 479 y las funciones de esta obra no. CLAURE tiene 6 líneas vendidas, todas desde el 24-oct, ninguna antes del arranque (23-oct), y **no hay ningún mes cerrado ni línea congelada en `diario_cerrado`**: reemplazar la reclasificación no reescribe historia.

**Lo que se hizo.**
1. La cadena de CLAURE va **después** de la 0558, y `20261029020000` redefine `fn_asientos_claure` (misma firma): la última que se pega gana, así que el Diario reclasifica a la 479 y la **4699 queda sin movimiento** (sin saldo no aparece en el Balance; su rótulo se queda en la web por si un mes cerrado antes la congelara). El enganche de `fn_asientos` es condicional: la 0558 ya une `fn_asientos_claure` y una segunda unión duplicaría los asientos.
2. **Se retira la actividad 15** (`20261029155000`, el Balance sin el stock de CLAURE): la 0558 ya resta ese stock (`fn_bal_stock`, `fn_bal_causas_mercaderia`), y restarlo otra vez lo descontaría dos veces. El número queda reservado y sin archivo.
3. Web: rótulo y nota de la 479 en el Balance y los textos de las reglas del Diario (`claure_venta`, `claure_anulacion`, `claure_devolucion`, `claure_cambio`, `claure_gasto`, `pago_claure`, `traslado_claudia`).
4. `scripts/pruebas/balance_claure.mjs` (la suite del ADR-0558) ya no re-aplica la 0558 dentro de cada caso —devolvería su `fn_asientos_claure`— y prueba el estado final: **el Balance y la 201 del Diario se mueven igual** con una venta, anulación, devolución y pérdida de CLAURE, la deuda queda en la 479 (lo cobrado sin IGV) y la 4699 en cero. Es la propiedad que decide si el Balance se dibuja (ADR-0198).

**Cómo se verificó.** En una copia de la base de `main` (con la 0558) con las 17 migraciones aplicadas encima: las 18 suites `pnpm pruebas:claure-*` y `balance_claure` (16/16) en verde; las suites aceptan `CONTENEDOR_PG` y `BASE_PG` para apuntar a otra base.

**Lo que queda a propósito.** (a) La pérdida de una prenda de CLAURE ya no es deuda (el ADR-0558 la llevaba a la 4699 «porque la responde CAYLA»): ahora ni el Diario ni Pérdidas la cuentan como de CAYLA (actividad 14). Si Felipe quiere que CAYLA la responda, es otra decisión. (b) Una venta de CLAURE **anterior al arranque** (23-oct) volvería a bajar la 201 sin que el Balance la siga y la comprobación de la 201 no cuadraría; en producción hoy no hay ninguna. (c) Para el contador: si la deuda con Claudia es la 479 (relacionada) o la 4699 (tercero); ambas son provisionales.

## Pegado en producción (2026-10-29, con el OK de Felipe)

Las 17 migraciones se aplicaron en `vovjyyiafkxteijimpuy` (schema `retail`) **en orden y una por una** con `apply_migration`; ninguna abortó (los reemplazos anclados coincidieron con el texto vivo, incluidos los de la `041000` y la `144000`). Antes se miró en solo lectura que CLAURE estuviera activa, que mis funciones no existieran, que la 479 faltara y que la 0558 estuviera pegada; y que no hubiera gastos de servicios básicos en Lima desde el 23-oct (el pendiente de los «Luz» anteriores no afecta a producción hoy). Versiones registradas en `supabase_migrations.schema_migrations` (la fecha es la del pegado, no la del archivo):

`20261029170721` cuenta_con_claure · `170750` pagar_a_claure · `170829` cierre_de_caja_con_claudia · `170918` claure_fuera_de_las_cifras_de_cayla · `171000` claure_fuera_de_inicio_y_observatorio · `171041` claure_fuera_de_rendimiento_y_metas · `171116` claure_fuera_del_club_y_las_clientes · `171202` claure_fuera_de_analisis_y_motores · `171237` claure_apartados_y_pedidos_web · `171327` claure_gastos_por_empresa · `171354` claure_igv_se_descuenta · `171438` claure_efectivo_se_queda_con_claudia · `171509` claure_servicios_basicos_100 · `171556` claure_perdidas_y_danadas · `171618` claure_proyeccion_sin_su_plata · `171659` claure_reparto_de_gastos_pantalla · `171741` claure_cambios_la_plata_sigue_a_la_prenda.

**Cómo quedó (consulta de solo lectura justo después):** el Diario reclasifica las 5 ventas de CLAURE desde el 24-oct —20 líneas, todas `claure_venta`, cuadradas a 0,00—: 7011 −279,66 (deja de ser ingreso de CAYLA), 479 +279,66 (lo que se le debe, sin IGV), y el costo de 152,00 vuelve a 201 y sale de 691. La 4699 ya no tiene líneas; `fn_asientos` une `fn_asientos_claure` **una sola vez**. La pantalla CLAURE dice que se le debe **S/ 246,69** hoy (lo cobrado en cuentas de CAYLA, sin IGV ni comisión): es menos que la 479 (S/ 279,66) porque la 479 incluye el efectivo que ya tiene Claudia (supuesto (a) de la `020000`).

**Lo que NO se pudo verificar en producción:** la comprobación de la 201 y el Balance (`fn_conciliacion_contable` responde «falta» en el chequeo bloqueante «Saldos de arranque», antes y después de esto: no depende de CLAURE). La web (pestaña CLAURE, aviso del cierre, Configuración ▸ Gastos con CLAURE, Gasto rápido) **no está publicada**: con la web vieja no pasa nada (las funciones solo agregan claves o aceptan un destino más), pero Gasto rápido sigue mandando «Luz», «Bolsas» y «Limpieza» a sus categorías de antes hasta publicar. Falta refrescar el diccionario (`docs/datos/generado/`, `datos:refrescar`) con las tablas y funciones nuevas.

## Orden de pegado en producción (hecho el 2026-10-29; sirve de registro y para otra base)

`20261029004000` → `011000` → `013000` → `020000` → `023000` → `030000` → `035000` → `041000` → `043000` → `044000` → `142000` → `144000` → `153000` → `154000` → `160000` → `161000` → `162000`, y recién ahí la web. **Producción ya tiene la `20261028212000` (ADR-0558): esta cadena va después y reemplaza su `fn_asientos_claure`.** (La `155000` se retiró: ver arriba.) Las partes con reemplazos anclados (`020000`, `023000`, `030000`, `035000`, `041000`) **abortan sin cambiar nada** si una función de producción no tiene el texto que esperan; no pude leer los textos vivos de producción, así que el aborto es el aviso. `044000` crea una tabla y dos categorías y va **antes** que la web. Después de pegar: `pnpm datos:generar:produccion` y `pnpm datos:comparar`.

## Qué queda abierto

Ver `docs/backlog/2026-10-28-reverent-mcclintock-755f41.md` (decisiones de Felipe, producción, deuda técnica) y el tablero `docs/maquetas/claure-pendientes-2026-10/index.html`.
