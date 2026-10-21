# 02 · Cómo se hace en Lima y en Perú

**Frente 2 · 2026-10-16 · solo lectura.** Ataca H2, H3 y H4 de `2026-10-16-ordenes-de-produccion-proceso-real-PROMPT.md` y verifica lo que la investigación del 13-oct dejó como `[externo, sin verificar]`. Fecha de consulta de todas las fuentes: **2026-10-16**.

## Cómo leer este archivo

- Letras de evidencia (sección 4 del brief): **B** = norma o informe de SUNAT, catálogo del Estado, tesis o artículo de revista citable; **C** = nota de prensa, informe sectorial de segunda mano o ficha comercial; **D** = lo dijo Felipe y está en el repo; **E** = inferencia mía (dicha como tal).
- **Nadie observó el Taller de CAYLA** (Frente 0). Lo que sigue describe cómo trabajan otros talleres y empresas del Perú. Sirve para poner a prueba hipótesis, no para afirmar cómo es el Taller de CAYLA.
- **Límites de esta pasada.** El tope de búsquedas web de la sesión (200, compartido por todos los agentes) se agotó a mitad del trabajo. Lo demás se hizo abriendo páginas y PDFs que ya conocía o que otros agentes habían dejado en la copia de la sesión. Quedaron flojos o sin cubrir: tarifas de corte y de lavandería, plisado, ojales y botones en Lima, Día de la Madre y Fiestas Patrias, adelantos. Todo está en «Lo que no encontré».
- **Repo público:** no hay nombres de proveedores, de operarias ni de marcas, ni tarifas de CAYLA. Los precios que aparecen son de terceros (tesis y fichas públicas) y van como rangos.
- **Fuentes que no pude abrir** (enlace vivo, texto ilegible para mis herramientas): CAF/ADEX 2008, tesis UNMSM «talleres externos», manual SENATI, norma SINEACE. Lo que se diga de ellas es solo lo que dice el título o la ficha, y va marcado.

## Lo que cuenta, en 10 líneas

1. **H2 se sostiene en lo grueso y se matiza en tres puntos.** En plantas peruanas, tendido, corte, fusionado de entretelas y habilitado (numerar y armar paquetes) ocurren en la misma sala (H-2.1). Pero el trazo lo trae a veces Planeamiento (H-2.2), «habilitar» es un oficio que cruza fases (H-2.3) y la palabra «acabados» significa dos cosas distintas según quién hable (H-2.4).
2. **H3 es la más frágil.** La forma más común de tercerizar en las pymes de Lima es «por capacidad»: en los picos se manda afuera una parte del volumen de una prenda ya conocida (H-2.6). Eso choca con «una fase entera, un solo quién; para repartir, dos órdenes».
3. **Quién pone la tela decide qué es el servicio.** SUNAT trata como «fabricación por encargo» (10 % de detracción sobre S/ 700) lo que se hace con bienes que entrega el cliente, y deja fuera el caso en que el cliente solo da avíos (H-2.9). El Código Civil ya parte de que quien encarga provee los materiales.
4. **H4 se confirma en «por prenda» y se matiza en «mínimo».** Lo documentado es una hoja de precios por operación que suma un total por prenda, con dos columnas de precio (H-2.11). En bordado y serigrafía el mínimo es un escalón de precio, no una puerta cerrada (H-2.12).
5. **El destajo existe, pero casi siempre entre quien encarga y el taller**, no entre el taller y sus operarias. En empleo asalariado de confecciones, la OIT mide 8 % pagado por pieza en Perú (H-2.13).
6. **El papel del servicio no es uno solo.** Depende del régimen del taller: factura, recibo por honorarios, boleta o nada (H-2.14). Un taller del Nuevo RUS no puede emitir factura.
7. **La detracción del 10 % sobre S/ 700 quedó verificada** en SUNAT (H-2.15) y trae una exclusión que importa a CAYLA: si el cliente solo entrega avíos, no es fabricación por encargo.
8. **La guía de remisión no es solo «texto».** Un informe de SUNAT (2003) dice que quien entrega insumos para transformarlos y los recoge con su transporte debe emitir guía remitente, y los códigos 17 y 07 existen en el catálogo de 2024 (H-2.16). Esto se marca **detener y confirmar con Felipe**.
9. **Los talleres de servicio llevan un cuaderno**, no un sistema: cliente, fecha de entrega y total de prendas (H-2.10). Es la mejor pista de cuánto dato se anota de verdad.
10. **No hay tarifa pública de Lima para corte ni lavandería, ni dato de adelantos.** De los 29 datos que la investigación del 13-oct dejó sin verificar (sección 6), 17 quedaron verificados (varios con matiz o solo en parte), 12 siguen sin verificar y ninguno quedó refutado.

---

## 1 · Las fases: qué hay dentro de Corte, Costura y Acabado (H2)

```
H-2.1 · En plantas peruanas, la sala de corte hace tendido, corte, fusionado de entretelas y habilitado (numerar y armar paquetes), en ese orden y en la misma área
  Evidencia: B · tesis PUCP 2014 (empresa exportadora, Puente Piedra), pp. 39-41, 48-51: diagrama «preparado de mesa → tendido → bloqueo → corte → fusionado → habilitado», salida «bulto de piezas cortadas»; el habilitado es «numeración de las piezas… y formación de paquetes» · B · artículo Texgroup, Ingeniería Industrial n.º 36 (U. de Lima, 2018), p. 37: «tendido, corte en piezas, fusionado, numerado y habilitado» en el área de corte · B · artículo Bonilla, Ingeniería Industrial n.º 25 (U. de Lima, 2007): «módulo de corte y habilitado», lote medio de 200 prendas en el corte, paquetes de unas 40 prendas para costura · consultada 2026-10-16
  Confianza: alta en planta grande; media en taller de ~10 operarias (ninguna de las tres fuentes es un taller chico) · Aplica a: planta grande
  Lo contradiría: una encargada del Taller que diga que habilitar lo hace otra persona, en otra mesa y otro día
  Implicación: respalda d.2 de ADR-0400 («tendido y habilitado viven dentro de Corte»).
```

```
H-2.2 · El trazo (tizado, marcada) a veces no es del Corte: en una planta lo entrega Planeamiento antes de cortar
  Evidencia: B · tesis PUCP 2014, p. 48: Planeamiento «suministra el tizado (moldes para el corte)», la orden de corte y la orden de habilitado; el corte solo recibe y ejecuta · B · artículo Camborda, Industrial Data 26(2) (UNMSM, 2023), pp. 53-92: en empresas de tejido de punto de Lima Norte el tizado y el corte se tratan como un solo problema y la eficiencia de tizado reportada es de 65-70 % · consultada 2026-10-16
  Confianza: media · Aplica a: planta grande
  Lo contradiría: que en el Taller de CAYLA quien corta también hace la marcada en el CAD (R-26 dice que Audaces la calcula, no quién la corre)
  Implicación: d.2 acierta si en el Taller la misma persona traza y corta; si no, «Corte» esconde un paso con otro responsable. Se pregunta (ver preguntas).
```

```
H-2.3 · «Habilitar» es un oficio que cruza fases, no solo un paso de la sala de corte
  Evidencia: B · tesis de licenciatura, taller de confección de Lima, 2022 (44 personas: 30 operarios y 14 ayudantes y habilitadores), pp. 71-73 y entrevistas: los 10 «habilitadores» reciben telas e hilos, registran la materia prima, habilitan los cortes, los ordenan y transportan, y también doblan y empaquetan prendas terminadas; en las entrevistas, al final se vuelve a «habilitar talla por talla» para entregar, y a veces una operaria deja su máquina para habilitar · B · tesis de Chiclayo, 2023, Tabla 58: un taller chico lista 6 de costura, 1 habilitador y 1 de acabados · consultada 2026-10-16
  Confianza: media (un taller en Lima, entrevistas a cuatro responsables; otro en Chiclayo) · Aplica a: taller de ~10 operarias
  Lo contradiría: que en el Taller de CAYLA «habilitar» no exista como puesto o se haga solo al cortar
  Implicación: d.2 (Corte) cubre habilitar los cortes, pero el «habilitar talla por talla» antes de entregar es de otra fase; afecta a quién anota Salida y Vuelta.
```

```
H-2.4 · «Acabado» significa dos cosas distintas en las fuentes peruanas, y R-29 usa la segunda
  Evidencia: B · catálogo nacional del MINEDU, programa «Costura y acabados» (2018), unidad de competencia 2: quitar hilos sobrantes, clasificar prendas terminadas, desmanchar, planchar o vaporizar, poner hang tags y etiquetas, doblar y embolsar · B · tesis PUCP 2014, pp. 40-41 y 45: inspección minuciosa, plancha y empaque, más detector de metales · B · Texgroup 2018, p. 37: soplado, planchado, doblado, acomodo, embolsado y encajado · B · artículo de APTT (10-dic-2025), «Calidad post costura»: llama «post costura» a lavandería, bordados, transfer, estampados, acabados finales, inspección, planchado, etiquetado, doblado y auditoría · consultada 2026-10-16
  Confianza: alta para el contenido de «acabado» (tres fuentes B coinciden); media para el choque de palabra (una fuente gremial lo mezcla)
  Lo contradiría: que el Taller de CAYLA llame «acabados» a otra lista
  Implicación: la fase Acabado de d.2 (hilos, planchado, etiquetas, empaque) es el uso oficial; R-29 («acabados: bordado, estampado, lavandería») usa el uso gremial; hay que decir cuál se queda en pantalla (ver glosario).
```

```
H-2.5 · El control de calidad no aparece como una fase con «quién» propio en las fuentes peruanas; es inspección dentro de cada área, con gente propia solo en planta grande
  Evidencia: B · tesis PUCP 2014, p. 45: muestreo en corte y costura (norma NT-ISO 2859) e inspección al 100 % en acabado · B · Texgroup 2018, p. 37: 110 de 842 operarios en control de calidad, más una auditoría de lotes entre costura y acabado y un último control · B · tesis de Arequipa (2021, proyecto de fábrica «low cost»), p. 55: lista «Control de Calidad» como paso propio entre confección y planchado · consultada 2026-10-16
  Confianza: media · Aplica a: planta grande (para la gente propia); taller de ~10 operarias sin dato
  Lo contradiría: que la encargada del Taller revise al final como un paso aparte con su propia hoja
  Implicación: d.2 acierta en no darle fase propia; la pregunta abierta es dónde se anotan las falladas.
```

## 2 · Tercerizar: cuántas fases, a quién y con qué tela (H3)

```
H-2.6 · La forma más común de tercerizar en las pymes de Lima es «por capacidad»: en los picos se manda afuera una prenda completa, y se parte el volumen
  Evidencia: B · tesis UNMSM 2007 (Miranda), «Desarrollo de las pymes en el mercado exportador, sector confecciones», encuesta de unos 116-125 empresarios de Gamarra, Ate-Vitarte, Mercado Central y Villa El Salvador (la tesis da ambas cifras), pp. 90-91 y gráfico 44 (p. 113): el vínculo con otra empresa es eventual y ocurre cuando la capacidad no alcanza en épocas pico; es la «subcontratación de capacidad», la de mayor uso, y lo que más se contrata es el «servicio de confección completo, es decir una prenda completa»; la subcontratación «por especialidad» es menos frecuente; en el gráfico 44 los servicios de corte y confección tienen decenas de empresas cada uno (lectura aproximada de las barras) · consultada 2026-10-16
  Confianza: media (2007; pymes exportadoras; barras sin cifras exactas) · Aplica a: taller de ~10 operarias
  Lo contradiría: que en CAYLA el pico se resuelva moviendo todo el modelo a otro lugar, no partiéndolo
  Implicación: choca con d.3 («no se reparte una fase entre dos talleres; para eso, dos órdenes»): lo habitual en picos es partir el volumen de una misma fase entre adentro y afuera.
```

```
H-2.7 · Hay empresas que producen el mismo producto en planta y en talleres de afuera, y lo que vuelve se termina adentro
  Evidencia: B · tesis UCSM Arequipa 2021 (línea de abrigos), diagnóstico, pp. 76 y 91-92 (aprox.): «producción de planta» y «producción tercerizada» de abrigos conviven; las prendas que vuelven de afuera necesitan botones y planchado adentro y crean cuello de botella en acabado · consultada 2026-10-16
  Confianza: baja-media (una empresa) · Aplica a: ambos
  Lo contradiría: que CAYLA mande el modelo entero afuera o lo haga entero adentro
  Implicación: refuerza H-2.6; lo que vuelve de una fase tercerizada puede exigir trabajo de la fase siguiente en casa (Acabado).
```

```
H-2.8 · Existen servicios chicos, por prenda y rápidos, que no están en la lista de ADR-0400: ojal y botón
  Evidencia: B · tesis de Chiclayo 2023 (taller de camisas), pp. 78-79 y Tabla 59: manda a un servicio el «ojal y botón» por falta de máquina; pagó S/ 0,20 por camisa en 2019 (20.800 camisas al año) y las prendas vuelven al acabado con un día de demora · consultada 2026-10-16
  Confianza: media-baja (un taller, Chiclayo, precio de 2019) · Aplica a: taller de ~10 operarias
  Lo contradiría: que CAYLA no tenga prendas con ojales (camisas, blusas) que salgan a ese servicio
  Implicación: la lista fija de d.2 (Bordado, Estampado, Lavandería) deja fuera ojales y botones, y no hay fuente peruana que lo meta dentro de Costura.
```

```
H-2.9 · Quién pone la tela cambia la naturaleza del servicio, para SUNAT y para el Código Civil
  Evidencia: B · SUNAT, página de orientación «Apéndices del Sistema de Detracciones», Anexo 3 numeral 7 «Fabricación de bienes por encargo»: el prestador se hace cargo de todo o parte del proceso de elaboración, producción, fabricación o transformación de un bien, y el usuario entrega materias primas, insumos o bienes intermedios; porcentaje 10 %; excluye (a) cuando el usuario entrega solo avíos textiles (etiquetas, hangtags, botones, cierres, cajas) y el prestador hace toda la prenda, (b) cuando entrega solo diseños · B · Informe SUNAT 119-2006: lo determinante es que el usuario entregue cualquier bien · B · Informe SUNAT 151-2006: es un servicio (contrato de obra), y el SPOT aplica aun si el encargante entrega dinero para comprar los insumos · B · Código Civil arts. 1771, 1773, 1774 n.º 3 y 1788, según cita de Hernández Berenguel (Foro Jurídico, PUCP): salvo pacto, quien encarga provee los materiales; el contratista paga los que inutiliza por negligencia o impericia y devuelve los que no se perdieron · consultada 2026-10-16
  Confianza: alta en el texto; media en su aplicación a cada servicio de CAYLA (eso es del contador) · Aplica a: ambos
  Lo contradiría: una consulta específica a SUNAT que trate el bordado o el lavado sobre prendas del cliente como otro numeral
  Implicación: «tela de CAYLA» vs «tela puesta por el taller» es una marca que afecta H3 y H10; va a la lista del contador (sección «Preguntas para el contador»).
```

```
H-2.10 · Un taller de servicio de Lima recibe «cortes» del cliente, pide cantidad y una muestra, pacta fecha, tiene cola y lleva un cuaderno
  Evidencia: B · tesis de licenciatura, taller de confección de La Victoria (Lima), 2022, entrevistas del 11 al 27 de abril a cuatro responsables, pp. 95-103: «la recepción de las prendas es en cortes»; hace un «servicio completo de confección» (remalle, recubierta, recta, habilitar talla por talla); al recibir un trabajo pregunta cuántas prendas son y pide una muestra para estimar el tiempo; la fecha de entrega que pacta es su indicador; no se compromete con otros clientes porque conoce su capacidad; hay «cola de clientes» y quien no encuentra cupo se va; el registro es un cuaderno con fecha de entrega, total de prendas y nombre del cliente, más un registro manual de lo producido en el día; los reclamos que recibe son descosidos, fallas en cierres, acabado y tallas incompletas, y a veces el cliente vuelve con las prendas para que las arreglen; si los cortes del cliente vienen mal, el taller dice que corregirlos le hace perder tiempo · B · tesis de Arequipa 2021 (Anexo 16, p. 238): el mensaje de cotización que reproduce ofrece «las prendas cortadas», pide solo el ensamblado y costura, deja el hilo por cuenta del taller y busca un taller para tandas de 75 unidades a largo plazo (texto de lectura difícil) · consultada 2026-10-16
  Confianza: media-baja (un taller de Lima, cuatro entrevistas, 2022) · Aplica a: taller de ~10 operarias
  Lo contradiría: otro taller de servicio que trabaje con sistema, con orden numerada y con registro por talla
  Implicación: sostiene el «quién anota» de d.1 y la Salida/Vuelta de d.4: lo que hoy se anota afuera es cliente, fecha y total; el dato por talla y color lo tendría que aportar CAYLA.
```

## 3 · Cómo se pide y cómo se paga (H4)

```
H-2.11 · La costura se paga por prenda terminada, con una hoja de precios que suma operaciones y dos columnas de precio («menor» y «mayor»)
  Evidencia: B · tesis UCSP Arequipa 2021 (fábrica «low cost»), Anexo 16, pp. 234-238: cuatro «hojas de precio de prendas» de talleres de costura (2021) listan cada operación («preparado de cuello x3», «pegado de mangas x2», «cierre de costado»…) con un precio por operación y un total por prenda; los totales de las cuatro hojas van de S/ 1,38 (camiseta de cuello redondo) a S/ 8,98 (pantalón de dama); tres de las cuatro hojas traen columnas «precio menor» y «precio mayor», y la cuarta solo «precio mayor» · B · misma tesis, p. 238: cotizaciones por WhatsApp pedidas «a destajo» para 75 unidades por estilo: polo S/ 2,50 a 5,00; polera S/ 3,80 a 4,50; falda S/ 2,50 a 5,00; jogger S/ 3,30 a 8,00; camisa S/ 7,50 (un taller dijo que «actualmente no estamos confeccionando» camisas); algunos cotizan «solo armado» · B · misma tesis, Tabla 78 (p. 111): modelo de la tesista con costo por minuto de S/ 0,12, calculado sobre un sueldo mínimo de S/ 930 que atribuye a 2019, que da S/ 1,69 por polo y S/ 8,01 por jean · consultada 2026-10-16
  Confianza: media-baja (cuatro talleres, 2021, Arequipa, no Lima); mi lectura de «menor/mayor» como precio por cantidad es **E** (inferencia) · Aplica a: taller de ~10 operarias
  Lo contradiría: un servicio de Lima que cobre por kilo, por hora o por docena (no encontré ninguno)
  Implicación: respalda d.5 («tarifa por prenda»); la tarifa de una prenda sale de sumar operaciones, y el precio puede cambiar con la cantidad.
```

```
H-2.12 · En bordado y estampado el fijo es real, y el mínimo es un escalón de precio, no una puerta cerrada
  Evidencia: C · ficha comercial de un estampador y bordador de Lima (15-mar-2025): logo en pecho desde S/ 18 por prenda de 1 a 11 unidades, desde S/ 8 de 12 en adelante, desde S/ 5 de 50 en adelante; digitalización del logo de S/ 30 a 60 (el texto dice 30 a 80), pago único · C · página comercial de serigrafía en Gamarra (copyright 2026): compra mínima de 3 unidades; el costo por polo con prenda incluida baja de S/ 36 (3 uds.) a S/ 10,08 (1.000 uds.); el «cuadro» (pantalla) cuesta S/ 15 por color y el arte S/ 5 · C · artículo comercial de polos corporativos (20-feb-2026): algunos talleres aceptan desde 10 unidades, con menos de 20 el precio por pieza sube; bordado S/ 6 a 30 y serigrafía S/ 3 a 18 por prenda; muestra de S/ 20 a 80; entrega de 7 a 21 días hábiles · consultada 2026-10-16
  Confianza: media (tres fichas comerciales convergen; ninguna es una encuesta de precios ni habla de CAYLA) · Aplica a: ambos
  Lo contradiría: que los servicios que usa CAYLA, de mayor volumen, sí tengan un mínimo de 150 a 240 que no cede (lo dijo Felipe, D)
  Implicación: respalda el «fijo por orden» de d.5; el «mínimo 150-240» de Felipe puede ser cierto para sus servicios y no para el oficio en general, y el aviso que no bloquea (d.5) es coherente con eso.
```

```
H-2.13 · El pago por pieza vive sobre todo entre quien encarga y el taller; entre el taller y sus operarias el sueldo sigue pesando
  Evidencia: B · OIT/IFC, documento de debate n.º 28 (Borino, 2018), pp. 5-6, cuadro 1: con datos de ENAHO 2016, el 8 % de los asalariados del sector confecciones de Perú cobra por pieza (6 % de mujeres, 9 % de hombres); el estudio deja fuera a quienes trabajan por cuenta propia o a domicilio, que cobran por pieza (cita una estimación de WIEGO: hasta 60 % de la producción de ropa, sobre todo infantil y de mujer, se hace en casa en Asia y América Latina); el 20 % de los datos de Perú no trae forma de pago · B · tesis UNMSM 2007, p. 107 y gráfico 41 (p. 109): en una encuesta a empresarios de Gamarra, Ate-Vitarte, Mercado Central y Villa El Salvador, el destajo pesa 40 % de las formas de pago, contra 20 % de sueldo básico y 22 % de pago por eficiencia; jornada media de 52 horas por semana · B · tesis de La Victoria 2022 (entrevista 3): a las operarias se les deja una cantidad de prendas por día; algunas aceptan destajo «como medida de prevención para no perder un pedido»; el sueldo mensual de los operarios figura con descuento de ONP · B · tesis UPeU Arequipa 2021, tablas de mano de obra (tres entrevistas): cumplen horario, a veces trabajan a destajo y otras veces se envía a servicio de terceros; la microempresa no los inscribe en planilla y paga cada semana o cada mes · B · SUNAT, tabla PLAME (versión de oct-2025), concepto 0103: «comisiones o destajo» es un ingreso de planilla para destajeros · consultada 2026-10-16
  Confianza: media (las cifras de 2007 y de 2016 miden cosas distintas y no se pueden comparar) · Aplica a: taller de ~10 operarias
  Lo contradiría: que en el Taller de CAYLA todas las operarias cobren por prenda
  Implicación: matiza H1 y H4: «por prenda» describe lo que CAYLA le paga a un servicio, no necesariamente cómo le paga el servicio a quien cose; el dato por operaria solo importa si el Taller paga por pieza (pregunta para Felipe).
```

## 4 · Los papeles que acompañan a un servicio (para el Frente 4 y el contador)

**Detener y confirmar con Felipe:** nada de esta sección describe una integración. Marca lo que, si aplicara, daría validez legal a un papel (guía de remisión electrónica). Aquí solo se verifica el texto de las normas.

```
H-2.14 · El papel que da un servicio depende del régimen del taller: factura, recibo por honorarios, boleta o nada
  Evidencia: B · SUNAT, página de orientación del Nuevo RUS: solo puede emitir boletas de venta y tickets, no facturas ni comprobantes con derecho a crédito fiscal (lectura resumida por la herramienta; la regla se repite en otras páginas de SUNAT) · B · SUNAT, Informe 118-2015 (16-sep-2015, procedimiento de drawback): la producción por encargo se acredita con recibo por honorarios si el prestador es persona natural, y con factura y contrato si es persona jurídica · B · SUNAT, informe de 2019 sobre qué debe decir el comprobante de una producción por encargo textil (copia de la sesión; número ilegible), que cita el Informe 012-2001: basta que el comprobante diga la característica del servicio, por ejemplo «servicio de costura» para confeccionar prendas · B · SUNAT, Informe 057-2017 (4-abr-2017) e Informe 082-2014 (25-sep-2014): una factura que solo diga «servicio de maquila» no basta para el drawback; SUNAT define maquila como el subprocesamiento de una parte de la producción (confección o ensamblaje a partir de piezas elaboradas o importadas, hasta empacar o etiquetar) y como pura mano de obra · B (cita de INEI y SUNAT dentro de una tesis) · tesis PUCP 2021 (Riofrío, Gamarra): 5.532 unidades productivas informales con local en Gamarra (INEI 2017) y 40 % de las operaciones sin comprobante (SUNAT 2017) · C · informe sectorial de la SNI (marzo 2021, datos ENAHO-INEI): en confecciones, las microempresas de 1 a 10 trabajadores tienen 88,7 % de empleo informal · consultada 2026-10-16
  Confianza: alta en lo que dice cada norma; media en cuántos talleres reales caen en cada caso · Aplica a: ambos
  Lo contradiría: que todos los servicios de CAYLA sean personas jurídicas que facturan con el servicio bien descrito
  Implicación: el supuesto «el proveedor dice si su papel lleva IGV» (ADR-0400) deja fuera la boleta, el recibo y el «sin papel»; R-07 (más del 30 % sin factura) tiene respaldo cualitativo (B), no cifra.
```

```
H-2.15 · Detracción: el 10 % sobre S/ 700 para «fabricación de bienes por encargo» está verificado, con dos matices
  Evidencia: B · SUNAT, página «Apéndices del Sistema de Detracciones» y página «En la prestación de servicios»: porcentaje 10 % para el numeral 7 del Anexo 3, desde el 01.01.2015; aplica si la operación supera S/ 700; deposita el usuario del servicio; no aplica si el comprobante no sirve para crédito fiscal (lectura resumida; página sin fecha, con referencia más reciente la RS 086-2025/SUNAT del 30-mar-2025) · B · RS 071-2018/SUNAT (28-feb-2018): sube a 12 % los numerales 1, 3, 5 y 10 del Anexo 3 (tercerización laboral, mantenimiento y reparación, otros servicios empresariales y demás servicios gravados), no el 7 · consultada 2026-10-16
  Confianza: alta en el 10 % y los S/ 700 para el numeral 7; baja en qué numeral le toca al bordado, al estampado y a la lavandería (podrían ser 10 % o 12 %) · Aplica a: ambos
  Lo contradiría: una tabla vigente de SUNAT que cambie el numeral 7 o el umbral (la mía es de la página de orientación, no del texto consolidado de la RS 183-2004)
  Implicación: confirma el dato de ADR-0400 «detracción 10 % si la operación pasa S/ 700»; lo que no confirma es que se aplique a cada fase tercerizada.
```

```
H-2.16 · La guía de remisión no se resuelve solo con «texto» si CAYLA o el taller transportan los bienes
  Evidencia: B · SUNAT, Informe 117-2003 (19-mar-2003): quien entrega insumos para su transformación y luego recoge el producto con su propio transporte debe emitir guía de remisión remitente; si un taller de confección recoge los insumos, debe emitirla también; es un informe sobre el reglamento anterior · B · SUNAT, anexo del catálogo de guías (RS 000240-2024/SUNAT, 12-nov-2024): existen los motivos de traslado 17 «traslado de bienes para transformación» y 07 «recojo de bienes transformados»; y su considerando recuerda que, según la RS 000123-2022, desde el 1-ene-2024 todos los sujetos deben emitir la guía en forma electrónica · consultada 2026-10-16
  Confianza: media (el informe es de 2003 y el reglamento se modificó después; los códigos sí son de 2024) · Aplica a: ambos
  Lo contradiría: una norma posterior que exonere el traslado de insumos a un servicio, o que el servicio recoja y devuelva sin que CAYLA transporte
  Implicación: matiza A3 y la hipótesis H9 («la guía es texto»); **detener y confirmar con Felipe y el contador** antes de decidir nada.
```

## 5 · Ecosistema, calendario y lo que sale mal

```
H-2.17 · No hay un censo citable de talleres de Lima, y la mitad de los confeccionistas sacó su taller de Gamarra a su casa
  Evidencia: C · nota de Infomercado (18-may-2022): según el presidente de la Asociación Peruana de Industriales Confeccionistas, unos 20 mil confeccionistas y la mitad se mudó de los locales de Gamarra a sus casas, en Villa El Salvador, San Juan de Lurigancho y Comas · C · nota de Gestión (26-may-2022): unos 2.000 microempresarios en el parque industrial de Villa El Salvador (todos los rubros) · C · informe sectorial de la SNI (marzo 2021): 93.861 unidades productivas de confecciones en el país en 2018, 99,9 % micro y pequeñas · C, sin abrir la fuente · CAF/ADEX 2008: unos 1.500 talleres pequeños y medianos de confección en Lima y más de 100 exportadoras (dato de un extracto del buscador; no pude abrir el PDF) · consultada 2026-10-16
  Confianza: media-baja (las cifras cuentan cosas distintas y no son comparables) · Aplica a: ambos
  Lo contradiría: un directorio municipal o de PRODUCE por actividad y distrito
  Implicación: no hay fuente que diga cómo se encuentra un servicio ni cómo se elige; es insumo para la pantalla de proveedores y no para ADR-0400; se pregunta.
```

```
H-2.18 · Hay dos temporadas con fuente (escolar y Navidad) y un taller que dice que las horas extras y la cola se concentran ahí; Día de la Madre y Fiestas Patrias quedaron sin fuente
  Evidencia: C · nota de Gestión (22-ene-2025): los pedidos de producción de uniformes escolares llegan desde fines de diciembre, sobre todo de provincias, y la campaña arranca con fuerza en la primera quincena de febrero · C · nota de Andina vía Perú Retail (4-dic-2019): los compradores de provincias compran sobre todo en octubre y noviembre · B · tesis de La Victoria 2022: las horas extras «son necesarias para cubrir la mayoría de pedidos que se genera por temporadas»; en temporadas bajas se trabaja con normalidad · B · tesis de Chiclayo 2023, Tabla 58: horas extras en los 4 meses de mayor demanda · B · tesis de Chiclayo 2019 (USAT, polo y buzo escolar): la empresa tercerizó en época escolar por no haber planificado · B · entrevistas de La Victoria 2022: «no puedes darte el lujo» de que una producción pase de dos, tres o cuatro semanas · C · artículo comercial (feb-2026): entrega de 7 a 21 días hábiles · consultada 2026-10-16
  Confianza: baja-media · Aplica a: taller de ~10 operarias
  Lo contradiría: un servicio de CAYLA con capacidad ociosa todo el año
  Implicación: la fecha prometida por un servicio (d.5, fase con `fecha_prometida`) debería leerse con la temporada; el plazo típico queda como «dato de Felipe pendiente».
```

```
H-2.19 · En un taller chico que sirve a una exportadora, el 27,6 % de lo inspeccionado volvió a reprocesarse y los reclamos de los clientes incluyen «tallas incompletas»
  Evidencia: B · artículo Pérez Gao Montoya, Industrial Data 20(2) (UNMSM, 2017), pp. 95-100: de 7.985 piezas inspeccionadas, 2.201 (27,6 %) tuvieron falla de costura: zurcido 14,9 %, composturas 12,7 % (recta 7,6, recubierto 3,0, remalle 2,1); tras aplicar controles bajó a 20,4 %; la exportadora tiene un «encargado de talleres externos» que audita; recomienda anotar a diario en una pizarra el avance y la calidad · B · tesis de La Victoria 2022 (entrevista 4): reclamos por prendas descosidas, fallas en cierres, acabado y tallas incompletas · consultada 2026-10-16
  Confianza: media (un taller, 2017; «reproceso» no es «segunda»: la prenda se arregla) · Aplica a: taller de ~10 operarias
  Lo contradiría: una medición propia del Taller que dé menos del 3 % (R-31)
  Implicación: R-31 («menos del 3 %») no tiene respaldo aquí para costura; afecta a H7 y H8 y a si «Falladas» necesita un estado entre «buena» y «segunda» (reproceso).
```

## 6 · Lo que quedó «externo, sin verificar»: estado de cada dato

| # | Dato de la investigación del 13-oct | Estado | Con qué |
|---|---|---|---|
| 1 | Corte S/ 0,50 a 0,60 por prenda (2014) | **sigue sin verificar** | No hay tarifa pública de corte, ni vieja ni vigente, en nada de lo abierto. Una tarifa de 2014 no era una tarifa de 2026 de todos modos |
| 2 | Bordado S/ 5 a 8 por prenda desde 12 unidades | **verificada (C)** | Ficha comercial del 15-mar-2025: S/ 8 desde 12 y S/ 5 desde 50; artículo de feb-2026: S/ 6 a 30. Rango compatible, no es encuesta |
| 3 | Ponchado S/ 30 a 60 por diseño | **verificada (C)** | Misma ficha: digitalización S/ 30 a 60 (el texto dice 30 a 80) |
| 4 | Serigrafía S/ 5 a 15 por polo más matriz | **verificada con matiz (C)** | Artículo de feb-2026: S/ 3 a 18 por prenda; página de serigrafía: el cuadro cuesta S/ 15 por color y el arte S/ 5. «Matriz» no es la palabra del oficio (ver glosario) |
| 5 | Lavandería (tarifa y mínimos) | **sigue sin verificar** | La página citada devolvió error 503. Solo hallé una tesis de 2011 sobre lavanderías de ropa de hogar, que dice que en Lima predomina el cobro por kilo: no sirve para lavado de prendas de fábrica |
| 6 | Condiciones de los talleres de Gamarra (página de un taller) | **sigue sin verificar** | El enlace murió (HTTP 410). La otra página citada es de un solo taller, sin precios ni mínimos ni plazos |
| 7 | Adelantos del 50 % «práctica de Gamarra» | **sigue sin verificar** | Ninguna fuente lo menciona |
| 8 | Paquetes de ~30 por talla y color; queja «que los paquetes vengan completos» | **sigue sin verificar** | Lo más cercano: paquetes de unas 40 prendas y lote medio de 200 (Bonilla 2007) y reclamos de «tallas incompletas» (La Victoria 2022) |
| 9 | Primera / segunda / incompletos y faltante = enviado − devuelto | **sigue sin verificar** | Solo aparecen «primeras y otros» y «reprocesos» (Industrial Data 2017). No hay fuente que defina el faltante así |
| 10 | Exportadoras de Lima descuentan el faltante al taller | **sigue sin verificar** | El Código Civil (art. 1774 n.º 3) le da base legal a cobrar la tela que el taller inutiliza por negligencia, pero no hay práctica documentada |
| 11 | Inspección en Lima: ~15 % zurcidos y ~13 % composturas frente a 1 % segundas | **verificada en lo primero (B)** | Industrial Data 2017: 14,9 % y 12,7 %. La cifra de 1 % de segundas **no aparece** en ese artículo |
| 12 | «El 95 % de las empresas trabaja por bultos» (d.1) | **verificada como cita, floja como dato (B)** | Está escrita en la introducción de Bonilla (2007), sin fuente propia ni muestra |
| 13 | Informe 057-2017 de SUNAT | **verificada** | Es del drawback (devolución a exportadores). Define maquila y pide describir el servicio en la factura. No trata de IGV ni de detracción |
| 14 | Informe 117-2003 de SUNAT | **verificada** | Trata de guías de remisión (H-2.16), no del IGV de la maquila |
| 15 | Detracción 10 % sobre S/ 700 en fabricación por encargo | **verificada (B)** | H-2.15; el numeral 7 trae una exclusión que importa |
| 16 | Informe 151-2006 de SUNAT (detracción) | **verificada** | La fabricación por encargo es servicio y entra al SPOT, aunque el encargante dé dinero |
| 17 | SUNAT, motivos de traslado (anexo 2024) | **verificada** | Códigos 17 y 07 existen |
| 18 | Catálogo MINEDU «costura y acabados» | **verificada** | Define qué es acabado (H-2.4). No dice nada de qué se manda a servicio |
| 19 | Tesis PUCP sobre el corte | **verificada** | Es de una exportadora de 995 trabajadores, no de un taller chico |
| 20 | APTT, «calidad post costura» | **verificada** | Artículo del 10-dic-2025, sin cifras |
| 21 | Ficha SENATI: «corte – habilitado – bordado – confección – acabado» | **sigue sin verificar** | El enlace vive pero mi herramienta no pudo leerlo. Las tesis de la sección 1 dan una ruta parecida |
| 22 | Tesis UNMSM «talleres externos» | **sigue sin verificar** | Error de certificado del sitio; no se pudo abrir |
| 23 | CAF/ADEX, «La confección del progreso» | **sigue sin verificar** | PDF sin texto legible para mi herramienta; solo vi su ficha vía buscador (2008, ~1.500 talleres en Lima) |
| 24 | «El oficio dice servicio, no maquila» | **verificada con matiz (B)** | El taller de La Victoria dice «servicio de confección»; la microempresa de Arequipa «servicio prestado por terceros»; SUNAT usa «servicio de costura» como ejemplo de buena descripción. Pero SUNAT, la academia y las exportadoras sí dicen «maquila» |
| 25 | Se manda a servicio confección, bordado, estampado, lavandería y acabado | **verificada en parte (B)** | Confección, corte, bordado y estampado: sí (UNMSM 2007, Arequipa 2021). Lavandería: sin fuente peruana. Acabado: solo un caso (botones adentro de lo que vuelve) |
| 26 | La maquila «recibe las prendas cortadas y habilitadas y las entrega cosidas» | **verificada en parte (B)** | Recibe «cortes» (La Victoria 2022) o «prendas cortadas» (Arequipa 2021); «habilitadas» no lo dicen así |
| 27 | Se cobra por prenda: minutos × valor minuto | **verificada en parte (B)** | Hoja por operación y total por prenda; costo por minuto en una tesis (S/ 0,12 de 2019). No es un valor minuto de mercado |
| 28 | Jersey 24/1 rinde ~3 m por kilo | **sigue sin verificar** | La página citada (Textil Telar) no trae esa cifra ni la conversión; es del Frente 3 |
| 29 | Control de calidad como fase propia «así lo hacen Topitop y las fichas del MINEDU» | **sigue sin verificar** | El único programa MINEDU abierto (costura y acabados) no lo lista como fase |

## 7 · Veredictos sobre H2, H3 y H4

| Hipótesis | Veredicto | Lo que sostiene el veredicto |
|---|---|---|
| **H2** Espina Corte · Costura · Acabado; trazo, tendido y habilitado dentro de Corte | **matiza** | Confirma: tendido, corte, fusionado y habilitado juntos (H-2.1) y acabado como hilos, planchado, etiquetas y empaque (H-2.4). Matiza: el trazo viene a veces de Planeamiento (H-2.2); «habilitar» cruza fases (H-2.3); «acabados» tiene dos sentidos (H-2.4); ojales y botones es un servicio que no cabe en la lista (H-2.8) |
| **H3** Tercerizar es una fase entera con un quién; no se reparte | **matiza** (más cerca de contradice) | En los picos lo habitual es partir el volumen (H-2.6, H-2.7); sin evidencia de que el caso sea raro. Sí hay evidencia de que quién pone la tela cambia la naturaleza del servicio (H-2.9). «Para repartir, dos órdenes» sigue siendo posible; el costo es fricción en campaña |
| **H4** Por prenda, con mínimo (150-240) y fijo opcional | **matiza** | Confirma: por prenda terminada (H-2.11) y fijo en bordado y serigrafía (H-2.12). Matiza: el mínimo es un escalón de precio que varía por servicio (de 3 a 12 unidades en fichas comerciales; tandas de 75 en un pedido de costura). Sin evidencia: adelantos y garantías |

## 8 · Contraejemplos (uno por frente es el mínimo; hay seis)

1. **H3:** el taller de La Victoria dice que no se compromete con otros clientes porque conoce su capacidad (H-2.10). Es un servicio que no se parte: o hay cupo o no.
2. **H3:** una empresa de Arequipa produce el mismo abrigo en planta y afuera a la vez (H-2.7).
3. **H4:** una serigrafía acepta 3 unidades (H-2.12), contra el «no hacen servicio de 1 o 5» de Felipe.
4. **H4/H1:** 8 % de asalariados por pieza (OIT) contra 40 % (UNMSM 2007) (H-2.13): según a quién se mida, «por prenda» es raro o dominante.
5. **H2:** la planta de 2014 interna el bordado porque antes «llegaba como insumo» de un tercero (tesis PUCP, p. 40); lo que sale a servicio cambia con el tamaño de la empresa.
6. **R-31:** reprocesos de 20 a 28 % en un taller de costura (H-2.19), contra «menos de 3 %».

## Lo que no encontré

- **Tarifa de corte** (ninguna, ni vieja ni de 2026) y **de lavandería** de prendas. Tampoco de plisado, ojales y botones en Lima (solo S/ 0,20 por camisa en Chiclayo, 2019).
- **Adelantos, garantías y penalidades** con talleres peruanos. Lo único: el Código Civil (art. 1774 n.º 3) sobre materiales inutilizados por el contratista.
- **Mínimos de costura** en Lima. Solo un pedido de 75 unidades por estilo en Arequipa y un taller que pide muestra para fijar fecha.
- **Cómo se encuentra y se elige un servicio** en Gamarra o Villa El Salvador. No hay directorio, ni encuesta, ni guía.
- **Un taller de servicio de Lima con sistema de registro por talla y color.** Todos los casos son cuaderno, hoja de precios, WhatsApp y pizarra.
- **Calendario de Día de la Madre y Fiestas Patrias** en talleres.
- **Cuántos talleres usan destajo con sus operarias** en Lima hoy (la encuesta de 2007 es la única medición y no distingue unidad).
- **Contenido de CAF/ADEX 2008, SENATI y UNMSM «talleres externos»**: no se pudieron abrir.
- **Lo que quedó sin buscar por el tope de búsquedas:** DTF y sublimado como servicio, ropa técnica, el efecto de la emergencia textil de 2026 (decreto de 120 días, nota de Forbes Perú del 13-oct-2026) sobre la capacidad de los talleres.

## Preguntas que solo CAYLA puede contestar

**Para Felipe o la encargada del Taller** (en lenguaje de tienda; el tipo va entre paréntesis):

1. Cuando mandas coser, ¿quién pone la tela: tú mandas las piezas ya cortadas, o el taller compra la tela y te devuelve la prenda hecha? ¿Pasa de las dos formas? (**HECHO**)
2. ¿Alguna vez, en campaña, la costura de un mismo modelo se reparte entre dos talleres, o una parte se cose en el Taller y otra afuera? ¿Cuántas veces al año? (**HECHO**)
3. De todo lo que sale hoy del Taller, ¿qué es exactamente y a cuántos lugares distintos? Corte, costura, bordado, estampado, lavado, ojales y botones, planchado, etiquetas. (**HECHO**)
4. Cuando un servicio te entrega, ¿qué papel te da: factura, boleta, recibo, nota o nada? ¿Y qué papel viaja con la mercadería cuando va y cuando vuelve? (**HECHO**)
5. ¿Cuántas personas cortan, cosen y acaban hoy en el Taller y cómo se le paga a cada una: sueldo, por prenda o por recibo? (**HECHO**)
6. ¿Cuál es el mínimo de prendas que te pide cada servicio, y baja el precio si pides más? ¿Hay algo que se cobre una sola vez por diseño? (**HECHO**)
7. ¿Le adelantas dinero a algún servicio antes de que entregue? ¿Cuánto y cuándo? (**HECHO**)
8. ¿Cómo se anota hoy lo que sale y lo que vuelve: cuaderno, WhatsApp, Excel, fotos? ¿Quién lo anota y cuándo? (**HECHO**)
9. Cuando vuelve un lote y trae prendas mal hechas, ¿qué pasa con cada una: se devuelve para arreglar, se arregla en el Taller, se vende de segunda o se descuenta al servicio? (**HECHO**)
10. ¿Cuántos días pasan hoy desde que sale el corte hasta que vuelve cosido, y cuántos en campaña? (**HECHO**)
11. ¿Quién hace la marcada (la tizada del Audaces) de cada modelo y cuándo: el Taller, quien diseña o un servicio? (**HECHO**)
12. ¿Cómo se llama cada paso en el Taller y quién lo hace? Una foto de la hoja o del cuaderno basta. (**HECHO**)
13. ¿Cómo encuentras un servicio nuevo y qué miras antes de darle trabajo? (**HECHO**)
14. ¿En qué meses el Taller y los servicios están más llenos y con cuánta anticipación hay que pedir? (**HECHO**)
15. En pantalla, a quien cose o borda afuera, ¿lo llamamos «servicio», «taller» o «proveedor»? (la prueba ciega no entendió «maquila»). (**DECISIÓN**)
16. Cuando un servicio no da factura, ¿quieres que el costo igual cuente en la orden y quede marcado «sin factura»? (**DECISIÓN**)
17. Si en campaña un modelo se reparte entre dos servicios, ¿prefieres abrir dos órdenes o una sola que diga cuántas prendas fue a cada uno? (**DECISIÓN**, reabre d.3)

**Preguntas para el contador** (hechos tributarios que no se afirman aquí):

- Cuando CAYLA entrega prendas ya cortadas, tela o prendas terminadas a un servicio (costura, bordado, estampado, lavandería, ojales), ¿qué numeral del Anexo 3 corresponde a cada uno: «fabricación por encargo» al 10 % u otro al 12 %?
- Si el servicio es persona natural del Nuevo RUS y da boleta, ¿esa boleta sustenta el gasto o el costo? ¿Qué pasa con los S/ 700 y la detracción?
- Si el servicio da recibo por honorarios en vez de factura, ¿cómo se trata?
- ¿Hay una obligación de pagar por el banco a servicios pequeños a partir de cierto monto?
- ¿Se emite guía de remisión en la ida y la vuelta de una Salida y una Vuelta cuando transporta CAYLA, y cuando transporta el taller? (comparte pregunta con el Frente 4)

## Fuentes

Nivel: **B** documento primario o tesis y artículos citables; **C** nota de prensa, informe de segunda mano o ficha comercial. Todas consultadas el **2026-10-16**. «Copia de la sesión» = el archivo ya estaba descargado por la herramienta de lectura de la sesión y no tengo la URL.

| Nivel | Fuente | URL | Notas |
|---|---|---|---|
| B | Tesis PUCP, «Análisis y mejora de procesos en una empresa textil empleando la metodología DMAIC», Ordóñez y Torres, 2014 | https://tesis.pucp.edu.pe/server/api/core/bitstreams/3093332f-4f9c-4eb8-baea-0b0cbf9e5d5e/content | Vivo; PDF escaneado, leído como imagen |
| B | Texgroup S.A.: «Mejora en la eficiencia y en el ambiente de trabajo», Herrera, Ingeniería Industrial n.º 36, U. de Lima, 2018 | https://doi.org/10.26439/ing.ind2018.n036.2445 | Copia de la sesión |
| B | «Diseño de un sistema de producción modular en una mediana empresa de confecciones», Bonilla, Ingeniería Industrial n.º 25, U. de Lima, 2007 | http://www.redalyc.org/articulo.oa?id=337460076001 | Copia de la sesión |
| B | «Mejora en los procesos de tizado y corte en una empresa de tejido de punto», Camborda, Industrial Data 26(2), UNMSM, 2023 | https://doi.org/10.15381/idata.v26i2.24002 | Copia de la sesión |
| B | «Implementación de herramientas de control de calidad en MYPEs de confecciones», Pérez Gao, Industrial Data 20(2), UNMSM, 2017 | http://www.redalyc.org/articulo.oa?id=81653909013 | Copia de la sesión |
| B | Tesis UNMSM, «Desarrollo de las pymes en el mercado exportador, sector confecciones», Miranda Herrera, 2007 | URL no registrada | Copia de la sesión; los gráficos se leyeron como imagen |
| B | Tesis UCSP Arequipa, «Proyecto de inversión… fábrica de confección de ropa basada en la filosofía low cost», Farfán, 2021 | https://repositorio.ucsp.edu.pe/backend/api/core/bitstreams/b0c6bfc8-839c-4b7c-86f7-9b5666ac5504/content | Vivo; Anexo 16 son capturas, leídas como imagen |
| B | Tesis UCSM Arequipa, «Propuesta de aplicación de técnicas del estudio del trabajo… línea de confección de abrigos», Gamarra Pérez, 2021 | URL no registrada | Copia de la sesión |
| B | Tesis de licenciatura, «Gestión de procesos para mejorar la productividad en un taller de confección, Lima 2022», Ayala Ayala | URL no registrada | Copia de la sesión; entrevistas a cuatro responsables de un taller de La Victoria |
| B | Tesis USAT Chiclayo, «Propuesta de mejora del proceso productivo de camisas… (empresa de Chiclayo)», Santisteban, 2023 | URL no registrada | Copia de la sesión |
| B | Tesis UPeU, «Sistema de costos por órdenes específicas… sector confección, Arequipa 2021», Castrillo y De la Cruz | URL no registrada | Copia de la sesión; tres entrevistas |
| B | Tesis USAT Chiclayo, «Planificación y control de la producción… Todo Sport para reducir la tercerización», 2019 | https://alicia.concytec.gob.pe/vufind/Record/USAT_fe9f8b5d580ab3dbe64ae80c393a174a/Details | Solo el resumen |
| B | Tesis PUCP, «Propuesta de articulación de redes productivas… Gamarra», Riofrío, 2021 | https://repositorio.pucp.edu.pe/index/handle/123456789/179894 | Solo el resumen; texto completo restringido |
| B | OIT/IFC, «Piece rate pay and working conditions in the export garment sector», Borino, documento de debate 28, 2018 | URL no registrada | Copia de la sesión |
| B | Medina, «El cambio en la estructura de la industria de confección en Colombia, la subcontratación…», Civilizar 16(30), 2016 | http://www.redalyc.org/articulo.oa?id=100246672008 | Es de Colombia; solo para la distinción maquiladora / paquete completo |
| B | MINEDU, Catálogo Nacional de la Oferta Formativa, «Costura y acabados» (2018, doc. de 2020) | https://www.minedu.gob.pe/superiortecnologica/pdf/catalogo/actual/industria-manufacturera/fabricacion-prendas-de-vestir/costura-y-acabados-publicado-18-12-2018.pdf | Vivo |
| B | SUNAT, Informe 057-2017-SUNAT/5D1000 (4-abr-2017) | https://www.sunat.gob.pe/legislacion/oficiosAd/2017/informes/2017-INF-057-5D1000.pdf | Vivo; escaneado, leído como imagen |
| B | SUNAT, Informe 082-2014-SUNAT/5D1000 (25-sep-2014) | https://www.sunat.gob.pe/legislacion/oficiosAd/2014/informes/2014-INF-082-5D1000.pdf | Vivo; escaneado |
| B | SUNAT, Informe 118-2015-SUNAT/5D1000 (16-sep-2015) | https://www.sunat.gob.pe/legislacion/oficiosAd/2015/informes/2015-INF-118-5D1000.pdf | Vivo; el número sale del título del PDF |
| B | SUNAT, informe de 2019 sobre el comprobante de la producción por encargo textil (cita el Informe 012-2001) | URL no registrada | Copia de la sesión; número ilegible |
| B | SUNAT, Informe 117-2003-SUNAT/2B0000 (19-mar-2003) | https://www.sunat.gob.pe/legislacion/oficios/2003/oficios/i1172003.htm | Vivo |
| B | SUNAT, Informe 119-2006-SUNAT/2B0000 (16-may-2006) | https://www.sunat.gob.pe/legislacion/oficios/2006/oficios/i1192006.htm | Vivo |
| B | SUNAT, Informe 151-2006-SUNAT/2B0000 (14-jun-2006) | https://www.sunat.gob.pe/legislacion/oficios/2006/oficios/i1512006.htm | Vivo |
| B | SUNAT, «Apéndices del Sistema de Detracciones» | https://orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones | Vivo; sin fecha |
| B | SUNAT, «En la prestación de servicios» (detracciones) | https://orientacion.sunat.gob.pe/3142-03-en-la-prestacion-de-servicios-empresas | Vivo; sin fecha, última referencia RS 086-2025 |
| B | RS 071-2018/SUNAT (28-feb-2018) | copia de la sesión | |
| B | SUNAT, Nuevo RUS (orientación) | https://orientacion.sunat.gob.pe/nuevo-regimen-unico-simplificado-nuevo-rus | Vivo; lectura resumida |
| B | SUNAT, anexo del catálogo de guías de remisión (RS 000240-2024) | https://www.sunat.gob.pe/legislacion/superin/2024/anexo1-000240-2024.pdf | Vivo |
| B | SUNAT, tabla PLAME de ingresos, tributos y descuentos (oct-2025) | https://orientacion.sunat.gob.pe/sites/default/files/inline-files/Tabla%20N22%20Definici%C3%B3n%20Conceptos%20Plame_011025.pdf | Vivo |
| B | SUNAT, régimen laboral MYPE | https://www.sunat.gob.pe/orientacion/mypes/regimenLaboral.html | Vivo; solo contexto |
| B | Hernández Berenguel, «Entrega de bienes a contratistas…», Foro Jurídico, PUCP | URL no registrada | Cita los arts. 1771, 1773, 1774 y 1788 del Código Civil; es doctrina, no el texto de la ley |
| C | APTT, «Calidad post costura» (10-dic-2025) | https://apttperu.com/calidad-post-costura-estrategias-para-la-competitividad-textil-peruana/ | Vivo |
| C | Ficha comercial de estampado y bordado en Lima (15-mar-2025) | https://www.chromaestampados.com/blog/cuanto-cuesta-estampar-polos-lima-precios | Vivo |
| C | Página comercial de serigrafía (copyright 2026) | https://polospublicitarios.pe/estampado/estampados-de-polos/ | Vivo; sin fecha |
| C | Artículo comercial de polos corporativos (20-feb-2026) | https://drigo.pe/blog/polos-corporativos-en-peru-tipos-telas-y-precios-actualizados-2026/ | Vivo |
| C | Textil Telar, consumo de tela por prenda (2026) | https://textiltelar.com/consumo-tela-produccion-prendas/ | Vivo; no trae la cifra de jersey 24/1 |
| C | Infomercado (18-may-2022), confeccionistas de Gamarra | https://infomercado.pe/confeccionistas-de-gamarra-llevan-sus-talleres-a-sus-viviendas-180522-gb/ | Vivo |
| C | Gestión (26-may-2022), parque industrial de Villa El Salvador | https://gestion.pe/economia/empresas/fabricantes-de-villa-el-salvador-buscan-competir-con-retailers-noticia/ | Vivo |
| C | Gestión (22-ene-2025), campaña escolar de Gamarra | https://gestion.pe/economia/campana-escolar-2025-gamarra-se-alista-y-amplia-oferta-con-telas-hipoalergenicas-precios-y-tendencias-emporio-comercial-noticia/ | Vivo |
| C | Perú Retail, campaña navideña de Gamarra (4-dic-2019) | https://www.peru-retail.com/gamarra-recibira-medio-millon-de-personas-por-dia-en-campana-navidena/ | Vivo |
| C | Informe sectorial de la SNI, «Industria textil y confecciones» (IEES, marzo 2021), con datos ENAHO-INEI | URL no registrada | Copia de la sesión |
| C | Forbes Perú (13-oct-2026), exportaciones de prendas y emergencia textil | https://forbes.pe/economia-y-finanzas/2026-10-13/exportacion-de-prendas-de-vestir-cayeron-57-entre-enero-y-agosto-impactada-por-aranceles-de-ee-uu/ | Vivo; solo contexto |
| C | CAF/ADEX, «La confección del progreso» (2008) | https://scioteca.caf.com/handle/123456789/437 | **Vivo, no pude leerlo**; el dato de ~1.500 talleres viene de un extracto del buscador |
| C | Página de un taller de Gamarra con condiciones comerciales (se omite el nombre del negocio) | fabricantes.gamarra.com.pe, ficha del taller | **Enlace muerto (HTTP 410)** |
| C | Página de un taller de Gamarra, bordado | https://fabricantes.gamarralima.com/servicio-de-bordado | Vivo; sin precios |
| — | Manual SENATI | https://www.senati.edu.pe/sites/default/files/escritorio/Comunicados/PUBLICACIONES-19/manual-uniforme-senati-act.pdf | **No se pudo leer** (error de cabecera) |
| — | Tesis UNMSM «talleres externos» | https://eventosindustrial.unmsm.edu.pe/upg_old/archivos/TESIS2018/MAESTRIA/tesis8.pdf | **No se pudo abrir** (error de certificado) |
| — | Norma de competencias de SINEACE, industria textil | https://cdn.www.gob.pe/uploads/document/file/1229531/Anexo-Resoluci%C3%B3n-N_061-2016-DEC-IEES-Normas-Industria-textil20200812-2906259-1wgodyh.pdf | **No se pudo abrir** (HTTP 403) |
| — | Industrial Rivero (lavandería) | https://www.industrialrivero.com/ | **No se pudo abrir** (HTTP 503) |
