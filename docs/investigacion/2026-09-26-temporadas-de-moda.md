# Temporadas de moda: qué hacen las mejores empresas y qué aplica a CAYLA

- **Fecha:** 2026-09-26.
- **Para qué:** decidir cómo marca CAYLA la temporada de cada producto, que usa Frescura del piso (ADR-0208) para no
  comparar una prenda de verano con una de invierno. Decisión tomada: ADR-0246.
- **Cómo se hizo:** dos investigaciones con búsqueda web, cada una en varias líneas en paralelo y con un verificador por
  línea que abrió las fuentes y descartó lo que no estaba respaldado. Primera: 4 líneas, 47 de 48 hallazgos en pie.
  Segunda: 3 líneas, 44 de 45 en pie. Lo marcado «plausible» no se pudo confirmar del todo.
- **Límite:** la síntesis cita fuentes públicas; las cifras de Zara son de 2001-2002 y las reglas de Zalando cambian.
  Las fechas de estación desde el verano 2026-27 vienen del Observatorio Naval de EE. UU., porque SENAMHI aún no las
  publica.

Las secciones «Recomendación», «Preguntas» y «Objeción» de cada investigación son la propuesta que se le llevó a Felipe;
lo que él decidió, y donde se apartó de la propuesta, está en ADR-0246.

## Primera investigación: calendario, clásicos y datos

### Temporadas en el ERP: recomendación para CAYLA

Me basé en la investigación verificada de 4 líneas (26-sep-2026). Lo que solo resultó «plausible» lleva la advertencia al lado. Los hallazgos que no se pudieron respaldar quedaron fuera. Las menciones a Frescura salen de su plan aprobado (ADR-0208), no de la investigación.

#### 1. Qué hacen las mejores empresas

- **Ninguna de las grandes cadenas revisadas dejó PV/OI: lo usan como marco y dentro de él trabajan rápido.** Zara hacía dos colecciones base al año. Dejaba para después de empezada la temporada el 85 % de su producción propia y el 35 % del diseño; en el retail tradicional esa parte era del 0 al 20 %. Son datos de 2001-2002. (Harvard Business School, caso 9-703-497 «ZARA: Fast Fashion», https://didierdiaz.com/wp-content/uploads/2019/10/Zara-fast-fashion-Case-study-HVR.pdf)
- **Hoy Inditex surte a sus tiendas dos veces por semana, siempre con modelos nuevos.** Compromete poco stock al empezar cada temporada y concentra los descuentos en períodos de rebaja concretos. (Inditex, preguntas frecuentes de prensa, https://www.inditex.com/itxcomweb/es/en/press/frequent-questions)
- **Mango hace dos grandes colecciones al año y cápsulas nuevas cada dos semanas.** Son dos niveles: la temporada y, dentro de ella, las entregas. (Mango Fashion Group, «Our model», https://mangofashiongroup.com/en/our-model)
- **Zalando separa lo «de temporada» de lo «básico», y un básico también puede ser de una sola estación.** Lo de temporada lleva un código con año (AW/SS). La alternativa son tres clases de básico: de todo el año (un polo blanco), de PV (un bikini) y de OI (una chompa negra de cuello alto). El modelo que continúa se vuelve a etiquetar con la temporada siguiente, y desde el 1-oct-2026 eso no tiene límite. Lo que queda de la temporada anterior lleva al menos 10 % de descuento y puede seguir publicado un año como máximo. Los básicos de todo el año no se rebajan ni se reetiquetan. (Zalando Partner University, https://partner.zalando.com/university/article/season-timeline-and-season-switch)
- **Los sistemas de gestión para moda guardan la temporada en una lista cerrada, con fechas, y la asignan al modelo.** SAP Fashion Management usa año + temporada, con una opción «no usa temporada». La temporada se asigna al modelo, sus variantes la heredan y se puede cambiar en una variante (https://help.sap.com/saphelp_fms10/helpdata/EN/b7/c12753fef5343ee10000000a423f68/content.htm?no_cache=true). En Oracle Retail cada temporada tiene inicio y fin, y un artículo puede estar en varias (https://docs.oracle.com/en/industries/retail/retail-merchandising-foundation-cloud/22.1.401.0/ritug/item-foundation-data.htm).
- **Repetir un modelo no crea un producto nuevo.**
  - En un software de diseño y desarrollo de moda (PLM), el modelo y el color que se repiten conservan su número y se les suma la temporada nueva (agron, https://agron-inc.helpscoutdocs.com/article/116-carryover-products-colorways-process-n2).
  - El estándar de códigos GS1 trata cada combinación de estilo, color y talla como un producto. Pide código nuevo solo si la clienta notaría el cambio, si una norma lo exige o si cambia la logística (https://ref.gs1.org/standards/gtin-management/).
  - Un integrador de Microsoft Dynamics advierte que meter la temporada dentro del código («DressF20» → «DressF21») obliga a duplicar el producto y trasladar el stock (https://sunrise.co/blog/season-codes-inventory-management/).
- **El reloj de la prenda empieza cuando llega, no cuando se le pone la temporada.** Oracle Markdown Optimization separa un ciclo de venta del siguiente con la fecha de primera recepción, justamente porque los códigos se reutilizan. También registra la fecha en que la prenda aparece por primera vez en tienda y fija una fecha de salida. (https://docs.oracle.com/cd/E12578_01/mdo/pdf/130/mdo-130-cg.pdf)
- **Al clásico se le mide con otra vara.** Según Fisher (Harvard Business Review, 1997), el producto de demanda estable tiene 0 % de rebaja forzada al cierre y 1-2 % de quiebres de stock; el de moda, 10-25 % y 10-40 % (https://hbr.org/1997/03/what-is-the-right-supply-chain-for-your-product). Fast Retailing (Uniqlo) dijo que su aumento de inventario en artículos de todo el año «no es un problema» (https://www.fastretailing.com/eng/ir/library/pdf/20251009_results_en.pdf).

#### 2. Qué aplica a Perú y a CAYLA

**Sí hay invierno, pero distinto en cada sede.** Estas son las normales de SENAMHI; la página no dice de qué período son.
- **Lima:** la máxima baja de 26.5 °C en febrero a 18.4 °C en agosto (8.1 °C de diferencia). Lo más frío es agosto-setiembre, con mínima de 14.6 °C, no junio.
- **Trujillo:** la máxima va de 25.8 °C a 20.2 °C (5.6 °C de diferencia). El frío dura hasta octubre, con mínima de 14.2 °C.
- **Arequipa:** la máxima es casi igual todo el año (22.1-23.2 °C). El frío es de noche (6.9 °C en julio) y llueve de enero a marzo. Las heladas que SENAMHI describe son de la sierra por encima de 3,000 msnm, no de la ciudad.

**Lo que no es confiable es la intensidad del invierno de cada año.**
- En julio de 2023, con Lima en unos 22 °C por El Niño, H&M, Zara, Ripley y Falabella rebajaron hasta 60 % (Forbes Perú).
- Saga Falabella atribuyó en parte su segundo trimestre de 2024 a un invierno más intenso que el de 2023 (Gestión).
- En julio de 2026 el calor seguía «especialmente en el norte», es decir, en la zona de Trujillo (CCL, en El Comercio).
- El BCR estima un 63 % de probabilidad de un Niño muy fuerte entre noviembre y enero. Es una probabilidad, no un hecho.

**El calendario comercial peruano sigue en dos campañas.**
- Gamarra abrió la campaña de otoño en abril de 2026: remató lo de verano y ofreció «prendas ligeras de otoño».
- Su presidenta dijo que el OI es cerca del 50 % de las ventas del emporio. Es plausible: la misma nota atribuye la caída proyectada para 2026 al clima y a las elecciones juntas, y es una proyección, no una cifra medida.
- Hay campañas que no son temporadas: el Día de la Madre en mayo (la segunda del año, después de Navidad) y las gratificaciones de la primera quincena de julio y de diciembre (Ley 27735). **La campaña explica un pico de ventas; la temporada dice con qué se compara una prenda. Son dos cosas distintas.**

**El mercado pide flexibilidad, pero dentro del marco PV/OI.**
- La directora de CEAM dijo en El Comercio (14-jul-2026) que el calendario predecible de invierno y verano «está perdiendo vigencia».
- En Gestión recomendó colecciones más pequeñas y flexibles. Es una recomendación a futuro, no algo que las marcas peruanas ya hagan (plausible).
- Renner (Brasil) reconoció que en 2023 recortar la media estación le costó más descuentos y un punto de margen (plausible). Su caída de utilidad del 75.6 % vino sobre todo de su negocio financiero, así que no sirve como medida del costo de esa decisión.

**Taller propio y tres tiendas.**
- Zara hacía lo riesgoso en lotes chicos y cerca de casa, y lo volvía a pedir si vendía. Reponer algo existente le tomaba 2 semanas; un diseño nuevo, 4-5 (datos de 2001).
- El Taller de Lima cumple ese papel a escala CAYLA. En Gamarra, en cambio, la tela se fabrica 6-9 meses antes y la prenda 3-4 meses antes (Gestión). Que el Taller sea más rápido que eso es dato tuyo, no de la investigación.
- Frescura ya compara cada sede solo contra sí misma. Eso absorbe la diferencia de clima entre Lima, Trujillo y Arequipa sin tener que marcar la temporada por sede.

#### 3. Recomendación

En resumen:
- Dos temporadas de moda al año, cada una con año y fechas, más tres valores para los clásicos.
- Todo en una sola lista cerrada y obligatoria, puesta en el producto.
- La temporada dice con qué se compara la prenda; el reloj lo pone su llegada a cada sede.

**3.1 Cuántas temporadas**
- **DECIDÍ:** dos temporadas de moda al año, PV y OI, como marco. Lo que pase dentro de ellas (entregas, cápsulas, repeticiones del Taller) no lleva código propio, porque la fecha real de llegada a cada sede ya lo registra.
- **DESCARTÉ:**
  - *Sin temporadas, solo un flujo continuo:* en abril, una blusa de verano que se quedó se compararía con las primeras chompas, y no habría fecha de cierre para ordenar la rebaja. Ninguna de las cadenas revisadas trabaja así.
  - *Cuatro estaciones:* duplica la lista y parte en cuatro una muestra que hoy casi no existe (Frescura arranca sin historia).
  - *Un código de entrega o cápsula:* es un campo más que alguien olvidará llenar.
- **SE ROMPE SI:** CAYLA empieza a sacar en abril-mayo una colección de transición con ritmo propio, las «prendas ligeras de otoño» de Gamarra. Marcada como OI, su venta rápida o lenta desordenaría la referencia del OI. En ese caso se agrega un tercer valor (ver pregunta 1).

**3.2 Los valores exactos de la lista**

Se elige de un desplegable al dar de alta un producto. No se admite dejarla vacía ni escribir texto libre.

| Valor | Qué es | Fechas (propuesta, ver pregunta 2) |
|---|---|---|
| OI-2026 | Moda otoño-invierno, la que cierra ahora | 1-abr-2026 a 30-set-2026 |
| PV-2027 | Moda primavera-verano, la que empieza la próxima semana | 1-oct-2026 a 31-mar-2027 |
| OI-2027 | Moda otoño-invierno | 1-abr-2027 a 30-set-2027 |
| PV-2028… | Una nueva cada seis meses, la crea el líder | — |
| Clásico · todo el año | Ej. el polo cuello camisero | Sin fin |
| Clásico · verano | Un clásico que solo se vende con calor | Sin fin |
| Clásico · invierno | Ej. una chompa negra de cuello alto | Sin fin |

El año de cada PV es el del enero-marzo que contiene. Así la lista queda en orden: OI-2026 → PV-2027 → OI-2027.

- **DECIDÍ:** una sola lista que junta la moda (con año y fechas) y los clásicos (sin año). Esto reemplaza el campo aparte «moda/clásico» que el plan de Frescura preveía para su bloque 4, que todavía no está construido.
- **DESCARTÉ:**
  - *El texto libre de hoy:* «PV 26», «pv2026» y «Verano» contarían como tres temporadas distintas. Hoy está vacío en todos los productos, así que cambiarlo cuesta cero; en seis meses habría que limpiarlo a mano.
  - *Dos campos separados (moda/clásico + temporada):* permiten combinaciones sin sentido, como un clásico con fecha de cierre o una prenda de moda sin temporada, y habría que vigilarlas. Con una sola lista esas combinaciones no se pueden escribir.
  - *PV/OI sin año:* no distingue lo que sobró del verano pasado de lo de este, ni da fecha de cierre para la rebaja. Zalando y SAP usan el año.
- **SE ROMPE SI:** una prenda de moda se vende parejo todo el año sin ser clásica, por ejemplo una blusa versátil que la clienta compra en cualquier mes. La lista la obliga a ser PV u OI, y al cerrar la temporada aparecerá como «temporada anterior» aunque siga vendiendo bien. La salida es que el líder la pase a clásico o la repita en la temporada siguiente. Si esto pasa con muchos modelos, faltará un valor «moda todo el año».

**3.3 Dónde va: en el producto, en la llegada o en ambos**
- **DECIDÍ:**
  - La temporada va en el producto (el modelo), y la heredan todos sus colores y tallas, como en SAP.
  - El producto guarda las temporadas por las que pasó (PV-2027, PV-2028); la más reciente es la que usa Frescura.
  - La llegada no lleva temporada propia. La orden del Taller es el momento en que se pregunta «¿para qué temporada es esta tanda?», y la respuesta se guarda en el producto, no aparte.
- **DESCARTÉ:**
  - *Solo en la llegada (el lote):* parte del stock ya cargado entró sin recepción y se quedaría sin temporada. Además, el ERP sabe cuánto entró de cada lote, pero no de qué lote es la prenda que está colgada, así que la temporada del lote no se puede aplicar al piso.
  - *En ambos lugares como dos datos independientes:* el día que no coincidan, cada pantalla le creería a uno distinto.
  - *Temporada por sede:* la misma prenda tendría tres etiquetas, y Frescura ya compara cada sede contra sí misma. Zara sí tiene colecciones propias para el hemisferio sur, pero eso es otro mercado, no otra tienda.
- **SE ROMPE SI:** a un modelo de verano se le agrega un color pensado para invierno. Ese color heredaría PV. Si además cambia la tela, GS1 diría que es otro producto. Si pasa seguido sin cambio de tela, habrá que permitir la temporada por color, como SAP permite cambiarla por variante.

**3.4 El modelo que el Taller vuelve a producir**
- **DECIDÍ:**
  - Es el mismo producto, con el mismo código de etiqueta, y se le suma la temporada nueva.
  - Si cambia algo que la clienta notaría (tela, corte), es un producto nuevo.
  - Un color nuevo ya es un modelo+color nuevo, y Frescura lo trata como Nuevo automáticamente.
  - Si un modelo de moda se repite temporada tras temporada y sigue vendiendo, el líder puede pasarlo a clásico. Este es un criterio nuestro, no una práctica documentada: Zalando obligaba a convertir en básico lo que se había reetiquetado dos veces, y eliminó esa regla el 1-oct-2026.
- **DESCARTÉ:**
  - *Un código nuevo por temporada («DressF20 → DressF21»):* parte en dos la historia de ventas del modelo, y Frescura lo vería como novedad aunque la clienta ya lo vio colgado.
  - *Cambiarle la temporada sin guardar la anterior:* se pierde en qué temporada nació, que es justo lo que dice qué repeticiones funcionaron.
- **SE ROMPE SI:** el Taller repite un modelo «casi igual» (mismo nombre, otra tela) y se registra como el mismo producto. Frescura mezclaría dos prendas que la clienta ve distintas. La orden del Taller tiene que preguntar «¿cambió algo que la clienta notaría?».

#### 4. Cómo lo usaría Frescura del piso

- **Con qué se compara cada prenda:** la moda se compara dentro de su categoría, en su sede y en su misma temporada. Por ejemplo, una blusa PV-2027 de Trujillo contra las blusas PV-2027 de Trujillo. Si faltan datos, se juntan las tres sedes, como ya dice el plan de Frescura, pero nunca se mezcla PV con OI. La temporada no pone en marcha ningún reloj: el reloj de novedad sigue empezando el primer día que la prenda está en el piso de esa sede.
- **Un invierno cálido no hace culpable a un modelo:** si el calor frena todo el abrigo de una sede, los frena a todos por igual. El semáforo sigue señalando al modelo que vende peor que los demás de su grupo. Para ver si toda la temporada va lenta hay que comparar OI-2027 con OI-2026 a la misma semana. Es una propuesta: hoy no hay historia para hacerlo.
- **Los clásicos quedan fuera del semáforo de novedad:**
  - Se comparan con su propia historia y se vigila que no falten sus tallas clave. En Zara, si se agotaba una talla clave, se retiraba toda la referencia.
  - Para un clásico, la alerta natural es tener más stock del necesario, no llevar muchos días colgado. Esto es una inferencia que las fuentes sostienen solo de forma indirecta.
  - Un «Clásico · invierno» en febrero no enciende alarma: se sugiere guardarlo. Ese retiro necesita el motivo «fin de temporada», que el plan de Frescura dejó pendiente.
- **Rebaja de fin de temporada:**
  - Con la fecha de cierre, Frescura puede decir «a este modelo le quedan 6 semanas de temporada y tiene stock para 14», y marcarlo para revisión, sin rebajarlo. Así lo plantea Umbrex, un manual de consultoría (plausible).
  - El orden de pasos del plan no cambia: diagnosticar, cambiarlo de lugar, trasladarlo a una sede donde nunca estuvo y, recién después, una rebaja chica por sede que aprueba el líder. Coincide con Zara: primero mover la prenda y dejar la rebaja para el cierre.
  - Los clásicos no entran en la rebaja de fin de temporada: Fisher da 0 % de rebaja forzada en lo de demanda estable, y Zalando no rebaja sus básicos de todo el año.
  - La regla de Zalando para lo que queda de la temporada anterior (al menos 10 % y un año como máximo) es política de un marketplace. En CAYLA eso lo decide el líder.
- **Cómo sabremos que funciona:** sigue siendo el % de venta a precio completo por sede. Como referencia antigua, Zara vendía un estimado de 15-20 % con rebaja, frente a 30-40 % de otras cadenas europeas (datos de 2001).

#### 5. Preguntas que solo tú puedes responder

1. **¿Cuántas colecciones de moda al año?**
   a) Dos, PV y OI. Recomendada: es lo que hacen Zara y Mango y cómo sigue organizándose Gamarra, y lo rápido pasa dentro de ellas.
   b) Tres: PV, una de transición en abril-mayo y OI. Serían las «prendas ligeras de otoño» de Gamarra; Renner perdió margen al recortar su media estación (dato plausible).
   c) Cuatro, una por estación.
2. **¿Cuándo empieza y termina cada una?**
   a) PV del 1-oct al 31-mar y OI del 1-abr al 30-set. Recomendada: Gamarra abre el OI en abril, y en Lima lo más frío es agosto-setiembre.
   b) Correrlas un mes: PV de noviembre a abril y OI de mayo a octubre, porque Trujillo sigue frío en octubre.
   c) Fechas distintas por sede. Oracle solo lo permite por grupo de tiendas, no tienda por tienda.
3. **Cuando el Taller repite un modelo igual (mismo color) en la temporada siguiente, ¿la clienta que vuelve cada 1-2 semanas lo vive como novedad?**
   a) No: nunca vuelve a ser «Nueva» en esa sede. Es lo que dice hoy el plan de Frescura.
   b) Sí, si estuvo fuera del piso de esa sede una temporada entera. Oracle abre un ciclo nuevo con cada primera recepción.
4. **¿Quién pasa un modelo de moda a clásico, y cuándo?**
   a) El líder, a mano, cuando lo decida. Es lo que ya dice el plan de Frescura.
   b) El sistema lo propone cuando el modelo se repitió en 2 o más temporadas y siguió vendiendo, y el líder confirma.
   c) Nunca: un clásico nace clásico.

Si no respondes, asumo la opción (a) en las cuatro.

#### 6. Lo que la investigación NO pudo confirmar

- **Códigos internos de las cadenas:** no hay información pública sobre los códigos de temporada que usan Zara, H&M o Mango.
- **Zara en Perú:** está confirmado que tiene colección propia para Argentina; que Perú la reciba, no.
- **Fechas de las temporadas peruanas:** que el PV peruano vaya de octubre a marzo es una propuesta, no un dato verificado.
- **Mejores meses para el abrigo:** que en Lima el abrigo se venda mejor en agosto-setiembre es una hipótesis sacada de la temperatura. Hay que comprobarla con las ventas de CAYLA.
- **Normales de SENAMHI:** la página no indica el período de referencia.
- **Cápsulas en Perú:** que las marcas peruanas ya trabajen con cápsulas no está demostrado; la fuente habla en futuro («deberán»).
- **Temporada de transición:** que haga falta un valor de transición es inferencia del investigador. La caída de utilidad de Renner no mide el costo de recortar la media estación.
- **Gamarra 2026:** la caída de hasta 50 % es una proyección de abril que mezcla clima y política.
- **Pasar a clásico lo que se repite:** ninguna fuente lo documenta como práctica; es criterio nuestro.
- **Medir al clásico por stock y no por días:** las fuentes lo sostienen solo de forma indirecta.
- **Reiniciar la medición de un clásico con cada reposición:** ninguna fuente lo respalda.
- **SAP en órdenes y lotes:** que SAP guarde la temporada en órdenes y lotes salió solo de fragmentos de búsqueda.
- **Traslados:** si un traslado entre sedes debe reiniciar el reloj, las fuentes no lo dicen. El plan de Frescura ya lo decidió: en la sede nueva, la prenda cuenta como Nueva.
- **Velocidad del Taller:** que el Taller repita más rápido que los 3-4 meses de Gamarra no está verificado.
- **Antigüedad de los datos:** las cifras de Zara son de hace unos 25 años, y las reglas de Zalando cambian con el tiempo.

---

**Objeción.** «En la costa prácticamente no hay invierno» no calza con SENAMHI para Lima: la máxima baja 8 °C entre febrero y agosto. Lo que no es confiable es cuán frío viene cada invierno, no que exista. Por eso la pregunta útil no es si seguir más o menos las estaciones, sino cuánto comprometer antes de que empiecen. Las grandes responden lo mismo: comprometer poco al inicio y producir dentro de la temporada (Zara, Inditex, y H&M, que está subiendo poco a poco sus compras dentro de la temporada). Eso es justo lo que el Taller propio te permite. Además, la recomendación 3.2 cambia una pieza del plan de Frescura (el campo aparte «moda/clásico»), así que necesita tu visto bueno antes del bloque 4.

**Lo que no pediste.** Hoy ningún producto tiene temporada, pero la tienda ya tiene productos cargados. Antes del bloque 4 de Frescura, el líder tiene que marcar todos los productos existentes, y el alta de producto debe exigir la temporada. Si no, Frescura mezclará verano con invierno sin avisar.

## Segunda investigación: marcas de lujo, nombres en el hemisferio sur y fechas de SENAMHI

### Temporadas de CAYLA: cómo nombrarlas y qué fechas usar

#### 1. Cómo lo hacen las marcas que admira

- **Calendario general.** Las marcas hacen de 2 a 4 colecciones al año. Las dos principales son Primavera-Verano (SS) y Otoño-Invierno (AW/FW), y se suman Cruise/Resort y Pre-Fall. El desfile va unos 6 meses antes que la tienda: SS se desfila en setiembre-octubre y llega a tienda de enero a marzo. Fuente: FashionUnited, 2024. https://fashionunited.com/news/background/the-fashion-system-the-fashion-seasons-explained/2024012257967
- **Chanel.** Pone a cada colección un código de año más una letra, y lo usa en las direcciones de su web: 26C = «Cruise 2025/26», 25K = «Fall-Winter 2025/26», además de 26S, 26A, 26B y 26K. La lista completa de seis letras, incluida la P, solo aparece en un blog (PurseBop). Es *plausible* que no siempre nombre igual: su web dice «Cruise 2026/27» y la prensa llama «Cruise 2027» a la misma colección. https://www.chanel.com/us/fashion/p/26C-PODIUM-009/look-9/
- **Louis Vuitton.** A la Cruise le pone el año en que se vende: «Cruise 2026» se desfiló en mayo de 2025. Al Otoño-Invierno le pone el año en que empieza: «Women's Fall-Winter 2025». Sus clásicos forman una línea con nombre, «LV Icons»: diez modelos de bolso en varios colores y materiales. https://us.louisvuitton.com/eng-us/women/handbags/lv-icons/_/N-td4mq4v
- **Dior.** Usa los dos años para el Otoño-Invierno: «Autumn-Winter 2025-2026». La Cruise lleva el año siguiente: «Cruise 2027» se presentó en mayo de 2026 en Los Ángeles. https://www.dior.com/en_us/fashion/womens-fashion/ready-to-wear-shows/autumn-winter-2025-2026-ready-to-wear-show
- **Hermès.** En marroquinería agrega modelos nuevos al catálogo en vez de renovarlo cada temporada. La ropa sí va por temporada (spring-summer 2026, fall-winter 2026). El año tiene además un tema propio, «Venture beyond», y los ingresos se reportan por sector y región. https://assets-finance.hermes.com/s3fs-public/node/pdf_file/2026-02/1770842738/hermes_20260212_pr_2025fullyearresults_va.pdf
- **Ralph Lauren.** Su «iconic core» (polos, camisas Oxford, suéteres de cachemira, blazers) es cerca del 70 % del negocio: son modelos que siguen vendiéndose después de su primera temporada. Lauren Home mantiene sus básicos y los renueva cada cierto tiempo con colores de tendencia. https://www.marketbeat.com/earnings/transcripts/100901
- **H&M.** Presentó su otoño-invierno 2025 en Londres en setiembre de 2025, cuando la mayor parte ya estaba a la venta. Compra una parte mayor del producto dentro de la misma temporada, igual que CAYLA. https://hmgroup.com/wp-content/uploads/2026/01/H-M-Hennes-Mauritz-AB-Full-year-report-2025.pdf
- **Inditex/Zara (plausible).** Habla de «campaña primavera/verano» y «campaña de otoño/invierno», en español. Que esas campañas sean exactamente sus semestres fiscales es una deducción del investigador, no algo que Inditex diga. En 2011 hacía colecciones propias para el hemisferio sur (Financial Times). https://www.inditex.com/itxcomweb/es/es/prensa/detalle-noticias/a2c9b82b-1e27-4582-a7c9-746bc88b744e/primer-semestre-de-2026

#### 2. Cómo se nombra en el hemisferio sur y en Latinoamérica

La pregunta es qué año lleva la primavera-verano de setiembre 2026 a marzo 2027. Hay tres respuestas en uso:

- **El año en que termina (2027).** Es la forma más común:
  - Australian Fashion Week la llama «Resort 27» (mayo 2026).
  - Country Road usó «Spring/Summer 2026» para lo que tenía en tienda desde agosto de 2025.
  - Farm Rio usa «Verão 2027», pero esto lo dice la prensa y no se revisó en su web.
  - Kosiuko y Perramus la llaman «Primavera Verano 2027» (Argentina, 2026).
- **En el Perú también se usa el año en que termina.** El Comercio (04/12/2025) presentó a Marquis/Ripley «de cara a la temporada primavera-verano 2026», que es diciembre 2025 a marzo 2026. Boutique Moda Perú llamó «Primavera/Verano 2025» a su desfile del 21/09/2024. SENAMHI llamó «Verano 2025» al que empezó en diciembre de 2024.
- **El año en que empieza (2026).** Renner: «Primavera Verão 2026» (julio-agosto 2026).
- **Los dos años.**
  - Boutique Moda Perú, 14.ª edición: «Primavera Verano 2025/26».
  - Osklen: «Primavera/Verão 26/27».
  - Buenos Aires Fashion Week 2026 (en el cuerpo de la nota de Ámbito): «2026/2027».
  - SENAMHI: «Verano 2025-2026». En un mismo informe de 2026 escribe «verano 2026-2027» y «verano 2027».
- **Nadie es constante.** Perramus pasó de «25/26» a «2027», y Renner de «25/26» a «2026». En la misma semana de 2021, El Comercio escribió «2022» y «2021-2022» para el mismo desfile (*plausible*).
- **La trampa del hemisferio norte (plausible).** Las marcas peruanas que desfilan en Milán o Nueva York usan la numeración de allá: Sergio Dávila en Milán (junio 2026) y Marsol Atelier en Nueva York (setiembre 2026) presentaron «primavera-verano 2027». Ahí «PV 2027» es enero a junio de 2027, que en el Perú es otoño-invierno.
  - Siglas: en Argentina aparecen «SS26» y «#PV26». La prensa peruana escribe el nombre completo.

#### 3. Fechas oficiales de SENAMHI (hora de Perú)

SENAMHI toma como inicio de cada estación el instante astronómico. Sus horas coinciden al minuto con las del Observatorio Naval de EE. UU. (USNO). Desde el verano 2026-27, SENAMHI todavía no publica sus fechas: las de la tabla vienen del USNO.

| Estación | 2026 | 2027 | 2028 |
|---|---|---|---|
| Otoño | 20 mar, 09:46 (SENAMHI) | 20 mar, 15:25 | **19 mar**, 21:17 |
| Invierno | 21 jun, 03:24 (SENAMHI/CONIDA) | 21 jun, 09:11 | 20 jun, 15:02 |
| Primavera | 22 set, 19:05 (SENAMHI) | **23 set**, 01:02 | 22 set, 06:45 |
| Verano | 21 dic, 15:50 | 21 dic, 21:42 | 21 dic, 03:19 |

Así quedarían las temporadas de CAYLA con su regla (PV va de primavera a otoño; OI de otoño a primavera):

| Temporada | Inicio | Fin |
|---|---|---|
| OI 2026 | 20 mar 2026, 09:46 | 22 set 2026, 19:05 |
| PV 2026-27 (en curso) | 22 set 2026, 19:05 | 20 mar 2027, 15:25 |
| OI 2027 | 20 mar 2027, 15:25 | 23 set 2027, 01:02 |
| PV 2027-28 | 23 set 2027, 01:02 | 19 mar 2028, 21:17 |
| OI 2028 | 19 mar 2028, 21:17 | 22 set 2028, 06:45 |
| PV 2028-29 | 22 set 2028, 06:45 | otoño 2029 (no se consultó) |

- **Hay que guardar las fechas, no calcularlas.** El día cambia de un año a otro (23 set 2027, 19 mar 2028), así que una regla fija se equivoca.
- **Cada temporada termina justo cuando empieza la siguiente.** No quedan huecos ni días que caigan en dos temporadas.
- **Las fechas se toman de SENAMHI o del USNO, no de la prensa.** Líbero publicó 04:01 para el otoño 2026, que era la hora de 2025.

#### 4. Nombre recomendado

DECIDÍ:
- Primavera-Verano: nombre largo «Primavera-Verano 2026-27», sigla «PV26-27».
- Otoño-Invierno: nombre largo «Otoño-Invierno 2027», sigla «OI27». En el sur el OI no cruza de año, así que basta un año.
- Clásicos: un valor más de la lista, «Clásicos», sin año.

Solo la PV lleva dos años, porque es la única que cruza de un año al siguiente. La forma con dos años es la única que no se puede leer de dos maneras, y es la que usan hoy Boutique Moda Perú, Dior y SENAMHI («2025-2026»).

DESCARTÉ:
- **«PV27», el año en que termina.** Es el uso más común en el sur y es más corta. El problema: en Milán y Nueva York «PV 2027» es enero a junio de 2027, y Renner llama «2026» a esta misma temporada. Alguien del equipo de una sede que lea «PV27» en octubre de 2026 puede creer que es la del año que viene.
- **«PV26», el año en que empieza.** Para El Comercio y Marquis/Ripley, «PV 2026» fue diciembre 2025 a marzo 2026, es decir, la temporada anterior.
- **«SS26-27», en inglés.** En el norte «SS» significa enero a junio, y el referente en español (Inditex) dice «primavera/verano».

SE ROMPE SI: alguien arma un reporte o un código leyendo el texto «PV26-27» en vez de usar el registro de la temporada y sus fechas. Pasaría el día que se corrija el nombre, como hizo Chanel al pasar de «2025/26» a un solo año: ese reporte partiría la temporada en dos. El nombre es solo lo que se muestra en pantalla; lo que manda es el registro con sus fechas de inicio y fin.

#### 5. Dónde se registra la temporada y cómo se tratan los clásicos

- **En el código.** Chanel pone la colección en el código (26C, 25K). Su Classic 11.12 conserva el mismo código de modelo (A01112) en todas sus versiones y solo cambian los sufijos de material y color. Que cada sufijo corresponda a una temporada es plausible, pero no se pudo confirmar.
- **En H&M.** Un conjunto de datos público de H&M separa el código de producto del código de artículo y no trae temporada. Ahí la temporada es un dato del catálogo, no parte del código.
- **En la pieza física y en la contabilidad.** En la prenda se marca la fecha de fabricación, no la temporada: Hermès graba una letra por año y Louis Vuitton usa un chip desde 2021 (fuentes secundarias). LVMH y Hermès reportan por sector, región y trimestre, no por temporada.
- **Los clásicos** tienen nombre propio y se venden durante años: The Emblematics (Chanel), LV Icons (Louis Vuitton), iconic core (Ralph Lauren). Algunas marcas los renuevan con colores de temporada.

#### 6. Preguntas para decidir

1. **¿Cómo escribimos la PV que cruza el año?**
   - A) «PV26-27» (recomendada).
   - B) «PV27».
   - C) «PV26».
2. **¿Qué fechas lleva cada temporada?**
   - A) Las de SENAMHI tal cual, fijas.
   - B) Las de SENAMHI como punto de partida, que se pueden corregir en cada temporada (recomendada).
   - C) Un calendario comercial propio de CAYLA, con SENAMHI solo como referencia.
3. **¿A qué se le pone temporada?**
   - A) Solo al producto.
   - B) Al producto, y se puede cambiar en un color que salga en otra temporada (recomendada).
   - C) Siempre a cada color o variante: es más preciso, pero agrega un paso en cada alta.
4. **¿Cómo marcamos lo clásico?**
   - A) Como un valor más de la lista, «Clásicos» (recomendada: es simple y se puede filtrar en los reportes).
   - B) Con una casilla «es clásico» aparte, y el producto conserva la temporada en que salió. Así se sabe que salió en PV26-27 y que sigue vigente, a cambio de un campo más en el alta.

#### 7. Lo que no se pudo confirmar

- Las fechas desde el verano 2026-27 son del USNO. SENAMHI todavía no las publica y podría dar 1 minuto de diferencia.
- No existe un documento de SENAMHI que defina qué es una «estación». Que use el instante astronómico se deduce de sus anuncios.
- No se sabe cómo nombran la PV por dentro Saga Falabella, Ripley, Topitop o Basement. De la moda peruana solo hay datos de Boutique Moda Perú y de la prensa.
- **Chanel:** no se pudo abrir ninguna ficha (la web respondió con error 403), así que no se sabe a qué colección pertenece cada versión del 11.12. La lista de seis letras solo aparece en un blog.
- **Inditex:** que su campaña sea exactamente el semestre fiscal es una deducción. El dato de Zara en el hemisferio sur es de 2011.
- **Otras marcas:** el «Verão 2027» de Farm Rio no se vio en su web. El «SS.27» de Ayres se descartó. El día exacto del avance de Renner no se confirmó.
- **Gamarra:** el calendario de su campaña de invierno es de 2024.

---

**Objeción:** la fecha oficial sirve para el nombre y como referencia, pero no para decir cuándo se vende cada temporada. En 2024, Gamarra empezó su campaña de invierno con los mayoristas a fines de mayo, casi un mes antes del invierno. Además, SENAMHI dijo que por El Niño Costero el otoño y el invierno de 2026 «prácticamente no se percibirán». Si PV y OI quedan clavados a SENAMHI, lo que llegue a las sedes a fines de mayo figurará como otoño aunque se venda como invierno. Por eso la pregunta 2 recomienda poder corregir las fechas en cada temporada.

**Lo que no pidió:** decidir si la temporada va en el producto o en cada color (pregunta 3). Si va solo en el producto, un clásico que salga en un color de PV26-27 queda registrado como clásico, o hay que duplicar el producto. En los dos casos los reportes ya no pueden medir qué parte de la venta viene de los clásicos, que es justo lo que Ralph Lauren mide con su 70 %.
