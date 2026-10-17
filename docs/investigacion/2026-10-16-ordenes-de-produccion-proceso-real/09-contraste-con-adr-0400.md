# 09 · Contraste con ADR-0400: qué aguanta, qué se matiza y qué se contradice

**Frente 9 · 2026-10-16 · solo lectura.** Síntesis de los frentes 0 a 8 (archivos `00` a `08` de esta carpeta). Nada de lo que sigue es una orden de revertir ni un diseño: es lo que Felipe necesita ver, con la evidencia al lado, para decidir. Cada fila termina en una línea de consecuencia.

**Letras de evidencia:** **A** medido en la base o el repo · **B** fuente primaria (norma, tesis, artículo con revisión, documentación oficial) · **C** fuente secundaria (blog, ficha comercial, nota de prensa) · **D** lo dijo Felipe y está escrito · **E** inferencia. Las referencias `01·H-1.3` significan «archivo 01, hallazgo H-1.3»: allí están la fuente, la URL y la fecha de consulta (todas del 2026-10-16).

## 0 · Lo que hice yo, además de leer

Antes de resumir volví a comprobar, por mi cuenta y el 2026-10-16, las afirmaciones de las que más depende este informe:

| Qué comprobé | Resultado |
|---|---|
| Informe SUNAT 117-2003 (sunat.gob.pe, `i1172003.htm`) | **Confirmado:** quien entrega sus insumos a un tercero para transformarlos y recoge el producto es el propietario y debe emitir la guía de remisión remitente, con transporte privado o público (B) |
| SUNAT, «En la prestación de servicios», numeral 7 del Anexo 3 | **Confirmado:** 10 %, operaciones mayores a S/ 700; quedan fuera los casos en que el usuario solo entrega avíos textiles o solo diseños (B) |
| Base de producción, solo `SELECT` | **Confirmado:** `producciones`, `produccion_fases`, `proveedores_produccion` e `insumos` con 0 filas (las tablas nuevas existen, así que las migraciones del rediseño están pegadas) (A) |
| `retail.planilla_por_sede`, sede Taller | **Confirmado:** 6, 5 y 3 personas en los tres períodos seguidos (28-jun a 27-sep). Son personas pagadas en esa sede, no necesariamente operarias (A) |
| `anular_produccion` y `cerrar_produccion` vivas | **Confirmado:** la primera contiene el motivo de anulación que devuelve el consumo y el candado de «prendas afuera»; la segunda, el candado de «prendas afuera» (A) |
| Reglamento de Comprobantes de Pago, arts. 17 y 18 | **No pude releerlo:** el PDF de SUNAT está comprimido y la herramienta no lo abre. Me apoyo en la lectura del Frente 4 y en el Informe 117-2003, que sí releí. Por eso la fila de la guía dice «contradice» pero sigue yendo al contador. **Después, el Frente 10 sí lo releyó** (convirtiendo el PDF a texto) y confirmó los arts. 17.1, 17.5 y 18.1 (ver `12-escepticismo.md`) |

## 1 · Resumen: cuántas filas de cada veredicto

| | Confirma | Matiza | Contradice | Sin evidencia |
|---|---|---|---|---|
| Hipótesis H1 a H14 (14) | 0 (H12 se inclina) | 13 | 1 (H9) | 0 |
| Decisiones de Felipe y sus actualizaciones (24 filas, la tabla A) | 4 | 13 | 1 (la guía como texto) | 6 |
| Supuestos del arquitecto, contratos y alternativas descartadas (21 filas, la tabla B) | 2 | 13 | 1 (la guía como texto, otra vez) | 5 |

*Corrección del Frente 10:* «no hay norma sobre faltantes» (fila S1b) figuraba como «contradice»; pasó a «matiza» (ver la fila y `12-escepticismo.md`), por eso la columna de los supuestos pasó de 12 y 2 a 13 y 1.

Lectura honesta: **«matiza» domina porque casi todo lo decidido es una apuesta razonable cuya razón escrita no tiene respaldo.** La dirección de las decisiones aguanta; lo que se cae son las justificaciones (`10 operarias`, `el papel alcanza`, `95 % por bultos`, `menos de 3 %`, `en Lima no hay norma`) y un puñado de huecos.

## 2 · Lo que contradice o se queda sin respaldo (sube al resumen)

Ninguna de estas es una orden de revertir. La fila 1 es «contradice» en las tablas; las demás son «matiza» o «sin evidencia» (la 2 era «contradice» y el Frente 10 la bajó a «matiza»), pero la razón escrita en el ADR no se sostiene o el sistema tiene un hueco. Cada fila dice qué dato la cambiaría.

| # | Lo decidido o supuesto | Qué dice la evidencia | Fila |
|---|---|---|---|
| 1 | **La guía de remisión va como texto; el Taller no emite comprobantes** (A3, d.4) | La obligación de la guía es del dueño de la mercadería, no de quien emite comprobantes; se emite **antes** de mover la tela, las piezas o las prendas, incluso en servicios de transformación; motivo 17 de ida y 07 de vuelta. Sin guía: comiso o multa del 15 % del valor (tope 6 UIT) (B) | A·d.4b · H9 |
| 2 | **«En Lima no hay norma sobre faltantes»** (supuesto) | Se matiza: hay reglas civiles supletorias para la **tela** (el servicio paga la que inutiliza por negligencia y devuelve la que no se perdió), leídas a través de un artículo de doctrina que cita los artículos del Código (C: el texto de la ley no abrió); no hay ninguna tolerancia de faltantes de **prendas**; y una pérdida solo es deducible con pruebas (B) | B·S1 |
| 3 | **«Sin adelantos»** (supuesto) | No es una regla sino una suposición sin dato; si hay adelanto, el servicio debe emitir comprobante por lo recibido y el depósito de la detracción se adelanta (B) | B·S2e |
| 4 | **«Con 10 operarias el papel alcanza»; «el 95 % trabaja por bultos»** (d.1) | La planilla del Taller tiene 6, 5 y 3 personas (A, re-verificado); el 95 % está escrito sin fuente en un artículo de 2007; el único papel peruano descrito (un taller de servicio de 44 personas en La Victoria, cuatro entrevistas) es un cuaderno **por pedido**, no por fase (B, un solo caso) | A·d.1 · H1 |
| 5 | **«Se pierde menos de 3 %»** (R-31, sostiene d.7) | En tela, de unos 20 a 28 % del área queda sin usar en un estudio de pantalones con CAD (B) y de 10 a 21 % en tres referencias peruanas débiles (una plancha de licra, el resumen de una tesis de abrigos de alpaca y un promedio de segunda mano); en prendas, entre 10 y 28 % necesitan arreglo en talleres peruanos de costura (las dos medidas B de un mismo taller: 27,6 y 20,4 %). El 3 % describe, como mucho, las prendas **perdidas** y sin medir | H8 |
| 6 | **Hueco del propio sistema: una fase del Taller que termina con menos prendas de las que entraron nunca queda «hecha»** (d.1, d.7) | La pantalla nueva no deja pasar al stock una orden cuyo corte, costura o acabado terminó corto (prenda dañada, tela insuficiente, sobrecorte), aunque la base sí dejaría cerrarla (A, `07·H-7.1`) | A·d.7b |
| 7 | **Hueco del propio sistema: anular una orden devuelve toda la tela al estante** (principio 2) | `anular_produccion` devuelve el consumo neto a su costo sin mirar cuánto se cortó; solo frena si hay prendas afuera (A, re-verificado, `07·H-7.3`) | A·act. |
| 8 | **La justificación de d.2 («el mismo día y la misma persona»: SENATI, PUCP, planta piloto UNMSM)** | La ficha de SENATI no abre; «planta piloto UNMSM» no existe como documento; la tesis PUCP es de un exportador de 995 personas y no dice «mismo día y misma persona»; lo más cercano (taller de 13) sí junta trazo, tendido y corte en una persona, pero el habilitado es un puesto aparte (B) | A·d.2 |

## 3 · Tabla A · Las decisiones de Felipe (ADR-0400) y sus actualizaciones

| # | Decisión | Veredicto | Evidencia (letra · dónde) | Consecuencia en una línea |
|---|---|---|---|---|
| d.1 | Avance por fase; sin bulto, operación ni operaria; base lista para pasar a bulto (granularidad A) | **matiza** | B: el bulto existe y se numera en las tres plantas peruanas (`01·H-1.1`, `H-1.8`); A: Dynamic paga al Taller por tiempo, sin columna de piezas (`05·H-5.8`); B: solo ~8 % de los asalariados de confección cobra por pieza (`08·H-8.7`); B: capturar por persona activa el miedo a que el dato baje la tarifa (`08·H-8.9`); A: 6→5→3 personas en planilla; B: el papel real es un cuaderno por pedido (`08·H-8.1`) | Aguanta por prudencia; su razón no tiene respaldo y «Terminé N» sería una anotación nueva que se sumaría al cuaderno. |
| d.2 | Fases: Corte · Costura · Acabado, más Bordado, Estampado y Lavandería; trazo, tendido y habilitado dentro de Corte; desarrollo no es fase; ingreso al stock no es fase | **matiza** | B: la espina la usan cuatro fuentes de 13 a 995 personas (`01·H-1.1`); B: en un taller de 13, una persona traza, tiende y corta (`01·H-1.2`); matices: «habilitado» tiene tres sentidos y es un puesto aparte (`01·H-1.3`, `02·H-2.3`), la revisión de calidad tiene responsable (`01·H-1.4`), se plancha entre operaciones de costura (`01·H-1.5`), el trazo a veces lo entrega Planeamiento (`02·H-2.2`), ojal y botón es un servicio sin nombrar (`01·H-1.11`, `02·H-2.8`) | La espina aguanta; quedan abiertos ojales y botones, qué significa «habilitado», dónde se plancha y quién declara buena una prenda. |
| d.3a | Tercerizar = una fase entera con **un** quién | **matiza** | B (baja, 2007, exportadoras): en picos se subcontrata «por capacidad» partiendo el volumen y de prenda completa (`01·H-1.10`, `02·H-2.6`, `04·H-4.18`); B: una empresa produce el mismo abrigo en planta y afuera (`02·H-2.7`); B: nada legal obliga a un solo servicio y partir no cambia los papeles (`04·H-4.21`); A: partir exige dos órdenes, cada una con su propio Corte (`06·H-6.15`); sin dato de cuántas veces ocurre en CAYLA | Es una decisión de simplicidad, no de ley ni de oficio; cuánto cuesta depende de cuántas veces CAYLA reparta en campaña. |
| d.3b | El quién se decide al abrir y se cambia hasta que la fase empiece | **sin evidencia** | Ninguna fuente lo respalda ni lo contradice; E: en un pico o con una baja de personal puede hacer falta pasar una fase al servicio ya empezada (`07·#19`) | Sin cambio; queda como pregunta de uso real. |
| d.3c | El corte también puede salir a un servicio | **confirma** | B (baja, lectura de gráfico): unas 60 empresas contratan el corte como servicio (`01·H-1.10`); C: sacar el corte suma una o dos semanas al ciclo (`05·H-5.23`) | Aguanta; su costo está en la espera, no en la tarifa. |
| d.4a | «Salida» y «Vuelta» contadas por talla y color; afuera = salidas − vueltas | **confirma** | E/B: el conteo firmado al salir y al volver es la base de cualquier reclamo (`04` §2.3); C: los referentes de uso anotan cantidad, destino y plazo al salir y conteo por talla al volver (`08` §5); B: el primer faltante se descubre al recibir | Aguanta como control; no es exigencia de SUNAT (sirve de prueba). |
| d.4b | El número de guía va como texto (el Taller no emite comprobantes) | **contradice** | B: el propietario emite la guía remitente antes de mover, también en servicios de transformación; motivos 17 y 07; sin excepción para tela, piezas o prendas; sanción de comiso o 15 % (`04·H-4.1` a `H-4.5`; `02·H-2.16`; Informe 117-2003 re-verificado); A: la base no tiene dirección del Taller ni peso (`04·H-4.6`). Contraejemplo: si el contrato dice que el servicio recoge y entrega, la guía es del servicio | El campo de texto puede seguir anotando el número, pero el papel tiene que existir antes de la salida: **detener y confirmar con Felipe y el contador**. |
| d.4c | La tela y los avíos que viajan con la Salida son «consumo» de la orden | **sin evidencia** | B: el plan contable no dice cómo anotar el insumo en poder de un tercero (`04·H-4.15`); la tela entregada sigue siendo de CAYLA (`07·H-7.11`) | Pregunta para el contador (lista del Frente 4, n.º 20). |
| d.5 | Tarifa por prenda + cantidad mínima por servicio + fijo opcional por orden; devengado = buenas recibidas × tarifa + fijo; aviso (no bloqueo) bajo el mínimo; tarifa congelada al abrir | **matiza** | B: hojas de precio por operación con total por prenda terminada (`02·H-2.11`); C: precio por unidad + mínimo + cargos fijos (`05·H-5.12`); C: el mínimo suele ser un escalón de precio y el ponchado un pago único por diseño (`02·H-2.12`); D: 150–240 de Felipe, sin respaldo ni refutación pública; B: un adelanto obliga a comprobante (`04·H-4.11`); A: el mínimo del servicio es varias veces el stock del mejor modelo propio (<50) (`06·H-6.9`) | Aguanta en el cuerpo; el aviso de mínimo va a salir casi siempre y el «fijo por orden» podría ser «por diseño». |
| d.6a | La tela se compra por metros | **matiza** | B/C: plano por metro, punto por kilo (`03·H-3.4`); A: 13 de 26 modelos con marca CAYLA llevan nombre de tela plana, 0 de punto, 10 ambiguo (`03·H-3.17`); D: R-25 dice metro, kilo y rollo | Aguanta si el Taller corta solo plano; con punto, la compra y la factura vienen en kilos. |
| d.6b | El consumo se escribe una vez en el modelo (lo de Audaces) y lo medido lo corrige | **matiza** | B: el consumo de un CAD es de una marcada con varias tallas y cambia 5,6–9,1 % según cómo se combinen (`03·H-3.1`); C: el consumo de marcada deja fuera puntas y fin de tendido (`05·H-5.14`); lo medido mezcla cinco causas (`03·H-3.6`); B: con una sola orden no se distingue ruido de cambio (`05·H-5.16`) | La dirección (lo real corrige) es correcta; lo declarado es un piso, y «lo medido gana» desde la primera orden puede mover el modelo por una orden rara. |
| d.6c | No se construye la conversión kilo → metro | **matiza** | B/C: metros por kilo depende de gramaje y ancho; «≈3 m/kg» no es constante (`03·H-3.5`, `H-3.19`) | Solo importa si el Taller llega a cortar punto. |
| d.7a | «Terminé N de M» por talla y color; lo que falta por defecto; Deshacer | **sin evidencia** | No apareció en ninguna fuente peruana que se anote avance por fase, talla y color (`08` §2); B: Odoo y MRPeasy usan «todo por defecto + deshacer», sin datos de adopción (`08·H-8.17`) | El patrón de captura es común; que funcione en el Taller se ve con la primera semana. |
| d.7b | Solo las buenas avanzan a la fase siguiente | **matiza** | B: la calidad se revisa en varios momentos y alguien decide rehacer o descartar (`01·H-1.4`); A: la fase del Taller con menos prendas que las que entraron nunca queda «hecha» (`07·H-7.1`) | Aguanta; falta quién declara buena una prenda y cómo termina una fase corta. |
| d.7c | Las segundas no entran al stock | **matiza** | A: el Taller no tiene lugar para segundas (`07·H-7.2`); B: una segunda vendible no es desmedro y sigue siendo existencia con costo (`04·H-4.14`); C (baja): «venta final» en liquidación puede chocar con INDECOPI (`07·H-7.14`) | La decisión no se contradice; la segunda queda sin lugar ni costo propio hasta que se decida su destino. |
| d.7d | Se corta de más hasta 10 % del plan (constante en código) | **matiza** | C: exportadoras 2–5 %, marcas pequeñas ±5–10 % (`01·H-1.14`, `03·H-3.9`, `07·H-7.10`); A: se calcula por talla y color con redondeo hacia arriba (5 → 6 es +20 %) y la fase siguiente exige coser todo lo cortado; convive con el techo de cierre de ADR-0415 | El 10 % es el techo de lo reportado, todo en fuentes C y ninguna peruana. |
| d.8 | Cabecera única `EncabezadoPagina` | **sin evidencia** | Es un asunto de diseño de pantalla; esta investigación no lo cubre | Fuera de alcance. |
| d.9 | Primera entrega: fases con quién + Salida y Vuelta + tela; muestras con rondas después (`es_muestra`) | **matiza** | B/C: la literatura advierte contra cortar un lote sin muestra de preproducción aprobada, no contra diferir las rondas (`01·H-1.15`); C: sin muestra aprobada no hay contra qué reclamar (`07·H-7.15`); A: nada guarda «aprobada» y un interruptor deja ir un modelo nuevo directo a lote | Diferir las rondas aguanta; falta dejar rastro de quién aprobó la primera prenda. |
| d.10 | Lista «A» y página propia «D» para la orden | **sin evidencia** | Elegidas por Felipe mirando láminas; esta investigación no las cubre | Fuera de alcance. |
| act. 4b | Anular una Salida o una Vuelta mal anotada, con motivo (fila contraria) | **confirma** | `07` #36: el dato mal anotado es de frecuencia alta y es el caso mejor cubierto; B: el conteo firmado es la base del reclamo (`04` §2.3) | Aguanta. |
| act. d | Costos del Taller visibles para quien ve Producción en ese Taller; el costo de lo perdido se reparte entre las buenas | **matiza** | B: la norma contable saca a gasto el desperdicio anormal y deja el normal en el costo (`05·H-5.5`); A: el costo es uno por orden, sin costura propia (`05·H-5.3`) | Cómo tratar lo perdido es criterio del contador. |
| act. 6 | `cerrar_produccion` rechaza más buenas que las terminadas y cierres con prendas afuera | **confirma** | Principio 2; A re-verificado (candado vivo). Matiz: la cuenta compartida del Taller no es líder y no puede pasar al stock con costo atípico (`07·H-7.6`, `08·H-8.19`) | Aguanta; queda por resolver quién cierra. |
| act. 7b | El consumo del modelo se corrige desde Nueva orden con un interruptor | **matiza** | Igual que d.6b: lo declarado es un punto de partida, no un número firme | Aguanta como mecanismo. |
| act. j | La tela en camino cuenta, salvo los pedidos atrasados | **sin evidencia** | No hay dato público de cómo reservan tela los talleres pequeños (`03·H-3.15`) | Sin cambio. |

## 4 · Tabla B · Supuestos del arquitecto, contratos y alternativas descartadas

| # | Supuesto o contrato | Veredicto | Evidencia (letra · dónde) | Consecuencia en una línea |
|---|---|---|---|---|
| S1a | Se pagan las buenas recibidas; faltantes y segundas quedan con motivo | **confirma** | B: hojas de precio por prenda terminada (`02·H-2.11`); D: R-30 | Aguanta. |
| S1b | «En Lima no hay norma sobre faltantes: lo fija la relación» | **matiza** *(antes «contradice»; bajado por el Frente 10)* | C: Código Civil, arts. 1773, 1774 n.º 3 y 1788, leídos a través de un artículo de doctrina de la PUCP que los cita (el Frente 10 comprobó que el artículo los trae, incluido el texto del 2.º párrafo del 1788; el texto de la ley no abrió) (`04·H-4.13`, `07·H-7.11`); B: la deducción de mermas, desmedros y robos exige pruebas (`04·H-4.13`). Esas reglas hablan de la **tela** que el servicio inutiliza o que sobra; ninguna fija una tolerancia de faltantes de **prendas** | «No hay norma» es exagerado para la tela; para la tolerancia de faltantes sigue siendo cierto. Hay reglas supletorias y pruebas que pedir (contador y abogado). |
| S1c | El descuento al servicio es decisión del líder, no automática | **matiza** | C: un descuento mal documentado puede leerse como venta de lo entregado; viene de un solo artículo que comenta dos resoluciones del Tribunal Fiscal **sobre explosivos y combustibles en minería**; el Informe 082-2006 trata de combustible en una obra y no habla de descuentos (el Frente 10 lo releyó). Para tela es una analogía (E) (`04·H-4.12`) | La decisión es de la líder; el papel del descuento importa, y la analogía con la tela la confirma el contador. |
| S2a | Detracción de 10 % si la operación pasa S/ 700 | **confirma** | B: re-verificado en SUNAT; RS 071-2018 no toca el numeral 7 (`02·H-2.15`, `04·H-4.7`) | Aguanta (cambios de 2026 no descartados). |
| S2b | La maquila con tela de CAYLA es «fabricación por encargo» | **matiza** | B: sí con tela, piezas o bienes intermedios y también con dinero para insumos; **no** si CAYLA solo da avíos o diseños (RS 056-2006, Informe 151-2006); sin pronunciamiento sobre bordado, estampado o lavandería (`04·H-4.8`) | Depende de quién pone la tela y de qué hace el servicio. |
| S2c | El ERP solo avisa; el contador deposita | **matiza** | B: el obligado a depositar es CAYLA, hasta la fecha de pago o el quinto día hábil del mes siguiente a anotar la factura; multa del 50 % del importe no depositado (`04·H-4.9`) | «Solo avisa» es una práctica, no una norma. |
| S2d | La tarifa va sin IGV; el proveedor dice si su papel lleva IGV | **matiza** | B: boleta y ticket del Nuevo RUS no sustentan gasto ni crédito; el recibo por honorarios cabe para un oficio individual (`04·H-4.10`); A: el IGV solo existe en el tipo factura y no hay marca por tarifa (`04·H-4.16`) | El supuesto deja fuera la boleta, el recibo y el «sin papel». |
| S2e | Sin adelantos | **sin evidencia** | Ninguna fuente peruana lo respalda ni lo refuta; B: si los hay, el servicio emite comprobante por lo percibido y el depósito se adelanta (`04·H-4.11`) | Es un hecho que solo CAYLA sabe. |
| S3 | El papel del servicio sigue como gasto en Finanzas (d.63 de ADR-0362) | **matiza** | B: el plan contable trae la cuenta 633 para producción encargada con insumos del dueño y la 23; A: las 13 categorías de gasto de CAYLA no la tienen (`04·H-4.15`) | Decisión ya tomada por Felipe; el contador debería ver si la 633 aplica. |
| S4 | Opera quien ve Producción y está parado en el Taller | **matiza** | A: las 3 cuentas «Integrante» del Taller no entran y queda una cuenta compartida «Producción» que no es líder (`00`, `07·H-7.6`, `08·H-8.19`) | El «quién» del dato depende del responsable elegido en el combo. |
| S5a | La tela tiene color y la orden propone la del color de la prenda | **matiza** | C: se separan rollos por tono y un modelo-color debería salir de una banda; ADR-0090 consume por lote de compra, no por lote de tinte (`03·H-3.13`) | Aguanta; el «tono» no está dicho. |
| S5b | La tela comprometida se descuenta de lo disponible | **sin evidencia** | No hay dato público de talleres pequeños (`03·H-3.15`) | Sin cambio. |
| S6 | La fecha de entrega promete que las prendas salen del Taller | **matiza** | B: Odoo y Katana separan fin de producción y entrega; C: la salida de fábrica es la convención en exportación; A/D: en CAYLA hay cuatro pasos entre salir y vender (`06·H-6.19`) | Válida como promesa del Taller, no como fecha de venta. |
| S7 | Un color o talla que el modelo no tiene no se agrega desde la orden | **sin evidencia** | Es regla de catálogo | Sin cambio. |
| S8 | Las fases son una lista fija en código | **sin evidencia** | Ninguna fuente la contradice; ojal y botón sería la primera candidata a entrar (`01·H-1.11`) | Sin cambio. |
| A3 | «El Taller no emite comprobantes» y por eso la guía de remisión va como texto | **contradice** | B: la obligación de la guía es del propietario o poseedor al iniciar el traslado, no de quien emite comprobantes (`04·H-4.1`) | Es la misma fila que d.4b. |
| Alt-1 | «Tercerizar una parte de las prendas de una fase casi no ocurre con 3 tiendas» | **matiza** | B (2007): es la forma más común de tercerizar en las pymes de Lima; sin dato de CAYLA | La frase «casi no ocurre» no tiene respaldo ni refutación local. |
| Alt-2 | Granularidad B descartada porque «el 95 % trabaja por bultos» | **sin evidencia** | La cifra aparece sin fuente en un artículo de 2007; lo cercano (80 % en EE. UU. en 1993; módulos no lejos de la serie en una encuesta limeña de 2007) no la apoya (`01·H-1.8`, `08·H-8.5`) | Descartar B puede seguir siendo prudente, pero no por esa cifra. |
| Alt-3 | Conversión kilo → metro descartada «porque CAYLA compra por metros» | **matiza** | Igual que d.6a | Depende de si el Taller corta punto. |
| R-31 | «Se pierde menos de 3 %; no hace falta modelar segunda calidad» | **matiza** | Ver H8 | El 3 % no distingue tela, prendas perdidas y prendas arregladas. |
| R-26 | «Audaces devuelve el consumo con precisión; el número ya es exacto» | **matiza** | Ver H6; el formato real del reporte no se ha visto | «Exacto» es el consumo de la marcada, no el que se gasta. |

## 5 · Tabla C · Las catorce hipótesis

| # | Hipótesis | Veredicto | Evidencia (letra · dónde) | Consecuencia en una línea |
|---|---|---|---|---|
| H1 | El avance se anota por fase y basta | **matiza** | Frentes 1, 5 y 8 coinciden: B el bulto existe físicamente; B el pago por pieza pesa 40 % en una encuesta limeña de 2007 y ~8 % de asalariados hoy; A Dynamic muestra pago por tiempo; B el miedo al dato; «10 operarias» sin respaldo (A: 6→5→3) | d.1 aguanta por prudencia; su razón no. |
| H2 | Espina Corte · Costura · Acabado; trazo, tendido y habilitado dentro de Corte | **matiza** | Frentes 1 y 2: B espina confirmada; matices de habilitado, calidad, plancha, trazo y ojal/botón | d.2 aguanta como espina; cuatro palabras necesitan definición. |
| H3 | Tercerizar es una fase entera con un quién | **matiza** | Frentes 1, 2, 4 y 6: B (2007) en picos se parte el volumen; B nada legal obliga a un solo servicio; A partir exige dos órdenes; cambia todo según quién pone la tela | d.3 es una decisión de simplicidad; falta saber cuánto reparte CAYLA. |
| H4 | Por prenda, con mínimo 150–240 y fijo opcional | **matiza** | Frentes 2, 4, 5 y 8: B por prenda terminada; C el mínimo es escalón de precio; B el adelanto obliga a comprobante; sin dato de 150–240 ni de adelantos | d.5 aguanta; el mínimo y el «fijo por orden» piden dato propio. |
| H5 | La tela se compra por metros | **matiza** | Frente 3: B/C plano por metro y punto por kilo; A 13 de 26 modelos propios de nombre plano, 0 de punto | d.6 aguanta si el Taller corta plano. |
| H6 | El consumo sale de Audaces, se escribe una vez y lo medido corrige | **matiza** | Frentes 3 y 5: B el consumo de CAD es de marcada multi-talla (5,6–9,1 %); C deja fuera puntas; lo medido mezcla cinco causas; una orden no distingue ruido | «Lo real corrige» va en la dirección correcta; lo de Audaces es un piso. |
| H7 | Las segundas no entran al stock; faltante = enviado − devuelto | **matiza** | Frentes 4 y 7: A el Taller no tiene lugar para segundas; B no es desmedro y es existencia con costo; B/C reglas civiles sobre tela; el faltante no se calcula, se anota | d.4/act. d aguanta; la segunda queda sin casa. |
| H8 | Entre el corte y la prenda vendible se pierde menos de 3 % | **matiza** (en tela, contradicho) | Frentes 3, 5 y 7: B/C 10–21 % de huecos entre moldes en tres referencias peruanas débiles, y de unos 20 a 28 % del área sin usar en un estudio con CAD (B); B/C 10–28 % de prendas se arreglan (27,6 y 20,4 % en un mismo taller); C cut-to-ship de 92–98 % en planta; sin dato de primeras órdenes | R-31 es una estimación que mezcla tres pérdidas. |
| H9 | La guía de una Salida basta como texto | **contradice** | Frente 4 (B, alta); Frente 2 la leyó con confianza media; Informe 117-2003 re-verificado | Detener y confirmar con Felipe y el contador. |
| H10 | Maquila con tela de CAYLA = fabricación por encargo, detracción 10 % sobre S/ 700, el ERP solo avisa | **matiza** | Frentes 2 y 4: B tasa y umbral verificados; alcance depende de quién pone la tela, del papel y de quién deposita (CAYLA) | Los números aguantan; el alcance y la oportunidad no. |
| H11 | Se corta de más hasta 10 % y solo avanzan las buenas | **matiza** | Frentes 1, 3 y 7: C 2–5 % en exportación, ±5–10 % en marcas pequeñas; A el redondeo por talla lo infla; A cortar de más traba la fase siguiente | El 10 % es el techo de lo reportado, no lo típico. |
| H12 | Una orden es un modelo, con sus colores y tallas | **matiza** (se inclina a confirma) | Frente 6 confirma (C oficio por estilo; A mediana de 3 colores y 3 tallas, 25 modelos); Frentes 1 y 3 matizan (el tendido es por color y rollo; el tono por lote) | Aguanta como unidad comercial; la unidad física es la tela por color, dentro de la orden. |
| H13 | La fecha de entrega promete que las prendas salen del Taller | **matiza** | Frente 6: B las separan Odoo y Katana; C la salida de fábrica es la convención; A cuatro pasos entre salir y vender; sin plazo medido | Válida como promesa del Taller; no es la fecha de venta. |
| H14 | La muestra es una orden con `es_muestra` y las rondas se difieren | **matiza** | Frentes 1 y 7: B/C la advertencia es cortar sin muestra aprobada; A nada guarda «aprobada» | Diferir rondas aguanta; falta rastro de la aprobación. |

## 6 · Hallazgos de síntesis (formato del brief)

**H-9.1 · Mover tela, piezas o prendas a un servicio exige que CAYLA, como dueña, emita una guía de remisión remitente electrónica antes de moverlas.**
  Evidencia: B · `04·H-4.1` a `H-4.5` (Reglamento de Comprobantes de Pago arts. 17, 18.1.1 y 21; RS 240-2024; Código Tributario Tabla I); Informe SUNAT 117-2003 re-leído por mí el 2026-10-16 · consultada 2026-10-16
  Confianza: alta en el texto; media en cómo aplica a cada traslado de CAYLA (quién transporta, si el Taller está declarado) · Aplica a: ambos
  Lo contradiría: una norma posterior que exceptúe el traslado a transformación, o un contrato en el que el servicio recoge y entrega (entonces la guía es suya)
  Implicación: contradice A3 y d.4 de ADR-0400; detener y confirmar con Felipe y el contador antes de decidir nada.

**H-9.2 · Lo que ADR-0400 supone del Taller (10 operarias, el papel alcanza, 95 % por bultos) no tiene respaldo.**
  Evidencia: A · planilla del Taller de 6, 5 y 3 personas (re-verificada) y 3 personas activas con función de Taller en Dynamic (`00`); B · el 95 % es una frase sin fuente de un artículo de 2007 (`08·H-8.5`); B (un solo caso) · el papel de un taller de servicio de Lima de 44 personas es un cuaderno por pedido (`08·H-8.1`) · consultada 2026-10-16
  Confianza: alta en el origen de las cifras; media en cuántas personas hacen de verdad el trabajo (puede haber gente fuera de planilla) · Aplica a: taller de ~10 operarias
  Lo contradiría: que la mayoría de las operarias estén fuera de la planilla de Dynamic
  Implicación: d.1 aguanta por prudencia, no por esa razón; queda como pregunta de hecho.

**H-9.3 · «Quién pone la tela» es la variable que cambia papeles, impuestos y responsabilidad, y ADR-0400 solo modela un caso.**
  Evidencia: B · `04` §2.1 (tres modelos: tela de CAYLA, paquete completo, servicio sobre prenda hecha); RS 056-2006; Informe 151-2006; `02·H-2.9` · consultada 2026-10-16
  Confianza: alta en la norma; media en cuál de los tres modelos usa CAYLA · Aplica a: ambos
  Lo contradiría: que CAYLA siempre mande su propia tela
  Implicación: toca d.3, d.4 y la detracción (H3, H10).

**H-9.4 · «Merma» nombra tres pérdidas distintas y el 3 % de R-31 solo describe, como mucho, una de ellas y sin medir.**
  Evidencia: B/C · `03` §1 (huecos entre moldes: unos 20–28 % del área en un estudio con CAD, B, y 10–21 % en tres referencias peruanas débiles, C/B; desvío de la sala de corte; prendas que no llegan) y `05` §4; B · entre 10 y 28 % de prendas se arreglan en talleres peruanos (`07·H-7.7`; las dos medidas B abiertas son 27,6 y 20,4 %, de un mismo taller) · consultada 2026-10-16
  Confianza: media · Aplica a: taller de ~10 operarias
  Lo contradiría: una medición propia del Taller con inspección en línea y menos de 5 % de fallas
  Implicación: H8; separar «reparar» de «perder» antes de fijar una tolerancia.

**H-9.5 · «Por prenda» es la forma de pagar entre una marca y un servicio; a las personas del Taller probablemente se les paga por tiempo.**
  Evidencia: A · Dynamic: `sueldo_fijo` en falso y horas y días en las 14 filas de planilla, sin piezas (`05·H-5.8`); B · ~8 % de asalariados de confección cobra por pieza, y quien más cobra por pieza queda fuera de esa cifra (`08·H-8.7`) · consultada 2026-10-16
  Confianza: media (pueden existir pagos fuera de planilla; los bonos de cerca de la mitad de las filas no tienen explicación) · Aplica a: taller de ~10 operarias
  Lo contradiría: que parte de la costura se pague por pieza fuera de planilla
  Implicación: H1 y H4; si no hay destajo, anotar por fase paga; el costo de mano de obra por orden pide horas, no piezas.

**H-9.6 · Nadie midió cuánto tarda una prenda del corte a la tienda, y ese plazo es lo que más mueve «producir ya».**
  Evidencia: A · `producciones` con 0 filas (re-verificado); D/A · plazos de 7, ≈14 y 30 días en tres lugares, ninguno medido; con 7, 10, 14 y 21 días pasan de 13 a 25, 40 y 51 los modelos en «producir ya» (`06·H-6.8`) · consultada 2026-10-16
  Confianza: alta · Aplica a: CAYLA
  Lo contradiría: la re-medición del ledger de noviembre
  Implicación: H13; bloqueante para el puente decisión → orden.

**H-9.7 · La orden no tiene salida cuando algo sale corto o mal.**
  Evidencia: A · `07·H-7.1` (fase corta nunca «hecha»), `H-7.2` (segundas sin lugar), `H-7.3` (anular devuelve toda la tela; re-verificado), `H-7.4` (no se edita una orden abierta), `H-7.5` (cierre único), `H-7.6` (cuenta del Taller sin permiso para costo atípico) · consultada 2026-10-16
  Confianza: alta (lo medido en la base y la rama) · Aplica a: CAYLA
  Lo contradiría: una función o botón que no encontré
  Implicación: principio 2; toca d.7 y los supuestos de faltantes; cinco de las seis son decisiones de Felipe (banco: P-04, P-05, P-06, P-27, P-29).

**H-9.8 · El Código Civil parece decir quién responde por la tela entregada a un servicio, y un descuento mal escrito podría leerse como venta de lo entregado (por analogía con casos de minería).**
  Evidencia: C · arts. 1773, 1774 n.º 3 y 1788 (a través de un solo artículo de doctrina de la PUCP; el texto primario no abrió); dos resoluciones del Tribunal Fiscal vistas a través del mismo artículo, **sobre explosivos y combustibles en minería, no sobre tela**; el Informe 082-2006 (B) trata de combustible en una obra y no menciona descuentos (`04·H-4.12`, `H-4.13`; `07·H-7.11`) · consultada 2026-10-16; releído por el Frente 10 el mismo día
  Confianza: baja a media (una sola fuente C; falta el texto primario del Código Civil, confirmar que la maquila de CAYLA es contrato de obra y que lo de minería aplica a tela) · Aplica a: ambos
  Lo contradiría: un contrato escrito con el servicio que diga otra cosa (el art. 1773 admite pacto), o un criterio del Tribunal Fiscal sobre confección
  Implicación: matiza «en Lima no hay norma» (no lo contradice); para el contador y el abogado.

**H-9.9 · La lista de fases deja fuera lo que más se manda afuera en tejido plano y mezcla tres sentidos de «habilitado».**
  Evidencia: B · una fábrica de camisas manda el 100 % a un servicio de ojal y botón (un día de ida y vuelta, más que toda la sala de corte) (`01·H-1.11`, `H-1.16`); B · `01·H-1.3` (habilitado: tres sentidos y un puesto); B · `01·H-1.5` (plancha entre operaciones); A · 13 de 26 modelos propios son de tela plana · consultada 2026-10-16
  Confianza: media (un taller en Chiclayo) · Aplica a: taller de ~10 operarias con tejido plano
  Lo contradiría: que el Taller de CAYLA tenga máquina de ojal y botón
  Implicación: d.2; pregunta de hecho antes de tocar la lista.

**H-9.10 · Varias citas con las que se justificaron decisiones no se sostienen o no abren.**
  Evidencia: B · ficha de SENATI sin abrir, «planta piloto UNMSM» inexistente como documento, Informe 057-2017 es de drawback y no de detracción, «1 % de segundas» no aparece en su fuente, «jersey 24/1 ≈ 3 m/kg» depende de gramaje y ancho (`02` §6, `03·H-3.19`, `04` §7) · consultada 2026-10-16
  Confianza: alta · Aplica a: ambos
  Lo contradiría: que se aporten las fuentes originales
  Implicación: d.2, d.6 y los supuestos de detracción conservan su conclusión por otras fuentes o quedan como apuesta.

**H-9.11 · Es mucho más lo que ninguna fuente puede decir que lo que dicen.**
  Evidencia: E · síntesis: ningún frente encontró un taller descrito de 5 personas, un plazo en días de calendario por etapa, una tarifa de corte, ni un solo dato de una orden de CAYLA · consultada 2026-10-16
  Confianza: alta · Aplica a: ambos
  Lo contradiría: un estudio de talleres de Lima que no encontré (los tres sitios gremiales y los PDF de CAF/ADEX no abrieron)
  Implicación: el banco de 36 y el paquete de evidencia existen por esto.

## 7 · Lo que aguanta (por si solo se lee esto)

- La espina **Corte · Costura · Acabado** y que trazo, tendido y corte los hace una persona (`01·H-1.1`, `H-1.2`).
- **El corte también puede salir** a un servicio (`01·H-1.10`).
- **Tarifa por prenda terminada** como forma de pagar a un servicio, con fijo aparte en bordado y estampado (`02·H-2.11`, `H-2.12`).
- **Salida y Vuelta** contadas por talla y color como base de cualquier reclamo (`04` §2.3).
- **Anular con motivo** una anotación mal hecha (`07` #36).
- **La detracción**: tasa del 10 % y umbral de S/ 700 verificados (`04·H-4.7`).
- **«Lo real corrige lo declarado»**, en su dirección (`05·H-5.14`).
- **Una orden = un modelo con sus colores y tallas** como unidad comercial (`06·H-6.13`).
- **Los candados del cierre** (no más buenas que las terminadas; no cerrar con prendas afuera).
- **No capturar por persona** al inicio: la literatura documenta el miedo al dato y el estrés de ser medido (`08·H-8.9`, `H-8.10`).

## 8 · Donde los frentes no coinciden, y cómo lo resolví

| Tema | Qué dijo cada frente | Cómo lo resolví |
|---|---|---|
| H9 | Frente 2: «matiza» con confianza media; Frente 4: «contradice» con confianza alta | Tomo el Frente 4, que leyó los artículos del Reglamento; releí el Informe 117-2003 y coincide. Sigue yendo al contador |
| H12 | Frente 6: confirma; Frentes 1 y 3: matizan | «Matiza, se inclina a confirma»: la orden por modelo aguanta para planear, el tendido es por color |
| Guía electrónica desde 2024 | Frente 4: obligatoria para todos desde 2024-01-01 (considerandos de la RS 240-2024); Frente 6: «no afirmo» | Uso la lectura del Frente 4 y la dejo marcada como pregunta al contador (no leí el anexo del calendario de emisores) |
| «Personas del Taller» | Frente 0: 3 activas con función de Taller en Dynamic; Frente 5: 6, 5 y 3 pagadas por período | No se contradicen: una cuenta personas activas hoy y la otra personas pagadas por período; ninguna dice cuántas son operarias |
| Plazo de reposición | 7 (cobertura), ≈14 (nota de sesión de Felipe), 30 (código) | Tres cifras sin medir; ninguna sale de una orden real |
| Estado de las migraciones | El ADR-0400 (act. j) dice que producción no tenía las tablas; el Frente 0 y mi consulta dicen que sí existen | Las tablas existen (verificado hoy): las migraciones se pegaron después de esa actualización |

## 9 · Estado de lo que la investigación del 13-oct marcó `[externo, sin verificar]`

| Afirmación previa | Estado | Nota |
|---|---|---|
| Detracción del 10 % si la operación pasa S/ 700 | **verificada** | Alcance matizado (H10); la cita del Informe 057-2017 era errónea (es de drawback) |
| Informe 117-2003 (guía por transformación) | **verificada** | Re-leída por mí |
| Motivos 17 (ida) y 07 (vuelta) | **verificada** | Catálogo 20 de la RS 240-2024 |
| Informe 151-2006 (fabricación por encargo y detracción) | **verificada** | El dinero para comprar insumos también cuenta |
| Informe 057-2017 como fuente de la detracción | **refutada como fuente** | Trata del comprobante de la maquila para el drawback |
| A3: «el Taller no emite comprobantes: guía como texto» | **refutada en lo de la guía** | La obligación es del propietario |
| «El recibo por honorarios no cabe en maquila» | **refutada en parte** | Cabe para un oficio individual |
| «En Lima no hay norma sobre faltantes» | **matizada** (el Frente 10 la bajó de «refutada en parte») | Reglas civiles supletorias para la tela (C: vía un artículo); ninguna tolerancia de faltantes de prendas |
| «El proveedor dice si su papel lleva IGV» | **matizada** | Solo existe en el tipo factura |
| Tesis PUCP del corte | **verificada** | No dice «mismo día y misma persona» |
| Catálogo MINEDU «Costura y acabados» | **verificada** | Planchado, etiquetas y empaque dentro de acabados |
| APTT «calidad post costura» | **verificada** | Opinión de un gremio |
| Ficha limeña de SENATI | **sigue sin verificar** | No abre |
| «Planta piloto UNMSM» | **sigue sin verificar** | No existe documento con ese nombre |
| Tesis UNMSM de talleres externos | **sigue sin verificar** | Error de certificado |
| CAF/ADEX «La confección del progreso» | **sigue sin verificar** | PDF vacío |
| «El 95 % trabaja por bultos» | **sigue sin verificar** | Frase sin fuente de un artículo de 2007 |
| Corte S/ 0,50–0,60 (2014) | **sigue sin verificar** | Ninguna tarifa pública de corte |
| Bordado, ponchado, serigrafía | **verificadas (C)** | Fichas comerciales 2025-2026; serigrafía con matiz |
| Lavandería: tarifa y mínimos | **sigue sin verificar** | Sin fuente |
| Condiciones de los talleres de Gamarra; adelantos del 50 %; paquetes de ~30 | **siguen sin verificar** | Enlace muerto y sin otra fuente |
| Primera / segunda / incompletos; faltante = enviado − devuelto | **sigue sin verificar** | Como práctica; coherente como ecuación |
| Exportadoras descuentan el faltante | **sigue sin verificar** | Solo hay base legal civil |
| Inspección en Lima: ~15 % zurcidos y ~13 % composturas | **verificada** | 14,9 % y 12,7 % (Industrial Data 2017) |
| «… frente a 1 % de segundas» | **sigue sin verificar** | No aparece en la fuente |
| Jersey 24/1 ≈ 3 m/kg | **no se sostiene como constante** | Depende de gramaje y ancho |
| Control de calidad como fase propia «así lo hacen empresas grandes y el MINEDU» | **sigue sin verificar** | El programa MINEDU abierto no lo lista |
| Plazos y mínimos de bordado, estampado y lavandería en Lima | **siguen sin verificar** | Las páginas no los publican |

## 10 · Contraejemplos de esta síntesis

1. **Contra mi lectura de H9:** si el contrato dice que el servicio recoge y entrega, la guía de ida y vuelta es suya y «texto» alcanza (`04` §6). *Matiz del Frente 10:* el mismo art. 18.1 dice que, cuando la guía la emite el prestador de servicios, para las multas del art. 174 n.º 8 a 10 del Código Tributario se considera remitente al dueño de los bienes; por eso este contraejemplo también va al contador.
2. **Contra «lo decidido aguanta en su dirección»:** la única evidencia de que se parte una fase es una encuesta de 2007 a pymes exportadoras; para una marca con taller propio no hay caso descrito.
3. **Contra «la tela se compra por metros»:** R-25 (D) dice que el Taller compra por metro, kilo y rollo; mi respaldo (13 de 26 modelos de nombre plano) sale de nombres de tela y no de lo que hace el Taller.
4. **Contra «nadie ha observado el Taller»:** no es del todo cierto que no haya datos de CAYLA: la base tiene 4.008 movimientos y un catálogo de 337 modelos; lo que no tiene es ni una orden.

## Lo que no encontré

- **Ninguna cifra real de CAYLA** de costo, desvío, plazo, segundas o pagos: `producciones` tiene 0 filas.
- **Un taller descrito de 5 personas** y **plazos en días de calendario por etapa** en Lima.
- **Tarifas públicas de corte y lavandería**; **adelantos y garantías** con talleres peruanos; **cómo se encuentra o se elige** un servicio.
- **El reporte real de Audaces** y qué se anota hoy en el Taller (la visita A0 no consta).
- **El texto primario del Código Civil** (cité un artículo que lo cita) y el **calendario de emisores** de guías electrónicas.
- Los frentes 1 a 8 chocaron con el tope de 200 búsquedas web compartido; varias fuentes (CAF/ADEX, SENATI, UNMSM «talleres externos», ficha de Gamarra) no abrieron.
- **El Frente 10 (escéptico) ya corrió** (`12-escepticismo.md`): atacó las 12 afirmaciones más pesadas con fuentes abiertas directamente (no pudo buscar: la cuota de búsquedas web ya estaba agotada) y corrigió lo que no aguantaba.

## Preguntas que solo CAYLA puede contestar

Las 71 candidatas están en `11-banco-de-preguntas.md`; las 36 elegidas, listas para pasar a `AskUserQuestion`, empiezan por las que bloquean: quién pone la tela (P-01), qué papel acompaña lo que sale (P-02), si el Taller está declarado ante SUNAT (P-03), quién puede dar por terminada una fase corta (P-04), qué hacer con la tela cortada al cancelar (P-05) y qué pasa con las segundas (P-06). Lo que solo la encargada puede aportar con el celular está en `10-paquete-de-evidencia.md`.

## Fuentes

Todas consultadas el **2026-10-16**. La lista completa, con URL, está en la sección «Fuentes» de cada archivo `01` a `08`; aquí van solo las que sostienen las filas que más pesan. «Murió» = el enlace no entregó el documento.

| Nivel | Fuente | URL | Estado |
|---|---|---|---|
| B | SUNAT, Informe 117-2003 (guía por transformación) | https://www.sunat.gob.pe/legislacion/oficios/2003/oficios/i1172003.htm | vivo; releído por mí |
| B | SUNAT, «En la prestación de servicios» (Anexo 3, numeral 7) | https://orientacion.sunat.gob.pe/3142-03-en-la-prestacion-de-servicios-empresas | vivo; releído por mí |
| B | SUNAT, Reglamento de Comprobantes de Pago, capítulo V | https://www.sunat.gob.pe/legislacion/comprob/regla/capituloV.pdf | vivo; **PDF comprimido, no lo pude releer**; leído por el Frente 4 |
| B | SUNAT, RS 240-2024, Anexo I (catálogo 20) | https://www.sunat.gob.pe/legislacion/superin/2024/anexo1-000240-2024.pdf | vivo |
| B | SUNAT, Informe 151-2006 (fabricación por encargo y SPOT) | https://www.sunat.gob.pe/legislacion/oficios/2006/oficios/i1512006.htm | vivo |
| B | SUNAT, Informe 082-2006 (entrega de bienes en contrato de obra) | https://www.sunat.gob.pe/legislacion/oficios/2006/oficios/i0822006.htm | vivo |
| B | SUNAT, RS 056-2006 (precisiones al numeral 7) | https://www.sunat.gob.pe/legislacion/superin/2006/056.htm | vivo |
| B | SUNAT, Código Tributario, Tabla I | https://www.sunat.gob.pe/legislacion/codigo/tablaI.pdf | vivo |
| B | SUNAT, Informe 094-2023 (merma) | https://www.sunat.gob.pe/legislacion/oficios/2023/informe-oficios/i000094-2023-7T0000.pdf | vivo |
| B | MEF, Plan Contable General Empresarial | https://www.mef.gob.pe/contenidos/conta_publ/documentac/PCGE_2019.pdf | vivo |
| B | Tesis PUCP 2014, DMAIC en una empresa textil | https://tesis.pucp.edu.pe/server/api/core/bitstreams/3093332f-4f9c-4eb8-baea-0b0cbf9e5d5e/content | vivo |
| B | Tesis USAT 2023, proceso productivo de camisas | https://repositorio.usat.edu.pe/server/api/core/bitstreams/85178ce1-bb4b-49ee-9995-2c90edba094c/content | vivo |
| B | Tesis UNMSM 2007, pymes de confecciones | https://cybertesis.unmsm.edu.pe/backend/api/core/bitstreams/9a9270be-7f2b-4035-8ed6-d5708f420b8f/content | vivo |
| B | Tesis UCSM 2021, abrigos de tejido plano | https://repositorio.ucsm.edu.pe/bitstreams/b04f4eae-5ccc-419b-a3d1-5cc031ea4e64/download | vivo |
| B | Ayala 2022, taller de confección de Lima (tesis UWiener) | https://repositorio.uwiener.edu.pe/bitstream/handle/20.500.13053/7031/T061_74579359_T.pdf?sequence=1 | vivo |
| B | Pérez Gao 2017, control de calidad en mypes, Industrial Data | https://www.redalyc.org/pdf/816/81653909013.pdf | vivo |
| B | Zhezhova et al. 2019, tipo y ancho de marcada | https://eprints.ugd.edu.mk/23449/1/c12.pdf | vivo |
| B | OIT-Better Work, DP 28 (Borino 2018), pago por pieza | https://betterwork.org/wp-content/uploads/DP-28-Piece-rate-pay-and-working-conditions-in-the-export-garment-sector_Final.pdf | vivo |
| B | Tesis UPeU 2021, costos por órdenes en confección | https://repositorio.upeu.edu.pe/bitstreams/9c22fed5-ce41-461c-8f37-8f3783838db0/download | vivo |
| C | Hernández Berenguel, bienes entregados a contratistas (Foro Jurídico, PUCP) | https://revistas.pucp.edu.pe/index.php/forojuridico/article/download/13810/14434 | vivo; **es doctrina: nivel C en todo lo que cita (Código Civil, Tribunal Fiscal); sus casos son de minería** |
| B | MINEDU, «Costura y acabados» | https://www.minedu.gob.pe/superiortecnologica/pdf/catalogo/actual/industria-manufacturera/fabricacion-prendas-de-vestir/costura-y-acabados-publicado-18-12-2018.pdf | vivo |
| B | INEI, TIC en los hogares, IV trimestre 2025 | https://www.inei.gob.pe/media/MenuRecursivo/boletines/boletin-tic-oct_dic2025.pdf | vivo |
| B | Odoo 18, órdenes atrasadas | https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/manufacturing/reporting/delayed.html | vivo |
| C | Online Clothing Study, cut-to-ship | https://onlineclothingstudy.com/2013/10/what-is-cut-to-ship-ratio-in-apparel.html | vivo |
| C | Apparel Resources, gestión de tela (2009) | https://apparelresources.com/business-news/manufacturing/fabric-management-saving-fabric-or-just-increasing-dead-stock/ | vivo |
| C | Fashion-Incubator, cutting ticket | https://fashion-incubator.com/what-is-a-cutting-ticket/ | vivo |
| — | CAF/ADEX, «La confección del progreso» | https://scioteca.caf.com/handle/123456789/437 | vivo pero **PDF vacío** |
| — | Manual de SENATI | https://www.senati.edu.pe/sites/default/files/escritorio/Comunicados/PUBLICACIONES-19/manual-uniforme-senati-act.pdf | **no se pudo leer** |
| — | Tesis UNMSM «talleres externos» | https://eventosindustrial.unmsm.edu.pe/upg_old/archivos/TESIS2018/MAESTRIA/tesis8.pdf | **error de certificado** |
| — | Ficha de un taller de Gamarra (corte y confección a pedido; se omite el nombre del negocio) | fabricantes.gamarra.com.pe, ficha del taller | **murió (410)** |

**Base de datos (A):** consultas `SELECT` a `retail.producciones`, `produccion_fases`, `proveedores_produccion`, `insumos`, `transferencias`, `planilla_por_sede` y a `pg_proc` (`anular_produccion`, `cerrar_produccion`), proyecto `cayla-dynamic`, 2026-10-16. Sin montos ni nombres copiados al repo.
