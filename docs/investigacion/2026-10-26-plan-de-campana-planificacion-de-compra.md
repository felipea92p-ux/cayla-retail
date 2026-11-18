> **Nota de procedencia (2026-10-26):** informe de un agente de investigación (solo lectura, búsquedas genéricas de industria; ningún dato de CAYLA salió a la web). Las etiquetas VERIFICADO / REPORTADO / SECUNDARIO / OPINIÓN son las del agente. Lo que se decide con esto vive en `docs/pantallas/compras-plan.md` y en los spikes `docs/maquetas/plan-campana-vision-2026-10/`.

# Planificación de compra por campaña: de la categoría a la prenda y el color (investigación A)

- **Fecha:** 2026-10-26 · **Para:** rediseño de «Plan de campaña» (Compras) · **Solo lectura:** no se tocó el repo; las búsquedas fueron genéricas de industria, ningún dato de CAYLA salió a la web.
- **Continúa, sin repetir:** `docs/investigacion/2026-10-05-algoritmo-de-inventario.md` y `…como-deciden-el-mix-zara-gap-lvmh-ralph-lauren.md` (Zara/Caro-Gallien, vendedor de diarios, encogimiento n/(n+k), demanda censurada, regla del 90 % de venta identificada).
- **Etiquetas:** VERIFICADO = abrí la fuente y leí lo que afirmo · REPORTADO = lo dice un resumen o el buscador, no abrí el texto · SECUNDARIO = lo cuenta un blog o un curso, no la fuente primaria · PROPIO = cálculo mío (el script está en el scratchpad, no en el repo) · OPINIÓN = juicio mío, no respaldado por una fuente.
- **Citas:** parafraseo; las fórmulas se dan tal cual porque son hechos, no texto.

---

## 0. Resumen en diez líneas

1. **Todas las herramientas serias separan dos preguntas en dos pasos:** primero «cuánto dinero/unidades por categoría» (plan financiero, arriba-abajo) y después «qué estilos y colores» (surtido, abajo-arriba); y el segundo se concilia contra el primero. Oracle, Blue Yonder, Toolio y Anaplan lo dicen casi con las mismas palabras (§1).
2. **El paso 2 casi nunca pronostica una prenda nueva con su historia:** la compara con «comparables» (Nextail, Oracle RDF, Blue Yonder) y propone; la persona aprueba o corrige. Eso es lo que CAYLA necesita porque sus modelos no se repiten (§3).
3. **Necesidad neta = lo que se espera vender (más el colchón) − lo que ya hay sin contar lo no vendible − lo que ya viene.** Lo apartado, dañado o en cuarentena se trata con una sola regla en los dos lados de la cuenta (§2).
4. **Con pocos datos, el error no es de método, es de ruido:** una celda con 10 ventas tiene ±32 % de error relativo solo por azar (1 sigma). 30 ventas dan ±30 % al 90 %; 100 dan ±16 %; 271 dan ±10 %. De ahí sale un criterio de «datos suficientes» que se puede explicar (§3.3 y §3.4).
5. **Ninguna fuente da un mínimo universal de historia.** Lo que sí hay: dos años para estacionalidad (PeopleSoft/Oracle), tres (Nextail), 200 unidades al año para confiar en la curva de talla propia (Nextail), y «modelos de más de 1–2 parámetros dan malos pronósticos con series cortas» (FPP3).
6. **El plan corregido por presupuesto no es un recorte proporcional.** La solución clásica (Hadley y Whitin) sube el costo efectivo de cada prenda por el mismo «precio sombra» del presupuesto; se recortan primero las líneas que rinden menos por sol invertido (§5).
7. **Comparar «plan actual vs plan corregido» lado a lado** es práctica de Toolio (escenarios en la misma grilla), Oracle (versiones Wp/Op/Cp con aprobación) y Anaplan (versiones comparables). Restaurar una versión debe crear una versión nueva, no pisar (Google Sheets advierte que restaurar borra el historial fino de ediciones) (§5.3).
8. **Dejar editar la sugerencia sube la adopción** (Dietvorst 2018), **pero los ajustes chicos suelen empeorar el pronóstico y los ajustes al alza son los peores** (Fildes 2009, 60.000 pronósticos): hay que permitir editar y a la vez medir quién acertó (§6).
9. **Mostrar rangos en números mantiene la confianza mejor que una advertencia en palabras** (Winton Centre / PNAS 2020): el aviso «los datos aún no son exactos» funciona mejor como rango + «basado en N unidades» que como letra chica.
10. **Lo débil:** no encontré método publicado para repartir color con poca historia, ni mínimos de prenda por color más allá de blogs de fábricas, ni detalle estilo/color de Toolio, Anaplan, Board o Lectra (§7).

---

## 1. El plan en dos pasos: cómo lo estructuran las herramientas

### 1.1 Qué dice cada una (lo que pude abrir)

| Herramienta | Paso 1: categoría (plata/unidades) | Paso 2: estilo/color | Qué confirma la persona | Qué se calcula solo | Estado |
|---|---|---|---|---|---|
| **Oracle Merchandise Financial Planning (MFP)** | Tres roles: arriba-abajo (grupo/mes), medio (departamento/semana), abajo-arriba (subclase/semana). El de arriba pasa «targets» al de abajo, que arma el plan y lo manda a aprobar. Medidas: ventas, bajas de precio, recepciones, inventario, rotación, margen bruto y open-to-buy. | — (es otro módulo) | El planificador de abajo propone; el del medio aprueba o rechaza. Solo el plan aprobado se vuelve oficial (Original Plan en pre-temporada, Current Plan en temporada). | «Spreading» (un cambio arriba se reparte hacia abajo) y «aggregation» (lo de abajo suma hacia arriba). | VERIFICADO: https://docs.oracle.com/cd/E12477_01/merchfinplan/pdf/141/html/rug-cc/introduction.htm |
| **Oracle Assortment Planning (AP)** | Debe alinearse con el MFP «para que la inversión en inventario sea financieramente viable y de riesgo aprobado». Usa las ventas del año pasado por punto de venta para repartir el MFP hacia abajo. | Lista de compras (nº de estilos), «cuña» por grupo de tiendas (estilo-color por clúster, objetivo de nº de opciones), curvas de venta semanal, plan de compra («la cantidad de compra se planea con la meta de ventas y el % de sell-through»), y reparto por talla/pack, que es opcional. | El comprador marca qué opciones entran, cuáles son obligatorias, elige hasta 3 atributos clave y puede cambiar el ranking. Ve la desviación contra la meta. | Ranking automático de opciones, unidades y ritmo de venta recomendados, comparación del total de compra contra la meta. «Seed Target Mix» arranca la mezcla desde el año o el surtido anterior. | VERIFICADO: https://docs.oracle.com/cd/E75762_01/assortplan/pdf/1411/html/ug/ap-ug-introduction.htm y https://docs.oracle.com/cd/E75975_01/pdf/190/html/apofsl/user_guide/output/build_wedge.htm |
| **Blue Yonder** | MFP decide «cuánto gastar»; la meta de arriba la fija la dirección y la suma de los planes de categoría de abajo debe igualarla. | El surtido decide «qué comprar» (estilo, color, marca). En Intelligent Allocation, los productos nuevos se pronostican por atributos (tela, manga, color) contra productos parecidos del pasado. | La persona interviene solo en excepciones («excluir Florida de la asignación de abrigos»). | Plan recomendado completo. | VERIFICADO: https://info.blueyonder.com/retail-planning-category-management/what-is-merchandise-financial-planning y …/what-is-blue-yonder-intelligent-allocation |
| **Toolio** | Metas arriba-abajo (ventas, margen, inventario) por canal, categoría o ubicación, reconciliadas con el plan abajo-arriba; se siembra desde historia y se prueban escenarios lado a lado. | No lo pude confirmar (la página de «hierarchy» del centro de ayuda dio 401). | — | OTB que se recalcula cada semana con ventas y recepciones (resumen de buscador). | VERIFICADO el sitio comercial: https://toolio.com/in-season-pre-season-planning · REPORTADO lo demás |
| **Nextail** | (módulo Buy) | Cantidades por familia, subfamilia y SKU con desglose por talla; pronóstico a partir de «comparables» (parecido visual y por atributos, precio, lugar en el catálogo). Usa las primeras X semanas de los comparables o sus 3 mejores semanas. | Supervisan los comparables; ajustan parámetros después del pronóstico base: sell-through esperado, unidades a llevar a la próxima temporada (se restan de la cantidad recomendada) y mínimo de exhibición por talla y tienda (se suma). | Mezcla de varios comparables, ajuste por estacionalidad, red de tiendas y efecto del surtido. «Normalmente no se manda todo el stock de una vez»: el pronóstico por comparables es menos exacto que el de ventas reales. | VERIFICADO: https://help.nextail.co/en/legacy/first-allocation-algorithm-part-i-forecast y https://help.nextail.co/en/legacy/parameters-impacting-the-demand-forecast |
| **RELEX** | Metas de margen, ventas y surtido; OTB en tiempo real. | Modelos «agrupados» para productos nuevos. No hay detalle estilo/color en las páginas que abrí. | — | Avisos de sobregasto. | VERIFICADO (poco): https://www.relexsolutions.com/resources/mastering-seasonal-planning/ y https://www.relexsolutions.com/resources/open-to-buy/ |
| **Anaplan, Board, Lectra** | Marketing: metas arriba-abajo con análisis abajo-arriba, hasta SKU/tienda; grupos de surtido por atributo (color, temporada). | Sin detalle de mecánica. | — | — | REPORTADO (folletos): no me sirven como evidencia. |

### 1.2 Un ejemplo real de «plan de opciones» (una casa de moda en India)

El paper de IBM Research India (AI4FashionSC 2020, texto completo leído) describe cómo trabaja una casa de moda que usa su herramienta: cada temporada parte de un **plan de opciones** con las categorías, el **número de estilos (amplitud)** y las **unidades por estilo (profundidad)**, separado por tres rangos de precio. El 80 % del presupuesto se reparte así: 75 % moda comercial, 20 % moda de tendencia, 5 % básicos que no se acaban (NOOS); **otro 20 % del presupuesto se reserva para reposiciones en temporada** de lo que se agotó. El comprador elige entre los diseños presentados según su estimado de venta y arma la hoja final de pedido, y la profundidad por estilo se decide mirando el mínimo de orden del proveedor. VERIFICADO (una sola empresa; es un ejemplo, no una norma): https://arxiv.org/abs/2008.07376

### 1.3 Lo que se repite en todas (y sirve a CAYLA)

1. **Dos preguntas distintas:** «cuánto gasto en esta categoría» y «con qué prendas y colores». El segundo paso nunca puede romper el primero: se **concilia** (Oracle: «la suma de planes abajo-arriba debe igualar la meta arriba-abajo», Blue Yonder lo dice igual).
2. **El paso 2 arranca de una propuesta sembrada con historia** (Oracle «Seed Target Mix» desde el año o el surtido anterior; Toolio «sembrar desde historia y re-tendencia»), no de una hoja en blanco.
3. **El número que une los dos pasos es el sell-through esperado** (Oracle: la cantidad de compra sale de la meta de ventas y el % de sell-through; Nextail: el mismo parámetro; en CAYLA, equivale al «% de recupero» y al cuantil crítico que el líder ya llena).
4. **Se compra en tandas** (Nextail: no se manda todo de una vez; el caso de India reserva 20 % del presupuesto para reponer; Fisher y Raman §3.2).
5. **La persona decide lo que importa y el sistema se encarga de lo repetitivo:** el comprador aprueba o cambia (Oracle RDF tiene «Aprobar sistema / Aprobar mi cambio» explícito, §3.1).

---

## 2. «Necesidad neta» y stock actual

### 2.1 Las fórmulas que usan

Todo en la misma base (precio de venta o costo, nunca mezclados).

| Fórmula | Fuente | Estado |
|---|---|---|
| OTB = (ventas planeadas + rebajas planeadas + inventario final planeado) − (inventario inicial + compras ya hechas/en camino). Un resultado negativo = sobrestock, no comprar. | Lightspeed: https://www.lightspeedhq.com/blog/open-to-buy-in-retail/ | VERIFICADO (blog de un proveedor, no un manual) |
| Recepciones (OTB) = ventas + rebajas + inventario final − inventario inicial (esta versión no resta lo ya pedido). | Blue Yonder: https://info.blueyonder.com/retail-planning-category-management/what-is-merchandise-financial-planning | VERIFICADO |
| OTB = presupuesto − (inventario ya entregado este período + recepciones planeadas de órdenes abiertas). Si un envío se atrasa se reasigna al presupuesto del mes en que llega. | RELEX: https://www.relexsolutions.com/resources/open-to-buy/ | VERIFICADO |
| OTB = recepciones planeadas − neto de órdenes abiertas. | Oracle MFP en temporada | REPORTADO (resumen del buscador; no abrí la página) |
| Cantidad de compra = meta de ventas con el % de sell-through esperado; se restan las unidades que se arrastran de la temporada anterior; se suma el mínimo de exhibición por talla y tienda. | Oracle AP «Plan Buy Quantity» (verificado vía la guía del wedge) + Nextail parámetros | VERIFICADO (descripción; la fórmula exacta de Oracle no la vi) |
| Cobertura en semanas = stock ÷ ventas de los últimos 28 días × 4. No dicen si el stock incluye lo que viene en camino. | Nextail: https://help.nextail.co/en/how-do-you-calculate-the-coverage-in-weeks | VERIFICADO |
| Cobertura con meta por categoría o temporada, y columnas «+1, +2, +3 semanas» que suman las recepciones esperadas. | LS Central: https://help.lscentral.lsretail.com/Content/LS-Retail/Replenishment/Stock-Coverage/Stock-Coverage.htm | VERIFICADO (la fórmula escrita en su ayuda parece invertida; úsala solo como estructura de pantalla) |
| Stock básico, variación porcentual, semanas de suministro, ratio stock/ventas | Cursos de retail (Lumen, PVM = stock promedio × ½ × (1 + ventas del mes ÷ ventas promedio)) | SECUNDARIO |

Lo que cambia entre ellas es solo el horizonte (mes contra campaña) y qué entra en «ya tengo». Para una campaña única de CAYLA, la cuenta natural es **la de unidades** (§2.3), con el OTB en soles como tope (§5).

### 2.2 Qué cuenta como stock disponible

El modelo más claro que encontré es el de Shopify (ayuda oficial). VERIFICADO: https://help.shopify.com/en/manual/products/inventory/managing-inventory-quantities/inventory-states
- **Disponible (available):** lo que se puede vender.
- **Comprometido (committed):** unidades apartadas que no se pueden vender (un pedido ya hecho).
- **No disponible (unavailable):** apartado por apps o retenido por otras razones. En la documentación para desarrolladores (resumen del buscador, REPORTADO) incluye dañado, control de calidad, reservado y stock de seguridad.
- **En mano (on hand):** todo lo que hay físicamente = disponible + comprometido + no disponible.
- **En camino (incoming):** no está físicamente; no se puede vender hasta que se recibe y pasa a disponible.

Traducido a CAYLA (OPINIÓN, la decisión es de Felipe): la **cuarentena y lo dañado** nunca entran a «stock libre» (no se pueden vender ni lo van a ser). **El apartado** es el caso delicado: si la historia de ventas cuenta el apartado cuando se concreta (como venta), la demanda ya lo incluye, y restarlo además del stock lo cuenta dos veces. La regla es una sola vez, y debe quedar escrita en el plan: o «el apartado vive en el stock y en la demanda» o «sale de los dos». Lightspeed advierte que un inventario inicial mal contado arruina toda la cuenta; DeHoratius y Raman (ya en la investigación del 10-05) encontraron 65 % de registros de stock inexactos en una cadena grande.

### 2.3 Ejemplo numérico (PROPIO, números inventados)

Categoría «blusas», campaña de 8 semanas. Escenarios del líder: flojo 40, normal 60, bueno 90, con probabilidad 25 / 50 / 25 %. Margen por unidad 30, pérdida si sobra 10 → razón crítica 30 ÷ (30+10) = 0,75. Probabilidad acumulada: 0,25 hasta 40; 0,75 hasta 60 → **objetivo = 60 unidades** (primer escenario que alcanza 0,75).

Stock hoy: 25 unidades en sedes y taller; 4 apartadas; 3 en cuarentena/dañadas; 10 en una orden de compra abierta.

| Cómo se cuenta | Libre | Compra neta |
|---|---|---|
| Sin mirar nada (usa lo físico: 25) | 25 | 60 − 25 − 10 = **25** |
| Quita cuarentena y apartado, pero la demanda de 60 ya incluye el apartado (doble conteo) | 18 | 60 − 18 − 10 = **32** (compra 4 de más) |
| Quita solo cuarentena; el apartado vive en stock y demanda (consistente) | 22 | 60 − 22 − 10 = **28** |

El error entre la primera y la tercera es de 3 unidades; entre la segunda y la tercera, 4. Pequeño en una categoría, grande si se repite en 45.

---

## 3. Pronóstico con pocos datos (el caso de CAYLA)

### 3.1 Lo que hace la industria cuando no hay historia de la prenda

| Enfoque | Qué hace | Fuente | Estado |
|---|---|---|---|
| **Comparables / análogos** | Busca productos parecidos (atributos, imagen, precio, rol en la colección), usa sus primeras semanas o sus 3 mejores, combina varios. El stock se manda en tandas porque esto es menos exacto que vender de verdad. | Nextail primer envío: https://help.nextail.co/en/legacy/first-allocation-algorithm-part-i-forecast | VERIFICADO |
| **«Like items» con aprobación** | El sistema recomienda hasta 3 ítems parecidos con su porcentaje de contribución; la persona puede reemplazarlos y aprobar «sistema» o «mi cambio»; hay un factor de ajuste (1,30 = 30 % más que el clon) y un «ritmo base de venta» que se puede cargar a mano. Si no hay selección aprobada, no hay pronóstico. | Oracle Retail Demand Forecasting: https://docs.oracle.com/cd/E12475_01/rdf/pdf/1602/html/output/fc_newitemls.htm | VERIFICADO |
| **Promediar lo parecido** | Los compradores siguen promediando ventas de productos parecidos «por su interpretabilidad»; la herramienta de IBM le agrega explicaciones porque, sin ellas, no confían en el pronóstico. Reportan «porcentajes de error muy altos» en nuevos y que las casas venden bien solo 50–60 % de los SKU. | IBM Research India: https://arxiv.org/abs/2008.07376 | VERIFICADO |
| **Perfil de grupo** | Un ítem estacional sin historia suficiente toma el perfil de su grupo; así se puede usar un modelo estacional con menos de 12 períodos. | PeopleSoft: https://docs.oracle.com/cd/E13228_01/fscm9pbr0/eng/psbooks/sdpl/htm/sdpl07.htm | VERIFICADO |
| **Pronosticar arriba y repartir abajo** | Se pronostica el total y se reparte con proporciones históricas. Ventajas: simple, buen total, útil para datos de conteo bajo. Defectos: pierde el detalle de cada serie, no capta cambios en las proporciones, el pronóstico repartido queda sesgado. | Hyndman, FPP3 (top-down): https://otexts.com/fpp3/single-level.html | VERIFICADO |

### 3.2 Fisher y Raman / Sport Obermeyer (corrección a la premisa)

- El artículo de HBR (1994) dice: primero hay que saber qué se puede y qué no se puede pronosticar bien; luego se hace la cadena rápida y flexible para **postergar la decisión sobre lo más impredecible** hasta tener señales como las primeras ventas. VERIFICADO (resumen del módulo de HBS): https://s3.amazonaws.com/he-product-images/docs/SCM-MatchingSupplyandDemand.pdf
- **El ~20 % no es lo que se compromete al inicio.** Las láminas del MIT sobre el paper de 1996 muestran «Commit 40%» en la línea de tiempo de Sport Obermeyer (y L = 0,4 D en el modelo); la investigación del 10-05 ya anotaba que la práctica real era cerca de la mitad. Un resumen secundario dice que se pidieron pedidos tempranos que representaban **20 % del volumen de la temporada** y que estaban muy correlacionados con los siguientes pedidos. Es decir, el 20 % es lo que se *lee* para reestimar, no lo que se *compromete*. VERIFICADO (láminas): https://live.ocw.mit.edu/courses/15-764-the-theory-of-operations-management-spring-2004/22614753653b00fe85dfde4f6465850b_lec13_li.pdf · SECUNDARIO (20 %): https://qualityinspection.org/better-sales-forecasts-and-more-flexible-supply-chains/
- **La dispersión entre pronosticadores predice el error:** las láminas dicen que la desviación real está bien correlacionada con la desviación estándar predicha (calculada de los estimados del comité). Para CAYLA, el ancho entre «flojo» y «bueno» que escribe el líder es una medida de incertidumbre que ya existe. Y en el caso, el costo de quedarse corto es 3–4 veces el de sobrar (U ≈ 3–4 O). VERIFICADO (láminas).
- El resultado del paper: ganancia ~60 % sobre el sistema informal de la empresa y ~4 veces sobre no responder; es de la propia empresa y de los autores. VERIFICADO (resumen): https://ideas.repec.org/a/inm/oropre/v44y1996i1p87-99.html
- Error de pronóstico previo a la temporada para productos nuevos «entre 50 y 100 %» (atribuido a Fisher y Raman). SECUNDARIO: https://www.jestais.com/?p=1539
- Zara compromete por anticipado solo 15–25 % de la línea de la temporada (cifra que circula, sin fuente primaria abierta). SECUNDARIO.

### 3.3 Cuánta historia hace falta: lo que dicen las fuentes y lo que sale de la matemática

**Reglas publicadas (ninguna es universal):**
- **Estacionalidad:** al menos 2 años de historia para armar un perfil (PeopleSoft, VERIFICADO); Nextail usa los últimos 3 años (VERIFICADO: https://help.nextail.co/en/legacy/parameters-impacting-the-demand-forecast).
- **Curva de talla propia:** Nextail cae a la curva de la familia cuando el producto vendió menos de 200 unidades en 1 año (umbral y período por defecto); el peso del producto es ventas ÷ 200 (80 unidades = 40 %) y el resto lo pone la familia (VERIFICADO: https://help.nextail.co/en/legacy/reorder-algorithms-demand-forecast).
- **Series cortas:** FPP3 dice que no hay un mínimo mágico (el «30» de ARIMA no tiene justificación); lo único exigible es tener más observaciones que parámetros, y en la práctica un modelo con más de uno o dos parámetros da malos pronósticos por error de estimación. VERIFICADO: https://otexts.com/fpp3/long-short-ts.html
- **Ítem parecido sí/no:** en Oracle RDF un ítem solo es «parecido válido» si la densidad de ventas recientes (períodos con venta ÷ períodos) supera un umbral configurable. VERIFICADO.
- **El ruido de Poisson no se puede mejorar:** Blue Yonder muestra que las métricas de error dependen sobre todo de la tasa de venta y del ruido Poisson resultante, y solo en segundo lugar de la calidad del pronóstico; comparar lentos contra rápidos es una trampa. VERIFICADO (resumen): https://arxiv.org/abs/2211.16313

**Matemática que lo vuelve explicable (PROPIO; fórmulas estándar):**

Si una celda (por ejemplo, «categoría × familia de color») vendió *n* unidades con stock disponible, su ritmo se conoce con error relativo ≈ 1/√*n* (1 sigma) y ±1,645/√*n* al 90 %:

| Unidades vendidas en la celda (n) | Error relativo 1σ | Semiancho al 90 % |
|---|---|---|
| 5 | 45 % | 74 % |
| 10 | 32 % | 52 % |
| 25 | 20 % | 33 % |
| 30 | 18 % | 30 % |
| 50 | 14 % | 23 % |
| 100 | 10 % | 16 % |
| 271 | 6 % | 10 % |

Para repartir una categoría entre colores, la participación *p* de un color en *N* unidades tiene error √(p(1−p)/N). Con p = 20 %: N=30 → ±12 puntos al 90 %; N=100 → ±6,6; N=200 → ±4,7. El intervalo de Wilson al 90 % de 6 de 30 es [10,7 %; 34,3 %]; de 20 de 100, [14,2 %; 27,3 %].

La credibilidad actuarial clásica usa la misma cuenta: para fluctuación limitada el estándar de «credibilidad total» es (z/k)² (1,082 reclamos al 90 % con ±5 %; 271 con ±10 %; 31 con ±30 %), y la parcial es √(n/estándar) (SECUNDARIO para el 1.082: lo vi como dato del resumen del buscador, el cálculo sí es mío). El peso tipo Bühlmann Z = n/(n+k), con k = varianza del proceso ÷ varianza entre grupos, es la forma que ya usa tu investigación del 10-05 (VERIFICADO la fórmula original: https://en.wikipedia.org/wiki/Credibility_theory).

### 3.4 Criterio propuesto de «datos suficientes» para ~1 año de datos y 3 sedes (OPINIÓN apoyada en lo anterior)

Un solo semáforo **por categoría y por nivel**, no por pantalla. Se evalúa contra la celda *categoría × familia de color* (y por sede si se quisiera bajar a sede).

**Cuatro candados; para pasar de nivel hay que cumplir los cuatro:**

1. **Dato limpio.** La venta de esa categoría tiene su color y su prenda identificados en ≥ 90 % de las unidades, sostenido 14 días (la regla que Felipe ya fijó el 10-05 para que «el motor hable»). Las ventas «sin registrar» no cuentan hacia el color. Sin esto, el nivel queda en «Sin base» aunque haya volumen.
2. **Volumen con stock.** Unidades vendidas de la celda en los últimos 12 meses **contadas solo en días en que había stock** (si no, un color agotado parece impopular).
3. **Repetición.** Cuántas campañas comparables (mismo tipo de campaña) hay observadas. Con una sola, el techo es «Orientativo» y la pantalla lo dice. Dos años o tres para estacionalidad real (PeopleSoft / Nextail): CAYLA no lo tendrá hasta 2027–2028, y por eso no hay que decir «según la temporada».
4. **Prueba retrospectiva.** Antes de abrir una categoría, el método debe ganarle al ingenuo en un ejercicio hacia atrás: «error de reparto» = la mitad de la suma de |reparto sugerido − reparto real| = el porcentaje de prendas que habrían quedado en el color equivocado. El ingenuo es «igual que la campaña anterior» o «partes iguales». Debe ganarle en 2 de 3 cortes móviles de 8–12 semanas. Es la idea de «valor agregado del pronóstico» (FVA) de Gilliland: un paso que no mejora al ingenuo es desperdicio. REPORTADO (no abrí la fuente; ejemplo citado: Newell Rubbermaid).

| Nivel | Condición | Qué se muestra |
|---|---|---|
| **Sin base** | n < 10, o dato sucio, o sin campaña previa | Ninguna proporción propia. Reparto por defecto (el que ya tiene el catálogo/stock de la categoría, o partes iguales) y la leyenda «aún no hay ventas suficientes; tú decides». |
| **Orientativo** | 10 ≤ n < 30, o solo 1 campaña comparable, o no le gana al ingenuo | Reparto contraído al menos 60 % hacia la categoría; rango amplio (de ±50 % hacia arriba); «basado en N unidades de M campañas». |
| **Útil** | n ≥ 30 (±30 % al 90 %), ≥ 2 campañas y le gana al ingenuo | Reparto con rango ±30 %; el peso de lo propio ≥ 50 %. |
| **Sólido** | n ≥ 100 (±16 %), ≥ 2 campañas, le gana al ingenuo en 2 de 3 cortes | Reparto con rango ±16 %; se puede proponer cantidad exacta redondeada a la tanda. |

**Lo que no se da nunca:** una probabilidad por prenda individual. Las prendas de CAYLA no se repiten (nota de `piso-plan.ts:21` en la investigación del 10-05), así que una prenda no tiene historia propia: lo que se puede decir es «la categoría X pide ~N unidades, esta familia de color ~30–45 %, y estas prendas elegidas se reparten ese total». Es el enfoque de comparables de Nextail y Blue Yonder: se estima por atributos, no por prenda.

**Cuánto falta (orden de magnitud, PROPIO con supuestos explícitos).** Si una tienda vende 1.500 unidades al mes y la mitad está en 3 categorías, las otras 42 venden ~18 al mes cada una; en 6 familias de color son ~3 por celda al mes: 30 unidades en ~10 meses. Eso significa que **la mayoría de las celdas de color seguirán «Orientativas» durante el primer año**; solo las categorías grandes llegan a «Útil». La pantalla puede decirlo y mostrar un avance: «faltan ~X ventas con color registrado para pasar a Útil» = (30 − n) ÷ ritmo mensual de la celda. (El dato de 332 unidades en 6 días con 82 % sin registrar, del 5-oct, viene de la investigación previa; los demás números son supuestos míos, no datos.)

### 3.5 Qué mostrarle mientras no hay datos (con respaldo)

- **Rango en números, no solo una advertencia en palabras.** En cinco experimentos (n = 5.780), comunicar la incertidumbre bajó poco la confianza, y menos cuando era un rango numérico que cuando era una frase. VERIFICADO: https://wintoncentre.maths.cam.ac.uk/news/being-upfront-about-your-uncertainty-doesnt-necessarily-mean-you-lose-your-audiences-trust-new-paper-published
- **Etiqueta categórica (alto / medio / bajo) con la acción que corresponde a cada nivel**, y mostrar confianza solo si cambia la decisión; los números demasiado finos confunden; probar el formato con usuarios; decir cuándo faltan datos y la persona debe usar su criterio. VERIFICADO (guía de Google PAIR): https://pair.withgoogle.com/chapter/explainability-trust/
- **«Basado en N unidades»** (alcance del dato) es lo que PAIR llama revelar fuentes y alcance. VERIFICADO.
- **Redondear al múltiplo de compra:** un «37,4» es precisión falsa (OPINIÓN; sigue a PAIR).
- **Texto sugerido para el aviso (OPINIÓN):** «Estos números son una guía, no una predicción: se apoyan en 14 ventas. Con menos de 30 ventas por color pueden moverse mucho. Cambia lo que quieras: el sistema guarda tu cambio para aprender de él.»

---

## 4. Curvas de talla y de color

### 4.1 Talla (lo que dicen las fuentes)

- **Curva = proporción de cada talla sobre las ventas del producto** y se aplica al total pronosticado; Nextail la usa por defecto con el último año de ventas y la mezcla con la familia cuando el producto vendió menos de 200 unidades (peso = ventas ÷ 200, y cae a producto → familia → distribución normal). VERIFICADO.
- **Las tallas que no importan para detectar un quiebre:** Nextail considera solo las tallas que juntas suman más del 80 % del volumen para decidir si un producto está agotado; una talla extrema no lo marca. VERIFICADO.
- **Contar solo con stock:** el cálculo correcto usa los días en que cada talla estuvo disponible (guía de Inventory Planner). SECUNDARIO (guía genérica): https://www.inventory-planner.com/size-curve-forecasting/
- **Con poca oferta por tienda, no se puede estimar la demanda por talla con las ventas** (muy pocas ventas, o demasiada demanda perdida sin registrar). El «Top-Dog Index» ajusta la distribución de tallas de cada tienda mirando cuáles fueron las más escasas y las más sobrantes; en un estudio ciego el grupo de prueba tuvo casi un punto porcentual más de rendimiento bruto. VERIFICADO (resumen): https://arxiv.org/abs/0804.1412
- **Mínimo de exhibición por talla y tienda** como parámetro del plan (Nextail). VERIFICADO.
- **Tallas «clave» de Zara:** ya cubierto en la investigación del 10-05.

### 4.2 Color: no hay método publicado, hay una práctica

- Oracle AP deja que el comprador decida «cuántos colores y qué corrida de color (básico, básico de temporada, tendencia)» lleva cada estilo, y arranca la mezcla desde la del año anterior. VERIFICADO.
- Una guía de planificación de gama sugiere revisar el porcentaje de colores clásicos contra colores de moda, y usar las partes de arriba como vehículo del color. SECUNDARIO: https://www.fashioncapital.co.uk/tools/range-plan/
- No encontré cifras de «razón típica básico/moda» ni un método que pronostique el color con la historia de participación. **Lo más sólido que hay es el reparto arriba-abajo con proporciones históricas (FPP3), útil para conteos bajos pero sesgado** (§3.1), y el encogimiento hacia la categoría.

### 4.3 Propuesta para el reparto por color con poco dato (OPINIÓN; nadie publica el *k*)

participación del color = (n_color + k × participación_de_referencia) ÷ (N_categoría + k), con la referencia = la participación de esa familia de color en el stock/catálogo de la categoría (o en todo el negocio), y *k* entre 20 y 40 como punto de partida; con *k* = 20, 10 unidades pesan 33 %, 20 pesan 50 %, 80 pesan 80 %. Es la misma forma n/(n+k) que ya usa el repo; el valor de *k* se calibra con la prueba retrospectiva del §3.4, no se inventa. Alternativa más simple, la de Nextail: peso lineal = n ÷ umbral (hasta 1).

### 4.4 Mínimos (MOQ, múltiplos)

- **Para una fábrica ajena**, el mínimo suele ser por estilo, por color y a veces por talla (ej. 300 por estilo, 100 por color, 20 por talla); la tela exige además un mínimo de metros y de lote de teñido. SECUNDARIO (blogs de fábricas y plataformas; las cifras son referenciales): https://brydenapparel.com/?p=20264 · https://sourcify.com/blog/apparel-manufacturing-moqs/
- **Lo que no sé:** el mínimo real del Taller de CAYLA (rollo de tela por color, lote de corte, múltiplos) no está en ninguna fuente web; hay que preguntarlo al Taller y guardarlo como dato del plan.
- **Cómo lo tratan las herramientas:** el mínimo de orden entra a la decisión de profundidad por estilo (IBM), y Nextail lo maneja como «mínimo de exhibición» que se suma a la cantidad recomendada.

---

## 5. Plan corregido por presupuesto

### 5.1 Con qué criterio se recorta o se sube

- **Lo que hacen las herramientas:** RELEX avisa del sobregasto y ofrece dos caminos: ajustar las cantidades de las órdenes nuevas o revisar el presupuesto de la categoría; si hay atraso, retrasar órdenes o reasignar fondos de otra categoría. VERIFICADO: https://www.relexsolutions.com/resources/open-to-buy/
- **Criterios de manual:** GMROI (margen bruto ÷ inventario promedio al costo) para comparar productos con distinto margen y rotación; más amplitud y profundidad puede subir ventas y bajar rotación y GMROI; lo básico tiene demanda continua y es más fácil de pronosticar, la moda se vende en una ventana corta y se vuelve obsoleta rápido, por lo que ahí está el mayor riesgo de rebaja. SECUNDARIO (apuntes de curso y diapositivas; son criterios de manual, no estudios).
- **La matemática exacta cuando el presupuesto aprieta** (vendedor de diarios con varios productos y un presupuesto): si el presupuesto no es la restricción, la solución sin límite sirve; si lo es, Hadley y Whitin (1963) usan un multiplicador de Lagrange λ ≥ 0 y cada producto *i* se compra hasta el cuantil de razón (p_i − v_i − λ·s_i + B_i) ÷ (p_i − g_i + B_i), donde s_i es lo que consume del recurso (aquí, su costo v_i). VERIFICADO (capítulo de Turken et al., ec. 1.10): https://ceibs.edu/sites/portal.prod1.dpmgr.ceibs.edu/files/2012%20Book%20Chapter%20Multi-product%20Newsvendor.pdf
  - Con s_i = v_i la cuenta equivale a subir el costo de cada línea por el mismo (1+λ): **todas las líneas reducen su razón crítica por el mismo precio del sol, y las que rinden menos por sol invertido se recortan primero.** No es un recorte proporcional. (Derivación mía a partir de la ecuación; el capítulo no la escribe así.)
  - El mismo capítulo avisa: con cantidades óptimas muy chicas, redondear a enteros se aleja del óptimo (para pocas unidades, mejor un procedimiento de pasos que la fórmula continua).
- **Ejemplo ilustrativo (PROPIO; números inventados, tres categorías con escenarios 25/50/25 %):** plan sin tope = 140 + 60 + 30 unidades, costo 8.500, utilidad esperada 6.050. Con 70 % del presupuesto (5.950): recorte proporcional → 98 + 42 + 21, utilidad esperada 5.070; asignando cada sol a la unidad con mayor utilidad esperada marginal por sol → 102 + 60 + 12, utilidad esperada 5.278 (+4 %). La diferencia es modesta en este ejemplo, y depende por completo de los escenarios que escribió el líder. **Lo que sí cambia es qué se corta y por qué: se puede decirlo en una línea por categoría.**
- **Reserva para tandas:** el ejemplo de India (§1.2) aparta 20 % del presupuesto para reponer en temporada (VERIFICADO, una sola empresa); el plan corregido puede mostrar «compra ahora» y «reserva para repetir lo que se venda».
- **Sin datos de confianza, el recorte debería ir primero a las líneas con baja confianza y alto costo** (OPINIÓN): es donde el error de pronóstico es mayor (§3.3) y donde la regla de Fisher y Raman manda postergar la decisión.

### 5.2 Cómo muestran «plan actual vs plan corregido» y si se acepta o se rechaza

- **Toolio:** en el menú de Escenarios se activa «mostrar otros escenarios» y se elige con cuál comparar; las métricas y variantes del escenario aparecen en la misma grilla, sin correr conciliación. VERIFICADO: https://roadmap.toolio.com/changelog/compare-multi-plan-scenarios-without-reconciliation. Según el resumen del buscador de una actualización de diciembre 2025 (REPORTADO, no abrí la página), los escenarios pueden ser públicos o privados y se pueden bloquear, renombrar y borrar.
- **Oracle MFP:** versiones con nombre: Working Plan (editable), Target (lo que fija un rol superior), Waiting for Approval (solo lectura), Original Plan y Current Plan (aprobados). Si el de arriba rechaza, el Working Plan no se promueve; solo el plan de abajo-arriba aprobado se vuelve oficial. VERIFICADO: https://docs.oracle.com/cd/E12477_01/merchfinplan/pdf/141/html/rug-cc/introduction.htm
- **Anaplan:** «las versiones permiten comparar escenarios en un modelo»; vienen dos por defecto, Real y Pronóstico. VERIFICADO (poco): https://help.anaplan.com/6d742812-f1c7-4296-a504-651b1c8086f3
- **Blue Yonder / Nextail:** el sistema entrega «plan recomendado» y la persona actúa sobre las excepciones; sin una pantalla de «aceptar o rechazar plan corregido» documentada.

### 5.3 Historial de versiones y volver atrás

- **Google Sheets:** historial con versiones nombradas (hasta 15), botón de restaurar; **restaurar borra el historial fino de ediciones anteriores a la restauración**, y la ayuda recomienda hacer una copia en vez de restaurar si se quiere conservarlo. VERIFICADO: https://support.google.com/docs/answer/190843 → lección: volver atrás debería **crear una versión nueva copiando la vieja**, nunca pisar.
- **Toolio:** el centro de ayuda dice que los escenarios sirven para planear varios a la vez y para «sacar foto» de planes viejos y consultarlos después (resumen del buscador; REPORTADO). No encontré documentación de restaurar.
- **Oracle:** las versiones aprobadas (Original, Current) son fotos que no se editan; lo editable es el Working Plan.
- **Para CAYLA (OPINIÓN):** versiones inmutables con quién, cuándo y por qué; el plan «vigente» es un puntero a una versión; «corregido por presupuesto» es una versión propuesta con su relación a la vigente; restaurar = crear una versión nueva a partir de otra. Es lo que Oracle llama versiones y Toolio escenarios, sin necesidad de importarlos completos.

---

## 6. Errores clásicos con usuarios no técnicos y cómo los evitan los mejores

| Error | Evidencia | Qué hacen mejor |
|---|---|---|
| **Precisión falsa** (un solo número, con decimales) | El error previo a temporada para ítems nuevos va de 50 a 100 % (SECUNDARIO); IBM habla de «porcentajes de error muy altos» (VERIFICADO); Google PAIR: números demasiado finos confunden | Rango + etiqueta + redondeo a la tanda (§3.5) |
| **Caja negra** | Los compradores siguen promediando lo parecido por su interpretabilidad; sin explicación no confían (IBM, VERIFICADO). En su evaluación, a diseñadores y compradores les inspiró más confianza la explicación «por qué» que el «qué pasaría si». | Cada propuesta dice su porqué en una línea, con los comparables a la vista (Nextail, Oracle RDF) |
| **Sobreconfianza por un puntaje alto** | PAIR avisa contra puntajes de confianza que llevan a aceptar sin pensar | Mostrar siempre el rango y de cuántos datos sale; equilibrar con «tú decides» |
| **No poder tocarlo** | Dietvorst et al.: la gente usa mucho más un algoritmo imperfecto si puede modificarlo, **aunque solo pueda modificarlo un poco** (su decisión es insensible al tamaño del ajuste permitido), y queda más satisfecha y tolera más sus errores. VERIFICADO (versión de trabajo): https://marketing.wharton.upenn.edu/wp-content/uploads/2020/07/Dietvorst-Overcoming-Algorithm-Aversion.pdf | Cantidad propuesta editable, siempre |
| **Pero el ajuste humano no siempre mejora** | Fildes et al. 2009, más de 60.000 pronósticos de cuatro empresas: en promedio los ajustes ayudaron en 3 de 4, **los chicos a menudo dañaron la exactitud, los al alza ayudaron mucho menos que los a la baja y se hicieron en la dirección equivocada más seguido (sesgo de optimismo).** VERIFICADO (resumen): https://eprints.lancs.ac.uk/id/eprint/45487/ | Guardar la propuesta y el cambio; avisar «estás subiendo 40 % sobre la sugerencia»; medir después quién acertó (el «pedido del encargado» ponderado de Zara) |
| **Juzgar el pronóstico de lo lento contra lo rápido** | Blue Yonder: la métrica refleja sobre todo el ritmo de venta y el ruido Poisson (VERIFICADO) | Mostrar la exactitud por tramo de volumen, no un solo porcentaje global |
| **Algoritmo sobre stock falso** | Lightspeed y DeHoratius–Raman (§2.2) | Primero cuadrar el stock; el plan lo dice si el inventario inicial no se contó recientemente |
| **Comprar software antes de tener disciplina de datos** | Topitop compró una suite de asignación (investigación del 10-05) | Abrir cada nivel con un criterio medible (§3.4) |

---

## 7. Qué no encontré o es débil

- **Toolio, Anaplan, Board, Lectra:** sin detalle de cómo bajan de categoría a estilo/color (Toolio: el centro de ayuda dio 401; Anaplan/Board/Lectra: solo folletos). Oracle, Blue Yonder y Nextail son la evidencia de verdad.
- **Oracle MFP en temporada (definición de OTB como recepciones planeadas − órdenes abiertas):** solo resumen del buscador.
- **Fisher y Raman 1996 y el HBR de 1994** están detrás de pago o del navegador sin texto: lo del 20 %, el 40 % y el «U ≈ 3–4 O» salen de láminas del MIT y blogs. El «15–25 % de Zara» es SECUNDARIO. El detalle de «la dispersión del comité predice el error» lo vi solo como una línea de láminas.
- **Ningún mínimo universal de historia.** Los umbrales (2 años, 3 años, 200 unidades al año) son de productos comerciales; los de mi §3.4 (10, 30, 100 unidades) salen de la estadística de conteos y son una propuesta, no una norma publicada.
- **Valor de *k* del encogimiento:** nadie lo publica.
- **Sell-through típico por tipo de prenda:** no encontré una cifra de fuente confiable (IBM dice que solo se vende bien el 50–60 % de los SKU).
- **MOQ:** solo blogs de fábricas y plataformas.
- **FVA (valor agregado del pronóstico):** lo vi por resúmenes del buscador; no abrí el artículo.
- **Cifras de CAYLA:** salen de la investigación del 10-05 (332 unidades, 82 % sin registrar), que es del 5 de octubre; hoy puede ser distinto.

---

## 8. Objeción y lo que no pidió (para el director del proyecto)

**Objeción.** «Probabilidades por prenda y color con ventas de campañas anteriores» promete más de lo que los datos pueden decir: no hay historia por prenda (no se repiten) y por color la mayoría de las celdas tendrá menos de 30 ventas durante el primer año. La estructura correcta es «cantidad de la categoría (juicio del líder + escenarios) → reparto sugerido por familia de color con rango y etiqueta de confianza → prendas elegidas por el líder que se reparten ese total». La palabra «probabilidad» invita a leer un 37 % como un 37 %; «reparto sugerido, entre 25 y 45 %» no.

**Lo que no pidió.** Desde el primer día hay que **guardar, por cada propuesta del sistema, lo que el usuario cambió y lo que terminó pasando**, aunque el Paso 2 todavía diga «Orientativo»: esa tabla es la que permite medir si el método le gana al ingenuo (candado 4 del §3.4) y la única forma de llegar a «Útil» con evidencia. Si no se registra desde ahora, el dato de este primer año no existe cuando se necesite.

---

## 9. Fuentes (qué se leyó y cómo)

**Leído (texto abierto o resumen de la fuente primaria):**
- Oracle MFP, roles y versiones: https://docs.oracle.com/cd/E12477_01/merchfinplan/pdf/141/html/rug-cc/introduction.htm
- Oracle Assortment Planning (introducción, buying plan, wedge): https://docs.oracle.com/cd/E75762_01/assortplan/pdf/1411/html/ug/ap-ug-introduction.htm · …/ap-ug-buying-plan.htm · https://docs.oracle.com/cd/E75975_01/pdf/190/html/apofsl/user_guide/output/build_wedge.htm
- Oracle Retail Demand Forecasting, ítems nuevos: https://docs.oracle.com/cd/E12475_01/rdf/pdf/1602/html/output/fc_newitemls.htm
- PeopleSoft, perfiles de estacionalidad: https://docs.oracle.com/cd/E13228_01/fscm9pbr0/eng/psbooks/sdpl/htm/sdpl07.htm
- Blue Yonder MFP y asignación inteligente: https://info.blueyonder.com/retail-planning-category-management/what-is-merchandise-financial-planning · …/what-is-blue-yonder-intelligent-allocation
- Toolio: https://toolio.com/in-season-pre-season-planning · https://roadmap.toolio.com/changelog/compare-multi-plan-scenarios-without-reconciliation
- RELEX: https://www.relexsolutions.com/resources/open-to-buy/ · https://www.relexsolutions.com/resources/mastering-seasonal-planning/
- Nextail: https://help.nextail.co/en/legacy/first-allocation-algorithm-part-i-forecast · https://help.nextail.co/en/legacy/parameters-impacting-the-demand-forecast · https://help.nextail.co/en/legacy/reorder-algorithms-demand-forecast · https://help.nextail.co/en/how-do-you-calculate-the-coverage-in-weeks
- LS Central: https://help.lscentral.lsretail.com/Content/LS-Retail/Replenishment/Stock-Coverage/Stock-Coverage.htm
- Lightspeed (OTB): https://www.lightspeedhq.com/blog/open-to-buy-in-retail/
- Shopify (estados de inventario): https://help.shopify.com/en/manual/products/inventory/managing-inventory-quantities/inventory-states
- Hyndman, FPP3: https://otexts.com/fpp3/long-short-ts.html · https://otexts.com/fpp3/single-level.html
- IBM Research India (texto completo): https://arxiv.org/abs/2008.07376 (PDF leído)
- Myntra, KDD 2019 (introducción): https://arxiv.org/abs/1907.01960
- Fisher y Raman: https://ideas.repec.org/a/inm/oropre/v44y1996i1p87-99.html · láminas MIT 15.764 (texto extraído del PDF) · módulo HBS https://s3.amazonaws.com/he-product-images/docs/SCM-MatchingSupplyandDemand.pdf
- Turken et al., newsvendor multiproducto (texto extraído): https://ceibs.edu/sites/portal.prod1.dpmgr.ceibs.edu/files/2012%20Book%20Chapter%20Multi-product%20Newsvendor.pdf
- Dietvorst, Simmons y Massey (texto extraído de la versión de trabajo): https://marketing.wharton.upenn.edu/wp-content/uploads/2020/07/Dietvorst-Overcoming-Algorithm-Aversion.pdf
- Fildes, Goodwin, Lawrence y Nikolopoulos 2009 (resumen): https://eprints.lancs.ac.uk/id/eprint/45487/
- Google PAIR: https://pair.withgoogle.com/chapter/explainability-trust/ · Winton Centre: https://wintoncentre.maths.cam.ac.uk/news/being-upfront-about-your-uncertainty-doesnt-necessarily-mean-you-lose-your-audiences-trust-new-paper-published
- Tichy et al. (Blue Yonder), ruido Poisson: https://arxiv.org/abs/2211.16313 · Top-Dog Index: https://arxiv.org/abs/0804.1412
- Credibilidad (Bühlmann): https://en.wikipedia.org/wiki/Credibility_theory
- Google Sheets, historial: https://support.google.com/docs/answer/190843 · Anaplan: https://help.anaplan.com/6d742812-f1c7-4296-a504-651b1c8086f3

**Solo resumen del buscador, no abrí la página (REPORTADO):** Oracle MFP en temporada (OTB); Toolio centro de ayuda (escenarios para fotos de planes viejos; 401); documentación de Shopify para desarrolladores (estados dañado, control de calidad, reservado); Gilliland FVA (Newell Rubbermaid); credibilidad de fluctuación limitada (1.082).

**Secundario:** https://qualityinspection.org/better-sales-forecasts-and-more-flexible-supply-chains/ · https://www.jestais.com/?p=1539 · https://www.inventory-planner.com/size-curve-forecasting/ · https://brydenapparel.com/?p=20264 · https://sourcify.com/blog/apparel-manufacturing-moqs/ · https://www.fashioncapital.co.uk/tools/range-plan/ · cursos de merchandising (stock básico, PVM, GMROI).

**Cálculos propios:** tablas de Poisson/Wilson/credibilidad (§3.3), ejemplo de necesidad neta (§2.3) y ejemplo de presupuesto (§5.1), hechos con scripts en el scratchpad de la sesión (`calc/precision.py`, `calc/budget.py`); los números del ejemplo son inventados.
