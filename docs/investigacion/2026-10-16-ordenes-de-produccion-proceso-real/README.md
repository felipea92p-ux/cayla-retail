# Cómo se produce de verdad una prenda en CAYLA: lo que encontramos

**Informe para Felipe · 2026-10-16 · rama `claude/production-orders-research-e19797` · solo lectura (sin commit, sin migraciones, sin tocar `apps/web`).**
Pidió: «hay que investigar bien en lugar de diseñar a ciegas». Esta carpeta es esa investigación; el prompt que la guió está en `../2026-10-16-ordenes-de-produccion-proceso-real-PROMPT.md`.

> **Estado de los frentes.** Los nueve frentes (0 a 8) entregaron su archivo; **ninguno quedó sin resultado.** Todos chocaron con el tope de 200 búsquedas web (compartido entre agentes) y varias fuentes no abrieron (se dice en cada archivo). El Frente 9 (este contraste) comprobó por su cuenta cuatro puntos clave. **El Frente 10 (escéptico) ya corrió** (2026-10-16, detalle en `12-escepticismo.md`): intentó refutar las 12 afirmaciones más pesadas abriendo las normas y las fuentes directamente y volviendo a consultar la base (solo `SELECT`); la cuota de búsquedas web ya estaba agotada, así que no buscó fuentes nuevas. Corrigió lo que no aguantaba; el resumen está al final de esta página.

---

## Una página para Felipe

*Escrita para alguien que no sabe de textiles ni de software. Los nombres de archivo van al final de cada punto.*

### Lo que aprendimos (10 puntos)

1. **Nadie ha visto el Taller por dentro.** En el sistema no hay ni una orden, y lo que «sabíamos» salió de entrevistas y de programas ajenos. Lo que sigue es lo mejor que dicen otros talleres peruanos, no una descripción de ustedes. (`00`)
2. **El camino cortar → coser → terminar aguanta.** Lo usan fábricas de 13 a 995 personas y el catálogo oficial del Ministerio de Educación. (`01`)
3. **Lo que cambia es lo de adentro.** «Habilitar» significa tres cosas distintas; la plancha también va a mitad de la costura; y alguien tiene que decidir si una prenda está buena o no. (`01`)
4. **Cuando mandas tela, piezas o prendas a un servicio, SUNAT pide un papel** (la guía de remisión) **que lo hace CAYLA, antes de que salga la mercadería.** Sin él pueden retenerla o multar el 15 % de su valor. No alcanza con anotar un número de texto. (`04`)
5. **Quién pone la tela cambia todo:** papeles, impuestos y quién paga si se daña. Hoy el sistema solo piensa en «la tela es de CAYLA». (`04`)
6. **«Se pierde menos de 3 %» mezcla tres cosas:** la tela que sobra del corte (de unos 20 a 28 % del área sin usar en un estudio de pantalones con CAD; 10 a 21 % en tres referencias peruanas débiles: una plancha de licra, el resumen de una tesis de abrigos y un promedio de segunda mano), las prendas que se pierden y las que se arreglan (entre 10 y 28 % en talleres peruanos de costura; las dos medidas más firmes, de un mismo taller, dan 27,6 y 20,4 %). (`03`, `05`, `07`)
7. **Pagar «por prenda» es lo que muestran las pocas fuentes entre una marca y un servicio** (hojas de precio y cotizaciones de talleres de costura de Arequipa, y fichas de bordado y estampado de Lima; no encontré servicios de Lima que cobren por kilo, docena u hora, ni tampoco que no lo hagan). A la gente del Taller, el sistema de personal la muestra pagada por tiempo, y la planilla bajó de 6 a 5 a 3 personas: no hay base para «10 operarias». (`05`, `08`)
8. **Cortar de más hasta 10 % es el techo de lo que se cuenta:** 2 a 5 % en exportación y 5 a 10 % en marcas pequeñas, todo de blogs del oficio (nivel C, ninguna fuente peruana, y para una marca con taller propio como CAYLA el 5 a 10 % es lo «típico» que dice la fuente más cercana); con lotes chicos una sola prenda de más ya pesa. (`03`, `07`)
9. **Nadie midió cuántos días pasan del corte a la tienda,** y ese número es el que más mueve qué modelos decir «produce ya» (de 13 a 51 modelos según sean 7 o 21 días; el 13 consta en la investigación versionada, el resto del recorrido solo en una nota de sesión que no está en el repo). (`06`)
10. **La orden nueva tiene un hueco:** si una fase termina con menos prendas de las que entraron (se dañó una, faltó tela), la pantalla no la deja terminar; y cancelar una orden devuelve al estante toda la tela anotada como usada, aunque ya esté cortada. (`07`)

### 5 sorpresas

1. Una fábrica de camisas manda el **100 %** a un servicio de **ojales y botones**, y esa ida y vuelta (un día de calendario, puesto como cifra fija en su tesis, no medido) pesa más en el reloj que toda la sala de corte (unos 100 minutos de trabajo). CAYLA no tiene ese servicio en su lista. (`01`)
2. El único taller de Lima descrito en las fuentes (un taller de servicio de 44 personas, cuatro entrevistas) lleva **un cuaderno** con cliente, fecha y total; el «papel que alcanza» no es por fase. (`02`, `08`)
3. El **mínimo** de un servicio (150 a 240 prendas) es varias veces lo que tiene en stock el mejor modelo propio (menos de 50). (`06`)
4. Si le **descuentas la tela a un servicio** en su factura, un artículo jurídico cuenta que el Tribunal Fiscal vio una **venta** de lo entregado en dos casos publicados; **eran de minería (explosivos y combustibles), no de tela**, y es la única fuente: para la tela es una analogía que debe confirmar el contador. (`04`)
5. Traslados mide **cuándo se confirmó** la caja, no cuándo llegó. (`06`)

### 5 cosas que no sabemos

1. **Cuántos días** pasan del corte a la tienda.
2. **Cuántas personas** hay en el Taller y **cómo se les paga.**
3. **Qué papel viaja hoy** con la mercadería.
4. **Cuánta tela se gasta de verdad,** frente al número del programa (Audaces).
5. **Cuántas de cada 100 prendas** se pierden y cuántas se arreglan.

### Qué hay que pedirle (a Felipe o a la encargada)

**Tres cosas, cinco minutos, desde el celular:** (1) la **última orden contada de punta a punta con fechas;** (2) una **foto de lo que anotaron esta semana;** (3) el **reporte de Audaces de un modelo.** Después, **una ronda de 36 preguntas en 9 llamadas de 4** (la primera tanda son las que bloquean la primera orden real). Todo está en `10-paquete-de-evidencia.md` y `11-banco-de-preguntas.md`.

### Qué hallazgos contradicen lo decidido

*Ninguno es una orden de revertir; es lo que necesitas ver para decidir.*
- **Contradice:** la guía como texto (A3 y d.4). El Frente 10 la comprobó en el texto del Reglamento y en el Informe 117-2003; sigue yendo al contador.
- **Se matiza (bajó de «contradice» tras el Frente 10):** «en Lima no hay norma sobre faltantes». El Código Civil trae reglas para la tela que el servicio inutiliza por negligencia, pero ninguna tolerancia de faltantes de prendas, y la fuente es un artículo jurídico, no el texto de la ley.
- **No tiene respaldo:** «con 10 operarias el papel alcanza»; «el 95 % trabaja por bultos»; «menos de 3 %»; «sin adelantos».
- **Se reabre con evidencia nueva (y te lo preguntamos):** una fase entera con un solo quién (d.3); «lo medido gana» desde la primera orden (d.6); el 10 % de corte de más (d.7); el costo de la prenda sin la gente del Taller (D-31); «Pasar al stock» solo al terminar todo.
- **Hueco del propio sistema:** fase que termina corta; cancelar con tela cortada; segundas sin lugar. (`09`)

---

## Cómo seguir (3 pasos)

1. **Lees esta página.** El detalle de cada veredicto está en `09-contraste-con-adr-0400.md` (59 filas: 24 decisiones, 21 supuestos y contratos, 14 hipótesis).
2. **Mandas el paquete** (`10`) o aceptas la visita de 30 minutos. Con eso se cierran varios HECHO sin gastar una llamada.
3. **Contestas la ronda de 36** (`11`, 9 llamadas de 4, las bloqueantes primero). Con tus respuestas se actualiza ADR-0400 o se escribe uno nuevo (con `pnpm reservar adr` antes). Recién ahí se construye (`/construir`). Esta investigación **no** construye ni propone pantallas.

## Qué contiene la carpeta

| Archivo | Qué es | Hallazgos | De ellos, con evidencia B o mejor |
|---|---|---|---|
| `00-arqueologia-interna.md` | Qué sabía ya el repo y qué dice la base (0 órdenes, 12 contradicciones internas) | mapa | — |
| `01-mapa-del-proceso.md` | El ciclo completo: 3 niveles de diagrama y tabla etapa × (entrada, salida, quién, papel, control, error, dato) | 17 | 16 |
| `02-peru-y-lima.md` | Cómo se hace en Lima y en Perú; 29 datos antiguos verificados | 19 | 16 |
| `02-glosario-de-campo.md` | Una fila por palabra: oficio, ERP, tienda, ¿confunde? | — | — |
| `03-tela-y-materiales.md` | Cómo se compra, mide y desvía la tela; 5 causas de desvío | 19 | 10 |
| `04-terceros-documentos-y-tributos.md` | Papeles, tributos y riesgos de mandar trabajo afuera; 26 preguntas para el contador | 21 | 17 |
| `05-costeo-y-metricas.md` | Cómo se costea; 8 métricas que valen la pena y 10 que no | 23 | 17 |
| `06-planificacion.md` | Del «hay que producir» a la orden y de la orden a la tienda | 24 | 16 |
| `07-excepciones.md` | 41 situaciones del camino infeliz, ordenadas por frecuencia × costo | 17 | 12 |
| `08-piso-y-adopcion.md` | Qué se anota de verdad, 10 barreras de adopción, 5 principios de captura | 21 | 17 |
| `09-contraste-con-adr-0400.md` | Cada decisión y cada hipótesis, con veredicto y evidencia | 11 | — |
| `10-paquete-de-evidencia.md` | Lo que solo Felipe o la encargada pueden aportar | — | — |
| `11-banco-de-preguntas.md` | 71 candidatas, las 36 elegidas, comprobación contra la ronda anterior | — | — |
| `12-escepticismo.md` | El escéptico: 12 afirmaciones atacadas (más 6), veredicto de cada una y las correcciones aplicadas | 18 revisadas | — |
| `13-respuestas-de-felipe.md` | La ronda de 36 ya contestada (10 llamadas, 35 del banco + 5 de seguimiento), llamada por llamada | — | — |
| `14-lo-que-cambia-en-adr-0400.md` | Decisión por decisión: qué se mantiene, qué se matiza y qué se reabre de ADR-0400 con sus respuestas | — | — |
| `16-como-aplicarlo-a-lo-ya-pegado.md` | El mapa por objeto (tabla, restricción, función, archivo de la web) de cada cambio, el orden «expandir → web → contraer» y qué lleva el OK aparte de Felipe | — | — |

*(ADR-0400 ya trae estos cambios en su «Actualización 2026-10-16 (k)».)*

Total de los frentes 1 a 8: 161 hallazgos, 121 con evidencia B o mejor (el Frente 10 bajó dos de B a C: el Código Civil leído a través de un artículo, y la cifra de una tesis cuya fuente es un gremio).

## Lo que el Frente 9 comprobó por su cuenta (2026-10-16)

- **Informe 117-2003 de SUNAT:** el dueño que entrega insumos para transformarlos y los recoge emite la guía remitente. **Confirmado.**
- **Detracción:** 10 % sobre S/ 700 para fabricación por encargo, sin incluir los casos en que solo se entregan avíos o diseños. **Confirmado.**
- **Base de producción (solo `SELECT`):** `producciones`, `produccion_fases`, `proveedores_produccion` e `insumos` con 0 filas; planilla del Taller de 6, 5 y 3 personas; `anular_produccion` devuelve la tela y `cerrar_produccion` rechaza el cierre con prendas afuera. **Confirmado.**
- **Los artículos 17, 18 y 21 del Reglamento de Comprobantes de Pago** no se pudieron releer en el Frente 9 (el PDF no abre en la herramienta de lectura); **el Frente 10 los releyó** convirtiendo el PDF a texto (ver más abajo).

## Lo que el Frente 10 (escéptico) comprobó y corrigió (2026-10-16)

Detalle y fuentes en `12-escepticismo.md`. **Ninguna de las 18 afirmaciones revisadas quedó refutada**, pero once afirmaciones o cifras se decían más fuerte que su respaldo (algunas del top 12, otras de afuera) y se corrigieron en los archivos.

- **Comprobado en el texto de la norma o en la base viva:** la guía de remisión antes de mover la mercadería (Reglamento de Comprobantes de Pago, arts. 17.1, 17.5 y 18.1, e Informe 117-2003); el comiso o la multa del 15 % con tope de 6 UIT (Código Tributario, Tabla I, n.º 8 y nota 7); la detracción de 10 % sobre S/ 700 y sus exclusiones; la boleta que no sustenta gasto; la planilla del Taller de 6, 5 y 3 personas; que cancelar devuelve la tela anotada como usada; que una fase del Taller que termina corta nunca queda «hecha»; que Traslados no tiene hora de llegada; que el modelo propio con más stock tiene 46 prendas.
- **Bajó de «contradice» a «matiza»:** «en Lima no hay norma sobre faltantes». El Código Civil cubre la tela que el servicio inutiliza, no una tolerancia de faltantes, y se leyó a través de un solo artículo.
- **Corregido:** el «8 %» inferior de las prendas que se arreglan (no tenía fuente; ahora 10 a 28 %); la merma de tela «medida en casos peruanos» (son tres referencias débiles); el Tribunal Fiscal «vio venta de tela» (eran casos de minería); el sobrecorte de 10 % «no lo típico»; la ida y vuelta del ojal y botón «más que toda la sala de corte» (una cifra fija de un día); la letra B del Código Civil y de una cifra del INEI procesada por un gremio (ahora C).
- **Un matiz que va al contador:** aunque la guía la emita el servicio, el Reglamento considera remitente al dueño de los bienes para las multas del art. 174 n.º 8 a 10.
- **Aún descansan en una sola fuente C o sin versionar:** el Código Civil vía un artículo, «el descuento se lee como venta», el 10 % como techo del sobrecorte, y la sensibilidad del plazo (13 a 51 modelos), que solo consta en una nota de sesión.
- **Reglas del brief:** no se diseñó nada; se generalizaron los conteos finos de planilla, se retiraron tres nombres de negocios, se corrigió una palabra vetada del vocabulario en el glosario, y se marcó P-36 como REABRE d.5 en parte (repetía lo decidido). La cuota de búsquedas web estaba agotada: el Frente 10 no pudo buscar fuentes nuevas, solo abrir las citadas.

## Reglas que se cumplieron

- Español, vocabulario del repo (colaborador, líder de equipo, sede, cliente); sin «vales».
- Nada de nombres de proveedores u operarias, RUC, tarifas ni montos reales de CAYLA en lo versionado; solo conteos y rangos. Las cifras tributarias (10 %, S/ 700, 15 %, 50 %) son de las normas, no de CAYLA.
- Cada hallazgo lleva letra de evidencia (A a E), fuente y fecha; cada frente tiene al menos un contraejemplo.
- Nada de diseñar pantallas, tablas, migraciones ni estimaciones de construcción.

## Lo que no encontré

- Ninguna cifra real de CAYLA (costo, plazo, desvío, segundas): `producciones` tiene 0 filas.
- Un taller descrito de 5 personas, plazos en días por etapa, tarifas de corte y lavandería, adelantos con talleres peruanos.
- El reporte real de Audaces y qué se anota hoy en el Taller.
- Varias fuentes que no abrieron: CAF/ADEX, el manual de SENATI, la tesis UNMSM de talleres externos, la ficha de un taller de Gamarra (410) y el texto primario del Código Civil.

## Preguntas que solo CAYLA puede contestar

Todas están en `11-banco-de-preguntas.md` (71 candidatas, 36 elegidas). Las seis primeras bloquean la primera orden real: quién pone la tela, qué papel acompaña lo que sale, si el Taller está declarado ante SUNAT, quién puede dar por terminada una fase corta, qué hacer con la tela cortada al cancelar y qué pasa con las segundas.

## Fuentes

Cada archivo `01` a `09` tiene su propia sección «Fuentes» con nivel, URL, fecha de consulta (2026-10-16) y estado del enlace. Las más pesadas, en `09-contraste-con-adr-0400.md`. Documentos del repo usados: ADR-0400 y la investigación del 2026-10-13 (rama `claude/production-module-redesign-136cca`, leídos con `git show`), `docs/datos/15-COMO-OPERA-CAYLA.md` §7 y el prompt de esta investigación.
