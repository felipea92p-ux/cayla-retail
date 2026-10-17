# ULTRA PROMPT · El proceso real de las «órdenes de producción» de CAYLA

**Fecha:** 2026-10-16 · **Pidió:** Felipe: «hay que investigar bien en lugar de diseñar a ciegas; primero un ultra prompt para investigar cómo es el
proceso de órdenes de producción, y luego otra ronda de 36 preguntas para afinar lo que vamos a construir».
**Estado:** prompt listo para correr; **nada de esto se ha ejecutado**. Rama `claude/production-orders-research-e19797`.
**Qué produce:** una carpeta de informes en `docs/investigacion/2026-10-16-ordenes-de-produccion-proceso-real/` y un banco de preguntas del que
salen las 36 de la ronda siguiente. **Qué NO produce:** pantallas, tablas, migraciones ni estimaciones de construcción.

## 0 · Cómo se corre

Este archivo se le entrega entero a un orquestador de agentes (en este repo: el `Workflow` de Claude Code, o `/deep-research` si solo se quiere la
parte de la web). Lo que va **desde la sección 1 hasta la 9 es el prompt**; esta sección y la 10 son notas para quien lo lanza.

- **Orden:** Frente 0 solo (interno, lee el repo y la base) → Frentes 1 a 8 **en paralelo** → Frente 9 (síntesis y contraste) → Frente 10 (escéptico) →
  corrección → entrega. Son **11 agentes**; la investigación anterior usó 14. Si el costo importa, se corre en dos olas (0 y 1 a 4; luego 5 a 8 y el cierre).
- **Herramientas que usa:** lectura del repo (`git show` para lo de la rama del rediseño), `WebSearch` y `WebFetch` (leer, **no descargar** archivos al
  disco), el navegador integrado solo para mirar páginas públicas y demos (**sin crear cuentas ni llenar formularios** de terceros), y el MCP de
  Supabase con **solo `SELECT`** contra el proyecto `cayla-dynamic` (schema `retail`; se encuentra con `list_projects`).
- **Después:** Felipe lee el resumen (10 líneas), se arma la ronda de 36 preguntas en **9 llamadas de 4** (el máximo de `AskUserQuestion`), y con
  sus respuestas se actualiza ADR-0400 o se escribe uno nuevo (`pnpm reservar adr` antes). Recién ahí se construye (`/construir`).

---

# EL PROMPT

## 1 · Misión

Reconstruye, **con evidencia y sin diseñar nada**, cómo se produce de verdad una prenda desde que alguien decide fabricarla hasta que está colgada
en una tienda de CAYLA, en una marca peruana de moda con **Taller propio en Lima** (operarias que cortan y cosen) y **servicios de afuera** (bordado,
estampado, lavandería y, a veces, costura), con tiendas en Trujillo, Arequipa y Lima. Y dile a Felipe, sin adornos, tres cosas:

1. **Lo que ya sabemos** del proceso real (con la fuente y qué tan firme es).
2. **Lo que solo CAYLA puede decirnos** (y exactamente qué pedirle, para que sea fácil de dar).
3. **Qué partes de lo ya decidido en ADR-0400 aguantan, cuáles se matizan y cuáles se contradicen**, con la evidencia al lado.

La pregunta que manda sobre todo: **«¿qué pasa de verdad en cada paso de una orden, quién lo hace, qué papel o dato nace y dónde se rompe?»**
Una función de software que suena bien pero no corresponde a algo que alguien hace en el Taller es un hallazgo (de que sobra), no un requisito.

## 2 · Por qué este prompt existe (léelo: cambia cómo investigas)

- **El Taller nunca abrió una orden real en el ERP.** En producción (`cayla-dynamic`, schema `retail`), `producciones`, `insumos`, `insumo_lotes`,
  `comprobantes_produccion`, `proveedores_produccion` y `cotizaciones_maquila` tenían **0 filas** (verificado el 2026-10-13; `producciones` seguía en
  0 el 2026-10-16). Todo lo que hoy se «sabe» del proceso viene de **entrevistas con Felipe y de benchmarks de
  software**, no de observar el Taller. Eso es diseñar a ciegas, y es lo que este prompt corrige.
- **Ya hubo una investigación de 14 agentes (2026-10-13)** que comparó cómo lo hacen los sistemas de clase mundial (PLM y ERP de moda). **No la
  repitas.** Lo que quedó **sin verificar** en ella (todo lo marcado `[externo, sin verificar]`: tarifas de Lima, detracción, comprobantes de la
  maquila) y lo que **ningún software puede decir** (cómo trabaja un taller pequeño en Lima, qué se anota de verdad, qué sale mal) es tu territorio.
- **Estado del repo al 2026-10-16:** el rediseño **ADR-0400** (fases, quién las hace, «Salida» y «Vuelta», tela por metros) está construido en la rama
  `claude/production-module-redesign-136cca` (25 commits sobre `main`, **sin PR todavía**) y sus 8 migraciones **ya están pegadas en producción**.
  Lo que Felipe ve hoy en `/produccion/ordenes` desde `main` es la pantalla **vieja** («Ninguna orden abierta · Todo lo abierto ya se cerró»).
  Los archivos de esa rama se leen con `git show claude/production-module-redesign-136cca:<ruta>`.

## 3 · Lo que ya existe (léelo primero, no lo repitas)

| Qué | Dónde | Para qué lo usas |
|---|---|---|
| Cómo opera CAYLA y El Taller por dentro (R-25 a R-31: tela por metro/kilo/rollo, consumo por Audaces, corta y cose adentro, terceriza costura y acabados, pago por prenda, merma < 3 %) | `docs/datos/15-COMO-OPERA-CAYLA.md` §7 | Los **hechos que dio Felipe**; el resto lo marcas como dato a verificar |
| ADR-0400 (las decisiones de Felipe del 13 y 14-oct, el modelo de datos y los «supuestos del arquitecto») | rama del rediseño: `docs/adr/0400-produccion-la-orden-con-sus-fases-quien-las-hace-y-su-tela.md` | Tus **hipótesis a poner a prueba** (sección 5), no a revertir |
| Investigación previa de 14 agentes: benchmark de clase mundial, brechas, fuentes y 24 preguntas | rama del rediseño: `docs/investigacion/2026-10-13-produccion-rediseno/README.md` | Su §2 y sus **Fuentes** ya están: cítalas, no las vuelvas a buscar. Las marcadas `[externo, sin verificar]` **sí** las verificas |
| Plan y decisiones D-A…D-I de Producción como módulo propio | `docs/PLAN-PRODUCCION.md`, `docs/adr/0133-*`, `0051`, `0090`, `0156`, `0361`, `0362`, `0396` | No contradecir lo decidido sin decirlo |
| Análisis de la pantalla Resumen y 12 tareas | `docs/pantallas/produccion.md`, `produccion-ordenes-nueva.md` | Contexto; **no** es tu tema |
| Cuánto producir con poca muestra (la decisión «qué y cuánto») | `docs/investigacion/2026-10-13-cobertura-con-poca-muestra/` (rama `claude/tiempo-question-299a41`) | **No repetir.** Solo cruzas con «cómo se pasa de la decisión a la orden» |
| Lo que las pruebas ciegas mostraron de la pantalla | rama del rediseño: `docs/formidable/produccion-modulo.md` | Qué palabras no entendió una colaboradora real (sirve para el glosario) |
| Diccionario de la base | `docs/datos/generado/DICCIONARIO-RETAIL.md` (envejece: verifica contra la base) | Nombres de tablas |

**Ya contestado por Felipe: no lo vuelvas a preguntar, ponlo a prueba con evidencia.** La OP es la única entidad y las áreas son fases; fases Corte ·
Costura · Acabado (+ Bordado, Estampado, Lavandería opcionales); tercerizar = una fase entera con **un** quién, decidido al abrir; «Salida» y «Vuelta»
(nunca «vales»); tarifa por prenda + cantidad mínima + fijo opcional; la tela se compra por **metros**; el consumo se escribe en el modelo y lo medido
lo corrige; avance «Terminé N de M»; las segundas no entran al stock; Órdenes como lista y la orden como página propia.

## 4 · Reglas del juego

1. **Niveles de evidencia.** Toda afirmación lleva una letra, una fuente y la fecha en que la consultaste:
   **A** medido por ti en la base o el repo · **B** fuente primaria citable (norma de SUNAT o del Estado, documentación oficial del producto, libro de texto
   o tesis) · **C** fuente secundaria (blog de un taller, ficha comercial, nota de prensa) · **D** lo dijo Felipe y está escrito en el repo ·
   **E** inferido por ti (dilo: «inferencia»). Sin letra, no cuenta.
2. **Contraste, no confirmación.** Para cada tema busca activamente **lo que lo contradice**: qué hacen los talleres pequeños distinto de lo que dicen los
   manuales; cuándo la práctica habitual **no** aplica. Cada frente entrega al menos un contraejemplo.
3. **«No lo encontré» es un resultado válido.** No rellenes. Un hecho que solo CAYLA sabe va a la lista de preguntas, no se inventa ni se «supone razonable».
4. **Solo lectura.** Base de producción: únicamente `SELECT`. No escribas, no migres, no toques `apps/web`, no abras PR, no hagas commit.
5. **El repo es público.** En archivos versionados **nada** de nombres de proveedores u operarias, RUC, tarifas reales ni montos reales de CAYLA; usa
   rangos y descripciones («un servicio de bordado de Lima»). Lo crudo se queda en el scratchpad de la sesión.
6. **Derechos de autor.** Resume con tus palabras; a lo sumo **una cita de menos de 15 palabras por fuente**, entre comillas y con atribución.
7. **Fuentes.** En español y en inglés. Para lo peruano, primero fuentes primarias (SUNAT, El Peruano, MTPE/SUNAFIL, PRODUCE, SENATI, MINEDU, tesis de
   PUCP/UNMSM, ADEX, APTT, Gamarra); para lo universal, la bibliografía de ingeniería de producción de prendas. Guarda URL, fecha y si el enlace murió.
   Un blog comercial solo vale como nivel C y solo si algo lo corrobora.
8. **Distingue «cómo se hace» de «cómo lo vende un software».** Lo segundo ya se hizo; no lo mezcles con lo primero.
9. **Vocabulario.** Escribe como se habla en el Taller; si un término tiene nombre distinto en el oficio, en el ERP y en la tienda, regístralo en el
   glosario. Nunca «empleado», «jefe» ni «sucursal» (se dice colaborador, líder de equipo, sede); a quien compra se le dice «cliente».
10. **No diseñes.** Ni pantallas, ni tablas, ni «propongo que el sistema…». Cada hallazgo termina con **una línea de implicación** («esto afecta a la
    decisión X de ADR-0400»), y nada más.

## 5 · Hipótesis que el sistema ya da por ciertas (tu trabajo es intentar romperlas)

Cada una trae de dónde sale y por qué podría fallar. Un frente que las ataca debe devolver **confirma / matiza / contradice / sin evidencia**.

| # | Hipótesis | Sale de | Por qué podría fallar | Frente |
|---|---|---|---|---|
| H1 | El avance se anota por **fase** y basta (sin bulto, sin operación, sin operaria): «con 10 operarias y un estilo el papel alcanza» | ADR-0400 d.1 | En muchos talleres la operaria cobra por pieza u operación; ahí el dato por bulto es el que importa y sale solo | 1, 5, 8 |
| H2 | La espina es Corte · Costura · Acabado; trazo, tendido y habilitado caben dentro de Corte | ADR-0400 d.2 | Habilitado (ticketear, separar, entretelas) y control de calidad pueden ser fases con quién propio; el planchado/etiquetado/empaque quizá no es «Acabado» a secas | 1, 2 |
| H3 | Tercerizar es **una fase entera con un quién**; no se reparte entre dos talleres | ADR-0400 d.3 | En picos se parte la costura entre dos talleres; el corte a veces sale; «tela del cliente» vs «puesto a taller» cambia quién es dueño de qué | 2, 4, 6 |
| H4 | Se paga **por prenda**, con cantidad mínima (150–240) y un fijo opcional | R-30; ADR-0400 d.5 | También por docena, por kilo, por operación o por hora; adelantos y garantías; el mínimo varía por fase | 2, 4, 5 |
| H5 | La tela se compra por **metros**, no por rollos ni kilos | ADR-0400 d.6 (reabre R-25) | El punto (jersey, algodón peinado, piqué) se vende por kilo con ancho tubular y gramaje; convertir a metros tiene su propia merma | 3 |
| H6 | El consumo por prenda sale de Audaces, se escribe una vez en el modelo y **lo medido lo corrige** | R-26; ADR-0400 d.6 | El consumo real depende del tendido, los empalmes, el ancho útil y el tono de lote; el teórico y el real divergen con patrón conocido | 3, 5 |
| H7 | Las **segundas no entran al stock** (quedan anotadas en la Vuelta); el faltante = enviado − devuelto | ADR-0400 d.4; A6 | CAYLA ya tiene cuarentena y liquidación de segundas; ¿se decide en la recepción o después? ¿quién asume el costo? | 4, 7 |
| H8 | Entre el corte y la prenda vendible se pierde **menos de 3 %** | R-31 (estimación) | Puede ser mucho más en la primera orden de un modelo, con tela nueva o con servicio nuevo | 3, 5, 7 |
| H9 | La «guía» de una Salida basta como **texto** | ADR-0400 d.4 | Enviar tela o prendas a un tercero **puede exigir** guía de remisión electrónica (SUNAT); si aplica, el texto no alcanza | 4 |
| H10 | La maquila con tela de CAYLA es «fabricación por encargo» y lleva **detracción del 10 %** sobre S/ 700; el ERP «solo avisa» | ADR-0400 (supuestos) `[externo, sin verificar]` | La tasa, el umbral y el tipo de operación dependen de quién pone la tela y de qué se factura; es tema del contador | 4 |
| H11 | Se puede **cortar de más hasta 10 %** del plan y solo avanzan las buenas | ADR-0400 d.7 | El 10 % es una constante de código sin respaldo; ¿cuánto de más se corta de verdad y por qué? | 1, 3, 7 |
| H12 | Una orden es **un modelo**, con sus colores y tallas | ADR-0051, ADR-0400 | Se tiende y corta junto lo que comparte tela; una orden por «tela × color» puede ser más natural que por modelo | 1, 3, 6 |
| H13 | La fecha de entrega **promete que las prendas salen del Taller** ese día | ADR-0400 (supuestos) | La fecha que le importa a quien vende es cuándo llega a la tienda (Lima → Trujillo/Arequipa) | 6 |
| H14 | La muestra es una orden con `es_muestra` y las rondas de muestra **se difieren** | ADR-0400 d.9 | Si el modelo nuevo no tiene muestra aprobada, toda la orden hereda el riesgo; ¿dónde se decide eso hoy? | 1, 7 |

## 6 · Los frentes

Para **cada** frente: (a) lee antes lo que la sección 3 diga de su tema, (b) investiga lo de su lista, (c) devuelve el archivo con el formato de la sección 7,
(d) cierra con «Lo que no encontré» y «Preguntas que solo CAYLA puede contestar».

### Frente 0 · Arqueología interna (corre primero; un agente; solo lectura)

Objetivo: que los demás frentes **no repitan** y que se vea el hueco real.
- Arma el **mapa de lo ya sabido**: tema → dónde está escrito → quién lo dijo → estado (`decidido por Felipe` · `propuesto` · `hipótesis` · `desconocido`).
  Temas mínimos: fases, tercerización, tarifas, tela y consumo, avance, segundas y faltantes, costeo, fechas, permisos, muestras, documentos.
- **Ground truth en la base (`SELECT`):** para cada tabla de Producción (`producciones`, `produccion_lineas`, `produccion_fases`, `produccion_avances`,
  `produccion_salidas`/`_lineas`, `produccion_vueltas`/`_lineas`, `produccion_insumos`, `producto_consumos`, `proveedor_tarifas`, `proveedores_produccion`,
  `cotizaciones_maquila`, `insumos`, `insumo_lotes`, `movimientos_insumo`, `comprobantes_produccion*`, `ordenes_insumo*`): filas, primera y última fecha.
  Cuántos `movimientos` entraron con motivo de producción; cuántos productos y variantes existen y cuántos son del Taller; cuántos colaboradores hay en
  el Taller **por rol** (sin nombres: contraste con «10 operarias»); qué `rubro` tienen los proveedores de Producción (conteo, sin nombres).
- **Lista de contradicciones internas**: dos documentos del repo que digan cosas distintas del mismo proceso (p. ej. R-25 «metro, kilo y rollo» contra
  ADR-0400 «metros»; R-26 «Audaces» contra ADR-0133 d.5 «lo medido»).
- Entrega: `00-arqueologia-interna.md` (≤ 1.200 palabras, con tablas) + la lista de huecos que cada frente debe atacar.

### Frente 1 · El ciclo completo, como se practica (universal)

De «alguien decide fabricar» a «la prenda está en la tienda»: desarrollo y ficha técnica → moldería y escalado → muestra y aprobación → compra y recepción de
tela (revisado, reposo/encogimiento) → trazo/tizado → tendido → corte → habilitado (ticketear, bultos, separar piezas, entretelas) → bordado/estampado en pieza
→ costura (operaciones, líneas, balanceo) → acabados (hilos, planchado, control de calidad, etiquetas, doblado, embolsado) → empaque → despacho → recepción.
- Para **cada etapa**: entradas, salidas, quién la hace (por tamaño de taller: 5, 10, 30 personas), qué papel o registro físico existe (hoja de corte, ficha
  de ruta, ticket de bulto, tarjeta de destajo…), punto de control, tiempo típico y su variabilidad, el error clásico y **qué dato nace**.
- **Dónde se parte o se junta**: una orden que se divide en varias; varias que comparten tendido; entregas parciales a tienda.
- Fuentes de referencia: ingeniería de producción de prendas (Glock y Kunz; Stephens; Solinger; Mehta), Fashion-Incubator, OIT/UNIDO, y los catálogos de
  SENATI y MINEDU ya citados. Contrasta lo que dicen los libros (planta grande) con lo que cambia en un taller de ~10 operarias.
- Ataca: H1, H2, H3, H11, H12, H14.
- Entrega: `01-mapa-del-proceso.md` con un **swimlane en Mermaid** (3 niveles: 6 cajas · 12 · detalle) y la tabla etapa × (entrada, salida, quién, papel,
  control, error clásico, dato).

### Frente 2 · Cómo se hace en Lima y en Perú (local)

- Estructura del ecosistema: taller de confección propio, maquila/facción, talleres satélite, **servicio** de bordado, estampado (serigrafía, DTF, sublimado),
  lavandería, plisado, ojales y botones, acabados. Cuántos hay, cómo se encuentran, cómo se elige uno (Gamarra, Villa El Salvador y alrededores).
- **Cómo se pide un servicio** (ficha técnica, prenda piloto, muestra), cantidades mínimas, plazos típicos, **cómo se paga** (por prenda, docena, kilo,
  operación o minuto; adelantos y contra entrega), cómo se recibe (conteo, clasificación primera/segunda/incompletos), qué pasa si falta o viene mal, relaciones
  y conflictos típicos, informalidad.
- **Trabajo de las operarias:** destajo o sueldo, horas, estacionalidad (Día de la Madre, Fiestas Patrias, Navidad, campaña escolar), rotación; qué régimen
  laboral aplica a un taller pequeño (solo **lo que afecte al dato de producción**, no asesoría laboral).
- **Verifica lo que quedó `[externo, sin verificar]`** en la investigación previa: tarifas de Lima (corte, bordado, serigrafía, lavandería), condiciones de
  los talleres de Gamarra, comprobantes que emite un taller de maquila. Cada una: `verificada` · `refutada` · `sigue sin verificar`, con su fuente y su fecha
  (una tarifa de 2014 no es una tarifa de 2026).
- Ataca: H2, H3, H4.
- Entrega: `02-peru-y-lima.md` + `02-glosario-de-campo.md`: **una fila por término** con (cómo lo dice el Taller · cómo lo dice el ERP · cómo lo entiende una
  colaboradora de tienda · si confunde). Es el insumo del vocabulario de pantalla; recuerda que Felipe rechazó «vales» y que «servicio» gana a «maquila» en el oficio.

### Frente 3 · Tela y materiales: cuánto, cómo se mide y por qué se desvía

- **Cómo se compra y se mide la tela por tipo:** tejido plano (por metro, ancho útil) contra tejido de punto (por kilo, tubular o abierto, gramaje, rendimiento
  m/kg), rollos, lotes de tinte (el tono entre lotes y por qué un modelo-color debería salir de un solo lote), reposo y encogimiento, defectos y reclamos.
- **Cómo llega el consumo:** el trazo/marcada y su eficiencia, el reporte que entrega un CAD de moldería (Audaces y alternativas): por marcada, por talla o
  promedio; cómo se traduce a «metros por prenda»; consumo teórico contra real y **las causas del desvío con su magnitud típica** (puntas de tendido, empalmes,
  defectos, sesgo de talla, muestras, errores).
- **Retazos y sobrantes:** qué se hace con ellos (R-28: se botan), qué valor tienen, cuánto es lo normal.
- **Avíos y todo lo que no es tela:** hilo (conos, metros por prenda), cierres, botones, elásticos, etiquetas, bolsas: unidades de compra y de consumo, quién los
  pone (el taller o el cliente), cuáles se descuentan por prenda y cuáles por lote.
- **Reservas:** cómo se evita prometer dos veces la misma tela a dos órdenes; qué hacen los talleres pequeños sin sistema.
- Ataca: H5, H6, H8, H11, H12.
- Entrega: `03-tela-y-materiales.md`: tabla «insumo → cómo se compra → cómo se consume → conversión → desvío típico → quién lo mide» y las 5 causas más
  comunes de desvío, cada una con su magnitud **o** la nota «no hay dato público; preguntar al Taller».

### Frente 4 · Tercerización a fondo: documentos, control, dinero y tributos

- **El flujo físico y de papeles:** qué viaja (tela, piezas cortadas, prendas armadas), cómo se cuenta al salir y al volver, qué documento acompaña, quién firma,
  cuánto tarda, qué se pierde. Tolerancia de faltantes, **segundas y retrabajo**, descuentos y penalidades, adelantos, riesgo de tela fuera de casa.
- **Guía de remisión (SUNAT):** ¿el envío de tela o de prendas a un tercero para su transformación **obliga** a una guía de remisión del remitente? ¿qué
  motivo de traslado corresponde? ¿es electrónica y desde cuándo? ¿quién la emite y con qué datos? Lee las normas primarias, no resúmenes. (H9)
- **Tributos del servicio:** IGV y crédito fiscal con la factura del taller; **detracción** (SPOT) y si aplica a «fabricación por encargo» con tela propia o del
  taller, tasa y umbral vigentes; retenciones; si procede un recibo por honorarios o no; sustento del gasto. (H10) Todo con fuente primaria **o** marcado
  «pregunta para el contador» (hay una pregunta abierta de CAYLA con el contador sobre otros temas: A-08 de `15-COMO-OPERA-CAYLA.md`).
- **Contabilidad del costo:** dónde cae el servicio y la tela en proceso (el plan contable peruano habla de productos en proceso y de servicios prestados por
  terceros); solo para que el costeo del Frente 5 no contradiga al contador. Marca lo que sea del contador, no lo resuelvas.
- **Cuándo y por qué se tercerizan unas fases y otras no:** capacidad, especialidad, costo, picos. Qué fases suelen salir y cuáles casi nunca.
- **Si algo de esto implica una integración con valor legal (guía electrónica, comprobante), solo descríbelo y márcalo «detener y confirmar con Felipe»; no
  propongas construirlo.**
- Ataca: H3, H4, H7, H9, H10.
- Entrega: `04-terceros-documentos-y-tributos.md`: flujo de tercerización con sus papeles, tabla de documentos (qué es · quién lo emite · obligatorio sí/no/depende ·
  evidencia), **matriz de riesgos** (probabilidad × costo) y **la lista de preguntas para el contador**.

### Frente 5 · Costeo, medición y lo que el dueño decide con una orden cerrada

- **Cómo calcula una marca pequeña el costo de una prenda:** tela + avíos + mano de obra o servicio + indirectos; estándar contra real; cómo entran las mermas y
  las segundas; qué se hace con lo que está en proceso a fin de mes. Contrasta con CAYLA: promedio ponderado (ADR-0067), costo desde el consumo real (ADR-0133 d.4).
- **Pago de operarias (destajo o sueldo) y su efecto en el costo y en el dato.** (H1, H4)
- **Qué mira el dueño de verdad** y qué decide con ello: ¿rehago este modelo?, ¿a quién le doy el servicio?, ¿subo el precio?, ¿me conviene tercerizar esta
  fase? Separa **lo que los consultores recomiendan medir** de **lo que un taller de ~10 personas realmente mira**.
- **Métricas:** lead time por etapa, cumplimiento de fecha, rendimiento de tela, tasa de segundas y de faltante, WIP, productividad. Para cada una: fórmula, dato
  que necesita, quién lo anota y cuándo, y si un taller pequeño lo mantiene vivo.
- Ataca: H1, H4, H6, H8.
- Entrega: `05-costeo-y-metricas.md`: **máximo 8 métricas** que valen la pena, cada una con su porqué, y una lista aparte de **lo que no conviene medir todavía**.

### Frente 6 · Planificación: del «hay que producir» a la orden, y de la orden a la tienda

- **Qué información lleva una orden al nacer y de dónde sale** (la decisión de producir, la curva de tallas, la tela disponible, el servicio y su capacidad, la
  fecha que se promete). Cómo deciden las marcas pequeñas reposición contra novedad.
- **Tamaño de lote:** mínimos de tela y de servicio, curva de tallas, lotes de tinte; cuándo conviene **partir** una orden y cuándo **juntar** dos.
- **Capacidad y secuencia en un taller propio** (máquinas, operarias, horas): cómo se programa, qué es un cuello de botella típico, cómo se maneja una urgencia.
- **De la orden a la tienda:** entregas parciales, el tramo Lima → Trujillo/Arequipa (plazos reales, la frontera con Traslados), y qué fecha es la que importa.
- **No repitas** el cálculo de «cuánto producir» (cobertura con poca muestra); solo describe el puente.
- Ataca: H3, H12, H13.
- Entrega: `06-planificacion.md`: el «acta de nacimiento» de una orden (qué datos, de dónde) y una tabla de plazos típicos por etapa **con fuente o con «dato de
  Felipe pendiente»**.

### Frente 7 · Las excepciones: el camino infeliz

Catálogo de **30 o más** situaciones, entre ellas: tela insuficiente a mitad del corte · tela defectuosa · error de corte · sobrecorte · piezas faltantes ·
tallas desajustadas · tono distinto entre lotes · retraso del servicio · el servicio devuelve incompleto o con defectos · retrabajo · segundas · rechazo total ·
cambio de plan (cantidad, color, talla, fecha, cancelar) · partir o juntar órdenes · entrega parcial · robo o extravío · el dato se anotó mal · orden duplicada ·
anular después de haber consumido tela · modelo sin muestra aprobada.
- Para cada una: **frecuencia** (alta/media/baja, con fuente o «estimación»), **costo típico**, **la respuesta habitual en la práctica** y, en una línea, qué
  hacen los ERP (sin repetir el benchmark). Cruza con lo que CAYLA ya tiene: cuarentena y liquidación de segundas, `anular_produccion`, `revertir_produccion`.
- Ataca: H7, H8, H11, H14.
- Entrega: `07-excepciones.md` ordenado por **frecuencia × costo**, con «la respuesta mínima aceptable para un Taller de ~10 operarias».

### Frente 8 · La gente y las herramientas en el piso (adopción)

- **Cómo se registra de verdad el avance** en talleres pequeños: cuaderno, hoja de ruta, tickets de bulto con código, tarjeta de destajo, WhatsApp, Excel,
  tablet. Quién registra (¿la encargada o cada operaria?), cuándo (al empezar, al terminar, al final del día), con qué dispositivo y con qué conexión.
- **Por qué fallan los sistemas en un taller pequeño:** casos y causas (el dato que nadie anota a tiempo, la jerga, la doble digitación, la pantalla lejos de la
  mesa de trabajo, el miedo a que el dato se use para controlar). Qué hizo que algunos sí funcionaran.
- **Referentes de uso, no de funciones:** 5 a 8 sistemas con un flujo de orden sencillo que sirva a un taller pequeño; capturas con el navegador integrado **solo
  de páginas públicas y demos**, sin crear cuentas, sin escribir nada. No repitas el benchmark de PLM/ERP.
- Ataca: H1, H4.
- Entrega: `08-piso-y-adopcion.md`: **lo que de verdad se anota** (lista priorizada), las **10 barreras de adopción** más repetidas y **5 principios de captura de datos
  en piso**, cada uno con su evidencia.

### Frente 9 · Síntesis y contraste (corre cuando terminan los frentes 0 a 8)

1. **`09-contraste-con-adr-0400.md`:** una fila por decisión de ADR-0400 (las 10 de Felipe y los supuestos del arquitecto) y por hipótesis H1 a H14:
   **confirma / matiza / contradice / sin evidencia**, con la evidencia (letra y fuente) al lado y la consecuencia **en una línea**. Las que contradicen suben al
   resumen. **Nada de esto es una orden de revertir:** es lo que Felipe necesita ver para decidir.
2. **`10-paquete-de-evidencia.md`:** lo que **solo Felipe o la encargada del Taller** pueden aportar, pensado para dárselo en cinco minutos con el celular:
   fotos del cuaderno o la hoja de corte; **una orden real reciente contada de punta a punta con fechas** (de la compra de tela a la tienda); capturas de los
   chats con un servicio (con los datos tapados); un comprobante, una guía o un recibo de un servicio (tapado); la ficha técnica y el reporte de consumo de **un**
   modelo real; la lista de máquinas y de operarias **por función**; cómo calculan hoy el costo de una prenda; **una semana** de producción real; las tres últimas
   cosas que salieron mal. Cada pedido con «para qué sirve» y «cómo conseguirlo en cinco minutos».
3. **`11-banco-de-preguntas.md`:** **al menos 60 candidatas**, ordenadas por cuánto condicionan lo que se construye. Cada una con: `id` · tipo (**HECHO**: solo CAYLA
   sabe cómo es · **DECISIÓN**: preferencia de Felipe) · la pregunta en lenguaje de tienda (sin jerga ni siglas) · 2 a 4 opciones, cada una con **Ganas / Pagas** ·
   la **recomendada primero**, con la evidencia que la respalda · qué decide (qué parte del sistema cambia) · **bloqueante** sí/no · **REABRE** si contradice algo ya
   decidido. Desde ahí, **elige las 36** con este criterio: primero las bloqueantes; luego las de mayor impacto; **ninguna ya contestada** salvo que la evidencia
   nueva la reabra (y entonces va marcada); agrupadas en **6 bloques de 6** y empaquetables en **9 llamadas de 4**.
4. **`README.md`:** el informe para Felipe. **Primero, una página:** «lo que aprendimos» (10 puntos), «5 sorpresas», «5 cosas que no sabemos», «qué hay que
   pedirle» y «qué hallazgos contradicen lo decidido». Después, el índice de los demás archivos.

### Frente 10 · Escéptico (corre cuando termina el 9)

Toma las **12 afirmaciones más importantes** del informe y trata de refutarlas: busca la fuente que las contradiga, revisa que la letra de evidencia sea la que
corresponde, y marca las que se apoyan en una sola fuente C. Revisa que ninguna sección diseñe pantallas o tablas, que no haya datos reales de CAYLA, nombres ni
tarifas en lo versionado, y que ninguna pregunta del banco ya esté contestada sin marcarse REABRE. Devuelve la lista de correcciones **y las aplica** en los archivos.

## 7 · Formato de cada hallazgo (todos los frentes)

```
H-<frente>.<n> · <afirmación en una frase, sin jerga>
  Evidencia: A|B|C|D|E · <fuente: archivo:línea, URL o consulta SQL> · consultada <fecha>
  Confianza: alta | media | baja · Aplica a: taller de ~10 operarias | planta grande | ambos
  Lo contradiría: <qué dato o caso>
  Implicación: <una línea: qué decisión de ADR-0400 o qué hipótesis (H1…H14) toca>
```

## 8 · Cuándo está terminado

- Cada frente: **8 hallazgos o más con evidencia B o mejor**, al menos un contraejemplo, «Lo que no encontré» y sus preguntas para CAYLA.
- Todo `[externo, sin verificar]` de la investigación previa tiene ahora un estado: verificada, refutada o sigue sin verificar.
- Todo hecho tributario, laboral o fiscal tiene fuente primaria **o** va a la lista del contador. Ninguno se afirma de memoria.
- Las 14 hipótesis tienen veredicto o dicen por qué no se pudo.
- El banco trae 60 o más candidatas y las 36 elegidas cumplen el criterio de la sección 6, frente 9.
- El escéptico no deja **más de dos** afirmaciones del top 12 sin respaldo.
- **Un resumen de una página** que Felipe pueda leer en cinco minutos sin saber de textiles ni de software.

## 9 · Prohibido

Diseñar pantallas o tablas · proponer migraciones o RPC · estimar cuánto cuesta construir algo · escribir en la base · abrir PR o hacer commit · crear cuentas o llenar
formularios en sitios de terceros · descargar archivos · poner datos reales de CAYLA, nombres o tarifas en archivos versionados · afirmar de memoria un dato fiscal o
laboral · repetir el benchmark de PLM/ERP de 2026-10-13 · volver a preguntarle a Felipe lo que ya contestó · llamar «vales» a lo que sale y vuelve de un servicio ·
inventar un dato porque «es lo normal».

---

## 10 · Notas para quien lanza el prompt

- **Por qué 36 preguntas:** la ronda anterior (ADR-0400: 24 preguntas en tres tandas) salió de entrevistas y de un benchmark, sin observar el Taller. Esta ronda tiene
  que mezclar **preguntas de hecho** (cómo es el Taller, que solo Felipe sabe) con las de decisión; por eso el prompt las etiqueta y exige las bloqueantes primero.
- **Lo que Felipe ya demostró que prefiere** (no lo olvides al armar la ronda): decide **mirando**, no por descripción (por eso las láminas de ADR-0358); quiere
  la opción recomendada primero y con su razón; rechaza la jerga («¿qué diablos son los vales?»); y no quiere que le repitan lo que ya contestó.
- **Si se corre en dos olas** (para repartir el costo): ola 1 = Frentes 0, 1, 2, 3, 4; ola 2 = 5, 6, 7, 8 y luego 9 y 10. La síntesis siempre al final.
- **Si Felipe prefiere empezar de cero** y no tratar ADR-0400 como punto de partida, se quita la sección 5 y la 6 se queda igual; el frente 9 contrasta contra «lo que
  hoy hace el sistema» en lugar de contra las decisiones.
