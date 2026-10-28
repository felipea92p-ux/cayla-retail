# Espacio y mix por categoría: qué hacen otras marcas y qué aplica a CAYLA

> **Origen:** investigación profunda pedida por Felipe el 2026-09-30 (workflow `wf_22384772-855`): 6 investigadores por tema, un
> refutador independiente por cada hallazgo clave (máximo 3 por tema) y una síntesis; 25 agentes, 0 errores. Alimenta
> ADR-0208 decisión 12 (bloque 6) y `docs/backlog/2026-09-29-capacity-suggestion-formula-f54521.md`.
>
> **Cómo leerlo:** el informe lo redactó el agente de síntesis, no una persona. Lo que sostiene cada afirmación es el veredicto
> entre corchetes. Tres límites que conviene recordar: (1) las cifras de prendas por m² vienen de una consultora colombiana y de
> blogs de mayoristas, sin fuente primaria; (2) la elasticidad 0,17 es de góndolas de supermercado, no de moda; (3) no se
> encontró ninguna marca peruana ni ninguna tienda de 6 a 60 m² con datos públicos. Las secciones «Objeción» y «Lo que no pidió»
> son de la síntesis; las respuestas de Felipe y lo que cambia en el diseño están en el backlog.

---

# Informe para Felipe: piso, mix y arranque de una sede nueva en CAYLA

Fecha: 2026-09-30. Sedes: TRU 20 m2, AQP 60 m2, LIM stand de 6 m2.

**Cómo leer los corchetes.** [matizado] significa verificado por un refutador independiente, con la salvedad escrita en el texto. Ningún hallazgo salió "confirmado" sin salvedad. [no verificado] significa que nadie lo contrastó, así que es una pista y no un hecho. [inferencia propia] es un cálculo o una propuesta mía, no un dato. [descartado] significa que el refutador lo desmontó.

Los códigos indican el origen: Z = Zara, P = marcas premium, H = marcas pequeñas, D = densidad, E = espacio y ventas, M = mix.

**Resumen en seis líneas**
- Ninguna fuente pública revisada publica prendas por m2 ni por m3 para Zara, Ralph Lauren ni marcas pequeñas. Que no lo publiquen no prueba que no lo usen por dentro. [matizado: Z6, P-F1, H2, D-F3]
- La unidad que sí usan los proveedores de muebles es el metro lineal de riel. Son unas 20 prendas de mujer por metro, y menos en casacas. [matizado: D-F1]
- Tu hipótesis de 20 prendas por m3 funciona para el volumen de un mueble de colgado lleno. No funciona para el volumen del local. [matizado: D-F2]
- Más espacio vende más, pero mucho menos que proporcionalmente (elasticidad típica de 0,17 a 0,21). Casi toda la evidencia es de supermercado, no de moda. [matizado: E-F1, P-F5]
- Repartir el piso según ventas pasadas sí repite el pasado, porque las ventas ya reflejan el espacio que tuvo cada categoría. [matizado: E-F2]
- Zara decide el surtido desde la central. Lo que optimiza con matemática es el envío de stock escaso del almacén, no cuánto piso tiene cada categoría. [matizado: Z1, Z6]

---

## 1) Qué hacen Zara, Ralph Lauren y otras marcas (solo lo verificado)

### Zara / Inditex
Los datos vienen de los artículos de Caro y Gallien, que trabajaron con ejecutivos de Zara. Describen el sistema hacia 2006-2010, con unas 1.500 tiendas y unas 11.000 referencias por temporada.

- **La central decide el surtido.** Cada semana la encargada recibe "la oferta", un listado de lo que puede pedir del almacén. La central toma la decisión de surtido y el envío queda subordinado a ella.
  - La encargada igual pide cantidades por talla, y puede pedir cero.
  - En el modelo académico, la capacidad de exhibición es un tope fijo de N productos de igual espacio. Es una simplificación declarada.
  - Ningún artículo dice cómo fija Zara ese N por tienda ni cómo reparte por categoría. Por eso no se puede afirmar que Zara no reparta espacio según ventas, ni que sí lo haga. [matizado: Z1]
- **Hay un mínimo de exhibición por artículo, pero no es una política formal.** Cuando se agota una talla clave (M, o el tramo S-M-L), el personal suele pasar el artículo entero al almacén.
  - Los autores lo midieron con un indicador indirecto, días sin venta tras agotarse esa talla. Dio 89% de adherencia en unas 900 tiendas y 118 referencias de mujer.
  - La curva de "cero ventas bajo un umbral" es una ilustración del modelo, no una curva medida.
  - La regla de "dos colores clave" no estaba implementada en tiendas.
  - Da un piso de unidades por artículo. No da capacidad por m2 ni mix por categoría. [matizado: Z2]
- **La matemática pesada es de reposición, no de espacio.** Son unas 15.000 corridas semanales del modelo, 6 millones de unidades repartidas y más de 120 millones de euros. Hay un equipo de unas 60 personas y dos servidores dedicados.
  - Optimiza cómo repartir stock escaso del almacén a las tiendas, dos veces por semana.
  - Las sugerencias del modelo casi nunca fueron editadas por el equipo.
  - Los pedidos de las encargadas venían inflados porque cobraban por ventas totales. Los autores lo corrigen.
  - Son cifras de 2007-2008. El problema de Zara (repartir stock entre más de mil tiendas) no es el tuyo (cuánto cabe en 20, 60 y 6 m2). [matizado: Z6]

Analogía de tienda: Zara es una central que decide qué lleva cada vitrina. La encargada solo dice cuántas tallas necesita de lo que la central le ofrece.

### Ralph Lauren
Los datos son del 10-K del año fiscal 2026 (cierre 28-mar-2026).

- **Formatos.** Tiene 594 tiendas (287 Ralph Lauren y 307 outlets) y 644 concesiones, con unos 4,1 y 0,7 millones de pies cuadrados.
  - Las tiendas Ralph Lauren miden de 37 a 3.520 m2. Los outlets miden de unos 100 a 2.630 m2. Las concesiones miden de unos 9 a 511 m2.
  - El 10-K no publica ventas por pie cuadrado ni comparables por formato. Sí publica comparables por región y por canal.
  - No divulga una regla de densidad, pero eso no prueba que no la tenga. [matizado: P-F1]
- **Herramientas.** El 10-K confirma el despliegue global de herramientas de asignación de mercadería y de planificación de demanda de largo plazo. No menciona planificación de espacio ni de surtido.
  - Una vacante de enero de 2026 sugiere que surtido, asignación y espacio se implantan como capacidades de un mismo sistema nuevo. Es un indicio, no una confirmación.
  - El reabastecimiento de 2 a 5 días del 10-K es para clientes mayoristas, no para sus tiendas propias. [matizado: P-F2]
- **Lo más cercano a CAYLA** es la cola baja del rango: concesiones desde unos 9 m2 (parecido a LIM) y tiendas desde unos 37 m2 (parecido a TRU). El 10-K no dice cuántas prendas ni qué ventas tienen esas unidades. Los promedios (unos 640 m2 por tienda) no sirven de referencia para ti. [matizado: P-F1]

### Reformation (moda femenina, formato Retail X)
- Muestra una prenda por cada referencia vendible. La clienta arma su probador en una pantalla.
- Hay 49 tiendas Retail X. En 2025 tuvieron +8,5% de ticket y unos +270 puntos básicos de conversión frente a las tiendas sin ese formato.
- Es una comparación simple, sin controles publicados. No prueba causalidad.
- El 90% del ingreso es venta directa (web y tiendas) y el 10% es mayorista. Las tiendas pesan entre 21% y 30% del total (cuenta derivada).
- Las tiendas miden unos 100 a 315 m2 según fuentes secundarias. Son de 2 a 15 veces más grandes que AQP.
- Que el stock profundo esté fuera del piso es una inferencia, no un dato del prospecto. [matizado: H1]

### Bonobos (Guideshops)
- Eran tiendas chicas, sin inventario para llevar, con pedido cerrado en la web.
- El "doble de valor de pedido" es una cifra propia sin auditar, y compara a quien va a la tienda con el visitante promedio de la web.
- No hay evidencia de ventas por pie cuadrado ni de que el formato fuera rentable a largo plazo.
- No sirve como referencia de densidad, porque CAYLA vende con inventario en piso. [matizado: H3]

### Práctica general de muebles
La capacidad del piso se expresa en metros lineales de riel. Se habla de unas 2 pulgadas (5 cm) por prenda de mujer y de llenar el mueble entre 60% y 80% de su capacidad. Las fuentes son proveedores de racks y software, no estudios. [matizado: D-F1, H2]

---

## 2) Cuántas prendas caben

### Por metro lineal de riel (la unidad que usa el oficio)
- Se calcula con unas 2 pulgadas por prenda de mujer liviana, que da unas 20 por metro.
- Las casacas y abrigos pesados llegan a 4 pulgadas, unas 10 por metro.
- Los jeans y chaquetas van por encima de 2 pulgadas.
- En exhibición apretada, un proveedor da 25 a 30 camisas o blusas por metro, 15 a 20 vestidos y 10 a 15 abrigos.
- Son heurísticas de vendedores de racks, no promedios medidos. Para mezcla de mujer conviene partir de 15 a 20 por metro, con vestidos y casacas por debajo. [matizado: D-F1]
- Esto solo cubre ropa colgada de lado. No cubre lo doblado ni lo exhibido de frente, que en CAYLA es parte importante. [matizado: D-F1]

### Por m3: ¿sirve tu 20 por m3?
- **Como densidad de un mueble de colgado lleno, sí.** Con 20 prendas por metro, 0,5 a 0,6 m de fondo y 1,5 a 1,8 m de altura de riel, salen unas 18 a 33 prendas por m3 de mueble. Es un cálculo con fondo y altura supuestos, no un estándar publicado.
  - Con casacas pesadas (4 pulgadas) baja a unas 9 a 16 por m3. [matizado: D-F2]
- **Como densidad del local, no.** El aire entre el riel y el techo no guarda ropa. La altura del techo no cambia cuántas prendas caben.
  - Con techo de 3 m, 20 por m3 equivale a 60 prendas por m2. Eso da 1.200 en TRU, 3.600 en AQP y 360 en LIM. La altura de techo de 3 m es un supuesto mío, sin medida real de tus locales.
  - Las referencias prácticas de prendas en piso por m2 son estas (consultora colombiana Melt, blogs y mayoristas, sin fuente primaria): premium y lujo 6, marca media 12, moda rápida 20 a 25, bajo costo 30 a 40. Otro mayorista español da 8 a 12 al abrir y 10 a 20 en casual.
  - Con esas cifras, 20 por m3 sobreestima unas 4 a 9 veces en marca media y premium. [matizado: D-F3]
- Una advertencia: en un stand pequeño como LIM, con mucha pared y sin circulación interior, la densidad por m2 puede salir más alta que el promedio. [inferencia propia sobre D-F3]

### Comparación de totales de piso

| Sede | m2 | Bajo (8 por m2) | Base (12 por m2) | Alto (16 por m2) | Tu 20 por m3 con techo de 3 m |
|---|---|---|---|---|---|
| TRU | 20 | 160 | 240 | 320 | 1.200 |
| AQP | 60 | 480 | 720 | 960 | 3.600 |
| LIM | 6 | 48 | 72 | 96 | 360 |

Los rangos usan las cifras de Melt (12) y del mayorista español (8 a 12 al abrir). Las tres primeras columnas de cifras son cálculo mío. [inferencia propia sobre D-F3]

### Prendas no es lo mismo que estilos vendibles
Si cada estilo necesita al menos 1 a 3 unidades visibles (la talla central M, o el tramo S-M-L), las 240 prendas de TRU dan como máximo unos 80 estilos con 3 tallas. Con 45 categorías son menos de 2 estilos por categoría. En LIM, 72 prendas son unos 24 estilos. [inferencia propia sobre Z2]

---

## 3) Qué dice la evidencia sobre espacio y ventas, y el riesgo de repetir el pasado

### Cuánto vende el espacio extra
- El metaanálisis de Eisend (2014) reúne 1.268 estimaciones de 31 estudios. La elasticidad media es 0,17: más baja en productos básicos, más alta en compras por impulso.
- Aumentar el espacio da elasticidades mayores que recortarlo.
- Duplicar el espacio sube las ventas de esa categoría entre 12% y 21%, según cómo se defina la elasticidad. Los experimentos clásicos dan cerca de 0,2.
- Son datos de góndola de supermercado, farmacia y tiendas de variedades. Eisend ni siquiera clasifica moda, y en ropa la exhibición visual pesa más de lo que captura esa cifra. Sirve como orden de magnitud (rendimientos decrecientes), no como parámetro para CAYLA. [matizado: E-F1, P-F5]
- La consecuencia práctica: "el % de piso es igual al % de ventas" supone implícitamente elasticidad 1. La evidencia dice cerca de 0,2. [inferencia propia sobre E-F1]

### El riesgo de repetir el pasado es real
- Van Dijk y coautores (2004) muestran que, si el espacio se asignó según lo que vende, las estimaciones con datos históricos salen sesgadas al alza. En champú, unos 0,85 contra unos 0,2 con métodos corregidos.
- La forma limpia de separar el efecto del espacio del efecto del producto es variar el espacio de manera independiente de la demanda esperada. [matizado: E-F2]
- El método espacial de Van Dijk necesita decenas de tiendas. Con tres sedes no se puede replicar. [matizado: E-F2]

### El experimento más citado rindió poco, pero con matices
- Drèze, Hoch y Purk (1994) probaron en 60 supermercados Dominick's, con 8 categorías.
  - Personalizar los planogramas por grupo de tiendas dio +3,9% de ventas en promedio, con un rango de -2,0% a +8,4% por categoría.
  - Es una cota inferior frente a un planograma de cadena que ya usaba datos de movimiento.
  - El paquete mezclaba frentes, ítems eliminados, altura y posición.
- Con el modelo por marca, la posición importó más que los frentes y casi todo estaba sobreasignado. Pero el umbral de saturación varía: en jugos y sopas más espacio sí habría vendido más.
- Las tiendas eran de más de 45.000 pies cuadrados. Los autores dicen que donde el espacio es muy justo pesa más tener el inventario correcto en piso, que es tu caso en TRU y LIM.
- No hay experimento de este diseño en moda, ni en tiendas de 6 a 60 m2. [matizado: E-F3]

### La ilustración con tus datos
- TRU vende unos S/3.080 por m2 en el trimestre y AQP unos S/1.670. AQP tiene 3 veces el área y vende 1,63 veces lo de TRU.
- Eso da una "elasticidad entre sedes" de 0,44. Mezcla ciudad, tráfico y antigüedad de la tienda, y se basa en n=2.
- Sirve como alarma para mirar AQP, no como orden de recortarla. [ilustración propia, no estimación causal]

### La venta depende de lo que hay en piso
En el modelo de Zara, la venta esperada depende del perfil completo de tallas en exhibición. Por eso una categoría con poco espacio o con curva rota vende poco, y eso no prueba que tenga poca demanda. [matizado: Z2]

---

## 4) Cómo se define un mix por categoría

Un mix es una tabla por sede: para cada categoría (o familia), qué parte del piso le toca. Las fuentes muestran cuatro maneras de llenarla, y ninguna está validada para moda de tres sedes.

1. **Roles de categoría (destino, rutina, ocasional o estacional, conveniencia).**
   - Nació en supermercado. El rol destino se mide por el peso de la categoría en la elección de tienda.
   - Los otros roles se asignan combinando participación en ventas, margen, penetración, frecuencia, tamaño y crecimiento. La elección de tienda entra como validación cuando hay datos.
   - Medirla exige un panel de compras de clientas en varias tiendas, que CAYLA no tiene. Por eso el rol lo decide Felipe por juicio y se verifica después con datos propios. [matizado: M-F1]
2. **Agrupar tiendas parecidas.**
   - Fisher y Rajaram (2000) agruparon tiendas de una cadena de ropa femenina de EE. UU. (línea de tejidos de punto, datos de 1993-94). Agrupar por ventas pronosticó mejor que agrupar por descriptores (clima, ubicación, tipo de tienda).
   - Al mirar los grupos, el clima fue el factor común principal. El tamaño y la ubicación pesaron poco en el patrón de qué se vende, no en cuánto se vende.
   - El "50% de error" del pronóstico subjetivo es una afirmación de la introducción, sin medición. El "más de 100% de utilidad" es una proyección. No hay réplica independiente de "clima por encima de tamaño". [matizado: M-F2]
   - Con tres sedes no hace falta clustering estadístico. Lo transferible es probar en pequeño y corregir. [inferencia propia sobre M-F2]
3. **Tienda nueva.** No hay regla pública validada para el mix de una tienda sin historia. Lo documentado es arrancar con tiendas parecidas y corregir con las primeras ventas.
   - El método de análogos pronostica ventas totales, no mix por categoría. Con solo dos análogos reales (TRU y AQP) es juicio informado, no estadística. [matizado: M-F6]
4. **Índice de espacio contra ventas y plan de compra por categoría (open-to-buy).** Son prácticas de guías comerciales, sin validación. [no verificado: P-F7, M-F5, M-F7]

Zara no publica un mix por categoría. Sus decisiones por artículo y tienda se toman cada semana sobre el surtido que fija la central. [matizado: Z1, Z6]

---

## 5) Recomendación para CAYLA

### Objeción
La pregunta (c) está mal planteada en su unidad. El metro cúbico mezcla el aire con la ropa, y la altura del techo no cambia cuántas prendas caben. Con techo de 3 m, tu 20 por m3 lleva a AQP a 3.600 prendas, unas 4 a 9 veces lo que las consultoras observan en marca media. La unidad correcta es el metro lineal de mueble. Para el total de arranque basta el m2 de sala.

En (b), la evidencia dice que afinar 45 porcentajes al decimal rinde poco. El beneficio medido en supermercado es de un dígito bajo (+3,9% de Drèze; elasticidad cerca de 0,2). Y casi toda la evidencia no es de moda. La energía debe ir a posición, mínimos de presentación y medición. [matizado: E-F1, E-F3]

### Lo que no pidió
Si hoy no se registra, empieza a registrar cada semana qué espacio real tuvo cada categoría (por pared o mueble) y cuántos días tuvo la curva de tallas rota. Sin ese dato nadie podrá separar el efecto del espacio del efecto del producto. Dentro de un año tendrás el mismo debate, sin datos y con la misma duda.

Tu exhibición cambia por pared y por semana. Anotada, eso es un experimento gratis: cada categoría se compara contra sí misma antes y después. [inferencia propia sobre E-F2]

### (a) Cuántas prendas debe tener el piso
Usa dos métodos que deben coincidir en orden de magnitud. Si discrepan, confía en el de metros lineales.

1. **Método simple, hoy.** Prendas de piso = m2 de sala × 12, con rango de 8 a 16. Arranca en el extremo bajo (unas 8 a 10 por m2) y sube si las ventas muestran que faltan prendas. [inferencia propia sobre D-F3]
   - Esos 12 son lo que las tiendas de marca media cargan en la práctica, no la capacidad máxima. No les apliques además el 60% a 80%.
2. **Método preciso, cuando haya plano.** Capacidad nominal = suma de (metros lineales × tasa por categoría). Usa 15 a 20 para colgado liviano y unas 10 para casacas. Para lo doblado, mide tus propios muebles. Piso objetivo = capacidad nominal × 60% a 80%. [matizado: D-F1; 60% a 80% según proveedor de software: H2]
   - Ilustración aritmética: cada 10 metros de riel de ropa mixta de mujer son 150 a 200 prendas nominales, y 90 a 160 de objetivo.
3. **Calibración con lo tuyo.** Antes de abrir la sede nueva, cuenta con el conteo físico las prendas exhibidas y mide los m2 y metros lineales de TRU, AQP y LIM. Tu propia densidad reemplaza el 12 por m2 de las consultoras. Es el paso más barato y más valioso.

### (c) Arranque de sede nueva sin historia
Con los 12 por m2 de base, el arranque es TRU 240 prendas, AQP 720 y LIM 72 (rango en la tabla de la sección 2). Si la sede nueva se parece a una propia, usa la densidad medida de esa sede en vez del 12.

DECIDÍ: total de arranque = m2 de sala × 12 (rango 8-16, empezando bajo). Cambiar a metros lineales × tasa × 60-80% cuando haya plano, y a densidad propia cuando esté medida.

DESCARTÉ: 20 prendas por m3 del local, porque depende de la altura del techo, que no cambia cuántas prendas caben. Con techo de 3 m da 3.600 en AQP, unas 4 a 9 veces lo que se observa en marca media.

SE ROMPE SI: la ropa de CAYLA es mayormente doblada (jeans, polos), que cabe mucho más por metro que lo colgado. O si una sede nueva tiene mucha pared útil y poco pasillo, como un stand, y el riel real da el doble de prendas por m2 que el promedio. Por eso el 12 es solo un arranque, y el conteo de TRU y AQP manda.

### (b) Cómo fijar y ajustar el mix por sede
1. **Familias y roles.** Felipe agrupa las 45 categorías en 6 a 8 familias (propuesta mía, sin respaldo) y asigna el rol de cada una por juicio. No lo derives de una tabla de ventas. [matizado: M-F1; inferencia propia]
2. **Mínimo de presentación por familia.** Mantén la curva de tallas clave completa y un mínimo de estilos visibles. Lo que no llega al mínimo no se exhibe en esa sede.
   - En LIM (72 prendas) y en TRU (240) no entrarán las 45 categorías. La sede muestra las familias que sí llegan al mínimo, y el resto se pide o se ve en otra sede. [inferencia propia sobre Z2]
3. **Reparto del resto.** Reparte según las ventas propias de esa sede, corregidas por los días sin stock o con curva rota. Mueve solo unos pocos puntos por ciclo, para poder medir el efecto y no confundirlo con la temporada. [inferencia propia sobre E-F2, Z6]
4. **Reserva para probar.** Dedica una parte pequeña del piso de cada sede a probar categorías nuevas o con poca exposición. El porcentaje lo decides tú, porque ninguna fuente lo respalda. [inferencia propia sobre Z1]
5. **Ajuste por clima y tipo de clienta.** Este ajuste lo define Felipe. La evidencia dice que el clima pesa más que el tamaño en el patrón de ventas, pero es de una sola cadena y sin réplica. [matizado: M-F2]
6. **Sede nueva.** Copia el mix de la sede análoga y revisa las primeras 4 a 6 semanas con lectura semanal. El plazo de 4 a 6 semanas es propuesta mía. Advierte en el ERP que con dos análogos es juicio, no estadística. [matizado: M-F6; inferencia propia]

DECIDÍ: mix = mínimo de presentación por familia + resto proporcional a ventas propias corregidas + reserva de prueba, con cambios acotados por ciclo.

DESCARTÉ: "% de piso = % de ventas" puro, porque supone elasticidad 1 (la evidencia dice cerca de 0,2) y repite el pasado. También la optimización completa tipo Zara, que es de reposición y de otra escala.

SE ROMPE SI: se cambian las paredes cada semana sin anotar qué espacio tuvo cada categoría. Sin ese dato la "venta corregida" no se puede calcular y el mix vuelve a ser ventas pasadas disfrazadas.

### Qué medir para corregirlo
- **Espacio real por categoría y semana**, en metros lineales o prendas exhibidas por pared. [inferencia propia sobre E-F2]
- **Días con curva de tallas rota o sin stock por categoría.** Zara distingue la venta observada de las ventas perdidas por quiebre. [matizado: Z6]
- **Venta por metro lineal y por m2, por categoría y sede, como alarma.** Una categoría muy por encima o por debajo revisa su espacio. No se usa como regla de asignación, por la circularidad. [matizado: E-F2; índice espacio/ventas: no verificado, P-F7]
- **Semanas de cobertura del piso** (prendas de piso ÷ venta semanal). Un techo de capacidad atado a la rotación evita llenar el piso con más de lo que la sede vende en un ciclo. Reformation usa "semanas de cobertura", que mide cuánto comprar y no cuánto cabe. [matizado: H2; propuesta propia]
- **Prueba controlada pequeña.** Cambia el espacio de una o dos categorías en una sede y compárala contra sí misma antes y después, con stock completo. Drèze usó 4 semanas de calentamiento y 16 de prueba, con 60 tiendas. Con tres sedes no puedes replicar ese diseño entre tiendas. [matizado: E-F2; inferencia propia]
- **Acierto de la encargada de sede.** Pídele su estimación de lo que se venderá y mide cuánto acierta. No la obedezcas ni la ignores. Zara corrigió los pedidos de sus encargadas porque venían inflados por incentivos de venta. [matizado: Z6; pesarla por su acierto: no verificado, Z4]

### Qué NO copiar de los gigantes por tamaño
- **La optimización a escala de Zara.** Son 15.000 corridas semanales, servidores y un equipo de 60 personas. Con 3 sedes y 45 categorías basta una regla simple con sugerencia que la encargada pueda ajustar. [matizado: Z6]
- **Las cifras absolutas de los gigantes.** Ralph Lauren tiene tiendas de 37 a 3.520 m2, promedio de unos 640 m2. Reformation tiene tiendas de 100 a 315 m2. Ninguna sede tuya llega siquiera a su tienda más chica. [matizado: P-F1, H1]
- **Los formatos sin inventario.** Retail X de Reformation (una muestra por referencia, stock fuera del piso) y los Guideshops de Bonobos dependen de que la clienta pida y reciba después. CAYLA cobra en tienda y vende lo que está en piso. [matizado: H1, H3]
- **El elasticidad 0,17 como parámetro.** Úsala solo como orden de magnitud. [matizado: E-F1]
- **Las cifras de consultoras y blogs como estándar.** Melt y los proveedores de racks son heurísticas útiles para arrancar, no mediciones. [matizado: D-F1, D-F3]

---

## 6) Descartado, sin verificar y lagunas

### Descartado (lo que el refutador desmontó o corrigió)
- **Zara optimiza el espacio de piso, o tiene mix y techos por categoría documentados.** Falso: su modelo optimiza envíos del almacén. El espacio, el mix y los techos por categoría no son prácticas documentadas en estas fuentes. [descartado: Z6]
- **"Que la capacidad sea un dato en el modelo prueba que Zara no reparte según ventas."** No se puede concluir eso. [descartado: Z1]
- **Retail X y Reformation.**
  - "Las tiendas son solo cerca del 10% del ingreso": falso, el 10% es el canal mayorista. [descartado: H1]
  - "El stock profundo no está en el piso" como hecho: es inferencia. [descartado: H1]
- **Bonobos.**
  - "Una sola talla por modelo": las fuentes se contradicen. [descartado: H3]
  - "Ventas por pie cuadrado exponencialmente mayores": sin respaldo. [descartado: H3]
- **Ralph Lauren.**
  - "Tres funciones separadas con herramientas propias": el 10-K no lo dice, y la vacante dice casi lo contrario. [descartado: P-F2]
  - El reabastecimiento de 2 a 5 días es mayorista, no de tiendas propias. [descartado: P-F2]
  - Los promedios de unos 640 m2 por tienda no sirven como referencia para CAYLA. [descartado: P-F1]
- **Elasticidad.**
  - "Duplicar = +12% y reducir a la mitad = -11%" como simétrico: el metaanálisis dice que no es simétrico. [descartado: P-F5]
  - Curhan "observacional": fue un experimento. [descartado: E-F2]
  - Drèze "aleatorizó el espacio entre categorías": aleatorizó frentes dentro de categorías. [descartado: E-F2]
  - Van Dijk "usó aleatorización": usó un método espacial. [descartado: E-F2]
  - "Drèze rindió poco": es lectura del resumidor, no de los autores. [descartado: E-F3]
- **Densidad.**
  - "20 por m3 sobre el local": no está respaldado. [descartado: D-F2]
  - "Sobreestima 2 a 6 veces y 10 a 30 prendas por m2 en todo segmento": el factor real depende del segmento. Son unas 4 a 9 veces en marca media y premium. [descartado: D-F3]
  - "20 por metro es un promedio de industria": es una heurística de proveedores. [descartado: D-F1]
- **Mix.**
  - "El rol de categoría se asigna por peso en elección de tienda y no por ventas": la fuente lo contradice. [descartado: M-F1]
  - "50% de error" como resultado medido: es una afirmación de la introducción. [descartado: M-F2]
  - "Más de 100% de utilidad" como utilidad observada: es una proyección. [descartado: M-F2]
  - "No hay método alguno para tienda nueva": existe el de análogos, que pronostica ventas totales y no mix. [descartado: M-F6]

### Sin verificar (pistas, no hechos)
- **Zara.**
  - Reposición dos veces por semana y vida del artículo de 5 a 6 semanas. [no verificado: Z3]
  - Pronóstico que mezcla el historial con el pedido de la encargada. [no verificado: Z4]
  - Alza de ventas de 3 a 4% en el piloto, y 233 a 353 millones de dólares, que son cifras de los autores. [no verificado: Z4]
  - Inditex 2025: 5.460 tiendas y unos 865 m2 por tienda, cálculo propio. [no verificado: Z5]
  - No hay cifra pública de prendas por m2 ni de stock inicial de tienda nueva. [no verificado: Z7]
- **Marcas premium.**
  - Caso Way Forward de Ralph Lauren (inventario +26% con ventas +7%, 50 tiendas cerradas). [no verificado: P-F3]
  - Formatos de concesión y shop-in-shop, y cifras de Burberry. [no verificado: P-F4]
  - Massimo Dutti cerrando tiendas por ventas por m2. [no verificado: P-F6]
  - Índice de espacio contra ventas como práctica de guías comerciales. [no verificado: P-F7]
- **Marcas pequeñas.**
  - Everlane: primeras tiendas con poco surtido, y ventas de US$4.500 por pie cuadrado. [no verificado: H4]
  - Aritzia: tiendas de unos 930 m2 en adelante, con US$1.000 por pie cuadrado. [no verificado: H5]
  - Sézane: no publica fórmula de espacio. [no verificado: H6]
  - Referencias peruanas de ventas por m2 en malls: accesorios y ropa de 30 a 50 m2 entre US$350 y US$780, fast fashion entre US$1.200 y US$2.000. Son cifras de 2019-2020 de consultores, sin período explícito (mes o año). [no verificado: H7]
- **Densidad.**
  - Capacidad por metro lineal en ropa doblada (13 a 20 prendas por metro de estante por nivel, 100 a 150 por m3). [no verificado: D-F4]
  - 60% a 80% de llenado como objetivo. [no verificado: D-F5]
  - Efecto negativo del apiñamiento percibido (Machleit y coautores). [no verificado: D-F6]
  - Capacidad como suma de metros lineales por tasa. [no verificado: D-F7]
- **Espacio y ventas.**
  - Elasticidad al inventario exhibido ("stock psíquico"). [no verificado: E-F4]
  - Mínimo de exhibición de Zara y piloto de 3 a 4%. [no verificado: E-F5]
  - Más variedad no vende siempre más. [no verificado: E-F6]
  - Mix óptimo muy plano con elasticidad de 0,2, derivación propia. [no verificado: E-F7]
- **Mix.**
  - Zara resolviendo el mix semana a semana. [no verificado: M-F3]
  - Venta cero bajo el umbral de tallas. [no verificado: M-F4]
  - Índice de espacio contra ventas y GMROF como práctica corriente. [no verificado: M-F5]
  - Plan de surtido con open-to-buy. [no verificado: M-F7]

### Lagunas
- No hay benchmark público y primario de prendas por m2 ni por m3 de piso para ninguna marca, ni para tiendas de 6 a 60 m2.
- No hay una elasticidad de espacio medida en moda, ni experimentos aleatorios en tiendas de ropa. Tampoco hay datos de densidad de colgado frente a doblado por marca.
- No hay casos de marcas peruanas o latinoamericanas con manufactura propia que describan su planificación de espacio y surtido.
- No se conocen los datos de CAYLA necesarios para calibrar: altura real de techo de cada local, metros lineales de riel y estante por sede, modo de exhibición por categoría y precio promedio por prenda.
- Varias fuentes no se pudieron abrir (403 o error de certificado). Las versiones publicadas de algunos artículos se verificaron solo por resumen.

---

## 7) Fuentes (URLs de lo usado)

**Zara / Caro y Gallien**
- https://web.mit.edu/jgallien/www/InvMgtRetailNetworkCaroGallien2007.pdf
- http://web.mit.edu/jgallien/www/DynAssortCaroGallienRev2.pdf
- http://web.mit.edu/jgallien/www/ZaraInterfaces2010.pdf
- https://pubsonline.informs.org/doi/10.1287/mnsc.1060.0613
- https://pubsonline.informs.org/doi/10.1287/opre.1090.0698
- https://www.anderson.ucla.edu/faculty_pages/felipe.caro/papers/pdf_FC07.pdf

**Ralph Lauren**
- https://www.sec.gov/Archives/edgar/data/0001037038/000162828026037074/rl-20260328.htm
- https://careers.ralphlauren.com/CareersCorporate/JobDetail/Assortment-Allocation-and-Space-Planning-Director/62400

**Reformation, Bonobos y boutiques**
- https://www.sec.gov/Archives/edgar/data/0001787117/000110465926088733/tm2513004-17_424b4.htm
- https://www.retaildive.com/news/reformation-ipo-profitable-dtc-model-possible/823857/
- https://d3.harvard.edu/platform-rctom/submission/bonobos-a-better-fitting-model-for-a-better-fitting-pant
- https://techcrunch.com/2014/07/03/bonobos-55m
- https://www.retaildive.com/news/why-the-walmart-bonobos-deal-shows-the-way-to-retails-showroom-future/504685/
- https://growyourboutique.com/blog/how-much-inventory-to-start-a-boutique
- https://www.sec.gov/Archives/edgar/data/0001085482/000095015207002944/l25470ae10vk.htm

**Densidad y muebles**
- https://klassicrack.com/articles/garment-spacing-on-retail-racks/
- https://theretailfactory.co.uk/clothes-rail-essential-guide-how-many-clothes-can-i-fit-on-a-free-standing-clothes-rail/
- https://www.shopfittingwarehouse.co.uk/kb-clothes-rail-quick-guide-how-many-clothes-can-i-fit-onto-a-freestanding-clothes-rails/
- https://www.displetech.com/blogs/retail-essence/commercial-clothing-racks-sizes-types-and-capacity-guide
- https://morshopfitting.com/case-study-the-ultimate-guide-to-clothing-racks-for-retail-stores-types-load-capacity-and-layouts/
- https://wair.ai/stock-display-fashion-sales/
- https://www.melt.com.co/cuantas-unidades-deberia-cargar-una-tienda-de-ropa/
- https://traposmoda.es/nuestra-tienda-de-ropa/

**Espacio y ventas**
- https://ucrisportal.univie.ac.at/en/publications/shelf-space-elasticity-a-meta-analysis/
- https://ideas.repec.org/a/eee/jouret/v90y2014i2p168-181.html
- https://sal.aalto.fi/publications/pdf-files/tvai18_public.pdf
- http://davidreiley.com/FieldExperimentsCourse/papers/FullReadingList/DrezeShelfManagement.pdf
- https://link.springer.com/article/10.1023/B:QMEC.0000037079.73934.a2
- https://ideas.repec.org/a/kap/qmktec/v2y2004i3p257-277.html
- https://cdn.vanderbilt.edu/vu-my/wp-content/uploads/sites/950/2014/01/14110230/WileyRetailChapter.pdf
- https://faculty.essec.edu/en/research/1119-estimation-of-product-category-sales-responsiveness-to-allocated-shelf-space/
- https://flora.insead.edu/fichiersti_wp/inseadwp2008/2008-51.pdf

**Mix**
- https://www.anderson.ucla.edu/documents/areas/fac/dotm/bio/pdf_KR04.pdf
- https://pubsonline.informs.org/doi/abs/10.1287/mksc.19.3.266.11800
- https://mpra.ub.uni-muenchen.de/89356/1/MPRA_paper_89356.pdf
- https://www.smu.edu/-/media/site/cox/faculty/research/foxedward/the-role-of-destination-categories.pdf
- https://umbrex.com/resources/frameworks/marketing-frameworks/category-role-framework-e-g-destination-routine-seasonal-convenience/
- https://www.ashokcharan.com/Marketing-Analytics/~cm-category-roles.php
- https://www.solvoyo.com/whitepapers/approaches-to-retail-store-clustering/
- https://www.sec.gov/Archives/edgar/data/0000874214/000119312510055253/d10k.htm
- https://www.toolio.com/post/the-ultimate-guide-to-retail-assortment-planning

**De lo no verificado (solo para seguirles la pista)**
- https://www.inditex.com/itxcomweb/api/media/1da2c9d1-dbca-49fb-9563-982a8a27fae6/INDITEXFullYear2025.pdf?t=1773216267196
- https://retail-insider.com/retail-insider/2026/07/inside-aritzias-expanding-store-and-infrastructure-strategy/
- https://www.adweek.com/commerce/everlanes-newest-retail-store-is-its-biggest/
- https://www.glossy.co/fashion/i-dont-believe-in-having-a-big-strategy-morgane-sezalory-on-sezanes-u-s-expansion/
- https://gestion.pe/economia/empresas/marcas-de-accesorios-de-vestir-puedan-alcanzar-ventas-hasta-de-us-780-por-m2-en-malls-noticia/
- https://gestion.pe/economia/fast-fashion-ventas-peru-llegan-us-2-000-metro-cuadrado-267418-noticia/
- https://retail.town/retailing-overview/measuring-retail-performance-space-productivity/

---

## 8) Preguntas para Felipe (formato de decisión; la opción recomendada va primero)

**P1. ¿En qué unidad fijamos el total de arranque de una sede nueva?**
- A) Prendas por m2 de sala, con 12 como base editable. Ganas: un número que cualquiera puede calcular con solo los m2. Pagas: es un promedio de consultoras que no es tuyo hasta que lo calibres. **Recomendada.**
- B) Metros lineales de mueble × tasa por categoría × 60-80%. Ganas: es la unidad que el oficio usa y la más precisa. Pagas: necesita plano y medir tus muebles antes de abrir.
- C) 20 prendas por m3 de mueble de colgado. Ganas: coincide con tu hipótesis. Pagas: deja fuera lo doblado y exige medir el volumen de cada mueble.
- Si no respondes, ejecuto A hoy y B cuando haya plano.

**P2. ¿Cómo se ve CAYLA en densidad de piso?**
- A) Marca media (unas 12 por m2). **Recomendada:** punto medio, se corrige con tu conteo.
- B) Premium (unas 6 por m2). Ganas: piso aireado que sugiere exclusividad. Pagas: menos prendas para vender y más riesgo de faltar producto.
- C) Moda rápida (20 a 25 por m2). Ganas: más prendas a la vista. Pagas: riesgo de desorden y de más inventario que termina en liquidación.
- Si no respondes, ejecuto A.

**P3. ¿Quién asigna el rol de cada categoría (destino, rutina, estacional, conveniencia)?**
- A) Tú, por juicio, con 6 a 8 familias, y se verifica después con datos de ventas. Ganas: usas lo que sabes de la clienta. Pagas: dedicar una sesión a definirlas. **Recomendada.**
- B) Se deriva de la tabla de ventas. Ganas: automático. Pagas: repite el pasado, y el refutador mostró que el rol no sale solo de las ventas.
- Si no respondes, ejecuto A y te preparo la lista de familias para que la corrijas.

**P4. ¿Cuánto del piso de cada sede se reserva para probar categorías?**
- A) 10%. **Recomendada:** da margen para probar sin descuidar lo que vende. Pagas: menos espacio para lo probado.
- B) 20%. Ganas: aprendes más rápido. Pagas: sacrifica ventas seguras.
- C) 0%. Ganas: todo el piso vende lo probado. Pagas: no aprendes nada nuevo.
- Las tres cifras son propuestas mías, sin respaldo de fuente. Si no respondes, ejecuto A.

**P5. En LIM (6 m2), ¿qué se hace con las 45 categorías?**
- A) Exhibir solo las familias que llegan al mínimo de presentación y ofrecer el resto por pedido o desde otra sede. **Recomendada:** con unas 72 prendas, 45 categorías quedarían con menos de 2 prendas cada una.
- B) Un poco de todo. Ganas: la clienta ve variedad. Pagas: curvas de tallas incompletas que dan imagen de saldo.
- Si no respondes, ejecuto A.

**P6. ¿La encargada de sede puede ajustar el mix sugerido?**
- A) Sí, como sugerencia editable con motivo registrado, y se mide su acierto. Ganas: usa su conocimiento de la sede. Pagas: requiere registrar cada cambio. **Recomendada.**
- B) No, el mix es una orden fija. Ganas: consistencia. Pagas: pierdes la señal de quien conoce la sede.
- Si no respondes, ejecuto A.

**P7. ¿Se autoriza registrar cada semana el espacio real por categoría y los días con curva rota?**
- A) Sí, una vez por semana por sede, por una persona asignada, desde el conteo de piso. Ganas: rompe la circularidad de repetir el pasado. Pagas: algo de trabajo semanal de la encargada. **Recomendada.**
- B) No por ahora. Ganas: cero trabajo adicional. Pagas: sin ese dato no se podrá corregir el mix con evidencia.
- Si no respondes, ejecuto A en modo de prueba en una sola sede.