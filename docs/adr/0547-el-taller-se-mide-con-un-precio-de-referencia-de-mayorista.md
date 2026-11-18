# ADR-0547 — El Taller se mide con un precio de referencia de mayorista, sin tocar el costo real de la prenda (enmienda a D-31)

- **Fecha:** 2026-10-27 · **Estado:** **PROPUESTO — nada construido, ninguna migración, espera el OK de Felipe.** Dinero y costos son suyos.
- **Pide:** Felipe, 2026-10-27: «el costo para el Taller nunca es igual que el de la tienda; el Taller simula un mayorista con el fin de calcular sus
  ingresos y utilidad por unidad de negocio». Acepta reabrir D-31 en una tarea aparte.
- **Enmienda:** D-31 (`docs/datos/DECISIONES-2026-09-12.md`, con sus dos enmiendas del 2026-09-21). **Ratifica y afina:** D-80, D-81 y D-82
  (`DECISIONES-2026-09-21-menu-comercial.md`), P-31 (`docs/investigacion/2026-10-16-ordenes-de-produccion-proceso-real/13-respuestas-de-felipe.md`).
- **Relacionados:** ADR-0067 (costo promedio), ADR-0156 (cotizaciones de maquila), ADR-0195/0198 (Finanzas: diario derivado, cierre por unidad y
  consolidado), ADR-0298 (costo atípico), ADR-0400 (Producción), ADR-0510 (tela y avíos de una orden), ADR-0463 (CAYLA y CLAURE).

## El pedido, y por qué no es tan contrario a D-31 como parece

D-31 dice que el Taller **no le vende a las tiendas**: el costo real viaja pegado a la prenda, y descartó el precio de transferencia porque «lo fija
Felipe, así que el resultado también lo fijaría Felipe». Lo nuevo choca con eso. Pero el repo ya se había movido, y conviene verlo en orden:

| Cuándo | Qué se decidió | Estado hoy |
|---|---|---|
| 2026-09-12 | **D-31:** costo absorbido; sin venta interna; se mide por eficiencia y contra una cotización externa | vigente en lo contable |
| 2026-09-21 | **D-80 (Felipe):** el traslado sigue siendo traslado, pero «el Taller ve un **ingreso simulado** = prendas despachadas × cotización de maquila externa; las tiendas ven esa misma cifra como su costo de referencia; el consolidado es idéntico en las dos vistas; el precio nace del mercado» | decidido, **nunca construido** |
| 2026-09-21 | **D-82:** una cotización de maquila por tipo de prenda, con fecha y vigencia → `retail.cotizaciones_maquila` + `fn_cotizacion_maquila_vigente` (ADR-0156) | construida y en producción, **0 filas, nadie la llama** |
| 2026-10-16 | **P-31:** la mano de obra del Taller sale del costo de la prenda; se ve aparte por mes («reabre D-31 en parte») | decidido |
| 2026-10-27 | Felipe: el Taller simula un mayorista | este ADR |

**Es decir:** pedir una «vista por negocio con ingreso simulado» ya estaba aprobado (D-80). Lo que sí es nuevo, y lo que este ADR decide, son dos cosas:
(1) el precio que usa el Taller es el de una **prenda terminada** (lo que cobraría un mayorista, con la tela incluida), no el de **solo el servicio de coser**
(la «maquila» de D-82); (2) hay que decir con exactitud qué se toca y qué no.

## Lo que se verificó (con su fuente) y lo que el pedido daba por hecho y no es así

| Afirmación | Resultado | Fuente |
|---|---|---|
| «`variantes.costo` por sede» | **No existe por sede.** Es una columna única por prenda, igual para las tres sedes (ADR-0298 §1), promedio ponderado de compras y de cierres de producción | diccionario; ADR-0067; ADR-0298 |
| «La cuenta `702` sembrada en 0020 contradice D-31» | **`702` no existe en producción.** El plan de cuentas vivo trae `7012 Ventas de producción propia (Taller)`, `711 Variación de productos terminados` y `211 Productos terminados` (migración `20260924235000`). Nada las asienta: `fn_asientos` no tiene regla para ellas. `docs/datos/modulos/12-contabilidad.md` describe la V1 y está viejo en este punto | consulta de solo lectura a producción, 2026-10-27 |
| «Hay costo del Taller que medir» | **Hoy no hay ninguna orden cerrada:** 4 órdenes, las 4 `en_proceso`; 0 cierres; 0 filas de `costo_historial` con origen producción; 0 cotizaciones de maquila. Los 2.787 costos que hay no vienen de producción (24 filas de historial, todas de compras; el resto no tiene historial) | idem |
| «Traslados mueve costo» | **No.** `transferencia_items` tiene variante y cantidad, sin precio; `movimientos` no guarda valor. El costo solo se mueve al **recibir** una compra o al **cerrar** una orden | diccionario; ADR-0198 |
| «Finanzas necesita eliminar la venta interna al consolidar» | Solo si la venta interna se escribe en el diario. `fn_estado_resultados` **ya** tiene una fila «Taller» y su consolidado es la suma exacta de las filas; el Taller hoy sale solo con planilla, depreciación y gastos (siempre negativo) porque no tiene ventas. Y el diario **todavía no tiene los insumos de Producción** (F5, «fuera de F5») | `20260925130000_finanzas_diario_y_estado_de_resultados.sql` |
| «El Taller es otro establecimiento de CAYLA (mismo RUC)» | Lo dijo Felipe (P-03), «no se contrastó con SUNAT». **En el sistema el Taller no tiene dirección** (`ubicacion_datos_fiscales`: solo TRU la tiene) | P-03; producción |
| «Mover entre establecimientos del mismo RUC no es una venta» | **Verificado a medias.** El Reglamento de Comprobantes de Pago (Cap. V, texto consolidado de SUNAT) lista «Traslado entre establecimientos de una misma empresa» como un **motivo distinto de «Venta»** y exige que las direcciones de partida y llegada estén **declaradas en el RUC**. **No encontré** una norma o informe que diga expresamente «no se emite comprobante ni hay IGV»: es la lectura natural (no cambia el dueño), pero queda para el contador | [`capituloV.pdf` de SUNAT](https://www.sunat.gob.pe/legislacion/comprob/regla/capituloV.pdf), [RS 004-2003](https://www.sunat.gob.pe/legislacion/superin/2003/004.htm) |
| «Precios de transferencia (art. 32-A LIR)» | Se aplican a operaciones con **partes vinculadas**. No encontré una disposición que diga qué pasa entre establecimientos de **un mismo contribuyente**; lo natural es que no apliquen (no hay dos contribuyentes), pero **no lo doy por cierto** | búsqueda; pregunta 2 al contador |

## Qué cambiaría en cada pieza

Dos formas de cumplir el pedido, pieza por pieza:

| Pieza | Hoy | Si fuera una **venta interna real** (el precio entra al libro) | Con la **lente de gestión** (propuesta: el precio vive aparte) |
|---|---|---|---|
| **`variantes.costo`** | una cifra por prenda para las 3 sedes | haría falta un costo por (prenda, sede): tabla y promedio nuevos, y el costo real quedaría solo en el Taller | **no cambia** |
| **Traslados** | variante y cantidad, sin dinero; guía de remisión aún como texto (D-83) | cada línea Taller → tienda llevaría precio; hay que definir devoluciones y tienda → tienda | **no cambia**: un traslado sigue siendo un traslado |
| **Análisis** (rinde, qué pedir, liquidar) | todo al costo único | las 3 tiendas verían un costo más alto: el GMROI cambia y reponer se decide con un número que no es el de CAYLA | **no cambia**: Análisis decide con el costo real (ver «el error de decidir con el precio del Taller») |
| **Finanzas** (ADR-0198) | diario derivado; fila «Taller» sin ventas; consolidado = suma exacta | regla de posteo nueva (7012 contra 691 por traslado), 201 por sede a precio interno y **una línea de eliminación al consolidar** que, si falta una vez, infla la utilidad de CAYLA | vista nueva **«Resultado por negocio»**: no escribe asientos; el consolidado es el del diario **por construcción** |
| **Costo atípico** (ADR-0298) | 4 puertas validan el costo real contra `variantes.costo` y el precio | el precio interno sería una 5.ª puerta que choca con la banda | **no cambia**: la referencia tiene su propia regla (vence, mínimo de datos) |
| **ADR-0510 / cierre de la orden** | el costo del cierre alimenta el promedio de la prenda en todas las sedes | **rompe esa premisa** | se mantiene |
| **Libros y SUNAT** | traslado sin comprobante | comprobante entre dos establecimientos del mismo RUC: a confirmar con el contador | nada |

## Tres formas de fijar el precio de referencia

Precio **sin IGV**, por prenda terminada. Ejemplo numérico abajo.

**A · Margen % sobre el costo real de la orden** (costo + 25 %)
- *Ganas:* no hay que conseguir ningún dato afuera; sale solo de cada orden; el Taller nunca pierde.
- *Pagas:* **el Taller gana más cuando gasta más.** Si la tela sube, el precio sube con ella y el desperdicio se lo paga la tienda. Su utilidad deja de medir
  eficiencia: es el 25 % del costo menos su planilla. Y el 25 % lo fija Felipe: justo lo que D-31 quiso evitar.

**B · Precio de mayorista de mercado, por categoría** (lo que cobraría un mayorista de Gamarra por una prenda comparable) — **recomendada**
- *Ganas:* no depende del costo del Taller ni del precio de la tienda, así que mide lo que se quiere medir: si fabricar sale mejor o peor que comprar. Cumple lo que
  D-31/D-80 pedían: «nace del mercado». Reutiliza la forma de D-82 (categoría, precio, fecha, vigencia, proveedor que la dio, solo el líder la carga; renovar es una fila nueva).
- *Pagas:* alguien tiene que conseguir y renovar las cotizaciones (cada ~6 meses por categoría, no por modelo: ~10 números en vez de ~40). Un diseño propio puede no tener
  equivalente: sale **«sin referencia»**, nunca un número inventado. Felipe sigue eligiendo *qué* cotización vale; la regla lo acota (fecha, proveedor visible, vence).

**C · Porcentaje del precio de etiqueta** (50 % de lo que cuesta en tienda)
- *Ganas:* un solo número, sin cotizaciones; sube y baja con el precio.
- *Pagas:* el resultado del Taller pasa a depender de qué tan caro cuelga CAYLA la prenda, no de cómo la fabrica. Si el precio fuera el realizado, una campaña del 30 % la pagaría el Taller
  (hay que atarlo al precio de etiqueta). Y el porcentaje, otra vez, lo fija Felipe.

### Ejemplo numérico (ilustrativo: números armados para este ADR, no de producción, donde no hay órdenes cerradas)

Una blusa. **Costo real de la orden: S/ 40,00** = tela 24,00 + avíos 4,00 + servicios de afuera 12,00 (costura y planchado, lo devengado por fase). **Costo propio del Taller:
S/ 6,00 por prenda** (planilla + gastos del Taller ÷ prendas buenas del mes; fuera del costo de la prenda, P-31). **Precio de etiqueta S/ 118,00 con IGV = S/ 100,00 sin IGV.**

| Por prenda vendida (sin IGV) | Precio de ref. | **Taller** | **Tienda** | Suma = lo real |
|---|---|---|---|---|
| **Hoy (D-31)** | — | **−6,00** (gasto sin ingreso) | **+60,00** | 54,00 |
| A · costo + 25 % | 50,00 | +4,00 | +50,00 | 54,00 |
| **B · mayorista de mercado** (cotización de S/ 55) | 55,00 | **+9,00** | **+45,00** | 54,00 |
| C · 50 % de la etiqueta | 50,00 | +4,00 | +50,00 | 54,00 |

**Qué enseña:** el precio no crea ni quita plata: **parte en dos el margen que ya existía** (60,00 menos 6,00 del Taller). La suma da 54,00 en todas las filas.
Hoy el Taller parece una pura pérdida (−6,00) y la tienda parece ganar todo (+60,00); con B se ve que fabricar rinde +9,00 contra comprar afuera.

**Si la tela sube de 24 a 40** (costo real S/ 56,00; suma real 38,00):

| | Taller | Tienda | Suma |
|---|---|---|---|
| Hoy | −6,00 | +44,00 | 38,00 |
| A · costo + 25 % (precio sube a 70) | **+8,00** (¡gana más!) | +30,00 | 38,00 |
| **B · mayorista** (sigue en 55) | **−7,00** (la señal) | +45,00 | 38,00 |
| C · 50 % etiqueta | −12,00 | +50,00 | 38,00 |

Con A, el desperdicio le sube la utilidad al Taller y se lo cobra a la tienda. Con B, el Taller sale en rojo (56 + 6 = 62 contra 55 afuera) y la tienda no paga por el desperdicio ajeno.

## El error de decidir con el precio del Taller

Con la tienda viendo «45,00 de margen» y un proveedor que ofrece una prenda a 52,00, comparar 55 contra 52 le dice que compre afuera. Para CAYLA la prenda del Taller cuesta 40,00 (más una
planilla que se paga igual): comprar afuera pierde 12,00. Es el clásico precio de transferencia que **parte la decisión del grupo**. Por eso:

- **Reponer y liquidar (Análisis, Frescura, plan de compras) siguen al costo real.** Es el costo para CAYLA.
- **El margen «a precio del Taller»** vive solo en Finanzas ▸ «Resultado por negocio», rotulado como cifra de gestión.
- **Mide unidades de negocio, no personas** (feedback de Felipe, 2026-10-04: sin bonos ni ranking individual): ninguna de estas cifras sale por colaborador.

## Decisión propuesta

```
DECIDÍ:    Dos lentes sobre un solo libro. El libro (variantes.costo, venta_items.costo_unitario, el diario, SUNAT) sigue en COSTO REAL: D-31 se mantiene en lo contable
           (el Taller no vende, no hay comprobante ni asiento 7012). Se agrega una LENTE de gestión, «Resultado por negocio», que parte el margen de cada venta de una prenda
           propia en dos: la parte del Taller (precio de referencia − costo real) y la parte de la tienda (precio de venta sin IGV − precio de referencia). El precio de referencia es
           el de un mayorista de mercado por categoría, con fecha y vencimiento (opción B), guardado aparte y nunca escrito en un costo.
           Se reconoce la parte del Taller AL VENDERSE la prenda, y además cada orden cerrada dice «esta orden costó S/ 40, un mayorista cobraría S/ 55» (medida por orden).
DESCARTÉ:  (1) La venta interna real (el precio entra al libro): exige un costo por (prenda, sede) con su propio promedio y su propia banda de atípicos, una regla de posteo nueva y
           una línea de eliminación que, olvidada una sola vez, infla la utilidad de CAYLA; rompe la premisa de ADR-0510; y pide un comprobante entre dos establecimientos del mismo RUC
           que quizá no corresponda. (2) Reconocer el ingreso del Taller al entregar la prenda a la tienda: parece más justo con el Taller, pero deja prendas del Taller en tienda valuadas a
           precio interno, y para consolidar hay que calcular la «utilidad aún no vendida» capa por capa (un costo por sede otra vez). Al vender, los dos precios se cancelan al céntimo sin
           tablas nuevas. (3) Dejar D-31 intacto: el Taller seguiría siendo un puro gasto en el Estado de resultados, que es lo que Felipe pidió dejar de ver. (4) Usar la maquila de D-82 como
           precio: es el precio de coser, sin la tela; serviría si el Taller fuera maquilador (CAYLA pone la tela, P-01), no un mayorista.
SE ROMPE SI: (a) la referencia vence o falta y nadie la renueva: el Taller sale «sin referencia» (a propósito: sin dato no hay cifra), y Felipe pierde su medida hasta renovarla; (b) alguien carga
           una cotización con fecha pasada y cambia el resultado de un mes ya mirado: hay que impedir fechas anteriores a la última o congelar la vista al cerrar el mes; (c) la planilla del
           Taller no es visible para quien mira (Dynamic la limita a admin/líder): la utilidad saldría inflada, así que se muestra «falta la planilla», no una cifra; (d) una variante se produce
           Y se compra a un proveedor: no se sabe cuáles unidades vendidas fueron del Taller; esas ventas salen en una línea «sin atribuir», nunca repartidas en silencio; (e) el Taller
           produce algún día para CLAURE (otro negocio con el mismo RUC emisor): ahí sí habría una venta entre negocios distintos y se decide aparte; (f) alguien usa el margen a precio
           del Taller para decidir reponer o liquidar.
```

## Cómo se atribuye una venta al Taller (sin columna nueva)

Una prenda es «propia» si su variante tiene al menos una entrada de stock con `movimientos.produccion_id` (o sea, salió de una orden cerrada). CLAURE y lo comprado a proveedores quedan fuera por construcción.
Una anulación, devolución o cambio de esa venta revierte su parte del reparto porque se calcula **a partir de las mismas líneas que ya usa el diario**, no de `venta_items` por su lado.

## Números (orden de magnitud, antes de elegir)

Producción tiene 1.373 ventas hoy; aun si todas fueran prendas propias, el reparto lee unas pocas miles de filas por mes: no hace falta índice, caché ni tabla materializada.
La tabla de referencias: ~10 categorías × 2 cotizaciones al año = ~20 filas al año.

## Qué le pregunto a Felipe (cada una cambia lo que se construye)

1. **¿El Taller compra la tela y vende la prenda (mayorista), o CAYLA pone la tela y el Taller cobra por coser (maquilador)?** Hoy la tela la pone CAYLA (P-01). Si es maquilador, el precio es el de
   D-82 tal como está construido y esto se achica. Si es mayorista, hay que distinguir en `cotizaciones_maquila` si la cifra es de servicio o de prenda terminada (la tabla tiene 0 filas: cambiarla hoy es barato).
2. **¿Opción B (mayorista de mercado por categoría)?** Recomendada. La alternativa realista es A o C con un porcentaje que tú fijas, sabiendo lo que cuesta (arriba).
3. **¿El ingreso del Taller se cuenta al vender la prenda (recomendado) o al entregarla?** Al entregarla es más justo con el Taller en los meses en que las tiendas cargan stock, pero cuesta el costo por sede.
4. **¿Quién ve la utilidad del Taller?** Propongo solo el líder (la planilla ya es de admin/líder en Dynamic). Y la tienda, ¿ve su margen a precio del Taller? Propongo que sí, rotulado, como el resto de costos (D-27).
5. **¿El Taller producirá alguna vez para CLAURE?**

**Si no respondes, no construyo nada:** el ADR queda propuesto y el sistema sigue como hoy.

## Qué le preguntamos al contador (verificar, no asumir)

El Taller figura como otro establecimiento de CAYLA en Gamarra, con el mismo RUC (P-03). Por eso la cifra debería ser **de gestión interna, sin comprobante**. Falta confirmarlo:

1. **Traslado Taller → tienda con el mismo RUC:** ¿es solo «traslado entre establecimientos de la misma empresa» con guía de remisión, sin comprobante de pago, sin IGV y sin ingreso gravado? ¿Algún efecto en renta o IGV por el solo traslado (retiro de bienes)?
2. **Precio de referencia solo de gestión:** ¿confirma que no tiene efecto tributario ni hay que declararlo? ¿Los precios de transferencia (art. 32-A LIR) quedan fuera por ser un solo contribuyente?
3. **Costo de ventas legal:** ¿debe incluir la mano de obra directa y los gastos de producción del Taller (NIC 2 / PCGE), hoy fuera del costo de la prenda por P-31? Define la base del «costo real» y el costo computable para renta.
4. **Establecimiento anexo:** ¿el Taller está declarado en el RUC con su dirección? Sin eso no hay punto de partida válido para la guía (hoy el sistema tampoco tiene su dirección).
5. **Plan de cuentas:** ¿se retiran `7012` y `711` (sin uso, con un solo contribuyente) o se dejan para el día en que el Taller sea otra razón social? Ese día sí sería una venta con comprobante, y el precio de referencia ya estaría listo.
6. **Rotulado:** ¿la vista de gestión debe decir «no contable» o «informativa»?

## Cómo se construiría (después del OK, un paso a la vez)

1. **Referencia.** Ampliar `cotizaciones_maquila` con el tipo de cifra (servicio o prenda terminada) si Felipe responde «mayorista»; cargar las primeras cotizaciones reales. Una migración pequeña; `alter table` y políticas en partes separadas (ADR-0195). *Se verifica:* el líder carga una cotización y ve «vigente hasta…».
2. **Reparto.** `fn_resultado_por_negocio(desde, hasta)`, solo lectura, con su invariante: la suma de las partes del Taller y de las tiendas en prendas propias **es igual** al margen del diario en esas líneas, al céntimo. *Se verifica:* prueba SQL con ventas, anulaciones, devoluciones y cambios.
3. **Pantalla.** Finanzas ▸ Resultados: filas Taller / Tiendas / Consolidado, y en la página de cada orden cerrada «costó S/ X, un mayorista cobraría S/ Y» (guía de foco, guía interactiva y `/formidable` por ser pantalla nueva).
4. **Limpieza.** `apps/web/lib/eficiencia-reglas.ts` todavía dice que la cotización se descartó el 2026-09-22 (primera enmienda), contradicha por la segunda: se corrige ahí al conectar la referencia.

Ningún paso toca `variantes.costo`, `movimientos`, `transferencia_items`, el diario, el cierre de mes ni SUNAT.

## Texto de la tercera enmienda a D-31 (se agrega a `DECISIONES-2026-09-12.md` solo cuando Felipe apruebe)

> **Tercera enmienda (2026-10-27, Felipe, ADR-0547):** el Taller sigue sin venderle a las tiendas en lo contable (sin comprobante, sin asiento, el costo real viaja con la prenda). Para medir su
> ingreso y utilidad por unidad de negocio, Finanzas suma una **lente de gestión** que parte el margen de cada prenda propia entre el Taller y la tienda con un **precio de referencia de mayorista de
> mercado** por categoría. El precio nunca se escribe en un costo y no lo inventa Felipe: sale de una cotización con fecha y vencimiento.

## Lo que este ADR no cubre

- La **guía de remisión** de los traslados Taller → tienda (D-83, «segunda etapa») y la dirección del Taller. Es una obligación aparte; ver pregunta 4 al contador.
- El **costo de la mano de obra** dentro de la prenda (P-31): se pregunta al contador, no se cambia aquí.
- Cualquier cifra real: no hay órdenes cerradas ni cotizaciones. El primer número verdadero aparece con la primera orden que cierre.
