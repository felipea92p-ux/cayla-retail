# 11 · Banco de preguntas: 71 candidatas y la ronda de 36

**Frente 9 · 2026-10-16.** Sale de las preguntas que devolvieron los frentes 0 a 8 (se juntaron las repetidas) más las que aparecieron al cruzarlos. Nada aquí diseña pantallas ni tablas: cada pregunta dice **qué decide**, no cómo se construye.

## Cómo leer

- **HECHO** = solo CAYLA sabe cómo es. Las opciones son las realidades posibles; la «recomendada» (primera) es la que **la evidencia hace más probable o la más prudente si fuera cierta**, y se elige otra o se escribe la propia si no es así. «Ganas» y «Pagas» dicen qué implica para el sistema si esa es la realidad.
- **DECISIÓN** = preferencia de Felipe. Las opciones son caminos; «Ganas» y «Pagas» son los de siempre.
- **Bloqueante** = sin la respuesta, la primera orden real puede toparse con un estado imposible, un papel que la ley exige o una pantalla que no deja terminar.
- **REABRE** = la evidencia nueva contradice algo ya decidido (o un supuesto del arquitecto). Solo esas preguntas repiten terreno de la ronda anterior (comprobación al final).
- Las etiquetas de opción tienen 5 palabras o menos (la etiqueta «(Recomendada)» incluida). La descripción lleva Ganas y Pagas.
- Letras de evidencia como en el resto de la carpeta; `04·H-4.1` = archivo 04, hallazgo H-4.1.

## Criterio de elección de las 36

1. **Primero las bloqueantes** (son 10: P-01 a P-10; todas entran).
2. **Luego las de mayor impacto** sobre lo que se construye: las que reabren una decisión (P-16, P-18, P-21, P-22, P-27, P-31 y, en parte, P-36) y las que fijan un hueco que la primera orden real va a tocar (P-04, P-05, P-06).
3. **Ninguna ya contestada**, salvo las que la evidencia nueva reabre (marcadas **REABRE**).
4. **Seis bloques de seis; nueve llamadas de cuatro** (`AskUserQuestion` admite hasta 4 preguntas por llamada). Dentro de una llamada no hay preguntas que dependan de otra de la misma llamada: las que dependen van en una llamada posterior.
5. Las 35 que quedan fuera no se descartan: o se cierran con el paquete de evidencia (`10`), o esperan a que haya una orden real.

## Mapa de la ronda (36 preguntas · 6 bloques · 9 llamadas)

| Bloque | Tema | Preguntas | Llamadas |
|---|---|---|---|
| 1 | Papel, tela y hueco de las órdenes que salen mal | P-01 a P-06 | 1 (P-01 a P-04) y 2 (P-05, P-06) |
| 2 | La gente del Taller, lo que se anota y el camino a la tienda | P-07 a P-12 | 2 (P-07, P-08), 3 (P-09 a P-12) |
| 3 | Servicios de afuera: papeles y plata | P-13 a P-18 | 4 (P-13 a P-16), 5 (P-17, P-18) |
| 4 | Tela | P-19 a P-24 | 5 (P-19, P-20), 6 (P-21 a P-24) |
| 5 | Cuando algo sale mal | P-25 a P-30 | 7 (P-25 a P-28), 8 (P-29, P-30) |
| 6 | Costo, fechas y lo que miras | P-31 a P-36 | 8 (P-31, P-32), 9 (P-33 a P-36) |

| Llamada | Preguntas | Tipos |
|---|---|---|
| 1 | P-01, P-02, P-03, P-04 | 3 HECHO + 1 DECISIÓN, todas bloqueantes |
| 2 | P-05, P-06, P-07, P-08 | 2 DECISIÓN + 2 HECHO, todas bloqueantes |
| 3 | P-09, P-10, P-11, P-12 | 2 HECHO bloqueantes + 2 DECISIÓN (dependen de P-07 y P-08) |
| 4 | P-13, P-14, P-15, P-16 | 3 HECHO + 1 DECISIÓN |
| 5 | P-17, P-18, P-19, P-20 | 2 DECISIÓN + 2 HECHO (P-17 depende de P-14) |
| 6 | P-21, P-22, P-23, P-24 | 2 DECISIÓN + 2 HECHO (P-21 depende de P-20) |
| 7 | P-25, P-26, P-27, P-28 | 1 HECHO + 3 DECISIÓN |
| 8 | P-29, P-30, P-31, P-32 | 1 HECHO + 3 DECISIÓN |
| 9 | P-33, P-34, P-35, P-36 | 4 DECISIÓN (P-33 depende de P-09 y P-10) |

## Tabla maestra de las 71 candidatas

| Id | Tipo | Tema | Bloqueante | REABRE | Ronda |
|---|---|---|---|---|---|
| P-01 | HECHO | Quién pone la tela al servicio | sí | — (si es «el servicio compra», matiza d.4 y el supuesto de detracción) | B1 · L1 |
| P-02 | HECHO | Qué papel acompaña lo que sale | sí | A3 y d.4 (si no hay guía) | B1 · L1 |
| P-03 | HECHO | El Taller como local declarado ante SUNAT | sí | — | B1 · L1 |
| P-04 | DECISIÓN | Fase que termina con menos prendas | sí | — (completa d.7) | B1 · L1 |
| P-05 | DECISIÓN | Cancelar con tela ya cortada | sí | principio 2 | B1 · L2 |
| P-06 | DECISIÓN | Segundas: qué se hace y dónde esperan | sí | — (completa d.7/act. d) | B1 · L2 |
| P-07 | HECHO | Cómo se paga a la gente del Taller | sí | — | B2 · L2 |
| P-08 | HECHO | Dónde se anota hoy | sí | — | B2 · L2 |
| P-09 | HECHO | Días del corte a la tienda | sí | — | B2 · L3 |
| P-10 | HECHO | Cómo llega la caja a las tiendas | sí | — | B2 · L3 |
| P-11 | DECISIÓN | Quién anota «Terminé N» | no | — | B2 · L3 |
| P-12 | DECISIÓN | Quién ve el dato por persona | no | — | B2 · L3 |
| P-13 | HECHO | Qué sale hoy a servicios | no | d.2 (si hay ojales y botones) | B3 · L4 |
| P-14 | HECHO | Qué papel da el servicio | no | S2d | B3 · L4 |
| P-15 | HECHO | Adelantos | no | «sin adelantos» (si sí hay) | B3 · L4 |
| P-16 | DECISIÓN | Partir una fase entre dos | no | **d.3** | B3 · L4 |
| P-17 | DECISIÓN | Servicio sin factura | no | — | B3 · L5 |
| P-18 | DECISIÓN | Cobrar al servicio lo dañado o perdido | no | **supuesto de faltantes** | B3 · L5 |
| P-19 | HECHO | Tela plana o de punto | no | d.6 (si hay punto) | B4 · L5 |
| P-20 | HECHO | Qué entrega Audaces | no | — | B4 · L5 |
| P-21 | DECISIÓN | Cuántas órdenes antes de que lo gastado mande | no | **d.6** | B4 · L6 |
| P-22 | DECISIÓN | Tope de corte de más | no | **d.7** | B4 · L6 |
| P-23 | HECHO | Qué se le hace a la tela antes de cortar | no | — | B4 · L6 |
| P-24 | HECHO | Tono distinto entre rollos | no | — | B4 · L6 |
| P-25 | HECHO | De cada 100 cortadas, cuántas se pierden o se arreglan | no | R-31 | B5 · L7 |
| P-26 | DECISIÓN | Revisión de la prenda terminada | no | — | B5 · L7 |
| P-27 | DECISIÓN | Pasar al stock por tandas | no | **pantalla de la orden («Pasar al stock» solo al terminar)** | B5 · L7 |
| P-28 | DECISIÓN | Modelo nuevo: aprobación antes del lote | no | — (completa d.9: las rondas siguen diferidas; solo se pregunta qué rastro queda) | B5 · L7 |
| P-29 | DECISIÓN | Cambiar un pedido ya empezado | no | — | B5 · L8 |
| P-30 | HECHO | Puntualidad de los servicios | no | — | B5 · L8 |
| P-31 | DECISIÓN | Costo de la prenda con la gente del Taller | no | **D-31** | B6 · L8 |
| P-32 | DECISIÓN | Las tres cifras que ver al cerrar | no | — | B6 · L8 |
| P-33 | DECISIÓN | Qué fecha importa | no | — (completa el supuesto) | B6 · L9 |
| P-34 | DECISIÓN | Reposición o novedad, y a qué tienda | no | — | B6 · L9 |
| P-35 | DECISIÓN | Urgencia | no | — | B6 · L9 |
| P-36 | DECISIÓN | Dos modelos en una misma Salida | no | **d.5 en parte** (el aviso que no bloquea ya estaba decidido; la evidencia nueva es que el mínimo supera varias veces el stock propio) | B6 · L9 |
| P-37 | HECHO | Quién tiende y quién corta | no | — | fuera |
| P-38 | HECHO | Quién numera y arma paquetes | no | — | fuera |
| P-39 | HECHO | Plancha a mitad de la costura | no | — | fuera |
| P-40 | HECHO | Cortan juntos colores o modelos | no | — | fuera |
| P-41 | DECISIÓN | Anotar paquetes desde ya | no | — (completa d.1) | fuera |
| P-42 | HECHO | Personas, máquinas y prendas por día | no | — | fuera |
| P-43 | HECHO | Modelos en proceso a la vez | no | — | fuera |
| P-44 | HECHO | Meses llenos | no | — | fuera |
| P-45 | HECHO | Cuántas veces se reparte la costura | no | — | fuera |
| P-46 | HECHO | De dónde sale la tela y con cuánta anticipación | no | — | fuera |
| P-47 | HECHO | Quién pone los botones, cierres e hilo | no | — | fuera |
| P-48 | HECHO | Qué se hace con retazos y puntas | no | — | fuera |
| P-49 | HECHO | Cómo queda el acuerdo con el servicio | no | — | fuera |
| P-50 | HECHO | Tela inutilizada en un servicio | no | — | fuera |
| P-51 | HECHO | Detracción: ¿ya depositó el contador? | no | — | fuera |
| P-52 | HECHO | Cómo se cuenta lo que vuelve | no | — | fuera |
| P-53 | HECHO | Cuándo se anota y semanas pesadas | no | — | fuera |
| P-54 | HECHO | Aparato y distancia a las mesas | no | — | fuera |
| P-55 | HECHO | Quién reparte y recibe el trabajo | no | — | fuera |
| P-56 | HECHO | Sistemas que se probaron y se dejaron | no | — | fuera |
| P-57 | HECHO | Cómo se calcula hoy el costo de una prenda | no | — | fuera |
| P-58 | HECHO | Qué hace el contador con lo que está en proceso | no | — | fuera |
| P-59 | DECISIÓN | Ver cuánto costaría hacerla afuera | no | — | fuera |
| P-60 | DECISIÓN | Margen de tela igual o por tela | no | — | fuera |
| P-61 | DECISIÓN | Si se corta punto: kilos o metros | no | **d.6** | fuera |
| P-62 | HECHO | Ponchado o matriz: por diseño o por orden | no | **d.5** (en parte) | fuera |
| P-63 | HECHO | Pruebas antes de cortar todo | no | — | fuera |
| P-64 | HECHO | Mínimo de cada servicio y precio por cantidad | no | — | fuera |
| P-65 | HECHO | Las palabras del Taller | no | — | fuera |
| P-66 | HECHO | Cuánto tarda una caja en confirmarse y colgarse | no | — | fuera |
| P-67 | HECHO | Papel que acompaña la caja Taller → tienda | no | — | fuera |
| P-68 | HECHO | Cómo se resuelve hoy una urgencia | no | — | fuera |
| P-69 | HECHO | Tela que no alcanza a mitad del corte | no | — | fuera |
| P-70 | HECHO | Cómo se elige un servicio nuevo | no | — | fuera |
| P-71 | HECHO | Si se mandó antes parte de un lote | no | — | fuera |

---

# Las 36 elegidas, listas para `AskUserQuestion`

Formato de cada una: **header** (máximo 12 letras) · **pregunta** · **opciones** (etiqueta y descripción con Ganas y Pagas; la recomendada va primera y lleva «(Recomendada)») · evidencia · qué decide · bloqueante · REABRE.

## Bloque 1 · Papel, tela y las órdenes que salen mal

### P-01 · HECHO · bloqueante · header «Tela» · llamada 1
**Pregunta:** Cuando mandas coser, bordar o lavar fuera, ¿quién pone la tela?
- **«Mando la tela cortada» (Recomendada)** — Ganas: es el caso que el sistema ya imagina; la tela sigue siendo tuya en el estante. Pagas: lleva papel de traslado, y un descuento mal escrito puede leerse como venta de tela.
- **«El servicio compra la tela»** — Ganas: recibes la prenda hecha. Pagas: es una compra de prenda, no un servicio; cambian papeles e impuestos y hoy el sistema no lo modela.
- **«De las dos formas»** — Ganas: refleja lo que pasa. Pagas: cada orden debe decir cuál; más papeles y más reglas.
- **«Solo prendas ya cosidas»** — Ganas: lo más simple (bordar, estampar, lavar). Pagas: cambia qué fases salen y qué papel lleva cada una.

**Por qué la primera:** concuerda con lo que Felipe ya dijo (el Taller corta adentro y terceriza la costura, R-29) y con lo que d.4 imagina (la tela viaja con la Salida); es una suposición, no un dato.
**Evidencia:** B · `04` §2.1 y `H-4.8` (tres modelos de papeles según quién pone la tela; RS 056-2006; Informe 151-2006); `02·H-2.9`.
**Decide:** qué es una Salida (consumo de tu tela o compra de prenda), quién emite la guía, si aplica la detracción y qué cuenta contable.
**REABRE:** — (si la respuesta es «el servicio compra» o «de las dos», matiza d.4 y el supuesto de detracción).

### P-02 · HECHO · bloqueante · header «Papel» · llamada 1
**Pregunta:** Cuando tela, piezas o prendas salen del Taller hacia un servicio, ¿qué papel las acompaña hoy?
- **«Solo nota o mensaje» (Recomendada)** — Ganas: nada cambia en la rutina. Pagas: SUNAT pide una guía antes de mover la mercadería; sin ella pueden retenerla o multar el 15 % de su valor.
- **«Guía hecha por CAYLA»** — Ganas: cumples la norma y el sistema solo anota su número. Pagas: alguien la emite antes de cada salida, con dirección y peso.
- **«El servicio la hace»** — Ganas: si él recoge y trae, la guía es suya. Pagas: debe tener RUC y emitirla; tú guardas copia.
- **«Nada escrito»** — Ganas: ninguna carga. Pagas: sin prueba de lo que salió, y el mismo riesgo legal.

**Por qué la primera:** es el supuesto más prudente (si fuera cierto, hay que actuar) y concuerda con que más de un tercio de tus compras llega sin factura (R-07) y con que la guía de traslados se hace «donde se hace hoy» (D-83). Es inferencia (E).
**Evidencia:** B · `04·H-4.1` a `H-4.5` (Reglamento de Comprobantes de Pago arts. 17, 18 y 21; RS 240-2024; Informe 117-2003 releído el 2026-10-16).
**Decide:** si el campo «guía» sigue siendo solo texto; qué se le lleva al contador.
**REABRE:** A3 y d.4 (si la respuesta es 1 o 4). **Detener y confirmar con Felipe y el contador.**

### P-03 · HECHO · bloqueante · header «Local SUNAT» · llamada 1
**Pregunta:** ¿El Taller está declarado ante SUNAT como un local de CAYLA, con su dirección?
- **«No sé; lo pregunto» (Recomendada)** — Ganas: respuesta correcta sin adivinar. Pagas: una consulta pendiente que puede frenar cualquier guía.
- **«Sí, con su dirección»** — Ganas: la guía entre tus propios locales es posible. Pagas: falta cargar la dirección en el sistema.
- **«No está declarado»** — Ganas: lo sabes ya. Pagas: hay que declararlo antes de emitir guías desde ahí.

**Por qué la primera:** la consecuencia es legal y solo la confirma el contador.
**Evidencia:** A · `04·H-4.6` (en la base el Taller no tiene dirección; solo una tienda la tiene); B · `04` §8 pregunta 1.
**Decide:** el punto de partida de la guía y el motivo «traslado entre establecimientos».
**REABRE:** —.

### P-04 · DECISIÓN · bloqueante · header «Fase corta» · llamada 1
**Pregunta:** Si una fase termina con menos prendas de las que entraron (se dañaron 3 en costura, faltó tela), ¿quién puede darla por terminada?
- **«La encargada, con motivo» (Recomendada)** — Ganas: el trabajo no se traba y la pérdida queda escrita. Pagas: nadie más revisa la pérdida en ese momento.
- **«Solo una líder»** — Ganas: dos ojos sobre toda pérdida. Pagas: si la líder está en Trujillo, la orden espera.
- **«Se abre otra orden»** — Ganas: la orden siempre cuadra. Pagas: una prenda dañada obliga a abrir otra orden; pasa seguido.

**Por qué la primera:** hoy la pantalla no deja pasar al stock una orden cuya fase terminó corta, aunque la base sí lo permitiría; ocurrirá en la primera orden real.
**Evidencia:** A · `07·H-7.1` (`fn_fases_de_orden`: «hecha» exige buenas + segundas + faltantes ≥ lo que entró; en el Taller no hay segundas ni faltantes).
**Decide:** cómo termina una fase y cómo se llega a «Pasar al stock».
**REABRE:** — (la pantalla hoy contradice la intención de d.7).

### P-05 · DECISIÓN · bloqueante · header «Anular» · llamada 2
**Pregunta:** Si cancelas una orden cuando la tela ya está cortada, ¿qué debe pasar con lo cortado?
- **«Preguntar qué se hace» (Recomendada)** — Ganas: la tela cortada no reaparece como tela entera en el estante. Pagas: un paso más al anular (usarla en otra orden, liquidar o botar, con motivo).
- **«Solo anular sin cortar nada»** — Ganas: ningún estado raro. Pagas: cancelar tras cortar exige un camino aparte.
- **«Como hoy: toda vuelve»** — Ganas: un clic. Pagas: el estante dice que hay tela entera que ya es pieza cortada; los costos se descuadran.

**Por qué la primera:** es el estado imposible más concreto que hallamos (principio 2).
**Evidencia:** A · `07·H-7.3`; `anular_produccion` viva, releída el 2026-10-16: devuelve el consumo neto de cada lote a su costo y solo frena si hay prendas afuera.
**Decide:** el comportamiento de `anular_produccion` y qué se le pide a quien anula.
**REABRE:** principio 2.

### P-06 · DECISIÓN · bloqueante · header «Segundas» · llamada 2
**Pregunta:** Una prenda con una falla chica que se puede vender más barata, ¿qué debe pasar con ella y dónde espera?
- **«A liquidación, caja marcada» (Recomendada)** — Ganas: usa lo que ya existe (piezas de liquidación) y deja el costo repartido. Pagas: «venta final» puede chocar con INDECOPI; hay que revisarlo.
- **«Se arregla y cuenta»** — Ganas: no se pierde nada. Pagas: horas del Taller que hoy nadie anota.
- **«Se regala o se bota»** — Ganas: sin trámite. Pagas: se pierde su valor y el contador pide pruebas para deducirlo.
- **«Caso por caso»** — Ganas: libertad. Pagas: la prenda queda sin lugar en el sistema.

**Por qué la primera:** el Taller no tiene dónde guardar una segunda y la cuarentena solo existe en las tiendas.
**Evidencia:** A · `07·H-7.2`; B · `04·H-4.14` (una segunda vendible no es desmedro; sigue siendo existencia con costo); C (baja) · `07·H-7.14`.
**Decide:** el destino físico y de costo de las segundas.
**REABRE:** — (completa d.7 y la actualización d).

## Bloque 2 · La gente del Taller, lo que se anota y el camino a la tienda

### P-07 · HECHO · bloqueante · header «Pago» · llamada 2
**Pregunta:** ¿Cómo se le paga hoy a la gente del Taller que corta y cose?
- **«Por tiempo trabajado» (Recomendada)** — Ganas: anotar por fase basta; el dato por persona no paga nada. Pagas: el costo de mano de obra de cada orden se reparte por horas, que hoy nadie anota.
- **«Por prenda o por operación»** — Ganas: sabrías quién hizo cuánto. Pagas: ese dato se vuelve el que paga y se disputa; «por fase» ya no basta.
- **«Mixto: base más bono»** — Ganas: flexible. Pagas: es el esquema con más problemas en la literatura; el dato por persona se vuelve sensible.

**Por qué la primera:** Dynamic las muestra pagadas por horas y días, sin una columna de piezas; los bonos aparecen en cerca de la mitad de las filas sin explicación.
**Evidencia:** A · `05·H-5.8`; B · `08·H-8.7`; B · OIT, DP 28 (`05·H-5.9`).
**Decide:** si la granularidad A basta y si la costura propia puede ir por prenda.
**REABRE:** — (si es por prenda, matiza d.1).

### P-08 · HECHO · bloqueante · header «Anotar hoy» · llamada 2
**Pregunta:** Cuando una tanda pasa de corte a costura y a acabado, ¿dónde queda anotado hoy?
- **«Cuaderno por pedido» (Recomendada)** — Ganas: «Terminé N» reemplaza una anotación que ya existe. Pagas: mientras el cuaderno viva, se anota dos veces.
- **«WhatsApp o mensajes»** — Ganas: fácil de pasar a pantalla. Pagas: se pierde y no hay cifra por talla.
- **«Excel»** — Ganas: se puede traer la idea. Pagas: otra copia que mantener.
- **«No se anota por fase»** — Ganas: nada que duplicar. Pagas: pide un hábito nuevo y, en el pico, anotar es lo primero que se suelta.

**Por qué la primera:** es lo único peruano visto (un cuaderno por pedido más un conteo del día); el cuaderno no es por fase.
**Evidencia:** B · `08·H-8.1`, `H-8.18`; B · `01·H-1.12`.
**Decide:** si «Terminé N» sustituye o se suma a un papel; cuánto se pide en la semana más cargada.
**REABRE:** — (matiza el «el papel alcanza» de d.1).

### P-09 · HECHO · bloqueante · header «Plazo» · llamada 3
**Pregunta:** Piensa en la última vez que repusieron un modelo: ¿cuántos días pasaron desde que decidieron cortarlo hasta que estuvo colgado en una tienda?
- **«10 a 20 días» (Recomendada)** — Ganas: queda como tu estimación (unos 14) y unos 40 modelos salen en «producir ya». Pagas: sigue siendo una estimación hasta medir la primera orden.
- **«Menos de 10 días»** — Ganas: pocos modelos en «producir ya» (13 con 7 días). Pagas: si no es cierto, el sistema produce tarde.
- **«Más de 20 días»** — Ganas: el sistema pide producir antes (51 modelos con 21 días). Pagas: más tela y más capital metido.
- **«No lo sé; se mide»** — Ganas: honestidad. Pagas: se sigue con la estimación sin respaldo.

**Por qué la primera:** es tu cifra de la sesión del 13-oct; ninguna sale de una orden real (`producciones` tiene 0 filas).
**Evidencia:** A/D · `06·H-6.8`, `06` §6; `00` (tres cifras: 7, ≈14 y 30).
**Decide:** el plazo que usa «producir ya» y la fecha prometida de una orden.
**REABRE:** —.

### P-10 · HECHO · bloqueante · header «Caja» · llamada 3
**Pregunta:** ¿Cómo llega una caja del Taller a Trujillo y a Arequipa, y quién la recibe y la cuenta?
- **«Courier o carga» (Recomendada)** — Ganas: tiempos documentados (24 a 48 horas a capitales) y un papel de transporte. Pagas: la indemnización del transportista es baja frente al valor de una caja.
- **«Alguien de CAYLA la lleva»** — Ganas: control directo. Pagas: depende de viajes; el plazo varía.
- **«Bus o encomienda informal»** — Ganas: barato. Pagas: sin sustento ni seguro.
- **«Cambia según la urgencia»** — Ganas: flexible. Pagas: no hay un plazo único para planear.

**Por qué la primera:** es lo que documenta el oficio y los transportistas nacionales; no hay ni un traslado real con prendas todavía.
**Evidencia:** B · `06·H-6.20`, `H-6.22` (condiciones de un courier nacional); A · `06·H-6.21`.
**Decide:** la fecha de venta que se puede prometer y el riesgo del tramo.
**REABRE:** —.

### P-11 · DECISIÓN · header «Quién anota» · llamada 3
**Pregunta:** ¿Quién debe anotar «Terminé N» en el Taller?
- **«Solo la encargada» (Recomendada)** — Ganas: un solo punto estable y un solo hábito. Pagas: depende de una persona; si falta, nadie anota.
- **«Cada una desde su celular»** — Ganas: el dato nace en el momento. Pagas: más gente que enseñar y más miedo a ser medida.
- **«La encargada, con suplente»** — Ganas: continuidad si falta. Pagas: la cuenta del Taller es compartida; el «quién» depende del responsable que se elija.

**Por qué la primera:** en las pymes de Lima se adopta lo conocido y lo usa alguien de confianza; el celular es el aparato probable, pero la rotación y los roles movedizos pesan.
**Evidencia:** B · `08·H-8.14`, `H-8.3`, `H-8.19`.
**Decide:** el aparato y la persona fija; no repite la pregunta de permisos (Q1 ya decidió que opera quien ve Producción parado en el Taller).
**REABRE:** —.

### P-12 · DECISIÓN · header «Ver el dato» · llamada 3
**Pregunta:** Si el sistema algún día muestra cuántas prendas terminó cada persona, ¿quién debe verlo?
- **«Solo la líder» (Recomendada)** — Ganas: control sin presión pública. Pagas: la persona no ve su propio avance.
- **«Cada una y la líder»** — Ganas: transparencia. Pagas: riesgo de comparación.
- **«Nadie lo registra»** — Ganas: ningún miedo. Pagas: el día que se quiera pagar por pieza, no hay dato.

**Por qué la primera:** el miedo a que el dato baje la tarifa está documentado en varias fuentes; la base ya deja la columna de operaria vacía.
**Evidencia:** B · `08·H-8.9`, `H-8.10`.
**Decide:** el permiso de lectura del dato por persona si algún día se llena.
**REABRE:** —.

## Bloque 3 · Servicios de afuera: papeles y plata

### P-13 · HECHO · header «Qué sale» · llamada 4
**Pregunta:** De lo que sale hoy del Taller a otros lugares, ¿qué es exactamente?
- **«Costura, bordado, estampado, lavado» (Recomendada)** — Ganas: la lista de fases ya alcanza. Pagas: nada que sumar.
- **«Además ojales y botones»** — Ganas: el servicio que a una camisa le toca queda en pantalla. Pagas: una fase más en la lista fija.
- **«Además plancha u otros acabados»** — Ganas: se ve el servicio completo. Pagas: se mezcla con la fase Acabado.
- **«Casi todo se hace adentro»** — Ganas: lista corta. Pagas: las fases de servicio casi no se usarían.

**Por qué la primera:** es la lista de R-29 y de d.2.
**Evidencia:** B · `01·H-1.11`, `02·H-2.8` (en una fábrica de camisas el 100 % sale a ojal y botón); A · 13 de 26 modelos propios son de tela plana (`03·H-3.17`).
**Decide:** la lista de fases opcionales.
**REABRE:** d.2 (si hay ojales y botones o plancha afuera).

### P-14 · HECHO · header «Su papel» · llamada 4
**Pregunta:** Cuando un servicio te entrega, ¿qué papel te da casi siempre?
- **«Una mezcla de papeles» (Recomendada)** — Ganas: el sistema debe prever los cuatro. Pagas: cada papel sustenta distinto (boleta y nota no dan gasto ni crédito).
- **«Casi siempre factura»** — Ganas: el flujo simple. Pagas: nada.
- **«Boleta o recibo por honorarios»** — Ganas: lo habitual en talleres chicos. Pagas: no da crédito del IGV; el recibo tiene su retención.
- **«Casi nunca papel»** — Ganas: nada que pedir. Pagas: costo sin sustento.

**Por qué la primera:** estimas que más de un tercio de tus compras llega sin factura (R-07, D) y el sector es informal en su mayoría (B).
**Evidencia:** B · `04·H-4.10`, `H-4.17`; A · `04·H-4.16` (el IGV solo existe en el tipo factura).
**Decide:** qué papeles admite la orden y qué se avisa.
**REABRE:** el supuesto «el proveedor dice si su papel lleva IGV».

### P-15 · HECHO · header «Adelantos» · llamada 4
**Pregunta:** ¿Le adelantas dinero a algún servicio antes de que entregue?
- **«No, pago al recibir» (Recomendada)** — Ganas: nada que anotar. Pagas: sin dato que lo confirme.
- **«Sí, una parte»** — Ganas: el servicio puede empezar. Pagas: el adelanto exige papel por lo recibido y adelanta el depósito de la detracción.
- **«Sí, casi todo por adelantado»** — Ganas: tranquilidad del servicio. Pagas: riesgo de perder el adelanto; mismo papel.

**Por qué la primera:** es el supuesto de ADR-0400; ninguna fuente peruana lo confirma ni lo refuta.
**Evidencia:** B · `04·H-4.9`, `H-4.11` (comprobante por lo percibido); `02` §6 fila 7 (no verificado).
**Decide:** si Por pagar necesita un lugar para anticipos.
**REABRE:** el supuesto «sin adelantos» (si la respuesta es sí).

### P-16 · DECISIÓN · header «Partir fase» · llamada 4
**Pregunta:** Si en campaña un modelo no cabe en un solo lugar (Taller y servicio, o dos servicios), ¿cómo prefieres anotarlo?
- **«Dos órdenes, como hoy» (Recomendada)** — Ganas: cada orden con su costo y su fecha; nada nuevo. Pagas: el Corte se parte en el papel aunque en la mesa sea un solo tendido; las órdenes no se ven hermanas.
- **«Una orden con el reparto»** — Ganas: una sola orden que diga cuántas fue a cada uno. Pagas: cada fase con dos «quién» y avance por envío; reabre d.3.
- **«Todo a un servicio»** — Ganas: ninguna complicación. Pagas: depende de que alguno tenga capacidad en el pico.

**Por qué la primera:** partir no cambia los papeles ni lo exige la ley, y no hay dato de cuántas veces ocurre en CAYLA; la evidencia a favor de partir es de 2007.
**Evidencia:** B (baja) · `01·H-1.10`, `02·H-2.6`, `04·H-4.18`, `H-4.21`; A · `06·H-6.15`.
**Decide:** si una fase puede tener dos «quién».
**REABRE:** **d.3** («una fase entera, un solo quién»).

### P-17 · DECISIÓN · header «Sin factura» · llamada 5
**Pregunta:** Si un servicio no da factura, ¿qué prefieres?
- **«Seguir, marcando «sin factura»» (Recomendada)** — Ganas: el costo real de la orden aparece completo. Pagas: ese gasto no se deduce ni da crédito; el contador debe saberlo.
- **«Exigir factura para dar trabajo»** — Ganas: todo queda deducible. Pagas: pierdes servicios pequeños.
- **«Exigirla sobre cierto monto»** — Ganas: equilibrio. Pagas: el monto lo define el contador.

**Por qué la primera:** la informalidad es la regla, no el caso raro (D/B); el costo existe aunque el papel no.
**Evidencia:** D · R-07; B · `04·H-4.10`, `H-4.17`; matriz de riesgos del Frente 4 (riesgo 3).
**Decide:** si la orden admite costo sin papel y cómo se marca.
**REABRE:** —. (Depende de P-14.)

### P-18 · DECISIÓN · header «Cobrar» · llamada 5
**Pregunta:** Si un servicio estropea tu tela o pierde prendas, ¿qué prefieres por defecto?
- **«Cobrar por escrito» (Recomendada)** — Ganas: el que pierde paga; según un artículo sobre el Código Civil, el servicio paga la tela que inutiliza por negligencia. Pagas: un descuento mal escrito podría leerse como venta de tela (lo dice un solo artículo, con casos de minería); necesita papel claro y la revisión del contador.
- **«Lo absorbe CAYLA»** — Ganas: sin discusión. Pagas: pagas tela y prendas que no existen.
- **«Decide la líder»** — Ganas: flexible. Pagas: sin regla, cada vez se negocia por mensaje.

**Por qué la primera:** el supuesto «en Lima no hay norma» se matiza: hay una regla supletoria para la tela y pruebas que pedir (no una tolerancia de faltantes de prendas).
**Evidencia:** C · `04·H-4.12`, `H-4.13`, `07·H-7.11` (arts. 1773, 1774 n.º 3 y 1788 del Código Civil, leídos a través de un solo artículo de doctrina; sus casos del Tribunal Fiscal son de minería, y que un descuento se lea como venta de tela es una analogía que confirma el contador).
**Decide:** qué hace la Vuelta con faltantes y tela inutilizada.
**REABRE:** el supuesto de faltantes («el descuento es decisión del líder»).

## Bloque 4 · Tela

### P-19 · HECHO · header «Tipo tela» · llamada 5
**Pregunta:** Las prendas que corta el Taller, ¿son de tela plana (lino, popelina, satín) o también de punto (jersey, franela)?
- **«Casi todo plano» (Recomendada)** — Ganas: «metros» alcanza. Pagas: si un día cortan punto, llega en kilos.
- **«También punto, por kilo»** — Ganas: el sistema se prepara para kilos. Pagas: el consumo y la factura cambian de unidad; metros por kilo depende de gramaje y ancho.
- **«Mitad y mitad»** — Ganas: refleja el mix. Pagas: dos reglas de compra y de consumo.

**Por qué la primera:** 13 de los 26 modelos con marca CAYLA llevan nombre de tela plana, 0 de punto (10 ambiguos); la base no distingue qué corta el Taller.
**Evidencia:** A · `03·H-3.17`; B/C · `03·H-3.4`; D · R-25 («metro, kilo y rollo»).
**Decide:** si hace falta anotar tela en kilos.
**REABRE:** d.6 (si hay punto).

### P-20 · HECHO · header «Audaces» · llamada 5
**Pregunta:** ¿Qué te entrega Audaces como consumo de un modelo?
- **«Un número por marcada» (Recomendada)** — Ganas: es el consumo de varias tallas juntas; sirve de base. Pagas: no incluye puntas ni defectos; lo gastado saldrá mayor.
- **«Un número por cada talla»** — Ganas: consumo fino por talla. Pagas: el modelo guarda uno solo por ahora.
- **«Promedio con margen puesto»** — Ganas: ya viene aterrizado. Pagas: el margen se cuenta dos veces.
- **«No sé; mando el reporte»** — Ganas: lo vemos real. Pagas: queda pendiente (va en el paquete).

**Por qué la primera:** así funciona un CAD de marcada; el formato real de Audaces no se ha visto.
**Evidencia:** C · `03·H-3.11`, `05·H-5.14`; B · `03·H-3.1` (5,6–9,1 % según cómo se combinen las tallas).
**Decide:** qué número entra al campo de consumo y si `merma_pct` cuenta doble.
**REABRE:** —. (El reporte real también se pide en `10`.)

### P-21 · DECISIÓN · header «Medido manda» · llamada 6
**Pregunta:** ¿Cuántas órdenes cerradas de un mismo modelo quieres antes de que lo gastado mande sobre lo de Audaces?
- **«Varias (3 o más)» (Recomendada)** — Ganas: una orden rara no mueve el modelo. Pagas: las primeras órdenes usan un número que puede estar bajo.
- **«Una sola, como hoy»** — Ganas: aprende rápido. Pagas: una orden con fallas pisa el consumo del modelo.
- **«Siempre Audaces más margen mío»** — Ganas: control tuyo. Pagas: lo real nunca corrige.

**Por qué la primera:** con una sola orden no se distingue ruido de cambio real; el «3» es tu elección (la evidencia solo dice que una no basta).
**Evidencia:** B · `05·H-5.16` (OpenStax: un estándar se revisa); `03·H-3.6` (lo medido mezcla cinco causas).
**Decide:** cuándo «lo real corrige» sobrescribe al modelo.
**REABRE:** **d.6** («lo medido gana»).

### P-22 · DECISIÓN · header «Corte de más» · llamada 6
**Pregunta:** ¿Cuánto se puede cortar de más sin que sea error?
- **«Pocas prendas por talla» (Recomendada)** — Ganas: un tope que se entiende en la mesa. Pagas: hay que fijar el número.
- **«Se queda en 10 %»** — Ganas: nada que cambiar. Pagas: es el techo de lo que cuentan las fuentes; con celdas chicas sube a 20 %.
- **«Un porcentaje menor (5 %)»** — Ganas: cerca de lo habitual de exportación. Pagas: con celdas chicas sigue redondeando hacia arriba.
- **«Libre, sin tope»** — Ganas: sin trabas. Pagas: el plan deja de servir de referencia.

**Por qué la primera:** el 10 % se calcula por talla y color con redondeo hacia arriba (5 pasa a 6, +20 %), y los exportadores usan 2 a 5 %.
**Evidencia:** C · `01·H-1.14`, `03·H-3.9`, `07·H-7.10`; A · la regla de ADR-0415 convive con la de d.7.
**Decide:** la constante de d.7 y su relación con el techo de cierre.
**REABRE:** **d.7** (el 10 %).

### P-23 · HECHO · header «Reposo» · llamada 6
**Pregunta:** Antes de cortar, ¿qué le haces a la tela que llega?
- **«La revisas y mides» (Recomendada)** — Ganas: lo mínimo razonable. Pagas: el reposo y el encogimiento quedan sin anotar.
- **«Reposa o se lava»** — Ganas: menos sorpresas de medida. Pagas: un paso con plazo que hoy no está en ninguna decisión.
- **«Se corta al llegar»** — Ganas: rápido. Pagas: encogimiento y defectos aparecen después.

**Por qué la primera:** es el piso (E); para tejido plano no hay plazo público de reposo.
**Evidencia:** B · `01·H-1.13` (PUCP 2014: el reposo «no está estandarizado»); C · `03·H-3.12`, `H-3.16`.
**Decide:** si el reposo es un paso, un dato de la recepción o nada.
**REABRE:** —.

### P-24 · HECHO · header «Tono» · llamada 6
**Pregunta:** ¿Alguna vez salió un tono distinto entre rollos del mismo color de una prenda?
- **«A veces; los separamos» (Recomendada)** — Ganas: el sistema debe poder decir «no mezclar». Pagas: el consumo toma el lote más antiguo, no el lote de tinte.
- **«Nunca ha pasado»** — Ganas: nada que seguir. Pagas: nada.
- **«Salió en una prenda»** — Ganas: señal para controlar. Pagas: pérdida de la prenda y reclamo al proveedor.

**Por qué la primera:** el tono entre rollos es un defecto estándar de tela.
**Evidencia:** C · `03·H-3.13`; B · `01·H-1.6` (16 % de las fallas de corte medidas en un exportador fue tono).
**Decide:** si el lote de tinte importa más que el de compra.
**REABRE:** —.

## Bloque 5 · Cuando algo sale mal

### P-25 · HECHO · header «Pérdidas» · llamada 7
**Pregunta:** De cada 100 prendas que cortan, ¿cuántas terminan mal (para segunda, para rehacer o perdidas)?
- **«Arreglan muchas, pierden pocas» (Recomendada)** — Ganas: se separa arreglar de perder. Pagas: horas del Taller que hoy nadie anota.
- **«Menos de 3»** — Ganas: confirma tu estimación. Pagas: si no cuenta lo que se arregla, el número engaña.
- **«Entre 3 y 10»** — Ganas: hay que anotar la causa. Pagas: un campo más en cada avance.
- **«Más de 10»** — Ganas: ves dónde ajustar. Pagas: el 3 % de R-31 no sirve de tolerancia.

**Por qué la primera:** en talleres peruanos de costura entre 10 y 28 % de las prendas necesitan arreglo (las dos medidas más firmes, de un mismo taller: 27,6 y 20,4 %), y casi todo se arregla.
**Evidencia:** B · `07·H-7.7`, `02·H-2.19`; C · `03·H-3.8`; B/C · `03·H-3.7`.
**Decide:** si el «menos de 3 %» se sostiene y qué hay que anotar además de las buenas.
**REABRE:** R-31.

### P-26 · DECISIÓN · header «Revisión» · llamada 7
**Pregunta:** La revisión de la prenda terminada, ¿es un paso aparte con su responsable o la hace quien termina?
- **«Quien termina, con visto» (Recomendada)** — Ganas: sin fase extra. Pagas: quien cose juzga su propia prenda.
- **«Paso aparte con responsable»** — Ganas: una persona declara «buena». Pagas: una fase más que alguien marca.
- **«Solo una muestra al azar»** — Ganas: poco trabajo. Pagas: se escapan defectos.

**Por qué la primera:** en el taller de 13 la hace quien acaba; en las plantas grandes hay un puesto propio.
**Evidencia:** B · `01·H-1.4`, `02·H-2.5`.
**Decide:** quién declara «buena» una prenda (d.2 y d.7).
**REABRE:** —.

### P-27 · DECISIÓN · header «Por tandas» · llamada 7
**Pregunta:** ¿Quieres poder pasar a las tiendas una parte del lote antes de terminarlo todo?
- **«No por ahora» (Recomendada)** — Ganas: el stock sigue naciendo una sola vez (principio 4). Pagas: la tienda espera todo aunque parte esté lista.
- **«Sí, por tandas»** — Ganas: se vende antes. Pagas: cambia el cierre al stock; necesita tu OK explícito.
- **«Cerrar y abrir otra»** — Ganas: nada nuevo. Pagas: se pierde el hilo entre las dos órdenes.

**Por qué la primera:** el oficio manda lotes parciales ante urgencias (C), pero no hay dato de cuántas veces le pasa a CAYLA y toca stock y dinero.
**Evidencia:** A · `07·H-7.5`, `06·H-6.18`; C · Apparel Resources; B · Uphance y Katana lo permiten.
**Decide:** si `cerrar_produccion` sigue siendo de un solo cierre.
**REABRE:** la regla de la pantalla de la orden («Pasar al stock» solo cuando la última fase terminó). **Detener y confirmar con Felipe** (toca stock).

### P-28 · DECISIÓN · header «Muestra» · llamada 7
**Pregunta:** Antes de fabricar un modelo nuevo en cantidad, ¿qué debe ser obligatorio?
- **«Anotar quién aprobó» (Recomendada)** — Ganas: queda una vara para reclamar al servicio. Pagas: una frase antes del primer lote.
- **«Muestra aprobada por ti»** — Ganas: control tuyo. Pagas: la orden espera si no estás.
- **«Basta la encargada»** — Ganas: ágil. Pagas: sin registro de quién aprobó.

**Por qué la primera:** lo que falla no es diferir las rondas sino no dejar rastro de la aprobación.
**Evidencia:** C · `07·H-7.15`, `01·H-1.15`; A · hoy un interruptor deja ir un modelo nuevo directo a lote.
**Decide:** d.9 (qué se registra de la muestra).
**REABRE:** —.

### P-29 · DECISIÓN · header «Cambio» · llamada 8
**Pregunta:** Si cambia el pedido ya empezado (50 pasan a 40, o cambia un color), ¿qué prefieres?
- **«Cambiarlo con motivo» (Recomendada)** — Ganas: la orden sigue con su historia. Pagas: hay que decidir qué se puede cambiar según lo avanzado.
- **«Anular y abrir otra»** — Ganas: nada que construir. Pagas: se pierde el historial y la anulación devuelve tela.
- **«Solo mover la fecha»** — Ganas: lo más simple. Pagas: cantidad y color siguen sin poder cambiarse.

**Por qué la primera:** hoy no existe ninguna función que edite una orden abierta.
**Evidencia:** A · `07·H-7.4`.
**Decide:** si se pide una función de edición.
**REABRE:** —.

### P-30 · HECHO · header «Puntualidad» · llamada 8
**Pregunta:** De las últimas cinco entregas de servicios, ¿cuántas llegaron a tiempo y completas?
- **«La mitad» (Recomendada)** — Ganas: el atraso del servicio merece una señal propia. Pagas: otra señal en la lista de órdenes.
- **«Casi todas»** — Ganas: la fecha prometida basta. Pagas: nada.
- **«Pocas»** — Ganas: razón para exigir fecha firme. Pagas: más seguimiento y cambiar de servicio.
- **«No llevo la cuenta»** — Ganas: lo medimos. Pagas: se sigue sin dato.

**Por qué la primera:** el atraso y la calidad son los dos problemas principales de contratar talleres chicos en Perú.
**Evidencia:** B · `07·H-7.9`; C · tesis de una fábrica con atrasos de 5 a 16 días en 11 pedidos.
**Decide:** la métrica de atraso del servicio y su señal.
**REABRE:** —.

## Bloque 6 · Costo, fechas y lo que miras

### P-31 · DECISIÓN · header «Costo» · llamada 8
**Pregunta:** ¿El costo de una prenda cosida en el Taller debe incluir el trabajo de la gente del Taller?
- **«Sí, repartido por horas» (Recomendada)** — Ganas: dos prendas iguales cuestan lo mismo cosidas adentro o afuera. Pagas: hay que saber las horas de cada orden; es un reparto, no un costo exacto.
- **«No, como hoy»** — Ganas: costo directo y simple. Pagas: la prenda cosida adentro sale más barata solo por eso.
- **«Como cifra aparte»** — Ganas: se ve sin tocar el costo de la prenda. Pagas: dos números a leer.

**Por qué la primera:** la mano de obra pesa cerca de un cuarto del costo en el único caso comparable; la planilla del Taller bajó de 6 a 3 personas.
**Evidencia:** B · `05·H-5.2`, `H-5.5`, `H-5.10`; A · `05·H-5.3`, `H-5.11`.
**Decide:** qué entra al costo de una prenda cosida adentro.
**REABRE:** **D-31** (la costura propia fuera del costo).

### P-32 · DECISIÓN · header «Cifras» · llamada 8
**Pregunta:** Al cerrar una orden, ¿cuáles tres cifras quieres ver primero?
- **«Costo, metros, buenas» (Recomendada)** — Ganas: salen de lo que ya se anota. Pagas: no dicen nada del servicio.
- **«Segundas, faltantes, atraso»** — Ganas: sirve para elegir a quién dar trabajo. Pagas: con pocas vueltas el porcentaje es ruido.
- **«Días y costo del Taller»** — Ganas: ves el ritmo y la carga. Pagas: el costo del Taller se apaga con menos de 3 personas.
- **«Prendas afuera, plata»** — Ganas: ves lo que está fuera de casa. Pagas: la plata en proceso pide regla del contador.

**Por qué la primera:** son las tres que se sostienen con lo que ya se anota; las demás tienen una condición.
**Evidencia:** `05` §7 (las ocho métricas), §8 (lo que no conviene medir todavía).
**Decide:** el orden y el peso de lo que muestra el cierre.
**REABRE:** —.

### P-33 · DECISIÓN · header «Fecha» · llamada 9
**Pregunta:** Al abrir una orden, ¿qué fecha es la importante?
- **«Sale del Taller» (Recomendada)** — Ganas: una sola fecha que llenar; la de venta sale sumando el plazo medido. Pagas: depende de medir antes el plazo (P-09 y P-10).
- **«Cuándo se puede vender»** — Ganas: lo que le importa a quien vende. Pagas: obliga a inventar días de traslado.
- **«Las dos, a mano»** — Ganas: las dos verdades. Pagas: dos fechas que llenar y dos rojos.

**Por qué la primera:** el software de referencia separa fin de producción y entrega; en CAYLA hay cuatro pasos entre salir y vender, pero «quitar antes de agregar».
**Evidencia:** B · `06·H-6.19`; A · `06·H-6.21`, `H-6.24`.
**Decide:** la fecha que pinta de rojo la lista.
**REABRE:** — (completa el supuesto de fecha de ADR-0400).

### P-34 · DECISIÓN · header «Para qué» · llamada 9
**Pregunta:** ¿Quieres que cada orden guarde si fue reposición o novedad, y a qué tienda va?
- **«Solo reposición o novedad» (Recomendada)** — Ganas: un dato que no se puede reconstruir después. Pagas: una elección más al abrir.
- **«Las dos cosas»** — Ganas: además sabes el destino. Pagas: dos datos más al abrir.
- **«Ninguna; Traslados decide»** — Ganas: la hoja queda igual. Pagas: no podrás contar cuántas órdenes fueron reposición y cuántas novedad.

**Por qué la primera:** lo que hoy no se guarda no se puede medir luego, y el destino lo decide Traslados.
**Evidencia:** A · `06·H-6.1`, `H-6.4`.
**Decide:** si la orden recuerda por qué se abrió.
**REABRE:** —.

### P-35 · DECISIÓN · header «Urgencia» · llamada 9
**Pregunta:** Cuando se acaba un modelo y lo piden con urgencia, ¿qué debe poder hacer la orden?
- **«Fecha y marca «urgente»» (Recomendada)** — Ganas: la urgencia queda visible sin prioridades automáticas. Pagas: una marca más.
- **«Un orden de fila»** — Ganas: el Taller sabe qué va primero. Pagas: un orden que mantener a mano.
- **«Como hoy: solo la fecha»** — Ganas: nada nuevo. Pagas: la urgencia no tiene vocabulario.

**Por qué la primera:** el sistema no tiene prioridad ni fecha de inicio; el software de referencia usa una cola que se reordena a mano.
**Evidencia:** A · `06·H-6.17`; B · Katana, Odoo; C · Uphance.
**Decide:** si hace falta prioridad.
**REABRE:** —.

### P-36 · DECISIÓN · header «Mínimo» · llamada 9
**Pregunta:** Si un servicio pide un mínimo que un solo modelo no cubre, ¿te sirve mandar dos modelos juntos en una misma Salida?
- **«Solo un aviso» (Recomendada)** — Ganas: lo decidido en d.5. Pagas: el aviso saldrá casi siempre y se ignorará.
- **«Sí, dos modelos juntos»** — Ganas: cumples el mínimo. Pagas: hoy la Salida cuelga de una fase de una orden; cambia la estructura.
- **«Acumular hasta llegar al mínimo»** — Ganas: nada nuevo. Pagas: un lote equivale a meses de venta de un modelo propio.

**Por qué la primera:** no se sabe si pasa seguido; el mínimo (150 a 240) es varias veces el stock del modelo propio mejor abastecido (menos de 50).
**Evidencia:** A · `06·H-6.9`, `H-6.10`.
**Decide:** el alcance de una Salida.
**REABRE:** **d.5 en parte** (el aviso que no bloquea ya lo decidió Felipe; la opción recomendada solo lo repite y las otras dos son las que cambian algo; la evidencia nueva es que el mínimo supera varias veces el stock propio). *(Marca agregada por el Frente 10: la pregunta figuraba sin REABRE aunque su opción recomendada es «lo decidido en d.5».)*

---

# Las 35 que quedan fuera

Cada una sigue el mismo criterio; aquí van en una sola línea por opción. Ninguna es bloqueante. Muchas se cierran con el paquete de evidencia (`10`) y no necesitan llamada.

**P-37 · HECHO · ¿Quién tiende la tela y quién corta?** (1) *Una persona traza, tiende y corta, con una ayudante* (Recomendada) — Ganas: Corte con un responsable (d.2). Pagas: la ayudante no figura. (2) *Dos personas distintas* — Ganas: —. Pagas: Corte con dos responsables y el avance se reparte. (3) *Un servicio corta* — Ganas: libera al Taller. Pagas: Corte entra a Salida y Vuelta. Evidencia: B · `01·H-1.2`. Decide: d.2. REABRE: —.

**P-38 · HECHO · Después de cortar, ¿alguien separa, numera y arma paquetes? ¿Cuántas prendas lleva uno?** (1) *Sí, una persona con puesto propio* (Recomendada) — Ganas: el «habilitado» tiene quién. Pagas: otro responsable dentro de Corte. (2) *Lo hace quien corta, sin paquetes* — Ganas: Corte simple. Pagas: nada numera ni separa. (3) *Se arma ya en la costura* — Ganas: menos pasos. Pagas: se mezclan lotes. Evidencia: B · `01·H-1.3`, `02·H-2.3`. Decide: definición de «habilitado». REABRE: —.

**P-39 · HECHO · ¿Se plancha a mitad de la costura (cuellos, bolsillos) o solo al final?** (1) *Entre operaciones y al final* (Recomendada) — Ganas: refleja el tejido plano. Pagas: Costura incluye plancha y Acabado no la tiene toda. (2) *Solo al final* — Ganas: Acabado completo. Pagas: —. (3) *Lo plancha un servicio* — Ganas: libera. Pagas: otra Salida. Evidencia: B · `01·H-1.5`. Decide: dónde vive la plancha. REABRE: —.

**P-40 · HECHO · ¿Cortan juntos varios colores o varios modelos en un mismo tendido?** (1) *Cada color en su tendido* (Recomendada) — Ganas: la orden por modelo cuadra. Pagas: varios tendidos por orden. (2) *Varios colores juntos* — Ganas: menos tendidos. Pagas: el tono se mezcla. (3) *Dos modelos de la misma tela juntos* — Ganas: menos tela. Pagas: una orden por modelo no alcanza (H12). Evidencia: C/B · `03·H-3.14`, `06·H-6.13`. Decide: la unidad física de la orden. REABRE: —.

**P-41 · DECISIÓN · ¿Anotas los paquetes (número y cuántas prendas) desde ya o seguimos por fase?** (1) *Por fase* (Recomendada) — Ganas: nada que numerar; la base queda lista. Pagas: no ves cuellos de botella por paquete. (2) *Paquetes desde ya* — Ganas: ves dónde se atora. Pagas: numerar antes de cada envío; dato sucio si nadie lo llena. (3) *Solo en Costura* — Ganas: un punto de control. Pagas: un hábito aparte. Evidencia: B · `01·H-1.8`, `08·H-8.5`. Decide: d.1. REABRE: — (completa d.1).

**P-42 · HECHO · ¿Cuántas personas y máquinas hay hoy, y cuántas prendas salen en un día normal?** (1) *De 3 a 5 personas* (Recomendada: la planilla marca 3 y 5) — Ganas: se planifica a ojo. Pagas: «10 operarias» de d.1 se corrige. (2) *De 6 a 10* — Ganas: capacidad para dos modelos a la vez. Pagas: la planilla no lo refleja. (3) *Más de 10 contando afuera* — Ganas: más margen. Pagas: la capacidad real está en los servicios. Evidencia: A · `05·H-5.11`, `00`. Decide: si se necesita capacidad en el sistema. REABRE: —.

**P-43 · HECHO · ¿Cuántos modelos distintos tienen en proceso a la vez?** (1) *Uno o dos* (Recomendada) — Ganas: la tela comprometida casi no importa. Pagas: —. (2) *De tres a cinco* — Ganas: «¿alcanza?» pesa. Pagas: dos órdenes se pisan por tela o mesa. (3) *Más de cinco* — Ganas: pide prioridad. Pagas: sin cola ni prioridad. Evidencia: A · `06·H-6.16`, `H-6.17`. Decide: cuánta concurrencia se prevé. REABRE: —.

**P-44 · HECHO · ¿En qué meses el Taller y los servicios están más llenos?** (1) *Día de la Madre, Fiestas Patrias y Navidad* (Recomendada) — Ganas: la fecha prometida se lee con la temporada. Pagas: sin dato de plazos por temporada. (2) *Solo algunos* — Ganas: menos reglas. Pagas: —. (3) *Parejo todo el año* — Ganas: nada que ajustar. Pagas: —. Evidencia: C/B · `02·H-2.18`. Decide: la fecha prometida. REABRE: —.

**P-45 · HECHO · ¿Cuántas veces al año se reparte la costura de un modelo entre dos lugares?** (1) *Casi nunca* (Recomendada) — Ganas: dos órdenes bastan. Pagas: —. (2) *Algunas veces al año* — Ganas: razón para P-16. Pagas: fricción en campaña. (3) *Seguido* — Ganas: señal clara de reabrir d.3. Pagas: dos órdenes con su Corte cada una. Evidencia: B (baja) · `01·H-1.10`, `06·H-6.14`. Decide: peso de P-16. REABRE: —.

**P-46 · HECHO · ¿De dónde sale la tela, con cuántos días de anticipación y con qué mínimo por color?** (1) *Mayorista local, entrega en días* — Ganas: plazos cortos. Pagas: —. (2) *Fábrica, pedido de semanas o meses* — Ganas: precio. Pagas: capital y plazo largo. (3) *Mixto* — Ganas: flexible. Pagas: dos plazos. Evidencia: C (baja) · `06·H-6.12`. Decide: el plazo de la orden. REABRE: —.

**P-47 · HECHO · ¿Quién pone los botones, cierres e hilo cuando el servicio cose? ¿Se cuentan por prenda o por lote?** (1) *El Taller manda los botones y cierres; el servicio pone el hilo* — Ganas: el hilo no se anota. Pagas: la Salida lleva avíos. (2) *Todo lo pone el Taller* — Ganas: control. Pagas: más que contar. (3) *Todo lo pone el servicio* — Ganas: nada que mandar. Pagas: precio mayor. Evidencia: B · `03·H-3.10`, `02·H-2.10`. Decide: qué es «consumo» de una Salida. REABRE: —.

**P-48 · HECHO · ¿Qué haces con los retazos y las puntas de rollo?** (1) *Se botan* (Recomendada: R-28, D) — Ganas: sin trámite. Pagas: se pierde un valor que nadie mide. (2) *Se venden por peso* — Ganas: ingreso. Pagas: papel y reglas del contador. (3) *Se guardan para detalles* — Ganas: se aprovechan. Pagas: ocupan espacio. Evidencia: B/C · `03` §3. Decide: si los retazos se anotan. REABRE: —.

**P-49 · HECHO · ¿Cómo queda el acuerdo con cada servicio?** (1) *Mensaje de WhatsApp* (Recomendada) — Ganas: ágil. Pagas: no prueba nada ante un reclamo. (2) *Orden de servicio escrita* — Ganas: sostiene que hubo servicio. Pagas: un papel más. (3) *Contrato* — Ganas: lo más firme. Pagas: pesado para un servicio chico. Evidencia: B · `04` §2.3 paso 0. Decide: qué se anota en la fase. REABRE: —.

**P-50 · HECHO · ¿Alguna vez se inutilizó o perdió tela en un servicio? ¿Quién la pagó?** (1) *Nunca ha pasado* — Ganas: nada que prever. Pagas: —. (2) *Pasó y la pagó el servicio* — Ganas: hay precedente de cobro. Pagas: —. (3) *Pasó y la absorbimos* — Ganas: —. Pagas: el precedente es perder. Evidencia: B/C · `04·H-4.13`. Decide: peso de P-18. REABRE: —.

**P-51 · HECHO · ¿Tu contador ya depositó alguna vez la detracción de un servicio? ¿Cuándo se entera del pago?** (1) *No, nunca* — Ganas: se descubre a tiempo. Pagas: multa del 50 % si hubo operaciones sujetas. (2) *Sí, cuando le avisamos* — Ganas: el proceso existe. Pagas: depende del aviso. (3) *No sé* — Ganas: lo consultas. Pagas: pendiente. Evidencia: B · `04·H-4.9`. Decide: si el aviso del ERP llega a tiempo. REABRE: —. (Para el contador.)

**P-52 · HECHO · Cuando un servicio devuelve, ¿cómo se cuenta y quién confirma? ¿Ha habido discusión?** (1) *Se cuenta al recibir y firma el servicio* — Ganas: base de reclamo. Pagas: un papel más. (2) *Se cuenta al recibir, sin firma* — Ganas: ágil. Pagas: discusión sin prueba. (3) *No siempre se cuenta* — Ganas: —. Pagas: el faltante se descubre tarde. Evidencia: B · `08` barrera 3. Decide: cómo se usa la Vuelta. REABRE: —.

**P-53 · HECHO · ¿Cuándo se anota el avance y en qué meses hay horas extra?** (1) *Al final del día* (Recomendada) — Ganas: un hábito. Pagas: se anota de memoria. (2) *Al terminar cada tanda* — Ganas: dato exacto. Pagas: interrumpe el trabajo. (3) *A la semana* — Ganas: poco trabajo. Pagas: dato tarde; en el pico se suelta. Evidencia: B/C · `08·H-8.18`, `H-8.12`. Decide: cuándo conviene pedir el dato. REABRE: —.

**P-54 · HECHO · ¿Qué aparato hay a mano en el Taller para anotar y qué tan lejos está de las mesas?** (1) *El celular de la encargada* (Recomendada: INEI) — Ganas: siempre a mano. Pagas: pantalla chica. (2) *El Mac mini, lejos de las mesas* — Ganas: pantalla grande. Pagas: se anota tarde. (3) *El Mac mini, junto a las mesas* — Ganas: lo mejor. Pagas: —. Evidencia: B · `08·H-8.13`. Decide: celular u otro aparato para el registro. REABRE: —.

**P-55 · HECHO · ¿Quién reparte el trabajo y recibe lo cortado y lo terminado? ¿Siempre la misma?** (1) *Siempre la misma* — Ganas: un punto estable. Pagas: si falta, nadie. (2) *Rota* — Ganas: sin dependencia. Pagas: el «quién» cambia. (3) *Cada una se reparte* — Ganas: autonomía. Pagas: sin punto de control. Evidencia: B · `08·H-8.3`. Decide: P-11. REABRE: —.

**P-56 · HECHO · ¿Alguna vez probaron llevar la producción en Excel, una app o un sistema y lo dejaron?** (1) *Nunca* — Ganas: sin vicios. Pagas: sin experiencia propia. (2) *Excel y lo dejaron* — Ganas: sabes por qué. Pagas: —. (3) *Una app y la dejaron* — Ganas: lección valiosa. Pagas: —. Evidencia: B · `08` §8 (no hay estudio de abandono). Decide: la causa raíz de abandono en esta marca. REABRE: —.

**P-57 · HECHO · Cuando alguien pregunta «¿cuánto cuesta hacer esta prenda?», ¿qué cuentas haces?** (1) *Tela más servicio, al tanteo* (Recomendada) — Ganas: lo habitual en talleres chicos. Pagas: mano de obra e indirectos fuera. (2) *Excel con tela, avíos y mano de obra* — Ganas: más completo. Pagas: otra fuente de verdad. (3) *No se calcula por prenda* — Ganas: —. Pagas: sin referencia para el sistema. Evidencia: B · `05·H-5.1`. Decide: con qué se compara el costo del sistema. REABRE: —.

**P-58 · HECHO · A fin de mes, ¿qué hace tu contador con la tela y las prendas a medio hacer?** (1) *No lo valora* — Ganas: nada que mostrar. Pagas: la plata en proceso es invisible. (2) *Lo valora al cierre* — Ganas: «plata en proceso» tiene regla. Pagas: hay que decir con qué regla. (3) *No sé* — Ganas: lo consultas. Pagas: pendiente. Evidencia: B · `05·H-5.7`. Decide: si se muestra la plata en órdenes abiertas. REABRE: —. (Para el contador.)

**P-59 · DECISIÓN · ¿Te interesa ver en cada orden cuánto habría costado hacerla afuera?** (1) *No por ahora* (Recomendada) — Ganas: nada que mantener. Pagas: sin comparación. (2) *Sí, en cada orden* — Ganas: decides si tercerizar. Pagas: requiere cotizaciones (0 filas) y el costo evitable. (3) *Solo cuando lo pida* — Ganas: sin ruido. Pagas: nadie lo pide. Evidencia: B · `05·H-5.20`. Decide: conectar la cotización de maquila. REABRE: —. (Quedó sin contestar el 13-oct.)

**P-60 · DECISIÓN · El margen por puntas, encogimiento y fallas, ¿igual para todas las telas o distinto por tela?** (1) *Igual para todas* (Recomendada) — Ganas: un porcentaje. Pagas: el lino encoge más que el satín. (2) *Distinto por tela* — Ganas: más justo (3–8 %). Pagas: un dato por tela. Evidencia: C · `03·H-3.18`. Decide: `merma_pct`. REABRE: —.

**P-61 · DECISIÓN · Si el Taller llega a cortar tela de punto, ¿se anota en kilos como se compra o en metros?** (1) *No cortamos punto* (Recomendada si P-19 es «plano») — Ganas: sin cambios. Pagas: —. (2) *En kilos* — Ganas: cuadra con la factura. Pagas: el consumo se escribe en kilos. (3) *En metros con factor por tela* — Ganas: una unidad. Pagas: el factor depende de gramaje y ancho. Evidencia: B/C · `03·H-3.4`, `H-3.5`. Decide: d.6. REABRE: **d.6**.

**P-62 · HECHO · Cuando repites un bordado o estampado que ya hiciste, ¿vuelves a pagar el ponchado o la matriz?** (1) *No, se paga una vez por diseño* (Recomendada) — Ganas: el fijo es del diseño. Pagas: hoy se guarda por orden. (2) *Sí, en cada orden* — Ganas: d.5 tal cual. Pagas: pagas lo ya pagado. (3) *Depende del servicio* — Ganas: refleja la variedad. Pagas: sin regla única. Evidencia: C · `02·H-2.12`. Decide: d.5 (el «fijo por orden»). REABRE: **d.5** (en parte).

**P-63 · HECHO · Cuando sale un modelo nuevo, ¿cuántas pruebas hacen antes de cortar todo y quién aprueba?** (1) *Una prenda de prueba que apruebas tú* (Recomendada) — Ganas: simple. Pagas: depende de ti. (2) *Dos o tres pruebas* — Ganas: menos riesgo. Pagas: semanas. (3) *Se corta directo* — Ganas: rápido. Pagas: riesgo de lote entero. Evidencia: C/B · `01·H-1.15`, `07·H-7.15`. Decide: P-28. REABRE: —.

**P-64 · HECHO · ¿Cuál es el mínimo de cada servicio y baja el precio si pides más?** (1) *Mínimo fijo, sin descuento por más* — Ganas: simple. Pagas: pagas lo mismo con más. (2) *Baja el precio por cantidad* (Recomendada: fichas comerciales) — Ganas: tarifa por escalones. Pagas: d.5 guarda un solo precio. (3) *Sin mínimo para algunos* — Ganas: flexible. Pagas: sin regla. Evidencia: C · `02·H-2.12`. Decide: d.5 (tarifa por escalones). REABRE: —.

**P-65 · HECHO · ¿Cómo le dicen en el Taller a la tanda cortada, al paquete, a lo que sale y a lo que vuelve?** (1) *Las palabras de ADR-0400 (orden, Salida, Vuelta)* — Ganas: ya están en pantalla. Pagas: nada si se entienden. (2) *Otras palabras del Taller (las dices)* — Ganas: lenguaje propio. Pagas: cambiar la pantalla. (3) *No hay palabra fija* — Ganas: —. Pagas: se escoge. Evidencia: `02-glosario-de-campo.md`. Decide: el vocabulario de pantalla. REABRE: —.

**P-66 · HECHO · Desde que llega una caja a la tienda, ¿cuánto pasa hasta que se cuenta y hasta que está colgada?** (1) *El mismo día* — Ganas: se vende ya. Pagas: —. (2) *De dos a cuatro días* (Recomendada: dos traslados de prueba 3,6 y 5,2 días) — Ganas: plazo realista. Pagas: sobrestima si es de prueba. (3) *Más de una semana* — Ganas: —. Pagas: ventas perdidas. Evidencia: A · `06·H-6.21`; D · `06·H-6.24`. Decide: el plazo hasta que se puede vender. REABRE: —.

**P-67 · HECHO · ¿Qué papel acompaña la caja que sale del Taller hacia una tienda?** (1) *Guía de traslado hecha en SUNAT* — Ganas: cumples. Pagas: alguien la emite. (2) *Una nota o mensaje* — Ganas: ágil. Pagas: mismo riesgo que P-02. (3) *Nada* — Ganas: —. Pagas: riesgo. Evidencia: D · BACKLOG (hueco legal real, dejado al contador el 2026-09-16); B · `04·H-4.20`. Decide: la decisión es la misma de Traslados. REABRE: —. (Para el contador.)

**P-68 · HECHO · Cuando lo piden con urgencia, ¿qué hacen hoy?** (1) *Se llama a un servicio* — Ganas: capacidad extra. Pagas: otra orden. (2) *Se para lo que está en curso* — Ganas: rápido. Pagas: se retrasa otra. (3) *Se manda una parte* — Ganas: algo llega. Pagas: P-27. Evidencia: A · `06·H-6.17`. Decide: P-35. REABRE: —.

**P-69 · HECHO · Si la tela no alcanza a mitad del corte, ¿qué hiciste la última vez?** (1) *Se cortó con lo que alcanzó y se avisó* — Ganas: la fase termina corta (P-04). Pagas: se completa con otra orden. (2) *Se compró más, de otro lote* — Ganas: se completa. Pagas: tono distinto (P-24). (3) *Se partió la orden* — Ganas: se ordena. Pagas: dos órdenes sin vínculo. Evidencia: A · `07` #11. Decide: P-04 y P-24. REABRE: —.

**P-70 · HECHO · ¿Cómo encuentras un servicio nuevo y qué miras antes de darle trabajo?** (1) *Por recomendación y capacidad* — Ganas: confianza. Pagas: nada escrito. (2) *Por precio* — Ganas: más barato. Pagas: calidad incierta. (3) *Por una prueba chica antes* — Ganas: menos riesgo. Pagas: lleva días. Evidencia: C · `02·H-2.17` (no hay directorio). Decide: la pantalla de Servicios y tarifas. REABRE: —.

**P-71 · HECHO · ¿Alguna vez mandaron a la tienda una parte del lote mientras el resto seguía en el Taller?** (1) *Nunca* — Ganas: P-27 pierde urgencia. Pagas: —. (2) *A veces, ante una urgencia* — Ganas: razón para P-27. Pagas: cierre por tandas. (3) *Seguido* — Ganas: señal clara. Pagas: cambia el cierre al stock. Evidencia: A/C · `06·H-6.18`. Decide: peso de P-27. REABRE: —.

---

# Comprobación contra la ronda anterior (2026-10-13)

Revisé las 24 preguntas de «Preguntas para Felipe» del README del 13-oct y «Lo que Felipe decidió» (con ADR-0400 y sus actualizaciones). **Ninguna de las 36 repite una pregunta ya contestada.** Las que tocan terreno decidido están marcadas REABRE y traen evidencia nueva.

| Pregunta anterior | Estado | Qué hace esta ronda |
|---|---|---|
| T1 · ¿qué parte tercerizar? | Contestada: fase entera | **P-16 la reabre** con evidencia nueva (2007; 04·H-4.21) |
| T2 · ¿cuándo se dice quién? | Contestada: al abrir, cambiable hasta que empiece | No se toca |
| T3 · ¿qué se anota al mandar? | Contestada: Salida y Vuelta | No se toca (P-02 pregunta por el papel de SUNAT, otra cosa) |
| T4 · ¿cómo se paga a cada servicio? | Contestada: por prenda + fijo | P-62 y P-64 refinan el fijo y el escalón (REABRE en parte); **P-36** toca el aviso de mínimo de d.5 (REABRE en parte; marca agregada por el Frente 10) |
| T5 · si volvieron 97 de 100 | ADR-0400: se pagan las buenas; el descuento es decisión del líder (supuesto) | **P-18 reabre el supuesto** con el Código Civil |
| T6 · ¿con IGV o sin? | Supuesto del arquitecto | P-14 pregunta por el papel real, no por el IGV |
| T7 · adelantos y detracción | Supuesto: sin adelantos; el contador deposita | **P-15** (HECHO) y P-51 (para el contador) |
| T8 · ¿quién anota la vuelta? | Contestada (Q1: quien ve el módulo parado en el Taller) | P-11 pregunta aparato y persona fija; no el permiso |
| F1 · fases | Contestada | P-13 pregunta si falta una fase (ojales y botones); es un hecho |
| F2 · quién agrega fases | Contestada: lista fija | No se toca |
| L1 · tejido y color | Contestada | No se toca |
| L2 · consumo (Audaces) | Contestada: en el modelo, lo real corrige | **P-21 reabre** (cuántas órdenes) |
| L3 · kilo → metro | Contestada: no se construye | P-19 (HECHO) y P-61 (REABRE) |
| L4 · color de la tela | Contestada | No se toca |
| L5 · tela comprometida | Contestada: sí | No se toca |
| A1 · «Terminé N de M» | Contestada | No se toca |
| A2 · segundas | Contestada: no entran al stock | P-06 pregunta dónde esperan y su destino; no reabre |
| A3 · sobrecorte | Contestada: 10 % | **P-22 reabre** el 10 % |
| A4 · fecha | Supuesto del arquitecto | P-33 la completa |
| C1 · color o talla nuevos | Contestada | No se toca |
| D1 · papel del servicio | Contestada: gasto en Finanzas | No se toca |
| D2 · deuda sin papel | Sin respuesta registrada | P-17 pregunta si seguir dando trabajo sin factura (otra cosa) |
| Q1 · permisos | Contestada | P-11 no lo repite |
| Q2 · alcance | Contestada | No se toca |
| «Segundo orden» (sin contestar): costureras, muestra aprobada, costo afuera, encogimiento, ponchado, prioridad | Pendientes por diseño | P-07, P-28, P-59, P-23, P-62 y P-35 las abren ahora con evidencia |

También reabren decisiones antiguas: **P-31** (D-31, 2026-09-12: la costura propia fuera del costo) y **P-27** (la regla de la pantalla de la orden). Ambas lo dicen en su ficha. **Revisión del Frente 10 (2026-10-16):** se volvieron a cruzar las 36 con ADR-0400 completo y sus actualizaciones; la única que repetía algo decidido sin marcarlo era **P-36** (ahora REABRE d.5 en parte). P-04, P-06, P-11, P-28 y P-33 completan o rodean lo decidido sin contradecirlo y así quedan dichas en su ficha.

## Lo que no encontré

- **Los plazos reales de CAYLA:** el banco no puede dar la respuesta de P-09, P-10, P-66; solo ofrece escalones.
- **Qué opciones de HECHO son las más probables** en el Taller: la «recomendada» es la prudente o la que la evidencia hace más probable, no una medición.
- **Una probabilidad para cada opción:** no hay datos de CAYLA; las ofrecidas son las realidades posibles que aparecieron en las fuentes.

## Preguntas que solo CAYLA puede contestar

Todo este archivo. Las que se cierran sin llamada, con el paquete de evidencia, son: P-20 (reporte de Audaces), P-08 (foto del cuaderno), P-09 (orden real con fechas), P-42, P-53, P-54, P-65, P-66 y P-67.

## Fuentes

Las de los archivos `01` a `09` de esta carpeta (cada hallazgo citado lleva su fuente, URL y fecha). Los documentos del repo usados para la comprobación contra la ronda anterior: `docs/investigacion/2026-10-13-produccion-rediseno/README.md` y ADR-0400, leídos con `git show claude/production-module-redesign-136cca:<ruta>`, consultados el 2026-10-16.
