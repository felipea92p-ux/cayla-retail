# 07 · Las excepciones: el camino infeliz de una orden de producción

**Frente 7 · 2026-10-16 · solo lectura.** Ataca H7 (las segundas no entran al stock), H8 (se pierde menos de 3 %), H11 (se corta de más hasta 10 %) y H14 (la muestra se difiere).
Evidencia: **A** medido en la base o el repo · **B** fuente primaria · **C** fuente secundaria · **D** lo dijo Felipe · **E** inferencia mía. Todo consultado el 2026-10-16. Las fuentes con número `[S#]` y `[R#]` están al final.

## Lo más importante, en 8 líneas

1. **Ninguna frecuencia de este archivo viene de CAYLA**: no hay una sola orden (0 filas en las 28 tablas de Producción). Vienen de tesis y artículos peruanos (B), de blogs del oficio (C) o son estimaciones mías (E), y cada una lo dice.
2. **Lo que más pesa no es una excepción de la fábrica sino un hueco del modelo:** una fase del Taller que termina con menos prendas que las que entraron **nunca queda «hecha»**, y la orden nunca llega a «Lista para pasar al stock» en la pantalla nueva (aunque la base sí dejaría cerrarla). Se rompe con tres cosas muy normales: una prenda dañada en costura, tela que no alcanza, o cortar de más (A, H-7.1).
3. **No hay función que edite una orden abierta** (cantidad, color, talla, fecha, tela). Todo cambio de plan termina en «anular y abrir otra», y `anular_produccion` (viva en producción) **devuelve al estante toda la tela consumida como si no se hubiera cortado** (A, H-7.3, H-7.4).
4. **Las segundas no tienen casa física:** el Taller no tiene sububicaciones ni cuarentena (la cuarentena existe solo en las 3 tiendas, alimentada por devoluciones). Lo más parecido que ya existe es «piezas de liquidación» (A, H-7.2).
5. **R-31 (menos de 3 %) no se confirma ni se refuta, pero mide otra cosa:** en talleres peruanos de costura entre 10 % y 28 % de las prendas inspeccionadas necesitan reparación (B para 20 a 28 %; C para 10 a 20 %); casi todo se arregla y no se pierde. Hay que separar **reparar** (tiempo) de **perder** (dinero) (H-7.7).
6. **El 10 % de sobrecorte está en el techo de lo que reporta la literatura**, no en el centro (exportadoras: 2–5 %; marcas pequeñas: ±5–10 %; todo C). Y en el código es `ceil(plan × 1,10)` **por talla y color**: con celdas chicas el margen real sube (5 → 6 es +20 %) (A, H-7.10).
7. **El Código Civil parece decir quién responde por la tela entregada a un servicio** (C: un artículo de doctrina que cita la ley): el contratista debe pagar los materiales que inutiliza por negligencia y devolver los que no se perdieron. Matiza el supuesto «en Lima no hay norma» de ADR-0400: cubre la tela, no una tolerancia de faltantes (H-7.11).
8. **La muestra aprobada es la vara de todo reclamo** (C) y en CAYLA nada guarda «aprobada» (A): un modelo nuevo puede ir directo a lote con un interruptor (H-7.15).

## 0 · Cómo leer el catálogo

- **F (frecuencia)** en órdenes de unas 100 a 300 prendas: **alta** = en la mayoría de las órdenes · **media** = en una de cada tres o cuatro · **baja** = rara. Son umbrales míos (E). Donde hay fuente, se cita; si no, dice «estimación».
- **C (costo)**: **alto** = más de 10 % del valor de la orden, o un estado imposible en la base, o una venta perdida grande · **medio** = entre 2 % y 10 % · **bajo** = tiempo y molestia. También son umbrales míos (E).
- **F × C** (alta = 3, media = 2, baja = 1; alto = 3, medio = 2, bajo = 1). Empates: primero lo que deja un estado imposible en la base de hoy, después la evidencia más firme.
- **«CAYLA hoy»** dice lo que existe en producción o en la rama del rediseño `claude/production-module-redesign-136cca` (sin PR todavía; sus 8 migraciones ya están pegadas en producción). **No propongo pantallas ni tablas**: la **respuesta mínima aceptable** es lo que el Taller tiene que poder hacer o decir, y la **implicación** nombra la decisión de ADR-0400 que toca.
- **«Qué hacen los ERP»** va en una línea y solo cuando lo leí en documentación oficial (B). Donde no lo verifiqué, lo digo. No repito el benchmark del 2026-10-13.

## 1 · Orden de las 41 situaciones (frecuencia × costo)

| # | Situación | F | C | F×C | Evidencia |
|---|---|---|---|---|---|
| 1 | Prenda dañada dentro del Taller (costura, acabado) | alta | medio | 6 | B · A |
| 2 | Cancelar o anular con tela ya cortada o trabajo hecho | media | alto | 6 | A |
| 3 | Sobrecorte: se cortó más que el plan | alta | medio | 6 | C · A |
| 4 | Corte corto: menos prendas que el plan | media | alto | 6 | A · E |
| 5 | Pasar al stock con costo raro o sin tela anotada | alta | medio | 6 | A |
| 6 | Entrega parcial a tienda | alta | medio | 6 | A · B |
| 7 | El servicio devuelve con defectos reparables | alta | medio | 6 | B |
| 8 | Retraso del servicio | alta | medio | 6 | B · C |
| 9 | La tela llegó pero el sistema dice 0 | alta | medio | 6 | A · E |
| 10 | Consumo real mayor que el teórico | alta | medio | 6 | C |
| 11 | Tela insuficiente a mitad del corte | media | alto | 6 | A · C · E |
| 12 | Tela defectuosa | media | alto | 6 | A · C |
| 13 | El servicio devuelve incompleto | media | alto | 6 | B · E |
| 14 | Tono distinto entre rollos o lotes | media | alto | 6 | C · B |
| 15 | Encogimiento o medida fuera de tolerancia | media | alto | 6 | C · E |
| 16 | Bordado o estampado mal puesto, sin primera pieza aprobada | media | alto | 6 | E |
| 17 | Lavandería destiñe, mancha o deforma | media | alto | 6 | E |
| 18 | Modelo nuevo sin muestra aprobada | media | alto | 6 | A · C |
| 19 | Falta de gente o pico de trabajo | alta | medio | 6 | A · E |
| 20 | Segundas (falla chica, vendible con rebaja) | media | medio | 4 | A · B |
| 21 | Error de corte (pieza mal cortada) | media | medio | 4 | E |
| 22 | Paquete con piezas faltantes | media | medio | 4 | E |
| 23 | Tallas desajustadas | media | medio | 4 | A · E |
| 24 | Avío faltante o equivocado | media | medio | 4 | E |
| 25 | Retrabajo que vuelve a salir al servicio | media | medio | 4 | A · B |
| 26 | Etiqueta equivocada | media | medio | 4 | E |
| 27 | Cambio de plan: cantidad, color o talla | media | medio | 4 | A |
| 28 | Partir o juntar órdenes | media | medio | 4 | A · C |
| 29 | Orden olvidada o sin moverse | media | medio | 4 | A |
| 30 | Prenda dañada que se descubre en la tienda | media | medio | 4 | A |
| 31 | Rechazo total del lote | baja | alto | 3 | E |
| 32 | El servicio retiene la mercadería | baja | alto | 3 | E |
| 33 | El servicio usa mal la tela | baja | alto | 3 | B · E |
| 34 | El servicio cierra o desaparece | baja | alto | 3 | A · E |
| 35 | Robo o extravío | baja | alto | 3 | B · A |
| 36 | Dato mal anotado | alta | bajo | 3 | A |
| 37 | Cambio de fecha | alta | bajo | 3 | A |
| 38 | El servicio entrega por tandas | alta | bajo | 3 | A · B |
| 39 | Máquina descompuesta o aguja rota | alta | bajo | 3 | B |
| 40 | Tercera o desmedro (irrecuperable) | baja | medio | 2 | B |
| 41 | Orden duplicada | baja | medio | 2 | A |

## 2 · El catálogo

### Tier 6 (alta × medio, media × alto)

**1 · Prenda dañada dentro del Taller (mancha de aceite, puntada saltada, picado, quemado, mal cosida)** · F alta · C medio
- **Frecuencia:** tesis peruanas sobre costura y acabado nombran manchas de aceite y polvo, puntada saltada, picado y descosido como defectos de mayor impacto, y fallas de máquina como causa de mermas y paradas (B, `[S5]` `[S6]`); la mayoría de las prendas con problema se reparan, no se pierden (`[S4]`).
- **Costo típico:** el valor de la tela y la costura ya puestas si se pierde; horas de reparación si se arregla.
- **Respuesta habitual:** se repara en la misma mesa (zurcido, compostura) o, si no tiene arreglo, queda como segunda o merma; la exportadora o la marca suele absorber el costo del arreglo en el estudio de `[S4]`.
- **Qué hacen los ERP:** el benchmark previo dice que «solo las buenas avanzan» (§2.8); MRPeasy deja reportar un total menor al planeado con confirmación (B, `[S20]`).
- **CAYLA hoy (A):** `produccion_avances` solo suma buenas y una fase del Taller **no tiene segundas ni faltantes** (`fn_fases_de_orden`: «hecha» exige buenas ≥ lo que entró; el comentario de la propia migración lo dice). Con una prenda dañada, la fase queda «en curso» para siempre y Acabado también (porque «hecha» exige que la anterior lo esté). Los candados de la base no lo impiden; lo impide la pantalla (H-7.1).
- **Mínimo aceptable (Taller de ~10):** poder decir «de 50 que entraron, 47 salieron buenas y 3 se dañaron» **dentro del Taller**, con la fase y el motivo en una palabra, y que la fase termine con 47 sin pedirle permiso a nadie.
- **Implicación:** ADR-0400 d.1 (avance «Terminé N de M»), d.7 y R-31; toca H8.

**2 · Cancelar o anular con tela ya cortada o trabajo hecho** · F media (estimación: como no hay cómo editar una orden, todo cambio de plan termina aquí) · C alto
- **Frecuencia:** estimación; el mecanismo sí es medido: no existe ninguna función de edición de una orden abierta (H-7.4).
- **Costo típico:** la tela cortada vale lo mismo que la tela entera en los libros pero no se puede volver a usar; las piezas ya cosidas valen la costura.
- **Respuesta habitual:** las piezas cortadas se reaprovechan en otro modelo, se liquidan como lote chico, o se botan (R-28: el retazo se bota, D); la decisión es del dueño caso por caso. (E: no hay fuente peruana que lo mida.)
- **Qué hacen los ERP:** Uphance cierra una orden cuando todas sus cantidades están recibidas o canceladas, y la cancelación lleva una nota (B, `[S17]`); no leí qué hacen con la materia ya cortada.
- **CAYLA hoy (A, función viva el 2026-10-16):** `anular_produccion` devuelve **todo** el neto consumido de cada lote, a su costo, con motivo `anulacion_orden`, sin mirar cuánto se cortó ni los avances; solo frena si hay prendas afuera. Resultado: tela entera en el libro que ya es pieza cortada, y prendas cosidas que desaparecen **sin ningún movimiento**. `revertir_produccion` solo deshace un cierre y no toca el costo.
- **Mínimo aceptable:** al anular, poder decir qué pasó con lo ya cortado o cosido (se usa en otra orden, se liquida, se bota) y que la tela cortada no reaparezca como tela entera.
- **Implicación:** principio 2; «Qué se rompe si» de ADR-0400; H12 (una orden por modelo).

**3 · Sobrecorte: se cortó más que el plan** · F alta · C medio
- **Frecuencia:** exportadoras cortan 2–5 % de más (C, `[S10]`); el cut-to-ship de seis fábricas estudiadas fue de 96 % a 97 % (C, `[S11]`); una marca pequeña que explica el ticket de corte dice que lo que sale difiere del pedido en ±5–10 % (ejemplo 100 pedidas, 108 cortadas; C, `[S9]`).
- **Costo típico:** tela y avíos de las prendas extra (2–10 % del lote) **si no se venden**; si se venden, es margen.
- **Respuesta habitual:** se corta de más para cubrir fallas; las sobrantes se venden como lote extra o se guardan.
- **Qué hacen los ERP:** Uphance fija una tolerancia de producción (ejemplos de 10 % y 20 %) y redondea hacia arriba la cantidad (B, `[S17]`).
- **CAYLA hoy (A):** primera fase: `ceil(plan × 1,10)` **por talla y color**; el cierre acepta hasta `max(2 × plan, plan + 5)` por talla (ADR-0415). Con celdas chicas, el margen real sube (plan 5 → tope 6, +20 %; plan 3 → 4, +33 %). Además, la fase siguiente exige haber cosido **todo lo cortado** para estar «hecha» (H-7.1): una prenda cortada de más y no cosida bloquea Costura en pantalla.
- **Mínimo aceptable:** que cortar de más esté permitido y no trabe la orden; que las prendas extra se puedan dejar sin coser con una palabra («sobrante de corte»).
- **Implicación:** H11 y ADR-0400 d.7; ADR-0415.

**4 · Corte corto: salieron menos prendas que el plan** · F media · C alto
- **Frecuencia:** estimación; es la consecuencia de #11, #12 y #14 (tela que no alcanza, con defecto o con tono distinto).
- **Costo típico:** prendas que no existen para la fecha prometida; la tienda se queda sin esa talla o color.
- **Respuesta habitual:** se corta con lo que alcanza, se avisa a la tienda y se completa con otra orden (E).
- **Qué hacen los ERP:** MRPeasy pregunta y ajusta la cantidad de la orden a lo reportado (B, `[S20]`); ADR-0400 decidió **no** hacer eso (principio 2).
- **CAYLA hoy (A):** Corte tiene entrada = plan y «hecha» exige Σ hechas ≥ plan: cortar 47 de 50 deja Corte «en curso» y no hay forma de decirle a la base «aquí terminó». La base sí deja cerrar con menos (`cerrar_produccion` no mira «hecha»), la pantalla no (`queSigue`).
- **Mínimo aceptable:** poder terminar un corte con menos del plan y dejar escrito por qué (tela, defecto).
- **Implicación:** ADR-0400 d.7; H-7.1.

**5 · Pasar al stock con costo raro o sin tela anotada** · F alta (estimación, sobre todo en las primeras órdenes de cada modelo) · C medio
- **Costo típico:** la orden queda parada en el Taller hasta que un líder la confirme.
- **Respuesta habitual:** completar la tela usada antes de cerrar (E).
- **CAYLA hoy (A, función viva):** si `fn_costo_fuera_de_banda` marca el costo (incluido «sin costo» por no haber tela anotada), `cerrar_produccion` lanza `costo_atipico_sin_lider` para quien no es líder. La cuenta compartida del Taller no es líder (Frente 0).
- **Mínimo aceptable:** que la encargada sepa antes de intentar cerrar qué le falta (tela usada) y que, si el costo es raro de verdad, la excepción tenga un camino claro.
- **Implicación:** ADR-0400 Q1 y C9 (quién anota); la regla nace de ADR-0298/0400 act. 6.

**6 · Entrega parcial a tienda** · F alta (estimación) · C medio
- **Frecuencia:** estimación; hay tiendas esperando y la orden termina por tandas.
- **Respuesta habitual:** se manda lo que está listo y el resto después.
- **Qué hacen los ERP:** Uphance permite entregas parciales (recibí 12 de 20); Katana pasa al stock lo ya fabricado en «Parcialmente completada» (B, `[S17]` `[S19]`).
- **CAYLA hoy (A):** `cerrar_produccion` es de un solo golpe: fija `terminada` con un total y ya. No hay cierre en tandas; para mandar 30 de 50 hoy hay que cerrar con 30 y perder el resto, o esperar. `revertir_produccion` falla si lo cerrado ya se trasladó.
- **Mínimo aceptable:** poder mandar a la tienda lo terminado sin dar por muerta la parte pendiente.
- **Implicación:** ADR-0400 d.7; H13 (qué fecha promete la orden).

**7 · El servicio devuelve con defectos reparables (zurcidos, composturas)** · F alta · C medio
- **Frecuencia:** en un taller de costura que trabajaba para una exportadora peruana, **27,6 %** de las prendas inspeccionadas salieron con falla de costura (2.201 de 7.985); 14,9 % eran zurcidos y 12,7 % composturas (B, `[S4]`, Cuadro 1). Otra tesis de una textil de Lima halló 24,28 % de prendas inspeccionadas defectuosas (B, `[S5]`).
- **Costo típico:** horas de reparación; en el estudio de `[S4]` la exportadora absorbía los «gastos por arreglos».
- **Respuesta habitual:** el servicio repara antes de entregar o la marca devuelve para que repare.
- **Qué hacen los ERP:** D365 deja elegir si se paga al servicio por buenas o por el total incluyendo desechadas (B, `[S21]`).
- **CAYLA hoy (A):** la Vuelta tiene buenas / segundas / faltantes; se paga lo bueno recibido; no hay «reparable».
- **Mínimo aceptable:** que un defecto reparable no cuente como segunda mientras el servicio todavía lo arregla.
- **Implicación:** ADR-0400 d.4 y act. d; H7, H8.

**8 · Retraso del servicio** · F alta · C medio
- **Frecuencia:** el atraso en las entregas y la baja calidad son el problema principal que las exportadoras encuentran al contratar MYPE de confección (B, `[S4]`, p. 95); una tesis sobre una empresa peruana de confecciones registra atrasos de 5 a 16 días en 11 pedidos (C, `[S8]`, Tabla 17).
- **Costo típico:** venta perdida (la temporada no espera); estimación.
- **Respuesta habitual:** llamar, apurar, mover el pedido a otro taller (E).
- **Qué hacen los ERP:** Odoo marca como atrasada la orden cuyo fin programado pasa del plazo y la pinta de rojo; no reprograma ni avisa solo (B, `[S22]`).
- **CAYLA hoy (A, rama):** la orden pide atención por «entrega pasada», «la tela no alcanza» o «N días sin moverse» (N = 4). Un servicio con **fecha prometida vencida** no tiene su propia señal: solo aparece como «sin moverse» si pasaron 4 días sin anotar nada.
- **Mínimo aceptable:** saber de un vistazo qué servicios ya pasaron su fecha prometida y con cuántas prendas.
- **Implicación:** ADR-0400 d.5 (fecha prometida por servicio); H13.

**9 · La tela llegó pero el sistema dice 0** · F alta (estimación, en las primeras semanas de uso) · C medio
- **CAYLA hoy (A):** `registrar_consumo_insumo` solo anota hasta el saldo del lote más antiguo con saldo y no cruza lotes (la pantalla nueva lo hace con dos llamadas). Si la tela está en la mesa pero nadie la recibió en el sistema, el consumo real no puede anotarse. Hay dos puertas de entrada de tela (Ingresar y Recibir).
- **Respuesta habitual:** se corta igual y se anota después (E).
- **Mínimo aceptable:** que cortar no dependa de que alguien ya haya registrado la llegada, y que el consumo quede anotado con la fecha real.
- **Implicación:** ADR-0400 d.6.

**10 · Consumo real mayor que el teórico (la marcada rinde menos)** · F alta · C medio
- **Frecuencia:** un consultor del oficio, con un ejemplo de fábrica, muestra una pérdida total de 13 % de la tela comprada y 17 % de exceso comprado sobre lo costeado (un solo ejemplo; el artículo trae una cifra que no cuadra con sus propias cuentas; C, `[S11]`). Las causas están en el Frente 3.
- **Respuesta habitual:** se compra con colchón: 3–5 % por desperdicio de corte y 2 % por encogimiento y defectos (C, `[S11]`).
- **CAYLA hoy (A):** el consumo por prenda «declarado» lo corrige el «medido» al cerrar (`metros usados ÷ buenas`), pero ese medido **mezcla** desperdicio, segundas y sobrantes.
- **Implicación:** ADR-0400 d.6 y H6.

**11 · Tela insuficiente a mitad del corte** · F media · C alto
- **Frecuencia:** estimación; los colchones de #10 existen porque pasa.
- **Respuesta habitual:** terminar con lo que alcanza, partir la orden o comprar más (que rara vez es del mismo lote de tinte; ver #14).
- **CAYLA hoy (A):** «¿alcanza?» cuenta lo comprometido por otras órdenes y lo que viene en camino (salvo pedidos atrasados); el estado de la orden y el corte corto, ver #4.
- **Mínimo aceptable:** poder terminar el corte con menos, y partir lo que falta en una orden aparte sin perder la relación entre las dos.
- **Implicación:** H12, ADR-0400 d.3 («para eso, dos órdenes», sin vínculo entre ellas).

**12 · Tela defectuosa** · F media · C alto
- **Frecuencia:** estimación; existe una norma de inspección (4 puntos, ASTM D5430) justamente porque los rollos traen defectos, y cada comprador fija su umbral (C, `[S12]`; la norma no la leí).
- **Costo típico:** la tela es la materia prima más cara del sector (B, `[S7]`, resumen); un tramo botado baja el rendimiento.
- **Respuesta habitual:** se corta alrededor y se reclama al proveedor con fotos; en una maquila de «solo corte y costura» la marca absorbe la pérdida si la tela viene mala y se corta igual (C, `[S15]` `[S16]`).
- **CAYLA hoy (A):** el libro de insumos admite el tipo `merma` en su CHECK, pero **ninguna función lo escribe**. El tramo botado solo puede entrar como `consumo` de la orden (que infla su costo) o como ajuste por conteo.
- **Mínimo aceptable:** poder anotar «botamos N m por defecto» sin cargárselos al costo de las prendas buenas y con el rollo identificado, para reclamar.
- **Implicación:** R-28; ADR-0400 d.6.

**13 · El servicio devuelve incompleto** · F media · C alto
- **Frecuencia:** estimación. La queja de que «los paquetes vengan completos» salía en la investigación previa de una página de Gamarra que hoy ya no existe (410) y sigue sin verificar (`[X1]`).
- **Respuesta habitual:** se cuenta al recibir y se reclama; el faltante se liquida por la relación.
- **Regla supletoria (C, vía un artículo de doctrina):** si el servicio recibe materiales de CAYLA, el Código Civil le exige pagarlos cuando por su negligencia o impericia quedan inutilizables (art. 1774, n.º 3) y devolver los que no se perdieron si la obra se pierde sin culpa de nadie (art. 1788); entregarlos no es venderlos (art. 1773) (`[S3]`, artículo que los cita; verificar el texto vigente).
- **CAYLA hoy (A):** la Vuelta registra `faltantes` con motivo y no se pagan; el descuento al servicio «es decisión del líder, no automática» (supuesto del arquitecto).
- **Mínimo aceptable:** que el faltante quede escrito con quién lo contó y cuándo, para poder cobrarlo si se decide.
- **Implicación:** supuestos de ADR-0400 («en Lima no hay norma»); H7.

**14 · Tono distinto entre rollos o lotes de tinte** · F media · C alto
- **Frecuencia:** estimación; el tono distinto entre rollos y lotes es un defecto de tela estándar; el cuidado es no mezclar en una misma prenda (B/C, `[S13]` `[S14]`).
- **Respuesta habitual:** agrupar y numerar las piezas por rollo o lote para coser con piezas de la misma capa; si el reposo es de otro lote, orden aparte (C).
- **CAYLA hoy (A):** el consumo toma el lote más antiguo con saldo (PEPS) y queda en `movimientos_insumo`; no hay marca de «este color solo de este lote» en la orden.
- **Mínimo aceptable:** saber qué lotes de tela entraron en cada orden y poder avisar «no mezclar».
- **Implicación:** H12 (una orden por modelo contra una por tela × color).

**15 · Encogimiento o medida fuera de tolerancia** · F media · C alto
- **Frecuencia:** estimación; los colchones de 2 % por encogimiento y defectos (C, `[S11]`) existen porque pasa.
- **Respuesta habitual:** reposar la tela antes de cortar y lavar una muestra (E, sin fuente leída).
- **CAYLA hoy (A):** ninguna ficha guarda encogimiento; la investigación previa lo dejó como pregunta de segundo orden.
- **Mínimo aceptable:** que el Taller pueda decir «esta tela encoge y se reposó N días».
- **Implicación:** pregunta de segundo orden de la investigación previa; Frente 3.

**16 · Bordado o estampado mal puesto, sin primera pieza aprobada** · F media · C alto
- **Frecuencia:** estimación (E); el bordado y el estampado salen **sobre pieza o sobre prenda** según el modelo, y un error sobre prenda terminada vale la prenda entera.
- **Respuesta habitual:** aprobar una primera pieza antes de la tirada (E, sin fuente leída; la página del proveedor consultado no publica condiciones, `[S26]`).
- **CAYLA hoy (A):** la Salida y la Vuelta cuentan prendas; no hay «primera pieza aprobada».
- **Mínimo aceptable:** que quede anotado quién aprobó la primera pieza antes de mandar el resto.
- **Implicación:** ADR-0400 d.2 (posición pieza o prenda); H14.

**17 · Lavandería destiñe, mancha o deforma** · F media · C alto
- **Frecuencia/costo:** estimación (E); la lavandería es siempre la última etapa antes de Acabado, sobre prendas terminadas.
- **Respuesta habitual:** prueba de lavado de una prenda antes del lote (E).
- **Mínimo aceptable:** igual que #16: una prenda de prueba aprobada por quién decide.
- **Implicación:** ADR-0400 d.2; H14.

**18 · Modelo nuevo sin muestra aprobada (H14)** · F media (solo para marca propia: 26 de 337 modelos son de marca CAYLA, A) · C alto
- **Frecuencia/costo:** sin muestra aprobada «no hay contra qué reclamar» al servicio (C, `[S16]`); saltarla o aprobarla por correo sin registro es la causa más común de que la producción se desvíe (C, `[S18]`); a la vez, en marcas pequeñas el dueño inspecciona directo y decide rápido (C, `[S18]`).
- **CAYLA hoy (A):** ADR-0396 hace que un modelo nuevo nazca como *Muestra* por defecto (no entra al stock), pero un interruptor lo cambia a *Lote*; `abrir_produccion_con_modelo_nuevo` acepta lote. Una muestra terminada ofrece «Producir este modelo». **Nada guarda «aprobada», ni quién ni contra qué prenda.**
- **Mínimo aceptable:** una frase («aprobada por X el día Y, la prenda de referencia está en…») antes del primer lote de un modelo nuevo.
- **Implicación:** ADR-0400 d.9; H14.

**19 · Falta de gente o pico de trabajo** · F alta (estimación) · C medio
- **Frecuencia:** el Taller es chico y cambia: personas pagadas por período en la planilla del Taller 6 → 5 → 3 (A, Frente 0); la estacionalidad (Día de la Madre, Fiestas Patrias, Navidad) está en el Frente 2.
- **Respuesta habitual:** se mueve la fecha o se manda más a servicio (E). ADR-0400 d.3 ya deja cambiar quién hace una fase **hasta que empiece**.
- **Mínimo aceptable:** poder pasar una fase a un servicio cuando ya se empezó en el Taller, con lo ya hecho contado.
- **Implicación:** ADR-0400 d.3 («una fase entera, un quién»; cambiable hasta que empiece).

### Tier 4

**20 · Segundas (falla chica, vendible con rebaja)** · F media · C medio
- **Frecuencia:** hay talleres que clasifican **primera / segunda / tercera** (tercera = merma), y un incentivo por tope de defectuosos por operaria (C, `[S8]`); la proporción final de segundas no la encontré (solo la de reprocesos, #7). La cifra «1 % de segundas» de la investigación previa no aparece en la fuente que la respaldaría (`[S4]`).
- **Respuesta habitual:** se venden con rebaja, se regalan o se botan (E).
- **CAYLA hoy (A):** (1) el Taller no tiene sububicaciones y la cuarentena existe solo en las 3 tiendas; un disparador rechaza ajustes a mano contra la cuarentena (ADR-0328); (2) las prendas dañadas entran por devolución, cambio o «reportar dañada» y se resuelven como botada, donada, devuelta al proveedor o liquidada; (3) «piezas de liquidación» (ADR-0379) vende prendas fuera del catálogo y del stock, con etiqueta y venta final. El plan de Producción (PLAN F7, línea 268) ya decía que «el costo de lo que salió mal lo pagan las buenas».
- **Mínimo aceptable:** que una segunda tenga un destino físico dicho en voz alta (liquidación, regalo, bota) y su costo ya esté repartido.
- **Implicación:** H7 y act. d de ADR-0400. Ver H-7.2, H-7.12 y H-7.14.

**21 · Error de corte (pieza mal cortada, al revés, talla equivocada)** · F media · C medio
- **Frecuencia:** estimación (E). **Respuesta habitual:** se repone la pieza con retazo del mismo rollo o se pierde la prenda (E).
- **CAYLA hoy (A):** sin camino; se resolvería como #1.
- **Mínimo aceptable:** como #1.

**22 · Paquete con piezas faltantes** · F media · C medio
- **Frecuencia:** estimación; la queja viene de una página muerta (`[X1]`).
- **Mínimo aceptable:** que la Salida quede contada por talla y color y que el servicio avise antes de coser si falta una pieza.
- **Implicación:** ADR-0400 d.4.

**23 · Tallas desajustadas (lo cortado no coincide con la curva)** · F media · C medio
- **Frecuencia:** estimación. **CAYLA hoy (A):** el candado del disponible es por talla y color, así que se ve; el estado de la fase compara la **suma** de todas las tallas (límite conocido de ADR-0400 act. 2026-10-15): 33 de una talla y 17 de otra suman 50 aunque a una le falten 3.
- **Mínimo aceptable:** que quien corta pueda decir cuántas de cada talla salieron y que la tienda vea el cambio.
- **Implicación:** ADR-0400 d.7.

**24 · Avío faltante o equivocado (cierre, botón, hilo, etiqueta)** · F media · C medio
- **Frecuencia:** estimación. **CAYLA hoy (A):** los avíos no tienen «reserva» propia: se cuentan con la tela dentro del plan del insumo; «Pedir» lleva a Órdenes de insumos.
- **Mínimo aceptable:** que la orden pare con una razón dicha (falta botón) y no solo «días sin moverse».

**25 · Retrabajo que vuelve a salir al servicio** · F media · C medio
- **CAYLA hoy (A, rama):** una fase está «hecha» cuando buenas + segundas + faltantes alcanzan lo que entró. Una prenda que el servicio devolvió como segunda **ya no es candidata a otra Salida**; para reenviarla habría que anular la Vuelta entera (si la fase siguiente no usó las buenas, regla `anular_ya_avanzo`).
- **Respuesta habitual:** se devuelve al servicio para que corrija, con plazo (E; en `[S4]` el arreglo lo hace el taller).
- **Mínimo aceptable:** esperar la corrección antes de anotar la Vuelta, o poder reenviar solo las que fallaron.
- **Implicación:** ADR-0400 act. 4b (anular una Vuelta) y d.4.

**26 · Etiqueta equivocada (talla, composición)** · F media · C medio
- **Frecuencia:** estimación. Un resumen de buscador mencionaba una norma andina de etiquetado de prendas y una ley peruana de etiquetado; **no abrí ninguna de las dos, no afirmo su número, su alcance ni su vigencia** (corrección del Frente 10: antes decía «Resolución 2109, vigente para Perú desde 2021» como dato; sin texto primario, es **pregunta para el contador o para quien sepa de etiquetado**).
- **Mínimo aceptable:** que el empaque se revise contra la etiqueta antes de salir.

**27 · Cambio de plan: cantidad, color o talla** · F media · C medio
- **CAYLA hoy (A):** no existe función que edite una orden abierta (H-7.4). Solo `cambiar_quien_fase`, anular, o abrir otra. Un color o talla que el modelo no tiene no se agrega desde la orden (ADR-0400).
- **Qué hacen los ERP:** MRPeasy deja cambiar la cantidad en cualquier momento (B, `[S20]`); Uphance ajusta por tolerancia (B, `[S17]`).
- **Mínimo aceptable:** poder decir «la orden pasa de 50 a 40» sin anularla, con quién y por qué.
- **Implicación:** ADR-0400 «Qué se rompe si»; #2.

**28 · Partir o juntar órdenes** · F media · C medio
- **CAYLA hoy (A, Frente 0):** d.3 dice «para eso, dos órdenes» pero no hay vínculo entre ellas. Juntar (compartir un tendido entre dos modelos de la misma tela) tampoco está en la base, y no encontré fuente que mida cuánto se hace en talleres chicos (E).
- **Mínimo aceptable:** que dos órdenes del mismo corte se vean como hermanas.
- **Implicación:** H12, d.3.

**29 · Orden olvidada o sin moverse** · F media · C medio
- **CAYLA hoy (A, rama):** «N días sin moverse» (4) es una de las tres causas de rojo; la tela comprometida de una orden olvidada sigue apartando metros.
- **Mínimo aceptable:** que alguien reciba la señal y decida (cerrar, anular, esperar).

**30 · Prenda dañada que se descubre en la tienda** · F media · C medio
- **CAYLA hoy (A):** Devoluciones y Cambios mandan la prenda a cuarentena de esa tienda; `prendas_danadas` guarda proveedor (de Compras), cambio y motivo del reporte, pero **no la orden de producción** que la hizo. No hay cómo atribuir un defecto de fábrica al Taller o a un servicio.
- **Mínimo aceptable:** poder decir «esto salió de la orden OP-…» al reportar una prenda dañada.
- **Implicación:** relación con la frontera Traslados/Devoluciones; sin decisión de ADR-0400.

### Tier 3

**31 · Rechazo total del lote** · F baja · C alto
- **Frecuencia:** estimación; más probable la primera vez con un servicio o un modelo.
- **Respuesta habitual:** reclamo, rehacer, o aceptar con descuento (E; en maquila «solo corte y costura» la marca absorbe errores producidos en serie, C, `[S15]`).
- **CAYLA hoy (A):** la Vuelta puede devolver todo como segundas o faltantes con motivo, pero no existe «rechazado» como estado del lote.
- **Mínimo aceptable:** poder dejar escrito «lote rechazado, motivo, qué se acordó».

**32 · El servicio retiene la mercadería** · F baja · C alto
- **Frecuencia:** no hay dato público. **Pregunta para el abogado:** el Código Civil tiene derecho de retención, no lo verifiqué.
- **CAYLA hoy (A):** `anular_produccion` no deja anular con prendas afuera; la salida es una Vuelta con faltantes y motivo.

**33 · El servicio usa mal la tela (cambia, mezcla con la de otro cliente)** · F baja · C alto
- **Regla (C, vía un artículo de doctrina):** la tela entregada sigue siendo de CAYLA (art. 1773, `[S3]`); si el servicio la inutiliza por negligencia, la paga (art. 1774, n.º 3).
- **Mínimo aceptable:** que la Salida deje dicho qué tela y cuántos metros se mandaron, y quién lo recibió.

**34 · El servicio cierra o desaparece con la mercadería** · F baja · C alto
- **CAYLA hoy (A):** salida por la Vuelta con faltantes y motivo; los faltantes no se pagan. Pérdida deducible solo con las condiciones del #35.

**35 · Robo o extravío (Taller, servicio, flete)** · F baja · C alto
- **Regla tributaria (B):** las pérdidas por delitos de dependientes o terceros solo se deducen si se probó judicialmente el hecho o si es inútil ejercer la acción, y en la parte no cubierta por seguro (LIR, art. 37 d, `[S2]`). **Para el contador.**
- **CAYLA hoy (A):** faltantes con motivo, sin política de quién asume el costo.
- **Mínimo aceptable:** guardar el parte o la denuncia y qué se había mandado y cuándo.

**36 · Dato mal anotado** · F alta · C bajo
- **CAYLA hoy (A, rama):** Deshacer el último avance de esa talla y color si nada avanzó después; anular una Salida o una Vuelta con motivo (act. 4b); devolver tela; revertir un cierre (si no se trasladó). Es el mejor cubierto de todos.
- **Mínimo aceptable:** que cada tipo de error tenga su «deshacer» con motivo.

**37 · Cambio de fecha** · F alta · C bajo
- **CAYLA hoy (A):** se rechaza una entrega en el pasado al abrir (ADR-0415); no hay función para cambiar la fecha de una orden abierta ni la `fecha_prometida` de una fase salvo `cambiar_quien_fase`.
- **Mínimo aceptable:** poder mover la fecha con una frase.

**38 · El servicio entrega por tandas** · F alta · C bajo
- **CAYLA hoy (A):** varias Vueltas contra una Salida; «afuera = salidas − vueltas». Uphance admite entregas parciales (B, `[S17]`).

**39 · Máquina descompuesta o aguja rota** · F alta · C bajo
- **Frecuencia:** las fallas mecánicas son causa de mermas y paradas en una textil peruana de pedido (B, `[S6]`); el mantenimiento preventivo es la medida que propone una tesis de 2024 (B, `[S7]`).
- **Mínimo aceptable:** nada en el sistema; sí que un día perdido se vea como «sin moverse con razón».

### Tier 2

**40 · Tercera o desmedro (irrecuperable)** · F baja · C medio
- **Regla (B):** el desmedro es una pérdida cualitativa e irrecuperable; para deducirlo SUNAT acepta destrucción ante notario o juez de paz con aviso previo de al menos 2 días hábiles, o un informe simplificado si el costo destruido en el ejercicio es de hasta 10 UIT (RLIR, art. 21 c, texto de 2020, `[S1]`). Una **segunda vendible no es desmedro**.
- **Mínimo aceptable:** conservar la prenda hasta que el contador diga cómo se destruye.

**41 · Orden duplicada** · F baja · C medio
- **CAYLA hoy (A):** el doble clic y los reintentos están cubiertos (token que sigue al contenido, ADR-0409); dos órdenes abiertas del mismo modelo por personas distintas **no tienen candado** (solo «¿es otro modelo?» al crear uno nuevo), y la tela comprometida lo muestra como «no alcanza».

## 3 · Hallazgos (formato sección 7 del brief)

**H-7.1 · Una fase del Taller que termina con menos prendas que las que entraron nunca queda «hecha», y la orden no llega a «Lista para pasar al stock» en pantalla, aunque la base sí dejaría cerrarla.**
  Evidencia: A · `fn_fases_de_orden` viva (hecha = Σ buenas + segundas + faltantes ≥ entrada, y la fase previa «hecha»); `apps/web/lib/orden-pagina-reglas.ts` l.472 (`estadoDeLaOrden`), l.564 (`queSigue`) y `AccionesDeLaOrden.tsx` l.23 en la rama; `cerrar_produccion` viva no menciona «hecha» · consultada 2026-10-16
  Confianza: alta · Aplica a: ambos
  Lo contradiría: una función o botón que dé una fase por terminada con faltantes (no la encontré en `pg_proc` ni en la rama)
  Implicación: ADR-0400 d.1, d.7 y R-31; toca H8 y H11. Como la rama no tiene PR, el costo de decidirlo es bajo.

**H-7.2 · Las segundas no tienen lugar físico en el sistema: el Taller no tiene sububicaciones; la cuarentena existe solo en las 3 tiendas y se alimenta de devoluciones, cambios y reportes; lo más parecido que ya existe son las «piezas de liquidación».**
  Evidencia: A · `select` sobre `sububicaciones` (3 `cuarentena`, 0 en el Taller), `prendas_danadas` (1 fila `en_cuarentena`), `fn_sububicacion_por_defecto`, migraciones `20260917095000` y `20261014171000`, ADR-0379 · consultada 2026-10-16
  Confianza: alta · Aplica a: ambos
  Lo contradiría: una sububicación del Taller creada después de mi consulta
  Implicación: H7 y act. d de ADR-0400 («segundas no entran al stock»): la prenda real queda sin lugar ni costo propio.

**H-7.3 · `anular_produccion` devuelve al estante toda la tela neta consumida, a su costo, sin mirar cuánto se cortó, y solo frena si hay prendas afuera.**
  Evidencia: A · `pg_get_functiondef('retail.anular_produccion(uuid,text)')` en producción · consultada 2026-10-16
  Confianza: alta · Aplica a: ambos
  Lo contradiría: un cambio de la función posterior a mi consulta
  Implicación: principio 2; «Qué se rompe si» de ADR-0400; H12.

**H-7.4 · No existe función que edite una orden abierta (cantidad, color, talla, fecha, tela); solo se puede cambiar quién hace una fase que no empezó, anular o revertir.**
  Evidencia: A · listado de `pg_proc` con nombres de producción, orden, fase y muestra en `retail` · consultada 2026-10-16
  Confianza: alta · Aplica a: ambos
  Lo contradiría: una función con otro nombre que edite `producciones` (no la encontré)
  Implicación: todo cambio de plan pasa por #2; ADR-0400 d.3 y supuestos.

**H-7.5 · `cerrar_produccion` es un solo cierre: no hay cierre en tandas; el que mejor se parece (revertir y cerrar otra vez) falla cuando lo cerrado ya se trasladó.**
  Evidencia: A · `cerrar_produccion` y `revertir_produccion` vivas; migración `20260915130000` · consultada 2026-10-16. Contraste: Uphance y Katana sí admiten entrega o terminación parcial (B, `[S17]` `[S19]`)
  Confianza: alta · Aplica a: ambos
  Lo contradiría: una entrega parcial hecha por Traslados antes de cerrar (no existe: el stock nace solo en el cierre)
  Implicación: ADR-0400 d.7 y H13.

**H-7.6 · La cuenta compartida del Taller no puede pasar al stock una orden con costo atípico o sin tela anotada: exige un líder.**
  Evidencia: A · `cerrar_produccion` viva: `costo_atipico_sin_lider` · consultada 2026-10-16
  Confianza: alta · Aplica a: ambos
  Lo contradiría: que la cuenta del Taller sea líder (según el Frente 0 no lo es)
  Implicación: ADR-0400 Q1/C9 (quién anota) y d.6 (tela usada).

**H-7.7 · En talleres peruanos de costura, entre 10 % y 28 % de las prendas inspeccionadas necesitan reparación o salen con falla; casi todo se arregla.** *(Corrección del Frente 10: decía «entre 8 % y 28 %»; el 8 % venía de un resumen de buscador no abierto que este mismo hallazgo declara no usar como dato. Re-comprobado en el texto: 2.201 de 7.985 piezas = 27,6 % y 20,4 % tras la mejora, de un solo taller.)*
  Evidencia: B · Industrial Data (UNMSM) 2017: 2.201 de 7.985 (27,6 %), 20,4 % después de la mejora; zurcido 14,9 %, composturas 12,7 % (`[S4]`). B · tesis UNP 2021: 24,28 % defectuosas (`[S5]`). C · tesis de una empresa de confección: defectos «de 10 % a 20 %» y margen de 2 % por operaria (`[S8]`). Un resumen de buscador (no abierto) hablaba de ≈ 8 % de reproceso en una tesis de la UPC; no lo cito como dato · consultadas 2026-10-16
  Confianza: alta para el orden de magnitud, media para compararlo con R-31 (miden cosas distintas) · Aplica a: taller de ~10 operarias
  Lo contradiría: una medición de un taller con inspección en línea y menos de 5 % de fallas
  Implicación: H8; separa «reparar» de «perder».

**H-7.8 · «Pérdida» y «reproceso» no son lo mismo, y R-31 (menos de 3 %) solo habla de lo primero; sobre lo segundo no hay estimación en el repo.**
  Evidencia: E · inferencia a partir de H-7.7 y del cut-to-ship de 95–99 % de exportadoras (C, `[S11]`)
  Confianza: media · Aplica a: ambos
  Lo contradiría: que Felipe cuente «pérdida» incluyendo lo que se repara
  Implicación: H8; una pregunta HECHO.

**H-7.9 · El atraso de entrega y la baja calidad son los dos problemas principales de contratar MYPE de confección en Perú.**
  Evidencia: B · Industrial Data 2017, p. 95 (`[S4]`); C · tesis con atrasos de 5 a 16 días en 11 pedidos (`[S8]`) · consultadas 2026-10-16
  Confianza: media · Aplica a: taller de ~10 operarias (es la MYPE) y servicios
  Lo contradiría: datos de un servicio con entregas puntuales sostenidas (no vi ninguno)
  Implicación: ADR-0400 d.5 (fecha prometida, tarifa) y H13.

**H-7.10 · Cortar de más es práctica universal pero con un porcentaje bajo y variable; el 10 % de ADR-0400 está en el techo de lo que reporta la literatura, y el redondeo por talla y color lo infla en celdas chicas.**
  Evidencia: C · exportadoras 2–5 % (`[S10]`); seis fábricas con cut-to-ship de 96–97 % y rango 95–99 % (`[S11]`); marcas pequeñas ±5–10 % (`[S9]`). A · `fn_produccion_entrada_variante`: `ceil(plan × 1,10)` por talla y color; ADR-0415 · consultadas 2026-10-16
  Confianza: media (todo C, ninguna fuente peruana) · Aplica a: ambos
  Lo contradiría: un dato del Taller de CAYLA con sobrecortes reales mayores
  Implicación: H11, ADR-0400 d.7 y C8 (10 % contra `max(2 × plan, plan + 5)`).

**H-7.11 · Por el Código Civil peruano el contratista que recibe materiales del comitente debe pagarlos si por su negligencia o impericia quedan inutilizables y devolver los que no se perdieron si la obra se pierde sin culpa de nadie; entregarlos no es venderlos.**
  Evidencia: C · artículo de doctrina en Foro Jurídico (PUCP) de Hernández Berenguel sobre bienes entregados a contratistas, que cita los arts. 1773, 1774 n.º 3 y 1788 (`[S3]`); el ejemplo es minero (explosivos y combustibles) pero la regla es general del contrato de obra. No leí el texto de la ley en SPIJ (el Frente 10 tampoco pudo abrirlo; sí comprobó que el artículo cita los tres artículos y transcribe el 2.º párrafo del 1788; bajó la letra de B a C porque es una sola fuente de segunda mano) · consultado 2026-10-16
  Confianza: media (falta confirmar que la maquila de CAYLA es contrato de obra y no de otro tipo) · Aplica a: ambos
  Lo contradiría: un contrato escrito con el servicio que diga lo contrario (el art. 1773 admite pacto o costumbre distinta)
  Implicación: supuesto de ADR-0400 «en Lima no hay norma: lo fija la relación»; H7 y T5 de la ronda anterior. **Para el contador y el abogado.**

**H-7.12 · Una segunda vendible no es un «desmedro»; el desmedro (pérdida irrecuperable) solo se deduce con informe técnico o destrucción acreditada, y un monto bajo tiene un trámite más corto.**
  Evidencia: B · Reglamento de la Ley del Impuesto a la Renta, art. 21 c), texto modificado por D.S. 086-2020-EF (`[S1]`); LIR art. 37 f) (`[S2]`) · consultados 2026-10-16
  Confianza: alta en el texto leído, media en su vigencia (la copia de SUNAT puede no traer cambios posteriores) · Aplica a: ambos
  Lo contradiría: un cambio de norma posterior a 2020 (los resultados del buscador mencionaban una resolución de SUNAT de 2023 que no abrí)
  Implicación: H7 y la lista del contador.

**H-7.13 · Las pérdidas por robo de dependientes o terceros solo se deducen con prueba judicial del delito o prueba de que es inútil ejercer la acción.**
  Evidencia: B · LIR art. 37 d) (`[S2]`) · consultado 2026-10-16
  Confianza: alta · Aplica a: ambos
  Lo contradiría: una modificación posterior del inciso
  Implicación: robo o extravío en servicio o Taller; lista del contador.

**H-7.14 · Según una nota de prensa, INDECOPI (junio de 2026) considera inválido avisar que los productos de outlet no admiten cambios ni devoluciones; ADR-0379 declara las piezas de liquidación «venta final». *(Corrección del Frente 10: el hallazgo afirmaba el criterio de INDECOPI como hecho; solo se leyó la nota, no la norma ni el pronunciamiento. Es pregunta para un abogado.)***
  Evidencia: C · nota periodística que cita a INDECOPI, sin artículo del Código (`[S25]`) · consultada 2026-10-16
  Confianza: baja · Aplica a: ambos
  Lo contradiría: que INDECOPI distinga una prenda con falla informada y aceptada por el cliente
  Implicación: si las segundas se venden como liquidación, revisar «venta final» con un abogado. H7.

**H-7.15 · La muestra aprobada es la vara de los reclamos, y lo que falla no es diferir las rondas sino no dejar registro de la aprobación.**
  Evidencia: C · maquila colombiana: sin muestra aprobada no hay contra qué reclamar (`[S16]`); Uphance: saltarla o aprobar por correo sin registro es la causa más común de desvío, y las marcas pequeñas deciden rápido porque el dueño inspecciona (`[S18]`). A · ADR-0396 (modelo nuevo → Muestra por defecto, con interruptor a Lote), `abrir_produccion_con_modelo_nuevo` · consultadas 2026-10-16
  Confianza: media · Aplica a: taller de ~10 operarias
  Lo contradiría: que en CAYLA el dueño siempre vea la prenda física antes de cada lote nuevo (sin dato)
  Implicación: H14 y ADR-0400 d.9.

**H-7.16 · La tela botada por defecto no tiene camino propio: el tipo `merma` del libro de insumos existe pero ninguna función lo escribe.**
  Evidencia: A · CHECK de `movimientos_insumo` y búsqueda de funciones que insertan en él (`ajustar_insumo_por_conteo`, `anular_produccion`, `devolver_insumo_de_produccion`, `recibir_*`, `registrar_consumo_insumo`) · consultada 2026-10-16
  Confianza: alta · Aplica a: ambos
  Lo contradiría: una función que inserte con otro formato (la búsqueda fue por texto)
  Implicación: R-28, d.6 («lo medido corrige»: el medido mezcla desperdicio) y #12.

**H-7.17 · Los ERP no obligan a cerrar con lo planeado: pueden ajustar la cantidad, entregar por partes y pagar al servicio por buenas o por total.**
  Evidencia: B · MRPeasy (cantidad ajustable con confirmación; «Release unused»), Uphance (entregas parciales, tolerancia), D365 (pago por buenas o total con desechadas), Katana (parcialmente completada), Odoo (atrasada por fecha límite) (`[S17]` `[S19]` `[S20]` `[S21]` `[S22]`) · consultados 2026-10-16
  Confianza: alta · Aplica a: ambos
  Lo contradiría: que CAYLA quiera mantener el cierre único por principio 2 (ya lo decidió para «ajustar a lo real»)
  Implicación: ADR-0400 d.5 y d.7; el contraste es informativo, no una orden.

## 4 · Veredictos sobre las hipótesis

**H7 · «Las segundas no entran al stock (quedan anotadas en la Vuelta); el faltante = enviado − devuelto» → MATIZA.**
- Lo que aguanta: la decisión ya existe en tres documentos (R-31, PLAN F7 «el costo de lo que salió mal lo pagan las buenas», act. d) y coincide con cómo ya se trata a las prendas que no están en el catálogo (piezas de liquidación fuera del stock).
- Lo que no: (1) la segunda es una prenda **real** que queda sin lugar (el Taller no tiene cuarentena; A, H-7.2) y sin costo propio; (2) el faltante no se calcula, se **anota** en la Vuelta, y nada lo anota si pasa dentro del Taller (H-7.1); (3) «el descuento es decisión del líder» convive con una regla supletoria que hace al servicio responsable de la tela que inutiliza (B, H-7.11); (4) una segunda no es desmedro (B, H-7.12) y venderla como «venta final» tiene un riesgo (C, H-7.14).
- Se decide en la recepción (conteo y clasificación) y el destino y el costo lo decide el dueño: pregunta HECHO + DECISIÓN.

**H8 · «Entre el corte y la prenda vendible se pierde menos de 3 %» → MATIZA (ni confirma ni contradice).**
- A favor: exportadoras con cut-to-ship de 95–99 % (C, `[S11]`).
- En contra del número como descripción del proceso: 10–28 % de las prendas de talleres peruanos necesitan reparación (B para 20–28 %, C para 10–20 %, H-7.7); la primera orden de un modelo o con un servicio nuevo no tiene dato. R-31 es una estimación sin medir (D, Frente 0).
- Lo que importa para la base: separar reparar de perder (H-7.8). Sin ninguna orden, no hay forma de saberlo: es la primera pregunta HECHO.

**H11 · «Se puede cortar de más hasta 10 % del plan y solo avanzan las buenas» → MATIZA.**
- El 10 % está en el techo de lo reportado (2–5 % exportadoras, ±5–10 % marcas chicas; todo C) y se calcula por talla y color con redondeo hacia arriba (A, H-7.10).
- El mecanismo hace que cortar de más **trabe** la fase siguiente si no se cose todo (H-7.1). Es el hallazgo más accionable del frente.
- Convive con la regla del cierre `max(2 × plan, plan + 5)` (ADR-0415), que da más margen y pesa por talla.

**H14 · «La muestra es una orden con `es_muestra` y las rondas de muestra se difieren» → MATIZA.**
- Diferir las rondas es razonable para un taller chico donde el dueño decide directo (C, `[S18]`).
- Lo que no se puede diferir es el hecho «aprobada por quién, cuándo y contra qué prenda»: sin él no hay vara para el reclamo (C, `[S16]`) y hoy nada lo guarda (A, H-7.15). Solo aplica a modelos de marca propia (26 de 337 modelos en la base, A).

## 5 · Contraejemplos (lo que dicen los manuales contra lo que pasa en un taller chico)

1. **H8, contra R-31:** los manuales de calidad hablan de pérdidas finales de 1–5 % (cut-to-ship 95–99 %, C), pero los talleres peruanos de costura reparan entre 10 % y 28 % de las prendas (B para 20–28 %). La diferencia es el arreglo: lo que no se pierde sí cuesta tiempo.
2. **H11, contra el 10 %:** las exportadoras planifican 2–5 % de sobrecorte porque venden contra un contrato; una marca con tienda propia puede vender el extra o no, y el 10 % es un techo, no un objetivo.
3. **Inspección de rollos:** el manual manda inspeccionar con el sistema de 4 puntos cada rollo (C, `[S12]`); un taller de 10 operarias no lo hace a diario (E). Lo realista es mirar al tender y anotar.
4. **H14, contra «siempre muestra»:** Uphance reconoce que en marcas chicas el dueño decide rápido y sin sistema (C); el riesgo no es no tener rondas sino no dejar rastro.

## 6 · Lo `[externo, sin verificar]` de la investigación previa que este frente tocó

| Afirmación | Estado | Fuente y nota |
|---|---|---|
| «La inspección real en Lima da ~15 % zurcidos y ~13 % composturas» | **verificada** | `[S4]` Cuadro 1: 14,9 % zurcidos y 12,7 % composturas (7,6 + 3,0 + 2,1), en un taller de costura de Lima que trabajaba para una exportadora |
| «… frente a 1 % de segundas» | **sigue sin verificar** | no aparece en `[S4]`; no encontré otra fuente |
| «La maquila recibe cortes en paquetes de ~30 por talla y color; su queja más repetida es que los paquetes vengan completos» | **sigue sin verificar** | la página de Gamarra citada ya no existe (410, `[X1]`) |
| «Práctica de las exportadoras limeñas: el faltante se liquida como descuento al maquilero» | **sigue sin verificar** | no encontré fuente; sí hay regla supletoria del Código Civil (H-7.11) |
| «Uphance: tolerancia de 10 %» | **verificada** | `[S17]`: ejemplos con 10 % y 20 %, configurable |

## 7 · La respuesta mínima, en ocho frases (lo que un Taller de ~10 necesita poder decir)

1. «De lo que entró a esta fase, tantas salieron buenas y tantas se dañaron, y aquí terminó» (dentro del Taller).
2. «Esta orden se cancela y lo ya cortado se usa / se liquida / se bota».
3. «Esta prenda es segunda y va a…» (destino físico y costo ya repartido).
4. «Botamos tantos metros por defecto de este rollo» (sin cargárselos a las buenas).
5. «Mandamos lo terminado ya; falta el resto».
6. «El modelo lo aprobó X el día Y; la prenda de referencia está en…».
7. «El servicio devolvió menos / dañado; lo contó X; se acordó…».
8. «Este cambio de cantidad, color, talla o fecha lo pidió X por esta razón».

## Lo que no encontré

- **Ninguna frecuencia de CAYLA**: no hay órdenes, ni cuaderno, ni tarifas, ni plazos medidos (Frente 0 y base: 0 filas).
- **Tasa final de segundas** de un taller peruano (solo hay tasas de reproceso). Tampoco una norma o práctica documentada de **quién asume el costo** de las segundas en Lima.
- **Datos públicos de cambios de pedido, robo o extravío en talleres, retención de mercadería y desaparición de talleres**: ninguna fuente. Se quedan como estimación.
- **Libros de texto** (Glock y Kunz y otros): no pude abrirlos; todo lo de sobrecorte y marcadas viene de blogs y artículos del oficio (C), sin una fuente B.
- **Fuentes que no abrieron** (no las cito como respaldo): el PDF de «La confección del progreso» (vacío), la tesis de maestría de la UNMSM sobre talleres externos (error de certificado), la página de Gamarra de talleres a pedido (410), la ficha de SUNAT sobre destrucción de desmedros (403), la norma ISO de muestreo (403), varias tesis de la UPC y de la Universidad de Lima (403), el texto del Código Civil en LP Derecho (403) y el PDF completo de la tesis PUCP 2020 (acceso restringido). Dos resúmenes de buscador (≈ 8 % de reproceso en una tesis de la UPC; 4 % y 7 % en estudios de Bangladés) **no los usé como dato**.
- **Qué pasa con el consumo de tela en las plantas de exportación peruanas**: sin fuente propia.
- **La resolución andina de etiquetado y la nota de INDECOPI en su texto oficial**: solo resúmenes.
- **Las búsquedas web de este frente quedaron cortas**: el presupuesto de 200 búsquedas compartidas entre los agentes se agotó a la mitad; después pude abrir páginas conocidas pero no buscar otras (cambios de pedido, robo, retención, muestra de pre-producción en Perú).

## Preguntas que solo CAYLA puede contestar

1. **HECHO** · «Cuando una prenda sale con una falla chica pero se puede vender más barata, ¿qué haces hoy con ella y dónde queda guardada?»
2. **HECHO** · «En las últimas órdenes que hiciste, ¿cuántas prendas de cada 100 se echaron a perder, y cuántas se tuvieron que rehacer? ¿Fue peor la primera vez de un modelo?»
3. **HECHO** · «Cuando cortas, ¿cuántas prendas de más cortas sobre lo pedido y para qué?»
4. **HECHO** · «Si el servicio te devuelve menos de lo que mandaste o dañado, ¿qué pasa: se repone, se descuenta, se pierde? ¿Qué pasó la última vez?»
5. **HECHO** · «Si la tela no alcanza a mitad del corte, ¿qué hiciste la última vez?»
6. **HECHO** · «Cuando decides que un modelo nuevo ya se puede fabricar en cantidad, ¿quién lo aprueba y cómo queda guardado?»
7. **HECHO** · «Cuando cambian el pedido después de empezar (más o menos prendas, otro color), ¿cómo lo manejan y cada cuánto pasa?»
8. **HECHO** · «Si se cancela una orden o se equivocan después de cortar, ¿qué hacen con las piezas cortadas?»
9. **HECHO** · «¿Alguna vez un servicio llegó tarde, retuvo algo o no devolvió algo? ¿Cuántas de las últimas cinco entregas llegaron a tiempo?»
10. **DECISIÓN** · «Si una fase termina con menos prendas que las planeadas (se dañaron 3), ¿la encargada puede darla por terminada sola o lo aprueba una líder?»
11. **DECISIÓN** · «Las prendas de segunda, ¿las vendes con rebaja, las regalas o las botas?»
12. **DECISIÓN** · «Si el servicio estropea la tela o pierde prendas, ¿lo cobras o lo absorbes por defecto?» (REABRE el supuesto de faltantes de ADR-0400.)
13. **DECISIÓN** · «¿Quieres poder mandar a la tienda una parte de la orden antes de terminar toda?»
14. **DECISIÓN** · «Antes de fabricar un modelo nuevo en cantidad, ¿qué es obligatorio: una muestra aprobada por ti o basta la palabra de la encargada?»

## Fuentes

**Repo y base (A, D).** `[R1]` base `cayla-dynamic`, esquema `retail`, solo `SELECT`, 2026-10-16: `pg_proc` (funciones de producción, anular/cerrar/revertir, `fn_fases_de_orden`, `fn_produccion_entrada_variante`), `sububicaciones`, `prendas_danadas`, `movimientos`, CHECK de `movimientos_insumo`. `[R2]` rama `claude/production-module-redesign-136cca`: migraciones `20261014154000`, `20261014155000`, `20261014160000`. `[R3]` misma rama: `apps/web/lib/orden-pagina-reglas.ts`, `components/orden-pagina/AccionesDeLaOrden.tsx`. `[R4]` ADR-0400 y sus actualizaciones (rama); ADR-0051, 0361, 0379, 0396, 0404, 0409, 0415 (main). `[R5]` `20260915130000_produccion_del_taller.sql`, `20260920100000_devolver_insumos_de_produccion.sql`, `20260917095000_cuarentena_prendas_danadas.sql`, `20261014171000_cuarentena_no_se_ajusta_a_mano.sql`. `[R6]` `docs/datos/15-COMO-OPERA-CAYLA.md` R-28 a R-31; `docs/PLAN-PRODUCCION.md` l. 268. `[R7]` `docs/investigacion/2026-10-13-produccion-rediseno/README.md` (rama). `[R8]` `00-arqueologia-interna.md`.

**Web.** Todas consultadas el 2026-10-16. Nivel entre paréntesis.

- `[S1]` (B) SUNAT, Reglamento de la LIR, Cap. VI, art. 21 c): https://www.sunat.gob.pe/legislacion/renta/regla/cap6.pdf
- `[S2]` (B) SUNAT, TUO de la LIR, Cap. VI, art. 37 d) y f): https://www.sunat.gob.pe/legislacion/renta/ley/capvi.pdf
- `[S3]` (C, doctrina que cita la ley) L. Hernández Berenguel, «Entrega de bienes a contratistas para autoconsumo y sus efectos tributarios», Foro Jurídico (PUCP), posterior a 2007: https://revistas.pucp.edu.pe/index.php/forojuridico/article/download/13810/14434
- `[S4]` (B) M. Pérez Gao, «Implementación de herramientas de control de calidad en MYPEs de confecciones…», Industrial Data 20(2), UNMSM, 2017: https://www.redalyc.org/pdf/816/81653909013.pdf
- `[S5]` (B) Carrasco, Ludeña y Saavedra, tesis UNP, 2021 (ficha del repositorio; resumen): https://alicia.concytec.gob.pe/vufind/Record/RUMP_1a4bdaca2294614b0ff316770f52dbae
- `[S6]` (B) Chicana y Wong, tesis PUCP, 2020 (resumen; texto restringido): https://tesis.pucp.edu.pe/handle/20.500.12404/17435
- `[S7]` (B) Vasquez y Zuñiga, tesis PUCP, 2024 (resumen): https://tesis.pucp.edu.pe/handle/20.500.12404/28920
- `[S8]` (C) tesis de mejora continua en una fábrica de prendas (copia sin carátula legible): https://idoc.pub/documents/idocpub-klzz5wrwvvlg
- `[S9]` (C) Fashion-Incubator, «What is a cutting ticket»: https://fashion-incubator.com/what-is-a-cutting-ticket/
- `[S10]` (C) P. Sarkar, «What is cut to ship ratio», 7-oct-2013: https://onlineclothingstudy.com/2013/10/what-is-cut-to-ship-ratio-in-apparel.html
- `[S11]` (C) R. Thomas, Apparel Resources, 1-jul-2009: https://apparelresources.com/business-news/manufacturing/fabric-management-saving-fabric-or-just-increasing-dead-stock/
- `[S12]` (C) V-Trust, sistema de 4 puntos, 30-mar-2025: https://www.v-trust.com/en/blog/understanding-the-4-point-system-for-fabric-inspections
- `[S13]` (C) ApparelSearch, variación de tono: https://www.apparelsearch.com/terms/s/shade_lot_color_variances.html
- `[S14]` (B, fragmento) manual de formación profesional de India, defectos de tela teñida: https://nimi.co.in/cits_ebooks1/Dress_Making/Dress_Making_Trade_Practical_(Volume_2)/files/basic-html/page111.html
- `[S15]` (C) GAT Colombia, «Qué es la maquila», 23-jul-2026: https://www.gat.com.co/es/recursos/playbooks/que-es-la-maquila
- `[S16]` (C) GAT Colombia, «Maquila vs paquete completo», 23-jul-2026: https://www.gat.com.co/es/recursos/playbooks/maquila-vs-paquete-completo
- `[S17]` (B) Uphance, ayuda «How to create a production order»: https://help.uphance.com/en/articles/1296605-how-to-create-a-production-order
- `[S18]` (C) Uphance, blog de muestra de pre-producción, 29-may-2026: https://www.uphance.com/blog/what-is-a-pre-production-sample-review-and-when-it-belongs-in-plm/
- `[S19]` (B) Katana, estados de la orden: https://support.katanamrp.com/en/articles/271-manufacturing-order-production-statuses
- `[S20]` (B) MRPeasy, avance de la orden: https://www.mrpeasy.com/resources/user-manual/reporting/my-production-plan/details/
- `[S21]` (B) Microsoft Learn, subcontratación en D365: https://learn.microsoft.com/en-us/dynamics365/supply-chain/production-control/manage-subcontract-work-production
- `[S22]` (B) Odoo 18, órdenes atrasadas: https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/manufacturing/reporting/delayed.html
- `[S23]` (B) Odoo 18, subcontratación (no cubrió faltantes ni scrap): https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/manufacturing/subcontracting/subcontracting_resupply.html
- `[S24]` (B) IFRS, resumen de IAS 2: https://www.ifrs.org/issued-standards/list-of-standards/ias-2-inventories/ (menor entre costo y valor neto realizable; no cubrió subproductos)
- `[S25]` (C) La República, 16-jun-2026, INDECOPI y outlets: https://larepublica.pe/sociedad/2026/06/16/compraste-en-un-outlet-o-en-oferta-indecopi-advierte-que-las-tiendas-no-pueden-negar-cambios-ni-devoluciones-897504
- `[S26]` (C) página de un proveedor de bordado de Gamarra (sin condiciones publicadas): https://fabricantes.gamarralima.com/servicio-de-bordado

**Enlaces muertos o ilegibles.** `[X1]` ficha de un taller de corte y confección en fabricantes.gamarra.com.pe, se omite el nombre del negocio (410, murió) · `[X2]` https://scioteca.caf.com/bitstream/handle/123456789/437/La_confeccion_del_progreso._Subcontratacion_en_el_sector_de_textiles_de_exportacion_en_el_Peru.pdf (se abre vacío) · `[X3]` https://eventosindustrial.unmsm.edu.pe/upg_old/archivos/TESIS2018/MAESTRIA/tesis8.pdf (error de certificado) · `[X4]` https://emprender.sunat.gob.pe/node/189 (403) · otros 403: Wiley, riejournal, core.ac.uk, UPC, ISO, LP Derecho.
