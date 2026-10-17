# 12 · Escéptico: se intentó romper lo más importante del informe

**Frente 10 · 2026-10-16 · solo lectura.** Tomé las afirmaciones que más pesan en `README.md` y `09-contraste-con-adr-0400.md`, busqué lo que las contradiga, revisé que la letra de evidencia fuera la que corresponde y marqué las que dependen de una sola fuente de nivel C. Después revisé las reglas del brief (no diseñar, no datos reales de CAYLA, no hechos fiscales sin fuente, nada ya contestado sin REABRE, vocabulario) **y apliqué las correcciones en los archivos** (lista al final).

**Letras:** **A** medido en la base o el repo · **B** fuente primaria · **C** secundaria · **D** lo dijo Felipe y está escrito · **E** inferencia.

## Cómo trabajé y qué límites tuvo

- **No pude buscar fuentes nuevas.** La cuota de `WebSearch` (200 por turno, compartida entre todos los agentes) ya estaba agotada cuando llegué: las dos búsquedas que intenté fueron rechazadas, y no la rodeé. Por eso «buscar la fuente que contradiga» se redujo a **abrir directamente las normas y las fuentes citadas** (con `WebFetch`) y a **volver a consultar la base**. Una contradicción que solo se encuentra buscando (otro estudio, otro informe de SUNAT) queda sin descartar y está en «Lo que no encontré».
- **Los PDF de SUNAT y de las tesis llegan comprimidos** a la herramienta de lectura, que no los entiende. La herramienta los dejó en su carpeta temporal y yo los convertí a texto con `pdftotext` en el scratchpad de la sesión (nada se guardó en el repo; no descargué nada a propósito). Así pude releer el Reglamento de Comprobantes de Pago, la Tabla I y las tesis, que el Frente 9 no había podido abrir.
- **Base de producción (`cayla-dynamic`, schema `retail`): solo `SELECT`**, con conteos y definiciones de funciones; no copié nombres ni montos.

## Veredicto en seis líneas

1. **Lo más pesado aguanta:** la guía de remisión, su sanción, la detracción y los huecos del propio sistema se comprobaron en el texto de la norma o en la base viva. Ninguna de las 18 afirmaciones revisadas quedó **refutada**.
2. **Once afirmaciones o cifras se decían más fuerte que su respaldo y las corregí o las acoté** (algunas son del top 12 y otras de afuera: la cifra de la tesis de camisas, el plazo, «pagar por prenda es lo normal» y «los talleres de Lima llevan un cuaderno», que descansan en pocas fuentes y en un solo taller): «en Lima no hay norma sobre faltantes» (de «contradice» a «matiza»); «el descuento se lee como venta de tela» (un solo artículo, con casos de minería); el límite inferior «8 %» de las prendas que se arreglan (no tenía fuente: pasa a 10 %); la merma de tela «medida en casos peruanos» (son tres referencias débiles); el sobrecorte de 10 % «no lo típico» (la fuente más cercana a una marca chica dice que 5 a 10 % sí lo es); la comparación del ojal y botón «más que toda la sala de corte» (un día de calendario puesto como cifra fija contra minutos de trabajo); la tela perdida de 4,7 % de la tesis de camisas (solo cuenta los meses con error y la división da 4,9 %); «devuelve toda la tela» (es la anotada como usada); la sensibilidad 13 a 51 del plazo (nota de sesión sin versionar); «pagar por prenda es lo normal»; y «los talleres de Lima llevan un cuaderno».
3. **Tres del top 12 siguen apoyándose en una sola fuente C** (Código Civil vía un artículo, descuento = venta, sobrecorte de 10 % como techo). Ya están dichas así en `README.md` y `09`. Fuera del top 12, la sensibilidad del plazo (13 a 51 modelos) solo consta en una nota de sesión que no está en el repo. El criterio «no más de dos sin respaldo» **no se cumple** si se cuentan las que descansan en una sola fuente C; sí se cumple si se cuentan las que no tienen ningún respaldo (ninguna).
4. **Hubo dos errores de letra:** el Código Civil (leído en un artículo) aparecía como B en `07` y B/C en `09`, y una cifra del INEI procesada por un gremio aparecía como B en `08`; las dos pasaron a C. El total «123 con evidencia B o mejor» pasó a 121.
5. **Un matiz que cambia una conclusión:** el Reglamento dice que, aun cuando la guía la emita el servicio, para las multas del art. 174 n.º 8 a 10 del Código Tributario se considera remitente al dueño de los bienes. El contraejemplo «si el servicio recoge y entrega, basta el texto» queda más débil de lo que decían `04` y `09`.
6. **Reglas del brief:** ningún archivo diseña pantallas, tablas ni migraciones; encontré **una** palabra vetada del vocabulario (la forma femenina de «cliente», en el glosario; corregida), conteos de planilla demasiado finos (generalizados), tres nombres de negocios en enlaces o títulos, cinco apariciones (retirados) y **una** pregunta del banco que repetía lo ya decidido sin marcarse (P-36, marcada REABRE).

## Las 12 afirmaciones más importantes

*(Formato de la sección 7 del brief, más «Veredicto» y «Acción». Veredicto: **sostiene** / **débil** (se apoya en menos de lo que decía) / **refutada**.)*

**H-10.1 · Mandar tela, piezas o prendas a un servicio exige que CAYLA, como dueña, emita una guía de remisión remitente antes de mover la mercadería (motivo 17 de ida, 07 de vuelta).**
  Veredicto: **sostiene.**
  Evidencia: B · Reglamento de Comprobantes de Pago, Capítulo V (PDF de SUNAT convertido a texto): art. 17.1 (la guía sustenta el traslado entre distintas direcciones), 17.5 (se emite antes del traslado), 18.1 (la emite el propietario o poseedor al inicio del traslado «con ocasión de ... prestación de servicios que involucra o no transformación del bien»); Informe SUNAT 117-2003, conclusión 3 (quien entrega insumos para transformarlos y recoge el producto emite la guía remitente, con transporte privado o público); RS 240-2024, considerandos (desde el 2024-01-01 todos los sujetos emiten la guía en forma electrónica); la página de orientación de SUNAT lista «traslado de bienes para transformación» entre los motivos y no menciona excepciones por monto ni peso · consultadas 2026-10-16
  Confianza: alta en el texto; media en cómo aplica a cada traslado de CAYLA · Aplica a: ambos
  Lo contradiría: una norma de 2025 o 2026 que exceptúe el traslado a transformación (no la pude buscar); un contrato en que el servicio recoja y entregue (ver el matiz de abajo)
  Matiz hallado: desde la RS 123-2022 el Capítulo V se titula «guías de remisión en formatos impresos o importados» y la guía electrónica se rige por esa resolución. El último párrafo del art. 18.1 dice que, si la guía la emite el prestador de servicios, para las infracciones del art. 174 n.º 8 a 10 se considera remitente al dueño de los bienes.
  Implicación: mantiene «contradice» sobre A3 y d.4 de ADR-0400; sigue siendo **detener y confirmar con Felipe y el contador**.
  Acción: añadí el texto releído y el matiz al H-4.1 y al H-4.4 de `04`, al contraejemplo 1 de `09` y a la pregunta 5 del contador.

**H-10.2 · Mover mercadería sin guía cuesta el comiso o el 15 % de su valor, con tope de 6 UIT.**
  Veredicto: **sostiene.**
  Evidencia: B · Código Tributario, Tabla I (PDF de SUNAT convertido a texto): art. 174 n.º 8, «remitir bienes sin portar ... la guía de remisión» (o sin haberse emitido la electrónica), sanción de comiso; nota (7): la multa que sustituye al comiso es el 15 % del valor de los bienes, con tope de 6 UIT y de 6 UIT si no se determina el valor · consultada 2026-10-16
  Confianza: alta · Aplica a: ambos
  Lo contradiría: una gradualidad o rebaja posterior que no vi; esa Tabla I es la de las personas con renta de tercera categoría (incluido el régimen MYPE tributario), no la de otros regímenes
  Implicación: dimensiona el riesgo de H9; no cambia ninguna decisión.
  Acción: precisado en H-4.5 de `04`.

**H-10.3 · La detracción de «fabricación de bienes por encargo» es del 10 % si la operación pasa de S/ 700, y no corre si CAYLA solo entrega avíos o solo diseños.**
  Veredicto: **sostiene** en la tasa, el umbral y las exclusiones; **débil** en la multa del 50 % y la oportunidad del depósito (su texto es una versión vieja).
  Evidencia: B · SUNAT, «En la prestación de servicios» (numeral 7 del Anexo 3: 10 %, operaciones mayores a S/ 700, y la última modificación que muestra es la RS 086-2025 del 2025-03-30, que no toca el numeral 7); RS 056-2006 (no es fabricación por encargo si el usuario entrega solo avíos textiles o solo diseños); Informe 151-2006 (es un servicio, y el dinero que se da para comprar insumos cuenta como bien). La multa del 50 % sale del TUO del DL 940 en la página de SUNAT, que dice estar **actualizada al 20 de junio de 2012** · consultadas 2026-10-16
  Confianza: alta para 2025; media para octubre de 2026 · Aplica a: ambos
  Lo contradiría: una resolución de 2026 sobre el numeral 7 (no la pude buscar)
  Implicación: confirma S2a de ADR-0400; «el ERP solo avisa» sigue siendo práctica y no norma (S2c).
  Acción: aviso de la fecha del texto añadido en H-4.9 de `04`; el 50 % y la oportunidad del depósito van también al contador.

**H-10.4 · «En Lima no hay norma sobre faltantes» no se sostiene: el Código Civil trae reglas para la tela que el servicio inutiliza.**
  Veredicto: **débil** como «contradice»; **sostiene** como «matiza».
  Evidencia: C · Hernández Berenguel (Foro Jurídico, PUCP), que cita el art. 1773 (los materiales los provee el comitente salvo pacto o costumbre), el 1774 n.º 3 (el contratista paga los materiales que inutiliza por negligencia o impericia) y el 1788 (si la obra se pierde sin culpa, el contratista devuelve los materiales que no se perdieron; el artículo transcribe el 2.º párrafo). Comprobé que el artículo dice eso; **no pude abrir el texto de la ley** (la dirección de SPIJ que probé dio 404) · consultado 2026-10-16
  Confianza: baja a media · Aplica a: ambos
  Lo contradiría: un contrato escrito con el servicio (el art. 1773 admite pacto); o que la maquila de CAYLA no sea contrato de obra
  Implicación: matiza el supuesto de faltantes de ADR-0400: esas reglas hablan de la **tela**, no fijan una tolerancia de **prendas** faltantes.
  Acción: «contradice» pasó a «matiza» en `09` (fila S1b, resumen y tabla de estado) y en `README.md`; la letra B/C pasó a C en `07`, `09` y `11`.

**H-10.5 · Si le descuentas la tela a un servicio en su factura, puede leerse como venta de tela.**
  Veredicto: **débil.**
  Evidencia: C · el mismo artículo comenta dos resoluciones del Tribunal Fiscal (05475-4-2003 y 07718-3-2007) en que el Tribunal vio una venta gravada cuando se facturaba el valor neto o se descontaba lo entregado; **los dos casos son de contratistas mineros y de explosivos y combustibles**, no de tela. El Informe SUNAT 082-2006 (B) trata de combustible en una obra, concluye que esa entrega no es operación gravada y **no menciona descuentos** · consultados 2026-10-16
  Confianza: baja a media · Aplica a: ambos
  Lo contradiría: una resolución sobre confección, o un criterio de SUNAT sobre descuentos en maquila
  Implicación: S1c de ADR-0400 y la opción «Cobrar por escrito» de P-18: el riesgo existe por analogía, no por un caso de tela.
  Acción: reescrito en `README.md` (sorpresa 4), `04` (veredicto 4, H-4.12), `09` (S1c, H-9.8) y `11` (P-18); la fuente de segunda mano quedó marcada «una sola».

**H-10.6 · «Se pierde menos de 3 %» no se sostiene en tela: los huecos entre moldes son 10 a 21 % en casos peruanos.**
  Veredicto: **sostiene** la dirección; **débil** la cifra peruana.
  Evidencia: B · Zhezhova 2019 (pantalones con CAD): el texto da, en el pedido A, 71,7 a 71,8 % de utilización con marcadas de una talla y 78,8 a 79,0 % con varias tallas (o sea 21 a 28 % del área sin usar); en el pedido B solo dice que las marcadas de varias tallas rinden en promedio unos 4,5 % más que las de una talla; el 83,7 % que citó el Frente 3 está en las tablas 7 y 8, que son imágenes y no pude releer. B · LACCEI 2023: el 20,78 % es el pesaje de **una** plancha de licra (322,5 g a 255,5 g), un tejido de punto, y el 10,48 es tras reaprovechar retazos. B · tesis UCSM 2021: el resumen dice 20 % de merma de la materia prima en corte (abrigos de alpaca, tejido plano). C · USAT 2021: ~9,93 % de 27 mypes, de segunda mano, que no abrí · consultadas 2026-10-16
  Confianza: baja a media · Aplica a: planta grande y taller de ~10 operarias
  Lo contradiría: una medición de un taller de camisas o blusas con menos de 5 % de hueco (no la encontré)
  Implicación: R-31 y H8: el 3 % no puede ser el hueco entre moldes.
  Acción: «medida en casos peruanos» cambió a «referencias peruanas débiles» en `03` (resumen, tabla, H-3.7, H-3.2), `09` y `README.md`.

**H-10.7 · Entre 8 y 28 % de las prendas de talleres peruanos de costura se arreglan.**
  Veredicto: **débil** en el extremo bajo; **sostiene** en el alto.
  Evidencia: B · Pérez Gao 2017 (Industrial Data), releído: se inspeccionaron 7.985 piezas en 16 órdenes, 2.201 (27,6 %) con falla de costura (14,9 % zurcidos; 12,7 % composturas) y 20,4 % tras la mejora, en un taller de Lima que trabaja para una exportadora. B · tesis UNP 2021: 24,28 % (solo la ficha). C · tesis de una fábrica: 10 a 20 %. **El «8 %» venía de un resumen de buscador que el propio `07` (H-7.7) declara no usar como dato.** · consultadas 2026-10-16
  Confianza: alta para 20 a 28 %; baja para 10 a 20 % · Aplica a: taller de ~10 operarias
  Lo contradiría: un taller con inspección en línea y menos de 5 % de fallas
  Implicación: H8: separar «reparar» de «perder».
  Acción: «8» pasó a «10» en `07` (resumen 5, H-7.7, veredicto H8, contraejemplo 1), `09` (fila 5, H8, H-9.4), `11` (P-25) y `README.md`, con la letra que le toca a cada tramo.

**H-10.8 · La planilla del Taller bajó de 6 a 5 a 3 personas: no hay base para «10 operarias».**
  Veredicto: **sostiene** (con el límite que el informe ya dice: son personas pagadas, no necesariamente operarias).
  Evidencia: A · `retail.planilla_por_sede`, sede de tipo Taller, tres períodos seguidos (28-jun a 27-sep): 6, 5 y 3 personas · `SELECT` del 2026-10-16
  Confianza: alta en el dato; media en cuánta gente trabaja de verdad · Aplica a: CAYLA
  Lo contradiría: gente del Taller fuera de la planilla de Dynamic
  Implicación: d.1 de ADR-0400: «10 operarias» no describe el Taller de hoy.
  Acción: ninguna en la cifra; generalicé los conteos de bonos y sobretiempo (ver la regla (b), más abajo).

**H-10.9 · Cancelar una orden devuelve la tela al estante aunque ya esté cortada.**
  Veredicto: **sostiene**, con una precisión.
  Evidencia: A · `pg_get_functiondef('retail.anular_produccion')` en producción: devuelve, por cada lote de tela, el neto consumido (consumos menos devoluciones) a su costo y con motivo `anulacion_orden`, y solo se niega si hay prendas afuera; no mira cuánto se cortó · `SELECT` del 2026-10-16
  Confianza: alta · Aplica a: CAYLA
  Lo contradiría: un cambio de la función después de mi consulta; o que nadie anote nunca el consumo (entonces no hay nada que devolver)
  Implicación: principio 2 y P-05; la tela que vuelve es la **anotada como usada**, no «toda».
  Acción: `README.md` (punto 10) dice ahora «toda la tela anotada como usada».

**H-10.10 · Una fase del Taller que termina con menos prendas de las que entraron nunca queda «hecha».**
  Veredicto: **sostiene.**
  Evidencia: A · `pg_get_functiondef('retail.fn_fases_de_orden')` en producción: la fase está «hecha» si la anterior lo está y `hechas + segundas + faltantes ≥ entrada`; en una fase del Taller las segundas y los faltantes salen solo de las Vueltas, que no existen ahí, así que `hechas` tiene que alcanzar la entrada · `SELECT` del 2026-10-16. Las tablas de producción tienen 0 filas (`producciones`, `produccion_fases`, `produccion_avances`, `proveedores_produccion`, `insumos`)
  Confianza: alta · Aplica a: CAYLA
  Lo contradiría: un botón o función que dé la fase por terminada con faltantes (no la hay en lo que vi)
  Implicación: d.1, d.7 y P-04.
  Acción: ninguna.

**H-10.11 · Una fábrica de camisas manda el 100 % a un servicio de ojales y botones, y esa ida y vuelta demora más que toda la sala de corte.**
  Veredicto: **sostiene** el 100 % y el servicio; **débil** la comparación de tiempos.
  Evidencia: B · tesis USAT 2023, releída: las camisas se envían a un servicio de ojal y botón «por falta de maquinaria», 20.800 camisas en 2019 (el total producido) a S/ 0,20 cada una, con 1 día de demora; **la tabla de tiempos repite 1.440 minutos en las diez tomas con desviación cero**, o sea una convención de un día de calendario, comparada con unos 100 minutos de trabajo de la sala de corte · consultada 2026-10-16
  Confianza: media (un solo taller, Chiclayo, 2019) · Aplica a: taller de ~10 operarias con tejido plano
  Lo contradiría: que el Taller de CAYLA tenga máquina de ojal y botón
  Implicación: d.2 y P-13: la lista de fases opcionales.
  Acción: matiz añadido a `01` (H-1.16) y a la sorpresa 1 de `README.md`.

**H-10.12 · Cortar de más hasta 10 % es el techo de lo que se cuenta, no lo típico.**
  Veredicto: **débil** («no lo típico» no se sostiene).
  Evidencia: C · Online Clothing Study (exportadores cortan 2 a 5 % más; lo fija el merchandiser y varía con la tela) y Fashion-Incubator (lo que sale es «más o menos 5 %-10 %» del objetivo; ejemplo de 100 pedidas y 108 cortadas); ninguna es peruana ni primaria · consultadas 2026-10-16
  Confianza: baja · Aplica a: planta grande de exportación (2 a 5 %); marcas pequeñas (5 a 10 %)
  Lo contradiría: una medición del sobrecorte real de un taller de marca propia
  Implicación: d.7 de ADR-0400 y P-22: el 10 % cae dentro del rango de la fuente más cercana a una marca chica.
  Acción: `README.md` (punto 8) ya no dice «no lo típico»; dice que 5 a 10 % es lo que cuenta la fuente para marcas pequeñas.

## Otras seis afirmaciones revisadas

**H-10.13 · En Perú solo ~8 % de los asalariados de confección cobra por pieza.** **Sostiene.** B · OIT-Better Work, DP 28, tabla 1 y texto (ENAHO 2016): 8 % en el sector de confecciones de Perú (6 % mujeres, 9 % hombres); 20 % de los datos de Perú sin forma de pago; deja fuera a quien trabaja en casa (estimación de WIEGO: hasta 60 % de la ropa se hace en casa). Sin acción.

**H-10.14 · La sensibilidad del plazo: de 13 a 51 modelos en «producir ya» según sean 7 o 21 días.** **Débil.** El README versionado de la rama de cobertura trae «13 producir ya» con L = 7 y dice que el plazo no está medido; el recorrido 25, 40 y 51 consta **solo en la nota de sesión no versionada** del arquitecto (la encontré allí). D sin versionar, una sola fuente. Acción: `06` (H-6.8) lo dice y baja la confianza; `README.md` (punto 9) también.

**H-10.15 · «El 95 % de las empresas peruanas trabaja por bultos» no tiene fuente.** **Sostiene.** B · Bonilla 2007 (Ingeniería Industrial n.º 25), releído: lo afirma en la introducción y en las conclusiones, habla del sistema de producción por lotes y no cita ninguna fuente para la cifra (su bibliografía son libros de operaciones y revistas del oficio). Sin acción.

**H-10.16 · El mínimo de un servicio (150 a 240) es varias veces el stock del modelo propio mejor abastecido.** **Sostiene el dato; la inferencia sigue débil.** A · `SELECT`: 26 modelos de marca CAYLA, el mayor con 46 prendas en toda la red, ninguno sobre 50, mediana de 9,5; el mínimo (150 a 240) es dicho por Felipe (D). Que eso equivalga a «meses de lo vendido» depende de ventas parciales; el propio `06` lo marca «baja a media». Sin acción.

**H-10.17 · Traslados mide cuándo se confirmó la caja, no cuándo llegó.** **Sostiene.** A · `retail.transferencias` tiene `created_at`, `fecha_estimada_llegada`, `confirmado_en`, `recepcion_firmada_en` y `cerrado_en`, y ninguna columna de llegada; hay 4 traslados en total (de prueba). Sin acción.

**H-10.18 · La boleta de un Nuevo RUS no sustenta gasto ni crédito fiscal.** **Sostiene.** B · Reglamento de Comprobantes de Pago, art. 4, numeral 3.2 (el informe lo citaba como «4.3.2»): la boleta no permite crédito fiscal ni sustentar gasto o costo, salvo los casos que la ley permita identificando al adquirente con su RUC; numeral 2: el recibo por honorarios cubre el ejercicio individual de un oficio; la página de orientación del Nuevo RUS confirma que solo emite boletas y tickets. Sin acción.

## Las que descansan en una sola fuente C

| Afirmación | Dónde | Fuente única | Cómo quedó escrita |
|---|---|---|---|
| El servicio paga la tela que inutiliza (arts. 1773, 1774, 1788) | `04` H-4.13, `07` H-7.11, `09` S1b y H-9.8 | Hernández Berenguel (doctrina) | C, «matiza», no «contradice» |
| Un descuento puede leerse como venta de tela | `04` H-4.12, `09` S1c, `11` P-18, `README.md` | el mismo artículo; casos de minería | C, confianza baja, analogía |
| El sobrecorte típico es 2 a 5 % (exportación) o 5 a 10 % (marcas chicas) | `01` H-1.14, `03` H-3.9, `07` H-7.10 | blogs del oficio | C, confianza baja |
| La sensibilidad del plazo 13 a 51 | `06` H-6.8, `README.md` | nota de sesión no versionada | D, confianza baja a media |
| Las cifras peruanas de huecos entre moldes | `03` H-3.7 | tres referencias débiles | confianza baja a media |

## Revisión de las reglas del brief

**(a) Nada de diseñar pantallas, tablas ni migraciones.** Revisé los diez archivos con búsquedas de verbos de diseño («propongo», «el sistema debe», «campo nuevo», «tabla nueva», «migración», «botón», «pantalla nueva»). No hay propuestas. Quedan tres usos que dejé y por qué: los «mínimo aceptable» de `07` son lo que el Taller necesita poder decir, no un diseño; los «5 principios de captura» de `08` los pide el brief y son reglas de captura; y las opciones Ganas/Pagas de `11` describen consecuencias, que es su formato. **Sin cambios.**

**(b) Datos reales de CAYLA, nombres, RUC y tarifas.** No hay RUC, montos ni tarifas de CAYLA. Cambié: (1) los conteos de bonos y sobretiempo de la planilla del Taller (`05`, `09`, `11`: de conteos exactos a «cerca de la mitad de las filas» y «pocas»), porque con un grupo de tres a seis personas son un dato casi individual; (2) tres nombres de negocios en títulos o enlaces, cinco apariciones: una empresa de Chiclayo (`02`), una microempresa de confecciones (`05`) y la ficha de un taller de Gamarra (`02`, `07` y `09`). **Dejé** como están los conteos de planilla (6, 5, 3) que el brief pide, las proporciones del catálogo (que el Frente 6 declara como órdenes de magnitud; comprobé que el mayor stock propio es 46) y las páginas públicas de servicios de Lima usadas como referencia de precios (no son proveedores de CAYLA: no hay ninguno en la base).

**(c) Hechos tributarios o laborales sin fuente primaria.** Los hechos de guía, sanción, detracción, boleta y recibo ahora tienen el texto releído (B). Corregí tres que no lo tenían: la «Resolución 2109 de la Comunidad Andina, vigente para Perú desde 2021» y su ley peruana (`07`, #26), que venían solo de un resumen de buscador y pasan a «no afirmo; pregunta»; el criterio de INDECOPI sobre outlets (`07`, H-7.14), que se afirmaba desde una nota de prensa y pasa a «según una nota de prensa»; y la tasa del IGV (`04`, matriz de riesgos), que se daba de memoria y ahora cita su nota y va al contador. La multa del 50 % por no depositar la detracción y la oportunidad del depósito vienen de un texto consolidado de 2012 (aviso en `04` H-4.9).

**(d) Preguntas ya contestadas en ADR-0400 sin marca REABRE.** Crucé las 36 con ADR-0400 completo y sus actualizaciones. **P-36** repetía lo decidido en d.5 (su opción recomendada es «lo decidido en d.5»): ahora lleva REABRE d.5 en parte. P-28 completa d.9 y P-04, P-06, P-11 y P-33 completan o rodean lo decidido: lo dicen en su ficha. Las otras 30 quedan como estaban. Verifiqué también las reglas de forma: 6 bloques de 6, 9 llamadas de 4, sin dependencia dentro de una misma llamada, encabezados de 12 caracteres o menos, etiquetas de opción de 5 palabras o menos.

**(e) Vocabulario.** La forma femenina de «cliente» (`02-glosario`, fila de reproceso) pasó a «cliente». La palabra rechazada por Felipe para lo que sale y vuelve de un servicio solo aparece en la frase que dice que la rechazó y como verbo común («vale la pena»); una vez venía como término de una fuente para otra cosa (pedir tela al almacén) y la cambié a «requisición de tela». «Jefe», «empleado» y «sucursal» solo aparecen como términos de las fuentes, en el glosario y en la regla que los veta.

## Contraejemplos

1. **Contra mi propia lectura de H-10.1:** la RS 123-2022 retituló el Capítulo V como guías «en formatos impresos o importados», y el Informe 117-2003 es de antes de esa norma. Los artículos 17 y 18 siguen publicados con ese texto y la RS 240-2024 repite que desde 2024 todos emiten la guía electrónica, pero no leí el anexo X que fija quién y desde cuándo; por eso la conclusión sigue yendo al contador.
2. **Contra mi bajada de H-10.4:** si el contrato con el servicio dice que él responde por la tela que inutilice, la regla civil es un pacto y no una norma supletoria; el art. 1773 admite pacto.
3. **Contra mi crítica a la comparación de H-10.11:** aunque 1.440 minutos sean una convención, el dato duro (todo el lote sale a un servicio) por sí solo ya contradice una lista de fases sin ese servicio.

## Lo que no encontré

- **Fuentes que contradigan por búsqueda:** sin cuota de `WebSearch` no pude buscar otro Informe de SUNAT sobre el traslado a transformación, ni resoluciones del Tribunal Fiscal sobre confección, ni un estudio peruano de sobrecorte.
- **El texto de la ley del Código Civil:** la única dirección de SPIJ que probé dio 404; los arts. 1773, 1774 y 1788 quedan por el artículo.
- **El anexo X de la RS 123-2022** (quién emite la guía electrónica y desde cuándo): el PDF lo menciona pero no lo trae en el texto que pude convertir.
- **Cambios de 2026 en detracciones y guías:** no pude descartarlos.
- **Las tablas-imagen de Zhezhova** (7 y 8) y la mayor parte de las tesis largas (solo busqué las cifras citadas).
- **Un solo respaldo B del sobrecorte** o de la merma de tela de un taller de tejido plano de ~10 personas: sigue sin existir en lo que alcancé.

## Preguntas que solo CAYLA puede contestar

*(Nuevas o ampliadas por este frente; las del banco siguen en `11`.)*

1. **Al contador:** si el servicio recoge y entrega con su propia guía, ¿CAYLA queda aun así como remitente para las multas del art. 174 n.º 8 a 10? (ampliación de la pregunta 5 de `04`).
2. **Al contador:** ¿siguen vigentes la multa del 50 % por no depositar la detracción y la oportunidad del depósito que figuran en el texto consolidado de 2012?
3. **Al contador y al abogado:** si se le cobra a un servicio la tela que inutilizó, ¿cómo se redacta para que no se lea como venta de tela? (los casos conocidos son de minería, no de confección).
4. **A la encargada del Taller:** ¿alguna vez se mide cuánta tela se pierde por error al tender y cortar (como la tesis de camisas), separada de lo que sobra entre moldes? (cierra la duda de H-10.6).

## Fuentes

Todas consultadas el **2026-10-16**. «Convertido» = el PDF llegó comprimido a la herramienta de lectura y lo convertí a texto en el scratchpad (no entra al repo).

| Nivel | Fuente | URL | Estado |
|---|---|---|---|
| B | SUNAT, Informe 117-2003 | https://www.sunat.gob.pe/legislacion/oficios/2003/oficios/i1172003.htm | vivo, leído |
| B | SUNAT, Reglamento de Comprobantes de Pago, Capítulo V (arts. 17, 18, 21) | https://www.sunat.gob.pe/legislacion/comprob/regla/capituloV.pdf | vivo, convertido |
| B | SUNAT, Reglamento de Comprobantes de Pago, Capítulo I (art. 4) y Capítulo II (arts. 6 y 7) | https://www.sunat.gob.pe/legislacion/comprob/regla/capituloI.pdf · .../capituloII.pdf | vivos, convertidos |
| B | SUNAT, Código Tributario, Tabla I | https://www.sunat.gob.pe/legislacion/codigo/tablaI.pdf | vivo, convertido |
| B | SUNAT, RS 240-2024 y RS 123-2022 | https://www.sunat.gob.pe/legislacion/superin/2024/000240-2024.pdf · https://www.sunat.gob.pe/legislacion/superin/2022/123-2022.pdf | vivos, convertidos (el anexo X no se ve) |
| B | SUNAT, «En la prestación de servicios» (Anexo 3, numeral 7) | https://orientacion.sunat.gob.pe/3142-03-en-la-prestacion-de-servicios-empresas | vivo |
| B | SUNAT, RS 056-2006 | https://www.sunat.gob.pe/legislacion/superin/2006/056.htm | vivo |
| B | SUNAT, Informes 151-2006 y 082-2006 | https://www.sunat.gob.pe/legislacion/oficios/2006/oficios/i1512006.htm · .../i0822006.htm | vivos, leídos |
| B | SUNAT, TUO del DL 940 (texto actualizado a junio de 2012) | https://www.sunat.gob.pe/legislacion/detracciones/ | vivo; fecha de la página: 2012 |
| B | SUNAT, orientación: Guía de Remisión Remitente; Nuevo RUS | https://orientacion.sunat.gob.pe/02-guia-de-remision-remitente · https://orientacion.sunat.gob.pe/nuevo-regimen-unico-simplificado-nuevo-rus | vivos |
| B | OIT-Better Work, DP 28 (Borino 2018) | https://betterwork.org/wp-content/uploads/DP-28-Piece-rate-pay-and-working-conditions-in-the-export-garment-sector_Final.pdf | vivo, convertido |
| B | Pérez Gao 2017, Industrial Data 20(2) | https://www.redalyc.org/pdf/816/81653909013.pdf | vivo, convertido |
| B | Zhezhova et al. 2019 | https://eprints.ugd.edu.mk/23449/1/c12.pdf | vivo, convertido (tablas 5 a 8 son imágenes) |
| B | LACCEI 2023 (Trujillo) | https://laccei.org/LEIRD2023-VirtualEdition/papers/Contribution_161_final_a.pdf | vivo, convertido |
| B | Tesis USAT 2023 (camisas, Chiclayo) | https://repositorio.usat.edu.pe/server/api/core/bitstreams/85178ce1-bb4b-49ee-9995-2c90edba094c/content | vivo, convertido |
| B | Tesis UCSM 2021 (abrigos de alpaca) | https://repositorio.ucsm.edu.pe/bitstreams/b04f4eae-5ccc-419b-a3d1-5cc031ea4e64/download | vivo, convertido |
| B | Bonilla 2007, Ingeniería Industrial n.º 25 | https://www.redalyc.org/pdf/3374/337460076001.pdf | vivo, convertido |
| C | Hernández Berenguel, Foro Jurídico (PUCP) | https://revistas.pucp.edu.pe/index.php/forojuridico/article/download/13810/14434 | vivo, convertido |
| C | Online Clothing Study, cut-to-ship | https://onlineclothingstudy.com/2013/10/what-is-cut-to-ship-ratio-in-apparel.html | vivo |
| C | Fashion-Incubator, cutting ticket | https://fashion-incubator.com/what-is-a-cutting-ticket/ | vivo |
| — | SPIJ, Código Civil (DL 295) | https://spij.minjus.gob.pe/Graficos/Peru/1984/Julio/25/DL-295.pdf | **404, murió** |
| A | Base `cayla-dynamic`, schema `retail`: conteos de tablas de producción, `planilla_por_sede`, columnas de `transferencias`, stock de los modelos propios, definiciones de `anular_produccion` y `fn_fases_de_orden` | proyecto `cayla-dynamic` | solo `SELECT` |
| D | README de la rama `claude/tiempo-question-299a41` (cobertura) y nota de memoria del arquitecto sobre el plazo | repo / memoria local | leídos |
