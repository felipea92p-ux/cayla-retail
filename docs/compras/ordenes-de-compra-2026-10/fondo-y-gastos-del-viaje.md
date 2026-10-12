> Anexo de diseño de ADR-0362 (sesión «Flujo de órdenes de compra», 2026-10-07/08). Salida de un workflow de agentes: **las
> decisiones de Felipe en `docs/adr/0362-ordenes-de-compra-y-despacho-a-sedes.md` mandan sobre este texto** donde choquen.
> Flujo recomendado de fondo por rendir y gastos del viaje (ganó el enfoque mínimo). Felipe decidió después: los gastos adicionales NO entran al costo de la prenda (decisión 20).

# Fondo por rendir y gastos del viaje: flujo recomendado

**Base:** el enfoque mínimo. Lo eligieron los jueces encargada y ERP. Le sumo la rendición congelada del ERP, las frases y el «Cuadra» del brief, y los candados del contador. Todo esto toca el esquema, el dinero y el costo, así que nada se construye sin tu OK.

## A. Lo que vive la encargada

1. **Le entregan el fondo.** El líder abre Finanzas ▸ Dinero y toca «Entregar fondo». Elige a quién, de dónde sale la plata (un banco o una caja fuerte), el monto y para qué, por ejemplo «Compras Gamarra 8-oct». Así se abre la rendición. Solo el líder entrega fondos.
2. **Lo ve en Compras.** Le aparece una tarjeta: «Tu fondo · Compras Gamarra 8-oct · Te quedan S/ 3 000». No es un módulo nuevo, es una función de Compras (ADR-0306).
3. **Paga al proveedor.** En la orden de compra toca «Pagar». «¿De dónde sale la plata?» ya viene con «Mi fondo» elegido, y ella solo escoge el medio.
4. **Anota un gasto.** Toca «Anotar gasto del viaje». La primera pregunta es qué fue:
   - **«Lo que trae la mercadería»** (flete, agencia, cargador, embalaje). Las órdenes de compra del día ya vienen marcadas y ella puede desmarcar alguna.
   - **«Gasto tuyo del viaje»** (pasaje, hotel, comida, taxi). No se le pregunta nada más.
5. **Dice cómo pagó.** Pone el monto y responde «¿Ya lo pagaste?»: «Sí, de mi fondo» o «No, se paga después». Toma la foto del comprobante.
   - **Sin comprobante:** si no lo tiene, toca «No tengo comprobante» y escribe qué fue, a quién le pagó y por qué no hay comprobante. Es un camino del sistema, no una falta.
   - **Con depósito o Yape:** la pantalla le pide dos fotos, el voucher (prueba que pagó) y el comprobante (dice qué compró). Si falta una, le dice cuál.
6. **Despacha a las sedes.** El flete de Lima a cada sede se anota con el mismo botón, eligiendo la guía de despacho.
7. **Rinde.** Al volver toca «Rendir mi fondo». Cuenta su efectivo, escribe la cifra y la pantalla responde «Cuadra» o «Te faltan S/ 20: escribe por qué». «2 gastos sin foto» se puede tocar y la lleva a cada gasto.
8. **Devuelve lo que sobró.** El monto ya viene con el saldo. Elige «Lo deposité» (banco y n.º de operación) o «Lo dejé en la caja fuerte de TRU». Si gastó de más, la hoja dice «Te deben S/ X» y el líder se lo repone con «Entregar fondo».
9. **El líder cierra.** Ve la lista y toca «Cerrar rendición». Si hay diferencia, no cierra sin escribir el motivo. Ella no maneja estados de revisión.

## B. Cómo se ven el saldo y la rendición

- **Tarjeta del fondo** (Compras, para ella): para qué es, desde cuándo, *Te entregaron · Gastaste · Te queda*. Se actualiza en cuanto guarda algo.
- **Hoja de la rendición:**
  - cuatro líneas: Entregado 3 000 · Pagaste a proveedores 2 400 · Gastos del viaje 380 · **Te queda 220**;
  - debajo, cada pago y cada gasto, y los que no tienen comprobante marcados «sin comprobante»;
  - el campo «Cuenta tu efectivo» → «Cuadra»;
  - al pie de la hoja, «Falta: …» tocable (guía de foco).
- **Finanzas ▸ Dinero** (para el líder): cada fondo sale en «Cajas fuertes y efectivo por rendir» con el nombre de su dueña, el saldo y los días que lleva abierto. La cuenta actual «Efectivo entregado al líder» sigue igual.
- **Saldo negativo:** el fondo puede quedar en negativo, con un aviso. Bloquear el gasto la dejaría sin poder pagar a mitad del viaje.

## C. Costo de llegada contra viáticos

- **Flete de la compra (categoría `flete_compra`, cuenta 609):**
  - se liga a una o varias órdenes de compra, porque un fardo trae varias;
  - al cerrar la recepción, la RPC reparte lo que falta pasar de cada flete ligado **por valor**: `parte = monto × valor_línea_recibida / valor_total_órdenes`;
  - esa parte se suma al `costo_unitario` antes de `fn_recalcular_costo_variante`;
  - con factura entra la base sin IGV (el IGV va a crédito fiscal). Con boleta o sin comprobante entra el total.
- **Flete que llega tarde, con prendas ya vendidas:**
  - no se toca ningún costo pasado y `costo_historial` queda igual (principio 1);
  - lo que no alcanzó a pasar al costo queda en la línea `fletes` del Estado de resultados del período;
  - el total de la empresa sale exacto. Lo que se pierde es que el margen por prenda de ese lote sale algo más alto;
  - para que pase poco, el cierre de la recepción muestra «Fletes de esta compra anotados: S/ 120 · ¿Falta alguno?».
- **Flete de Lima a cada sede:** mi recomendación es tratarlo como costo de llegada. La regla queda en una frase: **hasta que la prenda entra por primera vez a una sede, todo es costo; después, todo es gasto.** Es el mismo mecanismo, ligado al despacho y aplicado al recibir en la sede. El costo de la empresa sale correcto. Lo que pasa es que el flete a AQP se promedia con el costo de TRU (pregunta 3).
- **Viáticos (categoría `viajes_compra`, cuenta 631):** son gasto, nunca costo. Un traslado entre sedes ya en stock sigue en `transporte` (631).

## D. Modelo de datos mínimo

| Pieza | Qué cambia | ¿Se reusa? |
|---|---|---|
| `cuentas_dinero` | Columna nueva `persona_id` (solo `por_rendir`, no se puede cambiar). `cuentas_dinero_por_rendir_uq` pasa a ser dos índices únicos: uno para el líder (`persona_id is null`) y otro `(persona_id) where tipo='por_rendir' and archivada_en is null`. Un fondo se archiva solo con saldo 0 y sin rendición abierta. | Reusa la tabla |
| `movimientos_dinero` | Tipos nuevos `entrega_fondo` (banco o caja fuerte → fondo) y `devolucion_fondo` (fondo → banco o caja fuerte), en el CHECK de puntas, en `fn_movimientos_dinero_validar` y en `cuentas-dinero-reglas.ts`. `entre_cuentas` sigue siendo solo de banco a banco. Con tipo propio, el diario puede llevarlo a la 1413 si el contador lo confirma. | Reusa |
| `fn_cuenta_sellada` | Un fondo de persona lo mueve su dueña (`fn_actor_persona_id(false) = persona_id`) o el líder. | Reusa |
| `fn_cuenta_sirve` | Un fondo de persona acepta efectivo, Yape y transferencia; el medio queda como dato. | Reusa |
| `categorias_gasto` | Dos filas nuevas: `flete_compra` → 609 y `viajes_compra` → 631. | Reusa |
| `gastos` | Columnas nuevas `sustento` (`comprobante`, `planilla_movilidad`, `sin_comprobante`) y `motivo_sin_comprobante`. | Reusa |
| `gasto_ordenes_compra` (nueva) | `(gasto_id, orden_compra_id)` o `despacho_id`. Solo se agregan filas. | Nueva |
| `gasto_al_costo` (nueva) | `(gasto_id, recepcion_id, monto)`, única por par. Solo se agregan filas; RLS encendido sin políticas. | Nueva |
| `rendiciones` (nueva) | `cuenta_dinero_id`, `motivo_viaje`, `abierta_en`, `corte`, estado abierta o cerrada. Al cerrar se congelan `entregado`, `gastado`, `devuelto`, `efectivo_declarado`, `diferencia`, `motivo_diferencia`, `cerrada_por`. Una sola abierta por cuenta, y no se edita después de cerrada. | Nueva |
| RPC | `entregar_fondo`, `devolver_fondo`, `registrar_gasto_viaje` (nueva, para no hacer `drop` de `registrar_gasto`: con dos firmas, una llamada de 13 parámetros falla por ambigüedad), `cerrar_rendicion` y las de lectura `fn_mi_fondo` y `fn_rendicion_detalle` (cubiertas por el prefijo `fn_` de la espera). | Nuevas |
| Cierre de recepción (ADR-0361) | Engancha el reparto antes de `fn_recalcular_costo_variante`. **Bloqueante:** hay que acordar ese punto con la sesión de Recepción antes de escribir la migración. | Contrato |
| Estado de resultados y diario | `fletes` = gastos 609 − `gasto_al_costo`. Lo pasado al costo se asienta 20/609 y llega al resultado por el costo de ventas. | Reusa |

Todas las funciones firman con `fn_actor_persona_id(true)` y usan el combo Responsable. Pagar o anotar desde el propio fondo se permite sin el módulo Finanzas.

## E. Reglas contra el doble conteo

1. **Un hecho, un egreso:** toda salida del fondo es una sola fila sellada con `cuenta_dinero_id`, en `compra_pagos`, `gastos` o `movimientos_dinero`. Si el gasto tiene comprobante, el pago va solo por `compra_pagos` (lo exige el CHECK `gastos_pago_coherente`).
2. **Entregar y devolver no son gasto:** son tipos propios entre cuentas, y la caja total de CAYLA no cambia.
3. **Mercadería contra servicio:** una compra que respalda un gasto no puede tener líneas de mercadería, como hoy `fn_egreso_ya_usado` impide reusar un egreso de caja. Además, un disparador solo deja ligar a una orden de compra los gastos de `flete_compra`.
4. **Del flete al costo una sola vez:** el único `(gasto_id, recepcion_id)`, el `for update` sobre el gasto y la suma de `gasto_al_costo` acotada a `gastos.monto`.
5. **Período cerrado:** un disparador rechaza todo movimiento de esa cuenta con fecha igual o anterior al `corte` de una rendición cerrada.
6. **Doble clic:** cada RPC que guarda lleva una clave del cliente única.
7. **Sin señal en Gamarra (principio 9):** lo anotado queda en el teléfono como pendiente y se envía solo cuando vuelve la señal, con esa misma clave para que no se duplique. Esto puede ir en una fase 2.

## F. Preguntas para Felipe

1. **¿Un fondo por persona o uno por viaje?**
   - (a) Por persona, permanente, con una rendición por viaje.
   - (b) Un fondo nuevo en cada viaje.

   **Recomiendo (a):** el viaje queda nombrado en la rendición y no hace falta una tabla de viajes.
2. **Si al rendir falta plata sin explicación:**
   - (a) queda como deuda de la persona, visible hasta saldarse, y solo se le descuenta con su autorización escrita;
   - (b) la asume CAYLA como gasto;
   - (c) se le descuenta por planilla en Dynamic.

   **Recomiendo (a):** es lo que pide el contador (una cuenta por cobrar, no un gasto).
3. **El flete de Lima a cada sede:**
   - (a) costo de llegada, aplicado al recibir en la sede;
   - (b) gasto 631 de la sede de destino.

   **Recomiendo (a):** coincide con la NIC 2 y con la regla «hasta la primera entrada a sede, todo es costo», aunque el flete a AQP se promedie con TRU.
4. **Gastos sin comprobante:**
   - (a) se acepta una planilla de movilidad solo para taxi y cargador, con tope diario (4 % de la RMV, a confirmar con el contador); hotel y comida, solo con comprobante;
   - (b) se acepta todo con motivo;
   - (c) no se aceptan.

   **Recomiendo (a).**
5. **Pagos de S/ 2 000 o más en efectivo (Ley 28194):** si se pagan así, se pierden la deducción y el crédito fiscal.
   - (a) bloquearlos, con la salida «págalo por transferencia desde la cuenta de CAYLA»;
   - (b) permitirlos marcados «no deducible».

   **Recomiendo (a).** También pregúntale al contador si pagar desde el Yape personal de la encargada vale como bancarización, y si el fondo va a la 101 o a la 1413.

ADR en borrador: `/Users/claudiapereyra/Proyectos /cayla-retail/.claude/worktrees/determined-thompson-f7b8d8/docs/adr/0362-ordenes-de-compra-y-despacho-a-sedes.md`

---

# Juicios

## Juez encargada
**Cómo las juzgo:** la encargada está en Gamarra con el celular en una mano y el fardo en la otra, y paga en efectivo o con depósito. Necesita poder registrar algo en menos de 5 segundos, con una sola pregunta por pantalla.

## Enfoque mínimo: 7.5/10
- **Pocos toques.** Pagar al proveedor cuesta cero toques extra, porque «Mi fondo» ya viene elegido. Un flete o un viático se anota en unos 6 toques: tarjeta, anotar, tipo, monto, medio y foto. Devolver viene con el monto puesto. Las dos opciones, «Flete de la compra» y «Viáticos», se entienden solas.
- **No le pide nada al rendir.** «Te entregaron · Gastaste · Te queda», y si gastó de más, «Te deben S/ X». Eso cumple la ley 2: una pregunta, una respuesta.
- **Falla en lo que más va a pasar.** No dice qué hacer si pierde un comprobante. Tampoco le hace contar el efectivo, así que un descuadre no se ve hasta que alguien lo busca. Y como no hay un corte por viaje, el viaje de octubre se mezcla con el de noviembre en la misma lista.

**Conservaría:** «Mi fondo» ya elegido al pagar, «Te deben S/ X» y devolver con el saldo ya escrito.

## Enfoque brief: 6.5/10
- **Las mejores palabras de las tres.** «Lo que trae la mercadería» frente a «Gasto tuyo del viaje», y «¿Ya lo pagaste? Sí, de mi fondo / No, se paga después». Es lenguaje de tienda (ley 4), sin jerga.
- **El lugar equivocado.** Los gastos viven dentro de la orden de compra. Para anotar un taxi o el almuerzo tendría que abrir una orden que no tiene que ver con ese gasto, y un fardo con tres órdenes la obliga a decidir a cuál cargarlo. Además, la vista previa «+S/ 0.85 por polo» le muestra cálculos de costo que no son su problema: rompe las leyes 3 y 8. Son unos 8 toques por gasto.
- **La mejor rendición.** Cuenta su efectivo, escribe 220 y la pantalla dice «Cuadra». «2 gastos sin foto» se puede tocar y lleva al gasto. Así sí detecta el comprobante perdido, aunque tampoco dice qué hacer con él.

**Conservaría:** las dos frases de tipo, la pregunta «¿Ya lo pagaste?», el contar el efectivo hasta que diga «Cuadra» y la lista tocable de «sin foto».

## Enfoque ERP: 6/10
- **El único que trata el comprobante perdido.** Cada línea sale como «sin comprobante», y si la cuenta no da cero no se cierra sin un motivo. El «para qué» de la entrega («Compras Gamarra 8-oct») le da nombre al viaje sin crear una tabla de viajes.
- **Demasiados estados para ella.** Abierta, por revisar y cerrada, más «Enviar a revisión». Le exige entender un proceso de aprobación que ni siquiera es suyo. Al pagar tiene que elegir fondo y medio, y al anotar un gasto marcar órdenes o un despacho. Son unos 7 toques, con una decisión que ella no tiene por qué saber resolver: «¿orden o despacho?».
- **Lo de fondo no le cambia nada en la calle.** Los costos de llegada y las tres tablas están bien pensados para la contabilidad, pero desde el celular no se notan.

**Conservaría:** «sin comprobante» marcado en la línea, el motivo obligatorio cuando hay diferencia y el «para qué» al entregar el fondo.

## Lo que ninguna de las tres resuelve
1. **El comprobante perdido como camino, no como falta.** Un botón «No tengo comprobante» que abra una línea de planilla de movilidad: qué fue, a quién se le pagó y por qué no hay comprobante. Debe aceptar como respaldo la foto del voucher del depósito o la captura del Yape. Sin esto, va a anotar el gasto «después» y se le va a olvidar.
2. **El depósito no es un comprobante.** El voucher prueba que pagó, no qué compró. Cuando paga con depósito, la pantalla tiene que pedirle las dos fotos o decirle cuál le falta.
3. **Sin señal en Gamarra (principio 9).** Lo anotado debe quedar guardado en el teléfono como pendiente y enviarse solo cuando vuelva la señal. Si no, lo va a anotar en papel.
4. **La orden de compra solo cuando hace falta.** En el flete, sugerir las órdenes del día ya marcadas. En el viático, no preguntar nada.

## Mi recomendación
Usar como base el **mínimo**: el fondo por persona, «Mi fondo» ya elegido y nada nuevo en el menú. Sumarle las frases y el «Cuadra» del **brief**, y el «sin comprobante» con motivo del **ERP**. La revisión del líder la dejaría como una lista que él mira, no como un estado que ella tenga que mover. Con eso estimo que llega a 8.5–9.

## Juez contador
# Las tres propuestas vistas por el contador

## Huecos que tienen las tres

1. **Falta la Ley 28194.** Ninguna propuesta la menciona. Toda obligación de S/ 2 000 (o US$ 500) o más se paga con un medio de pago del sistema financiero. Lo que cuenta es el total de la obligación, no la cuota. Si la encargada paga en efectivo los S/ 2 400 de Gamarra desde el fondo, la empresa pierde la deducción del costo y el crédito fiscal del IGV. Hace falta un candado en el pago: si el comprobante pasa el umbral y el medio es efectivo, se bloquea o queda marcado «no deducible». Además, pagar desde la cuenta personal de la encargada no deja claro que el pago lo hizo CAYLA, porque el medio de pago es de un tercero.
2. **Compra sin factura.** Si hay boleta o no hay comprobante, el IGV no se recupera y va entero al costo. Si no hay comprobante, el costo tampoco tiene sustento tributario. El costo de la prenda debe distinguir esos casos y no ignorarlos.
3. **El fondo es un anticipo (cuenta 1413, entregas a rendir), no plata en caja (101).** Si al rendir falta plata, la diferencia es una cuenta por cobrar a la persona. No es un gasto. Solo se le puede descontar con su autorización por escrito.

## Enfoque mínimo: 5/10

- **Anticipo:** entrega y devolución van como `entre_cuentas`, sin un tipo propio. El contador no puede separar en el diario lo que es 1413 de un traslado entre cajas. Tampoco hay rendición formal (liquidación firmada, motivo de la diferencia, cierre), que es lo primero que pide una fiscalización.
- **Costo del inventario:** el flete que llega tarde se va entero a la cuenta 609, incluida la parte de prendas que siguen en stock. Eso deja el inventario por debajo y el costo de ventas por encima. El flete de Lima a la sede va como gasto 631, aunque la NIC 2 manda sumar al costo el transporte que pone la mercadería en su lugar de venta. La razón que da (el costo es un solo promedio para todas las sedes) es técnica, no contable.
- No dice nada del IGV del flete ni del sustento de los viáticos.
- **Idea que conservo:** el comprobante del transportista se registra con `compra_id` y se paga por `compra_pagos`. Así entra a Por pagar y al registro de compras, y la salida de plata se cuenta una sola vez.

## Enfoque fiel al brief: 7.5/10

- **Costo correcto:** un CHECK obliga a que absorbido + pendiente + a resultado sume exactamente lo asignado. A la cuenta 609 solo va la parte de lo ya vendido. El reparto por valor, sin IGV cuando hay factura, se cuadra al céntimo. El flete de Lima a la sede va al costo, como pide la NIC 2.
- **Anticipo bien separado:** tipos propios `entrega_fondo` y `devolucion_fondo`, efectivo declarado contra lo que da el sistema, y un candado que impide cargar movimientos con fecha dentro de una rendición cerrada.
- **Le falta:** deja el IGV del flete y la planilla de movilidad como preguntas abiertas, y no dice nada de la bancarización. Un flete «no pagado aún» con factura tiene que cumplir la misma regla de los S/ 2 000.
- **Idea que conservo:** la tabla de reparto con el CHECK de suma exacta, y la clave de idempotencia `(gasto_id, variante_id)`.

## Enfoque ERP: 8/10

- **Anticipo:** es el único que pregunta por la cuenta 1413 frente a la 101. Su rendición pasa por revisión del líder y no se cierra sin el motivo escrito de la diferencia. Es lo más cercano a una liquidación de rendición que se puede auditar.
- **Un hecho, un solo egreso:** agrega un candado para que el comprobante de un gasto no tenga también líneas de mercadería, igual que hoy hace `fn_egreso_ya_usado`. Un disparador obliga a que lo que va a inventario más lo que va a resultado sume el flete sin IGV, y el período queda cerrado después del corte.
- **Débil:** recomienda repartir el flete por unidades. Por valor (o por peso) distorsiona menos el costo de una casaca frente al de un polo. También le falta la Ley 28194.
- **Idea que conservo:** la regla «hasta la primera entrada al stock de una sede todo es costo; después todo es gasto». Es clara, coincide con la NIC 2 y se le explica a la encargada en una frase.

## Cómo las combinaría

Tomaría el modelo de rendición del ERP, el reparto por valor con CHECK de suma del brief y el cobro por `compra_pagos` del mínimo. Encima, cuatro reglas:

- el candado de bancarización en el pago;
- `con factura` / `boleta` / `sin comprobante` en todo gasto y compra, con el IGV al costo cuando no se recupera;
- la planilla de movilidad, con un tope de 4 % de la RMV por día, solo para movilidad;
- hotel y comida, solo con comprobante.

Todo esto toca dinero y esquema, así que espera el OK de Felipe. Antes, el contador tiene que confirmar el uso de la 1413 y la regla de la planilla de movilidad.

## Juez erp
**Veredicto: el enfoque mínimo es la base (8/10), con la rendición congelada y los candados que aportan los otros dos.**

Comprobé tres cosas en el esquema antes de puntuar:
- **`costo_historial`:** `movimiento_id` es `not null unique` y `origen` solo acepta `('compra','produccion')` (`20260916090000_costo_promedio_ponderado.sql:49-50`). La vista de historial lo une a `movimientos` con un join interno (`:246`).
- **`entre_cuentas`:** hoy solo va de banco a banco (`20260925110000_finanzas_cuentas_y_dinero.sql:295`).
- **`por_rendir`:** su índice único es por tipo (`:99`), así que hoy solo puede existir una.

## Enfoque mínimo: 8/10
1. **Principios 2 y 4 sin tocar el núcleo de costo.** `gasto_al_costo` solo agrega filas y es única por `(gasto, despacho)`. Sube el `costo_unitario` antes de `fn_recalcular_costo_variante`, así que `costo_historial` queda igual. Ninguna fila cambia de estado y no hay columnas `pendiente`/`absorbido` que se actualicen.
2. **El flete de Lima a cada sede como gasto es lo único coherente con `variantes.costo`**, que es un promedio único para todas las sedes. Llevarlo al costo haría que el flete a AQP encarezca la prenda en TRU.
3. **Punto débil:** el viaje como «tramo entre rendiciones» sin una tabla deja abierto el pasado. Un gasto anotado con fecha anterior cambia una rendición que ya se devolvió, y no queda nada congelado para revisar. También ensancha `entre_cuentas`: hoy significa banco a banco, y cambiarlo exige revisar todos los lectores de `fn_dinero_libro`.
4. **Migraciones y riesgo.** Son unas 3 partes:
   - A: el `alter` de `cuentas_dinero` con su índice y las categorías nuevas;
   - B: las tablas nuevas y las funciones;
   - C: `registrar_gasto`, el cierre de la recepción y el Estado de resultados.

   Ninguna necesita políticas. El riesgo es el `drop` de `registrar_gasto` con 13 parámetros: rompe la pantalla en vivo entre el pegado y el deploy. Hay que dejar una versión de 13 parámetros que llame a la de 14.

## Enfoque brief: 5/10
1. **Rompe la regla de solo agregar filas.** En `gasto_llegada_reparto`, cada recepción cambia `pendiente` a `absorbido` con un UPDATE. El CHECK de suma protege el total, pero no el historial. Es una máquina de estados sobre dinero.
2. **Rompe `costo_historial`.** Si `movimiento_id` acepta nulos, se pierde el `unique` y el join de `:246` esconde esas filas en la vista de historial. Además, `cantidad_nueva = 0` entra a la fórmula del promedio ponderado: hay que reescribir `fn_recalcular_costo_variante`, que es núcleo (principio 1).
3. **Duplica tipos y cruza sedes.** Agrega `entrega_fondo` y `devolucion_fondo` cuando bastaría ampliar un tipo que ya existe. Y lleva el flete Lima a sede al costo, lo que lo promedia entre sedes. Son unas 6 o 7 migraciones y depende del contrato con Recepción (ADR-0361).

## Enfoque ERP: 6/10
1. **La rendición está bien pensada.** Es un corte de la cuenta, que se congela al cerrar y bloquea lo que se anote con fecha anterior al corte. Es lo que le falta al mínimo.
2. **Tiene el candado correcto:** una compra que respalda un gasto no puede tener líneas de mercadería. Así un mismo comprobante no se cuenta dos veces.
3. **Pesa demasiado.** Son tres tablas `costos_llegada*`, con un `estado` que cambia, y la misma cirugía en `costo_historial` que el brief. Además, `min(recibido, stock_actual)` mira el stock de todas las sedes y de lotes anteriores, así que absorbe sobre unidades que ese flete nunca trajo. Repartir por unidades le carga a un polo lo mismo que a una casaca. Son unas 6 migraciones.

## Lo que conservaría

**Del mínimo, la base:**
- el fondo como `cuentas_dinero` de tipo `por_rendir` con `persona_id`;
- `gasto_ordenes_compra`, para que un flete cubra varias órdenes de compra;
- `gasto_al_costo`, que solo agrega filas, y el reparto por valor al cerrar la recepción;
- el flete tardío a la línea `fletes` (609), sin reescribir costos pasados;
- el flete de Lima a cada sede como gasto 631.

**Del brief:**
- una clave de idempotencia en cada RPC que guarda;
- un disparador que rechaza todo movimiento fechado dentro de una rendición cerrada;
- la vista previa del reparto («+S/ 0.85 por polo») antes de guardar, solo de lectura.

**Del ERP:**
- una tabla `rendiciones` mínima, que se congela al cerrar y no se edita después;
- el candado compra-gasto sin líneas de mercadería;
- la regla de escribir el motivo antes de cerrar una rendición que no da cero.

**Lo que descartaría de los tres:** cambiar `costo_historial`, cualquier tabla de reparto con columnas que se actualizan, y el flete de Lima a sede como costo mientras el costo sea único para todas las sedes.

**Lo que bloquea a los tres:** el cierre de la recepción vive en ADR-0361, otra sesión. Hay que acordar el punto donde se engancha antes de escribir la migración. Además todo esto toca dinero, costo y esquema de producción, así que espera el OK de Felipe.