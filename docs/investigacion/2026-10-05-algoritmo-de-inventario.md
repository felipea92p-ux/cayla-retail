# ¿Necesita CAYLA un «algoritmo de inventario»? (2026-10-05)

Pregunta de Felipe: si conviene crear un algoritmo que entienda el negocio a fondo y haga
recomendaciones más acertadas, para tienda y atención al cliente y para compras; qué hacen las
empresas que ya lo tienen y dónde sería útil en este sistema.

**Respuesta corta:** sí, pero no un algoritmo nuevo ni con IA. CAYLA ya tiene **seis piezas de
lógica de decisión** repartidas en el código, cada una con su propia vara, y dos de ellas no las
usa ninguna pantalla. Lo que falta es **un solo motor de demanda** (una cifra de «cuánto pide el
cliente», corregida y agrupada) que alimente esas decisiones. Y antes de eso falta lo que todas las
empresas serias pusieron primero: **datos que digan la verdad**. Hoy el motor no tendría con qué
trabajar (ver §1).

Fuentes: datos de producción consultados en vivo (solo lectura, 2026-10-05), mapa del código
(`apps/web/lib`, migraciones, ADR) e investigación externa con enlaces (§3).

---

## 1. Lo que dicen los datos hoy (producción, 2026-10-05)

| Dato | Valor | Lo que significa |
|---|---|---|
| Días con ventas en el ERP | 6 (desde el 30-sep) | No hay ni una temporada, ni una campaña, ni un diciembre |
| Unidades vendidas | 332 | — |
| …de esas, «venta sin registrar» (no se sabe qué prenda fue) | 273 (82 %) | La demanda por prenda y talla todavía no existe |
| Variantes con venta identificada | 57 de 890; 53 vendieron **1** unidad | Mediana: 1 venta por variante |
| Compras registradas | 0 | Todo el stock entró por la carga inicial |
| Stock por tienda | TRU 1.034 · AQP 13 · LIM 1 | Solo TRU está censada |
| Ventas con cliente identificado | 15 de 187 | El club recién empieza |

**La tendencia es buena en TRU:** la venta identificada pasó de 29 % (2-oct) a 32 %, 40 % y 54 %
(5-oct). AQP sigue en 0 % porque no tiene su stock cargado.

**Consecuencia:** cualquier pronóstico construido hoy aprendería ruido. Con 1 venta por variante
no se puede predecir una variante. Esto no es un problema de algoritmo; es la etapa en la que está
el negocio.

---

## 2. Lo que ya existe en el sistema

| Pieza | Dónde | Qué decide | Estado |
|---|---|---|---|
| Motor del piso | `apps/web/lib/piso-plan.ts:338` (`planDelPiso`) | Qué colgar hoy: 1 por talla central o vendida en 14 días | En producción desde el 5-oct |
| Frescura del piso | `lib/frescura-reglas.ts`, ADR-0208 | Cuánto tarda en venderse cada categoría por sede (Kaplan-Meier); qué está envejecida; «Ya decidí» y si funcionó | En producción |
| Velocidad, cobertura y sell-through | `lib/resumen-reglas.ts:179,223,275` | Velocidad **sobre días con stock** (sí corrige los quiebres) | En producción (Análisis) |
| Reposición con cantidades y «cuánto puede ceder cada sede» | `lib/resumen-reglas.ts:515` (`planDeReposicion`), `:407` (`cedibleDe`) | Objetivo = velocidad × 14 + reserva; cascada: bajar, trasladar, Taller | **Huérfano:** ninguna pantalla lo llama |
| Señal para el Taller: «Se vendió rápido y falta» | `lib/piso-plan.ts:459` | Categoría × talla × color con alcance < 14 días o huecos | **Huérfano** |
| Cantidad sugerida para producir | `lib/produccion-decision-reglas.ts:91` | Ritmo × días objetivo − lo que ya hay | En producción; es la única cantidad sugerida |
| Punto de reorden | `catalogo-v2.ts:296` | Señal «Pedir a proveedor», sin cantidad | En producción |
| Venta perdida | tabla `pedidos_no_atendidos` («no había talla», «se probó y no llevó») | Se anota a mano en Vender | Existe, pero **no alimenta ninguna decisión** |
| Avisos del club | `fn_club_avisos_pendientes` (plan de Dany, D-92 a D-111) | «Rebaja en tu talla», novedades | En producción |

**El problema no es que falte un algoritmo, es que hay varios que no se hablan:**

- La misma pregunta («¿está estancada?») tiene una vara distinta en Piso (14 días), Análisis
  (umbrales 80/15 %) y Frescura (P75 de su categoría).
- El motor del piso **no** corrige los días sin stock; Análisis **sí**.
- La venta perdida que anota la vendedora no cambia ninguna sugerencia.
- Las dos piezas más valiosas para traslados y para el Taller ya están escritas y probadas, pero
  nadie las ve.

**Lo que hoy se decide sin ninguna ayuda del sistema:**

1. Qué comprar, cuánto, con qué curva de tallas y con qué presupuesto por campaña (diciembre
   incluido). R-53 lo pidió y no está construido.
2. Cómo repartir una compra o una producción entre las tiendas.
3. A qué sede trasladar y cuántas.
4. Cuándo rebajar y cuánto.
5. Qué categoría × talla × color le toca producir al Taller.

---

## 3. Qué hacen las empresas que ya lo tienen

Están ordenadas por cuánto le sirven a CAYLA. **[V]** significa verificado en la fuente enlazada.

| Empresa | Qué decide su algoritmo | La idea que sirve a CAYLA | ¿Se transfiere? |
|---|---|---|---|
| **Zara / Inditex** (Caro y Gallien, *Operations Research* 2010 y 2012) [V] | Cuánto enviar de cada talla a cada tienda, dos veces por semana; precio de liquidación | **Talla rota:** si falta una talla central, la prenda sale del piso. **Exposición:** mejor tallas completas en una tienda que pocas unidades en todas. **Liquidación con una elasticidad por grupo, no por prenda** (agrupar le ganó a la granularidad). El pedido del encargado es un dato que se pondera. Resultado medido con grupo de control: +3–4 % de ventas y +6 % en liquidación | Alta (las reglas); nula (el optimizador global) |
| **Shein** (HBS 2023) [V] | Qué estilos escalar | **Probar y repetir:** lote corto, leer las primeras ventas, reordenar solo lo ganador | **Muy alta:** el taller propio de CAYLA es justo lo que lo hace posible |
| **Fisher y Raman** (HBR 1994, *Marketing Science* 2000) [V] | Qué producir primero | Producir primero lo predecible y dejar lo incierto para después de las primeras ventas; las ventas tempranas proyectan el total de la temporada | Alta |
| **Benetton** [V] | Cuándo fijar el color | Postergación: tejer en crudo y teñir tarde | Media: equivale a guardar tela o cortes y decidir talla y color tarde |
| **Nextail** (software de asignación para moda) [V] | Pronóstico por tienda y talla | **Si un producto vendió menos de 200 unidades al año, usa las ventas de su familia.** Corrige los quiebres. Rearma tallas rotas entre tiendas | Alta (las reglas) |
| **Inventory Planner** [V] | Cuánto reponer | Velocidad calculada **excluyendo los días sin stock** | Alta: CAYLA ya lo hace en Análisis |
| **Onebeat / colchones dinámicos TOC** [V] | Cuánto reponer, sin pronóstico | Objetivo por SKU y tienda en tercios (verde, amarillo, rojo); sube 1/3 si pasa mucho tiempo en rojo y baja 1/3 si pasa mucho en verde | Media: solo para lo que se repite (básicos) |
| **Target**; DeHoratius y Raman (*Management Science* 2008) [V] | Detectar quiebres que el sistema no ve | La mitad de los quiebres eran invisibles; el 65 % de los registros de stock eran inexactos. **Primero la verdad del stock** | **Muy alta:** es la lección principal |
| **H&M** (MIT SMR 2020) [V] | Precios de fin de temporada | Algoritmo + humano fue «el doble de bueno» que el algoritmo solo | Alta, como filosofía |
| **Stitch Fix** [V] | Qué ofrecer a cada cliente | El algoritmo propone y la estilista elige; solo se recomienda lo que hay en stock | Media-alta para atención al cliente |
| **Amazon** (pronóstico por cuantiles) [V] | Cuánto tener | Quedarse corto y pasarse no cuestan lo mismo, así que no se pronostica el promedio. Es la misma lógica que el «newsvendor» (§4, Compras) | El concepto sí; la red neuronal no |
| **Topitop** (Gestión 2014) [V] | Compró la suite de asignación de JDA | No hay resultados publicados | **Contraejemplo:** comprar software no arregla datos inexactos |

Enlaces principales: [Zara, reposición](http://web.mit.edu/jgallien/www/ZaraInterfaces2010.pdf) ·
[Zara, liquidación](https://www.anderson.ucla.edu/faculty_pages/felipe.caro/papers/pdf_FC15.pdf) ·
[Shein, HBS](https://www.library.hbs.edu/working-knowledge/how-shein-and-temu-conquered-fast-fashion-and-forged-a-new-business-model) ·
[Nextail](https://help.nextail.co/en/legacy/reorder-algorithms-demand-forecast) ·
[Inventory Planner](https://help.inventory-planner.com/en/articles/2242706-stockouts) ·
[Target](https://tech.target.com/blog/solving-product-availability-with-ai) ·
[DeHoratius y Raman](https://www.hbs.edu/faculty/Pages/item.aspx?num=30461) ·
[H&M, MIT SMR](https://sloanreview.mit.edu/audio/fashion-forecasting-arti-zeighami-on-implementing-ai-at-hm-group/) ·
[Fisher et al., HBR 1994](https://hbr.org/1994/05/making-supply-meet-demand-in-an-uncertain-world) ·
[Pronóstico jerárquico bayesiano para moda](https://www.researchgate.net/publication/302535767_Forecasting_Demand_for_Fashion_GoodsA_Hierarchical_Bayesian_Approach)

**Los patrones que se repiten, de más a menos útil para una marca de 3 tiendas con taller:**

1. Primero la verdad del stock; después el algoritmo.
2. Medir la **demanda**, no la venta: sin stock, un 0 vendido no significa 0 pedido.
3. Probar y repetir con el taller.
4. Pronosticar donde hay datos (categoría) y bajar con proporciones: sede, talla, color.
5. Reglas de talla rota y de exposición en la tienda.
6. El sistema propone, la persona decide y se mide si acertó.

**Lo que no sirve a esta escala:** optimizadores globales, redes neuronales, pronosticar cada
variante, y comprar Nextail o Blue Yonder antes de tener disciplina de datos.

---

## 4. Diseño: un motor de demanda, cuatro capas

Lo técnico lo decidí como arquitecto; las reglas de negocio las decidió Felipe (§6).

```
Capa 0  VERDAD        venta identificada · piso cuadrado · censo de cada sede
           │          (si no se cumple, el motor se calla en esa sede y lo dice)
Capa 1  DEMANDA       por variante × sede × día:
           │            ventas + venta perdida anotada, ÷ días con la talla expuesta
Capa 2  AGRUPACIÓN    lo que se pronostica es categoría × talla × familia de color × sede,
           │          y la prenda pide prestado a su grupo: peso = n / (n + k)
Capa 3  DECISIONES    Piso · Traslados · Taller · Compras · Atención al cliente · Rebajas
Capa 4  CONTROL       propone con su porqué → la persona decide → se mide si acertó
```

**Por qué así:**

- **Capa 2 es la clave.** En CAYLA «los modelos no se repiten» (`piso-plan.ts:21`), así que la
  unidad que sí se repite y se puede predecir es «polo talla M de color tierra en TRU». El motor
  del piso ya trabaja así (`claveAtributo`, `piso-plan.ts:312`); Zara y Nextail hacen lo mismo.
- **Una sola fuente de verdad (principio 4).** La demanda se deriva de `movimientos`, `venta_items`
  y `pedidos_no_atendidos`; no es una tabla editable. Con el volumen de hoy (~1.150 movimientos)
  la puede calcular una función de lectura `fn_demanda_*` sin una tabla de fotos diarias. Si crece,
  se agrega una vista materializada.
- **Todos leen la misma cifra:** el motor del piso, Frescura, Análisis y Producción dejan de tener
  cada uno su vara de «se vende o no se vende».

**Qué gana cada área** (en el orden en que conviene construirlo):

| Área | Recomendación | ¿Hay algo hecho? | Necesita |
|---|---|---|---|
| **Tienda** | **Talla rota:** «a la blusa X en TRU le falta su talla central: complétala desde AQP o retírala del piso» | `esTallaCentral` y `planDelPiso` | Capa 0 en esa sede |
| **Traslados** | Sugerencia con cantidad: «AQP puede ceder 2 M sin quedarse corta; TRU las vende en 6 días». Concentrar tallas completas en una tienda | `planDeReposicion` y `cedibleDe` (huérfanos) | 2 sedes censadas |
| **Taller** | **Probar y repetir:** lote corto; a los 14 días se compara su rapidez con la de su categoría a la misma edad; se repite solo lo ganador, con la curva de tallas que se vendió | Frescura ya mide «vendidas ÷ esperadas a la misma edad»; «Se vendió rápido y falta» (huérfano) | Una producción registrada en el sistema (hoy 0) |
| **Atención al cliente** | «No está tu talla aquí, hay 2 en AQP: ¿te la traemos?» y prendas parecidas en stock; la venta perdida se anota con un toque | «Pedir a otra sede» desde Vender; `pedidos_no_atendidos`; plan de Dany (D-104 «llegó tu talla») | Respetar el plan de Dany: se conversa con Dany, no se rediseña |
| **Compras** | Presupuesto por campaña y categoría (open-to-buy); cuánto comprar con el **cuantil crítico** (margen ÷ (margen + pérdida si sobra)), no con el promedio; curva de tallas de la categoría | Nada (R-53) | **Una temporada completa** de datos limpios |
| **Rebajas** | Una elasticidad por categoría, como Zara; nunca por prenda | Frescura ya sugiere revisar, trasladar o retirar | Historia de al menos una liquidación |

---

## 5. En qué orden, y con qué condición para avanzar

Cada etapa se abre cuando los datos cumplen una condición medible, no por fecha. Es el principio 7
aplicado al dato.

| Etapa | Qué se construye | Se abre cuando… |
|---|---|---|
| **0. La verdad** (ahora) | Un indicador por sede: «¿el motor puede hablar aquí?», con % de venta identificada, piso cuadrado y censo hecho. Cargar AQP y LIM | — |
| **1. Una sola cifra** | `fn_demanda_*` (capa 1) + agrupación (capa 2); piso, Análisis y Frescura leen de ahí; la venta perdida entra a la cifra | La sede tiene ≥ 90 % de venta identificada 14 días seguidos (TRU va en 54 %) |
| **2. Lo huérfano a la vista** | Talla rota en Existencias; traslados sugeridos con cantidad; «Se vendió rápido y falta» en la pantalla del Taller | Etapa 1 + dos sedes con censo |
| **3. Probar y repetir** | Lectura a 14 días de cada lote del Taller contra su categoría; sugerencia de repetir y con qué curva | Primeros lotes producidos y recibidos en el sistema |
| **4. Compras por campaña** | Presupuesto por categoría y cantidad por cuantil crítico | Una temporada completa (P-V u O-I) con datos limpios |
| **5. Rebajas por grupo** | Elasticidad por categoría | Una liquidación registrada |

**Diciembre 2026 llega antes que la etapa 4.** Para esa compra no hay que esperar al motor:
basta una hoja de supuestos explícitos por categoría, con el número de cada uno a la vista, y
después se compara con lo que pasó. Esa comparación es el primer dato de calibración del motor.

---

## 6. Lo que decidió Felipe (2026-10-05)

1. **Una sede habla desde el 90 % de venta identificada, sostenido 14 días seguidos.** Por debajo
   de eso el motor se calla en esa sede y dice por qué («TRU: 54 % identificada; el motor habla
   desde el 90 %»). Al 5-oct TRU está en 54 % y AQP en 0 %.
2. **No hay historia de ventas fuera del ERP.** El motor arranca en cero: no hay un punto de
   partida por categoría que adelante las etapas. Consecuencias:
   - La etapa 4 (compras por campaña) espera una temporada completa de datos limpios. La primera
     posible es Otoño-Invierno 2027.
   - Diciembre 2026 se compra con la hoja de supuestos por categoría de §5, y el resultado real
     de diciembre es el primer dato de calibración.
   - Mientras falten datos, la agrupación por categoría (capa 2) pesa todavía más: es lo único que
     junta suficientes ventas para decir algo.
3. **Deciden los tres: el encargado de sede, la persona de Compras y el líder.** No se codifica un
   rol por tipo de sugerencia. Cada sugerencia vive en el módulo donde está su botón (traslado en
   Traslados, repetir lote en Producción, comprar en Compras), y quien ve ese módulo la acepta o la
   rechaza con motivo (regla de módulos, ADR-0161 y ADR-0306). Toda sugerencia registra quién la
   decidió con `fn_actor_persona_id(true)`, para poder medir después quién acierta: es el «pedido
   del encargado como dato que se pondera» de Zara.

## 7. Trampas que este diseño evita

- **Profecía autocumplida:** lo agotado «no vende» y deja de reponerse. Se evita contando solo los
  días con la talla expuesta y sumando la venta perdida.
- **Sobreajuste:** con 1 venta por variante, una curva propia de la prenda es absurda. Se evita
  con el encogimiento hacia la categoría.
- **Caja negra:** la vendedora no sigue lo que no entiende. Cada sugerencia dice su porqué en una
  línea («vendió 6 en 14 días con stock; le alcanza para 9 días») y se puede rechazar con motivo,
  como el «Ya decidí» de Frescura.
- **Algoritmo sobre stock falso:** sin la capa 0, cualquier sugerencia amplifica el error.
