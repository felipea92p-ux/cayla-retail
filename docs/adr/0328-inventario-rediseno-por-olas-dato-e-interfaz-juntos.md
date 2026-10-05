# ADR-0328 · Inventario: rediseño por olas, dato e interfaz juntos

- **Fecha:** 2026-10-04 · **Estado:** Aprobado por Felipe. Las decisiones salen de cuatro tandas de preguntas (2026-10-03 y 2026-10-04); la
  lista de actividades la aprobó con «Sí, empieza por la 1».
- **Pedido:** «rediseñamos, corregimos, mejoramos y hacemos formidable todo el módulo de inventario, sobre todo Existencias,
  Movimientos, Traslados, Conteo, Análisis. Frescura del piso también necesita lucir ultra cool, ayudar a la gestión comercial en cómo
  se renueva cada piso y cómo se entiende la rotación de piso».
- **Insumos:** los artefactos «Inventario contra los mejores» (comparación con Square, Shopify POS, Lightspeed, Loyverse, Sortly y
  grandes cadenas) y «Rápido por diseño» (medir → simplificar → acelerar); los análisis `/pantalla` del 2026-10-03
  (`docs/pantallas/inventario.md`, `inventario-bajar.md`, `inventario-movimientos.md`, `traslados.md`, `recibir.md`); y tres
  lecturas de solo lectura sobre el código y producción (2026-10-03 a las 21:29 y 23:40, y 2026-10-04).
- **Usa y complementa:** ADR-0329 (capacidad del piso y primer mix), ADR-0208 (Frescura), ADR-0270 (una sola cifra de stock),
  ADR-0306 (bajar, subir y ajustar son funciones de Existencias), ADR-0326 («Hoy»), ADR-0327 (Movimientos), ADR-0321 (Vender
  registra la bajada olvidada), ADR-0280 (acciones sin el combo Responsable), ADR-0282 (Conteo), ADR-0299 (Recibir), ADR-0242
  (Traslados conectado).
- **Investigación de respaldo:** `docs/investigacion/2026-10-04-mix-inicial-del-piso.md`.

## El problema, de lo simple a lo complejo

Si se sigue una prenda desde que llega hasta que envejece, cada paso es una pantalla de Inventario, y en cada una algo falla. Las cifras
son de producción, en solo lectura, del 2026-10-03:

1. **Llega** (Recibir y Traslados). Nunca llegó nada así: 0 compras, 0 producciones y 4 traslados, todos vacíos. El 100 % del stock
   entró por la carga inicial.
2. **Se guarda** (Existencias). El sistema dice que TRU tiene **138 prendas colgadas y 635 guardadas**; Felipe contó **600 a 750
   colgadas** el 2026-09-30, todo en percha. El alta trae marcado «almacén» (Felipe, 2026-09-28) y así se cargó casi todo.
3. **Se cuelga** (Bajar al piso). La regla «reponer con 4 o menos en el piso» marca **las 510 tallas** de TRU, porque ninguna
   tiene más de 4 colgadas: nunca puede decir «Mantener». La caja no deja vender una prenda que está colgada, porque el sistema la
   cree guardada (Felipe lo reportó el 2026-10-03; ADR-0321 lo parcha en Vender).
4. **Se vende.** En 14 días, AQP vendió 170 prendas y 169 salieron «sin registrar»; TRU, 67 de 98. Hay **236 por regularizar y 0
   regularizadas**. No descuentan stock y quedan con costo 0.
5. **Se mueve** (Movimientos). El libro cuadra con el stock. Pero «lo que perdimos» tiene tres definiciones (Finanzas, resumen y
   Movimientos) y una diferencia de traslado no deja rastro.
6. **Se cuenta** (Conteo). Quien cuenta aprueba su propia diferencia; 9 de 12 conteos cerrados no tienen nombre (las 4 acciones
   de inventario que ADR-0280 soltó del combo quedan sin persona desde una terminal). Del 1 al 3-oct se «contó» 37 veces desde
   Ajustar, sin «debe haber».
7. **Envejece** (Análisis y Frescura). Los motores son sólidos, pero ven un tercio de lo vendido en TRU y casi nada de AQP, y la
   misma pregunta —¿falta o sobra en el piso?— tiene **cinco reglas distintas**: piso ≤ 4 (`politica-operativa-inventario.ts:41`),
   0 en el piso y algo atrás (`inventario-reglas.ts:56`), 14 días de cobertura (`inventario-reglas.ts:155`), «estancada» a los 14
   días (`resumen-lectura.ts:40`) y la vara de Frescura con «callada» a los 30 días (`frescura-reglas.ts:66`).

Y Felipe agregó lo que más le duele: **«la interfaz está horrible y no estoy seguro si se comunica bien con los demás módulos y es
entendible para cualquier integrante»**.

En una frase: la estructura es sólida, pero el dato que le entra está mal y la interfaz no se explica sola. Rediseñar la fachada sin
arreglar el dato da pantallas lindas que mienten; arreglar el dato sin la fachada no le cambia el día a nadie. Por eso se hacen juntos.

## Una corrección

En la primera tanda se le dijo a Felipe que las ventas «sin registrar» no guardaban talla ni color. **Es falso:**
`prendas_por_regularizar.categoria_id`, `talla_id` y `color_codigo` son obligatorias (`20260923161700_prendas_por_regularizar.sql`).
Les falta solo el modelo exacto. Por eso la lectura comercial de Felipe se puede construir ya, con datos reales.

## Decisiones de Felipe

### El norte (2026-10-03)

| Tema | Decisión |
|---|---|
| Qué duele | Todo: cifras que no se creen, ventas que se escapan, nadie sabe qué hacer, el piso no se renueva; y sobre todo la interfaz. |
| Para quién | El encargado de sede, la asesora en el piso y la cuenta Almacén. Los líderes después. |
| Formidable | Cifras que dicen la verdad, nadie necesita capacitación y se ve espectacular. |
| Decisión comercial | Qué **categoría, talla y color** se vendieron rápido y hoy faltan. Los modelos van variando, así que la señal para el Taller es el atributo, no el modelo. |
| Orden | Dato e interfaz juntos, por olas. La ola 0 (datos) va antes del 15-oct. |
| Éxito | La prueba de 5 minutos (una integrante nueva hace 7 tareas sin ayuda), la cola sin registrar en 2 días o menos y el % vendido a precio completo. |
| Tiempo | Una hora al día por tienda, fuera de la hora punta. |
| Aparato | Celular en Bajar al piso y en Conteo; lo demás, primero escritorio. |
| Ritmo | Por partes, con cada parte mostrada funcionando antes de seguir (2026-10-04; reemplaza «todo junto en un mes»). |
| Dueño del piso | Un encargado por sede, que revisa una vez por semana que el piso del sistema sea el real. |
| Quién ve Análisis y Frescura | **Todas las cuentas**, incluidas Caja y Almacén: «ayudan a plantear estrategias de equipo sin importar el rango». En soles se ven los totales; el costo por prenda, solo el líder. Los módulos los marca Felipe en Roles y accesos (ADR-0161). |
| Conexiones | Primero con Vender y con Catálogo/Productos. |

### Existencias y Movimientos (2026-10-04)

| Tema | Decisión |
|---|---|
| Número grande | **Colgadas contra lo que cabe** («583 de 600»), con la marca «por cuadrar» mientras la sede no haya cuadrado su piso. |
| Portada | **Buscar + «Para hoy»** (hasta 3 frases con su cifra y su botón) y debajo el catálogo. La lista con avance vive dentro de Bajar al piso; el plano del piso llega como franja en la ola 2. |
| Cuadre de TRU | Arreglarlo una sola vez. Como hay **más de 200 prendas guardadas de verdad**, primero se escanea lo guardado y lo que nadie escaneó pasa a colgado (ver «Decisiones técnicas»). |
| Prenda en la mano | Si el sistema no deja bajarla, **se corrige y se cuelga en un paso**, y si la etiqueta no se lee se elige por nombre. |
| Dañadas | Un arreglo menor (un botón descosido) **se reporta y puede volver a la venta**; el daño mayor sigue con las tres salidas de ADR-0071. |
| Razones al quitar | **Razones de tienda:** No aparece, Se dañó, Error al cobrar, Uso interno, Otro con nota. |
| Quitar mucho | **El líder confirma** cuando se quitan más de 5 de una talla o se deja en 0 una talla que tenía 3 o más. |
| Sumar a mano | «Reposición» pasa a llamarse **«Encontré prendas»** y queda abierta, con motivo: «eso sí ocurre, y más cuando estamos recopilando los datos desde cero». |
| Por persona | Las correcciones **no se agrupan por persona por ahora** (se respeta ADR-0127). |
| Qué es perder | **Todo lo que salió sin venderse**: faltantes, dañadas que se botaron o donaron y lo que faltó en un traslado, contado aparte de lo que apareció; lo liquidado es venta. |
| Talla cruzada | El sistema sugiere «probable talla cruzada» y quien cierra el conteo lo confirma. |
| Dónde se ve | Pestaña **«Pérdidas»** en Movimientos. |
| Cuándo avisa | **Cuando se repite**: la misma prenda o la misma zona pierde dos veces en 30 días, o hay una resta grande sin nota. |

### El plan del piso (2026-10-04, detalle en ADR-0329)

- «Reponer» depende del espacio, del mix por categoría y de lo que se vende rápido: **dos relojes**. El mix decide el lugar y se
  mueve una vez al mes; la lista del día ordena por velocidad desde el primer día.
- **Mínimo por modelo colgado: 1 por talla y color, solo en las tallas centrales.** «Me basta con 1 por color porque mi tienda es
  pequeña».
- **Primer mix:** lo propone el sistema a partir de la industria y lo aprueba Felipe. Ritmo mensual con tope de ±3 puntos. Mix
  distinto por sede según el clima. Accesorios fuera del riel. Reserva para novedad según el rol. Jeans en 9–10 % durante 4 semanas.
- **Piso lleno: entra una, sale una.**
- **Contar AQP** una vez antes de confiar en sus 1.800.
- Bolsas de papel, cajas y sorpresas: **se crean como productos** (lo hace el equipo en el Catálogo).

### Traslados, Recibir y Conteo (2026-10-04, parcial)

| Tema | Decisión |
|---|---|
| Traslados | **Primero una caja real** del Taller a TRU con gente real; después se corrige donde se trabaron. |
| Pedidos de otra sede | Número en el menú desde que llega y **aviso a los líderes de las dos tiendas a las 48 h** sin respuesta. |
| Mandar lo colgado | **No en un paso: primero al almacén** (decisión de Felipe, distinta de la recomendada). |
| Desde Vender | La asesora **pide y aparta** la prenda de otra sede para el cliente que la espera. |
| Cada cuánto se cuenta | **Piso cada semana, almacén cada quince días.** El almacén se cuenta con la tienda abierta; el piso, **por categorías o lotes** a lo largo de la semana, sin cerrar la tienda. |
| Contar desde Ajustar | Ajustar abre **«Por prenda»** en Conteo: un solo camino, con «debe haber» y firma. |
| Primer conteo | **De arranque**: corrige el stock sin contar como merma ni entrar en la exactitud. |
| Firma | **El nombre se pide una vez por operación**, no en cada paso: «si ya se colocó un nombre en el manejo de una operación no creo necesario estar pidiéndolo varias veces». |
| Ventas sin registrar | Es **algo temporal de la adopción** («no podíamos dejar de vender y había prendas sin etiquetar»): limpieza de arranque, no una rutina permanente. Nadie regulariza su propia venta, salvo el líder. |
| Cierre de la carga inicial | **Fecha por sede y cierre automático**: TRU el 15-oct; AQP y LIM cuando terminen su carga, con un tope que fija Felipe. |

## Decisiones técnicas

**1. Un solo motor del piso.**
DECIDÍ: una función pura (`lib/piso-plan.ts`, con su prueba) sobre una lectura SQL de solo lectura por sede y temporada. Existencias,
Análisis, Frescura e Inicio leen la misma salida: meta por categoría, hueco, velocidad, mínimo y acción por talla.
DESCARTÉ: una regla por pantalla. Hoy son cinco y dan 510 de 510 tallas «reponer»; además, el Inicio dice «Sube» cuando en
Existencias «Subir» es del piso al almacén (`inicio-avisos.ts:271`).
SE ROMPE SI: una venta sin registrar se cuenta dos veces cuando se regulariza, una en la cola y otra como venta escaneada, y Polos
parece vender el doble esa semana. La cola cuenta solo mientras está pendiente, y una prueba lo vigila.

**2. Velocidad = ventas escaneadas + ventas anotadas a mano que siguen pendientes**, por categoría × talla × familia de color y por
sede. Cada cifra dice cuántas ventas la respaldan y cuántas son anotadas.
DESCARTÉ: contar solo las escaneadas (AQP quedaría ciega semanas: 1 de 141).
SE ROMPE SI: en la caja anotan una correa como «Collares»: la velocidad cae en la categoría equivocada. Por eso la categoría se
sugiere desde la descripción (decisión 6).

**3. El alta pregunta «¿colgada o guardada?» sin valor de fábrica.**
DESCARTÉ: dejar «almacén» marcado (así se desordenó TRU y AQP lo repetiría) o marcar «colgada» (lo guardado entraría mal).
SE ROMPE SI: alguien elige sin mirar para avanzar; por eso cada opción dice lo que cambia («la caja las puede cobrar desde ya» /
«para venderlas, primero hay que bajarlas al piso»). Se descartó mostrar «lo que elige la mayoría en esta tienda»: con el piso de TRU
sin cuadrar, la mayoría registrada es «almacén», justo el error. Construida en el PR #783.

**4. Cuadre del piso, una vez por sede:** se escanea lo que de verdad está guardado; lo que el sistema tiene en almacén y nadie
escaneó pasa al piso en un solo movimiento, y queda la fecha del cuadre de la sede. En producción, solo con el «dale» de Felipe.
DESCARTÉ: escanear el piso entero (600 a 750 prendas) y marcar todo colgado primero (obliga a subir más de 200 después).
SE ROMPE SI: hay prendas guardadas sin etiqueta, que no se pueden escanear y quedan como colgadas. Las cifras de Felipe lo sugieren:
600–750 colgadas más de 200 guardadas es más que las 773 que el sistema conoce. Esas se cargan antes.

**5. Puerta de confianza en «Para hoy».** Sin cuadre, «Por colgar» queda en pausa y la frase 1 es «Cuadra el piso». Si las ventas
sin registrar pendientes de la sede superan la venta de un día normal, la frase 1 pasa a ser «Confirma lo vendido».
DESCARTÉ: publicar «Por colgar» con el piso sin cuadrar (380 tallas que ya cuelgan).
SE ROMPE SI: el encargado ve «Cuadra el piso» tres días seguidos porque nadie lo hizo; la frase más útil se vuelve ruido. Por eso el
cuadre de TRU va antes del 15-oct.

**6. Categoría sugerida desde la descripción** en la venta sin registrar («Jean…» → Jeans), que la asesora confirma.
DESCARTÉ: dejar la categoría solo a mano (hay ventas «Jean…» guardadas como Pantalones, y el mix aprendería de eso).
SE ROMPE SI: la descripción engaña («jean» en «chaqueta jean»); por eso es sugerencia y no se aplica sola.

**7. El nombre se pide una vez por operación y lo heredan sus pasos.** Quien abrió o contó el conteo firma su cierre; quien empezó a
recibir el traslado firma al terminar.
DESCARTÉ: dejarlo como está (9 de 12 conteos sin dueño) y pedirlo en cada paso.
SE ROMPE SI: un conteo lo abre una persona y lo cierra otra en otro turno; en ese caso (otra persona, otro día) se vuelve a preguntar.

**8. Limpieza de arranque de las ventas sin registrar**, con la prenda candidata sugerida (en TRU, 35 de 67 tenían una prenda de la
misma categoría, talla y color en stock), después de que AQP etiquete y cargue.
DESCARTÉ: una tarea diaria fija para el almacén (carga permanente para algo de la adopción) y regularizar antes de cargar (la base
rechaza después la carga inicial de esa prenda, `carga_con_historia`).
SE ROMPE SI: siguen llegando prendas sin etiqueta después del cierre de la carga y la cola vuelve a crecer; si dos semanas después
sigue habiendo más de un día de venta esperando, se revisa.

**9. Al revisar un conteo, cada faltante se cruza con las ventas sin registrar de esa tienda** y se regulariza en el mismo cierre.
DESCARTÉ: no dejar cerrar con pendientes (TRU no cerraría ninguno) y un aviso que nadie lee.
SE ROMPE SI: la prenda que falta coincide con una venta sin registrar pero de verdad se perdió; por eso confirma una persona.

**10. «Aplicar todos completos» dice la verdad sobre sí mismo:** «12 contadas · 40 sin contar», y lo aplicado sin mirar no sube la
exactitud.
DESCARTÉ: quitar el atajo y dejarlo como hoy.
SE ROMPE SI: alguien lo usa en todo para terminar rápido; aparece «40 sin contar», que es justo lo que el líder necesita ver.

**11. La banda del día de Movimientos pasa a un tono claro que se pega arriba.** Es reversible en minutos.

**12. Mandar lo colgado a otra sede (Felipe eligió dos pasos):** cuando Frescura sugiere trasladar algo, la prenda entra a una lista
de «subidas para enviar» hasta que sale el traslado, para que el segundo paso no se olvide.

## Lo que no se volvió a preguntar (ya estaba decidido)

Conteo no es a ciegas (ADR-0282). «Hoy» tiene cuatro estados con las mismas palabras en toda la pantalla (ADR-0326). Bajar, subir y
ajustar son funciones de Existencias (ADR-0306). Análisis sugiere y nunca mueve stock (ADR-0121, ADR-0245). Una sola cifra de stock
(ADR-0270). El libro de movimientos no se borra (ADR-0042, ADR-0055). La caja nunca se frena (ADR-0321, D-40). Recibir es solo de
proveedores (ADR-0299). El despacho del Taller es un traslado (D-31). Lo de Frescura del 2026-09-24 al 2026-09-29: Edad del piso,
unidad modelo + color por sede, «Envejecida» = más lenta que su categoría en su sede, sin tope de novedad hasta medir la vuelta del
cliente, «Ya decidí» (ADR-0208). La capacidad en prendas, m² y 30 por m² (ADR-0329).

## Orden de construcción

Cada actividad es un corte que se puede ver funcionando, con su propio commit, y se publica cuando Felipe la aprueba. Las que
cambian la base se muestran antes de pegarlas en producción.

**Tramo 1A · Urgente, antes del 15-oct**
1. Dejar escrito lo decidido (este ADR, ADR-0329 y la investigación del mix).
2. El alta pregunta «¿colgada o guardada?» sin valor de fábrica.
3. Cuadrar el piso: escanear lo guardado y pasar el resto al piso en un movimiento; fecha de cuadre por sede.
4. Cierre automático de la carga inicial por sede; «Reposición» pasa a «Encontré prendas», con motivo.
5. Ventas sin registrar: categoría sugerida, nadie regulariza su propia venta salvo el líder, y limpieza de arranque con candidata.

**Tramo 1B · Existencias**

6. Capacidad de cada sede (m² × 30) y el número «colgadas de las que caben» con «por cuadrar».
7. Un solo motor del piso: «Por colgar» (1 por color, tallas centrales, primero lo vendido) y «se vendió rápido y falta».
8. Portada «Buscar + Para hoy».
9. «La tengo en la mano» en Bajar al piso.
10. Dañadas: reportar desde la ficha y «Se arregló».

**Tramo 1C · Lectura comercial**

11. Análisis «Se vendió rápido y falta» por categoría × talla × color, con «Pedir al Taller» y «Pedir a otra sede».
12. Plan del piso: mix por sede con candado, propuesta investigada que aprueba Felipe, ajuste con motivo, franja y «entra una, sale una».

**Tramo 1D · Control**

13. Ajustar con razones de tienda y confirmación del líder en lo grande.
14. Una sola definición de pérdida, pestaña «Pérdidas» y aviso cuando se repite.
15. Conteo I: firma una vez por operación, conteo de arranque y atajo honesto.
16. Conteo II: cruce con ventas sin registrar y talla cruzada al revisar, Ajustar abre «Por prenda», «Toca contar».
17. Traslados: «Te piden» con número y aviso a las 48 h, «Pedir y apartar» desde Vender, lista de «subidas para enviar».

**Tramo 2 · Después de la ronda 4:** Frescura como herramienta de renovación (cómo se renueva cada piso y cómo se entiende la
rotación), el resto de Análisis, y lo complejo de Traslados: diferencias resueltas en las dos tiendas, quién aprueba una pérdida, a
quién se carga la pérdida en el camino y cómo llega lo del Taller.

**Del equipo, sin código:** la primera caja real del Taller a TRU, contar el piso de AQP, etiquetar y cargar AQP antes de su cierre,
y crear las bolsas, cajas y sorpresas como productos.

## Lo que queda abierto

- **Ronda 4 (Análisis y Frescura).** Entre otras: el 2026-09-26 se decidió que la comparación entre sedes es del líder y que los
  equipos ven su propia evolución; el 2026-10-04 Felipe decidió que todos ven Análisis y Frescura. Falta saber si eso incluye la
  comparación entre sedes.
- **Traslados complejos** (diferencias, aprobación de pérdidas, pérdida en el camino, el Taller).
- **Contar AQP y LIM** para su capacidad.

## Cómo se verifica

Cada actividad trae su verificación (prueba, comando o pantalla en el navegador). El rediseño entero se mide con los tres números de
éxito de Felipe: la prueba de 5 minutos con una integrante de TRU antes y después, la cola sin registrar en 2 días o menos, y el %
vendido a precio completo por sede (ADR-0208).

## Actualización 2026-10-04 (noche) — la «limpieza de arranque» de la actividad 5 se construyó aparte (ADR-0334)

De la actividad 5 («Ventas sin registrar: categoría sugerida, nadie regulariza su propia venta salvo el líder, y limpieza de arranque con
candidata») se construyó **solo la tercera parte**, desde otra rama, el mismo día en que Felipe pidió «una opción de lo doy por hecho»:
ADR-0334. La decisión 8 se cumple así: las ventas con **una** sola prenda posible se identifican con la confirmación de un líder («Identificar con
sugerencias») y las demás se cierran sin prenda, en bloque, dentro de un plazo (15-oct) y con un motivo. La decisión 9 («al revisar un conteo, cada
faltante se cruza con las ventas sin registrar») **no cambia**: aplica a las pendientes; una venta cerrada ya no aparece en ese cruce.

Siguen pendientes de la actividad 5, y no se tocaron: la **categoría sugerida** desde la descripción y la regla **«nadie regulariza su propia
venta salvo el líder»** (hoy `regularizar_prenda` lo puede hacer quien opera la tienda). **Contrato para el motor del piso (decisión 1):** la
velocidad cuenta las ventas `pendiente` y las `cerrada_sin_prenda` (ninguna mueve stock, así que no se duplican).
