# 02 · Glosario de campo

**Frente 2 · 2026-10-16.** Una fila por palabra. Sirve de insumo para el vocabulario de pantalla de Producción. No decide palabras: dice qué significa cada una en el oficio, qué dice el ERP hoy y dónde hay riesgo de confusión.

## Cómo leer las columnas (y qué NO sabemos)

- **«Oficio en Perú»** reemplaza, por ahora, a «cómo lo dice el Taller». **Nadie ha escuchado al Taller de CAYLA** (Frente 0): las palabras salen de tesis, normas y fichas peruanas (B o C, con su fuente). Cada fila de esta columna hay que confirmarla con la encargada: pedirle que diga, con sus palabras, qué hace cada paso.
- **«ERP hoy»** sale de `ADR-0400`, `CLAUDE.md` y `docs/formidable/produccion-modulo.md` (rama del rediseño). «Prohibida» es una palabra que `lib/produccion-vocabulario.test.ts` ya veta.
- **«Colaboradora de tienda»** sale de **dos pruebas ciegas hechas por agentes de IA sin contexto** (13 y 14-oct), no de colaboradoras reales: el propio informe dice que «real: sin probar» y que ese tipo de agente sobre-reporta jerga como «IGV» o «lote». Leer «Observado» como señal, no como medida. Donde no hay prueba, va «sin dato» y, si hay una sospecha mía, se marca **E** (inferencia).
- **«¿Confunde?»:** **Sí (observado)** = lo marcó una prueba ciega; **Probable (E)** = lo digo yo, sin prueba; **Sí (en el repo)** = dos documentos del repo lo usan distinto; **No sabemos**.
- Vocabulario del repo: en pantalla, «colaborador/integrante», «líder de equipo», «sede»; nunca «empleado», «jefe» ni «sucursal». Aquí aparecen «jefe de taller» u «operario» solo porque son palabras de las fuentes.

## 1 · La orden y su papel

| Término | Oficio en Perú (fuente) | ERP hoy | Colaboradora de tienda | ¿Confunde? | Nota |
|---|---|---|---|---|---|
| **Orden · pedido · lote · corrida** | «Orden de producción», «orden de corte», «orden de habilitado» (planta, PUCP 2014, B); «pedido» y «programación» (taller de La Victoria 2022, B); «lote» o «bulto» = tanda que pasa junta (Bonilla 2007, B) | «Orden» (OP-000012) y «lote» (frente a «muestra»). «Corrida» es **palabra prohibida** | La ciega 1 dudó si «orden» era «pedido»; no entendió «corrida» ni «Lote vs Muestra» (observado) | **Sí (observado)** | En el oficio «pedido» es lo que encarga un cliente a un taller; en CAYLA la orden la abre CAYLA a su propio Taller |
| **Muestra · prenda piloto · prototipo** | Un taller de La Victoria pide «una muestra» al cliente para estimar el tiempo de producción (B); una ficha comercial cobra muestras de S/ 20 a 80 (C) | «Muestra» (`es_muestra`), con la pestaña «Muestras» | No entendió «Lote vs Muestra» (observado) | **Sí (observado)** | Tres sentidos: la prenda de desarrollo de CAYLA, la prenda de prueba que pide un taller para medir tiempos y la muestra de bordado o estampado que pide un servicio |
| **Modelo · estilo · producto** | «Estilo» en las hojas de precios de talleres (Arequipa 2021, B); «tipo de prenda» en las cotizaciones por WhatsApp (B) | «Modelo» | Sin dato; probable que «modelo» se entienda (E) | No sabemos | Un taller cotiza por «estilo», no por «modelo»: pide foto o muestra |
| **Ficha técnica** | Documento que guía el ensamble, junto al «diagrama de operaciones» (MINEDU, B) | No existe; el consumo se escribe en el modelo | Sin dato | No sabemos | Qué papel recibe hoy el servicio es una pregunta abierta |
| **Cuaderno · hoja de ruta · pizarra** | «Cuaderno» con fecha de entrega, total de prendas y cliente (La Victoria 2022, B); «hoja de ruta» y «guía de ingreso de productos terminados» (Bonilla 2007, B); «pizarra» para avance y calidad (Industrial Data 2017, B) | La orden con sus avances | Sin dato | No sabemos | Es lo que el ERP reemplaza o debe convivir con él |

## 2 · Corte y lo que le rodea

| Término | Oficio en Perú (fuente) | ERP hoy | Colaboradora de tienda | ¿Confunde? | Nota |
|---|---|---|---|---|---|
| **Molde · patrón · patronaje · escalado** | «Moldes», «patronaje» (PUCP 2014; Camborda 2023, B) | No aparece (queda fuera de la orden) | Sin dato | No sabemos | El patronaje es trabajo del modelo, no de la orden |
| **Tizado · trazo · marcada · tizada** | «Tizado» (PUCP, Camborda 2023, B); «tizada» y «marcada» (R-26 de CAYLA, D) | «Trazo» dentro de Corte (d.2) | Sin dato | **Probable (E)**: tres nombres para lo mismo | En planta lo trae Planeamiento antes de cortar (H-2.2) |
| **Tendido · extendido** | «Tendido»; «extender telas» como tarea de los ayudantes (PUCP, La Victoria 2022, B); «extendido y corte» (Arequipa 2021, B) | «Tendido» dentro de Corte | Sin dato | No sabemos | |
| **Bloqueo** | Primer corte grueso de los paños tendidos, antes del corte final (PUCP 2014, B) | No aparece | Sin dato | No sabemos | Solo en planta |
| **Corte (fase) · «los cortes» (piezas)** | «Corte» es el área y la operación; «los cortes» son las piezas ya cortadas: «la recepción de las prendas es en cortes», «los clientes entregan sus cortes», «separar los cortes por talla» (La Victoria 2022, B) | «Corte» es la fase; «Salida de Corte» | Sin dato | **Probable (E)** | «Salida de Corte» puede leerse como «sale la fase» o «salen los cortes (piezas)» |
| **Fusionado · entretela · pelón** | «Fusionado» = unir con calor una pieza y su «entretela (o pelón)», como en bolsillos, cuellos y pecheras (PUCP 2014, B) | No aparece | Sin dato | No sabemos | Es un avío (entretela) y una operación a la vez |
| **Habilitado · habilitador** | «Habilitado» = numerar las piezas cortadas y armar paquetes para costura (PUCP 2014, B); «habilitadores» = puesto que también recibe tela e hilo, ordena y transporta cortes y dobla prendas (La Victoria 2022, B); «habilitar talla por talla» antes de entregar (B) | Dentro de Corte (d.2) | Sin dato | **Probable (E)** | La misma palabra nombra un paso al empezar y otro al terminar (H-2.3) |
| **Bulto · paquete · atado** | «Bulto de piezas cortadas» (PUCP 2014, B); «bulto progresivo» (Bonilla 2007, B); paquetes de unas 40 prendas (Bonilla, B) | No existe (granularidad A: sin bulto) | Sin dato | No sabemos | El «95 % trabaja por bultos» de ADR-0400 es una frase de 2007 sin fuente propia |
| **Numerado · ticket** | «Numerado» de piezas en la mesa de habilitado; «enumeradora» (máquina) (PUCP 2014, B) | No aparece | Sin dato | No sabemos | |

## 3 · Costura

| Término | Oficio en Perú (fuente) | ERP hoy | Colaboradora de tienda | ¿Confunde? | Nota |
|---|---|---|---|---|---|
| **Costura · confección · armado · ensamble** | «Servicio completo de confección» (La Victoria 2022, B); «solo armado» (cotizaciones por WhatsApp 2021, B); «ensamble» (MINEDU, Texgroup 2018, B); «costura» (SUNAT lo usa como ejemplo en «servicio de costura», B) | «Costura» (antes «Confección») | Sin dato; la ciega 1 escribió «la costura va afuera» y buscó dónde decirlo (observado) | Bajo | Para el comprobante, SUNAT acepta «servicio de costura» como descripción |
| **Remalle · recta · recubierta · basteo (bateo) · basta** | Nombres de máquina que son también nombre de puesto: «remallador», «rectero», «basteador» (La Victoria 2022, B) | No aparecen | Sin dato | No sabemos | Las hojas de precios de talleres usan los nombres de máquina como columna |
| **Preparado · ensamble** | La costura se divide en «preparado» (cuellos, puños, delanteros) y «ensamble» (Texgroup 2018, B); «preparado de cuello» como renglón de precio (Arequipa 2021, B) | No distingue | Sin dato | No sabemos | Subpasos dentro de Costura; solo importan si se cotizan por separado |
| **Despunte · rebabeo · limpieza de hilos** | «Despunte» como operación con precio (Arequipa 2021, B); «eliminar hilos sobrantes» (MINEDU, B); «soplado» (Texgroup, B) | Dentro de Acabado | Sin dato | No sabemos | |

## 4 · Acabado y lo que se manda a servicio

| Término | Oficio en Perú (fuente) | ERP hoy | Colaboradora de tienda | ¿Confunde? | Nota |
|---|---|---|---|---|---|
| **Acabado(s)** | **Uso 1:** hilos, clasificar, desmanchar, planchar, hang tags y etiquetas, doblar y embolsar (MINEDU, PUCP, Texgroup, B). **Uso 2:** lavandería, bordados, transfer, estampados y acabados finales (APTT 2025, C) | «Acabado» = uso 1 (ADR-0400 d.2); en `15-COMO-OPERA` R-29, «acabados» = uso 2 (bordado, estampado, lavandería) | Sin dato | **Sí (en el repo)** | Hay que fijar cuál se queda. Si dice «Acabado» en una fila y «Bordado» en otra, se está usando el uso 1 |
| **Planchado · vaporizado** | MINEDU, PUCP, Texgroup (B) | Dentro de Acabado | Sin dato | No | |
| **Etiqueta · hang tag** | «Etiquetas» (de marca, de lavado, de talla) y «hang tags» (MINEDU, B); «preparado de etiqueta de lavado» como renglón de precio (Arequipa 2021, B) | «Avíos» | Sin dato | **Probable (E)** | En tienda «etiqueta» es la de precio o código de barras |
| **Doblado · embolsado · encajado · empaque** | MINEDU, PUCP, Texgroup (B) | Dentro de Acabado | Sin dato | No | |
| **Control de calidad · inspección · revisión · auditoría · AQL** | «Inspección»: muestreo en corte y costura, 100 % en acabado (PUCP 2014, B); «AQL 1.0, 1.5 y 4.0» (APTT 2025, C) | «Falladas» y «segundas»; no tiene fase propia | Sin dato | No sabemos | |
| **Bordado computarizado · bordado directo · parches** | «Bordado computarizado» (ficha de un taller de Gamarra, C) | «Bordado» (fase opcional) | Sin dato | No | |
| **Ponchado · digitalización · matriz de bordado** | «Servicio de ponchado» (taller de Gamarra, C); «digitalización del logo» con pago único (ficha de un estampador, C) | «Fijo por orden» (ponchado del bordado, matriz del estampado) | Sin dato | **Probable (E)** | Tres nombres para el mismo costo único; «matriz» es del repo, no de las fichas |
| **Estampado · serigrafía · DTF · transfer · sublimado · vinilo** | «Serigrafía» con «cuadro» (pantalla), «arte» y «emulsionado» (página de serigrafía en Gamarra, C); «DTF» y «transfer» (C); «sublimado» (C) | «Estampado» (una sola fase) | Sin dato | No sabemos | Cada técnica se cotiza distinto; el ERP las junta en una fase |
| **Cuadro · pantalla · marco · fotolito · arte** | «Cuadro» = pantalla por color; «arte» = fotolito (página de serigrafía, C) | «Matriz del estampado» (fijo por orden) | Sin dato | **Probable (E)** | |
| **Lavandería · lavado · teñido · stone wash · enzimático** | «Lavandería» entre las etapas «post costura» (APTT, C); SUNAT dice que teñir una tela es acabado y no la transforma en producto (Informe 118-2015, B) | «Lavandería» (fase opcional) | Sin dato | No sabemos | No hallé tarifas ni mínimos |
| **Ojalado · botonado · aplicación de botones** | «Servicio de ojal y botón» (taller de Chiclayo, B); «botonera», «ojaladora» (B) | **No está** en la lista de fases | Sin dato | No sabemos | H-2.8: servicio chico, por prenda |

## 5 · Quién lo hace: servicio, maquila, taller

| Término | Oficio en Perú (fuente) | ERP hoy | Colaboradora de tienda | ¿Confunde? | Nota |
|---|---|---|---|---|---|
| **Servicio · maquila · taller · tallerista · tercero** | «Servicio de confección» (La Victoria 2022, B); «servicio prestado por terceros» (microempresa de Arequipa, B); «talleristas» y «terceros» (tesis de Arequipa, B); «maquila» = subprocesamiento de una parte de la producción, solo mano de obra (SUNAT 2014 y 2017, B); «producción por encargo» (SUNAT, B) | «Servicio» (Felipe: «servicio» gana a «maquila»); el proveedor tiene rubro `maquila` en la base; «maquila externa» es **palabra prohibida** | **No entendió «maquila»** ni «Enviar a maquila» (observado, tres veces) | **Sí (observado)** | SUNAT, la academia y las exportadoras dicen «maquila»; los talleres, «servicio»; la definición de SUNAT es de un texto mexicano |
| **Tercerizar · subcontratar · mandar afuera** | «Subcontratación de capacidad» y «por especialidad» (UNMSM 2007, B); «tercerizar» (tesis, B) | «Afuera con [proveedor]»; «quién» = Taller o servicio | Sin dato | No sabemos | |
| **Paquete completo · tela puesta · solo mano de obra** | «Paquete completo» = el proveedor pone tela e insumos y entrega prenda terminada; «maquila» = el cliente da materia prima, patrones y piezas cortadas (Medina 2016, Colombia, B); SUNAT: «fabricación por encargo» si el usuario entrega bienes, no si solo da avíos (B) | No distingue: supone que la tela es de CAYLA | Sin dato | **Probable (E)** | Cambia el papel y la detracción (H-2.9) |
| **Operaria · operario · costurera · maquinista** | «Operarios» de remalle, recta y basteo; «ayudantes»; «habilitadores» (La Victoria 2022, B) | «Colaborador/integrante»; la regla del repo veta «empleado» | Sin dato | No | |
| **Jefe de taller · supervisor · encargada** | «Jefe de taller», «supervisor», «jefe de personal» (La Victoria 2022, B); «encargado de talleres externos» en una exportadora (Industrial Data 2017, B) | «Encargada del Taller», «líder de equipo»; «jefe» está vetado en pantalla | Sin dato | No | |
| **Cliente · mayorista** | Para un taller de servicio, «cliente» es quien le manda cortes; los «mayoristas» exigen rapidez (La Victoria 2022, B) | «Cliente» es quien compra en tienda | Sin dato | **Probable (E)** | En el oficio «cliente» del taller = la marca que le manda trabajo, no el comprador final |

## 6 · Lo que sale y vuelve

| Término | Oficio en Perú (fuente) | ERP hoy | Colaboradora de tienda | ¿Confunde? | Nota |
|---|---|---|---|---|---|
| **Salida · Vuelta · envío · retorno · recojo** | «Entregar cortes», «retorno de las prendas» (Chiclayo 2023, B); «traslado de bienes para transformación» (motivo 17) y «recojo de bienes transformados» (motivo 07) (SUNAT 2024, B) | «Salida» y «Vuelta». Felipe: nunca «vales» | «Vale» no se entendió en la conversación con Felipe; «Salida/Vuelta» no se probó con colaboradoras | **No sabemos** | «Salida» también se usa en tienda y en Traslados con otro sentido (E) |
| **Guía · guía de remisión** | «Guía de remisión remitente», electrónica desde 2024 (SUNAT, B) | La guía va como texto en la Salida (A3) | La palabra ya existe en Traslados | **Probable (E)** | Si hay obligación de emitirla, no es solo texto (H-2.16): detener y confirmar con Felipe |
| **Primera · segunda · fallado · descarte · incompleto** | «Primeras y otros», «fallados», «reprocesos» (Industrial Data 2017, B); «tallas incompletas» como reclamo (La Victoria 2022, B) | «Buenas», «segundas», «faltantes», «falladas» | Sin dato | **Probable (E)** | En CAYLA «segunda» ya tiene vida propia (cuarentena y liquidación) |
| **Reproceso · compostura · zurcido · arreglo** | «Zurcido» = reproceso a mano de puntadas saltadas; «compostura» = reproceso en máquina (Industrial Data 2017, B); «regresan con las prendas para reparar» (La Victoria 2022, B) | No existe un estado «arreglada» | Sin dato | **Probable (E)** | En tienda «arreglo» es lo que hace el Taller por un cliente |
| **Faltante · merma · pérdida** | Sin definición en las fuentes | «Faltantes» = enviado − devuelto − segundas; «merma» en tela | Sin dato | **Probable (E)** | |
| **Sobrante · retazo · residuo** | «Excedente de tela», «residuos» que se desechan o se venden por kilo (Camborda 2023, B) | R-28: el retazo se bota | Sin dato | No | Cifras de desvío son del Frente 3 |

## 7 · Plata y papeles

| Término | Oficio en Perú (fuente) | ERP hoy | Colaboradora de tienda | ¿Confunde? | Nota |
|---|---|---|---|---|---|
| **Precio por prenda · hoja de precios · precio por operación** | «Hoja de precio de prendas» con renglones por operación y total por prenda (Arequipa 2021, B) | «Tarifa por prenda» | Sin dato | No | |
| **Precio menor · precio mayor · mínimo · «desde N unidades»** | Columnas «menor» y «mayor» (B); «desde 12 unidades» (C); «compra mínima de 3 unidades» (C) | «Cantidad mínima» (avisa, no bloquea) | Sin dato | **Probable (E)** | «Mayor» se lee mejor como «por cantidad» que como «mayor precio» |
| **Valor minuto · costo por minuto · minuto de costura** | «Costo por minuto» como base de cálculo (tesis, B); «minuto de costura» como indicador de competitividad (prensa, C) | No aparece (ADR-0400: sin valor minuto) | Sin dato | No sabemos | |
| **Destajo · por producción · a trato** | «Destajo» (cotizaciones por WhatsApp 2021, La Victoria 2022, B); concepto 0103 «comisiones o destajo» (SUNAT PLAME, B) | No aparece | Sin dato | No sabemos | En el oficio puede ser el pago a la operaria o lo que cobra el taller |
| **Cuota · cantidad por día** | «Se les deja una cantidad de prendas por día» (La Victoria 2022, B) | «Terminé N de M» | Sin dato | No sabemos | Es la forma en que algunos talleres miden |
| **Adelanto · a cuenta** | Sin fuente peruana | «Sin adelantos» (supuesto del arquitecto) | Sin dato | No sabemos | |
| **Factura · boleta · recibo por honorarios · nota** | Factura y contrato (persona jurídica) o recibo por honorarios (persona natural) para acreditar producción por encargo (SUNAT 118-2015, B); boleta y ticket para el Nuevo RUS (B) | «Papel del servicio»; el proveedor dice si lleva IGV | La ciega 2 no entendió «comprobante» ni «IGV incluido / sin IGV» (observado) | **Sí (observado)** | Un servicio puede dar cuatro papeles distintos o ninguno (H-2.14) |
| **Detracción** | «Detracción» 10 % para fabricación por encargo sobre S/ 700 (SUNAT, B) | «Solo avisa» | Sin dato | **Probable (E)** | |
| **IGV incluido · sin IGV** | — | «Tarifa sin IGV» | No entendió «IGV incluido / sin IGV» (observado) | **Sí (observado)** | |

## 8 · Tela y materiales

| Término | Oficio en Perú (fuente) | ERP hoy | Colaboradora de tienda | ¿Confunde? | Nota |
|---|---|---|---|---|---|
| **Tela · paño · fardo · rollo · pieza** | «Fardos de tela» (planta, PUCP 2014, B); «telas por fardos o rollos» (microempresas de Arequipa, B); «paños tendidos» (PUCP, B) | «Tela», en metros | Sin dato | No sabemos | R-25 dice metro, kilo y rollo; ADR-0400, solo metros (contradicción C1 del Frente 0) |
| **Avíos · insumos · materiales · accesorios** | «Insumos»: etiquetas, cierres, botones, hilos, bolsas, colgadores, cajas (PUCP 2014, B); «avíos textiles»: etiquetas, hangtags, botones, cierres, cajas de embalaje (SUNAT, B) | «Avíos»; «insumos» fuera de pantalla («insumos descontados» es **palabra prohibida**) | **No entendió «avíos» ni «insumos»** (observado) | **Sí (observado)** | SUNAT usa «avíos textiles» con su lista, y eso decide si el servicio es «fabricación por encargo» |
| **Consumo · rendimiento · eficiencia de tizado · margen** | «Eficiencia de tizado 65-70 %» (Camborda 2023, B); «margen de desperdicio» de 3 a 7 % (ficha de una textil, C) | «Consumo por prenda» (metros) | Sin dato | No sabemos | Las cifras son del Frente 3 |
| **Hilo** | En el mensaje de cotización de Arequipa, el hilo «corre por cuenta» del taller (B, texto de lectura difícil) | Avío (el insumo admite «cono» como unidad) | Sin dato | No sabemos | Un detalle que no consta en ningún documento de CAYLA: quién pone el hilo cuando la costura sale afuera |

## 9 · Tiempo y capacidad

| Término | Oficio en Perú (fuente) | ERP hoy | Colaboradora de tienda | ¿Confunde? | Nota |
|---|---|---|---|---|---|
| **Fecha de entrega · programación · plazo** | «Fecha de programación que se le indica al cliente» como indicador del taller (La Victoria 2022, B); «7 a 21 días hábiles» (ficha comercial, C) | «Fecha de entrega» = sale del Taller (supuesto) | Sin dato | **Probable (E)** | Para tienda, «entrega» es que llegue a la tienda (H13) |
| **Cola · cupo · capacidad** | «Cola de clientes», «no me comprometo con otros clientes porque conocemos la capacidad» (La Victoria 2022, B) | No existe «capacidad del servicio» | Sin dato | No sabemos | |
| **Campaña · temporada · pico** | «Campaña escolar», «campaña navideña» (prensa, C); «temporadas bajas» (La Victoria 2022, B); «épocas pico» (UNMSM 2007, B) | No aparece | Sin dato | **Probable (E)** | En tienda «campaña» es de ventas y descuentos |
| **Horas extras · trasnochar** | Para cubrir pedidos de temporada (La Victoria 2022; Chiclayo 2023, B) | No aparece | Sin dato | No | |

## Palabras que las pruebas ciegas no entendieron y que no están en esta lista

De `docs/formidable/produccion-modulo.md`: «curva sugerida por la red», «motor de demanda», «cubrir 30 días», «al filo 46 %», «gana 81 %», «margen promedio», «Abrir orden = guardar», «Generada», «Capital en insumos», «Valor en proceso», «Lotes recibidos». Son del Resumen y de las pantallas de Compras, no del proceso de producción; no tienen equivalente de oficio y no entran en este glosario.

## Lo que este glosario pide confirmar con la encargada del Taller

1. Qué palabra usa para lo que sale a coser: «servicio», «taller», «maquila», «facción» u otra.
2. Qué significa «acabados» en su boca (¿hilos y empaque, o también bordado y lavado?).
3. Si «habilitar» es un puesto, un paso o las dos cosas, y si ocurre al empezar, al terminar o ambos.
4. Si dice «trazo», «tizada» o «marcada».
5. Cómo llama a lo que vuelve mal hecho y lo que se arregla en el Taller.
6. Si usa «destajo», «por prenda» u otra palabra para el pago.
7. Con qué palabra pide un servicio el bordado y la matriz o el cuadro.
