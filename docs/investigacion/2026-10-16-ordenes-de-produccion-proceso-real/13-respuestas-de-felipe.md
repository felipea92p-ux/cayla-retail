# 13 · Respuestas de Felipe a la ronda de 36

**Estado:** en curso, 9 llamadas de 4 (`11-banco-de-preguntas.md`). Cada llamada se anota aquí apenas Felipe contesta. Lo que dice cada respuesta es **lo que Felipe
contestó**, no una decisión de construcción: el efecto en el sistema se resume en una línea y el diseño viene después, cuando termine la ronda.

## Llamada 1 (2026-10-16) · P-01 a P-04, las bloqueantes del bloque 1

| # | Pregunta | Respuesta de Felipe | Efecto, en una línea |
|---|---|---|---|
| P-01 | ¿Quién pone la tela cuando se manda coser, bordar o lavar fuera? | «Mando la tela cortada» | Confirma lo que ADR-0400 d.4 imagina: la tela sigue siendo de CAYLA (consumo de la orden), no una compra de prenda. Quedan fuera por ahora «el servicio compra la tela» y «de las dos formas». |
| P-02 | ¿Qué papel acompaña hoy lo que sale hacia un servicio? | Respuesta propia: «por ahora no te compliques con esta parte; es mejor escribir un breve comentario, más adelante podemos construir algo mejor y más formal» | La guía sigue siendo un comentario breve en la Salida (como ya está en d.4); la guía de remisión formal queda para una etapa posterior. El riesgo legal (SUNAT pide guía antes de mover mercadería; retención o multa del 15 %) se le informó en la pregunta y la decisión de diferirlo es suya. La lista de preguntas para el contador (`04` §8) sigue abierta. |
| P-03 | ¿El Taller está declarado ante SUNAT como un local de CAYLA, con su dirección? | «Sí»: está declarado como otro establecimiento de CAYLA, en Gamarra (La Victoria, Lima) | La guía entre locales propios es posible. La dirección completa la dio Felipe en la sesión (no se copia en este archivo versionado); hoy el Taller no tiene dirección en la base y se carga en `ubicaciones` cuando se construya. Lo dijo él; no se contrastó con SUNAT. |
| P-04 | Si una fase termina con menos prendas de las que entraron, ¿quién puede darla por terminada? | «La encargada, con motivo» | Una fase puede cerrar corta con la pérdida escrita y su motivo, sin pasar por una líder. Hoy la pantalla no lo deja (`07·H-7.1`). |

**REABRE:** ninguna de las cuatro reabre una decisión ya tomada. P-02 deja A3 y d.4 como están.

## Llamada 2 (2026-10-16) · P-05 a P-08

| # | Pregunta | Respuesta de Felipe | Efecto, en una línea |
|---|---|---|---|
| P-05 | Si cancelas una orden con la tela ya cortada, ¿qué pasa con lo cortado? | «Preguntar qué se hace» | Anular con tela cortada pide decidir qué se hace con lo cortado (usarla en otra orden, liquidar o botar, con motivo); ya no vuelve toda al estante como tela entera. |
| P-06 | Una prenda con falla chica que se vende más barata, ¿qué pasa con ella? | «Se arregla y cuenta» | La falla chica se arregla en el Taller y la prenda cuenta como buena; ese arreglo no se costea (ver P-07). **Queda por precisar:** quién arregla lo que devuelve un servicio y qué pasa si el arreglo no alcanza. |
| P-07 | ¿Cómo se le paga a la gente del Taller que corta y cose? | Respuesta propia: «la mano de obra no entra en el costo del producto, los integrantes tienen un sueldo mensual, si se tercializa sí contaría; ayúdame con esto, analicemos» | Sueldo mensual (no por prenda ni por horas): «por fase» basta para el avance y no existe un dato por persona que pague. La mano de obra propia no entra al costo de la prenda; la fase tercerizada sí (su tarifa devengada). Se analizó con él y se resuelve con P-31 (abajo). |
| P-08 | ¿Dónde queda anotado hoy el paso de corte a costura a acabado? | Respuesta propia: «Todo en este sistema, así poder gestionar» | El sistema es el único registro (sin cuaderno ni doble anotación). Es un objetivo, no una descripción de hoy: cómo se anota hoy sigue sin conocerse. Sube la exigencia: «Terminé N» tiene que ser tan fácil como el cuaderno (`08` principios de captura). |

**REABRE:** P-07 y P-08 matizan «el papel alcanza» de d.1 (el sistema pasa a ser el único registro) y tocan D-31 (se reabre en P-31).

## Llamada 3 (2026-10-16) · P-31 (adelantada), P-09, P-10 y P-11

Felipe pidió analizar la mano de obra antes de seguir (P-07), así que P-31 pasó de la llamada 8 a esta. **P-12** («quién ve cuántas prendas terminó cada persona») se difiere:
con sueldo mensual el dato por persona no paga nada y pierde peso; se retoma si algún día se paga por pieza.

| # | Pregunta | Respuesta de Felipe | Efecto, en una línea |
|---|---|---|---|
| P-31 | ¿El costo de una prenda cosida en el Taller incluye el trabajo de la gente del Taller? | «Fuera, con cifra aparte» | La prenda queda con costo limpio (tela, avíos y servicios). El costo del Taller por prenda (planilla y gastos del Taller ÷ prendas terminadas del mes) se ve **aparte, por mes y sin anotar horas**, para compararlo con la tarifa de un servicio. **REABRE D-31 en parte:** el costo real ya no «se pega a la prenda», se mide aparte como eficiencia. Sigue abierto con el contador: cómo cierra hoy el costo de ventas (NIC 2 pide mano de obra directa). |
| P-09 | ¿Cuántos días pasan desde que deciden cortar un modelo hasta que está colgado en una tienda? | «10 a 20 días» | Se mantiene la estimación de unos 14 días (dato de Felipe, no medido): unos 40 modelos salen en «producir ya». Se mide con la primera orden real. |
| P-10 | ¿Cómo llega una caja del Taller a Trujillo y Arequipa, y quién la recibe y la cuenta? | «Courier o carga» | El tramo Taller → tienda va por transportista (24 a 48 horas a capitales según la fuente). **Sin contestar:** quién recibe y cuenta la caja. |
| P-11 | ¿Quién debe anotar «Terminé N» en el Taller? | «Solo la encargada» | Un solo punto estable y un solo hábito. La cuenta del Taller es compartida: el «quién» sale del responsable que se elija en el combo. |

**REABRE:** P-31 reabre D-31 (en parte); P-09, P-10 y P-11 no reabren nada.

## Llamada 4 (2026-10-16) · P-13 a P-16, repetida a pedido de Felipe

La primera vez contestó P-13 con texto propio y P-16 sin preferencia, y pidió repetirla. Su texto propio de P-13: lo que él conoce y se hace «nosotros o tercializado, eso
depende» es **ploteo, patronaje, muestreo, costura, corte, ojales y botones y planchado**; **no usan por ahora ni estampado ni lavado**. P-13 se volvió a preguntar con su lista
en orden; P-14 a P-16 se repitieron iguales.

| # | Pregunta | Respuesta de Felipe | Efecto, en una línea |
|---|---|---|---|
| P-13 | Con su lista en orden, ¿cuáles deben aparecer como pasos de cada orden? | «Orden y modelo» | **Cada orden:** Ploteo · Corte · Costura · Ojales y botones · Planchado (cada paso lo hace el Taller o un servicio). **El modelo (una vez):** Patronaje y Muestreo. Estampado y lavado apagados por ahora; bordado no lo mencionó y se trata como apagado hasta que diga. **REABRE d.2** (Corte · Costura · Acabado, trazo dentro de Corte, patrón y muestra fuera del lote). |
| P-14 | ¿Qué papel te da casi siempre un servicio al entregar? | «Una mezcla de papeles» | El sistema debe prever factura, boleta, recibo por honorarios y nada; cada uno sustenta distinto. Matiza el supuesto «el proveedor dice si su papel lleva IGV». |
| P-15 | ¿Adelantas dinero a algún servicio? | «No, pago al recibir» | Se confirma el supuesto «sin adelantos» de ADR-0400. |
| P-16 | Si un modelo no cabe en un solo lugar en campaña, ¿cómo se anota? | «Dos órdenes, como hoy» (la primera vez: sin preferencia) | d.3 se mantiene: una fase, un solo «quién»; para partir, dos órdenes. |

**Preguntas que salen de esta llamada** (no estaban en el banco): ¿Dónde quedan limpiar hilos, revisar, etiquetar y embolsar, ahora que Acabado no es una fase? ¿Se usa el bordado?

**REABRE:** P-13 reabre d.2; P-14 matiza un supuesto; P-15 y P-16 confirman lo decidido.

## Llamada 5 (2026-10-16) · P-17, P-18, N-1 (pregunta nueva) y P-19

| # | Pregunta | Respuesta de Felipe | Efecto, en una línea |
|---|---|---|---|
| P-17 | Si un servicio no da factura, ¿qué prefieres? | «Seguir, marcando “sin factura”» | La orden admite el costo de un servicio sin papel y lo marca; ese gasto no se deduce ni da crédito, y el contador debe saberlo. |
| P-18 | Si un servicio estropea tu tela o pierde prendas, ¿qué prefieres por defecto? | «Me quedaría con la opción 1 (cobrar por escrito), pero eso casi siempre es un problema y muchas veces va a pérdida; un taller tercero no siempre es responsable; lo más adecuado sería desarrollar una rúbrica o contrato simple» | Cobrar por escrito queda como defecto, con la salvedad de que en la práctica muchas veces se pierde. **Pendiente nuevo:** una rúbrica o contrato simple para los servicios (tolerancia de faltantes y defectos, quién responde, cómo se descuenta). Un borrador necesita la revisión del contador o de un abogado. |
| N-1 | ¿Qué otros pasos se hacen además de los de su lista? (selección múltiple) | «Estos por ahora, luego podemos ampliar»: **Limpiar hilos y revisar** y **Etiquetar y embolsar**; **sin bordado** | La orden queda con siete pasos, en este orden (el de «revisar» y «planchar» es supuesto): Ploteo · Corte · Costura · Ojales y botones · Limpiar hilos y revisar · Planchado · Etiquetar y embolsar. Patronaje y Muestreo siguen en el modelo. Bordado, estampado y lavado: apagados por ahora, ampliable. |
| P-19 | Las prendas que corta el Taller, ¿son de tela plana o también de punto? | «También punto, por kilo» | **REABRE d.6:** ADR-0400 daba por hecho solo metros y descartó la conversión kilo → metro; el punto llega en kilos (coincide con R-25). El consumo y la compra del punto cambian de unidad, y los metros por kilo dependen del gramaje y del ancho de cada tela. |

**REABRE:** P-19 reabre d.6 (tela por metros) y N-1 amplía d.2 (las fases de la orden); P-17 confirma un supuesto; P-18 agrega un pendiente.

## Llamada 6 (2026-10-16) · P-20, N-2 (pregunta nueva), P-21 y P-22

| # | Pregunta | Respuesta de Felipe | Efecto, en una línea |
|---|---|---|---|
| P-20 | ¿Qué entrega Audaces como consumo de un modelo? | «Un número por marcada» | El consumo de Audaces es uno por marcada (varias tallas juntas); sirve de base, pero no incluye puntas ni defectos, así que lo gastado saldrá mayor. El formato real del reporte sigue sin verse (va en el paquete de evidencia). |
| N-2 | Para el punto, que compras por kilo, ¿cómo calculas los kilos a pedir? | «Audaces en metros, convierto» | Un solo consumo por modelo, en metros; el punto se pasa a kilos con el gramaje y el ancho de cada tela (hay que guardar ambos). Con P-19: el punto se compra en kilos y se consume en metros. |
| P-21 | ¿Cuántas órdenes cerradas de un modelo quieres antes de que lo gastado mande sobre lo de Audaces? | «Varias (3 o más)» | **REABRE d.6** («lo medido gana» desde la primera orden): lo gastado manda sobre Audaces solo desde la tercera orden cerrada del modelo; antes manda Audaces. |
| P-22 | ¿Cuánto se puede cortar de más sin que sea error? | «Pocas prendas por talla» | **REABRE d.7** (10 % del plan): el tope se dice en prendas por talla, no en porcentaje. **Falta fijar el número** (pregunta N-3). |

**REABRE:** P-21 reabre d.6 y P-22 reabre d.7; P-20 y N-2 completan lo de la tela.

## Llamada 7 (2026-10-16) · N-3 (pregunta nueva), P-23, P-24 y P-25

| # | Pregunta | Respuesta de Felipe | Efecto, en una línea |
|---|---|---|---|
| N-3 | ¿Cuántas prendas de más por talla y color aceptas antes de que sea un error? | «Hasta 3 por talla» | Cierra lo que abrió P-22: el tope de corte de más es de 3 prendas por talla y color (reemplaza el 10 % de d.7). Hay que alinearlo con el tope de cierre de ADR-0415 (el mayor entre 2 × plan y plan + 5). |
| P-23 | Antes de cortar, ¿qué le haces a la tela que llega? | «La revisas y mides» | La tela se revisa y mide al llegar; el reposo y el encogimiento quedan sin anotar (por ahora no son un paso). |
| P-24 | ¿Alguna vez salió un tono distinto entre rollos del mismo color? | «Nunca ha pasado» | No se agrega seguimiento del lote de tinte por ahora; el consumo sigue tomando el lote más antiguo. Es su experiencia hasta hoy, no una garantía. |
| P-25 | De cada 100 prendas que cortan, ¿cuántas terminan mal? | «Arreglan muchas, pierden pocas» | Se separa arreglar de perder: muchas se arreglan y pocas se pierden. Las horas de arreglo no se anotan (sueldo mensual, P-07). **Matiza R-31** («menos de 3 %»): no sirve como medida de lo que termina mal. Falta un número propio de cuántas se arreglan; se mide con la primera orden. |

**REABRE:** N-3 cierra d.7 (con P-22); P-25 matiza R-31; P-23 y P-24 no reabren nada.

## Llamada 8 (2026-10-16) · P-26 a P-29

| # | Pregunta | Respuesta de Felipe | Efecto, en una línea |
|---|---|---|---|
| P-26 | ¿Quién declara «buena» a la prenda terminada? | «Quien termina, con visto» | Quien hace el paso «Limpiar hilos y revisar» lo marca con su visto; no hay un paso aparte con responsable. Costo: quien cose juzga su propia prenda. |
| P-27 | ¿Quieres pasar a las tiendas una parte del lote antes de terminarlo todo? | «No por ahora» | El lote pasa al stock una sola vez, al terminar todo («Pasar al stock» solo con la última fase terminada); no hay entregas parciales a tiendas. El principio 4 se mantiene. |
| P-28 | Antes de fabricar un modelo nuevo en cantidad, ¿qué debe ser obligatorio? | «Anotar quién aprobó» | Queda escrito quién aprobó la muestra (una frase antes del primer lote); no hace falta que apruebe él. |
| P-29 | Si cambia el pedido ya empezado, ¿qué prefieres? | «Cambiarlo con motivo» | Una orden abierta se puede cambiar (cantidad, color) con motivo, según lo avanzado. Hoy no existe ninguna función que edite una orden abierta: pide una función nueva con reglas por avance. |

**REABRE:** ninguna reabre una decisión ya tomada; P-29 agrega una función que hoy no existe.

## Llamada 9 (2026-10-16) · P-30, P-32, P-33 y P-34

| # | Pregunta | Respuesta de Felipe | Efecto, en una línea |
|---|---|---|---|
| P-30 | De las últimas cinco entregas de servicios, ¿cuántas llegaron a tiempo y completas? | «La mitad» | Dato de Felipe (no medido): más o menos la mitad de las entregas de un servicio llegan a tiempo y completas. El atraso del servicio merece una señal propia en la lista de órdenes. |
| P-32 | Al cerrar una orden, ¿cuáles tres cifras quieres ver primero? | «Costo, metros, buenas» | El cierre muestra primero el costo, los metros de tela y las prendas buenas: salen de lo que ya se anota. Las cifras del servicio (segundas, faltantes, atraso) quedan para después. |
| P-33 | Al abrir una orden, ¿qué fecha es la importante? | «Sale del Taller» | Una sola fecha que llenar: cuándo sale del Taller. La de venta sale sumando el plazo (estimado de 10 a 20 días, P-09, y el courier, P-10). Confirma el supuesto de fecha de ADR-0400. |
| P-34 | ¿Quieres que cada orden guarde si fue reposición o novedad, y a qué tienda va? | «Las dos cosas» | Al abrir, cada orden guarda si es **reposición o novedad** y **a qué tienda va** (dos datos más al abrir). Hoy el destino lo decide Traslados: queda por ver cómo conviven. |

**REABRE:** ninguna reabre una decisión ya tomada; P-34 suma dos datos al abrir.

## Llamada 10 (2026-10-16) · P-35, P-36 y dos seguimientos (P-06b, P-10b)

| # | Pregunta | Respuesta de Felipe | Efecto, en una línea |
|---|---|---|---|
| P-35 | Cuando se acaba un modelo y lo piden con urgencia, ¿qué debe poder hacer la orden? | «Fecha y marca “urgente”» | La orden puede llevar su fecha y una marca «urgente»; no hay prioridades automáticas ni orden de fila. |
| P-36 | Si un servicio pide un mínimo que un solo modelo no cubre, ¿te sirve mandar dos modelos juntos en una Salida? | «Solo un aviso» | Se mantiene d.5: si una Salida queda bajo el mínimo del servicio, la pantalla avisa y no bloquea; una Salida sigue siendo de un solo modelo. |
| P-06b | Cuando un servicio devuelve prendas con una falla que se puede arreglar, ¿quién las arregla? | «El Taller las arregla» | Lo que un servicio devuelve con falla arreglable lo arregla el Taller y cuenta como buena; el servicio no paga su falla y las horas no se costean (P-07). |
| P-10b | Cuando llega la caja del Taller a una tienda, ¿quién la recibe y la cuenta? | «Quien esté de turno» | La caja la recibe y cuenta quien esté de turno. Riesgo dicho en la pregunta: sin un responsable fijo, una diferencia no tiene dueño (la recomendación era la encargada). |

**REABRE:** ninguna reabre una decisión ya tomada. **Fin de la ronda:** 35 de las 36 del banco contestadas (P-12 diferida) más 5 de seguimiento (N-1 a N-3, P-06b, P-10b), en 10 llamadas.
