# Cómo opera CAYLA de verdad

> **Qué es este archivo.** Las reglas del negocio que **ningún código puede contarte**.
> Todo lo demás de `docs/datos/` sale de leer el SQL; esto salió de preguntarle a Felipe.
> Es lo que un ingeniero necesita saber para que lo que construya se parezca a la
> operación real y no a una suposición razonable.
>
> **De dónde salió.** Sesión de preguntas del **2026-09-12**. Cada bloque dice si es un
> dato duro, una estimación de Felipe, o algo que todavía hay que medir. Esa distinción
> importa: construir sobre una estimación tratándola como dato es cómo nacen los
> sistemas que nadie usa.
>
> **Cómo se mantiene.** Cuando una de estas reglas cambie —y van a cambiar, porque el
> negocio se mueve— se corrige acá primero. Si una decisión de esquema se apoyó en una
> de estas frases, la frase lleva su marca `R-nn` para poder rastrearla. Desde el
> 2026-09-25, lo que cambió después va en una nota **«Actualización (fecha, fuente)»**
> debajo de la regla, y el texto original se conserva: así se ve qué dijo Felipe y qué
> se decidió después. Solo un nombre técnico equivocado (una tabla, un ADR, un estado) se
> corrige en su lugar. Si el código contradice una regla y no hay decisión escrita, no se
> corrige la regla: se le pregunta a Felipe.

---

## 1 · Cómo compra CAYLA

**R-01 · Se paga al contado, contra entrega.** El 97% de las veces.
*Estimación de Felipe.* El crédito es la excepción (~3%) y **el plazo lo pone cada
proveedor**, no CAYLA — así que si algún día se modela, el plazo es un dato de
`proveedores`, no de la factura.

> **Consecuencia de diseño:** la antigüedad de la deuda por tramos (1-30 / 31-60 /
> 61-90 días) que propone `10-ROADMAP-DATOS.md` es **sobre-ingeniería para hoy**. Con
> 97% al contado casi no hay deuda que envejecer. Se construye el registro de la
> factura y del pago; el reporte de antigüedad se deja para cuando exista el área
> comercial que Felipe menciona.

> **Actualización (2026-09-25, ADR-0111 y `supabase/migrations/20260918211000_compras_deuda_tramos_y_salidas_de_caja.sql`):**
> no se construyó la antigüedad por tramos de este bloque, sino la **deuda por vencimiento** (ADR-0111, 2026-09-18,
> sección «Lectura»): `deuda_por_vencimiento()` (vencida / vence en 0-7 / 8-30 / más de 30 días), `salidas_caja_30d()`
> y `por_pagar_tramos()`, que alimentan la pantalla Por pagar (`apps/web/lib/compras-indicadores.ts`). Todo lo vencido
> cae en un solo tramo: la antigüedad de lo vencido sigue sin construirse, como pedía este bloque. *El texto de
> arriba se conserva como quedó el 2026-09-12.*

**R-02 · Más del 75% de los pagos son por transferencia bancaria.** El resto se
reparte entre efectivo y billeteras móviles (Yape / Plin). *Estimación.*

**R-03 · El Yape que usa CAYLA es Yape Empresa, afiliado a la cuenta del negocio.**
*Dato duro.* Nunca el celular personal de alguien.

> **Por qué esta pregunta se hizo:** si alguien pagara desde su Yape personal, eso no
> sería un egreso de CAYLA sino un **reembolso** — la persona puso la plata y el negocio
> se la debe. Sin modelarlo se vuelve un préstamo personal invisible. No es el caso, y
> conviene que siga sin serlo.

**R-04 · El efectivo para pagar sale de reservas bancarias.** Nunca del cajón de una
tienda, nunca del bolsillo de Felipe. *Dato duro, y es una decisión consciente:* no
mezclar finanzas personales con las del negocio.

> **Consecuencia de diseño, y es grande:** un pago a proveedor **no toca el cuadre de
> ninguna sede**. No hay que conectarlo con `cajas` ni con `ajustes_efectivo`. Eso
> simplifica el módulo entero.

**R-05 · Pagos parciales: prácticamente no existen.** 99% se paga completo.
*Estimación.* El estado `parcial` se construye porque es gratis, pero ninguna
pantalla debe optimizarse para ese caso.

**R-06 · Todo se registra en soles.** La importación es menos del 3% y, cuando es en
dólares, **se convierte a soles siempre**. *Dato duro.* No hace falta construir tipo de
cambio ni moneda múltiple.

---

## 2 · El agujero de las facturas, y su precio

**R-07 · Más del 30% de las compras llega sin factura.** Proveedores pequeños —talleres
de Gamarra, producción artesanal, máquina básica y a mano— que entregan proforma, nota,
o nada. *Estimación de Felipe, y la califica de estructural, no excepcional.*

Felipe lo describe como lo que es: **un problema de cadena, no una elección suya.** Si
el taller que le vende no factura, él queda sin sustento aunque quiera tenerlo.

**Lo que eso cuesta, en plata y sin moral de por medio:**
- Ese IGV no se puede descontar del IGV que CAYLA cobra. Se paga completo.
- Esa compra no es costo deducible ante SUNAT.
- Con CAYLA proyectando ~72% del umbral de 300 UIT, la diferencia deja de ser incómoda
  y pasa a ser una salida mensual.

> **Consecuencia de diseño, y corrige un error del roadmap:** `10-ROADMAP-DATOS.md`
> define `pagos_proveedor.compra_comprobante_id` como **NOT NULL**. Con más de un tercio
> de las compras sin factura, **un tercio de la plata que sale del banco no se podría
> registrar**. Lo obligatorio tiene que ser `proveedor_id`; la factura va **nullable** y
> se le pega después si llega.

> **Actualización (2026-09-25, ADR-0111 y `supabase/migrations/20260912231956_compras_desde_factura.sql`):** el
> `compras` real, creado el mismo 2026-09-12 por esa migración, no siguió esta receta: `compras.serie` y
> `compras.numero` son `not null` (líneas 127-128, sin cambio hasta hoy), o sea que la puerta «Recibir mercadería»
> (con comprobante) exige factura/boleta/nota de venta. Felipe decidió (ADR-0111, 2026-09-18) que la compra sin
> factura entra por un camino aparte — «Ingreso sin comprobante», en Inventario (vía `retail.recibir_lote`) — que no
> pasa por `compras` ni por «Por pagar». Y los nombres de tabla que este párrafo y `10-ROADMAP-DATOS.md` proponían
> tampoco se construyeron: ni `pagos_proveedor` ni `compras_comprobantes` existen en el esquema real. Lo que hay es
> `retail.compras` — con `proveedor_id` **NOT NULL**, tal como pedía este párrafo, porque la factura entró como parte
> de la misma cabecera (`tipo` en `factura`/`boleta`/`nota_venta`, y desde el 2026-09-24 también
> `recibo_por_honorarios`) — y `retail.compra_pagos` (`compra_id` **NOT NULL**, referencia a `compras`). *El texto de
> arriba (R-07 y este párrafo) se conserva tal como quedó escrito el 2026-09-12, como registro de la sesión con
> Felipe; ya no describe el esquema construido.*

**R-08 · Lo primero que el módulo tiene que responder no es «cuánto debo», es «cuánto
compré sin respaldo este mes».** Hoy nadie tiene ese número. Sin él, la conversación con
el contador es una opinión.

> **Actualización (2026-09-25, ADR-0111 y `supabase/migrations/20260918213000_compras_sin_comprobante_indicadores.sql`):**
> ya existe un indicador — `resumen_sin_comprobante()` responde unidades y recepciones sin comprobante del mes
> (ADR-0111, 2026-09-18) —, pero cuenta unidades, no soles: la pregunta «cuánto compré sin respaldo» todavía no tiene
> un monto en soles que responderle al contador. *El texto de arriba se conserva como quedó el 2026-09-12.*

**R-09 · La ley 28194 estaba fuera del radar.** Un pago **en efectivo de S/2,000 o más**
hace perder el crédito fiscal y la deducción del gasto. Felipe confirma que **sí ocurre**
y que no conocía la regla.

> **Consecuencia de diseño:** aviso en la pantalla de pago cuando `metodo_pago =
> 'efectivo'` y `monto >= 2000`. Es barato de construir y evita una pérdida que ya está
> ocurriendo. **Y partir una factura grande en pagos menores para esquivar el umbral es
> exactamente lo que SUNAT desconoce** — el aviso tiene que decirlo, no solo advertir
> del monto.

---

## 3 · Quién hace qué con la plata

**R-10 · Existe una persona encargada de Compras.** Paga con frecuencia. También pagan
Felipe y una persona de confianza; **rara vez** las líderes de equipo. *Dato duro.*

> **Consecuencia de diseño, y es un hueco en una decisión ya tomada:** los cuatro
> niveles de D-12 (Admin · Líder de equipo · Integrante · Solo lectura) **no contemplan
> este rol**. Compras necesita permisos que un Integrante no tiene y que no son los de
> un Líder de sede: registra facturas, registra pagos, ve el saldo por proveedor, y
> —esto hay que pensarlo— **crea proveedores**. Quien puede crear un proveedor y además
> pagarle puede inventarse uno. Ese par de permisos juntos merecen una decisión
> explícita, no un descuido.

> **Actualización (2026-09-25, ADR-0184 «Compras: cada tienda compra, ve y paga lo suyo», en producción desde
> 2026-09-23; y ADR-0161 «Roles por módulo» + ADR-0178 «Escalón Admin», en producción desde 2026-09-22/23):** las dos
> partes de este bloque quedaron atrás. Compras ya no depende de una sola persona: quien no es líder y tiene un
> módulo de Compras ve y paga **solo lo de su tienda** (`fn_compras_ubicaciones()`), y el líder, todo;
> `compradores_de_tienda` sirve para sumarle tiendas extra a quien compra para varias (hoy tiene 0 filas). El único
> rol fuera del líder con Facturas de compra, Por pagar, Notas de crédito y Proveedores es la **Terminal Almacén**
> (consultado en vivo el 2026-09-25). Y el hueco que este párrafo señalaba (los cuatro niveles de D-12 no contemplan
> este rol) ya no aplica
> al modelo actual: los cuatro niveles fijos de D-12 fueron reemplazados por roles armados módulo por módulo
> (ADR-0161, 2026-09-22) más un escalón Admin leído de Dynamic (ADR-0178, 2026-09-23) — hoy un rol se arma encendiendo
> en Colaboradores ▸ Roles y accesos los módulos que necesita. El riesgo de fondo que este párrafo señalaba sigue
> igual: quien crea un proveedor y además le paga puede inventarse uno (ver R-44). *El texto de arriba se conserva
> como quedó el 2026-09-12.*

**R-11 · Lo que Compras pide, textual:** *«mandar una alerta que necesita liquidez»* y
*«ver su cuadre de lo que tiene en su control: presupuesto de compras vs lo pagado, para
evitar errores de haber pagado de más o de deber a alguien»*.

> **Eso no necesita una tabla de presupuesto.** Es un **fondo fijo con rendición**:
> práctica contable de hace 150 años. El «presupuesto» es el saldo de su cuenta de
> compras más el efectivo que lleva encima; «lo pagado» es la suma de sus egresos; y la
> alerta de liquidez es ese saldo cayendo bajo un umbral. Se resuelve con las tablas de
> cuentas y movimientos, sin inventar nada.

**R-12 · CAYLA tiene dos cuentas bancarias empresariales** (Interbank y BCP).
*Dato duro.* Los números de cuenta **no se escriben en esta documentación**.

> **Recomendación, y encaja con lo que ya existe:** una es la **Operativa** (entra y
> sale todo, y es contra la que se mide cualquier presupuesto) y la otra pasa a ser la
> **Reserva** (sin tarjeta, la mueve solo Felipe). No hace falta abrir nada nuevo. Una
> tercera cuenta de Compras con tope acordado puede esperar.
>
> **Una cuenta por sede sería un error** y conviene dejarlo escrito para que nadie lo
> proponga de nuevo: Lima factura ~S/2.5k al mes y su cuenta viviría vacía; los
> proveedores sirven a las tres tiendas a la vez, así que habría que inventar reglas de
> reparto; y cada cuenta suma comisiones y una conciliación mensual más. **Separar por
> cuentas sirve para proteger plata de ser gastada, no para atribuirla** — atribuir ya
> lo resuelve `retail.caja_movimientos` (vía `caja_id → cajas.ubicacion_id`), no una
> columna `sede_id` que no existe en ningún lado de `retail` (0 columnas `sede_id` en
> todo el schema; verificado contra producción el 2026-09-25) ni la tabla
> `depositos_bancarios` de V1, borrada en el corte a V2 (2026-09-12, commit `0af2f1b`).

> **Actualización (2026-09-25, `supabase/migrations/20260925110000_finanzas_cuentas_y_dinero.sql` / ADR-0195, en
> producción; y ADR-0184, en producción desde 2026-09-23):** las reglas de reparto que este párrafo daba por costosas
> de inventar ya existen — no para las cuentas bancarias (siguen siendo dos, compartidas), sino para la deuda de una
> factura de proveedor repartida entre tiendas (ADR-0184: la vista `compra_parte_por_tienda`, la columna
> `compras.ubicacion_gestion_id`, la función `fn_mi_parte_de_compra`); el propio ADR-0184 declara que cambia la
> lectura de esta regla. Y para un movimiento de dinero suelto (no de caja diaria), lo que hoy lo ata a una tienda es
> `retail.movimientos_dinero.ubicacion_id` (nula = de CAYLA entera; ADR-0195 F3). *La regla se conserva como quedó
> el 2026-09-12; en su consecuencia de diseño solo se corrigió el nombre de la tabla.*

**R-13 · Qué reservar, y no es el IGV.** CAYLA viene teniendo **saldo a favor de IGV**,
así que apartar plata para una deuda que no existe inmoviliza capital sin razón.
Lo que sí son salidas grandes, predecibles y hoy sin reservar:
- **Gratificaciones de julio y diciembre, más CTS** — y caen justo encima de las dos
  campañas fuertes.
- **Renta**, según régimen.
- El panorama de IGV cambia el día que se crucen las 300 UIT.

> **Pendiente para el contador:** tener saldo a favor sostenido *mientras* más del 30%
> de las compras llega sin factura es raro aritméticamente — con poco crédito fiscal, el
> saldo debería ir hacia pagar, no hacia favor. O hay algo que no se está viendo, o hay
> plata parada ahí. Vale la pena que lo explique.

---

## 4 · Cómo vende CAYLA

**R-14 · Cobrar una venta en hora punta demora entre 30 segundos y más de 2 minutos**,
mitad y mitad. *Estimación de Felipe.* Es el cuello de botella del negocio, no un
detalle de comodidad.

**R-15 · Cuando la clienta no quiere comprobante, hoy no se registra nada.** Ni la venta
ni el movimiento de stock. **Lo que Felipe quiere es lo contrario: que la venta se
registre igual, con o sin comprobante.** *Dato duro, y es una brecha declarada entre lo
que pasa y lo que debería pasar.*

> **Consecuencia de diseño, y es la más grave de este archivo:** mientras eso siga así,
> **el inventario se desincroniza solo**. La prenda salió de la tienda y el sistema cree
> que sigue ahí. Después el conteo físico aparece con faltantes que nadie sabe explicar,
> y la reacción natural es desconfiar del conteo — cuando el conteo es lo único que no
> mintió. Separar la venta del comprobante no es una comodidad: es lo que mantiene
> honesto el stock.

> **Actualización (2026-09-25, ADR-0164 «Nota de venta», Felipe 2026-09-22, ya vivo en producción para el 2026-09-23
> según BITÁCORA de esa fecha):** cuando la clienta no quiere comprobante, el Punto de venta ya no deja la venta sin
> registrar. Ofrece «Nota de venta» junto a Boleta y Factura: un documento interno (`comprobantes.tipo = 'nota_venta'`),
> con IGV 0, que nunca se transmite a SUNAT pero que `registrar_venta` reserva igual que cualquier otra venta,
> moviendo el stock. La brecha que esta regla declaraba está cerrada: la venta y el movimiento de stock se registran
> siempre, con o sin comprobante tributario. *El texto de arriba se conserva como quedó el 2026-09-12.*

**R-16 · Cuando SUNAT se cae, se vende igual y se emite después.** A veces se anotan los
datos de la clienta y se le envía el comprobante luego; **a veces la clienta se va y
queda sin emisión**. *Dato duro.*

> El esquema ya está preparado para esto —emitir reserva el número y transmitir es un
> paso aparte (ADR-0005, ADR-0009)— pero hay que confirmar que la pantalla deja hacerlo
> sin fricción.

**R-17 · Hoy no se sabe quién vendió qué.** Felipe señala que el sistema actual *«no me
permite de forma dinámica registrar mis asesores de atención al cliente»*.

> **Consecuencia de diseño:** sin vendedora en la venta no hay comisiones, no hay
> ranking, y no se puede saber si una tienda vende menos por ubicación o por equipo.
> `movimientos.usuario_id` guarda quién registró el movimiento, que **no es lo mismo**
> que quién atendió a la clienta. Es una columna nueva en `ventas`, y conecta con el
> sistema de personal.

> **Actualización (2026-09-25, D-62 en `docs/datos/DECISIONES-2026-09-21-menu-comercial.md`, ADR-0153 y
> `supabase/migrations/20260922150000_venta_asesora_emisor_descuento_lider.sql`):** esto ya se construyó.
> `ventas.asesora_id` existe desde el 2026-09-22 y `PuntoDeVenta.tsx` ya lo manda como `p_asesora_id` en cada venta.
> Sigue faltando lo que se arma encima de ese dato — comisiones, ranking por asesora —, no la captura misma. *El
> texto de arriba se conserva como quedó el 2026-09-12.*

---

## 5 · Temporadas, campañas y rotación

**R-18 · Dos temporadas marcadas:** Primavera-Verano y Otoño-Invierno. *Dato duro.*

**R-19 · Las campañas que mueven la aguja**, en orden del año:

| Campaña | Cuándo | Peso |
|---|---|---|
| San Valentín | Febrero | como un mes bueno |
| Día de la Mujer | Marzo | como un mes bueno |
| Vuelta a clases | Febrero-marzo | parcial — pesa por las clientas universitarias |
| Día de la Madre | Mayo | como un mes bueno |
| Fiestas Patrias | Julio | como un mes bueno |
| **Navidad y fin de año** | **Diciembre** | **triplica un mes promedio** |

> **Consecuencia de diseño:** diciembre es la decisión del año. Equivocarse en la compra
> de campaña navideña cuesta más que todas las demás juntas. Y cae en el mismo mes que
> la gratificación y la CTS (R-13): el mes de mayor venta es también el de mayor salida
> de caja.

**R-20 · CAYLA rota rápido: pasados 30 días sin venderse ya es mala señal.** Pero el
umbral correcto **depende de la categoría** — una blusa de campaña no es un básico
atemporal. *Criterio de Felipe.*

> **Consecuencia de diseño:** el umbral de «estancado» es una columna de `categorias`,
> no una constante en el código. Se fija una vez por categoría y se puede corregir sin
> tocar nada más.

**R-21 · Lo que no rota se le busca salida.** Se baja de precio, se manda a otra sede, o
se remata. **Solo se guarda si es básico y atemporal.** *Dato duro.*

**R-22 · El principio de gestión que Felipe quiere que entienda cada líder de equipo**,
en sus palabras: *«se pierde más dinero estancando que perdiendo margen, porque ese
dinero va a parar en nuevas novedades»*.

> **Esto no es una frase motivacional: es un número que el sistema puede calcular.** El
> costo de la plata dormida por sede — cuánto capital está inmovilizado en prendas que
> no rotan, y qué representa contra lo que esa misma plata compraría de novedad. Convierte
> una discusión de opinión con cada encargada en una cifra. **Es de los reportes con más
> consecuencia de todo el roadmap y no estaba pedido en ningún lado.**

---

## 6 · Precios, descuentos y traslados

**R-23 · La líder de equipo puede bajar el precio hasta un tope.** Más que eso lo
autoriza Felipe. *Dato duro.* **El tope todavía no está definido — es una decisión
abierta.**

> **Consecuencia de diseño:** conecta directo con D-44 (los descuentos no se registran
> hoy). Sin registro de descuento **no se puede saber si el tope se respeta**, y el
> margen se erosiona sin que nadie lo vea. El descuento necesita precio de lista, precio
> cobrado, motivo, y quién lo autorizó.

> **Actualización (2026-09-25, R-45 de este archivo + ADR-0054 + D-67/ADR-0153):** el tope ya está decidido, no queda
> abierto. R-45 (más abajo, *Decidido, afinado sobre la propuesta de Felipe*) fija el escalonado, que Felipe
> ajustó el 2026-09-25: todo descuento manual que pase el 15% pide un argumento escrito, lo aplique quien lo aplique
> (`20260925230000_argumento_descuento_desde_15.sql`, en producción), y por encima de 35% la base no lo autoriza
> para nadie (ver la nota de R-45). Construido
> en `registrar_venta` desde el 2026-09-15 (ADR-0054). El 2026-09-22 se agregó un tope propio por colaborador
> (`colaboradores.tope_descuento_pct`, D-67/ADR-0153), pero hoy no actúa: el mostrador no manda ese parámetro (ver la
> nota de R-45). *El texto de arriba se conserva como quedó el 2026-09-12.*

**R-24 · El traslado entre tiendas lo paga la tienda que recibe.** *Dato duro.*

> **Consecuencia de diseño:** hay un riesgo que conviene mirar — la tienda chica (Lima,
> ~S/2.5k al mes) es la que menos puede pagar flete y la que más necesitaría recibir
> mercadería que no rota en Trujillo. Si el costo la frena, el stock se queda estancado
> donde no se vende, que es justo lo contrario de R-22. **Vale la pena revisar esta
> regla contra el objetivo**, no cambiarla por decreto.

---

## Lo que quedó abierto

| # | Qué falta | Quién lo responde |
|---|---|---|
| A-01 | ~~El tope de descuento de una líder de equipo (R-23)~~ — cerrado el 2026-09-12 por R-45 y construido en `registrar_venta` (ADR-0054, 2026-09-15; en producción desde el mismo día) | *(resuelto, ver nota en R-23)* |
| A-02 | El umbral de «estancado» por cada categoría (R-20) | Felipe con las líderes |
| A-03 | ~~Si Compras puede crear proveedores además de pagarles (R-10)~~ — cerrado el 2026-09-12 por R-44: sí puede, con registro de quién y cuándo lo creó. **Ese registro todavía no existe**: `proveedores` no guarda quién lo creó (consultado en vivo el 2026-09-25) | *(decidido; falta el registro)* |
| A-04 | De dónde sale el saldo a favor de IGV (R-13) | el contador |
| A-05 | ~~El método de costeo del inventario (D-45)~~ — cerrada el 2026-09-16 por Felipe: promedio ponderado, igual para compras que para cierres de producción del Taller (ADR-0067), en producción desde entonces | *(resuelto, ver ADR-0067)* |
| A-06 | Cuánto se compró sin factura el último mes (R-08) | nadie lo tiene — lo da el sistema |
| A-07 | Si el costo del flete frena los traslados a Lima (R-24) | Felipe con las líderes |
| A-08 | Si las herramientas del taller se tratan como gasto o como activo (R-51) | el contador |
| A-09 | La lista concreta de bugs de Alegra, de foros y usuarios reales (R-52) | pendiente, nadie lo ha mirado |

---

*Reglas capturadas el 2026-09-12. Las marcadas «estimación» son el criterio de Felipe,
no una medición: sirven para dimensionar, no para cerrar una decisión cara. Las marcadas
«dato duro» son hechos de la operación.*

---

## 7 · El Taller por dentro

**R-25 · La tela se compra por metro, por kilo y por rollo entero.** Las tres.
*Dato duro.*

> **Consecuencia de diseño:** el insumo necesita **unidad de compra y unidad de
> consumo**, y el rendimiento entre ambas. Se compra un rollo, se consume en metros. Sin
> esa conversión el inventario de tela no cuadra nunca, y es la primera cosa que hay que
> resolver del módulo.

**R-26 · El consumo de tela lo calcula Audaces.** Se plotea la marcada y el programa
devuelve el consumo con precisión. *Dato duro, y cambia el módulo entero.*

> **Consecuencia de diseño, y es la mejor noticia de este archivo:** el sistema **no
> tiene que estimar cuánta tela lleva una prenda**. Ese número ya existe y es exacto.
> Solo hay que recibirlo. El costeo de la prenda deja de ser una aproximación.
>
> Audaces **exporta un archivo** — se importa reusando el patrón del importador de
> catálogo que ya está construido y probado (ADR-0073), no hay que inventar un camino
> nuevo.

> **Actualización (2026-09-25, ADR-0133 decisión 5 y `docs/PLAN-PRODUCCION.md` D-D, implementado entre el
> 2026-09-19 y el 2026-09-22):** el sistema no importa el archivo de Audaces: el Taller **mide** el rendimiento real
> (consumo real ÷ prendas buenas de las órdenes cerradas del modelo). Lo que esas decisiones descartan por escrito es
> la receta manual y `bom_items`, no Audaces: **si importar Audaces se descartó o solo no se hizo, no está escrito**, y
> es pregunta para Felipe. Además, el importador de catálogo que este párrafo daba por construido (ADR-0073) se borró
> en el corte V1→V2 (2026-09-12): no hay `lib/importacion/`, `api/importacion/*` ni `/inventario/importar`
> (verificado el 2026-09-25). *El texto de arriba se conserva como quedó el 2026-09-12.*

**R-27 · El consumo puede venir por talla o como promedio del modelo**, según el caso.
*Dato duro.*

> **Consecuencia de diseño:** el consumo vive en la **variante** cuando existe por talla,
> y cae al **producto** cuando solo hay promedio. Las dos cosas a la vez, con el sistema
> sabiendo cuál está usando. Importa para el margen: si una XL lleva más tela que una XS
> y se cobran igual, la XL deja menos — y hoy eso es invisible.

> **Actualización (2026-09-25, decisión D-D en `docs/PLAN-PRODUCCION.md` —ADR asociado:
> `docs/adr/0133-produccion-modulo-propio-conectado-con-compras.md`— y
> `apps/web/lib/produccion-decision-reglas.ts:146-155`):** el rendimiento medido que se construyó es por **modelo**
> (`productoId`), no por variante ni talla — `rendimientoMedido()` agrupa por `productoId` y su tipo
> `OrdenParaRendimiento` no tiene `varianteId`. La diferencia de consumo entre una XL y una XS del mismo modelo sigue
> sin poder verse por separado; fue una simplificación decidida, no un olvido. *El texto de arriba se conserva como
> quedó el 2026-09-12.*

**R-28 · El retazo se bota; rara vez se rescata** para moños o detalles chicos.
*Dato duro.*

> El aprovechamiento (cuánto de cada metro termina en prenda) es de los números que más
> mueven el costo real, y casi ningún taller pequeño lo conoce. Con Audaces de por medio,
> CAYLA **sí puede conocerlo**.

**R-29 · El Taller corta y confecciona adentro, y terceriza confección a maquila y los
acabados** (bordado, estampado, lavandería). *Dato duro.*

**R-30 · A la maquila se le paga por prenda terminada**, sobre todo; a veces depende del
taller. *Dato duro.*

> **Consecuencia de diseño:** pagar por prenda es el caso ideal para costear — el costo
> unitario es directo, sin repartos. Si algún taller cobra por lote, ese costo se reparte
> entre las prendas que **salieron**, no entre las esperadas.

**R-31 · Entre el corte y la prenda vendible se pierde menos del 3%.** *Estimación.* Con
esa cifra no hace falta modelar segunda calidad todavía.

---

## 8 · Clientas y fidelización

**R-32 · Descartado: el Taller como beneficio.** La idea de arreglos gratis para clientas
frecuentes **no sirve**: el Taller está en Lima y el ~80% de las ventas están en Trujillo
y Arequipa. *Corrección de Felipe.* Queda escrita para que nadie la vuelva a proponer.

**R-33 · Los beneficios elegidos**, todos sin costo de margen:

| Beneficio | Qué necesita del sistema |
|---|---|
| **Apartado sin costo** | Un estado nuevo: prenda reservada, ni vendida ni disponible. **Hoy no existe** |
| **Tu talla guardada** | La clienta en la base, con su talla y preferencias |
| **Lista de deseos con aviso** | La clienta, y saber cuándo entra stock de lo que pidió |
| **Primer acceso y cambio extendido** | Nada: se pueden empezar mañana sin construir |
| **Beneficio de cumpleaños** | Fecha de nacimiento → **dato personal, entra en la Ley 29733** |

> **Actualización 2026-09-25 (ADR-0141, `docs/adr/0141-apartar-stock-reserva-fisica.md`, y ADR-0196,
> `docs/adr/0196-apartados-modulo-propio.md`):** el estado ya existe — `stock.cantidad_apartada` + tabla `apartados`
> (ADR-0141, aplicada en producción el 2026-09-22 con ok de Felipe) y módulo propio «Apartados» en el menú (ADR-0196,
> aprobado por Felipe el 2026-09-24). La fila de arriba se conserva tal como quedó el 2026-09-12.

> El apartado es el más valioso y el que más trabajo cuesta: en Perú, donde la quincena y
> el fin de mes mandan, convierte un «vuelvo el viernes» en una venta cerrada. Pero exige
> un estado de stock que hoy no existe — ni vendido ni disponible — y eso toca el núcleo.

**R-34 · Lo que gana la clienta vence a los 12 meses.** *Decidido.* Recomendación
pendiente de confirmar: que **venza por inactividad y no por calendario** — si compra
cada tres meses nunca pierde nada; si desaparece un año, se apaga.

> **Actualización (2026-09-25, D-77 en `docs/datos/DECISIONES-2026-09-21-menu-comercial.md`, decidido por Felipe el
> 2026-09-21):** la versión 1 de fidelización (construida, ADR-0154) **no acumula puntos ni saldo** — es ficha viva
> (talla, cumpleaños, aviso de talla, cambio sin fricción). El vencimiento a 12 meses de este renglón solo aplicará
> si se construye la versión 2 (niveles por gasto y saldo), todavía sin fecha ni diseño. *El texto de arriba se
> conserva como quedó el 2026-09-12.*

**R-35 · El saldo es de la clienta, no de la sede.** Lo que gana en Trujillo lo usa en
Arequipa. *Decidido.*

> **Consecuencia de diseño:** hay que decidir **qué sede absorbe el descuento** cuando se
> canjea en una tienda distinta de donde se ganó. Si lo carga la que canjea, esa tienda
> muestra un costo que no generó, y su estado de resultados (D-30) miente.

> **Actualización (2026-09-25, D-77 en `docs/datos/DECISIONES-2026-09-21-menu-comercial.md:178-184`):** hoy **no
> existe saldo que repartir entre sedes** — `retail.clientas` tiene 10 columnas (`id`, `dni`, `nombre`,
> `telefono_whatsapp`, `whatsapp_consentimiento_en`, `cumple_dia`, `cumple_mes`, `tallas`, `created_at`,
> `created_por`) y ninguna de saldo ni de puntos. Felipe decidió una versión 1 sin puntos (ficha viva: talla,
> cumpleaños, aviso de talla, ajuste de taller, cambio sin fricción); niveles por gasto y saldo/referidas quedan
> pospuestos a una versión 2, sin fecha fijada. Esta regla queda como principio para cuando esa versión 2 se
> construya — hoy no hay nada que repartir entre Trujillo y Arequipa. *El texto de arriba se conserva tal como
> quedó el 2026-09-12.*

**R-36 · El mecanismo exacto (puntos, sellos o niveles) se define con marketing.** Han
existido sellos por compra y descuento directo a la recompra. **ABIERTA.**

> Criterio de Felipe, textual: *«cualquiera da un descuento y eso cuesta plata»*. Es el
> criterio correcto — el descuento es el único beneficio que cualquier competidor copia
> mañana y sale directo del margen.

> **Actualización (2026-09-25 — D-77, `docs/datos/DECISIONES-2026-09-21-menu-comercial.md:178-182`; construida según
> ADR-0154 y el módulo «clientas» activo en producción):** para la versión 1 ya no está abierta — Felipe decidió
> (2026-09-21), tras investigar ese mismo día, **sin puntos**: los puntos ajenos devuelven 0,5–3% y su efecto en la
> recompra es débil. La versión 1 construida es ficha viva (talla, cumpleaños, aviso «llegó tu talla», ajuste de
> taller, cambio sin fricción); niveles por gasto con acceso (no descuento permanente) y saldo/referidas quedan para
> una versión 2, todavía sin mecanismo definido. *El texto de arriba se conserva como quedó el 2026-09-12.*

---

## 9 · Devoluciones

**R-37 · El orden real de una devolución:** primero se **cambia por otra prenda**; si no
hay su talla ni nada de su agrado, se da **nota de crédito o vale**; y **devolver la
plata es la última opción**. La prenda debe estar en buen estado. *Dato duro.*

**R-38 · El plazo es de 15 días y lo aplica cualquiera en caja.** *Dato duro.* No hace
falta autorización de la líder.

**R-39 · A qué stock vuelve la prenda depende del estado en que vuelva.** *Dato duro.*

> **Consecuencia de diseño:** la devolución necesita un campo de estado de la prenda, y
> ese estado decide el destino: piso si vuelve impecable, almacén o revisión si tiene uso.

> **Actualización (2026-09-25, `supabase/migrations/20260917095000_cuarentena_prendas_danadas.sql`,
> `20260917195508_liquidar_prenda_danada_como_venta.sql` y `20260918070000_devolver_proveedor_entra_a_cuarentena.sql`):**
> el destino real no es el almacén de reposición: es una tercera sububicación con nombre propio, **cuarentena** (junto
> a `piso_venta`/`almacen_tienda`). La prenda dañada entra a `prendas_danadas` en estado `en_cuarentena` hasta que un
> líder la resuelve como **se botó**, **donada** o **devuelta al proveedor** (`resolver_prenda_danada`), o la
> **liquida** como una venta real, con precio y forma de pago (`liquidar_prenda_danada`). Aplicado en producción
> desde 2026-09-18. *El texto de arriba se conserva como quedó el 2026-09-12.*

---

## 10 · Cierre, reportes y canales

**R-40 · El mes lo cierra Felipe**, idealmente con el visto bueno del contador, y si no,
a los pocos días del mes siguiente sin esperarlo. *Decidido.*

> **Actualización (2026-09-25, ADR-0198 y `supabase/migrations/20260925180000_finanzas_cierre_de_mes.sql`):** el
> cierre ya no es un acto único de Felipe sobre todo el mes: Felipe decidió (2026-09-18, confirmado) que el cierre es
> **por unidad de negocio** —cada tienda y el Taller cierran el suyo— más un **cierre consolidado** de toda CAYLA que
> exige que todas las unidades ya estén cerradas. En la base, `cerrar_periodo` y `reabrir_periodo` exigen solo
> `fn_es_lider()` (el módulo `cierre_mes` no es delegable, ADR-0195 B): cualquier líder activo puede cerrar cualquier
> unidad y el consolidado, no solo Felipe; no hay límite por tienda. *El texto de
> arriba se conserva como quedó el 2026-09-12.*

**R-41 · Lo que Felipe necesita ver y hoy no puede:**

1. **Cuánto gana de verdad por prenda** — hoy sucio por los dos lados: sin descuentos
   registrados (D-44) y con un solo costo por prenda que el nuevo pisa (D-45).
2. **Qué tienda gana plata y cuál no** — le faltan los sueldos (R-13, D-33) y el reparto
   de gastos comunes a CCO (D-32).
3. **Cuánta plata tiene dormida en stock que no rota** — su propia idea (R-22).
4. **Quién vende más y qué vende cada una** — imposible hoy: el sistema no sabe quién
   atendió (R-17).
5. **Inteligencia comercial para decidir compras y producción** — lo que más pesa, y lo
   que más depende de tener catálogo e historial cargados.

> **Actualización (2026-09-25, ver fuentes):** dos de estos cinco puntos ya se resolvieron y uno va a medias. (1) Los descuentos SÍ se
> registran desde el 2026-09-15 (`motivo_descuento` en `venta_items`, de una lista cerrada, cierra D-44) y el costo
> YA promedia en vez de pisarse desde el 2026-09-16 (ADR-0067, cierra D-45). (2) Los sueldos por sede YA se leen de
> Dynamic (`retail.planilla_por_sede`, D-33) y los gastos sin sede YA se marcan «de la empresa» (D-32); con eso,
> Finanzas F5 — Diario y resultados (en producción, `supabase/migrations/20260925130000_finanzas_diario_y_estado_de_resultados.sql`)
> entrega el Estado de Resultados por unidad. (4) A medias: el sistema ya registra quién atendió
> (`ventas.asesora_id`, ADR-0163), pero todavía no muestra quién vende más ni qué vende cada una (ver R-17).
> Sigue sin resolver: (3) un número único de «plata dormida en stock» y (5) inteligencia comercial de compras/
> producción — ninguna decisión escrita los cierra todavía. *El texto de arriba se conserva como quedó el 2026-09-12.*

**R-42 · Ya se vende por redes y WhatsApp**, aunque no haya tienda online. *Dato duro.*

> **Consecuencia de diseño, y es un problema de dato hoy:** esa venta a distancia
> despacha del stock de alguna sede y **probablemente se registra como venta de tienda**.
> Eso ensucia los dos números: la tienda parece vender más de lo que vende en mostrador, y
> el canal online parece no existir. `movimientos.canal` ya acepta `tienda` y `online` y
> **hoy siempre escribe `tienda`** — arreglarlo es barato y mejora el dato de inmediato.

> **Actualización (2026-09-25, consulta en vivo y `supabase/unificacion/`):** la columna `canal` que describe este
> párrafo **existió**: la creó la unificación con Dynamic (`supabase/unificacion/05_operacion.sql:209`, julio 2026) y
> `registrar_venta` la llenaba siempre con `'tienda'` (`supabase/unificacion/34_idempotencia_registrar_venta.sql:175-176`,
> aplicado en producción el 2026-09-10). El corte V1→V2 (`0af2f1b`, 2026-09-12) rehízo `movimientos` sin ella: hoy
> `retail.movimientos` tiene 22 columnas y ninguna `canal` (consulta en vivo, 2026-09-25). Queda como código muerto en
> `packages/shared/src/enums.ts` (`CANALES_VENTA`) y en `schemas.ts` (`movimientoInputSchema.canal`). El problema de
> fondo sigue intacto —no hay forma de distinguir una venta de redes o WhatsApp de una de mostrador— y resolverlo
> significa volver a agregar la columna a la tabla V2 y decidir quién la escribe. *El texto de arriba se conserva
> como quedó el 2026-09-12.*

**R-43 · La tienda online va dentro del próximo año**, pero después de que la física
funcione impecable. *Decidido.*

---

## Decisiones tomadas sobre las promesas incumplidas

| Ficha | Decisión de Felipe |
|---|---|
| **Orden de arreglo** | Empezar por **los candados del núcleo**. Motivo: producción tiene 28 movimientos y 2 ventas — la ventana barata se cierra el día que se cargue el catálogo |
| **Las 6 de solo texto** | Corregidas el 2026-09-12 |
| **P-18 · Depreciación** | **Construirla.** Hay 39 activos cargados y el resultado por sede está inflado sin ella |
| **P-19 · `producto_atributos`** | **Se queda, pero nadie la escribe a mano**: los atributos los propone el importador y la persona confirma (patrón de ADR-0073). Empezar con 2-3 atributos que muevan decisiones, no con 8 |

> **Actualización (2026-09-25, `supabase/migrations/20260925000000_finanzas_activos_fijos_y_gastos_fijos.sql`, en
> producción):** la fila «P-18 · Depreciación» de arriba ya está construida, no solo decidida. `fn_meses_depreciados`
> calcula la depreciación en línea recta desde el mes siguiente a la compra, y se suma como gasto de la cuenta 681
> dentro del Estado de Resultados por sede (ADR-0195 F5). La pantalla ya existe (`apps/web/app/(app)/finanzas/gastos/page.tsx`,
> pestaña de activos). *La fila de la tabla se conserva tal como quedó el 2026-09-12.*

> **Actualización (2026-09-25, consulta en vivo a producción y `docs/BACKLOG.md`):** sobre la fila «Orden de
> arreglo»: los miles de ventas que llegó a tener producción eran una demo de 90 días, retirada el 2026-09-24
> (`scripts/demo/deshacer-90-dias.sql`). La operación real recién empieza (4 ventas y 79 movimientos al 2026-09-25),
> así que la ventana barata sigue abierta, pero se cierra con cada día de tienda en vivo. *La fila se conserva tal
> como quedó el 2026-09-12.*

> **Actualización (2026-09-25, verificado en el repo y en producción):** sobre la fila «P-19»: hoy no existe ni el
> importador (ADR-0073 da el diseño; el código se borró en el corte a V2 del 2026-09-12) ni la tabla
> `producto_atributos` en producción. La decisión sigue en pie, pero no tiene hoy dónde aplicarse. *La fila se
> conserva tal como quedó el 2026-09-12.*

---

*Sección añadida el 2026-09-12, misma sesión. Reglas R-25 a R-43.*

---

## 11 · Permisos finos

**R-44 · Compras puede crear proveedores y pagarles, con registro.** *Decidido.*

> **El riesgo queda escrito, no resuelto:** quien puede dar de alta un proveedor y además
> pagarle puede inventarse uno. Felipe elige velocidad sobre control preventivo, que es
> razonable con un equipo de seis donde todos se conocen. **El control es posterior:**
> queda anotado quién creó cada proveedor y cuándo, y eso solo sirve si alguien mira ese
> registro de vez en cuando. Conviene revisarlo el día que el equipo crezca.

> **Actualización (2026-09-25, ADR-0161 «Roles por módulo», sección P3 — migración
> `20260923140000_modulos_seis_decisiones.sql`, pegada en producción el 2026-09-23):** el texto de arriba queda
> desactualizado, pero **no en el sentido de que ahora sea «solo del líder»**. Dar de alta, editar y archivar un
> proveedor dejó de exigir `fn_es_lider()` y pasó a exigir `fn_puede_gestionar_proveedores()`: **líder, o cualquier
> rol al que el líder le encienda el módulo «Proveedores»** (grupo Compras) en Colaboradores ▸ Roles y accesos —
> permiso hoy **independiente** de si ese rol también puede pagar. Por decisión de Felipe, la **Terminal Almacén**
> —que no es líder— ya tiene el módulo Proveedores y por tanto da de alta, edita y archiva proveedores. El riesgo que
> esta regla dejaba «escrito, no resuelto» sigue abierto y ahora es más amplio: ya no depende de un único rol fijo,
> sino de a quién el líder le prenda el módulo Proveedores. *El texto de arriba se conserva como quedó el
> 2026-09-12.*

**R-45 · El descuento va escalonado, con tres candados.** *Decidido, afinado sobre la
propuesta de Felipe.*

| Rango | Quién |
|---|---|
| Hasta **20%** | La líder de equipo, sola |
| De **20% a 35%** | La líder, **con argumento escrito** |
| Más de **35%** | Lo autoriza Felipe |

Y dos reglas que van encima del porcentaje:

1. **Ningún descuento puede dejar el precio por debajo del costo**, sin importar el
   rango autorizado. La líder no ve el costo y no tiene cómo saberlo: **lo calcula el
   sistema y frena, sin revelar el número.**
2. **El motivo se elige de una lista, no se escribe libre.** «Cumpleaños clienta top»,
   «prenda con desperfecto», «liquidación de temporada», «cerrar la venta», y «otro» con
   texto. Un texto libre no se puede sumar; una lista sí — y a fin de mes se ve **cuánto
   margen se fue por cada motivo**. Eso convierte el descuento de una fuga invisible en
   una decisión que se mide.

> **Actualización (2026-09-25, `supabase/migrations/20260915140000_descuento_motivo_y_escalonado.sql:27` y D-67 en
> `DECISIONES-2026-09-21-menu-comercial.md`; y `20260925230000_argumento_descuento_desde_15.sql`):** la tabla de
> arriba ya no es la regla vigente. **Desde el 2026-09-25, por decisión de Felipe, todo descuento manual que pase el
> 15% pide un argumento escrito, lo aplique quien lo aplique** (antes: solo a un líder y pasado el 20%); las líneas
> de campaña no lo piden. Y la fila «Más de 35% → lo autoriza Felipe» tampoco es así. Desde el
> 2026-09-15, por decisión explícita de Felipe, **la base no autoriza un descuento mayor a 35% para nadie, ni
> siquiera para Felipe** (la razón de entonces: la base solo distinguía líder de colaborador; desde el 2026-09-23
> sí distingue al Admin con `fn_es_admin()`, ADR-0178, pero la regla de más de 35% no se volvió a revisar); superarlo de verdad se resuelve fuera del sistema, en Studio, igual que los códigos de descuento. Además,
> desde el 2026-09-22 (D-67) existe un segundo candado, a nivel de VENTA y no de línea: `colaboradores.tope_descuento_pct`
> (10% por defecto para cada colaboradora, sin tope para el líder), que exige autorización de un líder activo para
> superarse. **Los dos mecanismos conviven hoy sin validarse entre sí y el mostrador todavía no manda ese segundo
> parámetro** — sigue siendo una decisión de negocio pendiente. *El texto de arriba se conserva como quedó el
> 2026-09-12.*

**R-46 · Anular una venta o un comprobante: la líder de equipo, el mismo día.**
*Decidido.* Después ya no.

> **Consecuencia de diseño:** hace falta una ventana de tiempo. Lo natural es atarla a la
> caja: **mientras la caja de ese día siga abierta, se puede anular; cuando cierra, se
> cierra también esa puerta.** Reusa un concepto que el sistema ya tiene en vez de
> inventar un plazo en horas.

**R-47 · Ajustar stock sin venta: la líder, con motivo obligatorio.** *Decidido.*

> Es el permiso más delicado del inventario — el que permite hacer desaparecer
> mercadería del sistema. El control elegido no es un tope sino la **trazabilidad**:
> cada ajuste con su motivo y su autor. El campo ya existe (`movimientos.motivo`), pero
> hoy es **texto libre sin lista cerrada** (ver `01-INVARIANTES.md`): para que esto sirva
> de verdad, el motivo de un ajuste debería salir de una lista, igual que R-45.

> **Actualización (2026-09-25, `apps/web/components/AjustarInventarioModal.tsx:25-30`, desde 2026-09-15):** la
> pantalla de ajuste ya no ofrece texto libre para el motivo: el desplegable «Elegir motivo» limita a una lista
> cerrada (`reposicion`, `merma`, `conteo_fisico`, `otro`), tal como pedía esta regla. Lo que sigue pendiente es la
> otra mitad: `movimientos.motivo` en la base sigue sin un `check` y `registrar_movimiento` acepta cualquier texto en
> `p_motivo` — el candado real está solo en la pantalla, no en la base. *El texto de arriba se conserva como quedó
> el 2026-09-12.*

**R-48 · Cada líder ve solo su sede.** *Decidido.* Ni las ventas ni los números de las
otras tiendas.

> **Excepción vigente, todavía abierta (2026-09-15; rotulada el 2026-09-22, ADR-0151):** `/productos` muestra el
> stock **total de la red** —todas las sedes y el Taller—, escrito «Stock total», no el de la sede activa. Nació de una
> decisión de Felipe que solo vivía en un comentario de migración; qué número debe ver una tienda sigue sin decidirse
> (opciones A/B/C en `docs/pantallas/productos.md`, sección 8).

> **Tensión que conviene mirar:** el sistema ya calcula sugerencias de traslado entre
> sedes, y esas sugerencias hablan del stock de otra tienda. La sugerencia **sí se le
> puede mostrar** («manda 3 de esta talla a Arequipa») sin abrirle el inventario ajeno.
> Pero si alguna vez se decide que pueda consultar el stock de las otras, que sea una
> decisión y no un efecto secundario de construir los traslados.

> **Actualización (2026-09-25, D-69 en `DECISIONES-2026-09-21-menu-comercial.md`):** el alcance del líder ya no es
> «solo su sede» a secas. Felipe decidió (2026-09-21) que sea **su sede, más las que él le asigne** (resuelve
> R-48/D-14, pendiente desde ADR-0143), a aplicarse después de la salida en TRU. **A la fecha de esta nota sigue sin
> construirse:** hoy los 8 líderes (verificado el 2026-09-25) tienen alcance global y ninguno está asignado a una tienda (ADR-0143), y
> `docs/BACKLOG.md` registra a D-69 como pendiente. *El texto de arriba se conserva como quedó el 2026-09-12.*

**R-49 · Una persona cesada deja de entrar, sola.** *Decidido.* Si en el sistema de
personal figura cesada, no entra a retail.

> **Y es de los arreglos más baratos de todos.** La vista `retail.personas` **ya expone
> la columna `estado`** (verificado el 2026-09-12), y `apps/web/lib/persona.ts` **no la
> menciona ni una vez**: pide solo `id, nombre, rol, sede_id`. Hoy una colaboradora dada
> de baja en RR.HH. **sigue pudiendo vender y cerrar caja** mientras exista su cuenta.
> El arreglo son unas tres líneas: leer `estado` y negar el acceso si no es `activo`.
> No hace falta construir nada nuevo ni amarrar los sistemas: ya están amarrados.

> **Actualización (2026-09-25, `supabase/migrations/0009_integracion_dynamic.sql` y
> `supabase/migrations/20260923120100_ubicacion_de_lideres.sql`):** el arreglo de tres líneas que pedía esta nota ya
> se hizo, y por otro camino. `retail.personas` se borró sin reemplazo el 2026-09-12; hoy la identidad vive en
> `public.personas` (Dynamic) y `apps/web/lib/persona.ts` fue reemplazado por `apps/web/lib/persona-actual.ts`. Su
> función `fn_persona_actual_resumen()` (última versión: `20260923120100_ubicacion_de_lideres.sql`) ya exige
> `p.estado = 'activo'` sobre `public.personas` **y** `c.estado = 'activo'` sobre `retail.colaboradores`: una
> colaboradora cesada en RR.HH. no obtiene fila y `requirePersonaActualV2()` la manda a `/login`. *El texto de
> arriba se conserva como quedó el 2026-09-12.*

---

*Sección añadida el 2026-09-12. Reglas R-44 a R-49. Con esto, las 49 reglas cubren cómo
compra, cómo paga, cómo produce, cómo vende y quién puede qué en CAYLA.*

---

## 12 · Lo que faltaba anotar

> Estas cuatro salieron en la misma sesión y se escaparon de la primera pasada. Se
> detectaron revisando el documento contra lo que Felipe había respondido, término por
> término. Quedan acá para que la lista esté completa de verdad.

**R-50 · El depósito del día debe subirse al sistema con su voucher y su número de
operación.** Hoy la líder **le manda el voucher a Felipe por WhatsApp**. Lo que Felipe
quiere —textual: *«lo mejor es que suban al sistema y suban el voucher y registren el
número operación»*— es que eso viva en el sistema. *Dato duro, y lo calificó de
excelente idea.*

> **Consecuencia de diseño, y es la que desbloquea la conciliación bancaria:**
> `depositos_bancarios` **no tiene columna para el número de operación** — hoy, si se
> anota, va en la nota de texto libre. Sin ese número **ningún depósito se puede casar
> contra el extracto del banco**, y la conciliación nunca llega a cero.
>
> La pantalla necesita tres cosas: el monto, **el número de operación**, y **la foto del
> voucher**. Las tres, no dos: la foto sirve para auditar, el número sirve para cruzar
> automáticamente. Una foto sola no se puede cruzar.
>
> Ojo con el almacenamiento de archivos: está apagado en el entorno local a propósito
> (ADR-0010), así que esta pantalla no se va a poder probar entera en local. Conviene
> saberlo antes de empezarla y no descubrirlo a mitad.

> **Actualización (2026-09-25):** la tabla `depositos_bancarios` no existe — era de V1, borrada el 2026-09-12
> (ADR-0056). Hoy un depósito bancario se registra por tres caminos vivos, y ninguno cierra el hueco de arriba del
> todo: (a) **con la caja abierta**, «Depósito bancario» como egreso en `retail.caja_movimientos` (ADR-0056), donde la
> pantalla sí exige el N.º de operación (`apps/web/lib/caja-panel-reglas.ts`, `referenciaObligatoria`); (b) **al
> cerrar caja** (`cerrar_caja`, traslado con destino `'banco'`), una fila en `retail.caja_traslados` (ADR-0186), con
> la referencia opcional desde el 2026-09-23 (`20260923233000_caja_deposito_sin_numero_de_operacion.sql`); y (c)
> **desde Cuentas y dinero**, una fila en `retail.movimientos_dinero` con `tipo = 'deposito'` (ADR-0195 F3). En los
> tres el número vive en un texto libre (`referencia`), sin columna propia, y **en ninguno se puede subir la foto del
> voucher**. *El texto de arriba se conserva como quedó el 2026-09-12.*

**R-51 · Lo que CAYLA compra no son tres rubros, son cinco.** *Dato duro.* Además de
mercadería para vender, insumos del taller y servicios de terceros:

- **Insumos de limpieza y útiles de oficina.**
- **Herramientas de apoyo del taller**: tijeras cortahilos (piqueteras), abre ojal, y
  similares.

> **Consecuencia de diseño:** las herramientas son el caso que no encaja en ninguna
> casilla obvia. No son insumo que se consume en una prenda —una piquetera dura años— ni
> son gasto del mes en sentido estricto. Contablemente son **activos de bajo valor**, y
> la decisión práctica es tratarlos como gasto al comprarlos en vez de darlos de alta
> como activo fijo. Vale confirmarlo con el contador, pero **el sistema debe permitir
> registrarlos sin obligar a decidirlo en el momento de la compra.**

**R-52 · Qué NO repetir de Alegra.** Es el sistema que CAYLA usa hoy y Felipe lo describe
sin rodeos. Sus quejas, textuales, son requisitos en negativo:

| Lo que falla | Qué significa para lo que construimos |
|---|---|
| **Es lento: cada clic espera al servidor** | Es de arquitectura, no de pantalla. Es exactamente lo que ataca la decisión local-first (D-49, ADR-0013, ADR-0018) |
| **No deja registrar los asesores de atención al cliente de forma dinámica** | Ver R-17: hoy no se sabe quién vendió qué. Sin eso no hay comisiones, ni ranking, ni forma de saber si una tienda vende poco por ubicación o por equipo |
| **Los inventarios son horribles de manejar** | No entiende talla y color como matriz. Es el hueco de mercado que la propia investigación de CAYLA identifica como su ventaja |
| **Los reportes no sirven o no se entienden** | Sabe facturar y no dice cómo va el negocio. Es lo que ataca R-41 |
| **Tiene varios bugs** | Pendiente: Felipe pidió mirar foros y comentarios reales de usuarios para sacar la lista concreta. **No se ha hecho** |

> **Actualización (2026-09-25, D-62 en `docs/datos/DECISIONES-2026-09-21-menu-comercial.md` + ADR-0153 + ADR-0163):**
> desde el 2026-09-22 `retail.ventas.asesora_id` guarda quién atendió la venta, y `fn_asesoras_de_turno` arma la
> lista desde la asistencia real de Dynamic. La fila de arriba («no deja registrar los asesores... hoy no se sabe
> quién vendió qué») ya no es cierta en el sentido estricto: el dato de quién atendió existe y se captura en cada
> venta. Lo que sigue sin construirse es lo que se arma encima de ese dato — comisiones, ranking por asesora —, no
> la captura misma. *El texto de arriba se conserva como quedó el 2026-09-12.*

> **Por qué esto vale como documento:** un sistema que la gente esquiva no falla por
> falta de funciones, falla por fricción. Esta tabla es la lista de fricciones que ya
> sabemos que existen — y que ya le costaron a CAYLA ventas sin facturar en hora punta
> (R-14, R-15).

**R-53 · El sistema debería sugerir cuánto comprar.** *Pedido de Felipe*, textual: que
sugiera **por campañas**, y usando **la demanda y la velocidad de rotación**.

> **Consecuencia, y hay que decirla:** eso tiene nombre —presupuesto abierto de compra— y
> **hoy no hay con qué construirlo**. Necesita catálogo cargado e historial de ventas por
> talla y color, y producción tiene 28 movimientos y 2 ventas. **No se construye antes
> del censo; se construye después.** Ponerlo antes daría sugerencias inventadas, que es
> peor que no dar ninguna.

> **Actualización (2026-09-25, consulta en vivo a producción y `docs/BACKLOG.md`, demo de 90 días):** la
> precondición **todavía no se cumple**. El volcado del 2026-09-23 (`docs/datos/generado/retail_filas.json`) mostraba
> miles de ventas y movimientos, pero eran una **demo sembrada de 90 días**, que se retiró el 2026-09-24 con
> `scripts/demo/deshacer-90-dias.sql`. Al 2026-09-25 producción tiene 4 ventas, 79 movimientos y 9 productos
> reales: no hay todavía historial de ventas por talla y color que sostenga una sugerencia. Tampoco existe la
> función: no hay RPC, tabla ni pantalla de «presupuesto abierto de compra» en el repo. *El texto de arriba se
> conserva como quedó el 2026-09-12.*

---

*Sección añadida el 2026-09-13. Reglas R-50 a R-53. Total: 53 reglas.*
