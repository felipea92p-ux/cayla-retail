# Cómo deciden el mix Zara, Gap, LVMH, Ralph Lauren y similares, y qué matemática aplica a CAYLA

- **Fecha:** 2026-10-05 · **Pedido:** Felipe, antes de construir el mix (actividad 12 de ADR-0328): «investiga cómo lo maneja Zara, LVMH, Ralph Lauren, Gap y similares, busca estudios y aplica las matemáticas y algoritmos».
- **Continúa:** `2026-09-30-espacio-y-mix-por-categoria.md`, `2026-09-30-categorias-relevantes-grandes-marcas.md`, `2026-10-04-mix-inicial-del-piso.md`. No repite lo ya verificado allí.
- **Método:** 5 investigadores web en paralelo (modelos de Zara y fast fashion; mezcla de ventas publicada en 10-K/URD; método práctico de planificación; teoría de espacio y surtido; demanda censurada y pocos datos) y un escéptico que abrió las fuentes e intentó refutar 13 puntos. Las cuentas con cifras de TRU las corrió el orquestador (`mix.py`); el escéptico las revisó.
- **Etiquetas:** VERIFICADO (leído en la fuente primaria) · REPORTADO (resumen o dicho por los autores) · SECUNDARIO (lo cuenta otro) · ANÉCDOTA · PROPIO (cálculo nuestro).

## Resultado en tres líneas

1. **Nadie publica su mix de piso por categoría, y ningún modelo publicado lo decide.** Los modelos de Zara toman el surtido y la capacidad como dato; los de espacio salen de supermercados. Los 10-K de Gap, Ralph Lauren y American Eagle (leídos completos) solo traen marca, canal y región.
2. **Lo que sí se publica sirve para el método, no para fijar un %:** cómo se reparte stock a tiendas, cómo se prueba un modelo nuevo, cómo se corrige la demanda cuando el stock la oculta y qué tan lento se mueve una mezcla de ventas.
3. **Con la elasticidad de espacio medida (0,17, supermercado), afinar el mix vale poco: entre ≈ 0,5 % y ≈ 3 % de ventas, según cuánto de lo observado sea real.** Nadie midió esa elasticidad en ropa. Por eso no se construye un optimizador: se construye una tabla de sensibilidad, las reglas de presentación, y se **empieza a registrar el espacio por categoría y semana**, que es lo único que permitirá medirla con datos propios.

## 1. Qué publican las grandes casas (VERIFICADO salvo nota)

% de **ventas** de toda la empresa (tiendas y online), anual. **No es % de piso**, y ninguna casa publica m² por categoría.

| Casa | Qué desglosa | Cifra |
|---|---|---|
| Gap Inc. FY2025 | Solo marca y canal. Sin mujer/hombre ni categoría | Old Navy 56,3 %, Gap 22,8 %, Banana 12,5 %, Athleta 7,9 % de US$ 15.366 M |
| Ralph Lauren FY2026 | Solo región × canal. Menciona «alto potencial» sin %: mujer, outerwear, bolsos | US$ 8.114,5 M; mujer ≈ 25 % y «core» > 70 % solo en una llamada (SECUNDARIO) |
| LVMH | Por división; Louis Vuitton y Dior no se abren | Moda y Marroquinería 48,8 % (2022), 46,7 % (2025; 2023-25 REPORTADO) |
| Hermès 2025 | Por métier | Cuero 44,2 %, prêt-à-porter y accesorios 28,3 %, seda 6,0 % de €16.002 M |
| Lululemon FY2025 | Género | Mujer 63,0 %, hombre 24,0 %, accesorios y otras 13,0 % |
| Urban Outfitters (solo *Retail*, US$ 5.283 M) | Línea gruesa | Ropa 66 %, hogar 15 %, accesorios 14 % |
| Kohl's, Macy's, Dillard's, Citi Trends, Tilly's, Zumiez | Departamento | Accesorios 14–21 %, ropa de mujer 14–28 % según casa |
| Levi's FY2025 | Género y unidades | Tops 29 % y pantalones 67 % **de unidades**; ver §4 sobre sus cifras |

- **Vestidos y abrigo:** nadie los separa. **Jeans:** solo Levi's (marca de jeans).
- **La mezcla se mueve lento.** Verificadas tres series (las que más se mueven): Lululemon mujer 69,3 → 63,0 en cinco años; Hermès cuero 50,2 / 45,5 / 42,8 / 41,3 / 42,6 / 44,2; Kohl's accesorios + Sephora 11,4 → 21,1 en cuatro años. Sus 14 cambios anuales dan **mediana 1,7 puntos por año**; solo 2 pasaron de 3 (la reapertura tras COVID en Hermès y el despliegue de Sephora en Kohl's). Una cifra de «mediana 0,5 pp sobre 148 cambios» que circuló al principio **no se pudo reproducir** y se descarta.
- **Cómo dicen que deciden (paráfrasis):** reparten a tiendas por historial de ventas, clima, demografía y rotación objetivo (Cato, Item 1); «core» frente a moda sin regla ni porcentaje (Ralph Lauren, LVMH, Gap); reposición en temporada de lo que vende (Lululemon, Abercrombie). Hermès está limitada por oferta: no comparable.
- **Avisos de empleo** (Ralph Lauren, Gap, Louis Vuitton): dicen qué hacen (store clustering, semanas de suministro, curvas de tallas, rebalanceo) y no cómo.

## 2. Los modelos que sí existen

### 2.1 Zara: repartir stock a tiendas (Caro y Gallien 2010, Operations Research 58(2); VERIFICADO)
- **Problema:** cada semana, repartir el stock del almacén por talla entre tiendas. Variables enteras `x_sj` (unidades de la talla `s` a la tienda `j`), sujeto a `Σ_j x_sj ≤ W_s`. Resuelto como programa entero mixto con aproximación lineal por tramos.
- **Regla de exhibición:** las tallas «clave» del centro del rango (p. ej. S-M-L): cuando una se agota, el artículo sale del piso; una talla extrema que falte no lo retira. Cumplimiento medido de forma indirecta: 89 % en ~900 tiendas.
- **Parámetro K:** valor por unidad que se queda en el almacén. Los autores dicen que no tienen método para fijarlo.
- **Resultado:** «+3 % a 4 % de ventas». **Es un piloto de 10 artículos útiles (de 15), medido por los propios autores**; en las métricas crudas la significancia es baja (t = 1,07 y 1,82); solo sale significativa con transformaciones logarítmicas. El 3–4 % sale de una media de 4,1 % menos 0,7 % de error medido en un almacén de control. Las cifras en dólares ($275 M, $310 M, $353 M) no cuadran entre los dos papers de los mismos autores.
- **Qué aplica a 3 tiendas:** la regla de retiro por talla clave y la lógica de K. **No:** el MIP de red (15.000 por semana, 60 personas) ni el pronóstico con pedidos del encargado.

### 2.2 Zara: qué entra y cuánto probar (Caro y Gallien 2007, Management Science 53(2); VERIFICADO)
- Demanda Poisson de tasa γ desconocida con prior Gamma(m, α): media `m/α`, varianza `m/α²`. Si el modelo está en el piso y se venden `n`, `(m, α) → (m + n, α + 1)`; si no está, no cambia.
- **Índice cerrado (eq. 12):** `η = r · ( E[γ] + z_t · V[γ] / √V[n] )`, con `V[n] = E[n]·(α+1)/α`. Entra al piso lo de mayor η. `z_t` sale de `(t−1)·Ψ(z_t) = z_t` (Ψ: función de pérdida normal); con `t` períodos restantes: 0; 0,2760; 0,4363; 0,5492; 0,6360; 0,7065; 0,7658; 0,8168.
- **Resultado (simulación, no datos de Zara; N=30 espacios, 720 candidatos):** brecha contra una **cota dual**, no contra el óptimo: 1,80 % promedio (máx. 4,33 %) con los `z_t` de la tabla; 1,04 % (máx. 2,87 %) con los ajustados por regresión. El voraz promedia 8,4 % y llega a 21 %. Con pocos períodos (< 6) el voraz rinde casi igual.
- **Ejemplo (PROPIO):** media 2 ventas por período y `t = 4`. Producto casi sin historia (m=2, α=1): `η = 2,549·r`. Producto ya visto (m=20, α=10): `η = 2,074·r`. A igual media, el desconocido entra primero a probarse.
- **Supuestos que se rompen:** no modela varias tiendas, asume reposición perfecta y espacio igual por producto.

### 2.3 Zara: envío inicial de un producto nuevo (Gallien et al. 2015, OR 63(2); solo resumen, REPORTADO)
Experimento controlado con 34 artículos en 2012: ventas de temporada +≈ 2 %, unidades sin vender −≈ 4 %. La idea transferible es usar productos comparables como prior. No se pudo abrir el texto: sin fórmula.

### 2.4 Espacio por categoría: el núcleo común y su cierre
Todos los modelos de espacio (Corstjens y Doyle 1981, Bultez y Naert 1988, Borin et al. 1994) parten de `ventas_i = a_i · espacio_i^β_i`. Con `β < 1` el problema es cóncavo.
- **Cierre de Lagrange (PROPIO, verificado numéricamente por el escéptico):** maximizando `Σ a_i · s_i^β` con `Σ s_i = S`, el óptimo es `s_i = (a_i·β/λ)^(1/(1−β))`. Con la misma β en todas: `s_i / S = a_i^(1/(1−β)) / Σ_j a_j^(1/(1−β))`.
- Con β = 0,17 el exponente es 1,20: el óptimo es *más que proporcional* a lo que rinde cada prenda de espacio. Con `β` igual y márgenes iguales, «% de espacio = % de ventas» es solo un paso de un punto fijo.
- **Algoritmo:** con prendas enteras y función cóncava, el voraz por beneficio marginal alcanza el óptimo (resultado clásico; no verificado en una fuente). Con 6 grupos y 600 prendas, el costo es irrelevante.

### 2.5 Experimento real de espacio (Drèze, Hoch y Purk 1994, J. Retailing 70(4); VERIFICADO)
60 tiendas de Dominick's, 8 categorías, 4 semanas de calentamiento y 16 de prueba. Asignar el espacio según el movimiento de cada tienda: **+3,9 % de ventas** (de −2,0 % a +8,4 % según categoría). **Matiz:** cambia facings *entre productos de una misma categoría*, no entre categorías. Su óptimo por tienda predecía +15 %; ellos esperan 4–5 %. Frase útil: donde el espacio es muy justo, pesa más tener el inventario correcto en el piso que el reparto fino. Reorganizar el producto dio efectos de **signo mixto** (−6 % a +8 %), no «+5 a 6 %».

### 2.6 Surtido con elección logit (Talluri y van Ryzin 2004 y sucesores; SECUNDARIO)
`P_j(S) = v_j / (v_0 + Σ_{k∈S} v_k)`; el óptimo es el conjunto de mayor ingreso unitario (los k más atractivos). Responde *qué prendas dentro de una categoría*, no *cuánto piso por categoría*. Falla entre un vestido y una casaca: reparte la demanda perdida en proporción a la cuota.

### 2.7 Demanda censurada (Vulcano, van Ryzin y Ratliff 2012; VERIFICADO el working paper de 2009)
Las ventas no son demanda: lo agotado o no exhibido pierde ventas. EM sobre logit con llegadas Poisson. Su ejemplo (6 productos, 8 semanas, cuota de mercado supuesta de 48 %): 93 ventas observadas esconden 303 demandas de primera elección. **Requisitos que CAYLA no cumple:** conocer la cuota de la sede, variación de disponibilidad entre períodos (un piso colgado casi fijo no la da) y muchos períodos (en su simulación, 50 períodos con 10 productos dejan casi todos los sesgos bajo 10 %; no es un requisito, es un resultado). Con 4 días no es estimable.

### 2.8 Agrupar tiendas (Fisher y Rajaram 2000, Marketing Science 19(3); REPORTADO)
Programa entero de p-medianas con distancia de sobre/sub-stock. El clima explicó más la similitud que el tamaño o la ubicación. Con 3 sedes de 3 climas distintos son 3 grupos de una tienda: no hay nada que agrupar.

### 2.9 Método del oficio (GENÉRICO; sin fórmula publicada por las casas)
- Stock básico y percentage variation: `BOM = stock promedio × ½ × (1 + venta del mes / venta mensual promedio)`; sirve con rotación ≥ 6 al año. Open-to-buy: `compras planeadas = ventas + rebajas + stock final − stock inicial`.
- Curva de tallas: % de ventas por talla **descartando las semanas en que no estaban todas las tallas** (patente Oracle US7257544B2, VERIFICADO). Poca muestra: mezcla `w = n / (n + k)` con la curva de la categoría; nadie publica el `k`.
- **Los «destino 5–10 %, rutina 50–70 %…» que circulan son % del número de categorías**, de un trabajo de conferencia sobre tiendas de conveniencia chinas (VERIFICADO). No existe una fórmula rol → % de espacio.
- Con 20, 60 y 6 m², la restricción que manda es la capacidad y el mínimo de exhibición, no el presupuesto de compra: copiar open-to-buy tal cual optimiza la restricción equivocada.

## 3. Matemática aplicada a CAYLA (TRU, cifras del 4-oct)

Cifras de partida (stock colgado % / venta %): Polos/tops 46/61, Conjuntos 2/8, Shorts 2/5, Bodys 13/5, Chalecos 8/1, Resto 29/20 (**«Resto» es relleno para sumar 100, no dato**). Margen igual en todos (no hay dato). Script: `mix.py` del scratchpad de la sesión.

### 3.1 Cuánto vale reasignar el piso
Con β = 0,17 y el reparto óptimo sin tope: **+3,8 %** de ventas; con β = 0,30, +7,9 %; con 0,50, +18,8 %; con el tope de ±3 puntos por mes, +2,2 %. **El escéptico mostró que esa cifra está inflada:**
- Simulando 4.000 muestras de 98 ventas: si lo observado fuera la verdad, la ganancia realizada es ≈ 3,05 %, no 3,8 %. Si **no hubiera diferencia real**, la ganancia «calculada» promedia ≈ 0,5 % (β = 0,17) y 1,1 % (β = 0,30) solo por ruido.
- «Conjuntos 2 % del stock con 8 % de la venta» es velocidad de rotación (elasticidad cercana a 1 hasta agotar), no elasticidad de espacio de 0,17: el modelo la trata mal.
- Con el tope, todos los grupos tocan el borde: el 2,2 % es el tope, no el modelo.
- La ganancia escala casi entera con β, que viene de supermercado.
- **Lectura honesta:** el mix fino vale entre ≈ 0,5 % y ≈ 3 % de ventas, con una β que nadie midió en ropa. Con β igual en todas las categorías, el óptimo es casi proporcional al margen (+0,01 % en el ejemplo del investigador de teoría); equivocarse en el *orden* de las β cuesta −0,46 %, más que el mejor caso. Por eso el valor está en no dejar sin curva de tallas lo que sí vende («Por colgar», el reloj rápido de ADR-0329) y no en el reparto fino.

### 3.2 El peso de la venta propia: `días ÷ (días + 28)`
- **La forma es correcta:** es el estimador bayesiano empírico `media + τ²/(τ²+σ²)·(X − media)` (Brown 2008, ec. 4.4, VERIFICADO), equivalente a un peso `n/(n + κ)`. Con prior Beta, `κ = p(1−p)/τ² − 1`; Brown trabaja en escala arcoseno, donde `n₀ = 1/(4τ²)`.
- **Defecto 1: cuenta días, no ventas.** Un día de TRU (~24 prendas) no vale lo de un día de AQP (~35). Los «28 días» son ≈ 686 prendas en TRU y ≈ 987 en AQP: dos priors de distinta fuerza sin razón.
- **Defecto 2: el 28 esconde una creencia.** κ = 686 equivale a decir que el mix real de TRU está a **±1,7 puntos (1 σ)** del de la industria. Los datos propios dicen otra cosa: Topitop y Oechsle difieren 11 puntos en polos.
- **Con una dispersión declarada** el peso de la venta propia a los 4 días (n = 98) sería: τ = 10 pts → κ ≈ 18 → **84 %**; τ = 6 → κ ≈ 52 → **65 %**; τ = 3 → κ ≈ 213 → **32 %**. Con n efectiva menor (compras repetidas de una misma cliente, categorías mal puestas): n = 49 da 73 / 48 / 19 %; n = 25 da 58 / 32 / 11 %.
- **Lo que sí justifica ser conservador no es τ, es el sesgo:** 7 de cada 10 ventas de TRU están «sin registrar» con la categoría elegida a mano, y la venta depende de lo que hay colgado. Ruido y sesgo son problemas distintos; la regla de días los mezcla en un solo número.
- **Con 4 días, TRU no se distingue de la industria** (χ² = 5,5 frente a 9,49 crítico): la horquilla honesta de polos es **47–51 %** (regla actual 47,0 %; James-Stein 51,1 %; Bayes empírico por momentos 48,2 %). El 48 % de la propuesta del 4-oct cae dentro: **el primer mix no cambia**.
- **Error muestral:** p = 26 % con n = 98: Wald ±8,7 pts, Wilson [18,3 %; 35,5 %]; con agrupamiento por ticket (efecto de diseño 1,1–1,25), ±9–10 pts.
- **Contraer entre categorías (k ≈ 6–15 grupos), no entre sedes:** con 3 sedes el factor de contracción de James-Stein es nulo (`k − 3 = 0`) y la varianza entre sedes tiene error relativo de 100 %.

### 3.3 El tope de ±3 puntos al mes necesita zona muerta
- Un mes de ventas de TRU (~700 prendas) da un error de **±3,2 puntos al 95 %** para una categoría de 26 %: el tope tiene el tamaño del ruido, así que **por sí solo deja pasar el ruido**.
- Los grandes mueven sus categorías mayores a una **mediana de 1,7 puntos al año** (3 series verificadas). Un tope de 3 puntos *al mes* es un techo 20 veces más suelto que cualquier mezcla publicada.
- **Diseño que sale (la lente de estadística cambió algo no obvio):** el tope sigue, pero el mix solo se mueve cuando la diferencia entre el valor contraído y el actual supera su propio error estándar (zona muerta). Sin eso, el piso baila por azar aunque cada paso respete el tope.

### 3.4 Cobertura (Little): una cifra que no cuadra, por verificar
98 prendas en 4 días son 24,5 por día y ≈ 172 por semana: 600 prendas de piso son **≈ 3,5 semanas**. El ADR-0329 dice «hoy ≈ 7 a 9 semanas». Puede ser el pico de lanzamiento de 4 días, o que la cuenta anterior usó el stock total (con almacén de tienda). Hay que reconciliarlo antes de poner un objetivo de cobertura.

### 3.5 Prueba de modelos nuevos
- Con prior Gamma(2, 2) por modelo y sede (media 1 por semana), tras 2 semanas: un modelo con 4 ventas tiene posterior Gamma(6, 4) (media 1,5; IC 90 % 0,65–2,62); con 0 ventas, Gamma(2, 4) (media 0,5; IC 0,09–1,19). P(A > B) = 0,94, pero P(C > B) con 1 venta contra 0 es 0,69: casi una moneda.
- `CV = 1/√(m + n)`: ±30 % pide ~12 ventas acumuladas; ±20 %, 25; ±10 %, 100. **Un modelo que vende 1 por semana por sede tarda ~10 semanas en llegar a ±30 %.** Dos semanas separan «vuela» de «no se mueve», nada más fino.
- Los bandidos con garantías (MNL-Bandit, 2019) necesitan `T ≫ N`: con 50 modelos y 12 semanas la cota no dice nada.

### 3.6 El mínimo «1 por talla y color» vende poco (modelo de Caro-Gallien 2010, cuenta PROPIA)
3 tallas, demanda 1,8 por semana: con 1 unidad por talla se capturan 0,83 ventas (46 %); con 2 por talla, 1,57; con 3-4-3, 1,78. Apoya la objeción del 4-oct («1 por talla y color» come perchas y vende poco), con el aviso de que es el modelo de un paper aplicado a prendas.

## 4. Correcciones a lo ya escrito

| Dónde | Decía | Correcto |
|---|---|---|
| `2026-10-04-mix-inicial-del-piso.md` (reserva de prueba) | «Sport Obermeyer: producir el 30 % después de ver los primeros pedidos dio casi la mitad del ahorro posible» (VERIFICADO) | El 30 % es un **escenario de sensibilidad** del artículo de Harvard Business Review de 1994; la práctica real era basar «about half» de la producción en pronósticos (≈ 50 % comprometido antes). Unas diapositivas del MIT dicen 40 %. Re-etiquetar: no confirmado en el paper original (Fisher y Raman 1996 no se pudo abrir). |
| Investigaciones del 30-sep y 4-oct (Levi's) | «cambió su definición» | El texto de la definición es **idéntico**; lo que cambió es la **cifra reexpresada** de los mismos años (39 → 35 % en FY2023 y FY2024). Mismo efecto práctico: no sirve para una meta. |
| Investigación del 30-sep | El PDF de Vanderbilt es el capítulo de Kök, Fisher y Vaidyanathan | Según un investigador (REPORTADO), es el capítulo «Category and Inventory Management» de la Wiley Encyclopedia of OR&MS (2010). |
| Esta sesión (mía, en el chat) | «mediana 0,5 pp en 148 cambios» y «+3,8 % de ganancia» | La primera no se reproduce (§1); la segunda es una cota alta (§3.1). |
| Caro-Gallien 2007 | «a menos del 4 % del óptimo» | 1,80 % promedio / 4,33 % máximo contra una **cota dual**, no el óptimo. |
| Eisend 2014 | media 0,17 | VERIFICADO el resumen (1.268 estimaciones). Desmet y Renaudin (0,2138) excluyeron categorías estacionales y las vendidas en pocas tiendas; Corstjens y Doyle 0,086 propia **no verificable**. **Ninguna elasticidad de espacio medida en ropa**: no se pudo probar el negativo, pero no apareció ninguna. |

## 5. Qué cambia en el diseño del mix (propuesta; lo decide Felipe)

**DECIDÍ (propuesta):** el mix de CAYLA se construye como (a) el mix inicial del 4-oct sin cambios, (b) un peso de la venta propia medido en **prendas confirmadas** y no en días, con la dispersión τ declarada como criterio y visible en pantalla, (c) un tope de ±3 puntos al mes **más** una zona muerta de un error estándar, (d) una tabla de sensibilidad con un rango de β en lugar de un optimizador, y (e) registro de espacio por categoría y semana desde ya.
**DESCARTÉ:**
- **Un optimizador de espacio (Lagrange o voraz) como regla**, porque su ganancia (≈ 0,5–3 %) depende de una β de supermercado que nadie midió en ropa, y equivocar el orden de las β cuesta más que el mejor caso con β iguales.
- **El peso `días ÷ (días + 28)`**, porque cuenta días en vez de ventas y esconde la creencia de que TRU y la industria difieren ±1,7 puntos.
- **Corregir la demanda censurada con el EM de Vulcano et al.**, porque pide variación de disponibilidad y ~50 períodos; lo viable hoy es dividir por los días con la curva completa de esa categoría.
- **El mínimo plano de «1 por talla y color»**, porque captura 46 % de la demanda de una prenda de 3 tallas.
**SE ROMPE SI:** se mide la elasticidad de espacio en ropa y resulta ≥ 0,5 (entonces reasignar vale ≈ 19 % y un optimizador sí se justifica); si la categoría mal registrada sigue siendo la mayoría de las ventas de TRU (el peso de lo propio se calcula sobre n confirmada: con 30 ventas confirmadas de 98 y κ = 52, pesa ≈ 37 %); o si una campaña de 3 días duplica una categoría y entra al cálculo sin descontarla.

## 6. Límites
- **Fuentes no abiertas** (403 o paywall): Fisher y Raman 1996 (OR), Bultez y Naert 1988, Corstjens y Doyle 1981, Borin et al. 1994, Desmet y Renaudin 1998 (solo vía una tesis), Eisend 2014 (solo el resumen), Gallien et al. 2015, Baardman et al. 2017, Anupindi et al. 1998 (solo el resumen), Kök y Fisher 2007 (solo el resumen), Hübner y Kuhn 2012 (solo el resumen). Las cifras de esos trabajos son REPORTADO o SECUNDARIO.
- **sec.gov bloqueó al escéptico:** sus verificaciones de los 10-K usaron las copias en texto que dejó el investigador, y recalculó cada cifra. Lululemon se confirmó además por WebFetch.
- **Todo resultado de Zara fue medido por los propios autores con Zara**; no hay réplica independiente.
- Las cuentas sobre TRU usan 4 días de venta, un «Resto» de relleno, margen igual en todos los grupos y una elasticidad de supermercado. Son una cota, no un pronóstico.
- Urban Outfitters: las cifras (66/15/14/5 %) son de *Retail* (US$ 5.283 M), no del total (US$ 6.165 M).
- H&M, Uniqlo y Mango: no hay modelo formal publicado. Shein (100–200 piezas por diseño y reposición en 5 días) es de prensa, sin fuente primaria.

## 7. Fuentes principales (todas con URL en los informes de los investigadores)
- Caro y Gallien 2010 `https://www.anderson.ucla.edu/faculty_pages/felipe.caro/papers/pdf_FC07.pdf` · Caro y Gallien 2007 `…/pdf_FC06.pdf` · Caro et al. 2010, Interfaces `…/pdf_FC12.pdf` · Gallien et al. 2015 `https://ideas.repec.org/a/inm/oropre/v63y2015i2p269-286.html`
- Drèze, Hoch y Purk 1994 `http://davidreiley.com/FieldExperimentsCourse/papers/FullReadingList/DrezeShelfManagement.pdf`
- Brown 2008 `https://arxiv.org/pdf/0803.3697.pdf` · Efron y Morris 1977 `https://www.gwern.net/doc/statistics/bayes/1977-efron.pdf`
- Vulcano, van Ryzin y Ratliff `https://business.columbia.edu/sites/default/files-efs/imce-uploads/CPRM/2009-2-PrimaryDemandEM.pdf`
- Fisher y Vaidyanathan 2014 `https://faculty.wharton.upenn.edu/wp-content/uploads/2014/02/AP_Paper_June2013_unblinded.pdf`
- Patente de curva de tallas `https://patents.google.com/patent/US7257544B2/en` · Roles de categoría `https://www.pomsmeetings.org/ConfProceedings/043/FullPapers/FullPaper_files/043-0050.pdf`
- 10-K (SEC): Gap `…/edgar/data/39911/000162828026018573/gap-20260131.htm` · Ralph Lauren `…/1037038/000162828026037074/rl-20260328.htm` · Lululemon `…/1397187/000139718726000020/lulu-20260201.htm` · Urban `…/912615/000119312526137916/urbn-20260131.htm` · Levi's `…/94845/000009484526000008/lvis-20251130.htm` y `…/94845/000009484525000005/lvis-20241201.htm` · Kohl's, Macy's, Dillard's, Cato, Citi Trends, Tilly's y Zumiez en las URL de los informes.
- Hermès 2025 `https://mfn.se/all/a/hermes/hermes-international-2025-full-year-results-a01f2a5e` · LVMH `https://www.lvmh.com/en/investors/key-figures`
