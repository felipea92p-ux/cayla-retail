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
> de estas frases, la frase lleva su marca `R-nn` para poder rastrearla.

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
*Estimación.* El estado `pagado_parcial` se construye porque es gratis, pero ninguna
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

**R-08 · Lo primero que el módulo tiene que responder no es «cuánto debo», es «cuánto
compré sin respaldo este mes».** Hoy nadie tiene ese número. Sin él, la conversación con
el contador es una opinión.

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
> lo resuelve `depositos_bancarios.sede_id`.

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
| A-01 | El tope de descuento de una líder de equipo (R-23) | Felipe |
| A-02 | El umbral de «estancado» por cada categoría (R-20) | Felipe con las líderes |
| A-03 | Si Compras puede crear proveedores además de pagarles (R-10) | Felipe |
| A-04 | De dónde sale el saldo a favor de IGV (R-13) | el contador |
| A-05 | El método de costeo del inventario (D-45) | el contador |
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

**R-27 · El consumo puede venir por talla o como promedio del modelo**, según el caso.
*Dato duro.*

> **Consecuencia de diseño:** el consumo vive en la **variante** cuando existe por talla,
> y cae al **producto** cuando solo hay promedio. Las dos cosas a la vez, con el sistema
> sabiendo cuál está usando. Importa para el margen: si una XL lleva más tela que una XS
> y se cobran igual, la XL deja menos — y hoy eso es invisible.

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

> El apartado es el más valioso y el que más trabajo cuesta: en Perú, donde la quincena y
> el fin de mes mandan, convierte un «vuelvo el viernes» en una venta cerrada. Pero exige
> un estado de stock que hoy no existe — ni vendido ni disponible — y eso toca el núcleo.

**R-34 · Lo que gana la clienta vence a los 12 meses.** *Decidido.* Recomendación
pendiente de confirmar: que **venza por inactividad y no por calendario** — si compra
cada tres meses nunca pierde nada; si desaparece un año, se apaga.

**R-35 · El saldo es de la clienta, no de la sede.** Lo que gana en Trujillo lo usa en
Arequipa. *Decidido.*

> **Consecuencia de diseño:** hay que decidir **qué sede absorbe el descuento** cuando se
> canjea en una tienda distinta de donde se ganó. Si lo carga la que canjea, esa tienda
> muestra un costo que no generó, y su estado de resultados (D-30) miente.

**R-36 · El mecanismo exacto (puntos, sellos o niveles) se define con marketing.** Han
existido sellos por compra y descuento directo a la recompra. **ABIERTA.**

> Criterio de Felipe, textual: *«cualquiera da un descuento y eso cuesta plata»*. Es el
> criterio correcto — el descuento es el único beneficio que cualquier competidor copia
> mañana y sale directo del margen.

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

---

## 10 · Cierre, reportes y canales

**R-40 · El mes lo cierra Felipe**, idealmente con el visto bueno del contador, y si no,
a los pocos días del mes siguiente sin esperarlo. *Decidido.*

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

**R-42 · Ya se vende por redes y WhatsApp**, aunque no haya tienda online. *Dato duro.*

> **Consecuencia de diseño, y es un problema de dato hoy:** esa venta a distancia
> despacha del stock de alguna sede y **probablemente se registra como venta de tienda**.
> Eso ensucia los dos números: la tienda parece vender más de lo que vende en mostrador, y
> el canal online parece no existir. `movimientos.canal` ya acepta `tienda` y `online` y
> **hoy siempre escribe `tienda`** — arreglarlo es barato y mejora el dato de inmediato.

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

**R-49 · Una persona cesada deja de entrar, sola.** *Decidido.* Si en el sistema de
personal figura cesada, no entra a retail.

> **Y es de los arreglos más baratos de todos.** La vista `retail.personas` **ya expone
> la columna `estado`** (verificado el 2026-09-12), y `apps/web/lib/persona.ts` **no la
> menciona ni una vez**: pide solo `id, nombre, rol, sede_id`. Hoy una colaboradora dada
> de baja en RR.HH. **sigue pudiendo vender y cerrar caja** mientras exista su cuenta.
> El arreglo son unas tres líneas: leer `estado` y negar el acceso si no es `activo`.
> No hace falta construir nada nuevo ni amarrar los sistemas: ya están amarrados.

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

---

*Sección añadida el 2026-09-13. Reglas R-50 a R-53. Total: 53 reglas.*
