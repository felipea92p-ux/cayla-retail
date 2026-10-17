# 06 · Planificación: del «hay que producir» a la orden, y de la orden a la tienda

**Frente 6 · 2026-10-16 · solo lectura.** Letras de evidencia: **A** medido por mí en la base de producción (`cayla-dynamic`, schema `retail`, solo `SELECT`) o en el repo · **B** fuente primaria (documentación oficial del producto o del transportista, SUNAT, artículo académico, tesis) · **C** fuente secundaria (blog, revista del oficio, ficha comercial) · **D** lo dijo Felipe y está escrito · **E** inferencia mía (dicha como tal). Todas las consultas son del 2026-10-16.

**Límites de este frente (dichos de entrada).** (1) Tras unas veinte búsquedas la herramienta de búsqueda dejó de responder (tope de 200 por turno compartido entre agentes); lo que quedó sin buscar está en «Lo que no encontré». (2) Varios PDF (tesis de la UPC, artículo de la Universidad de Lima, estudio CAF/ADEX, anexos y reglamento de SUNAT) no se pudieron leer: de las tesis solo vi el resumen. (3) El repo es público: no hay nombres de servicios ni de operarias, tarifas ni montos; los volúmenes de CAYLA van en órdenes de magnitud.

## Veredicto

1. **Nadie ha medido cuánto tarda una prenda del corte a la tienda.** Hay tres cifras sueltas (7 días en la investigación de cobertura, ≈14 en una nota de sesión de Felipe, 30 de cobertura en el código) y ninguna sale de una orden real: `producciones` tiene 0 filas. El plazo es lo que más mueve la decisión de producir (de 13 a 51 modelos en «producir ya» entre 7 y 21 días) y es **bloqueante** para el puente de la decisión a la orden.
2. **El acta de nacimiento de una orden tiene lo esencial** (modelo, cantidades por talla y color, tela, quién hace cada fase, una fecha) **y le faltan tres cosas que el oficio sí lleva:** a qué tienda va, por qué se produce (reponer o novedad) y con qué prioridad.
3. **Veredictos:** H12 (una orden = un modelo) **confirma** como unidad comercial, con la unidad física (tendido por tela y color) como matiz; H3 (tercerizar = fase entera, un solo quién) **matiza**; H13 (la fecha promete salida del Taller) **matiza**: es una promesa legítima del Taller, pero no es la fecha que le sirve a quien vende.
4. **Sorpresa 1.** El modelo propio mejor abastecido tiene menos de 50 prendas en toda la red y el mínimo de un servicio es de 150 a 240: un lote que cumpla el mínimo equivale a meses de lo vendido con registro (con las reservas de abajo).
5. **Sorpresa 2.** Traslados mide cuándo alguien **confirmó** la recepción, no cuándo llegó la caja; usarlo para medir el plazo lo sobrestimaría.
6. **Sorpresa 3.** En el sistema, repartir una fase entre dos talleres obliga a abrir dos órdenes y cada una exige su propio Corte: en el papel se parte el corte aunque en la mesa sea un solo tendido.

## 1 · El acta de nacimiento de una orden

Lo que sigue **describe**; no propone campos ni pantallas. «Hoy» es lo que la base de producción tiene después de pegar las migraciones del rediseño (consultada el 2026-10-16, A).

| Dato | De dónde sale hoy | Qué lleva el oficio | Hoy en la base |
|---|---|---|---|
| Qué modelo | «Abrir orden sugerida» (Resumen), «Nueva orden» o «Producir este modelo» desde una muestra terminada | La ficha del modelo: patrón, tabla de tallas, lista de tela y avíos (C) | `producciones.producto_id`: una orden, un modelo |
| Lote o muestra | Se deduce del modelo; `es_muestra` | Orden de muestra aparte del lote | `es_muestra` |
| Cuántas, por talla y color | Curva sugerida por la red (ventas y stock, 30 días a cubrir por defecto; 15, 30, 45 o 60 a elección) y lo que la persona escribe | La proporción de tallas de **la orden confirmada**, no un estándar (C) | `produccion_lineas.cantidad_plan` por variante |
| Para cuándo | La persona elige (atajos de 1 semana, 2 semanas o 1 mes); ninguna cifra medida lo respalda | Fecha de entrega de la corrida; calendario armado hacia atrás (C) | `fecha_entrega`: una sola por orden |
| Qué tela y cuánta | Tejido del modelo, tela del color, consumo por prenda (declarado o medido) | Metros y capas por color en el ticket de corte; tela y avíos heredados de la lista del modelo (C) | `produccion_insumos` |
| Quién hace cada fase y a qué precio | La persona al abrir; tarifa sugerida desde la lista del servicio | — | `produccion_fases` (quién, proveedor, tarifa, mínimo, fijo) |
| Fecha prometida | Solo si la fase es de un servicio | — | `fecha_prometida`, nula si hace la fase el Taller |
| **A qué tienda va** | **No nace.** Se decide después, en Traslados | Almacén o cliente de destino en el ticket (C) | No existe |
| **Por qué se produce** (reponer o novedad) | **No nace** | Orden ligada a un pedido o a una temporada (C) | No existe (queda, a lo más, en la nota de texto libre) |
| **Prioridad y fecha de inicio** | **No nacen** | Prioridad en la cola (B, Katana) | No existe |
| Lote de tinte de la tela | No nace en la orden | Número en cada pieza cortada para coser solo capas del mismo lote (C) | La tela se descuenta por lote de compra, no por lote de tinte (tema del Frente 3) |

**El puente de la decisión a la orden, tal como existe.** El Resumen sugiere un modelo y una cantidad; la hoja de Nueva orden la ofrece como número fantasma en cada celda; la persona la acepta o la cambia, y lo que queda guardado es solo la cantidad final. La razón (el consejo, los días a cubrir, la comparación con la red) no viaja con la orden. No repito aquí el cálculo de cuánto producir.

H-6.1 · Hoy una orden nace con modelo, cantidades por talla y color, una sola fecha de entrega, la tela y quién hace cada fase; **no nace** con a qué tienda va, por qué se produce, prioridad ni fecha de inicio.
  Evidencia: A · `information_schema.columns` de `retail.producciones`, `produccion_lineas` y `produccion_fases` y `pg_get_constraintdef` de sus CHECK (proyecto `cayla-dynamic`) · consultada 2026-10-16
  Confianza: alta · Aplica a: ambos
  Lo contradiría: una columna o tabla de planificación fuera de estas tres (no hay en las 28 tablas de Producción que listó el Frente 0).
  Implicación: acta de nacimiento; toca los supuestos de fecha de ADR-0400 (H13) y d.3.

H-6.2 · Las fases que hace el Taller no llevan fecha ni mínimo propios (la base lo impide); la única fecha del trabajo interno es la de entrega de toda la orden, y la persona la escribe sin una cifra medida detrás.
  Evidencia: A · CHECK `produccion_fases_quien` (si `quien = taller`, `fecha_prometida` y `cantidad_minima` deben ser nulos) · 2026-10-16. Observado · prueba ciega del 13-oct en `docs/formidable/produccion-modulo.md` (rama del rediseño, «Primer intento»): puso la fecha (23/10, sin año) sin que el sistema le diera una referencia. E · `docs/pantallas/produccion-ordenes-nueva.md:62,87` (análisis por escenario, no observación: la fecha no tenía validación ni referencia). D · `docs/PLAN-PRODUCCION.md:106` (los «3 / 8 / 2 días por etapa» se descartaron porque eran supuestos del arquitecto, no datos de CAYLA)
  Confianza: alta (esquema) · media (observación) · Aplica a: ambos
  Lo contradiría: que otra pantalla calcule una fecha esperada del trabajo interno (no la encontré).
  Implicación: H13 y el supuesto de fecha de ADR-0400; hoy «N días sin moverse» es la única señal de atraso interno.

H-6.3 · El oficio parte los datos de una orden de corte en dos: lo que hereda de la ficha del modelo (tela, avíos, tabla de tallas) y lo propio de cada corrida (proporción de tallas, fecha de entrega, a qué almacén o cliente va).
  Evidencia: C · Uphance, «what is a cut ticket» (blog de un ERP) y Fashion-Incubator, «what is a cutting ticket» (practicante del oficio) · 2026-10-16
  Confianza: media · Aplica a: ambos
  Lo contradiría: un taller que corta de memoria con un cuaderno y sin ticket.
  Implicación: Nueva orden ya hereda tela y consumo del modelo (d.6) como el oficio; lo que no tiene es el destino.

H-6.4 · Una orden no recuerda por qué se abrió: se guarda la cantidad final, no la sugerencia ni el motivo.
  Evidencia: A · columnas de `producciones` (sin origen, motivo ni sugerencia) · 2026-10-16 · ADR-0396 §5 y §8 (consejo en una línea y tres entradas a la misma hoja)
  Confianza: alta · Aplica a: ambos
  Lo contradiría: que el motivo viva en `nota` (texto libre, no medible).
  Implicación: después no se podrá contar cuántas órdenes fueron reposición y cuántas novedad (H14, y la pregunta del brief sobre reposición contra novedad).

## 2 · Reposición contra novedad

H-6.5 · «Novedad en poca cantidad y repetir lo que vende» tiene respaldo académico, y su valor depende de qué tan corto es el plazo.
  Evidencia: B · Fisher y Raman 1996, *Operations Research* 44(1):87-99, resumen en IDEAS/RePEc (en un fabricante de ropa de esquí, la respuesta rápida subió la utilidad un 60 % sobre su sistema informal y la multiplicó por cuatro sobre no reaccionar) · 2026-10-16. En el repo, ya verificado por otras investigaciones y **no re-verificado por mí**: `docs/investigacion/2026-09-26-temporadas-de-moda.md:60` (Zara repone en unas 2 semanas y un diseño nuevo tarda 4 a 5; datos de 2001) y `2026-10-04-mix-inicial-del-piso.md:150` (Sport Obermeyer, ~30 % después de ver los primeros pedidos)
  Confianza: alta · Aplica a: planta grande · ambos
  Lo contradiría: que con un plazo de ~14 días la ganancia relativa sea mucho menor que con meses; nadie lo midió para un taller como el de CAYLA.
  Implicación: la reposición solo vale si el plazo del Taller es corto **y conocido**; toca H13 y el plazo L.

H-6.6 · Las guías de planificación para marcas chicas separan los básicos (reposición recurrente) de la moda de temporada (una sola apuesta), y piden planear con el plazo **observado**, no el pactado.
  Evidencia: C · Uphance, «replenishment planning» (blog comercial; su ejemplo: 45 días pactados y 62 reales) · 2026-10-16
  Confianza: media · Aplica a: ambos
  Lo contradiría: una marca casi solo de continuidad, donde todo es reposición.
  Implicación: el L de CAYLA tiene que salir de órdenes reales, no de 7, 14 o 30.

H-6.7 · El volumen propio es chico: 26 de 337 modelos son de marca CAYLA, vendieron ≈7 % de las unidades vendidas con registro en 18 días, 14 de los 26 no vendieron nada y ninguno pasa de 50 prendas en stock en toda la red.
  Evidencia: A · `SELECT` a `movimientos` (salidas por venta del 29-sep al 16-oct), `stock`, `productos` y `marcas` · 2026-10-16
  Confianza: media · Aplica a: CAYLA
  Lo contradiría: el registro es parcial (AQP incompleto, ventas sin registrar), el catálogo tiene tres semanas y «marca CAYLA» no es lo mismo que «fabricado en el Taller» (la base no distingue, Frente 0).
  Implicación: el lote de reposición típico es pequeño; toca d.5 (mínimos), d.9 (muestras) y H14.

H-6.8 · El plazo del Taller es el parámetro que más mueve «¿producir ya?»: con L = 7, 10, 14 y 21 días, los modelos en «producir ya» pasan de 13 a 25, 40 y 51.
  Evidencia: D · sesión de cobertura del 2026-10-13, nota de sesión **no versionada** (memoria del arquitecto) · y `docs/investigacion/2026-10-13-cobertura-con-poca-muestra/README.md`, rama `claude/tiempo-question-299a41` (L = 7 «no medido»; decisión 3 pendiente) · 2026-10-16
  Comprobación del Frente 10: el README versionado de la rama dice solo «13 producir ya» con L = 7 y que el plazo no está medido; el recorrido 25 (L = 10), 40 (L = 14) y 51 (L = 21) consta únicamente en la nota de sesión no versionada del arquitecto (la encontré allí, pero ningún archivo del repo la respalda). Es una sola fuente D sin versionar: úsala como orden de magnitud, no como cifra.
  Confianza: baja a media · Aplica a: CAYLA
  Lo contradiría: la re-medición del 10-nov con más días de ledger.
  Implicación: **bloqueante** para el puente decisión→orden; nada versionado mide el ciclo corte-a-tienda (H13).

## 3 · Tamaño de lote: cuándo partir y cuándo juntar

H-6.9 · El mínimo de un servicio (150 a 240 prendas, ADR-0400 d.5) es varias veces el stock del modelo propio mejor abastecido (menos de 50), de modo que un lote que lo cumpla equivale a meses de lo vendido con registro.
  Evidencia: A · stock y ventas de los 26 modelos propios (ver H-6.7) · 2026-10-16 · D · ADR-0400 d.5 y R-30
  Confianza: baja a media · Aplica a: CAYLA
  Lo contradiría: ventas reales mayores que las registradas; un lote repartido en muchos colores que sume el mínimo con poco por color.
  Implicación: d.5 («si una Salida es menor que el mínimo, avisa, no bloquea») va a avisar casi siempre; no cambia lo decidido pero cambia cuánto se leerá ese aviso.

H-6.10 · En el sistema el mínimo es de **cada fase de cada orden**; no hay dónde juntar prendas de dos modelos para llegar al mínimo de un servicio ni para llenar una carga de lavandería.
  Evidencia: A · `cantidad_minima` vive en `produccion_fases` y las Salidas cuelgan de una fase de una orden (ADR-0400, tabla de datos) · 2026-10-16. C · el benchmark del 13-oct anota que la lavandería cobra por carga (`docs/investigacion/2026-10-13-produccion-rediseno/README.md:353`, rama del rediseño)
  Confianza: media (que el Taller lo necesite es E) · Aplica a: ambos
  Lo contradiría: que cada servicio acepte el mínimo por pedido de **cualquier** mezcla de modelos y no por modelo.
  Implicación: d.3 y d.5; es una de las razones para «juntar» que el oficio documenta (H-6.11).

H-6.11 · Razones documentadas en el oficio: **para juntar**, compartir marcada y rollo, usar menos capas y menos tendidos, y cumplir mínimos por color o por lote de tinte; **para partir**, la altura máxima de capas y el largo de la mesa, la tela que llega tarde (se mandan lotes parciales), y la falta de capacidad.
  Evidencia: C · Apparel Resources (Jana, NIFT, 2008; nota de 2011), WavePLM, Online Clothing Study, Apparel Search · B · tesis PUCP 2022 (resumen): una confeccionista de Lima con capacidad menor que la demanda tercerizó pedidos, amplió plazos o subió precios · 2026-10-16
  Confianza: media · Aplica a: ambos (los ejemplos de capas y mesas son de planta; la tesis es de un taller de ~20 personas)
  Lo contradiría: dato del Taller de que la mesa y el tendido no limitan nunca el tamaño de la orden.
  Implicación: H12 y H3; ninguna de estas razones está hoy escrita como regla en ADR-0400.

H-6.12 · Para tela no hay dato público de mínimos en Lima; el único hallado, un exportador limeño, da mínimos en **kilos por color** y se contradice en su propia página (140 a 160 kg contra 200 kg).
  Evidencia: C (baja) · ficha de un proveedor exportador de algodón pima en un directorio B2B · 2026-10-16
  Confianza: baja · Aplica a: ambos
  Lo contradiría: cualquier tarifa o mínimo del mayorista donde CAYLA compra de verdad.
  Implicación: d.6 (tela por metros) y Frente 3; el mínimo de tela es pregunta para el Taller.

### H12 · ¿Una orden es un modelo con sus colores y tallas?

H-6.13 · Una orden por modelo coincide con el oficio: el número de corte es por estilo y se desglosa por tela; un mismo marcador puede cubrir varios colores con capas por color, aunque los colores casi siempre van en tendidos aparte; cortar varios estilos en un mismo marcador es la excepción.
  Evidencia: C · Fashion-Incubator, WavePLM, Apparel Resources (Jana 2008) · A · de los 25 modelos propios con variantes activas, mediana de 3 colores y 3 tallas, máximo 16 colores, solo 2 de 25 con un color · 2026-10-16
  Confianza: media · Aplica a: ambos
  Lo contradiría: colores del mismo modelo que llegan o se cortan en semanas distintas, o dos modelos que comparten tela y se cortan el mismo día.
  Implicación: **H12 confirma** como unidad comercial y solo se matiza en la unidad física; d.7 («Terminé N de M por talla y color») ya baja a la unidad física; partir por tela y color triplicaría las órdenes (mediana de 3 colores).

### H3 · ¿Tercerizar es una fase entera con un solo quién?

H-6.14 · Una fase entera con un solo quién es lo normal en el software de referencia y en el caso peruano visto; repartir un mismo pedido entre dos talleres existe, pero como práctica de abastecimiento y con costos propios.
  Evidencia: B · Katana, «partially outsourced manufacturing» (el contratista es un recurso por operación; no documenta repartir una operación entre dos) · tesis PUCP 2022 (resumen) · C · Sourcify (empezar con 10 a 20 % de un producto en la segunda fábrica) y ecommercefastlane (costos de duplicar aprobaciones, restos de tela y lotes de tinte distintos) · 2026-10-16
  Confianza: media a baja · Aplica a: ambos
  Lo contradiría: que el Taller reparta la costura entre dos servicios en campaña (hoy es pregunta, no dato).
  Implicación: **H3 matiza**: lo decidido en d.3 es la práctica base; lo que no se sabe es con qué frecuencia CAYLA necesita lo contrario.

H-6.15 · En ADR-0400, repartir una fase entre dos talleres significa abrir **dos órdenes**, y cada orden exige sus tres fases de la espina; en el papel el corte se parte aunque en la mesa sea un solo tendido.
  Evidencia: A · CHECK de `produccion_fases` (una fila por fase y clave; `proveedor_id` único por fase; secuencia fija) y ADR-0400 d.3 · 2026-10-16 · E (inferencia sobre cómo se vería en el piso)
  Confianza: media · Aplica a: CAYLA
  Lo contradiría: que la segunda orden se abra con el Corte marcado como hecho por pieza ya cortada (no está previsto).
  Implicación: H3; la tela usada y el avance del Corte quedarían repartidos entre dos órdenes.

## 4 · Capacidad y secuencia en el Taller propio

H-6.16 · El oficio calcula la capacidad con minutos estándar por prenda, máquinas, horas de turno y eficiencia de la línea, y advierte que la planificación suele apoyarse solo en la costura, olvidando corte, acabado, lavado y servicios, que también limitan la fecha.
  Evidencia: C · Online Clothing Study (Sarkar, 2018, dos artículos) · 2026-10-16. A · el sistema no tiene ninguno de esos datos; Dynamic cuenta 3 personas activas con función de Taller (Frente 0)
  Confianza: media · Aplica a: planta grande · ambos
  Lo contradiría: un Taller de ~10 personas que planifica «a ojo» con éxito y no necesita minutos por prenda.
  Implicación: «capacidad» es un hecho a preguntar; la cifra de «unas 10 operarias» de d.1 no tiene respaldo.

H-6.17 · El sistema no tiene prioridad ni fecha de inicio, y el orden de las fases es fijo en la base; una urgencia solo puede expresarse cambiando la fecha de entrega.
  Evidencia: A · columnas de `producciones` y CHECK `produccion_fases_secuencia_de_la_ruta` · 2026-10-16 · B · Katana, «using the make screen schedule» (cola única; la urgencia se resuelve arrastrando la orden y no hay regla automática) y Odoo, «delayed manufacturing» (la fecha límite no es la fecha de fin) · C · Uphance, «production calendar» (colchón de 2 a 3 días en los hitos con riesgo y registro de cada cambio de fecha)
  Confianza: media · Aplica a: ambos
  Lo contradiría: que en el Taller una urgencia se resuelva siempre hablando con la encargada, sin papel.
  Implicación: toca la fecha de ADR-0400 (H13); no cambia nada decidido pero deja la urgencia sin vocabulario en el sistema.

## 5 · De la orden a la tienda

**Cadena de hoy, de «terminé» a «se vende»** (A y D): última fase terminada → «Pasar al stock» (las prendas entran **al Taller**; ADR-0400 act. d) → un traslado del Taller a la tienda (Traslados en dos fases: envía y está en tránsito; la tienda cuenta a ciegas y confirma; ADR-0239) → por defecto entran al almacén de la tienda, con «piso de venta» a elección (ADR-0239 D-131) → alguien las baja al piso (el mostrador vende desde el piso).

H-6.18 · El stock de una orden nace **de una sola vez**: la base solo admite `en_proceso`, `terminada` y `anulada`, y no hay cierre parcial. El oficio sí manda lotes parciales ante una urgencia y trata las entregas parciales como recepciones contra la orden.
  Evidencia: A · CHECK `producciones_terminada_coherente` y `cerrar_produccion` (rama del rediseño: líneas 104 y 179 de `20261014160000_…sql`) · 2026-10-16 · C · Apparel Resources (Jana 2008: en urgencias se pueden enviar lotes parciales al comprador) y la ayuda de Uphance (las entregas parciales se manejan al crear entregas y registrar la recepción, no al crear la orden)
  Confianza: alta (esquema) · media (práctica) · Aplica a: ambos
  Lo contradiría: que el Taller nunca mande una parte de un lote antes de terminarlo (pregunta, no dato).
  Implicación: «Pasar al stock» parcial toca el principio 4 y el stock: **detener y confirmar con Felipe**; hoy una tanda ya cerrada solo se puede llevar con un traslado de lo cerrado.

### H13 · ¿La fecha de entrega promete que las prendas salen del Taller?

H-6.19 · La fecha que le importa a quien vende es **cuándo se puede vender**, y el software de referencia la separa de cuándo termina la producción; en CAYLA, entre «sale del Taller» y «se vende» hay cuatro pasos más (pasar al stock, el traslado, el conteo con confirmación y bajar al piso).
  Evidencia: B · Odoo, «delayed manufacturing» (la fecha límite de la orden de fabricación no es su fecha de fin; en pedido contra venta, la fecha límite es la de entrega de la venta) y «lead times» (separa plazo de cliente, margen de seguridad y plazo de fabricación) · Katana (fecha límite de producción y fecha límite de entrega son campos distintos) · C · Uphance (el calendario se arma hacia atrás desde la ventana de envío, no desde la salida de fábrica) y Online Clothing Study (en exportación, la salida de fábrica se toma normalmente como fecha de envío) · A y D · ADR-0239, ADR-0400 act. d · 2026-10-16
  Confianza: alta (que se separan) · media (que en CAYLA importe) · Aplica a: ambos
  Lo contradiría: que el Taller despache él mismo y la tienda cuelgue el mismo día (sin dato); en una integración vertical, «sale del Taller» es lo último que controla el productor y por eso es una promesa defendible.
  Implicación: **H13 matiza**: la promesa del Taller sirve como promesa del Taller, no como fecha de venta; el supuesto de fecha de ADR-0400 queda correcto pero incompleto.

H-6.20 · Plazo del tramo Lima→Trujillo/Arequipa: un courier nacional documenta 24 a 48 horas en promedio a capitales de departamento y, en su tabla del 27-jul-2026, 2 días hábiles a domicilio en Arequipa capital por vía aérea y 1 día a tienda; para carga de más de 25 kg dice que depende de la cantidad de envíos y del destino, sin días. En bus se estima ≈10 h a Trujillo y 15 a 17 h a Arequipa.
  Evidencia: B · Olva Courier, términos y condiciones; «tiempos de entrega a nivel nacional» (fechada 27-jul-2026); servicio de carga · C (baja) · horas de bus, solo extractos de buscador (Rome2Rio, KimKim), **no abrí las páginas** · 2026-10-16
  Confianza: media (Arequipa) · baja (Trujillo, cuya fila no pude leer) · Aplica a: ambos
  Lo contradiría: que CAYLA no use courier sino un bus de carga o un viaje propio, con otros tiempos; hasta hoy hay **0 traslados reales con prendas** y A-07 sigue abierta.
  Implicación: la tabla de plazos de abajo; ninguna cifra de Lima→provincia está medida en CAYLA.

H-6.21 · El reloj de Traslados mide cuándo alguien confirmó la recepción, no cuándo llegó la caja.
  Evidencia: A · `retail.transferencias`: 4 traslados en total, todos de prueba del 16 y 17-sep y sin líneas; los 2 cerrados Taller→TRU se confirmaron a 3,6 y 5,2 días de creados, contra 1,6 días estimados por quien los armó · 2026-10-16 · D · ADR-0239 D-130 (conteo a ciegas, guardado por línea)
  Confianza: baja (n = 2, datos de prueba) · Aplica a: CAYLA
  Lo contradiría: traslados reales con recepción el mismo día.
  Implicación: medir el plazo Taller→tienda desde Traslados lo sobrestima; toca la frontera con Traslados.

H-6.22 · El transportista nacional responde por una caja perdida o dañada hasta un tope bajo y con documento de sustento, y vende seguros por tramos de valor.
  Evidencia: B · Olva Courier, términos y condiciones (indemnización máxima de S/ 300; seguro de S/ 1 a S/ 2 más IGV por tramos, y 1 % del valor sobre S/ 1.001) · 2026-10-16
  Confianza: alta (lo que dice el courier) · media (que importe a CAYLA) · Aplica a: ambos
  Lo contradiría: que CAYLA mande por un medio que no use este tope.
  Implicación: el costo y el riesgo del tramo hacia las tiendas no están en ADR-0400; pregunta para Felipe (¿cómo manda y quién asume la pérdida?).

H-6.23 · Para sustentar el traslado de la caja del Taller a una tienda, SUNAT contempla la guía de remisión con el motivo «traslado entre establecimientos de una misma empresa»; **no afirmo** si CAYLA está obligada a emitirla electrónica ni desde cuándo.
  Evidencia: B · SUNAT Orientación, «Guía de Remisión Remitente» y «Guía de Remisión Electrónica – modelo general» (listan ese motivo y el de traslado de bienes para transformación) · 2026-10-16 · D · `docs/datos/DECISIONES-2026-09-21-menu-comercial.md:236,255` (D-80 y D-83: hoy el número de guía se anota «donde se hace hoy»; la electrónica es segunda etapa)
  Confianza: alta (que el motivo existe) · baja (obligación de CAYLA) · Aplica a: ambos
  Lo contradiría: una designación de SUNAT que no alcance a CAYLA.
  Implicación: **detener y confirmar con Felipe y el contador**; lo ve también el Frente 4. No propongo construir nada.

H-6.24 · Llegar y colgar son dos tiempos distintos: en TRU, 56 % de las 331 bajadas al piso del 26-sep al 11-oct ocurrió entre las 9 y las 10 h.
  Evidencia: D · medición de otra investigación del repo, **no re-medida por mí** · `docs/investigacion/2026-10-12-colores-que-bajar-al-piso.md:60`
  Confianza: media · Aplica a: CAYLA
  Lo contradiría: una medición por llegada de caja y no por hora del día.
  Implicación: «se vende» llega después de «confirmé la recepción» por un tiempo humano que nadie mide todavía.

## 6 · Plazos típicos por etapa

Regla: **solo se pone lo que tiene fuente**. Donde no hay dato público, dice «dato de Felipe pendiente» y qué pedir. Ningún renglón se llena con «lo normal».

| Etapa | Lo que hay (con letra) | Aplica a CAYLA | Dato de Felipe pendiente |
|---|---|---|---|
| Decidir y abrir la orden | Atajos de la hoja: 1 semana, 2 semanas, 1 mes (ADR-0396 A5, E del arquitecto) | Sí, pero es un atajo, no una medición | ¿Cuánto pasa entre «hay que producir» y «abrí la orden»? |
| Conseguir la tela | Sin dato público para Lima. Una ficha de exportador dice que el plazo «depende del tamaño del pedido» (C). Para telas de fábrica de temporada, el repo anota 6 a 9 meses antes (`temporadas-de-moda.md:61`, Gestión, no re-verificado) | No se sabe si la tela sale de fábrica o de un mayorista | ¿Dónde la compra y con cuántos días de anticipación? |
| Muestra y aprobación | 2 a 4 semanas desde la ficha técnica en fabricantes de EE. UU. de bajo mínimo (C); 2 a 3 rondas de 7 a 10 días en un fabricante extranjero (C) | No: son fabricantes externos; ADR-0400 d.9 difiere las rondas | ¿Cuántos días tarda una muestra propia? |
| Corte (trazo, tendido, corte, habilitado) | Sin dato público. Los «3 días» del plan viejo se descartaron por ser supuesto (`PLAN-PRODUCCION.md:106`) | Dato propio | Días de una orden reciente, con su fecha de inicio y fin |
| Costura en el Taller | Sin dato público; el oficio lo calcula con minutos estándar por prenda, máquinas, horas y eficiencia (C) | Dato propio | Máquinas, horas, personas y prendas que salen en un día normal |
| Servicio de afuera (bordado, estampado, lavandería, costura) | Cuatro páginas públicas de servicios de Lima **no publican plazo** (A, consulta del 16-oct); una dice que una muestra toma ≈1 hora por color o proceso (C) | Dato propio por servicio | Plazo prometido y plazo real de cada servicio que usa |
| Acabado y empaque | Sin dato público | Dato propio | Días de una orden reciente |
| Pasar al stock | Inmediato: una sola operación (A) | Sí | — |
| Traslado Lima → tienda | Courier nacional: 24 a 48 h en promedio a capitales de departamento; Arequipa capital, 2 días hábiles a domicilio y 1 a tienda (B, 27-jul-2026); bus ≈10 h a Trujillo y 15 a 17 h a Arequipa (C baja) | Depende de cómo mande | ¿Qué medio, cuántos días, quién paga y quién recibe? |
| Conteo y confirmación | Tiempo humano; 3,6 y 5,2 días en dos traslados de prueba (A, baja) | Sí, pero sin medir en real | Cuánto tarda hoy en confirmarse una caja real |
| Bajar al piso | La bajada es una rutina matinal (56 % entre 9 y 10 h en TRU, D: medición de otra investigación del repo) | Sí | Días entre «llegó» y «colgado» |
| **Total, del corte a la tienda** | ≈14 días (D, nota de sesión de Felipe, **no medido, no versionado**); 7 (investigación de cobertura, «no medido»); 30 días de cobertura objetivo en el código (no es un plazo). Referencias que no son de CAYLA: Zara repone en ≈2 semanas y un diseño nuevo tarda 4 a 5 (datos de 2001, repo); bloques de «producción en bulto» de 30 a 45 días en un fabricante extranjero (C); Inditex declara hasta 48 h del pedido a la tienda (C, Mapfre citando su informe anual) | — | Una orden reciente contada de punta a punta con fechas |

## Contraejemplos de este frente

1. **Contra «la novedad en poca cantidad rinde»:** el estudio de Fisher y Raman es de ropa de esquí con plazos de meses; con ~14 días de plazo la ventaja relativa de reaccionar podría ser mucho menor (no medido).
2. **Contra mi lectura de H13:** en exportación la salida de fábrica **es** la fecha de envío (C), y en una integración vertical «sale del Taller» es lo último que controla el productor; la promesa de ADR-0400 es la convención, solo que insuficiente para vender.
3. **Contra «una orden = un modelo»:** el oficio documenta el marcador mixto de varios estilos (C), y el 2 de 25 modelos propios con un solo color muestra que hay modelos donde el color no multiplica nada.
4. **Contra «una fase, un quién»:** una práctica de abastecimiento reparte 10 a 20 % a una segunda fábrica (C), y un taller limeño con poca capacidad respondió tercerizando pedidos (B, resumen).
5. **Contra usar blogs de plazos:** las cifras de 30 a 45 días de producción en bulto y de 45 a 90 días ex-fábrica (C) son de fabricantes extranjeros con cientos de unidades; no son comparables con un Taller de lotes de 150 a 240.

## Lo que no encontré

- **Plazos de cualquier etapa del Taller o de un servicio de Lima:** no hay dato público; las páginas de bordado, estampado y lavandería consultadas no publican plazo ni mínimo.
- **Mínimos de tela en Lima:** solo la ficha contradictoria de un exportador (H-6.12).
- **Tramo Lima→Trujillo con cifra oficial:** la tabla de tiempos del courier se truncó antes de La Libertad; no abrí Shalom (el sitio no respondió) ni Cruz del Sur Cargo (404).
- **Capacidad real de un taller pequeño de Lima** (máquinas, horas, operarias) y **cómo resuelve una urgencia**: no hay estudio público; solo fórmulas del oficio.
- **Estudios peruanos de planificación en mypes de confección:** hay artículos y tesis (Universidad de Lima 2021, PUCP 2013 y 2022, UPC) pero su texto completo no se pudo leer; no se usan como evidencia más allá de los resúmenes.
- **El estudio CAF/ADEX sobre subcontratación** (citado en el benchmark del 13-oct): el PDF llegó vacío; **sigue sin verificar**.
- **La fuente de «6 a 9 meses la tela, 3 a 4 la prenda en Gamarra»** (Gestión, citada en `temporadas-de-moda.md:61`): no la pude re-encontrar; la cito como la cita el repo.
- **Frecuencia de entregas a tiendas de Zara** en el artículo de HBR 2004: el texto no se pudo abrir; no se usa.
- **Cuántas órdenes concurrentes** maneja el Taller y **qué papel acompaña la caja** que sale hacia la tienda: solo CAYLA lo sabe.
- **Tema que quedó sin buscar por la cuota de búsqueda:** planificación de corte en español (SENATI, MINEDU), manuales de la OIT/ONUDI sobre planificación en confección y estacionalidad de la capacidad de los talleres de Lima (Día de la Madre, Fiestas Patrias, Navidad, campaña escolar). Dos notas de prensa sobre el Día de la Madre aparecieron en el buscador pero devolvieron 403: **no se usan**.

## Preguntas que solo CAYLA puede contestar

(tipo HECHO = solo CAYLA sabe cómo es · DECISIÓN = preferencia de Felipe)

1. **HECHO · bloqueante.** Piensa en la última vez que repusieron un modelo: ¿cuántos días pasaron desde que decidieron cortarlo hasta que estuvo colgado en una tienda, y cuántos desde que se cortó hasta que salió del Taller? (Fija el plazo L; H-6.8.)
2. **HECHO · bloqueante.** ¿Cómo llega una caja del Taller a Trujillo y a Arequipa (courier, bus de carga, alguien que viaja), cuántos días tarda, quién paga y quién la recibe y la cuenta? (H-6.20, H-6.22, A-07.)
3. **HECHO.** ¿De dónde sale la tela (fábrica o mayorista), cuántos días antes hay que pedirla y cuál es lo mínimo que te venden por color? (Plazos; H-6.12.)
4. **HECHO.** En un mes normal y en uno de campaña, ¿cuántos modelos distintos tiene el Taller en proceso a la vez? (Concurrencia; H-6.16.)
5. **HECHO.** ¿Cuántas personas y máquinas hay hoy en el Taller y cuántas prendas de ese tipo salen en un día normal? (Capacidad; H-6.16.)
6. **HECHO.** Cuando se acaba un modelo y lo piden con urgencia, ¿qué hacen hoy: paran lo que está en curso, llaman a un servicio de afuera, mandan una parte? (H-6.17.)
7. **HECHO.** ¿Alguna vez mandaron a la tienda una parte de un lote mientras el resto seguía en el Taller? ¿Cuántas veces al mes? (H-6.18.)
8. **HECHO.** ¿Reparten alguna vez la costura de un mismo lote entre dos servicios? ¿En qué meses? (H3; H-6.14.)
9. **HECHO.** ¿Cortan juntos dos modelos que usan la misma tela, o cortan los colores de un mismo modelo en días distintos? (H12; H-6.13.)
10. **HECHO.** ¿Qué papel o guía acompaña la caja que sale hacia la tienda y quién la hace? (H-6.23; lo cruza el contador.)
11. **HECHO.** ¿Cuánto tarda hoy una caja en estar colgada desde que llega a la tienda? (H-6.21, H-6.24.)
12. **DECISIÓN.** Al abrir una orden, ¿qué fecha quieres ver como la importante: la que sale del Taller, la que llega a la tienda o la que cuelga en el piso? (H13; H-6.19.)
13. **DECISIÓN.** ¿Quieres poder pasar a las tiendas una parte del lote antes de terminarlo todo, aunque la orden siga abierta? (H-6.18; toca el stock.)
14. **DECISIÓN.** Cuando un servicio pide un mínimo que un solo modelo no llega a cubrir, ¿te sirve poder mandar dos modelos juntos en una misma Salida? (H-6.10.)
15. **DECISIÓN.** Una urgencia, ¿debe saltar la fila o basta con mover la fecha? (H-6.17.)
16. **DECISIÓN.** ¿Quieres que cada orden guarde si fue reposición o novedad y a qué tienda va? (H-6.1, H-6.4.)

## Verificación de lo marcado `[externo, sin verificar]` que toqué

| Ítem | Estado | Fuente |
|---|---|---|
| Condiciones de un taller de Gamarra (cantidad mínima, plazo, pagos) | **sigue sin verificar** · el enlace murió (HTTP 410) | fabricantes.gamarra.com.pe, 2026-10-16 |
| Servicio de bordado de Gamarra: plazos y mínimos | **sigue sin verificar** · la página no los publica | fabricantes.gamarralima.com, 2026-10-16 |
| Estampado en polos (plazos) | **sigue sin verificar** · solo dice ≈1 h por color para una muestra y 3 unidades de mínimo mayorista en Gamarra | polospublicitarios.pe, 2026-10-16 |
| Estampado Chroma (plazos) | **sigue sin verificar** · la página no los publica | chromaestampados.com, 2026-10-16 |
| Lavandería industrial (plazos y mínimos) | **sigue sin verificar** · la página no los publica | industrialrivero.com, 2026-10-16 |
| Estudio CAF/ADEX de subcontratación | **sigue sin verificar** · PDF vacío para la herramienta | scioteca.caf.com, 2026-10-16 |
| Motivos de traslado de SUNAT (anexo de la resolución 000240-2024) | **sigue sin verificar** el anexo (PDF ilegible); **verificado en otra página de SUNAT** que existen los motivos «traslado entre establecimientos de una misma empresa» y «traslado de bienes para transformación» | orientacion.sunat.gob.pe, 2026-10-16 |

## Fuentes

Nivel · fuente · URL · consultada 2026-10-16 · estado del enlace.

**A (medido por mí)**
- Consultas `SELECT` a `cayla-dynamic`, schema `retail`: columnas y CHECK de `producciones`, `produccion_lineas`, `produccion_fases`; `transferencias`; `movimientos`; `stock`; `variantes`, `productos`, `marcas`, `ubicaciones`. Resultados agregados; sin nombres.
- Rama del rediseño: `git show claude/production-module-redesign-136cca:supabase/migrations/20261014160000_produccion_cierre_al_stock_y_costos_del_taller.sql` (líneas 104 y 179).

**B (primaria)**
- Fisher y Raman, *Operations Research* 44(1), 1996 · https://ideas.repec.org/a/inm/oropre/v44y1996i1p87-99.html · activo
- Olva Courier, términos y condiciones · https://www.olvacourier.com/terminos-y-condiciones/ · activo
- Olva Courier, tiempos de entrega a nivel nacional (fechada 27-jul-2026; tabla truncada antes de La Libertad) · https://www.olvacourier.com/tiempos-de-entrega-olva-nivel-nacional/ · activo
- Olva Courier, servicio de carga · https://www.olvacourier.com/clientes/olva-personas/carga · activo
- SUNAT Orientación, Guía de Remisión Remitente · https://orientacion.sunat.gob.pe/02-guia-de-remision-remitente · activo
- SUNAT Orientación, Guía de Remisión Electrónica, modelo general · https://orientacion.sunat.gob.pe/node/713 · activo
- Odoo 18, órdenes de fabricación atrasadas · https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/manufacturing/reporting/delayed.html · activo
- Odoo 18, plazos de entrega · https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/inventory/warehouses_storage/replenishment/lead_times.html · activo (leí 100 000 de 107 244 caracteres)
- Katana, manufactura parcialmente tercerizada · https://support.katanamrp.com/en/articles/6215435-partially-outsourced-manufacturing · activo
- Katana, pestaña Schedule · https://support.katanamrp.com/en/articles/5914378-using-the-make-screen-schedule · activo
- Uphance, ayuda «cómo crear una orden de producción» · https://help.uphance.com/en/articles/1296605-how-to-create-a-production-order · activo
- Tesis PUCP 2022 (solo resumen; texto completo restringido) · https://tesis.pucp.edu.pe/handle/20.500.12404/24463 · activo
- Tesis PUCP 2013, MRP II en una planta de confecciones (solo resumen; no se usa para nada concreto) · https://repositorio.pucp.edu.pe/index/handle/123456789/145952 · activo

**C (secundaria)**
- Fashion-Incubator, cutting ticket · https://fashion-incubator.com/what-is-a-cutting-ticket/ · activo
- Uphance, cut ticket · https://uphance.com/blog/what-is-a-cut-ticket-and-why-it-belongs-in-erp/ · activo
- Uphance, replenishment planning · https://uphance.com/blog/replenishment-planning/ · activo
- Uphance, production calendar · https://uphance.com/blog/what-is-a-production-calendar-and-how-to-build-one-that-holds/ · activo
- Apparel Resources, Jana, «Cut Order Planning – The Dot Com Way» (2008) · https://apparelresources.com/technology-news/manufacturing-tech/cut-order-planning-the-dot-com-way/ · activo
- Apparel Resources, cut order planning software (2011) · https://apparelresources.com/technology-news/manufacturing-tech/cut-order-planning-software/ · activo
- Apparel Resources, fabric utilization I (2013) · https://apparelresources.com/business-news/manufacturing/fabric-utilization-i-cut-order-planning/ · activo
- WavePLM, cut order planning · https://blog.waveplm.com/?p=6935 · activo
- Apparel Search, shade lots · https://www.apparelsearch.com/terms/s/shade_lot_color_variances.html · activo
- Online Clothing Study, capacidad de producción (2018) · https://onlineclothingstudy.com/2011/11/how-to-calculate-production-capacity-of.html · activo
- Online Clothing Study, lead time (2016) · https://onlineclothingstudy.com/2016/05/how-to-calculate-lead-time-of-apparel.html · activo
- Online Clothing Study, T&A (2019) · https://www.onlineclothingstudy.com/2019/09/make-best-use-of-t-for-your-apparel.html · activo
- Sourcify, segunda fábrica · https://sourcify.com/blog/second-apparel-manufacturer/ · activo
- ecommercefastlane, costos de varios fabricantes · https://ecommercefastlane.com/what-it-really-costs-multiple-chinese-clothing-manufacturers/ · activo
- Thygesen Apparel, lead time · https://thygesenapparel.com/blog/what-is-lead-time-in-garment-industry · activo
- Maker's Row, bajo mínimo · https://makersrow.com/blog/low-moq-clothing-manufacturer/ · activo
- Alice James Global, lotes pequeños · https://startupfashion.com/?p=75036 · activo
- Gestión, campaña escolar 2025 (pedidos desde fines de diciembre; sin plazos) · https://gestion.pe/economia/campana-escolar-2025-gamarra-se-alista-y-amplia-oferta-con-telas-hipoalergenicas-precios-y-tendencias-emporio-comercial-noticia/ · activo
- Mapfre Global Risks, logística de Inditex (2019) · https://www.mapfreglobalrisks.com/en/risks-insurance-management/article/inditexs-centralized-logistics-a-successful-model-for-reaching-the-entire-world · activo
- Directorio B2B, proveedor exportador de algodón pima de Lima · https://b2usa.com/hotsite/rebornprivatelabel/supplier-peruvian-pima-cotton- · activo; datos internamente contradictorios
- Bus Lima–Trujillo y Lima–Arequipa: extractos de buscador de Rome2Rio y KimKim, **no abiertos**

**D (repo, dicho por Felipe o decidido)**
- `docs/datos/15-COMO-OPERA-CAYLA.md` R-21 a R-24, R-30, R-32 · `docs/datos/DECISIONES-2026-09-21-menu-comercial.md` D-80 y D-83 · `docs/PLAN-PRODUCCION.md:106,259` · `docs/adr/0239-…`, `0242-…`, `0396-…` · ADR-0400 y la investigación del 13-oct (rama del rediseño) · cobertura con poca muestra (rama `claude/tiempo-question-299a41`) · nota de sesión de Felipe del 13-oct sobre L ≈ 14 días (no versionada).

**Enlaces que no funcionaron:** fabricantes.gamarra.com.pe (410), HBR 1994 Sport Obermeyer (404, URL supuesta), Microsoft Learn sobre promesa de pedido (404, URL supuesta), cruzdelsur.com.pe/cargo (404), shalomempresarial.com (sin conexión), peru-retail.com (403), UPC repositorio (403), Inderscience (403), ResearchGate (403). PDF ilegibles para la herramienta: artículo de la Universidad de Lima (n.º 40, 2021), estudio CAF/ADEX, anexo 1 de la resolución SUNAT 000240-2024 y capítulo V del Reglamento de Comprobantes de Pago.
