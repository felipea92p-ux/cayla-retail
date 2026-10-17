# 03 · Tela y materiales: cuánto se compra, cómo se mide y por qué se desvía

**Frente 3 · 2026-10-16 · solo lectura.** Toda fuente fue consultada el 2026-10-16. Letras de evidencia: **A** medido por mí en la base o el repo · **B** fuente primaria citable (artículo revisado, tesis, norma, instituto técnico) · **C** fuente secundaria (blog de oficio, ficha comercial, consultor) · **D** lo dijo Felipe y está escrito · **E** inferencia mía (dicha como tal). Nada de lo que sigue diseña pantallas ni tablas; cada hallazgo termina en una línea de implicación.

**Aviso de alcance.** Me quedé sin presupuesto de búsquedas web a mitad del frente (el límite es compartido por todos los agentes). Lo que quedó sin buscar está en «Lo que no encontré»; no lo rellené.

## Veredicto

1. **Un «consumo por prenda» no es un número único.** Un CAD como Audaces entrega el consumo de una *marcada* (varias tallas juntas, sobre un ancho dado), y ese número cambia entre 5,6 % y 9,1 % solo por cómo se combinan las tallas (B). Lo que de verdad se gasta es mayor: puntas de tendido, ancho, defectos, encogimiento y sobrecorte se suman encima (C).
2. **La palabra «merma» nombra tres cosas distintas** (huecos entre moldes, desvío de la sala de corte, prendas que no llegan a la tienda). El 3 % de R-31 solo es creíble como la tercera; la primera mide entre 10 % y 21 % en tres referencias peruanas débiles (una plancha de licra pesada una vez, el resumen de una tesis de abrigos de alpaca y un promedio citado de segunda mano) y de unos 20 a 28 % del área en un estudio de pantalones con CAD (B/C; ver la corrección del Frente 10 en H-3.7). La fórmula `consumo × prendas × (1 + merma)` de ADR-0400 mezcla dos de ellas si nadie dice qué incluye el «consumo».
3. **La tela se compra por metros solo si es tejido plano.** El punto se compra por kilo porque su largo se estira (B/C). Las prendas propias de CAYLA son casi todas de nombre plano (A), así que «por metros» probablemente aguanta para ellas, pero no sabemos qué corta el Taller (A: la base no lo distingue).
4. **Lo más sorprendente:** en la fuente más sólida que encontré (artículo con marcadas reales), ensanchar la marcada 1 o 2 cm movía menos que combinar tallas, y el consumo por talla **depende de cuántas tallas se cortan juntas**, no solo del molde. Eso toca el supuesto de «escribirlo una vez en el modelo y que lo medido lo corrija».
5. **Casi no hay dato público de talleres de ~10 operarias**: cuánta tela sobra, cómo la reservan, si revisan el tono entre lotes. Eso solo lo sabe el Taller; las preguntas están al final.

## 1 · Tres cosas que se llaman «merma»

| Qué es | De dónde sale | Magnitud en las fuentes | Dónde cae en CAYLA hoy |
|---|---|---|---|
| **Huecos entre moldes** (lo que sobra de la marcada) | forma de las piezas, tallas combinadas, ancho | utilización de la marcada entre 71,7 % y 83,7 % (B, artículo con Gerber AccuMark), o sea 16-28 % del área (el Frente 10 confirmó en el texto 71,7 a 79,0 %; el 83,7 % viene de tablas-imagen); «merma de corte» en referencias peruanas débiles: ~10 % promedio de 27 mypes (C, citado de segunda mano), ~20 % en dos casos (B: una pesada de una plancha de licra y un resumen de tesis) | va **dentro** del consumo que entrega un CAD (E; el fabricante dice que su reporte trae consumo, rendimiento y % de desperdicio, C) |
| **Desvío de la sala de corte y de la compra** | puntas de tendido, empalmes, ancho, defectos, rollo corto, encogimiento, sobrecorte, muestras, errores | ejemplo ilustrativo de un consultor: +2,5 % en la sala de corte y ~12 % de la tela comprada perdida al nivel de la fábrica (C); costeos de blogs agregan 3-7 % de margen de compra (C) | `insumos.merma_pct` (CHECK entre 0 y menos de 0,5; 0 filas; A) y `cantidad_plan = consumo × prendas × (1 + merma_pct)` (ADR-0400, D/E) |
| **Prendas que no llegan a la tienda como primera** | falladas, segundas, faltantes | «cut-to-ship» ~98 % es muy bueno, 92 % en el ejemplo (C) | R-31 «menos del 3 %» (D, estimación, `15-COMO-OPERA-CAYLA.md:432`) |

## 2 · Las cuatro capas del consumo (para leer el resto)

| Capa | Qué mide | Fuente |
|---|---|---|
| 0 · Área de piezas | lo que ocupan los moldes, sin huecos | definición de eficiencia: área de moldes ÷ área de la marcada (C, ApparelResources; C, Audaces) |
| 1 · Consumo de marcada | largo de la marcada ÷ prendas que caben (varias tallas juntas); incluye huecos | método del consumo en tejido plano (C, OCS); es lo que un CAD calcula (C, Audaces) |
| 2 · Consumo de sala de corte | capa 1 + puntas de tendido, empalmes, retazos de fin de rollo | ejemplo ilustrativo: 1,95 m de marcada contra 2,00 m en sala (C) |
| 3 · Consumo real de la orden | capa 2 + defectos, rollos cortos, encogimiento, sobrecorte, muestras, errores | mismo ejemplo: 2,21 m por prenda enviada (C) |

**Lo que «mide» ADR-0400** (`cerrar_produccion`: metros usados ÷ buenas) **es la capa 3**: mezcla todas las causas y no sabe separarlas (E). **Lo que «escribe Audaces»** (R-26) **es la capa 1** (E + C). Sin saber cuál entra al campo «consumo», `merma_pct` podría estar contando dos veces los huecos entre moldes (ver H-3.18).

## 3 · Tabla: insumo → cómo se compra → cómo se consume → conversión → desvío típico → quién lo mide

«No hay dato público» significa que lo busqué y no lo encontré; ahí va una pregunta al Taller. La columna «quién» describe una planta grande; en CAYLA hoy **nadie** lo anota (0 filas en `insumos`, `insumo_lotes`, `movimientos_insumo`, `producciones`, `producto_consumos`; A).

| Insumo | Cómo se compra | Cómo se consume | Conversión | Desvío típico | Quién lo mide |
|---|---|---|---|---|---|
| **Tela de tejido plano** (lino, popelina, satín, oxford…) | por metro lineal, con un ancho; rollos de ~50-100 m (C) | metros por prenda = largo de marcada ÷ prendas (C, B) | ninguna si se compra y se consume en metros; el **ancho útil** (sin orillo, ~1 pulgada menos que el de factura, C) manda sobre el consumo | +3-7 % de margen de compra en costeos (C); capa 3 ejemplo +~12 % (C); sin cifra propia de talleres chicos | patronista (teórico), sala de corte (usado), almacén (recibido), calidad (inspección); «informe de conciliación» de tela por orden en planta grande (C) |
| **Tela de punto** (jersey, rib, franela, suplex…) | **por kilo**, rollos de ~20-30 kg; trae ancho (tubular o abierto) y gramaje (C) | gramos o kilos por prenda = área de marcada × gramaje (C) | metros/kg = 1000 ÷ (gramaje en g/m² × ancho abierto en m); jersey 30/1 ≈ 3,9 m/kg en un ejemplo (C); sin gramaje y ancho, «≈3 m/kg» no significa nada (E) | el largo se estira ~5 % al enrollar y vuelve al reposar (C, comentario de un lector); gramaje y ancho varían por rollo (C) | almacén pesa; corte mide metros tendidos; sin conversión no cuadran |
| **Forro y entretela** | por metro, con su ancho | por área y se convierte a metros lineales con el ancho (C) | metros = área ÷ ancho | no hay dato público | patronista |
| **Hilo** | por cono (5 000 m en la tabla del instituto técnico argentino, B) y por color | metros por prenda: remera básica 60, camisa de vestir 120, pantalón de 5 bolsillos 200 (B, INTI, sep-2025) | metros por prenda ÷ metros por cono: ~42 camisas de vestir por cono (E, aritmética); razón por puntada: pespunte 2,5 cm de hilo por cm de costura, remalle de 3 hilos 14 (B, tabla Coats en material del INA de Costa Rica) | el mismo INA dice que esa tabla no se recomienda para prendas de vestir (B): medir una muestra | patronista o encargada de costura; en planta grande, una hoja de «promedio de avíos» antes de producir (C) |
| **Cierres** | por pieza, con largo y color | 1 por prenda | ninguna | no hay dato público | patronista |
| **Botones** | en listados aparece el paquete de 144 (la gruesa); docena y ciento: no verificado | n por prenda + repuesto | gruesa → unidades | no hay dato público | patronista |
| **Elástico, cintas, encajes** | por metro o rollo | centímetros por prenda | rollo → metros | no hay dato público | patronista |
| **Etiquetas** (marca, talla, cuidado) | por unidad, ciento o millar | 1 por prenda (se cuentan en unidades, C) | ninguna | no hay dato público | almacén |
| **Retazos** (salida, no insumo) | no se compran | R-28: se botan (D); en un caso peruano se pesaron y se separaron los de 40 g o más como aprovechables (B) | por peso | ~10-21 % de la tela es retazo de marcada (ver §1) | no hay dato público |

**Cómo lo modela hoy CAYLA (A, solo descripción):** `insumos.unidad_medida` admite metro, unidad, kilo, cono, par y docena (no rollo, no gruesa), sin conversión; la tela se descuenta por lote en PEPS sin partir lote; `produccion_insumos` guarda tela por color de la orden y `producto_consumos` un único `tela_por_prenda` por modelo (ADR-0400).

## 4 · Las cinco causas de desvío, con su magnitud

Magnitudes sobre el consumo de marcada (capa 1). Todas con la letra de su fuente; las cifras de un solo caso o de un consultor no son promedios de la industria.

| # | Causa | Magnitud | Letra y fuente |
|---|---|---|---|
| 1 | **Puntas de tendido, empalmes y retazo de fin de rollo** | 2-4 cm por capa (OCS) o 4-6 cm por capa adicional (ApparelResources): ~0,3-0,8 % del largo en una marcada de 5-6 m; un rollo de 61 m con marcada de 5 m deja 1 m (1,6 %); crece con el número de capas | C |
| 2 | **Ancho útil distinto del ancho de la marcada** (y colores con anchos distintos) | ensanchar la marcada 1 a 2 cm ahorra entre ~0,4 % y ~2 % de la tela (pantalones, 203-365 m por pedido); una marcada hecha para el ancho más angosto de varios colores desperdicia el resto | B (Zhezhova) y C (Fashion-Incubator) |
| 3 | **Defectos, rollo corto y reposición de piezas** | no hay cifra de tela perdida por defectos en talleres de ~10 operarias; un ejemplo de planta deja ~13 % de la tela comprada sin explicar entre sobrante, corte, rechazos y rollos cortos del molino | C (ApparelResources, «Fabric Management») · no hay dato público |
| 4 | **Encogimiento, estiramiento y reposo** (sobre todo en punto) | costeos agregan ~2 % por encogimiento (C); el largo del punto se estira ~5 % al enrollar (C, de un lector); tiempos de reposo de 12 a 48 h son de vendedores de máquinas (C); no hay estudio con un plazo universal | C |
| 5 | **Plan de corte y sesgo de talla** (qué tallas van juntas; talla grande gasta más) | mismo pedido: 5,6-9,1 % de diferencia entre marcadas de una talla y de varias (B); la talla grande suma ~10 cm sobre 2 m, ~5 % (C, ejemplo) | B (Zhezhova) y C |

**Muestras y errores humanos** (tela gastada en la prenda piloto, corte equivocado): no hay dato público; preguntar al Taller. Sumados, no se pueden separar con «lo medido» (E).

## 5 · Hallazgos

H-3.1 · El consumo por prenda de un CAD sale de una marcada con varias tallas juntas, y el mismo pedido gasta entre 5,6 % y 9,1 % menos tela con marcadas de varias tallas que con una marcada por talla.
  Evidencia: B · Zhezhova et al., «The influence of the type and width of the cut marker on the utilization of textile materials», Advanced Technologies 8(2), 2019, tablas 5-8 (dos pedidos de pantalones, marcadas hechas con AccuMark) · https://eprints.ugd.edu.mk/23449/1/c12.pdf · consultada 2026-10-16
  Confianza: media (dos pedidos, un tipo de prenda, 7 u 8 tallas) · Aplica a: ambos
  Lo contradiría: una curva de solo tres tallas, como la de las prendas propias (A, H-3.17), deja menos combinaciones y por tanto menos diferencia (E).
  Implicación: toca ADR-0400 d.6 y R-27: un solo número por modelo es un promedio que cambia con cómo se combinen las tallas (H6).

H-3.2 · La utilización de una marcada, cuánto del tejido termina en pieza, va de 71,7 % (una talla por marcada) a 83,7 % (varias tallas), así que 16-28 % del área es hueco entre moldes antes de contar ninguna otra pérdida.
  Evidencia: B · mismo artículo, tablas 5-8 · consultada 2026-10-16
  Confianza: media · Aplica a: ambos. *Nota del Frente 10:* el texto del artículo confirma, en el pedido A, 71,7 a 71,8 % de utilización con marcadas de una talla y 78,8 a 79,0 % con varias tallas (21 a 28 % del área sin usar); del pedido B solo dice que las marcadas de varias tallas rinden en promedio unos 4,5 % más. El 83,7 % de las tablas 7 y 8 está en tablas-imagen que el Frente 10 no pudo releer, por eso el hueco «16-28 %» pasa a «unos 20 a 28 %» fuera de este archivo.
  Lo contradiría: telas con dibujo o dirección (el fabricante de CAD reconoce menos aprovechamiento con sentido obligatorio, C) o una prenda con piezas de formas más simples.
  Implicación: R-31 y `merma_pct` (H8): «menos de 3 %» no puede ser el hueco entre moldes.

H-3.3 · El ancho entra en el consumo: 1 a 2 cm más de ancho ahorran entre ~0,4 % y ~2 % de la tela, y el ancho útil de un tejido plano es ~1 pulgada menor que el de factura.
  Evidencia: B para el efecto del ancho (Zhezhova, tablas 5-8) y C para el ancho útil (Fashion-Incubator, «What is cuttable width?», https://fashion-incubator.com/what-is-cuttable-width/) · consultadas 2026-10-16
  Confianza: media · Aplica a: ambos
  Lo contradiría: telas con orillos muy angostos o con agujeros fuera del orillo, donde el ancho útil baja más.
  Implicación: `producto_consumos` guarda un `tela_por_prenda` por modelo, sin ancho: el mismo modelo en dos telas de ancho distinto gasta distinto (H6).

H-3.4 · Un tejido de punto se compra por kilo porque su largo cambia con la tensión, y el consumo se expresa en gramos; un tejido plano conserva su largo y se compra por metro.
  Evidencia: B para el alcance (ASTM D3887, tolerancias de tejidos de punto, incluye rendimiento, masa, ancho y largo, https://store.astm.org/d3887-96.html) y C para la práctica (OCS, https://www.onlineclothingstudy.com/2017/08/why-knit-fabric-consumption-is.html) · consultadas 2026-10-16
  Confianza: media-alta · Aplica a: ambos
  Lo contradiría: una tienda que venda jersey por metro en cortes chicos (lo hacen; C, listados de un mercado en línea peruano, solo por resumen de búsqueda).
  Implicación: contradice a medias ADR-0400 d.6 («no se construye kilo a metro») solo si el Taller corta punto; confirma R-25 de que existen los tres modos (H5).

H-3.5 · Los metros por kilo de un punto dependen de dos datos que la factura debe traer: gramaje y ancho abierto; con gramaje 145 g/m² y 90 cm tubular da ~3,9 m/kg.
  Evidencia: C · OCS, https://www.onlineclothingstudy.com/2015/10/how-to-convert-knitted-fabric.html y todosloshechos.es, https://todosloshechos.es/cuantos-metros-hay-en-un-kilo-de-tela · consultadas 2026-10-16 (la fórmula es identidad física: masa = área × gramaje; E)
  Confianza: alta para la fórmula, media para los ejemplos · Aplica a: ambos
  Lo contradiría: telas con gramaje que cambia a lo largo del rollo (las propias fuentes lo avisan).
  Implicación: un «≈3 m por kilo» sin gramaje y ancho (la frase de la investigación previa) no es un dato; toca H5.

H-3.6 · El consumo teórico de la marcada deja afuera las puntas y los retazos de fin de rollo; en un ejemplo ilustrativo de 300 piezas el consumo real subió de 1,95 m (marcada) a 2,00 m (sala de corte) y a 2,21 m por prenda enviada.
  Evidencia: C · M. Ambastha, «Performance Measurement Tools 3», Apparel Resources, 2012, https://apparelresources.com/business-news/manufacturing/performance-measurement-tools-3-cutting-production-planning/ · consultada 2026-10-16 (el propio artículo dice que la fábrica es hipotética)
  Confianza: baja (un ejemplo, no un promedio) · Aplica a: planta grande
  Lo contradiría: una medición real de un taller de ~10 operarias.
  Implicación: «lo medido corrige» (d.6) corrige la capa 3, no la 1; sin saber qué parte es puntas y qué parte defectos, la corrección es ciega (H6).

H-3.7 · La «merma de corte» (retazos de marcada) en referencias peruanas va de ~10 % a ~21 % de la tela, mucho más que el 3 % de R-31, pero las tres referencias son débiles. *(Corrección del Frente 10: decía «medida en casos peruanos». Al releer: el 20,78 % del artículo de LACCEI es el pesaje de UNA plancha de licra de 1,5 m² (322,5 g a 255,5 g), un tejido de punto, y el 10,48 % es lo que quedó tras reaprovechar retazos, no un hueco geométrico; la tesis UCSM sí dice «20 % de merma de la materia prima (tela de alpaca) en corte» en su resumen (comprobado), en una planta de abrigos de tejido plano, pero no se leyó su método; y el ~10 % es un promedio citado de segunda mano. La dirección se sostiene además con la fuente B más firme, Zhezhova, donde queda sin usar de unos 20 a 28 % del área de la marcada en pantalones; ninguna es una medición de un taller de CAYLA.)*
  Evidencia: B · LACCEI 2023 (Trujillo, ropa de baile en licra: una plancha de 322,5 g pasó a 255,5 g = 20,78 %, bajó a 10,48 % tras clasificar retazos), https://laccei.org/LEIRD2023-VirtualEdition/papers/Contribution_161_final_a.pdf; UCSM 2021 (Arequipa, abrigos de alpaca plana, «20 % de merma en corte», solo leí el resumen), https://repositorio.ucsm.edu.pe/bitstreams/b04f4eae-5ccc-419b-a3d1-5cc031ea4e64/download; USAT 2021 cita ~9,93 % promedio en 27 mypes (Bonilla 2015, no abierto), https://repositorio.usat.edu.pe/bitstreams/43dec555-5b31-4500-ab1b-0af66c4bd5df/download · consultadas 2026-10-16
  Confianza: baja a media (una pesada de una sola plancha de licra, un resumen de tesis de abrigos de alpaca y un promedio de segunda mano; ninguna es un taller de camisas o blusas) · Aplica a: taller de ~10 operarias
  Lo contradiría: una marcada con 90 % de aprovechamiento, o una prenda con piezas rectangulares.
  Implicación: R-31 y H8: si «merma» es la del corte, 3 % no se sostiene; si es la de prendas falladas, no se prueba aquí.

H-3.8 · Entre el corte y el envío se pierden entre ~2 % y ~8 % de las prendas en las fuentes de planta; el 97-98 % que usan como «bueno» coincide con el 3 % de R-31, pero no lo prueba para un taller propio ni para una primera orden.
  Evidencia: C · Ambastha 2012 (98 % muy bueno, 92 % en el ejemplo), https://apparelresources.com/business-news/manufacturing/performance-measurement-tools-3-cutting-production-planning/; ApparelResources «Fabric Management», https://apparelresources.com/business-news/manufacturing/fabric-management-saving-fabric-or-just-increasing-dead-stock/ (usa 97 %); OCS cut-to-ship, https://onlineclothingstudy.com/2013/10/what-is-cut-to-ship-ratio-in-apparel.html (exportadores cortan 2-5 % de más) · consultadas 2026-10-16
  Confianza: baja (blogs y un consultor; la razón se define al revés en cada uno: cortado ÷ enviado o enviado ÷ cortado) · Aplica a: planta grande
  Lo contradiría: la primera orden de un modelo nuevo, tela nueva o servicio nuevo (no hay dato público).
  Implicación: H8 sin respaldo para primeras órdenes; R-31 queda como estimación (D).

H-3.9 · Para sobrecorte, los exportadores cortan 2-5 % más que el pedido (para reponer defectos, porque algunos compradores aceptan sobrante y para gastar la tela ya comprada); el 10 % de ADR-0400 no tiene respaldo en estas fuentes.
  Evidencia: C · OCS, https://onlineclothingstudy.com/2013/10/what-is-cut-to-ship-ratio-in-apparel.html · consultada 2026-10-16; las tablas 3-4 de Zhezhova (B) muestran el plan de corte como capas por marcada, de donde la cantidad cortada por talla sale como un múltiplo de capas × prendas de esa talla por marcada (lectura mía, E)
  Confianza: baja · Aplica a: planta grande; para series de 50-200 piezas no hay dato público
  Lo contradiría: una serie corta, donde 1 prenda de más ya es 2-5 % (E).
  Implicación: ADR-0400 d.7 (10 %) contra ADR-0415 (el mayor entre 2 × plan y plan + 5): ninguno tiene respaldo de campo (H11).

H-3.10 · El hilo se compra en conos y se consume en metros por prenda: 60 m una remera básica, 120 una camisa de vestir, 200 un pantalón de 5 bolsillos (cono de 5 000 m).
  Evidencia: B · INTI (Argentina), tabla de consumo de hilo, sep-2025, https://app.inti.gob.ar/textil/consumoHilo.pdf · consultada 2026-10-16
  Confianza: media (instituto técnico de otro país, un solo hilo) · Aplica a: ambos
  Lo contradiría: costuras con remalle y recubierta, que usan 12-28 veces el largo de la costura (B, tabla Coats en el material del INA de Costa Rica, https://www.inavirtual.ed.cr/pluginfile.php/2861441/mod_resource/content/1/exportado/assets/consumohilo.pdf), y el propio INA, que dice que esa tabla no es para prendas de vestir.
  Implicación: en `insumos.unidad_medida` el cono es unidad de compra y los metros por prenda son de consumo; no está escrito cuál se descuenta ni cuándo (por prenda o por lote).

H-3.11 · Audaces dice que su módulo de marcada entrega un reporte previo al corte con consumo estimado, rendimiento y porcentaje de desperdicio, y reportes de consumo por pieza; no publica si desglosa por talla ni su formato.
  Evidencia: C · ficha comercial de Audaces, https://audaces.com/en/solutions/marker; blog, https://audaces.com/en?p=161806 (su fórmula de ejemplo multiplica por 0,9 de «eficiencia», que baja el consumo en vez de subirlo: inconsistente) · consultadas 2026-10-16
  Confianza: baja · Aplica a: ambos
  Lo contradiría: un reporte real (la visita A0 nunca se hizo; Frente 0).
  Implicación: R-26/R-27 y ADR-0400 d.6: «lo que calcula Audaces» sigue sin saberse si es por talla, por marcada o promedio (H6).

H-3.12 · En una planta grande, la tela se inspecciona al llegar con el sistema de 4 puntos (ASTM D5430), se separan los rollos por banda de tono en familias A, B, C y se mide el encogimiento antes de cortar; esos tres informes se piden en 48 horas.
  Evidencia: B para el estándar (ASTM D5430 asigna puntos de castigo por defecto y sirve para aceptar envíos, https://store.astm.org/d5430-26.html) y C para las cifras de fábrica (OCS: 10 % de rollos, promedio ≤ 28 puntos por 100 yd² y ningún rollo > 40, https://onlineclothingstudy.com/?p=10983) · consultadas 2026-10-16
  Confianza: media para el estándar, baja para los límites (los fija el comprador) · Aplica a: planta grande
  Lo contradiría: no hay dato público de cómo inspeccionan los talleres pequeños de Lima.
  Implicación: reclamos de tela y tono (hueco del Frente 0) sin contraparte conocida en CAYLA; solo preguntando.

H-3.13 · Un modelo-color debería salir de una sola banda de tono: las fábricas separan rollos por familia de tono, las marcan en el informe y el corte las respeta; también varía el tono del centro al orillo dentro de un mismo rollo.
  Evidencia: C · OCS, https://onlineclothingstudy.com/?p=10983 y https://onlineclothingstudy.com/?p=9016 · consultadas 2026-10-16
  Confianza: media · Aplica a: planta grande (en un taller chico no hay dato)
  Lo contradiría: un rollo único por modelo-color, donde no hace falta separar.
  Implicación: ADR-0090 consume por lote PEPS sin partir; el «lote» del ERP nace en una compra y el de tinte lo pone el fabricante: no está dicho si coinciden (H12).

H-3.14 · El tendido por color es la unidad física del corte: los colores casi siempre llevan tendidos propios y las tallas comparten marcada.
  Evidencia: B para que el plan de corte se arma con cantidades, tallas y colores (Zhezhova, introducción) y C para «colores en tendidos propios» (WavePLM, https://blog.waveplm.com/cut-order-planning-for-market-efficiency/) · consultadas 2026-10-16
  Confianza: media · Aplica a: ambos
  Lo contradiría: una orden de un solo color, o telas lisas del mismo lote que comparten tendido (E).
  Implicación: H12: una orden por modelo con colores y tallas es natural para planear; el corte real se parte por tela × color.

H-3.15 · No encontré cómo reservan la tela los talleres pequeños; lo descrito es el «informe de conciliación» de las plantas grandes: comprado, entregado a corte, tendido, perdido (rollo corto, defecto, puntas, retazos) frente a lo costeado.
  Evidencia: C · OCS «9 tips», https://www.onlineclothingstudy.com/2017/05/9-tips-to-save-fabric-in-cutting-room.html; ApparelResources «Fabric Management» · consultadas 2026-10-16
  Confianza: baja · Aplica a: planta grande
  Lo contradiría: no hay dato público de talleres de ~10 personas; preguntar al Taller.
  Implicación: ADR-0400 act. j (comprometido y en camino) no tiene un caso real contra el cual probarse.

H-3.16 · El punto se estira al enrollarse (~5 %) y conviene dejarlo reposar sobre la mesa; en tendidos largos casi no se relaja, y los plazos de reposo (12-48 h) vienen de vendedores de máquinas.
  Evidencia: C · Fashion-Incubator (comentario de un lector), https://fashion-incubator.com/pop-quiz-why-do-knits-get-larger/; Oshima (vendedor), https://www.oshima.com.tw/blog/fabric-relaxing-preshrinking-before-cutting · consultadas 2026-10-16
  Confianza: baja · Aplica a: ambos
  Lo contradiría: telas de punto ya compactadas en el molino.
  Implicación: el hueco «reposo y encogimiento» del Frente 0 sigue abierto; no hay plazo público que citar.

H-3.17 · Las prendas propias de CAYLA son casi todas de tela de nombre plano y con pocas tallas: 13 de 26 modelos con marca CAYLA llevan lino, popelina, satín, oxford o sastre; 10 llevan un nombre ambiguo (tela, aterciopelada, gamuza, poliéster…); 3 no son prendas; ninguno lleva un nombre de punto (jersey, rib, franela, suplex…).
  Evidencia: A · `retail.productos` × `marcas` × `tejidos` (SELECT), 2026-10-16. Además, 25 modelos con variantes activas: promedio 3,9 colores (1 a 16) y 2,3 tallas (1 a 4); tallas S, M y L dominan, hay 45 «Estándar» y 8 XS, ninguna XL
  Confianza: media (la marca CAYLA no prueba que el Taller lo hizo: la base no distingue «del Taller»; Frente 0) · Aplica a: CAYLA
  Lo contradiría: que el Taller también cosa prendas de otras marcas o en punto (222 modelos de otras marcas incluyen rib, suplex, licra).
  Implicación: respalda ADR-0400 d.6 («metros») para lo propio y apoya H12 (≈4 tendidos por modelo si cada color es una tela).

H-3.18 · La fórmula `cantidad_plan = consumo × prendas × (1 + merma_pct)` solo es coherente si el «consumo» ya incluye los huecos entre moldes (capa 1) y `merma_pct` cubre puntas, encogimiento y fallas (3-8 %); si alguien escribe el área de piezas, haría falta un margen de 15-25 % (inferencia mía, E, desde el 16-28 % de hueco de H-3.2).
  Evidencia: A para la fórmula y el CHECK (ADR-0400 tabla `produccion_insumos`; `supabase/migrations/20260917145000_insumos_taller_reconstruido.sql:66`, `merma_pct` entre 0 y menos de 0,5, 0 filas) y C para los 3-8 % (textiltelar: 3-7 % normal y 5-10 % estampados o con pelo, https://textiltelar.com/consumo-tela-produccion-prendas/; OCS «cómo se calcula el consumo», https://onlineclothingstudy.com/2020/04/how-do-we-calculate-fabric-consumption.html) · consultadas 2026-10-16
  Confianza: media · Aplica a: CAYLA
  Lo contradiría: que el Taller escriba el consumo de Audaces ya inflado con un margen propio.
  Implicación: ADR-0400 d.6; hace falta saber qué número entra al campo (pregunta HECHO).

H-3.19 · Una parte de lo «marcado [externo, sin verificar]» de la investigación previa no se sostiene en su fuente: el «jersey 24/1 ≈ 3 m/kg» no es una propiedad fija (depende de gramaje y ancho) y la página «textiltelar» citada para el encogimiento no da ningún porcentaje.
  Evidencia: C · textiltelar.com (página abierta, sin % de encogimiento ni m/kg); OCS y todosloshechos (fórmula) · consultadas 2026-10-16
  Confianza: alta · Aplica a: ambos
  Lo contradiría: una ficha técnica del proveedor de CAYLA con gramaje y ancho.
  Implicación: no usar «3 m/kg» como constante (H5).

## 6 · Veredictos sobre las hipótesis

| # | Veredicto | Evidencia al lado | Consecuencia (una línea) |
|---|---|---|---|
| **H5** · la tela se compra por metros | **matiza** | plano por metro, punto por kilo (B/C, H-3.4); las prendas propias son de nombre plano (A, H-3.17); R-25 (D) dice que el Taller compra en los tres modos | aguanta para tejido plano; con punto, d.6 deja a la compra y a la factura en kilos sin conversión |
| **H6** · el consumo sale de Audaces, se escribe una vez y lo medido lo corrige | **matiza** | el consumo de un CAD es de una marcada y cambia 5,6-9,1 % con las tallas (B, H-3.1); lo medido mezcla cinco causas (H-3.6); el ancho no entra (H-3.3) | «una vez en el modelo» es un punto de partida, no un número firme; el medido corrige la capa 3, no la 1 |
| **H8** · se pierde menos de 3 % entre corte y prenda vendible | **matiza** | como huecos entre moldes no (unos 20-28 % del área en un estudio con CAD, B; 10-21 % en tres referencias peruanas débiles, H-3.7); como prendas perdidas es plausible en planta (C, H-3.8); para una primera orden no hay dato | 3 % solo vale para una de las tres «mermas» y sin dato propio |
| **H11** · se puede cortar de más hasta 10 % | **matiza** | exportadores 2-5 % (C, H-3.9); el corte es un múltiplo de capas × prendas por marcada (B); ADR-0415 usa otra regla | el 10 % no tiene respaldo; en series cortas es plausible, no probado |
| **H12** · una orden es un modelo con sus colores y tallas | **matiza** | el plan de corte se arma con cantidades, tallas y colores (B); cada color tiene su tendido (C, H-3.14); ~3,9 colores por modelo propio (A); ancho y tono cambian por color (C) | la orden por modelo aguanta para planear; la tela y el tono se reparten por color, no por modelo |

## 7 · Contraejemplos (uno como mínimo por frente; hay cinco)

1. **La tabla de hilo del INA no es para prendas de vestir** (B): el consumo de hilo de una prenda se mide en una muestra; la razón por puntada sirve para sábanas o cortinas (H-3.10).
2. **Ensanchar la marcada 1-2 cm movió poco** (B, H-3.3) aunque «el ancho manda»: lo que pesa más es cambiar de tela (140 cm contra 150 cm en un blog baja el consumo ~10 %; C, textiltelar).
3. **El reposo largo no siempre funciona** (C): en tendidos largos casi no se relaja el punto; algo que los vendedores de máquinas presentan como regla.
4. **La merma de corte en Perú no es un solo número**: 9,93 % promedio en 27 mypes frente a ~20 % en dos casos concretos (B/C, H-3.7); depende de la prenda y la tela.
5. **El «bueno» de planta (97-98 %) puede no valer** para una primera orden (H-3.8).

## 8 · Lo que el Frente 0 me asignó

| Hueco | Estado |
|---|---|
| R-25 (metro, kilo, rollo) contra d.6 (solo metros) | **parcial:** plano por metro, punto por kilo (B/C); falta saber qué corta el Taller (A: las prendas propias son de nombre plano) |
| Qué entrega Audaces | **sin dato público:** solo la ficha comercial; falta un reporte real |
| Merma de tela, ancho útil, empalmes, defectos y desvío real | **parcial:** magnitudes de fuentes ajenas (§4); el desvío real de CAYLA no existe (0 órdenes) |
| Reposo y encogimiento | **sin plazo público;** solo prácticas (C) |
| Retazos | **parcial:** valor y cantidad sin dato; un caso peruano de clasificación por peso (B) |
| Avíos: unidad de compra y de consumo | **parcial:** hilo con cifras (B); cierres, botones, elástico y etiquetas sin dato público |
| Lote de tinte y tono entre lotes | **parcial:** práctica de planta grande (C); nada de talleres pequeños |
| Reservas | **sin dato público** de talleres pequeños (§5, H-3.15) |

## Lo que no encontré

- **Presupuesto de búsquedas agotado.** No alcancé a buscar: tolerancias de tono entre lotes (ΔE) en una fuente primaria, precio y uso de retazos en Lima, tratamiento tributario de la merma (lo dejo para el contador, ver preguntas), ni cómo reservan tela los talleres pequeños.
- **Ningún dato público de talleres de ~10 operarias** sobre desvío real de tela, defectos o reclamos; todo lo cuantitativo es de plantas grandes (C), de ejemplos de consultor (C) o de casos peruanos únicos (B).
- **Formato real de un reporte de Audaces** (por talla, por marcada, promedio): solo existe la ficha comercial.
- **Enlaces que no pude abrir:** ASTM (sitio principal) y ANSI, 403; Springer (redirige a una página de acceso), ScienceDirect, fibre2fashion e `yadda.icm.edu.pl`, 403/405; el informe de suficiencia de la UNI de 2010 sobre mermas del tejido de punto y la tesis PUCP de corte (2011, escaneada) no devolvieron texto; la tesis UTN de Ecuador (10-30 % de merma en punto) respondió 410; el manual SENATI dio error de lectura. Cifras que vi solo en un resumen de búsqueda (retazos de 12 % y 21 %, 10-30 % en punto) **no las uso como evidencia**.
- **Listados de venta de telas** de un mercado en línea peruano (por kilo y por metro): solo por resumen de búsqueda; el enlace dio 403. No hay precio ni unidad confirmada.
- **Un dato duro propio** que no existe: ninguna orden cerrada, ningún `producto_consumos`, ningún lote (0 filas; A).

## Preguntas que solo CAYLA puede contestar

HECHO (solo el Taller sabe cómo es):
1. ¿Las prendas que corta el Taller son sobre todo de tela que compras por metro (lino, popelina, satín) o también de tela que compras por kilo (jersey, franela)?
2. Cuando te llega un rollo, ¿lo mides en metros, lo pesas o te fías de lo que dice la factura? ¿El ancho que te dicen es el total o el que se puede cortar?
3. ¿Cuánto mide o pesa un rollo típico? ¿Compras rollos enteros o cortes sueltos?
4. ¿Qué te entrega Audaces: el consumo de una talla, de cada talla o de un promedio del modelo? ¿Ese número ya incluye lo que sobra entre molde y molde? (Pedir el reporte de un modelo real.)
5. En tu última orden: ¿cuántos metros compraste, cuántos te dijo el programa que necesitabas y cuántos gastaste de verdad?
6. ¿Qué haces con la punta del rollo que no alcanza para otro tendido? ¿La empalmas, la guardas, la botas?
7. ¿Dejas reposar la tela antes de cortar? ¿Cuánto? ¿Cuánto encoge después de lavarla?
8. ¿Revisas la tela al recibirla (defectos, largo, ancho, tono)? ¿Quién? Si viene fallada o corta, ¿qué haces y a quién le reclamas?
9. ¿Todos los rollos de un mismo color de una prenda vienen del mismo lote de tinte? ¿Alguna vez salió un tono distinto entre rollos?
10. ¿Cuántas prendas de más cortas sobre lo planeado y por qué (reponer falladas, gastar la tela que ya compraste, que el tendido no da exacto)?
11. De las últimas tres órdenes, ¿cuántas prendas se perdieron entre cortar y poder venderlas (falladas, segundas, faltantes)?
12. ¿Qué avíos pone el Taller y cuáles el servicio? ¿Cuáles anotas por prenda (cierre, botones, etiquetas) y cuáles por lote (hilo, elástico)? ¿En qué unidad los compras (cono, docena, gruesa, ciento)?
13. ¿Quién apunta cuánta tela se usó, cuándo y dónde (cuaderno, hoja de corte, chat)?
14. ¿Qué haces con los retazos: los vendes, los regalas, los botas? ¿Cuánto crees que sobra?
15. ¿Cómo evitas hoy prometer la misma tela a dos órdenes?
16. ¿Una misma tela sirve a más de un modelo? ¿Cortas todos los colores de un modelo el mismo día?
17. **Para el contador (tributario, sin afirmar nada de memoria):** ¿cómo se sustenta y declara la merma de tela y la venta de retazos, y qué papel pide?

DECISIÓN (preferencia de Felipe):
18. Para calcular cuánta tela pedir, ¿prefieres usar el consumo que dice Audaces más un margen que tú fijas, o lo que realmente gastaste en las últimas órdenes del mismo modelo? (H6)
19. El margen por puntas, encogimiento y fallas, ¿lo quieres igual para todas las telas o distinto por tela? (H-3.18)
20. ¿Si el Taller llega a cortar tela de punto, quieres anotarla en kilos como la compras o en metros? **REABRE** ADR-0400 d.6.
21. ¿Hasta cuánto de más puedes cortar sin que sea error: un porcentaje fijo o unas pocas prendas por talla? **REABRE** ADR-0400 d.7 y ADR-0415.

## Fuentes

Todas consultadas el 2026-10-16. «Vivo» = abrió bien. Los PDF que la herramienta de lectura guardó en su caché quedaron fuera del repo; no se descargó nada al repo.

**A · base y repo (SELECT)**: proyecto `cayla-dynamic`, schema `retail`: `tejidos`, `productos`, `marcas`, `variantes`, `tallas`, `insumos`, `insumo_lotes`, `movimientos_insumo`, `producciones`, `producto_consumos`, `ordenes_insumo` (0 filas en las cinco últimas). `supabase/migrations/20260917145000_insumos_taller_reconstruido.sql:64-66`; `docs/datos/15-COMO-OPERA-CAYLA.md:372-432` (R-25 a R-31); ADR-0400 (rama `claude/production-module-redesign-136cca`).

| Nivel | Fuente | Enlace | Estado |
|---|---|---|---|
| B | Zhezhova et al. 2019, Advanced Technologies 8(2) | https://eprints.ugd.edu.mk/23449/1/c12.pdf | vivo; leí el artículo completo |
| B | Jordeva et al. 2024 (solo resumen) | https://eprints.ugd.edu.mk/34439/ | vivo |
| B | INTI, consumo de hilo (sep-2025) | https://app.inti.gob.ar/textil/consumoHilo.pdf | vivo |
| B | INA Costa Rica, tabla Coats de hilo | https://www.inavirtual.ed.cr/pluginfile.php/2861441/mod_resource/content/1/exportado/assets/consumohilo.pdf | vivo |
| B | ASTM D3887-96 (alcance, tienda ASTM) | https://store.astm.org/d3887-96.html | vivo; texto completo de pago |
| B | ASTM D5430-26 (alcance, tienda ASTM) | https://store.astm.org/d5430-26.html | vivo; texto completo de pago |
| B | LACCEI 2023, 5S, ABC y gestión de residuos, Trujillo | https://laccei.org/LEIRD2023-VirtualEdition/papers/Contribution_161_final_a.pdf | vivo; leído completo |
| B | UCSM 2021, abrigos de alpaca plana, Arequipa (solo resumen) | https://repositorio.ucsm.edu.pe/bitstreams/b04f4eae-5ccc-419b-a3d1-5cc031ea4e64/download | vivo |
| B/C | USAT 2021, sistema de corte automatizado (cita a Bonilla 2015 e Iturrizaga 2015, no abiertos) | https://repositorio.usat.edu.pe/bitstreams/43dec555-5b31-4500-ab1b-0af66c4bd5df/download | vivo |
| C | Audaces, ficha de marcada | https://audaces.com/en/solutions/marker | vivo |
| C | Audaces, cálculo de consumo (fórmula con inconsistencia) | https://audaces.com/en?p=161806 | vivo |
| C | Audaces, aprovechamiento y tipos de encaje | https://audaces.com/pt-br/blog/aproveitamento-tecido · https://audaces.com/pt-br/blog/tipos-de-encaixe-como-aproveitar-melhor-o-tecido | vivos |
| C | Ambastha 2012, Performance Measurement Tools 3 | https://apparelresources.com/business-news/manufacturing/performance-measurement-tools-3-cutting-production-planning/ | vivo |
| C | ApparelResources, Fabric Management; Fabric Utilization I | https://apparelresources.com/business-news/manufacturing/fabric-management-saving-fabric-or-just-increasing-dead-stock/ · https://apparelresources.com/business-news/manufacturing/fabric-utilization-i-cut-order-planning/ | vivos |
| C | OCS: kg a metros; por qué punto en kg; cut-to-ship; 9 consejos; fin de rollo; informes antes de cortar; inspección de rollos; consumo; promedio de avíos | https://www.onlineclothingstudy.com/2015/10/how-to-convert-knitted-fabric.html · https://www.onlineclothingstudy.com/2017/08/why-knit-fabric-consumption-is.html · https://onlineclothingstudy.com/2013/10/what-is-cut-to-ship-ratio-in-apparel.html · https://www.onlineclothingstudy.com/2017/05/9-tips-to-save-fabric-in-cutting-room.html · https://onlineclothingstudy.com/?p=10154 · https://onlineclothingstudy.com/?p=10983 · https://onlineclothingstudy.com/?p=9016 · https://onlineclothingstudy.com/2020/04/how-do-we-calculate-fabric-consumption.html · https://onlineclothingstudy.com/2022/12/sop-for-calculating-initial-trims.html | vivos |
| C | Fashion-Incubator: ancho útil; punto que crece | https://fashion-incubator.com/what-is-cuttable-width/ · https://fashion-incubator.com/pop-quiz-why-do-knits-get-larger/ | vivos |
| C | todosloshechos.es, metros por kilo | https://todosloshechos.es/cuantos-metros-hay-en-un-kilo-de-tela | vivo |
| C | textiltelar, consumo de tela | https://textiltelar.com/consumo-tela-produccion-prendas/ | vivo |
| C | WavePLM, plan de corte | https://blog.waveplm.com/cut-order-planning-for-market-efficiency/ | vivo |
| C | Oshima (vendedor), reposo | https://www.oshima.com.tw/blog/fabric-relaxing-preshrinking-before-cutting | vivo |
| sin letra | listados de un mercado en línea peruano (por kilo y metro), solo resumen de búsqueda | https://listado.mercadolibre.com.pe/telas-por-kilo | **403 al abrirlo** |
| sin usar | Springer, Fashion and Textiles 2021 (tabla de retazos) | https://fashionandtextiles.springeropen.com/articles/10.1186/s40691-021-00262-9/tables/1 | redirige a una página de acceso |
| sin usar | UNI 2010, mermas del tejido de punto | https://repositorio.uni.edu.pe/bitstream/20.500.14076/9486/1/leon_qd.pdf | sin texto |
| sin usar | UTN Ecuador 2014, merma en punto | https://repositorio.utn.edu.ec/jspui/bitstream/123456789/3784/1/04%20IT%20163%20TESIS.pdf | **410, murió** |
