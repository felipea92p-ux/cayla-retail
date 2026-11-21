# Formidable · Gestión ▸ Análisis   (`/gestion/analisis`; Inventario ▸ `/inventario/resumen` hasta el 2026-10-13, ADR-0392)

- **Fecha / SHA:** 2026-10-10 · `25a7a330f` (rama `claude/core-analisis-variantes-prendas-39fd50`) · **Dispositivo que manda:** escritorio (Mac mini)
- **Pregunta que debería resolver (1 frase):** ¿qué modelo se acaba, cuál no se mueve, cuál nadie vio y qué pido? · **Protagonista:** el modelo (la prenda)
- **Corrida:** `rapido` — solo el paso 1 (medir), sin agentes, sin prueba ciega ni escéptico. Las notas de las 9 leyes **no se ponen**: no hay
  evidencia Observada. Motivo de la corrida: cierre de la decisión 12 de ADR-0357 (Análisis mide por modelo).

## Historial
| Fecha | Corrida | Leyes | Oficio | Qué cambió |
|---|---|---|---|---|
| 2026-10-10 | rápido (solo medir) | sin calificar | sin calificar | Análisis pasa de tallas sueltas a modelos (ADR-0357 decisión 12) |
| 2026-11-21 | completa: medir + ciega (1 agente, Sonnet, sobre capturas) | 7,6 | 7 | La cara B (ADR-0357 act. 2026-11-21): una respuesta por pregunta, filtros, «No se vende» sin «Liquidar», ficha en tres bloques. 3 cambios propuestos |
| 2026-11-21 (b) | los 3 cambios con el OK de Felipe + ciega repetida (1 agente, Sonnet) | 7,8 | 7 | Plazos en «Se acaba» y «Qué pedir»; flecha en todo lo que lleva a otra pantalla; «Ver todo el piso» |

## Medido (pestaña «Nunca salió al piso», datos de la base local, Tienda Lima)
- **1440 × 900:** sin desborde ni huecos fuera de escala. Dentro de Análisis: el «?» de ayuda de cada grupo del carril mide 18 × 18 (< 24 con
  mouse) y el chip «Datos confiables» 20 px de alto; bordes de las pestañas que no calzan por 1 px (312/313, 331/332, 944/945). Las tres piezas
  ya estaban antes de este cambio. El medidor marca 1,06:1 en la pestaña activa: **falso positivo** (su fondo oscuro no lo ve el script; en la
  captura se lee crema sobre negro).
- **1024 × 768:** lo mismo; sin scroll horizontal; la línea nueva bajo cada nombre («2 colores · S, M, L») no se corta.
- **375 × 812:** sin scroll horizontal; la línea de colores y tallas cabe (68 a 127 px). Los blancos bajo 44 px son del marco del ERP (menú,
  cabecera), no de Análisis.
- **Escáneres:** `pnpm sugerir`: 0 ejemplos estáticos. `pnpm focus` marca `/gestion/analisis` (entonces `/inventario/resumen`) «sin registro», pero el registro la tiene como
  `no-aplica` y `lib/guia-de-foco.test.ts` pasa: el escáner no lee esa entrada (está escrita en varias líneas). Falsa alarma del escáner.
- **Tema (`tema:auditar --escenarios`):** Hoy, Se está acabando, No se vende, la hoja de confianza y la ficha sin hallazgos; «Qué pedir», 2
  contrastes solo en oscuro (4,09:1) en las cifras de la curva de tallas, previos a este cambio.

## Lo que falta para calificar
Prueba ciega (¿se entiende «2 colores · S, M, L» y «Falta L Beige» sin explicar?), una encargada real, y el escéptico sobre los hallazgos.

## 2026-11-21 · la cara B «Una respuesta por pregunta» · rama `claude/analisis-design-improvement-6bc529` (sobre 720ba1ad8)

- **Dispositivo que manda:** escritorio (Mac mini). **Pregunta que debería resolver:** ¿qué compro ya, qué no se vende, qué nadie vio y qué pido para la campaña?
- **Corrida:** completa, con **1 agente** (el ciego). Medición, revisión de leyes y escéptico, a mano. Antes corrió `/milimetro auditar`
  (`docs/milimetro/auditorias/2026-11-21-analisis-b.md`: 3 graves corregidos, 0 abiertos).

### Medido (página de prueba local, datos inventados; `medir-oficio.js` a 1440, 1024 y 375 en las cinco pestañas y la ficha)
- Sin desborde ni huecos fuera de la escala de 4, a los tres anchos. Contraste: 0 fallas (después de los arreglos de `/milimetro`).
- Blancos bajo 24 px que son de esta pantalla: «Movimientos» al pie de la ficha (81 × 20 px) y el chip «Datos confiables» (145 × 22 px). El «?» de 18 px va
  dentro de una frase (excepción de 2.5.8).
- Rojo: en «Se acaba» la respuesta y el número de cada tarjeta van en rojo (estado urgente, como lo eligió Felipe en la maqueta); en la ficha de algo
  que se acaba el medidor cuenta hasta 10 rojos a la vista.
- Letra chica de 10–11 px: solo la cabecera, el globito de las pestañas y los rótulos «PRENDA»/«VENTAS» del panel de filtros (piezas del sistema).
- Bordes que no calzan por 2–3 px entre las pestañas y el buscador (leve).

### Prueba ciega (Observado) — 1 agente Sonnet, sobre 9 capturas, datos inventados, sin el repo
Tarea, en palabras de tienda: «Dime qué prendas tenemos que comprar ya porque se nos están acabando, y elige una prenda que lleve mucho tiempo sin
venderse y dime qué harías con ella».

| Medida | Resultado | ¿Pasa? |
|---|---|---|
| Lectura de 5 s | «un resumen de cómo va mi tienda, cuatro preguntas; lo que sigue es tocar "Ver y comprar" o "Se acaba"» | sí |
| Primer intento | completó las dos partes sin volver atrás | sí |
| Pasos | 4 pantallas (01 → Se acaba → No se vende → la ficha): el mínimo | sí |
| Dudas | 5: «Se acaba» frente a «Qué pedir» (para ella «lo que se acaba ya es lo que hay que pedir»); si «Comprar» compra o lleva a otra pantalla; «Frescura del piso»; en la ficha de lo que no se vende, ningún botón le dijo qué hacer; la pestaña frente a «Ver y comprar» | 5 hallazgos |
| Palabras no entendidas | «Frescura del piso»; las demás las interpretó bien («Parados S/ 576», «su tipo se vende antes de 60 días», «modelos», «Datos confiables», «Van lentas») | 1 |
| Errores evitables | ninguno | sí |

También dijo que la leyenda de la tabla («vendido y sin stock», «te queda», «no hay») parecía botones, y que no supo qué cambia en la lista el «− 60 +».
**Real: sin probar** (falta una encargada de sede con su equipo).

### Notas (0–10)
| Ley | Nota | Evidencia |
|---|---|---|
| 1 Sin manual | 8 | Ciega a la primera, en el mínimo de pasos; real sin probar (tope 8) |
| 2 Una pregunta, una respuesta | 7 | Cada pestaña abre con su respuesta; pero «Se acaba» y «Qué pedir» se leen como la misma pregunta |
| 3 Simplicidad profunda | 8 | Veredictos y cifras entendidos sin explicación («Parados», «su tipo se vende antes de…») |
| 4 Lenguaje de tienda | 7 | «Frescura del piso» es el nombre de un módulo, no una palabra de tienda |
| 5 Contenido primero | 8 | Miniaturas y cifras grandes mandan; los marcos se retiran |
| 6 Lo difícil, a un toque | 7 | El «?» existe pero no se reconoce como algo que se toca (pieza del sistema) |
| 7 Perdonar antes que preguntar | 8 | Nada irreversible; «Guardar para todos» pregunta en su hoja. «Comprar» no dice que solo lleva a otra pantalla |
| 8 Quitar antes de agregar | 8 | Se fueron las cintas, «Liquidar», el bloque de dinero y la edad del inventario |
| 9 De punta a punta | 8 | Vacíos, datos incompletos, 375 y oscuro revisados; la guía recorrida |
| **Total** | **7,6** | |
| Oficio visual | 7 | 0 contraste, 0 desborde; 2 blancos < 24 px, rojos densos en «Se acaba», bordes de 2–3 px |

### Los 3 cambios propuestos (esperan el OK de Felipe; no se tocó nada)
1. **«Se acaba» y «Qué pedir» dicen su plazo** (leyes 2 y 1). Antes: «5 modelos · se acaban en 2 semanas o menos» y «5 tipos · no te alcanzan hasta
   Navidad». Después: la frase de «Se acaba» empieza por lo que toca hoy («cómpralos ya: se acaban en 2 semanas o menos») y la de «Qué pedir» por la
   campaña («para la campaña: 5 tipos no te alcanzan hasta Navidad»); los botones de «Hoy» pasan a «Comprar ya» y «Preparar el pedido». Los nombres
   de las pestañas no cambian (Felipe: «Qué pedir», nunca «Para Navidad»). Se verifica repitiendo la ciega: que no dude entre las dos.
2. **«Comprar» dice que lleva a otra pantalla** (leyes 1 y 7). Antes: «Comprar», sin flecha, en cada tarjeta y en la ficha. Después: «Comprar» con la
   flecha de `<BotonVer>` (la pieza de «ver en otra pantalla», ADR-0358), igual que «Ver en Existencias». Se verifica con la ciega.
3. **«Frescura del piso» en palabras de tienda** (ley 4). Antes: el botón de la respuesta de «No se vende» dice el nombre del módulo. Después: «Ver todo
   el piso», con el nombre del módulo en su `title`. Se verifica con la ciega: que lo entienda.

**Lo que sobra (ley 8):** la leyenda de la tabla de la ficha en forma de píldoras parece botones; bastaría el punto de color con su palabra, sin fondo.
**Lo que Felipe no pidió y importa más:** en la ficha de algo que no se vende, la persona no encuentra qué hacer («no sé si el sistema me deja hacer
algo más»). Es lo que Felipe eligió (sin «Liquidar»: decide la persona), pero quizá convenga una línea que nombre sus caminos (rebajarla, mandarla a
otra tienda o esperar) sin empujar ninguno. Decide Felipe.

**Lista aparte (sin ejecutar):** «Movimientos» de la ficha y el chip «Datos confiables» a 24 px; el «− 60 +» no dice qué cambia en la lista; menos rojo
en las tarjetas de «Se acaba» (el número podría ir en tinta y solo la respuesta en rojo: va contra la maqueta elegida, decide Felipe).

### Los 3 cambios, hechos con el OK de Felipe («Sí, hazlos», 2026-11-21)
1. **Plazos:** «Se acaba» dice «cómpralos ya: se acaban en 2 semanas o menos» y «Qué pedir», «para la campaña: no te alcanzan hasta Navidad, en 34 días»;
   en «Hoy», los botones son «Comprar ya» y «Preparar el pedido». Las pestañas no cambiaron de nombre.
2. **La flecha:** «Comprar» y, por la misma regla (una función, una pieza), todo lo que lleva a otra pantalla («Comprar todas», «Bajar», «Bajar todos»,
   «Mandar a …», «Mandar todas», «Registrar ventas») pasó a `<BotonVer>`; el principal de la ficha sigue negro con la flecha a la derecha, como «Seguir»
   de Nuevo producto. En la tarjeta, «Comprar» va primero y «o pedir a …» después.
3. **«Ver todo el piso»** en vez de «Frescura del piso», con el nombre del módulo en su globito.

Medido otra vez (1440 claro y oscuro, 375): 0 desbordes, 0 blancos bajo 24 px nuevos, 0 fallas de contraste. El «!» de la tabla de la ficha sale con 1,02:1 a
375 px en el medidor de /color, pero en la captura se lee bien (círculo ámbar profundo con el signo en crema, ~7:1 a 1440): falso positivo del medidor.
La guía recorrida otra vez (escritorio y 375 oscuro, en verde); la huella cambia de pieza en 9 botones, no de función.

### Ciega repetida (Observado) — misma tarea, capturas nuevas
| Medida | Antes | Después |
|---|---|---|
| Lectura de 5 s | sí | sí |
| Primer intento / pasos | sí, 4 | sí, 4 |
| «Se acaba» frente a «Qué pedir» | no supo en qué se diferencian | **las distingue**: «lo que tengo y se termina pronto» frente a «lo que hay que pedir para la campaña» |
| «Comprar» | no supo si compra o lleva a otra pantalla | **sigue sin saberlo** («creo que se abre algo para hacer el pedido; no sé si compra directamente») |
| «Frescura del piso» / «Ver todo el piso» | no entendió la palabra | entiende que lleva a «la lista completa de lo que hay en la tienda», sin estar segura de a dónde |
| Dudas | 5 | 6 |

**Hallazgo nuevo:** en «No se vende» ve dos montos («S/ 1,692» en la respuesta y «S/ 1,332 parados» en el título de un grupo) y no entiende por qué son distintos
(el del grupo es solo «No se venden»; la respuesta suma también lo que se vende en otra tienda, lo dudoso y lo lento). También creyó, sin abrirla, que «Sin salir» es
lo mismo que «No se vende».

### Notas después
Ley 2: 8 (las dos preguntas ya se distinguen) · ley 4: 8 («Ver todo el piso» se entiende) · ley 3: 7 (los dos montos de «No se vende») · el resto igual.
**Total 7,8 · oficio 7.** Real: sin probar.

**Lo que sigue (sin ejecutar, decide Felipe):** que «Comprar» diga dónde lleva (p. ej. «Comprar en Compras» o «Ir a comprar») si la flecha no alcanza con
una persona real; el monto de cada grupo de «No se vende» como parte del total («de esto, S/ 1,332») o sin monto; «Ya no hay» en vez de días puede leerse como
otra cosa; y la línea con los caminos en la ficha de lo que no se vende.
