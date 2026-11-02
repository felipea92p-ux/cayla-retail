# ADR-0598 — La renta del año y el costo sin factura

- **Fecha:** 2026-11-02 · **Estado:** construido y probado en local; **las dos migraciones están por pegar en producción** (ver «Cómo se pega»)
- **Relacionados:** ADR-0195 F8 (Impuestos), ADR-0433 (saldo a favor de IGV al arrancar), ADR-0484 (aviso de 250 UIT), ADR-0573 (Impuestos «E · B++»),
  ADR-0362 (compras sin comprobante, decisión 50), ADR-0111 (recepciones sin comprobante), CLAUDE.md principio 9.

## El problema

Desde octubre de 2026 CAYLA declara todo lo que vende (en septiembre declaró S/ 43,186 de ventas; en octubre el ERP ya cuenta S/ 112,308). Muchos de sus
proveedores de Gamarra no dan factura: nota de venta o nada. Felipe (2026-11-02): «me está costando mucho».

Para el IGV mensual el golpe se ve y, por ahora, lo amortigua el saldo a favor (S/ 62,035 al cierre de septiembre, casilla 184 del PDT 621). El golpe
grande está en la **renta del año**, que se declara en marzo: un costo sin comprobante no se resta (Ley del Impuesto a la Renta, art. 20 y 37). Para SUNAT esa prenda
costó cero y su venta es toda utilidad, al 29,5 % sobre lo que pase de 15 UIT en el Régimen MYPE Tributario. El 1 % mensual a cuenta no lo cubre, y nada en el ERP lo medía.

Ejemplo con supuestos (no son cifras de CAYLA): S/ 1,2 millones de venta al año, 40 % de costo sin factura y S/ 300 mil de utilidad real dan
S/ 72 mil de renta si todo tuviera factura y S/ 214 mil sin ella. Está en la prueba de `renta-anual-reglas.test.ts`.

## Decisión

1. **El ERP ya sabe el papel de cada costo; se suma por proveedor y papel** (`fn_sustento_costos(desde, hasta)`, `20261102055000`, solo el líder):
   compras de mercadería y gastos (sin activos, que se deprecian), sus notas de crédito en negativo, comprobantes del Taller, gastos sin compra (con el
   papel de su viaje) y recepciones sin comprobante al costo con que entraron (sin el lote de un envío, cuya plata vive en la compra de la orden).
2. **Qué papel resta** vive en un solo lugar, `apps/web/lib/renta-anual-reglas.ts` (`clasePapel`): factura, recibo por honorarios y planilla de movilidad
   restan enteros; boleta y ticket solo hasta el 6 % de lo sustentado y 200 UIT al año (art. 37 inc. z; se asume, a favor, que quien da boleta es del
   Nuevo RUS); nota de venta, sin comprobante y cualquier papel desconocido no restan.
3. **La renta del año** = la utilidad del Estado de resultados + el costo de lo vendido sin papel (por proporción: el % sin papel de lo comprado se aplica
   al costo de lo vendido, Felipe eligió la proporción) + los gastos sin papel, en la escala del RMT, menos los pagos a cuenta (el 1 % de lo vendido). Lo que
   el sistema todavía no cubre del año se proyecta al ritmo medido.
4. **Lo de antes del sistema** (enero a septiembre de 2026, que lleva el contador) se carga en Configuración ▸ Impuestos: utilidad del contador, compras sin
   factura y renta pagada a cuenta, por año exacto. **Su contador anota solo lo que tiene comprobante** (Felipe, 2026-11-02): su utilidad ya trae como cero lo
   que no tiene papel y entra a la base tal cual. Lo comprado sin factura de esos meses solo dice cuánto costó, en «con factura en todo, la renta sería…».
5. **La escala es un parámetro, no código** (`20261102060000`): `renta_tramo_uit` 15, `renta_tasa_tramo` 0,10, `renta_tasa_resto` 0,295,
   `boletas_tope_pct` 0,06 y `boletas_tope_uit` 200, sembrados desde 2017 y heredados. Como `igv_general`, se leen y no se editan desde la pantalla.
6. **En pantalla**: Finanzas ▸ Impuestos suma la tarjeta «Renta de 2026» (lo que faltaría pagar en marzo, cuánto de eso es por lo que no tiene factura y la
   barra de lo comprado según su papel, medido desde el inicio del sistema) y la hoja «A quién pedirle factura». Esa hoja ordena a los proveedores por lo
   comprado sin factura y dice, para cada uno, la renta que se ahorraría y **hasta cuánto se le podría pagar con factura sin perder**: lo de hoy / (1 − tasa).
   El IGV de la factura se recupera aparte.

DESCARTÉ seguir cada prenda vendida hasta su compra: es exacto, pero la carga inicial y lo del Taller sin papel quedan sin dato, y cuesta mucho más.
Felipe eligió la proporción.
DESCARTÉ reutilizar `fn_impuestos_compras`: deja fuera a propósito las notas de venta, lo sin comprobante y las recepciones sin papel, que son lo que aquí
importa, y cambiarla movería el IGV.
DESCARTÉ escribir 10 %, 29,5 %, 15 UIT, 6 % y 200 UIT en el código: la prueba de Impuestos exige que ninguna cifra tributaria esté ahí.
DESCARTÉ pedir el costo de lo vendido de enero a septiembre: con un contador que no anota lo sin papel, no entra en ninguna cuenta.

## Se rompe si

- **El contador sí anota las compras sin factura** (o empieza a hacerlo): su utilidad ya no es la base y la renta de esos meses sale corta. El ADR y la
  pantalla lo dicen; hay que cambiar `previoDelAno`/`proyectarRenta` para sumarle `sinPapel`.
- **Llega mercadería con «Llegó mercadería» y después se registra su factura sin atarla a lo recibido:** el lote cuenta como sin papel además de la compra.
- **Un proveedor que da boleta no es del Nuevo RUS:** su boleta no resta nada, y la tarjeta la cuenta como si restara hasta el tope (lo favorable).
- **Los primeros meses del sistema no se parecen al resto del año** (una campaña): la proyección los multiplica. Con lo del contador cargado, el sistema
  solo cubre los meses que faltan.

## Cómo se pega en producción

1. `20261102055000_sustento_del_costo.sql`: una sola parte, una función nueva. Sin riesgo.
2. `20261102060000_renta_del_ano_parametros.sql`: **dos ejecuciones separadas** (PARTE 1, las reglas de `parametros_tributarios` y la escala; PARTE 2,
   `guardar_parametro_tributario`). Antes de la parte 2, comparar en producción
   `md5(pg_get_functiondef('retail.guardar_parametro_tributario(text, date, numeric, text)'::regprocedure))` con la de la base local de `main`. Si el ancla
   no aparece una vez, la parte 2 aborta sin tocar nada.
3. Después, la web. Si la web llega antes que el SQL, la tarjeta de la renta dice que no pudo leer y el resto de Impuestos se ve igual.

## Verificación

`pnpm pruebas:sustento-costos` (13 casos, con mutación verificada), `pruebas:impuestos` y `pruebas:no-deducible` (que ahora deshacen también esta
migración antes de re-pegar la suya), `renta-anual-reglas.test.ts` (32), `impuestos-reglas.test.ts`. En el navegador, a 1440 y 375 px, claro y oscuro,
la tarjeta y la hoja. `guias:recorrer` pasa los 16 pasos de Impuestos.
