# ADR-XXXX · Las mermas y pérdidas de inventario pasan de la cuenta 659 a la 6951

- **Fecha:** 2026-10-22 · **Estado:** construido y probado en local; **SQL SIN PEGAR hasta el OK del contador**. Migración
  `20261023133700_mermas_a_la_cuenta_6951.sql` (versión provisional: se reserva con `pnpm reservar migracion` antes de abrir el PR).
  El número de este ADR también es provisional (`pnpm reservar adr`).
- **Decide:** Felipe, 2026-10-22: sí, antes del primer cierre de mes (octubre). Su contador/a confirma la cuenta antes de pegar.
- **Toca:** ADR-0120 (`fn_asientos`, las reglas de posteo), ADR-0195 (Estado de resultados), ADR-0198 (el mes cerrado se congela), ADR-0328 act. 14
  (qué es una pérdida).

## El problema primero

Toda pérdida de inventario —un faltante de conteo, una resta a mano, una dañada botada o donada, lo que faltó en un traslado y la venta anulada cuya prenda
no volvió a la venta— se asienta hoy contra la cuenta **659** «Desmedros y otros (mermas)». Pero el 659 del plan contable peruano es «Otros gastos de gestión»:
el manual de CAYLA lo sembró con otro significado (`docs/datos/13-PROMESAS-INCUMPLIDAS.md`: «el mismo código con dos significados»). Felipe decidió pasarlas a la
**6951 «Gastos por desvalorización de inventarios — mercaderías»** (PCGE 2019, dentro del costo de ventas), y hacerlo **antes** del primer cierre: un mes cerrado
nunca cambia, así que después de octubre costaría reabrir meses.

Dato que lo hace barato: el Estado de resultados **ya resta las mermas antes del margen bruto** (`margen = ventas − costo − fletes − mermas`). Cambiar de cuenta no
mueve una cifra: es el nombre del cajón, no el contenido.

## Decisión

**DECIDÍ:** `retail.fn_asientos` asienta las pérdidas de inventario en la **6951** (los tres sitios donde hoy escribe `'659'`: la anulación con prenda no vendible,
las mermas por movimiento y el faltante de traslado). La 6951 entra al plan como gasto de la sección **«mermas»** (igual que la 659), así que el Estado de
resultados conserva su renglón «Mermas» y todos sus totales. Es un reemplazo anclado sobre la definición viva (`pg_temp.mermas_reemplazar`), que cuenta cuántas
veces aparece el texto y aborta si no son las esperadas: los parches de otras migraciones sobre `fn_asientos` se conservan.

Además, el **detalle** de mermas de `fn_estado_resultados` deja de leer «la cuenta 659» y lee «las cuentas de la sección mermas»: el total ya salía de la sección, y
ahora el detalle y el total no se pueden desacordar con la 659, la 6951 o la cuenta que el contador decida mañana.

**DESCARTÉ:** poner la 6951 en la sección `costo_ventas` (donde la ubica el PCGE) porque el renglón «Mermas» desaparecería del Estado de resultados y el costo de lo
vendido subiría con una cifra que hoy se lee aparte; el margen bruto no cambia, pero la lectura de Felipe sí, y eso es una decisión de presentación que nadie pidió
(queda abierta para el contador).
**DESCARTÉ:** renombrar o desactivar la 659: seguiría siendo «mermas» en la sección y cualquier resto se sigue contando en el margen; retirarla es del contador.
**DESCARTÉ:** reescribir `fn_asientos` entera desde su archivo: viven parches de más de veinte migraciones y se perderían.
**DESCARTÉ:** reemplazar un patrón «659%»: la 6599 «Diferencias de caja» y la 6598 «Redondeo de efectivo» solo se parecen en el prefijo; no son hijas de la 659 en la
base. Se reemplazan los tres literales exactos, y las pruebas exigen que 6599 y 6598 queden donde estaban.

**SE ROMPE SI:** (a) una migración posterior recrea `fn_asientos` o `fn_estado_resultados` desde un archivo viejo (vuelve la 659 sin avisar; lo detecta
`perdidas.mjs`, caso M); (b) se cierra un mes con la 659 y después se pega esto (la huella del mes dejaría de coincidir: lo impide el candado); (c) alguien suma a
`fn_asientos` una regla de pérdida con `'659'` escrita a mano (la verificación final de la migración y las pruebas fallan); (d) el contador pide otro código distinto
de 6951 (se repite la migración con ese código).

## El candado del mes cerrado

Un mes cerrado tiene el diario **congelado** con las mermas en la 659 y su **huella**. Si la función de hoy asentara esas mermas en la 6951, la huella viva dejaría de
coincidir con la congelada y Cierre de mes diría «algo cambió». La migración **aborta** (con el nombre de cada mes) si existe un período `cerrado` en
`retail.periodos`; hoy producción no tiene ninguno. Solo cuenta `cerrado`: uno `reabierto` no tiene nada congelado. Si la migración ya está aplicada, volver a pegarla
**no hace nada** (aunque después se hayan cerrado meses con la 6951). Mientras corre toma `retail.periodos` en SHARE ROW EXCLUSIVE (3 s de espera y falla limpio) para
que nadie cierre un mes entre la guarda y el final.

## Quién lee la 659 (inventario del 2026-10-22)

| Lector | Cómo la lee | Qué se hizo |
|---|---|---|
| `fn_asientos` (3 sitios) | escribe `'659'` | pasa a `'6951'` |
| `fn_estado_resultados` · `detalle_mermas` | `where a.cuenta = '659'` | lee por sección `mermas` |
| `fn_estado_resultados` · total «mermas» | por sección | no cambia |
| `fn_diario`, `fn_balance_general`, `fn_conciliacion_contable`, `fn_cierre_mes_estado`, `cerrar_periodo`, `fn_asientos_descuadrados`, `fn_bal_diario` | el diario o el plan por tipo/sección | no cambian; el Balance exige que la cuenta exista en `retail.cuentas`: por eso la 6951 entra primero |
| `fn_resumen_variantes.mermas_ventana`, la pestaña Pérdidas | cuentan movimientos, no cuentas | no cambian |
| `diario_cerrado` | guarda el código de cada línea congelada | vacío hoy; el candado impide mezclar |
| `apps/web/lib/resultados-reglas.ts` (fila «Mermas» y su «De dónde sale») | `cuenta: "659"`, `cuentas: ["659"]` | `"6951"`, y `["6951", "659"]` para no quedar vacía si web y base se publican en distinto orden |
| `apps/web/lib/registro-contable.ts` | mapa viejo de subgrupos (121, 168…) que no se usa | no se toca (código muerto en la deuda de Knip) |
| `scripts/pruebas/perdidas.mjs`, `estado_resultados.mjs` | afirmaban `659` | pasan a `6951` y suman los casos M / N |
| `balance.mjs`, `redondeo_efectivo.mjs` | hablan de 6599 y 6598 | no se tocan |

## Qué NO cambia (probado)

Ningún total del Estado de resultados (ni su detalle de mermas por regla), ni el Balance, ni la conciliación contable; las líneas del diario salvo el código de esas
mermas; la pestaña Pérdidas; las diferencias de caja (6599) y el redondeo (6598). La prueba lee **el archivo** de la migración: en el CI (donde ya está aplicada) arma el
«antes» ejecutando su bloque DESHACER, y el «después» volviéndola a pegar; compara fila por fila.

## Cómo se pega y cómo se deshace

Un archivo, una parte (no hay políticas ni `alter table`: ADR-0195 no aplica; sin `select … into` dentro de un texto: ADR-0288). Orden: (1) el OK del contador;
(2) sin meses cerrados y nadie cerrando uno; (3) pegar tal cual; (4) las dos consultas de «CÓMO VERIFICAR» del encabezado; (5) fusionar el PR de la web;
(6) actualizar `docs/MANUAL-CONTABLE-CAYLA.md` (reglas 11 y de resultados), `docs/finanzas/fases/F5.md` y `docs/datos/modulos/12-contabilidad.md`, que dicen «659 =
mermas»; (7) recién entonces cerrar octubre. El «down» está en el encabezado de la migración, ejecutable (la prueba lo corre).

## Pendiente del contador

Confirmar el código 6951 y su nombre; decidir si la 659 se retira del plan o se le devuelve su nombre del PCGE; y si la 6951 se presenta dentro del costo de ventas en vez
de en el renglón «Mermas» (cambio de presentación, no de cifras).
