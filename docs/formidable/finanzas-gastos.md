# Formidable · Finanzas ▸ Gastos — la fila de un gasto del viaje   (`/finanzas/gastos`)

## La lista por día (L1) · 2026-10-30, noche — medida, con prueba ciega y escéptico

- **Fecha / SHA:** 2026-10-30 · `41596987f` (rama `claude/gastos-extracto-por-dia`)   · **Dispositivo que manda:** escritorio (Mac mini); 1024 y 375 px se adaptan
- **Pregunta que debería resolver (1 frase):** ¿qué se gastó, cuándo y hay algo que pagar o arreglar?   · **Protagonista:** el dinero
- **Veredicto en una línea:** «Se lee como el extracto del banco y la ciega contestó las tres preguntas, pero **la factura vencida quedó escondida
  tras "Ver los días de antes"** (no lo logró al primer intento) y **el porqué de cada marca solo se ve con el mouse** (ley 6 en 4).»
- **Alcance:** solo la lista de la pestaña «Gastos» (`ExtractoGastos`, ADR-0493 act. (d)). El resto de la pantalla no se recalificó.
- **Entorno:** base local con 13 gastos y 2 facturas a crédito de ejemplo (foto `formidable-lista`, borrados por id al final), «hoy» = 30 oct.
  `medir-oficio.js` acotado a la tarjeta de la lista, en un Chromium sin pantalla. 2 agentes de 4: un ciego (Opus, 7 capturas de 1440 px) y un escéptico (Sonnet).
- **Arreglado durante el análisis** (defectos de lo construido hoy, no propuestas): con un filtro de categoría, sede o comprobante (lo que ponen
  «Ver cuáles» y «Ver en la tabla») la lista seguía escondiendo días tras el botón; ahora con cualquier filtro se ven todos. El ADR-0493 (d)
  decía que el porqué de la marca estaba en la hoja del gasto, y no está: corregido. Y `--k-dia`, que nadie leía, se fue (`41596987f`).

### Notas (0–10)
| Eje | Nota | Evidencia |
|---|---|---|
| 1 Sin manual | 6 | [Observado] ciega: las tres respuestas bien, **no al primer intento** (la a) cambió al abrir los días de antes), 13 pasos, 11 dudas, 1 casi error · real: sin probar |
| 2 Una pregunta, una respuesta | 5 | [Medido] arriba «21 sin comprobante» en ámbar y la lista marca 1 (H3); el pie dice «24 gastos» y la cifra «23» (el anulado); la lista dice «Vencida · 27 oct» y la hoja, «Por pagar» (H2) · [Observado] dudas 4, 5 y 6 |
| 3 Simplicidad profunda | 7 | [Observado] las marcas se leyeron como veredicto («es lo más urgente»); el «3» del grupo sin unidad y «4 gastos» con 2 filas a la vista confundieron hasta abrir (H4) |
| 4 Lenguaje de tienda | 8 | [Observado] en la lista, cero palabras no entendidas («Hoy», «Solo anulados», «Vencida», «A crédito» se entendieron); las que no, son de fuera de la lista («Te toca», «cuenta 634», «IGV descontable», «Dynamic») |
| 5 Contenido primero | 7 | [Medido] los montos y el total del día mandan en cada fila; la lista empieza a 1 904 px a 1440 (2 260 a 1024, 2 785 a 375): es el orden de la página, no de la lista |
| 6 Lo difícil, a un toque | 4 | [Medido] el porqué de la marca («con factura recuperarías S/ 68.64», «faltan S/ 708: venció el 27 oct») solo vive en el `title` y en texto para lector: con el dedo no existe, y la hoja del gasto no lo dice · [Observado] duda 7 |
| 7 Perdonar antes que preguntar | — | la lista solo lee; abrir y cerrar un grupo o los días de antes se deshace con el mismo toque |
| 8 Quitar antes de agregar | 7 | [Medido] de 8 columnas a 3 o 4; la cuenta contable salió de la fila. Queda el pie «24 gastos», que repite la cifra de arriba con otro número |
| 9 De punta a punta | 7 | [Medido] vacío, búsqueda, filtros (arreglado), una sede, 1440/1024/375, claro y oscuro, teclado (Tab llega a cada fila con anillo de 2 px; Enter abre la hoja o el grupo). La vencida de un mes anterior nunca sale en la lista del mes (es la lista del mes; la tarjeta sí la cuenta) |
| **Leyes (promedio)** | **6,4** | **la ley 6 en 4**: el porqué de cada marca no está a un toque |
| **Oficio visual** | **8** | [Medido] 6 de 8 pasan; las dos que fallan son piezas del sistema: el texto de 11 px del separador del día (`<SeparadorDia>`) y 10,5 px del globito (`<Globito>`), y la fila de herramientas (buscador de 38 px junto a píldoras de 32). Montos y totales del día en el mismo borde derecho (1 116 px), contraste sin fallas, sin desborde |

### Medido
| Comprobación | 1440 × 900 | 1024 × 768 | 375 × 812 |
|---|---|---|---|
| Dónde empieza la lista | 1 904 px | 2 262 px | 2 785 px |
| Separador del día | un renglón (35 px) | un renglón | un renglón, sin el mes |
| Borde derecho de montos y totales del día | el mismo | el mismo | el mismo |
| Blancos bajo el mínimo (24 / 44 px) | 0 | 0 | 3, todos piezas del sistema (buscador 38 px, píldoras 32 px) |
| Texto bajo 4,5 : 1 | ninguno | ninguno | ninguno |
| Rojo a la vista | 1 (el punto de «Hoy»); los otros 2 que contó el medidor son del buscador mientras busca | igual | igual |
| Falsos del medidor (refutados) | «bordes casi alineados»: son bordes IZQUIERDOS de cifras alineadas a la derecha; «4 radios»: 999 px y 3,3e7 px son la misma píldora; un `sr-only` contado como texto chico | | |

### Los 3 cambios de mayor impacto (esperan el OK de Felipe; nada se tocó)
1. **Lo vencido no se esconde tras «Ver los días de antes».** Antes: el botón dice «Ver los 6 días de antes» y nada más; la única factura
   vencida (S/ 708, en rojo) estaba ahí, y la tarjeta «Por pagar de gastos» dice «2 con factura a crédito» sin decir que una ya venció.
   Después: el botón lleva lo que esconde que pide algo, con la misma marca de la lista («Ver los 6 días de antes» + «1 vencida» en rojo,
   «1 vence esta semana» en ámbar), y la bajada de la tarjeta suma «· 1 ya venció». Ley 2 y 9. Se verifica con la misma ciega: la a) al primer
   intento. Esfuerzo S. Presentación (no cambia qué se debe ni cuándo vence).
2. **La hoja del gasto dice lo mismo que la lista, y por qué.** Antes: lista «Vencida · 27 oct», hoja «Estado: Por pagar» y «A crédito, vence
   27 oct» (presente sobre una fecha pasada); «recuperarías S/ 68.64 de IGV» solo con el mouse. Después: la hoja abre con un `<Aviso>` con la marca
   y su porqué, el mismo texto de la lista (`marcaDelGasto`): rojo para la vencida («Venció el 27 oct: faltan S/ 708.00. Se paga desde Compras ▸
   Por pagar», con el enlace si la cuenta ve Compras), ámbar para lo grande sin comprobante; y «Pago» dice «venció el 27 oct». Ley 6 y 4. Se
   verifica: con el dedo (375 px) se llega al porqué en un toque. Esfuerzo S. Presentación.
3. **Una sola cuenta de «sin comprobante».** Antes: el chip de arriba (ámbar), la bandeja y «Te toca» dicen «21 sin comprobante: sin comprobante
   no recuperas su IGV» (también del mototaxi de S/ 6), y la lista marca 1, la de S/ 300 o más. Después: lo que avisa en ámbar cuenta lo mismo que
   la lista («1 gasto de S/ 300 o más sin comprobante»); los otros 20 siguen en el filtro, sin alarma. Ley 2. Se verifica: el número del chip, la
   bandeja y la lista coinciden en las mismas capturas. Esfuerzo M (la bandeja y «Te toca» cuentan con el panel de la base). **Regla de dinero
   (cómo se avisa del IGV): OK obligatorio de Felipe.**

### Lo que sobra (ley 8)
- El pie «24 gastos · los anulados se quedan a la vista»: repite la cifra de arriba con otro número; proponer «23 gastos y 1 anulado» o quitarlo.

### Lo que no pediste y importa más
- Una factura vencida de un mes anterior no aparece nunca en la lista del mes (es lista de gastos, no de deudas): solo la tarjeta y «Te toca»
  la cuentan. Con el cambio 1, la tarjeta diría «ya venció»; si la lista debe mostrar deudas de otros meses es una decisión de Felipe.

### Lista aparte (no se ejecuta)
1. El «3» del grupo sin unidad: «3 veces» en la línea de abajo (H4, S).
2. Con un grupo abierto y la página bajada, una fila de adentro sola bajo el día se lee como un gasto aparte (H5, baja).
3. La planilla de movilidad: el panel la cuenta como «sin comprobante» y el filtro y la marca no (D2, de antes; casi nunca llega a S/ 300).
4. De la pantalla, no de la lista: «Te toca» tiene la vencida pero está a un clic; la barra flotante tapa la columna de sede al pasar (H6, refutado como defecto de la lista); `pnpm focus` sigue con la hoja «Anular» sin guía de foco y `pnpm sugerir` con dos ejemplos escritos a mano (deuda de `GastosPanel.tsx`); 3 lecturas en cadena y sin streaming (`scripts/rendimiento/ui.mjs`).

### Prueba ciega (Opus, 7 capturas de 1440 px; no navegó)
| Medida | Resultado |
|---|---|
| Lectura de 5 s | ✓ «la pantalla donde se apunta lo que la tienda gasta… la lista va día por día, como un estado de cuenta del banco» |
| Primer intento | ✗ la a) quedó incompleta hasta abrir «Ver los 6 días de antes» |
| Pasos | 13 |
| Dudas | 11: «4 gastos» con 2 filas; «Mototaxi 3»; «Tienda Lima» y «Todas»; «21 sin comprobante» y 1 marca; «23» y «24 gastos»; «Vencida» y «Por pagar»; ¿«Sin comprobante» se arregla?; «Egresos por clasificar» y «Salidas de caja»; «Solo anulados»; un mototaxi por transferencia (datos de ejemplo); la fila suelta del grupo |
| Palabras no entendidas | ninguna de la lista; de fuera: «Te toca», «cuenta 634», «IGV descontable», «Empresa» como sede, «Fijos del mes», «Activos fijos», «Egresos de caja por clasificar», «Dynamic», atajos G/F/E/A |
| Errores | 1 casi: leyó la fila «Mototaxi S/ 8.00» de un grupo abierto como otro gasto |

### Veredictos del escéptico
- H1 (vencida escondida): **MATIZADO**, lo principal confirmado y estructural (una vencida es vieja por definición); «Te toca» sí la dice, a un clic.
- H2 (hoja distinta, porqué solo con mouse): **CONFIRMADO**; además, el ADR decía lo contrario (corregido).
- H3 (21 contra 1; 24 contra 23): **CONFIRMADO / MATIZADO** (el pie ya dice que los anulados se quedan).
- H4 («3» sin unidad, «4 gastos»): **CONFIRMADO**. H5 (fila suelta): **MATIZADO**, baja. H6 (barra flotante): **REFUTADO** como defecto de la lista.
- Nuevos: D1 (los filtros escondían días) **arreglado**; D2 (planilla de movilidad) a la lista aparte.

### Antes de decir «listo»
- Concurrencia: no aplica (la lista solo lee; la hoja del gasto y «Anular» no cambiaron).
- Caída externa: si la lectura de la lista falla, la pantalla ya dice «Una parte de Gastos no respondió» (de antes); la lista sale vacía con su `<Vacio>`.
- Persona sin contexto: la ciega lo respondió (arriba); colaboradora real: sin probar.

### Historial
| Fecha | SHA | Leyes | Oficio | Cambios cerrados |
|---|---|---|---|---|
| 2026-10-30 | `41596987f` | 6,4 (ley 6 en 4) | 8 | D1 arreglado; los 3 cambios esperan OK |

## Después de los 3 cambios (OK de Felipe) · 2026-10-30, noche — medido otra vez y segunda prueba ciega

- **SHA:** `cc1a10a64` + el nombre único de los fijos   · **Qué cambió:** los 3 cambios de la pasada de abajo, tal cual se propusieron (ADR-0493,
  actualización (c)). Y uno que pidió la segunda ciega: el «si sigue así», la leyenda y el día abierto decían «fijos sin registrar» y «fijo que
  falta pagar», y el chip de la cifra «fijos por confirmar»; ahora todos dicen **«por confirmar»**.
- **Entorno:** el mismo (159 gastos de ejemplo, «hoy» = 30 de octubre, foto restaurada al final). Ojo: a fin de mes, «a esta altura» casi no se
  distingue del mes entero; el caso del 10 de octubre lo cubren las pruebas puras (`gastos-hilos-reglas.test.ts`: el chip, la píldora y la frase
  dicen «subió», como «Cuándo»).

### Medido (antes → después)
| Comprobación | Antes | Después |
|---|---|---|
| Dónde empieza «Cuándo», 1440 × 900 | 1 293 px | **1 100 px** |
| Dónde empieza «Cuándo», 375 × 812 | 1 730 px | **1 476 px** |
| Dónde empieza la lista, 1440 × 900 | 2 091 px | 1 940 px |
| A 1024 × 768 | «En qué se va» en 624 px | en 699 px: el chip «▲ 6 % vs septiembre a esta altura» pasa a una segunda fila (+30 px) y la frase a dos líneas; «Cuándo» igual sube (1 378 → 1 259 px) |
| La frase de los hilos a 1024 | — | se partía dejando «%)» solo abajo: **arreglado** con un espacio duro entre el número y su «%» |
| Contraste, desborde | sin fallas | sin fallas (claro y oscuro: `tema:auditar`, 0 hallazgos solo en oscuro) |
| Oficio de las dos secciones | 5 de 8 (piezas del sistema) | igual |

### Notas (0–10) después
| Eje | Antes | Ahora | Evidencia |
|---|---|---|---|
| 1 Sin manual | 7 | 8 | [Observado] segunda ciega: las cuatro bien al primer intento, en 12 pasos (antes 14); el cierre, «seguridad alta», explicado con sus partes (antes «media a baja») · real: sin probar (tope 8) |
| 2 Una pregunta, una respuesta | 5 | 8 | [Medido] el chip, las píldoras, la rayita y las dos frases comparan igual (pruebas del 10 de octubre); [Observado] usó el chip y «Cuándo» sin contradecirse |
| 3 Simplicidad profunda | 7 | 8 | [Observado] «Es S/ 10,967 más un día normal (S/ 186) por el día que falta, más S/ 210 de 2 fijos»; queda «¿cómo sale un día normal?» |
| 4 Lenguaje de tienda | 7 | 8 | [Observado] «a esta altura» se entendió («hasta el mismo día del mes»); los tres nombres de los fijos, ya uno; «Empresa» como sede sigue (de antes) |
| 5 Contenido primero | 6 | 7 | [Medido] «Cuándo» 193 px más arriba a 1440 y 254 a 375; a 1440 sigue bajo el pliegue (la cabecera ocupa 576 px) |
| 6 Lo difícil, a un toque | 7 | 7 | sin cambio: el día y la categoría a un toque; cómo se calcula un día normal no está |
| 7 Perdonar antes que preguntar | — | — | solo lee |
| 8 Quitar antes de agregar | 6 | 7 | [Medido] el chip ya no contradice; queda el doble mensaje del mes vacío en «En qué se va» |
| 9 De punta a punta | 8 | 8 | [Medido] 375, 1024, oscuro, mes cerrado, mes vacío |
| **Leyes (promedio)** | 6,6 | **7,6** | ninguna ley bajo 7 |
| **Oficio visual** | 7 | **7** | [Medido] igual: lo que falla son piezas del sistema |

### Segunda prueba ciega (Opus, sobre 5 capturas nuevas de 1440 px; la de Sonnet la cortó un filtro de seguridad de la API a mitad del informe y se relanzó una vez con otro modelo, como pide `prueba-ciega.md`)
| Medida | Resultado | Pasa |
|---|---|---|
| Lectura de 5 s | «la pantalla de "Gastos"… cuánto se gastó en el mes (S/ 10,967) y en qué se va, empezando por Alquileres» | sí |
| Primer intento | las cuatro bien: más (S/ 599, ▲ 6 %), Alquileres (S/ 5,400), el lunes 5 con sus 4 gastos (S/ 3,095, sumó), ≈ S/ 11,362 con sus partes | sí |
| Pasos | 12 y uno que tocaría (antes 14) | casi |
| Dudas | 14; de lo nuevo: «un día normal» (¿cómo sale?) y un sol de redondeo; los tres nombres de los fijos (**arreglado**); dos vienen de cómo se sacaron las capturas (el día 5 ya abierto en la captura 3 y un globito del día 7 donde estaba el mouse), no de la pantalla | no |
| Palabras no entendidas | 9, casi todas de antes («Por pagar», «Te toca», «Activos fijos», «Empresa»…); de lo nuevo, «un día normal» y «Llevabas» (las interpretó bien) | no |
| Errores evitables | 0 en las respuestas; 4 casi errores (un «▲ 6 %» que coincide en el total y en Suministros, «TIENDA LIMA» arriba con «Todas» elegido, el globito de la captura, la nota del 3 al 5) | casi |

**Refutado al revisarlo:** «las barritas al lado de cada gasto salen vacías» en el desglose. Medido en vivo: se llenan (100 %, 87,5 %, 37,5 %); la
captura se sacó 1 s después del clic, con la animación de llenado aún corriendo.

### Lo que queda (no se ejecuta sin Felipe)
- «¿Cómo sale un día normal?»: el porqué no está a un toque (un globito sobre el «≈» o la frase: «lo de un día sin fijos ni gastos grandes»).
- «TIENDA LIMA» arriba a la derecha con «Ver sede · Todas» elegido: la ciega dudó si veía solo Lima (es la sede de la cuenta; viene del marco).
- El desglose no tiene cómo cerrarse a la vista (se cierra tocando la fila otra vez).
- La lista aparte de la pasada de abajo (N2, el globito de `<Linea>`, el dock que tapa datos).

### Historial
| Fecha | SHA | Leyes | Oficio | Cambios cerrados |
|---|---|---|---|---|
| 2026-10-30 (noche) | `cc1a10a64` + nombre de los fijos | 7,6 (ley 1: 8; ninguna bajo 7) | 7 | los 3 cambios con el OK de Felipe; «%)» huérfano a 1024; un solo nombre para los fijos |

---

## «En qué se va» (hilos) y «Cuándo» (ritmo del mes) · 2026-10-30 — medido, con prueba ciega

- **Fecha / SHA:** 2026-10-30 · `33a3bef5b` (rama `claude/setup-local-finance-module-6e4e54`)   · **Dispositivo que manda:** escritorio (Mac mini); 375 px se adapta
- **Pregunta que deberían resolver (1 frase):** ¿en qué se nos va la plata este mes y vamos más rápido o más lento que el mes pasado?   · **Protagonista:** el dinero
- **Veredicto en una línea:** «Se entiende sin ayuda: la prueba ciega contestó las cuatro preguntas bien al primer intento. Pero a mitad de mes la pantalla compara contra septiembre de dos maneras que se contradicen, y «Cuándo» queda bajo el pliegue.»
- **Alcance:** solo las dos secciones rehechas hoy (ADR-0493, actualizaciones del 2026-10-30). El resto de la pantalla no se recalificó: sigue lo de las pasadas de abajo.
- **Entorno:** base local con 159 gastos y 5 fijos de ejemplo en septiembre y octubre (foto `ritmo-cuando`, restaurada al final), «hoy» = 30 de octubre. Medido con `medir-oficio.js` en un Chromium sin pantalla (el panel del navegador estaba oculto y React no revela su contenido sin cuadros de animación), con dos ajustes para un gráfico: mide dentro de la sección y toma el `fill` como color de un texto SVG. 2 agentes de 4: un ciego (sobre 5 capturas de 1440 px) y un escéptico.
- **Arreglado durante el análisis** (eran defectos de lo construido hoy, no propuestas):
  - un mes sin gastos dibujaba en «Cuándo» una línea en cero con «S/ 0» y un eje «0, 1, 1»; ahora dice «Sin gastos en agosto todavía.» (`8d93946eb`);
  - al tocar o hacer clic en el gráfico, el foco ponía el globito en «hoy» antes de que el clic eligiera su día, y en el teléfono quedaba pegado
    sobre la cifra y la nota (lo encontró el escéptico); ahora solo el teclado lo pone al entrar. Medido: tras tocar la nota a 375 no queda globito,
    y a 1440 muestra el día que está bajo el mouse (`33a3bef5b`);
  - las lecturas para comparar (los meses de antes, el mes anterior, el inicio de Finanzas) esperaban a las del mes: van en la misma vuelta, de 4
    esperas seguidas a 3 (`scripts/rendimiento/ui.mjs`; `33a3bef5b`).

### Notas (0–10)
| Eje | Nota | Evidencia |
|---|---|---|
| 1 Sin manual | 7 | [Observado] ciega: las cuatro respuestas bien al primer intento, con 14 pasos, 10 dudas y 4 casi errores (abajo) · real: sin probar (tope 8) |
| 2 Una pregunta, una respuesta | 5 | [Medido] tres comparaciones con septiembre en la misma pantalla (el chip de la cifra, la frase de «En qué se va» y la de «Cuándo») que a mitad de mes se contradicen: el 10 de octubre el chip diría «▼ 28 %» y «Cuándo», «S/ 157 menos a esta altura» (H1) · [Observado] duda 3 |
| 3 Simplicidad profunda | 7 | [Observado] «a esta altura» y «si sigue así» se entendieron solas; no supo si el «si sigue así» cuenta los fijos (duda 8) y leyó «Alquileres · 3 al 5 oct» como un día (casi error 1) |
| 4 Lenguaje de tienda | 7 | [Observado] las palabras nuevas se entendieron; «0 % de lo gastado» para S/ 53 (H3); «Empresa» como sede, no (de antes) |
| 5 Contenido primero | 6 | [Medido] «Cuándo» empieza a 1 293 px a 1440 × 900 y a 1 730 px a 375 · [Observado] respondió la primera pregunta a los 5 s con el chip de arriba |
| 6 Lo difícil, a un toque | 7 | [Observado] el día y la categoría, a un toque (capturas 4 y 5); cómo se calcula el «si sigue así» no está en ningún lado |
| 7 Perdonar antes que preguntar | — | solo lee: elegir un día o una categoría se deshace tocándolo otra vez |
| 8 Quitar antes de agregar | 6 | [Medido] el chip «vs septiembre» repite la comparación de «Cuándo» (y la contradice a mitad de mes); en un mes vacío, «En qué se va» dice dos veces que no hay gastos |
| 9 De punta a punta | 8 | [Medido] mes vacío (arreglado), mes cerrado, una sede, 375, oscuro, lectura fallida con su aviso; el globito pegado (arreglado); queda N2 |
| **Leyes (promedio)** | **6,6** | **la ley 2 en 5**: la pantalla compara contra el mes anterior de dos maneras |
| **Oficio visual** | **7** | [Medido] en las dos secciones: contraste sin fallas, desborde 0, el gráfico se recorre con el teclado (deslizador con su etiqueta; las notas son botones). 5 de 8 comprobaciones fallan, todas en piezas del sistema (abajo, H5) |

### Medido (Chromium sin pantalla, las dos secciones)
| Comprobación | 1440 × 900 | 1024 × 768 | 375 × 812 |
|---|---|---|---|
| Dónde empieza «En qué se va» / «Cuándo» / la lista | 576 / 1 293 / 2 091 px | 624 / 1 378 / 2 303 px | 746 / 1 730 / 3 011 px |
| Con 6 categorías y «Ver 4 más», «Cuándo» empezaría en | ~1 086 px | — | ~1 443 px |
| Desborde de la página | 0 | 0 | 0 |
| Texto bajo 4,5 : 1 | ninguno | ninguno | ninguno |
| Comprobaciones de oficio que fallan (de 8) | 5 (6 con un día abierto) | 5 | 4 (6 con un día abierto) |
| Lo que falla | tramos de la barra de 12 px de alto; «Ver los N en la tabla» de 14 px; ejes de la línea a 10,5 px; 5 a 7 radios; un borde SVG a 1 px | igual | lo mismo; los nombres de categoría son botones de 36 px (bajo 44 con dedo) |

### Los 3 cambios de mayor impacto (esperan el OK de Felipe; nada se tocó)
1. **En el mes en curso, todo compara a la misma altura.** Antes: el chip de la cifra grande, la píldora ▲/▼ de cada categoría, su rayita y la frase de
   «En qué se va» comparan lo gastado hasta hoy contra el mes anterior **entero**; solo «Cuándo» compara a la misma altura. Con los datos de ejemplo,
   el 10 de octubre: chip «▼ 28 % vs septiembre» contra «S/ 157 menos que septiembre a esta altura», y «Transporte ▼ 51 %» cuando a la misma altura
   subió 75 %. → Después: en el mes en curso, todos contra el mes anterior hasta el mismo día (la lista de ese mes ya se lee hoy); en un mes cerrado,
   el mes entero, como ahora; el último punto de la línea de meses dice que es «a hoy». Leyes 2 y 3. Se verifica con pruebas puras del caso del 10 de
   octubre (chip, píldora y frase dicen lo mismo) y otra ciega. Esfuerzo M. **Decide Felipe:** es cómo se dice el dinero.
2. **El «si sigue así» dice de qué está hecho.** Antes: «≈ 11.4 mil · si sigue así»; la ciega no supo si contaba los fijos que faltan, y debajo dice
   «Sin contar 2 fijos por confirmar (S/ 210)». → Después: la frase de abajo del gráfico, a todo ancho (hoy solo en el angosto): «Si sigue así, cierras
   octubre en ≈ S/ 11,362: un día normal de S/ 185 por cada día que falta, más S/ 210 de 2 fijos sin registrar.» Leyes 3 y 6. Se verifica con la
   ciega (que no dude) y una prueba pura del texto. Esfuerzo S. Decide Felipe (texto de dinero).
3. **«En qué se va», más corta y con su frase clara.** Antes: las 10 categorías empujan «Cuándo» a 1 293 px; la frase dice «lo que más subió fue
   transporte (+20 %)» con «Atención al personal ▲ 75 %» a la vista (la frase solo cuenta lo que pesa 4 % o más, sin decirlo); «0 % de lo gastado».
   → Después: las 6 más grandes y «Ver 4 más» (como el desglose; «Cuándo» sube ~207 px a 1440 y ~287 px a 375, medido); «Entre lo que más pesa, lo
   que más subió fue…»; «menos de 1 %». Leyes 4, 5 y 8. Se verifica midiendo dónde empieza «Cuándo» y con la ciega. Esfuerzo S. Presentación: OK de Felipe.

### Lo que sobra (ley 8)
- El chip «▲ 6 % vs septiembre» de la cifra grande, si «Cuándo» ya dice la comparación a la misma altura (o, con el cambio 1, que digan lo mismo).
- En un mes vacío, la frase «Todavía no hay gastos registrados en agosto 2026.» junto al vacío «Sin gastos en agosto 2026 todavía.»: dicen lo mismo.

### Lo que no pediste y importa más
**La barra flotante tapa los datos.** El dock del telar («Registrar gasto · Fijos del mes · Salidas de caja · Activos fijos», ADR-0493) flota sobre
la pantalla: en la captura de entrada tapa la fila «Luz», y en el día abierto la ciega no vio entero el monto de «Movilidad» y lo sacó restando
[Observado]. Con más filas y más gráficos, tapa algo en casi cualquier altura. Es una pieza de todo Finanzas: lo decide Felipe.

### Lista aparte (no se ejecuta)
- **N2:** a 375 px se esconde la píldora ▲/▼ (y la línea de meses ya se escondía bajo 680 px); la rayita es `aria-hidden`, así que quien usa lector
  de pantalla en el teléfono pierde cuánto subió o bajó cada categoría (la frase de arriba sí lo resume).
- **Piezas del sistema (H5, matizado):** el tramo de la barra tiene 24 px de alto para tocar pero 12 px de ancho en los finos (la fila entera, de 60 px,
  y la columna del desglose ya cubren lo mismo); «Ver los N en la tabla» mide 14 px (`EnlaceVer`, /unificar); el eje y los cierres de `<Linea>` van a
  10,5 px, también cifras como «10.4 mil / septiembre».
- **El globito de `<Linea>` (H6, matizado):** su tope supone 180 px de ancho y el de «Cuándo» mide ~200: asoma ~10 px por el borde, y a 375 se corta.
  Es pasajero (se va al sacar el mouse).
- Lo que la ciega no entendió y es de antes: «Empresa» como sede, «por confirmar», «Te toca», «Activos fijos», «Salidas de caja», y si «86 sin
  comprobante» y «Sin contar 2 fijos» entran en la cifra.
- Siguen sin decidir los cambios 2 y 3 de la pasada del 22-oct (una sola respuesta arriba, la lista de gastos).

### Prueba ciega (un agente sin contexto, Sonnet, sobre 5 capturas de 1440 px; no navegó)
Tarea, en palabras de tienda: «Dime si este mes vamos gastando más o menos que el mes pasado, en qué se nos va más la plata, y qué se pagó exactamente
el día que más se gastó. Y si seguimos así, ¿con cuánto cerramos el mes?»

| Medida | Resultado | Pasa |
|---|---|---|
| Lectura de 5 s | «la pantalla de "Gastos"… cuánto gastó CAYLA este mes: "S/ 10,967", con un "▲ 6 % vs septiembre"… lo que sigue es bajar para ver el resto de la lista y algún gráfico, o tocar una fila» | sí |
| Primer intento | las cuatro bien: más (S/ 599), Alquileres (S/ 5,400), el lunes 5 con sus 4 gastos (S/ 3,095, sumó y cuadró), ≈ S/ 11,400 | sí |
| Pasos | 14 (el mínimo, unos 5: la frase de «Cuándo», la fila 1, tocar el día, leer el cierre) | no |
| Dudas | 10; en lo de hoy: «▲ 6 % vs septiembre» (¿entero o a esta altura?), «lo que más subió… (+20 %)» frente a «▲ 75 %», la rayita (la entendió con la leyenda), «Alquileres · 3 al 5 oct» (¿uno o tres días?), «si sigue así» (¿cuenta los fijos?), un globito de otro día (era el defecto N1, arreglado) | no |
| Palabras no entendidas | 7, todas de antes: «Fijos del mes», «por confirmar», «Activos fijos», «Salidas de caja», «Te toca», «Por pagar», «Empresa» | no |
| Errores evitables | 0 en las respuestas; 4 casi errores (el rango de días como un día, el globito del día 30, «▲ 75 %» como «en qué se va», el cierre de septiembre) | casi |

### Veredictos del escéptico
| Hallazgo | Veredicto | Por qué |
|---|---|---|
| H1 · dos comparaciones con septiembre que se contradicen a mitad de mes | CONFIRMADO | `chipDelMesAnterior` y la píldora usan el mes cerrado (`gastos-hilos-reglas.ts:112,125,135`, `page.tsx` con `rangoMes`); «Cuándo» usa `anteriorAEstaAltura`. Las cifras cuadran con la base. También la frase de los hilos |
| H2 · «Cuándo» bajo el pliegue por las 10 filas | MATIZADO | Cierto, pero solo en parte: «En qué se va» ya empieza en 576 px; con 5 filas seguiría bajo el pliegue a 1440. A 375 sí cambia mucho |
| H3 · «0 % de lo gastado» | CONFIRMADO | 0,48 % redondeado (`gastos-hilos-reglas.ts:131`) |
| H4 · lecturas para comparar en cadena | CONFIRMADO, peor | Además esperaban al inicio de Finanzas, pedido después: dos vueltas. **Arreglado** (`33a3bef5b`) |
| H5 · blancos y textos chicos | MATIZADO | Son piezas del sistema; el tramo tiene 24 px de alto para tocar (`::before`), falla solo de ancho en los finos |
| H6 · el globito tapa las cifras del final | MATIZADO | Pasajero; asoma ~10 px por el tope de 180 px. La captura citada mostraba en realidad N1 |
| H7 · la frase de los hilos frente a «▲ 75 %» | CONFIRMADO | El corte de 4 % no se dice; a 375 no se ve el choque (la píldora se esconde) |
| N1 (lo encontró él) · el globito salta a «hoy» al tocar | CONFIRMADO | `onFocus` del gráfico antes del clic. **Arreglado** (`33a3bef5b`) |
| N2 (lo encontró él) · a 375 se pierde el ▲/▼ para el lector de pantalla | CONFIRMADO, menor | A la lista aparte |

### Antes de decir «listo»
- **Concurrencia:** las dos secciones solo leen; dos personas a la vez ven lo mismo.
- **Caída externa:** si el resumen de un mes de antes o la lista del mes anterior no responde, los gráficos salen sin comparar y el aviso de arriba lo
  dice; si no responde la base, el ERP manda a `/sin-base` (ADR-0450).
- **Persona sin contexto:** ciega con un agente sobre capturas (arriba); con una colaboradora real, sin probar.

### Historial
| Fecha | SHA | Leyes | Oficio | Cambios cerrados |
|---|---|---|---|---|
| 2026-10-30 | `33a3bef5b` | 6,6 (ley 1: 7; ley 2: 5), de las dos secciones nuevas | 7 | arreglados en el análisis: el mes vacío de «Cuándo», el globito que saltaba a «hoy» y las lecturas en cadena; 3 cambios nuevos esperan OK |

---

## Después de las tareas #1 a #3 · 2026-10-22, noche — la lista de Fijos y el titular, medidos (`rapido` + el código nuevo)

- **SHA:** `e6b2227aa` (tres commits sobre `3b63baf00`)   · **Qué cambió:** el cambio 1 de la pasada de arriba (**Fijos del mes como una sola lista**, con el mes,
  la suma, los días de atraso y los registrados plegados), el titular que dice «Todavía no cuenta: N gastos fijos por confirmar», el aviso de «De la
  empresa» y la pregunta «¿Es uno de tus fijos?» del formulario. **No** se hicieron el cambio 2 (una sola respuesta arriba, que decide Felipe) ni el 3
  (la lista de gastos).
- **Entorno:** una página de prueba con datos inventados (12 fijos, 144 gastos), a 1440 × 900, 1024 × 768 y 375 × 812, con `medir-oficio.js`. Sin
  prueba ciega y sin colaboradora real: **las leyes no se recalifican** (siguen en 5,0 provisional).

### Medido (antes → después)
| Comprobación | Antes (captura de Felipe y código) | Después (medido) |
|---|---|---|
| Orden de la pestaña | «Para confirmar» (vacía) primero, «Faltan» segunda, columna derecha casi vacía [visto] | una sola lista: «Ya pasaron su fecha» y «Llegan este mes», con los registrados plegados |
| Lo que dice cada fila | «la quincena · monto variable», sin fecha ni atraso [visto] | «se esperaba el 15 oct · hace 7 días» / «se espera el 31 oct · en 9 días» |
| Lo que falta, sumado | no se decía fuera de la bandeja | en la cabecera de la lista y bajo el titular: «11 por confirmar (~S/ 12,762)» |
| Desborde horizontal | 0 px | 0 px a 1440, 1024 y 375 |
| Texto bajo 4,5 : 1 | — | ninguno, en los tres anchos |
| Rojos visibles | — | 2 (el límite del sistema) |
| Fila de un fijo a 375 px | sin regla de celular: el nombre se partía en tres renglones [inferido del CSS] | 136–140 px; el botón baja bajo el nombre; «Editar fijos» ya no se corta (112 px) |
| Montos alineados | cada fila con su ancho de botón | una última columna de 7,5 rem: los montos quedan en línea |
| Blancos de puntero bajo 24 px | — | **2, nuevos:** «Ver el gasto» (69 × 19) y «Ver el registrado» (126 × 20); son las piezas del sistema `btn-enlace` y `ver-mas-enlace` |
| Dónde empieza la lista de fijos (1440 × 900) | ≈ 1 145 px del tope (bajo el pliegue) | **igual:** 1 145 px; es el cambio 2 que no se hizo |
| Oficio, a 1440 y a 1024 | sin medir | **5 de 8 fallan, casi todo heredado de la página:** versalitas de 11 px del sistema, 7 radios, bordes casi alineados, un hueco de 4,5 px; lo propio son los dos enlaces de 19–20 px |

### Lo que sigue (no se ejecuta sin Felipe)
- **El cambio 2 (una sola respuesta arriba).** Es lo que subiría la lista de Fijos de esos 1 145 px (cuánto, sin medir todavía): quitar la tarjeta que repite el monto del Pulso y acortar la bajada. Lo decide Felipe.
- **Los dos enlaces de 19–20 px** son la altura de la pieza `btn-enlace` (y `ver-mas-enlace`): arreglarlos en la pieza sería para todo el ERP (`/unificar`), no solo aquí.
- **La prueba ciega con las pestañas Fijos y Gastos**, y `/chaos` sobre el formulario de gasto (guarda y ahora lleva `p_gasto_fijo_id`): sin hacer.

## Primera pasada de la PANTALLA ENTERA · 2026-10-22 — por lectura de código y captura (sin medir, sin prueba ciega)

- **Fecha / SHA:** 2026-10-22 · `f26b3b288`   · **Dispositivo que manda:** escritorio (Mac mini); a 375 px la tabla se apila en tarjetas
- **Pregunta que debería resolver (1 frase):** ¿qué falta confirmar este mes y en qué se fue la plata?   · **Protagonista:** el dinero
- **Veredicto en una línea:** «Se entiende que es de gastos, pero no a qué se viene: arriba hay cuatro resúmenes antes de la lista y, en Fijos, lo vacío va primero y lo urgente segundo.»
- **Alcance:** la pantalla completa y sobre todo la pestaña «Fijos del mes» (la captura de Felipe). Las pasadas anteriores solo calificaron la fila de un gasto, su detalle y la tarjeta del IGV (7,8 en el tablero): **ese 7,8 no es de la pantalla entera**.
- **Qué NO se hizo (y por qué):** no se midió en el navegador (el worktree no tiene `node_modules` ni base local) y no hubo prueba ciega ni colaboradora real. Por eso el oficio visual queda **sin medir** y la ley 1 no pasa de 8. Las notas de abajo son **[Opinión] por lectura**, marcadas provisionales. El escéptico revisó los hallazgos: 8 confirmados, 4 matizados, 0 refutados.
- **Análisis completo, con las 6 dimensiones y las 12 tareas:** [`docs/pantallas/finanzas-gastos.md`](../pantallas/finanzas-gastos.md).

### Notas (0–10), provisionales
| Eje | Nota | Evidencia |
|---|---|---|
| 1 Sin manual | 5 (tope 8) | [Opinión] por lectura; sin ciega ni real |
| 2 Una pregunta, una respuesta | 4 | [Medido en código] dos botones primarios con la bandeja llena; cuatro resúmenes antes de la lista; el monto del mes sale dos veces |
| 3 Simplicidad profunda | 6 | [Medido en código] el IGV perdido ya se traduce a un veredicto; «Faltan» no dice cuánto ni desde cuándo |
| 4 Lenguaje de tienda | 5 | [Medido en código] «Egresos de caja sin clasificar / por clasificar» y «Salida de caja sin clasificar» para lo mismo; «Unidad»; cuenta contable en cada fila |
| 5 Contenido primero | 5 | [Opinión] la lista empieza unos 950 px abajo (suma del CSS, no una medida) |
| 6 Lo difícil, a un toque | 5 | [Medido en código] el «¿Por qué?» y el desglose que la maqueta A prometía no existen |
| 7 Perdonar antes que preguntar | 6 | [Medido en código] «No es fijo» se documenta reversible y no lo es; un monto mal escrito en una factura pagada no tiene salida |
| 8 Quitar antes de agregar | 3 | [Medido en código] cuatro capas, monto repetido, columna derecha de Fijos vacía, chip «Pagado» en casi toda fila |
| 9 De punta a punta | 6 | [Medido en código] siete lecturas devuelven `[]` y tres vacíos afirman lo contrario de lo que pasó; sin 375 px |
| **Leyes (promedio)** | **5,0** | ninguna ley bajo 3; la ley 8 es la más débil |
| **Oficio visual** | **sin medir** | plan de medición abajo |

### Los 3 cambios de mayor impacto (esperan el OK de Felipe; nada se tocó)
1. **Fijos del mes como cola de cierre.** Antes: dos tarjetas, «Para confirmar» (vacía) primero y «Faltan» segunda, con cinco botones iguales, sin fecha ni atraso, y una columna derecha casi vacía. → Después: una sola lista con el mes a la vista, cada fila con su fecha («se esperaba el 15 oct · 7 días») y orden por urgencia y monto, el total que falta arriba, lo vacío plegado y lo registrado que abre su gasto. Leyes 2, 5 y 8. Se verifica midiendo la altura hasta el primer fijo y con la prueba ciega. Esfuerzo M, solo web. **Decide Felipe** (se aparta del spike de dos columnas: lo escribe el ADR).
2. **Arriba, una sola respuesta.** Antes: cabecera, Pulso, bandeja y cuatro cifras, con el monto del mes dos veces, antes de la lista. → Después: se quita la tarjeta que repite el monto del Pulso, la bajada de la cabecera se acorta y la lista sube. Leyes 5 y 8. Esfuerzo S. **Decide Felipe**: el Pulso y la bandeja los eligió él en el camino A (ADR-0417); quitar o fundir una cifra es suya.
3. **La lista de gastos: una fila, una frase.** Antes: 8 columnas, chip «Pagado» en casi toda fila, código de cuenta contable repetido y decenas de renglones de «baño» tapando lo grande. → Después: menos columnas, solo se marca lo que no es normal, los repetidos del cajón se agrupan en una fila que se abre (con el total que cuadra al céntimo). Leyes 3, 4 y 8. Esfuerzo M. **Decide Felipe** (se aparta del spike de 8 columnas).

### Lo que sobra (ley 8)
La tarjeta «Gastado en el mes» (repite el monto del Pulso y su conteo); el chip «Pagado» en las filas sin factura a crédito; el código de la cuenta contable en cada fila; «Ninguno todavía.» como bloque propio cuando no hay nada registrado. Se **propone** esconder o plegar; nada se borra.

### Lo que no pediste y importa más
Una cifra no es una pantalla: **el 95 % de los gastos entra por Caja**, así que esta pantalla es de *revisar y confirmar*, no de capturar. Agregarle funciones de captura sobre este esqueleto la hace más cargada; lo que le da valor es contar lo que falta confirmar (los fijos) y dejar la lista legible.

### Lista aparte (no se ejecuta)
«De la empresa» se lee como S/ 0 de toda la empresa (la captura está en esa vista) · «Para confirmar» dice «llegan en los próximos días» aunque falten nueve · la bandeja dice «Registrar» y no «Registrar monto» para un fijo variable · las dos tarjetas acumuladas («Por pagar», «Egresos sin clasificar») no dicen «a hoy» · piezas a mano donde ya hay pieza única (`Vacio`, `Aviso`, `btn-peligro`) · el botón que confirma «Anular gasto» y «No es fijo» es primario (el resto del ERP usa el peligro) · tres nombres para las salidas del cajón.

### Plan de medición (para cuando haya entorno)
Medir con `referencia/medir-oficio.js` a 1440 × 900 (primero), 1024 × 768 y 375 × 812 sobre una página de prueba con los casos «Todas las tiendas» (24 fijos), «De la empresa» (5), sin fijos y con lectura fallida; repetir con `pnpm focus`, `pnpm sugerir` y `node scripts/rendimiento/ui.mjs --ruta /finanzas/gastos`. Después, prueba ciega con un agente sin contexto sobre las pestañas Fijos y Gastos, y la pasada con una colaboradora real (sin ella, la ley 1 no pasa de 8). **Estas notas se reemplazan por las medidas antes de dar la pantalla por terminada.**

### Antes de decir «listo» (CLAUDE.md global)
- **Concurrencia:** dos personas sobre el mismo fijo el mismo mes → la base lo impide (`gastos_fijo_mes_uq`), pero el mensaje que ve la segunda es genérico («Vuelve a intentar»).
- **Caída externa:** escribir un gasto no depende de nada externo; **leer sí falla en silencio** hoy (siete lecturas devuelven vacío). Sin la corrección, el diseño no está listo.
- **Persona sin contexto:** sin probar (no hubo prueba ciega ni colaboradora real en esta pasada).

### Historial
| Fecha | SHA | Leyes | Oficio | Cambios cerrados |
|---|---|---|---|---|
| 2026-10-22 | `f26b3b288` | 5,0 (provisional, por lectura) | sin medir | — (primera pasada de la pantalla entera; las anteriores eran de la fila del gasto) |

---

## Segunda vuelta · 2026-10-14, tarde — los 3 cambios aplicados (OK de Felipe) y la tarjeta sin negativos

- **SHA:** `da1941fae` + los 3 cambios   · **Qué cambió:** lo de «Los 3 cambios de mayor impacto» del re-análisis de abajo, tal cual se propuso, y los meses
  cruzados con la opción que Felipe pidió («la que sea más entendible y lógica»): la tarjeta **nunca dice un negativo**; si lo perdido pasa el IGV del
  mes dice S/ 0 y «Impuestos resta los S/ 180 que faltan», y el mes del gasto dice «Incluye S/ 180 que se pierde por un pago sin banco de octubre:
  Impuestos lo resta en ese mes». La base no cambió.
- **Entorno:** la misma página de prueba con datos inventados, ahora al ancho real de Finanzas (`max-w-5xl`), con los casos `?caso=negativo` y
  `?caso=septiembre`. El «antes» es `da1941fae` a ese mismo ancho.

### Medido (antes → después, mismo ancho)
| Comprobación | Antes (`da1941fae`) | Después |
|---|---|---|
| Columna Monto (1440 y 1024) | 211 px | 130 px |
| Alto de la fila del alquiler (1024) | 118 px | 80 px |
| La fila del hotel | «IGV perdido S/ 360.00» | «IGV S/ 360.00» / «perdido S/ 360.00» (ámbar) |
| La fila del alquiler | «IGV S/ 180.00 · perdido S/ 180.00» | «IGV S/ 360.00» / «perdido S/ 180.00» (ámbar) |
| El valor «IGV perdido» del detalle | «S/ 180.00 · S/ 1,180.00 se pagaron en efectivo el 12 oct» | «S/ 180.00 · del pago de S/ 1,180.00 en efectivo (12 oct)»; no se sale de la hoja a 375, 1024 ni 1440 |
| La nota | «Una factura de S/ 2,000 o más… Se resta del IGV de octubre, en Impuestos.» | «Esta factura es de S/ 2,360: … aunque ese pago sea de menos de S/ 2,000. Ese IGV ya está restado de lo que descuentas en octubre. Míralo en Impuestos.» (enlace `btn-enlace` a `/finanzas/impuestos?mes=2026-10`, solo con el módulo) |
| Lo que falta pagar | «Se paga desde Compras ▸ Por pagar, como cualquier factura de proveedor.» | «Lo que falta (S/ 1,180.00) se paga desde Compras ▸ Por pagar por el banco: en efectivo o desde un fondo se pierde su IGV (S/ 180.00).» |
| Tarjeta, mes del pago con más pérdida que IGV | «S/ -180» | «S/ 0 · Se pierde S/ 230 por pagar sin banco (S/ 180 de gastos de otros meses), más que los S/ 50 de IGV de las facturas del mes: Impuestos resta los S/ 180 que faltan.» |
| Tarjeta, mes del gasto con pérdida en otro mes | «S/ 360 · Solo de facturas.» | «S/ 360 · Solo de facturas. Incluye S/ 180 que se pierde por un pago sin banco de octubre: Impuestos lo resta en ese mes.» |
| Desborde de la página | 0 px | 0 px (1440, 1024, 375; claro y oscuro) |
| Oficio del detalle (medidor) | 4 de 8 a 1024 (medido en el re-análisis) | 5 de 8 a 1024: la nueva es «filas de alto desigual», el «×» de la hoja en la misma franja que «Qué mirar» y «Registrar gasto», que están detrás del velo (falso positivo); a 375 baja de 5 a 4 |

### Notas (0–10) después de los cambios
| Eje | Antes | Ahora | Evidencia |
|---|---|---|---|
| 1 Sin manual | 7 | 8 | [Observado] segunda ciega: correcta al primer intento, 2 «casi errores» (antes 5), ninguno en las palabras nuevas · real: sin probar (tope 8) |
| 2 Una pregunta, una respuesta | 8 | 8 | [Observado] a los 5 s: «la tarjeta "IGV que puedes descontar: S/ 279" ya responde la primera pregunta» |
| 3 Simplicidad profunda | 6 | 8 | [Observado] entendió sola el riesgo: «los S/ 180 de esa mitad pendiente… solo se podrán descontar si se paga por banco» |
| 4 Lenguaje de tienda | 6 | 7 | [Observado] la nota y «del pago de» se entendieron; «aunque ese pago sea menor» le hizo preguntar «¿menor que qué?» (ya dice «de menos de S/ 2,000»); «desde un fondo» sigue sin entenderse |
| 5 Contenido primero | 8 | 8 | [Observado] vio el ámbar a los 5 s |
| 6 Lo difícil, a un toque | 7 | 8 | [Observado] «aquí tocaría "Impuestos" ("Míralo en Impuestos")»: el porqué y el siguiente paso, en el detalle |
| 7 Perdonar antes que preguntar | — | — | no cambió: solo lee |
| 8 Quitar antes de agregar | 7 | 7 | [Observado] el alquiler a crédito sigue con dos notas y «Su factura ya tiene pagos…» abajo |
| 9 De punta a punta | 7 | 8 | [Medido] 375, oscuro y los meses cruzados (S/ 0 explicado) |
| **Leyes (promedio)** | 7,0 | **7,8** | sin ninguna ley bajo 5 |
| **Oficio visual** | 7 | **8** | [Medido] la columna Monto en 130 px, nada se sale de la hoja, contraste bien |

### Segunda prueba ciega (mismo agente sin contexto, misma tarea, 3 capturas nuevas de 1440 px)
| Medida | Resultado | Pasa |
|---|---|---|
| Lectura de 5 s | «la pantalla de los gastos de octubre… "IGV que puedes descontar: S/ 279" ya responde la primera pregunta… en las filas del Hotel y del Alquiler veo "perdido" en dorado» | sí |
| Primer intento | correcta (S/ 278.85, S/ 540 perdidos, el porqué de cada factura) y además: «los S/ 180 de esa mitad pendiente… solo se podrán descontar si se paga por banco» | sí |
| Pasos | 12 (cruzó todas las cifras; el mínimo sigue siendo 3) | no |
| Dudas | 10 (antes 12); en lo nuevo: «perdido» (¿plata o IGV? se aclaró en el detalle), «aunque ese pago sea menor» (ya corregido) y «Ese IGV ya está restado» (¿de los S/ 279? concluyó que sí) | no |
| Palabras no entendidas | 10, casi todas de antes (cuenta 631, Unidad, Dynamic, vigentes…); en lo nuevo, solo «desde un fondo» | no |
| Errores evitables | 2 «casi errores» (antes 5): dar los S/ 279 por seguros, y el redondeo de la tarjeta frente a los céntimos de la tabla | casi |

### Lo que queda (no se ejecuta sin Felipe)
- **El subrayado del enlace «Impuestos» a veces no se ve** [Observado: la ciega lo vio subrayado en el alquiler y no en el hotel; Opinión: la pieza
  `btn-enlace` dibuja el subrayado 0,7 em bajo el centro de la caja, y en una frase de 13 px cae justo en el borde y a veces no se pinta]. Es la pieza
  común (ADR-0358, ronda 8): si se ajusta, en todo el ERP.
- **«perdido S/ 360.00» bajo «IGV S/ 360.00»:** la ciega dudó si se perdió plata o IGV hasta abrir el detalle. «IGV perdido S/ 360.00» en el segundo
  renglón lo diría, a costa de unos 25 px más de columna.
- **La tarjeta no dice qué parte del IGV todavía depende de pagar por banco** (la ciega dio los S/ 279 por seguros hasta ver el detalle).
- «desde un fondo», «Compras ▸ Por pagar» sin enlace y lo demás de la lista aparte de abajo, sin cambios.

## Re-análisis · 2026-10-14, tarde — el IGV perdido por pagar sin banco (ADR-0362, decisión 76)

- **Fecha / SHA:** 2026-10-14 · `87ef1b5dd` (punta de la fase 6, PR #1055) + el cambio del IGV perdido   · **Dispositivo que manda:** escritorio
  (Mac mini); a 375 px la tabla se apila en tarjetas
- **Pregunta que debería resolver (1 frase):** ¿cuánto IGV de los gastos del mes se puede descontar y qué gasto lo perdió?   · **Protagonista:** el dinero
- **Veredicto en una línea:** «Se entiende sin ayuda: la prueba ciega dio la respuesta correcta (S/ 279 y S/ 540 perdidos). Pero estuvo a punto de
  equivocarse 3 veces en lo nuevo, casi todas en la factura pagada solo en parte; y la línea nueva ensancha la columna Monto.»

**Alcance.** Solo lo que cambió: la línea bajo el monto, la tarjeta «IGV que puedes descontar» y las filas «IGV descontable» / «IGV perdido» y la nota
del detalle. El resto de la pantalla no se volvió a calificar. **Entorno:** el banco `cayla-oc` estaba tomado por un `/chaos` de otra sesión, así que se
midió en una página de prueba con datos inventados que pasa por las mismas lecturas que la pantalla (`leerGasto`, `conIgvPerdido`, `leerPanel`), sin
base: el hotel F001-4321 de S/ 2 360 pagado en efectivo, un alquiler de S/ 2 360 a crédito con la mitad pagada en efectivo, la luz pagada por
transferencia y un flete con boleta. **Ojo:** esa página es más ancha que el ERP (1 104 px a 1440 contra los 1 024 de Finanzas, `max-w-5xl`, con el
lateral): en el ERP la columna Monto aprieta más. Antes, ya se había visto en el banco el hotel real: «IGV perdido S/ 360.00» en la fila, el detalle y
la tarjeta en S/ 0 «menos S/ 360 que se pierde por pagar sin banco». 2 agentes (de 4): un ciego y un escéptico (veredictos al final).

**Arreglado durante el análisis** (eran defectos del cambio, no propuestas): a 375 px el valor «IGV perdido» de un pago parcial se salía de la hoja y
se cortaba («…se pagaron en efectivo e», lo encontró el escéptico; el medidor dio un falso negativo) → ahora se parte en dos renglones y el título no se
parte; medido de nuevo: no se sale a 375, 1024 ni 1440. Y la tarjeta podía decir «S/ -0» cuando el redondeo de cada pago pierde un céntimo de más →
`solesRedondo` ya no escribe «-0» (prueba pura).

### Notas (0–10)
| Eje | Nota | Evidencia |
|---|---|---|
| 1 Sin manual | 7 | [Observado] ciego: tarea completa y correcta al primer intento, con 5 «casi errores» (3 en lo nuevo) · real: sin probar |
| 2 Una pregunta, una respuesta | 8 | [Observado] a los 5 s fue directo a «IGV QUE PUEDES DESCONTAR S/ 279»: «es justo lo que pregunta el contador» |
| 3 Simplicidad profunda | 6 | [Observado] la regla se tradujo a «IGV perdido», pero el caso parcial sale crudo (dos montos seguidos) y lo que falta pagar no dice si su IGV está seguro |
| 4 Lenguaje de tienda | 6 | [Observado] «Se resta del IGV de octubre, en Impuestos» se leyó al revés; «desde un fondo» no se entendió |
| 5 Contenido primero | 8 | [Observado] encontró el ámbar a los 5 s: «en las filas del Hotel y del Alquiler aparece en marrón la palabra "perdido"» |
| 6 Lo difícil, a un toque | 7 | [Observado] el porqué vive en el detalle (un toque, nunca con el mouse encima); «Impuestos» es texto y no lleva a ninguna parte |
| 7 Perdonar antes que preguntar | — | No cambió: el cambio solo lee |
| 8 Quitar antes de agregar | 7 | [Observado] en el alquiler a crédito, abajo quedan tres textos seguidos (dos notas y «Su factura ya tiene pagos…») |
| 9 De punta a punta | 7 | [Medido] 375 px (ya arreglado) y oscuro bien; si la lectura del IGV perdido falla, la lista sale y lo dice; los meses cruzados, abajo |
| **Leyes (promedio)** | **7,0** | sin ninguna ley bajo 5 |
| **Oficio visual** | **7** | [Medido] dentro del cambio: contraste bien (nada bajo 4,5 : 1); la línea nueva ensancha la columna Monto |

### Medido (Chromium sin pantalla sobre la página de prueba, claro y oscuro)
| Comprobación | 1440 × 900 | 1024 × 768 | 375 × 812 |
|---|---|---|---|
| Desborde de la página | 0 px | 0 px | 0 px |
| Ámbar de la fila («IGV perdido S/ 360.00», «perdido S/ 180.00»), 12 px | 6,27–6,93 : 1 (oscuro 8,81–9,56) | igual | igual |
| Línea bajo el monto, entera, 12 px | 5,04–5,58 : 1, una línea, sin cortes | igual | igual |
| «IGV perdido» del detalle, 13 px | 6,93 : 1 (oscuro 9,56), un renglón | un renglón | antes se cortaba; ahora dos renglones, no se sale |
| La nota del detalle, 13 px (pieza `nota-cayla` del sistema) | 4,68 : 1 (oscuro 6,06), 4 líneas | 4 líneas | 6 líneas |
| La bajada de la tarjeta, 13 px | 5,58 : 1 (oscuro 6,96), 3 líneas | 2 líneas | 3 líneas |
| Columna Monto | 120 px sin pérdidas → 181 px con «IGV perdido S/ 360.00» → 211 px con «IGV S/ 180.00 · perdido S/ 180.00» | igual (la fila del alquiler: 60 → 118 px) | tarjeta apilada: una línea |
| La hoja del detalle | 545 px de 900 (alquiler 655) | 545 de 768 | 626 de 812 (alquiler 731) |

### Los 3 cambios de mayor impacto (esperan el OK de Felipe; nada se tocó)
1. **La línea bajo el monto, sin ambigüedad y sin ensanchar la tabla.** Antes: «IGV S/ 180.00 · perdido S/ 180.00» (¿180 era todo el IGV?; en las
   demás filas «IGV» es el de la factura) en una sola línea que no se parte y lleva la columna de 120 a 211 px. → Después: dos renglones, «IGV
   S/ 360.00» (el de la factura, como siempre) y debajo, en ámbar, «perdido S/ 180.00» (o «perdido S/ 360.00»). En el detalle, «S/ 180.00 · S/ 1,180.00
   se pagaron en efectivo el 12 oct» → «S/ 180.00 · del pago de S/ 1,180.00 en efectivo (12 oct)». Leyes 3 y 4, y oficio. Se verifica midiendo otra
   vez la columna (≈ 120 px) y con la prueba ciega. Esfuerzo S. Decide Felipe (cambia las palabras que eligió).
2. **La nota en palabras de tienda, con su enlace.** Antes: «Una factura de S/ 2,000 o más se paga por el banco: SUNAT no deja descontar el IGV de lo
   que se pagó en efectivo o desde un fondo. Se resta del IGV de octubre, en Impuestos.» → Después: «Esta factura es de S/ 2,360: desde S/ 2,000 se
   paga por el banco, y SUNAT no deja descontar el IGV de lo que se pagó en efectivo o desde un fondo, aunque cada pago sea menor. Ese IGV ya está
   restado de lo que descuentas en octubre.» (la frase de Impuestos, `ImpuestosPanel.tsx`), con «Impuestos» como enlace solo para quien ve ese
   módulo (es otro módulo; sin condición llevaría a «Sin acceso»). Leyes 4, 1 y 6. Esfuerzo S. Decide Felipe (texto de SUNAT).
3. **Decir qué IGV sigue en riesgo.** Antes: el detalle de una factura a crédito de S/ 2 000 o más con saldo dice «Se paga desde Compras ▸ Por pagar,
   como cualquier factura de proveedor.» y muestra «IGV descontable S/ 180.00» como seguro → Después: «Lo que falta (S/ 1,180.00) se paga desde
   Compras ▸ Por pagar **por el banco**: en efectivo o desde un fondo se pierde su IGV (S/ 180.00).» Misma nota, sin bloque nuevo. Ley 3. Matiz del
   escéptico: al pagar desde Por pagar ya sale el aviso «quedan "no deducibles"» (mira el total de la factura), así que aquí es información, no una
   trampa. Esfuerzo S. **Decide Felipe: dinero y SUNAT.**

### Lo que sobra (ley 8)
Nada que esconder en lo nuevo: «IGV descontable S/ 0.00» parece de más cuando se perdió todo, pero la prueba ciega lo usó para confirmar «no queda nada
para descontar». En el alquiler a crédito, los tres textos de abajo se acortan con el cambio 3 (la nota del pago absorbe el aviso).

### Lo que no pediste y importa más
**Cuando el pago cae en otro mes que el gasto, ninguna de las dos tarjetas cuadra con su lista.** Es la consecuencia de restar en el mes del PAGO
(decisión 72): una factura de septiembre pagada en efectivo en octubre dice «IGV perdido» en su fila de septiembre, pero la tarjeta de septiembre
sigue contando ese IGV; y la de octubre lo resta aunque el gasto no esté en la lista de octubre, y puede quedar **en negativo** («IGV que puedes
descontar S/ -180») si los gastos de octubre traen menos IGV. [Medido] en la prueba pura (`bajadaIgvDelMes`) y confirmado por el escéptico en el
código; Impuestos también puede tener negativo el crédito de gastos de ese mes, pero solo se ve en el archivo para el contador. La bajada de octubre
ya lo dice («de gastos de otros meses»); la de septiembre no. Opciones para Felipe: dejarlo así y que la bajada de septiembre también lo diga («S/ 180
de este mes se pierde en octubre»), o mostrar S/ 0 en vez de un negativo. Es dinero: lo decide Felipe.

### Lista aparte (no se ejecuta)
- La tarjeta del IGV no se toca: la prueba ciega quería ver qué facturas forman los S/ 279 y sumó a mano (una píldora «Con IGV perdido» o tocar la tarjeta
  para filtrar).
- «desde un fondo» no se entiende (el menú dice «Fondos por rendir», y «fondo» también es el «Fondo de caja»). La frase viene del aviso al pagar y de
  Impuestos: cambiarla solo en Gastos haría que las tres pantallas se contradigan; si se cambia, en las tres.
- «Compras ▸ Por pagar» de la nota del detalle tampoco es enlace (estaba antes de este cambio).
- «vence 30 oct» en «Cómo se pagó» de una factura a crédito ya pagada en parte: no dice cómo se pagó lo pagado (estaba antes de este cambio).
- El hotel dice «RUC 20123456789» y no su nombre: ningún proveedor tiene ese RUC (decisión de la tarde anterior, `fn_gastos_lista`).
- «cuenta 631», «vigentes», «se lee de Dynamic», «Unidad»: palabras de antes que la prueba ciega no entendió.
- Activos fijos: la nota general «El IGV de su factura se descuenta aparte» no vale para un activo de S/ 2 000 o más pagado sin banco
  (`fn_igv_perdido` también lo pierde, e Impuestos lo resta). La pestaña no muestra el IGV de cada activo, así que no se tocó.

### Prueba ciega (un agente sin contexto, sobre 3 capturas de 1440 px; no navegó)
Tarea, en palabras de tienda: «El contador me pregunta cuánto IGV de los gastos de octubre vamos a poder descontar. Y dime qué pasó con el IGV del
hotel y con el del alquiler, que no me cuadra.»

| Medida | Resultado | Pasa |
|---|---|---|
| Lectura de 5 s | «la lista de gastos de octubre… "IGV QUE PUEDES DESCONTAR S/ 279" parece justo lo que pregunta el contador… en las filas del Hotel y del Alquiler aparece en marrón "perdido"» | sí |
| Primer intento | completa y correcta: S/ 278.85 (la tarjeta redondea a 279) y S/ 540 perdidos, con el porqué de cada factura | sí |
| Pasos | 9 (el mínimo es 3: la tarjeta, el hotel, el alquiler); 2 son «aquí tocaría Impuestos / Por pagar» | no |
| Dudas | 12 (una era el indicador de desarrollo de Next.js, que no sale en producción); en lo nuevo: «IGV S/ 180.00 · perdido S/ 180.00», «S/ 180.00 · S/ 1,180.00 se pagaron…», «Una factura de S/ 2,000 o más», «IGV descontable S/ 180.00» (¿seguro?), «Se resta del IGV de octubre, en Impuestos» | no |
| Palabras no entendidas | 9; en lo nuevo: «Se resta del IGV de octubre, en Impuestos» y «desde un fondo» | no |
| Errores evitables | 0 en la respuesta; 5 «casi errores», 3 en lo nuevo | casi |

### Veredictos del escéptico
| Hallazgo | Veredicto | Por qué |
|---|---|---|
| Lo que falta pagar no dice si su IGV está seguro | MATIZADO | Cierto en Gastos, pero Por pagar ya avisa al pagar en efectivo (mira el total de la factura): es información, no una trampa. Pasó al cambio 3 |
| La línea parcial es ambigua y el detalle pone dos montos seguidos | CONFIRMADO | En las demás filas «IGV» es el de la factura; aquí es lo que queda |
| La nota se lee al revés y no lleva a Impuestos | CONFIRMADO | Impuestos ya tiene una frase más clara; el enlace tiene que depender del módulo |
| La columna Monto se ensancha | CONFIRMADO | `white-space: nowrap` en `.fin-tabla td.fin-num`; en el ERP real (1 024 px de ancho para Finanzas) aprieta más que en la prueba |
| Un mes puede quedar en negativo | CONFIRMADO | Y «S/ -0» por un céntimo: arreglado |
| «desde un fondo» | CONFIRMADO, con matiz | La frase es compartida con el aviso al pagar e Impuestos: va a la lista aparte |
| El círculo con «N» | REFUTADO | Indicador de desarrollo de Next.js (`next dev`): no sale en producción |
| Contraste | CONFIRMADO | Nada bajo 4,5 : 1; el mínimo es la nota del sistema (4,68) |
| Fallas del medidor de la página | MATIZADO | Ninguna cae en lo cambiado; a 375, «filas de alto desigual» era el título «IGV perdido» partido (ya no se parte) |
| (lo encontró él) El valor del detalle se cortaba a 375 px | CONFIRMADO | Arreglado y medido de nuevo |

### Antes de decir «listo»
- **Concurrencia:** el cambio solo lee (dos funciones de lectura); dos personas a la vez ven lo mismo.
- **Caída externa:** si `fn_gastos_igv_perdido` no responde, la lista sale igual, sin las marcas, y arriba dice «No se pudo leer el IGV perdido por
  pagar sin banco»; si no responde `fn_gastos_panel`, la tarjeta dice «no se pudo leer», como siempre.
- **Persona sin contexto:** prueba ciega con un agente (arriba); con una colaboradora real, sin probar.

---

## Análisis anterior · 2026-10-14, mañana — el papel del viaje (`rapido`)

- **Fecha / SHA:** 2026-10-14 · medido sobre `adcbe6c40` (rama de la fase 6, PR #1055) + el arreglo del papel del viaje; el commit se rebasó después
  sobre `5d196ead4`, que no toca esta pantalla   · **Dispositivo que manda:** escritorio (Mac mini); a 375 px la tabla se apila en tarjetas
- **Pregunta que debería resolver (1 frase):** ¿cuánto se gastó, en qué, con qué papel y cómo se pagó?   · **Protagonista:** el dinero
- **Veredicto en una línea:** «Solo medido (`rapido`): la fila ya no se contradice. Queda un "IGV descontable" que no lo es cuando la factura de
  S/ 2 000 o más se pagó en efectivo.»

**Alcance.** Solo lo que cambió el 2026-10-14: la celda «Comprobante», la línea bajo el gasto (quién lo dio) y la bajada del detalle. El resto de
la pantalla no se calificó. Sin agentes: `rapido` mide y no hace prueba ciega ni revisión de leyes.

## Notas (0–10)
Sin notas: `rapido` solo mide, y una ley sin evidencia observada no lleva número (la ley 1 nunca se califica sin observar a alguien).

## Lo que cambió (antes → después) — [Medido]
Banco propio con datos inventados, la misma base antes y después (`antes-1440` y `despues-1440` en el scratchpad de la sesión):
- Hotel de S/ 2 360 con factura F001-4321 y RUC 20123456789: **«Sin comprobante · Sin proveedor · IGV S/ 360.00» → «Factura F001-4321 ·
  RUC 20123456789 · IGV S/ 360.00»**. Ningún proveedor tenía ese RUC: por eso dice el RUC.
- La factura de un RUC que sí es proveedor dice su nombre. La boleta dice «Boleta B002-1203»; el pasaje, «Ticket o boleto»; el taxi, «Sin
  comprobante» y debajo «Planilla de movilidad». Son las palabras de la hoja «Gasto del viaje» (`TEXTO_PAPEL`).
- La bajada del detalle: «De la empresa · 14 oct 2026 · Factura F001-4321 · RUC 20123456789», y con la planilla, «Sin comprobante (planilla
  de movilidad)». Antes, un ticket sin número decía «Sin comprobante».
- La cifra «IGV que puedes descontar» dice «1 boleta sin IGV descontable» (antes «0»: no contaba la boleta del viaje).
- Los gastos de Finanzas (la luz con factura, el mototaxi sin comprobante) se ven igual que antes.

## Medido (Chromium sin pantalla contra el banco propio; el panel del navegador estaba oculto)
| Comprobación | 1440 × 900 | 1024 × 768 | 375 × 812 |
|---|---|---|---|
| Desborde de la página | 0 px | 0 px | 0 px |
| Una celda de la fila cortada | ninguna (7 filas) | ninguna | ninguna |
| Contraste: tipo / línea de abajo (12 px) | 14,9–16,4 : 1 / 5,0–5,6 : 1 | igual | igual |
| Alto de la fila | 62 px; 79 px con «Planilla de movilidad», que se parte en dos líneas | 62–98 px | tarjeta apilada; la celda, 150 × 38 a 56 |
| Scroll de lado dentro de la tabla | no | 230 px: es el `min-width: 900px` de `.fin-tabla` (kit de Finanzas, ADR-0195), ya estaba antes | no |

`medir-oficio.js` sobre la página entera a 1440 da 6 de 8 comprobaciones con fallas, **todas fuera de la fila**: «Salir» de 16,5 px de alto, el
«Ctrl K» del buscador a 3,3 : 1, textos de 10–11 px en la cabecera y el lateral, bordes a 1–3 px de alinearse en la cabecera y el combo de
categoría, ocho radios distintos. La pestaña activa «Gastos» a 1,06 : 1 es un falso positivo (el texto va sobre la píldora oscura).

## Lo que sobra (ley 8)
Nada nuevo. «Planilla de movilidad» alarga la fila del taxi una línea, pero no se acorta a «Planilla»: en esta misma pantalla, «planilla» es el
sueldo (la nota del pie dice «La planilla no se registra aquí: se lee de Dynamic»).

## Lo que no pediste y importa más
**«IGV descontable S/ 360.00» en un IGV que se perdió.** El hotel se pagó en efectivo de la caja fuerte y la factura pasa de S/ 2 000: desde la
actividad 8, `fn_igv_perdido` lo da por perdido e Impuestos lo resta. Pero Finanzas ▸ Gastos lo sigue diciendo «descontable» en el detalle y lo
suma en «IGV que puedes descontar». [Medido] en el banco: `fn_igv_perdido` lista F001-4321 con 360,00. Lo mismo le pasa a una factura de
Finanzas pagada así. Es dinero y SUNAT: cómo se dice lo decide Felipe. Va como tarea aparte, no en este arreglo.
**→ Cerrado el 2026-10-14 por la tarde** (decisión 76): ver el re-análisis de arriba.

## Lista aparte (no se ejecuta)
- La Caja de la tienda («Gastos del turno») dice «con comprobante» o «sin comprobante» de un gasto del viaje pagado desde el cajón con la misma
  regla (`tieneComprobante`): probada en `gastos-reglas.test.ts`, no vista en el navegador (el banco no tenía una caja abierta con un gasto así).

## Prueba ciega
Sin hacer (`rapido`).

## Antes de decir «listo»
- **Concurrencia:** son dos lecturas (`fn_gastos_lista`, `fn_gastos_panel`); no escriben nada.
- **Caída externa:** si la base no responde, la pantalla sigue con su aviso de «no se pudo leer» de siempre; no cambió.
- **Persona sin contexto:** sin probar.

## Historial
| Fecha | SHA | Leyes | Oficio | Cambios cerrados |
|---|---|---|---|---|
| 2026-10-14 | `adcbe6c40` + arreglo | — (`rapido`) | — (fila sin fallas medidas) | el papel del viaje en la lista, el detalle y las cifras |
| 2026-10-14 (tarde) | `87ef1b5dd` + el IGV perdido | 7,0 (ley 1: 7, ciega sobre capturas) | 7 (la columna Monto se ensancha) | el «IGV descontable» de un IGV perdido (lo que no pediste de la mañana); arreglados el corte a 375 px y el «S/ -0»; 3 cambios nuevos esperan OK |
| 2026-10-14 (tarde, 2) | `da1941fae` + los 3 cambios | 7,8 (ley 1: 8, segunda ciega sobre capturas) | 8 | los 3 cambios con el OK de Felipe, y la tarjeta sin negativos en los meses cruzados |
