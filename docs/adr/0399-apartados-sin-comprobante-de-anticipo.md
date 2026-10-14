# ADR-0399 — Apartados sin comprobante de anticipo: constancia al apartar, boleta o factura una sola vez, al entregar, por el total

**Fecha:** 2026-10-14
**Estado:** Aceptado y construido en local (3 migraciones + web). **SQL sin pegar en producción** (ver «Producción»). **Revisa** la decisión D1 de
[ADR-0166](0166-separaciones-con-adelanto.md) («boleta o factura de anticipo al separar, la final deduce el anticipo»).
**Decide:** Felipe, 2026-10-14, en chat: «la boleta o factura solo se emite cuando se concreta la venta por el monto total, sin siquiera
especificar el adelanto, ya que es algo pactado más que otra cosa» y «si el cliente se arrepiente se le devuelve el dinero y no se gasta ningún
correlativo innecesariamente». Arquitectura: este documento.

## El problema primero

Una clienta deja S/ 30 para que le guarden una casaca y vuelve el sábado. Con ADR-0166 el ERP emitía en ese momento una boleta de **anticipo** (un
correlativo de SUNAT) y, al recoger, una segunda boleta «por el saldo» que descontaba la primera. Dos problemas de negocio, no de código:
1. **Si la clienta se arrepiente** (el caso normal de un apartado que vence), el correlativo ya estaba gastado y había que anularlo con una nota
   de crédito (otro correlativo): dos números de la serie para una operación que nunca existió.
2. **La boleta final nunca pudo enviarse a SUNAT.** Como «deducía un anticipo», `lib/transmision-reglas.ts` la frenaba (409) hasta probar el anticipo
   con Lucode, algo que nunca se construyó: hoy ninguna venta de un apartado se declara sola.

**Analogía CAYLA:** el sobre con el adelanto detrás del mostrador. El sobre no es de CAYLA hasta que la clienta recoge; no se factura un sobre.

**Cómo se ve mal hecho:** emitir comprobante por un dinero que puede volver entero; descontar «anticipos» en la boleta final (el cliente ve dos
documentos y un descuento que no entiende); gastar correlativos que el contador luego tiene que explicar.

## Decisiones

**DECIDÍ 1 — el adelanto es un pacto interno; la clienta se lleva una constancia.** Apartar y abonar **no emiten ningún comprobante**. El ticket al apartar
es una «CONSTANCIA DE DEPÓSITO · NO ES COMPROBANTE DE PAGO» y su único número es el código del apartado (`APT-TRU-0006`), que ya existía. La boleta o factura
se emite **una sola vez, al entregar, por el TOTAL**, y no nombra ni descuenta el adelanto.
**DESCARTÉ** dejar el comprobante de anticipo y arreglar la boleta final para que se enviara: cuesta un correlativo al apartar, otro más si la clienta se
arrepiente, y obliga a construir el soporte de anticipos en Lucode (tipo de operación y deducción con referencia) que nadie ha pedido.
**SE ROMPE SI** el contador dice que un adelanto **siempre** debe declararse al cobrarse (el IGV nace al cobrar, no al entregar). Esa es la pregunta que
quedó pendiente para el contador: «el cliente deja un adelanto 100 % reembolsable para que guardemos la prenda; si recoge, se aplica al pago y la boleta
sale por el total. ¿Constancia interna y todo en la boleta final?». Si la respuesta fuera no, esta decisión se revierte en una sola migración (el camino
viejo sigue entero para los apartados que ya tienen anticipo).

**DECIDÍ 2 — el adelanto sigue siendo dato interno completo.** `separacion_pagos` y, si es efectivo, `caja_movimientos` (custodia) no cambian: el arqueo
cuadra igual. Al entregar la venta se registra por el total con el adelanto como pago de medio `anticipo` (`venta_pagos`): la caja, los medios de pago y
`fn_verificar_separaciones` siguen cuadrando. **Lo único que sale del comprobante es el adelanto.**
**DESCARTÉ** guardar el adelanto como una columna aparte en la venta: ya existe el medio `anticipo` y un segundo lugar sería dos fuentes de verdad.
**SE ROMPE SI** una pantalla muestra `venta_pagos.metodo` sin conocer `anticipo` (ya cubierto en ADR-0196).

**DECIDÍ 3 — devolver es un egreso de caja, sin nota de crédito.** `registrar_devolucion_separacion` ya registraba el egreso de la devolución en
efectivo y, para cada comprobante de anticipo, intentaba su nota de crédito; sin comprobantes de anticipo no hay nada que intentar, así que no gasta ningún
correlativo y no deja avisos «queda pendiente». Un apartado VIEJO cuya boleta se marcó «no emitida» se salta (parte 3).
**DESCARTÉ** emitir igual una nota interna: sería un documento sin contraparte.
**SE ROMPE SI** CAYLA decide quedarse con el adelanto de quien no recoge (una penalidad): ese dinero ya es ingreso y exige comprobante en ese momento. Hoy el
sistema siempre devuelve; si cambia la política, se emite ahí.

**DECIDÍ 4 — migrar sin tocar lo que ya existe.** Los apartados con boleta de anticipo (hoy uno en producción, `APT-TRU-0006`) conservan el camino de antes
(`comprobante_anticipo_id is not null` decide, en la base y en la web con `esConstancia`). Ninguna columna ni fila se borra (`comprobante_anticipo_id`,
`es_anticipo`, `anticipo_deducido`, `comprobante_anticipos`). Si su boleta nunca salió a SUNAT se regulariza con el script
`scripts/apartados/regularizar-anticipo-viejo.sql`, en dos pasos y con OK de Felipe.
**DESCARTÉ** migrar todos los datos viejos a la fuerza: tocaría comprobantes con correlativo gastado.
**SE ROMPE SI** el apartado viejo ya fue aceptado por SUNAT: entonces no se regulariza, termina por el camino de antes.

## Qué cambió (código)

| Pieza | Antes | Ahora |
|---|---|---|
| `separar_prendas` | emitía boleta o factura de anticipo | no emite; deja `comprobante_anticipo_id` en NULL |
| `abonar_separacion` | emitía el comprobante del abono | no emite |
| `entregar_separacion` | boleta por el saldo que descuenta el anticipo | un apartado sin anticipo: boleta o factura por el total, `anticipo_deducido = 0`; con anticipo: igual que antes |
| `registrar_devolucion_separacion` | nota de crédito por cada anticipo | salta los anticipos `no_emitido`/`anulado` |
| `fn_verificar_separaciones` | exigía comprobante de anticipo | exige la boleta o factura de un apartado nuevo entregado |
| Web (ticket, modales, Entregar) | «boleta de anticipo» | constancia al apartar; al entregar, la boleta se envía a SUNAT como cualquier venta |

## Producción (pegar en este orden, una por una, con huella antes y después)

1. `20261014150000_apartados_entregar_boleta_por_el_total.sql` — **primero**: con ella sola nada cambia para lo que ya existe.
2. `20261014151000_apartados_constancia_sin_comprobante.sql` — apartar y abonar dejan de emitir.
3. `20261014152000_apartados_devolver_ignora_anticipos_no_emitidos.sql`.
4. (opcional, con OK de Felipe) regularizar `APT-TRU-0006`: marcar su boleta «no emitida» en Comprobantes y después `scripts/apartados/regularizar-anticipo-viejo.sql`.

Las tres migraciones son **reemplazos anclados por tramo** y no reescrituras: el 2026-10-14 producción traía un parche vivo que `main` aún no tiene
(`fn_intento_con_huella`, rama `chaos-skill-all-screens-5c56e1`) y un cuerpo de función distinto en los comentarios. Sobrescribir las funciones enteras lo habría borrado
en silencio. Cada reemplazo falla sin tocar nada si la función viva no es la revisada y es re-ejecutable.
Web y SQL no dependen del orden de salida con una excepción: la web nueva envía la boleta final a SUNAT, y eso solo tiene sentido con la parte 1 ya pegada.

## Pruebas

`pnpm pruebas:separaciones` (84 casos: apartar/abonar/entregar/devolver sin comprobante, el camino viejo de un apartado con anticipo, re-ejecución de las migraciones y que aborten si la
función cambió), `pnpm pruebas:redondeo-efectivo` (la boleta sale por el total exacto; `scripts/pruebas/entregar-antes-de-apartados-sin-anticipo.mjs` deshace el parche para probar la migración
vieja del redondeo), `pnpm pruebas:purgar-producto` y la prueba de la guía. En navegador, contra una base propia: apartar deja 0 comprobantes y entregar deja uno por S/ 79.90 que
se manda a SUNAT (sin credenciales locales queda en la cola de reintento, no se pierde).

## Lo que no se hizo

- **Soporte de anticipos en Lucode:** no se construye (ya no hace falta); la regla de `lib/transmision-reglas.ts` que frena anticipos queda para los viejos.
- **Correlativos ya gastados:** un anticipo marcado «no emitido» deja un hueco en la serie; es el mismo tratamiento de cualquier comprobante no emitido (ADR-0093).
- **Validar con el contador** (ver «DECIDÍ 1»).
