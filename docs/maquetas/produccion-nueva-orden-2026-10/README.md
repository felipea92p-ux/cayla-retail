# Spike · Nueva orden de producción — «el modelo primero» (2026-10-13)

> **Estado: aprobada por Felipe el 2026-10-13 (estructura, tipo y alcance) → [ADR-0396](../../adr/0396-nueva-orden-de-produccion-el-modelo-primero.md).** Lo que decidió: **D1 = A** (el modelo primero + ficha viva), **D3 = A** (tipo deducido, con interruptor), **alcance = A0–A7 en orden, con su OK entre actividades**, y **D2 = «para taller sí necesito que el terminal y líderes vean los costos, todo»** (el Taller y los líderes ven todos los costos; reabre D-G para el Taller y añade una migración de permiso, A4b: ADR-0396, «Costos»). D4 entra en A6; D5 sigue sin decidir. El resto de este documento es la propuesta tal como se le presentó. No toca `NuevaOrdenProduccionForm.tsx` ni ninguna pieza de `components/`. Sin migración: usa las mismas dos
> funciones de la base (`abrir_produccion`, `abrir_produccion_con_modelo_nuevo`).
> **Pedido (Felipe, 2026-10-13):** «analiza esto a profundidad, requiere muchas mejoras que ya aplicamos en otros módulos, pero sobre todo
> investiga cómo sería el óptimo proceso de registro y diseña algo mejor».

`index.html`: un solo archivo, ábrelo en el navegador (`preview_start maqueta-referentes` o `python3 -m http.server -d docs/maquetas 3031`
y `/produccion-nueva-orden-2026-10/index.html`). **Los datos son inventados. No es la implementación.** La barra punteada salta a un estado
(también por la URL: `#resumen`, `#boton`, `#nuevo`, `#taller`, `#listo`, y `#nuevo,oscuro` para el tema). Todo es tocable: buscar un modelo,
usar la sugerencia, escribir en la tabla (Enter baja, ↑ ↓ también), agregar colores, «Llenar todas con», plazos, abrir la orden y ver la tarjeta
caer en «Por cortar». Claro y oscuro, con los tokens reales de `globals.css` / `tema.css`.

Etiquetas de evidencia, como en `/formidable`: **[Medido]** (base o DOM), **[Código]**, **[Observado]** (en tus capturas), **[Opinión]**.

---

## 1. Lo que encontré

### 1.1 La pregunta de fondo: nadie ha usado este módulo todavía

**[Medido, `select` de solo lectura a producción, 2026-10-13]:** `producciones` = **0**, `insumos` = 0, `insumo_lotes` = 0, `comprobantes_produccion` = 0,
`proveedores_produccion` = 0, `cotizaciones_maquila` = 0. El Taller (4 colaboradores activos; 14 líderes) **nunca abrió una orden de verdad**. Dos consecuencias
que mandan sobre el diseño:

1. **No hay historial que aconseje.** La curva sugerida, «¿alcanza la tela?» y el costo medido necesitan ventas y órdenes cerradas; hoy las tres salen vacías.
   La hoja tiene que ser buena **sin** consejo, y el consejo tiene que entrar solo cuando dice algo. Hoy ocupa media pantalla diciendo que no sabe (captura 2).
2. **La ventana barata está abierta** (principio 5 de CLAUDE.md, y R-52 «qué no repetir de Alegra»: la fricción mata el uso). Rediseñar el registro ahora no migra
   nada ni rompe a nadie.

**[Medido]** La forma real del catálogo (232 modelos con variantes activas): **mediana 3 colores × 1 talla = 6 celdas; p90 = 12; máximo 26**; 57 modelos tienen un solo
color. La tabla de cantidades es **chica**: no necesita un widget de 95 colores siempre a la vista, necesita ser clara.

### 1.2 Lo que se ve en tus dos capturas

| # | Qué | Evidencia |
|---|---|---|
| 1 | **Antes de llegar a la matriz hay 8 controles y 6 bloques de texto**: dos selectores (Tipo, Modelo) con su pie cada uno, un aviso de 3 líneas, Nombre, Categoría, Precio, y Colores (buscador + «Ver los 95» + «+ Nuevo color») con dos frases rojizas | [Observado] captura 1 |
| 2 | Los dos selectores del tope **compiten con el mismo peso** (dos filas de pestañas con raya roja) y ninguno dice qué va a pasar: «Muestra», «Ya existe», «Modelo nuevo» se leen como jerga. Es una matriz 2×2 donde 3 de las 4 combinaciones casi no existen | [Observado]; la prueba ciega de `/formidable` dudó justo ahí |
| 3 | «Nombre del modelo» con su halo «SIGUE AQUÍ» queda **más alto que «Categoría»** (el halo reserva un espacio vacío debajo) y «Precio» arranca a 20 px de él: la fila se ve torcida | [Observado] |
| 4 | **«Precio a tienda (C/U)»** ocupa todo el ancho con un número de 6 caracteres; y dice «a tienda» mientras la barra de abajo dice «se vende a». «C/U» fue palabra no entendida | [Observado]; `ModeloNuevoCampos.tsx:141` |
| 5 | «Colores» es el único título en negrita normal (los demás son versalitas), su ayuda y «Todavía ninguno…» van en tono rojizo aunque nada es un error, y el buscador corta su texto («petró…») | [Observado] |
| 6 | **El motor de demanda repite la misma frase tres veces** (AQP, LIM, TRU) con jerga operativa («cuadrar el piso y contar el almacén»): un diagnóstico interno al que esta hoja no puede responder | [Observado] captura 2 |
| 7 | «¿Alcanza la tela y los avíos?» es una tarjeta entera para decir que **no hay datos** | [Observado] |
| 8 | **Tres campos grandes de dinero** (Tela, Avíos, Maquila), «Opcional», que se **sobrescriben solos** al descontar insumos de la orden (ADR-0133, F3) y que el Taller **no puede ni leer de vuelta** (D-G / F4e) | [Código] `NuevaOrdenProduccionForm.tsx:684-690`: sin condición de rol |
| 9 | Con el scroll al final, el pie fijo (Falta + frase + 2 botones) **tapa el combo «Responsable»**: solo asoma «Eres admin…» | [Observado] captura 2 |
| 10 | «Fecha de entrega» muestra la de hoy (13/10/2026): `abrir_produccion` solo la guarda, **no valida nada** | [Observado]; [Código] `20260915130000…sql` |

### 1.3 Lo que dice el código y la documentación (sin repetir `/formidable`)

- La hoja mide 672 px de ancho y ~2.000 px de alto: **el pedido, el consejo, el costo y la confirmación viven en una sola columna**, y la prenda nunca aparece (ley 5 = 4;
  `docs/formidable/produccion-nueva-orden.md` ya lo pidió como «largo plazo (L): una ficha viva de la prenda con la hoja más ancha, pide un ADR»). **Esto es esa propuesta.**
- La matriz de cantidades es **una tabla escrita a mano** (`<input type="number">` con `unificar-fijo`, líneas 472-535) mientras Nuevo producto ya tiene `MatrizCantidades`:
  «Llenar todas con», total por fila, por columna y general, la celda quitada rayada, el color con identidad (ADR-0285 / `matriz-color-identificacion-2026-10`), teclado.
  Es el caso exacto que ADR-0358 («una función, una pieza») prohíbe.
- **Producción nunca decide qué producir: lo decide Resumen.** Las tarjetas «Abrir orden sugerida» ya abren la hoja con `?nueva=<modelo>`, o sea que **el modelo y el tipo ya
  están contestados**; la hoja igual pregunta Tipo y Modelo primero. Y no hay camino de vuelta de una **muestra terminada** a «producir este modelo» (en `OrdenPanel.tsx` el
  enlace «Llevarlas a las tiendas» existe solo para lotes): el ciclo Muestra → aprobación → Producción, que es el proceso real (R-29, ETAPAS_MUESTRA), no está en el sistema.

### 1.4 Lo que otros módulos ya resolvieron y esta hoja no tiene

| Pieza o regla | Dónde ya está | En «Nueva orden» hoy |
|---|---|---|
| Buscar primero, con foto, y crear al pie del buscador | Vender (`Buscador`), Nuevo producto (`ComboBuscable crearArriba`), ADR-0260 | `CampoSelect` de 234 modelos, solo texto |
| La prenda se ve (`MosaicoPrenda` / `MiniaturaPrenda`, ADR-0333) y la ficha de lo que se va a crear (`FichaPrevia`) | Nuevo producto, Apartados, vista rápida | **No aparece nunca** |
| Una tabla talla × color con totales, «Llenar todas», rayado, color con identidad | `MatrizCantidades` | tabla a mano |
| Tallas y colores: nunca más de 5–6 a la vista, el resto tras «Ver todos» | ADR-0260 | carta de colores entera (cerrada solo desde el 10-oct) |
| Una identidad, una vez («Quién registra») sin tapar nada | ADR-0285 | combo bajo el pie fijo |
| Una nota que explica es `nota-cayla`; un error de la hoja, `Aviso`; sin rojo en un camino | ADR-0169, ADR-0284 | texto rojizo suelto, 6 rojos (límite 2) |
| Pestañas = cambiar de sección; segmento de modo = mostrar lo mismo de otra forma; **un valor de formulario no es ninguna de las dos** | ADR-0358 | dos `Segmentado` con raya roja |
| Lo difícil a un toque, no al pasar el mouse (ley 6) | `/formidable` | el porqué del «Falta» ya se ve; «¿por qué esa curva?» sigue plegado en `<details>` |

---

## 2. Cómo se registra bien una orden (la investigación)

**Industria** (fuentes: [Katana MRP — crear una orden de manufactura](https://support.katanamrp.com/en/articles/5914365-creating-a-new-manufacturing-order),
[disponibilidad de ingredientes](https://support.katanamrp.com/en/articles/5914374-ingredients-availability),
[costos](https://support.katanamrp.com/en/articles/5914362-manufacturing-costs-for-products); y, **una sola fuente de un proveedor**, no un estándar,
[ERPNext Garment & Apparel](https://ecosire.com/apps/erpnext/erpnext-garment-apparel-manufacturing)):

- En Katana el orden es **qué (producto) → cuánto (cantidad) → ¿alcanza? (insumos) → para cuándo → costo**: el producto es la primera pregunta y no hay un «tipo» previo (hay dos formas de crearla, pero según de dónde sales, no una pregunta al entrar).
- **El costo no se teclea: se calcula** (receta × costo medio de los insumos + operaciones) y una orden abierta es **una estimación que se recalcula al terminar** con lo realmente consumido. Es
  lo que ya decidió CAYLA (ADR-0133, decisión 4: «el costo sale del consumo real, no de un campo tecleado»; D-31), pero la hoja siguió pidiéndolo «hasta que el Taller cargue sus insumos».
- La disponibilidad de insumos es un **estado de una palabra** (en stock / esperado / no hay) con la fecha en rojo si no llega: un veredicto, no un informe.
- En prendas, la entrada es una **cuadrícula talla × color donde cada celda es una variante real** (así el stock y el costo quedan nativos), con «curva de tallas» para repartir un total; y
  las reglas de negocio se validan antes de confirmar (que cuadre contra la curva). CAYLA ya tiene las dos: variantes reales (`abrir_produccion` solo acepta las existentes) y la curva
  sugerida por talla.

**Lo que es solo de CAYLA y manda más que la industria:**

| Hecho | Fuente | Qué obliga |
|---|---|---|
| Se fabrican pocos lotes; cada uno compromete tela y maquila de verdad | R-29, R-30 | es un momento de **decisión**, no de captura: optimizar confianza, no teclas |
| Una muestra no entra al stock y tiene otras etapas; el escalado define las tallas | `ETAPAS_MUESTRA`, ADR-0361 | el tipo cambia lo que ocurre, pero **se deduce del modelo** casi siempre |
| Quien opera el Taller no ve dinero | D-G, F4e | la hoja del Taller **no puede pedir dinero** |
| Quien decide qué producir es el líder, con datos de la red | F5, F6 | el consejo es del líder y entra **por el mismo camino** que ya existe (Resumen → `?nueva=`) |
| La curva y el motor hoy no tienen datos | §1.1 | el diseño sin consejo es el diseño base |
| «La coma solo se explica, no se acepta» (Felipe 2026-10-10) | ADR-0361 | la maqueta **no** convierte «89,90» en 89.90 |

### Los seis principios que salen de ahí

1. **El modelo es la pregunta; el tipo se deduce.** Elegir un modelo existente → *Lote*; «crear uno nuevo» → *Muestra*. Se puede corregir con un interruptor de dos opciones que dice, en una línea, qué cambia. Desaparecen las dos filas de pestañas.
2. **La tabla es el pedido.** Un modelo nuevo no pide «tallas → colores → y después aparece la matriz»: las tallas son chips y los colores son filas que se agregan en la propia tabla.
3. **Lo que se calcula no se teclea.** El costo es un estimado con su procedencia («medido con la última orden cerrada») que se acepta de un toque; sin datos, una línea honesta y el campo plegado. El Taller no lo ve.
4. **La prenda a la vista.** Una ficha viva a la derecha: la prenda, cuántas son, a cuánto se vende, para cuándo, y la única acción. Responde «¿qué estoy abriendo?» mientras se arma.
5. **El consejo cabe en una línea y se pide con un toque.** «La red sugiere 33 prendas para 30 días · ¿Por qué? · Usar». Los días a cubrir y la segunda opinión del motor viven dentro del «¿Por qué?», **una frase por causa, no una por tienda**. Sin datos: nada.
6. **Un camino, tres entradas.** Resumen («Abrir orden sugerida») llega con modelo y sugerencia; el botón llega vacío (buscar primero, «Se están acabando» arriba); y —lo que falta hoy— una muestra terminada ofrece «Producir este modelo».

---

## 3. Hoy vs propuesta

| | Hoy (1440 × 900) | Propuesta (medido en esta maqueta, 1440 × 900) |
|---|---|---|
| Ancho de la hoja | 672 px, una columna | ~1080 px: el pedido a la izquierda, **la ficha viva a la derecha, fija** |
| Controles antes de la tabla (modelo existente) | Tipo y Modelo (2 segmentos, cada uno con su pie) + el combo de modelos | **3**: «Cambiar» y el interruptor Lote / Muestra |
| Del nombre a «Cuántas…» en «Modelo nuevo» | **413 px** tras los arreglos del 10-oct (**1.199** antes) [Medido, `/formidable`] | **272 px** [Medido] |
| ¿Cabe sin scroll? | no: ~2.000 px de contenido | **modelo existente: sí** (788 de 787 px); modelo nuevo: +29 px sin color y +125 px con 3 colores, pero **el botón vive en la ficha fija**, siempre a la vista; colaborador del Taller: 616 px |
| Rojo visible | 6 (límite 2) | **0** |
| La prenda | nunca aparece | foto/color, nombre y cifras, siempre |
| Costo | 3 campos de dinero, abiertos, para todos | **una línea**; el líder lo acepta de un toque o lo abre; **el Taller no lo ve** |
| Consejo de la red | 3 bloques que ocupan media pantalla, incluso sin datos | 1 franja de 50 px; sin datos, una frase o nada |
| Entrega | calendario del navegador | «1 semana · 2 semanas · 1 mes · otra fecha» y qué día cae |
| Pie / responsable | pie fijo que tapa el combo | el responsable y los botones viven **en la ficha**, sin pie fijo |

### Qué cambia por zona (y por qué)

- **Modelo.** Buscador con la lupa del sistema (`/`), filas con la prenda (miniatura = el color y la percha de su categoría, ADR-0333), «Se están acabando» arriba para el líder (lo
  que ya calcula el Resumen) y «Recientes» para el Taller; al pie, **«+ Crear «blu» como modelo nuevo»**. Elegido, el modelo queda como una tarjeta con «Cambiar». *Reemplaza* los dos
  segmentos y el aviso azul («Se crea en el catálogo…»: lo que ocurre al crear está en el pie de la fila).
- **Modelo nuevo.** Nombre (el ejemplo sigue la categoría, ADR-0290), Categoría, Precio de venta (compacto, con «opcional» si es muestra) y las tallas como chips con las habituales marcadas.
  Los colores **se agregan desde la tabla** (`+ Agregar color`: buscador con muestras, «Ver los 95 colores», «+ Nuevo color»); sin ninguno, una fila «Sin color». El precio se llama
  **«Precio de venta»**, no «a tienda (C/U)».
- **Cuántas prendas.** Una sola tabla: color con su muestra de 20 px, talla, total por fila, por talla y general, «Llenar todas con», la celda que no existe rayada (tocarla dice por qué y dónde
  se agrega), Enter / ↑ ↓ para bajar. **La sugerencia es el número fantasma de cada celda** y una franja la aplica de un golpe.
- **Entrega y nota**, una fila, «Opcional» una sola vez en el título del grupo.
- **Costo estimado** (solo líder), plegado: con historial, «≈ S/ 38.40 por prenda, medido con la última orden cerrada de este modelo · Usar este costo»; sin historial, «Sin estimar todavía: el
  costo real se mide al cerrar la orden». «Poner otro / Poner un costo estimado» abre Tela, Avíos y Maquila. Es lo mismo que hoy, **detrás de un toque**, y sin dinero para el Taller.
- **La ficha viva.** Prenda, nombre, chips («Lote de producción», «Modelo nuevo»), **cuántas prendas** en grande, a cuánto se vende, (líder) costo, margen con su palabra («Gana / Al filo / Margen
  bajo», la regla de siempre) y «Tela y avíos: alcanzan ✓» cuando hay medida, entrega, **«Siguiente: …» tocable con su frase a la vista** (la guía de foco, ADR-0284), «Abre: [responsable]» y los botones.
  Bajo 980 px se vuelve una barra pegada abajo.

### Lo que **no** cambia (contratos que la implementación debe respetar)

- Las dos funciones de la base y **su misma carga útil** (`paramsRpcModeloNuevo`, `lineas`), el token de idempotencia y la marca síncrona `enVuelo`, «¿Salir sin guardar?»
  (`useSalidaSinGuardar`) y el responsable firmado (`useResponsable`, `firmar`).
- La coma: **solo se explica** («Escribe el precio con punto, por ejemplo 109.90»); en la maqueta «89,90» deja «Falta: precio» con esa frase a la vista.
- Las reglas de `lib/modelo-nuevo-reglas.ts` (55 pruebas) y `camposDeGuiaOrden`: la guía sale de lo que la base ya rechaza.
- Margen y semáforo: solo el líder, mismo umbral, mismo precio (el más bajo de cualquier tienda, ADR-0370).

---

## 4. Lo que verifiqué en esta maqueta (no es lo mismo que la implementación)

- Navegador integrado, 1440 × 900 y 1024 × 768, claro y oscuro; **0 errores de consola**; sin scroll horizontal a 1024.
- Cuentas: editar una celda de 8 a 10 pasa el total de 33 a 35 y cuadran fila, columna y general; el cursor **no se pierde** al teclear; la sugerencia a 15 días da 13 prendas.
- «Modelo nuevo»: nombre → categoría → tallas habituales → colores (buscador: «ter» → Terracota) → «Llenar todas con 6» → 36 prendas; pasar a *Lote* **exige** precio; «89,90» se explica y no se acepta.
- Abrir la orden: cierra la hoja, suma una orden y sus prendas al tablero, la tarjeta nueva cae en «Por cortar» con el destello verde y sale el aviso con «Ver la orden».
- Teclado: Enter y ↓ bajan por la tabla, ↑ y Shift+Enter suben, «/» enfoca el buscador; Escape cierra primero la lista abierta y después la hoja (regla de `useEscapeLibre`).
- **No verificado:** nada con la base real, nada de `abrir_produccion`, ningún colaborador del Taller real, el teclado completo de la tabla con lector de pantalla, ni 375 px
  (Producción es de escritorio). La nota de la ley 1 de `/formidable` **no sube** hasta correr la pasada con 3 a 5 colaboradoras.

---

## 5. Decisiones que son tuyas

| # | Decisión | Mi recomendación | Por qué es tuya |
|---|---|---|---|
| **D1** | **Estructura de la hoja.** A: «el modelo primero», hoja ancha con ficha viva (esta maqueta). B: conservar la hoja angosta y arreglar solo lo medido. C: pasos con puntos, como Nuevo producto. | **A** | Cambia el ancho de una hoja que usa el Taller. Con C, un lote de un modelo existente tendría 2 de 4 pasos vacíos. |
| **D2** | **Costos al abrir.** A: plegados para el líder y **fuera** para el Taller. B: plegados para todos. C: como hoy. | **A** | Toca qué dinero ve y escribe el Taller (D-G): permisos y dinero son tuyos. |
| **D3** | **Tipo de orden.** A: se deduce del modelo (nuevo → Muestra, existente → Lote) y se corrige con un interruptor. B: una pregunta explícita arriba con tarjetas. C: como hoy. | **A** | Una muestra sobre un modelo existente (re-muestrear) sigue siendo posible; cambia qué se pregunta primero. |
| **D4** | **«Producir este modelo» al terminar una muestra** (el puente Muestra → Producción). | **Sí**, como enlace en el panel de la orden, solo web | Hoy el sistema no conoce ese paso; es de negocio, no de pantalla. |
| **D5** | Dos cosas que **no** propongo tocar sin ti: (a) qué parte se **terceriza** (corte, confección, acabados) elegida **al abrir** y no después con `set_etapa_produccion`, que además daría la tarifa de maquila desde `cotizaciones_maquila` (existe, 0 filas); (b) los `CHECK` de `variantes` y `producciones` que dejan pasar `NaN`. | Pregunta para después | (a) es modelo de datos y dinero; (b) es el núcleo (principio 1). |

---

## 6. Plan por actividades (si apruebas D1–D4) — `/construir`, un commit cada una, **sin migración**

| # | Actividad (corte vertical) | Cómo se verifica |
|---|---|---|
| A0 | `pnpm reservar adr` + ADR de lo que decidas; fila en `SESIONES-ACTIVAS.md` (la sesión de Órdenes de insumos del Taller toca la misma zona: coordinar) | el CI no marca la reserva |
| A1 | **El modelo primero:** `ElegirModelo` (buscador + miniaturas + «Se están acabando» desde `decision` + «Crear…»), tarjeta del modelo, tipo deducido; fuera los dos `Segmentado`, el aviso azul y el `CampoSelect` | `?nueva=<modelo>` abre sin preguntar tipo; prueba pura de la deducción; ciego |
| A2 | **La tabla única:** reutilizar el molde de `MatrizCantidades` para las cantidades de una orden; «+ Agregar color» y chips de tallas para un modelo nuevo; fuera la tabla a mano y su `unificar-fijo` | la carga útil al RPC es **idéntica** (prueba de paridad); `modelo-nuevo-reglas.test.ts` (55) verde; Tab / Enter |
| A3 | **Hoja ancha con ficha viva:** `Modal variante="hoja" ancho="max-w-5xl"`, `FichaOrden` fija con responsable y botones; fuera `pie-hoja-fijo` | 1440 × 900 sin scroll en el camino común; 1024; la guía de foco sigue coincidiendo con la validación |
| A4 | **Consejo integrado:** franja de una línea + «¿Por qué?» (días y segunda opinión del motor, una frase por causa); «alcanza la tela» como línea de la ficha y solo con medida; costo plegado según D2 | sin datos de red no se pinta nada extra; `produccion-decision-reglas.test.ts` |
| A5 | **Entrega y palabras:** plazos, «Precio de venta», «lote» (no «corrida»), una sola «Opcional» por grupo | `/sugerir`; ciego sin dudas de vocabulario |
| A6 | **Después de abrir:** aviso con «Ver la orden», tarjeta nueva marcada (`data-recien`) y, si D4, «Producir este modelo» en una muestra terminada | `?orden=<id>`; la tarjeta aparece resaltada |
| A7 | **Cierre:** `/focus`, `/guia` (la huella de `prod-orden-nueva.*` cambia: aceptar **después** de revisar), `/sugerir`, **`/chaos`** (la hoja guarda), `/formidable` (remedir, ciego, y 3 a 5 colaboradoras), `tema:auditar` claro y oscuro, `/unificar`, `/abrir-pr` | todas las tablas de contadores bajan o quedan igual (no suben) |

Riesgo principal: **A2** (la tabla es lo que se manda a la base). Se acota con la prueba de paridad de la carga útil y manteniendo `celdasDelBorrador` como única fuente.

---

## 7. Lo que no sé

- **Cómo usa una colaboradora real del Taller esta hoja.** Ninguna lo ha hecho (0 órdenes). La maqueta apuesta por lo que dicen la industria, el código y la ciega de Opus; la ley 1 solo se confirma con personas.
- **Si «Se están acabando» debe salir del Resumen tal cual** (modelos que se agotan sin orden abierta, F6) o de otra regla: lo uso porque ya existe y desaparece solo, pero es una decisión de qué se le muestra primero al líder.
- **Si el Taller escribe o no el precio de venta de un modelo nuevo.** ADR-0361 ya lo aprobaste («precio obligatorio en una producción, opcional en una muestra»); esta maqueta lo respeta, y lo deja a la vista.
