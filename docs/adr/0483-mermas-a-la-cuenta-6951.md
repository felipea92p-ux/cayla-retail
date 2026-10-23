# ADR-0483 · Las mermas y pérdidas de inventario pasan de la cuenta 659 a la 6951

- **Fecha:** 2026-10-22 · **Estado:** construido y probado; **SQL PEGADO en producción el 2026-10-22**; **faltan el OK del contador y fusionar la web**
  (ver «Actualización 2026-10-22, noche», más abajo). Migración
  `20261023012000_mermas_a_la_cuenta_6951.sql` (versión reservada con `pnpm reservar migracion`).
  ADR-0483, reservado con `pnpm reservar adr`.
- **Decide:** Felipe, 2026-10-22: sí, antes del primer cierre de mes (octubre). Su contador/a confirma la cuenta antes de cerrar octubre (el SQL ya se pegó; si
  pide otro código, se repite la migración con ese código mientras no haya un mes cerrado).
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
**no hace nada** (aunque después se hayan cerrado meses con la 6951).

**Quién espera a quién (revisión del 2026-10-22).** Para que nadie cierre un mes entre la guarda y el final, la guarda y el «deshacer» toman `diario_cerrado`,
`periodos` y `periodo_cierres` en SHARE ROW EXCLUSIVE, en ese orden. Candar solo `periodos` NO bastaba: `cerrar_periodo` escribe en `diario_cerrado` (el diario
congelado) **antes** que en `periodos` y en `periodo_cierres` después, así que una guarda que corría en medio de un cierre pasaba de largo, sin esperar, y el mes se cerraba
con la 659 en su foto mientras el diario de hoy ya decía 6951. Se reprodujo con dos sesiones: antes del arreglo la migración terminó en 0,09 s sin esperar; después, espera al
cierre (con un cierre que dura más de 3 s, `lock_timeout` la corta limpio sin cambiar nada; con uno de 4 s, espera 2 s y pega). Qué garantiza, con exactitud: un cierre que ya
escribió en alguna de las tres tablas se ESPERA y la guarda lo ve ya cerrado; un cierre o una reapertura que llegue después queda en espera hasta que termine la
migración; las lecturas no se frenan; y vale mientras todo corra en UNA transacción (el SQL Editor lo hace). El orden es el de `cerrar_periodo` para no esperarse en
círculo con un cierre (una reapertura y el cierre de «CAYLA entera» escriben en otro orden, pero solo existen con un mes ya cerrado, donde la guarda aborta de todos
modos; si se cruzaran, Postgres corta una de las dos con un error limpio y nada queda a medias). La prueba `perdidas.mjs` (casos MC) usa dos sesiones reales: una simula el cierre a medias y la otra corre la guarda y el «deshacer»; con el candado
de antes (solo `periodos`) terminaban en milisegundos y la prueba falla.

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
(2) las dos **huellas md5** de «CÓMO VERIFICAR ANTES DE PEGAR» coinciden con producción (`select md5(pg_get_functiondef('retail.fn_asientos(date, date, uuid)'::regprocedure))` y lo
mismo para `fn_estado_resultados`; el 2026-10-22 daban `49f364de2b5c43a02a0f386cbac28d50` y `aac084b0a829d2e8f4dcf7bf365f091c`; si no coinciden, producción cambió y se revisa antes
de pegar); (3) sin meses cerrados; si el SQL Editor responde «canceling statement due to lock timeout», alguien estaba cerrando o reabriendo un mes: no cambió nada, se espera y se
pega de nuevo; (4) pegar tal cual; (5) las dos consultas de «CÓMO VERIFICAR DESPUÉS DE PEGAR»; (6) fusionar el PR de la web; (7) actualizar `docs/MANUAL-CONTABLE-CAYLA.md`
(reglas 11 y de resultados), `docs/finanzas/fases/F5.md` y `docs/datos/modulos/12-contabilidad.md`, que dicen «659 = mermas»; (8) recién entonces cerrar octubre. El «down» está en
el encabezado de la migración, ejecutable (la prueba lo corre).

## Actualización 2026-10-22, noche: el SQL ya está pegado

El paso (4) de arriba se hizo el 22-oct, **antes** del paso (1) (el OK del contador); el encabezado de la migración y las primeras versiones de este ADR todavía decían «no pegar».
Verificado ese mismo día, en solo lectura, contra producción:

| Qué | Resultado |
|---|---|
| `md5` de `fn_asientos(date, date, uuid)` | `b3ad9021b0c01eb2fc74ec548da0cadd` (el esperado «después de pegar») |
| `md5` de `fn_estado_resultados(date, date, uuid)` | `b6420d8102fb4f09ad536659534a8198` (el esperado «después de pegar») |
| literales `'659'` en `fn_asientos` | 0 |
| cuenta 6951 en `retail.cuentas` | presente |
| períodos `cerrado` | 0 (el candado no tuvo nada que impedir) |

Consecuencia: **base y web están desfasadas hasta fusionar el PR de la web.** La base ya asienta las mermas nuevas en la 6951; la web publicada en `main` todavía rotula la fila
«Mermas» con la 659 y su «De dónde sale» solo busca la 659, así que ese detalle sale vacío para las mermas nuevas. Los totales no se mueven (el Estado de resultados suma por
sección, no por código). El orden que se dio fue el que el PR ya tolera: la web nueva lee la 6951 y también la 659. Mientras tanto, nadie ha mirado la pantalla.

Lo que queda, en orden: (a) el OK del contador (abajo); (b) «Update branch», CI, «Ready for review» y fusionar el PR de la web; (c) mirar Finanzas ▸ Estado de resultados, fila
«Mermas»; (d) actualizar el manual contable y los dos documentos que dicen «659 = mermas»; (e) recién entonces cerrar octubre. Si el contador pide otro código, se repite la migración
con ese código **antes** de cerrar octubre: un mes cerrado ya no se puede cambiar.

## Pendiente del contador

Confirmar el código 6951 y su nombre; decidir si la 659 se retira del plan o se le devuelve su nombre del PCGE; y si la 6951 se presenta dentro del costo de ventas en vez
de en el renglón «Mermas» (cambio de presentación, no de cifras). **Es lo único que gobierna la fusión de la web y el cierre de octubre**: el SQL ya está en producción.
