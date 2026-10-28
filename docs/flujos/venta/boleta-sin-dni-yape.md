---
flujo: venta
caso: boleta-sin-dni-yape
roles: [colaboradora (con cuenta Admin, por un límite del entorno local), clienta]
nivel: primer-dia
persona: Valentina, una colaboradora de la Tienda Trujillo que empezó a trabajar hoy   # nombre inventado
estado: aprobado por Felipe (2026-09-30). Ajustado ese mismo día por su decisión de dejar Dynamic fuera — corre con la cuenta Admin (felipe), no con la de la colaboradora
---

# Una clienta se lleva una blusa: paga con Yape, pide boleta y no da su DNI

> **Decisión de alcance (Felipe, 2026-09-30): Dynamic queda fuera; solo `retail`.** En la base local no existen
> `public.marcajes` ni `public.jornadas` (son de Dynamic), así que `retail.fn_asesoras_de_turno` devuelve la lista vacía y
> el combo «Responsable» no muestra a nadie. Sin responsable el ERP no deja cobrar a una colaboradora; **solo un Admin firma
> sin lista**. Como no se va a simular Dynamic, **este caso se corre con la cuenta Admin (felipe)** y lo que depende del
> turno queda como «no verificado» (ver el final). Consecuencia que hay que tener presente al leer el informe: la persona de
> la pasada ciega **no es una colaboradora de verdad** —ve el menú completo de un Admin y quizá no ve el combo
> «Responsable»—, así que la fricción que reporte es la de esta pantalla, no la de una colaboradora de primer día.
> Comprobado en la base: la función y sus tablas.

## Objetivo
> Una clienta llega a la tienda de Trujillo, se prueba una blusa Emma beige talla L y decide llevársela. Quiere pagar con
> Yape y que le den boleta, pero no quiere dar su DNI. Tú la atiendes y la caja ya está abierta. Atiéndela hasta que se
> lleve su boleta.

## Situación
Sábado, 4:30 de la tarde, Tienda Trujillo (Trujillo y Arequipa juntas hacen ~80 % de la venta, R-32). Hay dos clientas más
esperando: cobrar en hora punta demora entre 30 segundos y más de 2 minutos (R-14). La clienta es una persona natural: no
pide factura y no quiere dar su DNI para una compra de S/ 79,90. Paga con Yape al Yape Empresa de la tienda (R-03).
La atiende **Valentina**, colaboradora de la sede (nombre inventado; en el ERP local, con la cuenta Admin, por el límite de arriba).

## Estado inicial (datos inventados)
- Sede **Tienda Trujillo**. Opera la cuenta **felipe** (Admin y líder del seed): es la única que firma sin lista de turno.
  La cuenta de la colaboradora (**micaela**, fija a Trujillo) no interviene: sin turno no puede cobrar en local.
- **Caja de Trujillo abierta con el monto que el sistema esperaba** (lo que dejó el cierre anterior; en el seed está cerrada y la abre
  la «Preparación»). Abrirla con otro monto levanta la alerta URGENTE «Aperturas de caja con diferencia» en el inicio, que no
  pertenece a esta historia (la primera preparación abrió con S/ 100 y la causó).
- **Blusa Emma beige L** (`BLU-EMMA-BEI-L`, S/ 79,90): **5 unidades en el piso de venta** (1 del seed + 4 de una entrada de
  reposición). El almacén de la tienda no cambia.
- Serie de boleta **B001** de Trujillo en el **primer número libre: el 13**. En producción cada sede tiene su propia serie (Trujillo
  B001, Arequipa B002, Lima B003) y Trujillo sigue desde sus números ya usados. El seed local le dio B001 **también a Lima**, que ya
  gastó del 1 al 12: con el contador de Trujillo en 1, el primer cobro choca (`comprobantes_tipo_serie_numero_key`). La
  «Preparación» lo corrige; sin ella la venta no se puede hacer en local.
- Ya hay 1 venta anterior en la sede (del seed): es el punto de partida contra el que se cuenta lo que este caso escribe.
- **Sin turno:** no se simula nada de Dynamic. Lo que dependa de «quién está atendiendo» no se prueba.
- **Sede activa:** una cuenta Admin abre en la sede que tenga guardada (el 2026-09-30, «Tienda Lima»), no en Trujillo. La persona tiene
  que pasar a Tienda Trujillo con «Cambiar de ubicación». Es un **artefacto de la cuenta Admin**: una colaboradora fija a Trujillo
  no lo ve. El paso 0 lo recoge y el informe lo separa de la fricción real de vender.

## Preparación (solo la ve la pasada informada; la corre la skill entre las dos fotos)
Ensayada dentro de una transacción con `rollback` el 2026-09-30: deja la caja abierta, la blusa en 5 y la serie de Trujillo en el 13. Solo escribe en
`retail`.

```sql
-- Actúa la líder (felipe, líder del seed): abre la caja del día, como lo hace una líder a la mañana.
set local request.jwt.claim.sub = '22222222-2222-4222-8222-000000000001';
select id as trujillo from retail.ubicaciones where nombre = 'Tienda Trujillo' \gset
-- 1. Caja de Tienda Trujillo abierta (hoy está cerrada) con lo que quedó en el cajón en el último cierre real (`monto_fondo`), que es
--    lo que `abrir_caja` espera. Con otro monto queda una «apertura con diferencia» y una alerta en el inicio. Abrirla es del flujo
--    «Caja», no de este caso.
select coalesce((select monto_fondo from retail.cajas where ubicacion_id = :'trujillo' and estado = 'cerrada' and not es_prueba
                  order by cerrada_en desc limit 1), 0) as apertura \gset
select retail.abrir_caja(:'trujillo', :'apertura', 'arranque del caso boleta-sin-dni-yape') as caja \gset
-- 2. La Blusa Emma beige L tiene 1 unidad en el piso: se le suman 4 para que la venta no sea «la última prenda»
--    (esa es una variante aparte). Por una entrada real, nunca escribiendo en `stock`.
select id as v1 from retail.variantes where sku = 'BLU-EMMA-BEI-L' \gset
select retail.fn_sububicacion_por_defecto(:'trujillo', 'venta') as sub_piso \gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v1', :'trujillo', :'sub_piso', 'entrada', 4, 'reposición de prueba') returning id as mov1 \gset
select retail.fn_aplicar_movimiento(:'mov1') as _r \gset
-- 3. La boleta de Trujillo parte en el primer número libre de su serie. En producción Trujillo tiene su B001 con números ya usados y
--    sigue desde ahí; en el seed local Lima también tiene B001 (números 1 a 12) y el 1 de Trujillo chocaría con B001-000001.
--    Es un `update` directo al contador, como hacen los scripts de producción: las funciones de series no dejan fijarlo.
update retail.series_comprobantes s
   set siguiente_numero = (select coalesce(max(c.numero), 0) + 1 from retail.comprobantes c where c.tipo = 'boleta' and c.serie = s.serie)
 where s.ubicacion_id = :'trujillo' and s.tipo = 'boleta' and s.archivada_at is null;
```
Se corre dentro de `begin; … commit;`.

## Reglas que se prueban
| Regla | Qué exige | Origen |
|---|---|---|
| R-15 (actualizada, ADR-0164) | La venta y el movimiento de stock se registran siempre, con o sin comprobante tributario. Aquí: venta, stock **y** boleta. **✔ Verificado 2026-09-30:** las tres quedaron. | `docs/datos/15-COMO-OPERA-CAYLA.md` |
| R-16 | Si SUNAT no responde, se vende igual y el comprobante se emite después. **En local siempre pasa** (no hay credenciales): la venta debe quedar registrada y el comprobante pendiente, sin perder la venta. **✔ Verificado 2026-09-30:** venta guardada, comprobante `pendiente_reintento` con el error «Falta LUCODE_TOKEN». | `15-COMO-OPERA-CAYLA.md` |
| R-17 (D-62, ADR-0153/0163) | Se sabe quién atendió: la persona elegida en «Responsable» queda en la venta. **No se puede probar en local** (sin turno solo firma un Admin); el caso solo anota qué queda en `ventas.asesora_id` cuando firma el Admin. | `15-COMO-OPERA-CAYLA.md`, `DECISIONES-2026-09-21-menu-comercial.md` |
| R-14 | Cobrar en hora punta demora 30 s a más de 2 min. Es una **estimación** de Felipe: el caso **mide** toques y tiempo, no declara incumplida la regla. | `15-COMO-OPERA-CAYLA.md` |
| — | **Más de S/ 700 con boleta sin DNI: ese pago no se hace por Yape, sino por otro medio de pago.** Este caso vende S/ 79,90, así que no se aplica; la guía lo avisa en el paso del medio de pago. **El ERP no lo impide**: `/vender` no tiene umbral (solo Apartados usa S/ 700). | instrucción de Felipe, 2026-09-30; sin regla escrita en `docs/` ni en el sistema |
| — | El Yape **no** entra en el efectivo esperado de la caja al cierre. | sin regla escrita en `docs/`; lo hace el código. **✔ Verificado 2026-09-30:** con una venta de S/ 79,90 por Yape, `fn_calcular_esperado_caja` siguió en la apertura sola (S/ 219,90) |
| — | Una boleta sin DNI se guarda como «sin documento» y sale como «Cliente varios». | sin regla escrita; lo hace el código. **✔ Verificado 2026-09-30:** `cliente_tipo_doc = sin_documento`, sin número ni nombre, y el modal dice «Cliente varios» |

## Pasos
**Verificados en pantalla y contra la base el 2026-09-30** (corrida 4: pasada ciega; y la informada, con una venta propia). «La base
quedó» solo lo lee la pasada informada. Toques mínimos de «Vender» a «Venta registrada»: **6** (R-14 mide esto; el tiempo no se midió).

| # | Se ve | Se hace | Sigue | La base quedó |
|---|---|---|---|---|
| 0 | Inicio con «Hola, Felipe · Líder · Tienda Lima», botón «Vender» arriba a la derecha (tarda unos segundos en dibujarse tras cargar) y tres alertas URGENTE. | **Solo Admin:** el selector de ubicación (arriba a la derecha) → «Tienda Trujillo». | Inicio de Trujillo: «Aún sin ventas hoy. Caja abierta.» | Nada. |
| 1 | Para un Admin **no hay combo «Responsable»**; en el ticket aparece una etiqueta «Admin · queda a tu nombre». *(Una colaboradora vería el combo «¿Quién está atendiendo?»; no se puede probar en local.)* | **Indicar quién atiende: Valentina** (en la guía, paso ilustrado). | Tocar «Vender». | Nada. |
| 2 | «Venta en tienda · Tienda Trujillo»: tarjetas de prendas. «Blusa Emma · Beige · desde S/10.00 · 5 en piso» con tallas XS–XL (solo la L disponible). | Tocar la talla **L**. | La blusa lleva un «1»; el botón de arriba pasa a «Apartar 1»; abajo aparece la barra «Ver ticket». | Nada. |
| 3 | «Ticket actual»: «Agregar clienta (opcional)», Blusa Emma `CMS-0001-BEI-L`, cantidad 1, S/ 79,90, subtotal S/ 67,71 + IGV S/ 12,19, botón «Cobrar S/79.90». | Tocar «Ver ticket» y luego «Cobrar». | Se abre «Cobro». | Nada. |
| 4 | «Cobro»: «Cómo pagó la clienta» con Efectivo, Tarjeta, Yape, Plin, Transferencia y una etiqueta «Siguiente paso»; el botón gris dice «Elige cómo pagó la clienta.». | Tocar **Yape**. | Yape por S/ 79,9 «Cubierto ✓»; «Nº de operación (opcional)» vacío. | Nada. |
| 5 | «Comprobante» con Boleta (ya marcada) / Factura / Nota de venta y una pastilla roja «Opcional»; «DNI de la clienta (opcional)» con un «!» y «Nombre de la clienta». | Dejar Boleta, sin DNI y sin nombre. | El botón «Confirmar cobro S/79.90» se activa. | Nada. |
| 6 | «Confirmar cobro S/79.90». | Tocarlo. | «Venta registrada». | **Ver la lista de abajo.** |
| 7 | «Venta registrada · Tienda Trujillo»: «LISTO S/79.90», «Boleta B001-000013 · Pendiente de enviar», Yape S/ 79,90, «Cliente: Cliente varios», «Ya está descontada del stock…», y tres botones: «Imprimir y nueva venta», «Solo imprimir», «Sin imprimir». | Tocar «Imprimir y nueva venta» (o «Sin imprimir»). | Pantalla lista para la siguiente clienta. | Nada más. |

**Después del paso 6, la base quedó así** (comprobado con SELECT; coincide con lo previsto):
- `ventas` +1: Tienda Trujillo, `completada`, en la caja abierta que preparó el caso; `asesora_id` = la propia persona del Admin (no hay otra que elegir).
- `venta_items` +1: `BLU-EMMA-BEI-L`, cantidad 1, S/ 79,90, sin descuento.
- `venta_pagos` +1: `yape`, S/ 79,90, sin referencia (no se escribió nº de operación) y **sin cuenta de dinero**: en el modelo actual solo el efectivo se asocia a una (el cajón); tarjeta, Yape y anticipo no, y `cuentas_dinero` no tiene una «Yape Empresa».
- `movimientos` +1: `salida`, cantidad 1, motivo `venta`, sububicación **piso de venta**.
- `stock`: la blusa en el piso pasó de **5 a 4**; el almacén no cambia.
- `comprobantes` +1: boleta **B001-000013**, «sin documento», sin número ni nombre de cliente, S/ 79,90 (subtotal 67,71, IGV 12,19), estado **`pendiente_reintento`**, último error «sin_credenciales: Falta LUCODE_TOKEN en el entorno», próximo reintento en 15 minutos.
- `series_comprobantes`: B001 de Trujillo pasó del 13 al **14**.
- `actividad` +1: «vendió 1 prenda por S/ 79.90 · B001-000013».
- **`cajas` no cambió**, y lo que la caja espera (`fn_calcular_esperado_caja`) siguió en la apertura sola, S/ 219,90: el Yape no suma.

Son exactamente **8 tablas** las que cambian (`ventas`, `venta_items`, `venta_pagos`, `movimientos`, `stock`, `comprobantes`, `series_comprobantes`,
`actividad`). `estado.mjs comparar` las da tras correr el caso; si aparece otra, o falta una, es hallazgo.

## Avisos de la guía (lo que la guía destaca a propósito; NO se le dan a la pasada ciega)
- **Paso 1: se indica quién atiende.** Es un paso que se olvida, así que la guía lo destaca. Para practicar se usa el nombre inventado «Valentina».
- **Más de S/ 700 sin DNI: el pago se hace por otro medio, no por Yape** (indicación de Felipe, 2026-09-30). Sale en el paso de elegir el medio de pago, con una nota visible. Es una instrucción a la colaboradora, no un candado del sistema.

## Misión guiada (el guion de la guía del HTML interactivo)
Siete pasos, una sola acción cada uno, con los textos verificados en pantalla el 2026-09-30. En **escritorio** el ticket ya está a la vista (no hay «Ver ticket»: esa barra es del celular, que aún no está hecho) y el responsable es un paso propio, porque una colaboradora lo ve y un Admin no. El guion de la guía (`boleta-sin-dni-yape.guion.json`) los dosifica de a uno y **no adelanta** el siguiente. Las etapas de la réplica son: `vender`, `talla`, `responsable`, `cobrar`, `pago`, `confirmar`, `cerrar`.

| # | Etapa | Haz (una acción) | Verás | Por qué (negocio) | Avisos |
|---|---|---|---|---|---|
| 1 | `vender` | Desde el Inicio (arriba a la derecha dice **TIENDA TRUJILLO**), toca **«Vender»** (tarda unos segundos en dibujarse). | «Venta en tienda · Tienda Trujillo». | El stock que baja es el de la sede donde estás. | «Vender», «Punto de Venta» y «Cobrar» son tres nombres de lo mismo. |
| 2 | `talla` | En la tarjeta «Blusa Emma · Beige», toca la talla **L**. | La blusa aparece en el ticket de la derecha, con S/ 79.90. | Elegir la talla agrega la prenda a la cuenta; no cobra nada todavía. | ⚠ **«Apartar 1»** (arriba) no se toca: guarda la prenda sin cobrar. La tarjeta dice «desde S/10.00» por otra talla que no hay aquí: la L cuesta S/ 79,90. |
| 3 | `responsable` | En **«Responsable»** toca «¿Quién está atendiendo?» y elige **Valentina**. | «Cobrar» pasa de gris a negro. | Cada venta queda a nombre de quien atendió a la clienta. | 🔔 Paso que se olvida. En la tienda real la lista trae a quien marcó entrada hoy; aquí: Valentina, Camila y Renata. |
| 4 | `cobrar` | Toca **«Cobrar S/79.90»**. | La columna del ticket se convierte en «Cobro». | «Cobrar» solo abre el cobro; todavía no se cobró nada. | — |
| 5 | `pago` | Toca **«Yape»**. | Yape por S/ 79,9 con «Cubierto ✓». «Nº de operación (opcional)»: vacío. | El Yape no entra en el efectivo de la caja: va a la cuenta del negocio, no al cajón. | 🔔 **Más de S/ 700 sin DNI:** ese pago **no** se hace por Yape; se cobra por otro medio. El ERP **no** lo impide: es una instrucción. |
| 6 | `confirmar` | Deja **«Boleta»**, **sin DNI ni nombre**, y toca **«Confirmar cobro S/79.90»**. | «Venta registrada». | Una boleta sin DNI es válida para esta compra: sale a nombre de «Cliente varios». | ⚠ La etiqueta roja **«Opcional»** junto a «Comprobante» **no** significa que la boleta sea opcional: lo opcional es el DNI. El «!» del DNI es una ayuda, no una alarma. |
| 7 | `cerrar` | Toca **«Sin imprimir»** (en la práctica no hay impresora). | «Boleta B001-00001x», «Cliente varios» y «Pendiente de enviar». | La venta ya está hecha y la prenda descontada. «Pendiente de enviar»: el sistema manda la boleta a SUNAT solo; en la práctica no hay conexión. | Fin de la misión. |

## Lo que le llega a la clienta
La boleta «B001-000013» a nombre de «Cliente varios», S/ 79,90, pagada con Yape. Sin DNI. Todavía **sin validez ante SUNAT**
(en local nunca se transmite; en producción se enviaría enseguida). Su Yape queda como lo hizo desde su celular: el ERP no
mueve su dinero, solo lo anota.

## Lo que se espera que confunda (hipótesis del código; NO se le dan a la pasada ciega)
Se contrastaron con lo que la ciega reportó en la corrida 4 (Valentina, cuenta Admin):
- El combo «Responsable *» pregunta «¿Quién está atendiendo?» y solo lista a quien marcó entrada. → **No contrastable en local**: como Admin no aparece. En su lugar, la ciega dudó de la etiqueta **«Admin · queda a tu nombre»** y del saludo «Hola, Felipe».
- El botón «Cobrar» no cobra: abre «Cobro», y quien cobra es «Confirmar cobro». → **No confirmada.** La ciega lo recorrió sin dudar («supe qué hacer»).
- «Comprobante» lleva la pastilla «Opcional», pero siempre se emite una boleta. → **Confirmada.** La ciega dudó: «¿“Opcional” quiere decir que la boleta es opcional?».
- «DNI de la clienta» dice «opcional»; «Nombre de la clienta» no lo dice. → **No confirmada**; lo que la ciega señaló fue otra cosa: el **«!» junto al DNI** parece una alerta, su texto aparece solo al hacer clic y habla de RENIEC, no de lo que ella necesitaba saber (qué pasa sin DNI).
- **Lo que el código no anticipaba** (y es lo más valioso): la tarjeta dice «desde S/10.00» y el ticket cobra S/ 79,90; «Apartar 1» parece apartar la prenda; la barra «Ver ticket» no dice el total; «Cliente varios» se ve recién después de confirmar; «Pendiente de enviar» no se explica; y hay tres nombres para lo mismo (Vender / Ventas ▸ Punto de venta / Cobrar).

## Variantes que vale la pena probar (cada una es un caso aparte)
1. Yape **con** nº de operación: ¿la venta se encuentra después en Ventas ▸ Historial por ese número? (ADR-0230)
2. La clienta pide **factura**: exige RUC.
3. La clienta **no quiere comprobante**: «Nota de venta» (ADR-0164); el stock se mueve igual.
4. **Última unidad**, y dos colaboradoras que la venden a la vez: una debe recibir «Stock insuficiente».
5. Falta la caja abierta, el responsable o el stock: qué mensaje ve y si sabe qué hacer.
6. La clienta paga con Yape **de menos o de más**: «Los pagos no cuadran con el total».
7. **Yape de más de S/ 700 sin DNI.** La guía dice que ese pago va por otro medio. Comprobar si el ERP hoy lo frena (el código dice
   que no): si no lo frena, es una brecha entre la instrucción y el sistema, para Felipe. **Por confirmar con Felipe:** qué medios
   entran en «otro medio de pago» (¿efectivo, tarjeta, transferencia?) y si con ellos la boleta sigue siendo sin DNI. Lo que exija
   SUNAT en ese monto no lo he verificado.
8. Todo el caso **a 375 px** en celular (PL-105: Vender se prueba en celular).
9. **Número de comprobante repetido** (serie compartida entre sedes). Ocurrió sin querer en la primera preparación: el error sale como «Ese número de
   comprobante ya está usado. Vuelve a Facturación…», que no dice que la venta NO se guardó y manda a una pantalla que ya no existe.
   Hay un caso propio por escribir: es un hallazgo verificado, no una hipótesis.
10. **Dos ventas a la vez** de la misma prenda y serie: probado con dos procesos simultáneos (números 14 y 15, sin duplicados). Falta la
   versión con la **última unidad** (la segunda debe recibir «Stock insuficiente»).

## No verificado por este caso
- **Turno y kiosco de marcaje** (Dynamic): fuera de alcance por decisión de Felipe. Por eso tampoco se prueba: que una
  colaboradora vea «¿Quién está atendiendo?» y sepa qué hacer, qué pasa si nadie marcó entrada, ni el menú reducido de un
  colaborador (el Admin ve más módulos y más distracciones). **Es la mitad de la fricción real de este flujo y este caso no la mide.**
- **SUNAT / Lucode reales.** En local no hay `LUCODE_TOKEN` (la base lo registra como último error del comprobante): el comprobante queda `pendiente_reintento` y nunca se transmite. No se sabe cómo se ve una boleta aceptada.
- **Que el sistema haga cumplir el límite de S/ 700 con Yape:** no lo hace; solo lo dice la guía.
- **El recibo impreso** en la térmica real, y si muestra el nº de operación de Yape (no lo encontré en el código).
- **Producción:** la base local es de prueba y el catálogo real es otro.
- **El diálogo de impresión.** «Solo imprimir» llama a `window.print()`; el panel integrado no dibuja el diálogo del navegador, así que la ciega no vio ninguna señal. Es un artefacto del entorno; en un navegador real aparece el diálogo de impresión.
- **Celular a 375 px**, **el tiempo de cobro** (R-14) y **la venta con nº de operación de Yape**.
